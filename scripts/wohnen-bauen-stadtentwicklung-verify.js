"use strict";

// Helmut — Quellenarchitektur · Pilot "wohnen-bauen-stadtentwicklung-bund":
// LAUFFAEHIGE technische Verifikation der KANDIDATEN-Abrufwege gegen die ECHTE Adresse.
//
// Fuehrt ECHTE ausgehende HTTPS-Abrufe durch. Liest die URLs aus dem Kandidaten-Seed
// (Single Source of Truth, kein URL-Drift) und prueft je Weg:
//   HTTP-Status + Weiterleitungskette · finale URL · Content-Type · Retrieval-Typ ·
//   verwertbarer Inhalt (RSS/Atom-Items via echtem Produktionsparser crawler.parseRssItems;
//   JSON/XML-API; HTML-Liste/Suche; PDF-Liste) · Aktualitaet (juengstes Item) · Bot-Sperre.
//
// Ergebnis je Weg ist GENAU EINES von drei Urteilen:
//   "geeignet" | "geeignet mit Einschraenkung" | "ablehnen"
// PLUS ein ehrlicher Nicht-Urteils-Zustand, wenn der Abruf technisch nicht moeglich war:
//   "nicht_verifizierbar" (z. B. Egress-Block der Ausfuehrungsumgebung) — dann wird KEIN
//   Urteil erfunden (Egress-Gate ueber neutrale Kontroll-URLs).
//
// SICHERHEIT / GRENZEN: KEINE Quellenaktivierung, KEIN Production-Crawl, KEIN Schreibzugriff,
// KEINE Secrets, KEINE DB. Nur Lesen + Bericht. Realistischer Browser-User-Agent (erlaubt),
// TLS bleibt an; KEIN Umgehen technischer Zugriffsbeschraenkungen (kein Captcha/IP-Rotation).
//
// WICHTIG: importiert NICHT den Seed-Generator (der beim Import schreibt) — nur den
// Kandidaten-Seed, die wiederverwendeten Netz-/Egress-Helfer aus sprint9b-verify-abrufwege
// und den Produktionsparser. Aufruf: node scripts/wohnen-bauen-stadtentwicklung-verify.js --out <pfad>

const fs = require("fs");
const { parseRssItems } = require("../lib/helmut/crawler");
// Wiederverwendung statt Parallelmodell: derselbe instrumentierte Abruf + dasselbe
// Egress-Gate wie die bewaehrte Sprint-9B-Verifikation. Import ist nebenwirkungsfrei
// (das Skript hat einen require.main-Guard und schreibt nichts beim Import).
const { httpProbe, controlOkFromProbes, applyEgressGate, newestItemDate, looksHtml } = require("./sprint9b-verify-abrufwege");
const { WBSB_KANDIDATEN } = require("../lib/helmut/quellenarchitektur/seeds/wohnen-bauen-stadtentwicklung-kandidaten");

const FRESH_DAYS = Number(process.env.WBSB_FRESH_DAYS || 60);
const CONTROL_URLS = ["https://example.com/", "https://www.google.com/"];
const BOT_MARKERS = /(cloudflare|attention required|captcha|access denied|zugriff verweigert|are you a human|__cf_chl|akamai|bot detection)/i;

// Grobe JSON-/XML-Wohlgeformtheit ohne echten Parser (deterministisch, offline testbar).
function looksJson(body, contentType) {
  if (/application\/json|\+json/i.test(contentType || "")) return true;
  const t = String(body || "").trim();
  return t.startsWith("{") || t.startsWith("[");
}
function looksXml(body, contentType) {
  if (/xml/i.test(contentType || "")) return true;
  return /^<\?xml|^<[a-zA-Z]/.test(String(body || "").trim());
}
function countPdfLinks(body) {
  return (String(body || "").match(/href="[^"]+\.pdf/gi) || []).length;
}

