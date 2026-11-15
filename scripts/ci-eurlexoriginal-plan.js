"use strict";

// Genau die unabhaengig gepruefte Quellenfehlerbehandlung in PR1229. Andere
// Runtime-, SQL-, UI-, Sicherheits- oder Migrationsaenderungen bleiben gesperrt.
// Beide Pflichtjobs bleiben; ausgefuehrt werden Schnellkern und Quellenbereich.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1229;
const BRANCH = "codex/eurlex-originalauszug-live-20261115";
const BASE = "8ad437353cd451a09689a9fd5e407fd936d5bba0";
const EVIDENCE = "02d057fb8333383eea244635bab786d7af35f586";
const MERGE_TITLE = "fix(quellen): amtliche EUR-Lex-Originalauszüge dauerhaft anbinden (#1229)";
const BLOBS = Object.freeze({
  "lib/helmut/briefingContract.js": "36b7b30259a8767faaaeb050ec92db05f77e1a8d",
  "lib/helmut/crawler.js": "46f6f200ea7df463c6fbc6e727d4c3323d603d87",
  "lib/helmut/dedup.js": "9368e6439caddd1daddf5cb4b3a5c560b4b6d96e",
  "lib/helmut/parlamentsdaten-herkunft.js": "5222550a263cd3af7254e34fbbf74bbda8ad9427",
  "lib/helmut/quellen-auszug.js": "0de2db61425e9b33164eda00e857ce5f82c88b5b",
  "lib/helmut/quellen-eurlex-auszug.js": "6a14696c3b2db3240c2c04db1c46b08b9e148a58",
  "lib/helmut/quellen-eurlex-original.js": "804b5147774ceb01f484f6c70be6113d29a71cdb",
  "lib/helmut/quellen-eurlex-transport.js": "c8e5d8a5b8a8ec946cc23ad12d2939b205749541",
  "lib/helmut/quellenarchitektur/abdeckungspruefung.js": "53a8cb81dea4542eb745564dd49b494b9fdecac6",
  "lib/helmut/quellenarchitektur/seeds/parlamentsdaten-quellen.js": "e262a3a33e13be76d4c39c7aa99075a2b8f6ad57",
  "lib/helmut/quellenarchitektur/source-mode.js": "a0f5f46d41bc81abfbb95b38c8311ee3a78dbba8",
  "lib/helmut/scalable-pipeline.js": "7d813eafe65c8ddf3e6994cb088e141164467756",
  "lib/helmut/source-demand.js": "f6b170d6e9e438552b17d4381c812911f7bd51ee",
  "scripts/fixtures/eurlex-original.js": "fb339fa7a22ba417b385199a7c36568b1c05007a",
  "scripts/parlamentsdaten-quellen-test.js": "1b64a8e4fb7c57beea051057b3a7ceda11e553a1",
  "scripts/quellen-eurlex-auszug-test.js": "00f8de6e4449084e71c8cab4ca06a242c7d587a5",
  "scripts/quellen-eurlex-original-test.js": "2ca85f2e38163caddb8aa4f075825674b2d6f416",
  "scripts/quellen-eurlex-transport-test.js": "75d567eab3c6231fb5be727d2ce6d050ceff8c52"
});
const CI_FILES = Object.freeze([".github/workflows/ci.yml", "scripts/ci-eurlexoriginal-plan.js", "scripts/ci-pruefplan-test.js"]);
const DOC_FILES = Object.freeze(["docs/CURRENT_STATE.md", "docs/betrieb/quellen-dauerbetrieb-20261115.md"]);
const sha = s => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("eurlexoriginal-ci:" + reason); }
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
  return { mode: "eurlexoriginal", reason: "Exakt gebundene amtliche EUR-Lex-Originalauszuege mit bestehendem CAS und Originalquote",
    standard: false, core: true, area: false, database: false, browser: false, syntax: true, npm: true,
    eurlexoriginal: true, source: { repository: REPOSITORY, pr: PR, base: BASE, evidence: EVIDENCE, head },
    execute: ["Gebundener Pruefplan mit Abweisungsfaellen", "Schnellkern", "EUR-Lex-Originalreader, Transport, Quellenrechte, Einmalcache, Compiler und betroffene Ausgabe-/Qualitaetsgates"],
    limits: ["Keine Schema-/Migrations-/Auth-/UI-/Budgetaenderung", "Keine neuen Laufrechte, Quote-/Profil-/Cronaenderungen oder Modellaufrufe", "Keine pauschalen DB-/500er-Laeufe"] };
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
  const keys = ["standard", "core", "area", "database", "browser", "syntax", "npm", "eurlexoriginal"];
  fs.appendFileSync(args[1], keys.map(k => `${k}=${p[k]}\n`).join("") + `mode=${p.mode}\n`);
  console.log(JSON.stringify(p));
}
module.exports = { REPOSITORY, PR, BRANCH, BASE, EVIDENCE, MERGE_TITLE, BLOBS, CI_FILES, DOC_FILES, validate, tree, fromCheckout };
if (require.main === module) main();
