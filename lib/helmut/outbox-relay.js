"use strict";

// Helmut — OUTBOX-RELAY (Korrekturlauf 2026-08-14/3, Luecke 1).
// =============================================================================================
// DAS PROBLEM: Bis hierher gab es zwar einen Dispatcher (`job-dispatch.versendeAbsichten`),
// aber niemanden, der ihn im Betrieb regelmaessig ANSTOESST — ausser den Vercel-Cron-Slots
// und, im Test, einer manuellen Schleife. Damit war der Cron fuer den normalen Fortgang einer
// Auftragskette weiterhin erforderlich. Genau das soll er nicht sein.
//
// DIE LOESUNG — DER KLEINSTE SICHERE WEG, in zwei Ausloesern und einem Sicherheitsnetz:
//
//   A) UNMITTELBARER RELAY (Ereignis): Nachdem ein Verbraucher einen Auftrag ABGESCHLOSSEN
//      hat, sind die Folgeauftraege samt Versandabsicht bereits atomar in der Datenbank.
//      Der Verbraucher stoesst danach GENAU EINEN Relaylauf an — asynchron, ohne auf ihn zu
//      warten. Das ist die Kette: Auftrag fertig -> Folgeabsicht -> Relay -> SQS -> naechster
//      Auftrag. Kein Cron beteiligt.
//
//   B) ZEITGEBER (Zeit): Ein EventBridge-Scheduler ruft den Relay minuetlich. Er traegt
//      (1) SPAETER faellige Auftraege (Backoff, Wiedervorlage, geplante Fenster) und
//      (2) die automatische REPARATUR eines verlorenen unmittelbaren Relays.
//      1.440 Aufrufe/Tag — eine feste, winzige Grundlast (Kostenklasse siehe Belegdatei).
//
//   C) SICHERHEITSNETZ: `helmut_outbox_abgleich` legt fehlende Absichten an und oeffnet
//      haengende wieder. Es bleibt das dritte Netz, nicht der Antrieb.
//
// KEINE AUFRUFVERSTAERKUNG: Der Relay ruft sich NIE selbst auf. Ein Verbraucherlauf loest
// hoechstens EINEN Relaylauf aus (nicht einen je Nachricht), und der Relay ist zusaetzlich
// durch die reservierte Lambda-Parallelitaet gedeckelt. Ein Relaylauf sendet hoechstens
// `limit` Nachrichten und endet.
//
// DER RELAY TRAEGT KEINE FACHARBEIT: er liest ausschliesslich die Outbox, ruft den Transport
// und verbucht das Ergebnis. Er kennt keinen Auftragstyp, keinen Handler, kein Mandat.
//
// DISJUNKTE ABSICHTEN: `helmut_outbox_naechste` vergibt mit `FOR UPDATE SKIP LOCKED` — zwei
// gleichzeitige Relayinstanzen bekommen garantiert verschiedene Absichten (bewiesen in
// jobqueue-outbox-datenbank-test §8: 8 gleichzeitige Dispatcher, 0 Doppelvergaben).
//
// AUSGAENGE (identisch zum Dispatcher, weil es DERSELBE Dispatcher ist):
//   * Erfolg           -> Absicht bestaetigt
//   * eindeutiger Fehler -> Fehlversuch verbucht (Backoff, spaeter Quarantaene)
//   * unbekannter Ausgang -> Absicht ZURUECKGELEGT: nichts verloren, kein Versuch verbrannt

const jobDispatch = require("./job-dispatch");

// Wie viele Absichten ein einzelner Relaylauf hoechstens zustellt. Bewusst klein: ein Lauf
// soll kurz sein und oft stattfinden, statt selten und lang (kuerzere Lease, schnellere
// Wiederholung, kleinere Blastradius bei einem Absturz).
const RELAY_STAPEL = 50;

// Der Relay haelt eine eigene Klassen-Lease, damit nicht beliebig viele Relayinstanzen
// gleichzeitig laufen. Sie ist NICHT die Sicherung gegen Doppelversand (das leistet
// SKIP LOCKED), sondern die Sicherung gegen Aufruflawinen.
const RELAY_KLASSE = "outbox-relay";
const RELAY_LEASE_MS = 60000;

