"use strict";
const A = require("node:assert/strict"), C = require("node:crypto"), Z = require("node:zlib");
const F = require("node:fs"), { EventEmitter } = require("node:events");
const G = require("./quellenfakten-versuch"), T = require("./privater-nachweis-transport");
const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const privateKey = pair.privateKey.export({ format: "pem", type: "pkcs8" });
const now = () => new Date("2026-09-20T12:00:00Z");
const input = { commit: "a".repeat(40), position: 1, previous: null, publicKey };
const encode = a => G.PREFIX + Z.gzipSync(JSON.stringify(a)).toString("base64");
function env(a = input) { return { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: `refs/heads/${G.BRANCH}`,
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: input.commit, GITHUB_RUN_ID: "12345678901",
  HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main", HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth",
  VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
  HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200", HELMUT_ANBIETER_STEUERUNG: "on",
  HELMUT_ANBIETER_AZURE_MINUTE: "20", HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
  SUPABASE_URL: "https://ddckuvvpcytqbyfmbvie.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetisch",
  AZURE_OPENAI_KEY: "synthetisch", AZURE_OPENAI_ENDPOINT: "https://synthetisch.openai.azure.com",
  HELMUT_CRON_SECRET: "synthetisch", CONFIRM_TEXT: encode(a) }; }
