"use strict";
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const SOURCE = process.env.HELMUT_JOINT_RUNTIME, OUT = process.env.HELMUT_JOINT_OUTPUT;
const proof = JSON.parse(fs.readFileSync(path.join(OUT, 'network.json')));
assert.equal(proof.verifiedBeforeServer, true);
assert.equal(fs.readlinkSync('/proc/self/ns/net'), proof.testNamespace);
assert.ok(process.env.NODE_OPTIONS.includes('lokaler-netzschutz'));
for (const key of Object.keys(process.env)) assert.ok(!/(SECRET|TOKEN|CREDENTIAL|SUPABASE|AZURE|VERCEL|DATABASE_URL|API_KEY)/i.test(key), key);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const result = {scope:'RELEASE_FIRST_NAVIGATION_CACHE_AND_CONNECTED_PRODUCT_PATHS', checks:[], requests:[], images:[], pageErrors:[], consoleErrors:[], externalRequests:[], blockedOperations:[], counters:{model:0, mail:0, fetch:0}, inputCommits:{backend:'e054c0bb80fa4c330082bace3cfff6d9bb89a926', ui:'011910746294109c04fd5dac8e153a22188b7467'}, syntheticReadSeams:true, realLocalFileStore:true, productionAcceptance:false};
const A='integration-synthetic-alpha', B='integration-synthetic-beta', PASSWORD='Synthetic-Joint-Local-Only-20261105!';
let app, browser, fixtures, base, lastPage, accounts, storage;
const fault={auth:false};
let legacyWorker=false;
const legacySw=fs.readFileSync(path.join(OUT,'legacy-sw.js'));
result.inputCommits.main='76b75e371c7db69d7c9381071e23443182fc3607';
result.workerResponses=[];
async function check(name, fn) { if(process.env.HELMUT_JOINT_VIEWS_ONLY==='1'&&!/^(desktop|mobile):/.test(name)||process.env.HELMUT_JOINT_CACHE_ONLY==='1'&&!name.startsWith('Public cached'))return; try {await fn(); result.checks.push({name,status:'PASS'}); console.log('PASS '+name);} catch(e) {result.checks.push({name,status:'FAIL',error:e.message}); if(lastPage&&!lastPage.isClosed()) await lastPage.screenshot({path:path.join(OUT,'first-failure.png'),fullPage:true}).catch(()=>{}); throw e;} }
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
    const row={method:req.method,path:req.url,status:null,csrfPresent:!!req.headers['x-csrf-token'],destination:req.headers['sec-fetch-dest']||''};result.requests.push(row);
    if(u.pathname==='/api/communication/generate'){const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{try{row.syntheticInput=JSON.parse(Buffer.concat(chunks));}catch{}});}
    res.on('finish',()=>{row.status=res.statusCode;row.contentType=res.getHeader('content-type');});
    if(u.pathname==='/sw.js'){result.workerResponses.push({legacy:legacyWorker,sha256:sha(legacyWorker?legacySw:fs.readFileSync(path.join(SOURCE,'sw.js')))});if(legacyWorker){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','Service-Worker-Allowed':'/'});res.end(legacySw);return;}}
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
  const seeds=JSON.parse(fs.readFileSync(path.join(OUT,'cache-upgrade-seed.json')));
  const html=fs.readFileSync(path.join(SOURCE,'index.html'),'utf8');
  const version=sha(Buffer.concat([fs.readFileSync(path.join(SOURCE,'client.js')),Buffer.from([0]),fs.readFileSync(path.join(SOURCE,'styles.css'))])).slice(0,16);
  await check('Content-bound version and real server assets preserve security and legal routes',async()=>{
    assert.match(html,new RegExp('styles\\.css\\?v='+version));assert.match(html,new RegExp('client\\.js\\?v='+version));
    const ctx=await context();result.assets=[];
    for(const file of ['client.js','styles.css','assets/ui/reichstag.jpg',...fs.readdirSync(path.join(SOURCE,'assets/ui/fonts')).filter(f=>f.endsWith('.ttf')).map(f=>'assets/ui/fonts/'+f)]){
      const r=await ctx.request.get(base+'/'+file);assert.equal(r.status(),200);assert.equal(sha(await r.body()),sha(fs.readFileSync(path.join(SOURCE,file))));if(file.endsWith('.ttf'))assert.match(r.headers()['content-type'],/^font\/ttf/);result.assets.push({file,sha256:sha(await r.body()),type:r.headers()['content-type']});
    }
    assert.equal((await ctx.request.get(base+'/verwaltung/')).status(),401);assert.equal((await ctx.request.get(base+'/server.js')).status(),404);
    for(const url of ['/impressum','/datenschutz']){const r=await ctx.request.get(base+url);assert.equal(r.status(),200);assert.match(await r.text(),/hallo@mithelmut\.de/);}
    result.assetVersion=version;await ctx.close();
  });
  for(const [label,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
    await check(label+': first executed UI after old-cache upgrade, four views and tenant/session protection',async()=>{
      legacyWorker=true;const ctx=await context(viewport);await login(ctx,'admin@joint.invalid');const p=await pageFor(ctx);
      await p.goto(base+'/verwaltung/#/kunden');await p.getByRole('heading',{name:'Kunden',exact:true}).waitFor();await controlled(p);
      await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();if(r.active.state!=='activated')await new Promise(resolve=>r.active.addEventListener('statechange',()=>{if(r.active.state==='activated')resolve();}));});
      const font='/assets/ui/fonts/HankenGrotesk-var.ttf',icon='/assets/helmut_appicon_192.png?v=20260712-iconfix1',priv='/verwaltung/design/v2_tokens.css?release-proof';
      const extra=[];for(const url of [font,icon,priv]){const r=await ctx.request.get(base+url);assert.equal(r.status(),200);extra.push({url,base64:(await r.body()).toString('base64'),mime:r.headers()['content-type']});}
      await p.evaluate(async rows=>{const c=await caches.open('helmut-assets-v2');for(const row of rows)await c.put(row.url,new Response(Uint8Array.from(atob(row.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':row.mime}}));await(await caches.open('helmut-badge')).put('/release-unrelated',new Response('preserve'));},[...seeds,...extra]);
      assert.equal((await ctx.request.post(base+'/api/auth/logout')).status(),200);
      const responses=[];p.on('response',r=>{const url=new URL(r.url());if(['/client.js','/styles.css'].includes(url.pathname))responses.push(r);});
      await p.goto(base+'/');await p.locator('#loginForm').waitFor();
      const firstAssets=[];
      for(const file of ['client.js','styles.css']){const rows=responses.filter(r=>new URL(r.url()).pathname==='/'+file);assert.equal(rows.length,1,file);const r=rows[0];assert.equal(new URL(r.url()).searchParams.get('v'),version);assert.equal(r.status(),200);assert.equal(r.fromServiceWorker(),true);assert.equal(sha(await r.body()),sha(fs.readFileSync(path.join(SOURCE,file))));firstAssets.push({file,url:new URL(r.url()).pathname+new URL(r.url()).search,sha256:sha(await r.body()),fromServiceWorker:true});}
      assert.ok(result.workerResponses.some(r=>r.legacy));
      // The old worker already fetched and executed the new, versioned client.
      // Now complete the normal worker update and preserve unrelated cache entries.
      legacyWorker=false;
      await p.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();const w=reg.installing||reg.waiting;if(w&&w.state!=='activated')await new Promise(resolve=>w.addEventListener('statechange',()=>{if(w.state==='activated')resolve();}));});
      await p.waitForFunction(async url=>!await(await caches.open('helmut-assets-v2')).match(url),priv);
      const kept=await p.evaluate(async urls=>{const c=await caches.open('helmut-assets-v2');const hashes=[];for(const url of urls){const r=await c.match(url);if(!r)return null;const h=await crypto.subtle.digest('SHA-256',await r.arrayBuffer());hashes.push(Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join(''));}return{hashes,badgeCanary:await(await(await caches.open('helmut-badge')).match('/release-unrelated')).text()};},[font,icon]);
      assert.deepEqual(kept.hashes,extra.slice(0,2).map(r=>sha(Buffer.from(r.base64,'base64'))));assert.equal(kept.badgeCanary,'preserve');
      await p.waitForFunction(async urls=>{const c=await caches.open('helmut-assets-v2');return (await Promise.all(urls.map(url=>c.match(url)))).every(x=>!x);},seeds.map(r=>r.url));
      await p.locator('#loginForm [name="email"]').fill('member@joint.invalid');await p.locator('#loginForm [name="password"]').fill(PASSWORD);await p.locator('#loginForm button[type="submit"]').click();await settled(p);
      const state=await p.evaluate(()=>({profile:profile.id,lage:briefing.lageBriefing.vorgaenge.length,radar:briefing.currentRadarState.anzeige.mentions.length,primary:briefing.currentHelmutState.primaryItem.id}));assert.equal(state.profile,A);assert.ok(state.lage>0&&state.radar>0&&state.primary);
      for(const name of ['briefing','radar','helmut','office']){await view(p,name);if(name==='helmut'){await settled(p);await p.locator('[data-briefing-office]').waitFor();}assert.equal(await p.locator('.content-shell').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);await shot(p,label+'-'+name);}
      const decision=await p.evaluate(()=>({id:briefingOfficeDecision().id,ko:briefingOfficeDecision().knowledgeObjectId,vg:briefingOfficeDecision().vorgangId}));await view(p,'helmut');const before=result.requests.filter(r=>r.path.startsWith('/api/communication/generate')).length;await p.locator('[data-briefing-office]').click();await p.locator('.ui-office-detail').waitFor();assert.deepEqual(await p.evaluate(()=>({id:selectedOfficeDraft.decision.id,ko:selectedOfficeDraft.decision.knowledgeObjectId,vg:selectedOfficeDraft.decision.vorgangId})),decision);assert.match(await p.locator('.ui-office-detail').innerText(),/Regelbasierter/i);assert.equal(result.requests.filter(r=>r.path.startsWith('/api/communication/generate')).length,before);await shot(p,label+'-office-bound');
      assert.equal((await ctx.request.get(base+'/api/admin/users')).status(),403);assert.equal((await ctx.request.patch(base+'/api/profile/current',{data:{location:'Forbidden'}})).status(),403);assert.equal((await(await ctx.request.get(base+'/api/app/start?politicianId='+B)).json()).profile.id,A);
      const privateDenied=await p.evaluate(async url=>(await fetch(url)).status,priv);assert.equal(privateDenied,403);
      await accounts.destroyUserSessions(member.id);await p.evaluate(()=>loadBriefing());await p.locator('#loginForm').waitFor();assert.equal(await p.locator('.hstand').count(),0);
      result[label]={state,firstAssets,unrelatedCachesPreserved:true,oldPublicEntriesPruned:true,oldWorkerFirstNavigation:true};await ctx.close();
    });
  }
  await check('Original administration keeps locked customer creation and native Office separate',async()=>{
    const ctx=await context();await login(ctx,'admin@joint.invalid');const p=await pageFor(ctx);await p.goto(base+'/verwaltung/#/kunden');await p.getByRole('heading',{name:'Kunden',exact:true}).waitFor();await shot(p,'admin-desktop');
    const profilesBefore=JSON.stringify(await storage.listProfiles());await p.getByRole('link',{name:'Kunde anlegen',exact:true}).click();await p.getByRole('button',{name:'Gesperrtes Konto speichern',exact:true}).click();await p.getByRole('alert').waitFor();assert.equal(await p.locator('[aria-invalid="true"]').count(),3);
    await p.setViewportSize({width:390,height:844});await p.getByLabel('Name des Kunden',{exact:true}).fill('Synthetische Freigabeorganisation');await p.getByLabel('Ansprechpartner',{exact:true}).fill('Synthetischer Freigabekontakt');await p.getByLabel('E-Mail',{exact:true}).fill('release-customer@joint.invalid');await p.getByLabel(/^Tarif/).selectOption('Büro');await p.getByRole('button',{name:'Gesperrtes Konto speichern',exact:true}).click();await p.getByRole('heading',{name:'Synthetischer Freigabekontakt',exact:true}).waitFor();
    const customer=await accounts.getUserByEmailRaw('release-customer@joint.invalid');assert.equal(customer.active,false);assert.ok(!customer.passwordHash);assert.equal(customer.customer.pricePerMonth,null);assert.equal(JSON.stringify(await storage.listProfiles()),profilesBefore);await shot(p,'admin-mobile-customer');
    await ctx.close();const memberCtx=await context();await login(memberCtx);const token=(await(await memberCtx.request.get(base+'/api/security/csrf')).json()).token;
    assert.equal((await memberCtx.request.post(base+'/api/office/generate',{headers:{'X-CSRF-Token':token},data:{prompt:'Synthetic',channel:'press',decision:{}}})).status(),400);
    const native=await memberCtx.request.post(base+'/api/office/generate',{headers:{'X-CSRF-Token':token},data:{vorgangId:'synthetic',outputType:'pressemitteilung'}});assert.equal(native.status(),200);assert.equal((await native.json()).reason,'office-disabled');await memberCtx.close();
  });
  fixtures.assertNoWrites();result.fixture=fixtures.summary();assert.deepEqual(result.counters,{model:0,mail:0,fetch:0});assert.deepEqual(result.blockedOperations,[]);assert.deepEqual(result.externalRequests,[]);assert.deepEqual(result.pageErrors,[]);result.status='PASS';
}
main().catch(e=>{result.status='FAIL';result.error={message:e.message,stack:e.stack};process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(app){app.closeAllConnections();await new Promise(r=>app.close(r));}if(fixtures){result.fixture=fixtures.summary();fixtures.restore();}result.summary={passed:result.checks.filter(c=>c.status==='PASS').length,failed:result.checks.filter(c=>c.status==='FAIL').length,requests:result.requests.length};fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,...result.summary,error:result.error?.message}));});
