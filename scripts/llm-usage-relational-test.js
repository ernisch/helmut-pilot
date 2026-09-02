"use strict";

// Offline-Vertragstest der RELATIONALEN ABLÖSUNG von `llmUsage` (W-2).
//
// Der Befund, den dieser Test absichert (Sicherheitsrahmen §17.2/§17.4):
// `recordLlmUsage` war ein UNBEDINGTER Lese-Ändere-Schreibe-Zyklus über den
// gemeinsamen `helmut_store`-Blob. Zwei nebenläufige KI-Aufrufe überschrieben
// sich LAUTLOS ihren Eintrag. Für `processRuns` wurde dasselbe Problem
// 2026-07-27 relational gelöst; `llmUsage` bekam die Behandlung nie.
//
// Geprüft wird:
//   A · die Projektion Blob → relationale Zeile (verlustfrei, ohne Koerzierung)
//   B · der Dual-Write (Default AUS, Blob bleibt kompatibel)
//   C · der Migrationsvertrag (additiv, Rollback, Namenskonvention)
//   D · die Rückrichtung und die Gegenprobe
//
// Kein Netz, keine Datenbank, kein Modellaufruf: jeder Schreib- und Lesevorgang
// läuft gegen injizierte Attrappen.

const fs = require("fs");
const path = require("path");
const P = require("../lib/helmut/llm-usage-relational");

const ROOT = path.join(__dirname, "..");
const MIGRATION = "20260902121500_llm_usage_relational.sql";
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const ECHTER_EINTRAG = Object.freeze({
  id: "llm-1788000000000-abc123",
  createdAt: "2026-09-02T06:00:00.000Z",
  tenantId: "mandat-a",
  profileId: "mandat-a",
  runId: "lauf-1",
  pipelineStep: "lageBriefing",
  sourceId: "quelle-1",
  packageId: "paket-1",
  vorgangId: "vorgang-1",
  knowledgeObjectId: "ko-1",
  politicianId: "mandat-a",
  userId: "mandat-a",
  model: "gpt-5-mini",
  callType: "lageBriefing",
  promptTokens: 1372,
  completionTokens: 214,
  totalTokens: 1586,
  estimatedCost: 0.001266,
  durationMs: 4342,
  success: true,
  error: null
});

// Ein Budget-Skip: KEIN Modellaufruf, kostenfrei — aber BEDARFSNACHWEIS.
const SKIP_EINTRAG = Object.freeze({
  id: "llm-1788000000001-def456",
  createdAt: "2026-09-02T06:01:00.000Z",
  politicianId: "mandat-a",
  userId: "mandat-a",
  model: "kein-aufruf",
  callType: "skipped-lage-narrativ",
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCost: 0,
  durationMs: "unknown",
  success: false,
  error: "budget",
  keinAufruf: true
});

// Ein Eintrag ohne usage-Block: die Zahlen stehen als STRING "unknown" im Blob.
const UNBEKANNT_EINTRAG = Object.freeze({
  id: "llm-1788000000002-ghi789",
  createdAt: "2026-09-02T06:02:00.000Z",
  politicianId: "mandat-b",
  userId: "mandat-b",
  model: "gpt-5-mini",
  callType: "understanding",
  promptTokens: "unknown",
  completionTokens: "unknown",
  totalTokens: "unknown",
  estimatedCost: "unknown",
  durationMs: "unknown",
  success: true,
  error: null
});

