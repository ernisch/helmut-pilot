"use strict";

// Helmut — Quellenarchitektur · PARDOK-Dispatch (Schritt C — VORBEREITET, NICHT aktiviert).
// =============================================================================================
// Verdrahtet den bereits bewiesenen PARDOK-Parser (pardok-parser.js) an den crawlSource-Dispatch
// fuer amtliche Open-Data-XML-Quellen mit crawlMethod "structured_download" (be-plenum Berlin,
// bb-plenum Brandenburg). Diese Datei ist die EINZIGE Stelle, an der der Parser an den Crawl
// angebunden wird — bewusst hinter einem Feature-Guard und mit einer harten Isolations-Invariante.
//
// FEATURE-GUARD  HELMUT_PARDOK_DISPATCH  (default AUS):
//   off (default) -> INERT: KEIN Fetch, KEIN Parse, 0 Items. crawlSource verhaelt sich wie bisher.
//   shadow        -> SHADOW-ONLY: fetch + parse + Dedup in eine ISOLIERTE Ablage (shadow-store/),
//                    liefert TROTZDEM 0 Items in die sichtbare Pipeline.
//   Jeder andere Wert (auch "on"/"live") -> off. Der Live-Modus (Items -> Pipeline) ist BEWUSST
//   NICHT implementiert: das waere der Cutover (Schritt D/E) und erfordert eine eigene Gruender-
//   Freigabe. Solange dieser Code steht, kann ueber ihn KEIN Berlin/Brandenburg-Inhalt in
//   Lage/Radar/Helmut/Buero gelangen.
//
// HARTE INVARIANTE:  pardokDispatch() gibt in JEDEM Modus  items: []  zurueck.
//   -> BE/BB-Inhalte sind strukturell (nicht nur per Konvention) aus dem sichtbaren Nutzerpfad
//      ausgeschlossen. Der Shadow-Ertrag wird ausschliesslich in eine eigene Datei geschrieben.
//
// REIN + kosten-frei: kein LLM, kein Prod-Tabellen-Write (raw_documents/knowledge_objects/
// briefings/decisions bleiben unberuehrt). Der Fetcher wird injiziert (Testbarkeit, kein
// verstecktes Netz beim Laden).

const fs = require("fs");
const path = require("path");
const P = require("./pardok-parser");
// Deployment-Flags (env > helmut-flags.json > Default). Injizierte Test-Envs bleiben hermetisch.
const { flagValue } = require("../flags");

function isFlagOn(value) {
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}

// Dispatch-Modus aus dem Feature-Guard. Nur "shadow" schaltet den (isolierten) Shadow-Pfad frei;
// alles andere — inkl. "on"/"live" — bleibt AUS. "on" ist der Cutover und hier NICHT verdrahtet.
function dispatchMode(env = process.env) {
  const raw = String(flagValue("HELMUT_PARDOK_DISPATCH", env) || "").trim().toLowerCase();
  return raw === "shadow" ? "shadow" : "off";
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

// Kern: eine structured_download-Quelle abarbeiten. Ergebnis IMMER { items: [] } fuer die
// sichtbare Pipeline; im Shadow-Modus zusaetzlich ein Shadow-Report (+ optional Datei-Ablage).
async function pardokDispatch(source = {}, opts = {}) {
  const mode = opts.mode || dispatchMode(opts.env);
  const land = resolveLand(source);

  // --- off (default) ODER kein PARDOK-Land: INERT. Kein Fetch, kein Parse, 0 Items. ------------
  if (mode === "off") return { items: [], shadow: null, mode, land, reason: "guard-off" };
  if (!land) return { items: [], shadow: null, mode, land: null, reason: "kein-pardok-land" };

  // --- shadow: fetch (injiziert) + parse + Dedup -> isolierte Ablage. TROTZDEM 0 Pipeline-Items.
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

  // HARTE INVARIANTE: 0 Items in die sichtbare Pipeline. BE/BB erreicht NIE Lage/Radar/Helmut/Buero.
  return { items: [], shadow, shadowOut, mode, land, reason: "shadow-only" };
}

module.exports = { pardokDispatch, dispatchMode, resolveLand, defaultShadowPath, isFlagOn };
