"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {previewHtml}=require('./verwaltung-einfach-export');
const dir=path.resolve(__dirname,'../docs/ui/verwaltung-einfach-20261111');
(async()=>{
 const html=previewHtml();assert.equal(html,fs.readFileSync(path.join(dir,'vorschau.html'),'utf8'));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
 const context=await browser.newContext({offline:true,viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[],external=[];
 let checks=0;const check=(name,value)=>{assert.ok(value,name);checks++;console.log('PASS '+name);};
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});page.on('dialog',d=>d.accept());
 try{
  await page.setContent(html);await page.getByRole('heading',{name:'Auf einen Blick.'}).waitFor();
  check('Vorschau bootet dieselbe Appkomponente',await page.locator('.nav button').count()===3);
  check('Fiktive Daten sind sichtbar gekennzeichnet',await page.locator('.demo').innerText().then(t=>t.includes('Fiktive Daten')));
  await page.screenshot({path:path.join(dir,'vorschau-v2-uebersicht.png'),fullPage:true});
  await page.locator('[data-nav="customers"]').click();await page.locator('[data-customer="preview-mitte"]').click();
  check('Vorhandener Beispielnachweis bleibt von Fachurteil getrennt',await page.locator('main').innerText().then(t=>t.includes('Beurteilung ist offen')));
  await page.locator('[data-nav="customers"]').click();await page.locator('[data-customer="preview-nord"]').click();
  check('Fehlendes Briefing wird sichtbar',await page.getByRole('heading',{name:'Das heutige Briefing fehlt.',exact:true}).isVisible());
  await page.locator('[data-nav="customers"]').click();await page.locator('[data-action="new"]').click();
  check('Nur Name und E-Mail werden abgefragt',await page.locator('#new-customer input').count()===2);
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(dir,'vorschau-v2-anlegen-mobil.png'),fullPage:true});
  await page.locator('#name').fill('Fiktiver Vorschaukunde');await page.locator('#email').fill('test@example.invalid');await page.locator('#new-customer button[type="submit"]').click();
  await page.getByRole('heading',{name:'Fiktiver Vorschaukunde',exact:true}).waitFor();
  check('Erfasster Beispielkunde wird in der Vorschau geoeffnet',await page.locator('main').innerText().then(t=>t.includes('Das Mandat ist noch nicht bestätigt.')));
  await page.locator('[data-action="profile"]').first().click();await page.locator('#profile-form').waitFor();
  check('Vorschau hat dieselben drei Dropdowns',await page.locator('#party,#faction,#constituency').evaluateAll(nodes=>nodes.length===3&&nodes.every(n=>n.tagName==='SELECT')));
  check('Wahlkreis wartet auf Parlament und Bundesland',await page.locator('#constituency').isDisabled());
  await page.locator('#parliamentType').selectOption('Bundestag');await page.locator('#state').selectOption('Berlin');await page.locator('#party').selectOption('CDU');await page.locator('#faction').selectOption('CDU/CSU');
  check('Vorhandene Wahlkreisdaten sind auch offline verfuegbar',await page.locator('#constituency option').count()>2);
  await page.locator('#constituency').selectOption('Kein Wahlkreis (Landesliste)');
  await page.screenshot({path:path.join(dir,'vorschau-mandat-dropdown-mobil.png'),fullPage:true});
  await page.locator('#state').selectOption('Brandenburg');
  check('Bundeslandwechsel leert den Wahlkreis auch in der privaten Vorschau',(await page.locator('#constituency').inputValue())==='');
  for(const width of [1440,390,360,320]){await page.setViewportSize({width,height:900});check('Vorschau ohne Ueberlauf bei '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  check('Keine JavaScriptfehler',errors.length===0);check('Keine App-/Netzwerkverbindung',external.length===0);
  fs.writeFileSync(path.join(dir,'vorschau-v2-pruefung.json'),JSON.stringify({status:'PASS',observedAt:new Date().toISOString(),checks,pageErrors:errors,externalRequests:external.length,scope:'Export derselben Appkomponente mit fiktivem Beispieladapter; keine echten Appdaten'},null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
