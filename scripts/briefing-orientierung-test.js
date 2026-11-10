"use strict";
const A = require("node:assert/strict");
const O = require("../lib/helmut/briefing-orientierung");
const C = require("../lib/helmut/briefingContract");
const render = require("./lib/briefing-ansichten");
const now = new Date("2026-11-09T05:15:33Z");
const p = { id: "test-mandat", parliamentType: "Bundestag", focusTopics: ["Pflege"] };
const ko = { id: "ko-test", vorgang_id: "vg-test", understanding_status: "complete", status: "neu",
  headline: "Pflegereform: Nachbesserungen angekündigt", display_title: "Pflegereform: Nachbesserungen angekündigt",
  was_ist_passiert: "Zur Pflegereform wurden Nachbesserungen angekündigt.", source_document_count: 12,
  created_at: "2026-11-06T06:00:00Z", updated_at: "2026-11-07T06:00:00Z" };
const doc = { id: "rd-test", title: "Ankündigung zur Pflegereform", url: "https://example.org/politik/pflegereform",
  source_name: "Synthetisches Testmedium", published_at: "2026-11-06T03:57:13Z",
  summary: "Bei der ersten Beratung der Pflegereform wurden Schwachstellen eingeräumt und Nachbesserungen für die weitere parlamentarische Beratung angekündigt." };
