"use strict";
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const SOURCE = process.env.HELMUT_JOINT_RUNTIME, OUT = process.env.HELMUT_JOINT_OUTPUT;
const proof = JSON.parse(fs.readFileSync(path.join(OUT, 'network.json')));
assert.equal(proof.verifiedBeforeServer, true);
assert.equal(fs.readlinkSync('/proc/self/ns/net'), proof.testNamespace);
assert.ok(process.env.NODE_OPTIONS.includes('lokaler-netzschutz'));
for (const key of Object.keys(process.env)) assert.ok(!/(SECRET|TOKEN|CREDENTIAL|SUPABASE|AZURE|VERCEL|DATABASE_URL|API_KEY)/i.test(key), key);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const result = {scope:'JOINT_EXACT_UI_AND_BACKEND_REAL_PRODUCT_HTTP', checks:[], requests:[], images:[], pageErrors:[], consoleErrors:[], externalRequests:[], blockedOperations:[], counters:{model:0, mail:0, fetch:0}, inputCommits:{backend:'e054c0bb80fa4c330082bace3cfff6d9bb89a926', ui:'011910746294109c04fd5dac8e153a22188b7467'}, syntheticReadSeams:true, realLocalFileStore:true, productionAcceptance:false};
const A='integration-synthetic-alpha', B='integration-synthetic-beta', PASSWORD='Synthetic-Joint-Local-Only-20261105!';
let app, browser, fixtures, base, lastPage, accounts, storage;
const fault={auth:false};
async function check(name, fn) { try {await fn(); result.checks.push({name,status:'PASS'}); console.log('PASS '+name);} catch(e) {result.checks.push({name,status:'FAIL',error:e.message}); if(lastPage&&!lastPage.isClosed()) await lastPage.screenshot({path:path.join(OUT,'first-failure.png'),fullPage:true}).catch(()=>{}); throw e;} }
async function shot(page,name) {await page.evaluate(()=>document.fonts.ready); const file=name+'.png';const bytes=await page.screenshot({path:path.join(OUT,file),fullPage:true});result.images.push({file,sha256:sha(bytes)});}
async function main() {
  storage=require(path.join(SOURCE,'lib/helmut/storage')); accounts=require(path.join(SOURCE,'lib/helmut/accounts'));
  fixtures=require('./positive-data.cjs').install(SOURCE,{isolated:true,localUserStore:true,mandateA:A,mandateB:B});
  for(const p of Object.values(fixtures.profiles)) await storage.saveProfile({...p,profileActive:false,onboardedAt:new Date().toISOString(),officeFormats:['presse']});
  const admin=await accounts.createUser({name:'Synthetische Administration',email:'admin@joint.invalid',role:'admin',password:PASSWORD});
  const member=await accounts.createUser({name:'Synthetisches Mitglied',email:'member@joint.invalid',role:'abgeordneter',politicianId:A,password:PASSWORD});
  await accounts.createUser({name:'Synthetisch ohne Zuordnung',email:'empty@joint.invalid',role:'referent',password:PASSWORD});
  const resolve=accounts.resolveSession; accounts.resolveSession=(...args)=>{if(fault.auth)throw Error('Synthetic auth read failure');return resolve(...args);};
  const ai=require(path.join(SOURCE,'lib/helmut/ai'));ai.requestText=async()=>{result.counters.model++;throw Error('No model requests');};
  require(path.join(SOURCE,'lib/helmut/invite-mail')).sendAccessMail=async()=>{result.counters.mail++;throw Error('No mail requests');};
  global.fetch=async()=>{result.counters.fetch++;throw Error('No external fetch');};
  const handler=require(path.join(SOURCE,'server.js'));
  const safeGet=new Set(['/api/auth/session','/api/auth/setup-status','/api/security/csrf','/api/app/start','/api/briefing/latest','/api/profile/current','/api/tasks','/api/notes','/api/parliament','/api/ops/status','/api/learning/status','/api/daily-inputs','/api/push/status','/api/push/public-key','/api/storage/status','/api/admin/overview','/api/admin/customers','/api/admin/users','/api/admin/sources-status','/api/admin/stats/daily','/api/admin/stats/budget-today','/api/admin/stats/process-runs','/api/admin/stats/crawl-report','/api/admin/recovery-status','/api/admin/feedback','/api/admin/audit']);
  const safePost=new Set(['/api/auth/login','/api/auth/logout','/api/communication/generate','/api/office/generate','/api/admin/users','/api/interactions']);
  app=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://127.0.0.1');
    const allowed=!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(req.method)||req.method==='GET'&&(safeGet.has(u.pathname)||/^\/api\/admin\/profile\/[a-z0-9-]+$/.test(u.pathname))||req.method==='POST'&&(safePost.has(u.pathname)||/^\/api\/admin\/users\/[a-z0-9-]+\/restore-access$/.test(u.pathname))||req.method==='PATCH'&&(u.pathname==='/api/profile/current'||/^\/api\/admin\/users\/[a-z0-9-]+$/.test(u.pathname));
    if(!allowed){result.blockedOperations.push({method:req.method,path:u.pathname});res.writeHead(403);res.end('Forbidden isolated operation');return;}
    const row={method:req.method,path:req.url,status:null,csrfPresent:!!req.headers['x-csrf-token']};result.requests.push(row);
    if(u.pathname==='/api/communication/generate'){const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{try{row.syntheticInput=JSON.parse(Buffer.concat(chunks));}catch{}});}
    res.on('finish',()=>{row.status=res.statusCode;row.contentType=res.getHeader('content-type');});
    Promise.resolve(handler(req,res)).catch(e=>{if(!res.headersSent)res.writeHead(500);res.end('Unexpected isolated server error');});
  });
  await new Promise(r=>app.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.address().port;
  const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  let actor=20;
  async function context(viewport={width:1440,height:1000}) {const ctx=await browser.newContext({viewport,serviceWorkers:'allow',reducedMotion:'reduce',extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.'+(++actor)}});ctx.setDefaultTimeout(10000);ctx.on('request',r=>{if(!r.url().startsWith(base+'/'))result.externalRequests.push(r.url());});return ctx;}
  async function pageFor(ctx){const p=await ctx.newPage();lastPage=p;p.on('pageerror',e=>result.pageErrors.push(String(e)));p.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text());});return p;}
  async function login(ctx,email='member@joint.invalid'){assert.equal((await ctx.request.post(base+'/api/auth/login',{data:{email,password:PASSWORD}})).status(),200);}
  async function view(p,name){const buttons=p.locator('[data-view="'+name+'"]');for(let i=0;i<await buttons.count();i++)if(await buttons.nth(i).isVisible()){await buttons.nth(i).click();return;}throw Error('Missing visible navigation '+name);}
  async function settled(p){await p.locator('.hstand').waitFor();await p.waitForFunction(()=>!helmutThinking&&!officeDraftsGenerating);await p.evaluate(()=>document.fonts.ready);}
  async function controlled(p){await p.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});await p.waitForFunction(()=>!!navigator.serviceWorker.controller);}
  await check('Actual server delivers original UI assets and rejects private administration anonymously',async()=>{
    const ctx=await context();const list=fs.readdirSync(path.join(SOURCE,'assets/ui/fonts')).filter(f=>f.endsWith('.ttf')).map(f=>'assets/ui/fonts/'+f).concat(['assets/ui/logo/helmut-zeichen.svg','assets/ui/reichstag.jpg','client.js','styles.css','sw.js']);
    result.assets=[];
    for(const file of list){const r=await ctx.request.get(base+'/'+file);assert.equal(r.status(),200,file);assert.equal(sha(await r.body()),sha(fs.readFileSync(path.join(SOURCE,file))),file);const type=r.headers()['content-type'];assert.match(type,file.endsWith('.ttf')?/^font\/ttf/:file.endsWith('.jpg')?/^image\/jpeg/:file.endsWith('.svg')?/^image\/svg/:file.endsWith('.css')?/^text\/css/:/(javascript)/);result.assets.push({file,type,sha256:sha(await r.body())});}
    assert.equal((await ctx.request.get(base+'/verwaltung/')).status(),401);assert.equal((await ctx.request.get(base+'/server.js')).status(),404);assert.equal((await ctx.request.get(base+'/lib/helmut/accounts.js')).status(),404);await ctx.close();
  });
  for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    await check(label+': real login, four views, original fonts and Briefing-to-Office identity',async()=>{
      const ctx=await context(viewport),p=await pageFor(ctx);await p.goto(base+'/');await p.locator('#loginForm').waitFor();await p.locator('#loginForm [name="email"]').fill('member@joint.invalid');await p.locator('#loginForm [name="password"]').fill(PASSWORD);await p.locator('#loginForm button[type="submit"]').click();await settled(p);await controlled(p);
      const state=await p.evaluate(()=>({profile:profile.id,lage:briefing.lageBriefing.vorgaenge.length,radar:briefing.currentRadarState.anzeige.mentions.length,primary:briefing.currentHelmutState.primaryItem.id,fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),bodyFont:getComputedStyle(document.body).fontFamily}));assert.equal(state.profile,A);assert.ok(state.lage>0&&state.radar>0&&state.primary);assert.ok(state.fonts.some(f=>f.family.includes('Hanken')&&f.status==='loaded'));assert.ok(state.fonts.some(f=>f.family.includes('Spectral')&&f.status==='loaded'));result[label]=state;
      for(const name of ['briefing','radar','helmut','office']){await view(p,name);assert.ok((await p.locator('.content-shell').innerText()).length>20);assert.equal(await p.locator('.content-shell').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,name);await shot(p,label+'-'+name);}
      const mapping=await p.evaluate(()=>({id:briefingOfficeDecision()?.id,ko:briefingOfficeDecision()?.knowledgeObjectId,vg:briefingOfficeDecision()?.vorgangId,rule:Object.values(officeDrafts).every(d=>d.source==='regel')}));assert.ok(mapping.id&&mapping.ko&&mapping.vg);assert.equal(mapping.rule,true);
      await view(p,'helmut');const before=result.requests.filter(r=>r.path.startsWith('/api/communication/generate')).length;await p.locator('[data-briefing-office]').click();await p.locator('.ui-office-detail').waitFor();const selected=await p.evaluate(()=>({id:selectedOfficeDraft.decision.id,ko:selectedOfficeDraft.decision.knowledgeObjectId,vg:selectedOfficeDraft.decision.vorgangId}));assert.deepEqual(selected,{id:mapping.id,ko:mapping.ko,vg:mapping.vg});assert.equal(result.requests.filter(r=>r.path.startsWith('/api/communication/generate')).length,before);assert.match(await p.locator('.ui-office-detail').innerText(),/Regelbasierter/i);await shot(p,label+'-briefing-office');
      assert.equal(result.requests.some(r=>r.path.startsWith('/api/office/generate')),false);await ctx.close();
    });
  }
  await check('Real profile save, CSRF denial and tenant selection stay bound to the member',async()=>{
    const ctx=await context();await login(ctx);const p=await pageFor(ctx);await p.goto(base+'/');await settled(p);const beforeB=JSON.stringify(await storage.getProfile(B));await view(p,'settings');await view(p,'profile-settings');const form=p.locator('#profileForm');await form.locator('[name="location"]').fill('Synthetischer Integrationsort');const pending=p.waitForResponse(r=>r.url().includes('/api/profile/current')&&r.request().method()==='PATCH');await form.locator('button[type="submit"]').click();assert.equal((await pending).status(),200);assert.equal((await storage.getProfile(A)).location,'Synthetischer Integrationsort');assert.equal(JSON.stringify(await storage.getProfile(B)),beforeB);
    assert.equal((await ctx.request.patch(base+'/api/profile/current',{data:{location:'Rejected'}})).status(),403);assert.equal((await ctx.request.get(base+'/api/admin/users')).status(),403);const wrong=await ctx.request.get(base+'/api/app/start?politicianId='+B);assert.equal((await wrong.json()).profile.id,A);await ctx.close();
  });
  await check('Original administration validates and persists a locked customer on desktop and mobile',async()=>{
    const ctx=await context();await login(ctx,'admin@joint.invalid');const p=await pageFor(ctx);await p.goto(base+'/verwaltung/#/kunden');await p.getByRole('heading',{name:'Kunden',exact:true}).waitFor();await p.evaluate(()=>document.fonts.ready);const style=await p.evaluate(()=>({body:getComputedStyle(document.body).fontFamily,heading:getComputedStyle(document.querySelector('h1')).fontFamily,rail:document.querySelector('nav[aria-label="Hauptnavigation"]').getBoundingClientRect().width}));assert.match(style.body,/Hanken/);assert.match(style.heading,/Spectral/);assert.equal(style.rail,212);result.administrationStyle=style;await shot(p,'admin-desktop');
    const profilesBefore=JSON.stringify(await storage.listProfiles());await p.getByRole('link',{name:'Kunde anlegen',exact:true}).click();await p.getByRole('button',{name:'Gesperrtes Konto speichern',exact:true}).click();await p.getByRole('alert').waitFor();assert.equal(await p.locator('[aria-invalid="true"]').count(),3);
    await p.setViewportSize({width:390,height:844});await p.getByLabel('Name des Kunden',{exact:true}).fill('Synthetische Organisation');await p.getByLabel('Ansprechpartner',{exact:true}).fill('Synthetischer Kontakt');await p.getByLabel('E-Mail',{exact:true}).fill('customer@joint.invalid');await p.getByLabel(/^Tarif/).selectOption('Büro');await p.getByRole('button',{name:'Gesperrtes Konto speichern',exact:true}).click();await p.getByRole('heading',{name:'Synthetischer Kontakt',exact:true}).waitFor();const user=await accounts.getUserByEmailRaw('customer@joint.invalid');assert.equal(user.active,false);assert.ok(!user.passwordHash);assert.equal(user.customer.pricePerMonth,null);assert.equal((await storage.readAuthStore()).passwordTokens?.length||0,0);assert.equal(JSON.stringify(await storage.listProfiles()),profilesBefore);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot(p,'admin-mobile-customer');await ctx.close();
  });
  await check('Shared SW preserves public font cache but denies cached administration after logout',async()=>{
    const ctx=await context();await login(ctx,'admin@joint.invalid');const p=await pageFor(ctx);await p.goto(base+'/');await settled(p);await controlled(p);await p.goto(base+'/verwaltung/#/kunden');await p.getByRole('heading',{name:'Kunden',exact:true}).waitFor();
    const pub='/assets/ui/fonts/HankenGrotesk-var.ttf',priv='/verwaltung/design/v2_tokens.css';const pubResponse=await ctx.request.get(base+pub),privResponse=await ctx.request.get(base+priv);
    await p.evaluate(async x=>{const c=await caches.open('helmut-assets-v2');for(const a of x)await c.put(a.url,new Response(Uint8Array.from(atob(a.bytes),z=>z.charCodeAt(0)),{headers:{'Content-Type':a.type}}));},[{url:pub,bytes:(await pubResponse.body()).toString('base64'),type:'font/ttf'},{url:priv,bytes:(await privResponse.body()).toString('base64'),type:'text/css'}]);
    const logout=await p.evaluate(async()=>{const r=await fetch('/api/auth/logout',{method:'POST'});return r.status;});assert.equal(logout,200);const denied=await p.evaluate(async url=>{const r=await fetch(url);return{status:r.status,text:await r.text()};},priv);assert.equal(denied.status,401);assert.match(denied.text,/anmelden/);assert.equal(await p.evaluate(async url=>!!await(await caches.open('helmut-assets-v2')).match(url),pub),true);
    assert.equal((await p.goto(base+'/verwaltung/')).status(),401);await p.goto(base+'/');await p.locator('#loginForm').waitFor();await login(ctx);assert.equal((await ctx.request.get(base+priv)).status(),403);
    await p.goto(base+'/');await settled(p);await accounts.destroyUserSessions(member.id);await p.evaluate(()=>loadBriefing());await p.locator('#loginForm').waitFor();assert.equal(await p.locator('.hstand').count(),0);await shot(p,'session-revoked');await ctx.close();
  });
  await check('No-mandate and unavailable-session server states appear honestly in the new UI',async()=>{
    for(const kind of ['no-mandate','auth-unavailable']){const ctx=await context();await login(ctx,kind==='no-mandate'?'empty@joint.invalid':'member@joint.invalid');const p=await pageFor(ctx);fault.auth=kind==='auth-unavailable';try{await p.goto(base+'/');await p.waitForFunction(()=>document.body.classList.contains('splash-gone'));assert.equal(await p.locator('.hstand').count(),0);assert.match(await p.locator('#app').innerText(),kind==='no-mandate'?/Mandat/i:/nicht|fehl|erreichbar|laden/i);await shot(p,kind);}finally{fault.auth=false;await ctx.close();}}
  });
  await check('Office endpoint distinction and original rule fallback remain explicit',async()=>{
    const ctx=await context();await login(ctx);const token=(await(await ctx.request.get(base+'/api/security/csrf')).json()).token;
    assert.equal((await ctx.request.post(base+'/api/office/generate',{headers:{'X-CSRF-Token':token},data:{prompt:'Synthetic',channel:'press',decision:{}}})).status(),400);
    const office=await ctx.request.post(base+'/api/office/generate',{headers:{'X-CSRF-Token':token},data:{vorgangId:'synthetic',outputType:'pressemitteilung'}});assert.equal(office.status(),200);assert.equal((await office.json()).reason,'office-disabled');
    const calls=result.requests.filter(r=>r.path.startsWith('/api/communication/generate'));assert.ok(calls.length>0);assert.ok(calls.every(r=>r.csrfPresent&&r.syntheticInput.decision.knowledge_object_id&&r.syntheticInput.decision.vorgang_id));result.communicationCalls=calls.length;await ctx.close();
  });
  fixtures.assertNoWrites();result.fixture=fixtures.summary();assert.deepEqual(result.counters,{model:0,mail:0,fetch:0});assert.deepEqual(result.blockedOperations,[]);assert.deepEqual(result.externalRequests,[]);assert.deepEqual(result.pageErrors,[]);result.status='PASS';
}
main().catch(e=>{result.status='FAIL';result.error={message:e.message,stack:e.stack};process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(app){app.closeAllConnections();await new Promise(r=>app.close(r));}if(fixtures){result.fixture=fixtures.summary();fixtures.restore();}result.summary={passed:result.checks.filter(c=>c.status==='PASS').length,failed:result.checks.filter(c=>c.status==='FAIL').length,requests:result.requests.length};fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,...result.summary,error:result.error?.message}));});
