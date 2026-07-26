"use strict";

// Helmut — EXTERN VERANKERTE Zusicherung: der Quellenkatalog deckt die staendigen Ausschuesse
// des 21. Deutschen Bundestages vollstaendig ab.
//
// WARUM DIESE SUITE GETRENNT EXISTIERT
// ------------------------------------
// Die frueheren Vollzaehligkeitspruefungen waren KATALOGRELATIV: die Sollmenge wurde aus dem
// Katalog abgeleitet und dann gegen den Katalog geprueft. Damit konnte ein systematischer
// Fehlbestand nicht auffallen — der Katalog fuehrte 23 Ausschuesse, der 21. Bundestag hat 24
// (Drucksache 21/150, Einsetzungsbeschluss vom 15.05.2025).
//
// Diese Suite prueft in die andere Richtung: gegen die externe Sollmenge in
// `lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse.js`, die aus dem
// Einsetzungsbeschluss und den amtlichen Ausschussbezeichnungen der 21. Wahlperiode stammt.
// Ein fehlender, ein zusaetzlicher, ein umbenannter oder ein doppelt gefuehrter Ausschuss wird
// jeweils EINZELN rot — Zahlengleichstand allein genuegt nirgends.
//
// Reiner Offline-Test: kein Netz, keine KI, kein DB-Zugriff, kein Datei-Schreiben.

const {
  WAHLPERIODE, EINSETZUNGSBESCHLUSS, STAENDIGE_AUSSCHUESSE, VERALTETE_AUSSCHUSSNAMEN,
  AUSSCHUSS_KEYS, AUSSCHUSS_NAMEN, validateSollmenge, ausschussByKey, vergleicheMitSollmenge
} = require("../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse");
const {
  katalogAusschuesse, pruefeAusschussSollmenge, istInstitutionellerAusschuss,
  catalogPathClasses, buildCompletenessModel, assessPackageCompleteness
} = require("../lib/helmut/quellenarchitektur/paket-vollstaendigkeit");
const { v1Sources } = require("../lib/helmut/sources");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// ============ 1 · Die Sollmenge selbst ist verankert und in sich schluessig ============
console.log("== 1 · Sollmenge (extern verankert) ==");
check("erwartete Wahlperiode ist die 21.", WAHLPERIODE === 21 && EINSETZUNGSBESCHLUSS.wahlperiode === 21);
check("Einsetzungsbeschluss ist als Primaerquelle benannt (Drucksache 21/150, 15.05.2025)",
  EINSETZUNGSBESCHLUSS.drucksache === "21/150"
  && EINSETZUNGSBESCHLUSS.drucksache_datum === "2025-05-13"
  && EINSETZUNGSBESCHLUSS.beschluss_datum === "2025-05-15"
  && EINSETZUNGSBESCHLUSS.belege.length >= 2);
check("die fachliche Sollmenge enthaelt exakt 24 staendige Ausschuesse",
  EINSETZUNGSBESCHLUSS.staendige_ausschuesse === 24 && STAENDIGE_AUSSCHUESSE.length === 24);
check("Sollmenge ist in sich gueltig (Anzahl, Eindeutigkeit, Bezeichnungen, Belege)", (() => {
  const v = validateSollmenge();
  if (!v.ok) console.log("      -> " + v.fehler.join(" | "));
  return v.ok;
})());
check("jeder Ausschuss traegt eine stabile fachliche Kennung UND die amtliche Bezeichnung",
  STAENDIGE_AUSSCHUESSE.every((a) => /^[a-z0-9-]+$/.test(a.key) && a.name.length > 8));
check("jeder Ausschuss traegt einen amtlichen Fundstellenhinweis",
  STAENDIGE_AUSSCHUESSE.every((a) => typeof a.beleg === "string" && a.beleg.length > 15));
check("keine Bezeichnung einer frueheren Wahlperiode steht in der Sollmenge",
  VERALTETE_AUSSCHUSSNAMEN.every((v) => !AUSSCHUSS_NAMEN.includes(v.name)));
check("die vier grundgesetzlich vorgeschriebenen Ausschuesse sind enthalten (Art. 45/45a/45c GG)",
  ["europaeische-union", "auswaertiges", "verteidigung", "petitionen"].every((k) => !!ausschussByKey(k)));
check("der Geschaeftsordnungsausschuss ist enthalten (§ 128 GO-BT)",
  !!ausschussByKey("wahlpruefung-immunitaet-geschaeftsordnung"));

