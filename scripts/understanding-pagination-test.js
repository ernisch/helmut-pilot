"use strict";

// ============================================================================
// Tests fuer die VOLLSTAENDIGE, seitenweise Lesung (Pagination) der raw_documents
// im Recovery-Trockenlauf. Hintergrund (Bugfix 2026-07-17):
//   listRawDocuments verliess sich auf ein einzelnes ?limit=-Argument. PostgREST
//   kappt server-seitig (db-max-rows, Supabase-Default 1000) — bei
//   order=created_at.desc kamen NUR die neuesten ~1000 Zeilen zurueck, die alten
//   Seed-Dokumente (Anfang Juli) fehlten. Faelle wurden dadurch faelschlich als
//   "keine-quelldokumente" bewertet.
//
// Diese Suite belegt die Korrektur AUSSCHLIESSLICH offline (kein Netz, keine DB,
// kein KI) ueber eine injizierte Fake-Seiten-Funktion:
//   (a) mehr als 1000 Dokumente werden vollstaendig geladen
//   (b) mehr als 2000 Dokumente werden vollstaendig geladen
//   (c) alte Seed-Dokumente ausserhalb der ersten Seite werden gefunden
//   (d) vollstaendige Pagination ohne Duplikate (Dedup nach id, auch bei Overlap)
//   (e) Abbruch bei fehlerhafter Seite (Fehler propagiert, kein stiller Teil-Pool)
//   (f) rein lesender Betrieb ohne Write-Pfad

const fs = require("fs");
const path = require("path");
const storage = require("../lib/helmut/storage");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Baut N Dokumente; index 0 = "neuestes" (wie order=created_at.desc), N-1 = aeltestes.
function makeDocs(n, prefix = "rd") {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: `${prefix}-${String(i).padStart(5, "0")}`, title: `Doc ${i}` });
  return out;
}

// Fake-"Server" mit realem Verhalten: gibt hoechstens `cap` Zeilen pro Seite
// zurueck (simuliert PostgREST db-max-rows), unabhaengig vom angeforderten pageSize.
function makeCappedServer(docs, cap = 1000) {
  return async (offset, pageSize) => {
    const n = Math.min(Number(pageSize) || 0, cap);
    return docs.slice(offset, offset + n);
  };
}

// (a) MEHR ALS 1000 DOKUMENTE ------------------------------------------------
async function testA() {
  const docs = makeDocs(1500);
  const server = makeCappedServer(docs, 1000);
  const { rows, pages } = await storage.collectAllPages(server, { pageSize: 1000, keyField: "id" });
  check("a · >1000 Dokumente vollstaendig geladen", rows.length === 1500, `geladen=${rows.length}`);
  check("a · benoetigte mehr als eine Seite", pages >= 2, `pages=${pages}`);
  // Kontrast: EINE einzelne (gekappte) Abfrage wuerde nur 1000 liefern -> genau der Bug.
  const single = await server(0, 8000);
  check("a · einzelne gekappte Abfrage liefert nur 1000 (belegt den Bug)", single.length === 1000, `single=${single.length}`);
}

// (b) MEHR ALS 2000 DOKUMENTE ------------------------------------------------
async function testB() {
  const docs = makeDocs(2500);
  const server = makeCappedServer(docs, 1000);
  const { rows, pages } = await storage.collectAllPages(server, { pageSize: 1000, keyField: "id" });
  check("b · >2000 Dokumente vollstaendig geladen", rows.length === 2500, `geladen=${rows.length}`);
  check("b · mindestens drei Seiten", pages >= 3, `pages=${pages}`);
  const ids = new Set(rows.map((r) => r.id));
  check("b · neuestes UND aeltestes Dokument vorhanden", ids.has("rd-00000") && ids.has("rd-02499"));
}

// (c) ALTE SEED-DOKUMENTE AUSSERHALB DER ERSTEN SEITE ------------------------
async function testC() {
  const docs = makeDocs(1500);
  const SEED = "rd-01499"; // weit hinten, ausserhalb der ersten 1000er-Seite
  const server = makeCappedServer(docs, 1000);
  const { rows } = await storage.collectAllPages(server, { pageSize: 1000, keyField: "id" });
  check("c · Seed ausserhalb Seite 1 wird gefunden", rows.some((r) => r.id === SEED), `seed=${SEED}`);
  const firstPage = await server(0, 1000);
  check("c · erste Seite allein enthaelt den Seed NICHT", !firstPage.some((r) => r.id === SEED));
}

