"use strict";
const assert = require("node:assert/strict");
const S = require("../lib/helmut/quellenarchitektur/seeds/fach-parteiquellen");
const P = require("../lib/helmut/quellenarchitektur/seeds/packages");
const R = require("../lib/helmut/quellenarchitektur/profile-packages");
const E = require("../lib/helmut/quellenarchitektur/seeds/entities");
const M = require("../lib/helmut/matching");
const { STAENDIGE_AUSSCHUESSE: committees } = require("../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse");
const { LANDESMODULE } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-deutschland");
const { BUNDESTAG_21 } = require("../lib/helmut/quellenarchitektur/seeds/parlamentszusammensetzung");

// Fachname und tatsächlich geprüfter amtlicher Direktweg stimmen für die gesamte
// externe Sollmenge überein; fehlende Statistik/Journalistik wird nicht erfunden.
for (const a of committees) {
  const p = S.FACHPAKETE.find((v) => v.ausschussKey === a.key);
  assert(p, a.key);
  assert.deepEqual(S.resolveFachpakete({ committees: [a.name] }), [p.key], a.name);
  const source = S.ZUSAETZLICHE_QUELLEN.find((v) => v.id === `bt-fach-${a.key}-rss`);
  assert.equal(source.verification.feedParsed, true);
  assert.equal(source.verification.httpStatus, 200);
  assert.equal(source.verification.latestPublishedAt, null, "RSS ohne Publikationsdatum bleibt undatiert");
  assert.deepEqual(P.packageKeysForSource(source), [p.key]);
  assert(p.required_evidence_roles.includes("journalistic"));
}
assert.equal(M.committeeMatchKey("Forschung"), "forschung");
assert.notEqual(M.committeeMatchKey("Bildung"), M.committeeMatchKey("Forschung"));
assert.deepEqual(M.derivePolicyFields({ausschuesse:["Ausschuss für Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung"]}), ["Forschung und Technologie"]);
assert(S.resolveFachpakete({focusTopics:["Denkmalpflege"]}).includes("fach-kultur-medien"));
assert(!S.resolveFachpakete({focusTopics:["Denkmalpflege", "Landschaftspflege"]}).includes("arbeit-und-soziales"));
assert(S.resolveFachpakete({focusTopics:["Pflegeversicherung"]}).includes("arbeit-und-soziales"));
for (const label of ["Finanzen", "Wirtschaft", "Digitales", "Recht"]) assert(S.resolveFachpakete({focusTopics:[label]}).length, label);
assert(!S.resolveFachpakete({focusTopics:["Menschenrechte"]}).includes("fach-recht-verbraucherschutz"));

