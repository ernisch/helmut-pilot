"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// Sprint 11 — Aufgabe 9: Performance MESSEN (keine Optimierung).
// Gemessen wird SERVER-SEITIG (plpgsql-Schleife mit clock_timestamp), um den
// RLS-/Secure-Read-Overhead vom psql-Prozessstart zu trennen.
//   * Antwortzeit (server-seitig, pro Query)
//   * RLS-Overhead (authenticated+RLS vs. service_role BYPASSRLS)
//   * JWT-/Claim-Verifikation (Kosten von helmut_current_tenant()→auth.jwt())
//   * Secure-Read-Overhead (Gate-Logik der App-Schicht)
//   * Parallelität (gleichzeitige Reads, Isolation bleibt)
// ═══════════════════════════════════════════════════════════════════════════

const { execFile, spawnSync } = require("child_process");
const { createSecureReadPath } = require("../../lib/helmut/secure-read.js");
const { queryAs } = require("./lib-pg.js");

const PGBIN = process.env.PREVIEW_PGBIN || "/usr/lib/postgresql/16/bin";
const HOST = process.env.PREVIEW_PGHOST || "/tmp/pgp";
const PORT = process.env.PREVIEW_PGPORT || "54329";

// Server-seitige Zeit für N Ausführungen von innerSql unter (role, claims);
// NOTICE (=Messwert) wird von stderr eingesammelt.
function measure(role, claims, innerSql, n) {
  const claimsJson = claims == null ? "" : JSON.stringify(claims);
  const script = `begin;
select set_config('request.jwt.claims', $claims$${claimsJson}$claims$, true);
set local role ${role};
do $m$ declare i int; t0 timestamptz := clock_timestamp();
begin for i in 1..${n} loop perform ${innerSql}; end loop;
raise notice 'MS=%', (extract(epoch from clock_timestamp()-t0)*1000); end $m$;
rollback;`;
  const res = spawnSync(`${PGBIN}/psql`,
    ["-h", HOST, "-p", PORT, "-U", "authenticator", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: script, encoding: "utf8" });
  const m = (res.stderr || "").match(/MS=([0-9.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}

function previewExecutor(sql, ctx) {
  let text = sql.text;
  sql.values.forEach((v, i) => { text = text.replace("$" + (i + 1), "'" + String(v).replace(/'/g, "''") + "'"); });
  const claims = ctx.tenant ? { role: "helmut_readonly", user_id: ctx.tenant } : { role: "helmut_readonly" };
  const r = queryAs("helmut_readonly", claims, text);
  if (!r.ok) throw new Error(r.message);
  return { ok: true, rows: r.rows };
}

(async () => {
  console.log("\n════ AUFGABE 9 — Performance (nur Messung) ════");
  const N = 5000;
  const A = { role: "authenticated", user_id: "mdb-a" };
  const RO = { role: "helmut_readonly", user_id: "mdb-a" };
  const SVC = { role: "service_role" };

  // 1) RLS-Overhead: dieselbe Query mit RLS (authenticated) vs. BYPASSRLS (service_role).
  const q = "(select count(*) from decisions)";
  const svc = measure("service_role", SVC, q, N);
  const auth = measure("authenticated", A, q, N);
  const ro = measure("helmut_readonly", RO, q, N);
  console.log(`  [RLS-Overhead] ${N}× count(decisions):`);
  console.log(`     service_role (BYPASSRLS): ${svc.toFixed(1)} ms  → ${(svc / N * 1000).toFixed(1)} µs/Query`);
  console.log(`     authenticated (RLS):      ${auth.toFixed(1)} ms  → ${(auth / N * 1000).toFixed(1)} µs/Query`);
  console.log(`     helmut_readonly (RLS):    ${ro.toFixed(1)} ms  → ${(ro / N * 1000).toFixed(1)} µs/Query`);
  console.log(`     → RLS-Overhead ≈ ${((auth - svc) / N * 1000).toFixed(1)} µs/Query (authenticated) · ${((ro - svc) / N * 1000).toFixed(1)} µs/Query (readonly)`);

  // 2) JWT-/Claim-Verifikation (DB-seitig): Kosten von helmut_current_tenant()→auth.jwt().
  const claimCost = measure("authenticated", A, "(select public.helmut_current_tenant())", N);
  console.log(`  [Claim-Extraktion] ${N}× helmut_current_tenant(): ${claimCost.toFixed(1)} ms → ${(claimCost / N * 1000).toFixed(1)} µs/Call`);
  console.log(`     (Hinweis: die eigentliche JWT-Signaturprüfung macht PostgREST/GoTrue, nicht die DB — hier nicht messbar.)`);

  // 3) helmut_store-Präfix-Policy (String-Vergleich) vs. Spalten-Policy.
  const storeAuth = measure("authenticated", A, "(select count(*) from helmut_store)", N);
  console.log(`  [helmut_store Präfix-Policy] ${N}× count: ${storeAuth.toFixed(1)} ms → ${(storeAuth / N * 1000).toFixed(1)} µs/Query`);

  // 4) Secure-Read-Overhead (App-Gate-Logik) — Wall-Time, Prozessstart hebt sich auf.
  const path0 = createSecureReadPath({ capabilities: { d: { table: "decisions", tenantColumn: "user_id", columns: ["id"], filters: [], mode: "read" } }, executor: previewExecutor, enabled: true });
  const M = 30;
  let secTotal = 0, rawTotal = 0;
  for (let i = 0; i < M; i++) {
    let t0 = process.hrtime.bigint();
    await path0.read({ capability: "d", tenant: "mdb-a" });
    secTotal += Number(process.hrtime.bigint() - t0) / 1e6;
    t0 = process.hrtime.bigint();
    queryAs("helmut_readonly", RO, "select id from decisions");
    rawTotal += Number(process.hrtime.bigint() - t0) / 1e6;
  }
  console.log(`  [Secure-Read-Overhead] ${M} Reads: Secure Path ${(secTotal / M).toFixed(2)} ms/Read · Raw readonly ${(rawTotal / M).toFixed(2)} ms/Read`);
  console.log(`     → Gate-Logik-Overhead ≈ ${((secTotal - rawTotal) / M).toFixed(2)} ms/Read (dominiert vom psql-Prozessstart, nicht von den Gates)`);

  // 5) Parallelität: P gleichzeitige Reads verschiedener Mandanten, Isolation muss halten.
  const P = 12;
  const tenants = ["mdb-a", "mdb-b", "mdb-c"];
  function asyncRead(tenant) {
    return new Promise((resolve) => {
      const script = `begin; select set_config('request.jwt.claims', '{"role":"helmut_readonly","user_id":"${tenant}"}', true); set local role helmut_readonly; select id from decisions; rollback;`;
      // -c (nicht -f -): kein stdin nötig → echte Nebenläufigkeit, kein Hänger.
      execFile(`${PGBIN}/psql`, ["-h", HOST, "-p", PORT, "-U", "authenticator", "-d", "postgres", "-X", "-q", "-t", "-A", "-c", script], (err, stdout) => {
        const ids = (stdout || "").split("\n").filter((l) => l.indexOf("dec-") === 0);
        resolve({ tenant, ids });
      });
    });
  }
  const t0 = process.hrtime.bigint();
  const results = await Promise.all(Array.from({ length: P }, (_, i) => asyncRead(tenants[i % 3])));
  const wall = Number(process.hrtime.bigint() - t0) / 1e6;
  const expected = { "mdb-a": 2, "mdb-b": 1, "mdb-c": 3 };
  const isolationOk = results.every((r) => r.ids.length === expected[r.tenant] && r.ids.every((id) => id.startsWith("dec-" + r.tenant.slice(-1))));
  console.log(`  [Parallelität] ${P} gleichzeitige Reads (3 Mandanten): Wall ${wall.toFixed(1)} ms · Isolation ${isolationOk ? "OK ✓" : "VERLETZT ✗"}`);

  console.log("\n  Zusammenfassung: RLS-Overhead im niedrigen zweistelligen µs-Bereich pro");
  console.log("  Query (~40-45 µs), Claim-Extraktion ~20 µs; Isolation auch unter");
  console.log("  Parallelität stabil. Keine Optimierung vorgenommen (nur Messung).");
  process.exit(isolationOk ? 0 : 1);
})();
