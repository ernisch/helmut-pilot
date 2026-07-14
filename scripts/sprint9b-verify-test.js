"use strict";

// Sprint 9B — Offline-Test der Verifikationslogik (scripts/sprint9b-verify-abrufwege.js).
// Der Live-Abruf ist in dieser Umgebung Egress-gesperrt; die DEKODIER-/BEWERTUNGSLOGIK ist
// jedoch vollständig deterministisch und wird hier gegen Fixtures geprüft — inkl. des ECHTEN
// Produktionsparsers (crawler.parseRssItems). Damit ist bewiesen: sobald echte Bodies
// vorliegen (Umgebung mit Egress), erzeugt das Harness korrekte Urteile — ohne Erfindung.

const {
  buildWege, probeToVerdict, newestItemDate, countXmlRecords, looksHtml, controlOkFromProbes, applyEgressGate
} = require("./sprint9b-verify-abrufwege");
const { buildSummaryMarkdown } = require("./sprint9b-summary");

let fail = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) fail += 1;
}

const NOW = Date.parse("2026-07-13T00:00:00Z");

// --- Fixtures ---
const rssRecent = `<?xml version="1.0"?><rss version="2.0"><channel><title>Presse</title>
  <item><title>Aktuelle Meldung</title><link>https://example.org/a</link><pubDate>Fri, 10 Jul 2026 09:00:00 +0200</pubDate></item>
  <item><title>Ältere Meldung</title><link>https://example.org/b</link><pubDate>Mon, 01 Jul 2026 09:00:00 +0200</pubDate></item>
</channel></rss>`;

const rssStale = `<rss><channel><item><title>Alt</title><link>https://example.org/x</link><pubDate>Wed, 01 Jan 2025 09:00:00 +0100</pubDate></item></channel></rss>`;

const rssNoDate = `<rss><channel><item><title>Ohne Datum</title><link>https://example.org/y</link></item></channel></rss>`;

const htmlLanding = `<!doctype html><html><head><title>RSS-Feeds Übersicht</title></head><body><h1>Feeds</h1><p>Wählen Sie einen Feed.</p></body></html>`;

const pardokXml = `<?xml version="1.0" encoding="UTF-8"?><Export><Vorgang><Titel>Antrag A</Titel></Vorgang><Vorgang><Titel>Antrag B</Titel></Vorgang><Dokument><Titel>Drs 1</Titel></Dokument></Export>`;

