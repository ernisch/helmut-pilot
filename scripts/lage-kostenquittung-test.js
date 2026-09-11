"use strict";

// Echter KI-HTTP-Abschluss mit injiziertem Transport und Speicherrueckgabe.
// Kein Netzwerk, keine Production-Daten, kein kostenpflichtiger Modellaufruf.
const assert = require("assert/strict");
const { EventEmitter } = require("events");
const https = require("https");
const storage = require("../lib/helmut/storage");
const anbieter = require("../lib/helmut/anbieter-steuerung");
const ai = require("../lib/helmut/ai");
const original = { request: https.request, reserve: storage.reserveLlmCall,
  record: storage.recordLlmUsage, aktiv: anbieter.steuerungAktiv };
const env = { ...process.env };
const tick = () => new Promise(resolve => setImmediate(resolve));
const paragraphs = [
  { text: "Die Quelle berichtet ueber einen Entwurf.", vorgang_ids: ["vg-test"] },
  { text: "Ein Termin ist noch nicht benannt.", vorgang_ids: ["vg-test"] }
];
const vorgaenge = [{ vorgang_id: "vg-test", quellenbelege: [{ quelle_id: "q-test",
  titel: "Die Quelle berichtet ueber einen Entwurf. Ein Termin ist noch nicht benannt.", quelle: "Test" }] }];
