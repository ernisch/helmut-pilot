"use strict";
const assert=require("assert/strict");
const { integrationPayload,quietIntegrationPayload,pendingQuietIntegrationPayload }=require("./fixtures/ui-integration-contracts");
const runs=[];
let scenario,payload,calls,unexpected,phase,tokenMode,officeMode,csrfSerial,officeAttempt;
const denied=["anonymous","session-503","session-invalid","no-mandate","start-401","start-503","selection","empty"];
const briefingReadOnly=process.argv.includes("--briefing-read-only");
const viewports=briefingReadOnly ? [["contract-desktop",1440,900,false],["contract-mobile",390,844,true]] : [...denied.map(name=>[name,1440,900,false]),["contract-desktop",1440,900,false],["contract-mobile",390,844,true],
  ["quiet-desktop",1440,900,false],["quiet-mobile",390,844,true],
  ["quiet-pending-desktop",1440,900,false],["quiet-pending-mobile",390,844,true]];
function reset(label) {
  scenario=label;payload=label.includes("-pending-") ? pendingQuietIntegrationPayload()
    : label.startsWith("quiet-") ? quietIntegrationPayload() : integrationPayload();calls=[];unexpected=[];phase="bootstrap";
  if(label.startsWith("contract-")) {
    payload.briefing.currentHelmutState.primaryItem.meldungAt="2026-11-05T09:20:00.000Z";
    payload.briefing.currentHelmutState.frischeVertrag.lauf={erzeugtAm:"2026-11-06T05:15:00.000Z"};
  }
  tokenMode="valid";officeMode="rule";csrfSerial=0;officeAttempt=0;
}
reset("contract-desktop");

// Push browser APIs are also simulated: no actual SW registration, push service,
// subscription, permission dialog or external endpoint is contacted.
const preload=`
  window.__uiPush={scheduled:0,subscribed:0};
  // The kernel stays offline; simulate an online browser receiving HTTP errors.
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
  const nativeTimeout=window.setTimeout.bind(window);
  window.setTimeout=(fn,delay,...args)=>{
    if(delay===1200 && new Error().stack.includes('schedulePushAutoSync')) window.__uiPush.scheduled++;
    return nativeTimeout(fn,delay,...args);
  };
  Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'granted'}});
  Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
  const registration={update:async()=>{},active:{postMessage(){}},pushManager:{
    getSubscription:async()=>null,
    subscribe:async()=>{window.__uiPush.subscribed++;return {endpoint:'https://example.test/push/synthetic',keys:{p256dh:'synthetic',auth:'synthetic'}};}
  }};
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{
    register:async()=>registration,ready:Promise.resolve(registration),addEventListener(){}
  }});
`;

