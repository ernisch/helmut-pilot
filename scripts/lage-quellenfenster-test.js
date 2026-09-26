"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const B = require("../lib/helmut/bundestag-artikelstand");
const A = require("../lib/helmut/artikelkontext");
const L = require("../lib/helmut/lage");
const Q = require("../lib/helmut/lage-quellenbeleg");
const storage = require("../lib/helmut/storage");
const now = new Date("2026-09-13T07:18:08Z");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const profile = { id: "mandat-fixture", committees: ["Arbeit und Soziales"] };
const ko = id => ({ id, vorgang_id: "vg-" + id, status: "neu", understanding_status: "complete",
  headline: "Neue Beratung zur Pflege", was_ist_passiert: "Neue Beratung zur Pflege",
  best_source_url: "https://example.org/" + id, updated_at: now.toISOString() });
const source = (id, published_at = "2026-09-12T08:00:00Z") => ({ id: "doc-" + id,
  title: "Beratung zur Pflege wird angesetzt", url: "https://example.org/" + id, published_at });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const old = Array.from({ length: 12 }, (_, i) => ko("alt-" + i));
const current = [ko("aktuell-a"), ko("aktuell-b")];
function store(pool, matches = old) { return {
  listKnowledgeObjects: async () => pool,
  listMatchingResults: async ({ userId }) => { assert.equal(userId, profile.id); return matches.map(k => ({ knowledge_object_id: k.id })); },
  listKnowledgeObjectsByIds: async ids => old.filter(k => ids.includes(k.id)),
  listAktuelleLageQuellen: async (ids, zeit) => {
    assert.equal(new Date(zeit).toISOString(), now.toISOString());
    return ids.filter(id => current.some(k => k.id === id)).map(id => ({ knowledge_object_id: id, raw_documents: source(id) }));
  }
}; }

// Synthetischer, ueber den echten v2-Beleg erzeugter Bundestags-Artikelstand.
function standQuelle(tag, nummer) {
  const text = "Der synthetische Beispielausschuss hat den Entwurf zur Beispielreform beraten und dem Plenum "
    + "die Annahme empfohlen.";
  const url = `https://www.bundestag.de/dokumente/textarchiv/2026/kw39-synthetische-vorlage-${nummer}`;
  const doc = { id: "local-" + nummer, title: "Synthetischer Beschlussbericht " + nummer, url, canonical_url: url,
    published_at: tag, retrieved_at: null, summary: "" };
  const beleg = { version: 2, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc), artikelUrl: url,
    artikelTitel: doc.title, herkunft: "strukturierter-originalartikel", gelesenAm: "2026-09-26T10:15:00.000Z",
    absatzPosition: 1, text, textHash: sha256(text),
    gewinnung: { verfahren: "bundestag-artikel-leitabsatz-v1", positionsbasis: "html-article-p",
      antwortHash: sha256("antwort-" + nummer), artikelTextHash: sha256("artikel-" + nummer),
      artikelTextPosition: 0, titelTreffer: 3, kandidatZahl: 1, artikelAbsatzZahl: 3 } };
  const erzeugt = B.erzeugeArtikelstand(doc, beleg);
  assert.equal(erzeugt.ok, true, JSON.stringify(erzeugt));
  return { ...erzeugt.row, source_name: "Synthetischer Bundestag" };
}

