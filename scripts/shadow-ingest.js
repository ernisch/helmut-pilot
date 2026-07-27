"use strict";

// Helmut — Quellenarchitektur · ISOLIERTER Shadow-Ingest (Phase 2).
// Kettet die ECHTEN Produktionsmodule zu einer end-to-end Aufbereitung: Normalisierung ->
// globales Dedup + Fundstellen -> Klassifikation (politische Ebene/Geografie/Entitaeten) ->
// Knowledge-Object-INPUT-Assemblierung (Faehigkeit) -> Kostenmessung -> ISOLIERTE Shadow-Ablage.
//
// STRIKT GETRENNT vom sichtbaren Nutzerpfad:
//   - Requiret NUR reine Fetch-/Parse-/Klassifikations-/Dedup-Module. KEIN storage-Write,
//     KEIN scheduler, KEIN Server-Endpunkt.
//   - Schreibt AUSSCHLIESSLICH in eine eigene Shadow-Ablage (Artefakt-Datei unter shadow-store/),
//     NICHT in raw_documents/knowledge_objects/briefings/decisions/helmut_store.
//   - KEIN LLM-Aufruf: die KO-Erzeugung wird als deterministischer INPUT vorbereitet; der
//     KI-Anreicherungsschritt ist kapazitiv verdrahtet, aber kosten-gated (nicht ausgefuehrt).
//   - Kostenmessung ehrlich: ohne LLM-Aufruf sind die KI-Kosten 0.
//
// Reine Logik: Eingabe-Items werden injiziert (RSS/GN via crawler.normalizeRawItem, PARDOK via
// pardok-parser). Der LIVE-Abruf ist der bereits bewiesene Shadow-Pilot-/PARDOK-Fetch — dieser
// Ingest ist die nachgelagerte, DB-freie Aufbereitung.

const fs = require("fs");
const path = require("path");
const { deduplicateRawItems } = require("../lib/helmut/crawler");
const { mergeIntoDocuments } = require("../lib/helmut/quellenarchitektur/dedup-global");
const classification = require("../lib/helmut/quellenarchitektur/classification");
const { assessCosts } = require("../lib/helmut/quellenarchitektur/quality-watchdog");

// PARDOK-Dokument -> normalisiertes Item (gemeinsame Form fuer Dedup/Klassifikation).
function pardokToItem(doc, sourceId, retrievalPathId) {
  return {
    id: `sd-${doc.externe_id}`, sourceId, retrieval_path_id: retrievalPathId,
    title: doc.titel || `${doc.dokumentart || "Dokument"} ${doc.drucksachennummer || doc.externe_id}`,
    url: doc.originaladresse || "", originalUrl: doc.originaladresse || "",
    content: doc.titel || "", publishedAt: doc.veroeffentlichungsdatum || null,
    linkType: doc.originaladresse ? "direct" : "missing",
    externe_id: doc.externe_id,
    // Quellen-AUTORITATIVE Klassifikation amtlicher Landesparlaments-Dokumente:
    _ebeneAuth: doc.politische_ebene || "land", _geoAuth: doc.geografie || null,
    _wahlperiode: doc.wahlperiode ?? null, _dokumentart: doc.dokumentart || null,
    _mentionedLocations: doc.geografie === "geo-land-berlin" ? ["Berlin"] : doc.geografie === "geo-land-brandenburg" ? ["Brandenburg"] : []
  };
}

// Ein Item klassifizieren: amtliche Quelle -> Ebene/Geo AUTORITATIV aus der Quelle; sonst Deriver.
// Der Deriver liest KO-Felder (headline/was_ist_passiert/...) — Rohdoc-Felder werden dorthin gemappt.
function classifyItem(it) {
  const koLike = { headline: it.title, was_ist_passiert: it.content, mentioned_locations: it._mentionedLocations || [] };
  if (it._ebeneAuth) {
    return {
      decision_level: it._ebeneAuth, level_quelle: "quelle-autoritativ",
      geografie: it._geoAuth, wahlperiode: it._wahlperiode ?? null,
      entitaeten: [], event_type: classification.deriveEventType(koLike)
    };
  }
  const c = classification.classifyKnowledgeObject(koLike);
  return {
    decision_level: c.decision_level, level_quelle: "inhalt-deriver",
    // SPRINT 20: `geografie` bleibt das Alt-Einzelfeld (Vergleichbarkeit mit dem
    // autoritativen Zweig oben), `geografien` traegt die vollstaendige Liste —
    // ein Vorgang kann mehrere Regionen betreffen und darf im Schattenlauf nicht
    // stillschweigend auf eine reduziert werden.
    geografie: (c.affected_geographies[0] || {}).geography_id || null,
    geografien: c.affected_geographies.map((g) => g.geography_id || g.name),
    wahlperiode: null,
    entitaeten: c.decision_entities, event_type: c.event_type
  };
}

