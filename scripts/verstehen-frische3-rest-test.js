"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const F = require("../lib/helmut/verstehen-frische3-rest-vertrag");
const F5 = require("../lib/helmut/verstehen-frische5-vertrag");
const F30 = require("../lib/helmut/verstehen-frische30-vertrag");
const V = require("../lib/helmut/verstehen-einmalig");
const B = require("./verstehen-frische3-rest");
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Fester Rest3-Auftrag haelt genau3 Quellen/Cluster/Aufrufe, 0,25USD und 7Minuten", () => {
    assert.equal(F.FRISCHE3_REST.dokumente, 3); assert.equal(F.FRISCHE3_REST.cluster, 3);
    assert.deepEqual(F.FRISCHE3_REST.clusterGroessen, { 1: 3 });
    assert.equal(F.FRISCHE3_REST.maxModellaufrufe, 3);
    assert.equal(F.FRISCHE3_REST.maxUsd, 0.25);
    assert.equal(F.FRISCHE3_REST.maxMs, 7 * 60000);
    // Separater, historischer Artikelkontext-Codebeleg (nicht der Runtime-Commit).
    assert.equal(F.FRISCHE3_REST.commit, "654fd8ea72f31260ffce6a104e071b237dd61ebf");
    assert.equal(F.EINGABE, F5.EINGABE); assert.equal(F.EINGABE, "quellen-frische5-20260926-a");
    assert.equal(F.QUITTUNG, "verstehen-frische3-rest-20260926-a");
    // Eigene neue Kennung; KEINE alte Quittung wird wiederverwendet.
    for (const alt of [F5.QUITTUNG, "verstehen169-20260922-a", "verstehen-rest15-20260926-a"])
      assert.notEqual(F.QUITTUNG, alt);
    assert.equal(F.IDS.length, 3); assert.equal(new Set(F.IDS).size, 3);
    assert.equal(F.AUSGESCHLOSSEN.length, 2);
    // Die beiden bereits verarbeiteten Fuenferquellen sind NIEMALS Restquelle.
    assert.ok(F.AUSGESCHLOSSEN.every(id => !F.IDS.includes(id)));
    assert.equal(V.idsHash(F.IDS), F.FRISCHE3_REST.idHash);
    // Kein Limit wird durch diesen Auftrag erhoeht oder ersetzt.
    assert.ok(F.FRISCHE3_REST.maxUsd <= 6 && F.FRISCHE3_REST.maxModellaufrufe <= 113);
  });
  await test("Bedienweg erlaubt nur Plan oder die genaue eigene Bestaetigung", () => {
    assert.equal(B.argumente(["--plan"]), false);
    assert.equal(B.argumente(["--execute", B.BESTAETIGUNG]), true);
    for (const args of [[], ["--execute"], ["--plan", "extra"], ["--execute", "DIE_5_GEBUNDENEN_QUELLEN_EINMAL_VERSTEHEN"]])
      assert.throws(() => B.argumente(args));
  });
  await test("Runtime ist an ersten manuellen Main-Lauf und exakten Commit gebunden", () => {
    const commit = "a".repeat(40), env = { HELMUT_FRISCHE3_REST_RUNTIME_COMMIT: commit, GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: commit };
    assert.equal(B.pruefeRuntime(env, commit), commit);
    for (const change of [{ GITHUB_RUN_ATTEMPT: "2" }, { GITHUB_SHA: "b".repeat(40) }, { GITHUB_REF: "refs/heads/feature" },
      { GITHUB_EVENT_NAME: "schedule" }, { HELMUT_FRISCHE3_REST_RUNTIME_COMMIT: "" }]) assert.throws(() => B.pruefeRuntime({ ...env, ...change }, commit));
  });
  await test("Alter unknown-Vorgang bleibt gesperrt: KO/CAS gegen Archiv, keine Vormerkung", async () => {
    // Ein abweichendes oder fehlendes KO/CAS und jede vorhandene Vormerkung stoppen.
    assert.throws(() => B.pruefeAltesKo([{ id: F.ALT_KO_ID }]), /altes-ko-abweichend/);
    assert.throws(() => B.pruefeAltesKo([]), /altes-ko-abweichend/);
    assert.throws(() => B.pruefeAltesCas([{ vorgang_id: F.VORGANG, zustand: "unbekannt" }]), /altes-cas-abweichend/);
    assert.throws(() => B.pruefeAltesCas([{ vorgang_id: F.VORGANG, zustand: "offen" }]), /altes-cas-abweichend/);
    assert.throws(() => B.pruefeAltesCas([]), /altes-cas-abweichend/);
    assert.equal(B.pruefeKeineVormerkung([]), true);
    assert.throws(() => B.pruefeKeineVormerkung([{}]), /alte-vormerkung-vorhanden/);
    assert.throws(() => B.pruefeF5Quittung([{ id: F.VORGAENGER_QUITTUNG, data: {} }]), /f5-quittung-abweichend/);
    assert.throws(() => B.pruefeF5Quittung([]), /f5-quittung-abweichend/);
    const rd = (ko, cas, vorm) => async table => table === "knowledge_objects" ? ko
      : table === "helmut_verstehen_reservierungen" ? cas
        : table === "helmut_verstehen_vormerkungen" ? vorm : [];
    await assert.rejects(B.pruefeQuarantaene(rd([], [], [])), /altes-ko-abweichend/);
    await assert.rejects(B.pruefeQuarantaene(rd([{ id: F.ALT_KO_ID }], [{ vorgang_id: F.VORGANG, zustand: "unbekannt" }], [{}])), /altes-ko-abweichend/);
  });
  await test("Fremde oder ungueltige Eingabe und ungesicherte Lieferfunktionen bleiben gesperrt", async () => {
    assert.equal(F.pruefeInhalt([]), false);
    assert.equal(F.pruefeInhalt([{ id: F.IDS[0] }]), false);
    assert.throws(() => F.ausGesichertenBelegen([], []));
    assert.equal(F.istVersorgung(async () => ({ ok: true })), false);
    // Eine fremde/Alte Quittung ist kein neuer Vertrag (fail closed, vor jedem Zugriff).
    for (const fremd of [F5.QUITTUNG, "verstehen30-20260925-a", "verstehen-frische5-20260926-b"])
      assert.equal((await V.fuehreAus({ ids: [], deps: {}, erwartet: F.FRISCHE3_REST, quittungsschluessel: fremd })).grund,
        "verstehen-frische3-rest-quittung-abweichend");
    const r = await V.pruefeUndPlane({ ids: [], deps: {}, commit: F.FRISCHE3_REST.commit, erwartet: F.FRISCHE3_REST });
    assert.equal(r.ok, false);
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
    await assert.rejects(B.ruhe(read({ ...base, profiles: base.profiles.slice(1) })));
  });
  await test("Workflow haelt Plan ohne Modellzugang und eindeutigen Erstlauf fest", () => {
    const text = fs.readFileSync(path.join(__dirname, "../.github/workflows/verstehen-frische3-rest.yml"), "utf8");
    for (const rule of ["github.run_attempt == 1", "inputs.runtime_commit == github.sha", "contents: read",
      "cancel-in-progress: false", "timeout-minutes: 10", "persist-credentials: false",
      "HELMUT_TESTLAUF_KOMMUNIKATION: gesperrt", "node scripts/verstehen-frische3-rest.js --plan",
      "DIE_3_RESTQUELLEN_EINMAL_VERSTEHEN"])
      assert.ok(text.includes(rule), rule);
    const plan = text.slice(text.indexOf("      - name: Nur lesen"), text.indexOf("      - name: Eigener"));
    assert.ok(!plan.includes("AZURE_OPENAI"));
    assert.equal((text.match(/AZURE_OPENAI_KEY:/g) || []).length, 1);
    assert.ok(text.indexOf("AZURE_OPENAI_KEY:") > text.indexOf("      - name: Eigener"));
  });
  await test("Laufkennung ist als eigener, limitenneutraler Kostenbezug registriert", async () => {
    const K = require("../lib/helmut/testkosten-budget");
    assert.equal(K.MANUELLE_RUN_ID.test("verstehen3-123456789"), true);
    for (const alt of ["verstehen30-123456789", "verstehen5-123456789", "verstehen16-123456789", "verstehen169-123456789"])
      assert.equal(K.MANUELLE_RUN_ID.test(alt), true);
    for (const fremd of ["verstehen3-12", "verstehen3-fremd", "verstehen4-123456789x"])
      assert.equal(K.MANUELLE_RUN_ID.test(fremd), false);
    assert.equal(K.LIMIT_MICRO_USD, 6000000);
  });
  // Optionaler lokaler/privater Belegtest: die echten Restquellen und beide
  // historischen Belege bleiben ausserhalb des Repositories. Keine Netz-/Speicherfunktion.
  if (process.argv[2]) {
    const dir = path.dirname(process.argv[2]);
    const rest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    const payload = JSON.parse(fs.readFileSync(path.join(dir, "helmut-frische5-eingabe.json"), "utf8"));
    const archiv = JSON.parse(fs.readFileSync(path.join(dir, "helmut-wadephul-archiv-2302.json"), "utf8"));
    const quittung = JSON.parse(fs.readFileSync(path.join(dir, "helmut-frische5-quittung.json"), "utf8"));
    await test("Quarantaenearchiv wird vor und nach dem Lauf voll gelesen und gebunden", async () => {
      const row = { id: "quarantaene-wadephul-ki-20260926-a", data: archiv };
      assert.equal(B.pruefeArchiv([row]), archiv);
      for (const rows of [[], [row, row], [{ ...row, data: { ...archiv, status: "veraendert" } }]])
        assert.throws(() => B.pruefeArchiv(rows), /archiv-abweichend/);
      const read = async table => table === "knowledge_objects" ? [archiv.beleg.ko]
        : table === "helmut_verstehen_reservierungen" ? [archiv.beleg.cas]
        : table === "helmut_store" ? [row] : [];
      await B.pruefeQuarantaene(read);
      await assert.rejects(B.pruefeQuarantaene(async table => table === "helmut_store" ? [] : read(table)), /archiv-abweichend/);
    });
    await test("Privates Restpaket besteht: genau3 Restids, Inhalts- und Beleghash hart gebunden", () => {
      assert.equal(rest.originalEingabe, F.EINGABE);
      assert.equal(rest.quittung.runId, F.VORGAENGER_RUN);
      assert.equal(rest.quittung.idHash, F5.FRISCHE5.idHash);
      assert.equal(rest.rows.length, 3); assert.equal(rest.belege.length, 3);
      assert.equal(V.idsHash(rest.rows.map(d => d.id)), F.FRISCHE3_REST.idHash);
      assert.equal(F30.inhaltsHash(rest.rows), F.INHALT_HASH);
      assert.equal(F.pruefeInhalt(rest.rows), true);
      // Die Fuenfer-Eingabe wird vollstaendig akzeptiert, erst dann die Teilauswahl.
      assert.equal(F5.pruefeInhalt(payload.rows), true);
      assert.equal(F.istVersorgung(F.ausGesichertenBelegen(payload.rows, payload.belege)), true);
    });
    await test("Beide historischen Belege stimmen voll kanonisch mit den festen Hashes", () => {
      assert.equal(F.kanonischerHash(quittung), F.F5_QUITTUNG_HASH);
      assert.equal(F.kanonischerHash(archiv), F.ARCHIV_HASH);
      assert.equal(F.kanonischerHash(archiv.beleg.ko), F.ARCHIV_KO_HASH);
      assert.equal(F.kanonischerHash(archiv.beleg.cas), F.ARCHIV_CAS_HASH);
      assert.equal(F.kanonischerHash(archiv.vormerkung), F.ARCHIV_VORMERKUNG_HASH);
      assert.equal(B.pruefeAltesKo([archiv.beleg.ko]), archiv.beleg.ko);
      assert.equal(B.pruefeAltesCas([archiv.beleg.cas]).zustand, "unbekannt");
      assert.equal(B.pruefeKeineVormerkung([]), true);
      // Das archivierte CAS ist weiter gesperrt: eine Aenderung stoppt sofort.
      for (const change of [{ zustand: "offen" }, { fencing: 1 }, { besitzer: "fremd" }, { lease_bis: "2026-09-27T00:00:00Z" }])
        assert.throws(() => B.pruefeAltesCas([{ ...archiv.beleg.cas, ...change }]), /altes-cas-abweichend/);
      assert.throws(() => B.pruefeAltesKo([{ ...archiv.beleg.ko, updated_at: "2026-09-27T00:00:00Z" }]), /altes-ko-abweichend/);
      assert.throws(() => B.pruefeKeineVormerkung([archiv.vormerkung]), /alte-vormerkung-vorhanden/);
    });
    await test("Alle3 Restquellen erreichen unveraendert ihren Einzelcluster; Manipulation scheitert", async () => {
      const supply = F.ausGesichertenBelegen(payload.rows, payload.belege);
      assert.equal(F.istVersorgung(supply), true);
      for (const id of F.IDS) {
        const r = await supply([payload.rows.find(d => d.id === id)]);
        assert.equal(r.ok, true); assert.equal(r.beleg.dokumentId, id);
      }
      // Die zwei bereits verarbeiteten Fuenferquellen sind NICHT lieferbar.
      for (const id of F.AUSGESCHLOSSEN) {
        const r = await supply([payload.rows.find(d => d.id === id)]);
        assert.equal(r.ok, false); assert.equal(r.reason, "frische3-rest-fremdes-dokument");
      }
      assert.equal((await supply(F.IDS.map(id => payload.rows.find(d => d.id === id)))).ok, false);
      // Manipulierte Inhalte/Belege der VOLLEN Fuenfer-Eingabe scheitern vor jeder Auswahl.
      for (const key of ["title", "summary", "url", "published_at"]) {
        const docs = structuredClone(payload.rows); docs[0][key] = "abweichend";
        assert.throws(() => F.ausGesichertenBelegen(docs, payload.belege));
      }
      // Auch eine Veraenderung NUR an einer ausgeschlossenen Quelle faellt auf (volle Pruefung).
      const nurAusserhalb = structuredClone(payload.rows);
      nurAusserhalb.find(d => d.id === F.AUSGESCHLOSSEN[0]).summary = "veraendert";
      assert.throws(() => F.ausGesichertenBelegen(nurAusserhalb, payload.belege));
      const belege = structuredClone(payload.belege); belege[0].text += " Zusatz.";
      assert.throws(() => F.ausGesichertenBelegen(payload.rows, belege));
      assert.throws(() => F.ausGesichertenBelegen(payload.rows, payload.belege.slice(1)));
      const fremd = structuredClone(payload.belege); fremd[0].dokumentId = "rd-fremd";
      assert.throws(() => F.ausGesichertenBelegen(payload.rows, fremd));
      assert.equal(F.pruefeInhalt(rest.rows, Date.now() + 49 * 3600000), false);
    });
    await test("Alter unknown-Vorgang bleibt ungekoppelt: echtes Archiv-KO als Kandidat ⇒ drei neue Cluster", async () => {
      const docs3 = F.IDS.map(id => payload.rows.find(d => d.id === id));
      const kandidat = { ...archiv.beleg.ko };
      const r = await V.pruefeUndPlane({ ids: docs3.map(d => d.id), commit: F.FRISCHE3_REST.commit, deps: {
        ladeDokumente: async () => docs3, artikelkontextVersorgung: F.ausGesichertenBelegen(payload.rows, payload.belege),
        getExisting: async () => null, getExistingStreng: async () => null,
        findVorgangCandidates: async () => [kandidat], listVorgangDocuments: async () => [],
        listWiederaufnahmen: async () => [], verstehenVertrag: () => ({})
      }, erwartet: F.FRISCHE3_REST });
      assert.equal(r.ok, true);
      assert.equal(r.plan.einteilungen.every(e => e.art === "neu" && e.kandidat === true), true);
      assert.equal(r.plan.einteilungen.some(e => e.vorgangId === F.VORGANG), false);
      assert.equal(r.plan.kandidaten, 3);
    });
    await test("Bindet ein Restcluster an den alten gesperrten Vorgang, stoppt der Lauf fail closed", async () => {
      const docs3 = F.IDS.map(id => payload.rows.find(d => d.id === id));
      // Derselbe Sachverhalt wie die erste Restquelle, aber unter der ALTEN, gesperrten Kennung.
      const aegypten = docs3[0];
      const alt = { id: "ko-" + F.VORGANG, vorgang_id: F.VORGANG, headline: aegypten.title,
        display_title: aegypten.title, display_summary: aegypten.summary, was_ist_passiert: aegypten.summary,
        warum_wichtig: aegypten.summary, why_relevant: aegypten.summary, decision_level: "bund",
        status: "complete", understanding_status: "complete", ko_version: 1,
        updated_at: "2026-09-26T22:00:00.000Z", created_at: "2026-09-26T22:00:00.000Z" };
      let calls = 0;
      const r = await V.pruefeUndPlane({ ids: docs3.map(d => d.id), commit: F.FRISCHE3_REST.commit, deps: {
        ladeDokumente: async () => { calls += 1; return docs3; },
        artikelkontextVersorgung: F.ausGesichertenBelegen(payload.rows, payload.belege),
        getExisting: async () => null, getExistingStreng: async () => null,
        findVorgangCandidates: async () => [alt], listVorgangDocuments: async () => [],
        listWiederaufnahmen: async () => [], verstehenVertrag: () => ({})
      }, erwartet: F.FRISCHE3_REST });
      assert.equal(r.ok, false); assert.equal(r.grund, "verstehen-frische3-rest-gesperrter-vorgang");
      assert.equal(calls, 1);
      alt.vorgang_id = "vg-anderer-bestand";
      alt.id = "ko-vg-anderer-bestand";
      const anderer = await V.pruefeUndPlane({ ids: docs3.map(d => d.id), commit: F.FRISCHE3_REST.commit, deps: {
        ladeDokumente: async () => docs3,
        artikelkontextVersorgung: F.ausGesichertenBelegen(payload.rows, payload.belege),
        getExisting: async () => null, getExistingStreng: async () => null,
        findVorgangCandidates: async () => [alt], listVorgangDocuments: async () => [],
        listWiederaufnahmen: async () => [], verstehenVertrag: () => ({})
      }, erwartet: F.FRISCHE3_REST });
      assert.equal(anderer.ok, false);
      assert.equal(anderer.grund, "verstehen-frische3-rest-unerwartete-bestandsbindung");
    });
    await test("Gebundener Rest3-Lauf: einmalig, Kostenreserve, erster Fachfehler stoppt", async () => {
      const docs3 = F.IDS.map(id => payload.rows.find(d => d.id === id));
      const U = require("../lib/helmut/understanding"), original = U.understandOneCluster;
      async function run({ failAt = 0, price = 0.003 } = {}) {
        let calls = 0, cost = 0, claimed = false, released = false, receipt;
        const deps = { enabled: () => true, aiEnabled: () => true,
          ladeDokumente: async () => docs3, getExisting: async () => null, getExistingStreng: async () => null,
          findVorgangCandidates: async () => [], listVorgangDocuments: async () => [],
          listWiederaufnahmen: async () => [], verstehenVertrag: () => ({}),
          artikelkontextVersorgung: F.ausGesichertenBelegen(payload.rows, payload.belege),
          reservierungHoeheUsd: () => 0.212, laufKostenUsd: async () => cost,
          acquireLock: async () => ({ granted: true }), releaseLock: async () => { released = true; },
          claimRun: async () => { if (claimed) return false; claimed = true; return true; },
          finishRun: async r => { receipt = r; return true; },
          requestUnderstanding: async () => { calls++; cost += price; return {}; } };
        U.understandOneCluster = async (cluster, supplied) => {
          assert.ok(cluster.documents.every(d => F.IDS.includes(d.id)));
          assert.equal((await supplied.artikelkontextVersorgung(cluster.documents)).ok, true);
          await supplied.requestUnderstanding("isolierter Test");
          return { status: calls === failAt ? "skipped-invalid" : "saved", documents: 1, vorgangId: "isoliert-" + calls,
            ...(calls === failAt ? { ausgang: "unbekannt" } : {}) };
        };
        const options = { ids: docs3.map(d => d.id), deps, execute: true, commit: F.FRISCHE3_REST.commit,
          erwartet: F.FRISCHE3_REST, quittungsschluessel: F.QUITTUNG, runId: "verstehen3-isoliert" };
        const result = await V.fuehreAus(options);
        const callsBefore = calls;
        const repeated = await V.fuehreAus(options);
        assert.equal(repeated.ok, false); assert.equal(calls, callsBefore); assert.equal(released, true);
        return { result, calls, receipt };
      }
      try {
        const full = await run(); assert.equal(full.result.ok, true); assert.equal(full.calls, 3);
        const failed = await run({ failAt: 2 }); assert.equal(failed.result.ok, false); assert.equal(failed.calls, 2);
        assert.equal(failed.receipt.abbruchGrund, "verstehen-frische3-rest-einzelergebnis-nicht-bestaetigt");
        const expensive = await run({ price: 0.02 }); assert.equal(expensive.result.ok, false); assert.equal(expensive.calls, 2);
        assert.equal(expensive.receipt.abbruchGrund, "verstehen-kostendeckel-erreicht");
      } finally { U.understandOneCluster = original; }
    });
  }
  console.log(`PASS ${count} Gruppen zum begrenzten Rest3-Quellenauftrag`);
})().catch(error => { console.error(error); process.exitCode = 1; });
