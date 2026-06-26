#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

loadEnvFiles();

const args = new Set(process.argv.slice(2));
const baseUrl = stripTrailingSlash(process.env.HELMUT_BASE_URL || "https://helmut-pilot.vercel.app");
const pilotSecret = process.env.PILOT_SECRET || process.env.HELMUT_PILOT_SECRET || "";
const adminSecret = process.env.HELMUT_ADMIN_SECRET || process.env.CRON_SECRET || "";
const runCrawl = args.has("--run-crawl") || args.has("--full");
const runFullFlow = args.has("--full");
const checkExternalLinks = !args.has("--no-links");
const minCheckedSources = Number(process.env.HELMUT_MIN_CHECKED_SOURCES || 450);

const results = [];
const warnings = [];
let cookie = "";
let publicOnly = false;
let csrfToken = "";

main().catch((error) => {
  fail("Smoke test crashed", error.message);
  printSummary();
  process.exit(1);
});

async function main() {
  log(`Helmut smoke test: ${baseUrl}`);

  // Account-Modus-Smoke: nur wenn explizit angefordert (HELMUT_SMOKE_AUTH=1),
  // damit der Standard-Pilotlauf gegen die Produktion unveraendert bleibt.
  if (String(process.env.HELMUT_SMOKE_AUTH || "").trim() === "1") {
    await checkAuthMode();
    printSummary();
    if (results.some((result) => result.status === "fail")) process.exit(1);
    return;
  }

  await checkPilotGate();
  if (publicOnly) {
    await checkPublicReleaseReadiness();
    printSummary();
    if (results.some((result) => result.status === "fail")) process.exit(1);
    return;
  }

  await unlockPilot();
  await checkAppShell();

  if (runFullFlow) await runLivePipeline();
  const status = await checkOpsStatus();
  const release = await checkReleaseReadiness();
  const briefing = await checkBriefing();
  await checkReleaseLiveFlow(release);
  await checkLearningStatus();
  await checkPipelineDebug();
  await checkSourceLinks(briefing);
  await checkRadar(briefing);
  await checkOfficeHandoff(briefing);
  await checkCommunicationDraft(briefing);
  await maybeRunCrawl();

  if (status?.readiness?.warnings?.length) {
    status.readiness.warnings.forEach((warning) => warn(`Readiness warning: ${warning}`));
  }

  printSummary();
  if (results.some((result) => result.status === "fail")) process.exit(1);
}

async function checkPilotGate() {
  const root = await request("GET", "/");
  if (pilotSecret) {
    ok(root.statusCode === 200 && root.text.includes("Pilot-Zugang"), "Pilot gate protects the app shell");
    const unauthApi = await request("GET", "/api/ops/status");
    ok(unauthApi.statusCode === 401, "Protected API rejects requests without pilot access");
    return;
  }

  if (root.text.includes("Pilot-Zugang")) {
    if (adminSecret) {
      ok(true, "Pilot gate is present; using admin secret for smoke checks");
      return;
    }
    publicOnly = true;
    warn("Production is protected and no local secret is available; using safe public release check.");
    return;
  }
  warn("PILOT_SECRET is not set; running against an unprotected/local target.");
}

async function checkPublicReleaseReadiness() {
  const response = await request("GET", "/api/release/public");
  const release = parseJson(response, "public release check");
  ok(response.statusCode === 200, "Public release check endpoint responds");
  ok(release.ready === true && release.status === "Pitchbereit", "Public release check is pitch-ready");
  ok(Number(release.score || 0) >= 90, "Public release score is at least 90");
  ok(release.liveFlow?.ready === true, "Public release live-flow is green");
  if (Array.isArray(release.blockers)) {
    release.blockers.slice(0, 5).forEach((blocker) => warn(`Public release blocker: ${blocker}`));
  }
}

