"use strict";

// Helmut — Quellenarchitektur · PARDOK-Dispatch (Schritt C/D — Live-Pfad GEBAUT, NICHT aktiviert).
// =============================================================================================
// Verdrahtet den bewiesenen PARDOK-Parser (pardok-parser.js) an den crawlSource-Dispatch
// fuer amtliche Open-Data-XML-Quellen mit crawlMethod "structured_download" (be-plenum Berlin,
// bb-plenum Brandenburg). Diese Datei ist die EINZIGE Stelle, an der der Parser an den Crawl
// angebunden wird — bewusst hinter einem DOPPELTEN Feature-Gate.
//
// FEATURE-GUARD  HELMUT_PARDOK_DISPATCH  (default AUS):
//   off (default) -> INERT: KEIN Fetch, KEIN Parse, 0 Items. crawlSource verhaelt sich wie bisher.
//   shadow        -> SHADOW-ONLY: fetch + parse + Dedup in eine ISOLIERTE Ablage (shadow-store/),
//                    liefert TROTZDEM 0 Items in die sichtbare Pipeline.
//   live / on     -> Landtag-Sprint (P2-2): Live-Pfad EXISTIERT jetzt, oeffnet aber NUR mit der
//                    ZWEITEN Freigabe: das PARDOK-Land muss zusaetzlich in HELMUT_LANDESMODULE
//                    freigegeben sein (lib/helmut/quellenarchitektur/landesmodule.js). Ohne
//                    Landesfreigabe verhaelt sich 'live' EXAKT wie 'shadow' (0 Items, isolierte
//                    Telemetrie). Beide Flags zu setzen ist eine ausdrueckliche Gruender-
//                    Freigabe (Aktivierungscheckliste docs/landtag/) — Stand heute steht
//                    helmut-flags.json auf 'shadow' und HELMUT_LANDESMODULE ist leer.
//
// HARTE INVARIANTE (unveraendert fuer den heutigen Betrieb):  ohne DOPPELTE Freigabe gibt
//   pardokDispatch() in JEDEM Modus  items: []  zurueck. BE/BB-Inhalte bleiben strukturell
//   aus dem sichtbaren Nutzerpfad ausgeschlossen, solange keine Landesfreigabe vorliegt.
//
// Kosten-frei: kein LLM. Kein direkter Prod-Tabellen-Write — Live-Items gehen den normalen
// crawlSource->saveRawItems-Weg (gleiche Dedup-/Sicherheitsschichten wie jede andere Quelle).
// Der Fetcher wird injiziert (Testbarkeit, kein verstecktes Netz beim Laden).

const fs = require("fs");
const path = require("path");
const P = require("./pardok-parser");
// Deployment-Flags (env > helmut-flags.json > Default). Injizierte Test-Envs bleiben hermetisch.
const { flagValue } = require("../flags");
// Landesfreigabe (zweites Gate des Live-Pfads).
const { istLandFreigegeben } = require("./landesmodule");

function isFlagOn(value) {
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}

// Dispatch-Modus aus dem Feature-Guard: off (default) | shadow | live.
// 'live'/'on' liefert den Modus 'live' — ob Items fliessen, entscheidet ZUSAETZLICH die
// Landesfreigabe in pardokDispatch (Doppel-Gate). Boolesche Werte ('1'/'true'/'yes')
// bleiben bewusst AUS (Mode-Flag, kein Boolean).
function dispatchMode(env = process.env) {
  const raw = String(flagValue("HELMUT_PARDOK_DISPATCH", env) || "").trim().toLowerCase();
  if (raw === "shadow") return "shadow";
  if (raw === "live" || raw === "on") return "live";
  return "off";
}

// Ordnet eine structured_download-Quelle einem PARDOK-Land zu. Bevorzugt das explizite
// Konfigurationsfeld source.pardokLand; als Bequemlichkeit sonst der be-/bb-Praefix der Quelle-ID.
function resolveLand(source = {}) {
  const explicit = String(source.pardokLand || "").trim().toLowerCase();
  if (explicit === "berlin" || explicit === "brandenburg") return explicit;
  const id = String(source.id || "").toLowerCase();
  if (id.startsWith("be-")) return "berlin";
  if (id.startsWith("bb-")) return "brandenburg";
  return null;
}

function defaultShadowPath(sourceId) {
  return path.join(__dirname, "..", "..", "..", "shadow-store", `pardok-dispatch-${sourceId || "unknown"}.json`);
}

