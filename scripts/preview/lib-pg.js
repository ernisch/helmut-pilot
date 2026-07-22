"use strict";

// Sprint 11 — Preview-Postgres-Treiber (kein pg-npm-Modul im Projekt:
// "dependencies": {} — daher psql via child_process, exakt wie die frühere
// Isolationsverifikation). Jeder Aufruf = eine FRISCHE Verbindung/Transaktion,
// die genau das nachbildet, was Supabase/PostgREST pro Request tut:
//   1) request.jwt.claims aus dem (bereits verifizierten) Token setzen
//   2) SET LOCAL ROLE <role aus dem 'role'-Claim>
//   3) die eigentliche Query ausführen
// Damit ist die DB-seitige Durchsetzung (RLS, Grants, Read-only-Rolle) real.

const { execFileSync } = require("child_process");

const PGBIN = process.env.PREVIEW_PGBIN || "/usr/lib/postgresql/16/bin";
const HOST = process.env.PREVIEW_PGHOST || "/tmp/pgp";
const PORT = process.env.PREVIEW_PGPORT || "54329";
// Verbindung als `authenticator` (NICHT-Superuser, PostgREST-Login-Rolle) —
// nicht als Superuser postgres. Ein Superuser-Login würde RLS/Grant-Prüfungen
// verfälschen (SET ROLE frei, RLS teils umgangen) und Befunde maskieren.
const USER = process.env.PREVIEW_PGUSER || "authenticator";
const DBNAME = process.env.PREVIEW_PGDATABASE || "postgres";

const ALLOWED_ROLES = new Set([
  "anon",
  "authenticated",
  "service_role",
  "helmut_readonly",
  "postgres",
]);

// Führt eine Query unter (role, claims) aus. claims: Objekt oder null (= kein
// Token). Rückgabe: { ok, rows: string[][], rowCount, code, message, ms }.
function queryAs(role, claims, sql) {
  if (!ALLOWED_ROLES.has(role)) throw new Error(`unzulässige Rolle: ${role}`);
  const claimsJson = claims == null ? "" : JSON.stringify(claims);
  const script = [
    "\\set VERBOSITY verbose",
    "\\pset tuples_only on",
    "\\pset format unaligned",
    "\\pset fieldsep '|'",
    "begin;",
    // Claims als Transaktions-GUC (local=true). Leerer String => kein Token.
    "select set_config('request.jwt.claims', :'claims', true);",
    `set local role ${role};`,
    "\\echo __QSTART__",
    sql.trim().replace(/;\s*$/, "") + ";",
    "\\echo __QEND__",
    "rollback;",
  ].join("\n");

  const args = [
    "-h", HOST, "-p", String(PORT), "-U", USER, "-d", DBNAME,
    "-X", "-q",
    "-v", "ON_ERROR_STOP=1",
    "-v", `claims=${claimsJson}`,
    "-f", "-",
  ];
  const t0 = process.hrtime.bigint();
  try {
    const out = execFileSync(`${PGBIN}/psql`, args, {
      input: script,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const m = out.match(/__QSTART__\n([\s\S]*?)__QEND__/);
    const body = m ? m[1] : "";
    const rows = body
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => l.split("|"));
    return { ok: true, rows, rowCount: rows.length, code: null, message: null, ms };
  } catch (e) {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const stderr = (e.stderr || "").toString();
    // SQLSTATE aus der verbose-Fehlermeldung (z. B. "permission denied ... 42501").
    const codeMatch = stderr.match(/SQLSTATE:?\s*([0-9A-Z]{5})/) ||
      stderr.match(/\b(42501)\b/);
    const msgMatch = stderr.match(/ERROR:\s*([^\n]+)/);
    return {
      ok: false,
      rows: [],
      rowCount: 0,
      code: codeMatch ? codeMatch[1] : null,
      message: msgMatch ? msgMatch[1].trim() : stderr.trim().split("\n")[0],
      ms,
    };
  }
}

// Bequemer Zähler für Assertions (Muster wie die bestehenden *-test.js).
function makeAsserter() {
  const state = { pass: 0, fail: 0, failures: [] };
  function check(name, cond, detail) {
    if (cond) {
      state.pass += 1;
      console.log(`PASS  ${name}`);
    } else {
      state.fail += 1;
      state.failures.push(name + (detail ? ` — ${detail}` : ""));
      console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    }
  }
  return { state, check };
}

module.exports = { queryAs, makeAsserter, ALLOWED_ROLES };
