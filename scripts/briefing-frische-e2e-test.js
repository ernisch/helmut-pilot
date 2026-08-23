"use strict";

// Helmut — Ende-zu-Ende-Abnahme des FRISCHEVERTRAGS: Contract -> API-Antwort ->
// Oberfläche. KEIN Netz, KEINE KI, KEINE Datenbank.
// =============================================================================
// Der Unit-Test (`briefing-frische-test.js`) prüft den Vertrag selbst. Hier wird
// geprüft, dass die EINE Aussage tatsächlich durch alle Schichten trägt:
//
//   1) Contract-Adapter ordnet die Vorgänge am Briefingfenster ein (neu /
//      weiterhin relevant / Hintergrund) — ohne ein Datum zu verändern.
//   2) Die API-Antwort (prepareBriefingResponse -> decorateBriefingFreshness)
//      sagt ohne belegten heutigen Lauf „Briefing noch nicht aktuell" und stuft
//      den Kopfzustand herab — sie fällt NIE auf das gestrige Briefing zurück.
//   3) Der echte Lesekontext (ladeFrischeKontext) liest den Beleg mandatsscharf
//      und übernimmt bei einem heutigen Lauf dessen Fenster.
//   4) Die echte Render-Funktion des Clients zeigt genau das an — inklusive der
//      getrennten Gruppen und der echten Datumsangaben.
//   5) Invarianten: kein KI-Aufruf, kein Netz, kein Cache-Weg am Vertrag vorbei.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const contract = require(path.join(root, "lib", "helmut", "briefingContract"));
const f = require(path.join(root, "lib", "helmut", "briefing-frische"));
const laufModul = require(path.join(root, "lib", "helmut", "briefing-lauf"));
const server = require(path.join(root, "server.js"));
const storage = require(path.join(root, "lib", "helmut", "storage"));

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- Testdaten ---------------------------------------------------------------
// Jetzt = 15.07.2026, 06:10 Berlin (Sommerzeit, also 04:10Z).
const JETZT = new Date("2026-07-15T04:10:00Z");
const HEUTE = f.berlinTagKey(JETZT);
const MANDAT = "mandat-pruef";

function ko(id, updatedAt, titel) {
  return {
    id, vorgang_id: `vg-${id}`, status: "understood", understanding_status: "complete",
    display_title: titel, display_summary: `${titel} — Sachstand.`,
    was_ist_passiert: `${titel} ist passiert.`, warum_wichtig: "Betrifft den Ausschuss.",
    why_relevant: "Betrifft den Ausschuss.", recommendation: "Linie festlegen.",
    risk_of_no_action: "Ohne Reaktion entsteht eine Lücke.", risk_level: "mittel",
    opportunity_summary: "Eigene Position sichtbar machen.", opportunity_level: "mittel",
    recommended_communication: "Kurzstatement vorbereiten.", action_items: ["Entwurf prüfen"],
    updated_at: updatedAt, created_at: updatedAt, policy_field: "Arbeit und Soziales",
    // Quellenpflicht (2026-08-22): ohne oeffnende Quelle traegt kein Vorgang den Stand.
    // Fallback-Quelle ohne Datum -> die Frische-/Datumssemantik dieses Tests bleibt unberuehrt.
    best_source_url: `https://beispiel.de/politik/${id}`, best_link_type: "direct"
  };
}
function entscheidung(id, score) {
  return { knowledge_object_id: id, score, decision: score >= 60 ? "Sofort reagieren" : "Beobachten", priority_type: "risk", risk: "Reaktionsdruck", chance: "" };
}