// ── Ein Relaylauf ─────────────────────────────────────────────────────────────────────────────
// Rueckgabe ist bewusst sprechend, damit der Aufrufer (Lambda, Route, Test) OHNE Fachwissen
// entscheiden kann, ob sofort noch ein Lauf sinnvoll ist.
async function relayLauf({ env = process.env, deps = {}, limit = RELAY_STAPEL } = {}) {
  const start = (deps.now || Date.now)();

  // Der Relay arbeitet nur, wenn der Ereignis-Antrieb ueberhaupt gewaehlt ist. Sonst waere
  // er ein zweiter, stiller Antrieb neben dem Cron — genau das, was `waehleAntrieb`
  // verhindert (es gibt immer GENAU EINEN primaeren Antrieb).
  const antrieb = (deps.waehleAntrieb || jobDispatch.waehleAntrieb)(env);
  if (antrieb.antrieb !== "ereignis") {
    return {
      gelaufen: false, grund: `antrieb-${antrieb.antrieb}`,
      versendet: 0, widersprueche: antrieb.widersprueche
    };
  }

  // Klassen-Lease: greift nur, wenn die verteilten Grenzen aktiv sind. Fehlt der Adapter
  // (Flag aus), laeuft der Relay ungedeckelt — das ist derselbe fail-closed-Kompromiss wie
  // im uebrigen Motor und wird im Ergebnis benannt.
  const klassen = deps.klassen !== undefined
    ? deps.klassen
    : require("./scalable-pipeline").klassenAdapter({
        env, owner: jobDispatch.verbraucherKennung("relay"), deps
      });

  let slot = null;
  if (klassen) {
    const lease = await klassen.belege(RELAY_KLASSE, { ttlMs: RELAY_LEASE_MS });
    if (!lease || lease.erlaubt !== true) {
      // Ein anderer Relay laeuft bereits. Das ist KEIN Fehler: er nimmt dieselben faelligen
      // Absichten mit. Nichts tun ist hier die richtige Antwort.
      return { gelaufen: false, grund: "relay-belegt", versendet: 0 };
    }
    slot = lease.slot;
  }

  try {
    const bilanz = await (deps.versendeAbsichten || jobDispatch.versendeAbsichten)({
      env, deps, limit
    });
    return {
      gelaufen: true,
      grund: null,
      versendet: bilanz.versendet || 0,
      fehlgeschlagen: bilanz.fehlgeschlagen || 0,
      zurueckgelegt: bilanz.zurueckgelegt || 0,
      vergeben: bilanz.vergeben || 0,
      transport: bilanz.transport || null,
      // WEITERE ARBEIT? Wenn der Lauf sein Limit ausgeschoepft hat, liegt vermutlich noch
      // mehr an. Der AUFRUFER entscheidet, ob er erneut laeuft — der Relay ruft sich nie
      // selbst auf (keine Rekursion, keine Aufrufverstaerkung).
      weitereArbeitWahrscheinlich: (bilanz.vergeben || 0) >= limit,
      dauerMs: (deps.now || Date.now)() - start,
      gedeckelt: Boolean(klassen)
    };
  } finally {
    if (klassen && slot) await klassen.gebeFrei(slot).catch(() => {});
  }
}

// ── Mehrere Laeufe in einem Aufruf (Zeitgeber-Modus) ──────────────────────────────────────────
// Der minuetliche Zeitgeber soll einen aufgelaufenen Rueckstand nicht in Minutenschritten
// abtragen. Er darf deshalb MEHRERE Laeufe hintereinander machen — aber hart gedeckelt:
// nie mehr als `maxLaeufe`, und Schluss, sobald ein Lauf nichts mehr zu tun hat. Das ist
// eine SCHLEIFE MIT OBERGRENZE, keine Rekursion und keine Warteschleife.
async function relaySchleife({ env = process.env, deps = {}, limit = RELAY_STAPEL, maxLaeufe = 5 } = {}) {
  const laeufe = [];
  let versendet = 0;
  for (let i = 0; i < Math.max(1, maxLaeufe); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const lauf = await relayLauf({ env, deps, limit });
    laeufe.push(lauf);
    versendet += lauf.versendet || 0;
    if (!lauf.gelaufen || !lauf.weitereArbeitWahrscheinlich) break;
  }
  return { laeufe: laeufe.length, versendet, letzter: laeufe[laeufe.length - 1] || null };
}

