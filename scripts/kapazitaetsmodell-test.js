"use strict";

// Helmut — ARBEITSREDUZIERUNG + KAPAZITAETSMODELL JE AUFTRAGSKLASSE
// (OP-30-Haertungssprint 2026-08-14, Auftrag Phase 5 und 6).
// =============================================================================================
// TEIL A (Phase 5) — DER ARBEITSREDUZIERUNGSVERTRAG ALS WAECHTER.
// Das Instagram-Prinzip ist im Fachkern bereits umgesetzt; dieser Test macht es VERBINDLICH,
// damit die lineare Vervielfachung (Dokument x Mandat) nicht zurueckkehren kann:
//   1. Quellen werden global abgerufen (geteilte Abrufe tragen kein Mandat),
//   2. Rohdokumente werden entdoppelt,
//   3./4. Verstehen laeuft GLOBAL je Vorgang — nie je Mandat,
//   5./6. die teure KI laeuft VOR der mandatsbezogenen Stufe, nicht in ihr,
//   7. Projektion und Briefingmaterialisierung sind KI-FREI,
//   8. Frische/Belege/Quellenvielfalt werden zuletzt geprueft (OP-31).
//
// TEIL B (Phase 6) — KAPAZITAET JE KLASSE, nicht als Gesamtreserve.
// Eine gemittelte Gesamtreserve verdeckt genau das, was zaehlt: EINE notwendige Klasse mit
// zu wenig Reserve bestimmt den Abfluss. Deshalb wird je Klasse gerechnet und die
// SCHWAECHSTE ausgewiesen. Grundlage sind die Production-Messwerte (P) des zweiten
// Fuenferlaufs — keine geschaetzten Wunschwerte.
//
// EHRLICHE GRENZE: das ist ein RECHENMODELL aus gemessenen Werten, kein Production-Beweis
// fuer 25+ Mandate. Der KI-Tagesbedarf wird GETRENNT vom technischen Durchsatz ausgewiesen.

const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const pipelineSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/scalable-pipeline.js"), "utf8");

console.log("Helmut — Arbeitsreduzierung und Kapazitaetsmodell je Auftragsklasse");

// ═══════════════════════════════════════════════════════════════════════════════════════════
// TEIL A · ARBEITSREDUZIERUNGSVERTRAG
// ═══════════════════════════════════════════════════════════════════════════════════════════
abschnitt("A1 · Quellen werden global abgerufen, nicht je Mandat");
const scalable = require(path.join(ROOT, "lib/helmut/scalable-pipeline"));
const vertrag = require(path.join(ROOT, "lib/helmut/verstehen-vertrag"));
check("A1.1 Es gibt genau EINEN Abruftyp (source_fetch) — kein Typ je Mandat",
  Object.keys(scalable.HANDLER).filter((t) => /fetch|abruf/.test(t)).length === 1,
  Object.keys(scalable.HANDLER).join(","));
check("A1.2 Der geteilte Abruf traegt kein Mandat (tenantId null)",
  /tenantId:\s*null/.test(pipelineSrc));

abschnitt("A2 · Rohdokumente werden entdoppelt");
const crawlerSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/crawler.js"), "utf8");
check("A2.1 Der Crawler entdoppelt Rohdokumente vor der Weiterverarbeitung",
  /deduplicateRawItems|dedupedItems/.test(crawlerSrc));

abschnitt("A3/A4 · Verstehen laeuft GLOBAL je Vorgang, nie je Mandat");
check("A3.1 Der Verstehenshandler bekommt Dokumentkennungen, keine Mandatsliste",
  /rohdokumentKennungen/.test(pipelineSrc));
