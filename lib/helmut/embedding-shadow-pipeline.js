"use strict";

// Sprint 22B — Offline-Shadow-Pipeline für semantische Wissensobjekt-Embeddings.
//
// SICHERHEITSMODELL (verbindlich, docs/embedding-architektur.md §9):
//  * Diese Pipeline schreibt NIE in eine Datenbank. Ergebnisse landen
//    ausschließlich in einer lokalen, isolierten Ablage (Datei unter
//    shadow-store/, gitignored) über die injizierte Store-Schnittstelle.
//  * Es gibt KEINEN eingebauten Netz-Aufruf: der Embedding-Provider wird als
//    Funktion injiziert. Ohne Provider läuft nur der Dry-Run.
//  * Harte Limits (Objekte, Tokens) sind fail-closed: was über dem Limit
//    liegt, wird nicht angefragt.
//  * Ein Embedding-Fehler beschädigt nie das Wissensobjekt und löst nie eine
//    Understanding-Analyse aus — die Pipeline kennt solche Pfade nicht.
//  * Mandantenneutral: Eingang ist der kanonische Text (ko-kanon-1) aus dem
//    Datenvertrag; kein user_id, kein Mandat, kein Matching-Ergebnis.
//
// Wiederaufnahme/Idempotenz: Der Zustand liegt vollständig in der Ablage
// (input_hash, model, dim, recipe_version, status). Ein zweiter Lauf mit
// gleicher Ablage plant nur die restlichen bzw. veralteten Objekte.

const fs = require("fs");
const path = require("path");
const {
  RECIPE_VERSION,
  buildCanonicalEmbeddingInput,
  computeInputHash,
  isEligibleForEmbedding,
  validateVector,
  isEmbeddingCurrent
} = require("./embedding-contract.js");

// Konservative Tokenabschätzung für deutsche Texte (~4 Zeichen je Token).
function schaetzeTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

// Lokale, isolierte Datei-Ablage (Ersatz für die noch nicht angewendete
// Shadow-Tabelle). Struktur je Eintrag = Datenvertrag der Tabelle.
function createFileStore(dateipfad) {
  let daten = { meta: null, eintraege: {} };
  if (fs.existsSync(dateipfad)) {
    daten = JSON.parse(fs.readFileSync(dateipfad, "utf8"));
    if (!daten.eintraege) daten.eintraege = {};
  }
  return {
    pfad: dateipfad,
    get meta() { return daten.meta; },
    get eintraege() { return daten.eintraege; },
    setMeta(meta) { daten.meta = meta; },
    upsert(id, eintrag) { daten.eintraege[id] = eintrag; },
    speichern() {
      fs.mkdirSync(path.dirname(dateipfad), { recursive: true });
      fs.writeFileSync(dateipfad, JSON.stringify(daten, null, 1));
    }
  };
}

function createMemoryStore(initial = {}) {
  const daten = { meta: null, eintraege: { ...initial } };
  return {
    pfad: null,
    get meta() { return daten.meta; },
    get eintraege() { return daten.eintraege; },
    setMeta(meta) { daten.meta = meta; },
    upsert(id, eintrag) { daten.eintraege[id] = eintrag; },
    speichern() {}
  };
}

const MAX_VERSUCHE_DEFAULT = 3;

