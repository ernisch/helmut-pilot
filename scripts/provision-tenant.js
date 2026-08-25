"use strict";

// CLI für die Mandanten-Provisionierung (Sprint 1). Admin-Werkzeug, KEIN
// Self-Service. Sicher per Default: schreibt nur in den LOKALEN Dateimodus. Ein
// Production-Backend (Supabase) wird HART verweigert — Production-Provisionierung
// ist freigabepflichtig (siehe docs/betrieb/zweitmandant-provisionierung-runbook.md).
// Bestehende Mandanten sind DATENGETRIEBEN geschützt (Profil ohne
// provisionedBy-Marker bzw. HELMUT_PROTECTED_TENANT_IDS) — dieses Werkzeug
// verändert nur Mandanten, die es selbst angelegt hat.
//
// Nutzung (IDs in den Beispielen sind rein synthetisch):
//   node scripts/provision-tenant.js --spec pfad/zur/spec.json
//   node scripts/provision-tenant.js --spec-inline '{"id":"tenant-alpha","email":"alpha@example.test",...}'
//   node scripts/provision-tenant.js --deactivate tenant-alpha
//   node scripts/provision-tenant.js --teardown  tenant-alpha   (Vollentfernung)
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

  // STAPELMODUS (Skalierungssprint 2026-08-25): eine Datei mit vielen Mandaten.
  // TROCKENLAUF IST DER STANDARD — scharf wird nur mit --ausfuehren.
  if (has("--paket")) {
    const datei = arg("--paket");
    if (!datei) { console.error("Fehlt: --paket <datei.json>"); process.exit(2); }
    const roh = JSON.parse(fs.readFileSync(datei, "utf8"));
    const specs = Array.isArray(roh) ? roh : (Array.isArray(roh.mandate) ? roh.mandate : null);
    if (!specs) { console.error("Das Paket muss ein JSON-Array sein oder ein Objekt mit dem Feld \"mandate\"."); process.exit(2); }

    const ausfuehren = has("--ausfuehren");
    const res = await provisioning.provisionBatch(specs, {}, {
      ausfuehren, weiterBeiFehler: has("--weiter-bei-fehler")
    });

    console.log(`\n=== STAPELPROVISIONIERUNG · ${ausfuehren ? "SCHARFER LAUF" : "TROCKENLAUF (kein Schreibvorgang)"} ===`);
    console.log(`Paket: ${datei} · ${specs.length} Mandate\n`);

    if (res.vorbefunde.length) {
      console.error(`VORPRUEFUNG FEHLGESCHLAGEN — NICHTS WURDE GESCHRIEBEN (${res.vorbefunde.length} Befunde):`);
      res.vorbefunde.forEach((b) => console.error("  - " + b));
      process.exit(1);
    }

    for (const e of res.ergebnisse) {
      const marke = e.trockenlauf ? e.vorhaben : (e.ok ? (e.created ? "angelegt" : "aktualisiert") : `FEHLER (${e.reason})`);
      const grund = e.trockenlauf && e.grund ? `  — ${e.grund}` : "";
      console.log(`  ${String(e.tenantId || "?").padEnd(32)} ${marke}${grund}`);
    }

    const b = res.bilanz;
    console.log(`\nBilanz: ${b.gesamt} Mandate`
      + (ausfuehren ? ` · angelegt ${b.angelegt} · aktualisiert ${b.aktualisiert} · fehlgeschlagen ${b.fehlgeschlagen}`
        : ` · durchfuehrbar ${b.geplant} · blockiert ${b.blockiert} (kein Schreibvorgang)`));
    if (res.abgebrochen) console.error(`ABGEBROCHEN: ${res.grund}`);
    if (!ausfuehren) {
      console.log("\nHinweis: Das war ein TROCKENLAUF. Scharf: zusaetzlich --ausfuehren angeben.");
      if (!res.ok) {
        console.error("Der Trockenlauf sagt fuer mindestens ein Mandat einen ABBRUCH voraus —"
          + " ein scharfer Lauf wuerde dort scheitern. Exitcode 1.");
      }
    } else {
      // EHRLICH (Review-Befund 2): der scharfe Stapellauf ist SEQUENZIELL, nicht eine
      // gemeinsame Datenbanktransaktion. Bereits erfolgreich verarbeitete Mandate bleiben
      // bestehen, wenn ein spaeteres Mandat an einem Laufzeitfehler scheitert. Nur die
      // VORPRUEFUNG ist mengenweit (sie laeuft vollstaendig vor dem ersten Schreibvorgang).
      console.log("\nHinweis: Der Stapel wird SEQUENZIELL abgearbeitet, nicht als eine gemeinsame"
        + "\nDatenbanktransaktion. Bereits erfolgreich verarbeitete Mandate bleiben bestehen,"
        + "\nwenn ein spaeteres Mandat scheitert. Mengenweit ist nur die Vorpruefung.");
    }
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
