"use strict";

// Helmut — OFFLINE-TEST des lokalen Berlin-/Brandenburg-Input-Generators.
// =============================================================================================
// Rein lokal: liest ausschliesslich Repo-Dateien, schreibt nur in einen expliziten Test-temp-Pfad,
// startet hoechstens den Generator als Kindprozess. KEIN Netzwerk, KEINE DB, KEIN Env-Zugriff,
// KEINE Production-Aktion, kein Commit/Push/PR.
//
// Aufruf:  node scripts/bb-nachweis-importpaket-generator-test.js

const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GEN = require(path.join(ROOT, "scripts", "bb-nachweis-importpaket-generator.js"));
const IMPORT = require(path.join(ROOT, "lib", "helmut", "profil-import.js"));
const SZ = require(path.join(ROOT, "lib", "helmut", "profil-zulassung.js"));

const ID_BERLIN = "landtag-berlin-burkard-dregger";
const ID_BRANDENBURG = "landtag-brandenburg-40618";
const SCRIPT = path.join(ROOT, "scripts", "bb-nachweis-importpaket-generator.js");

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`  FAIL  ${name} — ${e && e.message}`);
  }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// Synthetischer Negativfall — niemals Teil eines Pakets, nur zum Belegen der Sperren.
function synthetisch(ueber = {}) {
  return {
    mandatsId: "synthetisch-gegenprobe",
    vollname: "Synthetische Gegenprobe",
    parlament: "landtag-berlin",
    bundesland: "Berlin",
    partei: "CDU",
    fraktion: "CDU-Fraktion",
    wahlkreis: "Synthetischer Wahlkreis",
    ausschuesse: ["Ausschuss fuer Sport"],
    aktiv: false,
    offizielleQuellen: [{
      art: "parlament-profil",
      url: "https://www.parlament-berlin.de/SYNTHETISCH/profil",
      sha256: "a".repeat(64)
    }],
    ...ueber
  };
}
function paketMit(profile) {
  // Belegte Profilmenge, wie sie die kanonische Datei mitfuehrt. Im Negativfall wird nur die
  // Liste der Profile manipuliert — die Auswahl-/Abdeckungspruefung muss greifen.
  return {
    version: "helmut-mandatsprofil/1",
    offlinePaket: { profilstatus: profile.map((p) => ({ mandatsId: p.mandatsId, parlament: p.parlament })) },
    profile
  };
}

