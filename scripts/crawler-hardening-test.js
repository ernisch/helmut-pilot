"use strict";

// Google-News-Härtung — Crawler-Integrationssuite (lokaler Mock-Server, kein
// externes Netz; der Netz-Guard der Offline-Suite erlaubt localhost).
//
// Belegt am ECHTEN crawlAllSources/crawlSource-Pfad:
//   1. Provider-Trennung: direkte/amtliche Quellen laufen erfolgreich weiter,
//      während ALLE Google-Quellen gedrosselt werden (429)
//   2. Retry bei 429 (retryCount > 0), keine Endlosschleife
//   3. Circuit Breaker: nach der Schwelle enden restliche Google-Abrufe sofort
//      (fail-fast, error_code circuit-open), direkte Quellen unbeeinflusst
//   4. Parallelitätsgrenze: nie mehr gleichzeitige Google-Requests als erlaubt
//   5. Cooldown skipGoogle: Google-Quellen übersprungen (status skipped-cooldown,
//      weder Erfolg noch Fehler), direkte Quellen laufen
//   6. Timeout: klassifiziert, ohne Retry (bewusst)
//   7. Kill-Switch/kein Gate: Alt-Verhalten (ein Pool, keine Skips)
//
// Trick: die Provider-Erkennung matcht auf "news.google." im URL-String — der
// Mock-Server nutzt localhost-URLs mit "news.google."-PFAD, sodass Klassifikation
// und Härtungspfad greifen, ohne dass je ein externer Host kontaktiert wird.

process.env.CRAWLER_TIMEOUT_MS = "400"; // vor dem require lesen (Modul-Konstante)

const http = require("http");
const { crawlAllSources } = require("../lib/helmut/crawler");
const { createGoogleNewsGate } = require("../lib/helmut/google-news-hardening");
const { classifyCrawlError } = require("../lib/helmut/source-telemetry");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const RSS = (title) => `<?xml version="1.0"?><rss><channel><item><title>${title}</title><link>http://127.0.0.1:1/artikel/${encodeURIComponent(title)}</link><pubDate>Thu, 16 Jul 2026 10:00:00 GMT</pubDate><description>Testinhalt</description></item></channel></rss>`;

let googleActive = 0, googleMaxActive = 0, google429Hits = 0;

const server = http.createServer((req, res) => {
  const url = req.url || "";
  if (url.includes("news.google.")) {
    googleActive += 1;
    googleMaxActive = Math.max(googleMaxActive, googleActive);
    setTimeout(() => {
      googleActive -= 1;
      if (url.includes("mode=429")) {
        google429Hits += 1;
        res.writeHead(429, { "Retry-After": "0" });
        res.end("rate limited");
        return;
      }
      if (url.includes("mode=hang")) return; // nie antworten -> Crawler-Timeout
      if (url.includes("mode=empty")) {
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end('<?xml version="1.0"?><rss><channel></channel></rss>');
        return;
      }
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(RSS("Google-Weg " + url.slice(0, 40)));
    }, 30);
    return;
  }
  res.writeHead(200, { "Content-Type": "application/xml" });
  res.end(RSS("Direkter amtlicher Weg"));
});

