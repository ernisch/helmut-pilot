"use strict";

// Führt ALLE Offline-Testsuiten des Repos nacheinander aus und fasst das Ergebnis
// zusammen. Schließt bewusst nur aus, was Netz/Production/Live-LLM braucht.
//
// Hintergrund (Audit 2026-07): 15 von 76 Testdateien waren in keinem npm-Script
// verdrahtet und "alle Tests grün" war manuell praktisch nicht herstellbar.
// Dieser Runner ist die eine kanonische Antwort auf "läuft die Offline-Suite?"
// und wird vom CI-Gate (.github/workflows/ci.yml) bei jedem PR ausgeführt.
//
// Aufruf:  node scripts/run-offline-tests.js [--list] [--only <substring>] [--extended]
// Exit-Code 0 nur, wenn jede Suite mit Exit-Code 0 endet.
//
// STANDARD vs. BEREICH vs. ERWEITERT (Sprint 2026-09-23, Testorganisation):
//   Standard  = der kanonische Pflichtlauf und das CI-Gate. Er fuehrt AUSSCHLIESSLICH die
//               explizite Kernmenge STANDARD aus (aktuelle Schutz-/Sicherheitsvertraege,
//               aktuelle 500er-Schutzlogik und die grundlegenden Vertraege des heutigen
//               Production-Pfads).
//   Bereich   = zusaetzlich die fachliche Regression der im PR tatsaechlich geaenderten
//               Bereiche. Auswahl ueber `--aendert "<datei1 datei2 ..."` (oder `--bereich
//               <name,...>`) anhand der kanonischen Zuordnung in scripts/bereichsauswahl.js.
//               `--nur-bereich` fuehrt NUR die Bereichs-Suiten aus (ohne Standard, fuer einen
//               eigenen CI-Schritt). Fuer eine Aenderung gilt: Vereinigung aller betroffenen
//               Bereiche, ohne Doppellaeufe mit dem Standard.
//   Erweitert = die VOLLSTAENDIGE Offline-Regression (alle sammelbaren Suiten). Aufruf
//               ueber `--extended` bzw. `npm run test:offline:extended`. Laeuft NICHT
//               automatisch im PR.
// Eine neue Testdatei wird NICHT automatisch zum Pflichtlauf: sie muss bewusst in STANDARD
// eingetragen werden, sonst laeuft sie nur im erweiterten Lauf. Fuer die Bereichsauswahl
// entscheidet der DATEINAME (siehe scripts/bereichsauswahl.js). Bereichsspezifisch
// ausfuehren: `--extended --only <substring>` (z. B. `--extended --only briefing`).
//
// NETZ-GUARD (Audit-Folgebranch 2026-07): collectSuites() sammelt JEDE künftige
// *-test.js automatisch ein — der Schutz vor Netz-/Production-Zugriff bestand
// nur aus der manuell gepflegten DENYLIST oben (HELMUT_OFFLINE_TEST=1 wurde von
// keinem Modul konsumiert). Deshalb erzwingt der Runner Offline jetzt TECHNISCH:
// jede Suite läuft mit NO_NETWORK_TESTS=1 und `--require` DIESER Datei als
// Preload; der Preload patcht http/https.request/.get und global.fetch und
// BLOCKT Verbindungen zu Nicht-Localhost-Hosts mit einer klaren Fehlermeldung
// (Hard-Fail — alle bestehenden Suiten bleiben damit grün, empirisch geprüft).
// Grenzen: rohe net/tls-Sockets und Kindprozesse der Suiten werden nicht
// abgefangen; der Guard ist ein Sicherheitsnetz gegen vergessene
// DENYLIST-Einträge, kein vollständiger Egress-Filter.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// ── Netz-Guard (Preload-Modus) ───────────────────────────────────────────────
// Diese Datei dient doppelt: als Runner (require.main === module) und — via
// `node --require scripts/run-offline-tests.js <suite>` — als Offline-Guard im
// Testprozess. So braucht der Zwang keine zweite Datei und gilt automatisch
// für jede eingesammelte Suite.
const NET_GUARD_LOCAL_HOSTS = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0)$/i;
const NET_GUARD_MARKER = "[NETZ-GUARD]";

