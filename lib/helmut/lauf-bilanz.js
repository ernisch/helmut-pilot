"use strict";

// Helmut — KANONISCHE LAUFBILANZ eines Verstehenslaufs.
// =====================================================================================
// BELEGTER ANLASS (natuerlicher Understanding-Lauf 2026-08-30, 21:30:04–21:33:45 UTC,
// Production-Commit afc807e0): Die Laufquittung meldete `success`, obwohl die
// Fachtelemetrie desselben Laufs `ergebnisse.skipped-error = 1` und
// `gruppen.fehlgeschlagen = 1` auswies — der ausdruecklich erneut freigegebene Vorgang
// endete nach seinem dritten bezahlten Modellaufruf wieder in `unbekannt`. Gleichzeitig
// standen die relationalen Hauptzaehler `saved_count`/`skipped_count`/`failed_count`
// auf 0, obwohl 18 Ergebnisse gespeichert und 1 Fall gescheitert war.
//
// ZWEI URSACHEN, beide hier geschlossen:
//   1. Der Gesamtstatus wurde ALLEIN aus `result.skipped` abgeleitet
//      (`result.skipped ? "blocked" : "success"`). Ein Teilerfolg MIT Fehlerfall hatte
//      damit gar keine Ausdrucksform — obwohl `partial` und `failed` im
//      CHECK-Constraint der Tabelle `process_runs` seit dem 27.07. vorgesehen sind und
//      der Lage-Briefing-Cron sie seit Befund R3 auch benutzt.
//   2. Die skalaren Zaehler wurden schlicht NICHT uebergeben. Sie wurden dadurch nicht
//      etwa unbekannt, sondern in der relationalen Projektion zu einer harten 0
//      (Befund `num(null) === 0`, in blob-relational.js getrennt behoben) — eine
//      Aussage, die der Lauf nie gemacht hat.
//
// DIE EINE REGEL: Es gibt genau EINE Zaehlerwahrheit, und das ist die bereits
// vorhandene Fachtelemetrie aus `buildOutcomeTelemetry` (Gruppenkarte
// `ERGEBNISGRUPPEN`). Dieses Modul LEITET daraus ab — es zaehlt nicht selbst noch
// einmal parallel ueber `results` und kennt keine eigene Ergebnisklasse. Faellt eine
// Ergebnisart aus der Gruppenkarte, landet sie dort in `gruppen.unbekannt` und wird
// hier als Fehler gewertet: ein nicht abrechenbares Ergebnis darf nie still als Null
// oder als Erfolg erscheinen (CLAUDE.md §4.4 „Kein falsches Gruen").
//
// DSGVO: ausschliesslich Zahlen und die kanonischen, inhaltsfreien Ergebnisschluessel
// (`skipped-error`, `cluster-error`, …). Kein Dokumenttext, keine KI-Ausgabe, kein
// Rohfehlertext, keine Kennung.

const { ERGEBNISGRUPPEN } = require("./understanding");

// Zuordnung der Ergebnisgruppen auf die vier disjunkten Hauptzaehler der Laufquittung.
// Jede Gruppe aus `buildOutcomeTelemetry` steht in GENAU EINEM Eimer — daraus folgt die
// pruefbare Identitaet  gespeichert + uebersprungen + fehlgeschlagen + vertagt = cluster.
const EIMER = Object.freeze({
  // Ein Vorgang ist entstanden oder fortgeschrieben worden.
  gespeichert: Object.freeze(["verarbeitet"]),
  // Bewusste, erfolgreiche Nicht-Verarbeitung: an einen Bestandsvorgang gehaengt,
  // echtes Duplikat, dauerhaft aussortiert. Kein Fehler, kein Rueckstand.
  uebersprungen: Object.freeze(["zusammengefuehrt", "duplikate", "ausgeschlossen"]),
  // Echte Fehlerfaelle — einschliesslich `unbekannt`: eine Ergebnisart, die die
  // Gruppenkarte nicht kennt, ist nicht abrechenbar und deshalb nie „gruen".
  fehlgeschlagen: Object.freeze(["fehlgeschlagen", "unbekannt"]),
  // Vertagt wegen Zeit, Budget, Sperre oder fehlender Belegdokumente. BLEIBT SEPARAT
  // sichtbar und wird NIE als technischer Fehler gezaehlt (Restzeitwache §29).
  vertagt: Object.freeze(["erneut"])
});

