"use strict";

// Ohne --execute ausschliesslich lesender Plan. Keine .env-Dateien.
const { execFileSync } = require("node:child_process");
const V = require("../lib/helmut/verstehen-vier");
const { adapter } = require("../lib/helmut/verstehen-vier-speicher");
const BESTAETIGUNG = "VIER_UNKNOWN_EINMALIG_BESTAETIGT";
function argumente(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!["--execute", "--ids", "--plan-hash", "--runtime-commit", "--confirm"].includes(a)
      || Object.hasOwn(out, a)) throw new Error("vier-argumente-ungueltig");
    if (a === "--execute") out[a] = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("vier-argumentwert-fehlt");
      out[a] = args[++i];
    }
  }
  out.ids = V.auswahl((out["--ids"] || "").split(","));
  return out;
}
function pruefeRuntime(commit, env = process.env, git = args => execFileSync("git", args, { encoding: "utf8" }).trim()) {
  if (!/^[a-f0-9]{40}$/.test(commit || "") || git(["rev-parse", "HEAD"]) !== commit)
    throw new Error("vier-runtime-abweichend");
  if (env.GITHUB_ACTIONS === "true") {
    if (env.GITHUB_REPOSITORY !== "ernisch/helmut-pilot" || env.GITHUB_REF !== "refs/heads/main"
      || env.GITHUB_EVENT_NAME !== "workflow_dispatch" || env.GITHUB_RUN_ATTEMPT !== "1"
      || env.GITHUB_SHA !== commit) throw new Error("vier-dispatch-abweichend");
  } else if (git(["rev-parse", "refs/remotes/origin/main"]) !== commit) {
    throw new Error("vier-main-abweichend");
  }
}
async function main(args = process.argv.slice(2)) {
  const a = argumente(args);
  if (a["--execute"]) {
    if (a["--confirm"] !== BESTAETIGUNG) throw new Error("vier-bestaetigung-fehlt");
    pruefeRuntime(a["--runtime-commit"]);
  }
  const deps = adapter();
  const timer = a["--execute"] ? setTimeout(() => {
    console.error("vier-harte-laufzeit-erreicht; kein Retry, Quittung und CAS rein lesend pruefen");
    process.exit(1);
  }, V.MAX_MS) : null;
  try {
  const out = a["--execute"]
    ? await V.ausfuehren({ ids: a.ids, planHash: a["--plan-hash"],
      runtimeCommit: a["--runtime-commit"], runId: "verstehen4-" + (process.env.GITHUB_RUN_ID || Date.now()), deps })
    : V.uebersicht(await V.plane({ ids: a.ids, deps }));
  console.log(JSON.stringify(out, null, 2));
  return out.ok ? 0 : 1;
  } finally { if (timer) clearTimeout(timer); }
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(e => {
  console.log(JSON.stringify({ ok: false, grund: /^vier-[a-z-]+$/.test(e?.message || "")
    ? e.message : "vier-technischer-fehler", automatischeWiederholung: false }));
  process.exitCode = 1;
});
module.exports = { argumente, pruefeRuntime, main, BESTAETIGUNG };
