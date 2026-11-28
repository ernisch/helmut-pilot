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

async function laufquittung(t, bilanz, verfuegbar = true, neuGeplant = false, optionen = {}) {
  const quittungen = [];
  t.mock.method(storage, "schreibeWarteschlangenLaufquittung", async eintrag => {
    quittungen.push(eintrag);
    return optionen.schreibeQuittung ? optionen.schreibeQuittung(eintrag) : { ok: true };
  });
  t.mock.method(pipeline, "setzePlanungFort", async () => ({ ok: true, ausstehend: 0, tagesplan: {}, neuGeplant }));
  t.mock.method(pipeline, "betriebsstatus", async () => ({ zustand: "test" }));
  t.mock.method(dispatch, "abgleich", async () => ({}));
  t.mock.method(dispatch, "versendeAbsichten", async () => ({}));
  t.mock.method(worker, "durchlauf", async () => ({ ...bilanz,
    ...(optionen.blobSpiegel ? { blobSpiegel: optionen.blobSpiegel } : {}),
    bilanzen: [{ ...bilanz, verfuegbar }] }));
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

test("Neuer Quellenplan löst keine altersbasierte Wiedervorlage aus", async t => {
  const wiedervorlage = t.mock.method(pipeline, "wiedervorlage", async () => ({}));
  const { ergebnis } = await laufquittung(t, { reserviert: 0, erledigt: 0 }, true, true);
  assert.equal(wiedervorlage.mock.callCount(), 0);
  assert.deepEqual(ergebnis.wiedervorlage, { uebersprungen: true, grund: "wiedervorlage-braucht-quellenbeleg" });
});

test("END-ACK nach HTTP 521 braucht die vollständige exakte Originalzeile und schreibt nie erneut", async t => {
  const fakeUrl = "https://quittung.test.invalid";
  const namen = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_V3_STORE", "HELMUT_STORAGE_BACKEND"];
  const env = Object.fromEntries(namen.map(k => [k, process.env[k]]));
  Object.assign(process.env, { SUPABASE_URL: fakeUrl, SUPABASE_SERVICE_ROLE_KEY: "lokaler-testschluessel",
    HELMUT_V3_STORE: "1", HELMUT_STORAGE_BACKEND: "supabase" });
  t.after(() => { for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  const entry = { process: "warteschlange-crawl", runId: "synthetischer-endbeleg", mode: "warteschlange",
    location: "isoliert", commit: "a".repeat(40), status: "partial",
    startedAt: "2026-11-28T15:45:11.272Z", finishedAt: "2026-11-28T15:49:16.123Z", durationMs: 244851,
    zielmenge: 80, processed: 9, wiederholt: 38, deferred: 30, fehlgeschlagen: 3, leaseVerloren: 0,
    geplant: 164, neuGeplant: 0, spiegelGesammelt: 94, spiegelGeschrieben: null,
    fehlerklasse: "auftraege-endgueltig-fehlgeschlagen", reason: "blob-spiegel-fehlgeschlagen",
    artikelText: "Dieser synthetische Inhalt darf niemals in der Quittung stehen.", secret: "kein-echter-schluessel" };
  const faelle = [
    ["521-kein-Commit", false, r => ({ ...r, status: "running", finished_at: null })],
    ["521-Commit-exakt", true, r => r],
    ["521-Commit-PostgREST-Zeitformat", true, r => ({ ...r,
      started_at: r.started_at.replace("Z", "000+00:00"), finished_at: r.finished_at.replace("Z", "000+00:00"),
      created_at: r.created_at.replace("Z", "000+00:00") })],
    ["Codeabweichung", false, r => ({ ...r, commit_ref: "b".repeat(40) })],
    ["Ortsabweichung", false, r => ({ ...r, location: "anderer-ort" })],
    ["Startabweichung", false, r => ({ ...r, started_at: "2026-11-28T15:45:11.273Z" })],
    ["Endabweichung", false, r => ({ ...r, finished_at: "2026-11-28T15:49:16.124Z" })],
    ["Mikrosekundenabweichung", false, r => ({ ...r, finished_at: "2026-11-28T15:49:16.123001+00:00" })],
    ["Erstellungsabweichung", false, r => ({ ...r, created_at: "2026-11-28T00:00:00.000Z" })],
    ["Dauerabweichung", false, r => ({ ...r, duration_ms: r.duration_ms + 1 })],
    ["Zaehlerabweichung", false, r => ({ ...r, processed_count: 10 })],
    ["Null-ist-keine-Nullmessung", false, r => ({ ...r, saved_count: 0 })],
    ["Telemetrieabweichung", false, r => ({ ...r, telemetrie: { ...r.telemetrie, wiederholt: 37 } })],
    ["Fremder-Lauf", false, r => ({ ...r, run_id: "fremder-lauf" })],
    ["Fremder-Prozess", false, r => ({ ...r, process: "warteschlange-pipeline" })],
    ["Grundabweichung", false, r => ({ ...r, reason: null })],
    ["Fehlerklasseabweichung", false, r => ({ ...r, error_class: null })],
    ["Unbekannter-Status", false, r => ({ ...r, status: "UNKNOWN" })],
    ["Keine-Zeile", false, () => null], ["Mehrere-Zeilen", false, r => [r, r]],
    ["GET-Ausfall", false, r => r], ["GET-Timeout", false, r => r], ["GET-Deadline", false, r => r],
    ["DB-400", false, r => r, 400], ["Auth-403", false, r => r, 403],
    ["Schema-404", false, r => r, 404], ["Konflikt-409", false, r => r, 409],
    ["DB-500", false, r => r, 500], ["Schemagate-503", false, r => r, 503],
    ["Running-Intent", false, r => r], ["Code-fehlt", false, r => r],
    ["Failed-Endintent", false, () => null]
  ];
  for (const [fall, erwartet, aendere, status = 521] of faelle) {
    await t.test(fall, async st => {
      let gesendet;
      const methoden = [], alleSchreibziele = [];
      st.mock.method(globalThis, "fetch", async (adresse, options) => {
        const url = new URL(adresse), methode = options.method || "GET";
        assert.equal(url.origin, fakeUrl);
        if (["POST", "PATCH"].includes(methode)) alleSchreibziele.push(url.pathname);
        // Die vorhandene Fehlerdiagnose darf scheitern, ohne Auth-/Blobdaten zu verändern.
        if (url.pathname !== "/rest/v1/process_runs") throw Error("isolierte-diagnoseablage");
        methoden.push(methode);
        if (methode === "POST") {
          assert.equal(url.searchParams.get("on_conflict"), "run_id,process");
          gesendet = JSON.parse(options.body);
          return new Response(fall === "Schemagate-503" ? '{"code":"PGRST002","message":"schema cache unavailable"}'
            : "synthetischer-erster-schreibfehler", { status });
        }
        assert.equal(methode, "GET");
        assert.equal(options.cache, "no-store");
        assert.ok(options.signal instanceof AbortSignal);
        assert.equal(url.searchParams.get("run_id"), "eq." + gesendet.run_id);
        assert.equal(url.searchParams.get("process"), "eq." + gesendet.process);
        assert.equal(url.searchParams.get("select"), Object.keys(gesendet).join(","));
        assert.equal(url.searchParams.get("limit"), "2");
        if (fall === "GET-Ausfall") return new Response("synthetischer-get-ausfall", { status: 521 });
        if (fall === "GET-Timeout") { const error = Error("synthetischer-get-timeout"); error.name = "AbortError"; throw error; }
        if (fall === "GET-Deadline") return new Promise(() => {}); // Der echte Adapter muss selbst abbrechen.
        const stand = aendere(structuredClone(gesendet));
        return Response.json(stand === null ? [] : Array.isArray(stand) ? stand : [stand]);
      });
      const intent = { ...entry,
        ...(fall === "Running-Intent" ? { status: "running", finishedAt: null } : {}),
        ...(fall === "Code-fehlt" ? { commit: "kein-commit" } : {}),
        ...(fall === "Failed-Endintent" ? { status: "failed", reason: "warteschlange-nicht-verfuegbar" } : {}) };
      const start = performance.now();
      const r = await storage.schreibeWarteschlangenLaufquittung(intent);
      assert.equal(r.ok, erwartet);
      assert.deepEqual(r.zeile, gesendet, "der einmalige Schreibintent muss unverändert erhalten bleiben");
      assert.ok(r.grund.includes(`(${status})`), "erster Schreibfehler bleibt auch bei ACK erhalten");
      assert.equal(r.schreibfehler.meldung, r.grund);
      assert.equal(r.abgleich.bestaetigt, erwartet);
      assert.equal(JSON.stringify(r.zeile).includes(entry.artikelText), false);
      assert.equal(JSON.stringify(r.zeile).includes(entry.secret), false);
      const keinGet = status !== 521 || ["Running-Intent", "Code-fehlt"].includes(fall);
      assert.deepEqual(methoden, keinGet ? ["POST"] : ["POST", "GET"]);
      assert.deepEqual(alleSchreibziele, ["/rest/v1/process_runs"]);
      if (fall === "GET-Deadline") {
        assert.ok(performance.now() - start < 4500, "kein unbeschränktes Warten auf den GET");
        assert.match(r.abgleich.fehler.meldung, /timed out after 3000ms/);
      }
      if (fall === "Failed-Endintent") {
        assert.equal(r.zeile.status, "failed");
        assert.equal(r.zeile.finished_at, entry.finishedAt);
        assert.equal(r.zeile.reason, "warteschlange-nicht-verfuegbar");
      }
    });
  }
});

test("Injizierter Quittungswriter öffnet keinen echten Reader und behält seinen ursprünglichen Intent", async t => {
  let writes = 0;
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw Error("kein-echter-reader"); });
  const r = await storage.schreibeWarteschlangenLaufquittung({ process: "warteschlange-crawl", runId: "isoliert",
    mode: "warteschlange", location: "test", commit: "a".repeat(40), status: "failed", durationMs: 1,
    startedAt: "2026-11-28T00:00:00.000Z", finishedAt: "2026-11-28T00:00:00.001Z" }, {
    bereit: true, insertRelational: async row => { writes++; row.finished_at = "mutiert"; throw Error("Supabase storage failed (521): isoliert"); }
  });
  assert.equal(r.ok, false);
  assert.equal(writes, 1);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(r.zeile.finished_at, "2026-11-28T00:00:00.001Z");
});

test("Nativer Ausgang erhält die fehlgeschlagene END-Zeile und meldet bei fehlender Quittung oder Spiegel keinen Erfolg", async t => {
  const echterWriter = storage.schreibeWarteschlangenLaufquittung;
  const faelle = [
    ["Start-fehlt", false, true, undefined], ["Ende-fehlt", true, false, undefined],
    ["Spiegel-fehlt", true, true, { gesammelt: 94, geschrieben: false }],
    ["Politico-Kombination", true, false, { gesammelt: 94, geschrieben: false }],
    ["Optionaler-Spiegel-leer", true, true, undefined],
    ["Spiegel-bestaetigt", true, true, { gesammelt: 94, geschrieben: true, neuImBlob: 0 }],
    ["Ende-exakt-nachgelesen", true, false, undefined, true]
  ];
  for (const [fall, startOk, endeOk, blobSpiegel, ack = false] of faelle) {
    await t.test(fall, async st => {
      const writes = [], reads = [];
      const { ergebnis } = await laufquittung(st,
        { reserviert: 80, erledigt: 9, wiederholt: 38, zurueckgestellt: 30, endgueltigFehlgeschlagen: 3 }, true, false, {
          blobSpiegel,
          schreibeQuittung: entry => echterWriter({ ...entry, commit: "a".repeat(40) }, {
            bereit: true, insertRelational: async row => {
              writes.push(structuredClone(row));
              if ((row.status === "running" ? startOk : endeOk) === false) throw Error("Supabase storage failed (521): synthetisch");
            }, leseRelational: async row => { reads.push(row); return ack ? [structuredClone(row)] : []; }
          })
        });
      assert.equal(ergebnis.ok, startOk && (endeOk || ack) && blobSpiegel?.geschrieben !== false);
      assert.equal(ergebnis.lauftelemetrie.status, "partial", "bekannte Endfehler werden niemals Full-PASS");
      assert.equal(ergebnis.lauftelemetrie.fehlerklasse, "auftraege-endgueltig-fehlgeschlagen");
      assert.equal(writes.length, 2, "genau ein START- und ein END-POST");
      assert.deepEqual(ergebnis.lauftelemetrie.abschlussZeile, writes[1]);
      assert.equal(reads.length, endeOk ? 0 : 1, "START niemals durch running-Readback bestätigen");
      if (!endeOk) assert.match(ergebnis.lauftelemetrie.endeSchreibfehler.meldung, /\(521\)/);
      if (ack) {
        assert.equal(ergebnis.lauftelemetrie.ende, true);
        assert.equal(ergebnis.lauftelemetrie.endeAbgleich.bestaetigt, true);
        assert.equal(ergebnis.lauftelemetrie.endeGrund, undefined);
      }
    });
  }
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
    ["kurzer-leseausfall-eigene-lease", ["POST", "GET", "GET", "POST"], true],
    ["kurzer-leseausfall-bereits-vertagt", ["POST", "GET", "GET"], true],
    ["kurzer-leseausfall-fremde-lease", ["POST", "GET", "GET"], false],
    ["fremde-lease", ["POST", "GET"], false],
    ["abgelaufene-lease", ["POST", "GET"], false],
    ["fremdes-mandat", ["POST", "GET"], false],
    ["alter-stand", ["POST", "GET"], false],
    ["anderer-grund", ["POST", "GET"], false],
    ["falsche-faelligkeit", ["POST", "GET"], false],
    ["anderer-versuch", ["POST", "GET"], false],
    ["lesefehler", ["POST", "GET", "GET"], false],
    ["leserecht-fehlt", ["POST", "GET"], false],
    ["lesefrist-abgelaufen", ["POST", "GET"], false],
    ["abgelehnt", ["POST"], false]
  ]) {
    const mandat = fall === "noch-eigene-lease" ? "synthetisches-mandat" : null;
    const methoden = [];
    const echtJetzt = Date.now;
    let zeitversatz = 0;
    const testUhr = fall === "lesefrist-abgelaufen" ? t.mock.method(Date, "now", () => echtJetzt() + zeitversatz) : null;
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
        if (fall === "leserecht-fehlt") return new Response("", { status: 403 });
        if (fall === "lesefrist-abgelaufen") zeitversatz = 3001;
        if (fall === "lesefehler" || fall === "lesefrist-abgelaufen"
            || (fall.startsWith("kurzer-leseausfall-") && methoden.length === 2)) return new Response("", { status: 521 });
        return Response.json([row]);
      }
      assert.equal(url.pathname, "/rest/v1/rpc/helmut_defer_job");
      const body = JSON.parse(options.body);
      assert.equal(body.p_owner, "worker");
      assert.equal(body.p_id, id);
      if (fall === "abgelehnt") return Response.json([{ uebernommen: false, neue_faelligkeit: null }]);
      if (methoden.length === 1) {
        if (["bereits-vertagt", "kurzer-leseausfall-bereits-vertagt", "alter-stand", "anderer-grund", "falsche-faelligkeit", "anderer-versuch"].includes(fall)) {
          vertage(body, Date.now() - (fall === "alter-stand" ? 60000 : 0));
          if (fall === "anderer-grund") row.last_error = "zurueckgestellt: fremder-grund";
          if (fall === "falsche-faelligkeit") row.due_at = row.updated_at;
          if (fall === "anderer-versuch") row.attempts = 1;
        }
        if (fall === "fremde-lease" || fall === "kurzer-leseausfall-fremde-lease") row.lease_owner = "anderer-worker";
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
    } finally {
      fetch.mock.restore();
      testUhr?.mock.restore();
    }
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
