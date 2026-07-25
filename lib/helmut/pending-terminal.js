"use strict";

// ============================================================================
// OP-06 — Terminales Aussortieren des eingefrorenen Understanding-Rückstands.
// ============================================================================
// Der Alt-Bestand vom 02./03.07. (Rauschen + belegte Themen-Duplikate) wird ohne
// terminale Markierung vom Pending-Cron ewig neu geprüft. Dieses Modul setzt die
// bestätigten Fälle kontrolliert auf understanding_status='failed-final' —
// ADDITIV (kein Delete, keine Berührung anderer Spalten außer der Rollback-
// Kennung in understanding_model), idempotent, eng allowlist-begrenzt.
//
// SICHERHEIT:
//   * Doppelt gesperrt: Flag HELMUT_PENDING_TERMINAL_EXECUTE (Default AUS)
//     UND exaktes Bestätigungstoken. Ohne beides: reine Plan-Ausgabe.
//   * Harte Allowlist (exakte vorgang_ids inkl. Umlaute, live erhoben 2026-07-17;
//     Klassifikation: Rückstand-Analyse §3, Recovery-Trockenlauf §12, Duplikate
//     einzeln per complete-Themen-SQL gegen Production verifiziert).
//   * Laufzeit-Re-Checks je Fall: complete wird NIE angefasst; bereits terminale
//     Fälle werden übersprungen (Idempotenz); Statuswechsel zwischen Plan und
//     Write bricht den Einzelfall ab (konditionales PATCH auf den Vorstatus).
//   * 0 KI-Aufrufe, kein Delete. Rollback = Kennung `aussortiert:<runId>:<vorstatus>`
//     in understanding_model -> gezieltes Zurücksetzen genau dieser Zeilen.
//
// Dieses Modul ist rein (keine DB-/Netz-Imports); alle I/O kommen als deps.

// Terminale Understanding-Zustände: werden vom Pending-Cron und von
// understandOneCluster nie wieder aufgegriffen ("nie wieder"-Garantie).
function isTerminalUnderstandingStatus(status) {
  return String(status || "") === "failed-final";
}

