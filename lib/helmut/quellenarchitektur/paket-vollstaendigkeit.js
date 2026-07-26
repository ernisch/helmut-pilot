"use strict";

// Helmut — Quellenarchitektur · FACHLICHE Paketvollstaendigkeit (Phase-1-Punkt 13).
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Zugriff, kein Schreibpfad.
//
// Warum dieses Modul existiert
// ---------------------------
// Vor diesem Modul war "Paket vollstaendig" nur fuer die beiden Landes-Basispakete ueberhaupt
// pruefbar (ueber source_packages.required_classes), und selbst dort nur ueber eine
// Namenskonvention der Abrufweg-Ids — also eine Hilfsableitung, keine Systemwahrheit
// (`docs/quellenarchitektur/30-paket-inventur-production.md` §4). Fuer die vier Bundespakete
// existierte KEIN Vollstaendigkeitskriterium.
//
// Dieses Modul macht die fachliche Anforderung jedes Pakets AUSFUEHRBAR:
//   1. KLASSEN je Abrufweg — deterministisch aus den committeten Katalogmerkmalen
//      (type / neutral / regional / party / Id-Herkunft), NICHT aus einer Namensliste.
//   2. PFLICHTKLASSEN je Paket — 1:1 abgeleitet aus dem `purpose` der Paketdefinition und
//      dem Herkunftsblock in `lib/helmut/sources.js`. Keine erfundene Anforderung.
//   3. PFLICHT-HERAUSGEBERKLASSEN je Paket (evidence_role) — ein Paket, dessen Beleglage
//      ausschliesslich aus Aggregatoren besteht, ist fachlich unzureichend, auch wenn alle
//      Sachklassen besetzt sind.
//   4. VOLLZAEHLIGKEITSREGELN — "alle Ausschuesse" / "alle Fraktionen" / "alle genannten
//      Regionen" werden gezaehlt, nicht behauptet.
//   5. BEWUSST ZULAESSIGE UEBERSCHNEIDUNGEN — explizit deklariert und begruendet; jede
//      andere Mehrfachzuordnung gilt als Fehler.
//   6. NICHT ANWENDBARE Pflichtklassen — fachlich unmoegliche Klassen (z. B. eine
//      Landtagsfraktion, die es in der laufenden Wahlperiode nicht gibt) werden mit Begruendung
//      ausgewiesen und NICHT als "erledigt" verbucht. Ein Paket mit solchen Klassen bleibt
//      "teilweise vollstaendig" — kein falsches Gruen.
//
// Das Modell wird aus ZWEI Quellen vereinigt: dem Bund-Katalogmodell (`buildFullModel`) und dem
// vorbereiteten Landesmodul (`buildLandesmodulSeed`). Das ist noetig, weil `buildFullModel` fuer
// die vier `prepared`-Landespakete NULL Abrufwege kennt — dort sind sie leere Platzhalter.
// `buildFullModel` selbst bleibt unveraendert (es speist den Bund-Seed; BE/BB-Wege gehoeren
// ausschliesslich in den Landesmodul-Seed).

const { buildFullModel } = require("./index");
const { buildLandesmodulSeed } = require("./seeds/landesmodule-quellen");
const { PACKAGE_DEFINITIONS, REGION_TERMS_BY_PACKAGE } = require("./seeds/packages");
const { v1Sources } = require("../sources");

// --- 1 · Klassenvokabular ----------------------------------------------------
// Bundesklassen (Katalog) + Landesklassen (Landesmodul, dort schon als `covers` gefuehrt).
const BUND_CLASSES = [
  "parlament_bund", "regierung_bund", "bundestagsausschuesse", "bundestagsfraktionen",
  "allgemeine_bundespolitik", "leitmedien_bund", "parlamentsdokumentation",
  "fachministerium", "fachparlamentsvorgaenge", "fachmedien", "verbaende_gewerkschaften",
  "amtliche_daten", "parteiquellen_bund", "themenbuendel", "prozessquellen",
  "themenradar", "mediensignale", "regionalquellen"
];

