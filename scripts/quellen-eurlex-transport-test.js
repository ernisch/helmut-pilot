"use strict";
const assert = require("node:assert/strict"), https = require("node:https");
const { EventEmitter } = require("node:events");
const C = require("../lib/helmut/crawler"), T = require("../lib/helmut/quellen-eurlex-transport");
const F = require("./fixtures/eurlex-original");
const manifest = F.manifestationUri.replace("http:", "https:");
const opts = kind => ({ allowedHost: "publications.europa.eu", meldeStatus: true,
  cellar: { kind, workUri: F.cellar.workUri, journalUri: F.cellar.officialJournalUri } });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function mock(responses, fn) {
  const old = https.get, steering = process.env.HELMUT_ANBIETER_STEUERUNG, calls = [];
  process.env.HELMUT_ANBIETER_STEUERUNG = "off";
  https.get = (url, options, cb) => {
    calls.push({ url, options }); const request = new EventEmitter();
    request.destroy = err => request.emit("error", err || Error("mock-abort"));
    queueMicrotask(() => {
      const value = responses[calls.length - 1]; assert(value, "kein ungeplanter Request");
      const response = new EventEmitter(); Object.assign(response, { statusCode: value.status ?? 200,
        headers: value.headers || { "content-type": "application/zip;charset=UTF-8" }, complete: value.complete ?? true,
        resume() {}, destroy() {}, setEncoding() {} });
      cb(response);
      if (value.event) response.emit(value.event, Error("mock-response-error"));
      else { if (value.body) response.emit("data", value.body); response.emit("end"); }
    }); return request;
  };
  try { await fn(calls); } finally {
    https.get = old; if (steering == null) delete process.env.HELMUT_ANBIETER_STEUERUNG; else process.env.HELMUT_ANBIETER_STEUERUNG = steering;
  }
}
(async () => {
  await test("RDF und binaerer ZIP-Transport haben belegten Accept, Bytegrenzen und echten Status", async () => {
    await mock([{ headers: { "content-type": "application/rdf+xml;charset=UTF-8" }, body: Buffer.from(F.rdf()) }], async calls => {
      const result = await C.fetchUrl(manifest, 0, opts("rdf")); assert.equal(result.body, F.rdf()); assert.equal(result.status, 200);
      assert.equal(calls[0].options.headers.accept, "application/rdf+xml");
      assert(calls[0].options.headers["user-agent"].includes("/impressum"));
    });
    await mock([{ body: F.zip() }], async calls => {
      const result = await C.fetchUrl(F.itemUrl, 0, opts("zip")); assert.deepEqual(result.bytes, F.zip());
      assert.equal(result.status, 200); assert.equal(result.finalUrl, F.itemUrl); assert.equal(calls[0].options.headers.accept, "application/zip");
    });
  });
  await test("Nur amtlicher gleicher Werkpfad darf als bekannte HTTPS-Weiterleitung verfolgt werden", async () => {
    const target = F.cellar.workUri + ".0004.02/rdf/object/full";
    await mock([{ status: 303, headers: { location: target } }, { headers: { "content-type": "application/rdf+xml" }, body: Buffer.from(F.rdf()) }], async calls => {
      const result = await C.fetchUrl(manifest, 0, opts("rdf")); assert.equal(result.finalUrl, target.replace("http:", "https:"));
      assert.equal(calls.length, 2);
    });
    await mock([{ status: 303, headers: { location: "https://example.org/anderer" } }], async calls => {
      await assert.rejects(C.fetchUrl(manifest, 0, opts("rdf")), /transportziel/); assert.equal(calls.length, 1);
    });
    for (const bad of [F.itemUrl.replace("https:", "http:"), F.itemUrl + "?x=1", F.itemUrl + "#x", F.itemUrl.replace("/DOC_1", "/DOC_2"),
      F.itemUrl.replace("publications.europa.eu", "user@publications.europa.eu"), F.itemUrl.replace("publications.europa.eu", "example.org")])
      assert.throws(() => T.config(bad, opts("zip").cellar), /transportziel/);
  });
  await test("Falscher Status, MIME, Kodierung, Groesse und unvollstaendige Antwort bleiben geschlossen", async () => {
    for (const response of [{ status: 202 }, { headers: { "content-type": "text/html" } }, { complete: false, body: F.zip() },
      { body: Buffer.alloc(256 * 1024 + 1) }]) await mock([response], async () => {
      await assert.rejects(C.fetchUrl(F.itemUrl, 0, opts("zip")));
    });
    await mock([{ headers: { "content-type": "application/rdf+xml" }, body: Buffer.from([0xff]) }], async () =>
      assert.rejects(C.fetchUrl(manifest, 0, opts("rdf")), /kodierung/));
  });
  await test("Responsefehler/Abbruch enden kontrolliert; bereits abgebrochener Aufruf startet keinen GET", async () => {
    for (const event of ["aborted", "error"]) await mock([{ event }], async () =>
      assert.rejects(C.fetchUrl(F.itemUrl, 0, opts("zip")), /abgebrochen|mock-response-error/));
    const abort = new AbortController(); abort.abort();
    await mock([], async calls => {
      await assert.rejects(C.fetchUrl(F.itemUrl, 0, { ...opts("zip"), abbruchSignal: abort.signal }),
        error => error === abort.signal.reason && error.name === "AbortError");
      assert.equal(calls.length, 0);
    });
  });
  await test("Normaler bestehender Quellenabruf behaelt seine Antwortform und Header", async () => {
    await mock([{ body: "<rss><channel/></rss>" }], async calls => {
      assert.deepEqual(await C.fetchUrl("https://example.org/feed"), { body: "<rss><channel/></rss>", finalUrl: "https://example.org/feed" });
      assert.equal(calls[0].options.headers["user-agent"], "HelmutBot/1.0 political-briefing");
    });
  });
  console.log(`\n${passed}/${passed} Transportgruppen bestanden; ausschliesslich gemocktes HTTPS, keine Originalabrufe.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
