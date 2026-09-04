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
// VORFLUG-RIEGEL (04.09.2026, SR §38.2): Ein Lauf, der WIRKLICH gegen Production
// schreibt (Production-Backend + `--allow-production` + schreibender Modus),
// prüft VOR dem ersten Schreibvorgang den Speicherpfad und bricht sonst mit
// Exitcode 2 ab — ohne etwas zu schreiben. Grund: `saveProfile` schreibt den
// geteilten Blob unbedingt, die relationale Zeile nur bei wirksamem
// `HELMUT_PROFILE_DB_MODE`; ohne ihn wäre das Ergebnis still blob-only.
// `--validate`, der Stapel-Trockenlauf und jeder lokale Lauf bleiben unberührt.
//
// Spec-Pflichtfelder: id, email, name, password, party|faction, parliamentType,
//   (Landtag: state), region (constituency/state), committees|focusTopics.
// Optional: aiBudgetDailyCents, aiBudgetMonthlyCents, tenantDailyCallLimit, focusTopics.

const fs = require("fs");
// SR §37.5 (3): reine Logik, keine Netz-/DB-/storage.js-Abhaengigkeit.
const VORFLUG = require("../lib/helmut/speicherpfad-vorflug");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name) { return process.argv.includes(name); }

// Genau die Bedingung, mit der dieses Werkzeug seit jeher "Production" erkennt.
// Als eigene Funktion, damit der Vorflug-Riegel unten dieselbe Definition benutzt
// und keine zweite Wahrheit entsteht.
function istProductionUmgebung() {
  const backend = String(process.env.HELMUT_STORAGE_BACKEND || "").toLowerCase();
  return backend === "supabase" || Boolean(process.env.SUPABASE_URL);
}

// ── DER WIRKSAME VORGANG WIRD GENAU EINMAL BESTIMMT ─────────────────────────
//
// KORRIGIERT (Betreiberbefund): Es gab hier ZWEI Einstufungen, die
// auseinanderliefen. Die Riegelprüfung sagte „`--validate` ⇒ liest nur" und
// stieg sofort aus; die Ausführung prüfte danach aber in der Reihenfolge
// `--deactivate` → `--teardown` → `--paket` → **erst dann** `--validate`.
// Damit erreichte
//     --allow-production --validate --deactivate <id>
//     --allow-production --validate --teardown <id>
//     --allow-production --validate --paket <datei> --ausfuehren
// einen echten Production-Schreibpfad, OHNE dass der Speicherpfad-Riegel je
// gelaufen wäre (reproduziert). Zwei Wahrheiten über denselben Sachverhalt sind
// genau die Fehlerklasse, die dieser PR beseitigt.
//
// Deshalb: EINE Bestimmung, die sowohl der Riegel als auch die Ausführung
// benutzt. Sie liest nur `process.argv` — die Reihenfolge der Angaben spielt
// keine Rolle. `--validate` ist KEIN Hauptmodus, sondern die rein lesende
// Spielart der Einzelspec; mit einem der drei Hauptmodi ist es ein Widerspruch
// und wird abgewiesen, statt einen davon still zu entwerten.
const HAUPTMODI = Object.freeze([
  // Reihenfolge hier ist nur die Meldereihenfolge, nicht eine Rangfolge:
  // mehrere gesetzte Hauptmodi sind ein Abbruch, kein "der erste gewinnt".
  Object.freeze({ flag: "--deactivate", modus: "deaktivierung", schreibend: () => true, brauchtWert: true }),
  Object.freeze({ flag: "--teardown", modus: "entfernung", schreibend: () => true, brauchtWert: true }),
  Object.freeze({ flag: "--paket", modus: "stapel", schreibend: () => has("--ausfuehren"), brauchtWert: true })
]);

function bestimmeVorgang() {
  const gesetzte = HAUPTMODI.filter((m) => has(m.flag));
  const widersprueche = [];

  if (gesetzte.length > 1) {
    widersprueche.push(`mehrere Hauptmodi gleichzeitig: ${gesetzte.map((m) => m.flag).join(", ")}`
      + " — welcher gilt, wird nicht geraten.");
  }
  if (has("--validate") && gesetzte.length) {
    widersprueche.push(`--validate zusammen mit ${gesetzte.map((m) => m.flag).join(", ")}`
      + " — --validate ist die rein LESENDE Spielart der Einzelspec und kann einen"
      + " schreibenden Hauptmodus nicht entwerten.");
  }
  if (has("--ausfuehren") && !has("--paket")) {
    widersprueche.push("--ausfuehren ohne --paket — der Schalter schaltet ausschliesslich den"
      + " Stapel scharf und wird nie still ignoriert.");
  }
  for (const m of gesetzte) {
    const wert = arg(m.flag);
    if (m.brauchtWert && (wert === undefined || String(wert).startsWith("--"))) {
      widersprueche.push(`${m.flag} ohne eigenen Wert (gefunden: ${wert === undefined ? "nichts" : wert})`
        + " — der naechste Schalter ist kein Wert.");
    }
  }

  // Der wirksame Vorgang. Bei Widerspruch wird gar nichts ausgefuehrt; die
  // Einstufung bleibt trotzdem SCHREIBEND, damit ein spaeterer Umbau, der den
  // Widerspruch versehentlich zulaesst, nicht plötzlich ungeriegelt schreibt.
  const gewaehlt = gesetzte[0] || null;
  if (widersprueche.length) {
    return Object.freeze({ modus: "widerspruch", schreibend: true, widersprueche: Object.freeze(widersprueche) });
  }
  if (gewaehlt) {
    return Object.freeze({ modus: gewaehlt.modus, schreibend: gewaehlt.schreibend(), widersprueche: Object.freeze([]) });
  }
  if (has("--validate")) {
    return Object.freeze({ modus: "validierung", schreibend: false, widersprueche: Object.freeze([]) });
  }
  return Object.freeze({ modus: "einzel", schreibend: true, widersprueche: Object.freeze([]) });
}

