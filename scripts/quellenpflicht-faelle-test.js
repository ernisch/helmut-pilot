"use strict";

// Gezielte Quellenpflicht-Faelle (P0-Schliessungssprint 2026-08-22). KEIN Netz, KEINE KI.
// Prueft die im Sprint benannten Einzelfaelle:
//   1. Radar-Eintraege OHNE URL -> ehrlicher Leerzustand (Bereich + Gesamt), keine Karte.
//   2. Radar-Eintraege mit Herausgeber-Startseite -> keine Karte, auch nicht "Über dich".
//   3. Doppelte Buero-Quellen (inkl. Slash-/Gross-Klein-Varianten) -> Dedup, Zaehler exakt.
//   4. Fehlende Veroeffentlichungsdaten -> Wert bleibt leer (nie Analysedatum, nie 1970).
//   5. Ehrliche Leerzustaende in Radar und Buero.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

const radarState = require("../lib/helmut/radarState");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = new Date("2026-08-22T08:00:00Z").getTime();
const nowDate = new Date(NOW);
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// A) Server: "Über dich" laesst Startseiten-Belege nicht mehr durch
// ─────────────────────────────────────────────────────────────────────────────
console.log("— Server: Erwaehnungen und Primaerquellen —");
{
  const profile = { id: "u1", fullName: "Erika Beispielfrau", party: "Die Linke" };
  const base = { status: "neu", understanding_status: "complete" };
  const koHomepage = {
    ...base, id: "k1", vorgang_id: "v1",
    display_title: "Erika Beispielfrau kritisiert Haushaltsplan",
    mentioned_mps: ["Erika Beispielfrau"],
    best_source_url: "https://www.beispielverlag.de/", best_link_type: "publisher",
    updated_at: iso(3600e3), created_at: iso(3600e3)
  };
  const state = radarState.buildCurrentRadarState({
    profile, decisions: [], kosById: { k1: koHomepage }, knowledgeObjects: [koHomepage],
    sourcesByVorgang: {}, now: nowDate
  });
  check("Über dich: Erwaehnung mit NUR Startseiten-URL erscheint nicht (keine erfundene Artikelquelle)",
    state.mentions.length === 0);

  // pickPrimarySource: Startseiten-Dokument wird uebersprungen, Artikel-Zweitquelle gewinnt.
  const src = radarState.pickPrimarySource(
    { vorgang_id: "v2" },
    [
      { id: "d1", url: "https://www.beispielverlag.de/", link_type: "direct", published_at: iso(3600e3) },
      { id: "d2", url: "https://www.beispielverlag.de/politik/artikel-3", link_type: "publisher", published_at: iso(2 * 3600e3) }
    ]
  );
  check("pickPrimarySource: Startseiten-Dokument uebersprungen, Artikel-URL gewaehlt",
    Boolean(src) && src.url === "https://www.beispielverlag.de/politik/artikel-3");

  // Fehlendes Veroeffentlichungsdatum: best_source_url-Fallback bleibt leer.
  const fb = radarState.pickPrimarySource(
    { vorgang_id: "v3", best_source_url: "https://www.beispiel.de/politik/artikel-4", updated_at: iso(3600e3), created_at: iso(2 * 3600e3) },
    []
  );
  check("pickPrimarySource-Fallback: publishedAt bleibt leer (nie updated_at/created_at)",
    Boolean(fb) && fb.publishedAt === null);

  // Dynamik ohne belegtes Quellendatum: sichtbar (Quelle vorhanden, Frische-Gate
  // via created_at), aber KEINE Kartenzeit aus created_at und KEIN falsches
  // "Aktualisiert heute" im Radar-Kopf (Review-Befund F3).
  const koDyn = {
    ...base, id: "kd", vorgang_id: "vd",
    display_title: "Die Linke Dynamik ohne Quellendatum",
    parteien: ["Die Linke"], source_document_count: 3,
    updated_at: iso(3600e3), created_at: iso(3600e3)
  };
  const dynState = radarState.buildCurrentRadarState({
    profile: { id: "u1", fullName: "Erika Beispielfrau", party: "Die Linke" },
    decisions: [{ knowledge_object_id: "kd", vorgang_id: "vd", score: 60, matched_features: [{ type: "partei", value: "Die Linke" }] }],
    kosById: { kd: koDyn }, knowledgeObjects: [koDyn],
    sourcesByVorgang: { vd: [{ id: "d9", url: "https://www.beispiel.de/politik/artikel-9", link_type: "direct", source_type: "media" }] },
    now: nowDate
  });
  const dyn = dynState.dynamics.find((d) => d.vorgangId === "vd");
  check("Dynamik ohne Quellendatum bleibt sichtbar (Frische-Gate via Ersterfassung)", Boolean(dyn));
  check("Dynamik-Anzeigezeit bleibt leer (created_at ist keine Veroeffentlichung)",
    Boolean(dyn) && dyn.lastUpdatedAt == null);
  check("Radar-Kopf ohne belegtes Quellendatum: lastUpdated leer + Status 'stale' (kein 'Aktualisiert heute')",
    dynState.lastUpdated == null && dynState.status === "stale");
}

