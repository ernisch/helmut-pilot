"use strict";

// ============================================================================
// UNDERSTANDING-GATE-ARM (OP-18, Kapazitätssprint 2026-08-31) — Pflichtprüfungen
// ============================================================================
// Beweist die 18 Pflichtprüfungen des Arm-Schritts gegen die KANONISCHE
// Pruefstelle (understandOneCluster) und die Wiedervorlage
// (pruefeGeparkteNeuBewertung). REINE LOGIK: injizierte Deps, kein echter
// KI-/DB-Call, kein Netz. Struktur-Checks lesen den Quelltext (Muster wie
// scripts/vorgangs-lebenszyklus-test.js), damit kein Pfad am Gate vorbei
// entstehen kann, ohne dass diese Suite rot wird.

const fs = require("fs");
const path = require("path");
const {
  understandOneCluster, runPendingUnderstandingShadow, pruefeGeparkteNeuBewertung,
  ERGEBNISGRUPPEN
} = require("../lib/helmut/understanding");
const understandingGate = require("../lib/helmut/quellenarchitektur/understanding-gate");
const { laufBilanz } = require("../lib/helmut/lauf-bilanz");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
function abschnitt(t) { console.log(`\n--- ${t} ---`); }

// ── Fixtures ────────────────────────────────────────────────────────────────
// Medien-Dokument OHNE politisches Signal -> Gate-Entscheidung 'parken'.
function parkDoc(n = 1) {
  return {
    id: `rd-park-${n}`, content_hash: `hash-park-${n}`, source_id: "medien-quelle-1",
    title: "Wetterbericht fuer das sonnige Sommerwochenende an der Kueste",
    summary: "Sonnig und warm, viel Badewetter am Wochenende erwartet.",
    published_at: new Date(Date.now() - 5 * 86400000).toISOString()
  };
}
// Institutionssignal -> Gate-Entscheidung 'verstehen'.
function verstehenDoc(n = 1) {
  return {
    id: `rd-verst-${n}`, content_hash: `hash-verst-${n}`, source_id: "medien-quelle-1",
    title: "Bundestag beschliesst umfassendes Rentenpaket 2026",
    summary: "Der Bundestag hat das Rentenpaket verabschiedet.",
    published_at: new Date(Date.now() - 2 * 86400000).toISOString()
  };
}

function baueDeps(overrides = {}) {
  const spuren = {
    modellAufrufe: 0, canSpendAufrufe: 0, reservierungen: 0,
    belege: [], parkungen: [], freigaben: [], pendings: [], verknuepfungen: [], logSkips: []
  };
  const deps = {
    modelName: () => "gpt-5-mini",
    canSpend: () => { spuren.canSpendAufrufe += 1; return { allowed: true }; },
    requestUnderstanding: () => { spuren.modellAufrufe += 1; return Promise.resolve({}); },
    save: () => ({ saved: false }),
    saveSources: (koId, docs) => { spuren.verknuepfungen.push({ koId, anzahl: (docs || []).length }); },
    markFailed: () => {},
    logSkip: (t) => spuren.logSkips.push(t),
    gateMode: () => "on",
    savePending: (vid) => { spuren.pendings.push(vid); return Promise.resolve({ saved: true, id: `ko-${vid}` }); },
    recordGateParkung: (rows) => { spuren.belege.push(...(rows || [])); return Promise.resolve({ ok: true, written: (rows || []).length }); },
    markGateGeparkt: (vid) => { spuren.parkungen.push(vid); return Promise.resolve({ ok: true }); },
    releaseGateGeparkt: (vids) => { spuren.freigaben.push(...(vids || [])); return Promise.resolve({ ok: true, freigegeben: (vids || []).length }); },
    ...overrides
  };
  return { deps, spuren };
}

function geparktesKo(vid) {
  return { id: `ko-${vid}`, vorgang_id: vid, status: "pending", understanding_status: "gate-geparkt" };
}

