"use strict";

// Sprint 22C1 — kontrollierter Production-Backfill semantischer Embeddings.
// =============================================================================
// EIN Werkzeug, vier Betriebsarten:
//   * DRY-RUN     (Standard) — liest Production, plant, berichtet. Schreibt
//                 NICHTS, ruft KEIN Modell auf, erwirbt KEIN Lock.
//   * --vermessen — read-only Bestandsaufnahme (JS-exakte Berechtigung nach
//                 dem Datenvertrag + Shadow-Tabellen-Stand), maschinenlesbar.
//   * --pruefen   — read-only Abdeckungs-/Integritätsprüfung gegen die
//                 Abnahmekriterien (Vollständigkeit, Dimension, Werte, Hash,
//                 eine aktive Repräsentation, kein unberechtigtes Objekt).
//   * --echt --freigabe erteilt — der freigabepflichtige Schreiblauf.
//
// SICHERHEITSREGELN (nicht verhandelbar):
//   1. DRY-RUN IST DER STANDARD. Ohne `--echt --freigabe erteilt` gibt es
//      keinen Modellaufruf und keinen Production-Write.
//   2. Vor jedem Schreiblauf läuft das Production-Schreibgate fail-closed
//      (lib/helmut/production-schreibgate.js).
//   3. HARTE OBERGRENZEN (lib/helmut/embedding-backfill.js, fail-closed):
//      ≤ 1 000 Objekte, ≤ 200 000 Tokens, ≤ 0,05 USD, Batch ≤ 50,
//      Parallelität exakt 1. Höhere Werte werden ABGELEHNT, nicht gekappt.
//   4. EIGENES LOCK `semantic_embedding_backfill` mit Ablaufzeit und
//      Erneuerung nach jedem Batch; aktive fremde Sperren (Crawl/
//      Understanding) verhindern den Start.
//   5. Geschrieben wird AUSSCHLIESSLICH in knowledge_object_embeddings
//      (additiv, Migration 20260728). knowledge_objects.embedding
//      (Legacy-Merkmalsvektor), Matching, Briefings bleiben unberührt.
//   6. IDEMPOTENT + WIEDERAUFNEHMBAR: Zustand liegt in der Shadow-Tabelle;
//      ein zweiter identischer Lauf plant 0 Objekte → 0 API-Aufrufe, 0 Writes.
//   7. KEIN Understanding-Pfad, KEIN Understanding-Budget: Embedding-Verbrauch
//      wird getrennt erfasst (input_tokens je Zeile + Laufprotokoll).
//   8. Maschinenlesbares Protokoll je Lauf unter shadow-store/ (gitignored).
//
// SECRETS ausschließlich aus process.env (CLAUDE.md §4.9):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HELMUT_V3_STORE=1,
//   HELMUT_STORAGE_BACKEND=supabase (Schreibgate) sowie für den echten Lauf
//   AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, HELMUT_EMBEDDING_DEPLOYMENT.
//
// Aufrufe:
//   node scripts/embedding-backfill.js                          # Dry-Run, ganzer Bestand
//   node scripts/embedding-backfill.js --vermessen --json
//   node scripts/embedding-backfill.js --nur-testbestand        # Dry-Run, 56er-Canary
//   node scripts/embedding-backfill.js --echt --freigabe erteilt --nur-testbestand
//   node scripts/embedding-backfill.js --echt --freigabe erteilt
//   node scripts/embedding-backfill.js --pruefen --json
//
// Optionen:
//   --max-objekte=N   Objektlimit des Laufs (Default 1000 = harte Grenze)
//   --max-tokens=N    Tokenlimit (Default 200000 = harte Grenze)
//   --max-kosten=X    Kostenlimit USD (Default 0.05 = harte Grenze)
//   --batch=N         Batchgröße (Default 50 = harte Grenze)
//   --ids=a,b         nur diese Wissensobjekt-IDs (Canary/gezielte Läufe)
//   --nur-testbestand die 56 IDs aus scripts/fixtures/embedding-testset-22b.json
//   --ttl-minuten=N   Lock-TTL (Default 10)
//   --json            maschinenlesbare Ausgabe auf stdout
//
// Exit-Codes:
//   0 Erfolg (auch erfolgreicher Leerlauf/Dry-Run) · 1 unerwarteter Fehler
//   2 Argument-/Freigabefehler · 3 harte Grenze verletzt · 4 Schema fehlt
//   5 Lock/fremde Sperre · 6 Schreibgate abgelehnt · 7 Lauf mit Fehlern
//   8 Prüfung (--pruefen) nicht bestanden

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const backfill = require(path.join(root, "lib/helmut/embedding-backfill.js"));
const { RECIPE_VERSION } = require(path.join(root, "lib/helmut/embedding-contract.js"));
const { erzwingeSchreibgate } = require(path.join(root, "lib/helmut/production-schreibgate.js"));

