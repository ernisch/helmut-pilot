"use strict";

// Einmaliger fest gebundener 36er Fachlauf (18 Fachfaelle x zwei Bereiche).
// Je Pfadfall GENAU EIN modellgestuetzter Pruefaufruf gegen den eingefrorenen
// Sollentwurf. Kein Entwurfsaufruf, kein Retry, hoechstens 36 Aufrufe.
// Dieser Ausfuehrer fuehrt NICHTS von selbst aus; er wird nur manuell auf dem
// gebundenen Branch gestartet. Alle Rohantworten bleiben privat.
const C = require("node:crypto"), Z = require("node:zlib");
const { vorflug, transport } = require("./prosa-einordnung-versuch");
const { isDeepStrictEqual: equal } = require("node:util");
const P = require("../lib/helmut/prosa-einordnung");
const AI = require("../lib/helmut/prosa-einordnung-ai");
const F = require("./fixtures/prosa-36er");
const K = require("../lib/helmut/testkosten-budget");
const T = require("./privater-nachweis-transport");
const { hash } = require("../lib/helmut/briefing-speicher");
const KEY = "prosa36er20260922", PREFIX = "PROSA36_EINMAL:";
const BRANCH = "codex/prosa-36er-lauf-20260922", TAG = "2026-09-22";
// Ein Pruefaufruf je Pfadfall; volle Reserve tokenKosten(400000, 3000) = 212000.
const MAX_CALLS = 36, MAX_OUTPUT_TOKENS = 3000, MAX_COST = 212000;
const MAX_MS = 2700000, RING = 5000, KI_TIMEOUT_MS = 60000;
const sha = x => C.createHash("sha256").update(x).digest("hex");
function fordere(ok, code) { if (!ok) { const e = new Error(code); e.code = code; throw e; } }

// Die zwei belegten ungeklaerten Altbestaende des 21.09. bleiben unveraendert
// gebunden. Nur EXAKT diese zwei sind zulaessig; jedes weitere unbekannte und
// jedes reservierte Ticket (auch am Lauf-Tag) sperrt fail closed.
const ALT_TICKET = "2ec7ab92-7d20-45db-94b9-9004f32f55d9";
const NEU_TICKET = "ff3b56df-fa36-4db5-add3-f8def5caefc2";
const VORTAG = "2026-09-21";

