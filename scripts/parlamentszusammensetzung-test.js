"use strict";

// Helmut — EXTERN VERANKERTE Zusicherungen zur Parlamentszusammensetzung.
//
// Deckt zwei fachliche Anforderungen ab, die zuvor NICHT ueberpruefbar waren:
//
//   1. FRAKTIONSVOLLZAEHLIGKEIT von "bund-basis". Die Alt-Regel leitete ihre Sollmenge aus allen
//      `fraction-*`-Ids des Katalogs ab und meldete "8 von 8" — dasselbe katalogrelative
//      Fehlermuster, das bei den Ausschuessen zu "23 statt 24" gefuehrt hat. Fachlich falsch:
//      FDP (4,3 %) und BSW (4,97 %) sind im 21. Bundestag ueberhaupt nicht vertreten, der SSW hat
//      mit einem Mandat keinen Fraktionsstatus. Richtig sind **5 Fraktionen**.
//
//   2. "FACHLICH NICHT ANWENDBAR" bei die-linke-brandenburg. Die Begruendung stand nur als
//      Freitext im Anforderungsobjekt und war damit nicht pruefbar — eine echte Quellenluecke
//      haette sich dahinter verstecken koennen. Jede Ausnahme wird jetzt gegen die kanonische
//      Parlamentszusammensetzung geprueft.
//
// Reiner Offline-Test: kein Netz, keine KI, kein DB-Zugriff, kein Datei-Schreiben.

const {
  BUNDESTAG_21, LANDTAG_BRANDENBURG_8, PARLAMENTE, parlament,
  fraktionsLage, validateSollmenge, vergleicheFraktionen, nameEnthaeltBezeichnung
} = require("../lib/helmut/quellenarchitektur/seeds/parlamentszusammensetzung");
const {
  AUSNAHME_PFLICHTFELDER, pruefeAusnahme, katalogFraktionen, pruefeFraktionsSollmenge,
  catalogPathClasses, buildCompletenessModel, assessPackageCompleteness, PACKAGE_REQUIREMENTS
} = require("../lib/helmut/quellenarchitektur/paket-vollstaendigkeit");
const { v1Sources } = require("../lib/helmut/sources");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const { WAHLPERIODE: AUSSCHUSS_WAHLPERIODE } = require("../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse");
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// ============ 1 · Die Sollmengen selbst ============
console.log("== 1 · Kanonische Parlamentszusammensetzung ==");
check("Bundestag: erwartete Wahlperiode ist die 21.", BUNDESTAG_21.wahlperiode === 21);
check("Bundestag: 630 Sitze als Grundlage benannt", BUNDESTAG_21.sitze === 630 && !!BUNDESTAG_21.grundlage);
check("Bundestag: amtliche Belege hinterlegt (>=2)", BUNDESTAG_21.belege.length >= 2);
check("Bundestag: genau 5 Fraktionen", BUNDESTAG_21.fraktionen.length === 5);
check("Bundestag: keine Gruppe, mit begruendeter Ableitung",
  BUNDESTAG_21.gruppen.length === 0 && String(BUNDESTAG_21.gruppenAbleitung || "").length > 40);
check("Bundestag: SSW getrennt als Mandat ohne Fraktionsstatus gefuehrt", (() => {
  const o = BUNDESTAG_21.ohneFraktionsstatus;
  return o.length === 1 && o[0].key === "ssw" && o[0].typ === "ohne_fraktionsstatus" && o[0].sitze === 1 && !!o[0].beleg;
})());
check("Bundestag: FDP und BSW als nicht vertreten gefuehrt, mit Ergebnis und Beleg", (() => {
  const n = BUNDESTAG_21.nichtVertreten;
  return n.length === 2 && ["fdp", "bsw"].every((k) => n.some((x) => x.key === k && x.ergebnis && x.beleg && x.grund));
})());
check("Bundestag: Sitzsumme geht auf (5 Fraktionen + 1 SSW = 630)", (() => {
  const s = BUNDESTAG_21.fraktionen.reduce((a, f) => a + f.sitze, 0)
    + BUNDESTAG_21.ohneFraktionsstatus.reduce((a, o) => a + o.sitze, 0);
  return s === BUNDESTAG_21.sitze;
})());
check("Brandenburg: erwartete Wahlperiode ist die 8. (2024–2029)",
  LANDTAG_BRANDENBURG_8.wahlperiode === 8 && LANDTAG_BRANDENBURG_8.wahltag === "2024-09-22");
