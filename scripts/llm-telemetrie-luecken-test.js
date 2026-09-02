"use strict";

// Offline-Vertragstest: JEDER VERBRAUCHTE BUDGETSLOT HINTERLAESST EINE SPUR —
// und eine Budgetablehnung erscheint NIE als erfolgreicher Modellaufruf.
//
// HINTERGRUND (Untersuchung 2026-09-01, Beleg §17 des 500er-Sicherheitsrahmens):
// Der atomare Tageszaehler `llm_budget_counters` lag in Production dauerhaft
// UEBER der Zahl der Eintraege in `helmut_store.data.llmUsage` (~12 %). Beide
// Groessen entstehen an derselben Engstelle, koennen also nur auseinanderlaufen,
// wenn ein Pfad reserviert, aber nicht protokolliert.
//
// Dieser Test haelt die geschlossenen Luecken fest. Er beweist NICHT, dass die
// Abweichung damit verschwindet — die dominierende Ursache ist der
// unbedingte Lese-Aendere-Schreibe-Zyklus auf dem gemeinsamen Blob
// (`writeAuthStore`, Voll-Upsert, last-write-wins). Dieser Test misst sie in
// Abschnitt D nach, aendert sie aber ausdruecklich NICHT: die Behebung ist eine
// getrennt freizugebende Umstellung (relationale Tabelle, Muster W-2/process_runs).

const path = require("path");

