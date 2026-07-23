"use strict";

// Helmut — Sprint 2: read-only Verifikationstest fuer GENAU DREI Pflichtquellen-URLs.
//
// Geprueft werden ausschliesslich:
//   1. Heute im Bundestag (hib)
//   2. Pressemitteilungen der Bundesregierung
//   3. Pressemitteilungen des Bundesverfassungsgerichts
//
// Dieses Skript fuehrt ECHTE ausgehende HTTPS-GET-Abrufe genau dieser drei URLs durch und
// dokumentiert je Quelle: HTTP-Status, Content-Type, Weiterleitungskette, ob eine gueltige
// RSS/Atom-Struktur vorliegt, den Feed-/Kanal-Titel und einen Beispieleintrag (ueber den
// echten Produktionsparser lib/helmut/crawler.parseRssItems).
//
// AUSDRUECKLICH NICHT ENTHALTEN (bewusste Grenze dieses Skripts):
//   keine Secrets, kein Production-/DB-Zugriff, kein Deployment, keine Aktivierung von
//   Quellen, keine Aenderung bestehender Retrieval Paths, keine weiteren URLs/Quellen,
//   keine Architekturaenderung. Reiner Lesezugriff auf drei oeffentliche Adressen + Bericht.
//
// Aufruf: node scripts/sprint2-verify-pflichtquellen.js [--out <report.json>] [--summary-out <summary.md>]

const http = require("http");
const https = require("https");
const fs = require("fs");
const { parseRssItems } = require("../lib/helmut/crawler");

const TIMEOUT_MS = Number(process.env.S2_TIMEOUT_MS || 12000);
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 6;
// Realistischer Browser-User-Agent (erlaubt). Keine technische Zugriffsbeschraenkung wird
// umgangen: TLS-Pruefung bleibt an, kein Captcha-Solving, keine IP-Rotation.
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

// Genau die drei im Auftrag benannten Quellen — keine weiteren.
const QUELLEN = [
  {
    id: "hib",
    name: "Heute im Bundestag (hib)",
    institution: "Deutscher Bundestag",
    url: "https://www.bundestag.de/static/appdata/includes/rss/hib.rss"
  },
  {
    id: "bundesregierung-pressemitteilungen",
    name: "Pressemitteilungen der Bundesregierung",
    institution: "Bundesregierung",
    url: "https://www.bundesregierung.de/service/rss/breg-de/1151244/feed.xml"
  },
  {
    id: "bverfg-pressemitteilungen",
    name: "Pressemitteilungen des Bundesverfassungsgerichts",
    institution: "Bundesverfassungsgericht",
    url: "https://www.bundesverfassungsgericht.de/SiteGlobals/Functions/RSSFeed/DE/Pressemitteilungen/RSSPressemitteilungen.xml"
  }
];

// --- Instrumentierter Abruf: Status, Redirect-Kette, Content-Type, Body (gedeckelt). -------
function httpProbe(startUrl) {
  return new Promise((resolve) => {
    const redirects = [];
    const started = Date.now();

    function step(url, depth) {
      if (depth > MAX_REDIRECTS) { resolve({ error: "zu viele Weiterleitungen", redirects }); return; }
      let parsed;
      try { parsed = new URL(url); } catch (e) { resolve({ error: `ungueltige URL: ${e.message}`, redirects }); return; }
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
          try { next = new URL(res.headers.location, url).toString(); } catch { resolve({ error: "ungueltige Redirect-Location", redirects }); return; }
          step(next, depth + 1);
          return;
        }
        let body = "";
        let bytes = 0;
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          bytes += Buffer.byteLength(chunk, "utf8");
          if (bytes > MAX_BYTES) { res.destroy(); resolve({ status, contentType, finalUrl: url, redirects, truncated: true, ms: Date.now() - started, body }); return; }
          body += chunk;
        });
        res.on("end", () => resolve({ status, contentType, finalUrl: url, redirects, body, ms: Date.now() - started }));
      });
      req.on("timeout", () => req.destroy(new Error(`Timeout nach ${TIMEOUT_MS}ms`)));
      req.on("error", (e) => resolve({ error: e.message, redirects, ms: Date.now() - started }));
    }

    step(startUrl, 0);
  });
}

