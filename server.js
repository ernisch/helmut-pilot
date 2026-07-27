const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

loadLocalEnv();

const { profileCompleteness } = require("./lib/helmut/config");
const tenantContext = require("./lib/helmut/tenant-context");
const { validateProfile } = require("./lib/helmut/profile-validation");
const sourceSafety = require("./lib/helmut/sourceSafety");
const { runLageCheck, runSourceCrawl } = require("./lib/helmut/scheduler");
const { buildLearningProfile } = require("./lib/helmut/learning");
const { deleteProfileData, exportProfileData, getInteractions, getLatestCrawlRun, listCrawlRuns, getLatestLageCheck, getLatestPipelineDebugReport, getProfile, listProfiles, listFullProfiles, getStorageStatus, getStoreSummary, getTasks, getUserNotes, removePushSubscription, saveInteraction, saveProfile, saveFeedback, listFeedback, setFeedbackDone, savePushSubscription, saveTask, saveUserNote, updateTaskStatus, listPushEvents, saveKnowledgeObject, getKnowledgeObjectByVorgang, listPendingKnowledgeObjects, savePendingKnowledgeObject, listFailedKnowledgeObjects, resetUnderstandingToPending, markUnderstandingTerminal, getUnderstandingRetries, saveUnderstandingRetries, readAuthStore, writeAuthStore, getLlmUsage, getLlmUsageToday, getLlmUsageBreakdownToday, getRunCostReport, llmPriceProvenance, recordLlmUsage, canSpendLlm, getAdminStatsCosts, getAdminStatsCrawl, getAdminStatsOverview, getAdminStatsCrawlReport, getKnowledgeObjectCount, getClassificationCoverage, getAdminPeriodStats, listRecentRawDocuments, listKnowledgeObjects, getSources, getSourcesForVorgang, v3StoreReady, releasePipelineLock, understandingLockEnabled, bulkResetUnderstandingFailed, saveAdminRecoveryLastRun, getAdminRecoveryLastRun, getLatestCompleteKnowledgeObjectAt, saveWatchdogState, getLatestWatchdogState, tenantJwtModeEnabled, saveKnowledgeObjectEnrichment, profileDbModeEnabled, profileDbExclusiveEnabled, getProfileTelemetry, getProfileFromDb, diagnoseTenantJwt, recordProcessRun, listProcessRuns, saveMonitoringDeliveryState, getMonitoringDeliveryState, getLlmCostSince, getAdminCostsPerUser, listSourceArchitectureRows, getSourceModeShadowLastRun, listSourceCrawlTelemetry } = require("./lib/helmut/storage");
const llmBudgetLib = require("./lib/helmut/llm-budget");

// P0-1: technischer Ausfuehrungsort + Laufkennung fuer Prozess-Laufzeit-Telemetrie
// (Cron-Understanding, Briefing-Aufbau). Reine technische Metadaten, nie PII.
function helmutExecLocation() {
  return String(process.env.VERCEL_REGION || process.env.HELMUT_EXEC_LOCATION || "local").slice(0, 40);
}
function helmutRunId(prefix = "run", atMs = Date.now()) {
  const stamp = new Date(atMs).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${String(prefix).slice(0, 24)}-${stamp}-${Math.random().toString(36).slice(2, 7)}`;
}
const { classifyOperationalState, describeState } = require("./lib/helmut/watchdog-state");
const healthAxes = require("./lib/helmut/health-axes");
const { recoverFailedUnderstanding } = require("./lib/helmut/ko-recovery");
const { buildAlarmPayload, buildAlarmText } = require("./lib/helmut/alarm-payload");
const rollingHealth = require("./lib/helmut/rolling-health");
const monitoringWebhook = require("./lib/helmut/monitoring-webhook");
const { sourceMode } = require("./lib/helmut/quellenarchitektur/source-mode");
const { sourceCoverageThresholds, effectiveActiveSourceCount } = require("./lib/helmut/source-coverage");
const { runKoEnrichmentBackfill } = require("./lib/helmut/ko-enrichment");
const { generateCommunicationDraft, assessParliamentaryItem, isAiEnabled, activeModelName, extractKnowledgeObjectTags } = require("./lib/helmut/ai");
const { derivePolicyFields } = require("./lib/helmut/matching");
const { pushStatus, sendBriefingReadyPush, sendLageChangePush, sendPushToPolitician } = require("./lib/helmut/push");
const auth = require("./lib/helmut/auth");
const accounts = require("./lib/helmut/accounts");
const inviteMail = require("./lib/helmut/invite-mail");
const helmutFlags = require("./lib/helmut/flags");
const { getRelevantParliamentaryItems } = require("./lib/helmut/dip");
const { runPendingUnderstandingShadow, clusterRawDocuments, deriveVorgangId, diagnosePendingUnderstanding } = require("./lib/helmut/understanding");
const { generateOfficeOutput, isValidChannel } = require("./lib/helmut/office");
const { buildLageBriefing } = require("./lib/helmut/lage");
const { backfillProvenance } = require("./lib/helmut/backfill");
const { backfillPresentationFields } = require("./lib/helmut/presentation-backfill");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
// Erlaubte Feedback-Typen (Admin-Inbox). Bewusst schlank, kein freier Text-Typ.
const FEEDBACK_TYPES = ["relevant", "nicht_relevant", "falsch", "mehr_davon", "weniger_davon", "unklar"];
// Cache-Busting fuer styles.css/client.js. Leitet sich automatisch vom Deploy ab.
// Präzedenz (Audit-Folgebranch): VERCEL_GIT_COMMIT_SHA (Git-Integration-Deploy)
// > HELMUT_ASSET_VERSION (wird von scripts/vercel-deploy.sh beim CLI-Deploy aus
// dem Git-SHA gesetzt) > Konstante (nur lokal). WICHTIG: Auf dem CLI-Deploy-Weg
// setzt Vercel VERCEL_GIT_COMMIT_SHA NICHT — ohne den mittleren Fallback bliebe
// die Asset-URL über Deploys konstant und Bestandsnutzer bekämen wegen des
// immutable-Cachings dauerhaft alte client.js/styles.css (gefixte Bugs nie).
const ASSET_VERSION = String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 8)
  || String(process.env.HELMUT_ASSET_VERSION || "").slice(0, 40)
  || "20260701-adminfix1";
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const canonicalHost = process.env.HELMUT_CANONICAL_HOST || "helmut-pilot.vercel.app";
const rateBuckets = new Map();
const manualRunMinIntervalMs = Number(process.env.HELMUT_MANUAL_RUN_MIN_INTERVAL_MS || 10 * 60 * 1000);
// Quellenabdeckung P2-5: Schwellen aus lib/helmut/source-coverage.js (ENV-überschreibbar).
// Kalibriert auf die relationale Quellenarchitektur (gesunder Ist-Crawl ~145 geprüft/
// erfolgreich, 0 Fehler) — NICHT auf den rohen Katalogumfang. Die alten Defaults
// (495/450/405) waren ~3× zu hoch und seit 2026-07-11 nie erfüllbar. Begründung + Belege
// im Modulkopf source-coverage.js.
const { minConfigured: minConfiguredSources, minChecked: minCheckedSources, minSuccessful: minSuccessfulSources } = sourceCoverageThresholds();
const minLageCheckSources = Number(process.env.HELMUT_MIN_LAGE_CHECK_SOURCES || 75);
const maxCrawlFailureRatio = Number(process.env.HELMUT_MAX_CRAWL_FAILURE_RATIO || 0.1);
const maxFullCrawlAgeMs = Number(process.env.HELMUT_MAX_FULL_CRAWL_AGE_MS || 14 * 60 * 60 * 1000);
const maxLageCheckAgeMs = Number(process.env.HELMUT_MAX_LAGE_CHECK_AGE_MS || 4 * 60 * 60 * 1000);
// Watchdog-Lage-Achse: eigene Schwelle, weil sie am CRON-TAKT gemessen werden muss,
// nicht an der In-App-Frische (maxLageCheckAgeMs = 4h, bewusst unverändert).
// BEFUND Incident 2026-07-25: der Lage-Cron läuft EINMAL täglich (`0 10 * * *`), der
// Health-Report um `0 6 * * *`. Zur Report-Zeit ist die Lage damit IMMER ~20 h alt —
// eine 4-h-Schwelle ist gegen einen 24-h-Takt strukturell unerfüllbar und erzeugte
// jeden Morgen "Lage-Check veraltet", obwohl der Lauf pünktlich und für ALLE Mandate
// erfolgreich war (verifiziert: 6/6 Mandate am 23. und 24.07. um 10:0x, Status
// 'changed'). Takt 24 h + 2 h Kulanz = 26 h; darüber ist ein Lauf WIRKLICH ausgefallen.
// Der Zeitstempel selbst wird NICHT künstlich erneuert — nur die Schwelle stimmt jetzt.
const watchdogLageFreshMs = Number(process.env.HELMUT_WATCHDOG_LAGE_FRESH_MS || 26 * 60 * 60 * 1000);
// P1-5: OUTPUT-Frische wird am jüngsten VERSTANDENEN Knowledge-Object gemessen
// (nicht an der build-zeit-blinden Briefing-`generatedAt`). >36h ohne neues
// complete-KO trotz laufendem Crawl = echter stiller Ausfall (VERALTET). Bewusst
// großzügig (36h), damit ruhige Nachrichtentage NICHT fälschlich rot werden.
const maxOutputFreshnessMs = Number(process.env.HELMUT_MAX_OUTPUT_FRESHNESS_MS || 36 * 60 * 60 * 1000);
// P1-6/P2-4 (radar.md §3, profile-coverage.md §6): Der App-Radar-Mention-Scan +
// die Lage speisen sich aus diesem Fenster. Bei 200 fielen belegte Personen-
// Erwaehnungen jenseits Rang 200 komplett aus (das 500er-Archiv ist im Client
// nicht verdrahtet). Default 500 deckt den heutigen Bestand (217) voll ab;
// waechst der Korpus ueber 500, ueber ENV anheben.
const koScanLimit = Number(process.env.HELMUT_KO_SCAN_LIMIT || 500);
// Ein OUTPUT gilt als "tot", wenn kein complete-KO bekannt ist ODER es älter als
// die Schwelle ist. Hilfsprädikat, in den Health-Checks unten wiederverwendet.
function isOutputStale(completeKoAt) {
  if (!completeKoAt) return true;
  const age = Date.now() - new Date(completeKoAt).getTime();
  return !(age < maxOutputFreshnessMs);
}

async function handleRequest(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const previewMode = isPreviewMode(url);
  if (shouldRedirectToCanonicalHost(request, url)) {
    url.protocol = "https:";
    url.host = canonicalHost;
    response.writeHead(308, securityHeaders({
      Location: url.toString(),
      "Cache-Control": "no-store"
    }));
    response.end();
    return;
  }

  if (url.pathname === "/api/pilot/unlock" && request.method === "POST") {
    // SICHERHEIT: frueher voellig unbegrenzt erratbar (kein Rate-Limit, kein
    // konstantzeitiger Vergleich) — jetzt wie /api/auth/login gedrosselt + timingsafe.
    if (!allowRate(request, "pilot-unlock", 10, 15 * 60 * 1000)) {
      return sendTooManyRequests(response, "Zu viele Versuche. Bitte später erneut.");
    }
    return handleJson(request, response, async (body) => {
      if (!isPilotAccessConfigured()) return { ok: true, configured: false };
      const submittedSecret = String(body.secret || "").trim();
      if (!submittedSecret || !timingSafeEqual(submittedSecret, process.env.PILOT_SECRET)) {
        response.writeHead(401, jsonHeaders());
        response.end(JSON.stringify({ error: "Zugangscode nicht korrekt." }, null, 2));
        return null;
      }
      response.writeHead(200, jsonHeaders({ "Set-Cookie": pilotCookieHeader(process.env.PILOT_SECRET, 30 * 24 * 60 * 60) }));
      response.end(JSON.stringify({ ok: true }, null, 2));
      return null;
    });
  }

  if (url.pathname === "/api/pilot/logout" && request.method === "POST") {
    response.writeHead(200, jsonHeaders({ "Set-Cookie": pilotCookieHeader("", 0) }));
    response.end(JSON.stringify({ ok: true }, null, 2));
    return;
  }

  if (url.pathname === "/api/release/public") {
    // SICHERHEIT/DATENSPARSAMKEIT: bewusst oeffentlich (externes Monitoring ohne
    // Login), aber MANDATSAGNOSTISCH — KEINE Pilot-/Tenant-Konfiguration, keine
    // Mandats-ID und keine Per-Mandant-Metriken. Nur ein globales Bereitschafts-
    // signal (persistenter Speicher aktiv + juengster Crawl frisch). Kein
    // Mandanten-Oracle, keine Rechenverstaerkung durch anonyme Aufrufer.
    return handleAsync(response, async () => {
      const storage = getStorageStatus();
      const latestCrawl = await getLatestCrawlRun().catch(() => null);
      const crawlTs = latestCrawl && (latestCrawl.checkedAt || latestCrawl.createdAt);
      const crawlAgeH = crawlTs ? (Date.now() - new Date(crawlTs).getTime()) / 3600000 : null;
      const storageOk = storage.backend === "supabase";
      const ready = storageOk && crawlAgeH != null && crawlAgeH < 48;
      return { ok: true, ready, storage: storageOk };
    });
  }

  if (url.pathname === "/impressum") {
    return sendImpressumPage(response);
  }

  if (url.pathname === "/privacy" || url.pathname === "/datenschutz") {
    return sendPrivacyPage(response);
  }

  // Umsetzungsnotiz §6: oeffentliche Seite fuer Invite-/Reset-Links. Der Empfaenger
  // hat noch keine Session — die Seite muss deshalb VOR allen Auth-Gates liegen.
  if (url.pathname === "/passwort-setzen") {
    return sendSetPasswordPage(response);
  }

  // Status-Check fuer Live-Gang-Diagnose. SICHERHEIT: urspruenglich ohne Secret
  // ("public"), das machte Config-Recon (welche Provider/Keys gesetzt sind, ob ein
  // Admin existiert) fuer jeden im Internet abrufbar und stiess bei jedem Aufruf
  // einen echten Supabase-Request an. Jetzt wie alle anderen /api/debug/*-Routen
  // hinter HELMUT_ADMIN_SECRET.
  if (url.pathname === "/api/debug/public/status") {
    if (!isDebugSecretOk(request, url)) return sendNotFound(response);
    return handleAsync(response, async () => {
      const storage = getStorageStatus();
      const adminExists = await accounts.adminExists().catch(() => null);
      const testPolitician = await getProfile("test-mdb").catch(() => null);
      let dbReachable = null;
      if (storage.backend === "supabase" && storage.supabaseConfigured) {
        try {
          // Leichtgewichtiger Ping: HEAD auf /rest/v1/ ohne Daten
          const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
          const resp = await fetch(`${baseUrl}/rest/v1/`, {
            method: "HEAD",
            headers: { apikey: key, Authorization: `Bearer ${key}` }
          });
          dbReachable = resp.ok || resp.status === 200 || resp.status === 404;
        } catch {
          dbReachable = false;
        }
      }
      return {
        timestamp: new Date().toISOString(),
        flags: {
          HELMUT_AUTH_MODE: process.env.HELMUT_AUTH_MODE || "(nicht gesetzt)",
          HELMUT_ADMIN_EMAIL_set: Boolean(process.env.HELMUT_ADMIN_EMAIL),
          HELMUT_ADMIN_PASSWORD_set: Boolean(process.env.HELMUT_ADMIN_PASSWORD),
          HELMUT_STORAGE_BACKEND: process.env.HELMUT_STORAGE_BACKEND || "(nicht gesetzt)",
          SUPABASE_URL_set: Boolean(process.env.SUPABASE_URL),
          SUPABASE_SERVICE_ROLE_KEY_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          AZURE_OPENAI_KEY_set: Boolean(process.env.AZURE_OPENAI_KEY),
          AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT || "(nicht gesetzt)",
          HELMUT_V3_STORE: process.env.HELMUT_V3_STORE || "(nicht gesetzt)",
          HELMUT_V3_MATCHING: process.env.HELMUT_V3_MATCHING || "(nicht gesetzt)",
          HELMUT_V3_LAZY_UNDERSTANDING: process.env.HELMUT_V3_LAZY_UNDERSTANDING || "(nicht gesetzt)",
          HELMUT_V3_OFFICE: process.env.HELMUT_V3_OFFICE || "(nicht gesetzt)",
          HELMUT_UNDERSTANDING_LOCK: process.env.HELMUT_UNDERSTANDING_LOCK || "(nicht gesetzt)",
          HELMUT_LLM_BUDGET_FAIL_CLOSED: process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED || "(nicht gesetzt)",
          DIP_API_KEY_set: Boolean(process.env.DIP_API_KEY),
        },
        storage: { backend: storage.backend, supabaseConfigured: storage.supabaseConfigured },
        db: { reachable: dbReachable },
        accounts: { adminExists },
        testPolitician: { exists: Boolean(testPolitician), id: testPolitician?.id || null }
      };
    });
  }

  // TEMPORAERE DEBUG-ENDPUNKTE (Live-Gang-Diagnose).
  // Kein Auth, kein CSRF — nur durch HELMUT_ADMIN_SECRET + ?secret= gesichert, zusaetzlich
  // ratenbegrenzt (SICHERHEIT: verhindert Brute-Force auf HELMUT_ADMIN_SECRET). Ein
  // frueherer, komplett ungeschuetzter Duplikat-Pfad fuer run-understanding wurde entfernt.
  // Ein Pfad (lage-backfill) hat ein eigenes, weiter unten geprüftes Gate
  // (CRON_SECRET-Gate) und fällt hier bewusst durch.
  const OWN_GATE_DEBUG_PATHS = new Set(["/api/debug/lage-backfill"]);
  if (url.pathname.startsWith("/api/debug/") && !OWN_GATE_DEBUG_PATHS.has(url.pathname)) {
    if (!allowRate(request, "debug-secret", 20, 15 * 60 * 1000)) {
      return sendTooManyRequests(response, "Zu viele Debug-Anfragen. Bitte später erneut.");
    }
    if (isDebugSecretOk(request, url)) {
      return handleDebugRequest(request, response, url);
    }
    return sendNotFound(response);
  }

  const accountAuth = auth.authMode();
  let authUser = null;

  if (accountAuth) {
    // Account-Modus (Feature-Flag HELMUT_AUTH_MODE=accounts): Login per Session-Cookie
    // statt geteiltem Pilot-Code. Identitaet stammt ausschliesslich aus der Session.
    try {
      await accounts.ensureAdminSeed();
    } catch (error) {
      console.error("Admin seed failed", error);
    }

    // Oeffentliche Auth-Endpunkte: ohne bestehende Session erreichbar.
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      return handleAuthLogin(request, response, url);
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return handleAuthLogout(request, response);
    }

    // Invite-/Passwort-Flow (Umsetzungsnotiz §6): oeffentlich, ohne Session erreichbar
    // (die Person HAT noch keine Session). Wie der Login vor dem CSRF-Guard registriert;
    // Schutz: Rate-Limit + einmalige, ablaufende Tokens (im Store nur SHA-256-Hash).
    if (url.pathname === "/api/auth/set-password" && request.method === "POST") {
      return handleAuthSetPassword(request, response);
    }
    if (url.pathname === "/api/auth/request-reset" && request.method === "POST") {
      return handleAuthRequestReset(request, response);
    }
    if (url.pathname === "/api/auth/password-token" && request.method === "GET") {
      return handleAuthPasswordToken(request, response, url);
    }

    // Setup-Diagnose: sensible Felder (E-Mails etc.) nur fuer eingeloggte Admins.
    if (url.pathname === "/api/auth/setup-status") {
      const ctx = await auth.getAuthContext(request).catch(() => null);
      const includeSensitive = ctx?.user?.role === "admin";
      return handleAsync(response, () => accounts.getSetupStatus({ includeSensitive }));
    }

    const ctx = await auth.getAuthContext(request).catch(() => null);
    authUser = ctx?.user || null;

    if (url.pathname === "/api/auth/session") {
      return handleAuthSession(response, authUser, ctx?.token);
    }

    if (!authUser) {
      // SPA-HTML und oeffentliche Assets ausliefern, damit der Login-Screen laden kann.
      // Cron-Routen schuetzen sich selbst (authorizeCron, fail closed). Jeder andere API-Aufruf: 401.
      const isCron = url.pathname.startsWith("/api/cron/");
      if (url.pathname.startsWith("/api/") && !isCron) {
        return sendUnauthorized(response);
      }
      // sonst: durchfallen zur statischen Auslieferung / Cron-Routen unten
    }
  } else if (!hasPilotAccess(request, url)) {
    // Legacy-Pilotgate (Feature-Flag aus): unveraendert, damit Produktion nicht bricht.
    if (wantsHtml(request, url)) return sendPilotUnlockPage(response, url);
    return sendPilotUnauthorized(response);
  }

  // Mandant-Aufloesung. SICHERHEITSKERN: Im Account-Modus wird politicianId
  // serverseitig aus Session + Assignments bestimmt; das URL-Param dient nur als
  // Auswahl innerhalb erlaubter Mandate, niemals als Berechtigung. Im Legacy-Modus
  // bleibt das bisherige Verhalten erhalten.
  let politicianId;
  let allowedPoliticians = null;
  if (accountAuth && authUser) {
    allowedPoliticians = await auth.getAllowedPoliticianIds(authUser);
    const requested = url.searchParams.get("politicianId") || url.searchParams.get("profileId");
    politicianId = auth.pickPoliticianId(authUser, requested, allowedPoliticians);
    if (!politicianId) politicianId = await defaultPoliticianIdForUser(authUser, allowedPoliticians);
    // DATENLECK-SCHUTZ: Ein eingeloggter Account-Nutzer OHNE gültiges Mandat darf
    // NIE still auf ein fremdes Mandat fallen. Klarer Zustand statt
    // fremder Daten: API -> 403 (no-mandate); SPA-HTML/Assets fallen durch (Leerzustand).
    if (!politicianId) {
      // BOOTSTRAP-AUSNAHME: Ein Administrator braucht KEIN Mandat, um das System zu
      // betreiben (Nutzer/Zuordnungen anlegen). Auf einem frischen System existiert
      // noch kein Abgeordneter -> defaultPoliticianIdForUser liefert null -> ohne
      // diese Ausnahme sperrte das no-mandate-Gate /api/admin/* aus und der erste
      // Nutzer liesse sich nie anlegen (Henne-Ei). Admin-, Auth- und Konto-Endpunkte
      // sind mandatsunabhaengig und duerfen durch; sie lesen KEINE fremden Mandatsdaten.
      const isAdminUser = authUser && authUser.role === "admin";
      const mandateExemptPath =
        url.pathname.startsWith("/api/admin/") ||
        url.pathname.startsWith("/api/auth/") ||
        url.pathname === "/api/user/notification-settings" ||
        url.pathname === "/api/feedback" ||
        url.pathname === "/api/security/csrf";
      const allowThrough =
        url.pathname.startsWith("/api/cron/") ||
        (isAdminUser && mandateExemptPath) ||
        (!url.pathname.startsWith("/api/"));
      if (!allowThrough) {
        return sendForbidden(response, "Kein Mandat zugewiesen. Bitte an einen Administrator wenden.", "no-mandate");
      }
      // sonst: statische Auslieferung bzw. mandatsfreier Admin-/Auth-Pfad, kein Fremddaten-Read.
    }
  } else {
    // Legacy-Zugang (geteiltes PILOT_SECRET, keine Accounts): Es gibt KEIN bevorzugtes,
    // konfiguriertes oder geratenes Mandat. Die AKTIVEN Mandate der Datenbank sind die
    // Zugriffsmenge (allgemeine, datenbankbasierte Zugangszuordnung):
    //   * Admin-Bypass (secret-geschuetzt) darf jedes Mandat per ?politicianId waehlen.
    //   * sonst: ?politicianId, falls es ein AKTIVES Mandat benennt; sonst genau EIN
    //     aktives Mandat (ohne Environment-Auswahl); sonst "" -> Auswahl/Leerzustand.
    const requested = url.searchParams.get("politicianId") || url.searchParams.get("profileId");
    if (hasAdminBypass(request, url)) {
      // Admin-Bypass (secret-geschuetzt) darf jedes Mandat waehlen; ohne Parameter
      // greift dieselbe Aufloesung wie fuer normale Zugriffe (einziges aktives Mandat).
      politicianId = tenantContext.slugifyTenantId(requested)
        || (await tenantContext.resolveActiveTenant({ deps: { listProfiles: listFullProfiles } })).tenantId;
    } else {
      const resolved = await tenantContext.resolveActiveTenant({ requested, deps: { listProfiles: listFullProfiles } });
      politicianId = resolved.tenantId;
    }
    if (!politicianId) {
      const isCron = url.pathname.startsWith("/api/cron/");
      const isSelectableStart = url.pathname === "/api/app/start";
      // Mandatsbezogene API-Pfade (ausser Cron und dem auswahlfaehigen app/start)
      // erhalten einen klaren Auswahl-/Leerzustand statt eines geratenen Mandanten.
      if (url.pathname.startsWith("/api/") && !isCron && !isSelectableStart) {
        return sendMandateSelectionRequired(response, await activeMandateList());
      }
      // sonst: app/start (Auswahl-Payload unten), Cron (eigene DB-Aufloesung) und
      // statische SPA-Auslieferung fallen durch.
    }
  }

  if (url.pathname === "/api/security/csrf") {
    return sendJson(response, { token: createCsrfToken() });
  }

  if (requiresCsrf(request, url) && !hasValidCsrf(request)) {
    return sendCsrfForbidden(response);
  }

  if (url.pathname === "/api/app/start") {
    // Nutzungs-Tracking: App-Oeffnung erfassen (nicht-blockierend, gedrosselt).
    if (accountAuth && authUser) accounts.recordUserActivity(authUser.id).catch(() => {});
    return handleAsync(response, async () => {
      if (!politicianId) {
        // Legacy-Zugang ohne aufloesbaren Einzelmandanten: Auswahl-/Leerzustand
        // (der Account-Modus wird oben bereits per no-mandate abgefangen).
        const mandates = await activeMandateList();
        return { needsMandateSelection: mandates.length > 1, empty: mandates.length === 0, mandates };
      }
      const profile = await activeProfile(politicianId);
      const briefing = await latestBriefingPayload({ politicianId, profile, url, previewMode, compact: true });
      // Lage = das politische Morgen-Briefing des Referenten (keine Empfehlung/Bewertung).
      // P1-7 (app-start-performance.md §1C, lage.md §4): NUR die deterministischen
      // Karten (+ ggf. gecachtes Narrativ) im Start-Kritikpfad laden — KEIN Live-LLM-
      // Call. So können die Karten NIE durch ein LLM-Timeout verschwinden. Der Timeout
      // bleibt als reines Sicherheitsnetz (cacheOnly macht nur DB-Reads, hängt nicht).
      try { briefing.lageBriefing = await withTimeout(buildLageBriefing(profile, { politicianId, cacheOnly: true }), 8000, "lage-briefing-cards"); }
      catch (error) {
        console.error("Lage-Karten fehlgeschlagen", error && error.message);
        // STOERUNGSWAHRHEIT (Review-Fix): Ohne diesen Sentinel bliebe
        // briefing.lageBriefing undefined und der Client zeigte den GENERISCHEN
        // ruhigen Leerzustand ("keine relevanten Vorgänge") — ein Timeout/Fehler
        // sah damit aus wie ein ruhiger Tag. Form exakt wie lage.js unavailable():
        // reason "error" mappt der Client (lageDisruption) auf den ehrlichen
        // Störungszustand.
        briefing.lageBriefing = {
          available: false,
          demo: false,
          reason: "error",
          generatedAt: new Date().toISOString(),
          paragraphs: [],
          vorgaenge: []
        };
      }
      // Narrativ asynchron nachziehen (fire-and-forget), damit der Cache für den
      // nächsten Aufruf warm ist. Blockiert den App-Start NICHT.
      if (briefing.lageBriefing && briefing.lageBriefing.pendingNarrative) {
        buildLageBriefing(profile, { politicianId }).catch((e) => console.error("Lage-Narrativ (async) fehlgeschlagen", e && e.message));
      }
      // P1-8 (Teil): tasks + notes sind unabhängig — parallel statt seriell laden.
      // Block 5 (Lage-Frische): zusätzlich die ECHTE Ausgabe-Frische mitladen.
      // getLatestCompleteKnowledgeObjectAt = created_at des jüngsten verstandenen
      // Vorgangs — dieselbe OUTPUT-Frische, die Health/Readiness bereits als Wahrheit
      // nutzen (server.js:617). Read-only SELECT, parallel (keine Zusatzlatenz),
      // fail-safe null. So bekommt die Lage einen EHRLICHEN "Zuletzt aktualisiert"-
      // Zeitstempel (Analysezeit) — NICHT das build-zeit-blinde generatedAt und NICHT
      // das Artikel-Publikationsdatum (das kann Wochen zurückliegen).
      const [tasks, notes, latestUpdatedAt] = await Promise.all([
        getTasks(profile.id), getUserNotes(profile.id), getLatestCompleteKnowledgeObjectAt()
      ]);
      if (briefing.lageBriefing && typeof briefing.lageBriefing === "object") {
        briefing.lageBriefing.latestUpdatedAt = latestUpdatedAt || null;
      }
      return {
        // Onboarding-Freigabe (Audit-Fix 2026-07): das Profil traegt seinen
        // Pflichtfeld-/Freigabestatus (additiv; wird beim Speichern ignoriert).
        profile: { ...profile, profilValidierung: validateProfile(profile) },
        briefing,
        tasks,
        notes,
        aiStatus: {
          enabled: isAiEnabled(),
          model: activeModelName()
        },
        // Umsetzungsnotiz §9: echte Build-Version an den Client durchreichen
        // (Profil-Footer zeigt sie statt der toten "Version 1.0").
        version: ASSET_VERSION
      };
    });
  }

  if (url.pathname === "/api/profile/current") {
    if (request.method === "GET") {
      return handleAsync(response, async () => {
        const p = await activeProfile(politicianId);
        return { ...p, profilValidierung: validateProfile(p) };
      });
    }
    if (request.method === "POST" || request.method === "PATCH") {
      if (previewMode) return sendPreviewReadOnly(response);
      // Onboarding-Freigabe (Audit-Fix 2026-07): Speichern bleibt tolerant
      // (kein hartes Abweisen), aber fehlende Pflichtangaben werden dem Nutzer
      // MITGETEILT statt still ignoriert — die Antwort traegt den vollstaendigen
      // Validierungsstatus (state/fehlende Felder/Erklaerung).
      return handleJson(request, response, async (body) => {
        const saved = await saveProfile(await normalizeProfile(body, politicianId));
        return { ...saved, profilValidierung: validateProfile(saved) };
      });
    }
  }

  if (url.pathname === "/api/profile/demo") {
    if (!hasAdminBypass(request, url)) return sendNotFound(response);
    if (request.method === "GET") return handleAsync(response, () => activeProfile(politicianId));
    if (request.method === "POST" || request.method === "PATCH") {
      return handleJson(request, response, async (body) => saveProfile(await normalizeProfile(body, politicianId)));
    }
  }

  if (url.pathname === "/api/briefing/latest") {
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      return latestBriefingPayload({ politicianId, profile, url, previewMode, compact: isCompactResponse(url) });
    });
  }

  if (url.pathname === "/api/briefing/run") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleAsync(response, async () => {
      // V3: das Briefing entsteht bei jedem Lesen frisch aus den aktuellen
      // Knowledge Objects (Decision Engine, 0 KI) — kein separater V2-Erzeugungslauf.
      // Der Daten-Refresh (Crawl -> Understanding) läuft über /api/pipeline/run bzw. Cron.
      const profile = await activeProfile(politicianId);
      return latestBriefingPayload({ politicianId, profile, url, previewMode, compact: isCompactResponse(url) });
    });
  }

  if (url.pathname === "/api/crawl/run") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleAsync(response, async () => {
      const latest = await getLatestCrawlRun();
      const forced = isForcedPilotRun(request, url) || hasAdminBypass(request, url);
      if (!forced && isRecent(latest?.createdAt, manualRunMinIntervalMs)) {
        return {
          ...latest,
          skippedReason: "Quellen wurden gerade erst geprüft. Helmut nutzt den letzten Lauf, um unnötige Last zu vermeiden."
        };
      }
      // Betreiber-Override: wer den 10-min-Frischeschutz bewusst umgeht, umgeht
      // auch den Google-Cooldown/Abstands-Schutz (Google-News-Härtung).
      return runSourceCrawl(politicianId, { force: forced });
    });
  }

  if (url.pathname === "/api/pipeline/run") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleAsync(response, async () => {
      // V3-Pipeline: der Crawl speist die V3-Tabellen (raw_documents) und triggert
      // die V3-Engines (Understanding/Matching/Decision) über runSourceCrawl.
      // Kein V2-Briefing-Lauf mehr. Das Briefing liest der Client danach frisch aus V3.
      const latestCrawl = await getLatestCrawlRun();
      const forcedPipeline = isForcedPilotRun(request, url) || hasAdminBypass(request, url);
      if (!forcedPipeline && isRecent(latestCrawl?.createdAt, manualRunMinIntervalMs)) {
        return {
          ...latestCrawl,
          skippedReason: "Pipeline wurde gerade erst ausgeführt. Helmut nutzt den letzten Lauf."
        };
      }
      // Betreiber-Override wie bei /api/crawl/run (siehe dort).
      // ZEITBUDGET (Betriebsbefund 2026-07-27): auch dieser manuelle Pfad lief ohne
      // Zeitgrenze und endete am 2026-07-26, 22:09 UTC mit HTTP 504 nach 300s.
      // Gleiche Grenze wie die Crons; runSourceCrawl ist intern selbst budgetiert.
      return withTimeout(runSourceCrawl(politicianId, { force: forcedPipeline }), 280000, "pipeline-run")
        .catch((error) => ({ ok: false, bounded: true, reason: "pipeline-run-timeout", error: error && error.message }));
    });
  }

  // C11c: Buero-Engine (C9) — KI-Kommunikations-Output pro Vorgang + Kanal generieren.
  // POST { vorgangId, outputType } -> { content, channel, cached }
  // Setzt understanding_status='complete' voraus (Guard in generateOfficeOutput).
  // Hinter HELMUT_V3_OFFICE + HELMUT_V3_STORE; userId aus Auth-Session.
  if (url.pathname === "/api/office/generate" && request.method === "POST") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleJson(request, response, async (body) => {
      const vorgangId = String(body.vorgangId || "").trim();
      const outputType = String(body.outputType || "").trim();
      if (!vorgangId) throw accounts.httpError(400, "vorgangId ist erforderlich.");
      if (!outputType) throw accounts.httpError(400, "outputType ist erforderlich.");
      if (!isValidChannel(outputType)) throw accounts.httpError(400, `Unbekannter outputType: ${outputType}`);
      const userId = politicianId;
      const ko = await getKnowledgeObjectByVorgang(vorgangId);
      return generateOfficeOutput(userId, vorgangId, outputType, ko);
    });
  }

  if (url.pathname === "/api/lage/check") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleAsync(response, async () => {
      const latest = await getLatestLageCheck(politicianId);
      if (!isForcedPilotRun(request, url) && !hasAdminBypass(request, url) && isRecent(latest?.checkedAt || latest?.createdAt, manualRunMinIntervalMs)) {
        return {
          ...latest,
          skippedReason: "Die Lage wurde gerade erst geprüft. Helmut nutzt den letzten Lage-Check."
        };
      }
      return runLageCheck(politicianId);
    });
  }

  // Lage-Briefing (V3): KO-basiertes, gecachtes KI-Briefing + echte Vorgänge/Quellen.
  // Reiner Read; erzeugt nur bei fehlendem/veraltetem Cache neu (?force=1 erzwingt).
  if (url.pathname === "/api/lage/briefing") {
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      const force = isForcedPilotRun(request, url) || hasAdminBypass(request, url);
      return buildLageBriefing(profile, { politicianId, force });
    });
  }

  if (url.pathname === "/api/pipeline/debug") {
    return handleAsync(response, async () => {
      const report = await getLatestPipelineDebugReport(politicianId);
      if (report) return report;
      return {
        status: "Noch kein Pipeline-Debug-Bericht vorhanden.",
        hint: "Starte ein Briefing oder die Pipeline, damit Helmut einen Debug-Bericht speichert."
      };
    });
  }

  if (url.pathname === "/api/radar/archive") {
    return handleAsync(response, async () => getRadarArchive(await activeProfile(politicianId), Number(url.searchParams.get("days") || 92)));
  }

  if (url.pathname === "/api/ai/status") {
    return sendJson(response, {
      enabled: isAiEnabled(),
      model: activeModelName(),
      backend: process.env.AZURE_OPENAI_KEY ? "azure-eu" : "openai"
    });
  }

  if (url.pathname === "/api/push/public-key") {
    return sendJson(response, pushStatus());
  }

  if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleJson(request, response, async (body) => {
      const status = pushStatus();
      if (!status.enabled) {
        response.writeHead(503, jsonHeaders());
        response.end(JSON.stringify(status, null, 2));
        return null;
      }
      const saved = await savePushSubscription(politicianId, body.subscription || body, {
        userAgent: request.headers["user-agent"] || ""
      });
      return { ok: true, id: saved.id };
    });
  }

  if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleJson(request, response, async (body) => removePushSubscription(politicianId, body.endpoint));
  }

  if (url.pathname === "/api/push/test" && request.method === "POST") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleAsync(response, () => sendPushToPolitician(politicianId, {
      type: "daily_briefing_ready",
      title: "Helmut ist bereit.",
      body: "Push funktioniert. Dein Morgenbriefing kann dich künftig aktiv erreichen.",
      url: "/"
    }));
  }

  if (url.pathname === "/api/user/notification-settings" && request.method === "PATCH") {
    if (!authUser) return sendUnauthorized(response);
    return handleJson(request, response, async (body) => {
      const updated = await accounts.updateUser(authUser.id, { notificationSettings: body });
      return { ok: true, notificationSettings: updated.notificationSettings };
    });
  }

  if (url.pathname === "/api/storage/status") {
    return sendJson(response, getStorageStatus());
  }

  if (url.pathname === "/api/privacy/export" && request.method === "GET") {
    // SICHERHEIT (Review-Fix): Der Art.-15/20-Export umfasst Konto-, Sitzungs-,
    // Zuweisungs- und Audit-Metadaten (inkl. IPs) des Mandats — also auch Daten
    // Dritter (Admin/Referent). Betroffener ist der Mandatsträger. Im Account-Modus
    // darf daher nur der Inhaber (abgeordneter mit diesem politicianId) oder ein
    // Admin exportieren; im Legacy-Pilotmodus unverändert.
    if (accountAuth) {
      const isOwner = authUser && authUser.role === "abgeordneter" && authUser.politicianId === politicianId;
      const isAdmin = authUser && authUser.role === "admin";
      if (!isOwner && !isAdmin) {
        return sendForbidden(response, "Nur der Mandatsinhaber oder ein Administrator darf die Mandatsdaten exportieren.", "privacy-export-forbidden");
      }
    }
    return handleAsync(response, async () => {
      const result = await exportProfileData(politicianId);
      // DSGVO-Audit-Trail (Audit-Fix 2026-07): Export/Loeschung werden mit
      // minimalen Metadaten protokolliert (keine Inhalte).
      await accounts.recordAudit({ action: "privacy.export", politicianId, ip: auth.clientIp(request) }).catch(() => {});
      return result;
    });
  }

  if (url.pathname === "/api/privacy/delete" && request.method === "POST") {
    if (previewMode) return sendPreviewReadOnly(response);
    // SICHERHEIT (Review-Fix): Die Löschung entfernt seit der Auth-Kaskade auch
    // das KONTO des Mandatsträgers (deleteAuthDataForPolitician: Konto/Sessions/
    // Zuweisungen des politicianId). Ein zugewiesener REFERENT darf das Mandat
    // NICHT löschen — sonst könnte er den MdB aussperren. Im Account-Modus nur
    // der Mandatsinhaber (abgeordneter mit genau diesem politicianId) oder ein
    // Admin. Im Legacy-Pilotmodus (keine Rollen) bleibt das bisherige
    // Ein-Mandats-Verhalten (der Pilotcode = Vollzugriff auf das eine Mandat).
    if (accountAuth) {
      const isOwner = authUser && authUser.role === "abgeordneter" && authUser.politicianId === politicianId;
      const isAdmin = authUser && authUser.role === "admin";
      if (!isOwner && !isAdmin) {
        return sendForbidden(response, "Nur der Mandatsinhaber oder ein Administrator darf die Mandatsdaten löschen.", "privacy-delete-forbidden");
      }
    }
    return handleJson(request, response, async (body) => {
      if (String(body.confirm || "").trim() !== "DELETE") {
        response.writeHead(400, jsonHeaders());
        response.end(JSON.stringify({ error: "Deletion requires confirm: DELETE" }, null, 2));
        return null;
      }
      const result = await deleteProfileData(politicianId);
      await accounts.recordAudit({
        action: "privacy.delete",
        politicianId,
        ip: auth.clientIp(request),
        detail: result && result.ok ? "vollstaendig" : "TEILWEISE FEHLGESCHLAGEN — Nacharbeit noetig"
      }).catch(() => {});
      return result;
    });
  }

  if (url.pathname === "/api/ops/status") {
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      const latestCrawl = await getLatestCrawlRun();
      const latestLageCheck = await getLatestLageCheck(politicianId);
      // V3: Ops liest das frisch aus Knowledge Objects erzeugte Briefing (kein V2-Blob).
      const v3Briefing = await buildV3Briefing(profile, politicianId);
      const latestDebug = await getLatestPipelineDebugReport(politicianId);
      const latestCompleteKoAt = await getLatestCompleteKnowledgeObjectAt();
      const storage = getStorageStatus();
      const storeSummary = await getStoreSummary(politicianId);
      const evidenceQuality = sourceEvidenceQuality(v3Briefing);
      const learning = buildLearningProfile(await getInteractions(politicianId));
      const motorQuality = v3BriefingQuality(v3Briefing, evidenceQuality);
      const readiness = pilotReadiness(latestCrawl, v3Briefing, storage, evidenceQuality, latestLageCheck, latestCompleteKoAt);
      const backend = backendHealth(latestCrawl, v3Briefing, latestDebug, storage, storeSummary, evidenceQuality, motorQuality, learning, latestLageCheck, latestCompleteKoAt);
      return {
        status: operationalStatus(latestCrawl, v3Briefing, storage, latestLageCheck, latestCompleteKoAt),
        backend,
        readiness,
        learning,
        evidenceQuality,
        storage,
        store: storeSummary,
        tenant: tenantStatus(politicianId),
        ai: {
          enabled: isAiEnabled(),
          model: activeModelName()
        },
        push: {
          ...pushStatus(),
          publicKey: pushStatus().enabled ? "configured" : ""
        },
        crawl: latestCrawl || null,
        lageCheck: latestLageCheck || null,
        briefing: v3Briefing ? {
          engine: "v3",
          status: v3Briefing.status,
          generatedAt: v3Briefing.generatedAt,
          available: Boolean(v3Briefing.available),
          itemCount: Array.isArray(v3Briefing.items) ? v3Briefing.items.length : 0,
          recommendationCount: Array.isArray(v3Briefing.personalizedRecommendations) ? v3Briefing.personalizedRecommendations.length : 0,
          situationalCount: Array.isArray(v3Briefing.situationalBriefing) ? v3Briefing.situationalBriefing.length : 0,
          quality: motorQuality,
          datenmotor: motorQuality
        } : null,
        cron: {
          timezone: "Europe/Berlin",
          crawlTimes: ["06:00", "18:00", "22:00"],
          briefingTimes: ["07:00"],
          lageCheckTimes: ["12:00"],
          note: "Vercel Cron ruft die Routen automatisch auf. Auf Hobby laufen tägliche Cron-Jobs; häufigere Lage-Checks brauchen Pro oder externen Cron."
        },
        protection: {
          manualRunMinIntervalMinutes: Math.round(manualRunMinIntervalMs / 60000),
          communicationDraftsPerHour: 18,
          adminBypassConfigured: Boolean(process.env.HELMUT_ADMIN_SECRET || process.env.CRON_SECRET),
          pilotAccessConfigured: isPilotAccessConfigured()
        }
      };
    });
  }

  if (url.pathname === "/api/release/check") {
    return handleAsync(response, () => computeReleaseCheck(politicianId));
  }

  if (url.pathname === "/api/communication/generate" && request.method === "POST") {
    if (!allowRate(request, "communication", 18, 60 * 60 * 1000)) return sendTooManyRequests(response, "Zu viele Kommunikationsentwürfe in kurzer Zeit.");
    return handleJson(request, response, async (body) => {
      const [commProfile, interactions] = await Promise.all([activeProfile(politicianId), getInteractions(politicianId)]);
      return generateCommunicationDraft({
        prompt: String(body.prompt || "").slice(0, 1200),
        channel: body.channel,
        decision: body.decision,
        profile: commProfile,
        learningProfile: buildLearningProfile(interactions)
      });
    });
  }

  if (url.pathname === "/api/learning/status") {
    return handleAsync(response, async () => buildLearningProfile(await getInteractions((await activeProfile(politicianId)).id)));
  }

  if (url.pathname === "/api/cron/crawl") {
    if (!authorizeCron(request, url, response)) return;
    // Mandate kommen aus der Datenbank (kein Request-/Code-Default): siehe runCronForTenants.
    // ZEITBUDGET (Betriebsbefund 2026-07-27): dieser Pfad war der EINZIGE Cron ohne
    // jede Zeitgrenze — sein Geschwisterpfad /api/cron/pipeline hat beide seit je.
    // Folge: am 2026-07-27, 04:01 UTC endete er mit HTTP 504 nach 300s, und die
    // Quellen-Telemetrie am Ende von runSourceCrawl wurde nie geschrieben. Jetzt
    // identisch begrenzt: der Cron antwortet IMMER, der interne Fortschritt ist
    // idempotent und selbst zeitbudgetiert.
    return handleAsync(response, async () => {
      const t0 = Date.now();
      const result = await withTimeout(
        runCronForTenants("crawl", (tenantId) => runSourceCrawl(tenantId), { deadlineMs: 270000 }),
        280000,
        "cron-crawl"
      ).catch((error) => ({ ok: false, bounded: true, reason: "crawl-timeout", error: error && error.message }));
      console.log(`[cron/crawl] ${Date.now() - t0}ms tenants=${result && result.tenants} bounded=${Boolean(result && result.bounded)}`);
      return result;
    });
  }

  if (url.pathname === "/api/cron/morning-briefing") {
    if (!authorizeCron(request, url, response)) return;
    return handleAsync(response, async () => {
      const t0 = Date.now();
      // ALLE aktiven Mandate isoliert (kein Flag, kein bevorzugtes/geratenes Mandat):
      // jedes Mandat erhaelt seinen Morgen-Build + Push. 0 KI (reine Lese-Transformation);
      // Push nur bei echtem Inhalt; deaktivierte Profile werden uebersprungen.
      const summary = await runCronForTenants("morning-briefing", async (tenantId) => {
        const profile = await activeProfile(tenantId);
        const val = validateProfile(profile);
        if (val.disabled) return { skipped: true, reason: "profil-deaktiviert" };
        const briefing = await withTimeout(buildV3Briefing(profile, tenantId), 60000, "cron-briefing-build")
          .catch((error) => ({ available: false, reason: "build-timeout", error: error && error.message, items: [], personalizedRecommendations: [], personMentions: [] }));
        const push = await withTimeout(sendBriefingReadyPush(briefing, profile), 30000, "cron-briefing-push")
          .catch((error) => ({ ok: false, reason: "push-timeout", error: error && error.message }));
        return { available: Boolean(briefing && briefing.available), pushSkipped: Boolean(push && push.skipped), pushReason: (push && push.reason) || null };
      }, { deadlineMs: 240000 });
      // P0-1: Lauf-Kennzahlen persistieren (Zaehler/Status, KEIN Briefingtext).
      await recordProcessRun({
        process: "briefing-morning", runId: helmutRunId("briefing-morning", t0), mode: "cron", location: helmutExecLocation(),
        startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString(),
        durationMs: Date.now() - t0,
        processed: (summary.results || []).filter((r) => r && r.available).length,
        status: (summary.ok === false || ((summary.results || []).length > 0 && (summary.results || []).every((r) => r && r.failed)))
          ? "error" : (summary.tenants ? "ok" : "empty")
      }).catch(() => {});
      console.log(`[cron/morning-briefing] ${Date.now() - t0}ms tenants=${summary.tenants} reason=${summary.reason || "ok"}`);
      return summary;
    });
  }

  if (url.pathname === "/api/cron/pipeline") {
    if (!authorizeCron(request, url, response)) return;
    // V3-Pipeline: der Crawl speist die V3-Tabellen (raw_documents) und triggert
    // Understanding/Matching/Decision (runSourceCrawl). Kein V2-Briefing-Lauf mehr.
    // Hart begrenzt (280s < maxDuration 300s), damit der Cron IMMER antwortet;
    // der interne Fortschritt (Crawl/Shadows) ist idempotent + zeitbudgetiert.
    return handleAsync(response, async () => {
      const t0 = Date.now();
      // Mandate aus der Datenbank; hartes Gesamtbudget 280s < maxDuration 300s.
      const result = await withTimeout(
        runCronForTenants("pipeline", (tenantId) => runSourceCrawl(tenantId), { deadlineMs: 270000 }),
        280000,
        "cron-pipeline"
      ).catch((error) => ({ ok: false, bounded: true, reason: "pipeline-timeout", error: error && error.message }));
      console.log(`[cron/pipeline] ${Date.now() - t0}ms tenants=${result && result.tenants} bounded=${Boolean(result && result.bounded)}`);
      return result;
    });
  }

  // Rein LESENDER Status des letzten Pipeline-Laufs — fuer den GitHub-Actions-
  // Watchdog (Fix des falschen Timeout-Alarms 2026-07-15): Nach einem Client-
  // Timeout arbeitet die Vercel-Function weiter; dieser Pfad beantwortet die
  // Frage "wurde der Lauf serverseitig abgeschlossen?" OHNE die Pipeline erneut
  // anzustossen. 0 Writes, 0 KI; nur whitelisted Zaehlerfelder (keine Rohdaten).
  // Autorisierung: dasselbe CRON_SECRET, das der Watchdog bereits besitzt.
  if (url.pathname === "/api/cron/pipeline-status") {
    if (!authorizeCron(request, url, response)) return;
    return handleAsync(response, async () => {
      const latest = await getLatestCrawlRun();
      return {
        ok: true,
        latestRun: latest ? {
          createdAt: latest.createdAt || null,
          checkedSources: latest.checkedSources ?? null,
          successfulSources: latest.successfulSources ?? null,
          failedSources: latest.failedSources ?? null,
          savedItems: latest.savedItems ?? null,
          // P0-1/P0-2: Laufzeit wird jetzt real gemessen (scheduler runSourceCrawl:
          // Date.now()-runStartedMs) UND von compactStore erhalten -> nach einem
          // echten Crawl ist durationMs != null. Laufkennung/Quellenmodus zur
          // Korrelation mitgeliefert (technische Metadaten).
          durationMs: latest.durationMs ?? null,
          runId: latest.runId ?? null,
          sourceMode: latest.sourceMode ?? null,
          understanding: latest.understanding ?? null
        } : null
      };
    });
  }

  // Morgen-Health-Report per WhatsApp (CallMeBot). Antwort enthaelt den Text +
  // Zustellstatus, damit man ihn manuell testen kann (?secret=CRON_SECRET).
  if (url.pathname === "/api/cron/health-report") {
    if (!authorizeCron(request, url, response)) return;
    return handleAsync(response, async () => {
      const dryRun = url.searchParams.get("dryRun") === "1";
      // Mandate AUSSCHLIESSLICH aus der Datenbank; je aktivem Mandat ein isolierter
      // Report. Zugestellt wird EINE aggregierte Alarm-Nachricht je Kanal (kein
      // Spam, kein 'erstes' Mandat); top-level ok = ECHTER Gesundheitsstatus (alle
      // Mandate ok). 0 aktive Mandate -> sauberer Lauf; Ladestoerung -> ok:false.
      const { tenantIds, reason } = await tenantContext.resolveCronTenants();
      if (!tenantIds.length) {
        const ladeStoerung = reason === "mandanten-liste-nicht-ladbar";
        if (ladeStoerung) {
          await accounts.recordSystemError({ scope: "health-report", message: "Mandantenliste nicht ladbar — Health-Report uebersprungen.", path: "/api/cron/health-report" }).catch(() => {});
        }
        return { ok: !ladeStoerung, skipped: true, reason, tenants: 0, reports: [] };
      }
      const reports = [];
      for (const tenantId of tenantIds) {
        try {
          const r = await buildHealthReport(tenantId);
          reports.push({
            tenant: tenantId, ok: r.ok, text: r.text, overdueCrons: r.overdueCrons,
            googleUrlResolutionRate: r.googleUrlResolutionRate,
            // Härtungs-Sprint: Zustand/Blocker/rollierende Crawl-Sicht für den
            // aggregierten Alarm-Payload (nur technische Felder).
            state: r.state, severity: r.severity,
            healthBlockers: r.healthBlockers, healthWarnings: r.healthWarnings,
            rollingCrawl: r.rollingCrawl
          });
        } catch (error) {
          // Auch der Fehlerfall trägt Zustand/Blocker (Review-Fix): sonst
          // kollidieren die Alarm-Ereigniskennungen verschiedener Report-
          // Crashes (leere Hash-Basis) und ein zweiter, anderer Ausfall am
          // selben Tag würde als Duplikat unterdrückt.
          reports.push({
            tenant: tenantId, ok: false,
            text: `${tenantId}: Health-Report-Fehler: ${error && error.message}`,
            error: error && error.message,
            state: "report-fehler", severity: "alarm",
            healthBlockers: ["report-fehler", tenantId]
          });
        }
      }
      // --- Watchdog Vorgangsbildung (Betriebsbefund B4, Phase 10) ------------
      // MANDANTENNEUTRAL und deshalb GENAU EINMAL je Lauf, nicht je Mandat:
      // raw_documents/knowledge_objects/ko_document_links tragen kein tenant_id.
      // Gemessen wird ein kurzes Fenster (48 h) — die Frage lautet "arbeitet die
      // Vorgangsbildung JETZT sauber?", nicht "gibt es historischen Rueckstand?".
      // Der Altbestand wird ueber scripts/vorgangsbildung-nachholen.js abgearbeitet.
      // Fail-safe: ein Fehler hier darf den Health-Report nie zu Fall bringen.
      const vorgangsWatchdog = await (async () => {
        try {
          const lz = require("./lib/helmut/vorgangs-lebenszyklus");
          const storageMod = require("./lib/helmut/storage");
          const [docs, links, kos] = await Promise.all([
            storageMod.listRawDocuments({ days: 2, limit: 2000 }).catch(() => []),
            storageMod.listKoDocumentLinks({ limit: 4000 }).catch(() => []),
            storageMod.listKnowledgeObjectStates({ limit: 4000 }).catch(() => [])
          ]);
          if (!Array.isArray(docs) || !docs.length) return null;
          const bewertung = lz.assessLifecycle({ rawDocs: docs, links, kos, now: Date.now() });
          return { ...lz.watchdogVorgangsbildung(bewertung), fensterTage: 2 };
        } catch (error) {
          console.error("[health-report] Vorgangs-Watchdog fehlgeschlagen (ignoriert):", error && error.message);
          return null;
        }
      })();

      // Nur ein ALARM macht den Gesamtbericht rot. Eine Warnung wird sichtbar
      // gemacht, loest aber keinen Alarmkanal aus — sonst wuerde ein einzelnes
      // verwaistes Dokument den Betreiber jede Nacht wecken.
      const watchdogAlarm = Boolean(vorgangsWatchdog && vorgangsWatchdog.zustand === "alarm");
      const overallOk = reports.every((r) => r.ok) && !watchdogAlarm;
      const combinedText = [
        ...reports.map((r) => r.text).filter(Boolean),
        vorgangsWatchdog && vorgangsWatchdog.zustand !== "ok" && vorgangsWatchdog.zustand !== "unbekannt"
          ? `Vorgangsbildung (${vorgangsWatchdog.fensterTage} Tage): ${vorgangsWatchdog.zustand.toUpperCase()}\n${vorgangsWatchdog.meldungen.map((m) => `- ${m}`).join("\n")}`
          : null
      ].filter(Boolean).join("\n\n");
      const kanaele = {
        whatsapp: { konfiguriert: Boolean(String(process.env.CALLMEBOT_PHONE || "").trim() && String(process.env.CALLMEBOT_APIKEY || "").trim()) },
        webhook: { konfiguriert: Boolean(String(process.env.HELMUT_MONITORING_WEBHOOK_URL || "").trim()) }
      };
      if (dryRun) {
        return { dryRun: true, ok: overallOk, tenants: tenantIds.length, text: combinedText, kanaele, reports, vorgangsWatchdog };
      }
      // EINE aggregierte Nachricht je Kanal (Alarm feuert, wenn IRGENDEIN Mandat nicht ok ist).
      // Härtungs-Sprint: Zustand/Blocker/rollierende Crawl-Sicht des SCHLECHTESTEN
      // Mandats fließen mit — stabile Ereigniskennung + Webhook-Payload brauchen sie.
      const alertRank = { alarm: 2, warnung: 1, ok: 0 };
      const worstRolling = reports.map((r) => r.rollingCrawl).filter(Boolean)
        .sort((a, b) => (alertRank[b.alertLevel] || 0) - (alertRank[a.alertLevel] || 0))[0] || null;
      const leadReport = reports.find((r) => !r.ok) || reports[0] || {};
      const aggregate = {
        ok: overallOk, text: combinedText,
        state: leadReport.state, severity: leadReport.severity,
        healthBlockers: [
          ...reports.flatMap((r) => r.healthBlockers || []),
          ...(watchdogAlarm ? ["vorgangsbildung-ohne-endzustand"] : [])
        ],
        healthWarnings: [
          ...reports.flatMap((r) => r.healthWarnings || []),
          ...(vorgangsWatchdog && vorgangsWatchdog.zustand === "warnung" ? ["vorgangsbildung-rueckstand"] : [])
        ],
        rollingCrawl: worstRolling,
        overdueCrons: reports.flatMap((r) => r.overdueCrons || []),
        googleUrlResolutionRate: reports.map((r) => r.googleUrlResolutionRate).filter((x) => x != null).sort((a, b) => a - b)[0] ?? null
      };
      const [delivery, webhook] = await Promise.all([
        sendCallMeBotMessage(buildAlarmText(aggregate)),
        sendMonitoringWebhook(aggregate)
      ]);
      const whatsappBroken = delivery && delivery.sent === false && !delivery.skipped;
      const webhookBroken = webhook && webhook.sent === false && !webhook.skipped;
      if (whatsappBroken || webhookBroken) {
        await accounts.recordSystemError({
          scope: "health-report",
          message: `Alarm-Zustellung fehlgeschlagen: ${whatsappBroken ? "WhatsApp " + (delivery.reason || "HTTP " + (delivery.status || "?")) : ""} ${webhookBroken ? "Webhook " + (webhook.reason || "HTTP " + (webhook.status || "?")) : ""}`.trim(),
          path: "/api/cron/health-report"
        }).catch(() => {});
      }
      // webhook.skipped kann auch "duplicate-event" (bereits zugestellt) sein —
      // das ist KEIN unkonfigurierter Kanal (Review-Fix: unconfigured-Flag).
      if (!overallOk && delivery && delivery.skipped && webhook && webhook.skipped && webhook.unconfigured === true) {
        await accounts.recordSystemError({
          scope: "health-report",
          message: "Nicht-grüner Health-Report, aber KEIN Alarmkanal konfiguriert (CALLMEBOT_* und HELMUT_MONITORING_WEBHOOK_URL fehlen).",
          path: "/api/cron/health-report"
        }).catch(() => {});
      }
      return { ok: overallOk, tenants: tenantIds.length, text: combinedText, delivery, webhook, reports, vorgangsWatchdog };
    });
  }

  if (url.pathname === "/api/cron/lage-check") {
    if (!authorizeCron(request, url, response)) return;
    // V3: Lage-Check regeneriert kein V2-Briefing mehr — bei neuer Lage werden die
    // frischen Items in Knowledge Objects + Decisions gefaltet (runLageCheck).
    // Hart begrenzt (280s < maxDuration 300s), damit der Cron IMMER antwortet;
    // der interne Understanding-Loop ist zeitbudgetiert + fail-safe.
    return handleAsync(response, async () => {
      const t0 = Date.now();
      // Mandate aus der Datenbank; je Mandat Check + Push, isoliert und zeitbudgetiert.
      // Aeusseres Gesamt-Timeout 280s < maxDuration 300s: die Antwort kommt IMMER,
      // auch wenn ein einzelner Mandats-Check sein Einzelbudget ausschoepft.
      const summary = await withTimeout(runCronForTenants("lage-check", async (tenantId) => {
        const profile = await activeProfile(tenantId);
        const val = validateProfile(profile);
        if (val.disabled) return { skipped: true, reason: "profil-deaktiviert" };
        const lageCheck = await withTimeout(runLageCheck(tenantId), 240000, "cron-lage-check")
          .catch((error) => ({ status: "stable", bounded: true, reason: "lage-check-timeout", error: error && error.message }));
        const push = await withTimeout(sendLageChangePush(lageCheck, profile), 30000, "cron-lage-push")
          .catch((error) => ({ ok: false, reason: "push-timeout", error: error && error.message }));
        return { lageCheck, push };
      }, { deadlineMs: 240000 }), 280000, "cron-lage-check-gesamt")
        .catch((error) => ({ ok: false, bounded: true, reason: "lage-check-timeout", error: error && error.message }));
      console.log(`[cron/lage-check] ${Date.now() - t0}ms tenants=${summary && summary.tenants} bounded=${Boolean(summary && summary.bounded)}`);
      return summary;
    });
  }

  // Vorwaerm-Lauf: erzeugt das Lage-Briefing pro Profil einmal (generate-if-missing),
  // damit die erste Oeffnung des Tages sofort aus dem Cache liest. CRON_SECRET-geschuetzt.
  if (url.pathname === "/api/cron/lage-briefing") {
    if (!authorizeCron(request, url, response)) return;
    return handleAsync(response, async () => {
      const lageBriefingStartMs = Date.now();
      const lageBriefingRunId = helmutRunId("briefing-lage", lageBriefingStartMs);
      let profiles = await listProfiles().catch(() => []);
      if (!Array.isArray(profiles)) profiles = [];
      // KEIN Fallback auf ein Default-Mandat: ohne gespeicherte Profile ist der
      // Vorwaerm-Lauf ein ehrlicher Leerlauf.
      const results = [];
      let skipped = 0;
      // Hartes Zeitbudget wie im morning-briefing (240s < maxDuration 300s):
      // der Cron antwortet IMMER; nicht erreichte Mandate holt der naechste
      // (idempotente) Lauf nach.
      const lageBriefingDeadline = lageBriefingStartMs + 240000;
      for (const p of profiles) {
        if (!p || !p.id) { skipped += 1; results.push({ userId: null, available: false, reason: "profil-ohne-id", vorgaenge: 0 }); continue; }
        if (Date.now() > lageBriefingDeadline) { results.push({ userId: p.id, available: false, reason: "zeitbudget", vorgaenge: 0 }); continue; }
        // Mehrmandantenfaehigkeit Phase 8: deaktivierte Profile nehmen an der
        // Verarbeitung NICHT teil (sie sollen kein Briefing erzeugen). VOLLSTAENDIGE
        // Fehler-Isolation je Mandat: auch activeProfile/validateProfile stehen im
        // try/catch — ein Storage-Fehler bei EINEM Profil bricht die Schleife nicht
        // (Befund der Cron-Inventur: frueher war nur buildLageBriefing gefangen).
        try {
          const profile = await activeProfile(p.id);
          const val = validateProfile(profile);
          if (val.disabled) {
            skipped += 1;
            results.push({ userId: profile.id, available: false, reason: "profil-deaktiviert", vorgaenge: 0 });
            continue;
          }
          const res = await buildLageBriefing(profile, { politicianId: profile.id })
            .catch((e) => ({ available: false, reason: "error", error: e && e.message }));
          results.push({ userId: profile.id, available: res.available, fromCache: res.fromCache, reason: res.reason || null, vorgaenge: (res.vorgaenge || []).length });
        } catch (error) {
          results.push({ userId: p.id, available: false, reason: "profil-fehler", error: error && error.message, vorgaenge: 0 });
        }
      }
      // P0-1: echte Lage-Briefing-Vorwaerm-Laufzeit persistieren (Zaehler/Status, kein Text).
      await recordProcessRun({
        process: "briefing-lage", runId: lageBriefingRunId, mode: "cron", location: helmutExecLocation(),
        startedAt: new Date(lageBriefingStartMs).toISOString(), finishedAt: new Date().toISOString(),
        durationMs: Date.now() - lageBriefingStartMs,
        processed: results.length, deferred: skipped,
        status: "ok"
      }).catch(() => {});
      return { prewarmed: results.length, uebersprungen: skipped, results };
    });
  }

  // Provenienz-Backfill fuer BESTEHENDE Vorgaenge (kein KI-Call). ?secret=CRON_SECRET.
  // ?dryRun=1 zeigt nur, was verlinkt wuerde; ?days= / ?limit= steuern das Zeitfenster.
  if (url.pathname === "/api/debug/lage-backfill") {
    if (!authorizeCron(request, url, response)) return;
    // Review-Fix (Phase 9): Default war ein SCHREIBLAUF per GET (dryRun nur mit
    // ?dryRun=1). Jetzt wie ko-enrichment/presentation: GET = immer Dry-Run,
    // echter Lauf nur per POST (+ Bearer-Secret; hasAdminBypass befreit vom CSRF).
    return handleAsync(response, async () => {
      const days = Number(url.searchParams.get("days")) || undefined;
      const limit = Number(url.searchParams.get("limit")) || undefined;
      const dryRun = request.method !== "POST" || url.searchParams.get("dryRun") === "1";
      return { mode: dryRun ? "dry-run (Schreiblauf nur per POST)" : "execute", ...(await backfillProvenance({ days, limit, dryRun })) };
    });
  }

  // Presentation-Fields-Backfill fuer BESTEHENDE Vorgaenge (manueller Wartungs-Trigger).
  // Geschuetzt durch CRON_SECRET (authorizeCron ist FAIL CLOSED: 503 ohne Secret, 403 bei
  // falschem Secret). Wie die uebrigen /api/cron|debug-Routen per GET + Bearer-Secret:
  // GET umgeht den globalen CSRF-Guard (der jeden POST ohne Session-Token blockt), und da
  // Query-Secrets standardmaessig AUS sind, MUSS das Secret im Authorization-Header stehen
  // -- kein Prefetch/Link kann den Lauf ausloesen. KEINE Cron-Anbindung, KEINE automatische
  // Ausfuehrung. SICHER per Default: nur DRY-RUN (Plan + Kostenschaetzung, KEINE KI-Calls,
  // kein Schreibvorgang); ein echter Lauf passiert ausschliesslich mit ?execute=1.
  // ?limit= begrenzt optional die Menge. Der Backfill selbst ist idempotent.
  if (url.pathname === "/api/admin/presentation-backfill") {
    if (!authorizeCron(request, url, response)) return;
    // Review-Fix (Phase 9): echter Lauf (execute=1, KI-Calls + KO-Writes) nur per
    // POST — wie ko-enrichment-backfill. GET bleibt Dry-Run (Plan + Kosten).
    // POST mit Bearer-Secret passiert den CSRF-Guard via hasAdminBypass.
    if (url.searchParams.get("execute") === "1" && request.method !== "POST") {
      response.writeHead(405, jsonHeaders());
      response.end(JSON.stringify({ error: "Ausführung nur per POST. GET liefert ausschließlich die Dry-Run-Vorschau." }, null, 2));
      return undefined;
    }
    return handleAsync(response, async () => {
      const limit = Number(url.searchParams.get("limit")) || undefined;
      const dryRun = !(request.method === "POST" && url.searchParams.get("execute") === "1"); // Default DRY-RUN
      const result = await backfillPresentationFields({ dryRun, limit });
      return { ok: !(result && result.skipped), mode: dryRun ? "dry-run" : "execute", result };
    });
  }

  // C11b: Hintergrund-Understanding fuer als 'pending' vorgemerkte Vorgaenge (C7c+C8).
  // Verarbeitet alle offenen pending-KOs unabhaengig vom Crawl-Lauf.
  // Geschuetzt durch CRON_SECRET (fail closed). Hinter HELMUT_V3_STORE + KI-Key.
  if (url.pathname === "/api/cron/understanding") {
    if (!authorizeCron(request, url, response)) return;
    return handleAsync(response, async () => {
      // P0-1: echte Wall-Clock-Messung des dedizierten Understanding-Cron-Laufs.
      const understandingStartMs = Date.now();
      const runId = helmutRunId("understanding-cron", understandingStartMs);
      // P1-4 (freigabepflichtig, Default AUS): begrenzte Recovery fehlgeschlagener
      // Wissensobjekte VOR dem Lauf — sie werden bounded auf 'pending' zurückgesetzt
      // und in DIESEM Lauf gleich mitverstanden. Ohne Flag ein No-Op (kein Prod-Write).
      const recovery = await recoverFailedUnderstanding({
        listFailed: (limit) => listFailedKnowledgeObjects({ limit }),
        resetToPending: (vid) => resetUnderstandingToPending(vid),
        markTerminal: (vid) => markUnderstandingTerminal(vid),
        readRetries: () => getUnderstandingRetries(),
        writeRetries: (map) => saveUnderstandingRetries(map)
      }).catch((e) => ({ skipped: true, reason: "recovery-error", error: e && e.message }));
      if (recovery && (recovery.retried || recovery.terminal)) {
        console.log(`[cron/understanding] recovery: ${JSON.stringify({ retried: recovery.retried, terminal: recovery.terminal })}`);
      }
      const rawDocs = await listRecentRawDocuments(500);
      // ZEITBUDGET (Default 240s): der serielle KI-Understanding-Loop darf die
      // Serverless-Funktion nicht über ihr Limit (300s) treiben. Rest bleibt pending
      // und wird beim nächsten Lauf nachgeholt (idempotent).
      // Punkt 17 (Review-Korrektur): dieselbe Laufkennung, die recordProcessRun
      // unten schreibt, MUSS auch in den Kostenlog. Ohne sie blieb ausgerechnet
      // der dedizierte Understanding-Cron — ein Hauptkostenpfad — bei den Kosten
      // je Lauf auf die Zeitfenster-Rekonstruktion angewiesen.
      const result = await runPendingUnderstandingShadow(rawDocs, { budgetMs: Number(process.env.HELMUT_UNDERSTAND_BUDGET_MS || 240000), runId });
      // "processed" zaehlt jetzt auch Aktualisierungen bestehender Vorgaenge —
      // vorher zaehlte nur `saved`, wodurch ein Nachholauf, der ausschliesslich
      // bestehende Vorgaenge fortgeschrieben hat, als "0 verarbeitet" erschien.
      const processed = (result && result.results && result.results.filter((r) => r && (r.status === "saved" || r.status === "updated")).length) || 0;
      console.log(`[cron/understanding] rawDocs=${rawDocs.length} Ergebnis: ${JSON.stringify({ processed, result })}`);
      // P0-1: Understanding-Batch-Laufzeit persistieren (Auth-Store, scalar-only, PII-frei).
      await recordProcessRun({
        process: "understanding-cron", runId, mode: "cron", location: helmutExecLocation(),
        startedAt: new Date(understandingStartMs).toISOString(), finishedAt: new Date().toISOString(),
        durationMs: Date.now() - understandingStartMs,
        processed,
        deferred: result && result.deferred,
        skippedStore: result && result.counts && result.counts["skipped-store"],
        reason: result && result.reason,
        status: result && result.skipped ? "skipped" : "ok",
        telemetrie: result && result.telemetrie
      }).catch(() => {});
      return { ok: true, rawDocsLoaded: rawDocs.length, processed, result, recovery };
    });
  }

  if (url.pathname === "/api/tasks") {
    if (request.method === "GET") return handleAsync(response, async () => getTasks((await activeProfile(politicianId)).id));
    if (previewMode) return sendPreviewReadOnly(response);
    if (request.method === "POST") return handleJson(request, response, async (body) => saveTask(await normalizeTask(body, politicianId)));
  }

  if (url.pathname.startsWith("/api/tasks/") && request.method === "PATCH") {
    if (previewMode) return sendPreviewReadOnly(response);
    const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", ""));
    return handleJson(request, response, async (body) => {
      const task = await updateTaskStatus(taskId, body.status, politicianId);
      if (!task) {
        sendNotFound(response);
        return null;
      }
      return task;
    });
  }

  if (url.pathname === "/api/interactions" && request.method === "POST") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleJson(request, response, async (body) => saveInteraction(await normalizeInteraction(body, politicianId)));
  }

  // Nutzer-Feedback erfassen (jede angemeldete Rolle). Landet in der Admin-Inbox.
  if (url.pathname === "/api/feedback" && request.method === "POST") {
    if (accountAuth && !authUser) return sendUnauthorized(response);
    if (previewMode) return sendPreviewReadOnly(response);
    return handleJson(request, response, async (body) => {
      const type = String(body.type || "").trim().toLowerCase();
      if (!FEEDBACK_TYPES.includes(type)) throw accounts.httpError(400, "Ungueltiger Feedback-Typ.");
      const entry = await saveFeedback({
        politicianId,
        userId: authUser?.id || null,
        userName: authUser?.name || authUser?.email || "Pilot",
        area: String(body.area || "Allgemein").slice(0, 80),
        topic: String(body.topic || "").slice(0, 240),
        type,
        comment: String(body.comment || "").slice(0, 1000)
      });
      return { ok: true, feedback: { id: entry.id } };
    });
  }

  if (url.pathname === "/api/parliament") {
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      return getRelevantParliamentaryItems(profile);
    });
  }

  if (url.pathname === "/api/parliament/assess" && request.method === "POST") {
    if (!allowRate(request, "parliament-assess", 40, 60 * 60 * 1000)) return sendTooManyRequests(response, "Zu viele Einordnungen in kurzer Zeit.");
    return handleJson(request, response, async (body) => {
      const profile = await activeProfile(politicianId);
      return assessParliamentaryItem({
        item: {
          type: String(body.type || "").slice(0, 120),
          title: String(body.title || "").slice(0, 400),
          urheber: Array.isArray(body.urheber) ? body.urheber.slice(0, 6) : [],
          date: String(body.date || "").slice(0, 40)
        },
        profile
      });
    });
  }

  if (url.pathname === "/api/notes") {
    if (request.method === "GET") return handleAsync(response, async () => getUserNotes((await activeProfile(politicianId)).id));
    if (previewMode) return sendPreviewReadOnly(response);
    if (request.method === "POST") return handleJson(request, response, async (body) => saveUserNote(await normalizeUserNote(body, politicianId)));
  }

  // --- Tagesinput (Referent/Admin pflegen bis zu N Termine/Themen pro Mandat) ---
  if (url.pathname === "/api/daily-inputs") {
    if (accountAuth && !authUser) return sendUnauthorized(response);
    if (request.method === "GET") {
      return handleAsync(response, async () => ({
        politicianId,
        max: accounts.MAX_DAILY_INPUTS_PER_DAY,
        inputs: await accounts.listDailyInputs(politicianId, { day: url.searchParams.get("day") || undefined })
      }));
    }
    if (request.method === "POST") {
      if (previewMode) return sendPreviewReadOnly(response);
      if (accountAuth && !requireRoleOr403(response, authUser, ["referent", "admin"])) return undefined;
      return handleJson(request, response, async (body) => {
        const entry = await accounts.addDailyInput({ ...body, politicianId, createdBy: authUser?.id || null });
        // SICHERHEIT/DSGVO: nur die ID loggen, nicht den Freitext-Titel (minimale Audit-
        // Metadaten, wie an jeder anderen recordAudit-Stelle — und die ID bleibt loeschbar
        // ueber die Aufgabe selbst, waehrend der Auth-Store nicht Teil der /api/privacy/
        // delete-Kaskade ist).
        if (accountAuth) await accounts.recordAudit({ action: "daily-input.create", userId: authUser?.id, actorEmail: authUser?.email, politicianId, detail: entry.id });
        return entry;
      });
    }
  }

  if (url.pathname.startsWith("/api/daily-inputs/") && request.method === "DELETE") {
    if (accountAuth && !requireRoleOr403(response, authUser, ["referent", "admin"])) return undefined;
    if (previewMode) return sendPreviewReadOnly(response);
    const inputId = decodeURIComponent(url.pathname.replace("/api/daily-inputs/", ""));
    return handleAsync(response, async () => ({ ok: true, inputs: await accounts.removeDailyInput(inputId, politicianId) }));
  }

  // --- Admin-Bereich (nur Rolle admin) ---
  if (url.pathname === "/api/admin/users") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    if (request.method === "GET") {
      return handleAsync(response, async () => {
        // Offene Einladungen je Konto mitliefern (nur Zeiten, nie Token-Hashes),
        // damit der Admin "Einladung ausstehend / laeuft ab am" anzeigen kann (§6).
        const [users, invites] = await Promise.all([accounts.listUsers(), accounts.listPendingInvites()]);
        return users.map((user) => ({ ...user, invite: invites[user.id] || null }));
      });
    }
    if (request.method === "POST") {
      return handleJson(request, response, async (body) => {
        const user = await accounts.createUser(body);
        // Schnellstart: optionale Kern-Mandatsdaten direkt ins Profil schreiben,
        // damit Helmut ab Tag 1 personalisiert. DSGVO: nur berufliche Pflichtfelder,
        // editier-/löschbar durch den/die Abgeordnete:n.
        if (user.role === "abgeordneter" && user.politicianId) {
          const quickStartKeys = ["party", "faction", "committee", "constituency", "state"];
          const hasQuickStart = quickStartKeys.some((key) => String(body[key] || "").trim())
            || (Array.isArray(body.focusTopics) && body.focusTopics.length);
          if (hasQuickStart) {
            await saveProfile(await normalizeProfile({
              fullName: user.name,
              party: body.party,
              faction: body.faction,
              committee: body.committee,
              constituency: body.constituency,
              state: body.state,
              focusTopics: Array.isArray(body.focusTopics) ? body.focusTopics : undefined
            }, user.politicianId));
          }
        }
        await accounts.recordAudit({ action: "admin.user.create", userId: authUser.id, actorEmail: authUser.email, detail: user.email });
        // Invite-Flow (§6): ohne Passwort angelegte Konten bekommen sofort einen
        // Einladungs-Link. Die Antwort traegt inviteUrl fuer den Interim-Kopierweg
        // (Mail-Versand folgt mit der Domain) + ehrlichen mail.sent-Status.
        // Gesperrt angelegte Konten (active:false, API-Randfall) bekommen keinen
        // Link — createPasswordToken wuerde 409 werfen, NACHDEM der Nutzer schon
        // angelegt ist; der Admin kann aktivieren und dann den Zugangslink erstellen.
        if (user.status === "eingeladen" && user.active !== false) {
          const invite = await issueInvite(request, user);
          return { ...user, inviteUrl: invite.inviteUrl, inviteExpiresAt: invite.expiresAt, mail: invite.mail };
        }
        return user;
      });
    }
  }

  // Zugangslink erstellen (§6): Einladung erneut senden (Konto ohne Passwort,
  // 7 Tage) bzw. Reset-Link (Konto mit Passwort, 1 Stunde). Der Admin fasst nie
  // ein Passwort an — er bekommt nur den Link (Interim-Kopierweg, solange kein
  // Mail-Dienst existiert). Ein neuer Link invalidiert alte offene Links.
  // MUSS vor der generischen /api/admin/users/:id-Route stehen (die matcht POST auch).
  if (url.pathname.startsWith("/api/admin/users/") && url.pathname.endsWith("/invite") && request.method === "POST") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const inviteUserId = decodeURIComponent(url.pathname.slice("/api/admin/users/".length, -"/invite".length));
    return handleJson(request, response, async () => {
      const target = await accounts.getUserByIdRaw(inviteUserId);
      if (!target) throw accounts.httpError(404, "Nutzer nicht gefunden.");
      const purpose = target.passwordHash ? "reset" : "invite";
      const issued = await accounts.createPasswordToken(target.id, purpose);
      const linkUrl = passwordSetUrl(request, issued.token);
      const mailContent = purpose === "reset"
        ? inviteMail.buildResetMail({ name: target.name, resetUrl: linkUrl })
        : inviteMail.buildInviteMail({ name: target.name, inviteUrl: linkUrl });
      const mail = await inviteMail.sendAccessMail({ to: target.email, ...mailContent });
      const action = purpose === "reset" ? "admin.user.reset-link" : "admin.user.invite";
      await accounts.recordAudit({ action, userId: authUser.id, actorEmail: authUser.email, detail: target.email });
      return { ok: true, purpose, inviteUrl: linkUrl, expiresAt: issued.expiresAt, mail };
    });
  }

  // Nutzer loeschen (nur Admin, ausschliesslich ueber die interne Nutzer-ID aus
  // dem Pfad — nie ueber E-Mail). Loescht GENAU dieses Konto + seine eigenen
  // Sessions/Passwort-Tokens/Zuweisungen; Mandatsinhalte und Audit-Log bleiben
  // unberuehrt (siehe accounts.deleteUser). Schutzregeln (Selbstloeschung,
  // Administratoren) sind dort verdrahtet, nicht hier dupliziert.
  if (url.pathname.startsWith("/api/admin/users/") && request.method === "DELETE") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const targetUserId = decodeURIComponent(url.pathname.replace("/api/admin/users/", ""));
    return handleAsync(response, async () => {
      const result = await accounts.deleteUser(targetUserId, authUser.id);
      await accounts.recordAudit({ action: "admin.user.delete", userId: authUser.id, actorEmail: authUser.email, detail: result.deletedEmail });
      return result;
    });
  }

  if (url.pathname.startsWith("/api/admin/users/") && (request.method === "PATCH" || request.method === "POST")) {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const userId = decodeURIComponent(url.pathname.replace("/api/admin/users/", ""));
    return handleJson(request, response, async (body) => {
      // Umsetzungsnotiz §6: Der Admin fasst nie ein Passwort an. Der fruehere
      // admin-seitige Passwort-Reset ist durch den Zugangslink-Flow ersetzt
      // (POST /api/admin/users/:id/invite) — Passwoerter setzt nur noch die
      // Person selbst ueber /passwort-setzen.
      if (body.password !== undefined && body.password !== "") {
        throw accounts.httpError(400, "Passwoerter werden nicht mehr admin-seitig gesetzt — Zugangslink erstellen (Einladung/Reset).");
      }
      const user = await accounts.updateUser(userId, body);
      // Deaktivierte Nutzer sofort ausloggen — auch wenn der Status
      // (gekuendigt/deaktiviert) den Login serverseitig gesperrt hat.
      if (user.active === false) {
        await accounts.destroyUserSessions(userId);
      }
      await accounts.recordAudit({ action: "admin.user.update", userId: authUser.id, actorEmail: authUser.email, detail: user.email });
      return user;
    });
  }

  // --- Admin-Profilverwaltung (Phase 4): ein Profil je politicianId lesen/bearbeiten ---
  // GET liefert das volle Profil + Validierung (Phase 5) + Versorgungsstatus, damit
  // die Bearbeitungsansicht Vollstaendigkeit, fehlende Pflichtfelder, KI-Budget und
  // ob das Profil technisch/fachlich versorgt wird auf einen Blick zeigt.
  if (url.pathname.startsWith("/api/admin/profile/") && url.pathname.endsWith("/test-briefing") && request.method === "POST") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const pid = accounts.slugify(decodeURIComponent(url.pathname.slice("/api/admin/profile/".length, -"/test-briefing".length)));
    return handleAsync(response, async () => {
      const profile = await activeProfile(pid).catch(() => null);
      if (!profile) return { ok: false, reason: "no-profile" };
      const validation = validateProfile(profile);
      // Kein KI-Call: countOnly-Lage + V3-Briefing (beide 0-KI) -> zeigt, ob das
      // Profil gerade Karten/Punkte bekaeme. Ein „Testbriefing" ist hier bewusst
      // eine sichere Trockenrechnung, kein teurer Live-Versand.
      let briefingPoints = 0, lageCount = 0;
      try { const b = await buildV3Briefing(profile, pid); briefingPoints = b && b.available ? (b.items || []).length : 0; } catch (_) {}
      try { const l = await buildLageBriefing(profile, { politicianId: pid, countOnly: true }); lageCount = l && l.available ? (l.vorgaenge || []).length : 0; } catch (_) {}
      await accounts.recordAudit({ action: "admin.profile.test-briefing", userId: authUser.id, actorEmail: authUser.email, politicianId: pid });
      return {
        ok: true,
        politicianId: pid,
        zustand: validation.stateLabel,
        bereit: validation.ready,
        kannBriefingErhalten: validation.impact.kannBriefingErhalten,
        briefingPunkte: briefingPoints,
        lageVorgaenge: lageCount,
        hinweis: briefingPoints === 0 && lageCount === 0
          ? (validation.ready ? "Profil ist vollständig, aber es liegen aktuell keine passenden Vorgänge vor (dünne Quellenlage)."
                              : "Profil ist noch nicht vollständig — deshalb keine personalisierten Inhalte.")
          : "Profil erhält Inhalte."
      };
    });
  }

  if (url.pathname.startsWith("/api/admin/profile/")) {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const pid = accounts.slugify(decodeURIComponent(url.pathname.slice("/api/admin/profile/".length)));
    if (!pid) return sendNotFound(response);
    if (request.method === "GET") {
      return handleAsync(response, async () => {
        const profile = await activeProfile(pid).catch(() => null);
        const validation = validateProfile(profile || { id: pid });
        return { profile: profile || { id: pid }, validierung: {
          zustand: validation.state,
          zustandLabel: validation.stateLabel,
          grund: validation.reason,
          bereit: validation.ready,
          nutzbar: validation.usable,
          deaktiviert: validation.disabled,
          fehlendePflichtfelder: validation.missingRequiredLabels,
          budgetProbleme: validation.budgetProblems,
          funktionsauswirkung: validation.impact
        } };
      });
    }
    if (request.method === "POST" || request.method === "PATCH") {
      if (previewMode) return sendPreviewReadOnly(response);
      return handleJson(request, response, async (body) => {
        const saved = await saveProfile(await normalizeProfile(body, pid));
        await accounts.recordAudit({ action: "admin.profile.update", userId: authUser.id, actorEmail: authUser.email, politicianId: pid });
        const validation = validateProfile(saved);
        return { profile: saved, validierung: { zustand: validation.state, zustandLabel: validation.stateLabel, bereit: validation.ready, fehlendePflichtfelder: validation.missingRequiredLabels } };
      });
    }
  }

  if (url.pathname === "/api/admin/assignments") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    if (request.method === "GET") return handleAsync(response, () => accounts.listAssignments());
    if (request.method === "POST") {
      return handleJson(request, response, async (body) => {
        const assignments = await accounts.addAssignment(body.userId, body.politicianId);
        await accounts.recordAudit({ action: "admin.assignment.add", userId: authUser.id, actorEmail: authUser.email, politicianId: accounts.slugify(body.politicianId), detail: body.userId });
        return { ok: true, assignments };
      });
    }
    if (request.method === "DELETE") {
      return handleJson(request, response, async (body) => {
        const assignments = await accounts.removeAssignment(body.userId, body.politicianId);
        await accounts.recordAudit({ action: "admin.assignment.remove", userId: authUser.id, actorEmail: authUser.email, politicianId: accounts.slugify(body.politicianId), detail: body.userId });
        return { ok: true, assignments };
      });
    }
  }

  if (url.pathname === "/api/admin/overview") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, () => buildAdminOverview());
  }

  // Admin-Stats: Heute (1 Tag)
  if (url.pathname === "/api/admin/stats/daily") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, () => getAdminStatsOverview({ days: 1 }));
  }

  // Admin-Stats: Letzte 7 Tage
  if (url.pathname === "/api/admin/stats/weekly") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, () => getAdminStatsOverview({ days: 7 }));
  }

  // Admin-Stats: KI-Kosten (default 30 Tage, ?days=N überschreibbar, max 90)
  if (url.pathname === "/api/admin/stats/costs") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 30) || 30));
    return handleAsync(response, () => getAdminStatsCosts({ days }));
  }

  // Admin-Stats: Crawl-Statistik (default 30 Tage, ?days=N überschreibbar, max 90)
  if (url.pathname === "/api/admin/stats/crawl") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 30) || 30));
    return handleAsync(response, () => getAdminStatsCrawl({ days }));
  }

  // Admin-Stats: Detaillierter Bericht für den letzten Crawl-Lauf.
  if (url.pathname === "/api/admin/stats/crawl-report") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, () => getAdminStatsCrawlReport());
  }

  // Admin-Datenstatus (NUR intern, Betreiber): Gesundheit des Datenmotors heute
  // (global) + Wert/Datenversorgung pro Account. Nutzt vorhandene Crawl-Runs,
  // Stats, LLM-Usage und die V3-Read-Funktionen — keine neue Analytics-Architektur.
  if (url.pathname === "/api/admin/data-status") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, () => buildAdminDataStatus());
  }

  // Tenant-JWT-Modus-Diagnose (NUR Admin, read-only). Zeigt ausschliesslich die
  // PRAESENZ der Konfiguration (Boolean), NIE die Werte selbst -> sichere Vor- und
  // Nach-Pruefung fuer die JWT-Aktivierung (docs/rls-activation-rollout.md Schritt 5).
  // effectiveTransport verraet, ob die App gerade service_role (RLS-Bypass) oder den
  // per-Mandant-authenticated-JWT-Pfad (RLS aktiv) nutzt.
  if (url.pathname === "/api/admin/tenant-mode") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, async () => {
      const jwtEnabled = tenantJwtModeEnabled();
      const isFlag = (v) => ["1", "true", "on", "yes"].includes(String(v || "").trim().toLowerCase());
      // Profil-DB-Modus-Diagnose: zeigt EINZELN, welche Bedingung fuer
      // profileDbModeEnabled() = isFlagOn(HELMUT_PROFILE_DB_MODE) && v3StoreReady()
      // erfuellt ist. Nur Booleans, KEINE Werte/Secrets. So ist auf einen Blick
      // sichtbar, ob der Flag in der Laufzeit ankommt und ob der DB-Profilpfad greift.
      const profileDbEnabled = profileDbModeEnabled();
      // Live-Selbsttest des echten JWT-Profil-Lesepfads: versucht den DB-Read
      // fuer die VORHANDENEN Mandate aus dem Store (mandantenneutral, keine
      // hartkodierte ID). Erfolg bei mindestens einem => App->PostgREST-JWT wird
      // akzeptiert (SUPABASE_JWT_SECRET korrekt). Kein Erfolg bei aktivem Flag
      // => JWT wird abgewiesen (401 PGRST301, Secret-Mismatch) ODER Zeilen fehlen.
      // Nur ausgefuehrt, wenn der DB-Modus aktiv ist; sonst nicht aussagekraeftig.
      let tenantJwtReadWorks = null;
      let tenantReadProbe = "nicht ausgeführt (DB-Modus aus)";
      if (profileDbEnabled) {
        try {
          const knownProfiles = await listProfiles().catch(() => []);
          const probeIds = knownProfiles.map((p) => p.id).filter(Boolean).sort();
          if (!probeIds.length) {
            tenantReadProbe = "nicht ausführbar (keine gespeicherten Mandate)";
          } else {
            let readId = null;
            for (const probeId of probeIds) {
              const probe = await getProfileFromDb(probeId);
              if (probe && probe.id) { readId = probe.id; break; }
            }
            tenantJwtReadWorks = Boolean(readId);
            tenantReadProbe = tenantJwtReadWorks
              ? "OK: Mandatsprofil aus mandate_profiles gelesen (JWT akzeptiert)"
              : "FEHLGESCHLAGEN: kein Profil lesbar (JWT abgewiesen/401 oder Zeilen fehlen) -> Fallback Blob";
          }
        } catch (_) {
          tenantJwtReadWorks = false;
          tenantReadProbe = "FEHLGESCHLAGEN (Ausnahme) -> Fallback Blob";
        }
      }
      // PGRST301-Ursachendiagnose (nur Booleans/Algorithmus, NIE Secret-Werte):
      // secretMatchesLegacy=true => SUPABASE_JWT_SECRET IST das aktive Legacy
      // JWT Secret (HS256 korrekt, Ursache liegt woanders); =false => Secret-WERT
      // ist die Ursache des 401; =null => nicht bestimmbar (Secret/anon-Key fehlt).
      const jwtDiag = diagnoseTenantJwt();
      return {
        flagSet: /^(1|true|on)$/i.test(String(process.env.HELMUT_TENANT_JWT_MODE || "").trim()),
        jwtSecretPresent: Boolean(process.env.SUPABASE_JWT_SECRET),
        anonKeyPresent: Boolean(process.env.SUPABASE_ANON_KEY),
        serviceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        tenantJwtModeEnabled: jwtEnabled,
        effectiveTransport: jwtEnabled ? "authenticated (per-Mandant-JWT, RLS aktiv)" : "service_role (RLS-Bypass)",
        // --- Profil-DB-Modus (Phase 15) ---
        profileDbModeFlagSet: isFlag(process.env.HELMUT_PROFILE_DB_MODE),
        v3StoreFlagSet: isFlag(process.env.HELMUT_V3_STORE),
        v3StoreReady: v3StoreReady(),
        profileDbModeEnabled: profileDbEnabled,
        // --- Profil-Exklusivmodus (Stufe E): kein globaler helmut_store-Blob-Write mehr ---
        // flagSet zeigt den ROHEN Flag-Wert; enabled erfordert zusaetzlich den DB-Modus.
        profileDbExclusiveFlagSet: isFlag(process.env.HELMUT_PROFILE_DB_EXCLUSIVE),
        profileDbExclusiveEnabled: profileDbExclusiveEnabled(),
        profileWriteTarget: profileDbExclusiveEnabled()
          ? "mandate_profiles (relational-only, kein Blob-Write)"
          : (profileDbEnabled ? "mandate_profiles + helmut_store (Dual Write)" : "helmut_store (Blob-only)"),
        // Divergenz-Signal: wie oft fiel ein SQL-Miss im Dual-Write-Modus auf den
        // Blob zurueck? Dauerhaft >0 => Backfill unvollstaendig (Cutover E noch nicht reif).
        profileBlobReadFallbacks: (getProfileTelemetry() || {}).blobReadFallbacks || 0,
        // Live-Selbsttest: liest der DB-Profilpfad wirklich (JWT akzeptiert)?
        tenantJwtReadWorks,
        tenantReadProbe,
        profileSource: (profileDbEnabled && tenantJwtReadWorks) ? "mandate_profiles (DB)" : "helmut_store (Blob-Fallback)",
        // --- PGRST301-Ursachendiagnose (keine Secret-Werte) ---
        secretMatchesLegacy: jwtDiag.secretMatchesLegacy,
        jwtAlgorithm: jwtDiag.jwtAlgorithm,
        checkedAt: new Date().toISOString()
      };
    });
  }

  // KO-Anreicherung-Backfill (P1-1, NUR Admin). Dry-Run per Default; erst ?execute=1
  // schreibt + ruft KI. Harter 5-EUR-Deckel (nie hoeher, egal was uebergeben wird),
  // fail-closed Budget-Gate, Evidence-Guard gegen erfundene Themen, nur tags/policy_field.
  // Rollback: docs/ko-anreicherung-analyse.md (tags/policy_field wieder leeren).
  if (url.pathname === "/api/admin/ko-enrichment-backfill") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    // Audit-Fix (Folgebranch): Dieser Endpunkt ist ZUSTANDSÄNDERND (KI-Ausgaben
    // bis 5 €/Aufruf, KO-Writes) und lief früher über GET — damit griff der
    // globale CSRF-Guard nicht und ein präparierter Link konnte im Admin-Browser
    // fremdausgelöste Kosten erzeugen. Lesen (Dry-Run-Vorschau) bleibt per GET
    // erlaubt; JEDE Ausführung (execute/bypassBudget) verlangt POST (=CSRF-Guard).
    const wantsExecution = url.searchParams.get("execute") === "1" || url.searchParams.get("bypassBudget") === "1";
    if (wantsExecution && request.method !== "POST") {
      response.writeHead(405, jsonHeaders());
      response.end(JSON.stringify({ error: "Ausführung nur per POST (CSRF-geschützt). GET liefert ausschließlich die Dry-Run-Vorschau." }, null, 2));
      return undefined;
    }
    return handleAsync(response, async () => {
      const execute = request.method === "POST" && url.searchParams.get("execute") === "1";
      const bypassBudget = request.method === "POST" && url.searchParams.get("bypassBudget") === "1";
      const wanted = Number(url.searchParams.get("maxCents"));
      const maxEurCents = Math.min(500, Number.isFinite(wanted) && wanted > 0 ? wanted : 500); // HART <= 5 EUR
      const result = await runKoEnrichmentBackfill({ execute, bypassBudget, maxEurCents }, {
        listKnowledgeObjects: (o) => listKnowledgeObjects(o),
        canSpend: () => canSpendLlm(null),
        // budgetExempt NUR bei explizitem bypassBudget (POST + CSRF + Admin-Rolle
        // + harter 5-EUR-Deckel): seit der atomaren Reservierung am Choke-Point
        // wuerde bypassBudget sonst nur das Pre-Gate umgehen und trotzdem an der
        // Reservierung scheitern — der Parameter waere funktionslos und die
        // Antwort (budgetBypassed:true) eine Luege. Exempt-Calls stehen weiterhin
        // vollstaendig im Kostenlog.
        extractTags: (ko) => extractKnowledgeObjectTags(ko, { politicianId: null, budgetExempt: bypassBudget }),
        derivePolicyFields,
        saveEnrichment: (id, patch) => saveKnowledgeObjectEnrichment(id, patch),
        log: (m) => console.log("[ko-backfill]", m)
      });
      // aiProvider (nur Name, kein Secret) macht sichtbar, ob Azure genutzt wird.
      return { aiProvider: require("./lib/helmut/ai").aiProviderName(), budgetBypassed: bypassBudget && execute, ...result };
    });
  }

  // Interner Pipeline-Recovery (NUR Admin, ueber die bestehende Admin-SESSION — KEIN
  // Debug-Secret). POST-Aktionen sind zusaetzlich CSRF-geschuetzt (globaler Guard).
  // READ ist reine Anzeige (kein KI-Call). Nichts laeuft automatisch — nur je Aufruf.
  if (url.pathname === "/api/admin/recovery-status") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, () => buildPipelineRecoveryStatus());
  }
  // AKTION 1: haengenden/abgelaufenen Understanding-Lock loesen.
  if (url.pathname === "/api/admin/recovery/release-lock" && request.method === "POST") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleJson(request, response, async () => {
      const readLock = async () => readAuthStore().then((s) => (s.pipelineLocks || {})["global-understanding"] || null).catch(() => null);
      const before = await readLock();
      await releasePipelineLock("global-understanding").catch(() => {});
      const after = await readLock();
      return { ok: true, lockVorher: Boolean(before), lockNachher: Boolean(after), geloest: Boolean(before) && !after };
    });
  }
  // AKTION 2: failed -> pending zuruecksetzen. NUR mit ausdruecklicher Bestaetigung
  // (confirm:true). Setzt ausschliesslich understanding_status um — KEINE Rohdokumente
  // werden geloescht, keine anderen Felder angefasst.
  if (url.pathname === "/api/admin/recovery/reset-failed" && request.method === "POST") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleJson(request, response, async (body) => {
      const all = await listKnowledgeObjects({ limit: 1000 }).catch(() => []);
      const failedBetroffen = (all || []).filter((k) => k && k.understanding_status === "failed").length;
      if (!body || body.confirm !== true) {
        return { ok: false, bestaetigungErforderlich: true, failedBetroffen, zurueckgesetzt: 0 };
      }
      const reset = await bulkResetUnderstandingFailed().catch((e) => ({ skipped: true, reason: e && e.message }));
      return { ok: true, failedBetroffen, zurueckgesetzt: failedBetroffen, reset };
    });
  }
  // AKTION 3: vorhandenen Understanding-Lauf starten (runPendingUnderstandingShadow) —
  // KEINE neue Pipeline, zeitbudgetiert wie der Cron. Antwort ist eine skalare
  // Zusammenfassung (keine Secrets, keine rohen Detailfelder).
  if (url.pathname === "/api/admin/recovery/run-understanding" && request.method === "POST") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleJson(request, response, async () => {
      // Request-Start: Marke, um NUR den in DIESEM Lauf gesetzten Lock am Ende zu loesen
      // (ein Lock mit lockedAt >= startTs stammt aus diesem Lauf; aeltere bleiben unberuehrt).
      const startTs = Date.now();
      // KO-Zaehlung vorher/nachher fuer sichtbaren Fortschritt (pending/complete).
      const koCounts = async () => {
        const all = await listKnowledgeObjects({ limit: 1000 }).catch(() => []);
        let pending = 0, complete = 0;
        for (const k of (all || [])) {
          const s = String((k && k.understanding_status) || "");
          if (s === "pending") pending += 1; else if (s === "complete") complete += 1;
        }
        return { pending, complete };
      };
      // LOCK-VORRANG: denselben Lock lesen, den der Status anzeigt (nicht den flag-
      // abhaengigen NO-OP-Lock von runPendingUnderstandingShadow). Existiert ein
      // Eintrag, NICHT starten (kein KI-Call, keine Pipeline) und ehrlich melden:
      // aktiv -> 'understanding-locked', abgelaufen/haengend -> 'understanding-lock-stale'.
      // KEIN Auto-Loesen: der Admin muss bewusst 'Lock loesen' klicken.
      const lockEntry = await readAuthStore()
        .then((s) => (s.pipelineLocks || {})["global-understanding"] || null)
        .catch(() => null);
      if (lockEntry) {
        const abgelaufen = typeof lockEntry.expiresAt === "number" && lockEntry.expiresAt <= Date.now();
        const c = await koCounts();
        return {
          ok: true,
          ergebnis: "uebersprungen",
          grund: abgelaufen ? "understanding-lock-stale" : "understanding-locked",
          lockAktiv: !abgelaufen,
          lockVerdaechtig: abgelaufen,
          verarbeitet: 0,
          zurueckgestellt: 0,
          rohdokumenteGeladen: 0,
          pendingVorher: c.pending, pendingNachher: c.pending,
          completeVorher: c.complete, completeNachher: c.complete,
          zusammenfassung: {}
        };
      }
      const vorher = await koCounts();
      // Laufversuch SOFORT persistieren (bevor der Lauf haengen/gekillt werden kann), damit
      // das Ergebnis einen Reload/Function-Kill uebersteht. Metadaten im bestehenden Auth-Store.
      const startedAtIso = new Date(startTs).toISOString();
      await saveAdminRecoveryLastRun({ startedAt: startedAtIso, finishedAt: null, status: "running", grund: null, pendingVorher: vorher.pending, completeVorher: vorher.complete }).catch(() => {});
      // WEITES Fenster (wie /api/debug/reset-failed-kos): erhoeht die Chance, die
      // Quell-Dokumente der pending-Vorgaenge zu finden. Ein zu enges Fenster fuehrt
      // sonst zu 'skipped-no-cluster' -> 0 verarbeitet trotz vorhandener pending-KOs.
      const rawDocs = await listRecentRawDocuments(2000, 90).catch(() => []);
      // Budget knapp unter dem Client-Timeout (250s), damit der Lauf antwortet, bevor
      // der Browser abbricht; Rest bleibt pending und wird beim naechsten Klick geholt.
      const budgetMs = Math.min(Number(process.env.HELMUT_UNDERSTAND_BUDGET_MS || 180000), 180000);
      const result = await runPendingUnderstandingShadow(rawDocs, { budgetMs })
        .catch((e) => ({ skipped: true, reason: e && e.message }));
      // EIGENEN Lock zuverlaessig loesen: Wir sind nur hier, weil VOR dem Lauf KEIN Lock
      // existierte (sonst kehrt der Guard oben frueh zurueck). runPendingUnderstandingShadow
      // loest seinen Lock zwar im finally, aber unter Serverless ist das bei Timeout/Kill
      // NICHT garantiert -> ein danach noch vorhandener Lock mit lockedAt >= startTs stammt
      // aus DIESEM Lauf und darf gefahrlos geloest werden (egal ob erfolgreich / nichts-
      // verarbeitet / Fehler). Ein fremder/vorbestehender Lock (lockedAt < startTs) wird NIE
      // angefasst; releasePipelineLock ist idempotent.
      try {
        const lockNach = await readAuthStore()
          .then((s) => (s.pipelineLocks || {})["global-understanding"] || null)
          .catch(() => null);
        if (lockNach && typeof lockNach.lockedAt === "number" && lockNach.lockedAt >= startTs) {
          await releasePipelineLock("global-understanding").catch(() => {});
        }
      } catch (_) { /* fail-safe: Lock-Aufraeumen darf die Antwort nie verhindern */ }
      const nachher = await koCounts();
      const counts = (result && result.counts) || {};
      const verarbeitet = dsNum(counts.saved);
      // Klassifikation fuer die UI (keine Secrets): uebersprungen (gar nicht gelaufen)
      // / erfolgreich (>=1 verarbeitet) / nichts-verarbeitet (lief, aber 0 -> Grund).
      let ergebnis, grund = null;
      let diagnoseFelder = null;
      if (result && result.skipped) { ergebnis = "uebersprungen"; grund = result.reason || "skipped"; }
      else if (verarbeitet > 0) { ergebnis = "erfolgreich"; }
      else {
        ergebnis = "nichts-verarbeitet";
        // EHRLICHER GRUND: nicht pauschal 'Zeitfenster'. Die bestehende Read-only-Diagnose
        // nutzen (KEIN KI-Call, KEINE Writes), um verarbeitbar / außerhalb / verwaist zu
        // trennen — der Lauf allein sieht nur das Fenster (skipped-no-cluster deckt beides).
        try {
          const pend = await listPendingKnowledgeObjects({ limit: 1000 }).catch(() => []);
          const widerDocs = await listRecentRawDocuments(6000, 3650).catch(() => []);
          const dg = diagnosePendingUnderstanding(pend, rawDocs, widerDocs, { now: Date.now(), windowDays: 90 });
          // Versucht-aber-nicht-gespeichert = in-window Cluster mit KI-Fehler/ungültig/Budget/Store.
          const versuchtKeys = ["skipped-error", "cluster-error", "skipped-invalid", "skipped-budget", "skipped-store"];
          const versucht = versuchtKeys.reduce((a, k) => a + (Number(counts[k]) || 0), 0);
          const versuchtGrundKey = versuchtKeys.filter((k) => counts[k]).sort((a, b) => counts[b] - counts[a])[0] || null;
          diagnoseFelder = {
            imFensterVerarbeitbar: dsNum(dg.imFenster),
            ausserhalbFenster: dsNum(dg.ausserhalb),
            ohneRohdokumente: dsNum(dg.keine),
            versuchtNichtGespeichert: versucht,
            versuchtGrundKey
          };
          grund = dg.ursache; // teils-verarbeitbar-verwaist / verwaist / ausserhalb-fenster / mapping-fehlt / gemischt
        } catch (_) {
          grund = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "keine-verarbeitung";
        }
      }
      // Endergebnis persistieren (ueberlebt Reload) — Status/Zahlen/kurzer Grund, keine Secrets.
      await saveAdminRecoveryLastRun({
        startedAt: startedAtIso,
        finishedAt: new Date().toISOString(),
        status: ergebnis, // erfolgreich | nichts-verarbeitet | uebersprungen
        grund,
        verarbeitet,
        versucht: diagnoseFelder ? diagnoseFelder.versuchtNichtGespeichert : null,
        imFenster: diagnoseFelder ? diagnoseFelder.imFensterVerarbeitbar : null,
        ausserhalb: diagnoseFelder ? diagnoseFelder.ausserhalbFenster : null,
        ohneRohdokumente: diagnoseFelder ? diagnoseFelder.ohneRohdokumente : null,
        pendingVorher: vorher.pending, pendingNachher: nachher.pending,
        completeVorher: vorher.complete, completeNachher: nachher.complete
      }).catch(() => {});
      return {
        ok: true,
        ergebnis,
        grund,
        ...(diagnoseFelder || {}),
        verarbeitet,
        zurueckgestellt: dsNum(result && result.deferred),
        rohdokumenteGeladen: (rawDocs || []).length,
        pendingVorher: vorher.pending, pendingNachher: nachher.pending,
        completeVorher: vorher.complete, completeNachher: nachher.complete,
        zusammenfassung: counts
      };
    });
  }

  // AKTION 4 (NUR LESEN): Pending-Diagnose. Erklaert, WARUM pending-Vorgaenge keine
  // Quell-Dokumente finden. KEIN KI-Call, KEINE Pipeline, KEINE Writes, KEIN externer
  // Netzaufruf — nur Store-Reads + deterministisches Clustering (wie der Lauf). Liest
  // das Fenster (2000, 90 — identisch zum Lauf) UND einen bounded weiteren Read, um
  // 'ausserhalb Fenster' von 'verwaist' zu unterscheiden. Antwort ohne Rohtext/Secrets.
  if (url.pathname === "/api/admin/recovery/pending-diagnose" && request.method === "POST") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleJson(request, response, async () => {
      if (!v3StoreReady()) return { verfuegbar: false, grund: "v3-store-disabled" };
      // Bounded Reads (read-only). Fenster identisch zum Recovery-Lauf; weiter = mehr
      // Tage/Zeilen, um aeltere Quell-Dokumente ueberhaupt sichtbar zu machen.
      const DIAG_RAW_LIMIT = 6000;
      const DIAG_RAW_DAYS = 3650;
      const pending = await listPendingKnowledgeObjects({ limit: 1000 }).catch(() => []);
      const windowDocs = await listRecentRawDocuments(2000, 90).catch(() => []);
      const widerDocs = await listRecentRawDocuments(DIAG_RAW_LIMIT, DIAG_RAW_DAYS).catch(() => []);
      const d = diagnosePendingUnderstanding(pending, windowDocs, widerDocs, { now: Date.now(), windowDays: 90 });
      // Letzter manueller Lauf (read-only, aus Auth-Store-Metadaten) — Kontext fuer die
      // Kandidaten-Anzeige ("warum nicht gespeichert"). KEIN KI-Call, KEIN Write.
      const rl = await getAdminRecoveryLastRun().catch(() => null);
      const letzterLauf = rl && rl.startedAt
        ? { status: rl.status || null, finishedAt: rl.finishedAt || null, verarbeitet: dsNumOrNull(rl.verarbeitet), versucht: dsNumOrNull(rl.versucht), grund: rl.grund || null }
        : null;
      return {
        verfuegbar: true,
        ...d,
        letzterLauf,
        rohdokumenteFenster: (windowDocs || []).length,
        rohdokumenteWeit: (widerDocs || []).length,
        // Ehrlich: der weite Read ist gedeckelt; 'keine' heisst 'nicht in bis zu N gelesenen Dok.'
        weitGedeckelt: (widerDocs || []).length >= DIAG_RAW_LIMIT
      };
    });
  }

  // Admin: Feedback als erledigt/offen markieren.
  if (url.pathname.startsWith("/api/admin/feedback/") && (request.method === "PATCH" || request.method === "POST")) {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const feedbackId = decodeURIComponent(url.pathname.replace("/api/admin/feedback/", ""));
    return handleJson(request, response, async (body) => {
      const entry = await setFeedbackDone(feedbackId, body.done !== false);
      if (!entry) throw accounts.httpError(404, "Feedback nicht gefunden.");
      await accounts.recordAudit({ action: "admin.feedback.update", userId: authUser.id, actorEmail: authUser.email, detail: feedbackId });
      return { ok: true, feedback: entry };
    });
  }

  // --- Admin-Leserouten (Admin-Neuaufbau 2026-07) ----------------------------
  // Alle: requireRoleOr403 "admin", read-only, minimale Datenmenge, keine Secrets,
  // keine Token-Hashes. Fehler laufen ueber handleAsync -> respondError.

  // Tagesbudget im EXAKTEN Fenster des Budget-Gates (UTC-Kalendertag; NICHT das
  // rollierende Fenster von /stats/costs) + Monat-bis-heute aus getLlmCostSince.
  if (url.pathname === "/api/admin/stats/budget-today" && request.method === "GET") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, async () => {
      const heute = await getLlmUsageBreakdownToday();
      const monthStart = `${String(heute.day || "").slice(0, 7)}-01`;
      const monat = /^\d{4}-\d{2}-01$/.test(monthStart)
        ? await getLlmCostSince(null, monthStart).catch(() => null)
        : null;
      return {
        ...heute,
        monat: monat ? { seit: monthStart, calls: monat.calls, estimatedCostUsd: monat.estimatedCostUsd } : null
      };
    });
  }

  // Kosten JE LAUF (Punkt 17). Verbindet processRuns mit dem Kostenlog; weist je
  // Lauf aus, ob die Zuordnung gemessen (Laufkennung) oder rekonstruiert
  // (Zeitfenster) ist. Rein lesend.
  if (url.pathname === "/api/admin/stats/run-costs" && request.method === "GET") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const runLimit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 12));
    return handleAsync(response, () => getRunCostReport({ limit: runLimit }));
  }

  // Kosten pro Mandant (rollierendes Fenster) + Pro-Mandant-Budgetstatus.
  if (url.pathname === "/api/admin/stats/costs-per-user" && request.method === "GET") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const cpuDays = Math.max(1, Math.min(90, Number(url.searchParams.get("days")) || 30));
    return handleAsync(response, () => buildAdminCostsPerUser(cpuDays));
  }

  // Laufzeiten der inneren Prozesse (understanding/briefing/lage) — nur technische
  // Skalare (sanitizeProcessRun), keine Inhalte. Plus Cron-Zeitplan aus vercel.json.
  if (url.pathname === "/api/admin/stats/process-runs" && request.method === "GET") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const prLimit = Math.max(1, Math.min(300, Number(url.searchParams.get("limit")) || 60));
    const prProcess = String(url.searchParams.get("process") || "").trim() || null;
    return handleAsync(response, async () => {
      const runs = await listProcessRuns({ process: prProcess, limit: prLimit });
      const latestByProcess = {};
      for (const run of Array.isArray(runs) ? runs : []) {
        const key = run && run.process ? String(run.process) : "unknown";
        if (!latestByProcess[key]) latestByProcess[key] = run;
      }
      return { generatedAt: new Date().toISOString(), processRuns: runs, latestByProcess, zeitplan: readVercelCronSchedule() };
    });
  }

  // Audit-Log als eigene Route (bisher nur als Teil von /api/admin/overview).
  if (url.pathname === "/api/admin/audit" && request.method === "GET") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const auditLimit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 50));
    return handleAsync(response, async () => ({
      generatedAt: new Date().toISOString(),
      auditEvents: await accounts.listAuditEvents(auditLimit)
    }));
  }

  // Feedback-Liste als eigene GET-Route (bisher nur als Teil von /api/admin/overview).
  // Exakter Pfad — kollidiert nicht mit dem startsWith("/api/admin/feedback/")-Matcher.
  if (url.pathname === "/api/admin/feedback" && request.method === "GET") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const fbLimit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 100));
    return handleAsync(response, async () => {
      const feedback = await listFeedback(fbLimit);
      return {
        generatedAt: new Date().toISOString(),
        offen: feedback.filter((item) => !item.done).length,
        feedback
      };
    });
  }

  // Kunden & Abrechnung: serverseitiges Aggregat aus accounts.listUsers()
  // (sanitizeUser — nie Hashes) + aktive Sessions als reine Anzahl.
  if (url.pathname === "/api/admin/customers" && request.method === "GET") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, () => buildAdminCustomers());
  }

  // Quellen & Watchdog: Statuszaehler und problematische Abrufwege aus den
  // relationalen Quellen-Tabellen + Google-News-Anteil aus crawlRuns.
  if (url.pathname === "/api/admin/sources-status" && request.method === "GET") {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    return handleAsync(response, () => buildAdminSourcesStatus());
  }

  // SICHERHEIT: dieser Fallback bediente frueher JEDEN auf dem Server liegenden Pfad
  // (server.js, lib/helmut/*.js, supabase/schema.sql, docs/*, .env.example, sogar .git/*)
  // an JEDEN Aufrufer ohne Session — im Account-Modus faellt ein nicht eingeloggter
  // Request fuer alles ausser /api/* genau hier durch (Zeile ~214 blockt nur /api/*).
  // Nur die tatsaechlich oeffentliche SPA-Shell + ihre statischen Assets duerfen raus;
  // path.normalize/startsWith(root) schuetzt nur vor Verzeichnis-Traversal, nicht davor,
  // dass JEDE existierende Datei im Projekt grundsaetzlich erreichbar waere.
  if (!isAppEntryPath(url.pathname) && !isPublicAssetPath(url.pathname)) {
    return sendNotFound(response);
  }

  const requestedPath = isAppEntryPath(url.pathname) ? "index.html" : url.pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(root, requestedPath));
  if (!filePath.startsWith(root)) {
    response.writeHead(403, securityHeaders());
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (requestedPath === "index.html") {
        response.writeHead(200, htmlHeaders());
        response.end(indexHtml());
        return;
      }
      response.writeHead(404, securityHeaders());
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    const headers = securityHeaders({ "Content-Type": contentTypes[extension] || "application/octet-stream" });
    if ([".html", ".js", ".css", ".webmanifest"].includes(extension)) {
      headers["Cache-Control"] = "no-store";
    }
    response.writeHead(200, headers);
    response.end(content);
  });
}

function shouldRedirectToCanonicalHost(request, url) {
  const host = String(request.headers.host || "").toLowerCase();
  if (!canonicalHost || host === canonicalHost) return false;
  return host.includes("onrender.com");
}

function isAppEntryPath(pathname) {
  return pathname === "/" || pathname === "/api/index" || pathname === "/api/index.js";
}

function hasPilotAccess(request, url) {
  if (!isPilotAccessConfigured()) {
    // Kein PILOT_SECRET gesetzt: lokal/dev bewusst offen (Entwicklerkomfort, kein
    // Redeploy noetig, um die App ohne jede Env-Variable zu starten). SICHERHEIT: auf
    // einem echten Deployment (Vercel) waere ein vergessenes PILOT_SECRET sonst ein
    // Fehlkonfigurations-GAU — die komplette App inkl. aller politischen Daten laege
    // fuer jeden im Internet offen. Dort daher fail-closed statt fail-open, analog zum
    // bestehenden CRON_SECRET-Fail-closed-Fix.
    return !isProductionLikeDeployment();
  }
  if (request.method === "OPTIONS") return true;
  if (isPublicAssetPath(url.pathname)) return true;
  if (url.pathname.startsWith("/api/cron/")) return true;
  if (hasAdminBypass(request, url)) return true;

  const pilotSecret = process.env.PILOT_SECRET;
  if (allowQuerySecrets() && timingSafeEqual(url.searchParams.get("pilot"), pilotSecret)) return true;

  const auth = parseAuthorization(request.headers.authorization || "");
  if (auth.bearer && timingSafeEqual(auth.bearer, pilotSecret)) return true;
  if (auth.basic && timingSafeEqual(auth.basic.password, pilotSecret)) return true;

  return timingSafeEqual(readCookie(request, "helmut_pilot"), pilotSecret);
}

function isPreviewMode(url) {
  const value = String(url.searchParams.get("preview") || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function withPreviewMode(payload, previewMode) {
  if (!previewMode || !payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    previewMode: true,
    status: payload.status === "Demo" ? "Demo" : "Vorschau",
    previewNote: "Vorschau: Dieser Aufruf verändert keine Gesehen-, Update- oder Lernzustände."
  };
}

function isCompactResponse(url) {
  const value = String(url.searchParams.get("compact") || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function prepareBriefingResponse(briefing, { previewMode = false, compact = false } = {}) {
  const decorated = decorateBriefingFreshness(briefing);
  const payload = compact ? compactBriefingPayload(decorated) : decorated;
  return withPreviewMode(payload, previewMode);
}

// V3-Read-Path: das Briefing (Home/Briefing/Helmut) entsteht ausschließlich aus
// V3-Daten (verstandene knowledge_objects -> deterministische decisions ->
// Contract-Adapter). KEIN V2-Blob, KEIN Regel-Scoring, KEIN V2-Fallback. Fehlen
// V3-Daten, liefert der Adapter einen EXPLIZITEN Leerzustand (available:false).
async function latestBriefingPayload({ politicianId, profile, url, previewMode = false, compact = false }) {
  // Optionaler Slot-Override (?slot=morning|midday|evening|daily) fuer Tests/Admin/
  // spaetere Cron-Nutzung. Ohne Parameter leitet buildV3Briefing den Slot aus der
  // Serverzeit (Europe/Berlin) ab. Ungueltige Werte -> 'daily' (kein Crash).
  const slot = url && url.searchParams ? url.searchParams.get("slot") : null;
  // Read-only Auswahl-Diagnose NUR bei ?debugPrimary=1 (technische Felder, keine Secrets/
  // Texte/Kosten/PII). Ohne den Parameter bleibt die Antwort unveraendert.
  const debug = Boolean(url && url.searchParams && url.searchParams.get("debugPrimary") === "1");
  // Read-only Radar-Relations-Diagnose NUR bei ?debugRadarRelations=1 (nur Titel/Quelle/
  // Kategorie + technische Partei-Belege; keine Secrets/Kosten/Admin/Rohtexte). Ohne den
  // Parameter bleibt die Antwort unveraendert (kein Debug-Objekt).
  const debugRadar = Boolean(url && url.searchParams && url.searchParams.get("debugRadarRelations") === "1");
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ? String(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 12) : null;
  const debugMeta = debug ? {
    commit: commitSha,
    version: commitSha,
    apiOrigin: (url && (url.origin || (url.protocol && url.host ? `${url.protocol}//${url.host}` : null))) || null
  } : null;
  const briefing = await buildV3Briefing(profile, politicianId, { slot, debug, debugMeta, debugRadar, commit: commitSha });
  return prepareBriefingResponse(briefing, { previewMode, compact });
}

// opts.slot (optional): expliziter Slot-Override (Tests/Admin/spaetere Cron-Nutzung).
// Fehlt er -> Slot wird aus der Serverzeit in Europe/Berlin abgeleitet. Ungueltig ->
// 'daily' (normalizeBriefingType). REIN Label/Sprache im Read-Pfad: KEINE neuen Daten,
// KEIN KI-Call, KEINE Persistenz, KEINE Frische-Aussage (lastUpdated bleibt die Wahrheit).
// Erwaehnungs-Quellen gezielt nachladen (deterministisch, 0 KI, hart gedeckelt,
// rein additiv in das uebergebene sourcesByVorgang-Objekt). Gemeinsamer Helfer
// fuer den Hauptpfad UND die keine-treffer-Leerpfade von buildV3Briefing
// (Review-Fix: die Leerpfade uebergaben hart {} — belegte Eigenerwaehnungen ohne
// best_source_url verschwanden dort weiterhin still). Fail-safe: Fehler loggen,
// nie werfen.
async function loadMentionSourcesInto(profile, understood, sourcesByVorgang) {
  try {
    const radarStateMod = require("./lib/helmut/radarState");
    const terms = radarStateMod.profileTerms(profile);
    if (!terms || !terms.fullName) return;
    // Deckel = MENTION_CAP aus radarState (einzige Quelle der Erwaehnungs-Obergrenze,
    // dort exportiert): ein eigener, niedrigerer Wert (frueher 25 < MENTION_CAP 30)
    // liess ab dem 26. Erwaehnungs-KO ohne geladene Quelle den Fix wieder ins Leere
    // laufen. Bleibt zugleich der harte O(n)-Schutz gegen unbegrenzte DB-Reads.
    const MENTION_SOURCE_LOAD_CAP = radarStateMod.MENTION_CAP;
    const mentionNeedsSources = [];
    for (const ko of understood) {
      if (!ko || !ko.vorgang_id) continue;
      if (sourcesByVorgang[ko.vorgang_id]) continue; // schon geladen
      if (!radarStateMod.detectPersonMention(ko, terms)) continue;
      mentionNeedsSources.push(ko);
      if (mentionNeedsSources.length >= MENTION_SOURCE_LOAD_CAP) break;
    }
    if (mentionNeedsSources.length) {
      const extra = await loadSourcesByVorgang(mentionNeedsSources);
      for (const [vid, docs] of Object.entries(extra)) {
        if (!sourcesByVorgang[vid]) sourcesByVorgang[vid] = docs;
      }
    }
  } catch (error) {
    console.error("[v3-briefing] Mention-Quellen-Nachladen fehlgeschlagen (nicht kritisch):", error && error.message);
  }
}

async function buildV3Briefing(profile, politicianId, opts = {}) {
  const briefingContract = require("./lib/helmut/briefingContract");
  const decisionsEngine = require("./lib/helmut/decisions");
  const briefingLanguage = require("./lib/helmut/briefingLanguage");
  const userId = (profile && profile.id) || politicianId;
  // Slot bestimmen: expliziter Override hat Vorrang, sonst Zeit-Ableitung (Europe/Berlin).
  // normalizeBriefingType kappt ungueltige Overrides sicher auf 'daily' (nie Crash).
  const briefingType = (opts && opts.slot != null && String(opts.slot).trim() !== "")
    ? briefingLanguage.normalizeBriefingType(opts.slot)
    : briefingLanguage.deriveBriefingTypeFromDate(new Date(), "Europe/Berlin");
  const empty = (reason) => briefingContract.toBriefingContractV3({ profile, decisions: [], kosById: {}, sourcesByVorgang: {}, reason, briefingType });

  // REVIEW-FIXTURE (nur PR-/Preview-/Lokal-Abnahme): streng hinter HELMUT_REVIEW_FIXTURE
  // (Default AUS). In main/Produktion nicht gesetzt -> dieser Zweig ist inert und der
  // echte V3-Read-Pfad unten läuft unverändert. Nutzt den ECHTEN Adapter mit fiktiven
  // Daten (keine Kostenwerte, keine reale Partei/Person). KEIN Produktions-Demo.
  const reviewFixture = require("./lib/helmut/reviewFixture");
  if (reviewFixture.reviewFixtureEnabled()) {
    console.warn("[helmut] REVIEW-FIXTURE aktiv (HELMUT_REVIEW_FIXTURE=1) — nur fuer Abnahme, NICHT fuer Produktion.");
    const fx = reviewFixture.buildReviewFixture(new Date());
    return briefingContract.toBriefingContractV3({ profile: fx.profile, decisions: fx.decisions, kosById: fx.kosById, sourcesByVorgang: fx.sourcesByVorgang, now: new Date(), reason: "review-fixture", briefingType });
  }

  // Fail-safe, KEIN V2-Fallback: kein Store -> expliziter Leerzustand.
  if (!v3StoreReady()) return empty("v3-store-disabled");

  // EHRLICHKEIT DES SPEICHERWEGS: Ein Supabase-Ausfall/Timeout darf NICHT wie
  // "es gibt keine Vorgaenge" aussehen. listKnowledgeObjects faengt intern und
  // liefert [] — deshalb hier zusaetzlich ueber ein Sentinel-Objekt unterscheiden,
  // ob der Read wirklich lief (auch 0 Treffer moeglich) oder scharf fehlschlug.
  let kos = [];
  let storeFailed = false;
  try {
    const res = await listKnowledgeObjects({ limit: koScanLimit, _signalError: true });
    if (res && res.__storeError) storeFailed = true; else kos = res || [];
  } catch (error) {
    console.error("[v3-briefing] listKnowledgeObjects fehlgeschlagen:", error && error.message);
    storeFailed = true;
  }
  if (storeFailed) return empty("store-error");
  const understood = (kos || []).filter((k) =>
    k && k.status !== "pending" && k.understanding_status === "complete" && (k.was_ist_passiert || k.warum_wichtig)
  );
  if (!understood.length) return empty("keine-vorgaenge");
  // Leerzustand, der ERWAEHNUNGEN erhaelt: buildMentions ("Ueber dich") arbeitet
  // unabhaengig von den Decisions. Fruehere Early-Returns ("keine-treffer") warfen
  // die verstandenen KOs weg -> Radar zeigte "keine Erwaehnungen", obwohl belegte
  // (auch aeltere) Erwaehnungen ueber den Nutzer vorlagen. Jetzt: KOs mitreichen —
  // UND (Review-Fix) die Erwaehnungs-Quellen nachladen: mit hartem
  // sourcesByVorgang:{} verschwanden belegte Eigenerwaehnungen ohne
  // best_source_url auf genau diesen Leerpfaden weiterhin still.
  const emptyKeepMentions = async (reason) => {
    const mentionSources = {};
    await loadMentionSourcesInto(profile, understood, mentionSources);
    return briefingContract.toBriefingContractV3({
      profile, decisions: [], kosById: {}, sourcesByVorgang: mentionSources, reason, briefingType, knowledgeObjects: understood, now: new Date()
    });
  };

  // Deterministische Bewertung (0 KI). Nur für die getroffenen Vorgänge Quellen laden.
  const now = new Date();
  const decisions = decisionsEngine.decideForUser(profile, understood, { userId, limit: 50 });
  if (!decisions.length) return emptyKeepMentions("keine-treffer");
  // Fresh-aware Kandidaten-Vervollstaendigung (on-read, 0 KI, deterministisch):
  // Der Top-Relevanz-Cut oben (limit 50, Ranking nach PROFIL-AEHNLICHKEIT) kann einen
  // FRISCHEN, hoch relevanten Vorgang von heute abschneiden — er liegt dann nicht wegen
  // mangelnder Relevanz unter dem Cut, sondern weil viele etablierte Vorgaenge aehnlicher
  // sind. Ohne ihn kann die fresh-aware Primary-Auswahl (briefingContract) ihn nie waehlen
  // und der stale Dauervorgang bleibt Primary. Die wenigen fehlenden FRISCHEN verstandenen
  // Vorgaenge (heutiger Berliner Kalendertag) mit derselben Engine nachbewerten und als
  // Kandidaten anhaengen. Kein neuer Motor, keine neue Datenarchitektur, kein LLM-Call;
  // selectFreshAwarePrimary bleibt die einzige Relevanz-/Renderbarkeits-Schranke.
  const candidateDecisions = briefingContract.augmentFreshCandidates(
    understood, decisions,
    (kos) => decisionsEngine.decideForUser(profile, kos, { userId, limit: kos.length }),
    now
  );
  const kosById = {};
  for (const ko of understood) if (ko && ko.id) kosById[ko.id] = ko;
  const selected = candidateDecisions.map((d) => kosById[d.knowledge_object_id]).filter(Boolean);
  const sourcesByVorgang = await loadSourcesByVorgang(selected);
  // Radar-Erwähnungen belegen (Audit-Folgebranch): "Über dich" zeigt eine
  // Eigenerwähnung nur mit echter Quellen-URL. Quellen wurden aber bisher NUR für
  // die Top-50-Decisions geladen; eine Erwähnung außerhalb davon fiel auf
  // ko.best_source_url zurück — fehlt das Feld (~37 % der KOs), verschwand die
  // belegte Erwähnung STILL, obwohl echte URLs in raw_documents liegen. Fix:
  // für die wenigen Erwähnungs-KOs ohne geladene Quelle diese gezielt nachladen
  // (deterministisch, 0 KI, hart gedeckelt). Nur ADDITIV — keine Decision entsteht.
  await loadMentionSourcesInto(profile, understood, sourcesByVorgang);
  // Source Safety Guard (regelbasiert, 0 KI): kritische, unbestaetigte Claims aus
  // unbekannten/schwachen Quellen NICHT ins Helmut-Briefing. Quarantaene wird verworfen.
  const safeDecisions = candidateDecisions.filter((d) => {
    const ko = kosById[d.knowledge_object_id];
    if (!ko) return false;
    return sourceSafety.guardKnowledgeObject(ko, sourcesByVorgang[ko.vorgang_id] || []).status !== "quarantine";
  });
  if (!safeDecisions.length) return emptyKeepMentions("keine-treffer");
  const briefing = briefingContract.toBriefingContractV3({ profile, decisions: safeDecisions, kosById, sourcesByVorgang, now, briefingType, knowledgeObjects: understood });
  // Read-only Auswahl-Diagnose (nur bei ?debugPrimary=1 -> opts.debug). Aus dem ECHTEN
  // Read-Pfad, additiv, ohne die normale Antwort zu veraendern. Fehlerrobust (nie Crash).
  if (opts && opts.debug) {
    try {
      briefing.debugPrimary = {
        ...(opts.debugMeta || {}),
        ...briefingContract.buildPrimarySelectionDebug({
          knowledgeObjectsLoaded: (kos || []).length,
          understood,
          decisionsBefore: decisions,
          decisionsAfter: safeDecisions,
          kosById,
          sourcesByVorgang,
          now,
          state: briefing.currentHelmutState
        })
      };
    } catch (error) {
      briefing.debugPrimary = { error: "debug-build-failed", message: error && error.message };
    }
  }
  // Read-only Radar-Relations-Diagnose (nur bei ?debugRadarRelations=1 -> opts.debugRadar).
  // Aus dem ECHTEN Read-Pfad, additiv, ohne die normale Antwort zu veraendern. Fehlerrobust.
  if (opts && opts.debugRadar) {
    try {
      const radarState = require("./lib/helmut/radarState");
      briefing.debugRadarRelations = radarState.buildRadarRelationsDebug({
        profile,
        decisions: safeDecisions,
        kosById,
        sourcesByVorgang,
        commit: opts.commit || null
      });
    } catch (error) {
      briefing.debugRadarRelations = { error: "debug-build-failed", message: error && error.message };
    }
  }
  return briefing;
}

// Quellen aller Vorgänge PARALLEL laden (nicht seriell) — ein hängender Call darf
// nicht alle nachfolgenden blockieren. Fallback auf best_source_url erledigt der Adapter.
async function loadSourcesByVorgang(kos) {
  const entries = await Promise.all((kos || []).map(async (ko) => {
    let docs = [];
    try { docs = await getSourcesForVorgang(ko.vorgang_id); } catch (_) { docs = []; }
    return [ko.vorgang_id, docs || []];
  }));
  return Object.fromEntries(entries);
}

function compactBriefingPayload(briefing) {
  if (!briefing || typeof briefing !== "object") return briefing;
  const clone = {
    ...briefing,
    items: compactItems(briefing.items, 15),
    personalizedRecommendations: compactItems(briefing.personalizedRecommendations, 15),
    situationalBriefing: compactItems(briefing.situationalBriefing, 15),
    personMentions: compactItems(briefing.personMentions, 6),
    tasks: compactItems(briefing.tasks, 5),
    notifications: compactItems(briefing.notifications, 6),
    evidence: [],
    topicMemory: [],
    signals: [],
    sources: [],
    rawItems: [],
    politicalSignals: [],
    politicalItems: [],
    relevanceScores: [],
    topics: (briefing.topics || []).slice(0, 8),
    homeSections: compactHomeSections(briefing.homeSections)
  };
  if (briefing.themeOfDay) clone.themeOfDay = compactItem(briefing.themeOfDay);
  if (briefing.chanceOfDay) clone.chanceOfDay = compactItem(briefing.chanceOfDay);
  if (briefing.riskOfDay) clone.riskOfDay = compactItem(briefing.riskOfDay);
  return clone;
}

function compactHomeSections(homeSections) {
  if (!homeSections || typeof homeSections !== "object") return homeSections;
  return {
    topTasks: compactHomeItems(homeSections.topTasks, 3),
    changedSinceLastVisit: compactHomeItems(homeSections.changedSinceLastVisit, 3),
    needsAttention: compactHomeItems(homeSections.needsAttention, 3),
    opportunities: compactHomeItems(homeSections.opportunities, 3),
    risks: compactHomeItems(homeSections.risks, 3),
    situational: compactHomeItems(homeSections.situational, 3),
    governmentPlans: compactHomeItems(homeSections.governmentPlans, 3),
    partyFaction: compactHomeItems(homeSections.partyFaction, 3)
  };
}

function compactItems(items, limit) {
  return Array.isArray(items) ? items.slice(0, limit).map(compactItem) : [];
}

function compactHomeItems(items, limit) {
  return Array.isArray(items) ? items.slice(0, limit).map(compactHomeItem).filter(Boolean) : [];
}

function compactHomeItem(item) {
  if (!item || typeof item !== "object") return item;
  return {
    id: item.id,
    signalId: item.signalId || item.signal_id,
    title: item.title,
    priority: item.current_priority || item.priority,
    priorityLabel: item.priorityLabel || item.current_priority || item.priority,
    priorityType: item.priorityType,
    relevanceScore: item.relevanceScore || item.relevance_score || item.finalScore,
    summary: truncateText(item.summary, 220),
    action: truncateText(item.action || item.recommended_action || item.recommendedAction, 260),
    whyItMatters: truncateText(item.whyItMatters || item.personal_relevance_explanation || item.personalRelevanceExplanation, 260),
    personalRelevanceExplanation: truncateText(item.personalRelevanceExplanation, 260),
    inaction: truncateText(item.inaction || item.consequence_if_ignored || item.consequenceIfIgnored, 260),
    consequenceIfIgnored: truncateText(item.consequenceIfIgnored, 260),
    opportunity: truncateText(item.opportunity || item.possible_upside || item.possibleUpside, 220),
    possibleUpside: truncateText(item.possibleUpside, 220),
    estimatedTime: item.estimatedTime || (item.estimated_effort_minutes ? `${item.estimated_effort_minutes} Min.` : undefined),
    deadline: item.deadline,
    statusChange: item.statusChange || item.status_change,
    changeReason: truncateText(item.changeReason || item.change_reason, 220),
    lageMovement: item.lageMovement,
    lageMovementReason: truncateText(item.lageMovementReason || item.lageMovement?.reason, 220),
    lageDevelopment: truncateText(item.lageDevelopment || item.lageMovement?.development, 220),
    sourceFreshness: item.sourceFreshness || item.lageMovement?.sourceFreshness,
    priorityTrend: item.priorityTrend || item.lageMovement?.priorityTrend,
    contextType: item.contextType,
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    url: item.url,
    itemUrl: item.itemUrl,
    sourceUrl: item.sourceUrl,
    linkType: item.linkType,
    publishedAt: item.publishedAt,
    retrievedAt: item.retrievedAt,
    relevanceReason: truncateText(item.relevanceReason, 180),
    primarySource: compactSource(item.primarySource || item.sources?.[0] || item),
    sources: compactSources(item.sources, 2)
  };
}

function compactItem(item) {
  if (!item || typeof item !== "object") return item;
  const compact = { ...item };
  delete compact.memory;
  delete compact.relevanceBreakdown;
  delete compact.sourceBasis;
  delete compact.referent_audit;
  compact.sources = compactSources(item.sources, 2);
  compact.primarySource = compactSource(item.primarySource || compact.sources?.[0]);
  compact.content = truncateText(compact.content, 360);
  compact.excerpt = truncateText(compact.excerpt, 360);
  compact.summary = truncateText(compact.summary, 520);
  compact.whyItMatters = truncateText(compact.whyItMatters, 520);
  compact.recommendedAction = truncateText(compact.recommendedAction, 520);
  compact.lageMovementReason = truncateText(compact.lageMovementReason || compact.lageMovement?.reason, 260);
  compact.lageDevelopment = truncateText(compact.lageDevelopment || compact.lageMovement?.development, 260);
  if (compact.lageMovement && typeof compact.lageMovement === "object") {
    compact.lageMovement = {
      ...compact.lageMovement,
      reason: truncateText(compact.lageMovement.reason, 260),
      development: truncateText(compact.lageMovement.development, 260)
    };
  }
  if (compact.taskTemplate) compact.taskTemplate = compactTaskTemplate(compact.taskTemplate);
  return compact;
}

function compactTaskTemplate(task) {
  if (!task || typeof task !== "object") return task;
  return {
    ...task,
    description: truncateText(task.description, 520),
    sources: compactSources(task.sources, 1),
    primarySource: compactSource(task.primarySource || task.sources?.[0])
  };
}

function compactSources(sources, limit) {
  return Array.isArray(sources) ? sources.slice(0, limit).map(compactSource).filter(Boolean) : [];
}

function compactSource(source) {
  if (!source || typeof source !== "object") return null;
  return {
    sourceName: source.sourceName || source.name,
    sourceType: source.sourceType || source.type,
    sourceUrl: source.sourceUrl,
    url: source.url,
    itemUrl: source.itemUrl || source.url,
    linkType: source.linkType,
    publishedAt: source.publishedAt,
    retrievedAt: source.retrievedAt,
    excerpt: truncateText(source.excerpt || source.content || source.relevanceReason, 160),
    confidence: source.confidence
  };
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return value;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function isPilotAccessConfigured() {
  return Boolean(String(process.env.PILOT_SECRET || "").trim());
}

// Vercel setzt VERCEL/VERCEL_ENV automatisch auf JEDEM Deployment (Prod, Preview,
// `vercel dev`) — robuster als sich auf ein von Hand gesetztes NODE_ENV=production zu
// verlassen. Siehe hasPilotAccess und isHttpsDeployment (lib/helmut/auth.js) fuer den
// jeweiligen Verwendungszweck.
function isProductionLikeDeployment() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === "production");
}

function parseAuthorization(header) {
  const value = String(header || "");
  if (value.startsWith("Bearer ")) return { bearer: value.slice(7).trim() };
  if (!value.startsWith("Basic ")) return {};
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return {
      basic: {
        username: separator >= 0 ? decoded.slice(0, separator) : "",
        password: separator >= 0 ? decoded.slice(separator + 1) : decoded
      }
    };
  } catch {
    return {};
  }
}

function isPublicAssetPath(pathname) {
  return pathname.startsWith("/assets/")
    || pathname === "/favicon.ico"
    || pathname === "/site.webmanifest"
    || pathname === "/sw.js"
    || pathname === "/robots.txt"
    || pathname === "/client.js"
    || pathname === "/styles.css";
}

function wantsHtml(request, url) {
  if (request.method !== "GET") return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (isPublicAssetPath(url.pathname)) return false;
  const accept = String(request.headers.accept || "");
  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

function readCookie(request, name) {
  const cookies = String(request.headers.cookie || "").split(";").map((entry) => entry.trim());
  const prefix = `${name}=`;
  const match = cookies.find((entry) => entry.startsWith(prefix));
  if (!match) return "";
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return match.slice(prefix.length);
  }
}

function pilotCookieHeader(secret, maxAgeSeconds) {
  // SICHERHEIT: siehe isProductionLikeDeployment — robuster als nur NODE_ENV=production.
  const secure = isProductionLikeDeployment() ? "; Secure" : "";
  return `helmut_pilot=${encodeURIComponent(secret || "")}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.max(0, maxAgeSeconds)}${secure}`;
}

function sendPilotUnauthorized(response) {
  response.writeHead(401, jsonHeaders());
  response.end(JSON.stringify({ error: "Pilot access required" }, null, 2));
}

function sendCsrfForbidden(response) {
  response.writeHead(403, jsonHeaders());
  response.end(JSON.stringify({ error: "CSRF token missing or invalid" }, null, 2));
}

function sendPilotUnlockPage(response, url) {
  const safePath = safeReturnPath(url);
  response.writeHead(200, htmlHeaders());
  response.end(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#050914" />
    <title>Helmut Zugang</title>
    <style>
      :root { color-scheme: light; --ink: #111111; --muted: #68645f; --line: #e7e0d4; --paper: #f7f4ed; --navy: #101827; --accent: #7d1734; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 28px;
        background:
          linear-gradient(rgba(16, 24, 39, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(16, 24, 39, 0.035) 1px, transparent 1px),
          var(--paper);
        background-size: 38px 38px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
      }
      main {
        width: min(100%, 560px);
        padding: clamp(32px, 7vw, 56px);
        border: 1px solid var(--line);
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 28px 80px rgba(16, 24, 39, 0.08);
      }
      .mark {
        width: 48px;
        height: 48px;
        display: grid;
        place-items: center;
        border-radius: 16px;
        background: var(--navy);
        color: white;
        font-weight: 800;
        letter-spacing: 0.02em;
        margin-bottom: 42px;
      }
      .rule {
        width: 88px;
        height: 2px;
        margin: 0 0 34px;
        background: linear-gradient(90deg, var(--accent), var(--navy));
      }
      h1 {
        margin: 0;
        font-size: clamp(42px, 9vw, 68px);
        line-height: 0.98;
        letter-spacing: -0.04em;
      }
      p {
        margin: 22px 0 0;
        font-size: 18px;
        line-height: 1.55;
        color: var(--muted);
      }
      form {
        margin-top: 34px;
        display: grid;
        gap: 12px;
      }
      input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 18px 18px;
        font: inherit;
        font-size: 18px;
        outline: none;
        background: #fff;
      }
      input:focus { border-color: rgba(16, 24, 39, 0.45); box-shadow: 0 0 0 4px rgba(16, 24, 39, 0.06); }
      button {
        border: 0;
        border-radius: 18px;
        padding: 18px 20px;
        background: var(--navy);
        color: #fff;
        font: inherit;
        font-size: 17px;
        font-weight: 700;
        cursor: pointer;
      }
      .error {
        min-height: 24px;
        margin-top: 4px;
        color: #a51d2d;
        font-size: 15px;
      }
      @media (max-width: 520px) {
        body { place-items: stretch; align-items: center; padding: 18px; }
        main { border-radius: 24px; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">H</div>
      <div class="rule"></div>
      <h1>Zugang.</h1>
      <p>Helmut ist geschützt. Gib den Zugangscode ein, um die politische Lage zu öffnen.</p>
      <p><a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a></p>
      <form id="unlock">
        <input id="secret" name="secret" type="password" autocomplete="current-password" placeholder="Zugangscode" autofocus />
        <button type="submit">Helmut öffnen</button>
        <div class="error" id="error" role="alert"></div>
      </form>
    </main>
    <script>
      const form = document.getElementById("unlock");
      const error = document.getElementById("error");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        const secret = document.getElementById("secret").value.trim();
        const response = await fetch("/api/pilot/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret })
        });
        if (!response.ok) {
          error.textContent = "Der Zugangscode stimmt nicht.";
          return;
        }
        window.location.href = ${JSON.stringify(safePath)};
      });
    </script>
  </body>
</html>`);
}

// Beschreibt den aktuell konfigurierten KI-Empfänger für die Datenschutzseite.
// Reiner Env-Read (Azure vs. OpenAI) — keine Änderung am KI-/Datenmotor.
function aiRecipientDescriptor() {
  const azure = Boolean(process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_ENDPOINT);
  const openai = Boolean(process.env.OPENAI_API_KEY);
  if (azure) return { enabled: true, name: "Azure OpenAI", location: "Serverregion gemäß Betreiber-Konfiguration" };
  if (openai) return { enabled: true, name: "OpenAI", location: "USA" };
  return { enabled: false, name: "Azure OpenAI bzw. OpenAI", location: "je nach Konfiguration (ggf. USA)" };
}

// Impressum nach § 5 DDG (früher § 5 TMG). Nur faktische Angaben aus dem
// vorhandenen Verantwortlichen-Datensatz — keine erfundenen Pflichtangaben.
// Was gewerblich ggf. zusätzlich nötig ist (Telefon, USt-IdNr, Register),
// bleibt bewusst offen und ist als Betreiber-To-do markiert (HTML-Kommentar).
function sendImpressumPage(response) {
  response.writeHead(200, htmlHeaders());
  response.end(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Impressum · Helmut</title>
    <style>
      :root { color-scheme: light; --ink: #111; --muted: #5f615f; --line: #d9ddd7; --paper: #f7f7f2; --accent: #7d1734; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--paper); color: var(--ink); line-height: 1.6; }
      main { width: min(100% - 32px, 880px); margin: 0 auto; padding: 56px 0 72px; }
      a { color: var(--accent); }
      h1 { font-size: clamp(36px, 6vw, 64px); line-height: 1; margin: 0 0 24px; letter-spacing: -0.03em; }
      h2 { margin: 36px 0 10px; font-size: 22px; }
      p, li { color: var(--muted); font-size: 17px; }
      .notice { border: 1px solid var(--line); background: #fff; padding: 18px 20px; border-radius: 8px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Impressum</h1>

      <h2>Angaben gemäß § 5 DDG</h2>
      <p>Lüey Nohut<br>Eresburgstr. 42<br>12103 Berlin<br>Deutschland</p>

      <h2>Kontakt</h2>
      <p>E-Mail: <a href="mailto:hi@nohut.de">hi@nohut.de</a></p>

      <h2>Verantwortlich für den Inhalt</h2>
      <p>Lüey Nohut (Anschrift wie oben).</p>

      <p class="notice">Helmut befindet sich im Pilotbetrieb. Weitere nach § 5 DDG ggf. erforderliche Angaben (z. B. Telefonnummer, Umsatzsteuer-Identifikationsnummer oder Registereintrag) werden ergänzt, sobald sie für den Betrieb zutreffen.</p>
      <!-- BETREIBER-TODO: Bei gewerblichem/geschäftsmäßigem Betrieb Pflichtangaben ergänzen: Telefonnummer, USt-IdNr (§ 27a UStG) bzw. Handelsregister/Rechtsform. Bewusst nicht erfunden — vom Betreiber einzutragen. -->

      <p><a href="/datenschutz">Datenschutz</a> · <a href="/">Zurück zu Helmut</a></p>
    </main>
  </body>
</html>`);
}

// Umsetzungsnotiz §6: oeffentliche Seite fuer Invite-/Reset-Links. Zustaende:
// Formular (Token gueltig) / erledigt (Passwort gesetzt, eingeloggt) / abgelaufen
// (-> "Neuen Link anfordern"). Der Token bleibt in der URL und wird nur an die
// eigenen /api/auth-Endpunkte geschickt (CSP: connect-src 'self').
// Design (Produktionsfehler-Fix): dieselben Tokens/Radien/Farben wie der
// dunkle App-/Login-Screen (client.js renderLogin/renderPilotAccess,
// styles.css .login-screen/.pilot-access-card/.pilot-access-form). Diese Seite
// wird VOR dem SPA-Bootstrap ausgeliefert (kein Zugriff auf styles.css/
// client.js-Klassen) — die Werte sind deshalb bewusst 1:1 hierher uebertragen,
// keine neue Designwelt.
function sendSetPasswordPage(response) {
  response.writeHead(200, htmlHeaders());
  response.end(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#050914" />
    <meta name="robots" content="noindex" />
    <title>Passwort setzen · Helmut</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body { width: 100%; min-height: 100%; }
      body {
        margin: 0; min-height: 100dvh; display: grid; place-items: center;
        padding: clamp(32px, 8dvh, 96px) 20px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #f5f1e8; line-height: 1.6;
        background:
          radial-gradient(ellipse at 84% 10%, rgba(88, 46, 196, .09), transparent 38%),
          radial-gradient(ellipse at 12% 92%, rgba(28, 66, 168, .07), transparent 34%),
          radial-gradient(circle at 50% 40%, rgba(140, 92, 255, .11), transparent 26%),
          linear-gradient(180deg, #070b15 0%, #050914 72%, #03050b 100%);
      }
      main {
        width: min(100%, 480px);
        background: linear-gradient(155deg, rgba(15, 21, 38, .97), rgba(7, 10, 21, .96));
        border: 1px solid rgba(255, 255, 255, .07);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .042), 0 36px 80px rgba(0, 0, 0, .44), 0 6px 28px rgba(0, 0, 0, .3);
        border-radius: 24px;
        padding: 48px 40px;
        text-align: center;
      }
      .mark { display: grid; place-items: center; color: #fbf7ef; margin-bottom: 6px; }
      .mark span { font: 720 48px/1 Inter, sans-serif; letter-spacing: -.04em; text-shadow: 0 20px 70px rgba(140, 92, 255, .34); }
      .wordmark { margin: 0 0 14px; font-weight: 800; letter-spacing: .08em; color: #d7e0ff; opacity: .72; text-transform: uppercase; font-size: 13px; }
      h1 { font-size: clamp(26px, 5vw, 34px); line-height: 1.15; margin: 0 0 12px; letter-spacing: -.02em; color: #f5f1e8; }
      p { color: rgba(245, 241, 232, .68); font-size: 16px; max-width: 360px; margin: 0 auto 4px; }
      a { color: #6f8ff7; }
      label { display: block; margin: 16px 0 6px; font-weight: 600; font-size: 14px; text-align: left; color: rgba(245, 241, 232, .68); }
      form { margin-top: 8px; }
      input {
        width: 100%; min-height: 52px; padding: 0 16px; font-size: 16px; font: inherit;
        border: 1px solid rgba(255, 255, 255, .12); border-radius: 16px;
        background: rgba(255, 255, 255, .06); color: #f5f1e8; outline: none;
      }
      input:focus { border-color: rgba(139, 92, 246, .56); box-shadow: 0 0 0 4px rgba(139, 92, 246, .16); }
      button {
        margin-top: 20px; width: 100%; min-height: 48px; padding: 0 22px; font-size: 16px; font-weight: 500;
        color: #ffffff; background: linear-gradient(135deg, #102354, #1d3f8f);
        border: 1px solid #f5f1e8; border-radius: 14px; cursor: pointer;
        box-shadow: 0 14px 34px rgba(29, 63, 143, .16);
      }
      button[disabled] { opacity: .6; cursor: wait; }
      .error { color: #ff7a8a; font-size: 14px; margin-top: 12px; min-height: 18px; }
      .notice { border: 1px solid rgba(255, 255, 255, .1); background: rgba(255, 255, 255, .04); padding: 16px 18px; border-radius: 14px; font-size: 15px; color: rgba(245, 241, 232, .68); }
      footer { margin-top: 32px; font-size: 13px; color: rgba(245, 241, 232, .5); }
      footer a { color: rgba(245, 241, 232, .5); text-decoration: underline; }
      [hidden] { display: none !important; }
      @media (max-width: 480px) { main { border-radius: 20px; padding: 36px 24px; } }
    </style>
  </head>
  <body>
    <main>
      <div class="mark"><span>H</span></div>
      <p class="wordmark">Helmut</p>
      <h1>Passwort setzen</h1>

      <section id="loadingView"><p>Der Link wird geprüft …</p></section>

      <section id="formView" hidden>
        <p>Wähle ein Passwort für deinen Helmut-Zugang. Mindestens 8 Zeichen.</p>
        <form id="setForm">
          <label for="pw1">Neues Passwort</label>
          <input id="pw1" type="password" minlength="8" required autocomplete="new-password" />
          <label for="pw2">Passwort wiederholen</label>
          <input id="pw2" type="password" minlength="8" required autocomplete="new-password" />
          <button type="submit" id="setSubmit">Passwort setzen</button>
          <p class="error" id="formError" hidden></p>
        </form>
      </section>

      <section id="doneView" hidden>
        <p class="notice">Dein Passwort ist gesetzt — du bist jetzt angemeldet. Du wirst weitergeleitet …</p>
        <p style="margin-top:14px"><a href="/">Weiter zu Helmut</a></p>
      </section>

      <section id="expiredView" hidden>
        <p class="notice">Dieser Link ist abgelaufen oder wurde bereits verwendet.</p>
        <form id="renewForm">
          <label for="renewEmail">Neuen Link anfordern</label>
          <input id="renewEmail" type="email" required autocomplete="email" placeholder="deine E-Mail-Adresse" />
          <button type="submit" id="renewSubmit">Neuen Link anfordern</button>
        </form>
        <p id="renewDone" hidden>Anfrage angekommen. Solange der Mail-Versand noch nicht aktiv ist, wende dich bitte direkt ans Helmut-Team — es kann dir sofort einen neuen Link erstellen.</p>
      </section>

      <footer><a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a></footer>
    </main>
    <script>
      (function () {
        var token = new URLSearchParams(window.location.search).get("token") || "";
        var views = ["loadingView", "formView", "doneView", "expiredView"];
        function show(id) {
          views.forEach(function (view) { document.getElementById(view).hidden = view !== id; });
        }
        if (!token) {
          show("expiredView");
        } else {
          fetch("/api/auth/password-token?token=" + encodeURIComponent(token))
            .then(function (res) { return res.json(); })
            .then(function (data) { show(data && data.valid ? "formView" : "expiredView"); })
            .catch(function () { show("expiredView"); });
        }

        document.getElementById("setForm").addEventListener("submit", function (event) {
          event.preventDefault();
          var pw1 = document.getElementById("pw1").value;
          var pw2 = document.getElementById("pw2").value;
          var errorEl = document.getElementById("formError");
          errorEl.hidden = true;
          if (pw1.length < 8) { errorEl.textContent = "Das Passwort muss mindestens 8 Zeichen haben."; errorEl.hidden = false; return; }
          if (pw1 !== pw2) { errorEl.textContent = "Die Passwörter stimmen nicht überein."; errorEl.hidden = false; return; }
          var button = document.getElementById("setSubmit");
          button.disabled = true;
          fetch("/api/auth/set-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token, password: pw1 })
          }).then(function (res) {
            if (res.ok) {
              show("doneView");
              // Funktionaler Fix: automatisch weiterleiten statt nur einen
              // manuellen Link zu zeigen — die Session-Cookie ist mit dieser
              // Antwort bereits gesetzt, eine echte Top-Level-Navigation nimmt
              // sie zuverlaessig mit (identisches Muster wie der normale
              // Login-Screen, der nach Erfolg reload() ausloest).
              window.setTimeout(function () { window.location.href = "/"; }, 600);
              return null;
            }
            if (res.status === 410) { show("expiredView"); return null; }
            return res.json().catch(function () { return {}; }).then(function (data) {
              errorEl.textContent = (data && data.error) || "Das hat nicht geklappt. Bitte versuch es erneut.";
              errorEl.hidden = false;
            });
          }).catch(function () {
            errorEl.textContent = "Keine Verbindung. Bitte versuch es erneut.";
            errorEl.hidden = false;
          }).then(function () { button.disabled = false; });
        });

        document.getElementById("renewForm").addEventListener("submit", function (event) {
          event.preventDefault();
          var email = document.getElementById("renewEmail").value;
          var button = document.getElementById("renewSubmit");
          button.disabled = true;
          fetch("/api/auth/request-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email })
          }).catch(function () {}).then(function () {
            document.getElementById("renewForm").hidden = true;
            document.getElementById("renewDone").hidden = false;
          });
        });
      })();
    </script>
  </body>
</html>`);
}

function sendPrivacyPage(response) {
  const ai = aiRecipientDescriptor();
  response.writeHead(200, htmlHeaders());
  response.end(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Datenschutz · Helmut</title>
    <style>
      :root { color-scheme: light; --ink: #111; --muted: #5f615f; --line: #d9ddd7; --paper: #f7f7f2; --accent: #7d1734; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--paper); color: var(--ink); line-height: 1.6; }
      main { width: min(100% - 32px, 880px); margin: 0 auto; padding: 56px 0 72px; }
      a { color: var(--accent); }
      h1 { font-size: clamp(36px, 6vw, 64px); line-height: 1; margin: 0 0 24px; letter-spacing: -0.03em; }
      h2 { margin: 36px 0 10px; font-size: 22px; }
      p, li { color: var(--muted); font-size: 17px; }
      ul { padding-left: 22px; }
      .notice { border: 1px solid var(--line); background: #fff; padding: 18px 20px; border-radius: 8px; }
      code { background: #fff; border: 1px solid var(--line); padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Datenschutzerklärung</h1>
      <p class="notice">Diese Erklärung beschreibt die Datenverarbeitung von Helmut im Pilotbetrieb. Vor einem breiten oder kommerziellen Produktivbetrieb wird eine rechtliche Prüfung ausdrücklich empfohlen — insbesondere zur Rechtsgrundlage für politische Daten (Art. 9 DSGVO), zu den Auftragsverarbeitungsverträgen und zur Aktivierung der KI-Funktion.</p>

      <h2>1. Verantwortlicher</h2>
      <p>Lüey Nohut<br>Eresburgstr. 42, 12103 Berlin<br>E-Mail: <a href="mailto:hi@nohut.de">hi@nohut.de</a></p>

      <h2>2. Verarbeitete Daten</h2>
      <ul>
        <li><strong>Kontodaten:</strong> Name, E-Mail-Adresse, Rolle, Passwort (nur als kryptografischer Hash), Login-Zeitpunkte.</li>
        <li><strong>Mandatsprofil:</strong> Partei/Fraktion, Ausschüsse, Schwerpunkt-, Risiko- und Chancen-Themen, Wahlkreis/Region, Kommunikationsstil.</li>
        <li><strong>Inhalte:</strong> Briefings, Empfehlungen, Aufgaben, Notizen, Tagesinput, Lage-Checks.</li>
        <li><strong>Nutzungssignale:</strong> markiert/geöffnet/ignoriert zur Verbesserung der Relevanz.</li>
        <li><strong>Technische Daten:</strong> Session-Cookie, IP-Adresse und Browser-User-Agent (Sicherheit/Push), Zeitstempel, Fehlerprotokolle.</li>
      </ul>

      <h2>3. Zwecke</h2>
      <p>Quellen prüfen, politische Entwicklungen pro Mandat priorisieren, personalisierte Briefings erzeugen, Aufgaben/Kommunikation vorbereiten, Push-Hinweise senden, Sicherheit gewährleisten und die Relevanzlogik verbessern.</p>

      <h2>4. Rechtsgrundlagen</h2>
      <p>Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 DSGVO:</p>
      <ul>
        <li><strong>lit. b</strong> (Vertrag/Nutzungsverhältnis): Bereitstellung der App, Konten und Briefings.</li>
        <li><strong>lit. f</strong> (berechtigtes Interesse): Personalisierung, Relevanz-Verbesserung und Sicherheit des Dienstes.</li>
        <li><strong>lit. a</strong> (Einwilligung): optionale Push-Benachrichtigungen.</li>
      </ul>
      <p><strong>Besondere Datenkategorien (Art. 9 DSGVO):</strong> Das Mandatsprofil kann politische Meinungen abbilden. Für deren Verarbeitung ist eine gesonderte Rechtsgrundlage nach Art. 9 DSGVO erforderlich. Die rechtssichere Festlegung dieser Grundlage sowie eine ggf. erforderliche Datenschutz-Folgenabschätzung (DSFA) obliegen dem Betreiber und sind vor einem Produktivbetrieb mit mehreren Mandaten abzuschließen.</p>
      <!-- BETREIBER-TODO: Art. 9-Rechtsgrundlage rechtssicher festlegen und DSFA durchführen (siehe docs/dsgvo-checklist.md). Nicht aus dem Code lösbar. -->

      <h2>5. Empfänger / Auftragsverarbeiter</h2>
      <ul>
        <li><strong>Vercel</strong> (Hosting/Betrieb der Anwendung; konfigurierte Region Frankfurt, <code>fra1</code>).</li>
        <li><strong>Supabase</strong> (Datenbank und Datenspeicherung).</li>
        ${ai.enabled
          ? `<li><strong>${ai.name}</strong> (KI-Textgenerierung) — <strong>derzeit AKTIV</strong>: Inhalte werden zur Texterzeugung an ${ai.name} übermittelt (Serverstandort: ${ai.location}).</li>`
          : `<li><strong>KI-Dienst (${ai.name})</strong> (KI-Textgenerierung) — <strong>derzeit deaktiviert</strong>, daher keine Nutzung und keine Übermittlung.</li>`}
        <li><strong>Browser-Push-Dienste</strong> (nur bei aktivierten Benachrichtigungen).</li>
      </ul>
      <p>Für die eingesetzten Auftragsverarbeiter sind <strong>Auftragsverarbeitungsverträge (AVV)</strong> nach Art. 28 DSGVO erforderlich. Ihr Abschluss sowie die verbindliche Festlegung der Serverregionen (u. a. Supabase, KI-Dienst) liegen in der Verantwortung des Betreibers.</p>
      <!-- BETREIBER-TODO: AVV nach Art. 28 mit Vercel, Supabase, KI-Dienst und Push-Anbietern tatsächlich abschließen; reale Serverregionen dokumentieren. Nicht aus dem Code lösbar. -->

      <h2>6. Übermittlung in Drittländer</h2>
      ${ai.enabled
        ? `<p><strong>Die KI-Funktion ist derzeit aktiv.</strong> Zur Texterzeugung werden Inhalte an ${ai.name} übermittelt (Serverstandort: ${ai.location}) — im Wesentlichen öffentlich verfügbare Nachrichteninhalte sowie das fachliche Mandatsprofil. <strong>Dieses Mandatsprofil kann politische Schwerpunkt-, Risiko- und No-Go-Themen enthalten; solche politischen Informationen können damit zur KI-Verarbeitung an den KI-Dienst übermittelt werden.</strong> Sofern der Serverstandort in einem Drittland (z. B. USA) liegt, ist dafür eine gültige Rechtsgrundlage (etwa EU-Standardvertragsklauseln) erforderlich; deren Sicherstellung obliegt dem Betreiber.</p>`
        : `<p><strong>Im aktuellen Betrieb ist die KI-Textgenerierung deaktiviert; eine entsprechende Übermittlung findet nicht statt.</strong> Wird die KI-Funktion aktiviert, können Inhalte einschließlich des Mandatsprofils — das politische Schwerpunkt-, Risiko- und No-Go-Themen enthalten kann — zur KI-Verarbeitung an den KI-Dienst (${ai.name}) übermittelt werden, ggf. in ein Drittland (z. B. USA). Dies erfordert dann eine gültige Rechtsgrundlage und eine Aktualisierung dieser Erklärung.</p>`}

      <h2>7. Speicherdauer</h2>
      <p>Profil- und Inhaltsdaten werden bis zur Löschung des Kontos bzw. bis zum Ende des Pilotbetriebs gespeichert. Verläufe (u. a. Briefings, Interaktionen, Notizen, Sessions, Fehlerprotokolle) werden technisch begrenzt und pro Mandat gekappt. Auf Wunsch werden Daten umgehend gelöscht (siehe Deine Rechte).</p>

      <h2>8. Cookies</h2>
      <p>Helmut setzt ein technisch notwendiges Session-Cookie (<code>helmut_session</code>, HttpOnly, SameSite=Lax) zur Anmeldung. Es dient nicht der Werbung oder dem Tracking.</p>

      <h2>9. Deine Rechte</h2>
      <p>Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. In der App: Profildaten <strong>exportieren</strong> und <strong>löschen</strong> (Einstellungen). Es besteht ein <strong>Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde</strong>.</p>

      <h2>10. Kontakt &amp; Stand</h2>
      <p>Datenschutzanfragen: <a href="mailto:hi@nohut.de">hi@nohut.de</a> · Stand: Juli 2026</p>
      <p><a href="/impressum">Impressum</a> · <a href="/">Zurück zu Helmut</a></p>
    </main>
  </body>
</html>`);
}

// Splash-Watchdog: EINZIGE Quelle fuer den Boot-Sicherheitsnetz-Code, der
// verhindert, dass der Vollbild-Splash-Overlay (#appSplash) dauerhaft haengen
// bleibt (Ursache: ungeguardeter erster Boot-Await konnte auf Android/Brave
// haengen -> hideStartupSplash() in client.js wurde nie erreicht). Diese
// Konstante wird von indexHtml() (dem TATSAECHLICH ausgelieferten Production-
// Template) eingebettet UND von scripts/splash-boot-test.js referenziert, damit
// index.html (statische Repo-Kopie ohne Server-Templating) niemals unbemerkt
// von der ausgelieferten Logik abweichen kann. Guard-Variable verhindert
// doppelte Timer, falls der Block je zweimal im selben Dokument landen sollte.
const SPLASH_WATCHDOG_SCRIPT = `(function () {
        if (window.__helmutSplashWatchdogInstalled) return;
        window.__helmutSplashWatchdogInstalled = true;
        function forceHideSplash() {
          try {
            document.body.classList.remove("is-loading");
            document.body.classList.add("app-ready", "splash-gone");
            var s = document.getElementById("appSplash");
            if (s) s.style.display = "none";
          } catch (e) {}
        }
        function showReloadCard(message) {
          forceHideSplash();
          var app = document.getElementById("app");
          if (!app) return;
          app.innerHTML =
            '<div style="display:grid;place-items:center;min-height:100dvh;font-family:Inter,ui-sans-serif,system-ui,sans-serif;padding:32px;text-align:center">' +
            '<div><div style="font:700 52px/1 Inter,sans-serif;letter-spacing:-.04em;margin-bottom:22px;color:#fbf7ef">H</div>' +
            '<p style="color:rgba(245,241,232,.62);max-width:300px;margin:0 auto 22px;font-size:15px;line-height:1.55">' + message + '</p>' +
            '<button type="button" onclick="window.location.reload()" style="appearance:none;border:0;cursor:pointer;padding:14px 22px;border-radius:14px;font:600 16px Inter,sans-serif;color:#0b0f1a;background:#f5f1e8">Neu laden</button>' +
            '</div></div>';
        }
        window.setTimeout(function () {
          if (!window.__helmutClientLoaded) {
            showReloadCard("Helmut konnte gerade nicht geladen werden.<br>Bitte lade die Seite neu.");
          }
        }, 8000);
        window.setTimeout(function () {
          if (document.body.classList.contains("is-loading")) {
            showReloadCard("Helmut braucht gerade ungewoehnlich lange.<br>Bitte lade die Seite neu.");
          }
        }, 30000);
      })();`;

function indexHtml() {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#050914" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Helmut" />
    <meta name="application-name" content="Helmut" />
    <title>Helmut</title>
    <link rel="icon" href="assets/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png?v=${ASSET_VERSION}" />
    <link rel="icon" type="image/png" sizes="16x16" href="assets/favicon-16.png?v=${ASSET_VERSION}" />
    <link rel="icon" href="assets/helmut_logo.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" sizes="180x180" href="assets/helmut_appletouch_180.png?v=${ASSET_VERSION}" />
    <link rel="apple-touch-icon" href="assets/helmut_appicon_192.png?v=${ASSET_VERSION}" />
    <link rel="manifest" href="site.webmanifest?v=${ASSET_VERSION}" />
    <style>
      :root{color-scheme:dark;background:#050914}html,body{width:100%;min-height:100%;margin:0;background:#050914;color:#f5f1e8}body.is-loading{background:radial-gradient(circle at 50% 42%,rgba(140,92,255,.12),transparent 26%),linear-gradient(180deg,#070b15 0%,#050914 72%,#03050b 100%)}.app-splash{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:radial-gradient(circle at 50% 42%,rgba(140,92,255,.12),transparent 26%),linear-gradient(180deg,#070b15 0%,#050914 72%,#03050b 100%)}.splash-mark,.loading-mark{display:grid;place-items:center;color:#fbf7ef;background:transparent}.splash-mark span,.loading-mark span{font:720 clamp(42px,13vw,72px)/1 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:-.04em;text-shadow:0 20px 70px rgba(140,92,255,.34)}.shell{width:100%;min-height:100dvh}.loading-screen{display:grid;place-items:center;min-height:100dvh;width:100%;background:#050914}
    </style>
    <style>
      :root[data-theme="light"] body.is-loading,:root[data-theme="light"] .app-splash,:root[data-theme="light"] .loading-screen{background:#f7f9fc}
      :root[data-theme="light"] .splash-mark span,:root[data-theme="light"] .loading-mark span{color:#0f1729;text-shadow:none}
    </style>
    <script>(function(){try{var p=localStorage.getItem("helmut:theme")||"system";var t=p==="light"?"light":p==="dark"?"dark":((window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
    <link rel="stylesheet" href="styles.css?v=${ASSET_VERSION}" />
  </head>
  <body class="is-loading">
    <div class="app-splash" id="appSplash" aria-hidden="true">
      <div class="splash-mark"><span>H</span></div>
    </div>
    <main class="shell" id="app">
      <section class="loading-screen" aria-label="Bereite deine Morgenlage vor">
        <div class="loading-mark"><span>H</span></div>
      </section>
    </main>

    <div class="orientation-lock" id="orientationLock" role="alert" aria-label="Bitte Smartphone drehen">
      <div class="orientation-lock-card">
        <svg class="orientation-lock-icon" viewBox="0 0 56 56" fill="none" aria-hidden="true" focusable="false">
          <rect x="6" y="20" width="26" height="16" rx="3" stroke="currentColor" stroke-width="2" />
          <path d="M40 20a12 12 0 1 1-3-7.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M46 10v8h-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <p class="orientation-lock-text">Bitte drehe dein Smartphone ins Hochformat, um Helmut zu verwenden.</p>
      </div>
    </div>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <script src="client.js?v=${ASSET_VERSION}" defer></script>
    <script>${SPLASH_WATCHDOG_SCRIPT}</script>
  </body>
</html>`;
}

function safeReturnPath(url) {
  const path = `${url.pathname || "/"}${url.search || ""}`;
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path.replace(/[<>]/g, "");
}
// handleRequest ist jetzt async. Dieser Wrapper faengt jede Rejection ab, damit
// kein Request haengen bleibt und Fehler intern protokolliert werden.
function requestHandler(request, response) {
  Promise.resolve()
    .then(() => handleRequest(request, response))
    .catch((error) => {
      console.error("Unhandled request error", error);
      accounts.recordSystemError({ scope: "server", message: error && error.message, path: request.url }).catch(() => {});
      if (!response.headersSent) {
        response.writeHead(500, jsonHeaders());
        response.end(JSON.stringify({ error: "Interner Serverfehler." }, null, 2));
      }
    });
}

module.exports = requestHandler;
// Test-Hook (nur fuer Offline-Tests; veraendert den HTTP-Pfad nicht): erlaubt den
// direkten, auth-freien Aufruf der internen Datenstatus-Funktion.
module.exports.__buildAdminDataStatus = buildAdminDataStatus;
module.exports.__buildHelmutConfigDiagnose = buildHelmutConfigDiagnose;
module.exports.__buildPipelineRecoveryStatus = buildPipelineRecoveryStatus;
// Test-Hook (nur fuer Offline-Tests, wie __build* oben): der slot-aware Read-Pfad.
module.exports.__buildV3Briefing = buildV3Briefing;
// Test-Hook (Offline): der oeffentliche Release-Serializer — prueft, dass keine
// Modell-/Vendor-Details an anonyme Aufrufer durchsickern.
module.exports.__publicReleasePayload = publicReleasePayload;
// Test-Hook (Offline): die tatsaechlich ausgelieferte Production-Shell + die
// einzige Splash-Watchdog-Quelle — verhindert unbemerktes Auseinanderdriften
// von index.html und dem Server-Template.
module.exports.__indexHtml = indexHtml;
module.exports.__SPLASH_WATCHDOG_SCRIPT = SPLASH_WATCHDOG_SCRIPT;
// Test-Hook (Offline): die Profil-Normalisierung (Mehrmandantenfaehigkeit Phase 4)
// — prueft, dass die neuen strukturierten Felder (KI-Budget, aktiv, Regierungsrolle,
// Onboarding, Namensvarianten) korrekt uebernommen/validiert werden und Bearbeiten
// nie ungewollt Felder loescht.
module.exports.__normalizeProfile = normalizeProfile;
// Test-Hooks (Offline): Betriebs-Metadaten-Leser fuer den Admin. Pruefen die
// EHRLICHE Degradation, wenn vercel.json (config=null) oder eine Workflow-Datei
// nicht lesbar/nicht gebundelt ist — Rueckgabe null bzw. { verfuegbar:false }.
module.exports.__readVercelCronSchedule = readVercelCronSchedule;
module.exports.__readWorkflowWatchdog = readWorkflowWatchdog;
// Test-Hooks (Offline, Audit-Folgebranch): Monitoring-Zweitkanal + Asset-Version.
module.exports.__sendMonitoringWebhook = sendMonitoringWebhook;
module.exports.__ASSET_VERSION = () => ASSET_VERSION;
// Test-Hook (Offline): der Kopf-Frische-Decorator — prueft, dass der oeffentliche
// Briefing-Status aus der EINEN Frische-Wahrheit (currentHelmutState) stammt und
// ein alter/fehlgeschlagener Lauf nie "Aktuell" ergibt (Konsistenz Kopf ↔ Karte).
module.exports.__decorateBriefingFreshness = decorateBriefingFreshness;
// Test-Hook (Offline, P2-5): die Quellenabdeckungs-Prüfungen an ihrem ECHTEN Aufrufort —
// backendHealth "Quellenbasis" + pilotReadiness "zu wenige Quellen". Sichert, dass ein
// Regress am Aufrufort (Schwelle zurückgedreht ODER wieder der tote Blob gezählt) auffällt,
// nicht nur in der reinen source-coverage-Logik.
module.exports.__backendHealth = backendHealth;
module.exports.__pilotReadiness = pilotReadiness;

if (require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(port, () => {
    console.log(`Helmut running at http://localhost:${port}`);
  });
}


function sendJson(response, payload) {
  response.writeHead(200, jsonHeaders());
  response.end(JSON.stringify(payload, null, 2));
}

// Begrenzt eine Promise hart auf maxMs, damit ein haengender Aufruf (Netz, DB) nie den
// gesamten Request blockiert. Die urspruengliche Promise laeuft im Hintergrund weiter
// (Node kennt kein echtes Cancel), aber der Aufrufer bekommt garantiert eine Antwort.
function withTimeout(promise, maxMs, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout nach ${maxMs}ms: ${label}`)), maxMs);
    })
  ]);
}

// CSP-Hinweis: script-src/style-src brauchen noch 'unsafe-inline' fuer die wenigen
// bestehenden Inline-<script>/style="..."-Stellen (index.html, ein paar Onclick-Handler
// in client.js). Das zu entfernen (Nonce/Refactor auf addEventListener) ist eine separate,
// groessere Aufraeumarbeit — hier bewusst NICHT angefasst, um kein bestehendes Verhalten
// zu riskieren. Alles andere unten ist bereits so restriktiv wie moeglich, ohne dass
// etwas an der Anwendung sich aendert (keine externen Scripts/Fetches/Fonts vorhanden;
// Artikel-/Publisher-Bilder kommen von echten externen https-Quellen, daher img-src https:).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join("; ");

function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    // App laeuft ausschliesslich ueber HTTPS (Vercel) — kein includeSubDomains/preload,
    // da die Subdomain-/Praeload-Topologie einer echten Custom-Domain hier nicht bekannt
    // ist und eine falsche Praeload-Eintragung kaum rueckgaengig zu machen ist.
    "Strict-Transport-Security": "max-age=63072000",
    ...extra
  };
}

function jsonHeaders(extra = {}) {
  return securityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra
  });
}

function htmlHeaders(extra = {}) {
  return securityHeaders({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra
  });
}

function sendPreviewReadOnly(response) {
  return sendJson(response, {
    ok: true,
    previewMode: true,
    skipped: true,
    message: "Vorschau ist read-only. Es wurden keine Nutzungs-, Update- oder Profildaten verändert."
  });
}

function shouldRefreshLatestBriefing(briefing, url) {
  if (url.searchParams.get("refresh") === "0") return false;
  if (process.env.AUTO_REFRESH_ON_READ === "false") return false;
  if (!briefing || briefing.status === "Demo") return true;
  const generatedAt = new Date(briefing.generatedAt || briefing.date || 0);
  const ageMs = Date.now() - generatedAt.getTime();
  const hasContent = Number(briefing.items?.length || 0) > 0 || Number(briefing.situationalBriefing?.length || 0) > 0 || Number(briefing.personMentions?.length || 0) > 0;
  if (!hasContent) return true;
  if (Number.isNaN(generatedAt.getTime())) return true;
  return isBriefingStaleForBerlin(briefing) || ageMs > 4 * 60 * 60 * 1000;
}

function decorateBriefingFreshness(briefing) {
  if (!briefing || briefing.status === "Demo") return briefing;
  // EINE Wahrheit fuer die Aktualitaet: der Kopf-Status folgt der Frische der
  // TATSAECHLICH angezeigten Daten (briefing.currentHelmutState — echte
  // Datenzeitstempel + Tages-Guard aus buildCurrentHelmutState), NICHT dem
  // generatedAt-Feld. Das wird im V3-Read-Pfad bei JEDEM Request auf now gesetzt,
  // wodurch isBriefingStaleForBerlin nie "stale" meldete und der Kopf faelschlich
  // "Aktuell" zeigte, waehrend die Karte (HSTAND_STATUS_LABEL[currentHelmutState.status])
  // ehrlich "Nicht aktuell" meldete. Fehlt der State (Alt-/Nicht-V3-Pfad) -> bisheriger
  // generatedAt-Guard als Rueckfall (rueckwaertsverträglich).
  const state = briefing.currentHelmutState;
  const hasState = state && typeof state === "object" && typeof state.status === "string";
  const stale = hasState
    ? (state.staleState === true || state.status === "stale" || state.errorState === true || state.status === "error")
    : isBriefingStaleForBerlin(briefing);
  const hasDecisionItems = Number(briefing.items?.filter((item) => item.decision !== "Ignorieren").length || 0) > 0;
  const hasSituationalItems = Number(briefing.situationalBriefing?.length || 0) > 0;
  // "Aktuell" nur bei WIRKLICH frischem Stand — ein leerer/unvollstaendiger State
  // (empty) darf nie "Aktuell" ergeben (sonst Widerspruch zur Karte "Kein aktueller Stand").
  const fresh = hasState ? state.status === "fresh" : (hasDecisionItems || hasSituationalItems);
  const status = stale ? "Veraltet" : fresh ? "Aktuell" : "Keine neue Entscheidung";
  return {
    ...briefing,
    status,
    freshness: {
      status,
      isStale: stale,
      generatedAt: briefing.generatedAt || briefing.date || null,
      berlinDate: berlinDateKey(new Date()),
      reason: stale
        ? "Das Briefing stammt nicht aus dem aktuellen Berliner Tag oder ist älter als 18 Stunden."
        : hasDecisionItems
          ? "Das Briefing enthält aktuelle politische Entscheidungen."
          : hasSituationalItems
            ? "Die Quellen wurden geprüft; es gibt beobachtbare Entwicklungen, aber keinen akuten Handlungsdruck."
            : "Die Quellen wurden geprüft; es gibt aktuell keine belastbare neue Entscheidung."
    }
  };
}

function operationalStatus(crawl, briefing, storage, lageCheck = null, completeKoAt = null) {
  const crawlHealthy = isFullCrawlHealthy(crawl);
  const lageHealthy = isLageCheckFresh(lageCheck);
  // P1-5: Briefing "gesund" = verfügbar UND das jüngste verstandene Thema ist nicht
  // veraltet (echtes Signal statt generatedAt=now). Fällt nur bei echtem Stau (>36h).
  const briefingHealthy = Boolean(briefing && briefing.available) && !isOutputStale(completeKoAt);
  if (storage.backend !== "supabase") return "Achtung";
  if ((crawlHealthy || lageHealthy) && briefingHealthy) return "Bereit";
  if (crawl || lageCheck || briefing) return "Prüfen";
  return "Nicht eingerichtet";
}

function isFullCrawlHealthy(crawl) {
  const crawlAge = crawl?.createdAt ? Date.now() - new Date(crawl.createdAt).getTime() : Infinity;
  const checkedSources = Number(crawl?.checkedSources || 0);
  const failedSources = Number(crawl?.failedSources || 0);
  const successfulSources = Number(crawl?.successfulSources || 0);
  const crawlFailureRatio = checkedSources ? failedSources / checkedSources : 1;
  return Boolean(crawl) && crawlAge < maxFullCrawlAgeMs && checkedSources >= minCheckedSources && successfulSources >= minSuccessfulSources && crawlFailureRatio <= maxCrawlFailureRatio;
}

function isLageCheckFresh(lageCheck) {
  const checkedAt = lageCheck?.checkedAt || lageCheck?.createdAt;
  const age = checkedAt ? Date.now() - new Date(checkedAt).getTime() : Infinity;
  const checkedSources = Number(lageCheck?.checkedSources || 0);
  const failedSources = Number(lageCheck?.failedSources || 0);
  const failRatio = checkedSources ? failedSources / checkedSources : 1;
  return Boolean(lageCheck) && age < maxLageCheckAgeMs && checkedSources >= minLageCheckSources && failRatio <= maxCrawlFailureRatio;
}

function latestLageFreshnessDetail(crawl, lageCheck) {
  const parts = [];
  if (crawl?.createdAt) parts.push(`Vollcrawl: ${crawl.createdAt}`);
  if (lageCheck?.checkedAt || lageCheck?.createdAt) parts.push(`Lage-Check: ${lageCheck.checkedAt || lageCheck.createdAt}`);
  return parts.length ? parts.join(" · ") : "Noch keine Lageprüfung gespeichert.";
}

// V3-Datenmotor-Qualität: ersetzt die V2-referentEngine-Signale in Ops/Health/
// Release-Check. Bewertet den V3-Briefing-Zustand deterministisch aus available +
// decisionMetrics + Quellenlinks — ohne V2, ohne KI.
function v3BriefingQuality(briefing, evidenceQuality) {
  const available = Boolean(briefing && briefing.available);
  const dm = (briefing && briefing.decisionMetrics) || {};
  const total = Number(dm.total || 0);
  const react = Number(dm.react || 0);
  const situational = Array.isArray(briefing && briefing.situationalBriefing) ? briefing.situationalBriefing.length : 0;
  // Ruhelage: verstandene Vorgänge vorhanden, aber keine akute Reaktion nötig.
  const calmState = available && react === 0 && (total > 0 || situational > 0);
  const linksOk = Number(evidenceQuality?.missingLinks || 0) === 0 && Number(evidenceQuality?.publisherFallbacks || 0) === 0;
  let score = 0;
  if (available || calmState) score += 60;
  if (total > 0 || situational > 0) score += 20;
  if (linksOk) score += 20;
  score = Math.min(100, score);
  return {
    engine: "v3",
    status: score >= 90 ? "Pitchbereit" : score >= 70 ? "Prüfen" : "Aufbau",
    score,
    ready: score >= 90 || calmState,
    calmState,
    understoodVorgaenge: total,
    reactCount: react
  };
}

function backendHealth(crawl, briefing, debugReport, storage, storeSummary, evidenceQuality, motorQuality = null, learning = null, lageCheck = null, completeKoAt = null) {
  const checks = [];
  addBackendCheck(checks, "Persistenter Speicher", storage.backend === "supabase", storage.backend === "supabase" ? "Supabase ist aktiv." : "Helmut speichert noch lokal.");
  // P2-5: aktive Quellenbasis = relationale Quellenwahrheit (crawl.checkedSources), NICHT
  // der eingefrorene store.sources-Blob. Nach dem Cutover ist der Blob nur noch Fallback-
  // Katalog und wächst/schrumpft nicht mit Paketen/Wegen — er als Basiszahl wäre irreführend.
  const backendSourceMode = sourceMode();
  const activeSourceBase = effectiveActiveSourceCount({
    storeSourcesActive: storeSummary.sources?.active,
    crawlCheckedSources: crawl?.checkedSources,
    mode: backendSourceMode
  });
  // Ehrliches Label je Quelle der Zahl: im Cutover-Modus zählt der aktive Crawl
  // (crawl.checkedSources) — normalerweise der relationale Plan, bei Plan-Ladefehler aber
  // der Alt-Katalog-Fallback (scheduler.getSourcesForProfile). backendHealth kann die beiden
  // nicht unterscheiden, DARF also nicht "relationaler Plan" behaupten; "geprüfter Crawl" ist
  // die belegbare Wahrheit. Ohne Cutover zählt der alte Katalog-Blob ("Katalog-Basis").
  const sourceBaseLabel = backendSourceMode === "on" && Number(crawl?.checkedSources || 0) > 0 ? "geprüfter Crawl" : "Katalog-Basis";
  addBackendCheck(checks, "Quellenbasis", activeSourceBase >= minConfiguredSources, `${activeSourceBase} aktive Quellen (${sourceBaseLabel}).`);
  addBackendCheck(checks, "Raw Items", Number(storeSummary.rawItems?.total || 0) > 0, `${storeSummary.rawItems?.total || 0} Artikel gespeichert, ${storeSummary.rawItems?.last24h || 0} in den letzten 24 Stunden.`);

  const checkedSources = Number(crawl?.checkedSources || 0);
  const failedSources = Number(crawl?.failedSources || 0);
  const crawlFailureRatio = checkedSources ? failedSources / checkedSources : 1;
  addBackendCheck(checks, "Lage-Frische", isFullCrawlHealthy(crawl) || isLageCheckFresh(lageCheck), latestLageFreshnessDetail(crawl, lageCheck));
  addBackendCheck(checks, "Crawl-Qualität", checkedSources >= minCheckedSources && crawlFailureRatio <= maxCrawlFailureRatio, `${checkedSources} Quellen geprüft, ${failedSources} Fehler.`);

  const recommendationCount = Number(briefing?.personalizedRecommendations?.length || 0);
  const itemCount = Number(briefing?.items?.length || 0);
  const situationalCount = Number(briefing?.situationalBriefing?.length || 0);
  const calmState = Boolean(motorQuality?.calmState || situationalCount > 0);
  const hasDecisionValue = recommendationCount > 0 && itemCount > 0;
  // P1-5: Frische am jüngsten VERSTANDENEN Knowledge-Object messen, nicht an der
  // build-zeit-blinden `generatedAt` (die immer "jetzt" war → false-green).
  addBackendCheck(checks, "Briefing-Frische", Boolean(briefing?.available) && !isOutputStale(completeKoAt), completeKoAt ? `Jüngstes verstandenes Thema: ${completeKoAt}.` : "Noch kein verstandenes Thema gespeichert.");
  addBackendCheck(checks, "Demo-Freiheit", Boolean(briefing) && briefing.status !== "Demo", briefing?.status ? `Status: ${briefing.status}.` : "Kein Briefingstatus vorhanden.");
  addBackendCheck(checks, "Entscheidungswert", hasDecisionValue || calmState, hasDecisionValue ? `${recommendationCount} persönliche Empfehlungen, ${itemCount} sichtbare Entscheidungen.` : `${situationalCount} Beobachtungspunkte, keine neue Reaktion nötig.`);
  addBackendCheck(checks, "Quellenlinks", Number(evidenceQuality?.missingLinks || 0) === 0 && Number(evidenceQuality?.publisherFallbacks || 0) === 0, `${evidenceQuality?.directLinks || 0}/${evidenceQuality?.total || 0} Belege mit Direktlink.`);
  addBackendCheck(checks, "Datenmotor V3", Number(motorQuality?.score || 0) >= 70 || Boolean(motorQuality?.ready) || calmState, motorQuality ? `${motorQuality.status}: ${motorQuality.score}% (${motorQuality.understoodVorgaenge || 0} Vorgänge bewertet).` : "Stabile Lage ohne neue Handlungspflicht.");
  addBackendCheck(checks, "Lernmodus", Number(learning?.eventCount || 0) >= 1, learning?.eventCount ? `${learning.eventCount} Nutzungssignale gespeichert, Vertrauen ${learning.confidence}.` : "Noch keine Nutzungssignale gespeichert.");
  // P1-4: "Pipeline durchgelaufen" am LEBENDEN Crawl-Zeitstempel messen, nicht am
  // toten `pipelineDebugReports`-Marker (savePipelineDebugReport hat null Aufrufer →
  // alter Report hatte counts → falsch-grün). crawlRuns[0].createdAt lebt.
  const crawlPipelineAge = crawl?.createdAt ? Date.now() - new Date(crawl.createdAt).getTime() : Infinity;
  addBackendCheck(checks, "Pipeline-Debug", Boolean(crawl) && crawlPipelineAge < 2 * maxFullCrawlAgeMs, crawl?.createdAt ? `Letzter Pipeline-Lauf (Crawl): ${crawl.createdAt}.` : "Noch kein Pipeline-Lauf.");

  const passed = checks.filter((check) => check.ok).length;
  const total = checks.length || 1;
  const score = Math.round((passed / total) * 100);
  const failed = checks.filter((check) => !check.ok);
  return {
    status: score >= 90 ? "Gesund" : score >= 70 ? "Prüfen" : "Kritisch",
    score,
    passed,
    total,
    checks,
    nextActions: failed.slice(0, 3).map((check) => backendActionFor(check.id)),
    checkedAt: new Date().toISOString()
  };
}

function tenantStatus(politicianId) {
  const mode = process.env.HELMUT_TENANT_MODE || "pilot";
  const pilotGate = isPilotAccessConfigured();
  return {
    mode,
    activePoliticianId: politicianId,
    accessControl: pilotGate ? "pilot-gate" : "open",
    isolation: mode === "pilot" ? "single-pilot-profile" : "profile-scoped",
    multiTenantReady: mode !== "pilot" && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    nextStep: mode === "pilot"
      ? "Vor zahlenden Mandanten echte Auth, user_id Mapping und Supabase RLS aktivieren."
      : "Mandanten in Supabase pro user_id trennen und RLS erzwingen."
  };
}

function addBackendCheck(checks, label, ok, detail) {
  checks.push({
    id: label.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-|-$/g, ""),
    label,
    ok: Boolean(ok),
    detail
  });
}

function backendActionFor(checkId) {
  const actions = {
    "persistenter-speicher": "Supabase-Environment-Variablen prüfen und Storage-Modus auf supabase setzen.",
    "quellenbasis": "Quellenliste erweitern oder deaktivierte Quellen prüfen.",
    "raw-items": "Manuellen Crawl starten und prüfen, ob Artikel gespeichert werden.",
    "lage-frische": "Crawl-Route, Lage-Check oder Vercel Cron prüfen.",
    "crawl-frische": "Crawl-Route oder Vercel Cron prüfen.",
    "crawl-qualität": "Fehlgeschlagene Quellen im Pipeline-Debug ansehen.",
    "briefing-frische": "Morgenbriefing manuell starten oder Cron prüfen.",
    "demo-freiheit": "Live-Pipeline ausführen und Demo-Fallback ausblenden.",
    "entscheidungswert": "Relevanzfilter und aktuelle Quellenlage prüfen.",
    "quellenlinks": "URL-Resolver und Source Evidence prüfen.",
    "referentenmodus": "Briefing neu erzeugen und Empfehlungen auf direkte Ansprache, Handlung, Konsequenz und Quellenlink prüfen.",
    "lernmodus": "Der Nutzer sollte im Pilot Themen öffnen, markieren, ausblenden oder Kommunikation kopieren, damit Helmut Präferenzen lernt.",
    "pipeline-debug": "Pipeline einmal vollständig ausführen, damit ein Debug-Bericht gespeichert wird."
  };
  return actions[checkId] || "Backend-Check prüfen.";
}

function pilotReadiness(crawl, briefing, storage, evidenceQuality = null, lageCheck = null, completeKoAt = null) {
  const issues = [];
  const warnings = [];
  const checkedSources = Number(crawl?.checkedSources || 0);
  const failedSources = Number(crawl?.failedSources || 0);
  const successfulSources = Number(crawl?.successfulSources || 0);
  const recommendationCount = Array.isArray(briefing?.personalizedRecommendations) ? briefing.personalizedRecommendations.length : 0;
  const situationalCount = Array.isArray(briefing?.situationalBriefing) ? briefing.situationalBriefing.length : 0;
  // V3: Qualität kommt deterministisch aus dem V3-Datenmotor (kein V2-quality-Blob).
  const quality = briefing ? v3BriefingQuality(briefing, evidenceQuality) : null;
  const qualityScore = Number(quality?.score || 0);
  const calmState = Boolean(quality?.calmState || situationalCount > 0);

  if (storage.backend !== "supabase") issues.push("Supabase ist nicht aktiv.");
  if (!isAiEnabled()) warnings.push("OpenAI ist nicht aktiv. Helmut läuft dann weniger persönlich.");
  if (!crawl) {
    issues.push("Es gibt noch keinen Quellenlauf.");
  } else {
    if (!isFullCrawlHealthy(crawl) && !isLageCheckFresh(lageCheck)) issues.push("Es gibt keine frische Lageprüfung im Tagesverlauf.");
    if (checkedSources < minCheckedSources) issues.push("Es werden zu wenige Quellen geprüft.");
    if (checkedSources && failedSources / checkedSources > maxCrawlFailureRatio) issues.push("Mehr als 10 Prozent der Quellen sind fehlgeschlagen.");
    if (successfulSources < minSuccessfulSources) warnings.push("Die erfolgreiche Quellenbasis ist noch dünn.");
  }
  if (!briefing) {
    issues.push("Es gibt noch kein Briefing.");
  } else {
    // P1-5: echter Stau statt build-zeit-blinder generatedAt (>36h ohne neues
    // verstandenes Thema trotz Crawl). Ruhige Tage bleiben grün.
    if (isOutputStale(completeKoAt)) issues.push("Das letzte Briefing ist veraltet.");
    if (recommendationCount < 1 && !calmState) issues.push("Das Briefing enthält keine persönliche Empfehlung.");
    if (!quality) warnings.push("Die Briefingqualität wurde noch nicht geprüft.");
    if (quality && qualityScore < 90 && !calmState) issues.push("Die Briefingqualität ist noch nicht pitchbereit.");
  }
  if (!process.env.CRON_SECRET) warnings.push("CRON_SECRET ist nicht gesetzt: Cron-Routen sind aus Sicherheitsgründen deaktiviert (503). Bitte CRON_SECRET in Vercel setzen, damit crawl/pipeline/briefing/health laufen.");
  if (evidenceQuality?.missingLinks > 0) issues.push("Mindestens ein sichtbarer Beleg hat keinen präzisen Artikellink.");
  if (evidenceQuality?.publisherFallbacks > 0) issues.push("Mindestens ein sichtbarer Beleg hat nur eine Publisher-Startseite statt eines Artikellinks.");

  const ready = issues.length === 0;
  return {
    status: ready ? "Pilotbereit" : "Nicht pilotbereit",
    ready,
    score: readinessScore(issues, warnings),
    issues,
    warnings,
    checkedAt: new Date().toISOString()
  };
}

function releaseCheck({ crawl, briefing, storage, storeSummary, evidenceQuality, backend, readiness, learning, radarArchive, lageCheck, completeKoAt = null }) {
  const checks = [];
  // P2-5: Lage-Frische misst die CRAWL-Breite (geprüfte Quellen), nicht den eingefrorenen
  // store.sources-Blob. Kein Blob-Fallback mehr: ohne Crawl ist die Breite 0 (fällt ehrlich
  // durch), statt einen alten Katalog-Zählwert als Frische auszugeben.
  const sourceCount = Number(crawl?.checkedSources || 0);
  const failedSources = Number(crawl?.failedSources || 0);
  const failRatio = sourceCount ? failedSources / sourceCount : 1;
  const visibleDecisionCount = Number((briefing?.items || []).filter((item) => item.decision !== "Ignorieren").length);
  const recommendationCount = Number(briefing?.personalizedRecommendations?.length || 0);
  const situationalCount = Number((briefing?.situationalBriefing || []).length);
  const hasDecisionOrCompetentCalm = visibleDecisionCount > 0 && recommendationCount > 0 || situationalCount > 0;
  const liveFlow = releaseLiveFlow({ crawl, briefing, evidenceQuality, storage, radarArchive });
  const lageFresh = isFullCrawlHealthy(crawl) || isLageCheckFresh(lageCheck);

  addReleaseCheck(checks, "Lage-Frische", Boolean(crawl) && lageFresh && sourceCount >= minCheckedSources && failRatio <= maxCrawlFailureRatio, crawl ? `${sourceCount} Quellen geprüft, ${failedSources} Fehler. ${latestLageFreshnessDetail(crawl, lageCheck)}.` : "Noch kein Crawl.");
  addReleaseCheck(checks, "Supabase", storage?.backend === "supabase", storage?.backend === "supabase" ? "Persistenter Speicher aktiv." : "Speicher ist lokal.");
  addReleaseCheck(checks, "OpenAI", isAiEnabled(), isAiEnabled() ? `Modell ${activeModelName()} aktiv.` : "OpenAI ist nicht aktiv.");
  // P1-5: Briefing-Frische am jüngsten verstandenen Thema (real), nicht generatedAt.
  addReleaseCheck(checks, "Briefing", Boolean(briefing) && !isOutputStale(completeKoAt) && hasDecisionOrCompetentCalm && briefing.status !== "Demo", briefing ? `${visibleDecisionCount} Entscheidungen, ${recommendationCount} Empfehlungen, ${situationalCount} Beobachtungspunkte.` : "Kein Briefing.");
  addReleaseCheck(checks, "Quellenlinks", Number(evidenceQuality?.missingLinks || 0) === 0 && Number(evidenceQuality?.publisherFallbacks || 0) === 0, `${evidenceQuality?.directLinks || 0}/${evidenceQuality?.total || 0} sichtbare Belege mit Direktlink.`);
  addReleaseCheck(checks, "Radar", Array.isArray(briefing?.personMentions) && Array.isArray(radarArchive?.articles), `${briefing?.personMentions?.length || 0} neue Personenartikel, ${radarArchive?.total || 0} Archivartikel.`);
  const releaseMotor = v3BriefingQuality(briefing, evidenceQuality);
  addReleaseCheck(checks, "Datenmotor V3", releaseMotor.score >= 70 || releaseMotor.calmState || Number(backend?.score || 0) >= 90, `${releaseMotor.status}: ${releaseMotor.score}% (${releaseMotor.understoodVorgaenge} Vorgänge bewertet).`);
  addReleaseCheck(checks, "Live-Flow", liveFlow.ready, liveFlow.summary);

  const passed = checks.filter((check) => check.ok).length;
  const total = checks.length || 1;
  const score = Math.round((passed / total) * 100);
  const blockers = checks.filter((check) => !check.ok).map((check) => `${check.label}: ${check.detail}`);
  return {
    status: blockers.length ? "Nicht pitchbereit" : "Pitchbereit",
    ready: blockers.length === 0,
    score,
    passed,
    total,
    checks,
    blockers,
    warnings: readiness?.warnings || [],
    liveFlow,
    learning: {
      status: learning?.status || "Bereit",
      eventCount: learning?.eventCount || 0
    },
    checkedAt: new Date().toISOString()
  };
}

function releaseLiveFlow({ crawl, briefing, evidenceQuality, storage, radarArchive }) {
  const visibleDecisions = (briefing?.items || []).filter((item) => item.decision !== "Ignorieren");
  const tasks = (briefing?.tasks || []).filter((task) => task.status !== "done");
  const hasOfficeHandoff = visibleDecisions.length === 0 || tasks.some((task) => sourceEvidenceQuality({ items: [], personalizedRecommendations: [], personMentions: [], tasks: [task] }).directLinks > 0);
  const steps = [
    {
      id: "crawl",
      label: "Crawl starten",
      ok: Boolean(crawl) && Number(crawl.checkedSources || 0) >= minCheckedSources,
      detail: crawl ? `${crawl.checkedSources || 0} Quellen.` : "Kein Crawl."
    },
    {
      id: "briefing",
      label: "Briefing erzeugen",
      ok: Boolean(briefing) && briefing.status !== "Demo" && (visibleDecisions.length > 0 || Number(briefing?.situationalBriefing?.length || 0) > 0),
      detail: briefing ? `${visibleDecisions.length} Entscheidungen, ${briefing.situationalBriefing?.length || 0} Beobachtungen.` : "Kein Briefing."
    },
    {
      id: "radar",
      label: "Radar prüfen",
      ok: Array.isArray(briefing?.personMentions) && Array.isArray(radarArchive?.articles),
      detail: `${briefing?.personMentions?.length || 0} neue Personenartikel, ${radarArchive?.total || 0} Archivartikel.`
    },
    {
      id: "sources",
      label: "Quellen öffnen",
      ok: Number(evidenceQuality?.missingLinks || 0) === 0 && Number(evidenceQuality?.publisherFallbacks || 0) === 0 && Number(evidenceQuality?.directLinks || 0) > 0,
      detail: `${evidenceQuality?.directLinks || 0} präzise Direktlinks.`
    },
    {
      id: "office",
      label: "Büro-Übergabe",
      ok: hasOfficeHandoff,
      detail: visibleDecisions.length === 0 ? "Nicht nötig, weil keine Entscheidung anliegt." : "Übergabe mit Quellenbasis möglich."
    },
    {
      id: "communication",
      label: "Statement generieren",
      ok: isAiEnabled() && (visibleDecisions.length > 0 || Number(briefing?.situationalBriefing?.length || 0) > 0),
      detail: isAiEnabled() ? "OpenAI aktiv." : "OpenAI nicht aktiv."
    },
    {
      id: "storage",
      label: "Daten persistent",
      ok: storage?.backend === "supabase",
      detail: storage?.backend === "supabase" ? "Supabase aktiv." : "Lokaler Speicher."
    }
  ];
  const failed = steps.filter((step) => !step.ok);
  return {
    ready: failed.length === 0,
    summary: failed.length ? `${steps.length - failed.length}/${steps.length} Live-Schritte grün.` : "Crawl, Briefing, Radar, Quellen, Büro, Kommunikation und Speicher grün.",
    steps
  };
}

function addReleaseCheck(checks, label, ok, detail) {
  checks.push({
    label,
    ok: Boolean(ok),
    detail
  });
}

function readinessScore(issues, warnings) {
  return Math.max(0, Math.min(100, 100 - issues.length * 25 - warnings.length * 8));
}

async function computeReleaseCheck(politicianId) {
  politicianId = tenantContext.requireTenantId(politicianId, "computeReleaseCheck");
  const profile = await activeProfile(politicianId);
  const latestCrawl = await getLatestCrawlRun();
  const latestLageCheck = await getLatestLageCheck(politicianId);
  // V3: Release-Check bewertet das frisch erzeugte V3-Briefing (kein V2-Blob).
  const v3Briefing = await buildV3Briefing(profile, politicianId);
  const latestDebug = await getLatestPipelineDebugReport(politicianId);
  const latestCompleteKoAt = await getLatestCompleteKnowledgeObjectAt();
  const storage = getStorageStatus();
  const storeSummary = await getStoreSummary(politicianId);
  const evidenceQuality = sourceEvidenceQuality(v3Briefing);
  const radarArchive = await getRadarArchive(profile, 92);
  const learning = buildLearningProfile(await getInteractions(politicianId));
  const motorQuality = v3BriefingQuality(v3Briefing, evidenceQuality);
  const backend = backendHealth(latestCrawl, v3Briefing, latestDebug, storage, storeSummary, evidenceQuality, motorQuality, learning, latestLageCheck, latestCompleteKoAt);
  const readiness = pilotReadiness(latestCrawl, v3Briefing, storage, evidenceQuality, latestLageCheck, latestCompleteKoAt);
  return releaseCheck({
    crawl: latestCrawl,
    lageCheck: latestLageCheck,
    briefing: v3Briefing,
    completeKoAt: latestCompleteKoAt,
    storage,
    storeSummary,
    evidenceQuality,
    backend,
    readiness,
    learning,
    radarArchive
  });
}

function publicReleasePayload(release) {
  return {
    status: release.status,
    ready: release.ready,
    score: release.score,
    checkedAt: release.checkedAt,
    checks: (release.checks || []).map((check) => ({
      label: check.label,
      ok: check.ok,
      // SICHERHEIT: /api/release/public ist bewusst unauthentifiziert (externes
      // Monitoring/Smoke). Der OpenAI-Check-Detailtext enthaelt im aktiven Zustand
      // den konkreten Modellnamen ("Modell <model> aktiv.") — der darf oeffentlich
      // NICHT sichtbar sein (Modell-/Vendor-Preisgabe an anonyme Aufrufer). Public
      // erhaelt nur den neutralen Aktiv-Status; alle anderen Checks bleiben unveraendert.
      detail: check.label === "OpenAI" ? (check.ok ? "aktiv." : "nicht aktiv.") : check.detail
    })),
    liveFlow: {
      ready: release.liveFlow?.ready || false,
      summary: release.liveFlow?.summary || "",
      steps: (release.liveFlow?.steps || []).map((step) => ({
        label: step.label,
        ok: step.ok,
        detail: step.detail
      }))
    },
    blockers: release.blockers || [],
    warnings: release.warnings || []
  };
}

// Operativer Morgen-Health-Report (fuer WhatsApp). Bewusst pragmatisch: prueft echte
// Betriebssignale (Crawl/Briefing frisch, Speicher aktiv, Fehler-Spike) statt des
// strengen Pitch-Gates, plus Engagement aus dem Nutzungs-Tracking.
async function buildHealthReport(politicianId) {
  politicianId = tenantContext.requireTenantId(politicianId, "buildHealthReport");
  // V3: Health-Report bewertet das frisch erzeugte V3-Briefing (kein V2-Blob).
  // P1-4/P1-5: Betriebszustand kommt jetzt aus dem Zwei-Achsen-Zustandsmodell
  // (lib/helmut/watchdog-state.js) auf Basis LEBENDER Zeitstempel — NICHT mehr
  // aus dem toten `pipelineDebugReports`-Marker und NICHT mehr aus der
  // build-zeit-blinden Briefing-`generatedAt`.
  const profile = await activeProfile(politicianId);
  const [lageCheck, briefing, completeKoAt, prevState, storeSummary, errors, users, feedback, pushEvents, llmBreakdown, classificationCoverage, recentCrawlRuns] = await Promise.all([
    getLatestLageCheck(politicianId),
    buildV3Briefing(profile, politicianId),
    getLatestCompleteKnowledgeObjectAt(), // OUTPUT-Frische: jüngstes verstandenes Thema (real)
    getLatestWatchdogState(politicianId), // für Recovery-Hysterese (Erholt)
    getStoreSummary(politicianId),
    accounts.listSystemErrors(100),
    accounts.listUsers(),
    listFeedback(200),
    listPushEvents(politicianId, 200),
    // P1-6: KI-Budget-Ausschöpfung + Klassifikationsabdeckung (fail-safe).
    getLlmUsageBreakdownToday().catch(() => null),
    getClassificationCoverage().catch(() => null),
    // Härtungs-Sprint: rollierende Crawl-Betrachtung (24-h-Fenster) statt
    // Nur-jüngster-Lauf — transiente Störungen bleiben sichtbar (B1-Lücke).
    // N1 (2026-07-25): 10 -> 20 angeglichen an die drei anderen Aufrufstellen
    // (scheduler.js, server.js:4816/5188) und an CRAWL_RUN_RETENTION (storage.js,
    // Default 20). Bei >10 aktiven Mandaten in einem Cron-Durchlauf fiel der
    // einzige NICHT reduzierte Lauf (isReducedRun, Zeile weiter unten) aus dem
    // 10er-Fenster — der Report griff dann auf einen reduzierten Lauf zurueck und
    // meldete faelschlich "Teilweise gestoert" (P2-1, adversarialer Merge-Review).
    listCrawlRuns(20).catch(() => [])
  ]);
  // Basis-Lauf für die Frische-/Qualitätsachsen: der jüngste NICHT bewusst
  // google-übersprungene Lauf. Ein 'crawl-abstand'-Skip-Lauf (successful ~5 von
  // 145) würde die absoluten Watchdog-Minima (minSuccessfulSources) sonst
  // fälschlich reißen — er ist eine Schutzmaßnahme, keine Störung (Review-Fix).
  // Ein Extra-Store-Read entfällt: der jüngste Lauf steckt in recentCrawlRuns.
  // Incident 2026-07-25 (Erweiterung): auch Läufe, deren geteilte Abrufwege bereits
  // ein anderes Mandat geholt hat, sind bewusst REDUZIERT und beschreiben die
  // Datenzufuhr nicht. Ohne diese Ergänzung bewertete der Report immer den zuletzt
  // gelaufenen Mandanten (alphabetisch letzter) statt des Laufs, der die Daten
  // tatsächlich geholt hat — und meldete dauerhaft "Datenzufuhr verzögert".
  const crawl = (recentCrawlRuns || []).find((r) => !rollingHealth.isReducedRun(r)) || (recentCrawlRuns || [])[0] || null;
  const storage = getStorageStatus();
  const now = Date.now();
  const ageMs = (t) => (t ? now - new Date(t).getTime() : null);
  const hoursSince = (t) => { const a = ageMs(t); return a == null ? null : a / 3600000; };
  const fmtAge = (h) => h == null ? "nie" : h < 1 ? "gerade" : h < 48 ? `vor ${Math.round(h)}h` : `vor ${Math.round(h / 24)}T`;
  const day = 24 * 3600000;

  // INGEST: echter Crawl-Zeitstempel (crawlRuns[0].createdAt lebt).
  const crawlH = hoursSince(crawl?.checkedAt || crawl?.createdAt);
  const lageH = hoursSince(lageCheck?.checkedAt || lageCheck?.createdAt);
  // OUTPUT: jüngstes complete-KO statt generatedAt=now (schließt false-green).
  const completeKoH = hoursSince(completeKoAt);
  const briefingItems = Array.isArray(briefing?.items) ? briefing.items.length : 0;
  const checked = Number(crawl?.checkedSources || 0);
  const failed = Number(crawl?.failedSources || 0);
  const successful = Number(crawl?.successfulSources || 0);
  const errors24 = (errors || []).filter((e) => e.createdAt && (now - new Date(e.createdAt).getTime()) < day).length;
  const feedback24 = (feedback || []).filter((f) => f.createdAt && (now - new Date(f.createdAt).getTime()) < day).length;
  const pushSent24 = (pushEvents || []).filter((e) => e.createdAt && (now - new Date(e.createdAt).getTime()) < day && Number(e.delivered) > 0).length;
  const active7 = (users || []).filter((u) => {
    const seen = u.lastSeenAt || u.lastLoginAt;
    return seen && (now - new Date(seen).getTime()) < 7 * day;
  }).length;

  const classification = classifyOperationalState({
    storageOk: storage.backend === "supabase",
    ingest: {
      crawlAgeMs: ageMs(crawl?.checkedAt || crawl?.createdAt),
      checkedSources: checked,
      successfulSources: successful,
      failureRatio: checked ? failed / checked : 1,
      rawItems24h: Number(storeSummary?.rawItems?.last24h || 0)
    },
    output: {
      available: Boolean(briefing?.available),
      newestCompleteKoAgeMs: ageMs(completeKoAt),
      reactCount: Number(briefing?.decisionMetrics?.react || 0),
      situationalCount: Array.isArray(briefing?.situationalBriefing) ? briefing.situationalBriefing.length : 0
    },
    lageAgeMs: ageMs(lageCheck?.checkedAt || lageCheck?.createdAt),
    errors24,
    previousState: prevState?.state || null
  }, {
    // Server-Schwellen (ENV-überschreibbar) statt Modul-Defaults → konsistent
    // mit isFullCrawlHealthy/isLageCheckFresh/Release-Check.
    crawlFreshMs: maxFullCrawlAgeMs,
    crawlWarnMs: 2 * maxFullCrawlAgeMs,
    outputFreshMs: 24 * 60 * 60 * 1000,
    outputWarnMs: maxOutputFreshnessMs,
    // Am Cron-Takt gemessen (siehe watchdogLageFreshMs), nicht an der In-App-Frische.
    lageFreshMs: watchdogLageFreshMs,
    lageWarnMs: Math.max(2 * maxFullCrawlAgeMs, watchdogLageFreshMs + 2 * 60 * 60 * 1000),
    minCheckedSources,
    minSuccessfulSources,
    maxFailureRatio: maxCrawlFailureRatio
  });
  const ok = classification.ok;

  // P1-6: KI-Budget-, Leerlauf-, Quellenfrische- und Klassifikationsabdeckungs-Achse.
  const budget = healthAxes.budgetAxis(llmBreakdown || {});
  // Review-Fix: der Leerlauf-Alarm nutzt die DEFERRED-Zahl DESSELBEN Crawls
  // (budget-verdrängte Cluster in genau diesem Lauf), NICHT den globalen Tages-Skip-
  // Zähler — sonst kippt der (immer-aktive) Health-Report an gewöhnlichen Tagen auf
  // ok=false (processed=0 im Eager-Pfad + irgendwelche Tages-Skips = Fehlalarm).
  const idle = healthAxes.idleAxis({
    analyzed: crawl?.understanding?.processed,
    newRawDocuments: crawl?.newRawDocuments,
    skips: crawl?.understanding?.deferred
  });
  const coverage = healthAxes.coverageAxis(classificationCoverage);
  const freshness = healthAxes.sourceFreshnessAxis({
    crawlAgeMs: ageMs(crawl?.checkedAt || crawl?.createdAt),
    checked, failed, maxAgeMs: 28 * 3600000, maxFailureRatio: maxCrawlFailureRatio
  });
  const axes = healthAxes.combineHealthAxes({ budget, idle, coverage, freshness });

  // Härtungs-Sprint: rollierende Crawl-Gesundheit. Ein stark degradierter Lauf im
  // 24-h-Fenster verschwindet nicht mehr, nur weil der jüngste Lauf gesund war.
  const rollingCrawl = rollingHealth.buildRollingCrawlHealth({ runs: recentCrawlRuns, nowMs: now });
  const fmtRun = (r) => r ? `${r.failedSources}/${r.checkedSources} Fehler${r.runId ? `, ${String(r.runId).slice(0, 40)}` : ""}` : "";
  const rollingLine = rollingCrawl.status === "aktuell-gesund"
    ? null
    : rollingCrawl.status === "gesund-mit-stoerung-im-zeitraum"
      ? `🟡 Crawl-Störung im 24h-Fenster: ${rollingCrawl.worstRun?.state} (${fmtRun(rollingCrawl.worstRun)}) — inzwischen erholt ⚠️`
      : rollingCrawl.status === "wiederholt-degradiert"
        ? `🔴 Crawls wiederholt degradiert: ${rollingCrawl.degradedRuns}/${rollingCrawl.windowRuns} Läufe im Fenster (schlechtester: ${fmtRun(rollingCrawl.worstRun)})`
        : rollingCrawl.status === "aktuell-degradiert"
          ? `🔴 Jüngster Crawl degradiert: ${rollingCrawl.latestState} (${fmtRun(rollingCrawl.worstRun)})`
          : `⚪ Crawl-Verlauf: Datenlage unbekannt`;

  // Betriebszustand persistieren (fail-safe) — ermöglicht Recovery-Erkennung.
  await saveWatchdogState(politicianId, classification.state);

  const engagement = `👤 ${active7} aktiv (7T) · 💬 ${feedback24} Feedback · 📲 ${pushSent24} Push (24h)`;

  // Cron-Vollständigkeit (Audit-Folgebranch): macht sichtbar, wenn eine
  // INFRASTRUKTUR-Cron ausgefallen ist. Nutzt die bereits geladenen LEBENDEN
  // Frische-Zeitstempel — keine neue Speicherarchitektur.
  // WICHTIG: nur Crons prüfen, die UNABHÄNGIG vom Nachrichtenaufkommen laufen
  // müssen — Crawl (2×/Tag, prüft immer Quellen) und Lage-Check (1×/Tag). Die
  // Understanding-OUTPUT-Frische (jüngstes complete-KO) wird BEWUSST NICHT hart
  // gegatet: an einem ruhigen Nachrichtentag entsteht legitim kein neues
  // verstandenes KO — das wäre ein Fehlalarm. Die Output-Frische bewertet ohnehin
  // classifyOperationalState (warn/stale, nicht hart). Understanding erscheint nur
  // informativ in der Zeile.
  const cronChecks = [
    { name: "Crawl", h: crawlH, maxH: 28, hardGate: true },
    { name: "Lage-Check", h: lageH, maxH: 28, hardGate: true }
  ];
  const overdueCrons = cronChecks.filter((c) => c.h == null || c.h > c.maxH);
  const cronLine = overdueCrons.length
    ? `⏰ Cron überfällig: ${overdueCrons.map((c) => `${c.name} (${fmtAge(c.h)})`).join(", ")} · Verstanden zuletzt: ${fmtAge(completeKoH)}`
    : `⏰ Crawl/Lage-Cron aktuell · Verstanden zuletzt: ${fmtAge(completeKoH)}`;

  // Google-News-Auflösungsquote (Audit-Folgebranch): SPOF-Frühwarnung. Bricht
  // Googles URL-Auflösung ein, "gelingt" der Crawl weiter, aber Links kippen
  // still zu Proxy/leer. <50% aufgelöst bei nennenswertem Volumen = Warnsignal.
  const gnr = crawl?.googleUrlResolution || null;
  const gnrRate = gnr && gnr.attempted > 0 ? gnr.resolved / gnr.attempted : null;
  const gnrLine = gnr && gnr.attempted > 0
    ? `🔗 Google-News-Links: ${Math.round(gnrRate * 100)}% aufgelöst (${gnr.resolved}/${gnr.attempted})${gnrRate < 0.5 ? " ⚠️ niedrig" : ""}`
    : null;
  const gnrDegraded = gnrRate != null && gnrRate < 0.5 && gnr.attempted >= 10;

  const text = [
    describeState(classification),
    "",
    `Crawl: ${fmtAge(crawlH)} (${checked} Quellen, ${failed} Fehler) · Lage: ${fmtAge(lageH)}`,
    `Briefing: ${briefingItems} Einträge · Verstanden zuletzt: ${fmtAge(completeKoH)} · Fehler (24h): ${errors24}`,
    cronLine,
    ...(rollingLine ? [rollingLine] : []),
    ...(gnrLine ? [gnrLine] : []),
    // P1-6: KI-Budget-Ausschöpfung (Calls/Limit/Rest/Skips) + Leerlauf-Warnung.
    budget.limit != null
      ? `🧮 KI-Budget: ${budget.calls}/${budget.limit} genutzt · Rest ${budget.remaining} · Skips ${budget.skips}${budget.exhausted ? " ⚠️ erschöpft" : (budget.status === "knapp" ? " ⚠️ knapp" : "")}`
      : `🧮 KI-Budget: ${budget.calls} Calls · Skips ${budget.skips} (kein Limit gesetzt)`,
    ...(idle.idle ? [`🕳️ Leerlauf: neue Dokumente, aber 0 verstanden (Budget übersprang Arbeit) ⚠️`] : []),
    // P1-6: Klassifikationsabdeckung (WARN-only, steigt mit dem Backfill P1-1).
    ...(coverage.available ? [`🏷️ Klassifikationsabdeckung: ${Math.round((coverage.levelCoverage || 0) * 100)}% mit Ebene (${coverage.withLevel}/${coverage.total})${coverage.warn ? " ⚠️ niedrig" : ""}`] : []),
    engagement
  ].join("\n");

  return {
    // P1-6: Budget-Erschöpfung ODER Leerlauf kippen ok (harte Alarm-Gründe);
    // Abdeckung/Quellenfrische sind WARN-Signale (kippen ok nicht).
    // Härtungs-Sprint: rollierende Crawl-Betrachtung — aktuell/wiederholt
    // degradiert = Alarm (kippt ok); eine einmalige, selbst-erholte Störung im
    // Fenster = Warnung (sichtbar in Text + Payload, kippt ok nicht — dokumentierte
    // Empfehlung gegen Fehlalarm-Müdigkeit, siehe health_report_rollierend.md).
    ok: ok && overdueCrons.length === 0 && !gnrDegraded && axes.ok && rollingCrawl.alertLevel !== "alarm",
    text,
    state: classification.state,
    severity: classification.severity,
    overdueCrons: overdueCrons.map((c) => c.name),
    rollingCrawl,
    googleUrlResolution: gnr,
    googleUrlResolutionRate: gnrRate,
    // P1-6: strukturierte Achsen für Watchdog/Admin (nur technische Zähler).
    budget,
    idle,
    classificationCoverage: coverage,
    sourceFreshness: freshness,
    healthBlockers: axes.blockers,
    healthWarnings: axes.warnings,
    active7,
    feedback24,
    errors24,
    briefingItems,
    pushSent24
  };
}

// WhatsApp-Versand via CallMeBot (kostenloser Self-Notify-Dienst). Zugangsdaten
// kommen ausschliesslich aus Env-Variablen (CALLMEBOT_PHONE, CALLMEBOT_APIKEY).
// Zweiter, unabhängiger Alarmkanal (Audit-Folgebranch): POST des Health-Reports
// an einen generischen Webhook (HELMUT_MONITORING_WEBHOOK_URL). Kompatibel mit
// Slack/Discord/Zapier/E-Mail-Relais (Feld "text" + strukturierte Zusatzfelder).
// Fail-safe: fehlt die URL → sauber übersprungen; Netzfehler brechen den Cron nie.
async function sendMonitoringWebhook(report) {
  // Härtungs-Sprint (F5-Vorbereitung): Zustellung über das gehärtete Modul —
  // stabile Ereigniskennung (Dedupe), begrenzter Retry mit Backoff, persistierter
  // Zustellstatus, Heartbeat-Kennzeichnung. Payload weiterhin AUSSCHLIESSLICH
  // über buildAlarmPayload (Allowlist + Redaction — P1-7-Leitplanke). Ohne
  // HELMUT_MONITORING_WEBHOOK_URL bleibt alles ein sauberer No-Op (F5 inaktiv).
  try {
    return await monitoringWebhook.deliverMonitoringWebhook(report, {
      loadState: getMonitoringDeliveryState,
      saveState: saveMonitoringDeliveryState
    });
  } catch (error) {
    // Fail-safe: der Health-Cron darf an einem Webhook-Fehler nie scheitern.
    return { sent: false, reason: error && error.message };
  }
}

async function sendCallMeBotMessage(text) {
  const phone = String(process.env.CALLMEBOT_PHONE || "").replace(/[^\d]/g, "");
  const apikey = String(process.env.CALLMEBOT_APIKEY || "").trim();
  if (!phone || !apikey) return { sent: false, skipped: true, reason: "CALLMEBOT_PHONE/CALLMEBOT_APIKEY nicht gesetzt." };
  const endpoint = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  try {
    const res = await fetch(endpoint, { method: "GET" });
    const body = await res.text().catch(() => "");
    return { sent: res.ok, status: res.status, body: body.slice(0, 200) };
  } catch (error) {
    return { sent: false, reason: error && error.message };
  }
}

function sourceEvidenceQuality(briefing) {
  const sources = collectBriefingSources(briefing);
  const unique = new Map();
  sources.forEach((source) => {
    const key = [source.sourceName, source.itemUrl || source.url, source.sourceUrl].filter(Boolean).join("|");
    if (key) unique.set(key, source);
  });
  const allEntries = Array.from(unique.values());
  const entries = allEntries.filter((source) => [source.itemUrl, source.url].some((url) => isDirectArticleUrl(url, source)));
  let directLinks = 0;
  let publisherFallbacks = 0;
  let missingLinks = 0;
  const weakSamples = [];

  entries.forEach((source) => {
    const directUrl = [source.itemUrl, source.url].find((url) => isDirectArticleUrl(url, source));
    const publisherUrl = isUsablePublicUrl(source.sourceUrl) ? source.sourceUrl : "";
    if (directUrl) {
      directLinks += 1;
      return;
    }
    if (publisherUrl) {
      publisherFallbacks += 1;
      if (weakSamples.length < 3) weakSamples.push(source.sourceName || "Quelle");
      return;
    }
    missingLinks += 1;
    if (weakSamples.length < 3) weakSamples.push(source.sourceName || "Quelle");
  });

  return {
    total: entries.length,
    hiddenWeakSources: allEntries.length - entries.length,
    directLinks,
    publisherFallbacks,
    missingLinks,
    directRatio: entries.length ? Math.round((directLinks / entries.length) * 100) : 0,
    status: missingLinks || publisherFallbacks ? "Präzise Links fehlen" : "Belastbar",
    weakSamples
  };
}

// V3-Radar: personenscharfe Signale aus knowledge_objects (server-seitig
// klassifiziert, kein Client-Scoring, kein V2-rawItems-Archiv). Fehlt der V3-Store,
// liefert die Engine einen expliziten Leerzustand (kein V2-Fallback). Das Feld
// `articles` trägt die V3-Signale (jedes mit signalType) — der Client rendert nur.
async function getRadarArchive(profile, _days = 92) {
  const radar = require("./lib/helmut/radar");
  const result = await radar.buildRadarForUser({ profile, limit: 60 });
  return {
    politicianId: profile.id,
    generatedAt: result.generatedAt || new Date().toISOString(),
    total: result.total || 0,
    articles: result.signals || [],
    buckets: result.buckets || { risk: [], demand: [], chance: [], warning: [], mention: [] },
    available: !result.skipped,
    reason: result.reason || null
  };
}

function collectBriefingSources(briefing) {
  if (!briefing) return [];
  return [
    ...(briefing.items || []).flatMap((item) => item.sources || [item.primarySource].filter(Boolean)),
    ...(briefing.personalizedRecommendations || []).flatMap((item) => item.sources || [item.primarySource].filter(Boolean)),
    ...(briefing.personMentions || []),
    ...(briefing.tasks || []).flatMap((task) => task.sources || [task.primarySource].filter(Boolean))
  ].filter(Boolean);
}

function isDirectArticleUrl(value, source = {}) {
  if (source?.linkType && source.linkType !== "direct") return false;
  return isUsablePublicUrl(value) && !isGoogleArticleProxy(value) && !isLikelyPublisherHomepage(value, source);
}

function isUsablePublicUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    if (hostname.includes("example.local")) return false;
    if (hostname.includes("google-analytics.com") || hostname.includes("googletagmanager.com")) return false;
    if (hostname.includes("googleapis.com") || hostname.includes("googleadservices.com") || hostname.includes("googlesyndication.com")) return false;
    if (hostname.includes("gstatic.com") || hostname.includes("googleusercontent.com")) return false;
    if (hostname === "w3.org" || hostname === "www.w3.org") return false;
    return !/\.(js|css|png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(pathname);
  } catch {
    return false;
  }
}

function isGoogleArticleProxy(value) {
  try {
    const hostname = new URL(String(value || "")).hostname.toLowerCase();
    return hostname.includes("news.google.") || hostname === "news.google.com";
  } catch {
    return false;
  }
}

function isLikelyPublisherHomepage(value, source = {}) {
  try {
    const parsed = new URL(String(value || ""));
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || path.split("/").filter(Boolean).length === 0) return true;
    const sourceUrl = source.sourceUrl ? new URL(String(source.sourceUrl)) : null;
    if (sourceUrl && parsed.hostname === sourceUrl.hostname && parsed.pathname.replace(/\/+$/, "") === sourceUrl.pathname.replace(/\/+$/, "")) return true;
    return false;
  } catch {
    return false;
  }
}

function hasAdminBypass(request, url) {
  const secret = process.env.HELMUT_ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : allowQuerySecrets()
      ? url.searchParams.get("secret")
      : "";
  return Boolean(token) && timingSafeEqual(token, secret);
}

function allowQuerySecrets() {
  return String(process.env.HELMUT_ALLOW_QUERY_SECRETS || "").trim().toLowerCase() === "true";
}

// Fallback-Secret NUR falls kein einziges echtes Secret konfiguriert ist (z.B. reiner
// lokaler Dev-Betrieb ohne jede Env-Variable). SICHERHEIT: frueher ein hartkodierter,
// im Quellcode oeffentlich sichtbarer String ("helmut-local-csrf") — damit haette jeder,
// der den Code kennt, gueltige CSRF-Tokens offline faelschen koennen, sobald ein
// Deployment versehentlich ganz ohne PILOT_SECRET/CRON_SECRET/HELMUT_ADMIN_SECRET laeuft.
// Stattdessen jetzt ein zufaelliges Prozess-Secret (einmal pro kaltem Start erzeugt).
const FALLBACK_CSRF_SECRET = crypto.randomBytes(32).toString("hex");

function csrfSecret() {
  return process.env.PILOT_SECRET || process.env.CRON_SECRET || process.env.HELMUT_ADMIN_SECRET || FALLBACK_CSRF_SECRET;
}

function createCsrfToken() {
  const timestamp = Date.now().toString(36);
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${timestamp}.${nonce}`;
  const signature = crypto.createHmac("sha256", csrfSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function hasValidCsrf(request) {
  const token = String(request.headers["x-csrf-token"] || "").trim();
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [timestamp, nonce, signature] = parts;
  if (!timestamp || !nonce || !signature) return false;
  const issuedAt = parseInt(timestamp, 36);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 12 * 60 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", csrfSecret()).update(`${timestamp}.${nonce}`).digest("base64url");
  return timingSafeEqual(signature, expected);
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requiresCsrf(request, url) {
  const stateChangingGetPaths = new Set([
    "/api/briefing/run",
    "/api/crawl/run",
    "/api/pipeline/run",
    "/api/lage/check",
    "/api/lage/briefing",
    "/api/push/test"
  ]);
  if (request.method === "GET" && stateChangingGetPaths.has(url.pathname)) {
    if (hasAdminBypass(request, url)) return false;
    return true;
  }
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return false;
  if (url.pathname === "/api/pilot/unlock" || url.pathname === "/api/pilot/logout") return false;
  if (url.pathname.startsWith("/api/cron/")) return false;
  if (hasAdminBypass(request, url)) return false;
  return url.pathname.startsWith("/api/");
}

// SICHERHEIT: ?force=1 alleine (ohne Admin/Cron-Secret) erzwang frueher einen sofortigen
// Kosten-Refresh (Crawl/Briefing/Lage/KI) unter Umgehung der 10-Minuten-Drossel — ein
// Kostenmissbrauch-Hebel fuer jeden eingeloggten Nutzer, ohne Ratenlimit. client.js nutzt
// ?force=1 nirgends (rein internes Ops-/Debug-Werkzeug) — daher jetzt zusaetzlich hinter
// hasAdminBypass, ohne Produktverhalten zu aendern.
function isForcedPilotRun(request, url) {
  return url.searchParams.get("force") === "1" && hasAdminBypass(request, url);
}

function isRecent(value, maxAgeMs) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp < maxAgeMs;
}

function allowRate(request, key, limit, windowMs) {
  if (hasAdminBypass(request, new URL(request.url || "/", `http://${request.headers.host || "localhost"}`))) return true;
  const now = Date.now();
  const bucketKey = `${clientKey(request)}:${key}`;
  const current = (rateBuckets.get(bucketKey) || []).filter((timestamp) => now - timestamp < windowMs);
  if (current.length >= limit) {
    rateBuckets.set(bucketKey, current);
    return false;
  }
  current.push(now);
  rateBuckets.set(bucketKey, current);
  return true;
}

// SICHERHEIT: den LETZTEN Hop von X-Forwarded-For nehmen (den die vertrauenswuerdige
// Vercel-Edge selbst anhaengt), nicht den ERSTEN. Vercel steht als einziger Reverse-Proxy
// direkt vor der Funktion; in einer mehrhop-Kette ist der erste Eintrag vom Client frei
// waehlbar (Spoofing-Vektor gegen das Rate-Limit), der letzte ist der tatsaechlich
// gesehene Absender. Aendert nichts, falls Vercel den Header ohnehin ueberschreibt statt
// anzuhaengen — schliesst aber die Luecke, falls nicht.
function clientKey(request) {
  const xff = String(request.headers["x-forwarded-for"] || "");
  const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
  if (hops.length) return hops[hops.length - 1];
  const other = String(request.headers["x-real-ip"] || request.headers["cf-connecting-ip"] || "").trim();
  return other || request.socket?.remoteAddress || "local";
}

function sendTooManyRequests(response, message) {
  response.writeHead(429, jsonHeaders());
  response.end(JSON.stringify({ error: message }, null, 2));
}

function isBriefingStaleForBerlin(briefing) {
  const generatedAt = new Date(briefing?.generatedAt || briefing?.date || 0);
  if (Number.isNaN(generatedAt.getTime())) return true;
  const ageMs = Date.now() - generatedAt.getTime();
  return berlinDateKey(generatedAt) !== berlinDateKey(new Date()) || ageMs > 18 * 60 * 60 * 1000;
}

function berlinDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

// Antwortet mit generischer Fehlermeldung nach aussen, protokolliert aber intern.
// Beabsichtigte Client-Fehler (error.statusCode < 500) duerfen ihre publicMessage
// zeigen; alles andere wird zu einem neutralen 500 und landet im System-Fehlerlog.
function respondError(response, error, context = {}) {
  const status = Number(error && error.statusCode) || 500;
  if (status >= 500) {
    console.error("Server error", error);
    accounts.recordSystemError({
      scope: context.scope || "api",
      message: (error && error.message) || "unknown",
      path: context.path || null
    }).catch(() => {});
  }
  if (response.headersSent) return;
  const publicMessage = status < 500 && error && error.publicMessage
    ? error.publicMessage
    : "Interner Serverfehler. Bitte später erneut versuchen.";
  response.writeHead(status, jsonHeaders());
  response.end(JSON.stringify({ error: publicMessage }, null, 2));
}

function handleAsync(response, handler) {
  Promise.resolve()
    .then(handler)
    .then((payload) => sendJson(response, payload))
    .catch((error) => respondError(response, error));
}

function handleJson(request, response, handler) {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) request.destroy(new Error("Request body too large"));
  });
  request.on("end", () => {
    let payload;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      response.writeHead(400, jsonHeaders());
      response.end(JSON.stringify({ error: "Ungültige Anfrage." }, null, 2));
      return;
    }
    Promise.resolve(handler(payload))
      .then((result) => {
        if (result !== null) sendJson(response, result);
      })
      .catch((error) => respondError(response, error));
  });
  request.on("error", (error) => respondError(response, error));
}

// ---------------------------------------------------------------------------
// Auth-/Account-Handler (nur aktiv bei HELMUT_AUTH_MODE=accounts)
// ---------------------------------------------------------------------------

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    politicianId: user.politicianId || null,
    active: user.active !== false
  };
}

function requireRoleOr403(response, user, roles) {
  if (auth.requireRole(user, roles)) return true;
  response.writeHead(user ? 403 : 401, jsonHeaders());
  response.end(JSON.stringify({ error: user ? "Keine Berechtigung." : "Anmeldung erforderlich." }, null, 2));
  return false;
}

function handleAuthLogin(request, response, url) {
  if (!allowRate(request, "login", 10, 15 * 60 * 1000)) {
    return sendTooManyRequests(response, "Zu viele Loginversuche. Bitte später erneut.");
  }
  return handleJson(request, response, async (body) => {
    const email = accounts.normalizeEmail(body.email);
    const password = String(body.password || "");
    const user = await accounts.getUserByEmailRaw(email);
    // Generische Antwort: keine Unterscheidung zwischen "kein Nutzer", "deaktiviert"
    // oder "falsches Passwort" (kein User-Enumeration). SICHERHEIT: verifyPassword wird
    // IMMER aufgerufen (auch ohne/deaktivierten Nutzer, dann gegen einen Dummy-Salt) —
    // sonst waere "deaktiviert"/"kein Nutzer" per Timing vom scrypt-Aufwand unterscheidbar,
    // obwohl die Antwort absichtlich identisch ist.
    const passwordOk = accounts.verifyPassword(password, user);
    if (!user || user.active === false || !passwordOk) {
      await accounts.recordAudit({ action: "auth.login.failed", actorEmail: email, ip: auth.clientIp(request) });
      response.writeHead(401, jsonHeaders());
      response.end(JSON.stringify({ error: "E-Mail oder Passwort ist nicht korrekt." }, null, 2));
      return null;
    }
    const { token, ttlSeconds } = await accounts.createSession(user.id, {
      ip: auth.clientIp(request),
      userAgent: request.headers["user-agent"] || ""
    });
    await accounts.markLogin(user.id);
    await accounts.recordAudit({ action: "auth.login", userId: user.id, actorEmail: user.email, ip: auth.clientIp(request) });
    response.writeHead(200, jsonHeaders({ "Set-Cookie": auth.sessionCookieHeader(token, ttlSeconds) }));
    response.end(JSON.stringify({ ok: true, user: publicUser(user) }, null, 2));
    return null;
  });
}

async function handleAuthLogout(request, response) {
  const token = auth.readCookie(request, auth.SESSION_COOKIE);
  if (token) await accounts.destroySession(token);
  response.writeHead(200, jsonHeaders({ "Set-Cookie": auth.clearSessionCookieHeader() }));
  response.end(JSON.stringify({ ok: true }, null, 2));
}

// ---------------------------------------------------------------------------
// Invite-/Passwort-Flow (Umsetzungsnotiz §6)
// ---------------------------------------------------------------------------

// Basis-URL fuer oeffentliche Links (Invite/Reset). Vorrang: explizite Env
// (HELMUT_PUBLIC_URL), auf Deployments der kanonische Host, lokal der Request-Host.
// SICHERHEIT (Reset-Link-Poisoning): Host-/x-forwarded-host-Header sind vom
// Anfragenden spoofbar — wer sie in den Link uebernimmt, laesst einen Angreifer
// per request-reset Links mit SEINEM Host erzeugen (Token-Exfiltration, sobald
// Mail-Versand aktiv ist). Auf echten Deployments deshalb NIE dem Header vertrauen.
function publicBaseUrl(request) {
  const envBase = String(process.env.HELMUT_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (envBase) return envBase;
  const httpsDeploy = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === "production");
  if (httpsDeploy && canonicalHost) return `https://${canonicalHost}`;
  const host = String(request.headers.host || "").split(",")[0].trim();
  return host ? `http://${host}` : "";
}

function passwordSetUrl(request, token) {
  return `${publicBaseUrl(request)}/passwort-setzen?token=${encodeURIComponent(token)}`;
}

// Einladung erzeugen + Zustellung versuchen. Solange kein Mail-Dienst existiert
// (Domain folgt), traegt die Antwort den Link fuer den Admin-Kopierweg (§6 Interim)
// und einen ehrlichen mail.sent-Status — es wird NIE stillschweigend "gesendet".
async function issueInvite(request, user) {
  const { token, expiresAt } = await accounts.createPasswordToken(user.id, "invite");
  const inviteUrl = passwordSetUrl(request, token);
  const mailContent = inviteMail.buildInviteMail({ name: user.name, inviteUrl });
  const mail = await inviteMail.sendAccessMail({ to: user.email, ...mailContent });
  return { inviteUrl, expiresAt, mail };
}

// POST /api/auth/set-password — { token, password }: Token pruefen (gueltig,
// unbenutzt, nicht abgelaufen), Passwort setzen, Status aktiv, direkt einloggen.
function handleAuthSetPassword(request, response) {
  if (!allowRate(request, "set-password", 10, 15 * 60 * 1000)) {
    return sendTooManyRequests(response);
  }
  return handleJson(request, response, async (body) => {
    const token = String(body.token || "").trim();
    if (!token) throw accounts.httpError(400, "Token ist erforderlich.");
    const user = await accounts.setPasswordWithToken(token, String(body.password || ""));
    // SICHERHEIT (Review-Fix): Ein Passwort-Reset muss denjenigen aussperren, der
    // das Konto gerade haelt (gestohlene/geteilte Session) — sonst ueberlebt eine
    // fremde Session den Reset dank rollierender Verlaengerung unbegrenzt. Gleiche
    // Garantie wie der fruehere Admin-Reset-Pfad: alle Alt-Sessions verwerfen,
    // erst dann die neue Session ausstellen.
    await accounts.destroyUserSessions(user.id);
    const { token: sessionToken, ttlSeconds } = await accounts.createSession(user.id, {
      ip: auth.clientIp(request),
      userAgent: request.headers["user-agent"] || ""
    });
    await accounts.markLogin(user.id);
    await accounts.recordAudit({ action: "password.set", userId: user.id, actorEmail: user.email, ip: auth.clientIp(request) });
    response.writeHead(200, jsonHeaders({ "Set-Cookie": auth.sessionCookieHeader(sessionToken, ttlSeconds) }));
    response.end(JSON.stringify({ ok: true, user: publicUser(user) }, null, 2));
    return null;
  });
}

// POST /api/auth/request-reset — { email }: antwortet IMMER generisch mit 200
// (keine User-Enumeration). Eingeladene ohne Passwort bekommen erneut einen
// Invite-Link (7 Tage), alle anderen einen Reset-Link (1 Stunde).
function handleAuthRequestReset(request, response) {
  if (!allowRate(request, "request-reset", 5, 15 * 60 * 1000)) {
    return sendTooManyRequests(response);
  }
  return handleJson(request, response, async (body) => {
    const email = accounts.normalizeEmail(body.email);
    const generic = { ok: true, hinweis: "Wenn die Adresse existiert, wurde ein Link erstellt." };
    if (!email) return generic;
    // Besitzer-Erkennung VOR jeder Kontoabfrage (kostet fuer alle Anfragen gleich viel).
    const ctx = await auth.getAuthContext(request).catch(() => null);
    const user = await accounts.getUserByEmailRaw(email).catch(() => null);
    const isOwner = Boolean(user && ctx?.user?.id === user.id);
    // Interim §6 + Review-Fixes: Solange kein Mail-Dienst existiert, kann ein anonym
    // erzeugter Token NIEMANDEN erreichen (Mail tot, Antwort bleibt generisch) — er
    // wuerde nur den einzigen Zustellweg zerstoeren (createPasswordToken invalidiert
    // offene Links, z. B. den vom Admin kopierten Einladungs-Link). Deshalb: ohne
    // Mail-Dienst erzeugen NUR eingeloggte Besitzer ("Passwort aendern") einen Token.
    // Nebeneffekt: der anonyme Pfad macht fuer bekannte wie unbekannte Adressen
    // exakt dieselbe Store-Arbeit (1 Read) — kein Timing-Seitenkanal zur User-
    // Enumeration. WICHTIG bei Mail-Aktivierung: dann laeuft der Token-Zweig auch
    // anonym, und die Store-Arbeit (Token + Audit-Write) muss gegen den Not-Found-
    // Zweig angeglichen werden (Muster: Login-Dummy-scrypt, accounts.verifyPassword).
    if (!user || user.active === false) return generic;
    if (!isOwner && !inviteMail.isMailConfigured()) return generic;
    const purpose = user.passwordHash ? "reset" : "invite";
    let issued;
    try {
      issued = await accounts.createPasswordToken(user.id, purpose);
    } catch {
      // z. B. gesperrter Status: nach aussen identisch zur generischen Antwort.
      return generic;
    }
    const linkUrl = passwordSetUrl(request, issued.token);
    const mailContent = purpose === "reset"
      ? inviteMail.buildResetMail({ name: user.name, resetUrl: linkUrl })
      : inviteMail.buildInviteMail({ name: user.name, inviteUrl: linkUrl });
    const mail = await inviteMail.sendAccessMail({ to: user.email, ...mailContent });
    await accounts.recordAudit({ action: "password.reset-requested", userId: user.id, ip: auth.clientIp(request) });
    if (isOwner) {
      // Dem Besitzer ehrlich antworten: ohne Mail-Versand den Link direkt (Interim-
      // Kopierweg), mit Mail-Versand den Zustellstatus (Client zeigt den Toast).
      if (!mail.sent) return { ...generic, resetUrl: linkUrl, expiresAt: issued.expiresAt, mail };
      return { ...generic, mail: { sent: true } };
    }
    return generic;
  });
}

// GET /api/auth/password-token?token=… — Zustand fuer die /passwort-setzen-Seite.
// Bewusst minimal (nur gueltig/Zweck): keine E-Mail, kein Name, kein Kontostatus.
function handleAuthPasswordToken(request, response, url) {
  if (!allowRate(request, "password-token", 30, 15 * 60 * 1000)) {
    return sendTooManyRequests(response);
  }
  return handleAsync(response, async () => {
    const token = String(url.searchParams.get("token") || "").trim();
    const check = await accounts.inspectPasswordToken(token);
    return { valid: check.valid === true, purpose: check.valid ? check.purpose : null };
  });
}

async function handleAuthSession(response, authUser, token) {
  if (!authUser) {
    response.writeHead(200, jsonHeaders());
    response.end(JSON.stringify({ authenticated: false }, null, 2));
    return;
  }
  // Rollende Verlaengerung bei jedem App-Start: Session + Cookie auffrischen,
  // damit man angemeldet bleibt, bis man sich aktiv abmeldet.
  let extraHeaders = {};
  try {
    const ttlSeconds = token ? await accounts.extendSession(token) : null;
    if (ttlSeconds) extraHeaders = { "Set-Cookie": auth.sessionCookieHeader(token, ttlSeconds) };
  } catch (error) {
    console.error("Session-Verlängerung fehlgeschlagen", error);
  }
  const allowed = await auth.getAllowedPoliticianIds(authUser);
  const profiles = await listAllowedProfiles(authUser, allowed);
  response.writeHead(200, jsonHeaders(extraHeaders));
  response.end(JSON.stringify({
    authenticated: true,
    user: publicUser(authUser),
    allowedPoliticians: allowed,
    profiles
  }, null, 2));
}

async function allKnownPoliticianIds() {
  const profiles = await listProfiles();
  const users = await accounts.listUsers();
  const ids = new Set(profiles.map((profile) => profile.id));
  users.forEach((user) => {
    if (user.role === "abgeordneter" && user.politicianId) ids.add(user.politicianId);
  });
  // Kein bevorzugtes/konfiguriertes Mandat: die erreichbaren Mandate sind genau die
  // gespeicherten Profile bzw. zugewiesenen Mandate (oben) — nichts wird ergaenzt.
  return Array.from(ids);
}

// Mandate, die ein Nutzer auswaehlen darf (fuer den Profil-Switcher im Frontend).
async function listAllowedProfiles(user, allowed) {
  const ids = allowed === "all" ? await allKnownPoliticianIds() : (Array.isArray(allowed) ? allowed : []);
  const result = [];
  for (const id of ids) {
    const profile = await getProfile(id);
    result.push({ id, name: profile?.fullName || readableNameFromId(id) });
  }
  return result;
}

async function defaultPoliticianIdForUser(user, allowed) {
  // SaaS-Datenleck-Schutz: KEIN stiller Fallback auf ein fremdes
  // Mandat) für Account-Nutzer. Wer kein gültiges eigenes/zugewiesenes Mandat hat,
  // bekommt null -> der Aufrufer liefert einen klaren Fehler statt fremder Daten.
  if (user.role === "abgeordneter") return user.politicianId || null;
  if (Array.isArray(allowed) && allowed.length) return allowed[0];
  // NUR Admin (allowed==="all") darf mangels Auswahl auf ein beliebiges ECHTES
  // Mandat fallen — Admins sind für alle Mandate berechtigt. Referent/Demo OHNE
  // Zuweisung bekommt KEIN Mandat (null) -> klarer Fehler statt fremder Daten.
  if (allowed === "all") {
    const users = await accounts.listUsers();
    // Deterministisch (alphabetisch nach Mandats-ID) statt "erster Treffer in
    // Speicher-Reihenfolge" — die Auswahl ist eine Admin-Bequemlichkeit, kein
    // implizites Standardmandat, und darf nicht von Insertion-Order abhaengen.
    const mandateIds = users
      .filter((entry) => entry.role === "abgeordneter" && entry.politicianId)
      .map((entry) => entry.politicianId)
      .sort();
    return mandateIds.length ? mandateIds[0] : null;
  }
  return null;
}

// Sprint 8: read-only Zusammenstellung des Quellenarchitektur-Admin-Reports (macht Sprint
// 4/5/7 sichtbar). Rein LESEND, defensiv: jeder Fehler -> null -> der Client rendert die
// Sektion einfach nicht (Alt-Admin unveraendert). Struktur aus dem Code-Modell; Metriken aus
// Bestandsdaten (raw_documents/llm_usage). Fehlen Daten, markiert der Report sie EHRLICH als
// „nicht verfügbar" — es werden KEINE Zahlen erfunden. Keine DB-Aenderung, kein KI-Call.
async function buildSourceArchitectureReport(mandateProfiles = []) {
  try {
    const { buildFullModel } = require("./lib/helmut/quellenarchitektur");
    const { computeGlobalActivation } = require("./lib/helmut/quellenarchitektur/profile-packages");
    const qw = require("./lib/helmut/quellenarchitektur/quality-watchdog");
    const ar = require("./lib/helmut/quellenarchitektur/admin-report");
    const kandidaten = require("./lib/helmut/quellenarchitektur/seeds/landesmodule-kandidaten");
    const storageMod = require("./lib/helmut/storage");
    const M = buildFullModel();
    const profiles = Array.isArray(mandateProfiles) ? mandateProfiles : [];
    const activation = computeGlobalActivation({ packages: M.packages, packagePaths: M.packagePaths, retrievalPaths: M.retrievalPaths, profiles });
    // Beide Bestandsdaten-Reads PARALLEL (nicht sequenziell), je defensiv -> [] bei Fehler.
    const [rawDocs, llmUsage] = await Promise.all([
      storageMod.listRawDocuments({ days: 30, limit: 800 }).then((r) => r || []).catch(() => []),
      storageMod.getLlmUsage(null, 2000).then((r) => r || []).catch(() => [])
    ]);
    const now = Date.now();
    const quality = qw.buildQualityReport({
      catalog: { retrievalPaths: M.retrievalPaths, packages: M.packages, packagePaths: M.packagePaths },
      activation, rawDocs, koSourceLinks: [], dedupDocuments: [], profiles, llmUsage, signals: {}, now
    });
    const report = ar.buildSourceAdminReport({ catalog: M, activation, qualityReport: quality, now, candidateReadiness: kandidaten.readinessByGeography() });

    // Quellenmodus (off/shadow/on) + relationaler Plan-Vergleich. EHRLICH: ohne erreichbare
    // relationale Tabellen wird das als nicht verfügbar markiert (keine erfundenen Zahlen).
    try {
      const sm = require("./lib/helmut/quellenarchitektur/source-mode");
      const modus = sm.sourceMode();
      const [rows, legacySources] = await Promise.all([
        storageMod.listSourceArchitectureRows().catch(() => null),
        storageMod.getSources().catch(() => [])
      ]);
      if (rows && Array.isArray(rows.retrievalPaths) && rows.retrievalPaths.length) {
        const plan = sm.buildRelationalCrawlPlan({
          retrievalPaths: rows.retrievalPaths, packages: rows.packages,
          packagePaths: rows.packagePaths, profiles, legacySources
        });
        const vergleich = sm.comparePlans({ legacySources, relationalPlan: plan });
        const letzterShadowLauf = await storageMod.getSourceModeShadowLastRun().catch(() => null);
        report.quellenmodus = {
          modus,
          letzterShadowLauf,
          datenquelle: "relationale Production-Tabellen",
          alterPlan: { quellen: vergleich.quellenzahl.alt },
          relationalerPlan: plan.stats,
          aktivierung: plan.aktivierung,
          abweichungen: {
            fehlendImRelationalen: vergleich.fehlendImRelationalen,
            zusaetzlichImRelationalen: vergleich.zusaetzlichImRelationalen,
            doppelteImAltkatalog: vergleich.doppelteImLegacy.length
          },
          defekteWege: plan.defekt.map((d) => d.id),
          landesmodulGesperrt: plan.ausgeschlossen.filter((a) => /landesmodul/.test(a.grund)).length,
          manuellGesperrt: plan.ausgeschlossen.filter((a) => /manuell-gesperrt/.test(a.grund)).length,
          // Landesmodul-Wahrheit für den Betrieb: welches Land ist freigegeben, welche Wege
          // laufen dadurch, und welche davon sind MEHRLÄNDRIG (liefern also auch Inhalte eines
          // nicht freigegebenen Landes). Ohne diese Zeile liesse sich "nur Berlin läuft"
          // behaupten, obwohl über rbb24 auch Brandenburg-Inhalte ankommen.
          landesmodule: plan.landesmodule,
          hinweis: modus === "off"
            ? "Modus off: alter Katalog ist aktive Quellenwahrheit; relationaler Plan nur Vorschau/Vergleich."
            : modus === "shadow"
              ? "Modus shadow: alter Katalog aktiv; relationaler Plan wird parallel verglichen, nichts davon sichtbar."
              : "Modus on (CUTOVER): relationale DB ist aktive Quellenwahrheit, alter Katalog ist Fallback."
        };
      } else {
        report.quellenmodus = { modus, datenquelle: null, hinweis: "Relationale Tabellen nicht erreichbar/konfiguriert — Plan-Vergleich nicht verfügbar (keine erfundenen Kennzahlen)." };
      }
    } catch (error) {
      report.quellenmodus = { modus: null, datenquelle: null, hinweis: `Quellenmodus-Report fehlgeschlagen: ${String(error && error.message || "").slice(0, 120)}` };
    }
    return report;
  } catch (_) { return null; }
}

// --- Admin-Konfigurations-Diagnose (System & Sicherheit) ---------------------
// FESTE Whitelist von GENAU sieben nicht geheimen Helmut-Modus-/Limit-Variablen.
// Zweck: Vercel speichert Production-Env-Werte als "sensitive" (im Dashboard nicht
// ablesbar); der Betreiber braucht die WIRKSAMEN Werte aber z. B., um vor einer
// Tageslimit-Aenderung den Rollback-Wert zu dokumentieren. Sicherheitsmodell:
//  - KEINE Parameter von aussen (kein Variablenname aus Request/Query -> keine
//    beliebige Env-Abfrage moeglich; die Whitelist ist eingefroren),
//  - niemals Schluessel/Tokens/URLs (die 7 Namen sind reine Modus-/Zahlwerte),
//  - Werte werden NIE geloggt — sie erscheinen ausschliesslich im Payload von
//    /api/admin/overview (requireRoleOr403 "admin" + Tenant-Gate wie die gesamte
//    Admin-Oberflaeche; keine neue/oeffentliche Route),
//  - Wert-Anzeige auf 40 Zeichen gekappt (zusaetzliche Leitplanke, falls jemand
//    versehentlich einen langen Wert in eine dieser Variablen legt).
const HELMUT_CONFIG_DIAGNOSE_WHITELIST = Object.freeze([
  Object.freeze({ name: "HELMUT_UNDERSTANDING_GATE", codeDefault: "off — Gate wird nie aufgerufen" }),
  Object.freeze({ name: "HELMUT_PARDOK_DISPATCH", codeDefault: "off — 0 Items (inert)" }),
  Object.freeze({ name: "HELMUT_MAX_LLM_CALLS_PER_DAY", codeDefault: "unbegrenzt (Infinity)" }),
  Object.freeze({ name: "HELMUT_V3_STORE", codeDefault: "aus — V3-Read/Understanding inaktiv" }),
  Object.freeze({ name: "HELMUT_SCORING_MODE", codeDefault: "off — Alt-Ranking byte-identisch" }),
  Object.freeze({ name: "HELMUT_V3_SHADOW_COMPARE", codeDefault: "aus — live nicht verdrahtet" }),
  Object.freeze({ name: "HELMUT_PROFILE_DB_MODE", codeDefault: "aus — Profile Blob-only" }),
  Object.freeze({ name: "HELMUT_PROFILE_DB_EXCLUSIVE", codeDefault: "aus — Dual Write (Blob + SQL); an: relational-only, kein Blob-Write" })
]);

function buildHelmutConfigDiagnose(env = process.env) {
  return HELMUT_CONFIG_DIAGNOSE_WHITELIST.map(({ name, codeDefault }) => {
    const raw = env ? env[name] : undefined;
    const gesetzt = raw != null && String(raw).trim() !== "";
    // Deployment-Flag-Ebene (helmut-flags.json, Präzedenz env > Datei > Default) sichtbar
    // machen: quelle sagt, WOHER der wirksame Wert kommt. Datei-Flags wirken nur auf die
    // echte Prozessumgebung — für injizierte Test-Envs bleibt die Datei-Ebene leer.
    const info = helmutFlags.flagInfo(name, env);
    return {
      name,
      gesetzt,
      wert: gesetzt ? String(raw).trim().slice(0, 40) : null,
      dateiWert: info.quelle === "datei" ? String(info.wert).slice(0, 40) : null,
      wirksam: info.wert != null ? String(info.wert).slice(0, 40) : null,
      quelle: info.quelle,
      codeDefault
    };
  });
}

async function buildAdminOverview() {
  const [users, profiles, mandates, assignments, errors, audit, feedback, koCountTotal, statsToday, stats30d, crawlReport] = await Promise.all([
    accounts.listUsers(),
    listProfiles(),
    listFullProfiles(),
    accounts.listAssignments(),
    accounts.listSystemErrors(50),
    accounts.listAuditEvents(50),
    listFeedback(80),
    getKnowledgeObjectCount(),
    getAdminPeriodStats(1),
    getAdminPeriodStats(30),
    getAdminStatsCrawlReport()
  ]);
  const storage = getStorageStatus();
  const storeSummary = await getStoreSummary();
  // Offene Einladungen je Konto (§6): nur Zeiten, nie Token-Hashes — fuer die
  // Admin-Nutzerliste ("Einladung laeuft ab am …" + "erneut senden").
  const pendingInvites = await accounts.listPendingInvites().catch(() => ({}));
  const usersWithInvites = users.map((user) => ({ ...user, invite: pendingInvites[user.id] || null }));
  // Read-only, defensiv: der Quellenarchitektur-Report (Sprint 8). Fehler -> null.
  const sourceArchitecture = await buildSourceArchitectureReport(mandates);
  // Budget-Wahrheit (Phase 8): heutiger Stand im EXAKTEN Fenster des Budget-Gates
  // (UTC-Kalendertag) — Skips/Fehler getrennt, pro Pfad, pro Mandant, Limit/Rest.
  // Die 24h-Rolling-Statistik (stats.today) bleibt fuer Kostentrends bestehen.
  const llmBudget = await getLlmUsageBreakdownToday().catch(() => null);

  const userById = new Map(users.map((u) => [u.id, u.name || u.email]));
  const userByPoliticianId = new Map(users.filter((u) => u.politicianId).map((u) => [u.politicianId, u.name || u.email]));
  function addNames(s) {
    return { ...s, perUser: s.perUser.map((e) => ({ ...e, name: userById.get(e.userId) || userByPoliticianId.get(e.userId) || e.userId })) };
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      users: users.length,
      admins: users.filter((user) => user.role === "admin").length,
      abgeordnete: users.filter((user) => user.role === "abgeordneter").length,
      referenten: users.filter((user) => user.role === "referent").length,
      profiles: profiles.length,
      assignments: assignments.length,
      feedbackOpen: feedback.filter((item) => !item.done).length,
      knowledgeObjects: koCountTotal,
      activeLast7d: users.filter((user) => {
        const seen = user.lastSeenAt || user.lastLoginAt;
        return seen && (Date.now() - new Date(seen).getTime()) < 7 * 24 * 60 * 60 * 1000;
      }).length
    },
    users: usersWithInvites,
    profiles,
    mandates: mandates.map(adminMandateSummary),
    sourceArchitecture,
    assignments,
    feedback,
    stats: {
      today: addNames(statsToday),
      days30: addNames(stats30d)
    },
    crawlReport,
    system: {
      storage,
      store: storeSummary,
      ai: {
        enabled: isAiEnabled(),
        model: activeModelName()
      },
      llmBudget,
      push: pushStatus(),
      authMode: auth.authMode(),
      // Deploy-Identität (nur Anzeige, keine Secrets): Commit-SHA ist ohnehin öffentlich
      // in den Asset-URLs (?v=<sha>); Environment/Branch sind Betriebsmetadaten. Beantwortet
      // die Betreiberfrage „welche Version läuft gerade?" ohne neue Architektur/Endpoint.
      deploy: {
        version: ASSET_VERSION,
        commit: process.env.VERCEL_GIT_COMMIT_SHA ? String(process.env.VERCEL_GIT_COMMIT_SHA).slice(0, 12) : null,
        branch: process.env.VERCEL_GIT_COMMIT_REF || null,
        environment: process.env.VERCEL_ENV || (process.env.NODE_ENV === "production" ? "production" : "development")
      },
      // Konfigurations-Diagnose (feste 7er-Whitelist, siehe buildHelmutConfigDiagnose).
      helmutConfig: buildHelmutConfigDiagnose()
    },
    recentErrors: errors,
    auditEvents: audit
  };
}

// Schlanke, read-only Sicht eines Mandatsprofils fuer den Admin. Keine Geheimnisse,
// nur die politisch/redaktionell relevanten Felder.
function adminMandateSummary(p = {}) {
  return {
    id: p.id,
    fullName: p.fullName || p.name || p.id,
    party: p.party || "",
    faction: p.faction || "",
    state: p.state || "",
    constituency: p.constituency || "",
    committees: Array.isArray(p.committees) && p.committees.length ? p.committees : (p.committee ? [p.committee] : []),
    focusTopics: p.focusTopics || [],
    relevantTopics: p.opportunityTopics || p.reportingTopics || [],
    ignoreTopics: p.ignoreTopics || [],
    communicationStyle: p.communicationStyle || "",
    tonality: p.tonality || "",
    keyAudiences: p.keyAudiences || [],
    noGoPhrases: p.noGoPhrases || p.noGoTopics || [],
    updatedAt: p.updatedAt || null,
    accountType: p.accountType || null,
    profileActive: p.profileActive !== false,
    // Profil-Validierung (reine Funktion, keine Zusatz-Reads): der Betreiber muss
    // pro Mandat sehen, ob das Profil fuer Matching/Briefing ausreichend ist.
    validierung: adminMandateValidierung(p)
  };
}

function adminMandateValidierung(p) {
  try {
    const val = validateProfile(p);
    return {
      zustand: val.state,
      zustandLabel: val.stateLabel,
      bereit: val.ready,
      nutzbar: val.usable,
      deaktiviert: val.disabled,
      fehlendePflichtfelder: val.missingRequiredLabels || []
    };
  } catch (_) {
    return null;
  }
}

// --- Builder fuer die Admin-Leserouten (Admin-Neuaufbau 2026-07) -------------

// vercel.json ist die EINZIGE Wahrheit des Cron-Zeitplans (kein hartkodierter
// Zweitwert). STATISCHES require statt fs-Read: @vercel/nft traegt eine literale
// require-Abhaengigkeit deterministisch ins Serverless-Bundle — ein fs-Read mit
// dynamisch gebautem Pfad wird von NFT NICHT aufgeloest und landet in Production
// nicht im Bundle. Nicht ladbar -> null (ehrlich, kein Absturz).
const VERCEL_CONFIG = (() => {
  try { return require("./vercel.json"); } catch (_) { return null; }
})();

// config-Parameter nur fuer Offline-Tests injizierbar (Default: das gebundelte
// vercel.json). config === null simuliert "nicht lesbar" -> null.
function readVercelCronSchedule(config = VERCEL_CONFIG) {
  const crons = config && Array.isArray(config.crons) ? config.crons : null;
  if (!crons) return null;
  return crons.map((entry) => ({
    path: String(entry.path || "").slice(0, 80),
    schedule: String(entry.schedule || "").slice(0, 40)
  }));
}

// GitHub-Actions-Waechter aus den Workflow-Dateien lesen (nicht hartkodieren):
// aktiv = mindestens ein NICHT auskommentierter "cron:"-Eintrag.
function readWorkflowWatchdog(rel) {
  try {
    const raw = fs.readFileSync(path.join(root, rel), "utf8");
    const activeLines = raw.split("\n").filter((line) => !/^\s*#/.test(line));
    const match = activeLines.join("\n").match(/cron:\s*["']?([0-9*\/,\- ]+)["']?/);
    return { verfuegbar: true, aktiv: Boolean(match), zeitplanUtc: match ? match[1].trim() : null, quelle: rel };
  } catch (_) {
    return { verfuegbar: false, aktiv: null, zeitplanUtc: null, quelle: rel };
  }
}

async function buildAdminCostsPerUser(days = 30) {
  const [per, users, profiles, heute] = await Promise.all([
    getAdminCostsPerUser({ days }),
    accounts.listUsers().catch(() => []),
    listFullProfiles().catch(() => []),
    getLlmUsageBreakdownToday().catch(() => null)
  ]);
  const nameByUserId = new Map(users.map((u) => [u.id, u.name || u.email]));
  const nameByPoliticianId = new Map(profiles.map((p) => [p.id, p.fullName || p.id]));
  const perUser = (per.perUser || []).map((entry) => ({
    ...entry,
    name: nameByUserId.get(entry.userId) || nameByPoliticianId.get(entry.userId) || entry.userId
  }));
  // Pro-Mandant-Budgetstatus: Profil-Budgets sind EUR-Cent, das Nutzungslog USD.
  // evaluateTenantBudget vergleicht bewusst 1:1 (konservativer Schutzdeckel,
  // siehe lib/helmut/llm-budget.js) — der Admin kennzeichnet beide Waehrungen.
  const monthStart = heute && /^\d{4}-\d{2}/.test(String(heute.day || ""))
    ? `${String(heute.day).slice(0, 7)}-01`
    : null;
  const tenantBudgets = [];
  for (const p of profiles) {
    const dailyBudgetCent = Number.isFinite(Number(p.aiBudgetDailyCents)) && p.aiBudgetDailyCents != null ? Number(p.aiBudgetDailyCents) : null;
    const monthlyBudgetCent = Number.isFinite(Number(p.aiBudgetMonthlyCents)) && p.aiBudgetMonthlyCents != null ? Number(p.aiBudgetMonthlyCents) : null;
    const heuteTenant = heute && heute.byTenant && heute.byTenant[p.id] ? heute.byTenant[p.id] : null;
    const spentTodayUsd = heute ? (heuteTenant ? Number(heuteTenant.estimatedCostUsd) || 0 : 0) : null;
    let spentMonthUsd = null;
    if (monthStart) {
      try { spentMonthUsd = (await getLlmCostSince(p.id, monthStart)).estimatedCostUsd; } catch (_) { spentMonthUsd = null; }
    }
    const budget = llmBudgetLib.evaluateTenantBudget({ dailyBudgetCent, monthlyBudgetCent, spentTodayUsd, spentMonthUsd });
    tenantBudgets.push({
      politicianId: p.id,
      name: p.fullName || p.id,
      dailyBudgetCent,
      monthlyBudgetCent,
      heuteUsd: Number.isFinite(spentTodayUsd) ? spentTodayUsd : null,
      monatUsd: Number.isFinite(Number(spentMonthUsd)) ? Number(spentMonthUsd) : null,
      applied: budget.applied,
      allowed: budget.allowed,
      warn: budget.warn,
      reason: budget.reason,
      dailyRemainingCent: budget.dailyRemainingCent,
      monthlyRemainingCent: budget.monthlyRemainingCent
    });
  }
  return { generatedAt: new Date().toISOString(), ...per, perUser, tenantBudgets };
}

async function buildAdminCustomers() {
  const users = await accounts.listUsers();
  const sessions = await accounts.countActiveSessions().catch(() => null);
  const today = new Date().toISOString().slice(0, 10);
  // Kundensicht: Mandats-Konten (abgeordneter) fuehren die Abrechnung. Konten
  // anderer Rollen erscheinen nur, wenn tatsaechlich customer-Daten gepflegt sind.
  const kunden = users
    .filter((u) => u.role === "abgeordneter" || (u.customer && (u.customer.pricePerMonth != null || (u.customer.paymentStatus && u.customer.paymentStatus !== "none"))))
    .map((u) => ({
      userId: u.id,
      name: u.name || u.email,
      email: u.email,
      politicianId: u.politicianId || null,
      role: u.role,
      status: u.status,
      active: u.active !== false,
      paidUntil: u.paidUntil || null,
      customer: u.customer,
      lastLoginAt: u.lastLoginAt || null,
      lastSeenAt: u.lastSeenAt || null
    }));
  const beendet = (k) => k.status === "gekuendigt" || k.status === "deaktiviert";
  const counts = {
    kunden: kunden.length,
    paid: kunden.filter((k) => k.customer.paymentStatus === "paid").length,
    open: kunden.filter((k) => k.customer.paymentStatus === "open").length,
    overdue: kunden.filter((k) => k.customer.paymentStatus === "overdue").length,
    none: kunden.filter((k) => !k.customer.paymentStatus || k.customer.paymentStatus === "none").length,
    trial: kunden.filter((k) => k.customer.trialUntil && String(k.customer.trialUntil) > today && !beendet(k)).length,
    gekuendigt: kunden.filter((k) => k.status === "gekuendigt").length,
    deaktiviert: kunden.filter((k) => k.status === "deaktiviert").length
  };
  // MRR = Summe pricePerMonth (EUR) ueber nicht beendete Kunden mit gesetztem Preis.
  const mitPreis = kunden.filter((k) => !beendet(k) && Number.isFinite(Number(k.customer.pricePerMonth)) && k.customer.pricePerMonth != null);
  const mrrEur = mitPreis.length ? mitPreis.reduce((sum, k) => sum + Number(k.customer.pricePerMonth), 0) : null;
  return {
    generatedAt: new Date().toISOString(),
    counts,
    mrrEur,
    kunden,
    // Reine Anzahl (Datensparsamkeit): keine Session-Objekte, keine Hashes.
    sessionsAktiv: sessions ? sessions.total : null
  };
}

async function buildAdminSourcesStatus() {
  const [rows, shadow, runs, telemetrie, mandate] = await Promise.all([
    listSourceArchitectureRows().catch(() => null),
    getSourceModeShadowLastRun().catch(() => null),
    listCrawlRuns(20).catch(() => []),
    // Punkt 16: der neue Lesepfad auf die Quellen-Telemetrie. Defensiv -> []
    // bedeutet "keine Erkennung moeglich", nicht "keine Stoerung".
    listSourceCrawlTelemetry({ days: 14 }).catch(() => []),
    // Mandatswirkung nur, wenn die Profile ueberhaupt lesbar sind; sonst meldet
    // der Bericht sie ausdruecklich als nicht bestimmbar (statt zu raten).
    listFullProfiles().catch(() => [])
  ]);

  // Google-News-Anteil (Klumpenrisiko) aus den letzten Crawl-Laeufen. Grund:
  // source_crawl_telemetry hat keinen Lesepfad im Code (Analyse 2026-07) —
  // crawlRuns.providerBreakdown ist die einzige belastbare Quelle.
  let googleNews = null;
  const withProviders = (runs || []).filter((r) => r && r.providerBreakdown && (r.providerBreakdown.googleNews || r.providerBreakdown.direct));
  if (withProviders.length) {
    const sum = { googleChecked: 0, googleOk: 0, googleFailed: 0, directChecked: 0, directOk: 0, directFailed: 0 };
    for (const run of withProviders) {
      const g = run.providerBreakdown.googleNews || {};
      const d = run.providerBreakdown.direct || {};
      sum.googleChecked += Number(g.checked) || 0;
      sum.googleOk += Number(g.ok) || 0;
      sum.googleFailed += Number(g.failed) || 0;
      sum.directChecked += Number(d.checked) || 0;
      sum.directOk += Number(d.ok) || 0;
      sum.directFailed += Number(d.failed) || 0;
    }
    const totalOk = sum.googleOk + sum.directOk;
    googleNews = {
      laeufe: withProviders.length,
      ...sum,
      anteilOkProzent: totalOk > 0 ? Math.round((sum.googleOk / totalOk) * 100) : null
    };
  }

  const statusRank = { broken: 5, degraded: 4, needs_review: 3, paused: 2, archived: 1, healthy: 0 };
  let statusCounts = null;
  let zaehler = null;
  let problematischeWege = null;
  let herausgeber = null;
  if (rows && Array.isArray(rows.retrievalPaths)) {
    statusCounts = { healthy: 0, degraded: 0, broken: 0, needs_review: 0, paused: 0, archived: 0 };
    for (const p of rows.retrievalPaths) {
      const s = String(p.status || "needs_review");
      if (statusCounts[s] == null) statusCounts[s] = 0;
      statusCounts[s] += 1;
    }
    zaehler = {
      herausgeber: (rows.publishers || []).length,
      abrufwege: rows.retrievalPaths.length,
      pakete: (rows.packages || []).length,
      paketPfade: (rows.packagePaths || []).length
    };
    const pubById = new Map((rows.publishers || []).map((p) => [p.id, p]));
    const pfad = (p) => ({
      id: p.id,
      name: p.name || p.id,
      herausgeber: (pubById.get(p.publisher_id) || {}).name || p.publisher_id || null,
      methode: p.method || null,
      status: p.status || null,
      fehlerserie: Number(p.error_streak) || 0,
      letzterErfolg: p.last_success_at || null,
      // last_error ist im Schema ein Freitext — auf inhaltsfreie Laenge kappen.
      letzterFehler: p.last_error ? String(p.last_error).slice(0, 160) : null,
      kritisch: p.is_critical === true
    });
    problematischeWege = rows.retrievalPaths
      .filter((p) => p.status && p.status !== "healthy" && p.status !== "archived")
      .map(pfad)
      .sort((a, b) => ((statusRank[b.status] || 0) - (statusRank[a.status] || 0)) || (b.fehlerserie - a.fehlerserie));
    herausgeber = (rows.publishers || [])
      .filter((p) => p.lifecycle_status !== "archived")
      .map((p) => {
        const wege = rows.retrievalPaths.filter((rp) => rp.publisher_id === p.id).map(pfad);
        const schlechtester = wege.reduce((max, w) => Math.max(max, statusRank[w.status] || 0), 0);
        return { id: p.id, name: p.name, typ: p.publisher_type || null, vertrauen: p.trust || null, wege, schlechtesterStatusRang: schlechtester };
      })
      .sort((a, b) => (b.schlechtesterStatusRang - a.schlechtesterStatusRang) || String(a.name).localeCompare(String(b.name), "de"));
  }

  // --- Punkt 16: automatische Quellenstoerungs-Erkennung -------------------
  // Leitet aus der ECHTEN Laufhistorie (source_crawl_telemetry) je Quelle einen
  // klassifizierten Zustand ab. Ersetzt die bisherige Anzeige NICHT, sondern
  // ergaenzt sie: `problematischeWege` oben liest weiter retrieval_paths.status
  // (Konfiguration), dieser Block liest das tatsaechliche Laufverhalten.
  // Rein lesend, rein additiv; jeder Fehler -> null -> die Sektion entfaellt.
  let stoerungen = null;
  try {
    const sf = require("./lib/helmut/quellenarchitektur/source-failure");
    const bericht = sf.bewerteQuellenstoerungen({
      telemetrie,
      retrievalPaths: (rows && rows.retrievalPaths) || [],
      packages: (rows && rows.packages) || [],
      packagePaths: (rows && rows.packagePaths) || [],
      profiles: Array.isArray(mandate) && mandate.length ? mandate : null
    });
    // Fuer die Anzeige nur das Noetige serialisieren (keine Rohhistorie, keine
    // internen Schwellenobjekte in jeder Zeile).
    const zeile = (b) => ({
      quelle: b.sourceId,
      name: b.name,
      methode: b.methode,
      klasse: b.klasse,
      kurz: b.kurz,
      erklaerung: b.erklaerung,
      ursache: b.ursache,
      ursacheText: b.ursacheText,
      stufe: b.stufe,
      stufeText: b.stufeText,
      kritisch: b.kritisch,
      imKatalog: b.imKatalog,
      laufzeitquelle: b.laufzeitquelle === true,
      problemSeit: b.problemSeit ? new Date(b.problemSeit).toISOString() : null,
      letzterErfolg: b.letzterErfolgAt ? new Date(b.letzterErfolgAt).toISOString() : null,
      letzteLieferung: b.letzteLieferungAt ? new Date(b.letzteLieferungAt).toISOString() : null,
      wiederholungen: b.wiederholungen,
      laufdaten: b.laufdaten,
      wirkung: b.wirkung,
      signatur: b.signatur
    });
    stoerungen = {
      verfuegbar: bericht.verfuegbar,
      hinweis: bericht.hinweis,
      fensterTage: bericht.fensterTage,
      zaehler: bericht.zaehler,
      stufen: bericht.stufen,
      summe: bericht.summe,
      // Nur die tatsaechlich Gestoerten in die Anzeige — die gesunden Wege
      // stehen bereits als Zaehler drin (keine Rauschliste).
      gestoerte: bericht.gestoerte.map(zeile),
      handlungsbedarf: bericht.handlungsbedarf.map(zeile),
      paketLage: bericht.paketLage.filter((p) => p.versorgung !== "versorgt"),
      schwellen: {
        fensterTage: bericht.schwellen.fensterTage,
        fehlerAbLaeufen: bericht.schwellen.fehlerAbLaeufen,
        leerAbLaeufen: bericht.schwellen.leerAbLaeufen,
        instabilAbEpisoden: bericht.schwellen.instabilAbEpisoden,
        veraltetTage: bericht.schwellen.veraltetTage,
        langsamMs: bericht.schwellen.langsamMs
      }
    };
  } catch (error) {
    console.error("[admin] Quellenstoerungs-Bericht fehlgeschlagen (ignoriert):", error && error.message);
    stoerungen = null;
  }

  // --- Punkt 18: Production-Inventur aller Quellenpakete -------------------
  // Fuehrt die vier bereits vorhandenen Wahrheiten zu EINER Paketzeile zusammen:
  // Bestand (relationale Tabellen) · tatsaechliche Einplanung (Crawl-Plan) ·
  // Aktivierung (Referenzzaehlung ueber die echten Profile) · Laufverhalten
  // (Punkt 16 aus source_crawl_telemetry). Rein lesend, rein additiv, ohne
  // zweite Datenhaltung. Jeder Fehler -> null -> die Sektion entfaellt.
  let paketInventur = null;
  try {
    const { buildPaketInventur } = require("./lib/helmut/quellenarchitektur/paket-inventur");
    const voll = buildPaketInventur({
      packages: (rows && rows.packages) || [],
      packagePaths: (rows && rows.packagePaths) || [],
      retrievalPaths: (rows && rows.retrievalPaths) || [],
      geographies: (rows && rows.geographies) || [],
      profiles: Array.isArray(mandate) ? mandate : [],
      telemetrie
    });
    // Fuer die Anzeige verdichten: die vollstaendige Wegeliste je Paket waere ein
    // Vielfaches der uebrigen Antwort und steht im Betriebsskript zur Verfuegung
    // (`node scripts/paket-inventur.js --json`).
    paketInventur = {
      erhobenAm: voll.erhobenAm,
      fensterTage: voll.fensterTage,
      summe: voll.summe,
      datenalter: voll.datenalter,
      letzterLauf: voll.letzterLauf,
      letzterLaufHinweis: voll.letzterLaufHinweis,
      datengrundlage: voll.datengrundlage,
      laufzeitquellen: voll.laufzeitquellen.length,
      pakete: voll.pakete.map((p) => ({
        key: p.key, name: p.name, ebene: p.ebene,
        region: p.region ? (p.region.name || p.region.id) : null,
        istBasispaket: p.istBasispaket, dbStatus: p.dbStatus,
        zustand: p.zustand, zustandGrund: p.zustandGrund,
        aktivierung: {
          paketAktivierung: p.aktivierung.paketAktivierung,
          refCount: p.aktivierung.refCount,
          ausfuehrbar: p.aktivierung.ausfuehrbar,
          begruendung: p.aktivierung.begruendung
        },
        abrufwege: {
          gesamt: p.abrufwege.gesamt, eingeplant: p.abrufwege.eingeplant,
          defekt: p.abrufwege.defekt, ausgeschlossen: p.abrufwege.ausgeschlossen,
          wirksam: p.abrufwege.wirksam, gestoert: p.abrufwege.gestoert, unbekannt: p.abrufwege.unbekannt,
          ausschlussgruende: p.abrufwege.ausschlussgruende
        },
        ertrag: { letzterLauf: p.ertrag.letzterLauf, betriebszeitraum: p.ertrag.betriebszeitraum, messbar: p.ertrag.messbar, grund: p.ertrag.grund },
        letzteLieferung: p.letzteLieferung,
        fehler: { stufen: p.fehler.stufen, akut: p.fehler.akut, zeitnah: p.fehler.zeitnah, strukturell: p.fehler.strukturell },
        flags: p.flags
      }))
    };
  } catch (error) {
    console.error("[admin] Paket-Inventur fehlgeschlagen (ignoriert):", error && error.message);
    paketInventur = null;
  }

  return {
    generatedAt: new Date().toISOString(),
    verfuegbar: Boolean(rows && Array.isArray(rows.retrievalPaths)),
    hinweis: rows ? null : "Relationale Quellen-Tabellen nicht erreichbar (Supabase-Backend erforderlich) — keine erfundenen Kennzahlen.",
    statusCounts,
    zaehler,
    problematischeWege,
    herausgeber,
    stoerungen,
    paketInventur,
    googleNews,
    letzterShadowLauf: shadow
      ? {
          savedAt: shadow.savedAt || null,
          modus: shadow.modus || null,
          abdeckungDokumenteProzent: shadow.vergleich && shadow.vergleich.abdeckungDokumenteProzent != null
            ? shadow.vergleich.abdeckungDokumenteProzent
            : null
        }
      : null,
    watchdog: {
      briefingWatchdog: readWorkflowWatchdog(".github/workflows/briefing-watchdog.yml"),
      healthWatch: readWorkflowWatchdog(".github/workflows/health-watch.yml")
    }
  };
}

// --- Admin-Datenstatus (intern, Betreiber) ----------------------------------
// Ziel: morgens erkennen, ob Helmut echte Daten verarbeitet hat (global) und ob
// einzelne Accounts heute Wert bekommen (pro Account). Nutzt AUSSCHLIESSLICH
// vorhandene Quellen (Crawl-Runs, Admin-Stats, LLM-Usage, V3-Read-Funktionen).
// Keine erfundenen Zahlen: was aktuell nicht sicher ermittelbar ist, wird als
// { available:false, note } markiert.
function dsNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function dsNumOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function dsBerlinParts(date = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    const p = Object.fromEntries(fmt.formatToParts(date).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
  } catch (_) {
    return { day: date.toISOString().slice(0, 10), minutes: date.getUTCHours() * 60 + date.getUTCMinutes() };
  }
}

// Morgenstatus 7:30 Berlin — ROBUST gegen manuelle Ad-hoc-Läufe: bewertet den
// FRÜHESTEN ERFOLGREICHEN Lauf des heutigen Tages, nicht blind den letzten Lauf.
// So kippt ein Nutzer-Refresh um 14:29 die Betreiber-Ampel nicht, wenn der
// morgendliche (Cron-)Lauf ≤ 7:30 erfolgreich war. Nimmt die Lauf-Liste; ein
// einzelnes Run-Objekt wird zur Kompatibilität akzeptiert.
function dsMorningStatus(runs) {
  const list = Array.isArray(runs) ? runs : (runs ? [runs] : []);
  if (!list.length) return { ok: false, today: false, successful: false, note: "kein Crawl-Lauf vorhanden" };
  const now = dsBerlinParts();
  const cutoff = 7 * 60 + 30;
  const todayRuns = list
    .filter((r) => r && r.createdAt)
    .map((r) => ({ successful: dsNum(r.successfulSources) > 0, b: dsBerlinParts(new Date(r.createdAt)) }))
    .filter((x) => x.b.day === now.day);
  const todaySuccessful = todayRuns.filter((x) => x.successful).sort((a, b) => a.b.minutes - b.b.minutes);
  const earliest = todaySuccessful[0] || null;
  const ok = Boolean(earliest && earliest.b.minutes <= cutoff);
  const hhmm = earliest ? `${String(Math.floor(earliest.b.minutes / 60)).padStart(2, "0")}:${String(earliest.b.minutes % 60).padStart(2, "0")}` : null;
  return {
    ok,
    today: todayRuns.length > 0,
    successful: todaySuccessful.length > 0,
    ersterErfolgreicherLaufBerlin: hhmm,
    note: ok
      ? `brauchbarer Stand bis 7:30 (früher Tageslauf ${hhmm} ok)`
      : (todaySuccessful.length ? "erfolgreicher Tageslauf erst nach 7:30" : (todayRuns.length ? "heutiger Lauf ohne Erfolg" : "kein heutiger Lauf"))
  };
}

function dsAccountAmpel({ level, restricted, hasBriefing }) {
  if (!level || level === "empty") return "rot";       // kein verwertbares Profil
  if (restricted || !hasBriefing) return "gelb";       // eingeschraenkt oder heute kein Briefing
  return "gruen";
}

// Verwandelt einen rohen Systemfehler in eine kurze, verstaendliche Admin-Meldung
// (Headline + Grund); der Rohtext bleibt nur als optionales Detail erhalten. So sieht
// der Betreiber nicht mehr einen langen roten JSON-Block, sondern z. B.
// "KI-Analyse fehlgeschlagen — Grund: Azure-Deployment nicht gefunden".
function dsSummarizeError(err) {
  if (!err) return null;
  const raw = String(err.message || err.error || "").trim();
  const lower = raw.toLowerCase();
  const scope = String(err.scope || "").toLowerCase();
  const aiish = /azure|openai|deployment|\bllm\b|gpt|responses|understand|\bmodel\b|token/.test(lower)
    || scope.includes("ai") || scope.includes("brief") || scope.includes("understand");
  let reason;
  if (/deploymentnotfound|deployment.{0,20}not.{0,5}found|not.{0,5}found.{0,20}deployment/.test(lower)) reason = "Azure-Deployment nicht gefunden";
  else if (aiish && /\b404\b|not found/.test(lower)) reason = "KI-Endpunkt/Deployment nicht gefunden (404)";
  else if (/\b401\b|\b403\b|unauthor|invalid.{0,10}key|api key/.test(lower)) reason = "KI-Zugang nicht autorisiert (Schlüssel prüfen)";
  else if (/\b429\b|rate.?limit|quota/.test(lower)) reason = "KI-Ratenlimit/Quota erreicht";
  else if (/timeout|timed out|etimedout|abort/.test(lower)) reason = "Zeitüberschreitung bei der KI-Anfrage";
  else {
    const m = raw.match(/"message"\s*:\s*"([^"]{3,140})"/i) || raw.match(/"code"\s*:\s*"([^"]{3,80})"/i);
    reason = m ? m[1] : (raw ? raw.replace(/\s+/g, " ").slice(0, 140) : "Unbekannter Fehler");
  }
  return {
    headline: aiish ? "KI-Analyse fehlgeschlagen" : "Systemfehler",
    reason: String(reason).slice(0, 160),
    scope: err.scope || null,
    path: err.path || null,
    when: err.createdAt || null,
    detail: raw ? raw.replace(/\s+/g, " ").slice(0, 400) : null
  };
}

// Quellen-Katalog nach Kategorie/Vertrauen (Task: Medien bleibt eigene Kategorie,
// Quellen ehrlich sichtbar). Beruht auf dem TATSAECHLICH konfigurierten Katalog
// (getSources), nicht auf erfundenen Zahlen. Immer verfuegbar (kein V3 noetig).
async function dsSourceCatalogQuality() {
  try {
    const sources = (await getSources()) || [];
    const summary = sourceSafety.summarizeSources(sources);
    return { total: summary.total, nachKategorie: summary.byCategory, nachVertrauen: summary.byTrust };
  } catch (_) {
    return { total: null, nachKategorie: null, nachVertrauen: null };
  }
}

// Ehrliche Quarantaene-/Quell-Sicherheits-Zahlen: laeuft der Source-Safety-Guard
// ueber die aktuell verstandenen Vorgaenge + ihre Quell-Dokumente und ZAEHLT, was
// wirklich passiert (keine erfundenen Zahlen). Ohne V3-Store nicht ermittelbar.
async function dsQuarantineStats({ limit = 200 } = {}) {
  if (!v3StoreReady()) return null;
  let kos = [];
  try { kos = await listKnowledgeObjects({ limit }); } catch (_) { kos = []; }
  const understood = (kos || []).filter((k) =>
    k && k.status !== "pending" && k.understanding_status === "complete" && (k.was_ist_passiert || k.warum_wichtig)
  );
  const sourcesByVorgang = await loadSourcesByVorgang(understood).catch(() => ({}));
  const hasTitle = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim() !== "";
  let quarantaeniert = 0, kritischeClaimsUnbestaetigt = 0;
  let dokumenteGeprueft = 0, unbekannteQuellen = 0, blockierteQuellen = 0;
  let mitDisplayTitle = 0, ohneDisplayTitle = 0, backfillFaehig = 0;
  for (const ko of understood) {
    const docs = sourcesByVorgang[ko.vorgang_id] || [];
    const verdict = sourceSafety.guardKnowledgeObject(ko, docs);
    const f = verdict.flags || {};
    if (verdict.status === "quarantine") quarantaeniert += 1;
    if (f.criticalUnconfirmed) kritischeClaimsUnbestaetigt += 1;
    dokumenteGeprueft += dsNum(f.sourceCount);
    unbekannteQuellen += dsNum(f.unknownSources);
    blockierteQuellen += dsNum(f.blockedSources);
    // Praesentations-Abdeckung (Backfill-Sichtbarkeit): hat der Vorgang einen
    // kuratierten display_title? Backfill-faehig = ohne display_title UND mit Quellen
    // (der Presentation-Backfill braucht verknuepfte Quell-Dokumente).
    if (hasTitle(ko.display_title)) { mitDisplayTitle += 1; }
    else { ohneDisplayTitle += 1; if (docs.length) backfillFaehig += 1; }
  }
  return {
    vorgaengeGeprueft: understood.length,
    quarantaeniert,
    kritischeClaimsUnbestaetigt,
    dokumenteGeprueft,
    unbekannteQuellen,
    blockierteQuellen,
    praesentation: { vorgaengeGeprueft: understood.length, mitDisplayTitle, ohneDisplayTitle, backfillFaehig }
  };
}

// Interner KI-Status für den Admin-Datenstatus (Betreiber-Diagnose). Beruht
// AUSSCHLIESSLICH auf Env-FLAGS (nur Präsenz, NIE Werte/Secrets) und dem bereits
// VORHANDENEN llm_usage-Log. KEIN Live-KI-Call, KEINE KI-Kosten, keine Quellen-/
// Pipeline-/DB-Änderung. Nur über den admin-gegateten /api/admin/data-status sichtbar.
async function dsKiStatus() {
  // Nur Präsenz prüfen — Key/Endpoint/Service-Role werden NIE ausgegeben.
  const azureKey = Boolean(process.env.AZURE_OPENAI_KEY);
  const azureEndpoint = Boolean(process.env.AZURE_OPENAI_ENDPOINT);
  const azureDeployment = String(process.env.AZURE_OPENAI_DEPLOYMENT || "").trim();
  const openaiKey = Boolean(process.env.OPENAI_API_KEY);
  // Anbieter wie ai.isAzure()/isAiEnabled(): Azure NUR wenn Key UND Endpoint gesetzt.
  const anbieter = (azureKey && azureEndpoint) ? "azure" : (openaiKey ? "openai" : "nicht-konfiguriert");

  // Vorhandenes Kostenlog auswerten (newest-first). error ist bereits sanitisiert
  // (z. B. "Azure HTTP 404") — enthält keinen Rohbody/keine Secrets.
  let recent = [];
  try { recent = await getLlmUsage(null, 500); } catch (_) { recent = []; }
  const realCalls = (Array.isArray(recent) ? recent : []).filter((e) => e && !String(e.callType || "").startsWith("skipped"));
  const lastError = realCalls.find((e) => e.success === false) || null;
  const lastSuccess = realCalls.find((e) => e.success !== false) || null;

  let today = {};
  try { today = (await getLlmUsageToday(null)) || {}; } catch (_) { today = {}; }
  const gesamtHeute = dsNumOrNull(today.calls);
  const erfolgreichHeute = dsNumOrNull(today.successfulCalls);
  const fehlgeschlagenHeute = (gesamtHeute != null && erfolgreichHeute != null)
    ? Math.max(0, gesamtHeute - erfolgreichHeute) : null;

  const lastErrText = lastError && lastError.error ? String(lastError.error) : "";
  const deploymentNotFound = anbieter === "azure" && /404|deployment/i.test(lastErrText);

  return {
    anbieter,                                   // "azure" | "openai" | "nicht-konfiguriert"
    azureKeyGesetzt: azureKey,
    azureEndpointGesetzt: azureEndpoint,
    azureDeploymentGesetzt: Boolean(azureDeployment),
    azureDeploymentName: azureDeployment || null,   // NAME ist kein Secret (bewusst sichtbar)
    openaiKeyGesetzt: openaiKey,
    letzterFehler: lastError
      ? { when: lastError.createdAt || null, grund: lastErrText.slice(0, 160) || null, callType: lastError.callType || null }
      : null,
    letzterErfolg: lastSuccess
      ? { when: lastSuccess.createdAt || null, callType: lastSuccess.callType || null }
      : null,
    heute: { erfolgreich: erfolgreichHeute, fehlgeschlagen: fehlgeschlagenHeute, gesamt: gesamtHeute },
    hinweis: deploymentNotFound
      ? "Azure Deployment nicht gefunden. Bitte AZURE_OPENAI_DEPLOYMENT und AZURE_OPENAI_ENDPOINT in Vercel prüfen."
      : null
  };
}

// Interner Pipeline-Recovery-Status (nur Betreiber). READ-ONLY: liest KO-Zustände,
// Understanding-Lock, letzten Understanding-Lauf und KI-Fehler/-Erfolg aus Store bzw.
// llm_usage. KEIN KI-Call, KEINE Kosten, KEINE Secrets/Env-Werte.
async function buildPipelineRecoveryStatus() {
  const v3 = v3StoreReady();
  const naLive = { available: false, note: v3 ? "nur zur Laufzeit mit Daten ermittelbar" : "nur mit aktivem V3-Store (Supabase) ermittelbar" };

  let koStatus = naLive;
  if (v3) {
    let kos = [];
    try { kos = await listKnowledgeObjects({ limit: 1000 }); } catch (_) { kos = []; }
    const c = { pending: 0, failed: 0, complete: 0, sonstige: 0, gesamt: (kos || []).length };
    for (const k of (kos || [])) {
      const s = String((k && k.understanding_status) || "");
      if (s === "pending") c.pending += 1;
      else if (s === "failed") c.failed += 1;
      else if (s === "complete") c.complete += 1;
      else c.sonstige += 1;
    }
    koStatus = c;
  }

  // Understanding-Lock: aktiv = vorhanden & nicht abgelaufen; verdächtig = abgelaufen,
  // aber nicht aufgeräumt (Kandidat zum Lösen). Struktur: { lockedAt, expiresAt }.
  let lock = { aktiv: false, verdaechtig: false, gesetztVorSek: null };
  try {
    const store = await readAuthStore();
    const l = (store.pipelineLocks || {})["global-understanding"] || null;
    if (l) {
      const now = Date.now();
      const expired = typeof l.expiresAt === "number" && l.expiresAt <= now;
      lock = {
        aktiv: !expired,
        verdaechtig: Boolean(expired),
        gesetztVorSek: typeof l.lockedAt === "number" ? Math.max(0, Math.round((now - l.lockedAt) / 1000)) : null
      };
    }
  } catch (_) { /* fail-safe: kein Lock-Status */ }

  // Letzter Understanding-Lauf aus dem letzten Crawl-Run (processed/deferred/reason).
  const cr = await getLatestCrawlRun().catch(() => null);
  const u = (cr && cr.understanding) || null;
  const letztesErgebnis = u
    ? { verarbeitet: dsNumOrNull(u.processed), zurueckgestellt: dsNumOrNull(u.deferred), grund: u.reason || null }
    : null;

  // Letzter MANUELLER Admin-Recovery-Lauf (persistiert im Auth-Store). NUR LESEN, KEIN Write.
  // 'ohne-abschluss' abgeleitet: gestartet (status=running), aber kein Finish und Lock nicht
  // mehr aktiv -> der Lauf wurde nie sauber zurueckgemeldet (Reload/Function-Kill).
  const rec = await getAdminRecoveryLastRun().catch(() => null);
  let letzterRecoveryLauf = null;
  if (rec && rec.startedAt) {
    const ohneAbschluss = rec.status === "running" && !rec.finishedAt && !lock.aktiv;
    letzterRecoveryLauf = { ...rec, ohneAbschluss, anzeigeStatus: ohneAbschluss ? "ohne-abschluss" : (rec.status || null) };
  }

  // Letzter Understanding-Lauf = juengster aus Crawl-Run ODER manuellem Recovery-Lauf
  // (ISO-Strings sortieren chronologisch). So verschwindet ein manueller Lauf nicht.
  const crawlAt = cr ? (cr.createdAt || null) : null;
  const recAt = rec ? (rec.startedAt || null) : null;
  const letzterUnderstandingLauf = [crawlAt, recAt].filter(Boolean).sort().pop() || null;

  // KI-Fehler/-Erfolg aus dem vorhandenen llm_usage-Log (kein KI-Call).
  const ki = await dsKiStatus().catch(() => null);

  return {
    v3StoreAktiv: v3,
    knowledgeObjects: koStatus,
    understandingLock: lock,
    letzterUnderstandingLauf,
    letztesUnderstandingErgebnis: letztesErgebnis,
    letzterRecoveryLauf,
    letzterKiFehler: ki ? ki.letzterFehler : null,
    letzterKiErfolg: ki ? ki.letzterErfolg : null
  };
}

async function buildAdminDataStatus({ perAccountLimit = 25 } = {}) {
  const radar = require("./lib/helmut/radar");
  const [users, statsToday, crawlReport, latestCrawl, crawlRuns, recentErrors, catalogQuality, quarantineStats, kiStatus] = await Promise.all([
    accounts.listUsers().catch(() => []),
    getAdminStatsOverview({ days: 1 }).catch(() => null),
    getAdminStatsCrawlReport().catch(() => null),
    getLatestCrawlRun().catch(() => null),
    listCrawlRuns(20).catch(() => []),
    accounts.listSystemErrors(5).catch(() => []),
    dsSourceCatalogQuality().catch(() => null),
    dsQuarantineStats().catch(() => null),
    dsKiStatus().catch(() => null)
  ]);
  const v3 = v3StoreReady();
  const naLive = (extra = {}) => ({ value: null, available: false, note: v3 ? "nur zur Laufzeit mit Daten ermittelbar" : "nur mit aktivem V3-Store (Supabase) ermittelbar", ...extra });

  const cr = latestCrawl || {};
  // Morgenstatus über die Lauf-Liste (frühester erfolgreicher Tageslauf) — nicht
  // über den letzten (evtl. manuellen) Lauf. cr bleibt der Anzeige-"letzter Lauf".
  const morning = dsMorningStatus(crawlRuns && crawlRuns.length ? crawlRuns : latestCrawl);

  // ---------- pro Account ----------
  const mdbUsers = users.filter((u) => (u.role === "abgeordneter" || u.role === "referent") && u.politicianId);
  const seen = new Set();
  const accountsToScan = mdbUsers.filter((u) => (seen.has(u.politicianId) ? false : seen.add(u.politicianId)));
  const capped = accountsToScan.slice(0, perAccountLimit);

  let sumLage = 0, sumChance = 0, sumRisk = 0, sumBriefing = 0, shown = 0, noBriefing = 0, restrictedCount = 0;
  const perAccount = [];
  for (const u of capped) {
    const id = u.politicianId;
    const profile = await activeProfile(id).catch(() => null);
    const comp = profile ? profileCompleteness(profile) : { level: "empty", missing: ["profil"], restricted: false, complete: false };
    // Phase 5: zentrale Validierung (klarer Zustand + Funktionsauswirkung) —
    // konsumiert von der Admin-Profilverwaltung. Fail-safe: bei fehlendem Profil
    // ein „nicht bereit"-artiges Ergebnis, nie ein throw.
    const validierung = profile ? validateProfile(profile) : validateProfile({});
    let briefing = null, lage = null, rad = null;
    try { briefing = await buildV3Briefing(profile, id); } catch (_) {}
    // countOnly: NUR zaehlen, KEIN KI-Narrativ generieren. Sonst wuerde der
    // Datenstatus bis zu einen KI-Call PRO ACCOUNT ausloesen (Zeitueberschreitung +
    // KI-Kosten allein fuer die Admin-Anzeige). buildV3Briefing/radar sind 0-KI.
    try { lage = await buildLageBriefing(profile, { politicianId: id, countOnly: true }); } catch (_) {}
    try { rad = await radar.buildRadarForUser({ profile, userId: id }); } catch (_) {}
    const briefingPoints = briefing && briefing.available ? (briefing.items || []).length : 0;
    const lageCount = lage && lage.available ? (lage.vorgaenge || []).length : 0;
    const chance = rad && rad.buckets ? (rad.buckets.chance || []).length : 0;
    const risk = rad && rad.buckets ? (rad.buckets.risk || []).length : 0;
    const hasBriefing = Boolean(briefing && briefing.available && briefingPoints > 0);
    if (hasBriefing) shown += 1; else noBriefing += 1;
    if (comp.restricted || comp.empty) restrictedCount += 1;
    sumLage += lageCount; sumChance += chance; sumRisk += risk; sumBriefing += briefingPoints;
    // Audit-Fix (Folgebranch): Die Karte heißt "KI-Kosten heute" — früher wurde
    // aber die Summe der letzten 500 Log-Einträge OHNE Datumsfilter angezeigt
    // (also Tage bis Wochen vermischt). Jetzt echte Tagesaggregation.
    const usageToday = await getLlmUsageToday(id).catch(() => null);
    const cost = usageToday
      ? { calls: usageToday.calls, estimatedUsd: Number((usageToday.estimatedCostUsd || 0).toFixed(4)) }
      : { calls: null, estimatedUsd: null, note: "Kostenlog nicht lesbar" };
    perAccount.push({
      politicianId: id,
      name: u.name || u.email || id,
      profilVollstaendigkeit: { level: comp.level, complete: comp.complete, fehlendePflichtfelder: comp.missing },
      // Phase 5: klarer Zustand (Vollständig/Teilweise/Nicht bereit/Fehlerhaft/
      // Deaktiviert) + fehlende Pflichtfelder (mit Klartext-Labels) + welche
      // Funktion betroffen ist.
      validierung: {
        zustand: validierung.state,
        zustandLabel: validierung.stateLabel,
        grund: validierung.reason,
        bereit: validierung.ready,
        nutzbar: validierung.usable,
        deaktiviert: validierung.disabled,
        fehlendePflichtfelder: validierung.missingRequiredLabels,
        funktionsauswirkung: validierung.impact
      },
      personalisierungEingeschraenkt: Boolean(comp.restricted || comp.empty),
      briefingSichtbar: hasBriefing,
      briefingPunkte: briefingPoints,
      lageVorgaenge: lageCount,
      radarChancen: chance,
      radarRisiken: risk,
      kiKosten: cost,
      // Phase 4/10: KI-Budget pro Profil (Cent) — null = Systemdefault greift.
      kiBudget: {
        taeglichCent: profile && profile.aiBudgetDailyCents != null ? Number(profile.aiBudgetDailyCents) : null,
        monatlichCent: profile && profile.aiBudgetMonthlyCents != null ? Number(profile.aiBudgetMonthlyCents) : null
      },
      onboardingStatus: (profile && profile.onboardingStatus) || "neu",
      aktiv: !(profile && profile.profileActive === false),
      // Konto-Typ NUR aus persistierten Flags (nicht raten): es gibt kein bevorzugtes
      // Mandat, dessen ID einen "Pilot"-Typ herleiten wuerde.
      kontoTyp: u.kontoTyp || u.accountKind || u.kind || null,
      ampel: dsAccountAmpel({ level: comp.level, restricted: comp.restricted || comp.empty, hasBriefing })
    });
  }

  // ---------- global ----------
  const pipelineOk = dsNum(cr.successfulSources) > 0;
  const analyzed = dsNum(cr.understanding && cr.understanding.processed);
  const hasData = dsNum(crawlReport && crawlReport.newKnowledgeObjects) > 0 || sumBriefing > 0;
  const weakCoverage = dsNum(cr.checkedSources) > 0 && (dsNum(cr.failedSources) / Math.max(1, dsNum(cr.checkedSources))) > 0.5;
  const restrictedShare = capped.length ? restrictedCount / capped.length : 0;
  // KI-/Analyse-Ausfall: heute fehlgeschlagene KI-Calls ODER Dokumente geladen, aber
  // 0 Vorgaenge analysiert. Dann NIE gruen (der Crawl lief evtl. technisch, aber es
  // entstand kein brauchbarer inhaltlicher Stand).
  const aiFailedToday = Boolean(statsToday && statsToday.ai && dsNum(statsToday.ai.failedCalls) > 0);
  const analysisGap = aiFailedToday || (analyzed === 0 && dsNum(cr.savedItems) > 0);
  const globalAmpel = (!pipelineOk || !morning.ok)
    ? "rot"
    : ((weakCoverage || !hasData || restrictedShare > 0.5 || analysisGap) ? "gelb" : "gruen");

  const global = {
    letzterLauf: cr.createdAt || null,
    modus: cr.mode || null,
    quellen: {
      geprueft: dsNum(cr.checkedSources),
      erfolgreich: dsNum(cr.successfulSources),
      fehlgeschlagen: dsNum(cr.failedSources),
      nachKategorie: cr.sourcesByCategory || naLive({ note: "ab dem naechsten Crawl-Lauf verfuegbar" })
    },
    dokumente: {
      geladen: dsNumOrNull(cr.loadedItems) ?? naLive({ note: "ab dem naechsten Crawl-Lauf verfuegbar" }),
      // P1-5: EHRLICHER Durchsatz = echte neue raw_documents (relationaler Delta).
      // Der frühere Blob-savedItems-Zähler überzeichnete ~15x (Cap-Artefakt, Audit R8).
      // Review-Fix: NICHT dsNumOrNull benutzen — Number(null)===0 (finite) würde ein
      // ehrliches null ("unbekannt", relationaler Pfad aus/fehlgeschlagen) still zu 0
      // machen und den naLive-Marker unterdrücken. Deshalb explizite null-Prüfung:
      // null/undefined -> "unbekannt"-Marker, sonst der echte relationale Delta.
      neu: (cr.newRawDocuments == null)
        ? naLive({ note: "relationaler Delta ab naechstem Crawl-Lauf; blob-Wert cap-verzerrt" })
        : dsNum(cr.newRawDocuments),
      neuBlobRoh: dsNum(cr.savedItems),
      verworfen: dsNumOrNull(cr.discardedItems) ?? naLive({ note: "ab dem naechsten Crawl-Lauf verfuegbar" }),
      duplikate: dsNumOrNull(cr.duplicates) ?? naLive({ note: "ab dem naechsten Crawl-Lauf verfuegbar" }),
      // Ehrlich gezaehlt: Vorgaenge, die der Source-Safety-Guard aktuell aus dem
      // Briefing haelt (nur-blockierte Quellen ODER kritischer, unbestaetigter Claim).
      quarantaeniert: quarantineStats ? quarantineStats.quarantaeniert : naLive()
    },
    vorgaenge: {
      erzeugt: crawlReport ? dsNumOrNull(crawlReport.newVorgaenge) : null,
      knowledgeObjectsNeu: crawlReport ? dsNumOrNull(crawlReport.newKnowledgeObjects) : null,
      analysiert: dsNum(cr.understanding && cr.understanding.processed),
      aktualisiert: naLive(),
      mitQuellen: naLive(),
      mitMandatsbezug: (cr.matching && dsNumOrNull(cr.matching.matched)) ?? naLive(),
      mitEmpfehlung: (cr.decisions && dsNumOrNull(cr.decisions.candidates)) ?? naLive()
    },
    // Quellen-Sicherheit: Katalog-Qualitaet (Kategorie/Vertrauen, Medien als eigene
    // Kategorie) IMMER; Live-Quarantaene-Zahlen nur mit V3-Store ehrlich zaehlbar.
    quellenSicherheit: {
      katalog: catalogQuality || naLive({ note: "Quellenkatalog nicht ladbar" }),
      quarantaene: quarantineStats || naLive()
    },
    // Praesentations-Abdeckung: wie viele verstandene Vorgaenge haben einen
    // kuratierten display_title, wie viele fehlen, wie viele sind backfill-faehig
    // (ohne Titel + mit Quellen). Ehrlich gezaehlt, n/v ohne V3-Store.
    praesentation: (quarantineStats && quarantineStats.praesentation) || naLive(),
    // Interner KI-Status: Anbieter + Env-FLAGS (keine Werte/Secrets) + Fehler/Erfolg
    // aus dem vorhandenen llm_usage-Log. KEIN Live-KI-Call, KEINE Kosten.
    kiStatus: kiStatus || naLive({ note: "KI-Status nicht ermittelbar" }),
    lage: { vorgaengeGesamt: sumLage },
    radar: { chancen: sumChance, risiken: sumRisk },
    briefing: { punkteGesamt: sumBriefing, sichtbarBeiAccounts: shown, accountsOhneBriefing: noBriefing },
    profile: { accountsGesamt: mdbUsers.length, ausgewertet: capped.length, personalisierungEingeschraenkt: restrictedCount },
    ki: statsToday && statsToday.ai
      ? { proLauf: statsToday.ai.totalCostUsd, calls: statsToday.ai.totalCalls, tokens: statsToday.ai.totalTokens, note: "Tages-Summe (heute)" }
      : naLive(),
    letzterErfolgreicherLauf: pipelineOk ? (cr.createdAt || null) : null,
    letzterFehler: dsSummarizeError(recentErrors[0]),
    kiAnalyseFehler: aiFailedToday,
    morgenstatus0730: morning,
    ampel: globalAmpel
  };

  return {
    generatedAt: new Date().toISOString(),
    intern: true,
    v3StoreAktiv: v3,
    hinweis: capped.length < mdbUsers.length ? `Pro-Account-Auswertung auf ${perAccountLimit} Accounts begrenzt (${mdbUsers.length} gesamt).` : null,
    global,
    perAccount,
    legende: DATA_STATUS_LEGEND
  };
}

// Klare deutsche Bedeutungen fuer die Admin-Datenstatus-Werte (Punkt 10: Zahlen erklaeren).
const DATA_STATUS_LEGEND = {
  "quellen.geprueft": "Wie viele Quellen im letzten Lauf abgefragt wurden.",
  "quellen.erfolgreich": "Quellen, die erreichbar waren und Daten geliefert haben.",
  "quellen.fehlgeschlagen": "Quellen, die nicht erreichbar waren oder Fehler hatten.",
  "quellen.nachKategorie": "Geprueft je Kategorie: offiziell, medien, partei_fraktion, regional, profil, unbekannt.",
  "dokumente.geladen": "Roh eingesammelte Artikel/Meldungen/Dokumente.",
  "dokumente.neu": "Davon noch nicht in Helmut bekannt.",
  "dokumente.verworfen": "Aussortiert (Dedup im Lauf + Kandidaten-Cap).",
  "dokumente.duplikate": "Inhalte, die ueber Laeufe bereits bekannt waren.",
  "dokumente.quarantaeniert": "Wegen unbekannter Quelle/niedriger Vertrauensstufe/kritischem unbestaetigtem Claim nicht ins Briefing.",
  "quellenSicherheit.katalog": "Konfigurierter Quellenkatalog nach Kategorie (offiziell/medien/partei_fraktion/regional/profil/unbekannt) und Vertrauensstufe (hoch/mittel/niedrig/blockiert/unbekannt). Medien bleibt eigene Kategorie.",
  "quellenSicherheit.quarantaene": "Live gezaehlt ueber verstandene Vorgaenge: quarantaeniert (nicht ins Briefing), kritische unbestaetigte Claims, gepruefte Dokumente sowie unbekannte/blockierte Quell-Dokumente.",
  "praesentation": "Anzeige-Titel-Abdeckung: mitDisplayTitle (kuratierter Titel vorhanden), ohneDisplayTitle (Fallback-Ableitung noetig), backfillFaehig (ohne Titel + mit Quellen -> per Presentation-Backfill verbesserbar).",
  "kiStatus": "Interner KI-Status (nur Betreiber): aktiver Anbieter, ob Azure Key/Endpoint/Deployment GESETZT sind (nur ja/nein, keine Werte), erwarteter Deployment-Name, letzter KI-Fehler/-Erfolg und Erfolgs-/Fehlerzahl heute aus dem llm_usage-Log. Kein Live-KI-Call.",
  "vorgaenge.erzeugt": "Neue politische Themencluster (Vorgaenge) aus den Dokumenten.",
  "vorgaenge.aktualisiert": "Bestehende Vorgaenge, die durch neue Dokumente ergaenzt wurden.",
  "vorgaenge.analysiert": "Vorgaenge, die von Helmut inhaltlich bewertet wurden.",
  "vorgaenge.mitQuellen": "Vorgaenge mit mindestens einer nachvollziehbaren Quelle.",
  "vorgaenge.mitMandatsbezug": "Vorgaenge, die zu mindestens einem Account-Profil passen.",
  "vorgaenge.mitEmpfehlung": "Vorgaenge mit verwertbarer Handlungsempfehlung.",
  "lage.vorgaengeGesamt": "In Aktuelle Lage angezeigte Vorgaenge (Summe ueber Accounts).",
  "radar.chancen": "Erkannte Chancen (global = ueber alle Accounts).",
  "radar.risiken": "Erkannte Risiken (global = ueber alle Accounts).",
  "briefing.punkteGesamt": "Konkrete Helmut-Briefing-Punkte (priorisierte Info/Empfehlung/Entscheidungshilfe, keine Einzelquelle).",
  "briefing.sichtbarBeiAccounts": "Accounts, bei denen heute ein Briefing sichtbar war.",
  "briefing.accountsOhneBriefing": "Accounts ohne ausreichendes Briefing heute.",
  "profilVollstaendigkeit": "Ob ein Account genug Angaben hat, damit Helmut sinnvoll personalisiert (fehlende Pflichtfelder markiert).",
  "personalisierungEingeschraenkt": "Profil zu unvollstaendig fuer starke Personalisierung — Helmut raet NICHT und nutzt KEIN fremdes Profil.",
  "letzterErfolgreicherLauf": "Wann der Datenmotor zuletzt erfolgreich lief.",
  "letzterFehler": "Wann/wo zuletzt ein Fehler auftrat.",
  "morgenstatus0730": "Ob Helmut bis 7:30 Berlin-Zeit einen brauchbaren Stand hatte.",
  "ki.proLauf": "Ungefaehrer KI-Verbrauch (heute, USD-Schaetzung).",
  "kiKosten": "Ungefaehrer KI-Verbrauch je Account.",
  "ampel": "Gruen: Lauf ok + relevante Vorgaenge oder sauberer Leerstatus. Gelb: wenig Daten/unvollstaendiges Profil/eingeschraenkte Personalisierung/schwache Abdeckung. Rot: Pipeline-Fehler, kein aktueller Stand, fremder Fallback oder kein Stand bis 7:30."
};

async function normalizeTask(task, politicianId) {
  politicianId = tenantContext.requireTenantId(politicianId, "normalizeTask");
  const profile = await activeProfile(politicianId);
  return {
    id: task.id || `task-${Date.now()}`,
    // SICHERHEIT: politicianId kommt AUSSCHLIESSLICH aus der serverseitig aufgeloesten
    // Session (profile.id), niemals aus dem Client-Body — sonst koennte ein Nutzer
    // Aufgaben in ein fremdes Mandat schreiben (IDOR/Mandantenbruch).
    politicianId: profile.id,
    title: String(task.title || "").trim(),
    description: String(task.description || "").trim(),
    priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
    dueDate: task.dueDate || new Date().toISOString(),
    assignee: String(task.assignee || "Büroleitung").trim(),
    status: ["open", "in_progress", "done"].includes(task.status) ? task.status : "open",
    sourceSignalId: task.sourceSignalId || "",
    politicalBenefit: task.politicalBenefit || "",
    riskIfIgnored: task.riskIfIgnored || "",
    sources: Array.isArray(task.sources) ? task.sources : [],
    primarySource: task.primarySource || null,
    confidence: task.confidence || "medium",
    sourceNote: task.sourceNote || "",
    createdAt: task.createdAt || new Date().toISOString()
  };
}

async function normalizeInteraction(interaction, politicianId) {
  politicianId = tenantContext.requireTenantId(politicianId, "normalizeInteraction");
  const profile = await activeProfile(politicianId);
  return {
    // SICHERHEIT: siehe normalizeTask — politicianId niemals aus dem Client-Body.
    politicianId: profile.id,
    signalId: interaction.signalId || "",
    taskId: interaction.taskId || "",
    recommendationId: interaction.recommendationId || interaction.recommendation_id || "",
    politicalItemId: interaction.politicalItemId || interaction.political_item_id || "",
    topic: String(interaction.topic || "").trim(),
    title: String(interaction.title || "").trim(),
    sourceName: String(interaction.sourceName || "").trim(),
    type: interaction.type || "unknown",
    metadata: interaction.metadata || {}
  };
}

async function normalizeUserNote(note, politicianId) {
  politicianId = tenantContext.requireTenantId(politicianId, "normalizeUserNote");
  const profile = await activeProfile(politicianId);
  return {
    id: note.id,
    user_id: profile.id,
    recommendation_id: note.recommendation_id || note.recommendationId || "",
    political_item_id: note.political_item_id || note.politicalItemId || "",
    type: note.type || "note",
    text: String(note.text || "").trim(),
    status: note.status || "open"
  };
}

async function activeProfile(politicianId) {
  politicianId = tenantContext.requireTenantId(politicianId, "activeProfile");
  const stored = await getProfile(politicianId);
  if (stored) return mergeProfileDefaults(stored);
  // Fehlt das gespeicherte Profil, greift fuer JEDES Mandat (auch den Piloten)
  // das neutrale blankProfile — Profildaten sind ausschliesslich Datensaetze
  // im Store, niemals Code-Konstanten.
  return blankProfile(politicianId);
}

// Neutrale Default-Werte fuer JEDES Mandat — ausnahmslos. Kein Mandat erbt
// inhaltliche Defaults eines anderen (Ausschuesse, Themen, Positionen). Nur
// generisches Geruest, damit der Briefing-Motor arbeiten kann, bleibt vorbelegt.
function blankProfile(id) {
  return {
    id,
    fullName: readableNameFromId(id),
    party: "",
    faction: "",
    function: "Bundestagsabgeordnete:r",
    role: "Bundestagsabgeordnete:r",
    accountType: "abgeordneter",
    parliamentType: "",
    politicalLevel: "Bund",
    constituency: "",
    state: "",
    location: "",
    committee: "",
    committees: [],
    committeeUnknown: true,
    focusTopics: [],
    topicPriorities: {},
    mainQuestion: "Was ist heute für mein Mandat wichtig und worauf sollte ich reagieren?",
    monitoringTargets: ["Meine Partei", "Meine Person", "Bundesregierung Vorhaben"],
    outputNeeds: [
      "Was ist heute wichtig?",
      "Was kann ignoriert werden?",
      "Worauf sollte ich reagieren?",
      "Welche Chance entsteht?",
      "Welches Risiko entsteht?",
      "Welche Formulierung kann ich nutzen?"
    ],
    regionalInterests: [],
    relevantMinistries: ["Bundesregierung"],
    opponents: [],
    localMedia: [],
    communicationStyle: "Sachlich",
    riskTopics: [],
    opportunityTopics: [],
    noGoTopics: [],
    preferredChannels: ["presse", "linkedin"],
    officeHandoffMethod: "share",
    reportingTopics: [],
    currentCampaigns: [],
    publicPositions: [],
    keyAudiences: [],
    upcomingAppointments: []
  };
}

function mergeProfileDefaults(profile) {
  // JEDES Mandat erhaelt die neutrale blankProfile-Basis; gespeicherte Felder
  // ueberschreiben sie. Es gibt kein Demo-Mandat mit Sonder-Defaults mehr.
  const base = blankProfile(profile.id);
  return {
    ...base,
    ...profile,
    function: stringValue(profile.function, base.function),
    constituency: stringValue(profile.constituency, base.constituency),
    state: stringValue(profile.state, base.state),
    location: stringValue(profile.location, base.location),
    mainQuestion: stringValue(profile.mainQuestion, base.mainQuestion),
    communicationStyle: stringValue(profile.communicationStyle, base.communicationStyle),
    committees: mergeArrayValue(profile.committees, base.committees),
    focusTopics: mergeArrayValue(profile.focusTopics, base.focusTopics),
    topicPriorities: topicPriorityValue(profile.topicPriorities, base.topicPriorities),
    regionalInterests: mergeArrayValue(profile.regionalInterests, base.regionalInterests),
    relevantMinistries: mergeArrayValue(profile.relevantMinistries, base.relevantMinistries),
    monitoringTargets: mergeArrayValue(profile.monitoringTargets, base.monitoringTargets),
    outputNeeds: mergeArrayValue(profile.outputNeeds, base.outputNeeds),
    opponents: mergeArrayValue(profile.opponents, base.opponents),
    localMedia: mergeArrayValue(profile.localMedia, base.localMedia),
    noGoTopics: mergeArrayValue(profile.noGoTopics, base.noGoTopics),
    politicalLevel: profile.politicalLevel || base.politicalLevel,
    role: profile.role || profile.function || base.role,
    reportingTopics: mergeArrayValue(profile.reportingTopics, base.reportingTopics),
    currentCampaigns: mergeArrayValue(profile.currentCampaigns, base.currentCampaigns),
    publicPositions: mergeArrayValue(profile.publicPositions, base.publicPositions),
    keyAudiences: mergeArrayValue(profile.keyAudiences, base.keyAudiences),
    riskTopics: mergeArrayValue(profile.riskTopics, base.riskTopics),
    opportunityTopics: mergeArrayValue(profile.opportunityTopics, base.opportunityTopics),
    preferredChannels: mergeArrayValue(profile.preferredChannels, base.preferredChannels),
    officeHandoffMethod: officeHandoffMethodValue(profile.officeHandoffMethod, base.officeHandoffMethod),
    upcomingAppointments: appointmentValue(profile.upcomingAppointments, base.upcomingAppointments)
  };
}

async function normalizeProfile(profile, politicianId) {
  politicianId = tenantContext.requireTenantId(politicianId, "normalizeProfile");
  const base = await activeProfile(politicianId);
  // Abgeleitete Nur-Anzeige-Felder NIE persistieren (Review-Fix): GET/app-start
  // hängen profilValidierung an das zurückgegebene Profil; sendet ein Client das
  // Objekt roh zurück, würde der veraltete Validierungsstand sonst über `...profile`
  // dauerhaft im Blob (und im Privacy-Export) landen. Er wird ohnehin bei jedem
  // Read neu berechnet.
  if (profile && typeof profile === "object" && "profilValidierung" in profile) {
    profile = { ...profile };
    delete profile.profilValidierung;
  }
  const next = {
    ...base,
    ...profile,
    id: base.id,
    fullName: stringValue(profile.fullName, base.fullName),
    party: stringValue(profile.party, base.party),
    faction: stringValue(profile.faction, base.faction),
    function: stringValue(profile.function, base.function || "Bundestagsabgeordneter"),
    constituency: stringValue(profile.constituency, base.constituency),
    state: stringValue(profile.state, base.state),
    location: stringValue(profile.location, base.location || "Noch offen"),
    committee: stringValue(profile.committee, base.committee),
    committees: arrayValue(profile.committees, profile.committee ? [profile.committee] : base.committees),
    focusTopics: arrayValue(profile.focusTopics, base.focusTopics),
    topicPriorities: topicPriorityValue(profile.topicPriorities, base.topicPriorities),
    regionalInterests: arrayValue(profile.regionalInterests, base.regionalInterests),
    relevantMinistries: arrayValue(profile.relevantMinistries, base.relevantMinistries),
    monitoringTargets: arrayValue(profile.monitoringTargets, base.monitoringTargets),
    outputNeeds: arrayValue(profile.outputNeeds, base.outputNeeds),
    opponents: arrayValue(profile.opponents, base.opponents),
    localMedia: arrayValue(profile.localMedia, base.localMedia),
    communicationStyle: stringValue(profile.communicationStyle, base.communicationStyle),
    noGoTopics: arrayValue(profile.noGoTopics, base.noGoTopics),
    mainQuestion: stringValue(profile.mainQuestion, base.mainQuestion)
  };
  next.role = stringValue(profile.role, next.function);
  // Kontotyp + politische Ebene (Bundestag/Landtag) persistieren — Grundlage fuer
  // profilbasierte Ingestion und Admin-Vollstaendigkeitspruefung.
  next.accountType = stringValue(profile.accountType, base.accountType || "abgeordneter");
  next.parliamentType = stringValue(profile.parliamentType, base.parliamentType || "");
  next.politicalLevel = stringValue(profile.politicalLevel, base.politicalLevel || "Bund");
  next.reportingTopics = arrayValue(profile.reportingTopics, base.reportingTopics);
  next.currentCampaigns = arrayValue(profile.currentCampaigns, base.currentCampaigns);
  next.publicPositions = arrayValue(profile.publicPositions, base.publicPositions);
  next.keyAudiences = arrayValue(profile.keyAudiences, base.keyAudiences);
  next.riskTopics = arrayValue(profile.riskTopics, base.riskTopics);
  next.opportunityTopics = arrayValue(profile.opportunityTopics, base.opportunityTopics);
  // Umsetzungsnotiz §8: "Bevorzugte Kanaele" ist kein UI-Feld mehr (war Dublette zu
  // den Buero-Formaten). Die Kanal-Passung im Scoring (channelFactor) braucht aber
  // weiterhin eine Quelle -> aus den aktiven officeFormats ableiten. Explizit
  // gesendete preferredChannels (Admin/API-Altpfade) gewinnen weiterhin.
  // Explizit gesendetes officeFormats gewinnt (auch []: "alle Formate abgewaehlt"
  // muss die Kanaele ehrlich leeren, nicht den alten Stand einfrieren); ohne das
  // Feld im Body zaehlt der gespeicherte Bestand.
  const officeFormatsSent = Array.isArray(profile.officeFormats);
  const officeFormatsValue = officeFormatsSent
    ? profile.officeFormats
    : (Array.isArray(base.officeFormats) ? base.officeFormats : null);
  if (Array.isArray(profile.preferredChannels) && profile.preferredChannels.length) {
    next.preferredChannels = arrayValue(profile.preferredChannels, base.preferredChannels);
  } else if (officeFormatsValue) {
    next.preferredChannels = deriveChannelsFromOfficeFormats(officeFormatsValue);
  } else {
    next.preferredChannels = arrayValue(profile.preferredChannels, base.preferredChannels);
  }
  next.officeHandoffMethod = officeHandoffMethodValue(profile.officeHandoffMethod, base.officeHandoffMethod);
  next.upcomingAppointments = appointmentValue(profile.upcomingAppointments, base.upcomingAppointments);
  next.committees = next.committee ? [next.committee] : next.committees;
  // Mehrmandantenfaehigkeit Phase 2/4: neue strukturierte Profilfelder. Nur
  // uebernehmen, wenn explizit im Body -> sonst Basiswert behalten (Bearbeiten
  // darf nie ungewollt Felder loeschen). profileActive/onboardingStatus tragen
  // Defaults (aktiv / neu), damit Bestandsprofile ohne die Felder gueltig bleiben.
  next.nameVariants = arrayValue(profile.nameVariants, base.nameVariants);
  next.deputyCommittees = arrayValue(profile.deputyCommittees, base.deputyCommittees);
  next.regionalTopics = arrayValue(profile.regionalTopics, base.regionalTopics);
  next.governmentRole = governmentRoleValue(profile.governmentRole, base.governmentRole);
  next.onboardingStatus = onboardingStatusValue(profile.onboardingStatus, base.onboardingStatus);
  next.profileActive = profileActiveValue(profile.profileActive, base.profileActive);
  next.aiBudgetDailyCents = budgetCentValue(profile.aiBudgetDailyCents, base.aiBudgetDailyCents);
  next.aiBudgetMonthlyCents = budgetCentValue(profile.aiBudgetMonthlyCents, base.aiBudgetMonthlyCents);
  return next;
}

// Umsetzungsnotiz §8 — Buero-Format -> Kanal, exakt wie in der Notiz:
// presse->press, anfrage->committee_question, buergerbrief->citizen_dialogue,
// intern->internal_line, Rest direkt (linkedin/x/instagram/rede unveraendert;
// "rede" kennt scoring.js bereits als parlamentarischen Kanal).
const OFFICE_FORMAT_TO_CHANNEL = {
  presse: "press",
  anfrage: "committee_question",
  buergerbrief: "citizen_dialogue",
  intern: "internal_line"
};

function deriveChannelsFromOfficeFormats(formats) {
  if (!Array.isArray(formats)) return [];
  const channels = [];
  for (const format of formats) {
    const key = String(format || "").trim().toLowerCase();
    if (!key) continue;
    const channel = OFFICE_FORMAT_TO_CHANNEL[key] || key;
    if (!channels.includes(channel)) channels.push(channel);
  }
  return channels;
}

// Regierungsrolle: nur erlaubte Enum-Werte, sonst Basiswert (nie raten).
function governmentRoleValue(value, fallback) {
  const allowed = new Set(["regierung", "opposition", "unbekannt"]);
  const v = String(value || "").trim().toLowerCase();
  if (allowed.has(v)) return v;
  return fallback || null;
}

function onboardingStatusValue(value, fallback) {
  const allowed = new Set(["neu", "in_bearbeitung", "abgeschlossen"]);
  const v = String(value || "").trim().toLowerCase();
  if (allowed.has(v)) return v;
  return fallback || "neu";
}

// aktiv: nur ein echter Boolean/„false"-String deaktiviert; Default aktiv.
function profileActiveValue(value, fallback) {
  if (value === true || value === false) return value;
  const v = String(value == null ? "" : value).trim().toLowerCase();
  if (v === "false" || v === "0" || v === "nein" || v === "inaktiv") return false;
  if (v === "true" || v === "1" || v === "ja" || v === "aktiv") return true;
  return fallback === false ? false : true;
}

// KI-Budget in Cent: leere Eingabe -> null (Systemdefault greift). Ungueltige
// Eingabe (<=0/NaN) wird NICHT stillschweigend zu einem Wert gemacht — sie bleibt
// erhalten, damit die Validierung (Phase 5) sie als „fehlerhaft" melden kann.
// Genau 0 als Loesch-/Reset-Signal: null (Systemdefault).
function budgetCentValue(value, fallback) {
  if (value === undefined) return fallback == null ? null : fallback;
  if (value === null || String(value).trim() === "") return null;
  const num = Number(value);
  if (Number.isFinite(num) && num === 0) return null; // 0 = zuruecksetzen auf Default
  if (Number.isFinite(num) && Number.isInteger(num) && num > 0) return num;
  return value; // ungueltig: unveraendert durchreichen -> Validierung meldet „fehlerhaft"
}

function politicianIdFromUrl(url) {
  // KEIN Fallback-Mandat: ohne (gueltigen) Parameter "" -> Aufrufer brechen sicher
  // ab bzw. loesen den Mandanten aus dem aktiven DB-Bestand auf.
  return tenantContext.slugifyTenantId(url.searchParams.get("politicianId") || url.searchParams.get("profileId"));
}

function readableNameFromId(id) {
  return String(id || "")
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Neues Mandat";
}

function stringValue(value, fallback) {
  const text = String(value || "").trim();
  return text && !isPlaceholderValue(text) ? text : fallback;
}

function isPlaceholderValue(value) {
  return /^(noch offen|unbekannt|keine angabe|n\/a|none|null|-|—)$/i.test(String(value || "").trim());
}

function officeHandoffMethodValue(value, fallback = "share") {
  const allowed = new Set(["share", "email", "whatsapp", "telegram"]);
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "signal") return "share";
  if (allowed.has(normalized)) return normalized;
  const fallbackValue = String(fallback || "").trim().toLowerCase();
  if (fallbackValue === "signal") return "share";
  return allowed.has(fallbackValue) ? fallbackValue : "share";
}

function arrayValue(value, fallback) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
  return fallback || [];
}

function mergeArrayValue(value, fallback) {
  const primary = arrayValue(value, []);
  const defaults = arrayValue(fallback, []);
  return uniqueTextValues([...primary, ...defaults]);
}

function uniqueTextValues(values) {
  const seen = new Set();
  return values.filter((value) => {
    const text = String(value || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function appointmentValue(value, fallback) {
  const appointments = arrayValue(value, []);
  const upcoming = appointments.filter((entry) => !isPastAppointment(entry));
  return upcoming.length ? upcoming : fallback || [];
}

function isPastAppointment(entry) {
  const parts = String(entry || "").split(/\s*[|;]\s*/).filter(Boolean);
  const dateText = parts[1] || "";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now() - 12 * 60 * 60 * 1000;
}

function topicPriorityValue(value, fallback) {
  const priorities = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    Object.entries(value).forEach(([topic, priority]) => {
      const cleanTopic = String(topic || "").trim();
      const cleanPriority = Math.max(1, Math.min(5, Number(priority) || 1));
      if (cleanTopic) priorities[cleanTopic] = cleanPriority;
    });
  }
  return Object.keys(priorities).length ? { ...(fallback || {}), ...priorities } : fallback || {};
}

// Aktive Mandate (id + Anzeigename) fuer die Mandatsauswahl im Legacy-Zugang.
// Rein datenbankbasiert (aktive Mandate = Zugriffsmenge), kein bevorzugtes Mandat.
async function activeMandateList() {
  const profiles = await listFullProfiles().catch(() => []);
  return (Array.isArray(profiles) ? profiles : [])
    .filter((p) => tenantContext.isActiveMandate(p))
    .map((p) => ({ id: tenantContext.slugifyTenantId(p.id), name: p.fullName || readableNameFromId(p.id) }))
    .filter((m) => m.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Legacy-Zugang ohne aufloesbaren EINZELmandanten: klarer Auswahl-/Leerzustand,
// NIE ein geratener Mandant und KEIN Pilot-/Konfig-Fehler. 0 aktive Mandate -> 200
// Leerzustand; mehrere -> 409 mit Auswahlliste (der Client rendert die Auswahl).
function sendMandateSelectionRequired(response, mandates = []) {
  const list = Array.isArray(mandates) ? mandates : [];
  const status = list.length > 1 ? 409 : 200;
  response.writeHead(status, jsonHeaders());
  response.end(JSON.stringify({
    needsMandateSelection: list.length > 1,
    empty: list.length === 0,
    mandates: list,
    reason: list.length > 1 ? "mehrere-mandanten-auswahl-noetig" : "keine-aktiven-mandanten"
  }, null, 2));
}

// Mandantenaufloesung + Isolation fuer mandantenbezogene Crons.
// Mandate kommen AUSSCHLIESSLICH aus der Datenbank (tenant-context.resolveCronTenants):
// ALLE aktiven Mandate, jedes isoliert. Kein Environment, kein Flag, kein bevorzugtes
// Mandat. 0 aktive Mandate -> sauberer Lauf mit 0 verarbeiteten (ok:true). Eine
// Ladestoerung der Mandantenliste -> ok:false + Systemfehler (von 0-Mandate
// unterscheidbar). Isolation: jedes Mandat in eigenem try/catch — ein fehlerhaftes
// Mandat stoppt die anderen nicht; ein hartes Zeitbudget sorgt fuer eine Antwort.
async function runCronForTenants(cronName, perTenant, { deadlineMs = 240000 } = {}) {
  const startedMs = Date.now();
  const { tenantIds, reason } = await tenantContext.resolveCronTenants();
  if (!tenantIds.length) {
    // EHRLICHER Grund statt pauschalem "nicht konfiguriert": eine Ladestoerung
    // (Blob/DB nicht erreichbar) meldet ok:false, damit Monitoring sie von einem
    // bewussten Leerlauf unterscheiden kann.
    const ladeStoerung = reason === "mandanten-liste-nicht-ladbar";
    console[ladeStoerung ? "error" : "warn"](`[cron/${cronName}] ${ladeStoerung ? "Mandantenliste nicht ladbar" : "0 aktive Mandate"} — ${reason}.`);
    if (ladeStoerung) {
      await accounts.recordSystemError({ scope: `cron-${cronName}`, message: "Mandantenliste nicht ladbar — Cron-Lauf uebersprungen.", path: `/api/cron/${cronName}` }).catch(() => {});
    }
    return { ok: !ladeStoerung, skipped: true, reason, tenants: 0, results: [] };
  }
  const deadline = startedMs + deadlineMs;
  const results = [];
  for (const tenantId of tenantIds) {
    if (Date.now() > deadline) {
      results.push({ politicianId: tenantId, skipped: true, reason: "zeitbudget" });
      continue;
    }
    try {
      const result = await perTenant(tenantId);
      results.push({ politicianId: tenantId, ...(result && typeof result === "object" ? result : { result }) });
    } catch (error) {
      // Fehler-Isolation: nur DIESES Mandat scheitert; Fehler wird protokolliert.
      console.error(`[cron/${cronName}] Mandant ${tenantId} fehlgeschlagen (isoliert):`, error && error.message);
      results.push({ politicianId: tenantId, error: error && error.message, failed: true });
    }
  }
  // SICHTBARKEIT (Incident 2026-07-25): vom Zeitbudget abgeschnittene Mandate
  // standen bisher nur im Antwort-Body, den niemand liest — vier aktive Mandate
  // wurden dadurch über Tage NIE gecrawlt, ohne jedes Signal. Ein Systemfehler
  // macht den Abschnitt im Health-Report/Fehler-Spike sichtbar. Fail-safe.
  const budgetSkipped = results.filter((r) => r && r.skipped && r.reason === "zeitbudget");
  if (budgetSkipped.length) {
    console.error(`[cron/${cronName}] Zeitbudget erschoepft — ${budgetSkipped.length} von ${tenantIds.length} Mandaten NICHT verarbeitet.`);
    await accounts.recordSystemError({
      scope: `cron-${cronName}`,
      message: `Zeitbudget erschoepft: ${budgetSkipped.length} von ${tenantIds.length} Mandaten nicht verarbeitet.`,
      path: `/api/cron/${cronName}`
    }).catch(() => {});
  }
  return { ok: true, tenants: tenantIds.length, durationMs: Date.now() - startedMs, results, budgetSkipped: budgetSkipped.length };
}

// Cron-Autorisierung — FAIL CLOSED.
// Schreibt bei Ablehnung selbst die Antwort und gibt false zurueck; bei Erfolg true.
// - Fehlt CRON_SECRET: Endpoint ist NICHT offen, sondern 503 mit klarer Meldung.
// - Falsches/fehlendes Secret: 403.
// So kann eine vergessene Env-Variable die Cron-Routen (Voll-Crawl, Pipeline,
// Briefing, Health) niemals weltweit ausloesbar machen.
function authorizeCron(request, url, response) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    response.writeHead(503, jsonHeaders());
    response.end(JSON.stringify({
      error: "Cron-Endpunkte sind deaktiviert: CRON_SECRET ist auf dem Server nicht gesetzt. Bitte die Umgebungsvariable CRON_SECRET in Vercel (Project → Settings → Environment Variables) setzen."
    }, null, 2));
    return false;
  }
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : allowQuerySecrets()
      ? url.searchParams.get("secret")
      : "";
  if (!token || !timingSafeEqual(token, secret)) {
    response.writeHead(403, jsonHeaders());
    response.end(JSON.stringify({ error: "Forbidden: ungültiges oder fehlendes Cron-Secret." }, null, 2));
    return false;
  }
  return true;
}

function sendUnauthorized(response) {
  response.writeHead(401, jsonHeaders());
  response.end(JSON.stringify({ error: "Unauthorized" }, null, 2));
}

function sendNotFound(response) {
  response.writeHead(404, jsonHeaders());
  response.end(JSON.stringify({ error: "Not found" }, null, 2));
}

function sendForbidden(response, error = "Forbidden", reason = null) {
  response.writeHead(403, jsonHeaders());
  response.end(JSON.stringify(reason ? { error, reason } : { error }, null, 2));
}

// ---------------------------------------------------------------------------
// TEMPORAERE DEBUG-ENDPUNKTE (Live-Gang-Diagnose) — nach Live-Gang entfernen
// ---------------------------------------------------------------------------

// SICHERHEIT: bevorzugt (wie hasAdminBypass/authorizeCron) den Authorization-Header;
// ein Secret in der Query-String landet sonst in Access-Logs/Referer/Browserverlauf.
// Query-Secret nur noch, wenn explizit ueber HELMUT_ALLOW_QUERY_SECRETS=true erlaubt
// (vorher war das hier die einzige Stelle im Code, die dieses Flag ignorierte).
function isDebugSecretOk(request, url) {
  // Konsistent mit hasAdminBypass: HELMUT_ADMIN_SECRET, ersatzweise CRON_SECRET.
  // Bleibt fail-closed (kein Secret gesetzt -> 404) und admin-/secret-geschützt.
  const secret = process.env.HELMUT_ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request?.headers?.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : allowQuerySecrets()
      ? url.searchParams.get("secret")
      : "";
  return Boolean(token) && timingSafeEqual(token, secret);
}

async function handleDebugRequest(request, response, url) {
  // Ohne ?politicianId: einziges aktives Mandat aufloesen (kein bevorzugtes Mandat).
  // Mehrere/keine aktiven Mandate -> Auswahl-/Leerzustand statt generischem 500
  // (der zudem die systemErrors-Metrik verschmutzen wuerde).
  let politicianId = politicianIdFromUrl(url);
  if (!politicianId) politicianId = (await tenantContext.resolveActiveTenant({ deps: { listProfiles: listFullProfiles } })).tenantId;
  if (!politicianId) return sendMandateSelectionRequired(response, await activeMandateList());

  // ZUSTANDSAENDERNDE Debug-Endpunkte nur per POST (Review-Fix, Phase 9):
  // Sie schreiben in Store/DB, stossen Crawls/KI-Laeufe an oder heben Sperren/
  // Kostenbremsen auf. GET bleibt fuer alle rein lesenden Diagnosen. POST mit
  // Bearer-Secret passiert den globalen CSRF-Guard via hasAdminBypass — die
  // Operator-Aufrufe brauchen nur -X POST zusaetzlich. Kein Link/Prefetch/
  // Verlauf-Klick kann so je einen Schreiblauf ausloesen.
  const DEBUG_WRITE_PATHS = new Set([
    "/api/debug/crawl",
    "/api/debug/run-understanding",
    "/api/debug/create-test-vorgang",
    "/api/debug/reset-failed-kos",
    "/api/debug/release-understanding-lock"
    // reset-llm-budget hat einen eigenen POST-Guard mit Budget-spezifischem Hinweis.
  ]);
  if (DEBUG_WRITE_PATHS.has(url.pathname) && request.method !== "POST") {
    response.writeHead(405, jsonHeaders());
    response.end(JSON.stringify({
      error: "Dieser Debug-Endpunkt aendert Zustand und verlangt POST.",
      aufruf: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" <url>`
    }, null, 2));
    return undefined;
  }

  // GET /api/debug/status — Env-Flags + Storage, KEINE Secrets
  if (url.pathname === "/api/debug/status") {
    const storage = getStorageStatus();
    return sendJson(response, {
      timestamp: new Date().toISOString(),
      flags: {
        HELMUT_AUTH_MODE: process.env.HELMUT_AUTH_MODE || "(nicht gesetzt — Legacy-Pilotgate aktiv!)",
        HELMUT_ADMIN_EMAIL_set: Boolean(process.env.HELMUT_ADMIN_EMAIL),
        HELMUT_ADMIN_PASSWORD_set: Boolean(process.env.HELMUT_ADMIN_PASSWORD),
        HELMUT_ADMIN_RESET: process.env.HELMUT_ADMIN_RESET || "(nicht gesetzt)",
        HELMUT_STORAGE_BACKEND: process.env.HELMUT_STORAGE_BACKEND || "(nicht gesetzt)",
        SUPABASE_URL_set: Boolean(process.env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        AZURE_OPENAI_KEY_set: Boolean(process.env.AZURE_OPENAI_KEY),
        AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT || "(nicht gesetzt)",
        AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT || "(nicht gesetzt)",
        PILOT_SECRET_set: Boolean(process.env.PILOT_SECRET),
        CRON_SECRET_set: Boolean(process.env.CRON_SECRET),
        HELMUT_V3_STORE: process.env.HELMUT_V3_STORE || "(nicht gesetzt)",
        HELMUT_V3_MATCHING: process.env.HELMUT_V3_MATCHING || "(nicht gesetzt)",
        HELMUT_V3_LAZY_UNDERSTANDING: process.env.HELMUT_V3_LAZY_UNDERSTANDING || "(nicht gesetzt)",
        HELMUT_V3_OFFICE: process.env.HELMUT_V3_OFFICE || "(nicht gesetzt)",
        HELMUT_UNDERSTANDING_LOCK: process.env.HELMUT_UNDERSTANDING_LOCK || "(nicht gesetzt)",
        HELMUT_LLM_BUDGET_FAIL_CLOSED: process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED || "(nicht gesetzt)",
        DIP_API_KEY_set: Boolean(process.env.DIP_API_KEY),
        HELMUT_DIP_PRIMARY: process.env.HELMUT_DIP_PRIMARY || "(nicht gesetzt)",
      },
      storage,
      loginDiagnosis: {
        accountModeActive: String(process.env.HELMUT_AUTH_MODE || "").trim().toLowerCase() === "accounts",
        adminEmailConfigured: Boolean(process.env.HELMUT_ADMIN_EMAIL),
        adminPasswordConfigured: Boolean(process.env.HELMUT_ADMIN_PASSWORD),
        hint: String(process.env.HELMUT_AUTH_MODE || "").trim().toLowerCase() !== "accounts"
          ? "HELMUT_AUTH_MODE ist NICHT 'accounts' — Login unmoeglich! In Vercel setzen."
          : !process.env.HELMUT_ADMIN_EMAIL || !process.env.HELMUT_ADMIN_PASSWORD
            ? "HELMUT_ADMIN_EMAIL oder HELMUT_ADMIN_PASSWORD fehlt — kein Admin-User kann angelegt werden."
            : "Flags korrekt gesetzt. Seed-Status pruefen mit /api/debug/seed-status?secret=..."
      }
    });
  }

  // GET /api/debug/seed-status — Prueft ob Admin-User existiert
  if (url.pathname === "/api/debug/seed-status") {
    return handleAsync(response, async () => {
      const status = await accounts.getSetupStatus({ includeSensitive: true });
      return { debug: true, ...status };
    });
  }

  // GET /api/debug/crawl?politicianId=test-mdb&secret=... — Crawl ausfuehren
  if (url.pathname === "/api/debug/crawl") {
    return handleAsync(response, async () => {
      const result = await runSourceCrawl(politicianId);
      return { debug: true, politicianId, result };
    });
  }

  // GET /api/debug/briefing?politicianId=test-mdb&vorgangId=test&secret=...
  // V3: zeigt das frisch aus Knowledge Objects erzeugte Briefing (kein V2-Blob).
  if (url.pathname === "/api/debug/briefing") {
    const vorgangId = url.searchParams.get("vorgangId") || "";
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      const [briefing, ko] = await Promise.all([
        buildV3Briefing(profile, politicianId),
        vorgangId ? getKnowledgeObjectByVorgang(vorgangId) : Promise.resolve(null)
      ]);
      return {
        debug: true,
        engine: "v3",
        politicianId,
        vorgangId: vorgangId || "(nicht angegeben)",
        profile: profile ? { id: profile.id, name: profile.fullName } : null,
        briefing: briefing
          ? { engine: "v3", date: briefing.generatedAt, available: Boolean(briefing.available), items: briefing.items?.length || 0 }
          : null,
        knowledgeObject: ko || null,
        storageStatus: getStorageStatus()
      };
    });
  }

  // POST /api/debug/seed-ko?secret=... — legt Test-KnowledgeObject an
  if (url.pathname === "/api/debug/seed-ko" && request.method === "POST") {
    return handleAsync(response, async () => {
      const now = new Date().toISOString();
      const testKo = {
        id: "test-ko-seed-001",
        vorgang_id: "test-vorgang-001",
        headline: "Testvorgang: Rentenpaket 2026",
        was_ist_passiert: "Der Bundestag hat das Rentenpaket 2026 in zweiter Lesung beraten. Die Koalitionsfraktionen haben sich auf einen Kompromiss geeinigt.",
        warum_wichtig: "Das Gesetz betrifft rund 20 Millionen Rentenempfaenger und veraendert den Renteneintritt fuer Jahrgang 1965+.",
        wer_ist_betroffen: "Alle Rentnerinnen und Rentner sowie Erwerbstaetige ab Jahrgang 1965",
        parteien: ["SPD", "Gruene"],
        ausschuesse: ["Ausschuss fuer Arbeit und Soziales"],
        ministerien: ["Bundesministerium fuer Arbeit und Soziales"],
        risiken: "Finanzierungsluecke bei steigender Lebenserwartung moeglich",
        chancen: "Stabilisierung des Rentenniveaus bis 2035",
        zeitdruck: "mittel",
        handlungsempfehlung: "Abstimmungsverhalten pruefen, Pressemitteilung vorbereiten",
        confidence_score: 0.9,
        source_document_count: 3,
        status: "neu",
        understanding_status: "complete",
        mentioned_people: [],
        mentioned_mps: ["Test Politician One"],
        mentioned_parties: ["SPD", "Gruene", "CDU"],
        mentioned_committees: ["Ausschuss fuer Arbeit und Soziales"],
        mentioned_ministries: ["BMAS"],
        mentioned_locations: ["Berlin"],
        mentioned_organizations: ["Deutsche Rentenversicherung"],
        policy_field: "Sozialpolitik",
        // P1-2 Ebenen-Kanon: klein ('bund'), damit der Debug-Seed nicht gegen echte
        // (klein geschriebene) Klassifikationsdaten auseinanderlaeuft.
        political_level: "bund",
        decision_level: "bund",
        instrument: "Gesetz",
        stage: "Beratung",
        tags: ["Rente", "Sozialpolitik", "2026"],
        best_source_url: "https://www.bundestag.de/dokumente/textarchiv/2026/kw01-testvorgang",
        best_link_type: "direct",
        source_trust: "high",
        understanding_model: "debug-seed",
        understanding_tokens: 0,
        created_at: now,
        updated_at: now
      };
      const result = await saveKnowledgeObject(testKo);
      return {
        debug: true,
        seeded: result,
        ko: { id: testKo.id, vorgang_id: testKo.vorgang_id, understanding_status: testKo.understanding_status }
      };
    });
  }

  // /api/debug/admin-fix wurde entfernt (SICHERHEIT): es setzte hinter demselben
  // Debug-Secret wie alle anderen /api/debug/*-Routen unbedingt und ohne Audit-Log das
  // Admin-Passwort auf HELMUT_ADMIN_PASSWORD zurueck/legte den Admin neu an — komplett
  // redundant zum bestehenden, sichereren Bootstrap: ensureAdminSeed() legt den Admin
  // beim Serverstart ohnehin automatisch an, und HELMUT_ADMIN_RESET=1 (+ Neustart) setzt
  // sein Passwort kontrolliert zurueck (inkl. Audit-Log-Eintrag "admin.reset").

  // GET /api/debug/run-understanding?secret=... — Understanding manuell ausloesen.
  // Laedt raw_documents der letzten 30 Tage aus Supabase und ruft
  // runPendingUnderstandingShadow auf. Zeigt Anzahl verarbeiteter Vorgaenge.
  if (url.pathname === "/api/debug/run-understanding") {
    return handleAsync(response, async () => {
      const rawDocs = await listRecentRawDocuments(500);
      const result = await runPendingUnderstandingShadow(rawDocs);
      const processed = (result && result.results && result.results.filter((r) => r && r.status === "saved").length) || 0;
      const skippedNoCluster = (result && result.results && result.results.filter((r) => r && r.status === "skipped-no-cluster").length) || 0;
      console.log(`[debug/run-understanding] rawDocs=${rawDocs.length} processed=${processed} skippedNoCluster=${skippedNoCluster}`);
      return {
        debug: true,
        rawDocsLoaded: rawDocs.length,
        processed,
        skippedNoCluster,
        result
      };
    });
  }

  // GET /api/debug/create-test-vorgang?secret=... — Test-pending-KOs aus letzten 5 raw_documents anlegen.
  // Clustert die neuesten Dokumente deterministisch und legt fuer jeden neuen Cluster
  // einen KO mit status='pending' an. Danach kann /api/debug/run-understanding die KI starten.
  // TEMP: nach erstem erfolgreichen Lauf entfernen.
  if (url.pathname === "/api/debug/create-test-vorgang") {
    return handleAsync(response, async () => {
      const { toRawDocumentRow, dedupeRawDocuments } = require("./lib/helmut/dedup");
      const flags = {
        HELMUT_V3_STORE: process.env.HELMUT_V3_STORE || "(nicht gesetzt — Understanding AUS)",
        HELMUT_V3_LAZY_UNDERSTANDING: process.env.HELMUT_V3_LAZY_UNDERSTANDING || "(nicht gesetzt — C7c AUS: kein auto-pending nach Crawl)",
        AZURE_OPENAI_KEY_set: Boolean(process.env.AZURE_OPENAI_KEY),
        SUPABASE_URL_set: Boolean(process.env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      };
      const rawDocs = await listRecentRawDocuments(5);
      if (!rawDocs.length) {
        return { debug: true, flags, rawDocsLoaded: 0, error: "Keine raw_documents gefunden — Crawl hat noch nichts gespeichert oder HELMUT_V3_STORE fehlt." };
      }
      const rows = dedupeRawDocuments(rawDocs.map(toRawDocumentRow).filter((r) => r && r.id));
      const clusters = clusterRawDocuments(rows);
      const created = [];
      const skipped = [];
      for (const cluster of clusters) {
        const vorgangId = deriveVorgangId(cluster);
        const headline = (cluster.documents[0] && cluster.documents[0].title) || "(kein Titel)";
        const result = await savePendingKnowledgeObject(vorgangId, {
          headline,
          source_document_count: cluster.documents.length
        });
        if (result && result.saved) {
          created.push({ vorgangId, id: `ko-${vorgangId}`, headline, documents: cluster.documents.length });
        } else {
          skipped.push({ vorgangId, headline, reason: result && result.reason });
        }
      }
      console.log(`[debug/create-test-vorgang] rawDocs=${rawDocs.length} clusters=${clusters.length} created=${created.length} skipped=${skipped.length}`);
      return {
        debug: true,
        flags,
        rawDocsLoaded: rawDocs.length,
        clustersFound: clusters.length,
        created,
        skipped,
        nextStep: created.length
          ? `${created.length} pending KO(s) angelegt. Rufe jetzt /api/debug/run-understanding auf.`
          : "Alle Cluster haben bereits KOs (oder Store nicht bereit). Prüfe flags und /api/debug/cluster."
      };
    });
  }

  // GET /api/debug/reset-llm-budget?secret=... — heutige LLM-Usage-Eintraege loeschen.
  // Setzt den Tages-Zaehler fuer canSpendLlm() auf 0, ohne das Limit-Flag zu aendern.
  // TEMP: nur fuer Debugging-Sessions — danach entfernen.
  if (url.pathname === "/api/debug/reset-llm-budget") {
    // Review-Fix: dieser Endpunkt hebt genau die Kostenbremse auf, um die es im
    // Audit ging — Zustandsaenderung deshalb NUR per POST (CSRF-Guard greift),
    // wie beim ko-enrichment-backfill. GET liefert nur den Hinweis.
    if (request.method !== "POST") {
      response.writeHead(405, jsonHeaders());
      response.end(JSON.stringify({
        error: "Budget-Reset nur per POST (CSRF-geschützt).",
        hinweis: "Seit dem Race-Fix zählt zusätzlich der atomare Reservierungszähler (llm_budget_counters) — dieser Reset leert NUR das llmUsage-Log; nach eingespielter Migration 20260717 bleibt der harte Tagesdeckel davon unberührt."
      }, null, 2));
      return undefined;
    }
    return handleAsync(response, async () => {
      const today = new Date().toISOString().slice(0, 10);
      const store = await readAuthStore();
      const all = Array.isArray(store.llmUsage) ? store.llmUsage : [];
      const kept = all.filter((e) => {
        const d = String(e.createdAt || "").slice(0, 10);
        return d !== today;
      });
      const removed = all.length - kept.length;
      await writeAuthStore({ ...store, llmUsage: kept });
      console.log(`[debug/reset-llm-budget] removed=${removed} today=${today}`);
      return {
        debug: true,
        today,
        removedEntries: removed,
        remainingTotal: kept.length,
        message: removed > 0
          ? `${removed} heutige LLM-Eintraege entfernt (llmUsage-Log). Die Pre-Gates sind wieder frei; der atomare Reservierungszaehler (llm_budget_counters, nach Migration 20260717) bleibt davon UNBERUEHRT — der harte Tagesdeckel gilt weiter.`
          : "Keine heutigen Eintraege gefunden — Log war bereits leer."
      };
    });
  }

  // GET /api/debug/understanding-logs?secret=... — letzte Understanding-Fehler + Azure-Diagnose.
  // Liest llmUsage-Log und filtert fehlgeschlagene Understanding-Calls heraus.
  // WICHTIG: Der rohe Azure-Fehlertext (Body) landet NUR in Vercel-Console-Logs,
  // nicht im Store (DSGVO). Dieser Endpunkt zeigt Fehlerklassen wie "Azure HTTP 401".
  // TEMP: nach Diagnose entfernen.
  if (url.pathname === "/api/debug/understanding-logs") {
    return handleAsync(response, async () => {
      const azureConfig = {
        AZURE_OPENAI_KEY_set: Boolean(process.env.AZURE_OPENAI_KEY),
        AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT || "(nicht gesetzt)",
        AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT || "(nicht gesetzt)",
        isAzure: Boolean(process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_ENDPOINT),
        isAiEnabled: isAiEnabled(),
        model: activeModelName(),
        azureApiUrl: process.env.AZURE_OPENAI_ENDPOINT
          ? `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1/responses`
          : "(nicht konfiguriert)"
      };

      const budget = await canSpendLlm(null).catch(() => ({ error: "canSpendLlm fehlgeschlagen" }));

      const all = await getLlmUsage(null, 500);
      const failed = all.filter((e) => e.success === false);
      const understandingFailed = failed
        .filter((e) => String(e.callType || "").toLowerCase().includes("understanding"))
        .slice(0, 10)
        .map((e) => ({ when: e.createdAt, callType: e.callType, model: e.model, error: e.error, durationMs: e.durationMs }));

      const hint = !azureConfig.isAzure
        ? "Azure NICHT konfiguriert — weder AZURE_OPENAI_KEY noch AZURE_OPENAI_ENDPOINT gesetzt."
        : !azureConfig.AZURE_OPENAI_KEY_set
          ? "AZURE_OPENAI_KEY fehlt → alle Calls schlagen mit 401 fehl."
          : understandingFailed.some((e) => String(e.error || "").includes("401"))
            ? "HTTP 401: Key ungültig oder abgelaufen. Key in Vercel prüfen."
            : understandingFailed.some((e) => String(e.error || "").includes("404"))
              ? "HTTP 404: Endpoint oder Deployment falsch. AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_DEPLOYMENT prüfen."
              : understandingFailed.some((e) => String(e.error || "").includes("400"))
                ? "HTTP 400: Azure lehnt den Request ab. Wahrscheinlich Prompt oder JSON-Schema inkompatibel mit dem Deployment."
                : understandingFailed.some((e) => String(e.error || "").includes("parse"))
                  ? "response-parse-error: Modell gibt kein valides JSON zurück. Deployment prüfen (gpt-4o-mini?)."
                  : understandingFailed.some((e) => String(e.error || "").includes("timeout"))
                    ? "Timeout: Azure antwortet nicht. Endpoint erreichbar?"
                    : "Fehler vorhanden — Details oben unter understandingErrors.";

      console.log(`[debug/understanding-logs] total=${all.length} failed=${failed.length} understandingFailed=${understandingFailed.length}`);
      return {
        debug: true,
        azureConfig,
        budget,
        understandingErrors: {
          total: understandingFailed.length,
          note: "Roher Azure-Fehlertext (Body) steht NUR in Vercel-Logs → Functions → letzte Invocation.",
          last10: understandingFailed
        },
        hint
      };
    });
  }

  // GET /api/debug/azure-ping?secret=...&testEndpoint=https://... — prüft AZURE_OPENAI_KEY + ENDPOINT.
  // Optionaler ?testEndpoint=... überschreibt AZURE_OPENAI_ENDPOINT für DIESEN Request (kein Redeploy
  // nötig, um verschiedene Resource-Namen zu testen). Kein KI-Call, kein Token-Verbrauch.
  if (url.pathname === "/api/debug/azure-ping") {
    return handleAsync(response, async () => {
      const keyRaw = process.env.AZURE_OPENAI_KEY || "";
      const endpointFromEnv = String(process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
      // testEndpoint-Parameter: testet anderen Resource-Namen ohne Vercel-Redeploy.
      // SICHERHEIT: der echte AZURE_OPENAI_KEY wird IMMER mitgeschickt — ohne Hostname-
      // Allowlist koennte testEndpoint auf eine beliebige, angreiferkontrollierte URL
      // zeigen und so den Key dorthin exfiltrieren. Nur echte Azure-OpenAI-Hosts erlauben.
      let testEndpointParam = String(url.searchParams.get("testEndpoint") || "").replace(/\/+$/, "");
      let testEndpointRejected = false;
      if (testEndpointParam) {
        try {
          const host = new URL(testEndpointParam).hostname.toLowerCase();
          if (!host.endsWith(".openai.azure.com") && !host.endsWith(".cognitiveservices.azure.com")) {
            testEndpointRejected = true;
            testEndpointParam = "";
          }
        } catch {
          testEndpointRejected = true;
          testEndpointParam = "";
        }
      }
      const endpointRaw = testEndpointParam || endpointFromEnv;
      const isTesting = Boolean(testEndpointParam);
      const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "(nicht gesetzt)";
      const keySet = keyRaw.length > 0;
      const keyPrefix = keySet ? `...${keyRaw.slice(-4)}` : "(nicht gesetzt)";

      if (!keySet || !endpointRaw) {
        return {
          debug: true, ok: false,
          reason: !keySet ? "AZURE_OPENAI_KEY nicht gesetzt" : "AZURE_OPENAI_ENDPOINT nicht gesetzt",
          keyPrefix, endpointRaw: endpointRaw || null, deployment,
          ...(testEndpointRejected ? { testEndpointRejected: true, hint: "testEndpoint muss ein *.openai.azure.com- oder *.cognitiveservices.azure.com-Host sein." } : {})
        };
      }

      // Pfad-Suffix-Check: AZURE_OPENAI_ENDPOINT darf nur Base-URL sein.
      // ai.js baut: ${AZURE_OPENAI_ENDPOINT}/openai/v1/responses
      // Mit Suffix /openai/v1 → doppelter Pfad → 404.
      const pathSuffixMatch = endpointRaw.match(/^(https:\/\/[^/]+)(\/.*)?$/);
      const baseUrl = pathSuffixMatch ? pathSuffixMatch[1] : endpointRaw;
      const hasSuffix = endpointRaw !== baseUrl;

      // Deployments-Liste: kein Token-Verbrauch, nur Auth + Resource-Check.
      let httpStatus = null;
      let deployments = null;
      let errorBody = null;
      try {
        const res = await fetch(`${baseUrl}/openai/deployments?api-version=2024-02-01`, {
          headers: { "api-key": keyRaw, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(8000)
        });
        httpStatus = res.status;
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          deployments = (data.data || []).map((d) => d.id || d.model || "(unbekannt)");
        } else {
          errorBody = (await res.text().catch(() => "")).slice(0, 200);
        }
      } catch (err) {
        return {
          debug: true, ok: false, keyPrefix, endpointRaw, baseUrl, isTesting, deployment,
          error: String(err && err.message || "fetch-fehler").slice(0, 120)
        };
      }

      const hint = hasSuffix
        ? `Pfad-Suffix '${endpointRaw.slice(baseUrl.length)}' im Endpoint entfernen. Korrekter Wert: '${baseUrl}'.`
        : httpStatus === 401
          ? "Key ungültig oder passt nicht zu dieser Resource → AZURE_OPENAI_KEY in Vercel prüfen."
          : httpStatus === 403
            ? "Key hat keine Berechtigung für diese Resource."
            : httpStatus === 404
              ? "Resource nicht gefunden. Azure Portal → Azure OpenAI → korrekte Resource → 'Keys and Endpoint'."
              : httpStatus >= 500
                ? "Azure Serverfehler — kurz warten und erneut prüfen."
                : null;

      console.log(`[debug/azure-ping] keyPrefix=${keyPrefix} baseUrl=${baseUrl} isTesting=${isTesting} hasSuffix=${hasSuffix} httpStatus=${httpStatus} deployments=${deployments ? deployments.length : "n/a"}`);

      return {
        debug: true,
        ok: httpStatus === 200 && !hasSuffix,
        httpStatus,
        keyPrefix,
        endpointEnv: endpointFromEnv || "(nicht gesetzt)",
        endpointTested: baseUrl,
        isTesting,
        hasSuffix,
        deployment,
        ...(testEndpointRejected ? { testEndpointRejected: true } : {}),
        derivedAppUrl: `${baseUrl}/openai/v1/responses`,
        ...(hasSuffix ? { fix: `Vercel: AZURE_OPENAI_ENDPOINT = '${baseUrl}'` } : {}),
        ...(httpStatus === 200 && isTesting ? { fix: `Vercel: AZURE_OPENAI_ENDPOINT = '${baseUrl}'` } : {}),
        deployments,
        ...(hint ? { hint } : {}),
        ...(errorBody ? { errorBody } : {})
      };
    });
  }

  // GET /api/debug/cluster?secret=... — Clustering-Trichter diagnostizieren (rein lesend).
  // Zeigt wie viele raw_documents zu Vorgaengen geclustert werden, welche KOs bereits
  // existieren und ob C7c/C8 aktiv sind. KEIN KI-Call, KEIN Write.
  if (url.pathname === "/api/debug/cluster") {
    return handleAsync(response, async () => {
      const { toRawDocumentRow, dedupeRawDocuments } = require("./lib/helmut/dedup");
      const flags = {
        HELMUT_V3_STORE: process.env.HELMUT_V3_STORE || "(nicht gesetzt — AUS)",
        HELMUT_V3_LAZY_UNDERSTANDING: process.env.HELMUT_V3_LAZY_UNDERSTANDING || "(nicht gesetzt — AUS)",
        AZURE_OPENAI_KEY_set: Boolean(process.env.AZURE_OPENAI_KEY),
        HELMUT_UNDERSTANDING_LOCK: process.env.HELMUT_UNDERSTANDING_LOCK || "(nicht gesetzt)",
      };

      const rawDocs = await listRecentRawDocuments(500);
      const rows = dedupeRawDocuments(rawDocs.map(toRawDocumentRow).filter((r) => r && r.id));
      const clusters = clusterRawDocuments(rows);
      const pendingKos = await listPendingKnowledgeObjects({ limit: 100 }).catch(() => []);

      const clusterDetails = await Promise.all(
        clusters.slice(0, 30).map(async (cluster) => {
          const vorgangId = deriveVorgangId(cluster);
          const existingKo = await getKnowledgeObjectByVorgang(vorgangId).catch(() => null);
          return {
            vorgangId,
            documentCount: (cluster.documents || []).length,
            topAnchors: (cluster.anchors || []).slice(0, 5),
            headline: (cluster.documents || [])[0]?.title || "",
            existingKo: existingKo
              ? { id: existingKo.id, status: existingKo.status, understanding_status: existingKo.understanding_status }
              : null
          };
        })
      );

      const koStatusCounts = clusterDetails.reduce((acc, c) => {
        const key = c.existingKo ? `${c.existingKo.status}/${c.existingKo.understanding_status}` : "fehlt";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      console.log(`[debug/cluster] rawDocs=${rawDocs.length} rows=${rows.length} clusters=${clusters.length} pending=${pendingKos.length}`);
      return {
        debug: true,
        flags,
        rawDocsLoaded: rawDocs.length,
        rowsAfterDedup: rows.length,
        totalClusters: clusters.length,
        pendingKos: pendingKos.length,
        koStatusCounts,
        clusterSample: clusterDetails,
        diagnose: {
          lazyUnderstandingAktiv: ["1", "true", "on", "yes"].includes(String(process.env.HELMUT_V3_LAZY_UNDERSTANDING || "").toLowerCase()),
          v3StoreAktiv: ["1", "true", "on", "yes"].includes(String(process.env.HELMUT_V3_STORE || "").toLowerCase()),
          kiAktiv: Boolean(process.env.AZURE_OPENAI_KEY),
          hinweis: !["1", "true", "on", "yes"].includes(String(process.env.HELMUT_V3_LAZY_UNDERSTANDING || "").toLowerCase())
            ? "HELMUT_V3_LAZY_UNDERSTANDING ist AUS — C7c erstellt keine pending KOs. Cron understanding findet deshalb immer 'no-pending'."
            : pendingKos.length === 0
              ? "C7c ist aktiv, aber es gibt keine pending KOs. Entweder matchen die Profile keinen Cluster, oder alle Vorgaenge sind bereits verstanden."
              : `${pendingKos.length} pending KOs warten auf C8. Starte /api/debug/run-understanding oder warte auf den Cron.`
        }
      };
    });
  }

  // GET /api/debug/system-errors?secret=... — letzte 100 Systemfehler aus dem Auth-Store.
  // Rein lesend. Zeigt 24h-Zaehler, Aufschluesselung nach scope und die letzten Eintraege.
  if (url.pathname === "/api/debug/system-errors") {
    return handleAsync(response, async () => {
      const errors = await accounts.listSystemErrors(100).catch(() => []);
      const now = Date.now();
      const day = 24 * 3600000;
      const within24h = errors.filter((e) => e.createdAt && (now - new Date(e.createdAt).getTime()) < day);
      const byScope = errors.reduce((acc, e) => {
        const k = String(e.scope || "unknown");
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      const topMessages = Object.entries(
        errors.reduce((acc, e) => {
          const k = String(e.message || "").slice(0, 120);
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([message, count]) => ({ message, count }));
      console.log(`[debug/system-errors] total=${errors.length} last24h=${within24h.length} scopes=${JSON.stringify(byScope)}`);
      return {
        debug: true,
        total: errors.length,
        last24h: within24h.length,
        byScope,
        topMessages,
        errors: errors.slice(0, 100)
      };
    });
  }

  // GET /api/debug/diagnose?secret=... — Ein-Klick-Gesamtdiagnose der Vorgangs-Pipeline.
  // Rein lesend: prueft Flags, KI-Config, Budget, Lock, pending KOs und Cluster in EINEM Aufruf
  // und gibt einen klaren Verdict-Text, wo die Kette haengt. Kein KI-Call, kein Write.
  if (url.pathname === "/api/debug/diagnose") {
    return handleAsync(response, async () => {
      const on = (v) => ["1", "true", "on", "yes"].includes(String(v || "").toLowerCase());
      const v3Store = on(process.env.HELMUT_V3_STORE);
      const lazyUnderstanding = on(process.env.HELMUT_V3_LAZY_UNDERSTANDING);
      const supabaseReady = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
      const azureConfigured = Boolean(process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_ENDPOINT);
      const aiEnabled = isAiEnabled();

      const budget = await canSpendLlm(null).catch(() => ({ allowed: null, error: "canSpendLlm fehlgeschlagen" }));
      const lockActive = understandingLockEnabled();

      let rawDocsLoaded = 0;
      let totalClusters = 0;
      let pendingKos = 0;
      let failedKos = 0;
      try {
        const { toRawDocumentRow, dedupeRawDocuments } = require("./lib/helmut/dedup");
        const rawDocs = await listRecentRawDocuments(500);
        rawDocsLoaded = rawDocs.length;
        const rows = dedupeRawDocuments(rawDocs.map(toRawDocumentRow).filter((r) => r && r.id));
        totalClusters = clusterRawDocuments(rows).length;
        const pending = await listPendingKnowledgeObjects({ limit: 100 }).catch(() => []);
        pendingKos = pending.length;
        failedKos = pending.filter((k) => k && k.understanding_status === "failed").length;
      } catch (e) {
        console.error("[debug/diagnose] cluster-check fehlgeschlagen:", e && e.message);
      }

      const errors = await accounts.listSystemErrors(100).catch(() => []);
      const now = Date.now();
      const errors24h = errors.filter((e) => e.createdAt && (now - new Date(e.createdAt).getTime()) < 24 * 3600000).length;

      // Verdict: erste blockierende Ursache in der Reihenfolge der Pipeline.
      let verdict;
      let fix;
      if (!v3Store) {
        verdict = "BLOCKIERT: HELMUT_V3_STORE ist AUS — der komplette Vorgangs-/KO-Pfad ist inert. Nichts wird gebildet.";
        fix = "Vercel: HELMUT_V3_STORE=1 setzen (+ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) und redeployen.";
      } else if (!supabaseReady) {
        verdict = "BLOCKIERT: HELMUT_V3_STORE ist AN, aber Supabase-Zugang fehlt — KOs koennen nicht gespeichert werden.";
        fix = "Vercel: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.";
      } else if (!aiEnabled) {
        verdict = "BLOCKIERT: Keine KI konfiguriert (weder AZURE_OPENAI_KEY+ENDPOINT noch OPENAI_API_KEY) — Understanding wird uebersprungen.";
        fix = "Vercel: AZURE_OPENAI_KEY + AZURE_OPENAI_ENDPOINT setzen. Danach /api/debug/azure-ping pruefen.";
      } else if (!lazyUnderstanding) {
        verdict = "TEILWEISE: HELMUT_V3_LAZY_UNDERSTANDING ist AUS — C7c legt keine pending KOs an, der Understanding-Cron findet immer 'no-pending'.";
        fix = "Vercel: HELMUT_V3_LAZY_UNDERSTANDING=1 setzen. Sofort-Test ohne Cron: /api/debug/create-test-vorgang dann /api/debug/run-understanding.";
      } else if (budget && budget.allowed === false) {
        verdict = `BLOCKIERT: LLM-Tagesbudget erreicht (${budget.reason || "daily-llm-budget-reached"}) — jeder Cluster wird als 'skipped-budget' uebersprungen.`;
        fix = "/api/debug/reset-llm-budget aufrufen oder HELMUT_MAX_LLM_CALLS_PER_DAY erhoehen.";
      } else if (failedKos > 0) {
        verdict = `TEILWEISE: ${failedKos} pending KO(s) stehen auf understanding_status='failed' (fruehere Azure-Fehler) und werden nie erneut versucht.`;
        fix = "/api/debug/reset-failed-kos aufrufen, dann /api/debug/run-understanding. Vorher Azure mit /api/debug/azure-ping fixen.";
      } else if (pendingKos === 0) {
        verdict = "OK-Config, aber 0 pending KOs: entweder matcht kein Nutzerprofil die Cluster, oder alle Vorgaenge sind bereits verstanden.";
        fix = "/api/debug/cluster fuer Details. Ggf. /api/debug/create-test-vorgang + /api/debug/run-understanding.";
      } else {
        verdict = `OK: Config vollstaendig, ${pendingKos} pending KO(s) warten auf C8.`;
        fix = "/api/debug/run-understanding aufrufen oder auf den Cron (05:30/21:30 UTC) warten.";
      }

      console.log(`[debug/diagnose] v3Store=${v3Store} lazy=${lazyUnderstanding} ai=${aiEnabled} azure=${azureConfigured} budget=${budget && budget.allowed} pending=${pendingKos} failed=${failedKos} clusters=${totalClusters} errors24h=${errors24h}`);
      return {
        debug: true,
        verdict,
        fix,
        flags: {
          HELMUT_V3_STORE: v3Store,
          HELMUT_V3_LAZY_UNDERSTANDING: lazyUnderstanding,
          supabaseReady,
          HELMUT_UNDERSTANDING_LOCK_aktiv: lockActive
        },
        ki: {
          aiEnabled,
          azureConfigured,
          model: activeModelName(),
          AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT || "(nicht gesetzt)",
          AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT || "(nicht gesetzt)",
          hinweis: "Live-Verbindung testen mit /api/debug/azure-ping"
        },
        budget,
        pipeline: { rawDocsLoaded, totalClusters, pendingKos, failedKos },
        systemErrors: { last24h: errors24h, gesamtGeladen: errors.length, details: "/api/debug/system-errors" }
      };
    });
  }

  // GET /api/debug/pipeline-probe?secret=... — LIVE-Test der Vorgangs-Pipeline.
  // Testet DIREKT (umgeht die fail-safe-Wrapper, die Fehler still verschlucken):
  //   1. Supabase raw_documents + knowledge_objects: Tabelle erreichbar? wie viele Zeilen?
  //      (listRecentRawDocuments faengt Fehler ab und liefert [] -> "Tabelle fehlt" sieht
  //       aus wie "0 Zeilen". Hier wird der ROHE HTTP-Status gezeigt.)
  //   2. Azure: echter Call gegen die TATSAECHLICHE API-URL /openai/v1/responses — genau
  //      die URL, die ai.js nutzt. azure-ping testet nur /openai/deployments (andere Flaeche!).
  // Rein lesend fuer Supabase; genau EIN minimaler Azure-Call (max 16 Output-Tokens). Kein Write.
  if (url.pathname === "/api/debug/pipeline-probe") {
    return handleAsync(response, async () => {
      const out = { debug: true, supabase: {}, azure: {} };

      // --- 1. Supabase direkt: surfacet echte Fehler (fehlende Tabelle/RLS) statt sie zu verschlucken ---
      const supaUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
      const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      if (!supaUrl || !supaKey) {
        out.supabase = { ok: false, reason: !supaUrl ? "SUPABASE_URL fehlt" : "SUPABASE_SERVICE_ROLE_KEY fehlt" };
      } else {
        for (const table of ["raw_documents", "knowledge_objects"]) {
          try {
            const res = await fetch(`${supaUrl}/rest/v1/${table}?select=id&limit=1`, {
              headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, Prefer: "count=exact", Range: "0-0" },
              signal: AbortSignal.timeout(8000)
            });
            const contentRange = res.headers.get("content-range") || "";
            const count = contentRange.includes("/") ? contentRange.split("/").pop() : null;
            out.supabase[table] = {
              httpStatus: res.status, ok: res.ok, count,
              ...(res.ok ? {} : { error: (await res.text().catch(() => "")).slice(0, 300) })
            };
          } catch (err) {
            out.supabase[table] = { ok: false, error: String((err && err.message) || "fetch-fehler").slice(0, 200) };
          }
        }
      }

      // --- 2. Azure gegen die ECHTE API-URL testen (die azure-ping NICHT prueft) ---
      const azEndpoint = String(process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
      const azKey = process.env.AZURE_OPENAI_KEY || "";
      const azDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5-mini";
      if (!azEndpoint || !azKey) {
        out.azure = { ok: false, reason: !azKey ? "AZURE_OPENAI_KEY fehlt" : "AZURE_OPENAI_ENDPOINT fehlt" };
      } else {
        const apiUrl = `${azEndpoint}/openai/v1/responses`;
        const startedAt = Date.now();
        try {
          const res = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "api-key": azKey },
            body: JSON.stringify({ model: azDeployment, input: "ping", max_output_tokens: 16 }),
            signal: AbortSignal.timeout(15000)
          });
          // Vollen Body NUR lokal halten (fuer den usage-Block); persistiert und
          // ausgeliefert wird ausschliesslich die gekuerzte Fassung.
          const bodyFull = await res.text().catch(() => "");
          const bodyText = bodyFull.slice(0, 300);
          // KOSTENWAHRHEIT (Punkt 17): Dieser Probe-Call verbraucht ECHTE Tokens,
          // lief aber bisher an ai.requestOpenAI vorbei — also ohne Reservierung
          // UND ohne Kostenlog. Er war damit die einzige Stelle, an der Kosten
          // vollstaendig unsichtbar entstanden. Die Reservierung bleibt bewusst
          // aus (eine Diagnose muss gerade dann laufen, wenn das Budget erschoepft
          // ist — dieselbe Begruendung wie beim budgetExempt-Pfad des
          // KO-Backfills); protokolliert wird sie ab jetzt trotzdem, mit eigenem
          // callType. Fail-safe: ein Log-Fehler darf die Diagnose nie stoeren.
          try {
            let usage = null;
            try { usage = res.ok ? (JSON.parse(bodyFull) || {}).usage || null : null; } catch (_) { usage = null; }
            await recordLlmUsage({
              callType: "pipeline-probe", pipelineStep: "diagnose", model: azDeployment,
              politicianId: null, usage, durationMs: Date.now() - startedAt,
              success: res.ok, error: res.ok ? null : `Azure HTTP ${res.status}`
            });
          } catch (_) { /* Diagnose darf am Logging nie scheitern */ }
          out.azure = {
            apiUrl, httpStatus: res.status, ok: res.ok, deployment: azDeployment,
            latencyMs: Date.now() - startedAt,
            kostenhinweis: "Verbraucht echte Tokens. Wird im Kostenlog als callType 'pipeline-probe' gefuehrt, zaehlt aber bewusst NICHT gegen das Tagesbudget.",
            ...(res.ok ? {} : { error: bodyText }),
            hint: res.status === 404 ? "404: Diese Azure-Ressource unterstuetzt /openai/v1/responses nicht ODER Endpoint/Deployment ist falsch."
              : res.status === 401 ? "401: AZURE_OPENAI_KEY ungueltig oder passt nicht zur Ressource."
                : res.status === 400 ? "400: Deployment lehnt den Request ab (Modell-/API-Version-/Parameter-Mismatch)."
                  : res.status === 429 ? "429: Azure Rate-Limit / Kontingent erschoepft."
                    : res.ok ? "Azure-Call OK — der KI-Pfad funktioniert." : null
          };
        } catch (err) {
          out.azure = { apiUrl, ok: false, deployment: azDeployment, error: String((err && err.message) || "fetch-fehler").slice(0, 200) };
        }
      }

      // --- Verdict: erste blockierende Ursache ---
      const rawProbe = out.supabase.raw_documents;
      const supaRawOk = rawProbe && rawProbe.ok;
      const supaRawCount = supaRawOk ? Number(rawProbe.count || 0) : null;
      if (rawProbe && !supaRawOk) {
        out.verdict = `BLOCKIERT: Supabase-Tabelle raw_documents nicht erreichbar (HTTP ${rawProbe.httpStatus || "?"}) — C6-Writes schlagen still fehl, deshalb 0 Vorgaenge.`;
        out.fix = "supabase/schema.sql im Supabase SQL-Editor ausfuehren (legt raw_documents/knowledge_objects an). Danach frischen Crawl: /api/crawl/run?secret=...";
      } else if (supaRawCount === 0) {
        out.verdict = "BLOCKIERT: raw_documents existiert, ist aber LEER. Die 886 Artikel liegen im Blob-Store (V2); in V3 wurde nichts geschrieben — sehr wahrscheinlich lief der letzte Crawl VOR dem Setzen von HELMUT_V3_STORE=1. Flags wirken NICHT rueckwirkend.";
        out.fix = "Einen FRISCHEN Crawl ausloesen: /api/crawl/run?secret=... (oder /api/cron/crawl?secret=CRON_SECRET). Erst der naechste Crawl fuellt raw_documents.";
      } else if (!out.azure.ok) {
        out.verdict = `TEILWEISE: raw_documents gefuellt (${supaRawCount}), aber der echte Azure-Call scheitert (HTTP ${out.azure.httpStatus || "n/a"}) — Understanding kann keine KOs analysieren.`;
        out.fix = out.azure.hint || "Azure-Config in Vercel pruefen, dann erneut proben.";
      } else {
        out.verdict = `OK: Supabase (${supaRawCount} raw_documents) + Azure (HTTP ${out.azure.httpStatus}) funktionieren. Wenn trotzdem 0 Vorgaenge: C7c-Matching greift nicht (kein Profil matcht die Cluster) oder KOs stehen auf 'failed'.`;
        out.fix = "/api/debug/cluster pruefen; ggf. /api/debug/reset-failed-kos, dann /api/debug/create-test-vorgang + /api/debug/run-understanding.";
      }

      console.log(`[debug/pipeline-probe] raw=${JSON.stringify(rawProbe)} azureStatus=${out.azure.httpStatus} verdict=${out.verdict.slice(0, 60)}`);
      return out;
    });
  }

  // GET /api/debug/reset-failed-kos?secret=...
  // SQL-Aequivalent: UPDATE knowledge_objects SET understanding_status='pending'
  // WHERE understanding_status='failed' — dann C8-Trigger mit erweitertem rawDocs-Fenster.
  // Loest den Zustand auf, bei dem failed KOs nie verarbeitet werden (listPendingKnowledgeObjects
  // filtert sie explizit aus). Bulk-PATCH ohne Limit: trifft alle failed KOs in der DB.
  if (url.pathname === "/api/debug/reset-failed-kos") {
    return handleAsync(response, async () => {
      // Vor dem Reset: wie viele KOs waren failed?
      const allKosBefore = await listKnowledgeObjects({ limit: 500 }).catch(() => []);
      const failedCount = allKosBefore.filter((k) => k && k.understanding_status === "failed").length;

      // Bulk-PATCH: alle failed KOs auf pending (ohne Row-Limit, SQL-Äquivalent)
      const resetResult = await bulkResetUnderstandingFailed().catch((e) => ({ skipped: true, reason: e.message }));

      // C8-Trigger: rawDocs mit erweitertem Fenster (90 Tage / 2000 Docs) laden —
      // erhoeht die Chance, die Source-Dokumente der gerade reseteten KOs zu finden.
      const rawDocs = await listRecentRawDocuments(2000, 90).catch(() => []);
      const result = await runPendingUnderstandingShadow(rawDocs).catch((e) => ({
        skipped: true, reason: e.message
      }));

      console.log(`[debug/reset-failed-kos] failedBefore=${failedCount} reset=${JSON.stringify(resetResult)} rawDocs=${rawDocs.length}`);

      return {
        debug: true,
        failedBefore: failedCount,
        reset: resetResult,
        rawDocsLoaded: rawDocs.length,
        understanding: result
      };
    });
  }

  // GET /api/debug/release-understanding-lock?secret=...
  // Gibt einen haengengebliebenen globalen Understanding-Lock manuell frei.
  // TEMP: nach erstem stabilen Cron-Lauf entfernen.
  if (url.pathname === "/api/debug/release-understanding-lock") {
    return handleAsync(response, async () => {
      const store = await readAuthStore().catch(() => ({}));
      const locks = store.pipelineLocks || {};
      const lockBefore = locks["global-understanding"] || null;

      await releasePipelineLock("global-understanding").catch((e) =>
        console.error("[debug/release-understanding-lock] release fehlgeschlagen:", e.message)
      );

      const storeAfter = await readAuthStore().catch(() => ({}));
      const lockAfter = (storeAfter.pipelineLocks || {})["global-understanding"] || null;

      const released = lockBefore !== null && lockAfter === null;
      console.log(`[debug/release-understanding-lock] lockEnabled=${understandingLockEnabled()} released=${released} before=${JSON.stringify(lockBefore)}`);

      return {
        debug: true,
        lockEnabled: understandingLockEnabled(),
        before: lockBefore
          ? { lockedAt: new Date(lockBefore.lockedAt).toISOString(), expiresAt: new Date(lockBefore.expiresAt).toISOString() }
          : null,
        result: released ? "lock released" : lockBefore === null ? "no lock found" : "release failed"
      };
    });
  }

  return sendNotFound(response);
}

function loadLocalEnv() {
  const rootDir = __dirname;
  [".env.local", ".env", "env.local", "env.local.html"].forEach((fileName) => {
    const filePath = path.join(rootDir, fileName);
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = (fileName.endsWith(".html") ? normalizeEnvText(raw) : raw).split(/\r?\n/);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 1) return;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    });
  });
}

function normalizeEnvText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
