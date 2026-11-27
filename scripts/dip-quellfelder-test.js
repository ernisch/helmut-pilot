"use strict";

// Der wirkliche DIP Eingang, beide Schreibwege und sechs echte Storage Leser.
// Nur HTTP wird durch einen lokalen Speicher ersetzt. Keine API/Modellaufrufe.
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const DIP = require("../lib/helmut/dip");
const S = require("../lib/helmut/scheduler");
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const Q = require("../lib/helmut/dip-quellfelder");
const U = require("../lib/helmut/understanding");
const L = require("../lib/helmut/lage-quellenbeleg");
const B = require("../lib/helmut/briefing-aussagenbindung");
const storage = require("../lib/helmut/storage");
const original = { id: 990001, titel: "auf die Kleine Anfrage\r\n- Drucksache 21/9900 -\r\nPruefung kommunaler Beratungsangebote",
  drucksachetyp: "Antwort", dokumentart: "Drucksache", datum: "2026-09-19", wahlperiode: 21,
  urheber: [{ titel: "Bundesregierung", personendaten: "nicht uebernehmen" }],
  ressort: [{ titel: "Bundesministerium fuer Bildung", ignorieren: "nicht uebernehmen" }],
  fundstelle: { pdf_url: "https://dserver.bundestag.de/btd/21/099/2109900.pdf" },
  volltext: "nicht uebernehmen", author: "nicht uebernehmen" };
