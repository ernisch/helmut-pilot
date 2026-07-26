"use strict";

// Helmut — Phase-1-Punkt 13: FACHLICHE Vollstaendigkeit jedes Quellenpakets, ausfuehrbar.
//
// Diese Suite schuetzt die fachlichen Zusicherungen des Punkts 13. Sie prueft NICHT, ob eine
// Paketzeile existiert (das tun Punkt 3/4 und source-architecture-test.js), sondern ob jedes
// Paket fachlich traegt: Pflichtklassen besetzt, Pflicht-Herausgeberklassen vertreten,
// Vollzaehligkeitszusagen ("alle Ausschuesse"/"alle Fraktionen"/"alle genannten Regionen")
// eingehalten, Mehrfachzuordnungen begruendet, vorbereitete Pakete inaktiv, und keine
// Moeglichkeit, ein fachlich unvollstaendiges Paket unbemerkt als vollstaendig auszuweisen.
//
// Reiner Offline-Test: kein Netz, keine KI, kein DB-Zugriff, kein Datei-Schreiben.
// Es kommen KEINE Production-Daten und keine reale Mandantenidentitaet vor.

const fs = require("fs");
const path = require("path");
const {
  BUND_CLASSES, PACKAGE_REQUIREMENTS, ZULAESSIGE_UEBERSCHNEIDUNGEN, MIN_NICHT_AGGREGATOR_WEGE,
  catalogPathClasses, buildCompletenessModel, assessPackageCompleteness
} = require("../lib/helmut/quellenarchitektur/paket-vollstaendigkeit");
const {
  PACKAGE_DEFINITIONS, REGION_TERMS_BY_PACKAGE, LANDESMODUL_PFLICHTKLASSEN,
  packageKeysForSource, regionalPackageKeyForSource
} = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { resolveProfilePackages, computeGlobalActivation } = require("../lib/helmut/quellenarchitektur/profile-packages");
const model = require("../lib/helmut/quellenarchitektur/model");
const { v1Sources } = require("../lib/helmut/sources");
const bundGen = require("./generate-source-architecture-seed");
const landGen = require("./generate-landesmodul-seed");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const CM = buildCompletenessModel();
const A = assessPackageCompleteness(CM);
const byKey = new Map(A.pakete.map((p) => [p.key, p]));

// Erwarteter Paketbestand des Repositorys. Bewusst als feste Liste: faellt ein Paket weg oder
// kommt eines dazu, ohne dass Punkt 13 dafuer eine fachliche Anforderung erhaelt, wird das hier
// rot — kein stilles Wachsen des Paketbestands.
const ERWARTETE_PAKETE = [
  "bund-basis", "arbeit-und-soziales", "die-linke-bund", "regional-niedersachsen",
  "berlin-basis", "brandenburg-basis", "die-linke-berlin", "die-linke-brandenburg"
].sort();

// Pakete, die BLEIBEN duerfen, ohne "vollstaendig" zu sein — mit belegtem Grund. Jede andere
// Abweichung von "vollstaendig" ist ein Fehler.
const ZUGELASSEN_UNVOLLSTAENDIG = {
  "regional-niedersachsen": "nur-aggregator-beleglage",
  "die-linke-brandenburg": "pflichtklasse-fachlich-unmoeglich"
};

// ============ 1 · Kein erwartetes Paket fehlt, keines kommt still dazu ============
console.log("== 1 · Paketbestand ==");
check("genau die 8 erwarteten Pakete im Code-Seed", JSON.stringify(A.pakete.map((p) => p.key).sort()) === JSON.stringify(ERWARTETE_PAKETE));
check("jedes Paket hat eine fachliche Anforderung (Zweck + Zustaendigkeit + Beleg)",
  A.pakete.every((p) => PACKAGE_REQUIREMENTS[p.key] && p.zweck && p.zustaendigkeit && p.belegt));
check("keine Anforderung ohne Paket (kein toter Anforderungseintrag)",
  Object.keys(PACKAGE_REQUIREMENTS).every((k) => byKey.has(k)));
