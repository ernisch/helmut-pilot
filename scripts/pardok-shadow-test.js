"use strict";

// PARDOK-Parser Shadow-Test — echter, DB-FREIER Lauf des Parsers gegen die Live-XML von
// be-plenum (Berlin) + bb-plenum (Brandenburg). STREAMING/speicherschonend: liest je Quelle nur
// bis maxRecords Records (nicht die ganze 48-MB-Datei), extrahiert vollstaendige Record-Bloecke
// inkrementell und trimmt den Puffer. KEIN DB-Zugriff, KEIN LLM, KEIN Storage-Write, KEIN
// Production-Crawl — nur lesende HTTPS-Abrufe + Parser + Metriken + Artefakt.
//
// Aufruf: node scripts/pardok-shadow-test.js --out pardok-shadow.json

const https = require("https");
const http = require("http");
const fs = require("fs");
const P = require("../lib/helmut/quellenarchitektur/pardok-parser");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");

const MAX_RECORDS = Number(process.env.PARDOK_MAX_RECORDS || 800);
const MAX_BYTES = Number(process.env.PARDOK_MAX_BYTES || 64 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.PARDOK_TIMEOUT_MS || 25000);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const CONTROL_URLS = ["https://example.com/", "https://www.google.com/"];
const TARGETS = [{ id: "be-plenum", land: "berlin" }, { id: "bb-plenum", land: "brandenburg" }];

function targets() {
  const seed = buildLandesmodulSeed();
  const byLeg = new Map(seed.retrievalPaths.map((p) => [p.legacy_source_id, p]));
  return TARGETS.map((t) => ({ ...t, url: byLeg.get(t.id).url }));
}

function controlProbe(url) {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, { headers: { "user-agent": UA }, timeout: 10000 }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on("timeout", () => { req.destroy(); resolve(null); });
      req.on("error", () => resolve(null));
    } catch { resolve(null); }
  });
}

// STREAMING-Reader: extrahiert vollstaendige <recordTag>-Bloecke inkrementell, feedBlock je Block.
function streamAndParse(url, land) {
  const cfg = P.LAND_CONFIG[land];
  const recordTag = cfg.recordTag;
  const recRe = new RegExp(`<(?:[\\w.-]+:)?${recordTag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:[\\w.-]+:)?${recordTag}>`, "g");
  return new Promise((resolve) => {
    const stats = P.newStats(land);
    const documents = [];
    let fehler = 0, buffer = "", bytes = 0, peakBuffer = 0, redirects = 0;
    let htmlFehlerseite = false, truncated = false, firstChecked = false, done = false, status = null, contentType = null, errorMsg = null;
    const started = Date.now();

    function finish() { if (done) return; done = true; resolve({ status, contentType, error: errorMsg, bytes, peakBufferBytes: peakBuffer, redirects, htmlFehlerseite, truncated, ms: Date.now() - started, stats, documents, fehler }); }
    function extract() {
      recRe.lastIndex = 0; let m, lastEnd = 0;
      while ((m = recRe.exec(buffer)) !== null) {
        try { for (const d of P.feedBlock(land, m[0], { sourceUrl: url, maxRecords: MAX_RECORDS }, stats)) documents.push(d); }
        catch { fehler += 1; }
        lastEnd = recRe.lastIndex;
        if (stats.rohRecords >= MAX_RECORDS) break;
      }
      if (lastEnd > 0) buffer = buffer.slice(lastEnd);
    }
    function step(u, depth) {
      if (depth > 6) { errorMsg = "zu viele Weiterleitungen"; finish(); return; }
      let parsed; try { parsed = new URL(u); } catch { errorMsg = "ungueltige URL"; finish(); return; }
      const client = parsed.protocol === "https:" ? https : http;
      const req = client.get(u, { headers: { "user-agent": UA, accept: "application/xml,text/xml,application/rss+xml,*/*", "accept-language": "de-DE,de;q=0.9" }, timeout: TIMEOUT_MS }, (res) => {
        status = res.statusCode; contentType = String(res.headers["content-type"] || "");
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          redirects += 1; res.resume();
          let next; try { next = new URL(res.headers.location, u).toString(); } catch { errorMsg = "redirect"; finish(); return; }
          step(next, depth + 1); return;
        }
        if (status >= 400) { res.resume(); finish(); return; }
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (done) return;
          bytes += Buffer.byteLength(chunk, "utf8"); buffer += chunk;
          if (!firstChecked) { firstChecked = true; if (P.looksHtmlNotXml(buffer)) { htmlFehlerseite = true; try { res.destroy(); } catch {} finish(); return; } }
          extract();
          const b = Buffer.byteLength(buffer, "utf8"); if (b > peakBuffer) peakBuffer = b;
          if (stats.rohRecords >= MAX_RECORDS || bytes >= MAX_BYTES) { truncated = bytes >= MAX_BYTES; try { res.destroy(); } catch {} finish(); }
        });
        res.on("end", () => { if (!done) { extract(); finish(); } });
        res.on("error", () => { errorMsg = errorMsg || "stream-error"; finish(); });
      });
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", (e) => { errorMsg = e.message; finish(); });
    }
    step(url, 0);
  });
}

