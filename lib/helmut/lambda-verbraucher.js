"use strict";

const kommunikationsriegel = require("./kommunikationsriegel");

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

// ── UNMITTELBARER RELAY-ANSTOSS UEBER AWS (Korrekturlauf 2026-08-14/3) ────────────────────────
// Nach einem belegten Datenbankabschluss stellt GENAU EIN asynchroner Aufruf der
// Relay-Funktion die Folgeauftraege zu. `InvocationType: Event` bedeutet: der Verbraucher
// wartet NICHT auf den Relay — es entsteht keine verschachtelte Aufrufkette und keine
// Aufrufverstaerkung (ein Anstoss je Stapel, nicht je Nachricht).
//
// GEHT DER ANSTOSS VERLOREN (Drosselung, Netzfehler, Absturz), repariert ihn der minuetliche
// Zeitgeber — die Versandabsicht liegt bereits in der Outbox. Deshalb darf dieser Weg
// schweigend scheitern; er ist eine Beschleunigung, keine Zusage.
//
// ── WARUM DIE NAHT HIER LIEGT UND NICHT EINE EBENE HOEHER (Verkabelungslauf 2026-08-14/4) ────
// Frueher konnte ein Test einen fertigen Ausloeser einsetzen (`deps.loeseRelayAus`). Damit
// uebersprang er GENAU DAS, was in Production schiefging: das Lesen von
// `HELMUT_RELAY_FUNKTION`. Der Test war gruen, die CloudFormation-Vorlage setzte die Variable
// aber gar nicht — die Kette war unterbrochen und niemand sah es.
// Die einzige ersetzbare Stelle ist deshalb jetzt die AWS-NETZGRENZE (`deps.lambdaAufruf`).
// Name, Aufrufart und Nutzdaten entstehen IMMER im echten Code aus der echten Umgebung.
const RELAY_URSACHEN = Object.freeze({
  OK: "relay-verdrahtet",
  NAME_FEHLT: "relay-funktion-nicht-konfiguriert",
  SDK_FEHLT: "lambda-sdk-nicht-verfuegbar"
});

function erstelleRelayAusloeser(env, deps = {}) {
  // KOMMUNIKATIONSRIEGEL VOR DER NAMENSPRUEFUNG — dieser Weg laeuft NICHT ueber
  // job-dispatch.erstelleTransport und braucht darum eine eigene Lage.
  const riegel = kommunikationsriegel.pruefe({ kanal: "lambda-invoke" }, env || process.env);
  if (!riegel.erlaubt) return { ausloeser: null, grund: riegel.grund, riegel };
  const funktion = String((env && env.HELMUT_RELAY_FUNKTION) || "").trim();
  if (!funktion) return { ausloeser: null, grund: RELAY_URSACHEN.NAME_FEHLT };

  // Die Netzgrenze: in AWS der echte SDK-Aufruf, im Test eine Attrappe, die GENAU diese
  // Argumente entgegennimmt. Alles davor ist echter Produktionscode.
  let sende = deps.lambdaAufruf;
  if (typeof sende !== "function") {
    const region = String((env && env.AWS_REGION) || "eu-central-1").trim();
    try {
      // eslint-disable-next-line global-require
      const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
      const client = new LambdaClient({ region });
      sende = (befehl) => client.send(new InvokeCommand(befehl));
    } catch (_) {
      return { ausloeser: null, grund: RELAY_URSACHEN.SDK_FEHLT };
    }
  }

  return {
    grund: RELAY_URSACHEN.OK,
    ausloeser: async () => {
      await sende({
        FunctionName: funktion,
        InvocationType: "Event",                 // asynchron: kein Warten, keine Kette
        Payload: Buffer.from(JSON.stringify({ ausloeser: "verbraucher" }))
      });
    }
  };
}

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

  // EINMAL JE AUFRUF, NICHT JE NACHRICHT: der Zustand der Relay-Verkabelung. Eine fehlende
  // Variable ist damit in CloudWatch sichtbar, statt sich hinter einem stillen Fehlschlag zu
  // verstecken — und erzeugt trotzdem keine Protokolllawine.
  const umgebungOben = deps.env || process.env;
  const relayVerdrahtung = erstelleRelayAusloeser(umgebungOben, deps);
  if (relayVerdrahtung.grund !== RELAY_URSACHEN.OK) {
    log(`[lambda/verbraucher] KONFIGURATIONSBEFUND relay=${relayVerdrahtung.grund}`
      + " — der unmittelbare Anstoss entfaellt; Folgeauftraege traegt allein der Zeitgeber."
      + " Es wird NICHT selbst versendet.");
  }
  bilanz.relay = relayVerdrahtung.grund;

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
        env: umgebungOben,
        deps: {
          ...(deps.verbraucherDeps || {}),
          // Der Verbraucher stoesst den Relay ueber genau diesen Weg an.
          relayDeps: {
            ...((deps.verbraucherDeps && deps.verbraucherDeps.relayDeps) || {}),
            // KEIN DIREKTVERSAND AUS DEM VERBRAUCHER. In AWS besitzt diese Funktion weder
            // die Queue-Adresse noch `sqs:SendMessage`. Ein Rueckfall auf den direkten
            // Versand waere deshalb ein stiller Fehlschlag, der wie Erfolg aussieht.
            // `direktVerboten` macht daraus einen benannten, sichtbaren Ausgang.
            direktVerboten: true,
            ...(relayVerdrahtung.ausloeser ? { loeseAus: relayVerdrahtung.ausloeser } : {})
          }
        }
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
    + ` gearbeitet=${bilanz.gearbeitet} relay=${bilanz.relay}`
    + ` dauerMs=${(deps.now || Date.now)() - start}`);

  // AWS erwartet exakt dieses Format bei aktiviertem ReportBatchItemFailures.
  return { batchItemFailures, bilanz };
}

module.exports = { handler, leseNachricht, erstelleRelayAusloeser, RELAY_URSACHEN };
