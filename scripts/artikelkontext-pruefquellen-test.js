"use strict";
// Gesicherte Originalfixtures; REST, Belegspeicher und Modelle bleiben isoliert.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const C = require("../lib/helmut/crawler"), D = require("../lib/helmut/dedup");
const A = require("../lib/helmut/artikelkontext"), G = require("../lib/helmut/artikelkontext-gewinnung");
const B = require("../lib/helmut/artikelkontext-beschaffung"), E = require("../lib/helmut/quellen-auszug");
const Q = require("../lib/helmut/lage-quellenbeleg"), T = require("../lib/helmut/lage-textqualitaet");
const F = require("../lib/helmut/briefing-aussagenbindung"), ai = require("../lib/helmut/ai");
const storage = require("../lib/helmut/storage");
const root = path.join(__dirname, "fixtures/inhaltsversorgung-20261108");
const date = "2026-11-08T08:00:00.000Z";
const feed = C.parseRssItems(fs.readFileSync(path.join(__dirname, "fixtures/quelleninhalt-20261107/dgb-google.xml"), "utf8"))[0];
const dgbUrl = "https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/dritte-tarifrunde-im-gebaeudereiniger-handwerk-endet-ohne-ergebnis/";
const dgb = { ...D.toRawDocumentRow(C.normalizeRawItem({ ...feed, url: dgbUrl, originalUrl: feed.url },
  { id: "dgb", name: "DGB", type: "association", url: "https://news.google.com/rss/search?q=site:dgb.de" })),
  source_name: "DGB", retrieved_at: "2026-11-07T04:00:00+00:00" };
const radio = { ...D.toRawDocumentRow({ title: "Sozialverband warnt vor Altersarmut in Niedersachsen - Radio Hannover",
  sourceName: "Radio Hannover", url: "https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen",
  publishedAt: "2026-11-06T11:11:24Z", linkType: "direct", sourceType: "media" }), retrieved_at: dgb.retrieved_at };
const env = { HELMUT_ARTIKELKONTEXT: "on", HELMUT_SUCHWEGAUSZUEGE_HOSTS: "www.dgb.de,www.radio-hannover.de" };
const key = (d, version = "artikelkontext-einstieg-v2") => crypto.createHash("sha256")
  .update(JSON.stringify([version, d.id, A.quellenstandHash(d)])).digest("hex");
