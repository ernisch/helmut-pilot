"use strict";

// Helmut — SICHERE FORMATPRUEFUNG FUER `AZURE_OPENAI_ENDPOINT`.
// =============================================================================
// BEFUND (Sicherheitssprint 2026-09-01, §16.8b des 500er-Belegs): der
// Produktionspfad `lib/helmut/ai.js` baute die Ziel-URL bis hierher ungeprueft
// aus der Umgebungsvariablen:
//
//     const apiUrl = `${process.env.AZURE_OPENAI_ENDPOINT}/openai/v1/responses`;
//
// Kein Schema-Zwang, keine Host-Erlaubnisliste, keine Portpruefung. Zusammen mit
// dem `api-key`-Kopf bedeutete das: ein falsch gesetzter oder manipulierter
// Umgebungswert schickt Prompt UND Schluessel an einen beliebigen Host. Es gab
// keinen Vorfall und keinen Hinweis auf eine Fehlkonfiguration — dies ist
// Verteidigung in der Tiefe, kein Incident-Fix.
//
// DREI EIGENSCHAFTEN, DIE DIESES MODUL GARANTIERT:
//
//  1. ERLAUBNISLISTE STATT SPERRLISTE. Nur die vorgesehenen Azure-Hostformen
//     werden akzeptiert; alles andere ist ungueltig — auch das, woran beim
//     Schreiben dieser Zeilen niemand gedacht hat.
//  2. DIESE FUNKTION WIRFT NIE. Ein Guard, der selbst wirft, verlagert das
//     Problem nur; er liefert immer eine vollstaendige Entscheidung.
//  3. KEIN GEHEIMNIS IN DER DIAGNOSE. Weder `grund` noch `fingerabdruck`
//     enthalten je den Endpunktwert, einen Hostnamen oder einen Schluessel.
//     Das ist kein Schoenheitsfehler, sondern der Kern. Empirisch geprueft
//     (Node v22.22.2, Untersuchung 2026-09-01):
//       * `https.request("<ungueltig>")` wirft `TypeError [ERR_INVALID_URL]`.
//         Die `message` lautet nur "Invalid URL" — der EINGABEWERT steht in der
//         aufzaehlbaren Eigenschaft `err.input`. Er leckt daher NICHT ueber
//         `error.message`, sondern ueber jedes `console.error(err)` und jedes
//         `JSON.stringify(err)` mit dem ROHEN Fehlerobjekt.
//       * `fetch()` (undici) verhaelt sich anders: dort steht die VOLLE URL in
//         der `message` ("Failed to parse URL from ...").
//       * Netzfehler des https-Pfads tragen den Hostnamen in der `message`
//         ("getaddrinfo ENOTFOUND <ressource>.openai.azure.com") — das ist der
//         praktisch haeufigste Leckweg, weil `ai.js` `error.message` an
//         persistierte und an den Client ausgelieferte Stellen weiterreicht.
//     Ein Fehlerobjekt aus diesem Modul traegt deshalb nur Grund und
//     Fingerabdruck — nie den Wert, in keiner Eigenschaft.

const crypto = require("crypto");

// ── Erlaubte Azure-Hostformen ────────────────────────────────────────────────
// Die drei Hostfamilien, unter denen Azure OpenAI- bzw. AI-Foundry-Endpunkte
// ausgeliefert werden. Die Pruefung ist eine SUFFIX-Regel auf Labelgrenze:
// `mein-dienst.openai.azure.com` ist gueltig, `boeseopenai.azure.com.evil.tld`
// und `openai.azure.com.angreifer.de` sind es nicht.
const ERLAUBTE_HOSTSUFFIXE = Object.freeze([
  ".openai.azure.com",
  ".services.ai.azure.com",
  ".cognitiveservices.azure.com"
]);

// Ein Endpunkt ist ein kurzer Konfigurationswert. Alles deutlich Laengere ist
// entweder ein Irrtum oder ein Angriffsversuch — beides wird abgewiesen, BEVOR
// irgendetwas geparst wird.
const MAX_LAENGE = 300;

