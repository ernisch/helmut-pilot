"use strict";
const assert = require("node:assert/strict");
const T = require("../lib/helmut/testkohorte-testende");
const D = require("../lib/helmut/testkohorte-direkt500");
const P = require("../lib/helmut/provisioning");
const G = require("./github-testende-500");
const { welt, env, SHA } = require("./fixtures/direkt500");
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const endeEnv = () => ({ ...env("aktivierung"), HELMUT_TESTKOHORTE_CONFIRM: T.CONFIRM });
function kontext() {
  const w = welt();
  return { w, args: { scharf: true, env: endeEnv(), deps: {
    snapshot: async () => w.snapshot(), leseZiel: async id => w.mandate.get(id),
    deaktiviere: id => P.setTestProfileParticipation(id, false, { storage: w.storage, accounts: w.accounts })
  } } };
}
function adapter() {
  const h = kontext(), anfragen = [];
  const config = { ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: SHA,
    storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
    retentionGueltig: true, retention: 36, kommunikationGesperrt: true,
    kohortenQuellenGesperrt: true, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200 };
  const args = { scharf: true, env: endeEnv(), deaktiviere: h.args.deps.deaktiviere,
    fetchFn: async (url, opts) => {
      assert.equal(opts.method, "GET"); anfragen.push(url); const u = new URL(url);
      const s = h.w.snapshot(); const table = u.pathname.split("/").pop(); let body;
      if (table === "testnachweis-status") body = config;
      else if (table === "mandate_profiles") {
        const id = u.searchParams.get("user_id")?.slice(3);
        body = id ? s.mandate.filter(m => m.user_id === id) : s.mandate;
      } else if (table === "profiles") body = s.identitaeten;
      else if (table === "helmut_store") body = [{ data: s.auth }];
      else throw new Error("Unerwarteter Netzpfad");
      return { status: 200, json: async () => body };
    } };
  return { ...h, args, config, anfragen };
}
(async () => {
  await test("Vorpruefung beschreibt 20 Ziele ohne Schreiben", async () => {
    const h = kontext(); const r = await T.ausfuehren({ ...h.args, scharf: false });
    assert.equal(r.ok, true); assert.equal(r.zuDeaktivieren, 20); assert.equal(h.w.writes(), 0);
  });
  await test("Fehlendes Wort sperrt vor jedem Lesen und Schreiben", async () => {
    const h = kontext(); h.args.env.HELMUT_TESTKOHORTE_CONFIRM = "falsch";
    h.args.deps.snapshot = () => { throw new Error("Kein Lesen erwartet"); };
    assert.equal((await T.ausfuehren(h.args)).grund, "testende-freigabe-fehlt"); assert.equal(h.w.writes(), 0);
  });
  await test("Echter Rueckbau deaktiviert alle 495 und bewahrt fuenf aktive Profile", async () => {
    const h = kontext();
    for (const vorgang of ["provisionierung", "aktivierung"]) {
      const r = await D.fuehreAus({ vorgang, env: env(vorgang), abnahmeA: h.w.beleg, deps: h.w.deps });
      assert.equal(r.ok, true, JSON.stringify(r));
    }
    const r = await T.ausfuehren(h.args);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.bestaetigtInaktiv, 495);
    assert.equal(r.aktiv, 5); assert.equal(r.gesamt, 504); assert.equal(h.w.deletes(), 0);
    assert.equal((await T.ausfuehren(h.args)).schreibversuche, 0);
  });
  await test("Ein Fehler bleibt offen, die anderen Profile werden einmal deaktiviert", async () => {
    const h = kontext(), writer = h.args.deps.deaktiviere; let calls = 0;
    h.args.deps.deaktiviere = async id => { calls++; if (id.endsWith("001")) throw new Error("Unbekannter Ausgang"); return writer(id); };
    const r = await T.ausfuehren(h.args); assert.equal(r.ok, false); assert.equal(calls, 20);
    assert.equal(r.verbleibendAktiv, 1); assert.equal(r.bestaetigtInaktiv, 19);
  });
  await test("Fremde Kohortenkennung und Loeschmarke verhindern Rueckbau", async () => {
    for (const art of ["kennung", "geloescht"]) {
      const h = kontext(); const row = h.w.mandate.get("test-kohorte-a-001");
      if (art === "kennung") row.user_id = "test-kohorte-fremd-001"; else row.geloescht_at = "2026-01-01T00:00Z";
      assert.equal((await T.ausfuehren(h.args)).ok, false); assert.equal(h.w.writes(), 0);
    }
  });
  await test("Ungefragte Profilinhaltsaenderung bleibt ein Fehler", async () => {
    const h = kontext(), writer = h.args.deps.deaktiviere;
    h.args.deps.deaktiviere = async id => { const r = await writer(id); h.w.mandate.get(id).wahlkreis = "Fremde Aenderung"; return r; };
    assert.equal((await T.ausfuehren(h.args)).grund, "testende-hat-fremde-felder-veraendert");
  });
  await test("Adapter prueft Branch, Zielhost und Production vor jedem Write", async () => {
    for (const patch of [{ GITHUB_REF: "refs/heads/fremd" }, { SUPABASE_URL: "https://fremd.invalid" },
      { HELMUT_PRODUCTION_COMMIT: "b".repeat(40) }]) {
      const h = adapter(); Object.assign(h.args.env, patch);
      assert.equal((await G.ausfuehren(h.args)).ok, false); assert.equal(h.anfragen.length, 0); assert.equal(h.w.writes(), 0);
    }
  });
  await test("Adapter nutzt gelesenen Exklusivpfad und separaten Mandatsfilter", async () => {
    const h = adapter(); const r = await G.ausfuehren(h.args); assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.aktiv, 5); assert(h.anfragen.some(u => u.includes("user_id=eq.test-kohorte-a-001")));
    assert(h.anfragen.every(u => !u.includes("/api/cron/pipeline") && !u.includes("llm_budget_counters")));
  });
  await test("Abweichender Speicherpfad sperrt Adapter ohne Datenveraenderung", async () => {
    const h = adapter(); h.config.profileExclusive = false;
    assert.equal((await G.ausfuehren(h.args)).ok, false); assert.equal(h.w.writes(), 0);
  });
  console.log(`${passed}/${passed} Testendepruefungen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
