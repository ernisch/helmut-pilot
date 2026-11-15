"use strict";
const assert = require("node:assert/strict");
const F = require("./fixtures/eurlex-original"), O = require("../lib/helmut/quellen-eurlex-original");
const Q = require("../lib/helmut/quellen-eurlex-auszug"), C = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup"), E = require("../lib/helmut/quellen-auszug");
const H = require("../lib/helmut/parlamentsdaten-herkunft"), M = require("../lib/helmut/quellen-eurlex-cellar");
const { toCrawlerSource } = require("../lib/helmut/quellenarchitektur/source-mode");
const seed = require("../lib/helmut/quellenarchitektur/seeds/parlamentsdaten-quellen").PARLAMENTSDATEN_QUELLEN[0];
const path = { id: "rp-" + Q.SOURCE_ID, publisher_id: "publisher-eur-lex.europa.eu", legacy_source_id: Q.SOURCE_ID,
  url: Q.FEED_URL, method: "rss", parser: "rss-regex", status: "needs_review", activation_mode: "always_on" };
const source = toCrawlerSource(path, new Map([[seed.id, seed]]));
const input = M.parseResponse(JSON.stringify({ head: { vars: ["work", "celex", "published", "ojIdentity", "title"] },
  results: { bindings: [F.source] } }), { now: new Date("2026-11-15T22:00:00Z") })[0];
const readAt = "2026-11-15T22:00:00.000Z";
const extracted = O.extractPackage(F.zip(), F.options);
const loaded = () => ({ ...structuredClone(input), content: extracted.text,
  cellarExcerpt: { proof: structuredClone(extracted.proof), readAt } });
const env = { HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400",
  HELMUT_ORIGINALABRUFE_TAG: "16", HELMUT_SUPABASE_TIMEOUT_MS: "1000" };
const clone = x => structuredClone(x);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
function context({ rows = new Map(), quota = true, finishUnknown = false, manifest = F.rdf(), bytes = F.zip() } = {}) {
  const calls = { rdf: 0, zip: 0, quota: 0, reserve: 0, finish: 0, release: 0 };
  const now = () => Date.parse(readAt);
  const deps = { env, now, deadlineMs: now() + 120000,
    speicher: {
      lesen: async key => clone(rows.get(key) ?? null),
      reservieren: async (key, row) => { calls.reserve++; if (!rows.has(key)) rows.set(key, clone(row)); },
      abschliessen: async (key, id, row) => {
        calls.finish++; if (finishUnknown) throw Error("unknown-after-write");
        if (rows.get(key)?.versuchId === id && rows.get(key)?.zustand === "reserviert") rows.set(key, clone(row));
      },
      rueckgabeVorAbruf: async (key, row) => { calls.release++; if (rows.get(key)?.versuchId === row.versuchId) rows.delete(key); }
    },
    originalReservierung: { reserviere: async args => {
      calls.quota++; assert.equal(args.menge, 1); assert.equal(args.grenzeTag, 16);
      return { verfuegbar: true, erlaubt: quota, grund: "tagesgrenze" };
    } },
    fetchUrl: async (url, depth, options) => {
      assert.equal(depth, 0); assert.equal(options.allowedHost, "publications.europa.eu");
      assert(options.abbruchSignal instanceof AbortSignal);
      if (options.cellar.kind === "rdf") { calls.rdf++; return { body: manifest, status: 200, finalUrl: url }; }
      calls.zip++; assert.equal(url, F.itemUrl); return { bytes, status: 200, finalUrl: url };
    }
  };
  return { deps, calls, rows };
}

