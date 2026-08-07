"use strict";

// Helmut — Kostenvertrag des LLM-Nutzungsprotokolls (OP-25-Befundsprint 2026-08-07):
// =============================================================================================
// Anlass (belegt): Der zweite OP-25-Production-Nachweis 2026-08-06/07 endete `blockiert`
// mit genau EINEM Befund `kosten-nicht-bepreisbar`. Ursache war KEIN unbepreisbarer echter
// KI-Aufruf, sondern ein Skip-Marker (`skipped-lage-narrativ`, Budget-Gate fail closed,
// lage.js): Marker übergaben weder Modell noch usage-Block, `buildLlmUsageRecord` machte
// daraus `model:"unknown"` / `estimatedCost:"unknown"` — und der (bewusst strenge)
// OP-25-Kostenvertrag (`kostenAusNutzung`) kann einen so gespeicherten NICHT-Aufruf nicht
// von einem unbepreisbaren ECHTEN Aufruf unterscheiden.
//
// Fix (kleinste sichere Korrektur, zentral in buildLlmUsageRecord):
//   * Ein Aufrufer kennzeichnet einen NICHT ausgeführten Aufruf ausdrücklich mit
//     `keinAufruf: true`. Nur dann — und nur OHNE jede Token-Angabe — wird der Eintrag
//     als technisch belegt kostenfrei gespeichert: estimatedCost = 0 (Zahl), Token = 0,
//     model = übergebener Marker oder "kein-aufruf", Audit-Feld `keinAufruf: true`.
//   * Alles andere bleibt byte-identisch: echte Aufrufe ohne usage-Block oder mit
//     unbekanntem Modell bleiben der ehrliche Fehlerzustand "unknown" (der Vertrag
//     blockiert dann zu Recht); ein unbekanntes Modell wird NIE still mit 0 bewertet.
//   * Der OP-25-Kostenvertrag selbst ist UNVERÄNDERT — Alt-Einträge (wie der historische
//     Production-Eintrag vom 2026-08-07T12:37:40.812Z) blockieren weiterhin.
//
// Läuft offline (reine Funktionen, kein I/O, kein Netz), wird vom kanonischen Runner
// automatisch eingesammelt.

const storage = require("../lib/helmut/storage");
const vertrag = require("../lib/helmut/op25-nachweis");
const tenantContext = require("../lib/helmut/tenant-context");

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const bau = (entry) => storage.buildLlmUsageRecord(entry, { id: "llm-test", createdAt: "2026-08-07T12:00:00.000Z" });

// --- 1 · Exakte Reproduktion des Production-Fehlerfalls (Alt-Verhalten, OHNE Kennzeichnung) --
// Der Eintrag entspricht Feld für Feld dem belegten Eintrag llm-1786106260812-nomqtd
// (callType skipped-lage-narrativ, success false, error budget-check-failed-closed,
// kein model, kein usage). OHNE `keinAufruf` MUSS weiter "unknown"/"unknown" entstehen —
// das beweist zugleich, dass Alt-Einträge ihr Verhalten nicht ändern (Rückwärtsvergleich).
const alt = bau({ callType: "skipped-lage-narrativ", politicianId: "angela-merkel", success: false, error: "budget-check-failed-closed" });
check("1.1 Repro: ohne Kennzeichnung entsteht model=\"unknown\"", alt.model === "unknown", `model=${alt.model}`);
check("1.2 Repro: ohne Kennzeichnung entsteht estimatedCost=\"unknown\" (Zeichenkette)", alt.estimatedCost === "unknown", `estimatedCost=${JSON.stringify(alt.estimatedCost)}`);
check("1.3 Repro: kein Audit-Feld keinAufruf am Alt-Eintrag", !("keinAufruf" in alt));

// Der OP-25-Kostenvertrag MUSS auf so einem Eintrag weiterhin blockieren (fail closed) —
// der historische Production-Eintrag bleibt damit korrekt `nicht_pruefbar`.
const fensterVon = Date.parse("2026-08-07T00:00:00.000Z");
const fensterBis = Date.parse("2026-08-08T00:00:00.000Z");
const altKosten = vertrag.kostenAusNutzung({ authStore: { llmUsage: [{ ...alt, createdAt: "2026-08-07T12:37:40.812Z" }] }, vonMs: fensterVon, bisMs: fensterBis, rahmenUsd: 2 });
const altBefunde = vertrag.pruefeKosten(altKosten);
check("1.4 Vertrag unverändert: Alt-Eintrag blockiert (`kosten-nicht-bepreisbar`, 1 unbepreist)",
  altKosten.unbepreisteEintraege === 1 && altBefunde.some((b) => b.grund === "kosten-nicht-bepreisbar" && b.schwere === "blockiert"),
  JSON.stringify({ altKosten, altBefunde }));

