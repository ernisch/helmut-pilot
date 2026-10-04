"use strict";

const cp = require("child_process");

const SAFE_SKIP = [
  /(^|\/)docs\//i,
  /(^|\/)audit\//i,
  /(^|\/)belege\//i,
  /(^|\/)archive\//i,
  /(^|\/)AGENTS\.md$/i,
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)README(?:\.[^/]+)?$/i,
  /(^|\/)LICENSE(?:\.[^/]+)?$/i,
  /(^|\/)scripts\/[^/]*(?:-test\.js|gesamttest\.js)$/i,
  /(^|\/)scripts\/source23_closed_tuple_codec_test\.py$/i,
];

function normalize(files) {
  return [...new Set((files || []).map((x) => String(x || "").trim()).filter(Boolean))].sort();
}

function isSafeSkipFile(file) {
  return SAFE_SKIP.some((rule) => rule.test(file));
}

function shouldSkip(files) {
  const changed = normalize(files);
  return changed.length > 0 && changed.every(isSafeSkipFile);
}

function diffFiles(base, options = {}) {
  const spawnSync = options.spawnSync || cp.spawnSync;
  if (!base || !/^[a-f0-9]{7,64}$/i.test(base)) return null;
  const result = spawnSync("git", ["diff", "--name-only", base, "HEAD"], {
    encoding: "utf8",
    cwd: options.cwd || process.cwd(),
  });
  if (result.error || result.status !== 0) return null;
  return normalize(String(result.stdout || "").split(/\r?\n/));
}

function main() {
  const base = process.env.VERCEL_GIT_PREVIOUS_SHA || "";
  const files = diffFiles(base);
  if (!files) {
    console.log("Vercel build wird ausgefuehrt: vorheriger Deployment Commit nicht sicher bestimmbar.");
    process.exitCode = 1;
    return;
  }
  if (shouldSkip(files)) {
    console.log("Vercel build wird uebersprungen: nur Doku, Agentenregeln oder reine Tests geaendert.");
    process.exitCode = 0;
    return;
  }
  console.log("Vercel build wird ausgefuehrt: Runtime, Konfiguration oder unklare Datei geaendert.");
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { SAFE_SKIP, normalize, isSafeSkipFile, shouldSkip, diffFiles };