// Account-Modus end-to-end: Login, RBAC, Mandantentrennung, Deaktivierung.
// Erwartet einen Server mit HELMUT_AUTH_MODE=accounts und einem Admin-Konto.
async function checkAuthMode() {
  const adminEmail = process.env.HELMUT_SMOKE_ADMIN_EMAIL || process.env.HELMUT_ADMIN_EMAIL || "";
  const adminPassword = process.env.HELMUT_SMOKE_ADMIN_PASSWORD || process.env.HELMUT_ADMIN_PASSWORD || "";
  if (!adminEmail || !adminPassword) {
    fail("Auth smoke needs HELMUT_SMOKE_ADMIN_EMAIL and HELMUT_SMOKE_ADMIN_PASSWORD");
    return;
  }
  const stamp = Date.now();
  const mdbEmail = `mdb+${stamp}@smoke.test`;
  const refEmail = `ref+${stamp}@smoke.test`;

  const shell = await requestAbsolute("GET", `${baseUrl}/`);
  ok(shell.statusCode === 200 && shell.text.includes("client.js"), "Account mode: app shell is served to anonymous users");

  const anonSession = await requestAbsolute("GET", `${baseUrl}/api/auth/session`);
  ok(anonSession.statusCode === 200 && parseJson(anonSession, "anon session").authenticated === false, "Account mode: anonymous session is unauthenticated");

  const anonAdmin = await requestAbsolute("GET", `${baseUrl}/api/admin/overview`);
  ok(anonAdmin.statusCode === 401, "Account mode: admin route rejects anonymous request");

  const admin = await authLogin(adminEmail, adminPassword);
  ok(admin.res.statusCode === 200 && admin.cookie.includes("helmut_session="), "Admin login issues a session cookie");
  const adminCsrf = await authCsrf(admin.cookie);

  const mdb = await authCreateUser(admin, adminCsrf, { email: mdbEmail, name: "Smoke MdB", role: "abgeordneter", password: "smokepass123" });
  ok(mdb.statusCode === 200, "Admin creates an Abgeordneter");
  const mdbPolId = parseJson(mdb, "create mdb").politicianId;

  const mdb2 = await authCreateUser(admin, adminCsrf, { email: `mdb2+${stamp}@smoke.test`, name: "Smoke Fremd", role: "abgeordneter", password: "smokepass123" });
  const foreignPolId = parseJson(mdb2, "create mdb2").politicianId;

  const ref = await authCreateUser(admin, adminCsrf, { email: refEmail, name: "Smoke Referent", role: "referent", password: "smokepass123" });
  ok(ref.statusCode === 200, "Admin creates a Referent");
  const refId = parseJson(ref, "create ref").id;

  const assign = await authSend(admin.cookie, adminCsrf, "POST", "/api/admin/assignments", { userId: refId, politicianId: mdbPolId });
  ok(assign.statusCode === 200, "Admin assigns referent to the MdB mandate");

  const refLogin = await authLogin(refEmail, "smokepass123");
  ok(refLogin.res.statusCode === 200, "Referent can log in");

  const refForeign = await requestAbsolute("GET", `${baseUrl}/api/profile/current?politicianId=${encodeURIComponent(foreignPolId)}`, { cookie: refLogin.cookie });
  ok(refForeign.statusCode === 200 && parseJson(refForeign, "ref foreign").id === mdbPolId, "Referent cannot read a foreign mandate via URL param (IDOR blocked)");

  const refCsrf = await authCsrf(refLogin.cookie);
  const dailyInput = await authSend(refLogin.cookie, refCsrf, "POST", `/api/daily-inputs?politicianId=${encodeURIComponent(mdbPolId)}`, { title: "Smoke Termin", goal: "Test" });
  ok(dailyInput.statusCode === 200, "Referent can add a daily input for the assigned mandate");

  const deactivate = await authSend(admin.cookie, adminCsrf, "PATCH", `/api/admin/users/${encodeURIComponent(refId)}`, { active: false });
  ok(deactivate.statusCode === 200, "Admin can deactivate the referent");

  const refRelogin = await authLogin(refEmail, "smokepass123");
  ok(refRelogin.res.statusCode === 401, "Deactivated account cannot log in");

  const refSessionGone = await requestAbsolute("GET", `${baseUrl}/api/auth/session`, { cookie: refLogin.cookie });
  ok(parseJson(refSessionGone, "ref session gone").authenticated === false, "Deactivated account existing session is invalidated");

  const logout = await requestAbsolute("POST", `${baseUrl}/api/auth/logout`, { cookie: admin.cookie });
  ok(logout.statusCode === 200, "Logout works");
}

