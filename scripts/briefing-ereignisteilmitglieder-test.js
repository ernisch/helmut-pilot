"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const { hash } = require("../lib/helmut/briefing-speicher");
const real = require("../lib/helmut/briefing-ereignisteilmitglieder");
const sourceFile = require.resolve("../lib/helmut/briefing-ereignisteilmitglieder");
function fixture(r) {
  const values = new Map(), kosById = {}, sourcesByVorgang = {}, decisions = [], items = [], recommendations = [];
  for (const m of r.mitglieder) {
    const ko = { id: m.koId, vorgang_id: m.vorgangId, display_title: m.title, display_summary: m.summary };
    kosById[ko.id] = ko; values.set(hash(ko), m.koHash);
    sourcesByVorgang[m.vorgangId] = m.quellen.map(q => {
      const d = { id: q.quelleId, title: "Eigener Quellentitel", summary: "Eigener begrenzter Quellenkontext",
        source_name: "Originalquelle", url: "https://publisher.test/article/" + q.quelleId, published_at: "2026-09-10T12:00:00Z" };
      values.set(hash(d), q.quelleHash); return d;
    });
    decisions.push({ knowledge_object_id: m.koId, vorgang_id: m.vorgangId });
    const fields = { title: m.title, summary: m.summary, sources: [], recommendedAction: "Pruefen", decision: "Ignorieren" };
    items.push({ ...fields, id: "item-" + m.vorgangId, knowledgeObjectId: m.koId, vorgangId: m.vorgangId });
    recommendations.push({ ...fields, knowledge_object_id: m.koId, vorgang_id: m.vorgangId });
  }
  const sandbox = { module: { exports: {} }, structuredClone, Object, Map, Set, require: name =>
    name === "./briefing-speicher" ? { hash: x => values.get(hash(x)) || hash(x) } : require("../lib/helmut/briefing-ereignisgruppen") };
  vm.runInNewContext(fs.readFileSync(sourceFile, "utf8"), sandbox, { filename: sourceFile });
  return { E: sandbox.module.exports, input: { items, recommendations, decisions, kosById, sourcesByVorgang, currentHelmutState: {} } };
}
const same = (a,b) => assert.equal(JSON.stringify(a),JSON.stringify(b));
let passed = 0;
const onlyItemsStructure = process.argv.includes("--only-items-structure");
function test(name, f, itemsStructure = false) {
  if (onlyItemsStructure && !itemsStructure) return;
  f(); passed++; console.log("PASS " + name);
}
for (const r of real.REGISTER) {
  test(r.art + " genaue Original-/Quellenbindung und sichtbare Teilrollen", () => {
    const { E, input } = fixture(r), before = JSON.stringify(input), out = E.projiziere(input);
    assert.equal(out.items.length, r.art === "br" ? 2 : 1);
    const changed = out.items.find(i => i.ereignisUrspruenge);
    assert.equal(changed.ereignisUrspruenge.length, 2);
    changed.ereignisUrspruenge.forEach((o,n) => { same(o.originalKO,input.kosById[r.mitglieder[n].koId]);
      same(o.source19,input.sourcesByVorgang[o.vorgangId]); same(o.originalItem,input.items[n]); same(o.originalRecommendation,input.recommendations[n]); });
    if (r.art === "br") {
      assert.equal(out.items[0].summary,input.items[0].summary);
      assert.ok(!changed.summary.includes("Bundesrat"));
      assert.equal(changed.ereignisTeilrollen.length,2);
      assert.ok(changed.primarySource.documentId.includes("7c0f3286"));
      assert.equal(changed.sources.length,2);
      assert.ok(!changed.sources.some(s=>s.documentId.includes("d97f522e")));
      assert.ok(changed.ereignisTeilrollen[1].sources[0].documentId.includes("8edbf"));
      assert.ok(!changed.ereignisTeilrollen[1].sources.some(s=>s.documentId.includes("7c0f")));
    } else { same(changed.ereignisKontexte.map(c=>[c.title,c.summary]),input.items.map(c=>[c.title,c.summary]));
      assert.equal(changed.sources.length,new Set(r.mitglieder.flatMap(m=>m.quellen.map(q=>q.quelleId))).size);
      assert.equal(changed.ereignisId,undefined); }
    assert.equal(JSON.stringify(input),before);
  });
  test(r.art + " unbekannte KO/Source19/Relations-/Ausgaberollen bleiben unveraendert", () => {
    for (const mutate of [i=>i.kosById[r.mitglieder[0].koId].display_summary+=" drift",
      i=>i.sourcesByVorgang[r.mitglieder[1].vorgangId][0].title+=" drift",
      i=>i.sourcesByVorgang[r.mitglieder[1].vorgangId].pop(),
      i=>i.sourcesByVorgang[r.mitglieder[1].vorgangId].push({...i.sourcesByVorgang[r.mitglieder[1].vorgangId][0]}),
      i=>i.decisions[0].vorgang_id="fremde-rolle",i=>i.items[0].summary+=" drift",
      i=>i.recommendations[1].summary+=" drift",i=>i.items.push({...i.items[0]}),
      i=>i.currentHelmutState.primaryVorgangId=r.mitglieder[1].vorgangId]) {
      const {E,input}=fixture(r);mutate(input);assert.strictEqual(E.projiziere(input).items,input.items);
    }
  });
}
test("Public-/Client-/Lage-Rollen bleiben sichtbar und Quellen bleiben einzeln",()=>{
  const {E,input}=fixture(real.REGISTER[1]),item=E.projiziere(input).items[0];
  const ai=require("../lib/helmut/ai"),pub=ai.publicDecision(item),rec=ai.publicRecommendation(item);
  same(pub.ereignisKontexte,item.ereignisKontexte);same(rec.ereignisKontexte,item.ereignisKontexte);
  assert.equal(pub.ereignisUrspruenge,undefined);
  const c=E.lageKarte({vorgangId:item.vorgangId,summary:{},sources:[]},item);
  same(c.ereignisKontexte,item.ereignisKontexte);assert.equal(c.displaySummary,item.summary);
  const src=fs.readFileSync(require.resolve("../client.js"),"utf8"),renderer=src.slice(src.indexOf("function renderEreignisRollen"),src.indexOf("function renderDecisionBlock"));
  const scope={sourceHref:s=>s.url,escapeHtml:s=>String(s).replace(/</g,"&lt;"),escapeAttribute:s=>String(s).replace(/"/g,"&quot;")};
  vm.createContext(scope);vm.runInContext(renderer+";globalThis.render=renderEreignisRollen",scope);
  const html=scope.render(c);for(const row of item.ereignisKontexte) {assert.ok(html.includes(row.title));assert.ok(html.includes(row.summary));for(const s of row.sources)assert.ok(html.includes(s.url));}
  assert.ok(scope.render({ereignisKontexte:[{title:"<script>",summary:"<bad>",sources:[]}]}).includes("&lt;script>"));
});
test("Claim-/Korrekturkontext umfasst beide Originale ohne unsichtbare Dopplung",()=>{
  const {E,input}=fixture(real.REGISTER[1]),out=E.projiziere(input),A=require("../lib/helmut/briefing-aussagenbindung");
  const e=A.baueEingabe({briefing:{available:true,items:out.items,personalizedRecommendations:out.recommendations},
    profile:{id:"synthetic-member-test"},userId:"synthetic-member-test",day:"2026-10-10",kos:Object.values(input.kosById),sourcesByVorgang:input.sourcesByVorgang});
  assert.equal(e.korrekturKontext.sichtbareVorgaenge.length,2);assert.ok(e.ursprungsAussagen.length);
  assert.ok(!e.aussagen.some(a=>a.pfad.includes("ereignisUrspruenge")));
  for(const m of real.REGISTER[1].mitglieder) assert.ok(e.aussagen.some(a=>a.vorgangId===m.vorgangId&&a.pfad.includes("ereignisKontexte")));
  const F=require("../lib/helmut/briefing-fachurteil");same(F.umfang({briefing:{items:out.items},eingabe:e},{ursprungHash:e.eingabeHash}).auswahl,E.vorgangIds(out.items,false));
});
test("Persistierter Rollenhash und Ursprungs-/Quellendrift sperren Cache und Rekonstruktion",()=>{
  for (const r of real.REGISTER) {
    const {E,input}=fixture(r),item=E.projiziere(input).items.find(i=>i.ereignisUrspruenge);
    assert.ok(E.projektionGueltig(item));
    const payload={briefingEingabeHash:hash("synthetic-judged-input"),teilmitgliedProjektionen:[item],teilmitgliedProjektionHash:hash([item])};
    assert.ok(E.cachePasst(payload,[item]));
    const originals=item.ereignisUrspruenge.map(o=>({vorgangId:o.vorgangId,displaySummary:"Alter Modellabsatz",sources:[]}));
    const cards=E.gespeicherteLageKarten(originals,payload);
    assert.equal(cards.length,r.art==="green"?1:2);assert.equal(cards.find(c=>c.vorgangId===item.vorgangId).displaySummary,item.summary);
    for (const mutate of [x=>x.teilmitgliedProjektionen[0].summary+=" drift",
      x=>x.teilmitgliedProjektionen[0].ereignisUrspruenge[0].source19[0].title+=" drift",
      x=>x.teilmitgliedProjektionen[0].ereignisUrspruenge[0].originalKO.display_summary+=" drift",
      x=>x.teilmitgliedProjektionHash="0".repeat(64)]) {
      const bad=structuredClone(payload);mutate(bad);assert.ok(!E.cachePasst(bad,[item]));
      assert.throws(()=>E.gespeicherteLageKarten(originals,bad),/lage-teilmitgliedprojektion-abweichend/);
    }
    assert.ok(!E.cachePasst(payload,[]));assert.ok(E.cachePasst({},[]));
  }
});
test("Gesamturteil darf doppelte oder ungebundene sichtbare IDs nicht durch Herkunfts-Deduplikation heilen",()=>{
  const F=require("../lib/helmut/briefing-fachurteil");
  for (const items of [[{vorgangId:"vg-a"},{vorgangId:"vg-a"}],[{vorgangId:"vg-a"},{}]]) {
    const result={briefing:{available:true,items},eingabe:{eingabeHash:"a".repeat(64),darstellungsHash:"b".repeat(64)}};
    const urteil={ursprungHash:"c".repeat(64),gesamtpruefung:{version:F.VERSION,umfang:F.umfang(result,{ursprungHash:"c".repeat(64)}),kriterien:{},quellen:[]}};
    assert.equal(F.pruefe(result,urteil).grund,"briefing-gesamtpruefung-veraltet");
  }
});
test("Gesamturteil weist fehlende und nicht-arrayfoermige Items ohne Ausnahme zurueck",()=>{
  const F=require("../lib/helmut/briefing-fachurteil");
  for (const fields of [{},{items:null},{items:{}},{items:"ungueltig"},{items:42}]) {
    const result={briefing:{available:true,...fields},eingabe:{}};
    const urteil={gesamtpruefung:{version:F.VERSION,umfang:{},kriterien:{},quellen:[]}};
    assert.deepEqual(F.pruefe(result,urteil),{
      bereit:false,grund:"briefing-gesamtpruefung-veraltet",vollstaendigeFaktenpruefung:false
    });
  }
},true);
console.log(JSON.stringify({passed,ProductionWrites:0,modelCalls:0,originalFetches:0}));