const FIXTURE = path.join(__dirname, "fixtures", "embedding-testset-22b.json");
const PROTOKOLL_VERZEICHNIS = path.join(root, "shadow-store");

const MODELL = process.env.HELMUT_EMBEDDING_MODEL || "text-embedding-3-small";
const DIM = Number(process.env.HELMUT_EMBEDDING_DIM || 256);
const PREIS_PRO_MTOK = Number(process.env.HELMUT_EMBEDDING_PREIS_PRO_MTOK || 0.02);

function parseArgs(argv) {
  const a = {
    echt: false, freigabe: false, vermessen: false, pruefen: false, json: false,
    nurTestbestand: false, ids: null,
    maxObjekte: backfill.HARTE_GRENZEN.maxObjekte,
    maxTokens: backfill.HARTE_GRENZEN.maxTokens,
    maxKosten: backfill.HARTE_GRENZEN.maxKostenUsd,
    batch: backfill.HARTE_GRENZEN.batchGroesse,
    ttlMinuten: 10
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--echt") a.echt = true;
    else if (arg === "--freigabe") { a.freigabe = rest[i + 1] === "erteilt"; i += 1; }
    else if (arg === "--vermessen") a.vermessen = true;
    else if (arg === "--pruefen") a.pruefen = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "--nur-testbestand") a.nurTestbestand = true;
    else {
      const m = /^--([a-z-]+)=(.*)$/.exec(arg);
      if (!m) { console.error(`Unbekanntes Argument: ${arg}`); process.exit(2); }
      const [, name, wert] = m;
      if (name === "max-objekte") a.maxObjekte = Number(wert);
      else if (name === "max-tokens") a.maxTokens = Number(wert);
      else if (name === "max-kosten") a.maxKosten = Number(wert);
      else if (name === "batch") a.batch = Number(wert);
      else if (name === "ttl-minuten") a.ttlMinuten = Number(wert);
      else if (name === "ids") {
        const roh = String(wert || "").split(",").map((x) => x.trim()).filter(Boolean);
        if (!roh.length) {
          console.error("--ids ohne verwertbare Kennung wäre still ein Vollbestand-Lauf — Abbruch.");
          process.exit(2);
        }
        a.ids = [...new Set(roh)];
      } else { console.error(`Unbekanntes Argument: ${arg}`); process.exit(2); }
    }
  }
  return a;
}

function ladeTestbestandIds() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const ids = (fixture.objekte || []).map((o) => o.id).filter(Boolean);
  if (ids.length !== 56) {
    console.error(`Testbestand-Fixture hat ${ids.length} statt 56 Objekte — Abbruch (Fixture prüfen, nicht ändern).`);
    process.exit(2);
  }
  return ids;
}

