"use strict";

// Neue gezielte Offlinefälle für die reale feste Kohorte, keine alten Suiten.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const E = require("./realkohorte-500-erwartungen");
const bytes = fs.readFileSync(E.PAKET);
const paket = JSON.parse(bytes);
const clone = value => JSON.parse(JSON.stringify(value));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-real500-erwartungen-"));
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
let output;

test("Exakt 500 reale Personen, 330/120/50 und 1500 ausstehende Sollpositionen", () => {
  output = E.erzeuge(bytes);
  assert.equal(output.erwartungen.length, 500);
  assert.equal(output.ids.length, 500);
  assert.equal(E.hash(output.ids), E.IDS_HASH);
  assert.deepEqual(output.verteilung, E.VERTEILUNG);
  assert.equal(output.sollpositionen.length, 1500);
  assert.equal(new Set(output.sollpositionen.map(s => s.mandatsId + ":" + s.bereich)).size, 1500);
  assert.ok(output.sollpositionen.every(s => s.status === "ausstehend"));
  for (const b of E.BEREICHE) assert.equal(output.sollpositionen.filter(s => s.bereich === b).length, 500);
});
test("Vorbereitung behauptet keine fachliche Abnahme oder Freigabe", () => {
  assert.equal(output.status, "vorab-konkretisiert-keine-fachabnahme");
  assert.equal(output.blocker.length, 0);
  for (const k of ["nachrichtenauswertung", "productionWrites", "fachlichAbgenommen"]) assert.equal(output[k], 0);
  for (const k of ["importfreigabe", "aktivierungsfreigabe", "testfreigabe"]) assert.equal(output[k], false);
  assert.equal(output.vorabVertrag.nachrichtenAuswahlNachPassendemInhaltVerboten, true);
});
test("Alle 500 Erwartungen an individuelle Namen, Felder und Originalquellen gebunden", () => {
  const byId = new Map(paket.profile.map(r => [r.mandatsId, r]));
  for (const r of output.erwartungen) {
    const original = byId.get(r.mandatsId);
    assert.equal(r.bindung.name, original.vollname);
    assert.equal(r.profilfeldHash, E.hash(original));
    assert.equal(r.quellenHash, E.hash(original.offizielleQuellen));
    assert.equal(r.positiveFaelle[1].bedingung.vollname, original.vollname);
    assert.ok(r.amtlicheQuellen.length > 0);
    assert.ok(r.fachachsen.length > 0);
  }
  assert.equal(new Set(output.erwartungen.map(r => r.erwartungsfelderHash)).size, 500);
});
test("Parteiänderung erfindet keine politische Position oder Fachachse", () => {
  const r = clone(paket.profile[0]);
  const vorher = E.profilErwartung(r);
  r.partei = "SPD"; r.fraktion = "SPD";
  const nachher = E.profilErwartung(r);
  assert.deepEqual(vorher.fachachsen, nachher.fachachsen);
  assert.deepEqual(vorher.positiveFaelle[0], nachher.positiveFaelle[0]);
  assert.deepEqual(vorher.bindung.fokus, nachher.bindung.fokus);
  assert.match(nachher.positiveFaelle[2].erwartet, /keine persönliche Zustimmung, Position/);
});
test("Fehlende Fachachse wird sichtbar blockiert, allgemeine Rolle ersetzt sie nicht", () => {
  const r = clone(paket.profile[0]);
  delete r.ausschuesse; delete r.stellvertretendeAusschuesse; delete r.themen;
  r.funktionen = ["Abgeordnete"];
  const erwartung = E.profilErwartung(r);
  assert.equal(erwartung.status, "blockiert");
  assert.equal(erwartung.fachachsen.length, 0);
  assert.match(erwartung.blocker[0], /keine-ersatzachse-aus-partei/);
});
test("Stellvertretungs- und beratende Rollen werden nicht zu ordentlicher Mitgliedschaft", () => {
  const r = output.erwartungen.find(r => r.mandatsId === "bundestag-seidler-stefan-1047378");
  assert.equal(r.bindung.ausschuesse.length, 0);
  assert.ok(r.bindung.funktionen.some(t => t.startsWith("Beratendes Mitglied:")));
  assert.ok(r.fachachsen.every(a => a.art !== "ordentliche-ausschussmitgliedschaft"));
  assert.match(r.positiveFaelle[0].erwartet, /Stellvertretung ist keine ordentliche/);
});
test("Zwei parteilose und drei fraktionslose kanonische Ausnahmen bleiben sichtbar", () => {
  assert.equal(output.erwartungen.filter(r => r.bindung.parteilosKanonischBelegt).length, 2);
  assert.equal(output.erwartungen.filter(r => r.bindung.fraktionslos).length, 3);
  assert.ok(output.erwartungen.filter(r => r.bindung.parteilosKanonischBelegt).every(r => r.bindung.partei === null));
});
test("Ergänzende kanonische Quelle ohne Abrufzeit wird sichtbar als Lücke geführt", () => {
  const r = output.erwartungen.find(r => r.mandatsId === "bundestag-pistorius-boris-1046550");
  assert.equal(r.quellenLuecken.length, 1);
  assert.equal(r.quellenLuecken[0].url, "https://www.spd.de/ueber-uns");
  assert.ok(r.amtlicheQuellen.every(q => q.abgerufenAm !== null));
  const modified = clone(paket.profile[0]); modified.offizielleQuellen[0].abgerufenAm = null;
  assert.throws(() => E.profilErwartung(modified), /quellen-bindung/);
});
test("Cross-Ebene, Cross-Land, Fremdperson und ruhiger Fall für alle 500 vorab festgelegt", () => {
  for (const r of output.erwartungen) {
    assert.deepEqual(r.negativeFaelle.map(f => f.id), ["cross-ebene", "cross-land", "fremde-person-oder-rolle", "fehlender-originalbeleg"]);
    assert.equal(r.negativeFaelle[0].eigenesParlament, r.bindung.parlament);
    assert.equal(r.negativeFaelle[1].eigenesLand, r.bindung.bundesland);
    assert.equal(r.ruhigerFall.automatischBestanden, false);
    assert.equal(r.ruhigerFall.zaehltAlsSollposition, true);
  }
});
test("Personengebundene Vergleichsprofile sind feste reale IDs, keine synthetischen Kunden", () => {
  const map = new Map(paket.profile.map(r => [r.mandatsId, r]));
  for (const r of output.erwartungen) {
    for (const id of Object.values(r.vergleichsprofile)) if (id) assert.ok(map.has(id) && id !== r.mandatsId);
    const id = r.vergleichsprofile.gleicheParteiAnderesParlament;
    if (id) {
      assert.equal(map.get(id).partei, r.bindung.partei);
      assert.notEqual(map.get(id).parlament, r.bindung.parlament);
    }
  }
  assert.ok(output.erwartungen.some(r => r.vergleichsprofile.andereParteiGleicheFachachse));
});
test("Alle Teilbilanzen summieren auf 500 Profile und 1500 Positionen", () => {
  for (const groups of Object.values(output.bilanzvertrag.teilbilanzen)) {
    assert.equal(groups.reduce((s, g) => s + g.profile, 0), 500);
    assert.equal(groups.reduce((s, g) => s + g.sollpositionen, 0), 1500);
    assert.equal(new Set(groups.flatMap(g => g.ids)).size, 500);
    for (const g of groups) assert.equal(g.idsHash, E.hash(g.ids));
  }
  assert.equal(output.bilanzvertrag.leerAutomatischBestanden, false);
  assert.equal(output.bilanzvertrag.stichprobenErsetzenVollpruefung, false);
  assert.ok(output.bilanzvertrag.vollstaendigkeit.includes("leer"));
  assert.ok(output.bilanzvertrag.fachqualitaet.includes("unbrauchbar"));
});
test("Gesamthash bindet sämtliche Vorab-Erwartungen und Sollpositionen", () => {
  const { erwartungenHash, ...inhalt } = clone(output);
  assert.equal(erwartungenHash, E.hash(inhalt));
  inhalt.sollpositionen[0] = { ...inhalt.sollpositionen[0], status: "bestanden" };
  assert.notEqual(erwartungenHash, E.hash(inhalt));
});

