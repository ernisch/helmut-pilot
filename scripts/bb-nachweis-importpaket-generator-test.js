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
const PROV = require(path.join(ROOT, "lib", "helmut", "provisioning.js"));

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
async function checkAsync(name, fn) {
  try {
    await fn();
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

async function main() {
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

  // ── 5 · Provisionierungs-Spec-Pfad: exakt zwei, inaktiv, provisionBatch-kompatibel ───────
  abschnitt("5 · Provisionierungs-Spec: exakt zwei inaktive Landtagsprofile");
  const specGebaut = GEN.baueProvisionierungsSpecs(quelle, {
    quelle: { pfad: "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json", sha256: "d".repeat(64) }
  });
  check("5.1 Spec-Bauevorgang ist ok", () => assert.equal(specGebaut.ok, true, JSON.stringify(specGebaut.fehler)));
  const spezifikation = specGebaut.spezifikation;
  const specs = spezifikation.mandate;
  check("5.2 Genau zwei Provisionierungs-Specs", () => assert.equal(specs.length, 2));
  check("5.3 Genau die zwei vorbestimmten IDs", () => assert.deepEqual(
    specs.map((s) => s.id).sort(), [ID_BERLIN, ID_BRANDENBURG].sort()
  ));
  check("5.4 Beide Specs sind inaktiv und nicht importfreigegeben", () => {
    assert.equal(spezifikation.importfreigegeben, false);
    assert.equal(spezifikation.aktivierung, false);
    assert.ok(specs.every((s) => s.aktiv === false && s.importfreigegeben === false));
  });
  check("5.5 Land/Parlament sind je Spec korrekt", () => {
    const b = specs.find((s) => s.id === ID_BERLIN);
    const br = specs.find((s) => s.id === ID_BRANDENBURG);
    assert.equal(b.parliamentType, "Landtag");
    assert.equal(b.state, "Berlin");
    assert.equal(br.parliamentType, "Landtag");
    assert.equal(br.state, "Brandenburg");
  });
  check("5.6 AfD-Sperre greift fuer Partei und Fraktion in beiden Specs", () => {
    assert.ok(specs.every((s) => !SZ.istAusgeschlossen({ party: s.party, faction: s.faction })));
  });
  check("5.7 Amtliche Quellen mit Hash sind in beiden Specs enthalten", () => {
    for (const s of specs) {
      assert.ok(Array.isArray(s.offizielleQuellen) && s.offizielleQuellen.length > 0, `${s.id} ohne Quelle`);
      assert.ok(s.offizielleQuellen.every((q) => /^https:\/\//i.test(q.url) && /^[0-9a-f]{64}$/i.test(q.sha256)));
    }
  });
  check("5.8 Specs sind fuer provisioning.validateSpec ohne Fehler", () => {
    for (const s of specs) assert.deepEqual(PROV.validateSpec(s), []);
  });
  await checkAsync("5.9 provisionBatch-Trockenlauf plant genau zwei inaktive Anlagen — rein im Speicher", async () => {
    const profile = new Map();
    const users = [];
    const deps = {
      env: {},
      storage: {
        getProfile: async (id) => (profile.has(id) ? { ...profile.get(id) } : null),
        saveProfile: async () => { throw new Error("Trockenlauf darf nicht schreiben"); }
      },
      accounts: {
        normalizeEmail: (email) => String(email || "").trim().toLowerCase(),
        listUsers: async () => users.map((u) => ({ ...u })),
        createUser: async () => { throw new Error("Trockenlauf darf kein Konto anlegen"); },
        updateUser: async () => { throw new Error("Trockenlauf darf kein Konto aendern"); }
      }
    };
    const batch = await PROV.provisionBatch(specs, deps, { ausfuehren: false });
    assert.equal(batch.ok, true, JSON.stringify(batch.vorbefunde));
    assert.equal(batch.trockenlauf, true);
    assert.equal(batch.bilanz.geplant, 2);
    assert.equal(batch.bilanz.blockiert, 0);
    assert.ok(batch.ergebnisse.every((e) => e.vorhaben === "anlegen-inaktiv" && e.zielAktiv === false));
  });
  check("5.10 --spec-out verlangt einen expliziten Ausgabepfad", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--paket", GEN.PAKET_PFAD, "--spec-out"], { cwd: ROOT, encoding: "utf8", env });
    assert.equal(r.status, 2, `status=${r.status} stderr=${r.stderr}`);
  });
  check("5.11 --spec-out ausserhalb des OS-Temp-Verzeichnisses wird abgelehnt und schreibt nichts", () => {
    const pfad = path.join(ROOT, `.bb-spec-out-reject-${process.pid}-${Date.now()}.json`);
    const existierteVorher = fs.existsSync(pfad);
    try {
      assert.equal(existierteVorher, false, "Testpfad war unerwartet vorbelegt");
      const r = spawnSync(process.execPath, [SCRIPT, "--paket", GEN.PAKET_PFAD, "--spec-out", pfad], { cwd: ROOT, encoding: "utf8", env });
      assert.equal(r.status, 2, `status=${r.status} stderr=${r.stderr}`);
      assert.equal(fs.existsSync(pfad), false, "es darf keine Datei ausserhalb des Temp-Pfads entstehen");
    } finally {
      if (!existierteVorher && fs.existsSync(pfad)) fs.rmSync(pfad, { force: true });
    }
  });
  check("5.12 --spec-out schreibt genau die Temp-Datei und ist deterministisch", () => {
    const out = path.join(tmp, "provisionierung.json");
    const r = spawnSync(process.execPath, [SCRIPT, "--paket", GEN.PAKET_PFAD, "--spec-out", out], { cwd: ROOT, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stderr);
    const datei = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.deepEqual(datei.mandate.map((s) => s.id).sort(), [ID_BERLIN, ID_BRANDENBURG].sort());
    assert.equal(datei.importfreigegeben, false);
    assert.equal(datei.aktivierung, false);
    assert.ok(datei.quelle.pfad.includes("daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json"));
    const erwartet = GEN.serialisiereProvisionierungsSpecs(GEN.baueProvisionierungsSpecs(GEN.ladeQuelle(GEN.PAKET_PFAD), {
      quelle: { pfad: "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json", sha256: GEN.hashDateiSync(GEN.PAKET_PFAD) }
    }).spezifikation);
    assert.equal(fs.readFileSync(out, "utf8"), erwartet);
  });
  check("5.13 --spec-out ist nicht mit --json kombinierbar", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--paket", GEN.PAKET_PFAD, "--spec-out", path.join(tmp, "x.json"), "--json"], { cwd: ROOT, encoding: "utf8", env });
    assert.equal(r.status, 2, `status=${r.status} stderr=${r.stderr}`);
  });
  check("5.14 --spec-out ueberschreibt keinen vorhandenen Operator-Spec", () => {
    const out = path.join(tmp, "provisionierung-bestehend.json");
    fs.writeFileSync(out, "unveraendert\n", { encoding: "utf8", mode: 0o600 });
    const r = spawnSync(process.execPath, [SCRIPT, "--paket", GEN.PAKET_PFAD, "--spec-out", out], { cwd: ROOT, encoding: "utf8", env });
    assert.equal(r.status, 3, `status=${r.status} stderr=${r.stderr}`);
    assert.equal(fs.readFileSync(out, "utf8"), "unveraendert\n");
  });

  // ── 6 · Fail-closed-Negativfaelle des Provisionierungs-Spec-Pfads ────────────────────────
  abschnitt("6 · Provisionierungs-Spec fail-closed: fehlend / doppelt / dritte / AfD / aktiv / Freigabe / Ziel");
  const lehneProvisionierungAb = (aendern) => {
    const kopie = JSON.parse(JSON.stringify(quelle));
    aendern(kopie);
    const r = GEN.baueProvisionierungsSpecs(kopie, {});
    assert.equal(r.ok, false, "haette abgelehnt werden muessen");
    return r.fehler.join(" | ");
  };
  const ziel = (kopie, id) => kopie.profile.find((p) => p.mandatsId === id);
  check("6.1 fehlende Ziel-ID wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { q.profile = q.profile.filter((p) => p.mandatsId !== ID_BERLIN); }), /fehlt/
  ));
  check("6.2 doppelte Ziel-ID wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => {
      const p = ziel(q, ID_BERLIN);
      q.profile.push(JSON.parse(JSON.stringify(p)));
    }), /mehrfach/
  ));
  check("6.3 dritte ID wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { q.profile.push(synthetisch({ mandatsId: "landtag-berlin-dritte-synthetische" })); }),
    /ausserhalb der belegten Auswahl/
  ));
  check("6.4 AfD in der Partei wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { ziel(q, ID_BERLIN).partei = "AfD"; }), /AfD/
  ));
  check("6.5 AfD nur in der Fraktion wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { ziel(q, ID_BRANDENBURG).fraktion = "AfD-Fraktion"; }), /AfD/
  ));
  check("6.6 aktiv=true wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { ziel(q, ID_BERLIN).aktiv = true; }), /aktiv/
  ));
  check("6.7 importfreigegeben=true am Profil wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { ziel(q, ID_BERLIN).importfreigegeben = true; }), /importfreigegeben/
  ));
  check("6.8 Top-Level-Freigabe provisionierung=true wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { q.offlinePaket.importfreigabe.provisionierung = true; }), /importfreigabe\.provisionierung/
  ));
  check("6.9 falsches Parlament wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { ziel(q, ID_BERLIN).parlament = "landtag-brandenburg"; }), /Parlament/
  ));
  check("6.10 falsches Bundesland wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { ziel(q, ID_BRANDENBURG).bundesland = "Bayern"; }), /Bundesland/
  ));
  check("6.11 fehlender Quellen-Hash wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { ziel(q, ID_BERLIN).offizielleQuellen[0].sha256 = ""; }), /Hash/
  ));
  check("6.12 fehlende amtliche Profilquelle wird abgelehnt", () => assert.match(
    lehneProvisionierungAb((q) => { ziel(q, ID_BERLIN).offizielleQuellen = []; }), /amtliche/
  ));

  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\nERGEBNIS: ${pass} bestanden, ${fail} fehlgeschlagen`);
  if (fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("TESTFEHLER", e);
  process.exitCode = 1;
});

module.exports = {};
