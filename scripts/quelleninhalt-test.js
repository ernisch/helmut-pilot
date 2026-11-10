"use strict";
// Echte oeffentliche Quellenproben + deklarierte synthetische Grenzfaelle.
// Produktionszugriffe sind durch scripts/lokal.js gesperrt; Modell/REST sind Attrappen.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const C = require("../lib/helmut/crawler");
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const M = require("../lib/helmut/quellenarchitektur/source-mode");
const E = require("../lib/helmut/quellen-auszug");
const U = require("../lib/helmut/understanding");
const storage = require("../lib/helmut/storage");
const root = path.join(__dirname, "fixtures/quelleninhalt-20261107");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const source = { id: "fixture", name: "Quellenprobe", type: "media", url: "https://example.org/feed" };
const full = "Der Ausschuss hört am Dienstag Fachleute zur Finanzierung kommunaler Beratungsstellen an.";
const title = "Parlament berät kommunale Angebote";
const rss = text => `<rss><channel><item><title>${title}</title><link>https://example.org/beratung</link>${text}</item></channel></rss>`;
const rowFromXml = xml => D.toRawDocumentRow(C.normalizeRawItem(C.parseRssItems(xml)[0], source));
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function main() {
  await test("Originalproben sind an ihre Dateihashes gebunden", () => {
    for (const entry of JSON.parse(read("manifest.json")))
      assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, entry.file))).digest("hex"), entry.fixture_sha256);
  });
  const google = C.parseRssItems(read("dgb-google.xml"))[0];
  const url = "https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/dritte-tarifrunde-im-gebaeudereiniger-handwerk-endet-ohne-ergebnis/";
  const dgb = C.normalizeRawItem({ ...google, url, originalUrl: google.url },
    { id: "dgb", name: "DGB", type: "association", url: "https://news.google.com/rss/search?q=site:dgb.de", retrievalPathId: "rp-dgb" });
  await test("Echter Google-Treffer hat nur Titel/Herausgeber, keinen Artikelauszug", () => {
    assert.equal(D.toRawDocumentRow(dgb).summary, null);
    assert.equal(E.fromMirror(D.toRawDocumentRow(dgb), [dgb]).ok, false);
    assert.equal(JSON.parse(U.buildUnderstandingPrompt({ documents: [D.toRawDocumentRow(dgb)] }).split("\n").find(x => x.startsWith('{"quelle_id"'))).auszug, "");
  });
  await test("Echter hib-Kurztext erreicht die Promptquelle wortgetreu", () => {
    const parsed = C.parseRssItems(read("hib.xml"))[0];
    const row = rowFromXml(read("hib.xml"));
    assert.equal(row.summary, parsed.content);
    assert(U.buildUnderstandingPrompt({ documents: [row] }).includes(JSON.stringify(parsed.content)));
  });
  await test("Synthetisch: Titelbeschreibung verdeckt content:encoded nicht", () => {
    const row = rowFromXml(rss(`<description>${title}</description><content:encoded><![CDATA[<p>${full}</p>]]></content:encoded>`));
    assert.equal(row.summary, full);
  });
  await test("Synthetisch: RSS/Atom-Felder behalten bestehende Prioritaet und exakte Tagnamen", () => {
    assert.equal(rowFromXml(rss(`<description>${full}</description><content>Andere Aussage.</content>`)).summary, full);
    assert.equal(rowFromXml(rss(`<content:encoded>Andere Aussage.</content:encoded><content>${full}</content>`)).summary, full);
    const atom = `<feed><entry><title>${title}</title><link href="https://example.org/beratung"/><summary>${title}</summary><content type="html">${full}</content></entry></feed>`;
    assert.equal(rowFromXml(atom).summary, full);
  });
  await test("Gelieferte eindeutige RSS-/Atom-Fortsetzung erreicht Rohprojektion und Prompt ganz", () => {
    const fortsetzung = full + " Die Fachleute widersprechen der bisherigen Einschätzung und verlangen zusätzliche Mittel für die Beratung.";
    for (const tags of [["description", "content:encoded"], ["summary", "content"]]) {
      const body=`<${tags[0]}>${full}</${tags[0]}><${tags[1]}><![CDATA[<p>${full}</p><p>${fortsetzung.slice(full.length).trim()}</p>]]></${tags[1]}>`;
      const xml=tags[0]==="summary" ? `<feed><entry><title>${title}</title><link href="https://example.org/beratung"/>${body}</entry></feed>` : rss(body);
      const row = rowFromXml(xml);
      assert.equal(row.summary, fortsetzung);
      assert(U.buildUnderstandingPrompt({ documents: [row] }).includes(JSON.stringify(fortsetzung)));
    }
    const anders = full + " Ein anderer vollständiger Folgeabsatz bleibt eine abweichende Fassung.";
    assert.equal(rowFromXml(rss(`<description>${full}</description><content>${fortsetzung}</content><content:encoded>${anders}</content:encoded>`)).summary, full);
  });
  await test("RSS-HTML uebernimmt keine Script-/Style-Prosa als Artikelinhalt", () => {
    const row = rowFromXml(rss(`<description><![CDATA[<script>Erfundene politische Entscheidung wurde beschlossen.</script><style>Weitere erfundene Aussage.</style><p>${full}</p>]]></description>`));
    assert.equal(row.summary, full);
  });
  await test("Ein ueberlanger gewoehnlicher Titel wird nicht als abgeschnittene Behauptung uebernommen", () => {
    const invalid = title + " Weitere Angaben zur Beratung".repeat(14) + " wurden nicht beschlossen.";
    assert(invalid.length > 300);
    assert.equal(C.normalizeRawItem({title:invalid,url:"https://example.org/zu-lang",content:invalid},source),null);
    const exact = "G".repeat(300);
    assert.equal(C.normalizeRawItem({title:exact,url:"https://example.org/ganz",content:full},source).title,exact);
    assert.equal(rowFromXml(rss(`<description>${full}</description>`)).summary,full);
  });
  await test("Echter Rohspiegel: Anzeigeabschnitt verliert seinen Vorrang vor ganzen Saetzen", () => {
    const examples = JSON.parse(read("rohspiegel.json")).examples;
    const dlf = examples[0];
    const expected = dlf.content;
    assert.equal(D.sourceExcerpt(dlf), expected);
    assert(dlf.content.startsWith(expected));
    assert.notEqual(expected, dlf.excerpt);
    const mauerfall = examples[1];
    assert.equal(D.sourceExcerpt(mauerfall), E.satzpraefix(mauerfall.content, D.SUMMARY_MAX));
    // Der vollstaendige255-Zeichen-Originalsatz darf nicht wegen der alten
    // Anzeigegrenze verschwinden. Kein Umformulieren und kein neuer Abruf.
    const original = examples[2].content;
    const row = D.toRawDocumentRow(examples[2]);
    assert.equal(row.summary, original); assert.equal(D.toRawDocumentRow(row).summary, original);
    assert(U.buildUnderstandingPrompt({ documents: [row] }).includes(JSON.stringify(original)));
  });
  await test("Synthetisch: vorhandene summary bleibt, unbrauchbarer Kandidat blockiert Alternative nicht", () => {
    assert.equal(D.sourceExcerpt({ title, summary: full, content: "Andere Aussage." }), full);
    const kurz = "Der Ausschuss berät über zusätzliche Finanzierung für kommunale Beratungsstellen";
    assert.equal(D.sourceExcerpt({ title, summary: kurz, content: full + " Zusätzlicher vollständiger Originalsatz." }), kurz);
    assert.equal(D.sourceExcerpt({ title, summary: "Offener Text ".repeat(40), content: full }), full);
    assert.equal(D.sourceExcerpt({ title, excerpt: "Ohne Satzende ".repeat(30).slice(0, 240) }), null);
    assert.equal(D.sourceExcerpt({ title, content: title }), null);
    const longTitle = title + ". " + "Weitere Angaben zur angekündigten Beratung ".repeat(8);
    assert.equal(D.sourceExcerpt({ title: longTitle, content: longTitle, excerpt: longTitle.slice(0, 240) }), null);
  });
  await test("Tatsaechliche Abrufwegkennung und Google-Fundadresse ueberstehen zwei Projektionen", () => {
    const actualPath = { id: "rp-eigene-kennung", legacy_source_id: "dgb", name: "DGB", method: "rss", url: source.url };
    for (const legacy of [new Map(), new Map([["dgb", source]])]) {
      const crawlSource = M.toCrawlerSource(actualPath, legacy);
      const item = C.normalizeRawItem({ ...google, url, originalUrl: google.url }, crawlSource);
      const row = D.toRawDocumentRow(D.toRawDocumentRow(item));
      const finding = G.planDedupWrites([row]).findings[0];
      assert.equal(finding.retrieval_path_id, actualPath.id);
      assert.equal(finding.original_url, google.url);
      assert.equal(finding.raw_document_id, row.id);
    }
    assert.equal(G.buildFinding({ source_id: "dynamisch-ohne-katalog", url }).retrieval_path_id, null);
  });
  const before = D.toRawDocumentRow(dgb);
  const original = E.fromHtml(before, { finalUrl: url, body: read("dgb-metadaten.html") });
  await test("Vorhandener Einzel-Extraktor belegt den DGB-Auszug, falsche Originale bleiben Luecken", () => {
    assert.equal(original.ok, true);
    assert.equal(original.summary, "Die dritte Tarifrunde im Gebäudereiniger-Handwerk ist ohne Ergebnis zu Ende gegangen. Die IG BAU hält das neue Arbeitgeber-Angebot für völlig inakzeptabel und zeigt sich kampfbereit.");
    assert.equal(original.origin, "artikel-metadaten");
    assert.equal(original.method, "og:description");
    assert.equal(before.summary, null);
    assert.equal(E.fromHtml(before, { finalUrl: url + "fremd", body: read("dgb-metadaten.html") }).ok, false);
    assert.equal(E.fromHtml(before, { finalUrl: url, body: `<title>${dgb.title}</title>` }).ok, false);
    const radioUrl = "https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen";
    assert.deepEqual(E.fromHtml({ url: radioUrl, title: "Sozialverband warnt vor Altersarmut in Niedersachsen - Radio Hannover" },
      { finalUrl: radioUrl, body: read("radio-hannover-metadaten.html") }), { ok: false, reason: "artikelziel-abweichend" });
  });
  await test("Isolierter REST-Write/Read und echter Understanding-Aufrufer uebergeben belegten Inhalt", async () => {
    const item = C.normalizeRawItem(C.parseRssItems(rss(`<description>${title}</description><content>${full}</content>`))[0],
      { ...source, retrievalPathId: "rp-tatsaechlicher-pfad" });
    const input = D.toRawDocumentRow(item);
    const previous = { fetch: global.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, v3: process.env.HELMUT_V3_STORE };
    const rows = new Map(); const findings = [];
    process.env.SUPABASE_URL = "http://127.0.0.1:9";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "lokale-attrappe";
    process.env.HELMUT_V3_STORE = "on";
    global.fetch = async (target, opts = {}) => {
      const u = new URL(target); assert.equal(u.origin, "http://127.0.0.1:9");
      if ((opts.method || "GET") === "GET") {
        if (u.pathname === "/rest/v1/knowledge_objects") return new Response("[]");
        assert.equal(u.pathname, "/rest/v1/raw_documents");
        return new Response(JSON.stringify(u.searchParams.has("id") ? [...rows.values()] : []));
      }
      assert.equal(opts.method, "POST");
      const body = JSON.parse(opts.body);
      if (u.pathname === "/rest/v1/raw_documents") {
        assert.equal(opts.headers.Prefer, "resolution=ignore-duplicates,return=representation");
        for (const r of body) rows.set(r.id, structuredClone(r));
      } else { assert.equal(u.pathname, "/rest/v1/document_findings"); findings.push(...body); }
      return new Response(JSON.stringify(body));
    };
    try {
      assert.equal((await storage.persistRawDocumentsDeduped([input])).persisted, 1);
      const loaded = await storage.getRawDocumentsByIds([input.id], { requireArray: true });
      assert.equal(loaded[0].summary, full);
      assert.equal(findings[0].retrieval_path_id, "rp-tatsaechlicher-pfad");
      let calls = 0;
      const result = await U.runUnderstandingShadow(loaded, {
        enabled: () => true, aiEnabled: () => true, acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
        getExisting: async () => null, findVorgangCandidates: async () => [], verstehenVertrag: () => null,
        clusterWache: null, gateMode: () => "off", priorityEnabled: () => false,
        canSpend: async () => ({ allowed: true }), modelName: () => "offline-attrappe", logSkip: () => {},
        requestUnderstanding: async prompt => {
          calls++; assert(prompt.includes(full)); assert(prompt.includes(input.id)); assert(prompt.includes(item.url));
          return { headline: title, was_ist_passiert: full, warum_wichtig: "Synthetischer Test", wer_ist_betroffen: "Synthetischer Test",
            parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "mittel",
            handlungsempfehlung: "Synthetischer Test", confidence_score: 70, display_title: title, display_summary: full };
        },
        save: async () => ({ saved: true }), saveSources: async () => {},
        savePending: async () => { throw Error("unerwartete Vormerkung"); }, markFailed: async () => { throw Error("unerwarteter Fehler"); }
      });
      assert.equal(calls, 1); assert.equal(result.counts.saved, 1);
    } finally {
      global.fetch = previous.fetch;
      for (const [key, value] of [["SUPABASE_URL", previous.url], ["SUPABASE_SERVICE_ROLE_KEY", previous.key], ["HELMUT_V3_STORE", previous.v3]])
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  await test("Vorhandener255-Zeichen-Originalsatz erreicht den tatsaechlich abgefangenen Modellaufrufer", async () => {
    const input = JSON.parse(read("rohspiegel.json")).examples[2];
    const row = D.toRawDocumentRow(D.toRawDocumentRow(input)); let calls = 0;
    assert.equal(row.summary, input.content);
    const result = await U.runUnderstandingShadow([row], {
      enabled: () => true, aiEnabled: () => true, acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
      getExisting: async () => null, findVorgangCandidates: async () => [], verstehenVertrag: () => null,
      clusterWache: null, gateMode: () => "off", priorityEnabled: () => false,
      canSpend: async () => ({ allowed: true }), modelName: () => "offline-originalsatz-attrappe", logSkip: () => {},
      requestUnderstanding: async prompt => {
        calls++; assert(prompt.includes(JSON.stringify(input.content))); assert(prompt.includes(row.id)); assert(prompt.includes(row.url));
        return { headline: row.title, was_ist_passiert: input.content, warum_wichtig: "Synthetische Kontrollantwort", wer_ist_betroffen: "Synthetische Kontrollantwort",
          parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "mittel", handlungsempfehlung: "Synthetische Kontrollantwort", confidence_score: 70,
          display_title: "Isolierte Originaltextpruefung", display_summary: "Synthetische Kontrollantwort" };
      },
      save: async () => ({ saved: true }), saveSources: async () => {},
      savePending: async () => { throw Error("unerwartete Vormerkung"); }, markFailed: async () => { throw Error("unerwarteter Fehler"); }
    });
    assert.equal(calls, 1); assert.equal(result.counts.saved, 1, JSON.stringify(result));
  });
  console.log(`${passed}/${passed} Pruefgruppen bestanden; 0 echte Modell-/REST-Aufrufe.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
