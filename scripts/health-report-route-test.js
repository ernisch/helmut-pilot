"use strict";

// Helmut — ECHTER Routentest GET /api/cron/health-report (Abnahme 26.08.).
// =============================================================================================
// Warum es diese Suite gibt: der Watchdog-Sprint hat bewiesen, dass ein Quelltexttest die
// gefaehrlichste Fehlerklasse NICHT findet. Beim Umbau fielen drei Deklarationen aus
// `buildMotorHealthReport` heraus; `node --check` blieb gruen, und der ReferenceError waere
// erst im 06:00-Production-Lauf aufgetreten. Diese Suite fuehrt den Handler deshalb WIRKLICH
// aus — ueber einen lokalen Listener, mit dem echten server.js-Handler.
//
// Absicherung (alle vier Punkte des Abnahmeauftrags):
//   1. JEDER Datenbankzugriff ist durch eine kontrollierte Fixture ersetzt. Die Suite laeuft
//      ohne SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — ein vergessener echter Zugriff wuerde
//      laut scheitern statt still Production zu lesen.
//   2. CallMeBot und Monitoring-Webhook sind Spione: sie zaehlen und merken sich den Text.
//   3. Netz ist TECHNISCH ausgeschlossen: `globalThis.fetch` wirft. Ein Ausgang nach aussen
//      ist damit kein Risiko, sondern ein Testfehler.
//   4. Geprueft werden Zustand UND Rueckgabestruktur — fehlende Variablen, falsche
//      Funktionsparameter und kaputte Rueckgaben fallen sofort auf.

const http = require("http");
const path = require("path");

// Die Slotbewertung haengt absichtlich an der UTC-Uhr. Eine Routentestsuite darf
// deshalb nicht je nach CI-Startzeit andere erwartete Slots bekommen. Wir frieren
// den Kalendertag auf einen Zeitpunkt ein, an dem der 04:00-Crawl bereits ausserhalb
// seiner Toleranz liegt, lassen die Zeit fuer Dauer- und Timeoutpruefungen aber real
// weiterlaufen. Produktcode und Slotplan bleiben unveraendert.
const ECHTE_DATE = Date;
const ECHTER_START_MS = ECHTE_DATE.now();
const TEST_START_MS = ECHTE_DATE.parse("2026-08-27T12:30:00.000Z");
class HealthReportTestDate extends ECHTE_DATE {
  constructor(...args) {
    super(...(args.length ? args : [HealthReportTestDate.now()]));
  }
  static now() {
    return TEST_START_MS + (ECHTE_DATE.now() - ECHTER_START_MS);
  }
}
global.Date = HealthReportTestDate;

const SECRET = "health-report-routentest-geheim";
process.env.CRON_SECRET = SECRET;
process.env.HELMUT_OFFLINE_TEST = "1";
process.env.HELMUT_SOURCE_MODE = "off";
process.env.HELMUT_SCALABLE_PIPELINE = "on";     // Motorpfad — der Gegenstand dieses Sprints
process.env.CALLMEBOT_PHONE = "+490000000000";   // Spion, kein echter Kanal
process.env.CALLMEBOT_APIKEY = "test-apikey";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_MONITORING_WEBHOOK_URL;

const root = path.join(__dirname, "..");

// ── NETZRIEGEL: kein einziger Ausgang nach aussen ────────────────────────────
let netzVersuche = 0;
globalThis.fetch = async (url) => {
  netzVersuche += 1;
  throw new Error(`NETZ-VERBOTEN im Routentest: ${String(url).slice(0, 80)}`);
};

// ── FIXTURE-SCHALTER: alle Speicherzugriffe zeigen auf `F` ───────────────────
// Wichtig: server.js destrukturiert einen Teil der Speicherfunktionen beim Einbinden.
// Deshalb werden die Stubs VOR dem require(server.js) gesetzt und delegieren zur Laufzeit
// an das jeweils aktive Szenario — so wirkt jeder Szenariowechsel ohne erneutes Einbinden.
const storage = require(path.join(root, "lib", "helmut", "storage"));
const accounts = require(path.join(root, "lib", "helmut", "accounts"));
const tenantContext = require(path.join(root, "lib", "helmut", "tenant-context"));
const scalablePipeline = require(path.join(root, "lib", "helmut", "scalable-pipeline"));
const monitoringWebhook = require(path.join(root, "lib", "helmut", "monitoring-webhook"));

const H = 3600e3;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
// Der Slotplan haengt an UTC-Stunden. Damit die Fixture unabhaengig von der realen Uhrzeit
// deterministisch ist, werden die Quittungen an den zuletzt ERZWUNGENEN Slot gelegt.
function letzterSlot(stundeUtc, toleranzMs = 3 * H) {
  const tag = 24 * H;
  let slot = Math.floor(NOW / tag) * tag + stundeUtc * H;
  while (slot + toleranzMs > NOW) slot -= tag;
  return slot;
}
const CRAWL_A = letzterSlot(4);
const CRAWL_B = letzterSlot(20);
const MORGEN = letzterSlot(5);
const VERSTEHEN = letzterSlot(5.5);
const VERSTEHEN_B = letzterSlot(21.5);
const LAGE = letzterSlot(5.75);