function q(n, d) { return d ? +(100 * n / d).toFixed(1) : null; }

async function run() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;
  console.log("=== PARDOK-Parser Shadow-Test (be-plenum + bb-plenum) — DB-frei, streaming ===");
  console.log(`maxRecords/Quelle: ${MAX_RECORDS} · kein LLM · kein Storage-Write\n`);

  const controls = [];
  for (const cu of CONTROL_URLS) controls.push(await controlProbe(cu));
  const egressOffen = controls.some((s) => Number.isFinite(s) && s >= 200 && s < 400);
  console.log(`Kontroll-Abruf: ${CONTROL_URLS.map((u, i) => `${new URL(u).hostname}=${controls[i]}`).join(" · ")} -> Egress ${egressOffen ? "OFFEN" : "GESPERRT"}\n`);

  const rssStart = process.memoryUsage().rss;
  const lands = [];
  const REPEAT = Number(process.env.PARDOK_REPEAT || 1);
  if (egressOffen) {
    for (const t of targets()) {
      // Phase 1: REPEAT echte, DB-freie Laeufe je Quelle -> Cross-Run-Stabilitaet.
      const iters = [];
      for (let k = 0; k < REPEAT; k++) {
        const rr = await streamAndParse(t.url, t.land);
        const sids = rr.documents.map((d) => d.externe_id).sort();
        iters.push({ r: rr, dd: P.dedupToDocuments(rr.documents, t.id), sortedIds: sids, docSetHash: P.sha256(sids.join("|")).slice(0, 16),
          dokTypVerteilung: rr.documents.reduce((m, d) => { const kk = d.dokumentart || "(o.Art)"; m[kk] = (m[kk] || 0) + 1; return m; }, {}) });
      }
      const it0 = iters[0];
      const r = it0.r, s = r.stats, dd = it0.dd, sortedIds = it0.sortedIds, docSetHash = it0.docSetHash, dokTypVerteilung = it0.dokTypVerteilung;
      const titelloseFps = new Set(r.documents.filter((d) => d.titel === null).map((d) => d.inhaltsfingerabdruck));
      const titellose = r.documents.filter((d) => d.titel === null).length;
      const keinSammelcluster = s.platzhalter === 0 && titelloseFps.size === titellose; // titellose Docs alle eindeutig
      // Cross-Run-Stabilitaet ueber REPEAT Laeufe (neue/verschwundene IDs, Quoten, Laufzeit).
      const hashes = iters.map((i) => i.docSetHash);
      const set0 = new Set(iters[0].sortedIds), setN = new Set(iters[iters.length - 1].sortedIds);
      const stabilitaet = {
        laeufe: REPEAT, docSetHashes: hashes, alleIdentisch: new Set(hashes).size === 1,
        neueIds: [...setN].filter((x) => !set0.has(x)).length, verschwundeneIds: [...set0].filter((x) => !setN.has(x)).length,
        geparstProLauf: iters.map((i) => i.r.stats.geparst), fehlerGesamt: iters.reduce((a, i) => a + i.r.fehler, 0),
        titelQuoten: iters.map((i) => q(i.r.stats.mitTitel, i.r.stats.geparst)), datumQuoten: iters.map((i) => q(i.r.stats.mitDatum, i.r.stats.geparst)),
        laufzeitenMs: iters.map((i) => i.r.ms), dokTypStabil: iters.every((i) => JSON.stringify(i.dokTypVerteilung) === JSON.stringify(it0.dokTypVerteilung))
      };
      const land = {
        stabilitaet,
        id: t.id, land: t.land, url: t.url, status: r.status, redirects: r.redirects, htmlFehlerseite: r.htmlFehlerseite, truncated: r.truncated,
        rohdatensaetze: s.rohRecords, deleteStubs: s.deleteStubs, ohneDokument: s.ohneDokument, geparst: s.geparst, fehler: r.fehler,
        platzhalter: s.platzhalter,
        quoteTitel: q(s.mitTitel, s.geparst), quoteDatum: q(s.mitDatum, s.geparst), quoteExterneId: q(s.mitExterneId, s.geparst),
        formatTitelVorhanden: s.formatTitelVorhanden, formatTitelErkannt: s.formatTitelErkannt, quoteFormatTitel: q(s.formatTitelErkannt, s.formatTitelVorhanden),
        dokumente: dd.anzahl, fundstellen: dd.dokumente.reduce((a, d) => a + d.fundstellen_anzahl, 0), mehrfachFundstellen: dd.mehrfach,
        mehrfachBeispiele: dd.dokumente.filter((d) => d.fundstellen_anzahl > 1).slice(0, 10).map((d) => ({ titel: d.titel, externe_ids: d.fundstellen.map((f) => f.externe_id), identisch: new Set(d.fundstellen.map((f) => f.externe_id)).size === 1 })),
        keinSammelcluster, docSetHash, dokTypVerteilung, externeIdBeispiele: sortedIds.slice(0, 5),
        laufzeitMs: r.ms, peakBufferKB: Math.round(r.peakBufferBytes / 1024), gelesenKB: Math.round(r.bytes / 1024),
        beispiele: r.documents.slice(0, 3).map((d) => ({ externe_id: d.externe_id, titel: d.titel, datum: d.veroeffentlichungsdatum, dokumentart: d.dokumentart, wahlperiode: d.wahlperiode, url: d.originaladresse }))
      };
      lands.push(land);
      console.log(`--- ${t.id} (${t.land}) ---`);
      console.log(`  HTTP ${land.status} · ${land.redirects} Weiterleitung(en) · gelesen ${land.gelesenKB} KB · ${land.truncated ? "abgeschnitten(Cap)" : "Ende erreicht"}`);
      console.log(`  Roh ${land.rohdatensaetze} · delete-Stubs ${land.deleteStubs} · ohne Dokument ${land.ohneDokument} · geparst ${land.geparst} · Fehler ${land.fehler}`);
      console.log(`  Titel ${land.quoteTitel}% · Datum ${land.quoteDatum}% · externe ID ${land.quoteExterneId}% · Format-Titel erkannt ${land.quoteFormatTitel}% (${land.formatTitelErkannt}/${land.formatTitelVorhanden})`);
      console.log(`  Dokumente nach Dedup ${land.dokumente} · Fundstellen ${land.fundstellen} (mehrfach ${land.mehrfachFundstellen}) · Platzhalter ${land.platzhalter} · kein Sammelcluster: ${land.keinSammelcluster}`);
      console.log(`  Laufzeit ${land.laufzeitMs} ms · Puffer-Spitze ${land.peakBufferKB} KB`);
      console.log(`  docSetHash ${land.docSetHash} · Dokumentarten ${JSON.stringify(land.dokTypVerteilung)}`);
      if (REPEAT > 1) console.log(`  STABILITAET ${REPEAT} Laeufe: identisch=${stabilitaet.alleIdentisch} · neue IDs=${stabilitaet.neueIds} · verschwundene IDs=${stabilitaet.verschwundeneIds} · Dok-Art stabil=${stabilitaet.dokTypStabil} · Fehler ges=${stabilitaet.fehlerGesamt} · geparst/Lauf=${JSON.stringify(stabilitaet.geparstProLauf)} · Laufzeiten=${JSON.stringify(stabilitaet.laufzeitenMs)}`);
      for (const b of land.beispiele) console.log(`    · [${b.externe_id}] WP${b.wahlperiode} ${b.dokumentart} ${b.datum || "(o.Datum)"} — ${b.titel ? '"' + b.titel.slice(0, 70) + '"' : "(titellos)"}`);
      if (land.mehrfachBeispiele.length) { console.log("  Zusammengefuehrte Dokumente (Diagnose):"); for (const m of land.mehrfachBeispiele) console.log(`    · ${m.identisch ? "IDENTISCHE ID (echtes Duplikat)" : "VERSCHIEDENE IDs (Kollision!)"}: ${m.externe_ids.join(", ")} — ${m.titel ? '"' + m.titel.slice(0, 50) + '"' : "(titellos)"}`); }
    }
  } else {
    for (const t of targets()) lands.push({ id: t.id, land: t.land, url: t.url, status: null, hinweis: "Egress gesperrt — kein Ergebnis erfunden" });
  }
  const rssEnd = process.memoryUsage().rss;

  // Akzeptanzkriterien (messbar)
  const akzeptanz = lands.filter((l) => l.geparst).map((l) => ({
    id: l.id,
    "1_keinSammelcluster": l.keinSammelcluster === true,
    "2_stabileIdentitaet": l.quoteExterneId === 100,
    "3_titelErkennung>=95%": (l.quoteFormatTitel ?? 0) >= 95,
    "4_platzhalter=0": l.platzhalter === 0,
    "5_keineFehler": l.fehler === 0
  }));

  const report = {
    generatedAt: new Date().toISOString(), modus: "shadow-only (DB-frei; kein Storage-Write, kein LLM, kein Production-Crawl)",
    egressOffen, maxRecords: MAX_RECORDS,
    speicher: { rssStartMB: +(rssStart / 1048576).toFixed(1), rssEndMB: +(rssEnd / 1048576).toFixed(1), peakBufferKB_max: Math.max(0, ...lands.map((l) => l.peakBufferKB || 0)) },
    lands, akzeptanz
  };
  console.log("\n--- Akzeptanz ---");
  for (const a of akzeptanz) console.log(`  ${a.id}: ${JSON.stringify(a)}`);
  console.log(`Speicher: rss ${report.speicher.rssStartMB}->${report.speicher.rssEndMB} MB · Puffer-Spitze max ${report.speicher.peakBufferKB_max} KB`);
  if (outPath) { fs.writeFileSync(outPath, JSON.stringify(report, null, 2)); console.log(`\nJSON: ${outPath}`); }
  return report;
}

if (require.main === module) run().catch((e) => { console.error(e); process.exit(1); });
module.exports = { streamAndParse, targets };
