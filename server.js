const http = require("http");
const fs = require("fs");
const path = require("path");

loadLocalEnv();

const { cemInceProfile, demoRawItems, demoSources, generateBriefing } = require("./lib/helmut/runtime");
const { getLatestOrDemoBriefing, runDailyPipeline, runMorningBriefing, runSourceCrawl } = require("./lib/helmut/scheduler");
const { personalizeBriefing } = require("./lib/helmut/personalization");
const { buildLearningProfile } = require("./lib/helmut/learning");
const { getInteractions, getLatestBriefing, getLatestCrawlRun, getLatestPipelineDebugReport, getProfile, getStorageStatus, getStoreSummary, getTasks, getTopicMemory, getUserNotes, saveInteraction, saveProfile, saveTask, saveUserNote, updateTaskStatus } = require("./lib/helmut/storage");
const { generateCommunicationDraft, isAiEnabled } = require("./lib/helmut/ai");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
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

function handleRequest(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
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

  if (!hasPilotAccess(request, url)) {
    if (wantsHtml(request, url)) return sendPilotUnlockPage(response, url);
    return sendPilotUnauthorized(response);
  }

  const politicianId = politicianIdFromUrl(url);

  if (url.pathname === "/api/profile/demo") {
    if (request.method === "GET") return handleAsync(response, () => activeProfile(politicianId));
    if (request.method === "POST" || request.method === "PATCH") {
      return handleJson(request, response, async (body) => saveProfile(await normalizeProfile(body, politicianId)));
    }
  }

  if (url.pathname === "/api/briefing/demo") {
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      const demo = generateBriefing(profile, demoRawItems, demoSources);
      return personalizeBriefing(demo, profile, await getTopicMemory(profile.id), await getInteractions(profile.id));
    });
  }

  if (url.pathname === "/api/briefing/latest") {
    return handleAsync(response, async () => {
      const profile = await activeProfile(politicianId);
      const latest = await getLatestOrDemoBriefing(politicianId);
      if (!latest.homeSections || !latest.personalizedRecommendations) {
        const personalized = personalizeBriefing(latest, profile, await getTopicMemory(profile.id), await getInteractions(profile.id));
        return decorateBriefingFreshness(personalized);
      }
      if (!shouldRefreshLatestBriefing(latest, url)) return decorateBriefingFreshness(latest);
      try {
        const pipeline = await runDailyPipeline(politicianId);
        return decorateBriefingFreshness({
          ...pipeline.briefing,
          refreshedOnRead: true
        });
      } catch (error) {
        console.error("Refresh on read failed", error);
        return decorateBriefingFreshness({
          ...latest,
          refreshError: error.message
        });
      }
    });
  }

  if (url.pathname === "/api/briefing/run") {
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

  if (url.pathname === "/api/ai/status") {
    return sendJson(response, {
      enabled: isAiEnabled(),
      model: process.env.OPENAI_MODEL || "gpt-4.1"
    });
  }

  if (url.pathname === "/api/storage/status") {
    return sendJson(response, getStorageStatus());
  }

  if (url.pathname === "/api/ops/status") {
    return handleAsync(response, async () => {
      const latestCrawl = await getLatestCrawlRun();
      const latestBriefing = await getLatestBriefing(politicianId);
      const latestDebug = await getLatestPipelineDebugReport(politicianId);
      const storage = getStorageStatus();
      const storeSummary = await getStoreSummary(politicianId);
      const evidenceQuality = sourceEvidenceQuality(latestBriefing);
      const learning = buildLearningProfile(await getInteractions(politicianId));
      const readiness = pilotReadiness(latestCrawl, latestBriefing, storage, evidenceQuality);
      const backend = backendHealth(latestCrawl, latestBriefing, latestDebug, storage, storeSummary, evidenceQuality, latestBriefing?.referentEngine, learning);
      return {
        status: operationalStatus(latestCrawl, latestBriefing, storage),
        backend,
        readiness,
        learning,
        evidenceQuality,
        storage,
        store: storeSummary,
        tenant: tenantStatus(politicianId),
        ai: {
          enabled: isAiEnabled(),
          model: process.env.OPENAI_MODEL || "gpt-4.1"
        },
        crawl: latestCrawl || null,
        briefing: latestBriefing ? {
          id: latestBriefing.id,
          status: latestBriefing.status,
          generatedAt: latestBriefing.generatedAt || latestBriefing.date,
          itemCount: Array.isArray(latestBriefing.items) ? latestBriefing.items.length : 0,
          recommendationCount: Array.isArray(latestBriefing.personalizedRecommendations) ? latestBriefing.personalizedRecommendations.length : 0,
          quality: latestBriefing.quality || null,
          referentEngine: latestBriefing.referentEngine || null
        } : null,
        cron: {
          timezone: "Europe/Berlin",
          crawlTimes: ["06:00", "12:00", "18:00", "22:00"],
          briefingTimes: ["07:00"],
          note: "Vercel Cron ruft die Routen automatisch auf; die Zeiten sind als Berliner Zielzeiten gedacht."
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

  if (url.pathname === "/api/communication/generate" && request.method === "POST") {
    if (!allowRate(request, "communication", 18, 60 * 60 * 1000)) return sendTooManyRequests(response, "Zu viele Kommunikationsentwürfe in kurzer Zeit.");
    return handleJson(request, response, async (body) => generateCommunicationDraft({
      prompt: String(body.prompt || "").slice(0, 1200),
      channel: body.channel,
      decision: body.decision,
      profile: await activeProfile(politicianId)
    }));
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
    return handleAsync(response, () => runMorningBriefing(politicianId));
  }

  if (url.pathname === "/api/cron/pipeline") {
    if (!isAuthorizedCron(request, url)) return sendUnauthorized(response);
    return handleAsync(response, () => runDailyPipeline(politicianId));
  }

  if (url.pathname === "/api/tasks/demo") {
    return handleAsync(response, async () => generateBriefing(await activeProfile(politicianId), demoRawItems, demoSources).tasks);
  }

  if (url.pathname === "/api/tasks") {
    if (request.method === "GET") return handleAsync(response, async () => getTasks((await activeProfile(politicianId)).id));
    if (request.method === "POST") return handleJson(request, response, async (body) => saveTask(await normalizeTask(body, politicianId)));
  }

  if (url.pathname.startsWith("/api/tasks/") && request.method === "PATCH") {
    const taskId = decodeURIComponent(url.pathname.replace("/api/tasks/", ""));
    return handleJson(request, response, async (body) => {
      const task = await updateTaskStatus(taskId, body.status);
      if (!task) {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Task not found" }, null, 2));
        return null;
      }
      return task;
    });
  }

  if (url.pathname === "/api/interactions" && request.method === "POST") {
    return handleJson(request, response, async (body) => saveInteraction(await normalizeInteraction(body, politicianId)));
  }

  if (url.pathname === "/api/notes") {
    if (request.method === "GET") return handleAsync(response, async () => getUserNotes((await activeProfile(politicianId)).id));
    if (request.method === "POST") return handleJson(request, response, async (body) => saveUserNote(await normalizeUserNote(body, politicianId)));
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
        response.writeHead(200, { "Content-Type": contentTypes[".html"], "Cache-Control": "no-store" });
        response.end(indexHtml());
        return;
      }
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    const headers = { "Content-Type": contentTypes[extension] || "application/octet-stream" };
    if ([".html", ".js", ".css"].includes(extension)) {
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
  if (url.searchParams.get("pilot") === pilotSecret) return true;

  const auth = parseAuthorization(request.headers.authorization || "");
  if (auth.bearer && auth.bearer === pilotSecret) return true;
  if (auth.basic && auth.basic.password === pilotSecret) return true;

  return readCookie(request, "helmut_pilot") === pilotSecret;
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
  response.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify({ error: "Pilot access required" }, null, 2));
}

function sendPilotUnlockPage(response, url) {
  const safePath = safeReturnPath(url);
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#111827" />
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

function indexHtml() {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#111827" />
    <meta name="apple-mobile-web-app-title" content="Helmut" />
    <meta name="application-name" content="Helmut" />
    <title>Helmut</title>
    <link rel="icon" href="assets/favicon.ico" sizes="any" />
    <link rel="icon" href="assets/helmut_logo.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="assets/helmut_appicon_192.png" />
    <link rel="manifest" href="site.webmanifest" />
    <link rel="stylesheet" href="styles.css?v=20260621-splash2" />
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
    <script src="client.js?v=20260621-splash2"></script>
  </body>
</html>`;
}

function safeReturnPath(url) {
  const path = `${url.pathname || "/"}${url.search || ""}`;
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path.replace(/[<>]/g, "");
}
module.exports = handleRequest;

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`Helmut demo running at http://localhost:${port}`);
  });
}


function sendJson(response, payload) {
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
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

function operationalStatus(crawl, briefing, storage) {
  const crawlAge = crawl?.createdAt ? Date.now() - new Date(crawl.createdAt).getTime() : Infinity;
  const briefingDate = briefing?.generatedAt || briefing?.date;
  const briefingAge = briefingDate ? Date.now() - new Date(briefingDate).getTime() : Infinity;
  const checkedSources = Number(crawl?.checkedSources || 0);
  const failedSources = Number(crawl?.failedSources || 0);
  const successfulSources = Number(crawl?.successfulSources || 0);
  const crawlFailureRatio = checkedSources ? failedSources / checkedSources : 1;
  const crawlHealthy = crawl && crawlAge < 8 * 60 * 60 * 1000 && checkedSources >= 50 && successfulSources >= 40 && crawlFailureRatio <= 0.1;
  const briefingHealthy = briefing && briefingAge < 18 * 60 * 60 * 1000;
  if (storage.backend !== "supabase") return "Achtung";
  if (crawlHealthy && briefingHealthy) return "Bereit";
  if (crawl || briefing) return "Prüfen";
  return "Nicht eingerichtet";
}

function backendHealth(crawl, briefing, debugReport, storage, storeSummary, evidenceQuality, referentEngine = null, learning = null) {
  const checks = [];
  addBackendCheck(checks, "Persistenter Speicher", storage.backend === "supabase", storage.backend === "supabase" ? "Supabase ist aktiv." : "Helmut speichert noch lokal.");
  addBackendCheck(checks, "Quellenbasis", Number(storeSummary.sources?.active || 0) >= 50, `${storeSummary.sources?.active || 0} aktive Quellen konfiguriert.`);
  addBackendCheck(checks, "Raw Items", Number(storeSummary.rawItems?.total || 0) > 0, `${storeSummary.rawItems?.total || 0} Artikel gespeichert, ${storeSummary.rawItems?.last24h || 0} in den letzten 24 Stunden.`);

  const crawlAge = crawl?.createdAt ? Date.now() - new Date(crawl.createdAt).getTime() : Infinity;
  const checkedSources = Number(crawl?.checkedSources || 0);
  const failedSources = Number(crawl?.failedSources || 0);
  const crawlFailureRatio = checkedSources ? failedSources / checkedSources : 1;
  addBackendCheck(checks, "Crawl-Frische", Boolean(crawl) && crawlAge < 8 * 60 * 60 * 1000, crawl?.createdAt ? `Letzter Crawl: ${crawl.createdAt}.` : "Noch kein Crawl gespeichert.");
  addBackendCheck(checks, "Crawl-Qualität", checkedSources >= 50 && crawlFailureRatio <= 0.1, `${checkedSources} Quellen geprüft, ${failedSources} Fehler.`);

  const briefingDate = briefing?.generatedAt || briefing?.date;
  const briefingAge = briefingDate ? Date.now() - new Date(briefingDate).getTime() : Infinity;
  const recommendationCount = Number(briefing?.personalizedRecommendations?.length || 0);
  const itemCount = Number(briefing?.items?.length || 0);
  addBackendCheck(checks, "Briefing-Frische", Boolean(briefing) && briefingAge < 18 * 60 * 60 * 1000, briefingDate ? `Letztes Briefing: ${briefingDate}.` : "Noch kein Briefing gespeichert.");
  addBackendCheck(checks, "Demo-Freiheit", Boolean(briefing) && briefing.status !== "Demo", briefing?.status ? `Status: ${briefing.status}.` : "Kein Briefingstatus vorhanden.");
  addBackendCheck(checks, "Entscheidungswert", recommendationCount > 0 && itemCount > 0, `${recommendationCount} persönliche Empfehlungen, ${itemCount} sichtbare Entscheidungen.`);
  addBackendCheck(checks, "Quellenlinks", Number(evidenceQuality?.missingLinks || 0) === 0 && Number(evidenceQuality?.publisherFallbacks || 0) === 0, `${evidenceQuality?.directLinks || 0}/${evidenceQuality?.total || 0} Belege mit Direktlink.`);
  addBackendCheck(checks, "Referentenmodus", Number(referentEngine?.score || 0) >= 85, referentEngine ? `${referentEngine.status}: ${referentEngine.score}% Referentenqualität.` : "Noch kein Referenten-Audit vorhanden.");
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
    "crawl-frische": "Crawl-Route oder Vercel Cron prüfen.",
    "crawl-qualität": "Fehlgeschlagene Quellen im Pipeline-Debug ansehen.",
    "briefing-frische": "Morgenbriefing manuell starten oder Cron prüfen.",
    "demo-freiheit": "Live-Pipeline ausführen und Demo-Fallback ausblenden.",
    "entscheidungswert": "Relevanzfilter und aktuelle Quellenlage prüfen.",
    "quellenlinks": "URL-Resolver und Source Evidence prüfen.",
    "referentenmodus": "Briefing neu erzeugen und Empfehlungen auf direkte Ansprache, Handlung, Konsequenz und Quellenlink prüfen.",
    "lernmodus": "Cem sollte im Pilot Themen öffnen, markieren, ausblenden oder Kommunikation kopieren, damit Helmut Präferenzen lernt.",
    "pipeline-debug": "Pipeline einmal vollständig ausführen, damit ein Debug-Bericht gespeichert wird."
  };
  return actions[checkId] || "Backend-Check prüfen.";
}

function pilotReadiness(crawl, briefing, storage, evidenceQuality = null) {
  const issues = [];
  const warnings = [];
  const crawlAge = crawl?.createdAt ? Date.now() - new Date(crawl.createdAt).getTime() : Infinity;
  const briefingDate = briefing?.generatedAt || briefing?.date;
  const briefingAge = briefingDate ? Date.now() - new Date(briefingDate).getTime() : Infinity;
  const checkedSources = Number(crawl?.checkedSources || 0);
  const failedSources = Number(crawl?.failedSources || 0);
  const successfulSources = Number(crawl?.successfulSources || 0);
  const recommendationCount = Array.isArray(briefing?.personalizedRecommendations) ? briefing.personalizedRecommendations.length : 0;
  const quality = briefing?.quality || null;
  const qualityScore = Number(quality?.score || 0);

  if (storage.backend !== "supabase") issues.push("Supabase ist nicht aktiv.");
  if (!isAiEnabled()) warnings.push("OpenAI ist nicht aktiv. Helmut läuft dann weniger persönlich.");
  if (!crawl) {
    issues.push("Es gibt noch keinen Quellenlauf.");
  } else {
    if (crawlAge > 8 * 60 * 60 * 1000) issues.push("Der letzte Quellenlauf ist älter als 8 Stunden.");
    if (checkedSources < 50) issues.push("Es werden zu wenige Quellen geprüft.");
    if (checkedSources && failedSources / checkedSources > 0.1) issues.push("Mehr als 10 Prozent der Quellen sind fehlgeschlagen.");
    if (successfulSources < 40) warnings.push("Die erfolgreiche Quellenbasis ist noch dünn.");
  }
  if (!briefing) {
    issues.push("Es gibt noch kein Briefing.");
  } else {
    if (briefingAge > 18 * 60 * 60 * 1000) issues.push("Das letzte Briefing ist veraltet.");
    if (recommendationCount < 1) issues.push("Das Briefing enthält keine persönliche Empfehlung.");
    if (!quality) warnings.push("Die Briefingqualität wurde noch nicht geprüft.");
    if (quality && qualityScore < 90) issues.push("Die Briefingqualität ist noch nicht pitchbereit.");
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

function readinessScore(issues, warnings) {
  return Math.max(0, Math.min(100, 100 - issues.length * 25 - warnings.length * 8));
}

function sourceEvidenceQuality(briefing) {
  const sources = collectBriefingSources(briefing);
  const unique = new Map();
  sources.forEach((source) => {
    const key = [source.sourceName, source.itemUrl || source.url, source.sourceUrl].filter(Boolean).join("|");
    if (key) unique.set(key, source);
  });
  const entries = Array.from(unique.values());
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
    directLinks,
    publisherFallbacks,
    missingLinks,
    directRatio: entries.length ? Math.round((directLinks / entries.length) * 100) : 0,
    status: missingLinks || publisherFallbacks ? "Präzise Links fehlen" : "Belastbar",
    weakSamples
  };
}

function collectBriefingSources(briefing) {
  if (!briefing) return [];
  return [
    ...(briefing.items || []).flatMap((item) => item.sources || [item.primarySource].filter(Boolean)),
    ...(briefing.personalizedRecommendations || []).flatMap((item) => item.sources || [item.primarySource].filter(Boolean)),
    ...(briefing.personMentions || [])
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
  const token = header.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("secret");
  return token === secret;
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

function handleAsync(response, handler) {
  Promise.resolve()
    .then(handler)
    .then((payload) => sendJson(response, payload))
    .catch((error) => {
      console.error(error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }, null, 2));
    });
}

function handleJson(request, response, handler) {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) request.destroy(new Error("Request body too large"));
  });
  request.on("end", () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      Promise.resolve(handler(payload))
        .then((result) => {
          if (result !== null) sendJson(response, result);
        })
        .catch((error) => {
          console.error(error);
          response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: error.message }, null, 2));
        });
    } catch (error) {
      console.error(error);
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }, null, 2));
    }
  });
  request.on("error", (error) => {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }, null, 2));
  });
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
  return {
    ...cemInceProfile,
    id: politicianId,
    fullName: readableNameFromId(politicianId),
    party: "",
    faction: "",
    committee: "",
    committees: [],
    focusTopics: [],
    topicPriorities: {},
    monitoringTargets: [],
    regionalInterests: [],
    relevantMinistries: ["Bundesregierung"],
    noGoTopics: [],
    politicalLevel: "Bund",
    role: "Bundestagsabgeordneter",
    reportingTopics: [],
    currentCampaigns: [],
    publicPositions: [],
    keyAudiences: [],
    riskTopics: [],
    opportunityTopics: [],
    preferredChannels: [],
    upcomingAppointments: []
  };
}

