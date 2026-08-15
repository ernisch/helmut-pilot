"use strict";

// Helmut — Organisationstest der Supabase-Migrationen (Sicherheitskorrektur 2026-08-14).
// =============================================================================================
// HINTERGRUND (empirisch belegt mit Supabase CLI 2.114.0 an einer frischen lokalen
// PostgreSQL 16, dokumentiert in docs/betrieb/op30-zielarchitektur-2026-08-13.md §17):
//   * Die CLI wendet JEDE Datei an, die dem Muster "<timestamp>_name.sql" entspricht —
//     auch 8-stellige Datumsstempel und auch Dateien mit "_rollback" im Namen. Ein
//     normaler `supabase db push` haette die alte Ablage (Rollback direkt neben der
//     Vorwaertsdatei, gleicher Tagesstempel) so ausgefuehrt: Vorwaertsmigration,
//     DANACH ihr Rollback (Objekte wieder geloescht), dann Abbruch an der
//     Versionskollision (version=20260813 doppelt) — Endzustand: keine Objekte,
//     Buchfuehrung behauptet "angewendet".
//   * Dateien, die NICHT mit einem Zeitstempel beginnen (z. B. "rollback_…"), werden
//     von der CLI ausdruecklich uebersprungen ("file name must match pattern").
//
// DAHER DIE VERBINDLICHE NEU-KONVENTION (ab 2026-08-13, CLAUDE.md §4 Regel 8):
//   1. Vorwaertsmigrationen: eindeutiger, vollstaendiger 14-stelliger Zeitstempel
//      (JJJJMMTThhmmss) — nie zwei Dateien mit derselben Versionsnummer.
//   2. Rollback-Skripte: "rollback_<vorwaertsname>.sql" im selben Verzeichnis — fuer
//      die CLI strukturell unausfuehrbar, fuer den Betreiber direkt daneben auffindbar.
// Die Altdateien (8-stellige Stempel, "_rollback"-Suffix) sind ANGEWENDETE HISTORIE und
// werden nicht umbenannt; sie stehen als eingefrorene Liste hier im Test. Diese Liste
// darf NIE wachsen — jede neue Datei muss der Neu-Konvention folgen. Die Altlast selbst
// (ein CLI-Lauf wuerde auch sie falsch ausfuehren) ist in der Belegdatei §17 dokumentiert;
// die Betreiberpraxis (manuelle Anwendung im SQL-Editor) beruehrt sie nicht.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const VERZEICHNIS = path.join(__dirname, "..", "supabase", "migrations");

// Eingefrorene Altlast (Stand 2026-08-14). NIE erweitern.
const ALTBESTAND = new Set([
  "20260711_presale_hardening.sql",
  "20260711_presale_hardening_rollback.sql",
  "20260712_mandate_profile_completeness.sql",
  "20260712_mandate_profile_completeness_rollback.sql",
  "20260712_mandate_profile_fields.sql",
  "20260712_mandate_profile_fields_rollback.sql",
  "20260712_tenant_rls_policies.sql",
  "20260712_tenant_rls_policies_rollback.sql",
  "20260713_source_architecture.sql",
  "20260713_source_architecture_rollback.sql",
  "20260714_ko_classification.sql",
  "20260714_ko_classification_rollback.sql",
  "20260715_dedup_findings.sql",
  "20260715_dedup_findings_rollback.sql",
  "20260716_gate_shadow_telemetry.sql",
  "20260716_gate_shadow_telemetry_rollback.sql",
  "20260716_llm_usage_source_attribution.sql",
  "20260716_llm_usage_source_attribution_rollback.sql",
  "20260717_llm_budget_reservation.sql",
  "20260717_llm_budget_reservation_rollback.sql",
  "20260718_source_crawl_telemetry.sql",
  "20260718_source_crawl_telemetry_rollback.sql",
  "20260719_pipeline_lock_atomic.sql",
  "20260719_pipeline_lock_atomic_rollback.sql",
  "20260720_crawl_runs_relational.sql",
  "20260720_crawl_runs_relational_rollback.sql",
  "20260721_security_advisor_hardening.sql",
  "20260721_security_advisor_hardening_rollback.sql",
  "20260727_process_runs_relational.sql",
  "20260727_process_runs_relational_rollback.sql",
  "20260728_embedding_shadow.sql",
  "20260728_embedding_shadow_rollback.sql",
  "20260728_matching_audit.sql",
  "20260728_matching_audit_rollback.sql",
  "20260808_jobqueue_abhaengigkeiten.sql",
  "20260808_jobqueue_abhaengigkeiten_rollback.sql",
  "20260808_jobqueue_bereinigung.sql",
  "20260808_jobqueue_bereinigung_rollback.sql",
  "20260808_llm_budget_fairness.sql",
  "20260808_llm_budget_fairness_rollback.sql",
  "20260808_scalable_job_queue.sql",
  "20260808_scalable_job_queue_rollback.sql",
  "20260809_jobqueue_narrativ.sql",
  "20260809_jobqueue_narrativ_rollback.sql",
  "20260809_jobqueue_wiedervorlage.sql",
  "20260809_jobqueue_wiedervorlage_rollback.sql",
  "20260812_jobqueue_altersmessung.sql",
  "20260812_jobqueue_altersmessung_rollback.sql"
]);

