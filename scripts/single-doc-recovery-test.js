"use strict";

// Tests für den EINZEL-DOKUMENT-Recovery-Pfad (lib/helmut/single-doc-recovery.js +
// scripts/understanding-single-doc-recovery.js). Kein Netz, keine DB, kein KI —
// nur In-Memory-Fixtures + Quelltext-Scans.
//
// Deckt die 15 geforderten Szenarien ab: genau 1 Doc, 0 Docs, mehrere Docs,
// falsche raw_document_id, falsche vorgang_id, bestehendes complete-KO, semantisches
// Duplikat unter anderer vorgang_id, max 1 KI, max 1 Write, kein Write ohne Flag+Token,
// Idempotenz, vollständiger Rollback, Mandantentrennung, Datenschutz der Logs,
// Schutz vor pauschaler Suche.

const fs = require("fs");
const path = require("path");
const s = require("../lib/helmut/single-doc-recovery");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const SEED = "rd-e229f73873e0640fdcf34e65d382b0e10ffb78974fe7eb328048468c94edb48f";
const seedDoc = (over = {}) => ({ id: SEED, title: "Weniger Sozialwohnungen: Auch 2025 fielen 20 000 weg - nd-aktuell.de", summary: "", source_name: "nd-aktuell.de", ...over });
const pendingKo = { understanding_status: "pending", status: "pending" };

const moduleSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "single-doc-recovery.js"), "utf8");
const scriptSrc = fs.readFileSync(path.join(__dirname, "understanding-single-doc-recovery.js"), "utf8");

// (1) GENAU EIN erlaubtes Rohdokument -> recoverbar.
(() => {
  const p = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [seedDoc()], existingKo: pendingKo, docLinks: [] });
  check("1 · genau 1 erlaubtes Dokument -> ok/recoverbar", p.ok === true && p.grund === "recoverbar" && p.rawDocId === SEED && p.docCount === 1, JSON.stringify(s.redactPlan(p)));
})();

// (2) NULL Rohdokumente -> Abbruch.
(() => {
  const p = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [], existingKo: pendingKo, docLinks: [] });
  check("2 · 0 Dokumente -> Abbruch kein-dokument", p.ok === false && p.grund === "kein-dokument");
})();

// (3) MEHRERE Rohdokumente -> Abbruch.
(() => {
  const p = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [seedDoc(), seedDoc({ id: "rd-zusatz" })], existingKo: pendingKo, docLinks: [] });
  check("3 · >1 Dokument -> Abbruch mehr-als-ein-dokument", p.ok === false && p.grund === "mehr-als-ein-dokument");
})();

// (4) FALSCHE raw_document_id -> Abbruch.
(() => {
  const p = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [seedDoc({ id: "rd-falsch" })], existingKo: pendingKo, docLinks: [] });
  check("4 · falsche raw_document_id -> Abbruch", p.ok === false && p.grund === "falsche-raw-document-id");
})();

// (5) FALSCHE vorgang_id (nicht in Allowlist) -> Abbruch.
(() => {
  const p = s.planSingleDocRecovery({ vorgangId: "vg-medikamenten", docs: [seedDoc()], existingKo: pendingKo, docLinks: [] });
  check("5 · vorgang_id nicht in Allowlist -> Abbruch", p.ok === false && p.grund === "vorgang-nicht-in-allowlist");
})();

// (6) BESTEHENDES vollständiges Wissensobjekt -> Abbruch.
(() => {
  const p = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [seedDoc()], existingKo: { understanding_status: "complete", status: "neu" }, docLinks: [] });
  check("6 · bestehendes complete-KO -> Abbruch complete-ko-existiert", p.ok === false && p.grund === "complete-ko-existiert");
})();

// (7) SEMANTISCHES Duplikat unter ANDERER vorgang_id (Doc bereits mit fremdem KO verlinkt) -> Abbruch.
(() => {
  const p = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [seedDoc()], existingKo: pendingKo,
    docLinks: [{ knowledge_object_id: "ko-vg-wohnungsbau", raw_document_id: SEED }] });
  check("7 · Doc bereits fremd verlinkt -> Abbruch (semantisches Duplikat)", p.ok === false && p.grund === "dokument-bereits-anderweitig-verknuepft");
})();
// Gegentest: Verlinkung mit DEM eigenen Pending-Stub ist erlaubt (kein Fremd-Link).
(() => {
  const p = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [seedDoc()], existingKo: pendingKo,
    docLinks: [{ knowledge_object_id: "ko-vg-sozialwohnungen", raw_document_id: SEED }] });
  check("7 · eigener Stub-Link ist kein Fremd-Link -> ok", p.ok === true);
})();

// (8) MAXIMAL EIN KI-Aufruf: recoverSingleDoc ruft understandAndSave GENAU einmal.
const t8 = (async () => {
  let aiCalls = 0;
  const plan = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [seedDoc()], existingKo: pendingKo, docLinks: [] });
  const r = await s.recoverSingleDoc(plan, { getExisting: async () => pendingKo,
    understandAndSave: async () => { aiCalls += 1; return { wrote: true, aiCalls: 1, status: "saved", koId: "ko-vg-sozialwohnungen" }; } });
  check("8 · genau 1 KI-Aufruf", aiCalls === 1 && r.aiCalls === 1);
  // (9) MAXIMAL EIN WRITE.
  check("9 · genau 1 Write", r.wrote === true);
})();