function cached(d, file) {
  const result = G.gewinneArtikelEinstieg(d, { body: fs.readFileSync(path.join(root, file), "utf8"), finalUrl: d.url, gelesenAm: date });
  assert.equal(result.ok, true, result.reason);
  return { version: 1, schluessel: key(d), versuchId: "11111111-1111-4111-8111-111111111111", reserviertAm: date,
    abgeschlossenAm: date, zustand: "belegt", beleg: result.beleg };
}
let rows, reads, docs, requests, passed = 0;
const reset = () => { rows = new Map([[key(dgb), cached(dgb, "dgb-artikel.html")], [key(radio), cached(radio, "radio-hannover.html")]]); reads = 0; requests = []; docs = [dgb, radio]; };
const speicher = { lesen: async k => { reads++; return structuredClone(rows.get(k) ?? null); } };
const enrich = (documents, flags = env) => E.mitGespeichertemArtikelkontext(documents, { env: flags, speicher });
const vorgang = "vg-originalprobe", ko = { id: "ko-" + vorgang, vorgang_id: vorgang };
async function test(name, fn) { reset(); await fn(); passed++; console.log("PASS " + name); }
function selected(d, select) {
  // Entspricht dem tatsaechlichen Spaltenvertrag; kein implizites retrieved_at.
  const fields = select.match(/raw_documents(?:!inner)?\(([^()]*)\)/)[1];
  const out = {};
  for (const f of fields.split(",")) {
    const [alias, origin] = f.split(":");
    out[alias] = origin === "retrieved_at" ? d.retrieved_at : origin ? null : d[alias] ?? null;
  }
  return out;
}
async function transport(target, options = {}) {
  assert.equal(options.method || "GET", "GET", "Pruefquellen schreiben niemals");
  const url = new URL(target); assert.equal(url.origin, "http://127.0.0.1:9"); requests.push(url);
  const p = url.searchParams;
  if (url.pathname === "/rest/v1/helmut_store") {
    reads++; const id = p.get("id").slice(3), k = id.split("-artikelkontext-")[1];
    return new Response(JSON.stringify(rows.has(k) ? [{ id, data: rows.get(k) }] : []));
  }
  const projection = docs.map(d => ({ raw_document_id: d.id, knowledge_object_id: ko.id,
    raw_documents: selected(d, p.get("select")) }));
  if (url.pathname === "/rest/v1/knowledge_objects")
    return new Response(JSON.stringify([{ ...ko, ko_document_links: projection }]));
  assert.equal(url.pathname, "/rest/v1/ko_document_links");
  assert.equal(p.get("knowledge_object_id"), "eq." + ko.id);
  const ids = p.get("raw_document_id");
  return new Response(JSON.stringify(ids ? projection.filter(r => JSON.parse("[" + ids.slice(4, -1) + "]").includes(r.raw_document_id)) : projection));
}
(async () => {
  await test("Vollstaendiger DGB-Artikel erreicht Lage und Briefing samt fuenftem Absatz; Altcache bleibt ohne Neuabruf", async () => {
    const old = rows.get(key(dgb));
    const verboten = () => { throw new Error("Kein neuer Originalversuch fuer Altcache"); };
    const bestand = await B.beschaffeArtikelkontext(dgb, { versuch: true, kontext: "einstieg" },
      { speicher: { ...speicher, reservieren: verboten, abschliessen: verboten }, fetchUrl: verboten });
    assert.equal(bestand.ok, true); assert.equal(bestand.beleg.gewinnung.verfahren, "artikel-einstieg-v2");
    assert.equal(bestand.beleg.gewinnung.absaetze.length, 4);
    assert.equal(bestand.beleg.gewinnung.artikelAbsatzZahl, 5, "Altcache bleibt erkennbar begrenzt");
    const full = G.gewinneArtikeltext(dgb, { body: fs.readFileSync(path.join(root, "dgb-artikel.html"), "utf8"), finalUrl: dgb.url, gelesenAm: date });
    assert.equal(full.ok, true, full.reason); assert(full.beleg.text.length > 1400);
    rows.set(key(dgb), { ...old, beleg: full.beleg });
    const projected = (await enrich([dgb]))[0];
    const lage = Q.baueEingabe([ko], { [vorgang]: [projected] }, new Date(date));
    const briefing = F.quellenVertrag({ [vorgang]: [projected] });
    assert.equal(lage[0].quellenbelege[0].auszug, full.beleg.text);
    assert.equal(briefing[0].auszug, full.beleg.text);
    assert(briefing[0].auszug.includes("700.000 Menschen"));
    assert(briefing[0].auszug.includes("500.000 von ihnen"));
    assert.equal(lage[0].quellenbelege[0].artikelkontext.textHash, full.beleg.textHash);
    assert.notEqual(Q.hashEingabe(lage), Q.hashEingabe(Q.baueEingabe([ko], { [vorgang]: [{ ...projected,
      summary: old.beleg.text, artikelkontext: { beleg: old.beleg, auszugVorher: null } }] }, new Date(date))));
    assert.throws(() => Q.baueEingabe([ko], { [vorgang]: [{ ...projected, summary: old.beleg.text }] }, new Date(date)), /leseprojektion/);
    assert.equal(Q.MAX_EINGABE_ZEICHEN, 16000); assert.equal(Q.MAX_BELEGE, 6);
  });
  await test("Originalfixtures behalten ihre vorhandenen SHA256", () => {
    for (const entry of JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")))
      assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, entry.file))).digest("hex"), entry.fixture_sha256);
  });
  await test("Flag aus oder Host nicht exakt freigegeben verursacht null Belegreads", async () => {
    for (const flags of [{}, { ...env, HELMUT_ARTIKELKONTEXT: "off" }, { ...env, HELMUT_SUCHWEGAUSZUEGE_HOSTS: "dgb.de" },
      { ...env, HELMUT_SUCHWEGAUSZUEGE_HOSTS: "*.dgb.de" }]) assert.equal((await enrich([dgb], flags))[0].summary, null);
    assert.equal(reads, 0);
  });
  await test("Ganze1256/727Zeichen erreichen Lage-Generator, Pruefprompt und Briefingvertrag", async () => {
    const before = structuredClone(docs), result = await enrich(docs);
    assert.deepEqual(docs, before);
    for (let i = 0; i < result.length; i++) {
      const expected = rows.get(key(docs[i])).beleg;
      assert.equal(result[i].summary, expected.text); assert.equal(result[i].summary.length, i ? 727 : 1256);
      assert.equal(E.artikelkontextHerkunft(result[i]).quellenHash, A.quellenstandHash(docs[i]));
      assert.equal(E.geleseneQuelle(result[i]).summary, expected.text);
    }
    const quellen = { [vorgang]: result }, input = Q.baueEingabe([ko], quellen, new Date(date));
    const brief = F.quellenVertrag(quellen);
    for (const d of result) {
      assert.equal(input[0].quellenbelege.find(q => q.titel === d.title).auszug, d.summary);
      assert.equal(brief.find(q => q.documentId === d.id).auszug, d.summary);
      assert(ai.buildLageBriefingPrompt(input).includes(d.summary));
      assert(T.prompt(input[0].quellenbelege.map(q => ({ quelle_id: q.quelle_id, vorgang_ids: [vorgang], text: "Synthetischer Entwurf" })), input, {}).includes(d.summary));
    }
    assert.equal(require("../lib/helmut/lage-kartenbeleg").begrenze({ displaySummary: "Synthetischer Entwurf" }, result).displaySummary, "Synthetischer Entwurf");
    assert.equal(require("../lib/helmut/briefing-quellenqualitaet").quellengebunden({ display_summary: "Synthetischer Entwurf" }, [result[0]]), true);
  });
  await test("Fehlender,reservierter,Luecken-,vergifteter Bestand bleibt ohne Schreib-/Abrufmoeglichkeit", async () => {
    const good = rows.get(key(dgb));
    for (const value of [null, { ...good, zustand: "reserviert" }, { ...good, zustand: "luecke", reason: "http-status" },
      { ...good, beleg: { ...good.beleg, text: "Erfundener Text" } }, { ...good, schluessel: "f".repeat(64) }]) {
      rows.clear(); if (value) rows.set(key(dgb), value);
      assert.equal((await enrich([dgb]))[0].summary, null);
    }
    assert.equal((await B.leseArtikelkontext(dgb, { speicher })).ok, false);
  });
  await test("Titel,Datum,Herausgeber,Abrufzeit,Auszug und Canonicaldrift nutzen keinen fremden Beleg", async () => {
    for (const changed of [{ title: dgb.title + " fremd" }, { published_at: "2026-11-05T09:26:29Z" }, { source_name: "Andere Quelle" },
      { retrieved_at: "2026-11-08T04:00:00+00:00" }, { summary: "Abweichung" }, { canonical_url: dgb.url + "fremd" }]) {
      const altered = { ...dgb, ...changed };
      assert.equal((await enrich([altered]))[0].artikelkontext, undefined);
    }
    const out = await enrich([dgb, { ...dgb, canonical_url: dgb.url + "fremd" }]);
    assert(out[0].artikelkontext); assert.equal(out[1].artikelkontext, undefined);
  });
  await test("Aktuelle Quellensperre verwirft auch fertigen Cache", async () => {
    const safety = require("../lib/helmut/sourceSafety"), old = safety.assessLink;
    try { safety.assessLink = () => ({ blocked: true }); assert.equal((await enrich([dgb]))[0].summary, null); }
    finally { safety.assessLink = old; }
  });
  await test("RSS und alte Auszugsmarkierung bleiben korrekt; Originalbeleg wird niemals erneut auf240gekuerzt", async () => {
    const rss = { ...dgb, summary: "Die Gewerkschaft fordert einen höheren Mindestlohn für alle Beschäftigten in der Branche." };
    assert.equal((await enrich([rss]))[0].summary, rss.summary); assert.equal(reads, 0);
    const marked = { ...dgb, quellenauszug_beleg: { status: "ergaenzt" } };
    const out = (await enrich([marked]))[0]; assert.equal(out.summary.length, 1256); assert.equal(E.geleseneQuelle(out).summary.length, 1256);
  });
  await test("Alte240Zeichen-Projektion trifft denselben kanonischen Cache wie Understanding", async () => {
    const raw = { ...dgb, summary: "Offener Wortrest ".repeat(20).slice(0, 240), quellenauszug_beleg: null };
    assert.equal(E.geleseneQuelle(raw).summary, null);
    const projected = (await enrich([raw]))[0];
    assert.equal(projected.summary.length, 1256);
    assert.equal(E.artikelkontextHerkunft(projected).quellenHash, A.quellenstandHash(dgb));
    assert.equal(raw.summary.length, 240);
  });
  await test("Doppelte Quellen einmal je Leseaufruf, vorhandene Parallelitaet hoechstens8", async () => {
    await enrich([dgb, structuredClone(dgb), radio, structuredClone(radio)]); assert.equal(reads, 4);
    let active = 0, max = 0;
    await E.mitGespeichertemArtikelkontext(Array.from({ length: 20 }, (_, i) => ({ ...dgb, id: "rd-" + i })),
      { env, speicher: { lesen: async () => { active++; max = Math.max(max, active); await new Promise(resolve => setImmediate(resolve)); active--; return null; } } });
    assert(max <= 8);
  });
  await test("Quellenstandwechsel mit gleichem Text entwertet Lage-/Briefinghash; Lesezeit macht Quelle nicht frisch", async () => {
    const first = (await enrich([dgb]))[0];
    const changed = { ...dgb, retrieved_at: "2026-11-08T04:00:00+00:00" };
    rows.set(key(changed), cached(changed, "dgb-artikel.html"));
    const second = (await enrich([changed]))[0]; assert.equal(first.summary, second.summary);
    const input = d => Q.baueEingabe([ko], { [vorgang]: [d] }, new Date(date));
    assert.notEqual(Q.hashEingabe(input(first)), Q.hashEingabe(input(second)));
    assert.notDeepEqual(F.quellenVertrag({ [vorgang]: [first] }), F.quellenVertrag({ [vorgang]: [second] }));
    assert.deepEqual(Q.baueEingabe([ko], { [vorgang]: [first] }, new Date("2026-12-01T08:00:00Z")), []);
    assert.throws(() => input({ ...first, summary: first.summary + " erfunden" }), /leseprojektion/);
  });
  const previous = { fetch: global.fetch, env: Object.fromEntries(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_V3_STORE", "HELMUT_STORAGE_BACKEND", ...Object.keys(env)].map(k => [k, process.env[k]])) };
  Object.assign(process.env, env, { SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "lokale-attrappe", HELMUT_V3_STORE: "on", HELMUT_STORAGE_BACKEND: "supabase" });
  global.fetch = transport;
  try {
    await test("Echte drei REST-Quellenleser liefern identischen Originalhash/Text ohne Rohdatenwrite", async () => {
      const one = await storage.getSourcesForVorgang(vorgang);
      assert.equal(one.length, 2); assert(one.every(d => d.artikelkontext));
      const batch = (await storage.getPruefSourcesByVorgaenge([ko]))[vorgang];
      assert.deepEqual(batch, one);
      const bound = await storage.getSourcesForVorgang(vorgang, { lageKoId: ko.id, lageQuellen: one });
      assert.deepEqual(bound, one);
      for (const d of one) assert.equal(d.artikelkontext.beleg.quellenHash, A.quellenstandHash(docs.find(x => x.id === d.id)));
      assert(requests.filter(u => u.pathname !== "/rest/v1/helmut_store").every(u => u.searchParams.get("select").includes("summary,retrieved_at,")));
      assert(docs.every(d => d.summary === null));
    });
    await test("Gebundener Lage-Reread verwirft inzwischen verschwundenen oder geaenderten Beleg", async () => {
      const before = await storage.getSourcesForVorgang(vorgang);
      rows.delete(key(dgb));
      await assert.rejects(() => storage.getSourcesForVorgang(vorgang, { lageKoId: ko.id, lageQuellen: before }), /lage-quellenbindung/);
      const changed = cached(dgb, "dgb-artikel.html"); changed.beleg.gelesenAm = "2026-11-08T08:01:00.000Z"; changed.abgeschlossenAm = changed.beleg.gelesenAm;
      rows.set(key(dgb), changed);
      await assert.rejects(() => storage.getSourcesForVorgang(vorgang, { lageKoId: ko.id, lageQuellen: before }), /lage-quellenbindung/);
    });
  } finally { global.fetch = previous.fetch; for (const [k, v] of Object.entries(previous.env)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  console.log(`${passed}/${passed} Pruefgruppen bestanden`);
})().catch(error => { console.error(error); process.exitCode = 1; });
