"use strict";
const A=require("node:assert/strict"), Q=require("../lib/helmut/lage-textqualitaet");
const docs=[{vorgang_id:"vg-a",quellenbelege:[
  {quelle_id:"q-a",titel:"Ein Vorschlag",auszug:"Der Vorschlag ist noch nicht beschlossen.",
    quelle:"Amtliche Quelle",url:"https://example.org/a",veroeffentlichtAm:"2026-09-26T01:00:00Z",
    dokumentangaben:{drucksache:"21/1234"}},
  {quelle_id:"q-fremd",titel:"Ein anderer Vorgang",auszug:"Darf den ersten Absatz nicht heilen."}]},
  {vorgang_id:"vg-b",quellenbelege:[{quelle_id:"q-b",titel:"Zweiter Sachverhalt",auszug:"Eine andere Position."}]},
  {vorgang_id:"vg-c",quellenbelege:[{quelle_id:"q-c",titel:"Nicht gewaehlt"}]}];
const paragraphs=[{text:"Eine erste Aussage",quelle_id:"q-a",vorgang_ids:["vg-a"]},
  {text:"Eine zweite Aussage",quelle_id:"q-b",vorgang_ids:["vg-b"]},
  {text:"Weitere Aussage zur ersten Quelle",quelle_id:"q-a",vorgang_ids:["vg-a"]}];
const before=structuredClone({docs,paragraphs});
const result=Q.pruefQuellen(paragraphs,docs);
A.deepEqual(result,[{...docs[0],quellenbelege:[docs[0].quellenbelege[0]]},docs[1]]);
A.deepEqual({docs,paragraphs},before);
console.log("PASS ausgewaehlte Originalbelege vollstaendig, unbeteiligte entfernt, keine Mutation");
for(const [p,v] of [
  [[{...paragraphs[0],quelle_id:"q-fehlt"}],docs],
  [[{...paragraphs[0],vorgang_ids:["vg-b"]}],docs],
  [[{...paragraphs[0],vorgang_ids:["vg-a","vg-b"]}],docs],
  [[{...paragraphs[0],quelle_id:undefined}],docs],
  [[paragraphs[0]],[...docs,structuredClone(docs[0])]],
  [[paragraphs[0]],[...docs,{vorgang_id:"vg-falsch",quellenbelege:[docs[0].quellenbelege[0]]}]],
  [null,docs],[paragraphs,null]
]) A.throws(()=>Q.pruefQuellen(p,v),/nicht-eindeutig/);
console.log("PASS fremde, fehlende und mehrdeutige Referenzen stoppen vor dem Pruefmodell");
const profile={committees:["Gesundheit"],deputyCommittees:["Finanzen"],focusTopics:["Pflege"]};
const prompt=Q.prompt(paragraphs,docs,profile);
const fields=Object.fromEntries(prompt.split("\n").filter(x=>/^(MANDAT|QUELLEN|ABSAETZE): /.test(x))
  .map(x=>[x.slice(0,x.indexOf(":")),JSON.parse(x.slice(x.indexOf(":")+2))]));
A.deepEqual(fields.QUELLEN,result);A.deepEqual(fields.ABSAETZE,paragraphs);
A.deepEqual(fields.MANDAT,Q.modellProfilKontext(profile));
A(prompt.includes("genau ein Urteil fuer jedes Paar"));A(prompt.includes(Q.ZEITREGEL));
A.deepEqual(Q.pruefQuellen([],[]),[]);
console.log("PASS gesamtes Mandat, alle Absaetze und Paar-/Zeitpruefung bleiben erhalten");
