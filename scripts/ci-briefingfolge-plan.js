"use strict";

// Genau die unabhaengig gepruefte quittungsgebundene Briefing-Teilstandprojektion in PR1240. Andere
// Runtime-, SQL-, UI-, Sicherheits- oder Migrationsaenderungen bleiben gesperrt.
// Beide Pflichtjobs bleiben; Schnellkern, betroffene Radar-/Pakettests und echter gezielter Browserfall.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1240;
const BRANCH = "codex/briefing-ausfall-20261116";
const BASE = "416cb7975f82418473266a6a7f231420128831a0";
const EVIDENCE = "dcbe803d5b9aa2729898349f84199b719e3e2be7";
const MERGE_TITLE = "fix(briefing): geprüften Teilstand nach späterem Tagespaket anzeigen (#1240)";
const BLOBS = Object.freeze({
  "client.js": "804e57f5335134f38361ccafe441e232e6c3260e",
  "lib/helmut/tagespaket-auslieferung.js": "f33ddae3e8a40b2d4dee0f48cea4aff74bde1df0",
  "scripts/briefing-gepruefter-teilstand-test.js": "330a5edc54f6c8f74354566c99b9094f344d8223",
  "scripts/browser-smoke-test.js": "00aea9254053821869e10f9dd237f75ba5650632",
  "server.js": "b517a06c8e9d48cb0cda3dbe498798a008e8dd1a"
});
const CI_FILES = Object.freeze([".github/workflows/ci.yml", "scripts/ci-briefingfolge-plan.js", "scripts/ci-briefingfolge-plan-test.js"]);
const DOC_FILES = Object.freeze(["docs/CURRENT_STATE.md", "docs/betrieb/briefing-folgepaket-20261116.md"]);
const sha = s => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("briefingfolge-ci:" + reason); }
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
  return { mode: "briefingfolge", reason: "Exakt gebundene Briefing-Teilstandauslieferung mit bestaetigtem Morgen-Vorgaenger",
    standard: false, core: true, area: false, database: false, browser: true, syntax: true, npm: true,
    briefingfolge: true, source: { repository: REPOSITORY, pr: PR, base: BASE, evidence: EVIDENCE, head },
    execute: ["Gebundener Pruefplan mit Abweisungsfaellen", "Schnellkern", "Gezielte bestehende Teilstand-, Frische-, Fenster- und Auslieferungsvertraege", "Echter Briefing-Browserfall Desktop und Mobil"],
    limits: ["Keine Schema-/Migrations-/Auth-/Profil-/Budgetaenderung", "Keine neuen Laufrechte, Quellen, Profilwrites oder Modellaufrufe; gespeicherte Hashes erhalten", "Keine pauschalen DB-/500er-Laeufe"] };
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
  const keys = ["standard", "core", "area", "database", "browser", "syntax", "npm", "briefingfolge"];
  fs.appendFileSync(args[1], keys.map(k => `${k}=${p[k]}\n`).join("") + `mode=${p.mode}\n`);
  console.log(JSON.stringify(p));
}
module.exports = { REPOSITORY, PR, BRANCH, BASE, EVIDENCE, MERGE_TITLE, BLOBS, CI_FILES, DOC_FILES, validate, tree, fromCheckout };
if (require.main === module) main();