// Vier Vorgänge: heute früh, später Vorabend, fünf Tage alt, sehr alt.
const KOS = [
  ko("heute", "2026-07-15T03:10:00Z", "Kabinett beschliesst Eckpunkte"),
  ko("vorabend", "2026-07-14T20:40:00Z", "Ministerium legt Entwurf vor"),
  ko("aelter", "2026-07-10T09:00:00Z", "Anhoerung im Ausschuss"),
  ko("hintergrund", "2026-05-02T09:00:00Z", "Gesetz im Bundesrat")
];
const KOS_BY_ID = Object.fromEntries(KOS.map((k) => [k.id, k]));
const DECISIONS = [
  entscheidung("heute", 82), entscheidung("vorabend", 74),
  entscheidung("aelter", 66), entscheidung("hintergrund", 62)
];

const FENSTER = f.frischeFenster({ jetzt: JETZT }); // Vorabend-Standard: 14.07. 16:00 Berlin

function baueBriefing({ fenster = FENSTER } = {}) {
  return contract.toBriefingContractV3({
    profile: { id: MANDAT, name: "Testmandat", committee: "Ausschuss für Arbeit und Soziales", focusTopics: ["Arbeit"] },
    decisions: DECISIONS, kosById: KOS_BY_ID, sourcesByVorgang: {}, now: JETZT,
    briefingType: "morning", knowledgeObjects: KOS, frischeFenster: fenster
  });
}

// =============================================================================
// 1) Contract-Adapter: Einordnung am Fenster, Datum unangetastet
// =============================================================================
const briefing = baueBriefing();
const state = briefing.currentHelmutState;
check("1a Contract liefert einen Stand", Boolean(state && state.primaryItem), JSON.stringify(briefing.reason));
const alleItems = [state.primaryItem, ...(state.items || [])];
const klasseVon = (id) => (alleItems.find((i) => i && i.id === `vg-${id}`) || {}).frischeKlasse;
check("1b Heutiger Vorgang ist 'neu'", klasseVon("heute") === f.KLASSE_NEU, String(klasseVon("heute")));
check("1c Spaeter Vorabend ist 'neu' (Punkt 3)", klasseVon("vorabend") === f.KLASSE_NEU, String(klasseVon("vorabend")));
check("1d Fuenf Tage alter Vorgang ist 'weiterhin relevant' (Punkt 4)", klasseVon("aelter") === f.KLASSE_WEITERHIN, String(klasseVon("aelter")));
check("1e Sehr alter Vorgang ist 'Hintergrund' (Punkt 4)", klasseVon("hintergrund") === f.KLASSE_HINTERGRUND, String(klasseVon("hintergrund")));
check("1f Kein Datum wurde veraendert",
  alleItems.find((i) => i.id === "vg-vorabend").lastUpdated === "2026-07-14T20:40:00Z");
check("1g Vorabendmeldung traegt ihr echtes Datum als Label",
  /^Gestern, /.test((alleItems.find((i) => i.id === "vg-vorabend") || {}).zeitLabel || ""));
check("1h Kennzahlen im Stand", state.frische && state.frische.kennzahlen.neu === 2, JSON.stringify(state.frische && state.frische.kennzahlen));

// Ohne Fenster bleibt das Altverhalten unveraendert (Rueckwaertsvertraeglichkeit).
const ohneFenster = baueBriefing({ fenster: null });
check("1i Ohne Fenster keine Frischeklassen (Altverhalten)",
  ohneFenster.currentHelmutState.frische === null
  && !ohneFenster.currentHelmutState.primaryItem.frischeKlasse);

// Der Vorabend-Vorgang darf mit Fenster NICHT als 'stale' den Kopf herabstufen —
// ohne Fenster (reiner Kalendertag) waere er es. Gegenprobe mit Primary=Vorabend.
const nurVorabend = contract.toBriefingContractV3({
  profile: { id: MANDAT }, decisions: [entscheidung("vorabend", 90)],
  kosById: { vorabend: KOS_BY_ID.vorabend }, sourcesByVorgang: {}, now: JETZT,
  briefingType: "morning", knowledgeObjects: [KOS_BY_ID.vorabend], frischeFenster: FENSTER
});
const nurVorabendOhne = contract.toBriefingContractV3({
  profile: { id: MANDAT }, decisions: [entscheidung("vorabend", 90)],
  kosById: { vorabend: KOS_BY_ID.vorabend }, sourcesByVorgang: {}, now: JETZT,
  briefingType: "morning", knowledgeObjects: [KOS_BY_ID.vorabend]
});
check("1j Mit Fenster: Vorabendmeldung ist im Morgenbriefing frisch",
  nurVorabend.currentHelmutState.status !== "stale", nurVorabend.currentHelmutState.status);
