"use strict";
const assert = require("node:assert/strict");
const F = require("../lib/helmut/verstehen-bund7-vertrag");
const V = require("../lib/helmut/verstehen-einmalig");
const B = require("./verstehen-bund7");
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Bedienweg erlaubt nur Plan oder die genaue eigene Bestaetigung", () => {
    assert.equal(B.argumente(["--plan"]), false);
    assert.equal(B.argumente(["--execute", B.BESTAETIGUNG]), true);
    for (const args of [[], ["--execute"], ["--plan", "extra"], ["--execute", "DIE_30_NEUEN_QUELLEN_EINMAL_VERSTEHEN"]])
      assert.throws(() => B.argumente(args));
  });
  await test("Runtime ist an ersten manuellen Main-Lauf und exakten Commit gebunden", () => {
    const commit = "a".repeat(40), env = { HELMUT_BUND7_RUNTIME_COMMIT: commit, GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: commit };
    assert.equal(B.pruefeRuntime(env, commit), commit);
    for (const change of [{ GITHUB_RUN_ATTEMPT: "2" }, { GITHUB_SHA: "b".repeat(40) }, { GITHUB_REF: "refs/heads/feature" },
      { GITHUB_EVENT_NAME: "schedule" }, { HELMUT_BUND7_RUNTIME_COMMIT: "" }]) assert.throws(() => B.pruefeRuntime({ ...env, ...change }, commit));
  });
  const base = { mandate_profiles: Array.from({ length: 500 }, (_, i) => ({ user_id: "test-" + i, aktiv: false, geloescht_at: null })),
    profiles: Array.from({ length: 501 }, (_, i) => ({ id: "test-" + i })), helmut_jobs: [], pipeline_locks: [],
    process_runs: [], helmut_verstehen_reservierungen: [], helmut_store: [] };
  await test("Vorlesung verlangt genau500 inaktive Profile und ruhenden Betrieb", async () => {
    const read = data => async table => data[table];
    assert.match(await B.ruhe(read(base)), /^[a-f0-9]{64}$/);
    for (const table of ["helmut_jobs", "pipeline_locks", "process_runs", "helmut_verstehen_reservierungen", "helmut_store"]) {
      await assert.rejects(B.ruhe(read({ ...base, [table]: [{}] })));
    }
    const changed = structuredClone(base); changed.mandate_profiles[0].aktiv = true;
    await assert.rejects(B.ruhe(read(changed)));
    await assert.rejects(B.ruhe(read({ ...base, mandate_profiles: base.mandate_profiles.slice(1) })));
  });
  await test("Fremde Quellen, offene Belege und ungesicherte Lieferfunktionen bleiben gesperrt", async () => {
    assert.equal(F.pruefeInhalt([]), false);
    assert.throws(() => F.ausGesichertenBelegen([], []));
    assert.equal(F.istVersorgung(async () => ({ ok: true })), false);
    const r = await V.pruefeUndPlane({ ids: [], deps: {}, commit: F.BUND7.commit, erwartet: F.BUND7 });
    assert.equal(r.ok, false);
    const q = await V.fuehreAus({ ids: [], deps: {}, erwartet: F.BUND7, quittungsschluessel: "verstehen30-20260925-a" });
    assert.equal(q.grund, "verstehen-bund7-quittung-abweichend");
  });
  // Optionaler lokaler Belegtest: echte, bereits gelesene Texte bleiben ausserhalb
  // des Repositories. Keine Netz-/Speicherfunktion; Runner entfernt Zugangsdaten.
  if (process.argv[2]) {
    const payload = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
    await test("Alle sieben echten Eingaben und Belege erreichen unveraendert ihren Einzelcluster", async () => {
      const fn = F.ausGesichertenBelegen(payload.rows, payload.belege);
      assert.equal(F.istVersorgung(fn), true);
      for (const doc of payload.rows) { const r = await fn([doc]); assert.equal(r.ok, true); assert.equal(r.beleg.dokumentId, doc.id); }
      assert.equal((await fn(payload.rows)).ok, false);
      const changed = { ...payload.rows[0], summary: "Veraenderte Eingabe" };
      assert.equal((await fn([changed])).ok, false);
      for (const key of ["title", "summary", "url", "published_at"]) {
        const docs = structuredClone(payload.rows); docs[0][key] = "abweichend";
        assert.throws(() => F.ausGesichertenBelegen(docs, payload.belege));
      }
      const belege = structuredClone(payload.belege); belege[0].text += " Zusatz.";
      assert.throws(() => F.ausGesichertenBelegen(payload.rows, belege));
      assert.throws(() => F.ausGesichertenBelegen(payload.rows, payload.belege.slice(1)));
      assert.equal(F.pruefeInhalt(payload.rows, Date.now() + 49 * 3600000), false);
    });
    await test("Gebundener Siebener-Lauf: einmalig, Kostenreserve, erster Fachfehler stoppt", async () => {
      const U = require("../lib/helmut/understanding"), original = U.understandOneCluster;
      async function run({ failAt = 0, price = 0.003 } = {}) {
        let calls = 0, cost = 0, claimed = false, released = false, receipt;
        const deps = { enabled: () => true, aiEnabled: () => true,
          ladeDokumente: async () => payload.rows, getExisting: async () => null, getExistingStreng: async () => null,
          findVorgangCandidates: async () => [], listVorgangDocuments: async () => [],
          listWiederaufnahmen: async () => [], verstehenVertrag: () => ({}),
          artikelkontextVersorgung: F.ausGesichertenBelegen(payload.rows, payload.belege),
          reservierungHoeheUsd: () => 0.212, laufKostenUsd: async () => cost,
          acquireLock: async () => ({ granted: true }), releaseLock: async () => { released = true; },
          claimRun: async () => { if (claimed) return false; claimed = true; return true; },
          finishRun: async r => { receipt = r; return true; },
          requestUnderstanding: async () => { calls++; cost += price; return {}; } };
        U.understandOneCluster = async (cluster, supplied) => {
          assert.equal((await supplied.artikelkontextVersorgung(cluster.documents)).ok, true);
          await supplied.requestUnderstanding("isolierter Test");
          return { status: calls === failAt ? "skipped-invalid" : "saved", documents: 1, vorgangId: "isoliert-" + calls,
            ...(calls === failAt ? { ausgang: "unbekannt" } : {}) };
        };
        const options = { ids: payload.rows.map(d => d.id), deps, execute: true, commit: F.BUND7.commit,
          erwartet: F.BUND7, quittungsschluessel: F.QUITTUNG, runId: "isoliert" };
        const result = await V.fuehreAus(options);
        const callsBefore = calls;
        const repeated = await V.fuehreAus(options);
        assert.equal(repeated.ok, false); assert.equal(calls, callsBefore); assert.equal(released, true);
        return { result, calls, receipt };
      }
      try {
        const full = await run(); assert.equal(full.result.ok, true); assert.equal(full.calls, 7);
        const failed = await run({ failAt: 2 }); assert.equal(failed.result.ok, false); assert.equal(failed.calls, 2);
        assert.equal(failed.receipt.abbruchGrund, "verstehen-bund7-einzelergebnis-nicht-bestaetigt");
        const expensive = await run({ price: 0.1 }); assert.equal(expensive.result.ok, false); assert.equal(expensive.calls, 1);
        assert.equal(expensive.receipt.abbruchGrund, "verstehen-kostendeckel-erreicht");
      } finally { U.understandOneCluster = original; }
    });
  }
  console.log(`PASS ${count} Gruppen zum begrenzten Bundestagsauftrag`);
})().catch(error => { console.error(error); process.exitCode = 1; });