function netGuardHostOf(firstArg) {
  try {
    if (typeof firstArg === "string") return new URL(firstArg).hostname;
    if (firstArg instanceof URL) return firstArg.hostname;
    if (firstArg && typeof firstArg === "object") {
      // http.request(options): host darf "host:port" enthalten, hostname nicht.
      const raw = firstArg.hostname || firstArg.host || "localhost";
      return String(raw).replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
    }
  } catch { /* nicht parsebar -> nicht blocken (kein False-Positive) */ }
  return null;
}

function installNetGuard() {
  const suite = path.basename(process.argv[1] || "unbekannter-prozess");
  const deny = (host, via) => {
    const msg = `${NET_GUARD_MARKER} ${suite}: Nicht-Localhost-Verbindung blockiert (${via} -> ${host}). ` +
      "Offline-Suiten dürfen kein externes Netz nutzen — Suite in die DENYLIST von scripts/run-offline-tests.js " +
      "aufnehmen, falls sie bewusst Netz braucht (dann läuft sie NICHT im CI-Gate).";
    // Marker auch auf stderr, damit der Runner Versuche selbst dann meldet,
    // wenn eine Suite den Fehler fängt und trotzdem grün endet.
    process.stderr.write(msg + "\n");
    return new Error(msg);
  };
  for (const modName of ["http", "https"]) {
    const mod = require(modName);
    for (const fn of ["request", "get"]) {
      const orig = mod[fn];
      mod[fn] = function (...args) {
        const host = netGuardHostOf(args[0]);
        if (host && !NET_GUARD_LOCAL_HOSTS.test(host)) throw deny(host, `${modName}.${fn}`);
        return orig.apply(this, args);
      };
    }
  }
  if (typeof globalThis.fetch === "function") {
    const origFetch = globalThis.fetch;
    globalThis.fetch = function (input, init) {
      let host = null;
      try {
        const raw = (input && typeof input === "object" && !(input instanceof URL) && input.url) ? input.url : input;
        host = new URL(String(raw), "http://localhost").hostname;
      } catch { host = null; }
      if (host && !NET_GUARD_LOCAL_HOSTS.test(host)) return Promise.reject(deny(host, "fetch"));
      return origFetch.call(this, input, init);
    };
  }
}

// Suiten, die die VERWEIGERUNGSLOGIK der Werkzeuge pruefen und dafuer absichtlich eine
// Production-aussehende Umgebung aufbauen. Fuer sie wird die UMGEBUNGSPRUEFUNG des lokalen
// Schutzes uebersprungen — die LAUFZEITSPERRE gegen nicht-lokale Verbindungen bleibt aktiv.
// Ohne diese Liste wuerde der Schutz genau die Nachweise zerstoeren, die dieselbe Gefahr
// abdecken (belegt am 2026-08-08: alle drei brachen mit Exit 3 ab, bevor das Werkzeug seine
// eigene Verweigerung mit Exit 2 zeigen konnte).
// Die Liste ist AUSDRUECKLICH und kurz zu halten. Jeder Eintrag ist eine Zusage, dass die
// Suite keine echte Verbindung aufbaut.
const WERKZEUG_VERWEIGERUNG = new Set([
  "restore-drill-test.js",          // prueft: Restore lehnt Production als Ziel ab
  "backup-export-test.js",          // prueft: Export laeuft nur gegen die vorgesehene Quelle
  "understanding-recovery-test.js"  // prueft: Recovery-Pfad verweigert ohne klare Umgebung
]);

