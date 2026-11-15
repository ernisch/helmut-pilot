"use strict";

// Reiner, geschlossener Leser amtlicher deutscher FORMEX-Pakete. Kein Netz,
// keine Dateiextraktion und keine Erweiterung der allgemeinen Quellenrechte.
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const META = require("./quellen-eurlex-cellar");
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const CDM = "http://publications.europa.eu/ontology/cdm#";
const CMR = "http://publications.europa.eu/ontology/cdm/cmr#";
const OWL = "http://www.w3.org/2002/07/owl#";
const MAX_PACKAGE = 256 * 1024, MAX_XML = 512 * 1024;
const POSITION = "ACT/ENACTING.TERMS/ARTICLE[1]/ALINEA[1]";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const fail = reason => { throw new Error("eurlex-original-" + reason); };
const norm = value => String(value || "").replace(/\s+/gu, " ").trim();
const expanded = (ns, name) => "{" + ns + "}" + name;
function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value.slice(0, 10) + "T00:00:00.000Z").toISOString().slice(0, 10) !== value.slice(0, 10)) fail("manifestationsstand");
  return new Date(value).toISOString();
}

function bound(cellar) {
  const url = "https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:" + encodeURIComponent(cellar?.celex);
  if (!META.validiereHerkunft(cellar, url, cellar?.publicationDate + "T00:00:00.000Z")) fail("metadaten");
  return cellar.officialJournalUri + ".DEU.fmx4";
}

