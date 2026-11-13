"use strict";

// Ehrliche Abbildung erfolgreicher Belege: native workflow_dispatch-Jobchecks
// erfuellen laut GitHub keine PR-Pflichtchecks. Keine Tests/Deployments hier.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const REPO="ernisch/helmut-pilot", PR=1183;
const TARGET="4f7643174ba698332d76ba96dcb96115f23bd4f3", BASE="fe94f3eb9b2c959af7c0e2e9e554d676efbb8d6f";
const BRANCH="codex/ci-evidence-1183-20261113", SOURCE_BRANCH="codex/verarbeitungskern-100-20261113";
const RUN=43491668407, OLD_RUN=43483196284, OLD_HEAD="f7f3d6eb086fa7b8200f6d3628b950b42032ae85";
const FILES=[".github/workflows/ci.yml","scripts/ci-evidence-1183.js","scripts/ci-evidence-1183-test.js"];
const CONTEXTS=Object.freeze([
  { context:"Syntax + Offline-Suiten",job:132114163925,
    target_url:`https://github.com/${REPO}/actions/runs/${RUN}/job/132114163925`,
    description:"Verified reused evidence: CI43491668407 (7 policy + 3 SQL); no tests rerun" },
  { context:"Browser-/Mobile-Smoke (Chromium)",job:132114164100,
    target_url:`https://github.com/${REPO}/actions/runs/${OLD_RUN}/job/132084761727`,
    description:"Verified reused evidence: CI43483196284 (29 browser); no tests rerun" }
]);
const sha=x=>typeof x==="string"&&/^[a-f0-9]{40}$/.test(x);
const same=(a,b)=>a?.mode===b?.mode&&a?.type===b?.type&&a?.oid===b?.oid;
function need(ok,reason){if(!ok)throw Error("evidence1183:"+reason);}
function git(args){return execFileSync("git",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:10000});}
function tree(ref){return new Map(git(["ls-tree","-rz","--full-tree",ref]).split("\0").filter(Boolean).map(line=>{
  const m=/^(\d{6}) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(line);
  need(Boolean(m),"git-tree-invalid");return[m[4],{mode:m[1],type:m[2],oid:m[3]}];
}));}
function validateLocal({env,head,targetTree,publisherTree,targetVercel,publisherVercel}){
  need(env.GITHUB_EVENT_NAME==="workflow_dispatch"&&env.GITHUB_REPOSITORY===REPO&&env.GITHUB_REF==="refs/heads/"+BRANCH,"publisher-event-repo-ref");
  need(sha(head)&&head===env.GITHUB_SHA&&head===env.HELMUT_EXPECTED_PUBLISHER_COMMIT,"publisher-sha");
  need(targetTree instanceof Map&&targetTree.size>0&&publisherTree instanceof Map&&publisherTree.size>0,"missing-tree");
  for(const file of FILES){const row=publisherTree.get(file);need(row?.mode==="100644"&&row.type==="blob"&&sha(row.oid),"invalid-publisher-file:"+file);}
  for(const file of new Set([...targetTree.keys(),...publisherTree.keys()])){
    if(FILES.includes(file)||file==="vercel.json")continue;
    need(same(targetTree.get(file),publisherTree.get(file)),"application-tree-drift:"+file);
  }
  need(publisherTree.get("vercel.json")?.mode==="100644"&&publisherTree.get("vercel.json").type==="blob","vercel-mode");
  need(!Object.hasOwn(targetVercel.git.deploymentEnabled,BRANCH)&&publisherVercel.git.deploymentEnabled[BRANCH]===false,"publisher-deployment-not-disabled");
  const copy=structuredClone(publisherVercel);delete copy.git.deploymentEnabled[BRANCH];
  assert.deepEqual(copy,targetVercel,"Only the publisher branch false flag may change in vercel.json");
}
function validatePR(pr){need(pr?.number===PR&&pr.state==="open"&&pr.merged===false&&pr.draft===false
  &&pr.base?.ref==="main"&&pr.base.sha===BASE&&pr.base.repo?.full_name===REPO
  &&pr.head?.sha===TARGET&&pr.head.ref===SOURCE_BRANCH&&pr.head.repo?.full_name===REPO,"live-pr-binding");}
function runBound(run,id,head){need(run?.id===id&&run.head_sha===head&&run.event==="workflow_dispatch"
  &&run.path===".github/workflows/ci.yml"&&run.repository?.full_name===REPO&&run.run_attempt===1
  &&run.status==="completed"&&run.conclusion==="success","source-run-binding");}
