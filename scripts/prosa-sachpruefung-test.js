"use strict";

// Gezielte Abnahme der unabhaengigen konservativen Offline-Gegenpruefung.
// Kein Modell, kein NLI, kein Netz, keine Productiondaten. Die Gegenpruefung
// versteht freie Sprache nicht; geprueft wird, ob ein Sachurteil durch
// strukturierte Angaben ueberhaupt zulaessig ist.
const A = require("node:assert/strict");
const F = require("node:fs");
const S = require("../lib/helmut/prosa-sachpruefung");
const SOLL = require("./fixtures/prosa-praemissen");

let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }

const QUELLE = { id: "q1", text: "Der Stadtrat beschließt einen Zuschuss von 20 Euro für Busfahrkarten." };
const PROFIL = { id: "p1", text: "Stellvertretendes Mitglied im Verkehrsausschuss." };
function fall(id = "f", einordnung = "Ein Satz.") {
  return { id, quellen: [{ ...QUELLE }], profil: [{ ...PROFIL }],
    mandatsbezug: "ausschuss / Verkehrsausschuss", einordnung };
}
function getragen(satz = 0) {
  return { satz, art: "sachangabe", modalitaet: "beschlossen", entscheidungsstand: "beschlossen",
    beschlusstermin: "2026-09-14",
    belege: [{ referenz: "q1", zitat: "Der Stadtrat beschließt" }],
    interpretationHerkunft: "redaktion", freigabe: "geprueft" };
}

// ── Regelabnahme mit allgemeinen strukturierten Fakten ───────────────────────
test("REGEL 1/2: ohne strukturierte Fakten ist das Ergebnis offen, nie widersprochen", () => {
  const r = S.beurteile(fall());
  A.equal(r.urteil, "offen");
  A(r.saetze.every(s => s.befund === "offen"));
  A(r.fehlendeFelder.includes("faktenzeile"));
});

test("REGEL 2: Widerspruch braucht einen vorhandenen gebundenen Gegensatz", () => {
  const r = S.beurteile(fall(), [getragen()]);
  A.equal(r.urteil, "tragfaehig");
  // Ein blosses Fehlen von fakten oder ein loses "widerspruch"-Feld ohne Beleg ist nie widersprochen.
  const loses = S.beurteile(fall(), [{ satz: 0, art: "sachangabe", widerspruch: { gegenReferenz: "q1", gegenZitat: "nicht enthalten" } }]);
  A.equal(loses.urteil, "offen");
  A(loses.fehlendeFelder.includes("widerspruchsbeleg"));
  // Ein gebundener Gegensatz ergibt widersprochen.
  const belegt = S.beurteile(fall(), [{ satz: 0, art: "sachangabe",
    widerspruch: { gegenReferenz: "q1", gegenZitat: "beschließt" } }]);
  A.equal(belegt.urteil, "widersprochen");
});

test("REGEL 3: Befugnis nur getragen mit konkreter gelieferter Grundlage", () => {
  const ohne = S.beurteile(fall(), [{ ...getragen(), art: "befugnis" }]);
  A.equal(ohne.urteil, "offen");
  A(ohne.fehlendeFelder.includes("befugnisGrundlage"));
  const mit = S.beurteile(fall(), [{ ...getragen(), art: "befugnis", befugnisGrundlage: "p1" }]);
  A.equal(mit.urteil, "tragfaehig");
});

test("REGEL 4: Fachbezug braucht konkreten belegten Profilbezug", () => {
  const r = S.beurteile(fall(), [{ ...getragen(), art: "fachbezug", profilbezug: { relation: "Ausschuss", getragen: false } }]);
  A.equal(r.urteil, "offen");
  A(r.fehlendeFelder.includes("profilbezug"));
  const ok = S.beurteile(fall(), [{ ...getragen(), art: "fachbezug", profilbezug: { relation: "Beratung", getragen: true } }]);
  A.equal(ok.urteil, "tragfaehig");
});

test("REGEL 5: Vorschlag ist keine Tatsache, seine Voraussetzungen bleiben belegpflichtig", () => {
  const rein = S.beurteile(fall(), [{ satz: 0, art: "vorschlag", voraussetzungen: [] }]);
  A.equal(rein.urteil, "tragfaehig");
  A.equal(rein.saetze[0].befund, "keineTatsachenbehauptung");
  const ungedeckt = S.beurteile(fall(), [{ satz: 0, art: "vorschlag",
    voraussetzungen: [{ satz: 0, art: "sachangabe" }] }]);
  A.equal(ungedeckt.urteil, "offen");
  const gedeckt = S.beurteile(fall(), [{ satz: 0, art: "vorschlag", voraussetzungen: [getragen()] }]);
  A.equal(gedeckt.urteil, "tragfaehig");
  const gegenteil = S.beurteile(fall(), [{ satz: 0, art: "vorschlag",
    voraussetzungen: [{ satz: 0, art: "sachangabe", widerspruch: { gegenReferenz: "q1", gegenZitat: "beschließt" } }] }]);
  A.equal(gegenteil.urteil, "widersprochen");
});

test("REGEL 6: fehlende oder untypisierte Modalitaet ist offen", () => {
  const r = S.beurteile(fall(), [{ satz: 0, art: "sachangabe", modalitaet: "bald",
    entscheidungsstand: "beschlossen", beschlusstermin: "2026-09-14",
    belege: [{ referenz: "q1", zitat: "Der Stadtrat beschließt" }],
    interpretationHerkunft: "redaktion", freigabe: "geprueft" }]);
  A.equal(r.urteil, "offen");
  A(r.fehlendeFelder.includes("modalitaet"));
});

