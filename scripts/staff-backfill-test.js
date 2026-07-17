"use strict";

// =============================================================================
// Offline-Test fuer den Stabschef-Backfill (lib/helmut/staff-backfill.js).
// KEIN Supabase, KEINE echten LLM-Calls: alle Nahtstellen sind injizierte Spies.
// Prueft: Dry-Run macht 0 KI-Calls / 0 Writes, Kandidaten-Filter, Feld-Erkennung,
// Kein-Ueberschreiben, Kostenschaetzung, Batch-Limit, Fehlerquoten-Abbruch, callType,
// keine Kostenwerte/keine UI-Bezuege in den neuen Dateien.
// =============================================================================

const fs = require("fs");
const path = require("path");
const backfill = require("../lib/helmut/staff-backfill");
const storage = require("../lib/helmut/storage"); // estimateLlmCost ist eine REINE Funktion (kein I/O)

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- Fixtures (rein fiktiv, keine reale Partei/Person, keine Kostenwerte) ------
const koFull = {
  id: "ko-full", vorgang_id: "vg-full", status: "neu", understanding_status: "complete",
  handlungsempfehlung: "Abstimmen.", warum_wichtig: "Wichtig.",
  risk_of_no_action: "Risiko.", opportunity_summary: "Chance.",
  risk_level: "high", opportunity_level: "medium",
  recommended_communication_struct: { communicationLine: "Linie.", recommendedChannel: "press", recommendedFormat: "pressRelease", suggestedOutputs: ["statement"] },
  action_items_struct: [{ title: "Schritt 1", description: "", dueHint: "", priority: "high", actionType: "alignInternally" }],
  recommended_communication: "Linie.", action_items: ["Schritt 1"]
};
const koOldPartial = {
  id: "ko-old", vorgang_id: "vg-old", status: "neu", understanding_status: "complete",
  handlungsempfehlung: "Intern abstimmen.", warum_wichtig: "Betrifft Ausschuss.",
  // Echtes Alt-KO: KEINES der 8 Stabschef-Felder befuellt (Level-Spalten NULL, nicht 'unknown').
  action_items: []
};
const koNoCore = {
  id: "ko-nocore", vorgang_id: "vg-nocore", status: "neu", understanding_status: "complete",
  was_ist_passiert: "Etwas.", // KEIN recommendation/handlungsempfehlung/why/warum -> kein Kern
  action_items: []
};
const koFailed = {
  id: "ko-failed", vorgang_id: "vg-failed", status: "neu", understanding_status: "failed",
  handlungsempfehlung: "X.", warum_wichtig: "Y."
};
const koPending = {
  id: "ko-pending", vorgang_id: "vg-pending", status: "pending", understanding_status: "pending",
  handlungsempfehlung: "X.", warum_wichtig: "Y."
};
const koLegacyPartial = {
  id: "ko-legacy", vorgang_id: "vg-legacy", status: "neu", understanding_status: "complete",
  handlungsempfehlung: "Abstimmen.", warum_wichtig: "Wichtig.",
  // Legacy-Kommunikation + Aktionen vorhanden, aber Prosa/Level/Structs fehlen (Level NULL):
  recommended_communication: "Ruhige Linie.", action_items: ["Team briefen"]
};

const ALL_KOS = [koFull, koOldPartial, koNoCore, koFailed, koPending, koLegacyPartial];

