"use strict";

// Helmut — Quellenarchitektur · Sprint 9B: LAUFFÄHIGE technische Verifikation aller
// vorbereiteten Abrufwege (19 Berlin/Brandenburg + 6 Bundes-Reparaturwege) gegen die ECHTE
// Adresse.
//
// Dieses Skript FÜHRT ECHTE AUSGEHENDE HTTPS-ABRUFE DURCH. Es liest die URLs aus den Seeds
// (Single Source of Truth, kein URL-Drift) und prüft je Weg:
//   HTTP-Status + Weiterleitungskette · Content-Type · gültiges RSS/XML/HTML · Titel +
//   jüngstes Veröffentlichungsdatum · Parser-Ergebnis (ECHTER Produktionsparser
//   crawler.parseRssItems) · Duplikatrisiko · Bot-Sperre · technische Stabilität.
//
// Ergebnis je Weg ist GENAU EINES von drei Urteilen:
//   "geeignet" | "geeignet mit Einschränkung" | "ablehnen"
// PLUS ein ehrlicher Nicht-Urteils-Zustand, wenn der Abruf technisch nicht möglich war:
//   "nicht_verifizierbar" (z. B. Egress-Block dieser Umgebung) — dann wird KEIN Urteil
//   erfunden. Genau das ist der Fall in der gesperrten Sandbox: alle Wege -> nicht_verifizierbar.
//
// KEINE Quellenaktivierung, KEIN Production-Crawl, KEIN Schreibzugriff. Nur Lesen + Bericht.
// Aufruf: node scripts/sprint9b-verify-abrufwege.js   (JSON-Report nach --out <pfad> optional)

const http = require("http");
const https = require("https");
const fs = require("fs");
const { parseRssItems } = require("../lib/helmut/crawler");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { BUNDESWEG_REPARATUREN } = require("../lib/helmut/quellenarchitektur/seeds/bundeswege-reparaturen");

const TIMEOUT_MS = Number(process.env.S9B_TIMEOUT_MS || 12000);
const MAX_BYTES = Number(process.env.S9B_MAX_BYTES || 8 * 1024 * 1024);
const MAX_REDIRECTS = 6;
// "Aktuell" = jüngstes Item nicht älter als so viele Tage (sonst: geeignet mit Einschränkung).
const FRESH_DAYS = Number(process.env.S9B_FRESH_DAYS || 45);
// Realistischer Browser-User-Agent (erlaubt). Es werden KEINE technischen Zugriffs-
// beschränkungen umgangen: TLS-Prüfung bleibt an, kein Captcha-Solving, keine IP-Rotation.
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

// Eingrenzung des Prüfumfangs (Phase-1-Punkt 14, Neuverifikation V2). Ohne Angabe werden
// weiterhin ALLE 25 Wege geprüft — das bisherige Verhalten bleibt der Default.
// S9B_ONLY nimmt eine kommagetrennte Liste aus Gruppennamen (BE, BB, "BE+BB", BUND) und/oder
// einzelnen legacy_source_ids (z. B. "be-landesparlament"). Vergleich case-insensitiv.
// Zweck: eine Neuverifikation darf eng begrenzt laufen, statt 25 fremde Adressen mitzuziehen.
const ONLY_RAW = String(process.env.S9B_ONLY || "").trim();

