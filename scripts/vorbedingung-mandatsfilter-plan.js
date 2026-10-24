"use strict";

// Nur fuer Z22 §9: vorhandener Fenster-Indexzugriff, keine physische Plangleichheit.
// PostgreSQL17.6/7885b94d: indxpath.c check_index_only braucht auch alle Filterspalten;
// tenant_id fehlt im Covering-Index. costsize.c beruecksichtigt zudem allvisfrac.
const INDEXE = Object.freeze({
  helmut_jobs_window_idx: Object.freeze({
    spalten: Object.freeze(["freshness_window", "status"]),
    definition: "CREATE INDEX helmut_jobs_window_idx ON public.helmut_jobs USING btree (freshness_window, status)"
  }),
  helmut_jobs_fenster_typ_idx: Object.freeze({
    spalten: Object.freeze(["freshness_window", "job_type", "status"]),
    definition: "CREATE INDEX helmut_jobs_fenster_typ_idx ON public.helmut_jobs USING btree (freshness_window, job_type, status)"
  })
});

// Definitionen aus 20260808_scalable_job_queue und 20260808_jobqueue_abhaengigkeiten;
// die beiden Z22-Migrationen aendern die Funktion, keinen dieser Indizes.
const INDEX_KATALOG_SQL = `select coalesce(json_agg(json_build_object(
    'schema', tn.nspname, 'table', t.relname, 'indexSchema', ixn.nspname,
    'index', ix.relname, 'method', am.amname, 'valid', i.indisvalid,
    'ready', i.indisready, 'definition', pg_get_indexdef(i.indexrelid))
    order by ix.relname), '[]'::json)
  from pg_catalog.pg_index i
  join pg_catalog.pg_class t on t.oid = i.indrelid
  join pg_catalog.pg_namespace tn on tn.oid = t.relnamespace
  join pg_catalog.pg_class ix on ix.oid = i.indexrelid
  join pg_catalog.pg_namespace ixn on ixn.oid = ix.relnamespace
  join pg_catalog.pg_am am on am.oid = ix.relam
 where i.indrelid = 'public.helmut_jobs'::regclass
   and ix.relname in ('helmut_jobs_window_idx', 'helmut_jobs_fenster_typ_idx')`;

const TYPEN = Object.freeze({
  Aggregate: "Aggregate", "Index Scan": "IndexScan", "Index Only Scan": "IndexOnlyScan",
  "Bitmap Heap Scan": "BitmapHeapScan", "Bitmap Index Scan": "BitmapIndexScan",
  "Seq Scan": "SeqScan"
});
const objekt = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const endlich = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0;
const hatIndex = (name) => typeof name === "string" && Object.hasOwn(INDEXE, name);

