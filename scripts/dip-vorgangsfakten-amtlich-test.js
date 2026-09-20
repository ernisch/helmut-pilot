"use strict";
// Amtliche Aufnahme durch den echten Leser, ausschliesslich Transport ersetzt.
// Gegenstand bleibt der Eingangsvertrag, nicht Briefing oder Lage.
const assert = require("node:assert/strict");
const { lese } = require("../lib/helmut/dip-vorgangsfakten");
const fixture = require("./fixtures/dip-vorgangsfakten-amtlich.json");
const orig = global.fetch, key = process.env.DIP_API_KEY;
async function main() {
  assert.equal(process.env.HELMUT_LOKALER_SCHUTZ,"aktiv");
  process.env.DIP_API_KEY = "offline-fixture";
  global.fetch = async url => {
    const id = new URL(url).pathname.split("/").pop();
    const p = fixture.documents.find(d => d.id === id); assert(p);
    return new Response(JSON.stringify(p),{ headers:{"content-type":"application/json"} });
  };
  const r = await lese({ positionIds:fixture.documents.map(d => d.id),tag:"2026-09-20" });
  assert.equal(r.fakten.length,11);
  const text = id => r.fakten.filter(f => f.quelleId === "dip-position-"+id).map(f => f.formulierungen.ereignis);
  assert.equal(text("699175").length,6);
  assert(text("699175")[0].includes('"Überweisung" zur Vorlage "21/7860"'));
  assert.equal(text("699175").filter(t => t.includes("mit Federführung")).length,1);
  assert.equal(text("699175").filter(t => t.includes("ohne Federführung")).length,4);
  console.log("PASS Haushaltsbegleitgesetz: eine Ueberweisung, fuenf Ausschuesse, eine Federfuehrung");
  assert(text("699347")[0].includes('"Überweisung" zur Vorlage "21/6133, 21/6668"'));
  assert(text("699347")[1].includes('Überweisungsart: "nachträgliche Überweisung"'));
  console.log("PASS Umweltstrafrecht: mehrere Vorlagen und nachtraegliche Ueberweisung bleiben erhalten");
  assert(text("699348")[1].includes('an "Innenausschuss" ("InnenA"), ohne Federführung'));
  assert(text("699348")[1].includes('"Änderung der Ausschussüberweisung"'));
  console.log("PASS Notfallversorgung: geaenderte Ueberweisung ist kein Gesetzesvollzug");
  assert(text("699366")[0].includes('"Abgelehnt" zur Vorlage "21/5764"'));
  assert.equal(text("699366").length,1);
  assert.equal(r.vollstaendigeFaktenpruefung,false);
  console.log("PASS Verkehrsprojekt: Ablehnung statt beschlossener Priorisierung");
  console.log("4/4 amtliche Eingangsgruppen bestanden, 11 konkrete Angaben; keine produktive Fachabnahme.");
}
main().catch(e => { console.error(e); process.exitCode=1; }).finally(() => {
  global.fetch=orig; if (key === undefined) delete process.env.DIP_API_KEY; else process.env.DIP_API_KEY=key;
});