// Allowlist: vorgang_id -> { grund, beleg }. NUR diese Fälle darf der Pfad je
// anfassen. NICHT enthalten (bewusst): die 4 Einzel-Doc-Recovery-Kandidaten
// (vg-arbeitsverträge, vg-medikamenten, vg-steuerstrafrecht, vg-umstellungen),
// die manuellen Fälle (vg-krankschreibung, vg-privatsieren), die 10 offenen
// Ermessensfälle der Kategorie 2 sowie die frischen failed vom 17.07.
// (vg-45975d00…, vg-unterhaltsvorschuss — OP-13-Kandidaten, kein Alt-Rückstand).
const TERMINAL_ALLOWLIST = Object.freeze({
  // — Rauschen: nicht-politisch / Kommentar (11) —
  "vg-achtelfinale": { grund: "rauschen", beleg: "Sport" },
  "vg-seniorenresidenz": { grund: "rauschen", beleg: "Immobilien-PR" },
  "vg-pflegefachkraft": { grund: "rauschen", beleg: "Stellenanzeige" },
  "vg-volkspartei": { grund: "rauschen", beleg: "AT-Website" },
  "vg-0fb6ee1e45ecdc3163012b9e": { grund: "rauschen", beleg: "TV-Listing" },
  "vg-problemfall": { grund: "rauschen", beleg: "Kommentar" },
  "vg-autosuggestion": { grund: "rauschen", beleg: "Kommentar" },
  "vg-eingespart": { grund: "rauschen", beleg: "Kommentar" },
  "vg-rassistische": { grund: "rauschen", beleg: "Kommentar" },
  "vg-attackiert": { grund: "rauschen", beleg: "Kommentar" },
  "vg-bürokratischen": { grund: "rauschen", beleg: "Kommentar" },
  // — Rauschen: regional/lokal außerhalb Mandat (8) —
  "vg-wochenvorschau": { grund: "rauschen", beleg: "regional" },
  "vg-dringend": { grund: "rauschen", beleg: "regional" },
  "vg-demonstranten": { grund: "rauschen", beleg: "regional" },
  "vg-mobilitätsknoten": { grund: "rauschen", beleg: "regional" },
  "vg-parkplätzen": { grund: "rauschen", beleg: "regional" },
  "vg-kundgebung": { grund: "rauschen", beleg: "regional" },
  "vg-minderheitenpartei": { grund: "rauschen", beleg: "regional" },
  "vg-agrarreform": { grund: "rauschen", beleg: "regional" },
  // — Rauschen: Ausland/EU außerhalb Mandat (8) —
  "vg-dauerkrise": { grund: "rauschen", beleg: "Ausland/EU" },
  "vg-gerettet": { grund: "rauschen", beleg: "Ausland/EU" },
  "vg-zwangsadoptionen": { grund: "rauschen", beleg: "Ausland/EU" },
  "vg-produzieren": { grund: "rauschen", beleg: "Ausland/EU" },
  "vg-aargauer": { grund: "rauschen", beleg: "Ausland/EU" },
  "vg-ausnahmezustand": { grund: "rauschen", beleg: "Ausland/EU" },
  "vg-verbrenner": { grund: "rauschen", beleg: "Ausland/EU" },
  "vg-b2e2e8f9490af875f9f4c4aa": { grund: "rauschen", beleg: "Ausland/EU" },
  // — Themen-Duplikate: complete-KO existiert (per SQL live verifiziert 2026-07-17) —
  "vg-einkommensteuer": { grund: "duplikat", beleg: "complete-Thema Einkommensteuer (2 Treffer)" },
  "vg-kinderfreibetrag": { grund: "duplikat", beleg: "complete-Thema Kindergeld/-freibetrag" },
  "vg-bundesagentur": { grund: "duplikat", beleg: "complete-Thema Bundesagentur" },
  "vg-riesenfehler": { grund: "duplikat", beleg: "complete-Thema Rente mit 63" },
  "vg-gesetzentwurf": { grund: "duplikat", beleg: "complete-Thema Arbeitszeit (failed-Fall; F6-Retry würde doppeln)" },
  "vg-forschung": { grund: "duplikat", beleg: "strukturell identisch mit vg-wissenschafts" },
  "vg-psychotherapie": { grund: "duplikat", beleg: "complete-KO vg-psychotherapeuten (05.07.)" }
});

const TERMINAL_CONFIRM_TOKEN = "AUSSORTIEREN_34_BESTAETIGT";