function paket() {
  const p = F.paket();
  fordere(p.faelle.length === 36 && Object.keys(p.basisHashes).length === 36, "EINORDNUNG_SOLLUMFANG");
  return p;
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
  // TAG ist der Lauf-Tag; der Lauf darf keinen UTC-Tageswechsel ueberschreiten.
  fordere(now.toISOString().slice(0, 10) === TAG
    && now.getTime() + MAX_MS < Date.parse(TAG + "T23:59:59Z"), "EINORDNUNG_TAG");
  const expected = { HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main",
    HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", VERCEL_ENV: "production",
    HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
    HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200",
    HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_AZURE_MINUTE: "20",
    HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
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

// Kostenlage: der Lauf-Tag ist frisch (kein Tagesbuch oder keine offenen Reserven),
// der Vortag traegt genau die zwei belegten ungeklaerten Tickets. Jede Abweichung sperrt.
function pruefeKostenlage(auth) {
  const tagBuch = auth.testKostenTage?.[TAG];
  if (tagBuch !== undefined) {
    const t = K.pruefeTag(tagBuch, TAG);
    const offen = Object.values(t.calls).filter(c => ["reserviert", "ungeklaert"].includes(c.status));
    fordere(offen.length === 0, "EINORDNUNG_KOSTEN_TAG_OFFEN");
  }
  const vortag = auth.testKostenTage?.[VORTAG];
  if (vortag !== undefined) {
    const v = K.pruefeTag(vortag, VORTAG);
    const vOffen = Object.entries(v.calls).filter(([, c]) => ["reserviert", "ungeklaert"].includes(c.status));
    fordere(vOffen.every(([id]) => [ALT_TICKET, NEU_TICKET].includes(id)) && vOffen.length === 2,
      "EINORDNUNG_KOSTEN_VORTAG_ABWEICHEND");
  }
}

// Genau EIN neuer bezahlter Aufruf je Schritt; Rest der Historie unveraendert.
function kostenbeleg(before, after, meta, counterBefore, counterAfter) {
  const day = TAG;
  const alt = before.testKostenTage?.[day] === undefined ? null : K.pruefeTag(before.testKostenTage[day], day);
  const neu = K.pruefeTag(after.testKostenTage?.[day], day);
  const altCalls = alt === null ? {} : alt.calls;
  const calls = Object.entries(neu.calls).filter(([id]) => !Object.hasOwn(altCalls, id));
  const usage = after.llmUsage.filter(u => u.runId === meta.runId).filter(u =>
    !before.llmUsage.some(x => x.id === u.id));
  fordere(calls.length === 1 && usage.length === 1, "EINORDNUNG_KOSTENBELEG");
  const [id, c] = calls[0], u = usage[0];
  fordere(c.status === "abgerechnet" && c.reserved === MAX_COST && c.maxOutputTokens === MAX_OUTPUT_TOKENS
    && c.bezug?.runId === meta.runId && c.bezug.phase === meta.phase
    && c.bezug.mandatHash === sha(JSON.stringify(meta.mandat))
    && c.cost === K.tokenKosten(u.promptTokens, u.completionTokens)
    && u.success === true && u.model === "gpt-5-mini" && u.politicianId === meta.mandat
    && u.callType === "prosa36erPruefung" && counterAfter.used === counterBefore.used + 1,
  "EINORDNUNG_KOSTENBELEG");
  if (alt === null) {
    // Erster Aufruf des Tages: das Tagesbuch wurde durch die Reservierung angelegt.
    fordere(Object.keys(neu.calls).length === 1 && neu.manualCalls === 1 && neu.spent === c.cost,
      "EINORDNUNG_KOSTENBELEG");
  } else {
    const ohne = t => { const x = structuredClone(t); delete x.calls; delete x.spent; delete x.manualCalls; return x; };
    fordere(equal(ohne(alt), ohne(neu)) && neu.spent === alt.spent + c.cost
      && neu.manualCalls === alt.manualCalls + 1
      && Object.entries(alt.calls).every(([k, v]) => equal(v, neu.calls[k]))
      && Object.keys(before.testKostenTage).length === Object.keys(after.testKostenTage).length
      && Object.keys(before.testKostenTage).filter(d => d !== day).every(d => equal(before.testKostenTage[d], after.testKostenTage[d]))
      && equal(grundlinie(before), grundlinie(after))
      && equal(after.llmUsage, [u, ...before.llmUsage].slice(0, RING)), "EINORDNUNG_HISTORIE");
  }
  return { id, call: c, usage: u, kosten: c.cost };
}

function grundlinie(auth) {
  const x = structuredClone(auth);
  for (const k of [KEY, "llmUsage", "testKostenTage", "_authStoreRevision"]) delete x[k];
  return x;
}

// Fruehe Fehler erhalten einen sicheren, knappen Fehlercode, aber niemals eine
// Fehlermeldung, einen Stack oder Inhalte.
function frueheFehlerausgabe(e) {
  const detail = /^EINORDNUNG_[A-Z_]+$/.test(e?.code || "") ? { detail: e.code } : {};
  return { ok: false, grund: "EINORDNUNG_UNBESTAETIGT", ...detail, automatischeWiederholung: false };
}

// Beurteilt die Pruefantwort: akzeptiert, nicht-akzeptiert oder unbrauchbar.
function beurteile(vertrag, entwurf, urteil) {
  try { vertrag.formuliere(entwurf, urteil); return { lage: "akzeptiert", grund: null }; }
  catch (e) {
    const m = String(e?.message || "");
    if (m.includes("pruefung-abgelehnt")) return { lage: "nicht-akzeptiert", grund: "pruefung-abgelehnt" };
    return { lage: "unbrauchbar", grund: m.replace(/^prosa-einordnung-/, "").slice(0, 60) || "unbekannt" };
  }
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
    if (auth.testKostenTage?.[TAG] !== undefined) K.kontrolliere(auth, TAG, 0, startCounter.used);
    pruefeKostenlage(auth);
    expected = { version: 1, runId, commit: a.commit, productionCommit: a.productionCommit,
      paketHash: p.paketHash, empfaenger: T.publicKey(a.publicKey).fingerprint,
      status: "begonnen", begonnenAm: start.toISOString(), ende: new Date(deadline).toISOString(),
      archivierteAufruftelemetrie: structuredClone(auth.llmUsage.slice(Math.max(0, RING - 2))),
      phasen: [], aufrufe: 0, fachlichBestanden: false, inProductionImportiert: false };
    auth[KEY] = structuredClone(expected);
  });
  fordere(equal((await storage.readAuthStore())[KEY], expected), "EINORDNUNG_START_UNBESTAETIGT");
  async function schreibe(change) {
    let next;
    await storage.mutateAuthStore(auth => { fordere(equal(auth[KEY], expected), "EINORDNUNG_SCHREIBKONFLIKT");
      next = structuredClone(expected); change(next); auth[KEY] = structuredClone(next); });
    fordere(equal((await storage.readAuthStore())[KEY], next), "EINORDNUNG_ABLAGE_UNBESTAETIGT"); expected = next;
  }
  const result = { pfadfaelle: 36, aufrufe: 0, ergebnisse: [], fachlichBestanden: false,
    produktabnahme: false, inProductionImportiert: false };
  let fehler = null;
  try {
    fordere(ai.understandingModelName() === "gpt-5-mini", "EINORDNUNG_MODELL");
    konfiguration(a, env, now());
    fordere(now().getTime() + 60000 < deadline, "EINORDNUNG_FENSTER");
    let counter = await vorflug(a, env, storage, fetchFn, now());
    for (let i = 0; i < p.faelle.length; i += 1) {
      const f = p.faelle[i];
      konfiguration(a, env, now());
      fordere(result.aufrufe < MAX_CALLS, "EINORDNUNG_AUFRUFGRENZE");
      const vertrag = P.binde({ basis: f.basis, faktenPlan: f.faktenPlan, bereich: f.bereich });
      fordere(vertrag.basisHash === p.basisHashes[f.id], "EINORDNUNG_BASISHASH");
      const pruefEingabe = vertrag.vorbereite(f.entwurf);
      const meta = { runId, phase: "pruefung", gruppe: i + 1, mandat: "synthetisch-36er", basisHash: vertrag.basisHash };
      const before = await storage.readAuthStore();
      const tagBuch = before.testKostenTage?.[TAG];
      const gebunden = tagBuch === undefined ? 0 : K.belegt(tagBuch);
      fordere(gebunden + MAX_COST <= K.LIMIT_MICRO_USD, "EINORDNUNG_KOSTENRIEGEL");
      await schreibe(x => { x.phasen.push({ id: f.id, art: f.art, bereich: f.bereich, status: "begonnen" }); });
      const prompt = P.pruefPrompt(pruefEingabe);
      const cctx = { ...ctx, abPosition: i + 1, anzahl: 1 };
      const observed = await observe(() => ai.requestStructuredJson(prompt, AI.PRUEF_SCHEMA, {
        callType: "prosa36erPruefung", politicianId: meta.mandat, runId, testKostenPhase: meta.phase
      }, "gpt-5-mini", { strict: true, reasoningEffort: "low" }),
        { prompt, schema: AI.PRUEF_SCHEMA, env, deadline, maxOutputTokens: MAX_OUTPUT_TOKENS, now });
      result.aufrufe += 1;
      const transportEnvelope = T.verschluesseln(observed, a.publicKey, cctx);
      emit({ typ: "36er-transport", id: f.id, abPosition: i + 1, envelope: transportEnvelope });
      if (observed.failed || observed.record.requests !== 1 || !observed.record.complete
        || observed.record.statusCode !== 200) { fehler = "EINORDNUNG_TRANSPORT"; throw Object.assign(new Error(fehler), { code: fehler }); }
      const after = await storage.readAuthStore();
      const afterCounter = await vorflug(a, env, storage, fetchFn, now());
      const costs = kostenbeleg(before, after, meta, counter, afterCounter);
      counter = afterCounter;
      const antwortHash = hash(observed.answer);
      const answerEnvelope = T.verschluesseln({ ...meta, antwort: observed.answer, costs }, a.publicKey, cctx);
      emit({ typ: "36er-antwort", id: f.id, abPosition: i + 1, envelope: answerEnvelope });
      const urteil = beurteile(vertrag, f.entwurf, observed.answer);
      const bestanden = urteil.lage === f.erwartet;
      result.ergebnisse.push({ id: f.id, art: f.art, bereich: f.bereich, erwartet: f.erwartet,
        lage: urteil.lage, grund: urteil.grund, bestanden, antwortHash, kosten: costs.kosten });
      await schreibe(x => { Object.assign(x.phasen.at(-1), { status: "quittiert", lage: urteil.lage,
        grund: urteil.grund, antwortHash, kosten: costs.kosten, aufrufeBisher: result.aufrufe }); x.aufrufe = result.aufrufe; });
      if (urteil.lage === "unbrauchbar") { fehler = "EINORDNUNG_UNBRAUCHBAR"; break; }
      if (!bestanden) { fehler = "EINORDNUNG_FACHLICH_ABGELEHNT"; break; }
    }
    const ids = result.ergebnisse.map(e => e.id);
    if (!fehler) {
      // Vollstaendigkeit: 36 eindeutige, verwertbare Ergebnisse, keine Luecke/Dopplung.
      fordere(result.aufrufe <= MAX_CALLS, "EINORDNUNG_AUFRUFGRENZE");
      fordere(result.ergebnisse.length === 36 && new Set(ids).size === 36, "EINORDNUNG_UNVOLLSTAENDIG");
      fordere(result.ergebnisse.every(e => e.lage !== "unbrauchbar" && e.bestanden), "EINORDNUNG_FACHLICH_ABGELEHNT");
      await vorflug(a, env, storage, fetchFn, now());
      result.fachlichBestanden = true;
    }
  } catch (e) { fehler = /^EINORDNUNG_[A-Z_]+$/.test(e?.code || "") ? e.code : "EINORDNUNG_FACHLICH_ODER_TECHNISCH_ABGELEHNT"; }
  const envelope = T.verschluesseln({ result, fehler, fachlichBestanden: false, inProductionImportiert: false }, a.publicKey, ctx);
  emit({ typ: "36er-abschluss", envelope });
  await schreibe(x => { x.status = "gestoppt"; x.beendetAm = now().toISOString(); x.fehler = fehler; x.ergebnis = envelope; });
  return { ok: !fehler, status: "gestoppt", aufrufe: result.aufrufe, pfadfaelle: result.ergebnisse.length,
    fachlichBestanden: false, inProductionImportiert: false };
}

if (require.main === module) ausfuehren().then(r => { console.log(JSON.stringify(r)); if (!r.ok) process.exitCode = 1; })
  .catch(e => { console.error(JSON.stringify(frueheFehlerausgabe(e))); process.exitCode = 1; });

module.exports = { paket, eingabe, konfiguration, beurteile, pruefeKostenlage, kostenbeleg, ausfuehren,
  frueheFehlerausgabe, KEY, PREFIX, BRANCH, TAG, MAX_CALLS, MAX_OUTPUT_TOKENS, MAX_COST, MAX_MS, KI_TIMEOUT_MS,
  ALT_TICKET, NEU_TICKET, VORTAG };