// --- Isolations-Selbstpruefung: kein Schreib-/Pipeline-/Server-Modul im require-Graph ----------
function isolationSelfCheck() {
  const src = fs.readFileSync(__filename, "utf8");
  const reqs = (src.match(/require\((?:"|')([^"']+)(?:"|')\)/g) || []).map((s) => s.replace(/require\((?:"|')|(?:"|')\)/g, ""));
  const libReqs = reqs.filter((r) => r.includes("lib/helmut") || r.includes("../server") || r.includes("scheduler"));
  const verboten = libReqs.filter((r) => /storage|scheduler|understanding|server|office|matching|decisions/.test(r));
  return { libReqs, verboten, ok: verboten.length === 0 };
}

// Kern: aus Quellen (mit bereits geparsten Items) ein isoliertes Shadow-Abbild erzeugen.
function ingestShadow(sources = [], opts = {}) {
  const iso = isolationSelfCheck();
  if (!iso.ok) throw new Error(`ISOLATIONSVERLETZUNG: ${iso.verboten.join(", ")}`);

  // 1) Items sammeln (PARDOK-Dokumente einheitlich normalisieren).
  const items = [];
  for (const s of sources) {
    for (const raw of s.items || []) {
      const it = s.kind === "pardok" ? pardokToItem(raw, s.sourceId, s.retrievalPathId)
        : { ...raw, sourceId: raw.sourceId || s.sourceId, retrieval_path_id: raw.retrieval_path_id || s.retrievalPathId };
      items.push(it);
    }
  }
  // 2) Dedup Ebene 1 (nur Items mit hash — RSS/GN); PARDOK-Items sind bereits eindeutig.
  const withHash = items.filter((i) => i.hash);
  const noHash = items.filter((i) => !i.hash);
  const dedupL1 = [...deduplicateRawItems(withHash), ...noHash];
  // 3) Ebene 3: global zu Dokumenten + Fundstellen zusammenfuehren (fuer Dedup-/Fundstellen-Zaehlung).
  const documents = mergeIntoDocuments(dedupL1);
  // 4) Klassifikation je aufbereitetem Item (Quelle-autoritativ fuer amtliche, Deriver sonst).
  const klassifiziert = dedupL1.map((it) => {
    const c = classifyItem(it);
    return {
      externe_id: it.externe_id || it.id, titel: it.title, datum: it.publishedAt || null,
      originaladresse: it.url || it.originalUrl || null, sourceId: it.sourceId, ...c
    };
  });
  // 5) KO-INPUT-Assemblierung (deterministisch; KI-Anreicherung kosten-gated, NICHT ausgefuehrt).
  const koInputs = klassifiziert.map((k) => ({
    vorgang_id: `ko-shadow-${k.externe_id}`, display_title: k.titel,
    decision_level: k.decision_level, geografie: k.geografie, wahlperiode: k.wahlperiode,
    event_type: k.event_type, ki_anreicherung: "gated (kosten-freigabepflichtig, nicht ausgefuehrt)"
  }));
  // 6) Kostenmessung: kein LLM -> keine llm_usage -> Kosten 0 (ehrlich).
  const kosten = assessCosts({ llmUsage: [], now: opts.now || 0, windowDays: 30 });

  // 7) Klassifikations-Verteilung fuer den Bericht.
  const ebenen = klassifiziert.reduce((m, k) => { m[k.decision_level] = (m[k.decision_level] || 0) + 1; return m; }, {});
  const geografien = klassifiziert.reduce((m, k) => { const g = k.geografie || "(null)"; m[g] = (m[g] || 0) + 1; return m; }, {});

  return {
    modus: "shadow-only (isolierte Ablage; kein raw_documents/knowledge_objects/briefings/decisions-Write, kein LLM)",
    isolation: iso,
    itemsRoh: items.length, itemsNachDedupL1: dedupL1.length,
    dokumente: documents.length, fundstellenGesamt: documents.reduce((a, d) => a + d.finding_count, 0),
    mehrfachFundstellen: documents.filter((d) => d.finding_count > 1).length,
    klassifikationEbenen: ebenen, klassifikationGeografien: geografien,
    koInputs: koInputs.length, kostenUsd: kosten.totalUsd ?? 0,
    documents: klassifiziert
  };
}

// Isolierte Shadow-Ablage: eigene Datei unter shadow-store/ (KEINE Prod-Tabelle, KEIN helmut_store).
function writeShadowStore(report, outPath) {
  const p = outPath || path.join(__dirname, "..", "shadow-store", "shadow-ingest.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(report, null, 2));
  return p;
}

module.exports = { ingestShadow, pardokToItem, classifyItem, isolationSelfCheck, writeShadowStore };