// Der institutionelle Ausschuss-Abrufweg heisst im Katalog immer "Ausschuss <Fachgebiet>".
// Die Themen-x-Kontext-Buendel tragen denselben `type: "committee"`, heissen aber
// "<Thema> · Ausschuss …" — deshalb die Verankerung am Namensanfang statt am Typ allein.
const INSTITUTIONELLER_AUSSCHUSS = /^Ausschuss /;

// Ordnet einer Katalogquelle ihre fachlichen Klassen zu (mehrere sind moeglich und
// gewollt: "general-hib" ist allgemeine Bundespolitik UND eine Parlamentsquelle).
function catalogPathClasses(source = {}) {
  const id = String(source.id || "");
  const name = String(source.name || "");
  const type = String(source.type || "");
  const neutral = source.neutral === true;
  const regional = source.regional === true;
  const out = [];

  if (id === "dip") out.push("parlamentsdokumentation");
  if (type === "bundestag") out.push(neutral ? "parlament_bund" : "fachparlamentsvorgaenge");
  if (type === "ministry") out.push(neutral ? "regierung_bund" : "fachministerium");
  if (type === "committee" && INSTITUTIONELLER_AUSSCHUSS.test(name)) out.push("bundestagsausschuesse");
  if (type === "media" && !regional) out.push(neutral ? "leitmedien_bund" : "fachmedien");
  if (type === "association") out.push("verbaende_gewerkschaften");
  if (type === "official") out.push("amtliche_daten");
  if (type === "party" && !neutral) out.push("parteiquellen_bund");
  if (/^fraction-/.test(id)) out.push("bundestagsfraktionen");
  if (/^general-/.test(id)) out.push("allgemeine_bundespolitik");
  if (/^bundle-/.test(id)) out.push("themenbuendel");
  if (/^process-/.test(id)) out.push("prozessquellen");
  if (/^radar-/.test(id)) out.push("themenradar");
  if (/^signal-/.test(id)) out.push("mediensignale");
  if (regional) out.push("regionalquellen");

  return [...new Set(out)];
}

