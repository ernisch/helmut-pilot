"use strict";
const A = require("node:assert/strict"), C = require("node:crypto"), Z = require("node:zlib");
const G = require("./gipfel-modellversuch"), T = require("./privater-nachweis-transport");
const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" });
const now = () => new Date("2026-09-18T12:00:00Z");
const input = { commit: "a".repeat(40), prompt: "SYNTHETISCHER QUELLENTEXT", publicKey };
const betriebsPfade = [
  "/rest/v1/mandate_profiles?select=user_id&aktiv=eq.true&limit=1",
  "/rest/v1/pipeline_locks?select=job_name&expires_at=gt.2026-09-18T12%3A00%3A00.000Z&limit=1",
  "/rest/v1/helmut_jobs?select=id&lease_expires_at=gt.2026-09-18T12%3A00%3A00.000Z&limit=1",
  "/rest/v1/process_runs?select=run_id&finished_at=is.null&started_at=gt.2026-09-18T11%3A40%3A00.000Z&limit=1"
];
function environment() { return {
  GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: `refs/heads/${G.BRANCH}`,
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: input.commit,
  GITHUB_RUN_ID: "12345678901", HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main",
  HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", VERCEL_ENV: "production",
  HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
  HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200",
  HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_AZURE_MINUTE: "20",
  HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
  SUPABASE_URL: "https://ddckuvvpcytqbyfmbvie.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetisch",
  AZURE_OPENAI_KEY: "synthetisch", HELMUT_CRON_SECRET: "synthetisch",
  AZURE_OPENAI_ENDPOINT: "https://synthetisch.openai.azure.com"
}; }
function harness(options = {}) {
  let auth = { sessions: [], auditEvents: [], systemErrors: [], dailyInputs: [], llmUsage: [], processRuns: [],
    users: [{ id: "geschuetzt" }], assignments: [{ id: "geschuetzt" }] }, calls = 0, writes = 0, used = 0;
  let queue = Promise.resolve(); const emits = [], trace = [];
  const storage = {
    readAuthStore: async () => structuredClone(auth),
    mutateAuthStore: fn => {
      const next = queue.then(async () => { const copy = structuredClone(auth); const r = await fn(copy);
        if (options.writeUnknown) throw new Error("unbekannt"); auth = copy; writes++; return r; });
      queue = next.catch(() => {}); return next;
    },
    leseLlmTageszaehler: async () => ({ ok: true, used, limit: 2416 })
  };
  const fetchFn = async (url, config) => {
    A.equal(config.method, "GET"); A.equal(config.redirect, "error");
    A(config.signal instanceof AbortSignal); A.equal(config.signal.aborted, false);
    if (url.startsWith(environment().SUPABASE_URL + "/rest/v1/")) {
      const path = url.slice(environment().SUPABASE_URL.length); trace.push(path);
      A(betriebsPfade.includes(path), "Nur die vier festen Betriebsabfragen sind erlaubt");
      A.deepEqual(config.headers, { apikey: "synthetisch", Authorization: "Bearer synthetisch",
        Accept: "application/json" });
      A.equal(config.body, undefined);
      return { status: 200, json: async () => options.activeAt === betriebsPfade.indexOf(path) ? [{}] : [] };
    }
    A.equal(url, require("./github-laufzeitpruefung").STATUS_URL);
    return { status: 200, json: async () => ({ ok: true, reinLesend: true, schemaVersion: 1,
      production: true, commit: G.MAIN, storageSupabase: true, kommunikationGesperrt: true,
      kohortenQuellenGesperrt: true, tagesdeckel: options.badRuntime ? 9999 : 2416,
      understandingReserve: 702, vorrangreserveReal: 200, testKosten: { version: 2, aktiv: true, limitUsd: 4 } }) };
  };
  const request = async (prompt, schema, meta, model, settings) => {
    A.equal(auth[G.KEY]?.status, "begonnen"); calls++; used++;
    A.equal(prompt, input.prompt); A.equal(model, "gpt-5-mini");
    A.deepEqual(Object.keys(meta).sort(), ["callType", "pipelineStep", "politicianId", "runId"]);
    A.equal(meta.callType, "understanding"); A.equal(meta.politicianId, null);
    A.deepEqual(settings, { strict: false, reasoningEffort: "minimal" });
    A.equal(C.createHash("sha256").update(JSON.stringify(schema)).digest("hex"), G.SCHEMA_HASH);
    if (options.modelError) { const e = new Error("NICHT OEFFENTLICH"); e.code = "ETIMEDOUT"; throw e; }
    auth.llmUsage.push({ runId: meta.runId, model, success: true, promptTokens: 100, completionTokens: 200 });
    auth.testKostenTage = { "2026-09-18": { calls: { test: { status: "abgerechnet", reserved: 212000, cost: 850 } } } };
    if (options.ambiguousCost) auth.testKostenTage["2026-09-18"].calls.other = { status: "reserviert" };
    return { display_title: "SYNTHETISCHE PRIVATE ANTWORT" };
  };
  const run = extra => G.ausfuehren({ env: environment(), now, storage, request, fetchFn,
    leseEingabe: () => input, emit: x => emits.push(x), ...extra });
  const decrypt = index => T.entschluesseln(emits[index].envelope, privateKey,
    { runId: environment().GITHUB_RUN_ID, commit: input.commit, tag: "2026-09-18", abPosition: 1, anzahl: 1 });
  return { run, storage, fetchFn, decrypt, emits, trace, state: () => ({ auth, calls, writes }) };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("OK " + name); }