// Widersprüche werden VOR dem Riegel und VOR dem `require` des Provisionierers
// abgewiesen — also vor jedem möglichen Schreibvorgang. Exitcode 2, wie jeder
// andere Aufruffehler dieses Werkzeugs. Es gibt keine Übergehungsoption.
function weiseWidersprueche(vorgang) {
  if (!vorgang.widersprueche.length) return;
  console.error("ABBRUCH: widersprüchlicher Aufruf — es wurde NICHTS geschrieben.");
  for (const w of vorgang.widersprueche) console.error(`  - ${w}`);
  console.error("Erlaubt ist genau EIN Hauptmodus: --deactivate | --teardown | --paket |"
    + " --spec/--spec-inline (optional mit --validate).");
  process.exit(2);
}

function refuseProductionBackend() {
  if (istProductionUmgebung() && !has("--allow-production")) {
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

  // ── VORFLUG-RIEGEL VOR DEM ERSTEN PRODUCTION-SCHREIBVORGANG ───────────────
  //
  // KORRIGIERT (Betreiberbefund): Hier stand nur ein BERICHT. Das genügte nicht.
  // Jeder schreibende Einstieg dieses Werkzeugs endet in `storage.saveProfile`,
  // und `saveProfile` schreibt den geteilten Blob UNBEDINGT, die relationale
  // Zeile aber nur bei wirksamem `HELMUT_PROFILE_DB_MODE`. Ohne diesen Wert
  // wäre ein echter Production-Vorgang **still blob-only** gelaufen — genau das
  // Ergebnis, das das Abnahmekriterium ausschließt, und genau der zweite Befund
  // vom 04.09. Ein gedruckter Hinweis verhindert das nicht; ein Riegel schon.
  //
  // Der Riegel greift NUR, wenn wirklich in Production geschrieben würde:
  //   * die Umgebung IST ein Production-Backend (dieselbe Bedingung wie oben),
  //   * der Betreiber hat das mit `--allow-production` ausdrücklich gewollt,
  //   * und der Modus schreibt tatsächlich.
  // `--validate` und der Stapel-Trockenlauf bleiben unberührt; ein rein lokaler
  // Lauf ohne Supabase ebenfalls. Es gibt bewusst KEINE Übergehungsoption.
  //
  // Er steht VOR dem `require` des Provisionierers — also vor jedem Modul, das
  // Production überhaupt erreichen könnte.
  const vorgang = bestimmeVorgang();
  weiseWidersprueche(vorgang);

  if (istProductionUmgebung() && has("--allow-production") && vorgang.schreibend) {
    const zweck = "Mandanten-Provisionierung gegen Production";
    // Das tatsächliche Schreibziel wird IMMER ausgewiesen, auch im Erfolgsfall.
    console.log(`\n${VORFLUG.pruefeSpeicherpfad({ env: process.env, zweck }).meldung}\n`);
    // Derselbe technische Riegel wie in den Kohortenwerkzeugen — eine Wahrheit.
    VORFLUG.erzwingeSpeicherpfadOderWirf({ env: process.env, zweck });
  }

  const provisioning = require("../lib/helmut/provisioning");

  if (vorgang.modus === "deaktivierung") {
    const id = arg("--deactivate");
    const res = await provisioning.deactivateTenant(id);
    console.log(provisioning.formatProtocol({ ...res, tenantId: id }));
    process.exit(res.ok ? 0 : 1);
  }
  if (vorgang.modus === "entfernung") {
    const id = arg("--teardown");
    const res = await provisioning.teardownTenant(id);
    console.log(provisioning.formatProtocol({ ...res, tenantId: id }));
    process.exit(res.ok ? 0 : 1);
  }

  // STAPELMODUS (Skalierungssprint 2026-08-25): eine Datei mit vielen Mandaten.
  // TROCKENLAUF IST DER STANDARD — scharf wird nur mit --ausfuehren.
  if (vorgang.modus === "stapel") {
    const datei = arg("--paket");
    if (!datei) { console.error("Fehlt: --paket <datei.json>"); process.exit(2); }
    const roh = JSON.parse(fs.readFileSync(datei, "utf8"));
    const specs = Array.isArray(roh) ? roh : (Array.isArray(roh.mandate) ? roh.mandate : null);
    if (!specs) { console.error("Das Paket muss ein JSON-Array sein oder ein Objekt mit dem Feld \"mandate\"."); process.exit(2); }

    // DIESELBE Einstufung wie der Riegel — nicht noch einmal aus argv gelesen.
    const ausfuehren = vorgang.schreibend;
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
  if (vorgang.modus === "validierung") {
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
})().catch((e) => {
  // Ein unsicherer Speicherpfad ist ein UMGEBUNGSfehler (Exitcode 2), kein
  // fachlicher Fehlschlag (Exitcode 1). Der vollständige Befund steht bereits
  // auf stdout; hier nur die eine Abbruchzeile, damit die Meldung nicht doppelt
  // erscheint.
  if (e && e.grund === "speicherpfad-unsicher") {
    console.error("ABBRUCH (speicherpfad-unsicher): vor dem ersten Schreibvorgang gestoppt."
      + " Es wurde NICHTS geschrieben. Der Befund steht oben.");
    process.exit(2);
  }
  console.error("FEHLER:", (e && e.message) || e);
  process.exit(1);
});
