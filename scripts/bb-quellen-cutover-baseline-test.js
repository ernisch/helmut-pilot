"use strict";

// Neue lokale Regressionen fuer den belegten Berlin-active/Brandenburg-prepared-Vertrag.
// Ausschliesslich synthetische Daten und injizierte Adapter; kein Netz oder Production.
const assert = require("assert/strict");
const operator = require("../lib/helmut/bb-quellen-cutover-operator");
const { erstelleStore, REQUEST_TIMEOUT_MS } = require("../lib/helmut/bb-quellen-cutover-store");
const { body, fakeStore, links, linkedPfade, pakete, pfade, envAn, envNurFlag } =
  require("./bb-quellen-cutover-operator-test");

const clone = (value) => JSON.parse(JSON.stringify(value));
const sortLinks = (rows) => rows.map((row) => `${row.package_id}/${row.retrieval_path_id}`).sort();
const run = (store, action = "quellen-cutover") => operator.ausfuehren(body(action), { store, env: envAn });
function assertBerlinErhalten(store) {
  assert.equal(store.zustand.pakete.find((row) => row.id === "pkg-berlin-basis").status, "active");
  assert.equal(store.writes.some((write) => write.id === "pkg-berlin-basis"), false);
}
function assertOffen(result) {
  assert.equal(result.ok, false);
  assert.equal(result.detail.offenerAusgang, true);
}
function applyWrite(zustand, write) {
  const row = (write.art === "paket" ? zustand.pakete : zustand.pfade).find((r) => r.id === write.id);
  row.status = write.neuerStatus;
  if (write.art === "pfad") {
    row.activation_mode = write.neuerActivationMode;
    Object.assign(zustand.linkedPfade.find((r) => r.id === write.id), {
      status: write.neuerStatus, activation_mode: write.neuerActivationMode
    });
  }
}

