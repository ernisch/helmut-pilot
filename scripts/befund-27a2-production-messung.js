"use strict";

// Befund 27A-2 — rein lesende Production-Messung.
// =============================================================================
// WOZU: Befund 27A-2 (docs/matching-nachvollziehbarkeit.md §50.5/§51) besagt, dass
// ein BUNDESTAGSPROFIL einen Ausschussbeleg erhaelt, wenn ein LANDESVORGANG einen
// gleichnamigen Landes-/Kreisausschuss nennt. `normalizeCommittee` faltet beide
// Bezeichnungen auf denselben Stamm; `ausschussBelegZulaessig` greift heute NUR
// fuer Profile mit bestimmtem Landes-Zustaendigkeitsraum und laesst Bundesprofile
// unveraendert durch. Dieses Werkzeug misst die Betroffenheit an echten
// Production-Daten und macht dieselbe Messung nach einem spaeteren Fix
// wiederholbar (Abnahme des Fix-Sprints).
//
// ── SCHREIBSCHUTZ (technisch, nicht nur zugesagt) ────────────────────────────
// 1. Es gibt in dieser Datei GENAU EINE HTTP-Funktion (`holen`). Ihre
//    HTTP-Methode ist die Konstante `HTTP_METHODE` und damit ein GET-Literal. Es
//    gibt keinen Parameter, ueber den eine andere Methode gesetzt werden koennte
//    — eine Schreiboperation ist strukturell nicht erreichbar, nicht nur nicht
//    aufgerufen.
// 2. Jeder Pfad laeuft durch `pfadErlaubt()`: nur `/rest/v1/<tabelle>` aus einer
//    festen Allowlist. `/rest/v1/rpc/...` ist ausdruecklich gesperrt — eine
//    Datenbankfunktion koennte schreiben, auch wenn sie per GET aufgerufen wird.
// 3. Dieses Modul laedt `lib/helmut/storage.js` NICHT. Damit ist kein
//    Schreibpfad der Anwendung im Prozess vorhanden.
// 4. Es werden ausschliesslich die reinen Matchingfunktionen gerechnet
//    (matching, matching-begruendung, matching-relevanz, decisions) — kein
//    Matchinglauf, kein Understanding-Lauf, kein Crawl, 0 KI-Aufrufe, 0 USD.
// 5. Der M8-Relevanzriegel wird NUR lokal als reine Funktion ausgewertet. Diese
//    Datei liest, setzt und veraendert kein Flag; `HELMUT_MATCHING_RELEVANZ_GATE`
//    bleibt unberuehrt.
//
// ── DATENSCHUTZ ──────────────────────────────────────────────────────────────
// Mandanten erscheinen ausschliesslich pseudonymisiert (`BT-01`, `BT-02`, …) —
// es gibt bewusst KEINEN Schalter fuer Klarnamen. Ausgegeben werden nur
// Ausschussbezeichnungen (oeffentliche Gremiennamen), Ebene/Geografie,
// technische Kennungen und Zahlen. Keine Ueberschriften, keine Rohtexte, keine
// Freitextfelder, keine Secrets.
//
// ── AUFRUF ───────────────────────────────────────────────────────────────────
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/befund-27a2-production-messung.js
// Secrets kommen ausschliesslich aus `process.env` (CLAUDE.md §4.9) — diese Datei
// liest keine `.env.local` und gibt kein Secret aus.
//
// Der Dateiname endet bewusst NICHT auf `-test.js`: `scripts/run-offline-tests.js`
// sammelt nur `*-test.js` ein, dieses Werkzeug darf nie Teil des Offline-Gates
// werden. Der Schreibschutz selbst wird offline geprueft:
// `scripts/befund-27a2-schreibschutz-test.js`.

const https = require("https");

const m = require("../lib/helmut/matching");
const begruendung = require("../lib/helmut/matching-begruendung");
const relevanz = require("../lib/helmut/matching-relevanz");
const decisions = require("../lib/helmut/decisions");

// ── Sicherheitsgrenzen ───────────────────────────────────────────────────────

const HTTP_METHODE = "GET";                       // Literal, nicht konfigurierbar
const ERLAUBTE_TABELLEN = Object.freeze([
  "mandate_profiles", "knowledge_objects", "matching_results", "matching_runs", "decisions"
]);