const GRUPPEN_ALLE = Object.freeze(Object.values(EIMER).flat());

// Kanonische Zustaende der Tabelle `process_runs` (CHECK-Constraint, Migration
// 20260727_process_runs_relational.sql). Hier entstehen nur diese vier.
const STATUS = Object.freeze({
  SUCCESS: "success",
  PARTIAL: "partial",
  FAILED: "failed",
  BLOCKED: "blocked"
});

const zahl = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function summe(gruppen, namen) {
  let s = 0;
  for (const name of namen) s += Math.max(0, zahl(gruppen[name]) ?? 0);
  return s;
}

// Die klassifizierte Fehlerangabe eines Laufs: der HAEUFIGSTE fehlerhafte
// Ergebnisschluessel der Fachtelemetrie — ein fester, inhaltsfreier Code aus der
// Gruppenkarte, nie ein Rohtext und nie eine Kennung. Ergebnisarten, die die
// Gruppenkarte nicht kennt, werden als solche benannt (`ergebnisart-unbekannt:<key>`),
// damit ein unbekannter Ausgang sichtbar bleibt statt sich unter „irgendein Fehler"
// zu verstecken. Deterministisch: bei Gleichstand gewinnt der alphabetisch erste
// Schluessel, damit dieselbe Telemetrie immer dieselbe Fehlerklasse ergibt.
function fehlerklasseAus(ergebnisse, gruppenKarte) {
  if (!ergebnisse || typeof ergebnisse !== "object") return null;
  let beste = null;
  for (const key of Object.keys(ergebnisse).sort()) {
    const n = zahl(ergebnisse[key]) ?? 0;
    if (n <= 0) continue;
    const gruppe = gruppenKarte[key];
    const unbekannteArt = gruppe === undefined;
    if (!unbekannteArt && gruppe !== "fehlgeschlagen") continue;
    const code = unbekannteArt ? `ergebnisart-unbekannt:${key}` : key;
    if (!beste || n > beste.n) beste = { code, n };
  }
  return beste ? beste.code.slice(0, 40) : null;
}