const NEU_VORWAERTS = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const NEU_ROLLBACK = /^rollback_(\d{14})_([a-z0-9_]+)\.sql$/;
// Was die Supabase CLI als Vorwaertsmigration ausfuehren wuerde (empirisch: fuehrende
// Ziffern beliebiger Laenge + "_name.sql").
const CLI_AUSFUEHRBAR = /^\d+_.+\.sql$/;

let pass = 0;
let fail = 0;
function check(name, bedingung, detail) {
  if (bedingung) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

console.log("Helmut — Organisationstest supabase/migrations (Neu-Konvention ab 2026-08-13)");

const dateien = fs.readdirSync(VERZEICHNIS).filter((f) => f.endsWith(".sql")).sort();
const neue = dateien.filter((f) => !ALTBESTAND.has(f));
const neueVorwaerts = neue.filter((f) => NEU_VORWAERTS.test(f));
const neueRollbacks = neue.filter((f) => NEU_ROLLBACK.test(f));

console.log(`\n== 1 · Jede Datei ist Altbestand (eingefroren) oder folgt der Neu-Konvention ==`);
const unzuordenbar = neue.filter((f) => !NEU_VORWAERTS.test(f) && !NEU_ROLLBACK.test(f));
check("1.1 Keine Datei ausserhalb von Altbestand und Neu-Konvention", unzuordenbar.length === 0,
  `unzuordenbar: ${unzuordenbar.join(", ")}`);
const fehlenderAltbestand = [...ALTBESTAND].filter((f) => !dateien.includes(f));
check("1.2 Der eingefrorene Altbestand ist vollstaendig vorhanden (Historie unangetastet)",
  fehlenderAltbestand.length === 0, `fehlt: ${fehlenderAltbestand.join(", ")}`);

console.log(`\n== 2 · Neue Vorwaertsmigrationen: eindeutige, vollstaendige 14-stellige Stempel ==`);
check("2.1 Es gibt neue Vorwaertsmigrationen (mindestens die zwei der Zielarchitektur)",
  neueVorwaerts.length >= 2, `gefunden: ${neueVorwaerts.length}`);
const alleVersionen = dateien
  .filter((f) => CLI_AUSFUEHRBAR.test(f))
  .map((f) => f.match(/^(\d+)_/)[1]);
const doppelteNeue = alleVersionen.filter(
  (v, i) => v.length === 14 && alleVersionen.indexOf(v) !== i
);
check("2.2 Keine zwei CLI-ausfuehrbaren Dateien teilen eine 14-stellige Version",
  doppelteNeue.length === 0, `doppelt: ${doppelteNeue.join(", ")}`);
const maxAlt = [...ALTBESTAND].map((f) => f.match(/^(\d+)_/)[1]).sort().pop();
const zuFrueh = neueVorwaerts.filter((f) => f.match(NEU_VORWAERTS)[1].slice(0, 8) < maxAlt.slice(0, 8));
check("2.3 Jede neue Vorwaertsmigration sortiert NACH der gesamten Alt-Historie",
  zuFrueh.length === 0, `zu frueh: ${zuFrueh.join(", ")}`);

console.log(`\n== 3 · Rollbacks: strukturell CLI-unausfuehrbar, aber im selben Verzeichnis ==`);
const neueCliRollbacks = neue.filter((f) => CLI_AUSFUEHRBAR.test(f) && /rollback/.test(f));
check("3.1 KEINE neue Datei ist zugleich CLI-ausfuehrbar und ein Rollback",
  neueCliRollbacks.length === 0, `gefaehrlich: ${neueCliRollbacks.join(", ")}`);
for (const vorwaerts of neueVorwaerts) {
  const erwartet = `rollback_${vorwaerts}`;
  const vorhanden = neueRollbacks.includes(erwartet);
  const inhalt = vorhanden ? fs.readFileSync(path.join(VERZEICHNIS, erwartet), "utf8").trim() : "";
  check(`3.2 ${vorwaerts} hat ein nicht-leeres rollback_-Gegenstueck`,
    vorhanden && inhalt.length > 100, vorhanden ? "rollback zu kurz" : `fehlt: ${erwartet}`);
}
const verwaisteRollbacks = neueRollbacks.filter((f) => !neueVorwaerts.includes(f.replace(/^rollback_/, "")));
check("3.3 Kein verwaistes rollback_-Skript ohne Vorwaertsmigration",
  verwaisteRollbacks.length === 0, `verwaist: ${verwaisteRollbacks.join(", ")}`);

console.log(`\n== 4 · Der Altbestand waechst NIE (jede neue Datei folgt der Neu-Konvention) ==`);
const achtstelligNeu = neue.filter((f) => /^\d{8}_/.test(f));
check("4.1 Keine neue Datei mit 8-stelligem Altstempel", achtstelligNeu.length === 0,
  `alt-stil: ${achtstelligNeu.join(", ")}`);

// == 5 · ALLES ODER NICHTS ==================================================================
// BEFUND der Production-Vorpruefung nach PR #248 (2026-08-15): 20260814090000 und
// 20260814090100 trugen als EINZIGE Dateien des Verzeichnisses keine Transaktionsklammer.
// Empirisch belegt an einer frischen PostgreSQL 16: bricht eine solche Datei in der Mitte ab
// (fehlende Voraussetzung, `lock_timeout`, Verbindungsabbruch), bleibt ein TEILSTAND zurueck —
// `helmut_claim_job_by_id` stand allein da, alles danach fehlte. Ein halb angewendeter
// Migrationsschritt ist falsches Gruen (CLAUDE.md §4 Regel 4) und macht den Rueckweg
// mehrdeutig. Diese Pruefung haelt die Klammer fuer JEDE neue Datei fest — vorwaerts wie
// rueckwaerts. Der eingefrorene Altbestand ist angewendete Historie und bleibt aussen vor.
console.log(`\n== 5 · Jede neue Migration ist eine Transaktion (alles oder nichts) ==`);
for (const datei of [...neueVorwaerts, ...neueRollbacks].sort()) {
  const zeilen = fs.readFileSync(path.join(VERZEICHNIS, datei), "utf8")
    .split("\n").map((z) => z.trim().toLowerCase());
  const beginnt = zeilen.filter((z) => z === "begin;").length;
  const endet = zeilen.filter((z) => z === "commit;").length;
  check(`5.1 ${datei} ist genau einmal in begin;/commit; geklammert`,
    beginnt === 1 && endet === 1, `begin=${beginnt} commit=${endet}`);
}

console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
process.exit(fail > 0 ? 1 : 0);