// Lokale PostgREST-Attrappe fuer beide Lesepfade des echten Lesers.
function standTransport(zeilen) {
  const anfragen = [];
  const request = async (endpoint) => {
    const p = new URL("https://example.org" + endpoint).searchParams;
    anfragen.push(p);
    const koFilter = p.get("knowledge_object_id") || "";
    const ids = koFilter.startsWith("in.") ? JSON.parse("[" + koFilter.slice(4, -1) + "]") : [];
    let gewaehlt = zeilen.filter(z => ids.includes(z.ko));
    for (const filter of p.getAll("raw_documents.published_at")) {
      if (filter === "is.null") gewaehlt = gewaehlt.filter(z => z.doc.published_at == null);
      else if (filter.startsWith("gte.")) gewaehlt = gewaehlt.filter(z =>
        z.doc.published_at != null && Date.parse(z.doc.published_at) >= Date.parse(filter.slice(4)));
      else gewaehlt = gewaehlt.filter(z =>
        z.doc.published_at != null && Date.parse(z.doc.published_at) <= Date.parse(filter.slice(4)));
    }
    if (p.get("raw_documents.raw->helmutBundestagArtikelstand") === "not.is.null") {
      gewaehlt = gewaehlt.filter(z => z.doc.raw?.helmutBundestagArtikelstand != null);
    }
    const spalten = p.get("select").replace(/^.*raw_documents(?:!inner)?\(/u, "").replace(/\)$/u, "").split(",");
    const projiziert = gewaehlt.map(z => ({ knowledge_object_id: z.ko,
      raw_documents: Object.fromEntries(spalten.map(spalte => {
        if (spalte === "bundestag_artikelstand:raw->helmutBundestagArtikelstand") {
          return ["bundestag_artikelstand", z.doc.raw?.helmutBundestagArtikelstand || null];
        }
        if (spalte === "bundestag_abgerufen_at:retrieved_at") return ["bundestag_abgerufen_at", z.doc.retrieved_at ?? null];
        return [spalte, z.doc[spalte] ?? null];
      })) }));
    const offset = Number(p.get("offset") || 0), limit = Number(p.get("limit"));
    return projiziert.slice(offset, offset + limit);
  };
  return { request, anfragen };
}
(async () => {
  await test("Zwoelf frisch analysierte Altquellen verdraengen keine zwei aktuellen Sachverhalte", async () => {
    const pool = [...old, ...current], before = JSON.stringify(pool);
    const rows = await L.loadRankedVorgaenge(store(pool), (_p, kos) => kos.map(k => ({ knowledge_object_id: k.id })),
      profile, profile.id, { quellenzeit: now });
    assert.deepEqual(rows.map(k => k.id).sort(), current.map(k => k.id).sort());
    assert.equal(Q.baueEingabe(rows, Object.fromEntries(current.map(k => [k.vorgang_id, [source(k.id)]])), now).length, 2);
    assert.equal(JSON.stringify(pool), before);
  });
  await test("Ein vorhandener Treffer ausserhalb des Fensters behaelt seinen echten aktuellen Quellenbeleg", async () => {
    const outside = ko("aussen"), s = store(current, [outside]);
    s.listKnowledgeObjectsByIds = async () => [outside];
    s.listAktuelleLageQuellen = async ids => ids.map(id => ({ knowledge_object_id: id, raw_documents: source(id) }));
    const rows = await L.loadRankedVorgaenge(s, null, profile, profile.id, { quellenzeit: now });
    assert(rows.some(k => k.id === outside.id));
  });
  await test("Ohne aktuelle Quelle bleibt die historische Kartenauswahl ohne neuen Quellenbeleg erhalten", async () => {
    const s = store(old); s.listAktuelleLageQuellen = async () => [];
    const rows = await L.loadRankedVorgaenge(s, null, profile, profile.id, { quellenzeit: now });
    assert.deepEqual(rows.map(k => k.id), old.map(k => k.id));
    assert.deepEqual(Q.baueEingabe(rows, {}, now), []);
  });
  await test("Undatierte, zukuenftige, alte und nicht oeffnende Belege werden vor der Auswahl ausgeschlossen", async () => {
    const s = store([...old, ...current]);
    s.listAktuelleLageQuellen = async () => [
      ...old.map((k, i) => ({ knowledge_object_id: k.id, raw_documents: source(k.id,
        [null, "2026-09-14T00:00:00Z", "2024-01-01T00:00:00Z"][i % 3]) })),
      { knowledge_object_id: current[0].id, raw_documents: { ...source("portal"), url: "https://example.org/" } },
      { knowledge_object_id: current[1].id, raw_documents: source(current[1].id) }];
    const rows = await L.loadRankedVorgaenge(s, (_p, kos) => kos.map(k => ({ knowledge_object_id: k.id })),
      profile, profile.id, { quellenzeit: now });
    assert.deepEqual(rows.map(k => k.id), [current[1].id]);
  });
  await test("Quellelesefehler sind eine Speicherstoerung, kein leerer ruhiger Tag", async () => {
    const s = store(current); s.listAktuelleLageQuellen = async () => { throw new Error("Lesefehler"); };
    await assert.rejects(() => L.loadRankedVorgaenge(s, null, profile, profile.id, { quellenzeit: now }), e => e.storeError === true);
  });
  await test("Metadaten werden gebuendelt, aktuell und in vollstaendigen Seiten gelesen", async () => {
    const requests = [], rows = Array.from({length:1000},(_,i)=>({knowledge_object_id:"eins",raw_documents:{id:"doc-"+i}}));
    const result = await storage.listAktuelleLageQuellen(["eins", "eins"], now, {
      ready:()=>true, request:async endpoint=>{ requests.push(endpoint); return requests.length===1 ? rows : []; }
    });
    assert.equal(result.length,1000); assert.equal(requests.length,3);
    const p = new URL("https://example.org"+requests[0]).searchParams;
    assert.equal(p.get("select"),"knowledge_object_id,raw_documents!inner(id,title,url,canonical_url,published_at)");
    assert.equal(p.get("knowledge_object_id"),'in.("eins")');
    assert.deepEqual(p.getAll("raw_documents.published_at"),["gte.2026-08-30T07:18:08.000Z","lte.2026-09-13T07:18:08.000Z"]);
    assert.equal(p.get("order"),"knowledge_object_id.asc,raw_document_id.asc");
    assert(new URL("https://example.org"+requests[1]).searchParams.get("offset")==="1000");
    // Zweiter, ebenso begrenzter Lesepfad: ausschliesslich Artikelstaende
    // (published_at absichtlich NULL) mit gezielter Projektion.
    const s = new URL("https://example.org"+requests[2]).searchParams;
    assert.equal(s.get("select"),"knowledge_object_id,raw_documents!inner(id,title,url,canonical_url,published_at,summary,"
      + "bundestag_artikelstand:raw->helmutBundestagArtikelstand,bundestag_abgerufen_at:retrieved_at)");
    assert.equal(s.get("knowledge_object_id"),'in.("eins")');
    assert.deepEqual(s.getAll("raw_documents.published_at"),["is.null"]);
    assert.equal(s.get("order"),"knowledge_object_id.asc,raw_document_id.asc");
    assert.equal(s.get("offset"),"0");
  });
  await test("Fehlende Verbindung, fremde Zeilen und unlesbare Antwort sind keine leeren Metadaten", async () => {
    for (const deps of [{ ready:()=>false }, {ready:()=>true,request:async()=>({})},
      {ready:()=>true,request:async()=>[{knowledge_object_id:"fremd",raw_documents:{id:"x"}}]}])
      await assert.rejects(()=>storage.listAktuelleLageQuellen(["eins"],now,deps));
  });
  await test("Quellenfenster gilt auch bei globalem Scoring vor dem Top N Schnitt", async () => {
    const previous = process.env.HELMUT_SCORING_MODE;
    process.env.HELMUT_SCORING_MODE = "on";
    try {
      const rows = await L.loadRankedVorgaenge(store([...old, ...current]), null,
        profile, profile.id, { quellenzeit: now });
      assert.deepEqual(rows.map(k => k.id).sort(), current.map(k => k.id).sort());
    } finally {
      if (previous === undefined) delete process.env.HELMUT_SCORING_MODE;
      else process.env.HELMUT_SCORING_MODE = previous;
    }
  });
  await test("Doppelte Seiten und die Leseobergrenze liefern niemals eine stille Teilmenge", async () => {
    let calls = 0;
    await assert.rejects(() => storage.listAktuelleLageQuellen(["eins"], now, {
      ready: () => true, request: async () => {
        calls++; return Array.from({ length: 1000 }, (_, i) => ({ knowledge_object_id: "eins", raw_documents: { id: "d-" + i } }));
      }
    }));
    assert.equal(calls, 2);
    calls = 0;
    await assert.rejects(() => storage.listAktuelleLageQuellen(["eins"], now, {
      ready: () => true, request: async () => {
        const start = calls++ * 1000;
        return Array.from({ length: 1000 }, (_, i) => ({ knowledge_object_id: "eins", raw_documents: { id: "d-" + (start + i) } }));
      }
    }), /lage-quellen-lesegrenze/);
    assert.equal(calls, 5);
  });
  await test("Grosse Kennungsmengen bleiben in Stapeln ohne zusaetzlichen globalen Scan", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => "ko-" + i), sizes = [];
    await storage.listAktuelleLageQuellen(ids, now, { ready: () => true, request: async endpoint => {
      const p = new URL("https://example.org" + endpoint).searchParams;
      sizes.push(p.get("knowledge_object_id").match(/"ko-/g).length); return [];
    } });
    // Je Stapel ein gewoehnlicher Zeitstempelpfad und ein Artikelstand-Pfad.
    assert.deepEqual(sizes, [100, 100, 100, 100, 1, 1]);
  });
  await test("Artikelstaende werden nur mit ganzem Berliner Publikationstag gelesen", async () => {
    const alt = process.env.HELMUT_BRIEFING_RELEVANZ_TAGE;
    process.env.HELMUT_BRIEFING_RELEVANZ_TAGE = "14";
    try {
      const fruehjahr = new Date("2026-03-31T12:00:00Z");
      const zeilen = [
        { ko: "ko-stand", doc: standQuelle("2026-03-16", "9100") },  // ausserhalb
        { ko: "ko-stand", doc: standQuelle("2026-03-17", "9101") },  // angebrochener Randtag
        { ko: "ko-stand", doc: standQuelle("2026-03-18", "9102") },  // innerer Rand: ganzer Tag im Fenster
        { ko: "ko-stand", doc: standQuelle("2026-03-29", "9103") },  // DST-Tag vollstaendig im Fenster
        { ko: "ko-stand", doc: standQuelle("2026-03-31", "9104") },  // heute noch nicht beendet
        { ko: "ko-stand", doc: standQuelle("2026-04-01", "9105") }   // kuenftig
      ];
      const { request, anfragen } = standTransport(zeilen);
      const gelesen = await storage.listAktuelleLageQuellen(["ko-stand"], fruehjahr, { ready: () => true, request });
      assert.deepEqual(gelesen.map(r => r.raw_documents.bundestag_artikelstand.publikationstag),
        ["2026-03-18", "2026-03-29"]);
      assert(gelesen.every(r => r.raw_documents.published_at === null));
      // Gezielte Projektion: Stand-Metadaten + summary, kein vollstaendiger raw-Payload.
      const standAnfrage = anfragen.find(p => p.get("raw_documents.raw->helmutBundestagArtikelstand") === "not.is.null");
      assert.equal(standAnfrage.get("select").includes("summary"), true);
      assert.equal(standAnfrage.get("select").includes("raw->helmutBundestagArtikelstand"), true);
      assert.deepEqual(standAnfrage.getAll("raw_documents.published_at"), ["is.null"]);
      // Der gewoehnliche Zeitstempelpfad bleibt unveraendert und ohne Stand-Alias.
      const zeitAnfrage = anfragen.find(p => p.getAll("raw_documents.published_at").length === 2);
      assert.equal(zeitAnfrage.get("select"), "knowledge_object_id,raw_documents!inner(id,title,url,canonical_url,published_at)");
      // Kein Ersatzdatum aus retrieved_at/created_at: undatierte gewoehnliche
      // Quelle wird verworfen, auch wenn der Server sie faelschlich liefert.
      const undatiert = { ko: "ko-stand", doc: { id: "rd-ohne-stand", title: "Synthetische undatierte Quelle",
        url: "https://beispiel.test/ohne-datum", canonical_url: null, published_at: null,
        retrieved_at: "2026-03-20T10:00:00Z", created_at: "2026-03-20T10:00:00Z", summary: "Ein beliebiger Auszug." } };
      assert.deepEqual(await storage.listAktuelleLageQuellen(["ko-stand"], fruehjahr,
        { ready: () => true, request: standTransport([undatiert]).request }), []);
      assert.deepEqual(await storage.listAktuelleLageQuellen(["ko-stand"], fruehjahr,
        { ready: () => true, request: async endpoint => new URL("https://example.org" + endpoint)
          .searchParams.getAll("raw_documents.published_at")[0] === "is.null"
          ? [{ knowledge_object_id: "ko-stand", raw_documents: { ...undatiert.doc } }] : [] }), []);
      // Widerspruechliche Stand-Metadaten sind ein lauter Fehler, kein stiller
      // Rueckfall auf die URL-Identitaet.
      const kaputt = standQuelle("2026-03-29", "9106");
      kaputt.raw.helmutBundestagArtikelstand = { ...kaputt.raw.helmutBundestagArtikelstand, publikationstag: "2026-03-30" };
      await assert.rejects(() => storage.listAktuelleLageQuellen(["ko-stand"], fruehjahr,
        { ready: () => true, request: standTransport([{ ko: "ko-stand", doc: kaputt }]).request }),
      e => e.name === "StorageReadError" && e.quelle === "lage-quellen");
    } finally {
      if (alt === undefined) delete process.env.HELMUT_BRIEFING_RELEVANZ_TAGE;
      else process.env.HELMUT_BRIEFING_RELEVANZ_TAGE = alt;
    }
  });
  await test("Auch der Artikelstand-Lesepfad liefert bei Ueberlauf keine stille Teilmenge", async () => {
    let standSeiten = 0;
    await assert.rejects(() => storage.listAktuelleLageQuellen(["ko-voll"], now, {
      ready: () => true, request: async endpoint => {
        const p = new URL("https://example.org" + endpoint).searchParams;
        if (p.getAll("raw_documents.published_at")[0] !== "is.null") return [];
        const start = standSeiten++ * 1000;
        return Array.from({ length: 1000 }, (_, i) => ({ knowledge_object_id: "ko-voll",
          raw_documents: { id: "d-" + (start + i) } }));
      }
    }), /lage-quellen-lesegrenze/);
    assert.equal(standSeiten, 5);
  });
  await test("Beide Quellenpfade teilen dieselbe Leseobergrenze", async () => {
    let standAufrufe = 0;
    await assert.rejects(() => storage.listAktuelleLageQuellen(["eins"], now, {
      ready: () => true, request: async endpoint => {
        const p = new URL("https://example.org" + endpoint).searchParams;
        const stand = p.get("raw_documents.published_at") === "is.null";
        if (stand) { standAufrufe++; return [{ knowledge_object_id: "eins", raw_documents: { id: "stand-ueber-grenze" } }]; }
        const offset = Number(p.get("offset"));
        return offset === 4000 ? [] : Array.from({ length: 1000 }, (_, i) => ({
          knowledge_object_id: "eins", raw_documents: { id: "normal-" + (offset + i) } }));
      }
    }), /lage-quellen-lesegrenze/);
    assert.equal(standAufrufe, 1);
  });
  console.log(passed+"/"+passed+" Testgruppen bestanden.");
})().catch(e=>{console.error(e);process.exitCode=1;});
