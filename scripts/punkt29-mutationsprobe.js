"use strict";

// Punkt 29A — Mutationsprobe des Fehlervertrags (scripts/punkt29-fehlervertrag-test.js).
// =====================================================================================
// Ein gruener Fehlervertrag beweist nichts, solange nicht gezeigt ist, dass er rot
// werden KANN. Jede Mutation baut GENAU EINE der vom Sprintauftrag geforderten
// Luecken in den ECHTEN Produktionscode ein (temporaerer Abzug, die Arbeitskopie
// bleibt unveraendert) und muss mindestens eine fachlich relevante Assertion der
// Suite rot machen. Aufruf: node scripts/punkt29-mutationsprobe.js [--verbose]
//
// Die 12 Pflichtmutationen des Sprintauftrags 29A:
//    1 Timeout wird als Erfolg behandelt            (Budget-Abbruch entfernt)
//    2 'already running' wird als begonnen gezaehlt (Sperrverweigerungs-Sonderfall entfernt)
//    3 Erfolgszaehler trotz Ueberspringen erhoeht   (skipped-budget -> Gruppe 'verarbeitet')
//    4 letzter Erfolg trotz Fehler aktualisiert     (finishPatch setzt Erfolg immer)
//    5 Fehlerfolge trotz Fehler zurueckgesetzt      (fehlerSerie immer 0)
//    6 Circuit Open wird ignoriert                  (Breaker oeffnet nie)
//    7 defekter Inhalt in fachlicher Verarbeitung   (Schema-Validierung entfernt)
//    8 Mandantenfilter bei Wiederaufnahme entfernt  (Audit-Tenant-Guard entfernt)
//    9 Teilverarbeitung erzeugt Neustart-Duplikat   (Wissensobjekt-Identitaet nicht mehr stabil)
//   10 Abbruchgrund wird verschluckt                (errorCode aus dem Ergebnis entfernt)
//   11 harte Deadline wird ignoriert                (Vormerk-Deadline entfernt)
//   12 gesunder unabhaengiger Pfad mit abgebrochen  (Cluster-Fehlerisolation entfernt)

const { fuehreMutationsprobe } = require("./e2e-mutationsprobe-geruest");