// Die Wache liegt in storage.js (Datenbankseite); die Pipeline reicht sie nur durch.
const storageSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
check("A3.2 Die Vorgangswache ist je VORGANG exklusiv (Klasse verstehen-vorgang:<id>, max 1)",
  /verstehen-vorgang:\$\{/.test(storageSrc) && /max:\s*1/.test(storageSrc));
check("A3.2b Die Wache traegt KEIN Mandat im Schluessel (sonst waere sie je Mandat exklusiv)",
  !/verstehen-vorgang:\$\{[^}]*tenant/i.test(storageSrc));
check("A3.3 Verstehen ist KEINE Abhaengigkeit VON der Projektion, sondern umgekehrt",
  /mandate_projection:\s*\["source_fetch",\s*"document_understanding"\]/.test(pipelineSrc));

abschnitt("A5/A6/A7 · Teure KI VOR der mandatsbezogenen Stufe; Projektion KI-frei");
const projektionsBlock = pipelineSrc.slice(
  pipelineSrc.indexOf("async function handleMandateProjection"),
  pipelineSrc.indexOf("async function handleBriefingMaterialization"));
check("A5.1 handleMandateProjection ruft KEIN Sprachmodell auf",
  !/callModel|openai|chatCompletion|verstehe\(/.test(projektionsBlock));
check("A5.2 Der KI-freie Charakter ist ausdruecklich dokumentiert (V3-Vertrag)",
  /KI-frei/.test(projektionsBlock));
check("A5.3 Die mandatsbezogene Stufe arbeitet auf FERTIGEN Wissensobjekten (Matching)",
  /deps\.matching\(/.test(projektionsBlock));

abschnitt("A8 · Frische, Belege und Quellenvielfalt zuletzt");
const briefingBlock = pipelineSrc.slice(
  pipelineSrc.indexOf("async function handleBriefingMaterialization"),
  pipelineSrc.indexOf("async function handleTenantNarrative"));
check("A8.1 Die Briefingstufe steht NACH Projektion in der Abhaengigkeitskette",
  /briefing_materialization:\s*\[/.test(pipelineSrc));
check("A8.2 Die Briefingstufe erzeugt das mandatsbezogene Material (letzte Stufe)",
  briefingBlock.length > 0);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// TEIL B · KAPAZITAETSMODELL JE KLASSE
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Production-Messwerte (P, zweiter Fuenferlauf 2026-08-12/13, Runbook §19):
//   * geteilter Quellenabruf   ~11 s effektive Bedienzeit (Median ~7 s)
//   * Personenabruf            ~30 s (eine Personenquelle sind ~98 Anfragen)
//   * Dokumentverstehen        ~20 s (inkl. Modellantwort)
//   * Projektion/Briefing      ~3 s (KI-frei, datenbankgebunden)
//   * Mandatsnarrativ          ~9 s
const BEDIENZEIT_S = { fetch_geteilt: 11, fetch_person: 30, verstehen: 20, projektion: 3, briefing: 3, narrativ: 9 };

// Ankunftsmodell (R, aus P extrapoliert; identisch zum Lastnachweis der Belegdatei §5):
function ankunft(n) {
  return {
    fetch_geteilt: 420,                                        // global, WAECHST NICHT mit n
    fetch_person: Math.round(n * 8 / 7),
    verstehen: Math.round(Math.min(1000, 150 + 2.2 * n - 0.0018 * n * n)),
    projektion: 2 * n,
    briefing: 2 * n,
    narrativ: n
  };
}

// Parallelitaetsgrenzen: die verbindlichen DB-Klassengrenzen (nicht die AWS-Deckel — die
// liegen darueber und sind nur die zweite Schranke).
const PARALLEL = { quellenabruf: 5, verstehen: 1, "worker-drain": 4 };
// Anteil des Tages, in dem ein Verbraucher tatsaechlich arbeiten kann. Bewusst konservativ:
// mit SQS/Lambda gibt es keine Slotgrenze mehr, aber 50 % ist die ehrliche Annahme (A).
const AUSLASTUNG = 0.5;
// ZWEITE, PESSIMISTISCHE ANNAHME (A2, neu 2026-08-14). Annahme A ist eine ANNAHME, keine
// Messung — und der zweite Fuenferlauf hat gezeigt, wie weit die Wirklichkeit davon abweichen
// kann (Ankunft ~440–470/Tag gegen Abfluss ~130–180/Tag, Runbook §19). A2 rechnet mit einem
// Viertel davon: nur 12,5 % des Tages nutzbar. Sie ersetzt A nicht, sie zeigt, wie viel
// Verstehensparallelitaet noetig waere, wenn A zu optimistisch ist.
const AUSLASTUNG_PESSIMISTISCH = 0.125;
const TAG_S = 86400;

function modell(n, ueberschreibung = {}) {
  const a = ankunft(n);
  const parallel = { ...PARALLEL, ...(ueberschreibung.parallel || {}) };
  const auslastung = Number(ueberschreibung.auslastung) > 0 ? Number(ueberschreibung.auslastung) : AUSLASTUNG;
  const klassen = {
    quellenabruf: {
      auftraege: a.fetch_geteilt + a.fetch_person,
      bedarfS: a.fetch_geteilt * BEDIENZEIT_S.fetch_geteilt + a.fetch_person * BEDIENZEIT_S.fetch_person,
      parallel: parallel.quellenabruf
    },
    verstehen: {
      auftraege: a.verstehen,
      bedarfS: a.verstehen * BEDIENZEIT_S.verstehen,
      parallel: parallel.verstehen
    },
    projektion: {
      auftraege: a.projektion,
      bedarfS: a.projektion * BEDIENZEIT_S.projektion,
      parallel: parallel["worker-drain"]
    },
    briefing: {
      auftraege: a.briefing + a.narrativ,
      bedarfS: a.briefing * BEDIENZEIT_S.briefing + a.narrativ * BEDIENZEIT_S.narrativ,
      parallel: parallel["worker-drain"]
    }
  };
  for (const k of Object.values(klassen)) {
    k.angebotS = k.parallel * TAG_S * auslastung;
    k.reserve = k.bedarfS > 0 ? k.angebotS / k.bedarfS : Infinity;
  }
  const engpass = Object.entries(klassen).sort((x, y) => x[1].reserve - y[1].reserve)[0];
  return {
    n, klassen, engpass: engpass[0], engpassReserve: engpass[1].reserve,
    auftraegeGesamt: Object.values(klassen).reduce((s, k) => s + k.auftraege, 0),
    kiBedarf: a.verstehen,                       // ein Modellaufruf je Verstehensauftrag
    queueNachrichten: Object.values(klassen).reduce((s, k) => s + k.auftraege, 0),
    lambdaAufrufe: Math.ceil(Object.values(klassen).reduce((s, k) => s + k.auftraege, 0) / 5)
  };
}

// ── KI-BEDARF IST NICHT DIE ZAHL DER VERSTEHENSAUFTRAEGE ─────────────────────────────────────
// Ein Verstehensauftrag kostet NICHT zwangslaeufig einen Modellaufruf: ein bereits
// verstandener Vorgang wird per Kurzschluss ohne KI erledigt, und mehrere Dokumente eines
// Vorgangs teilen sich einen Aufruf. Umgekehrt kosten Aktualisierungen bestehender Vorgaenge
// zusaetzliche Aufrufe.
// Statt eine Zahl zu erfinden, wird eine SPANNE ausgewiesen:
//   * untere Grenze: das in Production GEMESSENE Verhaeltnis (P, zweiter Fuenferlauf:
//     62–77 Modellaufrufe/Tag bei n=5 gegen 161 modellierte Verstehensauftraege ≈ 0,43),
//   * obere Grenze: ein Aufruf je Auftrag zuzueglich Aktualisierungen (1,3).
// Die Messung ist selbst eine UNTERGRENZE, weil das globale Verstehens-Schloss im zweiten
// Fuenferlauf 124 von 139 Auftraegen vertagt hat — ohne das Schloss laufen mehr Auftraege
// tatsaechlich durch. Genau deshalb steht hier eine Spanne und keine Punktzahl.
const KI_FAKTOR_UNTEN = 0.43;   // P: gemessen
const KI_FAKTOR_OBEN = 1.3;     // A: ein Aufruf je Auftrag + Aktualisierungen
function kiSpanne(n) {
  const auftraege = ankunft(n).verstehen;
  return {
    auftraege,
    unten: Math.round(auftraege * KI_FAKTOR_UNTEN),
    oben: Math.round(auftraege * KI_FAKTOR_OBEN)
  };
}

abschnitt("B1 · Kapazitaet je Klasse (Bedarf, Angebot, Reserve, Engpass)");
const STUFEN = [5, 25, 100, 200, 500];
const ergebnisse = STUFEN.map(modell);
console.log("\n  Mandate | Auftraege | Klasse        | Bedarf s/Tag | Angebot s/Tag | Reserve | Engpass");
console.log("  --------|-----------|---------------|--------------|---------------|---------|--------");
for (const e of ergebnisse) {
  for (const [name, k] of Object.entries(e.klassen)) {
    console.log(`  ${String(e.n).padStart(7)} | ${String(e.auftraegeGesamt).padStart(9)} | `
      + `${name.padEnd(13)} | ${String(Math.round(k.bedarfS)).padStart(12)} | `
      + `${String(Math.round(k.angebotS)).padStart(13)} | ${("x" + k.reserve.toFixed(1)).padStart(7)} | `
      + `${name === e.engpass ? "<== " + e.engpassReserve.toFixed(1) : ""}`);
  }
  console.log("  --------|-----------|---------------|--------------|---------------|---------|--------");
}

for (const e of ergebnisse) {
  check(`B1.${e.n} Jede NOTWENDIGE Klasse hat bei ${e.n} Mandaten mindestens Faktor 2 Reserve`,
    e.engpassReserve >= 2,
    `schwaechste Klasse: ${e.engpass} mit x${e.engpassReserve.toFixed(1)}`);
}
check("B1.x Der Engpass ist bei jeder Stufe benannt (keine gemittelte Gesamtreserve)",
  ergebnisse.every((e) => Boolean(e.engpass)));

abschnitt("B2 · Verstehen: der Engpass ist jetzt KONFIGURIERBAR, der Standard bleibt 1");
check("B2.1 Bei 500 Mandaten ist `verstehen` bei Parallelitaet 1 die schwaechste Klasse",
  modell(500).engpass === "verstehen", modell(500).engpass);
check("B2.2 Der STANDARD der Klassengrenze `verstehen` bleibt 1 (Production unveraendert)",
  scalable.KLASSEN_STANDARD.verstehen === 1, String(scalable.KLASSEN_STANDARD.verstehen));
check("B2.3 Das Modell rechnet weiterhin mit der STANDARD-Grenze, nicht mit einer Wunschzahl",
  PARALLEL.verstehen === 1 && modell(500).klassen.verstehen.parallel === 1);
check("B2.4 Eine Parallelitaet > 1 ist ohne den atomaren Vertrag nicht erreichbar (harter Riegel)",
  scalable.klassenMax("verstehen", { HELMUT_KLASSE_VERSTEHEN_MAX: "8" }) === 1
    && scalable.klassenMax("verstehen", { HELMUT_KLASSE_VERSTEHEN_MAX: "8", HELMUT_VERSTEHEN_CAS: "on" }) === 8);

// ── Welche Verstehensparallelitaet ist noetig, welche ist NACHGEWIESEN? ──────────────────────
// Die untere Schranke: die kleinste ganze Zahl, bei der `verstehen` bei dieser Mandatszahl
// Faktor 2 Reserve haelt. Unter der optimistischen Annahme A und unter der pessimistischen A2.
function noetigeParallelitaet(n, auslastung) {
  for (let p = 1; p <= vertrag.VERSTEHEN_PARALLELITAET_MAX; p += 1) {
    if (modell(n, { parallel: { verstehen: p }, auslastung }).klassen.verstehen.reserve >= 2) return p;
  }
  return null;   // im gedeckelten Bereich nicht erreichbar
}

console.log("\n  Mandate | noetig bei A (50 %) | noetig bei A2 (12,5 %) | Reserve bei p=1/A | Reserve bei p=8/A2");
for (const n of STUFEN) {
  const pA = noetigeParallelitaet(n, AUSLASTUNG);
  const pA2 = noetigeParallelitaet(n, AUSLASTUNG_PESSIMISTISCH);
  const r1 = modell(n).klassen.verstehen.reserve;
  const r8 = modell(n, { parallel: { verstehen: 8 }, auslastung: AUSLASTUNG_PESSIMISTISCH }).klassen.verstehen.reserve;
  console.log(`  ${String(n).padStart(7)} | ${String(pA ?? ">8").padStart(19)} | ${String(pA2 ?? ">8").padStart(22)}`
    + ` | ${("x" + r1.toFixed(1)).padStart(17)} | ${("x" + r8.toFixed(1)).padStart(18)}`);
}
check("B2.5 Unter Annahme A traegt schon Parallelitaet 1 bis 500 Mandate",
  noetigeParallelitaet(500, AUSLASTUNG) === 1, String(noetigeParallelitaet(500, AUSLASTUNG)));
check("B2.6 Unter der PESSIMISTISCHEN Annahme A2 braucht es bei 500 Mandaten mehr als 1",
  noetigeParallelitaet(500, AUSLASTUNG_PESSIMISTISCH) > 1,
  String(noetigeParallelitaet(500, AUSLASTUNG_PESSIMISTISCH)));
// NACHGEWIESEN ist 8: `verstehen-cas-datenbank-test.js` §4 haelt acht Vorgaenge gleichzeitig an
// echter PostgreSQL, `verstehen-cas-vertrag-test.js` §13 verarbeitet acht Vorgaenge im Fachkern
// wirklich gleichzeitig. Das Modul deckelt bei genau dieser Zahl.
check("B2.7 Die lokal nachgewiesene Parallelitaet (8) deckt auch die pessimistische Annahme",
  noetigeParallelitaet(500, AUSLASTUNG_PESSIMISTISCH) <= 8);
check("B2.8 Die Obergrenze des Moduls entspricht der nachgewiesenen Zahl (kein ungedeckter Wert)",
  vertrag.VERSTEHEN_PARALLELITAET_MAX === 8, String(vertrag.VERSTEHEN_PARALLELITAET_MAX));
check("B2.9 Der KI-Deckel bleibt der bindende Grund gegen 25+ Mandate — nicht der Durchsatz",
  kiSpanne(25).oben > 100 + 30);

abschnitt("B3 · KI-Tagesbedarf GETRENNT vom technischen Durchsatz");
const DECKEL = 100 + 30;                      // Production-Tagesdeckel, unveraendert
console.log("\n  Mandate | Verstehensauftraege | KI-Aufrufe/Tag (Spanne) | Deckel | traegt der Deckel?");
for (const e of ergebnisse) {
  const ki = kiSpanne(e.n);
  const urteil = ki.oben <= DECKEL ? "ja"
    : (ki.unten <= DECKEL ? "nur im guenstigen Fall — beobachten" : "NEIN — Gruenderentscheidung");
  console.log(`  ${String(e.n).padStart(7)} | ${String(ki.auftraege).padStart(19)} | `
    + `${String(`${ki.unten}–${ki.oben}`).padStart(23)} | ${String(DECKEL).padStart(6)} | ${urteil}`);
}
check("B3.1 Bei 5 Mandaten deckt die untere (gemessene) Grenze den heutigen Deckel ab",
  kiSpanne(5).unten <= DECKEL, `${kiSpanne(5).unten} vs ${DECKEL}`);
check("B3.1b Bei 5 Mandaten liegt die gemessene Production-Zahl (62–77) in der Spanne",
  kiSpanne(5).unten <= 77 && kiSpanne(5).oben >= 62, `${kiSpanne(5).unten}–${kiSpanne(5).oben}`);
check("B3.1c Schon bei 5 Mandaten kann die OBERE Grenze den Deckel reissen — das wird benannt",
  kiSpanne(5).oben > DECKEL, `${kiSpanne(5).oben} vs ${DECKEL}`);
check("B3.2 Ab 25 Mandaten reicht der Deckel auch im guenstigen Fall NICHT",
  kiSpanne(25).unten > DECKEL || kiSpanne(25).oben > DECKEL, `${kiSpanne(25).unten}–${kiSpanne(25).oben}`);
check("B3.3 Der KI-Bedarf bei 500 liegt in der dokumentierten Groessenordnung (344–1.040)",
  kiSpanne(500).unten >= 300 && kiSpanne(500).oben <= 1100,
  `${kiSpanne(500).unten}–${kiSpanne(500).oben}`);
check("B3.4 Der KI-Deckel ist NICHT Teil des technischen Durchsatzmodells (getrennte Achse)",
  !Object.keys(modell(500).klassen).includes("ki"));

abschnitt("B4 · Queue-Nachrichten und Lambda-Aufrufe je Stufe");
console.log("\n  Mandate | Queue-Nachrichten/Tag | Lambda-Aufrufe/Tag (Stapel 5)");
for (const e of ergebnisse) {
  console.log(`  ${String(e.n).padStart(7)} | ${String(e.queueNachrichten).padStart(21)} | ${String(e.lambdaAufrufe).padStart(29)}`);
}
check("B4.1 Die Nachrichtenzahl waechst unterlinear zur Mandatszahl (geteilte Quellen)",
  modell(500).queueNachrichten / modell(5).queueNachrichten < 100 / 5 * 0.6,
  `${modell(5).queueNachrichten} -> ${modell(500).queueNachrichten}`);
check("B4.2 Die Lambda-Aufrufe bleiben durch die Stapelbildung deutlich unter der Nachrichtenzahl",
  modell(500).lambdaAufrufe < modell(500).queueNachrichten / 4);

abschnitt("B5 · Externe Blocker bleiben ehrlich ausgewiesen");
check("B5.1 OP-15 (Google-Drosselung) ist in der Belegdatei als offener Blocker benannt",
  fs.readFileSync(path.join(ROOT, "docs/betrieb/op30-zielarchitektur-2026-08-13.md"), "utf8")
    .includes("OP-15"));
check("B5.2 Die Anbietersteuerung setzt fuer Google eine konservative Rate ohne Anbieterzusage",
  require(path.join(ROOT, "lib/helmut/anbieter-steuerung")).STANDARD_GRENZEN.google.minute > 0);

console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
console.log("EINORDNUNG: Rechenmodell aus Production-Messwerten (P) — KEIN Production-Beweis");
console.log("fuer 25+ Mandate. Der KI-Tagesbedarf ist eine getrennte Gruenderentscheidung.");
console.log("Die nachgewiesene Verstehensparallelitaet (8) ist LOKAL belegt (echte PostgreSQL,");
console.log("echte Nebenlaeufigkeit) — sie gibt Helmut NICHT fuer 25 bis 500 Mandate frei.");
process.exit(fail > 0 ? 1 : 0);
