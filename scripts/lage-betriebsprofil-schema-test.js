"use strict";

// Echter Generator, Structured-JSON-Transport und Kostenabschluss; nur HTTPS und
// Persistenz sind lokale Attrappen. Kein Anbieter, keine Production-Daten.
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const https = require("node:https");
const storage = require("../lib/helmut/storage");
const control = require("../lib/helmut/anbieter-steuerung");
const ai = require("../lib/helmut/ai");
const B = require("../lib/helmut/betriebskosten-budget");
const Q = require("../lib/helmut/lage-textqualitaet");
const PROFILE = { id: "schema-alpha", committees: [" Arbeit   und Soziales ", "Arbeit und Soziales", "Testausschuss42", " "],
  deputyCommittees: ["Haushaltsausschuss"], focusTopics: ["Barrierefreiheit", "Testthema42"],
  constituency: "Wahlkreis Alpha", bundesland: "Berlin", governmentRole: "Opposition",
  party: "Partei Delta", faction: "Fraktion Delta", fullName: "Nicht als Mandatswert", unsupportedField: "Unerlaubter Wert" };
const SOURCES = [{ vorgang_id: "vg-test", quellenbelege: [{ quelle_id: "q-test", url: "https://example.org/entwurf",
  titel: "Die Quelle berichtet ueber einen Entwurf. Ein Termin ist noch nicht benannt.", quelle: "Test" }] }];
