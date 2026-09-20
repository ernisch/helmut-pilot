"use strict";

const A = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { hash } = require("../lib/helmut/briefing-speicher");
const P = require("../lib/helmut/prosa-faktenplan");

// Vorab formulierte synthetische Quelltexte und separate redaktionelle
// Sollsaetze. Kein Modellaufruf, keine echte Production Fachfreigabe.
const faelle = [
  { name: "Sachgebiet", quelle: "Der Stadtrat beschliesst einen Zuschuss von 20 Euro fuer Busfahrkarten. Damit sinkt der Fahrpreis fuer Berechtigte um 20 Euro.",
    zweck: "wirkung", gut: "Der beschlossene Zuschuss senkt den Preis einer Busfahrkarte fuer Berechtigte um 20 Euro.",
    falsch: "Der Stadtrat senkt die Pflegesteuer fuer alle Einwohner um 20 Euro.",
    akteur: "Stadtrat", handlung: "Zuschuss beschlossen", gegenstand: "Busfahrkarten", aussagegrad: "Beschluss", bedingung: "Berechtigung" },
  { name: "Modalitaet", quelle: "Das Ministerium prueft die Verlaengerung des Programms. Eine Entscheidung ist noch nicht getroffen.",
    zweck: "ereignis", gut: "Das Ministerium prueft eine Verlaengerung; eine Entscheidung steht noch aus.",
    falsch: "Das Ministerium hat die Verlaengerung beschlossen.",
    akteur: "Ministerium", handlung: "prueft", gegenstand: "Programmverlaengerung", aussagegrad: "Pruefung", verneinung: true },
  { name: "Zuschreibung", quelle: "In einem Gastbeitrag kritisiert Verband A die Forderung des Verbands B. Die Redaktion macht sich diese Position nicht zu eigen.",
    zweck: "zuschreibung", gut: "Verband A kritisiert in einem Gastbeitrag die Forderung von Verband B.",
    falsch: "Die Redaktion kritisiert Verband A im Namen von Verband B.",
    akteur: "Verband A", handlung: "kritisiert", gegenstand: "Forderung des Verbands B", aussagegrad: "zugeschriebene Position", zuschreibung: "Gastbeitrag von Verband A" },
  { name: "Ereigniszeit", quelle: "Nach dem Konzert 2024 sind neue Auftritte am 3. Mai 2028 in Bonn und am 7. Mai 2028 in Kiel geplant.",
    zweck: "zeit", gut: "Geplant sind Auftritte am 3. Mai 2028 in Bonn und am 7. Mai 2028 in Kiel.",
    falsch: "Das Konzert von 2024 findet am 7. Mai 2028 in Bonn statt.",
    akteur: null, handlung: "Auftritte geplant", gegenstand: "Bonn und Kiel", aussagegrad: "Planung", ereigniszeit: "2028-05-03 Bonn; 2028-05-07 Kiel" },
  { name: "Profilrolle", quelle: "Der Verkehrsausschuss beraet ueber den Busfahrkartenzuschuss. Thema ist die Finanzierung des oeffentlichen Nahverkehrs.",
    zweck: "profil", gut: "Der Zuschuss betrifft die Finanzierung des Nahverkehrs im Verkehrsausschuss, in dem du stellvertretendes Mitglied bist.",
    falsch: "Als Vorsitzender des Verkehrsausschusses musst du den Zuschuss beschliessen.",
    akteur: "Verkehrsausschuss", handlung: "beraet", gegenstand: "Busfahrkartenzuschuss", aussagegrad: "Beratung" },
  { name: "BedingteOption", quelle: "Nur wenn der Stadtrat den Zuschuss beschliesst, koennen berechtigte Verkehrsunternehmen bis zum 30. November einen Antrag stellen. Eine Bewilligung ist damit nicht zugesagt.",
    zweck: "option", gut: "Falls der Stadtrat den Zuschuss beschliesst, koennen berechtigte Verkehrsunternehmen bis zum 30. November einen Antrag stellen; die Bewilligung bleibt offen.",
    falsch: "Du musst bis zum 30. November einen Antrag stellen und erhaeltst den Zuschuss sicher.",
    akteur: "berechtigte Verkehrsunternehmen", handlung: "koennen Antrag stellen", gegenstand: "Zuschuss", aussagegrad: "Moeglichkeit", verneinung: true,
    bedingung: "Beschluss des Stadtrats und Berechtigung", ereigniszeit: "Antragsfrist 30. November; Jahr unbekannt" }
];