// --- 2 · Fachliche Anforderung je Paket --------------------------------------
// `pflichtklassen`  : Sachklassen, die besetzt sein MUESSEN (spiegeln den `purpose`).
// `pflichtrollen`   : evidence_role-Klassen der Herausgeber, die vertreten sein MUESSEN.
// `vollzaehligkeit` : benannte Vollzaehligkeitsregeln ("alle Ausschuesse" etc.).
// `nichtAnwendbar`  : fachlich unmoegliche Pflichtklassen + Begruendung (Beleg im Seed).
// `einschraenkungen`: belegte fachliche Grenzen, die das Ergebnis NICHT gruen machen duerfen.
// `belegt`          : woraus die Anforderung stammt (Doku-/Codebeleg, keine Erfindung).
//
// Herausgeberrollen kommen aus model.EVIDENCE_ROLES:
//   official_primary | direct_interest | journalistic | data_source | aggregator
const PACKAGE_REQUIREMENTS = {
  "bund-basis": {
    zweck: "Neutrale bundespolitische Grundversorgung fuer JEDES Mandat.",
    zustaendigkeit: "Bund — Parlament, Regierung, alle Ausschuesse, alle Fraktionen, Leitmedien, amtliche Parlamentsdokumentation.",
    pflichtklassen: [
      "parlament_bund", "regierung_bund", "bundestagsausschuesse", "bundestagsfraktionen",
      "allgemeine_bundespolitik", "leitmedien_bund", "parlamentsdokumentation"
    ],
    pflichtrollen: ["official_primary", "journalistic"],
    vollzaehligkeit: ["alle_institutionellen_ausschuesse", "alle_bundestagsfraktionen"],
    einschraenkungen: [
      "Kein einzelnes Bundesministerium ist neutral abgedeckt: die Regierungsebene wird ueber Bundesregierung/Bundeskabinett erfasst, Fachministerien (BMAS/BMG) haengen am Fachthemenpaket."
    ],
    belegt: "purpose der Paketdefinition + Herkunftsblock 'Neutrale Basis' in lib/helmut/sources.js"
  },
  "arbeit-und-soziales": {
    zweck: "Fachthemenpaket Arbeits- und Sozialpolitik.",
    zustaendigkeit: "Bund — Fachressort, Fachausschuss, Fachparlamentsvorgaenge, Fachmedien, Verbaende/Gewerkschaften, amtliche Daten, Prozess-/Radar-/Signal-/Buendelquellen.",
    pflichtklassen: [
      "fachministerium", "bundestagsausschuesse", "fachparlamentsvorgaenge", "fachmedien",
      "verbaende_gewerkschaften", "amtliche_daten", "prozessquellen", "themenradar",
      "themenbuendel", "mediensignale"
    ],
    pflichtrollen: ["official_primary", "direct_interest", "data_source", "journalistic"],
    vollzaehligkeit: [],
    einschraenkungen: [
      "Der Katalog unterscheidet Verbaende und Gewerkschaften nicht per Typ (beide 'association') — die Klasse wird deshalb gemeinsam gefuehrt."
    ],
    belegt: "purpose der Paketdefinition + Herkunftsbloecke 'Thematisch (sozialpolitisch)' in lib/helmut/sources.js"
  },
  "die-linke-bund": {
    zweck: "Partei-Direktquellen Die Linke (Bundesebene).",
    zustaendigkeit: "Bund — Partei und Bundestagsfraktion derselben Partei als Primaerquelle der eigenen Position.",
    pflichtklassen: ["parteiquellen_bund"],
    pflichtrollen: ["direct_interest"],
    vollzaehligkeit: [],
    einschraenkungen: [
      "In der Production-Datenbank sind 2 der 3 Abrufwege 'broken'; nur der Aggregator-Weg liefert. Die verifizierten Ersatz-URLs liegen auf main und werden erst mit der freigabepflichtigen Seed-Einspielung wirksam (Inventur A-4/P1-5)."
    ],
    belegt: "purpose der Paketdefinition + tagCoreSources(LINKE) in lib/helmut/sources.js"
  },
  "regional-niedersachsen": {
    zweck: "Regionale Beobachtung Niedersachsen (Salzgitter/Braunschweig/Wolfenbuettel).",
    zustaendigkeit: "Land/Kommune Niedersachsen — Wahlkreisregion des Mandats.",
    pflichtklassen: ["regionalquellen"],
    // Bewusst KEINE Rolle als Pflicht: die Paketrealitaet erfuellt nur 'aggregator'. Die
    // allgemeine Regel "mindestens ein Nicht-Aggregator-Weg" (unten) faengt das trotzdem —
    // deshalb bleibt das Paket 'teilweise vollstaendig' statt still gruen zu werden.
    pflichtrollen: [],
    vollzaehligkeit: ["alle_genannten_regionen"],
    einschraenkungen: [
      "Kein benannter regionaler Herausgeber: alle 4 Abrufwege sind Google-News-Themensuchen, deren Herausgeber der Aggregator ist (0 journalistische, 0 amtliche Beleglage).",
      "Thematisch gebunden: alle 4 Wege suchen ausschliesslich 'Arbeit OR Soziales OR Pflege OR Rente OR Buergergeld OR Mindestlohn OR Arbeitsmarkt'. Das Paket wird aber nach REGION zugewiesen (profile-packages §Region) — ein Mandat derselben Region mit anderem Schwerpunkt erhaelt eine thematisch fremde Regionalversorgung.",
      "Die regionalen Herausgeber der Region SIND im Katalog vorhanden (Braunschweiger Zeitung, Salzgitter Zeitung, regionalHeute, HAZ, Neue Presse, NDR), werden aber von der Kuratierung entfernt (keepCuratedSource: type 'media' erst ab priority 64, regionale Medien tragen 52–60). Das Anheben dieser Schwelle waere eine Kosten-/Laufzeitentscheidung (rund 20 zusaetzliche Google-News-Abrufe je Crawl) und damit freigabepflichtig — hier bewusst nicht getan."
    ],
    belegt: "purpose der Paketdefinition + regionalSources/stateAndConstituencySources in lib/helmut/sources.js"
  },
  "berlin-basis": {
    zweck: "Neutrales Landespaket Berlin (Pflichtversorgung jedes Berliner Landtagsmandats).",
    zustaendigkeit: "Land Berlin — Abgeordnetenhaus, Senat, Senatsverwaltungen, Fraktionen, Regionalmedien, oeffentlich-rechtliche Landesberichterstattung.",
    pflichtklassen: null, // aus required_classes der Paketdefinition (12 neutrale Klassen)
    pflichtrollen: ["official_primary", "journalistic"],
    vollzaehligkeit: [],
    einschraenkungen: [
      "Vorbereitet, nicht liefernd: alle Wege 'needs_review' + 'manual'; 0 Abrufe in Production. Aktivierung ist freigabepflichtig (Punkt 14).",
      "4 der 12 Klassen sind nur ueber geteilte Rohquellen belegt (PARDOK-XML deckt plenum/drucksachen/schriftliche_anfragen/gesetzgebung; der Google-Weg site:parlament-berlin.de deckt landesparlament und ausschuesse; der Senats-Weg deckt landesregierung und ministerien)."
    ],
    belegt: "required_classes der Paketdefinition (P0-2) + covers der Landesmodul-Abrufwege"
  },
  "brandenburg-basis": {
    zweck: "Neutrales Landespaket Brandenburg (Pflichtversorgung jedes Brandenburger Landtagsmandats).",
    zustaendigkeit: "Land Brandenburg — Landtag, Landesregierung, Staatskanzlei, Ministerien, Fraktionen, Regionalmedien, oeffentlich-rechtliche Landesberichterstattung.",
    pflichtklassen: null,
    pflichtrollen: ["official_primary", "journalistic"],
    vollzaehligkeit: [],
    einschraenkungen: [
      "Vorbereitet, nicht liefernd: alle Wege 'needs_review' + 'manual'; 0 Abrufe in Production. Aktivierung ist freigabepflichtig (Punkt 15).",
      "5 der 12 Klassen sind nur ueber geteilte Rohquellen belegt (parldok-XML deckt plenum/drucksachen/schriftliche_anfragen/gesetzgebung; der Landesregierungs-Weg deckt landesregierung und staatskanzlei)."
    ],
    belegt: "required_classes der Paketdefinition (P0-2) + covers der Landesmodul-Abrufwege"
  },
  "die-linke-berlin": {
    zweck: "Optionales Landes-Parteipaket Die Linke Berlin.",
    zustaendigkeit: "Land Berlin — Partei, Abgeordnetenhausfraktion und Mandatsperson derselben Partei.",
    pflichtklassen: null, // 3 Pilotklassen aus der Paketdefinition
    pflichtrollen: ["direct_interest"],
    vollzaehligkeit: [],
    einschraenkungen: ["Vorbereitet, nicht liefernd (wie berlin-basis)."],
    belegt: "required_classes der Paketdefinition (P0-2) + covers der Landesmodul-Abrufwege"
  },
  "die-linke-brandenburg": {
    zweck: "Optionales Landes-Parteipaket Die Linke Brandenburg.",
    zustaendigkeit: "Land Brandenburg — Partei derselben Partei; Fraktion/Person existieren in der 8. Wahlperiode nicht.",
    pflichtklassen: null,
    pflichtrollen: ["direct_interest"],
    vollzaehligkeit: [],
    // Fachlich unmoeglich, NICHT offene Arbeit: Beleg steht in seeds/landesmodule-kandidaten.js.
    nichtAnwendbar: {
      fraktion_pilot: "Die Linke hat in der 8. Wahlperiode keine Landtagsfraktion in Brandenburg (LTW 22.09.2024 unter 5 %). Ein fehlender echter Pilot wird nicht durch eine andere Partei ersetzt.",
      person_pilot: "Kein MdL der Linken in der 8. Wahlperiode; keine Ersatzperson aus einer fremden Partei."
    },
    einschraenkungen: [
      "Bleibt dauerhaft 'teilweise vollstaendig', solange die 8. Wahlperiode laeuft — das ist eine Tatsache der Wahlperiode, keine offene Aufgabe."
    ],
    belegt: "required_classes der Paketdefinition + unbesetztePilotklasse()-Begruendungen in seeds/landesmodule-kandidaten.js"
  }
};