function parseOnly(raw) {
  return String(raw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Reine Filterlogik (offline testbar). Leere Auswahl -> unveränderte Liste.
// Ein Auswahlbegriff ohne Treffer ist ein FEHLER (er würde sonst still eine leere oder zu
// kleine Prüfmenge erzeugen und als "verifiziert" durchgehen).
function filterWege(wege, raw) {
  const only = parseOnly(raw);
  if (!only.length) return { wege, only, unbekannt: [] };
  const treffer = new Set();
  const unbekannt = [];
  for (const begriff of only) {
    const passend = wege.filter((w) => String(w.gruppe).toLowerCase() === begriff || String(w.id).toLowerCase() === begriff);
    if (!passend.length) { unbekannt.push(begriff); continue; }
    for (const w of passend) treffer.add(w.id);
  }
  return { wege: wege.filter((w) => treffer.has(w.id)), only, unbekannt };
}

// ---------------------------------------------------------------------------
// Wege-Liste (25) aus den Seeds zusammenstellen — keine hartkodierten URLs.
// ---------------------------------------------------------------------------
function buildWege() {
  const seed = buildLandesmodulSeed();
  const land = seed.retrievalPaths.map((p) => ({
    id: p.legacy_source_id,
    gruppe: p.landModule && p.landModule.includes("+") ? "BE+BB" : (String(p.id).includes("-be-") || p.legacy_source_id.startsWith("be-") ? "BE" : "BB"),
    method: p.method,
    url: p.url,
    critical: !!p.is_critical,
    covers: p.covers.length,
    herkunft: "land"
  }));
  const bund = BUNDESWEG_REPARATUREN.map((r) => ({
    id: r.legacy_source_id,
    gruppe: "BUND",
    method: r.reparaturMethod,
    url: r.reparaturUrl,
    critical: !!r.kritisch,
    covers: 1,
    herkunft: "bund",
    bundBewertung: r.bewertung
  }));
  return [...land, ...bund];
}

// ---------------------------------------------------------------------------
// Instrumentierter Abruf: Status, Redirect-Kette, Content-Type, Body (gedeckelt).
// ---------------------------------------------------------------------------
function httpProbe(startUrl) {
  return new Promise((resolve) => {
    const redirects = [];
    const started = Date.now();

    function step(url, depth) {
      if (depth > MAX_REDIRECTS) { resolve({ error: "zu viele Weiterleitungen", redirects }); return; }
      let parsed;
      try { parsed = new URL(url); } catch (e) { resolve({ error: `ungültige URL: ${e.message}`, redirects }); return; }
      const client = parsed.protocol === "https:" ? https : http;
      const req = client.get(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
          "accept-language": "de-DE,de;q=0.9,en;q=0.7"
        },
        timeout: TIMEOUT_MS
      }, (res) => {
        const status = res.statusCode;
        const contentType = String(res.headers["content-type"] || "");
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          redirects.push({ status, from: url, to: res.headers.location });
          res.resume();
          let next;
          try { next = new URL(res.headers.location, url).toString(); } catch { resolve({ error: "ungültige Redirect-Location", redirects }); return; }
          step(next, depth + 1);
          return;
        }
        let body = "";
        let bytes = 0;
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          bytes += Buffer.byteLength(chunk, "utf8");
          if (bytes > MAX_BYTES) { res.destroy(); resolve({ status, contentType, headers: res.headers, body, finalUrl: url, redirects, truncated: true, ms: Date.now() - started }); return; }
          body += chunk;
        });
        res.on("end", () => resolve({ status, contentType, headers: res.headers, body, finalUrl: url, redirects, ms: Date.now() - started }));
      });
      req.on("timeout", () => req.destroy(new Error(`Timeout nach ${TIMEOUT_MS}ms`)));
      req.on("error", (e) => resolve({ error: e.message, redirects, ms: Date.now() - started }));
    }

    step(startUrl, 0);
  });
}

// ---------------------------------------------------------------------------
// Reine Bewertungslogik (kein Netz) — deterministisch, offline testbar.
// ---------------------------------------------------------------------------
const BOT_MARKERS = /(cloudflare|attention required|captcha|access denied|zugriff verweigert|请|are you a human|__cf_chl|akamai|bot detection)/i;

function looksHtml(body, contentType) {
  return /text\/html/i.test(contentType) || /<!doctype html|<html[\s>]/i.test(String(body || "").slice(0, 2000));
}

function newestItemDate(items) {
  let newest = null;
  for (const it of items) {
    const t = Date.parse(it.publishedAt || "");
    if (!Number.isNaN(t) && (newest === null || t > newest)) newest = t;
  }
  return newest;
}

function countXmlRecords(body) {
  // PARDOK/parldok-Open-Data: wiederkehrende Datensatz-Elemente (Vorgang/Dokument/…) zählen.
  const text = String(body || "");
  const candidates = ["Vorgang", "Dokument", "vorgang", "dokument", "record", "Datensatz", "ITEM", "Sitzung"];
  let best = 0; let tag = null;
  for (const c of candidates) {
    const n = (text.match(new RegExp(`<${c}[\\s>]`, "g")) || []).length;
    if (n > best) { best = n; tag = c; }
  }
  return { count: best, tag };
}