function basis(c = faelle[0], pfad = "/items/0/summary") {
  const profile = { id: "synthetisch-prosa", deputyCommittees: ["Verkehrsausschuss"] };
  const q = { id: "quelle-a", vorgangId: "vorgang-a", url: "https://parlament.example/dokument/12345",
    titel: "Synthetischer Quellenvertrag", auszug: c.quelle, veroeffentlichtAm: "2026-09-20T09:00:00Z" };
  const f = { id: "fakt-a", vorgangId: q.vorgangId, quelleId: q.id, quellenHash: hash(q),
    stelle: { feld: "auszug", von: 0, bis: q.auszug.length, kontextVon: 0, kontextBis: q.auszug.length },
    akteur: c.akteur, handlung: c.handlung, gegenstand: c.gegenstand, aussagegrad: c.aussagegrad,
    verneinung: c.verneinung ?? false, zuschreibung: c.zuschreibung ?? null,
    bedingung: c.bedingung ?? null, ereigniszeit: c.ereigniszeit ?? null,
    profilHash: hash(profile), formulierungen: { [c.zweck]: c.gut } };
  return { quellen: [q], fakten: [f], profile, tag: "2026-09-20",
    feldvertrag: [{ pfad, zweck: c.zweck, vorgangId: q.vorgangId }],
    trustedFreigaben: [{ faktId: f.id, faktHash: hash(f), pruefer: "synthetische-getrennte-redaktion",
      nachweisHash: hash({ original: c.quelle, urteil: c.gut }), tag: "2026-09-20", urteil: "getragen" }] };
}
const plan = (b, x) => ({ version: P.VERSION, basisHash: x.basisHash,
  felder: b.feldvertrag.map(f => ({ pfad: f.pfad, faktId: "fakt-a", zweck: f.zweck })) });
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }

// 36 Bindungsfaelle an Briefing/Lage Feldadressen. Ausdruecklich NICHT die
// noch ausstehende 36er Abnahme beider produktiven Fachpfade.
for (const [pfadname, pfad] of [["Briefing", "/items/0/summary"], ["Lage", "/paragraphs/0/text"]]) {
  for (const c of faelle) {
    test(`${pfadname} ${c.name}: positiver Inhalt bleibt wortgetreu`, () => {
      const b = basis(c, pfad), x = P.binde(b), p = plan(b, x), out = x.formuliere(p);
      A.equal(out.felder[0].text, c.gut);
      A.equal(x.pruefe(p, out).gebunden, true);
      A.equal(out.vollstaendigeFaktenpruefung, false);
    });
    test(`${pfadname} ${c.name}: negative Aussage trotz neuem Eigenhash gesperrt`, () => {
      const b = basis(c, pfad), x = P.binde(b), p = plan(b, x), out = x.formuliere(p);
      out.felder[0].text = c.falsch; out.inhaltHash = hash(out.felder);
      A.equal(x.pruefe(p, out).gebunden, false);
      const fremd = structuredClone(b); fremd.fakten[0].formulierungen[c.zweck] = c.falsch;
      A.throws(() => P.binde(fremd), /freigabe-fehlt/);
    });
    test(`${pfadname} ${c.name}: fehlende und widerspruechliche Freigabe gesperrt`, () => {
      const b = basis(c, pfad); b.trustedFreigaben = [];
      A.throws(() => P.binde(b), /freigabe-unvollstaendig/);
      const n = basis(c, pfad); n.trustedFreigaben[0].urteil = "widersprochen";
      A.throws(() => P.binde(n), /freigabe-fehlt/);
    });
  }
}

