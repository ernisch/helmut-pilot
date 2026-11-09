"use strict";

// Reine Aufteilung eines bereits belegten Originaltexts. Kein Abruf, Modell,
// Speicher oder Quellenurteil. Membership belegt Integritaet, keine Herkunft
// und keine Lektuere: der Aufrufer bindet originalHash/bundleHash an die Quelle.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const LIMITS = Object.freeze({ maxZeichen: 8000, maxBytes: 12000, originalBytes: 1024 * 1024, abschnitte: 256 });
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
const hex = s => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const keys = (o, k) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).sort().join() === [...k].sort().join();
function fordere(ok, reason) { if (!ok) throw new Error("artikel-abschnitte-" + reason); }
function wohlgeformt(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
function grenzen(opts = {}) {
  fordere(opts && typeof opts === "object" && !Array.isArray(opts)
    && Object.keys(opts).every(k => ["maxZeichen", "maxBytes"].includes(k)), "grenzen-ungueltig");
  const maxZeichen = opts.maxZeichen ?? LIMITS.maxZeichen, maxBytes = opts.maxBytes ?? LIMITS.maxBytes;
  fordere(integer(maxZeichen) && maxZeichen > 0 && maxZeichen <= LIMITS.maxZeichen
    && integer(maxBytes) && maxBytes > 0 && maxBytes <= LIMITS.maxBytes, "grenzen-ungueltig");
  return { maxZeichen, maxBytes };
}
const passt = (text, g) => text.length <= g.maxZeichen && Buffer.byteLength(text, "utf8") <= g.maxBytes;
const leaf = p => hash(JSON.stringify([p.index, p.start, p.end, p.textHash]));
const root = b => hash(JSON.stringify([b.version, b.originalHash, b.gesamtZeichen, b.gesamtBytes,
  b.maxZeichen, b.maxBytes, b.abschnittHashes]));

// Nur explizite Satzzeichen vor Whitespace oder Textende sind Trennstellen.
// Bekannte Abkuerzungen, Aufzaehlungszahlen und Dezimalstellen bleiben zusammen.
// Ein nicht sicher trennbarer ueberlanger Satz bleibt ehrlich blockiert.
function satzEnden(text, start, end) {
  const result = [];
  const part = text.slice(start, end);
  const pattern = /[.!?][”"“'’»)]*(?=\s|$)\s*/gu;
  for (const m of part.matchAll(pattern)) {
    if (m[0][0] === ".") {
      if (part[m.index - 1] === ".") continue;
      const wort = /([\p{L}\p{N}]+)\.$/u.exec(part.slice(Math.max(0, m.index - 32), m.index + 1))?.[1] || "";
      if (/^(?:\p{L}|\d+|Dr|Prof|Dipl|Ing|bzw|ca|Nr|Abs|Art|Mio|Mrd|Str|usw|etc)$/iu.test(wort)) continue;
      if (/^[\p{Ll}]/u.test(part.slice(m.index + m[0].length, m.index + m[0].length + 2))) continue;
    }
    result.push(start + m.index + m[0].length);
  }
  if (result.at(-1) !== end) result.push(end);
  return result;
}
function segmentiere(text, opts = {}) {
  const g = grenzen(opts);
  fordere(typeof text === "string" && text.trim().length > 0 && wohlgeformt(text)
    && Buffer.byteLength(text, "utf8") <= LIMITS.originalBytes, "original-ungueltig");
  const paragraphEnds = [...text.matchAll(/(?:\r?\n)[\t ]*(?:\r?\n)(?:[\t ]*\r?\n)*/g)]
    .map(m => m.index + m[0].length);
  if (paragraphEnds.at(-1) !== text.length) paragraphEnds.push(text.length);
  const units = [];
  let start = 0;
  for (const end of paragraphEnds) {
    if (passt(text.slice(start, end), g)) units.push(end);
    else {
      let prior = start;
      for (const sentenceEnd of satzEnden(text, start, end)) {
        fordere(passt(text.slice(prior, sentenceEnd), g), "satz-zu-lang");
        units.push(sentenceEnd); prior = sentenceEnd;
      }
    }
    start = end;
  }
  const abschnitte = [];
  const append = (from, to) => {
    fordere(to > from && abschnitte.length < LIMITS.abschnitte, "anzahl-ueberschritten");
    const value = text.slice(from, to);
    fordere(value.trim().length > 0, "abschnitt-ohne-text");
    fordere(passt(value, g), "abschnitt-zu-lang");
    abschnitte.push({ index: abschnitte.length, start: from, end: to, text: value, textHash: hash(value) });
  };
  let from = 0, to = 0;
  for (const end of units) {
    if (passt(text.slice(from, end), g)) to = end;
    else { append(from, to); from = to; to = end; }
  }
  append(from, to);
  const bundle = { version: 1, originalHash: hash(text), gesamtZeichen: text.length,
    gesamtBytes: Buffer.byteLength(text, "utf8"), ...g, count: abschnitte.length,
    abschnitte, abschnittHashes: abschnitte.map(leaf) };
  return { ...bundle, bundleHash: root(bundle) };
}
function pruefeBundle(bundle) {
  fordere(keys(bundle, ["version", "originalHash", "gesamtZeichen", "gesamtBytes", "maxZeichen", "maxBytes",
    "count", "abschnitte", "abschnittHashes", "bundleHash"])
    && Array.isArray(bundle.abschnitte) && bundle.abschnitte.length > 0 && bundle.abschnitte.length <= LIMITS.abschnitte,
  "bundle-ungueltig");
  const texts = [];
  let bytes = 0;
  for (const p of bundle.abschnitte) {
    fordere(keys(p, ["index", "start", "end", "text", "textHash"]) && typeof p.text === "string", "bundle-ungueltig");
    bytes += Buffer.byteLength(p.text, "utf8");
    fordere(bytes <= LIMITS.originalBytes, "original-ungueltig");
    texts.push(p.text);
  }
  const canonical = segmentiere(texts.join(""), { maxZeichen: bundle.maxZeichen, maxBytes: bundle.maxBytes });
  fordere(isDeepStrictEqual(canonical, bundle), "bundle-abweichend");
  return canonical;
}
function waehle(bundle, index) {
  const checked = pruefeBundle(bundle);
  fordere(integer(index) && index < checked.count, "index-ungueltig");
  const { abschnitte, ...meta } = checked;
  return { ...meta, ...abschnitte[index] };
}
function pruefe(piece) {
  fordere(keys(piece, ["version", "originalHash", "gesamtZeichen", "gesamtBytes", "maxZeichen", "maxBytes",
    "count", "index", "start", "end", "text", "textHash", "abschnittHashes", "bundleHash"]), "piece-ungueltig");
  const g = grenzen({ maxZeichen: piece.maxZeichen, maxBytes: piece.maxBytes });
  fordere(piece.version === 1 && hex(piece.originalHash) && hex(piece.bundleHash)
    && integer(piece.gesamtZeichen) && piece.gesamtZeichen > 0
    && integer(piece.gesamtBytes) && piece.gesamtBytes >= piece.gesamtZeichen && piece.gesamtBytes <= LIMITS.originalBytes
    && integer(piece.count) && piece.count > 0 && piece.count <= LIMITS.abschnitte
    && integer(piece.index) && piece.index < piece.count
    && integer(piece.start) && integer(piece.end) && piece.end > piece.start && piece.end <= piece.gesamtZeichen
    && (piece.index !== 0 || piece.start === 0) && (piece.index !== piece.count - 1 || piece.end === piece.gesamtZeichen)
    && typeof piece.text === "string" && piece.text.trim().length > 0
    && piece.text.length === piece.end - piece.start && wohlgeformt(piece.text)
    && passt(piece.text, g) && Buffer.byteLength(piece.text, "utf8") <= piece.gesamtBytes
    && hex(piece.textHash) && hash(piece.text) === piece.textHash
    && Array.isArray(piece.abschnittHashes) && piece.abschnittHashes.length === piece.count
    && piece.abschnittHashes.every(hex) && new Set(piece.abschnittHashes).size === piece.count
    && leaf(piece) === piece.abschnittHashes[piece.index] && root(piece) === piece.bundleHash, "piece-abweichend");
  return structuredClone(piece);
}
module.exports = { LIMITS, segmentiere, waehle, pruefe, pruefeBundle };
