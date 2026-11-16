"use strict";

// P0-1 — Laufzeit/Telemetrie JEDES EINZELNEN Quellenabrufs.
//
// Belegt fuer den pro-Quelle-Telemetrie-Layer:
//  * buildSourceTelemetryRows erzeugt je Quelle die geforderten technischen Felder
//    (runId, sourceId, Name, Ebene, Ausfuehrungsort, geplanter/Folgeprozess, Start/
//    Ende/Dauer, Status, gefundene/neue/doppelte/ignorierte Dokumente, Fehlercode,
//    Wiederholung, Quellenmodus) mit ECHTEN Werten (keine Schaetzung).
//  * classifyCrawlError verdichtet rohe Fehler zu inhaltsfreien Codes (kein Rohtext).
//  * Datensparsamkeit: KEIN Dokumenttitel/-inhalt landet in der Telemetrie.
//  * persistSourceCrawlTelemetry ist DEFAULT AUS (freigabepflichtig) -> No-Op ohne
//    Flag; mit Flag ruft es den injizierten Writer genau einmal.
//
// KEIN Netz, KEINE KI. Nur synthetische Testdaten.

const {
  classifyCrawlError, normalizeLevel, buildSourceTelemetryRows,
  sourceTelemetryEnabled, persistSourceCrawlTelemetry
} = require("../lib/helmut/source-telemetry");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── classifyCrawlError: inhaltsfreie Codes ─────────────────────────────────────
check("Fehlercode timeout", classifyCrawlError("Supabase storage timed out after 7000ms") === "timeout");
check("Fehlercode empty-feed", classifyCrawlError("https://x/rss: empty feed") === "empty-feed");
check("Fehlercode http-5xx", classifyCrawlError("request failed 503 Service Unavailable") === "http-5xx");
check("Fehlercode http-429", classifyCrawlError("429 Too Many Requests") === "http-429");
check("Fehlercode http-4xx", classifyCrawlError("404 Not Found") === "http-4xx");
check("Fehlercode dns", classifyCrawlError("getaddrinfo ENOTFOUND example.org") === "dns");
check("Fehlercode unknown", classifyCrawlError("irgendein seltsamer zustand") === "unknown");
check("Echter RSS-Huellenfehler wird als Parserfehler erkannt", classifyCrawlError("Ungültige RSS-Antwort des Metadatenfeeds") === "parse");
check("Unlesbare RSS-Eintraege werden als Parserfehler erkannt", classifyCrawlError("RSS-Einträge ohne verwertbare Titel und Links") === "parse");
check("Leerer Kandidat verdeckt keinen zweiten HTTP-Fehler", classifyCrawlError("erster: empty feed; zweiter: HTTP 404") === "http-4xx");
check("Fehlercode leer -> null", classifyCrawlError("") === null);
// Der ROHE Fehlertext (koennte URL enthalten) darf NICHT im Code auftauchen:
check("Fehlercode enthaelt keine URL/keinen Rohtext", !/example\.org|https?:/.test(classifyCrawlError("getaddrinfo ENOTFOUND https://example.org/secret")));

// ── normalizeLevel: Kanon klein (P1-2) ────────────────────────────────────────
check("normalizeLevel Bund -> bund", normalizeLevel("Bund") === "bund");
check("normalizeLevel leer -> unknown", normalizeLevel("") === "unknown");

// ── buildSourceTelemetryRows: alle Felder, echte Werte ─────────────────────────
const results = [
  { sourceId: "src-bmas", sourceName: "BMAS", ok: true, itemCount: 5, duplicateItems: 1, ignoredItems: 0,
    startedAt: "2026-07-16T04:03:00.000Z", finishedAt: "2026-07-16T04:03:01.200Z", durationMs: 1200, status: "ok",
    items: [{ title: "GEHEIM Schlagzeile die nie in Telemetrie darf" }] },
  { sourceId: "src-broken", sourceName: "Kaputt", ok: false, itemCount: 0, error: "503 Service Unavailable",
    startedAt: "2026-07-16T04:03:00.000Z", finishedAt: "2026-07-16T04:03:07.000Z", durationMs: 7000, status: "error", items: [] }
];
const sourcesById = {
  "src-bmas": { id: "src-bmas", name: "BMAS", category: "offiziell" },
  "src-broken": { id: "src-broken", name: "Kaputt", category: "medien" }
};
const rows = buildSourceTelemetryRows({
  runId: "crawl-20260716T040300-abcde",
  plannedProcess: "full",
  followUpProcess: "understanding",
  sourceMode: "on",
  location: "fra1",
  results,
  sourcesById,
  defaultLevel: "Bund",
  newBySource: new Map([["src-bmas", 4]])
});