// Reine Bewertungslogik (kein Netz) — deterministisch, offline testbar.
// weg: {method, retrieval_type, ...}; probe: Ergebnis von httpProbe; nowMs fuer Recency (Test-Injektion).
function probeToVerdict(weg, probe, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const belege = [];

  // (1) Abruf technisch unmoeglich -> KEIN Urteil erfinden.
  if (probe.error && probe.status === undefined) {
    return { urteil: "nicht_verifizierbar", status: null, contentType: null, note: `Abruf fehlgeschlagen: ${probe.error}`, belege, redirects: (probe.redirects || []).length };
  }

  const status = probe.status;
  const ct = probe.contentType || "";
  const body = String(probe.body || "");
  belege.push(`HTTP ${status}`, ct ? `Content-Type: ${ct}` : "kein Content-Type");
  if ((probe.redirects || []).length) belege.push(`${probe.redirects.length} Weiterleitung(en)`);

  const isApi = weg.method === "api";

  // (2) Bot-Sperre / Zugriffsbeschraenkung. Bei APIs ist 401/403 oft "API-Key noetig".
  const botByStatus = [401, 403, 429].includes(status);
  const botByBody = BOT_MARKERS.test(body.slice(0, 4000));
  if (botByStatus || botByBody) {
    if (isApi && (status === 401 || status === 403)) {
      return { urteil: "geeignet mit Einschraenkung", status, contentType: ct,
        note: `API antwortet (HTTP ${status}) — vermutlich API-Key/Registrierung erforderlich; Endpunkt existiert und ist adressierbar`, belege, redirects: (probe.redirects || []).length };
    }
    return { urteil: "geeignet mit Einschraenkung", status, contentType: ct,
      note: `Bot-/Zugriffssperre (${botByStatus ? "HTTP " + status : "Body-Marker"}); serverseitiger Abruf mit realistischem UA noetig — NICHT umgehen`, belege, redirects: (probe.redirects || []).length };
  }

  // (3) Sonstige Fehlerstatus (>=300 nach aufgeloester Weiterleitungskette).
  if (status >= 400 || status >= 300) {
    return { urteil: "ablehnen", status, contentType: ct, note: `Fehlerstatus HTTP ${status} — keine nutzbaren Inhalte`, belege, redirects: (probe.redirects || []).length };
  }
  if (status < 200) {
    return { urteil: "ablehnen", status, contentType: ct, note: `unerwarteter Status HTTP ${status}`, belege, redirects: (probe.redirects || []).length };
  }

  // (4) RSS/Atom + Google-News-RSS: echter Produktionsparser + Aktualitaet.
  if (weg.method === "rss" || weg.method === "googlenews_search") {
    const items = parseRssItems(body, 20);
    if (items.length > 0) {
      const newest = newestItemDate(items);
      belege.push(`Parser: ${items.length} Items`, items[0].title ? `Titel[0]: "${String(items[0].title).slice(0, 60)}"` : "kein Titel");
      if (newest === null) {
        return { urteil: "geeignet mit Einschraenkung", status, contentType: ct, note: "Feed parst, aber kein/ungueltiges Veroeffentlichungsdatum — Aktualitaet unklar", belege, redirects: (probe.redirects || []).length };
      }
      const ageDays = Math.floor((now - newest) / 86400000);
      belege.push(`juengstes Item vor ${ageDays} Tagen`);
      if (ageDays <= FRESH_DAYS && ageDays >= 0) {
        return { urteil: "geeignet", status, contentType: ct, note: "aktueller, parsbarer Feed", belege, redirects: (probe.redirects || []).length };
      }
      return { urteil: "geeignet mit Einschraenkung", status, contentType: ct, note: `Feed parst, aber juengstes Item ${ageDays} Tage alt (> ${FRESH_DAYS}) — Aktualitaet pruefen`, belege, redirects: (probe.redirects || []).length };
    }
    if (looksHtml(body, ct)) {
      return { urteil: "ablehnen", status, contentType: ct, note: "HTML-Seite statt RSS/Atom an dieser URL — Feed-Deep-Link fehlt/falsch", belege, redirects: (probe.redirects || []).length };
    }
    return { urteil: "ablehnen", status, contentType: ct, note: "kein parsbares RSS/Atom (leer/ungueltig)", belege, redirects: (probe.redirects || []).length };
  }

  // (5) API (JSON/XML) — Endpunkt liefert strukturierte Daten?
  if (weg.method === "api") {
    if (looksJson(body, ct) || looksXml(body, ct)) {
      belege.push(looksJson(body, ct) ? "JSON-Struktur erkannt" : "XML-Struktur erkannt", `Body ~${body.length} Zeichen`);
      if (body.length < 20) {
        return { urteil: "geeignet mit Einschraenkung", status, contentType: ct, note: "API antwortet strukturiert, aber sehr kurzer Body — Query/Parameter pruefen", belege, redirects: (probe.redirects || []).length };
      }
      return { urteil: "geeignet", status, contentType: ct, note: "API-Endpunkt liefert strukturierte Daten (JSON/XML)", belege, redirects: (probe.redirects || []).length };
    }
    if (looksHtml(body, ct)) {
      return { urteil: "ablehnen", status, contentType: ct, note: "HTML statt JSON/XML an der API-URL — falscher Endpunkt", belege, redirects: (probe.redirects || []).length };
    }
    return { urteil: "geeignet mit Einschraenkung", status, contentType: ct, note: "200, aber weder klar JSON/XML noch HTML — Format manuell pruefen", belege, redirects: (probe.redirects || []).length };
  }

  // (6) structured_download / PDF-Liste — Datei oder Liste von Downloads.
  if (weg.method === "structured_download") {
    if (/application\/pdf/i.test(ct)) {
      return { urteil: "geeignet", status, contentType: ct, note: "direkter PDF-Download erreichbar", belege, redirects: (probe.redirects || []).length };
    }
    if (looksHtml(body, ct)) {
      const pdfs = countPdfLinks(body);
      belege.push(`PDF-Links auf der Liste: ${pdfs}`);
      if (pdfs > 0) return { urteil: "geeignet mit Einschraenkung", status, contentType: ct, note: `HTML-Liste mit ${pdfs} PDF-Verweisen — Scrape/DOM-Selektoren fragil`, belege, redirects: (probe.redirects || []).length };
      return { urteil: "ablehnen", status, contentType: ct, note: "HTML-Seite ohne erkennbare PDF-Downloads", belege, redirects: (probe.redirects || []).length };
    }
    if (looksXml(body, ct) || looksJson(body, ct)) {
      return { urteil: "geeignet", status, contentType: ct, note: "strukturierter Download (XML/JSON) erreichbar", belege, redirects: (probe.redirects || []).length };
    }
    return { urteil: "geeignet mit Einschraenkung", status, contentType: ct, note: "200, Format des Downloads unklar — manuell pruefen", belege, redirects: (probe.redirects || []).length };
  }

  // (7) HTML-Liste / HTML-Suche — erreichbare Fachliste mit Inhalt?
  if (weg.method === "html") {
    if (looksHtml(body, ct) && body.length > 800) {
      return { urteil: "geeignet mit Einschraenkung", status, contentType: ct, note: "HTML-Liste/Suche erreichbar und inhaltsreich, aber Scrape/DOM-Selektoren fragil — kein stabiler Feed", belege, redirects: (probe.redirects || []).length };
    }
    if (looksHtml(body, ct)) {
      return { urteil: "geeignet mit Einschraenkung", status, contentType: ct, note: "HTML erreichbar, aber duenn — Nutzbarkeit fraglich", belege, redirects: (probe.redirects || []).length };
    }
    return { urteil: "ablehnen", status, contentType: ct, note: "keine nutzbare HTML-Seite", belege, redirects: (probe.redirects || []).length };
  }

  return { urteil: "ablehnen", status, contentType: ct, note: `unbekannte Methode ${weg.method}`, belege, redirects: (probe.redirects || []).length };
}

