"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const R = require("../lib/helmut/quellen-destatis-rss-stand"), C = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup"), G = require("../lib/helmut/quellenarchitektur/dedup-global");
const H = require("../lib/helmut/quellen-hinweis"), V = require("../lib/helmut/roh-quellenstaende");
const source = require("../lib/helmut/quellenarchitektur/seeds/fach-parteiquellen").ZUSAETZLICHE_QUELLEN.find(s => s.id === R.SOURCE_ID);
// Ein einzelner oeffentlicher RSS-Eintrag aus dem am17Nov gesicherten Primaerfeed,
// SHA256 3b9ce21c99c55a373e8f8080d58cbfc2786a41b2224f767df42709c9e1e0ee31.
// Keine Vollfeed-, Profil-, HTML- oder Modelldaten.
const item = { title: "Energieverbrauch der Industrie 2025 um 2,9 % gesunken",
  url: "https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/11/PD26_400_435.html",
  publishedAt: "Mon, 16 Nov 2026 08:00:00 +0100", rssRights: ["Statistisches Bundesamt, Wiesbaden 2019"],
  content: "Die deutsche Industrie hat im Jahr 2025 insgesamt 3 248 Petajoule Energie verbraucht. Wie das Statistische Bundesamt (Destatis) mitteilt, waren das 2,9 % weniger Energie als im Vorjahr. Zuvor war der Energieverbrauch im Jahr 2024 (+1,9 %) nach zwei Jahren mit starken Rückgängen (2022: -9,1 %, 2023: -7,8 %) angestiegen. Ein Auslöser für den erneuten Rückgang im Jahr 2025 waren hohe Energiepreise und damit einhergehende Produktionsrückgänge insbesondere in der energieintensiven Industrie." };
const clone = x => structuredClone(x), md5 = x => crypto.createHash("md5").update(x).digest("hex");
let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const normalized = C.normalizeRawItem(item, source), row = D.toRawDocumentRow(normalized);
const google = { ...normalized, sourceId: "news-destatis-soziales", sourceName: "Statistisches Bundesamt",
  title: item.title + " - Statistisches Bundesamt", publishedAt: "2026-11-16T07:02:04Z", content: item.title, excerpt: item.title,
  parlamentsdatenHerkunft: undefined };
