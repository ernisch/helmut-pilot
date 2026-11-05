"use strict";

// Ausschliesslich Kandidatenfunktion in VM: Patch wird niemals angewandt.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
assert.ok(process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"));
assert.equal(process.env.HELMUT_SOURCE_MODE, "off"); assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
const serverBefore = sha(fs.readFileSync(path.join(root, "server.js")));
const patchPath = path.join(root, "docs/backend-isolated/integration-01-verwaltung-server-kandidat.patch");
const patch = fs.readFileSync(patchPath, "utf8");
const added = patch.split("\n").filter(line => line.startsWith("+") && !line.startsWith("+++")).map(line => line.slice(1)).join("\n");
const source = added.slice(added.indexOf("let originalAdministrationPackageCache"));
assert.ok(source.includes("if (!auth.authMode())"));
const authSource = fs.readFileSync(path.join(root, "lib/helmut/auth.js"), "utf8");
const authMode = authSource.match(/function authMode\(\) \{\n[^}]+\}/)[0];
const modeProcess = { env: { HELMUT_AUTH_MODE: "accounts" } };
const actualMode = vm.runInNewContext(`${authMode}; authMode`, { process: modeProcess });
let context = null, unavailable = false, authReads = 0;
const sandbox = { auth: { authMode: actualMode, getAuthContext: async () => { authReads++; if (unavailable) throw new Error("Synthetischer Auth-Ausfall"); return context; } },
  securityHeaders: extra => ({ "X-Content-Type-Options": "nosniff", ...extra }),
  require: name => { assert.equal(name, "./scripts/original-verwaltung-paket"); return require("./original-verwaltung-paket"); }, root, path };
vm.createContext(sandbox); vm.runInContext(source + "\nglobalThis.serve = serveOriginalAdministration;", sandbox);
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); console.log("PASS " + name); }
async function call(url, method = "GET") {
  const result = { status: null, headers: null, body: undefined, ended: false };
  const res = { writeHead: (status, headers) => { result.status = status; result.headers = headers; }, end: body => { result.body = body; result.ended = true; } };
  result.handled = await sandbox.serve({ method }, res, new URL(url, "http://127.0.0.1")); return result;
}
(async () => {
  await check("Andere Routen bleiben unberuehrt", async () => { const r = await call("/api/app/start"); assert.equal(r.handled, false); assert.equal(r.ended, false); assert.equal(authReads, 0); });
  await check("Echter boolescher authMode: Pilot404 und Accountmodus aktiv", async () => {
    modeProcess.env.HELMUT_AUTH_MODE = ""; assert.equal((await call("/verwaltung/")).status, 404); assert.equal(authReads, 0); modeProcess.env.HELMUT_AUTH_MODE = "accounts";
    assert.equal(actualMode(), true);
  });
  await check("Auth-Ausfall503, anonym401 und Mitglied403 vor jedem Asset", async () => {
    unavailable = true; assert.equal((await call("/verwaltung/")).status, 503); unavailable = false;
    assert.equal((await call("/verwaltung/runtime/react-18.3.1.production.min.js")).status, 401);
    context = { user: { role: "abgeordneter" } }; assert.equal((await call("/verwaltung/")).status, 403); context = { user: { role: "admin" } };
  });
  await check("Admin nurGET/HEAD, feste Slashweiterleitung und private CSP", async () => {
    assert.equal((await call("/verwaltung/", "POST")).status, 405);
    const redirect = await call("/verwaltung?next=https://example.invalid/"); assert.equal(redirect.status, 308); assert.equal(redirect.headers.Location, "/verwaltung/");
    const r = await call("/verwaltung/"); assert.equal(r.status, 200); assert.match(r.headers["Content-Type"], /^text\/html/);
    assert.equal(r.headers["Cache-Control"], "no-store"); assert.equal(r.headers.Vary, "Cookie");
    assert.match(r.headers["Content-Security-Policy"], /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
    const expected = require("./original-verwaltung-paket").originalAdministrationPackage().html;
    assert.equal(sha(r.body), sha(expected), "Unveraendertes Originalpaket");
    assert.ok(r.body.includes('"./runtime/react-18.3.1.production.min.js"'));
    assert.equal((await call("/verwaltung/", "HEAD")).body, undefined);
  });
  await check("Nur paketierte Originalassets mit Original-SRI und richtigen MIME-Typen", async () => {
    const react = await call("/verwaltung/runtime/react-18.3.1.production.min.js"); assert.equal(react.status, 200); assert.match(react.headers["Content-Type"], /^text\/javascript/);
    assert.equal(sha(react.body), sha(fs.readFileSync(path.join(root, "verwaltung/runtime/react-18.3.1.production.min.js"))));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "verwaltung/claude-original-manifest.json"))); const font = manifest.files.find(file => file.path.endsWith(".ttf"));
    const result = await call("/verwaltung/" + font.path); assert.equal(result.status, 200); assert.equal(result.headers["Content-Type"], "font/ttf"); assert.equal(sha(result.body), font.sha256);
  });
  await check("Prototypgenerator, Rohquellen, Traversal und defekte Kodierung bleiben gesperrt", async () => {
    for (const key of ["v3_logik.js", "server.js", "claude-original-manifest.json", "%2e%2e%2fserver.js", "Helmut%20Verwaltung%20v3.dc.html"]) assert.equal((await call("/verwaltung/" + key)).status, 404);
    assert.equal((await call("/verwaltung/%ZZ")).status, 400);
  });
  assert.equal(sha(fs.readFileSync(path.join(root, "server.js"))), serverBefore);
  const result = { status: "PASS_UNAPPLIED_CANDIDATE_FUNCTION", checks, patchSha256: sha(patch), actualAuthSourceSha256: sha(authSource), serverSha256: serverBefore, testSha256: sha(fs.readFileSync(__filename)), patchApplied: false,
    limits: "VM-Kandidatenfunktion mit echtem booleschen authMode und echten Originalassets; synthetischer Authkontext. Kein realer Mount, keine aktuelle Kunden-UI, kein Browser-/Productionnachweis." };
  fs.writeFileSync(path.join(root, "docs/backend-isolated/verwaltungsroute-kandidat-pruefbeleg-20261104.json"), JSON.stringify(result, null, 2) + "\n");
})().catch(error => { console.error(error.message.slice(0, 300)); process.exitCode = 1; });