check("Brandenburg: 4 Fraktionen (SPD/AfD/BSW/CDU), Die Linke nicht vertreten", (() => {
  const f = LANDTAG_BRANDENBURG_8.fraktionen.map((x) => x.key).sort();
  return JSON.stringify(f) === JSON.stringify(["afd", "bsw", "cdu", "spd"])
    && LANDTAG_BRANDENBURG_8.nichtVertreten.some((n) => n.key === "linke");
})());
check("Brandenburg: amtliche Belege (Landeswahlleiterin + Landtagshandbuch)",
  LANDTAG_BRANDENBURG_8.belege.some((b) => /wahlen\.brandenburg\.de/.test(b))
  && LANDTAG_BRANDENBURG_8.belege.some((b) => /landtag\.brandenburg\.de/.test(b)));
check("alle Sollmengen sind in sich gueltig (Typen, Kennungen, Belege, Widerspruchsfreiheit)", (() => {
  const v = validateSollmenge();
  if (!v.ok) console.log("      -> " + v.fehler.join(" | "));
  return v.ok;
})());
check("jede Fraktion traegt typ 'fraktion' und einen Beleg",
  Object.values(PARLAMENTE).every((p) => p.fraktionen.every((f) => f.typ === "fraktion" && !!f.beleg)));

// ============ 2 · Katalog gegen die Fraktions-Sollmenge ============
console.log("== 2 · Katalog gegen Fraktions-Sollmenge ==");
const V = pruefeFraktionsSollmenge();
check("Katalog fuehrt genau 5 Fraktionsquellen", katalogFraktionen().length === 5);
check("keine Fraktion der Sollmenge fehlt im Katalog", (() => {
  if (V.fehlend.length) console.log("      -> fehlend: " + V.fehlend.map((f) => f.key).join(", "));
  return V.fehlend.length === 0;
})());
check("keine unbekannte Fraktionsquelle im Katalog", (() => {
  if (V.unbekannt.length) console.log("      -> unbekannt: " + V.unbekannt.map((u) => u.key).join(", "));
  return V.unbekannt.length === 0;
})());
check("keine abweichende Bezeichnung (Umbenennung wuerde hier auffallen)", (() => {
  if (V.abweichenderName.length) console.log("      -> " + V.abweichenderName.map((a) => `${a.key}: '${a.ist}' != '${a.soll}'`).join(" | "));
  return V.abweichenderName.length === 0;
})());
check("kein falscher politischer Typ", V.abweichenderTyp.length === 0);
check("keine doppelte Fraktionskennung", V.doppelt.length === 0);
check("Gesamturteil: Katalog == Fraktions-Sollmenge der 21. Wahlperiode",
  V.vollstaendig === true && V.soll === 5 && V.ist === 5 && V.wahlperiode === 21);
check("jede Fraktionsquelle traegt die amtliche Bezeichnung im Namen", (() => {
  const nameByKey = new Map(BUNDESTAG_21.fraktionen.map((f) => [f.key, f.name]));
  return v1Sources.filter((s) => s.fraktionKey).every((s) => nameEnthaeltBezeichnung(s.name, nameByKey.get(s.fraktionKey)));
})());
check("jede Fraktionsquelle traegt die Klasse 'bundestagsfraktionen'",
  v1Sources.filter((s) => s.fraktionKey).every((s) => catalogPathClasses(s).includes("bundestagsfraktionen")));
check("FDP, BSW und SSW zaehlen NICHT als Fraktion, sondern als Partei ohne Fraktionsstatus", (() => {
  const ohne = v1Sources.filter((s) => s.ohneFraktionsstatus);
  return ohne.length === 3
    && ohne.every((s) => !s.fraktionKey)
    && ohne.every((s) => catalogPathClasses(s).includes("parteien_ohne_fraktionsstatus"))
    && ohne.every((s) => !catalogPathClasses(s).includes("bundestagsfraktionen"));
})());
check("die drei Quellen sind erhalten geblieben (keine Quelle entfernt)",
  ["fraction-fdp", "fraction-bsw", "fraction-ssw"].every((id) => v1Sources.some((s) => s.id === id)));