// Suiten, die NICHT offline lauffähig sind (Netz, Production-URL, Live-LLM, echte DB)
// oder die keine Tests, sondern Werkzeuge/Backfills sind.
const DENYLIST = new Set([
  "lage-quellen-rest-datenbank-test.js", // separater isolierter REST Nachweis; fehlende Umgebung ist kein PASS
  "auth-store-cas-datenbank-test.js", // eigener verpflichtender CI Schritt mit PostgreSQL + PostgREST
  "smoke-test.js", // zielt per Default auf die Production-URL
  "understanding-live-smoke.js", // echter HTTP-/LLM-Pfad
  "understanding-eval.js", // Goldset-Eval mit eigener Laufzeit/Reporting, kein PASS/FAIL-Gate
  "gate-realdata-validation.js", // braucht Production-Datenexport
  "gate-shadow-replay.js", // braucht echte DB-Snapshots
  "relational-shadow-compare.js", // Werkzeug gegen echte DB
  "shadow-ingest.js", // Werkzeug
  "shadow-pilot-crawl.js", // echter Crawl
  "pardok-structure-probe.js", // echte Parlaments-Endpunkte
  "pardok-shadow-test.js", // Live XML Leser; eigener PARDOK Workflow, kein Offline Nachweis
  "sprint6-migration-dryrun.js", // Werkzeug gegen DB
  "sprint9b-verify-abrufwege.js", // echtes Netz
  "sprint9b-summary.js", // Reporting-Werkzeug
  "sprint10-preflight-sql.js", // erzeugt SQL, kein Test-Gate
  "understanding-gate-cost-sim.js", // Simulation/Reporting
  "watchdog-eval.js", // Werkzeug (die Test-Variante ist watchdog-eval-test.js)
  "jwt-diagnose.js", // Live-Diagnose-Werkzeug
  // Browser-Smoke braucht ein installiertes Chromium und hat seinen EIGENEN
  // CI-Job (ci.yml "Browser-/Mobile-Smoke"), der Playwright installiert und
  // fail-closed ist. Im Offline-Job liefe er nur als stiller SKIP mit — das
  // täuschte eine Abdeckung vor, die der andere Job wirklich erbringt.
  "browser-smoke-test.js",
  "prosa-vorschau-test.js", // verpflichtend im selben Browserjob, kein stiller Skip
  // Gleiche Begruendung, gleiche Loesung (Korrektur 2026-08-28): Der Z22-Datenbanknachweis
  // braucht eine ECHTE PostgreSQL. Ohne `HELMUT_TEST_PG_HOST` endete er mit Exit 0 — und der
  // Runner kennt nur `exit === 0` => PASS. Er meldete also GRUEN fuer einen Nachweis, den
  // niemand erbracht hat; genau darunter blieb die Abweichung zwischen SQL und Attrappe bei
  // leerer `tenant_id` unentdeckt. Er hat jetzt einen EIGENEN, fail-closed CI-Schritt im Job
  // "Syntax + Offline-Suiten" mit kurzlebigem Postgres-Dienst (HELMUT_REQUIRE_PG=1).
  // Lokal: node scripts/lokal.js scripts/vorbedingung-mandatsfilter-datenbank-test.js
  "vorbedingung-mandatsfilter-datenbank-test.js",
  "lage-backfill.js",
  "presentation-backfill.js",
  "staff-backfill.js",
  "ko-classification-backfill.js",
  "generate-landesmodul-seed.js",
  "generate-source-architecture-seed.js",
  "generate-vapid-keys.js",
  "run-offline-tests.js"
]);