test("Modell kann keine freien Texte, Freigaben oder Rollen in den Plan schreiben", () => {
  const b = basis(), x = P.binde(b), p = plan(b, x);
  for (const key of ["text", "rolle", "sachlichGetragen", "trustedFreigaben"])
    A.throws(() => x.formuliere({ ...p, [key]: true }), /plan-abweichend/);
  A.throws(() => x.formuliere({ ...p, felder: [{ ...p.felder[0], text: "Neue Behauptung" }] }), /planfeld/);
});
test("Quelleninhalt, URL, Publikation, Kennung und Vorgang sind unverwechselbar", () => {
  for (const field of ["auszug", "titel", "url", "veroeffentlichtAm", "id", "vorgangId"]) {
    const b = basis(); b.quellen[0][field] += " geaendert";
    A.throws(() => P.binde(b), /quelle-abweichend/);
  }
});
test("Gleicher Teiltext mit anderem Kontext ist kein gleicher Sachbeleg", () => {
  const b = basis(); b.quellen[0].auszug += " Diese Darstellung wurde spaeter widerrufen.";
  b.fakten[0].quellenHash = hash(b.quellen[0]);
  A.throws(() => P.binde(b), /freigabe-fehlt/);
});
test("Quelle und Fakt koennen die getrennte Freigabe nicht selbst erneuern", () => {
  const b = basis(); b.fakten[0].aussagegrad = "unwiderruflicher Vollzug";
  A.throws(() => P.binde(b), /freigabe-fehlt/);
  b.fakten[0].freigegeben = true;
  A.throws(() => P.binde(b), /fakt-ungueltig/);
});
test("Unbekannte Sachfelder bleiben null und werden nicht aus Publikationszeit abgeleitet", () => {
  const b = basis(); const x = P.binde(b);
  A.equal(b.fakten[0].ereigniszeit, null);
  A.equal(x.formuliere(plan(b, x)).felder[0].text, faelle[0].gut);
});
test("Frisches Profil, Mandatskennung und Prueftag muessen genau passen", () => {
  for (const change of [b => { b.profile.id = "fremd"; },
    b => { b.profile.deputyCommittees = []; }, b => { b.tag = "2026-09-21"; }]) {
    const b = basis(); change(b); A.throws(() => P.binde(b));
  }
  const b = basis(); b.tag = "2026-02-30"; A.throws(() => P.binde(b), /kontext-fehlt/);
});
test("Doppelte Quellkennungen, Fakten und Freigaben sind Fehler", () => {
  for (const key of ["quellen", "fakten", "trustedFreigaben", "feldvertrag"]) {
    const b = basis(); b[key].push(structuredClone(b[key][0]));
    A.throws(() => P.binde(b), /kennung-abweichend/);
  }
});
test("Teilbehauptung fehlt oder unbekanntes Feld hinzugefuegt: keine Teilfreigabe", () => {
  const b = basis(), x = P.binde(b), p = plan(b, x);
  A.throws(() => x.formuliere({ ...p, felder: [] }), /plan-abweichend/);
  A.throws(() => x.formuliere({ ...p, felder: [{ ...p.felder[0], pfad: "/neueAussage" }] }), /fakt-nicht-freigegeben/);
  const out = x.formuliere(p); out.neueAussage = "Unbelegter Zusatz";
  A.equal(x.pruefe(p, out).gebunden, false);
});
test("Ereignis kann nicht als Wirkung oder Mandatsbezug ausgegeben werden", () => {
  const b = basis(faelle[1]), x = P.binde(b), p = plan(b, x);
  for (const zweck of ["wirkung", "profil", "option", "kommunikation"])
    A.throws(() => x.formuliere({ ...p, felder: [{ ...p.felder[0], zweck }] }), /fakt-nicht-freigegeben/);
});
test("Fremde Faktenkennung und fremder Vorgang werden abgelehnt", () => {
  const b = basis(), x = P.binde(b), p = plan(b, x);
  A.throws(() => x.formuliere({ ...p, felder: [{ ...p.felder[0], faktId: "fremd" }] }), /fakt-nicht-freigegeben/);
  b.feldvertrag[0].vorgangId = "fremd";
  const y = P.binde(b); A.throws(() => y.formuliere(plan(b, y)), /fakt-nicht-freigegeben/);
});
test("Sachfreigabe ohne gebundenes Profil erlaubt keine individuelle Handlungsoption", () => {
  const b = basis(faelle[5]); b.fakten[0].profilHash = null;
  b.trustedFreigaben[0].faktHash = hash(b.fakten[0]);
  A.throws(() => P.binde(b), /profilbindung-fehlt/);
});
test("Nachtraegliche Mutation der Eingabekopien veraendert keine Ausgabe", () => {
  const b = basis(), x = P.binde(b), p = plan(b, x), before = x.formuliere(p);
  b.fakten[0].formulierungen.wirkung = "Fremde Behauptung";
  b.trustedFreigaben[0].urteil = "widersprochen";
  A.deepEqual(x.formuliere(p), before);
  before.felder[0].text = "Manipulation";
  A.equal(x.formuliere(p).felder[0].text, faelle[0].gut);
});
test("Ganze Ausgabe durch echte lokale Dateispeicherung und erneute Bindung pruefen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-prosa-"));
  try {
    const b = basis(), x = P.binde(b), p = plan(b, x);
    fs.writeFileSync(path.join(dir, "basis.json"), JSON.stringify(b));
    fs.writeFileSync(path.join(dir, "ausgabe.json"), JSON.stringify(x.formuliere(p)));
    const neu = P.binde(JSON.parse(fs.readFileSync(path.join(dir, "basis.json"))));
    const out = JSON.parse(fs.readFileSync(path.join(dir, "ausgabe.json")));
    A.equal(neu.pruefe(p, out).gebunden, true);
    out.felder[0].text += " Darum bist du verantwortlich.";
    out.inhaltHash = hash(out.felder);
    fs.writeFileSync(path.join(dir, "ausgabe.json"), JSON.stringify(out));
    A.equal(neu.pruefe(p, JSON.parse(fs.readFileSync(path.join(dir, "ausgabe.json")))).gebunden, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("Keine technische Bindung behauptet eine bestandene fachliche Vollpruefung", () => {
  const b = basis(), x = P.binde(b), p = plan(b, x), out = x.formuliere(p);
  A.equal(x.pruefe(p, out).vollstaendigeFaktenpruefung, false);
  A.equal(x.pruefe(p, null).vollstaendigeFaktenpruefung, false);
});
test("Unbesetzte Arrayplaetze sind trotz passender Laenge keine Feldabdeckung", () => {
  const b = basis(), x = P.binde(b), p = plan(b, x);
  const leer = { ...p, felder: new Array(p.felder.length) };
  A.throws(() => x.formuliere(leer), /plan-unvollstaendig/);
  A.equal(x.pruefe(leer, {}).gebunden, false);
  A.throws(() => x.formuliere(JSON.parse(JSON.stringify(leer))), /planfeld-abweichend/);
});

console.log(`${passed}/${passed} Prosa Faktenbindungsgruppen bestanden; produktive 36er Fachabnahme weiter offen.`);
