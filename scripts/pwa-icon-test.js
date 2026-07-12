"use strict";

// Regressionstest fuer den PWA-Icon-Fix (dunkles Kaesten im Android-Splash).
// Prueft die 7 neu exportierten PNGs OHNE externe Abhaengigkeiten (reiner
// zlib-basierter PNG-Dekoder, kein Python/Pillow noetig) sowie die
// versionierten Referenzen in site.webmanifest, server.js und sw.js.
// KEIN Netz, KEINE KI, KEINE Mutation.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
const assetsDir = path.join(root, "assets");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- minimaler PNG-Dekoder (nur 8-bit RGB/RGBA, ausreichend fuer diese Icons) ---
function decodePng(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("kein PNG-Signatur-Header");
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 1;
  if (bitDepth !== 8) throw new Error(`unerwartete bitDepth ${bitDepth}`);
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let prevRow = Buffer.alloc(stride);
  let inPos = 0;
  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
  for (let y = 0; y < height; y++) {
    const filterType = raw[inPos]; inPos += 1;
    const row = Buffer.from(raw.subarray(inPos, inPos + stride)); inPos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      let f = row[x];
      if (filterType === 1) f = (f + a) & 255;
      else if (filterType === 2) f = (f + b) & 255;
      else if (filterType === 3) f = (f + ((a + b) >> 1)) & 255;
      else if (filterType === 4) f = (f + paeth(a, b, c)) & 255;
      row[x] = f;
    }
    row.copy(out, y * stride);
    prevRow = row;
  }
  return { width, height, channels, pixels: out };
}

function getPixel(img, x, y) {
  const o = (y * img.width + x) * img.channels;
  return [img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]];
}

function hex(rgb) {
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

const OLD_BG = [0x0f, 0x17, 0x2a]; // #0f172a
const NEW_BG = [0x05, 0x09, 0x14]; // #050914
const WHITE = [255, 255, 255];

const ICONS = [
  { file: "helmut_appicon_192.png", size: 192 },
  { file: "helmut_appicon_512.png", size: 512 },
  { file: "helmut_maskable_192.png", size: 192 },
  { file: "helmut_maskable_512.png", size: 512 },
  { file: "helmut_appletouch_180.png", size: 180 },
  { file: "favicon-32.png", size: 32 },
  { file: "favicon-16.png", size: 16 },
];

console.log("PNG-Icon-Pruefung (Hintergrund #0f172a -> #050914)");
for (const { file, size } of ICONS) {
  const fp = path.join(assetsDir, file);
  check(`${file}: Datei existiert`, fs.existsSync(fp));
  if (!fs.existsSync(fp)) continue;
  let img;
  try { img = decodePng(fp); } catch (e) { check(`${file}: gueltiges PNG`, false, e.message); continue; }
  check(`${file}: gueltiges PNG`, true);
  check(`${file}: Abmessungen ${size}x${size} unveraendert`, img.width === size && img.height === size,
    `ist ${img.width}x${img.height}`);
  check(`${file}: RGB opak, kein Alpha-Kanal (bleibt vollflaechig)`, img.channels === 3, `channels=${img.channels}`);

  const corner = getPixel(img, 0, 0);
  check(`${file}: Eck-Hintergrund exakt #050914`, corner.every((v, i) => v === NEW_BG[i]),
    `ist ${hex(corner)}`);

  // Ganzflaechig auf Rest der alten Farbe #0f172a scannen (kein Pixel darf sie mehr tragen).
  let oldColorFound = false;
  let whiteFound = false;
  for (let y = 0; y < img.height && !oldColorFound; y++) {
    for (let x = 0; x < img.width; x++) {
      const px = getPixel(img, x, y);
      if (px[0] === OLD_BG[0] && px[1] === OLD_BG[1] && px[2] === OLD_BG[2]) { oldColorFound = true; break; }
      if (px[0] === WHITE[0] && px[1] === WHITE[1] && px[2] === WHITE[2]) whiteFound = true;
    }
  }
  check(`${file}: kein Rest von #0f172a mehr im Bild`, !oldColorFound);
  check(`${file}: weisses H (reines #ffffff) vorhanden`, whiteFound);
}

// --- Maskable Safe-Area (W3C: Inhalt innerhalb der inneren 80% / 40%-Radius) ---
console.log("\nMaskable Safe-Area");
for (const file of ["helmut_maskable_192.png", "helmut_maskable_512.png"]) {
  const img = decodePng(path.join(assetsDir, file));
  const bg = getPixel(img, 0, 0);
  const cx = img.width / 2, cy = img.height / 2;
  const safeR = Math.min(img.width, img.height) * 0.4;
  let maxR = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const px = getPixel(img, x, y);
      const d = Math.abs(px[0] - bg[0]) + Math.abs(px[1] - bg[1]) + Math.abs(px[2] - bg[2]);
      if (d > 60) {
        const r = Math.hypot(x - cx, y - cy);
        if (r > maxR) maxR = r;
      }
    }
  }
  check(`${file}: H bleibt innerhalb der Maskable-Safe-Area (40%-Radius)`, maxR <= safeR,
    `H-Radius ${maxR.toFixed(1)}px > Safe-Radius ${safeR.toFixed(1)}px`);
}