test("REGEL 7: Umsetzungstermin beweist keinen Beschlusstermin", () => {
  const nurUmsetzung = S.beurteile(fall(), [{ ...getragen(), beschlusstermin: null }]);
  A.equal(nurUmsetzung.urteil, "offen");
  A(nurUmsetzung.fehlendeFelder.includes("beschlusstermin"));
  const entscheidungFehlt = S.beurteile(fall(), [{ ...getragen(), entscheidungsstand: "offen" }]);
  A.equal(entscheidungFehlt.urteil, "offen");
});

test("REGEL 8: Zitat/Beleg allein beweist keine Bedeutung", () => {
  const ohneBedeutung = S.beurteile(fall(), [{ ...getragen(), interpretationHerkunft: null }]);
  A.equal(ohneBedeutung.urteil, "offen");
  A(ohneBedeutung.fehlendeFelder.includes("interpretationHerkunft"));
  const ohneFreigabe = S.beurteile(fall(), [{ ...getragen(), freigabe: null }]);
  A.equal(ohneFreigabe.urteil, "offen");
  const ohneBeleg = S.beurteile(fall(), [{ ...getragen(), belege: [] }]);
  A.equal(ohneBeleg.urteil, "offen");
});

test("keine Fallkennung und kein Beispielsatz entscheidet das Urteil", () => {
  const fakten = [getragen()];
  // Gleiche Fakten, andere Kennung, anderer Text -> gleiches Urteil.
  const a = S.beurteile(fall("fremd-1", "Ganz anderer Satzinhalt."), fakten);
  const b = S.beurteile(fall("fremd-2", "Noch ein voellig anderer Satz."), fakten);
  A.equal(a.urteil, "tragfaehig");
  A.deepEqual(a.urteil, b.urteil);
  // Der Modulquelltext kennt keine der 18 Sollfall-Kennungen.
  const src = F.readFileSync(require.resolve("../lib/helmut/prosa-sachpruefung"), "utf8");
  for (const r of SOLL.corpus()) A.equal(src.includes(r.eingabe.id), false);
});

// ── Vollstaendige Bilanz aller 18 vorhandenen Sollfaelle ─────────────────────
test("alle 18 Sollfaelle sind unveraendert vorhanden", () => {
  const c = SOLL.corpus();
  A.equal(c.length, 18);
  A.equal(new Set(c.map(x => x.eingabe.id)).size, 18);
  for (const k of new Set(c.map(x => x.klasse)))
    A.deepEqual(c.filter(x => x.klasse === k).map(x => x.art).sort(),
      ["negativ", "positiv", "unklar"].sort());
});

function bilanz() {
  const zeilen = SOLL.corpus().map(r => {
    const erhalten = S.beurteile(r.eingabe).urteil;
    return { klasse: r.klasse, art: r.art, erwartet: r.erwartet, erhalten,
      korrekt: erhalten === r.erwartet,
      falschPositiv: erhalten === "tragfaehig" && r.erwartet !== "tragfaehig",
      falschNegativ: erhalten === "widersprochen" && r.erwartet !== "widersprochen",
      offenNichtEntscheidbar: erhalten === "offen" && r.erwartet !== "offen" };
  });
  const sum = f => zeilen.filter(f).length;
  const klassen = [...new Set(zeilen.map(x => x.klasse))].map(k => {
    const z = zeilen.filter(x => x.klasse === k);
    return { klasse: k, gesamt: z.length, korrekt: sum(x => x.klasse === k && x.korrekt),
      falschPositiv: sum(x => x.klasse === k && x.falschPositiv),
      falschNegativ: sum(x => x.klasse === k && x.falschNegativ),
      offenNichtEntscheidbar: sum(x => x.klasse === k && x.offenNichtEntscheidbar) };
  });
  return { zeilen, klassen,
    gesamt: zeilen.length, korrekt: sum(x => x.korrekt), falschPositiv: sum(x => x.falschPositiv),
    falschNegativ: sum(x => x.falschNegativ), offenNichtEntscheidbar: sum(x => x.offenNichtEntscheidbar) };
}

test("konservative Gegenpruefung erzeugt kein falsches Positiv- und kein falsches Negativurteil", () => {
  const b = bilanz();
  A.equal(b.falschPositiv, 0);
  A.equal(b.falschNegativ, 0);
  A.equal(b.korrekt, 6);
  A.equal(b.offenNichtEntscheidbar, 12);
});

console.log("BILANZ");
for (const k of bilanz().klassen)
  console.log(`  ${k.klasse}: ${k.korrekt} korrekt, ${k.falschPositiv} falschPositiv, ${k.falschNegativ} falschNegativ, ${k.offenNichtEntscheidbar} offen`);
const g = bilanz();
console.log(`  GESAMT ${g.gesamt}: ${g.korrekt} korrekt, ${g.falschPositiv} falschPositiv, ${g.falschNegativ} falschNegativ, ${g.offenNichtEntscheidbar} offen/nicht entscheidbar`);

console.log(`${count}/${count} Sachpruefung-Tests bestanden; keine Modellabnahme, keine Productionwirkung.`);
