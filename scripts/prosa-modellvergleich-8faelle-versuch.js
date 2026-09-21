"use strict";

// Einmaliger fest gebundener Modell-Sollfall-Vergleich (8 Faelle) innerhalb der
// Betreiberfreigabe. Nur manuell auf diesem Branch; alle Rohantworten bleiben
// privat erhalten. Ein einziger Modellaufruf, kein Retry, keine Wiederholung.
// Dieser Ausfuehrer wird in dieser Vorbereitung NICHT gegen das Modell ausgefuehrt.
const C = require("node:crypto"), Z = require("node:zlib");
const { vorflug, transport } = require("./prosa-einordnung-versuch");
const { isDeepStrictEqual: equal } = require("node:util");
const P = require("../lib/helmut/prosa-praemissenpruefung");
const R = require("../lib/helmut/prosa-praemissenreferenzen");
const F = require("./fixtures/prosa-modellvergleich-8faelle");
const K = require("../lib/helmut/testkosten-budget");
const T = require("./privater-nachweis-transport");
const { hash } = require("../lib/helmut/briefing-speicher");
const KEY = "prosaModellvergleich4_20260921", PREFIX = "MODELLVERGLEICH8_EINMAL:";
const BRANCH = "codex/prosa-modellvergleich-satzfix-20260921", TAG = "2026-09-21";
// Ausgabegrenze dieses isolierten Auftrags: acht Faelle in EINEM Aufruf werden
// mit 8000 Ausgabetokens reserviert. Volle konservative Reserve =
// tokenKosten(MAX_INPUT_TOKENS=400000, 8000) = 232000 Mikro-USD (0,232 USD),
// deutlich unter dem unveraenderten 4-USD-Tagesriegel. Keine Budgeterhoehung.
const MAX_OUTPUT_TOKENS = 8000, MAX_COST = 232000, MAX_MS = 300000, RING = 5000;
// Laufzeitdeckel dieses isolierten Auftrags. Acht Faelle in EINEM Aufruf brauchen
// deutlich laenger als der Standard (20 s); der Wert wird als einziger zugelassen.
const KI_TIMEOUT_MS = 120000;
const sha = x => C.createHash("sha256").update(x).digest("hex");
function fordere(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e; } }

// Genau ZWEI belegte Altbestaende: die beiden abgebrochenen, voll reservierten
// (ungeklaerten) Kostentickets aus den Runs 35584480605 (Praemissen-Vergleich)
// und 35640378598 (achter Modellvergleich). Beide binden je 0,212 USD unbekannt
// und bleiben laut Kostenregel 2 erhalten (nicht entfernt, nicht umgebucht,
// nicht als abgerechnet markiert). Nur EXAKT diese zwei Tickets werden zugelassen;
// jede Abweichung, jedes dritte unbekannte und jedes reservierte Ticket sperrt
// weiterhin fail closed. Keine allgemeine Lockerung.
const ALT_TICKET = "2ec7ab92-7d20-45db-94b9-9004f32f55d9";
const ALT_BEZUG_RUN = "nachlauf500-35584480605";
const ALT_MANDAT_HASH = sha(JSON.stringify("synthetisch-praemissen-1"));
const NEU_TICKET = "ff3b56df-fa36-4db5-add3-f8def5caefc2";
const NEU_BEZUG_RUN = "nachlauf500-35640378598";
const NEU_MANDAT_HASH = sha(JSON.stringify("synthetisch-modellvergleich-8"));

function belegterAltbestand(c) {
  return Boolean(c) && c.status === "ungeklaert" && c.reserved === 212000
    && c.maxOutputTokens === 3000 && c.manual === true;
}
// Es duerfen genau die zwei belegten ungeklaerten Tickets bestehen bleiben.
// Kein reserviertes Ticket, kein drittes, keine Abweichung in Kennung oder Bezug.
function pruefeOffeneReserven(t) {
  const offen = Object.entries(t.calls).filter(([, c]) => ["reserviert", "ungeklaert"].includes(c.status));
  const bekannt = new Set([ALT_TICKET, NEU_TICKET]);
  const alt = t.calls[ALT_TICKET], neu = t.calls[NEU_TICKET];
  fordere(t.frozen === null && offen.length === 2 && offen.every(([id]) => bekannt.has(id))
    && belegterAltbestand(alt) && alt.bezug?.runId === ALT_BEZUG_RUN && alt.bezug.phase === "pruefung"
    && alt.bezug.mandatHash === ALT_MANDAT_HASH
    && belegterAltbestand(neu) && neu.bezug?.runId === NEU_BEZUG_RUN && neu.bezug.phase === "pruefung"
    && neu.bezug.mandatHash === NEU_MANDAT_HASH
    && K.belegt(t) + MAX_COST <= 4000000, "EINORDNUNG_KOSTEN_GESPERRT");
}