async function main() {
  console.log("Helmut — Vertragstest der relationalen llmUsage-Ablage (W-2)\n");

  // ── A · Projektion ────────────────────────────────────────────────────────
  console.log("A · Projektion Blob → relationale Zeile");
  const zeile = P.llmUsageToRelationalRow(ECHTER_EINTRAG);
  check("A1 Alle Kennungs- und Zählfelder wandern verlustfrei",
    zeile.id === ECHTER_EINTRAG.id
      && zeile.politician_id === "mandat-a" && zeile.tenant_id === "mandat-a"
      && zeile.run_id === "lauf-1" && zeile.pipeline_step === "lageBriefing"
      && zeile.prompt_tokens === 1372 && zeile.completion_tokens === 214
      && zeile.total_tokens === 1586 && zeile.estimated_cost === 0.001266
      && zeile.duration_ms === 4342 && zeile.success === true);
  check("A2 Die Quellenzuordnung (Sprint 7) geht mit",
    zeile.source_id === "quelle-1" && zeile.package_id === "paket-1"
      && zeile.vorgang_id === "vorgang-1" && zeile.knowledge_object_id === "ko-1");

  const unbekannt = P.llmUsageToRelationalRow(UNBEKANNT_EINTRAG);
  check("A3 „unknown\" wird NULL — niemals 0",
    unbekannt.prompt_tokens === null && unbekannt.completion_tokens === null
      && unbekannt.total_tokens === null && unbekannt.estimated_cost === null
      && unbekannt.duration_ms === null,
    "eine unbekannte Menge ist keine gemessene Null (CLAUDE.md §4.4)");

  const skip = P.llmUsageToRelationalRow(SKIP_EINTRAG);
  check("A4 Der Nicht-Aufruf-Marker überlebt die Projektion",
    skip.kein_aufruf === true && skip.success === false && skip.estimated_cost === 0,
    "ohne ihn wären 1.260 Budgetablehnungen nicht mehr von Azure-Fehlern zu trennen");
  check("A5 Ein echter Aufruf trägt den Marker NICHT",
    zeile.kein_aufruf === false);
  check("A6 Die Projektion wirft bei keiner Eingabe",
    (() => {
      for (const w of [null, undefined, {}, [], 0, "x", true]) {
        try { P.llmUsageToRelationalRow(w); } catch (_) { return false; }
      }
      return true;
    })());
  check("A7 Kein Prompt, keine Antwort, kein Geheimnis in der Zeile",
    (() => {
      const felder = Object.keys(P.llmUsageToRelationalRow({ ...ECHTER_EINTRAG, prompt: "GEHEIM", antwort: "GEHEIM" }));
      return !felder.some((f) => /prompt$|antwort|response|secret|key/i.test(f))
        && !JSON.stringify(P.llmUsageToRelationalRow({ ...ECHTER_EINTRAG, prompt: "GEHEIM" })).includes("GEHEIM");
    })());

  // ── B · Dual-Write ────────────────────────────────────────────────────────
  console.log("\nB · Dual-Write: Default AUS, Blob bleibt der Lesespiegel");
  check("B1 Ohne Flag ist der relationale Pfad aus",
    P.llmUsageRelationalEnabled({}) === false
      && P.llmUsageRelationalEnabled({ HELMUT_LLM_USAGE_RELATIONAL: "" }) === false
      && P.llmUsageRelationalEnabled({ HELMUT_LLM_USAGE_RELATIONAL: "off" }) === false);
  check("B2 Mit Flag ist er an",
    ["1", "true", "on", "yes"].every((w) => P.llmUsageRelationalEnabled({ HELMUT_LLM_USAGE_RELATIONAL: w })));
  check("B3 Eine unlesbare Umgebung schaltet ihn NICHT ein",
    (() => {
      const boese = new Proxy({}, { get() { throw new Error("unlesbar"); } });
      try { return P.llmUsageRelationalEnabled(boese) === false; } catch (_) { return false; }
    })());

  const storage = require("../lib/helmut/storage");
  const geschrieben = [];
  const eintrag = { callType: "lageBriefing", model: "gpt-5-mini", politicianId: "mandat-a", success: true };

  const ohneRelational = await storage.recordLlmUsage(eintrag, { relationalAktiv: false });
  check("B4 Ohne relationalen Pfad bleibt der Blob-Weg unverändert der einzige",
    ohneRelational && ohneRelational._ablage.relationalAktiv === false
      && ohneRelational._ablage.blob === true && ohneRelational._ablage.relational === false);
  check("B5 Der zurückgegebene Eintrag trägt weiterhin ALLE bisherigen Felder",
    ["id", "createdAt", "politicianId", "userId", "model", "callType", "promptTokens",
      "completionTokens", "totalTokens", "estimatedCost", "durationMs", "success", "error"]
      .every((f) => Object.prototype.hasOwnProperty.call(ohneRelational, f)));

  const mitRelational = await storage.recordLlmUsage(eintrag, {
    relationalAktiv: true,
    insertRelational: async (z) => { geschrieben.push(z); }
  });
  check("B6 Mit relationalem Pfad wird BEIDES geschrieben (Dual-Write)",
    mitRelational._ablage.relational === true && mitRelational._ablage.blob === true
      && geschrieben.length === 1 && geschrieben[0].call_type === "lageBriefing");

  const beiFehler = await storage.recordLlmUsage(eintrag, {
    relationalAktiv: true,
    insertRelational: async () => { throw new Error("PGRST205 relation not found"); }
  });
  check("B7 Ein relationaler Schreibfehler bricht den KI-Pfad nicht — wird aber ausgewiesen",
    beiFehler !== null && beiFehler._ablage.relational === false
      && beiFehler._ablage.blob === true
      && typeof beiFehler._ablage.fehler === "string" && beiFehler._ablage.fehler.length > 0);
  check("B8 Der Blob-Eintrag entsteht auch dann vollständig",
    beiFehler.callType === "lageBriefing");

  const storageQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
  check("B9 Der relationale Schreibvorgang ist ein reiner Insert — KEIN merge-duplicates",
    /\/rest\/v1\/llm_usage",\s*\{[\s\S]{0,200}?Prefer: "return=minimal"/.test(storageQuelle)
      && !/llm_usage\?on_conflict=id/.test(storageQuelle),
    "ein Upsert hätte den stillen Verlust vom Blob in die Tabelle verlegt");
  check("B10 Das Gate verlangt Flag UND ein bereites relationales Ziel",
    /llmUsageRelationalEnabled\(deps\.env \|\| process\.env\) && v3StoreReady\(\)/.test(storageQuelle));
  check("B11 Ein Fehler wird zusätzlich strukturiert geloggt (Aufrufer verwerfen das Ergebnis)",
    /\[llmUsage\] TELEMETRIEFEHLER/.test(storageQuelle));

  // ── C · Migrationsvertrag ─────────────────────────────────────────────────
  console.log("\nC · Migrationsvertrag (freigabepflichtig, NICHT angewendet)");
  const migrationPfad = path.join(ROOT, "supabase", "migrations", MIGRATION);
  const rollbackPfad = path.join(ROOT, "supabase", "migrations", `rollback_${MIGRATION}`);
  check("C1 Vorwärtsmigration mit 14-stelligem Zeitstempel vorhanden",
    fs.existsSync(migrationPfad) && /^\d{14}_/.test(MIGRATION));
  check("C2 Rollback nach Konvention `rollback_<vorwaertsname>.sql` vorhanden",
    fs.existsSync(rollbackPfad));
  const sql = fs.readFileSync(migrationPfad, "utf8");
  check("C3 Rein ADDITIV: kein drop/alter column type/delete/update",
    !/\bdrop table\b/i.test(sql) && !/\balter column\b/i.test(sql)
      && !/^\s*delete\s/im.test(sql) && !/^\s*update\s/im.test(sql));
  check("C4 Jede Ergänzung ist idempotent (`if not exists`)",
    (sql.match(/add column if not exists/g) || []).length >= 5
      && (sql.match(/create index if not exists/g) || []).length >= 3);
  check("C5 Die entscheidende Spalte `kein_aufruf` ist dabei",
    /add column if not exists kein_aufruf boolean not null default false/.test(sql));
  check("C6 Transaktional geklammert",
    /^begin;/m.test(sql) && /^commit;/m.test(sql));
  check("C7 Die Migration setzt die Tabelle voraus statt sie anzulegen",
    /to_regclass\('public\.llm_usage'\) is null/.test(sql) && !/create table/i.test(sql));
  const rollbackSql = fs.readFileSync(rollbackPfad, "utf8");
  check("C8 Das Rollback löscht die TABELLE nicht (sie ist älter als diese Migration)",
    !/^\s*drop table/im.test(rollbackSql)
      && (rollbackSql.match(/drop column if exists/g) || []).length >= 5);
  check("C9 Der Flagname steht in der Migration und im Code identisch",
    sql.includes("HELMUT_LLM_USAGE_RELATIONAL") && P.FLAG === "HELMUT_LLM_USAGE_RELATIONAL");
  check("C10 Die Aufbewahrungsmatrix kennt die relationale Tabelle",
    (() => {
      const { DATA_CLASSES } = require("../lib/helmut/retention");
      const eintragM = DATA_CLASSES && DATA_CLASSES.llm_usage;
      return Boolean(eintragM) && eintragM.retentionDays === 365
        && eintragM.loeschung === "purge-nach-alter";
    })());

  // ── D · Rückrichtung und Gegenprobe ───────────────────────────────────────
  console.log("\nD · Rückrichtung und Gegenprobe (der Dual-Write ist prüfbar)");
  const zurueck = P.relationalRowToLlmUsage(zeile);
  check("D1 Die Rückrichtung stellt die Blob-Form her, die alle Leser erwarten",
    zurueck.politicianId === "mandat-a" && zurueck.callType === "lageBriefing"
      && zurueck.promptTokens === 1372 && zurueck.success === true);
  check("D2 NULL wird wieder „unknown\" — nicht 0",
    (() => {
      const r = P.relationalRowToLlmUsage(unbekannt);
      return r.promptTokens === "unknown" && r.estimatedCost === "unknown";
    })());
  check("D3 Der Nicht-Aufruf kommt als Nicht-Aufruf zurück",
    (() => {
      const r = P.relationalRowToLlmUsage(skip);
      return r.keinAufruf === true && r.success === false && r.promptTokens === 0;
    })());
  check("D4 Der Vergleich meldet Gleichheit für eine korrekt projizierte Zeile",
    P.vergleicheLlmUsageProjektion(ECHTER_EINTRAG, zeile).gleich === true);
  check("D5 Der Vergleich findet eine Abweichung",
    (() => {
      const v = P.vergleicheLlmUsageProjektion(ECHTER_EINTRAG, { ...zeile, prompt_tokens: 999 });
      return v.gleich === false && v.abweichungen.some((a) => a.feld === "prompt_tokens");
    })());
  check("D6 Es gibt einen relationalen Lesepfad für die Gegenprobe",
    typeof storage.leseLlmUsageRelational === "function"
      && /leseLlmUsageRelational/.test(storageQuelle));
  check("D6a Der Lesepfad weist eine Kennung ab, die den PostgREST-Filter umbauen würde",
    await (async () => {
      let abgewiesen = 0;
      let durchgelassen = 0;
      for (const boese of ["boese,id)", "a,b", "x)or=(", "a b", "ü"]) {
        try {
          await storage.leseLlmUsageRelational({ politicianId: boese }, { request: async () => [] });
          durchgelassen += 1;
        } catch (_) { abgewiesen += 1; }
      }
      return abgewiesen === 5 && durchgelassen === 0;
    })(), "Komma und Klammer trennen in PostgREST Ausdrücke — Kodieren allein genügt hier nicht");
  check("D6b Eine gültige Slug-Kennung geht unverändert in den Filter",
    await (async () => {
      let url = "";
      await storage.leseLlmUsageRelational(
        { politicianId: "mandat-a" }, { request: async (u) => { url = u; return []; } });
      return url.includes("or=(politician_id.eq.mandat-a,user_id.eq.mandat-a)");
    })());
  check("D7 Der Lesepfad ist NICHT im Produktionslesepfad verdrahtet (Phase 3 ist offen)",
    (() => {
      const getUsage = storageQuelle.slice(
        storageQuelle.indexOf("async function getLlmUsage("),
        storageQuelle.indexOf("// --- LLM-Budget / Kostenkontrolle"));
      return !/leseLlmUsageRelational/.test(getUsage);
    })(), "der Blob bleibt in Phase 2 die Lesequelle — ehrlich benannt, nicht heimlich getauscht");

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error(`Unerwarteter Fehler: ${(fehler && fehler.stack) || fehler}`);
  process.exit(1);
});