function main() {
  console.log("Helmut — Offline-Test Berlin-/Brandenburg-Input-Generator\n");

  const quelle = GEN.ladeQuelle(GEN.PAKET_PFAD);
  const originalJson = JSON.stringify(quelle);

  // ── 1 · Positivfall: genau die zwei IDs, valide Kernfelder, beide inaktiv ────────────────
  abschnitt("1 · Positivfall aus der kanonischen Datei");
  const gebaut = GEN.baueImportpaket(quelle, { quelle: { pfad: "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json", sha256: "b".repeat(64) } });
  check("1.1 Bauevorgang ist ok", () => assert.equal(gebaut.ok, true, JSON.stringify(gebaut.fehler)));
  const ausgabe = gebaut.paket;
  const paket = ausgabe.paket;
  check("1.2 Genau zwei Profile", () => assert.equal(paket.profile.length, 2));
  check("1.3 Genau die zwei vorbestimmten IDs", () => assert.deepEqual(
    paket.profile.map((p) => p.mandatsId).sort(), [ID_BERLIN, ID_BRANDENBURG].sort()
  ));
  check("1.4 Beide Profile sind exakt inaktiv", () => assert.ok(paket.profile.every((p) => p.aktiv === false)));
  check("1.5 Ausgabe ist importfreigegeben=false", () => {
    assert.equal(ausgabe.importfreigegeben, false);
    assert.equal(paket.version, IMPORT.VERTRAGSVERSION);
  });
  check("1.6 Partei ODER Fraktion zeigen keine AfD-Zugehoerigkeit", () => assert.ok(paket.profile.every((p) => SZ.istAusgeschlossen(p) === false)));
  check("1.7 Jedes Profil hat amtliche Quelle mit sha256", () => {
    for (const p of paket.profile) {
      const q = p.offizielleQuellen.find((x) => x.art === "parlament-profil");
      assert.ok(q, `${p.mandatsId} ohne amtliche Quelle`);
      assert.match(q.sha256, /^[0-9a-f]{64}$/i);
      assert.match(q.url, /^https:\/\//);
    }
  });
  check("1.8 Parlaemente/Bundeslaender passen", () => {
    const b = paket.profile.find((p) => p.mandatsId === ID_BERLIN);
    const br = paket.profile.find((p) => p.mandatsId === ID_BRANDENBURG);
    assert.equal(b.parlament, "landtag-berlin");
    assert.equal(b.bundesland, "Berlin");
    assert.equal(br.parlament, "landtag-brandenburg");
    assert.equal(br.bundesland, "Brandenburg");
  });
  check("1.9 Der Importvertrag akzeptiert das echte Ausgabepaket", () => {
    const ergebnis = IMPORT.pruefeImport(paket);
    assert.equal(ergebnis.ok, true, JSON.stringify(ergebnis.fehler));
    assert.equal(ergebnis.profile, 2);
    assert.equal(ergebnis.gueltig, 2);
  });
  check("1.10 Die kanonische Datei wurde inhaltlich nicht veraendert", () => assert.equal(JSON.stringify(quelle), originalJson));

  // ── 2 · Determinismus ────────────────────────────────────────────────────────────────────
  abschnitt("2 · Deterministische Ausgabe");
  check("2.1 Zwei Laeufe erzeugen byte-identischen JSON-Text", () => {
    const a = GEN.serialisiere(GEN.baueImportpaket(GEN.ladeQuelle(GEN.PAKET_PFAD), { quelle: { pfad: "x", sha256: "c".repeat(64) } }).paket);
    const b = GEN.serialisiere(GEN.baueImportpaket(GEN.ladeQuelle(GEN.PAKET_PFAD), { quelle: { pfad: "x", sha256: "c".repeat(64) } }).paket);
    assert.equal(a, b);
  });

  // ── 3 · Fail-closed-Negativfaelle (reine Funktion) ───────────────────────────────────────
  abschnitt("3 · Fail-closed: fehlend / doppelt / dritte / AfD / aktiv / Land / Quelle");
  const berlin = quelle.profile.find((p) => p.mandatsId === ID_BERLIN);
  const brandenburg = quelle.profile.find((p) => p.mandatsId === ID_BRANDENBURG);
  const lehntAb = (profilListe) => {
    const r = GEN.baueImportpaket(paketMit(profilListe), {});
    assert.equal(r.ok, false, "haette abgelehnt werden muessen");
    return r.fehler.join(" | ");
  };
  check("3.1 fehlende zweite Ziel-ID wird abgelehnt", () => assert.match(lehntAb([berlin]), /fehlt/));
  check("3.2 doppelte Ziel-ID wird abgelehnt", () => assert.match(lehntAb([berlin, berlin, brandenburg]), /mehrfach/));
  check("3.3 manipulierte dritte Person wird abgelehnt", () => {
    const dritte = synthetisch({
      mandatsId: "landtag-berlin-manipuliert-dritte",
      offizielleQuellen: [{ art: "parlament-profil", url: "https://www.parlament-berlin.de/SYNTHETISCH/dritte", sha256: "d".repeat(64) }]
    });
    // Belegte Menge = nur die zwei echten IDs; der dritte Eintrag ist nicht gedeckt.
    const fake = {
      version: "helmut-mandatsprofil/1",
      offlinePaket: { profilstatus: [berlin, brandenburg].map((p) => ({ mandatsId: p.mandatsId, parlament: p.parlament })) },
      profile: [berlin, brandenburg, dritte]
    };
    const r = GEN.baueImportpaket(fake, {});
    assert.equal(r.ok, false, "haette abgelehnt werden muessen");
    assert.match(r.fehler.join(" | "), /ausserhalb der belegten Auswahl/);
  });
  check("3.4 AfD in der Partei wird abgelehnt", () => assert.match(lehntAb([{ ...berlin, partei: "AfD" }, brandenburg]), /AfD/));
  check("3.5 AfD nur in der Fraktion wird abgelehnt", () => assert.match(lehntAb([berlin, { ...brandenburg, fraktion: "AfD-Fraktion" }]), /AfD/));
  check("3.6 fraktionslos mit fortbestehender AfD-Partei wird abgelehnt", () => assert.match(
    lehntAb([{ ...berlin, partei: "AfD", fraktion: "Fraktionslos", fraktionslos: true }, brandenburg]), /AfD/
  ));
  check("3.7 aktiv=true wird abgelehnt", () => assert.match(lehntAb([{ ...berlin, aktiv: true }, brandenburg]), /aktiv/));
  check("3.8 importfreigegeben=true wird abgelehnt", () => assert.match(lehntAb([{ ...berlin, importfreigegeben: true }, brandenburg]), /importfreigegeben/));
  check("3.9 falsches Bundesland wird abgelehnt", () => assert.match(lehntAb([{ ...berlin, bundesland: "Bayern" }, brandenburg]), /Bundesland/));
  check("3.10 fehlender Quellen-Hash wird abgelehnt", () => assert.match(
    lehntAb([{ ...berlin, offizielleQuellen: [{ art: "parlament-profil", url: "https://www.parlament-berlin.de/x" }] }, brandenburg]), /Hash/
  ));
  check("3.11 fehlende amtliche Profilquelle wird abgelehnt", () => assert.match(
    lehntAb([{ ...berlin, offizielleQuellen: [] }, brandenburg]), /amtliche Profilquelle/
  ));
  check("3.12 synthetischer AfD-Gegenfall wird von der Zulassung erkannt", () => {
    assert.equal(SZ.istAusgeschlossen(synthetisch({ partei: "AfD" })), true);
    assert.equal(SZ.istAusgeschlossen(synthetisch({ partei: "SPD", fraktion: "AfD-Fraktion" })), true);
    assert.equal(SZ.istAusgeschlossen(synthetisch({ partei: "SPD", fraktion: "SPD-Fraktion" })), false);
  });

  // ── 4 · CLI: Default ohne Output, expliziter temp-Pfad, stdout ───────────────────────────
  abschnitt("4 · CLI: standardmaessig kein Output, nur explizit in temp");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bb-nachweis-generator-"));
  const env = { ...process.env, HELMUT_SOURCE_MODE: "off" };
  check("4.1 ohne --out/--json endet fail-closed (Exit 2)", () => {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: "utf8", env });
    assert.equal(r.status, 2, `status=${r.status} stderr=${r.stderr}`);
    assert.deepEqual(fs.readdirSync(tmp), [], "es darf kein Output entstehen");
  });
  check("4.2 --json schreibt nur stdout, keinen persistenten Output", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--paket", GEN.PAKET_PFAD, "--json"], { cwd: ROOT, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    const paket = JSON.parse(r.stdout);
    assert.equal(paket.paket.profile.length, 2);
    assert.equal(paket.importfreigegeben, false);
    assert.ok(r.stdout.endsWith("\n"));
    assert.ok(paket.quelle.pfad.includes("daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json"));
  });
  check("4.3 expliziter temp-Pfad erzeugt genau die Datei und identischen Inhalt", () => {
    const out = path.join(tmp, "paket.json");
    const r = spawnSync(process.execPath, [SCRIPT, "--paket", GEN.PAKET_PFAD, "--out", out], { cwd: ROOT, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(fs.readdirSync(tmp), ["paket.json"]);
    const erwartet = GEN.serialisiere(GEN.baueImportpaket(GEN.ladeQuelle(GEN.PAKET_PFAD), {
      quelle: { pfad: "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json", sha256: GEN.hashDateiSync(GEN.PAKET_PFAD) }
    }).paket);
    assert.equal(fs.readFileSync(out, "utf8"), erwartet);
  });
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\nERGEBNIS: ${pass} bestanden, ${fail} fehlgeschlagen`);
  if (fail > 0) {
    process.exitCode = 1;
  }
}

main();

module.exports = {};