// ============ 2 · Der Katalog deckt die Sollmenge vollstaendig ab ============
console.log("== 2 · Katalog gegen Sollmenge ==");
const V = pruefeAusschussSollmenge();
check("Katalog fuehrt genau 24 Ausschussquellen", katalogAusschuesse().length === 24);
check("kein Ausschuss der Sollmenge fehlt im Katalog", (() => {
  if (V.fehlend.length) console.log("      -> fehlend: " + V.fehlend.map((f) => f.key).join(", "));
  return V.fehlend.length === 0;
})());
check("keine unbekannte Ausschussquelle im Katalog", (() => {
  if (V.unbekannt.length) console.log("      -> unbekannt: " + V.unbekannt.map((u) => `${u.key}/${u.name}`).join(", "));
  return V.unbekannt.length === 0;
})());
check("keine abweichende Bezeichnung (Umbenennung wuerde hier auffallen)", (() => {
  if (V.abweichenderName.length) console.log("      -> " + V.abweichenderName.map((a) => `${a.key}: '${a.ist}' != '${a.soll}'`).join(" | "));
  return V.abweichenderName.length === 0;
})());
check("keine doppelte Ausschusskennung im Katalog", V.doppelt.length === 0);
check("Gesamturteil: Katalog == Sollmenge der 21. Wahlperiode", V.vollstaendig === true && V.soll === 24 && V.ist === 24);
check("jede Ausschussquelle traegt die amtliche Bezeichnung WOERTLICH", (() => {
  const nameByKey = new Map(STAENDIGE_AUSSCHUESSE.map((a) => [a.key, a.name]));
  return v1Sources.filter((s) => s.ausschussKey).every((s) => s.name === nameByKey.get(s.ausschussKey));
})());
check("jede Ausschussquelle wird als institutioneller Ausschuss erkannt",
  v1Sources.filter((s) => s.ausschussKey).every((s) => istInstitutionellerAusschuss(s)));
check("jede Ausschussquelle traegt die Klasse 'bundestagsausschuesse'",
  v1Sources.filter((s) => s.ausschussKey).every((s) => catalogPathClasses(s).includes("bundestagsausschuesse")));
check("kein Themen-Buendel wird als Ausschuss gezaehlt (25 Buendel mit type 'committee')", (() => {
  const buendel = v1Sources.filter((s) => /^bundle-/.test(s.id) && s.type === "committee");
  return buendel.length === 25 && buendel.every((s) => !s.ausschussKey && !istInstitutionellerAusschuss(s));
})());
check("keine Prozessquelle wird als Ausschuss gezaehlt",
  v1Sources.filter((s) => /^process-/.test(s.id)).every((s) => !istInstitutionellerAusschuss(s)));

// ============ 3 · Negativkontrollen (die Zusicherung muss Zaehne haben) ============
console.log("== 3 · Negativkontrollen ==");
const KATALOG_IST = katalogAusschuesse();

check("Negativkontrolle: ein FEHLENDER Ausschuss wird erkannt", (() => {
  const ohne = KATALOG_IST.filter((a) => a.key !== "wahlpruefung-immunitaet-geschaeftsordnung");
  const r = vergleicheMitSollmenge(ohne);
  return !r.vollstaendig && r.ist === 23
    && r.fehlend.length === 1 && r.fehlend[0].key === "wahlpruefung-immunitaet-geschaeftsordnung";
})());

check("Negativkontrolle: ein ZUSAETZLICHER veralteter Ausschuss aus der 20. WP wird erkannt", (() => {
  const veraltet = VERALTETE_AUSSCHUESSE_FIXTURE();
  const r = vergleicheMitSollmenge([...KATALOG_IST, veraltet]);
  return !r.vollstaendig
    && r.unbekannt.length === 1
    && r.unbekannt[0].name === veraltet.name
    && r.unbekannt[0].veraltet && r.unbekannt[0].veraltet.wahlperiode === 20;
})());

check("Negativkontrolle: Zahlengleichstand rettet nicht — Tausch gegen einen veralteten Ausschuss wird erkannt", (() => {
  // 24 bleibt 24: ein aktueller Ausschuss raus, ein veralteter rein.
  const veraltet = VERALTETE_AUSSCHUESSE_FIXTURE();
  const getauscht = [...KATALOG_IST.filter((a) => a.key !== "landwirtschaft-ernaehrung-heimat"), veraltet];
  const r = vergleicheMitSollmenge(getauscht);
  return getauscht.length === 24 && !r.vollstaendig
    && r.fehlend.some((f) => f.key === "landwirtschaft-ernaehrung-heimat")
    && r.unbekannt.some((u) => u.veraltet);
})());

check("Negativkontrolle: eine UMBENENNUNG wird erkannt (Kennung stimmt, Bezeichnung nicht)", (() => {
  const umbenannt = KATALOG_IST.map((a) =>
    a.key === "sport-ehrenamt" ? { ...a, name: "Ausschuss für Sport" } : a);
  const r = vergleicheMitSollmenge(umbenannt);
  return umbenannt.length === 24 && !r.vollstaendig
    && r.fehlend.length === 0 && r.unbekannt.length === 0
    && r.abweichenderName.length === 1
    && r.abweichenderName[0].key === "sport-ehrenamt"
    && r.abweichenderName[0].soll === "Ausschuss für Sport und Ehrenamt";
})());