function apiResponse(request) {
  const path=new URL(request.url).pathname,method=request.method;
  const body=request.postData ? JSON.parse(request.postData) : null;
  const token=Object.entries(request.headers).find(([key])=>key.toLowerCase()==="x-csrf-token")?.[1];
  const reply=(value,status=200)=>{
    calls.push({phase,method,path,status,simulated:true,
      writeCapable:method!=="GET" || ["/api/auth/session","/api/app/start","/api/lage/briefing","/api/push/test"].includes(path),
      csrfHeaderPresent:Boolean(token),...(body?.decision ? {decisionId:body.decision.id,vorgangId:body.decision.vorgang_id} : {})});
    return {status,body:value};
  };
  if(method==="GET" && path==="/api/auth/session") {
    if(scenario==="anonymous") return reply({authenticated:false});
    if(scenario==="session-503") return reply({error:"Anmeldung vorübergehend nicht verfügbar."},503);
    if(scenario==="session-invalid") return reply({authenticated:"invalid"});
    if(["selection","empty"].includes(scenario)) return reply({error:"Not found"},404);
    return reply({authenticated:true,user:{id:"ui-contract-user",role:scenario==="no-mandate" ? "referent" : "abgeordneter",
      politicianId:scenario==="no-mandate" ? null : payload.profile.id,name:"Synthetisches UI Profil",notificationSettings:{}},
      allowedPoliticians:scenario==="no-mandate" ? [] : [payload.profile.id],
      profiles:scenario==="no-mandate" ? [] : [{id:payload.profile.id,name:payload.profile.fullName}]});
  }
  if(method==="GET" && path==="/api/app/start") {
    if(scenario==="no-mandate") return reply({error:"Kein Mandat zugewiesen. Bitte an einen Administrator wenden.",reason:"no-mandate"},403);
    if(scenario==="start-401") return reply({error:"Unauthorized"},401);
    if(scenario==="start-503") return reply({error:"Interner Serverfehler. Bitte später erneut versuchen."},503);
    if(scenario==="selection") return reply({needsMandateSelection:true,empty:false,mandates:[{id:"synthetik-a",name:"Synthetisches Mandat A"},{id:"synthetik-b",name:"Synthetisches Mandat B"}]});
    if(scenario==="empty") return reply({needsMandateSelection:false,empty:true,mandates:[]});
    return reply(payload);
  }
  if(method==="GET" && path==="/api/security/csrf") {
    csrfSerial++;
    if(tokenMode==="unavailable") return reply({error:"Interner Serverfehler."},503);
    if(tokenMode==="missing") return reply({});
    return reply({token:`synthetic-csrf-${csrfSerial}`});
  }
  if(method==="GET" && path==="/api/parliament") return reply({enabled:false,items:[]});
  if(method==="GET" && path==="/api/push/public-key") return reply({enabled:true,publicKey:Buffer.from([4,...Array(64).fill(1)]).toString("base64url")});
  if(method==="POST" && path==="/api/push/subscribe") {
    assert.equal(token,`synthetic-csrf-${csrfSerial}`);
    assert.equal(body.subscription.endpoint,"https://example.test/push/synthetic");
    return reply({id:"synthetic-push-subscription"});
  }
  if(method==="POST" && path==="/api/communication/generate") {
    officeAttempt++;
    assert.equal(token,`synthetic-csrf-${csrfSerial}`);
    assert.ok(body.decision.vorgang_id && body.decision.knowledge_object_id);
    if(officeMode==="forbidden") return reply({error:"Synthetische Kommunikationsberechtigung fehlt.",reason:"communication-forbidden"},403);
    if(officeMode==="csrf-always" || (officeMode==="csrf-once" && officeAttempt===1)) return reply({error:"CSRF token missing or invalid"},403);
    if(officeMode==="rate-limit") return reply({error:"Zu viele Kommunikationsentwürfe in kurzer Zeit."},429);
    return reply({aiEnabled:false,degraded:true,fallbackReason:"budget-erschoepft",channelLabel:"Presse",
      text:`Synthetischer Regelentwurf für ${body.decision.vorgang_id}. `.repeat(5),sourceNote:"Regelbasiert erzeugt, weil das KI-Budget erschöpft ist."});
  }
  if(method==="GET" && ["/api/lage/briefing","/api/push/test"].includes(path)) {
    assert.equal(token,`synthetic-csrf-${csrfSerial}`);
    return reply(path==="/api/lage/briefing" ? payload.briefing.lageBriefing : {skipped:true,reason:"simulation-only"});
  }
  unexpected.push({method,path});
  return reply({error:"Unmocked API request prohibited"},500);
}

