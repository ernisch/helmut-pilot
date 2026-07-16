"use strict";

// CLI für die Zweitmandanten-Provisionierung (Sprint 1). Admin-Werkzeug, KEIN
// Self-Service. Sicher per Default: schreibt nur in den LOKALEN Dateimodus. Ein
// Production-Backend (Supabase) wird HART verweigert — Production-Provisionierung
// ist freigabepflichtig (siehe docs/betrieb/zweitmandant-provisionierung-runbook.md).
//
// Nutzung:
//   node scripts/provision-tenant.js --spec pfad/zur/spec.json
//   node scripts/provision-tenant.js --spec-inline '{"id":"...","email":"..."}'
//   node scripts/provision-tenant.js --deactivate <mandant-id>
//   node scripts/provision-tenant.js --teardown  <mandant-id>   (Vollentfernung)
//   node scripts/provision-tenant.js --validate --spec spec.json (nur prüfen, kein Write)
//
// Spec-Pflichtfelder: id, email, name, password, party|faction, parliamentType,
//   (Landtag: state), region (constituency/state), committees|focusTopics.
// Optional: aiBudgetDailyCents, aiBudgetMonthlyCents, tenantDailyCallLimit, focusTopics.

const fs = require("fs");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name) { return process.argv.includes(name); }

function refuseProductionBackend() {
  const backend = String(process.env.HELMUT_STORAGE_BACKEND || "").toLowerCase();
  const hasSupabase = backend === "supabase" || Boolean(process.env.SUPABASE_URL);
  if (hasSupabase && !has("--allow-production")) {
    console.error("ABBRUCH: Ein Production-Backend (Supabase) ist konfiguriert.");
    console.error("Production-Provisionierung ist FREIGABEPFLICHTIG. Ohne ausdrückliche");
    console.error("Freigabe schreibt dieses Werkzeug nur im lokalen Dateimodus.");
    console.error("Siehe docs/betrieb/zweitmandant-provisionierung-runbook.md.");
    process.exit(2);
  }
}

function loadSpec() {
  const inline = arg("--spec-inline");
  if (inline) return JSON.parse(inline);
  const file = arg("--spec");
  if (!file) { console.error("Fehlt: --spec <datei.json> oder --spec-inline '<json>'"); process.exit(2); }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

(async () => {
  refuseProductionBackend();
  const provisioning = require("../lib/helmut/provisioning");

  if (has("--deactivate")) {
    const id = arg("--deactivate");
    const res = await provisioning.deactivateTenant(id);
    console.log(provisioning.formatProtocol({ ...res, tenantId: id }));
    process.exit(res.ok ? 0 : 1);
  }
  if (has("--teardown")) {
    const id = arg("--teardown");
    const res = await provisioning.teardownTenant(id);
    console.log(provisioning.formatProtocol({ ...res, tenantId: id }));
    process.exit(res.ok ? 0 : 1);
  }

  const spec = loadSpec();
  if (has("--validate")) {
    const errors = provisioning.validateSpec(spec);
    if (errors.length) { console.error(`SPEC UNGÜLTIG (${errors.length}):`); errors.forEach((e) => console.error("  - " + e)); process.exit(1); }
    console.log("SPEC GÜLTIG — Pflichtfelder vollständig. (kein Schreibvorgang, --validate)");
    process.exit(0);
  }

  const res = await provisioning.provisionTenant(spec);
  console.log(provisioning.formatProtocol(res));
  process.exit(res.ok ? 0 : 1);
})().catch((e) => { console.error("FEHLER:", e && e.message || e); process.exit(1); });