// Bewusst zulaessige Mehrfachzuordnungen: Abrufweg-Id -> { pakete, grund }.
// Jede NICHT hier deklarierte Mehrfachzuordnung ist ein Befund.
const ZULAESSIGE_UEBERSCHNEIDUNGEN = {
  "rp-rbb24-politik": {
    pakete: ["berlin-basis", "brandenburg-basis"],
    grund: "rbb ist ein Zwei-Laender-Sender; /politik mischt Berlin und Brandenburg. EIN Abrufweg, ZWEI Paketreferenzen statt zweimal dieselbe Rohquelle crawlen (seeds/landesmodule-quellen.js Kopfkommentar)."
  },
  "rp-fraction-linke": {
    pakete: ["bund-basis", "die-linke-bund"],
    grund: "Neutrale Fraktionsabdeckung (alle 8 Fraktionen) und Parteipaket brauchen denselben Weg; ohne ihn haette die-linke-bund 0 funktionierende Wege (gemessen gegen den Production-Snapshot, seeds/packages.js)."
  },
  "rp-ausschuss-arbeit-soziales": {
    pakete: ["bund-basis", "arbeit-und-soziales"],
    grund: "Der Ausschuss fuer Arbeit und Soziales ist ein staendiger Bundestagsausschuss und gehoert damit in die neutrale Vollzaehligkeit 'alle Ausschuesse'; gleichzeitig ist er die hoechstpriorisierte Fachquelle des Themenpakets. Ohne die Doppelzuordnung faellt genau der Ausschuss aus dem Pflicht-Basispaket, in dem der Pilotmandant sitzt."
  }
};

