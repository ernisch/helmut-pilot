"use strict";

// Echte lokale HTTP Antworten: fetch liefert die Header bereits, waehrend der
// Antwortinhalt haengen bleibt. Keine Supabase Verbindung, keine Fachdatentabellen.
process.env.HELMUT_SUPABASE_TIMEOUT_MS = "200";
delete process.env.HELMUT_TENANT_JWT_MODE;

const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const storage = require("../lib/helmut/storage");

let passed = 0;
let failed = 0;
const calls = [];
const responses = new Map();
const server = http.createServer((req, res) => {
  calls.push(req.url);
  responses.set(req.url, res);
  if (req.url === "/headers-stall") return;
  if (req.url === "/body-stall" || req.url === "/error-body-stall") {
    res.writeHead(req.url === "/body-stall" ? 200 : 522, { "Content-Type": "application/json" });
    res.write('{"unfinished":');
    return;
  }
  if (req.url === "/error") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Failing row contains (private-row). Key (email)=(private-value)." }));
    return;
  }
  if (req.url === "/no-content") { res.writeHead(204); res.end(); return; }
  if (req.url === "/empty") { res.end(); return; }
  if (req.url === "/invalid-json") { res.end("invalid-json"); return; }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify([{ erreichbar: 1 }]));
});

// Auch der fehlerhafte alte Code muss den Test beenden koennen. Dieser Waechter
// ist absichtlich viel laenger als die Produktfrist und gilt NIE als Erfolg.
async function request(path) {
  let timer;
  try {
    return await Promise.race([
      storage.tenantRequest(path, "local-timeout-test"),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Testwaechter: Datenbankabruf blieb unbegrenzt offen"));
          server.closeAllConnections();
        }, 3000);
      })
    ]);
  } finally { clearTimeout(timer); }
}

async function check(name, run) {
  try { await run(); passed += 1; console.log(`PASS  ${name}`); }
  catch (error) { failed += 1; console.error(`FAIL  ${name}: ${error.message}`); }
}

(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ["/headers-stall", "/body-stall", "/error-body-stall"]) {
      await check(`${path}: gesamte Antwort endet mit begrenztem Timeout`, async () => {
        await assert.rejects(request(path), /Supabase storage timed out after 200ms/);
        assert.equal(calls.filter((url) => url === path).length, 1, "keine versteckten Wiederholungen");
        const res = responses.get(path);
        if (!res.destroyed) await once(res, "close");
        assert.equal(res.destroyed, true, "abgebrochene Verbindung wird geschlossen");
      });
    }
    await check("Nach einem Timeout wird die naechste vollstaendige Antwort gelesen", async () => {
      assert.deepEqual(await request("/ok"), [{ erreichbar: 1 }]);
    });
    await check("HTTP Fehler behalten Status und redigieren Zeileninhalte", async () => {
      await assert.rejects(request("/error"), (error) => {
        assert.match(error.message, /Supabase storage failed \(400\)/);
        assert.match(error.message, /redacted/);
        assert.doesNotMatch(error.message, /private-row|private-value/);
        return true;
      });
    });
    await check("204 und leerer Antwortinhalt liefern weiterhin null", async () => {
      assert.equal(await request("/no-content"), null);
      assert.equal(await request("/empty"), null);
    });
    await check("Ungueltiges JSON bleibt ein Fehler", async () => {
      await assert.rejects(request("/invalid-json"), SyntaxError);
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => {
  console.error(error);
  server.closeAllConnections();
  server.close();
  process.exitCode = 1;
});
