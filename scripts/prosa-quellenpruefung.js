"use strict";

// Isolierter Quellenpruefernachweis: zwei gebundene Bloecke, keine neue Generierung.
// Keine Appinhalte oder Profile schreiben; alte Versuchsquittungen bleiben erhalten.
// Jeder Actionslauf verbraucht genau eine bisher unbenutzte Position. Der naechste
// braucht die direkte Fachbewertung der vorigen Antwort, kein automatischer Loop.
const C = require("node:crypto"), F = require("node:fs"), P = require("node:path"), Z = require("node:zlib");
const H = require("node:https"), { isDeepStrictEqual: equal } = require("node:util");
const T = require("./privater-nachweis-transport");
// Feste Production Bindung nach geprueftem Reparaturmerge PR451.
const MAIN = "2d239abca16e54371e102ff69384f6c981f86ff1";
const K = require("../lib/helmut/testkosten-budget");
const Q = require("../lib/helmut/prosa-quellenpruefung");
const SCHEMA = Q.SCHEMA;
const KEY = "prosaQuellenpruefung20260919", PREFIX = "PROSA_QUELLEN:";
const BRANCH = "codex/prosa-quellenpruefung-20260919";
const MANIFEST = "1dfc80ff04c325d32077cc1b8ad180ca4d5ae6c95ec90539d492ea15f30c0de7";
const SCHEMA_HASH = "5b38fdf20cd4990f58f61841bd15b7281070cf7ca335a73651e223d7f9470448";
const PROMPTS = ["a7e1397715fc87b2ae16731b5035499747da560a06468130df957886d600d579", "694b0271ae09ace1801fd90610055e7b6be9a2c3d646d963c40352275ad177fd"];
// Der ganze Actionsjob ist auf drei Minuten begrenzt. Eine neue Position
// braucht mindestens dieses komplette Restfenster, einschliesslich Abschluss.
const MAX_MS = 20 * 60000, RESERVE_MS = 180000, MAX_COST = 424000;
const USAGE_MAX = require("../lib/helmut/storage").LLM_USAGE_RING_MAX;
const sha = x => C.createHash("sha256").update(x).digest("hex");
function fordere(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e; } }
function paket() {
  const raw = F.readFileSync(P.join(__dirname, "../docs/betrieb/prosa-quellenpruefung-2026-09-19.json"));
  fordere(sha(raw) === MANIFEST && sha(JSON.stringify(SCHEMA)) === SCHEMA_HASH, "PROSA_PAKET");
  const blocks = JSON.parse(raw);
  fordere(blocks.length === 2, "PROSA_PAKET");
  return blocks.map((b, i) => {
    const input = Q.eingabe(b.cases), prompt = Q.prompt(input);
    fordere(sha(prompt) === PROMPTS[i], "PROSA_PROMPT");
    return { id: `block-${i + 1}`, input, expect: b.expect, prompt, promptHash: PROMPTS[i] };
  });
}
function methodenpruefung(f, answer) {
  const r = Q.pruefe(f.input, answer);
  if (!r.ok) return false;
  const map = new Map(r.faelle.map(c => [c.fall, c]));
  return f.expect.accept.every(id => map.get(id)?.bereit === true)
    && f.expect.reject.every(id => map.get(id)?.bereit === false)
    && Object.entries(f.expect.rejected_paths).every(([id, paths]) => paths.every(path =>
      map.get(id)?.aussagen.some(a => a.pfad === path && a.deckung === "unbelegt")));
}
function eingabe(text) {
  fordere(typeof text === "string" && text.startsWith(PREFIX) && text.length < 6000, "PROSA_EINGABE");
  const encoded = text.slice(PREFIX.length), bytes = Buffer.from(encoded, "base64");
  fordere(bytes.toString("base64") === encoded, "PROSA_EINGABE");
  const a = JSON.parse(Z.gunzipSync(bytes, { maxOutputLength: 6000 }));
  fordere(a && Object.keys(a).sort().join(",") === "commit,position,previous,publicKey"
    && /^[a-f0-9]{40}$/.test(a.commit) && Number.isInteger(a.position) && a.position >= 1 && a.position <= 2,
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
async function vorflug(env, storage, fetchFn, now) {
  const response = await fetchFn(require("./github-laufzeitpruefung").STATUS_URL, {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json" }
  });
  fordere(response.status === 200, "PROSA_LAUFZEIT");
  const r = await response.json();
  fordere(r.ok === true && r.reinLesend === true && r.schemaVersion === 1
    && r.production === true && r.commit === MAIN && r.storageSupabase === true
    && r.kommunikationGesperrt === true && r.kohortenQuellenGesperrt === true
    && r.tagesdeckel === 2416 && r.understandingReserve === 702 && r.vorrangreserveReal === 200
    && r.testKosten?.version === 2 && r.testKosten.aktiv === true && r.testKosten.limitUsd === 4,
  "PROSA_LAUFZEIT");
  const zeit = encodeURIComponent(now.toISOString());
  for (const path of ["mandate_profiles?select=user_id&aktiv=eq.true&limit=1",
    `pipeline_locks?select=job_name&expires_at=gt.${zeit}&limit=1`,
    `helmut_jobs?select=id&lease_expires_at=gt.${zeit}&limit=1`,
    "process_runs?select=run_id&finished_at=is.null&started_at=gt."
      + encodeURIComponent(new Date(now.getTime() - 20 * 60 * 1000).toISOString()) + "&limit=1"]) {
    // storage exportiert keinen allgemeinen Supabase Zugriff. Diese vier festen
    // Betreiberabfragen sind ausschliesslich begrenzte GETs vor jeder Mutation.
    let rows;
    try {
      const response = await fetchFn(env.SUPABASE_URL + "/rest/v1/" + path, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" }
      });
      fordere(response.status === 200, "PROSA_BETRIEBSLESUNG");
      rows = await response.json();
      fordere(Array.isArray(rows), "PROSA_BETRIEBSLESUNG");
    } catch (_) {
      // Keine Zugangsdaten, Antwortinhalte oder fremden Fehlertexte ins Log.
      fordere(false, "PROSA_BETRIEBSLESUNG");
    }
    fordere(rows.length === 0, "PROSA_AKTIVER_BETRIEB");
  }
  const counter = await storage.leseLlmTageszaehler(now.toISOString());
  fordere(counter.ok === true && Number.isSafeInteger(counter.used) && counter.used >= 0
    && counter.limit === 2416, "PROSA_ZAEHLER");
  return { commit: r.commit, counter };
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
        // genau die hoechstens zwei verdraengbaren Altbelege dauerhaft sichern.
        archivierteAufruftelemetrie: structuredClone(auth.llmUsage.slice(Math.max(0, USAGE_MAX - 2))),
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
    fordere(r.faelle.length < 2 && r.faelle.reduce((s, f) => s + f.kosten, 0) + 212000 <= MAX_COST,
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
    || claim.archivierteAufruftelemetrie.length > 2) return false;
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
    reasoning: { effort: "minimal" }, text: { format: { type: "json_schema", name: "knowledge_object", schema: SCHEMA, strict: true } } };
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
  const runtime = await vorflug(env, storage, fetchFn, now());
  const before = await storage.readAuthStore(), runId = `prosa-quellen-${env.GITHUB_RUN_ID}`;
  const claim = await beanspruche(storage, a, runId, now(), runtime.counter);
  const context = { runId: env.GITHUB_RUN_ID, commit: a.commit, tag: claim.tag, abPosition: a.position, anzahl: 1 };
  const send = (typ, value) => emit({ typ, envelope: T.verschluesseln(value, a.publicKey, context) });
  let result = null, errorCode = null, transport = null;
  try {
    konfiguration(a, env, now()); zeit(claim, now(), RESERVE_MS);
    result = await observe(() => request(f.prompt, SCHEMA,
      { callType: "understanding", pipelineStep: "prosa-quellenpruefung", politicianId: null, runId },
      "gpt-5-mini", { strict: true, reasoningEffort: "minimal" }),
    { prompt: f.prompt, env, deadline: Date.parse(claim.ende),
      emit: value => { transport = value; send("prosa-transport", { position: a.position, runId, ...value }); } });
    fordere(result.count === 1 && transport?.rawResponse && transport.statusCode === 200, "PROSA_TRANSPORTBELEG");
    fordere(Q.pruefe(f.input, result.answer).ok, "PROSA_SCHEMA");
    fordere(methodenpruefung(f, result.answer), "PROSA_QUELLEN_FACHSTOPP");
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
  try { zeit(claim, now()); await vorflug(env, storage, fetchFn, now()); }
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
module.exports = { methodenpruefung, paket, eingabe, konfiguration, grundlinie, zeit, beanspruche, telemetrieErhalten, mitTransportbeleg, ausfuehren,
  KEY, PREFIX, BRANCH, MAIN, MANIFEST, SCHEMA_HASH, PROMPTS, MAX_MS, RESERVE_MS, MAX_COST, sha };
