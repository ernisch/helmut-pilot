"use strict";

// Sichere Verkaufsblocker (Audit-Folgebranch). KEIN Netz (fetch gestubt), KEINE
// echte DB (Storage-Funktionen gemockt). Deckt ab:
//  1. Admin "KI-Kosten heute" summiert nur den aktuellen Tag (getLlmUsageToday).
//  2. Zustandsändernder Backfill-Endpunkt lehnt execute per GET ab (CSRF).
//  3. Monitoring-Zweitkanal (Webhook) neben CallMeBot.
//  4. Cron-Vollständigkeit + Google-News-Auflösungsquote im Health-Report.
//  5. Radar-Mention-Quellen werden für nicht-Decision-KOs nachgeladen.
//  6. Asset-Versionierung: CLI-Deploy-Fallback, Shell referenziert styles.css/
//     client.js nur MIT ?v=, Kopplung vercel.json-immutable ↔ ?v=-Referenz,
//     ASSET_VERSION-Präzedenz FUNKTIONAL via __ASSET_VERSION-Hook (frischer
//     Modul-Load pro Env-Fall, weil ASSET_VERSION beim Load eingefroren wird).

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const schedulerSource = fs.readFileSync(path.join(root, "lib/helmut/scheduler.js"), "utf8");

// ── 1) Admin-Tageskosten (Struktur: keine 500-Log-Summe ohne Datumsfilter) ──
check("Admin-Account-Kosten nutzen getLlmUsageToday statt getLlmUsage(id,500)",
  serverSource.includes("const usageToday = await getLlmUsageToday(id)") &&
  !/const cost = dsAccountCost\(await getLlmUsage\(id, 500\)/.test(serverSource));
check("Tote dsAccountCost-Funktion entfernt", !serverSource.includes("function dsAccountCost("));

// ── 2) Backfill-Endpunkt: execute nur per POST (CSRF) ───────────────────────
check("ko-enrichment-backfill: Ausführung verlangt POST (405 sonst)",
  /wantsExecution && request\.method !== "POST"/.test(serverSource) &&
  /Ausführung nur per POST \(CSRF-geschützt\)/.test(serverSource));
check("ko-enrichment-backfill: execute/bypassBudget nur bei POST wirksam",
  /const execute = request\.method === "POST" && url\.searchParams\.get\("execute"\)/.test(serverSource) &&
  /const bypassBudget = request\.method === "POST" && url\.searchParams\.get\("bypassBudget"\)/.test(serverSource));

// ── 3) Monitoring-Zweitkanal (funktional) ───────────────────────────────────
(async () => {
  const server = require("../server.js");
  const sendWebhook = server.__sendMonitoringWebhook;

  const envBefore = process.env.HELMUT_MONITORING_WEBHOOK_URL;
  delete process.env.HELMUT_MONITORING_WEBHOOK_URL;
  const skipped = await sendWebhook({ text: "x", ok: true });
  check("Webhook ohne URL: sauber übersprungen (kein Fehler)", skipped.skipped === true && skipped.sent === false);

  const calls = [];
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, text: async () => "" }; };
  process.env.HELMUT_MONITORING_WEBHOOK_URL = "https://hooks.example.com/x";
  try {
    const sent = await sendWebhook({ text: "Report-Text", ok: false, state: "warn", severity: "watch", overdueCrons: ["Crawl"], googleUrlResolutionRate: 0.3 });
    check("Webhook mit URL: POST abgesetzt", sent.sent === true && calls.length === 1 && calls[0].opts.method === "POST");
    const body = JSON.parse(calls[0].opts.body);
    check("Webhook-Payload Slack-kompatibel (text) + strukturierte Felder",
      body.text === "Report-Text" && body.ok === false && Array.isArray(body.overdueCrons) && body.source === "helmut-health-report");
    // Netzfehler bricht den Kanal nicht.
    global.fetch = async () => { throw new Error("netzfehler"); };
    const errored = await sendWebhook({ text: "y" });
    check("Webhook-Netzfehler wird gefangen (kein throw)", errored.sent === false && /netzfehler/.test(errored.reason || ""));
  } finally {
    global.fetch = origFetch;
    if (envBefore === undefined) delete process.env.HELMUT_MONITORING_WEBHOOK_URL;
    else process.env.HELMUT_MONITORING_WEBHOOK_URL = envBefore;
  }

  // P1-7: der Text-Kanal erhält jetzt den redigierten buildAlarmText(report)
  // (Datenschutz-Leitplanke), der Webhook den Allowlist-Payload — beide weiterhin parallel.
  check("health-report-Cron ruft BEIDE Kanäle (CallMeBot + Webhook) parallel",
    /Promise\.all\(\[\s*\n\s*sendCallMeBotMessage\(buildAlarmText\(aggregate\)\),\s*\n\s*sendMonitoringWebhook\(aggregate\)/.test(serverSource));
  check("health-report loggt Systemfehler, wenn Report nicht grün UND kein Kanal konfiguriert",
    /KEIN Alarmkanal konfiguriert/.test(serverSource));
  // Phase 11: Dry-Run — Report bauen + Kanalstatus zeigen, ohne irgendetwas zu
  // versenden (Versand-Aufrufe liegen NACH dem dryRun-Return).
  check("health-report ?dryRun=1: baut Report ohne Versand (Return VOR den Versand-Aufrufen)",
    /dryRun.*=== "1"/.test(serverSource) &&
    serverSource.indexOf('url.searchParams.get("dryRun")') < serverSource.indexOf("sendCallMeBotMessage(buildAlarmText(aggregate))") &&
    serverSource.indexOf("if (dryRun)") < serverSource.indexOf("sendCallMeBotMessage(buildAlarmText(aggregate))") &&
    /dryRun: true[\s\S]{0,120}kanaele/.test(serverSource));

  // ── 4) Cron-Vollständigkeit + Google-News-Quote im Health-Report ──────────
  check("Health-Report prüft Infrastruktur-Cron-Überfälligkeit (Crawl/Lage)",
    /overdueCrons = cronChecks\.filter/.test(serverSource) && serverSource.includes("Cron überfällig"));
  check("Understanding-Output wird NICHT hart gegatet (kein Fehlalarm an ruhigen Tagen)",
    !/name: "Understanding", h: completeKoH, maxH/.test(serverSource) &&
    /Understanding-OUTPUT-Frische[\s\S]{0,200}BEWUSST NICHT hart/.test(serverSource));
  check("Health-Report zeigt Google-News-Auflösungsquote + Warnung <50%",
    serverSource.includes("Google-News-Links") && /gnrRate < 0\.5/.test(serverSource));
  check("Health-Report ok=false bei überfälligem Cron oder GN-Degradation",
    /ok: ok && overdueCrons\.length === 0 && !gnrDegraded/.test(serverSource));
  check("Crawl-Lauf persistiert googleUrlResolution (nicht nur Console-Log)",
    /googleUrlResolution: crawl\.googleUrlResolution/.test(schedulerSource));

  // ── 5) Radar-Mention-Quellen-Nachladen (Struktur + Deckel) ────────────────
  // Deckel haengt an radarState.MENTION_CAP (Audit-Folgebranch): ein eigener,
  // niedrigerer Wert (frueher 25 < 30) liess Erwaehnungs-KOs ab dem 26. ohne
  // nachgeladene Quelle wieder still verschwinden.
  check("Mention-KOs ohne geladene Quelle werden gezielt nachgeladen (Deckel = MENTION_CAP)",
    serverSource.includes("mentionNeedsSources") &&
    serverSource.includes("MENTION_SOURCE_LOAD_CAP = radarStateMod.MENTION_CAP"));
  check("Nachladen ist rein additiv (überschreibt keine geladene Quelle)",
    /if \(!sourcesByVorgang\[vid\]\) sourcesByVorgang\[vid\] = docs;/.test(serverSource));

  // ── 5b) Mention-Nachladen ist LOAD-BEARING (radarState-Vertrag) ───────────
  // Beweist, warum das Server-Nachladen nötig ist: eine belegte Eigenerwähnung
  // OHNE best_source_url verschwindet ohne geladene Quelle — und erscheint, sobald
  // die Quelle vorliegt (genau das liefert der neue Server-Pfad additiv nach).
  const radarState = require("../lib/helmut/radarState");
  const profile = { id: "u-one", fullName: "Test Politician One" };
  const mentionKo = {
    id: "ko-m", vorgang_id: "vg-m", status: "neu", understanding_status: "complete",
    mentioned_people: ["Test Politician One"], display_title: "Test Politician One fordert Reform",
    was_ist_passiert: "Test Politician One hat einen Antrag gestellt.", warum_wichtig: "x",
    // KEIN best_source_url — genau der ~37%-Fall aus dem Audit.
    updated_at: "2026-07-14T06:00:00Z"
  };
  const now = new Date("2026-07-14T09:00:00Z");
  const ohneQuelle = radarState.buildMentions(profile, [mentionKo], {}, now);
  check("Mention ohne Quelle UND ohne best_source_url verschwindet (belegter Audit-Fall)",
    ohneQuelle.length === 0);
  const mitQuelle = radarState.buildMentions(profile, [mentionKo], {
    "vg-m": [{ id: "d1", url: "https://www.tagesschau.de/x", source_name: "Tagesschau", link_type: "direct", published_at: "2026-07-14T06:00:00Z" }]
  }, now);
  check("Mention MIT nachgeladener Quelle erscheint (Fix ist load-bearing)",
    mitQuelle.length === 1 && /tagesschau/.test(mitQuelle[0].sourceUrl || ""));

  // ── 6) Asset-Versionierung (CLI-Deploy-Fallback + immutable-Kopplung) ──────
  check("ASSET_VERSION-Präzedenz: SHA > HELMUT_ASSET_VERSION > Konstante (Quelltext)",
    /VERCEL_GIT_COMMIT_SHA[\s\S]{0,120}HELMUT_ASSET_VERSION[\s\S]{0,80}"20260701-adminfix1"/.test(serverSource));
  const deploy = fs.readFileSync(path.join(root, "scripts/vercel-deploy.sh"), "utf8");
  check("Deploy-Skript setzt HELMUT_ASSET_VERSION aus Git-SHA+Zeit",
    /HELMUT_ASSET_VERSION=\$ASSET_VER/.test(deploy) && /git rev-parse --short=8 HEAD/.test(deploy));

  // 6a) Die ECHTE Production-Shell (Test-Hook __indexHtml, server.js) muss beide
  // immutable gecachten Kern-Assets versioniert referenzieren — und zwar NUR
  // versioniert (jede unversionierte Referenz wäre die Stale-Asset-Falle).
  const shell = server.__indexHtml();
  check("Shell (__indexHtml): styles.css nur MIT ?v= referenziert",
    /styles\.css\?v=/.test(shell) && !/styles\.css(?!\?v=)/.test(shell));
  check("Shell (__indexHtml): client.js nur MIT ?v= referenziert",
    /client\.js\?v=/.test(shell) && !/client\.js(?!\?v=)/.test(shell));

  // 6b) Kopplung vercel.json ↔ Shell: JEDE Route mit immutable-Cache-Header darf
  // in der Shell nur MIT ?v= vorkommen. Damit kann niemand eine neue immutable-
  // Route ergänzen (oder eine ?v=-Referenz entfernen), ohne dass dieser Test
  // rot wird.
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  const immutableRoutes = (vercelConfig.routes || []).filter((r) =>
    r.headers && /immutable/i.test(String(r.headers["Cache-Control"] || "")));
  check("vercel.json: immutable-Routen gefunden (mind. /assets, /styles.css, /client.js)",
    immutableRoutes.length >= 3);
  for (const route of immutableRoutes) {
    if (/\(\.\*\)/.test(route.src)) {
      // BEWUSSTE AUSNAHME: Muster-Routen wie /assets/(.*) — darunter liegen
      // favicon.ico und helmut_logo.svg, die absichtlich OHNE ?v= referenziert
      // werden (stabile Dateien; bei Byteänderung ist Umbenennung oder ?v=
      // Pflicht, siehe Audit-Befund "Unversionierte Referenzen unter
      // /assets-immutable"). Die versionierten /assets-Referenzen (Icons,
      // Manifest) deckt scripts/pwa-icon-test.js ab.
      continue;
    }
    const file = route.src.replace(/^\//, "");
    const esc = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    check(`immutable-Route ${route.src}: Shell referenziert Pfad nur MIT ?v=`,
      new RegExp(esc + "\\?v=").test(shell) && !new RegExp(esc + "(?!\\?v=)").test(shell));
  }

  // 6c) Präzedenz FUNKTIONAL über den Test-Hook __ASSET_VERSION (server.js).
  // ASSET_VERSION wird beim Modul-Load eingefroren — deshalb wird server.js pro
  // Env-Fall frisch geladen (require.cache löschen) und die Env danach exakt
  // wiederhergestellt. Die lib-Module bleiben gecacht; der Original-Modul-Cache
  // wird am Ende zurückgesetzt, damit spätere requires die Erst-Instanz sehen.
  const serverPath = require.resolve("../server.js");
  const originalServerModule = require.cache[serverPath];
  function assetVersionWithEnv(env) {
    const keys = ["VERCEL_GIT_COMMIT_SHA", "HELMUT_ASSET_VERSION"];
    const saved = {};
    for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
    Object.assign(process.env, env);
    try {
      delete require.cache[serverPath];
      return require(serverPath).__ASSET_VERSION();
    } finally {
      delete require.cache[serverPath];
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  }
  try {
    check("funktional: VERCEL_GIT_COMMIT_SHA gewinnt (auf 8 Zeichen gekürzt)",
      assetVersionWithEnv({ VERCEL_GIT_COMMIT_SHA: "abcdef1234567890", HELMUT_ASSET_VERSION: "cli-fallback-1" }) === "abcdef12");
    check("funktional: ohne SHA greift HELMUT_ASSET_VERSION (CLI-Deploy-Weg)",
      assetVersionWithEnv({ HELMUT_ASSET_VERSION: "cli-fallback-1" }) === "cli-fallback-1");
    check("funktional: ohne beide Envs greift die Konstante (nur lokal)",
      assetVersionWithEnv({}) === "20260701-adminfix1");
  } finally {
    require.cache[serverPath] = originalServerModule;
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