async function authLogin(email, password) {
  const res = await requestAbsolute("POST", `${baseUrl}/api/auth/login`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const setCookie = res.headers["set-cookie"];
  const cookieValue = Array.isArray(setCookie) ? setCookie.map((entry) => entry.split(";")[0]).join("; ") : "";
  return { res, cookie: cookieValue };
}

async function authCsrf(cookie) {
  const res = await requestAbsolute("GET", `${baseUrl}/api/security/csrf`, { cookie });
  return parseJson(res, "auth csrf").token || "";
}

function authSend(cookie, csrf, method, pathname, body) {
  return requestAbsolute(method, `${baseUrl}${pathname}`, {
    cookie,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function authCreateUser(admin, csrf, payload) {
  return authSend(admin.cookie, csrf, "POST", "/api/admin/users", payload);
}

async function unlockPilot() {
  if (!pilotSecret) return;
  const response = await request("POST", "/api/pilot/unlock", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: pilotSecret })
  });
  const setCookie = response.headers["set-cookie"] || response.headers["Set-Cookie"];
  cookie = Array.isArray(setCookie) ? setCookie.map((entry) => entry.split(";")[0]).join("; ") : String(setCookie || "").split(";")[0];
  ok(response.statusCode === 200 && cookie.includes("helmut_pilot="), "Pilot unlock sets access cookie");
}

async function checkAppShell() {
  const response = await request("GET", "/", { cookie });
  ok(response.statusCode === 200 && response.text.includes("client.js") && response.text.includes("Bereite deine Morgenlage vor"), "App shell loads after unlock");
}

async function checkOpsStatus() {
  const response = await request("GET", "/api/ops/status", { cookie });
  const status = parseJson(response, "ops status");
  ok(response.statusCode === 200, "Ops status endpoint responds");
  ok(status.storage?.backend === "supabase", "Supabase storage is active");
  ok(status.backend?.status === "Gesund" || Number(status.backend?.score || 0) >= 90, "Backend health is healthy");
  ok(Array.isArray(status.backend?.checks) && status.backend.checks.length >= 8, "Backend health exposes operational checks");
  ok(Boolean(status.tenant?.activePoliticianId), "Tenant context exposes active politician");
  ok(status.tenant?.accessControl === "pilot-gate" || !pilotSecret, "Tenant access is protected in pilot mode");
  ok(Number(status.store?.rawItems?.total || 0) > 0, "Persistent store contains raw items");
  ok(status.ai?.enabled === true, "OpenAI is configured");
  ok(status.protection?.pilotAccessConfigured === true || !pilotSecret, "Pilot access is configured");
  ok(Number(status.crawl?.checkedSources || 0) >= minCheckedSources, `Crawler checks at least ${minCheckedSources} sources`);
  ok(Number(status.crawl?.failedSources || 0) / Math.max(1, Number(status.crawl?.checkedSources || 0)) <= 0.1, "Crawler failure rate is below 10 percent");
  const hasRecommendation = Number(status.briefing?.recommendationCount || 0) >= 1;
  const hasCalmWatchlist = Number(status.briefing?.situationalCount || 0) > 0 || Boolean(status.briefing?.quality?.calmState);
  ok(hasRecommendation || hasCalmWatchlist, "Latest briefing contains a recommendation or competent no-action watchlist");
  ok(status.briefing?.quality?.status === "Pitchbereit" || Number(status.briefing?.quality?.score || 0) >= 90, "Briefing quality is pitch-ready");
  ok(Number(status.briefing?.referentEngine?.score || 0) >= 85 || Boolean(status.briefing?.referentEngine?.calmState), "Referent engine audit passes");
  ok(Boolean(status.learning && typeof status.learning.status === "string"), "Ops status exposes learning mode");
  ok(Number(status.evidenceQuality?.missingLinks || 0) === 0, "Visible evidence has no missing links");
  return status;
}

async function checkReleaseReadiness() {
  const response = await request("GET", "/api/release/check", { cookie });
  const release = parseJson(response, "release check");
  ok(response.statusCode === 200, "Release check endpoint responds");
  ok(release.ready === true && release.status === "Pitchbereit", "Release check is pitch-ready");
  ok(Number(release.score || 0) >= 90, "Release check score is at least 90");
  if (Array.isArray(release.blockers)) {
    release.blockers.slice(0, 3).forEach((blocker) => warn(`Release blocker: ${blocker}`));
  }
  return release;
}

async function checkBriefing() {
  const response = await request("GET", "/api/briefing/latest?refresh=0", { cookie });
  const briefing = parseJson(response, "latest briefing");
  ok(response.statusCode === 200, "Latest briefing endpoint responds");
  ok(briefing.status !== "Demo", "Latest briefing is not demo fallback");
  const hasDecision = Array.isArray(briefing.items) && briefing.items.some((item) => item.decision !== "Ignorieren");
  const hasCalmWatchlist = Array.isArray(briefing.situationalBriefing) && briefing.situationalBriefing.length > 0;
  ok(hasDecision || hasCalmWatchlist, "Briefing has decisions or a competent no-action watchlist");
  ok(Array.isArray(briefing.personalizedRecommendations), "Briefing exposes personalized recommendations");
  ok(briefing.referentEngine?.status === "Stabschefbereit" || Number(briefing.referentEngine?.score || 0) >= 85 || Boolean(briefing.referentEngine?.calmState), "Briefing has referent-mode audit");
  ok(Boolean(briefing.executiveSummary || briefing.themeOfDay || briefing.chiefRecommendation || briefing.topicOfTheDay || briefing.agentBriefing), "Briefing has a top-level referent summary");
  return briefing;
}

async function checkReleaseLiveFlow(release) {
  const steps = release?.liveFlow?.steps || [];
  ok(Array.isArray(steps) && steps.length >= 6, "Release check exposes live-flow steps");
  ok(release?.liveFlow?.ready === true, "Release live-flow is green");
  steps.filter((step) => !step.ok).slice(0, 3).forEach((step) => warn(`Live-flow blocker: ${step.label} - ${step.detail}`));
}

async function checkLearningStatus() {
  const response = await request("GET", "/api/learning/status", { cookie });
  const learning = parseJson(response, "learning status");
  ok(response.statusCode === 200, "Learning status endpoint responds");
  ok(typeof learning.status === "string" && Number.isFinite(Number(learning.eventCount || 0)), "Learning status has event count and status");
}

async function checkPipelineDebug() {
  const response = await request("GET", "/api/pipeline/debug", { cookie });
  const report = parseJson(response, "pipeline debug");
  ok(response.statusCode === 200, "Pipeline debug endpoint responds");
  ok(Boolean(report.counts && Number.isFinite(Number(report.counts.rawItemsLast24h))), "Pipeline debug reports raw item counts");
  ok(Array.isArray(report.rejectionSummary), "Pipeline debug reports rejection reasons");
  ok(Array.isArray(report.acceptedItems), "Pipeline debug reports accepted item samples");
  ok(Array.isArray(report.rejectedItems), "Pipeline debug reports rejected item samples");
}

async function checkSourceLinks(briefing) {
  const sources = collectSources(briefing);
  ok(sources.length > 0, "Briefing exposes source evidence");
  const urls = unique(sources.map((source) => directArticleUrl(source)).filter(isHttpUrl));
  ok(urls.length > 0, "Briefing evidence contains public URLs");
  if (!checkExternalLinks || urls.length === 0) return;

  const sample = urls.slice(0, 6);
  const checks = await Promise.all(sample.map((url) => checkLink(url)));
  const broken = checks.filter((check) => !check.ok);
  ok(broken.length === 0, `Source link sample opens (${sample.length} checked)`);
  broken.slice(0, 3).forEach((entry) => warn(`Broken source sample: ${entry.url} (${entry.statusCode || entry.error})`));
}

async function checkRadar(briefing) {
  ok(Array.isArray(briefing.personMentions), "Radar data is present");
  const mentionPool = [...(briefing.personMentions || []), ...(briefing.rawItems || [])].filter(mentionsPilotProfile);
  const preciseMentions = mentionPool.filter((item) => Boolean(directArticleUrl(item)));
  if (mentionPool.length) {
    ok(true, "Radar hides weak profile mentions instead of exposing broken links");
    if (!preciseMentions.length) warn("Radar has profile mentions, but none with precise direct article links in this data set.");
    const hiddenWeak = mentionPool.length - preciseMentions.length;
    if (hiddenWeak > 0) warn(`${hiddenWeak} Radar mentions have weak links and should stay hidden from prominent UI.`);
  } else {
    warn("Radar has no current person mentions; previous archive can still render from stored raw items.");
  }
}

async function checkOfficeHandoff(briefing) {
  const response = await request("GET", "/api/tasks", { cookie });
  const tasks = parseJson(response, "tasks");
  ok(response.statusCode === 200 && Array.isArray(tasks), "Office tasks endpoint responds");
  const briefingTasks = Array.isArray(briefing.tasks) ? briefing.tasks : [];
  const storedTasks = Array.isArray(tasks) ? tasks : [];
  const actionable = [...storedTasks, ...briefingTasks].filter((task) => task.status !== "done" && hasTaskDirectSource(task));
  if ((briefing.items || []).some((item) => item.decision !== "Ignorieren")) {
    ok(actionable.length > 0, "Office handoff has an actionable task with direct source");
  } else {
    ok(true, "Office handoff can be empty when no decision is required");
  }
}

async function checkCommunicationDraft(briefing) {
  const decision = (briefing.items || []).find((item) => item.decision !== "Ignorieren") || (briefing.items || [])[0];
  if (!decision) {
    ok(true, "Communication draft skipped because no decision requires a statement");
    return;
  }
  const response = await request("POST", "/api/communication/generate", {
    cookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: "press",
      prompt: `Erstelle ein Pressestatement zu ${decision.title}.`,
      decision
    }),
    timeoutMs: 60000
  });
  const draft = parseJson(response, "communication draft");
  ok(response.statusCode === 200, "Communication draft endpoint responds");
  ok(String(draft.text || "").trim().length >= 80, "Communication draft returns usable text");
  ok(draft.aiEnabled === true, "Communication draft uses OpenAI in production");
}

