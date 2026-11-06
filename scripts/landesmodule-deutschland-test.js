"use strict";

// Offline: gleiche Länderanforderungen, mandatsgebundene Gates und echte Parserausschnitte.
// Keine Aktivierung, kein Netz, keine Datenbank-/Modellaufrufe.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { LANDESMODULE, LANDESQUELLEN, landesmodulByKey } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-deutschland");
const { LANDESQUELLEN_PRUEFBELEGE } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-pruefbelege");
const { GEOGRAPHIES } = require("../lib/helmut/quellenarchitektur/seeds/geographies");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { PACKAGE_DEFINITIONS, packageKeysForSource } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const { parseRssItems, normalizeRawItem } = require("../lib/helmut/crawler");
const { parsePardokDocumentsFromString } = require("../lib/helmut/quellenarchitektur/pardok-parser");

assert.equal(LANDESMODULE.length, 16);
assert.equal(new Set(LANDESMODULE.map((land) => land.key)).size, 16);
assert.equal(SM.LANDESMODUL_LAENDER.length, 16);
const catalog = require("../lib/helmut/quellenarchitektur/catalog").buildCatalog({ sources: LANDESQUELLEN });
const safety = require("../lib/helmut/sourceSafety");
for (const source of LANDESQUELLEN) {
  const path = catalog.retrievalPaths.find((p) => p.legacy_source_id === source.id);
  const publisher = catalog.publishers.find((p) => p.id === path.publisher_id);
  assert.equal(publisher.publisher_type, source.type, `${source.id}: amtliche Herausgeberart erhalten`);
  assert.equal(publisher.evidence_role, "official_primary", `${source.id}: Regierungsquelle nicht als Journalismus ausgeben`);
  assert.equal(safety.categorizeSource(source), "offiziell");
}
assert.equal(landesmodulByKey("Thüringen").code, "TH");
assert.equal(landesmodulByKey("unbekannt"), null);
assert.equal(SM.freigegebeneLandesmodule({ HELMUT_LANDESMODULE: "*,alle,unbekannt" }).size, 0);

const profile = (land, overrides = {}) => ({
  id: "landes-test-" + land.code, name: "Testprofil " + land.bundesland,
  fullName: "Testprofil " + land.bundesland, politische_ebene: "landtag",
  bundesland: land.bundesland, wahlkreis: "Testwahlkreis", ausschuesse: ["Innenausschuss"],
  partei: "SPD", aktiv: true, profileActive: true, ...overrides
});
const packages = PACKAGE_DEFINITIONS.map((pkg) => ({ ...pkg, status: "active" }));
const paths = LANDESMODULE.map((land) => ({
  id: "rp-" + land.source_prefix + "-gate-test", legacy_source_id: land.source_prefix + "-gate-test",
  method: "rss", url: "https://example.invalid/" + land.code, status: "healthy", activation_mode: "auto"
}));
const packagePaths = LANDESMODULE.map((land, i) => ({ package_id: "pkg-" + land.key, retrieval_path_id: paths[i].id }));
const flags = { HELMUT_LANDESMODULE: LANDESMODULE.map((land) => land.slug).join(",") };
for (const [index, land] of LANDESMODULE.entries()) {
  assert.deepEqual(land.required_classes, LANDESMODULE[0].required_classes, land.code + ": gleiche Pflichtklassen");
  assert.ok(GEOGRAPHIES.some((geo) => geo.id === land.geography_id));
  assert.equal(land.coverage.length, land.required_classes.length + land.demand_classes.length);
  assert.ok(land.coverage.every((entry) => ["prepared_with_parser_receipt", "candidate_only", "unbesetzt"].includes(entry.state)));
  assert.deepEqual(SM.landesmoduleOf(paths[index], []), [land.slug], "Gate muss ohne Paketzuordnung gelten");
  assert.deepEqual(SM.landesmoduleOf({ id: paths[index].legacy_source_id }, []), [land.slug]);
  const options = { retrievalPaths: paths, packages, packagePaths, env: flags };
  const plan = SM.buildRelationalCrawlPlan({ ...options, profiles: [profile(land)] });
  assert.deepEqual(plan.aktiv.map((entry) => entry.id), [paths[index].id], land.code + ": nur eigenes Landesmandat");
  for (const invalid of [{ politische_ebene: "bundestag" }, { aktiv: false, profileActive: false }]) {
    assert.equal(SM.buildRelationalCrawlPlan({ ...options, profiles: [profile(land, invalid)] }).aktiv.length, 0);
  }
  const orphanAlwaysOn = SM.buildRelationalCrawlPlan({
    retrievalPaths: [{ ...paths[index], activation_mode: "always_on" }], packages, packagePaths: [], profiles: [], env: flags
  });
  assert.equal(orphanAlwaysOn.aktiv.length, 0, "Kein Bypass bei fehlenden Paketzeilen");
}

