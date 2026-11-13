"use strict";

// Nur neue Publisher-Gegenfaelle; keine alten Tests, kein Netz oder Production.
const A=require("node:assert/strict"),E=require("./ci-evidence-1183"),C=require("./ci-verarbeitungskern-plan");
const row=(oid="a".repeat(40))=>({mode:"100644",type:"blob",oid});
function fixture(){
  const targetTree=new Map([["server.js",row()],["vercel.json",row()],[C.BROWSER_FILE,row()]]);
  for(const file of C.CI_FILES)targetTree.set(file,row());
  for(const[file,oid]of Object.entries(C.SQL_BLOBS))targetTree.set(file,row(oid));
  const oldTree=structuredClone(targetTree),publisherTree=structuredClone(targetTree);
  for(const file of E.FILES)publisherTree.set(file,row("b".repeat(40)));
  publisherTree.set("vercel.json",row("b".repeat(40)));
  const head="c".repeat(40),targetVercel={git:{deploymentEnabled:{existing:false}}};
  const publisherVercel=structuredClone(targetVercel);publisherVercel.git.deploymentEnabled[E.BRANCH]=false;
  const run=(id,head_sha)=>({id,head_sha,event:"workflow_dispatch",path:".github/workflows/ci.yml",
    repository:{full_name:E.REPO},run_attempt:1,status:"completed",conclusion:"success"});
  const step=(name,number)=>({name,number,status:"completed",conclusion:"success"});
  const completed_at=new Date().toISOString();
  const jobs={total_count:3,jobs:E.CONTEXTS.map(c=>({id:c.job,run_id:E.RUN,name:c.context,status:"completed",conclusion:"success",completed_at,
    steps:c.job===132114163925?[step("Begrenzte Kernabnahme - neue CI-Auswahl und Negativfaelle",7),step("Begrenzter SQL-Nachtrag - drei neue Production-Kommentarfaelle",8)]
      :[step("Gespeichertes Tagespaket - gebundenen Browserbeleg wiederverwenden",9)]}))};
  jobs.jobs.push({id:1});
  return{env:{GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_REPOSITORY:E.REPO,GITHUB_REF:"refs/heads/"+E.BRANCH,
      GITHUB_SHA:head,HELMUT_EXPECTED_PUBLISHER_COMMIT:head},head,targetTree,publisherTree,targetVercel,publisherVercel,
    pr:{number:1183,state:"open",merged:false,draft:false,base:{ref:"main",sha:E.BASE,repo:{full_name:E.REPO}},
      head:{sha:E.TARGET,ref:"codex/verarbeitungskern-100-20261113",repo:{full_name:E.REPO}}},run:run(E.RUN,E.TARGET),jobs,
    oldRun:run(E.OLD_RUN,E.OLD_HEAD),oldTree,
    oldJobs:{total_count:3,jobs:[{id:132084761727,run_id:E.OLD_RUN,name:"Browser-/Mobile-Smoke (Chromium)",status:"completed",conclusion:"success",completed_at,
      steps:[step("Gespeichertes Tagespaket - neuer Desktop-/Mobilweg",9)]},{id:2},{id:3}]},
    rules:[{type:"required_status_checks",parameters:{required_status_checks:E.CONTEXTS.map(c=>({context:c.context,integration_id:15368}))}}]};
}
let count=0;const only=process.argv.find(a=>a.startsWith("--only="))?.slice(7).split(",");
async function test(name,fn){if(only&&!only.some(part=>name.includes(part)))return;await fn();count++;console.log("PASS "+name);}
function denied(change,validator=E.validateProofs){const f=fixture();change(f);A.throws(()=>validator(f));}
const success=c=>({...c,state:"success",creator:{login:"github-actions[bot]",type:"Bot",id:41898282}});
(async()=>{
  await test("exakte Publisher-/PR-/Belegbindungen erlauben nur den festen Zielkopf",()=>{const f=fixture();E.validateLocal(f);E.validateProofs(f);A.equal(E.TARGET,"4f7643174ba698332d76ba96dcb96115f23bd4f3");});
  await test("fremdes Event Repository Ref oder Publisher-SHA stoppt",()=>{
    for(const key of["GITHUB_EVENT_NAME","GITHUB_REPOSITORY","GITHUB_REF","GITHUB_SHA","HELMUT_EXPECTED_PUBLISHER_COMMIT"])denied(f=>{f.env[key]="fremd";},E.validateLocal);
  });
  await test("Laufzeitdrift und andere Vercelaenderungen bleiben gesperrt",()=>{
    denied(f=>{f.publisherTree.get("server.js").oid="f".repeat(40);},E.validateLocal);
    denied(f=>{f.publisherTree.set("neue-datei.js",row());},E.validateLocal);
    denied(f=>{f.publisherTree.get(E.FILES[0]).mode="120000";},E.validateLocal);
    denied(f=>{f.publisherVercel.git.deploymentEnabled[E.BRANCH]=true;},E.validateLocal);
    denied(f=>{f.publisherVercel.regions=["fremd"];},E.validateLocal);
  });
  await test("fremder PR Kopf Run Job oder fehlender wirklicher Pruefschritt stoppt",()=>{
    denied(f=>{f.pr.head.sha="f".repeat(40);});denied(f=>{f.pr.base.sha="f".repeat(40);});
    denied(f=>{f.run.event="push";});denied(f=>{f.run.conclusion="failure";});denied(f=>{f.run.run_attempt=2;});
    denied(f=>{f.jobs.jobs[0].id++;});denied(f=>{f.jobs.jobs[0].steps[1].conclusion="skipped";});
  });
  await test("alter Browserbeleg und erwartete GitHubActionsquelle sind zwingend",()=>{
    denied(f=>{f.oldJobs.jobs[0].steps[0].conclusion="skipped";});
    denied(f=>{f.oldTree.get(C.BROWSER_FILE).oid="f".repeat(40);});
    denied(f=>{f.rules[0].parameters.required_status_checks[0].integration_id=1;});
    A.equal(E.matching({...success(E.CONTEXTS[0]),creator:{login:"anderer",type:"Bot"}},E.CONTEXTS[0]),false);
    A.equal(E.matching({...success(E.CONTEXTS[0]),creator:{login:"github-actions[bot]",type:"Bot",id:1}},E.CONTEXTS[0]),false);
  });
  await test("alte zukuenftige oder ungueltige Quelljobzeiten werden nicht frisch publiziert",()=>{
    for(const value of[new Date(Date.now()-8*86400000).toISOString(),new Date(Date.now()+3600000).toISOString(),"ungueltig",null]){
      denied(f=>{f.jobs.jobs[0].completed_at=value;});denied(f=>{f.oldJobs.jobs[0].completed_at=value;});
    }
  });
  await test("bestehender identischer Actionsstatus verursacht keinen neuen Write",async()=>{
    let posts=0;A.equal(await E.publishOne(async(_route,body)=>{if(body)posts++;return[success(E.CONTEXTS[0])];},E.CONTEXTS[0]),"already-present");A.equal(posts,0);
  });
  await test("unklare POST-Antwort wird lesend bestaetigt ohne zweiten Sendversuch",async()=>{
    let posts=0,written=false;const api=async(_route,body)=>{if(body){posts++;written=true;throw Error("Antwort verloren");}return written?[success(E.CONTEXTS[0])]:[];};
    A.equal(await E.publishOne(api,E.CONTEXTS[0]),"confirmed-by-read");A.equal(posts,1);
    posts=0;await A.rejects(()=>E.publishOne(async(_route,body)=>{if(body){posts++;throw Error("nicht bestaetigt");}return[];},E.CONTEXTS[0]));A.equal(posts,1);
  });
  await test("widerspruechlicher vorhandener Status wird nicht ueberschrieben",async()=>{
    let posts=0;await A.rejects(()=>E.publishOne(async(_route,body)=>{if(body)posts++;return[{...success(E.CONTEXTS[0]),state:"failure"}];},E.CONTEXTS[0]));A.equal(posts,0);
    const older={...success(E.CONTEXTS[0]),id:10,created_at:"2026-11-13T19:00:00Z"};
    const newer={...older,id:11,created_at:"2026-11-13T20:00:00Z",state:"failure"};
    await A.rejects(()=>E.publishOne(async(_route,body)=>{if(body)posts++;return[older,newer];},E.CONTEXTS[0]),/ambiguous-existing-status/);A.equal(posts,0);
  });
  await test("vollstaendige Statusliste ist Pflicht; gekuerzte Combined-Antwort bleibt gesperrt",async()=>{
    let posts=0;await A.rejects(()=>E.publishOne(async(route,body)=>{
      A.equal(route,`commits/${E.TARGET}/statuses?per_page=100`);if(body)posts++;
      return{statuses:[success(E.CONTEXTS[0])]};
    },E.CONTEXTS[0]),/commit-status-response/);A.equal(posts,0);
    await A.rejects(()=>E.publishOne(async(_route,body)=>{
      if(body)posts++;return Array.from({length:100},()=>({context:"anderer Kontext"}));
    },E.CONTEXTS[0]),/commit-status-window-incomplete/);A.equal(posts,0);
  });
  A.ok(count>0,"Mindestens eine ausgewaehlte Gruppe muss wirklich ausgefuehrt sein");
  console.log(`${count}/${count} neue Publisher-Gruppen bestanden; keine alten Tests oder externen Zugriffe.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
