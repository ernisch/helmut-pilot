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

async function auftragsausgang(zurueckstellen) {
  return pipeline.fuehreAuftragAus({ auftrag, besitzer: "worker",
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
