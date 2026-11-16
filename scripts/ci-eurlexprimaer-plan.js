"use strict";

// Genau die unabhaengig gepruefte Quellenfehlerbehandlung in PR1234. Andere
// Runtime-, SQL-, UI-, Sicherheits- oder Migrationsaenderungen bleiben gesperrt.
// Beide Pflichtjobs bleiben; ausgefuehrt werden Schnellkern und Quellenbereich.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1234;
const BRANCH = "codex/eurlex-primary-integration-20261116";
const BASE = "a67b44c07e55188357943ced88cd3e1a11398aea";
const EVIDENCE = "6fabc7d6950f95e6f6d111ebbbfc8e2b4f5757ed";
const MERGE_TITLE = "fix(quellen): freigegebene EUR-Lex-Originale vor RSS-Erfolg lesen (#1234)";
const BLOBS = Object.freeze({
  "lib/helmut/crawler.js": "1391a38ce33ca2020abb2ede9b5631c7a054c9a7",
  "lib/helmut/quellen-eurlex-auszug.js": "a8b9734882c6e023f1b96a7de3da0e4a609a4518",
  "scripts/quellen-eurlex-primary-test.js": "1fefac3889ae3aa060cc96744aca893b4ad019d8",
  "scripts/parlamentsdaten-quellen-test.js": "4d27d09699f3945a369c204274f4211b0548b86b"
});
const CI_FILES = Object.freeze([".github/workflows/ci.yml", "scripts/ci-eurlexprimaer-plan.js", "scripts/ci-eurlexprimaer-plan-test.js"]);
const DOC_FILES = Object.freeze(["docs/CURRENT_STATE.md", "docs/betrieb/quellen-netzfrist-20261116.md", "docs/betrieb/quellen-ursachenanalyse-20261116.md"]);
const sha = s => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("eurlexprimaer-ci:" + reason); }
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
      && parents.length === 2 && parents[0] === BASE && parents[1] === pr.head.sha,
    "main-mergebindung");
    need(prHeadTree instanceof Map && prHeadTree.size === headTree?.size
      && [...prHeadTree].every(([file, row]) => same(row, headTree.get(file))), "mergebaum-abweichend");
  } else need(false, "ereignis-unzulaessig");
  for (const [file, blob] of Object.entries(BLOBS))
    need(regular(headTree.get(file)) && headTree.get(file).oid === blob
      && same(headTree.get(file), evidenceTree.get(file)), "quellenblob-abweichend:" + file);
  for (const file of CI_FILES) need(regular(headTree.get(file)), "ci-datei-ungueltig:" + file);
  for (const file of new Set([...baseTree.keys(), ...evidenceTree.keys(), ...headTree.keys()])) {
    if (Object.hasOwn(BLOBS, file) || CI_FILES.includes(file)) continue;
    if (DOC_FILES.includes(file)) { need(regular(headTree.get(file)), "dokument-ungueltig:" + file); continue; }
    need(same(baseTree.get(file), headTree.get(file)) && same(evidenceTree.get(file), headTree.get(file)),
      "unerwarteter-diff:" + file);
  }
  return { mode: "eurlexprimaer", reason: "Exakt gebundener amtlicher EUR-Lex-Originalweg vor RSS-Frueherfolg",
    standard: false, core: true, area: false, database: false, browser: false, syntax: true, npm: true,
    eurlexprimaer: true, source: { repository: REPOSITORY, pr: PR, base: BASE, evidence: EVIDENCE, head },
    execute: ["Gebundener Pruefplan mit Abweisungsfaellen", "Schnellkern", "Gezielte amtliche Dispatch-, Rechte-, Original- und Abbruchvertraege"],
    limits: ["Keine Schema-/Migrations-/Auth-/UI-/Budgetaenderung", "Keine neuen Laufrechte, Aktivierungen, Volltexte oder Modellaufrufe", "Keine pauschalen DB-/500er-Laeufe"] };
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
  git(["merge-base", "--is-ancestor", EVIDENCE, head]);
  let pr = payload.pull_request;
  if (env.GITHUB_EVENT_NAME === "push") {
    need(Boolean(env.GH_TOKEN), "lesetoken-fehlt");
    pr = JSON.parse(execFileSync("gh", ["api", `repos/${REPOSITORY}/pulls/${PR}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000, env }));
  }
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
  const keys = ["standard", "core", "area", "database", "browser", "syntax", "npm", "eurlexprimaer"];
  fs.appendFileSync(args[1], keys.map(k => `${k}=${p[k]}\n`).join("") + `mode=${p.mode}\n`);
  console.log(JSON.stringify(p));
}
module.exports = { REPOSITORY, PR, BRANCH, BASE, EVIDENCE, MERGE_TITLE, BLOBS, CI_FILES, DOC_FILES, validate, tree, fromCheckout };
if (require.main === module) main();
