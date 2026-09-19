"use strict";

// Zweiter isolierter Neunfallauftrag nach gezielter Folgenvertragsaenderung.
// Der erste Auftrag bleibt mit eigener Quittung fachlich-gestoppt erhalten.
// Identische acht Eingaben und Kriterien plus positiver Folgengegenfall.
// Kein Retry des alten Auftrags.
// Keine Appinhalte oder Profile schreiben.
// Jeder Actionslauf verbraucht genau eine bisher unbenutzte Position. Der naechste
// braucht die direkte Fachbewertung der vorigen Antwort, kein automatischer Loop.
const C = require("node:crypto"), F = require("node:fs"), P = require("node:path"), Z = require("node:zlib");
const H = require("node:https"), { isDeepStrictEqual: equal } = require("node:util");
const T = require("./privater-nachweis-transport"), G = require("./gipfel-modellversuch");
const K = require("../lib/helmut/testkosten-budget");
const U = require("../lib/helmut/understanding");
const { KNOWLEDGE_OBJECT_SCHEMA: SCHEMA, validateKnowledgeObject } = require("../lib/helmut/understanding-schema");
const KEY = "prosaFolgenFachnachweis20260919", PREFIX = "PROSA_EINMAL:";
const BRANCH = "codex/prosa-fachnachweis-20260919";
const MANIFEST = "ffe89d960c46b1bf325043728da03d2780bbe890705ac141cdbf8f7f4fd497b1";
const SCHEMA_HASH = "bec2e28d8cc968739dd89e79d3d2119b000940be43cc350460231fbd8689202c";
const PROMPTS = [
  "15d438b21532f317433b491eaa5cbd80cba2ba0e28b7c1f550f52fdfe4147b75",
  "5b8f07dcc3402dc383aef79052b8dc9a66e9a8d203f337a1ec3e25c1230553c7",
  "bd7d6fd4a8708373f4a9482901ceb779852388f67927c5974e2352e8d240906e",
  "54aef4f7074d639f73cff2c6823a9941f9e0dd085a498c8c13d430b2c897b7ef",
  "7dbdbb7618a9cd23bc96c9794630a94e8265f5b640d5855c4df1e29406b95baa",
  "f7b92c1608f34328d940a881f1935ceb0d1446a50060c613864299484a36db56",
  "5125177cb68fe234a64806d58cd3f94a80503c3d8e8a51c3e07298bcccf322b3",
  "3286f2358245625fed71f6ff28d3246c233a270dd456b6fff1db74d7bf4ffe39",
  "a812080227c33c6cafddd2a647b15c6f37404fe1a30e7028d180514bda18c62e"
];
// Der ganze Actionsjob ist auf drei Minuten begrenzt. Eine neue Position
// braucht mindestens dieses komplette Restfenster, einschliesslich Abschluss.
const MAX_CASES = 9, MAX_MS = 30 * 60000, RESERVE_MS = 180000, MAX_COST = MAX_CASES * 212000;
const USAGE_MAX = require("../lib/helmut/storage").LLM_USAGE_RING_MAX;
const sha = x => C.createHash("sha256").update(x).digest("hex");
function fordere(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e; } }
function paket() {
  const raw = F.readFileSync(P.join(__dirname, "../docs/betrieb/prosa-fachnachweis-2026-09-19.json"));
  fordere(sha(raw) === MANIFEST && sha(JSON.stringify(SCHEMA)) === SCHEMA_HASH, "PROSA_PAKET");
  const m = JSON.parse(raw);
  fordere(m.faelle.length === MAX_CASES, "PROSA_PAKET");
  return m.faelle.map((f, i) => {
    const d = m.dokumentStandard;
    const cluster = { documents: [{ id: `rd-prosa-${f.id}`, title: f.title, summary: f.summary,
      source_name: f.source_name || d.source_name, source_type: d.source_type,
      published_at: d.published_at, url: d.urlBasis + f.id, link_type: "direct" }] };
    const prompt = U.buildUnderstandingPrompt(cluster);
    fordere(sha(prompt) === PROMPTS[i], "PROSA_PROMPT");
    return { id: f.id, erwartet: f.erwartet, cluster, prompt, promptHash: PROMPTS[i] };
  });
}
function eingabe(text) {
  fordere(typeof text === "string" && text.startsWith(PREFIX) && text.length < 6000, "PROSA_EINGABE");
  const encoded = text.slice(PREFIX.length), bytes = Buffer.from(encoded, "base64");
  fordere(bytes.toString("base64") === encoded, "PROSA_EINGABE");
  const a = JSON.parse(Z.gunzipSync(bytes, { maxOutputLength: 6000 }));
  fordere(a && Object.keys(a).sort().join(",") === "commit,position,previous,publicKey"
    && /^[a-f0-9]{40}$/.test(a.commit) && Number.isInteger(a.position) && a.position >= 1 && a.position <= MAX_CASES,
  "PROSA_BINDUNG");
  fordere(a.position === 1 ? a.previous === null : a.previous
    && Object.keys(a.previous).sort().join(",") === "responseHash,reviewHash"
    && [a.previous.responseHash, a.previous.reviewHash].every(x => /^[a-f0-9]{64}$/.test(x)), "PROSA_VORPRUEFUNG");
  T.publicKey(a.publicKey); return a;
}
function konfiguration(a, env, now) {
  fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === `refs/heads/${BRANCH}`
    && env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_RUN_ATTEMPT === "1"
    && env.GITHUB_SHA === a.commit && /^\d{5,20}$/.test(env.GITHUB_RUN_ID || ""), "PROSA_AUSFUEHRUNG");
  fordere(now.toISOString().slice(0, 10) === "2026-09-19" && now.getUTCHours() < 23, "PROSA_TAG");
  const expected = { HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main",
    HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", VERCEL_ENV: "production",
    HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
    HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200",
    HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_AZURE_MINUTE: "20",
    HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini" };
  fordere(Object.entries(expected).every(([k, v]) => env[k] === v)
    && env.SUPABASE_URL === "https://ddckuvvpcytqbyfmbvie.supabase.co"
    && env.SUPABASE_SERVICE_ROLE_KEY && env.AZURE_OPENAI_KEY && env.HELMUT_CRON_SECRET,
  "PROSA_KONFIGURATION");
  fordere(["OPENAI_API_KEY", "HELMUT_ARTIKELKONTEXT", "HELMUT_LLM_USAGE_RELATIONAL", "NODE_OPTIONS",
    "NODE_TLS_REJECT_UNAUTHORIZED", "NODE_EXTRA_CA_CERTS", "HELMUT_KI_TIMEOUT_MS"].every(k => !env[k]),
  "PROSA_FREMDE_KONFIGURATION");
  fordere(require("../lib/helmut/azure-endpunkt").pruefeEndpunkt(env.AZURE_OPENAI_ENDPOINT).gueltig,
    "PROSA_AZURE_ZIEL");
}
function grundlinie(auth) {
  const copy = structuredClone(auth);
  for (const k of [KEY, "llmUsage", "testKostenTage", "_authStoreRevision"]) delete copy[k];
  return copy;
}
function zeit(record, now, reserve = 0) {
  fordere(Number.isFinite(Date.parse(record.begonnenAm)) && Number.isFinite(Date.parse(record.ende))
    && Date.parse(record.ende) - Date.parse(record.begonnenAm) === MAX_MS
    && now.toISOString().slice(0, 10) === record.tag && now.getTime() + reserve <= Date.parse(record.ende),
  "PROSA_ZEITENDE");
}
async function beanspruche(storage, a, runId, now, counter) {
  let expected;
  await storage.mutateAuthStore(auth => {
    for (const [key, max] of Object.entries({ sessions: 2000, auditEvents: 1000, systemErrors: 500,
      dailyInputs: 2000, llmUsage: USAGE_MAX, processRuns: 300 }))
      fordere(Array.isArray(auth[key]) && auth[key].length <= max, "PROSA_SPEICHERSTAND");
    let r = auth[KEY];
    const day = now.toISOString().slice(0, 10);
    let bound;
    if (auth.testKostenTage?.[day]) {
      const t = K.pruefeTag(auth.testKostenTage[day], day); K.kontrolliere(auth, day, 0, counter.used);
      fordere(!Object.values(t.calls).some(c => ["reserviert", "ungeklaert"].includes(c.status)), "PROSA_KOSTEN_OFFEN");
      bound = K.belegt(t);
    } else bound = null;
    // Keine ungepruefte neue Tagesgrundlinie. Null Aufrufe und null Nutzungsbelege
    // sind der einzige hier erlaubte Fall ohne vorhandenes Kostenbuch.
    if (bound === null) {
      fordere(counter.used === 0 && !auth.llmUsage.some(x => x.createdAt?.startsWith(day)), "PROSA_KOSTEN_GRUNDLAGE");
      bound = 0;
    }
    if (a.position === 1) {
      fordere(!Object.hasOwn(auth, KEY) && bound + MAX_COST <= 4000000, "PROSA_START_GESPERRT");
      r = { version: 1, manifestHash: MANIFEST, schemaHash: SCHEMA_HASH, commit: a.commit,
        empfaenger: T.publicKey(a.publicKey).fingerprint, begonnenAm: now.toISOString(),
        ende: new Date(now.getTime() + MAX_MS).toISOString(), tag: day, faelle: [],
        // Der bestehende Ring bleibt begrenzt. Vor dem ersten Modellstart
        // genau die hoechstens neun verdraengbaren Altbelege dauerhaft sichern.
        archivierteAufruftelemetrie: structuredClone(auth.llmUsage.slice(Math.max(0, USAGE_MAX - MAX_CASES))),
        aufruftelemetrieGrundlageHash: sha(JSON.stringify(auth.llmUsage)) };
    } else {
      fordere(r?.version === 1 && r.manifestHash === MANIFEST && r.schemaHash === SCHEMA_HASH
        && r.commit === a.commit && r.empfaenger === T.publicKey(a.publicKey).fingerprint
        && r.faelle?.length === a.position - 1 && r.status === "wartet-auf-fachpruefung", "PROSA_FORTSETZUNG");
      const p = r.faelle.at(-1);
      fordere(p.status === "antwort-und-kosten-bestaetigt" && p.antwortHash === a.previous.responseHash,
        "PROSA_VORPRUEFUNG");
      p.fachpruefung = { bestanden: true, reviewHash: a.previous.reviewHash, bestaetigtAm: now.toISOString() };
      fordere(r.faelle.every(f => f.fachpruefung?.bestanden && f.kosten <= 212000), "PROSA_VORPRUEFUNG");
    }
    zeit(r, now, RESERVE_MS);
    fordere(r.faelle.length < MAX_CASES && r.faelle.reduce((s, f) => s + f.kosten, 0) + 212000 <= MAX_COST,
      "PROSA_AUFTRAGSLIMIT");
    r.faelle.push({ position: a.position, id: paket()[a.position - 1].id, runId,
      status: "begonnen", promptHash: PROMPTS[a.position - 1], begonnenAm: now.toISOString() });
    r.status = "fall-begonnen"; auth[KEY] = r; expected = structuredClone(r);
  });
  fordere(equal((await storage.readAuthStore())[KEY], expected), "PROSA_START_UNBESTAETIGT");
  return expected;
}
function telemetrieErhalten(before, after, usage, claim) {
  if (usage.length !== 1 || !Array.isArray(claim.archivierteAufruftelemetrie)
    || claim.archivierteAufruftelemetrie.length > MAX_CASES) return false;
  return equal(after.llmUsage, [...usage, ...before.llmUsage].slice(0, USAGE_MAX))
    && before.llmUsage.slice(USAGE_MAX - 1).every(old =>
      claim.archivierteAufruftelemetrie.some(archiv => equal(old, archiv)));
}
// Beobachtet den echten HTTPS Transport, ohne Budget, Payload oder Modellpfad zu ersetzen.
// Die feste Nutzlast wird vor dem ersten Byte geprueft. Jeder zweite Request sperrt.
async function mitTransportbeleg(call, { prompt, env, deadline, emit, now = () => Date.now() }, https = H) {
  const original = https.request; let count = 0, transport = null;
  const expectedUrl = require("../lib/helmut/azure-endpunkt").baueResponsesUrl(env.AZURE_OPENAI_ENDPOINT);
  const expected = { model: "gpt-5-mini", input: prompt, max_output_tokens: 3000,
    reasoning: { effort: "minimal" }, text: { format: { type: "json_schema", name: "knowledge_object", schema: SCHEMA, strict: false } } };
  https.request = function(url, options, cb) {
    fordere(++count === 1 && String(url) === String(expectedUrl) && options.method === "POST"
      && now() + 30000 <= deadline, "PROSA_TRANSPORT");
    let req, timer;
    req = original.call(https, url, options, response => {
      const chunks = []; let size = 0;
      transport.statusCode = response.statusCode;
      response.on("data", chunk => {
        size += Buffer.byteLength(chunk); if (size <= 8 * 1024 * 1024) chunks.push(Buffer.from(chunk));
        else req.destroy(new Error("PROSA_ANTWORTGROESSE"));
      });
      response.on("end", () => {
        clearTimeout(timer); transport.rawResponse = Buffer.concat(chunks).toString("utf8");
        transport.responseHash = sha(transport.rawResponse); emit({ ...transport, phase: "response" });
      });
      cb(response);
    });
    const write = req.write.bind(req), end = req.end.bind(req); let written = false;
    transport = { request: expected, statusCode: null, rawResponse: null };
    req.write = function(body, ...args) {
      fordere(!written && typeof body === "string" && equal(JSON.parse(body), expected), "PROSA_NUTZLAST");
      written = true; transport.requestRaw = body;
      // Den tatsaechlichen Auftrag auch bei spaeterem Transportabbruch erhalten.
      emit({ ...transport, phase: "request" });
      return write(body, ...args);
    };
    req.end = function(...args) { fordere(written && !args.some(x => typeof x === "string" || Buffer.isBuffer(x)), "PROSA_NUTZLAST"); return end(...args); };
    timer = setTimeout(() => req.destroy(new Error("PROSA_TRANSPORTZEIT")), Math.min(20000, deadline - now()));
    req.on("close", () => clearTimeout(timer)); return req;
  };
  try { return { answer: await call(), transport, count }; }
  finally { https.request = original; }
}
async function ausfuehren({ env = process.env, now = () => new Date(), fetchFn = global.fetch,
  storage = require("../lib/helmut/storage"), request = require("../lib/helmut/ai").requestStructuredJson,
  observe = mitTransportbeleg, emit = r => console.log(JSON.stringify(r)) } = {}) {
  const a = eingabe(env.CONFIRM_TEXT), f = paket()[a.position - 1];
  konfiguration(a, env, now());
  const runtime = await G.vorflug(env, storage, fetchFn, now());
  const before = await storage.readAuthStore(), runId = `prosa-einmal-${env.GITHUB_RUN_ID}`;
  const claim = await beanspruche(storage, a, runId, now(), runtime.counter);
  const context = { runId: env.GITHUB_RUN_ID, commit: a.commit, tag: claim.tag, abPosition: a.position, anzahl: 1 };
  const send = (typ, value) => emit({ typ, envelope: T.verschluesseln(value, a.publicKey, context) });
  let result = null, errorCode = null, transport = null;
  try {
    konfiguration(a, env, now()); zeit(claim, now(), RESERVE_MS);
    result = await observe(() => request(f.prompt, SCHEMA,
      { callType: "understanding", pipelineStep: "prosa-fachnachweis", politicianId: null, runId },
      "gpt-5-mini", { strict: false, reasoningEffort: "minimal" }),
    { prompt: f.prompt, env, deadline: Date.parse(claim.ende),
      emit: value => { transport = value; send("prosa-transport", { position: a.position, runId, ...value }); } });
    fordere(result.count === 1 && transport?.rawResponse && transport.statusCode === 200, "PROSA_TRANSPORTBELEG");
    fordere(validateKnowledgeObject(result.answer).valid, "PROSA_SCHEMA");
  } catch (e) { errorCode = /^[A-Z_]{3,60}$/.test(e?.code || "") ? e.code : "PROSA_AUSGANG_OFFEN"; }
  send("prosa-antwort", { runId, position: a.position, fall: f, schemaHash: SCHEMA_HASH,
    answer: result?.answer ?? null, errorCode, runtime, fachlichBestanden: false });
  const after = await storage.readAuthStore(), usage = after.llmUsage.filter(u => u.runId === runId);
  const oldCalls = before.testKostenTage?.[claim.tag]?.calls || {};
  const newCalls = Object.entries(after.testKostenTage?.[claim.tag]?.calls || {}).filter(([id]) => !oldCalls[id]);
  const counter = await storage.leseLlmTageszaehler(now().toISOString());
  const kostenBestaetigt = usage.length === 1 && usage[0].model === "gpt-5-mini" && newCalls.length === 1
    && newCalls[0][1].status === "abgerechnet" && newCalls[0][1].reserved === 212000
    && newCalls[0][1].cost === K.tokenKosten(usage[0].promptTokens, usage[0].completionTokens)
    && counter.ok === true && counter.used === runtime.counter.used + 1;
  const telemetrieGesichert = telemetrieErhalten(before, after, usage, claim);
  const geschuetzt = telemetrieGesichert && equal(grundlinie(before), grundlinie(after))
    && Object.entries(oldCalls).every(([id, c]) => equal(c, after.testKostenTage[claim.tag].calls[id]));
  if (!kostenBestaetigt || !geschuetzt || !usage[0]?.success) errorCode ||= "PROSA_NACHKONTROLLE";
  try { zeit(claim, now()); await G.vorflug(env, storage, fetchFn, now()); }
  catch { errorCode ||= "PROSA_NACHKONTROLLE"; }
  const beleg = { runId, position: a.position, kostenBestaetigt, geschuetzt, telemetrieGesichert,
    archivierteAufruftelemetrie: claim.archivierteAufruftelemetrie,
    aufruftelemetrieGrundlageHash: claim.aufruftelemetrieGrundlageHash, usage, newCalls, counter, errorCode,
    fachlichBestanden: false, inProductionImportiert: false };
  send("prosa-kosten", beleg);
  let savedExpected;
  await storage.mutateAuthStore(auth => {
    const r = auth[KEY];
    fordere(equal(r, claim), "PROSA_ABSCHLUSSKONFLIKT");
    Object.assign(r.faelle.at(-1), { status: errorCode ? "gestoppt" : "antwort-und-kosten-bestaetigt",
      beendetAm: now().toISOString(), antwortHash: result?.answer ? sha(JSON.stringify(result.answer)) : null,
      transportHash: transport?.responseHash || null, kosten: kostenBestaetigt ? newCalls[0][1].cost : null,
      kostenBestaetigt, errorCode });
    r.status = errorCode ? "gestoppt" : "wartet-auf-fachpruefung"; savedExpected = structuredClone(r);
  });
  fordere(equal((await storage.readAuthStore())[KEY], savedExpected), "PROSA_ABSCHLUSS_UNBESTAETIGT");
  return { ok: !errorCode, runId, position: a.position, kostenBestaetigt, fachlichBestanden: false };
}
if (require.main === module) ausfuehren().then(r => {
  console.log(JSON.stringify(r)); if (!r.ok) process.exitCode = 1;
}).catch(e => {
  console.error(JSON.stringify({ ok: false, grund: /^PROSA_[A-Z_]+$/.test(e?.code || "") ? e.code : "PROSA_UNBESTAETIGT",
    automatischeWiederholung: false })); process.exitCode = 1;
});
module.exports = { paket, eingabe, konfiguration, grundlinie, zeit, beanspruche, telemetrieErhalten, mitTransportbeleg, ausfuehren,
  KEY, PREFIX, BRANCH, MANIFEST, SCHEMA_HASH, PROMPTS, MAX_CASES, MAX_MS, RESERVE_MS, MAX_COST, sha };
