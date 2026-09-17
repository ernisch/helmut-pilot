"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { beschaffeArtikelkontext: beschaffe, erzeugeBelegspeicher } = require("../lib/helmut/artikelkontext-beschaffung");
const U = require("../lib/helmut/understanding");
const doc = { id: "rd-synthetisch", title: "Bahnkonferenz: Neue Strecken nach Neustadt",
  summary: "Die Bahnkonferenz sollte neue Verbindungen ermoeglichen.",
  url: "https://example.org/politik/bahnkonferenz", canonical_url: "https://example.org/politik/bahnkonferenz",
  published_at: "2026-09-14T12:00:00Z", source_name: "Beispielmedium" };
const text = "Die Bahnkonferenz endete mit einer Erklaerung. Neue Strecken nach Neustadt sollen gemeinsam geplant werden.";
function antwort(d = doc, absatz = text) {
  const data = { "@type": "NewsArticle", headline: d.title, mainEntityOfPage: d.url, articleBody: d.summary + " " + absatz };
  return { finalUrl: d.url, body: `<html><head><link rel="canonical" href="${d.url}"><meta property="og:title" content="${d.title}">`
    + `<script type="application/ld+json">${JSON.stringify(data)}</script></head><body><article><p>${d.summary}</p><p>${absatz}</p></article></body></html>` };
}
function umgebung(options = {}) {
  const rows = new Map(), calls = [], network = [];
  let gets = 0;
  const request = async (endpoint, init = {}) => {
    const method = init.method || "GET", q = new URL(endpoint, "https://local.invalid").searchParams;
    calls.push({ method, endpoint, init });
    if (method === "GET") {
      gets++;
      if (options.lesefehler?.(gets)) throw new Error("Lesefehler");
      if (options.leseantwort) return options.leseantwort;
      const id = q.get("id").slice(3), data = rows.get(id);
      return data ? [{ id, data: structuredClone(data) }] : [];
    }
    const value = JSON.parse(init.body);
    assert(!endpoint.includes("on_conflict")); assert(!init.headers.Prefer.includes("merge"));
    if (method === "POST") {
      assert.equal(endpoint, "/rest/v1/helmut_store?select=id");
      if (rows.has(value.id)) throw new Error("23505 duplicate");
      if (!options.insertVerloren) rows.set(value.id, structuredClone(value.data));
      if (options.insertAntwortVerloren || options.insertVerloren) throw new Error("Antwort verloren");
      return [{ id: value.id }];
    }
    assert.equal(method, "PATCH");
    const id = q.get("id").slice(3), data = rows.get(id);
    assert.equal(q.get("data->>zustand"), "eq.reserviert");
    assert.equal(q.get("data->>versuchId"), "eq." + value.data.versuchId);
    assert(!endpoint.includes("or="));
    if (!options.abschlussVerloren && data?.zustand === "reserviert" && "eq." + data.versuchId === q.get("data->>versuchId")) {
      rows.set(id, structuredClone(options.abweichenderAbschluss ? { ...value.data, fremd: true } : value.data));
    }
    if (options.abschlussAntwortVerloren || options.abschlussVerloren) throw new Error("Antwort verloren");
    return [{ id }];
  };
  const speicher = erzeugeBelegspeicher({ request, storeId: "isoliert" });
  const deps = { speicher, env: { HELMUT_ANBIETER_STEUERUNG: "on" }, now: () => new Date("2026-09-17T16:00:00.000Z"),
    fetchUrl: async (...args) => { network.push(args); return options.fetch ? options.fetch(...args) : antwort(); } };
  return { rows, calls, network, deps, speicher };
}
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const run = (u, d = doc) => beschaffe(d, { versuch: true }, u.deps);

