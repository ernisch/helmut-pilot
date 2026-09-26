"use strict";
const assert = require("node:assert/strict");
const F = require("../lib/helmut/verstehen-frische16-vertrag");
const V = require("../lib/helmut/verstehen-einmalig");
const B = require("./verstehen-frische16");
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
    const commit = "a".repeat(40), env = { HELMUT_FRISCHE16_RUNTIME_COMMIT: commit, GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: commit };
    assert.equal(B.pruefeRuntime(env, commit), commit);
    for (const change of [{ GITHUB_RUN_ATTEMPT: "2" }, { GITHUB_SHA: "b".repeat(40) }, { GITHUB_REF: "refs/heads/feature" },
      { GITHUB_EVENT_NAME: "schedule" }, { HELMUT_FRISCHE16_RUNTIME_COMMIT: "" }]) assert.throws(() => B.pruefeRuntime({ ...env, ...change }, commit));
  });
  await test("Echter Kostenadapter bindet 16er-Reserve und Abrechnung an genau einen Lauf", async () => {
    const K = require("../lib/helmut/testkosten-budget");
    let auth = { llmUsage: [] }, seq = 0;
    const env = { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", AZURE_OPENAI_KEY: "offline" };
    const storage = { readAuthStore: async () => structuredClone(auth),
      leseLlmTageszaehler: async () => ({ ok: true, used: 0 }),
      mutateAuthStore: async fn => { const next = structuredClone(auth); const result = await fn(next); auth = next; return result; } };
    const deps = { env, storage, now: () => new Date("2026-09-25T13:40:00.000Z"), id: () => "offline-" + ++seq };
    const runId = "verstehen16-123456789";
    assert.equal(await K.laufGebundenUsd(runId, deps), 0);
    const t = await K.reserviere({ model: "gpt-5-mini", maxOutputTokens: 3000, runId }, deps);
    assert.equal(await K.laufGebundenUsd(runId, deps), 0.212);
    assert.equal(auth.testKostenTage["2026-09-25"].calls[t.id].bezug.runId, runId);
    await K.abschliessen(t, { model: "gpt-5-mini", promptTokens: 100, completionTokens: 20, _ablage: { blob: true } }, deps);
    assert.equal(await K.laufGebundenUsd(runId, deps), 0.00013);
    assert.equal(await K.laufGebundenUsd("verstehen-bund7-36141840797", deps), 0);
    assert.equal(K.LIMIT_MICRO_USD, 4000000);
    for (const id of ["verstehen-frische16-12", "verstehen-frische16-fremd", "verstehen-bund8-123456789"])
      await assert.rejects(K.laufGebundenUsd(id, deps));
    storage.readAuthStore = async () => { throw Error("offline-ausfall"); };
    await assert.rejects(K.laufGebundenUsd(runId, deps));
  });
  await test("Neuer UTC-Tag braucht vollstaendige Kostenhistorie; Vorpruefung schreibt nichts", async () => {
    const K = require("../lib/helmut/testkosten-budget"), day = "2026-09-26";
    const auth = { llmUsage: [], testKostenTage: {} }, before = structuredClone(auth);
    assert.deepEqual(K.pruefeStart(auth, day, { ok: true, used: 0 }), {
      startklar: true, tagesbuchVorhanden: false, atomarerUsdRiegel: true,
      limitUsd: 4, gebundenUsd: 0, offeneReserveUsd: 0, offeneReservierungen: 0, anbieterrechnung: false });
    assert.deepEqual(auth, before);
    for (const counter of [null, { ok: false, used: 0 }, { ok: true, used: 1 }, { ok: true, used: -1 }])
      assert.throws(() => K.pruefeStart(auth, day, counter));
    for (const bad of [{}, { llmUsage: [], testKostenTage: [] },
      { llmUsage: [], testKostenTage: { [day]: null } },
      { llmUsage: [{ createdAt: day + "T01:00:00Z", model: "fremd" }] }])
      assert.throws(() => K.pruefeStart(bad, day, { ok: true, used: 0 }));
    assert.throws(() => K.pruefeStart(auth, "2026-02-31", { ok: true, used: 0 }));
    const billed = { llmUsage: [{ createdAt: day + "T00:00:00Z", model: "gpt-5-mini",
      estimatedCost: 0.00013, promptTokens: 100, completionTokens: 20 }] };
    assert.equal(K.pruefeStart(billed, day, { ok: true, used: 1 }).gebundenUsd, 0.00013);
    let persisted = structuredClone(auth);
    const storage = { leseLlmTageszaehler: async () => ({ ok: true, used: 0 }),
      mutateAuthStore: async fn => fn(persisted) };
    const deps = { storage, env: { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", AZURE_OPENAI_KEY: "offline" },
      now: () => new Date(day + "T00:10:00Z"), id: () => "ticket" };
    const ticket = await K.reserviere({ model: "gpt-5-mini", maxOutputTokens: 3000, runId: "verstehen16-123456789" }, deps);
    assert.throws(() => K.pruefeStart(persisted, day, { ok: true, used: 0 }));
    await K.nichtGesendet(ticket, { kiNichtGesendet: true }, deps);
    assert.equal(K.pruefeStart(persisted, day, { ok: true, used: 0 }).startklar, true);
    const frozen = structuredClone(persisted); frozen.testKostenTage[day].frozen = "test-usd-ausgang-unklar";
    assert.throws(() => K.pruefeStart(frozen, day, { ok: true, used: 0 }));
    const historic = structuredClone(persisted); historic.testKostenTage["2026-09-25"] = { historischeReserve: true };
    const snapshot = structuredClone(historic);
    assert.equal(K.pruefeStart(historic, day, { ok: true, used: 0 }).startklar, true);
    assert.deepEqual(historic, snapshot);
  });
  await test("Workflow haelt Plan ohne Modellzugang und eindeutigen Erstlauf fest", () => {
    const text = require("node:fs").readFileSync(require("node:path").join(__dirname, "../.github/workflows/verstehen-frische16.yml"), "utf8");
    for (const rule of ["github.run_attempt == 1", "inputs.runtime_commit == github.sha", "contents: read",
      "cancel-in-progress: false", "timeout-minutes: 18", "persist-credentials: false",
      "HELMUT_TESTLAUF_KOMMUNIKATION: gesperrt", "node scripts/verstehen-frische16.js --plan"])
      assert.ok(text.includes(rule), rule);
    const plan = text.slice(text.indexOf("      - name: Nur lesen"), text.indexOf("      - name: Eigener"));
    assert.ok(!plan.includes("AZURE_OPENAI"));
    assert.equal((text.match(/AZURE_OPENAI_KEY:/g) || []).length, 1);
    assert.ok(text.indexOf("AZURE_OPENAI_KEY:") > text.indexOf("      - name: Eigener"));
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
    const r = await V.pruefeUndPlane({ ids: [], deps: {}, commit: F.FRISCHE16.commit, erwartet: F.FRISCHE16 });
    assert.equal(r.ok, false);
    const q = await V.fuehreAus({ ids: [], deps: {}, erwartet: F.FRISCHE16, quittungsschluessel: "verstehen30-20260925-a" });
    assert.equal(q.grund, "verstehen-frische16-quittung-abweichend");
  });
  await test("Gleiche UTC-Zeitpunkte bleiben nach PostgreSQL-Lesung gebunden; echte Aenderungen nicht", () => {
    const A = require("../lib/helmut/artikelkontext");
    const doc = { id: "rd-zeitprobe", title: "Amtlicher Quellenbeleg zur Zeitbindung",
      summary: "Unveraenderte Quellenaussage", source_name: "Deutscher Bundestag", source_id: "bundestag",
      url: "https://www.bundestag.de/dokumente/textarchiv/2026/kw39-zeitprobe-1234567",
      published_at: "2026-09-25T11:00:00.000Z", retrieved_at: "2026-09-25T12:44:58.165Z" };
    const beleg = { version: 2, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
      artikelUrl: doc.url, artikelTitel: doc.title, herkunft: "strukturierter-originalartikel",
      gelesenAm: "2026-09-25T12:45:00.000Z", absatzPosition: 1, text: "Der unveraenderte Originalabsatz wird an die konkrete Quellenzeile gebunden.",
      gewinnung: { verfahren: "bundestag-artikel-leitabsatz-v1", positionsbasis: "html-article-p",
        antwortHash: "a".repeat(64), artikelTextHash: "b".repeat(64), artikelTextPosition: 0,
        titelTreffer: 0, kandidatZahl: 1, artikelAbsatzZahl: 1 } };
    const pg = { ...doc, published_at: "2026-09-25T11:00:00+00:00", retrieved_at: "2026-09-25T12:44:58.165000+00:00" };
    assert.throws(() => A.pruefeArtikelkontext([pg], beleg), /quellenstand-abweichend/);
    const neu = F.pruefeSpeicherbindung([pg], beleg);
    assert.equal(neu.text, beleg.text); assert.equal(neu.quellenHash, A.quellenstandHash(pg));
    assert.deepEqual(A.pruefeArtikelkontext([pg], neu), neu);
    const alt = { id: "rd-alt", title: "Alte Meldung", published_at: null, retrieved_at: null };
    assert.deepEqual(F.pruefeSpeicherbindung([alt, pg], beleg), neu);
    assert.equal(alt.published_at, null);
    assert.throws(() => F.pruefeSpeicherbindung([alt], beleg));
    assert.equal(beleg.quellenHash, A.quellenstandHash(doc));
    for (const change of [{ published_at: "2026-09-25T11:00:00.001Z" },
      { retrieved_at: "2026-09-25T12:44:58.165001Z" }, { published_at: "2026-09-25" },
      { title: "Andere Aussage" }, { summary: "Anderer Inhalt" }, { source_name: "Anderer Absender" },
      { url: "https://www.bundestag.de/dokumente/textarchiv/2026/anderer-1234567" }])
      assert.throws(() => F.pruefeSpeicherbindung([{ ...pg, ...change }], beleg));
    assert.throws(() => F.pruefeSpeicherbindung([pg, pg], beleg));
  });
  // Optionaler lokaler Belegtest: echte, bereits gelesene Texte bleiben ausserhalb
  // des Repositories. Keine Netz-/Speicherfunktion; Runner entfernt Zugangsdaten.
  if (process.argv[2]) {
    const payload = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
    if (process.argv[3]) await test("Alle 16 realen Production-Zeilen bestehen mit unveraenderten Importbelegen", async () => {
      const actual = JSON.parse(require("node:fs").readFileSync(process.argv[3], "utf8"));
      const fn = F.ausGesichertenBelegen(actual.docs, payload.belege);
      for (const doc of actual.docs) {
        const r = await fn([doc]); assert.equal(r.ok, true);
        assert.deepEqual(require("../lib/helmut/artikelkontext").pruefeArtikelkontext([doc], r.beleg), r.beleg);
      }
    });
    await test("Alle 16 echten Eingaben und Belege erreichen unveraendert ihren Einzelcluster", async () => {
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
    await test("Gebundener 16er-Lauf: einmalig, Kostenreserve, erster Fachfehler stoppt", async () => {
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
        const options = { ids: payload.rows.map(d => d.id), deps, execute: true, commit: F.FRISCHE16.commit,
          erwartet: F.FRISCHE16, quittungsschluessel: F.QUITTUNG, runId: "isoliert" };
        const result = await V.fuehreAus(options);
        const callsBefore = calls;
        const repeated = await V.fuehreAus(options);
        assert.equal(repeated.ok, false); assert.equal(calls, callsBefore); assert.equal(released, true);
        return { result, calls, receipt };
      }
      try {
        const full = await run(); assert.equal(full.result.ok, true); assert.equal(full.calls, 16);
        const failed = await run({ failAt: 2 }); assert.equal(failed.result.ok, false); assert.equal(failed.calls, 2);
        assert.equal(failed.receipt.abbruchGrund, "verstehen-frische16-einzelergebnis-nicht-bestaetigt");
        const expensive = await run({ price: 0.1 }); assert.equal(expensive.result.ok, false); assert.equal(expensive.calls, 6);
        assert.equal(expensive.receipt.abbruchGrund, "verstehen-kostendeckel-erreicht");
      } finally { U.understandOneCluster = original; }
    });
  }
  console.log(`PASS ${count} Gruppen zum begrenzten Quellenauftrag`);
})().catch(error => { console.error(error); process.exitCode = 1; });
