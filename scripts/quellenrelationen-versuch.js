"use strict";

// VORBEREITUNG OHNE STARTFREIGABE. Ein neuer Auftrag braucht Betreiberfreigabe.
// Isolierter, einmaliger Sechsblockauftrag. Keine Appinhalte oder Profile schreiben.
// Jeder Actionslauf verbraucht genau eine bisher unbenutzte Position. Der naechste
// braucht die direkte Fachbewertung der vorigen Antwort, kein automatischer Loop.
const C = require("node:crypto"), Z = require("node:zlib");
const H = require("node:https"), { isDeepStrictEqual: equal } = require("node:util");
const T = require("./privater-nachweis-transport");
const Eingang = require("./quellenrelationen-eingang");
const K = require("../lib/helmut/testkosten-budget");
const SCHEMA = Eingang.SCHEMA;
const KEY = "quellenrelationen20260920", PREFIX = "RELATIONEN_EINMAL:";
const BRANCH = "codex/aussagenrelationen-20260920";
const MANIFEST = "9ccbc5079a27ae6a5ed02b1c1e349c9b06d2ae2ea0a84052035bd74259d85000";
const SCHEMA_HASH = "777ec859c2cf5b26942a1d4f71fc9f51d02d86d3559b93825a7ff2da3b469bb2";
const PROMPTS = [
  "293de4bf6b273500737edcbc66ccf2a94c4db639ee03c9144d287966e94a86e3",
  "64462493c89001045d2ae0f8febd64036a9636490577cac64ccd6fcfef5540ca",
  "deab3485cab88f878e61ad8bb60014d1e461118d68bc4d2e0b31ff1377a8fe9c",
  "44199a26f4ff3f40ea5a812ee4184d467c4cb7e4ac484493e3311ac11ead7407",
  "ff9c336c5aba8c0d40cf941f401d4a1389140e96568fe541363c7428c9b33fa1",
  "643953faef6a8218aeb5072dc92ca6472262fe0e9ebbb0eea842ebc3fbb79929"
];
// Der ganze Actionsjob ist auf drei Minuten begrenzt. Eine neue Position
// braucht mindestens dieses komplette Restfenster, einschliesslich Abschluss.
const MAX_MS = 30 * 60000, RESERVE_MS = 180000, MAX_COST = 1272000;
const USAGE_MAX = require("../lib/helmut/storage").LLM_USAGE_RING_MAX;
const sha = x => C.createHash("sha256").update(x).digest("hex");
function fordere(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e; } }
function paket() {
  fordere(Eingang.korpus().hash === MANIFEST && sha(JSON.stringify(SCHEMA)) === SCHEMA_HASH, "RELATIONEN_PAKET");
  return PROMPTS.map((h, i) => {
    const b = Eingang.block(i + 1);
    fordere(b.promptHash === h, "RELATIONEN_PROMPT");
    return { ...b, id: b.klasse };
  });
}
function eingabe(text) {
  fordere(typeof text === "string" && text.startsWith(PREFIX) && text.length < 32000, "RELATIONEN_EINGABE");
  const encoded = text.slice(PREFIX.length), bytes = Buffer.from(encoded, "base64");
  fordere(bytes.toString("base64") === encoded, "RELATIONEN_EINGABE");
  const a = JSON.parse(Z.gunzipSync(bytes, { maxOutputLength: 65536 }));
  fordere(a && Object.keys(a).sort().join(",") === "aktion,commit,position,previous,publicKey,tag"
    && ["start", "abschluss"].includes(a.aktion)
    && /^\d{4}-\d{2}-\d{2}$/.test(a.tag) && Number.isFinite(Date.parse(a.tag))
    && new Date(a.tag).toISOString().slice(0,10) === a.tag
    && /^[a-f0-9]{40}$/.test(a.commit) && Number.isInteger(a.position) && a.position >= 1 && a.position <= 6,
  "RELATIONEN_BINDUNG");
  fordere(a.position === 1 && a.aktion === "start" ? a.previous === null : a.previous
    && Object.keys(a.previous).sort().join(",") === "responseHash,review"
    && /^[a-f0-9]{64}$/.test(a.previous.responseHash) && a.previous.review,
  "RELATIONEN_VORPRUEFUNG");
  T.publicKey(a.publicKey); return a;
}
function konfiguration(a, env, now) {
  fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === `refs/heads/${BRANCH}`
    && env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_RUN_ATTEMPT === "1"
    && env.GITHUB_SHA === a.commit && /^\d{5,20}$/.test(env.GITHUB_RUN_ID || ""), "RELATIONEN_AUSFUEHRUNG");
  fordere(now.toISOString().slice(0, 10) === a.tag && now.getUTCHours() < 23, "RELATIONEN_TAG");
  const expected = { HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main",
    HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", VERCEL_ENV: "production",
    HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
    HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200",
    HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_AZURE_MINUTE: "20",
    HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini" };
  fordere(Object.entries(expected).every(([k, v]) => env[k] === v)
    && env.SUPABASE_URL === "https://ddckuvvpcytqbyfmbvie.supabase.co"
    && env.SUPABASE_SERVICE_ROLE_KEY && env.AZURE_OPENAI_KEY && env.HELMUT_CRON_SECRET,
  "RELATIONEN_KONFIGURATION");
  fordere(["OPENAI_API_KEY", "HELMUT_ARTIKELKONTEXT", "HELMUT_LLM_USAGE_RELATIONAL", "NODE_OPTIONS",
    "NODE_TLS_REJECT_UNAUTHORIZED", "NODE_EXTRA_CA_CERTS", "HELMUT_KI_TIMEOUT_MS"].every(k => !env[k]),
  "RELATIONEN_FREMDE_KONFIGURATION");
  fordere(require("../lib/helmut/azure-endpunkt").pruefeEndpunkt(env.AZURE_OPENAI_ENDPOINT).gueltig,
    "RELATIONEN_AZURE_ZIEL");
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
  "RELATIONEN_ZEITENDE");
}
// Vollstaendige getrennte Sichtung ist eine Betreiberhandlung dieses endlichen
// Versuchs, kein automatischer Quellenrichter und keine Produktfreigabe.
function pruefeReview(fall, previous) {
  const r = previous?.review, k = (v, names) => v && typeof v === "object" && !Array.isArray(v)
    && equal(Object.keys(v).sort(), [...names].sort());
  const text = s => typeof s === "string" && s.trim().length >= 20 && s.length <= 700;
  fordere(fall.antwortHash === previous?.responseHash
    && k(r, ["pruefer", "alleOriginaleGelesen", "urteil", "quellen", "fazit"])
    && r.pruefer === "codex-getrennte-quellensichtung" && r.alleOriginaleGelesen === true
    && ["getragen", "abgelehnt", "unklar"].includes(r.urteil) && text(r.fazit)
    && Array.isArray(r.quellen) && Array.isArray(fall.umfang) && r.quellen.length === fall.umfang.length
    && new Set(r.quellen.map(q => q?.id)).size === r.quellen.length, "RELATIONEN_REVIEW");
  const urteile = [];
  for (const q of fall.umfang) {
    const v = r.quellen.find(v => v?.id === q.id);
    fordere(k(v, ["id", "referenzen", "kandidaten"]), "RELATIONEN_REVIEW");
    for (const [name, count] of [["referenzen", q.soll], ["kandidaten", q.geliefert]]) {
      const rows = v[name];
      fordere(Array.isArray(rows) && rows.length === count && new Set(rows.map(x => x?.nummer)).size === count,
        "RELATIONEN_REVIEW");
      for (const row of rows) {
        fordere(k(row, ["nummer", "urteil", "begruendung"]) && Number.isInteger(row.nummer)
          && row.nummer >= 1 && row.nummer <= count && text(row.begruendung)
          && ["getragen", "abgelehnt", "unklar"].includes(row.urteil), "RELATIONEN_REVIEW");
        urteile.push(row.urteil);
      }
    }
  }
  fordere(urteile.length > 0 && (r.urteil === "getragen") === urteile.every(u => u === "getragen"),
    "RELATIONEN_REVIEW");
  return { ...structuredClone(r), bestanden: r.urteil === "getragen", reviewHash: sha(JSON.stringify(r)) };
}
async function vorflug(env, storage, fetchFn, now) {
  const response = await fetchFn(require("./github-laufzeitpruefung").STATUS_URL, {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json" }
  });
  fordere(response.status === 200, "RELATIONEN_LAUFZEIT");
  const r = await response.json();
  fordere(r.ok === true && r.reinLesend === true && r.schemaVersion === 1
    && r.production === true && r.commit === "be4b237b6154248f30e175235ed81aa9893b01bf" && r.storageSupabase === true
    && r.kommunikationGesperrt === true && r.kohortenQuellenGesperrt === true
    && r.tagesdeckel === 2416 && r.understandingReserve === 702 && r.vorrangreserveReal === 200
    && r.testKosten?.version === 2 && r.testKosten.aktiv === true && r.testKosten.limitUsd === 4,
  "RELATIONEN_LAUFZEIT");
  const zeit = encodeURIComponent(now.toISOString());
  for (const path of ["mandate_profiles?select=user_id&aktiv=eq.true&limit=1",
    `pipeline_locks?select=job_name&expires_at=gt.${zeit}&limit=1`,
    `helmut_jobs?select=id&lease_expires_at=gt.${zeit}&limit=1`,
    `helmut_verstehen_reservierungen?select=vorgang_id&lease_bis=gt.${zeit}&limit=1`,
    "helmut_jobs?select=id&status=neq.erledigt&limit=1",
    "process_runs?select=run_id&finished_at=is.null&started_at=gt."
      + encodeURIComponent(new Date(now.getTime() - 20 * 60 * 1000).toISOString()) + "&limit=1"]) {
    // storage exportiert keinen allgemeinen Supabase Zugriff. Diese festen
    // Betreiberabfragen sind ausschliesslich begrenzte GETs vor jeder Mutation.
    let rows;
    try {
      const response = await fetchFn(env.SUPABASE_URL + "/rest/v1/" + path, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" }
      });
      fordere(response.status === 200, "RELATIONEN_BETRIEBSLESUNG");
      rows = await response.json();
      fordere(Array.isArray(rows), "RELATIONEN_BETRIEBSLESUNG");
    } catch (_) {
      // Keine Zugangsdaten, Antwortinhalte oder fremden Fehlertexte ins Log.
      fordere(false, "RELATIONEN_BETRIEBSLESUNG");
    }
    fordere(rows.length === 0, "RELATIONEN_AKTIVER_BETRIEB");
  }
  const counter = await storage.leseLlmTageszaehler(now.toISOString());
  fordere(counter.ok === true && Number.isSafeInteger(counter.used) && counter.used >= 0
    && counter.limit === 2416, "RELATIONEN_ZAEHLER");
  return { commit: r.commit, counter };
}

