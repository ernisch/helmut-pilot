"use strict";

// Tests für den KO-Anreicherung-Backfill (lib/helmut/ko-enrichment.js).
// KEIN Netz, KEINE echte KI — alle Seiteneffekte über gemockte deps.
// Prüft: Dry-Run, Budget-Cap fail-closed, Evidence-Guard, Idempotenz,
// nur tags/policy_field, KI-Fehler => kein Write.

const { runKoEnrichmentBackfill, filterEvidencedTags } = require("../lib/helmut/ko-enrichment");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const koComplete = (id, over = {}) => ({
  id, understanding_status: "complete",
  headline: "Reform des Mindestlohns", was_ist_passiert: "Die Mindestlohnkommission empfiehlt eine Erhoehung.",
  warum_wichtig: "Betrifft Millionen Beschaeftigte.", wer_ist_betroffen: "Arbeitnehmer.",
  ausschuesse: ["Ausschuss für Arbeit und Soziales"], tags: [], ...over
});

// ── 1) Evidence-Guard (keine erfundenen Themen) ────────────────────────────
const ko = koComplete("ko-1");
check("Evidence-Guard: belegtes Thema 'Mindestlohn' bleibt", filterEvidencedTags(["Mindestlohn"], ko).includes("Mindestlohn"));
check("Evidence-Guard: erfundenes 'Weltraumpolitik' wird entfernt", !filterEvidencedTags(["Weltraumpolitik"], ko).includes("Weltraumpolitik"));
check("Evidence-Guard: Mix -> nur belegte", JSON.stringify(filterEvidencedTags(["Mindestlohn", "Atomkraft"], ko)) === JSON.stringify(["Mindestlohn"]));
check("Evidence-Guard: Duplikate/leere raus", filterEvidencedTags(["Mindestlohn", "mindestlohn", "", "  "], ko).length === 1);

function makeDeps(cfg = {}) {
  const calls = { ai: 0, saved: [] };
  return {
    calls,
    deps: {
      listKnowledgeObjects: async () => cfg.kos || [],
      canSpend: cfg.canSpend || (async () => ({ allowed: true })),
      extractTags: cfg.extractTags || (async (ko) => { calls.ai += 1; return { tags: ["Mindestlohn"] }; }),
      derivePolicyFields: cfg.derivePolicyFields || ((ko) => ["Arbeit und Soziales"]),
      saveEnrichment: async (id, patch) => { calls.saved.push({ id, patch }); },
      log: () => {}
    }
  };
}

