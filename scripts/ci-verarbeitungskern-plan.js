"use strict";

// Explizite einmalige CI-Auswahl fuer den unabhaengig geprueften PR1183.
// Kein automatischer Sonderweg nach Branchname; abweichender Code stoppt.
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1183;
const BASE = "fe94f3eb9b2c959af7c0e2e9e554d676efbb8d6f";
const REVIEWED = "bce55393256d3ab17f84761452a386bf1f5d9f30";
const CI_FILES = Object.freeze([
  ".github/workflows/ci.yml", "scripts/ci-pruefplan.js",
  "scripts/ci-verarbeitungskern-plan.js", "scripts/ci-verarbeitungskern-plan-test.js",
  "scripts/browser-smoke-test.js"
]);
const DOC_FILES = Object.freeze(["docs/CURRENT_STATE.md", "docs/betrieb/verarbeitungskern-100-20261113.md"]);
const allowed = new Set([...CI_FILES, ...DOC_FILES]);
const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
function requireThat(ok, reason) { if (!ok) throw Error("verarbeitungskern-ci:" + reason); }
const same = (a,b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;

function validate({ expectedCommit, workflowSha, checkedOutHead, event, repository, pr, reviewedTree, headTree }) {
  requireThat(event === "workflow_dispatch" && repository === REPOSITORY, "expliziter-manueller-lauf-erforderlich");
  requireThat(sha(expectedCommit) && expectedCommit === workflowSha && expectedCommit === checkedOutHead, "kopfbindung-abweichend");
  requireThat(pr?.number === PR && pr.state === "open" && pr.base?.ref === "main"
    && pr.base.repo?.full_name === REPOSITORY && pr.head?.repo?.full_name === REPOSITORY
    && pr.head.ref === "codex/verarbeitungskern-100-20261113"
    && pr.base.sha === BASE && pr.head.sha === expectedCommit, "aktueller-pr-stand-abweichend");
  requireThat(reviewedTree instanceof Map && headTree instanceof Map && reviewedTree.size > 0 && headTree.size > 0, "git-baum-fehlt");
  for (const file of CI_FILES) {
    const row = headTree.get(file);
    requireThat(row?.type === "blob" && row.mode === "100644" && sha(row.oid), "ci-datei-fehlt-oder-keine-regulaere-datei:" + file);
  }
  for (const file of new Set([...reviewedTree.keys(), ...headTree.keys()])) {
    const row = headTree.get(file);
    if (allowed.has(file)) {
      requireThat(row?.type === "blob" && row.mode === "100644" && sha(row.oid), "ausnahmedatei-ungueltig:" + file);
    } else requireThat(same(reviewedTree.get(file), row), "anwendungscode-abweichend:" + file);
  }
  return {
    mode: "verarbeitungskern", reason: "Expliziter PR1183-Pruefplan bei exakt unveraendertem abgenommenem Anwendungscode",
    standard: false, core: false, area: false, database: false, browser: false,
    syntax: false, npm: false, verarbeitungskern: true,
    source: { repository: REPOSITORY, pr: PR, base: BASE, reviewed: REVIEWED, head: expectedCommit },
    reused: { status: "WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT",
      report: `https://github.com/${REPOSITORY}/blob/${REVIEWED}/docs/betrieb/verarbeitungskern-100-20261113.md`,
      runtimeTree: "Dateimodi und Blob-IDs aller Anwendungs-/Datenbank-/Guard-/Abhaengigkeitsdateien identisch" },
    execute: ["Syntax der geaenderten CI-JavaScriptdateien", "Neue Auswahl-/Negativtests des begrenzten CI-Plans",
      "Neuer gespeicherter Tagespaket-Browserweg bei 1280 und 390 Pixeln"]
  };
}
function git(args, options = {}) { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }); }
function tree(ref) {
  const map = new Map();
  for (const line of git(["ls-tree", "-rz", "--full-tree", ref]).split("\0").filter(Boolean)) {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(line);
    requireThat(Boolean(match), "git-eintrag-unlesbar");
    map.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  return map;
}
function fromCheckout({ expectedCommit, pr, env = process.env }) {
  const checkedOutHead = git(["rev-parse", "HEAD"]).trim();
  // Kein gleich aussehender, aber abgetrennter Baum als Ersatz fuer den Reviewstand.
  requireThat(git(["rev-parse", "--verify", REVIEWED]).trim() === REVIEWED, "review-commit-fehlt");
  git(["merge-base", "--is-ancestor", BASE, checkedOutHead]);
  git(["merge-base", "--is-ancestor", REVIEWED, checkedOutHead]);
  const result = validate({ expectedCommit, pr, checkedOutHead, workflowSha: env.GITHUB_SHA,
    event: env.GITHUB_EVENT_NAME, repository: env.GITHUB_REPOSITORY,
    reviewedTree: tree(REVIEWED), headTree: tree(checkedOutHead) });
  return { ...result, changed: git(["diff", "--name-only", "-z", BASE, checkedOutHead]).split("\0").filter(Boolean) };
}
module.exports = { REPOSITORY, PR, BASE, REVIEWED, CI_FILES, DOC_FILES, validate, fromCheckout };