// Reine Quellenzuordnung, keine Kundenprofile, keine Aktivierung: derselbe
// sachliche Auftrag unterscheidet sich ausschließlich im passenden Parteipaket.
const common = { committees:["Gesundheit"], politische_ebene:"bundestag" };
for (const party of S.PARTEIPAKETE) {
  const resolved = R.resolveProfilePackages({...common, party:party.party});
  assert.deepEqual(resolved.required, ["bund-basis"]);
  assert.deepEqual(resolved.optional.filter((key) => S.PARTEIPAKETE.some((p)=>p.key===key)), [party.key]);
  assert(resolved.optional.includes("fach-gesundheit"));
  const search = S.ZUSAETZLICHE_QUELLEN.find((s)=>s.id===`partei-${party.party}-originalsuche`);
  assert.deepEqual(P.packageKeysForSource(search), [party.key]);
  assert.equal(search.evidenceRole,"direct_interest");
  assert.equal(search.priority,80);
  assert.equal(search.partyPackageOnly,true);
}
for (const value of ["fraktionslos","parteilos"]) {
  assert.deepEqual(S.resolveParteipakete({partei:value}), []);
  assert.deepEqual(R.resolveProfilePackages({...common,partei:value}).optionalMissing, []);
}
assert.deepEqual(S.resolveParteipakete({partei:"SPD",fraktion:"fraktionslos"}), ["partei-spd-bund"]);
assert.deepEqual(S.resolveParteipakete({partei:"parteilos",fraktion:"SPD"}), []);
assert.deepEqual(S.resolveParteipakete({partei:"CSU",fraktion:"CDU/CSU"}), ["partei-csu-bund"]);
assert.deepEqual(S.resolveParteipakete({fraktion:"CDU/CSU"}), ["partei-cdu-bund","partei-csu-bund"]);
assert.deepEqual(S.resolveParteipakete({fraktion:"Fraktion Bündnis 90/Die Grünen"}), ["partei-gruene-bund"]);
assert.deepEqual(R.resolveProfilePackages({partei:"Volt"}).optionalMissing, ["partei:volt"]);
assert.deepEqual(R.resolveProfilePackages({partei:"Bündnis Deutschland"}).diagnostics.unresolvedPartyLabels, ["Bündnis Deutschland"]);
// Die Bundespartei FREIE WÄHLER wird auch für Landtagsmandate beobachtet.
// Ähnlich benannte kommunale Gruppen und die mehrdeutige Kurzform FW bleiben getrennt.
const fwKey = "partei-freie-waehler-bund";
for (const alias of ["FREIE WÄHLER", "Freie Wähler", "Freie Waehler", "freie-waehler", "FREIE WÄHLER Bundesvereinigung", "Bundesvereinigung FREIE WÄHLER"]) {
  const resolved = R.resolveProfilePackages({ politische_ebene: "landtag", bundesland: "Bayern", partei: alias, ausschuesse: ["Gesundheit"] });
  assert(resolved.required.includes("bayern-basis"));
  assert(resolved.optional.includes("fach-gesundheit"));
  assert.deepEqual(resolved.optional.filter((key) => S.PARTEIPAKETE.some((p) => p.key === key)), [fwKey]);
  assert.deepEqual(resolved.optionalMissing, []);
}
for (const alias of ["FW", "Freie Wählergemeinschaft", "Freie Wählergemeinschaft Musterstadt", "Bürger für Musterstadt"]) {
  assert.deepEqual(S.resolveParteipakete({ party: alias }), [], `Keine erfundene Parteimitgliedschaft: ${alias}`);
}
assert.deepEqual(S.resolveParteipakete({ party: "parteilos", faction: "FREIE WÄHLER" }), []);
assert.deepEqual(S.resolveParteipakete({ faction: "Fraktion FREIE WÄHLER" }), [fwKey]);
const fwPackage = P.PACKAGE_DEFINITIONS.find((p) => p.key === fwKey);
assert.equal(fwPackage.status, "prepared");
assert.equal(fwPackage.is_base, false);
assert.deepEqual(fwPackage.required_evidence_roles, ["direct_interest"]);
const fwSource = S.ZUSAETZLICHE_QUELLEN.find((s) => s.id === "partei-freie-waehler-originalsuche");
assert.equal(new URL(fwSource.url).searchParams.get("q"), "site:freiewaehler.eu");
assert.equal(fwSource.verification.feedParsed, false);
assert.equal(fwSource.verification.status, "search_fallback_unverified");
assert.equal(fwSource.verification.issuerVerification.url, "https://www.freiewaehler.eu/impressum/");
assert.equal(fwSource.verification.issuerVerification.httpStatus, 200);
assert(!E.FRACTIONS.some((f) => f.id.includes("freie-waehler")), "Keine erfundene Bundestagsfraktion");
for (const party of E.PARTIES) {
  for (const alias of party.aliases) {
    assert.deepEqual(S.resolveParteipakete({ party: alias }), S.resolveParteipakete({ party: party.name }), `Parteialias ${alias}`);
    assert.deepEqual(R.resolveProfilePackages({ party: alias }).optionalMissing, [], `Bekannte Partei ${alias}`);
  }
}

