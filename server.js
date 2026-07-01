const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

loadLocalEnv();

const { cemInceProfile, demoRawItems, demoSources, generateBriefing } = require("./lib/helmut/runtime");
const { getLatestOrDemoBriefing, runDailyPipeline, runLageCheck, runMorningBriefing, runSourceCrawl } = require("./lib/helmut/scheduler");
const { personalizeBriefing } = require("./lib/helmut/personalization");
const { buildLearningProfile } = require("./lib/helmut/learning");
const { deleteProfileData, exportProfileData, getInteractions, getLatestBriefing, getLatestCrawlRun, getLatestLageCheck, getLatestPipelineDebugReport, getProfile, listProfiles, listFullProfiles, getRawItemsSince, getStorageStatus, getStoreSummary, getTasks, getTopicMemory, getUserNotes, removePushSubscription, saveInteraction, saveProfile, saveFeedback, listFeedback, setFeedbackDone, savePushSubscription, saveTask, saveUserNote, updateTaskStatus, listPushEvents } = require("./lib/helmut/storage");
const { generateCommunicationDraft, assessParliamentaryItem, isAiEnabled, activeModelName } = require("./lib/helmut/ai");
const { pushStatus, sendBriefingReadyPush, sendLageChangePush, sendPushToPolitician } = require("./lib/helmut/push");
const auth = require("./lib/helmut/auth");
const accounts = require("./lib/helmut/accounts");
const { getRelevantParliamentaryItems, isDipEnabled } = require("./lib/helmut/dip");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
// Erlaubte Feedback-Typen (Admin-Inbox). Bewusst schlank, kein freier Text-Typ.
const FEEDBACK_TYPES = ["relevant", "nicht_relevant", "falsch", "mehr_davon", "weniger_davon", "unklar"];
// Cache-Busting fuer styles.css/client.js. Leitet sich automatisch vom Deploy ab
// (Vercel setzt VERCEL_GIT_COMMIT_SHA pro Deploy), damit ein neues Release nie mit
// veralteten, gecachten Assets ausgeliefert wird. Fallback fuer lokal/ohne Vercel.
const ASSET_VERSION = String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 8) || "20260701-adminfix1";
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

