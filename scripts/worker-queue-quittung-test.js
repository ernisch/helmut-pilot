"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const dispatch = require("../lib/helmut/job-dispatch");
const pipeline = require("../lib/helmut/scalable-pipeline");
const storage = require("../lib/helmut/storage");
const worker = require("../lib/helmut/worker-betrieb");
const { runCronUeberWarteschlange } = require("../lib/helmut/quellen-warteschlangenlauf");
const { verarbeiteWecksignal } = require("../lib/helmut/queue-verbraucher");
const lambda = require("../lib/helmut/lambda-verbraucher");

const id = "123e4567-e89b-42d3-a456-426614174000";
const auftrag = { id, job_type: "source_fetch", attempts: 1, max_attempts: 3 };
const payload = { jobId: id, schemaVersion: 1 };
const vertagungsHandler = async () => ({ zurueckgestellt: true, grund: "synthetische-vorbedingung" });

async function auftragsausgang(zurueckstellen, job = auftrag) {
  return pipeline.fuehreAuftragAus({ auftrag: job, besitzer: "worker",
    deps: { env: {}, now: Date.now, handler: { source_fetch: vertagungsHandler },
      zurueckstellen, finish: async () => assert.fail("Vertagung darf kein Finish schreiben") } });
}

async function laufquittung(t, bilanz, verfuegbar = true) {
  const quittungen = [];
  t.mock.method(storage, "schreibeWarteschlangenLaufquittung", async eintrag => {
    quittungen.push(eintrag);
    return { ok: true };
  });
  t.mock.method(pipeline, "setzePlanungFort", async () => ({ ok: true, ausstehend: 0, tagesplan: {} }));
  t.mock.method(pipeline, "betriebsstatus", async () => ({ zustand: "test" }));
  t.mock.method(dispatch, "abgleich", async () => ({}));
  t.mock.method(dispatch, "versendeAbsichten", async () => ({}));
  t.mock.method(worker, "durchlauf", async () => ({ ...bilanz, bilanzen: [{ ...bilanz, verfuegbar }] }));
  const ergebnis = await runCronUeberWarteschlange("crawl", { arbeitsfenster: {} });
  assert.equal(quittungen.length, 2);
  assert.equal(quittungen[1].status, ergebnis.lauftelemetrie.status);
  return { ergebnis, abschluss: quittungen[1] };
}

function wecksignalDeps({ claimById, source_fetch, zurueckstellen, erneutVorlegen }) {
  return {
    konfiguration: false, waehleAntrieb: () => ({ antrieb: "ereignis" }), relay: false, claimById, erneutVorlegen,
    handlerDeps: { env: {}, klassen: {}, handler: { source_fetch }, zurueckstellen,
      finish: async () => assert.fail("Vertagung darf kein Finish schreiben") }
  };
}

test("Bestätigte Vertagung zählt und ergibt success", async t => {
  const r = await auftragsausgang(async () => ({ verfuegbar: true, uebernommen: true }));
  assert.equal(r.ausgang, "zurueckgestellt");
  const { ergebnis, abschluss } = await laufquittung(t, { ...r.bilanz, reserviert: 1 });
  assert.equal(ergebnis.ok, true);
  assert.equal(abschluss.status, "success");
  assert.equal(abschluss.deferred, 1);
});

