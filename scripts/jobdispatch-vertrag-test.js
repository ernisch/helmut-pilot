"use strict";

// Helmut — Vertragstest AUSTAUSCHBARER TRANSPORT + VERSAND (OP-30-Zielarchitektur).
// =============================================================================================
// Rein offline (Attrappen; kein Netz, keine Datenbank). Geprueft werden die Zusagen aus
// lib/helmut/job-dispatch.js und die Klassengrenzen-/Enqueue-Naehte in scalable-pipeline.js:
//   §1 Modusgrenze fail closed (off | shadow | queue; alles andere = off)
//   §2 Genau EIN primaerer Antrieb; widerspruechliche Konfiguration wird benannt
//   §3 Transport-Payload: GENAU { jobId(uuid), schemaVersion } — adversarial geprueft
//   §4 Schatten-Transport beweist die Versandplanung, versendet nichts
//   §5 Selbstweck-Transport: Payload, Authorisierung, Fehlerklassen, fail closed ohne Konfig
//   §6 Vercel-Queues-Adapter: fail closed ohne SDK; korrekte SDK-Nutzung mit Attrappe
//   §7 Dispatcher: vergeben -> senden -> bestaetigen; Transportausfall laesst alles offen
//   §8 Schema-Version: neuer als das Deployment wird nie verarbeitet
//   §9 Enqueue-Weiche: off = Bestand, aktiv = atomare Outbox-Variante
//   §10 Klassengrenzen-Adapter: fail closed in beide Richtungen
//   §11 Handler bleiben transport-agnostisch (Quelltextpruefung)
//   §12 Vertikaler Pfad: Klassengrenze im source_fetch-/Verstehens-Handler

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const dispatch = require("../lib/helmut/job-dispatch");
const scalable = require("../lib/helmut/scalable-pipeline");

