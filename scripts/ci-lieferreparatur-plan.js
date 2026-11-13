"use strict";

// Einmaliger automatischer PR-Pruefplan fuer den unabhaengig geprueften
// Einprofil-Reparaturstand. Kein Branchname allein kann Nachweise ersetzen.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const REPOSITORY = "ernisch/helmut-pilot";
const BASE = "597d7876d3f1ce963174fe749ffb28bd98f15065";
const BRANCH = "codex/einprofil-lieferfaehigkeit-20261113";
const PR = 1184;
const LOCAL_EVIDENCE_COMMIT = "80b80ee8fbafbd65a726dfb90e540c785cc01a72";
const LOCAL_EVIDENCE_PATH = "docs/betrieb/verarbeitungskern-100-20261113.md";
const RUNTIME_FILES = Object.freeze([
  "lib/helmut/admin-ergebnisstand.js", "lib/helmut/briefing-speicher.js",
  "lib/helmut/publication-eligibility.js", "lib/helmut/quellen-automatik.js"
]);
const REGRESSION_FILES = Object.freeze([
  "scripts/publication-eligibility-jsonb-test.js", "scripts/quellen-automatik-tagesfortsetzung-test.js",
  "scripts/tagespaket-ruhelage-test.js"
]);
const BLOBS = Object.freeze({
  "docs/CURRENT_STATE.md": "43a9119cf7805aac20dae017307a271324355606",
  "docs/betrieb/verarbeitungskern-100-20261113.md": "4300f83d1d46854d69582c45a5fc89f58f16d1fc",
  "lib/helmut/admin-ergebnisstand.js": "0249b1774ef73fbb2d2aea5b19177fb8565e80e8",
  "lib/helmut/briefing-speicher.js": "a29cadf29b276291dbd2636d51272637a02ff1e8",
  "lib/helmut/publication-eligibility.js": "3da807cec654fd88993d01711a0b4981b2756fba",
  "lib/helmut/quellen-automatik.js": "192d7719227c5407b5f7f4b40fd3777d70e31897",
  "scripts/browser-smoke-test.js": "6c02aa995c5f62066c6b741590d7324efc4c8707",
  "scripts/publication-eligibility-jsonb-test.js": "048574fc61b5259fee6f6125483baeaa0ac28184",
  "scripts/quellen-automatik-tagesfortsetzung-test.js": "f413f2bbbade1c0fd6837915e76d61910d59ada5",
  "scripts/tagespaket-ruhelage-test.js": "658bb6e435b95467eb0989311181720275d9e31d",
  "vercel.json": "c53a0a0f3b214102665325cf02b6ca39c527d7de"
});
// Zweites festes Profil: nur der separat abgenommene DIP-Einzelartikelfix.
const DIP = Object.freeze({
  PR: 1185, BASE: "73b34b02c7690656191a5d45d5efd32c954ff771",
  BRANCH: "codex/dip-einzelartikel-20261113", LOCAL_EVIDENCE_COMMIT: "6797d89159de7b8fd56a0e0e932663176fa81e2b",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze(["lib/helmut/scalable-pipeline.js"]),
  REGRESSION_FILES: Object.freeze(["scripts/dip-einzelartikel-isolation-test.js"]),
  BLOBS: Object.freeze({
    "docs/CURRENT_STATE.md": "1e1a694fabcfd6eac8871a2241956253d9fe08c9",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "fc916dff904a474c26e5f47498b8daf8f04f8845",
    "lib/helmut/scalable-pipeline.js": "7261b5a21fd58aeefb47c9d6657e6162c13556ac",
    "scripts/dip-einzelartikel-isolation-test.js": "4e47a94a34fcc5491be0dbc311886b300096df87",
    "vercel.json": "ff6ca830a085f9df582cc719a2802700d4ef8622"
  })
});
// Drittes festes Profil: nur die separat abgenommene begrenzte Mandatsphase.
const MANDAT = Object.freeze({
  PR: 1186, BASE: "cc283e0bae8ed7b9f25c551379a9ee1f8895a91c",
  BRANCH: "codex/mandatsarbeit-vorrang-20261113", LOCAL_EVIDENCE_COMMIT: "12f275eb801a1a46cd6c36399535b1e357937a7c",
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES: Object.freeze(["lib/helmut/worker-betrieb.js"]),
  REGRESSION_FILES: Object.freeze(["scripts/worker-mandatsphase-test.js"]),
  BLOBS: Object.freeze({
    "docs/CURRENT_STATE.md": "e3dd365950b904c64e89b28ac62657847eceaada",
    "docs/betrieb/verarbeitungskern-100-20261113.md": "6f7bb98c16b19f7b39d82364c682cd80e47b5790",
    "lib/helmut/worker-betrieb.js": "9631b255e642dfcd29115207681c4fd33663aeb7",
    "scripts/worker-mandatsphase-test.js": "b78687866436ddaecf170d56ce5b8a682741b88f",
    "vercel.json": "b2ac9375c5e3de8671faa6781ddec7f2c1004126"
  })
});
const EINPROFIL = Object.freeze({ PR, BASE, BRANCH, LOCAL_EVIDENCE_COMMIT,
  LOCAL_EVIDENCE_PATH, RUNTIME_FILES, REGRESSION_FILES, BLOBS });
