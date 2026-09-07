"use strict";

const assert = require("assert/strict");
const { spawnSync } = require("child_process");
const D = require("../lib/helmut/testkohorte-direkt500");
const S = require("../lib/helmut/testkohorte-stufen");
const { welt, env, kopie, JETZT } = require("./fixtures/direkt500");
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
const lauf = (w, vorgang, extra = {}) => D.fuehreAus({ vorgang, env: env(vorgang),
  abnahmeA: w.beleg, deps: w.deps, ...extra });

async function main() {
  await test("Direktvertrag trifft genau 475; A/B/C bleiben getrennt", () => {
    assert.equal(D.KENNUNGEN.length, 475);
    assert.equal(new Set(D.KENNUNGEN).size, 475);
    assert(D.KENNUNGEN.every((id) => /^test-kohorte-[bc]-/.test(id)));
    assert.deepEqual(S.STUFEN, ["a", "b", "c"]);
    assert.equal(S.pruefeStufenReihenfolge("c", ["a"]).zulaessig, false);
    assert.notEqual(D.WORTE.provisionierung, D.WORTE.aktivierung);
  });
  await test("CLI Vorschau ist folgenlos und nennt 475 statt 495", () => {
    const r = spawnSync(process.execPath, ["scripts/lokal.js", "--", process.execPath,
      "scripts/testkohorte-vorwaerts.js", "provisionierung", "--ziel=500"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.zusaetzlicheProfile, 475);
    assert.equal(body.modus, "trockenlauf");
    assert.equal(body.schreibversuche, 0);
  });
  await test("CLI weist gemischte Ziele, Teilmengen und Pruefuhr zurueck", () => {
    for (const args of [["--stufe=c"], ["--gruppe=b"], ["--ids=test-kohorte-b-001"],
      ["--ziel=500"], ["--jetzt=2026-09-10T22:00:00Z"]]) {
      const r = spawnSync(process.execPath, ["scripts/lokal.js", "--", process.execPath,
        "scripts/testkohorte-vorwaerts.js", "provisionierung", "--ziel=500", ...args], { encoding: "utf8" });
      assert.equal(r.status, 2, r.stdout + r.stderr);
    }
  });
  await test("Keine Freigabe und fremdes Stufenwort schreiben keine Zeile", async () => {
    const w = welt();
    for (const freigabe of [{}, env("aktivierung"), { ...env("provisionierung"),
      HELMUT_TESTKOHORTE_CONFIRM: S.STUFEN_FREIGABEWORTE.b.provisionierung }]) {
      const r = await lauf(w, "provisionierung", { env: freigabe });
      assert.equal(r.grund, "direktfreigabe-fehlt");
    }
    assert.equal(w.writes(), 0);
  });
  await test("Fehlende, alte oder nur behauptete A Abnahme stoppt vor Write", async () => {
    for (const patch of [null, { bestanden: true, quellen: undefined }, { abgenommenAm: "2026-09-07T22:00:00.000Z" },
      { reservierungen: 100 }, { qualitaet: [] }, { quellen: {} }]) {
      const w = welt();
      const abnahmeA = patch === null ? null : { ...w.beleg, ...patch };
      const r = await lauf(w, "provisionierung", { abnahmeA });
      assert.equal(r.ok, false, JSON.stringify(r));
      assert.equal(w.writes(), 0);
    }
  });
  await test("Doppelte A Jobs und wartende Jobs werden nicht abgenommen", () => {
    const w = welt();
    for (const defekt of ["doppelt", "wartend"]) {
      const a = kopie(w.beleg);
      if (defekt === "doppelt") a.auftraege[0] = a.auftraege[1];
      else a.auftraege[0].status = "wartend";
      assert.throws(() => D.pruefeAbnahmeA(a, new Date(JETZT)), D.DirektAbbruch);
    }
  });
  const komplett = welt();
  await test("Echter Provisionierer legt 475 inaktiv an, ohne Kontoloeschung", async () => {
    const r = await lauf(komplett, "provisionierung");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.bestaetigt, 475);
    assert.equal(r.gesamt, 504);
    assert.equal(r.aktiv, 25);
    assert.equal(komplett.users.length, 500);
    assert.equal(komplett.users.filter((u) => u.active).length, 3);
    assert.equal(komplett.deletes(), 0);
  });
  await test("Wiederaufnahme einer fertigen Anlage ist ohne weitere Writes", async () => {
    const vorher = komplett.writes();
    const r = await lauf(komplett, "provisionierung");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.schreibversuche, 0);
    assert.equal(r.bereitsVorhanden, 475);
    assert.equal(komplett.writes(), vorher);
  });
  await test("Echter Aktivierer erreicht exakt 500 und behaelt Inhalte und Konten", async () => {
    const vorher = D.pruefeSnapshot(komplett.snapshot(), "aktivierung");
    const r = await lauf(komplett, "aktivierung");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.aktiv, 500);
    assert.equal(r.gesamt, 504);
    assert.equal(r.funktionsnachweis500, false);
    const nachher = D.pruefeSnapshot(komplett.snapshot(), "aktivierung");
    assert.equal(nachher.geschuetzterBestandHash, vorher.geschuetzterBestandHash);
    assert.equal(nachher.kontenHash, vorher.kontenHash);
    assert.equal(nachher.crawlRunsHash, vorher.crawlRunsHash);
  });
  await test("Aktivierung vor vollstaendiger Anlage schreibt nichts", async () => {
    const w = welt();
    const r = await lauf(w, "aktivierung");
    assert.equal(r.ok, false);
    assert.equal(w.writes(), 0);
  });
  await test("Erster Schreibfehler stoppt vor der naechsten Kennung", async () => {
    const w = welt();
    const normal = w.deps.schreibe;
    let versuche = 0;
    w.deps.schreibe = async (arg) => ++versuche === 3 ? { ok: false } : normal(arg);
    const r = await lauf(w, "provisionierung");
    assert.equal(r.ok, false);
    assert.equal(r.bestaetigt, 2);
    assert.equal(versuche, 3);
    assert.equal(r.teilbestandMoeglich, true);
    assert.equal(w.deletes(), 0);
  });
  await test("Vollstaendige inaktive Teilmenge laesst sich sicher fortsetzen", async () => {
    const w = welt();
    const normal = w.deps.schreibe;
    let versuche = 0;
    w.deps.schreibe = async (arg) => ++versuche === 3 ? { ok: false } : normal(arg);
    await lauf(w, "provisionierung");
    w.deps.schreibe = normal;
    const r = await lauf(w, "provisionierung");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.bereitsVorhanden, 2);
    assert.equal(r.bestaetigt, 473);
  });
  await test("Halbes Konto wird erkannt und weder geloescht noch uebernommen", async () => {
    const w = welt();
    w.users.push({ id: "halb", politicianId: D.KENNUNGEN[0], active: false });
    const r = await lauf(w, "provisionierung");
    assert.equal(r.grund, "unvollstaendiger-kohortenteilbestand");
    assert.equal(w.writes(), 0);
    assert.equal(w.deletes(), 0);
  });
  await test("Verschwindendes Zeitfenster stoppt zwischen zwei Profilen", async () => {
    const w = welt();
    w.deps.jetzt = () => new Date(w.writes() ? "2026-09-11T04:00:00.000Z" : JETZT);
    const r = await lauf(w, "provisionierung");
    assert.equal(r.grund, "direktausbau-ausserhalb-des-nachtfensters");
    assert.equal(w.writes(), 1);
  });
  await test("Fremde Profilaenderung und gekuerzter Ring stoppen den Stapel", async () => {
    for (const art of ["profil", "ring"]) {
      const w = welt();
      const normal = w.deps.schreibe;
      w.deps.schreibe = async (arg) => {
        const r = await normal(arg);
        if (art === "profil") w.mandate.get("bestand-0").partei = "VERAENDERT";
        else w.main.crawlRuns.pop();
        return r;
      };
      const r = await lauf(w, "provisionierung");
      assert.equal(r.grund, "geschuetzter-bestand-veraendert");
      assert.equal(w.writes(), 10);
    }
  });
  console.log(`\n${pass} PASS, 0 FAIL`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
