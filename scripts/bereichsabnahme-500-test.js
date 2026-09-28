"use strict";

// Rein lokaler Test des 500er Bereichsabnahme-Aggregators. Kein Modellaufruf,
// kein Netz, keine DB, keine Production. Alle Eingaben sind synthetisch.
const A = require("node:assert/strict");
const B = require("../lib/helmut/bereichsabnahme-500");
const P = require("../lib/helmut/briefing-bereichspruefung");
const { hash } = require("../lib/helmut/briefing-speicher");

const PAARE = B.PAARE;
const ids = Array.from({ length: 500 }, (_, i) => "profil-" + String(i + 1).padStart(3, "0"));
const h = label => hash(["synthetisch", label]);

function texte(id, marke = "basis") {
  return {
    briefing: `Heute fuer ${id} die ${marke} Stellungnahme im Buero vorbereiten.`,
    lage: `Der Ausschuss fuer ${id} berichtet zur ${marke} Finanzierung der kommunalen Schulen.`,
    radar: `Die ${marke} Anhoerung fuer ${id} ist fuer den kommenden Dienstag angekuendigt.`,
  };
}

function eingabe(id, {
  marke = "basis",
  rendererHash = h("renderer/" + id),
  profilHash = h("profil/" + id),
  datenHash = h("daten/" + id),
  tag = "2026-09-29",
  commit = "a".repeat(40),
  fachinhalt = null,
} = {}) {
  return P.binde({
    mandat: id,
    tag,
    rendererCommit: commit,
    rendererHash,
    profilHash,
    datenHash,
    fachinhalt: fachinhalt || { briefing: true, lage: true, radar: true },
    html: Object.fromEntries(Object.entries(texte(id, marke))
      .map(([bereich, text]) => [bereich, `<p>${text}</p>`])),
  });
}

function antwort(eingabeWert, status = "getrennt") {
  return {
    version: P.VERSION,
    eingabeHash: eingabeWert.eingabeHash,
    vergleiche: PAARE.map((paar, index) => {
      const [links, rechts] = paar.split("/");
      return {
        paar,
        urteil: Array.isArray(status) ? status[index] : status,
        begruendung: `Synthetisches Sollurteil fuer ${paar}: eigenstaendige Funktionen bleiben getrennt.`,
        belege: [{
          links: eingabeWert.ansichten[links].text,
          rechts: eingabeWert.ansichten[rechts].text,
          einordnung: "Synthetische Belegzuordnung ohne Modelllauf und ohne automatische Bedeutungspruefung.",
        }],
      };
    }),
  };
}

// Realistische validierte Einzelpruefer-Ausgabe: binde() + pruefe(), niemals
// eine rohe Modellantwort oder ein rohes Paarobjekt.
function paket(id, optionen = {}) {
  const { status = "getrennt", ...eingabeOptionen } = optionen;
  const e = eingabe(id, eingabeOptionen);
  return { profilId: id, eingabe: e, urteil: P.pruefe(e, antwort(e, status)) };
}

const BASIS = ids.map(id => paket(id));
const ERWARTET = BASIS.map((p, index) => ({
  profilId: ids[index],
  eingabeHash: p.eingabe.eingabeHash,
  rendererHash: p.eingabe.rendererHash,
}));
const komplett = () => ({
  erwartet: structuredClone(ERWARTET),
  erhalten: structuredClone(BASIS),
});

// Summensemantik der disjunkten Paarbilanz: erwartet ist die Summe aller sieben
// Kategorien (inkl. hashgedriftet) und erhalten sind genau die auswertbaren
// erwarteten Paarschluessel.
function assertPaarSumme(r) {
  const p = r.paarZaehlungen;
  A.equal(B.PAAR_KATEGORIEN.includes("hashgedriftet"), true,
    "hashgedriftet ist eine disjunkte erwartete Paarkategorie");
  A.equal(B.PAAR_KATEGORIEN.reduce((summe, k) => summe + p[k], 0), p.erwartet,
    "Paarkategorien decken erwartet disjunkt ab (inkl. hashgedriftet)");
  A.equal(p.positiv + p.negativ + p.leer, p.erhalten,
    "erhalten = auswertbare erwartete Paarschluessel");
  A.equal(p.summeStimmt, true);
}

