"use strict";

// Helmut — LAMBDA-VERBRAUCHER für SQS-Wecksignale (OP-30-Haertungssprint, 2026-08-14).
// =============================================================================================
// WAS DAS IST: der Einstiegspunkt, den AWS Lambda je SQS-Stapel aufruft. Er ist bewusst DUENN —
// die gesamte Fachlogik liegt in `queue-verbraucher.js`, das seinerseits denselben Fachhandler
// benutzt wie Cron und Warteschlange (`scalable-pipeline.fuehreAuftragAus`). Es gibt keine
// zweite Fachimplementierung.
//
// PARTIELLE FEHLERANTWORT (`batchItemFailures`) ist der Kern dieser Datei:
// Ohne sie gilt bei einem einzigen Fehler der GANZE Stapel als fehlgeschlagen und ALLE
// Nachrichten werden erneut zugestellt — erfolgreiche eingeschlossen. Das erzeugte doppelte
// Zustellungen (die zwar folgenlos, aber teuer sind) und wuerde die Zustellzaehler
// erfolgreicher Nachrichten in Richtung Quarantaene treiben. Mit `ReportBatchItemFailures`
// (in der Infrastrukturdefinition gesetzt) meldet der Handler GENAU die Nachrichten zurueck,
// die erneut zugestellt werden sollen.
//
// DREI AUSGAENGE JE NACHRICHT — sie entsprechen exakt der Antwort des Verbrauchers:
//   erledigt          -> Nachricht wird geloescht (Arbeit getan ODER folgenlos wiederholt)
//   wiederholen       -> Nachricht bleibt (Sichtbarkeitszeit laeuft ab, SQS stellt erneut zu)
//   quarantaene       -> Nachricht ist dauerhaft unbrauchbar. Sie wird NICHT geloescht:
//                        SQS zaehlt die Zustellversuche und verschiebt sie nach
//                        `maxReceiveCount` automatisch in die Dead-Letter-Queue. Genau so
//                        entsteht die Quarantaene ohne eigenen Code — und ohne dass eine
//                        kaputte Nachricht still verschwindet.
//
// KEIN INHALT IN DEN LOGS: geloggt werden ausschliesslich Auftrags-ID (zufaellige uuid),
// Ausgang und Dauer. Keine Mandate, keine Namen, keine Quellen, keine Dokumente.

const queueVerbraucher = require("./queue-verbraucher");

// Ein SQS-Record traegt den Body als Zeichenkette. Alles andere als ein JSON-Objekt ist
// bereits hier endgueltig unbrauchbar — die Nachricht wird nie gueltig.
function leseNachricht(record) {
  try {
    const roh = JSON.parse(String((record && record.body) || ""));
    return { ok: true, payload: roh };
  } catch (_) {
    return { ok: false, grund: "body-kein-json" };
  }
}

async function handler(event, kontext = {}, deps = {}) {
  const records = (event && Array.isArray(event.Records)) ? event.Records : [];
  const batchItemFailures = [];
  const bilanz = { empfangen: records.length, erledigt: 0, wiederholen: 0, quarantaene: 0, gearbeitet: 0 };
  const start = (deps.now || Date.now)();
  const log = deps.log || console.log;

  for (const record of records) {
    const kennung = (record && record.messageId) || "unbekannt";
    const gelesen = leseNachricht(record);

    if (!gelesen.ok) {
      // Unbrauchbarer Body: NICHT loeschen -> SQS zaehlt hoch -> Dead-Letter-Queue.
      bilanz.quarantaene += 1;
      batchItemFailures.push({ itemIdentifier: kennung });
      log(`[lambda/verbraucher] nachricht=${kennung} ausgang=quarantaene grund=${gelesen.grund}`);
      continue;
    }

    let ergebnis;
    try {
      ergebnis = await (deps.verarbeite || queueVerbraucher.verarbeiteWecksignal)({
        payload: gelesen.payload,
        env: deps.env || process.env,
        deps: deps.verbraucherDeps || {}
      });
    } catch (fehler) {
      // Ein unerwarteter Fehler ist NIE ein Grund, eine Nachricht zu loeschen: es ist nicht
      // belegt, dass die Arbeit getan wurde.
      bilanz.wiederholen += 1;
      batchItemFailures.push({ itemIdentifier: kennung });
      log(`[lambda/verbraucher] nachricht=${kennung} ausgang=fehler`
        + ` grund=${String((fehler && fehler.message) || "unbekannt").slice(0, 120)}`);
      continue;
    }

    if (ergebnis && ergebnis.erledigt === true) {
      bilanz.erledigt += 1;
      if (ergebnis.gearbeitet === true) bilanz.gearbeitet += 1;
      log(`[lambda/verbraucher] auftrag=${gelesen.payload.jobId} ausgang=${ergebnis.ausgang || "erledigt"}`
        + ` gearbeitet=${ergebnis.gearbeitet === true} dauerMs=${ergebnis.dauerMs || 0}`);
      continue;                                   // Nachricht wird geloescht
    }

    // Nicht erledigt: Nachricht bleibt in der Queue (Wiederholung ODER Weg in die
    // Dead-Letter-Queue). Beide Faelle sind dieselbe Meldung an SQS — den Unterschied
    // macht der Zustellzaehler, nicht dieser Code.
    if (ergebnis && ergebnis.quarantaene === true) bilanz.quarantaene += 1;
    else bilanz.wiederholen += 1;
    batchItemFailures.push({ itemIdentifier: kennung });
    log(`[lambda/verbraucher] auftrag=${gelesen.payload.jobId || "?"}`
      + ` ausgang=${ergebnis && ergebnis.quarantaene ? "quarantaene" : "wiederholen"}`
      + ` grund=${(ergebnis && ergebnis.grund) || "unbekannt"}`);
  }

  log(`[lambda/verbraucher] stapel empfangen=${bilanz.empfangen} erledigt=${bilanz.erledigt}`
    + ` wiederholen=${bilanz.wiederholen} quarantaene=${bilanz.quarantaene}`
    + ` gearbeitet=${bilanz.gearbeitet} dauerMs=${(deps.now || Date.now)() - start}`);

  // AWS erwartet exakt dieses Format bei aktiviertem ReportBatchItemFailures.
  return { batchItemFailures, bilanz };
}

module.exports = { handler, leseNachricht };
