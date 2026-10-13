"use strict";
// Full fictional500 packet crosses the real bounded storage reader, then the
// unchanged complete Startschutz. No actual runtime, staging or500 admission.
const assert = require("node:assert/strict");
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co";
for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"])
  process.env[key] = "fictitious-full-packet-key";
process.env.HELMUT_SUPABASE_STORE_ID = "main";
process.env.HELMUT_SUPABASE_AUTH_STORE_ID = "main-auth";
globalThis.fetch = async () => { throw Error("offline-network-forbidden"); };
const storage = require("../lib/helmut/storage"), W = require("../lib/helmut/starttor-original-state-witness");
const V = require("../lib/helmut/realkohorte-500-vertrag"), F = require("./starttor-original-state-witness-test");
const closed = /starttor-original-state-(?:transport-)?closed/;
const fullTotal = W.LIMITS.fullPacket + 2 * W.LIMITS.original + W.LIMITS.output;
let passed = 0;
function freeze(o) { if (o && typeof o === "object") { Object.values(o).forEach(freeze); Object.freeze(o); } return o; }
function bridge(change = () => {}, responseSizes = []) {
  const f = F.fixture(true, true); change(f);
  const before = V.stabil(f.auth), calls = [], packets = [];
  freeze(f.auth); freeze(f.main);
  const mockNative = f.storage.createStarttorOriginalStateReader().native;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    let value;
    if (url.pathname === "/rest/v1/helmut_store") {
      const id = url.searchParams.get("id").slice(3);
      assert.equal(url.searchParams.get("select"), "id,data"); assert.equal(url.searchParams.get("limit"), "2");
      const data = id === "main-auth" ? f.auth : id === "main" ? f.main : f.p;
      value = [{ id, data }];
    } else {
      assert.equal(url.pathname, "/rest/v1/rpc/" + W.RPC);
      value = await mockNative({ nonce: url.searchParams.get("p_nonce"), packetHash: url.searchParams.get("p_packet_hash"),
        authHash: url.searchParams.get("p_auth_hash"), mainHash: url.searchParams.get("p_main_hash") });
    }
    const serialized = JSON.stringify(value), size = Buffer.byteLength(serialized);
    const requestedSize = responseSizes[calls.length - 1] ?? size;
    assert(requestedSize >= size);
    const bytes = Buffer.from(serialized + " ".repeat(requestedSize - size)); packets.push(bytes.length);
    // No Content-Length: the real streaming cap, including row-envelope bytes,
    // must enforce limits independently of a declared size.
    const body = new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 32768) controller.enqueue(bytes.subarray(i, i + 32768));
      controller.close();
    } });
    return { status: 200, headers: { get: k => k === "content-type" ? "application/json" : null }, body };
  };
  const wireStorage = { createStarttorOriginalStateReader: options => storage.createStarttorOriginalStateReader({ ...options, fetchImpl }) };
  const call = version => W.witness({ request: { nonce: F.NONCE, packetHash: V.hash(f.p),
    ...(version === undefined ? {} : { packetVersion: version }) }, runtime: f.runtime, storage: wireStorage });
  return { f, before, calls, packets, wireStorage, call };
}
async function check(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function main() {
  const realNow = Date.now; Date.now = () => F.NOW;
  try {
    await check("Full500 staged packet passes physical GET reader and complete consumer only with explicitv3", async () => {
      const b = bridge(), result = await b.call(W.ABSENCE_PACKET_VERSION);
      assert(b.packets[0] > W.LIMITS.packet && b.packets[0] < W.LIMITS.fullPacket);
      assert.equal(result.localStartschutzPassed, true); assert.equal(b.calls.length, 4);
      assert.deepEqual(b.calls.map(c => c.url.pathname), ["/rest/v1/helmut_store", "/rest/v1/helmut_store",
        "/rest/v1/helmut_store", "/rest/v1/rpc/" + W.RPC]);
      for (const c of b.calls) { assert.equal(c.init.method, "GET"); assert.equal(c.init.redirect, "error");
        assert.equal(c.init.headers.apikey, "fictitious-full-packet-key"); assert.equal(c.init.body, undefined); }
      assert.equal(result.readTransport.maximumPacketResponseUtf8Bytes, W.LIMITS.fullPacket);
      assert.equal(result.readTransport.maximumResponseUtf8Bytes, fullTotal); assert.equal(result.readTransport.retries, 0);
      assert.equal(result.readTransport.consumedHttpRequests, 4); assert.equal(result.readTransport.sharedSnapshotAcrossHttpRequests, false);
      assert.equal(V.stabil(b.f.auth), b.before);
      for (const flag of ["fundingAccepted", "globalFutureQuietAccepted", "activation", "paid500"]) assert.equal(result[flag], false);
      assert(!JSON.stringify(result).includes(b.f.auth.fixturePrivateSentinel));
    });
    await check("Complete packet and unchanged full originals above8MiB pass only explicitv3", async () => {
      const b = bridge(f => {
        f.auth.fixturePadding = "x".repeat(7 * 1024 * 1024 / 2);
        f.main.fixturePadding = "x".repeat(7 * 1024 * 1024 / 2);
      }), result = await b.call(W.ABSENCE_PACKET_VERSION);
      const actualBytes = b.packets.reduce((sum, bytes) => sum + bytes, 0);
      assert(actualBytes > W.LIMITS.total && actualBytes <= fullTotal);
      assert(b.packets[1] <= W.LIMITS.original && b.packets[2] <= W.LIMITS.original);
      assert.equal(result.readTransport.responseUtf8Bytes, actualBytes);
      assert.equal(result.readTransport.maximumResponseUtf8Bytes, fullTotal);
      assert.equal(result.localStartschutzPassed, true); assert.equal(b.calls.length, 4);
      assert.equal(V.stabil(b.f.auth), b.before);
      for (const flag of ["fundingAccepted", "globalFutureQuietAccepted", "activation", "paid500"]) assert.equal(result[flag], false);
      assert(!JSON.stringify(result).includes(b.f.auth.fixturePrivateSentinel));
    });
    await check("Default8MiB and derived explicitv3 aggregate reject one extra byte", async () => {
      for (const version of [undefined, W.ABSENCE_PACKET_VERSION]) {
        const cap = version === undefined ? W.LIMITS.total : fullTotal;
        const responseBytes = Math.floor(cap / 3);
        for (const extra of [0, 1]) {
          // Legal JSON whitespace makes the streamed boundary exact, with no
          // changed original values and no reliance on Content-Length.
          const b = bridge(() => {}, [responseBytes, responseBytes, cap - 2 * responseBytes + extra]);
          const reader = b.wireStorage.createStarttorOriginalStateReader({ projectRef: "a".repeat(20),
            deadlineMs: F.NOW + W.LIMITS.deadlineMs, ...(version === undefined ? {} : { packetVersion: version }) });
          await reader.original("auth"); await reader.original("auth");
          if (extra) await assert.rejects(reader.original("auth"), closed);
          else await reader.original("auth");
          assert.equal(reader.inventory().maximumResponseUtf8Bytes, cap);
          assert.equal(reader.inventory().responseUtf8Bytes, cap + extra);
          assert.equal(b.calls.length, 3);
          assert(b.packets.every(bytes => bytes <= W.LIMITS.original));
          assert.equal(b.packets.reduce((sum, bytes) => sum + bytes, 0), cap + extra);
        }
      }
    });
    await check("Explicitv3 still rejects fifth call without another backend request", async () => {
      const b = bridge(), reader = b.wireStorage.createStarttorOriginalStateReader({ projectRef: "a".repeat(20),
        deadlineMs: F.NOW + W.LIMITS.deadlineMs, packetVersion: W.ABSENCE_PACKET_VERSION });
      for (let i = 0; i < W.LIMITS.calls; i++) await reader.original("main");
      await assert.rejects(reader.original("main"), closed);
      assert.equal(b.calls.length, W.LIMITS.calls);
    });
    await check("Default1MiB and wrong staged version close before original reads", async () => {
      for (const [change, version] of [[() => {}, undefined], [f => { f.p.version = W.PRESERVED_PACKET_VERSION; }, W.ABSENCE_PACKET_VERSION]]) {
        const b = bridge(change); await assert.rejects(b.call(version), closed);
        assert.equal(b.calls.length, 1); assert(b.calls[0].url.searchParams.get("id").startsWith("eq.synthetik500-original-state-"));
      }
    });
    await check("Invalid selections cannot start any fetch or raise arbitrary budgets", async () => {
      for (const value of [true, false, null, "3", W.PACKET_VERSION, W.PRESERVED_PACKET_VERSION]) {
        const b = bridge(); await assert.rejects(b.call(value), closed); assert.equal(b.calls.length, 0);
        assert.throws(() => storage.createStarttorOriginalStateReader({ projectRef: "a".repeat(20),
          deadlineMs: F.NOW + 20000, packetVersion: value }), closed);
      }
      assert.equal(W.LIMITS.packet, 1048576); assert.equal(W.LIMITS.fullPacket, 2097152);
      assert.equal(W.LIMITS.original, 4194304); assert.equal(W.LIMITS.total, 8388608);
      assert.equal(fullTotal, 10493952);
      assert.equal(W.LIMITS.output, 8192); assert.equal(W.LIMITS.calls, 4); assert.equal(W.LIMITS.deadlineMs, 20000);
    });
    await check("Stream larger than2MiB closes at the packet before original reads", async () => {
      const b = bridge(f => { f.p.startschutz.paketUtf8 += "x".repeat(W.LIMITS.fullPacket); });
      await assert.rejects(b.call(W.ABSENCE_PACKET_VERSION), closed); assert.equal(b.calls.length, 1);
    });
    await check("Physical handler forwards exact header while keeping method/Bearer/CRON admission", async () => {
      const b = bridge(), result = { status: null, body: null }, url = new URL("https://fixture.vercel.app/api/cron/testnachweis-status?modus=starttor-original-state");
      const response = { writeHead: s => { result.status = s; }, end: v => { result.body = v; } };
      const headers = { authorization: "Bearer fictitious-cron-key", "x-helmut-witness-nonce": F.NONCE,
        "x-helmut-witness-packet-hash": V.hash(b.f.p), "x-helmut-witness-packet-version": W.ABSENCE_PACKET_VERSION };
      let admitted = 0;
      await W.handleRequest({ method: "GET", headers }, response, url, { authorizeCron: () => { admitted++; return true; },
        jsonHeaders: () => ({}), storage: b.wireStorage, runtime: () => b.f.runtime });
      assert.equal(result.status, 200); assert.equal(admitted, 1); assert.equal(b.calls.length, 4);
      assert.equal(JSON.parse(result.body).paid500, false);
      for (const request of [{ method: "POST", headers }, { method: "GET", headers: { ...headers, authorization: undefined } }]) {
        const before = b.calls.length;
        await W.handleRequest(request, response, url, { authorizeCron: () => { throw Error("gate was bypassed"); },
          jsonHeaders: () => ({}), storage: b.wireStorage, runtime: () => b.f.runtime });
        assert([403, 405].includes(result.status)); assert.equal(b.calls.length, before);
      }
      await W.handleRequest({ method: "GET", headers }, response, url, { authorizeCron: () => { response.writeHead(403); response.end("{}"); return false; },
        jsonHeaders: () => ({}), storage: b.wireStorage, runtime: () => b.f.runtime });
      assert.equal(result.status, 403); assert.equal(b.calls.length, 4);
    });
  } finally { Date.now = realNow; }
  console.log("PASS full-packet-physical-transport " + passed + " groups; fictional only, no runtime/staging/500 authority");
}
if (require.main === module) {
  const safety = setTimeout(() => { console.error("full packet bridge did not settle"); process.exit(1); }, 20000);
  main().then(() => clearTimeout(safety), e => { clearTimeout(safety); console.error(e.stack); process.exitCode = 1; });
}
