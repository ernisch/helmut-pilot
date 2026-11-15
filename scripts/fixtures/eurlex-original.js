"use strict";
const zlib = require("node:zlib"), crypto = require("node:crypto");
const source = require("./parlamentsdaten-20261106/cellar-oj-l-metadaten.json").results.bindings[0];
const title = source.title.value;
const cellar = { workUri: source.work.value, officialJournalUri: source.ojIdentity.value,
  celex: source.celex.value, publicationDate: source.published.value };
const manifestationUri = cellar.officialJournalUri + ".DEU.fmx4";
const itemId = cellar.workUri + ".0004.02/DOC_1", itemUrl = itemId.replace(/^http:/, "https:");
const modifiedAt = "2026-11-13T02:32:06.372Z";
const options = { title, cellar, manifestationUri, itemUrl, modifiedAt };
const excerpt = "In Artikel 2 des Durchführungsbeschlusses (EU) 2026/1971 wird folgender zweiter Absatz angefügt: „Anhang I Nummer 1 gilt ab dem 4. März 2028.“";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const xmlEscape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const no = '<NO.DOC FORMAT="YN" TYPE="OJ"><COM>EU</COM><YEAR>2026</YEAR><NO.CURRENT>2505</NO.CURRENT></NO.DOC>';
const paragraph = '<ALINEA><P>In Artikel 2 des Durchführungsbeschlusses (EU) 2026/1971 wird folgender zweiter Absatz angefügt:</P><QUOT.S LEVEL="1"><P><QUOT.START CODE="201E" ID="QS1" REF.END="QE1"/>Anhang I Nummer 1 gilt ab dem <DATE ISO="20280304">4. März 2028</DATE>.<QUOT.END CODE="201C" ID="QE1" REF.START="QS1"/></P></QUOT.S></ALINEA>';
// Minimale synthetische Strukturfragmente mit dem einen echten142-Zeichen-
// Originalabsatz. Keine vollstaendigen fremden Originaldateien im Repository.
function fragments() {
  const stem = "L_202602505DE";
  const act = `<ACT><BIB.INSTANCE><DOCUMENT.REF FILE="${stem}.doc.fmx.xml"><COLL>L</COLL>${no}<LG.OJ>DE</LG.OJ></DOCUMENT.REF><LG.DOC>DE</LG.DOC>${no}</BIB.INSTANCE><TITLE><TI><P>${xmlEscape(title)}</P><P>(Text von Bedeutung für den EWR)</P></TI></TITLE><ENACTING.TERMS><ARTICLE><TI.ART>Artikel 1</TI.ART>${paragraph}</ARTICLE></ENACTING.TERMS></ACT>`;
  const doc = `<DOC><BIB.DOC>${no}<AUTHOR>COM</AUTHOR><NO.ELI ID="http://data.europa.eu/eli/dec_impl/2026/2505/oj"/></BIB.DOC><PUBLICATION.REF FILE="${stem}.toc.fmx.xml"><COLL>L</COLL>${no}<DATE ISO="20261113">20261113</DATE><LG.OJ>DE</LG.OJ></PUBLICATION.REF><FMX><DOC.MAIN.PUB><LG.DOC>DE</LG.DOC><LEGAL.VALUE>DEC_IMPL</LEGAL.VALUE><DATE ISO="20261112">20261112</DATE></DOC.MAIN.PUB></FMX></DOC>`;
  const toc = `<PUBLICATION><OJ><BIB.OJ><COLL>L</COLL>${no}<DATE ISO="20261113">20261113</DATE><LG.OJ>DE</LG.OJ></BIB.OJ></OJ></PUBLICATION>`;
  return [{ name: stem + ".000101.fmx.xml", text: act }, { name: stem + ".doc.fmx.xml", text: doc }, { name: stem + ".toc.fmx.xml", text: toc }];
}
function rdf() {
  return `<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:c="http://publications.europa.eu/ontology/cdm#" xmlns:m="http://publications.europa.eu/ontology/cdm/cmr#" xmlns:o="http://www.w3.org/2002/07/owl#">
  <r:Description r:about="${manifestationUri}"><c:manifestation_type>fmx4</c:manifestation_type><c:manifestation_manifests_expression r:resource="${cellar.officialJournalUri}.DEU"/></r:Description>
  <r:Description r:about="${cellar.workUri}.0004.02"><o:sameAs r:resource="${manifestationUri}"/><c:manifestation_has_item r:resource="${itemId}"/><m:lastModificationDate>2026-11-13T03:32:06.372+01:00</m:lastModificationDate></r:Description>
  <r:Description r:about="${itemId}"><c:item_identifier>DOC_1</c:item_identifier><c:item_belongs_to_manifestation r:resource="${cellar.workUri}.0004.02"/><m:manifestationMimeType>application/zip</m:manifestationMimeType></r:Description></r:RDF>`;
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const b of buffer) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc & 1 ? crc >>> 1 ^ 0xedb88320 : crc >>> 1; }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(files = fragments(), { descriptor = true, method = 8 } = {}) {
  const locals = [], central = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), original = Buffer.from(file.text), data = method === 8 ? zlib.deflateRawSync(original) : original;
    const flags = 0x800 | (descriptor ? 8 : 0), crc = crc32(original);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50); l.writeUInt16LE(20, 4); l.writeUInt16LE(flags, 6); l.writeUInt16LE(method, 8);
    if (!descriptor) { l.writeUInt32LE(crc, 14); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(original.length, 22); }
    l.writeUInt16LE(name.length, 26);
    const dd = Buffer.alloc(descriptor ? 16 : 0);
    if (descriptor) { dd.writeUInt32LE(0x08074b50); dd.writeUInt32LE(crc, 4); dd.writeUInt32LE(data.length, 8); dd.writeUInt32LE(original.length, 12); }
    locals.push(l, name, data, dd);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(original.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name); offset += l.length + name.length + data.length + dd.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, directory, end]);
}
module.exports = { source, title, cellar, manifestationUri, itemUrl, modifiedAt, options, excerpt, sha, xmlEscape, no, paragraph, fragments, rdf, crc32, zip };