// Nur der Standard-HTTPS-Port. Ein abweichender Port ist bei Azure nie vorgesehen
// und ist das klassische Mittel, Verkehr auf einen lokalen Abhoerer zu lenken.
const ERLAUBTER_PORT = "443";

// ── AUSDRUECKLICHE AUSNAHME: SCHLEIFENADRESSE FUER EIGENE PRUEFWERKZEUGE ─────
// `scripts/understanding-live-smoke.js` und `scripts/fixtures/z3-slotlauf.js`
// fahren den ECHTEN Produktionspfad (echtes TLS, api-key-Kopf, usage-Block)
// gegen einen lokalen HTTPS-Ersatz auf 127.0.0.1 mit freiem Port. Ohne diese
// Ausnahme haette die Erlaubnisliste genau die Werkzeuge stillgelegt, die den
// Pfad pruefen — die Haertung haette sich selbst blind gemacht.
//
// WARUM DAS SICHER IST: Die Bedrohung ist "Prompt und Schluessel gehen an einen
// FREMDEN Host". Eine Schleifenadresse verlaesst die Maschine per Definition
// nicht. Zusaetzlich bleibt die Ausnahme AUSDRUECKLICH: sie gilt nur, wenn der
// Aufrufer sie anfordert (`erlaubeLoopback`), nie stillschweigend. HTTPS,
// Zugangsdaten-, Pfad- und Query-Verbot gelten unveraendert weiter.
const LOOPBACK_HOSTS = Object.freeze(["127.0.0.1", "::1", "[::1]", "localhost"]);

const GRUENDE = Object.freeze({
  FEHLT: "endpunkt-fehlt",
  KEIN_TEXT: "endpunkt-kein-text",
  ZU_LANG: "endpunkt-zu-lang",
  STEUERZEICHEN: "endpunkt-enthaelt-steuerzeichen",
  UNPARSBAR: "endpunkt-syntaktisch-ungueltig",
  KEIN_HTTPS: "endpunkt-kein-https",
  ZUGANGSDATEN: "endpunkt-enthaelt-zugangsdaten",
  HOST_NICHT_ERLAUBT: "endpunkt-host-nicht-in-erlaubnisliste",
  PORT_NICHT_ERLAUBT: "endpunkt-port-nicht-erlaubt",
  PFAD_NICHT_ERLAUBT: "endpunkt-pfad-nicht-erlaubt",
  ABFRAGE_NICHT_ERLAUBT: "endpunkt-query-oder-fragment-nicht-erlaubt"
});

// Sicherer Fingerabdruck: erlaubt es, ZWEI Meldungen als denselben oder als
// verschiedene Endpunkte zu erkennen, ohne den Wert preiszugeben. Zwoelf
// Hexzeichen (48 Bit) reichen dafuer und laden nicht zum Ruecklesen ein.
function fingerabdruck(wert) {
  try {
    if (typeof wert !== "string" || !wert) return "ep:leer";
    return `ep:${crypto.createHash("sha256").update(wert, "utf8").digest("hex").slice(0, 12)}`;
  } catch (_) {
    // Selbst ein kaputter Hash darf nie den Rohwert durchreichen.
    return "ep:unbekannt";
  }
}

function ergebnis(gueltig, grund, basis, roh) {
  return Object.freeze({
    gueltig,
    grund: gueltig ? null : grund,
    // Normalisierte Basis OHNE Schraegstrich am Ende — nur bei gueltigem Wert.
    basis: gueltig ? basis : null,
    fingerabdruck: fingerabdruck(roh)
  });
}

