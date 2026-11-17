"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");
const C = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const M = require("../lib/helmut/quellenarchitektur/model");
const S = require("../lib/helmut/sourceSafety");
const { buildCatalog } = require("../lib/helmut/quellenarchitektur/catalog");
const { toCrawlerSource, buildRelationalCrawlPlan } = require("../lib/helmut/quellenarchitektur/source-mode");
const H = require("../lib/helmut/parlamentsdaten-herkunft");
const Q = require("../lib/helmut/quellen-hinweis");
const L = require("../lib/helmut/lage");
const B = require("../lib/helmut/briefingContract");
const R = require("../lib/helmut/radarState");
const A = require("../lib/helmut/artikelkontext");
const K = require("../lib/helmut/artikelkontext-beschaffung");
const E = require("../lib/helmut/quellen-auszug");
const { resolveProfilePackages } = require("../lib/helmut/quellenarchitektur/profile-packages");
const { v1Sources } = require("../lib/helmut/sources");
const { PARLAMENTSDATEN_QUELLEN: registeredSources, BMG_SOURCE_ID } = require("../lib/helmut/quellenarchitektur/seeds/parlamentsdaten-quellen");
// Die beiden vorhandenen Originalfixtures gehoeren ausschliesslich zu diesen IDs.
const sources = ["eurlex-amtsblatt-l-rss", "bundespuls-vorgaenge-rss"]
  .map(id => registeredSources.find(source => source.id === id));
const [eurlex, bundespuls] = sources;
const bmg = registeredSources.find(source => source.id === BMG_SOURCE_ID);
const catalog = buildCatalog();
const read = name => fs.readFileSync(path.join(__dirname, "fixtures/parlamentsdaten-20261106", name), "utf8");
function pruefeFehlerwege(calls, source) {
  assert.equal(calls[0], source.url);
  assert.equal(calls.length, source.id === "eurlex-amtsblatt-l-rss" ? 2 : 1);
  if (calls.length === 2) assert(calls[1].startsWith("https://publications.europa.eu/webapi/rdf/sparql?"));
}
const feeds = [read("eurlex-amtsblatt-l.xml"), read("bundespuls-vorgaenge.xml")];
const bmgUrl = "https://www.bundesgesundheitsministerium.de/dialogforum-kinder-und-jugendsport";
const bmgTitle = "Gemeinsam für mehr Bewegung bei Kindern und Jugendlichen";
function bmgItem({ url = bmgUrl, title = bmgTitle, date = "Mon, 16 Nov 2026 00:00:00 CET" } = {}) {
  return `<item><title>${title}</title><link>${url.replaceAll("&", "&amp;")}</link>${date === null ? "" : `<pubDate>${date}</pubDate>`}<description>NICHT_FREIGEGEBENE_BMG_BESCHREIBUNG</description><content:encoded><![CDATA[<p>NICHT_FREIGEGEBENER_BMG_VOLLTEXT</p>]]></content:encoded><enclosure url="https://example.org/bild.jpg" type="image/jpeg"/><dc:creator>Fremde Behauptung</dc:creator></item>`;
}
const bmgXml = (...items) => `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><pubDate>Tue, 17 Nov 2026 08:57:59 +0100</pubDate>${items.join("")}</channel></rss>`;
const irights = { id: "fach-irights-rss", name: "iRights.info", type: "media", priority: 80,
  url: "https://irights.info/feed", crawlMethod: "rss", active: false };
const irightsUrl = "https://irights.info/artikel/ki-und-offenheit-vereinen-open-source-llms-im-bildungsbereich/32946";
const irightsTitle = "KI und Offenheit vereinen: Open Source LLMs im Bildungsbereich";
// Begrenzte oeffentliche Originalpassage aus der CC-BY-Textprobe vom 15.11.;
// kein Volltextfixture und keine Bildfreigabe aus einer Bildunterschrift.
const irightsText = "Große Sprachmodelle, die sogenannten Large Language Models (LLMs), sind durch Anwendungen wie ChatGPT, Claude und Gemini in kurzer Zeit bekannt geworden. Die genannten Modelle sind kommerziell und bergen sowohl ethische als auch rechtliche Probleme, insbesondere bei Fragen des Datenschutzes und des Urheberrechts.";
const irightsGrant = '<p><em>Hinweis: Dieser Beitrag ist Teil einer Kooperation von </em><a href="https://irights.info/schlagwort/oerinfo"><em>iRights.info</em></a><em>, dem </em><a href="https://www.bildungsserver.de/"><em>Deutschen Bildungsserver</em></a><em> und <a href="https://open-educational-resources.de/">OERinfo</a>. Der Text stammt von Jens Crueger, steht unter der Lizenz <a href="https://creativecommons.org/licenses/by/4.0/deed.de">CC BY 4.0</a> und wurde zunächst bei <a href="https://open-educational-resources.de/ki-und-offenheit-vereinen-open-source-llms-im-bildungsbereich/">OERinfo</a> veröffentlicht.</em></p>';
function irightsXml(grant = irightsGrant, author = "Jens Crueger") {
  return `<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>${irightsTitle}</title><link>${irightsUrl}</link><pubDate>Wed, 11 Nov 2026 12:07:37 +0000</pubDate><dc:creator>${author}</dc:creator><description><![CDATA[<p>${irightsText}</p>]]></description><content:encoded><![CDATA[<p>${irightsText}</p>${grant}]]></content:encoded></item></channel></rss>`;
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }

// Echte Abrufkette, vollständig ersetzter Transport. Kein Netz, keine DB, kein Modell.
async function transport(body, status, fn) {
  const original = https.get, steering = process.env.HELMUT_ANBIETER_STEUERUNG, calls = [], requests = [];
  process.env.HELMUT_ANBIETER_STEUERUNG = "off";
  https.get = (url, options, callback) => {
    calls.push(url);
    requests.push({ url, options });
    const request = new EventEmitter();
    request.destroy = error => request.emit("error", error || new Error("mock-aborted"));
    queueMicrotask(() => {
      const response = new EventEmitter();
      Object.assign(response, { statusCode: status, headers: {}, setEncoding() {}, resume() {}, destroy() {} });
      callback(response);
      response.emit("data", body); response.emit("end");
    });
    return request;
  };
  try { await fn(calls, requests); } finally {
    https.get = original;
    if (steering === undefined) delete process.env.HELMUT_ANBIETER_STEUERUNG;
    else process.env.HELMUT_ANBIETER_STEUERUNG = steering;
  }
}

