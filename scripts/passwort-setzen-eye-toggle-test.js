"use strict";

// /passwort-setzen: Passwort-Sichtbarkeit umschaltbar machen ("Auge"-Button),
// analog zum bestehenden Login-Muster (client.js bindPasswordToggles /
// EYE_OPEN_SVG/EYE_CLOSED_SVG). Diese Seite ist eigenstaendiges Server-HTML
// (kein client.js-Import), daher eine eigene, aber IDENTISCHE Kopie der Logik.
//
// Geprueft:
//  - Quelltext: beide Passwortfelder (Neues Passwort, Passwort wiederholen)
//    haben einen Sichtbarkeits-Button; Toggle-Skript ist verdrahtet
//  - Browser (echtes Chromium, kein SPA-Boot -> keine bekannte Sandbox-
//    Absturzursache): Klick auf den Button zeigt das Passwort im Klartext,
//    zweiter Klick verbirgt es wieder; funktioniert unabhaengig fuer beide
//    Felder; Desktop + Mobil

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;

const dataDir = path.join(root, ".helmut-data");
const snapshots = new Map();
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
}
function restoreStore() {
  try {
    if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) { if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f)); }
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
}
process.on("exit", restoreStore);

const handler = require("../server.js");
const accounts = require("../lib/helmut/accounts");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

function req(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const r = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers: {
      ...(data != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
      ...headers
    }, timeout: 20000 }, (res) => {
      let out = ""; res.on("data", (c) => { out += c; }); res.on("end", () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
    });
    r.on("error", reject);
    if (data != null) r.write(data);
    r.end();
  });
}
function parse(body) { try { return JSON.parse(body); } catch (_) { return {}; } }
function tokenFromUrl(url) { return new URL(String(url)).searchParams.get("token") || ""; }

function loadPlaywright() {
  const candidates = ["playwright", path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")];
  for (const c of candidates) { try { return require(c); } catch (_) {} }
  return null;
}

(async () => {
  const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const pageSrc = (serverSrc.match(/function sendSetPasswordPage\(response\)[\s\S]*?\n}\n/) || [""])[0];
  check("sendSetPasswordPage-Funktion gefunden", pageSrc.length > 100);

  console.log("== Quelltext: Sichtbarkeits-Button an beiden Passwortfeldern ==");
  check("pw1 hat einen Sichtbarkeits-Button (data-toggle-password=\"pw1\")", /data-toggle-password="pw1"/.test(pageSrc));
  check("pw2 hat einen Sichtbarkeits-Button (data-toggle-password=\"pw2\")", /data-toggle-password="pw2"/.test(pageSrc));
  check("beide Buttons stecken in einem .password-field-Wrapper (Positionierung wie beim Login)",
    /class="password-field">\s*<input id="pw1"/.test(pageSrc) && /class="password-field">\s*<input id="pw2"/.test(pageSrc));
  check("Button startet mit dem 'Anzeigen'-Zustand (aria-label \"Passwort anzeigen\")",
    (pageSrc.match(/aria-label="Passwort anzeigen"/g) || []).length === 2);
  check("Toggle-Skript ist verdrahtet (querySelectorAll(\"[data-toggle-password]\"))",
    /querySelectorAll\("\[data-toggle-password\]"\)/.test(pageSrc));
  check("Klick wechselt input.type zwischen password und text",
    /input\.type = reveal \? "text" : "password";/.test(pageSrc));
  check("aria-label wird beim Umschalten aktualisiert (Anzeigen/Verbergen)",
    /reveal \? "Passwort verbergen" : "Passwort anzeigen"/.test(pageSrc));

  console.log("\n== Browser: Klick zeigt/verbirgt das Passwort (echtes Chromium) ==");
  const pw = loadPlaywright();
  if (!pw) {
    console.log("SKIP: Playwright nicht verfuegbar (Browser-Abschnitt uebersprungen, Quelltext-Abschnitt bleibt massgeblich).");
  } else {
    const server = http.createServer(handler);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    try {
      await accounts.createUser({ email: "admin-eye@example.org", name: "Admin Eye", role: "admin", password: "sicher-genug-1" });
      const loginRes = await req(port, "POST", "/api/auth/login", { body: { email: "admin-eye@example.org", password: "sicher-genug-1" } });
      const adminCookie = String(loginRes.headers["set-cookie"][0]).split(";")[0];
      const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
      const created = parse((await req(port, "POST", "/api/admin/users", { headers: { Cookie: adminCookie, "x-csrf-token": csrf }, body: {
        name: "Eye Test", email: "eye-test@example.org", role: "demo"
      } })).body);
      const token = tokenFromUrl(created.inviteUrl);

      const browser = await pw.chromium.launch({ args: ["--disable-dev-shm-usage", "--no-sandbox"] });
      for (const [label, width, height] of [["Desktop", 1280, 900], ["Mobil", 390, 844]]) {
        const page = await browser.newPage();
        await page.setViewportSize({ width, height });
        let crashed = false;
        page.on("crash", () => { crashed = true; });
        await page.goto(`http://127.0.0.1:${port}/passwort-setzen?token=${encodeURIComponent(token)}`, { waitUntil: "load", timeout: 15000 });
        await page.waitForSelector("#formView:not([hidden])", { timeout: 8000 });

        await page.fill("#pw1", "geheimes-passwort-123");
        const typeBefore = await page.locator("#pw1").getAttribute("type");
        check(`${label}: Passwortfeld startet maskiert (type=password)`, typeBefore === "password", typeBefore);

        await page.click('[data-toggle-password="pw1"]');
        const typeAfterClick = await page.locator("#pw1").getAttribute("type");
        check(`${label}: Klick auf den Button zeigt das Passwort im Klartext (type=text)`, typeAfterClick === "text", typeAfterClick);
        const visibleValue = await page.locator("#pw1").inputValue();
        check(`${label}: der eingegebene Wert bleibt beim Umschalten erhalten`, visibleValue === "geheimes-passwort-123", visibleValue);
        const ariaAfterClick = await page.locator('[data-toggle-password="pw1"]').getAttribute("aria-label");
        check(`${label}: aria-label wechselt zu \"Passwort verbergen\"`, ariaAfterClick === "Passwort verbergen", ariaAfterClick);

        await page.click('[data-toggle-password="pw1"]');
        const typeAfterSecondClick = await page.locator("#pw1").getAttribute("type");
        check(`${label}: zweiter Klick verbirgt das Passwort wieder (type=password)`, typeAfterSecondClick === "password", typeAfterSecondClick);

        // Zweites Feld unabhaengig testen — ein Klick auf pw1 darf pw2 nicht beeinflussen.
        await page.fill("#pw2", "anderes-passwort-456");
        await page.click('[data-toggle-password="pw2"]');
        const pw1TypeUnaffected = await page.locator("#pw1").getAttribute("type");
        const pw2TypeToggled = await page.locator("#pw2").getAttribute("type");
        check(`${label}: die beiden Felder sind unabhaengig voneinander umschaltbar`,
          pw1TypeUnaffected === "password" && pw2TypeToggled === "text",
          `pw1=${pw1TypeUnaffected} pw2=${pw2TypeToggled}`);

        check(`${label}: kein Chromium-Absturz beim Testen der Passwort-Seite`, !crashed);
        await page.close();
      }
      await browser.close();
    } finally {
      await new Promise((r) => server.close(r));
    }
  }

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
