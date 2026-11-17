"use strict";

// Exakt gepruefte zentrale Briefingqualifikation und gebundene Cacheausgabe PR1246.
// Beide Pflichtjobs bleiben. Neuer gezielter Chromiumlauf fuer die geaenderte Anzeige;
// Runtime-/Testblobs und unveraenderter restlicher Baum sind geschlossen gebunden.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1246;
const BRANCH = "codex/briefing-qualitaet-20261117";
const BASE = "1587d0fee65ea60488cf9bee3d2eb84fd72df0f8";
const EVIDENCE = "6d6d07e7bdb27e7385dae07c014b8b450fee9688";
const MERGE_TITLE = "fix(briefing): Tagesprioritäten an Mandat und belegten Handlungsanlass binden (#1246)";
const BLOBS = Object.freeze({
  "client.js": "10cc9c0012d3cf7dc7fc14af691a97db48eb3da7",
  "lib/helmut/briefing-bereichsvertrag.js": "b59e0633b1536c44098f32dc3086bc4875e790d5",
  "lib/helmut/briefingContract.js": "8da1e01b5cb3b9365683935ae1aa60f549025abd",
  "lib/helmut/tagespaket-auslieferung.js": "9da6c1d42938276918b9613a24706480890baf30",
  "scripts/briefing-bereichsvertrag-test.js": "a6bbde50b03361c222f95127db39af04992dcbae",
  "scripts/briefing-orientierung-test.js": "d6ba43706cf0f85a26f1085ae8ce42660b0b797c",
  "scripts/tagespaket-auslieferung-test.js": "606d97a8e2917b17da33d6b6f1b72470e834bece",
  "scripts/browser-smoke-test.js": "bb0c1bda32095e22ae10766aad099d2ec50afa4a",
  "scripts/quellenpflicht-vertrag-test.js": "2a83c313b5fb4e4f434cf28d35519b80f8571d30"
});
const CI_FILES = Object.freeze([".github/workflows/ci.yml", "scripts/ci-briefingqualitaet-plan.js", "scripts/ci-briefingqualitaet-plan-test.js"]);
const DOC_FILES = Object.freeze(["docs/CURRENT_STATE.md", "docs/betrieb/quellen-abnahme-20261117.md", "docs/betrieb/briefing-qualitaet-20261117.md"]);
const sha = s => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("briefingqualitaet-ci:" + reason); }
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
  return { mode: "briefingqualitaet", reason: "Exakt gebundene Mandats-/Anlassqualifikation mit Cache- und Browsernachweis",
    standard: false, core: true, area: false, database: false, browser: true, syntax: true, npm: true,
    briefingqualitaet: true, source: { repository: REPOSITORY, pr: PR, base: BASE, evidence: EVIDENCE, head },
    execute: ["Gebundener Pruefplan mit Abweisungsfaellen", "Schnellkern", "Gezielte Quellen-/Mandatsqualifikation, Tagesrangfolge und Paketlesevertraege", "Neuer Desktop-/Mobilnachweis Briefingqualitaet im vorhandenen Chromiumharness"],
    limits: ["Keine Server-/Auth-/Schema-/Migrations-/Profil-/Geldgrenzenaenderung", "Kein neuer Modell-/Quellenlauf, keine Persistenzkorrektur oder Erfindung fehlender Belege", "Keine pauschalen DB-/500er-Laeufe"] };
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
  const keys = ["standard", "core", "area", "database", "browser", "syntax", "npm", "briefingqualitaet"];
  fs.appendFileSync(args[1], keys.map(k => `${k}=${p[k]}\n`).join("") + `mode=${p.mode}\n`);
  console.log(JSON.stringify(p));
}
module.exports = { REPOSITORY, PR, BRANCH, BASE, EVIDENCE, MERGE_TITLE, BLOBS, CI_FILES, DOC_FILES, validate, tree, fromCheckout };
if (require.main === module) main();