function paketMitDoppelPaar(id, reihenfolge) {
  const basis = paket(id);
  const urteil = structuredClone(basis.urteil);
  const original = urteil.vergleiche[0];
  urteil.vergleiche = [
    { ...original, urteil: reihenfolge[0] },
    { ...urteil.vergleiche[1] },
    { ...urteil.vergleiche[2] },
    { ...original, urteil: reihenfolge[1] },
  ];
  return { profilId: id, eingabe: basis.eingabe, urteil };
}

let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS " + name); }

test("Vollstaendig: exakt 500 erwartete Profile, alle drei Paare positiv", () => {
  const r = B.aggregiere(komplett());
  A.equal(r.status, "bestanden");
  A.equal(r.grund, null);
  A.equal(r.zaehlungen.erwartet, 500);
  A.equal(r.zaehlungen.erhalten, 500);
  A.equal(r.zaehlungen.positiv, 500);
  for (const k of ["negativ", "fehlend", "dupliziert", "hashgedriftet", "unerwartet",
    "leerzustaende", "fehlendePaare", "unerwartetePaare", "dupliziertePaare",
    "ungueltigeUrteile", "eingabeDrift", "rendererDrift"]) A.equal(r.zaehlungen[k], 0, k);
  A.equal(r.zaehlungen.neuberechnet, undefined);
  A.equal(r.paarZaehlungen.erwartet, 1500);
  A.equal(r.paarZaehlungen.erhalten, 1500);
  A.equal(r.paarZaehlungen.positiv, 1500);
  for (const k of ["negativ", "leer", "fehlend", "dupliziert", "unerwartet",
    "ungueltig", "hashgedriftet"]) A.equal(r.paarZaehlungen[k], 0, k);
  A.equal(r.paarZaehlungen.summeStimmt, true);
  A.equal(r.paarPositiv.length, 1500);
  assertPaarSumme(r);
  A.equal(r.profile.length, 500);
  A.equal(r.profile.every(p => p.bewertet && p.einzelurteilValidiert && p.positiv), true);
  A.equal(r.keineStichprobe, true);
  A.equal(r.modellaufrufe, 0);
  A.equal(r.neueFachbewertung, false);
  A.equal(r.fachlicheFreigabe, false);
  A.equal(r.funktionsnachweis500, false);
});

test("Profil fehlt: getrennt gezaehlt und fail-closed", () => {
  const e = komplett(); e.erhalten.pop();
  const r = B.aggregiere(e);
  A.equal(r.status, "nicht-bestanden");
  A.deepEqual(r.fehlend, [ids[499]]);
  A.equal(r.zaehlungen.fehlend, 1);
  A.equal(r.zaehlungen.erhalten, 499);
  A.equal(r.zaehlungen.positiv, 499);
  A.equal(r.paarZaehlungen.positiv, 1497);
  A.equal(r.paarZaehlungen.fehlend, 3);
  assertPaarSumme(r);
  A.equal(r.profile.find(p => p.profilId === ids[499]).vorhanden, false);
});

test("Paar fehlt: je Profil werden die drei Bereichspaare vollstaendig bilanziert", () => {
  const e = komplett(); e.erhalten[0].urteil.vergleiche.pop();
  const r = B.aggregiere(e);
  A.equal(r.status, "nicht-bestanden");
  A.deepEqual(r.fehlendePaare, [{ profilId: ids[0], paar: "lage/radar" }]);
  A.equal(r.zaehlungen.fehlendePaare, 1);
  A.equal(r.paarZaehlungen.erwartet, 1500);
  A.equal(r.paarZaehlungen.erhalten, 1499);
  A.equal(r.paarZaehlungen.positiv, 1499);
  A.equal(r.paarZaehlungen.fehlend, 1);
  A.deepEqual(r.paarFehlend, [{ profilId: ids[0], paar: "lage/radar" }]);
  assertPaarSumme(r);
  A.equal(r.profile.find(p => p.profilId === ids[0]).positiv, false);
});

