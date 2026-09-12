"use strict";

// Echte Speicherfunktionen und HTTP Anfragen gegen eine lokale PostgREST Nachbildung.
// Ausschliesslich erfundene Daten. Dies ist ein Speichervertragstest, kein Production Beleg.
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { toRawDocumentRow } = require("../lib/helmut/dedup");
process.env.HELMUT_RAW_DOCUMENT_BULK_CHUNK = "2";
const storage = require("../lib/helmut/storage");

const clone = (x) => JSON.parse(JSON.stringify(x));
const vorgang = "test-quellenvertrag";
const koId = "ko-" + vorgang;
const koBestand = { id: koId, vorgang_id: vorgang, status: "neu",
  understanding_status: "complete", headline: "Bestehender gepruefter Vorgang",
  source_document_count: 7, was_ist_passiert: "Bestehender Inhalt", verstehen_fencing: 9 };
function quelle(n, summary = "Der Ausschuss beraet einen Vorschlag.") {
  return toRawDocumentRow({ url: "https://example.invalid/quelle/" + n,
    sourceId: "test-quelle", sourceName: "Testquelle", title: "Beratung " + n,
    publishedAt: "2026-09-11T08:00:00Z", retrievedAt: "2026-09-11T10:00:00Z", summary });
}
const alt = { ...quelle("alt"), finding_count: 7, created_at: "2026-09-11T10:00:01Z",
  raw: { originalUrl: "https://example.invalid/ursprung", helmutQuellenkontext: {
    version: 1, auszug: "Gesicherter Quellenkontext", gelesenAm: "2026-09-11T10:00:00Z"
  } } };
let db, requests, failTable, failRawRequest, rawRequests;
function reset(rows = [alt]) {
  db = { raw_documents: new Map(rows.map(r => [r.id, clone(r)])),
    knowledge_objects: new Map([[koId, clone(koBestand)]]),
    ko_document_links: new Map([["ko-historisch|" + alt.id,
      { knowledge_object_id: "ko-historisch", raw_document_id: alt.id }]]) };
  requests = []; failTable = ""; failRawRequest = 0; rawRequests = 0;
}
function snapshot() {
  return Object.fromEntries(Object.entries(db).map(([k, v]) => [k, [...v.entries()]]));
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    const table = url.pathname.replace("/rest/v1/", "");
    assert.equal(req.method, "POST", "Verknuepfen braucht keinen vorherigen Read");
    assert(db[table], "Unerwarteter Datenzugriff " + table);
    let body = "";
    for await (const part of req) body += part;
    const payload = JSON.parse(body);
    const rows = Array.isArray(payload) ? payload : [payload];
    requests.push({ table, prefer: req.headers.prefer, rows: clone(rows) });
    if (table === "raw_documents") rawRequests++;
    if (table === failTable || (table === "raw_documents" && rawRequests === failRawRequest)) {
      res.writeHead(500); res.end("Absichtlicher lokaler Speicherfehler"); return;
    }
    const keys = Object.keys(rows[0] || {}).sort();
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), keys,
      "PostgREST verlangt gleiche Spalten je Stapel");
    const conflict = String(url.searchParams.get("on_conflict")).split(",");
    const ignore = String(req.headers.prefer).includes("resolution=ignore-duplicates");
    const changed = [];
    for (const row of rows) {
      const id = conflict.map(k => row[k]).join("|");
      assert(!id.includes("undefined"), "Konfliktkennung fehlt");
      if (table === "ko_document_links") assert(db.raw_documents.has(row.raw_document_id), "FK Quelle fehlt");
      if (db[table].has(id) && ignore) continue;
      const saved = { ...(db[table].get(id) || {}), ...clone(row) };
      db[table].set(id, saved); changed.push(saved);
    }
    if (String(req.headers.prefer).includes("return=minimal")) { res.writeHead(204); res.end(); }
    else { res.writeHead(201, { "content-type": "application/json" }); res.end(JSON.stringify(changed)); }
  } catch (e) { res.writeHead(400); res.end(e.message); }
});