// --- Reine Auswertungslogik (kein Netz) ----------------------------------------------------
function stripCdataAndDecode(raw) {
  return String(raw || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// Kanal-/Feed-Titel (NICHT der erste Item-Titel) aus RSS <channel> oder Atom <feed>.
function readChannelTitle(body) {
  const text = String(body || "");
  const channelBlock = text.match(/<channel[\s\S]*?>[\s\S]*?<\/channel>/i);
  if (channelBlock) {
    const m = channelBlock[0].match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m) return stripCdataAndDecode(m[1]);
  }
  const feedTitleBeforeEntry = text.split(/<entry[\s>]/i)[0];
  const m2 = feedTitleBeforeEntry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m2) return stripCdataAndDecode(m2[1]);
  return null;
}

function looksLikeXml(body, contentType) {
  const text = String(body || "").trim();
  const ctXml = /xml|rss|atom/i.test(contentType || "");
  const bodyXml = /^<\?xml/i.test(text) || /<rss[\s>]/i.test(text) || /<feed[\s>]/i.test(text);
  return ctXml || bodyXml;
}

function looksLikeHtml(body, contentType) {
  return /text\/html/i.test(contentType || "") || /<!doctype html|<html[\s>]/i.test(String(body || "").slice(0, 2000));
}

const BOT_MARKERS = /(cloudflare|attention required|captcha|access denied|zugriff verweigert|are you a human|__cf_chl|akamai|bot detection)/i;

// Bewertet GENAU EINE Quelle. Rueckgabe-Urteil ist IMMER genau eines von "✅" | "⚠" | "❌".
function classify(probe) {
  if (probe.error) {
    return { urteil: "❌", grund: `Netzwerkfehler: ${probe.error}`, httpStatus: null, contentType: null };
  }
  const status = probe.status;
  const contentType = probe.contentType || "";
  const redirectCount = (probe.redirects || []).length;

  if (!Number.isFinite(status)) {
    return { urteil: "❌", grund: "kein HTTP-Status erhalten", httpStatus: null, contentType };
  }
  if ([401, 403, 429].includes(status)) {
    return { urteil: "❌", grund: `HTTP ${status} — blockiert (Bot-/Zugriffssperre)`, httpStatus: status, contentType, redirectCount };
  }
  if (status === 404 || status === 410) {
    return { urteil: "❌", grund: `HTTP ${status} — nicht gefunden`, httpStatus: status, contentType, redirectCount };
  }
  if (status >= 400) {
    return { urteil: "❌", grund: `HTTP ${status} — Fehlerstatus`, httpStatus: status, contentType, redirectCount };
  }
  if (status >= 300) {
    return { urteil: "❌", grund: `HTTP ${status} — unaufgeloeste Weiterleitung (> ${MAX_REDIRECTS} Sprünge oder ungueltiges Ziel)`, httpStatus: status, contentType, redirectCount };
  }

  const body = String(probe.body || "");
  if (BOT_MARKERS.test(body.slice(0, 4000))) {
    return { urteil: "❌", grund: "HTTP 2xx, aber Bot-/Zugriffssperren-Marker im Body (z. B. Cloudflare-Challenge) — kein echter Feed-Inhalt geliefert", httpStatus: status, contentType, redirectCount };
  }

  const isXml = looksLikeXml(body, contentType);
  const isHtml = looksLikeHtml(body, contentType);

  if (isHtml && !isXml) {
    return { urteil: "⚠", grund: "HTTP 2xx, aber HTML statt RSS/Atom (Landing-/Fehlerseite statt Feed-Deep-Link)", httpStatus: status, contentType, redirectCount };
  }

  if (isXml) {
    const items = parseRssItems(body, 5);
    const channelTitle = readChannelTitle(body);
    if (items.length > 0) {
      return {
        urteil: "✅",
        grund: "HTTP 2xx, gueltige RSS/Atom-Struktur mit auswertbaren Eintraegen (echter Produktionsparser liefert Items)",
        httpStatus: status, contentType, redirectCount,
        channelTitle,
        beispiel: { title: items[0].title, url: items[0].url, publishedAt: items[0].publishedAt || null }
      };
    }
    return {
      urteil: "⚠",
      grund: "HTTP 2xx, XML/RSS-Struktur erkannt, aber keine auswertbaren <item>/<entry>-Eintraege (leer oder abweichendes Schema)",
      httpStatus: status, contentType, redirectCount, channelTitle
    };
  }

  return { urteil: "⚠", grund: "HTTP 2xx, aber weder eindeutig RSS/Atom noch HTML erkennbar", httpStatus: status, contentType, redirectCount };
}

