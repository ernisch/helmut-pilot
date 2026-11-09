"use strict";

// Real Chromium + real client/CSS with fixture responses. No HTTP server,
// Playwright installation, server.js, database, provider or motor import.
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { createHash } = require("crypto");
const { spawn, execFileSync } = require("child_process");
const { payload, item } = require("./fixtures/ui-preview");
const contractCases = process.argv.includes("--integration-contracts") ? require("./ui-integration-contract-browser-cases") : null;
const bindingCases = contractCases || (process.argv.includes("--office-binding") ? require("./ui-office-binding-browser-cases") : null);
const root = path.resolve(__dirname, "..");
const baselineIndex = process.argv.indexOf("--baseline-ref");
const baselineRef = baselineIndex < 0 ? "" : process.argv[baselineIndex + 1];
const readingFollowup = process.argv.includes("--reading-followup");
assert(!readingFollowup || (!baselineRef && !bindingCases), "Follow-up uses current fixture UI only");
assert(!baselineRef || /^[a-f0-9]{40}$/.test(baselineRef), "Baseline must be an exact local commit");
assert(!baselineRef || !bindingCases, "Baseline applies only to the fixture UI runner");
const readAppFile = file => baselineRef && ["client.js", "styles.css", "index.html"].includes(file)
  ? execFileSync("git", ["show", `${baselineRef}:${file}`], { cwd: root })
  : fs.readFileSync(path.join(root, file));
const output = path.join(root, baselineRef ? "tmp/ui-reading-baseline-artifacts" : contractCases ? "tmp/ui-integration-contract-artifacts" : bindingCases ? "tmp/ui-office-binding-artifacts" : "tmp/ui-preview-artifacts");
assert(process.env.UI_NETWORK_PROOF, "Use ui-preview-isolated.py; app start prohibited without proof");
const proof = JSON.parse(fs.readFileSync(process.env.UI_NETWORK_PROOF));
assert(proof.verifiedBeforeAppStart && proof.parentNetNS !== proof.testNetNS);
assert.equal(proof.testNetNS, fs.readlinkSync("/proc/self/ns/net"));
const origin = "http://helmut-ui.test";
const requests = [], errors = [], passes = [];
let failStartRead = false;
const check = (name, condition, detail) => {
  assert.ok(condition, name + (detail ? ": " + JSON.stringify(detail) : ""));
  passes.push(name); console.log("PASS ", name);
};
const card = { ...item, knowledge_object_id: "ui-ko", knowledgeObjectId: "ui-ko", vorgang_id: item.id, vorgangId: item.id,
  decision: "Sofort reagieren", status: "open", priorityType: "risk", priorityLabel: "Handeln", recommendation: "Den synthetischen UI Zustand prüfen." };