// --- Spy-Deps: keine echte Naht wird beruehrt --------------------------------
function makeDeps(overrides = {}, kos = ALL_KOS) {
  const calls = { ai: 0, save: 0, sources: 0, list: 0, byId: 0, byVorgang: 0, patches: [] };
  const byId = (id) => (kos || []).find((k) => k && k.id === id) || null;
  const byVorgang = (vid) => (kos || []).find((k) => k && k.vorgang_id === vid) || null;
  const deps = {
    now: () => 1_000_000, // deterministisch (kein Date.now)
    storeReady: () => true,
    aiEnabled: () => true,
    listKnowledgeObjects: async () => { calls.list += 1; return kos; },
    getKnowledgeObjectById: async (id) => { calls.byId += 1; return byId(id); },
    getKnowledgeObjectByVorgang: async (vid) => { calls.byVorgang += 1; return byVorgang(vid); },
    getSourcesForVorgang: async () => { calls.sources += 1; return [{ id: "d1", url: "https://example.org/a", published_at: "2026-07-01T00:00:00Z" }]; },
    canSpend: async () => ({ allowed: true, remaining: 100 }),
    requestUnderstanding: async () => { calls.ai += 1; return {}; },
    save: async (patch) => { calls.save += 1; calls.patches.push(patch); return { saved: true, id: patch.id, vorgangId: patch.vorgang_id }; },
    modelName: () => "gpt-5-mini",
    estimateCost: (i, o) => storage.estimateLlmCost("gpt-5-mini", i, o), // ECHTE interne Kostenfunktion
    sumActualCost: async () => 0,
    ...overrides
  };
  return { deps, calls };
}