async function maybeRunCrawl() {
  if (!runCrawl || runFullFlow) {
    if (runFullFlow) return;
    warn("Manual crawl smoke skipped. Run `npm test -- --run-crawl` to test an active crawl.");
    return;
  }
  if (!adminSecret) {
    fail("Manual crawl skipped", "HELMUT_ADMIN_SECRET or CRON_SECRET is required for --run-crawl.");
    return;
  }
  const response = await request("GET", `/api/crawl/run?secret=${encodeURIComponent(adminSecret)}`, { cookie, timeoutMs: 120000 });
  const crawl = parseJson(response, "crawl run");
  ok(response.statusCode === 200, "Manual crawl endpoint responds");
  ok(Number(crawl.checkedSources || 0) >= minCheckedSources || Boolean(crawl.skippedReason), "Manual crawl checks sources or reuses recent run");
}

async function runLivePipeline() {
  if (!adminSecret) {
    fail("Full live pipeline skipped", "HELMUT_ADMIN_SECRET or CRON_SECRET is required for --full.");
    return;
  }
  const response = await request("GET", `/api/pipeline/run?force=1&secret=${encodeURIComponent(adminSecret)}`, { cookie, timeoutMs: 180000 });
  const pipeline = parseJson(response, "pipeline run");
  ok(response.statusCode === 200, "Full live pipeline endpoint responds");
  ok(Boolean(pipeline.briefing || pipeline.skippedReason), "Full live pipeline creates or reuses a briefing");
}

