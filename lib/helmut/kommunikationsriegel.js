"use strict";

// Helmut — ZENTRALER, FAIL-CLOSED KOMMUNIKATIONSRIEGEL (500er-Funktionstest).
// =============================================================================
// Vor diesem Modul gab es SECHS voneinander unabhängige Außenkanäle und KEINEN
// gemeinsamen Punkt, an dem eine ausgehende Nachricht hätte gestoppt werden
// können (Bestandsaufnahme 2026-09-01):
//
//   1. Mail                  lib/helmut/mail-transport.js  sendeMail
//   2. Einladung/Passwort    lib/helmut/invite-mail.js     sendAccessMail → sendeMail
//   3. Web-Push              lib/helmut/push.js            sendPushToPolitician → sendPush
//   4. WhatsApp (CallMeBot)  server.js                     sendCallMeBotMessage
//   5. Monitoring-Webhook    lib/helmut/monitoring-webhook.js deliverMonitoringWebhook
//   6. Job-/Weck-Transporte  lib/helmut/job-dispatch.js    erstelleTransport
//      6b. Lambda-Invoke     lib/helmut/lambda-verbraucher.js erstelleRelayAusloeser
//
// Dieses Modul ist der fehlende gemeinsame Punkt. Es ist REINE LOGIK: kein Netz,
// keine Datenbank, keine Uhr, keine Secrets; die Umgebung ist ein Parameter.
// `pruefe()` wirft nie — es antwortet immer mit einer vollständigen Entscheidung.
//
// ─── Warum das nicht an `.invalid` oder an fehlenden Umgebungsvariablen hängt ───
//
// Der Auftrag verlangt ausdrücklich, dass die Sicherheit NICHT allein von
// `.invalid`-Adressen oder gerade nicht gesetzten Umgebungsvariablen abhängt.
// Deshalb:
//
//   * Das TRAGENDE Merkmal ist die KENNUNGSFAMILIE des Mandats
//     (`test-kohorte-…`, `test-mdb-…`, `synth-mandat-…`, `stapel-…`). Sie steht
//     im Datensatz und überlebt jede Umkonfiguration. Ein synthetisches Profil
//     bleibt gesperrt, auch wenn ihm jemand eine echte E-Mail-Adresse einträgt.
//   * Die reservierte Maildomain ist ein ZWEITES, UNABHÄNGIGES Signal — ein
//     Zusatz, keine Voraussetzung. Ein Signal genügt zum Sperren.
//   * Die Sperre wirkt OHNE JEDE Umgebungsvariable. Sie ist nicht „an, weil kein
//     API-Schlüssel gesetzt ist"; sie ist an, weil der Empfänger synthetisch ist.
//     Ein später gesetzter Schlüssel hebt sie nicht auf.
//   * Die Prüfung läuft VOR jeder Transport-/Konfigurationsprüfung des Kanals.
//     Ein „nicht konfiguriert" darf niemals als Sicherheitsnachweis gelten.
//
// ─── Zwei Modi ───────────────────────────────────────────────────────────────
//
//   MODUS_KANAL (Standard, immer aktiv, ohne Konfiguration):
//     Gesperrt wird, was synthetisch ist oder gar nicht zuzuordnen ist. Realer
//     Betrieb läuft unverändert weiter — genau das ist heute die Lage.
//
//   MODUS_TESTFENSTER (scharf, `HELMUT_TESTLAUF_KOMMUNIKATION=gesperrt`):
//     Für das Fenster des 500er-Funktionstests. Gesperrt wird JEDER ausgehende
//     Nachrichtenweg — auch Betreiberkanäle (WhatsApp, Monitoring-Webhook) und
//     auch real zugeordnete Empfänger. Das ist die Betriebsstellung des Tests.
//
// Beide Modi sind FAIL CLOSED: Wirft die Klassifizierung, ist der Kanal
// unbekannt oder ist der Empfänger nicht bestimmbar, wird gesperrt — nie
// durchgelassen.

const MODUS_KANAL = "kanal";
const MODUS_TESTFENSTER = "testfenster";

const SCHALTER = "HELMUT_TESTLAUF_KOMMUNIKATION";
const SCHALTER_WERT_GESPERRT = "gesperrt";

// Kanäle, die einem Mandat zugeordnet sind (Empfänger ist eine Person/ein Büro).
const KANAELE_MANDATSGEBUNDEN = Object.freeze([
  "mail",
  "einladung",
  "push"
]);
// Kanäle ohne Mandatsbezug: Ziel ist der Betreiber oder die eigene Infrastruktur.
const KANAELE_BETRIEBLICH = Object.freeze([
  "whatsapp",
  "monitoring-webhook",
  "job-transport",
  "lambda-invoke"
]);
const KANAELE = Object.freeze([...KANAELE_MANDATSGEBUNDEN, ...KANAELE_BETRIEBLICH]);