function mergeProfileDefaults(profile) {
  return {
    ...cemInceProfile,
    ...profile,
    function: profile.function || cemInceProfile.function,
    location: profile.location || cemInceProfile.location,
    committees: arrayValue(profile.committees, cemInceProfile.committees),
    focusTopics: arrayValue(profile.focusTopics, cemInceProfile.focusTopics),
    topicPriorities: topicPriorityValue(profile.topicPriorities, cemInceProfile.topicPriorities),
    regionalInterests: arrayValue(profile.regionalInterests, cemInceProfile.regionalInterests),
    relevantMinistries: arrayValue(profile.relevantMinistries, cemInceProfile.relevantMinistries),
    monitoringTargets: arrayValue(profile.monitoringTargets, cemInceProfile.monitoringTargets),
    outputNeeds: arrayValue(profile.outputNeeds, cemInceProfile.outputNeeds),
    opponents: arrayValue(profile.opponents, cemInceProfile.opponents),
    localMedia: arrayValue(profile.localMedia, cemInceProfile.localMedia),
    noGoTopics: arrayValue(profile.noGoTopics, cemInceProfile.noGoTopics),
    politicalLevel: profile.politicalLevel || cemInceProfile.politicalLevel,
    role: profile.role || profile.function || cemInceProfile.role,
    reportingTopics: arrayValue(profile.reportingTopics, cemInceProfile.reportingTopics),
    currentCampaigns: arrayValue(profile.currentCampaigns, cemInceProfile.currentCampaigns),
    publicPositions: arrayValue(profile.publicPositions, cemInceProfile.publicPositions),
    keyAudiences: arrayValue(profile.keyAudiences, cemInceProfile.keyAudiences),
    riskTopics: arrayValue(profile.riskTopics, cemInceProfile.riskTopics),
    opportunityTopics: arrayValue(profile.opportunityTopics, cemInceProfile.opportunityTopics),
    preferredChannels: arrayValue(profile.preferredChannels, cemInceProfile.preferredChannels),
    upcomingAppointments: arrayValue(profile.upcomingAppointments, cemInceProfile.upcomingAppointments)
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
  next.upcomingAppointments = arrayValue(profile.upcomingAppointments, base.upcomingAppointments);
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
  return text || fallback;
}

function arrayValue(value, fallback) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
  return fallback || [];
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
  return Object.keys(priorities).length ? priorities : fallback || {};
}

function isAuthorizedCron(request, url) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("secret");
  return token === secret;
}

function sendUnauthorized(response) {
  response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Unauthorized" }, null, 2));
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