test("Ohne ausdruecklichen Versuch keinerlei Ablage oder Netz", async () => {
  const u = umgebung();
  assert.deepEqual(await beschaffe(doc, {}, u.deps), { ok: false, reason: "versuch-nicht-angefordert" });
  assert.deepEqual(await beschaffe(doc, Object.create({ versuch: true }), u.deps), { ok: false, reason: "versuch-nicht-angefordert" });
  assert.deepEqual(await beschaffe(doc, null, u.deps), { ok: false, reason: "versuch-nicht-angefordert" });
  assert.equal(u.calls.length, 0); assert.equal(u.network.length, 0);
});
test("Erster Abruf wird vor Netz bestaetigt und der ganze Beleg zurueckgelesen", async () => {
  const u = umgebung();
  u.deps.fetchUrl = async (url, depth, deps) => {
    assert.deepEqual(u.calls.map(c => c.method), ["GET", "POST", "GET"]);
    assert.equal([...u.rows.values()][0].zustand, "reserviert");
    assert.equal(url, doc.url); assert.equal(depth, 0); assert.equal(deps.artikelkontext, true); assert.equal(deps.allowedHost, "example.org");
    return { ...antwort(), gelesenAm: "1999-01-01T00:00:00Z" };
  };
  const before = structuredClone(doc), result = await run(u);
  assert.equal(result.ok, true); assert.equal(result.beleg.text, text);
  assert.equal(result.beleg.gelesenAm, "2026-09-17T16:00:00.000Z");
  assert.deepEqual(result.beleg, [...u.rows.values()][0].beleg);
  assert.deepEqual(u.calls.map(c => c.method), ["GET", "POST", "GET", "PATCH", "GET"]);
  assert.deepEqual(doc, before); assert(!JSON.stringify([...u.rows]).includes("<html>"));
});
test("Wiederaufnahme nutzt denselben Beleg und dieselbe Eingabe ohne neuen Abruf oder Schreibvorgang", async () => {
  const u = umgebung(), first = await run(u), calls = u.calls.length;
  u.deps.now = () => new Date("2027-01-01T00:00:00.000Z");
  u.deps.env = {}; // Bestaetigte Ablage darf auch ohne neuen Anbieteraufruf gelesen werden.
  const again = await run(u);
  assert.deepEqual(again, first); assert.equal(u.network.length, 1);
  assert.deepEqual(u.calls.slice(calls).map(c => c.method), ["GET"]);
  const c = { documents: [doc] }, plain = U.buildUnderstandingPrompt(c);
  const prompt = U.buildUnderstandingPrompt(c, { artikelkontextVersuch: again.beleg });
  assert.equal(prompt, U.buildUnderstandingPrompt(c, { artikelkontextVersuch: first.beleg }));
  const sources = p => p.split("\n").filter(l => l.startsWith('{"quelle_id":')).map(JSON.parse);
  const [{ artikelkontext, ...source }] = sources(prompt);
  assert.deepEqual([source], sources(plain)); assert.equal(artikelkontext.text, text);
  assert.equal(U.buildUnderstandingPrompt({ documents: [{ ...doc, artikelkontext: first.beleg }] }), plain);
});
test("Zwei gleichzeitige Aufrufer erzeugen hoechstens einen Abruf", async () => {
  const u = umgebung();
  const results = await Promise.all([run(u), run(u)]);
  assert.equal(u.network.length, 1); assert(results.some(r => r.ok));
  assert(results.every(r => r.ok || r.reason === "abruf-ausgang-offen"));
  assert.equal(u.rows.size, 1);
});
test("Verlorene Schreibantwort ist nur mit passendem persistierten Stand erfolgreich", async () => {
  for (const option of ["insertAntwortVerloren", "abschlussAntwortVerloren"]) {
    const u = umgebung({ [option]: true }); assert.equal((await run(u)).ok, true); assert.equal(u.network.length, 1);
  }
  const u = umgebung({ insertVerloren: true });
  assert.equal((await run(u)).reason, "reservierung-nicht-bestaetigt"); assert.equal(u.network.length, 0);
  for (const option of ["abschlussVerloren", "abweichenderAbschluss"]) {
    const x = umgebung({ [option]: true });
    assert.equal((await run(x)).reason, "abschluss-nicht-bestaetigt");
    assert.equal((await run(x)).ok, false); assert.equal(x.network.length, 1);
  }
});
test("Lesefehler vor oder nach Reservierung verhindern den Abruf", async () => {
  for (const n of [1, 2]) {
    const u = umgebung({ lesefehler: count => count === n }); assert.equal((await run(u)).ok, false); assert.equal(u.network.length, 0);
    if (n === 2) { assert.equal((await run(u)).reason, "abruf-ausgang-offen"); assert.equal(u.network.length, 0); }
  }
  const u = umgebung({ lesefehler: count => count === 3 });
  assert.equal((await run(u)).reason, "abschluss-nicht-bestaetigt");
  assert.equal((await run(u)).ok, true); assert.equal(u.network.length, 1);
});
test("Abbruch und fehlender Artikeltext bleiben dauerhafte benannte Luecken", async () => {
  for (const fetch of [async () => { throw new Error("artikelkontext-antwort-abgebrochen"); },
    async () => ({ body: "<html></html>", finalUrl: doc.url }),
    async () => { const e = new Error("Grenze"); e.anbieterVertagung = {}; throw e; }]) {
    const u = umgebung({ fetch }), first = await run(u);
    assert.equal(first.ok, false); assert.equal([...u.rows.values()][0].zustand, "luecke");
    assert.deepEqual(await run(u), first); assert.equal(u.network.length, 1);
  }
});
test("Unpassende Quelle und fehlende Anbietersteuerung werden vor Schreiben abgewiesen", async () => {
  for (const d of [{ ...doc, canonical_url: "https://example.org/fremd" }, { ...doc, url: "https://127.0.0.1/a" },
    { ...doc, url: "http://example.org/a" }, { ...doc, id: "" }]) {
    const u = umgebung(); assert.equal((await run(u, d)).reason, "quelle-nicht-gebunden"); assert.equal(u.calls.length, 0);
  }
  const u = umgebung(); u.deps.env = {};
  assert.equal((await run(u)).reason, "anbietersteuerung-nicht-aktiv"); assert.equal(u.network.length, 0);
  assert.deepEqual(u.calls.map(c => c.method), ["GET"]);
  assert.equal((await beschaffe(doc, { versuch: true }, { speicher: {} })).reason, "belegspeicher-nicht-verfuegbar");
});
test("Geaenderte Quelle hat eigene Bindung und Mutation waehrend Reservierung verschiebt den laufenden Abruf nicht", async () => {
  const u = umgebung(), d = structuredClone(doc);
  const original = u.speicher.reservieren;
  u.speicher.reservieren = async (...args) => { d.url = "https://other.example.org/anders"; d.summary = "Verschoben"; return original(...args); };
  assert.equal((await run(u, d)).ok, true); assert.equal(u.network[0][0], doc.url);
  u.speicher.reservieren = original;
  const changed = { ...doc, summary: doc.summary + " Neuer Stand." };
  u.deps.fetchUrl = async () => antwort(changed);
  const next = await run(u, changed); assert.equal(next.ok, true); assert.equal(u.rows.size, 2);
  assert.notEqual(next.beleg.quellenHash, [...u.rows.values()][0].beleg.quellenHash);
});
test("Manipulierte Ablage, falscher Quelltext Hash und ungueltige Leseantwort sind kein Gruen", async () => {
  for (const change of [d => ({ ...d, beleg: { ...d.beleg, text: "Verfaelscht" } }), d => ({ ...d, version: 7 }),
    d => ({ ...d, abgeschlossenAm: "2000-01-01T00:00:00.000Z" }), d => ({ ...d, schluessel: "a".repeat(64) })]) {
    const u = umgebung(); await run(u); const [id, data] = [...u.rows][0]; u.rows.set(id, change(data));
    assert.equal((await run(u)).reason, "belegstand-ungueltig"); assert.equal(u.network.length, 1);
  }
  for (const leseantwort of [{}, [{ id: "fremd", data: {} }], [{}, {}]]) {
    const u = umgebung({ leseantwort }); assert.equal((await run(u)).reason, "belegstand-nicht-lesbar"); assert.equal(u.network.length, 0);
  }
});
test("CAS Abschluss kann fremde Reservierung und fertigen Beleg nicht ueberschreiben", async () => {
  const u = umgebung(); await run(u); const [id, data] = [...u.rows][0], before = structuredClone(data);
  await u.speicher.abschliessen(data.schluessel, data.versuchId, { ...data, zustand: "luecke", reason: "fremd" });
  assert.deepEqual(u.rows.get(id), before);
  u.rows.set(id, { version: 1, schluessel: data.schluessel, versuchId: "00000000-0000-0000-0000-000000000000", zustand: "reserviert" });
  await u.speicher.abschliessen(data.schluessel, data.versuchId, data);
  assert.equal(u.rows.get(id).zustand, "reserviert");
  assert.throws(() => erzeugeBelegspeicher({ request: async () => [], storeId: "main-p-tenant" }), /konfiguration/);
  await assert.rejects(u.speicher.lesen("x&user_id=evil"), /schluessel/);
});
test("Keine Aktivierung in bestehenden Einstiegen und kein neuer Produktionsschalter", () => {
  const root = path.join(__dirname, "..");
  for (const file of ["server.js", "lib/helmut/understanding.js"]) {
    assert(!fs.readFileSync(path.join(root, file), "utf8").includes("beschaffeArtikelkontext"));
  }
  assert.equal(require("../vercel.json").git.deploymentEnabled["codex/artikelkontext-belegablage-20260917"], false);
});

(async () => { for (const [name, fn] of tests) { await fn(); console.log("PASS " + name); }
  console.log(`PASS ${tests.length} Gruppen zur bestaetigten Artikelkontextbeschaffung`);
})().catch(e => { console.error(e); process.exitCode = 1; });
