#!/usr/bin/env node
// =============================================================================
// Contract-Snapshot-Test für /api/app/start  (V3-Plan, Commit C2)
// =============================================================================
// Sicherheitsnetz VOR dem Datenmotor-V3-Umbau. Friert den heutigen Server-→-
// Frontend-Vertrag ein, damit spätere Motor-Änderungen ihn nicht STILL brechen
// (kein Crash, nur verschwundene Items / kaputtes Styling).
//
// Modus: offline, in-process, deterministisch (kein Netzwerk, kein Supabase,
// keine KI) — dasselbe Muster wie scripts/p1-security-check.js. Es wird KEIN
// Produktverhalten geändert; der Test liest nur /api/app/start.
//
// Der Test sichert ab:
//   1) Feldnamen der /api/app/start-Antwort   (Struktur-Snapshot)
//   2) relevante Enums                         (decision/priorityType/linkType)
//   3) decision-Werte                          ∈ {Sofort reagieren, Beobachten, Ignorieren}
//   4) priorityType-Werte                      ∈ {action, watch, chance, risk, ignore, high}
//   5) linkType-Verhalten                      Server-Werte gültig + Client-"nur direct"-Regel verankert
//   6) Server-Decision gegen Client-Schwelle   60/40-Regel auf relevance_score, beidseitig verankert
//   7) Struktur von Items/Briefings/Empfehlungen  (Pflichtfelder)
//   8) Keine stillen Vertragsbrüche            (entferntes/umbenanntes Feld = FAIL)
//
// Ausführen:
//   node scripts/contract-snapshot-test.js            # prüfen
//   node scripts/contract-snapshot-test.js --update   # Struktur-Snapshot neu aufnehmen
//   npm run test:contract
//
// Exitcode 0 = grün, 1 = mind. ein Vertragsbruch.
// =============================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const SNAPSHOT_PATH = path.join(__dirname, "contract", "app-start.contract.json");
const UPDATE = process.argv.slice(2).includes("--update");

// --- Vertrags-Vokabular (Quelle der Wahrheit: aktueller Client + Server) -----
const DECISION_ENUM = ["Sofort reagieren", "Beobachten", "Ignorieren"];
const PRIORITY_TYPE_ENUM = ["action", "watch", "chance", "risk", "ignore", "high"];
// Werte, die der Server erzeugen kann (crawler.classifyLinkType + storage). Der
// Client behandelt NUR "direct" als präzise (hasPreciseSource) — siehe Punkt 5.
const LINK_TYPE_ENUM = ["direct", "publisher", "google_proxy", "missing", "homepage"];

const TOP_LEVEL_KEYS = ["aiStatus", "briefing", "notes", "profile", "tasks"];
const BRIEFING_REQUIRED_KEYS = [
  "items", "personalizedRecommendations", "situationalBriefing", "homeSections",
  "helmutAssessment", "decisionMetrics", "status", "generatedAt", "personMentions"
];
const ITEM_REQUIRED_KEYS = ["id", "title", "decision", "priority", "finalScore", "recommendedAction", "primarySource", "sources"];
const REC_REQUIRED_KEYS = ["id", "relevance_score", "current_priority", "recommended_action", "personal_relevance_explanation", "action_type", "status"];

const results = [];
const warnings = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
function warn(message) {
  warnings.push(message);
  console.log(`WARN  ${message}`);
}

// --- Offline, deterministisch: bekannte NICHT-leere Werte VOR dem require, damit
//     loadLocalEnv() (setzt nur ungesetzte Keys) sie nicht aus .env.local kippt.
const TEST_PILOT_SECRET = "contract-test-secret";
process.env.HELMUT_AUTH_MODE = "pilot";        // nicht "accounts" -> Legacy-Pilotgate
process.env.PILOT_SECRET = TEST_PILOT_SECRET;   // bekannt -> Bearer-Auth im Test
process.env.HELMUT_STORAGE_BACKEND = "local";   // nicht "supabase" -> lokaler Datei-Store

const handler = require(path.join(root, "server.js"));

function request(server, pathname) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, method: "GET", path: pathname,
      headers: { Authorization: `Bearer ${TEST_PILOT_SECRET}` }, timeout: 30000
    }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Struktur-Beschreibung (Snapshot): nur Feldnamen + Werttypen, KEINE volatilen