test("HTTP 521 am echten Speicheradapter wird nur bei belegtem Jobstand aufgefangen", async t => {
  const fakeUrl = "https://vertagung.test.invalid";
  const env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = fakeUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "lokaler-testschluessel";
  t.after(() => {
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  });
  for (const [fall, pfad, erwartet] of [
    ["bereits-vertagt", ["POST", "GET"], true],
    ["noch-eigene-lease", ["POST", "GET", "POST"], true],
    ["erneute-antwort-verloren", ["POST", "GET", "POST", "GET"], true],
    ["fremde-lease", ["POST", "GET"], false],
    ["abgelaufene-lease", ["POST", "GET"], false],
    ["fremdes-mandat", ["POST", "GET"], false],
    ["alter-stand", ["POST", "GET"], false],
    ["anderer-grund", ["POST", "GET"], false],
    ["falsche-faelligkeit", ["POST", "GET"], false],
    ["anderer-versuch", ["POST", "GET"], false],
    ["lesefehler", ["POST", "GET"], false],
    ["abgelehnt", ["POST"], false]
  ]) {
    const mandat = fall === "noch-eigene-lease" ? "synthetisches-mandat" : null;
    const methoden = [];
    let row = { id, tenant_id: mandat, status: "laeuft", lease_owner: "worker",
      lease_expires_at: new Date(Date.now() + 60000).toISOString(), attempts: 1 };
    const vertage = (body, zeit = Date.now()) => {
      row = { ...row, status: "wartend", lease_owner: null, lease_expires_at: null, attempts: 0,
        updated_at: new Date(zeit).toISOString(), due_at: new Date(zeit + body.p_delay_ms).toISOString(),
        last_error: "zurueckgestellt: " + body.p_grund };
    };
    const fetch = t.mock.method(globalThis, "fetch", async (adresse, options) => {
      const url = new URL(adresse);
      assert.equal(url.origin, fakeUrl);
      const methode = options.method || "GET";
      methoden.push(methode);
      if (methode === "GET") {
        assert.equal(url.pathname, "/rest/v1/helmut_jobs");
        assert.equal(url.searchParams.get("id"), "eq." + id);
        assert.equal(url.searchParams.get("tenant_id"), mandat === null ? "is.null" : "eq." + mandat);
        assert.equal(url.searchParams.get("limit"), "2");
        if (fall === "lesefehler") return new Response("", { status: 521 });
        return Response.json([row]);
      }
      assert.equal(url.pathname, "/rest/v1/rpc/helmut_defer_job");
      const body = JSON.parse(options.body);
      assert.equal(body.p_owner, "worker");
      assert.equal(body.p_id, id);
      if (fall === "abgelehnt") return Response.json([{ uebernommen: false, neue_faelligkeit: null }]);
      if (methoden.length === 1) {
        if (["bereits-vertagt", "alter-stand", "anderer-grund", "falsche-faelligkeit", "anderer-versuch"].includes(fall)) {
          vertage(body, Date.now() - (fall === "alter-stand" ? 60000 : 0));
          if (fall === "anderer-grund") row.last_error = "zurueckgestellt: fremder-grund";
          if (fall === "falsche-faelligkeit") row.due_at = row.updated_at;
          if (fall === "anderer-versuch") row.attempts = 1;
        }
        if (fall === "fremde-lease") row.lease_owner = "anderer-worker";
        if (fall === "abgelaufene-lease") row.lease_expires_at = new Date(Date.now() - 1000).toISOString();
        if (fall === "fremdes-mandat") row.tenant_id = "fremdes-mandat";
        return new Response("", { status: 521 });
      }
      vertage(body);
      if (fall === "erneute-antwort-verloren") return new Response("", { status: 521 });
      return Response.json([{ uebernommen: true, neue_faelligkeit: row.due_at }]);
    });
    try {
      const r = await auftragsausgang(pipeline.workerDeps().zurueckstellen, { ...auftrag, tenant_id: mandat });
      assert.equal(r.ausgang, erwartet ? "zurueckgestellt" : "vertagung-unbestaetigt", fall);
      assert.equal(r.bilanz.zurueckgestellt, Number(erwartet), fall);
      assert.deepEqual(methoden, pfad, fall);
      if (erwartet) assert.equal(row.attempts, 0, fall);
      if (fall === "bereits-vertagt") {
        const { abschluss } = await laufquittung(t, { ...r.bilanz, reserviert: 1 });
        assert.equal(abschluss.status, "success");
        assert.equal(abschluss.deferred, 1);
      }
    } finally { fetch.mock.restore(); }
  }
});

test("Jeder neue Claim bindet Vertagungen an einen neuen Lease-Besitzer", async () => {
  const claims = [], vertagungen = [];
  const r = await pipeline.arbeite({ owner: "worker", env: { HELMUT_SCALABLE_PIPELINE: "on" },
    deps: {
      budget: null, klassen: {},
      claim: async ({ owner }) => {
        claims.push(owner);
        return { verfuegbar: true, auftraege: claims.length <= 2 ? [auftrag] : [] };
      },
      handler: { source_fetch: vertagungsHandler },
      zurueckstellen: async ({ owner }) => {
        vertagungen.push(owner);
        return { verfuegbar: true, uebernommen: true };
      },
      finish: async () => assert.fail("Vertagung darf kein Finish schreiben")
    } });
  assert.equal(new Set(claims).size, 3);
  assert.deepEqual(vertagungen, claims.slice(0, 2));
  assert.equal(r.zurueckgestellt, 2);
});