function schreibeProtokoll(name, daten) {
  fs.mkdirSync(PROTOKOLL_VERZEICHNIS, { recursive: true });
  const pfad = path.join(PROTOKOLL_VERZEICHNIS,
    `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(pfad, JSON.stringify(daten, null, 1));
  return pfad;
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = {
    model: MODELL,
    dim: DIM,
    recipeVersion: RECIPE_VERSION,
    batchGroesse: args.batch,
    maxObjekte: args.maxObjekte,
    maxTokens: args.maxTokens,
    maxKostenUsd: args.maxKosten,
    preisProMTok: PREIS_PRO_MTOK,
    parallelitaet: 1,
    ttlMs: Math.max(1, Math.floor(args.ttlMinuten * 60 * 1000)),
    ids: args.nurTestbestand ? ladeTestbestandIds() : args.ids
  };
  const deps = { env: process.env, log: (z) => { if (!args.json) console.log(z); } };

  // --- Bestandsaufnahme (read-only) ---
  if (args.vermessen) {
    const objekte = await backfill.ladeWissensobjekte(deps, { ids: cfg.ids });
    const tabelleDa = await backfill.shadowTabelleVorhanden(deps);
    const bestand = tabelleDa ? await backfill.ladeShadowBestand(deps, cfg) : null;
    const { zaehlung } = backfill.vermesseBestand(objekte, bestand);
    const ergebnis = {
      modus: "vermessen", zeitpunkt: new Date().toISOString(),
      modell: MODELL, dim: DIM, rezept: RECIPE_VERSION,
      shadowTabelleVorhanden: tabelleDa,
      kostenGeschaetztUsd: backfill.kostenSchaetzung(zaehlung.tokensGeschaetzt, PREIS_PRO_MTOK),
      ...zaehlung
    };
    if (args.json) console.log(JSON.stringify(ergebnis, null, 2));
    else {
      console.log("== Bestandsaufnahme (read-only) ==");
      console.log(`Objekte gesamt: ${ergebnis.alle} · verstanden: ${ergebnis.verstanden} · BERECHTIGT: ${ergebnis.berechtigt}`);
      console.log(`Ausschlüsse: ${JSON.stringify(ergebnis.ausschlussGruende)}`);
      console.log(`geschätzte Tokens: ${ergebnis.tokensGeschaetzt} ≈ ${ergebnis.kostenGeschaetztUsd == null ? "?" : ergebnis.kostenGeschaetztUsd.toFixed(4)} USD`);
      console.log(`Shadow-Tabelle vorhanden: ${tabelleDa}${bestand ? ` · Zeilen (aktive Konfiguration): ${ergebnis.shadowZeilen}` : ""}`);
    }
    return;
  }

  // --- Abdeckungs-/Integritätsprüfung (read-only) ---
  if (args.pruefen) {
    const tabelleDa = await backfill.shadowTabelleVorhanden(deps);
    if (!tabelleDa) {
      console.error("Prüfung nicht möglich: Shadow-Tabelle existiert nicht (Migration nicht angewendet).");
      process.exit(4);
    }
    const objekte = await backfill.ladeWissensobjekte(deps, { ids: cfg.ids });
    const bestand = await backfill.ladeShadowBestand(deps, cfg);
    const befund = backfill.pruefeAbdeckung(objekte, bestand, cfg);
    const pfad = schreibeProtokoll("embedding-pruefung", { cfg: { model: MODELL, dim: DIM, rezept: RECIPE_VERSION }, befund });
    if (args.json) console.log(JSON.stringify(befund, null, 2));
    else {
      console.log("== Abdeckungs-/Integritätsprüfung ==");
      console.log(`berechtigt: ${befund.berechtigt} · mit aktuellem Embedding: ${befund.mitAktuellemEmbedding}`);
      console.log(`fehlt/veraltet: ${befund.fehltOderVeraltet.length} · unberechtigt eingebettet: ${befund.unberechtigtMitAktivemEmbedding.length}`);
      console.log(`Dimensionsfehler: ${befund.dimensionsfehler.length} · Wertfehler: ${befund.wertfehler.length} · Hash-Abweichungen: ${befund.hashAbweichungen.length}`);
      console.log(`fremde Modelle/Rezepte: ${befund.fremdeModelle.length} · fehlgeschlagen: ${befund.fehlgeschlageneZeilen.length} · doppelte Aktive: ${befund.doppelteAktive.length}`);
      console.log(`ERGEBNIS: ${befund.ok ? "BESTANDEN" : "NICHT BESTANDEN"} · Protokoll: ${pfad}`);
    }
    process.exit(befund.ok ? 0 : 8);
  }

  // --- Dry-Run (Standard) ---
  if (!args.echt) {
    const ergebnis = await backfill.fuehreBackfillAus(deps, { ...cfg, dryRun: true });
    if (!ergebnis.ok) {
      console.error(`Dry-Run nicht möglich (${ergebnis.phase}): ${(ergebnis.fehler || []).join("; ")}`);
      process.exit(ergebnis.phase === "grenzen" ? 3 : ergebnis.phase === "schema" ? 4 : 1);
    }
    const b = ergebnis.bericht;
    if (args.json) console.log(JSON.stringify({ modus: "dry-run", tokenLimit: ergebnis.tokenLimit, bericht: b }, null, 2));
    else {
      console.log("== Sprint-22C1-Backfill — Vorschau (Dry-Run, 0 Netz-Writes, 0 Kosten) ==");
      console.log(`Modell: ${MODELL} · Dimension: ${DIM} · Rezept: ${RECIPE_VERSION}`);
      console.log(`geplant: ${b.geplant} · bereits aktuell: ${b.aktuellUebersprungen} · ausgeschlossen: ${b.ausgeschlossen.length} · Versuchsdeckel: ${b.versuchsdeckel.length}`);
      console.log(`Limits abgeschnitten: Objekte ${b.objektlimitAbgeschnitten} · Tokens ${b.tokenlimitAbgeschnitten} (wirksames Tokenlimit ${ergebnis.tokenLimit})`);
      console.log(`Batches: ${b.batches} (Größe ≤ ${cfg.batchGroesse}, Parallelität 1) · geschätzte Tokens: ${b.tokens} ≈ ${b.kostenSchaetzung == null ? "?" : b.kostenSchaetzung.toFixed(4)} USD`);
      console.log("\nEchter Lauf NUR nach Betreiberfreigabe: --echt --freigabe erteilt");
    }
    return;
  }

  // --- Echter Lauf (freigabepflichtig) ---
  if (!args.freigabe) {
    console.error("STOPP: --echt ohne `--freigabe erteilt`. Der Production-Backfill ist freigabepflichtig (Gate 2).");
    process.exit(2);
  }
  erzwingeSchreibgate(process.env, { zweck: "Embedding-Backfill (Sprint 22C1)", exitCode: 6 });

  const ergebnis = await backfill.fuehreBackfillAus(deps, { ...cfg, dryRun: false });
  const protokoll = {
    modus: "echt", zeitpunkt: new Date().toISOString(),
    modell: MODELL, dim: DIM, rezept: RECIPE_VERSION,
    limits: {
      maxObjekte: cfg.maxObjekte, maxTokens: cfg.maxTokens,
      maxKostenUsd: cfg.maxKostenUsd, batchGroesse: cfg.batchGroesse,
      parallelitaet: 1, wirksamesTokenLimit: ergebnis.tokenLimit || null
    },
    idsFilter: cfg.ids ? cfg.ids.length : null,
    phase: ergebnis.phase, ok: ergebnis.ok,
    fehler: ergebnis.fehler || [],
    bericht: ergebnis.bericht,
    schreibZaehler: ergebnis.zaehler || null
  };
  const pfad = schreibeProtokoll("embedding-backfill", protokoll);

  if (!ergebnis.bericht) {
    console.error(`ABBRUCH (${ergebnis.phase}): ${(ergebnis.fehler || []).join("; ")}`);
    console.error(`Protokoll: ${pfad}`);
    process.exit(ergebnis.phase === "grenzen" ? 3
      : ergebnis.phase === "schema" ? 4
        : ergebnis.phase === "lock" || ergebnis.phase === "fremdsperren" ? 5
          : ergebnis.phase === "provider" ? 2 : 1);
  }
  const b = ergebnis.bericht;
  if (args.json) console.log(JSON.stringify(protokoll, null, 2));
  else {
    console.log("== Ergebnis Production-Backfill ==");
    console.log(`berechnet: ${b.berechnet} · fehlgeschlagen: ${b.fehlgeschlagen.length} · übersprungen (aktuell): ${b.aktuellUebersprungen}`);
    console.log(`API-Aufrufe: ${b.apiAufrufe} · Tokens (Schätzung): ${b.tokens} · Tokens (Provider): ${b.tokensProvider == null ? "nicht gemeldet" : b.tokensProvider}`);
    console.log(`Kosten ≈ ${b.kostenSchaetzung == null ? "?" : b.kostenSchaetzung.toFixed(4)} USD · Writes: ${ergebnis.zaehler ? ergebnis.zaehler.geschriebeneZeilen : "?"} Zeilen in ${ergebnis.zaehler ? ergebnis.zaehler.flushes : "?"} Flushes`);
    for (const f of b.fehlgeschlagen) console.log(`  FEHLER ${f.id} → ${f.grund}`);
    if (b.abgebrochen) console.log(`ABGEBROCHEN (${b.abbruchGrund}) — Wiederaufnahme: gleicher Aufruf erneut.`);
    console.log(`Protokoll: ${pfad}`);
    console.log(`\nNachprüfung: node scripts/embedding-backfill.js --pruefen`);
  }
  process.exit(ergebnis.ok ? 0 : 7);
}

main().catch((e) => { console.error(e); process.exit(1); });