const old = D.toRawDocumentRow(google), before = JSON.stringify({ google, normalized, row });
test("Echter320Zeichen-Auszug bleibt mit07:00UTC unverkuerzt und eigener Kennung erhalten", () => {
  assert(R.policyActive()); assert.equal(normalized.content.length, 320);
  assert.equal(md5(normalized.content), "9e466e1988c44ba6583d7cc74f8a1d35");
  assert.equal(row.summary, normalized.content); assert.equal(row.published_at, "2026-11-16T07:00:00.000Z");
  assert.equal(row.id, "rd-" + R.read(row).standHash); assert.notEqual(row.id, old.id);
  assert.equal(old.published_at, "2026-11-16T07:02:04Z"); assert.equal(old.summary, null);
  assert.equal(row.imageUrl, undefined); assert.equal(normalized.imageUrl, null);
});
test("JSONB-Reihenfolge und SQL-Zeitdarstellung aendern die gepruefte Identitaet nicht", () => {
  const sql = clone(row); sql.published_at = "2026-11-16T07:00:00+00:00";
  sql.raw.parlamentsdatenHerkunft = Object.fromEntries(Object.entries(sql.raw.parlamentsdatenHerkunft).reverse());
  assert.equal(D.contentHash(sql), row.content_hash); assert.equal(D.sourceExcerpt(sql), row.summary);
  assert.equal(D.toRawDocumentRow(sql).id, row.id);
});
test("Titel/Link/echtesDatum/Text/Scope/Rechte/Identitaet sind nicht austauschbar", () => {
  for (const change of [x => x.summary += " Fremdtext.", x => x.title += " Fremdtitel", x => x.published_at = old.published_at,
    x => x.url = x.url.replace("destatis.de", "fremd.de"), x => x.canonical_url += "?tracking=1",
    x => x.source_id = google.sourceId, x => x.source_name = "Fremder Herausgeber", x => x.id = old.id,
    x => x.source_type = "media", x => x.raw.retrievalPathId = "rp-fremd",
    x => x.raw.parlamentsdatenHerkunft.sourceId = "fremde-quelle", x => x.raw.parlamentsdatenHerkunft.feedUrl += "?fremd",
    x => x.raw.parlamentsdatenHerkunft.scope = "full_text", x => x.raw.parlamentsdatenHerkunft.rights = ["Nur privat"],
    x => x.raw.parlamentsdatenHerkunft.excerptHash = "f".repeat(64)]) {
    const bad = clone(row); change(bad);
    assert.throws(() => D.contentHash(bad), /destatis-rss-stand-ungueltig/);
    assert.throws(() => D.toRawDocumentRow(bad), /destatis-rss-stand-ungueltig/);
  }
  const double = { ...clone(normalized), raw: { parlamentsdatenHerkunft: { ...R.read(normalized), scope: "full_text" } } };
  assert.throws(() => R.read(double), /destatis/);
});
test("Einzelrechte sperren Text; Metadaten und fremde Feeds bekommen keinen eigenen Stand", () => {
  for (const rssRights of [["Nur privat"], ["CC BY-NC"], ["Statistisches Bundesamt, Wiesbaden 2019", "All rights reserved"]]) {
    const value = C.normalizeRawItem({ ...item, rssRights }, source);
    assert.equal(value.content, item.title); assert.equal(R.claimed(value), false);
    assert.equal(D.toRawDocumentRow(value).summary, null);
  }
  assert.equal(R.build({ ...source, url: R.FEED_URL + "?fremd" }, item), null);
  assert.equal(R.build({ ...source, crawlMethod: "html" }, item), null);
  for (const patch of [{ publishedAt: null }, { url: "https://www.destatis.de/DE/Service/Impressum/_inhalt.html" },
    { content: item.title }, { content: "Nur für private Nutzung: " + item.content }])
    assert.equal(R.build(source, { ...item, ...patch }), null);
  const other = C.normalizeRawItem(item, { ...source, id: "andere-quelle" });
  assert.equal(R.claimed(other), false); assert.equal(D.contentHash(other), D.contentHash(google));
});
test("Native und globale Dedup behalten Google und amtlichen Stand in beiden Reihenfolgen", () => {
  for (const items of [[google, normalized], [normalized, google]]) {
    assert.equal(D.dedupeRawDocuments(items.map(D.toRawDocumentRow)).length, 2);
    const p = G.planDedupWrites(items);
    assert.equal(p.persists.length, 2);
    const official = p.persists.find(d => d.id === row.id);
    assert(official); assert.equal(official.published_at, row.published_at);
    assert.equal(official.summary, row.summary); assert.equal(official.primary_source_id, R.SOURCE_ID);
    assert(p.findings.some(f => f.raw_document_id === row.id && f.source_id === R.SOURCE_ID));
    assert.notEqual(p.findings.find(f => f.source_id === google.sourceId).raw_document_id, row.id);
  }
  const p = G.planDedupWrites([normalized], [{ id: old.id, canonical_target_url: old.canonical_url }]);
  assert.equal(p.persists.length, 1); assert.equal(p.persists[0].id, row.id);
  const back = G.planDedupWrites([google], [{ ...row, canonical_target_url: row.canonical_url }]);
  assert.equal(back.persists.length, 1); assert.notEqual(back.persists[0].id, row.id);
});
test("Bestehender NativeRaw-/DTO-Kanal traegt vollstaendige Attribution ohne neue Lizenz", () => {
  const sql = JSON.parse(JSON.stringify(row)), notice = H.quellenhinweisFelder(sql, sql.canonical_url).sourceNotice;
  assert(notice.text.includes("Statistisches Bundesamt (Destatis)")); assert(notice.text.includes(row.published_at));
  assert.equal(notice.licenseUrl, "https://www.destatis.de/DE/Service/Impressum/_inhalt.html");
  assert.equal(notice.originalUrl, item.url); assert.equal(notice.scope, "licensed_rss_excerpt");
  assert(notice.changes.includes("RSS")); assert(!notice.text.includes("CC BY"));
  assert.deepEqual(H.quellenhinweisFelder(sql, item.url + "?fremd=1"), {});
  assert.equal(H.leseHerkunft(sql).excerptHash, R.read(normalized).excerptHash);
  const E = require("../lib/helmut/quellen-auszug");
  assert.deepEqual(E.fromHtml(sql, { finalUrl: item.url, body: "<article>Unbestellter Volltext</article>" }),
    { ok: false, reason: "quelle-nur-metadaten" });
  assert.deepEqual(E.fromMirror(sql, [normalized]), { ok: false, reason: "quelle-nur-metadaten" });
  const B = require("../lib/helmut/briefingContract"), L = require("../lib/helmut/lage"), S = require("../lib/helmut/radarState");
  for (const stored of [row, G.planDedupWrites([normalized]).persists[0]]) {
    const doc = JSON.parse(JSON.stringify(stored));
    for (const dto of [L.mapSource(doc), B.buildSources({}, [doc])[0], S.pickPrimarySource({}, [doc]), B.oeffnendeHelmutQuelle({}, [doc])]) {
      assert.equal(dto.sourceNotice.originalUrl, item.url); assert.equal(dto.sourceNotice.text, notice.text);
      assert.equal(dto.sourceNotice.articleUrl, dto.url);
    }
    const nativeAlias = { ...doc, parlamentsdatenHerkunft: doc.raw.parlamentsdatenHerkunft,
      quellenauszug_beleg: null };
    delete nativeAlias.raw;
    const reread = require("../lib/helmut/quellen-auszug").geleseneQuelle(nativeAlias);
    assert.equal(reread.summary, row.summary); assert.equal(D.contentHash(reread), row.content_hash);
    const sources = B.buildSources({}, [old, doc]);
    assert.equal(sources.length, 2); assert.equal(sources[1].publishedAt, row.published_at);
    assert.equal(sources[1].summary, row.summary); assert.equal(sources[0].publishedAt, old.published_at);
  }
});
test("Vorliegendes Archiv kann nur mit exaktem RSS-/Finding-Beleg rein neu gebunden werden", () => {
  const historical = { ...clone(row), id: old.id, content_hash: old.content_hash, raw: { sourcePriority: 80, originalUrl: null } };
  const stand = V.standHash(historical);
  const record = { id: `main-rohstand-${old.id.slice(3)}-${stand}`, data: { version: 1, quellenHash: stand, dokument: historical } };
  const finding = { raw_document_id: historical.id, source_id: R.SOURCE_ID, retrieval_path_id: "rp-" + R.SOURCE_ID,
    original_url: item.url, found_at: "2026-11-17T03:15:44Z" };
  const args = { source, finding, item }, untouched = JSON.stringify({ record, args });
  const result = R.fromArchive(record, args); assert(result);
  assert.equal(D.toRawDocumentRow(result).id, row.id); assert.equal(D.toRawDocumentRow(result).summary, row.summary);
  assert.equal(JSON.stringify({ record, args }), untouched);
  for (const change of [x => x.record.data.dokument.summary += " Manipuliert.", x => x.record.id += "f",
    x => x.args.finding.source_id = "news-destatis-soziales", x => x.args.finding.retrieval_path_id = "rp-fremd",
    x => x.args.finding.original_url += "?fremd", x => x.args.item.publishedAt = old.published_at,
    x => x.args.item.rssRights = ["Nur privat"], x => x.args.item.content = item.content.replace("3 248", "9 999")]) {
    const x = clone({ record, args }); change(x); assert.equal(R.fromArchive(x.record, x.args), null);
  }
  assert.equal(R.fromArchive(record, { source, finding }), null);
});
test("Keine Eingabe, Altzeile oder alte Herkunft wird veraendert", () => {
  assert.equal(JSON.stringify({ google, normalized, row }), before);
  assert.equal(R.read(old), null); assert.equal(H.leseHerkunft(old), null);
});
test("Echter globaler Speicheraufrufer und nativer Queue-/Archivleser erhalten beide Identitaeten", async () => {
  const storage = require("../lib/helmut/storage"), keys = ["HELMUT_V3_STORE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_QUELLEN_ARBEITSFENSTER"];
  const env = Object.fromEntries(keys.map(k => [k, process.env[k]])), actualFetch = global.fetch;
  const documents = new Map([[old.id, { ...clone(old), canonical_target_url: old.canonical_url }]]), archive = new Map();
  const previous = JSON.stringify(documents.get(old.id)), writes = [];
  const projection = () => [...documents.values()].map(d => ({ id: d.id,
    content_fingerprint: d.content_fingerprint ?? null, canonical_target_url: d.canonical_target_url ?? null }));
  Object.assign(process.env, { HELMUT_V3_STORE: "on", SUPABASE_URL: "http://127.0.0.1:9",
    SUPABASE_SERVICE_ROLE_KEY: "offline-kein-geheimnis", HELMUT_QUELLEN_ARBEITSFENSTER: "on" });
  global.fetch = async (url, options = {}) => {
    const u = new URL(url), method = options.method || "GET";
    assert.equal(u.origin, "http://127.0.0.1:9", "Keine externe Verbindung");
    assert(["GET", "POST"].includes(method), "Keine bestehende Rohzeile oder Reservierung wird aktualisiert");
    let result;
    if (u.pathname === "/rest/v1/raw_documents") {
      if (method === "GET") {
        const id = u.searchParams.get("id");
        result = id ? [...documents.values()].filter(d => id === "eq." + d.id
          || id.slice(4, -1).split(",").map(x => x.replace(/^"|"$/g, "")).includes(d.id)) : projection();
      } else {
        assert.equal(options.headers.Prefer, "resolution=ignore-duplicates,return=representation");
        result = [];
        for (const d of JSON.parse(options.body)) if (!documents.has(d.id)) {
          documents.set(d.id, clone(d)); result.push(clone(d)); writes.push(clone(d));
        }
      }
    } else if (u.pathname === "/rest/v1/helmut_store") {
      if (method === "GET") result = archive.has(u.searchParams.get("id")?.slice(3))
        ? [clone(archive.get(u.searchParams.get("id").slice(3)))] : [];
      else { const record = JSON.parse(options.body); assert(!archive.has(record.id)); archive.set(record.id, record); result = [record]; }
    } else if (u.pathname === "/rest/v1/document_findings" && method === "POST") result = [];
    else assert.fail("Unerwarteter Speicherpfad " + u.pathname);
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  };
  try {
    assert.equal((await storage.persistRawDocumentsDeduped([normalized])).persisted, 1);
    assert.equal(writes.length, 1); assert.equal(writes[0].canonical_target_url, null);
    assert.equal(writes[0].id, row.id); assert.equal(writes[0].summary, row.summary);
    const again = G.planDedupWrites([google], projection());
    assert.equal(again.findings[0].raw_document_id, old.id, "Google bleibt am alten URL-Dokument");
    const receipt = await storage.persistiereRohdokumenteWarteschlange([normalized]);
    assert(receipt.ok); assert.deepEqual(receipt.bestaetigteIds, [row.id]);
    const loaded = await storage.ladeRohdokumentStaende([row.id], receipt.quellenstaende);
    assert.equal(loaded.length, 1); assert.equal(loaded[0].source_id, R.SOURCE_ID);
    assert.equal(loaded[0].published_at, row.published_at); assert.equal(loaded[0].summary, row.summary);
    assert.equal(JSON.stringify(documents.get(old.id)), previous, "Alte Zeile und Datum bleiben bytegleich");
  } finally {
    global.fetch = actualFetch;
    for (const k of keys) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  }
});
(async () => {
  for (const { name, fn } of tests) { await fn(); passed++; console.log("PASS " + name); }
  console.log(`${passed}/${tests.length} begrenzte Destatis-RSS-Standgruppen bestanden; kein Netz/Modell/Production.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