// Die eine Ableitung. `ergebnis` ist das unveraenderte Rueckgabeobjekt von
// `runUnderstandingShadow` bzw. `runPendingUnderstandingShadow`.
//
// Rueckgabe:
//   zaehlbar        false = keine Fachtelemetrie vorhanden ⇒ ALLE Zaehler bleiben null
//                   (nie 0 — eine unbekannte Menge ist keine gemessene Null)
//   gespeichert / uebersprungen / fehlgeschlagen / vertagt   die vier Hauptzaehler
//   cluster         Zielmenge der Fachtelemetrie (Arbeitsliste des Laufs)
//   stimmig         true, wenn die vier Zaehler exakt `cluster` ergeben
//   status          success | partial | failed | blocked
//   fehlerklasse    klassifizierter Code oder null
function laufBilanz(ergebnis = {}, { gruppenKarte = ERGEBNISGRUPPEN } = {}) {
  const leer = {
    zaehlbar: false,
    gespeichert: null, uebersprungen: null, fehlgeschlagen: null, vertagt: null,
    cluster: null, stimmig: null, fehlerklasse: null
  };

  // ORDNUNGSGEMAESS OHNE ARBEIT: kein Store, keine KI, keine Vormerkung, fremde Sperre.
  // Der Lauf hat nichts getan und behauptet auch nichts — `blocked`, Zaehler unbekannt.
  if (ergebnis && ergebnis.skipped) return { ...leer, status: STATUS.BLOCKED };

  const telemetrie = ergebnis && ergebnis.telemetrie && typeof ergebnis.telemetrie === "object"
    ? ergebnis.telemetrie
    : null;
  const gruppen = telemetrie && telemetrie.gruppen && typeof telemetrie.gruppen === "object"
    ? telemetrie.gruppen
    : null;

  // FAIL CLOSED: ein Lauf, der nicht `skipped` ist und trotzdem keine Fachtelemetrie
  // hinterlaesst, ist nicht abrechenbar. Er darf NICHT als Erfolg gebucht werden —
  // genau der stille Ausgang, den dieser Sprint beseitigt.
  if (!gruppen) return { ...leer, status: STATUS.FAILED, fehlerklasse: "telemetrie-fehlt" };

  // UNGUELTIGER ZAEHLERWERT (Review-Befund 2026-08-31): ein VORHANDENER Gruppenwert, der
  // keine nichtnegative Zahl ist, machte `summe()` still zu einer 0 — die Bilanz sah dann
  // vollstaendig aus, war es aber nicht. Ein fehlender Wert bleibt zulaessig (die Gruppe
  // hatte keine Mitglieder); ein KAPUTTER Wert ist ein Telemetriedefekt und macht die
  // gesamte Rechnung unbrauchbar. Dann sind die Zaehler NICHT abrechenbar (alle null) und
  // der Lauf ist fail closed — niemals `success`.
  const ungueltigeZaehler = GRUPPEN_ALLE.filter((name) => {
    const roh = gruppen[name];
    if (roh === undefined || roh === null) return false;
    const n = zahl(roh);
    return n == null || n < 0;
  });
  if (ungueltigeZaehler.length) {
    return { ...leer, status: STATUS.FAILED, fehlerklasse: "telemetrie-unvollstaendig" };
  }

  const gespeichert = summe(gruppen, EIMER.gespeichert);
  const uebersprungen = summe(gruppen, EIMER.uebersprungen);
  const fehlgeschlagen = summe(gruppen, EIMER.fehlgeschlagen);
  const vertagt = summe(gruppen, EIMER.vertagt);
  const gesamt = gespeichert + uebersprungen + fehlgeschlagen + vertagt;

  // `cluster` ist die Zielmenge DER FACHTELEMETRIE (Arbeitsliste), nicht die Zielmenge
  // der Quittung (`zielmenge` = geladene Rohdokumente). Die Identitaet wird deshalb
  // gegen `cluster` geprueft — gegen `zielmenge` waere sie eine andere Einheit.
  const cluster = zahl(telemetrie.cluster);
  const clusterBrauchbar = cluster != null && cluster >= 0;
  const stimmig = clusterBrauchbar ? gesamt === cluster : null;

  // REIHENFOLGE (Review-Befund 2026-08-31): Ein STRUKTURELLER Befund schlaegt den
  // fachlichen. Deckt die Bilanz die Arbeitsliste nicht ab — oder fehlt die Arbeitsliste
  // ganz —, sind die Zahlen als Ganzes nicht belastbar; das muss der Betreiber zuerst
  // sehen. Vorher konnte eine NICHT stimmige Bilanz `success` werden, weil allein
  // `fehlgeschlagen > 0` ueber den Status entschied und `stimmig` nur berichtet wurde.
  let status;
  let fehlerklasse = null;
  if (!clusterBrauchbar) {
    // Ohne brauchbare Zielmenge ist die Identitaet nicht pruefbar. NIE `success`.
    fehlerklasse = "telemetrie-unvollstaendig";
    status = gespeichert > 0 ? STATUS.PARTIAL : STATUS.FAILED;
  } else if (stimmig === false) {
    // Die vier Hauptzaehler decken die Arbeitsliste nicht ab. NIE `success`.
    fehlerklasse = "zaehlerwiderspruch";
    status = gespeichert > 0 ? STATUS.PARTIAL : STATUS.FAILED;
  } else if (fehlgeschlagen > 0) {
    // Teilerfolg mit Fehlerfall ⇒ `partial`. Kam nichts durch, war der Lauf zu keiner
    // belastbaren Verarbeitung faehig ⇒ `failed`.
    fehlerklasse = fehlerklasseAus(telemetrie.ergebnisse, gruppenKarte);
    status = gespeichert > 0 ? STATUS.PARTIAL : STATUS.FAILED;
  } else if (gesamt === 0) {
    // Ordnungsgemaess beendet, aber ohne jede Arbeitszeile (Arbeitsliste war leer,
    // `cluster === 0` — die Identitaet stimmt, es gab schlicht nichts zu tun).
    status = STATUS.BLOCKED;
  } else {
    // Auch ein Lauf, der AUSSCHLIESSLICH vertagt hat, ist ehrlich erfolgreich: die
    // Restzeitwache hat ihre Arbeit getan, `vertagt` traegt die Wahrheit.
    status = STATUS.SUCCESS;
  }

  return {
    zaehlbar: true,
    gespeichert, uebersprungen, fehlgeschlagen, vertagt,
    cluster, gesamt, stimmig, status, fehlerklasse
  };
}

module.exports = {
  laufBilanz,
  fehlerklasseAus,
  EIMER,
  GRUPPEN_ALLE,
  STATUS
};