check("keine Quellenbezeichnung nennt FDP oder BSW noch als Fraktion",
  v1Sources.filter((s) => ["fraction-fdp", "fraction-bsw"].includes(s.id)).every((s) => !/fraktion/i.test(s.name)));

// ============ 3 · Negativkontrollen der Fraktions-Sollmenge ============
console.log("== 3 · Negativkontrollen Fraktionen ==");
const IST = katalogFraktionen();

check("Negativkontrolle: eine FEHLENDE Fraktion wird erkannt", (() => {
  const r = vergleicheFraktionen("bundestag", IST.filter((f) => f.key !== "linke"));
  return !r.vollstaendig && r.ist === 4 && r.fehlend.length === 1 && r.fehlend[0].key === "linke";
})());

check("Negativkontrolle: eine ZUSAETZLICHE nicht vertretene Partei wird erkannt", (() => {
  const r = vergleicheFraktionen("bundestag", [...IST, { key: "fdp", name: "FDP-Fraktion", typ: "fraktion" }]);
  return !r.vollstaendig && r.unbekannt.length === 1
    && r.unbekannt[0].key === "fdp" && !!r.unbekannt[0].nichtVertreten;
})());

check("Negativkontrolle: ein Mandat OHNE Fraktionsstatus wird nicht als Fraktion akzeptiert", (() => {
  const r = vergleicheFraktionen("bundestag", [...IST, { key: "ssw", name: "SSW", typ: "fraktion" }]);
  return !r.vollstaendig && r.unbekannt.some((u) => u.key === "ssw" && !!u.ohneFraktionsstatus);
})());

check("Negativkontrolle: Zahlengleichstand rettet nicht — Tausch Linke gegen FDP wird erkannt", (() => {
  const getauscht = [...IST.filter((f) => f.key !== "linke"), { key: "fdp", name: "FDP-Fraktion", typ: "fraktion" }];
  const r = vergleicheFraktionen("bundestag", getauscht);
  return getauscht.length === 5 && !r.vollstaendig
    && r.fehlend.some((f) => f.key === "linke")
    && r.unbekannt.some((u) => u.key === "fdp" && !!u.nichtVertreten);
})());

check("Negativkontrolle: eine UMBENENNUNG wird erkannt (Kennung stimmt, Bezeichnung nicht)", (() => {
  const umbenannt = IST.map((f) => f.key === "gruene" ? { ...f, name: "Fraktion Die Grauen" } : f);
  const r = vergleicheFraktionen("bundestag", umbenannt);
  return umbenannt.length === 5 && !r.vollstaendig
    && r.fehlend.length === 0 && r.unbekannt.length === 0
    && r.abweichenderName.length === 1 && r.abweichenderName[0].key === "gruene";
})());

check("Negativkontrolle: ein FALSCHER politischer Typ wird erkannt", (() => {
  const r = vergleicheFraktionen("bundestag", IST.map((f) => f.key === "linke" ? { ...f, typ: "gruppe" } : f));
  return !r.vollstaendig && r.abweichenderTyp.length === 1
    && r.abweichenderTyp[0].key === "linke" && r.abweichenderTyp[0].ist === "gruppe";
})());

check("Negativkontrolle: ein Katalogeintrag OHNE stabile Kennung faellt aus der Ist-Menge", (() => {
  const ohneKey = v1Sources.map((s) => s.id === "fraction-linke" ? { ...s, fraktionKey: undefined } : s);
  const r = pruefeFraktionsSollmenge(ohneKey);
  return !r.vollstaendig && r.fehlend.some((f) => f.key === "linke");
})());

check("Negativkontrolle: eine DOPPELTE Kennung wird erkannt", (() => {
  const r = vergleicheFraktionen("bundestag", [...IST, { key: "spd", name: "Fraktion SPD", typ: "fraktion" }]);
  return !r.vollstaendig && r.doppelt.includes("spd");
})());

check("Negativkontrolle: ein unbekanntes Parlament liefert kein Urteil (statt still gruen)", (() => {
  const r = vergleicheFraktionen("landtag-bayern", IST);
  return r.bekannt === false && r.vollstaendig === false;
})());