function googleSource(id, mode = "ok") {
  return { id, name: id, type: "media", active: true, crawlMethod: "rss",
    url: `http://127.0.0.1:${server.address().port}/news.google.com/rss/search?q=${id}&mode=${mode}`,
    rssUrl: `http://127.0.0.1:${server.address().port}/news.google.com/rss/search?q=${id}&mode=${mode}` };
}
function directSource(id) {
  return { id, name: id, type: "ministry", active: true, crawlMethod: "rss",
    url: `http://127.0.0.1:${server.address().port}/amtlich/${id}`,
    rssUrl: `http://127.0.0.1:${server.address().port}/amtlich/${id}.xml` };
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const hardening = { retryMax: 1, retryBaseMs: 5, retryCapMs: 10, retryAfterCapMs: 10 };

  // ── 1+2: Provider-Trennung + Retry bei flächendeckendem 429 ───────────────
  {
    const sources = [
      ...Array.from({ length: 6 }, (_, i) => googleSource(`g429-${i}`, "429")),
      directSource("bmas"), directSource("bundestag")
    ];
    const gate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 999 });
    const crawl = await crawlAllSources(sources, { googleGate: gate, hardeningConfig: hardening });
    const direct = crawl.results.filter((r) => r.sourceId.startsWith("bmas") || r.sourceId.startsWith("bundestag"));
    const google = crawl.results.filter((r) => r.sourceId.startsWith("g429"));
    check("amtliche/direkte Quellen erfolgreich TROTZ Google-Totalausfall", direct.every((r) => r.ok && r.itemCount === 1));
    check("alle Google-Quellen sauber als Fehler klassifiziert (http-429)",
      google.every((r) => !r.ok && classifyCrawlError(r.error) === "http-429"));
    check("429 wurde begrenzt wiederholt (retryCount=1 je Google-Quelle)", google.every((r) => r.retryCount === 1));
    check("Zähler: successful=2, failed=6, keine Skips",
      crawl.successfulSources === 2 && crawl.failedSources === 6 && crawl.skippedSources === 0 && crawl.retriesTotal === 6);
  }

  // ── 3: Circuit Breaker fail-fast ──────────────────────────────────────────
  {
    googleMaxActive = 0;
    google429Hits = 0;
    const sources = [
      ...Array.from({ length: 12 }, (_, i) => googleSource(`gb-${i}`, "429")),
      directSource("destatis")
    ];
    const gate = createGoogleNewsGate({ concurrency: 1, minSpacingMs: 0, breakerMinObservations: 3, breakerFailureRatio: 0.6 });
    const crawl = await crawlAllSources(sources, { googleGate: gate, hardeningConfig: { ...hardening, retryMax: 0 } });
    const google = crawl.results.filter((r) => r.sourceId.startsWith("gb-"));
    const circuitFailed = google.filter((r) => classifyCrawlError(r.error) === "circuit-open");
    const real429 = google.filter((r) => classifyCrawlError(r.error) === "http-429");
    check("Breaker öffnet im Lauf: spätere Google-Quellen enden fail-fast (circuit-open)",
      circuitFailed.length > 0 && real429.length >= 3, `circuit=${circuitFailed.length} real429=${real429.length}`);
    check("fail-fast: circuit-open-Quellen haben ~0ms Dauer (kein Netz-Request)",
      circuitFailed.every((r) => r.durationMs === 0));
    check("Google-Requests stoppen nach Breaker-Öffnung (weit unter 12)", google429Hits < 10, `hits=${google429Hits}`);
    check("kein HTML-Fallback-Zweitrequest gegen die gedrosselte Google-URL",
      google.every((r) => !String(r.error || "").includes("html:")));
    check("direkte Quelle bleibt vom offenen Breaker unberührt",
      crawl.results.find((r) => r.sourceId === "destatis").ok === true);
    check("Gate-Zustand im Ergebnis sichtbar (open=true)", crawl.googleGate && crawl.googleGate.open === true);
  }

  // ── 4: Parallelitätsgrenze am echten Server gemessen ──────────────────────
  {
    googleMaxActive = 0;
    const sources = Array.from({ length: 8 }, (_, i) => googleSource(`gok-${i}`, "ok"));
    const gate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 999 });
    const crawl = await crawlAllSources(sources, { googleGate: gate, hardeningConfig: hardening });
    check("Google-Parallelität am Server nie über der Grenze (2)", googleMaxActive <= 2, `max=${googleMaxActive}`);
    check("gesunde Google-Quellen liefern Items", crawl.successfulSources === 8);
  }

  // ── 5: Cooldown skipGoogle — Schutz vor zu frühem Vollcrawl ───────────────
  {
    const sources = [googleSource("g-skip-1"), googleSource("g-skip-2"), directSource("iab")];
    const gate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 999 });
    const crawl = await crawlAllSources(sources, {
      googleGate: gate, hardeningConfig: hardening,
      cooldown: { active: true, skipGoogle: true, reason: "crawl-abstand" }
    });
    const skipped = crawl.results.filter((r) => r.status === "skipped-cooldown");
    check("Cooldown: Google-Quellen übersprungen (status skipped-cooldown)", skipped.length === 2 && skipped.every((r) => r.ok && r.itemCount === 0));
    check("Cooldown: Skips zählen weder als Erfolg noch als Fehler",
      crawl.successfulSources === 1 && crawl.failedSources === 0 && crawl.skippedSources === 2);
    check("Cooldown: direkte Quelle läuft normal", crawl.results.find((r) => r.sourceId === "iab").ok === true);
  }

  // ── 6: Timeout klassifiziert, ohne Retry ──────────────────────────────────
  {
    const sources = [googleSource("g-hang", "hang"), directSource("drv")];
    const gate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 999 });
    const crawl = await crawlAllSources(sources, { googleGate: gate, hardeningConfig: hardening });
    const hang = crawl.results.find((r) => r.sourceId === "g-hang");
    check("Timeout: klassifiziert als timeout, KEIN Retry", !hang.ok && classifyCrawlError(hang.error) === "timeout" && hang.retryCount === 0);
    check("Timeout blockiert die direkte Quelle nicht", crawl.results.find((r) => r.sourceId === "drv").ok === true);
  }

  // ── 6b: Legitim leerer Google-Feed ist KEIN Fehler (ruhiger Nachrichtentag) ─
  {
    const sources = [googleSource("g-empty", "empty"), directSource("bpa")];
    const gate = createGoogleNewsGate({ concurrency: 2, minSpacingMs: 0, breakerMinObservations: 999 });
    const crawl = await crawlAllSources(sources, { googleGate: gate, hardeningConfig: hardening });
    const empty = crawl.results.find((r) => r.sourceId === "g-empty");
    check("leerer Google-Feed -> ok/'empty', kein Fehler, kein Degradations-Signal",
      empty.ok === true && empty.status === "empty" && crawl.failedSources === 0 && crawl.successfulSources === 2);
  }

  // ── 7: ohne Gate (Kill-Switch) Alt-Verhalten ──────────────────────────────
  {
    const sources = [googleSource("g-legacy"), directSource("bmf")];
    const crawl = await crawlAllSources(sources, {});
    check("ohne Gate: alle Quellen im Alt-Pfad erfolgreich, keine Skips",
      crawl.successfulSources === 2 && crawl.skippedSources === 0 && crawl.googleGate === null);
  }

  server.close();
  console.log(`\n${passed}/${passed + failed} Crawler-Härtung-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((err) => { console.error("Suite-Fehler:", err); server.close(); process.exit(1); });