check("Eine Zeile je Quellenabruf", rows.length === 2);
const r0 = rows[0];
const REQUIRED = ["run_id", "source_id", "source_name", "political_level", "execution_location", "planned_process",
  "started_at", "finished_at", "duration_ms", "status", "found_documents", "new_documents", "duplicate_documents",
  "ignored_documents", "error_code", "retry_count", "follow_up_process", "source_mode"];
check("Alle Pflichtfelder vorhanden", REQUIRED.every((k) => k in r0), REQUIRED.filter((k) => !(k in r0)).join(","));
check("runId korrekt", r0.run_id === "crawl-20260716T040300-abcde");
check("sourceId/Name korrekt", r0.source_id === "src-bmas" && r0.source_name === "BMAS");
check("politische Ebene klein (bund)", r0.political_level === "bund");
check("Ausfuehrungsort", r0.execution_location === "fra1");
check("geplanter Prozess/Folgeprozess", r0.planned_process === "full" && r0.follow_up_process === "understanding");
check("Quellenmodus", r0.source_mode === "on");
check("echte Dauer je Abruf", r0.duration_ms === 1200);
check("gefundene Dokumente", r0.found_documents === 5);
check("neue Dokumente (ueber sourceId zugeordnet)", r0.new_documents === 4);
check("doppelte Dokumente (in-Lauf)", r0.duplicate_documents === 1);
check("ignorierte Dokumente (Cap)", r0.ignored_documents === 0);
check("Status ok", r0.status === "ok");
check("Fehlercode bei ok -> null", r0.error_code === null);
check("Wiederholungsnummer default 0", r0.retry_count === 0);

const r1 = rows[1];
check("Fehlerzeile: Status error", r1.status === "error");
check("Fehlerzeile: klassifizierter Fehlercode http-5xx", r1.error_code === "http-5xx");
check("Fehlerzeile: neue Dokumente 0", r1.new_documents === 0);

const vertagt = {
  sourceId: "src-limit", sourceName: "Quelle", ok: false, status: "error", itemCount: 0,
  items: [], retryCount: 0, error: "anbietergrenze: anbietergrenze-minutengrenze",
  anbieterVertagung: { vorAbruf: true, grund: "anbietergrenze-minutengrenze", wartenMs: 1000,
    bereich: { anbieter: "quelle", modell: "example.org", klasse: "quellenabruf" } },
  quellenAbrufBeleg: { version: 1, gestarteteAbrufe: 0, zentraleVertagungen: 1 }
};
const zeile = (result, extra = {}) => buildSourceTelemetryRows({ results: [result], ...extra })[0];
check("Belegte zentrale Null-Abruf-Vertagung hat eigenen Status/Code",
  zeile(vertagt).status === "provider-deferred" && zeile(vertagt).error_code === "provider-limit");
check("Tagesgrenze wird ebenfalls strukturiert behandelt", zeile({ ...vertagt,
  anbieterVertagung: { ...vertagt.anbieterVertagung, grund: "anbietergrenze-tagesgrenze" } }).status === "provider-deferred");
for (const [name, changed] of [
  ["nur Fehlertext", { anbieterVertagung: null, quellenAbrufBeleg: null }],
  ["nur vorAbruf", { quellenAbrufBeleg: null }],
  ["vorheriger echter Abruf", { quellenAbrufBeleg: { ...vertagt.quellenAbrufBeleg, gestarteteAbrufe: 1 } }],
  ["unbekannte Belegversion", { quellenAbrufBeleg: { ...vertagt.quellenAbrufBeleg, version: 2 } }],
  ["keine zentrale Reservierung", { quellenAbrufBeleg: { ...vertagt.quellenAbrufBeleg, zentraleVertagungen: 0 } }],
  ["nicht pruefbare Anbietersteuerung", { anbieterVertagung: { ...vertagt.anbieterVertagung, grund: "anbietersteuerung-nicht-pruefbar" } }],
  ["Verlust nach Abruf", { anbieterVertagung: { ...vertagt.anbieterVertagung, vorAbruf: false } }],
  ["ungueltige Wartezeit", { anbieterVertagung: { ...vertagt.anbieterVertagung, wartenMs: "1000" } }],
  ["andere Verarbeitungsklasse", { anbieterVertagung: { ...vertagt.anbieterVertagung, bereich: { ...vertagt.anbieterVertagung.bereich, klasse: "llm" } } }],
  ["erfasster Retry", { retryCount: 1 }],
  ["vorheriger HTTP503", { error: "503 Service Unavailable; anbietergrenze-minutengrenze", quellenAbrufBeleg: null }],
  ["vorheriger HTTP429", { error: "429 Too Many Requests; anbietergrenze-minutengrenze", quellenAbrufBeleg: null }],
  ["vorheriger Parserfehler", { error: "Ungültige RSS-Antwort des Metadatenfeeds; anbietergrenze-minutengrenze", quellenAbrufBeleg: null }],
  ["vorheriger Leerabruf", { error: "empty feed; anbietergrenze-minutengrenze", quellenAbrufBeleg: null }],
  ["vorhandene Dokumente", { itemCount: 1, items: [{ title: "Darf nicht verschwinden" }] }]
]) check(`${name} bleibt Fehler`, zeile({ ...vertagt, ...changed }).status === "error");
check("Bestaetigte neue Dokumente widersprechen Null-Abruf-Beleg",
  zeile(vertagt, { newBySource: { "src-limit": 1 } }).status === "error");