const item = S.dipDocToRawItem(DIP.normalizeDrucksache(original), { primary: true });
const row = D.toRawDocumentRow(item);
const expected = Q.quellenangaben(row);
const now = new Date("2026-09-20T10:00:00Z");
const kos = [{ id: "ko-vg-dip", vorgang_id: "vg-dip" }];
const copy = x => JSON.parse(JSON.stringify(x));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
function beidePfade(d) {
  const prompt = U.buildUnderstandingPrompt({ documents: [d] });
  assert(prompt.includes(JSON.stringify(expected)));
  const lage = L.baueEingabe(kos, { "vg-dip": [d] }, now);
  assert.deepEqual(lage[0].quellenbelege[0].dokumentangaben, expected);
  const fach = B.baueEingabe({ briefing: { items: [] }, sourcesByVorgang: { "vg-dip": [d] },
    profile: { id: "synthetisch" }, userId: "synthetisch", day: "2026-09-20", kos });
  assert.deepEqual(fach.quellen[0].dokumentangaben, expected);
  return { lage, fach };
}
const langeOriginale = ["292778", "292779"].map(id => require(`./fixtures/dip-originale-20261127/${id}.json`));
function langeAmtlicheTitel() {
  for (const original of langeOriginale) test(`Amtlicher Langtitel ${original.id}: unverkuerzt durch Adapter, Rohprojektion und Fachbelege`, () => {
    assert.equal(original.titel.length, 472);
    const item = S.dipDocToRawItem(DIP.normalizeDrucksache(original), { primary: true });
    const row = D.toRawDocumentRow(item), q = Q.quellenangaben(row);
    assert(q, "Gueltige amtliche DIP-Metadaten duerfen nicht an der allgemeinen Schlagzeilengrenze scheitern");
    assert.equal(row.title, original.titel);
    assert.equal(q.originaltitel, original.titel);
    assert.equal(q.dokumenttyp, "Unterrichtung");
    assert.equal(q.urheberLautDIP[0].einbringer, false);
    assert.equal(q.ereignisdatum, null);
    assert.equal(q.vorgangsbezuegeLautDIP[0].id, "342138");
    assert(U.buildUnderstandingPrompt({ documents: [row] }).includes(JSON.stringify(original.titel)));
    assert.deepEqual(L.baueEingabe(kos, { "vg-dip": [row] }, new Date("2026-11-27T12:42:02Z"))[0].quellenbelege[0].dokumentangaben, q);
    assert.deepEqual(B.baueEingabe({ briefing: { items: [] }, sourcesByVorgang: { "vg-dip": [row] },
      profile: { id: "synthetisch" }, userId: "synthetisch", day: "2026-11-27", kos }).quellen[0].dokumentangaben, q);
  });
  test("Langtitel bleiben eng an eine gueltige DIP-Bindung und 600 Zeichen gebunden", () => {
    const d = langeOriginale[0];
    const item = S.dipDocToRawItem(DIP.normalizeDrucksache(d), { primary: true });
    const maximal = S.dipDocToRawItem(DIP.normalizeDrucksache({ ...d, titel: "T".repeat(600) }));
    assert.equal(D.toRawDocumentRow(maximal).title.length, 600);
    const zuLang = S.dipDocToRawItem(DIP.normalizeDrucksache({ ...d, titel: "T".repeat(601) }));
    assert.equal(D.toRawDocumentRow(zuLang).title, null);
    assert.equal(Q.quellenangaben(D.toRawDocumentRow(zuLang)), null);
    for (const bad of [{ ...item, sourceId: "rss" }, { ...item, dipQuellfelder: undefined },
      { ...item, dipQuellfelder: { ...item.dipQuellfelder, hash: "0".repeat(64) } },
      { ...item, title: item.title + " beschlossen" }]) {
      const row = D.toRawDocumentRow(bad);
      assert.equal(row.title, null); assert.equal(Q.quellenangaben(row), null);
    }
    const ungebunden = { ...item, sourceId: "rss", dipQuellfelder: undefined, title: "T".repeat(300) };
    assert.equal(D.toRawDocumentRow(ungebunden).title.length, 300);
    assert.equal(D.toRawDocumentRow({ ...ungebunden, title: "T".repeat(301) }).title, null);
    const zuViel = DIP.normalizeDrucksache({ ...d, urheber: Array(20).fill({
      titel: "U".repeat(160), bezeichnung: "B".repeat(160), einbringer: false }) });
    assert.equal(zuViel.dipQuellfelder, undefined, "Die unveraenderte5k-Gesamtgrenze bleibt wirksam");
  });
}
async function main() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv");
  langeAmtlicheTitel();
  if (process.argv.includes("--only=langtitel")) { console.log(`${passed}/${passed} Gruppen erfolgreich`); return; }
  test("Originaltitel, Antworttyp, Urheber und Ressort bleiben getrennt erhalten", () => {
    assert(expected); assert.equal(expected.originaltitel, original.titel);
    assert.equal(row.title, "Pruefung kommunaler Beratungsangebote");
    assert.equal(expected.dokumenttyp, "Antwort");
    assert.deepEqual(expected.urheberLautDIP, [{ titel:"Bundesregierung",bezeichnung:null,einbringer:null,rolle:null }]);
    assert.deepEqual(expected.ressortLautDIP, [{ titel:"Bundesministerium fuer Bildung",federfuehrend:null }]);
    assert.equal(expected.ereignisdatum, null);
    assert.equal(expected.belegt, "Dokumentmetadaten, keine Inhaltspruefung");
    assert(!JSON.stringify(row).includes("nicht uebernehmen"));
    beidePfade(row);
  });
  test("Fehlende Metadaten und Fallbacktyp erzeugen keine amtlichen Tatsachen", () => {
    const d = D.toRawDocumentRow(S.dipDocToRawItem(DIP.normalizeDrucksache({ id: 990002,
      titel: "Pruefung einer moeglichen Foerderung" })));
    const q = Q.quellenangaben(d);
    assert(q); assert.equal(d.document_type, "Drucksache");
    for (const f of ["dokumenttyp", "dokumentart", "urheberLautDIP", "ressortLautDIP", "dokumentdatum", "ereignisdatum"])
      assert.equal(q[f], null, f);
    assert.equal(Q.quellenangaben({ ...row, raw: {} }), null);
  });
  test("Antrag, Antwort und Beschlussempfehlung werden niemals zum Beschluss umgeschrieben", () => {
    for (const typ of ["Antrag", "Antwort", "Beschlussempfehlung", "Gesetzentwurf"]) {
      const d = D.toRawDocumentRow(S.dipDocToRawItem(DIP.normalizeDrucksache({ ...original, drucksachetyp: typ })));
      assert.equal(Q.quellenangaben(d).dokumenttyp, typ);
      assert.equal(Q.quellenangaben(d).ereignisdatum, null);
    }
  });
  test("Getrennte Rollenflags bleiben true, false oder unbekannt; keine Rollenableitung aus Namen", () => {
    const n = DIP.normalizeDrucksache({ ...original,
      urheber:[{ titel:"Fraktion Beispiel",bezeichnung:"BEI",einbringer:false,rolle:"U" }],
      ressort:[{ titel:"Ministerium A",federfuehrend:true },{ titel:"Ministerium B",federfuehrend:false }] });
    const d = D.toRawDocumentRow(S.dipDocToRawItem(n));
    assert.deepEqual(Q.quellenangaben(d).urheberLautDIP, [{ titel:"Fraktion Beispiel",bezeichnung:"BEI",einbringer:false,rolle:"U" }]);
    assert.deepEqual(Q.quellenangaben(d).ressortLautDIP, [{ titel:"Ministerium A",federfuehrend:true },{ titel:"Ministerium B",federfuehrend:false }]);
    const b = d.raw.helmutDipQuellfelder;
    b.urheber = b.urheber.map(x => Object.fromEntries(Object.entries(x).reverse()));
    b.ressort = b.ressort.map(x => Object.fromEntries(Object.entries(x).reverse()));
    assert(Q.quellenangaben(d));
    b.ressort[1].federfuehrend = true; assert.equal(Q.quellenangaben(d),null);
  });
  test("Aenderungen an Metadaten, Quelle, Titel, URL, Typ oder Datum entwerten den Beleg", () => {
    for (const [k,v] of Object.entries({ title:"Fremder Titel", url:"https://dserver.bundestag.de/anders.pdf",
      canonical_url:"https://dserver.bundestag.de/anders.pdf",
      source_id:"fremd", document_type:"Beschluss", published_at:"2026-09-20" }))
      assert.equal(Q.quellenangaben({ ...row, [k]:v }), null, k);
    for (const mutate of [b => b.urheber.reverse().push("Bundestag"), b => b.originaltitel += " beschlossen",
      b => b.dokumenttyp = "Beschluss", b => b.neuesFeld = "wahr", b => b.hash = "0".repeat(64)]) {
      const d = copy(row); mutate(d.raw.helmutDipQuellfelder); assert.equal(Q.quellenangaben(d), null);
    }
    const d = copy(row); d.dip_quellfelder = copy(d.raw.helmutDipQuellfelder);
    d.dip_quellfelder.urheber = ["fremd"];
    assert.equal(Q.quellenangaben(d), null);
  });
  test("JSONB Schluesselreihenfolge und ISO Datumsnormalisierung verlieren den Beleg nicht", () => {
    const d = copy(row), b = d.raw.helmutDipQuellfelder;
    b.bindung = Object.fromEntries(Object.entries(b.bindung).reverse());
    d.raw.helmutDipQuellfelder = Object.fromEntries(Object.entries(b).reverse());
    d.published_at = "2026-09-19T00:00:00+00:00";
    assert.deepEqual(Q.quellenangaben(d), expected);
  });
  test("Ueberlange oder untypisierte Felder werden ganz abgelehnt, niemals gekuerzt", () => {
    for (const patch of [{ titel:"Lang ".repeat(121) }, { urheber:Array(21).fill({ titel:"Regierung" }) },
      { ressort:[{ titel:"Lang ".repeat(40) }] }, { drucksachetyp:{ falsch:true } }, { urheber:"Regierung" },
      { fundstelle:{ pdf_url:"https://dip.bundestag.de.fremd.example/a" } }]) {
      const n = DIP.normalizeDrucksache({ ...original, ...patch });
      assert.equal(n.dipQuellfelder, undefined);
    }
  });
  test("Globale Zusammenfuehrung behaelt nur die Metadaten der ausgewaehlten Primaerquelle", () => {
    for (const d of [item, row]) {
      const result = G.planDedupWrites([d]).persists[0];
      assert.deepEqual(Q.quellenangaben({ ...result, source_id:result.primary_source_id }), expected);
      assert.deepEqual(Object.keys(result.raw), ["helmutDipQuellfelder"]);
    }
    const weak = { ...item, confidence:"low", linkType:"search" };
    const other = { ...item, sourceId:"rss", dipQuellfelder:undefined };
    assert.equal(G.planDedupWrites([weak, other]).persists[0].raw, undefined);
  });
  test("Beide Pruefeingaben binden die Dokumentangaben in ihren Inhaltshash ein", () => {
    const a = beidePfade(row);
    const different = D.toRawDocumentRow(S.dipDocToRawItem(DIP.normalizeDrucksache({ ...original,
      ressort:[{ titel:"Anderes Ministerium" }] })));
    const b = L.baueEingabe(kos, { "vg-dip":[different] }, now);
    assert.notEqual(L.hashEingabe(a.lage), L.hashEingabe(b));
    const fach = B.baueEingabe({ briefing:{ items:[] }, sourcesByVorgang:{ "vg-dip":[different] },
      profile:{ id:"synthetisch" }, userId:"synthetisch", day:"2026-09-20", kos });
    assert.notEqual(a.fach.eingabeHash, fach.eingabeHash);
  });
  const saved = new Map();
  const server = http.createServer(async (req,res) => {
    let content = ""; for await (const chunk of req) content += chunk;
    const u = new URL(req.url, "http://127.0.0.1");
    let result = [];
    if (req.method === "POST") {
      const data = JSON.parse(content); result = data;
      if (u.pathname.endsWith("/raw_documents")) {
        assert.equal(req.headers.prefer, "resolution=ignore-duplicates,return=representation");
        for (const d of data) saved.set(d.id, { ...copy(d), published_at: d.published_at
          ? new Date(d.published_at).toISOString() : null });
      }
    } else {
      const select = u.searchParams.get("select") || "";
      const columns = select.replace(/^.*raw_documents(?:!inner)?\(/u, "").replace(/\)$/u, "").split(",");
      result = [...saved.values()].map(d => Object.fromEntries(columns.map(c => {
        if (c === "dip_quellfelder:raw->helmutDipQuellfelder") return ["dip_quellfelder",d.raw?.helmutDipQuellfelder || null];
        if (c === "quellenauszug_beleg:raw->helmutQuellenkontext") return ["quellenauszug_beleg",null];
        return [c,d[c]];
      }).filter(([,v]) => v !== undefined)));
      if (u.pathname.endsWith("/helmut_ko_quellen")) result = result.map(d => ({
        knowledge_object_id:"ko-vg-dip", raw_document_id:d.id, raw_documents:d }));
    }
    res.writeHead(200, { "Content-Type":"application/json" }); res.end(JSON.stringify(result));
  });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const names = ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","HELMUT_V3_STORE"];
  const env = Object.fromEntries(names.map(n => [n,process.env[n]]));
  process.env.SUPABASE_URL = "http://127.0.0.1:" + server.address().port;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "lokaler-testwert"; process.env.HELMUT_V3_STORE = "on";
  try {
    const queue = await storage.persistiereRohdokumenteWarteschlange([item]);
    assert.equal(queue.ok,true); assert.equal(saved.size,1);
    assert.deepEqual(Q.quellenangaben([...saved.values()][0]),expected);
    saved.clear();
    assert.equal((await storage.persistRawDocumentsDeduped([row])).persisted,1);
    assert.equal(saved.size,1); assert.deepEqual(Q.quellenangaben([...saved.values()][0]),expected);
    passed++; console.log("PASS Beide echten Schreibwege erhalten genau die begrenzten DIP Felder");
    const stored = [...saved.values()];
    const readers = [
      ["Erstverstehen", () => storage.listRecentRawDocuments(10,30)],
      ["Rohdokumentfenster", () => storage.listRawDocuments({ limit:10,days:30 })],
      ["Warteschlangenauftrag", () => storage.getRawDocumentsByIds(stored.map(d => d.id))],
      ["Aktualisierung", () => storage.listKoDocuments("ko-vg-dip")],
      ["Vorgangsquellen", () => storage.getSourcesForVorgang("vg-dip")],
      ["Gebundene Lagequellen", () => storage.getSourcesForVorgang("vg-dip",{ lageKoId:"ko-vg-dip",lageQuellen:stored })]
    ];
    for (const [name,read] of readers) {
      const result = await read(); assert.equal(result.length,1,name);
      assert.equal(Object.hasOwn(result[0],"raw"),false);
      assert.deepEqual(Q.quellenangaben(result[0]),expected,name); beidePfade(result[0]);
      passed++; console.log("PASS " + name + ": gebundene Dokumentangaben in beiden Fachpfaden");
    }
    const longItems = langeOriginale.map(o => S.dipDocToRawItem(DIP.normalizeDrucksache(o), { primary: true }));
    const longRows = longItems.map(D.toRawDocumentRow);
    const expectedLong = new Map(longRows.map(d => [d.id, Q.quellenangaben(d)]));
    saved.clear();
    assert.equal((await storage.persistiereRohdokumenteWarteschlange(longItems)).ok, true);
    assert.equal(saved.size, 2);
    for (const d of saved.values()) assert.deepEqual(Q.quellenangaben(d), expectedLong.get(d.id));
    saved.clear();
    assert.equal((await storage.persistRawDocumentsDeduped(longRows)).persisted, 2);
    assert.equal(saved.size, 2);
    for (const d of saved.values()) assert.deepEqual(Q.quellenangaben(d), expectedLong.get(d.id));
    passed++; console.log("PASS Amtliche Langtitel: beide echten Schreibwege erhalten Titel und Quellenbindung");
    const longStored = [...saved.values()];
    const longReaders = [
      ["Erstverstehen", () => storage.listRecentRawDocuments(10,30)],
      ["Rohdokumentfenster", () => storage.listRawDocuments({ limit:10,days:30 })],
      ["Warteschlangenauftrag", () => storage.getRawDocumentsByIds(longStored.map(d => d.id))],
      ["Aktualisierung", () => storage.listKoDocuments("ko-vg-dip")],
      ["Vorgangsquellen", () => storage.getSourcesForVorgang("vg-dip")],
      ["Gebundene Lagequellen", () => storage.getSourcesForVorgang("vg-dip",{ lageKoId:"ko-vg-dip",lageQuellen:longStored })]
    ];
    for (const [name,read] of longReaders) {
      const result = await read(); assert.equal(result.length, 2, name);
      for (const d of result) {
        assert.equal(d.title.length, 472, name);
        assert.equal(Object.hasOwn(d, "raw"), false, name);
        assert.deepEqual(Q.quellenangaben(d), expectedLong.get(d.id), name);
        assert(U.buildUnderstandingPrompt({ documents: [d] }).includes(JSON.stringify(d.title)));
        assert.deepEqual(L.baueEingabe(kos, { "vg-dip": [d] }, new Date("2026-11-27T12:42:02Z"))[0]
          .quellenbelege[0].dokumentangaben, expectedLong.get(d.id));
      }
      passed++; console.log("PASS " + name + ": amtliche Langtitel bleiben vollstaendig gebunden");
    }
  } finally {
    for (const n of names) { if (env[n] === undefined) delete process.env[n]; else process.env[n] = env[n]; }
    await new Promise(resolve => server.close(resolve));
  }
  console.log(`${passed}/${passed} Gruppen erfolgreich; keine vollstaendige Faktenpruefung.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
