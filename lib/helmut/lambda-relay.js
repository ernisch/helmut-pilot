"use strict";

// Helmut — LAMBDA-EINSTIEG DES OUTBOX-RELAYS (Korrekturlauf 2026-08-14/3).
// =============================================================================================
// Zwei Ausloeser, ein Handler:
//   * EventBridge Scheduler (minuetlich)  -> traegt SPAETER faellige Arbeit und repariert
//                                            einen verlorenen unmittelbaren Anstoss,
//   * asynchroner Lambda-Aufruf des Verbrauchers -> stellt die UNMITTELBAREN Folgeauftraege
//                                            einer Kette zu.
// Beide Wege laufen durch denselben Code; der Handler unterscheidet sie nur fuer das
// Protokoll. Es gibt KEINEN rekursiven Selbstaufruf und keine Warteschleife.
//
// Der Relay traegt ausschliesslich SIGNALE: er liest die Outbox, ruft den Transport und
// verbucht das Ergebnis. Er fuehrt niemals Facharbeit aus (kein Handler, kein Modell, kein
// Quellenabruf) — das ist im Vertragstest per Quelltextpruefung festgeschrieben.
//
// PROTOKOLL OHNE NUTZDATEN: nur Zahlen und Ausgaenge, nie eine Auftrags-, Mandats- oder
// Quellenkennung.

const lambdaKonfiguration = require("./lambda-konfiguration");
const outboxRelay = require("./outbox-relay");

async function handler(ereignis = {}, kontext = {}, deps = {}) {
  const env = deps.env || process.env;
  const log = deps.log || console.log;
  const start = (deps.now || Date.now)();
  const ausloeser = ereignis && ereignis.ausloeser === "verbraucher" ? "verbraucher" : "zeitgeber";

  // Auch der Relay braucht die Supabase-Verbindung — er liest und schreibt die Outbox.
  // Fehlt sie, wird NICHTS behauptet: der naechste Zeitgeberlauf versucht es erneut.
  if (deps.konfiguration !== false) {
    const konfig = deps.konfiguration || lambdaKonfiguration;
    try {
      if (String(env.HELMUT_SUPABASE_URL_PARAMETER || "").trim()) {
        await konfig.stelleKonfigurationSicher({ env, deps: deps.konfigurationDeps || {} });
      }
      if (deps.supabasePflicht !== false && !konfig.supabaseBereit(env)) {
        log(`[lambda/relay] ausloeser=${ausloeser} ausgang=konfiguration-fehlt`);
        return { gelaufen: false, grund: "supabase-nicht-verbunden" };
      }
    } catch (fehler) {
      log(`[lambda/relay] ausloeser=${ausloeser} ausgang=konfiguration-fehler`
        + ` ursache=${(fehler && fehler.helmutUrsache) || "unbekannt"}`);
      return { gelaufen: false, grund: "konfiguration-nicht-geladen" };
    }
  }

  // Der ZEITGEBER darf einen Rueckstand in mehreren Laeufen abtragen (hart gedeckelt).
  // Der VERBRAUCHER-Anstoss macht genau EINEN Lauf — die Kette traegt sich ueber die
  // Folgeaufträge selbst weiter, jeder Schritt stoesst wieder genau einmal an.
  const relay = deps.relay || outboxRelay;
  // Der ZEITGEBER traegt zusaetzlich das Sicherheitsnetz (`helmut_outbox_abgleich`) — nur so
  // ist die automatische Reparatur eines verlorenen Anstosses NICHT vom Vercel-Cron abhaengig.
  const ergebnis = ausloeser === "zeitgeber"
    ? await relay.zeitgeberLauf({ env, deps: deps.relayDeps || {}, maxLaeufe: Number(env.HELMUT_RELAY_MAX_LAEUFE) || 5 })
    : { laeufe: 1, ...(await relay.relayLauf({ env, deps: deps.relayDeps || {} })) };

  log(`[lambda/relay] ausloeser=${ausloeser} laeufe=${ergebnis.laeufe || 1}`
    + ` versendet=${ergebnis.versendet || 0}`
    + ` abgleich=${(ergebnis.abgleich && ergebnis.abgleich.gelaufen) ? "ok" : "-"}`
    + ` dauerMs=${(deps.now || Date.now)() - start}`);
  return ergebnis;
}

module.exports = { handler };