// Daten (Scores/Datumswerte/Artikeltexte) — damit der Test nicht flackert.
//   object  -> { t: "object", keys: { k: shape } }   (Keys sortiert)
//   array   -> { t: "array",  el: <Vereinigungs-Shape der Elemente> | null }
//   primitiv-> { t: "string"|"number"|"boolean"|"null" }
// ---------------------------------------------------------------------------
function describe(value) {
  if (value === null) return { t: "null" };
  if (Array.isArray(value)) {
    if (!value.length) return { t: "array", el: null };
    const merged = {};
    let prim = null;
    for (const el of value) {
      if (el && typeof el === "object" && !Array.isArray(el)) Object.assign(merged, el);
      else prim = el;
    }
    const el = Object.keys(merged).length ? describe(merged) : describe(prim);
    return { t: "array", el };
  }
  if (typeof value === "object") {
    const keys = {};
    for (const k of Object.keys(value).sort()) keys[k] = describe(value[k]);
    return { t: "object", keys };
  }
  return { t: typeof value };
}

// Vergleich Snapshot (erwartet) gegen aktuell. Politik:
//   - Feld im Snapshot, aber jetzt WEG  -> FAIL (stiller Vertragsbruch)
//   - Typwechsel eines Blatts           -> FAIL
//   - NEUES Feld (nur jetzt vorhanden)  -> WARN (additiv, bricht Frontend nicht)
//   - Array jetzt leer                  -> Element-Shape nicht prüfbar, überspringen
function compareShape(snap, cur, pathStr, issues) {
  if (!snap || !cur) return;
  if (snap.t !== cur.t) {
    // Array, das aktuell leer ist (el:null) ist mit befülltem Snapshot verträglich
    // und umgekehrt — kein Typwechsel, nur datenabhängig.
    if (!(snap.t === "array" || cur.t === "array")) {
      issues.push({ level: "fail", msg: `Typwechsel bei ${pathStr || "<root>"}: erwartet ${snap.t}, jetzt ${cur.t}` });
    }
    return;
  }
  if (snap.t === "object") {
    for (const k of Object.keys(snap.keys)) {
      if (!(k in cur.keys)) {
        issues.push({ level: "fail", msg: `Feld entfernt/umbenannt: ${joinPath(pathStr, k)}` });
      } else {
        compareShape(snap.keys[k], cur.keys[k], joinPath(pathStr, k), issues);
      }
    }
    for (const k of Object.keys(cur.keys)) {
      if (!(k in snap.keys)) issues.push({ level: "warn", msg: `Neues Feld (additiv): ${joinPath(pathStr, k)}` });
    }
  } else if (snap.t === "array") {
    if (snap.el && cur.el) compareShape(snap.el, cur.el, `${pathStr}[]`, issues);
    else if (snap.el && !cur.el) issues.push({ level: "warn", msg: `Array leer in diesem Lauf, Element-Struktur nicht prüfbar: ${pathStr}` });
  }
}
function joinPath(a, b) { return a ? `${a}.${b}` : b; }

