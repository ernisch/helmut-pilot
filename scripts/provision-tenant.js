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
    console.log(`Paket: ${datei} · ${specs.length} Mandate`);
    console.log("Zielzustand neuer Mandate: INAKTIV (profileActive=false, Konto gesperrt).");
    console.log("Der Stapel aktiviert kein Mandat — die Aktivierung ist eine getrennte");
    console.log("Freigabeentscheidung (CLAUDE.md §5, op30-profilvertrag-200-mandate.md §6).\n");

    if (res.vorbefunde.length) {
      console.error(`VORPRUEFUNG FEHLGESCHLAGEN — NICHTS WURDE GESCHRIEBEN (${res.vorbefunde.length} Befunde):`);
      res.vorbefunde.forEach((b) => console.error("  - " + b));
      process.exit(1);
    }

    for (const e of res.ergebnisse) {
      // Der Aktivierungszustand steht in BEIDEN Laufarten in der Zeile — im Trockenlauf
      // als Vorhersage (`zielAktiv`), im scharfen Lauf als der tatsaechlich gespeicherte
      // Zustand (`profilAktiv`). Eine Zeile ohne diesen Zustand hat das Wichtigste
      // verschwiegen.
      const zustand = e.trockenlauf
        ? (e.zielAktiv === true ? " [aktiv]" : (e.zielAktiv === false ? " [inaktiv]" : ""))
        : (e.ok ? (e.profilAktiv ? " [aktiv]" : " [inaktiv]") : "");
      const marke = e.trockenlauf ? e.vorhaben : (e.ok ? (e.created ? "angelegt" : "aktualisiert") : `FEHLER (${e.reason})`);
      const grund = e.trockenlauf && e.grund ? `  — ${e.grund}` : "";
      console.log(`  ${String(e.tenantId || "?").padEnd(32)} ${marke}${zustand}${grund}`);
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
      // EHRLICHE AKTIVIERUNGSBILANZ. Getrennt gezaehlt, damit die Zahl nicht luegt: ein
      // BESTEHENDES aktives Mandat bleibt zu Recht aktiv (der Stapel fasst seinen Zustand
      // nicht an) — nur ein NEU angelegtes aktives Mandat waere ein Vertragsbruch.
      const erfolgreich = res.ergebnisse.filter((e) => e.ok);
      const neuAktiv = erfolgreich.filter((e) => e.created && e.profilAktiv === true);
      const bestandAktiv = erfolgreich.filter((e) => !e.created && e.profilAktiv === true);
      console.log(`\nAktivierung: neu angelegt und AKTIV: ${neuAktiv.length} (erwartet: 0)`
        + ` · bestehend und aktiv geblieben: ${bestandAktiv.length} (unveraendert, nicht angefasst).`);
      if (neuAktiv.length) {
        console.error("FEHLER: ein neu angelegtes Mandat ist aktiv. Das darf der Stapelpfad nicht —"
          + "\nbitte melden, nicht ignorieren.");
      }
      console.log("Neu angelegte Mandate sind inaktiv und nehmen an keinem Cron-, Briefing- oder"
        + "\nVerarbeitungslauf teil. Die Aktivierung ist ein getrennter, freigabepflichtiger"
        + "\nBetreiberschritt und findet in diesem Werkzeug nicht statt.");
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

  // EINZELPROVISIONIERUNG VON HAND: der Betreiber trifft die Aktivierungsentscheidung in
  // genau diesem Moment — deshalb `neuAktiv: true`. Das ist das unveraenderte Verhalten
  // dieses Pfads, jetzt aber ausdruecklich statt als stiller Vorgabewert im Profilbauer
  // (Korrekturrunde 2026-08-25/4). Der STAPELPFAD (--paket) legt dagegen ausschliesslich
  // inaktiv an und nimmt dafuer keinen Schalter entgegen.
  const res = await provisioning.provisionTenant(spec, {}, { neuAktiv: true });
  console.log(provisioning.formatProtocol(res));
  process.exit(res.ok ? 0 : 1);
})().catch((e) => { console.error("FEHLER:", e && e.message || e); process.exit(1); });
