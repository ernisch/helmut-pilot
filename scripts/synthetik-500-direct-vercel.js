"use strict";
// Existing operator credentials only. No API/CLI, token minting, refresh,
// Trusted Sources mutation, fallback or deployment-protection change.
function headers(mode, env = process.env) {
  const key = { oidc: "VERCEL_OIDC_TOKEN", bypass: "VERCEL_AUTOMATION_BYPASS_SECRET" }[mode];
  const value = key && env[key];
  if (!key || typeof value !== "string" || !/^[\x21-\x7e]{1,16384}$/.test(value))
    throw Error("synthetik500-production-existing-vercel-access-required");
  return { [mode === "oidc" ? "x-vercel-trusted-oidc-idp-token" : "x-vercel-protection-bypass"]: value };
}
module.exports = { headers };