test("Negatives validiertes Urteil sperrt", () => {
  for (const urteil of ["wiederholung", "unklar"]) {
    const e = komplett();
    e.erhalten[0] = paket(ids[0], { status: [urteil, "getrennt", "getrennt"] });
    const r = B.aggregiere(e);
    A.equal(r.status, "nicht-bestanden");
    A.deepEqual(r.negativ, [ids[0]]);
    A.equal(r.zaehlungen.negativ, 1);
    A.equal(r.zaehlungen.positiv, 499);
    A.equal(r.paarZaehlungen.positiv, 1499);
    A.equal(r.paarZaehlungen.negativ, 1);
    A.equal(r.paarNegativ.length, 1);
    A.deepEqual(r.paarNegativ, [{ profilId: ids[0], paar: "briefing/lage", urteil }]);
    // Konsistentes negatives Einzelurteil bleibt ein bewertetes, valides Urteil.
    const profil = r.profile.find(p => p.profilId === ids[0]);
    A.equal(profil.bewertet, true, "konsistentes negatives Urteil gilt als bewertet");
    A.equal(profil.einzelurteilValidiert, true,
      "konsistentes negatives Urteil gilt als validiert");
    assertPaarSumme(r);
  }
});

test("Rohe Modellantwort oder rohes Paarobjekt zaehlt niemals positiv", () => {
  const e = komplett();
  const vorhandenes = e.erhalten[0];
  e.erhalten[0] = { profilId: ids[0], eingabe: vorhandenes.eingabe,
    urteil: antwort(vorhandenes.eingabe, "getrennt") };
  const r = B.aggregiere(e);
  A.equal(r.status, "nicht-bestanden");
  A.equal(r.zaehlungen.positiv, 499);
  A.deepEqual(r.ungueltigeUrteile, [{ profilId: ids[0], grund: "urteil-ungueltig" }]);
  A.equal(r.paarZaehlungen.positiv, 1497);
  A.equal(r.paarZaehlungen.ungueltig, 3);
  assertPaarSumme(r);

  const ohneBindung = komplett();
  ohneBindung.erhalten[0] = { profilId: ids[0],
    paare: PAARE.map(paar => ({ paar, urteil: "getrennt" })) };
  const r2 = B.aggregiere(ohneBindung);
  A.equal(r2.status, "nicht-bestanden");
  A.equal(r2.zaehlungen.positiv, 499);
  A.deepEqual(r2.ungueltigeUrteile, [{ profilId: ids[0], grund: "eingabe-ungueltig" }]);
  A.equal(r2.paarZaehlungen.positiv, 1497);
  A.equal(r2.paarZaehlungen.ungueltig, 3);
  assertPaarSumme(r2);
});

test("Eingabehash-Drift wird getrennt ausgewiesen", () => {
  const e = komplett(); e.erwartet[0].eingabeHash = h("eingabe/anders");
  const r = B.aggregiere(e);
  A.equal(r.status, "nicht-bestanden");
  A.deepEqual(r.eingabeDrift, [ids[0]]);
  A.deepEqual(r.rendererDrift, []);
  A.equal(r.zaehlungen.hashgedriftet, 1);
  // Die drei Paarplaetze des betroffenen Profils gehoeren zu einem anderen
  // erwarteten Stand und werden weder positiv, negativ noch leer gezaehlt.
  A.equal(r.zaehlungen.positiv, 499);
  A.equal(r.paarZaehlungen.positiv, 1497);
  A.equal(r.paarZaehlungen.hashgedriftet, 3);
  A.equal(r.paarZaehlungen.erhalten, 1497);
  A.equal(r.paarPositiv.length, 1497);
  A.deepEqual(r.paarHashgedriftet, PAARE.map(paar => ({
    profilId: ids[0], paar, grund: "eingabehash-drift" })));
  assertPaarSumme(r);
});