function isWellFormedIsh(body) {
  const text = String(body || "").trim();
  if (!/^<\?xml|^<[a-zA-Z]/.test(text)) return false;
  // grobe Wohlgeformtheit: gleich viele öffnende/schließende Wurzel-nahe Tags nicht exakt,
  // aber mind. ein schließendes Wurzelelement vorhanden.
  return /<\/[a-zA-Z][\w:.-]*>\s*$/.test(text) || text.length > 200;
}

// weg: {method, covers, critical}; probe: Ergebnis von httpProbe; nowMs für Recency (Test-Injektion).
function probeToVerdict(weg, probe, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const belege = [];
  const dupNote = weg.covers > 1 ? `Rohquelle speist ${weg.covers} Klassen (Dedup nötig)` : null;

  // (1) Abruf technisch unmöglich -> KEIN Urteil erfinden.
  if (probe.error && probe.status === undefined) {
    return { urteil: "nicht_verifizierbar", status: null, contentType: null, note: `Abruf fehlgeschlagen: ${probe.error}`, belege, dupNote, redirects: (probe.redirects || []).length };
  }

  const status = probe.status;
  const ct = probe.contentType || "";
  belege.push(`HTTP ${status}`, ct ? `Content-Type: ${ct}` : "kein Content-Type");
  if ((probe.redirects || []).length) belege.push(`${probe.redirects.length} Weiterleitung(en)`);

  // (2) Bot-Sperre / Zugriffsbeschränkung.
  const botByStatus = [401, 403, 429].includes(status);
  const botByBody = BOT_MARKERS.test(String(probe.body || "").slice(0, 4000));
  if (botByStatus || botByBody) {
    return {
      urteil: "geeignet mit Einschränkung", status, contentType: ct,
      note: `Bot-/Zugriffssperre (${botByStatus ? "HTTP " + status : "Body-Marker"}); server-seitiger Abruf mit realistischem UA nötig — NICHT umgehen`,
      belege, dupNote, redirects: (probe.redirects || []).length
    };
  }

  // (3) Sonstige Fehlerstatus.
  if (status >= 400 || status >= 300) {
    return { urteil: "ablehnen", status, contentType: ct, note: `Fehlerstatus HTTP ${status} — keine nutzbaren Inhalte`, belege, dupNote, redirects: (probe.redirects || []).length };
  }
  if (status < 200) {
    return { urteil: "ablehnen", status, contentType: ct, note: `unerwarteter Status HTTP ${status}`, belege, dupNote, redirects: (probe.redirects || []).length };
  }

  const body = String(probe.body || "");

  // (4) RSS/Atom + Google-News-RSS: echter Produktionsparser.
  if (weg.method === "rss" || weg.method === "googlenews_search") {
    const items = parseRssItems(body, 20);
    if (items.length > 0) {
      const newest = newestItemDate(items);
      const title = items[0].title;
      const sampleItemUrl = items[0].url || "";
      belege.push(`Parser: ${items.length} Items`, title ? `Titel[0]: "${title.slice(0, 60)}"` : "kein Titel");
      if (sampleItemUrl) belege.push(`Item-Originaladresse: ${sampleItemUrl.slice(0, 80)}`);
      if (newest === null) {
        return { urteil: "geeignet mit Einschränkung", status, contentType: ct, note: "Feed parst, aber kein/ungültiges Veröffentlichungsdatum — Aktualität unklar", belege, dupNote, redirects: (probe.redirects || []).length };
      }
      const ageDays = Math.floor((now - newest) / 86400000);
      belege.push(`jüngstes Item vor ${ageDays} Tagen`);
      if (ageDays <= FRESH_DAYS && ageDays >= 0) {
        return { urteil: "geeignet", status, contentType: ct, note: dupNote ? "aktueller, parsbarer Feed; " + dupNote : "aktueller, parsbarer Feed", belege, dupNote, redirects: (probe.redirects || []).length };
      }
      return { urteil: "geeignet mit Einschränkung", status, contentType: ct, note: `Feed parst, aber jüngstes Item ${ageDays} Tage alt (> ${FRESH_DAYS}) — Aktualität prüfen`, belege, dupNote, redirects: (probe.redirects || []).length };
    }
    // Keine Items: HTML-Landing statt Feed?
    if (looksHtml(body, ct)) {
      return { urteil: "ablehnen", status, contentType: ct, note: "HTML-Seite statt RSS/Atom an dieser URL — Feed-Deep-Link fehlt/falsch", belege, dupNote, redirects: (probe.redirects || []).length };
    }
    return { urteil: "ablehnen", status, contentType: ct, note: "kein parsbares RSS/Atom (leer/ungültig)", belege, dupNote, redirects: (probe.redirects || []).length };
  }

  // (5) Open-Data-XML (PARDOK/parldok).
  if (weg.method === "opendata_xml" || weg.method === "api_xml") {
    if (looksHtml(body, ct)) {
      return { urteil: "ablehnen", status, contentType: ct, note: "HTML statt XML — Open-Data-Deep-Link falsch/umgezogen", belege, dupNote, redirects: (probe.redirects || []).length };
    }
    if (!isWellFormedIsh(body)) {
      return { urteil: "ablehnen", status, contentType: ct, note: "kein wohlgeformtes XML", belege, dupNote, redirects: (probe.redirects || []).length };
    }
    const rec = countXmlRecords(body);
    belege.push(rec.count ? `XML-Datensätze: ${rec.count} <${rec.tag}>` : "XML ohne erkannte Datensätze");
    if (rec.count > 0) {
      return { urteil: "geeignet", status, contentType: ct, note: dupNote ? "wohlgeformtes Open-Data-XML mit Datensätzen; " + dupNote : "wohlgeformtes Open-Data-XML mit Datensätzen", belege, dupNote, redirects: (probe.redirects || []).length };
    }
    return { urteil: "geeignet mit Einschränkung", status, contentType: ct, note: "XML wohlgeformt, aber keine erkannten Datensätze — Schema/Parser prüfen", belege, dupNote, redirects: (probe.redirects || []).length };
  }

  // (6) HTML-Scrape.
  if (weg.method === "html") {
    if (looksHtml(body, ct) && body.length > 500) {
      return { urteil: "geeignet mit Einschränkung", status, contentType: ct, note: "HTML erreichbar, aber Scrape/DOM-Selektoren fragil — kein stabiler Feed", belege, dupNote, redirects: (probe.redirects || []).length };
    }
    return { urteil: "ablehnen", status, contentType: ct, note: "keine nutzbare HTML-Seite", belege, dupNote, redirects: (probe.redirects || []).length };
  }

  return { urteil: "ablehnen", status, contentType: ct, note: `unbekannte Methode ${weg.method}`, belege, dupNote, redirects: (probe.redirects || []).length };
}

