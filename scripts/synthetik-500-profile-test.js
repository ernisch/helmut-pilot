"use strict";

// Nur das neue Offline-Fiktionspaket; keine bestehenden Suiten/DB/API/Modelle.
const A = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const P = require("../lib/helmut/synthetik-500-profile");
const C = require("./synthetik-500-profile");
const K = require("../lib/helmut/mandatsklasse");
const Z = require("../lib/helmut/profil-zulassung");
const V = require("../lib/helmut/realkohorte-500-vertrag");
const clone = x => structuredClone(x);
const base = P.erzeuge();
let pass = 0;
function test(name, fn) { fn(); pass++; console.log("PASS " + name); }
function capture(fn) {
  const original = console.log, lines = [];
  try { console.log = x => lines.push(String(x)); return { result: fn(), stdout: lines.join("\n") }; }
  finally { console.log = original; }
}
function rehash(p) {
  for (const s of p.erwartungen.sollpositionen) s.profilHash = P.hash(p.profile.find(r => r.mandatsId === s.mandatsId));
  const { bindung, ...payload } = p;
  p.bindung = { idsHash: P.hash(p.profile.map(r => r.mandatsId).sort()), profileHash: P.hash(p.profile),
    erwartungenHash: P.hash(p.erwartungen), paketHash: P.hash(payload) };
}

