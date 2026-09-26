"use strict";
const A = require("node:assert/strict"), {mock}=require("node:test");
mock.timers.enable({apis:["Date"],now:Date.parse("2026-09-26T02:00:00Z")});
const Q=require("../lib/helmut/lage-textqualitaet"), C=require("../lib/helmut/lage-quellenbeleg");
const {payload}=require("./fixtures/lage-beleg");
const gestern={veroeffentlichtAm:"2026-09-25T21:39:26Z"};
for(const wort of ["heute","gestern","morgen","übermorgen","vorgestern","heutigen","gestrigen","morgigen"]){
 A.equal(Q.tagesbezugGebunden("Der Verband ruft für "+wort+" zu Protesten auf.",gestern),false);
 A.equal(Q.tagesbezugGebunden("Der Verband ruft für "+wort+" zu Protesten auf.",{veroeffentlichtAm:"2026-09-25T22:10:00Z"}),true);
}
A(Q.tagesbezugGebunden("Der Verband kündigte einen Aktionstag an.",gestern));
A(Q.tagesbezugGebunden("Der Bundestag beriet am 25. September 2026 einen Antrag.",gestern));
A.equal(Q.tagesbezugGebunden("Heute findet die Beratung statt.",{}),false);
A.equal(Q.tagesbezugGebunden("Heute findet die Beratung statt.",gestern,null),false);
A.equal(Q.tagesbezugGebunden("Heute findet die Beratung statt.",gestern,"ungueltig"),false);
console.log("PASS Tageswechsel, Berliner Tagesgrenze, fehlende Zeit und absolute/zeitneutrale Aussagen");
const quellen=[{vorgang_id:"vg-aktion",quellenbelege:[{...gestern,quelle_id:"q-aktion",url:"https://example.org/aktion",
 titel:"Verband ruft zu Aktionstag auf",auszug:"Der Verband hat für heute zu einem bundesweiten Aktionstag aufgerufen."}]}];
const paragraphs=[{text:quellen[0].quellenbelege[0].auszug,vorgang_ids:["vg-aktion"],quelle_id:"q-aktion",
 mandatsbezug:{feld:"schwerpunkt",wert:"Sozialstaat"}}];
const review={pruefungen:[{absatz:0,quelle_id:"q-aktion",belegfeld:"auszug",vollstaendig_belegt:true,
 themenrein:true,profilbezug:true,textart:"konkreter_sachverhalt",pruefbegruendung:"Die Quelle berichtet den Aktionstag."}],vergleiche:[]};
const result=Q.pruefe(paragraphs,quellen,review,{focusTopics:["Sozialstaat"]});
A.equal(result.ok,false);A.equal(result.grund,"ai-text-source-support");
A.deepEqual(result.diagnose.fehler,["aussage-unbelegt"]);
console.log("PASS positives Modellurteil heilt keine Verschiebung von heute");
const p=payload(),q=p.quellen[0].quellenbelege[0];
p.generatedAt=new Date().toISOString();Object.assign(q,gestern,{titel:"Bundestag berät heute den Haushalt"});
p.paragraphs[0].text=q.titel;p.paragraphs[0].belegstellen[0].text=q.titel;p.quellenHash=C.hashEingabe(p.quellen);
A.equal(C.cacheGueltig(p,p.koSetHash,p.quellenHash,p.quellen),false);A.equal(C.gespeicherterTextGueltig(p),false);
p.generatedAt="2026-09-25T21:45:00Z";A(C.gespeicherterTextGueltig(p));
delete p.generatedAt;A.equal(C.gespeicherterTextGueltig(p),false);
console.log("PASS bestehender falscher Tagessatz gesperrt, zeitlich passender historischer Text bleibt lesbar");
A(Q.prompt(paragraphs,quellen,{}).includes(Q.ZEITREGEL));
A(require("../lib/helmut/ai").buildLageBriefingPrompt(quellen,{}).includes(Q.ZEITREGEL));
console.log("PASS Generator und Quellenreview erhalten dieselbe Zeitregel");