// (10) KEIN Write/KI ohne Flag UND Token.
(() => {
  check("10 · enabled Default false", s.singleDocRecoveryEnabled({}) === false);
  check("10 · enabled bei 'on' true", s.singleDocRecoveryEnabled({ HELMUT_SINGLEDOC_RECOVERY_EXECUTE: "on" }) === true);
  check("10 · confirmed nur exaktes Token", s.singleDocRecoveryConfirmed("RECOVER_SOZIALWOHNUNGEN_SINGLEDOC") === true
    && s.singleDocRecoveryConfirmed("RECOVER_6_CONFIRMED") === false && s.singleDocRecoveryConfirmed("") === false);
  // Skript: KI/Write-Pfad erst NACH enabled+confirmed+plan.ok.
  const gateIdx = scriptSrc.indexOf("if (!enabled || !confirmed || !plan.ok)");
  const callIdx = scriptSrc.indexOf("understanding.understandOneCluster");
  check("10 · Skript: KI-Call erst NACH Flag+Token+plan.ok-Sperre", gateIdx > 0 && callIdx > gateIdx);
})();

// (11) IDEMPOTENZ: bereits complete -> recoverSingleDoc schreibt nicht, ruft KI nicht.
const t11 = (async () => {
  let called = 0;
  const plan = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [seedDoc()], existingKo: pendingKo, docLinks: [] });
  const r = await s.recoverSingleDoc(plan, { getExisting: async () => ({ understanding_status: "complete" }),
    understandAndSave: async () => { called += 1; return { wrote: true, aiCalls: 1 }; } });
  check("11 · idempotent: complete zur Laufzeit -> kein Write/KI", r.wrote === false && r.aiCalls === 0 && r.grund === "bereits-complete-idempotent" && called === 0);
})();

// (12) VOLLSTÄNDIGER ROLLBACK: der Lauf setzt eine eindeutige Rollback-Kennung ins
// understanding_model (recovery:<RUNID>) -> gezielt zurückrollbar; Kennung ist konfigurierbar.
(() => {
  check("12 · Skript hängt Rollback-Kennung an das Modell an", /understanding_model|modelName/.test(scriptSrc) && scriptSrc.includes("| recovery:${RUNID}"));
  check("12 · Lauf-Kennung stammt aus eigener Env (HELMUT_SINGLEDOC_RECOVERY_RUNID)", scriptSrc.includes("HELMUT_SINGLEDOC_RECOVERY_RUNID"));
})();

// (13) MANDANTENTRENNUNG: nur der eine Allowlist-Vorgang ist erlaubt; jeder andere
// (auch mit gültig aussehendem Doc) wird abgelehnt. Allowlist ist genau 1 Eintrag.
(() => {
  check("13 · Allowlist genau 1 Vorgang", Object.keys(s.SINGLE_DOC_ALLOWLIST).length === 1 && s.SINGLE_DOC_ALLOWLIST["vg-sozialwohnungen"] === SEED);
  const p = s.planSingleDocRecovery({ vorgangId: "vg-fremd-mandant", docs: [seedDoc()], existingKo: pendingKo, docLinks: [] });
  check("13 · fremder Vorgang -> abgelehnt (kein Cross-Vorgang/-Mandant)", p.ok === false && p.grund === "vorgang-nicht-in-allowlist");
})();

// (14) DATENSCHUTZ DER LOGS: redactPlan liefert NUR ids/Slugs/Zahlen — nie Titel/Volltext.
(() => {
  const p = s.planSingleDocRecovery({ vorgangId: "vg-sozialwohnungen", docs: [seedDoc()], existingKo: pendingKo, docLinks: [] });
  const r = s.redactPlan(p);
  const keys = Object.keys(r).sort().join(",");
  check("14 · redactPlan: nur erlaubte Schlüssel", keys === "clusterDocs,docCount,grund,ok,rawDocId,vorgangId");
  const json = JSON.stringify(r);
  check("14 · redactPlan: kein Titel/Volltext in der Ausgabe", !json.includes("Sozialwohnungen") && !json.includes("nd-aktuell"));
  // Skript loggt keine Rohtitel/-summaries.
  check("14 · Skript loggt keine doc.title/doc.summary", !/\.title\b/.test(scriptSrc.replace(/redactPlan|display_title/g, "")) && !/console\.log\([^)]*summary/i.test(scriptSrc));
})();

// (15) SCHUTZ VOR PAUSCHALER SUCHE: der Pfad nutzt NUR getRawDocumentById (exakte id)
// und clustert ausschließlich das EINE Dokument — keine Pool-/Anker-/Teilstring-Suche.
(() => {
  check("15 · Skript lädt per exakter id (getRawDocumentById)", scriptSrc.includes("getRawDocumentById"));
  check("15 · Skript nutzt KEINE Pool-/Listen-Lesung", !scriptSrc.includes("listRawDocuments") && !scriptSrc.includes("listAllRawDocuments"));
  check("15 · Modul nutzt KEINE Anker-/Teilstring-Suche", !/anchorTokens|matchDocuments|candidateAnchors|ilike|includes\(/i.test(moduleSrc));
  check("15 · Modul clustert nur das EINE Dokument ([doc])", moduleSrc.includes("cluster([doc])"));
})();

Promise.all([t8, t11]).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}).catch((e) => { console.error("Single-Doc-Test-Fehler:", e && e.message); process.exit(1); });
