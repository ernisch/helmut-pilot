"use strict";
const A = require("node:assert/strict");
const fs = require("node:fs");
const G = require("./github-quellenvorlauf-500");
const D = require("../lib/helmut/testkohorte-direkt500");
const { bestand, auswahl } = require("./fixtures/quellenkontext-ruhe");
const Adapter = require("./github-direkt500");
const { env: direktEnv, JETZT, SHA } = require("./fixtures/direkt500");

let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const kopie = x => structuredClone(x);
const ZEIT = "2026-09-22T02:00:00.000Z";

function env() {
  return {
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_RUN_ID: "12345678901",
    HELMUT_TESTKOHORTE_QUELLEN: "",
    HELMUT_SOURCE_MODE: "on"
  };
}
function shared(id = "shared") {
  return { id, name: id, type: "rss", category: "neutral",
    url: "https://example.org/" + id + ".xml" };
}
function basisDeps(overrides = {}) {
  return {
    profileAusZeilen: (_p, m) => ({ id: m.user_id }),
    quellenFuerProfil: async () => [shared()],
    ...overrides
  };
}
function runtime(overrides = {}) {
  const s = bestand();
  let lock = false, handlerCalls = 0, snapshotCalls = 0, claimed = false, receipt = null;
  const deps = basisDeps({
    claimRun: async data => {
      if (claimed) return false;
      claimed = true; receipt = kopie(data); return true;
    },
    finishRun: async data => { receipt = kopie(data); return true; },
    handleSourceFetch: async (job, d) => {
      handlerCalls++;
      await d.enqueue({ jobType: "document_understanding", tenantId: null,
        idempotencyKey: "u-" + handlerCalls, payload: { dokumentIds: ["rd-" + handlerCalls] } });
      return { ok: true, neueRohdokumente: 1, bereitsVorhanden: 0, verstehenNeu: 1 };
    },
    acquireLock: async () => { if (lock) return false; lock = true; return true; },
    releaseLock: async () => { lock = false; },
    ...overrides.deps
  });
  const h = {
    s, deps,
    now: overrides.now || (() => new Date(ZEIT)),
    snapshot: overrides.snapshot || (async () => { snapshotCalls++; return kopie(s); }),
    pruefeBetrieb: overrides.pruefeBetrieb || (async () => {}),
    get handlerCalls() { return handlerCalls; },
    get snapshotCalls() { return snapshotCalls; },
    get locked() { return lock; },
    get claimed() { return claimed; },
    get receipt() { return receipt; }
  };
  return h;
}