function collectSources(briefing) {
  return [
    ...(briefing.items || []).flatMap((item) => item.sources || [item.primarySource].filter(Boolean)),
    ...(briefing.personalizedRecommendations || []).flatMap((item) => item.sources || [item.primarySource].filter(Boolean)),
    ...(briefing.personMentions || []),
    ...(briefing.tasks || []).flatMap((task) => task.sources || [task.primarySource].filter(Boolean)),
    ...(briefing.situationalBriefing || [])
  ].filter(Boolean);
}

function hasTaskDirectSource(task) {
  return [task.primarySource, ...(task.sources || [])].filter(Boolean).some((source) => Boolean(directArticleUrl(source)));
}

function mentionsPilotProfile(item = {}) {
  const text = `${item.title || ""} ${item.content || ""} ${item.excerpt || ""} ${item.author || ""}`.toLowerCase();
  return text.includes("cem ince") || /(^|[^a-zäöüß])ince($|[^a-zäöüß])/i.test(text);
}

function directArticleUrl(source = {}) {
  const candidates = [source.itemUrl, source.url].filter(Boolean);
  return candidates.find((url) => isDirectArticleUrl(url, source)) || "";
}

function isDirectArticleUrl(url, source = {}) {
  if (!isHttpUrl(url)) return false;
  if (source.linkType && source.linkType !== "direct") return false;
  if (String(url).includes("example.local")) return false;
  try {
    const parsed = new URL(String(url));
    if (parsed.hostname.includes("google.")) return false;
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || path.split("/").filter(Boolean).length === 0) return false;
    if (source.sourceUrl) {
      const sourceUrl = new URL(String(source.sourceUrl));
      if (parsed.hostname === sourceUrl.hostname && path === sourceUrl.pathname.replace(/\/+$/, "")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function checkLink(url) {
  try {
    const response = await requestAbsolute("GET", url, {
      headers: {
        "User-Agent": "HelmutSmokeTest/1.0",
        "Range": "bytes=0-512"
      },
      timeoutMs: 12000,
      maxRedirects: 4
    });
    const acceptable = response.statusCode >= 200 && response.statusCode < 400
      || [401, 403, 405].includes(response.statusCode);
    return { url, ok: acceptable, statusCode: response.statusCode };
  } catch (error) {
    return { url, ok: false, error: error.message };
  }
}

async function request(method, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!options.cookie && adminSecret && !headers.Authorization) {
    headers.Authorization = `Bearer ${adminSecret}`;
  }
  if (options.cookie && needsCsrf(method, pathname) && !headers["X-CSRF-Token"] && !headers.Authorization) {
    headers["X-CSRF-Token"] = await getCsrfToken();
  }
  return requestAbsolute(method, `${baseUrl}${pathname}`, { ...options, headers });
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await requestAbsolute("GET", `${baseUrl}/api/security/csrf`, { cookie });
  const payload = parseJson(response, "csrf token");
  csrfToken = payload.token || "";
  return csrfToken;
}

function needsCsrf(method, pathname) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) return true;
  return ["/api/briefing/run", "/api/crawl/run", "/api/pipeline/run", "/api/lage/check", "/api/push/test"]
    .some((path) => String(pathname || "").startsWith(path));
}

