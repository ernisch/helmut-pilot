"use strict";

// Helmut — GEZIELTE TESTS der letzten beiden LESEFEHLER-PFADE im Resolver (2026-09-22).
// Offline: ein lokaler Stub-HTTP-Server fuer den Storage-Vertrag, Attrappen fuer den Resolver.
// Kein Netz ausserhalb von 127.0.0.1, keine Datenbank, kein Modellaufruf, kein Write.
//   node scripts/lokal.js -- node scripts/vorgangs-resolver-lesefehler-2-test.js
// =============================================================================================
// BELEGTER ANLASS: zwei Lesefehler-Pfade im Resolver waren bisher von echten Leerfaellen
// nicht unterscheidbar:
//   1. exakter Leser `getExisting`  -> `getKnowledgeObjectByVorgang` gab bei Lesefehler `null`
//      (fachlich = „Vorgang existiert nicht").
//   2. Praefix-Suche `findVorgangCandidates` -> `listKnowledgeObjectsByVorgangPrefix` gab bei
//      Lesefehler `[]` (fachlich = „keine Kandidaten").
// Beides konnte zu falschem `neu` fuehren (Modellaufruf + Write auf vergebener Kennung).
//
// DIE REPARATUR: beide Storage-Leser werfen jetzt einen typisierten `StorageReadError`. Der
// exakte Leser laeuft ueber `getExistingStreng` (Wiederverwendung). `resolveVorgang` bricht
// bei beiden Fehlern fail closed ab (`resolution: "bestand-lesefehler"`, unterscheidbare
// `begruendung`). Motor und Planung stoppen sichtbar VOR Modell und Write. Erfolgreich
// gelesenes `null`/`[]` bleibt unveraendert.

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
function startStub({ status = 200, rows = null } = {}) {
  const anfragen = [];
  const server = http.createServer((req, res) => {
    anfragen.push(req.method + " " + req.url);
    if (status !== 200) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "stub error" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(rows == null ? "[]" : JSON.stringify(rows));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, anfragen }));
  });
}

// ── Dokument-/Cluster-Helfer ────────────────────────────────────────────────────────────────
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
function achtNeuere(praefix = "vg-fenster") {
  return Array.from({ length: 8 }, (_, i) => ko(`${praefix}-${String(i).padStart(2, "0")}`, { updatedAt: `2026-09-20T0${i}:00:00Z` }));
}

// Resolver-Deps: beide Lesepfade steuerbar, Fangnetze gegen Modell/Write.
function resolverDeps({ kandidaten = [], kandidatenFehler = null, exakt = null, exaktFehler = null, streng = true, links = {} } = {}) {
  const z = { modell: 0, writes: 0, exaktLesungen: 0, kandidatensuchen: 0 };
  const werfe = (fehler) => { throw (fehler instanceof Error ? fehler : new Error(fehler)); };
  const deps = {
    findVorgangCandidates: async (p, limit) => {
      z.kandidatensuchen += 1;
      if (kandidatenFehler) werfe(kandidatenFehler);
      return kandidaten.slice(0, Number.isFinite(Number(limit)) ? Number(limit) : 8);
    },
    getExisting: async (id) => {
      z.exaktLesungen += 1;
      if (exaktFehler) werfe(exaktFehler);
      return exakt && exakt.vorgang_id === id ? exakt : null;
    },
    listVorgangDocuments: async (koId) => links[koId] || [],
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
  };
  if (streng) {
    deps.getExistingStreng = async (id) => {
      z.exaktLesungen += 1;
      if (exaktFehler) werfe(exaktFehler);
      return exakt && exakt.vorgang_id === id ? exakt : null;
    };
  }
  return { z, deps };
}

