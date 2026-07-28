"use strict";

// Sprint 22A — Offline-Tests für den Embedding-Datenvertrag.
// Rein offline: Fixtures, kein Netz, keine KI, keine DB.
// Deckt die 14 verbindlichen Sprintregeln ab (Hash-Stabilität, Ausschlussfelder,
// Validierung, Idempotenz, Wiederaufnahme, Modellversionen, Mandantenneutralität).

const fs = require("fs");
const path = require("path");
const ec = require("../lib/helmut/embedding-contract");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// --- Fixtures ---------------------------------------------------------------
const koBasis = {
  id: "ko-a", understanding_status: "complete", status: "neu",
  headline: "Bundestag beschließt Reform der Pflegefinanzierung",
  was_ist_passiert: "Der Bundestag hat am 2026-07-01 eine Reform der Pflegefinanzierung beschlossen, die Eigenanteile deckelt.",
  warum_wichtig: "Die Deckelung entlastet Pflegebedürftige und verändert die Finanzierungslast der Länder.",
  event_type: "gesetzesbeschluss",
  decision_entities: [{ name: "Bundestag", type: "parlament" }, { name: "BMG", type: "ministerium" }],
  related_entities: [{ name: "Bundesrat", type: "parlament" }],
  tags: ["Pflege"], policy_field: ["Gesundheit"], political_level: "bund",
  affected_geographies: [{ id: "geo-bund" }], mentioned_locations: ["Berlin"],
  classification_confidence: { ebene: 0.9 }
};
const klon = (patch) => ({ ...JSON.parse(JSON.stringify(koBasis)), ...patch });

// --- 1) identischer Eingang -> identischer Hash ------------------------------
check("1 identischer Eingang erzeugt identischen Hash",
  ec.computeEmbeddingInputHash(koBasis) === ec.computeEmbeddingInputHash(klon({})));

// --- 2) relevante Inhaltsänderung -> neuer Hash ------------------------------
check("2a Headline-Änderung erzeugt neuen Hash",
  ec.computeEmbeddingInputHash(klon({ headline: "Anderer Titel" })) !== ec.computeEmbeddingInputHash(koBasis));
check("2b Vorgangs-Änderung erzeugt neuen Hash",
  ec.computeEmbeddingInputHash(klon({ was_ist_passiert: "Etwas völlig anderes ist geschehen." })) !== ec.computeEmbeddingInputHash(koBasis));
check("2c Akteurs-Änderung erzeugt neuen Hash",
  ec.computeEmbeddingInputHash(klon({ decision_entities: [{ name: "Bundesrat" }] })) !== ec.computeEmbeddingInputHash(koBasis));

// --- 3) Änderung ausgeschlossener Felder -> KEIN neuer Hash ------------------
const hashBasis = ec.computeEmbeddingInputHash(koBasis);
check("3a Fachgebiets-Korrektur ändert Hash nicht",
  ec.computeEmbeddingInputHash(klon({ tags: [], policy_field: ["Arbeit"] })) === hashBasis);
check("3b Ebenen-Korrektur ändert Hash nicht",
  ec.computeEmbeddingInputHash(klon({ political_level: "land", decision_level: "land" })) === hashBasis);
check("3c Geografie-Korrektur ändert Hash nicht",
  ec.computeEmbeddingInputHash(klon({ affected_geographies: [], mentioned_locations: ["Potsdam"], mentioned_geographies: [{ id: "geo-bb" }] })) === hashBasis);
check("3d Konfidenz-/Bewertungsänderung ändert Hash nicht",
  ec.computeEmbeddingInputHash(klon({ classification_confidence: { ebene: 0.1, nachklassifikation_am: "2026-07-28" }, briefing_score: 99 })) === hashBasis);
check("3e Entitäten-Umsortierung ändert Hash nicht",
  ec.computeEmbeddingInputHash(klon({ decision_entities: [{ name: "BMG" }, { name: "Bundestag" }] })) === hashBasis);
check("3f Whitespace-Normalisierung ändert Hash nicht",
  ec.computeEmbeddingInputHash(klon({ headline: "  Bundestag   beschließt Reform der Pflegefinanzierung " })) === hashBasis);

// --- 4-6) Vektorvalidierung --------------------------------------------------
check("4a falsche Dimension wird erkannt",
  ec.validateVector(new Array(128).fill(0.1), 256).reason === "falsche-dimension");