function stepOK(job,name,number){return job.steps?.some(s=>s.name===name&&s.number===number&&s.status==="completed"&&s.conclusion==="success");}
function fresh(job,now){
  const end=Date.parse(job?.completed_at);
  need(typeof job?.completed_at==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(job.completed_at)
    &&Number.isFinite(end)&&new Date(end).toISOString().slice(0,19)===job.completed_at.slice(0,19)
    &&end<=now&&now-end<=7*86400000,"source-job-age-invalid");
}
function validateProofs({pr,run,jobs,oldRun,oldJobs,targetTree,oldTree,rules}){
  validatePR(pr);runBound(run,RUN,TARGET);runBound(oldRun,OLD_RUN,OLD_HEAD);
  const now=Date.now();
  need(jobs?.total_count===3&&jobs.jobs?.length===3,"source-jobs-incomplete");
  for(const c of CONTEXTS){
    const job=jobs.jobs.find(j=>j.id===c.job);
    need(job?.run_id===RUN&&job.name===c.context&&job.status==="completed"&&job.conclusion==="success","source-job-binding");
    fresh(job,now);
    const steps=c.job===132114163925?[
      ["Begrenzte Kernabnahme - neue CI-Auswahl und Negativfaelle",7],
      ["Begrenzter SQL-Nachtrag - drei neue Production-Kommentarfaelle",8]
    ]:[["Gespeichertes Tagespaket - gebundenen Browserbeleg wiederverwenden",9]];
    need(steps.every(([name,number])=>stepOK(job,name,number)),"source-proof-step");
  }
  // Unveraendertes Original prueft echten alten Browserjob/-schritt samt Baum.
  require("./ci-verarbeitungskern-plan").validateReuse({run:oldRun,jobs:oldJobs,previousTree:oldTree,headTree:targetTree});
  fresh(oldJobs.jobs.find(j=>j.id===132084761727),now);
  const required=rules.filter(r=>r.type==="required_status_checks").flatMap(r=>r.parameters?.required_status_checks||[]);
  need(required.length===2&&CONTEXTS.every(c=>required.some(r=>r.context===c.context&&r.integration_id===15368)),"required-context-or-app-drift");
}
function matching(status,expected){return status?.state==="success"&&status.context===expected.context
  &&status.target_url===expected.target_url&&status.description===expected.description
  &&status.creator?.login==="github-actions[bot]"&&status.creator.type==="Bot"
  &&(status.creator.id===undefined||status.creator.id===41898282);}
async function request(token,route,body){
  const response=await fetch(`https://api.github.com/repos/${REPO}/${route}`,{
    method:body===undefined?"GET":"POST",redirect:"error",signal:AbortSignal.timeout(20000),
    headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  need(response.ok,"api-http-"+response.status+":"+route);
  const text=await response.text();need(text.length<=2000000,"api-response-too-large");return JSON.parse(text);
}
async function publishOne(api,expected){
  const read=async()=>{
    const state=await api(`commits/${TARGET}/status`);need(Array.isArray(state.statuses),"commit-status-response");
    const matches=state.statuses.filter(s=>s.context===expected.context);
    need(matches.length<=1,"ambiguous-existing-status:"+expected.context);return matches[0];
  };
  const existing=await read();
  if(matching(existing,expected))return"already-present";
  need(!existing,"existing-status-conflict:"+expected.context);
  try{
    const result=await api(`statuses/${TARGET}`,{state:"success",context:expected.context,target_url:expected.target_url,description:expected.description});
    need(matching(result,expected),"published-status-not-confirmed");
  }catch(error){
    // Verlorenen POST-Ausgang nur lesend klaeren, niemals blind wiederholen.
    if(matching(await read(),expected))return"confirmed-by-read";
    throw error;
  }
  need(matching(await read(),expected),"published-status-readback");return"published-and-confirmed";
}
async function main(){
  const head=git(["rev-parse","HEAD"]).trim(),targetTree=tree(TARGET);
  git(["diff","--quiet","HEAD","--"]); // Keine geaenderten Arbeitskopien hinter einem passenden HEAD.
  validateLocal({env:process.env,head,targetTree,publisherTree:tree(head),
    targetVercel:JSON.parse(git(["show",TARGET+":vercel.json"])),publisherVercel:JSON.parse(fs.readFileSync(path.join(__dirname,"../vercel.json"),"utf8"))});
  git(["merge-base","--is-ancestor",TARGET,head]);
  const token=process.env.GH_TOKEN;need(Boolean(token),"missing-actions-token");
  const api=(route,body)=>request(token,route,body);
  const routes=[`pulls/${PR}`,`actions/runs/${RUN}`,`actions/runs/${RUN}/jobs?per_page=100`,
    `actions/runs/${OLD_RUN}`,`actions/runs/${OLD_RUN}/jobs?per_page=100`,"rules/branches/main"];
  const reads=await Promise.allSettled(routes.map(route=>api(route)));
  for(const r of reads)if(r.status!=="fulfilled")throw r.reason;
  const[pr,run,jobs,oldRun,oldJobs,rules]=reads.map(r=>r.value);
  validateProofs({pr,run,jobs,oldRun,oldJobs,rules,targetTree,oldTree:tree(OLD_HEAD)});
  validatePR(await api(`pulls/${PR}`)); // ALLE Belege vor dem ersten Write.
  const results=[];
  for(const context of CONTEXTS)results.push({context:context.context,result:await publishOne(api,context)});
  validatePR(await api(`pulls/${PR}`));
  console.log(JSON.stringify({target:TARGET,sourceRun:RUN,browserSourceRun:OLD_RUN,testsRerun:false,results}));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Vorhandene Pruefnachweise wiederverwendet, keine Tests erneut ausgefuehrt\n\nZiel: ${TARGET}\n\n`
    +CONTEXTS.map(c=>`- ${c.context}: [Originalbeleg](${c.target_url}), ${c.description}`).join("\n")+"\n");
}
module.exports={REPO,PR,TARGET,BASE,BRANCH,OLD_HEAD,RUN,OLD_RUN,FILES,CONTEXTS,validateLocal,validatePR,validateProofs,matching,publishOne};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