// Arbeitsplan: berechtigte Objekte, deren Ablage-Eintrag fehlt oder veraltet
// ist (Hash/Modell/Dimension/Rezept), unter Beachtung von Versuchsdeckel und
// hartem Objektlimit. Deterministische Reihenfolge (Objekt-ID).
function planeLauf(objekte, store, cfg) {
  const erwartet = { model: cfg.model, dim: cfg.dim, recipeVersion: cfg.recipeVersion || RECIPE_VERSION };
  const plan = { berechnen: [], aktuell: [], ausgeschlossen: [], versuchsdeckel: [] };
  const sortiert = [...objekte].filter(Boolean).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const ko of sortiert) {
    const elig = isEligibleForEmbedding(ko);
    if (!elig.eligible) { plan.ausgeschlossen.push({ id: ko && ko.id, grund: elig.reason }); continue; }
    const input = buildCanonicalEmbeddingInput(ko);
    const inputHash = computeInputHash(input.text, input.recipeVersion);
    const eintrag = store.eintraege[ko.id];
    const cur = isEmbeddingCurrent(eintrag, { ...erwartet, inputHash });
    if (cur.current) { plan.aktuell.push({ id: ko.id }); continue; }
    // Versuchsdeckel gilt nur, solange derselbe Eingang fehlschlägt; ein
    // geänderter Input-Hash setzt die Zählung zurück.
    if (eintrag && eintrag.status === "fehlgeschlagen"
      && eintrag.input_hash === inputHash && eintrag.model === cfg.model
      && Number(eintrag.attempt_count || 0) >= (cfg.maxVersuche || MAX_VERSUCHE_DEFAULT)) {
      plan.versuchsdeckel.push({ id: ko.id, versuche: eintrag.attempt_count });
      continue;
    }
    plan.berechnen.push({ id: ko.id, text: input.text, inputHash, tokens: schaetzeTokens(input.text), grund: cur.reason });
  }
  // maxObjekte 0 bedeutet ausdrücklich "nichts berechnen" (fail-closed),
  // nur ein fehlender/ungültiger Wert bedeutet "kein Limit".
  if (Number.isFinite(Number(cfg.maxObjekte)) && Number(cfg.maxObjekte) >= 0) {
    plan.uebriggeblieben = plan.berechnen.slice(Math.floor(cfg.maxObjekte));
    plan.berechnen = plan.berechnen.slice(0, Math.floor(cfg.maxObjekte));
  } else {
    plan.uebriggeblieben = [];
  }
  return plan;
}

// Batches unter hartem Tokenlimit bilden. Das Limit ist fail-closed: das
// erste Objekt, das die Summe überschreiten würde, bleibt (mit allen
// folgenden) außen vor.
function bildeBatches(auftraege, { batchGroesse = 25, maxTokens = Infinity } = {}) {
  const batches = [];
  const abgeschnitten = [];
  let tokensGesamt = 0;
  let aktuellerBatch = [];
  let limitErreicht = false;
  for (const auftrag of auftraege) {
    if (limitErreicht || tokensGesamt + auftrag.tokens > maxTokens) {
      limitErreicht = true;
      abgeschnitten.push(auftrag);
      continue;
    }
    tokensGesamt += auftrag.tokens;
    aktuellerBatch.push(auftrag);
    if (aktuellerBatch.length >= batchGroesse) { batches.push(aktuellerBatch); aktuellerBatch = []; }
  }
  if (aktuellerBatch.length) batches.push(aktuellerBatch);
  return { batches, tokensGesamt, abgeschnitten };
}

function kostenSchaetzung(tokens, preisProMTok) {
  if (!Number.isFinite(Number(preisProMTok))) return null;
  return (tokens / 1e6) * Number(preisProMTok);
}