test("Rendererhash-Drift wird getrennt ausgewiesen", () => {
  const e = komplett(); e.erwartet[0].rendererHash = h("renderer/anders");
  const r = B.aggregiere(e);
  A.equal(r.status, "nicht-bestanden");
  A.deepEqual(r.rendererDrift, [ids[0]]);
  A.deepEqual(r.eingabeDrift, []);
  A.equal(r.zaehlungen.hashgedriftet, 1);
  A.equal(r.zaehlungen.positiv, 499);
  A.equal(r.paarZaehlungen.positiv, 1497);
  A.equal(r.paarZaehlungen.hashgedriftet, 3);
  A.equal(r.paarZaehlungen.erhalten, 1497);
  A.equal(r.paarPositiv.length, 1497);
  A.deepEqual(r.paarHashgedriftet, PAARE.map(paar => ({
    profilId: ids[0], paar, grund: "rendererhash-drift" })));
  assertPaarSumme(r);
});

test("Gegensaetzliche Profildoppelung sperrt in beiden Reihenfolgen identisch", () => {
  const positiv = paket(ids[0]);
  const negativ = paket(ids[0], { status: ["wiederholung", "getrennt", "getrennt"] });
  const a = komplett(); a.erhalten[0] = positiv; a.erhalten.push(negativ);
  const b = komplett(); b.erhalten[0] = negativ; b.erhalten.push(positiv);
  const ra = B.aggregiere(a), rb = B.aggregiere(b);
  A.equal(ra.status, "nicht-bestanden");
  A.equal(rb.status, "nicht-bestanden");
  A.deepEqual(ra, rb);
  A.equal(ra.ergebnisHash, rb.ergebnisHash);
  A.deepEqual(ra.dupliziert, [ids[0]]);
  A.deepEqual(ra.duplikate, [{ profilId: ids[0], anzahl: 2 }]);
  A.equal(ra.zaehlungen.positiv, 499);
  A.equal(ra.zaehlungen.negativ, 0);
  A.equal(ra.paarZaehlungen.positiv, 1497);
  A.equal(ra.paarZaehlungen.dupliziert, 3);
  assertPaarSumme(ra);
  A.equal(ra.profile.find(p => p.profilId === ids[0]).doppelt, true);
  A.equal(ra.profile.find(p => p.profilId === ids[0]).bewertet, false);
});

test("Profildoppelung mit einem driftenden Eintrag: dupliziert vor Hashdrift", () => {
  const basis = paket(ids[0]);
  const driftend = paket(ids[0], { rendererHash: h("renderer/driftend") });
  const a = komplett(); a.erhalten[0] = basis; a.erhalten.push(driftend);
  const b = komplett(); b.erhalten[0] = driftend; b.erhalten.push(basis);
  const ra = B.aggregiere(a), rb = B.aggregiere(b);
  A.equal(ra.status, "nicht-bestanden");
  A.equal(rb.status, "nicht-bestanden");
  A.deepEqual(ra, rb);
  A.equal(ra.ergebnisHash, rb.ergebnisHash);
  A.deepEqual(ra.dupliziert, [ids[0]]);
  A.deepEqual(ra.eingabeDrift, [ids[0]]);
  A.deepEqual(ra.rendererDrift, [ids[0]]);
  A.equal(ra.zaehlungen.hashgedriftet, 1);
  A.equal(ra.paarZaehlungen.positiv, 1497);
  A.equal(ra.paarZaehlungen.dupliziert, 3);
  A.equal(ra.paarZaehlungen.hashgedriftet, 0);
  A.deepEqual(ra.paarDupliziert, PAARE.map(paar => ({
    profilId: ids[0], paar, grund: "profil-doppelt", anzahl: 2 })));
  const profil = ra.profile.find(p => p.profilId === ids[0]);
  A.equal(profil.doppelt, true);
  A.equal(profil.eingabeHashDrift, true);
  A.equal(profil.rendererHashDrift, true);
  assertPaarSumme(ra);
});

