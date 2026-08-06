"use strict";

// Sprint 23C-2A — REIN LESENDE Analyse der unbelegten Matching-Treffer.
//
// FRAGE: Nach der Behebung von Befund M-7 bleibt ein Rest von Ergebniszeilen
// ohne jeden Beleg. Warum? Und was folgt daraus fuer das Produkt?
//
// DIESES SKRIPT SCHREIBT NICHTS. Es fuehrt ausschliesslich Lesezugriffe aus
// (`listMatchingResults`, `listKnowledgeObjectsSeitenweise`, `getProfile`),
// startet KEIN Matching, ruft KEINE KI, veraendert weder Daten noch Flags noch
// Cron noch Budgets. Alle Kennzahlen entstehen offline aus den bereits
// gespeicherten Zeilen durch dieselben reinen Funktionen, die auch der
// Schreibpfad verwendet.
//
// Secrets kommen ausschliesslich aus `process.env` (CLAUDE.md §4.9):
//   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · HELMUT_V3_STORE ·
//   HELMUT_STORAGE_BACKEND (fuer die Profile)
//
// Aufruf:  node scripts/matching-erklaerungsluecke-analyse.js [--json]

const path = require("path");
const root = path.join(__dirname, "..");
const storage = require(path.join(root, "lib/helmut/storage.js"));
const matching = require(path.join(root, "lib/helmut/matching.js"));
const erklaerung = require(path.join(root, "lib/helmut/matching-erklaerung.js"));

const ALS_JSON = process.argv.includes("--json");
const ZEILEN_LIMIT = 5000;
// Genau die Zahl, die der Nutzer in „Lage" tatsaechlich sieht (lage.js).
const LAGE_FENSTER = Number(process.env.HELMUT_LAGE_MAX_VORGAENGE) || 12;

