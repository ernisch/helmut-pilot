"use strict";

// Offline-Selbsttest der Bewertungslogik (probeToVerdict) fuer die WBSB-Kandidaten-Verifikation.
// KEIN Netz, KEINE KI, rein funktional — injizierte Probe-Objekte + fixe now()-Zeit.
// Laeuft im CI VOR dem echten Abruf, damit die Urteilslogik selbst gepruegt ist.

const assert = require("assert");
const { probeToVerdict } = require("./wohnen-bauen-stadtentwicklung-verify");
const { WBSB_KANDIDATEN } = require("../lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung-kandidaten");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const NOW = Date.UTC(2026, 6, 24); // 2026-07-24
const daysAgo = (n) => new Date(NOW - n * 86400000).toUTCString();

const rssFresh = `<?xml version="1.0"?><rss><channel>
  <item><title>Wohngeld-Reform vorgelegt</title><link>https://x/1</link><pubDate>${daysAgo(3)}</pubDate></item>
  <item><title>Baulandmobilisierung</title><link>https://x/2</link><pubDate>${daysAgo(20)}</pubDate></item>
</channel></rss>`;
const rssStale = `<?xml version="1.0"?><rss><channel>
  <item><title>Alte Meldung</title><link>https://x/9</link><pubDate>${daysAgo(400)}</pubDate></item>
</channel></rss>`;

// (1) Frischer RSS-Feed -> geeignet
check("RSS frisch -> geeignet",
  probeToVerdict({ method: "rss" }, { status: 200, contentType: "application/rss+xml", body: rssFresh }, NOW).urteil === "geeignet");

// (2) Veralteter RSS-Feed -> geeignet mit Einschraenkung
check("RSS veraltet -> geeignet mit Einschraenkung",
  probeToVerdict({ method: "rss" }, { status: 200, contentType: "application/rss+xml", body: rssStale }, NOW).urteil === "geeignet mit Einschraenkung");

// (3) HTML statt RSS an einer rss-URL -> ablehnen
check("HTML statt RSS -> ablehnen",
  probeToVerdict({ method: "rss" }, { status: 200, contentType: "text/html", body: "<!doctype html><html><body>Seite</body></html>" }, NOW).urteil === "ablehnen");

// (4) API JSON 200 -> geeignet
check("API JSON 200 -> geeignet",
  probeToVerdict({ method: "api" }, { status: 200, contentType: "application/json", body: '{"numFound":42,"documents":[{"id":1}]}' }, NOW).urteil === "geeignet");

// (5) API 401 (Key noetig) -> geeignet mit Einschraenkung, nicht ablehnen
check("API 401 -> geeignet mit Einschraenkung (API-Key)",
  probeToVerdict({ method: "api" }, { status: 401, contentType: "application/json", body: '{"message":"unauthorized"}' }, NOW).urteil === "geeignet mit Einschraenkung");

// (6) API liefert HTML -> ablehnen (falscher Endpunkt)
check("API HTML -> ablehnen",
  probeToVerdict({ method: "api" }, { status: 200, contentType: "text/html", body: "<!doctype html><html></html>" }, NOW).urteil === "ablehnen");

// (7) HTML-Liste inhaltsreich -> geeignet mit Einschraenkung
check("HTML-Liste reich -> geeignet mit Einschraenkung",
  probeToVerdict({ method: "html" }, { status: 200, contentType: "text/html", body: "<html><body>" + "x".repeat(1200) + "</body></html>" }, NOW).urteil === "geeignet mit Einschraenkung");

// (8) 404 -> ablehnen
check("HTTP 404 -> ablehnen",
  probeToVerdict({ method: "rss" }, { status: 404, contentType: "text/html", body: "not found" }, NOW).urteil === "ablehnen");

// (9) Egress-/Netzfehler (kein status) -> nicht_verifizierbar (kein erfundenes Urteil)
check("Netzfehler -> nicht_verifizierbar",
  probeToVerdict({ method: "rss" }, { error: "ECONNREFUSED" }, NOW).urteil === "nicht_verifizierbar");

// (10) structured_download PDF -> geeignet
check("PDF-Download -> geeignet",
  probeToVerdict({ method: "structured_download" }, { status: 200, contentType: "application/pdf", body: "%PDF-1.7" }, NOW).urteil === "geeignet");

// (11) 403 Bot-Sperre auf rss -> geeignet mit Einschraenkung (nicht umgehen), nicht ablehnen
check("403 Bot-Sperre -> geeignet mit Einschraenkung",
  probeToVerdict({ method: "rss" }, { status: 403, contentType: "text/html", body: "access denied" }, NOW).urteil === "geeignet mit Einschraenkung");

// (12) Kandidaten-Seed-Integritaet: jede Kandidatenzeile ist vollstaendig + hat gueltige method/URL.
const VALID_METHODS = new Set(["rss", "api", "html", "googlenews_search", "structured_download"]);
const seedOk = Array.isArray(WBSB_KANDIDATEN) && WBSB_KANDIDATEN.length > 0 && WBSB_KANDIDATEN.every((c) =>
  c && typeof c.key === "string" && c.key &&
  typeof c.url === "string" && /^https:\/\//.test(c.url) &&
  VALID_METHODS.has(c.method) &&
  typeof c.publisher === "string" && c.publisher &&
  typeof c.quellenrolle === "string" && c.quellenrolle);
check("Kandidaten-Seed vollstaendig + gueltige method/https-URL je Zeile", seedOk);
check("Kandidaten-Keys eindeutig", new Set(WBSB_KANDIDATEN.map((c) => c.key)).size === WBSB_KANDIDATEN.length);
check("Kandidaten-URLs eindeutig", new Set(WBSB_KANDIDATEN.map((c) => c.url)).size === WBSB_KANDIDATEN.length);

try { assert.ok(true); } catch (_) { /* noop */ }
console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