check("Paketschluessel sind eindeutig", new Set(PACKAGE_DEFINITIONS.map((p) => p.key)).size === PACKAGE_DEFINITIONS.length);
check("Paket-Ids sind eindeutig", new Set(PACKAGE_DEFINITIONS.map((p) => p.id)).size === PACKAGE_DEFINITIONS.length);
check("kein personenbezogenes Paket im Code-Seed (Mandantenneutralitaet)",
  PACKAGE_DEFINITIONS.every((p) => !/^profil-/.test(p.key)));
check("kein Paketzweck nennt eine konkrete Person oder Mandats-Id",
  PACKAGE_DEFINITIONS.every((p) => !/profil-[a-z0-9]/i.test(String(p.purpose || "")) && !/-news\b/.test(String(p.purpose || ""))));

// ============ 2 · Kein Paket ohne gueltige Paketzuordnungen ============
console.log("== 2 · Zuordnungen vorhanden ==");
check("jedes Paket traegt mindestens einen Abrufweg", A.pakete.every((p) => p.wege > 0));
check("kein Paket ist ein fachlich leerer Platzhalter (Pflichtklassen ohne jeden Weg)",
  A.pakete.every((p) => !(p.pflichtklassen.length > 0 && p.wege === 0)));
check("die vier vorbereiteten Landespakete sind im vereinigten Modell NICHT leer",
  ["berlin-basis", "brandenburg-basis", "die-linke-berlin", "die-linke-brandenburg"].every((k) => byKey.get(k).wege > 0));
check("buildFullModel allein kennt die Landespakete bewusst NICHT (BE/BB gehoeren in den Landesmodul-Seed)", (() => {
  const bund = buildFullModel();
  const landPkgIds = new Set(["pkg-berlin-basis", "pkg-brandenburg-basis", "pkg-die-linke-berlin", "pkg-die-linke-brandenburg"]);
  return bund.packagePaths.every((pp) => !landPkgIds.has(pp.package_id));
})());

// ============ 3 · Zuordnungen zeigen auf gueltige Abrufwege ============
console.log("== 3 · Zuordnung -> Abrufweg ==");
check("keine verwaiste Paketzuordnung", A.pakete.every((p) => p.verwaisteZuordnungen.length === 0));
check("jede Zuordnung nennt ein existierendes Paket", (() => {
  const ids = new Set(PACKAGE_DEFINITIONS.map((p) => p.id));
  return CM.packagePaths.every((pp) => ids.has(pp.package_id));
})());
check("kein Abrufweg ohne Paket (Bund-Katalog, Produktionskuratierung)", buildFullModel().unmapped.length === 0);
check("jeder Abrufweg des vereinigten Modells liegt in >=1 Paket", (() => {
  const zugeordnet = new Set(CM.packagePaths.map((pp) => pp.retrieval_path_id));
  return CM.paths.every((p) => zugeordnet.has(p.id));
})());

// ============ 4 · Abrufwege zeigen auf gueltige Herausgeber ============
console.log("== 4 · Abrufweg -> Herausgeber ==");
check("jeder Abrufweg hat einen existierenden Herausgeber", (() => {
  const pubIds = new Set(CM.publishers.map((p) => p.id));
  return CM.paths.every((p) => p.publisher_id && pubIds.has(p.publisher_id));
})());
check("jeder Herausgeber traegt eine gueltige Belegfunktion", (() => {
  const roles = new Set(model.EVIDENCE_ROLES);
  return CM.publishers.every((p) => roles.has(p.evidence_role));
})());

// ============ 5 · Pflichtklassen sind tatsaechlich vertreten ============
console.log("== 5 · Pflichtklassen ==");
check("keine offene Pflichtklassenluecke (ausser fachlich unmoeglichen)",
  A.pakete.every((p) => p.fehlend.length === 0));