// ── STANDARD: die explizite Kernmenge des Pflichtlaufs ──────────────────────────────
// NUR diese Suiten laufen bei jedem PR (CI-Gate). Aufnahmekriterium ist ein AKTUELLER
// Vertrag, nicht die Laufzeit: Schutz/Sicherheit, aktuelle 500er-Schutzlogik und die
// grundlegenden Vertraege des heutigen Production-Pfads. Abgeschlossene Sprints,
// bereichsspezifische Regressionen (Briefing/Lage/Quellen/Radar/Profil/Matching/Scoring/
// UI/Cron/Landesmodule/PARDOK/…), Simulationen und historische Nachweise gehoeren NICHT
// hierher — sie bleiben unveraendert im Repo und laufen ueber `--extended`.
// Jede Zeile nennt den geschuetzten Vertrag. Aenderungen an dieser Liste sind die einzige
// Stelle, an der ueber den Pflichtumfang entschieden wird.
const STANDARD = new Set([
  // — Schutz, Sicherheit, Mandantentrennung, Secrets, Auth, CAS/Schreibschutz —
  "netzschutz-test.js",                     // lokaler Netz-/Production-Schutz (fail closed)
  "mandantentrennung-test.js",              // Mandantentrennung (user_id-Filter)
  "cross-tenant-security-test.js",          // Cross-Tenant-Angriffe
  "tenant-guard-test.js",                   // assertTenant/assertTenantRows
  "tenant-neutrality-test.js",              // keine Person bevorzugt/hartkodiert
  "tenant-jwt-test.js",                     // Mandanten-JWT
  "rls-policy-simulation-test.js",          // RLS-Policies
  "security-hardening-sql-test.js",         // SQL-Haertung (GRANT/Policy)
  "p1-security-check.js",                   // P1-Sicherheitsgate (Server/Frontend-Vertrag)
  "privacy-authz-test.js",                  // Zugriffsberechtigung auf personenbezogene Daten
  "privacy-vollstaendigkeit-test.js",       // Datenschutz-Vollstaendigkeit
  "cache-isolation-test.js",                // Cache-Isolation je Mandant
  "secret-redaction-test.js",               // keine Secrets in Ausgaben
  "env-inventar-test.js",                   // Umgebungsvariablen vollstaendig/dokumentiert
  "speicherpfad-schutz-test.js",            // Schutz des gemeinsamen Speicherpfads
  "azure-endpunkt-guard-test.js",           // Azure-Endpunkt Pruefung vor Budget/Senden
  "supabase-response-timeout-test.js",      // Antwort-Timeout der DB-Engstelle
  "befund-27a2-schreibschutz-test.js",      // Messwerkzeug kann strukturell nicht schreiben
  "nachhol-schreibgate-test.js",            // Production-Schreibgate der Nachholskripte
  "store-cas-test.js",                      // CAS im gemeinsamen Store
  "store-read-integrity-test.js",           // Leseintegritaet des Stores
  "auth-store-cas-test.js",                 // CAS des Auth-Stores
  "pipeline-lock-atomic-test.js",           // atomarer Pipeline-Lock
  "profile-auth-decoupling-test.js",        // Profil/Auth entkoppelt
  "reset-timing-seitenkanal-test.js",       // kein Seitenkanal beim Passwort-Reset
  "saas-foundation-test.js",                // keine Personen-Fallbacks, Tenant-Kontext blockt
  "jobqueue-sicherheit-test.js",            // Sicherheit/Mandantentrennung der Warteschlange
  "admin-config-diagnose-test.js",          // Admin-Authz + keine Secrets in der Diagnose
  "alarm-payload-test.js",                  // Alarmkanal ohne Inhalte/Secrets
  "login-eine-mutation-test.js",            // genau eine CAS-Mutation je Login
  "invite-flow-test.js",                    // Einmal-Token, keine Enumeration, kein PII
  "jwt-endpoint-diagnose-test.js",          // JWT-Diagnose gibt kein Secret heraus
  "privater-nachweis-transport-test.js",    // Transport privater Inhalte geschuetzt
  "understanding-recovery-test.js",         // Recovery-Pfad verweigert ohne klare Umgebung
  // — Budget, Kosten, KI-Riegel —
  "kosten-limits-test.js",                  // Kostenlimits/Deckel
  "budgetvertrag-test.js",                  // Budgetvertrag
  "llm-budget-test.js",                     // KI-Tagesdeckel
  "llm-reservation-test.js",                // atomare Reservierung
  "llm-budget-fairness-test.js",            // fairer/atomarer Budgetverbrauch
  "tenant-llm-cap-test.js",                 // Mandanten-Deckel (bleibt fuer 500 aus)
  "profile-budget-constraint-test.js",      // ungueltiges Budget kein Serverfehler/Datenverlust
  "testkosten-budget-test.js",              // atomare Testkosten-Wahrheit
  "verstehen-restzeit-test.js",             // Restzeitwache vor bezahltem Modellaufruf
  // — aktueller 500er-Schutzvertrag —
  "verstehen-169-neuversuch-test.js",       // 169er Neuversuchsvertrag (PR524, Production)
  "verstehen-169-kosten-deckel-test.js",    // harter 0,80-USD-Laufdeckel
  "verstehen-169-workflow-test.js",         // manueller 169er Ausfuehrungsweg
  "verstehen-cas-vertrag-test.js",          // CAS-/Quittungsvertrag des Verstehens
  "verstehen-frische17-test.js",            // neuer gebundener17er Auftrag und Kostenstart am UTC-Tageswechsel
  "verstehen-frische30-test.js",            // eigener gebundener30er Auftrag, keine alte Wiederaufnahme
  "verstehen-einmalig-test.js",             // Fachgrenzen des einmaligen Laufs
  "verstehen-rueckstand-test.js",           // Rueckstandslogik
  "verstehen-wiederaufnahme-test.js",       // Wiederaufnahmepfad
  "testfenster-null500-test.js",            // 500er-Fenster: Planung/Verweigerung, rein lesend
  "verdraengungsschutz-test.js",            // die fuenf realen Profile werden nicht verdraengt
  "funktionstest-500-test.js",              // Sicherheitsrahmen des 500er-Funktionstests
  "kapazitaet-500-test.js",                 // 500er Kapazitaets-/Aufrufdeckel
  "planung-500-durchsatz-test.js",          // 500er Planer/Aufrufvolumen
  "quellenvorlauf-500-test.js",             // Grenzen des 500er Quellen-Vorlaufs
  "test-kohorte-500-test.js",               // Kohortentrennung, neutrale Kennungen
  "testkohorte-direkt500-test.js",          // Direktvertrag/Kohortentrennung A/B/C
  "testkohorte-vorwaerts-test.js",          // Vorwaertsweg nur unter allen Riegeln scharf
  "testkohorte-vorwaerts-cli-test.js",      // CLI-Vorschau folgenlos
  "testkohorte-testende-test.js",           // automatisches Testende/Rueckweg
  "testkohorte-betrieb-test.js",            // Betriebsriegel der Kohorte
  "testkohorte-stufen-test.js",             // Stufenreihenfolge A/B/C
  "testkohorte-provisionierung-fehler-test.js",
  "testkohorte-provisionierung-inaktiv-test.js",
  "testnachweis-ziel500-test.js",           // 500er Nachweisvollstaendigkeit
  "testnachweis-ergebnisse-test.js",        // Ergebniswahrheit des 500er Nachweises
  "briefing-pruefaufnahme-500-test.js",     // Pruefaufnahme des 500er Briefingnachweises
  "github-direkt500-test.js",               // 500er Direkt-Runner (No-Write/Quellensperre)
  "github-null500-ende-test.js",            // 500er Rueckweg auf null
  "github-testfenster-500-test.js",         // 500er Testfenster-Runner
  "github-briefingnachweis-500-test.js",    // 500er Briefingnachweis-Runner
  "github-privater-inhaltsnachweis-500-test.js",
  "github-quellenkontext-500-test.js",
  // — grundlegende Vertraege des heutigen Production-Pfads —
  "flags-test.js",                          // Feature-Flags Default AUS
  "source-mode-test.js",                    // Quellenwahrheit relational
  "migrations-organisation-test.js",        // Migration/Rollback-Namensregel
  "current-state-groesse-test.js",          // CURRENT_STATE-Groessengrenze
  "offline-suite-auswahl-test.js",          // dieser Standard-/Extended-Vertrag
  "quellenpflicht-vertrag-test.js",         // Belegpflicht (jedes Element traegt Quelle)
  "quellenpflicht-faelle-test.js",          // Belegpflicht-Faelle
  "ki-antwortvertrag-test.js",              // zentrale KI-HTTP-Engstelle
  "contract-snapshot-test.js",              // Server->Frontend-Vertrag /api/app/start
  "jobqueue-vertrag-test.js",               // Warteschlangenvertrag
  "jobdispatch-vertrag-test.js",            // Job-Dispatch-Vertrag
  "scalable-pipeline-flag-test.js",         // Flag-Grenzen der skalierbaren Pipeline
  "warteschlangenwache-vertrag-test.js",    // Warteschlangenwache/Zustandsklassen
  "warteschlange-parallelitaet-test.js",    // Parallelitaet der Warteschlange
  "understanding-gate-test.js",             // politische Vorpruefung vor dem Verstehen
  "understanding-gate-arm-test.js",         // Gate-Riegel
  "understanding-gate-integration-test.js", // Gate ist im Pfad verdrahtet
  "dedup-findings-test.js",                 // Dedup-Kennungswahrheit
  "source-dedupe-test.js"                   // Quellen-Deduplizierung
]);

