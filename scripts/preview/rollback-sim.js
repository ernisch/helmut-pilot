"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// Sprint 11 — Aufgabe 7: Rollback-Simulation ohne manuellen Eingriff.
// Zwei Ebenen:
//   (A) App-Ebene: Aktivierung/Rollback/Reaktivierung/Fehlerfall des Secure
//       Read Path über einen Kill-Switch (Flag) — Rückfall auf Legacy jederzeit.
//   (B) DB-Ebene: die committeten Migrationsdateien vorwärts/rückwärts anwenden
//       (Rolle da → weg → wieder da), idempotent, symmetrisch.
// Alles skriptgesteuert = kein manueller Eingriff. Nur Preview.
// ═══════════════════════════════════════════════════════════════════════════

const { execFileSync } = require("child_process");
const path = require("path");
const { createSecureReadPath } = require("../../lib/helmut/secure-read.js");
const { queryAs, makeAsserter } = require("./lib-pg.js");
const { state, check } = makeAsserter();

const PGBIN = process.env.PREVIEW_PGBIN || "/usr/lib/postgresql/16/bin";
const HOST = process.env.PREVIEW_PGHOST || "/tmp/pgp";
const PORT = process.env.PREVIEW_PGPORT || "54329";
const REPO = path.resolve(__dirname, "../..");

function applySql(file) {
  execFileSync(`${PGBIN}/psql`, ["-h", HOST, "-p", PORT, "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1", "-f", file], { stdio: ["ignore", "ignore", "pipe"] });
}
function roleExists() {
  const r = queryAs("service_role", { role: "service_role" }, "select count(*) from pg_roles where rolname='helmut_readonly'");
  return r.ok && r.rows[0][0] === "1";
}
function publicHasExecute() {
  // Nach Rollback muss PUBLIC wieder EXECUTE auf der Kanarienfunktion haben.
  const r = queryAs("service_role", { role: "service_role" },
    "select has_function_privilege('public','public.rpc_canary_all_office()','execute')");
  return r.ok && r.rows[0][0] === "t";
}

function previewExecutor(sql, ctx) {
  let text = sql.text;
  sql.values.forEach((v, i) => { text = text.replace("$" + (i + 1), "'" + String(v).replace(/'/g, "''") + "'"); });
  const claims = ctx.tenant ? { role: "helmut_readonly", user_id: ctx.tenant } : { role: "helmut_readonly" };
  const r = queryAs("helmut_readonly", claims, text);
  if (!r.ok) throw new Error(r.message || "code " + r.code);
  return { ok: true, rows: r.rows };
}
const caps = { lage: { table: "briefings", tenantColumn: "user_id", columns: ["id"], filters: [], mode: "read" } };
function legacyRead(tenant) {
  const r = queryAs("service_role", { role: "service_role" }, `select id from briefings where user_id='${tenant}'`);
  return r.ok ? r.rows.length : -1;
}

(async () => {
  console.log("\n════ AUFGABE 7 — Rollback (App-Flag + DB-Migration) ════");

  // ── (A) App-Ebene: Zustandsmaschine über den Kill-Switch ──
  let enabled = true;
  const mk = () => createSecureReadPath({ capabilities: caps, executor: previewExecutor, enabled });

  // 1) Aktivierung
  let r = await mk().read({ capability: "lage", tenant: "mdb-a" });
  check("A1 Aktivierung: Secure Read liefert eigene Daten", r.ok && r.rows.length === 1);

  // 2) Rollback (Flag aus) → Secure verweigert, Legacy läuft weiter (kein Ausfall)
  enabled = false;
  r = await mk().read({ capability: "lage", tenant: "mdb-a" });
  check("A2 Rollback: Secure Read deaktiviert → deny(disabled)", !r.ok && r.reason === "disabled");
  check("A2 Rollback: Legacy-Pfad unbeeinträchtigt (Fallback ohne Eingriff)", legacyRead("mdb-a") === 1);

  // 3) Erneute Aktivierung
  enabled = true;
  r = await mk().read({ capability: "lage", tenant: "mdb-a" });
  check("A3 Reaktivierung: Secure Read wieder funktionsfähig", r.ok && r.rows.length === 1);

  // 4) Fehlerfall → automatischer Fail-Closed, danach Rollback auf Legacy
  const boom = createSecureReadPath({ capabilities: caps, executor: () => { throw new Error("db weg"); }, enabled: true });
  r = await boom.read({ capability: "lage", tenant: "mdb-a" });
  check("A4 Fehlerfall: Secure Read fail-closed → deny(executor_error)", !r.ok && r.reason === "executor_error");
  check("A4 Rollback: Legacy fängt den Fehlerfall auf (kein Datenausfall)", legacyRead("mdb-a") === 1);

  // ── (B) DB-Ebene: Migration vorwärts/rückwärts, idempotent + symmetrisch ──
  check("B0 Ausgangszustand: helmut_readonly-Rolle existiert", roleExists());

  applySql(path.join(REPO, "supabase/migrations/20260722_readonly_role_rollback.sql"));
  check("B1 DB-Rollback: Rolle entfernt", roleExists() === false);
  check("B1 DB-Rollback: PUBLIC-EXECUTE-Default wiederhergestellt", publicHasExecute());

  applySql(path.join(REPO, "supabase/migrations/20260722_readonly_role.sql"));
  check("B2 Reaktivierung: Rolle wieder da (NOBYPASSRLS)", roleExists());
  {
    const rr = queryAs("service_role", { role: "service_role" }, "select rolbypassrls from pg_roles where rolname='helmut_readonly'");
    check("B2 Reaktivierung: Rolle korrekt gehärtet (bypassrls=false)", rr.ok && rr.rows[0][0] === "f");
  }

  // Idempotenz: Vorwärts-Migration erneut → kein Fehler, Zustand stabil
  applySql(path.join(REPO, "supabase/migrations/20260722_readonly_role.sql"));
  check("B3 Idempotenz: erneutes Anwenden ohne Fehler, Rolle bleibt", roleExists());

  // funktionaler Nachweis nach dem Zyklus: readonly liest wieder isoliert
  r = await mk().read({ capability: "lage", tenant: "mdb-b" });
  check("B4 Nach Zyklus: Secure Read isoliert korrekt (B sieht nur B)", r.ok && r.rows.length === 1 && r.rows[0][0] === "bf-b");

  console.log("");
  const total = state.pass + state.fail;
  if (state.fail === 0) {
    console.log(`${state.pass}/${total} Rollback-Assertionen erfolgreich (kein manueller Eingriff nötig).`);
    process.exit(0);
  } else {
    console.log(`${state.fail}/${total} FEHLGESCHLAGEN:`);
    state.failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
})();
