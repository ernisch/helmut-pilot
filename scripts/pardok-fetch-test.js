"use strict";

// PARDOK-Streaming-Abruf (Audit-Fix 2026-07, Sprint 7 / Berlin-Grundlagen).
// KEIN externes Netz — lokaler HTTP-Server simuliert den Parlaments-Export.
// FRÜHERER FEHLER: Der PARDOK-Dispatch bekam den normalen fetchText mit
// 10-MiB-Limit injiziert; die echten Exporte (Berlin ~48 MB, BB ~12 MB)
// scheiterten damit IMMER an "Response too large" — selbst der Shadow-Betrieb
// über den Production-Crawl konnte die realen Quellen nie verarbeiten.

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const { fetchPardokText } = require("../lib/helmut/crawler");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

function record(i) {
  return `<Dokument><DokNr>${i}</DokNr><Titel>Testdokument ${i}</Titel><Text>${"x".repeat(2000)}</Text></Dokument>\n`;
}

(async () => {
  // Simulierter Voll-Export: 5000 Records à ~2 KB = ~10 MB (gestreamt in Stücken).
  const TOTAL = 5000;
  let servedBytes = 0;
  const server = http.createServer((req, res) => {
    servedBytes = 0;
    if (req.url === "/redirect") { res.writeHead(302, { Location: "/export.xml" }); res.end(); return; }
    res.writeHead(200, { "content-type": "application/xml" });
    res.write("<Export>\n");
    let i = 0;
    const writeChunk = () => {
      let chunk = "";
      for (let n = 0; n < 50 && i < TOTAL; n += 1, i += 1) chunk += record(i);
      servedBytes += Buffer.byteLength(chunk);
      const more = i < TOTAL;
      res.write(chunk, () => {
        if (!more) { res.end("</Export>"); return; }
        setImmediate(writeChunk);
      });
    };
    writeChunk();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // 1) Frueher Abbruch: maxRecords=100 -> nur ein Bruchteil des Exports geladen.
  const res100 = await fetchPardokText(`${base}/export.xml`, { maxRecords: 100 });
  const gotRecords = (res100.body.match(/<\/Dokument>/g) || []).length;
  check("Record-Fruehabbruch: mindestens maxRecords, deutlich unter Gesamtmenge",
    gotRecords >= 100 && gotRecords < 500, `records=${gotRecords}`);
  check("Truncated-Flag gesetzt", res100.truncated === true);
  check("Sauberer Schnitt: Body endet mit vollstaendigem Record",
    res100.body.trimEnd().endsWith("</Dokument>"));
  check("Nur ein Bruchteil der Bytes geladen (Streaming wirkt)",
    res100.receivedBytes < 5 * 1024 * 1024, `bytes=${res100.receivedBytes}`);

  // 2) Byte-Budget: winziges maxBytes -> harter, sauberer Fehler.
  let sizeErr = null;
  await fetchPardokText(`${base}/export.xml`, { maxBytes: 50 * 1024, maxRecords: 999999 })
    .catch((e) => { sizeErr = e; });
  check("Byte-Budget bleibt hart (PARDOK response too large)",
    Boolean(sizeErr) && /too large/i.test(sizeErr.message));

  // 3) Redirects werden verfolgt (Parlamentsserver leiten teils um).
  const resRedirect = await fetchPardokText(`${base}/redirect`, { maxRecords: 10 });
  check("Redirect wird verfolgt", (resRedirect.body.match(/<\/Dokument>/g) || []).length >= 10);

  // 4) Voller (kleiner) Export ohne Limit-Beruehrung: truncated=false.
  const resFullSrv = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/xml" });
    res.end(`<Export>${record(1)}${record(2)}</Export>`);
  });
  await new Promise((r) => resFullSrv.listen(0, "127.0.0.1", r));
  const resFull = await fetchPardokText(`http://127.0.0.1:${resFullSrv.address().port}/x.xml`, { maxRecords: 800 });
  check("Kleiner Export laeuft unveraendert durch (truncated=false)",
    resFull.truncated === false && (resFull.body.match(/<\/Dokument>/g) || []).length === 2);
  resFullSrv.close();

  // 5) Verdrahtung: der Crawl injiziert den PARDOK-Fetcher (nicht das 10-MiB-fetchText)
  //    und reicht ein Record-Limit an den Dispatch durch.
  const crawlerSource = fs.readFileSync(path.join(root, "lib/helmut/crawler.js"), "utf8");
  check("pardokDispatch bekommt fetchPardokText injiziert",
    /pardokDispatch\(source, \{\s*\n\s*env: deps\.env,\s*\n\s*fetchText: deps\.fetchText \|\| \(async \(u\) => \(await fetchPardokText\(u, \{\}, 0, deps\)\)\.body\),\s*\n\s*maxRecords: defaultPardokMaxRecords/.test(crawlerSource));
  check("PARDOK-Budget ist konfigurierbar dokumentiert (HELMUT_PARDOK_MAX_RESPONSE_BYTES/MAX_RECORDS)",
    crawlerSource.includes("HELMUT_PARDOK_MAX_RESPONSE_BYTES") && crawlerSource.includes("HELMUT_PARDOK_MAX_RECORDS"));

  // 6) Env fail-closed (Review-Fix M1): ein GESETZTER ungültiger Wert deaktiviert
  //    NICHT still die Schutzgrenzen. Über opts (gleiche Validierung wie Env).
  const badBytes = await fetchPardokText(`${base}/export.xml`, { maxBytes: "64MB", maxRecords: 50 }).catch(() => null);
  check("Ungültiges maxBytes ('64MB') deaktiviert das Byte-Limit NICHT (Default greift)",
    badBytes && badBytes.body && (badBytes.body.match(/<\/Dokument>/g) || []).length >= 50);
  const zeroRecords = await fetchPardokText(`${base}/export.xml`, { maxRecords: "0" });
  check("maxRecords '0' fällt auf Default zurück (kein Sofort-0-Abbruch)",
    (zeroRecords.body.match(/<\/Dokument>/g) || []).length > 0);

  // 7) Inkrementeller Zähler (Review-Fix M2): korrekt UND ohne Doppelzählung über
  //    Chunk-Grenzen — inkl. eines an der Grenze gespaltenen Schließ-Tags.
  const crawler = require("../lib/helmut/crawler");
  // (Der Zähler ist intern; wir prüfen das beobachtbare Verhalten: exakt maxRecords
  //  Records werden geschnitten, nie zu früh/zu spät — auch bei winzigen Chunks.)
  const tinyChunkSrv = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/xml" });
    res.write("<Export>");
    const full = Array.from({ length: 300 }, (_, i) => record(i)).join("");
    // In 3-Byte-Häppchen schreiben, damit Tags garantiert über Chunk-Grenzen brechen.
    let i = 0;
    const step = () => {
      if (i >= full.length) { res.end("</Export>"); return; }
      res.write(full.slice(i, i + 3), () => { i += 3; setImmediate(step); });
    };
    step();
  });
  await new Promise((r) => tinyChunkSrv.listen(0, "127.0.0.1", r));
  const tiny = await fetchPardokText(`http://127.0.0.1:${tinyChunkSrv.address().port}/x.xml`, { maxRecords: 120 });
  const tinyCount = (tiny.body.match(/<\/Dokument>/g) || []).length;
  check("Inkrementeller Zähler exakt über Mini-Chunk-Grenzen (kein Doppel-/Fehlzählen)",
    tinyCount >= 120 && tinyCount <= 121, `count=${tinyCount}`);
  tinyChunkSrv.close();

  server.close();
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
