"use strict";

// Vorbereitung, keine Startfreigabe. Genau ein Lage Entwurf und sein Review.
// Nur manuell auf diesem Branch; alle Rohantworten bleiben privat erhalten.
const C = require("node:crypto"), Z = require("node:zlib"), H = require("node:https");
const { isDeepStrictEqual: equal } = require("node:util");
const P = require("../lib/helmut/prosa-einordnung");
const AI = require("../lib/helmut/prosa-einordnung-ai");
const F = require("./fixtures/prosa-einordnung");
const K = require("../lib/helmut/testkosten-budget");
const T = require("./privater-nachweis-transport");
const { hash } = require("../lib/helmut/briefing-speicher");
const KEY = "prosaProfilvertrag20260921", PREFIX = "PROFILVERTRAG_EINMAL:";
const BRANCH = "codex/prosa-profilvertrag-20260921", TAG = "2026-09-21";
const MAX_COST = 424000, MAX_MS = 300000, RING = 5000;
const sha = x => C.createHash("sha256").update(x).digest("hex");
function fordere(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e; } }
function paket() {
  const b = F.basis(3); // Zeitklasse: Umsetzung ist kein Beschlusstermin.
  const p = { ...b, bereich: "lage" };
  const vertrag = P.binde(p);
  return { ...p, basisHash: vertrag.basisHash,
    paketHash: hash({ ...p, entwurfSchema: AI.entwurfSchema(vertrag), pruefSchema: AI.PRUEF_SCHEMA,
      entwurfPrompt: P.entwurfsPrompt(vertrag), pruefPromptVorlage: P.pruefPrompt.toString() }) };
}
function eingabe(text) {
  fordere(typeof text === "string" && text.startsWith(PREFIX) && text.length < 6000, "EINORDNUNG_EINGABE");
  const encoded = text.slice(PREFIX.length), bytes = Buffer.from(encoded, "base64");
  fordere(bytes.toString("base64") === encoded, "EINORDNUNG_EINGABE");
  const a = JSON.parse(Z.gunzipSync(bytes, { maxOutputLength: 6000 }));
  fordere(a && Object.keys(a).sort().join(",") === "commit,paketHash,productionCommit,publicKey"
    && [a.commit, a.productionCommit].every(s => /^[a-f0-9]{40}$/.test(s))
    && a.paketHash === paket().paketHash, "EINORDNUNG_BINDUNG");
  T.publicKey(a.publicKey); return a;
}
function konfiguration(a, env, now) {
  fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === `refs/heads/${BRANCH}`
    && env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_RUN_ATTEMPT === "1"
    && env.GITHUB_SHA === a.commit && /^\d{5,20}$/.test(env.GITHUB_RUN_ID || ""), "EINORDNUNG_AUSFUEHRUNG");
  fordere(now.toISOString().slice(0, 10) === TAG
    && now.getTime() + MAX_MS < Date.parse(TAG + "T23:59:59Z"), "EINORDNUNG_TAG");
  const expected = { HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main",
    HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", VERCEL_ENV: "production",
    HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
    HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200",
    HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_AZURE_MINUTE: "20",
    HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini" };
  fordere(Object.entries(expected).every(([k, v]) => env[k] === v)
    && env.SUPABASE_URL === "https://ddckuvvpcytqbyfmbvie.supabase.co"
    && env.SUPABASE_SERVICE_ROLE_KEY && env.AZURE_OPENAI_KEY && env.HELMUT_CRON_SECRET,
  "EINORDNUNG_KONFIGURATION");
  fordere(["OPENAI_API_KEY", "HELMUT_ARTIKELKONTEXT", "HELMUT_LLM_USAGE_RELATIONAL", "HELMUT_TENANT_LLM_CAP",
    "NODE_OPTIONS", "NODE_TLS_REJECT_UNAUTHORIZED", "NODE_EXTRA_CA_CERTS", "HELMUT_KI_TIMEOUT_MS"]
    .every(k => !env[k]), "EINORDNUNG_FREMDE_KONFIGURATION");
  fordere(require("../lib/helmut/azure-endpunkt").pruefeEndpunkt(env.AZURE_OPENAI_ENDPOINT).gueltig,
    "EINORDNUNG_AZURE_ZIEL");
}
async function vorflug(a, env, storage, fetchFn, now) {
  const get = async (url, headers) => {
    const r = await fetchFn(url, { method: "GET", redirect: "error", headers, signal: AbortSignal.timeout(15000) });
    fordere(r.status === 200, "EINORDNUNG_BETRIEBSLESUNG"); return r.json();
  };
  const r = await get(require("./github-laufzeitpruefung").STATUS_URL,
    { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json" });
  fordere(r.ok === true && r.reinLesend === true && r.schemaVersion === 1 && r.production === true
    && r.commit === a.productionCommit && r.storageSupabase === true && r.kommunikationGesperrt === true
    && r.kohortenQuellenGesperrt === true && r.tagesdeckel === 2416 && r.understandingReserve === 702
    && r.vorrangreserveReal === 200 && r.testKosten?.version === 2 && r.testKosten.aktiv === true
    && r.testKosten.limitUsd === 4, "EINORDNUNG_LAUFZEIT");
  const zeit = encodeURIComponent(now.toISOString());
  const paths = ["mandate_profiles?select=user_id,aktiv&limit=505",
    `pipeline_locks?select=job_name&expires_at=gt.${zeit}&limit=1`,
    `helmut_jobs?select=id&lease_expires_at=gt.${zeit}&limit=1`,
    "helmut_jobs?select=id&status=neq.erledigt&limit=1",
    `helmut_verstehen_reservierungen?select=lease_bis&lease_bis=gt.${zeit}&limit=1`,
    "process_runs?select=run_id&finished_at=is.null&started_at=gt."
      + encodeURIComponent(new Date(now.getTime() - 30 * 60000).toISOString()) + "&limit=1"];
  for (const [i, path] of paths.entries()) {
    const rows = await get(env.SUPABASE_URL + "/rest/v1/" + path, { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" });
    fordere(Array.isArray(rows) && (i === 0 ? rows.length === 504 && rows.every(x => x.aktiv === false)
      : rows.length === 0), "EINORDNUNG_AKTIVER_BETRIEB");
  }
  const counter = await storage.leseLlmTageszaehler(now.toISOString());
  fordere(counter.ok === true && Number.isSafeInteger(counter.used) && counter.used >= 0
    && counter.limit === 2416, "EINORDNUNG_ZAEHLER");
  return counter;
}
function grundlinie(auth) {
  const x = structuredClone(auth);
  for (const k of [KEY, "llmUsage", "testKostenTage", "_authStoreRevision"]) delete x[k];
  return x;
}
function kostenbeleg(before, after, meta, counterBefore, counterAfter) {
  const day = TAG, alt = K.pruefeTag(before.testKostenTage?.[day], day);
  const neu = K.pruefeTag(after.testKostenTage?.[day], day);
  const calls = Object.entries(neu.calls).filter(([id]) => !Object.hasOwn(alt.calls, id));
  const usage = after.llmUsage.filter(u => u.runId === meta.runId).filter(u =>
    !before.llmUsage.some(x => x.id === u.id));
  fordere(calls.length === 1 && usage.length === 1, "EINORDNUNG_KOSTENBELEG");
  const [id, c] = calls[0], u = usage[0];
  fordere(c.status === "abgerechnet" && c.reserved === 212000 && c.maxOutputTokens === 3000
    && c.bezug?.runId === meta.runId && c.bezug.phase === meta.phase
    && c.bezug.mandatHash === sha(JSON.stringify(meta.mandat))
    && c.cost === K.tokenKosten(u.promptTokens, u.completionTokens)
    && u.success === true && u.model === "gpt-5-mini" && u.politicianId === meta.mandat
    && u.callType === "prosaEinordnung" && counterAfter.used === counterBefore.used + 1,
  "EINORDNUNG_KOSTENBELEG");
  const ohne = t => { const x = structuredClone(t); delete x.calls; delete x.spent; delete x.manualCalls; return x; };
  fordere(equal(ohne(alt), ohne(neu)) && neu.spent === alt.spent + c.cost
    && neu.manualCalls === alt.manualCalls + 1
    && Object.entries(alt.calls).every(([k, v]) => equal(v, neu.calls[k]))
    && Object.keys(before.testKostenTage).length === Object.keys(after.testKostenTage).length
    && Object.keys(before.testKostenTage).filter(d => d !== day).every(d => equal(before.testKostenTage[d], after.testKostenTage[d]))
    && equal(grundlinie(before), grundlinie(after))
    && equal(after.llmUsage, [u, ...before.llmUsage].slice(0, RING)), "EINORDNUNG_HISTORIE");
  return { id, call: c, usage: u, kosten: c.cost };
}

// Auch ein unlesbares JSON, ein Anbieterfehler oder ein abgebrochener Transport
// braucht die echten Rohbytes. requestStructuredJson allein liefert diese nicht.
async function transport(call, { prompt, schema, env, deadline, maxOutputTokens = 3000, now = () => new Date() }, https = H) {
  const original = https.request;
  // Transportdeckel: mindestens 30 s, sonst KI-Timeout + 10 s Puffer. Der
  // Default (20 s) laesst ihn unveraendert bei 30 s; ein fuer einen laengeren
  // isolierten Auftrag erhoehter KI-Timeout hebt ihn automatisch mit an.
  const kiRoh = Number(env && env.HELMUT_KI_TIMEOUT_MS);
  const kiTimeout = Number.isFinite(kiRoh) && kiRoh >= 1000 ? Math.floor(kiRoh) : 20000;
  const deckelMs = Math.max(30000, kiTimeout + 10000);
  // maxOutputTokens bleibt standardmaessig 3000 (Aufrufer prosa-einordnung
  // unveraendert); der isolierte 8-Fall-Vergleich reicht ausdruecklich 8000 durch.
  const expected = { model: "gpt-5-mini", input: prompt, max_output_tokens: maxOutputTokens,
    reasoning: { effort: "low" }, text: { format: { type: "json_schema", name: "knowledge_object", schema, strict: true } } };
  const urlExpected = require("../lib/helmut/azure-endpunkt").baueResponsesUrl(env.AZURE_OPENAI_ENDPOINT);
  const record = { request: expected, statusCode: null, rawResponse: "", complete: false, requests: 0 };
  const chunks = []; let size = 0, timer, active;
  https.request = function(url, options, cb) {
    fordere(++record.requests === 1 && String(url) === String(urlExpected) && options.method === "POST"
      && now().getTime() + deckelMs < deadline, "EINORDNUNG_TRANSPORT");
    const req = active = original.call(https, url, options, res => {
      record.statusCode = res.statusCode;
      res.on("data", chunk => { size += Buffer.byteLength(chunk); if (size <= 8 * 1024 * 1024) chunks.push(Buffer.from(chunk));
        else req.destroy(new Error("EINORDNUNG_ANTWORTGROESSE")); });
      res.on("end", () => { record.complete = true; }); cb(res);
    });
    const write = req.write.bind(req), end = req.end.bind(req); let written = false;
    req.write = function(body, ...args) {
      fordere(!written && typeof body === "string" && equal(JSON.parse(body), expected), "EINORDNUNG_NUTZLAST");
      written = true; record.requestRaw = body; return write(body, ...args);
    };
    req.end = function(...args) { fordere(written && !args.some(x => typeof x === "string" || Buffer.isBuffer(x)), "EINORDNUNG_NUTZLAST"); return end(...args); };
    timer = setTimeout(() => req.destroy(new Error("EINORDNUNG_TRANSPORTZEIT")), deckelMs);
    req.on("close", () => clearTimeout(timer)); return req;
  };
  let answer = null, failed = false;
  try { answer = await call(); } catch { failed = true; }
  finally {
    https.request = original; clearTimeout(timer);
    if (!record.complete) active?.destroy();
  }
  record.rawResponse = Buffer.concat(chunks).toString("utf8"); record.responseHash = sha(record.rawResponse);
  return { answer, failed, record };
}

async function ausfuehren({ env = process.env, now = () => new Date(), fetchFn = global.fetch,
  storage = require("../lib/helmut/storage"), ai = require("../lib/helmut/ai"), observe = transport,
  emit = value => console.log(JSON.stringify(value)) } = {}) {
  const a = eingabe(env.CONFIRM_TEXT), p = paket(); konfiguration(a, env, now());
  const runId = `nachlauf500-${env.GITHUB_RUN_ID}`;
  const ctx = { runId: env.GITHUB_RUN_ID, commit: a.commit, tag: TAG, abPosition: 1, anzahl: 1 };
  const startCounter = await vorflug(a, env, storage, fetchFn, now());
  const start = now(), deadline = start.getTime() + MAX_MS;
  let expected;
  await storage.mutateAuthStore(auth => {
    fordere(!Object.hasOwn(auth, KEY), "EINORDNUNG_BEREITS_BEGONNEN");
    fordere(auth.prosaEinordnung20260921?.status === "gestoppt"
      && auth.prosaEinordnung20260921.runId === "nachlauf500-35573253937", "EINORDNUNG_VORVERSUCH_OFFEN");
    for (const [k, max] of Object.entries({ sessions: 2000, auditEvents: 1000, systemErrors: 500,
      dailyInputs: 2000, llmUsage: RING, processRuns: 300 }))
      fordere(Array.isArray(auth[k]) && auth[k].length <= max, "EINORDNUNG_SPEICHERSTAND");
    const t = K.pruefeTag(auth.testKostenTage?.[TAG], TAG); K.kontrolliere(auth, TAG, 0, startCounter.used);
    fordere(t.frozen === null && !Object.values(t.calls).some(c => ["reserviert", "ungeklaert"].includes(c.status))
      && K.belegt(t) + MAX_COST <= 4000000, "EINORDNUNG_KOSTEN_GESPERRT");
    expected = { version: 1, runId, commit: a.commit, productionCommit: a.productionCommit,
      paketHash: p.paketHash, empfaenger: T.publicKey(a.publicKey).fingerprint,
      status: "begonnen", begonnenAm: start.toISOString(), ende: new Date(deadline).toISOString(),
      archivierteAufruftelemetrie: structuredClone(auth.llmUsage.slice(Math.max(0, RING - 2))),
      phasen: [], fachlichBestanden: false, inProductionImportiert: false };
    auth[KEY] = structuredClone(expected);
  });
  fordere(equal((await storage.readAuthStore())[KEY], expected), "EINORDNUNG_START_UNBESTAETIGT");
  async function schreibe(change) {
    let next;
    await storage.mutateAuthStore(auth => { fordere(equal(auth[KEY], expected), "EINORDNUNG_SCHREIBKONFLIKT");
      next = structuredClone(expected); change(next); auth[KEY] = structuredClone(next); });
    fordere(equal((await storage.readAuthStore())[KEY], next), "EINORDNUNG_ABLAGE_UNBESTAETIGT"); expected = next;
  }
  let before, counter, meta, result = null, fehler = null;
  try {
    result = await AI.erzeuge({ ...p, runId,
      beforeCall: async m => {
        konfiguration(a, env, now());
        fordere(now().getTime() + 60000 < deadline && m.basisHash === p.basisHash
          && m.phase === ["entwurf", "pruefung"][expected.phasen.length]
          && expected.phasen.every(x => x.status === "antwort-und-kosten-bestaetigt"), "EINORDNUNG_PHASE");
        counter = await vorflug(a, env, storage, fetchFn, now()); meta = structuredClone(m);
        await schreibe(r => { r.phasen.push({ ...m, status: "begonnen" }); });
        before = await storage.readAuthStore();
      },
      onResponse: async r => {
        const after = await storage.readAuthStore();
        const afterCounter = await vorflug(a, env, storage, fetchFn, now());
        const costs = kostenbeleg(before, after, meta, counter, afterCounter);
        const answerHash = hash(r.antwort);
        const envelope = T.verschluesseln({ ...r, costs }, a.publicKey, ctx);
        emit({ typ: "einordnung-antwort", phase: r.phase, envelope });
        await schreibe(x => Object.assign(x.phasen.at(-1), { status: "antwort-und-kosten-bestaetigt",
          antwortHash: answerHash, antwort: envelope, kosten: costs.kosten }));
        return { gespeichert: true, runId, phase: r.phase, mandat: r.mandat, basisHash: r.basisHash, antwortHash: answerHash };
      }
    }, { ai: { understandingModelName: () => ai.understandingModelName(),
      requestStructuredJson: async (prompt, schema, m, model, options) => {
        const observed = await observe(() => ai.requestStructuredJson(prompt, schema, m, model, options),
          { prompt, schema, env, deadline, now });
        const envelope = T.verschluesseln(observed, a.publicKey, ctx);
        emit({ typ: "einordnung-transport", phase: meta.phase, envelope });
        await schreibe(x => Object.assign(x.phasen.at(-1), { transport: envelope,
          transportHash: observed.record.responseHash }));
        fordere(!observed.failed && observed.record.requests === 1 && observed.record.complete
          && observed.record.statusCode === 200, "EINORDNUNG_MODELLAUSGANG");
        return observed.answer;
      } } });
    fordere(expected.phasen.length === 2 && expected.phasen.reduce((s, x) => s + x.kosten, 0) <= MAX_COST
      && now().getTime() < deadline, "EINORDNUNG_ABSCHLUSS");
    await vorflug(a, env, storage, fetchFn, now());
  } catch (e) { fehler = /^EINORDNUNG_[A-Z_]+$/.test(e?.code || "") ? e.code : "EINORDNUNG_FACHLICH_ODER_TECHNISCH_ABGELEHNT"; }
  const envelope = T.verschluesseln({ result, fehler, fachlichBestanden: false, inProductionImportiert: false }, a.publicKey, ctx);
  emit({ typ: "einordnung-abschluss", envelope });
  await schreibe(x => { x.status = "gestoppt"; x.beendetAm = now().toISOString(); x.fehler = fehler; x.ergebnis = envelope; });
  return { ok: !fehler, status: "gestoppt", phasenBegonnen: expected.phasen.length, fachlichBestanden: false, inProductionImportiert: false };
}
if (require.main === module) ausfuehren().then(r => { console.log(JSON.stringify(r)); if (!r.ok) process.exitCode = 1; })
  .catch(() => { console.error(JSON.stringify({ ok: false, grund: "EINORDNUNG_UNBESTAETIGT", automatischeWiederholung: false })); process.exitCode = 1; });
module.exports = { paket, eingabe, konfiguration, vorflug, grundlinie, kostenbeleg, transport, ausfuehren,
  KEY, PREFIX, BRANCH, TAG, MAX_COST, MAX_MS };