// ============ 4 · "Nicht anwendbar" ist ueberpruefbar ============
console.log("== 4 · Nicht-anwendbar-Logik ==");
const NA = PACKAGE_REQUIREMENTS["die-linke-brandenburg"].nichtAnwendbar;
check("beide Ausnahmen sind Objekte mit allen Pflichtfeldern",
  Object.values(NA).every((a) => AUSNAHME_PFLICHTFELDER.every((f) => a[f] !== undefined && a[f] !== null && a[f] !== "")));
check("jede Ausnahme traegt eine stabile Kennung", (() => {
  const k = Object.values(NA).map((a) => a.kennung);
  return k.length === 2 && new Set(k).size === 2 && k.every((x) => /^[a-z0-9-]+$/.test(x));
})());
check("jede Ausnahme ist zeitlich gebunden (Wahlperiode + Geltungsbereich)",
  Object.values(NA).every((a) => a.wahlperiode === 8 && /8\. Wahlperiode/.test(a.gueltig_fuer)));
check("jede Ausnahme nennt einen amtlichen Beleg",
  Object.values(NA).every((a) => /wahlen\.brandenburg\.de|landtag\.brandenburg\.de/.test(a.beleg)));
check("jede Ausnahme traegt eine ueberpruefbare Voraussetzung",
  Object.values(NA).every((a) => a.voraussetzung && a.voraussetzung.parlament === "landtag-brandenburg"
    && a.voraussetzung.wahlperiode === 8 && a.voraussetzung.partei === "linke"
    && ["keine_fraktion", "keine_mandate"].includes(a.voraussetzung.pruefung)));
check("beide Ausnahmen werden gegen die Parlamentszusammensetzung BESTAETIGT",
  Object.entries(NA).every(([k, a]) => pruefeAusnahme(k, a).bestaetigt === true));
check("die Bestaetigung nennt Parlament, Wahlperiode und Belege", (() => {
  const g = pruefeAusnahme("fraktion_pilot", NA.fraktion_pilot).geprueft;
  return g && g.parlament === "Landtag Brandenburg" && g.wahlperiode === 8 && g.belege.length >= 2;
})());
check("die politische Voraussetzung trifft wirklich zu (Die Linke ohne Fraktion und ohne Mandat)", (() => {
  const l = fraktionsLage({ parlament: "landtag-brandenburg", wahlperiode: 8, partei: "linke" });
  return l.bekannt && l.hatFraktion === false && l.hatGruppe === false && l.hatMandate === false && l.nichtVertreten === true;
})());

// ============ 5 · Negativkontrollen der Nicht-anwendbar-Logik ============
console.log("== 5 · Negativkontrollen Nicht-anwendbar ==");

check("Negativkontrolle: eine Ausnahme fuer eine Partei MIT Fraktion wird abgelehnt", (() => {
  // BSW hat in der 8. WP eine Fraktion im Landtag Brandenburg -> keine Ausnahme moeglich.
  const r = pruefeAusnahme("fraktion_pilot", { ...NA.fraktion_pilot, voraussetzung: { ...NA.fraktion_pilot.voraussetzung, partei: "bsw" } });
  return r.bestaetigt === false && /trifft NICHT zu/.test(r.grundAblehnung);
})());

check("Negativkontrolle: eine Ausnahme mit FALSCHER Wahlperiode wird abgelehnt", (() => {
  const r = pruefeAusnahme("fraktion_pilot", {
    ...NA.fraktion_pilot, wahlperiode: 7,
    voraussetzung: { ...NA.fraktion_pilot.voraussetzung, wahlperiode: 7 }
  });
  return r.bestaetigt === false && /nicht pruefbar|Wahlperiode/.test(r.grundAblehnung);
})());

check("Negativkontrolle: eine Ausnahme als bloßer Freitext wird abgelehnt", (() => {
  const r = pruefeAusnahme("fraktion_pilot", "Die Linke hat da keine Fraktion, glaub mir");
  return r.bestaetigt === false && /kein Objekt/.test(r.grundAblehnung);
})());

check("Negativkontrolle: eine Ausnahme ohne Beleg wird abgelehnt", (() => {
  const ohneBeleg = { ...NA.fraktion_pilot };
  delete ohneBeleg.beleg;
  const r = pruefeAusnahme("fraktion_pilot", ohneBeleg);
  return r.bestaetigt === false && /Pflichtfelder fehlen: beleg/.test(r.grundAblehnung);
})());