(async () => {
  await test("Plan bindet exakt 500 inaktive Profile und dedupliziert geteilte Quellen", async () => {
    const s = bestand(), before = D.hash(s);
    const p = await G.bauePlan({ bestand: s, bestandsauswahl: auswahl, env: env(),
      now: () => new Date(ZEIT), deps: basisDeps() });
    A.equal(p.ziel.ids.length, 500);
    A.equal(p.profileMitQuellen, 500);
    A.equal(p.profileOhneQuellen.length, 0);
    A.equal(p.sourceFetch, 1);
    A.equal(p.geteilt, 1);
    A.equal(p.persoenlich, 0);
    A.equal(p.jobs[0].jobType, "source_fetch");
    A.equal(p.jobs[0].tenantId, null);
    A.match(p.planHash, /^[a-f0-9]{64}$/);
    A.equal(D.hash(s), before);
  });

  await test("Plan bleibt rein lesend und fuehrt keinen Abruf oder Modellschritt aus", async () => {
    const h = runtime();
    const r = await G.ausfuehren({ bestand: h.s, bestandsauswahl: auswahl, env: env(),
      now: h.now, snapshot: h.snapshot, pruefeBetrieb: h.pruefeBetrieb,
      execute: false, deps: h.deps });
    A.equal(r.ok, true);
    A.equal(r.reinLesend, true);
    A.equal(r.ausgeloest, false);
    A.equal(r.modellaufrufe, 0);
    A.equal(r.understandingEingereiht, 0);
    A.equal(h.handlerCalls, 0);
    A.equal(h.locked, false);
  });

  await test("Synthetische Eigenquelle bleibt auch im Sonderweg fail closed gesperrt", async () => {
    const erster = D.ALLE_KENNUNGEN[0];
    await A.rejects(G.bauePlan({ bestand: bestand(), bestandsauswahl: auswahl, env: env(),
      now: () => new Date(ZEIT), deps: basisDeps({
        quellenFuerProfil: async p => p.id === erster
          ? [{ id: "person", type: "person", category: "profil",
              rssUrl: "https://example.org/person.xml" }]
          : [shared()]
      }) }), e => e instanceof D.DirektAbbruch
        && e.grund === "quellenvorlauf-synthetische-eigenquelle");
  });

  await test("Profil ohne planbare Quelle stoppt vor jedem Abruf", async () => {
    const erster = D.ALLE_KENNUNGEN[0];
    const h = runtime({ deps: {
      quellenFuerProfil: async p => p.id === erster ? [] : [shared()]
    } });
    const r = await G.ausfuehren({ bestand: h.s, bestandsauswahl: auswahl, env: env(),
      now: h.now, snapshot: h.snapshot, execute: false, deps: h.deps })
      .then(() => null, e => e);
    A(r instanceof D.DirektAbbruch);
    A.equal(r.grund, "quellenvorlauf-profil-ohne-quellen");
    A.equal(h.handlerCalls, 0);
  });

  await test("Mehr als 200 eindeutige Abrufe werden vor externer Arbeit abgelehnt", async () => {
    const fake = {
      kompiliereQuellenbedarf: async ({ profile, quellenFuerProfil }) => {
        for (const p of profile) await quellenFuerProfil(p);
        return {
          auftraege: Array.from({ length: 201 }, (_, i) => ({
            jobType: "source_fetch", idempotencyKey: "k" + i, freshnessWindow: "2026-09-22T00Z",
            tenantId: null, payload: { quelle: shared("s" + i) }
          })),
          fehlerhafteProfile: [],
          statistik: { profile: profile.length, profilePlaene: profile.length }
        };
      }
    };
    await A.rejects(G.bauePlan({ bestand: bestand(), bestandsauswahl: auswahl, env: env(),
      now: () => new Date(ZEIT), deps: basisDeps({ sourceDemand: fake }) }),
    e => e instanceof D.DirektAbbruch && e.grund === "quellenvorlauf-quellenumfang-abweichend");
  });

  await test("Scharfer Vorlauf nutzt source_fetch genau einmal und reiht Understanding nicht persistent ein", async () => {
    const h = runtime();
    const before = D.hash(h.s);
    const r = await G.ausfuehren({ bestand: h.s, bestandsauswahl: auswahl, env: env(),
      now: h.now, snapshot: h.snapshot, pruefeBetrieb: h.pruefeBetrieb,
      execute: true, deps: h.deps });
    A.equal(r.ok, true, JSON.stringify(r));
    A.equal(r.reinLesend, false);
    A.equal(r.ausgeloest, true);
    A.equal(r.sourceFetchVersucht, 1);
    A.equal(r.sourceFetchBestaetigt, 1);
    A.equal(r.sourceFetchFehlgeschlagen, 0);
    A.equal(r.neueRohdokumente, 1);
    A.equal(r.understandingAuftraegeVorbereitet, 1);
    A.equal(r.understandingDokumente, 1);
    A.equal(r.understandingEingereiht, 0);
    A.equal(r.modellaufrufe, 0);
    A.equal(r.funktionsnachweis500, false);
    A.equal(r.quellenversorgung500, false);
    A.equal(h.handlerCalls, 1);
    A.equal(h.locked, false);
    A.equal(D.hash(h.s), before);
  });

  await test("Derselbe Einmalschluessel blockiert einen zweiten manuellen Dispatch vor dem Abruf", async () => {
    const h = runtime();
    const args = { bestand: h.s, bestandsauswahl: auswahl, env: env(),
      now: h.now, snapshot: h.snapshot, pruefeBetrieb: h.pruefeBetrieb,
      execute: true, deps: h.deps };
    const first = await G.ausfuehren(args);
    A.equal(first.ok, true);
    const calls = h.handlerCalls;
    const second = await G.ausfuehren(args);
    A.equal(second.ok, false);
    A.equal(second.grund, "quellenvorlauf-bereits-verwendet");
    A.equal(h.handlerCalls, calls);
  });

  await test("Unklarer Abschlussbeleg bleibt unbekannt und darf nicht als Erfolg gelten", async () => {
    const h = runtime({ deps: { finishRun: async () => false } });
    const r = await G.ausfuehren({ bestand: h.s, bestandsauswahl: auswahl, env: env(),
      now: h.now, snapshot: h.snapshot, pruefeBetrieb: h.pruefeBetrieb,
      execute: true, deps: h.deps });
    A.equal(r.ok, false);
    A.equal(r.zustandUnbekannt, true);
    A.equal(r.quittung, null);
    A.equal(h.handlerCalls, 1);
  });

  await test("Externer Abruffehler wird einmal bilanziert und nie wiederholt", async () => {
    const h = runtime({ deps: {
      handleSourceFetch: async () => { throw new Error("externer-timeout"); }
    } });
    const r = await G.ausfuehren({ bestand: h.s, bestandsauswahl: auswahl, env: env(),
      now: h.now, snapshot: h.snapshot, pruefeBetrieb: h.pruefeBetrieb,
      execute: true, deps: h.deps });
    A.equal(r.ok, false);
    A.equal(r.sourceFetchVersucht, 1);
    A.equal(r.sourceFetchFehlgeschlagen, 1);
    A.equal(r.modellaufrufe, 0);
    A.equal(h.handlerCalls, 0);
    A.equal(h.locked, false);
  });

  await test("Unklarer Persistenzausgang stoppt die Serie sofort", async () => {
    let calls = 0;
    const h = runtime({ deps: {
      quellenFuerProfil: async p => [shared(p.id === D.ALLE_KENNUNGEN[0] ? "a" : "b")],
      handleSourceFetch: async () => {
        calls++;
        throw new Error("persistenz-fehlgeschlagen-oder-unbekannt");
      }
    } });
    const r = await G.ausfuehren({ bestand: h.s, bestandsauswahl: auswahl, env: env(),
      now: h.now, snapshot: h.snapshot, pruefeBetrieb: h.pruefeBetrieb,
      execute: true, deps: h.deps });
    A.equal(r.ok, false);
    A.equal(calls, 1);
    A.equal(r.sourceFetchVersucht, 1);
    A.equal(h.locked, false);
  });

  await test("Zwischenzeitliche Profilaktivierung oder Schutzmutation stoppt", async () => {
    let n = 0;
    const h = runtime({ snapshot: async () => {
      n++;
      const s = bestand();
      if (n >= 2) s.mandate[0].aktiv = true;
      return s;
    } });
    const r = await G.ausfuehren({ bestand: h.s, bestandsauswahl: auswahl, env: env(),
      now: h.now, snapshot: h.snapshot, pruefeBetrieb: h.pruefeBetrieb,
      execute: true, deps: h.deps });
    A.equal(r.ok, false);
    A.equal(h.handlerCalls, 0);
    A.equal(h.locked, false);
  });

  await test("Workflow trennt Quellen Plan und scharfen Lauf sichtbar", () => {
    const yml = fs.readFileSync(".github/workflows/500-direkt-ausbau.yml", "utf8");
    A(yml.includes("quellenvorlauf-plan, quellenvorlauf"));
    A(yml.includes('= "quellenvorlauf-plan"'));
    A(yml.includes("testkohorte-vorwaerts.js quellenvorlauf --ziel=500"));
    A(yml.includes('testkohorte-vorwaerts.js "$HELMUT_DIREKT_SCHRITT" --ziel=500 --scharf'));
  });

  // Der direkte Quellen Vorlauf braucht HELMUT_SOURCE_MODE=on. Der Wert darf
  // ausschliesslich in den beiden quellenvorlauf-Zweigen gesetzt werden, damit
  // kein anderer direkter 500er Schritt und kein workflow-/step-weites env ihn erhaelt.
  await test("Quellen-Vorlauf erhaelt HELMUT_SOURCE_MODE=on nur in seinen zwei Zweigen", () => {
    const quelle = fs.readFileSync(".github/workflows/500-direkt-ausbau.yml", "utf8");
    const zeilen = quelle.split("\n").map(z => z.trim())
      .filter(z => z.includes("node scripts/testkohorte-vorwaerts.js"));
    // 1 Planmodus: HELMUT_SOURCE_MODE=on, quellenvorlauf, ohne --scharf
    const plan = zeilen.filter(z => z.includes("quellenvorlauf --ziel=500") && !z.includes("--scharf"));
    A.equal(plan.length, 1, "genau ein Planzweig fuer quellenvorlauf erwartet");
    A(plan[0].includes("HELMUT_SOURCE_MODE=on"), "Planzweig setzt HELMUT_SOURCE_MODE=on nicht");
    // 5 Planmodus bleibt ohne --scharf (oben bereits durch die Filterung erzwungen)
    // 2 scharfer Vorlauf: HELMUT_SOURCE_MODE=on, mit --scharf
    const scharf = zeilen.filter(z => z.includes("quellenvorlauf --ziel=500 --scharf"));
    A.equal(scharf.length, 1, "genau ein scharfer Zweig fuer quellenvorlauf erwartet");
    A(scharf[0].includes("HELMUT_SOURCE_MODE=on"), "Scharfer Zweig setzt HELMUT_SOURCE_MODE=on nicht");
    // 3 andere direkte Schritte erhalten den Wert nicht
    A(zeilen.some(z => z.includes("vorpruefung --ziel=500") && !z.includes("HELMUT_SOURCE_MODE")),
      "Vorpruefung darf HELMUT_SOURCE_MODE nicht erhalten");
    const generisch = zeilen.filter(z => z.includes('"$HELMUT_DIREKT_SCHRITT" --ziel=500 --scharf'));
    A.equal(generisch.length, 1, "genau ein generischer Zweig erwartet");
    A(!generisch[0].includes("HELMUT_SOURCE_MODE"), "andere Schritte duerfen HELMUT_SOURCE_MODE nicht erhalten");
    A(!/^\s*HELMUT_SOURCE_MODE:/m.test(quelle), "HELMUT_SOURCE_MODE darf kein workflow-/step-weiter env-Eintrag sein");
  });

  // Die Allowlist der Direktziele darf nicht von den tatsaechlich geplanten
  // Vorgaengen abdriften: der Workflow ruft die CLI auf, und ein fehlender
  // Eintrag liess den Vorlauf in Production fail closed abbrechen.
  await test("CLI akzeptiert jeden geplanten Vorgang als Direktziel (kein Direktziel-Abbruch)", () => {
    const { spawnSync } = require("node:child_process");
    for (const w of ["vorpruefung", ...Object.keys(D.WORTE)]) {
      const r = spawnSync(process.execPath, ["scripts/testkohorte-vorwaerts.js", w, "--ziel=500"],
        { encoding: "utf8", env: { ...process.env, HELMUT_SOURCE_MODE: "off" } });
      A(!String(r.stderr || "").includes("Direktziel"),
        `CLI-Allowlist lehnt ${w} ab: ${String(r.stderr).slice(0, 120)}`);
    }
  });

  await test("500er Adapter trennt read only Plan und scharfen Quellen Vorlauf", async () => {
    const s = bestand();
    const config = {
      ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: SHA,
      storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
      retentionGueltig: true, retention: 36, kommunikationGesperrt: true,
      kohortenQuellenGesperrt: true, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200,
      testKosten: { version: 2, aktiv: true, limitUsd: 4, maxManualCalls: null,
        maxWindowMs: null, unbekanntBleibtReserviert: true }
    };
    const vars = { ...direktEnv("quellenvorlauf"), GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "12345678901",
      HELMUT_SOURCE_MODE: "on", HELMUT_QUELLENKONTEXT_BESTANDSPROFILE: JSON.stringify(auswahl) };
    const vorher = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
    const original = G.ausfuehren;
    let calls = 0;
    const antwort = body => ({ status: 200, json: async () => kopie(body) });
    const fetchFn = async (url, init) => {
      A.equal(init.method, "GET");
      const u = new URL(url), table = u.pathname.split("/").pop();
      if (table === "testnachweis-status") return antwort(config);
      if (table === "mandate_profiles") return antwort(s.mandate);
      if (table === "profiles") return antwort(s.identitaeten);
      if (table === "helmut_store") return antwort([{ data: u.searchParams.get("id") === "eq.main-auth" ? s.auth : s.main }]);
      if (table === "llm_budget_counters") return antwort([{ used: 0 }]);
      if (["pipeline_locks", "helmut_jobs", "helmut_job_outbox"].includes(table)) return antwort([]);
      throw new Error("Unerwarteter Adapterzugriff: " + table);
    };
    try {
      Object.assign(process.env, vars);
      delete process.env.HELMUT_TESTKOHORTE_CONFIRM;
      G.ausfuehren = async args => {
        calls++;
        A.deepEqual(args.bestandsauswahl, auswahl);
        A.equal(args.bestand.mandate.filter(m => m.aktiv).length, 0);
        A.equal(args.env.HELMUT_TESTLAUF_KOMMUNIKATION, "gesperrt");
        return { ok: true, reinLesend: !args.execute, execute: args.execute };
      };
      const plan = await Adapter.ausfuehren({ vorgang: "quellenvorlauf", scharf: false,
        env: process.env, fetchFn, now: () => new Date(JETZT) });
      A.equal(plan.ok, true); A.equal(plan.reinLesend, true); A.equal(calls, 1);

      const blockiert = await Adapter.ausfuehren({ vorgang: "quellenvorlauf", scharf: true,
        env: process.env, fetchFn, now: () => new Date(JETZT) });
      A.equal(blockiert.ok, false); A.equal(blockiert.grund, "direktfreigabe-fehlt"); A.equal(calls, 1);

      process.env.HELMUT_TESTKOHORTE_CONFIRM = D.WORTE.quellenvorlauf;
      const scharf = await Adapter.ausfuehren({ vorgang: "quellenvorlauf", scharf: true,
        env: process.env, fetchFn, now: () => new Date(JETZT) });
      A.equal(scharf.ok, true); A.equal(scharf.execute, true); A.equal(calls, 2);
    } finally {
      G.ausfuehren = original;
      for (const [k, v] of Object.entries(vorher)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
      for (const k of Object.keys(vars)) if (!(k in vorher)) delete process.env[k];
    }
  });

  await test("Wiederholungsversuch und aktivierte Kohortenquellen starten keinen Abruf", async () => {
    for (const patch of [{ GITHUB_RUN_ATTEMPT: "2" }, { HELMUT_TESTKOHORTE_QUELLEN: "aktiv" }]) {
      const h = runtime();
      const r = await G.ausfuehren({ bestand: h.s, bestandsauswahl: auswahl,
        env: { ...env(), ...patch }, now: h.now, snapshot: h.snapshot,
        pruefeBetrieb: h.pruefeBetrieb, execute: true, deps: h.deps })
        .then(x => x, e => ({ ok: false, grund: e.grund }));
      A.equal(r.ok, false);
      A.equal(h.handlerCalls, 0);
    }
  });

  console.log(`${passed}/${passed} Quellen-Vorlauf-Pruefgruppen bestanden; kein Netz, kein Modell, keine Productionwirkung.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
