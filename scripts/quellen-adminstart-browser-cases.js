"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

exports.browserCheck = async ({ base, check, reset, setHold, advance, plans }) => {
  let playwright;
  for (const name of ["playwright", "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"]) {
    try { playwright = require(name); break; } catch {}
  }
  assert.ok(playwright, "Playwright ist fuer die explizite Browserpruefung erforderlich");
  const browser = await playwright.chromium.launch({ headless: true,
    ...(fs.existsSync("/usr/bin/chromium") ? { executablePath: "/usr/bin/chromium" } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const errors = [], external = [];
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const RealDate = Date;
      globalThis.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : ["2026-11-11T14:20:00Z"])); }
        static now() { return RealDate.parse("2026-11-11T14:20:00Z"); }
      };
    });
    let lose = false, posts = 0;
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== base) { external.push(req.url()); return route.abort(); }
      if (url.pathname === "/api/admin/quellenlauf" && req.method() === "POST") {
        posts++;
        if (lose) { lose = false; await route.fetch(); return route.abort(); }
      }
      if (url.pathname.startsWith("/api/admin/") && url.pathname !== "/api/admin/quellenlauf") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.pathname.endsWith("overview")
          ? { generatedAt: "2026-11-11T14:20:00Z", mandates: [], users: [] } : {}) });
      }
      return route.continue();
    });
    const page = await context.newPage(); page.on("pageerror", e => errors.push(String(e)));
    reset();
    await page.goto(base + "/verwaltung/#/betrieb/quellen");
    const button = page.getByRole("button", { name: "Quellenlauf jetzt starten", exact: true });
    await check("Originalverwaltung Desktop/Mobil: neuer Knopf sichtbar, bedienbar und ohne Ueberlauf", async () => {
      await button.waitFor({ state: "visible" }); await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(b => b.textContent === "Quellenlauf jetzt starten")?.disabled);
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 844 }); await button.scrollIntoViewIfNeeded();
        assert.ok((await button.boundingBox()).height >= 44);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
    });
    await check("Echter Browser-POST zeigt Fortschritt, verhindert Doppelklick und zeigt Abschlussbilanz", async () => {
      let release; setHold(new Promise(r => release = r));
      const before = plans(); await button.click();
      await page.getByRole("status").filter({ hasText: "Start wird geprüft" }).waitFor();
      assert.equal(await button.isDisabled(), true);
      await button.evaluate(b => b.click());
      await page.waitForFunction(() => sessionStorage.getItem("helmut-admin-quellenauftrag-v1") !== null);
      await page.getByRole("button", { name: "Status prüfen", exact: true }).click();
      // Der Server hat den Worker begonnen, ehe dessen Abschluss freigegeben wird.
      for (let i = 0; i < 30 && plans() === before; i++) await new Promise(r => setTimeout(r, 10));
      await page.getByRole("button", { name: "Status prüfen", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Verarbeitung läuft" }).waitFor();
      release(); setHold(null);
      await page.getByRole("status").filter({ hasText: "Verarbeitet: 3" }).waitFor();
      assert.equal(plans(), before + 1); assert.equal(posts, 1);
    });
    await check("Sperrgrund sichtbar; verlorene Antwort bleibt unbekannt und Reload startet nichts", async () => {
      await button.click(); await page.getByRole("status").filter({ hasText: "Ein Lauf hält die Sperre" }).waitFor();
      advance(); lose = true; await button.click();
      await page.getByRole("status").filter({ hasText: "Ausgang unbekannt" }).waitFor();
      assert.equal(await button.isDisabled(), true); const before = posts;
      await page.reload();
      await page.getByRole("status").filter({ hasText: "Verarbeitet: 3" }).waitFor(); assert.equal(posts, before);
    });
    const out = process.env.HELMUT_ADMINSTART_BELEGE;
    if (out) { fs.mkdirSync(out, { recursive: true }); await page.screenshot({ path: path.join(out, "quellenstart-mobil.png"), fullPage: true }); }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally { await browser.close(); }
};