for (const land of LANDESMODULE) {
  for (const bundesland of [land.bundesland,land.code]) {
    const r = R.resolveProfilePackages({politische_ebene:"landtag",bundesland});
    assert(r.required.includes(land.key), bundesland);
    assert.deepEqual(r.requiredMissing, []);
  }
}
assert(R.resolveProfilePackages({politische_ebene:"landtag",bundesland:"Berlin",party:"Die Linke"}).all.includes("die-linke-berlin"),"Bestandsversorgung erhalten");
assert.equal(E.FRACTIONS.length,5);
assert(!E.FRACTIONS.some((f)=>/fdp|bsw|ssw/.test(f.id)));
assert(E.FRACTIONS.find((f)=>f.id==='group-bt-linke').name.includes("Fraktion") || E.FRACTIONS.find((f)=>f.id==='group-bt-linke').name.includes("fraktion"));
assert.deepEqual(E.COMMITTEES.map((c)=>c.name).sort(), committees.map((c)=>c.name).sort());
assert.equal(Object.values(BUNDESTAG_21.aktuellerStand.fraktionen).reduce((a,b)=>a+b,0)+BUNDESTAG_21.aktuellerStand.fraktionslos,630);
for (const source of S.ZUSAETZLICHE_QUELLEN) {
  assert.equal(source.active,false);
  assert.equal(source.preparedOnly,true);
  assert.notEqual(source.health,"healthy");
  assert.equal(source.usagePolicy.commercialUseApproved, ["fach-destatis-aktuell-rss", "fach-irights-rss"].includes(source.id));
  assert.equal(source.usagePolicy.fullTextAllowed,false);
  assert(source.packageKeys.every((key)=>P.PACKAGE_DEFINITIONS.some((p)=>p.key===key)));
}
assert.equal(S.ZUSAETZLICHE_QUELLEN.find((s)=>s.id==='partei-csu-direkt-rss').verification.freshnessStatus,'older_than_30_days');

// Neuer Direktweg nur vorbereitet: derselbe Destatis-Herausgeber wie beim
// unveraenderten Soziales-Suchweg; belegtes Wirtschafts- und Digitalangebot.
const C = require("../lib/helmut/quellenarchitektur/catalog"), model = require("../lib/helmut/quellenarchitektur/model");
const { v1Sources } = require("../lib/helmut/sources");
const destatis = S.ZUSAETZLICHE_QUELLEN.find((s) => s.id === "fach-destatis-aktuell-rss");
assert(destatis);
assert.equal(destatis.url, "https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml");
assert.equal(model.canonicalDomain(destatis.url), "destatis.de");
assert.equal(model.canonicalDomain(destatis.url.replace("www.", "")), "destatis.de");
assert.deepEqual(destatis.packageKeys, ["fach-wirtschaft-energie", "fach-digitales-staatsmodernisierung"]);
assert.deepEqual(destatis.fachgebietKeys, ["wirtschaft-energie", "digitales-staatsmodernisierung"]);
assert.equal(destatis.evidenceRole, "data_source");
assert.deepEqual(destatis.coverageClasses, ["amtliche_daten"]);
assert.equal(destatis.active, false);
assert.equal(destatis.preparedOnly, true);
assert.equal(destatis.rightsReviewRequired, false);
assert.equal(destatis.usagePolicy.status, "text_excerpts_only");
assert.equal(destatis.usagePolicy.commercialUseApproved, true);
assert.equal(destatis.usagePolicy.fullTextAllowed, false);
assert(destatis.usagePolicy.note.includes("Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellennachweis"));
assert(destatis.usagePolicy.note.includes("Einzelangaben"));
assert(destatis.usagePolicy.note.includes("Bilder haben gesonderte Rechte"));
assert.deepEqual(destatis.usagePolicy.evidenceUrls, ["https://www.destatis.de/DE/Service/Impressum/_inhalt.html"]);
assert.equal(destatis.verification.feedParsed, true);
assert.equal(destatis.verification.httpStatus, 200);
assert.equal(destatis.verification.itemCount, 10);
assert.equal(destatis.verification.latestPublishedAt, "2026-11-13T08:00:00+01:00");
assert.equal(destatis.verification.status, "technically_verified_text_excerpts");
const soziales = v1Sources.find((s) => s.id === "news-destatis-soziales");
assert(soziales);
const beforeDestatis = C.buildCatalog({ sources: [soziales] });
for (const sources of [[soziales, destatis], [destatis, soziales]]) {
  const mapped = C.buildCatalog({ sources });
  assert.equal(mapped.publishers.filter((p) => p.canonical_domain === "destatis.de").length, 1);
  const publisher = mapped.publishers.find((p) => p.canonical_domain === "destatis.de");
  assert.equal(publisher.id, "publisher-destatis.de");
  assert.equal(publisher.publisher_type, "statistical_office");
  assert.equal(publisher.evidence_role, "data_source");
  assert.equal(publisher.entity_id, "statoffice-destatis");
  const path = mapped.retrievalPaths.find((p) => p.id === "rp-fach-destatis-aktuell-rss");
  assert.equal(path.publisher_id, publisher.id);
  assert.equal(path.method, "rss"); assert.equal(path.parser, "rss-regex");
  assert.equal(path.status, "paused"); assert.equal(path.activation_mode, "manual");
  assert.equal(path.prepared_only, true); assert.equal(path.rights_review_required, false);
  assert.equal(path.evidence_role, "data_source"); assert.deepEqual(path.coverage_classes, ["amtliche_daten"]);
  assert.equal(model.isPathActive(path, ["pkg-fach-wirtschaft-energie"]), false);
  assert.deepEqual(mapped.packagePaths.filter((p) => p.retrieval_path_id === path.id),
    [{ package_id: "pkg-fach-wirtschaft-energie", retrieval_path_id: path.id },
      { package_id: "pkg-fach-digitales-staatsmodernisierung", retrieval_path_id: path.id }]);
  assert.equal(mapped.packages.find((p) => p.key === "fach-wirtschaft-energie").status, "prepared");
  assert.deepEqual(mapped.retrievalPaths.find((p) => p.legacy_source_id === soziales.id), beforeDestatis.retrievalPaths.find((p) => p.legacy_source_id === soziales.id));
}
for (const [id, role] of [["swp", "data_source"], ["dji", "data_source"], ["rki", "data_source"],
  ["dlf-wirtschaft", "journalistic"], ["dlf-wissen", "journalistic"], ["g-ba", "official_primary"], ["uba", "official_primary"]])
  assert.equal(S.ZUSAETZLICHE_QUELLEN.find((s) => s.id === `fach-${id}-rss`).evidenceRole, role);
