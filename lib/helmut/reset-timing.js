"use strict";

// Timing-Schutz fuer den ANONYMEN Passwort-Reset (POST /api/auth/request-reset).
// =============================================================================
// PROBLEM (bestaetigt, nicht vermutet). Statuscode, Rumpf und Kopfzeilen des
// anonymen Zweigs sind schon heute fuer bekannte und unbekannte Adressen
// identisch. Die ANTWORTZEIT war es nicht: sobald ein Mailtransport konfiguriert
// ist, leistet der Treffer-Zweig zusaetzlich
//   1 x createPasswordToken  (readAuthStore + writeAuthStore, ganzer Blob)
//   1 x sendAccessMail       (externer HTTPS-Roundtrip, Zeitlimit 10 s)
//   1 x recordAudit          (readAuthStore + writeAuthStore, ganzer Blob)
// waehrend der Not-Found-Zweig nach dem einen Lesezugriff sofort antwortet.
// Das Delta liegt in der Groessenordnung mehrerer hundert Millisekunden bis
// Sekunden — EIN einziger Request genuegt zur Unterscheidung, es braucht keine
// Statistik. Damit waere jede E-Mail-Adresse als "bei Helmut registriert" oder
// "nicht registriert" pruefbar.
//
// LOESUNG — zwei UNABHAENGIGE Massnahmen, bewusst keine davon allein:
//
//   (1) ENTKOPPLUNG (strukturell, die eigentliche Massnahme).
//       Die gesamte differenzierende Arbeit (Token, Mail, Audit) verlaesst den
//       Antwortpfad und laeuft als Hintergrundarbeit. Was bis zur Antwort noch
//       passiert, ist fuer beide Zweige DIESELBE Arbeit: ein Lesezugriff, der
//       ohnehin den ganzen Auth-Blob holt und erst im Speicher filtert — die
//       Netzlast ist bei Treffer und Nicht-Treffer byte-identisch, uebrig bleibt
//       ein vorzeitig abbrechendes Array.find() im Mikrosekundenbereich.
//
//   (2) QUANTISIERUNG (Restrauschen, deterministisch statt zufaellig).
//       Die Antwort verlaesst den Server ausschliesslich zu t0 + n*Fenster.
//       Damit ist auch das verbliebene Mikrosekunden-Delta nicht mehr messbar,
//       und eine kuenftige versehentliche Asymmetrie unterhalb eines Fensters
//       bleibt folgenlos.
//
// AUSDRUECKLICH NICHT GEWAEHLT:
//   * Zufaelliger Jitter — mittelt sich ueber viele Messungen heraus; die
//     Erwartungswerte beider Zweige blieben verschieden. Verdeckt das Symptom.
//   * Feste Zusatzwartezeit nur auf dem Not-Found-Zweig — muesste die Obergrenze
//     des Treffer-Zweigs treffen, die durch einen externen Anbieter (10 s
//     Zeitlimit) nach oben offen ist. Nicht belastbar.
//   * Dummy-Schreibzugriffe auf dem Not-Found-Zweig (Muster Login-Dummy-scrypt) —
//     wuerde fuer JEDE fremde Anfrage den ganzen Auth-Blob neu schreiben
//     (Kosten, Schreiblast, Kollisionsrisiko) und die Zeiten trotzdem nur
//     annaehern, nicht angleichen.
//
// WARUM DIE ENTKOPPLUNG KEINE MAIL VERLIERT: die Hintergrundarbeit wird nach dem
// Schreiben der Antwort weiterhin ABGEWARTET (server.js). Die Funktionsinstanz
// bleibt also bis zum Abschluss des Versands am Leben — es aendert sich nur, wann
// der Client seine Antwort bekommt, nicht ob die Nachricht rausgeht. Deshalb
// braucht dieser Schutz weder eine persistente Warteschlange noch waitUntil noch
// eine Architekturaenderung.