let pass = 0;
let fail = 0;
// Optionaler enger Wiederholungslauf nach einer konkreten Korrektur; CI prueft standardmaessig alles.
const testFilter = process.env.BB_CUTOVER_TEST_FILTER ? new RegExp(process.env.BB_CUTOVER_TEST_FILTER) : null;
async function check(name, fn) {
  if (testFilter && !testFilter.test(name)) return;
  try { await fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (error) { fail += 1; console.log(`  FAIL  ${name} — ${error.stack}`); }
}

async function main() {
  const previousFetch = global.fetch;
  global.fetch = async () => { throw new Error("Netzaufruf im Offline-Test verboten"); };
  try {
    await check("Neuer Vertrag: unabhaengig fixierte 16 Bindungen, 15 Pfade und neue Bestaetigungen", async () => {
      assert.deepEqual(sortLinks(operator.VERTRAGS_LINKS), sortLinks(links()));
      assert.deepEqual([...operator.VERTRAGS_PFAD_IDS].sort(), [...new Set(links().map((r) => r.retrieval_path_id))].sort());
      assert.equal(operator.BASIS_VEKTOR["pkg-berlin-basis"].status, "active");
      assert.equal(operator.AKTIV_VEKTOR["pkg-berlin-basis"].status, "active");
      assert.equal(operator.BESTAETIGUNGEN["quellen-cutover"], "BERLIN-ACTIVE-BRANDENBURG-QUELLEN-CUTOVER-V1-20261001");
      assert.equal(operator.BESTAETIGUNGEN["quellen-rueckbau"], "BERLIN-ACTIVE-BRANDENBURG-QUELLEN-RUECKBAU-V1-20261001");
      for (const action of ["quellen-cutover", "quellen-rueckbau"]) {
        const store = fakeStore();
        const confirmation = action === "quellen-cutover"
          ? "BERLIN-BRANDENBURG-QUELLEN-CUTOVER-20261001" : "BERLIN-BRANDENBURG-QUELLEN-RUECKBAU-20261001";
        const result = await operator.ausfuehren({ action, confirmation }, { store, env: envAn });
        assert.equal(result.reason, "bestaetigung-fehlt");
        assert.deepEqual(store.calls, []);
      }
    });

    await check("Basisvektor: Vorschau, drei Writes je Richtung, Idempotenz, exakter Rueckweg", async () => {
      const store = fakeStore();
      const initial = clone(store.zustand);
      const preview = await run(store, "quellen-vorschau");
      assert.equal(preview.ok, true);
      assert.equal(preview.detail.gesamt, "vorher");
      assert.equal(store.writes.length, 0);
      const cutover = await run(store);
      assert.equal(cutover.ok, true);
      assert.deepEqual(store.writes.map((w) => [w.id, w.neuerStatus]), [
        ["pkg-brandenburg-basis", "active"], ["rp-be-landesregierung", "healthy"], ["rp-bb-landesparlament", "healthy"]
      ]);
      assertBerlinErhalten(store);
      const repeatedCutover = await run(store);
      assert.equal(repeatedCutover.ok, true);
      assert.equal(repeatedCutover.detail.bereits, true);
      assert.equal(store.writes.length, 3);
      const reverse = await operator.ausfuehren(body("quellen-rueckbau"), { store, env: envNurFlag });
      assert.equal(reverse.ok, true);
      assert.deepEqual(store.writes.slice(3).map((w) => [w.id, w.neuerStatus]), [
        ["rp-bb-landesparlament", "needs_review"], ["rp-be-landesregierung", "needs_review"], ["pkg-brandenburg-basis", "prepared"]
      ]);
      assert.deepEqual(store.zustand, initial);
      assertBerlinErhalten(store);
      assert.equal((await run(store, "quellen-rueckbau")).detail.bereits, true);
      assert.equal(store.writes.length, 6);
    });

    await check("Alle abweichenden Teilvektoren bleiben gesperrt; Berlin prepared wird nicht repariert", async () => {
      const variants = [
        (s) => { s.pakete[0].status = "prepared"; },
        (s) => { s.pakete[1].status = "active"; },
        (s) => { s.pfade[0].status = "healthy"; s.pfade[0].activation_mode = "auto"; },
        (s) => { s.pfade[1].activation_mode = "auto"; }
      ];
      for (const change of variants) {
        const store = fakeStore(); change(store.zustand);
        store.zustand.linkedPfade = linkedPfade(store.zustand.pfade);
        for (const action of ["quellen-vorschau", "quellen-cutover", "quellen-rueckbau"]) {
          assert.equal((await run(store, action)).ok, false);
          assert.equal(store.writes.length, 0);
        }
      }
    });

    await check("Bekannte Nebenbindungen exakt: neuer manueller Link, fehlender/doppelter Link, fehlender/doppelter Pfad", async () => {
      const variants = [
        (s) => { s.links.push({ package_id: "pkg-brandenburg-basis", retrieval_path_id: "rp-unbekannt" }); s.linkedPfade.push({ id: "rp-unbekannt", status: "needs_review", activation_mode: "manual" }); },
        (s) => { s.links = s.links.slice(1); },
        (s) => { s.links.push(clone(s.links[0])); },
        (s) => { s.linkedPfade = s.linkedPfade.slice(1); },
        (s) => { s.linkedPfade.push(clone(s.linkedPfade[0])); }
      ];
      for (const change of variants) {
        const store = fakeStore(); change(store.zustand);
        assert.equal((await run(store)).ok, false);
        assert.equal(store.writes.length, 0);
        assertBerlinErhalten(store);
      }
    });

    await check("Nebenpfade und doppelte Zielansichten: halbaktive/unklare Modi sind keine Baseline", async () => {
      for (const [status, activation_mode] of [["healthy", "manual"], ["needs_review", "auto"], ["broken", "manual"], ["healthy", "auto"]]) {
        const store = fakeStore();
        Object.assign(store.zustand.linkedPfade.find((r) => r.id === "rp-rbb24-politik"), { status, activation_mode });
        assert.equal((await run(store)).ok, false);
        assert.equal(store.writes.length, 0);
      }
      const inconsistent = fakeStore();
      inconsistent.zustand.linkedPfade.find((r) => r.id === "rp-be-landesregierung").status = "healthy";
      assert.equal((await run(inconsistent)).ok, false);
      assert.equal(inconsistent.writes.length, 0);
    });

    await check("Eindeutiger CAS0 an jedem Vorwaertsschritt kompensiert nur eigene bestaetigte Writes", async () => {
      for (const id of ["pkg-brandenburg-basis", "rp-be-landesregierung", "rp-bb-landesparlament"]) {
        const store = fakeStore(id.startsWith("pkg-") ? { fehltPaket: id } : { fehltPfad: id });
        const initial = clone(store.zustand);
        const result = await run(store);
        assert.equal(result.ok, false);
        assert.equal(result.reason, "cas-fehlgeschlagen");
        assert.deepEqual(store.zustand, initial);
        assertBerlinErhalten(store);
        for (const comp of result.detail.ausgleich) assert.equal(comp.ok, true);
        for (let i = 0; i < store.calls.length; i += 1) {
          if (!/^(paket|pfad):/.test(store.calls[i])) continue;
          assert.equal(store.calls[i - 1], "lesen");
          assert.equal(store.calls[i + 1], "lesen");
        }
      }
    });

    await check("Rueckbau-CAS0 stellt nur den frisch gebundenen aktiven Ausgang wieder her", async () => {
      const store = fakeStore({ pakete: pakete("nachher"), pfade: pfade("nachher"), fehltPfad: "rp-be-landesregierung" });
      const initial = clone(store.zustand);
      const result = await run(store, "quellen-rueckbau");
      assert.equal(result.reason, "cas-fehlgeschlagen");
      assert.deepEqual(store.zustand, initial);
      assertBerlinErhalten(store);
      assert.deepEqual(store.writes.map((w) => [w.id, w.neuerStatus]), [
        ["rp-bb-landesparlament", "needs_review"], ["rp-be-landesregierung", "needs_review"], ["rp-bb-landesparlament", "healthy"]
      ]);
    });

    await check("Antwortverlust NACH neuem Zielpfadwrite: unknown != zero, kein weiterer Write", async () => {
      const store = fakeStore({ onWrite({ write, zustand }) {
        if (write.id !== "rp-be-landesregierung") return undefined;
        applyWrite(zustand, write);
        throw new Error("Antwort nach synthetischem Write verloren");
      } });
      const result = await run(store);
      assert.equal(result.reason, "write-ausgang-unbekannt");
      assertOffen(result);
      assert.equal(result.detail.betroffen, null);
      assert.equal(result.detail.ausgangUnbekannt, true);
      assert.equal(store.writes.length, 2);
      assert.equal(store.zustand.pfade[0].status, "healthy");
      assert.equal(store.zustand.pakete[1].status, "active");
      assert.equal(store.calls.slice(store.calls.lastIndexOf("pfad:rp-be-landesregierung:needs_review/manual->healthy/auto") + 1).filter((c) => c === "lesen").length, 1);
      assertBerlinErhalten(store);
    });

    await check("Unklare Adapterergebnisse: null, NaN, >1 und explizit unknown werden nicht zu CAS0", async () => {
      for (const answer of [null, {}, { betroffen: NaN }, { betroffen: 2 }, { betroffen: null, ausgangUnbekannt: true }]) {
        const store = fakeStore({ onWrite() { return answer; } });
        const result = await run(store);
        assert.equal(result.reason, "write-ausgang-unbekannt");
        assertOffen(result);
        assert.equal(store.writes.length, 1);
        assertBerlinErhalten(store);
      }
    });

    await check("Fremde Drift zwischen Writes stoppt fuer Links, Nebenpfade und Pfadidentitaet", async () => {
      const variants = [
        (s) => { s.links.push({ package_id: "pkg-brandenburg-basis", retrieval_path_id: "rp-fremd" }); s.linkedPfade.push({ id: "rp-fremd", status: "needs_review", activation_mode: "manual" }); },
        (s) => { s.links[0].retrieval_path_id = "rp-be-plenum"; },
        (s) => { s.linkedPfade.find((r) => r.id === "rp-rbb24-politik").status = "healthy"; },
        (s) => { s.pfade[0].url = "https://example.invalid/drift"; },
        (s) => { s.pfade[0].url = "https://berlin.de/presse/"; },
        (s) => { s.pfade[0].parser = "fremd"; },
        (s) => { s.pfade[0].status = "healthy"; },
        (s) => { s.pakete[0].status = "prepared"; }
      ];
      for (const change of variants) {
        let changed = false;
        const store = fakeStore({ onRead({ zustand, writes }) {
          if (writes.length === 1 && !changed) { change(zustand); changed = true; }
        } });
        const result = await run(store);
        assertOffen(result);
        assert.equal(store.writes.length, 1);
        assert.equal(store.writes.some((w) => w.id === "pkg-berlin-basis"), false);
      }
    });

    await check("Drift erst unmittelbar VOR zweitem Write wird durch erneute Bindung erkannt", async () => {
      let ownReadCount = 0;
      const store = fakeStore({ onRead({ zustand, writes }) {
        if (writes.length === 1 && ++ownReadCount === 2) zustand.links.pop();
      } });
      const result = await run(store);
      assertOffen(result);
      assert.equal(store.writes.length, 1);
      assertBerlinErhalten(store);
    });

    await check("Readback-Ausfall nach eigenem Write endet offen, ohne blinde Ruecknahme", async () => {
      const store = fakeStore({ onRead({ writes }) { if (writes.length) throw new Error("Readback fehlt"); } });
      const result = await run(store);
      assertOffen(result);
      assert.equal(store.writes.length, 1);
      assertBerlinErhalten(store);
    });

    await check("Kompensationsreadback belegt Erfolg; Readback-Ausfall nach Comp stoppt weitere Comp", async () => {
      let compApplied = false;
      const store = fakeStore({ fehltPfad: "rp-bb-landesparlament",
        onWrite({ write }) { if (write.neuerStatus === "needs_review") compApplied = true; },
        onRead() { if (compApplied) throw new Error("Comp-Readback fehlt"); }
      });
      const result = await run(store);
      assertOffen(result);
      assert.equal(store.writes.length, 4);
      assert.equal(store.zustand.pakete[1].status, "active");
      assert.equal(result.detail.ausgleich.some((entry) => entry.ok === false), true);
      assertBerlinErhalten(store);
    });

    await check("Kompensationswrite mit verlorener Antwort stoppt vor Paket-Ruecknahme", async () => {
      const store = fakeStore({ fehltPfad: "rp-bb-landesparlament", onWrite({ write, zustand }) {
        if (write.neuerStatus !== "needs_review") return undefined;
        applyWrite(zustand, write);
        throw new Error("Comp-Antwort verloren");
      } });
      const result = await run(store);
      assertOffen(result);
      const unknown = result.detail.ausgleich.find((entry) => entry.ausgangUnbekannt);
      assert.equal(unknown.betroffen, null);
      assert.equal(unknown.ok, false);
      assert.equal(store.writes.length, 4);
      assert.equal(store.zustand.pakete[1].status, "active");
      assertBerlinErhalten(store);
    });

    await check("Nach CAS0 eingetretene fremde Drift verhindert jede kompensierende Aenderung", async () => {
      let drifted = false;
      const store = fakeStore({ fehltPfad: "rp-bb-landesparlament", onRead({ zustand, writes }) {
        if (writes.length === 3 && !drifted) {
          zustand.linkedPfade.find((r) => r.id === "rp-rbb24-politik").activation_mode = "auto";
          drifted = true;
        }
      } });
      const result = await run(store);
      assertOffen(result);
      assert.equal(store.writes.length, 3);
      assertBerlinErhalten(store);
    });

    await check("Store selbst sperrt Berliner Paketwrites und halb umgestellte Pfadtransitions", async () => {
      let transportCalls = 0;
      const store = erstelleStore({ request: async () => { transportCalls += 1; return []; } });
      await assert.rejects(() => store.schreibePaketStatus({ id: "pkg-berlin-basis", erwartetStatus: "active", neuerStatus: "prepared" }));
      await assert.rejects(() => store.schreibePaketStatus({ id: "pkg-berlin-basis", erwartetStatus: "active", neuerStatus: "active" }));
      const def = operator.ZIEL_PFADE[0];
      await assert.rejects(() => store.schreibePfadStatus({ id: def.id, erwartetUrl: def.urls[0], erwartetStatus: "needs_review",
        erwartetActivationMode: "manual", neuerStatus: "healthy", neuerActivationMode: "manual" }));
      assert.equal(transportCalls, 0);
    });

    await check("Injizierter REST: nur exakte einzelne Write-ID oder eindeutige CAS0-Antwort", async () => {
      const id = "pkg-brandenburg-basis";
      for (const answer of [[], [{ id }], [{ id: "pkg-berlin-basis" }], [{ id }, { id }], null, {}, [null]]) {
        const calls = [];
        const store = erstelleStore({ request: async (endpoint, options) => { calls.push({ endpoint, options }); return answer; } });
        const result = await store.schreibePaketStatus({ id, erwartetStatus: "prepared", neuerStatus: "active" });
        if (Array.isArray(answer) && answer.length === 0) assert.equal(result.betroffen, 0);
        else if (Array.isArray(answer) && answer.length === 1 && answer[0] && answer[0].id === id) assert.equal(result.betroffen, 1);
        else { assert.equal(result.betroffen, null); assert.equal(result.ausgangUnbekannt, true); }
        assert.equal(calls.length, 1);
        assert.equal(typeof calls[0].options.body, "string");
        assert.deepEqual(JSON.parse(calls[0].options.body), { status: "active" });
        assert.equal(calls[0].options.timeoutMs, REQUEST_TIMEOUT_MS);
      }
      const throwing = erstelleStore({ request: async () => { throw new Error("Timeout nach moeglichem Write"); } });
      const unknown = await throwing.schreibePaketStatus({ id, erwartetStatus: "prepared", neuerStatus: "active" });
      assert.equal(unknown.betroffen, null);
      assert.equal(unknown.ausgangUnbekannt, true);
    });

    await check("REST-Pfadantworten und vollständiges CAS verwenden denselben strengen Vertrag", async () => {
      const def = operator.ZIEL_PFADE[0];
      for (const answer of [[], [{ id: def.id }], [{ id: "rp-bb-landesparlament" }], null]) {
        let call;
        const store = erstelleStore({ request: async (endpoint, options) => { call = { endpoint, options }; return answer; } });
        const result = await store.schreibePfadStatus({ id: def.id, erwartetUrl: def.urls[0], erwartetStatus: "needs_review",
          erwartetActivationMode: "manual", neuerStatus: "healthy", neuerActivationMode: "auto" });
        assert.equal(result.betroffen, answer === null || (answer[0] && answer[0].id !== def.id) ? null : answer.length);
        const params = new URL(call.endpoint, "https://offline.invalid").searchParams;
        assert.equal(params.get("id"), `eq.${def.id}`);
        assert.equal(params.get("publisher_id"), `eq.${def.publisherId}`);
        assert.equal(params.get("legacy_source_id"), `eq.${def.legacySourceId}`);
        assert.equal(params.get("method"), `eq.${def.method}`);
        assert.equal(params.get("url"), `eq.${def.urls[0]}`);
        assert.equal(params.get("parser"), `eq.${def.parser}`);
        assert.equal(params.get("query"), "is.null");
        assert.equal(params.get("status"), "eq.needs_review");
        assert.equal(params.get("activation_mode"), "eq.manual");
        assert.equal(typeof call.options.body, "string");
        assert.deepEqual(JSON.parse(call.options.body), { status: "healthy", activation_mode: "auto" });
        assert.equal(call.options.timeoutMs, REQUEST_TIMEOUT_MS);
      }
    });

    await check("Transport-Wire: echter Store -> storage -> Node Request serialisiert Paket/Pfad als JSON", async () => {
      const NodeRequest = global.Request;
      const NodeResponse = global.Response;
      const blockedFetch = global.fetch;
      const savedEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
      const captured = [];
      try {
        process.env.SUPABASE_URL = "https://bebb-wire.invalid";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-bebb-wire-key";
        // Nur Fetch wird ersetzt: Store und storage.supabaseRequest bleiben reale Module.
        // Node Request liefert die tatsaechliche Body-Coercion des Fetch-API-Vertrags.
        global.fetch = async (url, options) => {
          const request = new NodeRequest(url, options);
          assert.equal(new URL(request.url).origin, "https://bebb-wire.invalid");
          assert.equal(request.method, "PATCH");
          const text = await request.text();
          captured.push({ url: request.url, contentType: request.headers.get("content-type"),
            prefer: request.headers.get("prefer"), rawBodyType: typeof options.body, text });
          const id = new URL(request.url).searchParams.get("id").slice("eq.".length);
          return new NodeResponse(JSON.stringify([{ id }]), { status: 200, headers: { "Content-Type": "application/json" } });
        };
        const store = erstelleStore();
        const def = operator.ZIEL_PFADE[0];
        const cases = [
          { table: "source_packages", id: "pkg-brandenburg-basis", expected: { status: "active" },
            invoke: () => store.schreibePaketStatus({ id: "pkg-brandenburg-basis", erwartetStatus: "prepared", neuerStatus: "active" }) },
          { table: "source_packages", id: "pkg-brandenburg-basis", expected: { status: "prepared" },
            invoke: () => store.schreibePaketStatus({ id: "pkg-brandenburg-basis", erwartetStatus: "active", neuerStatus: "prepared" }) },
          { table: "retrieval_paths", id: def.id, expected: { status: "healthy", activation_mode: "auto" },
            invoke: () => store.schreibePfadStatus({ id: def.id, erwartetUrl: def.urls[0], erwartetStatus: "needs_review",
              erwartetActivationMode: "manual", neuerStatus: "healthy", neuerActivationMode: "auto" }) },
          { table: "retrieval_paths", id: def.id, expected: { status: "needs_review", activation_mode: "manual" },
            invoke: () => store.schreibePfadStatus({ id: def.id, erwartetUrl: def.urls[0], erwartetStatus: "healthy",
              erwartetActivationMode: "auto", neuerStatus: "needs_review", neuerActivationMode: "manual" }) }
        ];
        for (const [index, testCase] of cases.entries()) {
          const result = await testCase.invoke();
          assert.equal(result.betroffen, 1);
          assert.equal(result.ausgangUnbekannt, false);
          assert.equal(captured.length, index + 1, "ein Fetch pro Write, keine Wiederholung");
          const wire = captured[index];
          assert.equal(new URL(wire.url).pathname, `/rest/v1/${testCase.table}`);
          assert.equal(new URL(wire.url).searchParams.get("id"), `eq.${testCase.id}`);
          assert.equal(wire.contentType, "application/json");
          assert.equal(wire.prefer, "return=representation");
          assert.equal(wire.rawBodyType, "string");
          assert.notEqual(wire.text, "[object Object]");
          assert.deepEqual(JSON.parse(wire.text), testCase.expected);
        }
      } finally {
        global.fetch = blockedFetch;
        for (const [key, value] of Object.entries(savedEnv)) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
      }
    });

    await check("Alle vier REST-Reads explizit zeitbegrenzt und vollstaendiger gebundener Bestand", async () => {
      const calls = [];
      const store = erstelleStore({ request: async (endpoint, options) => {
        calls.push({ endpoint, options });
        if (endpoint.startsWith("/rest/v1/source_packages?")) return pakete("vorher");
        if (endpoint.startsWith("/rest/v1/package_paths?")) return links();
        if (endpoint.includes("publisher_id")) return pfade("vorher");
        return linkedPfade();
      } });
      const bestand = await store.leseZielbestand();
      assert.equal(operator.klassifiziere(bestand).gesamt, "vorher");
      assert.equal(calls.length, 4);
      assert.equal(REQUEST_TIMEOUT_MS, 15000);
      for (const call of calls) assert.equal(call.options.timeoutMs, REQUEST_TIMEOUT_MS);
      assert.equal(bestand.linkedPfade.length, 15);
      assert.equal(bestand.links.length, 16);
      const graphRequest = calls.find((call) => call.endpoint.startsWith("/rest/v1/package_paths?"));
      const graphParams = new URL(graphRequest.endpoint, "https://offline.invalid").searchParams;
      assert.equal(graphParams.get("or"), "(package_id.in.(pkg-berlin-basis,pkg-brandenburg-basis),retrieval_path_id.in.(rp-be-landesregierung,rp-bb-landesparlament))");
    });
  } finally { global.fetch = previousFetch; }
  console.log(`\nErgebnis: ${pass} PASS, ${fail} FAIL (nur neuer Basisvertrag, kein Netz)`);
  if (fail) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
