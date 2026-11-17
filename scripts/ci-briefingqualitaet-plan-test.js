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
check("nur gebundener Briefingstatus-Kopf mit Kern und gezielten Gruppen",()=>{
 const p=Q.validate(sourceFixture());assert.equal(p.mode,"briefingstatus");assert(p.core&&p.syntax&&p.npm&&p.briefingstatus);
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
])check(name+" wird abgewiesen",()=>{const f=sourceFixture();mutate(f);assert.throws(()=>Q.validate(f),/briefingstatus-ci:/);});
check("jeder Laufzeit- und Testblob gebunden",()=>{for(const file of Object.keys(Q.BLOBS)){
 const f=sourceFixture();f.headTree.set(file,{mode:"100644",type:"blob",oid:"0".repeat(40)});
 assert.throws(()=>Q.validate(f),/briefingstatus-ci:/);
}});
check("nur echter normaler Mainmerge mit identischem Baum",()=>{
 assert.equal(Q.validate(sourceFixture(true)).mode,"briefingstatus");
 for(const mutate of [f=>f.message="fremd",f=>f.parents=["8".repeat(40)],f=>f.prHeadTree.delete("server.js"),f=>f.before="1".repeat(40),f=>f.pr.merged=false]){
  const f=sourceFixture(true);mutate(f);assert.throws(()=>Q.validate(f),/briefingstatus-ci:/);
 }
});
check("beide Selektoren identisch und ohne breiten Fehler-Rueckfall",()=>{
 const w=fs.readFileSync(".github/workflows/ci.yml","utf8");
 const blocks=[...w.matchAll(/if \[ "\$\{HELMUT_CI_PR_NUMBER:-\}" = 1247 \][\s\S]*?\n          fi/g)].map(x=>x[0]);
 assert.equal(blocks.length,2);assert.equal(blocks[0],blocks[1]);
 const script=`set -e
 git(){ case "$1" in log) printf '%s' "$MSG";;rev-parse) printf '%s' "$PARENT";;merge-base) return "$ANCESTOR";;*) return 99;;esac; }
 node(){ printf GUARD; return 23; }
 ${blocks[0]}
 printf BROAD`;
 const run=(msg,parent,ancestor,extra={})=>spawnSync("bash",["-c",script],{encoding:"utf8",env:{PATH:process.env.PATH,GITHUB_EVENT_NAME:"push",GITHUB_REF:"refs/heads/main",GITHUB_OUTPUT:"/dev/null",MSG:msg,PARENT:parent,ANCESTOR:String(ancestor),...extra}});
 for(const msg of [Q.MERGE_TITLE,"Merge pull request #1247","fehlerhafter Betreff"]){const r=run(msg,Q.BASE,0);assert.equal(r.status,23,r.stderr);assert.equal(r.stdout,"GUARD");}
 for(const msg of ["fremd","spaeterer Commit"]){const r=run(msg,"8".repeat(40),1);assert.equal(r.status,0);assert.equal(r.stdout,"BROAD");}
 const pr=run("x","8".repeat(40),1,{GITHUB_EVENT_NAME:"pull_request",HELMUT_CI_PR_NUMBER:"1247"});assert.equal(pr.status,23);assert.equal(pr.stdout,"GUARD");
 const branch=run("x","8".repeat(40),1,{GITHUB_EVENT_NAME:"pull_request",HELMUT_CI_PR_HEAD_REF:Q.BRANCH});assert.equal(branch.status,23);assert.equal(branch.stdout,"GUARD");
 assert.match(w,/name: Native automation boundary qualification \(synthetic\)\n[^\n]+steps\.plan\.outputs\.briefingstatus != 'true'/);
 const step=w.split("      - name: Briefingstatus -")[1].split("      - name: Quellenreadback -")[0];
 for(const name of ["briefing-freshness-header","quellen-versorgungsstand"])assert(step.includes("scripts/"+name+"-test.js"));
 assert(!/source-demand|--extended|Mock100|Mock500|morgen-paketnachweis/.test(step));
 const browser=w.split("      - name: Briefingstatus - gebundenen")[1].split("      - name: Quellenreadback -")[0];
 assert.match(browser,/44065530896\/job\/133978126070/);
 assert.match(browser,/kein neuer Chromiumlauf/i);
 assert(!browser.includes("run: node scripts/lokal.js -- node scripts/browser-smoke-test.js"));

});
console.log(pass+" neue CI-Gruppen bestanden");
