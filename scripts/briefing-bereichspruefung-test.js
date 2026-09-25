"use strict";
const A = require("node:assert/strict");
const P = require("../lib/helmut/briefing-bereichspruefung");
const { hash } = require("../lib/helmut/briefing-speicher");
const render = require("./lib/briefing-ansichten");
const texte = {
  briefing: "Heute die Stellungnahme zur kommenden Anhörung im Büro vorbereiten.",
  lage: "Der Ausschuss berät den Entwurf zur Finanzierung der kommunalen Schulen.",
  radar: "Die öffentliche Anhörung ist für den kommenden Dienstag angekündigt."
};
function eingabe(override = {}) {
  return P.binde({ mandat: "synthetisch", tag: "2026-09-25", rendererCommit: "a".repeat(40),
    rendererHash: "b".repeat(64), profilHash: "c".repeat(64), datenHash: "d".repeat(64),
    fachinhalt: { briefing: true, lage: true, radar: true },
    html: Object.fromEntries(Object.entries(texte).map(([k, t]) => [k, `<p>${t}</p>`])), ...override });
}
// Ausschliesslich vorgegebene redaktionelle Sollurteile, kein Modellbeweis.
function urteil(e, status = "getrennt") {
  return { version: 1, eingabeHash: e.eingabeHash, vergleiche: P.PAARE.map(paar => {
    const [l, r] = paar.split("/");
    return { paar, urteil: status, begruendung: "Synthetisches Sollurteil: Sachstand, künftiger Termin und heutige Vorbereitung haben getrennte Funktionen.",
      belege: [{ links: e.ansichten[l].text, rechts: e.ansichten[r].text,
        einordnung: "Synthetische Belegzuordnung; keine behauptete automatische Bedeutungsprüfung." }] };
  }) };
}
let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS " + name); }
test("Drei getrennte Funktionen behalten alle Texte; keine 500er Freigabe", () => {
  const e = eingabe(), before = hash(e), r = P.pruefe(e, urteil(e));
  A.equal(r.bereit, true); A.equal(r.funktionsnachweis500, false);
  A.equal(r.vollstaendigeFaktenpruefung, false); A.equal(r.bedeutungUnabhaengigBewiesen, false);
  A.equal(hash(e), before);
});
test("Sinngleiche Wiederholung ohne Wortgleichheit sperrt gebundenes Fachurteil", () => {
  const e = eingabe({ html: { briefing: "Kommunen erhalten zusätzliche Mittel für den Schulbau.",
    lage: "Für neue Schulgebäude wird den Gemeinden mehr Geld bereitgestellt.", radar: texte.radar } });
  const u = urteil(e); u.vergleiche[0].urteil = "wiederholung";
  u.vergleiche[0].begruendung = "Beide Aussagen beschreiben dieselbe zusätzliche Finanzierung des Schulbaus; keine heutige Arbeit kommt hinzu.";
  A.equal(P.pruefe(e, u).bereit, false);
});
test("Unterschiedliche Negation und Termine werden nicht automatisch gelöscht", () => {
  const e = eingabe({ html: { briefing: "Heute prüfen, ob der Antrag noch rechtzeitig eingereicht werden kann.",
    lage: "Die Frist für den Antrag wurde nicht verlängert.", radar: "Die Einreichungsfrist endet am kommenden Dienstag." } });
  A.equal(P.pruefe(e, urteil(e)).bereit, true); A.ok(e.ansichten.lage.text.includes("nicht"));
});
test("Jeder unbekannte, fehlende oder negative Teilvergleich verhindert Grün", () => {
  const e = eingabe(); A.equal(P.pruefe(e, null).bereit, false);
  for (let i = 0; i < 3; i++) for (const status of ["unklar", "leer", "wiederholung", "JA"]) {
    const u = urteil(e); u.vergleiche[i].urteil = status; A.equal(P.pruefe(e, u).bereit, false);
  }
  const missing = urteil(e); missing.vergleiche.pop(); A.equal(P.pruefe(e, missing).bereit, false);
  const dup = urteil(e); dup.vergleiche[1] = dup.vergleiche[0]; A.equal(P.pruefe(e, dup).bereit, false);
});
test("Lage, Profil, Commit, Quellenpaket und Renderer sind exakt gebunden", () => {
  const e = eingabe(), u = urteil(e);
  for (const field of ["mandat", "tag", "rendererCommit", "rendererHash", "profilHash", "datenHash"]) {
    const changed = structuredClone(e); changed[field] += "x"; A.equal(P.pruefe(changed, u).bereit, false);
  }
  const changed = eingabe({ html: { ...texte, lage: texte.lage + " Neue Entwicklung." } });
  A.equal(P.pruefe(changed, u).bereit, false);
});
test("Erfundene oder vertauschte Belegstellen werden abgelehnt", () => {
  const e = eingabe();
  for (const field of ["links", "rechts"]) {
    const u = urteil(e); u.vergleiche[0].belege[0][field] = "Diese Passage steht nicht in der Ansicht.";
    A.equal(P.pruefe(e, u).grund, "beleg-abweichend");
  }
});
test("Ein positiver Prüfer darf einen echten Leerzustand nicht freizeichnen", () => {
  for (const b of P.BEREICHE) {
    const e = eingabe({ fachinhalt: { briefing: true, lage: true, radar: true, [b]: false } });
    A.equal(P.pruefe(e, urteil(e)).bereit, false);
  }
});
test("Markup, Entity-Daten und lange Texte werden nicht still gekürzt", () => {
  A.equal(P.klartext('<p>&lt;Antrag&gt; &amp; Frist &#xE4;</p><svg>keine Aussage</svg>'), "<Antrag> & Frist ä");
  A.equal(eingabe({ html: { ...texte, lage: "A".repeat(20000) } }).ansichten.lage.text.length, 20000);
  A.throws(() => eingabe({ html: { ...texte, lage: "A".repeat(160001) } }), /umfang/);
});
test("Echte Renderer lesen nur die Anzeige, einschließlich Lage-Details", () => {
  const card = { vorgangId: "vg-test", displayTitle: "Schulfinanzierung", displaySummary: texte.lage,
    whyRelevant: "ZUSATZ_IN_DETAIL. Zweiter eigenständiger Satz für den Ausschuss.",
    sources: [{ name: "Amtliche Quelle", url: "https://example.org/bericht/schule", publishedAt: "2026-09-25T07:00:00Z" }] };
  const b = { currentHelmutState: { status: "empty" },
    currentRadarState: { mentions: [{ title: "INTERN_NICHT_SICHTBAR" }], anzeige: { mentions: [], environment: {} } },
    lageBriefing: { available: true, vorgaenge: [card] } };
  const r = render(b, "2026-09-25T08:00:00Z");
  A.ok(r.html.lage.includes("ZUSATZ_IN_DETAIL"));
  A.ok(!r.html.radar.includes("INTERN_NICHT_SICHTBAR"));
  A.deepEqual(JSON.parse(JSON.stringify(r.fachinhalt)), { briefing: false, lage: true, radar: false });
});
test("Separat gespeicherte Absätze ersetzen keine sichtbaren Lagekarten", () => {
  const r = render({ currentHelmutState: { status: "empty" }, currentRadarState: {},
    lageBriefing: { available: true, paragraphs: [{ text: "NICHT_SICHTBARER_ABSATZ" }], vorgaenge: [] } }, "2026-09-25T08:00:00Z");
  A.equal(r.fachinhalt.lage, false); A.ok(!r.html.lage.includes("NICHT_SICHTBARER_ABSATZ"));
});
console.log(`${n}/${n} Fallgruppen bestanden; 0 Modellaufrufe, 0 Production-Writes.`);
