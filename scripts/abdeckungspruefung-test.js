"use strict";

// Offline-Belege für Bedarfszuordnung, ehrliche Betriebszustände und Frische.
// Keine Production-IDs, keine Netz-/Datenbank-/Modellaufrufe.
const assert = require("node:assert/strict");
const { buildAbdeckungspruefung: audit } = require("../lib/helmut/quellenarchitektur/abdeckungspruefung");
const NOW = Date.parse("2026-11-06T12:00:00Z"), DAY = 86400000;
const date = (days) => new Date(NOW - days * DAY).toISOString();
const profile = { id: "fixture-mandat", name: "Testprofil", party: "Fraktionslos", parliamentType: "Bundestag" };
function fixture() {
  return {
    publishers: [
      { id: "pub-amt", canonical_domain: "amt.example", evidence_role: "official_primary" },
      { id: "pub-redaktion", canonical_domain: "redaktion.example", evidence_role: "journalistic" }
    ],
    retrievalPaths: [
      { id: "rp-amt", legacy_source_id: "amt", name: "Amt", publisher_id: "pub-amt", method: "rss", status: "healthy", activation_mode: "auto", expected_frequency: "weekly" },
      { id: "rp-redaktion", legacy_source_id: "redaktion", name: "Redaktion", publisher_id: "pub-redaktion", method: "rss", status: "healthy", activation_mode: "auto", expected_frequency: "daily" }
    ],
    packages: [{ id: "pkg-bund", key: "bund-basis", name: "Bund", status: "active", is_base: true }],
    packagePaths: [{ package_id: "pkg-bund", retrieval_path_id: "rp-amt" }, { package_id: "pkg-bund", retrieval_path_id: "rp-redaktion" }]
  };
}
function telemetry(source, status = "ok") {
  return [0.1, 1, 2].map((days) => ({ source_id: source, created_at: date(days), run_id: `${source}-${days}`, status, found_documents: status === "ok" ? 3 : 0, new_documents: status === "ok" ? 1 : 0, duration_ms: 300, error_code: status === "error" ? "http-503" : null }));
}
function doc(source, days, extra = {}) {
  return { source_id: source, published_at: date(days), excerpt: "Der veröffentlichte Bericht beschreibt die beschlossene Änderung und die vorgesehenen nächsten Schritte im parlamentarischen Verfahren.", original_url: `https://${source}.example/artikel`, ...extra };
}
function run(extra = {}) {
  return audit({ catalog: fixture(), profiles: [profile], telemetrie: [...telemetry("amt"), ...telemetry("redaktion")], documents: [doc("amt", 1), doc("redaktion", 1)], now: NOW, ...extra });
}
function path(result, id = "rp-amt") { return result.paths.find((p) => p.id === id); }
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }

test("Belegte Versorgung verlangt erfolgreiche Historie beider Pflichtrollen", () => {
  const r = run();
  assert.equal(r.status, "versorgung_belegt");
  assert.equal(path(r).state, "gesund");
  assert.equal(r.packages[0].healthyPathCount, 2);
  assert.equal(path(r).documents.status, "belegt");
});
test("Erfolgreiche Abrufe ohne Inhaltsprüfung sind keine belegte Versorgung", () => {
  const r = run({ documents: null });
  assert.notEqual(r.status, "versorgung_belegt");
  assert.equal(r.packages[0].technicalHealthyPathCount, 2);
  assert.equal(r.packages[0].healthyPathCount, 0);
});
test("healthy im Katalog ohne Laufdaten bleibt unbekannt", () => {
  const r = run({ telemetrie: [] });
  assert.equal(path(r).state, "unbekannt");
  assert.notEqual(r.status, "versorgung_belegt");
  assert.equal(r.summary.unknownPaths, 2);
});
test("Wiederholter Feedfehler wird als Störung ausgewiesen", () => {
  const r = run({ telemetrie: [...telemetry("amt", "error"), ...telemetry("redaktion")] });
  assert.equal(path(r).state, "gestoert");
  assert(r.findings.some((f) => f.code === "abruf_gestoert" && f.level === "warnung"));
});
test("Bekannter Defekt bleibt ohne Telemetrie sichtbar", () => {
  const c = fixture(); c.retrievalPaths[0].status = "broken";
  assert.equal(path(run({ catalog: c, telemetrie: [] })).state, "defekt");
});
test("Bewusst pausiert schlägt früheren Fehler und ist kein Defekt", () => {
  const c = fixture(); c.retrievalPaths[0].status = "paused";
  const r = run({ catalog: c, telemetrie: [...telemetry("amt", "error")] });
  assert.equal(path(r).state, "inaktiv");
  assert(!r.findings.some((f) => f.code === "abruf_gestoert" && f.pathId === "rp-amt"));
  assert(r.packages[0].unprovenRoles.includes("official_primary"));
});
test("Inventur-Ausschluss wird wiederverwendet", () => {
  const r = run({ paketInventur: { pakete: [{ abrufwege: { liste: [{ wegId: "rp-amt", planzustand: "ausgeschlossen", planGrund: "landesmodul-gesperrt (vorbereitet)" }] } }] } });
  assert.equal(path(r).state, "inaktiv");
});
test("Manueller Weg ist keine belegte automatische Versorgung", () => {
  const c = fixture(); c.retrievalPaths[0].activation_mode = "manual";
  const r = run({ catalog: c });
  assert.equal(path(r).state, "manuell");
  assert.equal(r.packages[0].healthyPathCount, 1);
});
test("Fehlendes angefordertes Landesmodul wird alarmiert", () => {
  const r = run({ profiles: [{ ...profile, parliamentType: "Landtag", state: "Berlin" }] });
  assert(r.findings.some((f) => f.code === "bedarfszuordnung_fehlt" && /berlin/.test(f.packageKey) && f.level === "fehler"));
});
test("Eigene Parteiquelle im neutralen Basispaket wird erkannt", () => {
  const c = fixture(); c.retrievalPaths[0].partyPackageOnly = true;
  const r = run({ catalog: c });
  assert(r.findings.some((f) => f.code === "parteibindung_im_basispaket"));
});
test("Allgemeine Fraktionsbeobachtung ist keine unerlaubte Parteienbindung", () => {
  const c = fixture(); c.publishers[0].publisher_type = "parliamentary_group";
  c.retrievalPaths[0].coverageClasses = ["bundestagsfraktionen"];
  assert(!run({ catalog: c }).findings.some((f) => f.code === "parteibindung_im_basispaket"));
});
test("Leerer Bedarf erzeugt auch bei Kataloglücken keinen Alarm", () => {
  const c = fixture(); c.packagePaths = [];
  const r = run({ catalog: c, profiles: [] });
  assert.equal(r.status, "ohne_aktiven_bedarf");
  assert.equal(r.summary.errors + r.summary.warnings, 0);
  assert(r.findings.length > 0);
});
test("Unbekannter Bedarf ist keine grüne Versorgung", () => {
  const r = run({ profiles: null });
  assert.equal(r.status, "unbekannt");
  assert.equal(r.summary.errors + r.summary.warnings, 0);
});
test("Deaktiviertes Profil erzeugt keinen Bedarf", () => {
  assert.equal(run({ profiles: [{ ...profile, profileActive: false }] }).status, "ohne_aktiven_bedarf");
});
test("Google-abhängige Rollen werden auch bei benanntem Herausgeber erkannt", () => {
  const c = fixture(); c.retrievalPaths[0].method = "googlenews_search";
  const r = run({ catalog: c });
  assert.equal(r.packages[0].googleOnly, false);
  assert.deepEqual(r.packages[0].directMissingRoles, ["official_primary"]);
  assert(r.findings.some((f) => f.code === "nur_google_abhaengigkeit"));
});
test("Wöchentliche Quelle ist nach acht Tagen noch frisch", () => {
  const r = run({ documents: [doc("amt", 8), doc("redaktion", 1)] });
  assert.equal(path(r).documents.status, "belegt");
  assert.equal(r.status, "versorgung_belegt");
});
test("Datiertes Material nach 30 Tagen verletzt Wochenrhythmus", () => {
  const r = run({ documents: [doc("amt", 30), doc("redaktion", 1)] });
  assert.equal(path(r).documents.status, "veraltet");
  assert(r.findings.some((f) => f.code === "inhalt_veraltet"));
  assert.equal(r.packages[0].status, "eingeschraenkt");
});
test("Parlamentarische Pause unterdrückt nur Publikationsalter", () => {
  const policyByPath = { "rp-amt": { publicationPause: { from: date(10), until: date(-10), reason: "Sitzungsfreie Zeit laut Kalender" } } };
  const r = run({ documents: [doc("amt", 30), doc("redaktion", 1)], policyByPath });
  assert.equal(path(r).documents.stale, false);
  const failure = run({ policyByPath, telemetrie: [...telemetry("amt", "error"), ...telemetry("redaktion")] });
  assert.equal(path(failure).state, "gestoert");
});
test("Abgelaufene Pause lässt die Frischeprüfung wieder gelten", () => {
  const r = run({ documents: [doc("amt", 30)], policyByPath: { amt: { publicationPause: { from: date(20), until: date(1), reason: "Pause beendet" } } } });
  assert.equal(path(r).documents.stale, true);
});
test("Abrufzeit ersetzt niemals Veröffentlichungsdatum", () => {
  const r = run({ documents: [doc("amt", 1, { published_at: null, retrieved_at: date(0) }), doc("redaktion", 1)] });
  assert.equal(path(r).documents.missingDate, 1);
  assert.equal(path(r).documents.latestPublicationAt, null);
  assert.notEqual(r.packages[0].status, "versorgung_belegt");
});
test("Fehlende Auszüge und Google-Weiterleitung bleiben erkennbare Beleglücken", () => {
  const r = run({ documents: [doc("amt", 1, { excerpt: "", original_url: "https://news.google.com/articles/abc" })] });
  assert.equal(path(r).documents.missingExcerpt, 1);
  assert.equal(path(r).documents.missingProvenance, 1);
});
test("Undatierte und unbekannte Frequenz wird nicht mit pauschalem 7-Tage-Limit bewertet", () => {
  const c = fixture(); delete c.retrievalPaths[0].expected_frequency;
  const r = run({ catalog: c, documents: [doc("amt", 90)] });
  assert.equal(path(r).documents.maxAgeDays, null);
  assert.equal(path(r).documents.status, "unbekannt");
});
test("Versionsverfall ist datengetrieben und now-injizierbar", () => {
  const policyByPath = { amt: { verifiedAt: date(20), reviewAfterDays: 10 } };
  assert.equal(path(run({ policyByPath })).verification.status, "abgelaufen");
  assert.equal(path(run({ policyByPath, now: NOW - 15 * DAY })).verification.status, "gueltig");
  assert.equal(path(run()).verification.status, "unbekannt");
});
test("Mehrere URLs desselben Herausgebers erhöhen keine Unabhängigkeitszahl", () => {
  const c = fixture();
  c.retrievalPaths.push({ ...c.retrievalPaths[0], id: "rp-zweit", legacy_source_id: "zweit" });
  c.packagePaths.push({ package_id: "pkg-bund", retrieval_path_id: "rp-zweit" });
  assert.equal(run({ catalog: c }).packages[0].publisherCount, 2);
  c.publishers.forEach((p) => { p.owner_id = "gleicher-traeger"; });
  assert.equal(run({ catalog: c }).packages[0].publisherCount, 1);
});
test("Verfahrensgremien dürfen explizit ohne Datenpflicht definiert sein", () => {
  const c = fixture(); c.packages[0].required_evidence_roles = ["official_primary", "journalistic"];
  c.packages[0].required_classes = ["person_pilot", "obsolete_klasse"];
  assert.deepEqual(run({ catalog: c }).packages[0].requiredRoles, ["journalistic", "official_primary"]);
});
test("Historische Partei-Pilotklasse ändert keinen neutralen Landesvertrag", () => {
  const c = fixture(); c.packages[0].required_classes = ["partei_pilot", "person_pilot"];
  assert.deepEqual(run({ catalog: c }).packages[0].requiredRoles, ["official_primary", "journalistic"]);
});
test("Sollpaket fehlt ohne Bedarf als Hinweis und wird nicht als DB-Paket erfunden", () => {
  const r = run({ profiles: [], expectedPackages: [{ key: "fach-test", required_evidence_roles: ["official_primary", "data_source"] }] });
  assert.deepEqual(r.missingExpectedPackages, ["fach-test"]);
  assert.equal(r.findings.find((f) => f.code === "sollpaket_fehlt").level, "hinweis");
  assert(!r.packages.some((p) => p.key === "fach-test"));
});
test("Zentrale Paketrollen werden auch ohne DB-Spalte geprüft", () => {
  const r = run({ policyByPackage: { "bund-basis": { required_evidence_roles: ["official_primary", "journalistic", "data_source"] } } });
  assert.deepEqual(r.packages[0].missingRoles, ["data_source"]);
});
test("Geprüfte Pfadmetadaten bestimmen die Rolle eines Mehrzweckherausgebers", () => {
  const r = run({ policyByPath: { amt: { evidence_role: "data_source", party_package_only: true, source_verification: { checkedAt: date(20), reviewAfterDays: 10 } } } });
  assert.equal(path(r).role, "data_source");
  assert.equal(path(r).verification.status, "abgelaufen");
  assert(r.findings.some((f) => f.code === "parteibindung_im_basispaket"));
});
test("Offene Rechte verhindern belegte automatische Versorgung", () => {
  const r = run({ policyByPath: { amt: { rights_review_required: true } } });
  assert.equal(r.packages[0].healthyPathCount, 1);
  assert(r.findings.some((f) => f.code === "zugriffsrechte_ungeklaert"));
});
test("Ausgabe ist begrenzt, Gesamtsumme und Limit bleiben ehrlich", () => {
  const c = fixture(); c.packagePaths = [];
  const r = run({ catalog: c, maxFindings: 1 });
  assert.equal(r.findings.length, 1);
  assert.equal(r.summary.omittedFindings, r.summary.findings - 1);
});
test("Gleiche Eingaben erzeugen dieselbe Ausgabe ohne Mutation", () => {
  const input = { catalog: fixture(), profiles: [profile], now: NOW };
  const copy = JSON.stringify(input);
  assert.deepEqual(audit(input), audit(input));
  assert.equal(JSON.stringify(input), copy);
});
console.log(`\n${count}/${count} Abdeckungsprüfungen bestanden.`);