check("1k Ohne Fenster: derselbe Vorgang war 'stale' (Altverhalten belegt)",
  nurVorabendOhne.currentHelmutState.status === "stale", nurVorabendOhne.currentHelmutState.status);

// =============================================================================
// 2) API-Antwort: der Vertrag entscheidet über die Kopfaussage
// =============================================================================
const erfolgsLauf = laufModul.quittung({
  tenantId: MANDAT, berlinTag: HEUTE, status: laufModul.STATUS_ERFOLG,
  ausloeser: laufModul.AUSLOESER_MORGENLAUF, erzeugtAm: new Date("2026-07-15T04:00:00Z"),
  fensterStart: FENSTER.start, signatur: "sig"
});
const kontext = (over = {}) => ({
  jetzt: JETZT, berlinTag: HEUTE, lauf: erfolgsLauf, fenster: FENSTER,
  datenstand: "2026-07-15T03:10:00Z", speicherFehler: null, ...over
});

const antwortOk = server.__prepareBriefingResponse(baueBriefing(), { frischeKontext: kontext() });
check("2a Belegter heutiger Lauf + frische Daten -> 'Aktuell'", antwortOk.status === "Aktuell", antwortOk.status);
check("2b Vertrag liegt maschinenlesbar in der Antwort", antwortOk.freshness.vertrag.aktuell === true);
check("2c Kopfzustand bleibt unveraendert", antwortOk.currentHelmutState.status === "fresh", antwortOk.currentHelmutState.status);

const faelle = [
  ["kein Lauf", kontext({ lauf: null }), f.GRUND.LAUF_FEHLT],
  ["gestriger Lauf", kontext({ lauf: { ...erfolgsLauf, berlinTag: "2026-07-14" } }), f.GRUND.LAUF_VERALTET],
  ["fehlgeschlagener Lauf", kontext({ lauf: { ...erfolgsLauf, status: "fehler" } }), f.GRUND.LAUF_FEHLGESCHLAGEN],
  ["zu alte Daten", kontext({ datenstand: "2026-07-12T03:00:00Z" }), f.GRUND.DATEN_VERALTET],
  ["Datenstand unbekannt", kontext({ datenstand: null }), f.GRUND.DATENSTAND_UNBEKANNT]
];
for (const [name, ctx, grund] of faelle) {
  const a = server.__prepareBriefingResponse(baueBriefing(), { frischeKontext: ctx });
  check(`2d ${name} -> "Briefing noch nicht aktuell"`, a.status === "Briefing noch nicht aktuell", a.status);
  check(`2e ${name} -> Grund ${grund}`, a.freshness.vertrag.grund === grund, a.freshness.vertrag.grund);
  check(`2f ${name} -> Kopfzustand herabgestuft (kein Rueckfall auf gestern)`,
    a.currentHelmutState.status === "stale" && a.currentHelmutState.staleState === true, a.currentHelmutState.status);
  check(`2g ${name} -> isStale in der Antwort`, a.freshness.isStale === true);
}

// Der Vertrag stuft nur HERAB: ein leerer Stand wird durch ihn nicht "aktuell".
const leeresBriefing = contract.toBriefingContractV3({
  profile: { id: MANDAT }, decisions: [], kosById: {}, sourcesByVorgang: {},
  now: JETZT, reason: "keine-vorgaenge", briefingType: "morning", frischeFenster: FENSTER
});
const antwortLeer = server.__prepareBriefingResponse(leeresBriefing, { frischeKontext: kontext() });
check("2h Leerer Stand wird durch den Vertrag NICHT zu 'Aktuell'",
  antwortLeer.status !== "Aktuell", antwortLeer.status);

