"use strict";
const A = require("node:assert/strict"), C = require("node:crypto"), Z = require("node:zlib");
const { EventEmitter } = require("node:events");
const V = require("./prosa-referenzen-versuch");
const Rest = require("./prosa-restfaelle-versuch");
const Alt = require("./prosa-praemissen-versuch"), P = require("../lib/helmut/prosa-praemissenpruefung");
const F = require("./fixtures/prosa-praemissen"), T = require("./privater-nachweis-transport");
const { hash } = require("../lib/helmut/briefing-speicher");
const keys = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicKey = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const privateKey = keys.privateKey.export({ format: "pem", type: "pkcs8" });
const a = { commit: "a".repeat(40), productionCommit: "b".repeat(40), publicKey, paketHash: V.paket().paketHash };
const encode = x => V.PREFIX + Z.gzipSync(JSON.stringify(x)).toString("base64");
const zeit = new Date("2026-09-21T10:00:00Z");
function setup(change = {}) {
  const env = { CONFIRM_TEXT: encode(a), GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/" + V.BRANCH,
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: a.commit, GITHUB_RUN_ID: "123456789",
    HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main", HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth",
    VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
    HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200", HELMUT_ANBIETER_STEUERUNG: "on",
    HELMUT_ANBIETER_AZURE_MINUTE: "20", HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini", HELMUT_KI_TIMEOUT_MS: "30000",
    SUPABASE_URL: "https://ddckuvvpcytqbyfmbvie.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test", HELMUT_CRON_SECRET: "test",
    AZURE_OPENAI_KEY: "test", AZURE_OPENAI_ENDPOINT: "https://test.openai.azure.com/" };
  let auth = { prosaProfilvertrag20260921: { status: "gestoppt", runId: "nachlauf500-35575743755", ergebnis: "alter-Beleg" }, prosaEinordnung20260921: { status: "gestoppt", runId: "nachlauf500-35573253937", ergebnis: "unveraendert" }, sessions: [], auditEvents: [], systemErrors: [], dailyInputs: [], llmUsage: [], processRuns: [],
    testKostenTage: { [V.TAG]: { version: 1, day: V.TAG, tarif: "azure-gpt5-mini-obergrenze-20260909", limit: 4000000,
      spent: 0, baseline: 0, baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null } } };
  auth.prosaPraemissen20260921 = { status: "gestoppt", runId: "nachlauf500-35584480605",
    commit: "94ec4884b7508c1169904aaed3b322c8d5af02b4", paketHash: Alt.paket().paketHash,
    fehler: "EINORDNUNG_MODELLAUSGANG", phasen: [{ gruppe: 1, mandat: "synthetisch-praemissen-1",
      basisHash: P.binde(Alt.paket().gruppen[0].map(r => r.eingabe)).eingabeHash }] };
  const day = auth.testKostenTage[V.TAG]; day.manualCalls = 1;
  day.calls[V.ALT_TICKET] = { status: "ungeklaert", reserved: 212000, maxOutputTokens: 3000,
    manual: true, createdAt: zeit.toISOString(), bezug: { version: 1, runId: "nachlauf500-35584480605",
      phase: "pruefung", mandatHash: C.createHash("sha256").update(JSON.stringify("synthetisch-praemissen-1")).digest("hex") } };
  auth.prosaRestfaelle20260921 = { status: "gestoppt", runId: "nachlauf500-35587502308",
    commit: "58ef5fb4f663088fbba98fe985ba307e0bdcdb7d", paketHash: Rest.paket().paketHash,
    phasen: [{ gruppe: 1, status: "antwort-und-kosten-bestaetigt", kosten: 7589,
      basisHash: P.binde(Rest.paket().gruppen[0].map(r => r.eingabe)).eingabeHash }] };
  day.calls[V.REST_TICKET] = { status: "abgerechnet", reserved: 212000, maxOutputTokens: 3000,
    manual: true, cost: 7589, createdAt: zeit.toISOString(), bezug: { version: 1, runId: "nachlauf500-35587502308",
      phase: "pruefung", mandatHash: C.createHash("sha256").update(JSON.stringify("synthetisch-restfaelle-1")).digest("hex") } };
  day.spent = 7589; day.manualCalls = 2;
  let count = 2, reads = 0, writes = 0; const logs = [], calls = [];
  const storage = { readAuthStore: async () => { reads++; const x = structuredClone(auth); change.read?.(x, reads); return x; },
    mutateAuthStore: async fn => { const x = structuredClone(auth); await fn(x); writes++; change.write?.(x, writes); auth = x; },
    leseLlmTageszaehler: async () => ({ ok: true, used: count, limit: 2416 }) };
  const runtime = { ok: true, reinLesend: true, schemaVersion: 1, production: true, commit: a.productionCommit,
    storageSupabase: true, kommunikationGesperrt: true, kohortenQuellenGesperrt: true, tagesdeckel: 2416,
    understandingReserve: 702, vorrangreserveReal: 200, testKosten: { version: 2, aktiv: true, limitUsd: 4 } };
  const fetchFn = async (url, opts) => {
    A.equal(opts.method, "GET");
    const data = url.includes("testnachweis-status") ? structuredClone(runtime)
      : url.includes("mandate_profiles?") ? Array.from({ length: 504 }, (_, i) => ({ user_id: "test" + i, aktiv: false })) : [];
    change.fetch?.(url, data); return { status: 200, json: async () => data };
  };
  const ai = { understandingModelName: () => "gpt-5-mini", requestStructuredJson: async (prompt, schema, meta, model, options) => {
    count++; calls.push({ prompt, schema, meta, model, options });
    const u = { id: "usage" + count, runId: meta.runId, politicianId: meta.politicianId,
      callType: meta.callType, success: true, model, promptTokens: 100, completionTokens: 100 };
    const t = auth.testKostenTage[V.TAG]; t.manualCalls++; t.spent += 450;
    t.calls["call" + count] = { status: "abgerechnet", reserved: 212000, maxOutputTokens: 3000, manual: true,
      createdAt: zeit.toISOString(), cost: 450, bezug: { version: 1, runId: meta.runId,
        mandatHash: C.createHash("sha256").update(JSON.stringify(meta.politicianId)).digest("hex"), phase: meta.testKostenPhase } };
    auth.llmUsage = [u, ...auth.llmUsage].slice(0, 5000);
    const input = JSON.parse(prompt.split("PRUEFEINGABE: ")[1]);
    const corpus = F.corpus();
    let answer = { version: 1, eingabeHash: input.eingabeHash, faelle: input.faelle.map(f => {
      const soll = corpus.find(x => x.eingabe.id === f.id).erwartet;
      return { id: f.id, urteil: soll, begruendung: "Injizierte Testantwort, keine Modellleistung.",
        praemissen: f.saetze.map(s => ({ satz: s.index, behauptung: "Technischer Testbeleg.",
          art: "sachangabe", befund: soll === "tragfaehig" ? "getragen" : soll,
          belege: [{ referenz: f.quellen[0].id, zitat: f.quellen[0].text }] })) };
    }) };
    if (change.answer) answer = change.answer(answer, count, auth);
    return answer;
  } };
  const observe = async call => { let answer = null, failed = false;
    try { answer = await call(); } catch { failed = true; }
    const record = { requests: 1, complete: true, statusCode: 200, rawResponse: JSON.stringify({ answer }), responseHash: hash(answer) };
    change.transport?.(record); return { answer, failed, record }; };
  const deps = { env, storage, fetchFn, ai, observe, now: () => new Date(zeit), emit: r => logs.push(r) };
  return { deps, logs, calls, runtime, auth: () => auth, writes: () => writes,
    decode: envelope => T.entschluesseln(envelope, privateKey, { runId: env.GITHUB_RUN_ID, commit: a.commit,
      tag: V.TAG, abPosition: 1, anzahl: 1 }) };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  await test("Fester neuer Auftrag bindet nur10 ungesendete Sollfaelle, Code, Production und Empfaenger", () => {
    A.deepEqual(V.eingabe(encode(a)), a); A.equal(V.MAX_COST, 1060000);
    for (const x of [{ ...a, paketHash: "f".repeat(64) }, { ...a, commit: "main" }, { ...a, limit: 8 }])
      A.throws(() => V.eingabe(encode(x)));
    A.throws(() => V.eingabe("PROFILVERTRAG_EINMAL:" + encode(a).slice(V.PREFIX.length)));
  });
  await test("Fuenf Zweiergruppen,10 Vergleiche, vollstaendige Antwortsicherung und keine Produktfreigabe", async () => {
    const s = setup(), old1 = structuredClone(s.auth().prosaEinordnung20260921),
      old2 = structuredClone(s.auth().prosaProfilvertrag20260921);
    const out = await V.ausfuehren(s.deps); A.equal(out.ok, true, JSON.stringify(s.decode(s.auth()[V.KEY].ergebnis))); A.equal(s.calls.length, 5);
    A.deepEqual(s.calls.map(c => c.meta.testKostenPhase), Array(5).fill("pruefung"));
    A.deepEqual(s.calls.map(c => c.meta.politicianId), Array.from({length:5}, (_,i) => "synthetisch-referenzen-" + (i+1)));
    A(s.calls.every(c => c.options.strict && c.options.reasoningEffort === "low" && c.model === "gpt-5-mini"));
    A.deepEqual(s.auth().prosaEinordnung20260921, old1); A.deepEqual(s.auth().prosaProfilvertrag20260921, old2);
    const receipt = s.auth()[V.KEY]; A.equal(receipt.status, "gestoppt");
    for (const phase of receipt.phasen) {
      A.equal(phase.kosten, 450); A.equal(s.decode(phase.transport).record.complete, true);
      A.equal(hash(s.decode(phase.antwort).antwort), phase.antwortHash);
    }
    const result = s.decode(receipt.ergebnis).result;
    A.equal(result.urteile.length, 10); A.equal(result.restvergleichBestanden, true); A.equal(result.methodenvergleichBestanden, false); A.equal(result.ausgeschlosseneFaelle, 8);
    A.equal(result.produktabnahme, false); A.equal(out.fachlichBestanden, false);
    A.equal(out.inProductionImportiert, false);
    A(!JSON.stringify(s.logs).includes(F.corpus()[0].eingabe.einordnung));
    await A.rejects(V.ausfuehren(s.deps), /BEREITS_BEGONNEN/); A.equal(s.calls.length, 5);
  });
  await test("Jeder fachliche Fehlbefund stoppt nach gesicherter erster Gruppe ohne Retry", async () => {
    const s = setup({ answer(x) { for (const r of x.faelle) {
      r.urteil = r.urteil === "offen" ? "widersprochen" : "offen";
      for (const p of r.praemissen) p.befund = r.urteil;
    } return x; } });
    const out = await V.ausfuehren(s.deps); A.equal(out.ok, false); A.equal(s.calls.length, 1);
    const result = s.decode(s.auth()[V.KEY].ergebnis).result;
    A.equal(result.urteile.length, 2); A.equal(result.sollFaelle, 10);
    A.equal(result.urteile.filter(x => x.falschNegativ).length, V.paket().gruppen[0].filter(x => x.erwartet === "tragfaehig").length);
    A.equal(result.methodenvergleichBestanden, false); A.equal(s.auth()[V.KEY].status, "gestoppt");
  });
  await test("Unbrauchbare Struktur bleibt roh gesichert und erreicht keine weitere Gruppe", async () => {
    const s = setup({ answer: () => ({ faelle: [] }) });
    A.equal((await V.ausfuehren(s.deps)).ok, false); A.equal(s.calls.length, 1);
    A.deepEqual(s.decode(s.auth()[V.KEY].phasen[0].antwort).antwort, { faelle: [] });
  });
  await test("Alte Versuche muessen geschlossen sein und bleiben geschuetzt", async () => {
    for (const key of ["prosaEinordnung20260921", "prosaProfilvertrag20260921", "prosaPraemissen20260921", "prosaRestfaelle20260921"]) {
      const s = setup(); s.auth()[key].status = "begonnen";
      await A.rejects(V.ausfuehren(s.deps), /VORVERSUCH_OFFEN/); A.equal(s.calls.length, 0); A.equal(s.writes(), 0);
    }
    const s = setup({ answer(x, n, auth) { auth.prosaProfilvertrag20260921.ergebnis = "veraendert"; return x; } });
    A.equal((await V.ausfuehren(s.deps)).ok, false); A.equal(s.calls.length, 1);
  });
  await test("Falscher Branch, Wiederholung, Modell oder fremde Konfiguration scheitern vor dem Start", async () => {
    for (const [key, val] of [["GITHUB_REF", "refs/heads/main"], ["GITHUB_RUN_ATTEMPT", "2"],
      ["AZURE_OPENAI_DEPLOYMENT", "anderes"], ["OPENAI_API_KEY", "fremd"], ["NODE_OPTIONS", "fremd"], ["HELMUT_KI_TIMEOUT_MS", "20000"], ["HELMUT_KI_TIMEOUT_MS", "30001"]]) {
      const s = setup(); s.deps.env[key] = val; await A.rejects(V.ausfuehren(s.deps));
      A.equal(s.calls.length, 0); A.equal(s.writes(), 0);
    }
    const s = setup(); s.deps.now = () => new Date("2026-09-22T10:00:00Z");
    await A.rejects(V.ausfuehren(s.deps)); A.equal(s.writes(), 0);
  });
  await test("Aktive Profile, Leases, Jobs und falscher Productionstand verhindern den Vergleich", async () => {
    for (const path of ["testnachweis-status", "mandate_profiles?", "pipeline_locks?", "status=neq.erledigt", "helmut_verstehen_reservierungen?"]) {
      const s = setup({ fetch(url, data) { if (!url.includes(path)) return;
        if (path === "testnachweis-status") data.commit = "c".repeat(40);
        else if (path === "mandate_profiles?") data[0].aktiv = true; else data.push({ id: "lauf" }); } });
      await A.rejects(V.ausfuehren(s.deps)); A.equal(s.calls.length, 0); A.equal(s.writes(), 0);
    }
  });
  await test("Fehlende volle Reserve fuer fuenf Aufrufe, fehlender Tagesbeleg und fremde offene Reserve sperren", async () => {
    for (const mode of ["voll", "fehlt", "offen"]) {
      const s = setup(), t = s.auth().testKostenTage[V.TAG];
      if (mode === "fehlt") delete s.auth().testKostenTage[V.TAG];
      if (mode === "voll") { t.spent = t.baseline = 3500000; }
      if (mode === "offen") t.calls.alt = { status: "reserviert", reserved: 212000, createdAt: zeit.toISOString(), maxOutputTokens: 3000 };
      await A.rejects(V.ausfuehren(s.deps)); A.equal(s.calls.length, 0);
    }
  });
  await test("Fehlende Startquittung und nicht bestaetigter Antwortbeleg erlauben keinen weiteren Aufruf", async () => {
    let s = setup({ read(x, n) { if (n === 1) delete x[V.KEY]; } });
    await A.rejects(V.ausfuehren(s.deps)); A.equal(s.calls.length, 0);
    s = setup({ read(x) { if (x[V.KEY]?.phasen[0]?.transport) delete x[V.KEY].phasen[0].transport; } });
    await A.rejects(V.ausfuehren(s.deps)); A.equal(s.calls.length, 1); A(s.logs.some(x => x.typ === "einordnung-transport"));
  });
  await test("Kosten oder fremde gemeinsame Daten abweichend verhindern die zweite Gruppe", async () => {
    for (const edit of [a => a.llmUsage[0].politicianId = "fremd", a => a.sessions.push({ id: "fremd" }),
      a => a.testKostenTage[V.TAG].calls.call3.bezug.phase = "fremd"]) {
      const s = setup({ answer(x, n, auth) { edit(auth); return x; } });
      A.equal((await V.ausfuehren(s.deps)).ok, false); A.equal(s.calls.length, 1);
    }
  });
  await test("Schreibkonflikt darf fremden Zustand nicht ueberschreiben", async () => {
    const s = setup({ answer(x, n, auth) { auth[V.KEY].fremd = true; return x; } });
    await A.rejects(V.ausfuehren(s.deps), /SCHREIBKONFLIKT/);
    A.equal(s.calls.length, 1); A.equal(s.auth()[V.KEY].fremd, true);
  });
  await test("Unvollstaendige Rohantwort wird erhalten, ohne Wiederholung oder Folgegruppe", async () => {
    const s = setup({ transport(r) { r.complete = false; r.rawResponse = "unvollstaendig"; } });
    A.equal((await V.ausfuehren(s.deps)).ok, false); A.equal(s.calls.length, 1);
    A.equal(s.decode(s.auth()[V.KEY].phasen[0].transport).record.rawResponse, "unvollstaendig");
  });
  await test("Endliches Zeitfenster verhindert weitere Gruppe und laesst Quittung geschlossen", async () => {
    const s = setup(); s.deps.now = () => new Date(zeit.getTime() + (s.calls.length ? V.MAX_MS : 0));
    A.equal((await V.ausfuehren(s.deps)).ok, false); A.equal(s.calls.length, 1); A.equal(s.auth()[V.KEY].status, "gestoppt");
  });
  await test("Fuenf verdrängte Telemetriezeilen werden vor dem Start dauerhaft archiviert", async () => {
    const s = setup(); s.auth().llmUsage = Array.from({ length: 5000 }, (_, i) => ({ id: "alt" + i }));
    const tail = structuredClone(s.auth().llmUsage.slice(-5));
    A.equal((await V.ausfuehren(s.deps)).ok, true);
    A.deepEqual(s.auth()[V.KEY].archivierteAufruftelemetrie, tail);
    A.equal(s.auth().llmUsage.length, 5000); A.equal(s.auth().llmUsage.at(-1).id, "alt4994");
  });
  await test("Acht bereits gesendete Faelle bleiben auch bei neuem Commit ausgeschlossen", () => {
    const p = V.paket(), old = Rest.paket();
    A.deepEqual(p.ausgeschlossen, [...old.ausgeschlossen, ...old.gruppen[0]]); A.deepEqual(p.gruppen.flat(), old.gruppen.slice(1).flat());
    A(p.gruppen.every(g => g.length === 2));
    for (const prompt of p.prompts) for (const r of p.ausgeschlossen) A(!prompt.includes(r.eingabe.id));
    A.equal(p.gruppen.flat().filter(x => x.begruendung.includes("Run35575743755")).length, 2);
  });
  await test("Alte volle Reserve und Quittung bleiben waehrend neuer anderer Arbeit unveraendert", async () => {
    const s = setup(), ticket = structuredClone(s.auth().testKostenTage[V.TAG].calls[V.ALT_TICKET]),
      receipt = structuredClone(s.auth().prosaPraemissen20260921);
    A.equal((await V.ausfuehren(s.deps)).ok, true);
    A.deepEqual(s.auth().testKostenTage[V.TAG].calls[V.ALT_TICKET], ticket);
    A.deepEqual(s.auth().prosaPraemissen20260921, receipt);
  });
  await test("Freigegebene, fremde oder unvollstaendige Altreserve und fehlende Deckung stoppen vor Sendung", async () => {
    const edits = [s => delete s.testKostenTage[V.TAG].calls[V.ALT_TICKET],
      s => s.testKostenTage[V.TAG].calls[V.ALT_TICKET].reserved = 1,
      s => s.testKostenTage[V.TAG].calls[V.ALT_TICKET].status = "reserviert",
      s => s.testKostenTage[V.TAG].calls[V.ALT_TICKET].bezug.runId = "nachlauf500-12345678",
      s => { s.testKostenTage[V.TAG].baseline = 2720412; s.testKostenTage[V.TAG].spent = 2728001; },
      s => s.prosaPraemissen20260921.phasen.push({gruppe:2}),
      s => s.prosaPraemissen20260921.phasen[0].basisHash = "f".repeat(64)];
    for (const edit of edits) { const s = setup(); edit(s.auth()); await A.rejects(V.ausfuehren(s.deps)); A.equal(s.calls.length, 0); }
    const s = setup(); s.auth().testKostenTage[V.TAG].baseline = 2720411; s.auth().testKostenTage[V.TAG].spent = 2728000;
    A.equal((await V.ausfuehren(s.deps)).ok, true);
  });
  await test("Genau zwei alte gesendete Restfaelle und deren volle Quittung sind unveraenderlich", async () => {
    for (const edit of [a => a.prosaRestfaelle20260921.phasen.push({gruppe:2}),
      a => a.prosaRestfaelle20260921.phasen[0].basisHash = "f".repeat(64),
      a => a.testKostenTage[V.TAG].calls[V.REST_TICKET].cost = 0]) {
      const s = setup(); edit(s.auth()); await A.rejects(V.ausfuehren(s.deps)); A.equal(s.calls.length, 0);
    }
    const s = setup(), before = structuredClone(s.auth().prosaRestfaelle20260921),
      ticket = structuredClone(s.auth().testKostenTage[V.TAG].calls[V.REST_TICKET]);
    A.equal((await V.ausfuehren(s.deps)).ok, true);
    A.deepEqual(s.auth().prosaRestfaelle20260921, before);
    A.deepEqual(s.auth().testKostenTage[V.TAG].calls[V.REST_TICKET], ticket);
    A(s.calls.every(c => c.schema.properties.faelle.items.anyOf.length === 2));
  });
  console.log(`${passed}/${passed} Ausfuehrergruppen bestanden; keine Modellaufrufe.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
