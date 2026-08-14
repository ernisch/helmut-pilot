"use strict";

// Helmut — VERBRAUCHER EINES WECKSIGNALS (OP-30-Haertungssprint, 2026-08-14).
// =============================================================================================
// WAS DAS IST: der EINE Verarbeitungsweg fuer ein zugestelltes Wecksignal — unabhaengig davon,
// welcher Transport es gebracht hat (Amazon SQS ueber Lambda in Production, Selbstweck lokal
// bzw. im Notfall). Er wird von `lambda/helmut-auftrag-verbraucher.js` UND von der Route
// `POST /api/cron/worker-weck` benutzt.
//
// DIE FUENF ZUSAGEN DIESES MODULS:
//   1. VOLLSTAENDIGE SIGNALPRUEFUNG VOR JEDER VERARBEITUNG. Exakt { jobId, schemaVersion },
//      geprueft mit demselben zentralen Riegel wie beim Versand (pruefeTransportPayload).
//      Alles andere wird geschlossen abgewiesen — und zwar ENDGUELTIG (die Nachricht darf
//      nicht ewig erneut zugestellt werden, sie wird nie gueltig).
//   2. GENAU DER SIGNALISIERTE AUFTRAG. `helmut_claim_job_by_id` beansprucht atomar die
//      uebergebene jobId — nie irgendeinen anderen Auftrag aus der Datenbank.
//   3. MEHRFACHE ZUSTELLUNG IST FOLGENLOS. Ein terminaler Auftrag wird nicht erneut
//      bearbeitet (kein zweiter KI-Aufruf); ein fremd geleaster Auftrag wird nicht
//      uebernommen. Beide Faelle melden ehrlich, was zu tun ist.
//   4. DERSELBE FACHHANDLER wie Cron und Warteschlange: `scalablePipeline.fuehreAuftragAus`.
//      Es gibt KEINE zweite Fachimplementierung — Wiederholung, Zurueckstellung, Abschluss
//      und Backoff sind byte-gleich derselbe Code.
//   5. KEINE BESTAETIGUNG VOR BELEGTEM DATENBANKABSCHLUSS. Das Ergebnis sagt dem Transport
//      erst dann "fertig", wenn `helmut_finish_job` (oder eine ehrliche Zurueckstellung)
//      persistiert ist. Ein Absturz zwischen Datenbankabschluss und Queue-Bestaetigung
//      fuehrt zu einer erneuten Zustellung — die dann auf einen terminalen Auftrag trifft
//      und folgenlos bleibt (Zusage 3).
//
// DIE ANTWORT AN DEN TRANSPORT ist bewusst dreiwertig:
//   { erledigt: true }                    -> Nachricht loeschen (Arbeit getan ODER folgenlos)
//   { erledigt: false, wiederholen: true } -> Nachricht erneut zustellen lassen (nichts tun)
//   { erledigt: false, quarantaene: true } -> Nachricht ist dauerhaft unbrauchbar
// SQS bildet das exakt ab: loeschen = Erfolg, nicht loeschen = Sichtbarkeitszeit laeuft ab
// und die Nachricht kommt wieder, bis `maxReceiveCount` die Dead-Letter-Queue erreicht.

const jobDispatch = require("./job-dispatch");
const scalablePipeline = require("./scalable-pipeline");
const lambdaKonfiguration = require("./lambda-konfiguration");
const outboxRelay = require("./outbox-relay");

const VERBRAUCHER_LEASE_MS = 300000;   // 5 min — identisch zum Cron-/Warteschlangenpfad
const VERBRAUCHER_BUDGET_MS = 120000;  // harte Obergrenze eines einzelnen Auftrags im Verbraucher

// Gruende, die eine Nachricht ENDGUELTIG unbrauchbar machen (Quarantaene statt Wiederholung):
// sie werden durch erneutes Zustellen nie gueltig.
const QUARANTAENE_GRUENDE = Object.freeze([
  "payload-ungueltig",
  "schema-version-unbekannt",
  "auftrag-unbekannt"
]);

