"use strict";
// Deklarierte Synthetik. Echte Parser/Prompt-/Hash-/Lage-/Briefingfunktionen,
// aber KEIN Modell, HTTP, Speicherwrite oder behauptetes menschliches Fachurteil.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Q = require("../lib/helmut/quellen-auszug");
const A = require("../lib/helmut/artikelkontext");
const G = require("../lib/helmut/artikelkontext-gewinnung");
const D = require("../lib/helmut/dedup");
const U = require("../lib/helmut/understanding");
const L = require("../lib/helmut/quellen-lektuerebeleg");
const Lage = require("../lib/helmut/lage-quellenbeleg");
const Briefing = require("../lib/helmut/briefing-aussagenbindung");
const C = require("../lib/helmut/briefingContract");
const O = require("../lib/helmut/briefing-orientierung");
const now = new Date("2026-11-09T05:15:33Z");
const profile = { id: "test-mandat", parliamentType: "Bundestag", focusTopics: ["Pflege"] };
const aussage = "Bei der ersten Beratung der Pflegereform wurden Schwachstellen eingeräumt und Nachbesserungen für die weitere parlamentarische Beratung angekündigt.";
const filler = "Der historische Anhang beschreibt unterschiedliche organisatorische Einzelheiten des Verbandes und erläutert seine allgemeinen Arbeitsabläufe. ";
const hash = L.hash;
function fixture(last = aussage) {
  const doc = D.toRawDocumentRow({ title: "Bundesregierung kündigt Nachbesserungen zur Pflegereform an", url: "https://www.dgb.de/test/pflegereform",
    sourceName: "DGB", publishedAt: "2026-11-06T03:57:13Z", linkType: "direct", summary: "" });
  const body = filler.repeat(180) + last;
  const ld = { "@type": "NewsArticle", headline: doc.title, url: doc.url, datePublished: doc.published_at, articleBody: body };
  const html = `<html><head><meta property="og:title" content="${doc.title}"><link rel="canonical" href="${doc.url}"><script type="application/ld+json">${JSON.stringify(ld)}</script></head>`
    + `<body><article><h1>${doc.title}</h1><p>${body}</p></article></body></html>`;
  const result = G.gewinneArtikeltext(doc, { body: html, finalUrl: doc.url, gelesenAm: "2026-11-08T08:00:00Z" }, { abschnittsweise: true });
  assert.equal(result.ok, true, result.reason);
  const beleg = A.pruefeArtikelkontext([doc], result.beleg);
  assert.equal(beleg.gewinnung.verfahren, "artikelabschnitte-v4"); assert.ok(beleg.text.length > 16000);
  return { doc, beleg, projected: { ...doc, summary: beleg.text, artikelkontext: { beleg, auszugVorher: doc.summary } } };
}
function koMitQuittung(f, letzte = (f.beleg?.gewinnung.abschnitte || require("../lib/helmut/artikel-abschnitte").segmentiere(f.doc.summary)).count - 1) {
  const ko = { id: "ko-test", vorgang_id: "vg-test", ko_version: 1, source_document_count: 1,
    understanding_status: "complete", status: "neu", headline: "Pflegereform: Nachbesserungen angekündigt",
    was_ist_passiert: aussage, created_at: "2026-11-06T06:00:00Z", updated_at: "2026-11-08T06:00:00Z" };
  const gelesen = [];
  let receipt;
  for (let index = 0; index <= letzte; index++) {
    const prompt = U.buildUnderstandingPrompt({ documents: [f.doc], quellenAbschnitte: { [f.doc.id]: index } },
      { artikelkontextVersuch: f.beleg });
    const quelle = JSON.parse(prompt.split("\n").find(l => l.startsWith('{"quelle_id":')));
    receipt = L.quellenLektuereBeleg(quelle);
    gelesen.push(receipt.textstandHash);
  }
  const b = { version: 2, vorgangId: ko.vorgang_id, koVersion: ko.ko_version,
    quellen: [{ ...receipt, geleseneAbschnitte: gelesen }] };
  b.belegHash = hash([b.version, b.vorgangId, b.koVersion, b.quellen]);
  ko.classification_confidence = { helmut_quellen_lektuere: b };
  return ko;
}
function neuBinden(ko) { const b = ko.classification_confidence.helmut_quellen_lektuere;
  b.belegHash = hash([b.version, b.vorgangId, b.koVersion, b.quellen]); return ko; }
