"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const D = require("../lib/helmut/testkohorte-direkt500");
const R = require("../lib/helmut/quellenkontext-ruheziel");
const G = require("./github-quellenkontext-500");
const A = require("./github-direkt500");
const { bestand, auswahl } = require("./fixtures/quellenkontext-ruhe");
const { fixture } = require("./github-quellenkontext-500-test");
const { kopie, env, JETZT, SHA } = require("./fixtures/direkt500");
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
function ruhend() {
  const f = fixture();
  f.bestand = bestand();
  f.args.bestand = f.bestand;
  f.args.bestandsauswahl = [...auswahl];
  f.args.snapshot = async () => kopie(f.bestand);
  const db = f.args.db;
  f.args.db = async p => p.startsWith("mandate_profiles?")
    ? f.bestand.mandate.filter(m => m.aktiv).slice(0, 1).map(m => ({ user_id: m.user_id })) : db(p);
  return f;
}
async function main() {
  await test("Genau 495 synthetische plus fuenf explizite Bestandprofile; vier bleiben ausgeschlossen", () => {
    const s = bestand(), before = D.hash(s), z = R.pruefe(s, auswahl);
    assert.equal(z.ids.length, 500); assert.equal(new Set(z.ids).size, 500);
    assert.deepEqual(z.ausserhalb, ["bestand-5", "bestand-6", "bestand-7", "bestand-8"]);
    assert.deepEqual(R.pruefe(s, [...auswahl].reverse()), z);
    assert.equal(D.hash(s), before); assert.equal(s.mandate.filter(m => m.aktiv).length, 0);
    assert.equal(s.auth.users.filter(u => u.active).length, 3, "Profilinaktivitaet aendert kein Konto");
  });
  await test("Keine Ableitung aus Konten und kein Fallback bei fehlender, doppelter oder fremder Auswahl", () => {
    for (const x of [null, [], auswahl.slice(1), [...auswahl, "bestand-5"], [...auswahl.slice(1), auswahl[1]],
      [...auswahl.slice(1), "fremd"], [...auswahl.slice(1), D.ALLE_KENNUNGEN[0]], [...auswahl.slice(1), "admin-fixture"]])
      assert.throws(() => R.pruefe(bestand(), x), D.DirektAbbruch);
    for (const x of [undefined, "", "{", "null", "[]"])
      assert.throws(() => R.ausUmgebung(bestand(), x), D.DirektAbbruch);
    assert.equal(R.ausUmgebung(bestand(), JSON.stringify(auswahl)).ids.length, 500);
  });
  await test("Ein aktives Profil in jeder Teilmenge oder ein defektes Testkonto sperrt den ruhenden Weg", () => {
    for (const id of ["bestand-0", "bestand-8", D.ALLE_KENNUNGEN[0]]) {
      const s = bestand(); s.mandate.find(m => m.user_id === id).aktiv = true;
      assert.throws(() => R.pruefe(s, auswahl), D.DirektAbbruch);
    }
    for (const mutate of [s => s.mandate.pop(), s => s.mandate.push(s.mandate[0]),
      s => { s.auth.users.find(u => u.politicianId === D.ALLE_KENNUNGEN[0]).active = true; }]) {
      const s = bestand(); mutate(s); assert.throws(() => R.pruefe(s, auswahl), D.DirektAbbruch);
    }
  });
  await test("Alter Fuenfervertrag und Aktivierungsrechte bleiben getrennt", async () => {
    assert.throws(() => D.pruefeSnapshot(bestand(), "500-bestand"), D.DirektAbbruch);
    const f = fixture(); assert.equal((await G.ausfuehren(f.args)).ok, true);
    let writes = 0;
    const r = await D.fuehreAus({ vorgang: "quellenkontext-ruhe", env: env("quellenkontext-ruhe"),
      deps: { schreibe: () => { writes++; } } });
    assert.equal(r.ok, false); assert.equal(writes, 0);
    assert.notEqual(D.WORTE["quellenkontext-ruhe"], D.WORTE.quellenkontext);
  });
  await test("Echter Quellenreparaturpfad ergaenzt Originalauszuege bei null aktiven Profilen", async () => {
    const f = ruhend(), before = D.hash(f.bestand), r = await G.ausfuehren(f.args);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.ergaenzt, 2);
    assert.equal(r.modellaufrufe, 0); assert.equal(r.gepruefteProfile, 500);
    assert.equal(r.zielHash, R.pruefe(f.bestand, auswahl).zielHash);
    assert.equal(D.hash(f.bestand), before); assert.equal(f.writes, 2); assert.equal(f.locked, false);
  });
  await test("Zwischenzeitliche Aktivierung stoppt vor erstem Quellenabruf und erstem Inhaltsschreiben", async () => {
    const f = ruhend(); f.args.pruefeBetrieb = async () => { f.bestand.mandate[0].aktiv = true; };
    const r = await G.ausfuehren(f.args);
    assert.equal(r.ok, false); assert.equal(r.grund, "quellenkontext-ruhe-profil-aktiviert");
    assert.equal(f.writes, 0); assert.equal(f.fetches, 0); assert.equal(f.locked, false);
  });
  await test("Sessions, Passwortbelege und main gehoeren zur unveraenderten Grundlinie", async () => {
    for (const mutate of [s => { s.auth.sessions[0].expiresAt = "2028-01-01T00:00:00Z"; },
      s => { s.auth.passwordTokens.push({ id: "offline-token" }); }, s => { s.main.crawlRuns.pop(); }]) {
      const f = ruhend(); f.args.snapshot = async () => { const s = kopie(f.bestand); mutate(s); return s; };
      const r = await G.ausfuehren(f.args);
      assert.equal(r.ok, false); assert.equal(r.grund, "quellenkontext-profilbestand-veraendert");
    }
  });
  await test("Unklarer Schreibausgang wird nicht wiederholt oder als Erfolg gemeldet", async () => {
    const f = ruhend(); f.fail = "ruecklesung";
    const r = await G.ausfuehren(f.args);
    assert.equal(r.ok, false); assert.equal(r.zustandUnbekannt, true);
    assert.equal(f.writes, 1); assert.equal(f.fetches, 1); assert.equal(f.locked, false);
  });
  await test("CLI und Adapter bleiben ohne scharfen Auftrag frei von Netz und Profilwriter", async () => {
    const r = await A.ausfuehren({ vorgang: "quellenkontext-ruhe", env: {},
      fetchFn: () => { throw Error("Kein Netz"); }, schreibe: () => { throw Error("Kein Profilwrite"); } });
    assert.equal(r.modus, "trockenlauf"); assert.equal(r.profileSchreiben, false);
    const cli = spawnSync(process.execPath, ["scripts/testkohorte-vorwaerts.js", "quellenkontext-ruhe", "--ziel=500"], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr); assert.equal(JSON.parse(cli.stdout).aktiveProfileNachher, 0);
    const wrong = await A.ausfuehren({ vorgang: "quellenkontext-ruhe", scharf: true,
      env: env("quellenkontext"), now: () => new Date(JETZT), fetchFn: () => { throw Error("Kein Netz"); } });
    assert.equal(wrong.grund, "direktfreigabe-fehlt");
  });
  await test("Production Adapter bindet die explizite Auswahl erst nach Laufzeit und Bestandsschutz", async () => {
    const s = bestand(), config = { ...fixture().args.config, ok: true, schemaVersion: 1,
      reinLesend: true, production: true, commit: SHA, storageSupabase: true, v3Bereit: true,
      profileRelational: true, profileExclusive: true, retentionGueltig: true, retention: 36,
      kommunikationGesperrt: true, kohortenQuellenGesperrt: true, tagesdeckel: 2416,
      understandingReserve: 702, vorrangreserveReal: 200 };
    const vars = { ...env("quellenkontext-ruhe"),
      HELMUT_QUELLENKONTEXT_BESTANDSPROFILE: JSON.stringify(auswahl) };
    const alt = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
    const runner = G.ausfuehren;
    let calls = 0;
    const fetchFn = async (url, opts) => {
      assert.equal(opts.method, "GET", "Der Adapter selbst darf kein Profil schreiben");
      const u = new URL(url), table = u.pathname.split("/").pop();
      let body;
      if (table === "testnachweis-status") body = config;
      else if (table === "mandate_profiles") body = s.mandate;
      else if (table === "profiles") body = s.identitaeten;
      else if (table === "helmut_store") body = [{ data: u.searchParams.get("id") === "eq.main-auth" ? s.auth : s.main }];
      else if (table === "llm_budget_counters") body = [{ used: 0 }];
      else if (["pipeline_locks", "helmut_jobs", "helmut_job_outbox"].includes(table)) body = [];
      else throw Error("Unerwarteter Adapterzugriff: " + table);
      return { status: 200, json: async () => kopie(body) };
    };
    try {
      Object.assign(process.env, vars);
      G.ausfuehren = async args => {
        calls++; assert.deepEqual(args.bestandsauswahl, auswahl);
        assert.equal(args.bestand.mandate.filter(m => m.aktiv).length, 0);
        assert.equal(args.env.HELMUT_ATOMIC_LOCK, "1");
        return { ok: true, vorgang: "quellenkontext-ruhe", modellaufrufe: 0 };
      };
      const args = { vorgang: "quellenkontext-ruhe", scharf: true, env: process.env,
        fetchFn, now: () => new Date(JETZT) };
      const r = await A.ausfuehren(args);
      assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(calls, 1);
      config.kommunikationGesperrt = false;
      assert.equal((await A.ausfuehren(args)).grund, "production-konfiguration-abweichend");
      assert.equal(calls, 1);
      config.kommunikationGesperrt = true;
      process.env.HELMUT_QUELLENKONTEXT_BESTANDSPROFILE = "[]";
      assert.equal((await A.ausfuehren(args)).grund, "quellenkontext-bestandsauswahl-ungueltig");
      assert.equal(calls, 1);
    } finally {
      G.ausfuehren = runner;
      for (const [k, value] of Object.entries(alt)) {
        if (value === undefined) delete process.env[k]; else process.env[k] = value;
      }
    }
  });
  console.log(`${pass}/${pass} Pruefgruppen bestanden`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