// Ohne Kontext (Not-Aus/kein Mandat) bleibt das bisherige Verhalten erhalten.
const antwortOhne = server.__prepareBriefingResponse(baueBriefing(), {});
check("2i Ohne Frischekontext unveraendertes Altverhalten",
  antwortOhne.freshness.vertrag === null && ["Aktuell", "Veraltet", "Keine neue Entscheidung"].includes(antwortOhne.status),
  antwortOhne.status);

// Teilausfall von Quellen: aktuell, aber ehrlich benannt.
const antwortTeil = server.__prepareBriefingResponse(baueBriefing(), {
  frischeKontext: kontext({ lauf: { ...erfolgsLauf, quellen: { geprueft: 40, fehlgeschlagen: 6 } } })
});
check("2j Teilausfall bleibt aktuell und wird benannt",
  antwortTeil.status === "Aktuell" && /6 von 40/.test(antwortTeil.freshness.vertrag.quellen.hinweis || ""));

// Kompakte Antwort (App-Start) traegt denselben Vertrag.
const kompakt = server.__prepareBriefingResponse(baueBriefing(), { compact: true, frischeKontext: kontext({ lauf: null }) });
check("2k Kompakte Antwort traegt denselben Vertrag",
  kompakt.status === "Briefing noch nicht aktuell" && kompakt.freshness.vertrag.grund === f.GRUND.LAUF_FEHLT
  && kompakt.currentHelmutState.frischeVertrag.aktuell === false);