// ─────────────────────────────────────────────────────────────────────────────
// B) Client (vm): Leerzustaende, fehlende Daten, Buero-Dubletten
// ─────────────────────────────────────────────────────────────────────────────
function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__qpFaelle = {
    renderRadar: () => renderRadarView(),
    setBriefing: (b) => { briefing = b; },
    setDecisions: (d) => { decisions = d; },
    setSelectedOfficeDraft: (v) => { selectedOfficeDraft = v; },
    renderOfficeDetail: () => renderOfficeDraftDetail(),
    officeDraftSources: (d) => officeDraftSources(d),
    draftSourceCount: (d) => draftSourceCount(d),
    radarTime: (v) => radarTime(v),
    officeSourceDateLabel: (v) => officeSourceDateLabel(v),
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
  if (!sandbox.__qpFaelle) throw new Error("Quellenpflicht-Faelle-Hook nicht gesetzt");
  return sandbox.__qpFaelle;
}

const api = loadClient();
check("client.js laedt im vm (Faelle-Hook gesetzt)", Boolean(api && api.renderRadar));

console.log("— Fall 1+2+5: Radar-Leerzustaende —");
{
  // ALLE Items ohne oeffnende Quelle (ohne URL, Startseite, http) -> ehrlicher
  // GESAMT-Leerzustand, nicht vier leere Bereichs-Sektionen und keine Karten.
  const kaputt = (id, sourceUrl, title) => ({
    id, vorgangId: id, title, sourceName: "Quelle", sourceUrl, linkType: "direct",
    publishedAt: iso(3600e3), thumbnailUrl: null, mentionType: "directName",
    mentionLabel: "Namentlich erwähnt", mentionTone: "neutral", evidence: "…",
    relationType: "party", relationLabel: "Betrifft deine Partei",
    signalType: "rising", signalLabel: "Mehr Quellen", sourceCount: 3, lastUpdatedAt: iso(3600e3),
    shortSummary: "Kurz.", relationTypes: ["party"]
  });
  const state = {
    generatedAt: iso(0), lastUpdated: iso(3600e3), status: "fresh", profileId: "u1",
    summary: { line1: "x", line2: "", text: "x" },
    mentions: [kaputt("m1", "", "Karte-ohne-URL")],
    environment: { party: [kaputt("e1", "https://verlag.de/", "Karte-mit-Startseite")], constituency: [], committees: [] },
    dynamics: [kaputt("d1", "http://verlag.de/artikel-1", "Karte-mit-http")],
    articles: [kaputt("a1", "", "Artikel-ohne-URL")],
    quality: { status: "fresh", reason: null, lastUpdated: iso(3600e3), mentionsFound: 1, environmentMatched: 1, dynamicsDetected: 1, articleCount: 1, sourcesLoaded: true, hasThumbnails: false, thumbnailsAvailable: false }
  };
  api.setBriefing({ engine: "v3", currentRadarState: state });
  const html = api.renderRadar();
  check("Radar: KEINE der quellenlosen Karten erscheint",
    !html.includes("Karte-ohne-URL") && !html.includes("Karte-mit-Startseite")
    && !html.includes("Karte-mit-http") && !html.includes("Artikel-ohne-URL"));
  check("Radar: stattdessen der ehrliche Gesamt-Leerzustand",
    html.includes("Sobald neue Quellen zu dir") || /radar2-empty/.test(html));
  check("Radar: keine nolink-Karten als Ersatz", !html.includes("--nolink"));

  // Nur EIN Bereich betroffen -> Bereichs-Leerzustand, andere Bereiche normal.
  const teils = JSON.parse(JSON.stringify(state));
  teils.articles = [{ ...kaputt("a2", "https://verlag.de/politik/artikel-9", "Sichtbarer-Artikel"), relationTypes: ["party"] }];
  api.setBriefing({ engine: "v3", currentRadarState: teils });
  const html2 = api.renderRadar();
  check("Radar: Bereich mit oeffnbarem Artikel rendert die Karte", html2.includes("Sichtbarer-Artikel"));
  check("Radar: Bereich 'Über dich' ohne oeffnbare Items zeigt seinen ehrlichen Leerhinweis",
    html2.includes("Heute wurden keine direkten Erwähnungen gefunden"));
  check("Radar: Bereich 'Neue Dynamiken' ohne oeffnbare Items zeigt seinen ehrlichen Leerhinweis",
    html2.includes("Aktuell entsteht keine neue belegbare Dynamik"));
}

