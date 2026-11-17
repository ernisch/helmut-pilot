"use strict";

// Exakt gepruefter JSON-Readback und beleggebundenes einmaliges Ersatzfenster PR1245.
// Beide Pflichtjobs bleiben. Kein neuer Browserlauf fuer unveraenderte UI/HTTP-Ausgabe;
// Runtime-/Testblobs und unveraenderter restlicher Baum sind geschlossen gebunden.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1245;
const BRANCH = "codex/quellen-readback-20261117";
const BASE = "3e174583dc8a8c66a3e129a7df57ce0ac9706f66";
const EVIDENCE = "9f27f4c90d19ebe84c469fbd85cb468dccfea291";
const MERGE_TITLE = "fix(quellen): gespeicherte JSON-Nutzlast korrekt rücklesen (#1245)";
const BLOBS = Object.freeze({
  "lib/helmut/quellen-arbeitsfenster.js": "322f032d625d0027973775213f903420a885d35a",
  "lib/helmut/quellen-operatorplanung.js": "f337ea604707c215f7d5058b096548abdea7ce0f",
  "scripts/quellen-arbeitsfenster-test.js": "128b5f554c5e4c93449f247c56197d54d67a7202",
  "scripts/quellen-operatorplanung-test.js": "70fa7b57128304f873caed56d9fdfca7d2173d3f"
});
const CI_FILES = Object.freeze([".github/workflows/ci.yml", "scripts/ci-quellenreadback-plan.js", "scripts/ci-quellenreadback-plan-test.js"]);
const DOC_FILES = Object.freeze(["AGENTS.md", "docs/CURRENT_STATE.md", "docs/betrieb/quellen-operatorstart-20261117.md"]);
const sha = s => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("quellenreadback-ci:" + reason); }
function regular(row) { return row?.mode === "100644" && row.type === "blob" && sha(row.oid); }

function validate({ event, repository, ref, headRef, before, message, pr, head, parents = [], baseTree, evidenceTree, headTree, prHeadTree }) {
  need(repository === REPOSITORY && sha(head), "repository-oder-kopf");
  need([baseTree, evidenceTree, headTree].every(t => t instanceof Map && t.size > 0), "baum-fehlt");
  need(pr?.number === PR && pr.base?.ref === "main" && pr.base.sha === BASE
    && pr.base.repo?.full_name === REPOSITORY && pr.head?.ref === BRANCH
    && pr.head.repo?.full_name === REPOSITORY && sha(pr.head.sha), "pr-bindung");
  if (event === "pull_request") {
    need(ref === `refs/pull/${PR}/merge` && headRef === BRANCH && pr.state === "open"
      && typeof pr.draft === "boolean" && pr.head.sha === head, "offener-pr-kopf");
  } else if (event === "push") {
    need(ref === "refs/heads/main" && before === BASE && message === MERGE_TITLE
      && pr.state === "closed" && pr.merged === true && pr.merge_commit_sha === head
      && parents.length === 1 && parents[0] === BASE,
    "main-mergebindung");
    need(prHeadTree instanceof Map && prHeadTree.size === headTree?.size
      && [...prHeadTree].every(([file, row]) => same(row, headTree.get(file))), "mergebaum-abweichend");
  } else need(false, "ereignis-unzulaessig");
  for (const [file, blob] of Object.entries(BLOBS))
    need(regular(headTree.get(file)) && headTree.get(file).oid === blob
      && same(headTree.get(file), evidenceTree.get(file)), "runtimeblob-abweichend:" + file);
  for (const file of CI_FILES) need(regular(headTree.get(file)), "ci-datei-ungueltig:" + file);
  for (const file of new Set([...baseTree.keys(), ...evidenceTree.keys(), ...headTree.keys()])) {
    if (Object.hasOwn(BLOBS, file) || CI_FILES.includes(file)) continue;
    if (DOC_FILES.includes(file)) { need(regular(headTree.get(file)), "dokument-ungueltig:" + file); continue; }
    need(same(baseTree.get(file), headTree.get(file)) && same(evidenceTree.get(file), headTree.get(file)),
      "unerwarteter-diff:" + file);
  }
  return { mode: "quellenreadback", reason: "Exakt gebundener JSON-Readback und quittungsgebundenes Ersatzfenster",
    standard: false, core: true, area: false, database: false, browser: false, syntax: true, npm: true,
    quellenreadback: true, source: { repository: REPOSITORY, pr: PR, base: BASE, evidence: EVIDENCE, head },
    execute: ["Gebundener Pruefplan mit Abweisungsfaellen", "Schnellkern", "Gezielter JSON-Speichervertrag, einmalige Ersatzreservierung und HTTP-Integration", "Unveraenderten echten Briefing-Browserbeleg aus PR1240 erhalten"],
    limits: ["Keine Server-/Auth-/UI-/Schema-/Migrations-/Profil-/Geldgrenzenaenderung", "Genau ein Ersatz des belegten nullarbeits Fehlstarts,10/3000/16 additiv, unveraendert1USDTag/30gesamt", "Keine pauschalen DB-/500er-Laeufe"] };
}
function git(args) { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 }); }
function tree(ref) {
  const out = new Map();
  for (const line of git(["ls-tree", "-rz", "--full-tree", ref]).split("\0").filter(Boolean)) {
    const m = /^(\d{6}) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(line);
    need(Boolean(m), "git-baum-unlesbar"); out.set(m[4], { mode: m[1], type: m[2], oid: m[3] });
  }
  return out;
}
function fromCheckout(env = process.env) {
  need(env.GITHUB_EVENT_PATH, "ereignisdatei-fehlt");
  const payload = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const head = git(["rev-parse", "HEAD"]).trim();
  git(["diff", "--quiet", "HEAD", "--"]);
  git(["merge-base", "--is-ancestor", BASE, head]);
  let pr = payload.pull_request;
  if (env.GITHUB_EVENT_NAME === "push") {
    need(Boolean(env.GH_TOKEN), "lesetoken-fehlt");
    pr = JSON.parse(execFileSync("gh", ["api", `repos/${REPOSITORY}/pulls/${PR}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000, env }));
  }
  git(["merge-base", "--is-ancestor", EVIDENCE, pr.head.sha]);
  const result = validate({ event: env.GITHUB_EVENT_NAME, repository: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF, headRef: env.GITHUB_HEAD_REF, before: payload.before,
    message: payload.head_commit?.message?.split("\n")[0], pr, head,
    parents: git(["show", "-s", "--format=%P", head]).trim().split(" "),
    baseTree: tree(BASE), evidenceTree: tree(EVIDENCE), headTree: tree(head),
    ...(env.GITHUB_EVENT_NAME === "push" ? { prHeadTree: tree(pr.head.sha) } : {}) });
  return { ...result, changed: git(["diff", "--name-only", "-z", BASE, head]).split("\0").filter(Boolean) };
}
function main() {
  const args = process.argv.slice(2);
  need(args.length === 2 && args[0] === "--github-output" && Boolean(args[1]), "argumente-ungueltig");
  const p = fromCheckout();
  const keys = ["standard", "core", "area", "database", "browser", "syntax", "npm", "quellenreadback"];
  fs.appendFileSync(args[1], keys.map(k => `${k}=${p[k]}\n`).join("") + `mode=${p.mode}\n`);
  console.log(JSON.stringify(p));
}
module.exports = { REPOSITORY, PR, BRANCH, BASE, EVIDENCE, MERGE_TITLE, BLOBS, CI_FILES, DOC_FILES, validate, tree, fromCheckout };
if (require.main === module) main();