check("URL-/Fehlertextfragmente koennen einen vollstaendigen Null-Abruf-Beleg nicht umdeuten",
  zeile({ ...vertagt, error: "https://example.org/parse/503.xml: anbietergrenze-minutengrenze" }).status === "provider-deferred");
check("Historischer unbekannter Fehler bleibt Fehler/unknown",
  zeile({ ...results[1], error: "anbietergrenze: anbietergrenze-minutengrenze" }).error_code === "unknown");

// ── Datensparsamkeit: KEIN Dokumenttitel/-inhalt im Serialisat ─────────────────
const serialized = JSON.stringify(rows);
check("Kein Dokumenttitel/-inhalt in der Telemetrie", !serialized.includes("GEHEIM") && !serialized.includes("Schlagzeile"));
check("Kein 'items'-Feld in den Zeilen", !("items" in r0) && !("items" in r1));

// ── persistSourceCrawlTelemetry: Freigabe-Gate (default aus) ───────────────────
(async () => {
  // Echte Crawler-/Anbieterumschliessung, ausschliesslich lokales HTTP. Anders
  // als ein fetchUrl-Fake zaehlt dies tatsaechliche Abrufstarts aller Feedstufen.
  const http = require("http");
  const C = require("../lib/helmut/crawler");
  const A = require("../lib/helmut/anbieter-steuerung");
  const CELLAR = require("../lib/helmut/quellen-eurlex-cellar"), cellarCrawl = CELLAR.crawl;
  const original = { aktiv: A.steuerungAktiv, reserviere: A.reserviere, melde: A.melde };
  const oldError = console.error;
  let erlaubt = 0, hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    if (req.url.startsWith("/503")) { res.writeHead(503); res.end("nicht verfuegbar"); }
    else if (req.url.startsWith("/parse")) { res.end("<html>keine RSS-Antwort</html>"); }
    else if (req.url.startsWith("/redirect")) { res.writeHead(302, { location: "/503" }); res.end(); }
    else res.end("<rss><channel></channel></rss>");
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    A.steuerungAktiv = () => true;
    A.reserviere = async () => erlaubt-- > 0 ? { erlaubt: true } : {
      erlaubt: false, wartenMs: 1000, grund: "anbietergrenze-minutengrenze"
    };
    A.melde = async () => ({ gemeldet: true });
    console.error = () => {}; // erwartete Crawlerfehler, keine Rohfehlerausgabe
    const crawl = async (first, count, opts = {}) => {
      erlaubt = count; hits = 0;
      const result = await C.crawlAllSources([{ id: "src-local", name: "Lokaler Test", type: "offiziell",
        active: true, crawlMethod: "rss", url: base + "/html", rssUrls: [base + first, base + "/zweiter"] }], opts);
      const row = zeile(result.results[0]);
      return { result: result.results[0], row, hits };
    };
    const pure = await crawl("/leer", 0);
    check("Crawler: zentrale Minute startet null HTTP-Aufrufe", pure.hits === 0);
    check("Crawlerbeleg erreicht Telemetrie als Vertagung",
      pure.result.quellenAbrufBeleg?.gestarteteAbrufe === 0 && pure.row.status === "provider-deferred");
    for (const [first, code] of [["/503", "http-5xx"], ["/parse", "parse"], ["/leer", "empty-feed"], ["/redirect", "http-5xx"]]) {
      const mixed = await crawl(first, 1);
      check(`Crawler: ${first} vor Minute bleibt echter Fehler`, mixed.hits >= 1
        && mixed.row.status === "error" && mixed.row.error_code === code && !mixed.result.quellenAbrufBeleg);
    }
    const retry = await crawl("/503/news.google.test", 1, { googleGate: {
      schedule: f => f(), report() {}, isOpen: () => false, consumeRetry: () => true, state: () => ({ open: false })
    }, hardeningConfig: { retryMax: 1, retryBaseMs: 1, retryCapMs: 1 }, sleep: async () => {} });
    check("Google-Retry: 503 vor Minutenvertagung wird nicht zu Nichtabruf",
      retry.hits === 1 && retry.result.retryCount === 1 && retry.row.status === "error" && !retry.result.quellenAbrufBeleg);
    const fake = await crawl("/leer", 0, { fetchUrl: async (...args) => C.fetchUrl(...args) });
    check("Injizierter Fetchadapter erzeugt keinen Produktions-Nullabrufbeleg",
      fake.hits === 0 && !fake.result.quellenAbrufBeleg && fake.row.status === "error");
    erlaubt = 1; hits = 0;
    const parallel = await C.crawlAllSources(["a", "b"].map(id => ({ id, name: id, active: true,
      crawlMethod: "rss", url: base + "/html", rssUrl: base + "/503" })));
    check("Parallele Quellen teilen keinen Abrufzaehler", hits === 1
      && !parallel.results[0].quellenAbrufBeleg && parallel.results[1].quellenAbrufBeleg?.gestarteteAbrufe === 0
      && zeile(parallel.results[1]).status === "provider-deferred");
    // Amtlicher nativer Dispatch mit kleinem Metadatenstub; alle Abrufe gehen
    // weiter durch den echten lokalen HTTP-/Anbieterpfad, kein externer Zugriff.
    const native = { ...require("../lib/helmut/quellenarchitektur/seeds/parlamentsdaten-quellen").PARLAMENTSDATEN_QUELLEN[0],
      active: true, retrievalPathId: "rp-eurlex-amtsblatt-l-rss", eurlexExcerptApproved: true };
    CELLAR.crawl = async ({ fetchUrl }) => { await fetchUrl(base + "/leer"); return []; };
    erlaubt = 1; hits = 0;
    let callbacks = 0;
    const phased = await C.crawlAllSources([native], { cellarExcerpt: async (items, source, fetchUrl) => {
      callbacks++; await fetchUrl(base + "/original"); return items;
    } });
    check("Nativer Callback nach Metadatenabruf verliert den bisherigen echten Versuch nicht",
      callbacks === 1 && hits === 1 && !phased.results[0].quellenAbrufBeleg && zeile(phased.results[0]).status === "error");
    erlaubt = 10; hits = 0;
    const childDeadline = await C.crawlAllSources([native], { cellarExcerpt: async (items, source, fetchUrl) => {
      await fetchUrl(base + "/original", 0, { deadlineMs: 1234, now: () => 1234 }); return items;
    } });
    check("Ohne Parentfrist bleiben lokale Callbackfrist und Funktionsuhr erhalten",
      hits === 1 && childDeadline.results[0].ok === false && childDeadline.results[0].error === "quellenabruf-zeitbudget"
      && !childDeadline.results[0].anbieterVertagung);
    const sf = require("../lib/helmut/quellenarchitektur/source-failure");
    const now = Date.parse("2026-11-16T09:00:00Z");
    const succession = [3, 2, 1].map(n => ({ ...pure.row, finished_at: new Date(now - n * 60000).toISOString() }));
    const h = sf.buildLaufhistorie(succession, { now }).get("src-local");
    const health = sf.klassifiziereQuelle({ sourceId: "src-local", historie: h, now });
    check("Drei echte zentrale Vertagungen ergeben null Versuche/Fehler/Erfolge",
      h.versuche === 0 && h.fehler === 0 && h.fehlerserie === 0 && h.erfolge === 0 && h.vertagt === 3);
    check("Vertagungsfolge behauptet keinen Versorgungserfolg oder Circuit",
      health.klasse === "gedrosselt" && health.ursache === "provider-limit" && !sf.istWirksam(health));
  } finally {
    A.steuerungAktiv = original.aktiv; A.reserviere = original.reserviere; A.melde = original.melde;
    CELLAR.crawl = cellarCrawl;
    console.error = oldError;
    await new Promise(resolve => server.close(resolve));
  }
  // Default AUS: kein Writer-Aufruf.
  let writes = 0;
  const insert = async () => { writes += 1; };
  const offResult = await persistSourceCrawlTelemetry(rows, { enabled: () => false, insert });
  check("Default AUS: No-Op (skipped=disabled)", offResult.skipped === true && offResult.reason === "disabled" && writes === 0);

  // AN + Writer: genau ein Write, persisted = Zeilenzahl.
  const onResult = await persistSourceCrawlTelemetry(rows, { enabled: () => true, insert });
  check("AN: genau ein Writer-Aufruf", writes === 1);
  check("AN: persisted = Zeilenzahl", onResult.persisted === rows.length);

  // Leere Eingabe: No-Op.
  const emptyResult = await persistSourceCrawlTelemetry([], { enabled: () => true, insert });
  check("Leere Eingabe: No-Op", emptyResult.skipped === true && writes === 1);

  // sourceTelemetryEnabled respektiert Default (kein Flag gesetzt = aus).
  delete process.env.HELMUT_SOURCE_TELEMETRY;
  check("sourceTelemetryEnabled ohne Flag -> false", sourceTelemetryEnabled() === false);

  console.log(`\n${passed}/${passed + failed} Source-Telemetrie-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch(error => { console.error(error); process.exitCode = 1; });
