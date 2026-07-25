"use strict";

// Regressionssuite — Incident 2026-07-25: "141 von 144 Quellen fehlgeschlagen".
// ============================================================================
// BESTÄTIGTE URSACHE (Production-Belege, siehe docs/betrieb/incident_2026-07-25_
// crawl_mandantenamplifikation.md):
//   Der Crawl-Cron durchläuft ALLE aktiven Mandate sequenziell im SELBEN Prozess,
//   also hinter DERSELBEN Egress-IP. 146 von 163 Abrufwegen sind Google-News-
//   Suchen, und ~138 davon sind mandantenunabhängig IDENTISCH. Jedes Mandat holte
//   dieselben URLs erneut. Google drosselt pro IP: Mandat 1 lief gesund (145/145),
//   Mandat 2 drei Minuten später lief in Timeouts/HTTP 503, der Circuit Breaker
//   öffnete korrekt — und die 130 vom Breaker beendeten Wege wurden als 130
//   EINZELNE Quellenfehler gezählt ("141/144"). KEINE Quelle war defekt: alle 141
//   Wege waren im Lauf drei Minuten davor erfolgreich.
//
// Diese Suite deckt alle bestätigten Teilursachen ab:
//   1. Geteilte Abrufwege werden je Cron-Durchlauf nur EINMAL geholt (kein
//      Doppel-Crawl, keine selbst verursachte Drosselung)
//   2. Mandantseigene Wege und ALLE direkten Quellen laufen unverändert weiter
//   3. Ein zentraler Breaker-Abbruch erzeugt KEINE N Einzelquellenfehler
//   4. Ein bewusst reduzierter Lauf gilt nicht als degradiert
//   5. Ein ECHTER Aggregator-Ausfall alarmiert weiterhin (kein blinder Fleck)
//   6. Rollierender Health-Report meldet nicht mehr "wiederholt degradiert" für
//      Folge-Mandate desselben Durchlaufs
//   7. Die Watchdog-Lage-Achse erzeugt keinen Takt-Fehlalarm mehr
//   8. Telemetrie zählt korrekt und bleibt inhaltsfrei (keine URLs/Secrets)
//
// Der Integrationsteil läuft gegen einen lokalen Mock-Server (Netz-Guard erlaubt
// localhost); die Provider-Erkennung matcht auf "news.google." im URL-String,
// deshalb nutzt der Mock localhost-URLs mit "news.google."-PFAD.

process.env.CRAWLER_TIMEOUT_MS = "400"; // vor dem require lesen (Modul-Konstante)

const http = require("http");
const { crawlAllSources } = require("../lib/helmut/crawler");
const {
  createGoogleNewsGate,
  createSharedFetchLedger,
  sharedFetchKey,
  sharedPathDedupEnabled,
  googleHardeningConfig
} = require("../lib/helmut/google-news-hardening");
const {
  classifyCrawlRunState,
  buildProviderBreakdown,
  summarizeErrorCodes,
  RUN_STATES
} = require("../lib/helmut/crawl-run-state");
const { buildRollingCrawlHealth, isReducedRun, DEGRADED_STATES } = require("../lib/helmut/rolling-health");
const { buildSourceTelemetryRows, classifyCrawlError } = require("../lib/helmut/source-telemetry");
const { _lageAxis, classifyOperationalState, STATES } = require("../lib/helmut/watchdog-state");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const RSS = (title) => `<?xml version="1.0"?><rss><channel><item><title>${title}</title><link>http://127.0.0.1:1/artikel/${encodeURIComponent(title)}</link><pubDate>Sat, 25 Jul 2026 04:00:00 GMT</pubDate><description>Testinhalt</description></item></channel></rss>`;