// ── Der ZEITGEBERLAUF: Sicherheitsnetz + Schleife in EINEM Aufruf ─────────────────────────────
// Warum das Netz HIER haengt und nicht mehr nur am Vercel-Cron: `helmut_outbox_abgleich` ist
// die automatische Reparatur eines verlorenen Anstosses (Zusage 15). Laege sie ausschliesslich
// im Cron, waere der Cron fuer den sicheren Betrieb doch wieder erforderlich — genau das soll
// er nicht sein. Der minuetliche Zeitgeber traegt deshalb beides:
//   1. das Netz (fehlende Absichten anlegen, verwaiste wieder oeffnen, terminale schliessen),
//   2. den eigentlichen Versand.
// Das Netz ist GEDECKELT (`limit`) und darf nie den Versand verhindern: schlaegt es fehl,
// wird das im Ergebnis benannt und der Versand laeuft trotzdem.
async function zeitgeberLauf({
  env = process.env, deps = {}, limit = RELAY_STAPEL,
  maxLaeufe = 5, abgleichLimit = 200, mindestalterMinuten = 10
} = {}) {
  let abgleich = { gelaufen: false, grund: "abgeschaltet" };
  if (deps.abgleichAktiv !== false) {
    abgleich = await (deps.abgleichLauf || jobDispatch.abgleich)({
      env, deps, limit: abgleichLimit, mindestalterMinuten
    }).then((r) => ({ gelaufen: true, ...r }))
      .catch((fehler) => ({
        gelaufen: false,
        grund: require("./scalable-pipeline").bereinigeFehler(fehler, 200) || "unbekannt"
      }));
  }
  const versand = await relaySchleife({ env, deps, limit, maxLaeufe });
  return { ...versand, abgleich };
}

// ── Der UNMITTELBARE Ausloeser ────────────────────────────────────────────────────────────────
// Wird vom Verbraucher NACH dem belegten Datenbankabschluss aufgerufen. Er darf NIE
// blockieren, NIE werfen und NIE das Ergebnis des Auftrags beeinflussen: die Arbeit ist
// bereits persistiert, dies ist nur noch die Klingel fuer den naechsten Schritt.
//
// In AWS ist `deps.loeseAus` ein asynchroner Lambda-Aufruf (InvocationType: Event) —
// die Verbraucher-Invocation wartet also NICHT auf den Relay. Lokal und im Test ist es der
// direkte Aufruf von `relayLauf`.
//
// GEHT DIESER ANSTOSS VERLOREN (Lambda-Drosselung, Absturz, Netzfehler), repariert ihn der
// minuetliche Zeitgeber automatisch — die Absicht liegt ja bereits in der Outbox.
async function stosseRelayAn({ env = process.env, deps = {} } = {}) {
  try {
    if (typeof deps.loeseAus === "function") {
      await deps.loeseAus();
      return { angestossen: true, weg: "ausloeser" };
    }
    // ── KEIN STILLER RUECKFALL AUF DIREKTVERSAND (Verkabelungslauf 2026-08-14/4) ──────────
    // Wer `direktVerboten` setzt, sagt damit: "ich BIN nicht der Absender". Genau das gilt
    // fuer die Verbraucher-Lambda — sie hat weder die Queue-Adresse noch `sqs:SendMessage`.
    // Ohne diesen Riegel liefe sie in `relayLauf`, faende dort keinen Transport und meldete
    // "nichts zu tun": ein Fehlschlag, der wie Erfolg aussieht. Jetzt ist er benannt.
    if (deps.direktVerboten === true) {
      return { angestossen: false, weg: "keiner", grund: "relay-nicht-konfiguriert" };
    }
    // Ohne eigenen Ausloeser: unmittelbar selbst laufen (lokaler Betrieb, Tests, Route).
    const lauf = await relayLauf({ env, deps });
    return { angestossen: true, weg: "direkt", versendet: lauf.versendet || 0, lauf };
  } catch (fehler) {
    // BEWUSST GESCHLUCKT: ein fehlgeschlagener Anstoss darf einen erledigten Auftrag nie
    // in einen Fehler verwandeln. Der Zeitgeber holt es nach.
    return {
      angestossen: false,
      grund: require("./scalable-pipeline").bereinigeFehler(fehler, 200) || "unbekannt"
    };
  }
}

module.exports = {
  RELAY_STAPEL,
  RELAY_KLASSE,
  RELAY_LEASE_MS,
  relayLauf,
  relaySchleife,
  zeitgeberLauf,
  stosseRelayAn
};
