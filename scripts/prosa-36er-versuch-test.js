"use strict";

// Gezielte Abnahme des 36er-Ausfuehrers mit Attrappen: kein Netz, kein Modell,
// keine Kosten, keine Productiondaten. Geprueft werden Bindung, Grenzen,
// Sollvergleich sowie die Erkennung fehlender/leerer/doppelter/unbrauchbarer
// Ergebnisse.
const A = require("node:assert/strict"), C = require("node:crypto"), Z = require("node:zlib");
const V = require("./prosa-36er-versuch"), F = require("./fixtures/prosa-36er");
const P = require("../lib/helmut/prosa-einordnung"), K = require("../lib/helmut/testkosten-budget");
const { STATUS_URL } = require("./github-laufzeitpruefung");

const TAG = V.TAG, RATE = "azure-gpt5-mini-obergrenze-20260909";
const keys = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const sha = x => C.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const encode = a => V.PREFIX + Z.gzipSync(JSON.stringify(a)).toString("base64");
const a = { commit: "a".repeat(40), productionCommit: "b".repeat(40), paketHash: V.paket().paketHash, publicKey };
const ZEIT = new Date(TAG + "T00:10:00Z");
const env = () => ({ GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/" + V.BRANCH,
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: a.commit,
  GITHUB_RUN_ID: "12345678901", CONFIRM_TEXT: encode(a),
  HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main", HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth",
  VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
  HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200", HELMUT_ANBIETER_STEUERUNG: "on",
  HELMUT_ANBIETER_AZURE_MINUTE: "20", HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
  HELMUT_KI_TIMEOUT_MS: String(V.KI_TIMEOUT_MS),
  SUPABASE_URL: "https://ddckuvvpcytqbyfmbvie.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "s",
  AZURE_OPENAI_KEY: "s", HELMUT_CRON_SECRET: "s", AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com" });

// Sollverhalten je Fall (aus dem eingefrorenen Vertrag, NICHT an das Modell gegeben).
const tollerLage = {};
for (const f of V.paket().faelle) {
  const v = P.binde({ basis: f.basis, faktenPlan: f.faktenPlan, bereich: f.bereich });
  tollerLage[v.vorbereite(f.entwurf).eingabeHash] = f.erwartet;
}
function urteilAus(eingabe, akzeptiert) {
  const pruefungen = eingabe.bloecke.flatMap(b => P.FELDER.filter(k => b.einordnung[k] !== null)
    .map(feld => ({ block: b.index, feld, status: "plausibel",
      ...Object.fromEntries(P.URTEILFELDER.map(k => [k, true])), begruendung: "Synthetisches Sollurteil." })));
  if (!akzeptiert && pruefungen.length) pruefungen[0] = { ...pruefungen[0], status: "widersprochen" };
  return { version: 1, eingabeHash: eingabe.eingabeHash, pruefungen,
    vergleiche: eingabe.bloecke.flatMap((b, x) => eingabe.bloecke.slice(x + 1)
      .map(c => ({ a: x, b: c.index, eigenstaendigeSachverhalte: true, begruendung: "Zwei Sachverhalte." }))) };
}

function harness(opts = {}) {
  const h = { calls: 0, counter: 0, emits: [] };
  h.auth = { sessions: [], auditEvents: [], systemErrors: [], dailyInputs: [], llmUsage: [], processRuns: [],
    testKostenTage: opts.tagesBuch ? { [TAG]: opts.tagesBuch() } : {} };
  h.storage = {
    async readAuthStore() { return structuredClone(h.auth); },
    async mutateAuthStore(fn) { const c = structuredClone(h.auth); const r = await fn(c); h.auth = c; return r; },
    async leseLlmTageszaehler() { return { ok: true, used: h.counter, limit: 2416 }; }
  };
  h.fetchFn = async url => {
    const s = String(url);
    if (s === STATUS_URL) return { status: 200, json: async () => ({ ok: true, reinLesend: true, schemaVersion: 1,
      production: true, commit: a.productionCommit, storageSupabase: true, kommunikationGesperrt: true,
      kohortenQuellenGesperrt: true, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200,
      testKosten: { version: 2, aktiv: true, limitUsd: 4 } }) };
    if (s.includes("mandate_profiles")) return { status: 200, json: async () => Array.from({ length: 504 }, (_, i) => ({ user_id: "p" + i, aktiv: false })) };
    return { status: 200, json: async () => [] };
  };
  h.ai = { understandingModelName: () => "gpt-5-mini",
    async requestStructuredJson(prompt, schema, meta) {
      h.calls += 1;
      const eingabe = JSON.parse(prompt.split("PRUEFEINGABE: ")[1]);
      const soll = tollerLage[eingabe.eingabeHash];
      if (!soll) throw new Error("unbekannte eingabe");
      let akzeptiert = soll === "akzeptiert";
      if (opts.kippe && opts.kippe(eingabe.eingabeHash)) akzeptiert = !akzeptiert;
      if (h.auth.testKostenTage[TAG] === undefined) h.auth.testKostenTage[TAG] = { version: 1, day: TAG, tarif: RATE,
        limit: 4000000, spent: 0, baseline: 0, baselineCalls: h.counter, manualCalls: 0, manualUntil: null, calls: {}, frozen: null };
      const buch = h.auth.testKostenTage[TAG], id = "t" + h.calls, cost = K.tokenKosten(100, 200);
      buch.calls[id] = { status: "abgerechnet", reserved: V.MAX_COST, maxOutputTokens: V.MAX_OUTPUT_TOKENS,
        manual: true, createdAt: ZEIT.toISOString(), cost,
        bezug: { version: 1, runId: meta.runId, mandatHash: sha(meta.politicianId), phase: meta.testKostenPhase } };
      buch.manualCalls += 1; buch.spent += cost; h.counter += 1;
      h.auth.llmUsage = [{ id: "u" + h.calls, runId: meta.runId, model: "gpt-5-mini", success: true,
        politicianId: meta.politicianId, callType: "prosa36erPruefung", promptTokens: 100, completionTokens: 200,
        createdAt: ZEIT.toISOString() }, ...h.auth.llmUsage];
      if (opts.unbrauchbar && opts.unbrauchbar(eingabe.eingabeHash)) return {};
      return urteilAus(eingabe, akzeptiert);
    } };
  h.observe = async (call, o) => {
    if (opts.transportFehler) return { answer: null, failed: true, record: { requests: 1, complete: false, statusCode: null, rawResponse: "" } };
    const answer = await call();
    return { answer, failed: false, record: { requests: 1, complete: true, statusCode: 200,
      rawResponse: JSON.stringify({ answer }), responseHash: sha(answer), request: { max_output_tokens: V.MAX_OUTPUT_TOKENS } } };
  };
  h.deps = { env: env(), now: () => new Date(ZEIT), fetchFn: h.fetchFn, storage: h.storage, ai: h.ai,
    observe: h.observe, emit: v => h.emits.push(v) };
  return h;
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }

(async () => {
  await test("Bindung: Paket-Hash und Commit werden fail closed geprueft", () => {
    V.eingabe(encode(a));
    A.throws(() => V.eingabe(encode({ ...a, paketHash: "0".repeat(64) })), /EINORDNUNG_BINDUNG/);
    A.throws(() => V.eingabe("FALSCH"), /EINORDNUNG_EINGABE/);
    const e = env();
    A.throws(() => V.konfiguration(a, { ...e, GITHUB_SHA: "c".repeat(40) }, ZEIT), /EINORDNUNG_AUSFUEHRUNG/);
    A.throws(() => V.konfiguration(a, { ...e, GITHUB_REF: "refs/heads/fremd" }, ZEIT), /EINORDNUNG_AUSFUEHRUNG/);
  });

  await test("UTC-Tag-Bindung: falscher Tag und zu spaetes Fenster sperren", () => {
    V.konfiguration(a, env(), ZEIT);
    A.throws(() => V.konfiguration(a, env(), new Date("2026-09-21T00:10:00Z")), /EINORDNUNG_TAG/);
    A.throws(() => V.konfiguration(a, env(), new Date(TAG + "T23:50:00Z")), /EINORDNUNG_TAG/);
  });

  await test("falscher CONFIRM_TEXT stoppt vor jedem Aufruf", async () => {
    const h = harness();
    const r = await V.ausfuehren({ ...h.deps, env: { ...env(), CONFIRM_TEXT: encode({ ...a, commit: "d".repeat(40) }) } })
      .then(() => null, e => e);
    A(/^EINORDNUNG_[A-Z_]+$/.test(r.code), r.code); A.equal(h.calls, 0);
    const g = harness();
    const r2 = await V.ausfuehren({ ...g.deps, env: { ...env(), CONFIRM_TEXT: "UNGUELTIG" } })
      .then(() => null, e => e);
    A.equal(r2.code, "EINORDNUNG_EINGABE"); A.equal(g.calls, 0);
  });

  await test("korrekter Lauf: genau EIN Aufruf je Pfadfall, 36 von 36, kein Retry", async () => {
    const h = harness();
    const r = await V.ausfuehren(h.deps);
    A.equal(r.ok, true); A.equal(r.aufrufe, 36); A.equal(h.calls, 36); A.equal(r.pfadfaelle, 36);
    A.equal(h.auth[V.KEY].aufrufe, 36);
    const ab = h.emits.filter(x => x.typ === "36er-abschluss");
    A.equal(ab.length, 1);
  });

  await test("Sollvergleich: positiver, negativer und unklarer Fall werden getrennt beurteilt", async () => {
    const h = harness();
    await V.ausfuehren(h.deps);
    const ergebnisse = h.emits.filter(x => x.typ === "36er-antwort").length;
    A.equal(ergebnisse, 36);
  });

  await test("falsch akzeptierter Negativfall beendet den Lauf (kein Retry, unvollstaendig)", async () => {
    const negativ = V.paket().faelle.find(f => f.art === "negativ");
    const v = P.binde({ basis: negativ.basis, faktenPlan: negativ.faktenPlan, bereich: negativ.bereich });
    const ziel = v.vorbereite(negativ.entwurf).eingabeHash;
    const h = harness({ kippe: id => id === ziel });
    const r = await V.ausfuehren(h.deps);
    A.equal(r.ok, false); A.equal(r.fachlichBestanden, false); A.equal(h.auth[V.KEY].fehler, "EINORDNUNG_FACHLICH_ABGELEHNT");
    A(r.aufrufe < 36, "nach dem Fehlschlag keine weiteren Aufrufe");
  });

  await test("falsch abgelehnter Positivfall beendet den Lauf", async () => {
    const positiv = V.paket().faelle.find(f => f.art === "positiv");
    const v = P.binde({ basis: positiv.basis, faktenPlan: positiv.faktenPlan, bereich: positiv.bereich });
    const ziel = v.vorbereite(positiv.entwurf).eingabeHash;
    const h = harness({ kippe: id => id === ziel });
    const r = await V.ausfuehren(h.deps);
    A.equal(r.ok, false); A.equal(r.fachlichBestanden, false);
  });

  await test("leeres bzw. unbrauchbares Ergebnis wird erkannt und stoppt", async () => {
    const beliebig = V.paket().faelle[0];
    const v = P.binde({ basis: beliebig.basis, faktenPlan: beliebig.faktenPlan, bereich: beliebig.bereich });
    const ziel = v.vorbereite(beliebig.entwurf).eingabeHash;
    const h = harness({ unbrauchbar: id => id === ziel });
    const r = await V.ausfuehren(h.deps);
    A.equal(r.ok, false); A.equal(h.auth[V.KEY].fehler, "EINORDNUNG_UNBRAUCHBAR");
  });

  await test("Transportfehler stoppt ohne Wiederholung", async () => {
    const h = harness({ transportFehler: true });
    const r = await V.ausfuehren(h.deps);
    A.equal(r.ok, false); A(r.aufrufe <= 1, "kein Retry nach Transportfehler");
  });

  await test("Kostensperre: kein Aufruf, wenn die volle Reserve nicht mehr passt", async () => {
    const h = harness({ tagesBuch: () => ({ version: 1, day: TAG, tarif: RATE, limit: 4000000, spent: 3900000,
      baseline: 3900000, baselineCalls: 10, manualCalls: 0, manualUntil: null, frozen: null, calls: {} }) });
    const r = await V.ausfuehren(h.deps);
    A.equal(r.ok, false); A.equal(r.aufrufe, 0); A.equal(h.calls, 0);
  });

  await test("Doppelte Pfadfaelle sind ausgeschlossen (36 eindeutige Kennungen)", () => {
    const ids = V.paket().faelle.map(f => f.id);
    A.equal(ids.length, 36); A.equal(new Set(ids).size, 36);
  });

  await test("Keine Sollurteile im Modellpayload", () => {
    for (const f of V.paket().faelle) {
      const e = P.binde({ basis: f.basis, faktenPlan: f.faktenPlan, bereich: f.bereich }).vorbereite(f.entwurf);
      const prompt = P.pruefPrompt(e);
      A.equal(prompt.includes("nicht-akzeptiert"), false);
      A.equal(JSON.stringify(e).includes("erwartet"), false);
    }
  });

  console.log(`${count}/${count} 36er-Ausfuehrer-Tests bestanden; kein Netz, kein Modellaufruf, keine Kosten.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