function falte(v) {
  return String(v == null ? "" : v)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Namen aus den Erwaehnungsfeldern eines Wissensobjekts.
function erwaehnteNamen(ko) {
  return [...(ko.mentioned_mps || []), ...(ko.mentioned_people || [])]
    .map(falte).filter(Boolean);
}

// Geografienamen aus den seit Sprint 20 gespeicherten Strukturfeldern.
function geografieNamen(ko) {
  const aus = (liste) => (Array.isArray(liste) ? liste : [])
    .map((g) => (g && typeof g === "object" ? g.name : g))
    .map(falte).filter(Boolean);
  return {
    betroffen: aus(ko.affected_geographies),
    erwaehnt: aus(ko.mentioned_geographies)
  };
}

// Wortmenge eines Profils fuer die Namens-/Geografiepruefung.
function profilNamen(profile) {
  const name = falte(profile.fullName || profile.name || "");
  const teile = name.split(" ").filter((t) => t.length >= 4);
  return { voll: name, teile };
}

function profilRegionen(profile) {
  return matching.profileFeatures(profile).regions.map(falte).filter(Boolean);
}

function prozent(a, b) {
  return b > 0 ? `${((a / b) * 100).toFixed(1)} %` : "—";
}

(async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Abbruch: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen (nur aus der Umgebung, nie aus dem Repo).");
    process.exit(2);
  }

  // ── 1 · Bestand lesen ─────────────────────────────────────────────────────
  const kos = await storage.listKnowledgeObjectsSeitenweise({ limit: 20000 });
  const koById = new Map(kos.map((k) => [k.id, k]));

  // Mandanten aus dem vorhandenen Profilbestand ableiten — KEIN hartkodierter
  // Mandant, keine Vorauswahl, keine Sonderbehandlung (CLAUDE.md §4.2).
  const profile = await storage.listProfiles();
  const ids = (Array.isArray(profile) ? profile : []).map((p) => p && p.id).filter(Boolean);
  if (!ids.length) throw new Error("Keine Mandatsprofile lesbar — Analyse abgebrochen (kein falsches Grün).");

  const proMandant = [];
  for (const userId of ids) {
    const rows = await storage.listMatchingResults({ userId, limit: ZEILEN_LIMIT });
    if (!rows.length) continue;
    const profile = await storage.getProfile(userId);
    proMandant.push({ userId, profile, rows });
  }

  // ── 2 · Klassifikation je Zeile ───────────────────────────────────────────
  const gesamt = {
    zeilen: 0, mitBeleg: 0, ohneBeleg: 0,
    gewinntDurchFix: 0, bleibtLeer: 0, koFehlt: 0, profilLeer: 0
  };
  const restBefunde = {
    profilOhneMerkmale: 0,
    profilNurPlatzhalter: 0,
    koOhneMerkmale: 0,
    beideBesetztKeineUeberschneidung: 0,
    nurInhaltstoken: 0,
    aehnlichkeitNull: 0,
    namentlichErwaehnt: 0,
    geografieBetroffen: 0,
    geografieErwaehnt: 0,
    ministerienVorhanden: 0
  };
  const restAehnlichkeit = [];
  const restRaenge = [];
  const beispiele = [];
  const berichtProMandant = [];

  for (const { userId, profile, rows } of proMandant) {
    const pf = profile ? matching.profileFeatures(profile) : null;
    const profilHatMerkmale = Boolean(pf && (pf.parties.length || pf.committees.length || pf.regions.length || pf.topics.length));
    // Ein Profil ohne Partei, ohne Ausschuss und ohne Schwerpunkt kann per
    // Konstruktion NIE einen Beleg erzeugen — dort ist die Profilpflege der
    // begrenzende Faktor, nicht die Datenlage.
    const profilNurPlatzhalter = Boolean(pf && !pf.parties.length && !pf.committees.length && !pf.topics.length);
    const namen = profile ? profilNamen(profile) : { voll: "", teile: [] };
    const regionen = profile ? profilRegionen(profile) : [];
    const pVec = profile ? matching.computeFeatureVectorForProfile(profile) : null;

    const m = { userId, zeilen: rows.length, mitBeleg: 0, gewinnt: 0, bleibtLeer: 0, koFehlt: 0, profilLeer: 0,
      lageHeute: 0, lageNachFix: 0, lageFenster: Math.min(LAGE_FENSTER, rows.length) };

    // Das sichtbare Fenster zuerst getrennt bewerten (Naeherung):
    // `listMatchingResults` liefert seit Befund F-E2E (PR #224) die Zeilen nach
    // BERECHNETEM Rang; lage.js zeigt davon die ersten LAGE_FENSTER, verwirft
    // vor der Kappung aber noch Zeilen ohne Wissensobjekt im KO-Scanfenster.
    for (const row of rows.slice(0, LAGE_FENSTER)) {
      if (erklaerung.erklaerungAusErgebnis(row) !== null) { m.lageHeute += 1; m.lageNachFix += 1; continue; }
      const ko = koById.get(row.knowledge_object_id);
      if (ko && pf && matching.matchedFeatures(pf, matching.knowledgeObjectFeatures(ko)).length) m.lageNachFix += 1;
    }

    for (const row of rows) {
      gesamt.zeilen += 1;
      const hatBeleg = erklaerung.erklaerungAusErgebnis(row) !== null;
      if (hatBeleg) { gesamt.mitBeleg += 1; m.mitBeleg += 1; continue; }
      gesamt.ohneBeleg += 1;

      if (!profilHatMerkmale) {
        gesamt.profilLeer += 1; m.profilLeer += 1;
        restBefunde.profilOhneMerkmale += 1;
        continue;
      }
      const ko = koById.get(row.knowledge_object_id);
      if (!ko) { gesamt.koFehlt += 1; m.koFehlt += 1; continue; }

      // Genau die Rechnung, die der korrigierte Schreibpfad ausfuehrt.
      const kf = matching.knowledgeObjectFeatures(ko);
      const feats = matching.matchedFeatures(pf, kf);
      if (feats.length) {
        gesamt.gewinntDurchFix += 1; m.gewinnt += 1;
        if (beispiele.length < 5) beispiele.push({ userId, ko: ko.id, feats });
        continue;
      }

      // ── Der Rest: wirklich keine Ueberschneidung. Warum? ──────────────────
      gesamt.bleibtLeer += 1; m.bleibtLeer += 1;
      if (profilNurPlatzhalter) restBefunde.profilNurPlatzhalter += 1;
      const koHatMerkmale = Boolean(kf.parties.length || kf.committees.length || kf.regions.length || kf.topics.length);
      if (!koHatMerkmale) restBefunde.koOhneMerkmale += 1;
      else restBefunde.beideBesetztKeineUeberschneidung += 1;

      // Woraus stammt die Aehnlichkeit, wenn KEIN Label trifft?
      // Logisch zwingend: die Merkmalslisten (Partei/Ausschuss/Region/Thema)
      // ueberschneiden sich nachweislich nicht — jede verbleibende Aehnlichkeit
      // kann deshalb nur aus `inhalt:`-Worttoken stammen (Wortueberschneidung im
      // Freitext bzw. in Themenbezeichnungen), nicht aus Bedeutung. Genau das
      // ist der Legacy-Merkmalsvektor und genau das ist nicht belegbar.
      const simVoll = matching.cosineSimilarity(pVec, matching.computeFeatureVectorForKnowledgeObject(ko));
      restAehnlichkeit.push(Number(row.similarity != null ? row.similarity : simVoll) || 0);
      if (row.rank != null) restRaenge.push(Number(row.rank));
      if (simVoll <= 0) restBefunde.aehnlichkeitNull += 1;
      else restBefunde.nurInhaltstoken += 1;

      // Belastbare Signale, die heute NICHT als matched_feature gespeichert werden.
      const erwaehnt = erwaehnteNamen(ko);
      if (namen.voll && erwaehnt.some((n) => n.includes(namen.voll))) restBefunde.namentlichErwaehnt += 1;
      const geo = geografieNamen(ko);
      if (regionen.some((r) => geo.betroffen.some((g) => g && (r.includes(g) || g.includes(r))))) restBefunde.geografieBetroffen += 1;
      if (regionen.some((r) => geo.erwaehnt.some((g) => g && (r.includes(g) || g.includes(r))))) restBefunde.geografieErwaehnt += 1;
      if ((ko.ministerien || []).length) restBefunde.ministerienVorhanden += 1;
    }
    berichtProMandant.push(m);
  }

  // ── 3 · Ausgabe ───────────────────────────────────────────────────────────
  const sortiert = [...restAehnlichkeit].sort((a, b) => a - b);
  const kennzahl = (liste) => (liste.length ? {
    min: liste[0], median: liste[Math.floor(liste.length / 2)], max: liste[liste.length - 1]
  } : null);
  const restStatistik = {
    aehnlichkeit: kennzahl(sortiert),
    rangSpanne: restRaenge.length ? { min: Math.min(...restRaenge), max: Math.max(...restRaenge) } : null,
    nullAnteil: restAehnlichkeit.filter((x) => x <= 0).length
  };
  const ergebnis = { gesamt, restBefunde, restStatistik, proMandant: berichtProMandant, beispiele };
  if (ALS_JSON) { console.log(JSON.stringify(ergebnis, null, 2)); return; }

  console.log("=== Erklaerungsabdeckung: Bestand (aktuell = true) ===");
  console.log(`Zeilen gesamt                     ${gesamt.zeilen}`);
  console.log(`  mit sichtbarem Beleg (heute)    ${gesamt.mitBeleg}  (${prozent(gesamt.mitBeleg, gesamt.zeilen)})`);
  console.log(`  ohne Beleg                      ${gesamt.ohneBeleg}  (${prozent(gesamt.ohneBeleg, gesamt.zeilen)})`);
  console.log(`    davon gewinnen durch den Fix  ${gesamt.gewinntDurchFix}`);
  console.log(`    davon bleiben ehrlich leer    ${gesamt.bleibtLeer}`);
  console.log(`    davon Profil ohne Merkmale    ${gesamt.profilLeer}`);
  console.log(`    davon Wissensobjekt weg       ${gesamt.koFehlt}`);
  const nachFix = gesamt.mitBeleg + gesamt.gewinntDurchFix;
  console.log(`Erwartete Abdeckung nach Neuberechnung: ${nachFix}/${gesamt.zeilen} (${prozent(nachFix, gesamt.zeilen)})`);

  console.log("\n=== Warum der Rest leer bleibt ===");
  console.log(`Profil traegt gar keine Merkmale               ${restBefunde.profilOhneMerkmale}`);
  console.log(`Profil ohne Partei/Ausschuss/Schwerpunkt       ${restBefunde.profilNurPlatzhalter}`);
  console.log(`Wissensobjekt traegt gar keine Merkmale        ${restBefunde.koOhneMerkmale}`);
  console.log(`beide besetzt, aber keine Ueberschneidung      ${restBefunde.beideBesetztKeineUeberschneidung}`);
  console.log(`Aehnlichkeit stammt NUR aus Inhaltstoken       ${restBefunde.nurInhaltstoken}`);
  console.log(`gespeicherte Aehnlichkeit (min/median/max)     ${restStatistik.aehnlichkeit
    ? `${restStatistik.aehnlichkeit.min} / ${restStatistik.aehnlichkeit.median} / ${restStatistik.aehnlichkeit.max}` : "—"}`);
  console.log(`Rangspanne dieser Zeilen                      ${restStatistik.rangSpanne
    ? `${restStatistik.rangSpanne.min}–${restStatistik.rangSpanne.max}` : "—"}`);
  console.log(`Aehnlichkeit ist 0                             ${restBefunde.aehnlichkeitNull}`);

  console.log("\n=== Heute nicht gespeicherte, aber belastbare Signale (im leeren Rest) ===");
  console.log(`namentliche Erwaehnung des Mandats             ${restBefunde.namentlichErwaehnt}`);
  console.log(`betroffene Geografie trifft die Region         ${restBefunde.geografieBetroffen}`);
  console.log(`erwaehnte Geografie trifft die Region          ${restBefunde.geografieErwaehnt}`);
  console.log(`Wissensobjekt nennt ein Ministerium            ${restBefunde.ministerienVorhanden}`);

  console.log("\n=== Je Mandant ===");
  console.log("mandant                 zeilen  beleg  gewinnt  leer   nach Fix   nach Erklaerbarkeits-Gate");
  for (const m of berichtProMandant) {
    const nach = m.mitBeleg + m.gewinnt;
    console.log(
      `${m.userId.padEnd(22)}  ${String(m.zeilen).padStart(6)}  ${String(m.mitBeleg).padStart(5)}  ` +
      `${String(m.gewinnt).padStart(7)}  ${String(m.bleibtLeer).padStart(4)}   ` +
      `${String(nach).padStart(3)}/${String(m.zeilen).padEnd(3)}  ${prozent(nach, m.zeilen).padStart(8)} sichtbar`
    );
  }
  console.log(`\n=== Sichtbares Lage-Fenster (die ersten ${LAGE_FENSTER} Vorgaenge je Mandant) ===`);
  console.log("mandant                 fenster  erklaert heute  erklaert nach Fix  faellt bei einem Gate weg");
  for (const m of berichtProMandant) {
    console.log(
      `${m.userId.padEnd(22)}  ${String(m.lageFenster).padStart(7)}  ${String(m.lageHeute).padStart(14)}  ` +
      `${String(m.lageNachFix).padStart(17)}  ${String(m.lageFenster - m.lageNachFix).padStart(25)}`
    );
  }

  console.log("\nHinweis: „gewinnt\" = wuerde bei einer kontrollierten Neuberechnung einen Beleg tragen.");
  console.log("Es wurde NICHTS geschrieben und kein Matching gestartet.");
})().catch((error) => {
  console.error("Analyse abgebrochen:", error && error.message ? error.message : error);
  process.exit(1);
});
