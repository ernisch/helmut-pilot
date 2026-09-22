"use strict";
const A = require("node:assert/strict");
const G = require("./github-quellenvorlauf-500");
const D = require("../lib/helmut/testkohorte-direkt500");
const { bestand, auswahl } = require("./fixtures/quellenkontext-ruhe");

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
  let lock = false, handlerCalls = 0, snapshotCalls = 0;
  const deps = basisDeps({
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
    get locked() { return lock; }
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
      kompiliereQuellenbedarf: async ({ profile }) => ({
        auftraege: Array.from({ length: 201 }, (_, i) => ({
          jobType: "source_fetch", idempotencyKey: "k" + i, freshnessWindow: "2026-09-22T00Z",
          tenantId: null, payload: { quelle: shared("s" + i) }
        })),
        fehlerhafteProfile: [],
        statistik: { profile: profile.length, profilePlaene: profile.length }
      })
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