// Kennungsfamilien, die im Repository ausschließlich synthetisch vergeben werden.
// KEINE echten Mandatskennungen — hier steht bewusst kein einziger realer Slug
// (CLAUDE.md §4.2: kein Mandant wird hartkodiert).
const SYNTHETISCHE_KENNUNGSFAMILIEN = Object.freeze([
  "test-kohorte-",
  "test-mdb-",
  "synth-mandat-",
  "stapel-"
]);

// Namensräume, die per RFC 2606/6761 GARANTIERT nicht auflösen und damit
// strukturell nicht zustellbar sind. Genau diese Familie benutzt die Kohorte
// (`<id>@test-kohorte.invalid`).
//
// BEWUSST NICHT ENTHALTEN sind `.test`, `.example` und `example.com/.net/.org`:
// Sie sind zwar als Platzhalter reserviert, werden im Repository aber seit
// Langem als Adressen in den gepinnten Verträgen des ECHTEN Mailwegs verwendet
// (`mailpit-transport`, `resend-transport`, `reset-timing-seitenkanal`,
// `mail-vorlagen`). Sie hier aufzunehmen hieße, das Verhalten des realen
// Mailwegs zu ändern — das ist nicht Aufgabe dieses Riegels. Der Riegel für die
// synthetische Kohorte trägt ohnehin nicht auf diesem Signal: das tragende
// Merkmal ist die Kennungsfamilie (siehe oben), und der Test belegt, dass ein
// Kohortenprofil auch mit einer ECHTEN Adresse gesperrt bleibt.
const RESERVIERTE_MAIL_ENDUNGEN = Object.freeze([
  ".invalid",
  ".localhost"
]);
const RESERVIERTE_MAIL_DOMAENEN = Object.freeze([
  "invalid",
  "localhost"
]);

const BEFUND_SYNTHETISCH = "synthetisch";
const BEFUND_REAL = "real";
const BEFUND_BETRIEBLICH = "betrieblich";
const BEFUND_UNBESTIMMT = "unbestimmt";

const GRUND = Object.freeze({
  SYNTHETISCH: "synthetische-kohorte-gesperrt",
  UNBESTIMMT: "empfaenger-nicht-bestimmbar",
  TESTFENSTER: "testfenster-sperrt-alle-aussenkanaele",
  KANAL_UNBEKANNT: "kanal-unbekannt",
  PRUEFFEHLER: "prueffehler-fail-closed",
  ERLAUBT: "kein-sperrgrund"
});

function text(wert) {
  return typeof wert === "string" ? wert.trim() : "";
}

// Der scharfe Modus muss AUSDRÜCKLICH gesetzt sein. Das ist kein Sicherheitsloch:
// die mandatsbezogene Sperre unten wirkt ohne jede Umgebungsvariable. Der
// Schalter erweitert die Sperre auf Betreiberkanäle und reale Empfänger.
function modus(env = process.env) {
  try {
    return text(env && env[SCHALTER]).toLowerCase() === SCHALTER_WERT_GESPERRT
      ? MODUS_TESTFENSTER
      : MODUS_KANAL;
  } catch {
    // Eine unlesbare Umgebung darf nie die schwächere Stellung bedeuten.
    return MODUS_TESTFENSTER;
  }
}

// Ist die Mandats-/Kontokennung einer synthetischen Familie zuzuordnen?
// Bewusst eine ERLAUBNISLISTE des Synthetischen: alles andere gilt als real.
// Eine reale Kennung kann so nie versehentlich gesperrt werden, eine
// synthetische aber auch nie versehentlich durchgelassen.
function kennungIstSynthetisch(kennung) {
  const wert = text(kennung).toLowerCase();
  if (!wert) return false;
  return SYNTHETISCHE_KENNUNGSFAMILIEN.some((familie) => wert.startsWith(familie));
}

// Zweites, unabhängiges Signal: eine weltweit nicht zustellbare Adresse.
function mailIstSynthetisch(email) {
  const wert = text(email).toLowerCase();
  const at = wert.lastIndexOf("@");
  if (at <= 0 || at === wert.length - 1) return false;
  const domain = wert.slice(at + 1);
  if (RESERVIERTE_MAIL_DOMAENEN.includes(domain)) return true;
  return RESERVIERTE_MAIL_ENDUNGEN.some((endung) => domain.endsWith(endung));
}

// Drittes, unabhängiges Signal: ein Push-Endpunkt oder Webhook, der auf einen
// reservierten Namensraum zeigt (Testattrappen).
function zielIstSynthetisch(ziel) {
  const wert = text(ziel).toLowerCase();
  if (!wert) return false;
  let host = "";
  try {
    host = new URL(wert).hostname;
  } catch {
    return false;
  }
  if (!host) return false;
  if (RESERVIERTE_MAIL_DOMAENEN.includes(host)) return true;
  return RESERVIERTE_MAIL_ENDUNGEN.some((endung) => host.endsWith(endung));
}