const review = { pruefungen: paragraphs.map((p, absatz) => ({ absatz, quelle_id: "q-test", belegfeld: "titel",
  vollstaendig_belegt: true, themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt", pruefbegruendung: "Benannter Vorschlag mit Quellenbeleg und Bezug zum Ausschuss." })),
  vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: "Der zweite Absatz nennt den noch offenen Termin als zusaetzliche Angabe." }] };
const mitAuswahl = paragraphs.map(p => ({ ...p, auswahl: { quelle_id: "q-test", mandatsfeld: "ausschuesse",
  mandatswert: "Arbeit und Soziales", begruendung: "Der benannte Entwurf betrifft den fachlichen Ausschuss." } }));
const beleg = { _ablage: { blob: true } };
let checks = 0;

async function fall({ mode = "success", output = JSON.stringify({ paragraphs: mitAuswahl }),
  status = "completed", http = 200, receipt = beleg, rejectReceipt = false, budget = true,
  expected = null, fortsetzen = false, reviewResult = review } = {}) {
  let requests = 0, reservations = 0, logs = [], release;
  const bodies = [];
  const gate = new Promise(resolve => { release = resolve; });
  storage.reserveLlmCall = async () => { reservations++; return { allowed: budget, reason: "daily-llm-budget-reached" }; };
  storage.recordLlmUsage = async info => {
    logs.push(info);
    await gate;
    if (rejectReceipt) throw new Error("GEHEIMER_SPEICHERFEHLER");
    return receipt;
  };
  https.request = (_url, _options, cb) => {
    requests++;
    const thisOutput = requests === 1 && !fortsetzen ? output : JSON.stringify(reviewResult);
    if (mode === "construction") throw new Error("GEHEIMER_AUFBAUFEHLER");
    const req = new EventEmitter();
    req.write = body => { if (mode === "send") throw new Error("GEHEIMER_SEND_FEHLER"); bodies.push(JSON.parse(body)); };
    req.destroy = error => { if (mode === "timeout") req.emit("error", error); };
    req.end = () => setImmediate(() => {
      if (mode === "timeout") { req.emit("timeout"); return; }
      if (mode === "network") { req.emit("error", new Error("GEHEIMER_NETZFEHLER")); return; }
      const res = new EventEmitter();
      res.statusCode = http;
      res.setEncoding = () => {};
      res.destroy = () => { res.emit("aborted"); req.emit("error", new Error("GEHEIMER_FEHLER")); };
      cb(res);
      if (mode === "aborted") { res.destroy(); res.emit("error", new Error("GEHEIMER_STREAM")); return; }
      res.emit("data", JSON.stringify({ status, usage: { input_tokens: 20, output_tokens: 10 },
        output: mode === "malformed" ? {} : [{ content: [{ type: "output_text", text: thisOutput }] }] }));
      res.emit("end");
      // Spaetes Netzwerkereignis darf keine zweite Quittung erzeugen.
      req.emit("error", new Error("GEHEIMER_SPAETFEHLER"));
    });
    return req;
  };
  let settled = false;
  const drafts = [], reviews = [];
  const result = ai.generateLageBriefing(vorgaenge, { committees: ["Arbeit und Soziales"] }, { politicianId: "test-kohorte-b-023",
    gespeicherterEntwurf: fortsetzen ? { paragraphs } : undefined,
    onDraft: async value => { assert.equal(logs.length,fortsetzen ? 0 : 1); assert.equal(requests,fortsetzen ? 0 : 1); drafts.push(value); },
    onReview: async value => { assert.equal(logs.length,fortsetzen ? 1 : 2); assert.equal(requests,fortsetzen ? 1 : 2); reviews.push(value); } })
    .then(value => ({ value }), error => ({ error })).then(r => { settled = true; return r; });
  await tick(); await tick();
  if (budget) assert.equal(settled, false, "Kein Abschluss vor Kostenquittung");
  assert.equal(requests, budget ? 1 : 0, "Genau ein Modellversuch oder Budgetstopp");
  assert.equal(reservations, 1);
  assert.equal(logs.length, 1, "Genau ein Nutzungsbeleg trotz mehrfacher Transportereignisse");
  release();
  const r = await result;
  if (expected === "budget") assert.equal(r.error?.code, "LLM_BUDGET_EXHAUSTED");
  else if (expected) {
    assert.equal(r.error?.code, "LAGE_AI_FAILURE");
    assert.equal(r.error?.grund, expected);
  } else { assert.equal(r.value?.paragraphs.length, 2);
    assert(r.value.paragraphs.every(p => !Object.hasOwn(p, "auswahl")), "Private Auswahl nicht in der App"); }
  assert(!JSON.stringify(r).includes("GEHEIMER"), "Diagnose verrät keinen Rohtext");
  assert(!JSON.stringify(logs).includes("GEHEIMER"), "Kostenlog verrät keinen Rohtext");
  assert.equal(requests, budget ? (expected || fortsetzen ? 1 : 2) : 0, "Gesicherter Entwurf braucht nur den Quellenpruefer; kein Retry");
  assert.equal(logs.length, expected || fortsetzen ? 1 : 2, "Jeder Modellversuch hat seinen eigenen Kostenbeleg");
  if (mode === "timeout") {
    assert.equal(logs[0].error, "request-error:ETIMEDOUT", "Zeitueberschreitung bleibt eindeutig protokolliert");
    assert.equal(logs[0].success, false);
    assert.equal(logs[0].usage, undefined, "Keine erfundenen Token nach verlorenem Ausgang");
  }
  if (!expected) {
    assert.equal(drafts.length,1); assert.equal(reviews.length,1); assert.deepEqual(reviews[0],review);
    if (!fortsetzen) assert.equal(bodies[0].text.format.strict, false, "Andere Schemavertraege bleiben unveraendert");
    const reviewBody = bodies[fortsetzen ? 0 : 1];
    assert.equal(reviewBody.reasoning?.effort, "low", "Der Quellenpruefer braucht eigenen Denkaufwand fuer den vollstaendigen Mandatsvergleich");
    assert.equal(reviewBody.max_output_tokens, 3000, "Reasoning und sichtbare Antwort teilen dieselbe unveraenderte Obergrenze");
    if (!fortsetzen) {
      assert.equal(bodies[0].reasoning?.effort, "minimal", "Nur das Review aendert seinen Aufwand");
      assert.equal(bodies[0].max_output_tokens, 3000);
    }
    assert.equal(reviewBody.text.format.strict, true, "Der Quellenpruefer muss alle Pflichtfelder liefern");
    const schema = reviewBody.text.format.schema;
    assert.deepEqual([...schema.required].sort(), ["pruefungen", "vergleiche"], "Derselbe Review-Aufruf verlangt alle Absatzvergleiche");
    const pairItem = schema.properties.vergleiche.items;
    assert.deepEqual([...pairItem.required].sort(), Object.keys(pairItem.properties).sort());
    assert.equal(pairItem.additionalProperties, false);
    assert.equal(pairItem.properties.eigenstaendige_sachverhalte.type, "boolean");
    assert(!/\"(?:minLength|maxLength|pattern|format)\"\s*:/.test(JSON.stringify(schema)), "Azure Strict Schema nutzt nur unterstuetzte Schluessel");
    const item = schema.properties.pruefungen.items;
    assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.properties.belegfeld.enum, ["titel", "auszug"]);
  }
  if (expected === "ai-text-visible-id") assert.equal(drafts.length,1,"Auch fachlich verworfener Entwurf bleibt privat pruefbar");
  if (expected === "ai-cost-receipt-missing") assert.equal(drafts.length,0,"Kein Entwurfsbeleg ohne bestaetigte Kostenquittung");
  checks++;
}

(async () => {
  delete process.env.AZURE_OPENAI_KEY;
  delete process.env.AZURE_OPENAI_ENDPOINT;
  process.env.OPENAI_API_KEY = "offline-dummy";
  anbieter.steuerungAktiv = () => false;
  await fall();
  await fall({ output: JSON.stringify({ paragraphs }), expected: "ai-text-source-reference" });
  await fall({ output: JSON.stringify({ paragraphs: mitAuswahl.map(p => ({...p, auswahl:{...p.auswahl, quelle_id:"q-fremd"}})) }), expected: "ai-text-source-reference" });
  await fall({ receipt: null, expected: "ai-cost-receipt-missing" });
  await fall({ receipt: { _ablage: { blob: false, relational: true } }, expected: "ai-cost-receipt-missing" });
  await fall({ rejectReceipt: true, expected: "ai-cost-receipt-missing" });
  await fall({ mode: "network", expected: "ai-provider-unavailable" });
  await fall({ mode: "timeout", expected: "ai-provider-unavailable" });
  await fall({ mode: "aborted", expected: "ai-provider-unavailable" });
  await fall({ mode: "send", expected: "ai-provider-unavailable" });
  await fall({ mode: "construction", expected: "ai-provider-unavailable" });
  await fall({ http: 429, expected: "ai-provider-http-429" });
  await fall({ status: "incomplete", expected: "ai-response-incomplete" });
  await fall({ output: "GEHEIMER_UNGUELTIGER_MODELLTEXT", expected: "ai-response-invalid-json" });
  await fall({ mode: "malformed", expected: "ai-response-invalid-json" });
  await fall({ output: JSON.stringify({ paragraphs: paragraphs.slice(0, 1) }), expected: "ai-text-paragraph-count" });
  await fall({ output: JSON.stringify({ paragraphs: [
    { text: "wort ".repeat(251), vorgang_ids: ["vg-test"] }, paragraphs[1]
  ] }), expected: "ai-text-word-limit" });
  await fall({ output: JSON.stringify({ paragraphs: [
    { text: "Belegter Text", vorgang_ids: ["vg-fremd"] }, paragraphs[1]
  ] }), expected: "ai-text-source-reference" });
  await fall({ output: JSON.stringify({ paragraphs: [
    { text: "Siehe vg-test", vorgang_ids: ["vg-test"] }, paragraphs[1]
  ] }), expected: "ai-text-visible-id" });
  await fall({ output: JSON.stringify({ paragraphs: [
    { text: { inhalt: "Kein String" }, vorgang_ids: ["vg-test"] }, paragraphs[1]
  ] }), expected: "ai-text-empty-or-type" });
  await fall({ output: JSON.stringify({ paragraphs: [
    { text: "   ", vorgang_ids: ["vg-test"] }, paragraphs[1]
  ] }), expected: "ai-text-empty-or-type" });
  await fall({ budget: false, expected: "budget" });
  await fall({ fortsetzen: true });
  await fall({ fortsetzen: true, budget: false, expected: "budget" });
  await fall({ fortsetzen: true, reviewResult: {pruefungen:review.pruefungen.map(r=>({...r,profilbezug:false}))},
    expected: "ai-text-source-support" });
  console.log(`${checks} PASS: Quittierung, Fehlerklassen, kein Retry, Absatzvertrag`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  https.request = original.request;
  storage.reserveLlmCall = original.reserve;
  storage.recordLlmUsage = original.record;
  anbieter.steuerungAktiv = original.aktiv;
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
});
