"use strict";

// Kein externes Netz: DNS, CONNECT, TLS und Artikelantwort werden injiziert.
// Der Entwurfsagent wird ausschliesslich im Test-HTTPS-Client angeschlossen;
// der produktive Crawler enthaelt KEINEN Proxy-Aufrufer.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { EventEmitter } = require("node:events"), Module = require("node:module");
const P = require("../lib/helmut/artikelkontext-proxy-entwurf"), B = require("../lib/helmut/artikelkontext-beschaffung");
const A = require("../lib/helmut/artikelkontext"), D = require("../lib/helmut/dedup"), U = require("../lib/helmut/understanding");
const tests = [], test = (name, fn) => tests.push([name, fn]);
const target = "https://example.org/politik/konferenz", proxyEnv = { HTTPS_PROXY: "http://proxy.internal:8080" };
function welt(opts = {}) {
  const dns = [], connects = [], tlsCalls = [], sockets = [], controller = new AbortController();
  let pendingDns, pendingConnect, pendingTls;
  const socket = () => { const s = new EventEmitter(); s.destroy = () => { s.destroyed = true; }; sockets.push(s); return s; };
  const deps = {
    lookup(host, options, cb) {
      dns.push({ host, options }); pendingDns = cb;
      if (!opts.hangDns) queueMicrotask(() => cb(opts.dnsError ? Error("ENOTFOUND") : null,
        opts.addresses || [{ address: "93.184.215.14", family: 4 }]));
    },
    http: { request(options) {
      connects.push(options); const req = socket();
      req.end = () => {
        pendingConnect = () => {
          if (opts.connectError) { req.emit("error", Error("Proxy untrusted detail")); return; }
          const tunnel = socket(); req.emit("connect", { statusCode: opts.status || 200 }, tunnel, opts.head || Buffer.alloc(0));
        };
        if (!opts.hangConnect) queueMicrotask(pendingConnect);
      };
      return req;
    } },
    tls: { connect(options) {
      tlsCalls.push(options); const secure = socket(); secure.authorized = !opts.unauthorized;
      pendingTls = () => secure.emit(opts.tlsError ? "error" : "secureConnect", ...(opts.tlsError ? [Error("bad certificate")] : []));
      if (!opts.hangTls) queueMicrotask(pendingTls);
      return secure;
    } }
  };
  deps.https = deps.http;
  function agent(url = target, env = proxyEnv) { return P.artikelAgent(url, controller.signal, env, deps); }
  function connect(a = agent(), options = {}) {
    return new Promise((resolve, reject) => a.createConnection({ host: new URL(target).hostname, port: 443, ...options },
      (error, secure) => error ? reject(error) : resolve(secure)));
  }
  return { deps, dns, connects, tlsCalls, sockets, controller, agent, connect,
    finishDns: () => pendingDns(null, [{ address: "93.184.215.14", family: 4 }]),
    finishConnect: () => pendingConnect(), finishTls: () => pendingTls() };
}
test("Ohne HTTPS-Proxy bleibt der bestehende Direktpfad unveraendert", () => {
  assert.equal(P.artikelAgent(target, undefined, {}), false);
  assert.equal(P.artikelAgent(target, undefined, { HTTP_PROXY: "http://proxy.internal:8080" }), false);
  assert.throws(() => P.artikelAgent(target, undefined, proxyEnv), /abbruchsignal-fehlt/);
  assert.throws(() => P.proxyFuer("example.org", { ALL_PROXY: "socks5://secret@proxy.internal" }), /verfahren-nicht-unterstuetzt/);
});
test("Geerbte Proxywahl und NO_PROXY bleiben host- und portgebunden", () => {
  const env = { ...proxyEnv, https_proxy: "https://lower.internal:8443" };
  assert.equal(P.proxyFuer("example.org", env).hostname, "lower.internal");
  assert.equal(P.proxyFuer("example.org", env).protocol, "https:");
  for (const NO_PROXY of ["*", "example.org", "example.org:443", ".example.org"]) assert.equal(P.proxyFuer("example.org", { ...env, NO_PROXY }), null);
  assert.equal(P.proxyFuer("sub.example.org", { ...env, NO_PROXY: "*.example.org" }), null);
  for (const NO_PROXY of ["fremd.org", "example.org:80", "*.example.org", "192.168.0.0/16", "[::1]"]) assert(P.proxyFuer("example.org", { ...env, NO_PROXY }));
  assert(P.proxyFuer("evil-example.org", { ...env, NO_PROXY: ".example.org" }));
  assert(P.proxyFuer("example.org", { ...env, no_proxy: "fremd.org", NO_PROXY: "*" }));
  assert.throws(() => P.proxyFuer("example.org", { ...env, NO_PROXY: "bad?entry" }), /ausnahmeregel-ungueltig/);
});
test("Ungueltige Proxyangaben bleiben feste Fehler ohne URL oder Zugangsdaten", () => {
  for (const HTTPS_PROXY of ["socks5://user:secret@proxy.internal", "http://proxy.internal/path", "http://proxy.internal?secret=x", "http://proxy.internal/#secret", "http://user:%0Asecret@proxy.internal", "http://proxy.internal\n"]) {
    assert.throws(() => P.proxyFuer("example.org", { HTTPS_PROXY }), error => /artikelkontext-proxy-konfiguration-ungueltig/.test(error.message) && !error.message.includes("secret"));
  }
});
test("DNS wird genau einmal vollstaendig geprueft; CONNECT bindet die IP, TLS den Originalhost", async () => {
  const w = welt(); await w.connect();
  assert.equal(w.dns.length, 1); assert.equal(w.dns[0].host, "example.org");
  assert.deepEqual(w.dns[0].options, { family: 4, all: true });
  assert.equal(w.connects.length, 1); const c = w.connects[0];
  assert.equal(c.hostname, "proxy.internal"); assert.equal(c.port, 8080); assert.equal(c.method, "CONNECT");
  assert.equal(c.path, "93.184.215.14:443"); assert.equal(c.headers.Host, c.path);
  assert.equal(c.agent, false); assert.equal(c.rejectUnauthorized, true);
  assert.equal(w.tlsCalls.length, 1); const t = w.tlsCalls[0];
  assert.equal(t.servername, "example.org"); assert.equal(t.rejectUnauthorized, true); assert(t.socket);
  assert.equal(t.checkServerIdentity("ignored.invalid", { subjectaltname: "DNS:example.org" }), undefined);
  assert(t.checkServerIdentity("example.org", { subjectaltname: "DNS:fremd.org" }) instanceof Error);
});
test("Private oder gemischte DNS-Antworten und DNS-Fehler erzeugen keinen Tunnel", async () => {
  for (const addresses of [[{ address: "127.0.0.1", family: 4 }], [{ address: "93.184.215.14", family: 4 }, { address: "169.254.169.254", family: 4 }], [], [{ address: "2001:4860::1", family: 6 }]]) {
    const w = welt({ addresses }); await assert.rejects(w.connect(), /dns-ziel-gesperrt/); assert.equal(w.connects.length, 0);
  }
  const w = welt({ dnsError: true }); await assert.rejects(w.connect(), /dns-nicht-erreichbar/); assert.equal(w.connects.length, 0);
});
test("Proxy-Authentifizierung bleibt ausschliesslich am Proxy-CONNECT", async () => {
  const w = welt(); await w.connect(w.agent(target, { HTTPS_PROXY: "https://test-user:test-pass@proxy.internal:8443" }));
  const c = w.connects[0]; assert.equal(c.protocol, "https:"); assert.equal(c.servername, "proxy.internal");
  assert.equal(c.headers["Proxy-Authorization"], "Basic " + Buffer.from("test-user:test-pass").toString("base64"));
  assert(!JSON.stringify(w.tlsCalls[0]).includes("test-pass"));
});
test("Proxyablehnung, Redirect und zusaetzliche Tunnelbytes haben keinen Fallback", async () => {
  for (const opts of [{ status: 403 }, { status: 407 }, { status: 302 }, { head: Buffer.from("untrusted") }, { connectError: true }]) {
    const w = welt(opts); await assert.rejects(w.connect(), /proxy-(connect-abgelehnt|verbindung-fehlgeschlagen)/);
    assert.equal(w.connects.length, 1); assert.equal(w.tlsCalls.length, 0); assert(w.sockets.every(s => s.destroyed));
  }
});
test("TLS-Fehler oder nicht autorisierte Verbindung liefern keinen Artikelsocket", async () => {
  for (const opts of [{ tlsError: true }, { unauthorized: true }]) {
    const w = welt(opts); await assert.rejects(w.connect(), /proxy-artikel-tls-fehlgeschlagen/);
    assert(w.sockets.every(s => s.destroyed)); assert.equal(w.connects.length, 1);
  }
});
test("Abbruch vor und waehrend DNS, CONNECT und TLS raeumt auf", async () => {
  const early = welt(); early.controller.abort(); await assert.rejects(early.connect(), /abruf-abgebrochen/); assert.equal(early.dns.length, 0);
  for (const opts of [{ hangDns: true }, { hangConnect: true }, { hangTls: true }]) {
    const w = welt(opts), pending = w.connect(); await new Promise(resolve => setImmediate(resolve));
    w.controller.abort(); await assert.rejects(pending, /abruf-abgebrochen/);
    if (opts.hangDns) { w.finishDns(); assert.equal(w.connects.length, 0); }
    if (opts.hangConnect) { w.finishConnect(); assert.equal(w.tlsCalls.length, 0); }
    if (opts.hangTls) w.finishTls();
    assert(w.sockets.every(s => s.destroyed));
  }
});
test("Agent kann weder Host noch Port wechseln oder eine zweite Verbindung erzeugen", async () => {
  for (const options of [{ host: "fremd.org" }, { port: 8443 }]) {
    const w = welt(); await assert.rejects(w.connect(w.agent(), options), /verbindungsbindung-abweichend/); assert.equal(w.dns.length, 0);
  }
  const w = welt(), agent = w.agent(); await w.connect(agent);
  await assert.rejects(w.connect(agent), /verbindungsbindung-abweichend/); assert.equal(w.connects.length, 1);
});