async function run({cdp,session:s,label,mobile,check,screenshot}) {
  const evaluate=code=>cdp.evaluate(s,code);
  const verify=(name,value,detail)=>check(label+": "+name,value,detail);
  const waitFor=async code=>{for(let i=0;i<100;i++){if(await evaluate(code))return true;await new Promise(r=>setTimeout(r,30));}return false;};
  const count=(path,method)=>calls.filter(c=>c.phase===phase && c.path===path && (!method || c.method===method)).length;
  const nav=async view=>evaluate(`document.querySelector(${JSON.stringify(`${mobile ? ".mobile-dock" : ".sidebar .nav-list"} [data-view="${view}"]`)}).click()`);
  // Include the actual delayed auto-sync decision; fake browser APIs above
  // make this a non-vacuous check even on an otherwise push-incapable origin.
  await new Promise(resolve=>setTimeout(resolve,1400));
  verify("push-capable fixture active",await evaluate("browserPushSupported() && Notification.permission==='granted'"));
  async function verifyBriefingRead() {
    if(briefingReadOnly) verify("bootstrap reads one saved payload without source/model requests",count("/api/app/start")===1
      && calls.every(c=>["/api/auth/session","/api/app/start","/api/parliament","/api/push/public-key","/api/security/csrf","/api/push/subscribe"].includes(c.path)),calls);
    phase="briefing-foreground";
    await evaluate("profile.officeFormats=[]");
    await nav("helmut");
    verify("Briefing still displays saved content",await waitFor("!!document.querySelector('.ui-briefing-hero')"));
    verify("no manual refresh or replacement button next to status",await evaluate("!document.querySelector('[data-refresh-helmut],.ui-briefing-status button')"));
    const savedMeta=await evaluate("document.querySelector('.hstand-meta-line').textContent");
    verify("source and stored creation times remain visible",savedMeta.includes("Quellenstand:") && savedMeta.includes("10:20")
      && savedMeta.includes("Briefing erstellt:") && savedMeta.includes("06:15"),savedMeta);
    await screenshot("briefing-without-refresh");
    const savedTitle="Neu gespeicherter synthetischer Vorgang";
    Object.assign(payload.briefing.currentHelmutState.primaryItem,{title:savedTitle,displayTitle:savedTitle});
    await evaluate(`lastBriefingLoadAt=Date.now()-foregroundRefreshMinMs-1;
      Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});
      document.dispatchEvent(new Event('visibilitychange'))`);
    verify("return to app reloads exactly one saved start payload",await waitFor(`!briefingRefreshing && briefing.currentHelmutState.primaryItem.title===${JSON.stringify(savedTitle)}`)
      && count("/api/app/start")===1);
    verify("reloaded content appears with unchanged source/creation times",await evaluate(`document.querySelector('.ui-briefing-hero').textContent.includes(${JSON.stringify(savedTitle)})
      && document.querySelector('.hstand-meta-line').textContent===${JSON.stringify(savedMeta)}`));
    await evaluate("document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange'))");
    await new Promise(resolve=>setTimeout(resolve,100));
    verify("rapid foreground events remain throttled",count("/api/app/start")===1);
    verify("foreground only reads saved data, with no pipeline/source/model request",calls.filter(c=>c.phase===phase).every(c=>c.method==="GET"
      && ["/api/auth/session","/api/app/start","/api/parliament","/api/push/public-key"].includes(c.path)),calls.filter(c=>c.phase===phase));
    verify("no manual refresh appears after reload",await evaluate("!document.querySelector('[data-refresh-helmut],.ui-briefing-status button')"));
  }
  if(briefingReadOnly) {
    await verifyBriefingRead();
  } else if(denied.includes(label)) {
    const expected={anonymous:"Anmeldung", "session-503":"Helmut ist gerade nicht erreichbar", "session-invalid":"Helmut ist gerade nicht erreichbar",
      "no-mandate":"Noch kein Mandat zugewiesen", "start-401":"Anmeldung", "start-503":"Briefing konnte nicht geladen werden",
      selection:"Mandat wählen",empty:"Kein aktives Mandat"}[label];
    const stateText=await evaluate("document.querySelector('#app').textContent.replace(/\\s+/g,' ').trim()");
    if(!stateText.includes(expected)) await screenshot("unexpected-startup-state");
    verify("appropriate startup state",stateText.includes(expected),stateText);
    const sessionOnly=["anonymous","session-503","session-invalid"].includes(label);
    if(sessionOnly) verify("no data fetch after failed session",!calls.some(c=>c.path==="/api/app/start"));
    else verify("single app-start fetch before access/availability state",calls.filter(c=>c.path==="/api/app/start").length===1);
    verify("no generation, CSRF or push calls after blocked start",calls.every(c=>["/api/auth/session","/api/app/start"].includes(c.path)),calls);
    verify("no automatic push scheduled or subscribed",await evaluate("__uiPush.scheduled===0 && __uiPush.subscribed===0"));
    verify("no specialist content fabricated",await evaluate("!document.querySelector('.ui-briefing-hero,.ui-vorgang-row,.radar2-card,.buero-draft-card')"));
    if(["no-mandate","session-503"].includes(label)) await screenshot("startup-state");
  } else if(label.startsWith("quiet-")) {
    // Ruhiger Tag: ehrlicher Leerzustand im Briefing; Lage-Themen nur gezählt und über die Lage erreichbar.
    const pending=label.includes("-pending-");
    const lageTexts=[...(payload.briefing.lageBriefing.paragraphs||[]).map(p=>p.text),
      ...payload.briefing.lageBriefing.vorgaenge.map(v=>v.displaySummary).filter(Boolean)];
    verify("quiet bootstrap completes with simulated push only",await waitFor("pushConfig?.subscriptionCount===1")
      && calls.filter(c=>c.method!=="GET").every(c=>c.path==="/api/push/subscribe"));
    await nav("helmut");
    verify("quiet Briefing shows honest empty state",await waitFor("!!document.querySelector('.hstand-state-card--quiet')"));
    verify("quiet Briefing shows no Lage texts, only count and way to Lage",await evaluate(`(()=>{
      const card=document.querySelector('.hstand-state-card--quiet'),app=document.querySelector('#app').textContent;
      return card.textContent.includes('Heute kein neuer Tagesanlass') && /In der Lage laufen \\d+ Themen weiter\\./.test(card.textContent)
        && !document.querySelector('[data-briefing-overview],[data-ui-jump]') && ${JSON.stringify(lageTexts)}.every(t=>!app.includes(t));
    })()`));
    verify("quiet receipt status and time are honest",await evaluate(`(()=>{
      const status=document.querySelector('.hstand-status').textContent,meta=document.querySelector('.hstand-meta-line').textContent;
      return status.includes('Aktuell') && status.includes('keine neue Tagespriorität') && meta.includes('06:15') && !meta.includes('15:37') &&
        !document.querySelector('.ui-briefing-hero') && !document.querySelector('#app').textContent.includes('Ältere Vorgänge stehen unten');
    })()`));
    const layout=()=>evaluate(`(()=>{
      const page=document.querySelector('#uiPage');
      return document.documentElement.scrollWidth<=innerWidth+1 && document.body.scrollWidth<=innerWidth+1 &&
        (!page || page.scrollWidth<=page.clientWidth+1);
    })()`);
    verify("quiet empty state has no horizontal overflow",await layout());
    await screenshot("quiet-briefing");
    verify("quiet empty state leads to Lage",await evaluate(`(()=>{
      const button=document.querySelector('.hstand-state-card--quiet [data-view="briefing"]');if(!button)return false;button.click();
      return currentView==='briefing';
    })()`));
    verify("quiet Lage retains all supplied cards",await waitFor(`document.querySelectorAll('.ui-vorgang-row').length===${pending ? 9 : 10}`));
    verify("quiet Lage has no horizontal overflow",await layout());
    await nav("radar");
    await nav("helmut");
    verify("quiet read and navigation never trigger generation or extra bootstrap",calls.filter(c=>c.path==="/api/app/start").length===1
      && calls.every(c=>["/api/auth/session","/api/app/start","/api/parliament","/api/push/public-key","/api/security/csrf","/api/push/subscribe"].includes(c.path)),calls);
    verify("quiet empty state survives navigation",await evaluate("!!document.querySelector('.hstand-state-card--quiet')"));
  } else {
    verify("successful startup permits simulated push sync",await waitFor("pushConfig?.subscriptionCount===1") && await evaluate("__uiPush.scheduled===1 && __uiPush.subscribed===1"));
    verify("bootstrap writes only simulated push; empty office formats produce no drafts",calls.filter(c=>c.method!=="GET").length===1 && calls.some(c=>c.path==="/api/push/subscribe") && !calls.some(c=>c.path==="/api/communication/generate"));
    verify("profile/version/tasks/notes adopted",await evaluate("profile.id==='ui-binding-profile' && appBuildVersion==='ui-contract-fixture' && tasks.some(t=>t.id==='task-contract') && notes[0].id==='note-contract'"));
    await nav("briefing");
    verify("partial Lage keeps proven cards and exposes missing current text",await evaluate("document.querySelector('[data-ui-lage-partial]').innerText.includes('aktuelle, datierte Quellen') && document.querySelectorAll('.ui-vorgang-row').length===1"));
    verify("Lage source comes from actual name/url schema",await evaluate("document.querySelector('.ui-lage-detail').textContent.includes('Synthetische amtliche Quelle') && !!document.querySelector('.ui-lage-detail a[href=\"https://example.test/ui/lage\"]')"));
    await screenshot("partial-lage");
    await nav("radar");
    verify("curated Radar projection wins over raw candidates",await evaluate("document.querySelector('#radar2-root').innerText.includes('Kuratierter Radarhinweis') && !document.querySelector('#radar2-root').innerText.includes('ROH') && !!document.querySelector('.radar2-card--mention[href=\"https://example.test/ui/curated\"]')"));
    verify("curated freshness used and raw article feed withheld",await evaluate("document.querySelector('.radar2-status').innerText.includes('Letzter Stand') && !document.querySelector('.radar2-section--articles')"));
    verify("view switches cause no extra start/Radar fetch",calls.filter(c=>c.path==="/api/app/start").length===1 && !calls.some(c=>c.path.startsWith('/api/radar')));
    await screenshot("curated-radar");

    if(!mobile) {
      const configure=async (name,office="rule",token="valid")=>{phase=name;officeMode=office;tokenMode=token;officeAttempt=0;await evaluate("csrfTokenPromise=null");};
      const send=()=>evaluate(`(async()=>{try{const r=await fetchWithTimeout('/api/communication/generate?'+apiScopeQuery(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Synthetischer Test',channel:'press',decision:decisions[0]})});return {status:r.status,body:await r.json()};}catch(e){return {error:e.message};}})()`);
      await configure("csrf-refresh","csrf-once");
      let result=await send();
      verify("explicit CSRF rejection rotates token once",result.status===200 && count('/api/security/csrf')===2 && count('/api/communication/generate')===2,result);
      await configure("business-denial","forbidden");
      result=await send();
      verify("ordinary permission denial not replayed and body remains readable",result.status===403 && result.body.reason==='communication-forbidden' && count('/api/communication/generate')===1 && count('/api/security/csrf')===1,result);
      await configure("csrf-persistent","csrf-always");
      result=await send();
      verify("persistent CSRF failure stops after one retry",result.status===403 && count('/api/communication/generate')===2 && count('/api/security/csrf')===2);
      for(const mode of ["unavailable","missing"]) {
        await configure("csrf-token-"+mode,"rule",mode);
        result=await send();
        verify("invalid CSRF prerequisite blocks write: "+mode,Boolean(result.error) && count('/api/communication/generate')===0 && count('/api/security/csrf')===1,result);
      }
      await configure("protected-get");
      await evaluate("Promise.all(['/api/lage/briefing','/api/push/test'].map(path=>fetchWithTimeout(path+'?'+apiScopeQuery()).then(r=>r.json()))).then(()=>true)");
      verify("both additional state-changing GETs carry CSRF",calls.filter(c=>c.phase===phase && ['/api/lage/briefing','/api/push/test'].includes(c.path)).length===2 && calls.filter(c=>c.phase===phase && ['/api/lage/briefing','/api/push/test'].includes(c.path)).every(c=>c.csrfHeaderPresent));
      await configure("office-rate-limit","rate-limit");
      await evaluate("profile.officeFormats=['presse'];currentView='office';generateOfficeDraftsInBackground().then(()=>true)");
      verify("office HTTP 429 shown as failure without ready drafts",await evaluate("Object.keys(officeDrafts).length===0 && Object.keys(officeDraftErrors).length===2 && document.querySelector('.ui-page').innerText.includes('Erstellung fehlgeschlagen')") && count('/api/communication/generate')===2);
      await configure("office-budget-fallback");
      await evaluate("generateOfficeDraftsInBackground().then(()=>true)");
      verify("budget fallback marked as rule output, not AI",await evaluate("Object.values(officeDrafts).length===2 && Object.values(officeDrafts).every(d=>d.source==='regel') && document.querySelector('.ui-page').innerText.includes('Regelbasierter Entwurf') && !document.querySelector('.ui-page').innerText.includes('KI-Entwurf · vor Veröffentlichung prüfen')"));
    }
  }
  if(!briefingReadOnly && label.startsWith("contract-")) await verifyBriefingRead();
  verify("no unknown API request",unexpected.length===0,unexpected);
  runs.push({label,calls:JSON.parse(JSON.stringify(calls)),unexpected:[...unexpected],push:await evaluate("__uiPush")});
}
module.exports={viewports,reset,preload,apiResponse,run,evidence:()=>runs,
  readyExpression:"typeof loadBriefing==='function' && !briefingRefreshing && document.body.classList.contains('splash-gone') && !!document.querySelector('#app h1')"};
