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
  assert.equal(source.usagePolicy.commercialUseApproved,false);
  assert.equal(source.usagePolicy.fullTextAllowed,false);
  assert(source.packageKeys.every((key)=>P.PACKAGE_DEFINITIONS.some((p)=>p.key===key)));
}
assert.equal(S.ZUSAETZLICHE_QUELLEN.find((s)=>s.id==='partei-csu-direkt-rss').verification.freshnessStatus,'older_than_30_days');
for (const [state, key] of [["Bayern", "bayern"], ["Nordrhein-Westfalen", "nordrhein-westfalen"]]) {
  const r = R.resolveProfilePackages({ parliamentType: "Bundestag", state });
  assert(r.optionalMissing.includes(`regionalpaket:${key}`), `Regionale Lücke ${state} darf nicht verschwinden`);
  assert(!r.required.includes(`${key}-basis`), "Landesmandatsgate nicht durch Regionalbedarf umgehen");
}
assert(R.resolveProfilePackages({ parliamentType: "Bundestag", state: "NI" }).optional.includes("regional-niedersachsen"));
console.log("PASS Fach-/Parteiversorgung: aktuelle24Ausschüsse, symmetrische10Parteizuordnungen,16Länder, Fraktionslosigkeit, Rechte-/Aktivierungsschranken");