// --- 2 · Fix: ausdrücklich gekennzeichneter Nicht-Aufruf ist belegt kostenfrei ---------------
const frei = bau({ callType: "skipped-lage-narrativ", politicianId: "angela-merkel", keinAufruf: true, success: false, error: "budget-check-failed-closed" });
check("2.1 Nicht-Aufruf: estimatedCost ist die ZAHL 0", frei.estimatedCost === 0 && typeof frei.estimatedCost === "number", JSON.stringify(frei.estimatedCost));
check("2.2 Nicht-Aufruf: kanonischer Modell-Marker \"kein-aufruf\"", frei.model === "kein-aufruf", frei.model);
check("2.3 Nicht-Aufruf: Token numerisch 0 (kein \"unknown\")", frei.promptTokens === 0 && frei.completionTokens === 0 && frei.totalTokens === 0);
check("2.4 Nicht-Aufruf: Audit-Feld keinAufruf=true persistiert", frei.keinAufruf === true);
check("2.5 Nicht-Aufruf: success/error/Fachfelder unverändert ehrlich", frei.success === false && frei.error === "budget-check-failed-closed" && frei.callType === "skipped-lage-narrativ");
const freiKosten = vertrag.kostenAusNutzung({ authStore: { llmUsage: [{ ...frei, createdAt: "2026-08-07T12:37:40.812Z" }] }, vonMs: fensterVon, bisMs: fensterBis, rahmenUsd: 2 });
check("2.6 Vertrag: gekennzeichneter Nicht-Aufruf ist vollständig bepreist (0 USD, keine Befunde)",
  freiKosten.vollstaendig === true && freiKosten.unbepreisteEintraege === 0 && freiKosten.fensterUsd === 0
  && vertrag.pruefeKosten(freiKosten).length === 0, JSON.stringify(freiKosten));
const freiMitModell = bau({ callType: "skipped-x", model: "none", keinAufruf: true, success: false });
check("2.7 Nicht-Aufruf: ausdrücklich übergebener Marker (\"none\") bleibt erhalten", freiMitModell.model === "none" && freiMitModell.estimatedCost === 0);

// --- 3 · Erfolgreicher echter Aufruf mit bekanntem Modell ------------------------------------
const echt = bau({ callType: "understanding", model: "gpt-5-mini", politicianId: "cem-ince", usage: { input_tokens: 1000, output_tokens: 500 }, success: true });
check("3.1 Echter Aufruf: estimatedCost numerisch und exakt nach Preistabelle", echt.estimatedCost === 0.00125, JSON.stringify(echt.estimatedCost));
check("3.2 Echter Aufruf: kanonischer Modellname verbatim", echt.model === "gpt-5-mini");
check("3.3 Echter Aufruf: kein keinAufruf-Feld", !("keinAufruf" in echt));

// --- 4 · Unbekanntes Modell (echter Aufruf) wird NIE still mit 0 bewertet --------------------
const unbekannt = bau({ callType: "understanding", model: "super-neu-9000", usage: { input_tokens: 1000, output_tokens: 500 }, success: true });
check("4.1 Unbekanntes Modell: estimatedCost=\"unknown\" (ehrlicher Fehlerzustand, nicht 0)", unbekannt.estimatedCost === "unknown");
const unbekanntKosten = vertrag.kostenAusNutzung({ authStore: { llmUsage: [{ ...unbekannt, createdAt: "2026-08-07T12:00:00.000Z" }] }, vonMs: fensterVon, bisMs: fensterBis, rahmenUsd: 2 });
check("4.2 Unbekanntes Modell: Vertrag blockiert (fail closed, `kosten-nicht-bepreisbar`)",
  unbekanntKosten.unbepreisteEintraege === 1
  && vertrag.pruefeKosten(unbekanntKosten).some((b) => b.grund === "kosten-nicht-bepreisbar" && b.schwere === "blockiert"));

// --- 5 · Fehlende Preis-/Usage-Daten bei echtem Aufruf bleiben ehrlicher Fehlerzustand -------
const ohneUsage = bau({ callType: "understanding", model: "gpt-5-mini", success: true });
check("5.1 Echter Aufruf ohne usage-Block: Token und Kosten \"unknown\"",
  ohneUsage.promptTokens === "unknown" && ohneUsage.estimatedCost === "unknown");