// Antwortfenster in Millisekunden. Bewusst klein genug, dass niemand es merkt,
// und gross genug, dass der eine Lesezugriff typischerweise hineinpasst.
const STANDARD_FENSTER_MS = 500;
// Harte Grenzen: eine Fehlkonfiguration darf den Schutz weder abschalten
// (Untergrenze) noch den Endpunkt unbrauchbar machen (Obergrenze).
const MIN_FENSTER_MS = 50;
const MAX_FENSTER_MS = 5000;

function antwortFensterMs(env = process.env) {
  const roh = Number((env && env.HELMUT_RESET_ANTWORT_MS) || 0);
  if (!Number.isFinite(roh) || roh <= 0) return STANDARD_FENSTER_MS;
  return Math.min(MAX_FENSTER_MS, Math.max(MIN_FENSTER_MS, Math.round(roh)));
}

// Naechster Gitterpunkt STRIKT nach der bereits verbrauchten Zeit. Reine
// Funktion (keine Uhr, kein Timer) — genau deshalb einzeln pruefbar.
// Ergebnis ist immer >= startMs + fenster und immer > jetztMs.
function freigabeZeitpunkt(startMs, jetztMs, fensterMs) {
  const fenster = Math.max(1, Math.round(Number(fensterMs) || 1));
  const vergangen = Math.max(0, Number(jetztMs) - Number(startMs));
  const stufen = Math.floor(vergangen / fenster) + 1;
  return Number(startMs) + stufen * fenster;
}

const schlafeStandard = (ms) => new Promise((fertig) => setTimeout(fertig, ms));

// Wartet, bis der naechste Gitterpunkt erreicht ist. Mehrfaches Schlafen, weil
// setTimeout zu frueh zurueckkehren kann; die Obergrenze verhindert eine
// Endlosschleife bei einer springenden Uhr.
async function warteBisFreigabe(startMs, opts = {}) {
  const fenster = Number.isFinite(opts.fensterMs) ? opts.fensterMs : antwortFensterMs(opts.env);
  const jetzt = opts.jetzt || Date.now;
  const schlafe = opts.schlafe || schlafeStandard;
  const ziel = freigabeZeitpunkt(startMs, jetzt(), fenster);
  for (let runde = 0; runde < 16; runde += 1) {
    const rest = ziel - jetzt();
    if (rest <= 0) break;
    await schlafe(rest);
  }
  return ziel;
}

// ── Hintergrundarbeit ───────────────────────────────────────────────────────
// Bewusst KEINE Warteschlange, kein Nebenlaeufigkeitslimit, keine Persistenz:
// die Arbeit gehoert weiterhin zur laufenden Anfrage, sie steht nur nicht mehr
// VOR der Antwort. Mehr waere eine Architekturaenderung ohne Sicherheitsgewinn.
const offeneVorgaenge = new Set();

// Startet die Arbeit sofort und gibt eine Zusage zurueck, die NIE ablehnt.
// Fehler werden verschluckt und NICHT protokolliert: die Nutzdaten dieses Pfades
// (Empfaenger, Link, Token) duerfen laut Secret-/DSGVO-Hygiene in keinem Log
// landen, und ein Fehlerpfad darf ausserdem nichts ueber die Existenz eines
// Kontos verraten.
function starteHintergrundarbeit(arbeit) {
  const vorgang = Promise.resolve()
    .then(arbeit)
    .then(() => undefined, () => undefined);
  offeneVorgaenge.add(vorgang);
  vorgang.then(() => offeneVorgaenge.delete(vorgang));
  return vorgang;
}

function anzahlOffeneVorgaenge() {
  return offeneVorgaenge.size;
}

// Wartet auf ALLE offenen Hintergrundvorgaenge. Fuer Tests (deterministisch statt
// pollen) und als Abschlusshaken fuer einen geordneten Prozessstopp.
async function offeneArbeit() {
  for (let runde = 0; runde < 100 && offeneVorgaenge.size; runde += 1) {
    await Promise.all([...offeneVorgaenge]);
  }
}

module.exports = {
  STANDARD_FENSTER_MS,
  MIN_FENSTER_MS,
  MAX_FENSTER_MS,
  antwortFensterMs,
  freigabeZeitpunkt,
  warteBisFreigabe,
  starteHintergrundarbeit,
  anzahlOffeneVorgaenge,
  offeneArbeit
};