(async () => {
  // ── §1 · off/shadow unveraendert: KEINE Parkung, Modellpfad laeuft ────────────────
  abschnitt("§1 off/shadow: unverändert, nichts wird geparkt");
  for (const modus of ["off", "shadow"]) {
    const { deps, spuren } = baueDeps({ gateMode: () => modus });
    const r = await understandOneCluster({ documents: [parkDoc()] }, deps, { vorgangId: "vg-arm-a", existing: null });
    check(`${modus}: parken-wuerdiger Cluster wird NORMAL verarbeitet (Modell aufgerufen)`, spuren.modellAufrufe === 1);
    check(`${modus}: keine Parkung, kein Beleg, keine Vormerkung durch das Gate`,
      spuren.parkungen.length === 0 && spuren.belege.length === 0 && r.status !== "skipped-gate-geparkt");
  }

  // ── §2 · on: der scharfe Vorfilter verhindert den Aufruf wirklich ────────────────
  abschnitt("§2 on: Parkung verhindert den Modellaufruf VOR Budget/CAS");
  {
    const reserviereSpion = { aufrufe: 0 };
    const { deps, spuren } = baueDeps({
      verstehenVertrag: () => ({
        reserviere: async () => { reserviereSpion.aufrufe += 1; return { erlaubt: true, fencing: 1, lease: "l" }; },
        modellstart: async () => ({ ok: true }),
        schliesseAb: async () => ({ uebernommen: true }),
        gibAuf: async () => ({}), freigabeOhneAufruf: async () => ({})
      })
    });
    const r = await understandOneCluster({ documents: [parkDoc(1), parkDoc(2)] }, deps, { vorgangId: "vg-arm-b", existing: null });
    check("on: Ergebnis 'skipped-gate-geparkt' mit Grund + Gate-Version", r.status === "skipped-gate-geparkt"
      && /^parken:/.test(r.reason || "") && r.gateVersion === understandingGate.GATE_VERSION);
    check("on: Modell NIE aufgerufen", spuren.modellAufrufe === 0);
    check("on: Budget NIE befragt (kein canSpend, kein Skip-Log)", spuren.canSpendAufrufe === 0 && spuren.logSkips.length === 0);
    check("on: CAS-Reservierung NIE angefasst", reserviereSpion.aufrufe === 0);
    check("on: genau die erwarteten Buchungen — Beleg je Dokument, 1 Vormerkung, 1 Zustandswechsel, 1 Verknuepfung",
      spuren.belege.length === 2 && spuren.pendings.length === 1 && spuren.parkungen.length === 1
      && spuren.verknuepfungen.length === 1 && spuren.verknuepfungen[0].koId === "ko-vg-arm-b" && spuren.verknuepfungen[0].anzahl === 2);
    check("on: Belegzeilen tragen Version, Grund, Vorgang und KO",
      spuren.belege.every((b) => b.understanding_result === `gate-geparkt@${understandingGate.GATE_VERSION}`
        && b.gate_reason && b.vorgang_id === "vg-arm-b" && b.knowledge_object_id === "ko-vg-arm-b" && b.model === null));
  }

  // ── §3 · verstehen-Cluster passiert das scharfe Gate unveraendert ────────────────
  abschnitt("§3 on: befürwortete Cluster laufen unverändert durch");
  {
    const { deps, spuren } = baueDeps();
    await understandOneCluster({ documents: [verstehenDoc()] }, deps, { vorgangId: "vg-arm-c", existing: null });
    check("on: verstehen-Cluster erreicht das Modell", spuren.modellAufrufe === 1 && spuren.canSpendAufrufe === 1);
    check("on: verstehen-Cluster wird NICHT geparkt", spuren.parkungen.length === 0 && spuren.belege.length === 0);
  }

  // ── §4 · Fail-geschlossen zum Parken, fail-offen zur Verarbeitung ────────────────
  abschnitt("§4 Fehlerpfade: nie beleglos parken, nie Arbeit verlieren");
  {
    const f1 = baueDeps({ recordGateParkung: () => Promise.resolve({ ok: false, written: 0, grund: "db-weg" }) });
    const r1 = await understandOneCluster({ documents: [parkDoc()] }, f1.deps, { vorgangId: "vg-arm-d1", existing: null });
    check("Beleg scheitert -> KEINE Parkung, normale Verarbeitung", r1.status !== "skipped-gate-geparkt"
      && f1.spuren.parkungen.length === 0 && f1.spuren.modellAufrufe === 1);
    const f2 = baueDeps({ recordGateParkung: () => { throw new Error("kaputt"); } });
    const r2 = await understandOneCluster({ documents: [parkDoc()] }, f2.deps, { vorgangId: "vg-arm-d2", existing: null });
    check("Beleg WIRFT -> KEINE Parkung, normale Verarbeitung", r2.status !== "skipped-gate-geparkt" && f2.spuren.modellAufrufe === 1);
    const f3 = baueDeps({ markGateGeparkt: () => Promise.resolve({ ok: false, reason: "status-veraendert" }) });
    const r3 = await understandOneCluster({ documents: [parkDoc()] }, f3.deps, { vorgangId: "vg-arm-d3", existing: null });
    check("Zustandswechsel scheitert -> Ergebnis NICHT als geparkt behauptet, normale Verarbeitung",
      r3.status !== "skipped-gate-geparkt" && f3.spuren.modellAufrufe === 1);
    const f4 = baueDeps({ savePending: () => Promise.resolve({ skipped: true, reason: "existenz-unbekannt" }) });
    const r4 = await understandOneCluster({ documents: [parkDoc()] }, f4.deps, { vorgangId: "vg-arm-d4", existing: null });
    check("Traeger-Vormerkung scheitert -> KEINE Parkung, normale Verarbeitung",
      r4.status !== "skipped-gate-geparkt" && f4.spuren.parkungen.length === 0 && f4.spuren.modellAufrufe === 1);
    const f5 = baueDeps();
    delete f5.deps.recordGateParkung;
    const r5 = await understandOneCluster({ documents: [parkDoc()] }, f5.deps, { vorgangId: "vg-arm-d5", existing: null });
    check("Parkpfad nicht verdrahtet -> KEINE Parkung, normale Verarbeitung", r5.status !== "skipped-gate-geparkt" && f5.spuren.modellAufrufe === 1);
    const f6 = baueDeps();
    const r6 = await understandOneCluster({ documents: [] }, f6.deps, { vorgangId: "vg-arm-d6", existing: null });
    check("Leerer Cluster ist KEINE Parkentscheidung (Lesefehler parken nichts)",
      r6.status !== "skipped-gate-geparkt" && f6.spuren.parkungen.length === 0 && f6.spuren.belege.length === 0);
  }

  // ── §5 · Idempotenz: bereits geparkt -> keine neuen Writes, kein Aufruf ──────────
  abschnitt("§5 bereits geparkt: idempotent, nie endlos neu bewertet mit Writes");
  {
    const { deps, spuren } = baueDeps();
    const r1 = await understandOneCluster({ documents: [parkDoc()] }, deps, { vorgangId: "vg-arm-e", existing: null });
    const r2 = await understandOneCluster({ documents: [parkDoc()] }, deps, { vorgangId: "vg-arm-e", existing: geparktesKo("vg-arm-e") });
    check("1. Lauf parkt, 2. Lauf meldet 'bereits-geparkt'", r1.status === "skipped-gate-geparkt" && r2.status === "skipped-gate-geparkt" && r2.reason === "bereits-geparkt");
    check("2. Lauf: KEIN neuer Beleg, KEIN neuer Zustandswechsel, KEIN Modellaufruf",
      spuren.belege.length === 1 && spuren.parkungen.length === 1 && spuren.modellAufrufe === 0);
    check("2. Lauf: Dokumente werden (idempotent) verknuepft", spuren.verknuepfungen.length === 2);
  }

  // ── §6 · Eingabeaenderung: Gate befuerwortet jetzt -> Freigabe + Verarbeitung ────
  abschnitt("§6 Eingabeänderung: geparkt -> freigegeben -> verarbeitet");
  {
    const { deps, spuren } = baueDeps();
    const r = await understandOneCluster({ documents: [parkDoc(), verstehenDoc()] }, deps, { vorgangId: "vg-arm-f", existing: geparktesKo("vg-arm-f") });
    check("geparkter Vorgang mit neuem verstehen-Dokument wird freigegeben", spuren.freigaben.includes("vg-arm-f"));
    check("und anschliessend NORMAL verarbeitet (Modell aufgerufen)", spuren.modellAufrufe === 1 && r.status !== "skipped-gate-geparkt");
  }

  // ── §7 · Betreiberfreigabe schlaegt das Gate ─────────────────────────────────────
  abschnitt("§7 wiederaufnahmeFreigabe: Gate wird übersprungen");
  {
    const { deps, spuren } = baueDeps();
    await understandOneCluster({ documents: [parkDoc()] }, deps, { vorgangId: "vg-arm-g", existing: null, wiederaufnahmeFreigabe: true });
    check("ausdrueckliche Freigabe: parken-wuerdiger Cluster wird trotzdem verarbeitet",
      spuren.modellAufrufe === 1 && spuren.parkungen.length === 0 && spuren.belege.length === 0);
  }

  // ── §8 · Rueckweg on -> shadow: Geparkte blockieren nichts ───────────────────────
  abschnitt("§8 Rückweg: geparkter Vorgang unter shadow/off");
  {
    const { deps, spuren } = baueDeps({ gateMode: () => "shadow" });
    const r = await understandOneCluster({ documents: [parkDoc()] }, deps, { vorgangId: "vg-arm-h", existing: geparktesKo("vg-arm-h") });
    check("shadow: bereits geparkter Vorgang wird bei Erreichen NORMAL verarbeitet",
      spuren.modellAufrufe === 1 && r.status !== "skipped-gate-geparkt");
    check("shadow: es wird nichts NEU geparkt", spuren.parkungen.length === 0 && spuren.belege.length === 0);
  }

  // ── §9 · Ergebnisklasse: kein Fehler, kein Unbekannt, Bilanz geht auf ────────────
  abschnitt("§9 Ergebnisklasse und Laufbilanz");
  {
    check("ERGEBNISGRUPPEN kennt 'skipped-gate-geparkt' als 'ausgeschlossen' (nie Fehler/unbekannt)",
      ERGEBNISGRUPPEN["skipped-gate-geparkt"] === "ausgeschlossen");
    // Pending-Pfad mit gemischter Liste: 1x parken, 1x verstehen — dieselbe kanonische
    // Pruefung, identische Semantik wie im Batch-Pfad (Pflichtpruefung "alle Pfade").
    const dokumenteJeKo = {
      "ko-vg-arm-p1": [parkDoc(7)],
      "ko-vg-arm-p2": [verstehenDoc(7)]
    };
    const { deps, spuren } = baueDeps({
      enabled: () => true, aiEnabled: () => true,
      acquireLock: () => ({ granted: true }), releaseLock: () => {},
      listWiederaufnahmen: () => [],
      listPending: () => [
        { id: "ko-vg-arm-p1", vorgang_id: "vg-arm-p1", status: "pending", understanding_status: "pending" },
        { id: "ko-vg-arm-p2", vorgang_id: "vg-arm-p2", status: "pending", understanding_status: "pending" }
      ],
      listVorgangDocuments: (koId) => dokumenteJeKo[koId] || [],
      getExisting: (vid) => ({ id: `ko-${vid}`, vorgang_id: vid, status: "pending", understanding_status: "pending" }),
      recordGateShadow: () => {}, recordGateShadowRows: () => Promise.resolve({ written: 0 })
    });
    const res = await runPendingUnderstandingShadow([], deps);
    check("Pending-Pfad: parken-KO wird geparkt, verstehen-KO verarbeitet (gleiche Semantik)",
      res.counts && res.counts["skipped-gate-geparkt"] === 1 && spuren.modellAufrufe === 1 && spuren.parkungen.includes("vg-arm-p1"));
    const bilanz = laufBilanz(res);
    check("Laufbilanz (PR #283) geht auf: gespeichert+übersprungen+fehlgeschlagen+vertagt = cluster",
      bilanz.stimmig === true);
    check("Telemetrie: geparkt zaehlt als 'ausgeschlossen', nichts 'unbekannt'",
      res.telemetrie && res.telemetrie.gruppen && res.telemetrie.gruppen.ausgeschlossen >= 1 && res.telemetrie.gruppen.unbekannt === 0);
  }

  // ── §10 · Wiedervorlage: begrenzt, versioniert, fail-geschlossen ─────────────────
  abschnitt("§10 Wiedervorlage (pruefeGeparkteNeuBewertung)");
  {
    const dokumenteJeKo = {
      "ko-vg-wv-bleibt": [parkDoc(11)],
      "ko-vg-wv-frei": [verstehenDoc(11)],
      "ko-vg-wv-leer": []
    };
    function wvDeps(overrides = {}) {
      const spur = { belege: [], freigaben: [] };
      return {
        spur,
        deps: {
          gateMode: () => "on",
          countGateGeparkt: () => 3,
          listGateGeparkt: () => [geparktesKo("vg-wv-bleibt"), geparktesKo("vg-wv-frei"), geparktesKo("vg-wv-leer")],
          listVorgangDocuments: (koId) => dokumenteJeKo[koId] || [],
          recordGateParkung: (rows) => { spur.belege.push(...(rows || [])); return Promise.resolve({ ok: true, written: (rows || []).length }); },
          releaseGateGeparkt: (vids) => { spur.freigaben.push(...(vids || [])); return Promise.resolve({ ok: true, freigegeben: (vids || []).length }); },
          ...overrides
        }
      };
    }
    const a = wvDeps();
    const wv = await pruefeGeparkteNeuBewertung(a.deps);
    check("Wiedervorlage: geprueft=3, freigegeben=1, bleibtGeparkt=1, unpruefbar=1",
      wv.geprueft === 3 && wv.freigegeben === 1 && wv.bleibtGeparkt === 1 && wv.unpruefbar === 1);
    check("Wiedervorlage: nur der befuerwortete Vorgang wird freigegeben", a.spur.freigaben.length === 1 && a.spur.freigaben[0] === "vg-wv-frei");
    check("Wiedervorlage: Freigabe-Beleg traegt 'gate-freigegeben@<version>'",
      a.spur.belege.length >= 1 && a.spur.belege.every((b) => b.understanding_result === `gate-freigegeben@${understandingGate.GATE_VERSION}`));
    check("Wiedervorlage: nicht pruefbare Belege werden NIE freigegeben", !a.spur.freigaben.includes("vg-wv-leer"));
    const b = wvDeps({ recordGateParkung: () => Promise.resolve({ ok: false, written: 0, grund: "db-weg" }) });
    const wvB = await pruefeGeparkteNeuBewertung(b.deps);
    check("Wiedervorlage: Beleg scheitert -> NICHTS freigegeben (vertagt, ehrlich gemeldet)",
      wvB.freigegeben === 0 && /beleg-fehlgeschlagen/.test(wvB.freigabeVertagt || "") && b.spur.freigaben.length === 0);
    const c = wvDeps({ gateMode: () => "shadow" });
    const wvC = await pruefeGeparkteNeuBewertung(c.deps);
    check("Wiedervorlage: bei nicht scharfem Gate ein ehrlicher No-op", wvC.skipped === true && wvC.reason === "gate-nicht-scharf");
    // Tagesrotation: gleicher Tag -> gleiches Fenster; anderer Tag -> anderes Fenster.
    const tag1 = wvDeps({ countGateGeparkt: () => 100, listGateGeparkt: (o) => { tag1.offset = o.offset; return []; } });
    await pruefeGeparkteNeuBewertung({ ...tag1.deps, now: 86400000 * 20701, limit: 25 });
    const tag2 = wvDeps({ countGateGeparkt: () => 100, listGateGeparkt: (o) => { tag2.offset = o.offset; return []; } });
    await pruefeGeparkteNeuBewertung({ ...tag2.deps, now: 86400000 * 20702, limit: 25 });
    check("Wiedervorlage: Tagesrotation verschiebt das Fenster deterministisch",
      Number.isFinite(tag1.offset) && Number.isFinite(tag2.offset) && tag1.offset !== tag2.offset
      && tag1.offset % 25 === 0 && tag2.offset % 25 === 0);
  }

  // ── §11 · Ungueltige Gate-Werte stoppen geschlossen ──────────────────────────────
  abschnitt("§11 unbekannte/fehlende Gate-Werte");
  {
    check("gateMode: unbekannter Wert faellt geschlossen auf 'off'",
      understandingGate.gateMode({ HELMUT_UNDERSTANDING_GATE: "banane" }) === "off"
      && understandingGate.gateMode({ HELMUT_UNDERSTANDING_GATE: "" }) === "off");
    const { deps, spuren } = baueDeps({ gateMode: () => "banane" });
    const r = await understandOneCluster({ documents: [parkDoc()] }, deps, { vorgangId: "vg-arm-i", existing: null });
    check("understandOneCluster: nicht-'on'-Wert parkt NIE", r.status !== "skipped-gate-geparkt" && spuren.parkungen.length === 0);
  }

  // ── §12 · Struktur: EINE kanonische Pruefstelle, keine zweite Gate-Logik ─────────
  abschnitt("§12 Strukturprüfungen (Quelltext)");
  {
    const understandingSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "understanding.js"), "utf8");
    const storageSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
    const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    check("genau EIN Parkungs-Durchfuehrungsaufruf (parkeDurchGate) im Verstehensmodul",
      (understandingSrc.match(/await parkeDurchGate\(/g) || []).length === 1);
    check("genau EIN Parkstatus-Rueckgabeort je Semantik (2x skipped-gate-geparkt: Parkung + bereits-geparkt)",
      (understandingSrc.match(/status: "skipped-gate-geparkt"/g) || []).length === 2);
    check("Storage: Zustandswechsel ist ein KONDITIONALES PATCH, nie DELETE",
      /markUnderstandingGateGeparkt[\s\S]{0,600}understanding_status=in\.\(pending,gate-geparkt\)[\s\S]{0,300}method: "PATCH"/.test(storageSrc)
      && !/markUnderstandingGateGeparkt[\s\S]{0,900}DELETE/.test(storageSrc));
    check("Storage: Rueckweg (release) ist ein konditionales PATCH auf gate-geparkt -> pending",
      /releaseUnderstandingGateGeparkt[\s\S]{0,700}understanding_status=eq\.gate-geparkt[\s\S]{0,400}"pending"/.test(storageSrc));
    check("Storage: pending-Auswahl schliesst gate-geparkt server- UND clientseitig aus",
      /understanding_status\.neq\.gate-geparkt/.test(storageSrc)
      && /ko\.understanding_status !== "gate-geparkt"/.test(storageSrc));
    check("Gesundheitsbericht: geparkte Menge wird GETRENNT ausgewiesen", /Gate geparkt/.test(serverSrc));
    check("Admin-Rueckweg existiert, admin-geschuetzt und bestaetigungspflichtig",
      /\/api\/admin\/gate\/parkung-freigeben[\s\S]{0,200}requireRoleOr403[\s\S]{0,600}confirm !== true/.test(serverSrc));
    check("Rueckstandslauf traegt die Wiedervorlage (begrenzt, fail-safe)",
      /pruefeGeparkteNeuBewertung\(\{ runId \}\)/.test(serverSrc));
    check("GATE_VERSION ist exportiert und wohlgeformt", /^g\d{4}-\d{2}-\d{2}\.\d+$/.test(understandingGate.GATE_VERSION));
  }

  console.log(`\n== Gate-Arm: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("UNERWARTETER FEHLER", e); process.exit(1); });