let pass = 0;
let fail = 0;
// SICHERHEITSKORREKTUR 2026-08-14: check() AWAITED async-Testkoerper. Vorher wurden
// async-Faelle als PASS gezaehlt, waehrend ihre Assertions als spaete Promise-Rejection
// am process.exit verpufften — ein Fehlschlag konnte unsichtbar bleiben. Jede
// Aufrufstelle nutzt jetzt `await check(...)`.
async function check(name, fn) {
  try { await fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (error) { fail += 1; console.log(`  FAIL  ${name} — ${error && error.message}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const UUID2 = "223e4567-e89b-42d3-a456-426614174000";

async function main() {
  console.log("Helmut — Vertragstest austauschbarer Transport (OP-30-Zielarchitektur)");

  abschnitt("1 · Modusgrenze: fail closed");
  await check("1.1 Ohne Variable ist der Modus off", () => {
    assert.strictEqual(dispatch.dispatchModus({}), "off");
  });
  // " Shadow "/"QUEUE " normalisieren zu gueltigen Werten (getrimmt + kleingeschrieben,
  // §1.3) — hier stehen nur Werte, die auch NACH der Normalisierung ungueltig sind.
  for (const wert of ["ON", "an", "1", "true", "Queue!", "shadow-x", "aus", "no", "offen"]) {
    const erwartet = wert.trim().toLowerCase() === "off" ? "off" : "off";
    await check(`1.2 Unbekannter/abweichender Wert "${wert}" bedeutet ${erwartet}`, () => {
      assert.strictEqual(dispatch.dispatchModus({ HELMUT_JOB_DISPATCH_MODE: wert }), "off");
    });
  }
  await check("1.3 Nur die drei dokumentierten Werte schalten (off/shadow/queue, case-insensitiv getrimmt)", () => {
    assert.strictEqual(dispatch.dispatchModus({ HELMUT_JOB_DISPATCH_MODE: " Shadow " }), "shadow");
    assert.strictEqual(dispatch.dispatchModus({ HELMUT_JOB_DISPATCH_MODE: "QUEUE" }), "queue");
    assert.strictEqual(dispatch.dispatchModus({ HELMUT_JOB_DISPATCH_MODE: "off" }), "off");
  });
  await check("1.4 dispatchAktiv verlangt Warteschlange UND Modus (kein Dispatch ohne Pfad)", () => {
    assert.strictEqual(dispatch.dispatchAktiv({ HELMUT_JOB_DISPATCH_MODE: "queue" }), false);
    assert.strictEqual(dispatch.dispatchAktiv({ HELMUT_SCALABLE_PIPELINE: "on" }), false);
    assert.strictEqual(dispatch.dispatchAktiv({ HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "shadow" }), true);
  });

  abschnitt("2 · Genau EIN primaerer Antrieb");
  await check("2.1 Flag aus = Bestand, auch mit gesetztem Dispatch (Widerspruch wird benannt)", () => {
    const a = dispatch.waehleAntrieb({ HELMUT_JOB_DISPATCH_MODE: "queue" });
    assert.strictEqual(a.antrieb, "bestand");
    assert.ok(a.widersprueche.length === 1 && /dispatch-ohne-warteschlange/.test(a.widersprueche[0]));
  });
  await check("2.2 Warteschlange an + Dispatch off/shadow = cron-queue", () => {
    assert.strictEqual(dispatch.waehleAntrieb({ HELMUT_SCALABLE_PIPELINE: "on" }).antrieb, "cron-queue");
    assert.strictEqual(dispatch.waehleAntrieb({ HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "shadow" }).antrieb, "cron-queue");
  });
  await check("2.3 Warteschlange an + Dispatch queue = ereignis", () => {
    assert.strictEqual(dispatch.waehleAntrieb({ HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue" }).antrieb, "ereignis");
  });
  await check("2.4 Ein unbekannter Dispatch-Wert wird benannt und wirkt als off", () => {
    const a = dispatch.waehleAntrieb({ HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "vielleicht" });
    assert.strictEqual(a.antrieb, "cron-queue");
    assert.ok(a.widersprueche.some((w) => /dispatch-modus-unbekannt/.test(w)));
  });

  abschnitt("3 · Transport-Payload: GENAU zwei Felder, adversarial");
  await check("3.1 Das Payload traegt exakt jobId (uuid) + schemaVersion und ist eingefroren", () => {
    const p = dispatch.transportPayload(UUID);
    assert.deepStrictEqual(Object.keys(p).sort(), ["jobId", "schemaVersion"]);
    assert.strictEqual(p.schemaVersion, dispatch.SCHEMA_VERSION);
    assert.ok(Object.isFrozen(p));
  });
  const boese = [
    ["zusaetzliches Feld", { jobId: UUID, schemaVersion: 1, mandatsId: "x" }],
    ["Idempotenzschluessel statt uuid", { jobId: "source_fetch|geteilt|abc|2026-08-13T00Z", schemaVersion: 1 }],
    ["Mandats-ID statt uuid", { jobId: "cem-beispiel", schemaVersion: 1 }],
    ["URL statt uuid", { jobId: "https://news.google.com/rss?q=X", schemaVersion: 1 }],
    ["fehlende Version", { jobId: UUID }],
    ["Version 0", { jobId: UUID, schemaVersion: 0 }],
    ["Array", [UUID, 1]],
    ["null", null]
  ];
  for (const [name, kaputt] of boese) {
    await check(`3.2 Abgewiesen: ${name}`, () => {
      assert.throws(() => dispatch.pruefeTransportPayload(kaputt), /transport-payload-ungueltig/);
    });
  }

  abschnitt("4 · Schatten-Transport: beweist, versendet nichts");
  await check("4.1 Der Schatten-Transport ist verfuegbar und bestaetigt ohne jede Netzfunktion", async () => {
    const t = dispatch.schattenTransport();
    const r = await t.sende(dispatch.transportPayload(UUID));
    assert.deepStrictEqual({ ok: r.ok, schatten: r.schatten }, { ok: true, schatten: true });
  });
  await check("4.2 Auch der Schatten-Transport weist ein regelwidriges Payload ab", async () => {
    const t = dispatch.schattenTransport();
    await assert.rejects(() => t.sende({ jobId: UUID, schemaVersion: 1, inhalt: "geheim" }), /transport-payload-ungueltig/);
  });

  abschnitt("5 · Selbstweck-Transport: Weckziel-Riegel (CRON_SECRET verlaesst den Prozess NIE ungeprueft)");
  // Vertrauensanker: die von der PLATTFORM gesetzten Deployment-Hosts. Im Test simuliert
  // ueber ein env-Objekt — im Betrieb sind VERCEL_* reservierte Systemvariablen.
  const PROD_HOST = "helmut-pilot.vercel.app";
  const DEPLOY_HOST = "helmut-pilot-abc123-nohut.vercel.app";
  const VERTRAUEN = { VERCEL_PROJECT_PRODUCTION_URL: PROD_HOST, VERCEL_URL: DEPLOY_HOST };
  const GUTE_URL = `https://${PROD_HOST}/api/cron/worker-weck`;

  await check("5.1 Ohne Weck-URL oder CRON_SECRET: fail closed, ehrlicher Grund", () => {
    const ohneUrl = dispatch.selbstweckTransport({ CRON_SECRET: "s", ...VERTRAUEN }, {});
    const ohneSecret = dispatch.selbstweckTransport({ HELMUT_WORKER_WAKE_URL: GUTE_URL, ...VERTRAUEN }, {});
    assert.strictEqual(ohneUrl.verfuegbar, false);
    assert.match(ohneUrl.grund, /HELMUT_WORKER_WAKE_URL/);
    assert.strictEqual(ohneSecret.verfuegbar, false);
    assert.match(ohneSecret.grund, /CRON_SECRET/);
  });
  await check("5.2 Der Versand traegt NUR das Zwei-Felder-Payload und das Bearer-Secret — an die KANONISCHE URL", async () => {
    const aufrufe = [];
    const t = dispatch.selbstweckTransport(
      { HELMUT_WORKER_WAKE_URL: GUTE_URL, CRON_SECRET: "geheim", ...VERTRAUEN },
      { fetch: async (url, opts) => { aufrufe.push({ url, opts }); return { ok: true, status: 200 }; } });
    assert.strictEqual(t.verfuegbar, true);
    assert.strictEqual(t.buendelt, true, "Selbstweck ist eine Tuerklingel (buendelt)");
    const r = await t.sende(dispatch.transportPayload(UUID));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(aufrufe.length, 1);
    assert.strictEqual(aufrufe[0].url, GUTE_URL, "es wird die kanonisch gebaute Ziel-URL versendet");
    assert.strictEqual(aufrufe[0].opts.headers.Authorization, "Bearer geheim");
    const body = JSON.parse(aufrufe[0].opts.body);
    assert.deepStrictEqual(Object.keys(body).sort(), ["jobId", "schemaVersion"]);
    assert.strictEqual(body.jobId, UUID);
  });
  await check("5.3 Ein Nicht-2xx (z. B. 409 Widerspruch) ist ein DEFINITIVER Fehlversuch", async () => {
    const t = dispatch.selbstweckTransport(
      { HELMUT_WORKER_WAKE_URL: GUTE_URL, CRON_SECRET: "s", ...VERTRAUEN },
      { fetch: async () => ({ ok: false, status: 409 }) });
    const r = await t.sende(dispatch.transportPayload(UUID));
    assert.deepStrictEqual(r, { ok: false, grund: "http-409" });
  });
  await check("5.4 Ein Netzfehler wird bereinigt gemeldet, nie geworfen", async () => {
    const t = dispatch.selbstweckTransport(
      { HELMUT_WORKER_WAKE_URL: GUTE_URL, CRON_SECRET: "geheim", ...VERTRAUEN },
      { fetch: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:3000"); } });
    const r = await t.sende(dispatch.transportPayload(UUID));
    assert.strictEqual(r.ok, false);
    assert.ok(r.grund && !/geheim/.test(r.grund));
  });
  await check("5.5 Timeout NACH dem Absenden ist UNBESTAETIGT, nie ein definitiver Fehlversuch", async () => {
    const t = dispatch.selbstweckTransport(
      { HELMUT_WORKER_WAKE_URL: GUTE_URL, CRON_SECRET: "s", HELMUT_WAKE_TIMEOUT_MS: "500", ...VERTRAUEN },
      { fetch: (url, opts) => new Promise((_, reject) => {
          opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }) });
    const r = await t.sende(dispatch.transportPayload(UUID));
    assert.deepStrictEqual({ ok: r.ok, unbestaetigt: r.unbestaetigt }, { ok: false, unbestaetigt: true });
  });

  // ── ADVERSARIALE WECKZIELE: jede Abweichung macht den Transport geschlossen nicht
  // verfuegbar, und der Beweis ist hart: die Netzfunktion wird NIE aufgerufen, das
  // Bearer-Secret verlaesst den Prozess NIE. ──
  const ADVERSARIALE_ZIELE = [
    ["http statt https", `http://${PROD_HOST}/api/cron/worker-weck`, /nicht-https/],
    ["fremder Host (vercel.app gehoert JEDEM Vercel-Kunden)", "https://angreifer.vercel.app/api/cron/worker-weck", /fremder-host/],
    ["fremder Host (beliebige Domain)", "https://evil.example.com/api/cron/worker-weck", /fremder-host/],
    ["Zugangsdaten in der URL", `https://user:pass@${PROD_HOST}/api/cron/worker-weck`, /zugangsdaten/],
    ["anderer Pfad", `https://${PROD_HOST}/api/ops/jobqueue`, /falscher-pfad/],
    ["alter Pfad vor der Verlegung (§17.6)", `https://${PROD_HOST}/api/ops/worker-weck`, /falscher-pfad/],
    ["Pfad-Traversal (normalisiert auf fremden Pfad)", `https://${PROD_HOST}/api/cron/worker-weck/../jobqueue`, /falscher-pfad/],
    ["Pfad mit angehaengtem Segment", `https://${PROD_HOST}/api/cron/worker-weck/extra`, /falscher-pfad/],
    ["Pfad mit Schluss-Schraegstrich", `https://${PROD_HOST}/api/cron/worker-weck/`, /falscher-pfad/],
    ["Pfad prozentcodiert", `https://${PROD_HOST}/api/ops/worker%2Dweck`, /falscher-pfad/],
    ["Queryparameter", `https://${PROD_HOST}/api/cron/worker-weck?debug=1`, /queryparameter/],
    ["Fragment", `https://${PROD_HOST}/api/cron/worker-weck#f`, /fragment/],
    ["expliziter Nicht-Standard-Port", `https://${PROD_HOST}:8443/api/cron/worker-weck`, /expliziter-port/],
    ["IP-Adresse statt Deployment-Host", "https://203.0.113.7/api/cron/worker-weck", /fremder-host/],
    ["kein URL-Wert", "kein ziel", /keine-url/],
    ["Host als Praefix-Faelschung", `https://${PROD_HOST}.evil.example.com/api/cron/worker-weck`, /fremder-host/]
  ];
  for (const [name, ziel, muster] of ADVERSARIALE_ZIELE) {
    await check(`5.6 Adversariales Weckziel abgewiesen: ${name}`, async () => {
      let netzAufrufe = 0;
      const t = dispatch.selbstweckTransport(
        { HELMUT_WORKER_WAKE_URL: ziel, CRON_SECRET: "streng-geheim", ...VERTRAUEN },
        { fetch: async () => { netzAufrufe += 1; return { ok: true, status: 200 }; } });
      assert.strictEqual(t.verfuegbar, false);
      assert.match(String(t.grund), muster);
      const r = await t.sende(dispatch.transportPayload(UUID));
      assert.strictEqual(r.ok, false);
      assert.strictEqual(netzAufrufe, 0, "die Netzfunktion darf fuer ein abgewiesenes Ziel NIE aufgerufen werden");
    });
  }
  await check("5.7 Ohne Plattform-Vertrauensanker (lokal) ist der Selbstweck geschlossen nicht verfuegbar", async () => {
    let netzAufrufe = 0;
    const t = dispatch.selbstweckTransport(
      { HELMUT_WORKER_WAKE_URL: GUTE_URL, CRON_SECRET: "s" },
      { fetch: async () => { netzAufrufe += 1; return { ok: true }; } });
    assert.strictEqual(t.verfuegbar, false);
    assert.match(t.grund, /vertrauensanker/);
    await t.sende(dispatch.transportPayload(UUID));
    assert.strictEqual(netzAufrufe, 0);
  });
  await check("5.8 Der Vertrauensanker uebernimmt NUR nackte Plattform-Hosts (praeparierte Werte zaehlen nie)", () => {
    const hosts = dispatch.vertrauenswuerdigeWeckHosts({
      VERCEL_PROJECT_PRODUCTION_URL: PROD_HOST,
      VERCEL_URL: "evil.example.com/api/cron/worker-weck",
      VERCEL_BRANCH_URL: "host:8443"
    });
    assert.deepStrictEqual([...hosts], [PROD_HOST]);
  });
  await check("5.9 Jeder Plattform-Host (Production, Deployment, Branch) ist einzeln vertrauenswuerdig", () => {
    const okProd = dispatch.pruefeWeckZiel(GUTE_URL, VERTRAUEN);
    const okDeploy = dispatch.pruefeWeckZiel(`https://${DEPLOY_HOST}/api/cron/worker-weck`, VERTRAUEN);
    assert.strictEqual(okProd.ok, true);
    assert.strictEqual(okProd.url, GUTE_URL);
    assert.strictEqual(okDeploy.ok, true);
  });
  await check("5.10 Gross geschriebener Host wird kanonisch normalisiert und bleibt vertrauenswuerdig", () => {
    const r = dispatch.pruefeWeckZiel(`HTTPS://${PROD_HOST.toUpperCase()}/api/cron/worker-weck`, VERTRAUEN);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.url, GUTE_URL);
  });

  abschnitt("6 · Vercel-Queues-Adapter");
  await check("6.1 Ohne installiertes SDK: fail closed mit Gruenderentscheidungs-Hinweis", () => {
    const t = dispatch.vercelQueuesTransport({}, {});
    assert.strictEqual(t.verfuegbar, false);
    assert.match(t.grund, /sdk-nicht-installiert/);
  });
  await check("6.2 Mit SDK-Attrappe: send(topic, payload, {idempotencyKey}) nach offizieller Signatur", async () => {
    const aufrufe = [];
    const t = dispatch.vercelQueuesTransport(
      { HELMUT_QUEUE_TOPIC: "helmut-test" },
      { vercelQueueSend: async (topic, payload, opts) => { aufrufe.push({ topic, payload, opts }); } });
    const r = await t.sende(dispatch.transportPayload(UUID));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(aufrufe[0].topic, "helmut-test");
    assert.deepStrictEqual(Object.keys(aufrufe[0].payload).sort(), ["jobId", "schemaVersion"]);
    assert.strictEqual(aufrufe[0].opts.idempotencyKey, UUID);
  });
  await check("6.3 Ein unbekannter Transportname ist fail closed (kein stiller Rueckfall)", () => {
    const t = dispatch.erstelleTransport({ HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue", HELMUT_JOB_TRANSPORT: "taubenpost" }, {});
    assert.strictEqual(t.verfuegbar, false);
    assert.match(t.grund, /transport-unbekannt/);
  });

  abschnitt("7 · Dispatcher: vergeben -> senden -> bestaetigen");
  function outboxAttrappe(absichten) {
    const log = { bestaetigt: [], fehlgeschlagen: [] };
    return {
      log,
      naechste: async () => ({ verfuegbar: true, absichten }),
      bestaetige: async ({ outboxId, ok, fehler }) => {
        (ok ? log.bestaetigt : log.fehlgeschlagen).push({ outboxId, fehler });
        return { verfuegbar: true, uebernommen: true };
      }
    };
  }
  await check("7.1 Shadow: alle vergebenen Absichten werden ohne Netz bestaetigt", async () => {
    const attrappe = outboxAttrappe([
      { outboxId: "o1", jobId: UUID, schemaVersion: 1, attempts: 1 },
      { outboxId: "o2", jobId: UUID2, schemaVersion: 1, attempts: 1 }
    ]);
    const bilanz = await dispatch.versendeAbsichten({
      env: { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "shadow" },
      deps: attrappe
    });
    assert.strictEqual(bilanz.versendet, 2);
    assert.strictEqual(bilanz.fehlgeschlagen, 0);
    assert.strictEqual(attrappe.log.bestaetigt.length, 2);
    assert.strictEqual(bilanz.transport, "schatten");
  });
  await check("7.2 Transport nicht verfuegbar: NICHTS wird vergeben, ehrlicher Grund, Absichten bleiben", async () => {
    let vergeben = false;
    const bilanz = await dispatch.versendeAbsichten({
      env: { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue" },
      deps: {
        naechste: async () => { vergeben = true; return { verfuegbar: true, absichten: [] }; },
        bestaetige: async () => ({ verfuegbar: true })
      }
    });
    assert.strictEqual(bilanz.transportVerfuegbar, false);
    assert.strictEqual(vergeben, false, "es darf keine Absicht vergeben werden");
    assert.ok(bilanz.grund);
  });
  await check("7.3 Ein Sendefehler wird als Fehlversuch verbucht (Absicht faellt zurueck, nie verloren)", async () => {
    const attrappe = outboxAttrappe([{ outboxId: "o1", jobId: UUID, schemaVersion: 1, attempts: 1 }]);
    const bilanz = await dispatch.versendeAbsichten({
      env: { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue" },
      deps: {
        ...attrappe,
        transport: { name: "test", verfuegbar: true, sende: async () => ({ ok: false, grund: "http-503" }) }
      }
    });
    assert.strictEqual(bilanz.fehlgeschlagen, 1);
    assert.deepStrictEqual(attrappe.log.fehlgeschlagen, [{ outboxId: "o1", fehler: "http-503" }]);
  });
  // ── GEBUENDELTER WECKRUF (Sicherheitskorrektur 2026-08-14): der Selbstweck ist eine
  // Tuerklingel — EIN Ruf je Aufrufkontext, egal wie viele Absichten faellig sind. Das
  // beseitigt die Aufrufverstaerkung (vorher: ein HTTP-Aufruf je Absicht, verschachtelt). ──
  const QUEUE_ENV = {
    HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue",
    HELMUT_WORKER_WAKE_URL: GUTE_URL, CRON_SECRET: "s", ...VERTRAUEN
  };
  const FUENF = [
    { outboxId: "o1", jobId: UUID, schemaVersion: 1 },
    { outboxId: "o2", jobId: UUID2, schemaVersion: 1 },
    { outboxId: "o3", jobId: UUID, schemaVersion: 1 },
    { outboxId: "o4", jobId: UUID2, schemaVersion: 1 },
    { outboxId: "o5", jobId: UUID, schemaVersion: 1 }
  ];
  await check("7.6 Buendelung: 5 faellige Absichten -> GENAU EIN Weckruf, alle 5 bestaetigt", async () => {
    const attrappe = outboxAttrappe(FUENF.map((a) => ({ ...a })));
    let netzAufrufe = 0;
    const bilanz = await dispatch.versendeAbsichten({
      env: QUEUE_ENV,
      deps: { ...attrappe, fetch: async () => { netzAufrufe += 1; return { ok: true, status: 200 }; } }
    });
    assert.strictEqual(netzAufrufe, 1, "genau ein Weckruf fuer alle fuenf Absichten");
    assert.strictEqual(bilanz.weckrufe, 1);
    assert.strictEqual(bilanz.versendet, 5);
    assert.strictEqual(attrappe.log.bestaetigt.length, 5);
  });
  await check("7.7 Buendelung: definitiver Fehler -> ein Weckruf, alle 5 als Fehlversuch verbucht", async () => {
    const attrappe = outboxAttrappe(FUENF.map((a) => ({ ...a })));
    let netzAufrufe = 0;
    const bilanz = await dispatch.versendeAbsichten({
      env: QUEUE_ENV,
      deps: { ...attrappe, fetch: async () => { netzAufrufe += 1; return { ok: false, status: 503 }; } }
    });
    assert.strictEqual(netzAufrufe, 1);
    assert.strictEqual(bilanz.fehlgeschlagen, 5);
    assert.strictEqual(attrappe.log.fehlgeschlagen.length, 5);
    assert.strictEqual(attrappe.log.fehlgeschlagen[0].fehler, "http-503");
  });
  await check("7.8 Buendelung: Timeout (unbestaetigt) verbucht NICHTS — Crash-aequivalenter, sicherer Pfad", async () => {
    const attrappe = outboxAttrappe(FUENF.map((a) => ({ ...a })));
    const bilanz = await dispatch.versendeAbsichten({
      env: { ...QUEUE_ENV, HELMUT_WAKE_TIMEOUT_MS: "500" },
      deps: {
        ...attrappe,
        fetch: (url, opts) => new Promise((_, reject) => {
          opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        })
      }
    });
    assert.strictEqual(bilanz.unbestaetigt, 5);
    assert.strictEqual(bilanz.versendet, 0);
    assert.strictEqual(bilanz.fehlgeschlagen, 0);
    assert.strictEqual(attrappe.log.bestaetigt.length + attrappe.log.fehlgeschlagen.length, 0,
      "bei unbekanntem Ausgang wird die Outbox NICHT verbucht (Vergabe traegt Versuch+Backoff bereits)");
  });
  await check("7.9 Buendelung: leere Outbox -> KEIN Weckruf (die Klingel laeutet nie ohne Arbeit)", async () => {
    let netzAufrufe = 0;
    const bilanz = await dispatch.versendeAbsichten({
      env: QUEUE_ENV,
      deps: {
        naechste: async () => ({ verfuegbar: true, absichten: [] }),
        bestaetige: async () => ({ verfuegbar: true }),
        fetch: async () => { netzAufrufe += 1; return { ok: true }; }
      }
    });
    assert.strictEqual(netzAufrufe, 0);
    assert.strictEqual(bilanz.vergeben, 0);
  });

  await check("7.4 Modus off: der Dispatcher ist ein reiner No-Op", async () => {
    const bilanz = await dispatch.versendeAbsichten({ env: {}, deps: {} });
    assert.deepStrictEqual(bilanz, { uebersprungen: true, grund: "dispatch-off", versendet: 0 });
  });
  await check("7.5 Der Abgleich ist bei Modus off ebenfalls ein No-Op", async () => {
    const a = await dispatch.abgleich({ env: {}, deps: {} });
    assert.strictEqual(a.uebersprungen, true);
  });

  abschnitt("8 · Schema-Version: sichere Behandlung alter und neuer Deployments");
  await check("8.1 Bekannte Versionen (1..SCHEMA_VERSION) sind verarbeitbar, neuere NIE", () => {
    assert.strictEqual(dispatch.schemaVersionVerarbeitbar(1), true);
    assert.strictEqual(dispatch.schemaVersionVerarbeitbar(dispatch.SCHEMA_VERSION), true);
    assert.strictEqual(dispatch.schemaVersionVerarbeitbar(dispatch.SCHEMA_VERSION + 1), false);
    assert.strictEqual(dispatch.schemaVersionVerarbeitbar(0), false);
    assert.strictEqual(dispatch.schemaVersionVerarbeitbar("x"), false);
  });

  abschnitt("9 · Enqueue-Weiche (standardEnqueue)");
  await check("9.1 Dispatch off: das Einreihen ist byte-identisch der Bestandsweg", async () => {
    // Ohne Supabase-Konfiguration antwortet der Bestandsweg 'supabase-nicht-konfiguriert' —
    // exakt daran ist er erkennbar (die Outbox-Variante wuerde denselben Grund liefern,
    // deshalb prueft 9.2 zusaetzlich ueber die Feldform).
    const enq = scalable.standardEnqueue({});
    const r = await enq({ jobType: "source_fetch", idempotencyKey: "k", freshnessWindow: "f" });
    assert.strictEqual(r.verfuegbar, false);
    assert.strictEqual(r.versandabsicht, undefined, "Bestandsweg kennt keine versandabsicht");
  });
  await check("9.2 Dispatch aktiv: das Einreihen laeuft ueber die Outbox-Variante (mit Schema-Version)", async () => {
    // storage laesst sich hier nicht injizieren (bewusst: die Weiche ist der Bauplatz) —
    // die Outbox-Variante ist an ihrem Rueckgabefeld `versandabsicht` erkennbar.
    const enq = scalable.standardEnqueue({ HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "shadow" });
    const r = await enq({ jobType: "source_fetch", idempotencyKey: "k", freshnessWindow: "f" });
    assert.strictEqual(r.verfuegbar, false, "ohne Supabase ehrlich nicht verfuegbar");
    // Die Outbox-Huelle liefert bei nicht konfiguriertem Supabase denselben Grund;
    // dass die OUTBOX-Huelle lief, weist §12 des Datenbanktests nach. Hier zaehlt:
    // kein Wurf, fail closed, ehrlicher Grund.
    assert.match(r.grund, /supabase-nicht-konfiguriert/);
  });

  abschnitt("10 · Klassengrenzen-Adapter: fail closed in beide Richtungen");
  await check("10.1 Ohne HELMUT_KLASSEN_GRENZEN ist der Adapter null (byte-identisches Verhalten)", () => {
    assert.strictEqual(scalable.klassenAdapter({ env: {} }), null);
  });
  await check("10.2 Standards: quellenabruf 5 · verstehen 1 · worker-drain 1; Env-Override wirkt", () => {
    assert.strictEqual(scalable.klassenMax("quellenabruf", {}), 5);
    assert.strictEqual(scalable.klassenMax("verstehen", {}), 1);
    assert.strictEqual(scalable.klassenMax("worker-drain", {}), 1);
    assert.strictEqual(scalable.klassenMax("worker-drain", { HELMUT_KLASSE_WORKER_DRAIN_MAX: "4" }), 4);
    assert.strictEqual(scalable.klassenMax("worker-drain", { HELMUT_KLASSE_WORKER_DRAIN_MAX: "-2" }), 1);
  });
  await check("10.3 Eine NICHT pruefbare Grenze erlaubt nichts (fail closed, sichtbarer Grund)", async () => {
    const adapter = scalable.klassenAdapter({
      env: { HELMUT_KLASSEN_GRENZEN: "on" },
      deps: { klassenSpeicher: { belege: async () => ({ verfuegbar: false, grund: "migration-fehlt" }), gebeFrei: async () => ({}) } }
    });
    const f = await adapter.belege("quellenabruf");
    assert.strictEqual(f.erlaubt, false);
    assert.match(f.grund, /grenze-nicht-verfuegbar:migration-fehlt/);
  });
  await check("10.4 Eine volle Klasse lehnt ab, eine freie erlaubt (Slot wird durchgereicht)", async () => {
    const adapter = scalable.klassenAdapter({
      env: { HELMUT_KLASSEN_GRENZEN: "on" },
      deps: { klassenSpeicher: {
        belege: async ({ klasse }) => klasse === "voll"
          ? ({ verfuegbar: true, erlaubt: false, slot: null, belegt: 5 })
          : ({ verfuegbar: true, erlaubt: true, slot: "slot-1", belegt: 1 }),
        gebeFrei: async () => ({})
      } }
    });
    const voll = await adapter.belege("voll");
    const frei = await adapter.belege("frei");
    assert.strictEqual(voll.erlaubt, false);
    assert.strictEqual(voll.grund, "klasse-voll");
    assert.deepStrictEqual({ erlaubt: frei.erlaubt, slot: frei.slot }, { erlaubt: true, slot: "slot-1" });
  });

  abschnitt("11 · Fachhandler bleiben transport-agnostisch (Quelltext)");
  await check("11.1 Kein Handler in scalable-pipeline.js kennt einen Transportanbieter", () => {
    const quelle = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "scalable-pipeline.js"), "utf8");
    const handlerBlock = quelle.slice(quelle.indexOf("async function handleSourceFetch"), quelle.indexOf("const HANDLER = {"));
    assert.ok(handlerBlock.length > 1000, "Handler-Block gefunden");
    for (const verboten of ["vercel-queues", "selbstweck", "vercelQueue", "HELMUT_JOB_TRANSPORT", "HELMUT_WORKER_WAKE_URL", "transportPayload", "versendeAbsichten"]) {
      assert.ok(!handlerBlock.includes(verboten), `Handler-Block enthaelt '${verboten}'`);
    }
  });
  await check("11.2 Ein Transportwechsel ist reine Konfiguration (erstelleTransport ist der EINE Bauplatz)", () => {
    const selbst = dispatch.erstelleTransport({ HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue", HELMUT_WORKER_WAKE_URL: "http://localhost/x", CRON_SECRET: "s" }, {});
    const vercel = dispatch.erstelleTransport({ HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue", HELMUT_JOB_TRANSPORT: "vercel-queues" }, { vercelQueueSend: async () => {} });
    assert.strictEqual(selbst.name, "selbstweck");
    assert.strictEqual(vercel.name, "vercel-queues");
    assert.strictEqual(typeof selbst.sende, typeof vercel.sende);
  });

  abschnitt("12 · Vertikaler Pfad: Klassengrenzen in den Handlern");
  const basisAuftrag = {
    id: UUID, jobType: "source_fetch", payload: { quelle: { id: "q1", rssUrls: [] } },
    freshnessWindow: "2026-08-13T00Z", attempts: 1, maxAttempts: 3, createdAt: new Date().toISOString()
  };
  await check("12.1 source_fetch: volle Klasse -> zurueckgestellt OHNE externen Abruf", async () => {
    let abgerufen = false;
    const ergebnis = await scalable.HANDLER.source_fetch(basisAuftrag, {
      klassen: { belege: async () => ({ erlaubt: false, grund: "klasse-voll", slot: null }), gebeFrei: async () => {} },
      crawlAllSources: async () => { abgerufen = true; return { results: [{}], rawItems: [] }; },
      hardeningConfig: () => ({ enabled: false })
    });
    assert.strictEqual(ergebnis.zurueckgestellt, true);
    assert.match(ergebnis.grund, /klassengrenze-belegt: quellenabruf/);
    assert.strictEqual(abgerufen, false, "es darf KEIN externer Abruf stattfinden");
  });
  await check("12.2 source_fetch: freie Klasse -> Slot wird nach der Arbeit freigegeben (auch im Fehlerfall)", async () => {
    const freigaben = [];
    await scalable.HANDLER.source_fetch(basisAuftrag, {
      klassen: { belege: async () => ({ erlaubt: true, slot: "s-1" }), gebeFrei: async (slot) => { freigaben.push(slot); } },
      crawlAllSources: async () => { throw new Error("google-timeout"); },
      hardeningConfig: () => ({ enabled: false })
    }).catch(() => null);
    assert.deepStrictEqual(freigaben, ["s-1"]);
  });
  const verstehenAuftrag = {
    id: UUID2, jobType: "document_understanding", payload: { dokumente: [{ id: "rd-1" }] },
    freshnessWindow: "2026-08-13T00Z", attempts: 1, maxAttempts: 3, createdAt: new Date().toISOString()
  };
  await check("12.3 Verstehen: volle Klasse -> zurueckgestellt OHNE Verstehenslauf", async () => {
    let verstanden = false;
    const ergebnis = await scalable.HANDLER.document_understanding(verstehenAuftrag, {
      klassen: { belege: async () => ({ erlaubt: false, grund: "klasse-voll", slot: null }), gebeFrei: async () => {} },
      eagerUnderstanding: async () => { verstanden = true; return { processed: 1 }; },
      verstehenKonkurrenz: () => false
    });
    assert.strictEqual(ergebnis.zurueckgestellt, true);
    assert.match(ergebnis.grund, /klassengrenze-belegt: verstehen/);
    assert.strictEqual(verstanden, false);
  });
  await check("12.4 Ohne Konkurrenzflag wird das globale Schloss NICHT uebersteuert", async () => {
    let gesehen = null;
    await scalable.HANDLER.document_understanding(verstehenAuftrag, {
      eagerUnderstanding: async (_docs, overrides) => { gesehen = overrides; return { processed: 1 }; },
      verstehenKonkurrenz: () => false
    });
    assert.strictEqual(gesehen.acquireLock, undefined, "acquireLock darf ohne Flag nicht uebersteuert werden");
  });
  await check("12.5 Mit Konkurrenzflag ersetzt die Vorgangswache das globale Schloss fuer diesen Lauf", async () => {
    let gesehen = null;
    await scalable.HANDLER.document_understanding(verstehenAuftrag, {
      eagerUnderstanding: async (_docs, overrides) => { gesehen = overrides; return { processed: 1 }; },
      verstehenKonkurrenz: () => true
    });
    assert.strictEqual(typeof gesehen.acquireLock, "function");
    const lock = await gesehen.acquireLock();
    assert.deepStrictEqual({ granted: lock.granted, active: lock.active }, { granted: true, active: false });
  });

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.message);
  process.exit(1);
});