fuehreMutationsprobe({
  titel: "Punkt-29A-Mutationsprobe (Fehlervertrag)",
  suite: "punkt29-fehlervertrag-test.js",
  zusatzdateien: ["scripts/fixtures/test-profiles.js"],
  mutationen: [
    {
      name: "M1 Timeout als Erfolg",
      beschreibung: "Das Zeitbudget des Understanding-Loops wird ignoriert — ein Timeout unterbricht nichts mehr und der Lauf sieht vollstaendig aus.",
      datei: "lib/helmut/understanding.js",
      von: "if (budgetMs && Date.now() - startedAt > budgetMs) { abgebrochenBei = i; break; }",
      nach: "if (false) { abgebrochenBei = i; break; }"
    },
    {
      name: "M2 'already running' als begonnen gezaehlt",
      beschreibung: "Die Sonderbehandlung der verweigerten Sperre entfaellt — ein 'already running' wuerde als Erfolg abgeschlossen und zaehlte in die Kapazitaet.",
      datei: "lib/helmut/cron-fairness.js",
      von: "if (erfolg && sperreVerweigert(ergebnis)) {",
      nach: "if (false && sperreVerweigert(ergebnis)) {"
    },
    {
      name: "M3 Erfolgszaehler trotz Ueberspringen erhoeht",
      beschreibung: "Uebersprungene Budget-Faelle werden in der Telemetrie als 'verarbeitet' gruppiert — ein Skip saehe wie Erfolg aus.",
      datei: "lib/helmut/understanding.js",
      von: "\"skipped-budget\": \"erneut\"",
      nach: "\"skipped-budget\": \"verarbeitet\""
    },
    {
      name: "M4 letzter Erfolg trotz Fehler aktualisiert",
      beschreibung: "finishPatch schreibt den Erfolgszeitpunkt auch bei einem Fehler fort — ein erfundener letzter Erfolg.",
      datei: "lib/helmut/cron-fairness.js",
      von: "letzterErfolgAt: erfolg ? abschluss : (alt ? alt.letzterErfolgAt : null),",
      nach: "letzterErfolgAt: abschluss,"
    },
    {
      name: "M5 Fehlerfolge trotz Fehler zurueckgesetzt",
      beschreibung: "Die Fehlerserie wird bei jedem Abschluss auf 0 gesetzt — dauerhaft scheiternde Mandate waeren unsichtbar.",
      datei: "lib/helmut/cron-fairness.js",
      von: "fehlerSerie: erfolg ? 0 : (alt ? alt.fehlerSerie : 0) + 1",
      nach: "fehlerSerie: 0"
    },
    {
      name: "M6 Circuit Open ignoriert",
      beschreibung: "Der Breaker oeffnet nie — eine erreichte Schwelle unterbindet keine weiteren Aufrufe mehr.",
      datei: "lib/helmut/google-news-hardening.js",
      von: "open = true;",
      nach: "open = false;"
    },
    {
      name: "M7 defekter Inhalt in fachlicher Verarbeitung",
      beschreibung: "Die Schema-Validierung des Erstverstehens entfaellt — eine unverwertbare KI-Antwort wuerde als Wissensobjekt gespeichert.",
      datei: "lib/helmut/understanding.js",
      von: "if (!validation.valid) {\n    await markFailed();",
      nach: "if (false) {\n    await markFailed();"
    },
    {
      name: "M8 Mandantenfilter bei Wiederaufnahme entfernt",
      beschreibung: "Der Audit-Tenant-Guard entfaellt — eine fremde Profilkennung wuerde nicht mehr als CROSS_TENANT_WRITE abgelehnt.",
      datei: "lib/helmut/matching-audit.js",
      von: "if (!deps.profileBelongsToTenant(descriptor.mandateProfileId, descriptor.tenantId)) {",
      nach: "if (false) {"
    },
    {
      name: "M9 Teilverarbeitung erzeugt Neustart-Duplikat",
      beschreibung: "Die deterministische Wissensobjekt-Identitaet ko-<vorgangId> ist nicht mehr stabil — die Wiederaufnahme erzeugte eine zweite Zeile statt den Teilzustand fortzuschreiben.",
      datei: "lib/helmut/understanding.js",
      von: "id: `ko-${vorgangId}`,",
      nach: "id: `ko-${vorgangId}-neu`,"
    },
    {
      name: "M10 Abbruchgrund verschluckt",
      beschreibung: "Der errorCode verschwindet aus dem skipped-error-Ergebnis — der Abbruchgrund waere nicht mehr erklaerbar.",
      datei: "lib/helmut/understanding.js",
      von: "return { vorgangId, status: \"skipped-error\", errorCode, ...spur };",
      nach: "return { vorgangId, status: \"skipped-error\", ...spur };"
    },
    {
      name: "M11 harte Deadline ignoriert",
      beschreibung: "Die absolute Vormerk-Deadline entfaellt — der Lauf schriebe nach Fristende weiter, statt ehrlich abzubrechen.",
      datei: "lib/helmut/understanding.js",
      von: "const deadlineWeg = vormerkDeadlineMs && Date.now() > vormerkDeadlineMs;",
      nach: "const deadlineWeg = false;"
    },
    {
      name: "M12 gesunder unabhaengiger Pfad mit abgebrochen",
      beschreibung: "Die Fehlerisolation je Cluster entfaellt — ein einzelner defekter Datensatz risse den gesamten Lauf mit ab.",
      datei: "lib/helmut/understanding.js",
      von: "results.push({ status: \"cluster-error\", vorgangId: null });",
      nach: "throw error;"
    }
  ]
});