function crawlerWelt(url, body, opts = {}) {
  const w = welt(opts), sources = [], reservations = [], reports = [], filename = require.resolve("../lib/helmut/crawler");
  const fakeHttps = { get(actualUrl, requestOptions, callback) {
    assert.equal(requestOptions.agent, false);
    requestOptions.agent = P.artikelAgent(actualUrl, requestOptions.signal, proxyEnv, w.deps);
    const req = new EventEmitter(); req.destroy = error => { req.destroyed = true; if (error) req.emit("error", error); req.emit("close"); };
    sources.push({ actualUrl, requestOptions });
    queueMicrotask(() => requestOptions.agent.createConnection({ host: new URL(actualUrl).hostname, port: 443 }, (error) => {
      if (error) { req.emit("error", error); return; }
      const response = new EventEmitter(); response.headers = { "content-type": "text/html;charset=UTF-8" }; response.statusCode = 200; response.complete = true;
      response.destroy = () => req.destroy(); callback(response);
      response.emit("data", Buffer.from(body)); response.emit("end"); req.emit("close");
    })); return req;
  } };
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = name => name === "https" ? fakeHttps : original(name);
  mod._compile(fs.readFileSync(filename, "utf8"), filename);
  const env = { ...proxyEnv, HELMUT_ANBIETER_STEUERUNG: "on" }, abruf = {
    reserviere: async args => { reservations.push(args); return { verfuegbar: true, erlaubt: true }; },
    melde: async args => { reports.push(args); return { verfuegbar: true }; }
  };
  return { ...w, sources, reservations, reports, env, abruf, fetch: mod.exports.fetchUrl };
}
test("Nur im Test angeschlossener Entwurf: Crawler/Beleg-CAS/Modelleingabe erhalten die Radio-Probe", async () => {
  const url = "https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen";
  const body = fs.readFileSync(path.join(__dirname, "fixtures/inhaltsversorgung-20261108/radio-hannover.html"), "utf8");
  const doc = D.toRawDocumentRow({ title: "Sozialverband warnt vor Altersarmut in Niedersachsen - Radio Hannover", sourceName: "Radio Hannover",
    sourceId: "deklarierte-synthetik-radio", sourceType: "media", url, linkType: "direct", publishedAt: "2026-11-06T11:11:24Z", retrievedAt: "2026-11-07T04:00:52Z" });
  const w = crawlerWelt(url, body), rows = new Map();
  const speicher = B.erzeugeBelegspeicher({ storeId: "isolierte-proxyprobe", request: async (endpoint, options = {}) => {
    const q = new URL(endpoint, "https://offline.invalid").searchParams, id = q.get("id")?.slice(3);
    if (!options.method) return rows.has(id) ? [{ id, data: structuredClone(rows.get(id)) }] : [];
    const data = JSON.parse(options.body);
    if (options.method === "POST") { assert(!rows.has(data.id)); rows.set(data.id, structuredClone(data.data)); return [{ id: data.id }]; }
    assert.equal(options.method, "PATCH"); assert.equal(q.get("data->>versuchId"), "eq." + rows.get(id).versuchId);
    assert.equal(rows.get(id).zustand, "reserviert"); rows.set(id, structuredClone(data.data)); return [{ id }];
  } });
  const result = await B.beschaffeArtikelkontext(doc, { versuch: true, kontext: "einstieg" }, { speicher, env: w.env, abruf: w.abruf, fetchUrl: w.fetch });
  assert.equal(result.ok, true, result.reason); const beleg = A.pruefeArtikelkontext([doc], result.beleg);
  assert.equal(beleg.text.length, 727); assert(beleg.text.includes("Ab 2027 könnten die Leistungen deutlich gekürzt werden."));
  assert.equal(w.connects[0].path, "93.184.215.14:443"); assert.equal(w.tlsCalls[0].servername, "www.radio-hannover.de");
  assert.equal(w.sources[0].actualUrl, url); assert(!Object.keys(w.sources[0].requestOptions.headers).some(k => /authorization/i.test(k)));
  assert.equal(w.reservations.length, 1); assert.equal(w.reports.length, 1); assert.equal(doc.summary, null);
  const prompt = U.buildUnderstandingPrompt({ documents: [doc], headline: doc.title }, { artikelkontextVersuch: beleg });
  assert(prompt.includes(beleg.text));
  const prompts = [], vertrag = { reserviere: async () => ({ erlaubt: true, fencing: 1 }), modellstart: async () => ({ erlaubt: true }),
    schreibrecht: async () => ({ erlaubt: true }), speichere: async () => ({ gespeichert: true, pruefbar: true }), freigabe: async () => {},
    freigabeOhneAufruf: async () => {}, ausgangUnbekannt: async () => {}, vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {} };
  await U.runUnderstandingShadow([doc], { enabled: () => true, aiEnabled: () => true, acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
    getExisting: async () => null, findVorgangCandidates: async () => [], listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [] }),
    verstehenVertrag: () => vertrag, gateMode: () => "off", priorityEnabled: () => false, verstehenParallelitaet: 1,
    canSpend: async () => ({ allowed: true }), modelName: () => "deklarierte-attrappe", logSkip: () => {},
    artikelkontextVersorgung: async () => ({ angefordert: true, ok: true, beleg }),
    requestUnderstanding: async input => { prompts.push(input); return { headline: "Deklarierte Modellattrappe", was_ist_passiert: "Isolierter Test", warum_wichtig: "Isolierter Test",
      wer_ist_betroffen: "Isolierter Test", parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "mittel",
      handlungsempfehlung: "Isolierter Test", confidence_score: 70, display_title: "Isolierter Test", display_summary: "Isolierter Test" }; },
    save: async () => { throw Error("Unbedingtes Schreiben verboten"); }, saveSources: async () => {}, markFailed: async () => {}, savePending: async () => ({ saved: true }) });
  assert.equal(prompts.length, 1); assert(prompts[0].includes(beleg.text));
  const again = await B.beschaffeArtikelkontext(doc, { versuch: true, kontext: "einstieg" }, { speicher, erlaubeNeuenAbruf: () => "nur-bestand" });
  assert.equal(again.ok, true); assert.equal(w.sources.length, 1); assert.equal(w.connects.length, 1);
});
test("Nicht verfuegbarer Proxy bleibt gespeicherte Luecke ohne Wiederholungsabruf", async () => {
  const w = crawlerWelt(target, "kein Ersatzinhalt", { status: 403 });
  const doc = D.toRawDocumentRow({ title: "Deklarierte Quellenprobe", sourceName: "Testquelle", sourceId: "synthetik", url: target,
    linkType: "direct", publishedAt: "2026-11-06T12:00:00Z", retrievedAt: "2026-11-07T12:00:00Z" });
  let data = null;
  const speicher = { lesen: async () => data, reservieren: async (_, v) => { data = v; }, abschliessen: async (_, id, v) => { assert.equal(data.versuchId, id); data = v; } };
  const deps = { speicher, env: w.env, abruf: w.abruf, fetchUrl: w.fetch };
  const result = await B.beschaffeArtikelkontext(doc, { versuch: true, kontext: "einstieg" }, deps);
  assert.equal(result.ok, false); assert.equal(result.reason, "proxy-connect-abgelehnt"); assert.equal(data.zustand, "luecke"); assert(!data.beleg);
  assert.equal(w.reports.length, 1); assert.equal(w.reports[0].ok, false);
  await B.beschaffeArtikelkontext(doc, { versuch: true, kontext: "einstieg" }, deps);
  assert.equal(w.connects.length, 1); assert.equal(w.sources.length, 1); assert.equal(w.tlsCalls.length, 0);
});

(async () => { for (const [name, fn] of tests) { await fn(); console.log("PASS " + name); }
  console.log("PASS " + tests.length + " isolierte Proxy-Transportgruppen; 0 echte Quellen-/Modellaufrufe");
})().catch(error => { console.error(error); process.exitCode = 1; });
