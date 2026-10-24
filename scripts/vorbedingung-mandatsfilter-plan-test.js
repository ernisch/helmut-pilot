"use strict";

// Reine Gegenbeispiele fuer Z22 §9; keine Datenbank, kein Netz, kein Produktimport.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pruefeIndexplan } = require("./vorbedingung-mandatsfilter-plan.js");
const migrationen = ["20260808_scalable_job_queue.sql", "20260808_jobqueue_abhaengigkeiten.sql",
  "20260826190000_jobqueue_vorbedingung_mandatsfilter.sql", "20260829123132_z22_mandatsfilter_zeilenkennung_korrigieren.sql"]
  .map((name) => fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", name), "utf8")).join("\n");
const namen = ["helmut_jobs_window_idx", "helmut_jobs_fenster_typ_idx"];
// Der Testkatalog stammt aus den echten Migrationen, nicht aus Validator-Konstanten.
const katalog = [...migrationen.matchAll(/create index if not exists (helmut_jobs_[a-z_]+)\s+on public\.helmut_jobs\s*\(([^)]+)\)/gi)]
  .filter((match) => namen.includes(match[1])).map((match) => ({
    schema: "public", table: "helmut_jobs", indexSchema: "public", index: match[1], method: "btree", valid: true, ready: true,
    definition: `CREATE INDEX ${match[1]} ON public.helmut_jobs USING btree (${match[2].replace(/\s+/g, " ").trim()})`
  }));
assert.equal(katalog.length, 2);
const kopie = (x) => JSON.parse(JSON.stringify(x));
const scan = (typ = "Index Scan", index = namen[0]) => ({ "Node Type": typ, Schema: "public",
  "Relation Name": "helmut_jobs", "Index Name": index, "Actual Rows": 714, "Actual Loops": 1,
  "Index Cond": "(j.freshness_window = ANY ('{2026-07-14T00Z}'::text[]))" });
const bitmap = (index = namen[0]) => ({ "Node Type": "Bitmap Heap Scan", Schema: "public",
  "Relation Name": "helmut_jobs", "Actual Rows": 238, "Actual Loops": 1,
  Plans: [{ "Node Type": "Bitmap Index Scan", "Index Name": index,
    "Actual Rows": 714, "Actual Loops": 1,
    "Index Cond": "(freshness_window = ANY ('{2026-07-14T00Z}'::text[]))" }] });
const plan = (knoten = scan()) => [{ Plan: { "Node Type": "Aggregate", "Actual Rows": 1,
  "Actual Loops": 1, Plans: [knoten] }, "Execution Time": 1.073 }];
const pruefe = (dokument, { filter = false, catalog = katalog } = {}) =>
  pruefeIndexplan(JSON.stringify(dokument), JSON.stringify(catalog), { mitMandatsfilter: filter });
function abgelehnt(dokument, code, options) {
  const ergebnis = pruefe(dokument, options);
  assert.equal(ergebnis.ok, false); if (code) assert.equal(ergebnis.code, code);
  return ergebnis;
}
let pass = 0;
function test(name, pruefung) { pruefung(); pass += 1; console.log(`PASS ${name}`); }

