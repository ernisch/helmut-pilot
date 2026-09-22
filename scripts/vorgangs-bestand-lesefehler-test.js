"use strict";

// Helmut — GEZIELTE TESTS der BESTANDSLESEFEHLER-REPARATUR (W-1, 2026-09-22).
// Offline: ein lokaler Stub-HTTP-Server fuer den Storage-Vertrag, Attrappen fuer den Resolver.
// Kein Netz ausserhalb von 127.0.0.1, keine Datenbank, kein Modellaufruf, kein Write.
//   node scripts/lokal.js -- node scripts/vorgangs-bestand-lesefehler-test.js
// =============================================================================================
// BELEGTER ANLASS: der rein lesende Production-Planlauf meldete
//   "[v3Store] listKoDocuments fehlgeschlagen: fetch failed"
// und lief danach mit ok:true weiter. `listKoDocuments` verschluckte den Lesefehler als [] —
// ein Bestandslesefehler war damit fachlich nicht von einer echten leeren Liste unterscheidbar
// und `resolveVorgang`/`sameVorgang` entschieden auf unvollstaendiger Grundlage (moeglicher
// `neu`-Uebergang -> Modellaufruf + Write).
//
// DIE REPARATUR: `listKoDocuments` wirft jetzt einen typisierten `StorageReadError` (wie die
// Geschwister-Leser). `resolveVorgang` bricht bei einem Bestandslesefehler fail closed ab
// (`resolution: "bestand-lesefehler"`). Der Motor (`understandOneCluster`) und die Planung
// (`klassifiziereCluster`/`pruefeUndPlane`) stoppen sichtbar VOR Modell und Write. Eine
// erfolgreich gelesene, tatsaechlich leere Liste bleibt unveraendert.

const http = require("node:http");
const path = require("node:path");
const A = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const { resolveVorgang, understandOneCluster } = require(path.join(ROOT, "lib/helmut/understanding"));
const V = require(path.join(ROOT, "lib/helmut/verstehen-einmalig"));
const storage = require(path.join(ROOT, "lib/helmut/storage"));
const { contentHash, canonicalizeUrl, dedupeRawDocuments, toRawDocumentRow } = require(path.join(ROOT, "lib/helmut/dedup"));
const { clusterRawDocuments, deriveVorgangId } = require(path.join(ROOT, "lib/helmut/vorgang-identity"));

let bestanden = 0;
const fehlgeschlagen = [];
async function pruefe(name, fn) {
  try { await fn(); bestanden += 1; console.log("  PASS  " + name); }
  catch (e) { fehlgeschlagen.push(name); console.log("  FAIL  " + name + " — " + (e && e.message)); }
}
function abschnitt(t) { console.log("\n== " + t + " =="); }

const TEST_SECRET = "testschluessel-nie-echt-a1b2c3d4e5f6";

// ── Stub-Server (PostgREST-Ersatz, 127.0.0.1) ──────────────────────────────────────────────
function startStub({ links = [], status = 200 } = {}) {
  const anfragen = [];
  const server = http.createServer((req, res) => {
    anfragen.push(req.method + " " + req.url);
    if (status !== 200) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: "stub error" })); return; }
    if (req.url.startsWith("/rest/v1/ko_document_links")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(links));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end("[]");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, anfragen }));
  });
}

// ── Attrappen fuer Resolver/Plan/Motor ────────────────────────────────────────────────────
const ISO = "2026-09-22T08:00:00.000Z";
function rohesDokument(slug, titel, iso = ISO) {
  const url = "https://example.org/" + slug;
  const hash = contentHash({ url, publishedAt: iso, title: titel });
  return {
    id: "rd-" + hash, content_hash: hash, canonical_url: canonicalizeUrl(url), url,
    title: titel, summary: null, source_name: null, source_id: null, source_type: null,
    confidence: "high", link_type: "direct", published_at: iso, retrieved_at: iso,
    document_type: null, wahlperiode: null
  };
}
function clusterAus(dokumente) {
  const clusters = clusterRawDocuments(dedupeRawDocuments(dokumente.map(toRawDocumentRow).filter((r) => r && r.id)));
  A.equal(clusters.length, 1, "genau ein Cluster erwartet");
  return clusters[0];
}
function ko(vorgangId, { status = "complete", understandingStatus = "complete", updatedAt = "2026-09-01T00:00:00Z" } = {}) {
  return { id: "ko-" + vorgangId, vorgang_id: vorgangId, status, understanding_status: understandingStatus, updated_at: updatedAt, created_at: updatedAt };
}
function lesefehler() {
  return new storage.StorageReadError("ko_document_links", new Error("fetch failed"));
}