// Alle Suiten, die der Runner sammelt (Standard + alles Weitere). Die Sammlung ist die
// VOLLSTAENDIGE Offline-Regression und der erweiterte Lauf; der Standardlauf ist die
// Teilmenge STANDARD (siehe oben).
function collectSuites() {
  return fs
    .readdirSync(path.join(ROOT, "scripts"))
    .filter((f) => f.endsWith(".js"))
    .filter((f) => !DENYLIST.has(f))
    // Review-Fix: adversarial-gesamttest.js endet nicht auf "-test.js" und lief
    // dadurch in KEINEM CI-Pfad — der Namensfilter kennt das Muster jetzt explizit.
    .filter((f) => f.endsWith("-test.js") || f.endsWith("gesamttest.js") || f === "p1-security-check.js")
    .sort();
}

// Der kanonische Standardlauf (identisch mit dem CI-Gate): NUR die explizite Kernmenge.
// Eine neue Testdatei ist damit NICHT automatisch Pflicht — siehe Kopfkommentar.
function standardSuites() {
  return collectSuites().filter((f) => STANDARD.has(f));
}

// Liest den Wert nach einem Schalter bis zum naechsten Schalter (auch mehrere Argumente).
function wertNach(args, flag) {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const teile = [];
  for (let j = i + 1; j < args.length; j++) {
    if (String(args[j]).startsWith("--")) break;
    teile.push(args[j]);
  }
  return teile.join(" ");
}