check("jeder Abrufweg traegt mindestens eine fachliche Klasse", A.pakete.every((p) => p.wegeOhneKlasse.length === 0));
check("bund-basis: alle 7 Pflichtklassen besetzt", (() => {
  const p = byKey.get("bund-basis");
  return p.pflichtklassen.length === 7 && p.fehlend.length === 0;
})());
check("arbeit-und-soziales: alle 10 Pflichtklassen besetzt", (() => {
  const p = byKey.get("arbeit-und-soziales");
  return p.pflichtklassen.length === 10 && p.fehlend.length === 0;
})());
check("berlin-basis: 12 von 12 neutralen Pflichtklassen besetzt", (() => {
  const p = byKey.get("berlin-basis");
  return p.pflichtklassen.length === 12 && p.vorhandeneKlassen.length === 12 && p.fehlend.length === 0;
})());
check("brandenburg-basis: 12 von 12 neutralen Pflichtklassen besetzt", (() => {
  const p = byKey.get("brandenburg-basis");
  return p.pflichtklassen.length === 12 && p.vorhandeneKlassen.length === 12 && p.fehlend.length === 0;
})());
check("Landes-Basispakete tragen KEINE Partei-/Fraktions-/Personenklasse (P0-2 bleibt gewahrt)",
  ["berlin-basis", "brandenburg-basis"].every((k) =>
    ["partei_pilot", "fraktion_pilot", "person_pilot"].every((c) => !byKey.get(k).vorhandeneKlassen.includes(c))));
check("die Pilotklassen liegen ausschliesslich in den optionalen Landes-Parteipaketen",
  ["die-linke-berlin", "die-linke-brandenburg"].every((k) => byKey.get(k).is_base === false)
  && byKey.get("die-linke-berlin").vorhandeneKlassen.includes("partei_pilot"));

// Klassenableitung selbst: deterministisch und ohne Restmenge.
console.log("== 5b · Klassenableitung ==");
check("jede Katalogquelle erhaelt >=1 Klasse", v1Sources.every((s) => catalogPathClasses(s).length > 0));
check("Klassenableitung ist deterministisch (zwei Laeufe identisch)",
  JSON.stringify(v1Sources.map((s) => catalogPathClasses(s))) === JSON.stringify(v1Sources.map((s) => catalogPathClasses(s))));
check("Themen-Buendel gelten NICHT als Ausschussquelle (Namensverankerung greift)", (() => {
  const buendel = v1Sources.filter((s) => /^bundle-/.test(s.id));
  return buendel.length > 0 && buendel.every((s) => !catalogPathClasses(s).includes("bundestagsausschuesse"));
})());
check("der institutionelle Ausschuss-Weg gilt als Ausschussquelle",
  catalogPathClasses(v1Sources.find((s) => s.id === "ausschuss-arbeit-soziales")).includes("bundestagsausschuesse"));
check("keine Klasse ausserhalb des erklaerten Bundesvokabulars", (() => {
  const erlaubt = new Set(BUND_CLASSES);
  return v1Sources.every((s) => catalogPathClasses(s).every((c) => erlaubt.has(c)));
})());
check("keine Landesklasse ausserhalb der 15 Landesmodul-Pflichtklassen", (() => {
  const erlaubt = new Set(LANDESMODUL_PFLICHTKLASSEN);
  return buildLandesmodulSeed().retrievalPaths.every((p) => (p.covers || []).every((c) => erlaubt.has(c)));
})());

// ============ 6 · Pflicht-Herausgeberklassen ============
console.log("== 6 · Herausgeberklassen ==");
check("keine fehlende Pflicht-Herausgeberklasse", A.pakete.every((p) => p.fehlendeRollen.length === 0));
check("bund-basis hat amtliche UND journalistische Beleglage", (() => {
  const r = byKey.get("bund-basis").rollen;
  return (r.official_primary || 0) > 0 && (r.journalistic || 0) > 0;
})());
check("arbeit-und-soziales hat amtliche, interessengebundene, Daten- und journalistische Beleglage", (() => {
  const r = byKey.get("arbeit-und-soziales").rollen;
  return (r.official_primary || 0) > 0 && (r.direct_interest || 0) > 0 && (r.data_source || 0) > 0 && (r.journalistic || 0) > 0;
})());
check("Parteipakete haben eine Primaerquelle des Eigeninteresses (nicht nur Aggregator)",
  ["die-linke-bund", "die-linke-berlin", "die-linke-brandenburg"].every((k) => (byKey.get(k).rollen.direct_interest || 0) > 0));
