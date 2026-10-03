#!/usr/bin/env node
"use strict";

const cp = require("child_process");

const URL = "https://api.deepseek.com/responses";
const EXPECTED = "HELMUT_DEEPSEEK_CLOUD_OK";
const MAX_OUTPUT_TOKENS = 1024;
const TIMEOUT_SECONDS = 30;

function parseCurlResponse(raw) {
  const marker = "\n__HELMUT_HTTP_STATUS__:";
  const idx = raw.lastIndexOf(marker);
  if (idx < 0) throw new Error("deepseek-curl-status-fehlt");
  const body = raw.slice(0, idx);
  const code = Number(raw.slice(idx + marker.length).trim());
  if (code !== 200) throw new Error(`deepseek-http-${code || "unknown"}`);
  let parsed;
  try { parsed = JSON.parse(body); }
  catch { throw new Error("deepseek-invalid-json"); }

  const text = (parsed.output || [])
    .filter((x) => x && x.type === "message")
    .flatMap((x) => x.content || [])
    .filter((x) => x && x.type === "output_text")
    .map((x) => x.text || "")
    .join("")
    .trim();

  if (text !== EXPECTED) throw new Error("deepseek-marker-mismatch");
  const usage = parsed.usage || {};
  return {
    ok: true,
    model: parsed.model || "deepseek-flash",
    status: parsed.status || null,
    input_tokens: Number(usage.input_tokens || 0),
    output_tokens: Number(usage.output_tokens || 0),
    total_tokens: Number(usage.total_tokens || 0),
    max_output_tokens: MAX_OUTPUT_TOKENS,
  };
}

function callDeepSeek({ apiKey, spawnSync = cp.spawnSync, env = process.env } = {}) {
  const key = apiKey || env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY-fehlt");

  const body = JSON.stringify({
    model: "deepseek-flash",
    instructions: "Return only the exact requested marker. No explanation.",
    input: `Return exactly: ${EXPECTED}`,
    reasoning: { effort: "high" },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
  });

  const result = spawnSync("curl", [
    "--silent",
    "--show-error",
    "--connect-timeout", "10",
    "--max-time", String(TIMEOUT_SECONDS),
    "--request", "POST",
    "--header", `Authorization: Bearer ${key}`,
    "--header", "Content-Type: application/json",
    "--data-binary", "@-",
    "--write-out", "\n__HELMUT_HTTP_STATUS__:%{http_code}",
    URL,
  ], {
    input: body,
    encoding: "utf8",
    env,
    maxBuffer: 1024 * 1024,
  });

  if (result.error) throw new Error(`deepseek-curl-start:${result.error.code || result.error.message}`);
  if (result.status !== 0) {
    const tail = String(result.stderr || "").trim().split("\n").slice(-2).join(" | ").slice(0, 300);
    throw new Error(`deepseek-curl-exit-${result.status}${tail ? ":" + tail : ""}`);
  }
  return parseCurlResponse(String(result.stdout || ""));
}

function main() {
  try {
    const result = callDeepSeek();
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(`[deepseek-connectivity] ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  URL,
  EXPECTED,
  MAX_OUTPUT_TOKENS,
  TIMEOUT_SECONDS,
  parseCurlResponse,
  callDeepSeek,
};
