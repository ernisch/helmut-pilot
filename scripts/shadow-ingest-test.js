"use strict";

// Offline-Test des isolierten Shadow-Ingests (scripts/shadow-ingest.js).
// REINE LOGIK: PARDOK-Gold-Fixtures + synthetische RSS-Items durch die echte Kette
// (Normalisierung -> Dedup/Fundstellen -> Klassifikation -> KO-Input -> Kosten -> Isolation).

const fs = require("fs");
const path = require("path");
const { ingestShadow, isolationSelfCheck } = require("./shadow-ingest");
const P = require("../lib/helmut/quellenarchitektur/pardok-parser");
const { normalizeRawItem } = require("../lib/helmut/crawler");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
function fx(n) { return fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "pardok", n), "utf8"); }

// PARDOK-Quellen aus Gold-Fixtures.
const be = P.parsePardokDocumentsFromString(fx("berlin-gold.xml"), { land: "berlin" }).documents;
const bb = P.parsePardokDocumentsFromString(fx("brandenburg-gold.xml"), { land: "brandenburg" }).documents;

// RSS-Quelle: eine Bundes-Story (2 Wege -> Fundstellen-Merge) + eine Landes-Story + eine neutrale.
const rssSrc = { id: "be-regionale_leitmedien", name: "Tagesspiegel", type: "shadow", url: "https://www.tagesspiegel.de/x", priority: 0 };
const gnSrc = { id: "be-landesregierung", name: "GN Senat", type: "shadow", url: "https://news.google.com/x", priority: 0 };
const bundStory = "Bundestag beschliesst Rentenpaket in namentlicher Abstimmung";
const rssItems = [
  normalizeRawItem({ title: bundStory, content: bundStory, url: "https://www.tagesspiegel.de/politik/rentenpaket", publishedAt: "2026-07-13T09:00:00Z" }, rssSrc),
  normalizeRawItem({ title: bundStory, content: bundStory, url: "", originalUrl: "https://news.google.com/rss/articles/abc", publishedAt: "2026-07-13T10:00:00Z" }, gnSrc),
  normalizeRawItem({ title: "Abgeordnetenhaus Berlin debattiert Mietendeckel", content: "Das Abgeordnetenhaus Berlin ...", url: "https://www.tagesspiegel.de/berlin/mietendeckel", publishedAt: "2026-07-13T08:00:00Z" }, rssSrc),
  normalizeRawItem({ title: "Wetterbericht fuer das Wochenende", content: "Sonnig", url: "https://www.tagesspiegel.de/wetter", publishedAt: "2026-07-13T07:00:00Z" }, rssSrc)
];

const sources = [
  { sourceId: "be-plenum", retrievalPathId: "rp-be-plenum", kind: "pardok", items: be },
  { sourceId: "bb-plenum", retrievalPathId: "rp-bb-plenum", kind: "pardok", items: bb },
  { sourceId: "be-regionale_leitmedien", retrievalPathId: "rp-be-regionale_leitmedien", kind: "rss", items: rssItems }
];

const rep = ingestShadow(sources, { now: Date.parse("2026-07-14T00:00:00Z") });

// --- 1. Isolation ---
check("Isolation ok (kein storage/scheduler/server/understanding im require-Graph)", rep.isolation.ok === true && rep.isolation.verboten.length === 0);
check("isolationSelfCheck direkt ok", isolationSelfCheck().ok === true);
check("Modus = shadow-only ohne Prod-Write/LLM", /shadow-only/.test(rep.modus) && /kein LLM/.test(rep.modus));

// --- 2. Aufbereitung ---
// Zahl aus den Fixtures ABGELEITET statt fest verdrahtet (Roadmap-Punkt 24 hat die
// Gold-Fixtures um belegte echte Records erweitert; eine feste Zahl waere sofort veraltet).
const PARDOK_ITEMS = be.length + bb.length;
check(`Items roh = ${PARDOK_ITEMS} PARDOK + 4 RSS = ${PARDOK_ITEMS + 4}`, rep.itemsRoh === PARDOK_ITEMS + 4);
check("Dokumente nach globalem Merge < Items (Fundstellen-Merge greift)", rep.dokumente < rep.itemsNachDedupL1);
check("mindestens 1 Dokument mit Mehrfach-Fundstellen (Bund-Story ueber 2 Wege)", rep.mehrfachFundstellen >= 1);

// --- 3. Klassifikation: amtliche PARDOK -> Ebene 'land' AUTORITATIV ---
const beDoc = rep.documents.find((d) => d.externe_id === be[0].externe_id);
check("PARDOK-Berlin-Dokument: Ebene 'land' aus Quelle (autoritativ)", beDoc.decision_level === "land" && beDoc.level_quelle === "quelle-autoritativ");
check("PARDOK-Berlin-Dokument: Geografie geo-land-berlin", beDoc.geografie === "geo-land-berlin");
const bbDoc = rep.documents.find((d) => d.externe_id === bb.find((x) => x.geografie === "geo-land-brandenburg").externe_id);
check("PARDOK-Brandenburg-Dokument: Geografie geo-land-brandenburg", bbDoc.geografie === "geo-land-brandenburg");
check(`Ebenen-Verteilung: >=${PARDOK_ITEMS} land (alle PARDOK-Dokumente)`, (rep.klassifikationEbenen.land || 0) >= PARDOK_ITEMS);

// --- 4. Klassifikation: Inhalts-Deriver fuer RSS ---
const bundDoc = rep.documents.find((d) => /Rentenpaket/.test(d.titel || ""));
check("RSS-Bund-Story -> Ebene 'bund' (Deriver, Bundestag-Institution)", bundDoc.decision_level === "bund" && bundDoc.level_quelle === "inhalt-deriver");
check("RSS-Bund-Story -> event_type 'abstimmung'", bundDoc.event_type === "abstimmung");
const neutralDoc = rep.documents.find((d) => /Wetterbericht/.test(d.titel || ""));
check("neutrale RSS-Story -> Ebene 'unknown' (NICHT faelschlich bund/land)", neutralDoc.decision_level === "unknown");

// --- 5. KO-Input-Faehigkeit + Kosten ---
check("KO-Inputs = Anzahl klassifizierter Dokumente", rep.koInputs === rep.documents.length);
check("Kosten = 0 USD (kein LLM-Aufruf)", rep.kostenUsd === 0);

console.log(`\n== Shadow-Ingest Offline-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} · Dokumente=${rep.dokumente} · Ebenen=${JSON.stringify(rep.klassifikationEbenen)} ==`);
process.exit(fail > 0 ? 1 : 0);
