"use strict";

// Regressionstest fuer die Querformat-Sperre (Smartphone-only). Prueft
// statisch (ohne Browser/Netz), dass:
//  - die Sperr-Ansicht in index.html UND server.js.__indexHtml() (der
//    tatsaechlich ausgelieferten Production-Shell) vorhanden ist und beide
//    nicht auseinanderdriften (gleiches Muster wie splash-boot-test.js),
//  - der geforderte Text exakt vorkommt,
//  - die Sperre per CSS standardmaessig verborgen ist und NUR ueber eine
//    Kombination aus Ausrichtung + Bildschirmgroesse + Touch-Eingabe
//    eingeblendet wird (kein Treffer auf Desktop/Tablet),
//  - KEINE experimentelle Orientation-Lock-Browser-API verwendet wird.
// Die tatsaechliche visuelle/Interaktions-Pruefung ueber echte Viewports
// (Smartphone Hoch-/Querformat, Tablet, Desktop) laeuft zusaetzlich in
// scripts/browser-smoke-test.js (echtes Chromium via Playwright).
// KEIN Netz, KEINE KI, KEINE Mutation.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const client = fs.readFileSync(path.join(root, "client.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
const serverModule = require(path.join(root, "server.js"));
const productionShell = serverModule.__indexHtml();

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const LOCK_TEXT = "Bitte drehe dein Smartphone ins Hochformat, um Helmut zu verwenden.";

// --- Markup vorhanden (index.html + tatsaechliche Production-Shell) --------
console.log("Markup");
check("index.html enthaelt die Sperr-Ansicht (#orientationLock)", html.includes('id="orientationLock"'));
check("index.html enthaelt den geforderten Sperrtext", html.includes(LOCK_TEXT));
check("Production Shell enthaelt die Sperr-Ansicht (#orientationLock)", productionShell.includes('id="orientationLock"'));
check("Production Shell enthaelt den geforderten Sperrtext", productionShell.includes(LOCK_TEXT));

// --- Konsistenz index.html <-> server.js (keine unbemerkte Drift) ----------
console.log("\nKonsistenz index.html <-> server.js");
function extractLockBlock(source) {
  const m = source.match(/<div class="orientation-lock"[\s\S]*?<\/div>\s*<\/div>/);
  return m ? m[0] : "";
}
const indexLock = extractLockBlock(html);
const shellLock = extractLockBlock(productionShell);
const normalize = (s) => (s || "").replace(/\s+/g, " ").trim();
check("index.html-Sperr-Markup UND server.js-Sperr-Markup sind identisch (Whitespace ignoriert)",
  Boolean(indexLock) && Boolean(shellLock) && normalize(indexLock) === normalize(shellLock));

// --- CSS: standardmaessig verborgen, nur ueber Media-Query sichtbar --------
console.log("\nCSS-Grundlagen");
const lockRule = (css.match(/\.orientation-lock\s*\{[\s\S]*?\}/) || [""])[0];
check("styles.css: .orientation-lock ist standardmaessig verborgen (display: none)",
  /display:\s*none/.test(lockRule));
check("styles.css: .orientation-lock liegt ueber dem Splash-Overlay (z-index > 9999)", (() => {
  const m = lockRule.match(/z-index:\s*(\d+)/);
  return Boolean(m) && Number(m[1]) > 9999;
})());
check("styles.css: .orientation-lock deckt den ganzen Bildschirm ab (position: fixed; inset: 0)",
  /position:\s*fixed/.test(lockRule) && /inset:\s*0/.test(lockRule));

const mqMatch = css.match(/@media\s*\(orientation:\s*landscape\)[^{]*\{\s*\.orientation-lock\s*\{\s*display:\s*grid;\s*\}\s*\}/);
check("styles.css: eigene Media-Query blendet .orientation-lock bei Querformat ein", Boolean(mqMatch));
const mqCondition = mqMatch ? mqMatch[0] : "";
check("Media-Query prueft Ausrichtung (orientation: landscape)", /orientation:\s*landscape/.test(mqCondition));
check("Media-Query prueft Bildschirmgroesse (max-height, Smartphone-typisch)", /max-height:\s*\d+px/.test(mqCondition));
check("Media-Query prueft Bildschirmgroesse (max-width, Smartphone-typisch)", /max-width:\s*\d+px/.test(mqCondition));
check("Media-Query grenzt Touch-Geraete ohne Maus/Trackpad ein (hover: none)", /hover:\s*none/.test(mqCondition));
check("Media-Query grenzt grobe Zeigergenauigkeit ein (pointer: coarse) — schliesst Desktop-Maus aus",
  /pointer:\s*coarse/.test(mqCondition));

// max-height muss klar unterhalb typischer Tablet-Querformat-Hoehen liegen
// (kleinstes gaengiges Tablet-Querformat ~744-768px), damit Tablets nicht
// versehentlich gesperrt werden, aber oberhalb gaengiger Smartphone-Querformat-
// Hoehen (~360-480px), damit die Sperre auf Smartphones tatsaechlich greift.
const maxHeight = Number((mqCondition.match(/max-height:\s*(\d+)px/) || [])[1]);
check("Media-Query: max-height liegt zwischen Smartphone- und Tablet-Querformat (480-700px)",
  Number.isFinite(maxHeight) && maxHeight >= 480 && maxHeight <= 700, `max-height=${maxHeight}px`);

// --- Keine experimentelle Browser-API (Screen Orientation Lock API) --------
console.log("\nKeine experimentelle Browser-API");
check("client.js nutzt NICHT die experimentelle Screen-Orientation-Lock-API",
  !/screen\s*\.\s*orientation\s*\.\s*lock/.test(client));
check("index.html nutzt NICHT die experimentelle Screen-Orientation-Lock-API",
  !/screen\s*\.\s*orientation\s*\.\s*lock/.test(html));
check("server.js nutzt NICHT die experimentelle Screen-Orientation-Lock-API",
  !/screen\s*\.\s*orientation\s*\.\s*lock/.test(serverSrc));
check("client.js registriert KEINEN eigenen orientationchange-Listener (rein CSS-getrieben)",
  !/addEventListener\(\s*["']orientationchange["']/.test(client));

console.log(`\n${passed}/${passed + failed} Querformat-Sperre-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
