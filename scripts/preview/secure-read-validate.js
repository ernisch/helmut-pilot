"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// Sprint 11 — Aufgabe 5: Secure Read Path gegen die Preview verdrahten und die
// fünf Gates + Fail-Closed nachweisen. Executor nutzt AUSSCHLIESSLICH die
// readonly-Rolle + Tenant-Claim → RLS erzwingt die Isolation zusätzlich.
// Keine Produktivverdrahtung.
// ═══════════════════════════════════════════════════════════════════════════

const { createSecureReadPath } = require("../../lib/helmut/secure-read.js");
const { queryAs, makeAsserter } = require("./lib-pg.js");
const { state, check } = makeAsserter();

// Preview-Executor: bindet Werte (Preview-only Literal-Substitution, Quotes
// verdoppelt) und führt als readonly-Rolle mit Tenant-Claim aus.
function previewExecutor(sql, ctx) {
  let text = sql.text;
  sql.values.forEach((v, i) => {
    text = text.replace("$" + (i + 1), "'" + String(v).replace(/'/g, "''") + "'");
  });
  const claims = ctx.tenant
    ? { role: "helmut_readonly", user_id: ctx.tenant }
    : { role: "helmut_readonly" };
  const r = queryAs("helmut_readonly", claims, text);
  if (!r.ok) throw new Error(r.message || "code " + r.code);
  return { ok: true, rows: r.rows };
}

const capabilities = {
  lage_briefing: { table: "briefings", tenantColumn: "user_id", columns: ["id", "user_id", "payload"], filters: [], mode: "read" },
  decision_by_id: { table: "decisions", tenantColumn: "user_id", columns: ["id", "user_id", "payload"], filters: ["id"], mode: "read", maxRows: 100 },
  office_output: { table: "office_outputs", tenantColumn: "user_id", columns: ["id", "user_id", "payload"], filters: ["id"], mode: "read" },
  shared_knowledge: { table: "knowledge_objects", shared: true, columns: ["id", "title"], filters: ["id"], mode: "read" },
};

const events = [];
const path = createSecureReadPath({
  capabilities,
  executor: previewExecutor,
  enabled: true,
  onEvent: (e) => events.push(e),
});

(async () => {
  console.log("\n════ AUFGABE 5 — Secure Read Path (Preview) ════");

  // ── Positiv: gültiger Read liefert nur den eigenen Tenant ──
  let r = await path.read({ capability: "lage_briefing", tenant: "mdb-a" });
  check("lage_briefing(A): ok + genau 1 eigene Zeile", r.ok && r.rows.length === 1 && r.rows[0][0] === "bf-a");
  r = await path.read({ capability: "lage_briefing", tenant: "mdb-c" });
  check("lage_briefing(C): ok + eigene Zeile", r.ok && r.rows.length === 1 && r.rows[0][0] === "bf-c");

  // ── Capability Gate ──
  r = await path.read({ capability: "does_not_exist", tenant: "mdb-a" });
  check("Capability Gate: unbekannte Capability → deny(unknown_capability)", !r.ok && r.reason === "unknown_capability");

  // ── Tenant Gate ──
  r = await path.read({ capability: "lage_briefing" });
  check("Tenant Gate: fehlender Tenant → deny(missing_tenant)", !r.ok && r.reason === "missing_tenant");
  r = await path.read({ capability: "lage_briefing", tenant: "" });
  check("Tenant Gate: leerer Tenant → deny(missing_tenant)", !r.ok && r.reason === "missing_tenant");
  r = await path.read({ capability: "lage_briefing", tenant: "a b'c" });
  check("Tenant Gate: manipulierter Tenant-String → deny(missing_tenant)", !r.ok && r.reason === "missing_tenant");

  // ── Parameter Allowlist ──
  r = await path.read({ capability: "decision_by_id", tenant: "mdb-a", params: { id: "dec-a-1" } });
  check("Allowlist: erlaubter Parameter id → ok, genau die Zeile", r.ok && r.rows.length === 1 && r.rows[0][0] === "dec-a-1");
  r = await path.read({ capability: "decision_by_id", tenant: "mdb-a", params: { user_id: "mdb-b" } });
  check("Allowlist: nicht-erlaubter Parameter user_id → deny(param_not_allowed)", !r.ok && r.reason === "param_not_allowed");
  r = await path.read({ capability: "decision_by_id", tenant: "mdb-a", params: { "id; drop table decisions": "x" } });
  check("Allowlist: injizierter Parametername → deny(param_not_allowed)", !r.ok && r.reason === "param_not_allowed");
  r = await path.read({ capability: "decision_by_id", tenant: "mdb-a", columns: ["payload", "secret_column"] });
  check("Allowlist: nicht-erlaubte Spalte → deny(column_not_allowed)", !r.ok && r.reason === "column_not_allowed");

  // ── Read-only Gate (Cross-Tenant über Parameter ist strukturell + per RLS unmöglich) ──
  r = await path.read({ capability: "decision_by_id", tenant: "mdb-a", params: { id: "dec-b-1" } });
  check("Read-only/RLS: A fordert B's dec-b-1 an → 0 Zeilen (Tenant-Filter + RLS)", r.ok && r.rows.length === 0);
  r = await path.read({ capability: "office_output", tenant: "mdb-b", params: { id: "off-a-1" } });
  check("Read-only/RLS: B fordert A's off-a-1 an → 0 Zeilen", r.ok && r.rows.length === 0);

  // ── shared capability: kein Tenant nötig, aber nur die Rolle ──
  r = await path.read({ capability: "shared_knowledge" });
  check("shared_knowledge: ohne Tenant erlaubt, liefert Korpus (2)", r.ok && r.rows.length === 2);

  // ── Fail Closed: Kill-Switch ──
  const disabled = createSecureReadPath({ capabilities, executor: previewExecutor, enabled: false });
  r = await disabled.read({ capability: "lage_briefing", tenant: "mdb-a" });
  check("Fail Closed: deaktivierter Pfad → deny(disabled)", !r.ok && r.reason === "disabled");

  // ── Fail Closed: Executor-Fehler → deny, kein Fallback ──
  const boom = createSecureReadPath({
    capabilities,
    executor: () => { throw new Error("db weg"); },
  });
  r = await boom.read({ capability: "lage_briefing", tenant: "mdb-a" });
  check("Fail Closed: Executor-Fehler → deny(executor_error), kein Datenleck", !r.ok && r.reason === "executor_error" && r.rows === null);

  // ── Fail Closed: Executor liefert Unsinn → deny ──
  const junk = createSecureReadPath({ capabilities, executor: () => ({ ok: true, rows: "nope" }) });
  r = await junk.read({ capability: "lage_briefing", tenant: "mdb-a" });
  check("Fail Closed: ungültiges Executor-Ergebnis → deny(executor_failed)", !r.ok && r.reason === "executor_failed");

  // ── Audit-Hook hat jede Entscheidung gesehen ──
  check("Audit-Hook: allow- und deny-Events erfasst", events.some((e) => e.verdict === "allow") && events.some((e) => e.verdict === "deny"));

  console.log("");
  const total = state.pass + state.fail;
  if (state.fail === 0) {
    console.log(`${state.pass}/${total} Secure-Read-Path-Assertionen erfolgreich (Preview).`);
    process.exit(0);
  } else {
    console.log(`${state.fail}/${total} FEHLGESCHLAGEN:`);
    state.failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
})();