// Egress-Schranke: Wenn selbst neutrale Kontroll-URLs (example.com/google.com) nicht 2xx
// liefern, ist der Egress der AUSFÜHRUNGSUMGEBUNG gesperrt. Dann stammt ein per-URL "HTTP 403"
// vom Egress-Proxy, NICHT vom Zielserver — es darf KEIN Urteil über die Quelle abgeleitet
// werden. Alle Wege werden ehrlich auf "nicht_verifizierbar" gesetzt (kein erfundenes Urteil).
const CONTROL_URLS = ["https://example.com/", "https://www.google.com/"];

function controlOkFromProbes(probes) {
  return probes.some((p) => Number.isFinite(p.status) && p.status >= 200 && p.status < 400);
}

function applyEgressGate(rows, controlOk, controlStatuses) {
  if (controlOk) return rows;
  const marker = `Egress der Ausführungsumgebung gesperrt (Kontroll-Abruf: ${controlStatuses.join(", ")}) — Zielserver nicht erreicht; ein etwaiges HTTP 403 stammt vom Egress-Proxy, nicht vom Zielserver. Echte Prüfung nur in Umgebung mit Egress.`;
  return rows.map((r) => ({
    ...r,
    urteilRoh: r.urteil,        // was das Harness bei echtem Abruf gesehen hätte
    urteil: "nicht_verifizierbar",
    status: null,
    note: marker
  }));
}