// Kleine XML-Struktur fuer die geschlossenen RDF-/FORMEX-Vertraege. DTDs,
// Entities, fremde Processing Instructions und externe Aufloesung sind gesperrt.
function entities(value) {
  if (/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-f]+);)/i.test(value)) fail("xml-entity");
  return value.replace(/&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-f]+);/gi, (_, token) => {
    const names = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (Object.hasOwn(names, token)) return names[token];
    const code = token.startsWith("#x") ? parseInt(token.slice(2), 16) : Number(token.slice(1));
    if (!Number.isInteger(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
      || code < 0x20 && ![9, 10, 13].includes(code) || [0xfffe, 0xffff].includes(code)) fail("xml-zeichen");
    return String.fromCodePoint(code);
  });
}
function xml(input, maxBytes = MAX_XML) {
  if (typeof input !== "string" || Buffer.byteLength(input, "utf8") > maxBytes
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(input)) fail("xml-groesse-zeichen");
  let source = input.replace(/^\ufeff/u, "");
  source = source.replace(/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?(?:\s+standalone=["'](?:yes|no)["'])?\s*\?>/i, "");
  const stack = [], roots = [];
  let offset = 0, count = 0;
  const qname = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?$/;
  while (offset < source.length) {
    if (source.startsWith("<!--", offset)) {
      const end = source.indexOf("-->", offset + 4);
      if (end < 0 || source.slice(offset + 4, end).includes("--")) fail("xml-kommentar");
      offset = end + 3; continue;
    }
    if (source.startsWith("<![CDATA[", offset)) {
      const end = source.indexOf("]]>", offset + 9);
      if (end < 0 || !stack.length) fail("xml-cdata");
      stack.at(-1).parts.push(source.slice(offset + 9, end)); offset = end + 3; continue;
    }
    if (source.startsWith("<?PAGE", offset)) {
      const page = /^<\?PAGE\s+NO="[1-9][0-9]{0,5}"\s*\?>/.exec(source.slice(offset));
      if (!page || !stack.length) fail("xml-seitenmarke");
      stack.at(-1).parts.push(" "); offset += page[0].length; continue;
    }
    if (source.startsWith("<!", offset) || source.startsWith("<?", offset)) fail("xml-deklaration");
    if (source[offset] !== "<") {
      const next = source.indexOf("<", offset), end = next < 0 ? source.length : next;
      const value = entities(source.slice(offset, end));
      if (stack.length) stack.at(-1).parts.push(value);
      else if (value.trim()) fail("xml-ausseninhalt");
      offset = end; continue;
    }
    let end = offset + 1, quote = "";
    for (; end < source.length; end++) {
      const c = source[end];
      if (quote) { if (c === quote) quote = ""; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (end === source.length || quote) fail("xml-tag");
    const raw = source.slice(offset + 1, end); offset = end + 1;
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim();
      if (!qname.test(name) || !stack.length || stack.at(-1).name !== name) fail("xml-schluss");
      stack.pop(); continue;
    }
    const selfClosing = raw.endsWith("/"), inner = selfClosing ? raw.slice(0, -1) : raw;
    const match = /^([^\s]+)([\s\S]*)$/.exec(inner);
    if (!match || !qname.test(match[1])) fail("xml-name");
    const attrs = new Map(), rest = match[2], expression = /\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("[^"<]*"|'[^'<]*')/gy;
    let at = 0;
    while (at < rest.length && rest.slice(at).trim()) {
      expression.lastIndex = at; const a = expression.exec(rest);
      if (!a || !qname.test(a[1]) || attrs.has(a[1])) fail("xml-attribut");
      attrs.set(a[1], entities(a[2].slice(1, -1))); at = expression.lastIndex;
    }
    const namespaces = Object.assign(Object.create(null), stack.at(-1)?.namespaces || {},
      { xml: "http://www.w3.org/XML/1998/namespace" });
    for (const [name, value] of attrs) {
      if (name === "xmlns") namespaces[""] = value;
      else if (name.startsWith("xmlns:")) {
        const prefix = name.slice(6);
        if (prefix === "xmlns" || prefix === "xml" && value !== namespaces.xml || !value) fail("xml-namespace");
        namespaces[prefix] = value;
      }
    }
    const resolve = (name, attribute) => {
      const [a, b] = name.split(":"), prefix = b ? a : "", local = b || a;
      const ns = prefix ? namespaces[prefix] : attribute ? "" : namespaces[""] || "";
      if (prefix && !ns) fail("xml-namespace");
      return { ns, local, key: expanded(ns, local) };
    };
    const resolved = resolve(match[1], false), attributes = new Map();
    for (const [name, value] of attrs) {
      if (name === "xmlns" || name.startsWith("xmlns:")) continue;
      const a = resolve(name, true);
      if (attributes.has(a.key)) fail("xml-attribut");
      attributes.set(a.key, value);
    }
    const node = { name: match[1], ...resolved, attributes, namespaces, children: [], parts: [] };
    if (++count > 12000 || stack.length >= 64) fail("xml-komplexitaet");
    if (stack.length) { stack.at(-1).children.push(node); stack.at(-1).parts.push(node); }
    else roots.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length || roots.length !== 1) fail("xml-unvollstaendig");
  return roots[0];
}
const attr = (node, name, ns = "") => node?.attributes.get(expanded(ns, name));
const children = (node, name, ns = "") => node?.children.filter(n => n.local === name && n.ns === ns) || [];
function one(node, name, ns = "") {
  const list = children(node, name, ns); if (list.length !== 1) fail("struktur-" + name.toLowerCase()); return list[0];
}
function content(node) { return node.parts.map(p => typeof p === "string" ? p : content(p)).join(""); }
function all(node) { return [node, ...node.children.flatMap(all)]; }
const scalar = (node, name) => norm(content(one(node, name)));

function parseManifestation(rdfString, cellar) {
  const manifestationUri = bound(cellar), root = xml(rdfString, 100 * 1024);
  if (root.ns !== RDF || root.local !== "RDF") fail("rdf-wurzel");
  const triples = new Map();
  for (const subject of root.children) {
    if (subject.ns !== RDF || subject.local !== "Description" || !attr(subject, "about", RDF)) fail("rdf-subjekt");
    const id = attr(subject, "about", RDF);
    if (!triples.has(id)) triples.set(id, new Map());
    for (const property of subject.children) {
      if (property.children.length) fail("rdf-einbettung");
      const value = attr(property, "resource", RDF) || norm(content(property));
      const map = triples.get(id); if (!map.has(property.key)) map.set(property.key, new Set());
      map.get(property.key).add(value);
    }
  }
  function value(subject, ns, property) {
    const found = triples.get(subject)?.get(expanded(ns, property));
    if (!found || found.size !== 1) fail("rdf-beziehung"); return [...found][0];
  }
  if (value(manifestationUri, CDM, "manifestation_type") !== "fmx4"
    || value(manifestationUri, CDM, "manifestation_manifests_expression") !== cellar.officialJournalUri + ".DEU") fail("rdf-manifestation");
  const matching = [...triples.keys()].filter(id => id.startsWith(cellar.workUri + ".")
    && triples.get(id)?.get(expanded(OWL, "sameAs"))?.has(manifestationUri));
  if (matching.length !== 1 || !/^\.[0-9]{4}\.[0-9]{2}$/.test(matching[0].slice(cellar.workUri.length))) fail("rdf-workbindung");
  const id = matching[0], item = value(id, CDM, "manifestation_has_item");
  if (item !== id + "/DOC_1" || value(item, CDM, "item_belongs_to_manifestation") !== id
    || value(item, CDM, "item_identifier") !== "DOC_1" || value(item, CMR, "manifestationMimeType") !== "application/zip") fail("rdf-item");
  const modifiedAt = timestamp(value(id, CMR, "lastModificationDate"));
  return { manifestationUri, itemUrl: "https:" + item.slice("http:".length), mime: "application/zip", modifiedAt };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0;
});
function crc32(buffer) { let c = 0xffffffff; for (const b of buffer) c = CRC_TABLE[(c ^ b) & 255] ^ c >>> 8; return (c ^ 0xffffffff) >>> 0; }
function utf8(buffer) { try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { fail("utf8"); } }
function unzip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > MAX_PACKAGE) fail("zip-groesse");
  const end = buffer.length - 22;
  if (buffer.readUInt32LE(end) !== 0x06054b50 || buffer.readUInt16LE(end + 20)
    || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) fail("zip-verzeichnis");
  const count = buffer.readUInt16LE(end + 10), size = buffer.readUInt32LE(end + 12), start = buffer.readUInt32LE(end + 16);
  if (!count || count > 5 || count !== buffer.readUInt16LE(end + 8) || start + size !== end) fail("zip-verzeichnis");
  const records = [], names = new Set(); let cursor = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) fail("zip-verzeichnis");
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10), crc = buffer.readUInt32LE(cursor + 16);
    const compressed = buffer.readUInt32LE(cursor + 20), bytes = buffer.readUInt32LE(cursor + 24);
    const length = buffer.readUInt16LE(cursor + 28), extra = buffer.readUInt16LE(cursor + 30), comment = buffer.readUInt16LE(cursor + 32);
    const disk = buffer.readUInt16LE(cursor + 34), external = buffer.readUInt32LE(cursor + 38), offset = buffer.readUInt32LE(cursor + 42);
    if (flags & ~0x808 || ![0, 8].includes(method) || extra || comment || disk || !bytes || bytes > MAX_XML
      || compressed > MAX_PACKAGE || length > 120 || cursor + 46 + length > end
      || external & 0x10 || ![0, 0x8000].includes((external >>> 16) & 0xf000)) fail("zip-eintrag");
    const name = utf8(buffer.subarray(cursor + 46, cursor + 46 + length));
    if (!/^[A-Za-z0-9_.-]{1,110}\.xml$/.test(name) || name.includes("..") || names.has(name.toLowerCase())) fail("zip-dateiname");
    names.add(name.toLowerCase()); total += bytes; if (total > MAX_XML) fail("zip-entpackgroesse");
    records.push({ name, flags, method, crc, compressed, bytes, offset }); cursor += 46 + length;
  }
  if (cursor !== end) fail("zip-verzeichnis");
  cursor = 0; const files = [];
  for (const r of records.sort((a, b) => a.offset - b.offset)) {
    const at = r.offset;
    if (at !== cursor || at + 30 > start || buffer.readUInt32LE(at) !== 0x04034b50
      || buffer.readUInt16LE(at + 6) !== r.flags || buffer.readUInt16LE(at + 8) !== r.method) fail("zip-lokalheader");
    const length = buffer.readUInt16LE(at + 26), extra = buffer.readUInt16LE(at + 28), dataStart = at + 30 + length + extra;
    if (extra || length !== Buffer.byteLength(r.name) || dataStart + r.compressed > start
      || utf8(buffer.subarray(at + 30, at + 30 + length)) !== r.name) fail("zip-lokalheader");
    const expected = r.flags & 8 ? [0, 0, 0] : [r.crc, r.compressed, r.bytes];
    if (expected.some((n, i) => buffer.readUInt32LE(at + 14 + 4 * i) !== n)) fail("zip-lokalheader");
    const data = buffer.subarray(dataStart, dataStart + r.compressed); let plain;
    try {
      if (r.method === 8) {
        const result = zlib.inflateRawSync(data, { maxOutputLength: r.bytes, info: true });
        if (result.engine.bytesWritten !== data.length) fail("zip-kompressionsrest"); plain = result.buffer;
      } else plain = data;
    } catch { fail("zip-kompression"); }
    if (plain.length !== r.bytes || crc32(plain) !== r.crc) fail("zip-crc");
    cursor = dataStart + r.compressed;
    if (r.flags & 8) {
      if (cursor + 16 > start || buffer.readUInt32LE(cursor) !== 0x08074b50
        || [r.crc, r.compressed, r.bytes].some((n, i) => buffer.readUInt32LE(cursor + 4 + 4 * i) !== n)) fail("zip-deskriptor");
      cursor += 16;
    }
    files.push({ name: r.name, bytes: plain, root: xml(utf8(plain)) });
  }
  if (cursor !== start) fail("zip-rest"); return files;
}

