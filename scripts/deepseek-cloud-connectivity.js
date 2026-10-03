#!/usr/bin/env node
"use strict";

const https = require("https");

const HOST = "api.deepseek.com";
const PATH = "/responses";
const EXPECTED = "HELMUT_DEEPSEEK_CLOUD_OK";
const MAX_OUTPUT_TOKENS = 1024;
const TIMEOUT_MS = 30000;

function callDeepSeek({ apiKey, request = https.request } = {}) {
  const key = apiKey || process.env.DEEPSEEK_API_KEY;
  if (!key) return Promise.reject(new Error("DEEPSEEK_API_KEY-fehlt"));

  const body = JSON.stringify({
    model: "deepseek-flash",
    instructions: "Return only the exact requested marker. No explanation.",
    input: `Return exactly: ${EXPECTED}`,
    reasoning: { effort: "high" },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
  });

  return new Promise((resolve, reject) => {
    const req = request({
      hostname: HOST,
      port: 443,
      path: PATH,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > 1024 * 1024) {
          req.destroy(new Error("response-too-large"));
        }
      });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`deepseek-http-${res.statusCode}`));
        }
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch { return reject(new Error("deepseek-invalid-json")); }

        const text = (parsed.output || [])
          .filter((x) => x && x.type === "message")
          .flatMap((x) => x.content || [])
          .filter((x) => x && x.type === "output_text")
          .map((x) => x.text || "")
          .join("")
          .trim();

        if (text !== EXPECTED) return reject(new Error("deepseek-marker-mismatch"));
        const usage = parsed.usage || {};
        resolve({
          ok: true,
          model: parsed.model || "deepseek-flash",
          status: parsed.status || null,
          input_tokens: Number(usage.input_tokens || 0),
          output_tokens: Number(usage.output_tokens || 0),
          total_tokens: Number(usage.total_tokens || 0),
          max_output_tokens: MAX_OUTPUT_TOKENS,
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error("deepseek-timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

async function main() {
  try {
    const result = await callDeepSeek();
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(`[deepseek-connectivity] ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { HOST, PATH, EXPECTED, MAX_OUTPUT_TOKENS, TIMEOUT_MS, callDeepSeek };