const drift = (name, mutation, reason) => test(name, () => {
  const p = clone(paket); mutation(p);
  assert.throws(() => E.erzeuge(JSON.stringify(p)), reason);
});
drift("Falscher Paket-Bytehash wird zurückgewiesen", () => {}, /paket-hash-drift/);
drift("ID-Drift wird zurückgewiesen", p => { p.profile[0].mandatsId += "-drift"; }, /ids-drift/);
drift("Doppelte ID wird zurückgewiesen", p => { p.profile[0].mandatsId = p.profile[1].mandatsId; }, /ids-drift/);
drift("Mengen-Drift wird zurückgewiesen", p => { p.profile.pop(); }, /paket-version-menge/);
drift("Ebenen-/Verteilungsdrift wird zurückgewiesen", p => {
  const r = p.profile.find(r => r.parlament === "bundestag");
  r.parlament = "landtag-berlin"; r.bundesland = "Berlin";
  r.offizielleQuellen[0].url = "https://www.parlament-berlin.de/Abgeordnete/test";
}, /verteilung-drift/);
drift("Landesdrift wird zurückgewiesen", p => { p.profile.find(r => r.parlament === "landtag-berlin").bundesland = "Brandenburg"; }, /land-drift/);
drift("Fehlender Name wird zurückgewiesen", p => { delete p.profile[0].vollname; }, /profil-pflichtfeld/);
drift("Fehlende amtliche Quelle wird zurückgewiesen", p => { p.profile[0].offizielleQuellen = []; }, /quellen-fehlen/);
drift("Nichtamtliche Parlamentsquelle wird zurückgewiesen", p => { p.profile[0].offizielleQuellen[0].url = "https://example.org/profil"; }, /amtliche-parlamentsquelle-fehlt/);
drift("Fehlender Quellenhash wird zurückgewiesen", p => { delete p.profile[0].offizielleQuellen[0].sha256; }, /quellen-bindung/);
drift("Fehlende Partei ist kein allgemeiner parteilos-Fallback", p => { delete p.profile[0].partei; }, /partei-fehlt/);
drift("Fehlende Fraktion ist kein allgemeiner fraktionslos-Fallback", p => { delete p.profile[0].fraktion; p.profile[0].fraktionslos = true; }, /fraktion-fehlt/);
drift("AfD über Partei wird zurückgewiesen", p => { p.profile[0].partei = "AfD"; }, /AfD-zugehoerige/);
drift("AfD über Fraktion wird zurückgewiesen", p => { p.profile[0].fraktion = "Alternative für Deutschland"; }, /AfD-zugehoerige/);
drift("Fraktionsloses AfD-Mitglied wird zurückgewiesen", p => {
  const r = p.profile.find(r => r.fraktionslos); r.partei = "AfD";
}, /AfD-zugehoerige/);
drift("Aktivierte Eingabe wird zurückgewiesen", p => { p.profile[0].aktiv = true; }, /profil-nicht-inaktiv/);