const paths = [
  { name: "Einzelpfad",
    run: docs => storage.saveKoDocumentLinks(koId, docs),
    ok: r => { assert(!r.skipped); assert(r.saved > 0); },
    failed: r => { assert.equal(r.saved, 0); assert.equal(r.reason, "v3-store-error"); } },
  { name: "Stapelpfad",
    run: docs => storage.savePendingKnowledgeObjectsBulk([{ vorgangId: vorgang,
      headline: "Eingegangener Titel", source_document_count: docs.length, dokumente: docs }]),
    ok: r => { assert.equal(r.fehlgeschlagen, 0); assert.equal(r.vorgemerkt, 0);
      assert.equal(r.bereitsVorhanden, 1); assert(r.verknuepfteDokumente > 0); },
    failed: r => { assert.equal(r.fehlgeschlagen, 1); assert.equal(r.vorgemerkt, 0);
      assert.equal(r.bereitsVorhanden, 0); assert.equal(r.verknuepfteDokumente, 0); } }
];
let passed = 0;
async function pruefe(name, fn) { reset(); await fn(); passed++; console.log("OK " + name); }
function erhalten(before = alt) {
  assert.deepEqual(db.raw_documents.get(before.id), before, "Gesamte bestehende Rohzeile erhalten");
  assert.deepEqual(db.knowledge_objects.get(koId), koBestand, "Fertiges Wissensobjekt erhalten");
  assert(db.ko_document_links.has("ko-historisch|" + alt.id), "Historischer Link erhalten");
}
(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const names = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_V3_STORE"];
  const beforeEnv = Object.fromEntries(names.map(n => [n, process.env[n]]));
  process.env.SUPABASE_URL = "http://127.0.0.1:" + server.address().port;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "nur-lokaler-test";
  process.env.HELMUT_V3_STORE = "on";
  try {
    for (const p of paths) {
      for (const [name, incoming] of [
        ["leerer Auszug", { ...quelle("alt", null), raw: {}, finding_count: 1 }],
        ["Titelwiederholung", quelle("alt", "Beratung alt")],
        ["anderer gueltiger Auszug", quelle("alt", "Eine andere spaetere Aussage.")],
        ["fehlendes Auszugsfeld", { id: alt.id, title: "Neuer Titel" }]
      ]) {
        await pruefe(p.name + ": " + name + " ersetzt keinen Bestand", async () => {
          p.ok(await p.run([incoming])); erhalten();
          assert(db.ko_document_links.has(koId + "|" + alt.id));
          assert.equal(db.raw_documents.size, 1);
        });
      }
      await pruefe(p.name + ": vorhandenes null wird nicht still repariert", async () => {
        const leer = { ...alt, summary: null }; reset([leer]);
        p.ok(await p.run([quelle("alt", "Neuer angebotener Auszug")])); erhalten(leer);
      });
      await pruefe(p.name + ": neue Quelle samt Auszug und Link", async () => {
        const neu = quelle("neu");
        p.ok(await p.run([{ ...neu, unbekannte_spalte: "nicht speichern" }]));
        assert.deepEqual(db.raw_documents.get(neu.id), neu); erhalten();
        assert(db.ko_document_links.has(koId + "|" + neu.id));
      });
      await pruefe(p.name + ": neue Titelwiederholung bleibt ehrlich leer", async () => {
        const neu = quelle("nur-titel", "Beratung nur-titel"); assert.equal(neu.summary, null);
        p.ok(await p.run([neu])); assert.equal(db.raw_documents.get(neu.id).summary, null); erhalten();
      });
      await pruefe(p.name + ": gemischte Spalten und begrenzte Stapel", async () => {
        const minimal = { id: "rd-test-minimal", title: "Nur Titel", summary: undefined };
        const docs = [quelle("alt", null), minimal, ...[1, 2, 3, 4].map(i => quelle("neu-" + i))];
        const r = await p.run(docs); p.ok(r); erhalten();
        const raw = requests.filter(x => x.table === "raw_documents");
        assert.equal(raw.length, 4); assert(raw.every(x => x.rows.length <= 2));
        assert(!Object.hasOwn(db.raw_documents.get(minimal.id), "summary"));
        assert.equal(db.raw_documents.size, 6);
        if (p.name === "Stapelpfad") assert.equal(r.anfragen, requests.length);
      });
      await pruefe(p.name + ": Wiederholung und gleichzeitige Aufrufe", async () => {
        p.ok(await p.run([quelle("alt", null)])); const before = clone(snapshot());
        const rs = await Promise.all([p.run([quelle("alt", "Anderer Inhalt")]), p.run([quelle("alt", null)])]);
        rs.forEach(p.ok); assert.deepEqual(snapshot(), before); erhalten();
      });
      for (const table of ["raw_documents", "ko_document_links"]) {
        await pruefe(p.name + ": Fehler in " + table + " ist kein Erfolg", async () => {
          failTable = table; p.failed(await p.run([quelle("alt", null)])); erhalten();
          assert(!db.ko_document_links.has(koId + "|" + alt.id));
          if (table === "raw_documents") assert(!requests.some(x => x.table === "ko_document_links"));
        });
      }
      await pruefe(p.name + ": Fehler im zweiten Quellenstapel bleibt sichtbar", async () => {
        failRawRequest = 2;
        const r = await p.run([quelle("alt", null), quelle("zweite"), quelle("dritte")]);
        p.failed(r); erhalten(); assert(!requests.some(x => x.table === "ko_document_links"));
        if (p.name === "Stapelpfad") assert.equal(r.anfragen, requests.length);
      });
    }
    await pruefe("Beide Pfade gleichzeitig legen eine neue Quelle nur einmal an", async () => {
      const a = quelle("konkurrenz", "Erster gelesener Inhalt");
      const b = quelle("konkurrenz", "Zweiter gelesener Inhalt");
      const r = await Promise.all([paths[0].run([a]), paths[1].run([b])]);
      r.forEach((x, i) => paths[i].ok(x)); erhalten();
      const saved = clone(db.raw_documents.get(a.id));
      assert(saved.summary === a.summary || saved.summary === b.summary);
      assert.equal(db.raw_documents.size, 2);
      await paths[0].run([{ ...a, summary: null }]);
      assert.deepEqual(db.raw_documents.get(a.id), saved);
    });
    await pruefe("Neue Vormerkung meldet erst nach Quellenverknuepfung Erfolg", async () => {
      db.knowledge_objects.delete(koId);
      const r = await paths[1].run([alt]);
      assert.equal(r.vorgemerkt, 1); assert.equal(r.bereitsVorhanden, 0); assert.equal(r.fehlgeschlagen, 0);
      assert(db.ko_document_links.has(koId + "|" + alt.id));
      assert.deepEqual(db.raw_documents.get(alt.id), alt);
    });
    await pruefe("Deaktivierter Store und ungueltige Eingaben bleiben inert", async () => {
      process.env.HELMUT_V3_STORE = "off";
      for (const p of paths) assert((await p.run([alt])).skipped);
      process.env.HELMUT_V3_STORE = "on";
      assert((await storage.saveKoDocumentLinks("", [alt])).skipped);
      assert((await storage.saveKoDocumentLinks(koId, [null, {}])).skipped);
      const r = await storage.savePendingKnowledgeObjectsBulk([null, {}]);
      assert.equal(r.anfragen, 0); assert.equal(requests.length, 0); erhalten();
    });
    console.log(passed + "/" + passed + " Quellenverknuepfungspruefungen bestanden. Kein Production Nachweis.");
  } finally {
    for (const name of names) { if (beforeEnv[name] === undefined) delete process.env[name]; else process.env[name] = beforeEnv[name]; }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