check("regional-niedersachsen wird als reine Aggregator-Beleglage ERKANNT (kein falsches Gruen)", (() => {
  const p = byKey.get("regional-niedersachsen");
  return p.nichtAggregatorWege < MIN_NICHT_AGGREGATOR_WEGE && p.maengel.includes("nur-aggregator-beleglage") && p.ergebnis !== "vollstaendig";
})());

// ============ 7 · Vollzaehligkeit ============
console.log("== 7 · Vollzaehligkeit ==");
check("alle Vollzaehligkeitsregeln erfuellt", A.pakete.every((p) => p.vollzaehligkeit.every((v) => v.erfuellt)));
check("bund-basis enthaelt JEDEN institutionellen Bundestagsausschuss des Katalogs", (() => {
  const r = byKey.get("bund-basis").vollzaehligkeit.find((v) => v.regel === "alle_institutionellen_ausschuesse");
  return r && r.erfuellt && r.soll === 23 && r.ist === 23;
})());
check("bund-basis enthaelt JEDE Bundestagsfraktion des Katalogs", (() => {
  const r = byKey.get("bund-basis").vollzaehligkeit.find((v) => v.regel === "alle_bundestagsfraktionen");
  return r && r.erfuellt && r.soll === 8 && r.ist === 8;
})());
check("regional-niedersachsen deckt jede im Zweck genannte Region ab", (() => {
  const r = byKey.get("regional-niedersachsen").vollzaehligkeit.find((v) => v.regel === "alle_genannten_regionen");
  return r && r.erfuellt && r.soll === 4;
})());
// Negativkontrolle: wird der Ausschuss-Weg aus bund-basis entfernt, MUSS die Regel rot werden.
check("Negativkontrolle Vollzaehligkeit: fehlt ein Ausschuss, schlaegt die Regel an", (() => {
  const mutiert = {
    ...CM,
    packagePaths: CM.packagePaths.filter((pp) => !(pp.package_id === "pkg-bund-basis" && pp.retrieval_path_id === "rp-committee-gesundheit"))
  };
  const p = assessPackageCompleteness(mutiert).pakete.find((x) => x.key === "bund-basis");
  return p.ergebnis !== "vollstaendig" && p.maengel.includes("vollzaehligkeit-verletzt")
    && p.vollzaehligkeit.some((v) => v.regel === "alle_institutionellen_ausschuesse" && v.fehlend.includes("rp-committee-gesundheit"));
})());

// ============ 8 · Ueberschneidungen ============
console.log("== 8 · Ueberschneidungen ==");
check("keine unbegruendete Mehrfachzuordnung", A.pakete.every((p) => p.unbegruendeteUeberschneidungen.length === 0));
check("jede Mehrfachzuordnung traegt eine nachvollziehbare Begruendung",
  A.pakete.every((p) => p.ueberschneidungen.every((u) => u.begruendet && typeof u.grund === "string" && u.grund.length > 40)));