check("4b pgvector-String mit falscher Dimension wird erkannt",
  ec.validateVector("[0.1,0.2]", 256).reason === "falsche-dimension");
check("5a fehlender Vektor wird erkannt", ec.validateVector(null, 256).reason === "fehlt");
check("5b leerer Vektor wird erkannt", ec.validateVector([], 256).reason === "leer");
check("6a NaN wird erkannt",
  ec.validateVector([0.1, NaN, 0.2].concat(new Array(253).fill(0)), 256).reason === "ungueltige-werte");
check("6b Nicht-Zahlen werden erkannt",
  ec.validateVector(["x"].concat(new Array(255).fill(0.1)), 256).reason === "ungueltige-werte");
check("6c Nullvektor wird erkannt",
  ec.validateVector(new Array(256).fill(0), 256).reason === "nullvektor");
check("6d gültiger Vektor besteht",
  ec.validateVector(new Array(256).fill(0.05), 256).ok === true);
check("6e gültiger pgvector-String besteht",
  ec.validateVector(`[${new Array(256).fill(0.05).join(",")}]`, 256).ok === true);

// --- 7) bereits aktueller Vektor wird übersprungen ---------------------------
const EXPECT = { model: "modell-x", dim: 4, recipeVersion: ec.RECIPE_VERSION };
const aktuellMeta = {
  vector: [0.1, 0.2, 0.3, 0.4], input_hash: hashBasis,
  model: "modell-x", dim: 4, recipe_version: ec.RECIPE_VERSION
};
check("7 aktueller Vektor gilt als aktuell",
  ec.isEmbeddingCurrent(aktuellMeta, { ...EXPECT, inputHash: hashBasis }).current === true);
check("7b Score-/Briefing-Änderungen lösen keine Neuerzeugung aus (Hash unverändert -> aktuell)",
  ec.isEmbeddingCurrent(aktuellMeta, { ...EXPECT, inputHash: ec.computeEmbeddingInputHash(klon({ briefing_score: 1, similarity: 0.9 })) }).current === true);

// --- 8) ausgeschlossene Objekte sind nicht berechtigt ------------------------
check("8a unverstandenes Objekt (pending) nicht berechtigt",
  ec.isEligibleForEmbedding(klon({ understanding_status: "pending" })).reason === "nicht-verstanden");
check("8b gescheitertes Objekt (failed) nicht berechtigt",
  ec.isEligibleForEmbedding(klon({ understanding_status: "failed" })).reason === "nicht-verstanden");
check("8c terminal aussortiertes Objekt nicht berechtigt",
  ec.isEligibleForEmbedding(klon({ status: "aussortiert:run1:pending" })).reason === "aussortiert");
check("8d zusammengeführtes Objekt nicht berechtigt",
  ec.isEligibleForEmbedding(klon({ merged_into: "ko-b" })).reason === "zusammengefuehrt");
check("8e Objekt ohne Mindestinhalt nicht berechtigt",
  ec.isEligibleForEmbedding(klon({ headline: "x", was_ist_passiert: "", warum_wichtig: "" })).reason === "mindestinhalt-fehlt");

// --- 9/10) fehlendes Fachgebiet / unbekannte Ebene sind KEINE Blocker --------
check("9 verstanden ohne Fachgebiet ist berechtigt",
  ec.isEligibleForEmbedding(klon({ tags: [], policy_field: [] })).eligible === true);
check("10 verstanden mit unbekannter Ebene ist berechtigt",
  ec.isEligibleForEmbedding(klon({ political_level: "unknown", decision_level: "unknown" })).eligible === true);

// --- 11) Mehrfachlauf ist idempotent -----------------------------------------
const objekte = [
  koBasis,
  klon({ id: "ko-b", headline: "Landtag Brandenburg debattiert Krankenhausplan im Detail" }),
  klon({ id: "ko-c", understanding_status: "pending" }),
  klon({ id: "ko-d", tags: [], policy_field: [] })
];
const meta = {};
const plan1 = ec.planEmbeddingWork(objekte, meta, EXPECT);
check("11a Erstlauf plant genau die berechtigten Objekte",
  plan1.toCompute.length === 3 && plan1.excluded.length === 1);
