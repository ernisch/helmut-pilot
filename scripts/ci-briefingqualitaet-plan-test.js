"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),{spawnSync}=require("node:child_process");
const Q=require("./ci-briefingqualitaet-plan");
let pass=0;function check(name,fn){fn();pass++;console.log("PASS "+name);}
function sourceFixture(push = false, profile = Q) {
  const row = oid => ({ mode: "100644", type: "blob", oid });
  const baseTree = new Map([["server.js", row("a".repeat(40))], ["client.js", row("b".repeat(40))],
    ["supabase/migrations/unveraendert.sql", row("c".repeat(40))]]);
  for (const file of Object.keys(profile.BLOBS)) baseTree.set(file, row("d".repeat(40)));
  const evidenceTree = new Map(baseTree);
  for (const [file, hash] of Object.entries(profile.BLOBS)) evidenceTree.set(file, row(hash));
  const headTree = new Map(evidenceTree);
  for (const file of profile.CI_FILES) headTree.set(file, row("e".repeat(40)));
  const branchHead = "f".repeat(40), head = push ? "9".repeat(40) : branchHead;
  return { event: push ? "push" : "pull_request", repository: profile.REPOSITORY,
    ref: push ? "refs/heads/main" : `refs/pull/${profile.PR}/merge`, headRef: push ? undefined : profile.BRANCH,
    head, before: profile.BASE, message: profile.MERGE_TITLE,
    pr: { number: profile.PR, state: push ? "closed" : "open", draft: false, merged: push,
      merge_commit_sha: push ? head : null,
      base: { sha: profile.BASE, ref: "main", repo: { full_name: profile.REPOSITORY } },
      head: { sha: branchHead, ref: profile.BRANCH, repo: { full_name: profile.REPOSITORY } } },
    parents: push ? [profile.BASE] : [profile.EVIDENCE], baseTree, evidenceTree, headTree,
    prHeadTree: push ? new Map(headTree) : undefined };
}
check("nur gebundener Quellenbedarf-Kopf mit Kern und gezielten Gruppen",()=>{
 const p=Q.validate(sourceFixture());assert.equal(p.mode,"quellenbedarf");assert(p.core&&p.syntax&&p.npm&&p.quellenbedarf);
 assert.equal(p.browser,false);
 for(const k of ["standard","area","database"])assert.equal(p[k],false);
});
for(const [name,mutate] of [
 ["repo",f=>f.repository="fremd/repo"],["PR",f=>f.pr.number++],["branch",f=>f.pr.head.ref="fremd"],
 ["base",f=>f.pr.base.sha="1".repeat(40)],["head",f=>f.head="2".repeat(40)],
 ["dispatch",f=>f.event="workflow_dispatch"],["runtime",f=>f.headTree.delete(Object.keys(Q.BLOBS)[0])],
 ["evidence",f=>f.evidenceTree.delete(Object.keys(Q.BLOBS)[0])],
 ["auth",f=>f.headTree.set("lib/helmut/auth.js",{mode:"100644",type:"blob",oid:"3".repeat(40)})],
 ["ui",f=>f.headTree.delete("client.js")],["migration",f=>f.headTree.delete("supabase/migrations/unveraendert.sql")],
 ["symlink",f=>f.headTree.set(Q.CI_FILES[1],{mode:"120000",type:"blob",oid:"4".repeat(40)})],
 ["fremdfile",f=>f.headTree.set("unbekannt.js",{mode:"100644",type:"blob",oid:"5".repeat(40)})]
])check(name+" wird abgewiesen",()=>{const f=sourceFixture();mutate(f);assert.throws(()=>Q.validate(f),/quellenbedarf-ci:/);});
check("jeder Laufzeit- und Testblob gebunden",()=>{for(const file of Object.keys(Q.BLOBS)){
 const f=sourceFixture();f.headTree.set(file,{mode:"100644",type:"blob",oid:"0".repeat(40)});
 assert.throws(()=>Q.validate(f),/quellenbedarf-ci:/);
}});
check("nur echter normaler Mainmerge mit identischem Baum",()=>{
 assert.equal(Q.validate(sourceFixture(true)).mode,"quellenbedarf");
 for(const mutate of [f=>f.message="fremd",f=>f.parents=["8".repeat(40)],f=>f.prHeadTree.delete("server.js"),f=>f.before="1".repeat(40),f=>f.pr.merged=false]){
  const f=sourceFixture(true);mutate(f);assert.throws(()=>Q.validate(f),/quellenbedarf-ci:/);
 }
});
check("beide Selektoren identisch und ohne breiten Fehler-Rueckfall",()=>{
 const w=fs.readFileSync(".github/workflows/ci.yml","utf8");
 const blocks=[...w.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1250 \][\s\S]*?\n          fi/g)].map(x=>x[0]);
 assert.equal(blocks.length,2);assert.equal(blocks[0],blocks[1]);
 const script=`set -e
 git(){ case "$1" in log) printf '%s' "$MSG";;rev-parse) printf '%s' "$PARENT";;merge-base) return "$ANCESTOR";;*) return 99;;esac; }
 node(){ printf GUARD; return 23; }
 ${blocks[0]}
 printf BROAD`;
 const run=(msg,parent,ancestor,extra={})=>spawnSync("bash",["-c",script],{encoding:"utf8",env:{PATH:process.env.PATH,GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/heads/main",GITHUB_OUTPUT:"/dev/null",MSG:msg,PARENT:parent,ANCESTOR:String(ancestor),...extra}});
 for(const msg of [Q.MERGE_TITLE,"Merge pull request #1250","fehlerhafter Betreff"]){const r=run(msg,Q.BASE,0);assert.equal(r.status,23,r.stderr);assert.equal(r.stdout,"GUARD");}
 for(const msg of ["fremd","spaeterer Commit"]){const r=run(msg,"8".repeat(40),1);assert.equal(r.status,0);assert.equal(r.stdout,"BROAD");}
 const pr=run("x","8".repeat(40),1,{GITHUB_EVENT_NAME:"pull_request",HELMUT_CI_PR_NUMBER:"1250"});assert.equal(pr.status,23);assert.equal(pr.stdout,"GUARD");
 const branch=run("x","8".repeat(40),1,{GITHUB_EVENT_NAME:"pull_request",HELMUT_CI_PR_HEAD_REF:Q.BRANCH});assert.equal(branch.status,23);assert.equal(branch.stdout,"GUARD");
 assert.match(w,/name: Native automation boundary qualification \(synthetic\)\n[^\n]+steps\.plan\.outputs\.quellenbedarf != 'true'/);
 const step=w.split("      - name: Quellenbedarf -")[1].split("      - name: Quellenreadback -")[0];
 for(const name of ["quellen-destatis-rss-stand"])assert(step.includes("scripts/"+name+"-test.js"));
 assert(!/source-demand|--extended|Mock100|Mock500|morgen-paketnachweis/.test(step));
 const browser=w.split("      - name: Quellenbedarf - gebundenen")[1].split("      - name: Quellenreadback -")[0];
 assert.match(browser,/44065530896\/job\/133978126070/);
 assert.match(browser,/kein neuer Chromiumlauf/i);
 assert(!browser.includes("run: node scripts/lokal.js -- node scripts/browser-smoke-test.js"));

});
const D = require("./ci-destatisanzeige-plan");
check("Destatisanzeige behaelt beide Pflichtjobs, Schnellkern und echte Browserpruefung", () => {
  for (const push of [false, true]) {
    const p = D.validate(sourceFixture(push, D));
    assert.equal(p.mode, "destatisanzeige");
    for (const k of ["core", "browser", "syntax", "npm", "destatisanzeige"]) assert.equal(p[k], true);
    for (const k of ["standard", "area", "database"]) assert.equal(p[k], false);
  }
});
for (const [name, mutate] of [
  ["repo", f => f.repository = "fremd/repo"], ["PR", f => f.pr.number++],
  ["branch", f => f.pr.head.ref = "fremd"], ["base", f => f.pr.base.sha = "1".repeat(40)],
  ["head", f => f.head = "2".repeat(40)], ["dispatch", f => f.event = "workflow_dispatch"],
  ["geschlossen", f => f.pr.state = "closed"], ["beleg", f => f.evidenceTree.delete("client.js")],
  ["fremdruntime", f => f.headTree.set("server.js", { mode: "100644", type: "blob", oid: "3".repeat(40) })],
  ["alterguard", f => f.headTree.set("scripts/ci-briefingqualitaet-plan.js", { mode: "100644", type: "blob", oid: "3".repeat(40) })],
  ["fremdfile", f => f.headTree.set("unbekannt.js", { mode: "100644", type: "blob", oid: "3".repeat(40) })],
  ["symlink", f => f.headTree.set(D.CI_FILES[1], { mode: "120000", type: "blob", oid: "4".repeat(40) })]
]) check("Destatisanzeige " + name + " stoppt", () => {
  const f = sourceFixture(false, D); mutate(f);
  assert.throws(() => D.validate(f), /destatisanzeige-ci:/);
});
check("Destatisanzeige bindet jeden Renderer-/Testblob und den echten Mergebaum", () => {
  for (const file of Object.keys(D.BLOBS)) {
    const f = sourceFixture(false, D);
    f.headTree.set(file, { mode: "100644", type: "blob", oid: "0".repeat(40) });
    assert.throws(() => D.validate(f), /destatisanzeige-ci:/);
  }
  for (const mutate of [f => f.message = "fremd", f => f.before = "1".repeat(40),
    f => f.parents = ["8".repeat(40)], f => f.prHeadTree.delete("server.js"), f => f.pr.merged = false]) {
    const f = sourceFixture(true, D); mutate(f);
    assert.throws(() => D.validate(f), /destatisanzeige-ci:/);
  }
});
check("Destatisanzeige waehlt in beiden Jobs denselben Guard ohne Fehler-Rueckfall", () => {
  const w = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  const blocks = [...w.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1251 \][\s\S]*?\n          fi/g)].map(m => m[0]);
  assert.equal(blocks.length, 2); assert.equal(blocks[0], blocks[1]);
  const script = `set -e
git(){ case "$1" in log) printf '%s' "$MSG";;rev-parse) printf '%s' "$PARENT";;*) return 99;;esac; }
node(){ printf GUARD; return 23; }
${blocks[0]}
printf BROAD`;
  const run = (msg, parent, extra = {}) => spawnSync("bash", ["-c", script], { encoding: "utf8",
    env: { PATH: process.env.PATH, GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main",
      GITHUB_OUTPUT: "/dev/null", MSG: msg, PARENT: parent, ...extra } });
  for (const msg of [D.MERGE_TITLE, "abweichender Betreff"]) {
    const r = run(msg, D.BASE); assert.equal(r.status, 23, r.stderr); assert.equal(r.stdout, "GUARD");
  }
  for (const extra of [{ HELMUT_CI_PR_NUMBER: "1251" }, { HELMUT_CI_PR_HEAD_REF: D.BRANCH }]) {
    const r = run("x", "8".repeat(40), { GITHUB_EVENT_NAME: "pull_request", ...extra });
    assert.equal(r.status, 23, r.stderr); assert.equal(r.stdout, "GUARD");
  }
  const other = run("spaeterer Commit", "8".repeat(40));
  assert.equal(other.status, 0); assert.equal(other.stdout, "BROAD");
  const step = w.split("      - name: Destatisanzeige -")[1].split("      - name: Quellenbedarf -")[0];
  for (const suite of ["ci-briefingqualitaet-plan", "quellen-destatis-rss-stand", "parlamentsdaten-quellen-ui"])
    assert(step.includes("scripts/" + suite + "-test.js"));
  assert(!/--extended|Mock100|Mock500/.test(step));
  // Die echten allgemeinen Browserchecks werden fuer diesen UI-Diff ausgefuehrt.
  for (const name of ["Browser-Smoke (Desktop + Mobil, lokaler In-Process-Server)",
    "Getrennte Prosa in beiden App Ansichten (Chromium, hell und dunkel)"]) {
    const condition = w.split("      - name: " + name + "\n")[1].split("\n")[0];
    assert(condition.includes("steps.plan.outputs.browser == 'true'"));
    assert(!condition.includes("destatisanzeige"));
  }
});
console.log(pass+" CI-Gruppen bestanden; keine Mengen-/DB-/Modelllaeufe");
