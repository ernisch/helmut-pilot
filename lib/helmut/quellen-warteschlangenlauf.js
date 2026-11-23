"use strict";

const storageModul = require("./storage");
const scalablePipeline = require("./scalable-pipeline");
const workerBetrieb = require("./worker-betrieb");
const jobDispatch = require("./job-dispatch");
const quellenArbeitsfenster = require("./quellen-arbeitsfenster");

function helmutExecLocation() {
  return String(process.env.VERCEL_REGION || process.env.HELMUT_EXEC_LOCATION || "local").slice(0, 40);
}
function helmutRunId(prefix = "run", atMs = Date.now()) {
  const stamp = new Date(atMs).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${String(prefix).slice(0, 24)}-${stamp}-${Math.random().toString(36).slice(2, 7)}`;
}

async function runCronUeberWarteschlange(cronName, { deadlineMs = 270000, runId = null, startedMs = null, arbeitsfenster = null, operator = false, buildV3Briefing } = {}) {
  const start = Number(startedMs) || Date.now();
  const laufkennung = runId || helmutRunId(`cron-${cronName}`, start);
  const verbleibend = () => Math.max(0, deadlineMs - (Date.now() - start));

  // ── LAUFQUITTUNG DES SLOTS (OP-30 Option D, Reparatursprint 2026-08-19) ────────────────
  // Bis zu diesem Sprint schrieb dieser Slot GAR KEINE Lauftelemetrie — die beiden Laeufe
  // des Aktivierungsfensters 18./19.08. (20:00/04:00 UTC) haben deshalb keine
  // `process_runs`-Zeile hinterlassen (Runbook §27). Die Quittung ist RELATIONAL und
  // BLOB-UNABHAENGIG (`schreibeWarteschlangenLaufquittung` fasst keinen Blob an): Beginn,
  // Ende, Status, Zaehlwerte und Fehlerklasse ueberleben damit genau die Stoerungsklasse
  // (Blob-/Storage-Ausfall), die den Anlass ausgeloest hat. Ein Quittungsfehler bricht den
  // Slot nie, wird aber im Ergebnis ausgewiesen (CLAUDE.md §4.10: gemeldet wird, was die
  // Ablage traegt — oder der Persistenzfehler ausdruecklich).
  const quittungsProzess = `warteschlange-${cronName}`.slice(0, 40);
  const startQuittung = await storageModul.schreibeWarteschlangenLaufquittung({
    process: quittungsProzess, runId: laufkennung, mode: "warteschlange",
    location: helmutExecLocation(), status: "running",
    startedAt: new Date(start).toISOString(), finishedAt: null
  }).catch((error) => ({ ok: false, grund: String((error && error.message) || "fehler").slice(0, 120) }));

  // Ausschliesslich der explizite Operator ergaenzt neu autorisierte Quellen.
  // Erst nach Fensterreservierung und echter Startquittung; kein Journalreset.
  let operatorErgaenzung = null;
  if (operator) {
    try {
      if (startQuittung?.ok !== true || !arbeitsfenster || !quellenArbeitsfenster.freigabeGueltig(arbeitsfenster))
        throw Error("operator-fenster-nicht-bestaetigt");
      operatorErgaenzung = new Date(start).toISOString().slice(0, 10) === "2026-11-17"
        ? await require("./quellen-operatorplanung").ergaenze({
          jetztMs: start, deadlineMs: Math.min(start + deadlineMs - 10000, Date.now() + 20000) })
        : { ok: true, neu: 0, grund: "kein-beauftragter-planungszusatz" };
      if (operatorErgaenzung?.ok !== true) throw Error("operator-planung-nicht-bestaetigt");
    } catch (_) {
      const ende = await storageModul.schreibeWarteschlangenLaufquittung({
        process: quittungsProzess, runId: laufkennung, mode: "warteschlange",
        location: helmutExecLocation(), status: "failed", startedAt: new Date(start).toISOString(),
        finishedAt: new Date().toISOString(), reason: "operator-planung-nicht-bestaetigt",
        zielmenge: 0, fehlgeschlagen: 0, processed: 0,
        fehlerklasse: "planung-nicht-bestaetigt" }).catch(() => ({ ok: false }));
      return { ok: false, grund: "operator-planung-nicht-bestaetigt",
        lauftelemetrie: { status: "failed", ende: ende.ok === true } };
    }
  }

  // PLANUNGSANTEIL: gedeckelt, damit eine langsame Planung nie den gesamten Slot frisst.
  // Die Grenze liegt IN `planeArbeit`, nicht als `withTimeout`/Promise.race hier: ein Race
  // beendet die Planungs-Promise nicht. Der alte Pfad konnte deshalb `neu: 0` quittieren,
  // waehrend derselbe Planer nach der Antwort weiter Auftraege schrieb. Die kooperative
  // Grenze wartet den einen bereits gestarteten, selbst zeitbegrenzten Enqueue-Aufruf ab
  // und beginnt danach keinen weiteren. Reicht die Zeit nicht, wird der tatsaechliche
  // Teilstand EHRLICH gemeldet und trotzdem gearbeitet — die Warteschlange traegt ja
  // bereits Auftraege aus frueheren Laeufen.
  const planBudgetMs = Math.min(60000, Math.floor(deadlineMs * 0.25));
  // Der Fenstermodus nimmt zuerst den gespeicherten Tagesplanrest auf. Nur wenn
  // noch kein Tagesjournal existiert, darf er einmalig einen neuen Plan erstellen.
  // Folgetermine berechnen keinen neuen Quellenbedarf und erzeugen keine neuen Abruffenster.
  const plane = arbeitsfenster ? scalablePipeline.setzePlanungFort : scalablePipeline.planeArbeit;
  const plan = await plane({
    jetztMs: start,
    planungsDeadlineMs: Math.min(start + deadlineMs - 10000, Date.now() + planBudgetMs),
    ...(arbeitsfenster ? { darfNeuPlanen: true, ganztags: arbeitsfenster.ganztags === true } : {})
  }).catch((error) => ({
    ok: false,
    grund: "planung-fehler",
    fehler: error && error.message,
    // Keine erfundenen Nullzaehler: bei einem unerwarteten Abbruch ist unbekannt, wie
    // viele idempotente Einreihungen vor dem Fehler bereits die Datenbank erreicht haben.
    zaehlerVollstaendig: false
  }));

  // WIEDERVORLAGE VOR DER ARBEIT (OP-30, Befund O5). Endgueltig gescheiterte Auftraege
  // blockieren ihre Dokumentmenge dauerhaft, weil der Idempotenzschluessel des Verstehens
  // kein Fenster traegt und die Bereinigung `fehlgeschlagen` bewusst stehen laesst. Sie
  // werden deshalb BEGRENZT oft wieder vorgelegt — vor dem Arbeiten, damit sie noch in
  // diesem Slot drankommen. Fehlt die Migration 20260809, meldet der Aufruf das ehrlich
  // und aendert nichts.
  if (operatorErgaenzung) plan.operatorErgaenzung = operatorErgaenzung;

  const wieder = arbeitsfenster && !plan.neuGeplant
    ? { uebersprungen: true, grund: "fortsetzung-ohne-wiedervorlage" }
    : await scalablePipeline.wiedervorlage({ trockenlauf: false })
    .catch((error) => ({ verfuegbar: false, grund: String((error && error.message) || "fehler").slice(0, 200) }));

  // ZIELARCHITEKTUR (2026-08-13): OUTBOX-ABGLEICH + VERSAND, beide bei Dispatch off ein
  // reiner No-Op. Der Abgleich ist das Sicherheitsnetz (ausfuehrbare Auftraege ohne gueltige
  // Versandabsicht werden erneut vorgemerkt, Absichten terminaler Auftraege geschlossen);
  // der Versand stellt faellige Wecksignale zu — im shadow-Modus beweisbar ohne dass etwas
  // den Prozess verlaesst. Der Cron bleibt in JEDEM Modus zusaetzlich Drain (Rueckfallweg,
  // Auftrag §14.9): doppelte Arbeit ist durch den atomaren Claim ausgeschlossen.
  const outboxAbgleich = await jobDispatch.abgleich({ limit: 200 })
    .catch((error) => ({ verfuegbar: false, grund: String((error && error.message) || "fehler").slice(0, 200) }));
  const weckVersand = await jobDispatch.versendeAbsichten({ limit: 100 })
    .catch((error) => ({ versendet: 0, fehlgeschlagen: 0, grund: String((error && error.message) || "fehler").slice(0, 200) }));

  // WORKERBETRIEB STATT DIREKTAUFRUF (OP-30, Befund O2). Bis hierher rief der Cron
  // `scalable-pipeline.arbeite` direkt auf — `lib/helmut/worker-betrieb.js` war damit im
  // Betrieb tot: begrenzte Parallelitaet, der Riegel gegen externen Abruf bei
  // `HELMUT_SOURCE_MODE=off`, Health und Readiness waren gebaut, aber unerreichbar, und die
  // vier `HELMUT_WORKER_*`-Variablen wirkungslos. Jetzt ist der Workerbetrieb die EINE
  // Betriebsform; der Cron ist einer seiner beiden Aufrufer (der andere waere ein
  // langlaufender Prozess — das bleibt Betreiberentscheidung, siehe workerbetrieb.md).
  //
  // Die Grenzen des Slots gibt der Cron vor: er allein kennt seine Restzeit. Sie laufen
  // durch dieselbe Klemmung wie Umgebungswerte.
  const durchlauf = await workerBetrieb.durchlauf({
    kennung: laufkennung,
    arbeitsfenster,
    // Solange auch nur Planrest fehlt, ist die Menge der Vorbedingungen noch
    // unbekannt. Keine Projektion/Materialisierung auf einer unvollstaendigen Basis.
    typen: arbeitsfenster && !(plan?.ok === true && plan.ausstehend === 0)
      ? ["source_fetch", "document_understanding"] : null,
    grenzen: {
      // Abschlussreserve wie in der globalen Phase (K8): der letzte Auftrag darf nicht mitten
      // im Abschlussschreiben in das aeussere Zeitlimit laufen.
      budgetMs: Math.max(1, verbleibend() - 10000),
      leaseMs: 300000,
      stapel: Math.max(1, Number(process.env.HELMUT_WORKER_BATCH) || 10)
    },
    // OP-30/O1: der Tagesplan liefert die Bereichsdeckel (`scopeMax`) der Budgetschicht.
    tagesplan: (plan && plan.tagesplan) || (arbeitsfenster
      ? await scalablePipeline.tagesplanFuerLauf({ jetztMs: start }).catch(() => null) : null),
    // BELEGTER FEHLER (Abschlussreview 2026-08-08): der Worker holte `buildV3Briefing` aus
    // `lib/helmut/briefingContract.js`, wo dieser Name nicht existiert — die Funktion steht
    // hier in `server.js`. Jeder Briefingauftrag scheiterte deshalb mit
    // `require(...)[name] is not a function`. Sie wird jetzt eingereicht, statt sie zu
    // suchen; verschoben wird nichts (kein Umbau bestehender V3-Logik).
    deps: { buildV3Briefing }
  });

  // Die Gesamtbilanz des Durchlaufs — dieselben Felder wie zuvor der Einzelworker, damit
  // Auswertung und Tests unveraendert lesen koennen.
  const bilanz = {
    ...durchlauf,
    verfuegbar: Array.isArray(durchlauf.bilanzen) && durchlauf.bilanzen.length
      ? durchlauf.bilanzen.some((b) => b && b.verfuegbar !== false)
      : false,
    verarbeitet: (durchlauf.erledigt || 0) + (durchlauf.wiederholt || 0)
      + (durchlauf.endgueltigFehlgeschlagen || 0)
  };

  const status = await scalablePipeline.betriebsstatus({ seitMinuten: 1440 }).catch(() => null);

  // ── ABSCHLUSSQUITTUNG (OP-30 Option D): dieselbe (run_id, process)-Zeile wie der
  // Startbeleg, atomar ueberschrieben — Zaehlwerte, Status und Fehlerklasse relational und
  // blob-unabhaengig. Der Status ist EHRLICH: ein Slot, der reserviert hat und nichts
  // abschloss, ist `partial` mit Klasse `lease-ohne-fortschritt` (genau das Bild des
  // Aktivierungslaufs 18.08.), kein Erfolg.
  const planFehlgeschlagen = !(plan && plan.ok !== false);
  const spiegelD = durchlauf.blobSpiegel || {};
  const spiegelVerworfen = Math.max(0, Number(spiegelD.verworfen) || 0);
  // Nur diese enge, bestaetigte Teilbilanz darf ein automatisches Folgefenster
  // zulassen. Ein Zeitlimit darf andere Worker-/Speicherfehler nicht verdecken.
  const planFortsetzbar = Boolean(arbeitsfenster && plan?.grund === "planung-zeitbudget" && plan.ausstehend > 0
    && bilanz.verfuegbar === true && durchlauf.bilanzen.every(b => b?.verfuegbar === true)
    && bilanz.endgueltigFehlgeschlagen === 0 && bilanz.leaseVerloren === 0
    && durchlauf.bilanzen.every(b => ["nichtUebernommen", "zurueckstellungNichtVerfuegbar", "stapelrestNichtZurueckgegeben"]
      .every(k => b[k] === 0))
    && spiegelD.geschrieben !== false && spiegelVerworfen === 0
    && ((plan.neu || 0) + (plan.vorhanden || 0) > 0 || bilanz.erledigt > 0));
  const quittungsStatus = planFortsetzbar ? "partial" : planFehlgeschlagen || bilanz.verfuegbar === false
    ? "failed"
    : ((bilanz.endgueltigFehlgeschlagen || 0) > 0 || ((bilanz.reserviert || 0) > 0 && (bilanz.erledigt || 0) === 0)
      ? "partial" : "success");
  const quittungsFehlerklasse = planFehlgeschlagen
    ? ((plan && plan.grund === "planung-zeitbudget") ? "planung-zeitbudget" : "planung-fehlgeschlagen")
    : (bilanz.verfuegbar === false
      ? "warteschlange-nicht-verfuegbar"
      : ((bilanz.reserviert || 0) > 0 && (bilanz.erledigt || 0) === 0
        ? "lease-ohne-fortschritt"
        : ((bilanz.endgueltigFehlgeschlagen || 0) > 0 ? "auftraege-endgueltig-fehlgeschlagen" : null)));
  const endQuittung = await storageModul.schreibeWarteschlangenLaufquittung({
    process: quittungsProzess, runId: laufkennung, mode: "warteschlange",
    location: helmutExecLocation(), status: quittungsStatus,
    startedAt: new Date(start).toISOString(), finishedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    zielmenge: bilanz.reserviert || 0, processed: bilanz.erledigt || 0,
    // Bestaetigt zurueckgegebene Stapelreste sind reserviert und bleiben wartend.
    deferred: (bilanz.zurueckgestellt || 0) + (bilanz.stapelrestZurueckgegeben || 0),
    fehlgeschlagen: bilanz.endgueltigFehlgeschlagen || 0,
    wiederholt: bilanz.wiederholt || 0, leaseVerloren: bilanz.leaseVerloren || 0,
    // Nur bekannte Zaehler persistieren. Ein fehlender Wert bleibt SQL NULL; `0` ist
    // ausschliesslich die belegte Zahl null, nie der Rueckfall fuer "unbekannt".
    ...(Number.isFinite(plan && plan.geplant) ? { geplant: plan.geplant } : {}),
    ...(Number.isFinite(plan && plan.neu) ? { neuGeplant: plan.neu } : {}),
    // Bestehende Semantik bewahren: gespeichert wird die wirklich in den Spiegel
    // aufgenommene Menge. Die davor gesehene Gesamtmenge ergibt sich bei Ueberlauf
    // aus diesem Wert plus dem strukturierten `reason`-Zaehler.
    spiegelGesammelt: spiegelD.gesammelt ?? 0,
    spiegelGeschrieben: spiegelD.geschrieben === true ? (spiegelD.neuImBlob ?? 0) : null,
    fehlerklasse: quittungsFehlerklasse,
    reason: planFortsetzbar ? "planung-zeitbudget-fortsetzbar" : planFehlgeschlagen
      ? String((plan && plan.grund) || "planung-fehlgeschlagen").slice(0, 120)
      : (spiegelD.geschrieben === false
        ? "blob-spiegel-fehlgeschlagen"
        // Kein neues Schema/noetige Migration: `reason` ist der bestehende technische
        // Kanal der relationalen Laufquittung. Der Motor liest diesen Wert und macht den
        // bis hierher toten Ueberlaufzaehler als Hinweis sichtbar.
        : (spiegelVerworfen > 0
          ? `blob-spiegel-ueberlauf:${spiegelVerworfen}`
          : ((!bilanz.verfuegbar && durchlauf.grund) ? String(durchlauf.grund).slice(0, 120) : null)))
  }).catch((error) => ({ ok: false, grund: String((error && error.message) || "fehler").slice(0, 120) }));

  console.log(`[cron/${cronName}/warteschlange] ${Date.now() - start}ms`
    + ` geplant=${Number.isFinite(plan && plan.geplant) ? plan.geplant : "unbekannt"}`
    + ` neu=${Number.isFinite(plan && plan.neu) ? plan.neu : "unbekannt"}`
    + ` ausstehend=${Number.isFinite(plan && plan.ausstehend) ? plan.ausstehend : "unbekannt"}`
    + ` worker=${durchlauf.worker} erledigt=${bilanz.erledigt} wiederholt=${bilanz.wiederholt}`
    + ` endgueltigFehler=${bilanz.endgueltigFehlgeschlagen}`
    + ` wiedervorgelegt=${(wieder && wieder.wiedervorgelegt) ?? "n/v"}`
    + ` rotation=${(plan && plan.tagesplan && plan.tagesplan.plaetze) || 0}`
    + ` dispatch=${jobDispatch.dispatchModus()}`
    + ` weckVersand=${weckVersand.versendet || 0}/${weckVersand.vergeben || 0}`
    + ` spiegel=${spiegelD.geschrieben == null ? "leer" : (spiegelD.geschrieben ? `ok:${spiegelD.neuImBlob ?? "?"}` : "FEHLER")}`
    + ` spiegelVerworfen=${spiegelVerworfen}`
    + ` quittung=${startQuittung && startQuittung.ok ? "start-ok" : "start-fehler"}/${endQuittung && endQuittung.ok ? "ende-ok" : "ende-fehler"}`
    + ` zustand=${(status && status.zustand) || "unbekannt"} lauf=${laufkennung}`);

  // EHRLICHER GESAMTAUSGANG (CLAUDE.md §4.4): ein Lauf ist nur dann ok, wenn geplant UND
  // gearbeitet werden konnte. Eine nicht erreichbare Warteschlange ist kein stiller Erfolg.
  return {
    ok: Boolean(plan && plan.ok !== false) && bilanz.verfuegbar !== false,
    pfad: "warteschlange",
    tenants: Number.isFinite(plan && plan.profile) ? plan.profile : null,
    durationMs: Date.now() - start,
    lauf: { laufId: laufkennung },
    planung: plan,
    ...(operatorErgaenzung ? { operatorErgaenzung } : {}),
    verarbeitung: bilanz,
    wiedervorlage: wieder,
    // Zielarchitektur: Dispatch-Sicht dieses Laufs (off => beide uebersprungen).
    outboxAbgleich,
    weckVersand,
    // OP-30 Option D: Ausgang der blob-unabhaengigen Slot-Quittung — sichtbar, nie verworfen.
    lauftelemetrie: {
      prozess: quittungsProzess,
      start: Boolean(startQuittung && startQuittung.ok),
      ende: Boolean(endQuittung && endQuittung.ok),
      status: quittungsStatus,
      fehlerklasse: quittungsFehlerklasse,
      ...(startQuittung && startQuittung.ok ? {} : { startGrund: (startQuittung && startQuittung.grund) || "unbekannt" }),
      ...(endQuittung && endQuittung.ok ? {} : { endeGrund: (endQuittung && endQuittung.grund) || "unbekannt" })
    },
    betrieb: status
  };
}

module.exports = { runCronUeberWarteschlange, helmutExecLocation, helmutRunId };