function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const extended = args.includes("--extended");
  const nurBereich = args.includes("--nur-bereich");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const alle = collectSuites();
  const AUSWAHL = require("./bereichsauswahl.js");

  // Uebersicht der Bereiche (Kontrolle/Doku): Name und zusaetzliche Suiten ohne Standard.
  if (args.includes("--bereiche")) {
    for (const name of Object.keys(AUSWAHL.BEREICHE).sort()) {
      const suiten = AUSWAHL.suitenFuerBereiche(alle, [name]).filter((f) => !STANDARD.has(f));
      console.log(`${name.padEnd(24)} ${String(suiten.length).padStart(3)} zusaetzliche Suiten`);
    }
    return 0;
  }

  // Sicherheitsnetz: ein Standard-Name, den collectSuites() nicht kennt (Tippfehler oder
  // umbenannte/entfernte Datei), wuerde den Pflichtlauf sonst STILL verkleinern. Das muss
  // laut scheitern, nicht leise durchrutschen.
  const fehlend = [...STANDARD].filter((f) => !alle.includes(f));
  if (fehlend.length) {
    console.error(`[run-offline-tests] STANDARD nennt ${fehlend.length} Suite(n), die nicht gesammelt werden: ${fehlend.join(", ")}`);
    console.error("  > Bitte Tippfehler/Umbenennung in STANDARD korrigieren — sonst laeuft der Pflichtlauf unvollstaendig.");
    return 1;
  }

  // Modus: Standard (Default), erweitert (alles) oder Bereich (automatische Fachregression).
  let auswahlInfo = null;
  let suites;
  if (extended) {
    suites = alle.slice();
  } else {
    const aendert = wertNach(args, "--aendert");
    const bereichArg = wertNach(args, "--bereich");
    const basis = nurBereich ? [] : standardSuites();
    let bereichsSuiten = [];
    if (aendert != null) {
      const dateien = String(aendert).split(/[\s,]+/).filter(Boolean);
      auswahlInfo = AUSWAHL.bereichsSuiten(dateien, alle, STANDARD);
      bereichsSuiten = auswahlInfo.suiten;
    } else if (bereichArg != null) {
      const namen = String(bereichArg).split(/[\s,]+/).filter(Boolean);
      const unbekannt = namen.filter((n) => !AUSWAHL.BEREICHE[n]);
      if (unbekannt.length) {
        console.error(`[run-offline-tests] Unbekannte Bereiche: ${unbekannt.join(", ")}`);
        console.error(`  Verfuegbar: ${Object.keys(AUSWAHL.BEREICHE).sort().join(", ")}`);
        return 1;
      }
      const ziele = [...namen].sort();
      bereichsSuiten = AUSWAHL.suitenFuerBereiche(alle, ziele).filter((f) => !STANDARD.has(f));
      auswahlInfo = { bereiche: ziele, zielBereiche: ziele, konservativ: false, unbekannt: [], querschnitt: false, suiten: bereichsSuiten };
    }
    // Vereinigung: Standard + Bereich, ohne Doppelaeufe.
    suites = [...new Set([...basis, ...bereichsSuiten])].sort();
  }
  if (only) suites = suites.filter((f) => f.includes(only));

  if (auswahlInfo && !listOnly) {
    console.log(`Bereichsauswahl: ${auswahlInfo.zielBereiche.join(", ") || "keine"}`);
    if (auswahlInfo.querschnitt) console.log("  Zentrale/geteilte Kerndatei geaendert -> konservative Sammelmenge (alle Bereiche).");
    if (auswahlInfo.unbekannt.length) console.log(`  FAIL CLOSED: ${auswahlInfo.unbekannt.length} relevante Datei(en) ohne Bereichszuordnung -> konservative Sammelmenge: ${auswahlInfo.unbekannt.join(", ")}`);
    if (!auswahlInfo.zielBereiche.length) console.log("  Keine fachlich relevanten Aenderungen (z. B. nur Dokumentation) -> keine zusaetzlichen Bereichstests.");
    console.log(`  Bereichs-Suiten (ohne Standard-Doppellaeufe): ${auswahlInfo.suiten.length}`);
  }

  const modus = extended
    ? "erweitert = vollstaendige Regression"
    : ((auswahlInfo || nurBereich) ? "Bereich = automatische Fachregression" : "Standard = Pflichtlauf");

  if (listOnly) {
    suites.forEach((f) => console.log(f));
    console.log(`\n${suites.length} Offline-Suiten (${modus})`);
    if (!extended && !auswahlInfo) {
      const rest = alle.filter((f) => !STANDARD.has(f));
      console.log(`Nicht im Standardlauf (nur mit --extended bzw. \`npm run test:offline:extended\`): ${rest.length} Suiten`);
    }
    return 0;
  }

  const failed = [];
  const netAttempts = [];
  const started = Date.now();
  for (const suite of suites) {
    const t0 = Date.now();
    // --require dieser Datei = technischer Offline-Zwang (siehe Kopfkommentar);
    // NO_NETWORK_TESTS=1 aktiviert den Guard und steht künftig auch lib-Code
    // (z. B. ai.js/crawler.js) als Fetch-Guard-Signal zur Verfügung.
    const res = spawnSync(process.execPath, ["--require", __filename, path.join("scripts", suite)], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 180000,
      env: {
        ...process.env,
        HELMUT_OFFLINE_TEST: "1",
        NO_NETWORK_TESTS: "1",
        // Nur fuer die Suiten aus WERKZEUG_VERWEIGERUNG: Umgebungspruefung aus,
        // LAUFZEITSPERRE bleibt an (siehe scripts/lokaler-netzschutz.js).
        ...(WERKZEUG_VERWEIGERUNG.has(suite) ? { HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG: "ja" } : {})
      }
    });
    const ms = Date.now() - t0;
    // Blockierte Netz-Versuche einsammeln — auch wenn die Suite den Fehler
    // fängt und grün endet, soll der Versuch am Ende sichtbar sein.
    for (const line of `${res.stdout || ""}\n${res.stderr || ""}`.split("\n")) {
      if (line.includes(NET_GUARD_MARKER) && !netAttempts.includes(suite)) netAttempts.push(suite);
    }
    const ok = res.status === 0;
    if (!ok) {
      failed.push(suite);
      console.log(`FAIL  ${suite} (${ms}ms, exit=${res.status})`);
      const zeilen = `${res.stdout || ""}\n${res.stderr || ""}`.trim().split("\n");
      // Diagnose-Fix 2026-08-03: der Auszug "letzte 15 Zeilen" verfehlt bei langen
      // Suiten genau die Zeile, die den Fehlschlag BENENNT. Beim CI-Flackern vom
      // 03.08. (Lauf 30806535691, reset-timing-seitenkanal-test.js, "79 passed,
      // 1 failed") war aus dem Log deshalb nicht ablesbar, WELCHE der 80 Pruefungen
      // rot war — die Ursachensuche musste raten. Die FAIL-Zeilen der Suite werden
      // jetzt zusaetzlich ausgegeben (gedeckelt, damit ein Totalausfall das Log
      // nicht flutet). Das versteckt nichts und aendert kein Ergebnis.
      const eigeneFails = zeilen.filter((l) => /^\s*FAIL\b/.test(l));
      if (eigeneFails.length) {
        console.log(eigeneFails.slice(0, 20).join("\n").replace(/^/gm, "      "));
        if (eigeneFails.length > 20) console.log(`      … ${eigeneFails.length - 20} weitere FAIL-Zeilen`);
      }
      const tail = zeilen.slice(-15).join("\n");
      console.log(tail.replace(/^/gm, "      "));
    } else {
      console.log(`PASS  ${suite} (${ms}ms)`);
    }
  }

  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`\n${suites.length - failed.length}/${suites.length} Suiten grün in ${secs}s (${modus})`);
  if (netAttempts.length) {
    console.log(`${NET_GUARD_MARKER} Suiten mit blockierten Nicht-Localhost-Verbindungen: ${netAttempts.join(", ")}`);
  }
  if (failed.length) {
    console.log(`Fehlgeschlagen: ${failed.join(", ")}`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  // ZENTRALER SCHUTZ (OP-30-Korrektursprint, 2026-08-08). Der Runner-eigene Guard unten
  // bleibt als zweite, unabhaengige Schicht bestehen — aber die ERSTE Schicht ist jetzt
  // `scripts/lokaler-netzschutz.js`. Grund: der Runner-Guard griff ausschliesslich im
  // Preload-Pfad und liess jeden Direktaufruf ungeschuetzt; genau dort entstand der
  // versehentliche Production-Lesezugriff. Der zentrale Schutz prueft zusaetzlich die
  // Umgebung (Zugangsdaten, Datenbankadressen, Quellenmodus) und bricht fail closed ab.
  require("./lokaler-netzschutz.js");
  process.exit(main());
} else if (process.env.NO_NETWORK_TESTS === "1") {
  // Als --require-Preload in einem Testprozess geladen -> Offline-Zwang aktiv.
  installNetGuard();
}

// Fuer den Auswahl-Vertragstest (scripts/bereichsauswahl-test.js): die Kernmenge und die
// Sammlung lesbar machen, ohne den Runner als Prozess zu starten.
module.exports = { STANDARD, collectSuites, standardSuites };