function render(node, quotes = []) {
  if (node.local === "QUOT.START" || node.local === "QUOT.END") {
    const opening = node.local === "QUOT.START", code = attr(node, "CODE");
    if (code !== (opening ? "201E" : "201C") || node.children.length || content(node).trim()) fail("auszug-zitat");
    if (opening) quotes.push({ id: attr(node, "ID"), end: attr(node, "REF.END") });
    else {
      const pair = quotes.pop();
      if (!pair || !pair.id || !pair.end || pair.id !== attr(node, "REF.START") || pair.end !== attr(node, "ID")) fail("auszug-zitat");
    }
    return String.fromCodePoint(parseInt(code, 16));
  }
  const allowed = new Set(["ALINEA", "P", "QUOT.S", "DATE", "HT", "REF.DOC", "REF.DOC.OJ", "LINK"]);
  if (!allowed.has(node.local)) fail("auszug-struktur");
  if (node.local === "HT" && !["ITALIC", "BOLD"].includes(attr(node, "TYPE"))) fail("auszug-format");
  return node.parts.map(p => typeof p === "string" ? p : render(p, quotes) + (p.local === "P" ? " " : "")).join("");
}
function titleText(node) {
  return norm(node.parts.map(p => typeof p === "string" ? p : titleText(p) + (p.local === "P" ? " " : "")).join(""));
}
function extractPackage(buffer, { title, cellar, manifestationUri, itemUrl, modifiedAt } = {}) {
  const itemPrefix = cellar?.workUri?.replace(/^http:/, "https:");
  if (manifestationUri !== bound(cellar) || typeof itemUrl !== "string"
    || !itemUrl.startsWith(itemPrefix + ".")
    || !/^\.[0-9]{4}\.[0-9]{2}\/DOC_1$/.test(itemUrl.slice(itemPrefix.length))) fail("paket-bindung");
  if (modifiedAt !== timestamp(modifiedAt)) fail("manifestationsstand");
  const files = unzip(buffer), roots = files.map(f => f.root), nodes = roots.flatMap(all);
  if (nodes.some(n => n.ns || /(?:ANNEX|IMAGE|FIGURE|GRAPHIC|COPYRIGHT|LICEN[CS]E|RIGHTS)/i.test(n.local))) fail("paket-umfang-rechte");
  if (/(?:©|\bcopyright\b|urheberrechtshinweis|all\s+rights\s+reserved|alle\s+rechte\s+vorbehalten|creative\s+commons|\blicen[cs]e\b|\blizenzbedingungen\b|Drittrechte|(?:Nutzung|Reproduktion|Weiterverwendung).{0,80}(?:untersagt|Genehmigung))/iu.test(roots.map(content).join(" "))) fail("paket-sonderrechte");
  const get = name => { const found = files.filter(f => f.root.local === name); if (found.length !== 1) fail("paket-dokumente"); return found[0]; };
  const act = get("ACT"), doc = get("DOC"), toc = get("PUBLICATION");
  if (files.length !== 3) fail("paket-dokumente");
  const bib = one(act.root, "BIB.INSTANCE"), document = one(bib, "DOCUMENT.REF"), publication = one(doc.root, "PUBLICATION.REF");
  const oj = one(one(toc.root, "OJ"), "BIB.OJ"), fmx = one(one(doc.root, "FMX"), "DOC.MAIN.PUB");
  const match = /\/L_([0-9]{4})([0-9]{5})$/.exec(cellar.officialJournalUri), number = String(Number(match[2]));
  function checkNumber(node) {
    const no = one(node, "NO.DOC");
    if (scalar(no, "YEAR") !== match[1] || scalar(no, "NO.CURRENT") !== number || scalar(no, "COM") !== "EU") fail("original-nummer");
  }
  for (const node of [bib, document, one(doc.root, "BIB.DOC"), publication, oj]) checkNumber(node);
  for (const node of [document, publication, oj]) {
    if (scalar(node, "COLL") !== "L" || scalar(node, "LG.OJ") !== "DE") fail("original-sprache-serie");
  }
  if (scalar(bib, "LG.DOC") !== "DE" || scalar(fmx, "LG.DOC") !== "DE"
    || scalar(one(doc.root, "BIB.DOC"), "AUTHOR") !== "COM") fail("original-urheber-sprache");
  for (const node of [publication, oj]) {
    const date = one(node, "DATE"), iso = cellar.publicationDate.replaceAll("-", "");
    if (attr(date, "ISO") !== iso || norm(content(date)) !== iso) fail("original-publikation");
  }
  if (attr(document, "FILE") !== doc.name || attr(publication, "FILE") !== toc.name) fail("original-dateibindung");
  const prefix = cellar.officialJournalUri.split("/").at(-1) + "DE.";
  if (files.some(f => !f.name.startsWith(prefix))) fail("original-dateibindung");
  const values = { DEC: ["D", "dec"], DEC_IMPL: ["D", "dec_impl"], DEC_DEL: ["D", "dec_del"],
    REG: ["R", "reg"], REG_IMPL: ["R", "reg_impl"], REG_DEL: ["R", "reg_del"],
    DIR: ["L", "dir"], DIR_IMPL: ["L", "dir_impl"], DIR_DEL: ["L", "dir_del"] };
  const legal = values[scalar(fmx, "LEGAL.VALUE")], celex = /^3([0-9]{4})([RDL])([0-9]{4})$/.exec(cellar.celex);
  const eli = attr(one(one(doc.root, "BIB.DOC"), "NO.ELI"), "ID");
  if (!legal || !celex || legal[0] !== celex[2]
    || eli !== `http://data.europa.eu/eli/${legal[1]}/${celex[1]}/${Number(celex[3])}/oj`) fail("original-aktidentitaet");
  const withoutEwr = value => norm(value).replace(/\s*\(Text von Bedeutung für den EWR\)$/u, "");
  if (typeof title !== "string" || !title.trim() || title.length > 4000
    || withoutEwr(titleText(one(act.root, "TITLE"))) !== withoutEwr(title)) fail("original-titel");
  const enacting = one(act.root, "ENACTING.TERMS"), articles = children(enacting, "ARTICLE");
  if (enacting.children.some(n => n.local !== "ARTICLE") || enacting.parts.some(p => typeof p === "string" && p.trim())) fail("auszug-struktur");
  if (!articles.length) fail("auszug-artikel");
  if (articles[0].children.some(n => !["TI.ART", "STI.ART", "ALINEA"].includes(n.local))
    || articles[0].parts.some(p => typeof p === "string" && p.trim())) fail("auszug-struktur");
  const paragraphs = children(articles[0], "ALINEA"); if (!paragraphs.length) fail("auszug-absatz");
  const quotes = [], text = norm(render(paragraphs[0], quotes));
  if (quotes.length || text.length < 60 || text.length > 400 || /[<>]|\.{2,}|…/u.test(text)
    || !/[.!?][“”»"']?$/u.test(text)) fail("auszug-unvollstaendig");
  return { text, proof: { manifestationUri, itemUrl, packageSha256: sha(buffer), xmlSha256: sha(act.bytes),
    publicationDate: cellar.publicationDate, manifestModifiedAt: modifiedAt,
    author: "Europäische Kommission", language: "de", position: POSITION, excerptHash: sha(text) } };
}

module.exports = { parseManifestation, extractPackage };
