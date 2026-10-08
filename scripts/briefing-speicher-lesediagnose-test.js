"use strict";
// Echte lokale Header-/Body-Haenger und vorhandener B2-Einstieg; keine Production.
process.env.HELMUT_SUPABASE_TIMEOUT_MS = "200";
delete process.env.HELMUT_TENANT_JWT_MODE;
const A = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { createHash } = require("node:crypto");
const S = require("../lib/helmut/storage");
const P = require("../lib/helmut/briefing-pruefaufnahme");
const D = require("../lib/helmut/briefing-speicher-lesediagnose");
const rows = require("../lib/helmut/synthetik-500-import")
  .erzeugeZeilen(require("../lib/helmut/synthetik-500-profile").erzeuge());
const profile = S.fromMandateProfileRow(rows.profileRows[11], rows.mandateRows[11]);
const commit = "a".repeat(40), tag = "2026-10-08", now = () => new Date("2026-10-08T18:00:00Z");
const privateText = "PRIVATE_QUERY_BODY_AND_HEADER_SENTINEL";
const providerId = "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb";
const providerHash = createHash("sha256").update(providerId).digest("hex");
const plans = new Map(), calls = new Map(), open = new Set();
let passed = 0;
const server = http.createServer((req, res) => {
  const n = (calls.get(req.url) || 0) + 1; calls.set(req.url, n);
  open.add(res); res.on("close", () => open.delete(res));
  const mode = (plans.get(req.url) || (() => "ok"))(n);
  if (mode === "headers") return;
  res.writeHead(mode === "error-body" ? 522 : 200, {
    "Content-Type": "application/json",
    "sb-request-id": mode === "invalid-id" ? privateText : providerId
  });
  if (["body", "error-body", "invalid-id"].includes(mode)) { res.write('{"unfinished":'); return; }
  res.end("[]");
});
function fixture(read) {
  let profiles = 0, builds = 0;
  const errors = [];
  const args = { userId: profile.id, tag, expectedCommit: commit, commit, production: true, now,
    storage: { getProfile: async () => { profiles++; return structuredClone(profile); } },
    build: async () => {
      builds++;
      try { await read(); } catch (error) { errors.push(error); throw error; }
      return { eingabe: { mandat: profile.id, tag }, korrekturBasis: { kos: [] }, briefing: { items: [] } };
    } };
  return { args, errors, counts: () => ({ profiles, builds }) };
}
async function capture(f) {
  try { await P.erfasse(f.args); A.fail("Timeout erwartet"); }
  catch (error) {
    A.match(error.message, /^Supabase storage timed out after 200ms:/);
    if (f.errors.length) A.equal(error, f.errors.at(-1), "urspruengliche finale Fehleridentitaet");
    const diagnose = P.fehlerDiagnose(error); A.equal(diagnose.art, "speicher-timeout");
    A(Object.isFrozen(diagnose)); A(Object.isFrozen(diagnose.speicher));
    for (const value of [privateText, providerId, profile.id])
      A(!JSON.stringify(diagnose).includes(value), "keine Rohwerte in der Diagnose");
    return { error, diagnose };
  }
}
async function check(name, action) { await action(); passed++; console.log("PASS  " + name); }
function koEndpoint(name) { return "/rest/v1/knowledge_objects?id=in.(" + privateText + ")&case=" + name; }
async function read(endpoint) { return S.tenantRequest(endpoint, profile.id); }
(async () => {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  process.env.SUPABASE_URL = "http://127.0.0.1:" + server.address().port;
  let bodyFailure;
  try {
    await check("Ausserhalb des B2-Kontexts bleiben Timeout und Fehlerdiagnose unveraendert", async () => {
      const endpoint = koEndpoint("outside"); plans.set(endpoint, () => "body");
      await A.rejects(read(endpoint), error => {
        A.equal(D.lese(error), null); A.equal(P.fehlerDiagnose(error), null);
        return /^Supabase storage timed out after 200ms:/.test(error.message);
      });
      A.equal(calls.get(endpoint), 1);
    });
    for (const mode of ["headers", "body", "error-body", "invalid-id"]) {
      await check(mode + ": echte Transportphase, Status und zwei vorhandene Buildversuche", async () => {
        const endpoint = koEndpoint(mode); plans.set(endpoint, () => mode);
        const f = fixture(() => read(endpoint)); const result = await capture(f);
        const d = result.diagnose.speicher;
        A.equal(d.version, "blocker2-speicher-lesediagnose/1");
        A.equal(d.ressource, "knowledge_objects"); A.equal(d.abfrage, "id-in");
        A.equal(d.schritt, mode === "headers" ? "vor-antwort-headern" : "antwort-inhalt");
        A.equal(d.httpStatus, mode === "headers" ? undefined : mode === "error-body" ? 522 : 200);
        A.equal(d.anbieterRequestHash, ["headers", "invalid-id"].includes(mode) ? undefined : providerHash);
        A.equal(d.fristMs, 200); A(Number.isSafeInteger(d.verstrichenMs) && d.verstrichenMs >= 150);
        A.equal(d.buildVersuche, 2); A.equal(d.profilVorherVersuche, 1);
        A.deepEqual(f.counts(), { profiles: 1, builds: 2 }); A.equal(calls.get(endpoint), 2);
        if (mode === "body") bodyFailure = result.error;
      });
    }
    await check("Erfolgreiche vorhandene Quellen-Wiederaufnahme aendert das Erfolgs-DTO nicht", async () => {
      const endpoint = koEndpoint("resume"); plans.set(endpoint, n => n === 1 ? "body" : "ok");
      const f = fixture(() => read(endpoint)), out = await P.erfasse(f.args);
      A.deepEqual(out.leseWiederaufnahme, { version: "blocker2-read-resume/1", phase: "briefing-aufbauen", art: "speicher-timeout", versuche: 2 });
      A.equal(out.diagnose, undefined); A.equal(out.speicher, undefined);
      A.deepEqual(f.counts(), { profiles: 2, builds: 2 }); A.equal(calls.get(endpoint), 2);
    });
    await check("Profil-Wiederaufnahme verhindert weiterhin einen weiteren Build-Retry", async () => {
      const endpoint = "/rest/v1/profiles?id=eq." + encodeURIComponent(profile.id) + "&select=*,mandate_profiles(*)&limit=1";
      plans.set(endpoint, n => n === 1 ? "headers" : "ok");
      const ko = koEndpoint("after-profile-resume"); plans.set(ko, () => "body");
      const f = fixture(() => read(ko));
      f.args.storage.getProfile = async () => { await read(endpoint); return structuredClone(profile); };
      const d = (await capture(f)).diagnose.speicher;
      A.equal(d.buildVersuche, 1); A.equal(d.profilVorherVersuche, 2);
      A.equal(calls.get(endpoint), 2); A.equal(calls.get(ko), 1);
    });
    await check("Parallele Kontexte vermischen Phasen und Versuchszahlen nicht", async () => {
      const a = koEndpoint("parallel"), b = "/rest/v1/profiles?id=eq." + privateText + "&case=parallel";
      plans.set(a, () => "body"); plans.set(b, () => "headers");
      const [x, y] = await Promise.all([capture(fixture(() => read(a))), capture(fixture(() => read(b)))]);
      A.equal(x.diagnose.speicher.ressource, "knowledge_objects"); A.equal(x.diagnose.speicher.buildVersuche, 2);
      A.equal(x.diagnose.speicher.httpStatus, 200);
      A.equal(y.diagnose.speicher.ressource, "profiles"); A.equal(y.diagnose.speicher.buildVersuche, 1);
      A.equal(y.diagnose.speicher.httpStatus, undefined); A.equal(calls.get(a), 2); A.equal(calls.get(b), 1);
      A.equal(D.beginne(a, undefined, 200), null, "kein aktiver Restkontext");
    });
    await check("GET-Kontext nimmt weder Schreibmethoden noch fremde Beobachtungstoken an", async () => {
      D.mitKontext(() => {
        A.equal(D.beginne("/rest/v1/profiles?id=eq.secret", "POST", 200), null);
        const error = new Error(privateText); D.bindeTimeout(error, {}); A.equal(D.lese(error), null);
        D.antwort({}, { get status() { A.fail("fremder Token darf keine Getter lesen"); } });
      });
    });
    await check("Feindlicher Headergetter aendert die urspruengliche Timeoutausnahme nicht", async () => {
      const saved = global.fetch, endpoint = koEndpoint("hostile-header");
      let count = 0;
      global.fetch = async () => {
        count++;
        return { ok: true, status: 200, get headers() { throw Error(privateText); }, text: () => new Promise(() => {}) };
      };
      try {
        const d = (await capture(fixture(() => read(endpoint)))).diagnose.speicher;
        A.equal(d.httpStatus, 200); A.equal(d.schritt, "antwort-inhalt"); A.equal(d.anbieterRequestHash, undefined);
        A.equal(count, 2);
      } finally { global.fetch = saved; }
    });
    await check("Echter HTTP-Fehlereinstieg gibt nur die gebundene geheimnisfreie Diagnose aus", async () => {
      const saved = P.erfasse, oldError = console.error, logs = [];
      process.env.CRON_SECRET = "ONLY_OFFLINE_DIAGNOSTIC_SECRET"; process.env.VERCEL_ENV = "production";
      process.env.VERCEL_GIT_COMMIT_SHA = commit; P.erfasse = async () => { throw bodyFailure; };
      console.error = (...args) => logs.push(args.join(" "));
      try {
        const app = require("../server");
        const response = await new Promise(resolve => {
          const res = { headersSent: false, writeHead(status) { this.status = status; this.headersSent = true; },
            end(body) { resolve({ status: this.status, body }); } };
          app({ method: "GET", url: "/api/cron/briefing-nachweis?modus=eingabe&mandat=" + profile.id + "&tag=" + tag,
            headers: { host: "localhost", authorization: "Bearer ONLY_OFFLINE_DIAGNOSTIC_SECRET", "x-helmut-production-commit": commit } }, res);
        });
        A.equal(response.status, 500); A.deepEqual(JSON.parse(response.body).diagnose, P.fehlerDiagnose(bodyFailure));
        A.equal(logs.length, 1);
        for (const value of [privateText, providerId, profile.id, process.env.CRON_SECRET])
          A(!(response.body + logs.join(" ")).includes(value));
      } finally { P.erfasse = saved; console.error = oldError; }
    });
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  A.equal(open.size, 0, "echte offene Antwortverbindungen geschlossen");
  console.log("\n" + passed + " PASS, 0 FAIL");
})().catch(error => {
  console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1;
});