// Positiv belegte CC-BY-Textlizenz, aber weiterhin nur ein inaktiver Direktweg.
// Kein pauschales KI-Verbot und keine erfundene taegliche Frequenz.
const irights = S.ZUSAETZLICHE_QUELLEN.find((s) => s.id === "fach-irights-rss");
assert(irights);
assert.equal(irights.name, "iRights.info");
assert.equal(irights.url, "https://irights.info/feed");
assert.equal(irights.type, "media");
assert.deepEqual(irights.packageKeys, ["fach-digitales-staatsmodernisierung"]);
assert.deepEqual(irights.fachgebietKeys, ["digitales-staatsmodernisierung"]);
assert.equal(irights.evidenceRole, "journalistic");
assert.deepEqual(irights.coverageClasses, ["fachmedien"]);
assert.equal(irights.active, false);
assert.equal(irights.preparedOnly, true);
assert.equal(irights.rightsReviewRequired, false);
assert.equal(irights.usagePolicy.status, "text_excerpts_only");
assert.equal(irights.usagePolicy.commercialUseApproved, true);
assert.equal(irights.usagePolicy.fullTextAllowed, false);
assert(irights.usagePolicy.note.includes("CC BY 4.0 erlaubt Weitergabe und Bearbeitung auch kommerziell"));
for (const attribution of ["Jens Crueger", "KI und Offenheit vereinen: Open Source LLMs im Bildungsbereich", "OERinfo", "Lizenzlink", "Kennzeichnung von Änderungen", "Bilder werden nicht mitfreigegeben"])
  assert(irights.usagePolicy.note.includes(attribution), attribution);
assert.deepEqual(irights.usagePolicy.evidenceUrls, [
  "https://irights.info/",
  "https://irights.info/artikel/ki-und-offenheit-vereinen-open-source-llms-im-bildungsbereich/32946",
  "https://creativecommons.org/licenses/by/4.0/deed.de"
]);
assert.equal(irights.verification.feedParsed, true);
assert.equal(irights.verification.httpStatus, 200);
assert.equal(irights.verification.itemCount, 20);
assert.equal(irights.verification.latestPublishedAt, "2026-11-11T12:07:37Z");
assert.equal(irights.verification.freshnessStatus, "dated_items_observed");
const beforeIrights = C.buildCatalog({ sources: [] });
const digitalCatalog = C.buildCatalog({ sources: [irights] });
assert.equal(digitalCatalog.publishers.length, beforeIrights.publishers.length + 1);
const irightsPublisher = digitalCatalog.publishers.find((p) => p.canonical_domain === "irights.info");
assert.equal(irightsPublisher.id, "publisher-irights.info");
assert.equal(irightsPublisher.name, "iRights.info");
assert.equal(irightsPublisher.canonical_domain, "irights.info");
assert.equal(irightsPublisher.publisher_type, "media");
assert.equal(irightsPublisher.evidence_role, "journalistic");
const irightsPath = digitalCatalog.retrievalPaths.find((p) => p.id === "rp-fach-irights-rss");
assert.equal(digitalCatalog.retrievalPaths.length, beforeIrights.retrievalPaths.length + 1);
assert.equal(irightsPath.id, "rp-fach-irights-rss");
assert.equal(irightsPath.publisher_id, irightsPublisher.id);
assert.equal(irightsPath.url, "https://irights.info/feed");
assert.equal(irightsPath.method, "rss");
assert.equal(irightsPath.parser, "rss-regex");
assert.equal(irightsPath.status, "paused");
assert.equal(irightsPath.activation_mode, "manual");
assert.equal(irightsPath.expected_frequency, null);
assert.equal(irightsPath.prepared_only, true);
assert.equal(irightsPath.rights_review_required, false);
assert.equal(irightsPath.evidence_role, "journalistic");
assert.deepEqual(irightsPath.coverage_classes, ["fachmedien"]);
assert.deepEqual(irightsPath.usage_policy, irights.usagePolicy);
assert.equal(model.isPathActive(irightsPath, ["pkg-fach-digitales-staatsmodernisierung"]), false);
assert.deepEqual(digitalCatalog.packagePaths.filter((p) => p.retrieval_path_id === irightsPath.id),
  [{ package_id: "pkg-fach-digitales-staatsmodernisierung", retrieval_path_id: irightsPath.id }]);