// Nur `/rest/v1/<erlaubte-tabelle>` mit optionalem Querystring. Alles andere —
// insbesondere `/rest/v1/rpc/<fn>` (Datenbankfunktion mit moeglicher
// Schreibwirkung), unbekannte Tabellen, absolute URLs und Pfadwechsel — faellt
// durch. Fail-closed: im Zweifel nicht abfragen.
function pfadErlaubt(pfad) {
  if (typeof pfad !== "string" || !pfad.startsWith("/rest/v1/")) return false;
  if (pfad.includes("..") || pfad.includes("//", 1)) return false;
  const rest = pfad.slice("/rest/v1/".length);
  const tabelle = rest.split("?")[0];
  return ERLAUBTE_TABELLEN.includes(tabelle);
}

// Die EINZIGE HTTP-Funktion dieses Moduls. GET, sonst nichts.
function holen(pfad) {
  if (!pfadErlaubt(pfad)) {
    return Promise.reject(new Error(`[SCHREIBSCHUTZ] Pfad nicht erlaubt (nur lesende Tabellenabfragen): ${pfad}`));
  }
  const basis = process.env.SUPABASE_URL;
  const schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!basis || !schluessel) {
    return Promise.reject(new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (nur aus process.env, siehe CLAUDE.md §4.9)"));
  }
  return new Promise((erfuellen, ablehnen) => {
    const anfrage = https.request(new URL(basis + pfad), {
      method: HTTP_METHODE,
      headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}`, Accept: "application/json" }
    }, (antwort) => {
      let text = "";
      antwort.on("data", (teil) => { text += teil; });
      antwort.on("end", () => {
        if (antwort.statusCode >= 400) return ablehnen(new Error(`HTTP ${antwort.statusCode}: ${text.slice(0, 200)}`));
        try { erfuellen(JSON.parse(text)); } catch (fehler) { ablehnen(fehler); }
      });
    });
    anfrage.on("error", ablehnen);
    anfrage.end();
  });
}

// PostgREST liefert hoechstens 1000 Zeilen je Abfrage.
async function holenAlle(pfadOhneOffset) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const seite = await holen(`${pfadOhneOffset}&limit=1000&offset=${offset}`);
    if (!Array.isArray(seite)) break;
    out.push(...seite);
    if (seite.length < 1000) break;
  }
  return out;
}

// ── Reine Auswertung (offline pruefbar, ohne Netz) ───────────────────────────

// `mandate_profiles`-Zeile -> Profilform, wie `storage.fromMandateProfileRow` sie
// liefert. Nur die Felder, die `profileFeatures`/`profileZustaendigkeit` lesen.
function zuProfil(zeile = {}) {
  return {
    parliamentType: zeile.politische_ebene === "landtag" ? "Landtag"
      : (zeile.politische_ebene === "bundestag" ? "Bundestag" : undefined),
    state: zeile.bundesland,
    bundesland: zeile.bundesland,
    party: zeile.partei,
    faction: zeile.fraktion,
    committees: zeile.ausschuesse || [],
    constituency: zeile.wahlkreis,
    focusTopics: zeile.fachpolitische_schwerpunkte || [],
    reportingTopics: zeile.berichterstatter_themen || [],
    regionalInterests: zeile.regionale_interessen || []
  };
}

// pgvector-Spalte -> Zahlenarray (matching.toVector ist nicht exportiert).
function zuVektor(wert) {
  if (Array.isArray(wert)) return wert.map(Number);
  if (typeof wert === "string" && wert.trim().startsWith("[")) {
    try { return JSON.parse(wert).map(Number); } catch (_) { return null; }
  }
  return null;
}

// Bewertet EIN Paar (Profil, Wissensobjekt) mit den echten Produktionsfunktionen
// und stellt der Originalrechnung die Gegenprobe OHNE Ausschussmerkmal gegenueber.
// Die Gegenprobe entfernt NUR den Beleg — Merkmalsvektor, Aehnlichkeit und die
// von der Vektorsuche vergebene Rangfolge bleiben unberuehrt (genau die
// Eingriffstiefe des 27A-1-Fixes in `matchedFeatures`).
function bewertePaar(profil, ko) {
  const pf = m.profileFeatures(profil);
  const kf = m.knowledgeObjectFeatures(ko);
  const feats = m.matchedFeatures(pf, kf);
  const ausschussFeats = feats.filter((f) => f.type === "ausschuss");
  const featsOhne = feats.filter((f) => f.type !== "ausschuss");

  const kEmb = zuVektor(ko.embedding) || m.embedKnowledgeObject(ko);
  const sim = Math.round(m.cosineSimilarity(m.embedProfile(profil), kEmb) * 1e4) / 1e4;

  const sig = begruendung.buildSignals(feats, sim);
  const sigOhne = begruendung.buildSignals(featsOhne, sim);
  const score = decisions.scoreKnowledgeObject(ko, { similarity: sim, matched_features: feats });
  const scoreOhne = decisions.scoreKnowledgeObject(ko, { similarity: sim, matched_features: featsOhne });

  // M8 ausschliesslich lokal als reine Funktion, mit ausdruecklicher Eingabe.
  const durchM8 = (liste) => relevanz.wendeRelevanzGateAn([{ id: "probe", matched_features: liste }], { aktiv: true }).zeilen.length === 1;

  return {
    profilZustaendigkeit: m.profileZustaendigkeit(profil),
    koZustaendigkeit: m.knowledgeObjectZustaendigkeit(ko),
    ausschussBeleg: ausschussFeats.length > 0,
    token: [...new Set(ausschussFeats.map((f) => m.slugCommittee(f.value)))],
    similarity: sim,
    matchedFeatures: feats,
    matchedFeaturesOhne: featsOhne,
    begruendung: begruendung.begruendungAusSignalen(sig, feats),
    begruendungOhne: begruendung.begruendungAusSignalen(sigOhne, featsOhne),
    score, scoreOhne, scoreDelta: score - scoreOhne,
    entscheidung: decisions.decisionFromScore(score),
    entscheidungOhne: decisions.decisionFromScore(scoreOhne),
    m8Mit: durchM8(feats),
    m8Ohne: durchM8(featsOhne)
  };
}

// Messdefinition des Sprints: falscher Ausschussbeleg nur, wenn das aktive Profil
// institutionell zum Bundestag gehoert, das Wissensobjekt nach BELEGTER Ebene zu
// einem Landesparlament gehoert und beide Seiten denselben normalisierten
// Ausschusstoken teilen, der als Mitgliedschaft gewertet wird. Fehlende oder
// widersprueckliche Zustaendigkeitsdaten werden NICHT ergaenzt — solche Faelle
// zaehlen hier nicht als bestaetigt (sie erscheinen in der Spalte "unklar").
function istQualifiziert(profilZeile, ko, bewertung) {
  return profilZeile.politische_ebene === "bundestag"
    && profilZeile.aktiv === true
    && !profilZeile.geloescht_at
    && ko.decision_level === "land"
    && bewertung.ausschussBeleg === true;
}

// ── Messlauf ─────────────────────────────────────────────────────────────────

async function messen() {
  const profilZeilen = await holenAlle("/rest/v1/mandate_profiles?select=user_id,partei,fraktion,politische_ebene,bundesland,wahlkreis,aktiv,geloescht_at,ausschuesse,fachpolitische_schwerpunkte,berichterstatter_themen,regionale_interessen&order=user_id.asc");
  const aktiveBund = profilZeilen.filter((p) => p.aktiv && !p.geloescht_at && p.politische_ebene === "bundestag");
  const deckname = new Map();
  aktiveBund.forEach((p, i) => deckname.set(p.user_id, `BT-${String(i + 1).padStart(2, "0")}`));

  const kos = await holenAlle("/rest/v1/knowledge_objects?select=*&order=id.asc");
  const landKos = kos.filter((k) => k.decision_level === "land");

  console.log("== EINGABEN (rein lesend) ==");
  console.log(`mandate_profiles: ${profilZeilen.length} | aktive Bundestagsprofile: ${aktiveBund.length} | davon mit Ausschuss: ${aktiveBund.filter((p) => (p.ausschuesse || []).length).length}`);
  console.log(`knowledge_objects: ${kos.length} | decision_level=land: ${landKos.length} | davon mit Ausschussangabe: ${landKos.filter((k) => [...(k.ausschuesse || []), ...(k.mentioned_committees || [])].length).length}`);

  const faelle = [];
  let paare = 0, ausschussBelegeGesamt = 0;
  for (const zeile of aktiveBund) {
    const profil = zuProfil(zeile);
    for (const ko of kos) {
      paare += 1;
      const bewertung = bewertePaar(profil, ko);
      if (bewertung.ausschussBeleg) ausschussBelegeGesamt += 1;
      if (istQualifiziert(zeile, ko, bewertung)) faelle.push({ profil: deckname.get(zeile.user_id), koId: ko.id, zeile, ko, bewertung });
    }
  }

  console.log(`\n== ERGEBNIS ==`);
  console.log(`geprueft: ${paare} Paare (Profil x Wissensobjekt)`);
  console.log(`Paare mit Ausschussbeleg gesamt: ${ausschussBelegeGesamt}`);
  console.log(`davon QUALIFIZIERT (Bundestagsprofil x Wissensobjekt decision_level=land): ${faelle.length}`);
  console.log(`betroffene Wissensobjekte: ${new Set(faelle.map((f) => f.koId)).size} | betroffene Profile: ${new Set(faelle.map((f) => f.profil)).size}`);
  console.log(`geteilte normalisierte Ausschusstoken: ${JSON.stringify([...new Set(faelle.flatMap((f) => f.bewertung.token))])}`);
  console.log(`Faelle, in denen der Ausschussbeleg der EINZIGE Beleg ist (M8 wuerde sie ohne ihn entfernen): ${faelle.filter((f) => f.bewertung.m8Mit && !f.bewertung.m8Ohne).length}`);
  console.log(`Faelle mit anderer Entscheidungsstufe ohne den Ausschussbeleg: ${faelle.filter((f) => f.bewertung.entscheidung !== f.bewertung.entscheidungOhne).length}`);

  for (const f of faelle) {
    const b = f.bewertung;
    console.log(`\n--- ${f.profil} x ${f.koId} (ko-status ${f.ko.status})`);
    console.log(`  Zustaendigkeit Profil/KO : ${JSON.stringify(b.profilZustaendigkeit)} / ${JSON.stringify(b.koZustaendigkeit)}`);
    console.log(`  Ausschuesse Profil       : ${JSON.stringify(f.zeile.ausschuesse)}`);
    console.log(`  Ausschuesse Wissensobjekt: ${JSON.stringify([...new Set([...(f.ko.ausschuesse || []), ...(f.ko.mentioned_committees || [])])])}`);
    console.log(`  geteilter Token          : ${JSON.stringify(b.token)}`);
    console.log(`  Aehnlichkeit             : ${b.similarity}`);
    console.log(`  matched_features MIT/OHNE: ${JSON.stringify(b.matchedFeatures)} / ${JSON.stringify(b.matchedFeaturesOhne)}`);
    console.log(`  Begruendung MIT          : ${b.begruendung}`);
    console.log(`  Begruendung OHNE         : ${b.begruendungOhne}`);
    console.log(`  Score/Entscheidung       : MIT ${b.score} "${b.entscheidung}" | OHNE ${b.scoreOhne} "${b.entscheidungOhne}" | Delta ${b.scoreDelta}`);
    console.log(`  M8 (nur lokal, AN)       : MIT ${b.m8Mit} | OHNE ${b.m8Ohne}`);
  }

  // Persistierter Bestand: welche gespeicherten Ergebniszeilen tragen den Beleg?
  const ergebnisse = await holenAlle("/rest/v1/matching_results?select=user_id,knowledge_object_id,matched_features,similarity,rank,begruendung,run_id,berechnet_am,aktuell&order=knowledge_object_id.asc");
  const koEbene = new Map(kos.map((k) => [k.id, k.decision_level]));
  const mitBeleg = ergebnisse.filter((r) => Array.isArray(r.matched_features) && r.matched_features.some((x) => x && x.type === "ausschuss"));
  const qualifiziert = mitBeleg.filter((r) => koEbene.get(r.knowledge_object_id) === "land" && deckname.has(r.user_id));
  console.log(`\n== PERSISTIERTER BESTAND (matching_results) ==`);
  console.log(`Zeilen gesamt: ${ergebnisse.length} | mit ausschuss-Beleg: ${mitBeleg.length} | davon Wissensobjekt decision_level=land bei aktivem Bundesprofil: ${qualifiziert.length}`);
  // Laufkennungen tragen die Mandantenkennung im Namen -> ebenfalls pseudonymisieren.
  const laufDeckname = (runId, userId) => String(runId || "(ohne Laufkennung)").split(String(userId)).join(deckname.get(userId) || "MANDANT");
  for (const r of qualifiziert) {
    console.log(`  ${deckname.get(r.user_id)} x ${r.knowledge_object_id} | rang ${r.rank} | sim ${r.similarity} | aktuell ${r.aktuell} | lauf ${laufDeckname(r.run_id, r.user_id)} | berechnet ${r.berechnet_am}`);
    console.log(`     begruendung: ${r.begruendung}`);
  }
}

module.exports = {
  ERLAUBTE_TABELLEN, HTTP_METHODE, pfadErlaubt, holen,
  zuProfil, zuVektor, bewertePaar, istQualifiziert
};

if (require.main === module) {
  messen().catch((fehler) => { console.error("FEHLER:", fehler.message); process.exit(1); });
}