function writeShadow(outPath, payload) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return outPath;
}

// --- Live-Mapping: PARDOK-Dokument -> Pipeline-rawItem ---------------------------------------
// Kompatibel zu crawler.normalizeRawItem-Ergebnissen (gleiche Feldnamen), damit Dedup/
// Scoring/Telemetrie ohne Sonderpfad funktionieren. Amtliche Quelle -> confidence 'high';
// sourceType 'landesparlament' (Taxonomie: lage/radar/scheduler kennen den Typ seit P2-5).
// DSGVO/Datenminimierung: NUR amtliche Dokument-Metadaten (Titel, Nummer, Art, Datum, URL,
// Urheber-INSTITUTIONEN aus dem amtlichen Export) — kein Volltext, keine Buerger-Personendaten.
function pardokDocToRawItem(doc = {}, source = {}) {
  const titel = String(doc.titel || "").trim();
  const fallbackTitel = [doc.dokumentart, doc.drucksachennummer].filter(Boolean).join(" ").trim();
  const title = (titel || fallbackTitel || `PARDOK-Dokument ${doc.externe_id || ""}`).slice(0, 300);
  const contentTeile = [
    titel,
    doc.dokumentart ? `Dokumentart: ${doc.dokumentart}` : "",
    doc.dokumenttyp && doc.dokumenttyp !== doc.dokumentart ? `Typ: ${doc.dokumenttyp}` : "",
    doc.drucksachennummer ? `Drucksache ${doc.drucksachennummer}` : "",
    doc.vorgangstyp ? `Vorgang: ${doc.vorgangstyp}` : "",
    doc.ausschuss ? `Ausschuss: ${doc.ausschuss}` : "",
    Array.isArray(doc.urheber) && doc.urheber.length ? `Urheber: ${doc.urheber.slice(0, 5).join(", ")}` : "",
    Array.isArray(doc.stichworte) && doc.stichworte.length ? `Stichworte: ${doc.stichworte.slice(0, 10).join(", ")}` : ""
  ].filter(Boolean);
  const content = contentTeile.join(". ").slice(0, 1200);
  const url = String(doc.originaladresse || "").trim();
  const publishedAt = doc.veroeffentlichungsdatum ? `${doc.veroeffentlichungsdatum}T12:00:00.000Z` : new Date().toISOString();
  return {
    id: `pardok-${String(doc.inhaltsfingerabdruck || "").replace(/^pardok-/, "").slice(0, 24)}`,
    sourceId: source.id,
    sourceName: source.name || source.id,
    sourceType: "landesparlament",
    sourceUrl: source.url || "",
    sourcePriority: Number(source.priority || 0),
    title,
    url,
    originalUrl: "",
    linkType: url ? "direct" : "none",
    content,
    excerpt: content.slice(0, 240),
    publishedAt,
    retrievedAt: new Date().toISOString(),
    author: Array.isArray(doc.urheber) && doc.urheber.length ? String(doc.urheber[0]).slice(0, 120) : (source.name || ""),
    confidence: "high",
    hash: String(doc.inhaltsfingerabdruck || `pardok-${doc.externe_id || title}`),
    category: "PARDOK",
    // Landes-Metadaten (Klassifikation: amtliche Quell-Ebene 'land' ist autoritativ).
    politicalLevel: "land",
    sourcePoliticalLevel: "land",
    geography: doc.geografie || null,
    wahlperiode: doc.wahlperiode != null ? doc.wahlperiode : null,
    pardokLand: doc.land || null,
    externeId: doc.externe_id || null
  };
}

// Neueste zuerst; Platzhalter (ohne Identitaet) und Dokumente ohne Datum ans Ende.
function selectLiveDocuments(dokumente = [], maxItems = 16) {
  const usable = dokumente.filter((d) => d && !d.platzhalter);
  usable.sort((a, b) => String(b.veroeffentlichungsdatum || "").localeCompare(String(a.veroeffentlichungsdatum || "")));
  const cap = Number.isFinite(Number(maxItems)) && Number(maxItems) > 0 ? Math.floor(Number(maxItems)) : 16;
  return usable.slice(0, cap);
}

