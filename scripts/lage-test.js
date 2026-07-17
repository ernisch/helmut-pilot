"use strict";

// Offline-Tests fuer den Lage-Realdatenpfad (kein Supabase, keine echte KI).
// Prueft: Provenienz-Wiring (understandOneCluster -> saveSources + best_source_url),
// KI-Nachbearbeitung (Quellen-IDs auf Menge filtern, 250-Woerter-Deckel),
// Vorgang-Mapping (echte Quellen/Chronologie/Dokumente), Cache-Hash, Fallbacks.

const assert = require("assert");
const ai = require("../lib/helmut/ai");
const lage = require("../lib/helmut/lage");
const understanding = require("../lib/helmut/understanding");
const { validateKnowledgeObject, KNOWLEDGE_OBJECT_SCHEMA } = require("../lib/helmut/understanding-schema");

const TITLE_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.display_title.maxLength;
const CATEGORY_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.display_category.maxLength;
const SUMMARY_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.display_summary.maxLength;
const WHY_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.why_relevant.maxLength;
const RECO_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.recommendation.maxLength;

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
      display_title: "Tarifbindung: Entwurf vorgelegt",
      display_summary: "Das BMAS hat den Referentenentwurf vorgelegt.",
      why_relevant: "Betrifft die Tarifbindung bei öffentlichen Aufträgen.",
      recommendation: "Linie vorbereiten, heute keine öffentliche Reaktion.",
      display_category: "BMAS",
      ausschuesse: ["Arbeit und Soziales"], updated_at: new Date().toISOString(),
      created_at: "2025-06-12T08:30:00Z",
      // Betroffene-Rohfelder (inkl. absichtlich „schmutziger" Werte: Duplikat,
      // Whitespace, Leerstring) zum Prüfen der Normalisierung in cleanStringList.
      parteien: ["SPD", "  spd  ", "", "Die Linke"],
      ministerien: ["BMAS"],
      mentioned_people: ["Hubertus Heil", null],
      mentioned_parties: ["CDU"]
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
    // UI-Zeigefelder (C7/C8, einmalig erzeugt) 1:1 durchgereicht — keine
    // Umformulierung/Kuerzung in koToVorgangCard.
    ok("displayTitle 1:1 aus display_title", card.displayTitle === "Tarifbindung: Entwurf vorgelegt");
    ok("displaySummary 1:1 aus display_summary", card.displaySummary === "Das BMAS hat den Referentenentwurf vorgelegt.");
    ok("whyRelevant 1:1 aus why_relevant", card.whyRelevant === "Betrifft die Tarifbindung bei öffentlichen Aufträgen.");
    ok("recommendation 1:1 aus recommendation", card.recommendation === "Linie vorbereiten, heute keine öffentliche Reaktion.");
    ok("displayCategory 1:1 aus display_category", card.displayCategory === "BMAS");
    // Betroffene (additiv, 1:1 aus dem bereits geladenen KO durchgereicht — kein
    // neuer KI-Aufruf, keine neue Abfrage). cleanStringList entfernt Leerwerte
    // und Duplikate (case-insensitiv), erfindet aber NIE neue Namen.
    ok("parteien normalisiert (dedupe + trim, leere raus)", JSON.stringify(card.parteien) === JSON.stringify(["SPD", "Die Linke"]));
    ok("ministerien 1:1 durchgereicht", JSON.stringify(card.ministerien) === JSON.stringify(["BMAS"]));
    ok("mentionedPeople bereinigt (null raus)", JSON.stringify(card.mentionedPeople) === JSON.stringify(["Hubertus Heil"]));
    ok("mentionedParties 1:1 durchgereicht", JSON.stringify(card.mentionedParties) === JSON.stringify(["CDU"]));
    ok("createdAt 1:1 durchgereicht", card.createdAt === "2025-06-12T08:30:00Z");
    ok("keine Betroffene erfunden (leere Gruppen bleiben leer)", card.mentionedCommittees.length === 0 && card.mentionedMinistries.length === 0);
  }

  // ── 6b) Vorgang-Mapping: aeltere KOs ohne die neuen UI-Felder ──
  console.log("koToVorgangCard (Fallback ohne neue Felder)");
  {
    const ko = {
      vorgang_id: "vg-alt", headline: "Altes Thema", status: "neu",
      was_ist_passiert: "X ist passiert.", warum_wichtig: "Y ist wichtig.", handlungsempfehlung: "Z."
    };
    const card = lage.koToVorgangCard(ko, []);
    ok("kein display_title -> displayTitle leer (Client faellt auf vollstaendigen Titel zurueck)", card.displayTitle === "");
    ok("kein display_summary -> displaySummary leer", card.displaySummary === "");
    ok("kein why_relevant -> whyRelevant leer", card.whyRelevant === "");
    ok("kein recommendation -> recommendation leer", card.recommendation === "");
    ok("kein display_category -> displayCategory leer", card.displayCategory === "");
    ok("bestehende Felder bleiben trotzdem gefuellt", card.title === "Altes Thema" && card.empfehlung === "Z.");
    // Ohne Betroffene-Rohfelder: leere Arrays (nie undefined) -> Client blendet
    // die Betroffene-Sektion sauber aus, statt zu crashen.
    ok("keine Betroffene-Felder -> leere Arrays", Array.isArray(card.parteien) && card.parteien.length === 0 && Array.isArray(card.mentionedPeople) && card.mentionedPeople.length === 0);
  }

  // ── 6b2) Auswahl der Lage-Karten (modern-first, Legacy beigemischt) ──
  // Pre-Sale-Fix: FRÜHER Entweder-oder (ein moderner Vorgang -> alle Legacy weg,
  // Ursache "nur zwei Karten"). JETZT: moderne Vorgaenge zuerst, danach uebrige
  // BELEGTE Vorgaenge — gemischt. Quelle bleibt in ALLEN Faellen Pflicht.
  // "modern" verlangt jetzt nur die karten-tragenden Kernfelder (Summary/Why/
  // Recommendation), NICHT den oft verworfenen display_title.
  console.log("selectLageVorgaenge (modern-first, Legacy beigemischt)");
  {
    const withSrc = { sources: [{ name: "Tagesschau" }], sourceCount: 1 };
    const noSrc = { sources: [], sourceCount: 0 };
    const coreFields = { displaySummary: "S", whyRelevant: "W", recommendation: "R" };
    const modern = (id) => ({ id, displayTitle: "T", displayCategory: "C", ...coreFields, ...withSrc });
    const legacy = (id) => ({ id, displayTitle: "", displaySummary: "", whyRelevant: "", recommendation: "", displayCategory: "", ...withSrc });

    // 1) Moderne + belegte Legacy vorhanden -> BEIDE erscheinen, moderne zuerst.
    {
      const out = lage.selectLageVorgaenge([legacy("a"), modern("b"), legacy("c"), modern("d")]);
      ok("modern-first: alle belegten erscheinen", out.length === 4);
      ok("modern-first: moderne stehen vorn", lage.isModernVorgang(out[0]) && lage.isModernVorgang(out[1]) && !lage.isModernVorgang(out[2]));
      ok("modern-first: Legacy mit Quelle NICHT mehr ausgeblendet", out.some((v) => v.id === "a") && out.some((v) => v.id === "c"));
    }
    // 2) Nur Legacy MIT Quelle -> Lage nicht leer.
    {
      const out = lage.selectLageVorgaenge([legacy("a"), legacy("b")]);
      ok("nur Legacy mit Quelle -> nicht leer", out.length === 2);
    }
    // 3) Quelle ist Pflicht (modern UND Legacy ohne Quelle fliegen).
    {
      const outModern = lage.selectLageVorgaenge([{ id: "m", ...coreFields, displayTitle: "T", displayCategory: "C", ...noSrc }, modern("ok")]);
      ok("moderner ohne Quelle wird ausgeschlossen", outModern.length === 1 && outModern[0].id === "ok");
      const outLegacy = lage.selectLageVorgaenge([{ id: "l", displaySummary: "", whyRelevant: "", recommendation: "", ...noSrc }]);
      ok("Legacy ohne Quelle -> leer (kein Fake, keine quellenlose Karte)", outLegacy.length === 0);
    }
    // 4) Kernfelder-Kriterium: fehlt eines der 3 Kernfelder -> nicht modern (aber
    //    mit Quelle trotzdem sichtbar, nur nachrangig).
    {
      const partial = { id: "p", displaySummary: "S", whyRelevant: "", recommendation: "", ...withSrc };
      ok("fehlendes Kernfeld -> NICHT modern", !lage.isModernVorgang(partial));
      const out = lage.selectLageVorgaenge([partial, modern("m")]);
      ok("Teil-Presentation bleibt sichtbar, aber nach modern", out.length === 2 && out[0].id === "m" && out[1].id === "p");
      ok("display_title NICHT erforderlich fuer modern", lage.isModernVorgang({ displayTitle: "", ...coreFields }));
    }
    // 5) Leere/ungueltige Eingabe -> leeres Array, kein Wurf.
    {
      ok("leere Eingabe -> []", lage.selectLageVorgaenge([]).length === 0 && lage.selectLageVorgaenge(undefined).length === 0);
    }
  }

  // ── 6c) assembleKnowledgeObject: neue UI-Felder saeubern/kappen ──
  console.log("assembleKnowledgeObject (neue Anzeige-Felder)");
  {
    const cluster = { documents: [{ title: "X" }] };
    const wellFormed = understanding.assembleKnowledgeObject({
      was_ist_passiert: "A.", warum_wichtig: "B.", wer_ist_betroffen: "C.", handlungsempfehlung: "D.", zeitdruck: "mittel",
      display_title: "Merz lehnt Vergesellschaftung ab",
      display_summary: "  Kurze   Zusammenfassung.  ",
      why_relevant: "Betrifft den Gesundheitsausschuss direkt.",
      recommendation: "Heute nicht öffentlich reagieren.",
      display_category: "Bundestag"
    }, cluster, "vg-x", {});
    ok("display_title uebernommen (passt ins Budget)", wellFormed.display_title === "Merz lehnt Vergesellschaftung ab");
    ok("display_summary getrimmt/normalisiert", wellFormed.display_summary === "Kurze Zusammenfassung.");
    ok("why_relevant uebernommen", wellFormed.why_relevant === "Betrifft den Gesundheitsausschuss direkt.");
    ok("recommendation uebernommen", wellFormed.recommendation === "Heute nicht öffentlich reagieren.");
    ok("display_category uebernommen", wellFormed.display_category === "Bundestag");

    // Der eigentliche Bug-Fix: ein zu langer display_title wird VERWORFEN statt
    // mitten im Satz abgeschnitten (das war die Ursache abgebrochener Titel).
    const tooLong = "Dies ist ein deutlich zu langer Titel, der auf keinen Fall in eine kurze UI-Ueberschrift passt und daher niemals gekappt werden darf";
    const overlong = understanding.assembleKnowledgeObject({
      was_ist_passiert: "A.", warum_wichtig: "B.", wer_ist_betroffen: "C.", handlungsempfehlung: "D.", zeitdruck: "mittel",
      display_title: tooLong, display_category: "Ministerium fuer Arbeit, Gesundheit und Soziales des Landes"
    }, cluster, "vg-y", {});
    ok("zu langer display_title wird verworfen statt abgeschnitten (kein Fragment)", overlong.display_title === "");
    ok("zu langer display_category wird verworfen statt abgeschnitten", overlong.display_category === "");

    const blank = understanding.assembleKnowledgeObject({
      was_ist_passiert: "A.", warum_wichtig: "B.", wer_ist_betroffen: "C.", handlungsempfehlung: "D.", zeitdruck: "mittel",
      display_title: "   "
    }, cluster, "vg-z", {});
    ok("nur-Leerzeichen display_title wird verworfen", blank.display_title === "");

    const missing = understanding.assembleKnowledgeObject({
      was_ist_passiert: "A.", warum_wichtig: "B.", wer_ist_betroffen: "C.", handlungsempfehlung: "D.", zeitdruck: "mittel"
    }, cluster, "vg-w", {});
    ok("fehlende neue Felder -> leere Strings, kein Absturz", missing.display_title === "" && missing.display_summary === ""
      && missing.why_relevant === "" && missing.recommendation === "" && missing.display_category === "");
    // Leere/verworfene neue Felder duerfen die Gesamtvalidierung nicht zu Fall
    // bringen (bewusst NICHT required/minLength — anders als was_ist_passiert etc.).
    ok("KO mit verworfenem display_title bleibt insgesamt schema-valide", validateKnowledgeObject(overlong).valid === true);
    ok("KO ganz ohne neue Felder bleibt insgesamt schema-valide", validateKnowledgeObject(missing).valid === true);
  }

  // ── 6d) Laengen-Grenzwerte GENAU an der Schema-Obergrenze (kein Off-by-one,
  // keine vertauschten Caps zwischen den drei cleanEntry-Feldern) ──
  console.log("assembleKnowledgeObject (Laengen-Grenzwerte, schema-abgeleitet)");
  {
    const cluster = { documents: [{ title: "X" }] };
    const base = { was_ist_passiert: "A.", warum_wichtig: "B.", wer_ist_betroffen: "C.", handlungsempfehlung: "D.", zeitdruck: "mittel" };

    // Ein sonst gueltiger (mehrwortiger, starkes Schlusswort) Titel von exakt n
    // Zeichen — isoliert die LAENGEN-Grenze von den Qualitaetsregeln (Wortzahl/
    // Schlusswort), damit dieser Test nur die maxLength prueft.
    const titleOfLength = (n) => { const p = "Titel Alpha Beta "; return p + "R".repeat(n - p.length); };
    const atTitleMax = titleOfLength(TITLE_MAX);
    const overTitleMax = titleOfLength(TITLE_MAX + 1);
    const koTitleAtMax = understanding.assembleKnowledgeObject({ ...base, display_title: atTitleMax }, cluster, "vg-title-at-max", {});
    const koTitleOverMax = understanding.assembleKnowledgeObject({ ...base, display_title: overTitleMax }, cluster, "vg-title-over-max", {});
    ok(`display_title genau an der Grenze (${TITLE_MAX} Zeichen) wird behalten`, koTitleAtMax.display_title === atTitleMax && atTitleMax.length === TITLE_MAX);
    ok(`display_title 1 Zeichen ueber der Grenze wird verworfen (kein Off-by-one)`, koTitleOverMax.display_title === "");

    const atCategoryMax = "y".repeat(CATEGORY_MAX);
    const overCategoryMax = "y".repeat(CATEGORY_MAX + 1);
    const koCatAtMax = understanding.assembleKnowledgeObject({ ...base, display_category: atCategoryMax }, cluster, "vg-cat-at-max", {});
    const koCatOverMax = understanding.assembleKnowledgeObject({ ...base, display_category: overCategoryMax }, cluster, "vg-cat-over-max", {});
    ok(`display_category genau an der Grenze (${CATEGORY_MAX} Zeichen) wird behalten`, koCatAtMax.display_category === atCategoryMax);
    ok(`display_category 1 Zeichen ueber der Grenze wird verworfen`, koCatOverMax.display_category === "");

    // display_summary/why_relevant/recommendation duerfen NICHT dasselbe Budget
    // teilen (sonst waere ein Vertauschen der drei cleanEntry-Aufrufe unsichtbar).
    ok("die drei Body-Budgets sind tatsaechlich unterschiedlich", RECO_MAX < WHY_MAX && WHY_MAX < SUMMARY_MAX);

    const overRecoUnderWhy = "z".repeat(RECO_MAX + 10);
    const koSwapCheck1 = understanding.assembleKnowledgeObject({ ...base,
      why_relevant: overRecoUnderWhy, recommendation: overRecoUnderWhy
    }, cluster, "vg-swap-1", {});
    ok("why_relevant behaelt einen Wert oberhalb des (kleineren) recommendation-Caps",
      koSwapCheck1.why_relevant.length === overRecoUnderWhy.length);
    ok("recommendation kappt denselben Wert exakt auf sein eigenes, kleineres Budget",
      koSwapCheck1.recommendation.length === RECO_MAX);

    const overWhyUnderSummary = "w".repeat(WHY_MAX + 10);
    const koSwapCheck2 = understanding.assembleKnowledgeObject({ ...base,
      display_summary: overWhyUnderSummary, why_relevant: overWhyUnderSummary
    }, cluster, "vg-swap-2", {});
    ok("display_summary behaelt einen Wert oberhalb des (kleineren) why_relevant-Caps",
      koSwapCheck2.display_summary.length === overWhyUnderSummary.length);
    ok("why_relevant kappt denselben Wert exakt auf sein eigenes, kleineres Budget",
      koSwapCheck2.why_relevant.length === WHY_MAX);
  }

  // ── 6f) Qualitaetsgate fuer den Anzeige-Titel (isValidDisplayTitle):
  // politischer Lage-Titel, kein Nachrichten-Fragment, keine Ellipse, endet
  // nicht auf einem Funktionswort ──
  console.log("isValidDisplayTitle (Qualitaetsgate Anzeige-Titel)");
  {
    const good = [
      "Merz lehnt Vergesellschaftung ab",          // endet auf trennbarem Praefix "ab" (ablehnen)
      "Regierung legt Tariftreuegesetz vor",         // trennbares "vor" (vorlegen)
      "Fraktion stimmt Reform zu",                   // trennbares "zu" (zustimmen)
      "Regierung bringt Klimagesetz ein",            // trennbares "ein" (einbringen)
      "Land setzt EU-Vorgabe um",                    // trennbares "um" (umsetzen)
      "Bundestag räumt Fehler ein",                  // trennbares "ein" (einraeumen)
      "Völklingen ringt um Sportplätze",
      "Ministerium plant neue Arbeitsmarktreform",
      "Mehrere Sozialreformen stehen zur Debatte",   // "zur" nur in der Mitte, Ende stark
      "Kabinett beschließt Rentenpaket 2026"          // endet auf Zahl
    ];
    for (const t of good) ok(`gueltiger Anzeige-Titel: "${t}"`, understanding.isValidDisplayTitle(t) === true);

    const bad = [
      ["Friedrich Merz hat öffentlich eine scharfe Ablehnung gegenüber", "schwaches Schlusswort 'gegenüber'"],
      ["Reform der Grundsicherung zur", "endet auf 'zur'"],
      ["Debatte über Rente und", "endet auf 'und'"],
      ["Ministerium plant Reform für", "endet auf 'für'"],
      ["Kabinett berät Reform …", "Ellipse (…)"],
      ["Kabinett berät Reform...", "Ellipse (...)"],
      ["Im Völklinger Stadtrat besteht Ratlosigkeit,", "haengendes Komma"],
      ["Streit um Haushalt:", "haengender Doppelpunkt"],
      ["öffentlich eine scharfe Ablehnung", "Kleinbuchstabe am Anfang (Fragment)"],
      ["Rentenreform", "nur ein Wort"],
      ["Das Bundeskabinett hat heute nach langer Debatte den Gesetzentwurf beschlossen", "zu viele Woerter / zu lang"]
    ];
    for (const [t, why] of bad) ok(`ungueltiger Anzeige-Titel (${why}): "${t}"`, understanding.isValidDisplayTitle(t) === false);

    // Ende-zu-Ende: ungueltiger Titel wird beim Assemble VERWORFEN (-> Client
    // zeigt Legacy-Titel), gueltiger bleibt 1:1 erhalten.
    const cluster = { documents: [{ title: "X" }] };
    const base = { was_ist_passiert: "A.", warum_wichtig: "B.", wer_ist_betroffen: "C.", handlungsempfehlung: "D.", zeitdruck: "mittel" };
    const koBad = understanding.assembleKnowledgeObject({ ...base, display_title: "Reform der Grundsicherung zur" }, cluster, "vg-badtitle", {});
    ok("Assemble verwirft ungueltigen Titel (schwaches Ende) -> ''", koBad.display_title === "");
    const koGood = understanding.assembleKnowledgeObject({ ...base, display_title: "Merz lehnt Vergesellschaftung ab" }, cluster, "vg-goodtitle", {});
    ok("Assemble behaelt gueltigen Titel 1:1 (endet auf trennbarem 'ab')", koGood.display_title === "Merz lehnt Vergesellschaftung ab");
  }

  // ── 6e) Schema-maxLength wird von validateKnowledgeObject TATSAECHLICH als
  // ungueltig erkannt (nicht nur als Dokumentation) ──
  console.log("validateKnowledgeObject (maxLength greift auch in der 'ungueltig'-Richtung)");
  {
    const cluster = { documents: [{ title: "X" }] };
    const validKo = understanding.assembleKnowledgeObject({
      was_ist_passiert: "A.", warum_wichtig: "B.", wer_ist_betroffen: "C.", handlungsempfehlung: "D.", zeitdruck: "mittel",
      display_summary: "Kurz."
    }, cluster, "vg-valid", {});
    ok("Baseline: gut geformtes KO ist schema-valide", validateKnowledgeObject(validKo).valid === true);

    // Bewusst NICHT ueber assembleKnowledgeObject/cleanEntry, sondern direkt auf
    // dem bereits assemblierten KO gesetzt — prueft checkValue()'s maxLength-Zweig
    // isoliert (assembleKnowledgeObject selbst wuerde das nie durchlassen).
    const tooLongSummary = { ...validKo, display_summary: "s".repeat(SUMMARY_MAX + 1) };
    const res = validateKnowledgeObject(tooLongSummary);
    ok("display_summary ueber Schema-maxLength macht das KO ungueltig", res.valid === false);
    ok("Fehlermeldung benennt das betroffene Feld", res.errors.some((e) => e.includes("display_summary")));
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
    const res = await lage.buildLageBriefing({ id: "test-politician-one", fullName: "Test Politician One" }, {});
    ok("V3 aus -> available:false (kein Fake)", res.available === false && res.reason === "v3-disabled");
    ok("V3 aus -> keine Absaetze", Array.isArray(res.paragraphs) && res.paragraphs.length === 0);

    process.env.HELMUT_LAGE_DEMO = "1";
    const demo = await lage.buildLageBriefing({ id: "test-politician-one", fullName: "Test Politician One" }, {});
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

  // ── 11) Presentation-Fields-Backfill (bestehende Engine, injizierte Deps) ──
  console.log("backfillPresentationFields");
  {
    const pb = require("../lib/helmut/presentation-backfill");

    // Eine vollstaendige, schema-valide KI-Antwort (wie der echte Understanding-Call).
    const fullAi = (over = {}) => ({
      headline: "H", was_ist_passiert: "Etwas ist passiert.", warum_wichtig: "Ist wichtig.",
      wer_ist_betroffen: "Betroffene.", handlungsempfehlung: "Linie vorbereiten.", zeitdruck: "mittel", confidence_score: 70,
      parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [], mentioned_committees: [],
      mentioned_ministries: [], mentioned_locations: [], mentioned_organizations: [],
      display_title: "Kabinett beschließt Rentenpaket 2026",
      display_summary: "Das Kabinett hat das Rentenpaket beschlossen.",
      why_relevant: "Betrifft den Ausschuss direkt.",
      recommendation: "Position abstimmen.",
      display_category: "BMAS",
      ...over
    });
    const SOURCES = [{ id: "rd-1", title: "Rentenpaket", summary: "Kabinett beschließt.", source_name: "BMAS", published_at: "2026-06-30T09:00:00Z" }];
    const makeDeps = (cfg = {}) => {
      const calls = { ai: 0, saved: [] };
      const deps = {
        storeReady: () => cfg.storeReady !== false,
        aiEnabled: () => cfg.aiEnabled !== false,
        listKnowledgeObjects: async () => cfg.kos || [],
        getSourcesForVorgang: async (vid) => (typeof cfg.sources === "function" ? cfg.sources(vid) : (cfg.sources || SOURCES)),
        canSpend: async () => (cfg.canSpend ? cfg.canSpend() : { allowed: true }),
        requestUnderstanding: async () => { calls.ai += 1; const r = cfg.ai ? cfg.ai(calls.ai) : fullAi(); return r; },
        save: async (patch) => { calls.saved.push(patch); return { saved: true }; },
        modelName: () => "gpt-5-mini",
        estimateCost: () => 0.002,
        sumActualCost: async () => 0.004,
        now: () => 1000
      };
      return { deps, calls };
    };
    const koFull = { id: "ko-vg-full", vorgang_id: "vg-full", understanding_status: "complete",
      display_title: "Voller Titel da", display_summary: "Da.", why_relevant: "Da.", recommendation: "Da.", display_category: "BMG" };
    const koMissingAll = { id: "ko-vg-a", vorgang_id: "vg-a", understanding_status: "complete" };
    const koPending = { id: "ko-vg-p", vorgang_id: "vg-p", understanding_status: "pending" };

    // missingPresentationFields: erkennt fehlende/leere/whitespace Felder.
    ok("vollstaendiges KO -> keine fehlenden Felder", pb.missingPresentationFields(koFull).length === 0);
    ok("leeres KO -> alle 5 Felder fehlen", pb.missingPresentationFields(koMissingAll).length === 5);
    ok("whitespace zaehlt als fehlend", pb.missingPresentationFields({ display_title: "   ", display_summary: "x", why_relevant: "x", recommendation: "x", display_category: "x" }).length === 1);

    // Dry-run: Plan korrekt, KEINE KI-/Save-Calls, nur complete-KOs geprueft.
    {
      const { deps, calls } = makeDeps({ kos: [koFull, koMissingAll, koPending] });
      const r = await pb.backfillPresentationFields({ dryRun: true }, deps);
      ok("dry-run: geprueft = nur complete (2)", r.plan.checked === 2);
      ok("dry-run: zu verarbeiten = nur unvollstaendige complete (1)", r.plan.toProcess === 1);
      ok("dry-run: uebersprungen-voll = 1", r.plan.skippedComplete === 1);
      ok("dry-run: Kostenschaetzung gesetzt", typeof r.plan.estTotalCostUsd === "number" && r.plan.estTotalCostUsd > 0);
      ok("dry-run: KEIN KI-Call, KEIN Save", calls.ai === 0 && calls.saved.length === 0);
    }

    // Happy path: alle 5 fehlen -> Patch enthaelt id+vorgang_id + genau die 5 Felder, KEINE Raw Fields.
    {
      const { deps, calls } = makeDeps({ kos: [koMissingAll] });
      const r = await pb.backfillPresentationFields({ dryRun: false }, deps);
      ok("happy: 1 verarbeitet, vollstaendig", r.processed === 1 && r.fullyCompleted === 1 && r.failed === 0);
      ok("happy: genau 1 KI-Call", calls.ai === 1);
      const patch = calls.saved[0];
      const keys = Object.keys(patch).sort().join(",");
      ok("happy: Patch = id+vorgang_id + 5 Presentation Fields", keys === "display_category,display_summary,display_title,id,recommendation,vorgang_id,why_relevant");
      const rawKeys = ["was_ist_passiert", "warum_wichtig", "wer_ist_betroffen", "headline", "handlungsempfehlung", "parteien", "ausschuesse", "status", "understanding_status", "ko_version", "best_source_url", "sources"];
      ok("happy: KEINE Raw Fields im Patch", rawKeys.every((k) => !(k in patch)));
      ok("happy: display_title 1:1 aus der (validierten) KI-Antwort", patch.display_title === "Kabinett beschließt Rentenpaket 2026");
      ok("happy: tatsaechliche Kosten aus Log gemeldet", r.actualCostUsd === 0.004);
    }

    // Partial: nur why_relevant fehlt -> Patch enthaelt NUR why_relevant (bestehende Felder unangetastet).
    {
      const koPartial = { ...koFull, id: "ko-vg-part", vorgang_id: "vg-part", why_relevant: "" };
      const { deps, calls } = makeDeps({ kos: [koPartial] });
      const r = await pb.backfillPresentationFields({ dryRun: false }, deps);
      const patch = calls.saved[0];
      ok("partial: Patch enthaelt NUR das fehlende Feld (+id/vorgang_id)", Object.keys(patch).sort().join(",") === "id,vorgang_id,why_relevant");
      ok("partial: bestehendes display_title wird NICHT ueberschrieben", !("display_title" in patch));
      ok("partial: als vollstaendig gezaehlt", r.fullyCompleted === 1);
    }

    // Partial-bleibt-unvollstaendig: fehlt display_title+why_relevant, KI liefert UNGUELTIGEN Titel
    // -> Titel wird verworfen (leer), nur why_relevant geschrieben -> partiallyFilled.
    {
      const koTwo = { id: "ko-vg-two", vorgang_id: "vg-two", understanding_status: "complete",
        display_summary: "Da.", recommendation: "Da.", display_category: "BMG" };
      const badTitle = fullAi({ display_title: "Dies ist ein viel zu langer Titel der garantiert nicht durch den Validator passt und daher verworfen wird" });
      const { deps, calls } = makeDeps({ kos: [koTwo], ai: () => badTitle });
      const r = await pb.backfillPresentationFields({ dryRun: false }, deps);
      const patch = calls.saved[0];
      ok("teilweise: verworfener display_title NICHT geschrieben", !("display_title" in patch) && "why_relevant" in patch);
      ok("teilweise: als partiallyFilled gezaehlt", r.partiallyFilled === 1 && r.fullyCompleted === 0);
    }

    // Idempotenz: nur vollstaendige KOs -> nichts zu tun, kein KI-Call.
    {
      const { deps, calls } = makeDeps({ kos: [koFull] });
      const r = await pb.backfillPresentationFields({ dryRun: false }, deps);
      ok("idempotent: vollstaendige KOs -> 0 verarbeitet, 0 KI-Calls", r.processed === 0 && calls.ai === 0 && r.plan.skippedComplete === 1);
    }

    // Keine Quellen -> uebersprungen, kein KI-Call (Provenienz zuerst noetig).
    {
      const { deps, calls } = makeDeps({ kos: [koMissingAll], sources: [] });
      const r = await pb.backfillPresentationFields({ dryRun: false }, deps);
      ok("ohne Quellen: skippedNoSources=1, kein KI-Call", r.skippedNoSources === 1 && calls.ai === 0 && r.processed === 0);
    }

    // Fail-safe: KI wirft beim 1. KO, gelingt beim 2. -> Lauf bricht NICHT ab.
    {
      const koB = { id: "ko-vg-b", vorgang_id: "vg-b", understanding_status: "complete" };
      const { deps, calls } = makeDeps({ kos: [koMissingAll, koB], ai: (n) => { if (n === 1) throw new Error("boom 500"); return fullAi(); } });
      const r = await pb.backfillPresentationFields({ dryRun: false }, deps);
      ok("fail-safe: 1 fehlgeschlagen, 1 verarbeitet, weitergelaufen", r.failed === 1 && r.processed === 1 && calls.ai === 2);
      ok("fail-safe: Fehler protokolliert (mit KO-id)", r.errors.some((e) => e.id === "ko-vg-a" && e.reason === "ai-error"));
    }

    // Budget erschoepft -> Rest wird nicht versucht, KEIN KI-Call.
    {
      const koB = { id: "ko-vg-b2", vorgang_id: "vg-b2", understanding_status: "complete" };
      const { deps, calls } = makeDeps({ kos: [koMissingAll, koB], canSpend: () => ({ allowed: false, reason: "daily-limit" }) });
      const r = await pb.backfillPresentationFields({ dryRun: false }, deps);
      ok("budget: skippedBudget = alle Kandidaten, KEIN KI-Call", r.skippedBudget === 2 && calls.ai === 0 && r.processed === 0);
    }

    // Store nicht bereit -> sauberer Skip (kein Absturz).
    {
      const { deps } = makeDeps({ kos: [koMissingAll], storeReady: false });
      const r = await pb.backfillPresentationFields({ dryRun: false }, deps);
      ok("store nicht bereit -> skipped", r.skipped === true && r.reason === "v3-store-not-ready");
    }

    // Limit: wird an listKnowledgeObjects durchgereicht und begrenzt Laden/Verarbeiten.
    {
      const many = Array.from({ length: 5 }, (_, i) => ({ id: `ko-lim-${i}`, vorgang_id: `vg-lim-${i}`, understanding_status: "complete" }));
      const { deps, calls } = makeDeps({ kos: many });
      let seenOpts = null;
      deps.listKnowledgeObjects = async (o) => { seenOpts = o; return many.slice(0, o.limit); }; // echtes Storage ehrt limit
      const r = await pb.backfillPresentationFields({ dryRun: false, limit: 3 }, deps);
      ok("limit: an listKnowledgeObjects durchgereicht", seenOpts && seenOpts.limit === 3);
      ok("limit: nur begrenzte Anzahl geladen & verarbeitet (3, nicht 5)", r.plan.loaded === 3 && r.processed === 3 && calls.ai === 3);
      ok("limit: Ladegrenze erreicht wird gemeldet", r.plan.loadCapReached === true && r.plan.loadLimit === 3);
    }

    // Dry-run mit Limit: begrenzt geladen, aber trotzdem KEIN KI-/Save-Call.
    {
      const many = Array.from({ length: 4 }, (_, i) => ({ id: `ko-dl-${i}`, vorgang_id: `vg-dl-${i}`, understanding_status: "complete" }));
      const { deps, calls } = makeDeps({ kos: many });
      deps.listKnowledgeObjects = async (o) => many.slice(0, o.limit);
      const r = await pb.backfillPresentationFields({ dryRun: true, limit: 2 }, deps);
      ok("dry-run+limit: 2 geladen, 2 zu verarbeiten, aber 0 KI/Save", r.plan.loaded === 2 && r.plan.toProcess === 2 && calls.ai === 0 && calls.saved.length === 0);
    }
  }

  console.log(`\nAlle ${passed} Lage-Assertions erfolgreich.`);
}

run().catch((e) => { console.error("FEHLGESCHLAGEN:", e.message); process.exit(1); });
