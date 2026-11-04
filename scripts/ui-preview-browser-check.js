"use strict";

// Real Chromium + real client/CSS, fixture bootstrap only. No HTTP server,
// Playwright installation, server.js, database, provider or motor import.
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { createHash } = require("crypto");
const { spawn } = require("child_process");
const { payload, item } = require("./fixtures/ui-preview");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "tmp/ui-preview-artifacts");
assert(process.env.UI_NETWORK_PROOF, "Use ui-preview-isolated.py; app start prohibited without proof");
const proof = JSON.parse(fs.readFileSync(process.env.UI_NETWORK_PROOF));
assert(proof.verifiedBeforeAppStart && proof.parentNetNS !== proof.testNetNS);
assert.equal(proof.testNetNS, fs.readlinkSync("/proc/self/ns/net"));
const origin = "http://helmut-ui.test";
const requests = [], errors = [], passes = [];
const check = (name, condition, detail) => {
  assert.ok(condition, name + (detail ? ": " + JSON.stringify(detail) : ""));
  passes.push(name); console.log("PASS ", name);
};
const card = { ...item, status: "open", priorityType: "risk", priorityLabel: "Handeln", recommendation: "Den synthetischen UI Zustand prüfen." };
payload.briefing.status = "Aktuell";
payload.briefing.currentRadarState.articles = [
  { ...item, id: "article-party", title: "Synthetischer Parteibericht", relation: "party", type: "party", relationTypes: ["party"] },
  { ...item, id: "article-official", title: "Synthetische amtliche Quelle", relation: "official", type: "official", relationTypes: ["official"] },
];
const source = fs.readFileSync(path.join(root, "client.js"), "utf8");
assert(/^\s*loadBriefing\(\)/m.test(source), "Expected bootstrap marker missing; stop rather than run real bootstrap");
const fixtureBootstrap = `
  const __basePayload = ${JSON.stringify(payload)}, __baseCard = ${JSON.stringify(card)};
  function __resetUi() {
    applyStartPayload(JSON.parse(JSON.stringify(__basePayload)));
    authState = {mode: 'accounts'}; currentUser = {id:'ui-user',name:'UI Testprofil',role:'abgeordneter',notificationSettings:{}};
    opsStatusLoaded = true; opsStatus = {learning:{eventCount:7}};
    decisions = [JSON.parse(JSON.stringify(__baseCard))];
    officeDrafts = {}; officeDraftErrors = {}; selectedOfficeDraft = null;
    for (const f of activeOfficeFormats()) officeDrafts[officeDraftKey(decisions[0], f)] = {text:'Synthetischer UI Testentwurf ohne fachliche Aussage. '.repeat(12),source:'regel'};
    onboardingActive = false; helmutThinking = false; pipelineRunning = false; pipelinePhase = null;
    uiLageDetailOpen = false; radarFilter = 'all'; radarSegment = 'party';
    radarMentionsExpanded = radarEnvExpanded = radarDynamicsExpanded = radarArticlesExpanded = false;
    document.querySelector('#toast')?.classList.remove('visible');
  }
  window.__uiPreview = {
    view(v) { currentView=v; render(); document.getElementById('uiPage').scrollTop=0; },
    reset() { __resetUi(); currentView='helmut'; render(); },
    state(kind) {
      __resetUi();
      if (kind === 'empty') {
        briefing.currentHelmutState.status='empty'; briefing.currentHelmutState.primaryItem=null;
        briefing.lageBriefing.vorgaenge=[]; briefing.currentRadarState.mentions=[]; briefing.currentRadarState.articles=[];
        briefing.currentRadarState.environment={party:[],constituency:[],committees:[]}; briefing.currentRadarState.dynamics=[]; decisions=[];
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
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{if(fail)throw Error('simulated clipboard denial');}}});
      document.execCommand=()=>!fail;
    },
    loading() { helmutThinking=true; currentView='helmut'; render(); }
  };
  __resetUi(); currentView='helmut'; render();
`;
const client = source.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "") + fixtureBootstrap;

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
      const value = url.pathname === "/api/profile/current" ? payload.profile
        : url.pathname === "/api/app/start" ? payload
        : {id:"simulated-saved",ok:true,text:"Synthetischer Antworttext",aiEnabled:false};
      body=JSON.stringify(value);
    } else {
      const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.resolve(root, relative);
      const allowed = ["index.html","styles.css","site.webmanifest"].includes(relative) || relative.startsWith("assets/");
      if (allowed && file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        body=fs.readFileSync(file);
        mime=({".html":"text/html",".css":"text/css",".ttf":"font/ttf",".woff2":"font/woff2",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".ico":"image/x-icon",".webmanifest":"application/manifest+json"})[path.extname(file)] || "application/octet-stream";
      } else { code=404; body="Blocked/unavailable fixture resource"; mime="text/plain"; }
    }
    requests.push({url:url.href,method:event.request.method,action:"fulfilled-in-memory",status:code});
    await cdp.send("Fetch.fulfillRequest", {requestId:event.requestId,responseCode:code,responseHeaders:[{name:"Content-Type",value:mime},{name:"Cache-Control",value:"no-store"}],body:Buffer.from(body).toString("base64")}, session);
  });
  let completed = false, browserVersion;
  try {
    browserVersion = await cdp.send("Browser.getVersion");
    for (const [label,width,height,mobile] of [["desktop",1440,900,false],["mobile",390,844,true],["mobile-360",360,780,true]]) {
      const {targetId} = await cdp.send("Target.createTarget", {url:"about:blank"});
      const {sessionId:s} = await cdp.send("Target.attachToTarget", {targetId,flatten:true});
      await cdp.send("Page.enable",{},s); await cdp.send("Runtime.enable",{},s);
      await cdp.send("Fetch.enable",{patterns:[{urlPattern:"*",requestStage:"Request"}]},s);
      await cdp.send("Network.setBypassServiceWorker",{bypass:true},s);
      await cdp.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile},s);
      await cdp.send("Emulation.setTouchEmulationEnabled",{enabled:mobile},s);
      await cdp.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]},s);
      await cdp.send("Page.navigate",{url:origin+"/"},s);
      let ready=false;
      for (let i=0;i<100;i++) {
        try { ready=await cdp.evaluate(s,"typeof __uiPreview === 'object' && !!document.querySelector('.ui-briefing-hero') && document.body.classList.contains('splash-gone')"); } catch {}
        if (ready) break;
        await new Promise(r=>setTimeout(r,50));
      }
      check(label+": actual UI rendered",ready,{errors,chromeLog});
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
      check(label+': Briefing refresh has a 44px target',await cdp.evaluate(s,"(()=>{const b=document.querySelector('[data-refresh-helmut]').getBoundingClientRect();return b.width>=44 && b.height>=44;})()"));
      const screenshot=async name=>{const r=await cdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},s);fs.writeFileSync(path.join(output,label+"-"+name+".png"),Buffer.from(r.data,"base64"));};
      const layout=async name=>{
        const info=await cdp.evaluate(s,"({width:innerWidth,doc:document.documentElement.scrollWidth,page:document.querySelector('.ui-page').scrollWidth,client:document.querySelector('.ui-page').clientWidth})");
        check(label+": "+name+" no horizontal overflow",info.doc<=info.width && info.page<=info.client,info);
      };
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
          await cdp.evaluate(s,"document.querySelector('[data-ui-lage-select]').focus()");
          await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},s);
          await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},s);
          check(label+": Lage detail source preserved",await cdp.evaluate(s,"!!document.querySelector('.ui-lage-detail .vsheet-src[href]')"));
          await screenshot("lage-detail");
          await cdp.evaluate(s,"document.querySelector('[data-ui-lage-back]').click()");
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
            await cdp.evaluate(s,`__uiPreview.clipboard(${fail}); document.querySelector('[data-office-copy-inline]').click()`);
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
          if(kind==='stale' && view==='office') check(label+': stale draft not labelled today',text.includes('2020') && !text.includes('Heute erstellt'),text);
          if(kind==="long" || (kind==="error" && view==="helmut")) { await screenshot(kind+"-"+view); if(kind==='long') await screenshotBottom(kind+'-'+view); }
        }
      }
      await cdp.evaluate(s,"__uiPreview.reset(); briefing.generatedAt=null; briefing.date=null; __uiPreview.view('office')");
      check(label+': undated office source labelled honestly',await cdp.evaluate(s,"document.querySelector('#uiPage').innerText.includes('Briefingdatum nicht belegt')"));
      await cdp.evaluate(s,"__uiPreview.reset(); __uiPreview.loading()");
      check(label+": loading state",await cdp.evaluate(s,"!!document.querySelector('.helmut-refresh')"));
      await cdp.evaluate(s,"__uiPreview.reset(); document.documentElement.dataset.theme='light'");
      await layout("light theme"); await screenshot("light");
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
    check("No missing static resources",requests.every(r=>r.status!==404),requests.filter(r=>r.status===404));
    completed = true;
  } finally {
    fs.writeFileSync(path.join(output,"BROWSER_REQUESTS.json"),JSON.stringify(requests,null,2)+"\n");
    const files = new Set(["client.js", "scripts/fixtures/ui-preview.js", "scripts/ui-preview-browser-check.js", "scripts/ui-preview-isolated.py"]);
    for (const request of requests) {
      if (request.action !== "fulfilled-in-memory" || request.status !== 200) continue;
      const pathname = new URL(request.url).pathname;
      if (!pathname.startsWith("/api/")) files.add(pathname === "/" ? "index.html" : pathname.slice(1));
    }
    const sha256 = value => createHash("sha256").update(value).digest("hex");
    const testedFiles = Object.fromEntries([...files].sort().map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
    fs.writeFileSync(path.join(output,"BROWSER_RESULT.json"),JSON.stringify({status:completed?"PASS":"FAIL",passes,errors,externalRequestsFulfilled:requests.filter(r=>new URL(r.url).origin!==origin && r.action!=="blocked").length,negativeControlsBlocked:requests.filter(r=>r.action==="blocked").length,bootstrap:"actual client with fixture initialization; real backend bootstrap removed",chromium:"/usr/bin/chromium",browserVersion,testedFiles,servedClientSha256:sha256(client)},null,2)+"\n");
    try { await cdp.send("Browser.close"); } catch {}
    if(chrome.exitCode===null) chrome.kill();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