test("Gegensaetzliche Paardoppelung sperrt in beiden Reihenfolgen identisch", () => {
  const a = komplett();
  a.erhalten[0] = paketMitDoppelPaar(ids[0], ["getrennt", "wiederholung"]);
  const b = komplett();
  b.erhalten[0] = paketMitDoppelPaar(ids[0], ["wiederholung", "getrennt"]);
  const ra = B.aggregiere(a), rb = B.aggregiere(b);
  A.equal(ra.status, "nicht-bestanden");
  A.equal(rb.status, "nicht-bestanden");
  A.deepEqual(ra, rb);
  A.equal(ra.ergebnisHash, rb.ergebnisHash);
  A.deepEqual(ra.dupliziertePaare, [{
    profilId: ids[0], paar: "briefing/lage", anzahl: 2,
    urteile: ["getrennt", "wiederholung"],
  }]);
  A.equal(ra.zaehlungen.dupliziertePaare, 1);
  A.equal(ra.zaehlungen.negativ, 0);
  A.equal(ra.zaehlungen.positiv, 499);
  A.equal(ra.paarZaehlungen.positiv, 1499);
  A.equal(ra.paarZaehlungen.dupliziert, 1);
  A.deepEqual(ra.paarDupliziert, [{ profilId: ids[0], paar: "briefing/lage",
    grund: "paar-doppelt", anzahl: 2, urteile: ["getrennt", "wiederholung"] }]);
  assertPaarSumme(ra);
  assertPaarSumme(rb);
});

test("Unerwartetes Profil sperrt", () => {
  const e = komplett(); e.erhalten.push(paket("fremd-1"));
  const r = B.aggregiere(e);
  A.equal(r.status, "nicht-bestanden");
  A.deepEqual(r.unerwartet, ["fremd-1"]);
  A.equal(r.zaehlungen.unerwartet, 1);
  A.equal(r.paarZaehlungen.positiv, 1500);
  A.equal(r.paarZaehlungen.unerwartet, 0);
  assertPaarSumme(r);
});

test("Unerwartetes Paar sperrt, fehlendes Originalpaar bleibt sichtbar", () => {
  const e = komplett();
  e.erhalten[0].urteil.vergleiche[0].paar = "briefing/lage-bogus";
  const r = B.aggregiere(e);
  A.equal(r.status, "nicht-bestanden");
  A.deepEqual(r.unerwartetePaare, [{
    profilId: ids[0], paar: "briefing/lage-bogus", anzahl: 1,
  }]);
  A.deepEqual(r.fehlendePaare, [{ profilId: ids[0], paar: "briefing/lage" }]);
  A.equal(r.zaehlungen.unerwartetePaare, 1);
  A.equal(r.zaehlungen.fehlendePaare, 1);
  A.equal(r.paarZaehlungen.positiv, 1499);
  A.equal(r.paarZaehlungen.fehlend, 1);
  A.equal(r.paarZaehlungen.unerwartet, 1);
  A.deepEqual(r.paarUnerwartet, [{ profilId: ids[0], paar: "briefing/lage-bogus",
    anzahl: 1 }]);
  assertPaarSumme(r);
});

test("Echter Leerzustand wird getrennt von negativem Urteil ausgewiesen", () => {
  const e = komplett();
  e.erhalten[0] = paket(ids[0], { status: ["getrennt", "getrennt", "leer"] });
  const r = B.aggregiere(e);
  A.equal(r.status, "nicht-bestanden");
  A.deepEqual(r.leerzustaende, [{ profilId: ids[0], paar: "lage/radar" }]);
  A.equal(r.zaehlungen.leerzustaende, 1);
  A.equal(r.zaehlungen.negativ, 0);
  A.equal(r.zaehlungen.positiv, 499);
  A.equal(r.paarZaehlungen.positiv, 1499);
  A.equal(r.paarZaehlungen.leer, 1);
  A.deepEqual(r.paarLeer, [{ profilId: ids[0], paar: "lage/radar" }]);
  // Konsistenter Leerzustand bleibt ein bewertetes, valides Urteil.
  const profil = r.profile.find(p => p.profilId === ids[0]);
  A.equal(profil.bewertet, true, "konsistenter Leerzustand gilt als bewertet");
  A.equal(profil.einzelurteilValidiert, true,
    "konsistenter Leerzustand gilt als validiert");
  assertPaarSumme(r);
});