// =============================================================================
// 3) Echter Lesekontext (mandatsscharf, ohne Netz)
// =============================================================================
(async () => {
  const zeilen = new Map();
  const origGet = storage.getRenderedBriefingV3;
  const origSave = storage.saveRenderedBriefingV3;
  storage.getRenderedBriefingV3 = async (userId, slot, day) => zeilen.get(`bf-${userId}-${slot}-${day}`) || null;
  storage.saveRenderedBriefingV3 = async (entry) => { zeilen.set(entry.id, { ...entry }); return { saved: true, id: entry.id }; };
  try {
    const ohneBeleg = await server.__ladeFrischeKontext(MANDAT, JETZT);
    check("3a Ohne Beleg: kein Lauf im Lesekontext", ohneBeleg && ohneBeleg.lauf === null);
    check("3b Ohne Beleg: Vorabend-Standardfenster",
      ohneBeleg.fenster.quelle === "vorabend-standard" && ohneBeleg.fenster.start === FENSTER.start);

    // Gestriger Erfolg -> Fenster beginnt dort.
    await laufModul.schreibeQuittung(storage, laufModul.quittung({
      tenantId: MANDAT, berlinTag: "2026-07-14", status: laufModul.STATUS_ERFOLG,
      erzeugtAm: new Date("2026-07-14T04:00:00Z"), signatur: "gestern"
    }));
    const mitGestern = await server.__ladeFrischeKontext(MANDAT, JETZT);
    check("3c Fenster beginnt beim gestrigen Erfolg",
      mitGestern.fenster.quelle === "letzter-lauf" && mitGestern.fenster.start === "2026-07-14T04:00:00.000Z",
      JSON.stringify(mitGestern.fenster));
    check("3d Ein gestriger Erfolg ist KEIN heutiger Beleg", mitGestern.lauf === null);

    // Heutiger Erfolg -> Beleg vorhanden, Fenster aus der Quittung.
    await laufModul.schreibeQuittung(storage, laufModul.quittung({
      tenantId: MANDAT, berlinTag: HEUTE, status: laufModul.STATUS_ERFOLG,
      erzeugtAm: new Date("2026-07-15T04:00:00Z"), fensterStart: "2026-07-14T04:00:00.000Z", signatur: "heute"
    }));
    const mitHeute = await server.__ladeFrischeKontext(MANDAT, JETZT);
    check("3e Heutiger Beleg wird gelesen", mitHeute.lauf && mitHeute.lauf.status === "erfolg");
    check("3f Fenster stammt aus der Quittung (stabil ueber den Tag)",
      mitHeute.fenster.quelle === "lauf-quittung" && mitHeute.fenster.start === "2026-07-14T04:00:00.000Z");

    // Mandantentrennung: der Beleg eines anderen Mandats zaehlt nicht.
    const fremd = await server.__ladeFrischeKontext("anderes-mandat", JETZT);
    check("3g Beleg eines fremden Mandats zaehlt nicht", fremd.lauf === null);

    // Fehlversuch ohne Erfolg wird ehrlich gemeldet.
    zeilen.clear();
    await laufModul.schreibeQuittung(storage, laufModul.quittung({
      tenantId: MANDAT, berlinTag: HEUTE, status: laufModul.STATUS_FEHLER, grund: "build-timeout"
    }));
    const mitFehler = await server.__ladeFrischeKontext(MANDAT, JETZT);
    check("3h Fehlversuch erscheint als fehlgeschlagener Lauf",
      mitFehler.lauf && mitFehler.lauf.status === "fehler");
    const antwortFehler = server.__prepareBriefingResponse(baueBriefing(), { frischeKontext: { ...mitFehler, jetzt: JETZT, datenstand: "2026-07-15T03:10:00Z" } });
    check("3i Fehlgeschlagener Lauf -> ehrliche Ansage",
      antwortFehler.status === "Briefing noch nicht aktuell");
  } finally {
    storage.getRenderedBriefingV3 = origGet;
    storage.saveRenderedBriefingV3 = origSave;
  }

  // ===========================================================================
  // 4) Oberfläche: die echte Render-Funktion des Clients
  // ===========================================================================
  const api = loadClient();
  check("4a client.js laedt im vm", Boolean(api && api.render));

  api.setBriefing(server.__prepareBriefingResponse(baueBriefing(), { frischeKontext: kontext() }));
  const htmlOk = api.render();
  check("4b Aktueller Stand: kein Warnhinweis im Kopf", !htmlOk.includes("Briefing noch nicht aktuell"));
  check("4c Gruppe 'Neu seit dem letzten Briefing' wird gezeigt", htmlOk.includes("Neu seit dem letzten Briefing"));
  check("4d Aeltere Vorgaenge stehen getrennt darunter",
    htmlOk.includes("Weiterhin relevant") && htmlOk.includes("Hintergrund"));
  check("4e Vorabendmeldung traegt ihr echtes Datum ('Gestern')", /Gestern, \d{2}:\d{2}/.test(htmlOk));
  check("4f Gruppen sind maschinenlesbar ausgezeichnet",
    htmlOk.includes('data-frische-klasse="neu"') && htmlOk.includes('data-frische-klasse="hintergrund"'));

  api.setBriefing(server.__prepareBriefingResponse(baueBriefing(), { frischeKontext: kontext({ lauf: null }) }));
  const htmlOffen = api.render();
  check("4g Ohne heutigen Lauf steht die ehrliche Ansage im Kopf", htmlOffen.includes("Briefing noch nicht aktuell"));
  check("4h Der Grund wird genannt", htmlOffen.includes("Für heute liegt noch kein erzeugtes Morgenbriefing vor"));
  check("4i Es wird ausdruecklich kein Vortagsbriefing behauptet",
    htmlOffen.includes("kein Briefing vom Vortag"));
  check("4j Kopf zeigt nicht 'Morgenbriefing' als heutigen Stand", htmlOffen.includes("Letzter Stand"));
  check("4k Kein 'Aktuell'-Chip bei fehlendem Lauf",
    !/hstand-status hstand-status--ok">Aktuell/.test(htmlOffen));

  // Ruhelage: heutiger Lauf, aber keine neue Meldung.
  const ruheFenster = f.frischeFenster({ jetzt: JETZT, letzterErfolgAt: "2026-07-15T03:30:00Z" });
  const ruheBriefing = baueBriefing({ fenster: ruheFenster });
  api.setBriefing(server.__prepareBriefingResponse(ruheBriefing, {
    frischeKontext: kontext({ fenster: ruheFenster, lauf: { ...erfolgsLauf, fensterStart: ruheFenster.start } })
  }));
  const htmlRuhe = api.render();
  check("4l Ruhelage wird ehrlich benannt", htmlRuhe.includes("keine neue Meldung"));
  check("4m Ruhelage zeigt keine 'neu'-Gruppe", !htmlRuhe.includes('data-frische-klasse="neu"'));

  // ===========================================================================
  // 5) Invarianten
  // ===========================================================================
  const frischeQuelle = fs.readFileSync(path.join(root, "lib", "helmut", "briefing-frische.js"), "utf8");
  const laufQuelle = fs.readFileSync(path.join(root, "lib", "helmut", "briefing-lauf.js"), "utf8");
  check("5a Frischevertrag ohne Netz/KI",
    !/require\(["']\.\/ai|fetch\(|https?:\/\/|openai|azure/i.test(frischeQuelle));
  check("5b Lauf-Quittung ohne Netz/KI",
    !/require\(["']\.\/ai|fetch\(|openai|azure/i.test(laufQuelle));
  check("5c Lauf-Quittung schreibt nur ueber den mandantengefilterten Speicherweg",
    /saveRenderedBriefingV3/.test(laufQuelle) && !/supabaseRequest|service_role/.test(laufQuelle));
  const serverQuelle = fs.readFileSync(path.join(root, "server.js"), "utf8");
  check("5d Der Lesepfad erzeugt KEINE Quittung (kein stiller Selbstbeleg)",
    !/ladeFrischeKontext[\s\S]{0,2000}?schreibeQuittung/.test(serverQuelle));
  check("5e Briefing-Antworten sind unspeicherbar (no-store)",
    /function jsonHeaders[\s\S]{0,200}"Cache-Control": "no-store"/.test(serverQuelle));
  const lageQuelle = fs.readFileSync(path.join(root, "lib", "helmut", "lage.js"), "utf8");
  check("5f Der Narrativ-Cache nutzt denselben Berliner Tagesbegriff",
    /frischevertrag\.berlinTagKey/.test(lageQuelle) && /bf-\$\{userId\}-\$\{CACHE_SLOT\}-\$\{day\}/.test(lageQuelle));
  const clientQuelle = fs.readFileSync(path.join(root, "client.js"), "utf8");
  check("5g Der Client rechnet Zeiten in Europe/Berlin",
    /function hstandWhen[\s\S]{0,400}timeZone: "Europe\/Berlin"/.test(clientQuelle));
  check("5h Der Client hat keinen eigenen Frischebegriff neben dem Vertrag",
    /state && state\.frischeVertrag/.test(clientQuelle));

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  if (failed > 0) process.exit(1);
})();

// --- client.js im vm laden (Browser-Globals gestubbt, Auto-Boot entfernt) ----
function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__frischeTest = {
    render: () => renderHelmutStandView(),
    setBriefing: (b) => { briefing = b; }
  };`;
  const noop = () => {};
  const fakeNode = () => ({
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    style: {}, dataset: {}, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    focus: noop, blur: noop, click: noop, closest: () => null, contains: () => false,
    insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null
  });
  const store = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const doc = {
    querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
    createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(),
    body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop,
    cookie: "", visibilityState: "visible", hidden: false
  };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    document: doc, navigator: { userAgent: "node-test", language: "de-DE" },
    localStorage: store, sessionStorage: store,
    location: { search: "", href: "http://localhost/", pathname: "/", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    fetch: () => { throw new Error("fetch-should-not-be-called-during-render"); }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  return sandbox.__frischeTest;
}
