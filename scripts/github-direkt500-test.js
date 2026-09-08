"use strict";

const assert = require("assert/strict");
const D = require("../lib/helmut/testkohorte-direkt500");
const G = require("./github-direkt500");
const { welt, env, kopie, JETZT, SHA } = require("./fixtures/direkt500");
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }

function kontext(vorgang = "provisionierung") {
  const w = welt();
  const anfragen = [];
  const config = { ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: SHA,
    storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
    retentionGueltig: true, retention: 36, kommunikationGesperrt: true,
    kohortenQuellenGesperrt: true, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200 };
  const h = { w, config, anfragen, locks: [], usage: [], counter: 124, jobFehler: false,
    pipeline: { ok: true, pfad: "warteschlange", tenants: 500,
      lauf: { laufId: "cron-pipeline-20260910220000-fixture" },
      lauftelemetrie: { start: true, ende: true, status: "success" },
      verarbeitung: { erledigt: 20, verarbeitet: 20, endgueltigFehlgeschlagen: 0 },
      weckVersand: { versendet: 0 } },
    quittungen: [{ run_id: "cron-pipeline-20260910220000-fixture", process: "warteschlange-pipeline",
      status: "success", processed_count: 20, failed_count: 0, started_at: JETZT, finished_at: JETZT }] };
  const antwort = (data) => ({ status: 200, json: async () => kopie(data) });
  h.args = { vorgang, scharf: true, env: env(vorgang), now: () => new Date(JETZT),
    ladeBeleg: () => kopie(w.beleg), schreibe: w.deps.schreibe,
    fetchFn: async (url, init) => {
      const u = new URL(url);
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error");
      assert(init.signal);
      anfragen.push(u);
      if (u.pathname === "/api/cron/testnachweis-status") return antwort(config);
      if (u.pathname === "/api/cron/pipeline") return antwort(h.pipeline);
      const table = u.pathname.split("/").pop();
      const s = w.snapshot();
      if (table === "mandate_profiles") {
        const id = u.searchParams.get("user_id")?.slice(3);
        return antwort(id ? s.mandate.filter((r) => r.user_id === id) : s.mandate);
      }
      if (table === "profiles") return antwort(s.identitaeten);
      if (table === "helmut_store") return antwort([{ data: u.searchParams.get("id") === "eq.main-auth"
        ? { ...s.auth, llmUsage: h.usage } : s.main }]);
      if (table === "pipeline_locks") return antwort(h.locks);
      if (table === "process_runs") return antwort(h.quittungen);
      if (table === "helmut_jobs" && u.searchParams.has("id")) return antwort(h.jobFehler ? [] : w.beleg.auftraege);
      if (table === "helmut_jobs" || table === "helmut_job_outbox") return antwort([]);
      if (table === "llm_budget_counters") return antwort([{ used: h.counter }]);
      throw new Error("Unerwarteter Zugriff: " + table);
    } };
  // Ein vollstaendig protokollierter Tagesverbrauch; keine synthetische Null
  // trotz positiver Reservierung. Geldbetrag ist ausschliesslich Testdaten.
  h.usage = Array.from({ length: 124 }, () => ({ createdAt: JETZT, model: "gpt-5-mini", estimatedCost: 0.003 }));
  return h;
}