assert.deepEqual(digitalCatalog.publishers.filter((p) => p.id !== irightsPublisher.id), beforeIrights.publishers);
assert.deepEqual(digitalCatalog.retrievalPaths.filter((p) => p.id !== irightsPath.id), beforeIrights.retrievalPaths);
assert.deepEqual(digitalCatalog.packagePaths.filter((p) => p.retrieval_path_id !== irightsPath.id), beforeIrights.packagePaths);
assert.equal(digitalCatalog.packages.find((p) => p.key === "fach-digitales-staatsmodernisierung").status, "prepared");
assert.deepEqual(S.ZUSAETZLICHE_QUELLEN.filter((s) => s.packageKeys.includes("fach-digitales-staatsmodernisierung")
  && s.evidenceRole === "data_source").map((s) => s.id), [destatis.id],
  "Nur die durch echte Digitalstatistik begruendete Datenbindung vorbereiten");


// Fremde URLs/IDs und fehlende Lizenzbelege erben keine Nutzungsentscheidung.
const observations = require("../lib/helmut/quellenarchitektur/seeds/fachfeeds-verifiziert.json");
for (const id of ["destatis-aktuell", "irights"]) {
  const v = observations.find(row => row.id === id), policy = S.textauszugPolicy(v);
  assert.equal(policy.fullTextAllowed, false); assert.equal(policy.imagesAllowed, false);
  assert.equal(policy.aiTrainingAllowed, false); assert.equal(policy.attributionRequired, true);
  assert.equal(S.textauszugPolicy({ ...v, rssUrl: v.rssUrl + "?fremd=1" }), null);
  assert.equal(S.textauszugPolicy({ ...v, id: "gleichnamige-fremde-quelle" }), null);
  assert.equal(S.textauszugPolicy({ ...v, usageDocumentation: [] }), null);
}
assert.deepEqual(S.ZUSAETZLICHE_QUELLEN.filter(s => !s.rightsReviewRequired).map(s => s.id).sort(),
  ["fach-destatis-aktuell-rss", "fach-irights-rss"], "Nur zwei exakt begrenzte Textquellen");


// Zulassungsentscheidung ist getrennt von der relationalen Aktivierung.
const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const feedCatalog = C.buildCatalog({ sources: [destatis, irights] });
const params = { ...feedCatalog, legacySources: [destatis, irights],
  profiles: [{ id: "synthetischer-quellenbedarf", fullName: "Synthetische Quellenperson", party: "SPD", profileActive: true, politische_ebene: "bundestag", focusTopics: ["Wirtschaftspolitik", "Digitalpolitik"] }], env: {} };
assert.equal(SM.buildRelationalCrawlPlan(params).aktiv.length, 0);
const live = { ...params, packages: params.packages.map(p =>
  ["pkg-fach-wirtschaft-energie", "pkg-fach-digitales-staatsmodernisierung"].includes(p.id) ? { ...p, status: "active" } : p),
  retrievalPaths: params.retrievalPaths.map(p => p.legacy_source_id === destatis.id || p.legacy_source_id === irights.id
    ? { ...p, status: "needs_review", activation_mode: "auto" } : p) };