// Allgemeine fachliche Mindestregel fuer JEDES Paket mit Abrufwegen: mindestens ein Weg muss
// von einem BENANNTEN Herausgeber kommen (evidence_role != 'aggregator'). Ein Paket, dessen
// gesamte Beleglage aus Google-News-Themensuchen besteht, hat keine eigene Primaer- oder
// journalistische Quelle — das ist unabhaengig von der Klassenabdeckung unzureichend.
const MIN_NICHT_AGGREGATOR_WEGE = 1;

// --- 3 · Vereinigtes Modell (Bund + vorbereitetes Landesmodul) ---------------
function buildCompletenessModel() {
  const bund = buildFullModel();
  const land = buildLandesmodulSeed();
  const srcById = new Map(v1Sources.map((s) => [s.id, s]));

  const publishers = new Map();
  for (const p of [...bund.publishers, ...land.publishers]) if (!publishers.has(p.id)) publishers.set(p.id, p);

  const paths = new Map();
  for (const p of bund.retrievalPaths) {
    const source = srcById.get(p.legacy_source_id) || { id: p.legacy_source_id, type: null, name: p.name };
    paths.set(p.id, { ...p, herkunft: "bund", klassen: catalogPathClasses(source) });
  }
  for (const p of land.retrievalPaths) {
    // Das Landesmodul fuehrt seine Klassen bereits selbst (`covers`) — uebernehmen, nicht neu raten.
    paths.set(p.id, { ...p, herkunft: "landesmodul", klassen: [...new Set(p.covers || [])] });
  }

  const packagePaths = [];
  const seen = new Set();
  for (const pp of [...bund.packagePaths, ...land.packagePaths]) {
    const key = `${pp.package_id}|${pp.retrieval_path_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    packagePaths.push({ package_id: pp.package_id, retrieval_path_id: pp.retrieval_path_id });
  }

  return {
    packages: PACKAGE_DEFINITIONS,
    publishers: [...publishers.values()],
    paths: [...paths.values()],
    packagePaths,
    // Ehrliche Herkunftstrennung: der Bund-Seed und der Landesmodul-Seed bleiben getrennte
    // Dateien; dieses Modell vereinigt sie NUR fuer die Vollstaendigkeitspruefung.
    herkunft: { bundWege: bund.retrievalPaths.length, landWege: land.retrievalPaths.length }
  };
}

// --- 4 · Vollzaehligkeitsregeln ---------------------------------------------
// Umlautfaltung fuer Textabgleiche (identische Regel wie seeds/packages.normRegion).
function fold(value) {
  return String(value == null ? "" : value).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\s+/g, " ").trim();
}

// Jede Regel liefert { erfuellt, soll, ist, fehlend } gegen das vereinigte Modell.
const VOLLZAEHLIGKEIT_RULES = {
  // "alle Ausschuesse": jeder institutionelle Ausschuss-Abrufweg des Katalogs muss im Paket sein.
  alle_institutionellen_ausschuesse(ctx) {
    const soll = v1Sources
      .filter((s) => s.type === "committee" && INSTITUTIONELLER_AUSSCHUSS.test(String(s.name || "")))
      .map((s) => `rp-${s.id}`);
    const fehlend = soll.filter((id) => !ctx.pathIds.has(id));
    return { regel: "alle_institutionellen_ausschuesse", soll: soll.length, ist: soll.length - fehlend.length, fehlend, erfuellt: fehlend.length === 0 };
  },
  // "alle Fraktionen": jeder fraction-*-Abrufweg des Katalogs muss im Paket sein.
  alle_bundestagsfraktionen(ctx) {
    const soll = v1Sources.filter((s) => /^fraction-/.test(String(s.id))).map((s) => `rp-${s.id}`);
    const fehlend = soll.filter((id) => !ctx.pathIds.has(id));
    return { regel: "alle_bundestagsfraktionen", soll: soll.length, ist: soll.length - fehlend.length, fehlend, erfuellt: fehlend.length === 0 };
  },
  // "alle genannten Regionen": jede Region, die Name oder purpose des Pakets ausdruecklich
  // nennt, braucht mindestens einen eigenen Abrufweg. Der Abgleich laeuft umlautgefaltet, damit
  // "Wolfenbuettel" (purpose) und "Wolfenbüttel" (Abrufwegname) derselbe Ort sind.
  alle_genannten_regionen(ctx) {
    const terms = [...new Set((REGION_TERMS_BY_PACKAGE[ctx.pkg.key] || []).map(fold))];
    const paketText = `${fold(ctx.pkg.name)} ${fold(ctx.pkg.purpose)}`;
    const genannt = terms.filter((t) => paketText.includes(t));
    const wegeText = ctx.paths.map((p) => fold(p.name));
    const fehlend = genannt.filter((t) => !wegeText.some((n) => n.includes(t)));
    return { regel: "alle_genannten_regionen", soll: genannt.length, ist: genannt.length - fehlend.length, fehlend, erfuellt: fehlend.length === 0 };
  }
};

// --- 5 · Bewertung je Paket -------------------------------------------------
function assessPackageCompleteness(model = buildCompletenessModel()) {
  const pathById = new Map(model.paths.map((p) => [p.id, p]));
  const pubById = new Map(model.publishers.map((p) => [p.id, p]));
  const pathsByPkg = new Map();
  const pkgsByPath = new Map();
  for (const pp of model.packagePaths) {
    if (!pathsByPkg.has(pp.package_id)) pathsByPkg.set(pp.package_id, []);
    pathsByPkg.get(pp.package_id).push(pp.retrieval_path_id);
    if (!pkgsByPath.has(pp.retrieval_path_id)) pkgsByPath.set(pp.retrieval_path_id, []);
    pkgsByPath.get(pp.retrieval_path_id).push(pp.package_id);
  }
  const keyById = new Map(model.packages.map((p) => [p.id, p.key]));

  const pakete = model.packages.map((pkg) => {
    const req = PACKAGE_REQUIREMENTS[pkg.key] || null;
    const ids = pathsByPkg.get(pkg.id) || [];
    const paths = ids.map((id) => pathById.get(id)).filter(Boolean);
    const verwaisteZuordnungen = ids.filter((id) => !pathById.has(id));

    const vorhandeneKlassen = [...new Set(paths.flatMap((p) => p.klassen || []))].sort();
    // Pflichtklassen: aus der Anforderung, sonst aus required_classes der Paketdefinition.
    const pflichtklassen = (req && req.pflichtklassen) || (Array.isArray(pkg.required_classes) ? pkg.required_classes.slice() : []);
    const nichtAnwendbar = (req && req.nichtAnwendbar) || {};
    const fehlendRoh = pflichtklassen.filter((k) => !vorhandeneKlassen.includes(k));
    const fehlend = fehlendRoh.filter((k) => !Object.prototype.hasOwnProperty.call(nichtAnwendbar, k));
    const unmoeglich = fehlendRoh
      .filter((k) => Object.prototype.hasOwnProperty.call(nichtAnwendbar, k))
      .map((k) => ({ klasse: k, grund: nichtAnwendbar[k] }));
    const zusaetzlich = vorhandeneKlassen.filter((k) => !pflichtklassen.includes(k));

    // Herausgeberrollen
    const rollen = {};
    for (const p of paths) {
      const rolle = (pubById.get(p.publisher_id) || {}).evidence_role || "unbekannt";
      rollen[rolle] = (rollen[rolle] || 0) + 1;
    }
    const pflichtrollen = (req && req.pflichtrollen) || [];
    const fehlendeRollen = pflichtrollen.filter((r) => !rollen[r]);
    const nichtAggregator = paths.filter((p) => ((pubById.get(p.publisher_id) || {}).evidence_role || "") !== "aggregator").length;

    // Vollzaehligkeit
    const ctx = { pkg, paths, pathIds: new Set(ids) };
    const vollzaehligkeit = ((req && req.vollzaehligkeit) || [])
      .map((name) => (VOLLZAEHLIGKEIT_RULES[name] ? VOLLZAEHLIGKEIT_RULES[name](ctx) : { regel: name, erfuellt: false, fehlend: ["regel-unbekannt"] }));

    // Ueberschneidungen
    const mehrfach = ids.filter((id) => (pkgsByPath.get(id) || []).length > 1);
    const ueberschneidungen = mehrfach.map((id) => {
      const decl = ZULAESSIGE_UEBERSCHNEIDUNGEN[id] || null;
      const beteiligte = (pkgsByPath.get(id) || []).map((pid) => keyById.get(pid) || pid).sort();
      const erlaubt = !!decl && decl.pakete.slice().sort().join("|") === beteiligte.join("|");
      return { retrieval_path_id: id, pakete: beteiligte, begruendet: erlaubt, grund: erlaubt ? decl.grund : null };
    });
    const unbegruendeteUeberschneidungen = ueberschneidungen.filter((u) => !u.begruendet);

    // Wege ohne jede Klasse -> fachlich unbeschriftet
    const wegeOhneKlasse = paths.filter((p) => !(p.klassen || []).length).map((p) => p.id);

    // Fachlich leerer Platzhalter: Pflichtklassen deklariert, aber KEIN Abrufweg.
    const leererPlatzhalter = pflichtklassen.length > 0 && paths.length === 0;
    const zuWenigBenannteHerausgeber = paths.length > 0 && nichtAggregator < MIN_NICHT_AGGREGATOR_WEGE;

    const maengel = [];
    if (leererPlatzhalter) maengel.push("kein-abrufweg");
    if (fehlend.length) maengel.push("pflichtklasse-fehlt");
    if (fehlendeRollen.length) maengel.push("herausgeberklasse-fehlt");
    if (zuWenigBenannteHerausgeber) maengel.push("nur-aggregator-beleglage");
    if (vollzaehligkeit.some((v) => !v.erfuellt)) maengel.push("vollzaehligkeit-verletzt");
    if (unbegruendeteUeberschneidungen.length) maengel.push("unbegruendete-ueberschneidung");
    if (verwaisteZuordnungen.length) maengel.push("verwaiste-zuordnung");
    if (wegeOhneKlasse.length) maengel.push("weg-ohne-klasse");
    if (!req) maengel.push("keine-fachliche-anforderung-definiert");
    if (unmoeglich.length) maengel.push("pflichtklasse-fachlich-unmoeglich");

    let ergebnis;
    if (leererPlatzhalter || !req) ergebnis = "blockiert";
    else if (maengel.length === 0) ergebnis = "vollstaendig";
    else ergebnis = "teilweise";

    return {
      key: pkg.key,
      id: pkg.id,
      status: pkg.status,
      is_base: pkg.is_base === true,
      political_level: pkg.political_level,
      geography_id: pkg.geography_id,
      aktivierungsstatus: pkg.status === "active" ? "aktiv" : "vorbereitet",
      zweck: req ? req.zweck : String(pkg.purpose || ""),
      zustaendigkeit: req ? req.zustaendigkeit : null,
      belegt: req ? req.belegt : null,
      wege: paths.length,
      wegeAktivierbar: paths.filter((p) => p.activation_mode === "auto" || p.activation_mode === "always_on").length,
      wegeVorbereitet: paths.filter((p) => p.activation_mode === "manual").length,
      pflichtklassen,
      vorhandeneKlassen,
      fehlend,
      unmoeglich,
      zusaetzlich,
      rollen,
      pflichtrollen,
      fehlendeRollen,
      nichtAggregatorWege: nichtAggregator,
      vollzaehligkeit,
      ueberschneidungen,
      unbegruendeteUeberschneidungen,
      verwaisteZuordnungen,
      wegeOhneKlasse,
      einschraenkungen: (req && req.einschraenkungen) || [],
      maengel,
      ergebnis
    };
  });

  const summary = {
    pakete: pakete.length,
    vollstaendig: pakete.filter((p) => p.ergebnis === "vollstaendig").length,
    teilweise: pakete.filter((p) => p.ergebnis === "teilweise").length,
    blockiert: pakete.filter((p) => p.ergebnis === "blockiert").length,
    wegeGesamt: model.paths.length,
    zuordnungen: model.packagePaths.length
  };

  return { pakete, summary, herkunft: model.herkunft };
}

module.exports = {
  BUND_CLASSES,
  INSTITUTIONELLER_AUSSCHUSS,
  PACKAGE_REQUIREMENTS,
  ZULAESSIGE_UEBERSCHNEIDUNGEN,
  MIN_NICHT_AGGREGATOR_WEGE,
  VOLLZAEHLIGKEIT_RULES,
  catalogPathClasses,
  buildCompletenessModel,
  assessPackageCompleteness
};
