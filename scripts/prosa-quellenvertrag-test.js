"use strict";
const A = require("node:assert/strict");
const Q = require("../lib/helmut/prosa-quellenpruefung");
const G = require("./prosa-quellenpruefung");
const source = { id: "rd-probe", title: "Ausschuss berät kommunale Finanzierung", summary:
  "Der Ausschuss berät am 24. September eine Förderung kommunaler Beratungsstellen. Ein Beschluss steht noch aus.",
  published_at: "2026-09-19T10:00:00Z" };
const answer = { id: "ko-probe", status: "neu", confidence_score: 50,
  headline: "Ausschuss berät kommunale Finanzierung", warum_wichtig: "Die geplante Förderung betrifft kommunale Beratungsstellen.",
  display_summary: "Ein Beschluss steht noch aus.", why_relevant: "Die Beratung betrifft die Finanzierung kommunaler Beratungsstellen.",
  risiken: ["Ein Ausfall der Förderung ist bereits sicher."], chancen: ["Die Förderung könnte Beratungsstellen unterstützen."],
  risk_of_no_action: "Das Mandat verliert andernfalls sicher Mittel.", opportunity_summary: "Die Förderung wird beraten.",
  recommended_communication: "Der Beschluss ist bereits umgesetzt.",
  recommended_communication_struct: { communicationLine: "Die Förderung wird beraten.", recommendedChannel: "internal",
    suggestedOutputs: ["Die noch offene Beratung erläutern."] },
  action_items: ["Die Beratung beobachten."], action_items_struct: [{ title: "Beratung beobachten",
    description: "Die Förderung ist noch nicht beschlossen.", dueHint: "Gesetzliche Pflicht bis morgen.", priority: "low" }],
  neuesFachfeld: "Die Förderung ist bereits ausgezahlt.", verschachtelt: { status: "Der Bund hat das Gesetz umgesetzt." } };
let pass = 0;
function test(name, fn) { fn(); pass++; console.log("PASS " + name); }
function verdict(input) {
  return { pruefungen: input.faelle.map(f => ({ fall: f.fall, urteile: f.aussagen.map(a => ({
    aussage: a.i, deckung: "belegt", quellen: [0], grund: "Synthetisches Kontrollurteil." })) })) };
}
test("Alle freien Schwesterfelder und unbekannte Fachfelder bleiben im Pruefauftrag", () => {
  const paths = new Set(Q.aussagen(answer).map(r => r.pfad));
  for (const p of ["/warum_wichtig", "/why_relevant", "/risiken/0", "/chancen/0", "/risk_of_no_action",
    "/recommended_communication", "/recommended_communication_struct/communicationLine",
    "/recommended_communication_struct/suggestedOutputs/0", "/action_items/0", "/action_items_struct/0/title",
    "/action_items_struct/0/description", "/action_items_struct/0/dueHint", "/neuesFachfeld", "/verschachtelt/status"]) A(paths.has(p), p);
  A(!paths.has("/id")); A(!paths.has("/confidence_score")); A(!paths.has("/status"));
  A(!paths.has("/action_items_struct/0/priority"));
});
test("Originale bleiben unveraendert; Reihenfolge der Objektschluessel ist keine Sachabweichung", () => {
  const before = JSON.stringify({ source, answer });
  const input = Q.eingabe([{ id: "fall", documents: [source], answer }]);
  A.equal(JSON.stringify({ source, answer }), before);
  const reordered = Object.fromEntries(Object.entries(answer).reverse());
  A.deepEqual(Q.eingabe([{ id: "fall", documents: [source], answer: reordered }]), input);
  A.equal(input.faelle[0].quellen[0].auszug, source.summary);
});
test("Vollstaendiges positives Urteil behaelt Kontext; negatives Einzelurteil sperrt den betroffenen Fall", () => {
  const input = Q.eingabe([{ id: "fall", documents: [source], answer: { text: "Ein Beschluss steht noch aus." } }]);
  const yes = verdict(input), result = Q.pruefe(input, yes);
  A.equal(result.ok, true); A.equal(result.faelle[0].bereit, true);
  A.equal(result.faelle[0].aussagen[0].belege[0].auszug, source.summary);
  A.equal(result.vollstaendigeFaktenpruefung, false);
  yes.pruefungen[0].urteile[0].deckung = "unbelegt";
  A.equal(Q.pruefe(input, yes).faelle[0].bereit, false);
  A.equal(Q.pruefe(input, yes).ok, true); // technisch vollstaendig, fachlich abgelehnt
});
test("Geaenderter Kontext, fehlende oder doppelte Urteile und fremde Referenzen werden nicht gruen", () => {
  const input = Q.eingabe([{ id: "fall", documents: [source], answer: { text: "Ein Beschluss steht noch aus.", zusatz: "Die Beratung steht an." } }]);
  const changed = structuredClone(input); changed.faelle[0].quellen[0].auszug = "Andere Quelle.";
  A.equal(Q.pruefe(changed, verdict(input)).ok, false);
  const edits = [r => r.pruefungen.pop(), r => r.pruefungen.push(r.pruefungen[0]),
    r => r.pruefungen[0].fall = "fremd", r => r.pruefungen[0].urteile.pop(),
    r => r.pruefungen[0].urteile[1].aussage = 0,
    r => r.pruefungen[0].urteile[0].aussage = 999,
    r => r.pruefungen[0].urteile[0].quellen = [9],
    r => r.pruefungen[0].urteile[0].quellen = [],
    r => r.pruefungen[0].urteile[0].quellen = [0, 0],
    r => r.pruefungen[0].urteile[0].deckung = "vielleicht",
    r => r.pruefungen[0].urteile[0].grund = ""];
  for (const edit of edits) { const r = verdict(input); edit(r); A.equal(Q.pruefe(input, r).ok, false); }
});
test("Titel und ehrliche Beleggrenze bleiben pruefbar; Sollurteile sind keine Modelleingabe", () => {
  const input = Q.eingabe([{ id: "fall", documents: [{ ...source, summary: "" }], answer: { text: "Der Titel nennt keine beschlossene Förderung." } }]);
  const r = verdict(input); r.pruefungen[0].urteile[0].deckung = "beleggrenze";
  A.equal(Q.pruefe(input, r).faelle[0].bereit, true);
  for (const f of G.paket()) A(!f.prompt.includes('"expect"'));
});
test("Strukturelles Alles Gruen ersetzt keinen negativen Methodenbeleg; positiver Gegenfall darf nicht pauschal fallen", () => {
  for (const f of G.paket()) {
    const r = verdict(f.input);
    A.equal(G.methodenpruefung(f, r), false);
    for (const c of r.pruefungen) for (const u of c.urteile) {
      const a = f.input.faelle.find(x => x.fall === c.fall).aussagen[u.aussage];
      if (f.expect.rejected_paths[c.fall]?.includes(a.pfad)) u.deckung = "unbelegt";
    }
    A.equal(G.methodenpruefung(f, r), true);
    r.pruefungen.find(c => f.expect.accept.includes(c.fall)).urteile[0].deckung = "unbelegt";
    A.equal(G.methodenpruefung(f, r), false);
  }
});
console.log(`${pass}/${pass} Quellenvertragsgruppen bestanden; keine semantische Modellabnahme behauptet.`);