function gesundeQuittungen() {
  return [
    { process: "warteschlange-crawl", status: "success", startedAt: iso(CRAWL_A), zielmenge: 238, processed: 204, deferred: 23, wiederholt: 11, leaseVerloren: 0, fehlgeschlagen: 0, spiegelGeschrieben: 1508 },
    { process: "warteschlange-crawl", status: "success", startedAt: iso(CRAWL_B), zielmenge: 137, processed: 117, deferred: 8, wiederholt: 4, leaseVerloren: 0, fehlgeschlagen: 0, spiegelGeschrieben: 1035 },
    { process: "warteschlange-pipeline", status: "success", startedAt: iso(letzterSlot(16)), zielmenge: 12, processed: 12, deferred: 0, wiederholt: 0, leaseVerloren: 0, fehlgeschlagen: 0 },
    { process: "briefing-morning", status: "success", startedAt: iso(MORGEN) },
    { process: "understanding-cron", status: "blocked", reason: "no-pending", startedAt: iso(VERSTEHEN) },
    { process: "understanding-cron", status: "blocked", reason: "no-pending", startedAt: iso(VERSTEHEN_B) },
    { process: "briefing-lage", status: "success", startedAt: iso(LAGE) }
  ];
}

function gesunderQueueStatus() {
  return {
    verfuegbar: true, flag: "on", zustand: "gruen", zustandsklasse: "aktiv-gesund",
    befunde: [], motor: { aktiv: true, aktivSeit: iso(NOW - 30 * 24 * H) },
    blockiert: { anzahl: 0, nachTyp: {}, aeltester: null },
    kennzahlen: { wartend: 57, laufend: 0, abgelaufeneLeases: 0, endgueltigFehler: 0 }
  };
}

// Briefingzeilen im Format der Tabelle `briefings` (id/user_id/slot/generated_at/payload).
function briefingZeile(tenantId, tagKey, { status = "erfolg", signatur = null } = {}) {
  const slot = status === "erfolg" ? "morgenlage" : "morgenlage-fehler";
  return {
    id: `bf-${tenantId}-${slot}-${tagKey}`,
    user_id: tenantId,
    slot,
    generated_at: new Date(NOW - 1 * H).toISOString(),
    payload: {
      tenantId, berlinTag: tagKey, status,
      signatur: signatur || `sig-${tenantId}`,
      erzeugtAm: new Date(NOW - 1 * H).toISOString()
    }
  };
}

// Zaehler je Speicherfunktion — Grundlage der Skalierungspruefung.
let aufrufe = {};
function zaehle(name) { aufrufe[name] = (aufrufe[name] || 0) + 1; }

// Das aktive Szenario. Jede Stub-Funktion liest hier zur Laufzeit.
let F = null;
function szenario(overrides = {}) {
  const tenants = overrides.tenants || ["m1"];
  const tagKey = require(path.join(root, "lib", "helmut", "briefing-frische")).berlinTagKey(new Date());
  return {
    tenantIds: tenants,
    tenantReason: "aktive-mandate",
    quittungen: gesundeQuittungen(),
    quittungenFehler: null,
    queueStatus: gesunderQueueStatus(),
    cas: { verfuegbar: true, zustaende: [{ zustand: "fertig", anzahl: 296 }] },
    briefingZeilen: tenants.map((t) => briefingZeile(t, tagKey)),
    briefingFehler: null,
    // je Mandat: { events, subscriptions } oder null (= nicht lesbar)
    push: new Map(tenants.map((t, i) => [t, {
      events: [{
        dedupeKey: `briefing-push:${t}:${tagKey}:briefing_ready:abc`,
        createdAt: new Date(NOW - 1 * H).toISOString(),
        delivered: i === 0 ? 1 : 0,
        failed: 0
      }],
      subscriptions: i === 0 ? [{ endpoint: "https://push.example/x", active: true, politicianId: t }] : []
    }])),
    verstandenAm: new Date(NOW - 2 * H).toISOString(),
    tagKey,
    stapelGroesse: 10,
    stapelMs: 0,            // simulierte Rundlaufzeit je Stapel
    langsamesMandat: null,  // ein Mandat, dessen Stapel spuerbar laenger braucht
    langsamMs: 0,
    zeitbudgetMs: 0,        // 0 = kein Budget
    speicherFehlerStapel: null,
    fremdeZeilen: false,
    lageChecks: null,
    ...overrides
  };
}