// (d) VOLLSTAENDIGE PAGINATION OHNE DUPLIKATE --------------------------------
async function testD() {
  const docs = makeDocs(1500);
  // "Inclusive-Range"-Server: jede Seite beginnt EINE Zeile vor dem angeforderten
  // Offset -> aufeinanderfolgende Seiten ueberlappen um 1 Zeile (realer PostgREST-
  // Range-Fallstrick / Drift). Dedup nach id MUSS die Ueberlappung aufloesen.
  const overlapServer = async (offset, pageSize) => {
    const start = Math.max(0, offset - 1);
    return docs.slice(start, start + Math.min(Number(pageSize) || 0, 1000));
  };
  const { rows } = await storage.collectAllPages(overlapServer, { pageSize: 1000, keyField: "id" });
  const ids = rows.map((r) => r.id);
  const uniq = new Set(ids);
  check("d · Ergebnis enthaelt KEINE Duplikate", ids.length === uniq.size, `rows=${ids.length} uniq=${uniq.size}`);
  check("d · trotz Overlap alle 1500 eindeutigen Dokumente vorhanden", uniq.size === 1500, `uniq=${uniq.size}`);
}

// (e) ABBRUCH BEI FEHLERHAFTER SEITE -----------------------------------------
async function testE() {
  const docs = makeDocs(1500);
  let calls = 0;
  const flakyServer = async (offset, pageSize) => {
    calls += 1;
    if (calls === 2) throw new Error("simulierter Seitenfehler (HTTP 500)");
    return docs.slice(offset, offset + Math.min(Number(pageSize) || 0, 1000));
  };
  let threw = false, value = null;
  try { value = await storage.collectAllPages(flakyServer, { pageSize: 1000, keyField: "id" }); }
  catch (e) { threw = true; }
  check("e · fehlerhafte Seite fuehrt zum Abbruch (throw)", threw === true, value ? "wurde aufgeloest" : "");
  check("e · KEIN stiller Teil-Pool zurueckgegeben", value === null);
}

// (e2) ANTI-ENDLOSSCHLEIFE: Server der NIE leer liefert -> Abbruch bei maxPages.
async function testE2() {
  const docs = makeDocs(5000);
  const server = makeCappedServer(docs, 1000);
  const { rows, pages, truncated } = await storage.collectAllPages(server, { pageSize: 1000, maxPages: 3, keyField: "id" });
  check("e2 · maxPages begrenzt die Seitenzahl", pages === 3, `pages=${pages}`);
  check("e2 · truncated-Flag signalisiert unvollstaendigen Pool", truncated === true);
  check("e2 · nur die geladenen Seiten sind enthalten (kein Overrun)", rows.length === 3000, `rows=${rows.length}`);
}

// (f) REIN LESENDER BETRIEB OHNE WRITE-PFAD ----------------------------------
async function testF() {
  // (f1) collectAllPages ruft die injizierte Seiten-Funktion NUR mit (offset,limit)
  // auf — es gibt keinen Schreibkanal. Belegt die reine Lese-Aufrufkonvention.
  const seen = [];
  const spy = async (offset, pageSize) => {
    seen.push([typeof offset, typeof pageSize]);
    return offset === 0 ? [{ id: "x1" }] : [];
  };
  await storage.collectAllPages(spy, { pageSize: 10, keyField: "id" });
  check("f1 · Seiten-Funktion wird nur mit (number, number) aufgerufen",
    seen.length > 0 && seen.every(([a, b]) => a === "number" && b === "number"), JSON.stringify(seen));

  // (f2) listAllRawDocuments ist ohne Store-Bereitschaft (keine SUPABASE_*-Secrets)
  // vollstaendig inert: liefert [] OHNE Netzzugriff/Write.
  const res = await storage.listAllRawDocuments({ days: 120 });
  check("f2 · listAllRawDocuments ohne Secrets inert ([], kein Netz)", Array.isArray(res) && res.length === 0);

  // (f3) Quelltext-Scan: der Trockenlauf hat KEINEN Schreib-/KI-/Execute-Pfad.
  const dry = fs.readFileSync(path.join(__dirname, "understanding-recovery-dryrun.js"), "utf8");
  check("f3 · Trockenlauf nutzt die paginierte Lesung", dry.includes("listAllRawDocuments"));
  check("f3 · Trockenlauf hat harte --execute-Sperre", dry.includes("--execute"));
  check("f3 · Trockenlauf ruft keinen Understand/Save-Schreibpfad auf",
    !dry.includes("understandOneCluster") && !dry.includes("saveKnowledgeObject") && !/\bunderstandAndSave\b/.test(dry));

  // (f4) Die paginierte Lesung baut eine GET-Abfrage (kein method/body -> kein Write).
  const store = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
  const fnStart = store.indexOf("async function listAllRawDocuments");
  const fnBody = fnStart >= 0 ? store.slice(fnStart, fnStart + 900) : "";
  check("f4 · listAllRawDocuments enthaelt keinen Schreib-Method-/Body-Aufruf",
    fnBody.length > 0 && !/method:\s*["'](POST|PATCH|PUT|DELETE)["']/.test(fnBody) && !/\bbody:/.test(fnBody));
}

async function main() {
  await testA();
  await testB();
  await testC();
  await testD();
  await testE();
  await testE2();
  await testF();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error("Pagination-Test-Fehler:", e && e.message); process.exit(1); });