check("Negativkontrolle: eine Ausnahme fuer ein unbekanntes Parlament wird abgelehnt", (() => {
  const r = pruefeAusnahme("fraktion_pilot", {
    ...NA.fraktion_pilot, voraussetzung: { ...NA.fraktion_pilot.voraussetzung, parlament: "landtag-erfundenland" }
  });
  return r.bestaetigt === false && /nicht pruefbar/.test(r.grundAblehnung);
})());

check("Negativkontrolle: eine unbekannte Pruefart wird abgelehnt", (() => {
  const r = pruefeAusnahme("fraktion_pilot", {
    ...NA.fraktion_pilot, voraussetzung: { ...NA.fraktion_pilot.voraussetzung, pruefung: "glaubt-uns-einfach" }
  });
  return r.bestaetigt === false && /unbekannte Pruefung/.test(r.grundAblehnung);
})());

// Wirkung auf die Paketbewertung: eine missbraeuchliche Ausnahme darf das Paket NICHT retten.
const CM = buildCompletenessModel();
check("Negativkontrolle: eine missbraeuchliche Ausnahme rettet ein Paket NICHT", (() => {
  // Berlin-Parteipaket ohne seine drei Wege + erschlichene Ausnahme fuer eine Partei, die in
  // Brandenburg eine Fraktion hat -> muss als unbegruendet erkannt werden.
  const req = { ...PACKAGE_REQUIREMENTS["die-linke-berlin"] };
  const gefaelscht = {
    ...req,
    nichtAnwendbar: {
      partei_pilot: {
        kennung: "faelschung", grund: "x".repeat(50), wahlperiode: 8,
        gueltig_fuer: "Landtag Brandenburg, 8. Wahlperiode", beleg: "wahlen.brandenburg.de",
        voraussetzung: { pruefung: "keine_fraktion", parlament: "landtag-brandenburg", wahlperiode: 8, partei: "spd" }
      }
    }
  };
  const r = pruefeAusnahme("partei_pilot", gefaelscht.nichtAnwendbar.partei_pilot);
  return r.bestaetigt === false && /trifft NICHT zu/.test(r.grundAblehnung);
})());

check("Negativkontrolle: faellt eine bestaetigte Ausnahme weg, ist das Paket nicht mehr abgeschlossen", (() => {
  // Die Ausnahme wird kuenstlich entwertet, indem die Klasse als offene Luecke gilt:
  // ohne Ausnahmeobjekt bleibt `fraktion_pilot` einfach fehlend.
  const A = assessPackageCompleteness(CM).pakete.find((p) => p.key === "die-linke-brandenburg");
  return A.ergebnis === "vollstaendig_mit_belegten_ausnahmen"
    && A.unmoeglich.length === 2
    && A.fehlend.length === 0
    && A.unbegruendeteAusnahmen.length === 0;
})());

check("eine bestaetigte Ausnahme ist NICHT dasselbe wie 'vollstaendig'", (() => {
  const A = assessPackageCompleteness(CM);
  const dlb = A.pakete.find((p) => p.key === "die-linke-brandenburg");
  const dlbe = A.pakete.find((p) => p.key === "die-linke-berlin");
  return dlb.ergebnis === "vollstaendig_mit_belegten_ausnahmen" && dlbe.ergebnis === "vollstaendig";
})());

check("Berlin-Parteipaket braucht KEINE Ausnahme (dort existiert die Fraktion wirklich)",
  !PACKAGE_REQUIREMENTS["die-linke-berlin"].nichtAnwendbar);

// ============ 6 · Wirkung auf bund-basis und Production-Sicherheit ============
console.log("== 6 · Wirkung und Production-Sicherheit ==");
const AA = assessPackageCompleteness(CM);
const bundBasis = AA.pakete.find((p) => p.key === "bund-basis");
check("bund-basis fuehrt 'parteien_ohne_fraktionsstatus' als ZUSAETZLICHE, nicht als Pflichtklasse",
  bundBasis.zusaetzlich.includes("parteien_ohne_fraktionsstatus")
  && !bundBasis.pflichtklassen.includes("parteien_ohne_fraktionsstatus"));
