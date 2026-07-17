"use strict";

// F5-Vorbereitung — gehärteter Monitoring-Webhook (Sprint 2026-07, Phase 6).
// Test gegen einen LOKALEN Mock-Webhook (http://127.0.0.1, vom Netz-Guard erlaubt)
// + injizierte State-Deps. Belegt:
//   1. ohne URL: sauberer No-Op (F5 bleibt inaktiv)
//   2. Zustellung + persistierter Zustellstatus
//   3. stabile Ereigniskennung: gleicher Zustand am selben Tag = gleiche event_id,
//      bereits zugestellt -> Dedupe (kein Doppel-Alarm); geänderter Zustand -> neue id
//   4. begrenzte Wiederholung: 5xx wird begrenzt wiederholt, 4xx nicht,
//      harte Obergrenze (keine Endlosschleife)
//   5. Meta-Heartbeat: grüner Report wird als event_type=heartbeat zugestellt
//   6. Datenschutz: Payload enthält keine Namen/Profile/Briefingtexte/Secrets
//      (Allowlist + Redaction), auch nicht in den Umschlagfeldern

const http = require("http");
const { deliverMonitoringWebhook, buildWebhookEventId } = require("../lib/helmut/monitoring-webhook");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const received = [];
let failNextWith = null; // Statuscode-Warteschlange für Fehler-Szenarien
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const status = Array.isArray(failNextWith) && failNextWith.length ? failNextWith.shift() : 200;
    received.push({ status, body: JSON.parse(body) });
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end("{}");
  });
});

