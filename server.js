const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

loadLocalEnv();

const { cemInceProfile, profileCompleteness } = require("./lib/helmut/config");
const { validateProfile } = require("./lib/helmut/profile-validation");
const sourceSafety = require("./lib/helmut/sourceSafety");
const { runLageCheck, runSourceCrawl } = require("./lib/helmut/scheduler");
const { buildLearningProfile } = require("./lib/helmut/learning");
const { deleteProfileData, exportProfileData, getInteractions, getLatestCrawlRun, listCrawlRuns, getLatestLageCheck, getLatestPipelineDebugReport, getProfile, listProfiles, listFullProfiles, getStorageStatus, getStoreSummary, getTasks, getUserNotes, removePushSubscription, saveInteraction, saveProfile, saveFeedback, listFeedback, setFeedbackDone, savePushSubscription, saveTask, saveUserNote, updateTaskStatus, listPushEvents, saveKnowledgeObject, getKnowledgeObjectByVorgang, listPendingKnowledgeObjects, savePendingKnowledgeObject, readAuthStore, writeAuthStore, getLlmUsage, getLlmUsageToday, getLlmUsageBreakdownToday, canSpendLlm, getAdminStatsCosts, getAdminStatsCrawl, getAdminStatsOverview, getAdminStatsCrawlReport, getKnowledgeObjectCount, getAdminPeriodStats, listRecentRawDocuments, listKnowledgeObjects, getSources, getSourcesForVorgang, v3StoreReady, releasePipelineLock, understandingLockEnabled, bulkResetUnderstandingFailed, saveAdminRecoveryLastRun, getAdminRecoveryLastRun, getLatestCompleteKnowledgeObjectAt, saveWatchdogState, getLatestWatchdogState, tenantJwtModeEnabled, saveKnowledgeObjectEnrichment, profileDbModeEnabled, getProfileFromDb, diagnoseTenantJwt } = require("./lib/helmut/storage");
const { classifyOperationalState, describeState } = require("./lib/helmut/watchdog-state");
const { runKoEnrichmentBackfill } = require("./lib/helmut/ko-enrichment");
const { generateCommunicationDraft, assessParliamentaryItem, isAiEnabled, activeModelName, extractKnowledgeObjectTags } = require("./lib/helmut/ai");
const { derivePolicyFields } = require("./lib/helmut/matching");
const { pushStatus, sendBriefingReadyPush, sendLageChangePush, sendPushToPolitician } = require("./lib/helmut/push");
const auth = require("./lib/helmut/auth");
const accounts = require("./lib/helmut/accounts");
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
const minConfiguredSources = Number(process.env.HELMUT_MIN_CONFIGURED_SOURCES || 495);
const minCheckedSources = Number(process.env.HELMUT_MIN_CHECKED_SOURCES || 450);
const minLageCheckSources = Number(process.env.HELMUT_MIN_LAGE_CHECK_SOURCES || 75);
const minSuccessfulSources = Number(process.env.HELMUT_MIN_SUCCESSFUL_SOURCES || 405);
const maxCrawlFailureRatio = Number(process.env.HELMUT_MAX_CRAWL_FAILURE_RATIO || 0.1);
const maxFullCrawlAgeMs = Number(process.env.HELMUT_MAX_FULL_CRAWL_AGE_MS || 14 * 60 * 60 * 1000);
const maxLageCheckAgeMs = Number(process.env.HELMUT_MAX_LAGE_CHECK_AGE_MS || 4 * 60 * 60 * 1000);
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
    // SICHERHEIT: bewusst oeffentlich (externe Smoke-Tests/Monitoring ohne Login), aber
    // OHNE client-waehlbare politicianId — sonst liesse sich per ?politicianId= erraten/
    // brute-forcen, ob ein bestimmtes Mandat existiert und wie sein Status ist (Mandanten-
    // Oracle). scripts/smoke-test.js ruft diesen Endpunkt nie mit politicianId auf.
    return handleAsync(response, async () => publicReleasePayload(await computeReleaseCheck()));
  }

  if (url.pathname === "/impressum") {
    return sendImpressumPage(response);
  }

  if (url.pathname === "/privacy" || url.pathname === "/datenschutz") {
    return sendPrivacyPage(response);
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
    // NIE still auf cem-ince (oder ein fremdes Mandat) fallen. Klarer Zustand statt
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
    // Legacy-Pilot-Modus: EIN geteiltes Pilotmandat hinter PILOT_SECRET.
    // SICHERHEIT: Ein clientseitig gesetztes ?politicianId darf hier NICHT als
    // Mandanten-Auswahl dienen — sonst koennte ein Pilot-Client die Daten eines
    // anderen Mandats laden. Nur der (secret-geschuetzte) Admin-Bypass darf
    // explizit ein anderes Mandat waehlen. Alle anderen bekommen das Pilotmandat.
    politicianId = hasAdminBypass(request, url)
      ? politicianIdFromUrl(url)
      : cemInceProfile.id;
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
      const [tasks, notes] = await Promise.all([getTasks(profile.id), getUserNotes(profile.id)]);
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
        }
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
      if (!isForcedPilotRun(request, url) && !hasAdminBypass(request, url) && isRecent(latest?.createdAt, manualRunMinIntervalMs)) {
        return {
          ...latest,
          skippedReason: "Quellen wurden gerade erst geprüft. Helmut nutzt den letzten Lauf, um unnötige Last zu vermeiden."
        };
      }
      return runSourceCrawl(politicianId);
    });
  }

  if (url.pathname === "/api/pipeline/run") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleAsync(response, async () => {
      // V3-Pipeline: der Crawl speist die V3-Tabellen (raw_documents) und triggert
      // die V3-Engines (Understanding/Matching/Decision) über runSourceCrawl.
      // Kein V2-Briefing-Lauf mehr. Das Briefing liest der Client danach frisch aus V3.
      const latestCrawl = await getLatestCrawlRun();
      if (!isForcedPilotRun(request, url) && !hasAdminBypass(request, url) && isRecent(latestCrawl?.createdAt, manualRunMinIntervalMs)) {
        return {
          ...latestCrawl,
          skippedReason: "Pipeline wurde gerade erst ausgeführt. Helmut nutzt den letzten Lauf."
        };
      }
      return runSourceCrawl(politicianId);
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
    return handleAsync(response, () => runSourceCrawl(politicianId));
  }

  if (url.pathname === "/api/cron/morning-briefing") {
    if (!authorizeCron(request, url, response)) return;
    return handleAsync(response, async () => {
      const t0 = Date.now();
      // Mehrmandantenfaehigkeit (Audit-Fix 2026-07, Default AUS): Der Cron bediente
      // fest EIN Profil (Default-politicianId) — weitere Mandate erhielten nie einen
      // Morgen-Push. Mit HELMUT_MORNING_PUSH_ALL_PROFILES=1 loopt er wie der
      // lage-briefing-Cron ueber alle Profile (deaktivierte werden uebersprungen,
      // per-Profil try/catch, hartes Zeitbudget). Aktivierung = bewusste
      // Betreiber-Entscheidung (zusaetzliche Build-Laeufe, 0 KI — der Briefing-Build
      // ist eine reine Lese-Transformation; Push nur bei echtem Inhalt).
      const flagOn = (v) => ["1", "true", "on", "yes"].includes(String(v || "").trim().toLowerCase());
      if (flagOn(process.env.HELMUT_MORNING_PUSH_ALL_PROFILES)) {
        const deadline = t0 + 240000; // 240s < maxDuration 300s: Cron antwortet IMMER
        let profiles = await listProfiles().catch(() => []);
        if (!Array.isArray(profiles) || !profiles.length) profiles = [{ id: politicianId }];
        const results = [];
        let skipped = 0;
        for (const p of profiles) {
          if (Date.now() > deadline) { results.push({ userId: p.id, skipped: true, reason: "zeitbudget" }); continue; }
          // Per-Profil try/catch (Review-Fix): früher waren nur Build/Push gefangen,
          // NICHT activeProfile/validateProfile — ein Storage-Fehler bei EINEM Profil
          // brach die gesamte Schleife (500, alle übrigen ohne Push). Jetzt isoliert
          // jedes Profil vollständig; ein Fehler wird als Ergebniszeile vermerkt.
          try {
            const profile = await activeProfile(p.id || politicianId);
            const val = validateProfile(profile);
            if (val.disabled) { skipped += 1; results.push({ userId: profile.id, skipped: true, reason: "profil-deaktiviert" }); continue; }
            const briefing = await withTimeout(buildV3Briefing(profile, profile.id), 60000, "cron-briefing-build")
              .catch((error) => ({ available: false, reason: "build-timeout", error: error && error.message, items: [], personalizedRecommendations: [], personMentions: [] }));
            const push = await withTimeout(sendBriefingReadyPush(briefing, profile), 30000, "cron-briefing-push")
              .catch((error) => ({ ok: false, reason: "push-timeout", error: error && error.message }));
            results.push({ userId: profile.id, available: Boolean(briefing && briefing.available), pushSkipped: Boolean(push && push.skipped), pushReason: (push && push.reason) || null });
          } catch (error) {
            results.push({ userId: p.id, skipped: true, reason: "profil-fehler", error: error && error.message });
          }
        }
        console.log(`[cron/morning-briefing] multi-profil: ${results.length} Profile, ${skipped} uebersprungen, ${Date.now() - t0}ms`);
        return { multiProfile: true, profile: results.length, uebersprungen: skipped, results };
      }
      const profile = await activeProfile(politicianId);
      // V3: das Briefing entsteht frisch aus den aktuellen Knowledge Objects (0 KI) —
      // kein V2-runMorningBriefing mehr. Beide Schritte (Build + Push) hart begrenzt,
      // damit der Cron immer antwortet; fail-safe -> Leerzustand statt Hänger.
      const briefing = await withTimeout(buildV3Briefing(profile, politicianId), 60000, "cron-briefing-build")
        .catch((error) => ({ available: false, reason: "build-timeout", error: error && error.message, items: [], personalizedRecommendations: [], personMentions: [] }));
      const tBuild = Date.now();
      const push = await withTimeout(sendBriefingReadyPush(briefing, profile), 30000, "cron-briefing-push")
        .catch((error) => ({ ok: false, reason: "push-timeout", error: error && error.message }));
      console.log(`[cron/morning-briefing] build=${tBuild - t0}ms push=${Date.now() - tBuild}ms available=${briefing && briefing.available} items=${((briefing && briefing.items) || []).length}`);
      return { briefing, push };
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
      const result = await withTimeout(runSourceCrawl(politicianId), 280000, "cron-pipeline")
        .catch((error) => ({ ok: false, bounded: true, reason: "pipeline-timeout", error: error && error.message }));
      console.log(`[cron/pipeline] runSourceCrawl ${Date.now() - t0}ms bounded=${Boolean(result && result.bounded)}`);
      return result;
    });
  }

  // Morgen-Health-Report per WhatsApp (CallMeBot). Antwort enthaelt den Text +
  // Zustellstatus, damit man ihn manuell testen kann (?secret=CRON_SECRET).
  if (url.pathname === "/api/cron/health-report") {
    if (!authorizeCron(request, url, response)) return;
    return handleAsync(response, async () => {
      // DRY-RUN (Phase 11): ?dryRun=1 baut den kompletten Report und zeigt die
      // Kanal-Konfiguration, versendet aber NICHTS, schreibt keinen Systemfehler
      // und (Monitoring-Haertung) persistiert KEINEN Watchdog-State — sonst
      // konsumierte die Probe die BAD->ERHOLT-Transition des echten 06:00-Laufs.
      const isDryRun = url.searchParams.get("dryRun") === "1";
      const report = await buildHealthReport(politicianId, { persistState: !isDryRun });
      if (isDryRun) {
        return {
          dryRun: true,
          ok: report.ok,
          text: report.text,
          kanaele: {
            whatsapp: { konfiguriert: Boolean(String(process.env.CALLMEBOT_PHONE || "").trim() && String(process.env.CALLMEBOT_APIKEY || "").trim()) },
            webhook: { konfiguriert: Boolean(String(process.env.HELMUT_MONITORING_WEBHOOK_URL || "").trim()) }
          },
          overdueCrons: report.overdueCrons,
          googleUrlResolutionRate: report.googleUrlResolutionRate
        };
      }
      // ZWEITKANAL (Audit-Folgebranch): der Report ging bisher NUR über CallMeBot-
      // WhatsApp — fehlten dessen Keys, wurde er still übersprungen (einziger
      // Alarmweg tot). Jetzt zusätzlich ein generischer Webhook-Kanal
      // (HELMUT_MONITORING_WEBHOOK_URL: Slack/Discord/Zapier/E-Mail-Relay).
      // Beide Kanäle fail-safe und unabhängig; ein Kanal-Fehler kippt den anderen
      // nicht. Kein neuer Dienst/kein SMTP-Secret nötig.
      const [delivery, webhook] = await Promise.all([
        sendCallMeBotMessage(report.text),
        sendMonitoringWebhook(report)
      ]);
      const whatsappBroken = delivery && delivery.sent === false && !delivery.skipped;
      const webhookBroken = webhook && webhook.sent === false && !webhook.skipped;
      // Echten Zustellfehler protokollieren (nicht: Keys fehlen). Beide Kanäle
      // still tot (skipped) bei einem NICHT-grünen Report ist selbst ein Alarm.
      if (whatsappBroken || webhookBroken) {
        await accounts.recordSystemError({
          scope: "health-report",
          message: `Alarm-Zustellung fehlgeschlagen: ${whatsappBroken ? "WhatsApp " + (delivery.reason || "HTTP " + (delivery.status || "?")) : ""} ${webhookBroken ? "Webhook " + (webhook.reason || "HTTP " + (webhook.status || "?")) : ""}`.trim(),
          path: "/api/cron/health-report"
        }).catch(() => {});
      }
      if (!report.ok && delivery && delivery.skipped && webhook && webhook.skipped) {
        await accounts.recordSystemError({
          scope: "health-report",
          message: "Nicht-grüner Health-Report, aber KEIN Alarmkanal konfiguriert (CALLMEBOT_* und HELMUT_MONITORING_WEBHOOK_URL fehlen).",
          path: "/api/cron/health-report"
        }).catch(() => {});
      }
      return { ok: report.ok, text: report.text, delivery, webhook, overdueCrons: report.overdueCrons, googleUrlResolutionRate: report.googleUrlResolutionRate };
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
      const profile = await activeProfile(politicianId);
      const lageCheck = await withTimeout(runLageCheck(politicianId), 280000, "cron-lage-check")
        .catch((error) => ({ status: "stable", bounded: true, reason: "lage-check-timeout", error: error && error.message }));
      const tCheck = Date.now();
      const push = await withTimeout(sendLageChangePush(lageCheck, profile), 30000, "cron-lage-push")
        .catch((error) => ({ ok: false, reason: "push-timeout", error: error && error.message }));
      console.log(`[cron/lage-check] check=${tCheck - t0}ms push=${Date.now() - tCheck}ms status=${lageCheck && lageCheck.status}`);
      return { lageCheck, push };
    });
  }

  // Vorwaerm-Lauf: erzeugt das Lage-Briefing pro Profil einmal (generate-if-missing),
  // damit die erste Oeffnung des Tages sofort aus dem Cache liest. CRON_SECRET-geschuetzt.
  if (url.pathname === "/api/cron/lage-briefing") {
    if (!authorizeCron(request, url, response)) return;
    return handleAsync(response, async () => {
      let profiles = await listProfiles().catch(() => []);
      if (!Array.isArray(profiles) || !profiles.length) profiles = [{ id: politicianId }];
      const results = [];
      let skipped = 0;
      for (const p of profiles) {
        const profile = await activeProfile(p.id || politicianId);
        // Mehrmandantenfaehigkeit Phase 8: deaktivierte Profile nehmen an der
        // Verarbeitung NICHT teil (sie sollen kein Briefing erzeugen). Fehlerhafte/
        // leere Profile liefern ohnehin natuerlich einen Leerzustand — nur die
        // bewusst deaktivierten werden aktiv uebersprungen. Ein Fehler/Skip bei
        // einem Profil betrifft NUR dieses (per-Profil try/catch), nie die anderen.
        const val = validateProfile(profile);
        if (val.disabled) {
          skipped += 1;
          results.push({ userId: profile.id, available: false, reason: "profil-deaktiviert", vorgaenge: 0 });
          continue;
        }
        const res = await buildLageBriefing(profile, { politicianId: profile.id })
          .catch((e) => ({ available: false, reason: "error", error: e && e.message }));
        results.push({ userId: profile.id, available: res.available, fromCache: res.fromCache, reason: res.reason || null, vorgaenge: (res.vorgaenge || []).length });
      }
      return { prewarmed: results.length, uebersprungen: skipped, results };
    });
  }

  // Provenienz-Backfill fuer BESTEHENDE Vorgaenge (kein KI-Call). ?secret=CRON_SECRET.
  // SICHER PER DEFAULT (Konsistenz mit presentation-backfill): ohne ?execute=1 nur
  // DRY-RUN (Vorschau, KEINE Writes); ?dryRun=1 erzwingt die Vorschau zusaetzlich
  // explizit. ?days= / ?limit= steuern das Zeitfenster. Der Backfill ist idempotent.
  if (url.pathname === "/api/debug/lage-backfill") {
    if (!authorizeCron(request, url, response)) return;
    // Review-Fix (Phase 9): Default war ein SCHREIBLAUF per GET (dryRun nur mit
    // ?dryRun=1). Jetzt wie ko-enrichment/presentation: GET = immer Dry-Run,
    // echter Lauf nur per POST (+ Bearer-Secret; hasAdminBypass befreit vom CSRF).
    return handleAsync(response, async () => {
      const days = Number(url.searchParams.get("days")) || undefined;
      const limit = Number(url.searchParams.get("limit")) || undefined;
      const dryRun = request.method !== "POST" || url.searchParams.get("dryRun") === "1";
      // AUDIT (Monitoring-Haertung): nur echte Laeufe (Writes) protokollieren;
      // Metadaten, fail-safe — Audit-Fehler brechen den Lauf nie.
      if (!dryRun) {
        await accounts.recordAudit({
          action: "maintenance.lage-backfill",
          actorEmail: "cron-secret",
          detail: `days=${days || "default"} limit=${limit || "default"}`
        }).catch(() => {});
      }
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
      // AUDIT (Monitoring-Haertung): nur echte Laeufe (KI + Writes) protokollieren.
      if (!dryRun) {
        await accounts.recordAudit({
          action: "maintenance.presentation-backfill",
          actorEmail: "cron-secret",
          detail: `limit=${limit || "alle"}`
        }).catch(() => {});
      }
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
      const rawDocs = await listRecentRawDocuments(500);
      // ZEITBUDGET (Default 240s): der serielle KI-Understanding-Loop darf die
      // Serverless-Funktion nicht über ihr Limit (300s) treiben. Rest bleibt pending
      // und wird beim nächsten Lauf nachgeholt (idempotent).
      const result = await runPendingUnderstandingShadow(rawDocs, { budgetMs: Number(process.env.HELMUT_UNDERSTAND_BUDGET_MS || 240000) });
      const processed = (result && result.results && result.results.filter((r) => r && r.status === "saved").length) || 0;
      console.log(`[cron/understanding] rawDocs=${rawDocs.length} Ergebnis: ${JSON.stringify({ processed, result })}`);
      return { ok: true, rawDocsLoaded: rawDocs.length, processed, result };
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
    if (request.method === "GET") return handleAsync(response, () => accounts.listUsers());
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
        return user;
      });
    }
  }

  if (url.pathname.startsWith("/api/admin/users/") && (request.method === "PATCH" || request.method === "POST")) {
    if (!requireRoleOr403(response, authUser, "admin")) return undefined;
    const userId = decodeURIComponent(url.pathname.replace("/api/admin/users/", ""));
    return handleJson(request, response, async (body) => {
      const user = await accounts.updateUser(userId, body);
      // Deaktivierte Nutzer sofort ausloggen; bei Passwort-Reset bestehende
      // Sessions ungueltig machen (neues Passwort erzwingt Neu-Login). Auch wenn
      // der Status (gekuendigt/deaktiviert) den Login serverseitig gesperrt hat.
      if (user.active === false || (body.password !== undefined && body.password !== "")) {
        await accounts.destroyUserSessions(userId);
      }
      const action = (body.password !== undefined && body.password !== "") ? "admin.user.password-reset" : "admin.user.update";
      await accounts.recordAudit({ action, userId: authUser.id, actorEmail: authUser.email, detail: user.email });
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
      // Live-Selbsttest des echten JWT-Profil-Lesepfads: versucht den DB-Read von
      // cem-ince (existiert). Erfolg (Zeile zurueck) => App->PostgREST-JWT wird
      // akzeptiert (SUPABASE_JWT_SECRET korrekt). Fehlschlag/null bei aktivem Flag
      // => JWT wird abgewiesen (401 PGRST301, Secret-Mismatch) ODER Zeile fehlt.
      // Nur ausgefuehrt, wenn der DB-Modus aktiv ist; sonst nicht aussagekraeftig.
      let tenantJwtReadWorks = null;
      let tenantReadProbe = "nicht ausgeführt (DB-Modus aus)";
      if (profileDbEnabled) {
        try {
          const probe = await getProfileFromDb(cemInceProfile.id);
          tenantJwtReadWorks = Boolean(probe && probe.id);
          tenantReadProbe = tenantJwtReadWorks
            ? "OK: cem-ince aus mandate_profiles gelesen (JWT akzeptiert)"
            : "FEHLGESCHLAGEN: kein Profil (JWT abgewiesen/401 oder Zeile fehlt) -> Fallback Blob";
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
  // bypassBudget=1 umgeht NUR das per-Call-Pre-Gate des Backfills — das globale
  // LLM-Tageslimit (atomare Reservierung am Choke-Point) gilt IMMER; bei
  // Erschoepfung stoppt der Lauf kontrolliert (stop=daily-llm-budget).
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
      // AUDIT (Monitoring-Haertung): kostenausloesende Admin-Aktion dauerhaft
      // nachvollziehbar machen — nur Metadaten (Parameter + Zaehler), keine Inhalte.
      // Fail-safe: ein Audit-Fehler darf den Lauf nie brechen.
      if (execute) {
        await accounts.recordAudit({
          action: "admin.ko-enrichment-backfill",
          userId: authUser?.id, actorEmail: authUser?.email,
          detail: `execute=${execute} bypassBudget=${bypassBudget} maxCents=${maxEurCents} aiCalls=${result.aiCalls || 0} stop=${result.stop || "-"}`
        }).catch(() => {});
      }
      // aiProvider (nur Name, kein Secret) macht sichtbar, ob Azure genutzt wird.
      // EHRLICHKEIT: bypassBudget umgeht nur das per-Call-Pre-Gate des Backfills —
      // das globale Tageslimit (atomare Reservierung in requestOpenAI) gilt trotzdem;
      // die Antwort sagt das explizit, damit ein bewusster Bypass-Lauf bei
      // erschoepftem Budget nicht wie ein KI-Defekt aussieht.
      return {
        aiProvider: require("./lib/helmut/ai").aiProviderName(),
        budgetBypassed: bypassBudget && execute,
        ...(bypassBudget && execute ? { budgetBypassHinweis: "bypassBudget umgeht nur das Pre-Gate dieses Backfills. Das globale LLM-Tageslimit gilt weiterhin; bei Erschoepfung stoppt der Lauf mit stop=daily-llm-budget." } : {}),
        ...result
      };
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
      // AUDIT (Monitoring-Haertung): zustandsaendernde Recovery-Aktion dauerhaft
      // nachvollziehbar (nur Metadaten). Fail-safe — bricht die Aktion nie.
      await accounts.recordAudit({
        action: "admin.recovery.release-lock",
        userId: authUser?.id, actorEmail: authUser?.email,
        detail: `lockVorher=${Boolean(before)} geloest=${Boolean(before) && !after}`
      }).catch(() => {});
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
      // AUDIT: Bulk-Statuswechsel (failed -> pending) nur bei bestaetigter
      // Ausfuehrung protokollieren; nur Metadaten, fail-safe.
      await accounts.recordAudit({
        action: "admin.recovery.reset-failed",
        userId: authUser?.id, actorEmail: authUser?.email,
        detail: `failedBetroffen=${failedBetroffen}`
      }).catch(() => {});
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
      // AUDIT (Monitoring-Haertung): kostenausloesende Recovery-Aktion
      // (KI-Understanding-Lauf) dauerhaft nachvollziehbar; nur Metadaten,
      // fail-safe — ein Audit-Fehler bricht die Antwort nie.
      await accounts.recordAudit({
        action: "admin.recovery.run-understanding",
        userId: authUser?.id, actorEmail: authUser?.email,
        detail: `ergebnis=${ergebnis} verarbeitet=${verarbeitet} pendingVorher=${vorher.pending}`
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
// Test-Hooks (Offline, Audit-Folgebranch): Monitoring-Zweitkanal + Asset-Version.
module.exports.__sendMonitoringWebhook = sendMonitoringWebhook;
module.exports.__ASSET_VERSION = () => ASSET_VERSION;
// Test-Hook (Offline, Monitoring-Haertung): der Health-Report-Builder — prueft
// Budget-Zeile, Fehler-Spike-Gate, Zu-tun-Empfehlungen und die dryRun-Option
// (persistState=false), ohne den HTTP-/Cron-Pfad zu veraendern.
module.exports.__buildHealthReport = buildHealthReport;

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
  const stale = isBriefingStaleForBerlin(briefing);
  const hasDecisionItems = Number(briefing.items?.filter((item) => item.decision !== "Ignorieren").length || 0) > 0;
  const hasSituationalItems = Number(briefing.situationalBriefing?.length || 0) > 0;
  const status = stale ? "Veraltet" : hasDecisionItems || hasSituationalItems ? "Aktuell" : "Keine neue Entscheidung";
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
  addBackendCheck(checks, "Quellenbasis", Number(storeSummary.sources?.active || 0) >= minConfiguredSources, `${storeSummary.sources?.active || 0} aktive Quellen konfiguriert.`);
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
  const sourceCount = Number(crawl?.checkedSources || storeSummary?.sources?.active || 0);
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

async function computeReleaseCheck(politicianId = cemInceProfile.id) {
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
// options.persistState=false (dryRun-Pfad): buildHealthReport schreibt dann KEINEN
// Watchdog-State. Vorher konsumierte ein dryRun waehrend einer Erholung die
// BAD->ERHOLT-Transition (applyRecovery) — der echte 06:00-Lauf meldete danach
// GESUND statt ERHOLT und der "Alarm aufloesen"-Hinweis entfiel. Der dryRun ist
// damit vollstaendig nebenwirkungsfrei und als externer Waechter-Check nutzbar.
async function buildHealthReport(politicianId = cemInceProfile.id, { persistState = true } = {}) {
  // V3: Health-Report bewertet das frisch erzeugte V3-Briefing (kein V2-Blob).
  // P1-4/P1-5: Betriebszustand kommt jetzt aus dem Zwei-Achsen-Zustandsmodell
  // (lib/helmut/watchdog-state.js) auf Basis LEBENDER Zeitstempel — NICHT mehr
  // aus dem toten `pipelineDebugReports`-Marker und NICHT mehr aus der
  // build-zeit-blinden Briefing-`generatedAt`.
  const profile = await activeProfile(politicianId);
  const [crawl, lageCheck, briefing, completeKoAt, prevState, storeSummary, errors, users, feedback, pushEvents] = await Promise.all([
    getLatestCrawlRun(),
    getLatestLageCheck(politicianId),
    buildV3Briefing(profile, politicianId),
    getLatestCompleteKnowledgeObjectAt(), // OUTPUT-Frische: jüngstes verstandenes Thema (real)
    getLatestWatchdogState(politicianId), // für Recovery-Hysterese (Erholt)
    getStoreSummary(politicianId),
    accounts.listSystemErrors(100),
    accounts.listUsers(),
    listFeedback(200),
    listPushEvents(politicianId, 200)
  ]);
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
    lageFreshMs: maxLageCheckAgeMs,
    lageWarnMs: 2 * maxFullCrawlAgeMs,
    minCheckedSources,
    minSuccessfulSources,
    maxFailureRatio: maxCrawlFailureRatio
  });
  const ok = classification.ok;

  // Betriebszustand persistieren (fail-safe) — ermöglicht Recovery-Erkennung.
  // Im dryRun (persistState=false) BEWUSST übersprungen, damit die Probe die
  // Recovery-Hysterese des echten Laufs nicht konsumiert (siehe Funktionskopf).
  if (persistState) await saveWatchdogState(politicianId, classification.state);

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

  // Budget-/Kosten-Zeile (Monitoring-Haertung): Budget-Erschoepfung war im Report
  // unsichtbar — bei fail-closed zeigte sie sich erst am Folgetag indirekt als
  // stale Output. Reiner Lesezugriff, fail-safe: ein Breakdown-Fehler wird als
  // "nicht ladbar" ausgewiesen (bei aktivem fail-closed genau der blinde Fleck).
  let llmBudget = null;
  try { llmBudget = await getLlmUsageBreakdownToday(); } catch (_) { llmBudget = null; }
  const budgetExhausted = Boolean(llmBudget && llmBudget.limit != null && llmBudget.remaining === 0);
  const budgetLine = llmBudget
    ? `💰 KI-Budget: ${llmBudget.calls}/${llmBudget.limit != null ? llmBudget.limit : "—"} Calls · Rest ${llmBudget.remaining != null ? llmBudget.remaining : "—"}${budgetExhausted ? " ⚠️ erschöpft" : ""} · $${Number(llmBudget.estimatedCostUsd || 0).toFixed(2)} heute · ${llmBudget.skips} Skips`
    : "💰 KI-Budget: Stand nicht ladbar (Breakdown-Fehler)";

  // Fehler-Spike (Monitoring-Haertung): errors24 hob bisher weder ok noch severity
  // an — ein Fehlersturm bei sonst frischen Daten blieb "gruen". Schwelle bewusst
  // unter dem reinen Text-Hinweis in watchdog-state (15).
  const ERROR_SPIKE_ALARM_THRESHOLD = 10;
  const errorSpike = errors24 >= ERROR_SPIKE_ALARM_THRESHOLD;
  const errorSpikeLine = errorSpike
    ? `🚨 Fehler-Spike: ${errors24} Systemfehler in 24h (Schwelle ${ERROR_SPIKE_ALARM_THRESHOLD})`
    : null;

  // Pipeline-Laufzeit (Monitoring-Haertung): runSourceCrawl persistiert durationMs
  // im Crawl-Lauf; fail-safe fuer Alt-Laeufe ohne das Feld.
  const crawlDurationMs = Number(crawl?.durationMs);
  const durationLine = Number.isFinite(crawlDurationMs) && crawlDurationMs >= 0
    ? `⏱ Crawl-Laufzeit: ${Math.round(crawlDurationMs / 1000)}s`
    : null;

  // Zu-tun-Zeile ehrlich machen: die harten Zusatz-Gates (Cron überfällig, GNR
  // degradiert, Fehler-Spike) kippten bisher NUR report.ok — der Text meldete
  // gleichzeitig "Zu tun: Keine." und severity blieb "ok" (ein auf severity
  // alarmierender Empfänger verpasste den Fall). Jetzt: severity mindestens
  // "watch" + konkrete Empfehlung in der Zu-tun-Zeile.
  const extraActions = [];
  if (overdueCrons.length) extraActions.push(`Vercel-Cron prüfen (${overdueCrons.map((c) => c.name).join("/")} überfällig): vercel.json-Eintrag, CRON_SECRET und Deployment-Logs.`);
  if (gnrDegraded) extraActions.push("Google-News-Resolver prüfen (URL-Auflösung <50% — Links kippen still zu Proxy/leer).");
  if (errorSpike) extraActions.push(`Fehler-Spike untersuchen: ${errors24} Systemfehler in 24h — /api/debug/system-errors.`);
  if (budgetExhausted) extraActions.push("KI-Tagesbudget aufgebraucht — Reset 00:00 UTC abwarten oder HELMUT_MAX_LLM_CALLS_PER_DAY prüfen.");

  let stateText = describeState(classification);
  if (extraActions.length) {
    const zusatz = extraActions.join(" ");
    // "Zu tun: Keine..." (Gesund/Ruhelage/Erholt) durch die konkrete Empfehlung
    // ersetzen; bei bereits vorhandener Empfehlung additiv anhängen.
    const replaced = stateText.replace(/^Zu tun: Keine[^\n]*$/m, `Zu tun: ${zusatz}`);
    stateText = replaced.includes(zusatz) ? replaced : `${stateText}\nZu tun (zusätzlich): ${zusatz}`;
  }
  const severityRank = { ok: 0, watch: 1, alarm: 2 };
  const severity = (overdueCrons.length || gnrDegraded || errorSpike || budgetExhausted) && severityRank[classification.severity] < severityRank.watch
    ? "watch"
    : classification.severity;

  const text = [
    stateText,
    "",
    `Crawl: ${fmtAge(crawlH)} (${checked} Quellen, ${failed} Fehler) · Lage: ${fmtAge(lageH)}`,
    `Briefing: ${briefingItems} Einträge · Verstanden zuletzt: ${fmtAge(completeKoH)} · Fehler (24h): ${errors24}`,
    cronLine,
    budgetLine,
    ...(durationLine ? [durationLine] : []),
    ...(errorSpikeLine ? [errorSpikeLine] : []),
    ...(gnrLine ? [gnrLine] : []),
    engagement
  ].join("\n");

  return {
    ok: ok && overdueCrons.length === 0 && !gnrDegraded && !errorSpike,
    text,
    state: classification.state,
    severity,
    overdueCrons: overdueCrons.map((c) => c.name),
    googleUrlResolution: gnr,
    googleUrlResolutionRate: gnrRate,
    llmBudget: llmBudget ? { calls: llmBudget.calls, limit: llmBudget.limit, remaining: llmBudget.remaining, skips: llmBudget.skips, estimatedCostUsd: llmBudget.estimatedCostUsd } : null,
    errorSpike,
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
  const targetUrl = String(process.env.HELMUT_MONITORING_WEBHOOK_URL || "").trim();
  if (!targetUrl) return { sent: false, skipped: true, reason: "HELMUT_MONITORING_WEBHOOK_URL nicht gesetzt." };
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Timeout (Review-Fix): "fail-safe" muss auch HAENGER abdecken, nicht nur
      // Fehler — ein haengender Webhook wuerde sonst den Health-Cron blockieren.
      signal: AbortSignal.timeout(8000),
      // "text" = Slack/Discord-kompatibel; Zusatzfelder für strukturierte Empfänger.
      body: JSON.stringify({
        text: report.text,
        ok: report.ok,
        state: report.state,
        severity: report.severity,
        overdueCrons: report.overdueCrons || [],
        googleUrlResolutionRate: report.googleUrlResolutionRate,
        source: "helmut-health-report"
      })
    });
    return { sent: res.ok, status: res.status };
  } catch (error) {
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
  // Pilot-Modus: das geteilte Demo-Mandat cem-ince ist immer erreichbar.
  // Account-Modus: cem-ince erscheint nur, wenn ein Profil gespeichert oder ein
  // Nutzer zugewiesen ist - kein automatischer cem-ince-Eintrag im Switcher.
  if (!auth.authMode()) ids.add(cemInceProfile.id);
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
  // SaaS-Datenleck-Schutz: KEIN stiller Fallback auf cem-ince (oder ein fremdes
  // Mandat) für Account-Nutzer. Wer kein gültiges eigenes/zugewiesenes Mandat hat,
  // bekommt null -> der Aufrufer liefert einen klaren Fehler statt fremder Daten.
  if (user.role === "abgeordneter") return user.politicianId || null;
  if (Array.isArray(allowed) && allowed.length) return allowed[0];
  // NUR Admin (allowed==="all") darf mangels Auswahl auf ein beliebiges ECHTES
  // Mandat fallen — Admins sind für alle Mandate berechtigt. Referent/Demo OHNE
  // Zuweisung bekommt KEIN Mandat (null) -> klarer Fehler statt fremder Daten.
  if (allowed === "all") {
    const users = await accounts.listUsers();
    const firstMandate = users.find((entry) => entry.role === "abgeordneter" && entry.politicianId);
    return firstMandate ? firstMandate.politicianId : null;
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
  // Seit dem Budget-Rollout gibt es KEINEN Infinity-Pfad mehr: fehlend/leer/0/
  // ungueltig aktiviert das konservative Schutzlimit 50 (storage.llmDailyCallLimit).
  Object.freeze({ name: "HELMUT_MAX_LLM_CALLS_PER_DAY", codeDefault: "Schutzlimit 50 (fail-closed)" }),
  Object.freeze({ name: "HELMUT_V3_STORE", codeDefault: "aus — V3-Read/Understanding inaktiv" }),
  Object.freeze({ name: "HELMUT_SCORING_MODE", codeDefault: "off — Alt-Ranking byte-identisch" }),
  Object.freeze({ name: "HELMUT_V3_SHADOW_COMPARE", codeDefault: "aus — live nicht verdrahtet" }),
  Object.freeze({ name: "HELMUT_PROFILE_DB_MODE", codeDefault: "aus — Profile Blob-only" })
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
  // Read-only, defensiv: der Quellenarchitektur-Report (Sprint 8). Fehler -> null.
  const sourceArchitecture = await buildSourceArchitectureReport(mandates);
  // Budget-Wahrheit (Phase 8): heutiger Stand im EXAKTEN Fenster des Budget-Gates
  // (UTC-Kalendertag) — Skips/Fehler getrennt, pro Pfad, pro Mandant, Limit/Rest.
  // Die 24h-Rolling-Statistik (stats.today) bleibt fuer Kostentrends bestehen.
  // FEHLERFALL (Monitoring-Haertung): statt null ein ehrliches Minimal-Objekt —
  // der Client zeigt "Budget-Anzeige nicht ladbar" statt die Zeile stumm
  // auszublenden, und der Handlungsbedarf kann bei aktivem fail-closed warnen
  // (genau dann verweigert das Gate im Zweifel, waehrend der Admin blind waere).
  const llmBudget = await getLlmUsageBreakdownToday().catch(() => ({
    available: false,
    failClosed: ["1", "true", "on", "yes"].includes(String(process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED || "").trim().toLowerCase())
  }));

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
    users,
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
    updatedAt: p.updatedAt || null
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
      // Konto-Typ NUR wenn sicher ermittelbar (nicht raten): das Pilot-/Demo-Seed-Mandat
      // cem-ince -> "Pilot"; sonst ein evtl. vorhandenes explizites Flag; sonst null.
      kontoTyp: id === cemInceProfile.id ? "Pilot" : (u.kontoTyp || u.accountKind || u.kind || null),
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
      neu: dsNum(cr.savedItems),
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

async function normalizeTask(task, politicianId = cemInceProfile.id) {
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

async function normalizeInteraction(interaction, politicianId = cemInceProfile.id) {
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

async function normalizeUserNote(note, politicianId = cemInceProfile.id) {
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

async function activeProfile(politicianId = cemInceProfile.id) {
  const stored = await getProfile(politicianId);
  if (stored) return mergeProfileDefaults(stored);
  // Immer zuerst das gespeicherte Profil (oben). cem-ince erhaelt seine reichen
  // Seed-Defaults NUR im Pilot-Modus, solange noch kein Profil gespeichert ist.
  // Im Account-Modus gibt es keinen stillen cem-ince-Ersatz: fehlt das Profil,
  // greift das neutrale blankProfile wie fuer jedes andere Mandat.
  if (!auth.authMode() && politicianId === cemInceProfile.id) return cemInceProfile;
  return blankProfile(politicianId);
}

// Neutrale Default-Werte fuer JEDES Mandat ausser dem Demo-Profil cem-ince.
// Wichtig: Neue Abgeordnete duerfen KEINE inhaltlichen Cem-Ince-Defaults erben
// (Ausschuesse, Themen, Positionen). Nur generisches Geruest, damit der Briefing-
// Motor arbeiten kann, bleibt vorbelegt.
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

// Nur im Pilot-Modus erbt das Demo-Mandat cem-ince seine reichhaltigen Defaults
// als Merge-Basis. Im Account-Modus erhaelt cem-ince (wie jedes andere Mandat)
// die neutrale blankProfile-Basis; gespeicherte Felder ueberschreiben sie ohnehin.
function baseProfileFor(id) {
  if (!auth.authMode() && id === cemInceProfile.id) return cemInceProfile;
  return blankProfile(id);
}

function mergeProfileDefaults(profile) {
  const base = baseProfileFor(profile.id);
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

async function normalizeProfile(profile, politicianId = cemInceProfile.id) {
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
  next.preferredChannels = arrayValue(profile.preferredChannels, base.preferredChannels);
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
  return String(url.searchParams.get("politicianId") || url.searchParams.get("profileId") || cemInceProfile.id)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "") || cemInceProfile.id;
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
  const politicianId = politicianIdFromUrl(url);

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
      // AUDIT (Monitoring-Haertung): kostenausloesende Debug-Aktion (Crawl +
      // Understanding/KI) dauerhaft nachvollziehbar; Metadaten, fail-safe.
      await accounts.recordAudit({ action: "debug.crawl", actorEmail: "debug-secret", politicianId }).catch(() => {});
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
      // AUDIT: zustandsaendernde Debug-Aktion (schreibt Test-KO); fail-safe.
      await accounts.recordAudit({ action: "debug.seed-ko", actorEmail: "debug-secret" }).catch(() => {});
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
        mentioned_mps: ["Hubertus Heil"],
        mentioned_parties: ["SPD", "Gruene", "CDU"],
        mentioned_committees: ["Ausschuss fuer Arbeit und Soziales"],
        mentioned_ministries: ["BMAS"],
        mentioned_locations: ["Berlin"],
        mentioned_organizations: ["Deutsche Rentenversicherung"],
        policy_field: "Sozialpolitik",
        political_level: "Bund",
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
      // AUDIT: kostenausloesende Debug-Aktion (KI-Understanding); fail-safe.
      await accounts.recordAudit({ action: "debug.run-understanding", actorEmail: "debug-secret" }).catch(() => {});
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
      // AUDIT: zustandsaendernde Debug-Aktion (legt pending-KOs an); fail-safe.
      await accounts.recordAudit({ action: "debug.create-test-vorgang", actorEmail: "debug-secret" }).catch(() => {});
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
  // EHRLICHKEIT (Monitoring-Haertung): Das durchgesetzte Gate ist seit dem
  // Budget-Rollout die ATOMARE Reservierung am Modell-Choke-Point
  // (storage.reserveLlmCall) — dieser Endpoint setzt nur das llmUsage-KOSTEN-LOG
  // zurueck. Im lokalen Datei-Modus wird zusaetzlich der In-Prozess-
  // Reservierungszaehler zurueckgesetzt (sonst lehnt das Gate trotz geleertem Log
  // weiter ab). Im Supabase-Modus bleibt die heutige llm_budget_counters-Zeile
  // UNangetastet (bewusst kein DB-Write hier) — die Antwort sagt das explizit.
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
      // Lokaler Datei-Modus: In-Prozess-Reservierungszaehler mitziehen (Supabase-
      // Modus zaehlt in llm_budget_counters — die wird hier NICHT angefasst).
      const supabaseMode = getStorageStatus().backend === "supabase";
      let reservationCounterReset = false;
      if (!supabaseMode) {
        try {
          require("./lib/helmut/storage").__resetLlmReservationForTests();
          reservationCounterReset = true;
        } catch (_) { /* fail-safe: der Log-Reset bleibt gueltig */ }
      }
      // AUDIT: Budget-Log-Reset dauerhaft nachvollziehbar (Debug-Route ohne
      // Session -> Actor "debug-secret"); nur Metadaten, fail-safe.
      await accounts.recordAudit({
        action: "debug.reset-llm-budget",
        actorEmail: "debug-secret",
        detail: `removed=${removed} reservationCounterReset=${reservationCounterReset}`
      }).catch(() => {});
      console.log(`[debug/reset-llm-budget] removed=${removed} today=${today} reservationCounterReset=${reservationCounterReset}`);
      return {
        debug: true,
        today,
        removedEntries: removed,
        remainingTotal: kept.length,
        reservationCounterReset,
        message: supabaseMode
          ? `${removed} heutige llmUsage-Eintraege entfernt. ACHTUNG: Nur das Kosten-Log wurde zurueckgesetzt — der atomare Reservierungszaehler (heutige llm_budget_counters-Zeile, nach Migration 20260717) bleibt unveraendert, das Budget-Gate kann weiter ablehnen.`
          : (removed > 0 || reservationCounterReset
            ? `${removed} heutige llmUsage-Eintraege entfernt und In-Prozess-Reservierungszaehler zurueckgesetzt. Budget ist wieder frei.`
            : "Keine heutigen Eintraege gefunden — Budget war bereits bei 0.")
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
        // EHRLICHER Fix-Hinweis: reset-llm-budget setzt nur das Kosten-Log zurueck,
        // NICHT den atomaren Reservierungszaehler (llm_budget_counters) — nach der
        // Migration bleibt das Gate trotz "Reset" zu.
        fix = "HELMUT_MAX_LLM_CALLS_PER_DAY erhoehen oder bis zum UTC-Tageswechsel warten. /api/debug/reset-llm-budget leert NUR das Kosten-Log, nicht den atomaren Reservierungszaehler (llm_budget_counters).";
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
      // AUDIT: kostenausloesende Debug-Aktion (1 echter Azure-Call); fail-safe.
      await accounts.recordAudit({ action: "debug.pipeline-probe", actorEmail: "debug-secret" }).catch(() => {});
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
          const bodyText = (await res.text().catch(() => "")).slice(0, 300);
          out.azure = {
            apiUrl, httpStatus: res.status, ok: res.ok, deployment: azDeployment,
            latencyMs: Date.now() - startedAt,
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
      // AUDIT: Bulk-Statuswechsel + anschliessender KI-Lauf; Metadaten, fail-safe.
      await accounts.recordAudit({ action: "debug.reset-failed-kos", actorEmail: "debug-secret", detail: `failedBefore=${failedCount}` }).catch(() => {});

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
      // AUDIT: zustandsaendernde Debug-Aktion (Lock-Write); Metadaten, fail-safe.
      await accounts.recordAudit({ action: "debug.release-understanding-lock", actorEmail: "debug-secret", detail: `lockVorher=${Boolean(lockBefore)}` }).catch(() => {});

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
