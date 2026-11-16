"use strict";
// Ausschliesslich synthetische HTTP-Streams; kein Server, Netz oder Speicherzugriff.
const assert = require("assert/strict");
const { EventEmitter } = require("events");
const { PassThrough } = require("stream");
const http = require("http"), https = require("https");
const crawler = require("../lib/helmut/crawler");
const steuerung = require("../lib/helmut/anbieter-steuerung");
const tests = [];
const test = (name, run) => tests.push({ name, run });
async function begrenzt(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Test wartet auf unaufgeloesten Abruf"), { code: "TEST_TIMEOUT" })), 500); })]); }
  finally { clearTimeout(timer); }
}
async function mitHttp(handler, run) {
  const originals = [http.get, http.request, https.get, https.request];
  const calls = [];
  function request(...args) {
    const callback = args.at(-1);
    const req = new EventEmitter();
    req.write = () => {}; req.end = () => {};
    req.destroy = error => { if (req.destroyed) return; req.destroyed = true; queueMicrotask(() => { if (error) req.emit("error", error); req.response?.destroy(error); req.emit("close"); }); };
    calls.push(args[0]);
    queueMicrotask(() => handler({ req, callback, calls, antwort(status = 200, headers = {}, prepare) {
      const res = new PassThrough(); res.statusCode = status; res.headers = headers; res.complete = false;
      req.response = res; if (prepare) prepare(res); callback(res); return res;
    } }));
    return req;
  }
  http.get = http.request = https.get = https.request = request;
  try { return await run(calls); }
  finally { [http.get, http.request, https.get, https.request] = originals; }
}
const direct = { id: "synthetisch-frist", name: "Synthetische Quelle", type: "news", active: true, url: "https://example.invalid/feed", crawlMethod: "rss" };
const xml = links => `<rss><channel>${links.map((link, i) => `<item><title>Synthetische Nachricht ${i}</title><link>${link}</link><pubDate>Mon, 16 Nov 2026 06:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`;

test("vorab", async () => {
  const controller = new AbortController(); controller.abort();
  const original = steuerung.reserviere; let reservations = 0;
  steuerung.reserviere = async () => { reservations++; return { erlaubt: true }; };
  try {
    await mitHttp(() => { throw new Error("Vorab-Abbruch hat HTTP gestartet"); }, async calls => {
      const deps = { abbruchSignal: controller.signal, env: { HELMUT_ANBIETER_STEUERUNG: "on" } };
      for (const invoke of [() => crawler.fetchUrl("https://example.invalid/", 0, deps), () => crawler.postForm("https://example.invalid/", "x=1", deps), () => crawler.fetchPardokText("https://example.invalid/", {}, 0, deps)]) {
        await assert.rejects(invoke());
      }
      assert.equal(calls.length, 0); assert.equal(reservations, 0);
    });
  } finally { steuerung.reserviere = original; }
});

test("transport", async () => {
  for (const phase of ["vor-header", "body", "truncated"]) {
    for (const kind of ["get", "post", "pardok"]) {
      const controller = new AbortController();
      await mitHttp(({ antwort }) => {
        if (phase === "vor-header") { controller.abort(); return; }
        const res = antwort(); res.write("<Dokument>unvollstaendig");
        if (phase === "body") controller.abort();
        else res.destroy();
      }, async calls => {
        const deps = { abbruchSignal: controller.signal, env: {} };
        const promise = kind === "get" ? crawler.fetchUrl("https://example.invalid/", 0, deps)
          : kind === "post" ? crawler.postForm("https://example.invalid/", "x=1", deps)
          : crawler.fetchPardokText("https://example.invalid/", {}, 0, deps);
        await assert.rejects(begrenzt(promise), error => error.code !== "TEST_TIMEOUT"); assert.equal(calls.length, 1);
      });
    }
  }
});

test("redirect", async () => {
  for (const kind of ["get", "pardok"]) {
    const controller = new AbortController();
    await mitHttp(({ antwort }) => {
      controller.abort();
      const res = antwort(302, { location: "/zweiter" }); res.complete = true; res.end();
    }, async calls => {
      const deps = { abbruchSignal: controller.signal, env: {} };
      await assert.rejects(begrenzt(kind === "get" ? crawler.fetchUrl("https://example.invalid/", 0, deps) : crawler.fetchPardokText("https://example.invalid/", {}, 0, deps)), error => error.code !== "TEST_TIMEOUT");
      assert.equal(calls.length, 1);
    });
  }
});

test("kein-fallback", async () => {
  const controller = new AbortController(); let calls = 0;
  const result = await crawler.crawlAllSources([{ ...direct, rssUrls: [direct.url, "https://example.invalid/feed2"] }], {
    abbruchSignal: controller.signal,
    fetchUrl: async (_url, _depth, deps) => { calls++; assert.equal(deps.abbruchSignal.aborted, false); controller.abort(); throw new Error("synthetisch abgebrochen"); }
  });
  assert.equal(calls, 1); assert.equal(result.results[0].ok, false);
});

test("retry-schlaf", async () => {
  const controller = new AbortController(); let calls = 0, sleeps = 0;
  const gate = { schedule: fn => fn(), isOpen: () => false, consumeRetry: () => true, report: () => {}, state: () => ({}) };
  const result = await crawler.crawlAllSources([{ ...direct, url: "https://news.google.com/rss/search?q=synthetisch" }], {
    abbruchSignal: controller.signal, googleGate: gate,
    sleep: async () => { sleeps++; controller.abort(); throw new Error("Schlaf abgebrochen"); },
    fetchUrl: async () => { calls++; const error = new Error("HTTP 503"); error.statusCode = 503; throw error; }
  });
  assert.equal(calls, 1); assert.equal(sleeps, 1); assert.equal(result.results[0].ok, false);
});

test("resolver-settlement", async () => {
  const controller = new AbortController(); let finished = 0, started = 0;
  const result = await crawler.crawlAllSources([direct], {
    abbruchSignal: controller.signal,
    fetchUrl: async (url, _depth, deps) => {
      assert.ok(deps.abbruchSignal);
      if (url === direct.url) return { body: xml(["https://news.google.com/articles/syntheticA", "https://news.google.com/articles/syntheticB"]), finalUrl: url };
      started++;
      return new Promise((_, reject) => {
        deps.abbruchSignal.addEventListener("abort", () => { setTimeout(() => { finished++; reject(new Error("Resolver abgebrochen")); }, url.endsWith("A") ? 0 : 35); }, { once: true });
        if (started === 2) controller.abort();
      });
    }
  });
  assert.equal(started, 2); assert.equal(finished, 2); assert.equal(result.results[0].ok, false);
});

test("person-bild", async () => {
  const controller = new AbortController(); let calls = 0;
  const result = await crawler.crawlAllSources([{ ...direct, type: "person", queryTerms: ["Synthetische"] }], {
    abbruchSignal: controller.signal,
    fetchUrl: async (url, _depth, deps) => {
      calls++; assert.ok(deps.abbruchSignal);
      if (calls === 1) return { body: xml(["https://example.invalid/artikel"]), finalUrl: url };
      controller.abort(); throw new Error("Bildabruf abgebrochen");
    }
  });
  assert.equal(calls, 2); assert.equal(result.results[0].ok, false);
});

test("lease-kombination", async () => {
  const originals = [steuerung.reserviere, steuerung.starteLeaseWache, steuerung.melde];
  try {
    for (const trigger of ["quelle", "lease"]) for (const kind of ["get", "post", "pardok"]) {
      const controller = new AbortController(), lease = new AbortController();
      const reason = Object.assign(new Error("quellenabruf-zeitbudget"), { code: "HELMUT_SOURCE_DEADLINE" });
      let ended = false, reported = false;
      steuerung.reserviere = async () => ({ erlaubt: true });
      steuerung.starteLeaseWache = () => ({ signal: lease.signal, verloren: () => trigger === "lease" && lease.signal.aborted, beenden: () => { ended = true; } });
      steuerung.melde = async ({ ok }) => { if (trigger === "quelle") assert.equal(ok, true, "Eigene Frist ist kein Anbieterfehler"); reported = true; };
      await mitHttp(({ antwort }) => { antwort().write("Teilantwort"); (trigger === "quelle" ? controller : lease).abort(reason); }, async calls => {
        const deps = { abbruchSignal: controller.signal, env: { HELMUT_ANBIETER_STEUERUNG: "on" } };
        const promise = kind === "get" ? crawler.fetchUrl("https://example.invalid/", 0, deps)
          : kind === "post" ? crawler.postForm("https://example.invalid/", "x=1", deps)
          : crawler.fetchPardokText("https://example.invalid/", {}, 0, deps);
        await assert.rejects(begrenzt(promise), error => trigger === "quelle" ? error === reason : error.anbieterVertagung?.grund === "klassen-lease-verloren");
        assert.equal(calls.length, 1); assert.equal(ended, true);
        assert.equal(reported, trigger === "quelle");
      });
    }
  } finally { [steuerung.reserviere, steuerung.starteLeaseWache, steuerung.melde] = originals; }
});

test("google-post-stopp", async () => {
  const controller = new AbortController(); let posts = 0;
  await mitHttp(({ antwort }) => { posts++; antwort().write("Teilantwort"); controller.abort(); }, async () => {
    await assert.rejects(crawler.resolveArticleUrl("https://news.google.com/articles/synthetisch", "", { abbruchSignal: controller.signal, fetchUrl: async url => ({ finalUrl: url, body: '<div data-n-a-id="synthetisch" data-n-a-ts="123" data-n-a-sg="sig"></div>' }) }));
    assert.equal(posts, 1);
  });
});

test("sonderweg-kombination", async () => {
  const adapter = require("../lib/helmut/sachsen-medienservice");
  const controller = new AbortController(); let calls = 0;
  const source = { ...direct, id: adapter.SOURCE_ID, url: adapter.SOURCE_URL, type: "government", crawlMethod: "structured_download" };
  const result = await crawler.crawlAllSources([source], {
    abbruchSignal: controller.signal,
    fetchUrl: async (_url, _depth, deps) => {
      calls++; assert.equal(deps.allowedHost, adapter.HOST);
      assert.ok(deps.abbruchSignal); assert.notEqual(deps.abbruchSignal, controller.signal, "Lokale Adapterfrist und Quellensignal sind kombiniert");
      return new Promise((_, reject) => { deps.abbruchSignal.addEventListener("abort", () => reject(deps.abbruchSignal.reason), { once: true }); controller.abort(); });
    }
  });
  assert.equal(calls, 1); assert.equal(result.results[0].ok, false);
});

test("absolute-frist-parser", async () => {
  // Die Uhr laeuft im synchronen RSS-Parser ab; der Abort-Timer konnte noch
  // nicht zugestellt werden. Danach darf keine Google-Aufloesung starten.
  const controller = new AbortController(); let now = 10, calls = 0;
  const herkunft = require("../lib/helmut/quellen-irights-text-herkunft");
  const original = herkunft.rssBeleg;
  herkunft.rssBeleg = (...args) => { const result = original(...args); now = 21; return result; };
  try {
    const result = await crawler.crawlAllSources([direct], {
      abbruchSignal: controller.signal, deadlineMs: 20, now: () => now,
      fetchUrl: async (url, _depth, deps) => {
        calls++; assert.equal(deps.deadlineMs, 20); assert.equal(deps.now(), 10);
        return { body: xml(["https://news.google.com/articles/syntheticClock"]), finalUrl: url };
      }
    });
    assert.equal(controller.signal.aborted, false, "Signal-Timer wurde bewusst nicht zugestellt");
    assert.equal(calls, 1); assert.equal(result.results[0].ok, false);
    assert.equal(result.results[0].error, "quellenabruf-zeitbudget");
  } finally { herkunft.rssBeleg = original; }
  // Dieselbe absolute Grenze gilt auch fuer direkte Netzwerkadapter ohne
  // zugestellten Timer und muss vor der Anbieterreservierung greifen.
  const originalReserve = steuerung.reserviere; let reservations = 0;
  steuerung.reserviere = async () => { reservations++; return { erlaubt: true }; };
  try {
    await mitHttp(() => { throw new Error("Abgelaufene absolute Frist hat HTTP gestartet"); }, async requests => {
      const deps = { abbruchSignal: controller.signal, deadlineMs: 20, now: () => now, env: { HELMUT_ANBIETER_STEUERUNG: "on" } };
      for (const invoke of [() => crawler.fetchUrl("https://example.invalid/", 0, deps), () => crawler.postForm("https://example.invalid/", "x=1", deps), () => crawler.fetchPardokText("https://example.invalid/", {}, 0, deps)]) {
        await assert.rejects(invoke(), error => error.code === "HELMUT_SOURCE_DEADLINE");
      }
      assert.equal(requests.length, 0); assert.equal(reservations, 0);
    });
  } finally { steuerung.reserviere = originalReserve; }
});

test("redirect-kind-settlement", async () => {
  for (const kind of ["get", "pardok"]) {
    let parent, finishChild, settled = false, childStarted;
    const ready = new Promise(resolve => { childStarted = resolve; });
    await mitHttp(({ antwort, calls }) => {
      if (calls.length === 1) { parent = antwort(302, { location: "/kind" }); return; }
      const child = antwort(); child.write("Kindantwort");
      finishChild = () => { child.complete = true; child.end(); };
      // Fehler des alten Redirect-Streams, waehrend dessen Kind noch arbeitet.
      parent.emit("aborted"); parent.destroy(); childStarted();
    }, async calls => {
      const controller = new AbortController();
      const deps = { abbruchSignal: controller.signal, env: {} };
      const work = kind === "get" ? crawler.fetchUrl("https://example.invalid/", 0, deps)
        : crawler.fetchPardokText("https://example.invalid/", {}, 0, deps);
      const observed = work.then(value => { settled = true; return value; }, error => { settled = true; throw error; });
      // Ablehnung sofort beobachten, damit auch der rote Nachweis keine
      // unbehandelte Promise-Ablehnung und keinen laufenden Kindabruf hinterlaesst.
      observed.catch(() => {});
      try {
        await begrenzt(ready);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(calls.length, 2);
        assert.equal(parent.destroyed, true, "Alter Redirect-Body ist entsorgt");
        assert.equal(settled, false, "Redirect-Elternfehler darf nicht vor laufendem Kind zurueckkehren");
      } finally {
        finishChild?.();
        await Promise.allSettled([observed]);
      }
      const result = await observed;
      assert.equal(result.body, "Kindantwort");
    });
  }
});

test("antwort-dispose", async () => {
  const nativeDestroy = res => {
    const original = res.destroy.bind(res);
    res.destroy = error => { if (!res.destroyed && !res.complete) res.emit("aborted"); return original(error); };
  };
  for (const kind of ["get", "post", "pardok"]) {
    let response;
    await mitHttp(({ antwort }) => { response = antwort(503, {}, nativeDestroy); }, async calls => {
      const deps = { env: {} };
      const work = kind === "get" ? crawler.fetchUrl("https://example.invalid/", 0, deps)
        : kind === "post" ? crawler.postForm("https://example.invalid/", "x=1", deps)
        : crawler.fetchPardokText("https://example.invalid/", {}, 0, deps);
      await assert.rejects(begrenzt(work), error => {
        assert.equal(response.destroyed, true, "Fehlerbody muss vor Rueckkehr entsorgt sein");
        assert.match(error.message, /HTTP 503/); return true;
      });
      assert.equal(calls.length, 1);
    });
  }
  // PARDOK beendet einen vollstaendigen Record absichtlich frueh. Das native
  // synchrone aborted-Ereignis beim Entsorgen darf diesen Erfolg nicht ueberholen.
  await mitHttp(({ antwort }) => { antwort(200, {}, nativeDestroy).write("<Dokument>x</Dokument>Rest"); }, async () => {
    const result = await crawler.fetchPardokText("https://example.invalid/", { maxRecords: 1 }, 0, { env: {} });
    assert.equal(result.truncated, true); assert.equal(result.body, "<Dokument>x</Dokument>");
  });
});

test("ohne-signal", async () => {
  await mitHttp(({ antwort }) => { const res = antwort(); res.complete = true; res.end("synthetisch vollstaendig"); }, async () => {
    assert.deepEqual(await crawler.fetchUrl("https://example.invalid/", 0, { env: {} }), { body: "synthetisch vollstaendig", finalUrl: "https://example.invalid/" });
    assert.deepEqual(await crawler.postForm("https://example.invalid/", "x=1", { env: {} }), { body: "synthetisch vollstaendig", finalUrl: "https://example.invalid/" });
    assert.deepEqual(await crawler.fetchPardokText("https://example.invalid/", {}, 0, { env: {} }), { body: "synthetisch vollstaendig", truncated: false, receivedBytes: Buffer.byteLength("synthetisch vollstaendig") });
  });
});

(async () => {
  const group = process.argv.find(arg => arg.startsWith("--gruppe="))?.split("=")[1];
  const selected = group ? tests.filter(t => t.name === group) : tests;
  assert.ok(selected.length, "Unbekannte Testgruppe");
  for (const { name, run } of selected) { await run(); console.log(`PASS crawler-quellenfrist ${name}`); }
  console.log(`${selected.length} neue Quellenfrist-Gruppen bestanden`);
})().catch(error => { console.error(error); process.exitCode = 1; });