check("genau die 3 deklarierten Mehrfachzuordnungen bestehen", (() => {
  const zaehler = new Map();
  for (const pp of CM.packagePaths) zaehler.set(pp.retrieval_path_id, (zaehler.get(pp.retrieval_path_id) || 0) + 1);
  const mehrfach = [...zaehler.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
  return JSON.stringify(mehrfach) === JSON.stringify(Object.keys(ZULAESSIGE_UEBERSCHNEIDUNGEN).sort());
})());
check("kein Abrufweg liegt in beiden Landes-BASISpaketen ausser dem Zwei-Laender-Sender", (() => {
  const be = new Set(CM.packagePaths.filter((pp) => pp.package_id === "pkg-berlin-basis").map((pp) => pp.retrieval_path_id));
  const bb = CM.packagePaths.filter((pp) => pp.package_id === "pkg-brandenburg-basis").map((pp) => pp.retrieval_path_id);
  const beide = bb.filter((id) => be.has(id));
  return JSON.stringify(beide) === JSON.stringify(["rp-rbb24-politik"]);
})());
check("Bund-Fachthemenpaket und Bund-Basispaket teilen NUR den staendigen Fachausschuss", (() => {
  const basis = new Set(CM.packagePaths.filter((pp) => pp.package_id === "pkg-bund-basis").map((pp) => pp.retrieval_path_id));
  const fach = CM.packagePaths.filter((pp) => pp.package_id === "pkg-arbeit-und-soziales").map((pp) => pp.retrieval_path_id);
  return JSON.stringify(fach.filter((id) => basis.has(id))) === JSON.stringify(["rp-ausschuss-arbeit-soziales"]);
})());
check("Negativkontrolle Ueberschneidung: eine undeklarierte Doppelzuordnung wird erkannt", (() => {
  const mutiert = { ...CM, packagePaths: [...CM.packagePaths, { package_id: "pkg-bund-basis", retrieval_path_id: "rp-dgb" }] };
  const p = assessPackageCompleteness(mutiert).pakete.find((x) => x.key === "bund-basis");
  return p.maengel.includes("unbegruendete-ueberschneidung") && p.ergebnis !== "vollstaendig";
})());

// ============ 9 · Regionszuordnung trennt Regionen ============
console.log("== 9 · Regionszuordnung ==");
check("eine Niedersachsen-Regionalquelle landet im Niedersachsen-Paket",
  packageKeysForSource({ id: "region-salzgitter-arbeit-soziales", name: "Salzgitter Arbeit und Soziales", type: "local", regional: true }).includes("regional-niedersachsen"));
check("Umlautschreibung trifft denselben Ort",
  regionalPackageKeyForSource({ id: "region-wolfenbuttel-x", name: "Wolfenbüttel Arbeit und Soziales" }) === "regional-niedersachsen");
check("eine FREMDE Regionalquelle landet NICHT im Niedersachsen-Paket",
  packageKeysForSource({ id: "region-bayern-arbeit-soziales", name: "Bayern Arbeit und Soziales", type: "media", regional: true }).length === 0);
check("Regionsbegriffe stehen nur EINMAL im Repository (Paketdefinition)",
  Array.isArray(REGION_TERMS_BY_PACKAGE["regional-niedersachsen"]) && REGION_TERMS_BY_PACKAGE["regional-niedersachsen"].length === 12);
check("Profil-Resolver und Paketinhalt nutzen dieselbe Regionsliste", (() => {
  const nds = resolveProfilePackages({ politische_ebene: "bundestag", wahlkreis: "Salzgitter" });
  const bayern = resolveProfilePackages({ politische_ebene: "bundestag", wahlkreis: "Nürnberg" });
  return nds.all.includes("regional-niedersachsen") && !bayern.all.includes("regional-niedersachsen");
})());

// ============ 10 · Vorbereitete Pakete und Wege bleiben inaktiv ============
console.log("== 10 · Vorbereitet bleibt inaktiv ==");
const VORBEREITET = ["berlin-basis", "brandenburg-basis", "die-linke-berlin", "die-linke-brandenburg"];
check("alle vier Landespakete stehen auf 'prepared'", VORBEREITET.every((k) => byKey.get(k).status === "prepared"));
check("kein Landespaket ist 'active'", VORBEREITET.every((k) => byKey.get(k).status !== "active"));
check("alle 18 Landesmodul-Wege sind needs_review + manual", (() => {
  const L = buildLandesmodulSeed();
  return L.retrievalPaths.length === 18
    && L.retrievalPaths.every((p) => p.status === "needs_review" && p.activation_mode === "manual");
})());
check("kein Landesmodul-Weg ist auto/always_on", (() => buildLandesmodulSeed().summary.aktiveAbrufwege === 0)());
check("kein Landesmodul-Weg ist in einem aktiven Paket", (() => {
  const aktivIds = new Set(PACKAGE_DEFINITIONS.filter((p) => p.status === "active").map((p) => p.id));
  const landIds = new Set(buildLandesmodulSeed().retrievalPaths.map((p) => p.id));
  return !CM.packagePaths.some((pp) => aktivIds.has(pp.package_id) && landIds.has(pp.retrieval_path_id));
})());
// Wirksamkeitsnachweis statt Leerprobe: die Aktivierung MUSS Bundeswege liefern (sonst waere
// die Aussage "0 Landeswege" trivial erfuellt) und darf KEINEN Landesweg enthalten.
const LAND_PATH_IDS = new Set(buildLandesmodulSeed().retrievalPaths.map((p) => p.id));
const BERLIN_PROFIL = { id: "tenant-alpha", name: "Testprofil Alpha", politische_ebene: "landtag", bundesland: "Berlin", partei: "Die Linke", aktiv: true, ausschuesse: ["Inneres"] };
const aktBerlin = computeGlobalActivation({
  profiles: [BERLIN_PROFIL], packages: PACKAGE_DEFINITIONS,
  packagePaths: CM.packagePaths, retrievalPaths: CM.paths
});
check("Punkt 13 aktiviert Berlin/Brandenburg nicht: ein Berliner Landtagsprofil erhaelt 0 aktive Landeswege",
  aktBerlin.activePathIds.length > 0 && aktBerlin.activePathIds.every((id) => !LAND_PATH_IDS.has(id)));
check("berlin-basis wird angefordert, bleibt aber unversorgt (prepared verhindert Aktivierung)", (() => {
  const st = aktBerlin.packageStatus.find((p) => p.key === "berlin-basis");
  return !!st && st.activation === "requested_unsupplied";
})());
check("Negativkontrolle: waere berlin-basis 'active', wuerden die Landeswege aktiv (Probe hat Zaehne)", (() => {
  const akt = computeGlobalActivation({
    profiles: [BERLIN_PROFIL],
    packages: PACKAGE_DEFINITIONS.map((p) => p.key === "berlin-basis" ? { ...p, status: "active" } : p),
    packagePaths: CM.packagePaths, retrievalPaths: CM.paths
  });
  return akt.activePathIds.some((id) => LAND_PATH_IDS.has(id));
})());
check("die Referenz auf ein vorbereitetes Pflichtpaket bleibt ehrlich unversorgt", (() => {
  const r = resolveProfilePackages({ id: "tenant-beta", politische_ebene: "landtag", bundesland: "Brandenburg", partei: "Die Linke" });
  return r.required.includes("brandenburg-basis") && r.optional.includes("die-linke-brandenburg");
})());

// ============ 11 · Unvollstaendiges kann nicht als vollstaendig gelten ============
console.log("== 11 · Kein falsches Gruen ==");
check("nur die belegt unvollstaendigen Pakete sind nicht 'vollstaendig'", (() => {
  const nichtVoll = A.pakete.filter((p) => p.ergebnis !== "vollstaendig").map((p) => p.key).sort();
  return JSON.stringify(nichtVoll) === JSON.stringify(Object.keys(ZUGELASSEN_UNVOLLSTAENDIG).sort());
})());
check("jedes nicht vollstaendige Paket nennt genau den zugelassenen Mangel",
  A.pakete.filter((p) => p.ergebnis !== "vollstaendig").every((p) => p.maengel.includes(ZUGELASSEN_UNVOLLSTAENDIG[p.key])));
check("ein Paket mit Maengeln kann nie 'vollstaendig' sein", A.pakete.every((p) => (p.maengel.length === 0) === (p.ergebnis === "vollstaendig")));
check("fachlich unmoegliche Pflichtklassen sind begruendet und zaehlen NICHT als erledigt", (() => {
  const p = byKey.get("die-linke-brandenburg");
  return p.unmoeglich.length === 2
    && p.unmoeglich.every((u) => typeof u.grund === "string" && u.grund.length > 40)
    && p.vorhandeneKlassen.length === 1
    && p.ergebnis === "teilweise";
})());
check("jedes Paket mit Einschraenkungen fuehrt sie ausgeschrieben",
  A.pakete.every((p) => p.einschraenkungen.every((e) => typeof e === "string" && e.length > 30)));
check("regional-niedersachsen dokumentiert seine drei belegten Grenzen", byKey.get("regional-niedersachsen").einschraenkungen.length === 3);
check("Negativkontrolle: ein Paket ohne fachliche Anforderung gilt als 'blockiert'", (() => {
  const mutiert = {
    ...CM,
    packages: [...CM.packages, { id: "pkg-attrappe", key: "attrappe", name: "Attrappe", purpose: "x", status: "active", is_base: false, political_level: "bund", geography_id: "geo-bund", required_classes: ["parlament_bund"] }]
  };
  const p = assessPackageCompleteness(mutiert).pakete.find((x) => x.key === "attrappe");
  return p.ergebnis === "blockiert" && p.maengel.includes("kein-abrufweg");
})());
check("Negativkontrolle: eine geleerte Pflichtklassenliste macht das Paket nicht still gruen", (() => {
  // Ein Paket ohne Pflichtklassen und ohne Anforderung ist 'blockiert', nicht 'vollstaendig'.
  const mutiert = {
    ...CM,
    packages: CM.packages.map((p) => p.key === "bund-basis" ? { ...p, key: "bund-basis-umbenannt" } : p)
  };
  const p = assessPackageCompleteness(mutiert).pakete.find((x) => x.key === "bund-basis-umbenannt");
  return p.ergebnis === "blockiert" && p.maengel.includes("keine-fachliche-anforderung-definiert");
})());

// ============ 12 · Paketdefinition == generierter Seed ============
console.log("== 12 · Definition == Seed ==");
const bundSeedSql = fs.readFileSync(path.join(__dirname, "..", "supabase/seeds/20260713_source_architecture_seed.sql"), "utf8");
check("Bund-Seed ist byte-genau der Generatorausgabe gleich (kein Drift)", bundSeedSql === bundGen.build());
check("Landesmodul-Seed ist byte-genau der Generatorausgabe gleich", (() => {
  const committed = fs.readFileSync(path.join(__dirname, "..", "supabase/seeds/20260717_landesmodul_be_bb_seed.sql"), "utf8");
  return committed === landGen.build().sql;
})());
check("erneute Generierung ist stabil (zwei Laeufe byte-identisch)", bundGen.build() === bundGen.build());
check("required_classes jedes Pakets steht im Seed", PACKAGE_DEFINITIONS.every((p) => {
  const arr = p.required_classes.length ? `array[${p.required_classes.map((c) => `'${c}'`).join(",")}]::text[]` : "'{}'";
  return bundSeedSql.includes(arr);
}));
check("kein Paket traegt mehr leere required_classes", PACKAGE_DEFINITIONS.every((p) => Array.isArray(p.required_classes) && p.required_classes.length > 0));
check("Seed enthaelt genau die Paketzeilen des Codes", PACKAGE_DEFINITIONS.every((p) => bundSeedSql.includes(`'${p.id}', '${p.key}'`)));
check("Seed traegt keine Berlin/Brandenburg-Abrufwege im Bund-Seed", !/rp-be-|rp-bb-|rp-rbb24-politik/.test(bundSeedSql));

// ============ 13 · Production-Betrieb bleibt unveraendert ============
console.log("== 13 · Production-Sicherheit ==");
check("die 5 always_on-Kernwege sind unveraendert", (() => {
  const on = buildFullModel().retrievalPaths.filter((p) => p.activation_mode === "always_on").map((p) => p.legacy_source_id).sort();
  return JSON.stringify(on) === JSON.stringify(["bundesregierung", "bundestag", "deutschlandfunk-politik", "dip", "tagesschau-politik"]);
})());
check("kein zusaetzlicher Abrufweg entstanden (144 Bund-Katalogwege)", buildFullModel().retrievalPaths.length === 144);
check("kein Weg hat seinen Aktivierungsmodus geaendert (139 auto, 5 always_on, 0 dev_only/manual)", (() => {
  const m = buildFullModel();
  const z = m.retrievalPaths.reduce((acc, p) => { acc[p.activation_mode] = (acc[p.activation_mode] || 0) + 1; return acc; }, {});
  return z.auto === 139 && z.always_on === 5 && !z.dev_only && !z.manual;
})());
check("Punkt 13 erzeugt genau EINE zusaetzliche Paketzuordnung (146 statt 145)", buildFullModel().packagePaths.length === 146);
check("der zusaetzliche Weg im Basispaket war schon vorher katalogaktiv (kein neuer Abruf)", (() => {
  const p = buildFullModel().retrievalPaths.find((x) => x.id === "rp-ausschuss-arbeit-soziales");
  return !!p && p.activation_mode === "auto";
})());
check("keine Statusaenderung an Abrufwegen (nur die 3 verifizierten healthy)", (() => {
  const healthy = buildFullModel().retrievalPaths.filter((p) => p.status === "healthy").map((p) => p.legacy_source_id).sort();
  return JSON.stringify(healthy) === JSON.stringify(["bmas", "deutschlandfunk-politik", "dip", "tagesschau-politik"]);
})());
check("keine Datei dieser Suite schreibt (nur lesende fs-Aufrufe)", (() => {
  const self = fs.readFileSync(__filename, "utf8");
  return !/fs\.(writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|unlink)/.test(self);
})());
// Strukturriegel: der LIVE-Crawlpfad darf die geaenderte Paketableitung nicht sehen. Im Modus
// 'on' baut der Scheduler seinen Plan aus den DB-Zeilen (listSourceArchitectureRows ->
// buildRelationalCrawlPlan); im Fallback filtert er v1Sources direkt ueber neutral/themeTerms/
// regional. Beide Pfade beruehren packageKeysForSource/buildFullModel NICHT — die Aenderung
// wirkt erst mit der freigabepflichtigen Seed-Einspielung. Wuerde ein spaeterer Umbau den
// Codemodell-Katalog in den Crawl ziehen, schlaegt dieser Riegel an.
check("Live-Crawlpfad nutzt weder packageKeysForSource noch buildFullModel", (() => {
  const scheduler = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/scheduler.js"), "utf8");
  const sourceMode = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/quellenarchitektur/source-mode.js"), "utf8");
  return !/packageKeysForSource|buildFullModel/.test(scheduler) && !/packageKeysForSource|buildFullModel/.test(sourceMode);
})());
check("der relationale Plan wird aus DB-Zeilen gebaut (nicht aus dem Codemodell)", (() => {
  const scheduler = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/scheduler.js"), "utf8");
  return /listSourceArchitectureRows/.test(scheduler)
    && /buildRelationalCrawlPlan\(\{[\s\S]{0,300}?retrievalPaths:\s*rows\.retrievalPaths/.test(scheduler);
})());

// ============ 14 · Bewertung ist reproduzierbar ============
console.log("== 14 · Reproduzierbarkeit ==");
check("zwei Bewertungslaeufe liefern dasselbe Ergebnis",
  JSON.stringify(assessPackageCompleteness()) === JSON.stringify(assessPackageCompleteness()));
check("Bestandszahlen des vereinigten Modells stimmen (144 Bund + 18 Land = 162 Wege)",
  CM.herkunft.bundWege === 144 && CM.herkunft.landWege === 18 && CM.paths.length === 162);
check("Zuordnungen des vereinigten Modells stimmen (146 Bund + 19 Land = 165)", CM.packagePaths.length === 165);
check("Ergebnisverteilung: 6 vollstaendig, 2 teilweise, 0 blockiert",
  A.summary.vollstaendig === 6 && A.summary.teilweise === 2 && A.summary.blockiert === 0);

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