async function beanspruche(storage, a, runId, now, counter) {
  let expected;
  await storage.mutateAuthStore(auth => {
    for (const [key, max] of Object.entries({ sessions: 2000, auditEvents: 1000, systemErrors: 500,
      dailyInputs: 2000, llmUsage: USAGE_MAX, processRuns: 300 }))
      fordere(Array.isArray(auth[key]) && auth[key].length <= max, "RELATIONEN_SPEICHERSTAND");
    fordere(auth.quellenfaktenEingang20260920?.status === "gestoppt"
      && auth.aussagenabdeckung20260920?.status === "gestoppt", "RELATIONEN_ALTVERSUCH_OFFEN");
    let r = auth[KEY];
    const day = now.toISOString().slice(0, 10);
    let bound;
    if (auth.testKostenTage?.[day]) {
      const t = K.pruefeTag(auth.testKostenTage[day], day); K.kontrolliere(auth, day, 0, counter.used);
      fordere(!Object.values(t.calls).some(c => ["reserviert", "ungeklaert"].includes(c.status)), "RELATIONEN_KOSTEN_OFFEN");
      bound = K.belegt(t);
    } else bound = null;
    // Keine ungepruefte neue Tagesgrundlinie. Null Aufrufe und null Nutzungsbelege
    // sind der einzige hier erlaubte Fall ohne vorhandenes Kostenbuch.
    if (bound === null) {
      fordere(counter.used === 0 && !auth.llmUsage.some(x => x.createdAt?.startsWith(day)), "RELATIONEN_KOSTEN_GRUNDLAGE");
      bound = 0;
    }
    if (a.position === 1) {
      fordere(!Object.hasOwn(auth, KEY) && bound + MAX_COST <= 4000000, "RELATIONEN_START_GESPERRT");
      r = { version: 1, manifestHash: MANIFEST, schemaHash: SCHEMA_HASH, commit: a.commit,
        empfaenger: T.publicKey(a.publicKey).fingerprint, begonnenAm: now.toISOString(),
        ende: new Date(now.getTime() + MAX_MS).toISOString(), tag: day, faelle: [],
        // Der bestehende Ring bleibt begrenzt. Vor dem ersten Modellstart
        // genau die hoechstens sechs verdraengbaren Altbelege dauerhaft sichern.
        archivierteAufruftelemetrie: structuredClone(auth.llmUsage.slice(Math.max(0, USAGE_MAX - 6))),
        aufruftelemetrieGrundlageHash: sha(JSON.stringify(auth.llmUsage)) };
    } else {
      fordere(r?.version === 1 && r.manifestHash === MANIFEST && r.schemaHash === SCHEMA_HASH
        && r.commit === a.commit && r.empfaenger === T.publicKey(a.publicKey).fingerprint
        && r.faelle?.length === a.position - 1 && r.status === "wartet-auf-fachpruefung", "RELATIONEN_FORTSETZUNG");
      const p = r.faelle.at(-1);
      fordere(p.status === "antwort-und-kosten-bestaetigt" && p.antwortHash === a.previous.responseHash,
        "RELATIONEN_VORPRUEFUNG");
      p.fachpruefung = { ...pruefeReview(p, a.previous), bestaetigtAm: now.toISOString() };
      fordere(r.faelle.every(f => f.fachpruefung?.bestanden && f.kosten <= 212000), "RELATIONEN_VORPRUEFUNG");
    }
    zeit(r, now, RESERVE_MS);
    fordere(r.faelle.length < 6 && r.faelle.reduce((s, f) => s + f.kosten, 0) + 212000 <= MAX_COST,
      "RELATIONEN_AUFTRAGSLIMIT");
    r.faelle.push({ position: a.position, id: paket()[a.position - 1].id, runId,
      status: "begonnen", promptHash: PROMPTS[a.position - 1], begonnenAm: now.toISOString() });
    r.status = "fall-begonnen"; auth[KEY] = r; expected = structuredClone(r);
  });
  fordere(equal((await storage.readAuthStore())[KEY], expected), "RELATIONEN_START_UNBESTAETIGT");
  return expected;
}
function telemetrieErhalten(before, after, usage, claim) {
  if (usage.length !== 1 || !Array.isArray(claim.archivierteAufruftelemetrie)
    || claim.archivierteAufruftelemetrie.length > 6) return false;
  return equal(after.llmUsage, [...usage, ...before.llmUsage].slice(0, USAGE_MAX))
    && before.llmUsage.slice(USAGE_MAX - 1).every(old =>
      claim.archivierteAufruftelemetrie.some(archiv => equal(old, archiv)));
}
// Alte Kostentage gehoeren zur geschuetzten Historie. Nur ein neuer, voll
// abgerechneter Aufruf am Versuchstag darf hinzugekommen sein.
function kostenHistorieErhalten(before, after, day, kosten) {
  try {
    const alt = before.testKostenTage || {}, neu = after.testKostenTage || {};
    const tage = new Set([...Object.keys(alt), ...Object.keys(neu)]);
    for (const d of tage) if (d !== day && !equal(alt[d], neu[d])) return false;
    const t = K.pruefeTag(neu[day], day);
    if (alt[day]) {
      const a = structuredClone(alt[day]), b = structuredClone(t);
      delete a.calls; delete b.calls; delete a.spent; delete b.spent;
      if (!equal(a, b) || t.spent !== alt[day].spent + kosten) return false;
    } else if (t.baseline !== 0 || t.spent !== kosten) return false;
    return Object.entries(alt[day]?.calls || {}).every(([id, c]) => equal(c, t.calls[id]));
  } catch { return false; }
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
      && now() + 30000 <= deadline, "RELATIONEN_TRANSPORT");
    let req, timer;
    req = original.call(https, url, options, response => {
      const chunks = []; let size = 0;
      transport.statusCode = response.statusCode;
      response.on("data", chunk => {
        size += Buffer.byteLength(chunk); if (size <= 8 * 1024 * 1024) chunks.push(Buffer.from(chunk));
        else req.destroy(new Error("RELATIONEN_ANTWORTGROESSE"));
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
      fordere(!written && typeof body === "string" && equal(JSON.parse(body), expected), "RELATIONEN_NUTZLAST");
      written = true; transport.requestRaw = body;
      // Den tatsaechlichen Auftrag auch bei spaeterem Transportabbruch erhalten.
      emit({ ...transport, phase: "request" });
      return write(body, ...args);
    };
    req.end = function(...args) { fordere(written && !args.some(x => typeof x === "string" || Buffer.isBuffer(x)), "RELATIONEN_NUTZLAST"); return end(...args); };
    timer = setTimeout(() => req.destroy(new Error("RELATIONEN_TRANSPORTZEIT")), Math.min(20000, deadline - now()));
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
  if (a.aktion === "abschluss") {
    let expected;
    await storage.mutateAuthStore(auth => {
      const r = auth[KEY], p = r?.faelle?.at(-1);
      fordere(r?.commit === a.commit && r.empfaenger === T.publicKey(a.publicKey).fingerprint
        && r.status === "wartet-auf-fachpruefung" && r.faelle.length === a.position
        && p.status === "antwort-und-kosten-bestaetigt", "RELATIONEN_ABSCHLUSS");
      p.fachpruefung = { ...pruefeReview(p, a.previous), bestaetigtAm: now().toISOString() };
      r.status = p.fachpruefung.bestanden && a.position === 6 ? "geschlossen" : "gestoppt";
      r.abgeschlossenAm = now().toISOString(); expected = structuredClone(r);
    });
    fordere(equal((await storage.readAuthStore())[KEY], expected), "RELATIONEN_ABSCHLUSS_UNBESTAETIGT");
    return { ok: true, abschluss: true, status: expected.status, modellaufrufe: 0, fachlichBestanden: false };
  }
  const runtime = await vorflug(env, storage, fetchFn, now());
  const before = await storage.readAuthStore(), runId = `quellenrelationen-einmal-${env.GITHUB_RUN_ID}`;
  const claim = await beanspruche(storage, a, runId, now(), runtime.counter);
  const context = { runId: env.GITHUB_RUN_ID, commit: a.commit, tag: claim.tag, abPosition: a.position, anzahl: 1 };
  const send = (typ, value) => emit({ typ, envelope: T.verschluesseln(value, a.publicKey, context) });
  let result = null, errorCode = null, transport = null, pruefung = null;
  try {
    konfiguration(a, env, now()); zeit(claim, now(), RESERVE_MS);
    result = await observe(() => request(f.prompt, SCHEMA,
      { callType: "understanding", pipelineStep: "quellenrelationen-eingang", politicianId: null, runId },
      "gpt-5-mini", { strict: false, reasoningEffort: "minimal" }),
    { prompt: f.prompt, env, deadline: Date.parse(claim.ende),
      emit: value => { transport = value; send("quellenrelationen-transport", { position: a.position, runId, ...value }); } });
    fordere(result.count === 1 && transport?.rawResponse && transport.statusCode === 200, "RELATIONEN_TRANSPORTBELEG");
    pruefung = Eingang.pruefe(a.position, result.answer);
    // Unbekannte Wortvarianten sind keine automatische semantische Ablehnung.
    // Vor jedem weiteren Aufruf wird die GANZE Ausgabe unabhaengig gesichtet.
  } catch (e) { errorCode = /^[A-Z_]{3,60}$/.test(e?.code || "") ? e.code : "RELATIONEN_AUSGANG_OFFEN"; }
  send("quellenrelationen-antwort", { runId, position: a.position, fall: f, schemaHash: SCHEMA_HASH,
    answer: result?.answer ?? null, pruefung, errorCode, runtime, fachlichBestanden: false });
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
    && kostenHistorieErhalten(before, after, claim.tag, kostenBestaetigt ? newCalls[0][1].cost : NaN);
  if (!kostenBestaetigt || !geschuetzt || !usage[0]?.success) errorCode ||= "RELATIONEN_NACHKONTROLLE";
  try { zeit(claim, now()); await vorflug(env, storage, fetchFn, now()); }
  catch { errorCode ||= "RELATIONEN_NACHKONTROLLE"; }
  const beleg = { runId, position: a.position, kostenBestaetigt, geschuetzt, telemetrieGesichert,
    archivierteAufruftelemetrie: claim.archivierteAufruftelemetrie,
    aufruftelemetrieGrundlageHash: claim.aufruftelemetrieGrundlageHash, usage, newCalls, counter, errorCode,
    fachlichBestanden: false, unabhaengigFreigegeben: false, inProductionImportiert: false };
  send("quellenrelationen-kosten", beleg);
  let savedExpected;
  await storage.mutateAuthStore(auth => {
    const r = auth[KEY];
    fordere(equal(r, claim), "RELATIONEN_ABSCHLUSSKONFLIKT");
    Object.assign(r.faelle.at(-1), { status: errorCode ? "gestoppt" : "antwort-und-kosten-bestaetigt",
      beendetAm: now().toISOString(), antwortHash: result?.answer ? sha(JSON.stringify(result.answer)) : null,
      transportHash: transport?.responseHash || null, kosten: kostenBestaetigt ? newCalls[0][1].cost : null,
      kostenBestaetigt, errorCode, umfang: pruefung?.bilanz || null,
      referenzgleich: pruefung?.referenzgleich ?? null });
    r.status = errorCode ? "gestoppt" : "wartet-auf-fachpruefung"; savedExpected = structuredClone(r);
  });
  fordere(equal((await storage.readAuthStore())[KEY], savedExpected), "RELATIONEN_ABSCHLUSS_UNBESTAETIGT");
  return { ok: !errorCode, runId, position: a.position, kostenBestaetigt, fachlichBestanden: false };
}
if (require.main === module) ausfuehren().then(r => {
  console.log(JSON.stringify(r)); if (!r.ok) process.exitCode = 1;
}).catch(e => {
  console.error(JSON.stringify({ ok: false, grund: /^RELATIONEN_[A-Z_]+$/.test(e?.code || "") ? e.code : "RELATIONEN_UNBESTAETIGT",
    automatischeWiederholung: false })); process.exitCode = 1;
});
module.exports = { paket, eingabe, konfiguration, grundlinie, zeit, beanspruche, pruefeReview, telemetrieErhalten, mitTransportbeleg, ausfuehren,
  kostenHistorieErhalten, KEY, PREFIX, BRANCH, MANIFEST, SCHEMA_HASH, PROMPTS, MAX_MS, RESERVE_MS, MAX_COST, sha };