const activeFeeds = SM.buildRelationalCrawlPlan(live).aktiv;
assert.deepEqual(activeFeeds.map(p => p.source.id).sort(), [destatis.id, irights.id].sort());
assert(activeFeeds.every(p => p.source.active === true));
assert.equal(destatis.active, false); assert.equal(irights.active, false);

// Destatis bleibt RSS-Text: Datum/Original/Quellennachweis erhalten, fremde
// Einzelbedingungen -> Titel/Link, keine Bilder und keine Volltextnachladung.
const CR = require("../lib/helmut/crawler"), DD = require("../lib/helmut/dedup"), EX = require("../lib/helmut/quellen-auszug");
const feedItem = { title: "Synthetische Daten zur Entwicklung der Energiepreise",
  url: "https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/11/PD26_999_000.html",
  publishedAt: "2026-11-13T07:00:00Z",
  content: "Der synthetische Bericht weist fuer die untersuchte Branche einen geringeren Preisanstieg als im vorherigen Monat aus. Die amtlichen Angaben beruhen auf einer monatlichen Erhebung.",
  imageUrl: "https://www.destatis.de/fremdes-bild.jpg" };
const good = CR.normalizeRawItem(feedItem, destatis);
assert.equal(good.content, feedItem.content); assert.equal(good.imageUrl, null);
assert.equal(good.url, feedItem.url); assert.equal(good.sourceName, destatis.name);
assert.equal(good.publishedAt, "2026-11-13T07:00:00.000Z");
const row = DD.toRawDocumentRow(good);
assert.equal(EX.hatOriginalinhalt(row), true); assert.equal(EX.brauchtInhalt(row), false);
const emptyText = { ...row, summary: null };
assert.equal(EX.brauchtInhalt(emptyText), false);
assert.equal(EX.fromHtml(emptyText, { finalUrl: feedItem.url, body: "<main>Fremder Volltext</main>" }).ok, false);
assert.equal(EX.fromMirror(emptyText, [good]).ok, false);
for (const patch of [{ rssRights: ["Nur fuer private Nutzung"] }, { rssRights: ["CC BY-NC 4.0"] },
  { rssRights: "ungueltig" }, { content: feedItem.content + " Nur mit schriftlicher Genehmigung weiterverwenden." },
  { url: "https://www.destatis.de/DE/Service/Impressum/_inhalt.html" }, { publishedAt: null }])
  assert.equal(CR.normalizeRawItem({ ...feedItem, ...patch }, destatis).content, feedItem.title);
assert.equal(CR.normalizeRawItem({ ...feedItem, rssRights: ["© Statistisches Bundesamt (Destatis), 2026"] }, destatis).content, feedItem.content);
assert.equal(CR.normalizeRawItem(feedItem, { ...destatis, url: destatis.url + "?fremd" }), null);
const restrictedXml = `<rss><channel><item><title>${feedItem.title}</title><link>${feedItem.url}</link><pubDate>${feedItem.publishedAt}</pubDate><description>${feedItem.content}</description><dc:rights>Nur fuer private Nutzung</dc:rights></item></channel></rss>`;
const restricted = CR.parseRssItems(restrictedXml)[0];
assert.deepEqual(restricted.rssRights, ["Nur fuer private Nutzung"]);
assert.equal(CR.normalizeRawItem(restricted, destatis).content, feedItem.title);

for (const [state, key] of [["Bayern", "bayern"], ["Nordrhein-Westfalen", "nordrhein-westfalen"]]) {
  const r = R.resolveProfilePackages({ parliamentType: "Bundestag", state });
  assert(r.optionalMissing.includes(`regionalpaket:${key}`), `Regionale Lücke ${state} darf nicht verschwinden`);
  assert(!r.required.includes(`${key}-basis`), "Landesmandatsgate nicht durch Regionalbedarf umgehen");
}
assert(R.resolveProfilePackages({ parliamentType: "Bundestag", state: "NI" }).optional.includes("regional-niedersachsen"));
console.log("PASS Fach-/Parteiversorgung: aktuelle24Ausschüsse, symmetrische10Parteizuordnungen,16Länder, Fraktionslosigkeit, inaktive Destatis-/iRights-Wege, Textlizenz-/Attributionsbeleg, Rechte-/Aktivierungsschranken");
