#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

loadEnvFiles();

const args = new Set(process.argv.slice(2));
const baseUrl = stripTrailingSlash(process.env.HELMUT_BASE_URL || "https://helmut-pilot.vercel.app");
const pilotSecret = process.env.PILOT_SECRET || "";
const adminSecret = process.env.HELMUT_ADMIN_SECRET || process.env.CRON_SECRET || "";
const runCrawl = args.has("--run-crawl") || args.has("--full");
const checkExternalLinks = !args.has("--no-links");

const results = [];
const warnings = [];
let cookie = "";

main().catch((error) => {
  fail("Smoke test crashed", error.message);
  printSummary();
  process.exit(1);
});

async function main() {
  log(`Helmut smoke test: ${baseUrl}`);

  await checkPilotGate();
  await unlockPilot();
  await checkAppShell();

  const status = await checkOpsStatus();
  const briefing = await checkBriefing();
  await checkPipelineDebug();
  await checkSourceLinks(briefing);
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
    fail("PILOT_SECRET missing locally", "Production is protected, but the smoke test has no PILOT_SECRET to unlock it.");
    return;
  }
  warn("PILOT_SECRET is not set; running against an unprotected/local target.");
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
  ok(Number(status.crawl?.checkedSources || 0) >= 50, "Crawler checks at least 50 sources");
  ok(Number(status.crawl?.failedSources || 0) / Math.max(1, Number(status.crawl?.checkedSources || 0)) <= 0.1, "Crawler failure rate is below 10 percent");
  ok(Number(status.briefing?.recommendationCount || 0) >= 1, "Latest briefing contains at least one recommendation");
  ok(status.briefing?.quality?.status === "Pitchbereit" || Number(status.briefing?.quality?.score || 0) >= 90, "Briefing quality is pitch-ready");
  ok(Number(status.evidenceQuality?.missingLinks || 0) === 0, "Visible evidence has no missing links");
  return status;
}

async function checkBriefing() {
  const response = await request("GET", "/api/briefing/latest?refresh=0", { cookie });
  const briefing = parseJson(response, "latest briefing");
  ok(response.statusCode === 200, "Latest briefing endpoint responds");
  ok(briefing.status !== "Demo", "Latest briefing is not demo fallback");
  ok(Array.isArray(briefing.items) && briefing.items.length > 0, "Briefing has visible decision items");
  ok(Array.isArray(briefing.personalizedRecommendations) && briefing.personalizedRecommendations.length > 0, "Briefing has personalized recommendations");
  ok(Boolean(briefing.executiveSummary || briefing.themeOfDay || briefing.chiefRecommendation || briefing.topicOfTheDay || briefing.agentBriefing), "Briefing has a top-level referent summary");
  return briefing;
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
  const urls = unique(sources.map((source) => source.itemUrl || source.url || source.sourceUrl).filter(isHttpUrl));
  ok(urls.length > 0, "Briefing evidence contains public URLs");
  if (!checkExternalLinks || urls.length === 0) return;

  const sample = urls.slice(0, 6);
  const checks = await Promise.all(sample.map((url) => checkLink(url)));
  const broken = checks.filter((check) => !check.ok);
  ok(broken.length === 0, `Source link sample opens (${sample.length} checked)`);
  broken.slice(0, 3).forEach((entry) => warn(`Broken source sample: ${entry.url} (${entry.statusCode || entry.error})`));
}

async function maybeRunCrawl() {
  if (!runCrawl) {
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
  ok(Number(crawl.checkedSources || 0) >= 50 || Boolean(crawl.skippedReason), "Manual crawl checks sources or reuses recent run");
}

function collectSources(briefing) {
  return [
    ...(briefing.items || []).flatMap((item) => item.sources || [item.primarySource].filter(Boolean)),
    ...(briefing.personalizedRecommendations || []).flatMap((item) => item.sources || [item.primarySource].filter(Boolean)),
    ...(briefing.personMentions || [])
  ].filter(Boolean);
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

function request(method, pathname, options = {}) {
  return requestAbsolute(method, `${baseUrl}${pathname}`, options);
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
