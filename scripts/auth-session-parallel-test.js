"use strict";

// Echter Sessionhandler mit kontrollierten Abhaengigkeiten: keine Konten,
// Datenbank oder Uhrzeit-Schwellen. Freigaben zeigen die Abhaengigkeiten.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../server"), "utf8");
const start = source.indexOf("async function handleAuthSession(");
const end = source.indexOf("\n// Mandate, die ein Nutzer", start);
assert(start > 0 && end > start);
const user = { id: "synthetischer-nutzer", role: "referent" };
const profiles = [{ id: "synthetisches-mandat", name: "Testmandat" }];
const tick = () => new Promise(resolve => setImmediate(resolve));
let passed = 0;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const calls = [], written = [], extension = deferred(), allowed = deferred(), listing = deferred();
  const handler = vm.runInNewContext(source.slice(start, end) + "; handleAuthSession", {
    accounts: { extendSession: token => { assert.equal(token, "test-token"); calls.push("extend"); return extension.promise; } },
    auth: {
      getAllowedPoliticianIds: value => { assert.equal(value, user); calls.push("allowed"); return allowed.promise; },
      sessionCookieHeader: (token, ttl) => { assert.equal(token, "test-token"); return `session=${token}; Max-Age=${ttl}`; }
    },
    listAllowedProfiles: (value, ids) => {
      assert.equal(value, user); assert.deepEqual(ids, ["synthetisches-mandat"]);
      calls.push("profiles"); return listing.promise;
    },
    publicUser: value => ({ id: value.id, role: value.role }),
    jsonHeaders: extra => ({ "Cache-Control": "no-store", ...extra }),
    console: { error: () => calls.push("extension-error") }
  });
  const response = { writeHead: (status, headers) => written.push({ status, headers }),
    end: body => written.push(JSON.parse(body)) };
  return { handler, response, calls, written, extension, allowed, listing };
}
async function check(name, work) { await work(); passed++; console.log("PASS " + name); }
(async () => {
  await check("Anonym: keine Verlaengerung oder Profilabfrage", async () => {
    const f = fixture(); await f.handler(f.response, null, "test-token");
    assert.deepEqual(f.calls, []); assert.equal(f.written[0].status, 200);
    assert.deepEqual(f.written[1], { authenticated: false });
  });
  await check("Paralleler Start, Autorisierung vor Profilen, Cookie erst nach Verlaengerung", async () => {
    const f = fixture(), result = f.handler(f.response, user, "test-token");
    assert.deepEqual(f.calls, ["extend", "allowed"]); assert.deepEqual(f.written, []);
    f.allowed.resolve(["synthetisches-mandat"]); await tick();
    assert.deepEqual(f.calls, ["extend", "allowed", "profiles"]);
    f.listing.resolve(profiles); await tick(); assert.deepEqual(f.written, []);
    f.extension.resolve(3600); await result;
    assert.equal(f.written[0].headers["Set-Cookie"], "session=test-token; Max-Age=3600");
    assert.equal(f.written[0].headers["Cache-Control"], "no-store");
    assert.deepEqual(f.written[1], { authenticated: true, user,
      allowedPoliticians: ["synthetisches-mandat"], profiles });
  });
  await check("Verlaengerungsfehler: weiterhin Sessionantwort ohne neues Cookie", async () => {
    const f = fixture(), result = f.handler(f.response, user, "test-token");
    f.extension.reject(new Error("synthetischer Verlaengerungsfehler"));
    f.allowed.resolve(["synthetisches-mandat"]); f.listing.resolve(profiles); await result;
    assert.equal(f.written[0].headers["Set-Cookie"], undefined);
    assert.equal(f.written[1].authenticated, true); assert(f.calls.includes("extension-error"));
  });
  await check("Ohne Token: keine Verlaengerung und kein Cookie", async () => {
    const f = fixture(), result = f.handler(f.response, user, null);
    assert.deepEqual(f.calls, ["allowed"]);
    f.allowed.resolve(["synthetisches-mandat"]); f.listing.resolve(profiles); await result;
    assert.equal(f.written[0].headers["Set-Cookie"], undefined);
  });
  for (const failing of ["allowed", "listing"]) {
    await check(`${failing}-Fehler bleibt laut; spaeterer Verlaengerungsfehler unbehandelt ausgeschlossen`, async () => {
      const f = fixture(), result = f.handler(f.response, user, "test-token");
      const observed = assert.rejects(result, /synthetischer Auswahlfehler/);
      if (failing === "listing") { f.allowed.resolve(["synthetisches-mandat"]); await tick(); }
      f[failing].reject(new Error("synthetischer Auswahlfehler")); await observed;
      f.extension.reject(new Error("spaeter Verlaengerungsfehler")); await tick();
      assert.deepEqual(f.written, []); assert(f.calls.includes("extension-error"));
      if (failing === "allowed") assert(!f.calls.includes("profiles"));
    });
  }
  console.log(`${passed}/${passed} Session-Parallelitaetsgruppen bestanden.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