// Alle Signale zusammenführen. Ein einziges synthetisches Signal genügt.
function klassifiziere({ kanal, kennung, empfaenger, ziel } = {}) {
  const signale = [];
  if (kennungIstSynthetisch(kennung)) signale.push("kennungsfamilie");
  if (mailIstSynthetisch(empfaenger)) signale.push("reservierte-maildomain");
  if (zielIstSynthetisch(ziel)) signale.push("reserviertes-ziel");
  if (signale.length) {
    return { befund: BEFUND_SYNTHETISCH, signale: Object.freeze(signale) };
  }
  if (KANAELE_BETRIEBLICH.includes(kanal)) {
    return { befund: BEFUND_BETRIEBLICH, signale: Object.freeze([]) };
  }
  // Mandatsgebundener Kanal ohne jede zuordenbare Angabe: nicht bestimmbar.
  if (!text(kennung) && !text(empfaenger) && !text(ziel)) {
    return { befund: BEFUND_UNBESTIMMT, signale: Object.freeze([]) };
  }
  return { befund: BEFUND_REAL, signale: Object.freeze([]) };
}

// DIE eine Entscheidung. Wirft nie; antwortet immer vollständig.
function pruefe(vorgang = {}, env = process.env) {
  let kanal = "";
  try {
    kanal = text(vorgang && vorgang.kanal).toLowerCase();
  } catch {
    return entscheidung({ erlaubt: false, grund: GRUND.PRUEFFEHLER, kanal: "", modus: MODUS_TESTFENSTER });
  }
  const betriebsmodus = modus(env);
  if (!KANAELE.includes(kanal)) {
    // Ein unbekannter Kanal ist ein neuer Außenweg, der diesen Riegel noch nicht
    // kennt. Er wird gesperrt, nicht durchgelassen.
    return entscheidung({ erlaubt: false, grund: GRUND.KANAL_UNBEKANNT, kanal, modus: betriebsmodus });
  }
  let klassifikation;
  try {
    klassifikation = klassifiziere({
      kanal,
      kennung: vorgang.kennung,
      empfaenger: vorgang.empfaenger,
      ziel: vorgang.ziel
    });
  } catch {
    return entscheidung({ erlaubt: false, grund: GRUND.PRUEFFEHLER, kanal, modus: betriebsmodus });
  }
  const { befund, signale } = klassifikation;

  if (befund === BEFUND_SYNTHETISCH) {
    return entscheidung({ erlaubt: false, grund: GRUND.SYNTHETISCH, kanal, modus: betriebsmodus, befund, signale });
  }
  if (befund === BEFUND_UNBESTIMMT) {
    return entscheidung({ erlaubt: false, grund: GRUND.UNBESTIMMT, kanal, modus: betriebsmodus, befund, signale });
  }
  if (betriebsmodus === MODUS_TESTFENSTER) {
    return entscheidung({ erlaubt: false, grund: GRUND.TESTFENSTER, kanal, modus: betriebsmodus, befund, signale });
  }
  return entscheidung({ erlaubt: true, grund: GRUND.ERLAUBT, kanal, modus: betriebsmodus, befund, signale });
}

function entscheidung({ erlaubt, grund, kanal, modus: betriebsmodus, befund = BEFUND_UNBESTIMMT, signale = Object.freeze([]) }) {
  return Object.freeze({
    erlaubt: erlaubt === true,
    grund,
    kanal,
    modus: betriebsmodus,
    befund,
    signale,
    meldung: erlaubt === true
      ? `Kommunikationsriegel: ${kanal} freigegeben (${befund}, Modus ${betriebsmodus}).`
      : `Kommunikationsriegel: ${kanal || "unbekannter Kanal"} GESPERRT — ${grund} (Modus ${betriebsmodus}).`
  });
}

// Bequeme Klammer für einen Aufrufer: führt `versand` NUR aus, wenn erlaubt.
// Der gesperrte Fall gibt eine ehrliche Absage zurück und berührt kein Netz.
async function bewache(vorgang, versand, env = process.env) {
  const befund = pruefe(vorgang, env);
  if (!befund.erlaubt) {
    return { gesendet: false, gesperrt: true, riegel: befund, reason: befund.grund };
  }
  return versand();
}

module.exports = {
  MODUS_KANAL,
  MODUS_TESTFENSTER,
  SCHALTER,
  SCHALTER_WERT_GESPERRT,
  KANAELE,
  KANAELE_MANDATSGEBUNDEN,
  KANAELE_BETRIEBLICH,
  SYNTHETISCHE_KENNUNGSFAMILIEN,
  RESERVIERTE_MAIL_ENDUNGEN,
  RESERVIERTE_MAIL_DOMAENEN,
  BEFUND_SYNTHETISCH,
  BEFUND_REAL,
  BEFUND_BETRIEBLICH,
  BEFUND_UNBESTIMMT,
  GRUND,
  modus,
  kennungIstSynthetisch,
  mailIstSynthetisch,
  zielIstSynthetisch,
  klassifiziere,
  pruefe,
  bewache
};