(async () => {
  // === 1) DRY-RUN: keine KI-Calls, keine Writes ===
  {
    const { deps, calls } = makeDeps();
    const res = await backfill.backfillStaffFields({}, deps); // dryRun default true
    check("Dry-Run ist Default (res.dryRun === true)", res.dryRun === true);
    check("Dry-Run macht KEINE LLM-Calls", calls.ai === 0, `ai=${calls.ai}`);
    check("Dry-Run schreibt KEINE Daten", calls.save === 0, `save=${calls.save}`);
    check("Dry-Run laedt keine Quellen (kein Verarbeiten)", calls.sources === 0, `sources=${calls.sources}`);

    // === 2) Kandidaten sauber gefiltert ===
    check("Nur complete KOs mit Kern + fehlendem Feld sind Kandidaten (2: old + legacy)",
      res.plan.toProcess === 2, `toProcess=${res.plan.toProcess}`);
    const ids = res.plan.candidates.map((c) => c.id).sort();
    check("Kandidaten sind genau ko-old und ko-legacy",
      JSON.stringify(ids) === JSON.stringify(["ko-legacy", "ko-old"]), JSON.stringify(ids));
    check("KO ohne Kern wird uebersprungen (ko-nocore nicht Kandidat)", !ids.includes("ko-nocore"));
    check("failed KO wird uebersprungen", !ids.includes("ko-failed"));
    check("pending KO wird uebersprungen", !ids.includes("ko-pending"));
    check("KO mit allen Feldern wird uebersprungen (ko-full nicht Kandidat)", !ids.includes("ko-full"));

    // === 3) Fehlende / vorhandene Felder korrekt erkannt ===
    const cOld = res.plan.candidates.find((c) => c.id === "ko-old");
    check("ko-old: alle 8 Stabschef-Felder fehlen", cOld.missingFields.length === 8, JSON.stringify(cOld.missingFields));
    check("ko-old: keine vorhandenen Stabschef-Felder", cOld.presentFields.length === 0);
    const cLeg = res.plan.candidates.find((c) => c.id === "ko-legacy");
    check("ko-legacy: Legacy-Felder gelten als VORHANDEN (recommended_communication + action_items)",
      cLeg.presentFields.includes("recommended_communication") && cLeg.presentFields.includes("action_items"));
    check("ko-legacy: fehlende Felder enthalten NICHT die vorhandenen Legacy-Felder",
      !cLeg.missingFields.includes("recommended_communication") && !cLeg.missingFields.includes("action_items"));
    check("ko-legacy: fehlend = die 6 uebrigen (Prosa/Level/Structs)", cLeg.missingFields.length === 6, JSON.stringify(cLeg.missingFields));

    // === 6) Kostenschaetzung im Dry-Run ===
    const expectedPerCall = storage.estimateLlmCost("gpt-5-mini", 2500, 800);
    check("Kostenschaetzung/Call = interne estimateLlmCost(2500,800)",
      res.plan.estCostPerCallUsd === expectedPerCall && typeof expectedPerCall === "number", `plan=${res.plan.estCostPerCallUsd} exp=${expectedPerCall}`);
    check("Gesch. Gesamtkosten = perCall * Kandidaten",
      res.plan.estTotalCostUsd === Math.round(expectedPerCall * 2 * 1e6) / 1e6);
    check("Token-Annahmen sind die Code-Schaetzwerte (2500/800)",
      res.plan.estTokensPerCall.input === 2500 && res.plan.estTokensPerCall.output === 800);
    check("Budget-Gate ist verdrahtet (plan.budgetGateWired)", res.plan.budgetGateWired === true);
    check("Ziel-Felder = die 8 Stabschef-Felder", res.plan.targetFields.length === 8);
    check("Histogramm zaehlt fehlende Felder (risk_of_no_action bei beiden Kandidaten)",
      res.plan.missingFieldHistogram.risk_of_no_action === 2);
  }

  // === callType korrekt ===
  check("callType ist 'understanding-staff-backfill'", backfill.BACKFILL_CALLTYPE === "understanding-staff-backfill");

  // === Batch-Limit greift (limit begrenzt Ladung/Warnung) ===
  {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...koOldPartial, id: `k${i}`, vorgang_id: `v${i}` }));
    const { deps } = makeDeps({}, many);
    const res = await backfill.backfillStaffFields({ limit: 30 }, deps);
    check("Batch-Limit: loadCapReached bei erreichter Ladegrenze", res.plan.loadCapReached === true);
    check("Batch-Limit: Warnung zur Ladegrenze vorhanden", res.plan.warnings.some((w) => /Ladegrenze/.test(w)));
  }

  // === 4) ECHTER (injizierter) Lauf: NUR fehlende Felder schreiben, kein Ueberschreiben ===
  {
    // Reales assembleKnowledgeObject laeuft; wir liefern ein schema-valides KI-Ergebnis,
    // das ALLE Stabschef-Felder + die Legacy-Felder erzeugen wuerde. Der Patch darf trotzdem
    // NUR die zuvor fehlenden Felder enthalten (Legacy bleibt unangetastet).
    const aiResult = {
      was_ist_passiert: "Ein Antrag wurde eingebracht.",
      warum_wichtig: "Betrifft die Ausschussarbeit.",
      wer_ist_betroffen: "Beschaeftigte im Zustaendigkeitsbereich.",
      handlungsempfehlung: "Intern kurz abstimmen.",
      zeitdruck: "mittel",
      risk_of_no_action: "Ohne Reaktion droht eine uneinheitliche Aussenwirkung.",
      opportunity_summary: "Fruehe glaubwuerdige Besetzung des Themas.",
      risk_level: "high", opportunity_level: "medium",
      recommended_communication_struct: { communicationLine: "Ruhig und loesungsorientiert.", recommendedChannel: "press", recommendedFormat: "pressRelease", suggestedOutputs: ["statement"] },
      action_items_struct: [{ title: "Linie festlegen", description: "", dueHint: "heute", priority: "high", actionType: "alignInternally" }],
      // Wuerde auch die Legacy-Felder fuellen -> darf den vorhandenen Wert NICHT ueberschreiben:
      recommended_communication: "NEUE LINIE (darf nicht schreiben)", action_items: ["NEU (darf nicht schreiben)"]
    };
    const { deps, calls } = makeDeps({}, [koLegacyPartial]);
    deps.requestUnderstanding = async () => { calls.ai += 1; return aiResult; };
    const res = await backfill.backfillStaffFields({ dryRun: false, limit: 10 }, deps);
    check("Echter Lauf: genau 1 KI-Call fuer 1 Kandidat", calls.ai === 1, `ai=${calls.ai}`);
    check("Echter Lauf: genau 1 Write", calls.save === 1, `save=${calls.save}`);
    const patch = calls.patches[0] || {};
    const patchFields = Object.keys(patch).filter((k) => k !== "id" && k !== "vorgang_id");
    check("Kein-Ueberschreiben: Patch enthaelt NICHT recommended_communication",
      !patchFields.includes("recommended_communication"), JSON.stringify(patchFields));
    check("Kein-Ueberschreiben: Patch enthaelt NICHT action_items", !patchFields.includes("action_items"));
    const missingLeg = backfill.missingStaffFields(koLegacyPartial);
    check("Nur-fehlende: alle Patch-Felder waren zuvor fehlend", patchFields.every((f) => missingLeg.includes(f)), JSON.stringify(patchFields));
    check("Nur-fehlende: mindestens ein Stabschef-Feld tatsaechlich geschrieben", patchFields.length >= 1);
    check("Echter Lauf: als verarbeitet gezaehlt", res.processed === 1 && res.failed === 0);
  }

  // === Fehlerquoten-Abbruch (> 20%) ===
  {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...koOldPartial, id: `f${i}`, vorgang_id: `vf${i}` }));
    const { deps, calls } = makeDeps({ requestUnderstanding: async () => { calls.ai += 1; throw new Error("boom"); } }, many);
    const res = await backfill.backfillStaffFields({ dryRun: false, limit: 20 }, deps);
    check("Fehlerquoten-Abbruch: res.abortedFailureRate === true", res.abortedFailureRate === true);
    check("Fehlerquoten-Abbruch: stoppt nach Mindest-Stichprobe (failed === 5)", res.failed === 5, `failed=${res.failed}`);
    check("Fehlerquoten-Abbruch: Rest als skippedBudget markiert", res.skippedBudget === 3, `skipped=${res.skippedBudget}`);
    check("Fehlerquoten-Abbruch: kein Write trotz Fehlern", calls.save === 0);
  }

  // === Budget-Gate: erschoepft -> sauberer Stopp ===
  {
    const many = Array.from({ length: 4 }, (_, i) => ({ ...koOldPartial, id: `b${i}`, vorgang_id: `vb${i}` }));
    const { deps, calls } = makeDeps({ canSpend: async () => ({ allowed: false, reason: "daily-llm-budget-reached" }) }, many);
    const res = await backfill.backfillStaffFields({ dryRun: false, limit: 20 }, deps);
    check("Budget erschoepft: kein KI-Call, kein Write", calls.ai === 0 && calls.save === 0);
    check("Budget erschoepft: alle als skippedBudget", res.skippedBudget === 4, `skipped=${res.skippedBudget}`);
  }

  // === Store nicht bereit -> inert ===
  {
    const { deps, calls } = makeDeps({ storeReady: () => false });
    const res = await backfill.backfillStaffFields({ dryRun: false }, deps);
    check("Store nicht bereit: skipped, keine Calls/Writes", res.skipped === true && calls.ai === 0 && calls.save === 0);
  }

  // === Keine Kostenwerte im Client / keine UI-Bezuege in den neuen Dateien ===
  {
    const modSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "staff-backfill.js"), "utf8");
    const cliSrc = fs.readFileSync(path.join(__dirname, "staff-backfill.js"), "utf8");
    check("Modul hat keine UI-Bezuege (kein 'hstand', kein client.js/styles.css)",
      !/hstand|client\.js|styles\.css/.test(modSrc));
    check("Modul/CLI importieren client/styles NICHT",
      !/require\(["'][^"']*client["']\)/.test(modSrc + cliSrc) && !/styles\.css/.test(modSrc + cliSrc));
    check("Kostenschaetzung bleibt serverseitig (Plan-Objekt, nicht Teil von currentHelmutState)",
      !/currentHelmutState/.test(modSrc));
    check("Keine hartkodierte Partei / keine Personen-Logik im Modul",
      !/\bcem\b|\bince\b|özdemir|\bSPD\b|\bCDU\b|\bCSU\b|\bFDP\b|\bAfD\b|Gr[üu]ne|\bLinke\b/i.test(modSrc));
  }

  // === GitHub-Action Dry-Run: nie automatisch, nie echter Lauf, kein KI-Key ===
  {
    const wfPath = path.join(__dirname, "..", ".github", "workflows", "staff-backfill-dry-run.yml");
    check("Workflow-Datei existiert", fs.existsSync(wfPath));
    const wf = fs.existsSync(wfPath) ? fs.readFileSync(wfPath, "utf8") : "";
    check("Workflow: nur manuell (workflow_dispatch vorhanden)", /workflow_dispatch/.test(wf));
    check("Workflow: laeuft NIE automatisch (kein schedule/push/pull_request-Trigger)",
      !/^\s*schedule\s*:/m.test(wf) && !/\bpull_request\b/.test(wf) && !/^\s*push\s*:/m.test(wf));
    check("Workflow: KEIN echter Lauf moeglich (kein --execute / --confirm)",
      !/--execute/.test(wf) && !/--confirm/.test(wf));
    check("Workflow: HELMUT_V3_STORE fest auf '1'", /HELMUT_V3_STORE:\s*["']?1["']?/.test(wf));
    check("Workflow: KEIN KI-Key gesetzt (kein OPENAI/AZURE-Key)",
      !/OPENAI_API_KEY/.test(wf) && !/AZURE_OPENAI_KEY/.test(wf));
    check("Workflow: Store-Secrets referenziert (SUPABASE_URL + SERVICE_ROLE_KEY)",
      /secrets\.SUPABASE_URL/.test(wf) && /secrets\.SUPABASE_SERVICE_ROLE_KEY/.test(wf));
    check("Workflow: limit wird validiert (nur Ganzzahl) — keine Command-Injection",
      /\[0-9\]\+/.test(wf) && /LIMIT_INPUT/.test(wf));
    check("Workflow: minimale Rechte (contents: read)", /permissions:[\s\S]*contents:\s*read/.test(wf));
    check("Workflow: startet den Dry-Run-Befehl (scripts/staff-backfill.js --limit=)",
      /node scripts\/staff-backfill\.js --limit=/.test(wf));
  }

  // === Mini-Batch-Action: extrem sichere Guards ===
  {
    const mbPath = path.join(__dirname, "..", ".github", "workflows", "staff-backfill-mini-batch.yml");
    check("Mini-Batch: Workflow-Datei existiert", fs.existsSync(mbPath));
    const mb = fs.existsSync(mbPath) ? fs.readFileSync(mbPath, "utf8") : "";
    check("Mini-Batch: nur manuell (workflow_dispatch)", /workflow_dispatch/.test(mb));
    check("Mini-Batch: NIE automatisch (kein schedule/push/pull_request)",
      !/^\s*schedule\s*:/m.test(mb) && !/\bpull_request\b/.test(mb) && !/^\s*push\s*:/m.test(mb));
    check("Mini-Batch: confirm_text ist Pflicht-Input", /confirm_text\s*:[\s\S]*?required:\s*true/.test(mb));
    check("Mini-Batch: verlangt exakt BACKFILL_10", /confirm_text\s*==\s*'BACKFILL_10'/.test(mb) && /!=\s*"BACKFILL_10"/.test(mb));
    check("Mini-Batch: echter Lauf mit --execute --confirm --limit=10 (hart)",
      /node scripts\/staff-backfill\.js --execute --confirm --limit=10/.test(mb));
    check("Mini-Batch: KEIN Limit ueber 10 moeglich (kein dynamisches --limit, kein limit-Input)",
      !/--limit=\$\{\{/.test(mb) && !/--limit=1[1-9]/.test(mb) && !/--limit=[2-9][0-9]/.test(mb) && !/inputs:[\s\S]*limit\s*:/.test(mb));
    check("Mini-Batch: braucht KI-Key-Secret (OpenAI ODER Azure)",
      /secrets\.OPENAI_API_KEY/.test(mb) && /secrets\.AZURE_OPENAI_KEY/.test(mb) && /secrets\.AZURE_OPENAI_ENDPOINT/.test(mb));
    check("Mini-Batch: Store-Secrets + HELMUT_V3_STORE=1",
      /secrets\.SUPABASE_URL/.test(mb) && /secrets\.SUPABASE_SERVICE_ROLE_KEY/.test(mb) && /HELMUT_V3_STORE:\s*["']?1["']?/.test(mb));
    // BUGFIX: Dry-Run (Schritt A) MUSS ohne KI-Key laufen -> KI-Key-Check NUR vor Execute (Schritt B).
    const mbSteps = mb.split(/\n\s{6}- name:/);
    const mbPreflight = mbSteps.find((b) => /Store-Secrets \(kein KI-Key/.test(b)) || "";
    const mbDryStep = mbSteps.find((b) => /Dry-Run Plan anzeigen/.test(b)) || "";
    const mbExecStep = mbSteps.find((b) => /Echter Mini-Batch/.test(b)) || "";
    check("Mini-Batch: Preflight prueft NUR Store-Secrets (KEIN KI-Key-Check)",
      /SUPABASE_URL/.test(mbPreflight) && !/OPENAI_API_KEY/.test(mbPreflight) && !/AZURE_OPENAI_KEY/.test(mbPreflight));
    check("Mini-Batch: Dry-Run (Schritt A) laeuft OHNE KI-Key (nur Store-Env)",
      !/OPENAI_API_KEY/.test(mbDryStep) && !/AZURE_OPENAI_KEY/.test(mbDryStep) && /--limit=10/.test(mbDryStep));
    check("Mini-Batch: KI-Key-Check NUR in Schritt B (Execute), vor dem echten Lauf",
      /OPENAI_API_KEY/.test(mbExecStep) && /AZURE_OPENAI_KEY/.test(mbExecStep) && /Kein KI-Key gesetzt/.test(mbExecStep));
    // Azure-Deployment: bevorzugt vars, Fallback secrets; in Schritt B durchgereicht.
    check("Mini-Batch: AZURE_OPENAI_DEPLOYMENT wird in Schritt B durchgereicht (vars || secrets)",
      /AZURE_OPENAI_DEPLOYMENT:\s*\$\{\{\s*vars\.AZURE_OPENAI_DEPLOYMENT\s*\|\|\s*secrets\.AZURE_OPENAI_DEPLOYMENT\s*\}\}/.test(mbExecStep));
    // Azure aktiv ohne Deployment -> Stopp vor Execute (kein stiller gpt-5-mini-Default).
    check("Mini-Batch: Azure ohne Deployment stoppt vor Execute (Guard mit exit 1)",
      /AZURE_OPENAI_KEY[^\n]*\][^\n]*AZURE_OPENAI_ENDPOINT[^\n]*\][^\n]*-z "\$\{AZURE_OPENAI_DEPLOYMENT/.test(mbExecStep)
      && /AZURE_OPENAI_DEPLOYMENT fehlt/.test(mbExecStep));
    // Der Deployment-Wert darf nicht ausgegeben/geloggt werden (kein echo des Wertes).
    check("Mini-Batch: Deployment-Wert wird nicht geloggt (kein echo von $AZURE_OPENAI_DEPLOYMENT)",
      !/echo[^\n]*\$\{?AZURE_OPENAI_DEPLOYMENT/.test(mb));
    check("Mini-Batch: erst Dry-Run-Plan, dann Execute (zwei Schritte)",
      /Dry-Run Plan anzeigen/.test(mb) && /Echter Mini-Batch/.test(mb) && mb.indexOf("Dry-Run Plan") < mb.indexOf("Echter Mini-Batch"));
    check("Mini-Batch: Execute nur bei Kandidaten > 0 (0 -> kein Lauf)",
      /steps\.dry\.outputs\.candidates\s*!=\s*'0'/.test(mb));
    check("Mini-Batch: minimale Rechte (contents: read)", /permissions:[\s\S]*contents:\s*read/.test(mb));
    check("Mini-Batch: HELMUT_MAX_LLM_CALLS_PER_DAY als Cap gesetzt (im Code genutzt)",
      /HELMUT_MAX_LLM_CALLS_PER_DAY/.test(mb));

    // Dry-Run-Action bleibt UNVERAENDERT sicher: kein --execute/--confirm, kein KI-Key.
    const dry = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "staff-backfill-dry-run.yml"), "utf8");
    check("Trennung: --execute/--confirm NUR in der Mini-Batch-Action, NICHT im Dry-Run",
      /--execute/.test(mb) && /--confirm/.test(mb) && !/--execute/.test(dry) && !/--confirm/.test(dry));
    check("Trennung: KI-Key NUR in der Mini-Batch-Action, NICHT im Dry-Run",
      /OPENAI_API_KEY/.test(mb) && !/OPENAI_API_KEY/.test(dry) && !/AZURE_OPENAI_KEY/.test(dry));
  }

  // === GEZIELTER Modus (genau 1 Objekt ueber id/vorgang) ===
  {
    // Dry-Run, Ziel = ko-old (Kandidat). Nur Einzel-Getter, NICHT listKnowledgeObjects.
    const { deps, calls } = makeDeps({}, ALL_KOS);
    const res = await backfill.backfillStaffFields({ targetKoId: "ko-old", limit: 999 }, deps);
    check("Ziel: Plan im Zielmodus (targeted=true, targetKoId gesetzt)",
      res.plan.targeted === true && res.plan.targetKoId === "ko-old");
    check("Ziel: NUR das Zielobjekt geladen (getKnowledgeObjectById), KEIN listKnowledgeObjects",
      calls.byId === 1 && calls.list === 0);
    check("Ziel: genau 1 Kandidat (kein anderes KO)", res.plan.toProcess === 1 && res.plan.candidates[0].id === "ko-old");
    check("Ziel: hartes Limit 1 (auch bei --limit=999)", res.plan.loadLimit === 1 && res.plan.plannedBatchLimit === 1);
    check("Ziel-Dry-Run: 0 KI-Calls, 0 Writes", calls.ai === 0 && calls.save === 0);
  }
  {
    // Falsche ID -> 0 Kandidaten -> kein Write (auch im echten Lauf).
    const { deps, calls } = makeDeps({}, ALL_KOS);
    const res = await backfill.backfillStaffFields({ dryRun: false, targetKoId: "ko-existiert-nicht" }, deps);
    check("Ziel: falsche ID -> 0 Kandidaten, kein KI-Call, kein Write",
      res.plan.toProcess === 0 && calls.ai === 0 && calls.save === 0 && calls.list === 0);
  }
  {
    // Ziel ueber VORGANG-ID (Fallback), wenn keine ko-id: nutzt getKnowledgeObjectByVorgang.
    const { deps, calls } = makeDeps({}, ALL_KOS);
    const res = await backfill.backfillStaffFields({ targetVorgangId: "vg-old" }, deps);
    check("Ziel: Auswahl ueber Vorgang-ID (getKnowledgeObjectByVorgang), kein list",
      res.plan.toProcess === 1 && res.plan.candidates[0].vorgang_id === "vg-old" && calls.byVorgang === 1 && calls.list === 0);
  }
  {
    // Echter (injizierter) Ziel-Lauf: nur fehlende Felder schreiben, kein Ueberschreiben.
    const aiResult = {
      was_ist_passiert: "Antrag.", warum_wichtig: "Wichtig.", wer_ist_betroffen: "Betroffene.",
      handlungsempfehlung: "Abstimmen.", zeitdruck: "mittel",
      risk_of_no_action: "Risiko ohne Reaktion.", opportunity_summary: "Chance.",
      risk_level: "high", opportunity_level: "medium",
      recommended_communication_struct: { communicationLine: "Linie.", recommendedChannel: "press", recommendedFormat: "pressRelease", suggestedOutputs: ["statement"] },
      action_items_struct: [{ title: "Schritt", description: "", dueHint: "heute", priority: "high", actionType: "alignInternally" }],
      recommended_communication: "NEU (darf nicht schreiben)", action_items: ["NEU (darf nicht schreiben)"]
    };
    const { deps, calls } = makeDeps({}, [koLegacyPartial]);
    deps.requestUnderstanding = async () => { calls.ai += 1; return aiResult; };
    const res = await backfill.backfillStaffFields({ dryRun: false, targetKoId: "ko-legacy" }, deps);
    const patch = calls.patches[0] || {};
    const patchFields = Object.keys(patch).filter((k) => k !== "id" && k !== "vorgang_id");
    check("Ziel-Execute: genau 1 verarbeitet, 1 Write", res.processed === 1 && calls.save === 1);
    check("Ziel-Execute: Kein-Ueberschreiben (Legacy-Felder nicht im Patch)",
      !patchFields.includes("recommended_communication") && !patchFields.includes("action_items"));
    check("Ziel-Execute: nur zuvor fehlende Felder geschrieben",
      patchFields.every((f) => backfill.missingStaffFields(koLegacyPartial).includes(f)) && patchFields.length >= 1);
  }

  // === Single-Object-Action (staff-backfill-one.yml): Guards ===
  {
    const oneP = path.join(__dirname, "..", ".github", "workflows", "staff-backfill-one.yml");
    check("Single: Workflow-Datei existiert", fs.existsSync(oneP));
    const one = fs.existsSync(oneP) ? fs.readFileSync(oneP, "utf8") : "";
    check("Single: nur manuell (workflow_dispatch), NIE automatisch",
      /workflow_dispatch/.test(one) && !/^\s*schedule\s*:/m.test(one) && !/\bpull_request\b/.test(one) && !/^\s*push\s*:/m.test(one));
    check("Single: confirm_text Pflicht + exakt BACKFILL_ONE",
      /confirm_text\s*:[\s\S]*?required:\s*true/.test(one) && /confirm_text\s*==\s*'BACKFILL_ONE'/.test(one) && /!=\s*"BACKFILL_ONE"/.test(one));
    check("Single: hart genau 1 Ziel-Objekt (--target-ko=ko-vg-destabilisiert --limit=1), kein anderes",
      /--execute --confirm --target-ko=ko-vg-destabilisiert --limit=1/.test(one)
      && /--target-ko=ko-vg-destabilisiert --limit=1/.test(one)
      && !/--limit=[2-9]/.test(one) && !/--limit=1[0-9]/.test(one));
    check("Single: Dry-Run (Schritt A) ohne KI-Key, nur Store-Env",
      /node scripts\/staff-backfill\.js --target-ko=ko-vg-destabilisiert --limit=1 \| tee/.test(one));
    check("Single: KI-Key- und Azure-Deployment-Guard vor Execute",
      /Kein KI-Key gesetzt/.test(one) && /AZURE_OPENAI_DEPLOYMENT fehlt/.test(one));
    check("Single: Azure-Deployment durchgereicht (vars || secrets), nie geloggt",
      /AZURE_OPENAI_DEPLOYMENT:\s*\$\{\{\s*vars\.AZURE_OPENAI_DEPLOYMENT\s*\|\|\s*secrets\.AZURE_OPENAI_DEPLOYMENT\s*\}\}/.test(one)
      && !/echo[^\n]*\$\{?AZURE_OPENAI_DEPLOYMENT/.test(one));
    check("Single: minimale Rechte (contents: read)", /permissions:[\s\S]*contents:\s*read/.test(one));
    check("Single: Execute nur bei confirm_text UND Kandidat > 0",
      /inputs\.confirm_text == 'BACKFILL_ONE' && steps\.dry\.outputs\.candidates != '0'/.test(one));
  }

  console.log(`\n${passed}/${passed + failed} Stabschef-Backfill-Assertions erfolgreich.`);
  if (failed) process.exit(1);
})().catch((e) => { console.error("Testfehler:", e && e.stack || e); process.exit(1); });
