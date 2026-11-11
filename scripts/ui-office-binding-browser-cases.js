"use strict";

const assert = require("assert/strict");
const { payloadFor } = require("./fixtures/ui-office-binding");
let scenario, writes, reads, unexpected, holdNext, releaseResponse, failureReason;
const runs = [];
function reset() { scenario = "valid"; writes = []; reads = []; unexpected = []; holdNext = false; releaseResponse = null; failureReason = null; }
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
    assert.equal(body.office, true, "Büro must use the verified existing communication route mode");
    assert.equal(body.userInitiated, true, "Only an explicit create action may reach the office API");
    assert.equal(Object.entries(request.headers).find(([name]) => name.toLowerCase() === "x-csrf-token")?.[1], "synthetic-csrf-token");
    assert.ok(["Sofort reagieren", "Beobachten"].includes(body.decision.decision));
    assert.ok(body.decision.vorgang_id && body.decision.knowledge_object_id && body.decision.id);
    writes.push({ method, path: url.pathname, scenario, body, csrfVerified: true, simulated: true });
    if (failureReason) return { aiEnabled:false, degraded:true, fallbackReason:failureReason, text:"",
      sourceNote:"Untrusted provider detail must never be displayed" };
    const response = { aiEnabled: true, channel: body.channel, channelLabel: body.channel,
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
  const layout = async name => {
    const info = await evaluate("({width:innerWidth,doc:document.documentElement.scrollWidth,page:document.querySelector('.ui-page').scrollWidth,client:document.querySelector('.ui-page').clientWidth})");
    verify(name+" has no horizontal overflow", info.doc<=info.width && info.page<=info.client, info);
  };
  verify("normal bootstrap complete",await waitFor("!briefingRefreshing && !officeDraftsGenerating"));
  verify("real auth and app-start path simulated",reads.includes("/api/auth/session") && reads.includes("/api/app/start"));
  verify("app start makes no model requests",writes.length===0,writes);
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
  verify("one compact row per eligible occasion",await evaluate("document.querySelectorAll('[data-office-open]').length===2"));
  verify("new overview honestly counts zero drafts",await evaluate("document.querySelector('[data-office-count]').textContent==='2 Themen · 0 Entwürfe' && selectedOfficeDraft===null") && writes.length===0);
  await evaluate("Promise.all([ensureViewData('office'),ensureViewData('office-detail'),ensureViewData('tasks')]).then(()=>true)");
  verify("opening and reloading views creates nothing",writes.length===0);
  const previousStarts = reads.filter(path=>path==='/api/app/start').length;
  await cdp.send("Page.reload",{},s);
  let restored=false;
  for (let i=0;i<150 && !restored;i++) {
    try {
      restored=reads.filter(path=>path==='/api/app/start').length>previousStarts
        && await evaluate("typeof briefingRefreshing!=='undefined' && !briefingRefreshing && currentView==='office' && document.querySelector('[data-office-count]')?.textContent==='2 Themen · 0 Entwürfe'");
    } catch (_) { /* A real reload destroys the old execution context. */ }
    if (!restored) await new Promise(resolve=>setTimeout(resolve,40));
  }
  verify("real page reload restores Büro with zero generated drafts",restored && writes.length===0);
  verify("no editor, prompt or direct mail action",await evaluate("!document.querySelector('.buero-view input,.buero-view textarea,.buero-view [contenteditable=true],.buero-view a[href^=\"mailto:\"]')"));
  await layout("occasion list"); await screenshot("office-recommendations");
  const initialTheme = await evaluate("document.documentElement.dataset.theme || 'dark'");
  for (const theme of ["dark", "light"]) {
    await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await layout(theme+" compact overview"); await screenshot(theme+"-office-overview");
  }
  await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(initialTheme)}`);
  const longTitle = "Synthetischer langer parlamentarischer Vorgang mit vollständigem Originaltitel und einer sehr ausführlichen Beschreibung zur Prüfung der kompakten Übersicht";
  const oldTitle = await evaluate("decisions[1].title");
  await evaluate(`decisions[1].title=${JSON.stringify(longTitle)};render()`);
  verify("long original title remains accessible and uses at most two visible lines",await evaluate(`(()=>{const e=document.querySelectorAll('.buero-card-title')[1],s=getComputedStyle(e);return e.textContent===${JSON.stringify(longTitle)} && e.getBoundingClientRect().height<=parseFloat(s.lineHeight)*2+1 && e.closest('[data-office-open]').getAttribute('aria-label').includes(e.textContent);})()`));
  await evaluate(`decisions[1].title=${JSON.stringify(oldTitle)};render()`);
  const bSelector = await evaluate("'[data-office-open=\"'+document.querySelectorAll('[data-office-open]')[1].dataset.officeOpen+'\"]'");
  await click(bSelector);
  verify("topic opens a modal format choice without spending",await evaluate("document.querySelector('[data-office-format-sheet]').matches(':modal') && selectedOfficeDraft===null") && writes.length===0);
  verify("no format is preselected or recommended by default",await evaluate("!document.querySelector('[data-office-format-sheet] [selected], [data-office-format-sheet] [aria-checked=true]') && !document.querySelector('[data-office-format-sheet]').textContent.includes('Empfohlen')"));
  await screenshot("office-format-choice");
  for (const theme of ["dark", "light"]) {
    await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    verify(theme+" sheet stays inside the viewport",await evaluate("(()=>{const e=document.querySelector('[data-office-format-sheet]'),b=e.getBoundingClientRect();return b.left>=0 && b.right<=innerWidth+1 && b.top>=0 && b.bottom<=innerHeight+1 && e.scrollWidth<=e.clientWidth;})()"));
    await screenshot(theme+"-office-format-choice");
  }
  await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(initialTheme)}`);
  await click("[data-office-format-close]");
  verify("cancel restores the topic focus and creates nothing",await evaluate("!document.querySelector('[data-office-format-sheet]') && document.activeElement.matches('[data-office-open]')") && writes.length===0);
  await click(bSelector);
  await cdp.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27},s);
  await cdp.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27},s);
  verify("Escape dismisses the sheet without spending",await waitFor("!document.querySelector('[data-office-format-sheet]')") && writes.length===0);
  await click(bSelector);
  await click('[data-office-create="intern"]');
  verify("selected draft generated only when needed",await waitFor("!officeDraftsGenerating && document.querySelector('.ui-office-detail').textContent.includes('Entwurf für vorgang-b')"));
  verify("second occasion selected with explicit KO and record",await evaluate("selectedOfficeDraft.decision.vorgangId==='vorgang-b' && selectedOfficeDraft.decision.knowledgeObjectId==='ko-b'"));
  verify("exactly the explicitly requested draft is generated",writes.length===1 && writes[0].body.decision.vorgang_id==='vorgang-b' && writes[0].body.channel==='internal_line',writes);
  verify("CSRF verified for the on-demand request",reads.includes("/api/security/csrf") && writes.every(r=>r.csrfVerified));
  verify("sources open original article securely",await evaluate("!!document.querySelector('.ui-office-detail a[href=\"https://example.test/ui/beleg\"][target=_blank][rel=\"noopener noreferrer\"]')"));
  await layout("draft detail"); await screenshot("office-detail");

  await click(nav("helmut"));
  verify("Briefing after navigation ready",await waitFor("!!document.querySelector('[data-briefing-office]')"));
  await click("[data-briefing-office]");
  verify("Briefing handoff also requires format choice",await evaluate("document.querySelector('[data-office-format-sheet]').matches(':modal') && selectedOfficeDraft===null") && writes.length===1);
  await click('[data-office-create="intern"]');
  verify("Briefing opens its own occasion, not previous selection",await waitFor("!officeDraftsGenerating && currentView==='office-detail' && selectedOfficeDraft.decision.vorgangId==='vorgang-a' && selectedOfficeDraft.decision.knowledgeObjectId==='ko-a' && document.querySelector('.ui-office-detail').textContent.includes('Entwurf für vorgang-a')"));
  let afterOpen=writes.length;
  await click(nav("helmut")); await click("[data-briefing-office]");
  verify("valid draft cache reused without another call",await waitFor("!officeDraftsGenerating") && writes.length===afterOpen);
  await screenshot("briefing-office-bound");

  verify("alternative formats initially hidden",await evaluate("!document.querySelector('[data-office-format-sheet]')"));
  await click("[data-office-choose]");
  verify("opening alternatives alone generates nothing",writes.length===afterOpen);
  await click(".buero-more-formats > summary");
  verify("expanding more formats generates nothing",writes.length===afterOpen);
  await click('[data-office-create="linkedin"]');
  verify("explicit alternative generates exactly one new draft",await waitFor("!officeDraftsGenerating && selectedOfficeDraft.format.id==='linkedin' && !!document.querySelector('[data-office-share]')") && writes.length===afterOpen+1 && writes.at(-1).body.channel==='linkedin');
  await click("[data-office-choose]");
  verify("saved format is clearly offered to open",await evaluate("document.querySelector('[data-office-create=intern]').textContent.includes('öffnen')"));
  await click('[data-office-create="intern"]');
  verify("return to existing format reuses its cache",await waitFor("!officeDraftsGenerating && selectedOfficeDraft.format.id==='intern'") && writes.length===afterOpen+1);
  await click("[data-office-back]");
  verify("overview counts actual drafts rather than topics",await evaluate("document.querySelector('[data-office-count]').textContent==='2 Themen · 3 Entwürfe'") && writes.length===afterOpen+1);
  await click("[data-office-open]");
  verify("opening a prepared topic never creates another draft",writes.length===afterOpen+1);
  await click("[data-office-choose]");
  await click('[data-office-create="intern"]');
  afterOpen=writes.length;

  verify("same-day briefing read timestamp preserves valid cache",await evaluate("(()=>{const old=briefing.generatedAt;const d=new Date(old);d.setUTCSeconds((d.getUTCSeconds()+1)%60);briefing.generatedAt=d.toISOString();const valid=!!officeDraftEntry(selectedOfficeDraft.decision,selectedOfficeDraft.format);briefing.generatedAt=old;return valid;})()"));
  verify("profile changes invalidate a cached draft",await evaluate("(()=>{const old=profile.communicationStyle;profile.communicationStyle='Changed synthetic style';const invalid=!officeDraftEntry(selectedOfficeDraft.decision,selectedOfficeDraft.format);profile.communicationStyle=old;return invalid;})()"));
  verify("changed source facts invalidate a cached draft",await evaluate("(()=>{const d=selectedOfficeDraft.decision,old=d.sources[0].excerpt;d.sources[0].excerpt='A different synthetic source statement';const invalid=!officeDraftEntry(d,selectedOfficeDraft.format);d.sources[0].excerpt=old;return invalid;})()"));
  verify("expired cache cannot appear as a finished draft",await evaluate("(()=>{const key=officeDraftKey(selectedOfficeDraft.decision,selectedOfficeDraft.format),old=officeDrafts[key].createdAt;officeDrafts[key].createdAt=Date.now()-25*60*60*1000;const invalid=!officeDraftEntry(selectedOfficeDraft.decision,selectedOfficeDraft.format);officeDrafts[key].createdAt=old;return invalid;})()"));
  verify("cache validation causes no hidden requests",writes.length===afterOpen);
  for (const theme of ['dark','light']) {
    await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    await layout(theme+" draft detail"); await screenshot(theme+"-office-detail");
  }

  // Sharing is driven through the actual visible button with a user gesture.
  await evaluate("window.__shareCalls=[];window.__copied=[];Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shareCalls.push(data);}});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__copied.push(text)}})");
  await click("[data-office-share]");
  verify("native share receives selected text on explicit action",await waitFor("window.__shareCalls.length===1") && await evaluate("window.__shareCalls[0].text.includes('Entwurf für vorgang-a') && window.__copied.length===0"));
  await evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Synthetic cancellation','AbortError');}})");
  await click("[data-office-share]");
  verify("cancelled share never silently copies",await evaluate("window.__copied.length===0"));
  await evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw Error('Synthetic native sharing failure');}})");
  await click("[data-office-share]");
  verify("native sharing failure offers explicit clipboard action",await waitFor("!!document.querySelector('[data-office-copy-fallback]')") && await evaluate("window.__copied.length===0 && document.querySelector('[data-office-share]').textContent.includes('Teilen')"));
  await click("[data-office-copy-fallback]");
  verify("clipboard fallback requires explicit action",await waitFor("window.__copied.length===1") && await evaluate("window.__copied[0].includes('Entwurf für vorgang-a')"));
  await evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:undefined})");
  await click("[data-office-share]");
  verify("unsupported native share has honest clipboard alternative",await waitFor("window.__copied.length===2") && await evaluate("window.__copied[1].includes('Entwurf für vorgang-a')"));
  await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Synthetic clipboard denial');}}});document.execCommand=()=>false");
  await click("[data-office-share]");
  verify("clipboard failure reported without false success",await waitFor("/nicht möglich|nicht geteilt|nicht kopiert|fehlgeschlagen/i.test(document.querySelector('#toast').textContent)"));

  // Refresh must not redirect a now-missing explicit Briefing target.
  await click(nav("helmut")); await click("[data-briefing-office]");
  scenario="target-gone";
  await evaluate("loadBriefing().then(()=>true)");
  verify("lost target does not silently select another occasion",await evaluate("selectedOfficeDraft===null && !!officeBriefingTarget && document.querySelector('.ui-office-detail').textContent.includes('nicht eindeutig zugeordnet')"));
  verify("missing-target hint remains visible",await evaluate("getComputedStyle(document.querySelector('.ui-office-detail')).display!=='none'"));
  verify("refresh starts no model request",writes.length===afterOpen);
  await screenshot("missing-target");

  const scenarios=mobile ? ["missing-vorgang","missing-source","thin-source"] : ["missing-vorgang","missing-knowledge","missing-record","missing-primary","missing-decision","ignored","conflicting-id","duplicate","missing-source","thin-source"];
  for (const kind of scenarios) {
    scenario=kind;
    const before=writes.length;
    await evaluate("officeDrafts={};officeDraftErrors={};localStorage.removeItem(officeDraftCacheKey());persistView('helmut');currentView='helmut';loadBriefing().then(()=>true)");
    verify(kind+" cannot cause generation",await waitFor("!officeDraftsGenerating") && writes.length===before);
    verify(kind+" disables handoff honestly",await evaluate("!!document.querySelector('[data-briefing-office]:disabled') && document.querySelector('#ui-office-binding-hint')?.textContent.includes('Kein eindeutig zugeordneter Büroentwurf')"));
    verify(kind+" rejects handoff without fallback",await evaluate("openOfficeForBriefing()===false && selectedOfficeDraft===null && currentView==='helmut'") && writes.length===before);
  }
  for (const kind of ["land-mandate","unknown-mandate"]) {
    scenario=kind;
    const before=writes.length;
    await evaluate("officeDrafts={};officeDraftErrors={};officeBriefingTarget=null;selectedOfficeDraft=null;persistView('helmut');currentView='helmut';loadBriefing().then(()=>true)");
    verify(kind+" refresh remains free of model calls",writes.length===before);
    verify(kind+" committee alternatives follow known mandate",await evaluate(kind==='land-mandate'
      ? "profileParliamentType()==='Landtag' && activeOfficeFormats().some(f=>f.id==='anfrage')"
      : "!profile.parliamentType && !profile.politische_ebene && profile.politicalLevel==='Bund' && !activeOfficeFormats().some(f=>f.id==='anfrage')"));
  }
  if (!mobile) {
    scenario="valid";
    await evaluate("officeDrafts={};officeDraftErrors={};officeBriefingTarget=null;selectedOfficeDraft=null;persistView('helmut');currentView='helmut';loadBriefing().then(()=>true)");
    holdNext=true;
    await click("[data-briefing-office]");
    await click('[data-office-create="intern"]');
    for (let i=0;i<100 && !releaseResponse;i++) await new Promise(resolve=>setTimeout(resolve,20));
    verify("a pending draft response can be held",typeof releaseResponse==='function');
    scenario="ignored";
    await evaluate("loadBriefing().then(()=>true)");
    releaseResponse();
    verify("reclassified occasion rejects the pending response",await waitFor("!officeDraftsGenerating") && await evaluate("Object.keys(officeDrafts).length===0 && officeDecisions().length===0"));
    scenario="valid";
    await evaluate("officeDrafts={};officeDraftErrors={};officeBriefingTarget=null;selectedOfficeDraft=null;persistView('helmut');currentView='helmut';loadBriefing().then(()=>true)");
    const before=writes.length;
    await evaluate("previewMode=true;selectedOfficeDraft=uiOfficeSelection(officeDecisions()[0],recommendedOfficeFormat(officeDecisions()[0]).format);generateSelectedOfficeDraft({userInitiated:true}).then(()=>true)");
    verify("read-only preview never generates",writes.length===before);
    await evaluate("selectedOfficeDraft=null;currentView='office';render()");
    await click("[data-office-open]");
    verify("preview visibly disables creating drafts",await evaluate("Array.from(document.querySelectorAll('[data-office-create]')).every(button=>button.disabled) && document.querySelector('[data-office-format-sheet]').textContent.includes('Vorschau erstellt keine neuen Entwürfe')") && writes.length===before);
    await click("[data-office-format-close]");
    verify("preview label remains visible in the compact overview",await evaluate("Array.from(document.querySelectorAll('.ui-preview-label')).some(label=>label.checkVisibility())"));
    await evaluate("previewMode=false;selectedOfficeDraft=null");
  }
  if (!mobile) {
    for (const [reason,fragment] of [["quellenbasis-fehlt","Originaltextbasis"],["zustaendigkeit-offen","parlamentarische Zuständigkeit"],["budget-erschoepft","KI-Kontingent"],["entwurf-nicht-freigegeben","nicht freigegeben"],["kostenpruefung-fehlgeschlagen","nicht bestätigt"]]) {
      failureReason=reason;
      const before=writes.length;
      await evaluate("officeDrafts={};officeDraftErrors={};localStorage.removeItem(officeDraftCacheKey());selectedOfficeDraft=uiOfficeSelection(officeDecisions()[0],recommendedOfficeFormat(officeDecisions()[0]).format);currentView='office-detail';render()");
      await click('[data-office-generate]');
      await waitFor("!officeDraftsGenerating");
      const retry=reason==="kostenpruefung-fehlgeschlagen";
      verify(reason+" shows the matching message and retry",await evaluate(`document.querySelector('.ui-office-detail').textContent.includes(${JSON.stringify(fragment)}) && !document.querySelector('[data-office-share]') && !!document.querySelector('[data-office-generate]') === ${retry} && !document.querySelector('.ui-office-detail').textContent.includes('Untrusted provider detail')`) && writes.length===before+1,{writes:writes.length-before,state:await evaluate("({errors:officeDraftErrors,body:document.querySelector('.ui-office-detail').textContent,share:!!document.querySelector('[data-office-share]'),retry:!!document.querySelector('[data-office-generate]')})")});
    }
    failureReason=null;
  }
  verify("only explicitly mocked APIs requested",unexpected.length===0,unexpected);
  runs.push({label,writes:JSON.parse(JSON.stringify(writes)),reads:[...reads],unexpected:[...unexpected]});
}

module.exports={reset,apiResponse,run,evidence:()=>runs,
  viewports:[["desktop",1440,900,false],["mobile",390,844,true],["mobile-360",360,780,true]]};