// --- 6 · Fehlgeschlagener/abgebrochener echter Aufruf ----------------------------------------
const fehlgeschlagen = bau({ callType: "understanding", model: "gpt-5-mini", usage: { input_tokens: 200, output_tokens: 0 }, success: false, error: "OpenAI HTTP 500" });
check("6.1 Fehlgeschlagener Aufruf MIT usage: numerisch bepreist (Tokens sind angefallen)",
  typeof fehlgeschlagen.estimatedCost === "number" && fehlgeschlagen.success === false && fehlgeschlagen.error === "OpenAI HTTP 500");
const abgebrochen = bau({ callType: "understanding", model: "gpt-5-mini", success: false, error: "request-error:ETIMEDOUT" });
check("6.2 Abgebrochener Aufruf OHNE usage: ehrlich \"unknown\" (Modell bleibt belegt)",
  abgebrochen.estimatedCost === "unknown" && abgebrochen.model === "gpt-5-mini");

// --- 7 · Widerspruchsschutz: keinAufruf + Token fällt NICHT auf den Kostenfrei-Pfad ----------
const widerspruch = bau({ callType: "skipped-x", keinAufruf: true, usage: { input_tokens: 10, output_tokens: 5 }, success: false });
check("7.1 Widerspruch (keinAufruf + usage): NICHT kostenfrei, kein Audit-Feld",
  !("keinAufruf" in widerspruch) && widerspruch.estimatedCost !== 0, JSON.stringify({ estimatedCost: widerspruch.estimatedCost }));
check("7.2 Widerspruch: model fällt auf \"unknown\" (kein stiller kein-aufruf-Marker)", widerspruch.model === "unknown");
const widerspruchTotal = bau({ callType: "skipped-x", keinAufruf: true, usage: { total_tokens: 15 }, success: false });
check("7.3 Widerspruch auch bei nur total_tokens", !("keinAufruf" in widerspruchTotal) && widerspruchTotal.estimatedCost !== 0);

// --- 8 · Datentypen des Kostenvertrags -------------------------------------------------------
check("8.1 istBrauchbareKostenzahl akzeptiert die belegte 0", vertrag.kostenAusNutzung({ authStore: { llmUsage: [] }, vonMs: 0, bisMs: 1, rahmenUsd: 2 }).vollstaendig === true);
check("8.2 estimatedCost ist nie null (Zahl oder \"unknown\")",
  [alt, frei, echt, unbekannt, ohneUsage, fehlgeschlagen, abgebrochen, widerspruch].every((r) => r.estimatedCost === "unknown" || typeof r.estimatedCost === "number"));

// --- 9 · Mandantenzuordnung bleibt erhalten (auch für deaktivierte Mandate) ------------------
check("9.1 politicianId/userId/profileId-Zuordnung", frei.politicianId === "angela-merkel" && frei.userId === "angela-merkel" && frei.profileId === "angela-merkel");

// --- 10 · Statusvertrag deaktivierter Mandate (unverändert, hier festgeschrieben) ------------
// `mandate_profiles.aktiv=false` bedeutet: AUSGESCHLOSSEN aus der Cron-Mandatsauflösung
// (eine Mandatswahrheit, K2) — der Datensatz bleibt erhalten (nie löschen). Der interaktive
// Kontozugriff läuft über die GETRENNTE Benutzerkonten-Schicht (accounts/Auth-Store) und
// wird durch die Mandats-Deaktivierung NICHT entzogen; Kosten interaktiver Nutzung deckelt
// das Budget-Gate (canSpendLlmForTenant), dessen Skip-Marker genau dieser Sprint bepreisbar
// gemacht hat. Das ist der dokumentierte Bestand — KEINE neue Produktregel.
const zeilen = [
  { id: "angela-merkel", mandate_profiles: [{ aktiv: false, geloescht_at: null }] },
  { id: "cem-ince", mandate_profiles: [{ aktiv: true, geloescht_at: null }] }
];
const aktive = tenantContext.aktiveMandateAusRelationalenZeilen(zeilen);
check("10.1 Deaktiviertes Mandat ist aus der Cron-Auflösung ausgeschlossen", Array.isArray(aktive) && !aktive.includes("angela-merkel") && aktive.includes("cem-ince"), JSON.stringify(aktive));
check("10.2 Deaktivierung ist kein Löschen (Lebenszyklus-Projektion liefert die Zeile mit profileActive=false)",
  (() => { const l = tenantContext.relationalesProfilLebenszyklus(zeilen[0]); return l && l.profileActive === false; })());

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