console.log("— Fall 4: fehlende Veroeffentlichungsdaten bleiben leer —");
{
  check("radarTime(null) ist leer (kein 1.1.1970)", api.radarTime(null) === "" && api.radarTime("") === "");
  check("officeSourceDateLabel(null/ungueltig) ist leer (kein 'Heute'-Fallback)",
    api.officeSourceDateLabel(null) === "" && api.officeSourceDateLabel("") === "" && api.officeSourceDateLabel("kein-datum") === "");

  // Radar-Karte mit publishedAt null: Karte erscheint (Quelle vorhanden), Zeit bleibt leer.
  const item = { id: "m1", vorgangId: "v1", title: "Erwaehnung-ohne-Datum", sourceName: "Quelle",
    sourceUrl: "https://q.de/politik/artikel-1", linkType: "direct", publishedAt: null,
    mentionType: "directName", mentionLabel: "Namentlich erwähnt", mentionTone: "neutral", evidence: "…", thumbnailUrl: null };
  const state = {
    generatedAt: iso(0), lastUpdated: null, status: "stale", profileId: "u1",
    summary: { line1: "", line2: "", text: "" },
    mentions: [item], environment: { party: [], constituency: [], committees: [] }, dynamics: [], articles: [],
    quality: { status: "stale", reason: null, lastUpdated: null, mentionsFound: 1, environmentMatched: 0, dynamicsDetected: 0, articleCount: 0, sourcesLoaded: true, hasThumbnails: false, thumbnailsAvailable: false }
  };
  api.setBriefing({ engine: "v3", currentRadarState: state });
  const html = api.renderRadar();
  check("Radar: Karte ohne Veroeffentlichungsdatum erscheint MIT Quelle, aber OHNE Zeitangabe",
    html.includes("Erwaehnung-ohne-Datum") && !html.includes("radar2-time") && !html.includes("1970") && !html.includes("1. Jan"));
  check("Radar-Kopf: Inhalt ohne belegtes Datum -> 'Ohne belegtes Quellendatum' (nicht 'Noch keine Radar-Daten')",
    html.includes("Ohne belegtes Quellendatum") && !html.includes("Noch keine Radar-Daten"));
}