// Fruehe Fehler (vor der inneren Behandlung) erhalten einen sicheren, knappen
// Fehlercode, aber niemals eine Fehlermeldung, einen Stack oder Inhalte.
function frueheFehlerausgabe(e) {
  const detail = /^EINORDNUNG_[A-Z_]+$/.test(e?.code || "") ? { detail: e.code } : {};
  return { ok: false, grund: "EINORDNUNG_UNBESTAETIGT", ...detail, automatischeWiederholung: false };
}

function paket() {
  const faelle = F.corpus();
  fordere(faelle.length === 8, "EINORDNUNG_SOLLUMFANG");
  const vertrag = P.binde(faelle.map(r => r.eingabe));
  const schema = R.schema(vertrag), prompt = R.prompt(vertrag);
  return { faelle, vertragHash: vertrag.eingabeHash, schema, prompt,
    paketHash: hash({ faelle, schema, prompt, auswertung: auswertung.toString(),
      scope: "8-Faelle-6-negativ-2-positiv-ein-Aufruf-keine-Produktabnahme" }) };
}

function auswertung(rows, pruefung) {
  fordere(rows.length === pruefung.urteile.length && rows.length === 8, "EINORDNUNG_SOLLUMFANG");
  return rows.map(r => {
    const ist = pruefung.urteile.find(x => x.id === r.eingabe.id)?.urteil;
    return { id: r.eingabe.id, klasse: r.klasse, art: r.art, erwartet: r.erwartet,
      erhalten: ist, bestanden: ist === r.erwartet,
      falschPositiv: ist === "tragfaehig" && r.erwartet !== "tragfaehig",
      falschNegativ: ist !== "tragfaehig" && r.erwartet === "tragfaehig" };
  });
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
    HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
    // Nur exakt dieser Laufzeitdeckel ist zugelassen; jeder andere Wert sperrt.
    HELMUT_KI_TIMEOUT_MS: String(KI_TIMEOUT_MS) };
  fordere(Object.entries(expected).every(([k, v]) => env[k] === v)
    && env.SUPABASE_URL === "https://ddckuvvpcytqbyfmbvie.supabase.co"
    && env.SUPABASE_SERVICE_ROLE_KEY && env.AZURE_OPENAI_KEY && env.HELMUT_CRON_SECRET,
  "EINORDNUNG_KONFIGURATION");
  fordere(["OPENAI_API_KEY", "HELMUT_ARTIKELKONTEXT", "HELMUT_LLM_USAGE_RELATIONAL", "HELMUT_TENANT_LLM_CAP",
    "NODE_OPTIONS", "NODE_TLS_REJECT_UNAUTHORIZED", "NODE_EXTRA_CA_CERTS"]
    .every(k => !env[k]), "EINORDNUNG_FREMDE_KONFIGURATION");
  fordere(require("../lib/helmut/azure-endpunkt").pruefeEndpunkt(env.AZURE_OPENAI_ENDPOINT).gueltig,
    "EINORDNUNG_AZURE_ZIEL");
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
  fordere(c.status === "abgerechnet" && c.reserved === MAX_COST && c.maxOutputTokens === MAX_OUTPUT_TOKENS
    && c.bezug?.runId === meta.runId && c.bezug.phase === meta.phase
    && c.bezug.mandatHash === sha(JSON.stringify(meta.mandat))
    && c.cost === K.tokenKosten(u.promptTokens, u.completionTokens)
    && u.success === true && u.model === "gpt-5-mini" && u.politicianId === meta.mandat
    && u.callType === "prosaModellvergleich" && counterAfter.used === counterBefore.used + 1,
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
    for (const [k, max] of Object.entries({ sessions: 2000, auditEvents: 1000, systemErrors: 500,
      dailyInputs: 2000, llmUsage: RING, processRuns: 300 }))
      fordere(Array.isArray(auth[k]) && auth[k].length <= max, "EINORDNUNG_SPEICHERSTAND");
    const t = K.pruefeTag(auth.testKostenTage?.[TAG], TAG);
    // genau ZWEI belegte Altbestaende duerfen als unbekannte Reserve bestehen.
    K.kontrolliere(auth, TAG, 2, startCounter.used);
    pruefeOffeneReserven(t);
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
  let fehler = null;
  const result = { urteile: [], sollFaelle: 8, methodenvergleichBestanden: false,
    produktabnahme: false, bedeutungUnabhaengigBewiesen: false };
  try {
    fordere(ai.understandingModelName() === "gpt-5-mini", "EINORDNUNG_MODELL");
    konfiguration(a, env, now());
    fordere(now().getTime() + 60000 < deadline && expected.phasen.length === 0, "EINORDNUNG_PHASE");
    const counter = await vorflug(a, env, storage, fetchFn, now());
    const vertrag = P.binde(p.faelle.map(r => r.eingabe));
    const meta = { runId, phase: "pruefung", gruppe: 1, mandat: "synthetisch-modellvergleich-8",
      basisHash: vertrag.eingabeHash };
    await schreibe(r => { r.phasen.push({ ...meta, status: "begonnen" }); });
    const before = await storage.readAuthStore();
    const observed = await observe(() => ai.requestStructuredJson(p.prompt, p.schema, {
      callType: "prosaModellvergleich", politicianId: meta.mandat, runId, testKostenPhase: meta.phase
    }, "gpt-5-mini", { strict: true, reasoningEffort: "low", maxOutputTokens: MAX_OUTPUT_TOKENS }),
      { prompt: p.prompt, schema: p.schema, env, deadline, maxOutputTokens: MAX_OUTPUT_TOKENS, now });
    const transportEnvelope = T.verschluesseln(observed, a.publicKey, ctx);
    emit({ typ: "einordnung-transport", phase: meta.phase, envelope: transportEnvelope });
    await schreibe(x => Object.assign(x.phasen.at(-1), { transport: transportEnvelope,
      transportHash: observed.record.responseHash }));
    fordere(!observed.failed && observed.record.requests === 1 && observed.record.complete
      && observed.record.statusCode === 200, "EINORDNUNG_MODELLAUSGANG");
    const after = await storage.readAuthStore();
    const afterCounter = await vorflug(a, env, storage, fetchFn, now());
    const costs = kostenbeleg(before, after, meta, counter, afterCounter);
    const antwort = structuredClone(observed.answer), answerHash = hash(antwort);
    const answerEnvelope = T.verschluesseln({ ...meta, antwort, costs }, a.publicKey, ctx);
    emit({ typ: "einordnung-antwort", phase: meta.phase, envelope: answerEnvelope });
    await schreibe(x => Object.assign(x.phasen.at(-1), { status: "antwort-und-kosten-bestaetigt",
      antwortHash: answerHash, antwort: answerEnvelope, kosten: costs.kosten }));
    // Erst nach dauerhafter Antwort- und Kostenquittung gegen die getrennten,
    // vorab eingefrorenen Sollurteile pruefen. Ein einziger falscher Fall beendet
    // den Vergleich (8 von 8 verlangt, keine Mehrheitsregel, kein Retry).
    result.urteile.push(...auswertung(p.faelle, vertrag.pruefe(antwort)));
    fordere(result.urteile.every(x => x.bestanden), "EINORDNUNG_FACHLICH_ABGELEHNT");
    fordere(expected.phasen.length === 1 && result.urteile.length === 8
      && expected.phasen.reduce((sum, x) => sum + x.kosten, 0) <= MAX_COST
      && now().getTime() < deadline, "EINORDNUNG_ABSCHLUSS");
    await vorflug(a, env, storage, fetchFn, now());
    result.methodenvergleichBestanden = true;
  } catch (e) { fehler = /^EINORDNUNG_[A-Z_]+$/.test(e?.code || "") ? e.code : "EINORDNUNG_FACHLICH_ODER_TECHNISCH_ABGELEHNT"; }
  const envelope = T.verschluesseln({ result, fehler, fachlichBestanden: false, inProductionImportiert: false }, a.publicKey, ctx);
  emit({ typ: "einordnung-abschluss", envelope });
  await schreibe(x => { x.status = "gestoppt"; x.beendetAm = now().toISOString(); x.fehler = fehler; x.ergebnis = envelope; });
  return { ok: !fehler, status: "gestoppt", phasenBegonnen: expected.phasen.length, fachlichBestanden: false, inProductionImportiert: false };
}

if (require.main === module) ausfuehren().then(r => { console.log(JSON.stringify(r)); if (!r.ok) process.exitCode = 1; })
  .catch(e => { console.error(JSON.stringify(frueheFehlerausgabe(e))); process.exitCode = 1; });
module.exports = { paket, auswertung, eingabe, konfiguration, vorflug, grundlinie, kostenbeleg, transport, ausfuehren,
  pruefeOffeneReserven, frueheFehlerausgabe, KEY, PREFIX, BRANCH, TAG, MAX_COST, MAX_OUTPUT_TOKENS, MAX_MS, KI_TIMEOUT_MS,
  ALT_TICKET, ALT_BEZUG_RUN, ALT_MANDAT_HASH, NEU_TICKET, NEU_BEZUG_RUN, NEU_MANDAT_HASH };