check("alle 5 Fraktionswege liegen im Pflicht-Basispaket", (() => {
  const M = buildFullModel();
  const imBasis = new Set(M.packagePaths.filter((pp) => pp.package_id === "pkg-bund-basis").map((pp) => pp.retrieval_path_id));
  return v1Sources.filter((s) => s.fraktionKey).every((s) => imBasis.has(`rp-${s.id}`));
})());
check("die 3 Quellen ohne Fraktionsstatus bleiben im Basispaket (keine Quelle verloren)", (() => {
  const M = buildFullModel();
  const imBasis = new Set(M.packagePaths.filter((pp) => pp.package_id === "pkg-bund-basis").map((pp) => pp.retrieval_path_id));
  return ["rp-fraction-fdp", "rp-fraction-bsw", "rp-fraction-ssw"].every((id) => imBasis.has(id));
})());
check("kein Fraktions-/Parteiweg hat seinen Aktivierungsmodus oder Status geaendert", (() => {
  const M = buildFullModel();
  const wege = M.retrievalPaths.filter((p) => /^rp-fraction-/.test(p.id));
  return wege.length === 8 && wege.every((p) => p.activation_mode === "auto" && p.status === "needs_review");
})());
check("die Umstellung erzeugt keinen zusaetzlichen Abrufweg (8 fraction-Wege wie vorher)",
  buildFullModel().retrievalPaths.filter((p) => /^rp-fraction-/.test(p.id)).length === 8);
check("zwei Laeufe liefern dasselbe Urteil (deterministisch)",
  JSON.stringify(pruefeFraktionsSollmenge()) === JSON.stringify(pruefeFraktionsSollmenge()));

// ============ 7 · Wahlperiodenwechsel und die drei Inaktivitaets-Riegel ============
console.log("== 7 · Wahlperiode und Inaktivitaet ==");
check("beide Bundestag-Sollmengen nennen DIESELBE Wahlperiode (kein halber Wechsel)",
  AUSSCHUSS_WAHLPERIODE === BUNDESTAG_21.wahlperiode);
check("Negativkontrolle: eine Ausnahme aus einer FREMDEN Wahlperiode wird abgelehnt", (() => {
  // Bundestag ist mit WP 21 hinterlegt: eine Ausnahme, die WP 20 behauptet, ist nicht pruefbar.
  const r = pruefeAusnahme("partei_pilot", {
    kennung: "test-alte-wp", grund: "x".repeat(50), wahlperiode: 20,
    gueltig_fuer: "Deutscher Bundestag, 20. Wahlperiode", beleg: "bundestag.de",
    voraussetzung: { pruefung: "keine_fraktion", parlament: "bundestag", wahlperiode: 20, partei: "fdp" }
  });
  return r.bestaetigt === false && /nicht pruefbar|Wahlperiode/.test(r.grundAblehnung);
})());
// Drei unabhaengige Riegel halten eine VORBEREITETE Quelle aus jedem Abruf heraus. Der Test
// prueft sie strukturell, damit ein spaeterer Umbau nicht still einen davon entfernt.
const CRAWLER = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/crawler.js"), "utf8");
const SCHEDULER = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/scheduler.js"), "utf8");
const SOURCEMODE = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/quellenarchitektur/source-mode.js"), "utf8");
check("Riegel 1: der Crawler ruft nur Quellen mit active ab",
  /sources\.filter\(\(source\) => source\.active\)/.test(CRAWLER));
check("Riegel 2: die Profilauswahl des Fallback-Pfads schliesst active === false aus",
  /if \(source\.active === false\) return false;/.test(SCHEDULER));
check("Riegel 3: der relationale Plan schliesst status 'paused' aus",
  /path\.status === "paused" \|\| path\.status === "archived"/.test(SOURCEMODE));
check("die vorbereiteten Quellen tragen BEIDE Merkmale (active:false UND preparedOnly)",
  v1Sources.filter((s) => s.regionalKlasse).every((s) => s.active === false && s.preparedOnly === true));
check("model.isPathActive haelt einen 'paused'-Weg auch bei aktivem Paket inaktiv", (() => {
  const model = require("../lib/helmut/quellenarchitektur/model");
  return model.isPathActive({ status: "paused", activation_mode: "manual" }, ["pkg-regional-niedersachsen"]) === false;
})());

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