// ---------------------------------------------------------------------------
// Orchestrierung
// ---------------------------------------------------------------------------
async function run() {
  const alleWege = buildWege();
  const auswahl = filterWege(alleWege, ONLY_RAW);
  if (auswahl.unbekannt.length) {
    console.error(`S9B_ONLY enthaelt unbekannte Begriffe: ${auswahl.unbekannt.join(", ")}`);
    console.error(`Erlaubt sind Gruppen (BE, BB, BE+BB, BUND) und legacy_source_ids: ${alleWege.map((w) => w.id).join(", ")}`);
    process.exit(2);
  }
  const wege = auswahl.wege;
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;

  console.log("=== Sprint 9B — echte technische Verifikation der Abrufwege ===");
  // Umfangszeile aus den Daten ableiten statt zu behaupten (die Alt-Zeile nannte fest
  // "19 BE/BB + 6 Bund"; real sind es 18 Landeswege nach Dedup).
  const jeGruppe = alleWege.reduce((a, w) => { a[w.gruppe] = (a[w.gruppe] || 0) + 1; return a; }, {});
  const umfang = auswahl.only.length
    ? `eingegrenzt auf ${auswahl.only.join(", ")}`
    : Object.entries(jeGruppe).map(([g, n]) => `${n} ${g}`).join(" + ");
  console.log(`Wege: ${wege.length} von ${alleWege.length} (${umfang}) · Timeout ${TIMEOUT_MS}ms · aktuell ≤ ${FRESH_DAYS} Tage`);
  console.log("HINWEIS: echte Außen-Abrufe. In gesperrter Egress-Umgebung -> alle 'nicht_verifizierbar'.\n");

  // Kontroll-Abruf zuerst: klärt, ob Egress überhaupt möglich ist.
  const controlProbes = [];
  for (const cu of CONTROL_URLS) controlProbes.push(await httpProbe(cu));
  const controlStatuses = controlProbes.map((p, i) => `${new URL(CONTROL_URLS[i]).hostname}=${p.error ? p.error : "HTTP " + p.status}`);
  const controlOk = controlOkFromProbes(controlProbes);
  console.log(`Kontroll-Abruf: ${controlStatuses.join(" · ")} -> Egress ${controlOk ? "OFFEN" : "GESPERRT"}\n`);

  const rawRows = [];
  for (const weg of wege) {
    const probe = await httpProbe(weg.url);
    const v = probeToVerdict(weg, probe);
    // Originaladresse = finale URL nach Weiterleitungen (bei Egress-Fehler null).
    rawRows.push({ ...weg, ...v, angefragteUrl: weg.url, finalUrl: probe.finalUrl || null });
  }
  const rows = applyEgressGate(rawRows, controlOk, controlStatuses);
  for (const r of rows) {
    const flag = r.critical ? "⚠" : " ";
    const roh = r.urteilRoh ? ` (roh: ${r.urteilRoh})` : "";
    console.log(`[${r.gruppe.padEnd(5)}] ${flag} ${r.id.padEnd(26)} ${String(r.urteil).padEnd(20)}${roh}`);
  }

  const zaehl = rows.reduce((a, r) => { a[r.urteil] = (a[r.urteil] || 0) + 1; return a; }, {});
  console.log("\n--- Zusammenfassung ---");
  for (const k of ["geeignet", "geeignet mit Einschränkung", "ablehnen", "nicht_verifizierbar"]) {
    console.log(`  ${k.padEnd(26)}: ${zaehl[k] || 0}`);
  }
  const verifiziert = rows.filter((r) => r.urteil !== "nicht_verifizierbar").length;
  console.log(`\n  real verifiziert: ${verifiziert}/${rows.length}`);
  if (verifiziert === 0) {
    console.log("  -> KEIN Weg konnte real geprüft werden (Egress gesperrt). Es wurde KEIN Urteil erfunden.");
  }

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), fresh_days: FRESH_DAYS, only: auswahl.only, gesamtWege: alleWege.length, egressOffen: controlOk, controlStatuses, rows, zaehl, verifiziert, total: rows.length }, null, 2));
    console.log(`\nJSON-Report: ${outPath}`);
  }
  return rows;
}

if (require.main === module) {
  run().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { buildWege, filterWege, parseOnly, httpProbe, probeToVerdict, newestItemDate, countXmlRecords, looksHtml, controlOkFromProbes, applyEgressGate };
