"use strict";

// Smoke-Test Schritt C: NACHWEIS, dass die sichtbaren Nutzerpfade (Lage / Radar / Helmut / Buero)
// unveraendert bleiben und KEIN Berlin/Brandenburg-Inhalt sie ueber den PARDOK-Dispatch erreicht.
// Zwei unabhaengige Beweislinien, beide REINE LOGIK (kein Netz/DB/LLM):
//   A) STRUKTURELL: statischer, rekursiver require-Graph der sichtbaren Lese-/Render-Backends —
//      kein Pfad fuehrt zu pardok-dispatch/pardok-parser. Die Read-Surfaces koennen BE/BB gar
//      nicht parsen; sie lesen ausschliesslich aus der DB.
//   B) VERHALTEN: Aggregation wie in crawlAllSources (flatMap der crawlSource-Items) ueber eine
//      Quellenliste MIT aktiver structured_download-BE/BB-Quelle (Guard shadow, injizierter
//      Fetcher) — die entstehenden rawItems enthalten NULL BE/BB-Dokumente.

const fs = require("fs");
const path = require("path");
const { crawlSource, deduplicateRawItems } = require("../lib/helmut/crawler");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
function fx(n) { return fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "pardok", n), "utf8"); }
const libDir = path.join(__dirname, "..", "lib", "helmut");

// --- A) Statischer require-Graph-Scan (nur relative lib/helmut-Requires; Builtins/Klimmzuege ignoriert)
function relRequires(file) {
  const src = fs.readFileSync(file, "utf8");
  const out = [];
  for (const m of src.matchAll(/require\((?:"|')(\.[^"']+)(?:"|')\)/g)) out.push(m[1]);
  return out;
}
function resolveRel(fromFile, rel) {
  let p = path.resolve(path.dirname(fromFile), rel);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  if (fs.existsSync(p + ".js")) return p + ".js";
  if (fs.existsSync(path.join(p, "index.js"))) return path.join(p, "index.js");
  return null;
}
// Rekursiver Abschluss der require-Kanten ab einer Datei (nur existierende .js im Repo).
function requireClosure(entryFile) {
  const seen = new Set(); const stack = [entryFile];
  while (stack.length) {
    const f = stack.pop();
    if (!f || seen.has(f)) continue;
    seen.add(f);
    for (const rel of relRequires(f)) {
      const r = resolveRel(f, rel);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return seen;
}

// Die sichtbaren Lese-/Render-Backends (Server verdrahtet genau diese fuer die vier Oberflaechen).
const surfaces = {
  "Lage": "lage.js",
  "Radar": "radar.js",
  "Radar-State": "radarState.js",
  "Helmut (Matching)": "matching.js",
  "Helmut (Understanding-Read)": "understanding.js",
  "Buero": "office.js",
  "Entscheidungen": "decisions.js"
};
for (const [label, file] of Object.entries(surfaces)) {
  const closure = requireClosure(path.join(libDir, file));
  const touchesPardok = [...closure].some((f) => /pardok-(dispatch|parser)/.test(f));
  check(`A ${label}: require-Graph beruehrt KEIN pardok-dispatch/pardok-parser`, !touchesPardok);
}

// Gegenprobe: crawler.js (Ingestion, nicht sichtbar) DARF pardok-dispatch erreichen — sonst waere
// der Test wirkungslos (er wuerde nie etwas finden koennen).
const crawlerClosure = requireClosure(path.join(libDir, "crawler.js"));
check("A Gegenprobe: crawler.js-Graph erreicht pardok-dispatch (Scanner ist wirksam)",
  [...crawlerClosure].some((f) => /pardok-dispatch/.test(f)));

// --- B) Verhaltens-Nachweis: Aggregation ueber eine Quellenliste mit aktiver BE/BB-Quelle -------
function fetcherOf(xml) { return async () => xml; }
async function crawlAllLike(sources) {
  const perSource = [];
  for (const s of sources) perSource.push(await crawlSource(s.source, s.deps || {}));
  return deduplicateRawItems(perSource.flat());
}
function looksBeBb(item) {
  const hay = JSON.stringify(item || {}).toLowerCase();
  return /externe_id|geo-land-berlin|geo-land-brandenburg|abgeordnetenhaus|landtag brandenburg|"land":"berlin"|"land":"brandenburg"/.test(hay);
}

const savedFlag = process.env.HELMUT_PARDOK_DISPATCH;
(async () => {
  try {
    process.env.HELMUT_PARDOK_DISPATCH = "shadow"; // schaerfster Fall: Shadow-Pfad AKTIV
    const sources = [
      { source: { id: "manuelle-quelle", crawlMethod: "manual", url: "https://x" } },
      { source: { id: "be-plenum", crawlMethod: "structured_download", url: "https://x/be.xml" }, deps: { fetchText: fetcherOf(fx("berlin-gold.xml")) } },
      { source: { id: "bb-plenum", crawlMethod: "structured_download", url: "https://x/bb.xml" }, deps: { fetchText: fetcherOf(fx("brandenburg-gold.xml")) } }
    ];
    const rawItems = await crawlAllLike(sources);
    check("B1 aggregierte rawItems aus BE+BB-structured_download = 0 (Shadow-Pfad liefert nichts in die Pipeline)", rawItems.length === 0);
    check("B2 kein rawItem traegt BE/BB-Marker (externe_id/Geo/Institution)", !rawItems.some(looksBeBb));

    // Kontrast: dieselben BE/BB-Quellen mit Guard AUS liefern ebenfalls 0 (inert) — identisch.
    process.env.HELMUT_PARDOK_DISPATCH = "off";
    const rawOff = await crawlAllLike([
      { source: { id: "be-plenum", crawlMethod: "structured_download", url: "https://x/be.xml" }, deps: { fetchText: fetcherOf(fx("berlin-gold.xml")) } }
    ]);
    check("B3 Guard AUS: identisches Pipeline-Ergebnis (0 Items) wie im Shadow-Fall", rawOff.length === 0);
  } finally {
    if (savedFlag === undefined) delete process.env.HELMUT_PARDOK_DISPATCH; else process.env.HELMUT_PARDOK_DISPATCH = savedFlag;
  }

  // --- C) Verdrahtungs-Nachweis am Quelltext: EINZIGE Anbindung ist der eine crawlSource-Zweig ---
  const crawlerSrc = fs.readFileSync(path.join(libDir, "crawler.js"), "utf8");
  const dispatchCalls = (crawlerSrc.match(/pardokDispatch\(/g) || []).length;
  check("C crawler.js ruft pardokDispatch genau 1x auf (einzige Anbindung, keine Streuung)", dispatchCalls === 1);
  check("C Anbindung ist an crawlMethod 'structured_download' gebunden", /crawlMethod === "structured_download"/.test(crawlerSrc));

  console.log(`\n== PARDOK-Dispatch Smoke-Test (Nutzerpfad-Isolation): ${fail === 0 ? "ALLE GRÜN — sichtbare Pfade unveraendert, kein BE/BB-Leck" : fail + " FEHLGESCHLAGEN"} ==`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("UNERWARTETER FEHLER", e); process.exit(1); });