// Kern: eine structured_download-Quelle abarbeiten.
//   off:            { items: [] } — inert, kein Fetch.
//   shadow:         { items: [] } + Shadow-Report (+ optionale Datei-Ablage).
//   live OHNE Landesfreigabe: verhaelt sich wie shadow (0 Items).
//   live MIT Landesfreigabe (HELMUT_LANDESMODULE enthaelt das Land): Items -> Pipeline.
async function pardokDispatch(source = {}, opts = {}) {
  const mode = opts.mode || dispatchMode(opts.env);
  const land = resolveLand(source);

  // --- off (default) ODER kein PARDOK-Land: INERT. Kein Fetch, kein Parse, 0 Items. ------------
  if (mode === "off") return { items: [], shadow: null, mode, land, reason: "guard-off" };
  if (!land) return { items: [], shadow: null, mode, land: null, reason: "kein-pardok-land" };

  // Zweites Gate des Live-Pfads: Landesfreigabe. Ohne sie faellt 'live' auf Shadow-Verhalten.
  const liveFreigegeben = mode === "live" && istLandFreigegeben(land, opts.env || process.env);
  const effectiveMode = mode === "live" && !liveFreigegeben ? "shadow" : mode;

  // --- fetch (injiziert) + parse + Dedup (gemeinsam fuer shadow und live) ----------------------
  const fetchText = opts.fetchText;
  if (typeof fetchText !== "function") return { items: [], shadow: null, mode, land, reason: "kein-fetcher" };

  let xml = "";
  try {
    xml = await fetchText(source.url || source.rssUrl || "");
  } catch (error) {
    return { items: [], shadow: null, mode, land, reason: `fetch-fehler: ${error.message}` };
  }

  const parsed = P.parsePardokDocumentsFromString(xml, {
    land, sourceUrl: source.url || "", maxRecords: opts.maxRecords || 0
  });
  const ded = P.dedupToDocuments(parsed.documents, source.id || null);
  const shadow = {
    source_id: source.id || null, land, fehlerseite: parsed.fehlerseite === true,
    rohRecords: parsed.stats.rohRecords, geparst: parsed.stats.geparst,
    mitTitel: parsed.stats.mitTitel, mitDatum: parsed.stats.mitDatum, mitExterneId: parsed.stats.mitExterneId,
    dokumente: ded.anzahl, mehrfachFundstellen: ded.mehrfach
  };

  // --- LIVE (nur mit doppelter Freigabe): Items in die normale Pipeline ------------------------
  if (effectiveMode === "live") {
    if (parsed.fehlerseite) return { items: [], shadow, mode: "live", land, reason: "fehlerseite" };
    const selected = selectLiveDocuments(ded.dokumente, opts.maxItems || source.maxItems || 16);
    const items = selected.map((d) => pardokDocToRawItem(d, source));
    return { items, shadow, mode: "live", land, reason: "live-freigegeben" };
  }

  // --- SHADOW (auch: live ohne Landesfreigabe): isolierte Ablage, 0 Pipeline-Items -------------
  // Ablage ist BEST-EFFORT: auf Vercel-Serverless ist das Bundle-Dateisystem read-only —
  // ein Schreibfehler darf den Crawl der Quelle NIE brechen (Shadow stört nie). Der
  // Shadow-Report (Kennzahlen) bleibt in der Rückgabe erhalten, auch ohne Datei.
  let shadowOut = null;
  if (!opts.noWrite) {
    try {
      shadowOut = writeShadow(opts.shadowOut || defaultShadowPath(source.id), {
        erzeugt_modus: "shadow-only (pardok-dispatch; kein raw_documents/knowledge_objects/briefings/decisions-Write, kein LLM)",
        ...shadow, dokumenteListe: ded.dokumente
      });
    } catch (error) {
      shadow.ablageFehler = String(error && error.message || "write-fehler");
    }
  }

  // Ohne doppelte Freigabe: 0 Items in die sichtbare Pipeline. BE/BB erreicht NIE
  // Lage/Radar/Helmut/Buero, solange keine Landesfreigabe vorliegt.
  return {
    items: [], shadow, shadowOut, mode, land,
    reason: mode === "live" ? "live-ohne-landesfreigabe (shadow-fallback)" : "shadow-only"
  };
}

module.exports = {
  pardokDispatch, dispatchMode, resolveLand, defaultShadowPath, isFlagOn,
  // Landtag-Sprint (P2-2): Live-Mapping exportiert fuer Tests.
  pardokDocToRawItem, selectLiveDocuments
};