test("IndexOnly darf ohne Filter zu Index oder Bitmap mit Filter wechseln", () => {
  const ohne = pruefe(plan(scan("Index Only Scan", namen[1])));
  assert.equal(ohne.ok, true); assert.equal(ohne.dauerMs, 1.073);
  for (const mit of [plan(scan()), plan(bitmap())]) {
    const ergebnis = pruefe(mit, { filter: true }); assert.equal(ergebnis.ok, true);
    assert.notEqual(ergebnis.signatur, ohne.signatur);
  }
});
test("Beide lokal beobachteten Bitmapformen sind echte vorhandene Indexzugriffe", () => {
  assert.equal(pruefe(plan(bitmap())).ok, true);
  assert.equal(pruefe(plan(bitmap()), { filter: true }).ok, true);
});
test("Zwei identische SeqScans geben kein falsches Gruen", () => {
  const seq = scan("Seq Scan"); delete seq["Index Name"]; delete seq["Index Cond"];
  abgelehnt(plan(seq), "SEQ_SCAN_FORBIDDEN"); abgelehnt(plan(seq), "SEQ_SCAN_FORBIDDEN", { filter: true });
});
test("SeqScan unter Aggregate bleibt trotz gueltigem Indexgeschwister verboten", () => {
  const dokument = plan(); const seq = scan("Seq Scan"); delete seq["Index Name"];
  dokument[0].Plan.Plans.push(seq); abgelehnt(dokument, "SEQ_SCAN_FORBIDDEN");
});
test("Fremde Tabelle und fremdes Schema scheitern bei Index- und Bitmapheapscan", () => {
  for (const knoten of [scan(), bitmap()]) for (const [feld, wert] of [["Schema", "foreign"], ["Relation Name", "foreign_jobs"]]) {
    const fremd = kopie(knoten); fremd[feld] = wert; abgelehnt(plan(fremd));
  }
});
test("Ein fehlender, unbekannter oder fuer diesen Zugriff ungeeigneter Index scheitert", () => {
  for (const name of [undefined, "foreign_idx", "helmut_jobs_status_idx"]) {
    const knoten = scan(); knoten["Index Name"] = name; abgelehnt(plan(knoten), "UNREVIEWED_INDEX");
    const heap = bitmap(); heap.Plans[0]["Index Name"] = name; abgelehnt(plan(heap), "UNREVIEWED_INDEX");
  }
});
test("IndexOnly braucht alle Ausgabe- und Filterspalten, nicht bloss irgendeinen Index", () => {
  abgelehnt(plan(scan("Index Only Scan", namen[0])), "INDEX_ONLY_MISSING_COLUMNS");
  abgelehnt(plan(scan("Index Only Scan", namen[1])), "INDEX_ONLY_MISSING_COLUMNS", { filter: true });
});
test("Fehlende oder nicht fenstereinschraenkende Indexbedingungen scheitern", () => {
  for (const bedingung of [undefined, "", "(status = 'wartend'::text)", "'freshness_window = ANY ('"]) {
    for (const knoten of [scan(), bitmap()]) {
      const index = knoten.Plans ? knoten.Plans[0] : knoten; index["Index Cond"] = bedingung;
      abgelehnt(plan(knoten), "MISSING_WINDOW_INDEX_CONDITION");
    }
  }
});
test("Bitmapindex ist nur mit genau seinem gueltigen Heap-Elternknoten zulaessig", () => {
  abgelehnt(plan(bitmap().Plans[0]), "MISSING_INDEXED_SCAN");
  const ohneKind = bitmap(); ohneKind.Plans = []; abgelehnt(plan(ohneKind), "INVALID_BITMAP_HEAP");
  const falsch = bitmap(); falsch.Plans = [scan()]; abgelehnt(plan(falsch), "MISSING_BITMAP_INDEX_CHILD");
  const zwei = bitmap(); zwei.Plans.push(kopie(zwei.Plans[0])); abgelehnt(plan(zwei), "INVALID_BITMAP_HEAP");
  const fremd = bitmap(); fremd.Plans[0].Schema = "foreign"; abgelehnt(plan(fremd), "WRONG_INDEX_RELATION");
});
test("Zusaetzliche Plaene werden vollstaendig geprueft und nicht ueberlesen", () => {
  const dokument = plan(); dokument[0].Plan.Plans.push(scan()); abgelehnt(dokument, "INVALID_AGGREGATE_SHAPE");
  const index = scan(); index.Plans = [scan()]; abgelehnt(plan(index), "INDEX_NODE_HAS_CHILDREN");
  const unbekannt = scan("Custom Scan"); unbekannt.Plans = [scan()]; abgelehnt(plan(unbekannt), "UNKNOWN_PLAN_NODE");
});
test("Leere, fehlende und fehlerhaft strukturierte EXPLAIN-Plaene scheitern geschlossen", () => {
  for (const dokument of [[], [{}], [{ Plan: null }], plan().concat(plan()), plan([])]) assert.equal(pruefe(dokument).ok, false);
  const kinder = plan(); kinder[0].Plan.Plans = "wrong"; abgelehnt(kinder, "MALFORMED_PLAN_CHILDREN");
  const schema = plan(); delete schema[0].Plan.Plans[0].Schema; abgelehnt(schema, "WRONG_INDEX_RELATION");
  assert.equal(pruefeIndexplan("not json", JSON.stringify(katalog), { mitMandatsfilter: false }).ok, false);
});
test("Nur wirklich ausgefuehrte Scans mit endlichen ANALYZE-Messwerten gelten", () => {
  const dokument = plan(); dokument[0].Plan.Plans[0]["Actual Loops"] = 0;
  abgelehnt(dokument, "UNEXECUTED_OR_MALFORMED_NODE");
  const zeit = plan(); zeit[0]["Execution Time"] = "1.0"; abgelehnt(zeit, "INVALID_EXECUTION_TIME");
  assert.equal(pruefeIndexplan(JSON.stringify(plan()), JSON.stringify(katalog), { mitMandatsfilter: "false" }).ok, false);
});
test("Fehlender oder doppelter Katalogeintrag ist kein Indexnachweis", () => {
  for (const catalog of [[], katalog.slice(0, 1), [katalog[0], katalog[0]], null]) abgelehnt(plan(), "INDEX_CATALOG_DRIFT", { catalog });
  assert.equal(pruefeIndexplan(JSON.stringify(plan()), "not json", { mitMandatsfilter: false }).ok, false);
});
test("Indexname allein genuegt nicht: Eigentum, Btree, valid und ready sind Pflicht", () => {
  for (const [feld, wert] of [["schema", "foreign"], ["table", "foreign_jobs"], ["indexSchema", "foreign"],
    ["method", "hash"], ["valid", false], ["ready", false]]) {
    const catalog = kopie(katalog); catalog[0][feld] = wert; abgelehnt(plan(), "INDEX_CATALOG_DRIFT", { catalog });
  }
});
test("Gleichnamiger Index mit anderer DDL ist kein gueltiger Bestandsindex", () => {
  for (const suffix of [" WHERE status = 'wartend'", " INCLUDE (tenant_id)", " changed"]) {
    const catalog = kopie(katalog); catalog[0].definition += suffix; abgelehnt(plan(), "INDEX_CATALOG_DRIFT", { catalog });
  }
});
test("Sichere Signatur enthaelt den vollstaendigen Bitmapbaum und keine Rohwerte", () => {
  const ergebnis = pruefe(plan(bitmap())); const dto = JSON.parse(ergebnis.signatur);
  assert.equal(dto.kinder[0].typ, "BitmapHeapScan"); assert.equal(dto.kinder[0].kinder[0].typ, "BitmapIndexScan");
  const canary = "DYNAMIC_AUTH_SQL_CANARY_NEVER_EMIT";
  const fremd = scan(); fremd.Schema = canary; fremd["Relation Name"] = canary;
  fremd["Index Name"] = canary; fremd["Index Cond"] = canary; fremd.Output = [canary];
  const sicher = abgelehnt(plan(fremd)); assert.equal(JSON.stringify(sicher).includes(canary), false);
  assert.equal(sicher.signatur.includes("UNREVIEWED_INDEX"), true);
});
console.log(`PASS ${pass} FAIL 0 — reine Z22-Plan-Gegenbeispiele, kein DB-Lauf`);