check("Negativkontrolle: eine ZUSAMMENLEGUNG wird erkannt (zwei Kennungen auf eine reduziert)", (() => {
  // Bildung/Familie und Forschung wieder zu einem Eintrag verschmelzen (20.-WP-Zuschnitt).
  const verschmolzen = KATALOG_IST
    .filter((a) => a.key !== "forschung-technologie-raumfahrt")
    .concat([{ key: "bildung-familie-senioren-frauen-jugend", name: "Ausschuss für Bildung und Forschung", id: "committee-familie" }]);
  const r = vergleicheMitSollmenge(verschmolzen);
  return !r.vollstaendig
    && r.fehlend.some((f) => f.key === "forschung-technologie-raumfahrt")
    && r.doppelt.includes("bildung-familie-senioren-frauen-jugend");
})());

check("Negativkontrolle: eine Ausschussquelle OHNE Kennung faellt aus der Ist-Menge", (() => {
  const ohneKey = v1Sources.map((s) => s.id === "committee-wahlpruefung" ? { ...s, ausschussKey: undefined } : s);
  const r = pruefeAusschussSollmenge(ohneKey);
  return !r.vollstaendig && r.fehlend.some((f) => f.key === "wahlpruefung-immunitaet-geschaeftsordnung");
})());

// Fixture-Helfer: ein NACHWEISLICH veralteter Ausschuss (20. Wahlperiode) mit erfundener,
// klar als Fixture erkennbarer Kennung — er darf in der Sollmenge nicht vorkommen.
function VERALTETE_AUSSCHUESSE_FIXTURE() {
  const v = VERALTETE_AUSSCHUSSNAMEN[0];
  return { key: "fixture-veralteter-ausschuss-20wp", name: v.name, id: "committee-fixture-20wp" };
}

// ============ 4 · Wirkung auf das Pflicht-Basispaket ============
console.log("== 4 · bund-basis deckt alle 24 ab ==");
const A = assessPackageCompleteness(buildCompletenessModel());
const bundBasis = A.pakete.find((p) => p.key === "bund-basis");
const regel = bundBasis.vollzaehligkeit.find((v) => v.regel === "alle_institutionellen_ausschuesse");
check("Vollzaehligkeitsregel nennt die gepruefte Wahlperiode", regel && regel.wahlperiode === 21);
check("bund-basis deckt alle 24 staendigen Ausschuesse ab", regel && regel.erfuellt && regel.soll === 24 && regel.ist === 24);
check("die Sollmenge der Regel stammt NICHT aus dem Katalog (24 aus dem Einsetzungsbeschluss)",
  regel.soll === EINSETZUNGSBESCHLUSS.staendige_ausschuesse);
check("jeder der 24 Ausschuss-Abrufwege liegt im Pflicht-Basispaket", (() => {
  const M = buildFullModel();
  const imBasis = new Set(M.packagePaths.filter((pp) => pp.package_id === "pkg-bund-basis").map((pp) => pp.retrieval_path_id));
  return v1Sources.filter((s) => s.ausschussKey).every((s) => imBasis.has(`rp-${s.id}`));
})());
check("der neue 24. Ausschuss ist eine eigene Abrufweg-Zeile", (() => {
  const M = buildFullModel();
  const p = M.retrievalPaths.find((x) => x.id === "rp-committee-wahlpruefung");
  return !!p && p.method === "googlenews_search" && p.activation_mode === "auto" && p.status === "needs_review";
})());
check("Negativkontrolle: fehlt der 24. Ausschuss im Basispaket, ist bund-basis nicht mehr vollstaendig", (() => {
  const CM = buildCompletenessModel();
  const mutiert = {
    ...CM,
    packagePaths: CM.packagePaths.filter((pp) => !(pp.package_id === "pkg-bund-basis" && pp.retrieval_path_id === "rp-committee-wahlpruefung"))
  };
  const p = assessPackageCompleteness(mutiert).pakete.find((x) => x.key === "bund-basis");
  const r = p.vollzaehligkeit.find((v) => v.regel === "alle_institutionellen_ausschuesse");
  return p.ergebnis !== "vollstaendig" && r && !r.erfuellt && r.ist === 23
    && r.fehlend.includes("wahlpruefung-immunitaet-geschaeftsordnung");
})());

// ============ 5 · Keine Nebenwirkung auf Production-Schalter ============
console.log("== 5 · Production-Sicherheit ==");
check("der neue Ausschuss-Abrufweg ist NICHT always_on", (() => {
  const p = buildFullModel().retrievalPaths.find((x) => x.id === "rp-committee-wahlpruefung");
  return p && p.activation_mode !== "always_on" && p.is_critical === false;
})());
check("die 5 always_on-Kernwege sind unveraendert", (() => {
  const on = buildFullModel().retrievalPaths.filter((p) => p.activation_mode === "always_on").map((p) => p.legacy_source_id).sort();
  return JSON.stringify(on) === JSON.stringify(["bundesregierung", "bundestag", "deutschlandfunk-politik", "dip", "tagesschau-politik"]);
})());
check("der neue Weg ueberlebt die Kuratierung (sonst waere die Abdeckung nur auf dem Papier)",
  v1Sources.some((s) => s.id === "committee-wahlpruefung"));
check("Ausschussquellen erhoehen die Google-Konzentration um genau 1 Weg (24 statt 23)",
  v1Sources.filter((s) => s.ausschussKey).length === 24);

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