const Eingang = require("./quellenfakten-eingang");
const answerAt = p => ({ kandidaten: Eingang.block(p).faelle.map(f => ({ id: f.id, beleg: f.quelle.text, ...f.soll })) });
const answer = answerAt(1);
function harness(options = {}) {
  let auth = { users: [{ id: "geschuetzt" }], sessions: [], auditEvents: [], systemErrors: [], dailyInputs: [], llmUsage: [], processRuns: [] };
  let calls = 0, writes = 0, used = 0, queue = Promise.resolve(); const emits = [];
  const storage = {
    readAuthStore: async () => structuredClone(auth),
    mutateAuthStore: fn => {
      const p = queue.then(async () => { const s = structuredClone(auth); const r = await fn(s);
        if (options.unknownWrite) throw new Error("unbekannt"); auth = s; writes++; return r; });
      queue = p.catch(() => {}); return p;
    },
    leseLlmTageszaehler: async () => ({ ok: true, used, limit: 2416 })
  };
  const fetchFn = async (url, config) => {
    A.equal(config.method, "GET"); A.equal(config.redirect, "error");
    if (url.startsWith(env().SUPABASE_URL)) return { status: 200, json: async () => (options.active || options.lease && url.includes("helmut_verstehen_reservierungen") || options.pending && url.includes("status=neq.erledigt")) ? [{}] : [] };
    return { status: 200, json: async () => ({ ok: true, reinLesend: true, schemaVersion: 1, production: true,
      commit: "be4b237b6154248f30e175235ed81aa9893b01bf", storageSupabase: true,
      kommunikationGesperrt: !options.communicationOpen, kohortenQuellenGesperrt: true, tagesdeckel: 2416,
      understandingReserve: 702, vorrangreserveReal: 200, testKosten: { version: 2, aktiv: true, limitUsd: 4 } }) };
  };
  const request = async (prompt, schema, meta, model, settings) => {
    A.equal(auth[G.KEY].status, "fall-begonnen"); calls++; used++;
    A.equal(prompt, G.paket()[auth[G.KEY].faelle.length - 1].prompt); A.equal(model, "gpt-5-mini");
    A.equal(G.sha(JSON.stringify(schema)), G.SCHEMA_HASH); A.deepEqual(settings, { strict: false, reasoningEffort: "minimal" });
    if (options.modelError) throw new Error("simuliert");
    const d = "2026-09-20";
    auth.testKostenTage ||= {}; auth.testKostenTage[d] ||= { version: 1, day: d, tarif: "azure-gpt5-mini-obergrenze-20260909",
      limit: 4000000, spent: 0, baseline: 0, baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null };
    auth.testKostenTage[d].calls[`test-${calls}`] = { status: "abgerechnet", reserved: 212000, cost: 850,
      maxOutputTokens: 3000, manual: false, createdAt: now().toISOString() }; auth.testKostenTage[d].spent += 850;
    auth.llmUsage = [{ runId: meta.runId, model, success: true, promptTokens: 100, completionTokens: 200 }, ...auth.llmUsage].slice(0, 5000);
    if (options.foreignWrite) auth.users.push({ id: "verboten" });
    if (options.oldCostMutation) auth.testKostenTage["2026-09-18"] = { spent: 0 };
    if (options.baselineMutation) { auth.testKostenTage[d].baseline = 1; auth.testKostenTage[d].spent++; }
    if (options.costUnknown) auth.testKostenTage[d].calls[`test-${calls}`] = { status: "ungeklaert", reserved: 212000 };
    return options.schemaBad ? {} : answerAt(auth[G.KEY].faelle.length);
  };
  const observe = async (call, opts) => {
    const r = await call(); const transport = { statusCode: 200, rawResponse: JSON.stringify({ answer: r }),
      responseHash: G.sha(JSON.stringify(r)) }; opts.emit(transport); return { answer: r, count: 1, transport };
  };
  const run = (a = input, extra = {}) => G.ausfuehren({ env: env(a), now, storage, fetchFn, request, observe,
    emit: e => emits.push(e), ...extra });
  return { run, storage, fetchFn, request, emits, state: () => ({ auth, calls, writes, used }),
    setUsed: n => { used = n; } };
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
(async () => {
  await test("Alle sechs Quellenprompts und Schema an getrennten Sollkorpus gebunden", () => {
    A.equal(G.paket().length, 6); A.deepEqual(G.paket().map(f => f.promptHash), G.PROMPTS);
    A.deepEqual(G.eingabe(encode(input)), input);
    for (const a of [{ ...input, position: 0 }, { ...input, position: 9 }, { ...input, previous: {} },
      { ...input, position: 2 }, { ...input, extra: true }, { ...input, commit: "fremd" }]) A.throws(() => G.eingabe(encode(a)));
  });
  await test("Falsche Ausfuehrung und Konfiguration verhindern Start", () => {
    G.konfiguration(input, env(), now());
    for (const k of Object.keys(env()).filter(k => k !== "CONFIRM_TEXT"))
      A.throws(() => G.konfiguration(input, { ...env(), [k]: "" }, now()), k);
    for (const k of ["OPENAI_API_KEY", "NODE_OPTIONS", "HELMUT_ARTIKELKONTEXT", "HELMUT_KI_TIMEOUT_MS"])
      A.throws(() => G.konfiguration(input, { ...env(), [k]: "fremd" }, now()));
    A.throws(() => G.konfiguration(input, env(), new Date("2026-09-21T00:00:00Z")));
  });
  await test("Aktive Profile, offene Kommunikation und unklarer Claim erzeugen keinen Modellaufruf", async () => {
    for (const options of [{ active: true }, { lease: true }, { pending: true }, { communicationOpen: true }, { unknownWrite: true }]) {
      const h = harness(options); await A.rejects(h.run()); A.equal(h.state().calls, 0); A.equal(h.state().writes, 0);
    }
  });
  await test("Positiver Transport und Kostenabschluss erlauben keine automatische Fortsetzung", async () => {
    const h = harness(); A.equal((await h.run()).ok, true); A.equal(h.state().calls, 1);
    A.equal(h.state().auth[G.KEY].status, "wartet-auf-fachpruefung");
    const r = T.entschluesseln(h.emits[1].envelope, privateKey,
      { runId: env().GITHUB_RUN_ID, commit: input.commit, tag: "2026-09-20", abPosition: 1, anzahl: 1 });
    A.deepEqual(r.answer, answer); A.equal(r.fachlichBestanden, false);
    await A.rejects(h.run()); A.equal(h.state().calls, 1);
    await A.rejects(h.run({ ...input, position: 3, previous: { responseHash: "b".repeat(64), reviewHash: "c".repeat(64) } }));
    A.equal(h.state().calls, 1);
  });
  await test("Sechs verschiedene Positionen einmalig und nur nach gebundener Vorbewertung", async () => {
    const h = harness(); await h.run();
    for (let position = 2; position <= 6; position++) {
      const previous = { responseHash: G.sha(JSON.stringify(answerAt(position - 1))), reviewHash: G.sha(`Bewertung ${position - 1}`) };
      A.equal((await h.run({ ...input, position, previous }, { env: { ...env({ ...input, position, previous }),
        GITHUB_RUN_ID: String(12345678900 + position) } })).ok, true);
    }
    A.equal(h.state().calls, 6); A.equal(h.state().auth[G.KEY].faelle.length, 6);
    A.equal(h.state().auth[G.KEY].faelle.reduce((s, f) => s + f.kosten, 0), 5100);
    await A.rejects(h.run()); A.equal(h.state().calls, 6);
  });
  await test("Falscher Antwortbezug, Wiederholung und paralleler Claim bleiben gesperrt", async () => {
    const h = harness(); const result = await Promise.allSettled([h.run(), h.run()]);
    A.equal(result.filter(r => r.status === "fulfilled").length, 1); A.equal(h.state().calls, 1);
    await A.rejects(h.run({ ...input, position: 2, previous: { responseHash: "f".repeat(64), reviewHash: "a".repeat(64) } }));
    A.equal(h.state().calls, 1);
  });
  await test("Voller echter Nutzungsring behaelt alle Altbelege ueber sechs neue Positionen", async () => {
    const h = harness(), old = Array.from({ length: 5000 }, (_, i) => ({ runId: `alt-${i}`, createdAt: "2026-09-18T12:00:00Z", promptTokens: i }));
    await h.storage.mutateAuthStore(a => { a.llmUsage = structuredClone(old); });
    for (let position = 1; position <= 6; position++) {
      const a = { ...input, position, previous: position === 1 ? null : {
        responseHash: G.sha(JSON.stringify(answerAt(position - 1))), reviewHash: G.sha(`Bewertung ${position - 1}`) } };
      A.equal((await h.run(a, { env: { ...env(a), GITHUB_RUN_ID: String(12345678900 + position) } })).ok, true);
      const auth = h.state().auth, archive = auth[G.KEY].archivierteAufruftelemetrie;
      A.deepEqual(archive, old.slice(-6)); A.equal(auth.llmUsage.length, 5000);
      A.deepEqual(auth.llmUsage.slice(position), old.slice(0, 5000 - position));
      A.deepEqual([...auth.llmUsage.slice(position), ...archive.slice(6 - position)], old);
    }
    A.equal(h.state().calls, 6);
  });
  await test("Fehlende Archivzeile und fremde Telemetrieaenderung bestehen nicht", () => {
    const old = Array.from({ length: 5000 }, (_, i) => ({ runId: `alt-${i}` })), usage = [{ runId: "neu" }];
    const before = { llmUsage: old }, after = { llmUsage: [...usage, ...old].slice(0, 5000) };
    A.equal(G.telemetrieErhalten(before, after, usage, { archivierteAufruftelemetrie: [] }), false);
    const claim = { archivierteAufruftelemetrie: old.slice(-6) };
    A.equal(G.telemetrieErhalten(before, after, usage, claim), true);
    after.llmUsage[3] = { runId: "fremd" };
    A.equal(G.telemetrieErhalten(before, after, usage, claim), false);
  });
  await test("Modellfehler, Schemafehler, ungeklaerte Kosten und fremde Mutation stoppen", async () => {
    for (const opts of [{ modelError: true }, { schemaBad: true }, { costUnknown: true }, { foreignWrite: true }, { oldCostMutation: true }, { baselineMutation: true }]) {
      const h = harness(opts); const r = await h.run(); A.equal(r.ok, false); A.equal(h.state().calls, 1);
      A.equal(h.state().auth[G.KEY].status, "gestoppt");
      await A.rejects(h.run({ ...input, position: 2, previous: { responseHash: G.sha(JSON.stringify(answer)), reviewHash: "c".repeat(64) } }));
      A.equal(h.state().calls, 1);
    }
  });
  await test("30 Minuten Gesamtzeit, Abschlussreserve und UTC Tag verhindern spaete Fortsetzung", async () => {
    const h = harness(); await h.run(); const previous = { responseHash: G.sha(JSON.stringify(answer)), reviewHash: "c".repeat(64) };
    for (const d of ["2026-09-20T12:27:01Z", "2026-09-20T12:28:01Z", "2026-09-20T12:30:01Z", "2026-09-21T00:00:00Z"])
      await A.rejects(h.run({ ...input, position: 2, previous }, { now: () => new Date(d) }));
    A.equal(h.state().calls, 1);
  });
  await test("Fehlende Kostenhistorie und volle Tagesreserve sperren vor Claim", async () => {
    const h = harness(); h.setUsed(1); await A.rejects(h.run()); A.equal(h.state().writes, 0);
    const s = harness(); await s.run();
    await s.storage.mutateAuthStore(auth => { delete auth[G.KEY]; const t = auth.testKostenTage["2026-09-20"];
      t.baseline = 3000000; t.spent += t.baseline; });
    await A.rejects(s.run()); A.equal(s.state().calls, 1);
  });
  await test("Echter KI Pfad reserviert vor HTTPS und archiviert vollstaendige Rohantwort", async () => {
    const S = require("../lib/helmut/storage"), https = require("node:https"), original = https.request;
    const envOld = { ...process.env }, DateOld = Date, h = harness(); let used = 0; const trace = [];
    const names = ["readAuthStore", "mutateAuthStore", "leseLlmTageszaehler", "reserveLlmCall", "recordLlmUsage", "anbieterReserviere", "anbieterMelde"];
    names.forEach(k => A.equal(typeof S[k], "function")); const old = Object.fromEntries(names.map(k => [k, S[k]]));
    try {
      global.Date = class extends DateOld { constructor(...args) { super(...(args.length ? args : ["2026-09-20T12:00:00Z"])); }
        static now() { return DateOld.parse("2026-09-20T12:00:00Z"); } };
      Object.assign(process.env, env()); Object.assign(S, h.storage);
      S.leseLlmTageszaehler = async () => ({ ok: true, used, limit: 2416 });
      S.reserveLlmCall = async () => { A.equal(h.state().auth[G.KEY].faelle.length, 1);
        A.equal(Object.values(h.state().auth.testKostenTage["2026-09-20"].calls)[0].reserved, 212000);
        used++; trace.push("reserve"); return { allowed: true, atomic: true }; };
      S.anbieterReserviere = async a => { A.equal(a.schluessel, "azure|gpt-5-mini|ki"); trace.push("anbieter"); return { verfuegbar: true, erlaubt: true }; };
      S.anbieterMelde = async () => ({ verfuegbar: true });
      S.recordLlmUsage = async info => { const r = S.buildLlmUsageRecord(info);
        await h.storage.mutateAuthStore(a => { a.llmUsage = [r, ...a.llmUsage].slice(0, 5000); }); trace.push("usage"); return { ...r, _ablage: { blob: true } }; };
      const raw = JSON.stringify({ status: "completed", usage: { input_tokens: 100, output_tokens: 200 },
        output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }], ungekappterBeleg: "original" });
      https.request = (url, opts, cb) => { A.deepEqual(trace, ["reserve", "anbieter"]); trace.push("http");
        const req = new EventEmitter(); req.destroy = () => req.emit("close"); req.write = () => {};
        req.end = () => setImmediate(() => { const res = new EventEmitter(); res.setEncoding = () => {}; res.statusCode = 200;
          cb(res); res.emit("data", raw.slice(0, 100)); res.emit("data", raw.slice(100)); res.emit("end"); req.emit("close"); }); return req; };
      A.equal((await h.run(input, { storage: S, request: require("../lib/helmut/ai").requestStructuredJson,
        observe: G.mitTransportbeleg })).ok, true);
      A.deepEqual(trace, ["reserve", "anbieter", "http", "usage"]);
      const requestBeleg = T.entschluesseln(h.emits[0].envelope, privateKey,
        { runId: env().GITHUB_RUN_ID, commit: input.commit, tag: "2026-09-20", abPosition: 1, anzahl: 1 });
      A.equal(requestBeleg.phase, "request"); A.equal(requestBeleg.rawResponse, null);
      A.equal(JSON.parse(requestBeleg.requestRaw).input, G.paket()[0].prompt);
      const transport = T.entschluesseln(h.emits[1].envelope, privateKey,
        { runId: env().GITHUB_RUN_ID, commit: input.commit, tag: "2026-09-20", abPosition: 1, anzahl: 1 });
      A.equal(transport.rawResponse, raw); A.equal(transport.request.input, G.paket()[0].prompt);
      A.equal(JSON.stringify(transport).includes("synthetisch.openai.azure.com"), false);
      A.equal(h.state().auth.testKostenTage["2026-09-20"].spent, 850);
    } finally { https.request = original; global.Date = DateOld; Object.assign(S, old);
      for (const k of Object.keys(process.env)) if (!(k in envOld)) delete process.env[k]; Object.assign(process.env, envOld); }
  });
  await test("Workflow bindet neuen Branch und haelt Gipfeljob, Crons und Anwendung unveraendert", () => {
    const yaml = F.readFileSync(require("node:path").join(__dirname, "../.github/workflows/staff-backfill-one.yml"), "utf8");
    const own = yaml.slice(yaml.indexOf("  quellenfakten-eingang:"));
    A(own.includes(`refs/heads/${G.BRANCH}`)); A(own.includes("github.run_attempt == 1"));
    A(own.includes("timeout-minutes: 3")); A(own.includes("node scripts/quellenfakten-versuch.js"));
    A(yaml.includes("!startsWith(inputs.confirm_text, 'FAKTEN_EINMAL:')"));
    A.equal(require("../vercel.json").git.deploymentEnabled[G.BRANCH], false);
  });
  console.log(`${pass}/${pass} Quellenfakten Schutzgruppen bestanden.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