// ---------------------------------------------------------------------------
// Orchestrierung
// ---------------------------------------------------------------------------
async function run() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;
  const wege = WBSB_KANDIDATEN;

  console.log("=== Pilot wohnen-bauen-stadtentwicklung-bund — echte technische Verifikation der Kandidaten ===");
  console.log(`Kandidaten: ${wege.length} · aktuell <= ${FRESH_DAYS} Tage`);
  console.log("HINWEIS: echte Aussen-Abrufe. In gesperrter Egress-Umgebung -> alle 'nicht_verifizierbar'.\n");

  // Egress-Gate zuerst.
  const controlProbes = [];
  for (const cu of CONTROL_URLS) controlProbes.push(await httpProbe(cu));
  const controlStatuses = controlProbes.map((p, i) => `${new URL(CONTROL_URLS[i]).hostname}=${p.error ? p.error : "HTTP " + p.status}`);
  const controlOk = controlOkFromProbes(controlProbes);
  console.log(`Kontroll-Abruf: ${controlStatuses.join(" · ")} -> Egress ${controlOk ? "OFFEN" : "GESPERRT"}\n`);

  const rawRows = [];
  for (const weg of wege) {
    const probe = await httpProbe(weg.url);
    const v = probeToVerdict(weg, probe);
    rawRows.push({
      key: weg.key, publisher: weg.publisher, quellenrolle: weg.quellenrolle,
      method: weg.method, retrieval_type: weg.retrieval_type,
      angefragteUrl: weg.url, finalUrl: probe.finalUrl || null,
      ...v
    });
  }
  const rows = applyEgressGate(rawRows, controlOk, controlStatuses);
  for (const r of rows) {
    const roh = r.urteilRoh ? ` (roh: ${r.urteilRoh})` : "";
    console.log(`${String(r.key).padEnd(26)} ${String(r.urteil).padEnd(24)} HTTP ${String(r.status ?? "-").padEnd(4)}${roh}`);
  }

  const zaehl = rows.reduce((a, r) => { a[r.urteil] = (a[r.urteil] || 0) + 1; return a; }, {});
  console.log("\n--- Zusammenfassung ---");
  for (const k of ["geeignet", "geeignet mit Einschraenkung", "ablehnen", "nicht_verifizierbar"]) {
    console.log(`  ${k.padEnd(28)}: ${zaehl[k] || 0}`);
  }
  const verifiziert = rows.filter((r) => r.urteil !== "nicht_verifizierbar").length;
  console.log(`\n  real verifiziert: ${verifiziert}/${rows.length}`);
  if (verifiziert === 0) console.log("  -> KEIN Weg real geprueft (Egress gesperrt). KEIN Urteil erfunden.");

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), fresh_days: FRESH_DAYS, egressOffen: controlOk, controlStatuses, rows, zaehl, verifiziert, total: rows.length }, null, 2));
    console.log(`\nJSON-Report: ${outPath}`);
  }
  return rows;
}

if (require.main === module) {
  run().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { probeToVerdict, looksJson, looksXml, countPdfLinks, run };