// Rekursiver Walk: sammelt alle Werte eines Feldnamens mit JSON-Pfad (für Enums).
function collectField(value, fieldName, pathStr, out) {
  if (Array.isArray(value)) {
    value.forEach((el, i) => collectField(el, fieldName, `${pathStr}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === fieldName) out.push({ path: joinPath(pathStr, k), value: v });
      collectField(v, fieldName, joinPath(pathStr, k), out);
    }
  }
}
// Sammelt alle Objekte, die BEIDE Felder tragen (für die Server/Client-Konsistenz).
function collectObjectsWith(value, fieldA, fieldB, out) {
  if (Array.isArray(value)) {
    value.forEach((el) => collectObjectsWith(el, fieldA, fieldB, out));
  } else if (value && typeof value === "object") {
    if (fieldA in value && fieldB in value) out.push(value);
    for (const v of Object.values(value)) collectObjectsWith(v, fieldA, fieldB, out);
  }
}

// Die EXAKTE Client-Regel (client.js: recommendationToDecisionItem).
function clientDecisionFromScore(score) {
  return score >= 60 ? "Sofort reagieren" : score >= 40 ? "Beobachten" : "Ignorieren";
}

async function main() {
  console.log("== Helmut Contract-Snapshot-Test: /api/app/start ==\n");

  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  let json;
  try {
    const res = await request(server, "/api/app/start");
    check("Antwort ist HTTP 200 (Vertrag erreichbar, Auth ok)", res.status === 200, `status=${res.status}`);
    if (res.status !== 200) { await new Promise((r) => server.close(r)); return finish(); }
    try {
      json = JSON.parse(res.body);
      check("Antwort ist gültiges JSON", true);
    } catch (e) {
      check("Antwort ist gültiges JSON", false, e.message);
      await new Promise((r) => server.close(r));
      return finish();
    }
  } finally {
    await new Promise((r) => server.close(r));
  }

  // --- (1) Feldnamen: Top-Level + Pflicht-Struktur -------------------------
  const topKeys = Object.keys(json).sort();
  check("(1) Top-Level-Felder vollständig {aiStatus,briefing,notes,profile,tasks}",
    TOP_LEVEL_KEYS.every((k) => topKeys.includes(k)),
    `keys=${JSON.stringify(topKeys)}`);
  check("(1) profile ist Objekt, tasks/notes sind Arrays",
    json.profile && typeof json.profile === "object"
      && Array.isArray(json.tasks) && Array.isArray(json.notes),
    `profile=${typeof json.profile} tasks=${Array.isArray(json.tasks)} notes=${Array.isArray(json.notes)}`);
  check("(1) aiStatus trägt {enabled:boolean, model:string}",
    json.aiStatus && typeof json.aiStatus.enabled === "boolean" && typeof json.aiStatus.model === "string",
    `aiStatus=${JSON.stringify(json.aiStatus)}`);

  const briefing = json.briefing || {};
  const missingBriefingKeys = BRIEFING_REQUIRED_KEYS.filter((k) => !(k in briefing));
  check("(7) briefing trägt alle Pflichtfelder (items, personalizedRecommendations, homeSections, …)",
    missingBriefingKeys.length === 0,
    missingBriefingKeys.length ? `fehlend=${JSON.stringify(missingBriefingKeys)}` : "");
  check("(7) briefing.items & personalizedRecommendations & situationalBriefing sind Arrays",
    Array.isArray(briefing.items) && Array.isArray(briefing.personalizedRecommendations) && Array.isArray(briefing.situationalBriefing),
    `items=${Array.isArray(briefing.items)} recs=${Array.isArray(briefing.personalizedRecommendations)}`);

  // --- (7) Struktur der Items --------------------------------------------
  const items = Array.isArray(briefing.items) ? briefing.items : [];
  if (items.length) {
    const badItems = items.filter((it) => ITEM_REQUIRED_KEYS.some((k) => !(k in it)));
    check("(7) Jedes briefing.item trägt die Pflichtfelder (id,title,decision,priority,finalScore,recommendedAction,primarySource,sources)",
      badItems.length === 0,
      badItems.length ? `erstes fehlerhaftes item-keys=${JSON.stringify(Object.keys(badItems[0]).sort())}` : `${items.length} items geprüft`);
  } else {
    warn("(7) Keine briefing.items im aktuellen Store — Item-Feldprüfung übersprungen.");
  }

  // --- (7) Struktur der Empfehlungen -------------------------------------
  const recs = Array.isArray(briefing.personalizedRecommendations) ? briefing.personalizedRecommendations : [];
  if (recs.length) {
    const badRecs = recs.filter((r) => REC_REQUIRED_KEYS.some((k) => !(k in r)));
    check("(7) Jede personalizedRecommendation trägt die Pflichtfelder (id,relevance_score,current_priority,recommended_action,…)",
      badRecs.length === 0,
      badRecs.length ? `erste fehlerhafte rec-keys=${JSON.stringify(Object.keys(badRecs[0]).sort())}` : `${recs.length} recs geprüft`);
  } else {
    warn("(7) Keine personalizedRecommendations im aktuellen Store — Rec-Feldprüfung übersprungen.");
  }

  // --- (2)(3) decision-Enum überall im Baum -------------------------------
  const decisions = [];
  collectField(json, "decision", "", decisions);
  const badDecisions = decisions.filter((d) => typeof d.value === "string" && !DECISION_ENUM.includes(d.value));
  check("(2)(3) Alle decision-Werte ∈ {Sofort reagieren, Beobachten, Ignorieren}",
    badDecisions.length === 0,
    badDecisions.length ? `ungültig: ${badDecisions.slice(0, 3).map((d) => `${d.path}=${JSON.stringify(d.value)}`).join(", ")}`
      : `${decisions.length} decision-Vorkommen geprüft`);

  // --- (4) priorityType-Enum überall im Baum ------------------------------
  const ptypes = [];
  collectField(json, "priorityType", "", ptypes);
  const badPtypes = ptypes.filter((p) => typeof p.value === "string" && p.value && !PRIORITY_TYPE_ENUM.includes(p.value));
  check("(4) Alle priorityType-Werte ∈ {action, watch, chance, risk, ignore, high}",
    badPtypes.length === 0,
    badPtypes.length ? `ungültig: ${badPtypes.slice(0, 3).map((p) => `${p.path}=${JSON.stringify(p.value)}`).join(", ")}`
      : `${ptypes.length} priorityType-Vorkommen geprüft`);

  // --- (5) linkType: Server-Werte gültig + Client-"nur direct"-Regel verankert
  const linkTypes = [];
  collectField(json, "linkType", "", linkTypes);
  const badLinkTypes = linkTypes.filter((l) => typeof l.value === "string" && l.value && !LINK_TYPE_ENUM.includes(l.value));
  check("(5) Alle linkType-Werte ∈ bekannter Server-Menge {direct, publisher, google_proxy, missing, homepage}",
    badLinkTypes.length === 0,
    badLinkTypes.length ? `unbekannt: ${badLinkTypes.slice(0, 3).map((l) => `${l.path}=${JSON.stringify(l.value)}`).join(", ")}`
      : `${linkTypes.length} linkType-Vorkommen geprüft`);

  // --- (6) Server-Decision gegen Client-Schwellenlogik --------------------
  // Jede sichtbare Empfehlung wird client-seitig aus relevance_score entschieden.
  const scoredRecs = recs.filter((r) => "relevance_score" in r);
  const nonNumeric = scoredRecs.filter((r) => typeof r.relevance_score !== "number" || !Number.isFinite(r.relevance_score));
  check("(6) Jede Empfehlung hat numerisches relevance_score (treibt die Client-Entscheidung)",
    nonNumeric.length === 0,
    nonNumeric.length ? `nicht-numerisch: ${nonNumeric.length}/${scoredRecs.length}` : `${scoredRecs.length} recs geprüft`);
  const wouldDecide = scoredRecs.map((r) => clientDecisionFromScore(r.relevance_score));
  check("(6) Client-Schwelle (≥60/≥40) liefert für jede Empfehlung eine gültige decision",
    wouldDecide.every((d) => DECISION_ENUM.includes(d)),
    `abgeleitet: ${JSON.stringify(countBy(wouldDecide))}`);

  // Server-seitige Items tragen eine eigene decision — muss im Enum liegen.
  check("(6) Jede briefing.item.decision ist eine gültige Server-Entscheidung",
    items.every((it) => DECISION_ENUM.includes(it.decision)),
    `${items.length} items geprüft`);

  // Konsistenz überall dort, wo ein Objekt BEIDES trägt (relevance_score + decision).
  const bothObjs = [];
  collectObjectsWith(json, "relevance_score", "decision", bothObjs);
  const inconsistent = bothObjs.filter((o) =>
    typeof o.relevance_score === "number" && typeof o.decision === "string"
    && clientDecisionFromScore(o.relevance_score) !== o.decision);
  check("(6) Wo Server BEIDES liefert (relevance_score + decision): stimmt mit Client-Schwelle überein",
    inconsistent.length === 0,
    inconsistent.length ? `divergent: ${inconsistent.slice(0, 3).map((o) => `score=${o.relevance_score} decision=${o.decision}`).join(", ")}`
      : `${bothObjs.length} Objekte mit beiden Feldern`);

  // --- (5)(6) Client-Quelle verankern: Schwelle + hasPreciseSource-Regel ---
  const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");
  check("(6) Client-Schwellenregel unverändert (relevance_score ≥60/≥40 → decision)",
    clientSrc.includes('relevance_score >= 60 ? "Sofort reagieren" : recommendation.relevance_score >= 40 ? "Beobachten" : "Ignorieren"'),
    "Ändert sich die Client-Schwelle, muss die Server-Decision-Logik mitgezogen werden.");
  check("(5) Client-Regel 'nur linkType===direct ist präzise' verankert (hasPreciseSource)",
    clientSrc.includes('source?.linkType && source.linkType !== "direct"'),
    "Ein Item ohne direkten Link wird vom Client STILL ausgeblendet.");

  // --- (1)(8) Struktur-Snapshot gegen eingefrorenen Vertrag ---------------
  const currentShape = describe(json);
  if (UPDATE || !fs.existsSync(SNAPSHOT_PATH)) {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(currentShape, null, 2) + "\n", "utf8");
    check(`(1)(8) Struktur-Snapshot ${UPDATE ? "aktualisiert" : "erstmalig aufgenommen"} (${path.relative(root, SNAPSHOT_PATH)})`, true,
      "Bei --update oder erstem Lauf gilt der aktuelle Zustand als Quelle der Wahrheit.");
  } else {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    const issues = [];
    compareShape(snap, currentShape, "", issues);
    const fails = issues.filter((i) => i.level === "fail");
    issues.filter((i) => i.level === "warn").slice(0, 20).forEach((i) => warn(`(8) ${i.msg}`));
    check("(1)(8) Keine stillen Vertragsbrüche (kein Feld entfernt/umbenannt, kein Typwechsel)",
      fails.length === 0,
      fails.length ? fails.slice(0, 8).map((f) => f.msg).join(" | ") : "Struktur deckt sich mit dem eingefrorenen Vertrag.");
  }

  finish();
}

function countBy(arr) {
  return arr.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Vertrags-Checks bestanden, ${warnings.length} Warnungen.`);
  if (failed.length) {
    console.log("Fehlgeschlagen:", failed.map((f) => f.name).join("; "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("Contract-Snapshot-Test abgestürzt:", error);
  process.exit(1);
});