payload.briefing.currentHelmutState.primaryVorgangId = item.id;
payload.briefing.status = "Aktuell";
payload.briefing.currentRadarState.articles = [
  { ...item, id: "article-party", title: "Synthetischer Parteibericht", relation: "party", type: "party", relationTypes: ["party"] },
  { ...item, id: "article-official", title: "Synthetische amtliche Quelle", relation: "official", type: "official", relationTypes: ["official"] },
];
const source = readAppFile("client.js").toString("utf8");
assert(/^\s*loadBriefing\(\)/m.test(source), "Expected bootstrap marker missing; stop rather than run real bootstrap");
const fixtureBootstrap = `
  const __basePayload = ${JSON.stringify(payload)}, __baseCard = ${JSON.stringify(card)};
  function __resetUi() {
    applyStartPayload(JSON.parse(JSON.stringify(__basePayload)));
    authState = {mode: 'accounts'}; currentUser = {id:'ui-user',name:'UI Testprofil',role:'abgeordneter',notificationSettings:{}};
    opsStatusLoaded = true; opsStatus = {learning:{eventCount:7}};
    decisions = [JSON.parse(JSON.stringify(__baseCard))];
    officeDrafts = {}; officeDraftErrors = {}; selectedOfficeDraft = null;
    for (const f of activeOfficeFormats()) officeDrafts[officeDraftKey(decisions[0], f)] = {text:'Synthetischer UI Testentwurf ohne fachliche Aussage. '.repeat(12),source:'ki',binding:officeDraftBinding(decisions[0],f),createdAt:Date.now()};
    onboardingActive = false; helmutThinking = false;
    uiLageDetailOpen = false; radarFilter = 'all'; radarSegment = 'party';
    radarMentionsExpanded = radarEnvExpanded = radarDynamicsExpanded = radarArticlesExpanded = false;
    document.querySelector('#toast')?.classList.remove('visible');
  }
  window.__uiPreview = {
    view(v) { currentView=v; render(); document.getElementById('uiPage').scrollTop=0; },
    reset() { __resetUi(); currentView='helmut'; render(); },
    state(kind) {
      __resetUi();
      if (kind === 'empty' || kind === 'unconfirmed' || kind === 'stale-empty') {
        briefing.currentHelmutState.status='empty'; briefing.currentHelmutState.primaryItem=null;
        briefing.lageBriefing.vorgaenge=[]; briefing.currentRadarState.mentions=[]; briefing.currentRadarState.articles=[];
        briefing.currentRadarState.environment={party:[],constituency:[],committees:[]}; briefing.currentRadarState.dynamics=[]; decisions=[];
        if(kind==='unconfirmed') briefing.currentRadarState.quality.sourcesLoaded=false;
        if(kind==='stale-empty') {briefing.currentRadarState.status='stale';briefing.currentRadarState.emptyState={kind:'stale',detail:'Synthetische Einschränkung: Der vorhandene Quellenstand ist älter.'};}
      } else if (kind === 'error') {
        briefing.available=false; briefing.reason='store-error';
        briefing.currentHelmutState.status='error'; briefing.currentRadarState.available=false;
        briefing.currentRadarState.status='error'; briefing.currentRadarState.quality={reason:'store-error',sourcesLoaded:false}; briefing.currentRadarState.mentions=[]; briefing.currentRadarState.articles=[];
        briefing.currentRadarState.environment={party:[],constituency:[],committees:[]}; briefing.currentRadarState.dynamics=[];
        briefing.lageBriefing.vorgaenge=[]; briefing.lageBriefing.available=false; briefing.lageBriefing.reason='store-error';
        officeDrafts={}; for(const f of activeOfficeFormats()) officeDraftErrors[officeDraftKey(decisions[0],f)]=true;
      } else if (kind === 'stale') {
        briefing.status='Nicht aktuell'; briefing.currentHelmutState.status='stale';
        briefing.generatedAt='2020-01-02T10:00:00Z';
        briefing.currentHelmutState.frischeVertrag={aktuell:false,grund:'Synthetischer veralteter Stand'};
        briefing.currentRadarState.status='stale';
      } else if (kind === 'long') {
        const long='Synthetischer langer Titel mit Quellenbezug und persönlicher Einordnung '.repeat(10);
        profile.fullName='Synthetisches Testprofil mit sehr langem mehrteiligem Namen';
        briefing.currentHelmutState.primaryItem.displayTitle=long;
        briefing.lageBriefing.vorgaenge[0].displayTitle=long;
        briefing.currentRadarState.mentions[0].title=long; decisions[0].title=long;
      }
      render();
    },
    clipboard(fail) {
      Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{if(fail)throw Error('simulated clipboard denial');}}});
      document.execCommand=()=>!fail;
    },
    loading() { helmutThinking=true; currentView='helmut'; render(); }
  };
  __resetUi(); currentView='helmut'; render();
`;
const client = bindingCases ? source : source.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "") + fixtureBootstrap;

class CDP {
  constructor(process) {
    this.process = process; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    let buffer = "";
    process.stdio[4].on("data", data => {
      buffer += data.toString();
      let end;
      while ((end = buffer.indexOf("\0")) !== -1) {
        const raw = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!raw) continue;
        const message = JSON.parse(raw);
        if (message.id) {
          const pending = this.pending.get(message.id);
          if (pending) { clearTimeout(pending.timer); this.pending.delete(message.id); message.error ? pending.reject(Error(message.error.message)) : pending.resolve(message.result); }
        } else {
          for (const handler of this.handlers.get(message.method) || []) Promise.resolve(handler(message.params, message.sessionId)).catch(e => errors.push(e.message));
        }
      }
    });
  }
  on(method, fn) { this.handlers.set(method, [...(this.handlers.get(method) || []), fn]); }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error("CDP timeout: " + method)); }, 15000);
      this.pending.set(id, {resolve, reject, timer});
      this.process.stdio[3].write(JSON.stringify({id, method, params, sessionId}) + "\0");
    });
  }
  async evaluate(session, expression) {
    const r = await this.send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true, userGesture: true}, session);
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