test("Ungueltiges Paarurteil bleibt fail-closed und bilanziert alle drei Paarplaetze", () => {
  A.deepEqual(B.PAAR_KATEGORIEN,
    ["positiv", "negativ", "leer", "fehlend", "dupliziert", "ungueltig", "hashgedriftet"]);
  const e = komplett();
  const basis = paket(ids[0]);
  const urteil = structuredClone(basis.urteil);
  urteil.vergleiche[1] = { ...urteil.vergleiche[1], urteil: "voellig-ungueltig" };
  e.erhalten[0] = { profilId: ids[0], eingabe: basis.eingabe, urteil };
  const r = B.aggregiere(e);
  A.equal(r.status, "nicht-bestanden");
  A.deepEqual(r.ungueltigeUrteile, [{ profilId: ids[0], grund: "urteil-ungueltig" }]);
  A.equal(r.paarZaehlungen.erwartet, 1500);
  A.equal(r.paarZaehlungen.erhalten, 1497);
  A.equal(r.paarZaehlungen.positiv, 1497);
  A.equal(r.paarZaehlungen.ungueltig, 3);
  A.deepEqual(r.paarUngueltig, PAARE.map(paar => ({
    profilId: ids[0], paar, grund: "urteil-ungueltig" })));
  assertPaarSumme(r);
});

test("Widerspruechliche Summary sperrt das gesamte Einzelurteil (alle drei Paarplaetze ungueltig)", () => {
  // Inhaltlich positives Paket (alle drei Paare getrennt, fachinhalt alle true),
  // dessen Zusammenfassung aber "nicht bestanden" behauptet.
  const positivWiderspruch = () => {
    const basis = paket(ids[0]);
    const urteil = structuredClone(basis.urteil);
    Object.assign(urteil, { bereit: false, bereichstrennungBestanden: false,
      grund: "bereichstrennung-nicht-bestaetigt" });
    return { profilId: ids[0], eingabe: basis.eingabe, urteil };
  };
  const a = komplett(); a.erhalten[0] = positivWiderspruch();
  const ra = B.aggregiere(a);
  A.equal(ra.status, "nicht-bestanden");
  A.equal(ra.zaehlungen.positiv, 499);
  A.equal(ra.paarZaehlungen.positiv, 1497);
  A.equal(ra.paarZaehlungen.ungueltig, 3);
  A.equal(ra.paarZaehlungen.erhalten, 1497);
  A.deepEqual(ra.ungueltigeUrteile,
    [{ profilId: ids[0], grund: "urteil-widerspruechlich" }]);
  A.deepEqual(ra.paarUngueltig, PAARE.map(paar => ({
    profilId: ids[0], paar, grund: "urteil-widerspruechlich" })));
  const profilA = ra.profile.find(p => p.profilId === ids[0]);
  A.equal(profilA.positiv, false);
  A.equal(profilA.bewertet, false,
    "Summary-Widerspruch: gesamtes Einzelurteil gilt nicht als bewertet");
  A.equal(profilA.einzelurteilValidiert, false,
    "Summary-Widerspruch: gesamtes Einzelurteil gilt nicht als validiert");
  assertPaarSumme(ra);

  // Umgekehrt: inhaltlich negatives Paket, dessen Zusammenfassung "bestanden"
  // behauptet. Kein Paarwert bleibt negativ; alle drei Plaetze sind ungueltig.
  const basis = paket(ids[0], { status: ["wiederholung", "getrennt", "getrennt"] });
  const urteil = structuredClone(basis.urteil);
  Object.assign(urteil, { bereit: true, bereichstrennungBestanden: true, grund: null });
  const b = komplett();
  b.erhalten[0] = { profilId: ids[0], eingabe: basis.eingabe, urteil };
  const rb = B.aggregiere(b);
  A.equal(rb.status, "nicht-bestanden");
  A.equal(rb.paarZaehlungen.positiv, 1497);
  A.equal(rb.paarZaehlungen.negativ, 0);
  A.equal(rb.paarZaehlungen.ungueltig, 3);
  A.equal(rb.zaehlungen.negativ, 0);
  const profilB = rb.profile.find(p => p.profilId === ids[0]);
  A.equal(profilB.bewertet, false,
    "Summary-Widerspruch (umgekehrt): gesamtes Einzelurteil gilt nicht als bewertet");
  A.equal(profilB.einzelurteilValidiert, false,
    "Summary-Widerspruch (umgekehrt): gesamtes Einzelurteil gilt nicht als validiert");
  assertPaarSumme(rb);
});