function pruefeIndexplan(planJSON, katalogJSON, { mitMandatsfilter } = {}) {
  let dauerMs = NaN;
  let dto = null;
  const fehler = [];
  const fehlt = (ok, code) => { if (!ok && !fehler.includes(code)) fehler.push(code); };
  const ergebnis = () => ({ ok: fehler.length === 0, code: fehler[0] || "OK",
    signatur: dto ? JSON.stringify(dto) : "UNREADABLE_PLAN", dauerMs });
  let dokument;
  try { dokument = JSON.parse(planJSON); } catch (_) { fehler.push("INVALID_PLAN_JSON"); return ergebnis(); }
  if (!Array.isArray(dokument) || dokument.length !== 1 || !objekt(dokument[0])) {
    fehler.push("INVALID_EXPLAIN_DOCUMENT"); return ergebnis();
  }
  if (endlich(dokument[0]["Execution Time"])) dauerMs = dokument[0]["Execution Time"];
  fehlt(endlich(dauerMs), "INVALID_EXECUTION_TIME");
  fehlt(typeof mitMandatsfilter === "boolean", "INVALID_FILTER_MODE");
  let anzahl = 0;
  function leseKnoten(raw, tiefe = 0) {
    if (!objekt(raw) || ++anzahl > 16 || tiefe > 4) {
      fehler.push("MALFORMED_PLAN_NODE"); return null;
    }
    const typ = typeof raw["Node Type"] === "string" && Object.hasOwn(TYPEN, raw["Node Type"])
      ? TYPEN[raw["Node Type"]] : "Unknown";
    fehlt(typ !== "Unknown", "UNKNOWN_PLAN_NODE");
    fehlt(typ !== "SeqScan", "SEQ_SCAN_FORBIDDEN");
    fehlt(endlich(raw["Actual Rows"]) && endlich(raw["Actual Loops"]) && raw["Actual Loops"] > 0,
      "UNEXECUTED_OR_MALFORMED_NODE");
    const optional = (field, erlaubt, unbekannt) => raw[field] === undefined ? null
      : raw[field] === erlaubt ? erlaubt : unbekannt;
    const dtoKnoten = { typ,
      schema: optional("Schema", "public", "UNREVIEWED_SCHEMA"),
      tabelle: optional("Relation Name", "helmut_jobs", "UNREVIEWED_TABLE"),
      index: raw["Index Name"] === undefined ? null : hatIndex(raw["Index Name"])
        ? raw["Index Name"] : "UNREVIEWED_INDEX",
      kinder: [] };
    const kinder = raw.Plans === undefined ? [] : raw.Plans;
    if (!Array.isArray(kinder)) { fehler.push("MALFORMED_PLAN_CHILDREN"); return { raw, dto: dtoKnoten, kinder: [] }; }
    const gelesen = kinder.map((kind) => leseKnoten(kind, tiefe + 1));
    dtoKnoten.kinder = gelesen.map((kind) => kind ? kind.dto : { typ: "Malformed" });
    return { raw, dto: dtoKnoten, kinder: gelesen.filter(Boolean) };
  }
  const wurzel = leseKnoten(dokument[0].Plan);
  if (!wurzel) return ergebnis();
  dto = wurzel.dto;
  let katalog;
  try { katalog = JSON.parse(katalogJSON); } catch (_) { katalog = null; }
  const katalogOK = Array.isArray(katalog) && katalog.length === 2
    && new Set(katalog.map((zeile) => objekt(zeile) && zeile.index)).size === 2
    && katalog.every((zeile) => objekt(zeile) && hatIndex(zeile.index)
      && zeile.schema === "public" && zeile.table === "helmut_jobs" && zeile.indexSchema === "public"
      && zeile.method === "btree" && zeile.valid === true && zeile.ready === true
      && zeile.definition === INDEXE[zeile.index].definition);
  fehlt(katalogOK, "INDEX_CATALOG_DRIFT");
  const relation = (knoten) => knoten.dto.schema === "public" && knoten.dto.tabelle === "helmut_jobs";
  const keinObjekt = (knoten) => knoten.dto.schema === null && knoten.dto.tabelle === null && knoten.dto.index === null;
  function indexzugriff(knoten, bitmap) {
    const raw = knoten.raw;
    fehlt(hatIndex(raw["Index Name"]), "UNREVIEWED_INDEX");
    fehlt(bitmap ? knoten.dto.schema === null && knoten.dto.tabelle === null : relation(knoten), "WRONG_INDEX_RELATION");
    fehlt(knoten.kinder.length === 0, "INDEX_NODE_HAS_CHILDREN");
    // Die feste §9-Query muss das Fenster im Index einschraenken, kein voller Indexscan.
    fehlt(typeof raw["Index Cond"] === "string"
      && /(?:^|\()\s*(?:j\.)?freshness_window\s*=\s*ANY\s*\(/.test(raw["Index Cond"]), "MISSING_WINDOW_INDEX_CONDITION");
    if (knoten.dto.typ === "IndexOnlyScan") {
      const benoetigt = ["freshness_window", "job_type", "status", ...(mitMandatsfilter ? ["tenant_id"] : [])];
      fehlt(hatIndex(raw["Index Name"]) && benoetigt.every((spalte) => INDEXE[raw["Index Name"]].spalten.includes(spalte)),
        "INDEX_ONLY_MISSING_COLUMNS");
    }
  }
  fehlt(wurzel.dto.typ === "Aggregate" && keinObjekt(wurzel) && wurzel.kinder.length === 1, "INVALID_AGGREGATE_SHAPE");
  const scan = wurzel.kinder[0];
  if (scan && ["IndexScan", "IndexOnlyScan"].includes(scan.dto.typ)) {
    indexzugriff(scan, false);
  } else if (scan && scan.dto.typ === "BitmapHeapScan") {
    fehlt(relation(scan) && scan.dto.index === null && scan.kinder.length === 1, "INVALID_BITMAP_HEAP");
    const index = scan.kinder[0];
    if (index && index.dto.typ === "BitmapIndexScan") indexzugriff(index, true);
    else fehler.push("MISSING_BITMAP_INDEX_CHILD");
  } else fehler.push("MISSING_INDEXED_SCAN");
  return ergebnis();
}

module.exports = { INDEX_KATALOG_SQL, pruefeIndexplan };
