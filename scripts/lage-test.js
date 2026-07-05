"use strict";

// Offline-Tests fuer den Lage-Realdatenpfad (kein Supabase, keine echte KI).
// Prueft: Provenienz-Wiring (understandOneCluster -> saveSources + best_source_url),
// KI-Nachbearbeitung (Quellen-IDs auf Menge filtern, 250-Woerter-Deckel),
// Vorgang-Mapping (echte Quellen/Chronologie/Dokumente), Cache-Hash, Fallbacks.

const assert = require("assert");
const ai = require("../lib/helmut/ai");
const lage = require("../lib/helmut/lage");
const understanding = require("../lib/helmut/understanding");

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  passed += 1;
  console.log("  ✓ " + name);
}

async function run() {
  // ── 1) KI-Nachbearbeitung: nur erlaubte vorgang_ids, keine Halluzination ──
  console.log("assembleLageParagraphs");
  {
    const allowed = ["vg-a", "vg-b"];
    const raw = { paragraphs: [
      { text: "  Absatz eins.  ", vorgang_ids: ["vg-a", "vg-x", "vg-a"] }, // vg-x nicht erlaubt, Duplikat
      { text: "Absatz zwei.", vorgang_ids: ["vg-b"] },
      { text: "   ", vorgang_ids: ["vg-a"] } // leer -> raus
    ] };
    const out = ai.assembleLageParagraphs(raw, allowed);
    ok("leerer Absatz wird entfernt", out.length === 2);
    ok("fremde vorgang_id gefiltert", JSON.stringify(out[0].vorgang_ids) === JSON.stringify(["vg-a"]));
    ok("Text normalisiert/getrimmt", out[0].text === "Absatz eins.");
  }

  // ── 2) 250-Woerter-Deckel ──
  console.log("capLageWords");
  {
    const big = Array.from({ length: 400 }, (_, i) => "wort" + i).join(" ");
    const capped = ai.capLageWords([{ text: big, vorgang_ids: ["vg-a"] }], 250);
    const words = capped.reduce((n, p) => n + p.text.replace(/…/g, "").trim().split(/\s+/).filter(Boolean).length, 0);
    ok("Gesamtwortzahl <= 250", words <= 250);
    ok("Kuerzung markiert (…)", /…/.test(capped[capped.length - 1].text));
  }

  // ── 3) Prompt traegt die harten Regeln + vorgang_ids ──
  console.log("buildLageBriefingPrompt");
  {
    const p = ai.buildLageBriefingPrompt([{ vorgang_id: "vg-a", headline: "Titel A", was_ist_passiert: "X" }], { committees: ["Arbeit und Soziales"] });
    ok("verbietet Handlungsempfehlung", /KEINE Handlungsempfehlung/i.test(p));
    ok("verbietet Bewertung", /KEINE Bewertung/i.test(p));
    ok("Wortlimit im Prompt", /250 Woerter/i.test(p));
    ok("Referent-Ton", /wissenschaftlicher Mitarbeiter/i.test(p));
    ok("vorgang_id enthalten", p.includes("[vg-a]"));
  }

  // ── 4) generateLageBriefing: bei KI aus -> null (KEIN Fake) ──
  console.log("generateLageBriefing (AI aus)");
  {
    const before = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
    const beforeA = process.env.AZURE_OPENAI_KEY; delete process.env.AZURE_OPENAI_KEY;
    const res = await ai.generateLageBriefing([{ vorgang_id: "vg-a", was_ist_passiert: "X" }], {}, {});
    ok("ohne KI kein Briefing (null, kein Fake)", res === null);
    if (before !== undefined) process.env.OPENAI_API_KEY = before;
    if (beforeA !== undefined) process.env.AZURE_OPENAI_KEY = beforeA;
  }

  // ── 5) Provenienz-Wiring: understandOneCluster -> saveSources + best_source_url ──
  console.log("understandOneCluster (Provenienz, injizierte Deps)");
  {
    let savedKo = null, savedSources = null;
    const deps = {
      getExisting: async () => null,
      canSpend: async () => ({ allowed: true }),
      requestUnderstanding: async () => ({
        headline: "H", was_ist_passiert: "Etwas ist passiert.", warum_wichtig: "Ist wichtig.",
        wer_ist_betroffen: "Betroffene.", handlungsempfehlung: "—", zeitdruck: "mittel", confidence_score: 70,
        parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
        mentioned_people: [], mentioned_mps: [], mentioned_parties: [], mentioned_committees: [],
        mentioned_ministries: [], mentioned_locations: [], mentioned_organizations: []
      }),
      save: async (ko) => { savedKo = ko; return { saved: true }; },
      saveSources: async (koId, docs) => { savedSources = { koId, docs }; return { saved: docs.length }; },
      markFailed: async () => {},
      modelName: () => "gpt-5-mini",
      logSkip: () => {}
    };
    const cluster = { documents: [
      { id: "rd-1", title: "A", url: "https://tagesschau.de/x", source_name: "Tagesschau", source_type: "media", link_type: "direct", confidence: "high", published_at: "2025-06-12T08:30:00Z" },
      { id: "rd-2", title: "B", url: "https://reuters.com/y", source_name: "Reuters", source_type: "media", link_type: "direct", published_at: "2025-06-11T10:00:00Z" }
    ] };
    const res = await understanding.understandOneCluster(cluster, deps, { vorgangId: "vg-test" });
    ok("KO gespeichert", res.status === "saved" && res.id === "ko-vg-test");
    ok("best_source_url aus staerkstem Dokument", savedKo.best_source_url === "https://tagesschau.de/x");
    ok("best_link_type gesetzt", savedKo.best_link_type === "direct");
    ok("saveSources mit KO-id aufgerufen", savedSources && savedSources.koId === "ko-vg-test");
    ok("saveSources mit allen Cluster-Dokumenten", savedSources.docs.length === 2);
  }

  // ── 6) Vorgang-Mapping: echte Quellen -> Karte/Detail ──
  console.log("koToVorgangCard");
  {
    const ko = {
      vorgang_id: "vg-tar", headline: "Bundestariftreuegesetz", status: "update",
      was_ist_passiert: "Referentenentwurf liegt vor.", warum_wichtig: "Tarifbindung.", wer_ist_betroffen: "Auftraggeber.",
      handlungsempfehlung: "Linie vorbereiten.",
      ausschuesse: ["Arbeit und Soziales"], updated_at: new Date().toISOString()
    };
    const docs = [
      { id: "rd-a", title: "Drucksache 20/1234", url: "https://dip.bundestag.de/x.pdf", source_name: "Bundestag", source_type: "bundestag", document_type: "Drucksache", published_at: "2025-06-12T08:30:00Z" },
      { id: "rd-b", title: "Bericht", url: "https://tagesschau.de/y", source_name: "Tagesschau", source_type: "media", published_at: "2025-06-12T09:15:00Z" }
    ];
    const card = lage.koToVorgangCard(ko, docs);
    ok("Titel = headline", card.title === "Bundestariftreuegesetz");
    ok("Politikfeld aus Ausschuss", card.policyField === "Arbeit und Soziales");
    ok("Quellen gemappt", card.sources.length === 2 && card.sources.some((s) => s.name === "Bundestag"));
    ok("PDF als Dokument erkannt", card.documents.length === 1 && card.documents[0].kind === "PDF");
    ok("Chronologie aus published_at (neuste zuerst)", card.chronologie[0].dateLabel && card.chronologie.length === 2);
    // Empfehlung ist bewusst vorgangsbezogen (1:1 aus dem bestehenden Feld
    // handlungsempfehlung) — keine globale Prioritaet/Rangfolge im Card-Objekt,
    // kein zusaetzliches Score-/Rank-Feld (das bleibt Helmut).
    ok("Empfehlung 1:1 aus handlungsempfehlung, vorgangsbezogen", card.empfehlung === "Linie vorbereiten.");
    ok("keine globale Prioritaet/Rangfolge im Card-Objekt", !("priority" in card) && !("rank" in card) && !("score" in card));
  }

  // ── 7) resolveParagraphSources: Vereinigung + Dedup ──
  console.log("resolveParagraphSources");
  {
    const byV = {
      "vg-a": [{ name: "Tagesschau", url: "https://tagesschau.de/x" }, { name: "BMAS", url: "https://bmas.de" }],
      "vg-b": [{ name: "BMAS", url: "https://bmas.de" }, { name: "Reuters", url: "https://reuters.com" }]
    };
    const res = lage.resolveParagraphSources({ vorgang_ids: ["vg-a", "vg-b"] }, byV);
    ok("dedupliziert nach URL", res.length === 3);
  }

  // ── 8) Cache-Hash: stabil, aendert sich bei updated_at ──
  console.log("hashKoSet");
  {
    const a = lage.hashKoSet([{ vorgang_id: "vg-a", updated_at: "T1" }, { vorgang_id: "vg-b", updated_at: "T2" }]);
    const b = lage.hashKoSet([{ vorgang_id: "vg-b", updated_at: "T2" }, { vorgang_id: "vg-a", updated_at: "T1" }]);
    const c = lage.hashKoSet([{ vorgang_id: "vg-a", updated_at: "T9" }, { vorgang_id: "vg-b", updated_at: "T2" }]);
    ok("reihenfolgeunabhaengig stabil", a === b);
    ok("aendert sich bei neuem updated_at", a !== c);
  }

  // ── 9) buildLageBriefing Fallbacks ──
  console.log("buildLageBriefing (Fallbacks)");
  {
    const beforeStore = process.env.HELMUT_V3_STORE; delete process.env.HELMUT_V3_STORE;
    const beforeDemo = process.env.HELMUT_LAGE_DEMO; delete process.env.HELMUT_LAGE_DEMO;
    const res = await lage.buildLageBriefing({ id: "cem-ince", fullName: "Cem Ince" }, {});
    ok("V3 aus -> available:false (kein Fake)", res.available === false && res.reason === "v3-disabled");
    ok("V3 aus -> keine Absaetze", Array.isArray(res.paragraphs) && res.paragraphs.length === 0);

    process.env.HELMUT_LAGE_DEMO = "1";
    const demo = await lage.buildLageBriefing({ id: "cem-ince", fullName: "Cem Ince" }, {});
    ok("Demo-Flag -> demo:true, available:true", demo.demo === true && demo.available === true && demo.paragraphs.length > 0);
    if (beforeStore !== undefined) process.env.HELMUT_V3_STORE = beforeStore; else delete process.env.HELMUT_V3_STORE;
    if (beforeDemo !== undefined) process.env.HELMUT_LAGE_DEMO = beforeDemo; else delete process.env.HELMUT_LAGE_DEMO;
  }

  // ── 10) Backfill: bestehende KOs -> Links + best_source_url (kein KI-Call) ──
  console.log("backfillProvenance");
  {
    const { backfillProvenance } = require("../lib/helmut/backfill");
    const { clusterRawDocuments, deriveVorgangId } = require("../lib/helmut/understanding");
    const rawDocs = [
      { id: "rd-1", title: "Tariftreuegesetz kommt in den Bundestag", summary: "", url: "https://tagesschau.de/x", link_type: "direct", confidence: "high", published_at: "2025-06-12T08:00:00Z" },
      { id: "rd-2", title: "Tariftreuegesetz Debatte im Ausschuss", summary: "", url: "https://bundestag.de/y", published_at: "2025-06-11T08:00:00Z" }
    ];
    const vid = deriveVorgangId(clusterRawDocuments(rawDocs)[0]);
    const ko = { id: `ko-${vid}`, vorgang_id: vid, understanding_status: "complete", best_source_url: null };
    let linkedDocs = null, savedKoUpdate = null;
    const fakeStorage = {
      v3StoreReady: () => true,
      listKnowledgeObjects: async () => [ko, { id: "ko-x", vorgang_id: "vg-ohne-cluster", understanding_status: "complete", best_source_url: null }],
      getSourcesForVorgang: async () => [], // noch nicht verlinkt
      saveKoDocumentLinks: async (koId, docs) => { if (koId === ko.id) linkedDocs = { koId, docs }; return { saved: docs.length }; },
      saveKnowledgeObject: async (row) => { if (row.id === ko.id) savedKoUpdate = row; return { saved: true }; },
      listRawDocuments: async () => rawDocs
    };
    const res = await backfillProvenance({ days: 45 }, { storage: fakeStorage });
    ok("backfill betrachtet beide KOs", res.total === 2);
    ok("passendes KO wird verlinkt", linkedDocs && linkedDocs.koId === ko.id && linkedDocs.docs.length === 2);
    ok("best_source_url = staerkstes Dokument", savedKoUpdate && savedKoUpdate.best_source_url === "https://tagesschau.de/x");
    ok("KO ohne Cluster: noCluster=1", res.noCluster === 1);
    ok("linked=1", res.linked === 1);

    const res2 = await backfillProvenance({ days: 45 }, { storage: { ...fakeStorage, getSourcesForVorgang: async () => [{ id: "rd-1" }] } });
    ok("bereits verlinkte KOs -> uebersprungen (idempotent)", res2.skippedExisting === 2 && res2.linked === 0);
  }

  console.log(`\nAlle ${passed} Lage-Assertions erfolgreich.`);
}

run().catch((e) => { console.error("FEHLGESCHLAGEN:", e.message); process.exit(1); });
