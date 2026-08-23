"use strict";

// Zentraler Offline-Vertragstest der QUELLENPFLICHT (P0-Schliessungssprint 2026-08-22).
// KEIN Netz, KEINE KI, deterministisch.
//
// VERTRAG: Jedes sichtbare quellenpflichtige Inhaltselement in
//   - Lage (selectLageVorgaenge / lageVisibleVorgaenge),
//   - Heute/Briefing-Tab (briefingContract-Items + hasPreciseSource im Client),
//   - allen vier Radar-Bereichen (Über dich, Dein Umfeld, Neue Dynamiken,
//     Alle relevanten Artikel — Server radarState + Client-Renderer),
//   - Büro (Quellenliste + Zähler der Entwurfs-Detailansicht)
// besitzt mindestens EINE echte oeffnende HTTPS-Quelle: https-Schema, keine blosse
// Herausgeber-Startseite (Domain-Root), kein Google-Proxy, kein javascript:/data:.
//
// EHRLICHE GRENZE (Produktgrenze des Sprints): Dieser Test beweist eine sichtbare,
// oeffnende QUELLENBASIS je Inhaltselement. Er beweist NICHT, dass jede einzelne
// Aussage eines Elements durch eine bestimmte Quelle oder Textstelle getragen ist
// (Beleg-Bindung ist ausdruecklich nicht Teil dieses Sprints). Rubrik-/Listenseiten
// MIT Pfad erkennt die Startseiten-Heuristik (Pfadtiefe 0) nicht.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