test("Falsche Zielgroesse und uneindeutige Erwartung sperren", () => {
  const zuWenig = komplett(); zuWenig.erwartet.pop();
  const a = B.aggregiere(zuWenig);
  A.equal(a.status, "nicht-bestanden");
  A.equal(a.vertragGueltig, false);
  A.equal(a.grund, "zielgroesse-ungleich-500");
  A.equal(a.zaehlungen.erwartet, 499);

  const doppelt = komplett();
  doppelt.erwartet[1] = structuredClone(doppelt.erwartet[0]);
  A.equal(B.aggregiere(doppelt).grund, "erwartete-id-doppelt");

  const ohneHash = komplett(); delete ohneHash.erwartet[0].eingabeHash;
  A.equal(B.aggregiere(ohneHash).grund, "erwarteter-hash-fehlt");

  const ohneId = komplett();
  ohneId.erhalten[0] = { eingabe: null, urteil: null };
  A.equal(B.aggregiere(ohneId).grund, "eingabe-ohne-profilId");
});

test("Historische Modellaufruf-Metadaten sperren keinen gueltigen Datensatz", () => {
  const e = komplett();
  e.erhalten[0].modellaufrufe = 7;
  e.erhalten[0].neuBerechnet = true;
  e.erhalten[0].urteil.modellaufrufe = 7;
  e.erhalten[0].urteil.historischeMetadaten = { lauf: "alt", kosten: 0.42 };
  const r = B.aggregiere(e);
  A.equal(r.status, "bestanden");
  A.equal(r.modellaufrufe, 0);
  A.equal(r.zaehlungen.positiv, 500);
  A.equal(r.zaehlungen.neuberechnet, undefined);
});

test("Determinismus: gleiche Eingabe, gleiches Ergebnis, auch bei anderer Reihenfolge", () => {
  const e = komplett();
  const a = B.aggregiere(e), b = B.aggregiere(e);
  A.deepEqual(a, b);
  A.equal(a.ergebnisHash, b.ergebnisHash);
  const gedreht = { erwartet: [...e.erwartet].reverse(), erhalten: [...e.erhalten].reverse() };
  const c = B.aggregiere(gedreht);
  A.equal(c.status, "bestanden");
  A.equal(c.ergebnisHash, a.ergebnisHash);
});

test("Unveraenderlichkeit: Eingaben werden nicht mutiert, Ergebnis bleibt stabil", () => {
  const e = komplett();
  const vorher = hash(e);
  const r1 = B.aggregiere(e);
  A.equal(hash(e), vorher);
  A.equal(r1.ergebnisHash, B.aggregiere(e).ergebnisHash);
  A.equal(hash(e), vorher);
});

console.log(`${n}/${n} Fallgruppen bestanden; 0 Modellaufrufe, 0 Production-Writes.`);