async function bereitZumFachzyklus() {
  const h = kontext("fachzyklus");
  for (const vorgang of ["provisionierung", "aktivierung"]) {
    const r = await D.fuehreAus({ vorgang, env: env(vorgang), abnahmeA: h.w.beleg, deps: h.w.deps });
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  return h;
}

async function main() {
  await test("Trockenlauf greift weder auf Belege noch auf Netz oder Writer zu", async () => {
    const r = await G.ausfuehren({ vorgang: "aktivierung", env: {},
      fetchFn: () => { throw new Error("Kein Netz"); }, ladeBeleg: () => { throw new Error("Kein Dateilesen"); } });
    assert.equal(r.modus, "trockenlauf");
    assert.equal(r.schreibversuche, 0);
  });
  await test("Falscher Branch, Commit, Zielhost oder Bestaetigung sperrt vor Netz", async () => {
    for (const patch of [{ GITHUB_REF: "refs/heads/fremd" }, { HELMUT_PRODUCTION_COMMIT: "b".repeat(40) },
      { SUPABASE_URL: "https://anderer-dienst.invalid" }, { HELMUT_TESTKOHORTE_CONFIRM: D.WORTE.aktivierung }]) {
      const h = kontext();
      const r = await G.ausfuehren({ ...h.args, env: { ...h.args.env, ...patch } });
      assert.equal(r.ok, false);
      assert.equal(h.anfragen.length, 0);
      assert.equal(h.w.writes(), 0);
    }
  });
  await test("Vorpruefung erlaubt direkten Test ohne A Abnahme und bleibt lesend", async () => {
    const h = kontext("vorpruefung");
    const r = await G.ausfuehren({ ...h.args, scharf: false,
      ladeBeleg: () => { throw new D.DirektAbbruch("a-abnahmedatei-fehlt-oder-ungueltig"); } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.reinLesend, true);
    assert.equal(r.aktiv, 25);
    assert.equal(r.aAbnahmeErforderlich, false);
    assert.equal(r.nachtfensterErforderlich, false);
    assert.equal(r.bereitZurAnlage, true);
    assert.equal(r.funktionsnachweis500, false);
    assert.equal(h.w.writes(), 0);
  });
  await test("Production Vorrang, Speicherwahl, Kommunikation und Kosten werden gelesen", async () => {
    for (const patch of [{ vorrangreserveReal: 0 }, { profileExclusive: false },
      { kommunikationGesperrt: false }, { kohortenQuellenGesperrt: false }, { retention: 20 }]) {
      const h = kontext(); Object.assign(h.config, patch);
      const r = await G.ausfuehren(h.args);
      assert.equal(r.grund, "production-konfiguration-abweichend");
      assert.equal(h.w.writes(), 0);
    }
    const h = kontext(); h.usage[0].estimatedCost = 9;
    const r = await G.ausfuehren(h.args);
    assert.equal(r.grund, "kosten-sicherheitsstopp");
    assert.equal(h.w.writes(), 0);
  });
  await test("Laufende Facharbeit schuetzt den Bestand weiter vor Konkurrenz", async () => {
    const h = kontext();
    h.locks = [{ job_name: "anderer-lauf" }];
    const r = await G.ausfuehren(h.args);
    assert.equal(r.grund, "aktive-oder-verwaiste-lease");
    assert.equal(h.w.writes(), 0);
  });
  await test("Geschuetzter Adapter erreicht mit echtem Provisionierer 504/25/479", async () => {
    const h = kontext();
    h.args.now = () => new Date("2026-09-10T08:30:00Z");
    h.args.ladeBeleg = () => { throw new Error("Keine A Abnahme vorhanden"); };
    h.counter = 57;
    h.usage = h.usage.slice(0, 57).map(r => ({ ...r, createdAt: "2026-09-10T06:00:00Z" }));
    const r = await G.ausfuehren(h.args);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.bestaetigt, 475);
    assert.equal(r.gesamt, 504);
    assert.equal(r.aktiv, 25);
    assert.equal(h.w.deletes(), 0);
    assert(h.anfragen.filter((u) => u.pathname.endsWith("mandate_profiles") && u.searchParams.has("user_id"))
      .every((u) => D.KENNUNGEN.includes(u.searchParams.get("user_id").slice(3))));
    assert(h.anfragen.filter((u) => u.pathname.endsWith("testnachweis-status")).length > 40);
  });
  await test("Netzfehler geben keine Zugangsdaten aus und starten keinen Ersatzweg", async () => {
    const h = kontext();
    const r = await G.ausfuehren({ ...h.args, fetchFn: async () => {
      throw new Error("secret=offline-fixture-key");
    } });
    assert.equal(r.ok, false);
    assert(!JSON.stringify(r).includes("offline-fixture-key"));
    assert.equal(h.w.writes(), 0);
  });
  await test("Fachzyklus wartet auf 500 und wahrt UTC Tageskostenfenster", async () => {
    const h = kontext("fachzyklus");
    const r = await G.ausfuehren(h.args);
    assert.equal(r.grund, "fachzyklus-braucht-500-aktive-profile");
    assert(!h.anfragen.some((u) => u.pathname === "/api/cron/pipeline"));
    const fertig = await bereitZumFachzyklus();
    const spaet = await G.ausfuehren({ ...fertig.args, now: () => new Date("2026-09-10T23:55:00Z") });
    assert.equal(spaet.grund, "fachzyklus-wuerde-utc-tag-wechseln");
    assert(!fertig.anfragen.some((u) => u.pathname === "/api/cron/pipeline"));
  });
  await test("Eine Runde fordert echte Laufquittung statt HTTP 200 oder leerem Gruen", async () => {
    for (const defekt of ["leer", "mandate", "telemetrie", "quittung", "versand"]) {
      const h = await bereitZumFachzyklus();
      if (defekt === "leer") h.pipeline = {};
      if (defekt === "mandate") h.pipeline.tenants = 25;
      if (defekt === "telemetrie") h.pipeline.lauftelemetrie.ende = false;
      if (defekt === "quittung") h.quittungen = [];
      if (defekt === "versand") h.pipeline.weckVersand.versendet = 1;
      const r = await G.ausfuehren(h.args);
      assert.equal(r.ok, false, defekt);
      assert.equal(r.ausgeloest, true);
      assert.equal(r.automatischeWiederholung, false);
      assert.equal(h.anfragen.filter((u) => u.pathname === "/api/cron/pipeline").length, 1);
    }
  });
  await test("500er Fachrunde bestaetigt Fortschritt, behauptet keine Gesamtabnahme", async () => {
    const h = await bereitZumFachzyklus();
    const vorher = D.hash(h.w.snapshot());
    const r = await G.ausfuehren(h.args);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.verarbeitet, 20);
    assert.equal(r.funktionsnachweis500, false);
    assert.equal(D.hash(h.w.snapshot()), vorher);
    assert.equal(h.anfragen.filter((u) => u.pathname === "/api/cron/pipeline").length, 1);
  });
  console.log(`\n${pass} PASS, 0 FAIL`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