const radarState = require("../lib/helmut/radarState");
const briefingContract = require("../lib/helmut/briefingContract");
const lage = require("../lib/helmut/lage");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Gemeinsame Pruefung "echte oeffnende HTTPS-Quelle" (Vertragsdefinition).
function istOeffnendeHttpsQuelle(url) {
  if (!/^https:\/\//i.test(String(url || ""))) return false;
  try {
    const parsed = new URL(String(url));
    if (parsed.hostname.includes("google.")) return false;
    const p = parsed.pathname.replace(/\/+$/, "");
    return Boolean(p && p !== "/" && p.split("/").filter(Boolean).length > 0);
  } catch (_) { return false; }
}

const NOW = new Date("2026-08-22T08:00:00Z").getTime();
const nowDate = new Date(NOW);
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// 1) RADAR (Server): alle vier Bereiche liefern nur Items mit oeffnender Quelle
// ─────────────────────────────────────────────────────────────────────────────
console.log("— Radar (Server-Lesevertrag radarState) —");
{
  const base = { status: "neu", understanding_status: "complete" };
  const profile = {
    id: "u-test", fullName: "Erika Beispielfrau", party: "Die Linke",
    committees: ["Ausschuss für Arbeit und Soziales"], constituency: "Beispielkreis"
  };
  // Gut belegt: Erwaehnung + Partei-Umfeld + Dynamik + Artikel.
  const koGut = {
    ...base, id: "k-gut", vorgang_id: "v-gut",
    display_title: "Die Linke fordert mit Erika Beispielfrau bessere Kommunalfinanzen",
    mentioned_mps: ["Erika Beispielfrau"], parteien: ["Die Linke"],
    source_document_count: 3,
    updated_at: iso(3600e3), created_at: iso(3600e3)
  };
  // Ohne jede URL (kein Dokument, kein best_source_url).
  const koOhneUrl = {
    ...base, id: "k-ohne", vorgang_id: "v-ohne",
    display_title: "Die Linke plant Klausurtagung ohne Quelle",
    parteien: ["Die Linke"], source_document_count: 3,
    updated_at: iso(3600e3), created_at: iso(3600e3)
  };
  // Nur Herausgeber-Startseite als "Quelle".
  const koStartseite = {
    ...base, id: "k-start", vorgang_id: "v-start",
    display_title: "Die Linke kommentiert Haushaltslage nur mit Startseite",
    parteien: ["Die Linke"], best_source_url: "https://www.beispielverlag.de/",
    best_link_type: "publisher", source_document_count: 3,
    updated_at: iso(3600e3), created_at: iso(3600e3)
  };
  // Nur Klartext-http.
  const koHttp = {
    ...base, id: "k-http", vorgang_id: "v-http",
    display_title: "Die Linke aeussert sich in unsicherer Quelle",
    parteien: ["Die Linke"], best_source_url: "http://alt.beispiel.de/artikel-1",
    source_document_count: 3,
    updated_at: iso(3600e3), created_at: iso(3600e3)
  };
  const allKos = [koGut, koOhneUrl, koStartseite, koHttp];
  const kosById = Object.fromEntries(allKos.map((k) => [k.id, k]));
  const decisions = allKos.map((k) => ({
    knowledge_object_id: k.id, vorgang_id: k.vorgang_id, score: 70,
    matched_features: [{ type: "partei", value: "Die Linke" }]
  }));
  const sourcesByVorgang = {
    "v-gut": [
      { id: "d1", url: "https://www.beispielmedien.de/politik/kommunalfinanzen-101.html", link_type: "direct", source_type: "media", source_name: "Beispielmedien", published_at: iso(2 * 3600e3) },
      { id: "d2", url: "https://www.bundestag.de/presse/mitteilung-55", link_type: "direct", source_type: "parliament", source_name: "Bundestag", published_at: iso(3 * 3600e3) }
    ],
    "v-start": [
      { id: "d3", url: "https://www.beispielverlag.de/", link_type: "publisher", source_type: "media", source_name: "Beispielverlag", published_at: iso(2 * 3600e3) }
    ],
    "v-http": [
      { id: "d4", url: "http://alt.beispiel.de/artikel-1", link_type: "direct", source_type: "media", source_name: "Altmedium", published_at: iso(2 * 3600e3) }
    ]
  };

  const state = radarState.buildCurrentRadarState({ profile, decisions, kosById, knowledgeObjects: allKos, sourcesByVorgang, now: nowDate });
  const alleItems = [
    ...state.mentions,
    ...state.environment.party, ...state.environment.constituency, ...state.environment.committees,
    ...state.dynamics,
    ...state.articles
  ];
  const alleVorgaenge = new Set(alleItems.map((i) => i.vorgangId));

  check("Radar: mindestens ein gut belegtes Item ist sichtbar (kein leerer Testlauf)", alleItems.length > 0);
  check("Radar: JEDES sichtbare Item (alle vier Bereiche) traegt eine oeffnende HTTPS-Quelle",
    alleItems.every((i) => istOeffnendeHttpsQuelle(i.sourceUrl)),
    JSON.stringify(alleItems.filter((i) => !istOeffnendeHttpsQuelle(i.sourceUrl)).map((i) => [i.id, i.sourceUrl])));
  check("Radar: der gut belegte Vorgang erscheint (Über dich)", state.mentions.some((m) => m.vorgangId === "v-gut"));
  check("Radar: der gut belegte Vorgang erscheint (Umfeld Partei)", state.environment.party.some((e) => e.vorgangId === "v-gut"));
  check("Radar: der gut belegte Vorgang erscheint (Dynamiken)", state.dynamics.some((d) => d.vorgangId === "v-gut"));
  check("Radar: der gut belegte Vorgang erscheint (Artikel)", state.articles.some((a) => a.vorgangId === "v-gut"));
  check("Radar: Vorgang OHNE URL erscheint in KEINEM Bereich", !alleVorgaenge.has("v-ohne"));
  check("Radar: Vorgang mit NUR Herausgeber-Startseite erscheint in KEINEM Bereich", !alleVorgaenge.has("v-start"));
  check("Radar: Vorgang mit NUR http-Quelle erscheint in KEINEM Bereich", !alleVorgaenge.has("v-http"));

  // Vertragskern als Einzelfunktion (Server): oeffnendeArtikelUrl.
  check("oeffnendeArtikelUrl: https-Artikel-URL wird akzeptiert",
    radarState.oeffnendeArtikelUrl("https://x.de/politik/artikel-1") === "https://x.de/politik/artikel-1");
  check("oeffnendeArtikelUrl: Herausgeber-Startseite (Domain-Root) wird abgelehnt",
    radarState.oeffnendeArtikelUrl("https://x.de/") === "" && radarState.oeffnendeArtikelUrl("https://x.de") === "");
  check("oeffnendeArtikelUrl: http wird abgelehnt", radarState.oeffnendeArtikelUrl("http://x.de/artikel") === "");
  check("oeffnendeArtikelUrl: javascript:/data: wird abgelehnt",
    radarState.oeffnendeArtikelUrl("javascript:alert(1)") === "" && radarState.oeffnendeArtikelUrl("data:text/html,x") === "");
  check("oeffnendeArtikelUrl: Google-Proxy wird abgelehnt (wie im Client)",
    radarState.oeffnendeArtikelUrl("https://news.google.com/articles/xyz") === "");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) LAGE (Server): nur Karten mit oeffnender https-Quelle erscheinen
// ─────────────────────────────────────────────────────────────────────────────
console.log("— Lage (Server-Auswahl) —");
{
  const modern = (id, sources) => ({
    id, displaySummary: "S", whyRelevant: "W", recommendation: "R",
    sources, sourceCount: sources.length
  });
  const gut = modern("lage-gut", [{ name: "Tagesschau", url: "https://www.tagesschau.de/inland/beispiel-77.html" }]);
  const ohneUrl = modern("lage-ohne-url", [{ name: "Quelle ohne URL" }]);
  const nurZaehler = { id: "lage-zaehler", displaySummary: "S", whyRelevant: "W", recommendation: "R", sources: [], sourceCount: 4 };
  const nurHttp = modern("lage-http", [{ name: "Altmedium", url: "http://alt.de/artikel-1" }]);
  const nurStartseite = modern("lage-startseite", [{ name: "Verlag", url: "https://www.beispielverlag.de/" }]);
  const nurGoogle = modern("lage-google", [{ name: "Aggregator", url: "https://news.google.com/articles/xyz" }]);

  const out = lage.selectLageVorgaenge([gut, ohneUrl, nurZaehler, nurHttp, nurStartseite, nurGoogle]);
  check("Lage: Karte mit oeffnender https-Quelle erscheint", out.some((v) => v.id === "lage-gut"));
  check("Lage: Karte mit Quelle OHNE URL erscheint nicht", !out.some((v) => v.id === "lage-ohne-url"));
  check("Lage: blosser sourceCount ohne oeffnende Quelle genuegt nicht mehr", !out.some((v) => v.id === "lage-zaehler"));
  check("Lage: Karte mit nur-http-Quelle erscheint nicht", !out.some((v) => v.id === "lage-http"));
  check("Lage: Karte mit NUR Herausgeber-Startseite erscheint nicht", !out.some((v) => v.id === "lage-startseite"));
  check("Lage: Karte mit NUR Google-Proxy-Quelle erscheint nicht", !out.some((v) => v.id === "lage-google"));
  check("Lage: JEDE sichtbare Karte traegt mindestens eine oeffnende https-Quelle",
    out.every((v) => (v.sources || []).some((s) => istOeffnendeHttpsQuelle(s.url))));
  check("Lage: ehrlicher Leerzustand statt quellenloser Karten",
    lage.selectLageVorgaenge([ohneUrl, nurZaehler, nurStartseite]).length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) HEUTE / BRIEFING-VERTRAG (Server): Quellenfelder + kein erfundenes Datum
// ─────────────────────────────────────────────────────────────────────────────
console.log("— Heute/Briefing (Server-Vertrag briefingContract) —");
{
  const ko = {
    id: "k1", vorgang_id: "v1", status: "neu", understanding_status: "complete",
    display_title: "Testvorgang", best_source_url: "https://www.beispiel.de/politik/artikel-9",
    best_link_type: "direct", updated_at: iso(3600e3), created_at: iso(2 * 3600e3)
  };
  const docs = [
    { id: "d1", url: "https://www.beispiel.de/politik/artikel-9", link_type: "direct", source_name: "Beispiel", published_at: iso(2 * 3600e3) },
    { id: "d2", source_name: "Quelle ohne URL", published_at: iso(3600e3) }
  ];
  const sources = briefingContract.buildSources(ko, docs);
  check("Heute: buildSources verwirft Quellen ohne URL", sources.length === 1 && sources[0].url.includes("artikel-9"));
  const fallback = briefingContract.buildSources(ko, []);
  check("Heute: best_source_url-Fallback existiert weiterhin (eine Quelle)", fallback.length === 1 && fallback[0].url === ko.best_source_url);
  check("Heute: Fallback-Quelle traegt NIE das Analysedatum als Veroeffentlichungsdatum (leer)",
    fallback[0].publishedAt === null);

  // Identitaet Primaerquelle == sources[0] (Grundlage des korrekten Buero-Zaehlers).
  const contract = briefingContract.toBriefingContractV3({
    decisions: [{ knowledge_object_id: "k1", vorgang_id: "v1", score: 80, decision: "Sofort reagieren", priority_type: "reaction", matched_features: [] }],
    kosById: { k1: ko }, sourcesByVorgang: { v1: docs }, profile: { id: "u1", fullName: "Erika Beispielfrau" }, now: nowDate
  });
  const item = (contract.items || [])[0];
  const rec = (contract.personalizedRecommendations || [])[0];
  check("Heute: Item traegt primarySource UND sources, primarySource IST sources[0]",
    Boolean(item) && item.primarySource === item.sources[0]);
  check("Heute: Empfehlung traegt primarySource IST sources[0]",
    Boolean(rec) && rec.primarySource === rec.sources[0]);
  check("Heute: sourceCount == sources.length (kein Ratewert)",
    item.sourceCount === item.sources.length && rec.source_count === rec.sources.length);
  check("Heute: alle Vertragsquellen des Items tragen eine URL", item.sources.every((s) => Boolean(s.url)));

  // Briefing-Tab (Stabschefstand): Kandidaten-Gate + oeffnender Quellen-Link.
  const dec = (koId, vId) => ({ knowledge_object_id: koId, vorgang_id: vId, score: 80, decision: "Sofort reagieren", priority_type: "reaction", matched_features: [] });
  const koNurZaehler = {
    id: "kz", vorgang_id: "vz", status: "neu", understanding_status: "complete",
    display_title: "Vorgang nur mit Zaehler", source_document_count: 4,
    updated_at: iso(3600e3), created_at: iso(2 * 3600e3)
  };
  const koStartseiteHeute = {
    id: "ks", vorgang_id: "vs", status: "neu", understanding_status: "complete",
    display_title: "Vorgang nur mit Startseite", best_source_url: "https://www.beispielverlag.de/",
    updated_at: iso(3600e3), created_at: iso(2 * 3600e3)
  };
  const stand = briefingContract.buildCurrentHelmutState({
    profile: { id: "u1" }, decisions: [dec("k1", "v1"), dec("kz", "vz"), dec("ks", "vs")],
    kosById: { k1: ko, kz: koNurZaehler, ks: koStartseiteHeute },
    sourcesByVorgang: { v1: docs }, now: nowDate
  });
  check("Briefing-Tab: der Stand traegt den belegten Vorgang mit oeffnender Quelle",
    Boolean(stand.primaryItem) && stand.primaryVorgangId === "v1");
  check("Briefing-Tab: primaryItem traegt sourceUrl (oeffnende https-Quelle) + sourceName",
    istOeffnendeHttpsQuelle(stand.primaryItem.sourceUrl) && Boolean(stand.primaryItem.sourceName));
  check("Briefing-Tab: Vorgang mit NUR Zaehler (source_document_count) erreicht den Stand nicht",
    stand.primaryVorgangId !== "vz" && !(stand.items || []).some((i) => i.id === "vz"));
  check("Briefing-Tab: Vorgang mit NUR Startseiten-URL erreicht den Stand nicht",
    stand.primaryVorgangId !== "vs" && !(stand.items || []).some((i) => i.id === "vs"));
  const leer = briefingContract.buildCurrentHelmutState({
    profile: { id: "u1" }, decisions: [dec("kz", "vz"), dec("ks", "vs")],
    kosById: { kz: koNurZaehler, ks: koStartseiteHeute },
    sourcesByVorgang: {}, now: nowDate
  });
  check("Briefing-Tab: ohne einen einzigen oeffnend belegten Vorgang -> ehrlicher Leerzustand",
    leer.primaryItem === null && leer.status === "empty");
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) CLIENT (vm): Radar-Renderer, Heute-Filter, Buero-Quellenliste + Zaehler
// ─────────────────────────────────────────────────────────────────────────────
console.log("— Client (vm: echte Render-/Filterfunktionen aus client.js) —");

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__qpTest = {
    renderRadar: () => renderRadarView(),
    setBriefing: (b) => { briefing = b; },
    setDecisions: (d) => { decisions = d; },
    setSelectedOfficeDraft: (v) => { selectedOfficeDraft = v; },
    renderOfficeDetail: () => renderOfficeDraftDetail(),
    officeDraftSources: (d) => officeDraftSources(d),
    draftSourceCount: (d) => draftSourceCount(d),
    hasPreciseSource: (i) => hasPreciseSource(i),
    sourceHref: (s) => sourceHref(s),
    radarItemHref: (i) => radarItemHref(i),
    lageVisible: (data) => lageVisibleVorgaenge(data),
    renderHstandPrimary: (s) => renderHstandPrimary(s),
    renderHstandItems: (s) => renderHstandItems(s),
    hstandQuelleHref: (i) => hstandQuelleHref(i),
    formats: () => OFFICE_FORMATS
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
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
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
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: doc,
    navigator: { userAgent: "node-test", serviceWorker: undefined, language: "de-DE", onLine: true, sendBeacon: noop },
    localStorage: storage, sessionStorage: storage,
    location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    fetch: () => Promise.reject(new Error("no-net-in-test")),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64")
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  if (!sandbox.__qpTest) throw new Error("Quellenpflicht-Test-Hook nicht gesetzt");
  return sandbox.__qpTest;
}

const api = loadClient();
check("client.js laedt im vm (Quellenpflicht-Hook gesetzt)", Boolean(api && api.renderRadar));

// 4a) Radar-Client: nur oeffnbare Items werden als Karte/Zeile gerendert.
{
  const gut = { id: "m-gut", vorgangId: "vm1", title: "Sichtbare Erwaehnung", sourceName: "Medienhaus",
    sourceUrl: "https://medienhaus.de/politik/artikel-1", linkType: "direct", publishedAt: iso(3600e3),
    mentionType: "directName", mentionLabel: "Namentlich erwähnt", mentionTone: "neutral", evidence: "…", thumbnailUrl: null };
  const ohneUrl = { ...gut, id: "m-ohne", vorgangId: "vm2", title: "Unsichtbare Erwaehnung ohne URL", sourceUrl: "" };
  const startseite = { ...gut, id: "m-start", vorgangId: "vm3", title: "Unsichtbare Startseiten-Erwaehnung", sourceUrl: "https://medienhaus.de/" };
  const http = { ...gut, id: "m-http", vorgangId: "vm4", title: "Unsichtbare http-Erwaehnung", sourceUrl: "http://medienhaus.de/politik/artikel-2" };
  const state = {
    generatedAt: iso(0), lastUpdated: iso(3600e3), status: "fresh", profileId: "u1",
    summary: { line1: "", line2: "", text: "" },
    mentions: [gut, ohneUrl, startseite, http],
    environment: { party: [{ ...gut, id: "e1", vorgangId: "ve1", title: "Sichtbares Parteisignal", relationType: "party", relationLabel: "Betrifft deine Partei" },
      { ...gut, id: "e2", vorgangId: "ve2", title: "Unsichtbares Parteisignal", sourceUrl: "", relationType: "party", relationLabel: "Betrifft deine Partei" }], constituency: [], committees: [] },
    dynamics: [{ ...gut, id: "dy1", vorgangId: "vd1", title: "Sichtbare Dynamik", signalType: "rising", signalLabel: "Mehr Quellen", evidence: "3 Quellen berichten.", sourceCount: 3, lastUpdatedAt: iso(3600e3) },
      { ...gut, id: "dy2", vorgangId: "vd2", title: "Unsichtbare Dynamik", sourceUrl: "https://medienhaus.de", signalType: "rising", signalLabel: "Mehr Quellen", evidence: "3 Quellen berichten.", sourceCount: 3, lastUpdatedAt: iso(3600e3) }],
    articles: [{ ...gut, id: "a1", vorgangId: "va1", title: "Sichtbarer Artikel", shortSummary: "Kurz.", relationTypes: ["party", "media"] },
      { ...gut, id: "a2", vorgangId: "va2", title: "Unsichtbarer Artikel", sourceUrl: "", shortSummary: "Kurz.", relationTypes: ["party", "media"] }],
    quality: { status: "fresh", reason: null, lastUpdated: iso(3600e3), mentionsFound: 4, environmentMatched: 2, dynamicsDetected: 2, articleCount: 2, sourcesLoaded: true, hasThumbnails: false, thumbnailsAvailable: false }
  };
  api.setBriefing({ engine: "v3", currentRadarState: state });
  const html = api.renderRadar();
  check("Radar-Client: oeffnbare Items werden gerendert",
    html.includes("Sichtbare Erwaehnung") && html.includes("Sichtbares Parteisignal")
    && html.includes("Sichtbare Dynamik") && html.includes("Sichtbarer Artikel"));
  check("Radar-Client: Item OHNE URL erscheint nicht als Karte", !html.includes("Unsichtbare Erwaehnung ohne URL") && !html.includes("Unsichtbares Parteisignal") && !html.includes("Unsichtbarer Artikel"));
  check("Radar-Client: Item mit Herausgeber-Startseite erscheint nicht", !html.includes("Unsichtbare Startseiten-Erwaehnung") && !html.includes("Unsichtbare Dynamik"));
  check("Radar-Client: Item mit http-URL erscheint nicht", !html.includes("Unsichtbare http-Erwaehnung"));
  check("Radar-Client: keine nolink-Karten im Markup (jede Karte oeffnet)",
    !html.includes("radar2-card--nolink") && !html.includes("radar2-row--nolink"));
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  check("Radar-Client: JEDER gerenderte Link ist eine oeffnende HTTPS-Quelle",
    hrefs.length > 0 && hrefs.every((h) => istOeffnendeHttpsQuelle(h)), JSON.stringify(hrefs.filter((h) => !istOeffnendeHttpsQuelle(h))));
}

// 4b) Heute-Client: hasPreciseSource laesst nur echte oeffnende https-Quellen durch.
{
  const mk = (src) => ({ id: "i1", title: "T", primarySource: src, sources: src ? [src] : [] });
  check("Heute-Client: https-Artikel mit linkType direct -> sichtbar",
    api.hasPreciseSource(mk({ sourceName: "Q", url: "https://q.de/politik/artikel-3", linkType: "direct" })) === true);
  check("Heute-Client: http-Quelle -> nicht als praezise Quelle akzeptiert",
    api.hasPreciseSource(mk({ sourceName: "Q", url: "http://q.de/politik/artikel-3", linkType: "direct" })) === false);
  check("Heute-Client: Herausgeber-Startseite -> nicht akzeptiert",
    api.hasPreciseSource(mk({ sourceName: "Q", url: "https://q.de/", linkType: "direct" })) === false);
  check("Heute-Client: linkType 'publisher' -> nicht akzeptiert",
    api.hasPreciseSource(mk({ sourceName: "Q", url: "https://q.de/politik/artikel-3", linkType: "publisher" })) === false);
  check("Heute-Client: Google-Proxy -> nicht akzeptiert",
    api.hasPreciseSource(mk({ sourceName: "Q", url: "https://news.google.com/articles/xyz", linkType: "direct" })) === false);
  check("Heute-Client: ohne Quelle -> nicht sichtbar", api.hasPreciseSource(mk(null)) === false);
}

// 4c) Lage-Client-Paritaet: sichtbare Menge verlangt eine OEFFNENDE https-Quelle.
{
  const visible = api.lageVisible({ vorgaenge: [
    { id: "ok", sources: [{ name: "Q", url: "https://q.de/politik/a-1" }], sourceCount: 1 },
    { id: "ohne", sources: [{ name: "Q" }], sourceCount: 1 },
    { id: "zaehler", sources: [], sourceCount: 3 },
    { id: "startseite", sources: [{ name: "V", url: "https://verlag.de/" }], sourceCount: 1 },
    { id: "google", sources: [{ name: "G", url: "https://news.google.com/articles/x" }], sourceCount: 1 }
  ] });
  check("Lage-Client: nur die Karte mit oeffnender https-Quelle bleibt sichtbar",
    visible.length === 1 && visible[0].id === "ok");
}

// 4e) Briefing-Tab-Client (Stabschefstand): Karten tragen den oeffnenden Quellen-Link.
{
  const primary = { id: "v1", title: "Wichtigster Vorgang", displayTitle: "Wichtigster Vorgang",
    urgency: "hoch", contextChips: [], sourceCount: 3, sourceUrl: "https://q.de/politik/artikel-1",
    sourceName: "Beispielmedien", lastUpdated: iso(3600e3), qualityStatus: "valid" };
  const htmlPrimary = api.renderHstandPrimary({ primaryItem: primary });
  check("Briefing-Tab-Client: Primaerkarte traegt anklickbaren 'Quelle öffnen'-Link",
    htmlPrimary.includes("hstand-quelle-link") && htmlPrimary.includes("https://q.de/politik/artikel-1")
    && htmlPrimary.includes("Quelle öffnen") && /target="_blank"[^>]*rel="noopener noreferrer"/.test(htmlPrimary.replace(/\n\s*/g, " ")));
  const htmlItems = api.renderHstandItems({ items: [
    { id: "v2", title: "Weiterer Vorgang", displayTitle: "Weiterer Vorgang", whyRelevant: "Relevant.",
      urgency: "mittel", sourceUrl: "https://q.de/politik/artikel-2", sourceName: "Q", lastUpdated: iso(3600e3) }
  ] });
  check("Briefing-Tab-Client: weitere Vorgaenge tragen ihren oeffnenden Quellen-Link",
    htmlItems.includes("hstand-rel-quelle") && htmlItems.includes("https://q.de/politik/artikel-2"));
  check("Briefing-Tab-Client: Startseiten-/Google-URLs werden NICHT verlinkt",
    api.hstandQuelleHref({ sourceUrl: "https://verlag.de/" }) === ""
    && api.hstandQuelleHref({ sourceUrl: "https://news.google.com/articles/x" }) === ""
    && api.hstandQuelleHref({ sourceUrl: "http://q.de/politik/a" }) === "");
}

// 4d) Buero: Quellenliste sichtbar, anklickbar, dedupliziert; Zaehler exakt.
{
  const src1 = { sourceName: "Beispielmedien", url: "https://www.beispielmedien.de/politik/artikel-7", linkType: "direct", publishedAt: iso(2 * 3600e3), sourceUrl: "https://www.beispielmedien.de" };
  const src2 = { sourceName: "Bundestag", url: "https://www.bundestag.de/presse/mitteilung-55", linkType: "direct", publishedAt: iso(3 * 3600e3), sourceUrl: "https://www.bundestag.de" };
  const decision = { id: "dec-1", signalId: "sig-1", title: "Kommunalfinanzen", decision: "Sofort reagieren",
    primarySource: src1, sources: [src1, src2], sourceCount: 2 };
  const liste = api.officeDraftSources(decision);
  check("Buero: Quellenliste ist dedupliziert (Primaerquelle nicht doppelt)", liste.length === 2);
  check("Buero: Zaehler == Anzahl unterschiedlicher Quellen", api.draftSourceCount(decision) === 2);
  check("Buero: jede gelistete Quelle traegt eine oeffnende HTTPS-URL",
    liste.every((s) => istOeffnendeHttpsQuelle(s.href)));

  const formats = api.formats();
  api.setBriefing({ engine: "v3", generatedAt: iso(0) });
  api.setDecisions([decision]);
  api.setSelectedOfficeDraft({ decision, format: formats[0], text: "Erster Absatz.\nZweiter Absatz.", provenance: "Regelbasiert erstellt" });
  const html = api.renderOfficeDetail();
  check("Buero-Detail: sichtbare Quellenliste mit Ueberschrift 'Quellen (2)'", html.includes("Quellen (2)"));
  check("Buero-Detail: beide Quellen sind anklickbar (href auf die Artikel-URLs)",
    html.includes("https://www.beispielmedien.de/politik/artikel-7") && html.includes("https://www.bundestag.de/presse/mitteilung-55"));
  check("Buero-Detail: Links oeffnen extern (target=_blank + rel noopener)",
    /buero-source-link[^>]*href="https:\/\/www\.beispielmedien\.de\/politik\/artikel-7"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/.test(html.replace(/\n\s*/g, " ")));
  check("Buero-Detail: Zaehler-Zeile stimmt exakt ('Basiert auf 2 Quellen')", html.includes("Basiert auf 2 Quellen"));
}

console.log(`\n${passed}/${passed + failed} Quellenpflicht-Vertrags-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