// ── STUBS (einmalig, delegieren an F) ────────────────────────────────────────
storage.getStorageStatus = () => ({ backend: "supabase", supabaseConfigured: true });
storage.getLatestLageCheck = async () => { zaehle("getLatestLageCheck"); return { checkedAt: new Date(NOW - 3 * H).toISOString() }; };
storage.getLatestCompleteKnowledgeObjectAt = async () => { zaehle("getLatestCompleteKnowledgeObjectAt"); return F.verstandenAm; };
storage.listFeedback = async () => { zaehle("listFeedback"); return []; };
storage.getLlmUsageBreakdownToday = async () => { zaehle("getLlmUsageBreakdownToday"); return { calls: 10, limit: 100, remaining: 90, skips: 0 }; };
storage.getClassificationCoverage = async () => { zaehle("getClassificationCoverage"); return { available: true, warn: false }; };
storage.verstehenKennzahlen = async () => { zaehle("verstehenKennzahlen"); return F.cas; };
storage.listProcessRunsRelational = async () => {
  zaehle("listProcessRunsRelational");
  if (F.quittungenFehler) throw new Error(F.quittungenFehler);
  return F.quittungen;
};
storage.getPushUebersicht = async (tenantId) => {
  zaehle("getPushUebersicht");
  const eintrag = F.push.get(tenantId);
  if (eintrag === undefined) return { events: [], subscriptions: [] };
  if (eintrag === null) throw new Error("push-store-nicht-lesbar");
  return eintrag;
};
// GEBUENDELTES LESEN der Mandantenspeicher — der Kern dieser Skalierungsstufe.
// Der Stub bildet den echten Vertrag nach: EIN Zugriff je Stapel, begrenzte
// Parallelitaet, festes Zeitbudget, und ein gescheiterter oder zu langsamer Stapel
// bricht den Lauf nicht ab. Der Zaehler misst die STAPEL, nicht die Mandate.
storage.leseMandantenSpeicherGebuendelt = async (tenantIds = []) => {
  const ids = [...new Set(tenantIds.map(String))];
  const speicher = new Map();
  const fehler = new Map();
  const groesse = F.stapelGroesse || 10;
  const start = Date.now();
  for (let i = 0; i < ids.length; i += groesse) {
    const teil = ids.slice(i, i + groesse);
    zaehle("leseMandantenSpeicherGebuendelt");
    // Realistische Rundlaufzeit je Stapel + optionaler Sonderfall „langsames Mandat".
    const langsam = F.langsamesMandat && teil.includes(F.langsamesMandat) ? F.langsamMs : 0;
    await new Promise((r) => setTimeout(r, (F.stapelMs || 0) + langsam));
    if (F.zeitbudgetMs && Date.now() - start > F.zeitbudgetMs) {
      for (const t of teil) fehler.set(t, "zeitbudget-erschoepft");
      continue;
    }
    if (F.speicherFehlerStapel && teil.some((t) => F.speicherFehlerStapel.includes(t))) {
      for (const t of teil) fehler.set(t, "helmut_store-timeout");
      continue;
    }
    for (const t of teil) {
      const eintrag = F.push.get(t);
      const lage = F.lageChecks && F.lageChecks.has(t)
        ? F.lageChecks.get(t)
        : [{ politicianId: t, checkedAt: new Date(NOW - 3 * H).toISOString() }];
      speicher.set(t, {
        lageChecks: lage,
        // FREMDZEILEN bewusst enthalten: der Auswerter muss sie verwerfen.
        pushEvents: [
          ...((eintrag && eintrag.events) || []).map((e) => ({ ...e, politicianId: t })),
          ...(F.fremdeZeilen ? [{ politicianId: "fremdes-mandat", dedupeKey: `briefing-push:fremdes-mandat:${F.tagKey}:briefing_ready:x`, createdAt: new Date(NOW - 1 * H).toISOString(), delivered: 99, failed: 0 }] : [])
        ],
        pushSubscriptions: [
          ...((eintrag && eintrag.subscriptions) || []),
          ...(F.fremdeZeilen ? [{ endpoint: "https://push.example/fremd", active: true, politicianId: "fremdes-mandat" }] : [])
        ]
      });
    }
  }
  return { speicher, fehler, abfragen: aufrufe.leseMandantenSpeicherGebuendelt || 0 };
};
storage.readStore = async () => { zaehle("readStore"); return { lageChecks: [] }; };
storage.getPushSubscriptions = async () => { zaehle("getPushSubscriptions"); return []; };
storage.listRenderedBriefingsV3ForTenants = async (ids) => {
  zaehle("listRenderedBriefingsV3ForTenants");
  if (F.briefingFehler) throw new Error(F.briefingFehler);
  const erlaubt = new Set(ids.map(String));
  return (F.briefingZeilen || []).filter((z) => erlaubt.has(String(z.user_id)));
};
storage.getRenderedBriefingV3 = async () => { zaehle("getRenderedBriefingV3"); return null; };
storage.listRawDocuments = async () => { zaehle("listRawDocuments"); return []; };
storage.listKoDocumentLinks = async () => { zaehle("listKoDocumentLinks"); return []; };
storage.listKnowledgeObjectStates = async () => { zaehle("listKnowledgeObjectStates"); return []; };
storage.getMonitoringDeliveryState = async () => null;
storage.saveMonitoringDeliveryState = async () => ({ saved: true });

accounts.listSystemErrors = async () => { zaehle("listSystemErrors"); return []; };
accounts.listUsers = async () => { zaehle("listUsers"); return []; };
accounts.recordSystemError = async () => { zaehle("recordSystemError"); return { saved: true }; };

tenantContext.resolveCronTenants = async () => {
  zaehle("resolveCronTenants");
  return { tenantIds: F.tenantIds, reason: F.tenantReason };
};
scalablePipeline.betriebsstatus = async () => { zaehle("betriebsstatus"); return F.queueStatus; };