const atomRecent = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>News</title>
  <entry><title>Neu</title><link href="https://example.org/n"/><updated>2026-07-11T10:00:00Z</updated></entry></feed>`;

// --- 1. Wege-Liste ---
const wege = buildWege();
check("buildWege liefert 25 Wege", wege.length === 25);
check("davon 6 Bundeswege", wege.filter((w) => w.gruppe === "BUND").length === 6);
check("davon 19 Landeswege (BE/BB/BE+BB)", wege.filter((w) => w.herkunft === "land").length === 19);
check("jeder Weg hat url + method", wege.every((w) => w.url && w.method));

// --- 2. RSS: aktuell -> geeignet ---
const rW = { method: "rss", covers: 1, critical: true };
const vRecent = probeToVerdict(rW, { status: 200, contentType: "application/rss+xml", body: rssRecent }, NOW);
check("aktueller RSS -> geeignet", vRecent.urteil === "geeignet");
check("aktueller RSS: Titel[0] belegt", vRecent.belege.some((b) => b.includes("Aktuelle Meldung")));
check("aktueller RSS: Item-Anzahl belegt", vRecent.belege.some((b) => b.includes("2 Items")));

// --- 3. RSS: veraltet -> mit Einschränkung ---
const vStale = probeToVerdict(rW, { status: 200, contentType: "text/xml", body: rssStale }, NOW);
check("veralteter RSS -> geeignet mit Einschränkung", vStale.urteil === "geeignet mit Einschränkung");
check("veralteter RSS: Altersgrund genannt", /Tage alt/.test(vStale.note));

// --- 4. RSS ohne Datum -> mit Einschränkung ---
const vNoDate = probeToVerdict(rW, { status: 200, contentType: "text/xml", body: rssNoDate }, NOW);
check("RSS ohne Datum -> geeignet mit Einschränkung", vNoDate.urteil === "geeignet mit Einschränkung");

// --- 5. HTML-Landing unter rss-Methode -> ablehnen ---
const vLanding = probeToVerdict(rW, { status: 200, contentType: "text/html", body: htmlLanding }, NOW);
check("HTML-Landing statt Feed -> ablehnen", vLanding.urteil === "ablehnen");
check("HTML-Landing: Deep-Link-Hinweis", /HTML-Seite statt RSS/.test(vLanding.note));

// --- 6. Open-Data-XML mit Datensätzen -> geeignet ---
const xW = { method: "opendata_xml", covers: 4, critical: true };
const vXml = probeToVerdict(xW, { status: 200, contentType: "application/xml", body: pardokXml }, NOW);
check("PARDOK-XML mit Datensätzen -> geeignet", vXml.urteil === "geeignet");
check("PARDOK-XML: Datensätze belegt", vXml.belege.some((b) => /XML-Datensätze/.test(b)));
check("PARDOK-XML: Dedup-Hinweis (covers=4)", /Dedup/.test(vXml.note));

// --- 7. HTML unter opendata_xml -> ablehnen ---
const vXmlHtml = probeToVerdict(xW, { status: 200, contentType: "text/html", body: htmlLanding }, NOW);
check("HTML statt Open-Data-XML -> ablehnen", vXmlHtml.urteil === "ablehnen");

// --- 8. Atom aktuell (googlenews_search-Pfad nutzt denselben Parser) ---
const gW = { method: "googlenews_search", covers: 1, critical: false };
const vAtom = probeToVerdict(gW, { status: 200, contentType: "application/atom+xml", body: atomRecent }, NOW);
check("aktueller Atom-Feed -> geeignet", vAtom.urteil === "geeignet");

// --- 9. Bot-Sperre (403) -> mit Einschränkung, NICHT umgehen ---
const v403 = probeToVerdict(rW, { status: 403, contentType: "text/html", body: "" }, NOW);
check("HTTP 403 -> geeignet mit Einschränkung (Bot-Sperre)", v403.urteil === "geeignet mit Einschränkung");
check("403: Hinweis 'NICHT umgehen'", /NICHT umgehen/.test(v403.note));

// --- 10. Cloudflare-Body-Marker bei 200 -> mit Einschränkung ---
const vCf = probeToVerdict(rW, { status: 200, contentType: "text/html", body: "<html><body>Attention Required! | Cloudflare</body></html>" }, NOW);
check("Cloudflare-Marker -> geeignet mit Einschränkung", vCf.urteil === "geeignet mit Einschränkung");

// --- 11. 404 -> ablehnen ---
const v404 = probeToVerdict(rW, { status: 404, contentType: "text/html", body: "not found" }, NOW);
check("HTTP 404 -> ablehnen", v404.urteil === "ablehnen");

// --- 12. Netz-/Egress-Fehler -> nicht_verifizierbar (KEIN erfundenes Urteil) ---
const vErr = probeToVerdict(rW, { error: "CONNECT tunnel failed, 403" }, NOW);
check("Egress-Fehler -> nicht_verifizierbar", vErr.urteil === "nicht_verifizierbar");
check("Egress-Fehler: Urteil enthält keinen erfundenen Status", vErr.status === null);
check("Egress-Fehler: Grund protokolliert", /Abruf fehlgeschlagen/.test(vErr.note));

// --- 13. html-Methode: erreichbare Seite -> mit Einschränkung ---
const hW = { method: "html", covers: 1, critical: false };
const vHtml = probeToVerdict(hW, { status: 200, contentType: "text/html", body: htmlLanding + "x".repeat(600) }, NOW);
check("HTML-Scrape erreichbar -> geeignet mit Einschränkung", vHtml.urteil === "geeignet mit Einschränkung");

// --- 14. Redirect-Kette wird gezählt ---
const vRedir = probeToVerdict(rW, { status: 200, contentType: "application/rss+xml", body: rssRecent, redirects: [{ status: 301 }, { status: 302 }] }, NOW);
check("Redirect-Kette belegt (2)", vRedir.redirects === 2 && vRedir.belege.some((b) => /2 Weiterleitung/.test(b)));

// --- 15. Hilfsfunktionen ---
check("newestItemDate wählt jüngstes", newestItemDate([{ publishedAt: "2025-01-01" }, { publishedAt: "2026-07-10" }]) === Date.parse("2026-07-10"));
check("countXmlRecords zählt Vorgang", countXmlRecords(pardokXml).count === 2);
check("looksHtml erkennt HTML", looksHtml(htmlLanding, "text/html") === true);
check("looksHtml verneint XML", looksHtml(pardokXml, "application/xml") === false);

// --- 16. Egress-Schranke: gesperrter Kontroll-Abruf -> ALLE nicht_verifizierbar ---
const blockedControls = [{ status: 403 }, { error: "CONNECT tunnel failed" }];
const openControls = [{ status: 200 }, { status: 403 }];
check("controlOk=false wenn Kontrolle 403/Fehler", controlOkFromProbes(blockedControls) === false);
check("controlOk=true wenn eine Kontrolle 2xx", controlOkFromProbes(openControls) === true);

const fakeRows = [
  { id: "be-plenum", critical: true, urteil: "geeignet mit Einschränkung", status: 403, note: "Bot-Sperre" },
  { id: "die-linke", critical: true, urteil: "geeignet", status: 200, note: "aktueller Feed" }
];
const gated = applyEgressGate(fakeRows, false, ["example.com=HTTP 403", "www.google.com=HTTP 403"]);
check("Egress gesperrt -> alle nicht_verifizierbar", gated.every((r) => r.urteil === "nicht_verifizierbar"));
check("Egress gesperrt -> kein erfundener Status", gated.every((r) => r.status === null));
check("Egress gesperrt -> Proxy-Herkunft im Text", gated.every((r) => /Egress-Proxy/.test(r.note)));
check("Egress gesperrt -> Rohurteil bleibt sichtbar", gated[1].urteilRoh === "geeignet");
const passed = applyEgressGate(fakeRows, true, []);
check("Egress offen -> Urteile bleiben unverändert", passed[1].urteil === "geeignet");

// --- 17. Kein Urteil außerhalb der erlaubten Menge ---
const erlaubt = new Set(["geeignet", "geeignet mit Einschränkung", "ablehnen", "nicht_verifizierbar"]);
const alle = [vRecent, vStale, vNoDate, vLanding, vXml, vXmlHtml, vAtom, v403, vCf, v404, vErr, vHtml, vRedir];
check("alle Urteile aus erlaubter Menge", alle.every((v) => erlaubt.has(v.urteil)));

// --- 18. Summary-Generator: gesperrter Report ---
const blockedReport = {
  generatedAt: "2026-07-13T00:00:00Z", egressOffen: false, controlStatuses: ["example.com=HTTP 403"],
  fresh_days: 45, verifiziert: 0, total: 25, zaehl: { nicht_verifizierbar: 25 },
  rows: [{ id: "be-plenum", gruppe: "BE", method: "opendata_xml", critical: true, urteil: "nicht_verifizierbar", status: null, belege: ["HTTP 403"], note: "Egress gesperrt" }]
};
const mdBlocked = buildSummaryMarkdown(blockedReport);
check("Summary(blocked): meldet GESPERRT", /GESPERRT/.test(mdBlocked));
check("Summary(blocked): Warnung 'kein Urteil erfunden'", /kein Urteil erfunden/.test(mdBlocked));
check("Summary(blocked): 25 nicht_verifizierbar", /nicht_verifizierbar \| 25/.test(mdBlocked));

// --- 19. Summary-Generator: offener Report rendert echte Urteile ---
const openReport = {
  generatedAt: "2026-07-13T00:00:00Z", egressOffen: true, controlStatuses: ["example.com=HTTP 200"],
  fresh_days: 45, verifiziert: 2, total: 2, zaehl: { "geeignet": 1, "ablehnen": 1 },
  rows: [
    { id: "bundesregierung", gruppe: "BUND", method: "rss", critical: true, urteil: "geeignet", status: 200, angefragteUrl: "https://x/a", finalUrl: "https://x/a", belege: ["HTTP 200", "Parser: 12 Items"], note: "aktueller Feed" },
    { id: "be-landesparlament", gruppe: "BE", method: "rss", critical: true, urteil: "ablehnen", status: 200, angefragteUrl: "https://x/hub", finalUrl: "https://x/hub", belege: ["HTTP 200"], note: "HTML-Seite statt RSS/Atom" }
  ]
};
const mdOpen = buildSummaryMarkdown(openReport);
check("Summary(open): meldet OFFEN", /OFFEN/.test(mdOpen));
check("Summary(open): keine 'kein Urteil erfunden'-Warnung", !/kein Urteil erfunden/.test(mdOpen));
check("Summary(open): rendert geeignet + ablehnen", /geeignet/.test(mdOpen) && /ablehnen/.test(mdOpen));
check("Summary(open): Bund-Gruppe vorhanden", /Bund \(Reparaturwege\)/.test(mdOpen));

console.log(`\n${fail === 0 ? "ALLE TESTS GRÜN" : fail + " TEST(S) FEHLGESCHLAGEN"} (Sprint 9B Verifikationslogik)`);
process.exit(fail > 0 ? 1 : 0);
