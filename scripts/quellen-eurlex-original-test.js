"use strict";
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const O = require("../lib/helmut/quellen-eurlex-original");
const source = require("./fixtures/parlamentsdaten-20261106/cellar-oj-l-metadaten.json").results.bindings[0];
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
const extract = (files, opts = options) => O.extractPackage(zip(files), opts);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }

(async () => {
  await test("Amtliche Namespace-, Werk-, DEU-, FMX4- und ZIP-Relation liefert einzig gebundenes HTTPS-Item", () => {
    assert.deepEqual(O.parseManifestation(rdf(), cellar), { manifestationUri, itemUrl, mime: "application/zip", modifiedAt });
    assert.deepEqual(O.parseManifestation(rdf().replaceAll('xmlns:c=', 'xmlns:cdm=').replaceAll('<c:', '<cdm:').replaceAll('</c:', '</cdm:'), cellar), { manifestationUri, itemUrl, mime: "application/zip", modifiedAt });
  });
  await test("Fremde RDF-Namensraeume, Sprachen, Items und mehrdeutige Relationen bleiben gesperrt", () => {
    for (const x of [rdf().replace('xmlns:c="http://publications.europa.eu/ontology/cdm#"', 'xmlns:c="https://example.org"'),
      rdf().replace('manifestation_manifests_expression r:resource="' + cellar.officialJournalUri + '.DEU', 'manifestation_manifests_expression r:resource="' + cellar.officialJournalUri + '.ENG'),
      rdf().replaceAll('/DOC_1', '/DOC_2'), rdf().replace('application/zip', 'text/html'),
      rdf().replace('<c:manifestation_type>fmx4</c:manifestation_type>', '<c:manifestation_type>fmx4</c:manifestation_type><c:manifestation_type>pdf</c:manifestation_type>'),
      rdf().replaceAll('.0004.02', '.0004.03').replace('.0004.03/DOC_1', '.0004.02/DOC_1')])
      assert.throws(() => O.parseManifestation(x, cellar), /eurlex-original/);
  });
  await test("Ganzes erstes operatives Originalalinea und geschlossener Beleg statt isolierter Datumsbehauptung", () => {
    const input = zip(), result = O.extractPackage(input, options), actual = Buffer.from(fragments()[0].text);
    assert.equal(result.text, excerpt); assert.equal(result.text.length, 142);
    assert.deepEqual(result.proof, { manifestationUri, itemUrl, packageSha256: sha(input), xmlSha256: sha(actual),
      publicationDate: "2026-11-13", author: "Europäische Kommission", language: "de",
      manifestModifiedAt: modifiedAt,
      position: "ACT/ENACTING.TERMS/ARTICLE[1]/ALINEA[1]", excerptHash: sha(excerpt) });
    assert(!Object.hasOwn(result, "html")); assert(!Object.hasOwn(result.proof, "effectiveDate"));
    assert.equal(O.extractPackage(zip(fragments(), { descriptor: false }), options).text, excerpt);
    assert.equal(O.extractPackage(zip(fragments(), { descriptor: false, method: 0 }), options).text, excerpt);
    const page = fragments(); page[0].text = page[0].text.replace('</ENACTING.TERMS>', '<?PAGE NO="2"?></ENACTING.TERMS>');
    assert.equal(extract(page).text, excerpt);
  });
  await test("Andere Originalidentitaet oder entbundener Transportpfad sind kein Auszug", () => {
    for (const opts of [{ ...options, manifestationUri: manifestationUri.replace('DEU', 'ENG') },
      { ...options, itemUrl: itemUrl.replace('https:', 'http:') }, { ...options, itemUrl: itemUrl + '?x=1' },
      { ...options, itemUrl: itemUrl.replace('/DOC_1', '/DOC_2') },
      { ...options, cellar: { ...cellar, workUri: cellar.workUri.replace('da8055db', 'aaaaaaaa') } }])
      assert.throws(() => O.extractPackage(zip(), opts), /eurlex-original/);
    for (const stamp of [undefined, '2026-02-30T12:00:00Z', '2026-11-13', '2026-11-13T03:32:06.372+01:00'])
      assert.throws(() => extract(undefined, { ...options, modifiedAt: stamp }), /manifestationsstand/);
    assert.throws(() => O.parseManifestation(rdf().replace('<m:lastModificationDate>2026-11-13T03:32:06.372+01:00</m:lastModificationDate>', ''), cellar), /rdf-beziehung/);
  });
  await test("CRC, Data Descriptor, abgeschnittenes Paket und defektes Zentralverzeichnis brechen ab", () => {
    for (const mutate of [b => { b[b.readUInt32LE(b.length - 6) + 16] ^= 1; },
      b => { b[30 + Buffer.byteLength(fragments()[0].name) + 10] ^= 1; },
      b => { b.writeUInt32LE(0, b.length - 22); }, b => { b.writeUInt32LE(1, b.readUInt32LE(b.length - 6) + 42); }]) {
      const b = zip(); mutate(b); assert.throws(() => O.extractPackage(b, options), /eurlex-original/);
    }
    assert.throws(() => O.extractPackage(zip().subarray(0, -1), options), /eurlex-original/);
  });
  await test("Groessen, ZIP-Bomben, Verschluesselung und Sondermethoden werden vor Verwertung begrenzt", () => {
    assert.throws(() => O.extractPackage(Buffer.alloc(256 * 1024 + 1), options), /zip-groesse/);
    for (const mutate of [b => { b.writeUInt16LE(0x809, b.readUInt32LE(b.length - 6) + 8); },
      b => { b.writeUInt16LE(99, b.readUInt32LE(b.length - 6) + 10); },
      b => { b.writeUInt32LE(512 * 1024 + 1, b.readUInt32LE(b.length - 6) + 24); },
      b => { b.writeUInt32LE(1, b.readUInt32LE(b.length - 6) + 24); }]) {
      const b = zip(); mutate(b); assert.throws(() => O.extractPackage(b, options), /eurlex-original/);
    }
    const many = [...fragments(), ...fragments().map(f => ({ ...f, name: 'x' + f.name }))];
    assert.throws(() => O.extractPackage(zip(many), options), /zip-verzeichnis/);
  });
  await test("ZipSlip, doppelte Namen, fremde Dateien und zusaetzliche Dokumente bleiben ausgeschlossen", () => {
    for (const name of ['../a.xml', 'a/b.xml', 'a\\b.xml', 'x.html', 'x.zip']) {
      const files = fragments(); files[0].name = name; assert.throws(() => extract(files), /zip-dateiname/);
    }
    const duplicate = fragments(); duplicate[1].name = duplicate[0].name; assert.throws(() => extract(duplicate), /zip-dateiname/);
    const extra = [...fragments(), { name: 'extra.xml', text: '<EXTRA/>' }]; assert.throws(() => extract(extra), /paket-dokumente/);
  });
  await test("DTD, Entities, fremde XML-Struktur und Namespace-Spoofing werden nie aufgeloest", () => {
    for (const change of [x => '<!DOCTYPE ACT SYSTEM "https://example.org/a.dtd">' + x,
      x => '<!DOCTYPE ACT [<!ENTITY x "Text">]>' + x,
      x => x.replace('<ACT>', '<ACT><?xml-stylesheet href="https://example.org/a.xsl"?>'),
      x => x.replace('<ACT>', '<ACT xmlns="https://example.org">'), x => x.replace('</ACT>', '</DOC>'),
      x => x.replace('Artikel 1', '&fremd;'), x => x.replace('<TITLE>', '<TITLE a="1" a="2">')]) {
      const files = fragments(); files[0].text = change(files[0].text); assert.throws(() => extract(files), /eurlex-original/);
    }
    assert.throws(() => O.parseManifestation('<!DOCTYPE RDF SYSTEM "https://example.org">' + rdf(), cellar), /xml-deklaration/);
  });
  await test("Amtliches Publikationsdatum bleibt vom Beschluss-/Normdatum getrennt", () => {
    assert.equal(extract().proof.publicationDate, '2026-11-13');
    for (const index of [1, 2]) {
      const files = fragments(); files[index].text = files[index].text.replaceAll('20261113', '20261112');
      assert.throws(() => extract(files), /original-publikation/);
    }
    for (const index of [0, 1, 2]) {
      const files = fragments(); files[index].text = files[index].text.replaceAll('<NO.CURRENT>2505', '<NO.CURRENT>2506');
      assert.throws(() => extract(files), /original-nummer/);
    }
  });
  await test("COM, DE, ELI und zusammengehoerende Originaldateien muessen nachgewiesen sein", () => {
    for (const [index, from, to] of [[1, '<AUTHOR>COM', '<AUTHOR>Fremde'], [0, '<LG.DOC>DE', '<LG.DOC>EN'],
      [1, 'eli/dec_impl/2026/2505/oj', 'eli/dec_impl/2026/2506/oj'], [0, '.doc.fmx.xml', '.fremd.fmx.xml'],
      [1, '.toc.fmx.xml', '.fremd.fmx.xml'], [1, '<LEGAL.VALUE>DEC_IMPL', '<LEGAL.VALUE>NOTICE']]) {
      const files = fragments(); files[index].text = files[index].text.replace(from, to); assert.throws(() => extract(files), /eurlex-original/);
    }
  });
  await test("Titel stimmt vollstaendig: Whitespace/EWR-Vermerk erlaubt, Prefix oder anderer Titel gesperrt", () => {
    assert.equal(extract(undefined, { ...options, title: ' ' + title.replaceAll(' ', '\n ') + ' ' }).text, excerpt);
    assert.equal(extract(undefined, { ...options, title: title + ' (Text von Bedeutung für den EWR)' }).text, excerpt);
    for (const t of [title.slice(0, 300), title + ' anderer Hinweis', 'Anderer Titel'])
      assert.throws(() => extract(undefined, { ...options, title: t }), /original-titel/);
  });
  await test("Keine Bilder, Anhaenge oder auffaelligen Sonderrechte im freigegebenen kleinen Original", () => {
    for (const addon of ['<ANNEX><P>Inhalt</P></ANNEX>', '<IMAGE SRC="bild.jpg"/>', '<COPYRIGHT>EU</COPYRIGHT>',
      '<P>All rights reserved.</P>', '<P>Creative Commons Lizenzbedingungen</P>']) {
      const files = fragments(); files[0].text = files[0].text.replace('</ACT>', addon + '</ACT>');
      assert.throws(() => extract(files), /paket-umfang-rechte|paket-sonderrechte/);
    }
  });
  await test("Immer der ganze erste Absatz: keine Erfindung, spaetere Ersatzsaetze oder fehlende Zitatgrenzen", () => {
    for (const replacement of ['<ALINEA><P>Dieser erste Absatz ist unvollständig:</P></ALINEA>' + paragraph,
      paragraph.replace('CODE="201C"', 'CODE="201D"'), paragraph.replace('REF.START="QS1"', 'REF.START="Andere"'),
      paragraph.replace('2028</DATE>.', '2028</DATE>'), paragraph.replace('angefügt:', 'angefügt:...'),
      paragraph.replace('</ALINEA>', '<NOTE>Zusätzliche Bedingung</NOTE></ALINEA>'),
      '<ALINEA><P>' + 'Ungekürzter Originaltext '.repeat(30) + '.</P></ALINEA>']) {
      const files = fragments(); files[0].text = files[0].text.replace(paragraph, replacement);
      assert.throws(() => extract(files), /auszug/);
    }
  });
  console.log(`\n${passed}/${passed} Original-Pruefgruppen bestanden; kein Netz, keine DB, kein Modell.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
