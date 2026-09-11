"use strict";
const A = require("node:assert/strict"), X = require("../lib/helmut/lage-absatzauswahl");
const AI = require("../lib/helmut/ai"), Q = require("../lib/helmut/lage-textqualitaet");
// Synthetische Gegenfaelle zur privaten Probe26: mehrere Dokumente in einer
// Gruppe, nur ein Teilbeleg pro Dokument, unpassender oder erfundener Bezug.
const profile = { committees: ["Entwicklung", "Stadtentwicklung"], constituency: "Teststadt" };
const quellen = [{ vorgang_id: "vg-gruppe", quellenbelege: [
  { quelle_id: "q-a", titel: "Der Ausschuss beraet einen Entwurf fuer den Staedtebau.", auszug: "Der Entwurf wird im Ausschuss beraten." },
  { quelle_id: "q-b", titel: "Der Verband fordert ein neues Verfahren.", auszug: "Ein Verband verlangt ein anderes Verfahren." }
] }];
const raw = { paragraphs: quellen[0].quellenbelege.map((q, i) => ({
  auswahl: { quelle_id: q.quelle_id, mandatsfeld: "ausschuesse", mandatswert: profile.committees[i],
    begruendung: "PRIVATE_AUSWAHL: Bezug zum benannten Ausschuss pruefen." },
  text: q.titel, vorgang_ids: ["vg-gruppe"]
})) };
const bind = (r = raw, p = profile, options) => X.binde(r,
  AI.assembleLageParagraphs(r, ["vg-gruppe"]), quellen, p, options);
const good = bind(); A.equal(good.ok, true);
A.deepEqual(good.paragraphs.map(p => p.quellen_ids), [["q-a"], ["q-b"]]);
const urteil = { pruefungen: raw.paragraphs.map((p, absatz) => ({ absatz, quelle_id: p.auswahl.quelle_id,
  belegfeld: "titel", vollstaendig_belegt: true, themenrein: true, profilbezug: true,
  textart: "konkreter_sachverhalt", pruefbegruendung: "Ein benannter Sachverhalt mit dem passenden Ausschussbezug." })),
  vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: "Eine Ausschussberatung und eine andere Forderung sind verschiedene Handlungen." }] };
const result = Q.pruefe(good.paragraphs, quellen, urteil); A.equal(result.ok, true);
A(!JSON.stringify(result).includes("PRIVATE_AUSWAHL")); A.equal(result.qualitaet.vollstaendigeFaktenpruefung, false);
const swapped = structuredClone(urteil); swapped.pruefungen[0].quelle_id = "q-b";
A.equal(Q.pruefe(good.paragraphs, quellen, swapped).ok, false, "Anderes Dokument derselben Gruppe darf nicht einspringen");
for (const field of ["vollstaendig_belegt", "profilbezug", "themenrein"]) {
  const rejected = structuredClone(urteil); rejected.pruefungen[0][field] = false;
  A.equal(Q.pruefe(good.paragraphs, quellen, rejected).ok, false, "Auswahlbegruendung ueberstimmt kein negatives Review");
}
for (const change of [p => delete p.auswahl, p => p.auswahl.quelle_id = "q-fremd",
  p => p.auswahl.mandatswert = "Erfundener Ausschuss", p => p.auswahl.mandatsfeld = "__proto__",
  p => p.auswahl.begruendung = "", p => p.auswahl.begruendung = "x".repeat(241),
  p => p.auswahl.zusaetzlich = true, p => p.vorgang_ids.push("vg-gruppe")]) {
  const bad = structuredClone(raw); change(bad.paragraphs[0]);
  // Mehrere gleiche IDs werden vom vorhandenen Normalisierer zusammengefasst.
  if (bad.paragraphs[0].vorgang_ids.length > 1) bad.paragraphs[0].vorgang_ids[1] = "vg-fremd";
  A.equal(bind(bad).ok, false);
}
const old = { paragraphs: raw.paragraphs.map(({ auswahl, ...p }) => p) };
A.equal(bind(old).ok, false, "Neue Antworten ohne Auswahl ungueltig");
A.equal(bind(old, profile, { erlaubeAltbeleg: true }).ok, true, "Gesicherter alter Zeitbudgetentwurf bleibt fortsetzbar");
const partial = structuredClone(raw); delete partial.paragraphs[0].auswahl;
A.equal(bind(partial, profile, { erlaubeAltbeleg: true }).ok, false, "Keine teilweise neue Auswahl als Altbeleg ausgeben");
const regional = structuredClone(raw); regional.paragraphs[0].auswahl.mandatsfeld = "wahlkreis";
regional.paragraphs[0].auswahl.mandatswert = "Teststadt"; A.equal(bind(regional).ok, true);
const schema = AI.LAGE_BRIEFING_SCHEMA.properties.paragraphs.items;
A(schema.required.includes("auswahl")); A.deepEqual(schema.properties.auswahl, X.SCHEMA);
A.deepEqual(Object.keys(X.SCHEMA.properties).sort(), [...X.SCHEMA.required].sort());
console.log("7/7 Auswahlgruppen: Dokumentbindung, Review ohne Wechsel, negatives Urteil, echte Mandatswerte, private Felder, gesicherte Altbelege und Schema.");
