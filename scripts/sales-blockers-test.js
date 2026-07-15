"use strict";

// Sichere Verkaufsblocker (Audit-Folgebranch). KEIN Netz (fetch gestubt), KEINE
// echte DB (Storage-Funktionen gemockt). Deckt ab:
//  1. Admin "KI-Kosten heute" summiert nur den aktuellen Tag (getLlmUsageToday).
//  2. Zustandsändernder Backfill-Endpunkt lehnt execute per GET ab (CSRF).
//  3. Monitoring-Zweitkanal (Webhook) neben CallMeBot.
//  4. Cron-Vollständigkeit + Google-News-Auflösungsquote im Health-Report.
//  5. Radar-Mention-Quellen werden für nicht-Decision-KOs nachgeladen.
//  6. Asset-Version fällt auf HELMUT_ASSET_VERSION zurück (CLI-Deploy-Weg).

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

  check("health-report-Cron ruft BEIDE Kanäle (CallMeBot + Webhook) parallel",
    /Promise\.all\(\[\s*\n\s*sendCallMeBotMessage\(report\.text\),\s*\n\s*sendMonitoringWebhook\(report\)/.test(serverSource));
  check("health-report loggt Systemfehler, wenn Report nicht grün UND kein Kanal konfiguriert",
    /KEIN Alarmkanal konfiguriert/.test(serverSource));

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
  check("Mention-KOs ohne geladene Quelle werden gezielt nachgeladen",
    serverSource.includes("mentionNeedsSources") && serverSource.includes("MENTION_SOURCE_LOAD_CAP = 25"));
  check("Nachladen ist rein additiv (überschreibt keine geladene Quelle)",
    /if \(!sourcesByVorgang\[vid\]\) sourcesByVorgang\[vid\] = docs;/.test(serverSource));

  // ── 5b) Mention-Nachladen ist LOAD-BEARING (radarState-Vertrag) ───────────
  // Beweist, warum das Server-Nachladen nötig ist: eine belegte Eigenerwähnung
  // OHNE best_source_url verschwindet ohne geladene Quelle — und erscheint, sobald
  // die Quelle vorliegt (genau das liefert der neue Server-Pfad additiv nach).
  const radarState = require("../lib/helmut/radarState");
  const profile = { id: "u-cem", fullName: "Cem Ince" };
  const mentionKo = {
    id: "ko-m", vorgang_id: "vg-m", status: "neu", understanding_status: "complete",
    mentioned_people: ["Cem Ince"], display_title: "Cem Ince fordert Reform",
    was_ist_passiert: "Cem Ince hat einen Antrag gestellt.", warum_wichtig: "x",
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

  // ── 6) Asset-Version: CLI-Deploy-Fallback ─────────────────────────────────
  check("ASSET_VERSION-Präzedenz: SHA > HELMUT_ASSET_VERSION > Konstante",
    /VERCEL_GIT_COMMIT_SHA[\s\S]{0,120}HELMUT_ASSET_VERSION[\s\S]{0,80}"20260701-adminfix1"/.test(serverSource));
  const deploy = fs.readFileSync(path.join(root, "scripts/vercel-deploy.sh"), "utf8");
  check("Deploy-Skript setzt HELMUT_ASSET_VERSION aus Git-SHA+Zeit",
    /HELMUT_ASSET_VERSION=\$ASSET_VER/.test(deploy) && /git rev-parse --short=8 HEAD/.test(deploy));

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