const profileFor = ({ prNumber, headRef }) => prNumber === MANDAT.PR || headRef === MANDAT.BRANCH ? MANDAT
  : prNumber === DIP.PR || headRef === DIP.BRANCH ? DIP : EINPROFIL;
const CI_FILES = Object.freeze([
  ".github/workflows/ci.yml", "scripts/ci-lieferreparatur-plan.js",
  "scripts/ci-lieferreparatur-plan-test.js"
]);
const OUTPUTS = Object.freeze(["standard", "core", "area", "database", "browser", "syntax", "npm", "verarbeitungskern", "lieferreparatur", "dipartikelisolation", "mandatsarbeitvorrang"]);
const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const same = (a, b) => a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid;
function need(ok, reason) { if (!ok) throw Error("lieferreparatur-ci:" + reason); }

function validate({ event, repository, ref, headRef, baseRef, prNumber, pr, checkedOutHead, baseTree, headTree, evidenceTree }) {
  const profile = profileFor({ prNumber, headRef }), dip = profile === DIP, mandat = profile === MANDAT;
  const { PR, BASE, BRANCH, LOCAL_EVIDENCE_COMMIT, LOCAL_EVIDENCE_PATH,
    RUNTIME_FILES, REGRESSION_FILES, BLOBS } = profile;
  need(Number.isSafeInteger(PR) && PR > 0 && sha(LOCAL_EVIDENCE_COMMIT)
    && LOCAL_EVIDENCE_PATH.startsWith("docs/") && sha(BLOBS[LOCAL_EVIDENCE_PATH])
    && RUNTIME_FILES.length === (dip || mandat ? 1 : 4) && REGRESSION_FILES.length === (dip || mandat ? 1 : 3)
    && [...RUNTIME_FILES, ...REGRESSION_FILES, ...(dip || mandat ? [] : ["scripts/browser-smoke-test.js"])].every(file => sha(BLOBS[file])), "belegbindung-fehlt");
  need(event === "pull_request" && repository === REPOSITORY, "pr-ereignis-repository");
  need(ref === `refs/pull/${PR}/merge` && headRef === BRANCH && baseRef === "main"
    && prNumber === PR && pr?.number === PR && pr.state === "open" && typeof pr.draft === "boolean"
    && pr.base?.sha === BASE && pr.base.ref === "main" && pr.base.repo?.full_name === REPOSITORY
    && pr.head?.ref === BRANCH && pr.head.repo?.full_name === REPOSITORY, "pr-bindung");
  need(sha(checkedOutHead) && pr.head.sha === checkedOutHead, "checkout-kopf-abweichend");
  need([baseTree, headTree, evidenceTree].every(t => t instanceof Map && t.size > 0), "baum-fehlt");
  for (const file of CI_FILES) {
    const row = headTree.get(file);
    need(row?.mode === "100644" && row.type === "blob" && sha(row.oid), "ci-datei-ungueltig:" + file);
  }
  for (const [file, blob] of Object.entries(BLOBS)) {
    need(!CI_FILES.includes(file) && sha(blob), "blobvertrag-ungueltig:" + file);
    const row = headTree.get(file), evidence = evidenceTree.get(file);
    need(row?.mode === "100644" && row.type === "blob" && row.oid === blob, "abnahmeblob-abweichend:" + file);
    need(same(row, evidence), "lokaler-belegbaum-abweichend:" + file);
  }
  for (const file of new Set([...baseTree.keys(), ...headTree.keys(), ...evidenceTree.keys()])) {
    if (CI_FILES.includes(file) || Object.hasOwn(BLOBS, file)) continue;
    need(same(baseTree.get(file), headTree.get(file)), "unerwarteter-diff:" + file);
    need(same(evidenceTree.get(file), headTree.get(file)), "lokale-abhaengigkeit-abweichend:" + file);
  }
  const changed = [...new Set([...baseTree.keys(), ...headTree.keys()])]
    .filter(file => !same(baseTree.get(file), headTree.get(file))).sort();
  const mode = mandat ? "mandatsarbeitvorrang" : dip ? "dipartikelisolation" : "lieferreparatur";
  return {
    mode,
    reason: mandat ? "Exakte begrenzte Mandatsphase ohne Reader- oder Datenbankaenderung"
      : dip ? "Exakte DIP-Einzelartikelisolation ohne Browser- oder Datenbankaenderung"
      : "Exakter Einprofil-Reparaturstand mit gebundenen lokalen Nachweisen",
    ...Object.fromEntries(OUTPUTS.map(key => [key, key === mode])), changed,
    source: { repository: REPOSITORY, pr: PR, base: BASE, head: checkedOutHead },
    reused: dip || mandat ? { status: mandat
      ? "Browser bewusst nicht erneut ausgefuehrt; Eingaben ausser Mandatsworker unveraendert"
      : "Browser bewusst nicht erneut ausgefuehrt; Eingaben ausser Quellenhandler unveraendert",
      urls: ["https://github.com/ernisch/helmut-pilot/actions/runs/43512468427",
        "https://github.com/ernisch/helmut-pilot/actions/runs/43511072972/job/132181165997"] }
      : { status: "WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT", cases: 24,
      commit: LOCAL_EVIDENCE_COMMIT,
      url: `https://github.com/${REPOSITORY}/blob/${LOCAL_EVIDENCE_COMMIT}/${LOCAL_EVIDENCE_PATH}` },
    execute: mandat ? ["Nur neue Mandatsphasen-Profil-Gegenfaelle", "Eine neue begrenzte Workerregression",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien"]
      : dip ? ["Nur neue DIP-Profil-Gegenfaelle", "Eine neue DIP-Einzelartikelregression",
      "Syntax der tatsaechlich geaenderten JavaScriptdateien"]
      : ["Betroffene CI-Zeilenankergruppe", "Syntax der tatsaechlich geaenderten JavaScriptdateien",
        "Nur zwei betroffene Ruhelage-Browserfaelle auf Desktop und Mobil"]
  };
}
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 });
}
function tree(ref) {
  const rows = new Map();
  for (const line of git(["ls-tree", "-rz", "--full-tree", ref]).split("\0").filter(Boolean)) {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(line);
    need(Boolean(match), "git-baum-unlesbar");
    rows.set(match[4], { mode: match[1], type: match[2], oid: match[3] });
  }
  return rows;
}
function fromCheckout(env = process.env) {
  need(env.GITHUB_EVENT_PATH && env.GITHUB_EVENT_NAME === "pull_request", "pr-metadaten-fehlen");
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  need(event.repository?.full_name === REPOSITORY, "ereignis-repository-abweichend");
  const profile = profileFor({ prNumber: event.number, headRef: env.GITHUB_HEAD_REF });
  const checkedOutHead = git(["rev-parse", "HEAD"]).trim();
  git(["diff", "--quiet", "HEAD", "--"]);
  git(["merge-base", "--is-ancestor", profile.BASE, checkedOutHead]);
  git(["merge-base", "--is-ancestor", profile.LOCAL_EVIDENCE_COMMIT, checkedOutHead]);
  return validate({ event: env.GITHUB_EVENT_NAME, repository: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF, headRef: env.GITHUB_HEAD_REF, baseRef: env.GITHUB_BASE_REF,
    prNumber: event.number, pr: event.pull_request, checkedOutHead,
    baseTree: tree(profile.BASE), headTree: tree(checkedOutHead), evidenceTree: tree(profile.LOCAL_EVIDENCE_COMMIT) });
}
function main() {
  const args = process.argv.slice(2);
  need(args.length === 1 && args[0] === "--syntax"
    || args.length === 2 && args[0] === "--github-output" && Boolean(args[1]), "argumente-ungueltig");
  const result = fromCheckout();
  if (args[0] === "--syntax") {
    for (const file of result.changed.filter(f => f.endsWith(".js"))) {
      execFileSync(process.execPath, ["--check", file], { stdio: "inherit", timeout: 10000 });
      console.log("Syntax OK: " + file);
    }
  } else {
    fs.appendFileSync(args[1], OUTPUTS.map(key => `${key}=${result[key]}\n`).join("") + `mode=${result.mode}\n`);
    console.log(JSON.stringify(result));
  }
}
module.exports = { REPOSITORY, BASE, BRANCH, PR, LOCAL_EVIDENCE_COMMIT, LOCAL_EVIDENCE_PATH,
  RUNTIME_FILES, REGRESSION_FILES, BLOBS, DIP, MANDAT, CI_FILES, OUTPUTS, validate, fromCheckout };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
