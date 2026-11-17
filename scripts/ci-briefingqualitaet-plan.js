"use strict";

// Exakt gebundene DIP-/Destatis-Quellenreparatur PR1249.
// Beide Pflichtjobs bleiben. Unveraenderte Browser-/UI-Belege aus PR1246 erhalten;
// Runtime-/Testblobs und unveraenderter restlicher Baum sind geschlossen gebunden.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot", PR = 1249;
const BRANCH = "codex/quellenabdeckung-20261117";
const BASE = "7d55e40cbb943d0397bcbb9f1b76818638cb4e0b";
const EVIDENCE = "899119de889eaae54a78fa017b685bc15e79a828";
const MERGE_TITLE = "fix(quellen): DIP-Stellvertretungen und amtliche Destatis-RSS-Fassungen erhalten (#1249)";
const BLOBS = Object.freeze({
  "lib/helmut/dip.js": "0712ea6fd79bad499a75fd30721f6029de5d433c",
  "lib/helmut/crawler.js": "717d6e1b74b70f2f573c4fbf5d0bf4b73b8943c5",
  "lib/helmut/dedup.js": "5738e348981cab5d8303cca518fe72bf18fa6e10",
  "lib/helmut/quellen-destatis-rss-stand.js": "fb04b14fb394ed96cb3d1f013191e07d16738e1a",
  "lib/helmut/quellen-hinweis.js": "b7f185656bc555efe78fcc5a50466b7f9d344677",
  "lib/helmut/quellenarchitektur/dedup-global.js": "f7f6e2b22438acf8b16243bec2e3406be245be75",
  "lib/helmut/storage.js": "935e9c59ac5b6c189df498cdd38b4268924a72dd",
  "scripts/dip-vorgangsfakten-profil-test.js": "ef140cd5de7341f03113349c34219e989aa6a9cb",
  "scripts/quellen-destatis-rss-stand-test.js": "095620c886cfbe74773a1de2cdce6a1f3f0b0965",
  "scripts/fach-parteiquellen-test.js": "931a9b20dbac9b95c425e4c7563aae29c966a7fd"
});
const CI_FILES = Object.freeze([".github/workflows/ci.yml", "scripts/ci-briefingqualitaet-plan.js", "scripts/ci-briefingqualitaet-plan-test.js"]);
const DOC_FILES = Object.freeze(["docs/CURRENT_STATE.md", "docs/betrieb/quellenbedarf-20261117.md"]);
const sha = s => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("quellenbedarf-ci:" + reason); }
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
  return { mode: "quellenbedarf", reason: "Exakt gebundene DIP-/Destatis-Quellenreparatur mit nativen Speicher-/DTO-Belegen",
    standard: false, core: true, area: false, database: false, browser: false, syntax: true, npm: true,
    quellenbedarf: true, source: { repository: REPOSITORY, pr: PR, base: BASE, evidence: EVIDENCE, head },
    execute: ["Gebundener Pruefplan mit Abweisungsfaellen", "Schnellkern", "Gezielte DIP-/RSS-/Dedup-/Herkunftsvertraege", "Unveraenderten echten Desktop-/Mobilbeleg aus PR1246 wiederverwenden"],
    limits: ["Nur DIP-Profilfilter und geschlossene lizenzierte RSS-Fassung; keine Auth-/UI-/Schema-/Profil-/Geldgrenzenaenderung", "Kein neuer Modell-/Quellenlauf, keine Altzeilenkorrektur oder Erfindung fehlender Belege", "Keine pauschalen DB-/500er-Laeufe"] };
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
  const keys = ["standard", "core", "area", "database", "browser", "syntax", "npm", "quellenbedarf"];
  fs.appendFileSync(args[1], keys.map(k => `${k}=${p[k]}\n`).join("") + `mode=${p.mode}\n`);
  console.log(JSON.stringify(p));
}
module.exports = { REPOSITORY, PR, BRANCH, BASE, EVIDENCE, MERGE_TITLE, BLOBS, CI_FILES, DOC_FILES, validate, tree, fromCheckout };
if (require.main === module) main();
