"use strict";
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const E = require("../lib/helmut/quellen-auszug");
const D = require("../lib/helmut/dedup");
const G = require("./github-quellenkontext-500");
const title = "Parlament beraet kommunale Pflegeangebote";
const summary = "Der Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an. Die Beratung betrifft Angebote in den Gemeinden.";
const raw = { title, url: "https://example.org/politik/pflege", publishedAt: "2026-09-10T21:00:00Z", content: summary };
const document = { ...D.toRawDocumentRow(raw), summary: null };
const html = (desc = summary) => `<link rel="canonical" href="${raw.url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">`;
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Originalmetadaten bleiben wortgetreu und an Artikel gebunden", () => {
    const r = E.fromHtml(document, { body: html(), finalUrl: raw.url });
    assert.equal(r.ok, true); assert.equal(r.summary, summary);
    assert.equal(E.fromHtml(document, { body: html(), finalUrl: raw.url + "/fremd" }).ok, false);
    assert.equal(E.fromHtml(document, { body: html().replace(raw.url, "https://example.org/anderes"), finalUrl: raw.url }).ok, false);
    assert.equal(E.fromHtml(document, { body: html().replace(title, "Neuigkeiten auf unserem Nachrichtenportal"), finalUrl: raw.url }).ok, false);
  });
  await test("Kein Volltextfallback, Titelduplikat, Logintext oder abgeschnittener Satz", () => {
    assert.equal(E.fromHtml(document, { body: `<title>${title}</title><main>${summary}</main>`, finalUrl: raw.url }).ok, false);
    assert.equal(E.excerpt(title, title), null);
    assert.equal(E.excerpt("Bitte aktivieren Sie JavaScript und akzeptieren Sie unsere Cookies fuer die Anzeige der vollstaendigen Inhalte.", title), null);
    assert.equal(E.excerpt("Wort ".repeat(80), title), null);
    assert.equal(E.excerpt(summary + " Ein langer Folgesatz " + "wiederholt ".repeat(50), title), summary);
    assert.equal(E.plain("Fachleute &amp; Kommunen &#x2013; &#252;ber &quot;Pflege&quot;"), 'Fachleute & Kommunen – über "Pflege"');
  });
  await test("Rohspiegel nur mit identischer Kennung, Titel und Publikationszeit", () => {
    assert.equal(E.fromMirror(document, [raw]).summary, summary);
    for (const patch of [{ url: raw.url + "/anderes" }, { publishedAt: "2026-09-09T21:00:00Z" }, { title: "Anderes Thema mit fremden Aussagen" }])
      assert.equal(E.fromMirror(document, [{ ...raw, ...patch }]).ok, false);
  });
  await test("Bedingtes Schreiben erhaelt Altmetadaten und bindet Identitaet", () => {
    const before = { ...document, raw: { erhalten: { wert: 7 } }, content_hash: "hash", canonical_url: raw.url };
    const after = G.plannedAfter(before, { ok: true, summary, origin: "artikel-metadaten" }, { tag: "2026-09-10" });
    assert.deepEqual(after.raw.erhalten, before.raw.erhalten);
    assert.equal(before.summary, null); assert.equal(after.summary, summary);
    for (const k of Object.keys(before).filter(k => !["raw", "summary"].includes(k))) assert.deepEqual(after[k], before[k]);
    const q = new URLSearchParams(G.casQuery(before));
    assert.equal(q.get("raw"), 'eq.{"erhalten":{"wert":7}}');
    assert.equal(q.get("summary"), "is.null"); assert.equal(q.get("url"), "eq." + raw.url);
    assert.equal(q.get("title"), "eq." + title); assert.equal(q.get("content_hash"), "eq.hash");
    assert.throws(() => G.plannedAfter({ ...before, summary: "bestehend" }, { ok: true, summary }, {}));
    assert.throws(() => G.casQuery({ ...before, raw: undefined }));
    assert.throws(() => G.plannedAfter({ ...before, raw: ["Altwert"] }, { ok: true, summary }, {}));
    const previous = { tag: "2026-09-09", status: "artikelabruf-nicht-bestaetigt" };
    const retry = G.plannedAfter({ ...before, raw: { ...before.raw, helmutQuellenkontext: previous } },
      { ok: true, summary }, { tag: "2026-09-10" });
    assert.deepEqual(retry.raw.helmutQuellenkontext.vorherigerVersuch, previous);
  });
  await test("Artikelziel sperrt lokale Adressen und Zugangsparameter", () => {
    for (const url of ["http://example.org/a", "https://127.0.0.1/a", "https://[::1]/a", "https://metadata.internal/a", "https://name:pass@example.org/a", "https://example.org:444/a"])
      assert.equal(G.publisherHost(url), null);
    assert.equal(G.publisherHost("https://www.example.org/a"), "example.org");
  });
  await test("Echter Crawler verweigert fremden Redirect vor zweiter Netzstelle", async () => {
    // Reiner Transportstub. Keine Verbindung, keine Erlaubnis des lokalen Guards.
    const https = require("node:https"), original = https.get;
    let calls = 0;
    https.get = (url, opts, callback) => {
      calls++;
      const req = new EventEmitter(); req.destroy = error => req.emit("error", error);
      queueMicrotask(() => callback({ statusCode: 302, headers: { location: "https://anderes.example.org/a" }, resume() {} }));
      return req;
    };
    try {
      await assert.rejects(require("../lib/helmut/crawler").fetchUrl(raw.url, 0, { allowedHost: "example.org", env: {} }), /quellenkontext-hostwechsel/);
      assert.equal(calls, 1);
    } finally { https.get = original; }
  });
  await test("Gesamtabbruch bleibt trotz Anbieterumschliessung wirksam", async () => {
    const https = require("node:https"), original = https.get;
    const provider = require("../lib/helmut/anbieter-steuerung");
    const reserve = provider.reserviere, melde = provider.melde;
    let destroyed = 0;
    https.get = () => {
      const req = new EventEmitter();
      req.destroy = error => { destroyed++; req.emit("error", error); req.emit("close"); };
      return req;
    };
    provider.reserviere = async () => ({ erlaubt: true }); provider.melde = async () => ({});
    try {
      const stop = new AbortController();
      const pending = require("../lib/helmut/crawler").fetchUrl(raw.url, 0,
        { allowedHost: "example.org", env: { HELMUT_ANBIETER_STEUERUNG: "on" }, abbruchSignal: stop.signal });
      setImmediate(() => stop.abort());
      await assert.rejects(pending, /Abgebrochen/); assert.equal(destroyed, 1);
    } finally { https.get = original; provider.reserviere = reserve; provider.melde = melde; }
  });
  console.log(`${pass}/${pass} Quellenpruefgruppen bestanden`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
