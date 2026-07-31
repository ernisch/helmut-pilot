"use strict";

// Punkt 29 — Fix-Sprint: Mutationsprobe der geschlossenen Fehlerpfade P29-1…P29-4.
// ================================================================================
// Ein gruener Regressionsvertrag beweist nichts, solange nicht gezeigt ist, dass er
// auch ROT werden kann. Jede Mutation nimmt GENAU EINE Schutzbedingung des
// Fix-Sprints in der PRODUKTIONSDATEI zurueck; die Probe ist nur gruen, wenn
// scripts/punkt29-fixpfade-test.js JEDE Ruecknahme bemerkt.
//
// Arbeitsweise: gemeinsames Geruest scripts/e2e-mutationsprobe-geruest.js —
// vollstaendiger Abzug je Mutation, Arbeitskopie unangetastet, eindeutige Anker,
// Referenzlauf muss gruen sein. server.js wird als Zusatzdatei mitkopiert (die
// Suite LIEST es nur fuer den Routen-Quelltextvertrag, sie fuehrt es nie aus).

const { fuehreMutationsprobe } = require("./e2e-mutationsprobe-geruest");

fuehreMutationsprobe({
  titel: "Punkt-29-Fix-Mutationsprobe (P29-1…P29-4)",
  suite: "punkt29-fixpfade-test.js",
  zusatzdateien: ["scripts/fixtures/test-profiles.js", "server.js"],
  mutationen: [
    {
      name: "M1 P29-1: Timeout-Objekt wird wieder als Erfolg gebucht",
      beschreibung: "Die Ergebnisklassifikation im Abschluss wird abgeklemmt — ein zurueckgegebenes Fehler-/Timeout-Objekt setzt wieder letzterErfolgAt/erfolge und die Fehlerserie auf 0.",
      datei: "lib/helmut/cron-fairness.js",
      von: "    if (rueckgabeFehler) erfolg = false;",
      nach: "    if (rueckgabeFehler && false) erfolg = false;"
    },
    {
      name: "M2 P29-1: ehrlicher Skip wird faelschlich zum Fehler",
      beschreibung: "Der Skip-Vorrang in ergebnisFehlgeschlagen faellt weg — ein ehrlicher Skip (z. B. unkonfigurierter Push mit ok:false) wuerde die Fehlerserie treiben; Skip und Fehler waeren nicht mehr unterscheidbar.",
      datei: "lib/helmut/cron-fairness.js",
      von: "  if (ergebnis.skipped === true) return false;",
      nach: "  // Skip-Vorrang entfernt (Mutation)"
    },
    {
      name: "M3 P29-1: lage-check maskiert den Timeout wieder als Erfolg",
      beschreibung: "Die Anhebung des inneren Timeouts in die Mandatsantwort der lage-check-Route entfaellt — die Fairness-Buchfuehrung saehe wieder einen Erfolg.",
      datei: "server.js",
      von: "          ...(lageTimeout || pushTimeout ? { ok: false, bounded: true, reason: lageTimeout ? (lageCheck.reason || \"lage-check-timeout\") : \"push-timeout\" } : {})",
      nach: "          // Anhebung entfernt (Mutation)"
    },
    {
      name: "M4 P29-2: null-Antwort endet wieder als anonymer cluster-error",
      beschreibung: "Der Guard fuer nicht verwertbare KI-Rueckgabewerte im Erstverstehen faellt weg — null wirft wieder einen TypeError: kein markFailed, kein Skip-Log, unbegrenzter Retry im Pending-Pfad.",
      datei: "lib/helmut/understanding.js",
      von: "  if (!aiResult || typeof aiResult !== \"object\" || Array.isArray(aiResult)) {\n    await markFailed();\n    deps.logSkip(\"skipped-understanding-invalid\");\n    return { vorgangId, status: \"skipped-invalid\", errors: [\"ki-antwort-nicht-verwertbar\"], ...spur };\n  }",
      nach: "  // Guard entfernt (Mutation)"
    },
    {
      name: "M5 P29-3: gescheiterte Aktualisierung endet wieder als stilles Duplikat",
      beschreibung: "Die Wiederaufnahme im duplicate-Zweig wird abgeklemmt — nach einem gescheiterten Update gaebe es nie einen zweiten Versuch, die Aktualisierung unterbliebe dauerhaft und unsichtbar.",
      datei: "lib/helmut/understanding.js",
      von: "        const vormerkungen = await leseUpdateVormerkungen(deps, opts.retriesCtx);",
      nach: "        const vormerkungen = null; // Wiederaufnahme abgeklemmt (Mutation)"
    },
    {
      name: "M6 P29-3: der Wiederaufnahme-Deckel faellt weg",
      beschreibung: "Die Deckelpruefung entfaellt — eine dauerhaft scheiternde Aktualisierung wuerde in jedem Lauf erneut einen KI-Call kosten (unbegrenzter Kostenpfad statt skipped-update-final).",
      datei: "lib/helmut/understanding.js",
      von: "          if (fehlversuche >= updateWiederaufnahmeMax(deps)) {",
      nach: "          if (false && fehlversuche >= updateWiederaufnahmeMax(deps)) {"
    },
    {
      name: "M7 P29-4: Lesefehler beim Existenz-Check wird wieder verschluckt",
      beschreibung: "Der Existenz-Check verliert throwOnError — ein Lesefehler wird wieder zu null ('existiert nicht') und der pending-Upsert koennte ein fertiges Wissensobjekt zurueckstufen.",
      datei: "lib/helmut/storage.js",
      von: "      existing = await getKnowledgeObjectByVorgang(vorgangId, { throwOnError: true });",
      nach: "      existing = await getKnowledgeObjectByVorgang(vorgangId);"
    }
  ]
});