async function main() {
  fs.mkdirSync(output, {recursive: true});
  const chrome = spawn("/usr/bin/chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-pipe",
    "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run", "--no-default-browser-check",
    "--disable-features=Translate,MediaRouter,OptimizationHints", "--renderer-process-limit=1", "--no-proxy-server",
    "--user-data-dir=" + path.join(process.env.HOME, "chromium")], {stdio:["ignore","ignore","pipe","pipe","pipe"]});
  let chromeLog = "";
  chrome.stderr.on("data", d => { chromeLog = (chromeLog + d.toString()).slice(-8000); });
  const cdp = new CDP(chrome);
  cdp.on("Runtime.exceptionThrown", ({exceptionDetails}) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text));
  cdp.on("Fetch.requestPaused", async (event, session) => {
    const url = new URL(event.request.url);
    if (url.origin !== origin) {
      requests.push({url:url.href, action:"blocked", type:event.resourceType});
      await cdp.send("Fetch.failRequest", {requestId:event.requestId, errorReason:"BlockedByClient"}, session); return;
    }
    let body, mime, code = 200;
    if (url.pathname === "/client.js") { body=client; mime="text/javascript"; }
    else if (url.pathname.startsWith("/api/")) {
      mime="application/json";
      const value = bindingCases ? await bindingCases.apiResponse(event.request) : url.pathname === "/api/profile/current" ? payload.profile
        : url.pathname === "/api/app/start" ? payload
        : {id:"simulated-saved",ok:true,text:"Synthetischer Antworttext",aiEnabled:false};
      if (contractCases) {
        code=value.status ?? 200; mime=value.contentType || mime;
        body=value.rawBody ?? JSON.stringify(value.body);
      } else body=JSON.stringify(value);
      if (failStartRead && url.pathname === "/api/app/start") { code=503; body="{}"; }
    } else {
      const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.resolve(root, relative);
      const allowed = ["index.html","styles.css","site.webmanifest"].includes(relative) || relative.startsWith("assets/");
      if (allowed && file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        body=readAppFile(relative);
        mime=({".html":"text/html",".css":"text/css",".ttf":"font/ttf",".woff2":"font/woff2",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".ico":"image/x-icon",".webmanifest":"application/manifest+json"})[path.extname(file)] || "application/octet-stream";
      } else { code=404; body="Blocked/unavailable fixture resource"; mime="text/plain"; }
    }
    requests.push({url:url.href,method:event.request.method,action:"fulfilled-in-memory",status:code});
    await cdp.send("Fetch.fulfillRequest", {requestId:event.requestId,responseCode:code,responseHeaders:[{name:"Content-Type",value:mime},{name:"Cache-Control",value:"no-store"}],body:Buffer.from(body).toString("base64")}, session);
  });
  let completed = false, browserVersion;
  try {
    browserVersion = await cdp.send("Browser.getVersion");
    const viewports = contractCases ? contractCases.viewports : bindingCases ? (bindingCases.viewports || [["desktop",1440,900,false],["mobile",390,844,true]]) : [["desktop",1440,900,false],["mobile",390,844,true],["mobile-360",360,780,true]];
    for (const [label,width,height,mobile] of viewports) {
      if (bindingCases) bindingCases.reset(label);
      // Fresh storage per binding viewport: a desktop draft cache must not mask
      // the mobile bootstrap/CSRF/generation contract.
      const browserContextId = bindingCases ? (await cdp.send("Target.createBrowserContext",{disposeOnDetach:true})).browserContextId : undefined;
      const {targetId} = await cdp.send("Target.createTarget", {url:"about:blank",...(browserContextId ? {browserContextId} : {})});
      const {sessionId:s} = await cdp.send("Target.attachToTarget", {targetId,flatten:true});
      await cdp.send("Page.enable",{},s); await cdp.send("Runtime.enable",{},s);
      await cdp.send("Fetch.enable",{patterns:[{urlPattern:"*",requestStage:"Request"}]},s);
      await cdp.send("Network.setBypassServiceWorker",{bypass:true},s);
      await cdp.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile},s);
      await cdp.send("Emulation.setTouchEmulationEnabled",{enabled:mobile},s);
      await cdp.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]},s);
      if (contractCases) await cdp.send("Page.addScriptToEvaluateOnNewDocument",{source:contractCases.preload},s);
      await cdp.send("Page.navigate",{url:origin+"/"},s);
      let ready=false;
      for (let i=0;i<100;i++) {
        try { ready=await cdp.evaluate(s,contractCases ? contractCases.readyExpression : (bindingCases ? "typeof loadBriefing === 'function'" : "typeof __uiPreview === 'object'") + " && !!document.querySelector('.ui-briefing-hero') && document.body.classList.contains('splash-gone')"); } catch {}
        if (ready) break;
        await new Promise(r=>setTimeout(r,50));
      }
      check(label+": actual UI rendered",ready,{errors,chromeLog});
      if (bindingCases) {
        await bindingCases.run({cdp, session:s, label, mobile, check,
          screenshot:async name=>{const r=await cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},s);fs.writeFileSync(path.join(output,label+"-"+name+".png"),Buffer.from(r.data,"base64"));}});
        await cdp.send("Target.closeTarget",{targetId});
        await cdp.send("Target.disposeBrowserContext",{browserContextId});
        continue;
      }
      await cdp.evaluate(s,"document.documentElement.dataset.theme='dark'; document.fonts.ready.then(()=>true)");
      const fonts=await cdp.evaluate(s,"[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family)");
      check(label+": all three design font families loaded",["Spectral","Hanken Grotesk","IBM Plex Mono"].every(n=>fonts.some(f=>f.includes(n))),fonts);
      const click = async selector => {
        const box = await cdp.evaluate(s, `(()=>{const e=document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'nearest'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,width:b.width,height:b.height};})()`);
        if(mobile) check(label+': touch target at least 44px '+selector,box.width>=44 && box.height>=44,box);
        if(mobile) {
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x,y:box.y}]},s);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},s);
        } else {
          await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box},s);
          await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box},s);
        }
      };
      check(label+': bell is a thin outline icon',await cdp.evaluate(s,"(()=>{const style=getComputedStyle(document.querySelector('.update-heart path'));return style.fill==='none' && parseFloat(style.strokeWidth)===1.5;})()"));
      check(label+': Briefing has no manual refresh or replacement button',await cdp.evaluate(s,"!document.querySelector('[data-refresh-helmut],.ui-briefing-status button')"));
      const screenshot=async name=>{const r=await cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},s);fs.writeFileSync(path.join(output,label+"-"+name+".png"),Buffer.from(r.data,"base64"));};
      const layout=async name=>{
        const info=await cdp.evaluate(s,"({width:innerWidth,doc:document.documentElement.scrollWidth,page:document.querySelector('.ui-page').scrollWidth,client:document.querySelector('.ui-page').clientWidth})");
        check(label+": "+name+" no horizontal overflow",info.doc<=info.width && info.page<=info.client,info);
      };
      if (readingFollowup) {
        for (const theme of ['dark','light']) {
          await cdp.evaluate(s,`__uiPreview.reset();document.documentElement.dataset.theme='${theme}';briefing.currentHelmutState.recommendation='';__uiPreview.view('helmut');`);
          check(label+': '+theme+' supplied daily reason without recommendation visible',await cdp.evaluate(s,"document.querySelector('.ui-recommendation-why').textContent.includes('Warum heute relevant:') && document.querySelector('.ui-recommendation-why').textContent.includes(briefing.currentHelmutState.whyItMatters)"));
          check(label+': '+theme+' no invented recommendation or office CTA',await cdp.evaluate(s,"!document.querySelector('.ui-briefing-hero [data-briefing-office]') && !document.querySelector('.ui-briefing-hero').textContent.includes('KI-Empfehlung')"));
          await layout(theme+' reason without recommendation');await screenshot(theme+'-reason-without-recommendation');
          await cdp.evaluate(s,"briefing.currentHelmutState.whyItMatters='';render()");
          check(label+': '+theme+' no empty reason placeholder',await cdp.evaluate(s,"!document.querySelector('.ui-recommendation-why')"));
          await cdp.evaluate(s,"__uiPreview.reset();__uiPreview.view('helmut')");
          check(label+': '+theme+' actual recommendation retains adjacent reason',await cdp.evaluate(s,"!!document.querySelector('[data-briefing-office]') && document.querySelector('.ui-recommendation-why').textContent.includes('Begründung:')"));
          for (const kind of ['filled','empty','unconfirmed','stale','stale-empty','error']) {
            await cdp.evaluate(s,`__uiPreview.${kind==='filled' ? 'reset()' : `state('${kind}')`};__uiPreview.view('radar')`);
            check(label+': '+theme+' '+kind+' Radar without manual update UI',await cdp.evaluate(s,"!document.querySelector('[data-radar-refresh],.radar2-refresh,[data-radar-refresh-purpose],#radar-refresh-purpose') && !document.querySelector('#radar2-root').textContent.includes('Stand neu laden') && !document.querySelector('#radar2-root').textContent.includes('Lädt den gespeicherten Stand neu')"));
            check(label+': '+theme+' '+kind+' coverage caveat remains',await cdp.evaluate(s,"document.querySelector('[data-radar-provenance]').textContent.includes('Prüfzeitraum und Quellenabdeckung sind nicht ausgewiesen')"));
            if(kind==='filled') check(label+': '+theme+' source date remains',await cdp.evaluate(s,"document.querySelector('.radar2-status').textContent.includes('Neueste angezeigte Quelle:')"));
            if(kind==='stale-empty') check(label+': '+theme+' stale caveat remains',await cdp.evaluate(s,"!!document.querySelector('[data-empty-kind=stale]') && document.querySelector('#radar2-root').textContent.includes('Synthetische Einschränkung: Der vorhandene Quellenstand ist älter.')"));
            if(kind==='error') check(label+': '+theme+' technical error remains',await cdp.evaluate(s,"document.querySelector('#radar2-root').textContent.includes('Radar derzeit nicht ladbar') && !document.querySelector('.topbar .ui-status--fresh')"));
            await layout(theme+' '+kind+' Radar');await screenshot(theme+'-'+kind+'-radar');
          }
        }
      } else {
      const screenshotBottom=async name=>{
        const moved=await cdp.evaluate(s,"(()=>{const p=document.querySelector('#uiPage');p.scrollTop=p.scrollHeight;return p.scrollTop>0;})()");
        if(moved) await screenshot(name+'-bottom');
        await cdp.evaluate(s,"document.querySelector('#uiPage').scrollTop=0");
      };
      for(const view of ["helmut","briefing","radar","office"]) {
        // Exercise the real navigation handlers, not just the fixture view setter.
        await click(`${mobile?".mobile-dock":".sidebar .nav-list"} [data-view="${view}"]`);
        check(label+": navigation "+view,await cdp.evaluate(s,`currentView === '${view}'`));
        if(view === "helmut") {
          let shown = false;
          for(let i=0;i<60;i++) {
            shown = await cdp.evaluate(s,"!!document.querySelector('.ui-briefing-hero')");
            if(shown) break;
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          check(label+": Briefing visible after normal intro",shown);
        }
        await layout(view); await screenshot(view); await screenshotBottom(view);
        if(view==="briefing") {
          await click('[data-ui-lage-select]');
          check(label+": Lage detail actually opened",await cdp.evaluate(s,"uiLageDetailOpen && (!matchMedia('(max-width:767px)').matches || getComputedStyle(document.querySelector('.ui-lage-detail')).display!=='none')"));
          check(label+": Lage detail source preserved",await cdp.evaluate(s,"!!document.querySelector('.ui-lage-detail .vsheet-src[href]')"));
          await screenshot("lage-detail");
          await cdp.evaluate(s,"document.querySelector('[data-ui-lage-back]').click()");
          for(let i=0;i<30 && await cdp.evaluate(s,"uiLageDetailOpen");i++) await new Promise(r=>setTimeout(r,20));
          check(label+": Lage back",await cdp.evaluate(s,"!uiLageDetailOpen"));
        }
        if(view==="radar") {
          check(label+': Radar mention with source visible',await cdp.evaluate(s,"!!document.querySelector('.radar2-card--mention[href=\"https://example.test/ui/erwaehnung\"]')"));
          for(const [segment,word] of [['constituency','Wahlkreisumfeld'],['committees','Ausschussumfeld'],['party','Parteiumfeld']]) {
            await click(`[data-radar-segment="${segment}"]`);
            check(label+": Radar environment filter "+segment,await cdp.evaluate(s,`radarSegment==='${segment}' && document.querySelector('.radar2-list').textContent.includes('${word}')`));
          }
          const filter=await cdp.evaluate(s,"document.querySelector('[data-radar-filter]:not([data-radar-filter=all])')?.dataset.radarFilter");
          check(label+": Radar article filter exists",!!filter);
          await click(`[data-radar-filter="${filter}"]`);
          check(label+": Radar article filter changes displayed results",await cdp.evaluate(s,`radarFilter==='${filter}' && document.querySelectorAll('.radar2-section--articles .radar2-row').length===1 && document.querySelector('.radar2-section--articles .radar2-list').textContent.includes('Parteibericht')`));
          await click('[data-radar-filter="all"]');
          check(label+': Radar all filter restores both articles',await cdp.evaluate(s,"document.querySelectorAll('.radar2-section--articles .radar2-row').length===2"));
        }
        if(view==="office") {
          await click('[data-office-open]');
          check(label+": office detail",await cdp.evaluate(s,"currentView==='office-detail' && document.querySelector('.ui-office-detail').textContent.includes('Synthetischer UI Testentwurf')"));
          await screenshot("office-detail");
          for(const fail of [true,false]) {
            await cdp.evaluate(s,`__uiPreview.clipboard(${fail}); document.querySelector('[data-office-share]').click()`);
            await new Promise(r=>setTimeout(r,30));
            const toast=await cdp.evaluate(s,"document.querySelector('#toast').textContent");
            check(label+": clipboard "+(fail?"failure":"success"),fail ? /nicht möglich/.test(toast) && !/Text kopiert/.test(toast) : toast==="Kopiert",toast);
          }
          await cdp.evaluate(s,"document.querySelector('[data-office-back]').click()");
          check(label+": office back",await cdp.evaluate(s,"currentView==='office'"));
        }
      }
      for(const kind of ["empty","stale","error","long"]) {
        await cdp.evaluate(s,`__uiPreview.state('${kind}')`);
        for(const view of ["helmut","briefing","radar","office"]) {
          await cdp.evaluate(s,`__uiPreview.view('${view}')`); await layout(kind+" "+view);
          const text=await cdp.evaluate(s,"document.querySelector('#uiPage').innerText");
          check(label+": "+kind+" "+view+" visible content",text.trim().length>20);
          if(kind==='empty') check(label+': empty '+view+' has no invented items',await cdp.evaluate(s,"!document.querySelector('.ui-briefing-hero,.ui-vorgang-row,.radar2-card,.buero-draft-card')"));
          if(kind==='error') check(label+': error '+view+' is explicit', /nicht verfügbar|nicht geladen|fehlgeschlagen|Störung|Datenbasis|Daten derzeit/i.test(text),text);
          if(kind==='stale' && view==='office') check(label+': stale cache supplies no finished draft',!text.includes('Synthetischer UI Testentwurf') && !text.includes('Heute erstellt'),text);
          if(kind==="long" || (kind==="error" && view==="helmut")) { await screenshot(kind+"-"+view); if(kind==='long') await screenshotBottom(kind+'-'+view); }
        }
      }
      await cdp.evaluate(s,"__uiPreview.reset(); briefing.generatedAt=null; briefing.date=null; __uiPreview.view('office')");
      check(label+': undated office cache is not represented as a current finished draft',await cdp.evaluate(s,"!document.querySelector('#uiPage').innerText.includes('Synthetischer UI Testentwurf') && !document.querySelector('[data-office-share]')"));
      await cdp.evaluate(s,"__uiPreview.reset(); __uiPreview.loading()");
      check(label+": loading state",await cdp.evaluate(s,"!!document.querySelector('.helmut-refresh')"));
      await cdp.evaluate(s,"__uiPreview.reset(); document.documentElement.dataset.theme='light'");
      await layout("light theme"); await screenshot("light");
      if (baselineRef) {
        for(const theme of ['dark','light']) {
          await cdp.evaluate(s,`__uiPreview.reset(); document.documentElement.dataset.theme='${theme}'`);
          for(const view of ['helmut','briefing','radar']) {
            await cdp.evaluate(s,`__uiPreview.view('${view}')`); await layout(theme+' baseline '+view); await screenshot(theme+'-'+view);
          }
          await cdp.evaluate(s,"__uiPreview.view('briefing')"); await click('[data-ui-lage-select]');
          check(label+': '+theme+' baseline actual detail visible',await cdp.evaluate(s,"uiLageDetailOpen"));
          await screenshot(theme+'-detail');
        }
      } else {
      // Same real Chromium harness, focused reading acceptance for the three requested views.
      for (const theme of ['dark','light']) {
        await cdp.evaluate(s,`__uiPreview.reset(); document.documentElement.dataset.theme='${theme}';
          profile.parliamentType='Bundestag'; profile.constituency='Synthetischer Wahlkreis';
          briefing.lageBriefing.vorgaenge[0].relevanz={satz:'Betrifft Ihren Ausschuss: Testausschuss.',belege:[{art:'ausschuss',text:'Ihr Ausschuss: Testausschuss'}]};`);
        for (const view of ['helmut','briefing','radar']) {
          await cdp.evaluate(s,`__uiPreview.view('${view}')`);
          await layout(theme+' '+view); await screenshot(theme+'-'+view);
          check(label+': '+theme+' '+view+' Berlin time named',await cdp.evaluate(s,"document.querySelector('.ui-date').textContent.includes('Berliner Zeit')"));
          check(label+': '+theme+' '+view+' formal UI address',await cdp.evaluate(s,"!/[Dd]ein(?:e[nmrs]?)?\\b|\\bdich\\b|\\bdu\\b/.test(document.querySelector('#uiPage').innerText)"));
        }
        await cdp.evaluate(s,`__uiPreview.view('helmut')`);
        check(label+': '+theme+' reason visible beside recommendation',await cdp.evaluate(s,"(()=>{const e=document.querySelector('.ui-recommendation-why');return e && e.getBoundingClientRect().height>0 && !e.closest('details');})()"));
        check(label+': '+theme+' direct briefing source',await cdp.evaluate(s,"document.querySelector('.ui-source-direct').href==='https://example.test/ui'"));
        await cdp.evaluate(s,"window.__sourceClickSeen=false;document.querySelector('.ui-source-direct').addEventListener('click',e=>{e.preventDefault();window.__sourceClickSeen=true;},{once:true})");
        await click('.ui-source-direct');
        check(label+': '+theme+' direct original source can be tapped',await cdp.evaluate(s,"window.__sourceClickSeen"));
        // Many copies use existing synthetic UI content solely to make list scroll restoration observable.
        await cdp.evaluate(s,`__uiPreview.view('briefing');
          { const original=briefing.lageBriefing.vorgaenge[0];
          briefing.lageBriefing.vorgaenge=Array.from({length:8},(_,i)=>({...original,id:'reading-'+i,vorgangId:'reading-'+i}));
          render(); }`);
        await click('[data-ui-lage-select="reading-3"]');
        check(label+': '+theme+' detail selected ID retained',await cdp.evaluate(s,"uiLageDetailOpen && uiLageSelectedId==='reading-3'"));
        if(mobile) {
          check(label+': '+theme+' general detail header hidden',await cdp.evaluate(s,"getComputedStyle(document.querySelector('.ui-lage-page-heading')).display==='none'"));
          check(label+': '+theme+' back appears within first 150px',await cdp.evaluate(s,"document.querySelector('[data-ui-lage-back]').getBoundingClientRect().top<150"));
        }
        check(label+': '+theme+' detail source before additional interpretation',await cdp.evaluate(s,"!!(document.querySelector('.ui-source-access').compareDocumentPosition([...document.querySelectorAll('.vsheet-h')].find(e=>e.textContent==='Zusätzliche Einordnung').parentElement)&Node.DOCUMENT_POSITION_FOLLOWING)"));
        await screenshot(theme+'-detail');
        if(mobile) {
          const remembered=await cdp.evaluate(s,"history.state.helmutLage.scrollTop");
          check(label+': '+theme+' real nonzero list position saved',remembered>0,remembered);
          await cdp.evaluate(s,"history.back()");
          for(let i=0;i<30 && await cdp.evaluate(s,"uiLageDetailOpen");i++) await new Promise(r=>setTimeout(r,20));
          check(label+': '+theme+' browser back restores list position',await cdp.evaluate(s,`!uiLageDetailOpen && Math.abs(document.querySelector('#uiPage').scrollTop-${remembered})<2`));
          await cdp.evaluate(s,"history.forward()");
          for(let i=0;i<30 && !await cdp.evaluate(s,"uiLageDetailOpen");i++) await new Promise(r=>setTimeout(r,20));
          check(label+': '+theme+' browser forward restores detail',await cdp.evaluate(s,"uiLageDetailOpen && uiLageSelectedId==='reading-3'"));
          await click('[data-ui-lage-back]');
          for(let i=0;i<30 && await cdp.evaluate(s,"uiLageDetailOpen");i++) await new Promise(r=>setTimeout(r,20));
          check(label+': '+theme+' back button restores list',await cdp.evaluate(s,"!uiLageDetailOpen"));
        }
        for (const kind of ['empty','unconfirmed','stale','stale-empty','error','long']) {
          await cdp.evaluate(s,`__uiPreview.state('${kind}')`);
          for (const view of ['helmut','briefing','radar']) {
            await cdp.evaluate(s,`__uiPreview.view('${view}')`); await layout(theme+' '+kind+' '+view);
            if(label==='mobile') await screenshot(theme+'-'+kind+'-'+view);
          }
          if(kind==='unconfirmed') check(label+': '+theme+' unconfirmed Radar has no false current topbar',await cdp.evaluate(s,"!document.querySelector('.topbar .ui-status--fresh') && document.querySelector('.topbar').textContent.includes('Quellenprüfung offen')"));
          if(kind==='stale-empty') check(label+': '+theme+' stale empty Radar retains supplied caveat',await cdp.evaluate(s,"document.querySelector('#radar2-root').textContent.includes('Synthetische Einschränkung: Der vorhandene Quellenstand ist älter.') && document.querySelector('[data-empty-kind=stale]')!==null"));
          if(kind==='long') {
            await cdp.evaluate(s,"__uiPreview.view('briefing')"); await click('[data-ui-lage-select]');
            check(label+': '+theme+' long detail full title',await cdp.evaluate(s,"document.querySelector('#ui-lage-detail-title').textContent===lageField(briefing.lageBriefing.vorgaenge[0].displayTitle) && getComputedStyle(document.querySelector('#ui-lage-detail-title')).webkitLineClamp==='none'"));
            await layout(theme+' long detail'); if(mobile) await screenshot(theme+'-long-detail');
          }
        }
        await cdp.evaluate(s,`__uiPreview.reset(); { const st=briefing.currentHelmutState;
          st.status='empty';st.primaryItem=null;st.emptyState={kind:'quiet',detail:'Synthetische Einschränkung bleibt erreichbar.'};
          st.frischeVertrag={aktuell:true,ruhelage:true};__uiPreview.view('helmut'); }`);
        check(label+': '+theme+' quiet explanation and Lage count',await cdp.evaluate(s,"document.querySelector('.hstand-state-card--quiet').textContent.includes('keine Entwarnung') && document.querySelector('.hstand-state-lage').textContent.includes('2 Themen')"));
        await screenshot(theme+'-quiet-briefing');
        for(const [parliament,state,expected,committees,focusTopics] of [['Bundestag','Niedersachsen','Bundestag',['Ausschuss für Gesundheit'],['Pflegeversicherung']],['Abgeordnetenhaus','Berlin','Abgeordnetenhaus Berlin',['Ausschuss für Stadtentwicklung, Bauen und Wohnen'],['Mietrecht']],['Landtag','Brandenburg','Landtag Brandenburg',['Ausschuss für Landwirtschaft'],['Landwirtschaft']]]) {
          await cdp.evaluate(s,`profile.parliamentType='${parliament}';profile.politicalLevel='${parliament === 'Bundestag' ? 'Bund' : 'Land'}';profile.state='${state}';profile.committees=${JSON.stringify(committees)};profile.focusTopics=${JSON.stringify(focusTopics)};render()`);
          check(label+': '+theme+' mandate '+expected,await cdp.evaluate(s,`document.querySelector('.ui-mandate-context summary').textContent.includes('${expected}')`));
          await click('.ui-mandate-context summary'); await layout(theme+' mandate '+expected);
          if(label==='mobile' && theme==='light') await screenshot('mandate-'+state+'-'+parliament);
        }
      }
      }
      }
      if (!baselineRef) {
      // Exercise the existing automatic foreground loader; mock only outer boundaries.
      await cdp.evaluate(s,`__uiPreview.reset();__uiPreview.view('radar');persistView('radar');
        fetchAuthState=async()=>({mode:'accounts',authenticated:true,user:currentUser,profiles:[{id:profile.id,name:profile.fullName}]});
        generateOfficeDraftsInBackground=()=>{};loadParliament=()=>{};`);
      const readRequestStart=requests.length;
      await cdp.evaluate(s,"previewMode=false;lastBriefingLoadAt=0;document.dispatchEvent(new Event('visibilitychange'))");
      for(let i=0;i<100 && await cdp.evaluate(s,'briefingRefreshing');i++) await new Promise(r=>setTimeout(r,20));
      check(label+': automatic foreground load completes',await cdp.evaluate(s,"!briefingRefreshing && lastBriefingLoadAt>0 && currentView==='radar'"));
      await cdp.evaluate(s,`window.__radarBeforeFailure={source:document.querySelector('.radar2-status').textContent,provenance:document.querySelector('[data-radar-provenance]').textContent};
        window.__foregroundFailure=''; {const warn=console.warn;console.warn=(...args)=>{if(args[0]==='Foreground-Refresh fehlgeschlagen')window.__foregroundFailure=String(args[1]);warn(...args);};}`);
      failStartRead=true;
      await cdp.evaluate(s,"lastBriefingLoadAt=0;document.dispatchEvent(new Event('visibilitychange'))");
      for(let i=0;i<100 && await cdp.evaluate(s,'briefingRefreshing');i++) await new Promise(r=>setTimeout(r,20));
      check(label+': automatic foreground failure preserves prior content without success claim',await cdp.evaluate(s,"!briefingRefreshing && window.__foregroundFailure.includes('503') && !!document.querySelector('.radar2-card--mention') && document.querySelector('.radar2-status').textContent===window.__radarBeforeFailure.source && document.querySelector('[data-radar-provenance]').textContent===window.__radarBeforeFailure.provenance && !document.querySelector('#radar2-root').textContent.includes('erfolgreich aktualisiert')"));
      failStartRead=false;
      const readRequests=requests.slice(readRequestStart).filter(r=>new URL(r.url).pathname.startsWith('/api/'));
      check(label+': automatic Radar load issued only existing GET start reads',readRequests.length===2 && readRequests.every(r=>r.method==='GET' && new URL(r.url).pathname==='/api/app/start'),readRequests);
      }
      // Negative control: intentionally attempted external fetch must fail at interception.
      check(label+": external fetch denied",await cdp.evaluate(s,"fetch('https://example.invalid/network-negative-control').then(()=>false,()=>true)"));
      if(mobile) {
        await cdp.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}},s);
        const locked=await cdp.evaluate(s,"getComputedStyle(document.querySelector('.orientation-lock')).display==='grid'");
        check(label+': smartphone landscape locked',locked);
        await screenshot('landscape');
      }
      await cdp.send("Target.closeTarget",{targetId});
    }
    check("No uncaught browser errors",errors.length===0,errors);
    check("No external request fulfilled",requests.filter(r=>new URL(r.url).origin!==origin && r.action!=="blocked").length===0);
    check("No missing static resources",requests.every(r=>r.status!==404 || new URL(r.url).pathname.startsWith('/api/')),requests.filter(r=>r.status===404 && !new URL(r.url).pathname.startsWith('/api/')));
    completed = true;
  } finally {
    fs.writeFileSync(path.join(output,"BROWSER_REQUESTS.json"),JSON.stringify(requests,null,2)+"\n");
    const files = new Set(["client.js", "scripts/fixtures/ui-preview.js", "scripts/ui-preview-browser-check.js", "scripts/ui-preview-isolated.py"]);
    if (bindingCases && !contractCases) for (const file of ["scripts/ui-office-binding-browser-cases.js", "scripts/ui-office-binding-browser-test.js", "scripts/fixtures/ui-office-binding.js"]) files.add(file);
    if (contractCases) for (const file of ["scripts/ui-integration-contract-browser-cases.js", "scripts/ui-integration-contract-browser-test.js", "scripts/fixtures/ui-integration-contracts.js", "scripts/fixtures/ui-office-binding.js"]) files.add(file);
    for (const request of requests) {
      if (request.action !== "fulfilled-in-memory" || request.status !== 200) continue;
      const pathname = new URL(request.url).pathname;
      if (!pathname.startsWith("/api/")) files.add(pathname === "/" ? "index.html" : pathname.slice(1));
    }
    const sha256 = value => createHash("sha256").update(value).digest("hex");
    const testedFiles = Object.fromEntries([...files].sort().map(file => [file, sha256(readAppFile(file))]));
    fs.writeFileSync(path.join(output,"BROWSER_RESULT.json"),JSON.stringify({status:completed?"PASS":"FAIL",baselineRef:baselineRef || null,passes,errors,externalRequestsFulfilled:requests.filter(r=>new URL(r.url).origin!==origin && r.action!=="blocked").length,negativeControlsBlocked:requests.filter(r=>r.action==="blocked").length,bootstrap:bindingCases ? "unmodified full client including normal loadBriefing/auth/CSRF; every API mocked in memory" : "actual client with fixture initialization; real backend bootstrap removed",...(bindingCases ? {apiEvidence:bindingCases.evidence()} : {}),chromium:"/usr/bin/chromium",browserVersion,testedFiles,servedClientSha256:sha256(client)},null,2)+"\n");
    try { await cdp.send("Browser.close"); } catch {}
    if(chrome.exitCode===null) chrome.kill();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
