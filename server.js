const http = require("http");
const fs = require("fs");
const path = require("path");

loadLocalEnv();

const { cemInceProfile, demoRawItems, demoSources, generateBriefing } = require("./lib/helmut/runtime");
const { getLatestOrDemoBriefing, runDailyPipeline, runMorningBriefing, runSourceCrawl } = require("./lib/helmut/scheduler");
const { personalizeBriefing } = require("./lib/helmut/personalization");
const { getInteractions, getProfile, getStorageStatus, getTasks, getTopicMemory, getUserNotes, saveInteraction, saveProfile, saveTask, saveUserNote, updateTaskStatus } = require("./lib/helmut/storage");
const { generateCommunicationDraft, isAiEnabled } = require("./lib/helmut/ai");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

const canonicalHost = process.env.HELMUT_CANONICAL_HOST || "helmut-pilot.vercel.app";

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
        return personalizeBriefing(latest, profile, await getTopicMemory(profile.id), await getInteractions(profile.id));
      }
      if (!shouldRefreshLatestBriefing(latest, url)) return latest;
      const pipeline = await runDailyPipeline(politicianId);
      return {
        ...pipeline.briefing,
        refreshedOnRead: true
      };
    });
  }

  if (url.pathname === "/api/briefing/run") {
    return handleAsync(response, () => runMorningBriefing(politicianId));
  }

  if (url.pathname === "/api/crawl/run") {
    return handleAsync(response, () => runSourceCrawl(politicianId));
  }

  if (url.pathname === "/api/pipeline/run") {
    return handleAsync(response, () => runDailyPipeline(politicianId));
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

  if (url.pathname === "/api/communication/generate" && request.method === "POST") {
    return handleJson(request, response, async (body) => generateCommunicationDraft({
      prompt: body.prompt,
      decision: body.decision,
      profile: await activeProfile(politicianId)
    }));
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

  const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(root, requestedPath));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  });
}

function shouldRedirectToCanonicalHost(request, url) {
  const host = String(request.headers.host || "").toLowerCase();
  if (!canonicalHost || host === canonicalHost) return false;
  return host.includes("onrender.com");
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
  return ageMs > 4 * 60 * 60 * 1000;
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
