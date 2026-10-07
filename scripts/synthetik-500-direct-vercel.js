"use strict";

// Explicit operator transport through the caller's existing Vercel identity.
// Fixed URL/POST and curl policy; no deploy, linking, traces, fallback or retry.
const { spawn } = require("node:child_process");
const { PATH } = require("../lib/helmut/synthetik-500-direct-entry");
const ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE",
  "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY",
  "https_proxy", "http_proxy", "all_proxy", "no_proxy", "VERCEL_TOKEN", "VERCEL_ORG_ID"];
const MAX_BYTES = 16 * 1024 * 1024;
const quote = s => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
function request(url, body, admin) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.port || u.username || u.password || u.hash || u.search || u.pathname !== PATH
    || !/^[a-z0-9-]+\.vercel\.app$/.test(u.hostname) || typeof body !== "string" || Buffer.byteLength(body) > 1024
    || typeof admin !== "string" || !/^[\x21-\x7e]{1,1024}$/.test(admin)
    || !process.env.VERCEL_TOKEN || process.env.VERCEL_ORG_ID !== undefined
      && !/^team_[A-Za-z0-9]{1,100}$/.test(process.env.VERCEL_ORG_ID)) throw Error("synthetik500-production-vercel-access-required");
  const env = Object.fromEntries(ENV_KEYS.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
  env.CI = "1"; env.VERCEL_TELEMETRY_DISABLED = "1";
  const config = 'request = "POST"\nheader = ' + quote("Authorization: Bearer " + admin)
    + '\nheader = "Content-Type: application/json"\ndata-binary = ' + quote(body) + "\n";
  return new Promise((resolve, reject) => {
    let child, done = false, bytes = 0, chunks = [];
    const stop = () => {
      if (!child) return;
      // Stop curl descendants as well as its Vercel parent on POSIX. An already
      // accepted server request remains unknown; the claim is never reopened.
      try { if (process.platform !== "win32" && child.pid > 0) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); }
      catch { try { child.kill("SIGKILL"); } catch { /* already exited */ } }
    };
    const finish = (error, value) => {
      if (done) return; done = true; clearTimeout(timer);
      if (error) { stop(); reject(Error("synthetik500-production-vercel-rejected-or-unknown-no-retry")); } else resolve(value);
    };
    const timer = setTimeout(() => finish(true), 180000);
    try {
      child = spawn("vercel", [...(env.VERCEL_ORG_ID ? ["--scope", env.VERCEL_ORG_ID] : []), "curl", url, "--", "--config", "-", "--silent", "--show-error", "--max-time", "170",
        "--retry", "0", "--no-location", "--max-redirs", "0", "--fail-with-body"],
      { shell: false, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"], env });
      child.once("error", () => finish(true));
      child.stdin.on("error", () => finish(true)); child.stdout.on("error", () => finish(true)); child.stderr.on("error", () => finish(true));
      child.stderr.on("data", () => {}); // Never relay credentials, login links or raw errors.
      child.stdout.on("data", chunk => {
        if (!Buffer.isBuffer(chunk) || (bytes += chunk.length) > MAX_BYTES) return finish(true);
        chunks.push(chunk);
      });
      child.once("close", code => {
        child = null;
        if (code !== 0) return finish(true);
        try {
          const b = Buffer.concat(chunks), s = b.toString("utf8"), result = JSON.parse(s);
          if (!Buffer.from(s, "utf8").equals(b) || result?.ok !== true) return finish(true);
          finish(false, result);
        } catch { finish(true); }
      });
      child.stdin.end(config); // Admin secret stays out of argv and files.
    } catch { finish(true); }
  });
}
module.exports = { request, MAX_BYTES };