// Hauptlauf. cfg:
//   model, providerName, dim, recipeVersion?, batchGroesse?, maxObjekte?,
//   maxTokens?, maxVersuche?, preisProMTok?, dryRun?, jetzt? (Zeitquelle)
// provider: async ({ model, dim, inputs: string[] }) => { vectors: number[][] }
async function runShadowPipeline(objekte, store, provider, cfg = {}) {
  if (!cfg.model || !cfg.dim || !cfg.providerName) {
    throw new Error("cfg.model, cfg.dim und cfg.providerName sind Pflicht");
  }
  const jetzt = typeof cfg.jetzt === "function" ? cfg.jetzt : () => new Date().toISOString();
  const plan = planeLauf(objekte, store, cfg);
  const { batches, tokensGesamt, abgeschnitten } = bildeBatches(plan.berechnen, {
    batchGroesse: cfg.batchGroesse, maxTokens: cfg.maxTokens
  });
  const bericht = {
    dryRun: !!cfg.dryRun,
    geplant: plan.berechnen.length,
    aktuellUebersprungen: plan.aktuell.length,
    ausgeschlossen: plan.ausgeschlossen,
    versuchsdeckel: plan.versuchsdeckel,
    objektlimitAbgeschnitten: plan.uebriggeblieben.length,
    tokenlimitAbgeschnitten: abgeschnitten.length,
    batches: batches.length,
    tokens: tokensGesamt,
    kostenSchaetzung: kostenSchaetzung(tokensGesamt, cfg.preisProMTok),
    berechnet: 0,
    fehlgeschlagen: [],
    abgebrochen: false
  };

  if (cfg.dryRun) return bericht; // kein Provider-Aufruf, keine Ablage-Änderung

  if (typeof provider !== "function") {
    throw new Error("Ohne injizierten Provider ist nur der Dry-Run erlaubt");
  }
  store.setMeta({
    model: cfg.model, provider: cfg.providerName, dim: cfg.dim,
    recipe_version: cfg.recipeVersion || RECIPE_VERSION, letzter_lauf: jetzt()
  });

  let providerFehlerInFolge = 0;
  for (const batch of batches) {
    let antwort;
    try {
      antwort = await provider({ model: cfg.model, dim: cfg.dim, inputs: batch.map((a) => a.text) });
    } catch (fehler) {
      // Provider-/Netz-/Timeout-Fehler: Batchobjekte als fehlgeschlagen
      // festhalten (wiederaufnehmbar), nach 2 Fehlbatches in Folge abbrechen.
      for (const auftrag of batch) schreibeFehler(store, auftrag, cfg, jetzt, `provider: ${fehler.message}`);
      bericht.fehlgeschlagen.push(...batch.map((a) => ({ id: a.id, grund: `provider: ${fehler.message}` })));
      providerFehlerInFolge += 1;
      if (providerFehlerInFolge >= 2) { bericht.abgebrochen = true; break; }
      continue;
    }
    providerFehlerInFolge = 0;
    const vektoren = antwort && Array.isArray(antwort.vectors) ? antwort.vectors : null;
    for (let i = 0; i < batch.length; i += 1) {
      const auftrag = batch[i];
      const vektor = vektoren ? vektoren[i] : undefined;
      const pruefung = validateVector(vektor, cfg.dim);
      if (!pruefung.ok) {
        // Ungültige/fehlende Antwort für dieses Objekt: NIE einen beschädigten
        // Vektor speichern — Fehler + Zähler, Rest des Batches läuft weiter.
        schreibeFehler(store, auftrag, cfg, jetzt, `antwort: ${pruefung.reason}`);
        bericht.fehlgeschlagen.push({ id: auftrag.id, grund: `antwort: ${pruefung.reason}` });
        continue;
      }
      const bestand = store.eintraege[auftrag.id];
      store.upsert(auftrag.id, {
        embedding_kind: "semantic_text",
        model: cfg.model,
        provider: cfg.providerName,
        dim: cfg.dim,
        recipe_version: cfg.recipeVersion || RECIPE_VERSION,
        input_hash: auftrag.inputHash,
        vector: vektor.map(Number),
        status: "aktuell",
        last_error: null,
        attempt_count: Number((bestand && bestand.attempt_count) || 0) + 1,
        last_attempt_at: jetzt(),
        created_at: (bestand && bestand.created_at) || jetzt(),
        updated_at: jetzt()
      });
      bericht.berechnet += 1;
    }
    store.speichern(); // nach jedem Batch: Abbruch verliert höchstens einen Batch
  }
  store.speichern();
  return bericht;
}

function schreibeFehler(store, auftrag, cfg, jetzt, grund) {
  const bestand = store.eintraege[auftrag.id];
  store.upsert(auftrag.id, {
    embedding_kind: "semantic_text",
    model: cfg.model,
    provider: cfg.providerName,
    dim: cfg.dim,
    recipe_version: cfg.recipeVersion || RECIPE_VERSION,
    input_hash: auftrag.inputHash,
    // NIE einen alten Vektor unter neuem Hash/Modell weiterführen — ein
    // Fehlschlag hinterlässt ausdrücklich KEINEN nutzbaren Vektor.
    vector: null,
    status: "fehlgeschlagen",
    last_error: String(grund).slice(0, 500),
    attempt_count: Number((bestand && bestand.attempt_count) || 0) + 1,
    last_attempt_at: jetzt(),
    created_at: (bestand && bestand.created_at) || jetzt(),
    updated_at: jetzt()
  });
}

module.exports = {
  schaetzeTokens,
  createFileStore,
  createMemoryStore,
  planeLauf,
  bildeBatches,
  kostenSchaetzung,
  runShadowPipeline,
  MAX_VERSUCHE_DEFAULT
};
