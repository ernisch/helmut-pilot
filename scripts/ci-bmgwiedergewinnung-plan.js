"use strict";

// Genau die unabhaengig gepruefte Quellenfehlerbehandlung in PR1227. Andere
// Runtime-, SQL-, UI-, Sicherheits- oder Migrationsaenderungen bleiben gesperrt.
// Beide Pflichtjobs bleiben; ausgefuehrt werden Schnellkern und Quellenbereich.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1227;
const BRANCH = "codex/bmg-originalgewinnung-20261115";
const BASE = "def4214519872d10725380fdb7d2195af72bd715";
const EVIDENCE = "260bc68e77bce44969c97171b7f0f901ffd5c11f";
const MERGE_TITLE = "fix(quellen): BMG-Reden aus gespeicherten Originalen wiedergewinnen (#1227)";
const BLOBS = Object.freeze({
  "lib/helmut/artikelkontext-quellenlayout.js": "38122718dc409726338ecbf55c36e9a1839269d1",
  "lib/helmut/artikelkontext-wiedergewinnung.js": "133dcf968129171de8f52526b6cfc2b6561cf780",
  "scripts/artikelkontext-quellenlayout-test.js": "c24824c3722ca1d1be0ee5a2a661229cc4d69366",
  "scripts/artikel-wiedergewinnung-test.js": "c5a526d58c5d32dd647af94d2612f7f269dc0d44"
});
const CI_FILES = Object.freeze([".github/workflows/ci.yml", "scripts/ci-bmgwiedergewinnung-plan.js", "scripts/ci-pruefplan-test.js"]);
const DOC_FILES = Object.freeze(["docs/CURRENT_STATE.md", "docs/betrieb/quellen-dauerbetrieb-20261115.md"]);
const sha = s => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("bmgwiedergewinnung-ci:" + reason); }
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
  return { mode: "bmgwiedergewinnung", reason: "Exakt gebundene BMG-Pfadkorrektur und reine Archivwiedergewinnung",
    standard: false, core: true, area: false, database: false, browser: false, syntax: true, npm: true,
    bmgwiedergewinnung: true, source: { repository: REPOSITORY, pr: PR, base: BASE, evidence: EVIDENCE, head },
    execute: ["Gebundener Pruefplan mit Abweisungsfaellen", "Schnellkern", "BMG-Artikelkopf und bestehende CAS-Wiedergewinnung ohne neue Abrufe"],
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
  const keys = ["standard", "core", "area", "database", "browser", "syntax", "npm", "bmgwiedergewinnung"];
  fs.appendFileSync(args[1], keys.map(k => `${k}=${p[k]}\n`).join("") + `mode=${p.mode}\n`);
  console.log(JSON.stringify(p));
}
module.exports = { REPOSITORY, PR, BRANCH, BASE, EVIDENCE, MERGE_TITLE, BLOBS, CI_FILES, DOC_FILES, validate, tree, fromCheckout };
if (require.main === module) main();
