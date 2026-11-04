"use strict";

// Sprint A: unveraenderter echter Helmut-Server in einem eigenen lokalen Klon.
// Dieser Test darf NIE im Entwicklungs-/Production-Checkout laufen.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const args = process.argv.slice(2);
assert.equal(args.length, 4, "--root <isolierter-Klon> --evidence <eigener-Ordner> erforderlich");
assert.equal(args[0], "--root"); assert.equal(args[2], "--evidence");
const testRoot = fs.realpathSync(args[1]);
const evidence = path.resolve(args[3]);
const sourceRoot = fs.realpathSync(path.join(__dirname, ".."));
assert.notEqual(testRoot, sourceRoot);
assert.notEqual(testRoot, "/workspace/helmut-pilot");
assert.ok(path.basename(testRoot).startsWith("helmut-backend-sprint-a-"));
assert.ok(fs.statSync(path.join(testRoot, ".git")).isDirectory(), "Eigene Git-Metadaten erforderlich");
assert.equal(execFileSync("git", ["-C", testRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), "ae18658e5caac2b39403c0e41e3a8af5c2b3d7be");
assert.equal(execFileSync("git", ["--no-optional-locks", "-C", testRoot, "status", "--porcelain"], { encoding: "utf8" }).trim(), "");
for (const file of [".env", ".env.local", "env.local", "env.local.html", ".helmut-data"]) {
  assert.equal(fs.existsSync(path.join(testRoot, file)), false, `Frische Isolation fehlt: ${file}`);
}
assert.ok(process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"), "Nur ueber scripts/lokal.js");
assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
assert.equal(process.env.HELMUT_SOURCE_MODE, "off");
for (const key of Object.keys(process.env)) {
  assert.ok(!/^(SUPABASE|VERCEL|DEEPSEEK|OPENAI|AZURE|CRON_SECRET|HELMUT_ADMIN_SECRET|HELMUT_RUNTIME_READ_BEARER)/.test(key), `Unerlaubte Umgebungskennung: ${key}`);
}
process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORE_CACHE_MS = "0";
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const protectedPaths = ["server.js", "client.js", "styles.css", "index.html", "vercel.json", "package.json", "lib/helmut/storage.js", "lib/helmut/auth.js", "lib/helmut/accounts.js", "lib/helmut/ai.js", "lib/helmut/lage.js", "lib/helmut/scheduler.js"];
const baseline = new Map(protectedPaths.map(file => [file, hash(fs.readFileSync(path.join(testRoot, file)))]));
const storage = require(path.join(testRoot, "lib/helmut/storage"));
const accounts = require(path.join(testRoot, "lib/helmut/accounts"));
const ai = require(path.join(testRoot, "lib/helmut/ai"));
const fault = { key: null };
const originals = [];
for (const [object, key, mode] of [
  [accounts, "listUsers", "users"], [storage, "getLlmUsageBreakdownToday", "budget"],
  [storage, "listProcessRuns", "runs"], [storage, "listSourceArchitectureRows", "sources"],
  [storage, "getProfile", "profile"]
]) {
  const original = object[key]; assert.equal(typeof original, "function", key);
  originals.push(() => { object[key] = original; });
  object[key] = async (...values) => {
    if (fault.key === mode) throw new Error(`synthetic-private-marker-${mode}`);
    return original(...values);
  };
}
let providerCalls = 0;
const originalRequestText = ai.requestText;
ai.requestText = async () => { providerCalls++; throw new Error("Provider im isolierten Test gesperrt"); };
let externalAttempts = 0;
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1") { externalAttempts++; throw new Error("Nur eigener Loopback-Server erlaubt"); }
  return nativeFetch(url, options);
};
const handler = require(path.join(testRoot, "server.js"));
const server = http.createServer(handler);
const checks = [], responses = [], observations = [];
function check(name, fn) { fn(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
const dataDir = path.join(testRoot, ".helmut-data");
const idA = "sprint-a-synthetic-alpha", idB = "sprint-a-synthetic-beta";
const routes = [
  "/api/admin/overview", "/api/admin/stats/budget-today", "/api/admin/customers",
  "/api/admin/sources-status", "/api/admin/stats/process-runs?limit=20", `/api/admin/profile/${idA}`
];
let port;
function request(route, { cookie, method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const bytes = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: "127.0.0.1", port, path: route, method, timeout: 12000,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(bytes ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bytes) } : {}) }
    }, res => {
      let text = ""; res.on("data", bytes => { text += bytes; });
      res.on("end", () => {
        let json; try { json = JSON.parse(text); } catch { json = null; }
        responses.push({ route, method, status: res.statusCode, fault: fault.key });
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Lokale Anfragefrist")));
    if (bytes) req.write(bytes); req.end();
  });
}
async function login(email) {
  const response = await request("/api/auth/login", { method: "POST", body: { email, password: "sprint-a-only-strong-password-1" } });
  assert.equal(response.status, 200, "Echter lokaler Login");
  const header = response.headers["set-cookie"]?.[0];
  assert.ok(header?.includes("HttpOnly")); assert.ok(header?.includes("SameSite=Lax"));
  return header.split(";")[0];
}
function safeBody(text) {
  assert.doesNotMatch(text, /passwordHash|passwordSalt|tokenHash|synthetic-private-marker|sprint-a-only-strong-password/);
}

async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  try {
    const admin = await accounts.createUser({ email: "admin@sprint-a.invalid", name: "Synthetischer Admin A", role: "admin", password: "sprint-a-only-strong-password-1" });
    const adminCookie = await login(admin.email);
    let response = await request("/api/admin/customers", { cookie: adminCookie });
    check("Leerer Kundenbestand ist ein echtes leeres Array", () => { assert.equal(response.status, 200); assert.deepEqual(response.json.kunden, []); });
    response = await request("/api/admin/stats/process-runs?limit=20", { cookie: adminCookie });
    check("Leere Laufhistorie wird ohne erfundenen Erfolg geliefert", () => { assert.equal(response.status, 200); assert.deepEqual(response.json.processRuns, []); });
    await accounts.createUser({ email: "alpha@sprint-a.invalid", name: "Synthetisches Mandat Alpha", role: "abgeordneter", politicianId: idA, password: "sprint-a-only-strong-password-1" });
    await accounts.createUser({ email: "beta@sprint-a.invalid", name: "Synthetisches Mandat Beta", role: "abgeordneter", politicianId: idB, password: "sprint-a-only-strong-password-1" });
    await accounts.createUser({ email: "referent@sprint-a.invalid", name: "Synthetischer Referent", role: "referent", password: "sprint-a-only-strong-password-1" });
    const { testPoliticianOne } = require(path.join(testRoot, "scripts/fixtures/test-profiles"));
    await storage.saveProfile({ ...testPoliticianOne, id: idA, fullName: "Synthetisches Profil Alpha", profileActive: false });
    await storage.saveProfile({ ...testPoliticianOne, id: idB, fullName: "Synthetisches Profil Beta", profileActive: false });
    const alphaCookie = await login("alpha@sprint-a.invalid"), referentCookie = await login("referent@sprint-a.invalid");
    for (const route of routes) {
      for (const [actor, cookie, status] of [["anonym", undefined, 401], ["ungueltige Session", "helmut_session=synthetic-invalid", 401], ["Abgeordneter", alphaCookie, 403], ["Referent ohne Mandat", referentCookie, 403], ["Admin ohne Mandat", adminCookie, 200]]) {
        const result = await request(route, { cookie });
        check(`${route}: ${actor} → ${status}`, () => {
          assert.equal(result.status, status); safeBody(result.text);
          if (status !== 200) assert.doesNotMatch(result.text, /Synthetisches Profil Alpha|Synthetisches Profil Beta|alpha@sprint-a/);
        });
      }
    }
    const read = async route => {
      const result = await request(route, { cookie: adminCookie }); assert.equal(result.status, 200); safeBody(result.text); return result.json;
    };
    const overview = await read(routes[0]);
    check("Overview: beide synthetischen Profile, Identitaet und Aktivstatus", () => {
      assert.ok(Array.isArray(overview.mandates)); assert.ok(overview.mandates.some(p => p.id === idA && p.profileActive === false));
      assert.ok(overview.mandates.some(p => p.id === idB)); assert.equal(typeof overview.counts.users, "number");
    });
    const budget = await read(routes[1]);
    check("Budget: vorhandener USD-/Monats-/Kostenwahrheitsvertrag", () => {
      assert.match(budget.day, /^\d{4}-\d{2}-\d{2}$/); assert.equal(typeof budget.kostenwahrheit.gesamt.kostenUsd, "number");
      assert.equal(budget.kostenwahrheit.gesamt.kostenUnbekannt, 0); assert.ok("monat" in budget); assert.ok(!("estimatedCostEur" in budget));
    });
    const customers = await read(routes[2]);
    check("Kunden: reine Kontodaten und Sessionanzahl, keine Sitzungsobjekte", () => {
      assert.equal(customers.kunden.length, 2); assert.equal(typeof customers.sessionsAktiv, "number");
      assert.ok(customers.kunden.every(k => k.customer && k.userId)); assert.ok(!("sessions" in customers));
    });
    const sources = await read(routes[3]);
    check("Quellen: fehlender relationaler Katalog bleibt unbekannt", () => {
      assert.equal(sources.statusCounts, null); assert.ok("stoerungen" in sources); assert.notEqual(sources.stoerungen?.verfuegbar, true);
    });
    const runs = await read(routes[4]);
    check("Laeufe: leere Historie und vorhandene Zeitplanform", () => { assert.deepEqual(runs.processRuns, []); assert.deepEqual(runs.zeitplan, []); });
    const profile = await read(routes[5]);
    check("Profildetail: vorhandenes Profil mit ausdruecklicher Validierung", () => { assert.equal(profile.profile.id, idA); assert.equal(typeof profile.validierung.bereit, "boolean"); });
    response = await request(`/api/admin/profile/${idB}`, { cookie: alphaCookie });
    check("Fremdes Mandat ueber Adminroute bleibt fuer Mandat A gesperrt", () => { assert.equal(response.status, 403); assert.doesNotMatch(response.text, /Synthetisches Profil Beta/); });
    response = await request("/api/admin/profile/%00", { cookie: adminCookie });
    check("Unbrauchbare Profilkennung wird abgelehnt", () => assert.equal(response.status, 404));
    const missing = await read("/api/admin/profile/sprint-a-synthetic-missing");
    check("Nicht vorhandenes Profil: bestehender Leer-/Validierungsvertrag statt fremdem Profil", () => { assert.equal(missing.profile.id, "sprint-a-synthetic-missing"); assert.equal(missing.validierung.bereit, false); });
    observations.push({ code: "missing-profile-http200", explanation: "Bestehender Server liefert fuer fehlende Profile ein neutrales Profilobjekt mit nicht bereiter Validierung, kein HTTP404." });
    for (const [key, route] of [["users", routes[0]], ["users", routes[2]], ["budget", routes[1]], ["runs", routes[4]]]) {
      fault.key = key;
      const failed = await request(route, { cookie: adminCookie });
      check(`${route}: injizierter Lesefehler bleibt generischer Serverfehler`, () => { assert.equal(failed.status, 500); safeBody(failed.text); assert.match(failed.json.error, /Interner Serverfehler/); });
      fault.key = null;
    }
    fault.key = "sources";
    response = await request(routes[3], { cookie: adminCookie });
    check("Quellen-Lesefehler liefert unbekannte Daten statt gesunder Nullwerte", () => { assert.equal(response.status, 200); assert.equal(response.json.statusCounts, null); assert.notEqual(response.json.stoerungen?.verfuegbar, true); });
    fault.key = "profile";
    response = await request(routes[5], { cookie: adminCookie });
    check("Profillesefehler gibt keine fremden oder vollstaendigen Profildaten frei", () => { assert.equal(response.status, 200); assert.equal(response.json.profile.id, idA); assert.equal(response.json.validierung.bereit, false); assert.equal(response.json.profile.fullName, undefined); });
    observations.push({ code: "profile-read-error-http200", explanation: "Bestehendes catch setzt fehlgeschlagene Profillesung auf dasselbe neutrale Objekt wie fehlenden Bestand. Fehler und fehlendes Profil sind im Transport nicht unterscheidbar. Gemeinsamen Handler nicht veraendert." });
    fault.key = null;
    const { createAdminReader } = await import(pathToFileURL(path.join(sourceRoot, "verwaltung/api.mjs")).href);
    const actualReader = createAdminReader({ fetcher: (url, options) => fetch(`http://127.0.0.1:${port}${url}`, { ...options, headers: { ...options.headers, Cookie: adminCookie } }) });
    for (const [key, id] of [["overview"], ["budget"], ["customers"], ["sources"], ["runs"], ["profile", idA]]) {
      const body = await actualReader.read(key, id);
      check(`Vorbereiteter Datenleser liest ${key} vom echten lokalen Server`, () => assert.ok(body && typeof body === "object"));
    }
    actualReader.dispose();
    await accounts.updateUser(admin.id, { active: false });
    response = await request(routes[0], { cookie: adminCookie });
    check("Bereits angemeldetes deaktiviertes Admin-Konto verliert den Zugriff", () => assert.equal(response.status, 401));
    check("Keine externen Zugriffsversuche oder Modellaufrufe", () => { assert.equal(providerCalls, 0); assert.equal(externalAttempts, 0); });
    check("Bestehende Server-, Motor-, UI- und Konfigurationsdateien unveraendert", () => {
      for (const file of protectedPaths) assert.equal(hash(fs.readFileSync(path.join(testRoot, file))), baseline.get(file), file);
    });
    const result = { schemaVersion: 1, testedCommit: "ae18658e5caac2b39403c0e41e3a8af5c2b3d7be", testScriptSha256: hash(fs.readFileSync(__filename)),
      actualServer: true, root: testRoot, isolatedLocalStore: true, externalAttempts, providerCalls,
      routes, groupsPassed: checks.length, checks, requests: responses, observations,
      limits: ["Keine reale Supabase-/RLS-Pruefung", "Fehler durch prozesslokale Abhaengigkeitsinjektion", "Keine 500er-, Last-, Browser- oder Production-Abnahme", "Keine Schreibmethoden der Verwaltungsfunktionen geprueft"] };
    fs.writeFileSync(path.join(evidence, "sprint-a-ergebnis.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(`\n${checks.length}/${checks.length} Sprint-A-Pruefgruppen bestanden.`);
  } finally {
    fault.key = null;
    for (const restore of originals) restore();
    ai.requestText = originalRequestText; globalThis.fetch = nativeFetch;
    await new Promise(resolve => server.close(resolve));
    // Nur vom Test neu erzeugte Daten im eigenen, vorab leer geprueften Klon.
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