// Resolver-Deps: `listVorgangDocuments` steuerbar, alles Uebrige Fangnetz gegen Modell/Write.
function resolverDeps({ kandidaten = [], exakt = null, links = {}, fehler = false } = {}) {
  const z = { modell: 0, writes: 0 };
  return {
    z,
    deps: {
      findVorgangCandidates: async (p, limit) => kandidaten.slice(0, Number.isFinite(Number(limit)) ? Number(limit) : 8),
      getExisting: async (id) => (exakt && exakt.vorgang_id === id ? exakt : null),
      listVorgangDocuments: async (koId) => { if (fehler) throw lesefehler(); return links[koId] || []; },
      requestUnderstanding: async () => { z.modell += 1; throw new Error("modell-verboten"); },
      save: async () => { z.writes += 1; throw new Error("write-verboten"); },
      saveSources: async () => { z.writes += 1; throw new Error("write-verboten"); },
      markFailed: async () => { z.writes += 1; throw new Error("write-verboten"); },
      canSpend: async () => { z.modell += 1; throw new Error("gate-verboten"); },
      verstehenVertrag: () => null,
      clusterWache: null,
      gateMode: () => "off",
      modelName: () => "gpt-5-mini",
      logSkip: () => {}
    }
  };
}

(async () => {
  // ── (A) Storage-Vertrag: listKoDocuments wirft statt [] ──────────────────────────────────
  abschnitt("Storage-Vertrag: listKoDocuments unterscheidet Leer von Lesefehler");
  const stub500 = await startStub({ status: 500 });
  process.env.HELMUT_V3_STORE = "1";
  process.env.SUPABASE_URL = "http://127.0.0.1:" + stub500.port;
  process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SECRET;
  process.env.HELMUT_STORAGE_BACKEND = "local";
  process.env.HELMUT_SUPABASE_TIMEOUT_MS = "800";

  await pruefe("§1 listKoDocuments wirft bei Lesefehler einen typisierten StorageReadError", async () => {
    let e = null;
    try { await storage.listKoDocuments("ko-x", 40); } catch (err) { e = err; }
    A.ok(e, "kein Fehler geworfen");
    A.equal(e.name, "StorageReadError");
    A.equal(e.quelle, "ko_document_links");
    A.ok(typeof e.fehlerklasse === "string" && e.fehlerklasse.length > 0);
    A.ok(!String(e.message).includes(TEST_SECRET), "kein Secret in der Meldung");
  });

  const stubLeer = await startStub({ links: [] });
  process.env.SUPABASE_URL = "http://127.0.0.1:" + stubLeer.port;
  await pruefe("§2 eine erfolgreich gelesene, leere Liste bleibt []", async () => {
    const r = await storage.listKoDocuments("ko-x", 40);
    A.deepEqual(r, []);
  });

  const stubVoll = await startStub({ links: [{ raw_documents: { id: "rd-eins", title: "t1", content_hash: "h1" } }] });
  process.env.SUPABASE_URL = "http://127.0.0.1:" + stubVoll.port;
  await pruefe("§1b eine erfolgreich gelesene Liste liefert ihre Dokumente unveraendert", async () => {
    const r = await storage.listKoDocuments("ko-x", 40);
    A.equal(Array.isArray(r), true);
    A.equal(r.length, 1);
    A.equal(r[0].id, "rd-eins");
  });
  stub500.server.close(); stubLeer.server.close(); stubVoll.server.close();

  // ── (B) Resolver fail closed ────────────────────────────────────────────────────────────
  abschnitt("Resolver: Bestandslesefehler ist kein leeres Bestandsverzeichnis");
  await pruefe("§3 ein Bestandslesefehler fuehrt zu resolution: bestand-lesefehler", async () => {
    const c = clusterAus([rohesDokument("lf-1", "Zitterpappel")]);
    const vorschlag = deriveVorgangId(c);
    const kandidat = ko("vg-fenster-00");
    const { deps } = resolverDeps({ kandidaten: [kandidat], fehler: true });
    const a = await resolveVorgang(c, deps, {});
    A.equal(a.resolution, "bestand-lesefehler");
    A.equal(a.begruendung, "bestandslesefehler");
    A.equal(a.existing, null);
    A.ok(typeof a.lesefehler === "string" && a.lesefehler.length > 0, "Fehlerklasse sichtbar");
    A.equal(a.vorgangId, vorschlag);
  });

  await pruefe("§4 ein Lesefehler wird NIEMALS als neu interpretiert", async () => {
    const c = clusterAus([rohesDokument("lf-2", "Kupferschmiede")]);
    const { deps } = resolverDeps({ kandidaten: [ko("vg-fenster-01")], fehler: true });
    const a = await resolveVorgang(c, deps, {});
    A.notEqual(a.resolution, "neu");
    A.equal(a.resolution, "bestand-lesefehler");
  });

  await pruefe("§9 ohne Lesefehler bleibt die Aufloesung unveraendert (leere Liste = leer)", async () => {
    const c = clusterAus([rohesDokument("lf-3", "Silberfuchs")]);
    const { deps } = resolverDeps({ kandidaten: [ko("vg-fenster-02")], fehler: false });
    const a = await resolveVorgang(c, deps, {});
    A.equal(a.resolution, "neu");          // keine Treffer -> neu, wie zuvor
    A.equal(a.bestandsDokumente.length, 0); // leer wurde ehrlich als leer gelesen
  });

  // ── (C) Planung fail closed ─────────────────────────────────────────────────────────────
  abschnitt("Planung: Bestandslesefehler stoppt die 169er Planung");
  function bindung(dokumente) {
    return {
      pruefmodus: true, commit: "test-commit", dokumente: dokumente.length,
      idHash: V.idsHash(dokumente.map((d) => d.id)), cluster: 1, clusterGroessen: { 1: dokumente.length },
      maxModellaufrufe: 113, maxUsd: 0.8, maxMs: 35 * 60 * 1000
    };
  }
  await pruefe("§4/§5 der Plan bricht fail closed ab, 0 Modellaufrufe, 0 Writes", async () => {
    const dok = rohesDokument("plan-lf", "Tannenzapfen");
    const cluster = clusterAus([dok]);
    const vorschlag = deriveVorgangId(cluster);
    const { z, deps } = resolverDeps({ kandidaten: [ko("vg-fenster-03")], fehler: true });
    const p = await V.pruefeUndPlane({
      ids: [dok.id], deps: { ...deps, ladeDokumente: async () => [dok] }, commit: "test-commit", erwartet: bindung([dok])
    });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-bestandslesefehler");
    A.equal(p.vorgangId, vorschlag);
    A.ok(typeof p.lesefehler === "string" && p.lesefehler.length > 0);
    A.equal(z.modell, 0);
    A.equal(z.writes, 0);
  });

  await pruefe("§6 der Fehlergrund ist sichtbar (nicht nur console.error)", async () => {
    const dok = rohesDokument("plan-lf2", "Wacholderbeere");
    const cluster = clusterAus([dok]);
    const { deps } = resolverDeps({ kandidaten: [ko("vg-fenster-04")], fehler: true });
    const p = await V.pruefeUndPlane({ ids: [dok.id], deps: { ...deps, ladeDokumente: async () => [dok] }, commit: "test-commit", erwartet: bindung([dok]) });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-bestandslesefehler");
  });

  await pruefe("§7 exakter Kandidat + Lesefehler ist ebenfalls fail closed", async () => {
    const dok = rohesDokument("plan-lf3", "Eibischwurzel");
    const cluster = clusterAus([dok]);
    const vorschlag = deriveVorgangId(cluster);
    const exakt = ko(vorschlag);
    const { deps } = resolverDeps({ kandidaten: [], exakt, fehler: true });
    const p = await V.pruefeUndPlane({ ids: [dok.id], deps: { ...deps, ladeDokumente: async () => [dok] }, commit: "test-commit", erwartet: bindung([dok]) });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-bestandslesefehler");
  });

  await pruefe("§8 Praefix-Kandidat + Lesefehler ist ebenfalls fail closed", async () => {
    const dok = rohesDokument("plan-lf4", "Fliederbusch");
    const { deps } = resolverDeps({ kandidaten: [ko("vg-fenster-05")], fehler: true });
    const p = await V.pruefeUndPlane({ ids: [dok.id], deps: { ...deps, ladeDokumente: async () => [dok] }, commit: "test-commit", erwartet: bindung([dok]) });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-bestandslesefehler");
  });

  // ── (D) Motor fail closed ───────────────────────────────────────────────────────────────
  abschnitt("Motor: understandOneCluster stoppt VOR Modell und Write");
  await pruefe("§4/§5 understandOneCluster liefert skipped-bestandslesefehler, 0 Aufrufe, 0 Writes", async () => {
    const dok = rohesDokument("motor-lf", "Moorkiefer");
    const cluster = clusterAus([dok]);
    const { z, deps } = resolverDeps({ kandidaten: [ko("vg-fenster-06")], fehler: true });
    const r = await understandOneCluster(cluster, deps, {});
    A.equal(r.status, "skipped-bestandslesefehler");
    A.equal(r.reason, "bestandslesefehler");
    A.equal(z.modell, 0, "kein Modellaufruf (auch kein Budget-Gate)");
    A.equal(z.writes, 0, "kein Write");
  });

  console.log("\n== ERGEBNIS ==");
  console.log(bestanden + "/" + (bestanden + fehlgeschlagen.length) + " Assertions erfolgreich.");
  if (fehlgeschlagen.length) {
    for (const n of fehlgeschlagen) console.log("  FAIL " + n);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error("Suite-Fehler:", error);
  process.exit(1);
});
