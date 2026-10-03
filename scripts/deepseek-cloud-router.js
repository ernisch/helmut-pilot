#!/usr/bin/env node
"use strict";

/**
 * Helmut DeepSeek Cloud Router
 *
 * Starts one bounded Codex worker against DeepSeek without changing the
 * orchestrator's Codex configuration. The DeepSeek key is read only from
 * DEEPSEEK_API_KEY. No OpenAI, Supabase, Vercel or other Production credentials
 * are forwarded to the worker.
 *
 * Usage:
 *   node scripts/deepseek-cloud-router.js flash high read  --task-file /tmp/task.txt
 *   node scripts/deepseek-cloud-router.js flash high write --task-file /tmp/task.txt
 *   node scripts/deepseek-cloud-router.js pro max write    --task-file /tmp/task.txt
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const MODELS = Object.freeze({
  flash: "deepseek-flash",
  pro: "deepseek-v4-pro",
});
const EFFORTS = new Set(["high", "max"]);
const MODES = new Set(["read", "write"]);
const MAX_TASK_CHARS = 12000;
const MAX_RETURN_CHARS = 2000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

const SAFE_ENV_KEYS = [
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP",
  "LANG", "LC_ALL", "LC_CTYPE", "TERM", "COLORTERM", "NO_COLOR",
  "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY",
];

function charCount(value) {
  return Array.from(String(value || "")).length;
}

function sanitizeEnv(source, codexHome) {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (source[key] != null && source[key] !== "") env[key] = source[key];
  }
  if (source.DEEPSEEK_API_KEY) env.DEEPSEEK_API_KEY = source.DEEPSEEK_API_KEY;
  env.CODEX_HOME = codexHome;
  env.HELMUT_DEEPSEEK_ROUTER = "1";
  env.TZ = "UTC";
  return env;
}

function outputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["status", "result", "files", "tests", "risks", "next"],
    properties: {
      status: { type: "string", enum: ["ok", "blocked", "failed"] },
      result: {
        type: "array",
        maxItems: 4,
        items: { type: "string", maxLength: 220 },
      },
      files: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "note"],
          properties: {
            path: { type: "string", maxLength: 180 },
            note: { type: "string", maxLength: 160 },
          },
        },
      },
      tests: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "result"],
          properties: {
            name: { type: "string", maxLength: 140 },
            result: { type: "string", maxLength: 160 },
          },
        },
      },
      risks: {
        type: "array",
        maxItems: 4,
        items: { type: "string", maxLength: 220 },
      },
      next: { type: "string", maxLength: 240 },
    },
  };
}

function buildPrompt(task, { model, effort, mode }) {
  return [
    "You are a bounded implementation worker for Helmut.",
    "The main Codex orchestrator keeps architecture, Production decisions, integration and final approval.",
    "Read AGENTS.md, docs/START_HERE.md and docs/CURRENT_STATE.md from the workspace, then only files needed for this task.",
    "Do not summarize project history. Do not broaden scope.",
    mode === "write"
      ? "You may edit only files required by the task. Do not commit, push, merge, open PRs, change Production, change environments, change budgets, run migrations or send external messages."
      : "This is read-only. Do not modify files.",
    "Shell network access is disabled. Never attempt to reveal or print environment secrets.",
    "Use the smallest necessary tests. Do not repeat already-proven suites without a concrete reason.",
    "At the end return ONLY the JSON object required by the output schema.",
    "The final JSON must be at most 2000 characters total. No logs, no diffs, no long explanations, no repeated context.",
    "Put durable evidence in files/tests/commits where appropriate; the final response only points to it.",
    `Worker route: model=${model}, effort=${effort}, mode=${mode}.`,
    "",
    "TASK",
    task.trim(),
  ].join("\n");
}

function buildCodexArgs({ model, effort, mode, schemaFile, resultFile, cwd }) {
  return [
    "exec",
    "--ephemeral",
    "--model", model,
    "--sandbox", mode === "write" ? "workspace-write" : "read-only",
    "--cd", cwd,
    "--output-schema", schemaFile,
    "-o", resultFile,
    "-c", 'model_provider="deepseek"',
    "-c", 'model_providers.deepseek.name="DeepSeek"',
    "-c", 'model_providers.deepseek.base_url="https://api.deepseek.com"',
    "-c", 'model_providers.deepseek.env_key="DEEPSEEK_API_KEY"',
    "-c", 'model_providers.deepseek.wire_api="responses"',
    "-c", "model_providers.deepseek.requires_openai_auth=false",
    "-c", "model_providers.deepseek.request_max_retries=0",
    "-c", "model_providers.deepseek.stream_max_retries=0",
    "-c", `model_reasoning_effort="${effort}"`,
    "-c", 'web_search="disabled"',
    "-c", "sandbox_workspace_write.network_access=false",
    "-c", 'approval_policy="never"',
  ];
}

function validateSummary(raw) {
  if (charCount(raw) > MAX_RETURN_CHARS) {
    throw new Error(`deepseek-summary-too-long:${charCount(raw)}>${MAX_RETURN_CHARS}`);
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("deepseek-summary-not-json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("deepseek-summary-invalid-object");
  }
  const required = ["status", "result", "files", "tests", "risks", "next"];
  for (const key of required) {
    if (!(key in value)) throw new Error(`deepseek-summary-missing-${key}`);
  }
  if (!["ok", "blocked", "failed"].includes(value.status)) {
    throw new Error("deepseek-summary-invalid-status");
  }
  for (const key of ["result", "files", "tests", "risks"]) {
    if (!Array.isArray(value[key])) throw new Error(`deepseek-summary-invalid-${key}`);
  }
  if (typeof value.next !== "string") throw new Error("deepseek-summary-invalid-next");
  return value;
}

function parseArgs(argv) {
  const [modelKey, effort, mode, ...rest] = argv;
  if (!MODELS[modelKey] || !EFFORTS.has(effort) || !MODES.has(mode)) {
    throw new Error("usage: deepseek-cloud-router.js <flash|pro> <high|max> <read|write> --task-file <path>");
  }
  const taskIndex = rest.indexOf("--task-file");
  if (taskIndex < 0 || !rest[taskIndex + 1]) {
    throw new Error("task-file-required");
  }
  return {
    modelKey,
    model: MODELS[modelKey],
    effort,
    mode,
    taskFile: path.resolve(rest[taskIndex + 1]),
  };
}

function run(options = {}) {
  const argv = options.argv || process.argv.slice(2);
  const envSource = options.env || process.env;
  const cwd = options.cwd || process.cwd();
  const spawnSync = options.spawnSync || cp.spawnSync;
  const codexBin = options.codexBin || envSource.CODEX_BIN || "codex";
  const cfg = parseArgs(argv);

  if (!envSource.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY-fehlt");
  const task = fs.readFileSync(cfg.taskFile, "utf8");
  if (!task.trim()) throw new Error("task-file-empty");
  if (charCount(task) > MAX_TASK_CHARS) {
    throw new Error(`task-too-long:${charCount(task)}>${MAX_TASK_CHARS}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-deepseek-"));
  const codexHome = path.join(tempDir, "codex-home");
  const schemaFile = path.join(tempDir, "result-schema.json");
  const resultFile = path.join(tempDir, "result.json");
  fs.mkdirSync(codexHome, { mode: 0o700 });
  fs.writeFileSync(schemaFile, JSON.stringify(outputSchema()), { mode: 0o600 });

  const prompt = buildPrompt(task, cfg);
  const args = buildCodexArgs({
    model: cfg.model,
    effort: cfg.effort,
    mode: cfg.mode,
    schemaFile,
    resultFile,
    cwd,
  });

  try {
    const result = spawnSync(codexBin, [...args, prompt], {
      cwd,
      env: sanitizeEnv(envSource, codexHome),
      encoding: "utf8",
      timeout: Number(envSource.HELMUT_DEEPSEEK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
      maxBuffer: 2 * 1024 * 1024,
      stdio: ["ignore", "ignore", "pipe"],
    });
    if (result.error) {
      if (result.error.code === "ETIMEDOUT") throw new Error("deepseek-worker-timeout");
      throw new Error(`deepseek-worker-start:${result.error.code || result.error.message}`);
    }
    if (result.status !== 0) {
      const tail = String(result.stderr || "").trim().split("\n").slice(-3).join(" | ").slice(0, 500);
      throw new Error(`deepseek-worker-exit-${result.status}${tail ? ":" + tail : ""}`);
    }
    if (!fs.existsSync(resultFile)) throw new Error("deepseek-worker-no-final-result");
    const raw = fs.readFileSync(resultFile, "utf8").trim();
    return validateSummary(raw);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  try {
    const summary = run();
    process.stdout.write(JSON.stringify(summary) + "\n");
  } catch (error) {
    process.stderr.write(`[deepseek-router] ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  MODELS,
  MAX_TASK_CHARS,
  MAX_RETURN_CHARS,
  sanitizeEnv,
  outputSchema,
  buildPrompt,
  buildCodexArgs,
  validateSummary,
  parseArgs,
  run,
};
