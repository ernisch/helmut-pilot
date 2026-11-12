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
 // CI installiert Laufzeitpakete im Ausgangscheckout. Nur diese vorhandenen
 // Pakete teilen; Daten und Zugangsdaten bleiben im wegwerfbaren Klon isoliert.
 if(fs.existsSync(path.join(root,'node_modules')))fs.symlinkSync(path.join(root,'node_modules'),path.join(clone,'node_modules'),'dir');
 for(const file of ['server.js','verwaltung/original-actions.mjs','scripts/einfache-verwaltung-paket.js','scripts/profil-auswahl-paket.js','verwaltung/original-quellenlauf.mjs'])fs.copyFileSync(path.join(root,file),path.join(clone,file));
 fs.cpSync(path.join(root,'verwaltung/einfach'),path.join(clone,'verwaltung/einfach'),{recursive:true});
 assert.equal(fs.existsSync(path.join(clone,'.helmut-data')),false);
 return {temp,clone};
}
async function run({browser=false,evidenceDir=null}={}){
 assert.ok(process.env.NODE_OPTIONS?.includes('lokaler-netzschutz'));
 assert.equal(process.env.HELMUT_STORAGE_BACKEND,'local');
 process.env.HELMUT_AUTH_MODE='accounts';process.env.HELMUT_STORE_CACHE_MS='0';process.env.HELMUT_QUELLEN_ARBEITSFENSTER='off';process.env.HELMUT_TESTLAUF_KOMMUNIKATION='gesperrt';
 const {temp,clone}=isolatedBackend();let server,browserInstance;
 const errors=[],consoleErrors=[],requests=[];
 try{
  const accounts=require(path.join(clone,'lib/helmut/accounts'));
  const storage=require(path.join(clone,'lib/helmut/storage'));
  const mailer=require(path.join(clone,'lib/helmut/invite-mail')),mailCalls=[];
  const originalSend=mailer.sendAccessMail;
  mailer.sendAccessMail=async(message,context)=>{const u=await accounts.getUserByEmailRaw(message.to);mailCalls.push({message,profile:await storage.getProfile(u.politicianId)});return originalSend(message,context);};
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
  const api=createSimpleApi({fetcher:authenticated,origin:base});
  await check('Alle Kandidatenassets nur fuer angemeldete Administratoren',async()=>{
   for(const asset of ['','app.mjs','api.mjs','styles.css','profil-auswahl.mjs','versorgung.mjs','logo.svg','sans.woff2','serif.woff2']){
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
   for(const [file,type] of [['logo.svg','image/svg+xml'],['sans.woff2','font/woff2'],['serif.woff2','font/woff2']])assert.equal((await authenticated('/verwaltung/einfach/'+file)).headers.get('content-type'),type);
   assert.equal((await fetch(base+'/verwaltung/original-quellenlauf.mjs')).status,401);assert.equal((await authenticated('/verwaltung/original-quellenlauf.mjs')).status,200);
  });
  await check('Tatsaechlicher Kundenbestand wird gelesen; Admin ist kein Kunde',async()=>{
   const d=await api.load();assert.equal(d.customers.length,1);assert.notEqual(d.customers[0].userId,admin.id);
   assert.equal(d.resultDay,null);assert.equal(customerState(d,d.customers[0]).key,'setup');
  });
  const mandate={party:'SPD',faction:'SPD',parliamentType:'Bundestag',state:'Berlin',constituency:'Kein Wahlkreis (Landesliste)',focusTopics:['Fiktives Thema']};
  let user;
  await check('Vollstaendige Anlage speichert Konto und Mandat vor der einmaligen Einladung',async()=>{
   await storage.saveProfile({id:'fiktiver-kunde-einfach',fullName:'Fiktiver Kunde Einfach',party:'SPD',faction:'SPD',profileActive:false});
   const result=await api.createCustomer({...mandate,name:'Fiktiver Kunde Einfach',email:'einfach@example.invalid'});user=result.user;
   assert.match(user.politicianId,/^kunde-/);assert.notEqual(user.politicianId,'fiktiver-kunde-einfach');
   assert.equal((await storage.getProfile('fiktiver-kunde-einfach')).fullName,'Fiktiver Kunde Einfach');
   const stored=await accounts.getUserByIdRaw(user.id);assert.equal(stored.name,'Fiktiver Kunde Einfach');assert.equal(stored.active,true);assert.equal(stored.status,'eingeladen');assert.equal(stored.passwordHash,null);
   assert.doesNotMatch(stored.customer.internalNote,/Ansprechpartner|Tarifwunsch/);
   assert.ok((await accounts.listPendingInvites())[user.id]);
   assert.equal((await storage.getProfile(user.politicianId)).profileActive,false);
   assert.deepEqual((await storage.getProfile(user.politicianId)).focusTopics,mandate.focusTopics);
   assert.equal(mailCalls.length,1);assert.equal(mailCalls[0].message.to,user.email);
   assert.equal(mailCalls[0].profile.fullName,user.name);assert.equal(result.invitation.mail.sent,false);
   assert.equal((await api.load()).customers.some(c=>c.userId===user.id),true);
  });
  await check('Doppelte E-Mail legt kein zweites Konto an',async()=>{
   const before=(await accounts.listUsers()).length;
   await assert.rejects(api.createCustomer({...mandate,name:'Fiktiv Duplikat',email:'einfach@example.invalid'}),e=>e.status===409);
   assert.equal((await accounts.listUsers()).length,before);
  });
  await check('Unvollstaendige Angaben erzeugen weder Konto noch Einladung',async()=>{
   const before=(await accounts.listUsers()).length,mailCount=mailCalls.length;
   await assert.rejects(api.createCustomer({name:'Fiktiv Unvollstaendig',email:'leer@example.invalid'}),e=>e.status===400);
   await assert.rejects(api.createCustomer({...mandate,name:'Fiktiv Falsch',email:'falsch@example.invalid',constituency:'Falscher Wahlkreis'}),e=>e.status===400);
   assert.equal((await accounts.listUsers()).length,before);assert.equal(mailCalls.length,mailCount);
  });
  await check('Leere oder ausgelassene Schwerpunkte erlauben Anlage und Einladung, Versorgung bleibt pausiert',async()=>{
   for(const [email,focusTopics] of [['ohne-themen@example.invalid',[]],['spaeter@example.invalid',undefined]]){
    const result=await api.createCustomer({...mandate,name:'Fiktiv ohne Schwerpunkte',email,focusTopics});
    assert.equal(result.user.active,true);assert.ok((await accounts.listPendingInvites())[result.user.id]);assert.deepEqual((await storage.getProfile(result.user.politicianId)).focusTopics,[]);
    assert.deepEqual(result.validierung.fehlendePflichtfelder,['mind. ein Schwerpunkt oder Ausschuss']);
    const data=await api.load();assert.equal(customerState(data,data.customers.find(c=>c.userId===result.user.id)).label,'Schwerpunkte offen');
    await assert.rejects(api.activateProfile(result.user.politicianId),e=>e.status===409);assert.equal((await storage.getProfile(result.user.politicianId)).profileActive,false);
   }
  });
  await check('Mandatsfehler behaelt gesperrtes Konto und sendet keine Einladung',async()=>{
   const mailCount=mailCalls.length;
   const broken=createSimpleApi({origin:base,fetcher:(url,options={})=>url.startsWith('/api/admin/profile/')&&options.method==='PATCH'?Promise.resolve(new Response('{}',{status:400})):authenticated(url,options)});
   await broken.load();let failure;
   await assert.rejects(broken.createCustomer({...mandate,name:'Fiktiver Abbruch',email:'abbruch@example.invalid'}),e=>{failure=e;return e.stage==='profile'&&!!e.partialAccount;});
   const c=await accounts.getUserByIdRaw(failure.partialAccount.id);assert.equal(c.active,false);
   assert.equal(await storage.getProfile(c.politicianId),null);assert.equal((await accounts.listPendingInvites())[c.id],undefined);assert.equal(mailCalls.length,mailCount);broken.dispose();
  });
  await check('Unklare Einladungsantwort wird nicht wiederholt und nennt bestehenden Kunden',async()=>{
   let sends=0;
   const broken=createSimpleApi({origin:base,fetcher:async(url,options={})=>{const r=await authenticated(url,options);if(url.endsWith('/invite')){sends++;throw new Error('Synthetischer Antwortverlust');}return r;}});
   await broken.load();let failure;
   await assert.rejects(broken.createCustomer({...mandate,name:'Fiktiver Antwortverlust',email:'antwortverlust@example.invalid'}),e=>{failure=e;return e.stage==='invite'&&e.outcomeUnknown&&!!e.partialAccount;});
   assert.equal(sends,1);assert.ok((await accounts.listPendingInvites())[failure.partialAccount.id]);assert.equal((await storage.getProfile(failure.partialAccount.politicianId)).profileActive,false);broken.dispose();
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
   }});await p.load();await assert.rejects(p.createCustomer({name:'Fiktiv',email:'f@example.invalid'}),/Vorschau/);await assert.rejects(p.sourceRun.start(),/Vorschau/);assert.equal(writes,0);p.dispose();
  });
  await check('401 entfernt statt erfolgreichem Leerbestand den gesamten Zugriff',async()=>{
   const denied=createSimpleApi({fetcher:async()=>({ok:false,status:401,json:async()=>({})})});await assert.rejects(denied.load(),e=>e.status===401);denied.dispose();
  });
  await check('Kanonische HTTPS-Zugangslinks werden angezeigt, aber niemals aufgerufen',async()=>{
   const calls=[],url='https://kanonisches-beispiel.invalid/passwort-setzen?token=synthetisch';
   const p=createSimpleApi({fetcher:async(route,options={})=>{
    calls.push(route);let value={verfuegbar:false};
    if(route.includes('customers'))value={kunden:[]};
    else if(route.includes('overview'))value={mandates:[],system:{deploy:{environment:'local'}}};
    else if(route==='/api/admin/users')value=[{id:'synthetic-invite',role:'abgeordneter',status:'eingeladen',active:true}];
    else if(route==='/api/security/csrf')value={token:'f'.repeat(32)};
    else if(route.endsWith('/invite'))value={inviteUrl:url,mail:{sent:false}};
    return {ok:true,status:200,json:async()=>value};
   }});await p.load();assert.equal((await p.invite('synthetic-invite')).inviteUrl,url);assert.ok(calls.every(x=>x.startsWith('/api/')));p.dispose();
  });
  await check('Quellenmetadaten und UTC-Zeitplan bleiben von einem Briefingerfolg getrennt',async()=>{
   const {latestSourceRun,nextSourceCheck,sourceRunView,briefingSummary}=await import(pathToFileURL(path.join(root,'verwaltung/einfach/versorgung.mjs')));
   const history={processRuns:[{process:'warteschlange-crawl',startedAt:'2026-11-12T03:00:00Z',status:'running'}],zeitplan:[{path:'/api/cron/crawl?arbeitsfenster=1',schedule:'0,15,30,45 3 * * *'},{path:'/api/cron/crawl',schedule:'0 4 * * *'}]};
   assert.equal(latestSourceRun(history,'2026-11-12T03:02:00Z').label,'Läuft');assert.equal(latestSourceRun(history,'2026-11-12T08:00:00Z').label,'Abschluss offen');
   assert.equal(nextSourceCheck(history,'2026-11-12T03:16:00Z'),'2026-11-12T03:30:00.000Z');assert.equal(nextSourceCheck(history,'2026-11-12T05:00:00Z'),'2026-11-13T03:00:00.000Z');
   assert.equal(nextSourceCheck({zeitplan:[{path:'/api/cron/crawl',schedule:'*/15 * * * *'}]}),null);
   assert.equal(sourceRunView({zustand:'gesperrt',grund:'fensterkontingent-erschoepft'}).disabled,true);
   assert.equal(briefingSummary(await api.load()).ready,0);
  });
  await check('Abgewiesener Quellenstart raeumt die Auftragskennung auf und entzieht Schreibzugriff',async()=>{
   const saved=new Map(),events=[];
   const p=createSimpleApi({host:{crypto:require('node:crypto').webcrypto,sessionStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)}},fetcher:async(url,options={})=>{
    if(url==='/api/admin/quellenlauf'&&options.method==='POST')return new Response('{}',{status:401});
    let value=url.includes('customers')?{kunden:[]}:url.includes('overview')?{mandates:[],system:{deploy:{environment:'local'}}}:url==='/api/security/csrf'?{token:'s'.repeat(32)}:{verfuegbar:false};
    return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
   }});await p.load();p.sourceRun.subscribe(s=>events.push(s));await p.sourceRun.start();assert.ok(events.some(s=>s.accessStatus===401));assert.equal(saved.has('helmut-admin-quellenauftrag-v1'),false);await assert.rejects(p.sourceRun.start());p.dispose();
  });
  if(browser){
   const oldProfile=await storage.getProfile(user.politicianId);
   await storage.saveProfile({...oldProfile,party:'Fiktive Regionalpartei',faction:'Fiktive Fraktion',constituency:'Fiktive Region'});
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
   await check('Neue Oberflaeche bootet mit drei Hauptbereichen und echten lokalen Konten',async()=>{assert.equal(await page.locator('.nav button').count(),3);assert.equal(await page.locator('main > .summary-line').count(),0);});
   if(evidenceDir)await page.screenshot({path:path.join(evidenceDir,'app-uebersicht.png'),fullPage:true});
   await page.locator('[data-nav="customers"]').click();await page.locator(`[data-customer="${user.id}"]`).click();await page.locator('[data-action="profile"]').first().click();
   await page.locator('#profile-form').waitFor();
   await check('Vorhandene freie Bezeichnungen bleiben beim Oeffnen im Dropdown erhalten',async()=>{assert.equal(await page.locator('#party').inputValue(),'Fiktive Regionalpartei');assert.equal(await page.locator('#faction').inputValue(),'Fiktive Fraktion');assert.equal(await page.locator('#constituency').inputValue(),'Fiktive Region');});
   await page.locator('[data-nav="customers"]').click();
   await page.locator('[data-action="new"]').first().click();
   await check('Ein Formular enthaelt Kontaktdaten und alle Mandatsangaben ohne Adminpasswort',async()=>{assert.equal(await page.locator('#new-customer input').count(),2);assert.equal(await page.locator('#new-customer select').count(),5);assert.equal(await page.locator('#new-customer textarea').count(),1);assert.equal(await page.getByText('Ansprechpartner',{exact:true}).count(),0);});
   await page.locator('#name').fill('Fiktiver Browserkunde');await page.locator('#email').fill('browser@example.invalid');
   await page.locator('#new-customer button[type="submit"]').click();
   await check('Fehlende Mandatsangaben verhindern die Anlage im Browser',async()=>{assert.equal((await accounts.listUsers()).some(u=>u.email==='browser@example.invalid'),false);assert.equal(await page.locator('#new-customer').count(),1);});
   const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/profil-wahlkreise.json'),'utf8')).constituencies;
   await check('Partei, Fraktion und Wahlkreis sind native Dropdowns',async()=>{for(const key of ['party','faction','constituency'])assert.equal(await page.locator('#'+key).evaluate(el=>el.tagName),'SELECT');assert.equal(await page.locator('#constituency').isDisabled(),true);});
   await page.locator('#parliamentType').selectOption('Bundestag');await page.locator('#state').selectOption('Berlin');
   await page.locator('#party').selectOption('CDU');await page.locator('#faction').selectOption('CDU/CSU');
   await check('Partei und Fraktion bleiben getrennt waehlbar',async()=>{assert.equal(await page.locator('#party').inputValue(),'CDU');assert.equal(await page.locator('#faction').inputValue(),'CDU/CSU');});
   await page.locator('#constituency').selectOption(catalog.Bundestag.Berlin[0]);
   await page.locator('#parliamentType').selectOption('Landtag');
   await check('Parlamentswechsel leert alte Auswahl und nutzt die vorhandenen Landtagswahlkreise',async()=>{assert.equal(await page.locator('#constituency').inputValue(),'');const values=await page.locator('#constituency option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean));assert.deepEqual(values,[...catalog.Landtag.Berlin,'Kein Wahlkreis (Landesliste)']);});
   await page.locator('#constituency').selectOption(catalog.Landtag.Berlin[0]);await page.locator('#state').selectOption('Brandenburg');
   await check('Bundeslandwechsel verlangt eine neue passende Wahlkreisauswahl',async()=>{assert.equal(await page.locator('#constituency').inputValue(),'');const values=await page.locator('#constituency option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean));assert.deepEqual(values,[...catalog.Landtag.Brandenburg,'Kein Wahlkreis (Landesliste)']);});
   await page.locator('#state').selectOption('Berlin');await page.locator('#party').selectOption('SPD');await page.locator('#faction').selectOption('SPD');await page.locator('#constituency').selectOption('Kein Wahlkreis (Landesliste)');await page.locator('#topics').fill('Fiktives Thema');
   if(evidenceDir){await page.setViewportSize({width:390,height:1100});await page.locator('h1').focus();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(evidenceDir,'app-mandat-dropdown-mobil.png'),fullPage:true});}
   await page.locator('#new-customer button[type="submit"]').click();
   await page.getByRole('heading',{name:'Fiktiver Browserkunde',exact:true}).waitFor();
   await check('Browser speichert Dropdownwerte, ohne den Kunden als versorgt auszugeben',async()=>{const c=(await accounts.listUsers()).find(u=>u.email==='browser@example.invalid');const p=await storage.getProfile(c.politicianId);assert.equal(p.parliamentType,'Landtag');assert.equal(p.party,'SPD');assert.equal(p.faction,'SPD');assert.equal(p.constituency,'Kein Wahlkreis (Landesliste)');assert.equal(p.profileActive,false);assert.match(await page.locator('main').innerText(),/Die Versorgung ist noch nicht aktiv/);});
   await check('Ein Klick legt den Kunden an und uebergibt die Einladung an den gesperrten Mailweg',async()=>{
    const c=await accounts.getUserByEmailRaw('browser@example.invalid');assert.equal(c.active,true);assert.equal(c.status,'eingeladen');assert.equal(c.passwordHash,null);
    assert.equal(mailCalls.filter(m=>m.message.to===c.email).length,1);assert.ok(mailCalls.find(m=>m.message.to===c.email).profile);
    assert.ok((await accounts.listPendingInvites())[c.id]);assert.equal(await page.getByText('Kunde angelegt.',{exact:true}).count(),1);
    assert.equal(await page.getByText('Einladung versendet.',{exact:true}).count(),0);assert.equal(await page.locator('#invite-url').count(),1);
   });
   const invitationUrl=await page.locator('#invite-url').inputValue(),invitation=new URL(invitationUrl);
   const customerContext=await browserInstance.newContext({viewport:{width:390,height:900}});
   await customerContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   const customerPage=await customerContext.newPage();
   await customerPage.goto(base+invitation.pathname+invitation.search);await customerPage.locator('#formView').waitFor({state:'visible'});
   await check('Einladungslink oeffnet die bestehende Appseite mit zwei Passwortfeldern',async()=>{assert.equal(await customerPage.locator('#setForm input[type="password"]').count(),2);assert.equal(await customerPage.locator('#setForm input[type="email"]').count(),0);});
   if(evidenceDir)await customerPage.screenshot({path:path.join(evidenceDir,'app-passwort-setzen-mobil.png'),fullPage:true});
   await customerPage.locator('#pw1').fill('Only-Customer-Synthetic-123!');await customerPage.locator('#pw2').fill('Abweichendes-Testpasswort');await customerPage.locator('#setSubmit').click();
   await check('Unterschiedliche Passwoerter lassen Einmaltoken und Passwort unbenutzt',async()=>{await customerPage.getByText('Die Passwörter stimmen nicht überein.',{exact:true}).waitFor();assert.equal((await accounts.getUserByEmailRaw('browser@example.invalid')).passwordHash,null);assert.equal((await accounts.inspectPasswordToken(invitation.searchParams.get('token'))).valid,true);});
   await customerPage.locator('#pw2').fill('Only-Customer-Synthetic-123!');await customerPage.locator('#setSubmit').click();await customerPage.waitForURL(base+'/');
   await check('Passwortsetzen meldet den Kunden in seiner App mit seinem Mandat an',async()=>{
    const session=await (await customerContext.request.get(base+'/api/auth/session')).json(),c=await accounts.getUserByEmailRaw('browser@example.invalid');
    assert.equal(session.authenticated,true);assert.equal(session.user.id,c.id);assert.equal(c.status,'aktiv');assert.ok(c.passwordHash);
    const profile=await (await customerContext.request.get(base+'/api/profile/current')).json();assert.equal(profile.id,c.politicianId);
    const reused=await customerContext.request.post(base+'/api/auth/set-password',{data:{token:invitation.searchParams.get('token'),password:'Only-Customer-Synthetic-123!'}});assert.equal(reused.status(),410);
   });
   await customerContext.close();
   await page.locator('[data-action="activate"]').click();
   await page.getByText('Aktiv',{exact:true}).waitFor();
   await check('Aktivieren bleibt getrennt vom tatsaechlichen Briefing',async()=>{assert.equal(await page.getByText('Heute bereit',{exact:true}).count(),0);});
   await page.locator('[data-action="invite"]').click();await page.locator('#invite-url').waitFor();
   await check('Nach Passwortsetzen entsteht ein Reset-Einmaltoken statt einer zweiten Einladung',async()=>{const token=new URL(await page.locator('#invite-url').inputValue()).searchParams.get('token');const state=await accounts.inspectPasswordToken(token);assert.equal(state.valid,true);assert.equal(state.purpose,'reset');assert.equal(await page.getByText('Einladung versendet.',{exact:true}).count(),0);});
   await page.locator('[data-action="hide-invite"]').click();
   for(const width of [1440,390,360,320]){
    await page.setViewportSize({width,height:900});
    await check('Kundenseite ohne horizontalen Ueberlauf bei '+width,async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true));
    if(evidenceDir&&width===390)await page.screenshot({path:path.join(evidenceDir,'app-kunde-mobil.png'),fullPage:true});
   }
   async function fillNewCustomer(name,email){
    await page.locator('[data-nav="customers"]').click();await page.locator('[data-action="new"]').first().click();
    await page.locator('#name').fill(name);await page.locator('#email').fill(email);
    await page.locator('#parliamentType').selectOption('Bundestag');await page.locator('#state').selectOption('Berlin');await page.locator('#party').selectOption('SPD');await page.locator('#faction').selectOption('SPD');await page.locator('#constituency').selectOption('Kein Wahlkreis (Landesliste)');await page.locator('#topics').fill('Fiktives Thema');
   }
   const invitePattern='**/api/admin/users/*/invite';
   await context.route(invitePattern,async route=>{const response=await route.fetch();const body=await response.json();body.mail={sent:true,synthetic:true};await route.fulfill({response,json:body});});
   await fillNewCustomer('Fiktive Versandprobe','versandprobe@example.invalid');await page.locator('#new-customer button[type="submit"]').click();
   await page.getByRole('heading',{name:'Fiktive Versandprobe',exact:true}).waitFor();
   await check('Ein synthetischer positiver Versandbeleg zeigt die abgeschickte Einladung',async()=>{assert.match(await page.locator('[role="status"]').innerText(),/an versandprobe@example.invalid versendet/);assert.equal(await page.getByText('Einladung versendet.',{exact:true}).count(),1);assert.equal(mailCalls.filter(m=>m.message.to==='versandprobe@example.invalid').length,1);});
   await context.unroute(invitePattern);
   await fillNewCustomer('Fiktiv spaetere Schwerpunkte','spaetere-schwerpunkte@example.invalid');await page.locator('#topics').fill('');
   await page.setViewportSize({width:390,height:900});await page.locator('h1').focus();await page.evaluate(()=>scrollTo(0,0));
   if(evidenceDir)await page.screenshot({path:path.join(evidenceDir,'app-kunde-ohne-schwerpunkte-mobil.png'),fullPage:true});
   await page.locator('#new-customer button[type="submit"]').click();await page.getByRole('heading',{name:'Fiktiv spaetere Schwerpunkte',exact:true}).waitFor();
   await check('Browser legt einen Kunden ohne Schwerpunkte an und bietet den Einladungslink an',async()=>{assert.equal(await page.locator('[data-action="activate"]').count(),0);assert.equal(await page.getByRole('heading',{name:'Schwerpunkte können später ergänzt werden.',exact:true}).count(),1);assert.ok((await accounts.listPendingInvites())[(await accounts.getUserByEmailRaw('spaetere-schwerpunkte@example.invalid')).id]);});
   const laterInvitation=new URL(await page.locator('#invite-url').inputValue());
   const laterContext=await browserInstance.newContext({viewport:{width:390,height:900}});
   await laterContext.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   const laterPage=await laterContext.newPage();await laterPage.goto(base+laterInvitation.pathname+laterInvitation.search);await laterPage.locator('#formView').waitFor({state:'visible'});
   await laterPage.locator('#pw1').fill('Only-Later-Synthetic-123!');await laterPage.locator('#pw2').fill('Only-Later-Synthetic-123!');await laterPage.locator('#setSubmit').click();await laterPage.waitForURL(base+'/');
   await laterPage.locator('[data-view="settings"]:visible').first().waitFor();
   if(await laterPage.locator('[data-onboard-skip]:visible').count())await laterPage.locator('[data-onboard-skip]:visible').click();
   await laterPage.locator('[data-view="settings"]:visible').first().click();await laterPage.locator('[data-view="profile-topics"]:visible').click();await laterPage.locator('#profileForm').waitFor();
   await check('Kunde kann sich ohne Schwerpunkte anmelden und die leere Profilauswahl oeffnen',async()=>{assert.equal(await laterPage.locator('[name^="topicPriority:"]').count(),0);await laterPage.getByText('Noch keine Schwerpunkte ausgewählt.',{exact:true}).waitFor();});
   await laterPage.locator('.profile-topic-picker > summary').click();await laterPage.locator('[data-profile-add-topic="Wirtschaft"]').click();
   const savedLater=laterPage.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/api/profile/current');
   await laterPage.locator('#profileForm [type="submit"]').click();assert.equal((await savedLater).status(),200);await laterPage.locator('#profileForm').waitFor({state:'detached'});
   await check('Kunde traegt Schwerpunkte selbst im Profil ein, Mandat und Pausierung bleiben erhalten',async()=>{const c=await accounts.getUserByEmailRaw('spaetere-schwerpunkte@example.invalid'),p=await storage.getProfile(c.politicianId);assert.deepEqual(p.focusTopics,['Wirtschaft']);assert.equal(p.party,'SPD');assert.equal(p.parliamentType,'Bundestag');assert.equal(p.profileActive,false);});
   await laterContext.close();
   assert.deepEqual(consoleErrors,[]);
   const profilePattern='**/api/admin/profile/*';
   await context.route(profilePattern,route=>route.request().method()==='PATCH'?route.fulfill({status:400,contentType:'application/json',body:'{}'}):route.fallback());
   await fillNewCustomer('Fiktiver Formularabbruch','formularabbruch@example.invalid');await page.locator('#new-customer button[type="submit"]').click();
   await page.locator('[data-action="check-created"]').waitFor();
   await check('Teilabbruch bewahrt Formulardaten, sperrt erneute Anlage und bietet bestehenden Kunden an',async()=>{assert.equal(await page.locator('#new-customer button[type="submit"]').isDisabled(),true);assert.equal(await page.locator('#name').inputValue(),'Fiktiver Formularabbruch');assert.equal(await page.locator('#party').inputValue(),'SPD');assert.equal(mailCalls.filter(m=>m.message.to==='formularabbruch@example.invalid').length,0);assert.equal((await accounts.listUsers()).filter(u=>u.email==='formularabbruch@example.invalid').length,1);});
   await context.unroute(profilePattern);await page.locator('[data-action="check-created"]').click();
   await page.getByRole('heading',{name:'Fiktiver Formularabbruch',exact:true}).waitFor();
   await check('Teilabbruch laesst sich ohne doppelte Anlage am bestehenden Kunden pruefen',async()=>{assert.equal(await page.getByRole('button',{name:'Mandat ergänzen',exact:true}).count(),1);assert.equal((await accounts.getUserByEmailRaw('formularabbruch@example.invalid')).active,false);});
   assert.ok(consoleErrors.every(message=>message.includes('400 (Bad Request)')),'Nur der bewusst erzwungene Profilfehler darf einen HTTP400-Konsolenhinweis erzeugen');consoleErrors.length=0;
   await page.locator('[data-nav="settings"]').click();await page.locator('[data-setting="budget"]').click();await page.getByRole('heading',{name:'Kosten',exact:true}).waitFor();
   await check('Kostenansicht liest die vorhandene Route',async()=>assert.ok(requests.some(r=>r.url==='/api/admin/stats/budget-today')));
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('[data-action="settings"]').click();await page.locator('[data-setting="sources"]').click();
   await page.locator('.source-details > summary').click();
   await page.getByText('Der Quellenstand konnte noch nicht bestätigt werden.',{exact:true}).waitFor();
   await check('Fehlende Quelldaten sind ein erklaerter Zustand mit echtem Detailzugang',async()=>{assert.equal(await page.locator('a[href="/verwaltung/#/betrieb/quellen"]').count(),1);assert.equal(await page.getByText('Quellenzugänge',{exact:true}).count(),0);});
   await page.locator('[data-action="source-start"]').click();await page.getByRole('status').filter({hasText:'Die Quellenarbeit ist ausgeschaltet.'}).waitFor();
   await check('Neuer Quellenknopf erreicht die echte geschuetzte Route und erhaelt deren Sperrgrund',async()=>{assert.equal(requests.filter(r=>r.url==='/api/admin/quellenlauf'&&r.method==='POST').length,1);assert.equal(await page.getByRole('heading',{name:'Quellenlauf kann gerade nicht starten.',exact:true}).count(),1);});
   let sourcePosts=0,currentSource=null,releaseSource,loseSource=false,sourceStarted=()=>{};
   const sourcePattern='**/api/admin/quellenlauf*';
   await context.route(sourcePattern,async route=>{
    const req=route.request();
    if(req.method()==='GET'){const q=new URL(req.url()).searchParams;return route.fulfill({json:{laufId:'admin-quellen-'+q.get('tag')+'-'+q.get('auftragId'),zustand:loseSource?'abgeschlossen':'laeuft',verarbeitet:loseSource?3:null}});}
    sourcePosts++;currentSource=req.postDataJSON();
    if(loseSource)return route.fulfill({status:502,contentType:'application/json',body:'{}'});
    await new Promise(resolve=>{releaseSource=resolve;sourceStarted();});
    return route.fulfill({json:{...currentSource,laufId:'admin-quellen-'+currentSource.tag+'-'+currentSource.auftragId,zustand:'abgeschlossen',verarbeitet:3,fehlgeschlagen:0}});
   });
   await page.locator('[data-action="source-start"]').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-action="source-start"]').disabled);
   await page.locator('[data-action="source-start"]').click();await page.getByRole('status').filter({hasText:'Start wird geprüft'}).waitFor();
   await page.locator('[data-action="source-start"]').evaluate(el=>el.click());
   await page.locator('[data-action="source-status"]').click();await page.getByRole('status').filter({hasText:'Quellen werden verarbeitet'}).waitFor();
   await check('Ein Quellenauftrag blockiert Doppelklicks und bleibt ueber lesenden Status pruefbar',async()=>{assert.equal(sourcePosts,1);assert.equal(await page.locator('[data-action="source-start"]').isDisabled(),true);});
   releaseSource();await page.getByRole('heading',{name:'Quellenlauf abgeschlossen.',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-action="source-start"]').disabled);
   await check('Quellenabschluss erzeugt keinen erfundenen Briefingerfolg',async()=>{const readiness=page.locator('.check').filter({hasText:'Heute bereit'});assert.match(await readiness.innerText(),/0 von/);assert.equal(sourcePosts,1);});
   for(const width of [1440,390,360,320]){await page.setViewportSize({width,height:1000});await check('Quellen und Versorgung ohne Ueberlauf bei '+width,async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true));if(evidenceDir&&width===390){await page.locator('h1').focus();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(evidenceDir,'app-quellen-versorgung-mobil.png'),fullPage:true});}}
   const followupStarted=new Promise(resolve=>{sourceStarted=resolve;});
   await page.locator('[data-action="source-start"]').click();await followupStarted;assert.equal(sourcePosts,2);
   await context.route('**/api/admin/customers',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));releaseSource();
   await page.getByText('Der aktuelle Briefingstand konnte nicht geladen werden. Bitte „Stand neu laden“ wählen.',{exact:true}).waitFor();
   await check('Fehlende Folgeabfrage wird sichtbar und verhindert weitere Starts bis zur Lesekontrolle',async()=>assert.equal(await page.locator('[data-action="source-start"]').isDisabled(),true));
   await context.unroute('**/api/admin/customers');await page.locator('[data-action="refresh"]:visible').first().click();await page.waitForFunction(()=>document.querySelector('[data-action="source-start"]')&&!document.querySelector('[data-action="source-start"]').disabled);
   const beforeLoss=sourcePosts;
   loseSource=true;await page.locator('[data-action="source-start"]').click();await page.getByRole('status').filter({hasText:'Der Abschluss ist noch offen.'}).waitFor();
   await check('Verlorene Startantwort bleibt offen und verhindert einen blinden Neustart',async()=>{assert.equal(sourcePosts,beforeLoss+1);assert.equal(await page.locator('[data-action="source-start"]').isDisabled(),true);assert.ok(await page.evaluate(()=>sessionStorage.getItem('helmut-admin-quellenauftrag-v1')));});
   await page.reload();await page.getByRole('heading',{name:'Auf einen Blick.',exact:true}).waitFor();await page.locator('[data-setting="sources"]').click();await page.getByRole('heading',{name:'Quellenlauf abgeschlossen.',exact:true}).waitFor();
   await check('Reload liest denselben Auftrag und startet keinen zweiten Lauf',async()=>{assert.equal(sourcePosts,beforeLoss+1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('helmut-admin-quellenauftrag-v1')),null);});
   await context.unroute(sourcePattern);
   assert.ok(consoleErrors.every(message=>message.includes('502 (Bad Gateway)')||message.includes('503 (Service Unavailable)')),'Nur die synthetischen HTTP502-/503-Faelle duerfen Konsolenhinweise erzeugen');consoleErrors.length=0;
   const sourceAuth=await browserInstance.newContext({viewport:{width:390,height:900}});
   await sourceAuth.addCookies([{name:'helmut_session',value:cookie.slice(cookie.indexOf('=')+1),url:base}]);
   await sourceAuth.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
   await sourceAuth.route('**/api/admin/quellenlauf*',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
   const sourceAuthPage=await sourceAuth.newPage();await sourceAuthPage.goto(base+'/verwaltung/einfach/');await sourceAuthPage.locator('[data-setting="sources"]').click();await sourceAuthPage.locator('[data-action="source-start"]').click();await sourceAuthPage.getByRole('heading',{name:'Bitte melde dich erneut an.',exact:true}).waitFor();
   await check('Sitzungsverlust beim Quellenstart entfernt Kundendaten und den sicher abgewiesenen Auftrag',async()=>{assert.doesNotMatch(await sourceAuthPage.locator('main').innerText(),/Fiktiver|example.invalid/);assert.equal(await sourceAuthPage.evaluate(()=>sessionStorage.getItem('helmut-admin-quellenauftrag-v1')),null);});
   await sourceAuth.close();
   assert.deepEqual(consoleErrors,[]);
   await context.route('**/api/admin/customers',route=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"Bitte erneut anmelden."}'}));
   await page.locator('[data-action="refresh"]:visible').first().click();
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