// --- site.webmanifest: versionierte Icon-Referenzen, Struktur unveraendert ---
console.log("\nsite.webmanifest");
const manifestPath = path.join(root, "site.webmanifest");
const manifestRaw = fs.readFileSync(manifestPath, "utf8");
let manifest;
try { manifest = JSON.parse(manifestRaw); check("site.webmanifest: gueltiges JSON", true); }
catch (e) { check("site.webmanifest: gueltiges JSON", false, e.message); manifest = { icons: [] }; }

check("site.webmanifest: background_color unveraendert (#050914)", manifest.background_color === "#050914");
check("site.webmanifest: theme_color unveraendert (#050914)", manifest.theme_color === "#050914");
check("site.webmanifest: genau 4 Icons (Struktur unveraendert)", Array.isArray(manifest.icons) && manifest.icons.length === 4);

const purposeAny = (manifest.icons || []).filter((i) => i.purpose === "any");
const purposeMaskable = (manifest.icons || []).filter((i) => i.purpose === "maskable");
check("site.webmanifest: 2 Icons purpose=any (192+512)", purposeAny.length === 2 &&
  purposeAny.some((i) => i.sizes === "192x192") && purposeAny.some((i) => i.sizes === "512x512"));
check("site.webmanifest: 2 Icons purpose=maskable (192+512)", purposeMaskable.length === 2 &&
  purposeMaskable.some((i) => i.sizes === "192x192") && purposeMaskable.some((i) => i.sizes === "512x512"));
check("site.webmanifest: alle Icon-src mit Versions-Query (?v=)",
  (manifest.icons || []).every((i) => /\?v=[a-z0-9-]+$/i.test(i.src)));
check("site.webmanifest: alle Icons type=image/png", (manifest.icons || []).every((i) => i.type === "image/png"));

// --- server.js: dynamisch versionierte Icon-Links (ASSET_VERSION-Pattern) ---
console.log("\nserver.js Icon-Referenzen");
const serverJs = fs.readFileSync(path.join(root, "server.js"), "utf8");
check("server.js: favicon-32 mit ASSET_VERSION versioniert",
  /favicon-32\.png\?v=\$\{ASSET_VERSION\}/.test(serverJs));
check("server.js: favicon-16 mit ASSET_VERSION versioniert",
  /favicon-16\.png\?v=\$\{ASSET_VERSION\}/.test(serverJs));
check("server.js: apple-touch-icon (180) mit ASSET_VERSION versioniert",
  /helmut_appletouch_180\.png\?v=\$\{ASSET_VERSION\}/.test(serverJs));
check("server.js: apple-touch-icon Fallback (192) mit ASSET_VERSION versioniert",
  /helmut_appicon_192\.png\?v=\$\{ASSET_VERSION\}/.test(serverJs));
check("server.js: Manifest-Link mit ASSET_VERSION versioniert (dynamisch statt statischem String)",
  /site\.webmanifest\?v=\$\{ASSET_VERSION\}/.test(serverJs));
check("server.js: favicon.ico und SVG-Logo NICHT angefasst (unveraendert)",
  /href="assets\/favicon\.ico" sizes="any"/.test(serverJs) &&
  /href="assets\/helmut_logo\.svg" type="image\/svg\+xml"/.test(serverJs));

// --- index.html: statisch versionierte Icon-Links (Konsistenz zum Repo) ---
console.log("\nindex.html Icon-Referenzen");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
check("index.html: Icon-Links + Manifest-Link versioniert (?v=20260712-iconfix1)",
  /favicon-32\.png\?v=20260712-iconfix1/.test(indexHtml) &&
  /favicon-16\.png\?v=20260712-iconfix1/.test(indexHtml) &&
  /helmut_appletouch_180\.png\?v=20260712-iconfix1/.test(indexHtml) &&
  /helmut_appicon_192\.png\?v=20260712-iconfix1/.test(indexHtml) &&
  /site\.webmanifest\?v=20260712-iconfix1/.test(indexHtml));

// --- sw.js: Cache-Namespace erhoeht + Precache-URLs versioniert ---
console.log("\nsw.js Cache-Versionierung");
const swJs = fs.readFileSync(path.join(root, "sw.js"), "utf8");
check("sw.js: ASSET_CACHE-Namespace erhoeht (v1 -> v2, alte SW-Cache-Eintraege verfallen)",
  /ASSET_CACHE\s*=\s*"helmut-assets-v2"/.test(swJs));
check("sw.js: PRECACHE_URLS mit ICON_VERSION versioniert",
  /PRECACHE_URLS\s*=\s*\[\s*`\/assets\/helmut_appicon_192\.png\?v=\$\{ICON_VERSION\}`/.test(swJs));
check("sw.js: Push-Icon/Badge mit ICON_VERSION versioniert",
  /icon:\s*`\/assets\/helmut_appicon_192\.png\?v=\$\{ICON_VERSION\}`/.test(swJs) &&
  /badge:\s*`\/assets\/helmut_appicon_192\.png\?v=\$\{ICON_VERSION\}`/.test(swJs));

// --- vercel.json: Cache-Strategie selbst bleibt unveraendert ---
console.log("\nvercel.json (Cache-Strategie unangetastet)");
const vercelJson = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const assetsRoute = vercelJson.routes.find((r) => r.src === "/assets/(.*)");
check("vercel.json: /assets/(.*) Cache-Control unveraendert (immutable, kein Strategiewechsel)",
  assetsRoute && assetsRoute.headers["Cache-Control"] === "public, max-age=31536000, immutable");

console.log(`\n${passed}/${passed + failed} PWA-Icon-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