(async () => {
  await test("EUR-Lex-Challenge nutzt einmal CELLAR mit echtem Amtsblattdatum und nachvollziehbarer Metadatenherkunft", async () => {
    let cellarCalls = 0;
    await transport("<html>Javascript required</html>", 202, async calls => {
      const items = await C.crawlSource(eurlex, { now: new Date("2026-11-15T12:00:00Z"), fetchUrl: async (url, depth, opts) => {
        // Derselbe injizierte Fetch bedient auch RSS; dafuer bleibt die echte
        // HTTP-Kette an der obigen https.get-Attrappe, ohne externes Netz.
        if (url === eurlex.url) return C.fetchUrl(url, depth, opts);
        cellarCalls++; assert(url.startsWith("https://publications.europa.eu/webapi/rdf/sparql?"));
        assert.equal(depth, 0); assert.equal(opts.allowedHost, "publications.europa.eu");
        return { status: 200, body: read("cellar-oj-l-metadaten.json"), finalUrl: url };
      } });
      assert.equal(cellarCalls, 1); assert.deepEqual(calls, [eurlex.url]); assert.equal(items.length, 3);
      for (const item of items) {
        assert.equal(item.publishedAt, "2026-11-13T00:00:00.000Z");
        assert.equal(item.content, item.title);
        const doc = D.toRawDocumentRow(item), origin = H.leseParlamentsdatenHerkunft(doc);
        assert(origin); assert.equal(origin.version, 2); assert.equal(origin.retrieval.method, "cellar-sparql");
        assert.equal(origin.retrieval.publicationDate, "2026-11-13"); assert.equal(doc.summary, null);
        assert(H.parlamentsdatenQuellenhinweis(doc).text.includes(origin.identifier.value));
        assert.equal((await K.beschaffeArtikelkontext(doc, { versuch: true })).reason, "quelle-nur-metadaten");
        const changed = structuredClone(doc); changed.raw.parlamentsdatenHerkunft.retrieval.publicationDate = "2026-11-12";
        assert.equal(H.leseParlamentsdatenHerkunft(changed), null);
      }
    });
  });
  await test("Funktionierendes EUR-Lex-RSS benoetigt keinen Ersatz; fehlgeschlagener Ersatz bleibt Fehler", async () => {
    let calls = 0;
    const fetchUrl = async (url, depth, opts) => {
      if (url === eurlex.url) return C.fetchUrl(url, depth, opts);
      calls++; throw Error("cellar-timeout");
    };
    await transport(feeds[0], 200, async () => assert((await C.crawlSource(eurlex, { fetchUrl })).length));
    assert.equal(calls, 0);
    await transport("<html>Challenge</html>", 202, async () => {
      await assert.rejects(C.crawlSource(eurlex, { fetchUrl }), /cellar-timeout/);
    });
    assert.equal(calls, 1);
  });
  await test("iRights-Textlizenz wird je RSS-Item aus ausdruecklichem Text-/Autoren-/OERinfo-Beleg gebunden", async () => {
    await transport(irightsXml(), 200, async calls => {
      const [raw] = await C.crawlSource(irights);
      assert(raw); assert.equal(raw.imageUrl, null);
      const doc = D.toRawDocumentRow(raw);
      assert(doc.summary.includes("Große Sprachmodelle"));
      const notice = Q.quellenhinweis(doc);
      assert.equal(notice.scope, "licensed_rss_excerpt");
      assert(notice.text.includes("Jens Crueger")); assert(notice.text.includes(irightsTitle));
      assert(notice.text.includes("zuerst OERinfo")); assert(notice.text.includes("CC BY 4.0"));
      assert.equal(notice.licenseUrl, "https://creativecommons.org/licenses/by/4.0/deed.de");
      assert(notice.changes.includes("Gekürzter RSS-Textauszug"));
      assert.deepEqual(calls, [irights.url]);
    });
  });
  await test("Bild-CC, fehlende/abweichende Textlizenz und fremde Autoren legitimieren keinen iRights-Text", () => {
    for (const [grant, author] of [["", "Jens Crueger"],
      ['<p>Bild: <a href="https://creativecommons.org/licenses/by/4.0/deed.de">CC BY 4.0</a></p>', "Jens Crueger"],
      [irightsGrant.replaceAll("CC BY 4.0", "CC BY-NC 4.0"), "Jens Crueger"],
      [irightsGrant, "Andere Autorin"], [irightsGrant + irightsGrant, "Jens Crueger"],
      [irightsGrant.replace("https://open-educational-resources.de/ki-", "https://example.org/ki-"), "Jens Crueger"]]) {
      const entry = C.parseRssItems(irightsXml(grant, author))[0];
      const raw = C.normalizeRawItem({ ...entry, imageUrl: "https://irights.info/bild.jpg" }, irights);
      assert.equal(raw.content, irightsTitle); assert.equal(raw.imageUrl, null);
      assert.equal(raw.author, "iRights.info", "Kein ungepruefter Autorenname im Legacy-Rohitem");
      const doc = D.toRawDocumentRow(raw), notice = Q.quellenhinweis(doc);
      assert.equal(doc.summary, null); assert.equal(notice.licenseUrl, null);
      assert(notice.text.includes("Textnutzungsbeleg")); assert(notice.changes.includes("kein Artikeltext"));
      assert(!Object.hasOwn(doc.raw.parlamentsdatenHerkunft, "author"));
    }
  });
  await test("iRights-Herkunft weist Feed-, Artikel-, Titel-, Datums- und Textvertauschungen zurueck", () => {
    const foreign = "Eine fremde, nicht im lizenzierten Text enthaltene Beschreibung behauptet einen anderen Sachverhalt.";
    // Die unabhaengige description ist bereits VOR dem Parser veraendert;
    // der unveraenderte Lizenzabsatz im encoded-Text legitimiert sie nicht.
    const beforeParsing = irightsXml().replace(`<description><![CDATA[<p>${irightsText}</p>]]></description>`,
      `<description><![CDATA[<p>${foreign}</p>]]></description>`);
    const foreignEntry = C.parseRssItems(beforeParsing)[0];
    assert(!foreignEntry.irightsTextBeleg);
    const foreignDoc = D.toRawDocumentRow(C.normalizeRawItem(foreignEntry, irights));
    assert.equal(foreignDoc.summary, null); assert.equal(Q.quellenhinweis(foreignDoc).licenseUrl, null);
    const firstSentence = irightsText.slice(0, irightsText.indexOf(". ") + 1);
    const overlapXml = irightsXml().replace(`<description><![CDATA[<p>${irightsText}</p>]]></description>`,
      `<description><![CDATA[<p>${firstSentence} ${foreign}</p><p>The post Artikel appeared first on iRights.info.</p>]]></description>`);
    const overlap = C.parseRssItems(overlapXml)[0];
    assert.equal(overlap.content, firstSentence);
    assert(overlap.irightsTextBeleg); assert(!overlap.content.includes(foreign));
    assert(!overlap.content.includes("The post"));
    const entry = C.parseRssItems(irightsXml())[0];
    for (const source of [{ ...irights, url: "https://example.org/feed" },
      { ...irights, rssUrl: "https://example.org/feed" }, { ...irights, rssUrls: [irights.url, "https://example.org/feed"] }])
      assert.equal(C.normalizeRawItem(entry, source), null);
    for (const altered of [{ ...entry, content: "Eine andere, nicht zu dieser Lizenz gehörende Textaussage." },
      { ...entry, title: "Anderer Artikel" }, { ...entry, publishedAt: "2026-11-12T12:07:37Z" }])
      assert.equal(D.toRawDocumentRow(C.normalizeRawItem(altered, irights)).summary, null);
    const raw = C.normalizeRawItem(entry, irights);
    for (const altered of [{ ...raw, sourceId: "fremde-quelle" }, { ...raw, url: irightsUrl.replace("32946", "32947") },
      { ...raw, title: "Anderer Titel" }, { ...raw, publishedAt: "2026-11-12T12:07:37Z" },
      { ...raw, content: "Ein fremder Text mit einer anderen Aussage und einem anderen Inhalt." },
      { ...raw, parlamentsdatenHerkunft: { ...raw.parlamentsdatenHerkunft, privateEmail: "nicht-uebernehmen" } }]) {
      assert.equal(Q.quellenhinweis(altered), null);
      assert.throws(() => D.toRawDocumentRow(altered), /herkunft/);
    }
  });
  await test("iRights-Attribution uebersteht beide Speicherwege, bestehenden Lesealias und kompakte Kundenausgabe", () => {
    const raw = C.normalizeRawItem(C.parseRssItems(irightsXml())[0], irights);
    for (const value of [D.toRawDocumentRow(raw), G.planDedupWrites([raw], []).persists[0]]) {
      const doc = JSON.parse(JSON.stringify(value));
      assert(!Object.hasOwn(doc, "author")); assert(!Object.hasOwn(doc.raw, "author"));
      assert.equal(doc.raw.parlamentsdatenHerkunft.author, "Jens Crueger");
      const projected = { ...doc, parlamentsdatenHerkunft: doc.raw.parlamentsdatenHerkunft }; delete projected.raw;
      for (const source of [L.mapSource(projected), B.buildSources({}, [projected])[0],
        R.pickPrimarySource({}, [projected]), B.oeffnendeHelmutQuelle({}, [projected])]) {
        assert(source.sourceNotice.text.includes("Jens Crueger"));
        assert.equal(source.sourceNotice.articleUrl, source.url);
        const item = { id: "irights-attribution", title: doc.title, url: doc.url, sourceName: doc.source_name,
          sources: [source], primarySource: source, sourceNotice: source.sourceNotice };
        const wire = JSON.parse(JSON.stringify(require("../server").__prepareBriefingResponse({
          items: [item], homeSections: { topTasks: [item] }
        }, { compact: true })));
        assert.deepEqual(wire.items[0].primarySource.sourceNotice, source.sourceNotice);
        assert.deepEqual(wire.homeSections.topTasks[0].sources[0].sourceNotice, source.sourceNotice);
      }
    }
  });
  await test("iRights erlaubt keine ungepruefte Volltextnachladung oder HTML-Fallback", async () => {
    for (const grant of [irightsGrant, ""]) {
      const doc = D.toRawDocumentRow(C.normalizeRawItem(C.parseRssItems(irightsXml(grant))[0], irights));
      assert.equal(H.istParlamentsdatenDokument(doc), false, "iRights ist keine Parlamentsquelle");
      assert.equal(Q.istNurFeedDokument(doc), true);
      let io = 0;
      const forbidden = () => { io++; throw Error("Kein Nachladen"); };
      assert.deepEqual(await K.beschaffeArtikelkontext(doc, { versuch: true }, {
        fetchUrl: forbidden, speicher: { lesen: forbidden, reservieren: forbidden, abschliessen: forbidden }
      }), { ok: false, reason: "quelle-nur-metadaten" });
      assert.equal(io, 0);
      assert.throws(() => A.pruefeArtikelkontext([doc], { version: 1, herkunft: "manueller-originalvergleich", dokumentId: doc.id }), /quelle-nur-metadaten/);
      assert.deepEqual(E.fromHtml(doc, { body: "<article>Ungeprüfter Artikeltext</article>", finalUrl: doc.url }), { ok: false, reason: "quelle-nur-metadaten" });
      assert.deepEqual(E.fromMirror(doc, [{ ...doc, content: "Ungeprüfter Spiegeltext" }]), { ok: false, reason: "quelle-nur-metadaten" });
    }
    await transport("<rss><channel></channel></rss>", 200, async calls => {
      assert.deepEqual(await C.crawlSource(irights), []); assert.deepEqual(calls, [irights.url]);
    });
    await transport("<html>Kein RSS, sondern eine Zugangsseite.</html>", 200, async calls => {
      await assert.rejects(C.crawlSource(irights), /Ungültige RSS/); assert.deepEqual(calls, [irights.url]);
    });
  });
  await test("Ein ueberlanger gewoehnlicher Titel verliert nicht den gueltigen Nachbarn desselben Feeds", async () => {
    const s={id:"test-titelgrenze",name:"Synthetische Quelle",type:"media",crawlMethod:"rss",url:"https://example.org/feed",rssUrl:"https://example.org/feed"};
    const text="Der Ausschuss berät die Finanzierung der kommunalen Pflegeberatung mit den beteiligten Verbänden.";
    const xml=`<rss><channel><item><title>${"X".repeat(301)}</title><link>https://example.org/zu-lang</link><description>${text}</description></item><item><title>Beratung zur Pflegefinanzierung</title><link>https://example.org/pflegeberatung</link><description>${text}</description></item></channel></rss>`;
    await transport(xml,200,async calls=>{
      const items=await C.crawlSource(s);
      assert.equal(items.length,1);assert.equal(items[0].title,"Beratung zur Pflegefinanzierung");
      assert.equal(items[0].content,text);assert.deepEqual(calls,[s.rssUrl]);
    });
  });
  await test("Zwei quellengebundene Originalproben vom 06.11.2026, jeweils drei RSS-Items", () => {
    const hashes = ["467680627d9d060d2afef4637a3a6e06a5ff525bf869f3ce9bc35d8ebb0f76b3", "75775dd246a1604e044136e1109e214593af4a7e3fbaef7aeff710be9e64e625"];
    feeds.forEach((xml, i) => {
      assert.equal(crypto.createHash("sha256").update(xml).digest("hex"), hashes[i]);
      assert.equal(C.parseRssItems(xml).length, 3);
    });
  });
  await test("EUR-Lex behält Feed-Publikationsdatum, CELEX-Link und Urheber", () => {
    for (const item of C.parseRssItems(feeds[0])) {
      const raw = C.normalizeRawItem(item, eurlex);
      assert.equal(raw.publishedAt, "2026-11-05T23:00:00.000Z");
      assert(raw.url.includes("uri=CELEX:")); assert(raw.author.includes("Kommission"));
    }
  });
  await test("Bundespuls-DIP-Aktualisierung wird vor Speicherung keine Publikation", () => {
    for (const item of C.parseRssItems(feeds[1])) {
      assert(item.publishedAt, "Originalfeed enthält ein irreführendes RSS-pubDate");
      const raw = C.normalizeRawItem(item, bundespuls);
      assert.equal(raw.publishedAt, null);
      assert.equal(D.toRawDocumentRow(raw).published_at, null);
      assert.equal(G.planDedupWrites([raw], []).persists[0].published_at, null);
      assert.equal(raw.sourceName, bundespuls.name);
    }
  });
  await test("Aktualisierte DIP-Zeit erzeugt keine neue Dokumentidentität oder Abrufdatum als Publikation", () => {
    const item = C.parseRssItems(feeds[1])[0];
    const first = C.normalizeRawItem(item, bundespuls);
    for (const publishedAt of ["Fri, 06 Nov 2026 14:20:27 +0000", undefined, "ungueltig"]) {
      const next = C.normalizeRawItem({ ...item, publishedAt }, bundespuls);
      assert.equal(next.publishedAt, null); assert.equal(next.hash, first.hash);
      assert(next.retrievedAt);
    }
  });
  await test("Datumssonderregel benötigt bekannte Quellen-ID UND alle exakten Feedadressen", () => {
    const item = C.parseRssItems(feeds[1])[0];
    for (const source of [
      { ...bundespuls, id: "anderer-feed" },
      { ...bundespuls, url: "https://bundespuls.de/feed/abstimmung" },
      { ...bundespuls, url: "https://example.org/feed/vorgang" },
      { ...bundespuls, rssUrl: "https://example.org/feed" },
      { ...bundespuls, rssUrls: [bundespuls.url, "https://example.org/feed"] }
    ]) assert.equal(C.normalizeRawItem(item, source).publishedAt, "2026-11-06T13:20:27.000Z");
  });
  await test("Relationaler Crawler-Adapter erhält Datum und Herausgebertyp mit und ohne Legacy-Objekt", () => {
    for (const [i, source] of sources.entries()) {
      const entry = catalog.retrievalPaths.find(p => p.legacy_source_id === source.id);
      const item = C.parseRssItems(feeds[i])[0];
      const expected = C.normalizeRawItem(item, source);
      for (const legacy of [new Map(), new Map([[source.id, source]])]) {
        const raw = C.normalizeRawItem(item, toCrawlerSource(entry, legacy));
        assert.equal(raw.publishedAt, expected.publishedAt);
        assert.equal(raw.sourceType, source.type);
        assert.equal(raw.confidence, expected.confidence);
        assert.equal(D.toRawDocumentRow(raw).source_type, source.type);
        assert.equal(G.planDedupWrites([raw], []).persists[0].source_type, source.type);
      }
    }
  });
  await test("Beide RSS laufen durch die echte Abrufkette ohne zusätzliche Artikelabrufe", async () => {
    for (const [i, source] of sources.entries()) await transport(feeds[i], 200, async calls => {
      const items = await C.crawlSource(source);
      assert.equal(items.length, 3); assert.deepEqual(calls, [source.url]);
      assert(items.every(item => i === 0 ? item.publishedAt !== null : item.publishedAt === null));
    });
  });
  await test("Leere oder fehlerhafte Metadatenfeeds wechseln nicht still auf HTML-Volltext", async () => {
    for (const source of sources) {
      await transport("<rss><channel></channel></rss>", 200, async calls => {
        assert.deepEqual(await C.crawlSource(source), []); assert.deepEqual(calls, [source.url]);
      });
      await transport("nicht erreichbar", 503, async calls => {
        await assert.rejects(C.crawlSource(source), /HTTP 503/); pruefeFehlerwege(calls, source);
      });
    }
  });
  await test("HTTP200 mit HTML oder abgeschnittenem RSS ist kein erfolgreicher Leerabruf", async () => {
    for (const source of sources) for (const body of [
      "<html><body>Bitte JavaScript aktivieren</body></html>",
      "<rss><channel>",
      "<rss><channel><item><title>Unvollständig</title></channel></rss>",
      "<rss><channel><item><title>Kein Link</title></item></channel></rss>"
    ]) await transport(body, 200, async calls => {
      await assert.rejects(C.crawlSource(source), /RSS/); pruefeFehlerwege(calls, source);
    });
  });
  await test("Neue lange Feedbeschreibungen erweitern die Titelmetadatenübernahme nicht", () => {
    for (const [i, source] of sources.entries()) {
      const item = { ...C.parseRssItems(feeds[i])[0], content: "Zusätzlicher Volltext. ".repeat(500) };
      const raw = C.normalizeRawItem(item, source);
      assert.equal(raw.content, raw.title); assert.equal(raw.excerpt, raw.title.slice(0, 240));
      const other = C.normalizeRawItem(item, { ...source, id: "anderer-feed" });
      assert(other.content.startsWith("Zusätzlicher Volltext."));
    }
  });
  await test("Beide bisherigen Wege bleiben trotz passendem Profil und Basisbindung inaktiv", async () => {
    assert.equal(sources.length, 2);
    for (const source of sources) {
      assert.equal(source.active, false); assert.equal(source.preparedOnly, true);
      assert.equal(v1Sources.filter(s => s.id === source.id).length, 1);
      const entry = catalog.retrievalPaths.find(p => p.legacy_source_id === source.id);
      assert.equal(entry.status, "paused"); assert.equal(entry.activation_mode, "manual");
      assert.equal(entry.method, "rss"); assert.equal(M.isPathActive(entry, ["pkg-bund-basis"]), false);
      assert.equal(entry.usage_policy.scope, source.id === eurlex.id ? "metadata_and_verified_legal_excerpt" : "metadata_only"); assert.equal(entry.usage_policy.fullTextAllowed, false);
    }
    await transport("", 200, async calls => {
      const result = await C.crawlAllSources(sources);
      assert.equal(result.checkedSources, 0); assert.deepEqual(result.rawItems, []);
      assert.deepEqual(result.results, []); assert.deepEqual(calls, []);
    });
  });
  await test("EUR-Lex gehört zur EU-Vertiefung, Bundespuls zur Bundesbasis", () => {
    for (const source of sources) {
      const bound = catalog.packagePaths.filter(p => p.retrieval_path_id === `rp-${source.id}`);
      assert.deepEqual(bound.map(p => p.package_id), source.packageKeys.map(key => `pkg-${key}`));
    }
    assert(resolveProfilePackages({ politische_ebene: "bundestag", ausschuesse: ["Europäische Union"] }).all.includes("fach-europaeische-union"));
    assert(!catalog.unmapped.includes(eurlex.id)); assert(!catalog.unmapped.includes(bundespuls.id));
  });
  await test("Herausgeberrollen trennen amtliches EUR-Lex vom privaten DIP-Aggregator", () => {
    const official = catalog.publishers.find(p => p.canonical_domain === "eur-lex.europa.eu");
    const aggregator = catalog.publishers.find(p => p.canonical_domain === "bundespuls.de");
    assert.equal(official.evidence_role, "official_primary"); assert.equal(official.trust, "hoch");
    assert.equal(aggregator.evidence_role, "aggregator"); assert.equal(aggregator.publisher_type, "aggregator");
    assert.equal(aggregator.trust, "unbekannt"); assert.equal(aggregator.entity_id, null);
    assert.equal(catalog.retrievalPaths.filter(p => p.id === "rp-dip").length, 1);
    assert.equal(catalog.retrievalPaths.find(p => p.id === "rp-dip").activation_mode, "always_on");
  });
  await test("Bundespuls ist weder amtlicher noch unabhängiger journalistischer Faktenbeleg", () => {
    const bp = S.assessDocument({ url: "https://bundespuls.de/vorgang/341273", sourceType: "aggregator" });
    const news = S.assessDocument({ url: "https://www.tagesschau.de/inland/meldung.html" });
    assert.equal(bp.trust, "unbekannt"); assert.equal(bp.category, "unbekannt");
    assert.equal(S.isCriticalClaimConfirmed([bp]), false);
    assert.equal(S.isCriticalClaimConfirmed([bp, news]), false);
    assert.equal(S.isCriticalClaimConfirmed([S.assessDocument({ url: "https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32026R2409" })]), true);
    assert.notEqual(S.assessLink("https://example.europa.eu/").trust, "hoch");
    assert.notEqual(S.assessLink("https://eur-lex.europa.eu.example.org/").trust, "hoch");
  });
  await test("Kurationslimit schneidet vorbereitete Ergänzungen nicht ab", () => {
    const child = spawnSync(process.execPath, ["-e", 'process.stdout.write(JSON.stringify(require("./lib/helmut/sources").v1Sources.map(s=>s.id)))'], {
      cwd: path.join(__dirname, ".."), env: { ...process.env, HELMUT_SOURCE_TARGET: "1" }, encoding: "utf8"
    });
    assert.equal(child.status, 0, child.stderr);
    const ids = JSON.parse(child.stdout);
    for (const source of sources) assert(ids.includes(source.id));
  });
  await test("Nur explizit aktivierte relationale Zeilen starten trotz inaktiver Legacy-Seeds", async () => {
    const entries = catalog.retrievalPaths.filter(p => sources.some(s => p.legacy_source_id === s.id));
    const planned = entries.map(p => ({ ...p, status: "needs_review", activation_mode: "always_on" }));
    const params = { packages: catalog.packages, packagePaths: catalog.packagePaths, legacySources: v1Sources, profiles: [], env: {} };
    assert.equal(buildRelationalCrawlPlan({ ...params, retrievalPaths: entries }).aktiv.length, 0);
    const plan = buildRelationalCrawlPlan({ ...params, retrievalPaths: planned });
    assert.equal(plan.aktiv.length, 2);
    for (const entry of plan.aktiv) {
      assert.equal(entry.source.active, true);
      const i = sources.findIndex(s => s.id === entry.legacy_source_id);
      await transport(feeds[i], 200, async (calls, requests) => {
        const items = await C.crawlSource(entry.source);
        assert.equal(items.length, 3); assert.deepEqual(calls, [sources[i].url]);
        assert.equal(requests[0].options.headers["user-agent"], H.BOT_USER_AGENT);
        for (const item of items) assert.equal(H.leseParlamentsdatenHerkunft(item).evidenceRole, sources[i].evidenceRole);
      });
    }
    assert(sources.every(source => source.active === false && source.preparedOnly === true));
  });
  await test("Bot-Kontakt gilt nur an den zwei belegten Feedadressen", async () => {
    for (const url of ["https://example.org/feed", "https://bundespuls.de/feed/abstimmung", "https://eur-lex.europa.eu/DE/display-feed.rss?rssId=161"]) {
      await transport("<rss><channel/></rss>", 200, async (calls, requests) => {
        await C.fetchUrl(url);
        assert.equal(requests[0].options.headers["user-agent"], "HelmutBot/1.0 political-briefing");
      });
    }
    assert.equal(bundespuls.usagePolicy.recommendedCacheSeconds, 900);
    for (const source of sources) {
      assert.equal(source.rightsReviewRequired, false);
      assert.equal(source.usagePolicy.commercialUseApproved, true);
      assert.equal(source.usagePolicy.scope, source.id === eurlex.id ? "metadata_and_verified_legal_excerpt" : "metadata_only");
      assert.equal(source.usagePolicy.fullTextAllowed, false);
    }
  });
  await test("Herkunft bleibt in beiden Speicherprojektionen und allen Quellen-DTOs gebunden", () => {
    sources.forEach((source, i) => {
      const raw = C.normalizeRawItem(C.parseRssItems(feeds[i])[0], source);
      const variants = [D.toRawDocumentRow(raw), G.planDedupWrites([raw], []).persists[0]];
      for (const value of variants) {
        const doc = JSON.parse(JSON.stringify(value)); // JSONB-/Dateispeicher-Roundtrip
        const notice = H.parlamentsdatenQuellenhinweis(doc);
        assert(notice); assert.equal(doc.summary ?? null, null, "Kein abgeschnittener Titel als Artikelkontext");
        assert.equal(notice.sourceId, source.id);
        assert.equal(doc.published_at, i ? null : "2026-11-05T23:00:00.000Z");
        for (const dto of [L.mapSource(doc), B.buildSources({}, [doc])[0], R.pickPrimarySource({}, [doc]), B.oeffnendeHelmutQuelle({}, [doc])]) {
          assert.equal(dto.sourceNotice.text, notice.text);
          assert.equal(dto.sourceNotice.articleUrl, dto.url);
          assert.equal(dto.sourceNotice.originalUrl, notice.originalUrl);
        }
        assert(!JSON.stringify(doc.raw).includes(C.parseRssItems(feeds[i])[0].content || "__nicht_im_feed__"));
      }
    });
  });
  await test("DIP-Quellenpflicht, kostenlose Originale und Titelkürzung werden konkret gekennzeichnet", () => {
    const entry = C.parseRssItems(feeds[1])[0];
    const raw = C.normalizeRawItem({ ...entry, title: "Beratung zur Drucksache 21/1234 " + "weiterer Titeltext ".repeat(30) }, bundespuls);
    const doc = D.toRawDocumentRow(raw), notice = H.parlamentsdatenQuellenhinweis(doc);
    assert(notice.text.includes("Deutscher Bundestag/Bundesrat – DIP"));
    assert(notice.text.includes("Aufbereitung: Bundespuls"));
    assert(notice.text.includes("DIP-Vorgang 341273"));
    assert(notice.text.includes("Titel nennt Drucksache 21/1234"));
    assert.equal(notice.originalUrl, "https://dip.bundestag.de");
    assert.equal(notice.originalLabel, "Originaldaten kostenlos bei DIP");
    assert(notice.changes.includes("Titel gekürzt"));
    const withoutNumber = H.parlamentsdatenQuellenhinweis(D.toRawDocumentRow(C.normalizeRawItem(entry, bundespuls)));
    assert(!withoutNumber.text.includes("Drucksache"), "Vorgangs-ID wird keine erfundene Drucksachennummer");
  });
  await test("Falsche Herkunfts-IDs, Artikelziele und fremde Rohfelder werden nicht weitergegeben", () => {
    const raw = C.normalizeRawItem(C.parseRssItems(feeds[1])[0], bundespuls);
    for (const altered of [
      { ...raw, sourceId: "andere-quelle" },
      { ...raw, url: "https://bundespuls.de/vorgang/123" },
      { ...raw, title: "Veränderter fremder Titel" },
      { ...raw, parlamentsdatenHerkunft: { ...raw.parlamentsdatenHerkunft, fullText: "verbotener Zusatz" } },
      { ...raw, parlamentsdatenHerkunft: null }
    ]) {
      assert.equal(H.parlamentsdatenQuellenhinweis(altered), null);
      assert.throws(() => D.toRawDocumentRow(altered), /parlamentsdaten-herkunft/);
    }
    for (const url of ["https://example.org/vorgang/341273", "https://bundespuls.de/vorgang/341273?fremd=1", "https://bundespuls.de/impressum"])
      assert.throws(() => C.normalizeRawItem({ ...C.parseRssItems(feeds[1])[0], url }, bundespuls), /parlamentsdaten-artikelziel/);
    assert.deepEqual(H.quellenhinweisFelder(raw, "https://example.org/artikel"), {});
    assert.equal(H.parlamentsdatenQuellenhinweis({ source_id: "anderer-feed", title: "Anderer Artikel", url: "https://example.org/artikel" }), null);
  });
  await test("Metadatenfeeds öffnen auch später keinen Artikeltext-Nachladepfad", async () => {
    for (const [i, source] of sources.entries()) {
      const raw = C.normalizeRawItem(C.parseRssItems(feeds[i])[0], source);
      const doc = D.toRawDocumentRow(raw);
      let io = 0;
      const forbidden = () => { io++; throw new Error("Kein Abruf oder Speicherzugriff erlaubt"); };
      assert.deepEqual(await K.beschaffeArtikelkontext(doc, { versuch: true }, {
        fetchUrl: forbidden, speicher: { lesen: forbidden, reservieren: forbidden, abschliessen: forbidden }
      }), { ok: false, reason: "quelle-nur-metadaten" });
      assert.equal(io, 0);
      assert.throws(() => A.pruefeArtikelkontext([doc], { version: 1, herkunft: "manueller-originalvergleich", dokumentId: doc.id }), /quelle-nur-metadaten/);
      assert.deepEqual(E.fromHtml(doc, { body: "<article>Unbestellter Volltext</article>", finalUrl: doc.url }), { ok: false, reason: "quelle-nur-metadaten" });
      assert.deepEqual(E.fromMirror(doc, [{ ...raw, content: "Unbestellter Volltext" }]), { ok: false, reason: "quelle-nur-metadaten" });
    }
  });
  await test("Produktiver PostgREST-Alias und kompakte Serverantwort erhalten den Quellenhinweis", () => {
    const row = D.toRawDocumentRow(C.normalizeRawItem(C.parseRssItems(feeds[1])[0], bundespuls));
    const projected = { ...row, parlamentsdatenHerkunft: row.raw.parlamentsdatenHerkunft };
    delete projected.raw;
    const source = B.buildSources({}, [JSON.parse(JSON.stringify(projected))])[0];
    assert(source.sourceNotice);
    const item = { id: "hinweis-test", title: row.title, url: row.url, sourceName: row.source_name,
      sourceNotice: source.sourceNotice, sources: [source], primarySource: source };
    const payload = require("../server").__prepareBriefingResponse({
      items: [item], homeSections: { topTasks: [item] }
    }, { compact: true });
    const wire = JSON.parse(JSON.stringify(payload));
    for (const notice of [wire.items[0].sources[0].sourceNotice, wire.items[0].primarySource.sourceNotice,
      wire.homeSections.topTasks[0].sourceNotice, wire.homeSections.topTasks[0].sources[0].sourceNotice])
      assert.deepEqual(notice, source.sourceNotice);
    assert.equal(H.leseParlamentsdatenHerkunft(projected).sourceId, bundespuls.id);
  });
  await test("DIP plus Bundespuls erhöht Korroboration und Dynamik nicht; Journalismus weiterhin schon", () => {
    const scoring = require("../lib/helmut/scoring"), decisions = require("../lib/helmut/decisions");
    const bp = D.toRawDocumentRow(C.normalizeRawItem(C.parseRssItems(feeds[1])[0], bundespuls));
    const dip = { id: "dip-test", source_id: "dip", source_type: "official", url: "https://dip.bundestag.de/vorgang/341273",
      title: "Parlament berät einen Gesetzentwurf", published_at: "2026-11-06T10:00:00Z" };
    const media = { ...dip, id: "news-test", source_id: "tagesschau-politik", source_type: "media", url: "https://www.tagesschau.de/inland/bericht-100.html" };
    const ko = { id: "ko-herkunft", vorgang_id: "vg-herkunft", status: "neu", source_document_count: 1, created_at: dip.published_at };
    const pair = { ...ko, source_document_count: 2 };
    const projection = H.bewertungsprojektion(pair, [dip, bp]);
    assert.equal(projection.source_document_count, 2);
    assert.equal(JSON.stringify(projection), JSON.stringify(pair), "Kein neuer persistierter Zähler");
    assert.equal(scoring.globalImportance(projection).score, scoring.globalImportance(ko).score);
    // Identischer fachlicher Zeitpunkt fuer beide Seiten; keine Millisekundenrennen.
    const now = new Date("2026-11-06T16:00:00Z");
    assert.equal(scoring.dynamicsScore(projection, now.getTime()), scoring.dynamicsScore(ko, now.getTime()));
    assert.equal(decisions.scoreKnowledgeObject(projection), decisions.scoreKnowledgeObject(ko));
    const independent = H.bewertungsprojektion(pair, [dip, media]);
    assert.equal(independent, pair, "Bestehende unabhängige Quellen bleiben unverändert");
    assert(scoring.globalImportance(independent).score > scoring.globalImportance(ko).score);
    assert(scoring.dynamicsScore(independent, now.getTime()) > scoring.dynamicsScore(ko, now.getTime()));
    assert(decisions.scoreKnowledgeObject(independent) > decisions.scoreKnowledgeObject(ko));
    const selection = [{ knowledge_object_id: ko.id }];
    const radar = docs => R.buildDynamics(selection, { [ko.id]: { ...ko, source_document_count: docs.length } }, { [ko.vorgang_id]: docs }, now);
    assert.deepEqual(radar([dip]), []); assert.deepEqual(radar([dip, bp]), []);
    assert.equal(radar([dip, media])[0].signalType, "broadening");
  });
  await test("BMG Direktfeed ist ausschliesslich vorbereitet und an seine zwei Fachpakete gebunden", () => {
    assert.equal(registeredSources.length, 3);
    assert.equal(bmg.active, false); assert.equal(bmg.preparedOnly, true);
    assert.equal(bmg.maxItems, 12);
    assert.equal(bmg.rightsReviewRequired, false);
    assert.equal(bmg.usagePolicy.scope, "metadata_only");
    assert.equal(bmg.usagePolicy.commercialUseApproved, true);
    for (const key of ["fullTextAllowed", "imagesAllowed", "aiTrainingAllowed"]) assert.equal(bmg.usagePolicy[key], false);
    assert.equal(bmg.usagePolicy.legalExcerptAllowed, undefined);
    assert.equal(v1Sources.filter(s => s.id === bmg.id).length, 1);
    const entry = catalog.retrievalPaths.find(p => p.legacy_source_id === bmg.id);
    assert.equal(entry.method, "rss"); assert.equal(entry.status, "paused"); assert.equal(entry.activation_mode, "manual");
    assert.deepEqual(catalog.packagePaths.filter(p => p.retrieval_path_id === entry.id).map(p => p.package_id).sort(),
      ["pkg-arbeit-und-soziales", "pkg-fach-gesundheit"]);
    assert.equal(M.isPathActive(entry, ["pkg-arbeit-und-soziales", "pkg-fach-gesundheit"]), false);
  });
  await test("BMG RSS wird ohne Artikelabruf mit CET Itemdatum zu titelgebundenen Metadaten und DTOs", async () => {
    const xml = bmgXml(bmgItem(), bmgItem({ url: "https://www.bundesgesundheitsministerium.de/deutscher-pflegetag-2026",
      title: "Linnemann: Pflege geht über reine Versorgung hinaus", date: "Thu, 12 Nov 2026 00:00:00 CET" }));
    await transport(xml, 200, async calls => {
      const rawItems = await C.crawlSource(bmg);
      assert.deepEqual(calls, [bmg.url]); assert.equal(rawItems.length, 2);
      assert.deepEqual(rawItems.map(r => r.publishedAt), ["2026-11-15T23:00:00.000Z", "2026-11-11T23:00:00.000Z"]);
      for (const raw of rawItems) {
        assert.equal(raw.content, raw.title); assert.equal(raw.excerpt, raw.title.slice(0, 240));
        assert.equal(raw.imageUrl, null); assert.equal(raw.author, bmg.name);
        assert.equal(raw.originalUrl, "");
        for (const stored of [D.toRawDocumentRow(raw), G.planDedupWrites([raw], []).persists[0]]) {
          const doc = JSON.parse(JSON.stringify(stored));
          assert.equal(doc.summary ?? null, null);
          const origin = H.leseParlamentsdatenHerkunft(doc), notice = H.parlamentsdatenQuellenhinweis(doc);
          assert(origin); assert.equal(origin.identifier.kind, "BMG-Meldung");
          assert.equal(origin.publicationTime, doc.published_at); assert.equal(origin.scope, "title_link_metadata");
          assert.equal(origin.evidenceRole, "official_primary");
          assert.equal(notice.originalUrl, doc.url); assert.equal(notice.licenseUrl, "https://www.bundesgesundheitsministerium.de/impressum");
          assert(notice.text.includes("Bundesministerium für Gesundheit")); assert(!JSON.stringify(notice).includes("CC0"));
          for (const dto of [L.mapSource(doc), B.buildSources({}, [doc])[0], R.pickPrimarySource({}, [doc]), B.oeffnendeHelmutQuelle({}, [doc])])
            assert.deepEqual(dto.sourceNotice, { ...notice, articleUrl: dto.url });
          assert(H.leseParlamentsdatenHerkunft({ ...doc, url: doc.canonical_url }), "Exakte kanonische Originalprojektion bleibt gebunden");
          assert(!JSON.stringify(doc).includes("NICHT_FREIGEGEBEN"));
          const alias = { ...doc, parlamentsdatenHerkunft: doc.raw.parlamentsdatenHerkunft,
            published_at: doc.published_at.replace(".000Z", "+00:00") };
          delete alias.raw;
          assert(H.leseParlamentsdatenHerkunft(alias), "Gleicher Zeitwert nach PostgREST bleibt gebunden");
        }
      }
    });
  });
  await test("BMG Feedidentitaet, lange Titel, fehlende Itemzeit und fremde Artikelziele bleiben geschlossen", async () => {
    const item = C.parseRssItems(bmgXml(bmgItem()))[0];
    for (const source of [{ ...bmg, url: "https://example.org/feed" }, { ...bmg, rssUrl: "https://example.org/feed" },
      { ...bmg, rssUrls: [bmg.url, "https://example.org/feed"] }, { ...bmg, rssUrls: "ungueltig" }, { ...bmg, crawlMethod: "html" }]) {
      assert.equal(C.normalizeRawItem(item, source), null);
      await transport("<html>Kein Fallback</html>", 200, async calls => {
        await assert.rejects(C.crawlSource(source), /bmg-feed-identitaet-nicht-freigegeben/); assert.deepEqual(calls, []);
      });
    }
    for (const altered of [{ ...item, title: "a".repeat(301) }, { ...item, publishedAt: null },
      { ...item, publishedAt: "ungueltig" }, ...["https://example.org/fremder-artikel", "https://www.bundesgesundheitsministerium.de/",
        "https://www.bundesgesundheitsministerium.de/impressum", bmgUrl + "?fremd=1", bmgUrl + "#fremd",
        "https://www.bundesgesundheitsministerium.de.example.org/falscher-artikel"].map(url => ({ ...item, url }))])
      assert.equal(C.normalizeRawItem(altered, bmg), null);
    assert.equal(C.normalizeRawItem({ ...item, title: "a".repeat(300) }, bmg).title.length, 300);
    assert.equal(C.normalizeRawItem(C.parseRssItems(bmgXml(bmgItem({ date: null })))[0], bmg), null,
      "KanalpubDate ersetzt keine Itempublikation");
    await transport(bmgXml(bmgItem({ url: "https://www.sozialwahl.de/fremde-meldung" }), bmgItem()), 200, async calls => {
      const items = await C.crawlSource(bmg);
      assert.equal(items.length, 1); assert.equal(items[0].url, bmgUrl); assert.deepEqual(calls, [bmg.url]);
    });
  });
  await test("BMG Herkunft bindet Datum, Host und Umfang ohne spaeteren Originaltextpfad", async () => {
    const raw = C.normalizeRawItem(C.parseRssItems(bmgXml(bmgItem()))[0], bmg);
    const doc = D.toRawDocumentRow(raw);
    for (const mutate of [d => d.source_id = "andere-quelle", d => d.title = "Anderer Titel",
      d => d.published_at = "2026-11-14T23:00:00Z", d => d.published_at = null,
      d => d.url += "?fremd=1", d => d.canonical_url += "?fremd=1", d => d.canonical_url = "https://example.org/fremder-artikel",
      d => d.raw.parlamentsdatenHerkunft.scope = "licensed_rss_excerpt",
      d => d.raw.parlamentsdatenHerkunft.publicationTime = "2026-11-14T23:00:00.000Z",
      d => d.raw.parlamentsdatenHerkunft.fullText = "Ungeprueft"] ) {
      const changed = structuredClone(doc); mutate(changed);
      assert.equal(H.leseParlamentsdatenHerkunft(changed), null);
      assert.throws(() => D.toRawDocumentRow(changed), /parlamentsdaten-herkunft/);
    }
    let io = 0;
    const forbidden = () => { io++; throw new Error("Kein IO erlaubt"); };
    assert.deepEqual(await K.beschaffeArtikelkontext(doc, { versuch: true }, {
      fetchUrl: forbidden, speicher: { lesen: forbidden, reservieren: forbidden, abschliessen: forbidden }
    }), { ok: false, reason: "quelle-nur-metadaten" });
    assert.deepEqual(E.fromHtml(doc, { body: "<article>Unbestellter Volltext</article>", finalUrl: doc.url }), { ok: false, reason: "quelle-nur-metadaten" });
    assert.deepEqual(E.fromMirror(doc, [{ ...raw, content: "Unbestellter Volltext" }]), { ok: false, reason: "quelle-nur-metadaten" });
    assert.equal(io, 0);
  });
  await test("BMG unterscheidet fehlende Metadatenbestaetigung von echtem Leerfeed und gueltigem Nachbarn", async () => {
    await transport(bmgXml(bmgItem({ date: null }), bmgItem({ url: "https://example.org/fremde-meldung" })), 200, async calls => {
      await assert.rejects(C.crawlSource(bmg), /RSS parser: bmg-metadaten-nicht-bestaetigt/);
      assert.deepEqual(calls, [bmg.url], "Kein HTML- oder Originalnachladen nach verworfenen Metadaten");
    });
    await transport(bmgXml(), 200, async calls => {
      assert.deepEqual(await C.crawlSource(bmg), []); assert.deepEqual(calls, [bmg.url]);
    });
    await transport(bmgXml(bmgItem({ date: null }), bmgItem()), 200, async calls => {
      const items = await C.crawlSource(bmg);
      assert.equal(items.length, 1); assert.equal(items[0].url, bmgUrl); assert.deepEqual(calls, [bmg.url]);
    });
    await transport(bmgXml(bmgItem({ url: "https://news.google.com/rss/articles/CBMiFremderNachbar" }), bmgItem()), 200, async calls => {
      const items = await C.crawlSource({ ...bmg, type: "person", name: "Fremde Herausgeberbehauptung" });
      assert.equal(items.length, 1); assert.equal(items[0].url, bmgUrl);
      assert.equal(items[0].sourceName, bmg.name); assert.equal(items[0].sourceType, "official");
      assert.equal(items[0].author, bmg.name); assert.equal(items[0].imageUrl, null);
      assert.deepEqual(calls, [bmg.url], "Kein Google-, Original- oder Bildabruf fuer BMG-Metadaten");
    });
  });
  console.log(`\n${passed}/${passed} Prüfgruppen bestanden; kein Netz, keine DB, kein Modell.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