// --- Markdown-Zusammenfassung (reine Transformation, kein Netz) ----------------------------
function buildSummaryMarkdown(report) {
  const lines = [];
  lines.push("# Sprint 2 — echte Verifikation der drei Pflichtquellen (GitHub Actions, offener Egress)");
  lines.push("");
  lines.push(`- **Erzeugt:** ${report.generatedAt}`);
  lines.push(`- **Lauf-Umgebung:** GitHub-Actions-Runner (\`ubuntu-latest\`), offener Egress`);
  lines.push("");
  lines.push("| Nr | Quelle | Institution | URL | Urteil | HTTP | Content-Type | Weiterleitungen | Feed-Titel | Beispieleintrag | Begründung |");
  lines.push("|---|---|---|---|:---:|:---:|---|:---:|---|---|---|");
  report.rows.forEach((r, i) => {
    const beispiel = r.beispiel ? `${esc(r.beispiel.title)} (${esc(r.beispiel.publishedAt || "kein Datum")})` : "—";
    lines.push(`| ${i + 1} | ${esc(r.name)} | ${esc(r.institution)} | ${esc(r.url)} | ${r.urteil} | ${r.httpStatus != null ? r.httpStatus : "—"} | ${esc(r.contentType || "—")} | ${r.redirectCount != null ? r.redirectCount : 0} | ${esc(r.channelTitle || "—")} | ${beispiel} | ${esc(r.grund)} |`);
  });
  lines.push("");
  const zaehl = report.rows.reduce((a, r) => { a[r.urteil] = (a[r.urteil] || 0) + 1; return a; }, {});
  lines.push("## Zusammenfassung");
  lines.push("");
  lines.push(`- ✅ technisch erreichbar und als Feed nutzbar: ${zaehl["✅"] || 0}`);
  lines.push(`- ⚠ technisch erreichbar, aber eingeschränkt oder kein echter Feed: ${zaehl["⚠"] || 0}`);
  lines.push(`- ❌ tot, 404, blockiert oder ungeeignet: ${zaehl["❌"] || 0}`);
  lines.push("");
  lines.push("### Redirect-Ketten (falls vorhanden)");
  lines.push("");
  let anyRedirects = false;
  for (const r of report.rows) {
    if (Array.isArray(r.redirects) && r.redirects.length) {
      anyRedirects = true;
      lines.push(`- **${esc(r.name)}:** ${r.redirects.map((x) => `${x.status} → ${esc(x.to)}`).join(" → ")}`);
    }
  }
  if (!anyRedirects) lines.push("- Keine Weiterleitungen bei keiner der drei Quellen.");
  lines.push("");
  lines.push("Dieser Lauf aktiviert und ändert nichts: reiner Lesezugriff auf drei öffentliche URLs, keine Secrets, kein Production-/DB-Zugriff, kein Deployment.");
  lines.push("");
  return lines.join("\n");
}

function esc(s) { return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 200); }

// --- Orchestrierung -------------------------------------------------------------------------
async function run() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > -1 ? process.argv[outIdx + 1] : "sprint2-pflichtquellen-report.json";
  const summaryIdx = process.argv.indexOf("--summary-out");
  const summaryPath = summaryIdx > -1 ? process.argv[summaryIdx + 1] : "sprint2-pflichtquellen-summary.md";

  console.log("=== Sprint 2 — echte Verifikation der drei Pflichtquellen ===");
  console.log(`Quellen: ${QUELLEN.length} (hib, Bundesregierung-Pressemitteilungen, BVerfG-Pressemitteilungen) · Timeout ${TIMEOUT_MS}ms\n`);

  const rows = [];
  for (const q of QUELLEN) {
    const probe = await httpProbe(q.url);
    const v = classify(probe);
    const row = { ...q, ...v, redirects: probe.redirects || [], finalUrl: probe.finalUrl || null };
    rows.push(row);
    console.log(`${v.urteil}  ${q.name.padEnd(45)} HTTP ${v.httpStatus != null ? v.httpStatus : "—"}  ${v.grund}`);
  }

  const report = { generatedAt: new Date().toISOString(), rows };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  const md = buildSummaryMarkdown(report);
  fs.writeFileSync(summaryPath, md);
  console.log(`\nJSON-Report: ${outPath}`);
  console.log(`Zusammenfassung: ${summaryPath}`);
  return rows;
}

if (require.main === module) {
  run().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { QUELLEN, httpProbe, classify, readChannelTitle, looksLikeXml, looksLikeHtml, buildSummaryMarkdown };
