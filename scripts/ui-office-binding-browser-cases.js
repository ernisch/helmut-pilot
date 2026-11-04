"use strict";

const assert = require("assert/strict");
const { payloadFor } = require("./fixtures/ui-office-binding");
let scenario, writes, reads, unexpected, holdNext, releaseResponse;
const runs = [];
function reset() { scenario = "valid"; writes = []; reads = []; unexpected = []; holdNext = false; releaseResponse = null; }
reset();

function apiResponse(request) {
  const url = new URL(request.url), method = request.method;
  const payload = payloadFor(scenario);
  if (method === "GET") {
    reads.push(url.pathname);
    if (url.pathname === "/api/auth/session") return { authenticated: true, mode: "accounts",
      user: { id: "ui-binding-user", role: "abgeordneter", politicianId: payload.profile.id,
        name: "Synthetisches UI Profil", notificationSettings: {} }, profiles: [payload.profile] };
    if (url.pathname === "/api/app/start") return payload;
    if (url.pathname === "/api/security/csrf") return { token: "synthetic-csrf-token" };
    if (url.pathname === "/api/parliament") return { items: [] };
    if (url.pathname === "/api/ops/status") return { learning: { eventCount: 0 } };
    if (url.pathname === "/api/push/public-key") return { enabled: false, publicKey: "" };
  }
  if (method === "POST" && url.pathname === "/api/communication/generate") {
    const body = JSON.parse(request.postData);
    assert.equal(Object.entries(request.headers).find(([name]) => name.toLowerCase() === "x-csrf-token")?.[1], "synthetic-csrf-token");
    assert.ok(["Sofort reagieren", "Beobachten"].includes(body.decision.decision));
    assert.ok(body.decision.vorgang_id && body.decision.knowledge_object_id && body.decision.id);
    writes.push({ method, path: url.pathname, scenario, body, csrfVerified: true, simulated: true });
    const response = { aiEnabled: false, channelLabel: body.channel,
      text: `Synthetischer Entwurf für ${body.decision.vorgang_id}. Nur UI-Testdaten. `.repeat(4) };
    if (holdNext) { holdNext = false; return new Promise(resolve=>{releaseResponse=()=>resolve(response);}); }
    return response;
  }
  unexpected.push({method,path:url.pathname});
  throw Error(`Unmocked request prohibited: ${method} ${url.pathname}`);
}