(async () => {
  // ── (A) Storage-Vertrag: beide Leser unterscheiden Leer von Lesefehler ────────────────────
  abschnitt("Storage-Vertrag: exakter Leser und Praefix-Suche werfen typisiert statt Leer");
  const stub500 = await startStub({ status: 500 });
  process.env.HELMUT_V3_STORE = "1";
  process.env.SUPABASE_URL = "http://127.0.0.1:" + stub500.port;
  process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SECRET;
  process.env.HELMUT_STORAGE_BACKEND = "local";
  process.env.HELMUT_SUPABASE_TIMEOUT_MS = "800";

  await pruefe("§A1 listKnowledgeObjectsByVorgangPrefix wirft bei Lesefehler StorageReadError", async () => {
    let e = null;
    try { await storage.listKnowledgeObjectsByVorgangPrefix(["vg-test"], 8); } catch (err) { e = err; }
    A.ok(e, "kein Fehler geworfen");
    A.equal(e.name, "StorageReadError");
    A.equal(e.quelle, "knowledge_objects");
    A.ok(typeof e.fehlerklasse === "string" && e.fehlerklasse.length > 0);
    A.ok(!String(e.message).includes(TEST_SECRET), "kein Secret in der Meldung");
  });

  await pruefe("§A2 getKnowledgeObjectByVorgang(throwOnError) wirft bei Lesefehler StorageReadError", async () => {
    let e = null;
    try { await storage.getKnowledgeObjectByVorgang("vg-test", { throwOnError: true }); } catch (err) { e = err; }
    A.ok(e, "kein Fehler geworfen");
    A.equal(e.name, "StorageReadError");
    A.equal(e.quelle, "knowledge_objects");
    A.ok(typeof e.fehlerklasse === "string" && e.fehlerklasse.length > 0);
  });

  const stubLeer = await startStub({ status: 200, rows: [] });
  process.env.SUPABASE_URL = "http://127.0.0.1:" + stubLeer.port;
  await pruefe("§A3 eine erfolgreich gelesene leere Praefix-Liste bleibt []", async () => {
    const r = await storage.listKnowledgeObjectsByVorgangPrefix(["vg-test"], 8);
    A.deepEqual(r, []);
  });
  await pruefe("§A4 erfolgreich gelesener nicht existierender Vorgang bleibt null", async () => {
    const r = await storage.getKnowledgeObjectByVorgang("vg-test", { throwOnError: true });
    A.equal(r, null);
  });
  stub500.server.close(); stubLeer.server.close();

  // ── (B) Resolver: exakter Leser ───────────────────────────────────────────────────────────
  abschnitt("Resolver: exakter Leser — Treffer, Leer und Lesefehler");
  await pruefe("§1 exakter Leser findet einen bestehenden Vorgang unveraendert", async () => {
    const c = clusterAus([rohesDokument("ex-1", "Zitterpappel")]);
    const vorschlag = deriveVorgangId(c);
    const exakt = ko(vorschlag, { updatedAt: "2020-05-15T00:00:00Z" });
    const { z, deps } = resolverDeps({ kandidaten: achtNeuere(), exakt, links: { ["ko-" + vorschlag]: [rohesDokument("alt-1a", "Zitterpappel"), rohesDokument("alt-1b", "Zitterpappel")] } });
    const a = await resolveVorgang(c, deps, {});
    A.equal(a.resolution, "bestand");
    A.equal(a.vorgangId, vorschlag);
    A.equal(z.exaktLesungen, 1, "genau ein exakter Lesevorgang ueber getExistingStreng");
  });

  await pruefe("§2 exakter Leser findet keinen Vorgang — null bleibt legitimer Nicht-Treffer", async () => {
    const c = clusterAus([rohesDokument("ex-2", "Silberfuchs")]);
    const { deps } = resolverDeps({ kandidaten: achtNeuere(), exakt: null });
    const a = await resolveVorgang(c, deps, {});
    A.equal(a.resolution, "neu");
  });

  await pruefe("§3 exakter Lesefehler stoppt fail closed (nicht neu, 0 Aufrufe, 0 Writes)", async () => {
    const c = clusterAus([rohesDokument("ex-3", "Sanddornbeere")]);
    const { z, deps } = resolverDeps({ kandidaten: achtNeuere(), exaktFehler: new Error("fetch failed") });
    const a = await resolveVorgang(c, deps, {});
    A.equal(a.resolution, "bestand-lesefehler");
    A.equal(a.begruendung, "exakt-lesefehler");
    A.notEqual(a.resolution, "neu");
    A.ok(typeof a.lesefehler === "string" && a.lesefehler.length > 0, "Fehlergrund sichtbar");
    A.equal(z.modell, 0);
    A.equal(z.writes, 0);
  });

  await pruefe("§3b exakter Lesefehler ueber Legacy-getExisting (ohne getExistingStreng) ist ebenfalls fail closed", async () => {
    const c = clusterAus([rohesDokument("ex-3b", "Wacholderbeere")]);
    const { z, deps } = resolverDeps({ kandidaten: achtNeuere(), exaktFehler: new Error("fetch failed"), streng: false });
    const a = await resolveVorgang(c, deps, {});
    A.equal(a.resolution, "bestand-lesefehler");
    A.equal(a.begruendung, "exakt-lesefehler");
    A.equal(z.modell, 0);
    A.equal(z.writes, 0);
  });

  // ── (C) Resolver: Praefix-Suche ───────────────────────────────────────────────────────────
  abschnitt("Resolver: Praefix-Suche — Kandidaten, Leer und Lesefehler");
  await pruefe("§4 Praefix-Suche liefert Kandidaten unveraendert", async () => {
    const c = clusterAus([rohesDokument("pf-1", "Zitterpappel")]);
    const vorschlag = deriveVorgangId(c);
    const { deps } = resolverDeps({
      kandidaten: achtNeuere(), exakt: ko(vorschlag),
      links: { ["ko-" + vorschlag]: [rohesDokument("pf-alt-a", "Zitterpappel"), rohesDokument("pf-alt-b", "Zitterpappel")] }
    });
    const a = await resolveVorgang(c, deps, {});
    A.equal(a.resolution, "bestand");
    A.equal(a.vorgangId, vorschlag);
  });

  await pruefe("§5 Praefix-Suche liefert [] — normaler Leerfall bleibt erlaubt", async () => {
    const c = clusterAus([rohesDokument("pf-2", "Moorkiefer")]);
    const { deps } = resolverDeps({ kandidaten: [], exakt: null });
    const a = await resolveVorgang(c, deps, {});
    A.equal(a.resolution, "neu");
  });

  await pruefe("§6 Praefix-Lesefehler stoppt fail closed (nicht neu, 0 Aufrufe, 0 Writes)", async () => {
    const c = clusterAus([rohesDokument("pf-3", "Fliederbusch")]);
    const { z, deps } = resolverDeps({ kandidaten: achtNeuere(), kandidatenFehler: new Error("fetch failed") });
    const a = await resolveVorgang(c, deps, {});
    A.equal(a.resolution, "bestand-lesefehler");
    A.equal(a.begruendung, "kandidaten-lesefehler");
    A.notEqual(a.resolution, "neu");
    A.ok(typeof a.lesefehler === "string" && a.lesefehler.length > 0, "Fehlergrund sichtbar");
    A.equal(z.modell, 0);
    A.equal(z.writes, 0);
  });

  await pruefe("§7 die drei Lesefehler-Gruende sind unterscheidbar", async () => {
    const c = clusterAus([rohesDokument("pf-4", "Tannenzapfen")]);
    const aExakt = await resolveVorgang(c, resolverDeps({ kandidaten: achtNeuere(), exaktFehler: new Error("x") }).deps, {});
    const aPraefix = await resolveVorgang(c, resolverDeps({ kandidaten: achtNeuere(), kandidatenFehler: new Error("x") }).deps, {});
    A.equal(aExakt.begruendung, "exakt-lesefehler");
    A.equal(aPraefix.begruendung, "kandidaten-lesefehler");
    A.notEqual(aExakt.begruendung, aPraefix.begruendung);
  });

  // ── (D) Motor: understandOneCluster stoppt vor Modell/Write ───────────────────────────────
  abschnitt("Motor: understandOneCluster stoppt bei beiden Fehlerarten");
  await pruefe("§8a Motor stoppt bei exaktem Lesefehler", async () => {
    const dok = rohesDokument("motor-ex", "Zitterpappel");
    const { z, deps } = resolverDeps({ kandidaten: achtNeuere(), exaktFehler: new Error("fetch failed") });
    const r = await understandOneCluster(clusterAus([dok]), deps, {});
    A.equal(r.status, "skipped-bestandslesefehler");
    A.equal(r.begruendung, "exakt-lesefehler");
    A.equal(z.modell, 0);
    A.equal(z.writes, 0);
  });

  await pruefe("§8b Motor stoppt bei Praefix-Lesefehler", async () => {
    const dok = rohesDokument("motor-pf", "Moorkiefer");
    const { z, deps } = resolverDeps({ kandidaten: achtNeuere(), kandidatenFehler: new Error("fetch failed") });
    const r = await understandOneCluster(clusterAus([dok]), deps, {});
    A.equal(r.status, "skipped-bestandslesefehler");
    A.equal(r.begruendung, "kandidaten-lesefehler");
    A.equal(z.modell, 0);
    A.equal(z.writes, 0);
  });

  // ── (E) Planung: pruefeUndPlane stoppt fail closed ────────────────────────────────────────
  abschnitt("Planung: die 169er Planung stoppt bei beiden Fehlerarten");
  function bindung(dokumente) {
    return {
      pruefmodus: true, commit: "test-commit", dokumente: dokumente.length,
      idHash: V.idsHash(dokumente.map((d) => d.id)), cluster: 1, clusterGroessen: { 1: dokumente.length },
      maxModellaufrufe: 113, maxUsd: 0.8, maxMs: 35 * 60 * 1000
    };
  }
  await pruefe("§9a Planung stoppt bei exaktem Lesefehler fail closed", async () => {
    const dok = rohesDokument("plan-ex", "Tannenzapfen");
    const { z, deps } = resolverDeps({ kandidaten: achtNeuere(), exaktFehler: new Error("fetch failed") });
    const p = await V.pruefeUndPlane({ ids: [dok.id], deps: { ...deps, ladeDokumente: async () => [dok] }, commit: "test-commit", erwartet: bindung([dok]) });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-bestandslesefehler");
    A.equal(z.modell, 0);
    A.equal(z.writes, 0);
  });

  await pruefe("§9b Planung stoppt bei Praefix-Lesefehler fail closed", async () => {
    const dok = rohesDokument("plan-pf", "Fliederbusch");
    const { z, deps } = resolverDeps({ kandidaten: achtNeuere(), kandidatenFehler: new Error("fetch failed") });
    const p = await V.pruefeUndPlane({ ids: [dok.id], deps: { ...deps, ladeDokumente: async () => [dok] }, commit: "test-commit", erwartet: bindung([dok]) });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-bestandslesefehler");
    A.equal(z.modell, 0);
    A.equal(z.writes, 0);
  });

  await pruefe("§10 kein Kandidat wird durch einen Lesefehler kuenstlich als neu klassifiziert", async () => {
    const dok = rohesDokument("plan-nf", "Wacholderbeere");
    const { deps } = resolverDeps({ kandidaten: achtNeuere(), kandidatenFehler: new Error("fetch failed") });
    const c = clusterAus([dok]);
    const k = await V.klassifiziereCluster(c, deps, {});
    A.equal(k.art, "lesefehler");
    A.equal(k.kandidat, false);
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
