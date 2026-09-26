"use strict";

// Echte Eingabemuster mit synthetischen Kennungen. Die Fachlabels werden vor
// jedem Aufruf entfernt; weder die Gruppierung noch der Resolver kennt sie.
const assert = require("node:assert/strict");
const V = require("../lib/helmut/vorgang-identity");
const fixture = require("./fixtures/vorgangs-ereignisse-20260920.json");
const topics = new Map(fixture.documents.map(d => [d.id, d.expectedTopic]));
const docs = fixture.documents.map(({ expectedTopic, ...d }) => d);
let count = 0, failed = 0;
function test(name, fn) {
  count += 1;
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { failed += 1; console.error(`FAIL ${name}: ${e.message}`); }
}
const gruppen = input => V.clusterRawDocuments(input);
const signatur = input => gruppen(input).map(c => c.documents.map(d => d.id).sort().join("+")).sort();
const dokument = (id, title, summary = "") => ({ id, title, summary, published_at: "2026-09-19T12:00:00Z" });

test("kein Vorgang vermischt fachfremde Themen im gesamten 31er Eingang", () => {
  const g = gruppen(docs);
  for (const c of g) assert.equal(new Set(c.documents.map(d => topics.get(d.id))).size, 1,
    c.documents.map(d => `${d.id}:${topics.get(d.id)}`).join(","));
  assert.deepEqual(g.flatMap(c => c.documents.map(d => d.id)).sort(), docs.map(d => d.id).sort());
});
for (const ids of [[1,2,27,28],[3,16,17],[4,5,30],[6,19],[9,26],[10,20],[12,22],[13,23]]) {
  test(`richtige Fortsetzungen bleiben auch im gemischten Eingang zusammen: ${ids.join(",")}`, () => {
    const gesucht = ids.map(i => docs[i].id);
    assert.ok(gruppen(docs).some(c => gesucht.every(id => c.documents.some(d => d.id === id))));
  });
}
test("Rueckwaertsfolge und 20 reproduzierbare Permutationen aendern keine Gruppe", () => {
  const expected = signatur(docs);
  assert.deepEqual(signatur(docs.slice().reverse()), expected);
  let state = 1709;
  for (let run = 0; run < 20; run += 1) {
    const input = docs.slice();
    for (let i = input.length - 1; i > 0; i -= 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const j = state % (i + 1); [input[i], input[j]] = [input[j], input[i]];
    }
    assert.deepEqual(signatur(input), expected);
  }
});
test("fremde bestehende Vorgaenge bleiben fuer alle 31 Meldungen gesperrt", () => {
  const groups = [...new Set(topics.values())].map(topic => ({ documents: docs.filter(d => topics.get(d.id) === topic) }));
  for (const neu of docs) for (const alt of groups) {
    if (alt.documents.some(d => topics.get(d.id) === topics.get(neu.id))) continue;
    assert.equal(V.sameVorgang({ documents: [neu] }, alt).gleich, false,
      `${neu.id} -> ${alt.documents.map(d => d.id).join(",")}`);
  }
});
test("richtige Bestandsfortsetzungen bleiben in beiden Richtungen moeglich", () => {
  for (const [a,b] of [[3,16],[4,5],[6,19],[9,26],[10,20],[12,22],[13,23]]) {
    assert.equal(V.sameVorgang({ documents: [docs[a]] }, { documents: [docs[b]] }).gleich, true, `${a}->${b}`);
    assert.equal(V.sameVorgang({ documents: [docs[b]] }, { documents: [docs[a]] }).gleich, true, `${b}->${a}`);
  }
});
test("gemeinsame Hintergrundsaetze verbinden unterschiedliche Hauptmeldungen nicht", () => {
  const background = "Zum Hintergrund: Im Grenzverfahren bleibt die Exportkontrolle unveraendert.";
  const a = dokument("museum", "Kunstmuseum eroeffnet neue Sammlung", background);
  const b = dokument("hafen", "Hafenstreik in Kuestenstadt beendet", background);
  assert.equal(V.docsShareEvent(a,b).gleich, false);
  assert.equal(V.docsShareEvent(b,a).gleich, false);
  assert.equal(V.sameVorgang({ documents:[a] }, { documents:[b] }).gleich, false);
  const fortsetzung = dokument("sammlung", "Neue Sammlung im Kunstmuseum oeffnet", background);
  assert.equal(V.docsShareEvent(a,fortsetzung).gleich, true);
  assert.equal(V.sameVorgang({ documents:[fortsetzung] }, { documents:[a] }).gleich, true);
});
test("Amt und Person verbinden weder Gebuehrenreform noch Krankenhausbau", () => {
  const a = dokument("gebuehr", "Praesident Sommer verkuendet Gebuehrenreform");
  const b = dokument("klinik", "Praesident Sommer besucht Krankenhausbau");
  assert.equal(V.docsShareEvent(a,b).gleich, false);
  assert.equal(V.sameVorgang({ documents:[a] }, { documents:[b] }).gleich, false);
  const c = dokument("gebuehr2", "Praesident Sommer erlaeutert Gebuehrenreform");
  assert.equal(V.docsShareEvent(a,c).gleich, true);
  assert.equal(V.sameVorgang({ documents:[a] }, { documents:[c] }).gleich, true);
});
test("eine kernlose Kette ist kein gemeinsames Ereignis, kein Dokument geht verloren", () => {
  const woerter = ["Abwasserreinigung", "Kuestenbahnhof", "Solarnetzplanung", "Hafenlogistik", "Dorfmedizinplanung", "Wasserstoffanlage", "Grenztarifordnung"];
  const input = woerter.slice(1).map((w,i) => dokument(`kette-${i}`, `${woerter[i]} ${w}`));
  assert.deepEqual(V.coreAnchors(input.map(V.docAnchors)), []);
  const groups = gruppen(input);
  assert.ok(groups.length >= 3);
  assert.deepEqual(groups.flatMap(g => g.documents.map(d => d.id)).sort(), input.map(d => d.id).sort());
  for (const g of groups) for (const a of g.documents) for (const b of g.documents) {
    if (a !== b) assert.equal(V.docsShareEvent(a,b).gleich, true);
  }
  assert.deepEqual(signatur(input), signatur(input.slice().reverse()));
});
test("derselbe Beschlussakt oder ein zusammengesetztes Amt ersetzt keinen Sachgegenstand", () => {
  for (const [a,b,c] of [
    ["Bundestag beschließt Gesundheitsreform", "Bundestag beschließt Verkehrssubvention", "Bundestag erlaeutert Gesundheitsreform"],
    ["Bundespraesident Sommer eroeffnet Technikausstellung", "Bundespraesident Sommer besucht Krankenhausbau", "Bundespraesident Sommer besucht Technikausstellung"],
    ["Weißes Haus stellt Gesundheitsreform vor", "Weißes Haus stellt Verkehrssubvention vor", "Weißes Haus erlaeutert Gesundheitsreform"]
  ]) {
    const links = dokument("links",a), fremd = dokument("fremd",b), folge = dokument("folge",c);
    assert.equal(V.docsShareEvent(links,fremd).gleich, false, a);
    assert.equal(V.sameVorgang({ documents:[links] }, { documents:[fremd] }).gleich, false, a);
    assert.equal(V.docsShareEvent(links,folge).gleich, true, a);
    assert.equal(V.sameVorgang({ documents:[links] }, { documents:[folge] }).gleich, true, a);
  }
  const wahl = dokument("wahl", "Bundespraesidentenwahl in Hauptstadt");
  assert.equal(V.docsShareEvent(wahl, dokument("wahl2", "Bundespraesidentenwahl beginnt")).gleich, true);
});
test("ein passender Begleiter darf keinen fremden Text in den Bestand einschleusen", () => {
  const a = dokument("a", "Kuestenbahnhof Grenzverfahren beschlossen");
  const b = dokument("b", "Kuestenbahnhof Grenzverfahren fortgesetzt");
  const c = dokument("c", "Kunstmuseum neue Sammlung", "Kuestenbahnhof Grenzverfahren im Hintergrund.");
  assert.equal(V.sameVorgang({ documents:[b] }, { documents:[a] }).gleich, true);
  assert.equal(V.sameVorgang({ documents:[b,c] }, { documents:[a] }).gleich, false);
});
test("starker Gremienanker umgeht den direkten Ereignisvergleich nicht", () => {
  const alt = [dokument("rat-a", "Nationaler Sicherheitsrat warnt vor hybriden Angriffen Russlands"),
    dokument("rat-b", "Nationaler Sicherheitsrat beschliesst Massnahmen gegen hybride Angriffe Russlands")];
  const neu = { ...dokument("rat-neu", "UNO-Sicherheitsrat verurteilt Angriffe der Huthi-Miliz auf Saudi-Arabien"),
    published_at: "2026-09-25T12:00:00Z" };
  assert.equal(gruppen(alt).length, 1);
  assert.equal(V.sameVorgang({ documents:[neu] }, { documents:alt }).gleich, false);
  const fortsetzung = { ...alt[1], id:"rat-folge", published_at:neu.published_at };
  assert.equal(V.sameVorgang({ documents:[fortsetzung] }, { documents:alt }).gleich, true);
});
test("ein vermischter Altbestand nimmt auch passende neue Begleiter nicht auf", () => {
  const sport = dokument("sport", "Basketballerinnen gewinnen das Halbfinale");
  const bahn = dokument("bahn", "Sabotage bei Zugentgleisung in der Normandie");
  const papst = dokument("papst", "Papst haelt Andacht in Paris");
  for (const neu of [papst, {...sport,id:"sport-folge"}]) {
    const alt = [sport,bahn];
    assert.equal(gruppen(alt).length, 2);
    const r = V.sameVorgang({documents:[neu]}, {documents:alt});
    assert.equal(r.gleich, false); assert.equal(r.grund, "bestand-mehrere-ereignisse");
    assert.equal(V.sameVorgang({documents:[neu]}, {documents:alt.reverse()}).gleich, false);
  }
  assert.equal(V.sameVorgang({documents:[{...sport,id:"sport-folge"}]}, {documents:[sport]}).gleich, true);
});
test("gemeinsame Ortsnamen aus verschiedenen Altquellen ersetzen keine Fortsetzung", () => {
  const alt = [dokument("sport", "Basketballerinnen unterliegen Frankreich", "Olympiazweiter aus Paris gewinnt das Halbfinale."),
    dokument("bahn", "Frankreich: Sabotage bei Zugentgleisung in der Normandie", "Regionalzug in Nordwestfrankreich entgleist.")];
  const neu = { ...dokument("papst", "Frankreich-Besuch: Papst haelt Andacht in Paris"), published_at:"2026-09-25T12:00:00Z" };
  assert.equal(V.sameVorgang({documents:[neu]}, {documents:alt}).gleich, false);
});
console.log(`${count-failed}/${count} Gruppen erfolgreich`);
process.exitCode = failed ? 1 : 0;