function istQuarantaene(grund) {
  return QUARANTAENE_GRUENDE.includes(String(grund || ""));
}

// ── Der Verbraucher ───────────────────────────────────────────────────────────────────────────
// deps erlaubt vollstaendige Testbarkeit ohne Netz: { storage, pipeline, env, now }.
async function verarbeiteWecksignal({ payload, env = process.env, deps = {} } = {}) {
  const storage = deps.storage || require("./storage");
  const pipeline = deps.pipeline || scalablePipeline;
  const start = (deps.now || Date.now)();

  // ── 1 · SIGNALPRUEFUNG (derselbe Riegel wie beim Versand) ────────────────────────────────
  try {
    jobDispatch.pruefeTransportPayload(payload);
  } catch (fehler) {
    return {
      erledigt: false, quarantaene: true, gearbeitet: false,
      grund: "payload-ungueltig",
      detail: pipeline.bereinigeFehler(fehler, 200)
    };
  }

  // Eine NEUERE Schemaversion als dieses Deployment wird nie verarbeitet: die Nachricht
  // wird erneut zugestellt, bis der Deployment-Wechsel abgeschlossen ist. Eine Version
  // ausserhalb jedes bekannten Bereichs (<1) faellt bereits am Payload-Riegel.
  if (!jobDispatch.schemaVersionVerarbeitbar(payload.schemaVersion)) {
    return {
      erledigt: false, wiederholen: true, gearbeitet: false,
      grund: "schema-version-neuer-als-deployment"
    };
  }

  // ── 2 · ANTRIEB: der Verbraucher arbeitet nur im Ereignis-Antrieb ────────────────────────
  // Sonst stoppt er geschlossen und die Nachricht bleibt in der Queue (Konfigurationsbefund,
  // nie stiller Verlust).
  const antrieb = (deps.waehleAntrieb || jobDispatch.waehleAntrieb)(env);
  if (antrieb.antrieb !== "ereignis") {
    return {
      erledigt: false, wiederholen: true, gearbeitet: false,
      grund: `antrieb-${antrieb.antrieb}`, widersprueche: antrieb.widersprueche
    };
  }

  // ── 3 · KONFIGURATION VOR JEDEM FACHAUFRUF (Korrekturlauf 2026-08-14/3) ─────────────────
  // In AWS traegt die Lambda-Funktion nur PARAMETERNAMEN. Ohne diesen Startweg faellt
  // storage.js STILL auf den lokalen Speicher zurueck — der Verbraucher wuerde Auftraege
  // "erledigen", die in Supabase nie ankommen. Deshalb: erst Konfiguration, dann Arbeit.
  // Ein Fehler stoppt GESCHLOSSEN (Nachricht wird erneut zugestellt), nie ein Rueckfall.
  if (deps.konfiguration !== false) {
    const konfig = deps.konfiguration || lambdaKonfiguration;
    if (String(env.HELMUT_SUPABASE_URL_PARAMETER || "").trim()) {
      try {
        await konfig.stelleKonfigurationSicher({ env, deps: deps.konfigurationDeps || {} });
      } catch (fehler) {
        return {
          erledigt: false, wiederholen: true, gearbeitet: false,
          grund: "konfiguration-nicht-geladen",
          detail: (fehler && fehler.helmutUrsache) || "unbekannt"
        };
      }
    }
    // HARTER RIEGEL: ohne belegte Supabase-Verbindung wird NICHT gearbeitet. Das gilt auch
    // dann, wenn gar keine Parameternamen gesetzt waren — ein Verbraucher ohne Supabase
    // ist immer ein Fehler, nie ein stiller Lokalbetrieb.
    if (deps.supabasePflicht !== false && !konfig.supabaseBereit(env)) {
      return {
        erledigt: false, wiederholen: true, gearbeitet: false,
        grund: "supabase-nicht-verbunden"
      };
    }
  }

  // ── 4 · ATOMARE BEANSPRUCHUNG GENAU DIESES AUFTRAGS ──────────────────────────────────────
  const besitzer = deps.besitzer || jobDispatch.verbraucherKennung("queue");
  const claim = await (deps.claimById || ((o) => storage.jobQueueClaimById(o)))({
    jobId: payload.jobId, owner: besitzer, leaseMs: VERBRAUCHER_LEASE_MS
  }).catch((fehler) => ({ verfuegbar: false, grund: pipeline.bereinigeFehler(fehler, 200) }));

  if (!claim || claim.verfuegbar === false) {
    // Datenbank/Migration nicht verfuegbar: NICHTS behaupten, Nachricht wiederholen lassen.
    return {
      erledigt: false, wiederholen: true, gearbeitet: false,
      grund: "warteschlange-nicht-verfuegbar", detail: (claim && claim.grund) || null
    };
  }

  if (claim.uebernommen !== true) {
    const grund = String(claim.grund || "unbekannt");
    // MEHRFACHE ZUSTELLUNG / ABSTURZ NACH DEM ABSCHLUSS: der Auftrag ist bereits terminal.
    // Das ist der HAEUFIGSTE gutartige Fall — die Nachricht hat ihre Arbeit getan.
    if (grund.startsWith("bereits-")) {
      return { erledigt: true, gearbeitet: false, grund, dauerMs: (deps.now || Date.now)() - start };
    }
    // Ein anderer Verbraucher haelt den Auftrag, oder er ist noch nicht faellig, oder die
    // Zeile ist gerade gesperrt: NICHTS tun, spaeter erneut zustellen lassen.
    if (grund === "lease-fremd" || grund === "nicht-faellig" || grund === "gesperrt") {
      return { erledigt: false, wiederholen: true, gearbeitet: false, grund };
    }
    // Unbekannter Auftrag: die Nachricht zeigt auf nichts. Sie wird nie gueltig.
    if (grund === "unbekannt") {
      return { erledigt: false, quarantaene: true, gearbeitet: false, grund: "auftrag-unbekannt" };
    }
    return { erledigt: false, wiederholen: true, gearbeitet: false, grund };
  }

  // ── 4 · AUSFUEHRUNG UEBER DEN GETEILTEN FACHKERN ─────────────────────────────────────────
  // Exakt derselbe Code wie im Cron- und Warteschlangenpfad (keine zweite Fachimplementierung).
  const workerDeps = pipeline.workerDeps(deps.handlerDeps || {});
  if (workerDeps.env === undefined) workerDeps.env = env;
  const mitBudget = deps.budgetDeps || workerDeps;
  // Klassengrenzen: der Verbraucher benutzt denselben Adapter wie der Worker. Fehlt er
  // (Flag aus), arbeiten die Handler wie im Bestand ohne verteilte Klassengrenze.
  if (mitBudget.klassen === undefined) {
    mitBudget.klassen = pipeline.klassenAdapter({ env, owner: besitzer, deps: mitBudget });
  }

  const lauf = await pipeline.fuehreAuftragAus({
    auftrag: {
      id: claim.id, job_type: claim.jobType, tenant_id: claim.tenantId,
      payload: claim.payload, attempts: claim.attempts, max_attempts: claim.maxAttempts,
      lease_expires_at: claim.leaseExpiresAt
    },
    deps: mitBudget,
    besitzer,
    leaseMs: VERBRAUCHER_LEASE_MS,
    restzeitMs: Number(deps.budgetMs) || VERBRAUCHER_BUDGET_MS
  });

  // ── 5 · ERGEBNIS AN DEN TRANSPORT ────────────────────────────────────────────────────────
  // Jeder dieser Ausgaenge ist DURCH DIE DATENBANK BELEGT (finish/defer sind persistiert),
  // bevor der Transport die Nachricht loeschen darf.
  const ausgang = lauf.ausgang;
  const dauerMs = (deps.now || Date.now)() - start;

  if (ausgang === "erledigt" || ausgang === "endgueltig-fehlgeschlagen") {
    // Auch ein endgueltig fehlgeschlagener Auftrag ist FERTIG — die Nachricht hat ihren
    // Zweck erfuellt. Der fachliche Fehler steht im Auftragsbuch, nicht in der Queue.
    //
    // UNMITTELBARER RELAY-ANSTOSS (Korrekturlauf 2026-08-14/3): die Folgeauftraege dieses
    // Auftrags liegen samt Versandabsicht bereits ATOMAR in der Datenbank. Genau EIN
    // Anstoss stellt sie zu — damit traegt sich die Kette ohne Vercel-Cron. Der Anstoss
    // ist asynchron, blockiert nie und kann den bereits belegten Abschluss nicht mehr
    // beschaedigen; geht er verloren, repariert ihn der Zeitgeber.
    const relay = deps.relay === false
      ? { angestossen: false, grund: "relay-abgeschaltet" }
      : await (deps.relay || outboxRelay).stosseRelayAn({ env, deps: deps.relayDeps || deps });
    return {
      erledigt: true, gearbeitet: true, ausgang, grund: lauf.fehler || null, dauerMs,
      relay
    };
  }
  if (ausgang === "zurueckgestellt" || ausgang === "wiederholt") {
    // Der Auftrag hat eine NEUE Faelligkeit in der Datenbank (Backoff bzw. Wartezeit). Eine
    // sofortige erneute Zustellung wuerde nur auf "nicht-faellig" laufen — die Nachricht gilt
    // deshalb als erledigt.
    //
    // WIEDERVORLAGE (Korrekturlauf 2026-08-14/3, Befund des Ende-zu-Ende-Tests): die
    // Versandabsicht dieses Auftrags ist zu diesem Zeitpunkt bereits `bestaetigt`. Ohne die
    // ausdrueckliche Wiedervorlage weckte den Auftrag nur der Abgleich — und der wartet ein
    // Mindestalter ab, wodurch ein 30-Sekunden-Backoff faktisch zu 10 Minuten wurde. Jetzt
    // wird die Absicht GENAU zur neuen Faelligkeit erneut vorgelegt.
    //
    // Der Aufruf ist bewusst NACHGELAGERT und darf nie einen belegten Abschluss beschaedigen:
    // schlaegt er fehl, bleibt exakt das bisherige Verhalten (der Abgleich faengt den
    // Auftrag). Deshalb wird sein Fehler verbucht, aber nicht geworfen.
    const vorlage = deps.wiedervorlage === false
      ? { uebernommen: false, grund: "wiedervorlage-abgeschaltet" }
      : await (deps.erneutVorlegen || ((o) => storage.jobOutboxErneutVorlegen(o)))({
        jobId: claim.id
      }).catch((fehler) => ({ uebernommen: false, grund: pipeline.bereinigeFehler(fehler, 120) }));

    // Ein Anstoss lohnt nur, wenn die Absicht JETZT faellig ist. Liegt sie in der Zukunft,
    // traegt sie der Zeitgeber — ein sofortiger Anstoss waere ein reiner Leeraufruf.
    let relay = { angestossen: false, grund: "nicht-faellig" };
    if (vorlage && vorlage.sofort === true && deps.relay !== false) {
      relay = await (deps.relay || outboxRelay).stosseRelayAn({ env, deps: deps.relayDeps || deps });
    }
    return {
      erledigt: true, gearbeitet: true, ausgang,
      grund: lauf.grund || lauf.fehler || null, dauerMs, wiedervorlage: vorlage, relay
    };
  }
  // lease-verloren / nicht-uebernommen: nichts ist belegt passiert -> erneut zustellen.
  return { erledigt: false, wiederholen: true, gearbeitet: false, ausgang, dauerMs };
}

module.exports = {
  verarbeiteWecksignal,
  istQuarantaene,
  QUARANTAENE_GRUENDE,
  VERBRAUCHER_LEASE_MS,
  VERBRAUCHER_BUDGET_MS
};