// In-Memory-Statusspeicher (ersetzt den Auth-Store, gleiche Schnittstelle).
let stateStore = null;
const deps = (env) => ({
  env,
  sleep: async () => {}, // Backoff im Test nicht real warten
  loadState: async () => stateStore,
  saveState: async (entry) => { stateStore = entry; }
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const hookUrl = `http://127.0.0.1:${server.address().port}/mock-webhook`;

  // ── 1. Ohne URL: No-Op (F5 inaktiv) ───────────────────────────────────────
  const skipped = await deliverMonitoringWebhook({ ok: true, text: "gruen" }, deps({}));
  check("ohne HELMUT_MONITORING_WEBHOOK_URL: sauber übersprungen", skipped.skipped === true && skipped.sent === false && received.length === 0);
  check("Skip ohne URL trägt unconfigured=true (Unterscheidung vom Dedupe-Skip)", skipped.unconfigured === true);

  const env = { HELMUT_MONITORING_WEBHOOK_URL: hookUrl, CRON_SECRET: "cronsecretFAKE1234567890" };

  // ── 2+5. Grüner Report = Heartbeat, Zustellstatus persistiert ─────────────
  const green = { ok: true, text: "Crawl: vor 2h (145 Quellen, 0 Fehler)", state: "Gesund", severity: "info", rollingCrawl: { status: "aktuell-gesund", alertLevel: "ok", windowRuns: 3, degradedRuns: 0 } };
  const hb = await deliverMonitoringWebhook(green, deps(env));
  check("grüner Report zugestellt (Meta-Heartbeat)", hb.sent === true && hb.eventType === "heartbeat" && received.length === 1);
  check("event_id stabil im Heartbeat-Format (hb-YYYY-MM-DD)", /^hb-\d{4}-\d{2}-\d{2}$/.test(hb.eventId));
  check("Zustellstatus persistiert (sent, attempts, eventId)", stateStore && stateStore.sent === true && stateStore.attempts === 1 && stateStore.eventId === hb.eventId);
  check("Payload trägt event_id/event_type/attempt/sent_at (technische Metadaten)",
    received[0].body.event_id === hb.eventId && received[0].body.event_type === "heartbeat" && received[0].body.attempt === 1 && typeof received[0].body.sent_at === "string");
  check("rollierende Crawl-Zähler im Payload", received[0].body.rollingCrawl && received[0].body.rollingCrawl.status === "aktuell-gesund");

  // ── 3. Dedupe: gleiches Ereignis am selben Tag nicht doppelt ──────────────
  const dup = await deliverMonitoringWebhook(green, deps(env));
  check("gleiches Ereignis bereits zugestellt -> Dedupe (kein Doppel-Alarm)", dup.skipped === true && dup.reason === "duplicate-event" && received.length === 1);
  check("Dedupe-Skip ist NICHT unconfigured (Kanal ist eingerichtet)", dup.unconfigured !== true);

  // Geänderter Zustand -> neue Ereigniskennung -> wird zugestellt
  const alarm = { ok: false, text: "Crawl degradiert", state: "Degradiert", severity: "alarm", healthBlockers: ["crawl-degradiert"], overdueCrons: [], rollingCrawl: { status: "aktuell-degradiert", alertLevel: "alarm" } };
  const al = await deliverMonitoringWebhook(alarm, deps(env));
  check("geänderter Zustand -> neue event_id, Zustellung erfolgt", al.sent === true && al.eventId !== hb.eventId && /^al-/.test(al.eventId) && received.length === 2);
  check("Ereigniskennung deterministisch (gleicher Zustand -> gleiche id)",
    buildWebhookEventId(alarm, Date.now()) === al.eventId);

  // ── 3b. Flattern: Alarm -> Heartbeat -> DERSELBE Alarm bleibt dedupliziert ─
  // (Review-Fix: Gedächtnis ist eine LISTE, nicht nur der letzte Merkplatz.)
  const flapAlarm = { ...alarm, healthBlockers: ["flatter-fall"] };
  const otherAlarm = { ...alarm, healthBlockers: ["anderer-fall"] };
  const flap1 = await deliverMonitoringWebhook(flapAlarm, deps(env));
  const flapOther = await deliverMonitoringWebhook(otherAlarm, deps(env)); // ANDERES Ereignis dazwischen zugestellt
  const flap2 = await deliverMonitoringWebhook(flapAlarm, deps(env));
  check("Flattern: identischer Alarm nach zwischenzeitlich ANDEREM Ereignis bleibt dedupliziert",
    flap1.sent === true && flapOther.sent === true && flap2.skipped === true && flap2.reason === "duplicate-event");

  // ── 4a. 5xx wird begrenzt wiederholt, dann Erfolg ─────────────────────────
  stateStore = null; received.length = 0;
  failNextWith = [500];
  const retried = await deliverMonitoringWebhook({ ...alarm, healthBlockers: ["retry-fall"] }, deps({ ...env, HELMUT_MONITORING_WEBHOOK_RETRY_MAX: "2" }));
  check("5xx wird wiederholt, zweiter Versuch erfolgreich", retried.sent === true && retried.attempts === 2 && received.length === 2);

  // ── 4b. 4xx wird NICHT wiederholt (dauerhafter Fehler) ────────────────────
  stateStore = null; received.length = 0;
  failNextWith = [404, 404, 404];
  const perm = await deliverMonitoringWebhook({ ...alarm, healthBlockers: ["vierxx-fall"] }, deps({ ...env, HELMUT_MONITORING_WEBHOOK_RETRY_MAX: "2" }));
  check("4xx: genau ein Versuch, kein Retry", perm.sent === false && perm.attempts === 1 && received.length === 1);
  check("fehlgeschlagene Zustellung im Status persistiert", stateStore && stateStore.sent === false && stateStore.status === 404);

  // ── 4c. Harte Obergrenze: dauerhaft 5xx endet nach retryMax+1 Versuchen ───
  stateStore = null; received.length = 0;
  failNextWith = [500, 500, 500, 500, 500];
  const capped = await deliverMonitoringWebhook({ ...alarm, healthBlockers: ["dauer-5xx"] }, deps({ ...env, HELMUT_MONITORING_WEBHOOK_RETRY_MAX: "2" }));
  check("dauerhaftes 5xx: exakt 3 Versuche (1 + 2 Retries), keine Endlosschleife", capped.sent === false && capped.attempts === 3 && received.length === 3);

  // ── 6. Datenschutz: kein PII/Secret/Politik-Inhalt im Payload ─────────────
  stateStore = null; received.length = 0; failNextWith = null;
  const dirty = {
    ok: false, text: "Status · Kontakt person@example.invalid · Bearer cronsecretFAKE1234567890",
    state: "Degradiert", severity: "alarm",
    briefingText: "VERTRAULICH: Briefing", userEmail: "person@example.invalid",
    profile: { partei: "Die Linke" }, documents: [{ title: "Interner Vorgang" }],
    rollingCrawl: { status: "aktuell-degradiert", alertLevel: "alarm", worstRun: { state: "stark-degradiert", failedSources: 129, checkedSources: 145 } }
  };
  await deliverMonitoringWebhook(dirty, deps(env));
  const serialized = JSON.stringify(received[0].body);
  check("keine verbotenen Felder im Payload", !serialized.includes("VERTRAULICH") && !serialized.includes("Die Linke") && !serialized.includes("Interner Vorgang") && !("profile" in received[0].body));
  check("Secrets/E-Mail redigiert (Redaction-Doppelboden)", !serialized.includes("cronsecretFAKE1234567890") && !serialized.includes("person@example.invalid"));
  check("keine vollständige Webhook-URL im Payload (kein Token-Leak)", !serialized.includes(hookUrl));
  check("rollierende Zähler bleiben rein numerisch/Slug", received[0].body.rollingCrawl.worstFailedSources === 129 && received[0].body.rollingCrawl.worstState === "stark-degradiert");

  server.close();
  console.log(`\n${passed}/${passed + failed} Monitoring-Webhook-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((err) => { console.error("Suite-Fehler:", err); server.close(); process.exit(1); });
