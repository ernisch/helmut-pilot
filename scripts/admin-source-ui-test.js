"use strict";

// Render-Test des Admin-Bereichs "Quellen & Watchdog" (Neuaufbau 2026-07).
// Fuehrt renderAdmQuellen aus client.js im vm aus (Browser-Stubs, kein Netz).
//
// Geprueft:
//  - Ehrlichkeit: ohne relationale Tabellen (verfuegbar:false) KEINE erfundenen
//    Kennzahlen, sondern der Hinweis des Servers
//  - Statuszaehler mit verstaendlichen Text-Labels (gesund/defekt/... nicht nur Farbe)
//  - Problematische Abrufwege: Herausgeber, Methode, Fehlerserie, letzter Erfolg,
//    konkrete Handlungsempfehlung
//  - Klumpenrisiko (Google-News-Anteil) inkl. Quelle der Zahl
//  - Watchdog-Zustand aus den Workflow-Dateien (aktiv vs. nur manuell)
//  - Punkt 16: automatisch erkannte Quellenstoerungen (Zustand, Problem seit,
//    letzte Lieferung, Paket-/Mandatswirkung, Handlungsstufe, offengelegte
//    Schwellen) und der ehrliche Leerzustand ohne Telemetrie

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__srcTest = {
    render: () => renderAdmQuellen(),
    setUser: (u) => { currentUser = u; },
    setData: (key, payload) => { admData[key] = payload; },
    clearData: () => { admData = {}; admErrors = {}; }
  };`;
  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {}, addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop, getAttribute: () => null, focus: noop, closest: () => null, set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "" });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    document: { querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(), createElement: () => fakeNode(), body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop, cookie: "", visibilityState: "visible" },
    navigator: { userAgent: "node-test", language: "de-DE" },
    localStorage: storage, sessionStorage: storage,
    location: { search: "", href: "http://localhost/", pathname: "/", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    fetch: () => { throw new Error("fetch-should-not-be-called-during-render"); }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  return sandbox.__srcTest;
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

const api = loadClient();
check("client.js laedt im vm", Boolean(api && api.render));
api.setUser({ id: "admin1", role: "admin" });

// A) Nicht verfuegbar (lokales Backend): Hinweis statt erfundener Zahlen.
api.clearData();
api.setData("sources", { generatedAt: new Date().toISOString(), verfuegbar: false, hinweis: "Relationale Quellen-Tabellen nicht erreichbar (Supabase-Backend erforderlich) — keine erfundenen Kennzahlen.", statusCounts: null, zaehler: null, problematischeWege: null, herausgeber: null, googleNews: null, letzterShadowLauf: null, watchdog: { briefingWatchdog: { verfuegbar: true, aktiv: true, zeitplanUtc: "30 5 * * *", quelle: ".github/workflows/briefing-watchdog.yml" }, healthWatch: { verfuegbar: true, aktiv: false, zeitplanUtc: null, quelle: ".github/workflows/health-watch.yml" } } });
const offView = api.render();
check("A1 Ohne relationale Tabellen: Server-Hinweis sichtbar", offView.includes("keine erfundenen Kennzahlen"));
check("A2 Keine erfundenen Statuszahlen", !/adm-tile-value">\d/.test(offView));
check("A3 Zustand 'unbekannt' statt gruen", offView.includes("unbekannt"));

// B) Voll verfuegbar.
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
api.clearData();
api.setData("sources", {
  generatedAt: new Date().toISOString(),
  verfuegbar: true,
  hinweis: null,
  statusCounts: { healthy: 64, degraded: 9, broken: 3, needs_review: 6, paused: 1, archived: 2 },
  zaehler: { herausgeber: 38, abrufwege: 85, pakete: 11, paketPfade: 146 },
  problematischeWege: [
    { id: "p1", name: "Ministerium X HTML", herausgeber: "Ministerium X", methode: "html", status: "broken", fehlerserie: 11, letzterErfolg: minsAgo(60 * 24 * 9), letzterFehler: "http-404", kritisch: true },
    // Wie in Production beobachtet: als 'broken' konfiguriert, aber OHNE Abruf-Verlauf
    // (Fehlerserie 0, kein letzter Erfolg/Fehler) — darf NICHT "liefert nicht mehr" sagen.
    { id: "p0", name: "Bundestag (Config)", herausgeber: "Deutscher Bundestag", methode: "rss", status: "broken", fehlerserie: 0, letzterErfolg: null, letzterFehler: null, kritisch: true },
    { id: "p2", name: "Bundestag RSS", herausgeber: "Bundestag", methode: "rss", status: "degraded", fehlerserie: 3, letzterErfolg: minsAgo(60 * 5), letzterFehler: null, kritisch: false }
  ],
  herausgeber: [
    { id: "h1", name: "Ministerium X", typ: "ministry", vertrauen: "hoch", wege: [{ id: "p1", name: "Ministerium X HTML", methode: "html", status: "broken", fehlerserie: 11, letzterErfolg: minsAgo(60 * 24 * 9) }], schlechtesterStatusRang: 5 },
    { id: "h2", name: "ARD", typ: "media", vertrauen: "hoch", wege: [{ id: "p3", name: "ARD Tagesschau", methode: "rss", status: "healthy", fehlerserie: 0, letzterErfolg: minsAgo(30) }], schlechtesterStatusRang: 0 }
  ],
  googleNews: { laeufe: 12, googleChecked: 400, googleOk: 350, googleFailed: 50, directChecked: 500, directOk: 480, directFailed: 20, anteilOkProzent: 42 },
  letzterShadowLauf: { savedAt: minsAgo(60 * 20), modus: "shadow", abdeckungDokumenteProzent: 96 },
  watchdog: {
    briefingWatchdog: { verfuegbar: true, aktiv: true, zeitplanUtc: "30 5 * * *", quelle: ".github/workflows/briefing-watchdog.yml" },
    healthWatch: { verfuegbar: true, aktiv: false, zeitplanUtc: null, quelle: ".github/workflows/health-watch.yml" }
  }
});
api.setData("crawl", { recentRawItemCount: 3910 });
api.setData("crawlReport", { failedSources: 8, checkedSources: 94 });
const view = api.render();
check("B1 Status-Labels als Text (gesund/beeintraechtigt/defekt/pruefen)", view.includes("gesund") && view.includes("defekt") && view.includes("Prüfen (needs_review)") && view.includes("Beeinträchtigt (degraded)"));
check("B2 Zustandskopf nennt Zaehler", view.includes("64 gesund"));
check("B3 Handlungsbedarf: defekte Wege benannt", view.includes("Abrufwege defekt"));
check("B4 Architektur-Zaehler (Herausgeber/Wege/Pakete/Zuordnungen)", view.includes("38") && view.includes("85") && view.includes("146"));
check("B5 Problematische Wege: Herausgeber + Methode + Fehlerserie", view.includes("Ministerium X") && view.includes("html") && view.includes("11"));
check("B6 Konkrete Handlungsempfehlung je Weg (mit Beleg -> 'liefert nicht mehr')", view.includes("Reparieren oder ersetzen — liefert nicht mehr."));
check("B6b Ehrlich: broken OHNE Abruf-Verlauf sagt NICHT 'liefert nicht mehr', sondern 'ohne Abruf-Verlauf'", view.includes("ohne Abruf-Verlauf — Konfiguration/Aktivierung prüfen"));
check("B6c Kontext-Notiz: Status stammt aus der Quellen-Architektur (kann vom Crawl abweichen)", view.includes("Quellen-Architektur") && view.includes("aktive Crawl kann davon abweichen"));
check("B7 Google-News-Anteil mit Quelle der Zahl", view.includes("42 %") && view.includes("Crawl-Läufen"));
check("B8 Shadow-Messlauf mit Abdeckung", view.includes("Abdeckung 96"));
check("B9 Watchdog aktiv mit UTC-Zeitplan", view.includes("30 5 * * *") && view.includes("aktiv"));
check("B10 Health-Watch ehrlich 'nur manuell'", view.includes("nur manuell"));
check("B11 Herkunft der Zahlen benannt (source_crawl_telemetry)", view.includes("source_crawl_telemetry"));
check("B12 Fehlerquote letzter Lauf berechnet (9 %)", view.includes("9 %"));
check("B13 Herausgeber-Detail aufklappbar", view.includes("adm-pub-sum"));
check("B14 Kein Kosten-/Tokenwert im Quellen-Bereich", !/USD|Tokens/.test(view));
// Ohne Störungsblock (Server liefert stoerungen:null) bleibt die Alt-Ansicht heil.
check("B15 Ohne Stoerungsblock rendert die Ansicht unveraendert", !view.includes("Störungen mit Auswirkung") && !view.includes("Erkannte Quellenstörungen") && !view.includes("Handlungsbedarf"));

// C) Punkt 16 — automatisch erkannte Quellenstoerungen.
api.clearData();
api.setUser({ id: "admin1", role: "admin" });
const basis = {
  generatedAt: new Date().toISOString(), verfuegbar: true, hinweis: null,
  statusCounts: { healthy: 4, degraded: 0, broken: 0, needs_review: 155, paused: 0, archived: 0 },
  zaehler: { herausgeber: 38, abrufwege: 163, pakete: 9, paketPfade: 165 },
  problematischeWege: [], herausgeber: [], googleNews: null, letzterShadowLauf: null,
  watchdog: { briefingWatchdog: { verfuegbar: true, aktiv: true, zeitplanUtc: "30 5 * * *" }, healthWatch: { verfuegbar: true, aktiv: false, zeitplanUtc: null } }
};
api.setData("sources", {
  ...basis,
  stoerungen: {
    verfuegbar: true, hinweis: null, fensterTage: 14,
    zaehler: { ok: 120, erholt: 4, leer: 2, veraltet: 1, blockiert: 1, inaktiv: 8, manuell: 18, unbekannt: 9 },
    stufen: { keine: 150, beobachten: 3, zeitnah_pruefen: 1, akut: 1 },
    summe: { quellen: 163, gestoert: 5, akut: 1, zeitnah: 1, beobachten: 3, erholt: 4, mandatswirkungBestimmbar: true },
    schwellen: { fensterTage: 14, fehlerAbLaeufen: 2, leerAbLaeufen: 3, instabilAbEpisoden: 2, veraltetTage: 14, langsamMs: 8000 },
    gestoerte: [
      { quelle: "s-akut", name: "Amtsblatt Beispiel", methode: "rss", klasse: "blockiert", kurz: "Abruf wird begrenzt",
        erklaerung: "3 Läufe in Folge fehlgeschlagen. Der Anbieter begrenzt die Abrufe (HTTP 429).",
        ursache: "http-429", ursacheText: "Der Anbieter begrenzt die Abrufe (HTTP 429).",
        stufe: "akut", stufeText: "Akut prüfen", kritisch: true, imKatalog: true, laufzeitquelle: false,
        problemSeit: minsAgo(60 * 30), letzterErfolg: minsAgo(60 * 34), letzteLieferung: minsAgo(60 * 34), wiederholungen: 3,
        laufdaten: { laeufe: 20, versuche: 18, erfolge: 15, lieferungen: 15, fehler: 3, leerlaeufe: 0, gedrosselt: 2, uebersprungen: 0, fehlerserie: 3, leerserie: 0, episoden: 1, dokumente: 42, medianDauerMs: 620 },
        wirkung: { art: "paket_ohne_funktionierenden_weg", pakete: [{ key: "bund-basis", isBase: true, versorgung: "ohne_funktionierenden_weg", wege: 1, wirksam: 0, gestoert: 1 }], alternativenVorhanden: false, alternativen: [], mandate: { bestimmbar: true, betroffene: ["mandat-1", "mandat-2"], grund: null, strukturhinweis: null } },
        signatur: "blockiert|http-429|akut|bund-basis" },
      { quelle: "s-leer", name: "Themensuche Beispiel", methode: "googlenews_search", klasse: "leer", kurz: "Liefert keine Inhalte",
        erklaerung: "Seit 24 geplanten Läufen antwortet die Quelle technisch einwandfrei, hat aber noch nie Inhalte geliefert.",
        ursache: null, ursacheText: null, stufe: "beobachten", stufeText: "Beobachten", kritisch: false, imKatalog: false, laufzeitquelle: true,
        problemSeit: minsAgo(60 * 200), letzterErfolg: minsAgo(30), letzteLieferung: null, wiederholungen: 24,
        laufdaten: { laeufe: 24, versuche: 24, erfolge: 24, lieferungen: 0, fehler: 0, leerlaeufe: 24, gedrosselt: 0, uebersprungen: 0, fehlerserie: 0, leerserie: 24, episoden: 0, dokumente: 0, medianDauerMs: 480 },
        wirkung: { art: "kein_paket", pakete: [], alternativenVorhanden: false, alternativen: [], mandate: { bestimmbar: true, betroffene: [], grund: null, strukturhinweis: null } },
        signatur: "leer||beobachten|" }
    ],
    handlungsbedarf: [],
    paketLage: [{ id: "pkg-b", key: "bund-basis", name: "Bund Basis", isBase: true, versorgung: "ohne_funktionierenden_weg", wege: 1, wirksam: 0, gestoert: 1, inaktiv: 0, unbekannt: 0 }]
  }
});
api.setData("crawl", { recentRawItemCount: 3910 });
api.setData("crawlReport", { failedSources: 8, checkedSources: 94 });
const stView = api.render();
check("C1 Störungsblock erscheint", stView.includes("Erkannte Quellenstörungen"));
check("C2 Zustand als verständlicher Text (nicht nur Farbe)", stView.includes("vom Anbieter begrenzt") && stView.includes("liefert keine Inhalte"));
check("C3 Handlungsstufe im Klartext", stView.includes("akut handeln") && stView.includes("beobachten"));
check("C4 'Problem seit' und Wiederholungen sichtbar", stView.includes("3× in Folge") && stView.includes("24× in Folge"));
check("C5 Letzte Lieferung getrennt vom letzten Erfolg", stView.includes("letzter Erfolg:"));
check("C6 Noch nie geliefert wird ausdrücklich benannt", stView.includes("noch nie geliefert"));
check("C7 Paketwirkung im Klartext", stView.includes("Kein funktionierender Abrufweg mehr für bund-basis"));
check("C8 Mandatswirkung im Klartext", stView.includes("2 Mandate potenziell betroffen"));
check("C9 Quelle ohne Paket sagt das ehrlich", stView.includes("Betrifft kein aktives Quellenpaket"));
check("C10 Laufzeitquelle aus dem Profil markiert", stView.includes("Laufzeitquelle aus dem Profil"));
check("C11 Pflichtquelle markiert", stView.includes("Pflichtquelle"));
check("C12 Schwellenwerte werden offengelegt", stView.includes("ab 2 Fehlläufen in Folge akut") && stView.includes("langsam ab 8.000 ms"));
check("C13 Drosselung/Übersprungen ausdrücklich als Nicht-Fehler erklärt", stView.includes("zählen bewusst"));
check("C14 Betroffene Paketlage als eigene Karte", stView.includes("Betroffene Quellenpakete") && stView.includes("kein funktionierender Abrufweg"));
check("C15 Ampel kippt auf 'Eingriff nötig' durch beobachtete Lage", stView.includes("brauchen akutes Handeln (beobachtet)"));
check("C16 Erholung als eigener Zähler sichtbar", stView.includes("Wieder erreichbar"));
check("C17 Kein Kosten-/Tokenwert im Störungsblock", !/USD|Tokens/.test(stView));

// D) Telemetrie fehlt -> ehrlicher Leerzustand, KEIN falsches Grün.
api.clearData();
api.setUser({ id: "admin1", role: "admin" });
api.setData("sources", { ...basis, stoerungen: { verfuegbar: false, hinweis: "Keine Quellen-Telemetrie im Bewertungsfenster (source_crawl_telemetry leer oder Schreibpfad aus) — es wird keine Quellenstörung behauptet." } });
const leerView = api.render();
check("D1 Ohne Telemetrie: ehrlicher Hinweis statt erfundener Zahlen", leerView.includes("es wird keine Quellenstörung behauptet"));
check("D2 Ohne Telemetrie: keine Störungstabelle", !leerView.includes("Störungen mit Auswirkung"));

// E) Punkt 18: Paket-Inventur im Admin-Bereich.
// Die Inventur ist die Antwort auf „funktioniert die politische Versorgung eines
// Mandats?" — sie muss je Paket EINEN Zustand zeigen, leere/ausgefallene Pakete
// sichtbar lassen und eine veraltete Datengrundlage als solche kennzeichnen.
api.clearData();
api.setUser({ id: "admin1", role: "admin" });
api.setData("sources", {
  ...basis,
  paketInventur: {
    erhobenAm: "2026-07-27T06:00:00.000Z",
    fensterTage: 14,
    summe: { pakete: 4, abrufwege: 20, wegeEingeplant: 12, wegeDefekt: 3, wegeAusgeschlossen: 5, zustand: { gesund: 1, eingeschraenkt: 1, ausgefallen: 1, inaktiv: 1, unbekannt: 0 } },
    datenalter: { juengsteZeileAt: "2026-07-25T20:00:00.000Z", alterStunden: 34, veraltet: true, hinweis: "Die jüngste Telemetriezeile ist 34 Stunden alt — die Inventur beschreibt NICHT den Zustand von jetzt, sondern den des letzten Laufs." },
    letzterLauf: { runId: "crawl-testlauf", endetAt: "2026-07-25T20:00:00.000Z", alterStunden: 34, quellenMitVersuch: 12, gefunden: 400, neu: 120 },
    letzterLaufHinweis: null,
    datengrundlage: { landesmodule: { hinweis: "Kein Land hat ein aktivierungsberechtigtes Landtagsmandat — die Landesmodule sind unabhängig vom Freigabe-Flag inaktiv (aus der Datenbank belegt)." } },
    laufzeitquellen: 3,
    pakete: [
      { key: "paket-defekt", name: "Ausgefallenes Paket", ebene: "bund", region: "Bund", istBasispaket: false, dbStatus: "active",
        zustand: "ausgefallen", zustandGrund: "Kein eingeplanter Abrufweg liefert (2 gestört, 0 ohne Laufdaten von 2).",
        aktivierung: { paketAktivierung: "active", refCount: 1, ausfuehrbar: true, begruendung: "…" },
        abrufwege: { gesamt: 2, eingeplant: 2, defekt: 0, ausgeschlossen: 0, wirksam: 0, gestoert: 2, unbekannt: 0, ausschlussgruende: {} },
        ertrag: { betriebszeitraum: { tage: 14, gefunden: 0, neu: 0, wegeMitLieferung: 0 }, messbar: true, grund: null },
        letzteLieferung: null,
        fehler: { stufen: { akut: 1 }, akut: [], zeitnah: [], strukturell: [] },
        flags: { ohneLieferungJemals: true, ertragNullImFenster: true } },
      { key: "paket-eingeschraenkt", name: "Teilweise gestörtes Paket", ebene: "bund", region: "Bund", istBasispaket: true, dbStatus: "active",
        zustand: "eingeschraenkt", zustandGrund: "Versorgung läuft, aber eingeschränkt: 1 zugeordnete Wege defekt und dauerhaft ausgeschlossen.",
        aktivierung: { paketAktivierung: "active", refCount: 6, ausfuehrbar: true, begruendung: "…" },
        abrufwege: { gesamt: 8, eingeplant: 7, defekt: 1, ausgeschlossen: 0, wirksam: 7, gestoert: 0, unbekannt: 0, ausschlussgruende: {} },
        ertrag: { betriebszeitraum: { tage: 14, gefunden: 900, neu: 400, wegeMitLieferung: 7 }, messbar: true, grund: null },
        letzteLieferung: { at: "2026-07-25T20:00:00.000Z", quelle: "q1", grundlage: "Bewertungsfenster" },
        fehler: { stufen: {}, akut: [], zeitnah: [], strukturell: [] },
        flags: { defekteWege: true } },
      { key: "paket-gesund", name: "Gesundes Paket", ebene: "land", region: "Niedersachsen", istBasispaket: false, dbStatus: "active",
        zustand: "gesund", zustandGrund: "Alle 3 eingeplanten Abrufwege liefern störungsfrei; 54 neue Dokumente im Betriebszeitraum.",
        aktivierung: { paketAktivierung: "active", refCount: 1, ausfuehrbar: true, begruendung: "…" },
        abrufwege: { gesamt: 3, eingeplant: 3, defekt: 0, ausgeschlossen: 0, wirksam: 3, gestoert: 0, unbekannt: 0, ausschlussgruende: {} },
        ertrag: { betriebszeitraum: { tage: 14, gefunden: 300, neu: 54, wegeMitLieferung: 3 }, messbar: true, grund: null },
        letzteLieferung: { at: "2026-07-25T20:00:00.000Z", quelle: "q2", grundlage: "Bewertungsfenster" },
        fehler: { stufen: {}, akut: [], zeitnah: [], strukturell: [] }, flags: {} },
      { key: "paket-inaktiv", name: "Gesperrtes Landespaket", ebene: "land", region: "Berlin", istBasispaket: true, dbStatus: "active",
        zustand: "inaktiv", zustandGrund: "Kein Abrufweg ist eingeplant — bewusst: landesmodul-gesperrt.",
        aktivierung: { paketAktivierung: "inactive", refCount: 0, ausfuehrbar: false, begruendung: "…" },
        abrufwege: { gesamt: 7, eingeplant: 0, defekt: 0, ausgeschlossen: 7, wirksam: 0, gestoert: 0, unbekannt: 0, ausschlussgruende: { "landesmodul-gesperrt": 7 } },
        ertrag: { betriebszeitraum: { tage: 14, gefunden: 0, neu: 0, wegeMitLieferung: 0 }, messbar: false, grund: "Kein Abrufweg dieses Pakets hat im Betriebszeitraum eine Telemetriezeile geschrieben." },
        letzteLieferung: null,
        fehler: { stufen: {}, akut: [], zeitnah: [], strukturell: [] },
        flags: { ohneEingeplanteWege: true, ohneTelemetrie: true, ohneLieferungJemals: true } }
    ]
  }
});
const invView = api.render();
check("E1 Inventur-Karte erscheint", invView.includes("Paket-Inventur"));
check("E2 alle fünf Zustände als Zähler sichtbar",
  invView.includes("Gesund") && invView.includes("Eingeschränkt") && invView.includes("Ausgefallen") && invView.includes("Inaktiv") && invView.includes("Unbekannt"));
check("E3 jedes Paket erscheint genau einmal",
  ["paket-defekt", "paket-eingeschraenkt", "paket-gesund", "paket-inaktiv"]
    .every((k) => invView.split(k).length === 2));
check("E4 Zustand steht als Text, nicht nur als Farbe", invView.includes(">ausgefallen<") && invView.includes(">inaktiv<"));
check("E5 Zustand ist begründet", invView.includes("Kein eingeplanter Abrufweg liefert"));
check("E6 'nie geliefert' wird ausdrücklich benannt", invView.includes("<strong>nie</strong>"));
check("E7 Kennzeichen für leere Pakete sichtbar", invView.includes("ohne verwertbare Telemetrie") && invView.includes("kein Weg eingeplant"));
check("E8 eingeplant/gesamt statt bloßer Datensatzzahl", invView.includes("7 / 8") && invView.includes("0 / 7"));
check("E9 veraltete Datengrundlage wird hervorgehoben",
  invView.includes("adm-note--bad") && invView.includes("NICHT den Zustand von jetzt"));
check("E10 letzter Volllauf mit Alter genannt", invView.includes("crawl-testlauf") && invView.includes("vor 34 h"));
check("E11 Landesmodul-Lage im Klartext", invView.includes("unabhängig vom Freigabe-Flag inaktiv"));
check("E12 Aktivierung meint 'ausführbar', nicht 'vorhanden'",
  invView.includes("nicht ausführbar") && invView.includes("tatsächlich eingeplant und ausführbar"));
check("E13 Reproduktionsweg wird genannt", invView.includes("scripts/paket-inventur.js"));
check("E14 Störungsblock bleibt daneben bestehen (rein additiv)", invView.includes("Abrufwege nach Status"));

// F) Ohne Inventur-Daten entfällt die Karte, ohne den Rest zu beschädigen.
api.clearData();
api.setUser({ id: "admin1", role: "admin" });
api.setData("sources", { ...basis, paketInventur: null });
const ohneInv = api.render();
check("F1 Ohne Inventur keine Karte", !ohneInv.includes("Paket-Inventur"));
check("F2 Ohne Inventur bleibt der Rest der Ansicht intakt", ohneInv.includes("Abrufwege nach Status") && ohneInv.includes("Quellen-Architektur"));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Quellen-UI-Assertions`);
process.exit(failed > 0 ? 1 : 0);