(async () => {
  await test("Enger freigegebener Katalogpfad; pausierte, fremde oder geaenderte Wege bleiben ohne Textrecht", () => {
    assert.equal(source.eurlexExcerptApproved, true); assert.equal(Q.sourceApproved(source), true);
    for (const change of [{ id: "anderer-pfad" }, { publisher_id: "anderer" }, { url: Q.FEED_URL + "x" },
      { status: "paused" }, { activation_mode: "manual" }, { parser: "html" }, { method: "html" }])
      assert.equal(Q.catalogApproved({ ...path, ...change }), false);
    for (const change of [{ eurlexExcerptApproved: false }, { retrievalPathId: "anderer" }, { rssUrls: ["https://example.org"] }])
      assert.equal(Q.sourceApproved({ ...source, ...change }), false);
  });
  await test("Amtlicher ganzer Absatz durchlaeuft Normalisierung, JSONB und alle vorhandenen Quellen-DTOs", () => {
    const raw = C.normalizeRawItem(loaded(), source), doc = D.toRawDocumentRow(raw);
    assert.equal(raw.content, F.excerpt); assert.equal(doc.summary, F.excerpt);
    assert.equal(doc.published_at, "2026-11-13T00:00:00.000Z"); assert.equal(H.leseParlamentsdatenHerkunft(doc).version, 3);
    const roundtrip = JSON.parse(JSON.stringify(doc, (key, value) => value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value));
    assert(Q.read(roundtrip)); assert.equal(D.contentHash(roundtrip), doc.content_hash);
    const notice = Q.notice(roundtrip); assert.equal(notice.scope, Q.SCOPE); assert(notice.text.includes(F.cellar.celex));
    assert(!notice.text.includes("CC0")); assert.equal(notice.licenseUrl, Q.LICENSE_URL);
    const B = require("../lib/helmut/briefingContract");
    for (const dto of [require("../lib/helmut/lage").mapSource(doc), B.buildSources({}, [doc])[0],
      require("../lib/helmut/radarState").pickPrimarySource({}, [doc]), B.oeffnendeHelmutQuelle({}, [doc])]) {
      assert.deepEqual(dto.sourceNotice, { ...notice, articleUrl: dto.url });
      assert.equal(D.canonicalizeUrl(dto.url), D.canonicalizeUrl(notice.articleUrl));
    }
    const projected = { ...doc, parlamentsdatenHerkunft: doc.raw.parlamentsdatenHerkunft }; delete projected.raw;
    assert(Q.read(projected)); assert.equal(B.buildSources({}, [projected])[0].sourceNotice.text, notice.text);
    const old = D.toRawDocumentRow(C.normalizeRawItem(input, seed));
    assert.equal(old.summary, null); assert.notEqual(old.id, doc.id); assert.equal(H.leseParlamentsdatenHerkunft(old).version, 2);
    const ko = { source_document_count: 2 }, projection = H.bewertungsprojektion(ko, [old, doc]);
    assert.equal(H.unabhaengigeBelegzahl(projection, 2), 1); assert.equal(ko.source_document_count, 2);
    assert.equal(JSON.stringify(projection), JSON.stringify(ko));
    for (const docs of [[old, doc], [doc, old]]) {
      const sources = B.buildSources({}, docs); assert.equal(sources.length, 1);
      assert.equal(sources[0].summary, F.excerpt); assert.equal(sources[0].sourceNotice.scope, Q.SCOPE);
      assert.equal(sources[0].variants.length, 2);
    }
    const later = loaded(); later.cellarExcerpt.readAt = "2026-11-15T22:01:00.000Z";
    assert.equal(D.toRawDocumentRow(C.normalizeRawItem(later, source)).id, doc.id);
  });
  await test("Nur der geschlossene Originalbeleg passiert die Datums-Satzgrenze; manipulierte Belege scheitern geschlossen", async () => {
    const doc = D.toRawDocumentRow(C.normalizeRawItem(loaded(), source));
    assert.equal(E.satzpraefix(F.excerpt, F.excerpt.length), ""); assert.equal(E.hatOriginalinhalt(doc), true);
    const generic = { ...doc, raw: {}, source_id: "generic" }; assert.equal(E.hatOriginalinhalt(generic), false);
    for (const mutate of [d => d.summary += " Zusatz.", d => d.raw.parlamentsdatenHerkunft.originalExcerpt.author = "Andere",
      d => d.raw.parlamentsdatenHerkunft.originalExcerpt.language = "en", d => d.published_at = readAt,
      d => d.raw.parlamentsdatenHerkunft.license = "CC0-1.0", d => d.raw.parlamentsdatenHerkunft.readAt = "2026-11-12T00:00:00.000Z",
      d => d.raw.parlamentsdatenHerkunft.originalTitle += " Zusatz", d => d.raw.parlamentsdatenHerkunft.provenanceHash = "a".repeat(64)]) {
      const bad = clone(doc); mutate(bad); assert.equal(Q.read(bad), null); assert.equal(E.hatOriginalinhalt(bad), false);
      assert.equal(D.sourceExcerpt(bad), null); assert.throws(() => D.toRawDocumentRow(bad), /herkunft/);
    }
    let io = 0;
    const denied = () => { io++; throw Error("unbestellter Abruf"); };
    assert.equal((await require("../lib/helmut/artikelkontext-beschaffung").beschaffeArtikelkontext(doc, { versuch: true },
      { fetchUrl: denied, speicher: { lesen: denied } })).reason, "quelle-nur-metadaten");
    assert.equal(io, 0); assert.equal(E.fromHtml(doc, { body: "<article>Fremd</article>", finalUrl: doc.url }).reason, "quelle-nur-metadaten");
  });
  await test("Ohne native Freigabe, Fenster oder ausreichende Restzeit geschieht kein I/O", async () => {
    for (const [s, change] of [[seed, {}], [source, { env: {} }], [source, { deadlineMs: Date.parse(readAt) + 1000 }]]) {
      const c = context(); await Q.enrich([input], s, { ...c.deps, ...change });
      assert.equal(c.calls.rdf + c.calls.zip + c.calls.reserve + c.calls.quota, 0);
    }
  });
  await test("Nativer Lesealias erhaelt den vollstaendig validierten240Zeichen-Originalabsatz exakt", () => {
    // Synthetischer Grenzfall im bestehenden FORMEX-Fixture; kein neuer
    // amtlicher Inhalt und kein Quellenabruf. Der echte Ausgangsabsatz hat142Z.
    const files = F.fragments();
    const prefix = "Die folgende Regelung betrifft die zeitliche Geltung des Anhangs im bereits erlassenen Beschluss: ";
    files[0].text = files[0].text.replace("<ALINEA><P>", "<ALINEA><P>" + prefix);
    const synthetic = O.extractPackage(F.zip(files), F.options);
    assert.equal(synthetic.text.length, 240);
    const raw = C.normalizeRawItem({ ...input, content: synthetic.text,
      cellarExcerpt: { proof: synthetic.proof, readAt } }, source);
    const doc = D.toRawDocumentRow(raw);
    const { raw: data, ...fields } = doc;
    const projected = { ...fields, parlamentsdatenHerkunft: data.parlamentsdatenHerkunft, quellenauszug_beleg: null };
    assert(Q.read(projected)); assert.equal(E.satzpraefix(synthetic.text), "");
    const result = E.geleseneQuelle(projected);
    assert.equal(result.summary, synthetic.text); assert(Q.read(result));
    assert.equal(Object.hasOwn(result, "quellenauszug_beleg"), false);
    assert.equal(require("../lib/helmut/briefingContract").buildSources({}, [result])[0].summary, synthetic.text);
    assert.equal(projected.summary, synthetic.text, "Eingabe unveraendert");
    for (const changed of [{ ...projected, summary: synthetic.text.slice(0, -1) + "X" },
      { ...projected, parlamentsdatenHerkunft: null, source_id: "generic" }]) {
      assert.equal(Q.read(changed), null); assert.equal(E.geleseneQuelle(changed).summary, null);
    }
  });
  await test("SourceMode-Flag ueberlebt echten Compiler und nativen Quellenhandler mit60s Standardlease", async () => {
    const demand = await require("../lib/helmut/source-demand").kompiliereQuellenbedarf({
      profile: [{ id: "synthetischer-einzelbedarf" }], quellenFuerProfil: async () => [source], jetztMs: Date.parse(readAt), env });
    const job = demand.auftraege[0]; assert.equal(job.payload.quelle.eurlexExcerptApproved, true);
    assert.equal(job.payload.quelle.retrievalPathId, path.id);
    const c = context(); c.deps.env = { ...env, HELMUT_SUPABASE_TIMEOUT_MS: "10000" };
    c.deps.deadlineMs = c.deps.now() + 60000;
    const enriched = await Q.enrich([input], job.payload.quelle, c.deps);
    assert.equal(enriched[0].content, F.excerpt); assert.equal(c.calls.zip, 1);
    let callback = 0;
    const P = require("../lib/helmut/scalable-pipeline");
    // Handler-Abschluss nach Callback kontrolliert stoppen: kein Speicheradapter
    // und keine nachgelagerte Verarbeitung fuer diesen Einbindungsnachweis.
    await assert.rejects(P.HANDLER.source_fetch({ id: "synthetischer-auftrag", payload: job.payload }, {
      env, now: c.deps.now, hardeningConfig: () => ({ enabled: false }),
      enrichEurlexExcerpt: async (items, s, deps) => {
        callback++; assert.equal(s.eurlexExcerptApproved, true); assert.equal(deps.deadlineMs, c.deps.deadlineMs);
        return enriched;
      },
      crawlAllSources: async (sources, options) => {
        const out = await options.cellarExcerpt([input], sources[0], c.deps.fetchUrl);
        assert.equal(out[0].content, F.excerpt); throw Error("gezielter-einbindungsabschluss");
      }
    }, { auftragsDeadlineMs: c.deps.deadlineMs }), /gezielter-einbindungsabschluss/);
    assert.equal(callback, 1);
    const unapproved = await require("../lib/helmut/source-demand").kompiliereQuellenbedarf({
      profile: [{ id: "synthetischer-einzelbedarf" }], quellenFuerProfil: async () => [seed], jetztMs: Date.parse(readAt), env });
    assert.notEqual(unapproved.auftraege[0]?.payload.quelle.eurlexExcerptApproved, true);
  });
  await test("Regulaere Abdeckungspruefung erkennt nur validierte Textfassung als inhaltlich lesbar", () => {
    const audit = require("../lib/helmut/quellenarchitektur/abdeckungspruefung").buildAbdeckungspruefung;
    const doc = D.toRawDocumentRow(C.normalizeRawItem(loaded(), source));
    const args = { catalog: { publishers: [{ id: path.publisher_id }], retrievalPaths: [{ ...path, expected_frequency: "daily" }] },
      now: Date.parse(readAt), documents: [doc] };
    assert.equal(audit(args).paths[0].documents.missingExcerpt, 0);
    const bad = clone(doc); bad.raw.parlamentsdatenHerkunft.provenanceHash = "0".repeat(64);
    assert.equal(audit({ ...args, documents: [bad] }).paths[0].documents.missingExcerpt, 1);
  });
  await test("Ein Original je Lauf, bestaetigter CAS-Abschluss und positiver Fassungscache sparen Wiederabrufe", async () => {
    const c = context(); const result = await Q.enrich([input, input, input], source, c.deps);
    assert.equal(result[0].content, F.excerpt); assert.equal(result[1].content, F.excerpt);
    assert.equal(c.calls.zip, 1); assert.equal(c.calls.quota, 1); assert.equal(c.calls.finish, 1);
    const before = clone([...c.rows]); const again = await Q.enrich([input], source, c.deps);
    assert.equal(again[0].content, F.excerpt); assert.equal(c.calls.zip, 1); assert.equal(c.calls.quota, 1);
    assert.deepEqual([...c.rows], before);
    const changed = context({ rows: c.rows, manifest: F.rdf().replace("03:32:06.372", "03:33:06.372") });
    const newResult = await Q.enrich([input], source, changed.deps);
    assert.equal(newResult[0].content, F.excerpt); assert.equal(changed.calls.zip, 1); assert.equal(c.rows.size, 2);
    assert.deepEqual([...c.rows][0], before[0]);
  });
  await test("Globale Originalgrenze wird nicht erweitert; eigene Reservierung vor Abruf exakt zurueckgegeben", async () => {
    const c = context({ quota: false }); const result = await Q.enrich([input], source, c.deps);
    assert.equal(result[0], input); assert.equal(c.calls.zip, 0); assert.equal(c.calls.quota, 1);
    assert.equal(c.calls.release, 1); assert.equal(c.rows.size, 0);
  });
  await test("UNKNOWN nach Abschluss schreibt oder liest kein zweites Original und erhaelt die Reservierung", async () => {
    const c = context({ finishUnknown: true });
    assert.equal((await Q.enrich([input], source, c.deps))[0], input);
    assert.equal((await Q.enrich([input], source, c.deps))[0], input);
    assert.equal(c.calls.zip, 1); assert.equal(c.calls.finish, 1); assert.equal(c.calls.release, 0);
    assert.equal([...c.rows.values()][0].zustand, "reserviert");
  });
  await test("Parallele Einmalreservierungen erlauben nur einem Besitzer den Originalabruf", async () => {
    const c = context(); const values = await Promise.all([Q.enrich([input], source, c.deps), Q.enrich([input], source, c.deps)]);
    assert(values.some(v => v[0].content === F.excerpt)); assert.equal(c.calls.zip, 1); assert.equal(c.calls.quota, 1);
  });
  await test("Defektes Original bleibt dokumentierte Luecke und wird nie unbemerkt neu abgerufen", async () => {
    const c = context({ bytes: Buffer.from("kaputt") });
    assert.equal((await Q.enrich([input], source, c.deps))[0], input);
    const before = clone([...c.rows]); assert.equal([...c.rows.values()][0].zustand, "luecke");
    await Q.enrich([input], source, c.deps); assert.equal(c.calls.zip, 1); assert.deepEqual([...c.rows], before);
  });
  await test("Quittierte503 erhaelt genau einen spaeteren Retry; Retry-After und alte Fehlerquittung bleiben erhalten", async () => {
    const c = context(), fetch = c.deps.fetchUrl; let current = Date.parse(readAt);
    c.deps.now = () => current; c.deps.deadlineMs = current + 60000;
    c.deps.fetchUrl = async (url, depth, options) => {
      if (options.cellar.kind === "zip") { c.calls.zip++; throw Object.assign(Error("HTTP 503"), { statusCode: 503, retryAfterMs: 1800000 }); }
      return fetch(url, depth, options);
    };
    await Q.enrich([input], source, c.deps); const first = clone([...c.rows][0]);
    assert.equal(first[1].reason, "http-503"); assert.equal(first[1].retryNotBefore, "2026-11-15T22:30:00.000Z");
    await Q.enrich([input], source, c.deps); assert.equal(c.calls.zip, 1);
    current += 1800000; c.deps.deadlineMs = current + 60000;
    await Q.enrich([input], source, c.deps); assert.equal(c.calls.zip, 2); assert.equal(c.rows.size, 2);
    current += 3600000; c.deps.deadlineMs = current + 60000;
    await Q.enrich([input], source, c.deps); assert.equal(c.calls.zip, 2); assert.deepEqual([...c.rows][0], first);
    const good = context(), goodFetch = good.deps.fetchUrl; let failed = false;
    good.deps.fetchUrl = async (url, depth, options) => {
      if (options.cellar.kind === "zip" && !failed) { failed = true; good.calls.zip++; throw Object.assign(Error("HTTP 503"), { statusCode: 503 }); }
      return goodFetch(url, depth, options);
    };
    await Q.enrich([input], source, good.deps);
    good.deps.now = () => Date.parse(readAt) + 900000; good.deps.deadlineMs = good.deps.now() + 60000;
    assert.equal((await Q.enrich([input], source, good.deps))[0].content, F.excerpt);
    assert.equal((await Q.enrich([input], source, good.deps))[0].content, F.excerpt);
    assert.equal(good.calls.zip, 2);
  });
  console.log(`\n${passed}/${passed} gezielte Integrationsgruppen bestanden; kein Netz, keine DB, kein Modell.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
