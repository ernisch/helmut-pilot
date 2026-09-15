"use strict";
const A = require("node:assert/strict"), Q = require("../lib/helmut/lage-textqualitaet"),
  ai = require("../lib/helmut/ai"), B = require("../lib/helmut/briefing-speicher");
const p = { committees: ["Testausschuss 2", "Auswärtiger Ausschuss"],
  deputyCommittees: ["Haushaltsausschuss", "Testausschuss 7"],
  focusTopics: ["Testthema 15", "Pflege", "Testthema 7"], constituency: "Testwahlkreis 075",
  party: "Testpartei C", faction: "Testfraktion 3", state: "Testregion 2",
  topicPriorities: { "Testthema 15": 3, Pflege: 5 } };
const before = structuredClone(p), hash = B.profilHash(p), ctx = Q.profilKontext(p);
const m = Q.modellProfilKontext(p);
A.deepEqual(m.ausschuesse, ["Auswärtiger Ausschuss"]);
A.deepEqual(m.stellvertretende_ausschuesse, ["Haushaltsausschuss"]);
A.deepEqual(m.schwerpunkte, ["Pflege"]); A.deepEqual(m.themengewichte, { Pflege: 5 });
for (const k of ["wahlkreis", "partei", "fraktion", "bundesland"]) A.equal(m[k], null);
for (const text of [ai.buildLageBriefingPrompt([], p), Q.prompt([], [], p)])
  for (const value of ["Testthema 15", "Testthema 7", "Testausschuss 2", "Testwahlkreis 075", "Testpartei C"])
    A(!text.includes(value), value + " wird nicht angeboten");
for (const [feld, wert] of [["schwerpunkt","Testthema 15"],["ausschuss","Testausschuss 2"],
  ["wahlkreis","Testwahlkreis 075"],["partei","Testpartei C"]]) A.equal(Q.mandatsbezugGueltig({feld,wert},p),false);
A(Q.mandatsbezugGueltig({feld:"ausschuss",wert:"Auswärtiger Ausschuss"},p));
A(Q.mandatsbezugGueltig({feld:"schwerpunkt",wert:"Pflege"},p));
A.deepEqual(p,before); A.equal(B.profilHash(p),hash); A.deepEqual(Q.profilKontext(p),ctx);
const real = { committees:["Petitionsausschuss"], focusTopics:["Testverfahren in der Medizin","Artikel 15"],
 party:"Die Linke", constituency:"Berlin Mitte", state:"Berlin" };
A.deepEqual(Q.modellProfilKontext(real),Q.profilKontext(real));
console.log("8/8 Gruppen: Modellkontext, Nebenpfad, Validator, reale Werte und historische Hashes erhalten");
