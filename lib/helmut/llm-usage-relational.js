"use strict";

// Helmut — W-2 für `llmUsage`: Projektion Blob → relationale Zeile.
// =============================================================================
// DER BELEGTE BEFUND (Sicherheitsrahmen §17.2/§17.4, Nachtsprint 01./02.09.):
// `recordLlmUsage` ist ein UNBEDINGTER Lese-Ändere-Schreibe-Zyklus über den
// gemeinsamen `helmut_store`-Blob (`writeAuthStore`, Voll-Upsert mit
// `resolution=merge-duplicates`, last-write-wins). Zwei nebenläufige KI-Aufrufe
// überschreiben sich gegenseitig ihren Eintrag — LAUTLOS und ohne Fehler. Der
// Mechanismus ist bewiesen: im selben Schreibpfad fehlten 26 von 328
// Dual-Write-`processRuns` (7,9 %) im Blob und 0 relational.
//
// Für `processRuns` wurde genau dieses Problem am 2026-07-27 gelöst — durch eine
// RELATIONALE Tabelle mit atomarem Upsert (`20260727_process_runs_relational.sql`,
// Flag `HELMUT_PROCESS_RUNS_RELATIONAL`, Dual-Write, Blob als Lesespiegel).
// `llmUsage` bekam diese Behandlung nie. Dieses Modul ist der fehlende Teil,
// nach EXAKT demselben, bereits bewährten Muster.
//
// ─── WAS DIESES MODUL IST ───────────────────────────────────────────────────
// Reine Logik: die Abbildung EINES `buildLlmUsageRecord`-Eintrags auf EINE Zeile
// von `public.llm_usage` und zurück. Kein Netz, keine Datenbank, keine Uhr,
// keine Secrets. Es wirft nie bei fehlenden Feldern.
//
// ─── WAS ES AUSDRÜCKLICH NICHT IST ──────────────────────────────────────────
//  * Es schaltet nichts ein. Flag `HELMUT_LLM_USAGE_RELATIONAL` ist Default AUS.
//  * Es wendet keine Migration an. `20260902121500_llm_usage_relational.sql`
//    ergänzt die Tabelle ADDITIV und ist freigabepflichtig (CLAUDE.md §5).
//  * Es ersetzt den Blob NICHT. Der Blob-Pfad bleibt während der gesamten
//    Umstellung unverändert erhalten (Phase 2 „Dual-Write"): alle bestehenden
//    Leser (`getLlmUsage`, `getLlmUsageToday`, `getRunCostReport`, Admin-Reports,
//    `op25-nachweis`, Kontolöschung) lesen weiter aus `store.llmUsage`.
//
// ─── DER VIER-PHASEN-ÜBERGANG (docs/betrieb/blob-relational-migration-plan.md) ─
//   Phase 1  nur Blob                                        ← HEUTE (Flag aus)
//   Phase 2  Dual-Write: relational kanonisch + Blob-Spiegel  ← hier vorbereitet
//   Phase 3  Lesepfad bevorzugt relational
//   Phase 4  Blob-Schlüssel `llmUsage` abschalten
// Jede Phase ist eine eigene Betreiberfreigabe. Dieser Sprint liefert Phase 2
// vollständig gebaut und offline bewiesen — eingeschaltet wird nichts.
//
// ─── WARUM DAS FÜR DEN 500er-FUNKTIONSTEST ZÄHLT ────────────────────────────
// Der gemessene p95-Tagesbedarf der fünf realen Mandate (170) ist wegen genau
// dieses Verlustpfads nur eine UNTERGRENZE. Mit 500 Profilen wird die
// Schreiblast auf denselben Blob um Größenordnungen höher — die Untererfassung
// würde mitwachsen, und die Abbruchregel A04 (Kosten) rechnete gegen zu kleine
// Zahlen. Ein Kostendeckel, der auf untererfassten Zahlen steht, ist kein Deckel.

const FLAG = "HELMUT_LLM_USAGE_RELATIONAL";