(async () => {
  // ── 2) Dry-Run: plant, KEINE KI, KEIN Write ──
  {
    const { deps, calls } = makeDeps({ kos: [koComplete("a"), koComplete("b")] });
    const r = await runKoEnrichmentBackfill({ execute: false }, deps);
    check("Dry-Run: dryRun=true", r.dryRun === true);
    check("Dry-Run: candidates=2", r.candidates === 2);
    check("Dry-Run: KEINE KI-Calls", calls.ai === 0);
    check("Dry-Run: KEINE Writes", calls.saved.length === 0);
    check("Dry-Run: Kostenschaetzung + Cap ausgewiesen", r.estCostEur >= 0 && r.capEur === 5);
  }

  // ── 3) Execute: verarbeitet, schreibt nur tags/policy_field ──
  {
    const { deps, calls } = makeDeps({ kos: [koComplete("a"), koComplete("b")] });
    const r = await runKoEnrichmentBackfill({ execute: true }, deps);
    check("Execute: processed=2", r.processed === 2, JSON.stringify(r));
    check("Execute: 2 KI-Calls", calls.ai === 2);
    check("Execute: Writes nur mit tags+policy_field", calls.saved.every((s) => {
      const k = Object.keys(s.patch); return k.length === 2 && k.includes("tags") && k.includes("policy_field");
    }));
    check("Execute: gefilterte belegte Tags geschrieben", calls.saved[0].patch.tags.includes("Mindestlohn"));
  }

  // ── 4) Idempotenz: KOs MIT tags werden übersprungen ──
  {
    const { deps } = makeDeps({ kos: [koComplete("a", { tags: ["Schon da"] }), koComplete("b")] });
    const r = await runKoEnrichmentBackfill({ execute: true }, deps);
    check("Idempotenz: nur das KO ohne tags ist Kandidat", r.candidates === 1 && r.processed === 1);
  }

  // ── 5) Budget-Cap: harter Stopp (fail-closed) ──
  {
    // 100 Kandidaten, Cap so klein, dass nur wenige durchgehen (est 2ct/Call).
    const kos = Array.from({ length: 100 }, (_, i) => koComplete("k" + i));
    const { deps, calls } = makeDeps({ kos });
    const r = await runKoEnrichmentBackfill({ execute: true, maxEurCents: 6, estPerCallCents: 2 }, deps);
    check("Budget-Cap: Stopp bei 'budget-cap'", r.stop === "budget-cap");
    check("Budget-Cap: hoechstens 3 Calls bei 6ct/2ct", calls.ai <= 3, `ai=${calls.ai}`);
    check("Budget-Cap: spentEur <= capEur", r.spentEur <= r.capEur);
  }

  // ── 6) Budget fail-closed: canSpend wirft -> sofort Stopp, kein Write ──
  {
    const { deps, calls } = makeDeps({ kos: [koComplete("a"), koComplete("b")], canSpend: async () => { throw new Error("boom"); } });
    const r = await runKoEnrichmentBackfill({ execute: true }, deps);
    check("Fail-closed: canSpend-Fehler -> Stopp 'daily-budget'", r.stop === "daily-budget");
    check("Fail-closed: KEINE Writes", calls.saved.length === 0 && r.processed === 0);
  }

  // ── 7) canSpend nicht erlaubt -> Stopp ──
  {
    const { deps } = makeDeps({ kos: [koComplete("a")], canSpend: async () => ({ allowed: false }) });
    const r = await runKoEnrichmentBackfill({ execute: true }, deps);
    check("Budget aus: Stopp, nichts verarbeitet", r.stop === "daily-budget" && r.processed === 0);
  }

  // ── 8) KI-Fehler (extractTags -> null) -> KO NICHT geschrieben ──
  {
    const { deps, calls } = makeDeps({ kos: [koComplete("a")], extractTags: async () => null });
    const r = await runKoEnrichmentBackfill({ execute: true }, deps);
    check("KI-Fehler: failed=1, KEIN Write (kein Fake)", r.failed === 1 && calls.saved.length === 0);
  }

  // ── 9) Harter 5-EUR-Deckel lässt sich nicht überschreiten (Endpoint-Semantik) ──
  {
    const kos = Array.from({ length: 400 }, (_, i) => koComplete("k" + i));
    const { deps } = makeDeps({ kos });
    // Selbst wenn 50 EUR angefragt würden: der Endpoint clamped auf 500ct; hier direkt geprüft.
    const r = await runKoEnrichmentBackfill({ execute: true, maxEurCents: 500, estPerCallCents: 2 }, deps);
    check("5-EUR-Deckel: spentEur <= 5", r.spentEur <= 5);
  }

  // ── 10) bypassBudget: umgeht das Tagesbudget, ABER der harte Cap bleibt ──
  {
    // canSpend meldet "nicht erlaubt" -> ohne Bypass Stopp; mit Bypass laeuft es.
    const { deps, calls } = makeDeps({ kos: [koComplete("a"), koComplete("b")], canSpend: async () => ({ allowed: false }) });
    const r = await runKoEnrichmentBackfill({ execute: true, bypassBudget: true }, deps);
    check("bypassBudget: verarbeitet trotz gesperrtem Tagesbudget", r.processed === 2 && calls.ai === 2, JSON.stringify(r));
  }
  {
    // bypassBudget hebelt den HARTEN Euro-Deckel NICHT aus.
    const kos = Array.from({ length: 100 }, (_, i) => koComplete("k" + i));
    const { deps } = makeDeps({ kos, canSpend: async () => ({ allowed: false }) });
    const r = await runKoEnrichmentBackfill({ execute: true, bypassBudget: true, maxEurCents: 6, estPerCallCents: 2 }, deps);
    check("bypassBudget: harter 6ct-Deckel greift trotzdem (Stopp budget-cap)", r.stop === "budget-cap" && r.spentEur <= 0.06);
  }

  console.log(`\n${passed}/${passed + failed} KO-Backfill-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((e) => { console.error("Test-Fehler:", e); process.exit(1); });