// Prueft einen Endpunktwert. WIRFT NIE. Liefert immer eine vollstaendige
// Entscheidung samt bereinigtem Grund und sicherem Fingerabdruck.
function pruefeEndpunkt(roh, optionen = {}) {
  const erlaubeLoopback = Boolean(optionen && optionen.erlaubeLoopback);
  try {
    if (roh === undefined || roh === null || roh === "") return ergebnis(false, GRUENDE.FEHLT, null, roh);
    if (typeof roh !== "string") return ergebnis(false, GRUENDE.KEIN_TEXT, null, "");
    const wert = roh.trim();
    if (!wert) return ergebnis(false, GRUENDE.FEHLT, null, roh);
    if (wert.length > MAX_LAENGE) return ergebnis(false, GRUENDE.ZU_LANG, null, roh);
    // Steuerzeichen und Leerraum INNERHALB des Werts: Kopfzeilen-Injektion und
    // Parser-Uneinigkeit. Vor dem Parsen abweisen.
    if (/[\u0000-\u0020\u007f-\u009f]/.test(wert)) return ergebnis(false, GRUENDE.STEUERZEICHEN, null, roh);

    let url;
    try {
      url = new URL(wert);
    } catch (_) {
      // Der Originalfehler traegt den Eingabewert — er wird bewusst verworfen.
      return ergebnis(false, GRUENDE.UNPARSBAR, null, roh);
    }

    if (url.protocol !== "https:") return ergebnis(false, GRUENDE.KEIN_HTTPS, null, roh);
    if (url.username || url.password) return ergebnis(false, GRUENDE.ZUGANGSDATEN, null, roh);
    const hostRoh = String(url.hostname || "").toLowerCase();
    const istLoopback = LOOPBACK_HOSTS.includes(hostRoh);
    // Der freie Port gilt AUSSCHLIESSLICH fuer die angeforderte Schleifenadresse.
    if (url.port && url.port !== ERLAUBTER_PORT && !(erlaubeLoopback && istLoopback)) {
      return ergebnis(false, GRUENDE.PORT_NICHT_ERLAUBT, null, roh);
    }
    if (url.search || url.hash) return ergebnis(false, GRUENDE.ABFRAGE_NICHT_ERLAUBT, null, roh);
    // Wir haengen selbst `/openai/v1/responses` an: ein mitgegebener Pfad wuerde
    // die Zieladresse verschieben. Nur "" und "/" sind zulaessig.
    if (url.pathname && url.pathname !== "/") return ergebnis(false, GRUENDE.PFAD_NICHT_ERLAUBT, null, roh);

    const host = hostRoh;
    if (erlaubeLoopback && istLoopback) {
      return ergebnis(true, null, `https://${url.host}`, roh);
    }
    const erlaubt = ERLAUBTE_HOSTSUFFIXE.some((suffix) => {
      if (!host.endsWith(suffix)) return false;
      // Es muss ein echtes Unterlabel davor stehen ("x.openai.azure.com", nicht
      // ".openai.azure.com") — und dieses Label darf selbst keinen Punkt-Trick
      // enthalten, den `endsWith` uebersieht.
      const praefix = host.slice(0, host.length - suffix.length);
      return praefix.length > 0 && !praefix.endsWith(".");
    });
    if (!erlaubt) return ergebnis(false, GRUENDE.HOST_NICHT_ERLAUBT, null, roh);

    // Normalisiert und ohne abschliessenden Schraegstrich — die Basis, aus der
    // ai.js die Ziel-URL baut. Bewusst NEU zusammengesetzt statt aus dem Rohwert
    // uebernommen: was hier herauskommt, kann nichts mehr tragen, was oben nicht
    // geprueft wurde.
    return ergebnis(true, null, `https://${host}`, roh);
  } catch (_) {
    // Unerreichbar gedacht — aber ein Guard, der wirft, ist kein Guard.
    return ergebnis(false, GRUENDE.UNPARSBAR, null, "");
  }
}

// Baut die Antworten-URL aus einem GEPRUEFTEN Endpunkt. Gibt null zurueck, wenn
// der Endpunkt ungueltig ist — der Aufrufer entscheidet, wie er stoppt.
function baueResponsesUrl(roh, optionen = {}) {
  const geprueft = pruefeEndpunkt(roh, optionen);
  if (!geprueft.gueltig) return null;
  return `${geprueft.basis}/openai/v1/responses`;
}

module.exports = {
  pruefeEndpunkt,
  baueResponsesUrl,
  fingerabdruck,
  ERLAUBTE_HOSTSUFFIXE,
  LOOPBACK_HOSTS,
  GRUENDE,
  MAX_LAENGE
};
