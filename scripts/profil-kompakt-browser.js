"use strict";

// Reale Formular- und Servergrenze, synthetische Daten. Wird vom bestehenden
// Browser-Smoke aufgerufen; kein eigener Test-/Produktionsstart und kein Modell.
const fs = require("node:fs");
const path = require("node:path");
async function verify({ browser, baseUrl, storage, fixture, check }) {
  const original = await storage.getProfile(fixture.id);
  try {
    for (const mobile of [true, false]) {
      const label = mobile ? "Profil mobil" : "Profil Desktop";
      const seed = { ...fixture, communicationStyle: "Sachlich",
        committee: "Gesundheit", committees: ["Gesundheit", "Arbeit und Soziales"],
        focusTopics: ["Arbeit", "Pflege", "Tarifbindung"], topicPriorities: { Arbeit: 1, Pflege: 3, Tarifbindung: 5, Finanzen: 5 },
        currentCampaigns: ["Synthetische Alt-Kampagne"], opponents: ["Synthetischer Alt-Akteur"],
        upcomingAppointments: ["Synthetischer Alt-Termin | 2099-06-26T11:00:00+02:00"] };
      await storage.saveProfile(seed);
      const context = await browser.newContext({ viewport: mobile ? { width:390, height:844 } : { width:1280, height:900 },
        isMobile: mobile, hasTouch: mobile, serviceWorkers:"block", bypassCSP:true });
      await context.addInitScript(() => { sessionStorage.setItem("helmut:install-dismissed", "1"); localStorage.setItem("helmut:theme", "dark"); });
      const page = await context.newPage(), errors = [], patches = [];
      let generateCalls = 0;
      page.on("pageerror", e => errors.push(e.message));
      page.on("request", r => {
        if (r.method() === "PATCH" && new URL(r.url()).pathname === "/api/profile/current") patches.push(r.postDataJSON());
        if (/\/api\/(communication|office)\/generate/.test(r.url())) generateCalls++;
      });
      try {
        await page.goto(baseUrl, { waitUntil:"domcontentloaded" });
        await page.waitForFunction(() => window.__helmutClientLoaded && !document.body.classList.contains("is-loading"));
        async function open(view) {
          await page.locator('[data-view="settings"]:visible').first().click();
          await page.locator(`[data-view="${view}"]:visible`).click();
          await page.locator("#profileForm").waitFor();
        }
        async function toolbarReachable() {
          const button = page.locator(".profile-editor-done"), b = await button.boundingBox();
          return b && b.y >= 0 && b.y + b.height <= (mobile ? 844 : 900)
            && await button.evaluate(el => { const b=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)); });
        }
        async function screenshot(name) {
          if (!mobile || !process.env.HELMUT_PROFILE_SCREENSHOT_DIR) return;
          await page.waitForFunction(() => !document.querySelector("#toast")?.classList.contains("visible"));
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.screenshot({path:path.join(process.env.HELMUT_PROFILE_SCREENSHOT_DIR,name)});
        }
        async function save() {
          const response = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === "/api/profile/current");
          const refresh = page.waitForResponse(r => new URL(r.url()).pathname === "/api/app/start");
          const [saved] = await Promise.all([response, refresh, page.locator('#profileForm [type="submit"]').click()]);
          const payload = await saved.json();
          await page.locator("#profileForm").waitFor({ state:"detached" });
          return payload;
        }
        await open("profile-settings");
        await page.waitForFunction(() => document.querySelector('[name="location"]')?.options.length > 100);
        check(`${label}: Partei, Fraktion und Ort sind echte Auswahllisten`, await page.locator('#profileForm select[name="party"],#profileForm select[name="faction"],#profileForm select[name="location"]').count() === 3);
        const doneBox = await page.locator(".profile-editor-done").boundingBox();
        check(`${label}: Fertig ist beim Öffnen sichtbar`, doneBox && doneBox.y >= 0 && doneBox.y + doneBox.height < (mobile ? 844 : 900));
        check(`${label}: kompakte Mandatsseite ohne Slider und tote Felder`, await page.locator('#profileForm input[type="range"],#profileForm [name="upcomingAppointments"],#profileForm [name="opponents"],#profileForm [name="currentCampaigns"]').count() === 0);
        check(`${label}: vorhandene Fremdbezeichnung bleibt auswählbar`, await page.locator('[name="party"]').inputValue() === fixture.party);
        if (mobile && process.env.HELMUT_PROFILE_SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.HELMUT_PROFILE_SCREENSHOT_DIR,{recursive:true});
          await page.screenshot({path:path.join(process.env.HELMUT_PROFILE_SCREENSHOT_DIR,"mandat.png")});
        }
        await page.locator('.profile-editor-disclosure > summary').click();
        await page.locator('[name="committees"][value="Wirtschaft"]').check();
        let releasePatch;
        const patchGate = new Promise(resolve => { releasePatch = resolve; });
        const holdPatch = async route => {
          if (route.request().method() === "PATCH") { await patchGate; return route.continue(); }
          return route.continue();
        };
        await page.route("**/api/profile/current?*", holdPatch);
        const firstSave = save();
        await page.waitForFunction(() => document.querySelector('#profileForm [name="fullName"]')?.disabled);
        check(`${label}: Speichern sperrt Eingaben bis zur bestätigten Antwort`, await page.locator('[name="fullName"]').isDisabled() && await page.locator('[name="party"]').isDisabled());
        releasePatch();
        const first = await firstSave;
        await page.unroute("**/api/profile/current?*", holdPatch);
        check(`${label}: Mehrfachausschüsse über echten PATCH erhalten`, first.committees.includes("Gesundheit") && first.committees.includes("Arbeit und Soziales") && first.committees.includes("Wirtschaft") && first.committee === "Gesundheit");
        check(`${label}: Mandat-PATCH erhält Themen und ausgeblendeten Altbestand`, JSON.stringify(first.focusTopics) === JSON.stringify(seed.focusTopics)
          && first.currentCampaigns[0] === seed.currentCampaigns[0] && first.opponents[0] === seed.opponents[0] && first.upcomingAppointments[0] === seed.upcomingAppointments[0]
          && !Object.hasOwn(patches[0],"topicPriorities") && !Object.hasOwn(patches[0],"upcomingAppointments"));
        const afterSave = await storage.getProfile(seed.id);
        await open("profile-settings");
        await page.locator('.profile-editor-done').click();
        await page.locator("#profileForm").waitFor({state:"detached"});
        check(`${label}: unverändertes Fertig schreibt nichts`, patches.length === 1 && (await storage.getProfile(seed.id)).updatedAt === afterSave.updatedAt);
        await open("profile-settings");
        await page.locator('[name="state"]').selectOption("Bayern");
        check(`${label}: Länderwechsel verlangt neue Region statt alter Kombination`, await page.locator('[name="location"]').inputValue() === "" && await page.locator('[name="constituency"]').inputValue() === "");
        await page.locator('[name="parliamentType"]').selectOption("Landtag");
        const landChoices = await page.locator('[name="constituency"] option').allTextContents();
        check(`${label}: Landtag und Bundestag nutzen getrennte Wahlkreise`, landChoices.includes("München-Hadern") && !landChoices.includes("München-Nord"));
        await page.locator('[name="state"]').selectOption("Niedersachsen");
        await page.locator('[name="parliamentType"]').selectOption("Bundestag");
        await page.locator('[name="location"]').selectOption("Salzgitter");
        const wahlkreis = await page.locator('[name="constituency"] option').evaluateAll(opts => opts.find(o => /Salzgitter/.test(o.value))?.value);
        await page.locator('[name="constituency"]').selectOption(wahlkreis);
        await page.locator('.profile-editor-disclosure > summary').click();
        for (const checkbox of await page.locator('[name="committees"]').all()) if (await checkbox.isChecked()) await checkbox.uncheck();
        const cleared = await save();
        check(`${label}: letzter Ausschuss kann gelöscht werden`, cleared.committee === "" && cleared.committees.length === 0);
        check(`${label}: Ort erreicht gespeicherte regionale Interessen`, cleared.location === "Salzgitter" && cleared.regionalInterests.includes("Salzgitter"));
        await open("profile-topics");
        check(`${label}: eigene Fachthemen bleiben bearbeitbar`, await page.locator('[name="topicPriority:Tarifbindung"]').count() === 1);
        check(`${label}: verwaiste hohe Gewichte aktivieren keine abgewählten Themen`, await page.locator('[name="topicPriority:Finanzen"]').count() === 0);
        await page.locator('[name="topicPriority:Arbeit"]').selectOption("5");
        await page.locator('.profile-topic-picker > summary').click();
        await page.locator('[data-profile-add-topic="Wirtschaft"]').click();
        await page.locator('[name="topicPriority:Pflege"]').selectOption("0");
        check(`${label}: Fertig bleibt nach Themenänderungen direkt erreichbar`, await toolbarReachable());
        await screenshot("schwerpunkte.png");
        const topics = await save();
        check(`${label}: Thema hinzufügen/entfernen und Priorität echt gespeichert`, topics.topicPriorities.Arbeit === 5 && topics.topicPriorities.Wirtschaft === 3
          && !topics.focusTopics.includes("Pflege") && !Object.hasOwn(topics.topicPriorities,"Pflege") && topics.focusTopics.includes("Tarifbindung"));
        check(`${label}: Themen-PATCH verändert kein Mandat`, topics.location === "Salzgitter" && !Object.hasOwn(patches[2],"state"));
        await open("profile-style");
        check(`${label}: optionale Textfelder anfangs geschlossen`, await page.locator('.profile-editor textarea:visible').count() === 0);
        await page.locator('[name="communicationStyle"][value="Vermittelnd"]').check();
        await page.locator('summary').filter({hasText:"Eigene Positionen"}).click();
        await page.locator('[name="publicPositions"]').fill("Synthetische verbindliche Position");
        page.once("dialog", dialog => dialog.dismiss());
        await page.locator('.profile-editor-back').click();
        check(`${label}: abgebrochenes Verlassen erhält ungespeicherte Eingabe`, await page.locator('[name="publicPositions"]').inputValue() === "Synthetische verbindliche Position");
        await page.locator('summary').filter({hasText:"Weitere Hinweise"}).click();
        await page.locator('[name="mainQuestion"]').fill("");
        const style = await save();
        const model = require("../lib/helmut/ai").publicProfile(style);
        check(`${label}: Stil und Position erreichen aktives Modellprofil`, model.communicationStyle === "Vermittelnd" && model.publicPositions[0] === "Synthetische verbindliche Position");
        check(`${label}: optionale Leitfrage wirklich leer, Themen unverändert`, style.mainQuestion === "" && style.topicPriorities.Arbeit === 5 && style.focusTopics.includes("Tarifbindung"));
        await open("profile-style");
        check(`${label}: Fertig ist auf der Schreibstilseite direkt erreichbar`, await toolbarReachable());
        await screenshot("schreibstil.png");
        await page.locator('[name="communicationStyle"][value="Sachlich"]').check();
        let failNext = true;
        await page.route("**/api/profile/current?*", async route => {
          if (route.request().method() === "PATCH" && failNext) { failNext = false; return route.fulfill({ status:503, contentType:"application/json", body:'{"error":"synthetic failure"}' }); }
          return route.continue();
        });
        await page.locator('.profile-editor-done').click();
        await page.getByText("Profil konnte nicht gespeichert werden. Deine Änderungen bleiben erhalten.",{exact:true}).waitFor();
        check(`${label}: Speicherfehler bewahrt Eingaben und erlaubt Wiederholung`, await page.locator('[name="communicationStyle"][value="Sachlich"]').isChecked() && await page.locator('.profile-editor-done').isEnabled());
        await save();
        check(`${label}: Wiederholung speichert über echten Server`, (await storage.getProfile(seed.id)).communicationStyle === "Sachlich");
        // Zwei bestätigte Saves, aber die erste Appstart-Antwort kommt zuletzt.
        let releaseOldStart, capturedOldStart;
        const oldGate = new Promise(resolve => { releaseOldStart = resolve; });
        const oldCaptured = new Promise(resolve => { capturedOldStart = resolve; });
        let holdFirstStart = true;
        const holdStart = async route => {
          if (!holdFirstStart) return route.continue();
          holdFirstStart = false;
          const response = await route.fetch(), body = await response.body();
          capturedOldStart(); await oldGate;
          return route.fulfill({response,body});
        };
        await page.route("**/api/app/start?*", holdStart);
        await open("profile-style");
        await page.locator('[name="communicationStyle"][value="Vermittelnd"]').check();
        const firstPatch = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === "/api/profile/current");
        await page.locator('.profile-editor-done').click(); await firstPatch;
        await page.locator("#profileForm").waitFor({state:"detached"}); await oldCaptured;
        await open("profile-style");
        await page.locator('[name="communicationStyle"][value="Sachlich"]').check();
        await save();
        const oldArrived = page.waitForResponse(r => new URL(r.url()).pathname === "/api/app/start");
        releaseOldStart(); await oldArrived;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const latest = await page.evaluate(() => ({style:profile.communicationStyle, cached:localStorage.getItem(appStartCacheKey())}));
        check(`${label}: verspäteter älterer Abruf überschreibt keinen neueren Save`, latest.style === "Sachlich" && latest.cached === null);
        await page.unroute("**/api/app/start?*", holdStart);
        await open("profile-settings");
        await page.locator('[name="party"]').selectOption("");
        await page.locator('[name="faction"]').selectOption("");
        const affiliationsCleared = await save();
        check(`${label}: zurückgesetzte Parteiauswahl wird nicht durch alte Werte ersetzt`, affiliationsCleared.party === "" && affiliationsCleared.faction === "" && affiliationsCleared.profilValidierung.state !== "vollstaendig");
        await open("profile-settings");
        await page.locator('[name="party"]').selectOption("SPD");
        await page.locator('[name="faction"]').selectOption("SPD");
        const affiliationsSelected = await save();
        check(`${label}: Partei und Fraktion aus Auswahlliste echt gespeichert`, affiliationsSelected.party === "SPD" && affiliationsSelected.faction === "SPD");
        const cache = await page.evaluate(() => {
          const decision = {id:"synthetic-profile-cache",vorgangId:"synthetic-vg",knowledgeObjectId:"synthetic-ko"}, format={id:"presse"};
          const text="Dies ist ein künstlicher Büroentwurf für die lokale Prüfung. Er beschreibt keine reale politische Position und dient ausschließlich der Cacheprüfung.";
          const key=officeDraftKey(decision,format), binding=officeDraftBinding(decision,format);
          officeDrafts[key]={binding,source:"ki",text,createdAt:Date.now()};
          const before=Boolean(officeDraftEntry(decision,format));
          const legacy={...JSON.parse(binding),version:2,profile:{...profile}};
          officeDrafts[key].binding=JSON.stringify(legacy);
          const legacyCompatible=Boolean(officeDraftEntry(decision,format));
          profile.updatedAt="2099-01-01T00:00:00Z"; profile.profilValidierung={state:"vollstaendig"}; profile.currentCampaigns=["synthetic change"];
          const metadata=Boolean(officeDraftEntry(decision,format));
          profile.communicationStyle="Vermittelnd";
          const content=Boolean(officeDraftEntry(decision,format));
          return {before,legacyCompatible,metadata,content};
        });
        check(`${label}: Bürocache ignoriert Metadaten, bindet aber wirkliche Stiländerung`, cache.before && cache.legacyCompatible && cache.metadata && !cache.content);
        check(`${label}: kein automatischer Büro-Modellaufruf und keine JS-Fehler`, generateCalls === 0 && errors.length === 0, errors.join(" | "));
      } finally { await context.close(); }
    }
  } finally { if (original) await storage.saveProfile(original); }
}
module.exports = { verify };