const BASE_SCHEMA = JSON.stringify(ai.LAGE_BRIEFING_SCHEMA);
const clone = structuredClone;
function draft(profile) {
  const ref = Q.mandatsbezugAuswahl(profile)[0] || { feld: "ausschuss", wert: "Unerlaubt" };
  return { paragraphs: ["Die Quelle berichtet ueber einen Entwurf.", "Ein Termin ist noch nicht benannt."].map(text => ({
    text, vorgang_ids: ["vg-test"], quelle_id: "q-test", mandatsbezug: clone(ref),
    auswahlbegruendung: `${ref.wert}: PRIVATE_AUSWAHL beschreibt die fachliche Passung.` })) };
}
function review(raw) {
  return { pruefungen: raw.paragraphs.map((p, absatz) => ({ absatz, quelle_id: "q-test", belegfeld: "titel",
    vollstaendig_belegt: true, themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt",
    pruefbegruendung: "Benannter Vorschlag mit Quellenbeleg.",
    mandatsbegruendung: `${p.mandatsbezug.wert}: Der Vorschlag betrifft die fachliche Aufgabe dieses Mandatsfeldes.` })),
  vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
    pruefbegruendung: "Der zweite Absatz nennt den noch offenen Termin als zusaetzliche Angabe." }] };
}
function matches(schema, ref) {
  return schema.anyOf.some(branch => Object.keys(ref).length === 2
    && branch.properties.feld.enum.includes(ref.feld) && branch.properties.wert.enum.includes(ref.wert));
}
async function run({ profile = PROFILE, operating = true, azure = true, changeDraft, changeReview } = {}) {
  const oldEnv = { ...process.env }, names = ["mutateAuthStore", "readAuthStore", "listFullProfiles", "reserveLlmCall", "recordLlmUsage"];
  const old = Object.fromEntries(names.map(name => [name, storage[name]]));
  const oldRequest = https.request, oldControl = control.steuerungAktiv;
  let auth = { llmUsage: [] }, queue = Promise.resolve();
  const bodies = [], wireBodies = [], logs = [], privateDraft = draft(profile);
  if (changeDraft) changeDraft(privateDraft);
  const privateReview = review(privateDraft);
  if (changeReview) changeReview(privateReview);
  const meta = { politicianId: profile.id, runId: "cron-schema-offline", briefingDatum: "2026-11-06T05:00:00.000Z" };
  let result, error;
  try {
    delete process.env[B.ENV]; delete process.env.HELMUT_TESTLAUF_KOMMUNIKATION;
    delete process.env.AZURE_OPENAI_KEY; delete process.env.AZURE_OPENAI_ENDPOINT;
    process.env.OPENAI_API_KEY = "offline"; process.env.HELMUT_UNDERSTANDING_MODEL = "gpt-5-mini";
    if (azure) Object.assign(process.env, { AZURE_OPENAI_KEY: "offline", AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
      AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini" });
    if (operating) process.env[B.ENV] = JSON.stringify({ version: 1, profileId: profile.id,
      startsAt: new Date(Date.now() - 60000).toISOString(), dailyLimitUsd: 1, totalLimitUsd: 30,
      route: { provider: "azure", responsesUrl: "https://offline.openai.azure.com/openai/v1/responses", model: "gpt-5-mini" } });
    storage.mutateAuthStore = change => {
      const pending = queue.then(async () => {
        const copy = clone(auth), value = await change(copy); auth = copy; return value;
      }); queue = pending.catch(() => {}); return pending;
    };
    storage.readAuthStore = async () => clone(auth);
    storage.listFullProfiles = async () => [profile];
    storage.reserveLlmCall = async () => ({ allowed: true }); control.steuerungAktiv = () => false;
    storage.recordLlmUsage = async info => {
      logs.push(info);
      const row = storage.buildLlmUsageRecord(info);
      await storage.mutateAuthStore(a => { a.llmUsage.push(row); });
      return { ...row, _ablage: { blob: true } };
    };
    https.request = (_url, _options, callback) => {
      const req = new EventEmitter(); let body;
      req.write = value => { wireBodies.push(value); body = JSON.parse(value); bodies.push(body); };
      req.destroy = () => {};
      req.end = () => setImmediate(() => {
        const response = new EventEmitter(); response.statusCode = 200; response.setEncoding = () => {};
        callback(response);
        const output = body.text.format.schema.properties.paragraphs ? privateDraft : privateReview;
        response.emit("data", JSON.stringify({ status: "completed", usage: { input_tokens: 100, output_tokens: 20 },
          output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] }));
        response.emit("end");
      }); return req;
    };
    try { result = await ai.generateLageBriefing(SOURCES, profile, meta); } catch (caught) { error = caught; }
    assert.equal(JSON.stringify(ai.LAGE_BRIEFING_SCHEMA), BASE_SCHEMA, "Geteiltes historisches Schema bleibt unveraendert");
    assert(!JSON.stringify(logs).includes("PRIVATE_AUSWAHL"), "Kein Modellrohtext im Kostenlog");
    return { result, error, bodies, wireBodies, auth, meta };
  } finally {
    https.request = oldRequest; control.steuerungAktiv = oldControl;
    for (const name of names) storage[name] = old[name];
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]; Object.assign(process.env, oldEnv);
  }
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
(async () => {
  await test("Betriebs-HTTPS bindet jedes Feld an dessen normierte echte Profilwerte", async () => {
    const r = await run(); assert.ifError(r.error); assert.equal(r.result.paragraphs.length, 2);
    assert.equal(r.bodies.length, 2); assert.equal(r.auth[B.KEY].bound, 260);
    const generator = r.bodies[0], schema = generator.text.format.schema;
    assert.equal(generator.text.format.strict, true);
    assert(!/\"(?:minItems|maxItems|const)\"\s*:/.test(JSON.stringify(schema)), "Azure-kompatible Schema-Schluessel");
    const ref = schema.properties.paragraphs.items.properties.mandatsbezug;
    assert.equal(ref.anyOf.length, 6);
    const actual = ref.anyOf.flatMap(branch => {
      assert.equal(branch.type, "object"); assert.equal(branch.additionalProperties, false);
      assert.deepEqual(branch.required, ["feld", "wert"]); assert.equal(branch.properties.feld.enum.length, 1);
      return branch.properties.wert.enum.map(wert => ({ feld: branch.properties.feld.enum[0], wert }));
    });
    assert.deepEqual(actual, Q.mandatsbezugAuswahl(PROFILE));
    assert(matches(ref, { feld: "ausschuss", wert: "Haushaltsausschuss" }), "Stellvertretungen sind vorhandener Profilkontext");
    assert(matches(ref, { feld: "partei", wert: "Fraktion Delta" }));
    for (const invalid of [{ feld: "ausschuss", wert: "Berlin" }, { feld: "fraktion", wert: "Fraktion Delta" },
      { feld: "ausschuss", wert: "Testausschuss42" }, { feld: "schwerpunkt", wert: "" },
      { feld: "unsupportedField", wert: "Unerlaubter Wert" }, { feld: "ausschuss", wert: "Nicht als Mandatswert" }])
      assert.equal(matches(ref, invalid), false);
    assert.deepEqual(r.bodies[1].text.format.schema, Q.SCHEMA, "Unabhaengiges Review bleibt unveraendert");
    assert(!JSON.stringify(r.result).includes("PRIVATE_AUSWAHL"));
  });
  await test("Wiederholte Generatoraufrufe isolieren Profile ohne Schema-Cache oder Vermischung", async () => {
    const second = { id: "schema-beta", committees: ["Wirtschaftsausschuss"], focusTopics: ["Digitale Wirtschaft"] };
    const a = await run(), b = await run({ profile: second }), again = await run();
    assert.ifError(a.error); assert.ifError(b.error); assert.ifError(again.error);
    const ref = r => r.bodies[0].text.format.schema.properties.paragraphs.items.properties.mandatsbezug;
    assert(!matches(ref(b), { feld: "ausschuss", wert: "Arbeit und Soziales" }));
    assert(!matches(ref(a), { feld: "ausschuss", wert: "Wirtschaftsausschuss" }));
    assert.deepEqual(ref(a), ref(again));
  });
  await test("Ohne erlaubte Profilwerte stoppt der Generator vor Kostenreserve und HTTPS", async () => {
    for (const profile of [{ id: PROFILE.id }, { id: PROFILE.id, committees: ["Testausschuss42", " "],
      focusTopics: ["Testthema42"], party: "Testpartei Alpha", unsupportedField: "Kein Mandatsbezug" }]) {
      const r = await run({ profile }); assert.equal(r.error?.grund, "ai-text-profile-reference");
      assert.equal(r.bodies.length, 0); assert.equal(r.auth[B.KEY], undefined); assert.deepEqual(r.auth.llmUsage, []);
    }
  });
  await test("Erzwungene ungueltige Modellantworten bleiben vor dem Review gesperrt, ohne Retry", async () => {
    for (const ref of [{ feld: "ausschuss", wert: "Berlin" }, { feld: "fraktion", wert: "Fraktion Delta" },
      { feld: "ausschuss", wert: "Fremder Ausschuss" }]) {
      const r = await run({ changeDraft: raw => { raw.paragraphs[0].mandatsbezug = ref; } });
      assert.equal(r.error?.grund, "ai-text-profile-reference"); assert.equal(r.bodies.length, 1);
      assert.equal(r.auth[B.KEY].bound, 130, "Bekannter Entwurfsaufruf bleibt korrekt abgerechnet");
    }
  });
  await test("Profil-Enum ersetzt weder Quellenbindung noch unabhaengiges Qualitaetsurteil", async () => {
    const unsupported = await run({ changeDraft: raw => { raw.paragraphs[0].text = "Die Quelle berichtet heute ueber einen Entwurf."; } });
    assert.equal(unsupported.error?.grund, "ai-text-source-support"); assert.equal(unsupported.bodies.length, 1);
    const negative = await run({ changeReview: raw => { raw.pruefungen[0].profilbezug = false; } });
    assert.equal(negative.error?.grund, "ai-text-source-support"); assert.equal(negative.bodies.length, 2);
    assert.equal(negative.result, undefined); assert.equal(negative.auth[B.KEY].bound, 260);
  });
  await test("Historische Azure-/OpenAI-Payloads und Promptbytes bleiben ohne Betriebsvertrag unveraendert", async () => {
    for (const azure of [true, false]) {
      const r = await run({ operating: false, azure }); assert.ifError(r.error);
      const schema = JSON.parse(BASE_SCHEMA);
      if (azure) { delete schema.properties.paragraphs.minItems; delete schema.properties.paragraphs.maxItems; }
      const expected = { model: "gpt-5-mini", input: ai.buildLageBriefingPrompt(SOURCES, PROFILE, r.meta),
        max_output_tokens: 3000, reasoning: { effort: "low" }, text: { format: {
          type: "json_schema", name: "knowledge_object", schema, strict: true } } };
      assert.equal(r.wireBodies[0], JSON.stringify(expected), "Historisches Generatorpaket bytegleich");
      assert.equal(r.auth[B.KEY], undefined);
    }
  });
  console.log(`${count}/${count} Betriebsprofil-Schema-Gruppen bestanden. Ausschliesslich offline.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
