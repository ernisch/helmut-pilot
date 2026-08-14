"use strict";

// Helmut — Vertragstest SQS-TRANSPORT + LAMBDA-VERBRAUCHER (OP-30-Haertungssprint 2026-08-14).
// =============================================================================================
// Rein offline (Attrappen; kein Netz, kein AWS, keine Datenbank). Geprueft werden:
//   §1 SQS-Ziel-Riegel: Region hart, HTTPS, richtiger Host, keine Zugangsdaten/Parameter
//   §2 SQS-Transport: fail closed ohne Konfiguration; Nachricht traegt GENAU zwei Felder
//   §3 Standardtransport ist sqs; Selbstweck in Production gesperrt (Notfallweg)
//   §4 Lambda-Verbraucher: partielle Fehlerantwort je Nachricht
//   §5 Quarantaene: dauerhaft unbrauchbare Nachrichten werden NICHT geloescht
//   §6 Verbraucher: Signalpruefung, genau der signalisierte Auftrag, Mehrfachzustellung
//   §7 Kein zweiter Fachpfad: der Verbraucher benutzt fuehreAuftragAus
//   §8 Anbietersteuerung: Vertagung statt Fehler, Jitter, fail closed

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const dispatch = require("../lib/helmut/job-dispatch");
const verbraucher = require("../lib/helmut/queue-verbraucher");
const lambda = require("../lib/helmut/lambda-verbraucher");
const anbieter = require("../lib/helmut/anbieter-steuerung");
const scalable = require("../lib/helmut/scalable-pipeline");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
async function check(name, fn) {
  try { await fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (error) { fail += 1; console.log(`  FAIL  ${name} — ${error && error.message}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const UUID2 = "223e4567-e89b-42d3-a456-426614174000";
const QUEUE = "https://sqs.eu-central-1.amazonaws.com/123456789012/helmut-auftraege-production";
const SQS_ENV = {
  HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue",
  HELMUT_JOB_TRANSPORT: "sqs", AWS_REGION: "eu-central-1", HELMUT_SQS_QUEUE_URL: QUEUE
};

async function main() {
  console.log("Helmut — Vertragstest SQS-Transport + Lambda-Verbraucher");

  abschnitt("1 · SQS-Ziel-Riegel: Region und Adresse sind keine Vertrauensfrage");
  await check("1.1 Gueltiges Ziel in eu-central-1 wird kanonisch angenommen", () => {
    const r = dispatch.pruefeSqsZiel(QUEUE, "eu-central-1");
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.url, QUEUE);
  });
  const BOESE_ZIELE = [
    ["fremde Region (us-east-1)", "https://sqs.us-east-1.amazonaws.com/1/q", "us-east-1", /region-unzulaessig/],
    ["Region-Vertipper", QUEUE, "eu-central-2", /region-unzulaessig/],
    ["http statt https", QUEUE.replace("https:", "http:"), "eu-central-1", /nicht-https/],
    ["fremder Host", "https://angreifer.example.com/123/q", "eu-central-1", /fremder-host/],
    ["Host der falschen Region", "https://sqs.us-east-1.amazonaws.com/1/q", "eu-central-1", /fremder-host/],
    ["Zugangsdaten in der URL", "https://a:b@sqs.eu-central-1.amazonaws.com/1/q", "eu-central-1", /zugangsdaten/],
    ["Queryparameter", `${QUEUE}?x=1`, "eu-central-1", /parameter/],
    ["Fragment", `${QUEUE}#f`, "eu-central-1", /parameter/],
    ["leere URL", "", "eu-central-1", /fehlt/],
    ["keine URL", "sqs-irgendwas", "eu-central-1", /keine-url/]
  ];
  for (const [name, url, region, muster] of BOESE_ZIELE) {
    await check(`1.2 Abgewiesen: ${name}`, () => {
      const r = dispatch.pruefeSqsZiel(url, region);
      assert.strictEqual(r.ok, false);
      assert.match(String(r.grund), muster);
    });
  }
  await check("1.3 Nur eu-central-1 ist erlaubt (Datenresidenz ist hart, nicht konfigurierbar)", () => {
    assert.deepStrictEqual([...dispatch.SQS_ERLAUBTE_REGIONEN], ["eu-central-1"]);
  });

  abschnitt("2 · SQS-Transport: fail closed und strukturell datensparsam");
  await check("2.1 Ohne Queue-URL: nicht verfuegbar, KEIN SDK-Aufruf", async () => {
    let aufrufe = 0;
    const t = dispatch.sqsTransport({ ...SQS_ENV, HELMUT_SQS_QUEUE_URL: "" },
      { sqsSende: async () => { aufrufe += 1; } });
    assert.strictEqual(t.verfuegbar, false);
    await t.sende(dispatch.transportPayload(UUID));
    assert.strictEqual(aufrufe, 0);
  });
  await check("2.2 Fremde Region: nicht verfuegbar, KEIN SDK-Aufruf", async () => {
    let aufrufe = 0;
    const t = dispatch.sqsTransport({ ...SQS_ENV, AWS_REGION: "us-east-1" },
      { sqsSende: async () => { aufrufe += 1; } });
    assert.strictEqual(t.verfuegbar, false);
    await t.sende(dispatch.transportPayload(UUID));
    assert.strictEqual(aufrufe, 0);
  });
  await check("2.3 Die Nachricht traegt GENAU { jobId, schemaVersion } — sonst nichts", async () => {
    const gesendet = [];
    const t = dispatch.sqsTransport(SQS_ENV, { sqsSende: async (n) => { gesendet.push(n); } });
    assert.strictEqual(t.verfuegbar, true);
    const r = await t.sende(dispatch.transportPayload(UUID));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(gesendet.length, 1);
    assert.deepStrictEqual(Object.keys(gesendet[0]).sort(), ["jobId", "schemaVersion"]);
    assert.strictEqual(gesendet[0].jobId, UUID);
  });
  await check("2.4 Ein regelwidriges Payload erreicht das SDK NIE", async () => {
    let aufrufe = 0;
    const t = dispatch.sqsTransport(SQS_ENV, { sqsSende: async () => { aufrufe += 1; } });
    await assert.rejects(() => t.sende({ jobId: UUID, schemaVersion: 1, mandat: "x" }),
      /transport-payload-ungueltig/);
    assert.strictEqual(aufrufe, 0);
  });
  await check("2.5 SQS buendelt NICHT (je Auftrag eine Nachricht mit eigener Quarantaene)", () => {
    const t = dispatch.sqsTransport(SQS_ENV, { sqsSende: async () => {} });
    assert.strictEqual(t.buendelt, false);
  });
  await check("2.6 Ein SDK-Fehler wird bereinigt gemeldet, nie geworfen", async () => {
    const t = dispatch.sqsTransport(SQS_ENV, {
      sqsSende: async () => { throw new Error("AccessDenied fuer arn:aws:sqs:geheim"); } });
    const r = await t.sende(dispatch.transportPayload(UUID));
    assert.strictEqual(r.ok, false);
    assert.ok(r.grund);
  });

  abschnitt("3 · Standardtransport und Selbstweck-Degradierung");
  await check("3.1 Der Standardtransport ist sqs (nicht mehr der Selbstweck)", () => {
    assert.strictEqual(dispatch.STANDARD_TRANSPORT, "sqs");
    const t = dispatch.erstelleTransport({ ...SQS_ENV, HELMUT_JOB_TRANSPORT: undefined },
      { sqsSende: async () => {} });
    assert.strictEqual(t.name, "sqs");
  });
  await check("3.2 Selbstweck in Production ist OHNE ausdrueckliche Freischaltung gesperrt", () => {
    const frei = dispatch.selbstweckErlaubt({ VERCEL_ENV: "production" });
    assert.strictEqual(frei.erlaubt, false);
    assert.match(frei.grund, /production-gesperrt/);
    const t = dispatch.erstelleTransport({
      HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue",
      HELMUT_JOB_TRANSPORT: "selbstweck", VERCEL_ENV: "production"
    }, {});
    assert.strictEqual(t.verfuegbar, false);
  });
  await check("3.3 Selbstweck bleibt lokal und als ausdruecklicher Notfallweg nutzbar", () => {
    assert.strictEqual(dispatch.selbstweckErlaubt({}).erlaubt, true);
    assert.strictEqual(dispatch.selbstweckErlaubt({
      VERCEL_ENV: "production", HELMUT_SELBSTWECK_ERLAUBT: "on" }).erlaubt, true);
  });

  abschnitt("4 · Lambda-Verbraucher: partielle Fehlerantwort je Nachricht");
  const record = (id, payload) => ({ messageId: id, body: JSON.stringify(payload) });
  await check("4.1 Gemischter Stapel: nur die NICHT erledigten Nachrichten werden gemeldet", async () => {
    const antwort = await lambda.handler(
      { Records: [record("m1", { jobId: UUID, schemaVersion: 1 }),
                  record("m2", { jobId: UUID2, schemaVersion: 1 }),
                  record("m3", { jobId: UUID, schemaVersion: 1 })] },
      {},
      {
        log: () => {},
        verarbeite: async ({ payload }) => (payload.jobId === UUID2
          ? { erledigt: false, wiederholen: true, grund: "lease-fremd" }
          : { erledigt: true, gearbeitet: true, ausgang: "erledigt" })
      });
    assert.deepStrictEqual(antwort.batchItemFailures, [{ itemIdentifier: "m2" }]);
    assert.strictEqual(antwort.bilanz.erledigt, 2);
    assert.strictEqual(antwort.bilanz.wiederholen, 1);
  });
  await check("4.2 Ein geworfener Fehler loescht NIE eine Nachricht", async () => {
    const antwort = await lambda.handler({ Records: [record("m1", { jobId: UUID, schemaVersion: 1 })] }, {},
      { log: () => {}, verarbeite: async () => { throw new Error("unerwartet"); } });
    assert.deepStrictEqual(antwort.batchItemFailures, [{ itemIdentifier: "m1" }]);
  });
  await check("4.3 Leerer Stapel: leere Fehlerliste, kein Absturz", async () => {
    const antwort = await lambda.handler({ Records: [] }, {}, { log: () => {} });
    assert.deepStrictEqual(antwort.batchItemFailures, []);
  });

  abschnitt("5 · Quarantaene: dauerhaft unbrauchbare Nachrichten werden nicht geloescht");
  await check("5.1 Body ist kein JSON -> Quarantaenepfad (Nachricht bleibt, SQS zaehlt hoch)", async () => {
    const antwort = await lambda.handler({ Records: [{ messageId: "m1", body: "kein json {" }] }, {},
      { log: () => {} });
    assert.deepStrictEqual(antwort.batchItemFailures, [{ itemIdentifier: "m1" }]);
    assert.strictEqual(antwort.bilanz.quarantaene, 1);
  });
  await check("5.2 Regelwidriges Payload -> Quarantaene, NIE Wiederholung ohne Ende", async () => {
    const r = await verbraucher.verarbeiteWecksignal({
      payload: { jobId: "kein-uuid", schemaVersion: 1 }, env: {}, deps: {} });
    assert.strictEqual(r.quarantaene, true);
    assert.strictEqual(r.grund, "payload-ungueltig");
  });
  await check("5.3 Unbekannter Auftrag -> Quarantaene (die Nachricht zeigt auf nichts)", async () => {
    const r = await verbraucher.verarbeiteWecksignal({
      payload: dispatch.transportPayload(UUID), env: SQS_ENV,
      deps: { claimById: async () => ({ verfuegbar: true, uebernommen: false, grund: "unbekannt" }) } });
    assert.strictEqual(r.quarantaene, true);
    assert.strictEqual(r.grund, "auftrag-unbekannt");
  });

  abschnitt("6 · Verbraucher: genau der signalisierte Auftrag, Mehrfachzustellung folgenlos");
  await check("6.1 Beansprucht wird GENAU die signalisierte jobId", async () => {
    const gesehen = [];
    await verbraucher.verarbeiteWecksignal({
      payload: dispatch.transportPayload(UUID2), env: SQS_ENV,
      deps: { claimById: async (o) => { gesehen.push(o.jobId); return { verfuegbar: true, uebernommen: false, grund: "lease-fremd" }; } } });
    assert.deepStrictEqual(gesehen, [UUID2]);
  });
  await check("6.2 Zweite Zustellung eines erledigten Auftrags: KEINE Arbeit, Nachricht weg", async () => {
    let handlerAufrufe = 0;
    const r = await verbraucher.verarbeiteWecksignal({
      payload: dispatch.transportPayload(UUID), env: SQS_ENV,
      deps: {
        claimById: async () => ({ verfuegbar: true, uebernommen: false, grund: "bereits-erledigt" }),
        handlerDeps: { handler: { source_fetch: async () => { handlerAufrufe += 1; return { ok: true }; } } }
      } });
    assert.strictEqual(r.erledigt, true);
    assert.strictEqual(r.gearbeitet, false);
    assert.strictEqual(handlerAufrufe, 0, "kein zweiter Fachaufruf, kein zweiter KI-Aufruf");
  });
  await check("6.3 Fremde Lease -> wiederholen (kein Verlust, keine Doppelarbeit)", async () => {
    const r = await verbraucher.verarbeiteWecksignal({
      payload: dispatch.transportPayload(UUID), env: SQS_ENV,
      deps: { claimById: async () => ({ verfuegbar: true, uebernommen: false, grund: "lease-fremd" }) } });
    assert.strictEqual(r.wiederholen, true);
    assert.strictEqual(r.erledigt, false);
  });
  await check("6.4 Datenbank nicht verfuegbar -> wiederholen, NICHTS behaupten", async () => {
    const r = await verbraucher.verarbeiteWecksignal({
      payload: dispatch.transportPayload(UUID), env: SQS_ENV,
      deps: { claimById: async () => ({ verfuegbar: false, grund: "migration-fehlt" }) } });
    assert.strictEqual(r.wiederholen, true);
    assert.strictEqual(r.gearbeitet, false);
  });
  await check("6.5 Falscher Antrieb -> wiederholen (Konfigurationsbefund, kein Verlust)", async () => {
    let claims = 0;
    const r = await verbraucher.verarbeiteWecksignal({
      payload: dispatch.transportPayload(UUID), env: {},
      deps: { claimById: async () => { claims += 1; return { verfuegbar: true, uebernommen: true }; } } });
    assert.strictEqual(r.wiederholen, true);
    assert.match(String(r.grund), /antrieb-bestand/);
    assert.strictEqual(claims, 0, "ohne Ereignis-Antrieb wird nichts beansprucht");
  });
  await check("6.6 Neuere Schemaversion -> wiederholen (wartet auf den Deployment-Wechsel)", async () => {
    const r = await verbraucher.verarbeiteWecksignal({
      payload: { jobId: UUID, schemaVersion: dispatch.SCHEMA_VERSION + 1 }, env: SQS_ENV, deps: {} });
    assert.strictEqual(r.wiederholen, true);
    assert.strictEqual(r.grund, "schema-version-neuer-als-deployment");
  });

  abschnitt("7 · Kein zweiter Fachpfad");
  await check("7.1 Der Verbraucher ruft fuehreAuftragAus auf (denselben Kern wie Cron)", async () => {
    let benutzt = false;
    await verbraucher.verarbeiteWecksignal({
      payload: dispatch.transportPayload(UUID), env: SQS_ENV,
      deps: {
        claimById: async () => ({
          verfuegbar: true, uebernommen: true, id: UUID, jobType: "source_fetch",
          tenantId: null, payload: {}, attempts: 1, maxAttempts: 5, leaseExpiresAt: null }),
        pipeline: {
          ...scalable,
          fuehreAuftragAus: async () => { benutzt = true; return { ausgang: "erledigt", bilanz: {} }; }
        }
      } });
    assert.strictEqual(benutzt, true);
  });
  // Nur ANWEISUNGEN pruefen, keine Kommentare: der Modulkopf erklaert ausdruecklich, WARUM
  // der Abschluss nicht hier stattfindet, und nennt helmut_finish_job dabei — ein reiner
  // Textvergleich wuerde genau diese Begruendung bestrafen.
  const ohneKommentare = (datei) => fs.readFileSync(path.join(ROOT, datei), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((z) => z.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");

  await check("7.2 queue-verbraucher.js enthaelt KEINE eigene Abschluss-/Backofflogik", () => {
    const src = ohneKommentare("lib/helmut/queue-verbraucher.js");
    for (const verboten of ["helmut_finish_job", "retryDelayMs", "backoffMs", "istEndgueltig"]) {
      assert.ok(!src.includes(verboten), `queue-verbraucher.js darf ${verboten} nicht selbst kennen`);
    }
  });
  await check("7.3 Der Lambda-Verbraucher kennt keinen Fachhandler und keine Datenbank", () => {
    const src = ohneKommentare("lib/helmut/lambda-verbraucher.js");
    for (const verboten of ["storage", "helmut_", "handleSourceFetch", "openai"]) {
      assert.ok(!src.includes(verboten), `lambda-verbraucher.js darf ${verboten} nicht kennen`);
    }
  });
  await check("7.4 Kein Log-Eintrag traegt Nutzdaten (nur IDs, Ausgaenge, Dauern)", async () => {
    const zeilen = [];
    await lambda.handler({ Records: [record("m1", { jobId: UUID, schemaVersion: 1 })] }, {},
      { log: (z) => zeilen.push(z),
        verarbeite: async () => ({ erledigt: true, gearbeitet: true, ausgang: "erledigt" }) });
    assert.ok(zeilen.length > 0);
    for (const z of zeilen) {
      assert.ok(!/mandat=|name=|url=|prompt=/i.test(z), `Log traegt Nutzdaten: ${z}`);
    }
  });

  abschnitt("8 · Anbietersteuerung: Vertagung statt Fehler");
  await check("8.1 Flag aus: die Steuerung ist eine inerte Verzweigung", async () => {
    const r = await anbieter.reserviere({ anbieter: "google", env: {}, deps: {} });
    assert.deepStrictEqual({ erlaubt: r.erlaubt, geprueft: r.geprueft }, { erlaubt: true, geprueft: false });
  });
  await check("8.2 Ausgeschoepfte Grenze -> VERTAGUNG mit fruehestem Zeitpunkt, kein Fehler", async () => {
    const r = await anbieter.reserviere({
      anbieter: "google", env: { HELMUT_ANBIETER_STEUERUNG: "on" },
      deps: { reserviere: async () => ({ verfuegbar: true, erlaubt: false, grund: "minutengrenze", fruehesteMs: 12000 }) } });
    assert.strictEqual(r.erlaubt, false);
    assert.strictEqual(r.vertagen, true);
    assert.strictEqual(r.wartenMs, 12000);
  });
  await check("8.3 Nicht pruefbare Grenze -> fail closed (vertagen, nie durchlassen)", async () => {
    const r = await anbieter.reserviere({
      anbieter: "openai", env: { HELMUT_ANBIETER_STEUERUNG: "on" },
      deps: { reserviere: async () => ({ verfuegbar: false, grund: "migration-fehlt" }) } });
    assert.strictEqual(r.erlaubt, false);
    assert.strictEqual(r.vertagen, true);
  });
  await check("8.4 Der Schluessel unterscheidet Anbieter, Modell, Klasse und Mandat", () => {
    assert.strictEqual(anbieter.grenzSchluessel({ anbieter: "OpenAI" }), "openai");
    assert.strictEqual(
      anbieter.grenzSchluessel({ anbieter: "openai", modell: "gpt", klasse: "verstehen", mandat: "m1" }),
      "openai|gpt|verstehen|m1");
  });
  await check("8.5 Wiederholung waechst exponentiell, ist gedeckelt und hat Jitter", () => {
    const a1 = anbieter.wiederholungMs(1, "auftrag-a");
    const a5 = anbieter.wiederholungMs(5, "auftrag-a");
    const b5 = anbieter.wiederholungMs(5, "auftrag-b");
    assert.ok(a5 > a1, "waechst");
    assert.ok(anbieter.wiederholungMs(99, "x") <= 15 * 60 * 1000, "gedeckelt");
    assert.notStrictEqual(a5, b5, "verschiedene Auftraege laufen auseinander (kein Gleichschritt)");
    assert.strictEqual(anbieter.wiederholungMs(5, "auftrag-a"), a5, "deterministisch");
  });
  await check("8.6 mitAnbietergrenze liefert die bekannte Zurueckstellungsform der Handler", async () => {
    const r = await anbieter.mitAnbietergrenze(
      { anbieter: "google" },
      async () => ({ ok: true }),
      { env: { HELMUT_ANBIETER_STEUERUNG: "on" },
        deps: { reserviere: async () => ({ verfuegbar: true, erlaubt: false, grund: "tagesgrenze", fruehesteMs: 3600000 }) } });
    assert.strictEqual(r.zurueckgestellt, true);
    assert.strictEqual(r.langeWarten, true);
  });
  await check("8.7 Standardgrenzen sind konservativ und ohne erfundene Anbieterzusagen", () => {
    // Der KI-Tagesdeckel bleibt bei helmut_reserve_llm_call: hier steht bewusst 0.
    assert.strictEqual(anbieter.STANDARD_GRENZEN["openai"].tag, 0);
    assert.ok(anbieter.STANDARD_GRENZEN["google"].minute > 0);
  });

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => { console.error("FATAL:", error && error.message); process.exit(1); });
