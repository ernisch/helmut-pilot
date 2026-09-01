"use strict";

// Offline-Vertragstest des ZENTRALEN KOMMUNIKATIONSRIEGELS.
//
// Kernnachweis (Auftrag §3): für synthetische Profile entstehen NULL externe
// Netzaufrufe. Der Beweis läuft über zählende fetch-Attrappen an jeder der
// sechs Außengrenzen — jeder Aufruf würde gezählt und den Test rot färben.
//
// Zusätzlich wird belegt, dass die Sicherheit NICHT allein an `.invalid` oder
// an fehlenden Umgebungsvariablen hängt.

const fs = require("fs");
const path = require("path");
const R = require("../lib/helmut/kommunikationsriegel");
const { baueKohorte } = require("../lib/helmut/test-kohorte-500");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const KOHORTE = baueKohorte();
const SCHARF = { [R.SCHALTER]: R.SCHALTER_WERT_GESPERRT };
const LEER = {};

// Zählt jeden Netzversuch. Wird nie ein Aufruf durchgelassen, bleibt er 0.
let netzaufrufe = 0;
function zaehlenderFetch() {
  netzaufrufe += 1;
  throw new Error("VERBOTENER NETZAUFRUF");
}

async function main() {
  console.log("Helmut — Vertragstest des zentralen Kommunikationsriegels\n");

  // ── A · Klassifizierung ───────────────────────────────────────────────────
  console.log("== A · Klassifizierung der Empfänger ==");

  check("A1 Alle vier synthetischen Kennungsfamilien werden erkannt",
    ["test-kohorte-a-001", "test-mdb-1", "synth-mandat-042", "stapel-x"]
      .every(R.kennungIstSynthetisch));
  check("A2 Eine Kennung ohne synthetische Familie gilt als real",
    !R.kennungIstSynthetisch("ein-beliebiger-mandats-slug")
      && !R.kennungIstSynthetisch("kohorte-test"));
  check("A3 Garantiert nicht auflösende Maildomains werden erkannt",
    ["a@x.invalid", "a@test-kohorte.invalid", "a@invalid", "a@x.localhost"]
      .every(R.mailIstSynthetisch));
  check("A4 Eine gewöhnliche Adresse gilt nicht als synthetisch",
    !R.mailIstSynthetisch("buero@bundestag.de") && !R.mailIstSynthetisch("a@invalid-firma.de"));
  check("A4a Platzhalterdomains des ECHTEN Mailwegs bleiben unberührt",
    ["eva@example.org", "noreply@helmut.test", "x@a.test"]
      .every((a) => !R.mailIstSynthetisch(a)),
    "example.* und .test sind gepinnte Fixtures des realen Mailwegs");
  check("A4b Loopback-Adressen gelten dagegen als nicht zustellbar",
    R.mailIstSynthetisch("eva@localhost") && R.mailIstSynthetisch("a@x.localhost"));
  check("A5 Reservierte Ziele werden erkannt",
    R.zielIstSynthetisch("https://push.invalid/abc")
      && !R.zielIstSynthetisch("https://fcm.googleapis.com/x")
      && !R.zielIstSynthetisch("https://hooks.example.org/x"));
  check("A6 Kaputte Eingaben klassifizieren nicht als real-durchlassend",
    !R.kennungIstSynthetisch(null) && !R.mailIstSynthetisch(undefined) && !R.zielIstSynthetisch("kein-url"));

  // ── B · Die tragende Eigenschaft: unabhängig von .invalid und von Env ──────
  console.log("\n== B · Nicht abhängig von .invalid oder von Umgebungsvariablen ==");

  // Ein synthetisches Profil mit ECHTER Adresse bleibt gesperrt.
  const echteAdresse = R.pruefe(
    { kanal: "mail", kennung: "test-kohorte-a-001", empfaenger: "echte.person@bundestag.de" }, LEER);
  check("B1 Synthetische Kennung mit ECHTER Adresse bleibt gesperrt",
    !echteAdresse.erlaubt && echteAdresse.grund === R.GRUND.SYNTHETISCH
      && echteAdresse.signale.includes("kennungsfamilie"),
    echteAdresse.signale.join(","));

  // Umgekehrt: eine reservierte Adresse ohne Kennung ist ebenfalls gesperrt.
  const nurMail = R.pruefe({ kanal: "mail", empfaenger: "wer@irgendwo.invalid" }, LEER);
  check("B2 Reservierte Adresse ohne Kennung ist ebenfalls gesperrt",
    !nurMail.erlaubt && nurMail.signale.includes("reservierte-maildomain"));

  check("B3 Die Sperre wirkt bei VÖLLIG LEERER Umgebung",
    !R.pruefe({ kanal: "mail", kennung: "test-kohorte-c-400" }, {}).erlaubt);
  check("B4 Die Sperre wirkt auch bei voll konfigurierter Umgebung",
    !R.pruefe({ kanal: "mail", kennung: "test-kohorte-c-400" }, {
      HELMUT_MAIL_TRANSPORT: "resend",
      HELMUT_RESEND_API_KEY: "irgendein-schluessel",
      VAPID_PUBLIC_KEY: "x", VAPID_PRIVATE_KEY: "y",
      HELMUT_MONITORING_WEBHOOK_URL: "https://example.org/hook"
    }).erlaubt);
  check("B5 Ein unbekannter Kanal wird gesperrt, nicht durchgelassen",
    !R.pruefe({ kanal: "telegram", kennung: "irgendwer" }, LEER).erlaubt
      && R.pruefe({ kanal: "telegram" }, LEER).grund === R.GRUND.KANAL_UNBEKANNT);
  check("B6 Ein mandatsgebundener Kanal ohne jede Angabe ist gesperrt",
    !R.pruefe({ kanal: "mail" }, LEER).erlaubt
      && R.pruefe({ kanal: "mail" }, LEER).grund === R.GRUND.UNBESTIMMT);
  check("B7 Eine unlesbare Umgebung schaltet in den strengeren Modus",
    R.modus(new Proxy({}, { get() { throw new Error("unlesbar"); } })) === R.MODUS_TESTFENSTER);

  // ── C · Regulärer Betrieb bleibt unberührt ────────────────────────────────
  console.log("\n== C · Realer Betrieb läuft im Standardmodus unverändert ==");
  const real = R.pruefe({ kanal: "mail", kennung: "ein-reales-mandat", empfaenger: "buero@bundestag.de" }, LEER);
  check("C1 Reale Mail ist im Standardmodus erlaubt",
    real.erlaubt && real.befund === R.BEFUND_REAL && real.modus === R.MODUS_KANAL);
  check("C2 Realer Push ist im Standardmodus erlaubt",
    R.pruefe({ kanal: "push", kennung: "ein-reales-mandat" }, LEER).erlaubt);
  check("C3 Betreiberkanäle sind im Standardmodus erlaubt",
    R.KANAELE_BETRIEBLICH.every((kanal) => R.pruefe({ kanal }, LEER).erlaubt));

  // ── D · Scharfes Testfenster sperrt ALLES ─────────────────────────────────
  console.log("\n== D · Scharfes Testfenster sperrt jeden Außenkanal ==");
  check("D1 Der Schalter schaltet in den Testfenstermodus",
    R.modus(SCHARF) === R.MODUS_TESTFENSTER);
  check("D2 Im Testfenster ist JEDER der Kanäle gesperrt",
    R.KANAELE.every((kanal) => !R.pruefe({ kanal, kennung: "ein-reales-mandat", empfaenger: "b@bundestag.de", ziel: "https://x.de/y" }, SCHARF).erlaubt),
    R.KANAELE.join(","));
  check("D3 Auch reale Empfänger sind im Testfenster gesperrt",
    R.pruefe({ kanal: "mail", kennung: "ein-reales-mandat", empfaenger: "b@bundestag.de" }, SCHARF).grund === R.GRUND.TESTFENSTER);
  check("D4 Auch Monitoring-Webhook und WhatsApp schweigen im Testfenster",
    !R.pruefe({ kanal: "monitoring-webhook", ziel: "https://hooks.example.org/x" }, SCHARF).erlaubt
      && !R.pruefe({ kanal: "whatsapp" }, SCHARF).erlaubt);
  check("D5 Ein anderer Schalterwert schaltet NICHT scharf (kein Zufallstreffer)",
    R.modus({ [R.SCHALTER]: "an" }) === R.MODUS_KANAL);

  // ── E · Null Netzaufrufe für die gesamte 495er-Kohorte ────────────────────
  console.log("\n== E · Null externe Netzaufrufe für alle 495 synthetischen Profile ==");

  const mailTransport = require("../lib/helmut/mail-transport");
  const push = require("../lib/helmut/push");
  const webhook = require("../lib/helmut/monitoring-webhook");
  const jobDispatch = require("../lib/helmut/job-dispatch");
  const lambdaVerbraucher = require("../lib/helmut/lambda-verbraucher");

  const echterFetch = globalThis.fetch;
  globalThis.fetch = zaehlenderFetch;
  let mailGesperrt = 0;
  let pushGesperrt = 0;
  try {
    // Voll konfigurierte Mail- und Push-Umgebung: der Riegel — nicht die
    // fehlende Konfiguration — muss der Grund für das Schweigen sein.
    const mailEnv = {
      HELMUT_MAIL_TRANSPORT: "resend",
      HELMUT_RESEND_API_KEY: "re_lokale_attrappe_kein_echter_schluessel",
      HELMUT_MAIL_FROM: "Helmut <helmut@example.invalid>"
    };
    for (const spec of KOHORTE) {
      const ergebnis = await mailTransport.sendeMail(
        { to: spec.email, subject: "Test", text: "Test" },
        { env: mailEnv, kennung: spec.id }
      );
      if (ergebnis && ergebnis.sent === false && ergebnis.gesperrt === true) mailGesperrt += 1;
    }
    for (const spec of KOHORTE) {
      const ergebnis = await push.sendPushToPolitician(spec.id, { title: "T", body: "B" }, { env: {} });
      if (ergebnis && ergebnis.gesperrt === true) pushGesperrt += 1;
    }
  } finally {
    globalThis.fetch = echterFetch;
  }

  check(`E1 Alle ${KOHORTE.length} Mails an die Kohorte wurden vom Riegel gesperrt`,
    mailGesperrt === KOHORTE.length, `${mailGesperrt}/${KOHORTE.length}`);
  check(`E2 Alle ${KOHORTE.length} Push-Nachrichten an die Kohorte wurden gesperrt`,
    pushGesperrt === KOHORTE.length, `${pushGesperrt}/${KOHORTE.length}`);
  check("E3 Dabei entstand NULL externer Netzaufruf",
    netzaufrufe === 0, `Zähler ${netzaufrufe}`);

  // ── F · Alle sechs Außengrenzen tragen den Riegel ─────────────────────────
  console.log("\n== F · Jede der sechs Außengrenzen trägt den Riegel ==");

  const vorherF = netzaufrufe;
  const echterFetch2 = globalThis.fetch;
  globalThis.fetch = zaehlenderFetch;
  let befunde;
  try {
    befunde = {
      mail: await mailTransport.sendeMail(
        { to: "wer@bundestag.de" },
        { env: { ...SCHARF, HELMUT_MAIL_TRANSPORT: "resend", HELMUT_RESEND_API_KEY: "attrappe" }, kennung: "ein-reales-mandat" }
      ),
      pushEndpunkt: await push.sendPush({ endpoint: "https://push.invalid/abc" }, { title: "T" }),
      webhook: await webhook.deliverMonitoringWebhook(
        { ok: false }, { env: { ...SCHARF, HELMUT_MONITORING_WEBHOOK_URL: "https://hooks.example.org/x" } }
      ),
      transport: jobDispatch.erstelleTransport({ ...SCHARF, HELMUT_JOB_DISPATCH_MODE: "queue", HELMUT_JOB_TRANSPORT: "selbstweck" }),
      lambda: lambdaVerbraucher.erstelleRelayAusloeser({ ...SCHARF, HELMUT_RELAY_FUNKTION: "helmut-relay" })
    };
  } finally {
    globalThis.fetch = echterFetch2;
  }

  check("F1 Mail-Transport ist im Testfenster gesperrt",
    befunde.mail.sent === false && befunde.mail.gesperrt === true, befunde.mail.reason);
  check("F2 Push an der Netzgrenze ist gesperrt (auch am sendPushToPolitician vorbei)",
    befunde.pushEndpunkt.ok === false && befunde.pushEndpunkt.gesperrt === true, befunde.pushEndpunkt.reason);
  check("F3 Monitoring-Webhook ist im Testfenster gesperrt",
    befunde.webhook.sent === false && befunde.webhook.gesperrt === true, befunde.webhook.reason);
  check("F4 Job-/Wecktransport wird im Testfenster gar nicht erst gebaut",
    befunde.transport.verfuegbar === false && befunde.transport.name === "gesperrt", befunde.transport.grund);
  check("F5 Lambda-Auslöser wird im Testfenster nicht gebaut",
    befunde.lambda.ausloeser === null, befunde.lambda.grund);
  check("F6 Kein Netzaufruf an irgendeiner der Grenzen",
    netzaufrufe === vorherF, `Zähler ${netzaufrufe}`);

  // Der WhatsApp-Weg liegt in server.js — dort per Quelltextvertrag geprüft.
  const serverQuelle = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const whatsappBlock = serverQuelle.slice(serverQuelle.indexOf("async function sendCallMeBotMessage"));
  const riegelIndex = whatsappBlock.indexOf("kommunikationsriegel.pruefe");
  const fetchIndex = whatsappBlock.indexOf("await fetch(");
  check("F7 Der WhatsApp-Weg prüft den Riegel VOR dem Netzaufruf",
    riegelIndex > 0 && fetchIndex > riegelIndex, `Riegel@${riegelIndex} < fetch@${fetchIndex}`);

  // ── G · Reihenfolge: Riegel vor Konfigurationsprüfung ─────────────────────
  console.log("\n== G · Der Riegel steht vor jeder Konfigurationsprüfung ==");
  const paare = [
    ["mail-transport.js", "sendeMail", "transportKonfiguration(env)"],
    ["push.js", "sendPushToPolitician", "isPushConfigured()"],
    ["monitoring-webhook.js", "deliverMonitoringWebhook", "HELMUT_MONITORING_WEBHOOK_URL || \"\").trim()"],
    ["job-dispatch.js", "erstelleTransport", "dispatchModus(env)"],
    ["lambda-verbraucher.js", "erstelleRelayAusloeser", "HELMUT_RELAY_FUNKTION"]
  ];
  for (const [datei, funktion, konfigMarke] of paare) {
    const quelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", datei), "utf8");
    const block = quelle.slice(quelle.indexOf(`function ${funktion}(`));
    const r = block.indexOf("kommunikationsriegel.pruefe");
    const k = block.indexOf(konfigMarke);
    check(`G-${datei} ${funktion}: Riegel vor Konfigurationsprüfung`,
      r > 0 && k > r, `Riegel@${r}, Konfig@${k}`);
  }

  // ── H · Der Einladungs-/Passwortweg trägt die Mandatskennung ──────────────
  // Ohne sie hinge dieser Weg allein am Adresssignal — genau das soll er nicht.
  console.log("\n== H · Einladung/Passwort trägt die Mandatskennung ==");
  const inviteMail = require("../lib/helmut/invite-mail");
  const vorherH = netzaufrufe;
  const echterFetch3 = globalThis.fetch;
  globalThis.fetch = zaehlenderFetch;
  let mitKennung;
  let ohneAlles;
  try {
    // Kohortenprofil mit ECHTER, zustellbarer Adresse: nur die Kennung schützt hier.
    mitKennung = await inviteMail.sendAccessMail(
      { to: "echte.person@bundestag.de", subject: "Einladung", text: "x" },
      { env: { HELMUT_MAIL_TRANSPORT: "resend", HELMUT_RESEND_API_KEY: "attrappe" },
        kennung: "test-kohorte-b-042" }
    );
    ohneAlles = await inviteMail.sendAccessMail(
      { subject: "Einladung", text: "x" },
      { env: { HELMUT_MAIL_TRANSPORT: "resend", HELMUT_RESEND_API_KEY: "attrappe" } }
    );
  } finally {
    globalThis.fetch = echterFetch3;
  }
  check("H1 Einladung an ein Kohortenprofil mit ECHTER Adresse ist gesperrt",
    mitKennung.sent === false && mitKennung.gesperrt === true
      && mitKennung.riegel.signale.includes("kennungsfamilie")
      && mitKennung.riegel.kanal === "einladung",
    mitKennung.reason);
  check("H2 Einladung ohne jede zuordenbare Angabe ist gesperrt",
    ohneAlles.sent === false && ohneAlles.gesperrt === true);
  check("H3 sendAccessMail setzt den Kanal 'einladung' selbst",
    /kanal: "einladung"/.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "invite-mail.js"), "utf8")));
  check("H4 Alle vier sendAccessMail-Aufrufer in server.js reichen die Kennung durch",
    (() => {
      const quelle = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
      const stellen = [...quelle.matchAll(/sendAccessMail\(/g)];
      if (stellen.length !== 4) return false;
      return stellen.every((treffer) =>
        /kennung:\s*\w+\.politicianId/.test(quelle.slice(treffer.index, treffer.index + 260)));
    })(),
    "kennung: <konto>.politicianId an jeder Aufrufstelle");
  check("H5 Auch dabei entstand kein Netzaufruf", netzaufrufe === vorherH, `Zähler ${netzaufrufe}`);

  check("G9 Am Ende steht der Netzzähler auf null", netzaufrufe === 0, `Zähler ${netzaufrufe}`);

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error("Testabbruch:", (fehler && fehler.message) || fehler);
  process.exit(1);
});