const unbestaetigt = [
  ["Abgelehnte Vertagung", async () => ({ verfuegbar: true, uebernommen: false })],
  ["Fehlende DB-Antwort", async () => null],
  ["DB nicht verfügbar", async () => ({ verfuegbar: false })],
  ["DB-Timeout", async () => { throw new Error("synthetischer Timeout"); }]
];
for (const [name, antwort] of unbestaetigt) {
  test(name + " zählt nicht und ergibt partial", async t => {
    let schreibversuche = 0;
    const r = await auftragsausgang(async () => { schreibversuche++; return antwort(); });
    assert.equal(schreibversuche, 1);
    assert.equal(r.ausgang, "vertagung-unbestaetigt");
    assert.equal(r.bilanz.zurueckgestellt, 0);
    assert.equal(r.bilanz.kurzZurueckgestellt, 0);
    assert.equal(r.bilanz.zurueckstellungNichtVerfuegbar, 1);
    const { ergebnis, abschluss } = await laufquittung(t, { ...r.bilanz, reserviert: 1 }, false);
    assert.equal(ergebnis.ok, false);
    assert.equal(abschluss.status, "partial");
    assert.equal(abschluss.fehlerklasse, "vertagung-unbestaetigt");
    assert.equal(abschluss.deferred, 0);
  });
}

test("Ein Abschluss und eine verlorene Sperre ergeben partial", async t => {
  const { ergebnis, abschluss } = await laufquittung(t, { reserviert: 2, erledigt: 1, leaseVerloren: 1 });
  assert.equal(ergebnis.ok, false);
  assert.equal(abschluss.status, "partial");
  assert.equal(abschluss.fehlerklasse, "lease-verloren");
  assert.equal(abschluss.processed, 1);
  assert.equal(abschluss.leaseVerloren, 1);
});

test("Lambda quittiert das Wecksignal erst nach bestätigter Vertagung", async () => {
  const event = { Records: [{ messageId: "signal", body: JSON.stringify(payload) }] };
  for (const uebernommen of [false, true]) {
    let vorlagen = 0;
    const deps = wecksignalDeps({
      claimById: async () => ({ verfuegbar: true, uebernommen: true, id, jobType: "source_fetch" }),
      source_fetch: vertagungsHandler,
      zurueckstellen: async () => ({ verfuegbar: true, uebernommen }),
      erneutVorlegen: async () => { vorlagen++; return { uebernommen: true }; }
    });
    const r = await lambda.handler(event, {}, { env: {}, log: () => {}, verbraucherDeps: deps });
    assert.deepEqual(r.batchItemFailures, uebernommen ? [] : [{ itemIdentifier: "signal" }]);
    assert.equal(vorlagen, uebernommen ? 1 : 0);
  }
});

test("Verlorene Antwort nach UPDATE erzeugt keinen zweiten Handlerlauf und keinen Erfolg", async () => {
  let wartend = false, handlerAufrufe = 0, schreibversuche = 0;
  const deps = wecksignalDeps({
    claimById: async () => wartend
      ? { verfuegbar: true, uebernommen: false, grund: "nicht-faellig" }
      : { verfuegbar: true, uebernommen: true, id, jobType: "source_fetch" },
    source_fetch: async () => { handlerAufrufe++; return vertagungsHandler(); },
    zurueckstellen: async () => {
      schreibversuche++;
      wartend = true;
      throw new Error("synthetischer Timeout nach Commit");
    },
    erneutVorlegen: async () => assert.fail("Wiedervorlage braucht bestätigten DB-Ausgang")
  });
  const ersteZustellung = await verarbeiteWecksignal({ payload, env: {}, deps });
  assert.equal(ersteZustellung.ausgang, "vertagung-unbestaetigt");
  assert.equal(ersteZustellung.erledigt, false);
  assert.equal(ersteZustellung.wiederholen, true);
  const zweiteZustellung = await verarbeiteWecksignal({ payload, env: {}, deps });
  assert.equal(zweiteZustellung.grund, "nicht-faellig");
  assert.equal(zweiteZustellung.erledigt, false);
  assert.equal(zweiteZustellung.wiederholen, true);
  assert.equal(handlerAufrufe, 1);
  assert.equal(schreibversuche, 1);
});
