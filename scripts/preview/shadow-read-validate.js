"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// Sprint 11 — Aufgabe 6: Shadow Read. Legacy-Pfad (service_role + App-seitiger
// user_id-Filter, heutiges Production-Modell) und Secure Read Path (readonly +
// RLS) laufen PARALLEL gegen dieselbe Preview. Verglichen werden Coverage,
// Vollständigkeit, Abweichungen, Fehler und Performance. Nur Preview.
// ═══════════════════════════════════════════════════════════════════════════

const { createSecureReadPath } = require("../../lib/helmut/secure-read.js");
const { queryAs, makeAsserter } = require("./lib-pg.js");
const { state, check } = makeAsserter();

function previewExecutor(sql, ctx) {
  let text = sql.text;
  sql.values.forEach((v, i) => { text = text.replace("$" + (i + 1), "'" + String(v).replace(/'/g, "''") + "'"); });
  const claims = ctx.tenant ? { role: "helmut_readonly", user_id: ctx.tenant } : { role: "helmut_readonly" };
  const r = queryAs("helmut_readonly", claims, text);
  if (!r.ok) throw new Error(r.message || "code " + r.code);
  return { ok: true, rows: r.rows };
}

// Legacy-Pfad: exakt das heutige Modell — service_role (BYPASSRLS) + expliziter
// App-seitiger user_id-Filter (assertTenant-Äquivalent).
function legacyRead(table, tenant) {
  const t0 = process.hrtime.bigint();
  const r = queryAs("service_role", { role: "service_role" },
    `select id from ${table} where user_id = '${tenant.replace(/'/g, "''")}' order by id`);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (!r.ok) return { ids: null, ms, error: r.message };
  return { ids: r.rows.map((row) => row[0]).sort(), ms, error: null };
}

const capabilities = {
  decisions: { table: "decisions", tenantColumn: "user_id", columns: ["id"], filters: [], mode: "read" },
  office_outputs: { table: "office_outputs", tenantColumn: "user_id", columns: ["id"], filters: [], mode: "read" },
  briefings: { table: "briefings", tenantColumn: "user_id", columns: ["id"], filters: [], mode: "read" },
};
const path = createSecureReadPath({ capabilities, executor: previewExecutor, enabled: true });

(async () => {
  console.log("\n════ AUFGABE 6 — Shadow Read (Legacy ∥ Secure) ════");
  const tenants = ["mdb-a", "mdb-b", "mdb-c"];
  const tables = ["decisions", "office_outputs", "briefings"];
  const agg = { pairs: 0, deviations: 0, legacyMs: 0, secureMs: 0, legacyRows: 0, secureRows: 0, errors: 0 };
  const report = [];

  for (const table of tables) {
    for (const tenant of tenants) {
      const legacy = legacyRead(table, tenant);
      const t0 = process.hrtime.bigint();
      const sec = await path.read({ capability: table, tenant });
      const secMs = Number(process.hrtime.bigint() - t0) / 1e6;
      const secIds = sec.ok ? sec.rows.map((r) => r[0]).sort() : null;

      const legacyErr = legacy.error != null;
      const secErr = !sec.ok;
      if (legacyErr || secErr) agg.errors += 1;

      const equal = !legacyErr && !secErr &&
        legacy.ids.length === secIds.length &&
        legacy.ids.every((id, i) => id === secIds[i]);
      if (!equal) agg.deviations += 1;

      agg.pairs += 1;
      agg.legacyMs += legacy.ms;
      agg.secureMs += secMs;
      agg.legacyRows += legacy.ids ? legacy.ids.length : 0;
      agg.secureRows += secIds ? secIds.length : 0;
      report.push({ table, tenant, legacy: legacy.ids ? legacy.ids.length : "ERR", secure: secIds ? secIds.length : "ERR", match: equal });
    }
  }

  console.log("  Tabelle          Tenant   Legacy  Secure  Match");
  for (const row of report) {
    console.log(`  ${row.table.padEnd(15)} ${row.tenant.padEnd(7)} ${String(row.legacy).padStart(5)}  ${String(row.secure).padStart(6)}  ${row.match ? "✓" : "✗"}`);
  }
  console.log(`\n  Coverage:       ${agg.pairs} Paare geprüft (3 Tabellen × 3 Mandanten)`);
  console.log(`  Vollständigkeit: Legacy ${agg.legacyRows} Zeilen ↔ Secure ${agg.secureRows} Zeilen`);
  console.log(`  Abweichungen:   ${agg.deviations}`);
  console.log(`  Fehler:         ${agg.errors}`);
  console.log(`  Performance:    Legacy ~${(agg.legacyMs / agg.pairs).toFixed(1)} ms/Read · Secure ~${(agg.secureMs / agg.pairs).toFixed(1)} ms/Read (inkl. psql-Prozessstart)`);

  check("Shadow: 0 Abweichungen zwischen Legacy und Secure", agg.deviations === 0);
  check("Shadow: 0 Fehler", agg.errors === 0);
  check("Shadow: identische Zeilensummen (Vollständigkeit)", agg.legacyRows === agg.secureRows);
  check("Shadow: Coverage vollständig (9 Paare)", agg.pairs === 9);

  console.log("");
  const total = state.pass + state.fail;
  if (state.fail === 0) {
    console.log(`${state.pass}/${total} Shadow-Read-Assertionen erfolgreich (Preview).`);
    process.exit(0);
  } else {
    console.log(`${state.fail}/${total} FEHLGESCHLAGEN:`);
    state.failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
})();