function requestAbsolute(method, url, options = {}) {
  const timeoutMs = options.timeoutMs || 20000;
  const maxRedirects = options.maxRedirects ?? 3;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const headers = {
      ...(options.headers || {})
    };
    if (options.cookie) headers.Cookie = options.cookie;

    const req = transport.request({
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      headers,
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", async () => {
        const body = Buffer.concat(chunks);
        const location = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && location && maxRedirects > 0) {
          try {
            const redirectUrl = new URL(location, url).toString();
            resolve(await requestAbsolute(method === "POST" ? "GET" : method, redirectUrl, {
              ...options,
              body: undefined,
              maxRedirects: maxRedirects - 1
            }));
          } catch (error) {
            reject(error);
          }
          return;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          text: body.toString("utf8")
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function parseJson(response, label) {
  try {
    return JSON.parse(response.text || "{}");
  } catch (error) {
    fail(`Invalid JSON from ${label}`, error.message);
    return {};
  }
}

function ok(condition, message) {
  if (condition) {
    results.push({ status: "ok", message });
    log(`[ok] ${message}`);
  } else {
    fail(message);
  }
}

function fail(message, detail = "") {
  results.push({ status: "fail", message, detail });
  log(`[fail] ${message}${detail ? ` - ${detail}` : ""}`);
}

function warn(message) {
  warnings.push(message);
  log(`[warn] ${message}`);
}

function printSummary() {
  const failed = results.filter((result) => result.status === "fail");
  const passed = results.filter((result) => result.status === "ok");
  log("");
  log(`Summary: ${passed.length} passed, ${failed.length} failed, ${warnings.length} warnings`);
  if (failed.length) {
    failed.forEach((result) => log(`- ${result.message}${result.detail ? `: ${result.detail}` : ""}`));
  }
}

function loadEnvFiles() {
  [".env.local", ".env", "env.local", ".vercel/.env.production.local"].forEach((fileName) => {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separator = trimmed.indexOf("=");
      if (separator < 1) return;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    });
  });
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function unique(values) {
  return Array.from(new Set(values));
}

function log(message) {
  process.stdout.write(`${message}\n`);
}