// Zählt Treffer je Pfad — damit ist "kein Doppel-Abruf" MESSBAR statt behauptet.
const hits = new Map();
const server = http.createServer((req, res) => {
  const url = req.url || "";
  hits.set(url, (hits.get(url) || 0) + 1);
  if (url.includes("mode=503")) {
    // Was Google im Incident wirklich lieferte: 503, nicht 429/403.
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("Service Unavailable");
    return;
  }
  if (url.includes("mode=429")) {
    res.writeHead(429, { "Content-Type": "text/plain", "Retry-After": "1" });
    res.end("Too Many Requests");
    return;
  }
  if (url.includes("mode=403")) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  if (url.includes("mode=hang")) { setTimeout(() => { try { res.end(); } catch (_) {} }, 3000); return; }
  res.writeHead(200, { "Content-Type": "application/xml" });
  res.end(RSS(`Weg ${url.slice(0, 40)}`));
});

// GETEILTER Weg: identische URL für jedes Mandat (Paket-/Planweg).
function sharedGoogleSource(id, mode = "ok") {
  const u = `http://127.0.0.1:${server.address().port}/news.google.com/rss/search?q=geteilt-${id}&mode=${mode}`;
  return { id: `shared-${id}`, name: `geteilt ${id}`, type: "media", active: true, crawlMethod: "rss", url: u, rssUrl: u };
}
// MANDANTSEIGENER Weg: URL enthält das Mandat (z. B. Personen-Newssuche).
function tenantGoogleSource(tenant, mode = "ok") {
  const u = `http://127.0.0.1:${server.address().port}/news.google.com/rss/search?q=${tenant}&mode=${mode}`;
  return { id: `person-${tenant}`, name: `${tenant} News-Suche`, type: "media", active: true, crawlMethod: "rss", url: u, rssUrl: u };
}
function directSource(id, mode = "ok") {
  const u = `http://127.0.0.1:${server.address().port}/amtlich/${id}?mode=${mode}`;
  return { id, name: id, type: "ministry", active: true, crawlMethod: "rss", url: u, rssUrl: u };
}
const countHits = (needle) => Array.from(hits.entries())
  .filter(([u]) => u.includes(needle)).reduce((s, [, n]) => s + n, 0);

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const hardening = { retryMax: 0, retryBaseMs: 5, retryCapMs: 10, retryAfterCapMs: 10 };

  // ═══════════════════════════════════════════════════════════════════════════
  // TEIL A — Gedächtnis geteilter Abrufwege (reine Logik)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    check("Kill-Switch: Default an, 'off' schaltet Dedup aus",
      sharedPathDedupEnabled({}) === true
      && sharedPathDedupEnabled({ HELMUT_SHARED_PATH_DEDUP: "off" }) === false
      && sharedPathDedupEnabled({ HELMUT_SHARED_PATH_DEDUP: "aus" }) === false);

    check("Config trägt Fenster + Schalter", (() => {
      const c = googleHardeningConfig({});
      return c.sharedPathDedup === true && c.sharedPathWindowMs === 900000;
    })());

    // Nur Google-Wege bekommen einen Schlüssel — direkte Quellen NIE.
    check("Schlüssel nur für Google-Wege (direkte Quellen sind nie dedupliziert)",
      sharedFetchKey({ url: "https://news.google.com/rss/search?q=a" }) !== null
      && sharedFetchKey({ url: "https://www.bmas.de/rss" }) === null
      && sharedFetchKey({}) === null);

    // Schlüssel ist URL-basiert und reihenfolgeunabhängig — NICHT id-basiert:
    // gleiche id mit anderer URL darf NICHT als geteilt gelten.
    check("Schlüssel ist URL-basiert und stabil sortiert", (() => {
      const a = sharedFetchKey({ rssUrls: ["https://news.google.com/x", "https://news.google.com/y"] });
      const b = sharedFetchKey({ rssUrls: ["https://news.google.com/y", "https://news.google.com/x"] });
      const c = sharedFetchKey({ url: "https://news.google.com/z" });
      return a === b && a !== c;
    })());

    let clock = 1000;
    const ledger = createSharedFetchLedger({ windowMs: 5000, now: () => clock });
    const shared = { id: "s1", url: "https://news.google.com/rss/search?q=geteilt" };
    const own = { id: "s2", url: "https://news.google.com/rss/search?q=cem-ince" };
    const direct = { id: "s3", url: "https://www.bmas.de/rss" };

    check("frischer Weg gilt nicht als schon abgerufen", ledger.seenRecently(shared) === false);
    ledger.note(shared);
    check("nach dem Vermerken gilt der identische Weg als abgerufen", ledger.seenRecently(shared) === true);
    check("mandantseigener Weg (andere URL) bleibt unberührt", ledger.seenRecently(own) === false);
    check("direkte Quelle wird nie übersprungen (kein Schlüssel)",
      ledger.note(direct) === false && ledger.seenRecently(direct) === false);

    clock += 4999;
    check("innerhalb des Fensters weiter übersprungen", ledger.seenRecently(shared) === true);
    clock += 2;
    check("nach Fensterablauf wieder abrufbar (nächster Cron holt neu)", ledger.seenRecently(shared) === false);

    // Kein unbegrenztes Wachstum in einem langlebigen warmen Container.
    const bounded = createSharedFetchLedger({ windowMs: 1e9, maxEntries: 20, now: () => 1 });
    for (let i = 0; i < 200; i += 1) bounded.note({ url: `https://news.google.com/rss/search?q=${i}` });
    check("Gedächtnis ist größenbegrenzt (kein Speicherleck)", bounded.size() <= 20, `size=${bounded.size()}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEIL B — Der Incident am ECHTEN Crawlpfad: zwei Mandate, ein Durchlauf
  // ═══════════════════════════════════════════════════════════════════════════
  {
    hits.clear();
    const ledger = createSharedFetchLedger({ windowMs: 900000 });
    const sharedPaths = Array.from({ length: 12 }, (_, i) => sharedGoogleSource(`p${i}`));

    // Mandat 1 (alphabetisch erstes) — holt alles.
    const t1 = await crawlAllSources(
      [...sharedPaths, tenantGoogleSource("annika-klose"), directSource("bmas")],
      { googleGate: createGoogleNewsGate({ concurrency: 3, minSpacingMs: 0, breakerMinObservations: 999 }), hardeningConfig: hardening, sharedLedger: ledger }
    );
    check("Mandat 1: alle Wege erfolgreich (Referenzlauf)",
      t1.successfulSources === 14 && t1.failedSources === 0 && t1.skippedSources === 0,
      `ok=${t1.successfulSources} failed=${t1.failedSources} skipped=${t1.skippedSources}`);
    const hitsAfterT1 = countHits("geteilt-");
    check("Mandat 1: jeder geteilte Weg genau einmal abgerufen", hitsAfterT1 === 12, `hits=${hitsAfterT1}`);

    // Mandat 2 (im selben Durchlauf) — dieselben geteilten Wege + eigener Weg.
    const t2 = await crawlAllSources(
      [...sharedPaths, tenantGoogleSource("cem-ince"), directSource("bmas")],
      { googleGate: createGoogleNewsGate({ concurrency: 3, minSpacingMs: 0, breakerMinObservations: 999 }), hardeningConfig: hardening, sharedLedger: ledger }
    );
    check("KEIN DOPPEL-CRAWL: geteilte Wege im zweiten Mandat nicht erneut abgerufen",
      countHits("geteilt-") === 12, `hits=${countHits("geteilt-")}`);
    check("Mandat 2: geteilte Wege als 'skipped-shared' markiert",
      t2.sharedSkippedSources === 12 && t2.skippedSources === 12,
      `shared=${t2.sharedSkippedSources} skipped=${t2.skippedSources}`);
    check("Mandat 2: Skips zählen WEDER als Erfolg NOCH als Fehler",
      t2.failedSources === 0 && t2.successfulSources === 2,
      `ok=${t2.successfulSources} failed=${t2.failedSources}`);
    check("Mandat 2: mandantseigener Google-Weg läuft weiter",
      t2.results.find((r) => r.sourceId === "person-cem-ince").ok === true
      && t2.results.find((r) => r.sourceId === "person-cem-ince").status !== "skipped-shared");
    check("Mandat 2: direkte Quelle läuft weiter (Priorität: Direktquellen nie bremsen)",
      t2.results.find((r) => r.sourceId === "bmas").ok === true
      && t2.results.find((r) => r.sourceId === "bmas").status !== "skipped-shared");
    check("Mandat 2 ist NICHT degradiert, sondern bewusst reduziert",
      classifyCrawlRunState({
        checkedSources: t2.checkedSources, successfulSources: t2.successfulSources,
        failedSources: t2.failedSources, skippedSources: t2.skippedSources,
        circuitOpenSources: t2.circuitOpenSources
      }) === "cooldown-reduziert");

    // Kill-Switch: ohne Ledger das Alt-Verhalten (Doppel-Abruf) — Rollback belegt.
    hits.clear();
    const legacy = await crawlAllSources([...sharedPaths, directSource("bmas")],
      { googleGate: createGoogleNewsGate({ concurrency: 3, minSpacingMs: 0, breakerMinObservations: 999 }), hardeningConfig: hardening, sharedLedger: null });
    check("Kill-Switch (kein Ledger): Alt-Verhalten, keine Shared-Skips",
      legacy.sharedSkippedSources === 0 && legacy.successfulSources === 13 && countHits("geteilt-") === 12);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEIL C — Zentraler Breaker-Abbruch ist KEIN N-facher Quellenfehler
  // ═══════════════════════════════════════════════════════════════════════════
  {
    hits.clear();
    // 503-Welle (genau das Muster aus dem Incident) über viele Google-Wege.
    const sources = [
      ...Array.from({ length: 20 }, (_, i) => sharedGoogleSource(`c${i}`, "503")),
      directSource("tagesschau"), directSource("deutschlandfunk")
    ];
    const gate = createGoogleNewsGate({ concurrency: 1, minSpacingMs: 0, breakerMinObservations: 3, breakerFailureRatio: 0.6 });
    const crawl = await crawlAllSources(sources, { googleGate: gate, hardeningConfig: hardening });
    const circuit = crawl.results.filter((r) => r.status === "circuit-open");

    check("503-Welle: Breaker greift, restliche Wege enden ohne Request (0 ms)",
      circuit.length > 0 && circuit.every((r) => r.durationMs === 0), `circuit=${circuit.length}`);
    check("Breaker-Wege tragen eigenen Status, nicht 'error'",
      circuit.every((r) => r.status === "circuit-open" && r.ok === false));
    check("KEINE N Einzelfehler: circuit-open zählt NICHT in failedSources",
      crawl.circuitOpenSources === circuit.length
      && crawl.failedSources === 20 - circuit.length,
      `failed=${crawl.failedSources} circuit=${crawl.circuitOpenSources}`);
    check("echte Abrufe stoppen nach Breaker-Öffnung (weit unter 20)",
      countHits("geteilt-") < 15, `hits=${countHits("geteilt-")}`);
    check("Direktquellen laufen trotz Aggregator-Totalausfall weiter",
      crawl.results.filter((r) => ["tagesschau", "deutschlandfunk"].includes(r.sourceId)).every((r) => r.ok === true));
    check("Lauf-Zustand benennt die zentrale Ursache",
      classifyCrawlRunState({
        checkedSources: crawl.checkedSources, successfulSources: crawl.successfulSources,
        failedSources: crawl.failedSources, skippedSources: crawl.skippedSources,
        circuitOpenSources: crawl.circuitOpenSources
      }) === "aggregator-gedrosselt");
  }

  // 403-Welle und Timeout-Welle: klassifiziert, Direktquellen unbeeinflusst.
  {
    for (const [mode, code] of [["403", "http-4xx"], ["429", "http-429"], ["hang", "timeout"]]) {
      const sources = [sharedGoogleSource(`w-${mode}`, mode), directSource(`amt-${mode}`)];
      const gate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 999 });
      const crawl = await crawlAllSources(sources, { googleGate: gate, hardeningConfig: hardening });
      const g = crawl.results.find((r) => r.sourceId === `shared-w-${mode}`);
      check(`${mode}-Welle: inhaltsfrei als ${code} klassifiziert, Direktquelle läuft`,
        !g.ok && classifyCrawlError(g.error) === code
        && crawl.results.find((r) => r.sourceId === `amt-${mode}`).ok === true,
        `code=${classifyCrawlError(g.error)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEIL D — Lauf-Klassifikation mit den ECHTEN Incident-Zahlen
  // ═══════════════════════════════════════════════════════════════════════════
  {
    check("Zustandskatalog enthält 'aggregator-gedrosselt'", RUN_STATES.includes("aggregator-gedrosselt"));

    // Der echte Lauf crawl-20260725040353-3kste: 144 geprüft, 3 ok,
    // 8 timeout + 3 http-5xx = 11 echte Fehler, 130 circuit-open.
    check("Incident-Lauf wird als zentrale Drosselung erkannt (nicht als 141 Quellenfehler)",
      classifyCrawlRunState({
        checkedSources: 144, successfulSources: 3, failedSources: 11, circuitOpenSources: 130
      }) === "aggregator-gedrosselt");

    // Nach dem Fix: derselbe Lauf überspringt die geteilten Wege.
    check("Nach dem Fix: reduzierter Folge-Lauf ist NICHT degradiert",
      classifyCrawlRunState({
        checkedSources: 144, successfulSources: 4, failedSources: 2, skippedSources: 138
      }) === "cooldown-reduziert");

    // KEIN blinder Fleck: ein echter Google-Totalausfall trifft auch Mandat 1
    // (dort wird nichts übersprungen) und muss weiterhin alarmieren.
    const echterAusfall = classifyCrawlRunState({
      checkedSources: 145, successfulSources: 3, failedSources: 11, circuitOpenSources: 131
    });
    check("ECHTER Aggregator-Ausfall alarmiert weiterhin (kein blinder Fleck)",
      echterAusfall === "aggregator-gedrosselt" && DEGRADED_STATES.has(echterAusfall));

    // Ein reduzierter Lauf darf eine echte Störung im Restanteil nicht verstecken,
    // wenn genug Wege versucht wurden.
    check("reduzierter Lauf mit genug Versuchen bleibt bewertbar",
      classifyCrawlRunState({
        checkedSources: 144, successfulSources: 2, failedSources: 20, skippedSources: 122
      }) === "stark-degradiert");

    // Unveränderte Alt-Semantik (Regression gegen die bestehende Suite).
    check("gesund/teilweise/stark/fehlgeschlagen unverändert",
      classifyCrawlRunState({ checkedSources: 145, successfulSources: 140, failedSources: 5 }) === "gesund"
      && classifyCrawlRunState({ checkedSources: 100, successfulSources: 70, failedSources: 30 }) === "teilweise-degradiert"
      && classifyCrawlRunState({ checkedSources: 145, successfulSources: 16, failedSources: 129 }) === "stark-degradiert"
      && classifyCrawlRunState({ checkedSources: 145, successfulSources: 0, failedSources: 145 }) === "fehlgeschlagen"
      && classifyCrawlRunState({ lockSkipped: true }) === "lock-uebersprungen"
      && classifyCrawlRunState({}) === "unbekannt");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEIL E — Rollierender Health-Report / Störungswahrheit
  // ═══════════════════════════════════════════════════════════════════════════
  {
    check("reduzierter Lauf wird als solcher erkannt (Basis-Lauf-Auswahl)",
      isReducedRun({ sharedSkippedSources: 138 }) === true
      && isReducedRun({ cooldown: { skipGoogle: true } }) === true
      && isReducedRun({ checkedSources: 145, failedSources: 0 }) === false
      && isReducedRun(null) === false);

    // Genau das Muster des 06:00-Reports: je Cron-Tick ein gesunder Lauf (Mandat 1)
    // und ein reduzierter Folge-Lauf (Mandat 2). Vorher: "2/6 wiederholt degradiert".
    const nowMs = Date.parse("2026-07-25T06:04:00Z");
    const runs = [
      { createdAt: "2026-07-25T04:05:05Z", checkedSources: 144, successfulSources: 4, failedSources: 2, skippedSources: 138, sharedSkippedSources: 138 },
      { createdAt: "2026-07-25T04:03:49Z", checkedSources: 145, successfulSources: 145, failedSources: 0 },
      { createdAt: "2026-07-24T20:05:03Z", checkedSources: 144, successfulSources: 4, failedSources: 2, skippedSources: 138, sharedSkippedSources: 138 },
      { createdAt: "2026-07-24T20:03:35Z", checkedSources: 145, successfulSources: 145, failedSources: 0 }
    ];
    const rolling = buildRollingCrawlHealth({ runs, nowMs });
    check("Folge-Mandate erzeugen kein 'wiederholt-degradiert' mehr",
      rolling.status === "aktuell-gesund" && rolling.degradedRuns === 0 && rolling.alertLevel === "ok",
      `status=${rolling.status} degraded=${rolling.degradedRuns}`);

    // Vor dem Fix (dieselben Läufe mit den alten Zählern) MUSS es degradiert sein —
    // belegt, dass der Test die Ursache trifft und nicht nur die Schwelle verschiebt.
    const rollingVorher = buildRollingCrawlHealth({
      runs: runs.map((r) => (r.sharedSkippedSources
        ? { createdAt: r.createdAt, checkedSources: 144, successfulSources: 3, failedSources: 141 }
        : r)),
      nowMs
    });
    check("Gegenprobe: mit den Alt-Zählern wäre es 'wiederholt-degradiert'",
      rollingVorher.status === "wiederholt-degradiert" && rollingVorher.alertLevel === "alarm");

    // Echter Aggregator-Ausfall bleibt alarmierend sichtbar.
    const rollingAusfall = buildRollingCrawlHealth({
      runs: [{ createdAt: "2026-07-25T04:03:49Z", checkedSources: 145, successfulSources: 3, failedSources: 11, circuitOpenSources: 131 }],
      nowMs
    });
    check("echter Aggregator-Ausfall bleibt Alarm im Report",
      rollingAusfall.latestState === "aggregator-gedrosselt" && rollingAusfall.alertLevel === "alarm");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEIL F — Lage-Achse: kein Takt-Fehlalarm, echter Ausfall alarmiert weiter
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // Lage-Cron 1×/Tag (10:00 UTC), Health-Report 06:00 UTC -> Lage ist zur
    // Report-Zeit IMMER ~20 h alt. Mit der Takt-Schwelle (26 h) ist das frisch.
    const t = { lageFreshMs: 26 * 3600e3, lageWarnMs: 28 * 3600e3 };
    check("20 h alte Lage bei 24-h-Takt ist frisch (kein Dauerfehlalarm)",
      _lageAxis(20 * 3600e3, t) === "fresh");
    check("27 h (ein Lauf ausgefallen) warnt", _lageAxis(27 * 3600e3, t) === "warn");
    check("30 h (mehrere Läufe ausgefallen) ist tot", _lageAxis(30 * 3600e3, t) === "dead");
    check("fehlender Zeitstempel bleibt 'unknown' (kein geratener Wert)",
      _lageAxis(null, t) === "unknown");

    // Gesamtzustand: gesunder Crawl + frisches Briefing + 20 h alte Lage -> nicht
    // mehr "Teilweise gestört" (das war die WhatsApp-Meldung).
    const signals = {
      storageOk: true,
      ingest: { crawlAgeMs: 2 * 3600e3, checkedSources: 145, successfulSources: 145, failureRatio: 0 },
      output: { available: true, newestCompleteKoAgeMs: 2 * 3600e3, reactCount: 1, situationalCount: 3 },
      lageAgeMs: 20 * 3600e3,
      errors24: 0
    };
    const mitTakt = classifyOperationalState(signals, { lageFreshMs: 26 * 3600e3, lageWarnMs: 28 * 3600e3 });
    const mitAlt = classifyOperationalState(signals, { lageFreshMs: 4 * 3600e3, lageWarnMs: 28 * 3600e3 });
    check("Gesamtzustand ohne Takt-Fehlalarm nicht mehr 'Teilweise gestört'",
      mitTakt.state !== STATES.TEILWEISE, `state=${mitTakt.state}`);
    check("Gegenprobe: mit der 4-h-Schwelle wäre es 'Teilweise gestört'",
      mitAlt.state === STATES.TEILWEISE, `state=${mitAlt.state}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEIL G — Telemetrie: korrekte Zähler, inhaltsfrei, kein Secret-/URL-Leak
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const results = [
      { sourceId: "g1", ok: false, status: "circuit-open", error: "google-news-circuit-open" },
      { sourceId: "g2", ok: false, status: "circuit-open", error: "google-news-circuit-open" },
      { sourceId: "g3", ok: true, status: "skipped-shared", itemCount: 0 },
      { sourceId: "g4", ok: false, status: "error", error: "HTTP 503 for https://news.google.com/rss/search?q=geheim" },
      { sourceId: "g5", ok: true, status: "ok", itemCount: 3 },
      { sourceId: "d1", ok: true, status: "ok", itemCount: 2 }
    ];
    const sourcesById = {
      g1: { rssUrl: "https://news.google.com/a" }, g2: { rssUrl: "https://news.google.com/b" },
      g3: { rssUrl: "https://news.google.com/c" }, g4: { rssUrl: "https://news.google.com/d" },
      g5: { rssUrl: "https://news.google.com/e" }, d1: { rssUrl: "https://www.bmas.de/rss" }
    };
    const bd = buildProviderBreakdown(results, sourcesById);
    check("Breakdown: circuit-open eigener Zähler, NICHT 'failed'",
      bd.googleNews.circuitOpen === 2 && bd.googleNews.failed === 1, JSON.stringify(bd.googleNews));
    check("Breakdown: skipped-shared zählt als 'skipped'", bd.googleNews.skipped === 1);
    check("Breakdown: Provider-Trennung intakt", bd.googleNews.checked === 5 && bd.direct.checked === 1 && bd.direct.ok === 1);

    const rows = buildSourceTelemetryRows({ runId: "crawl-test", results, sourcesById });
    check("Telemetrie-Status bleibt unterscheidbar (circuit-open / skipped-shared)",
      rows.find((r) => r.source_id === "g1").status === "circuit-open"
      && rows.find((r) => r.source_id === "g3").status === "skipped-shared");
    check("Telemetrie: übersprungener Weg trägt keinen Fehlercode",
      rows.find((r) => r.source_id === "g3").error_code === null);
    // Der rohe Fehlertext enthielt eine aufgelöste Abruf-URL samt Query. Persistiert
    // werden darf nur der inhaltsfreie Code ('http-5xx') — dieser Code DARF die
    // Zeichenkette "http" enthalten, eine URL (Schema/Host/Query) NICHT.
    const serialized = JSON.stringify(rows) + JSON.stringify(bd) + JSON.stringify(summarizeErrorCodes(results));
    check("KEIN URL-/Secret-Leak in Telemetrie (roher Fehlertext verworfen)",
      !serialized.includes("://") && !serialized.includes("news.google.com")
      && !serialized.includes("geheim") && !serialized.includes("q="),
      serialized.slice(0, 160));
    check("Fehlercode-Summen bleiben inhaltsfrei klassifiziert",
      JSON.stringify(summarizeErrorCodes(results)) === JSON.stringify({ "circuit-open": 2, "http-5xx": 1 }),
      JSON.stringify(summarizeErrorCodes(results)));
  }

  server.close();
  console.log(`\n${passed}/${passed + failed} Incident-Regressions-Assertions erfolgreich.`);
  if (failed > 0) process.exit(1);
})().catch((error) => { console.error(error); server.close(); process.exit(1); });
