"use strict";

const assert = require("assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const D = require("../lib/helmut/testkohorte-direkt500");
const G = require("./github-direkt500");
const { welt, env, kopie, JETZT, SHA } = require("./fixtures/direkt500");
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }

function kontext(vorgang = "provisionierung") {
  const w = welt();
  const anfragen = [];
  const config = { testKosten: { version: 1, aktiv: true, limitUsd: 4, maxManualCalls: 1000 }, ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: SHA,
    storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
    retentionGueltig: true, retention: 36, kommunikationGesperrt: true,
    kohortenQuellenGesperrt: true, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200 };
  const h = { w, config, anfragen, locks: [], usage: [], kostenTage: {}, counter: 124, jobFehler: false,
    pipeline: { ok: true, pfad: "warteschlange", tenants: 500,
      lauf: { laufId: "cron-pipeline-20260910220000-fixture" },
      lauftelemetrie: { start: true, ende: true, status: "success" },
      verarbeitung: { erledigt: 20, verarbeitet: 20, wiederholt: 0, endgueltigFehlgeschlagen: 0 },
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
        ? { ...s.auth, llmUsage: h.usage, testKostenTage: h.kostenTage } : s.main }]);
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

async function echterQuittungsvertrag(h) {
  // Zahlen des belegten Laufs vom 08.09.: 330 Abschluesse und 2 Wiederholungen.
  // Antwort und Datenbankzeile entstehen durch den echten Server und Speicherpfad,
  // nicht durch eine im Test nachgebaute Zaehlerformel. Nur Arbeit und Transport
  // sind lokal ersetzt. Die Testuhr gilt allein in diesem isolierten VM Kontext.
  const src = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const begin = src.indexOf("async function runCronUeberWarteschlange(");
  const end = src.indexOf("async function runCronMitGlobalerPhase(", begin);
  assert(begin >= 0 && end > begin);
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [JETZT])); }
    static now() { return Date.parse(JETZT); }
  }
  const storage = require("../lib/helmut/storage");
  h.quittungen = [];
  const ctx = vm.createContext({
    Date: TestDate, process: { env: {} }, console: { log() {} },
    helmutExecLocation: () => "local",
    storageModul: { schreibeWarteschlangenLaufquittung: (entry) =>
      storage.schreibeWarteschlangenLaufquittung(entry, { bereit: true,
        insertRelational: async (row) => { h.quittungen = [kopie(row)]; } }) },
    scalablePipeline: {
      planeArbeit: async () => ({ ok: true, profile: 500, geplant: 1678, neu: 0 }),
      wiedervorlage: async () => ({ wiedervorgelegt: 0 }),
      betriebsstatus: async () => ({ zustand: "bereit" })
    },
    jobDispatch: { abgleich: async () => ({ uebersprungen: true }), dispatchModus: () => "shadow",
      versendeAbsichten: () => require("../lib/helmut/job-dispatch").versendeAbsichten({
        env: { HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" } }) },
    workerBetrieb: { durchlauf: async () => ({ worker: 4, bilanzen: [{ verfuegbar: true }],
      reserviert: 585, erledigt: 330, wiederholt: 2, zurueckgestellt: 253,
      endgueltigFehlgeschlagen: 0, leaseVerloren: 0 }) },
    buildV3Briefing: () => { throw new Error("Kein Briefinglauf im Vertragstest"); }
  });
  vm.runInContext(src.slice(begin, end), ctx, { filename: "server.js" });
  h.pipeline = kopie(await ctx.runCronUeberWarteschlange("pipeline", {
    runId: "cron-pipeline-20260910220000-fixture", startedMs: Date.parse(JETZT)
  }));
  assert.equal(h.pipeline.verarbeitung.verarbeitet, 332);
  assert.equal(h.pipeline.verarbeitung.erledigt, 330);
  assert.equal(h.quittungen[0].processed_count, 330);
  assert.equal(h.quittungen[0].telemetrie.wiederholt, 2);
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
  await test("Ungeklaerte Kosten sperren vor Aktivierung oder Fachaufruf trotz niedriger Schaetzung", async () => {
    for (const defekt of ["unbekannt", "zaehlerluecke", "eingefroren"]) {
      const h = await bereitZumFachzyklus();
      if (defekt === "unbekannt") h.usage[0].estimatedCost = "unknown";
      if (defekt === "zaehlerluecke") h.counter++;
      if (defekt === "eingefroren") h.kostenTage[JETZT.slice(0, 10)] = { frozen: "test-usd-ausgang-unklar" };
      const vorher = D.hash(h.w.snapshot());
      const r = await G.ausfuehren(h.args);
      assert.equal(r.ok, false, defekt);
      assert.equal(r.grund, defekt === "eingefroren" ? "kosten-ausgang-unklar" : "kosten-nachweis-unvollstaendig");
      assert.equal(r.ausgeloest, false);
      assert.equal(r.automatischeWiederholung, false);
      assert(!h.anfragen.some(u => u.pathname === "/api/cron/pipeline"));
      assert.equal(D.hash(h.w.snapshot()), vorher);
      assert(r.kostenStand.prognoseUsd < 9, "Auch eine kleine Schaetzung ist keine Freigabe");
    }
  });
  await test("Kostenfehler nach erfolgreicher Serverquittung melden Stopp und erhalten belegten Fortschritt", async () => {
    for (const eingefroren of [false, true]) {
      const h = await bereitZumFachzyklus(), fetch = h.args.fetchFn;
      const vorher = D.hash(h.w.snapshot());
      h.args.fetchFn = async (url, init) => {
        const res = await fetch(url, init);
        if (new URL(url).pathname === "/api/cron/pipeline") {
          h.usage[0].estimatedCost = "unknown";
          if (eingefroren) h.kostenTage[JETZT.slice(0, 10)] = { frozen: "test-usd-ausgang-unklar" };
        }
        return res;
      };
      const r = await G.ausfuehren(h.args);
      assert.equal(r.ok, false);
      assert.equal(r.grund, eingefroren ? "kosten-ausgang-unklar" : "kosten-nachweis-unvollstaendig");
      assert.equal(r.ausgeloest, true);
      assert.equal(r.automatischeWiederholung, false);
      assert.deepEqual(r.pipelineBefund, { laufId: h.quittungen[0].run_id,
        fertiggestellteAuftraege: 20, unabhaengigBestaetigt: true });
      assert.equal(r.kostenStand.unbekannteKosten, 1);
      assert.equal(h.anfragen.filter(u => u.pathname === "/api/cron/pipeline").length, 1);
      assert.equal(D.hash(h.w.snapshot()), vorher);
    }
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
  await test("Bestehende 475er Aktivierung bleibt nach Anlage mit ihrem geschuetzten Bestand kompatibel", async () => {
    const h = kontext();
    assert.equal((await G.ausfuehren(h.args)).ok, true);
    const r = await G.ausfuehren({ ...h.args, vorgang: "aktivierung", env: env("aktivierung") });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.aktiv, 500); assert.equal(r.bestaetigt, 475);
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
    for (const defekt of ["leer", "mandate", "telemetrie", "quittung", "versand", "versand-unbekannt"]) {
      const h = await bereitZumFachzyklus();
      if (defekt === "leer") h.pipeline = {};
      if (defekt === "mandate") h.pipeline.tenants = 25;
      if (defekt === "telemetrie") h.pipeline.lauftelemetrie.ende = false;
      if (defekt === "quittung") h.quittungen = [];
      if (defekt === "versand") h.pipeline.weckVersand.versendet = 1;
      if (defekt === "versand-unbekannt") delete h.pipeline.weckVersand.versendet;
      const r = await G.ausfuehren(h.args);
      assert.equal(r.ok, false, defekt);
      assert.equal(r.ausgeloest, true);
      assert.equal(r.automatischeWiederholung, false);
      assert.equal(h.anfragen.filter((u) => u.pathname === "/api/cron/pipeline").length, 1);
    }
  });
  await test("Echter gesperrter Dispatcher liefert den Nullbeleg fuer die 500er Kontrolle", async () => {
    const h = await bereitZumFachzyklus();
    let zugriffe = 0;
    const verboten = async () => { zugriffe++; throw new Error("Keine Vergabe oder Zustellung"); };
    // Keine handgebaute Erfolgsantwort: genau der Production Rueckgabepfad
    // bei aktivem Kommunikationsriegel muss den Ausfuehrer erreichen.
    h.pipeline.weckVersand = await require("../lib/helmut/job-dispatch").versendeAbsichten({
      env: { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "shadow",
        HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" },
      deps: { naechste: verboten, bestaetige: verboten, zuruecklegen: verboten }
    });
    const r = await G.ausfuehren(h.args);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(h.pipeline.weckVersand.versendet, 0);
    assert.equal(h.pipeline.weckVersand.gesendet, 0); // bisheriges Feld bleibt kompatibel
    assert.equal(h.pipeline.weckVersand.uebersprungen, true);
    assert.equal(zugriffe, 0);
    assert.equal(r.funktionsnachweis500, false);
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
  await test("Echte Serverquittung mit Wiederholungen bestaetigt nur gespeicherte Abschluesse", async () => {
    const h = await bereitZumFachzyklus();
    await echterQuittungsvertrag(h);
    const vorher = D.hash(h.w.snapshot());
    const r = await G.ausfuehren(h.args);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.verarbeitet, 330);
    assert.equal(r.fertiggestellteAuftraege, 330);
    assert.equal(r.funktionsnachweis500, false);
    assert.equal(D.hash(h.w.snapshot()), vorher);
    assert.equal(h.anfragen.filter(u => u.pathname === "/api/cron/pipeline").length, 1);
    assert.equal(h.anfragen.filter(u => u.pathname === "/api/cron/testnachweis-status").length, 2);
    assert(r.kostenNachher.prognoseUsd < 9);
  });
  await test("Abweichende Abschlussquittung bleibt gesperrt und erzeugt keinen Wiederholungslauf", async () => {
    const h = await bereitZumFachzyklus();
    for (const gespeichert of [332, 329, "330", null]) {
      h.anfragen.length = 0;
      await echterQuittungsvertrag(h);
      h.quittungen[0].processed_count = gespeichert;
      const r = await G.ausfuehren(h.args);
      assert.equal(r.ok, false, String(gespeichert));
      assert.equal(r.grund, "fachzyklus-laufquittung-fehlt-oder-abweichend");
      assert.equal(r.automatischeWiederholung, false);
      assert.equal(h.anfragen.filter(u => u.pathname === "/api/cron/pipeline").length, 1);
    }
  });
  await test("Fehlende oder widerspruechliche Antwortzaehler sind kein Fortschrittsbeleg", async () => {
    const h = await bereitZumFachzyklus();
    for (const patch of [{ verarbeitet: null }, { verarbeitet: 330 }, { wiederholt: -1 },
      { wiederholt: null }, { verarbeitet: "332" }, { endgueltigFehlgeschlagen: 1 }]) {
      h.anfragen.length = 0;
      await echterQuittungsvertrag(h);
      Object.assign(h.pipeline.verarbeitung, patch);
      const r = await G.ausfuehren(h.args);
      assert.equal(r.ok, false, JSON.stringify(patch));
      assert.equal(r.automatischeWiederholung, false);
      assert.equal(h.anfragen.filter(u => u.pathname === "/api/cron/pipeline").length, 1);
    }
  });
  await test("Nach Wiederholungen bleiben Kosten, Kommunikationsschutz, Sperren und Bestand geprueft", async () => {
    const h = await bereitZumFachzyklus();
    const fetch = h.args.fetchFn;
    for (const [defekt, grund] of [["kosten", "kosten-sicherheitsstopp"],
      ["kommunikation", "production-konfiguration-abweichend"],
      ["sperre", "aktive-oder-verwaiste-lease"], ["bestand", "fachzyklus-hat-profilbestand-veraendert"]]) {
      h.anfragen.length = 0;
      h.usage[0].estimatedCost = 0.003;
      h.config.kommunikationGesperrt = true;
      h.locks = [];
      await echterQuittungsvertrag(h);
      let nachLauf = false;
      h.args.fetchFn = async (url, init) => {
        const u = new URL(url);
        const res = await fetch(url, init);
        if (u.pathname === "/api/cron/pipeline") {
          nachLauf = true;
          if (defekt === "kosten") h.usage[0].estimatedCost = 9;
          if (defekt === "kommunikation") h.config.kommunikationGesperrt = false;
          if (defekt === "sperre") h.locks = [{ job_name: "konkurrierender-lauf" }];
        }
        if (nachLauf && defekt === "bestand" && u.pathname.endsWith("/mandate_profiles")) {
          const rows = await res.json();
          rows[0].offlineTestAenderung = true;
          return { ...res, json: async () => rows };
        }
        return res;
      };
      const r = await G.ausfuehren(h.args);
      assert.equal(r.ok, false, defekt);
      assert.equal(r.grund, grund, defekt);
      assert.equal(r.automatischeWiederholung, false);
      assert.equal(h.anfragen.filter(u => u.pathname === "/api/cron/pipeline").length, 1);
    }
  });
  await test("Textnachlauf braucht deployte Faehigkeit und verweigert Actions Wiederholung", async () => {
    const h = await bereitZumFachzyklus();
    const args = { ...h.args, vorgang: "textnachlauf", env: { ...h.args.env,
      HELMUT_TESTKOHORTE_CONFIRM: D.WORTE.textnachlauf, GITHUB_RUN_ID: "123456789", GITHUB_RUN_ATTEMPT: "1" } };
    let r = await G.ausfuehren(args);
    assert.equal(r.grund, "textnachlauf-nicht-deployt");
    h.config.textnachlaufVersion = 2;
    r = await G.ausfuehren({ ...args, env: { ...args.env, GITHUB_RUN_ATTEMPT: "2" } });
    assert.equal(r.grund, "textnachlauf-keine-wiederholung");
    assert(!h.anfragen.some(u => u.pathname === "/api/cron/lage-briefing"));
  });
  await test("Textnachlauf nutzt genau einen geschuetzten POST und prueft gespeicherte Wirkung", async () => {
    const h = await bereitZumFachzyklus(), fetch = h.args.fetchFn;
    h.config.textnachlaufVersion = 2;
    const runId = "nachlauf500-123456789";
    let calls = 0, claimed = 0;
    h.quittungen = [{ run_id: runId, status: "success", processed_count: 0, failed_count: 0,
      started_at: JETZT, finished_at: JETZT }];
    const args = { ...h.args, vorgang: "textnachlauf", env: { ...h.args.env,
      HELMUT_TESTKOHORTE_CONFIRM: D.WORTE.textnachlauf, GITHUB_RUN_ID: "123456789", GITHUB_RUN_ATTEMPT: "1" },
      fetchFn: async (url, init) => {
        const u = new URL(url);
        if (u.pathname === "/api/cron/lage-briefing") {
          calls++; assert.equal(init.method, "POST"); assert.equal(init.redirect, "error");
          assert.equal(u.search, "?nachlauf=fehlende-500");
          assert.equal(init.headers["x-helmut-lauf"], runId);
          assert.equal(init.headers["x-helmut-bestaetigung"], D.WORTE.textnachlauf);
          const results = h.w.snapshot().mandate.filter(m => m.aktiv).map((m, i) => ({ userId: m.user_id,
            ...(i < claimed ? { gespeichert: true, generatedAt: JETZT } : { grund: "zeitbudget" }) }));
          return { status: 200, json: async () => ({ ok: true, schemaVersion: 1, runId,
            modus: "manuell-fehlende-texte", ziel: 500, gespeichert: claimed, results, funktionsnachweis500: false }) };
        }
        if (u.pathname.endsWith("/briefings")) return { status: 200, json: async () => [] };
        return fetch(url, init);
      }
    };
    const r = await G.ausfuehren(args);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.gespeichert, 0);
    assert.equal(r.funktionsnachweis500, false); assert.equal(calls, 1);
    claimed = 1; h.quittungen[0].processed_count = 1;
    const falsch = await G.ausfuehren(args);
    assert.equal(falsch.grund, "textnachlauf-texte-nicht-gespeichert");
    assert.equal(falsch.automatischeWiederholung, false); assert.equal(calls, 2);
  });
  await test("Actions bestaetigt Alttextreparatur nur mit vollstaendiger unveraenderter Historie", async () => {
    for (const defekt of [null, "historie", "kennzeichnung"]) {
      const h = await bereitZumFachzyklus(), fetch = h.args.fetchFn;
      h.config.textnachlaufVersion = 2;
      const runId = "nachlauf500-123456789";
      const id = h.w.snapshot().mandate.find(m => m.aktiv).user_id;
      const day = require("../lib/helmut/briefing-frische").berlinTagKey(new Date(JETZT));
      const before = { id: `bf-${id}-lage-${day}`, user_id: id, slot: "lage",
        generated_at: new Date(Date.parse(JETZT) - 3600000).toISOString(),
        payload: { paragraphs: [{ text: "Unbelegter erhaltenswerter Alttext" }] } };
      let gespeicherteZeile = before, calls = 0;
      h.quittungen = [{ run_id: runId, status: "success", processed_count: 1, failed_count: 0,
        started_at: JETZT, finished_at: JETZT }];
      const args = { ...h.args, vorgang: "textnachlauf", env: { ...h.args.env,
        HELMUT_TESTKOHORTE_CONFIRM: D.WORTE.textnachlauf, GITHUB_RUN_ID: "123456789", GITHUB_RUN_ATTEMPT: "1" },
        fetchFn: async (url, init) => {
          const u = new URL(url);
          if (u.pathname === "/api/cron/lage-briefing") {
            calls++;
            const vorherigerStand = kopie(before);
            if (defekt === "historie") vorherigerStand.payload.paragraphs[0].text = "Verlorener Alttext";
            gespeicherteZeile = { ...before, generated_at: JETZT,
              payload: { ...require("./fixtures/lage-beleg").payload(), vorherigerStand } };
            const results = h.w.snapshot().mandate.filter(m => m.aktiv).map(m => ({ userId: m.user_id,
              ...(m.user_id === id ? { gespeichert: true, repariert: defekt !== "kennzeichnung", generatedAt: JETZT }
                : { grund: "zeitbudget" }) }));
            return { status: 200, json: async () => ({ ok: true, schemaVersion: 1, runId,
              modus: "manuell-fehlende-texte", ziel: 500, gespeichert: 1, results, funktionsnachweis500: false }) };
          }
          if (u.pathname.endsWith("/briefings")) return { status: 200,
            json: async () => u.searchParams.get("user_id").includes(JSON.stringify(id)) ? [kopie(gespeicherteZeile)] : [] };
          return fetch(url, init);
        } };
      const r = await G.ausfuehren(args);
      assert.equal(calls, 1);
      assert.equal(r.ok, !defekt, JSON.stringify(r));
      if (defekt) assert.equal(r.grund, defekt === "historie"
        ? "textnachlauf-hat-vorhandenen-text-veraendert" : "textnachlauf-texte-nicht-gespeichert");
      else assert.equal(r.gespeichert, 1);
    }
  });
  await test("Vollstaendige Qualitaetsbilanz bleibt rot, wird aber unabhaengig bestaetigt", async () => {
    const h = await bereitZumFachzyklus(), fetch = h.args.fetchFn;
    h.config.textnachlaufVersion = 2;
    const runId = "nachlauf500-123456789";
    h.quittungen = [{ run_id: runId, status: "failed", processed_count: 0, failed_count: 1,
      started_at: JETZT, finished_at: JETZT }];
    let calls = 0;
    const args = { ...h.args, vorgang: "textnachlauf", env: { ...h.args.env,
      HELMUT_TESTKOHORTE_CONFIRM: D.WORTE.textnachlauf, GITHUB_RUN_ID: "123456789", GITHUB_RUN_ATTEMPT: "1" },
      fetchFn: async (url, init) => {
        const u = new URL(url);
        if (u.pathname === "/api/cron/lage-briefing") {
          calls++; assert.equal(init.method, "POST");
          const results = h.w.snapshot().mandate.filter(m => m.aktiv).map((m, i) => ({
            userId: m.user_id, grund: i ? "zeitbudget" : "nachlauf-textfehler-ai-text-source-support" }));
          return { status: 200, json: async () => ({ ok: false, schemaVersion: 1, runId,
            modus: "manuell-fehlende-texte", ziel: 500, gespeichert: 0, results,
            grund: "nachlauf-qualitaetsfehler", qualitaetsfehler: 1, automatischeWiederholung: false,
            funktionsnachweis500: false }) };
        }
        if (u.pathname.endsWith("/briefings")) return { status: 200, json: async () => [] };
        return fetch(url, init);
      } };
    const r = await G.ausfuehren(args);
    assert.equal(r.ok, false); assert.equal(r.zustandUnbekannt, false);
    assert.equal(r.serverBefund.unabhaengigBestaetigt, true);
    assert.equal(r.funktionsnachweis500, false); assert.equal(r.automatischeWiederholung, false);
    assert.equal(calls, 1);
    h.quittungen[0].failed_count = 0;
    const abweichend = await G.ausfuehren(args);
    assert.equal(abweichend.grund, "textnachlauf-quittung-abweichend");
    assert.equal(abweichend.zustandUnbekannt, true);
    assert.equal(abweichend.serverBefund.unabhaengigBestaetigt, false);
    assert.equal(calls, 2);
  });
  await test("Teilweise gespeicherter Fehler bleibt rot und traegt nur sichere Diagnose", async () => {
    const h = await bereitZumFachzyklus(), fetch = h.args.fetchFn;
    h.config.textnachlaufVersion = 2;
    let calls = 0, grund = "nachlauf-textfehler-ai-response-incomplete";
    const args = { ...h.args, vorgang: "textnachlauf", env: { ...h.args.env,
      HELMUT_TESTKOHORTE_CONFIRM: D.WORTE.textnachlauf, GITHUB_RUN_ID: "123456789", GITHUB_RUN_ATTEMPT: "1" },
      fetchFn: async (url, init) => {
        const u = new URL(url);
        if (u.pathname === "/api/cron/lage-briefing") {
          calls++; assert.equal(init.method, "POST");
          return { status: 200, json: async () => ({ ok: false, schemaVersion: 1,
            runId: "nachlauf500-123456789", modus: "manuell-fehlende-texte", ziel: 500,
            gespeichert: 1, grund, raw: "GEHEIMER_MODELLTEXT" }) };
        }
        if (u.pathname.endsWith("/briefings")) return { status: 200, json: async () => [] };
        return fetch(url, init);
      } };
    let r = await G.ausfuehren(args);
    assert.equal(calls, 1); assert.equal(r.schreibversuche, 1);
    assert.equal(r.ok, false); assert.equal(r.zustandUnbekannt, true);
    assert.equal(r.automatischeWiederholung, false); assert.equal(r.funktionsnachweis500, false);
    assert.equal(r.serverBefund.grund, grund);
    assert.equal(r.serverBefund.lautServerGespeichert, 1);
    assert.equal(r.serverBefund.unabhaengigBestaetigt, false);
    assert(!JSON.stringify(r).includes("GEHEIMER"));
    grund = "nachlauf-textfehler-ai-text-source-support";
    r = await G.ausfuehren(args); assert.equal(r.serverBefund.grund, grund);
    grund = "GEHEIMER_FEHLERTEXT";
    r = await G.ausfuehren(args);
    assert.equal(r.serverBefund.grund, "nachlauf-fehler-ohne-freigegebene-diagnose");
    assert(!JSON.stringify(r).includes("GEHEIMER"));
  });
  console.log(`\n${pass} PASS, 0 FAIL`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