assert.ok(LANDESQUELLEN.length > 0);
assert.equal(new Set(LANDESQUELLEN.map((source) => source.id)).size, LANDESQUELLEN.length);
assert.equal(new Set(LANDESQUELLEN.map((source) => source.url)).size, LANDESQUELLEN.length);
for (const source of LANDESQUELLEN) {
  const land = landesmodulByKey(source.landModule);
  assert.equal(source.active, false);
  assert.equal(source.preparedOnly, true);
  assert.deepEqual(source.packageKeys, [land.key]);
  assert.deepEqual(packageKeysForSource(source), [land.key]);
  assert.deepEqual(SM.landesmoduleOf({ id: "rp-" + source.id }, []), [land.slug]);
  assert.equal(source.sourceVerification.url, source.url);
  assert.equal(source.sourceVerification.activationApproved, false);
  assert.match(source.sourceVerification.bodySha256, /^[0-9a-f]{64}$/);
  if (source.sourceVerification.status === "parsed_missing_date") {
    assert.equal(source.sourceVerification.sampleDatedItems, 0);
    assert.equal(source.sourceVerification.dateVerified, false);
    assert.equal(source.dateSemantics, "unavailable");
    assert.ok(source.limitations.includes("KEIN Artikeldatum"));
  } else assert.ok(source.sourceVerification.sampleDatedItems > 0);
  assert.equal(source.publicationCadence.status, "unknown", "Keine erfundene tägliche Publikation");
  assert.ok(source.covers.every((klass) => land.required_classes.includes(klass)));
}
assert.ok(LANDESQUELLEN_PRUEFBELEGE.some((receipt) => receipt.result === "empty_or_incompatible"));
assert.ok(LANDESQUELLEN_PRUEFBELEGE.some((receipt) => receipt.result === "fetch_failed"));
assert.ok(!LANDESQUELLEN.some((source) => source.id === "be-landtag-regierung"), "Leerer Feed bleibt Lücke");

const seed = buildLandesmodulSeed();
const oldBerlin = seed.retrievalPaths.find((entry) => entry.legacy_source_id === "be-plenum");
assert.ok(oldBerlin.url.endsWith("pardok-wp19.xml"));
assert.equal(oldBerlin.wahlperiode, 19);
assert.equal(oldBerlin.historical, true);
assert.ok(LANDESQUELLEN.some((source) => source.id === oldBerlin.current_source_id && source.wahlperiode === 20));
const bbParty = seed.packagePaths.filter((link) => link.retrieval_path_id === "rp-bb-partei_pilot");
assert.deepEqual(bbParty.map((link) => link.package_id), ["pkg-die-linke-brandenburg"]);
assert.ok(seed.publishers.some((publisher) => publisher.name === "Märkische Allgemeine (MAZ)"));
assert.ok(seed.publishers.some((publisher) => publisher.name === "Lausitzer Rundschau"));
assert.equal(new Set(seed.retrievalPaths.map((entry) => entry.id)).size, seed.retrievalPaths.length);
assert.deepEqual(seed.pathExpectedGeographies.filter((entry) => entry.retrieval_path_id === "rp-rbb24-politik").map((entry) => entry.geography_id).sort(), ["geo-land-berlin", "geo-land-brandenburg"]);

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures/landesmodule-20261106", name), "utf8");
const wp20 = LANDESQUELLEN.find((source) => source.wahlperiode === 20);
const documents = parsePardokDocumentsFromString(fixture("berlin-wp20.xml"), { land: "berlin", sourceUrl: wp20.url }).documents;
assert.equal(documents.length, 3);
assert.ok(documents.every((document) => document.wahlperiode === 20));
assert.ok(documents.every((document) => document.originaladresse.includes("/VT/20/")));
assert.ok(documents.some((document) => document.dokumentdatum === "2026-10-26"));
const items = parseRssItems(fixture("niedersachsen-ausschuss.xml"));
assert.equal(items.length, 1);
assert.ok(items[0].url.includes("/tagesordnungen_ausschuesse/"));
assert.ok(Number.isFinite(Date.parse(items[0].publishedAt)));
const hessen = fixture("hessen-regierung.xml");
assert.equal(parseRssItems(hessen)[0].publishedAt, "2026-11-06", "6. November wird nicht 11. Juni");
const hessenSource = LANDESQUELLEN.find((source) => source.url === "https://hessen.de/Presse-Feed/all");
assert.equal(normalizeRawItem(parseRssItems(hessen)[0], hessenSource).publishedAt, "2026-11-06T00:00:00.000Z");
const datedHessen = (value) => parseRssItems(hessen.replace(/<pubDate>[^<]*<\/pubDate>/, `<pubDate>${value}</pubDate>`))[0].publishedAt;
assert.equal(datedHessen("31.02.2026"), null, "Ungültiger Monatstag wird nicht verschoben");
assert.equal(datedHessen("29.02.2026"), null, "Kein Schalttag im normalen Jahr");
assert.equal(datedHessen("29.02.2024"), "2024-02-29");
assert.equal(datedHessen("13.13.2026"), null);
assert.equal(datedHessen("Thu, 05 Nov 2026 14:23:25 +0100"), "Thu, 05 Nov 2026 14:23:25 +0100", "RFC-Datum unverändert");
const schleswigHolstein = parseRssItems(fixture("schleswig-holstein-regierung.xml"));
assert.equal(schleswigHolstein.length, 1);
assert.equal(schleswigHolstein[0].publishedAt, "", "Kein Datum aus Original-URL oder Abrufzeit erfunden");
console.log(`PASS Landesmodule Deutschland: 16 gleiche Kriterien und Mandatsgates, ${LANDESQUELLEN.length} vorbereitete Parserwege, WP20/NI/HE/SH-Fixtures, ehrliche Datumslücken.`);
