"use strict";

// Reale Tabellenform + zentraler Sollvertrag, rein offline ohne Speicher-I/O.
const assert = require("node:assert/strict");
const { buildBetriebsabdeckung: audit, summarizeBetriebsabdeckung } = require("../lib/helmut/quellenarchitektur/betriebsabdeckung");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const NOW = Date.parse("2026-11-06T12:00:00Z"), DAY = 86400000;
const date = (days) => new Date(NOW - days * DAY).toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const PROFILE = { id: "fixture-mandat", name: "Testprofil", party: "Fraktionslos", parliamentType: "Bundestag" };
const TEXT = "Die Regierung beschreibt in ihrem aktuellen Bericht verschiedene geplante Maßnahmen zur Verbesserung der kommunalen Infrastruktur und erläutert die nächsten Schritte des parlamentarischen Verfahrens.";

function fixture() {
  const expectedCatalog = {
    publishers: [
      { id: "pub-amt", canonical_domain: "amt.example", evidence_role: "official_primary" },
      { id: "pub-medium", canonical_domain: "medium.example", evidence_role: "journalistic" }
    ],
    packages: [{ id: "pkg-bund", key: "bund-basis", is_base: true, status: "active",
      required_evidence_roles: ["official_primary", "journalistic"],
      required_classes: ["parlament_bund", "regierung_bund", "leitmedien_bund"] }],
    retrievalPaths: [
      ["parlament", "pub-amt", "official_primary", "parlament_bund"],
      ["regierung", "pub-amt", "official_primary", "regierung_bund"],
      ["medium", "pub-medium", "journalistic", "leitmedien_bund"]
    ].map(([id, publisher, role, klass]) => ({
      id: `rp-${id}`, legacy_source_id: id, name: id, publisher_id: publisher,
      url: `https://${id}.example/feed`, method: "rss", parser: "rss-regex",
      activation_mode: "auto", status: "healthy", expected_frequency: "weekly",
      evidence_role: role, coverage_classes: [klass], party_package_only: false,
      rights_review_required: false, source_verification: { checkedAt: date(1) }
    })),
    packagePaths: ["parlament", "regierung", "medium"].map((id) => ({ package_id: "pkg-bund", retrieval_path_id: `rp-${id}` }))
  };
  // DB-Zeilen tragen keine neuen Code-Spalten. Metadaten dürfen nur nach
  // Identitätsprüfung aus dem Sollkatalog übernommen werden.
  const catalog = {
    publishers: clone(expectedCatalog.publishers),
    packages: expectedCatalog.packages.map(({ required_evidence_roles, ...pkg }) => ({ ...pkg, required_classes: [] })),
    retrievalPaths: expectedCatalog.retrievalPaths.map(({ evidence_role, coverage_classes, party_package_only, rights_review_required, source_verification, ...path }) => path),
    packagePaths: clone(expectedCatalog.packagePaths)
  };
  const telemetrie = catalog.retrievalPaths.flatMap((p) => [0.2, 1, 2].map((days) => ({
    source_id: p.legacy_source_id, run_id: `fixture-${days}`, created_at: date(days),
    status: "ok", found_documents: 3, new_documents: 1, duration_ms: 300
  })));
  const documents = catalog.retrievalPaths.map((p) => ({
    source_id: p.legacy_source_id, title: "Bericht zur Infrastruktur", summary: TEXT,
    published_at: date(1), canonical_url: `https://${p.legacy_source_id}.example/artikel`
  }));
  return { catalog, expectedCatalog, profiles: [PROFILE], telemetrie, documents, now: NOW, sampleLimit: 3 };
}
const path = (r, id = "rp-parlament") => r.paths.find((p) => p.id === id);
const pkg = (r, key = "bund-basis") => r.packages.find((p) => p.key === key);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test("DB-Format wird mit passendem Sollvertrag und echten Belegen geprüft", () => {
  const r = audit(fixture());
  assert.equal(r.datengrundlage, "relationale_quellentabellen");
  assert.equal(r.status, "versorgung_belegt");
  assert.deepEqual(pkg(r).missingClasses, []);
  assert.deepEqual(pkg(r).unprovenClasses, []);
  assert.equal(path(r).verification.status, "gueltig");
  assert(r.limits.some((s) => s.includes("höchstens 3") && s.includes("keine Vollprüfung")));
});
test("Fehlender Livekatalog wird nicht durch Code-Seeds ersetzt", () => {
  const input = fixture(); input.catalog = null;
  const r = audit(input);
  assert.equal(r.status, "unbekannt"); assert.equal(r.summary, null);
  assert.equal(r.packages, undefined);
  assert(r.limits.some((s) => s.includes("installierte Quellenkatalog")));
});
test("Leerer DB-Katalog bleibt leer und zeigt fehlende Sollpakete", () => {
  const input = fixture(); input.catalog = { publishers: [], packages: [], retrievalPaths: [], packagePaths: [] };
  const r = audit(input);
  assert.equal(r.packages.length, 0);
  assert.deepEqual(r.missingExpectedPackages, ["bund-basis"]);
  assert(r.findings.some((f) => f.code === "bedarfszuordnung_fehlt" && f.level === "fehler"));
});
test("Passende Identität übernimmt Pfadrolle, Rechtevorbehalt und Prüfbeleg", () => {
  const input = fixture();
  Object.assign(input.expectedCatalog.retrievalPaths[0], { evidence_role: "data_source", rights_review_required: true, party_package_only: true });
  const r = audit(input);
  assert.equal(path(r).role, "data_source"); assert.equal(path(r).rightsReviewRequired, true);
  assert.equal(path(r).verification.status, "gueltig");
  assert(r.findings.some((f) => f.code === "zugriffsrechte_ungeklaert"));
  assert(r.findings.some((f) => f.code === "parteibindung_im_basispaket"));
});
for (const [field, value] of [["url", "https://anderer-abruf.example/feed"], ["method", "html"], ["parser", "anderer-parser"], ["legacy_source_id", "andere-quellenkennung"]]) {
  test(`Abweichende ${field} übernimmt keine fremden Prüf-/Rechtemetadaten`, () => {
    const input = fixture();
    Object.assign(input.expectedCatalog.retrievalPaths[0], { evidence_role: "data_source", rights_review_required: true, party_package_only: true });
    input.catalog.retrievalPaths[0][field] = value;
    const r = audit(input), p = path(r);
    assert.deepEqual(r.configurationDrift, ["rp-parlament"]);
    assert.equal(p.role, "official_primary"); // Nur tatsächliche Herausgeberrolle.
    assert.equal(p.rightsReviewRequired, false); // Kein fremder Rechtebeleg übernommen.
    assert.equal(p.verification.status, "unbekannt"); assert.deepEqual(p.coverageClasses, []);
    assert(pkg(r).missingClasses.includes("parlament_bund"));
    assert.notEqual(r.status, "versorgung_belegt");
  });
}
test("Quellenprüfung läuft nach 90 Tagen ab, nicht nach dem letzten HTTP-Erfolg", () => {
  const input = fixture(); input.expectedCatalog.retrievalPaths[0].source_verification.checkedAt = date(91);
  const r = audit(input);
  assert.equal(path(r).verification.status, "abgelaufen");
  assert(r.findings.some((f) => f.code === "quellenpruefung_abgelaufen"));
  assert(pkg(r).unprovenClasses.includes("parlament_bund"));
  input.expectedCatalog.retrievalPaths[0].source_verification.checkedAt = date(89);
  assert.equal(path(audit(input)).verification.status, "gueltig");
});
test("Explizite Prüfgültigkeit hat Vorrang vor der 90-Tage-Vorgabe", () => {
  const input = fixture(); input.expectedCatalog.retrievalPaths[0].source_verification = { checkedAt: date(91), reviewAfterDays: 180 };
  assert.equal(path(audit(input)).verification.status, "gueltig");
});
test("Fehlende institutionelle Klasse wird trotz beider Evidence-Rollen erkannt", () => {
  const input = fixture(); input.catalog.packagePaths = input.catalog.packagePaths.filter((p) => p.retrieval_path_id !== "rp-parlament");
  const r = audit(input);
  assert.deepEqual(pkg(r).missingRoles, []);
  assert(pkg(r).missingClasses.includes("parlament_bund"));
  assert.equal(r.status, "eingeschraenkt");
});
test("Pausiertes Parlament bleibt trotz gesunder Regierung und Medien unbestätigt", () => {
  const input = fixture(); input.catalog.retrievalPaths[0].status = "paused";
  const r = audit(input);
  assert.equal(path(r).state, "inaktiv"); assert.deepEqual(pkg(r).missingClasses, []);
  assert.deepEqual(pkg(r).unprovenClasses, ["parlament_bund"]);
  assert.deepEqual(pkg(r).unprovenRoles, []);
  assert.equal(r.status, "eingeschraenkt");
  assert(r.findings.some((f) => f.code === "pflichtklasse_unbestaetigt"));
});
test("Service übernimmt bestätigte Brandenburg-Ausnahmen aus dem zentralen Prüfer", () => {
  const p = PACKAGE_DEFINITIONS.find((p) => p.key === "die-linke-brandenburg");
  const r = audit({ catalog: { publishers: [], retrievalPaths: [], packagePaths: [], packages: [clone(p)] }, profiles: [], now: NOW });
  assert.deepEqual(pkg(r, p.key).requiredClasses, ["partei_pilot"]);
  const exceptions = r.belegteAusnahmen.find((p) => p.packageKey === "die-linke-brandenburg").exceptions;
  assert.deepEqual(exceptions.map((a) => a.klasse).sort(), ["fraktion_pilot", "person_pilot"]);
  assert(exceptions.every((a) => a.bestaetigt === true && a.beleg));
  assert.equal(r.summary.errors, 0);
});
test("Titelkopien und Bedienhinweise sind keine belastbaren Inhaltsbelege", () => {
  const input = fixture(); input.documents[0].summary = input.documents[0].title;
  let r = audit(input);
  assert.equal(path(r).documents.missingExcerpt, 1); assert.notEqual(r.status, "versorgung_belegt");
  input.documents[0].summary = "Bitte aktivieren Sie JavaScript und akzeptieren Sie die erforderlichen Cookies, um diesen vollständigen Artikel auf unserer Internetseite lesen zu können.";
  r = audit(input); assert.equal(path(r).documents.missingExcerpt, 1);
});
test("Google bleibt betriebliche Abhängigkeit bei kaputtem direkten Ersatz", () => {
  const input = fixture();
  for (const p of [...input.catalog.retrievalPaths, ...input.expectedCatalog.retrievalPaths].filter((p) => p.publisher_id === "pub-amt")) p.method = "googlenews_search";
  const dead = { ...input.catalog.retrievalPaths[0], id: "rp-ersatz", legacy_source_id: "ersatz", method: "rss", status: "broken" };
  input.catalog.retrievalPaths.push(dead);
  input.expectedCatalog.retrievalPaths.push({ ...dead, evidence_role: "official_primary", coverage_classes: ["parlament_bund"] });
  input.catalog.packagePaths.push({ package_id: "pkg-bund", retrieval_path_id: dead.id });
  const r = audit(input);
  assert.deepEqual(pkg(r).directMissingRoles, []);
  assert.deepEqual(pkg(r).effectiveGoogleRoles, ["official_primary"]);
  assert(r.findings.some((f) => f.code === "betrieb_nur_google"));
});
test("Automatische Zusammenfassung enthält keine Detailbefunde oder Profile", () => {
  const report = audit(fixture());
  report.findings.push({ code: "pflichtklasse_fehlt", profileId: "synthetic-private-id", message: "synthetic-private-text" });
  report.findings.push({ code: "pflichtklasse_fehlt", profileId: "synthetic-private-id" });
  const summary = summarizeBetriebsabdeckung(report);
  assert.deepEqual(summary.findingCodes, ["pflichtklasse_fehlt"]);
  assert.equal(summary.findings, undefined); assert.equal(summary.profiles, undefined);
  assert(!JSON.stringify(summary).includes("synthetic-private"));
});
console.log(`\n${passed}/${passed} Betriebsabdeckungs-Integrationsprüfungen bestanden.`);