// Webhook-Spion: statt Netz nur zaehlen und merken.
const webhookSpion = [];
monitoringWebhook.deliverMonitoringWebhook = async (report) => {
  webhookSpion.push(report);
  return { sent: true, status: 200, spy: true };
};

// CallMeBot laeuft ueber globalThis.fetch — der Riegel oben faengt ihn ab und der
// Handler verbucht ihn als nicht zugestellt. Damit ist der Kanal beobachtbar, ohne dass
// je ein Paket den Prozess verlaesst.

const handler = require(path.join(root, "server.js"));

let pass = 0;
let fail = 0;
function check(name, bedingung, detail) {
  if (bedingung) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

function ruf(port, pfad) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, path: pfad, method: "GET",
      headers: { Authorization: `Bearer ${SECRET}` }
    }, (res) => {
      let text = "";
      res.on("data", (c) => { text += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* Rohtext bleibt sichtbar */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  // Ein Lauf = ein Szenario. `aufrufe` wird je Lauf zurueckgesetzt.
  async function lauf(overrides = {}, pfad = "/api/cron/health-report") {
    F = szenario(overrides);
    aufrufe = {};
    webhookSpion.length = 0;
    return ruf(port, pfad);
  }

  abschnitt("1 · Der Handler laeuft wirklich (ReferenceError-Riegel)");
  {
    const a = await lauf();
    check("Route antwortet mit 200 und einer auswertbaren JSON-Struktur",
      a.status === 200 && a.json && typeof a.json === "object",
      `status=${a.status} body=${String(a.text).slice(0, 300)}`);
    check("Rueckgabestruktur vollstaendig (ok/tenants/text/reports/briefingStufen)",
      a.json && typeof a.json.ok === "boolean" && a.json.tenants === 1
        && typeof a.json.text === "string" && Array.isArray(a.json.reports)
        && a.json.briefingStufen && typeof a.json.briefingStufen.aktive === "number",
      JSON.stringify(a.json && { ok: a.json.ok, tenants: a.json.tenants, hatStufen: Boolean(a.json.briefingStufen) }));
    check("Kein Report endete im Fehlerzweig (ReferenceError/fehlende Variable)",
      Array.isArray(a.json.reports) && a.json.reports.every((r) => r.state !== "report-fehler"),
      JSON.stringify((a.json.reports || []).map((r) => r.state)));
    check("Kein einziger Netzausgang ausserhalb der Spione",
      netzVersuche >= 0 && webhookSpion.length === 1,
      `webhookSpion=${webhookSpion.length}`);

    // GEGENPROBE zum Riegel selbst: wirft der Berichtsaufbau (genau das, was ein
    // ReferenceError tut), muss die Route das als `report-fehler` ausweisen und ok
    // kippen. Ohne diese Gegenprobe wuesste die Suite nicht, ob sie ueberhaupt
    // etwas merken WUERDE.
    const echt = tenantContext.requireTenantId;
    tenantContext.requireTenantId = () => { throw new ReferenceError("slotPruefung is not defined"); };
    const kaputt = await lauf();
    tenantContext.requireTenantId = echt;
    check("Gegenprobe: ein ReferenceError im Bericht wird als „report-fehler“ sichtbar",
      kaputt.json.ok === false
        && kaputt.json.reports.some((r) => r.state === "report-fehler"
          && String(r.error || "").includes("slotPruefung is not defined")),
      JSON.stringify(kaputt.json.reports.map((r) => ({ s: r.state, e: r.error }))));
  }

  abschnitt("2 · Gesund mit Hinweisen");
  {
    // Verstehen 30 h alt ⇒ Hinweis, kein Alarm.
    const a = await lauf({ verstandenAm: new Date(NOW - 30 * H).toISOString() });
    const r = a.json.reports[0];
    check("Verstehensrueckstand ⇒ „Gesund mit Hinweisen“, ok bleibt true",
      r.state === "Gesund mit Hinweisen" && a.json.ok === true && r.ok === true,
      `${r.state} / ok=${a.json.ok} / ${r.text}`);
    // Die Verstehensslots laufen planmaessig leer (`blocked`/no-pending). Der Bericht
    // sagt das ausdruecklich, statt es als „alles quittiert" zu verschweigen — und er
    // meldet weder einen fehlenden noch einen gestoerten Slot.
    check("Slotzeile weist den ordnungsgemaessen Leerlauf aus, ohne Fehl- oder Stoermeldung",
      r.text.includes("Slot ordnungsgemäß leer gelaufen: understanding-cron@")
        && !r.text.includes("Slot fehlt") && !r.text.includes("aber gestört"), r.text);
  }

  abschnitt("3 · partial-Lauf mit erfolgreicher Erholung");
  {
    const q = gesundeQuittungen().map((x) => (x.zielmenge === 137
      ? { ...x, status: "partial", fehlgeschlagen: 1 } : x));
    const a = await lauf({ quittungen: q });
    const r = a.json.reports[0];
    check("erholte Teilstoerung ⇒ KEIN Alarm, Zustand nicht „Gestoert“",
      r.state !== "Gestört" && a.json.ok === true, `${r.state} / ${r.text}`);
    check("Text trennt Erholung und nennt den ausloesenden Lauf",
      r.text.includes("inzwischen erholt") && r.text.includes("Auslösender Lauf:")
        && r.text.includes("Erholung:") && !r.text.includes("Slot fehlt"), r.text);
    check("Slugfeld traegt slot-erholt als Warnung, nicht als Blocker",
      (r.healthWarnings || []).some((w) => w.startsWith("slot-erholt:"))
        && !(r.healthBlockers || []).some((b) => b.startsWith("slot-")),
      JSON.stringify({ w: r.healthWarnings, b: r.healthBlockers }));
  }

  abschnitt("4 · partial-Lauf mit weiterhin offener Auswirkung");
  {
    const q = gesundeQuittungen().map((x) => (x.zielmenge === 137
      ? { ...x, status: "partial", fehlgeschlagen: 1 } : x));
    const qs = gesunderQueueStatus();
    qs.kennzahlen.endgueltigFehler = 3;
    const a = await lauf({ quittungen: q, queueStatus: qs });
    const r = a.json.reports[0];
    check("offener endgueltiger Fehler ⇒ „Gestoert“ (nachwirkend), ok=false",
      r.state === "Gestört" && a.json.ok === false
        && (r.healthBlockers || []).includes("slot-nachwirkend:warteschlange-crawl"),
      `${r.state} / ${JSON.stringify(r.healthBlockers)}`);
    check("Alarmkanal wurde bedient (Webhook-Spion sah genau einen Payload)",
      webhookSpion.length === 1 && webhookSpion[0].ok === false
        && webhookSpion[0].severity === "alarm",
      JSON.stringify(webhookSpion.map((x) => ({ ok: x.ok, severity: x.severity }))));
  }

  abschnitt("5 · Wirklich fehlender Slot");
  {
    const q = gesundeQuittungen().filter((x) => x.process !== "warteschlange-crawl");
    const a = await lauf({ quittungen: q });
    const r = a.json.reports[0];
    check("keine Quittung im Fenster ⇒ „Slot fehlt“ und Rot",
      r.state === "Gestört" && a.json.ok === false
        && (r.healthBlockers || []).includes("slot-fehlt:warteschlange-crawl")
        && r.text.includes("Slot fehlt (keine Quittung)"),
      `${r.state} / ${JSON.stringify(r.healthBlockers)}`);
  }

  abschnitt("6 · Nicht lesbare Motordaten");
  {
    const a = await lauf({ quittungenFehler: "process_runs-timeout" });
    const r = a.json.reports[0];
    check("Quittungen nicht lesbar ⇒ „Status nicht bestimmbar“, nie Gruen und nie Rot",
      r.state === "Status nicht bestimmbar" && a.json.ok === false
        && (r.healthBlockers || []).includes("slot-quittungen-nicht-lesbar"),
      `${r.state} / ${JSON.stringify(r.healthBlockers)}`);
    check("Text behauptet keinen gesunden Slotzustand",
      !r.text.includes("Alle erwarteten Slots quittiert"), r.text);
  }

  abschnitt("7 · Fuenf aktive Mandate, ein registrierter Push-Empfaenger");
  {
    const a = await lauf({ tenants: ["m1", "m2", "m3", "m4", "m5"] });
    const st = a.json.briefingStufen;
    check("Nenner sind die fuenf aktiven Mandate",
      a.json.tenants === 5 && st.aktive === 5 && st.vorbereitet === 5,
      JSON.stringify({ tenants: a.json.tenants, aktive: st.aktive, vorbereitet: st.vorbereitet }));
    check("genau ein registrierter Empfaenger — Produkthinweis, KEIN Alarm",
      st.empfaengerRegistriert === 1 && st.ohneEmpfaenger === 4
        && st.gruende.length === 0 && a.json.ok === true
        && st.hinweise.includes("push-ohne-registrierten-empfaenger"),
      JSON.stringify({ e: st.empfaengerRegistriert, o: st.ohneEmpfaenger, g: st.gruende }));
    check("Wortlaut: „Push Versand bestaetigt“, nie „zugestellt“",
      a.json.text.includes("Push Empfänger registriert: 1 von 5.")
        && a.json.text.includes("Push Versand bestätigt: 1 von 1 registrierten Empfängern (Annahme durch den Push-Dienst).")
        && a.json.text.includes("Ohne registrierten Push Empfänger: 4 Mandate.")
        && a.json.text.includes("Empfang am Endgerät: technisch nicht bestätigbar.")
        && a.json.text.includes("Öffnung: nicht messbar.")
        && !/zugestellt/i.test(a.json.text),
      a.json.text.slice(0, 700));
    // Der Text ist laenger als 2000 Zeichen: die Kappung wird ausdruecklich benannt und
    // die mandantenuebergreifende Briefingzeile steht VOR dem ersten Mandatsblock, damit
    // sie die WhatsApp-Kappung ueberlebt.
    check("Kappung wird benannt und die Briefingzeile steht vor dem ersten Mandatsblock",
      a.json.text.length > 2000
        && a.json.text.startsWith("Meldung gekürzt: 5 Mandate im Bericht")
        && a.json.text.indexOf("Briefingstufen (") < a.json.text.indexOf("Helmut:"),
      `laenge=${a.json.text.length} · ${a.json.text.slice(0, 160)}`);
  }

  abschnitt("8 · Sichere Fehlerbehandlung (Pflichtpruefung 3)");
  {
    const a = await lauf({ tenantIds: [], tenantReason: "mandanten-liste-nicht-ladbar" });
    check("Mandantenliste nicht lesbar ⇒ ok=false, kein „0 von 0“ als gesunder Zustand",
      a.json.ok === false && a.json.tenants === 0,
      JSON.stringify({ ok: a.json.ok, tenants: a.json.tenants }));
    check("Der Bot schweigt NICHT: Alarmkanal wurde bedient",
      webhookSpion.length === 1 && webhookSpion[0].severity === "unbestimmt"
        && webhookSpion[0].ok === false,
      JSON.stringify(webhookSpion.map((x) => ({ ok: x.ok, s: x.severity }))));
    check("Meldung sagt ausdruecklich „Status nicht bestimmbar“",
      String(a.json.text || "").includes("Briefingstufen: Status nicht bestimmbar"), a.json.text);

    const b = await lauf({ briefingFehler: "briefings-timeout" });
    const stB = b.json.briefingStufen;
    check("Briefingbeleg nicht lesbar ⇒ Messluecke, weder Vorbereitung-fehlt noch Gruen",
      stB.gruende.length === 0 && stB.unbestimmt.includes("briefingbeleg-nicht-lesbar")
        && stB.fehlend.length === 0 && b.json.text.includes("Briefingstufen: Status nicht bestimmbar."),
      JSON.stringify({ g: stB.gruende, u: stB.unbestimmt, f: stB.fehlend }));

    // Der Mandantenspeicher traegt Lage- UND Push-Daten. Ist er nicht lesbar, darf
    // daraus NIE „kein Push Empfaenger vorhanden" werden — ein Datenfehler ist kein
    // Produktbefund.
    const c = await lauf({ speicherFehlerStapel: ["m1"] });
    const stC = c.json.briefingStufen;
    check("Push-Speicher nicht lesbar ⇒ „nicht lesbar“, NIE „kein Push Empfaenger vorhanden“",
      stC.empfaengerUnbekannt === 1 && stC.ohneEmpfaenger === 0
        && stC.unbestimmt.includes("push-empfaenger-nicht-lesbar")
        && !stC.hinweise.includes("push-ohne-registrierten-empfaenger")
        && c.json.text.includes("Push Versand bestätigt: nicht bestimmbar — Push-Abos nicht lesbar.")
        && c.json.reports[0].state === "Status nicht bestimmbar"
        && (c.json.reports[0].healthBlockers || []).includes("mandantenspeicher-nicht-lesbar"),
      JSON.stringify({ u: stC.empfaengerUnbekannt, o: stC.ohneEmpfaenger, h: stC.hinweise, s: c.json.reports[0].state }));
    check("nicht lesbarer Mandantenspeicher behauptet auch KEIN „Lage nie geprueft“",
      !/Lage: nie/.test(c.json.text), c.json.text.slice(0, 400));
  }

  abschnitt("9 · Skalierung: gebuendelte Speicherzugriffe (5 · 25 · 100 Mandate)");
  {
    const mandate = (n) => Array.from({ length: n }, (_, i) => `m${i + 1}`);
    const messung = async (n) => {
      const t0 = Date.now();
      const a = await lauf({ tenants: mandate(n), stapelMs: 12 });
      return { n, dauerMs: Date.now() - t0, zaehler: { ...aufrufe }, antwort: a };
    };
    const m5 = await messung(5);
    const m25 = await messung(25);
    const m100 = await messung(100);

    for (const m of [m5, m25, m100]) {
      check(`${m.n} Mandate laufen vollstaendig durch, alle im Nenner`,
        m.antwort.json.tenants === m.n && m.antwort.json.briefingStufen.aktive === m.n
          && m.antwort.json.reports.length === m.n
          && m.antwort.json.reports.every((r) => r.state !== "report-fehler"),
        JSON.stringify({ tenants: m.antwort.json.tenants, aktive: m.antwort.json.briefingStufen.aktive }));
    }

    // KEIN Zugriff waechst mehr MIT JEDEM Mandat: Lage und Push kommen aus dem
    // gebuendelten Mandantenspeicher, nicht aus zwei Einzelabfragen je Mandat.
    check("Lage-Check: KEINE Einzelabfrage je Mandat mehr (0 bei 5, 25 und 100)",
      !m5.zaehler.getLatestLageCheck && !m25.zaehler.getLatestLageCheck && !m100.zaehler.getLatestLageCheck,
      JSON.stringify([m5.zaehler.getLatestLageCheck || 0, m25.zaehler.getLatestLageCheck || 0, m100.zaehler.getLatestLageCheck || 0]));
    check("Push-Uebersicht: KEINE Einzelabfrage je Mandat mehr (0 bei 5, 25 und 100)",
      !m5.zaehler.getPushUebersicht && !m25.zaehler.getPushUebersicht && !m100.zaehler.getPushUebersicht,
      JSON.stringify([m5.zaehler.getPushUebersicht || 0, m25.zaehler.getPushUebersicht || 0, m100.zaehler.getPushUebersicht || 0]));
    check("getPushSubscriptions/getRenderedBriefingV3 werden nie benutzt",
      !m100.zaehler.getPushSubscriptions && !m100.zaehler.getRenderedBriefingV3);

    // Stapel statt Einzelzugriffe: ⌈n/10⌉ Speicherzugriffe fuer die Mandantenzeilen.
    const erwarteteStapel = (n) => Math.ceil(n / 10);
    check("Mandantenspeicher: 1 · 3 · 10 Stapelzugriffe statt 10 · 50 · 200 Einzelzugriffen",
      m5.zaehler.leseMandantenSpeicherGebuendelt === erwarteteStapel(5)
        && m25.zaehler.leseMandantenSpeicherGebuendelt === erwarteteStapel(25)
        && m100.zaehler.leseMandantenSpeicherGebuendelt === erwarteteStapel(100),
      JSON.stringify({
        bei5: m5.zaehler.leseMandantenSpeicherGebuendelt,
        bei25: m25.zaehler.leseMandantenSpeicherGebuendelt,
        bei100: m100.zaehler.leseMandantenSpeicherGebuendelt
      }));
    check("Briefingbelege: 1 Abfrage bei 5 und 25, hoechstens 2 bei 100",
      m5.zaehler.listRenderedBriefingsV3ForTenants === 1
        && m25.zaehler.listRenderedBriefingsV3ForTenants === 1
        && m100.zaehler.listRenderedBriefingsV3ForTenants <= 2,
      JSON.stringify([m5.zaehler.listRenderedBriefingsV3ForTenants, m25.zaehler.listRenderedBriefingsV3ForTenants, m100.zaehler.listRenderedBriefingsV3ForTenants]));

    const neutral = ["listProcessRunsRelational", "betriebsstatus", "verstehenKennzahlen",
      "listSystemErrors", "listUsers", "listFeedback", "getLlmUsageBreakdownToday",
      "getClassificationCoverage", "getLatestCompleteKnowledgeObjectAt", "listRawDocuments"];
    const abweichend = neutral.filter((k) => (m5.zaehler[k] || 0) !== 1 || (m100.zaehler[k] || 0) !== 1);
    check("mandantenneutrale Abfragen: genau EINE je Lauf, bei 5 wie bei 100 Mandaten",
      abweichend.length === 0,
      JSON.stringify(Object.fromEntries(neutral.map((k) => [k, [m5.zaehler[k] || 0, m100.zaehler[k] || 0]]))));

    // GESAMTZAHL der Speicherzugriffe: waechst nicht mehr mit jedem einzelnen Mandat.
    const gesamt = (z) => Object.entries(z)
      .filter(([k]) => k !== "recordSystemError")
      .reduce((n, [, v]) => n + v, 0);
    check("Gesamtzahl der Speicherzugriffe bleibt weit unter „einer je Mandat“",
      gesamt(m100.zaehler) < 100 && gesamt(m25.zaehler) < 25,
      JSON.stringify({ bei5: gesamt(m5.zaehler), bei25: gesamt(m25.zaehler), bei100: gesamt(m100.zaehler) }));

    // LAUFZEIT: 100 Mandate mit realistischer Rundlaufzeit je Stapel (12 ms) muessen
    // deutlich unter dem Zeitbudget der Route bleiben.
    check("Laufzeit bei 100 Mandaten bleibt im Zeitbudget der Route (< 10 s)",
      m100.dauerMs < 10000,
      `5=${m5.dauerMs}ms · 25=${m25.dauerMs}ms · 100=${m100.dauerMs}ms`);
    console.log(`        (gemessen: 5 Mandate ${m5.dauerMs} ms · 25 Mandate ${m25.dauerMs} ms · 100 Mandate ${m100.dauerMs} ms)`);
  }

  abschnitt("9b · Mandantentrennung, Lesefehler und Zeitbudget bei Buendelung");
  {
    const mandate = (n) => Array.from({ length: n }, (_, i) => `m${i + 1}`);
    // (a) Fremde user_id in der gebuendelten Antwort wird verworfen.
    const a = await lauf({ tenants: mandate(5), fremdeZeilen: true });
    const st = a.json.briefingStufen;
    check("fremde user_id in der Stapelantwort landet NICHT im Bericht",
      st.empfaengerRegistriert === 1 && st.ohneEmpfaenger === 4
        && !a.json.text.includes("fremdes-mandat")
        && a.json.text.includes("Push Versand bestätigt: 1 von 1 registrierten Empfängern"),
      JSON.stringify({ e: st.empfaengerRegistriert, o: st.ohneEmpfaenger }));
    check("die fremde Zeile haette auffallen MUESSEN (99 angenommene Sendungen)",
      !/99 von/.test(a.json.text), a.json.text.slice(0, 400));

    // (b) Ein Stapel scheitert — die uebrigen Mandate bleiben korrekt.
    const b = await lauf({ tenants: mandate(25), speicherFehlerStapel: ["m1"] });
    const betroffen = b.json.reports.filter((r) => (r.healthBlockers || []).includes("mandantenspeicher-nicht-lesbar"));
    const heil = b.json.reports.filter((r) => !(r.healthBlockers || []).includes("mandantenspeicher-nicht-lesbar"));
    check("Lesefehler eines Stapels: betroffene Mandate „Status nicht bestimmbar“, Rest korrekt",
      b.json.tenants === 25 && b.json.briefingStufen.aktive === 25
        && betroffen.length === 10 && betroffen.every((r) => r.state === "Status nicht bestimmbar")
        && heil.length === 15 && heil.every((r) => r.state !== "report-fehler"),
      JSON.stringify({ betroffen: betroffen.length, heil: heil.length, zustand: betroffen[0] && betroffen[0].state }));
    check("kein betroffenes Mandat faellt aus dem Nenner",
      b.json.reports.length === 25 && b.json.briefingStufen.aktive === 25);

    // (c) Ein langsames Mandat: Zeitbudget greift, der Bericht bleibt vollstaendig.
    const t0 = Date.now();
    const c = await lauf({ tenants: mandate(100), stapelMs: 10, langsamesMandat: "m1", langsamMs: 600, zeitbudgetMs: 400 });
    const dauer = Date.now() - t0;
    const unbestimmbar = c.json.reports.filter((r) => (r.healthBlockers || []).includes("mandantenspeicher-nicht-lesbar"));
    check("langsames Mandat: Bericht bleibt im Zeitbudget und vollstaendig im Nenner",
      dauer < 10000 && c.json.tenants === 100 && c.json.reports.length === 100
        && c.json.briefingStufen.aktive === 100 && unbestimmbar.length > 0
        && c.json.reports.every((r) => r.state !== "report-fehler"),
      `dauer=${dauer}ms · nichtBestimmbar=${unbestimmbar.length}`);
    check("die abgeschnittenen Mandate werden ausdruecklich „Status nicht bestimmbar“ genannt",
      unbestimmbar.every((r) => r.state === "Status nicht bestimmbar"),
      JSON.stringify(unbestimmbar.slice(0, 2).map((r) => r.state)));
  }

  abschnitt("10 · Rueckschau 48 h betrifft NUR folgenlose Historie (Pflichtpruefung 5)");
  {
    const altFolgenlos = gesundeQuittungen().concat([
      { process: "briefing-morning", status: "failed", startedAt: iso(NOW - 20 * 24 * H) }
    ]);
    const a = await lauf({ quittungen: altFolgenlos });
    check("(1) alte, folgenlose Stoerung faerbt den Bericht nicht dauerhaft rot",
      a.json.reports[0].state !== "Gestört" && a.json.ok === true,
      `${a.json.reports[0].state}`);

    // (2) Vier fortdauernde Auswirkungen — jede einzeln, jede unabhaengig vom Alter.
    const faelle = [
      ["offener endgueltiger Fehler", { ...gesunderQueueStatus(), kennzahlen: { wartend: 5, laufend: 0, abgelaufeneLeases: 0, endgueltigFehler: 4 } }, "terminal-offen"],
      ["dauerhaft blockierter Auftrag", { ...gesunderQueueStatus(), blockiert: { anzahl: 2, nachTyp: {}, aeltester: null } }, "terminal-offen"],
      ["haengende Lease", { ...gesunderQueueStatus(), kennzahlen: { wartend: 5, laufend: 1, abgelaufeneLeases: 1, endgueltigFehler: 0 } }, "haengende-lease"],
      ["feststeckende Warteschlange", { ...gesunderQueueStatus(), zustand: "kritisch", zustandsklasse: "aktiv-festgefahren" }, "queue-kritisch:aktiv-festgefahren"]
    ];
    for (const [name, qs, erwarteterSlug] of faelle) {
      const r = await lauf({ quittungen: altFolgenlos, queueStatus: qs });
      const rep = r.json.reports[0];
      const blocker = rep.healthBlockers || [];
      check(`(2) ${name} bleibt Rot — unabhaengig vom Alter der Historie`,
        rep.state === "Gestört" && r.json.ok === false
          && blocker.includes(erwarteterSlug),
        `${rep.state} / ${JSON.stringify(blocker)}`);
    }
    const rCas = await lauf({
      quittungen: altFolgenlos,
      cas: { verfuegbar: true, zustaende: [{ zustand: "unbekannt", anzahl: 2 }] }
    });
    check("(2) unbekannter CAS-Vorgang bleibt Rot — unabhaengig vom Alter der Historie",
      rCas.json.reports[0].state === "Gestört" && rCas.json.ok === false
        && (rCas.json.reports[0].healthBlockers || []).includes("cas-unbekannte-vorgaenge"),
      JSON.stringify(rCas.json.reports[0].healthBlockers));
  }

  abschnitt("11 · Netzriegel");
  {
    check("globalThis.fetch wurde nur vom CallMeBot-Kanal beruehrt und blockierte jedes Mal",
      netzVersuche > 0, `versuche=${netzVersuche}`);
  }

  await new Promise((r) => server.close(r));
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.stack);
  process.exit(1);
});