function main() {
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error("synthetik500-netz-verboten"); };
  try {
    test("Genau500 eigenstaendige fiktive Profile und330/120/50, alle inaktiv/ohne Importfreigabe", () => {
      A.equal(base.version, "helmut-synthetik500-profile/1"); A.equal(base.profile.length, 500);
      const counts = {};
      for (const p of base.profile) {
        counts[p.parlament] = (counts[p.parlament] || 0) + 1;
        A.equal(p.synthetisch, true); A.equal(p.aktiv, false); A.equal(p.importfreigegeben, false);
        if (p.parlament !== "bundestag") A.equal(p.bundesland, p.parlament === "landtag-berlin" ? "Berlin" : "Brandenburg");
      }
      A.deepEqual(counts, { bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
      A.equal(new Set(base.profile.map(p => p.mandatsId)).size, 500);
      A.equal(new Set(base.profile.map(p => p.vollname)).size, 500);
    });
    test("Exakte neue Kennungsfamilie disjunkt von historischen A/B/C und realen Namenskennungen", () => {
      const wanted = [["bt", 330], ["be", 120], ["bb", 50]].flatMap(([land, n]) =>
        Array.from({ length: n }, (_, i) => `test-kohorte-synthetik-${land}-${String(i + 1).padStart(3, "0")}`));
      A.deepEqual(base.profile.map(p => p.mandatsId), wanted);
      A.ok(wanted.every(id => K.istSynthetischeKennung(id)));
      A.ok(wanted.every(id => !/^test-kohorte-[abc]-|^bundestag-|^landtag-/.test(id)));
      A.equal(base.bindung.idsHash, P.hash([...wanted].sort()));
    });
    test("Ausschliesslich Fiktionsnamen/Parteien/Szenarien ohne Amt/Profil-URLs/Authkonten", () => {
      for (const p of base.profile) {
        A.match(p.vollname, /^Fiktive Testperson (Bund|Berlin|Brandenburg) \d{3}$/);
        A.match(p.partei, /^Fiktive Testpartei /); A.equal(p.fraktion, p.partei);
        A.equal(Z.istAusgeschlossen(p), false); A.equal(p.herkunft.amtlicherPersonenbeleg, false);
        A.deepEqual(p.ausschuesse, []); A.deepEqual(p.funktionen, []);
      }
      A.doesNotMatch(JSON.stringify(base), /https?:|offizielleQuellen|password|email|authUsers|parlament-profil/);
    });
    test("Geschlossene Varianten sind deterministisch, unterscheiden Szenarien und behalten feste IDs", () => {
      for (const variante of P.VARIANTEN) {
        const a = P.erzeuge({ variante }), b = P.erzeuge({ variante });
        A.deepEqual(a, b); A.equal(P.pruefePaket(a).ok, true);
        A.equal(a.bindung.idsHash, base.bindung.idsHash);
      }
      A.notEqual(P.erzeuge({ variante: "kontrast-v1" }).bindung.profileHash, base.bindung.profileHash);
    });
    test("Namen/Personen/Feldkopien/Seeds/FakeQuellen sind keine zulaessigen Generatoreingaben", () => {
      for (const o of [{ vollname: "Echte Person" }, { profile: base.profile }, { partei: "Echte Partei" },
        { seed: "Personenkopie" }, { quelle: "https://www.bundestag.de/SYNTHETISCH/person" },
        Object.create({ vollname: "Echte Person" }), null, [], "basis-v1", { variante: "frei" }])
        A.throws(() => P.erzeuge(o), /synthetik500-/);
    });
    test("Doppelte/fehlende/fremde IDs und falsche Mengen oder Landeszuordnung werden abgewiesen", () => {
      for (const mutate of [p => p.profile.pop(), p => { p.profile[1].mandatsId = p.profile[0].mandatsId; },
        p => { p.profile[0].mandatsId = "bundestag-reale-person"; }, p => { p.profile[330].bundesland = "Bayern"; },
        p => { p.verteilung.bundestag = 500; }]) {
        const p = clone(base); mutate(p); A.throws(() => P.pruefePaket(p), /paket-nicht-selbstgeneriert-oder-drift/);
      }
    });
    test("Selbst vergebene neue Hashes legitimieren keine fremden Namen oder Fakeprovenienz", () => {
      for (const mutate of [p => { p.profile[0].vollname = "Echte Person"; },
        p => { p.profile[0].herkunft.amtlicherPersonenbeleg = true; },
        p => { p.profile[0].offizielleQuellen = [{ art: "parlament-profil", url: "https://www.bundestag.de/SYNTHETISCH/person" }]; }]) {
        const p = clone(base); mutate(p); rehash(p);
        A.throws(() => P.pruefePaket(p), /paket-nicht-selbstgeneriert-oder-drift/);
      }
    });
    test("Profile/Inhalte/Freigaben/Generatorversion und Hashbindungen bleiben kanonisch fail closed", () => {
      for (const mutate of [p => { p.profile[0].aktiv = true; }, p => { p.freigaben.import = true; },
        p => { p.freigaben.teststart = true; }, p => { p.generator.version += "fremd"; },
        p => { p.profile[0].themen = ["Nachtraeglich gewuenschter Treffer"]; },
        p => { p.bindung.idsHash = "0".repeat(64); }, p => { p.bindung.paketHash = "0".repeat(64); },
        p => { p.privateAuthkonten = []; }]) {
        const p = clone(base); mutate(p); A.throws(() => P.pruefePaket(p), /synthetik500-/);
      }
    });
    test("1500 eindeutige profilHash-gebundene Sollpaare alle ausstehend ohne Ergebnis/Urteil", () => {
      const rows = base.erwartungen.sollpositionen, profiles = new Map(base.profile.map(p => [p.mandatsId, p]));
      A.equal(rows.length, 1500); A.equal(new Set(rows.map(r => r.mandatsId + "|" + r.bereich)).size, 1500);
      for (const b of P.BEREICHE) A.equal(rows.filter(r => r.bereich === b).length, 500);
      for (const r of rows) {
        A.equal(r.status, "ausstehend"); A.equal(r.fachstatus, "ausstehend"); A.equal(r.ergebnisHash, null);
        A.equal(r.profilHash, P.hash(profiles.get(r.mandatsId)));
      }
      const p = clone(base); p.erwartungen.sollpositionen[0].status = "bestanden"; rehash(p);
      A.throws(() => P.pruefePaket(p), /paket-nicht-selbstgeneriert-oder-drift/);
    });
    test("Ueber-dich bleibt erwartetes ehrliches Leer und ist keine Nachrichtenauswertung/Fachabnahme", () => {
      A.deepEqual(base.erwartungen.ueberDich, { erwartet: "leer-kein-realer-Personenbezug", status: "ausstehend", erfundenerNachrichtenbezugErlaubt: false });
      const m = P.metadaten(base);
      A.equal(m.geprueft, 0); A.equal(m.ausstehend, 1500); A.equal(m.funktionsnachweis500, false);
      A.equal(m.fachabnahme, false); A.equal(m.aktivierungFreigegeben, false); A.equal(m.importfreigegeben, false);
      A.throws(() => V.pruefePaket(P.serialisiere(base)), /real500-paket-version-menge/);
    });
    test("Serialisierung regeneriert kanonisch und laesst verstecktes fremdes toJSON wirkungslos", () => {
      const p = clone(base); Object.defineProperty(p, "toJSON", { value: () => ({ vollname: "Echte Person" }) });
      A.deepEqual(JSON.parse(P.serialisiere(p)), base);
      A.deepEqual(P.pruefePaket(JSON.parse(P.serialisiere(base))), P.metadaten(base));
    });
    test("CLI Default gibt nur Mengen/Hashes/Sperren aus; keine Rohprofile oder Aktivierung", () => {
      const { result, stdout } = capture(() => C.main([]));
      A.equal(result.privateDateiErstellt, false); A.equal(result.profile, 500);
      A.doesNotMatch(stdout, /vollname|Fiktive Testperson|test-kohorte-synthetik-|wahlkreis|INSERT|UPDATE/);
      for (const argv of [["--input", "person.json"], ["--aktivieren", "true"], ["--variante", "basis-v1", "--variante", "basis-v1"], ["--out"], ["--out", " "]])
        A.throws(() => C.main(argv), /cli-argumente/);
    });
    test("Private0600-Datei ausserhalb Gitroot wird kanonisch geschrieben; O_EXCL erhaelt bestehende Datei", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "synthetik500-private-test-"));
      try {
        const out = path.join(dir, "profiles.json");
        const { stdout } = capture(() => C.main(["--variante", "kontrast-v1", "--out", out]));
        A.equal(fs.statSync(out).mode & 0o777, 0o600);
        A.deepEqual(JSON.parse(fs.readFileSync(out, "utf8")), P.erzeuge({ variante: "kontrast-v1" }));
        A.doesNotMatch(stdout, /Fiktive Testperson|vollname|themen|test-kohorte-synthetik-/);
        const before = fs.readFileSync(out); A.throws(() => capture(() => C.main(["--out", out])));
        A.deepEqual(fs.readFileSync(out), before);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    test("Eigener/fremder Gitroot, Worktree-Verweis und Symlink-Umweg sperren vor jeder Dateioeffnung", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "synthetik500-path-test-")), root = path.resolve(__dirname, "..");
      try {
        const refRoot = path.join(dir, "worktree"), headRoot = path.join(dir, "gitroot");
        fs.mkdirSync(refRoot); fs.writeFileSync(path.join(refRoot, ".git"), "gitdir: " + path.join(root, ".git") + "\n");
        fs.mkdirSync(path.join(headRoot, ".git"), { recursive: true }); fs.writeFileSync(path.join(headRoot, ".git", "HEAD"), "ref: refs/heads/test\n");
        fs.symlinkSync(refRoot, path.join(dir, "symlink"));
        const originalOpen = fs.openSync; let opened = 0;
        try {
          fs.openSync = () => { opened++; throw new Error("Dateioeffnung unzulaessig"); };
          for (const parent of [root, refRoot, headRoot, path.join(dir, "symlink")])
            A.throws(() => C.main(["--out", path.join(parent, "synthetik-private.json")]), /ausgabe-im-repository/);
        } finally { fs.openSync = originalOpen; }
        A.equal(opened, 0);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    test("Bestehender Ausgabesymlink wird nicht verfolgt oder ueberschrieben", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "synthetik500-symlink-test-"));
      try {
        const actual = path.join(dir, "actual.json"), out = path.join(dir, "link.json");
        fs.writeFileSync(actual, "unveraenderter Marker"); fs.symlinkSync(actual, out);
        A.throws(() => capture(() => C.main(["--out", out])));
        A.equal(fs.readFileSync(actual, "utf8"), "unveraenderter Marker"); A.equal(fs.lstatSync(out).isSymbolicLink(), true);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    test("Generator benoetigt keine Personen-/Dateiquelle, Umgebung, Uhr oder Netz", () => {
      const read = fs.readFileSync, clock = Date.now;
      try {
        fs.readFileSync = () => { throw new Error("Personenquelle unerlaubt"); }; Date.now = () => { throw new Error("Uhr unerlaubt"); };
        A.deepEqual(P.erzeuge(), base);
      } finally { fs.readFileSync = read; Date.now = clock; }
    });
  } finally { global.fetch = originalFetch; }
  console.log(`${pass}/${pass} neue Synthetikpaket-Offlinetests gruen. Keine Provisionierung/Aktivierung/Fachabnahme.`);
}
if (require.main === module) { try { main(); } catch (error) { console.error("FAIL " + error.message); process.exitCode = 1; } }
module.exports = { main };