function flagAn(wert) {
  const s = String(wert ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

// Default AUS. Ohne Flag UND ohne Migration ist der gesamte relationale Pfad ein
// dokumentierter No-Op; `recordLlmUsage` verhält sich byte-identisch wie bisher.
function llmUsageRelationalEnabled(env = process.env) {
  try {
    return flagAn(env && env[FLAG]);
  } catch (_) {
    return false;
  }
}

// `buildLlmUsageRecord` schreibt bei fehlendem `usage`-Block ausdrücklich den
// STRING "unknown" statt einer Zahl (nie stiller Verlust, CLAUDE.md §4.4). In
// einer Zahlenspalte ist „unbekannt" NULL — und niemals 0. `Number("unknown")`
// wäre NaN, `Number(null)` wäre 0: beides wären falsche Messwerte.
function zahlOderNull(wert) {
  if (wert === null || wert === undefined || wert === "" || wert === "unknown") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

function textOderNull(wert, max = 120) {
  if (wert === null || wert === undefined) return null;
  const s = String(wert);
  return s === "" ? null : s.slice(0, max);
}

// EIN Blob-Eintrag → EINE relationale Zeile.
//
// DSGVO: ausschließlich technische Skalare, klassifizierte Fehlertexte (die
// bereits in `buildLlmUsageRecord` auf 300 Zeichen gekürzten, bereinigten Codes)
// und pseudonyme Kennungen. KEIN Prompt, KEINE Antwort, KEIN Secret — dieselbe
// Zusage wie im Blob, weil es dieselben Felder sind.
function llmUsageToRelationalRow(eintrag = {}) {
  const e = eintrag && typeof eintrag === "object" ? eintrag : {};
  return {
    id: textOderNull(e.id, 80),
    created_at: textOderNull(e.createdAt, 40),
    politician_id: textOderNull(e.politicianId, 120),
    user_id: textOderNull(e.userId, 120),
    tenant_id: textOderNull(e.tenantId, 120),
    profile_id: textOderNull(e.profileId, 120),
    run_id: textOderNull(e.runId, 120),
    pipeline_step: textOderNull(e.pipelineStep, 120),
    model: textOderNull(e.model, 120),
    call_type: textOderNull(e.callType, 120),
    prompt_tokens: zahlOderNull(e.promptTokens),
    completion_tokens: zahlOderNull(e.completionTokens),
    total_tokens: zahlOderNull(e.totalTokens),
    estimated_cost: zahlOderNull(e.estimatedCost),
    duration_ms: zahlOderNull(e.durationMs),
    // `success` ist im Blob ein echter Boolean (buildLlmUsageRecord erzwingt das,
    // Härtung 01.09.: ein Skip-Marker zieht immer success:false nach).
    success: e.success === true,
    error: textOderNull(e.error, 300),
    // DIE UNTERSCHEIDUNG, AUF DER DER GANZE BEDARFSNACHWEIS RUHT: ein
    // Budget-/Konfigurations-Skip ist KEIN Azure-Fehler, sondern ein
    // Bedarfsnachweis (§16.2). Ohne diese Spalte wären die 1.260
    // Budgetablehnungen des Messfensters relational nicht mehr von echten
    // Fehlern zu trennen — und p95 170 nicht mehr rekonstruierbar.
    kein_aufruf: e.keinAufruf === true,
    source_id: textOderNull(e.sourceId, 120),
    package_id: textOderNull(e.packageId, 120),
    vorgang_id: textOderNull(e.vorgangId, 120),
    knowledge_object_id: textOderNull(e.knowledgeObjectId, 120)
  };
}

// Rückrichtung für den späteren Lesepfad (Phase 3): EINE relationale Zeile → die
// Blob-Form, die alle heutigen Leser erwarten. Damit ist die Umstellung des
// Lesepfads eine reine Quellenumschaltung ohne Anpassung der Leser.
function relationalRowToLlmUsage(zeile = {}) {
  const z = zeile && typeof zeile === "object" ? zeile : {};
  const zahl = (v) => (v === null || v === undefined ? "unknown" : Number(v));
  const keinAufruf = z.kein_aufruf === true;
  const eintrag = {
    id: z.id ?? null,
    createdAt: z.created_at ?? null,
    tenantId: z.tenant_id ?? null,
    profileId: z.profile_id ?? null,
    runId: z.run_id ?? null,
    pipelineStep: z.pipeline_step ?? "unknown",
    sourceId: z.source_id ?? null,
    packageId: z.package_id ?? null,
    vorgangId: z.vorgang_id ?? null,
    knowledgeObjectId: z.knowledge_object_id ?? null,
    politicianId: z.politician_id ?? null,
    userId: z.user_id ?? z.politician_id ?? null,
    model: z.model ?? "unknown",
    callType: z.call_type ?? "unknown",
    promptTokens: keinAufruf ? 0 : zahl(z.prompt_tokens),
    completionTokens: keinAufruf ? 0 : zahl(z.completion_tokens),
    totalTokens: keinAufruf ? 0 : zahl(z.total_tokens),
    estimatedCost: z.estimated_cost === null || z.estimated_cost === undefined ? "unknown" : Number(z.estimated_cost),
    durationMs: zahl(z.duration_ms),
    success: z.success === true,
    error: z.error ?? null
  };
  if (keinAufruf) eintrag.keinAufruf = true;
  return eintrag;
}

// Vergleich Blob-Eintrag ↔ relationale Zeile über die gemeinsamen Felder.
// Grundlage des Dual-Write-Äquivalenztests (Phase 2) — dieselbe Rolle wie
// `compareCrawlRunProjection` beim Crawl-Lauf.
function vergleicheLlmUsageProjektion(blobEintrag = {}, zeile = {}) {
  const soll = llmUsageToRelationalRow(blobEintrag);
  const abweichungen = [];
  for (const feld of Object.keys(soll)) {
    const a = soll[feld];
    const b = zeile ? zeile[feld] : undefined;
    const gleich = a === null || a === undefined
      ? (b === null || b === undefined)
      : (typeof a === "number" ? Number(b) === a : (typeof a === "boolean" ? b === a : String(b) === String(a)));
    if (!gleich) abweichungen.push({ feld, blob: a, relational: b === undefined ? null : b });
  }
  return { gleich: abweichungen.length === 0, abweichungen };
}

module.exports = {
  FLAG,
  llmUsageRelationalEnabled,
  llmUsageToRelationalRow,
  relationalRowToLlmUsage,
  vergleicheLlmUsageProjektion
};
