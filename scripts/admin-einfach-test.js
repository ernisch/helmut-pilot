"use strict";
// Bestehende echte HTTP-Routen + eigenes wegwerfbares lokales Backend.
// Keine Productiondaten, Modellaufrufe oder Nachrichten. Immer ueber lokal.js.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
function isolatedBackend(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'helmut-admin-einfach-')),clone=path.join(temp,'backend');
 execFileSync('git',['clone','--quiet','--shared','--no-hardlinks','--single-branch',root,clone],{stdio:'pipe'});
 for(const file of ['server.js','verwaltung/original-actions.mjs','scripts/einfache-verwaltung-paket.js'])fs.copyFileSync(path.join(root,file),path.join(clone,file));
 fs.cpSync(path.join(root,'verwaltung/einfach'),path.join(clone,'verwaltung/einfach'),{recursive:true});
 assert.equal(fs.existsSync(path.join(clone,'.helmut-data')),false);
 return {temp,clone};
}
async function run({browser=false,evidenceDir=null}={}){
 assert.ok(process.env.NODE_OPTIONS?.includes('lokaler-netzschutz'));
 assert.equal(process.env.HELMUT_STORAGE_BACKEND,'local');
 process.env.HELMUT_AUTH_MODE='accounts';process.env.HELMUT_STORE_CACHE_MS='0';process.env.HELMUT_TESTLAUF_KOMMUNIKATION='gesperrt';
 const {temp,clone}=isolatedBackend();let server,browserInstance;
 const errors=[],consoleErrors=[],requests=[];
 try{
  const accounts=require(path.join(clone,'lib/helmut/accounts'));
  const storage=require(path.join(clone,'lib/helmut/storage'));
  const handler=require(path.join(clone,'server'));
  const admin=await accounts.createUser({name:'Fiktive Verwaltung',email:'admin@example.invalid',role:'admin',password:'Only-Synthetic-123!'});
  await accounts.createUser({name:'Fiktives Fremdkonto',email:'member@example.invalid',role:'abgeordneter',password:'Only-Synthetic-123!'});
  server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function login(email){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Only-Synthetic-123!'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
  const cookie=await login(admin.email),memberCookie=await login('member@example.invalid');
  const authenticated=(url,options={})=>fetch(base+url,{...options,headers:{...options.headers,Cookie:cookie}});
  const {createSimpleApi}=await import(pathToFileURL(path.join(root,'verwaltung/einfach/api.mjs')));
  const {customerState,berlinDay}=await import(pathToFileURL(path.join(root,'verwaltung/einfach/model.mjs')));
  const api=createSimpleApi({fetcher:authenticated});
  await check('Alle Kandidatenassets nur fuer angemeldete Administratoren',async()=>{
   for(const asset of ['','app.mjs','api.mjs','styles.css']){
    const route='/verwaltung/einfach/'+asset;
    assert.equal((await fetch(base+route)).status,401);
    assert.equal((await fetch(base+route,{headers:{Cookie:memberCookie}})).status,403);
    const r=await authenticated(route);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
    assert.doesNotMatch(r.headers.get('content-security-policy'),/unsafe-eval|unsafe-inline/);
   }
  });
  await check('Feste Assetliste ohne Quellcode-/Traversalfreigabe',async()=>{
   for(const route of ['/verwaltung/einfach/server.js','/verwaltung/einfach/%2e%2e%2fserver.js','/verwaltung/einfach/preview.mjs'])assert.equal((await authenticated(route)).status,404);
   assert.equal((await authenticated('/verwaltung/einfach/',{method:'POST'})).status,405);
  });
  await check('Tatsaechlicher Kundenbestand wird gelesen; Admin ist kein Kunde',async()=>{
   const d=await api.load();assert.equal(d.customers.length,1);assert.notEqual(d.customers[0].userId,admin.id);
   assert.equal(d.resultDay,null);assert.equal(customerState(d,d.customers[0]).key,'setup');
  });
  let user;
  await check('Name und E-Mail erzeugen bestaetigtes gesperrtes Konto ohne Ansprechpartner/Tarif/Einladung',async()=>{
   await storage.saveProfile({id:'fiktiver-kunde-einfach',fullName:'Fiktiver Kunde Einfach',party:'SPD',faction:'SPD',profileActive:false});
   const result=await api.createCustomer({name:'Fiktiver Kunde Einfach',email:'einfach@example.invalid'});user=result.user;
   assert.match(user.politicianId,/^kunde-/);assert.notEqual(user.politicianId,'fiktiver-kunde-einfach');
   assert.equal((await storage.getProfile('fiktiver-kunde-einfach')).fullName,'Fiktiver Kunde Einfach');
   const stored=await accounts.getUserByIdRaw(user.id);assert.equal(stored.name,'Fiktiver Kunde Einfach');assert.equal(stored.active,false);assert.equal(stored.passwordHash,null);
   assert.doesNotMatch(stored.customer.internalNote,/Ansprechpartner|Tarifwunsch/);
   assert.equal((await accounts.listPendingInvites())[user.id],undefined);
   assert.equal(await storage.getProfile(user.politicianId),null);
   assert.equal((await api.load()).customers.some(c=>c.userId===user.id),true);
  });
  await check('Doppelte E-Mail legt kein zweites Konto an',async()=>{
   const before=(await accounts.listUsers()).length;
   await assert.rejects(api.createCustomer({name:'Fiktiv Duplikat',email:'einfach@example.invalid'}),e=>e.status===409);
   assert.equal((await accounts.listUsers()).length,before);
  });
  await check('Mandatsangaben werden wirklich gespeichert und bleiben zunaechst inaktiv',async()=>{
   const input={fullName:user.name,party:'SPD',faction:'SPD',parliamentType:'Bundestag',state:'Berlin',constituency:'Fiktiver Wahlkreis',focusTopics:['Fiktives Thema']};
   const saved=await api.saveProfile(user.politicianId,input);
   assert.equal(saved.profile.profileActive,false);assert.equal(saved.profile.fullName,user.name);
   assert.deepEqual((await storage.getProfile(user.politicianId)).focusTopics,input.focusTopics);
   assert.equal(customerState(await api.load(),(await api.load()).customers.find(c=>c.userId===user.id)).key,'paused');
  });
  await check('Bestehende Profilfelder bleiben beim Bearbeiten erhalten',async()=>{
   const p=await storage.getProfile(user.politicianId);await storage.saveProfile({...p,internalFutureField:'erhalten'});
   await api.saveProfile(user.politicianId,{fullName:p.fullName,party:p.party,faction:p.faction,parliamentType:p.parliamentType,state:p.state,constituency:p.constituency,focusTopics:['Fiktives Thema Zwei']});
   assert.equal((await storage.getProfile(user.politicianId)).internalFutureField,'erhalten');
  });
  await check('Aktivierung ist explizit und erzeugt noch keinen Briefing-Erfolgsnachweis',async()=>{
   const r=await api.activateProfile(user.politicianId);assert.equal(r.profile.profileActive,true);
   const d=await api.load(),c=d.customers.find(c=>c.userId===user.id);assert.equal(customerState(d,c).key,'unknown');
  });
  await check('Status aus aktuellen gebundenen Antwortpositionen; Qualitaetsurteil bleibt offen',async()=>{
   const d=await api.load(),c=d.customers.find(c=>c.userId===user.id),pos={stufe:3,ursache:null};
   d.resultDay=berlinDay(d.now);d.results={[user.politicianId]:{positionen:{briefing:pos,zustellung:pos,lage:pos}}};
   assert.equal(customerState(d,c).key,'current');assert.match(customerState(d,c).reason,/Beurteilung ist offen/);
   d.resultDay='2000-01-01';assert.equal(customerState(d,c).key,'unknown');
   d.resultDay=berlinDay(d.now);d.results[user.politicianId].positionen.briefing={stufe:0,ursache:'fehlt'};assert.equal(customerState(d,c).key,'problem');
   d.customers.push({...c,userId:'zweite-zuordnung'});assert.equal(customerState(d,c).key,'setup');
  });
  await check('Vercel-Vorschau darf keine echten Konten anlegen',async()=>{
   let writes=0;const p=createSimpleApi({fetcher:async(url,options={})=>{
    if(options.method&&options.method!=='GET')writes++;
    return {ok:true,status:200,json:async()=>url.includes('customers')?{kunden:[]}:url.includes('overview')?{mandates:[],system:{deploy:{environment:'preview'}}}:{verfuegbar:false}};
   }});await p.load();await assert.rejects(p.createCustomer({name:'Fiktiv',email:'f@example.invalid'}),/Vorschau/);assert.equal(writes,0);p.dispose();
  });
  await check('401 entfernt statt erfolgreichem Leerbestand den gesamten Zugriff',async()=>{
   const denied=createSimpleApi({fetcher:async()=>({ok:false,status:401,json:async()=>({})})});await assert.rejects(denied.load(),e=>e.status===401);denied.dispose();
  });
  if(browser){
   const {chromium}=require('playwright');
   browserInstance=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
   const context=await browserInstance.newContext({viewport:{width:1440,height:1100}});
   await context.addCookies([{name:'helmut_session',value:cookie.slice(cookie.indexOf('=')+1),url:base}]);
   const page=await context.newPage();
   page.on('pageerror',err=>errors.push(err.message));
   page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404 (Not Found)'))consoleErrors.push(message.text());});
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==base)return route.abort();return route.continue();});
   page.on('request',r=>requests.push({url:new URL(r.url()).pathname,method:r.method()}));
   page.on('dialog',dialog=>dialog.accept());
   await page.goto(base+'/verwaltung/einfach/');
   await page.getByRole('heading',{name:'Auf einen Blick.'}).waitFor();
   await check('Neue Oberflaeche bootet mit drei Hauptbereichen und echten lokalen Konten',async()=>{assert.equal(await page.locator('.nav button').count(),3);assert.ok((await page.locator('main').innerText()).includes('Fiktiver Kunde Einfach'));});
   if(evidenceDir)await page.screenshot({path:path.join(evidenceDir,'app-uebersicht.png'),fullPage:true});
   await page.locator('[data-action="new"]').first().click();
   await check('Kundenanlage hat genau Name und E-Mail',async()=>{assert.equal(await page.locator('#new-customer input').count(),2);assert.equal(await page.getByText('Ansprechpartner',{exact:true}).count(),0);});
   await page.locator('#name').fill('Fiktiver Browserkunde');await page.locator('#email').fill('browser@example.invalid');
   await page.locator('#new-customer button[type="submit"]').click();
   await page.getByRole('heading',{name:'Fiktiver Browserkunde',exact:true}).waitFor();
   await check('Browserkonto liegt wirklich im isolierten Backend',async()=>{const c=(await accounts.listUsers()).find(u=>u.email==='browser@example.invalid');assert.ok(c);assert.equal(c.active,false);assert.equal(await storage.getProfile(c.politicianId),null);assert.equal(await page.locator('h1').evaluate(el=>el===document.activeElement),true);});
   await page.locator('[data-action="profile"]').first().click();
   await page.getByRole('heading',{name:'Mandat einrichten.'}).waitFor();
   await page.locator('#parliamentType').selectOption('Landtag');await page.locator('#state').selectOption('Berlin');await page.locator('#party').fill('SPD');await page.locator('#faction').fill('SPD');await page.locator('#constituency').fill('Fiktive Region');await page.locator('#topics').fill('Fiktives Thema');
   await page.locator('#profile-form button[type="submit"]').click();
   await page.getByRole('heading',{name:'Fiktiver Browserkunde',exact:true}).waitFor();
   await check('Browser speichert Mandat, ohne den Kunden als versorgt auszugeben',async()=>{const c=(await accounts.listUsers()).find(u=>u.email==='browser@example.invalid');const p=await storage.getProfile(c.politicianId);assert.equal(p.parliamentType,'Landtag');assert.equal(p.profileActive,false);assert.match(await page.locator('main').innerText(),/Versorgung pausiert/);});
   await page.locator('[data-action="activate"]').click();
   await page.getByText('Aktiv',{exact:true}).waitFor();
   await check('Aktivieren bleibt getrennt vom tatsaechlichen Briefing',async()=>{assert.equal(await page.getByText('Heute bereit',{exact:true}).count(),0);});
   await page.locator('[data-action="invite"]').click();await page.locator('#invite-url').waitFor();
   await check('Zugangslink ist wirklich ein lokales Einmaltoken; keine Mailzustellung behauptet',async()=>{const c=(await accounts.listUsers()).find(u=>u.email==='browser@example.invalid');assert.ok((await accounts.listPendingInvites())[c.id]);assert.equal(await page.getByText('Zugangslink versendet.',{exact:true}).count(),0);});
   await page.locator('[data-action="hide-invite"]').click();
   for(const width of [1440,390,360,320]){
    await page.setViewportSize({width,height:900});
    await check('Kundenseite ohne horizontalen Ueberlauf bei '+width,async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true));
    if(evidenceDir&&width===390)await page.screenshot({path:path.join(evidenceDir,'app-kunde-mobil.png'),fullPage:true});
   }
   await page.locator('[data-nav="settings"]').click();await page.locator('[data-setting="budget"]').click();await page.getByRole('heading',{name:'Kosten',exact:true}).waitFor();
   await check('Kostenansicht liest die vorhandene Route',async()=>assert.ok(requests.some(r=>r.url==='/api/admin/stats/budget-today')));
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('[data-action="settings"]').click();await page.locator('[data-setting="sources"]').click();
   await page.getByText('Der Quellenstand konnte noch nicht bestätigt werden.',{exact:true}).waitFor();
   await check('Fehlende Quelldaten sind ein erklaerter Zustand mit echtem Detailzugang',async()=>{assert.equal(await page.locator('a[href="/verwaltung/#/betrieb/quellen"]').count(),1);assert.equal(await page.getByText('Quellenzugänge',{exact:true}).count(),0);});
   assert.deepEqual(consoleErrors,[]);
   await context.route('**/api/admin/customers',route=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"Bitte erneut anmelden."}'}));
   await page.locator('[data-action="refresh"]').first().click();
   await page.getByRole('heading',{name:'Bitte melde dich erneut an.',exact:true}).waitFor();
   await check('Zugriffsentzug entfernt Kundendaten aus dem Browser',async()=>{assert.doesNotMatch(await page.locator('main').innerText(),/Fiktiver|browser@example/);});
   assert.deepEqual(errors,[]);assert.ok(consoleErrors.every(message=>message.includes('401 (Unauthorized)')),'Nur der bewusst erzwungene HTTP401 darf einen Konsolenhinweis erzeugen');
   if(evidenceDir)fs.writeFileSync(path.join(evidenceDir,'app-pruefung.json'),JSON.stringify({status:'PASS',observedAt:new Date().toISOString(),checks:passed,requests,pageErrors:errors,scope:'Isolierter echter lokaler HTTP-/Konten-/Profilspeicher; Ergebnisstatus zusaetzlich mit synthetischen Antwortvertraegen. Keine Production- oder Modellpruefung.'},null,2)+'\n');
  }
  api.dispose();return {passed};
 }finally{if(browserInstance)await browserInstance.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
}
if(require.main===module)run().then(r=>console.log('PASS '+r.passed+' Gruppen')).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={run};
