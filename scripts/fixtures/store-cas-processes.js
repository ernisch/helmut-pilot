"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

async function worker() {
  const base = process.env.HELMUT_TEST_STORE_CAS_URL;
  const barrier = process.env.HELMUT_TEST_STORE_CAS_BARRIER;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  assert.equal(new URL(barrier).hostname, "127.0.0.1");
  process.env.HELMUT_STORAGE_BACKEND = "supabase";
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.HELMUT_TEST_STORE_CAS_KEY;
  process.env.HELMUT_SUPABASE_STORE_ID = "main";
  const key = process.argv[3]; const index = Number(process.argv[4]);
  assert.ok(["main", "p-cas-existing", "p-cas-new"].includes(key));
  assert.ok(Number.isInteger(index) && index >= 0 && index < 5);
  const storage = require("../../lib/helmut/storage");
  const rendezvous = async (phase) => {
    const response = await fetch(`${barrier}/${phase}/${index}`, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200);
    await response.text();
  };
  const note = { id: `prozess-${index}` };
  const first = await storage.readStore(key);
  first.userNotes.push(note);
  await rendezvous("gelesen"); // Alle fuenf halten nachweislich dieselbe Grundlinie.
  let conflict = false;
  try { await storage.writeStore(first, key); }
  catch (error) { assert.equal(error.code, "STORE_WRITE_CONFLICT"); conflict = true; }
  await rendezvous("geschrieben");
  if (conflict) {
    // Nur der Test wiederholt die fachliche Aenderung nach neuem Lesen, niemals
    // einen alten Payload oder einen fehlgeschlagenen Transport.
    const until = Date.now() + 10000;
    for (;;) {
      const fresh = await storage.readStore(key, { fresh: true });
      fresh.userNotes.push(note);
      try { await storage.writeStore(fresh, key); break; }
      catch (error) {
        assert.equal(error.code, "STORE_WRITE_CONFLICT");
        assert.ok(Date.now() < until, "Speicherkonflikt bleibt bestehen");
        await new Promise((resolve) => setTimeout(resolve, 10 + index * 7));
      }
    }
  }
  console.log(JSON.stringify({ index, conflict, saved: true }));
}

async function runWriters({ base, token, key }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const phases = new Map();
  const barrier = http.createServer((req, res) => {
    const match = /^\/(gelesen|geschrieben)\/([0-4])$/.exec(req.url);
    if (!match) { res.writeHead(400); res.end(); return; }
    const waiting = phases.get(match[1]) || new Map();
    if (waiting.has(match[2])) { res.writeHead(409); res.end(); return; }
    waiting.set(match[2], res); phases.set(match[1], waiting);
    if (waiting.size === 5) for (const reply of waiting.values()) reply.end("bereit");
  });
  barrier.listen(0, "127.0.0.1");
  await once(barrier, "listening");
  const gate = `http://127.0.0.1:${barrier.address().port}`;
  try {
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => new Promise((resolve, reject) => {
      const env = { ...process.env, HELMUT_STORAGE_BACKEND: "local",
        HELMUT_TEST_STORE_CAS_URL: base, HELMUT_TEST_STORE_CAS_KEY: token, HELMUT_TEST_STORE_CAS_BARRIER: gate };
      for (const name of require("../lokaler-netzschutz").PRODUCTION_KENNUNGEN) delete env[name];
      delete env.HELMUT_V3_STORE;
      const child = spawn(process.execPath, [path.join(__dirname, "../lokal.js"), __filename, "worker", key, String(index)], {
        env, stdio: ["ignore", "pipe", "pipe"]
      });
      let output = ""; let diagnostic = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { diagnostic += chunk; });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Speichertestprozess ${index}: Exit ${code}${/LOKAL|NETZ|PRODUCTION/.test(diagnostic) ? " (lokaler Schutz)" : ""}`));
          return;
        }
        try { resolve(JSON.parse(output.trim().split("\n").at(-1))); }
        catch (_) { reject(new Error("Speichertestprozess lieferte keine gueltige Quittung")); }
      });
    })));
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
    assert.equal(results.filter((r) => !r.value.conflict).length, 1, "Genau ein erster Schreiber darf gewinnen");
    assert.ok(results.every((r) => r.value.saved));
    return results.map((r) => r.value);
  } finally {
    barrier.closeAllConnections();
    await new Promise((resolve) => barrier.close(resolve));
  }
}

module.exports = { runWriters };
if (require.main === module) worker().catch((error) => {
  console.error(`FAIL ${error.code || error.name}`);
  process.exitCode = 1;
});