const ROOT = path.join(__dirname, "..");
const storage = require(path.join(ROOT, "lib/helmut/storage"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

// ── A · Ein Nicht-Aufruf ist NIE ein Erfolg ─────────────────────────────────
// `success` wurde als `entry.success !== false` abgeleitet: ein fehlendes Feld
// bedeutete Erfolg. Ein Skip-Marker erzwingt jetzt success:false.
const bau = storage.buildLlmUsageRecord;
check("A0 buildLlmUsageRecord ist exportiert und pruefbar", typeof bau === "function");

const SKIPS = [
  ["A1 Budgetablehnung mit vollstaendigen Feldern",
    { callType: "skipped-understanding", model: "none", keinAufruf: true, success: false, error: "daily-llm-budget-reached" }],
  ["A2 Budgetablehnung OHNE success-Feld (der gefaehrliche Fall)",
    { callType: "skipped-understanding", model: "none", keinAufruf: true, error: "daily-llm-budget-reached" }],
  ["A3 Skip-Marker mit ausdruecklich behauptetem Erfolg",
    { callType: "skipped-lageBriefing", model: "none", keinAufruf: true, success: true }],
  ["A4 Skip-Marker ohne keinAufruf-Kennzeichnung",
    { callType: "skipped-communicationDraft", model: "none" }],
  ["A5 Anbietergrenze (Vertagung)",
    { callType: "skipped-understanding", model: "none", keinAufruf: true, success: false, error: "anbietergrenze:rate" }],
  ["A6 Konfigurationsriegel (Azure-Endpunkt)",
    { callType: "skipped-understanding", model: "none", keinAufruf: true, success: false, error: "azure-endpunkt-host-nicht-in-erlaubnisliste" }]
];
for (const [name, eintrag] of SKIPS) {
  const r = bau(eintrag);
  check(name, r.success === false, `success=${r.success}`);
}
check("A7 Kein Skip-Marker traegt geschaetzte Kosten > 0",
  SKIPS.every(([, e]) => {
    const r = bau(e);
    return r.estimatedCost === 0 || r.estimatedCost === "unknown";
  }));

// Gegenprobe: ein ECHTER Aufruf bleibt erfolgreich — die Regel darf nicht
// pauschal alles auf false ziehen.
const echt = bau({ callType: "understanding", model: "gpt-5-mini", usage: { input_tokens: 100, output_tokens: 20 } });
check("A8 Ein echter Aufruf bleibt success:true", echt.success === true);
check("A9 Ein echter Aufruf wird bepreist", typeof echt.estimatedCost === "number" && echt.estimatedCost > 0);
const echtFehler = bau({ callType: "understanding", model: "gpt-5-mini", success: false, error: "Azure HTTP 500" });
check("A10 Ein echter FEHLER bleibt success:false und behaelt sein Modell",
  echtFehler.success === false && echtFehler.model === "gpt-5-mini");
check("A11 Ein echter Fehler wird NICHT als kostenfreier Nicht-Aufruf verbucht",
  echtFehler.keinAufruf === undefined);

// ── B · Die geschlossenen Verlustpfade stehen im Quelltext ──────────────────
// Verhaltenspruefung ist hier nicht moeglich, ohne einen echten HTTP-Stack zu
// simulieren; der Quelltextvertrag haelt die Korrektur trotzdem fest.
const fs = require("fs");
const aiQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/ai.js"), "utf8");

function abschnitt(von, bis) {
  const a = aiQuelle.indexOf(von);
  if (a < 0) return "";
  const b = bis ? aiQuelle.indexOf(bis, a) : -1;
  return aiQuelle.slice(a, b > 0 ? b : a + 2000);
}

const ueberlang = abschnitt("receivedBytes > MAX_AI_RESPONSE_BYTES", "data += chunk;");
check("B1 Ueberlanger Antwortrumpf wird protokolliert",
  ueberlang.includes("logLlmUsage(") && ueberlang.includes("response-too-large"), ueberlang.slice(0, 120));

const vertagung = abschnitt("if (!res.erlaubt)", "return requestOpenAI(");
check("B2 Die Anbieter-Vertagung wird protokolliert",
  vertagung.includes("logLlmUsage(") && vertagung.includes("anbietergrenze:"), vertagung.slice(0, 120));
check("B3 Die Anbieter-Vertagung wird als Nicht-Aufruf gefuehrt",
  vertagung.includes("keinAufruf: true") && vertagung.includes("success: false"));

check("B4 Der synchrone Aufbaufehler wird abgefangen und protokolliert",
  aiQuelle.includes("request-konstruktion:") && aiQuelle.includes("providerAufbauFehler"));
check("B5 Der Aufbaufehler reicht das Originalobjekt NICHT weiter",
  aiQuelle.includes("fehler.ursacheCode = kode") && !aiQuelle.includes("reject(fehler);"));
// B6: BEWUSST als offener Punkt festgehalten, nicht als Korrektur. Ein
// Zwischenstand reichte hier `...options` durch; der Gegenpruefer belegte, dass
// das die Anbieter-Ratengrenze schwaecht (der Retry ist ein zweiter echter
// Provideraufruf). Der Pfad bleibt unveraendert — dieser Test haelt fest, dass
// die Luecke bekannt und NICHT still geschlossen wurde.
check("B6 Der 400er-Fallback bleibt unveraendert (bekannter offener Punkt, nur OpenAI-Weg)",
  aiQuelle.includes("requestOpenAI(prompt, FALLBACK_MODEL, meta, { _budgetReserved: true })")
  && aiQuelle.includes("BEWUSST UNVERAENDERT (Review 2026-09-02)"));

// ── C · Keine Diagnose reicht einen rohen Fehlertext an den Client ──────────
check("C1 sourceNote traegt nur noch die bereinigte Fehlerklasse",
  aiQuelle.includes("weil die KI nicht erreichbar war (${fehlerKlasse(error)})"));
check("C2 fehlerKlasse gibt niemals eine rohe Meldung zurueck",
  (() => {
    const block = abschnitt("function fehlerKlasse(", "function providerAufbauFehler(");
    return block.includes('return "ki-fehler";') && !block.includes("return nachricht;\n  }");
  })());

// ── D · Die Ursache: unbedingtes Lese-Aendere-Schreibe im Blob ──────────────
// STAND 02.09. (korrigiert): der Blob-Schreibpfad ist WEITERHIN unbedingt — das
// bleibt richtig und wird hier weiter gemessen. Neu ist, dass er nicht mehr der
// EINZIGE Pfad ist: `recordLlmUsage` schreibt seit dem Vorbereitungssprint
// zusaetzlich relational (Dual-Write, Muster W-2/process_runs), sobald Flag
// `HELMUT_LLM_USAGE_RELATIONAL` UND Migration 20260902121500 vorliegen. Beides
// ist freigabepflichtig und AUS; der Blob bleibt in Phase 2 die Lesequelle.
// Die frueheren Zusagen D1/D2 („bekannte Restluecke") sind damit nicht falsch
// geworden, aber unvollstaendig — sie werden hier ausdruecklich ergaenzt statt
// stillschweigend ersetzt (CLAUDE.md §4.4, §7.11).
const storageQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
const recordBlock = storageQuelle.slice(
  storageQuelle.indexOf("async function recordLlmUsage("),
  storageQuelle.indexOf("async function getLlmUsage(")
);
check("D1 Der BLOB-Spiegel ist weiterhin ein Lese-Aendere-Schreibe-Zyklus",
  recordBlock.includes("await readAuthStore()") && recordBlock.includes("await writeAuthStore(store)"));
check("D2 Der Blob-Schreibvorgang ist unbedingt (kein Compare-and-Set)",
  !recordBlock.includes("If-Match") && !recordBlock.includes("compareAndSet"));
// NEU 02.09.: der kanonische Weg daneben.
check("D1a recordLlmUsage schreibt zusaetzlich relational (Dual-Write, Muster W-2)",
  recordBlock.includes("insertLlmUsageRelational") || recordBlock.includes("insert(llmUsageToRelationalRow"));
check("D1b Der relationale Pfad ist Default AUS und braucht Flag UND bereites Ziel",
  recordBlock.includes("llmUsageRelationalEnabled") && recordBlock.includes("v3StoreReady()"));
check("D1c Der relationale Schreibvorgang ist ein reiner Insert (kein merge-duplicates)",
  storageQuelle.includes("/rest/v1/llm_usage\"") && !storageQuelle.includes("llm_usage?on_conflict=id"));
check("D1d Der Blob bleibt vollstaendig kompatibel — er wird weiter geschrieben",
  recordBlock.includes("store.llmUsage = [record, ...(store.llmUsage || [])]"));
check("D3 Die Ringpuffergrenze bleibt bei 5.000 Eintraegen (unveraendert)",
  storageQuelle.includes("normalized.llmUsage = (normalized.llmUsage || []).slice(0, 5000)"));

// Der Verlust ist REPRODUZIERBAR: zwei nebenlaeufige Schreiber auf demselben
// Dokument, jeder liest den Stand vor dem anderen. Genau dieses Muster liegt
// `recordLlmUsage` zugrunde. Ohne Uhr, ohne Netz, ohne Zufall.
async function verlustProbe() {
  let dokument = { llmUsage: [] };
  const lies = async () => JSON.parse(JSON.stringify(dokument));
  const schreib = async (neu) => { dokument = JSON.parse(JSON.stringify(neu)); };
  // Beide lesen, DANN schreiben beide — exakt der Ablauf ohne Bedingung.
  const a = await lies();
  const b = await lies();
  a.llmUsage = [{ id: "A" }, ...a.llmUsage];
  b.llmUsage = [{ id: "B" }, ...b.llmUsage];
  await schreib(a);
  await schreib(b);
  return dokument.llmUsage.map((e) => e.id);
}

(async () => {
  const ids = await verlustProbe();
  check("D4 Zwei nebenlaeufige Anhaenge ohne Bedingung verlieren nachweislich einen Eintrag",
    ids.length === 1 && ids[0] === "B", JSON.stringify(ids));
  check("D5 Der Verlust erzeugt KEINEN Fehler — er ist lautlos (deshalb unentdeckt geblieben)",
    ids.length === 1);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