// "Ausführung" simulieren: Meta fortschreiben wie es ein Backfill täte.
for (const w of plan1.toCompute) {
  meta[w.id] = { vector: [0.1, 0.2, 0.3, 0.4], input_hash: w.inputHash, model: "modell-x", dim: 4, recipe_version: ec.RECIPE_VERSION };
}
const plan2 = ec.planEmbeddingWork(objekte, meta, EXPECT);
check("11b Zweitlauf plant 0 Neuberechnungen (idempotent)",
  plan2.toCompute.length === 0 && plan2.current.length === 3);

// --- 12) gemischte Modellversionen werden erkannt ----------------------------
meta["ko-b"].model = "modell-alt";
const plan3 = ec.planEmbeddingWork(objekte, meta, EXPECT);
check("12 Modellwechsel wird erkannt und nur dieses Objekt neu geplant",
  plan3.toCompute.length === 1 && plan3.toCompute[0].id === "ko-b" && plan3.toCompute[0].reason === "modellwechsel");
meta["ko-b"].model = "modell-x";
check("12b Rezeptwechsel wird erkannt",
  ec.isEmbeddingCurrent({ ...meta["ko-a"], recipe_version: "ko-kanon-0" }, { ...EXPECT, inputHash: hashBasis }).reason === "rezeptwechsel");

// --- 13) Abbruch und Wiederaufnahme verlieren keine Ergebnisse ---------------
const metaResume = {};
const batch1 = ec.planEmbeddingWork(objekte, metaResume, EXPECT, { maxPerRun: 2 });
check("13a Paketgrenze wird eingehalten", batch1.toCompute.length === 2 && batch1.remaining === 1);
for (const w of batch1.toCompute) {
  metaResume[w.id] = { vector: [0.1, 0.2, 0.3, 0.4], input_hash: w.inputHash, model: "modell-x", dim: 4, recipe_version: ec.RECIPE_VERSION };
}
const batch2 = ec.planEmbeddingWork(objekte, metaResume, EXPECT, { maxPerRun: 2 });
const alleIds = new Set([...batch1.toCompute, ...batch2.toCompute].map((w) => w.id));
check("13b Wiederaufnahme plant exakt die restlichen Objekte, keine doppelt",
  batch2.toCompute.length === 1 && alleIds.size === 3);
check("13c fertige Pakete werden bei Wiederaufnahme übersprungen", batch2.current.length === 2);

// --- 14) Mandantenneutralität ------------------------------------------------
check("14a Mandanten-/Nutzerfelder ändern den Hash nicht",
  ec.computeEmbeddingInputHash(klon({ user_id: "mandant-1", mandant: "mandant-1", nutzer: "X", user_priority: "hoch" })) === hashBasis);
check("14b kanonischer Eingang enthält keine Mandantenfelder",
  !/mandant|user_id|nutzer/i.test(ec.buildCanonicalEmbeddingInput(klon({ user_id: "mandant-1" })).text));
const quelltext = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "embedding-contract.js"), "utf8");
check("14c kein Mandant ist im Vertragsmodul hartkodiert (kein cem-ince)",
  !/cem[-_]?ince/i.test(quelltext));
check("14d Ausschlussliste führt die strukturierten Filterfelder",
  ["tags", "policy_field", "political_level", "affected_geographies"].every((f) => ec.EXCLUDED_INPUT_FIELDS.includes(f)));

// --- Zusatz: beschädigte Vektoren in der Gültigkeitsprüfung ------------------
check("Z1 beschädigter Vektor macht Embedding ungültig",
  ec.isEmbeddingCurrent({ ...aktuellMeta, vector: [0.1, NaN, 0.3, 0.4] }, { ...EXPECT, inputHash: hashBasis }).reason === "ungueltige-werte");
check("Z2 fehlender Vektor macht Embedding ungültig",
  ec.isEmbeddingCurrent({ ...aktuellMeta, vector: null }, { ...EXPECT, inputHash: hashBasis }).reason === "fehlt");
check("Z3 Dimensionsabweichung macht Embedding ungültig",
  ec.isEmbeddingCurrent({ ...aktuellMeta, vector: [0.1, 0.2] }, { ...EXPECT, inputHash: hashBasis }).reason === "falsche-dimension");
check("Z4 Eingangstext ist deterministisch aufgebaut",
  ec.buildCanonicalEmbeddingInput(koBasis).text.startsWith("titel: Bundestag beschließt"));

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