async function run({ cdp, session:s, label, mobile, check, screenshot }) {
  const evaluate = expression => cdp.evaluate(s, expression);
  const verify = (name, value, detail) => check(label+": "+name, value, detail);
  const waitFor = async expression => {
    for (let i=0;i<150;i++) {
      if (await evaluate(expression)) return true;
      await new Promise(resolve=>setTimeout(resolve,40));
    }
    return false;
  };
  const click = async selector => {
    const {x,y} = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
    if (mobile) {
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]},s);
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]},s);
    } else {
      await cdp.send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,x,y},s);
      await cdp.send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,x,y},s);
    }
  };
  const nav = view => `${mobile ? ".mobile-dock" : ".sidebar .nav-list"} [data-view="${view}"]`;
  verify("normal bootstrap and automatic drafts complete",await waitFor("!briefingRefreshing && !officeDraftsGenerating"));
  verify("real auth and CSRF path simulated",reads.includes("/api/auth/session") && reads.includes("/api/security/csrf") && reads.includes("/api/app/start"));
  verify("two formats per eligible record; ignored record never generated",writes.length===4 && writes.every(r=>r.body.decision.vorgang_id!=="vorgang-ignored"),writes);
  verify("record, KO and vorgang identities remain distinct",await evaluate("decisions[0].id==='rec-a' && decisions[0].knowledge_object_id==='ko-a' && decisions[0].knowledgeObjectId==='ko-a' && decisions[0].vorgang_id==='vorgang-a' && decisions[0].vorgangId==='vorgang-a' && decisions[0].decision==='Beobachten'"));
  verify("server primary remains first despite higher scores",await evaluate("decisions.map(d=>d.id).join(',')==='rec-a,rec-b'"));

  if (!mobile) {
    const samples = [
      {name:"legacy signal kept separate",input:{id:"rec-only",signal_id:"legacy-signal",knowledge_object_id:"ko-only",vorgang_id:"vorgang-only",decision:"Beobachten"},expected:{id:"rec-only",signalId:"legacy-signal",knowledgeObjectId:"ko-only",knowledge_object_id:"ko-only",vorgangId:"vorgang-only",vorgang_id:"vorgang-only",decision:"Beobachten"}},
      {name:"V3 signal uses explicit KO identity",input:{id:"rec-only",knowledge_object_id:"ko-only",vorgang_id:"vorgang-only",decision:"Ignorieren"},expected:{id:"rec-only",signalId:"ko-only",knowledgeObjectId:"ko-only",knowledge_object_id:"ko-only",vorgangId:"vorgang-only",vorgang_id:"vorgang-only",decision:"Ignorieren"}},
      {name:"missing identities not guessed from id or signal",input:{id:"vorgang-lookalike",signal_id:"ko-lookalike"},expected:{id:"vorgang-lookalike",signalId:"ko-lookalike"}},
      {name:"equal-looking namespace values not swapped",input:{id:"vorgang-a",knowledge_object_id:"rec-a",vorgang_id:"ko-a",decision:"Beobachten"},expected:{id:"vorgang-a",signalId:"rec-a",knowledgeObjectId:"rec-a",knowledge_object_id:"rec-a",vorgangId:"ko-a",vorgang_id:"ko-a",decision:"Beobachten"}}
    ];
    for (const sample of samples) {
      const value = await evaluate(`(()=>{const d=toDecision(recommendationToDecisionItem(${JSON.stringify(sample.input)}));return Object.fromEntries(['id','signalId','knowledgeObjectId','knowledge_object_id','vorgangId','vorgang_id','decision'].filter(k=>d[k]!==undefined).map(k=>[k,d[k]]));})()`);
      verify(sample.name,JSON.stringify(value)===JSON.stringify(sample.expected),value);
    }
    verify("camelCase item identity and decision retained",await evaluate("(()=>{const d=toDecision({id:'item-c',knowledgeObjectId:'ko-c',vorgangId:'vorgang-c',decision:'Beobachten'});return d.knowledge_object_id==='ko-c' && d.vorgang_id==='vorgang-c' && d.decision==='Beobachten';})()"));
  }

  await click(nav("office"));
  await click('[data-office-open="rec-b-presse"]');
  verify("second record selected through real card",await evaluate("selectedOfficeDraft.decision.vorgangId==='vorgang-b'"));
  await click(nav("helmut"));
  verify("Briefing after navigation ready",await waitFor("!!document.querySelector('[data-briefing-office]')"));
  const beforeOpen=writes.length;
  await click("[data-briefing-office]");
  verify("Briefing opens its own record, not previous selection",await evaluate("currentView==='office-detail' && selectedOfficeDraft.decision.vorgangId==='vorgang-a' && selectedOfficeDraft.decision.knowledgeObjectId==='ko-a' && document.querySelector('.ui-office-detail').textContent.includes('Entwurf für vorgang-a')"));
  verify("handoff itself starts no generation",writes.length===beforeOpen);
  await screenshot("briefing-office-bound");

  scenario="target-gone";
  await evaluate("loadBriefing().then(()=>true)");
  verify("lost target does not silently select another record",await evaluate("selectedOfficeDraft===null && !!officeBriefingTarget && document.querySelector('.ui-office-detail').textContent.includes('nicht eindeutig zugeordnet')"));
  verify("missing-target hint stays visible after refresh",await evaluate("getComputedStyle(document.querySelector('.ui-office-detail')).display!=='none'"));
  verify("lost primary causes no automatic generation",writes.length===beforeOpen);
  await screenshot("missing-target");

  const scenarios=mobile ? ["missing-vorgang"] : ["missing-vorgang","missing-knowledge","missing-record","missing-primary","missing-decision","ignored","conflicting-id","duplicate"];
  for (const kind of scenarios) {
    scenario=kind;
    const before=writes.length;
    await evaluate("officeDrafts={};officeDraftErrors={};localStorage.removeItem(officeDraftCacheKey());persistView('helmut');currentView='helmut';loadBriefing().then(()=>true)");
    verify(kind+" blocks automatic generation",await waitFor("!officeDraftsGenerating") && writes.length===before);
    verify(kind+" disables handoff with honest hint",await evaluate("!!document.querySelector('[data-briefing-office]:disabled') && document.querySelector('#ui-office-binding-hint')?.textContent.includes('Kein eindeutig zugeordneter Büroentwurf')"));
    verify(kind+" rejects programmatic handoff without fallback",await evaluate("openOfficeForBriefing()===false && selectedOfficeDraft===null && currentView==='helmut'") && writes.length===before);
  }
  if (!mobile) {
    scenario="valid";
    await evaluate("loadBriefing().then(()=>true)");
    verify("valid mapping recovers after missing data",await waitFor("!officeDraftsGenerating") && await evaluate("!!briefingOfficeDecision()"));
    const beforePending = writes.length;
    holdNext = true;
    await evaluate("officeDrafts={};localStorage.removeItem(officeDraftCacheKey());loadBriefing().then(()=>true)");
    for(let i=0;i<100 && !releaseResponse;i++) await new Promise(resolve=>setTimeout(resolve,20));
    verify("simulated generation response can be delayed",typeof releaseResponse === "function");
    scenario = "ignored";
    await evaluate("loadBriefing().then(()=>true)");
    releaseResponse();
    verify("reclassified record stops subsequent generation",await waitFor("!officeDraftsGenerating") && writes.length===beforePending+1);
    verify("outdated pending draft is not adopted",await evaluate("Object.keys(officeDrafts).length===0 && officeDecisions().length===0"));
    scenario = "valid";
    await evaluate("loadBriefing().then(()=>true)");
    verify("generation recovers with a valid assignment",await waitFor("!officeDraftsGenerating") && await evaluate("Object.keys(officeDrafts).length===4"));
    const before=writes.length;
    await evaluate("previewMode=true;officeDrafts={};generateOfficeDraftsInBackground().then(()=>true)");
    verify("read-only preview generates no drafts",writes.length===before);
  }
  verify("only explicitly mocked APIs requested",unexpected.length===0,unexpected);
  runs.push({label,writes:JSON.parse(JSON.stringify(writes)),reads:[...reads],unexpected:[...unexpected]});
}

module.exports={reset,apiResponse,run,evidence:()=>runs};
