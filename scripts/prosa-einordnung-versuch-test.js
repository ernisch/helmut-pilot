"use strict";
const A = require("node:assert/strict"), C = require("node:crypto"), Z = require("node:zlib");
const { EventEmitter } = require("node:events");
const V = require("./prosa-einordnung-versuch"), P = require("../lib/helmut/prosa-einordnung");
const F = require("./fixtures/prosa-einordnung"), T = require("./privater-nachweis-transport");
const { hash } = require("../lib/helmut/briefing-speicher");
const keys = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const privateKey = keys.privateKey.export({ format: "pem", type: "pkcs8" });
const a = { commit: "a".repeat(40), productionCommit: "b".repeat(40), publicKey, paketHash: V.paket().paketHash };
const encode = x => V.PREFIX + Z.gzipSync(JSON.stringify(x)).toString("base64");
const zeit = new Date("2026-09-21T10:00:00Z");
function setup(change = {}) {
  const env = { CONFIRM_TEXT: encode(a), GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/" + V.BRANCH,
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: a.commit, GITHUB_RUN_ID: "123456789",
    HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main", HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth",
    VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
    HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200", HELMUT_ANBIETER_STEUERUNG: "on",
    HELMUT_ANBIETER_AZURE_MINUTE: "20", HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
    SUPABASE_URL: "https://ddckuvvpcytqbyfmbvie.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test", HELMUT_CRON_SECRET: "test",
    AZURE_OPENAI_KEY: "test", AZURE_OPENAI_ENDPOINT: "https://test.openai.azure.com/" };
  let auth = { prosaEinordnung20260921: { status: "gestoppt", runId: "nachlauf500-35573253937", ergebnis: "unveraendert" }, sessions: [], auditEvents: [], systemErrors: [], dailyInputs: [], llmUsage: [], processRuns: [],
    testKostenTage: { [V.TAG]: { version: 1, day: V.TAG, tarif: "azure-gpt5-mini-obergrenze-20260909", limit: 4000000,
      spent: 0, baseline: 0, baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null } } };
  let count = 0, reads = 0, writes = 0; const logs = [], calls = [];
  const storage = { readAuthStore: async () => { reads++; const x = structuredClone(auth); change.read?.(x, reads); return x; },
    mutateAuthStore: async fn => { const x = structuredClone(auth); await fn(x); writes++; change.write?.(x, writes); auth = x; },
    leseLlmTageszaehler: async () => ({ ok: true, used: count, limit: 2416 }) };
  const runtime = { ok: true, reinLesend: true, schemaVersion: 1, production: true, commit: a.productionCommit,
    storageSupabase: true, kommunikationGesperrt: true, kohortenQuellenGesperrt: true, tagesdeckel: 2416,
    understandingReserve: 702, vorrangreserveReal: 200, testKosten: { version: 2, aktiv: true, limitUsd: 4 } };
  const fetchFn = async (url, opts) => {
    A.equal(opts.method, "GET");
    const data = url.includes("testnachweis-status") ? structuredClone(runtime)
      : url.includes("mandate_profiles?") ? Array.from({ length: 504 }, (_, i) => ({ user_id: "test" + i, aktiv: false })) : [];
    change.fetch?.(url, data); return { status: 200, json: async () => data };
  };
  const ai = { understandingModelName: () => "gpt-5-mini", requestStructuredJson: async (prompt, schema, meta, model, options) => {
    count++; calls.push({ prompt, schema, meta, model, options });
    const u = { id: "usage" + count, runId: meta.runId, politicianId: meta.politicianId,
      callType: meta.callType, success: true, model, promptTokens: 100, completionTokens: 100 };
    const t = auth.testKostenTage[V.TAG]; t.manualCalls++; t.spent += 450;
    t.calls["call" + count] = { status: "abgerechnet", reserved: 212000, maxOutputTokens: 3000, manual: true,
      createdAt: zeit.toISOString(), cost: 450, bezug: { version: 1, runId: meta.runId,
        mandatHash: C.createHash("sha256").update(JSON.stringify(meta.politicianId)).digest("hex"), phase: meta.testKostenPhase } };
    auth.llmUsage = [u, ...auth.llmUsage].slice(0, 5000);
    let answer = meta.testKostenPhase === "entwurf" ? F.entwurf(3)
      : F.urteil(JSON.parse(prompt.split("PRUEFEINGABE: ")[1]));
    if (change.answer) answer = change.answer(answer, count, auth);
    return answer;
  } };
  const observe = async call => { let answer = null, failed = false;
    try { answer = await call(); } catch { failed = true; }
    const record = { requests: 1, complete: true, statusCode: 200, rawResponse: JSON.stringify({ answer }), responseHash: hash(answer) };
    change.transport?.(record); return { answer, failed, record }; };
  const deps = { env, storage, fetchFn, ai, observe, now: () => new Date(zeit), emit: r => logs.push(r) };
  return { deps, logs, calls, runtime, auth: () => auth, writes: () => writes,
    decode: envelope => T.entschluesseln(envelope, privateKey, { runId: env.GITHUB_RUN_ID, commit: a.commit,
      tag: V.TAG, abPosition: 1, anzahl: 1 }) };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  await test("Neuer Auftrag laesst den geschlossenen Vorversuch unveraendert und verlangt dessen Abschluss", async () => {
    const s = setup(), old = structuredClone(s.auth().prosaEinordnung20260921);
    const out = await V.ausfuehren(s.deps);
    A.equal(out.ok, true); A.deepEqual(s.auth().prosaEinordnung20260921, old);
    A.notEqual(V.KEY, "prosaEinordnung20260921");
    A.throws(() => V.eingabe("EINORDNUNG_EINMAL:" + encode(a).slice(V.PREFIX.length)));
    const bad = setup(); bad.auth().prosaEinordnung20260921.status = "begonnen";
    await A.rejects(V.ausfuehren(bad.deps), /EINORDNUNG_VORVERSUCH_OFFEN/);
    A.equal(bad.calls.length, 0); A.equal(bad.writes(), 0);
    A.deepEqual(s.calls[0].schema, require("../lib/helmut/prosa-einordnung-ai").entwurfSchema(P.binde(V.paket())));
  });
  await test("Fester Auftrag bindet Code, Productionstand, Paket und Empfaenger", () => {
    A.deepEqual(V.eingabe(encode(a)), a);
    for (const x of [{ ...a, paketHash: "f".repeat(64) }, { ...a, commit: "main" }, { ...a, budget: 9 }])
      A.throws(() => V.eingabe(encode(x)));
  });
  await test("Branch, Runwiederholung, Tag, Modell und fremde Umgebungswerte sperren vor jeder Mutation", async () => {
    for (const [k, value] of [["GITHUB_REF", "refs/heads/main"], ["GITHUB_RUN_ATTEMPT", "2"],
      ["AZURE_OPENAI_DEPLOYMENT", "anderes-modell"], ["HELMUT_TENANT_LLM_CAP", "on"], ["OPENAI_API_KEY", "test"]]) {
      const s = setup(); s.deps.env[k] = value; await A.rejects(V.ausfuehren(s.deps)); A.equal(s.writes(), 0);
    }
    const s = setup(); s.deps.now = () => new Date("2026-09-22T10:00:00Z");
    await A.rejects(V.ausfuehren(s.deps)); A.equal(s.writes(), 0);
  });
  await test("Laufzeit, aktive Profile, offene Jobs und lebende Sperren verhindern den Start", async () => {
    for (const path of ["testnachweis-status", "mandate_profiles?", "pipeline_locks?", "status=neq.erledigt", "helmut_verstehen_reservierungen?"]) {
      const s = setup({ fetch(url, data) { if (!url.includes(path)) return;
        if (path === "testnachweis-status") data.commit = "c".repeat(40);
        else if (path === "mandate_profiles?") data[0].aktiv = true; else data.push({ id: "lauf" }); } });
      await A.rejects(V.ausfuehren(s.deps)); A.equal(s.writes(), 0); A.equal(s.calls.length, 0);
    }
  });
  await test("Zwei echte Adapterphasen erhalten Rohantwort, Kosten und ungeschwaechten Vertrag", async () => {
    const s = setup(); const out = await V.ausfuehren(s.deps);
    A.equal(out.ok, true); A.equal(out.fachlichBestanden, false); A.equal(out.inProductionImportiert, false);
    A.equal(s.calls.length, 2); A(s.calls.every(c => c.model === "gpt-5-mini" && c.options.strict && c.options.reasoningEffort === "low"));
    const r = s.auth()[V.KEY]; A.equal(r.status, "gestoppt"); A.equal(r.phasen.length, 2);
    for (const phase of r.phasen) {
      A.equal(phase.kosten, 450); A.equal(s.decode(phase.transport).record.complete, true);
      A.equal(phase.antwortHash, hash(s.decode(phase.antwort).antwort));
    }
    const result = s.decode(r.ergebnis).result;
    A.equal(result.ausgabe.pruefung.vollstaendigeFaktenpruefung, false);
    A(P.textAusgabe(result.ausgabe).includes("kann Fehler enthalten"));
    A(!JSON.stringify(s.logs).includes(F.faelle[3].tatsache));
    await A.rejects(V.ausfuehren(s.deps), /BEREITS_BEGONNEN/); A.equal(s.calls.length, 2);
  });
  await test("Fehlende Startquittung erreicht kein Modell", async () => {
    const s = setup({ read(x, n) { if (n === 1) delete x[V.KEY]; } });
    await A.rejects(V.ausfuehren(s.deps), /START_UNBESTAETIGT/); A.equal(s.calls.length, 0);
  });
  await test("Nicht bestaetigte Rohantwort stoppt vor dem zweiten Aufruf", async () => {
    const s = setup({ read(x) { if (x[V.KEY]?.phasen[0]?.transport) delete x[V.KEY].phasen[0].transport; } });
    await A.rejects(V.ausfuehren(s.deps)); A.equal(s.calls.length, 1);
    A(s.logs.some(x => x.typ === "einordnung-transport"));
  });
  await test("Fremder gemeinsamer Zustand wird nicht ueberschrieben", async () => {
    const s = setup({ answer(answer, n, auth) { auth[V.KEY].fremdeAenderung = true; return answer; } });
    await A.rejects(V.ausfuehren(s.deps), /SCHREIBKONFLIKT/); A.equal(s.calls.length, 1);
    A.equal(s.auth()[V.KEY].fremdeAenderung, true);
  });
  await test("Fachlich oder strukturell unbrauchbarer Entwurf wird mit Rohantwort geschlossen", async () => {
    const s = setup({ answer: () => ({ bloecke: [] }) }); const out = await V.ausfuehren(s.deps);
    A.equal(out.ok, false); A.equal(s.calls.length, 1); A.equal(s.auth()[V.KEY].status, "gestoppt");
    A.deepEqual(s.decode(s.auth()[V.KEY].phasen[0].transport).answer, { bloecke: [] });
  });
  await test("Negatives Sprachurteil bleibt im Abschluss erhalten und erzeugt keine Ausgabe", async () => {
    const s = setup({ answer(x, n) { if (n === 2) x.pruefungen[0].status = "unklar"; return x; } });
    const out = await V.ausfuehren(s.deps); A.equal(out.ok, false); A.equal(s.calls.length, 2);
    A.equal(s.decode(s.auth()[V.KEY].phasen[1].antwort).antwort.pruefungen[0].status, "unklar");
    A.equal(s.decode(s.auth()[V.KEY].ergebnis).result, null);
  });
  await test("Kostenbeleg oder geschuetzte Historie abweichend: kein zweiter Modellaufruf", async () => {
    for (const edit of [a => { a.llmUsage[0].politicianId = "fremd"; }, a => { a.sessions.push({ id: "fremd" }); },
      a => { a.testKostenTage[V.TAG].calls.call1.bezug.phase = "pruefung"; }]) {
      const s = setup({ answer(x, n, auth) { edit(auth); return x; } });
      const out = await V.ausfuehren(s.deps); A.equal(out.ok, false); A.equal(s.calls.length, 1);
    }
  });
  await test("Fehlender Tagesbeleg und unzureichende volle Reserve bleiben Startblocker", async () => {
    for (const mode of ["fehlt", "voll", "offen"]) {
      const s = setup(), t = s.auth().testKostenTage[V.TAG];
      if (mode === "fehlt") delete s.auth().testKostenTage[V.TAG];
      else if (mode === "voll") t.spent = t.baseline = 3800000;
      else t.calls.alt = { status: "ungeklaert", reserved: 212000, maxOutputTokens: 3000,
        manual: false, createdAt: zeit.toISOString() };
      await A.rejects(V.ausfuehren(s.deps)); A.equal(s.calls.length, 0);
    }
  });
  await test("Transportfehler erhaelt auch eine unvollstaendige Anbieterantwort", async () => {
    const s = setup({ transport(r) { r.complete = false; r.rawResponse = '{"unfinished":'; } });
    const out = await V.ausfuehren(s.deps); A.equal(out.ok, false); A.equal(s.calls.length, 1);
    A.equal(s.decode(s.auth()[V.KEY].phasen[0].transport).record.rawResponse, '{"unfinished":');
  });
  await test("Ablauf des Zeitfensters zwischen den Phasen verhindert den Reviewaufruf", async () => {
    const s = setup(); s.deps.now = () => new Date(zeit.getTime() + (s.calls.length ? V.MAX_MS : 0));
    const out = await V.ausfuehren(s.deps); A.equal(out.ok, false); A.equal(s.calls.length, 1);
    A.equal(s.auth()[V.KEY].status, "gestoppt");
  });
  await test("Verdraengte Telemetrie wird vor den beiden Aufrufen dauerhaft gesichert", async () => {
    const s = setup(); s.auth().llmUsage = Array.from({ length: 5000 }, (_, i) => ({ id: "alt" + i }));
    const tail = structuredClone(s.auth().llmUsage.slice(-2));
    const out = await V.ausfuehren(s.deps); A.equal(out.ok, true);
    A.deepEqual(s.auth()[V.KEY].archivierteAufruftelemetrie, tail);
    A.equal(s.auth().llmUsage.length, 5000); A.equal(s.auth().llmUsage.at(-1).id, "alt4997");
  });
  await test("Reale Transportbeobachtung sichert unlesbares JSON und stellt HTTPS wieder her", async () => {
    const original = function(url, options, cb) {
      const req = new EventEmitter(); req.write = () => true; req.destroy = () => req.emit("close");
      req.end = () => { const res = new EventEmitter(); res.statusCode = 200; cb(res);
        res.emit("data", Buffer.from("kein JSON")); res.emit("end"); req.emit("close"); }; return req;
    };
    const https = { request: original }, s = setup(), schema = { type: "object" }, prompt = "test";
    const out = await V.transport(async () => {
      const req = https.request(new URL("https://test.openai.azure.com/openai/v1/responses"), { method: "POST" }, () => {});
      req.write(JSON.stringify({ model: "gpt-5-mini", input: prompt, max_output_tokens: 3000,
        reasoning: { effort: "low" }, text: { format: { type: "json_schema", name: "knowledge_object", schema, strict: true } } }));
      req.end(); throw new Error("JSON unlesbar");
    }, { prompt, schema, env: s.deps.env, deadline: zeit.getTime() + 300000, now: () => zeit }, https);
    A.equal(out.failed, true); A.equal(out.record.rawResponse, "kein JSON"); A.equal(out.record.complete, true);
    A.equal(https.request, original);
  });
  await test("Transport verweigert zweiten Request und abweichende Nutzlast vor dem Absenden", async () => {
    let sent = 0, cancelled = 0;
    const original = () => { const req = new EventEmitter(); req.write = () => { sent++; }; req.end = () => req.emit("close");
      req.destroy = () => { cancelled++; req.emit("close"); }; return req; };
    for (const repeat of [true, false]) {
      const https = { request: original }, s = setup();
      const out = await V.transport(async () => {
        const req = https.request("https://test.openai.azure.com/openai/v1/responses", { method: "POST" }, () => {});
        if (repeat) https.request("https://test.openai.azure.com/openai/v1/responses", { method: "POST" }, () => {});
        else req.write(JSON.stringify({ input: "abweichend" }));
      }, { prompt: "test", schema: {}, env: s.deps.env, deadline: zeit.getTime() + 300000, now: () => zeit }, https);
      A.equal(out.failed, true); A.equal(sent, 0); A.equal(https.request, original);
    }
    A.equal(cancelled, 2);
  });
  console.log(`${passed}/${passed} Versuchsgruppen bestanden; kein Netz und kein Modellaufruf.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
