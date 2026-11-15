"use strict";

// Genau die unabhaengig gepruefte Quellenfehlerbehandlung in PR1225. Andere
// Runtime-, SQL-, UI-, Sicherheits- oder Migrationsaenderungen bleiben gesperrt.
// Beide Pflichtjobs bleiben; ausgefuehrt werden Schnellkern und Quellenbereich.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1225;
const BRANCH = "codex/quellen-dauerhaft-20261115";
const BASE = "dfe311b6c75cb1e2d21f416ea4afa76c08dc74e2";
const EVIDENCE = "ae58b9b7bb070018437be523cea4beb9bcd11111";
const MERGE_TITLE = "fix(quellen): Wiederholungen und offiziellen EUR-Lex-Ersatz dauerhaft absichern (#1225)";
const BLOBS = Object.freeze({
  "lib/helmut/crawler.js": "47fcf0b82801b80f97ad3f451e7054daafa03085",
  "lib/helmut/parlamentsdaten-herkunft.js": "cdd02d0be99d15207f7a11c8f0045ab5e9605558",
  "lib/helmut/quellen-eurlex-cellar.js": "d74bb12196672f3cb62c3b3746127f0d4ef055a3",
  "lib/helmut/scalable-pipeline.js": "7d7573d8b2ceb84674f4991ef0c69d4ee0ce2f0f",
  "lib/helmut/source-telemetry.js": "6b9e6082c8f1c6bc0ff136a2efabc7681c712ef7",
  "scripts/crawler-hardening-test.js": "4c845444c2a8cff9fd001ff0a0ffe00df7e57d4c",
  "scripts/fixtures/parlamentsdaten-20261106/cellar-oj-l-metadaten.json": "060b8d938c7529324b15d5abc1c46e83003cf3f6",
  "scripts/parlamentsdaten-quellen-test.js": "9f8e6b9b8d7aa8067fbbdd89dc556d879e796afb",
  "scripts/quellen-eurlex-cellar-test.js": "2c4a25cac77890d5053e9e1ad4ce06dcec2efe84",
  "scripts/source-telemetry-test.js": "498ab83730ae602764b24bcb89afe5bb28e80970"
});
const CI_FILES = Object.freeze([".github/workflows/ci.yml", "scripts/ci-quellendauerbetrieb-plan.js", "scripts/ci-pruefplan-test.js"]);
const DOC_FILES = Object.freeze(["docs/CURRENT_STATE.md", "docs/betrieb/quellen-dauerbetrieb-20261115.md"]);
const sha = s => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("quellendauerbetrieb-ci:" + reason); }
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
  return { mode: "quellendauerbetrieb", reason: "Exakt gebundene Quellenfehlerbehandlung und offizieller Metadatenersatz",
    standard: false, core: true, area: false, database: false, browser: false, syntax: true, npm: true,
    quellendauerbetrieb: true, source: { repository: REPOSITORY, pr: PR, base: BASE, evidence: EVIDENCE, head },
    execute: ["Gebundener Pruefplan mit Abweisungsfaellen", "Schnellkern", "Gezielte bestehende Quellen-, Queue-, Herkunfts- und Parservertraege"],
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
  const keys = ["standard", "core", "area", "database", "browser", "syntax", "npm", "quellendauerbetrieb"];
  fs.appendFileSync(args[1], keys.map(k => `${k}=${p[k]}\n`).join("") + `mode=${p.mode}\n`);
  console.log(JSON.stringify(p));
}
module.exports = { REPOSITORY, PR, BRANCH, BASE, EVIDENCE, MERGE_TITLE, BLOBS, CI_FILES, DOC_FILES, validate, tree, fromCheckout };
if (require.main === module) main();