const dec = { knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id, decision: "Ignorieren", score: 10, matched_features: [] };
let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }
function state(k=ko, ds=[doc], profile=p) {
  return C.buildCurrentHelmutState({ profile, decisions: [dec], kosById: { [ko.id]: k }, sourcesByVorgang: { [ko.vorgang_id]: ds }, now });
}
test("Alter Originalbeleg trägt Prüfauftrag ohne neue Quelle, heutige Frist oder KO-Prosa", () => {
  const s = state(); A.equal(s.primaryVorgangId, ko.vorgang_id); A.equal(s.qualityStatus, "partial");
  A.equal(s.status, "stale"); A.equal(s.urgency, "unknown"); A.equal(s.primaryItem.sourceCount, 1);
  A.equal(s.tagesAnlass.art, "angekuendigter-schritt"); A(s.recommendation.includes("Prüfe"));
  A(s.whyItMatters.includes("nicht bestätigt")); A.equal(s.riskOfNoAction, ""); A.deepEqual(s.actionItems, []);
});
test("Pflegeprüfung funktioniert für andere Profilkennung und Landesmandat", () => {
  A(state(ko,[doc],{...p,id:"test-land",parliamentType:"Landtag",state:"Berlin"}).primaryItem);
});
test("Andere Fachgebiete erhalten denselben belegten Prüfauftrag", () => {
  const k={...ko,headline:"Verkehrsgesetz: Nachbesserungen angekündigt",was_ist_passiert:"Nachbesserungen am Verkehrsgesetz angekündigt."};
  const s=state(k,[{...doc,title:"Verkehrsgesetz",summary:doc.summary.replace("Pflegereform","Verkehrsgesetz")}],{id:"verkehr",focusTopics:["Verkehr"]});
  A.equal(s.tagesAnlass.art,"angekuendigter-schritt");
});
test("Redaktionelles Ignorieren bleibt verbindlich", () => {
  const s=C.buildCurrentHelmutState({profile:p,decisions:[{...dec,redaktionellerRang:1}],kosById:{[ko.id]:ko},sourcesByVorgang:{[ko.vorgang_id]:[doc]},now});
  A.equal(s.primaryItem,null);
});
test("Fremdes Fachprofil erhält keinen Vorbereitungsauftrag", () => A.equal(state(ko,[doc],{id:"anderes",focusTopics:["Verkehr"]}).primaryItem,null));
test("Quellensachtext bestätigt Profilbezug unabhängig vom KO", () => A.equal(state(ko,[{...doc,summary:"Bei der Beratung des Verkehrsgesetzes wurden Nachbesserungen für die weitere parlamentarische Arbeit angekündigt."}]).primaryItem,null));
for (const [name, change] of [
  ["Titel allein",{summary:null}], ["Unvollständiger Auszug",{summary:"Nachbesserungen angekündigt"}],
  ["Verneinung",{summary:"Für die Pflegereform wurden keine Nachbesserungen für die weitere parlamentarische Beratung angekündigt."}],
  ["Absage",{summary:"Zur Pflegereform wurden Nachbesserungen angekündigt. Die weitere Beratung wurde abgesagt."}],
  ["Hypothese",{summary:"Für die Pflegereform könnte eine Anhörung geplant werden und Nachbesserungen würden angekündigt."}],
  ["Unbestimmte Zukunft",{summary:"Für die Pflegereform wurde eine Anhörung für nächste Woche mit allen beteiligten Verbänden angekündigt."}],
  ["Mehrdeutige Termine",{summary:"Die Beratung zur Pflegereform findet am 2026-11-10 oder 2026-11-12 mit den beteiligten Verbänden statt."}],
  ["Uhrzeit ohne Zone",{summary:"Die Beratung zur Pflegereform findet am 2026-11-10 um 15 Uhr mit den beteiligten Verbänden statt."}],
  ["Alter Beleg",{published_at:"2026-10-20T08:00:00Z"}],
  ["Zukünftige Quelle",{published_at:"2026-11-10T08:00:00Z"}],
  ["Fehlender Zeitbeleg",{published_at:null}], ["Portaladresse",{url:"https://example.org/"}]
]) test(name+" erzeugt keinen Auftrag",()=>A.equal(state(ko,[{...doc,...change}]).primaryItem,null));
test("Fehlgeschlagenes Understanding bleibt gesperrt",()=>A.equal(state({...ko,understanding_status:"failed"}).primaryItem,null));
test("Derselbe Artikel mit widersprüchlichem Datum bleibt gesperrt",()=>A.equal(state(ko,[doc,{...doc,id:"variante",published_at:"2026-11-07T03:57:13Z"}]).primaryItem,null));
test("Späterer Gegenbeleg sperrt alte Ankündigung",()=>A.equal(state(ko,[doc,{...doc,id:"abschluss",url:"https://example.org/politik/abschluss",published_at:"2026-11-08T03:57:13Z",summary:"Die Nachbesserungen zur Pflegereform wurden vorgelegt."}]).primaryItem,null));
test("Bevorstehende Beratung zählt ohne neue Quelle",()=>{
  const s=state(ko,[{...doc,summary:"Die öffentliche Beratung zur Pflegereform findet am 2026-11-11 mit den beteiligten Verbänden im Parlament statt."}]);
  A.equal(s.tagesAnlass.art,"bevorstehender-schritt"); A(s.recommendation.includes("2026-11-11"));
});
test("Vergangener Verfahrensschritt wird nicht wiederbelebt",()=>A.equal(state(ko,[{...doc,summary:"Die öffentliche Beratung zur Pflegereform findet am 2026-11-08 mit den beteiligten Verbänden im Parlament statt."}]).primaryItem,null));
test("Kommende belegte Frist erlaubt Vorbereitung ohne heutige Dringlichkeit",()=>{
  const s=state({...ko,deadline:"2026-11-12"},[{...doc,summary:"Die Einreichungsfrist für Stellungnahmen zur Pflegereform endet am 2026-11-12. Die Verbände können ihre Stellungnahmen einreichen."}]);
  A.equal(s.tagesAnlass.art,"kommende-frist"); A(s.whyItMatters.includes("nicht heute fällig")); A.equal(s.urgency,"unknown");
});
test("Anzeige enthält Prüfauftrag und Originalbeleg statt Leerkarte/Lagekopie",()=>{
  const s=state(), b={currentHelmutState:s,currentRadarState:{},lageBriefing:{paragraphs:[{text:"NICHT KOPIEREN"}],vorgaenge:[]}};
  const r=render(b,now.toISOString()); A.equal(r.fachinhalt.briefing,true);
  const h=r.html.briefing; A(h.includes("Für Ihre Vorbereitung")); A(h.includes("Prüfen Sie"));
  A(h.includes(doc.summary)); A(!h.includes("NICHT KOPIEREN")); A(!h.includes("hstand-state-card--quiet"));
  A(!h.includes("Heute entscheidend")); A(!h.includes("data-briefing-office")); A(h.includes("Quellenstand"));
  A.equal(s.primaryItem.meldungAt,doc.published_at);
});
test("Quelldaten, Entscheidung und Profil bleiben unverändert",()=>{
  const before=JSON.stringify({p,ko,doc,dec}); state(); A.equal(JSON.stringify({p,ko,doc,dec}),before);
});
// Echter Serveranschluss: niedrig bewerteter Kandidat ausserhalb Top-50 und ohne
// heutige KO-Zeit erreicht dieselben Quellen-/Sicherheitsfilter und den Renderer.
(async()=>{
  const S=require("../lib/helmut/storage"), D=require("../lib/helmut/decisions");
  // Deklarierte Fachfixtures: echte deterministische Bewertung, keine Scorevorgaben.
  const profile={id:"test-fachprioritaet",parliamentType:"Bundestag",party:"SPD",
    committee:"Arbeit und Soziales",focusTopics:["Pflege","Gesundheit","Tarifbindung"]};
  const alt={...ko,id:"ko-alt",vorgang_id:"vg-alt",decision_level:"bund",ausschuesse:["Arbeit und Soziales"],
    parteien:["SPD"],tags:["Pflege"],policy_field:["Gesundheit"],confidence_score:90,zeitdruck:"keiner"};
  const text="Der Ausschuss für Arbeit und Soziales hat einen neuen Bericht über die Tarifbindung veröffentlicht. Der Bericht beschreibt den Umfang tariflicher Arbeitsbedingungen.";
  const neu={...ko,id:"ko-neu",vorgang_id:"vg-neu",decision_level:"bund",headline:"Ausschuss veröffentlicht Bericht über Tarifbindung",
    display_title:"Ausschuss veröffentlicht Bericht über Tarifbindung",was_ist_passiert:text,
    warum_wichtig:"Der neue Bericht betrifft die parlamentarische Fachzuständigkeit.",
    ausschuesse:["Arbeit und Soziales"],tags:["Tarifbindung"],policy_field:["Arbeit und Soziales"],
    confidence_score:90,zeitdruck:"keiner",created_at:"2026-11-09T03:00:00Z",updated_at:"2026-11-09T03:00:00Z"};
  const documents={ [alt.vorgang_id]:[{...doc}], [neu.vorgang_id]:[{...doc,id:"rd-neu",
    title:neu.headline,summary:text,url:"https://example.org/politik/tarifbindung",published_at:neu.created_at}] };
  let active=[alt,neu];
  S.v3StoreReady=()=>true; S.listKnowledgeObjects=async()=>active;
  S.getPruefSourcesByVorgaenge=async kos=>Object.fromEntries(kos.map(k=>[k.vorgang_id,documents[k.vorgang_id]]));
  const build=()=>require("../server").__buildV3Briefing(profile,profile.id,{now,debug:true});
  const before=JSON.stringify({profile,alt,neu,documents});
  const bewertet=D.decideForUser(profile,active,{userId:profile.id});
  const aktuell=await build();
  test("Aktuelle zulässige Ausschussmeldung ersetzt alte undatierte Ankündigung als Hauptvorgang",()=>{
    A(bewertet.find(d=>d.knowledge_object_id===alt.id).score>bewertet.find(d=>d.knowledge_object_id===neu.id).score);
    A.notEqual(bewertet.find(d=>d.knowledge_object_id===neu.id).decision,"Ignorieren");
    A.equal(aktuell.debugPrimary.candidateStats.freshEligibleCount,1);
    A.equal(aktuell.currentHelmutState.primaryVorgangId,neu.vorgang_id);
    A.equal(aktuell.currentHelmutState.status,"fresh");
    A.equal(aktuell.currentHelmutState.primaryItem.meldungAt,neu.created_at);
    A(aktuell.currentHelmutState.items.some(i=>i.id===alt.vorgang_id));
    A(render(aktuell,now.toISOString()).html.briefing.includes(doc.url));
    A.equal(JSON.stringify({profile,alt,neu,documents}),before);
  });
  active=[alt]; const ohneNeu=await build();
  test("Ohne frischen zulässigen Ersatz bleibt alte Vorbereitung mit ehrlichem Datum",()=>{
    A.equal(ohneNeu.currentHelmutState.primaryVorgangId,alt.vorgang_id);
    A.equal(ohneNeu.currentHelmutState.status,"stale");
    A.equal(ohneNeu.currentHelmutState.tagesAnlass.art,"angekuendigter-schritt");
  });
  active=[alt,{...neu,understanding_status:"failed"}]; const ohneVerstehen=await build();
  test("Fehlgeschlagene aktuelle Verarbeitung ersetzt keine belegte Vorbereitung",()=>{
    A.equal(ohneVerstehen.currentHelmutState.primaryVorgangId,alt.vorgang_id);
  });
  for(const [art,summary,deadline] of [
    ["heutige-frist","Die Einreichungsfrist für Stellungnahmen zur Pflegereform endet am 2026-11-09. Die Verbände können ihre Stellungnahmen einreichen.","2026-11-09"],
    ["kommende-frist","Die Einreichungsfrist für Stellungnahmen zur Pflegereform endet am 2026-11-12. Die Verbände können ihre Stellungnahmen einreichen.","2026-11-12"],
    ["bevorstehender-schritt","Die öffentliche Beratung zur Pflegereform findet am 2026-11-11 mit den beteiligten Verbänden im Parlament statt.",null]
  ]) {
    active=[{...alt,deadline},neu]; documents[alt.vorgang_id]=[{...doc,summary}];
    const termin=await build();
    test(`Belegter datierter Anlass ${art} behält seine Priorität`,()=>{
      A.equal(termin.currentHelmutState.primaryVorgangId,alt.vorgang_id);
      A.equal(termin.currentHelmutState.tagesAnlass.art,art);
    });
  }
  const other={...ko,id:"ko-other",vorgang_id:"vg-other",headline:"Alte Sachmeldung",display_title:"Alte Sachmeldung",was_ist_passiert:"Ein Bericht."};
  active=[other,ko];
  S.getPruefSourcesByVorgaenge=async kos=>Object.fromEntries(kos.map(k=>[k.vorgang_id,k.id===ko.id?[doc]:[{...doc,id:"rd-other",title:"Alte Sachmeldung",summary:"Ein alter Bericht zur allgemeinen politischen Lage wurde veröffentlicht.",url:"https://example.org/politik/bericht"}]]));
  D.decideForUser=()=>[{...dec,knowledge_object_id:other.id,vorgang_id:other.vorgang_id}];
  const b=await require("../server").__buildV3Briefing(p,p.id,{now,debug:true});
  test("Echter Ausgabeweg reicht fachlich belegten älteren Kandidaten nach",()=>{
    A.equal(b.debugPrimary.candidateStats.decisionCountBeforeAugment,1);
    A.equal(b.debugPrimary.candidateStats.decisionCountAfterAugment,2);
    A.equal(b.currentHelmutState.primaryVorgangId,ko.vorgang_id);
    A.equal(b.debugPrimary.candidates.find(c=>c.vorgang_id===ko.vorgang_id).reasonIfRejected,null);
    A.equal(render(b,now.toISOString()).fachinhalt.briefing,true);
  });
  console.log(`${count}/${count} Orientierungsgruppen bestanden`);
})().catch(e=>{console.error(e);process.exitCode=1;});
