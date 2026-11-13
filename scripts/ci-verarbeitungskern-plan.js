"use strict";

// Explizite einmalige CI-Auswahl fuer den unabhaengig geprueften PR1183.
// Kein automatischer Sonderweg nach Branchname; abweichender Code stoppt.
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1183;
const BASE = "fe94f3eb9b2c959af7c0e2e9e554d676efbb8d6f";
const REVIEWED = "bce55393256d3ab17f84761452a386bf1f5d9f30";
const PREVIOUS = "f7f3d6eb086fa7b8200f6d3628b950b42032ae85";
const PREVIOUS_RUN = 43483196284;
const BROWSER_FILE = "scripts/browser-smoke-test.js";
// Nur die unabhaengig gepruefte Produktionshash-Ergaenzung, keine SQL-Pfadausnahme.
const SQL_BLOBS = Object.freeze({
  "supabase/migrations/20261113165614_frische_tagesarbeit.sql": "baa2d2f743731dd3b076cfb467d38b5c9c563a6b",
  "scripts/verarbeitungskern-claim-datenbank-test.js": "2fab9a3d48c17889fc6c15c895f4dccda54c4fe9"
});
const CI_FILES = Object.freeze([
  ".github/workflows/ci.yml", "scripts/ci-pruefplan.js",
  "scripts/ci-verarbeitungskern-plan.js", "scripts/ci-verarbeitungskern-plan-test.js"
]);
const DOC_FILES = Object.freeze(["docs/CURRENT_STATE.md", "docs/betrieb/verarbeitungskern-100-20261113.md"]);
const allowed = new Set([...CI_FILES, ...DOC_FILES]);
const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
function requireThat(ok, reason) { if (!ok) throw Error("verarbeitungskern-ci:" + reason); }
const same = (a,b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;

function validateReuse({ run, jobs, previousTree, headTree }) {
  requireThat(run?.id === PREVIOUS_RUN && run.head_sha === PREVIOUS
    && run.event === "workflow_dispatch" && run.path === ".github/workflows/ci.yml"
    && run.repository?.full_name === REPOSITORY && run.run_attempt === 1
    && run.status === "completed" && run.conclusion === "success", "alter-ci-lauf-nicht-erfolgreich-gebunden");
  requireThat(jobs?.total_count === 3 && jobs.jobs?.length === 3, "alte-ci-jobs-unvollstaendig");
  const browser = jobs.jobs.find(job => job.id === 132084761727);
  requireThat(browser?.run_id === PREVIOUS_RUN && browser.name === "Browser-/Mobile-Smoke (Chromium)"
    && browser.status === "completed" && browser.conclusion === "success"
    && browser.steps?.some(step => step.number === 9
      && step.name === "Gespeichertes Tagespaket - neuer Desktop-/Mobilweg"
      && step.status === "completed" && step.conclusion === "success"), "alter-browserbeleg-fehlt");
  requireThat(previousTree instanceof Map && previousTree.size > 0 && headTree instanceof Map && headTree.size > 0,
    "alter-ci-baum-fehlt");
  for (const [file, blob] of Object.entries(SQL_BLOBS)) {
    const row = headTree.get(file);
    requireThat(sha(blob) && row?.mode === "100644" && row.type === "blob" && row.oid === blob,
      "sql-nachtrag-nicht-exakt-abgenommen:" + file);
  }
  requireThat(previousTree.has(BROWSER_FILE) && same(previousTree.get(BROWSER_FILE), headTree.get(BROWSER_FILE)),
    "browserprogramm-seit-erfolgsbeleg-abweichend");
  for (const file of new Set([...previousTree.keys(), ...headTree.keys()])) {
    const row = headTree.get(file);
    if (Object.hasOwn(SQL_BLOBS, file)) {
      requireThat(sha(SQL_BLOBS[file]) && row?.mode === "100644" && row.type === "blob" && row.oid === SQL_BLOBS[file],
        "sql-nachtrag-nicht-exakt-abgenommen:" + file);
    } else if (!allowed.has(file)) requireThat(same(previousTree.get(file), row), "seit-ci-lauf-abweichend:" + file);
  }
  return { status: "WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT", head: PREVIOUS, run: PREVIOUS_RUN,
    url: `https://github.com/${REPOSITORY}/actions/runs/${PREVIOUS_RUN}`,
    browser: "29/29 Desktop-/Mobilpruefungen im frueheren Lauf; aktueller Baum und Erfolgsbeleg gebunden" };
}

function validate({ expectedCommit, workflowSha, checkedOutHead, event, repository, pr, reviewedTree, headTree, ...previous }) {
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
    if (Object.hasOwn(SQL_BLOBS, file)) {
      requireThat(sha(SQL_BLOBS[file]) && row?.mode === "100644" && row.type === "blob" && row.oid === SQL_BLOBS[file],
        "sql-nachtrag-nicht-exakt-abgenommen:" + file);
    } else if (allowed.has(file) || file === BROWSER_FILE) {
      requireThat(row?.type === "blob" && row.mode === "100644" && sha(row.oid), "ausnahmedatei-ungueltig:" + file);
    } else requireThat(same(reviewedTree.get(file), row), "anwendungscode-abweichend:" + file);
  }
  const reuse = validateReuse({ ...previous, headTree });
  return {
    mode: "verarbeitungskern", reason: "Expliziter PR1183-SQL-Nachtrag mit exakt gebundenen Blob-IDs und bestaetigtem CI-Vorbeleg",
    standard: false, core: false, area: false, database: false, browser: false,
    syntax: false, npm: false, verarbeitungskern: true,
    source: { repository: REPOSITORY, pr: PR, base: BASE, reviewed: REVIEWED, head: expectedCommit },
    reused: { ...reuse,
      report: `https://github.com/${REPOSITORY}/blob/${REVIEWED}/docs/betrieb/verarbeitungskern-100-20261113.md`,
      runtimeTree: "Unveraendert ausser zwei exakt per Blob-ID abgenommenen SQL-Nachtragsdateien; Browserprogramm identisch zum Erfolgsbeleg" },
    execute: ["Syntax der geaenderten CI-/SQL-Test-JavaScriptdateien", "Nur neue SQL-Ausnahme-/Belegbindungsfaelle",
      "Drei neue SQL-Guardfaelle gegen isolierten PostgreSQL17.6; keine alten DB-Faelle",
      "Erfolgreichen alten Browserbeleg und unveraenderten Eingabebaum pruefen; kein neuer Browserlauf"]
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
  git(["merge-base", "--is-ancestor", PREVIOUS, checkedOutHead]);
  requireThat(Boolean(env.GH_TOKEN), "lesetoken-fuer-ci-vorbeleg-fehlt");
  const api = suffix => JSON.parse(execFileSync("gh", ["api", `repos/${REPOSITORY}/actions/runs/${PREVIOUS_RUN}${suffix}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000, env }));
  const result = validate({ expectedCommit, pr, checkedOutHead, workflowSha: env.GITHUB_SHA,
    event: env.GITHUB_EVENT_NAME, repository: env.GITHUB_REPOSITORY,
    reviewedTree: tree(REVIEWED), headTree: tree(checkedOutHead), previousTree: tree(PREVIOUS),
    run: api(""), jobs: api("/jobs?per_page=100") });
  return { ...result, changed: git(["diff", "--name-only", "-z", BASE, checkedOutHead]).split("\0").filter(Boolean) };
}
module.exports = { REPOSITORY, PR, BASE, REVIEWED, PREVIOUS, PREVIOUS_RUN, BROWSER_FILE, SQL_BLOBS,
  CI_FILES, DOC_FILES, validate, validateReuse, fromCheckout };