console.log("— Fall 3: doppelte Buero-Quellen —");
{
  const a = { sourceName: "Beispielmedien", url: "https://www.beispielmedien.de/politik/artikel-7", linkType: "direct", publishedAt: iso(3600e3), sourceUrl: "https://www.beispielmedien.de" };
  // Dieselbe Quelle als Slash-/Gross-Klein-Variante (typische Dublettenformen).
  const aSlash = { ...a, url: "https://www.beispielmedien.de/politik/artikel-7/" };
  const aCase = { ...a, url: "https://WWW.Beispielmedien.de/politik/artikel-7" };
  const decision = { id: "dec-1", signalId: "sig-1", title: "Thema", decision: "Sofort reagieren",
    primarySource: a, sources: [a, aSlash, aCase], sourceCount: 3 };
  const liste = api.officeDraftSources(decision);
  check("Buero: Primaerquelle + Slash-/Case-Dubletten -> genau EINE Quelle in der Liste", liste.length === 1);
  check("Buero: Zaehler folgt der deduplizierten Liste (1)", api.draftSourceCount(decision) === 1);

  const formats = api.formats();
  api.setBriefing({ engine: "v3", generatedAt: iso(0) });
  api.setDecisions([decision]);
  api.setSelectedOfficeDraft({ decision, format: formats[0], text: "Absatz.", provenance: "Regelbasiert erstellt" });
  const html = api.renderOfficeDetail();
  check("Buero-Detail: Singular 'Basiert auf 1 Quelle' (kein Plural, keine Doppelzaehlung)",
    html.includes("Basiert auf 1 Quelle") && !html.includes("Basiert auf 2") && !html.includes("Basiert auf 3"));
  check("Buero-Detail: Quellenliste zeigt 'Quellen (1)'", html.includes("Quellen (1)"));
}

console.log("— Fall 3b: Zaehler folgt auch groesseren Quellenmengen —");
{
  const mk = (n) => ({ sourceName: `Quelle ${n}`, url: `https://medien-${n}.de/politik/artikel-${n}`, linkType: "direct", publishedAt: iso(n * 3600e3), sourceUrl: `https://medien-${n}.de` });
  const srcs = [mk(1), mk(2), mk(3)];
  const decision = { id: "dec-3", signalId: "sig-3", title: "Thema", decision: "Sofort reagieren",
    primarySource: srcs[0], sources: srcs, sourceCount: 3 };
  check("Buero: drei unterschiedliche oeffnende Quellen -> Liste 3, Zaehler 3",
    api.officeDraftSources(decision).length === 3 && api.draftSourceCount(decision) === 3);
  // Server-Kappung: der kompakte /api/app/start-Payload muss mindestens 5 Quellen je
  // Item durchlassen (Review-Befund: bei Kappung 2 konnte der Zaehler nie stimmen).
  const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
  check("Server: compactItem kappt sources auf 5 (nicht mehr 2)",
    /compact\.sources = compactSources\(item\.sources, 5\)/.test(serverSrc));
  check("Server: compactSource reicht den Artikeltitel durch (Buero-Quellenliste)",
    /title: truncateText\(source\.title, 120\)/.test(serverSrc));
}

console.log("— Fall 5: ehrlicher Buero-Leerzustand —");
{
  const decision = { id: "dec-2", signalId: "sig-2", title: "Thema ohne Quelle", decision: "Sofort reagieren",
    primarySource: { sourceName: "Nur Name" }, sources: [{ sourceName: "Nur Name" }], sourceCount: 1 };
  check("Buero: Quellen ohne oeffnende URL ergeben eine leere Liste", api.officeDraftSources(decision).length === 0);
  const formats = api.formats();
  api.setSelectedOfficeDraft({ decision, format: formats[0], text: "Absatz.", provenance: "Regelbasiert erstellt" });
  const html = api.renderOfficeDetail();
  check("Buero-Detail: ehrlicher Hinweis statt leerer Behauptung",
    html.includes("keine öffnbare Originalquelle"));
  check("Buero-Detail: KEINE 'Basiert auf N Quellen'-Zeile ohne oeffnende Quellen",
    !html.includes("Basiert auf"));
  check("Buero-Detail: Quellenblock zeigt ehrlich 'Quellen (0)'", html.includes("Quellen (0)"));
}

console.log(`\n${passed}/${passed + failed} Quellenpflicht-Fall-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