test("Privatausgabe ausschließlich außerhalb Repository mit mode 0600", () => {
  const out = path.join(temp, "erwartungen.json");
  E.schreibePrivat(out, output);
  assert.equal(fs.statSync(out).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(out)).erwartungenHash, output.erwartungenHash);
  assert.throws(() => E.schreibePrivat(out, output), /EEXIST/);
  assert.throws(() => E.schreibePrivat(path.join(__dirname, "unerlaubte-erwartungen.json"), output), /out-im-repository/);
  assert.throws(() => E.schreibePrivat("relative.json", output), /out-absolut-erforderlich/);
});
test("Symlink auf Repository und fremde Ausgabedatei bleibt gesperrt", () => {
  fs.symlinkSync(__dirname, path.join(temp, "repo"), "dir");
  assert.throws(() => E.schreibePrivat(path.join(temp, "repo", "unerlaubt.json"), output), /out-im-repository/);
  const protectedFile = path.join(temp, "geschuetzt.json");
  fs.writeFileSync(protectedFile, "vorher");
  fs.symlinkSync(protectedFile, path.join(temp, "symlink.json"));
  assert.throws(() => E.schreibePrivat(path.join(temp, "symlink.json"), output), /EEXIST/);
  assert.equal(fs.readFileSync(protectedFile, "utf8"), "vorher");
});
test("CLI akzeptiert ausschließlich --out und startet keine externe Auswertung", () => {
  // main direkt aufrufen: die Cloud-Sandbox sperrt Kindprozesse (EPERM).
  let summary;
  const previous = console.log;
  try {
    console.log = value => { summary = JSON.parse(value); };
    E.main(["--out", path.join(temp, "cli.json")]);
  } finally { console.log = previous; }
  assert.equal(summary.sollpositionen, 1500);
  assert.equal(summary.productionWrites, 0);
  assert.throws(() => E.main(["--input", E.PAKET, "--out", path.join(temp, "abweichend.json")]), /cli-nur-out/);
  assert.equal(fs.existsSync(path.join(temp, "abweichend.json")), false);
});

let passed = 0;
try {
  for (const { name, fn } of tests) {
    fn(); passed++;
    console.log("ok " + passed + " - " + name);
  }
  console.log("realkohorte-500-erwartungen: " + passed + "/" + tests.length + " offline grün; keine Fachabnahme oder Productionwirkung.");
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