(async () => {
  await test("Fremder Prompt, fehlerhafte Kompression und unbegrenzte Eingabe abgelehnt", async () => {
    const encoded = G.PREFIX + Z.gzipSync(JSON.stringify(input)).toString("base64");
    A.throws(() => G.eingabe(encoded), { code: "GIPFEL_BINDUNG" });
    for (const value of [null, "", G.PREFIX + "!", G.PREFIX + "a".repeat(30000)]) A.throws(() => G.eingabe(value));
  });
  await test("Ausfuehrung, Datum, Provider und alle Schutzwerte vor Schreiben gebunden", async () => {
    G.konfiguration(input, environment(), now());
    for (const [k, v] of Object.entries(environment())) {
      if (["SUPABASE_SERVICE_ROLE_KEY", "AZURE_OPENAI_KEY", "HELMUT_CRON_SECRET"].includes(k)) {
        A.throws(() => G.konfiguration(input, { ...environment(), [k]: "" }, now()));
      } else A.throws(() => G.konfiguration(input, { ...environment(), [k]: "fremd" }, now()), k);
    }
    for (const k of ["OPENAI_API_KEY", "HELMUT_ARTIKELKONTEXT", "NODE_TLS_REJECT_UNAUTHORIZED",
      "NODE_EXTRA_CA_CERTS", "NODE_OPTIONS", "HELMUT_LLM_USAGE_RELATIONAL"])
      A.throws(() => G.konfiguration(input, { ...environment(), [k]: "on" }, now()));
    for (const d of ["2026-09-17T12:00:00Z", "2026-09-18T23:00:00Z", "2026-09-19T00:00:00Z"])
      A.throws(() => G.konfiguration(input, environment(), new Date(d)));
  });
  await test("Aktive Profile, Sperren, Leases, Prozesse oder fremde Laufzeit verhindern Start", async () => {
    for (const opts of [...betriebsPfade.map((_, activeAt) => ({ activeAt })), { badRuntime: true }]) {
      const h = harness(opts); await A.rejects(h.run()); A.equal(h.state().calls, 0); A.equal(h.state().writes, 0);
      A.equal(h.state().auth[G.KEY], undefined);
    }
  });
  await test("Unlesbare Betriebsdaten stoppen ohne Buchung, Modell oder fremden Fehlertext", async () => {
    for (const path of betriebsPfade) for (const failure of [403, 500, 206, "transport", "json", "objekt"]) {
      const h = harness(); let hits = 0;
      const fetchFn = async (url, config) => {
        if (url !== environment().SUPABASE_URL + path) return h.fetchFn(url, config);
        hits++;
        if (failure === "transport") throw new Error("PRIVATER FEHLERTEXT");
        return { status: typeof failure === "number" ? failure : 200, json: async () => {
          if (failure === "json") throw new Error("PRIVATER ANTWORTINHALT");
          return { daten: [] };
        } };
      };
      await A.rejects(h.run({ fetchFn }), { code: "GIPFEL_BETRIEBSLESUNG", message: "GIPFEL_BETRIEBSLESUNG" });
      A.equal(hits, 1); A.equal(h.state().calls, 0); A.equal(h.state().writes, 0);
      A.equal(h.state().auth[G.KEY], undefined); A.equal(h.emits.length, 0);
    }
  });
  await test("Vorflug mit echtem Speichermodul liest Betriebsdaten und Tageszaehler ohne Attrappenexport", async () => {
    const S = require("../lib/helmut/storage"), envOld = { ...process.env }, fetchOld = global.fetch;
    const h = harness(); let counterReads = 0;
    // Ausschliesslich die HTTP Grenze ersetzen, keine Speicherfunktion erfinden.
    try {
      Object.assign(process.env, environment());
      const fetchFn = async (url, config) => {
        if (url === environment().SUPABASE_URL
          + "/rest/v1/llm_budget_counters?day=eq.2026-09-18&scope=eq.global&select=used&limit=2") {
          counterReads++; A.equal(config.method || "GET", "GET"); A.equal(config.body, undefined);
          A.equal(config.headers.apikey, "synthetisch");
          return new Response(JSON.stringify([{ used: 18 }]), { status: 200 });
        }
        return h.fetchFn(url, config);
      };
      global.fetch = fetchFn;
      const r = await G.vorflug(environment(), S, fetchFn, now());
      A.equal(r.commit, G.MAIN); A.equal(r.counter.used, 18); A.equal(r.counter.limit, 2416);
      A.deepEqual(h.trace, betriebsPfade); A.equal(counterReads, 1);
      A.equal(h.state().calls, 0); A.equal(h.state().writes, 0);
    } finally {
      global.fetch = fetchOld;
      for (const key of Object.keys(process.env)) if (!(key in envOld)) delete process.env[key];
      Object.assign(process.env, envOld);
    }
  });
  await test("Unbestaetigtes Schreiben und falscher Readback verhindern Modell", async () => {
    const h = harness({ writeUnknown: true }); await A.rejects(h.run()); A.equal(h.state().calls, 0);
    const s = harness(); s.storage.readAuthStore = async () => ({});
    await A.rejects(s.run(), { code: "GIPFEL_START_UNBESTAETIGT" }); A.equal(s.state().calls, 0);
  });
  await test("Parallel gestartete und erneut gestartete Auftraege erzeugen genau einen Aufruf", async () => {
    const h = harness(); const r = await Promise.allSettled([h.run(), h.run()]);
    A.equal(r.filter(x => x.status === "fulfilled").length, 1); A.equal(h.state().calls, 1);
    await A.rejects(h.run(), { code: "GIPFEL_BEREITS_BEGONNEN" }); A.equal(h.state().calls, 1);
    A.deepEqual(h.state().auth.users, [{ id: "geschuetzt" }]);
    A.deepEqual(h.state().auth.assignments, [{ id: "geschuetzt" }]);
  });
  await test("Vollstaendige Antwort verschluesselt; Kostenbeleg ist keine Fachfreigabe", async () => {
    const h = harness(); const r = await h.run(); A.equal(r.ok, true); A.equal(r.fachlichBestanden, false);
    A.equal(h.decrypt(0).answer.display_title, "SYNTHETISCHE PRIVATE ANTWORT");
    A.equal(h.decrypt(1).kostenBestaetigt, true);
    A(!JSON.stringify(h.emits).includes("SYNTHETISCHE PRIVATE ANTWORT"));
    A(!JSON.stringify(h.state().auth[G.KEY]).includes("SYNTHETISCHE PRIVATE ANTWORT"));
    A(h.trace.every(p => !/knowledge_objects|briefing/.test(p)));
  });
  await test("Modellfehler bleibt ohne Wiederholung und ohne fremden Fehlertext", async () => {
    const h = harness({ modelError: true }); const r = await h.run(); A.equal(r.ok, false);
    A.equal(h.state().calls, 1); A.equal(h.decrypt(0).errorCode, "ETIMEDOUT");
    A(!JSON.stringify(h.emits).includes("NICHT OEFFENTLICH"));
    await A.rejects(h.run()); A.equal(h.state().calls, 1);
  });
  await test("Mehrdeutige Kostenbuchung bleibt offen und die Antwort bleibt erhalten", async () => {
    const h = harness({ ambiguousCost: true }); A.equal((await h.run()).ok, false);
    A(h.decrypt(0).answer); A.equal(h.state().auth[G.KEY].status, "ausgang-offen");
  });
  await test("Echter KI Pfad: Geld, Aufruf und Anbieter vor Transport; Abrechnung vor Ergebnis", async () => {
    const S = require("../lib/helmut/storage"), https = require("node:https"), { EventEmitter } = require("node:events");
    const h = harness(), trace = [], envOld = { ...process.env }, DateOld = Date, httpsOld = https.request;
    const names = ["readAuthStore", "mutateAuthStore", "leseLlmTageszaehler",
      "reserveLlmCall", "recordLlmUsage", "anbieterReserviere", "anbieterMelde"];
    for (const name of names) A.equal(typeof S[name], "function", `Speicherexport fehlt: ${name}`);
    const old = Object.fromEntries(names.map(k => [k, S[k]])); let used = 0;
    try {
      global.Date = class extends DateOld {
        constructor(...args) { super(...(args.length ? args : ["2026-09-18T12:00:00Z"])); }
        static now() { return DateOld.parse("2026-09-18T12:00:00Z"); }
      };
      Object.assign(process.env, environment());
      Object.assign(S, h.storage);
      S.leseLlmTageszaehler = async () => ({ ok: true, used, limit: 2416 });
      S.reserveLlmCall = async () => {
        A.equal(Object.values(h.state().auth.testKostenTage["2026-09-18"].calls)[0].reserved, 212000);
        trace.push("geld-und-aufruf"); used++; return { allowed: true, atomic: true };
      };
      S.anbieterReserviere = async a => {
        A.equal(a.schluessel, "azure|gpt-5-mini|ki"); A.equal(a.grenzeMinute, 20);
        A.equal(used, 1); trace.push("anbieter"); return { verfuegbar: true, erlaubt: true };
      };
      S.anbieterMelde = async a => { A.equal(a.ok, true); return { verfuegbar: true }; };
      S.recordLlmUsage = async info => {
        const r = S.buildLlmUsageRecord(info); await h.storage.mutateAuthStore(s => s.llmUsage.push(r));
        trace.push("nutzung"); return { ...r, _ablage: { blob: true } };
      };
      https.request = (_url, _options, callback) => {
        A.deepEqual(trace, ["geld-und-aufruf", "anbieter"]); trace.push("transport");
        const req = new EventEmitter(); req.destroy = () => {};
        req.write = body => { const p = JSON.parse(body); A.equal(p.input, input.prompt);
          A.equal(p.max_output_tokens, 3000); A.equal(p.model, "gpt-5-mini"); };
        req.end = () => setImmediate(() => {
          const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {}; callback(res);
          res.emit("data", JSON.stringify({ status: "completed", usage: { input_tokens: 100, output_tokens: 200 },
            output: [{ content: [{ type: "output_text", text: '{"attrappe":true}' }] }] })); res.emit("end");
        }); return req;
      };
      A.equal((await h.run({ storage: S, request: require("../lib/helmut/ai").requestStructuredJson })).ok, true);
      A.equal(h.state().auth.testKostenTage["2026-09-18"].spent, 850);
      A.deepEqual(trace, ["geld-und-aufruf", "anbieter", "transport", "nutzung"]);
    } finally {
      global.Date = DateOld; https.request = httpsOld; Object.assign(S, old);
      for (const key of Object.keys(process.env)) if (!(key in envOld)) delete process.env[key];
      Object.assign(process.env, envOld);
    }
  });
  console.log(`${passed}/${passed} Gipfelversuch Schutzgruppen bestanden.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