async function handleRequest(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const previewMode = isPreviewMode(url);
  if (shouldRedirectToCanonicalHost(request, url)) {
    url.protocol = "https:";
    url.host = canonicalHost;
    response.writeHead(308, {
      Location: url.toString(),
      "Cache-Control": "no-store"
    });
    response.end();
    return;
  }

  if (url.pathname === "/api/pilot/unlock" && request.method === "POST") {
    return handleJson(request, response, async (body) => {
      if (!isPilotAccessConfigured()) return { ok: true, configured: false };
      const submittedSecret = String(body.secret || "").trim();
      if (!submittedSecret || submittedSecret !== process.env.PILOT_SECRET) {
        response.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ error: "Zugangscode nicht korrekt." }, null, 2));
        return null;
      }
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": pilotCookieHeader(process.env.PILOT_SECRET, 30 * 24 * 60 * 60)
      });
      response.end(JSON.stringify({ ok: true }, null, 2));
      return null;
    });
  }

  if (url.pathname === "/api/pilot/logout" && request.method === "POST") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": pilotCookieHeader("", 0)
    });
    response.end(JSON.stringify({ ok: true }, null, 2));
    return;
  }

  if (url.pathname === "/api/release/public") {
    return handleAsync(response, async () => publicReleasePayload(await computeReleaseCheck(politicianIdFromUrl(url))));
  }

  if (url.pathname === "/privacy" || url.pathname === "/datenschutz") {
    return sendPrivacyPage(response);
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
      // Cron-Routen schuetzen sich selbst (isAuthorizedCron). Jeder andere API-Aufruf: 401.
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
  } else {
    politicianId = politicianIdFromUrl(url);
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
      return {
        profile,
        briefing,
        tasks: await getTasks(profile.id),
        notes: await getUserNotes(profile.id),
        aiStatus: {
          enabled: isAiEnabled(),
          model: process.env.HELMUT_TEXT_MODEL || process.env.OPENAI_MODEL || "gpt-5.5"
        }
      };
    });
  }

  if (url.pathname === "/api/profile/current") {
    if (request.method === "GET") return handleAsync(response, () => activeProfile(politicianId));
    if (request.method === "POST" || request.method === "PATCH") {
      if (previewMode) return sendPreviewReadOnly(response);
      return handleJson(request, response, async (body) => saveProfile(await normalizeProfile(body, politicianId)));
    }
  }

  if (url.pathname === "/api/profile/demo") {
    if (!hasAdminBypass(request, url)) return sendNotFound(response);
    if (request.method === "GET") return handleAsync(response, () => activeProfile(politicianId));
    if (request.method === "POST" || request.method === "PATCH") {
      return handleJson(request, response, async (body) => saveProfile(await normalizeProfile(body, politicianId)));
    }
  }

  if (url.pathname === "/api/briefing/demo") {
    if (!hasAdminBypass(request, url)) return sendNotFound(response);
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      const demo = generateBriefing(profile, demoRawItems, demoSources);
      return personalizeBriefing(demo, profile, await getTopicMemory(profile.id), await getInteractions(profile.id));
    });
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
      const latest = await getLatestBriefing(politicianId);
      if (!isForcedPilotRun(url) && !hasAdminBypass(request, url) && isRecent(latest?.generatedAt || latest?.date, manualRunMinIntervalMs)) {
        return {
          ...latest,
          skippedReason: "Briefing wurde gerade erst erzeugt. Helmut nutzt den letzten Lauf, um unnötige Kosten zu vermeiden."
        };
      }
      return runMorningBriefing(politicianId);
    });
  }

  if (url.pathname === "/api/crawl/run") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleAsync(response, async () => {
      const latest = await getLatestCrawlRun();
      if (!isForcedPilotRun(url) && !hasAdminBypass(request, url) && isRecent(latest?.createdAt, manualRunMinIntervalMs)) {
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
      const latestCrawl = await getLatestCrawlRun();
      const latestBriefing = await getLatestBriefing(politicianId);
      if (!isForcedPilotRun(url) && !hasAdminBypass(request, url) && isRecent(latestCrawl?.createdAt, manualRunMinIntervalMs) && isRecent(latestBriefing?.generatedAt || latestBriefing?.date, manualRunMinIntervalMs)) {
        return {
          crawl: latestCrawl,
          briefing: latestBriefing,
          skippedReason: "Pipeline wurde gerade erst ausgeführt. Helmut nutzt den letzten Lauf."
        };
      }
      return runDailyPipeline(politicianId);
    });
  }

  if (url.pathname === "/api/lage/check") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleAsync(response, async () => {
      const latest = await getLatestLageCheck(politicianId);
      if (!isForcedPilotRun(url) && !hasAdminBypass(request, url) && isRecent(latest?.checkedAt || latest?.createdAt, manualRunMinIntervalMs)) {
        return {
          ...latest,
          skippedReason: "Die Lage wurde gerade erst geprüft. Helmut nutzt den letzten Lage-Check."
        };
      }
      return runLageCheck(politicianId);
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
        response.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
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
    return handleAsync(response, () => exportProfileData(politicianId));
  }

  if (url.pathname === "/api/privacy/delete" && request.method === "POST") {
    if (previewMode) return sendPreviewReadOnly(response);
    return handleJson(request, response, async (body) => {
      if (String(body.confirm || "").trim() !== "DELETE") {
        response.writeHead(400, jsonHeaders());
        response.end(JSON.stringify({ error: "Deletion requires confirm: DELETE" }, null, 2));
        return null;
      }
      return deleteProfileData(politicianId);
    });
  }

  if (url.pathname === "/api/ops/status") {
    return handleAsync(response, async () => {
      const latestCrawl = await getLatestCrawlRun();
      const latestLageCheck = await getLatestLageCheck(politicianId);
      const latestBriefing = await getLatestBriefing(politicianId);
      const latestDebug = await getLatestPipelineDebugReport(politicianId);
      const storage = getStorageStatus();
      const storeSummary = await getStoreSummary(politicianId);
      const evidenceQuality = sourceEvidenceQuality(latestBriefing);
      const learning = buildLearningProfile(await getInteractions(politicianId));
      const readiness = pilotReadiness(latestCrawl, latestBriefing, storage, evidenceQuality, latestLageCheck);
      const backend = backendHealth(latestCrawl, latestBriefing, latestDebug, storage, storeSummary, evidenceQuality, latestBriefing?.referentEngine, learning, latestLageCheck);
      return {
        status: operationalStatus(latestCrawl, latestBriefing, storage, latestLageCheck),
        backend,
        readiness,
        learning,
        evidenceQuality,
        storage,
        store: storeSummary,
        tenant: tenantStatus(politicianId),
        ai: {
          enabled: isAiEnabled(),
          model: process.env.HELMUT_TEXT_MODEL || process.env.OPENAI_MODEL || "gpt-5.5"
        },
        push: {
          ...pushStatus(),
          publicKey: pushStatus().enabled ? "configured" : ""
        },
        crawl: latestCrawl || null,
        lageCheck: latestLageCheck || null,
        briefing: latestBriefing ? {
          id: latestBriefing.id,
          status: latestBriefing.status,
          generatedAt: latestBriefing.generatedAt || latestBriefing.date,
          itemCount: Array.isArray(latestBriefing.items) ? latestBriefing.items.length : 0,
          recommendationCount: Array.isArray(latestBriefing.personalizedRecommendations) ? latestBriefing.personalizedRecommendations.length : 0,
          situationalCount: Array.isArray(latestBriefing.situationalBriefing) ? latestBriefing.situationalBriefing.length : 0,
          quality: latestBriefing.quality || null,
          referentEngine: latestBriefing.referentEngine || null
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
    if (!isAuthorizedCron(request, url)) return sendUnauthorized(response);
    return handleAsync(response, () => runSourceCrawl(politicianId));
  }

  if (url.pathname === "/api/cron/morning-briefing") {
    if (!isAuthorizedCron(request, url)) return sendUnauthorized(response);
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      const briefing = await runMorningBriefing(politicianId);
      const push = await sendBriefingReadyPush(briefing, profile);
      return { briefing, push };
    });
  }

  if (url.pathname === "/api/cron/pipeline") {
    if (!isAuthorizedCron(request, url)) return sendUnauthorized(response);
    return handleAsync(response, () => runDailyPipeline(politicianId));
  }

  // Morgen-Health-Report per WhatsApp (CallMeBot). Antwort enthaelt den Text +
  // Zustellstatus, damit man ihn manuell testen kann (?secret=CRON_SECRET).
  if (url.pathname === "/api/cron/health-report") {
    if (!isAuthorizedCron(request, url)) return sendUnauthorized(response);
    return handleAsync(response, async () => {
      const report = await buildHealthReport(politicianId);
      const delivery = await sendCallMeBotMessage(report.text);
      return { ok: report.ok, text: report.text, delivery };
    });
  }

  if (url.pathname === "/api/cron/lage-check") {
    if (!isAuthorizedCron(request, url)) return sendUnauthorized(response);
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      const lageCheck = await runLageCheck(politicianId);
      const push = await sendLageChangePush(lageCheck, profile);
      return { lageCheck, push };
    });
  }

  if (url.pathname === "/api/tasks/demo") {
    if (!hasAdminBypass(request, url)) return sendNotFound(response);
    return handleAsync(response, async () => generateBriefing(await activeProfile(politicianId), demoRawItems, demoSources).tasks);
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
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Task not found" }, null, 2));
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
        if (accountAuth) await accounts.recordAudit({ action: "daily-input.create", userId: authUser?.id, actorEmail: authUser?.email, politicianId, detail: entry.title });
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

  const requestedPath = isAppEntryPath(url.pathname) ? "index.html" : url.pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(root, requestedPath));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
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
      response.writeHead(404);
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
  if (!isPilotAccessConfigured()) return true;
  if (request.method === "OPTIONS") return true;
  if (isPublicAssetPath(url.pathname)) return true;
  if (url.pathname.startsWith("/api/cron/")) return true;
  if (hasAdminBypass(request, url)) return true;

  const pilotSecret = process.env.PILOT_SECRET;
  if (allowQuerySecrets() && url.searchParams.get("pilot") === pilotSecret) return true;

  const auth = parseAuthorization(request.headers.authorization || "");
  if (auth.bearer && auth.bearer === pilotSecret) return true;
  if (auth.basic && auth.basic.password === pilotSecret) return true;

  return readCookie(request, "helmut_pilot") === pilotSecret;
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

async function latestBriefingPayload({ politicianId, profile, url, previewMode = false, compact = false }) {
  const latest = await getLatestOrDemoBriefing(politicianId);
  const hasStoredBriefing = Boolean(latest.homeSections && latest.personalizedRecommendations);
  // On-Demand-Erzeugung NUR wenn noch gar kein Briefing existiert (neues Mandat):
  // schnell und OHNE KI, damit niemand einen leeren Bildschirm sieht. Ein bereits
  // erzeugtes Briefing wird beim Lesen NIE ueberschrieben (sonst wuerde das gute
  // taegliche KI-Briefing vom Cron durch ein "nichts Neues" ersetzt). Frische KI-
  // Briefings laufen ueber Cron und das manuelle "Aktualisieren" (/api/briefing/run).
  if (!previewMode && !hasStoredBriefing) {
    try {
      const fresh = await runMorningBriefing(politicianId, { skipAi: true });
      if (fresh && fresh.homeSections) return prepareBriefingResponse(fresh, { previewMode, compact });
    } catch (error) {
      console.error("Quick briefing failed", error);
    }
  }
  if (!hasStoredBriefing) {
    const personalized = personalizeBriefing(latest, profile, await getTopicMemory(profile.id), await getInteractions(profile.id));
    return prepareBriefingResponse(personalized, { previewMode, compact });
  }
  return prepareBriefingResponse(latest, { previewMode, compact });
}

function compactBriefingPayload(briefing) {
  if (!briefing || typeof briefing !== "object") return briefing;
  const clone = {
    ...briefing,
    items: compactItems(briefing.items, 6),
    personalizedRecommendations: compactItems(briefing.personalizedRecommendations, 6),
    situationalBriefing: compactItems(briefing.situationalBriefing, 3),
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
    || pathname === "/robots.txt";
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
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
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
      <h1>Pilot-Zugang.</h1>
      <p>Helmut ist aktuell ein geschützter Pilot. Gib den Zugangscode ein, um die politische Lage zu öffnen.</p>
      <p><a href="/datenschutz">Datenschutz</a></p>
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

function sendPrivacyPage(response) {
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
      <p class="notice">Diese Erklärung beschreibt die Datenverarbeitung von Helmut im Pilotbetrieb. Eine rechtliche Prüfung vor breitem Produktivbetrieb wird empfohlen — insbesondere falls die KI-Funktion (OpenAI) aktiviert wird.</p>

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

      <h2>5. Empfänger / Auftragsverarbeiter</h2>
      <ul>
        <li><strong>Vercel</strong> (Hosting/Betrieb der Anwendung).</li>
        <li><strong>Supabase</strong> (Datenspeicherung, EU-Region).</li>
        ${isAiEnabled()
          ? "<li><strong>OpenAI</strong> (KI-Textgenerierung) — <strong>derzeit AKTIV</strong>: Inhalte werden zur Texterzeugung an OpenAI in die USA übermittelt.</li>"
          : "<li><strong>OpenAI</strong> (KI-Textgenerierung) — <strong>derzeit deaktiviert</strong>, daher keine Nutzung und keine Übermittlung.</li>"}
        <li><strong>Browser-Push-Dienste</strong> (nur bei aktivierten Benachrichtigungen).</li>
      </ul>
      <p>Mit den eingesetzten Auftragsverarbeitern werden <strong>Auftragsverarbeitungsverträge (AVV)</strong> nach Art. 28 DSGVO geschlossen.</p>

      <h2>6. Übermittlung in Drittländer</h2>
      ${isAiEnabled()
        ? "<p><strong>Derzeit ist die KI-Funktion aktiv:</strong> Zur Texterzeugung werden Inhalte an OpenAI (USA) übermittelt — im Wesentlichen öffentlich verfügbare Nachrichteninhalte und das fachliche Mandatsprofil; besondere Kategorien personenbezogener Daten werden nicht übermittelt. Die Übermittlung stützt sich auf den Auftragsverarbeitungsvertrag mit OpenAI samt EU-Standardvertragsklauseln. Über die API übermittelte Daten werden von OpenAI nicht zum Training verwendet.</p>"
        : "<p><strong>Im aktuellen Pilotbetrieb findet keine Übermittlung personenbezogener Daten in Drittländer (z. B. USA) statt.</strong> Die KI-Textgenerierung über OpenAI ist deaktiviert; Briefings werden regelbasiert erzeugt. Sollte die KI-Funktion künftig aktiviert werden, würden Inhalte an OpenAI in die USA übermittelt — dies erfordert dann eine gesonderte Rechtsgrundlage und eine Aktualisierung dieser Erklärung.</p>"}

      <h2>7. Speicherdauer</h2>
      <p>Profil- und Inhaltsdaten werden bis zur Löschung des Kontos bzw. bis zum Ende des Pilotbetriebs gespeichert. Verläufe (u. a. Briefings, Interaktionen, Notizen, Sessions, Fehlerprotokolle) werden technisch begrenzt und pro Mandat gekappt. Auf Wunsch werden Daten umgehend gelöscht (siehe Deine Rechte).</p>

      <h2>8. Cookies</h2>
      <p>Helmut setzt ein technisch notwendiges Session-Cookie (<code>helmut_session</code>, HttpOnly, SameSite=Lax) zur Anmeldung. Es dient nicht der Werbung oder dem Tracking.</p>

      <h2>9. Deine Rechte</h2>
      <p>Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. In der App: Profildaten <strong>exportieren</strong> und <strong>löschen</strong> (Einstellungen). Es besteht ein <strong>Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde</strong>.</p>

      <h2>10. Kontakt &amp; Stand</h2>
      <p>Datenschutzanfragen: <a href="mailto:hi@nohut.de">hi@nohut.de</a> · Stand: Juni 2026</p>
      <p><a href="/">Zurück zu Helmut</a></p>
    </main>
  </body>
</html>`);
}

function indexHtml() {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#050914" />
    <meta name="apple-mobile-web-app-title" content="Helmut" />
    <meta name="application-name" content="Helmut" />
    <title>Helmut</title>
    <link rel="icon" href="assets/favicon.ico" sizes="any" />
    <link rel="icon" href="assets/helmut_logo.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="assets/helmut_appicon_192.png" />
    <link rel="manifest" href="site.webmanifest?v=20260624-dark-splash1" />
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
    <script src="client.js?v=${ASSET_VERSION}"></script>
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

function securityHeaders(extra = {}) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
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

function operationalStatus(crawl, briefing, storage, lageCheck = null) {
  const briefingDate = briefing?.generatedAt || briefing?.date;
  const briefingAge = briefingDate ? Date.now() - new Date(briefingDate).getTime() : Infinity;
  const crawlHealthy = isFullCrawlHealthy(crawl);
  const lageHealthy = isLageCheckFresh(lageCheck);
  const briefingHealthy = briefing && briefingAge < 18 * 60 * 60 * 1000;
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

function backendHealth(crawl, briefing, debugReport, storage, storeSummary, evidenceQuality, referentEngine = null, learning = null, lageCheck = null) {
  const checks = [];
  addBackendCheck(checks, "Persistenter Speicher", storage.backend === "supabase", storage.backend === "supabase" ? "Supabase ist aktiv." : "Helmut speichert noch lokal.");
  addBackendCheck(checks, "Quellenbasis", Number(storeSummary.sources?.active || 0) >= minConfiguredSources, `${storeSummary.sources?.active || 0} aktive Quellen konfiguriert.`);
  addBackendCheck(checks, "Raw Items", Number(storeSummary.rawItems?.total || 0) > 0, `${storeSummary.rawItems?.total || 0} Artikel gespeichert, ${storeSummary.rawItems?.last24h || 0} in den letzten 24 Stunden.`);

  const checkedSources = Number(crawl?.checkedSources || 0);
  const failedSources = Number(crawl?.failedSources || 0);
  const crawlFailureRatio = checkedSources ? failedSources / checkedSources : 1;
  addBackendCheck(checks, "Lage-Frische", isFullCrawlHealthy(crawl) || isLageCheckFresh(lageCheck), latestLageFreshnessDetail(crawl, lageCheck));
  addBackendCheck(checks, "Crawl-Qualität", checkedSources >= minCheckedSources && crawlFailureRatio <= maxCrawlFailureRatio, `${checkedSources} Quellen geprüft, ${failedSources} Fehler.`);

  const briefingDate = briefing?.generatedAt || briefing?.date;
  const briefingAge = briefingDate ? Date.now() - new Date(briefingDate).getTime() : Infinity;
  const recommendationCount = Number(briefing?.personalizedRecommendations?.length || 0);
  const itemCount = Number(briefing?.items?.length || 0);
  const situationalCount = Number(briefing?.situationalBriefing?.length || 0);
  const calmState = Boolean(briefing?.quality?.calmState || referentEngine?.calmState || situationalCount > 0);
  const hasDecisionValue = recommendationCount > 0 && itemCount > 0;
  addBackendCheck(checks, "Briefing-Frische", Boolean(briefing) && briefingAge < 18 * 60 * 60 * 1000, briefingDate ? `Letztes Briefing: ${briefingDate}.` : "Noch kein Briefing gespeichert.");
  addBackendCheck(checks, "Demo-Freiheit", Boolean(briefing) && briefing.status !== "Demo", briefing?.status ? `Status: ${briefing.status}.` : "Kein Briefingstatus vorhanden.");
  addBackendCheck(checks, "Entscheidungswert", hasDecisionValue || calmState, hasDecisionValue ? `${recommendationCount} persönliche Empfehlungen, ${itemCount} sichtbare Entscheidungen.` : `${situationalCount} Beobachtungspunkte, keine neue Reaktion nötig.`);
  addBackendCheck(checks, "Quellenlinks", Number(evidenceQuality?.missingLinks || 0) === 0 && Number(evidenceQuality?.publisherFallbacks || 0) === 0, `${evidenceQuality?.directLinks || 0}/${evidenceQuality?.total || 0} Belege mit Direktlink.`);
  addBackendCheck(checks, "Referentenmodus", Number(referentEngine?.score || 0) >= 85 || calmState, referentEngine ? `${referentEngine.status}: ${referentEngine.score}% Referentenqualität.` : "Stabile Lage ohne neue Handlungspflicht.");
  addBackendCheck(checks, "Lernmodus", Number(learning?.eventCount || 0) >= 1, learning?.eventCount ? `${learning.eventCount} Nutzungssignale gespeichert, Vertrauen ${learning.confidence}.` : "Noch keine Nutzungssignale gespeichert.");
  addBackendCheck(checks, "Pipeline-Debug", Boolean(debugReport?.counts), debugReport?.createdAt ? `Letzter Debug: ${debugReport.createdAt}.` : "Noch kein Debug-Report gespeichert.");

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

function pilotReadiness(crawl, briefing, storage, evidenceQuality = null, lageCheck = null) {
  const issues = [];
  const warnings = [];
  const briefingDate = briefing?.generatedAt || briefing?.date;
  const briefingAge = briefingDate ? Date.now() - new Date(briefingDate).getTime() : Infinity;
  const checkedSources = Number(crawl?.checkedSources || 0);
  const failedSources = Number(crawl?.failedSources || 0);
  const successfulSources = Number(crawl?.successfulSources || 0);
  const recommendationCount = Array.isArray(briefing?.personalizedRecommendations) ? briefing.personalizedRecommendations.length : 0;
  const situationalCount = Array.isArray(briefing?.situationalBriefing) ? briefing.situationalBriefing.length : 0;
  const quality = briefing?.quality || null;
  const qualityScore = Number(quality?.score || 0);
  const calmState = Boolean(quality?.calmState || briefing?.referentEngine?.calmState || situationalCount > 0);

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
    if (briefingAge > 18 * 60 * 60 * 1000) issues.push("Das letzte Briefing ist veraltet.");
    if (recommendationCount < 1 && !calmState) issues.push("Das Briefing enthält keine persönliche Empfehlung.");
    if (!quality) warnings.push("Die Briefingqualität wurde noch nicht geprüft.");
    if (quality && qualityScore < 90 && !calmState) issues.push("Die Briefingqualität ist noch nicht pitchbereit.");
  }
  if (!process.env.CRON_SECRET) warnings.push("Cron-Routen sind noch nicht mit CRON_SECRET geschützt.");
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

function releaseCheck({ crawl, briefing, storage, storeSummary, evidenceQuality, backend, readiness, learning, radarArchive, lageCheck }) {
  const checks = [];
  const briefingDate = briefing?.generatedAt || briefing?.date;
  const briefingAge = briefingDate ? Date.now() - new Date(briefingDate).getTime() : Infinity;
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
  addReleaseCheck(checks, "OpenAI", isAiEnabled(), isAiEnabled() ? `Modell ${process.env.HELMUT_TEXT_MODEL || process.env.OPENAI_MODEL || "gpt-5.5"} aktiv.` : "OpenAI ist nicht aktiv.");
  addReleaseCheck(checks, "Briefing", Boolean(briefing) && briefingAge < 18 * 60 * 60 * 1000 && hasDecisionOrCompetentCalm && briefing.status !== "Demo", briefing ? `${visibleDecisionCount} Entscheidungen, ${recommendationCount} Empfehlungen, ${situationalCount} Beobachtungspunkte.` : "Kein Briefing.");
  addReleaseCheck(checks, "Quellenlinks", Number(evidenceQuality?.missingLinks || 0) === 0 && Number(evidenceQuality?.publisherFallbacks || 0) === 0, `${evidenceQuality?.directLinks || 0}/${evidenceQuality?.total || 0} sichtbare Belege mit Direktlink.`);
  addReleaseCheck(checks, "Radar", Array.isArray(briefing?.personMentions) && Array.isArray(radarArchive?.articles), `${briefing?.personMentions?.length || 0} neue Personenartikel, ${radarArchive?.total || 0} Archivartikel.`);
  addReleaseCheck(checks, "Referentenmodus", Number(briefing?.referentEngine?.score || 0) >= 85 || Boolean(briefing?.quality?.calmState) || Number(backend?.score || 0) >= 90, briefing?.referentEngine ? `${briefing.referentEngine.status || "Referentenmodus"}: ${briefing.referentEngine.score}% Referentenqualität.` : `${backend?.score || 0}% Backendgesundheit.`);
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
  const latestCrawl = await getLatestCrawlRun();
  const latestLageCheck = await getLatestLageCheck(politicianId);
  const latestBriefing = await getLatestBriefing(politicianId);
  const latestDebug = await getLatestPipelineDebugReport(politicianId);
  const storage = getStorageStatus();
  const storeSummary = await getStoreSummary(politicianId);
  const evidenceQuality = sourceEvidenceQuality(latestBriefing);
  const radarArchive = await getRadarArchive(await activeProfile(politicianId), 92);
  const learning = buildLearningProfile(await getInteractions(politicianId));
  const backend = backendHealth(latestCrawl, latestBriefing, latestDebug, storage, storeSummary, evidenceQuality, latestBriefing?.referentEngine, learning, latestLageCheck);
  const readiness = pilotReadiness(latestCrawl, latestBriefing, storage, evidenceQuality, latestLageCheck);
  return releaseCheck({
    crawl: latestCrawl,
    lageCheck: latestLageCheck,
    briefing: latestBriefing,
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
      detail: check.detail
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
async function buildHealthReport(politicianId = cemInceProfile.id) {
  const [crawl, lageCheck, briefing, pipeline, errors, users, feedback, pushEvents] = await Promise.all([
    getLatestCrawlRun(),
    getLatestLageCheck(politicianId),
    getLatestBriefing(politicianId),
    getLatestPipelineDebugReport(politicianId),
    accounts.listSystemErrors(100),
    accounts.listUsers(),
    listFeedback(200),
    listPushEvents(politicianId, 200)
  ]);
  const storage = getStorageStatus();
  const now = Date.now();
  const hoursSince = (t) => t ? (now - new Date(t).getTime()) / 3600000 : null;
  const fmtAge = (h) => h == null ? "nie" : h < 1 ? "gerade" : h < 48 ? `vor ${Math.round(h)}h` : `vor ${Math.round(h / 24)}T`;
  const day = 24 * 3600000;

  const crawlH = hoursSince(crawl?.checkedAt || crawl?.createdAt);
  const briefingH = hoursSince(briefing?.generatedAt || briefing?.date);
  const lageH = hoursSince(lageCheck?.checkedAt || lageCheck?.createdAt);
  const pipelineH = hoursSince(pipeline?.createdAt);
  const briefingItems = Array.isArray(briefing?.items) ? briefing.items.length : 0;
  const errors24 = (errors || []).filter((e) => e.createdAt && (now - new Date(e.createdAt).getTime()) < day).length;
  const feedback24 = (feedback || []).filter((f) => f.createdAt && (now - new Date(f.createdAt).getTime()) < day).length;
  const pushSent24 = (pushEvents || []).filter((e) => e.createdAt && (now - new Date(e.createdAt).getTime()) < day && Number(e.delivered) > 0).length;
  const active7 = (users || []).filter((u) => {
    const seen = u.lastSeenAt || u.lastLoginAt;
    return seen && (now - new Date(seen).getTime()) < 7 * day;
  }).length;
  const checked = Number(crawl?.checkedSources || 0);
  const failed = Number(crawl?.failedSources || 0);

  const problems = [];
  if (crawlH == null || crawlH > 28) problems.push(`Crawl ${crawlH == null ? "nie gelaufen" : "seit " + Math.round(crawlH) + "h aus"}`);
  if (briefingH == null || briefingH > 30) problems.push(`Briefing ${briefingH == null ? "fehlt" : "seit " + Math.round(briefingH) + "h alt"}`);
  // Briefing ist frisch, aber leer -> stiller KI-/Crawl-Ausfall (technisch gruen, inhaltlich tot).
  if (briefingH != null && briefingH <= 30 && briefingItems === 0) problems.push("Briefing leer (0 Einträge) – KI/Crawl prüfen");
  // Pipeline-Debug-Report wird am Ende jedes Briefing-Laufs geschrieben (05/16 UTC).
  // Nur bei vorhandenem, aber veraltetem Marker alarmieren (kein Fehlalarm bei fehlendem Report).
  if (pipelineH != null && pipelineH > 28) problems.push(`Pipeline seit ${Math.round(pipelineH)}h nicht durchgelaufen`);
  if (storage.backend !== "supabase") problems.push("Speicher: Supabase inaktiv");
  if (errors24 > 15) problems.push(`${errors24} Systemfehler (24h)`);
  const ok = problems.length === 0;

  const engagement = `👤 ${active7} aktiv (7T) · 💬 ${feedback24} Feedback · 📲 ${pushSent24} Push (24h)`;
  const text = ok
    ? [
        "✅ Helmut läuft.",
        `Crawl: ${fmtAge(crawlH)} (${checked} Quellen, ${failed} Fehler)`,
        `Briefing: ${fmtAge(briefingH)} (${briefingItems} Einträge) · Lage: ${fmtAge(lageH)}`,
        `Pipeline: ${fmtAge(pipelineH)} · Fehler (24h): ${errors24}`,
        engagement
      ].join("\n")
    : [
        "⚠️ Helmut: Achtung.",
        ...problems.map((p) => "• " + p),
        `Crawl ${fmtAge(crawlH)} · Briefing ${fmtAge(briefingH)} (${briefingItems}) · Lage ${fmtAge(lageH)} · Pipeline ${fmtAge(pipelineH)}`,
        engagement
      ].join("\n");

  return { ok, text, active7, feedback24, errors24, briefingItems, pushSent24, pipelineH };
}

// WhatsApp-Versand via CallMeBot (kostenloser Self-Notify-Dienst). Zugangsdaten
// kommen ausschliesslich aus Env-Variablen (CALLMEBOT_PHONE, CALLMEBOT_APIKEY).
async function sendCallMeBotMessage(text) {
  const phone = String(process.env.CALLMEBOT_PHONE || "").replace(/[^\d]/g, "");
  const apikey = String(process.env.CALLMEBOT_APIKEY || "").trim();
  if (!phone || !apikey) return { sent: false, reason: "CALLMEBOT_PHONE/CALLMEBOT_APIKEY nicht gesetzt." };
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

async function getRadarArchive(profile, days = 92) {
  const boundedDays = Math.max(1, Math.min(365, Number.isFinite(days) ? days : 365));
  const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000);
  const items = await getRawItemsSince(since);
  const terms = profileArchiveTerms(profile);
  const articles = items
    .filter((item) => rawItemMentionsProfile(item, terms) || rawItemAuthoredByProfile(item, terms))
    .map((item) => normalizeRadarArchiveItem(item))
    .filter((item) => isDirectArticleUrl(item.url, item))
    .filter(uniqueByRadarUrl)
    .sort((a, b) => new Date(b.retrievedAt || b.publishedAt || 0) - new Date(a.retrievedAt || a.publishedAt || 0))
    .slice(0, 60);

  return {
    politicianId: profile.id,
    days: boundedDays,
    total: articles.length,
    generatedAt: new Date().toISOString(),
    articles
  };
}

function normalizeRadarArchiveItem(item) {
  const url = [item.url, item.itemUrl].find((candidate) => isDirectArticleUrl(candidate, item)) || "";
  return {
    id: item.id || item.hash || url || item.title,
    sourceId: item.sourceId || "",
    sourceName: item.sourceName || item.name || "Quelle",
    sourceType: item.sourceType || item.type || "media",
    sourceUrl: item.sourceUrl || "",
    url,
    itemUrl: url,
    linkType: "direct",
    title: item.title || "Artikel gefunden",
    content: item.content || item.excerpt || "",
    excerpt: item.excerpt || item.content || "",
    publishedAt: item.publishedAt || item.retrievedAt || new Date().toISOString(),
    retrievedAt: item.retrievedAt || item.publishedAt || new Date().toISOString(),
    author: item.author || "",
    imageUrl: item.imageUrl || "",
    confidence: item.confidence || "medium",
    linkResolutionNote: "Direkter Artikellink aus dem gespeicherten Quellenarchiv."
  };
}

function uniqueByRadarUrl(item, index, items) {
  const key = item.url || item.title || item.id;
  return items.findIndex((entry) => (entry.url || entry.title || entry.id) === key) === index;
}

function profileArchiveTerms(profile) {
  // Kein Cem-Fallback: ein Mandat ohne Namen darf NICHT auf fremde Namen matchen.
  const fullName = String(profile?.fullName || "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    fullName,
    lastName: parts.at(-1) || ""
  };
}

function rawItemMentionsProfile(item, terms) {
  if (!terms.fullName && !terms.lastName) return false;
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.excerpt || ""}`.toLowerCase();
  return (terms.fullName && text.includes(terms.fullName.toLowerCase()))
    || (terms.lastName && profileNameBoundaryRegex(terms.lastName).test(text));
}

function rawItemAuthoredByProfile(item, terms) {
  if (!terms.fullName && !terms.lastName) return false;
  const author = String(item?.author || "").toLowerCase();
  if (!author) return false;
  return (terms.fullName && author.includes(terms.fullName.toLowerCase()))
    || (terms.lastName && profileNameBoundaryRegex(terms.lastName).test(author));
}

function profileNameBoundaryRegex(value) {
  return new RegExp(`(^|[^a-zäöüß])${escapeRegex(String(value || "").toLowerCase())}($|[^a-zäöüß])`, "i");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  return token === secret;
}

function allowQuerySecrets() {
  return String(process.env.HELMUT_ALLOW_QUERY_SECRETS || "").trim().toLowerCase() === "true";
}

function csrfSecret() {
  return process.env.PILOT_SECRET || process.env.CRON_SECRET || process.env.HELMUT_ADMIN_SECRET || "helmut-local-csrf";
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

function isForcedPilotRun(url) {
  return url.searchParams.get("force") === "1";
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

function clientKey(request) {
  return String(
    request.headers["x-forwarded-for"] ||
    request.headers["x-real-ip"] ||
    request.headers["cf-connecting-ip"] ||
    "local"
  ).split(",")[0].trim();
}

function sendTooManyRequests(response, message) {
  response.writeHead(429, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
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
    // oder "falsches Passwort" (kein User-Enumeration).
    if (!user || user.active === false || !accounts.verifyPassword(password, user)) {
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
  ids.add(cemInceProfile.id);
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
  if (user.role === "abgeordneter") return user.politicianId || cemInceProfile.id;
  if (Array.isArray(allowed) && allowed.length) return allowed[0];
  const users = await accounts.listUsers();
  const firstMandate = users.find((entry) => entry.role === "abgeordneter" && entry.politicianId);
  return firstMandate ? firstMandate.politicianId : cemInceProfile.id;
}

async function buildAdminOverview() {
  const [users, profiles, mandates, assignments, errors, audit, feedback] = await Promise.all([
    accounts.listUsers(),
    listProfiles(),
    listFullProfiles(),
    accounts.listAssignments(),
    accounts.listSystemErrors(50),
    accounts.listAuditEvents(50),
    listFeedback(80)
  ]);
  const storage = getStorageStatus();
  const storeSummary = await getStoreSummary();
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
      activeLast7d: users.filter((user) => {
        const seen = user.lastSeenAt || user.lastLoginAt;
        return seen && (Date.now() - new Date(seen).getTime()) < 7 * 24 * 60 * 60 * 1000;
      }).length
    },
    users,
    profiles,
    mandates: mandates.map(adminMandateSummary),
    assignments,
    feedback,
    system: {
      storage,
      store: storeSummary,
      ai: {
        enabled: isAiEnabled(),
        model: process.env.HELMUT_TEXT_MODEL || process.env.OPENAI_MODEL || "gpt-5.5"
      },
      push: pushStatus(),
      authMode: auth.authMode()
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

async function normalizeTask(task, politicianId = cemInceProfile.id) {
  const profile = await activeProfile(politicianId);
  return {
    id: task.id || `task-${Date.now()}`,
    politicianId: task.politicianId || profile.id,
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
    politicianId: interaction.politicianId || profile.id,
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
  if (politicianId === cemInceProfile.id) return cemInceProfile;
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

// Demo-Profil cem-ince erbt seine reichhaltigen Defaults; jedes andere Mandat
// erhaelt die neutralen blankProfile-Defaults.
function baseProfileFor(id) {
  return id === cemInceProfile.id ? cemInceProfile : blankProfile(id);
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
  return next;
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

function isAuthorizedCron(request, url) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : allowQuerySecrets()
      ? url.searchParams.get("secret")
      : "";
  return token === secret;
}

function sendUnauthorized(response) {
  response.writeHead(401, jsonHeaders());
  response.end(JSON.stringify({ error: "Unauthorized" }, null, 2));
}

function sendNotFound(response) {
  response.writeHead(404, jsonHeaders());
  response.end(JSON.stringify({ error: "Not found" }, null, 2));
}

function loadLocalEnv() {
  const rootDir = __dirname;
  [".env.local", ".env", "env.local", "env.local.html"].forEach((fileName) => {
    const filePath = path.join(rootDir, fileName);
    if (!fs.existsSync(filePath)) return;
    const lines = normalizeEnvText(fs.readFileSync(filePath, "utf8")).split(/\r?\n/);
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