function terminalExecuteEnabled(env = process.env) {
  const v = String((env && env.HELMUT_PENDING_TERMINAL_EXECUTE) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}
function terminalConfirmed(value) { return String(value == null ? "" : value) === TERMINAL_CONFIRM_TOKEN; }

// Pure: Ausführungsplan NUR für Allowlist-Fälle, die noch offen (pending/failed)
// sind. complete/terminal/fehlend -> skip mit Grund. Verändert nichts.
function planTerminal(candidates, opts = {}) {
  const allowlist = opts.allowlist || TERMINAL_ALLOWLIST;
  const byVid = new Map((candidates || []).filter((c) => c && c.vorgang_id).map((c) => [c.vorgang_id, c]));
  const execute = [];
  const skip = [];
  for (const [vid, meta] of Object.entries(allowlist)) {
    const cand = byVid.get(vid);
    if (!cand) { skip.push({ vorgangId: vid, grund: "nicht-gefunden" }); continue; }
    if (isTerminalUnderstandingStatus(cand.understanding_status)) {
      skip.push({ vorgangId: vid, grund: "bereits-terminal-idempotent" }); continue;
    }
    if (cand.understanding_status !== "pending" && cand.understanding_status !== "failed") {
      // complete (oder jeder unbekannte Zustand) wird NIE angefasst.
      skip.push({ vorgangId: vid, grund: "nicht-mehr-offen", aktuell: cand.understanding_status }); continue;
    }
    execute.push({ vorgangId: vid, grund: meta.grund, beleg: meta.beleg, vorherigerStatus: cand.understanding_status });
  }
  return { execute, skip, kiCalls: 0 };
}

// Rollback-Kennung: additive Metadaten-Konvention im Feld understanding_model
// (analog "recovery:<runid>"). Trägt den VORSTATUS, damit ein Rollback exakt
// den Zustand vor dem Aussortieren wiederherstellen kann.
function terminalMarker(runId, vorherigerStatus) {
  const prev = vorherigerStatus === "failed" ? "failed" : "pending";
  return `aussortiert:${String(runId || "manuell")}:${prev}`;
}

// understanding_model-Neuwert: bisheriges Modell (gekappt) + Marker, hart auf
// 120 Zeichen begrenzt (Konvention von markUnderstandingFailed). Der Marker
// bleibt IMMER vollständig erhalten (das Modellpräfix wird notfalls gekürzt).
function terminalModelValue(existingModel, marker) {
  const suffix = ` | ${marker}`;
  const prefix = String(existingModel || "").slice(0, Math.max(0, 120 - suffix.length));
  return `${prefix}${suffix}`;
}

// Ausführungs-Kontrolle EINES Falls (Deps injiziert; dieses Modul schreibt selbst
// nichts). Laufzeit-Re-Checks: Fall existiert, ist nicht complete, nicht bereits
// terminal, Status unverändert seit Planung. Der EINZIGE Write läuft über
// deps.markTerminal (konditionales PATCH auf den Vorstatus im Storage).
async function terminalOne(planItem, deps = {}) {
  const vid = planItem && planItem.vorgangId;
  const getExisting = deps.getExisting || (async () => null);
  const existing = await getExisting(vid);
  if (!existing) return { vorgangId: vid, done: false, skipped: true, grund: "nicht-gefunden", wrote: false };
  if (isTerminalUnderstandingStatus(existing.understanding_status)) {
    return { vorgangId: vid, done: true, skipped: true, grund: "bereits-terminal-idempotent", wrote: false };
  }
  if (existing.understanding_status !== planItem.vorherigerStatus) {
    return { vorgangId: vid, done: false, skipped: true, grund: "status-veraendert-seit-planung", aktuell: existing.understanding_status, wrote: false };
  }
  if (typeof deps.markTerminal !== "function") {
    return { vorgangId: vid, done: false, skipped: true, grund: "write-pfad-nicht-verdrahtet", wrote: false };
  }
  const marker = terminalMarker(deps.runId, planItem.vorherigerStatus);
  const res = (await deps.markTerminal(vid, {
    vonStatus: planItem.vorherigerStatus,
    understanding_model: terminalModelValue(existing.understanding_model, marker)
  })) || {};
  const wrote = res.ok === true && Number(res.updated) > 0;
  return { vorgangId: vid, done: wrote, skipped: !wrote, wrote,
    ...(wrote ? { marker } : { grund: res.reason || "write-wirkungslos" }) };
}

// Datenschutz-Filter der Berichte: nur Slugs/Zahlen/Klassen, nie Rohtitel/PII.
function redactPlan(plan = {}) {
  return {
    execute: (plan.execute || []).map((e) => ({ vorgangId: e.vorgangId, grund: e.grund, vorherigerStatus: e.vorherigerStatus })),
    skip: (plan.skip || []).map((s) => ({ vorgangId: s.vorgangId, grund: s.grund })),
    kiCalls: 0
  };
}

module.exports = {
  isTerminalUnderstandingStatus,
  TERMINAL_ALLOWLIST, TERMINAL_CONFIRM_TOKEN,
  terminalExecuteEnabled, terminalConfirmed,
  planTerminal, terminalMarker, terminalModelValue, terminalOne, redactPlan
};