const f = fixture(), ko = koMitQuittung(f), docs = { [ko.vorgang_id]: [f.projected] };
let pass = 0;
function test(name, fn) { fn(); pass++; console.log("PASS " + name); }

test("Endabschnitt erreicht Lage exakt gebunden und innerhalb16000", () => {
  const out = Lage.baueEingabe([ko], docs, now);
  assert.equal(out.length, 1); const q = out[0].quellenbelege[0];
  assert.ok(q.auszug.includes(aussage)); assert.equal(q.artikelkontext.abschnitt.index, f.beleg.gewinnung.abschnitte.count - 1);
  assert.equal(q.artikelkontext.abschnitt.textHash, crypto.createHash("sha256").update(q.auszug).digest("hex"));
  assert.ok(JSON.stringify(out).length <= Lage.MAX_EINGABE_ZEICHEN);
  assert.equal(require("../lib/helmut/lage-textqualitaet").sachdetailsGebunden([
    { text: aussage, quellen_ids: [q.quelle_id], vorgang_ids: [ko.vorgang_id] }
  ], out, now), true);
});
test("Derselbe Endabschnitt erreicht den Briefing-Aussagenvertrag", () => {
  const q = Briefing.quellenVertrag(docs, [ko])[0];
  assert.ok(q.auszug.includes(aussage)); assert.equal(q.auszug, Lage.baueEingabe([ko], docs, now)[0].quellenbelege[0].auszug);
  assert.ok(q.auszug.length <= 8000); assert.ok(!q.auszug.includes(f.beleg.text));
});
test("PR1117 erzeugt aus spätem belegtem Satz weiterhin ehrlichen Prüfauftrag", () => {
  const dec = { knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id, decision: "Ignorieren", score: 10, matched_features: [] };
  const state = C.buildCurrentHelmutState({ profile, decisions: [dec], kosById: { [ko.id]: ko }, sourcesByVorgang: docs, now });
  assert.equal(state.primaryVorgangId, ko.vorgang_id); assert.equal(state.qualityStatus, "partial");
  assert.equal(state.tagesAnlass.beleg.text, aussage);
});
test("Nicht gelesener Endabschnitt darf weder Lage noch Briefing freischalten", () => {
  const partial = koMitQuittung(f, 0);
  assert.equal(Q.waehleGelesenenArtikelabschnitt(f.projected, partial), null);
  assert.deepEqual(Lage.baueEingabe([partial], docs, now), []);
  assert.deepEqual(Briefing.quellenVertrag(docs, [partial]), []);
  assert.equal(O.belege(partial, [f.projected], now, profile), null);
});
test("Quittung ohne geladenen Originaltext ist kein Quellenbeleg", () => {
  const missing = { ...f.projected, summary: null };
  assert.throws(() => Q.geleseneArtikelabschnitte(missing, ko), /leseprojektion-abweichend/);
});
test("Andere Quelle, Version, Abschnitt oder Lektürehash bleibt gesperrt", () => {
  for (const mutate of [x => { x.quellenHash = "a".repeat(64); }, x => { x.textstandHash = "b".repeat(64); },
    x => { x.abschnitt.bundleHash = "c".repeat(64); }, x => { x.geleseneAbschnitte[0] = "d".repeat(64); }]) {
    const changed = structuredClone(ko); mutate(changed.classification_confidence.helmut_quellen_lektuere.quellen[0]); neuBinden(changed);
    assert.deepEqual(Q.geleseneArtikelabschnitte(f.projected, changed), []);
  }
  assert.throws(() => Q.geleseneArtikelabschnitte(f.projected, { ...ko, ko_version: 2 }), /lektuer.*ungueltig/);
  assert.deepEqual(Q.geleseneArtikelabschnitte(f.projected, { ...ko, classification_confidence: {} }), []);
});
test("Geladener widersprechender Schluss lässt angekündigten Schritt nicht fortleben", () => {
  const gegen = fixture(aussage + " Die angekündigten Nachbesserungen wurden zurückgezogen.");
  const widerspruchKo = koMitQuittung(gegen);
  assert.equal(O.belege(widerspruchKo, [gegen.projected], now, profile), null);
  assert.ok(Lage.baueEingabe([widerspruchKo], { [ko.vorgang_id]: [gegen.projected] }, now)[0].quellenbelege[0]
    .auszug.includes("zurückgezogen"));
});
test("Manipulierter oder veralteter Originalstand wird nicht durch Lektürequittung geheilt", () => {
  const changed = structuredClone(f.projected); changed.artikelkontext.beleg.gewinnung.abschnitte.abschnitte.at(-1).text += " Fremdtext.";
  assert.throws(() => Q.geleseneArtikelabschnitte(changed, ko), /abschnitt/);
  const anders = fixture(aussage + " Ergänzender neuer Satz.");
  assert.deepEqual(Q.geleseneArtikelabschnitte(anders.projected, ko), []);
});
test("Ungekappter RSS-Endabschnitt bleibt ohne erfundene HTML-Herkunft gebunden", () => {
  const doc = { ...f.doc, summary: filler.repeat(180) + aussage };
  const rss = { doc, projected: doc }, k = koMitQuittung(rss);
  const sources = { [k.vorgang_id]: [doc] };
  const q = Lage.baueEingabe([k], sources, now)[0].quellenbelege[0];
  assert.ok(q.auszug.includes(aussage)); assert.equal(q.artikelkontext, undefined);
  assert.ok(q.quellenabschnitt.index > 0);
  assert.equal(Briefing.quellenVertrag(sources, [k])[0].auszug, q.auszug);
  assert.equal(O.belege(k, [doc], now, profile).beleg.text, aussage);
  assert.deepEqual(Q.geleseneArtikelabschnitte({ ...doc, summary: doc.summary + " Fremder neuer Stand." }, k), []);
  assert.equal(O.belege(koMitQuittung(rss, 0), [doc], now, profile), null);
});
test("RSS zwischen altem1400-Limit und einem Abschnitt bleibt vollstaendig belegt", () => {
  const doc = { ...f.doc, summary: filler.repeat(15) + aussage };
  const k = koMitQuittung({ doc });
  assert.equal(Lage.baueEingabe([k], { [k.vorgang_id]: [doc] }, now)[0].quellenbelege[0].auszug, doc.summary);
});
test("JSONB-artiger Key-Roundtrip erhält Original-, Lektüre- und Endabschnittbindung", () => {
  const reorder = x => Array.isArray(x) ? x.map(reorder) : x && typeof x === "object"
    ? Object.fromEntries(Object.entries(x).sort(([a],[b]) => a.length - b.length || a.localeCompare(b)).map(([k,v]) => [k,reorder(v)])) : x;
  for (const raw of [f, { doc: { ...f.doc, summary: filler.repeat(180) + aussage } }]) {
    const projected = raw.projected || raw.doc, k = koMitQuittung(raw);
    const before = Lage.baueEingabe([k], { [k.vorgang_id]: [projected] }, now);
    const after = Lage.baueEingabe([reorder(k)], { [k.vorgang_id]: [reorder(projected)] }, now);
    assert.deepEqual(after, before); assert.ok(after[0].quellenbelege[0].auszug.includes(aussage));
    assert.equal(O.belege(reorder(k), [reorder(projected)], now, profile).beleg.text, aussage);
    assert.deepEqual(Briefing.quellenVertrag({ [k.vorgang_id]: [reorder(projected)] }, [reorder(k)]),
      Briefing.quellenVertrag({ [k.vorgang_id]: [projected] }, [k]));
  }
});
test("Nicht bestaetigbarer V4-Gesamtbeleg liefert keine Quelle statt TypeError", () => {
  const pruefe = A.pruefeArtikelkontext;
  try {
    A.pruefeArtikelkontext = () => null;
    assert.deepEqual(Q.geleseneArtikelabschnitte(f.projected, ko), []);
    assert.equal(Q.waehleGelesenenArtikelabschnitt(f.projected, ko), null);
    assert.deepEqual(Lage.baueEingabe([ko], docs, now), []);
  } finally { A.pruefeArtikelkontext = pruefe; }
  const changed = structuredClone(f.projected); changed.artikelkontext.beleg.quellenHash = "f".repeat(64);
  assert.throws(() => Q.geleseneArtikelabschnitte(changed, ko), e => !(e instanceof TypeError) && /quellenstand-abweichend/.test(e.message));
});
console.log(`PASS ${pass}/${pass} Abschnitts-Downstream; keine Modell-/Originalaufrufe`);
