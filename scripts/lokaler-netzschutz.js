"use strict";

// Helmut — ZENTRALER LOKALER NETZ- UND PRODUCTIONSCHUTZ (OP-30, Korrektursprint).
// =============================================================================================
// DER BELEGTE ANLASS (2026-08-08). Beim Direktaufruf `node scripts/gate-shadow-auswertung.js`
// ging eine lesende REST-Abfrage gegen die PRODUCTION-Datenbank. Ursache war NICHT das eine
// Skript, sondern eine Luecke im Schutz:
//
//   Der bestehende Netz-Guard in `scripts/run-offline-tests.js` installiert sich AUSSCHLIESSLICH
//   als `--require`-Preload mit `NO_NETWORK_TESTS=1`. Beides setzt nur der Runner selbst, in
//   seinem eigenen `spawnSync`. Ein direkter `node scripts/<irgendwas>.js` hatte damit
//   ueberhaupt keinen Schutz — gemessen: der Aufruf lief bis zum DNS, nicht bis zum Guard.
//   Betroffen sind nicht nur Tests: 90 Skripte in `scripts/` sind keine `*-test.js` und werden
//   vom Runner nie eingesammelt; rund 25 davon sind netzfaehig.
//
// WAS DIESE DATEI IST: der EINE zentrale Riegel. Wer sie laedt, kann ohne ausdrueckliche
// gegenteilige Ansage kein externes Netz und keine fremde Datenbank mehr erreichen.
//
// WAS SIE AUSDRUECKLICH NICHT IST: kein Production-Code. Sie liegt in `scripts/`, wird von
// `lib/` und `server.js` NIE geladen und veraendert das Laufzeitverhalten von Production in
// keiner Weise. Die lokale Sicherheitsregel ist damit sauber vom Betrieb getrennt — genau
// deshalb kann sie den spaeteren legitimen Production-Betrieb nicht unbrauchbar machen.
//
// SIEBEN FAIL-CLOSED-BEDINGUNGEN. Jede EINZELNE beendet den Prozess, bevor irgendein
// Netzzugriff moeglich ist:
//   1. eine Datenbankadresse ist nicht eindeutig lokal
//   2. eine bekannte Production-Kennung ist in der Umgebung erkennbar
//   3. eine lokale Adresse wird durch eine andere Variable ueberschrieben
//   4. notwendige Angaben fehlen oder sind ungueltig
//   5. `HELMUT_SOURCE_MODE` ist nicht eindeutig `off`
//   6. ein externer KI- oder Quellenanbieter waere erreichbar
//   7. eine Verbindung zielt auf einen nicht-lokalen Host (Laufzeitsperre)
//
// AUSNAHME FUER ECHTE PRODUCTION-WERKZEUGE: Skripte, die Production BEWUSST brauchen
// (`op25-production-nachweis.js`, `backup-export.js`, …), laden diese Datei nicht und
// verlangen ihre eigene ausdrueckliche Zusage. Der Schutz sperrt also nicht den Betrieb,
// sondern das VERSEHEN.

const MARKER = "[LOKALER-SCHUTZ]";

// ── Was gilt als lokal? ──────────────────────────────────────────────────────────────────
// Bewusst eng: nur Schleifenadressen und der Docker-Standardname. Alles andere ist fremd.
const LOKALE_HOSTS = new Set([
  "localhost", "localhost.localdomain",
  "127.0.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1",
  "host.docker.internal"
]);

function istLokalerHost(host) {
  if (host == null) return false;
  const h = String(host).trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "") return false;
  if (LOKALE_HOSTS.has(h)) return true;
  // Das gesamte IPv4-Loopback-Netz 127.0.0.0/8 — mit GUELTIGEN Oktetten.
  // (`127.0.0.256` ist keine Adresse und darf nicht als lokal durchgehen.)
  const v4 = h.match(/^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return v4.slice(1).every((o) => Number(o) <= 255);
  // IPv6-Loopback in seinen Schreibweisen.
  if (/^(?:0*:)*0*1$/.test(h)) return true;
  // Unix-Socket-Pfade (psql -h /pfad/zum/socket) sind per Definition lokal.
  if (h.startsWith("/")) return true;
  return false;
}

// ZWEI GETRENNTE GATTUNGEN — die Vermischung war ein echter Fehler in der ersten Fassung
// dieser Datei (gefunden vom eigenen Test am 2026-08-08):
//
//   (a) REINE ZUGANGSDATEN. Ihr blosses Vorhandensein ist der Befund. Ein Dienstschluessel
//       hat in einem lokalen Lauf nichts zu suchen, egal wohin er zeigt.
//   (b) ADRESSVARIABLEN. Hier entscheidet die ADRESSE, nicht das Vorhandensein. Ein
//       `DATABASE_URL=postgres://…@127.0.0.1/…` ist der voellig normale lokale Testfall —
//       ihn abzulehnen haette den Schutz unbenutzbar gemacht und damit zur Umgehung eingeladen.
const REINE_ZUGANGSDATEN = [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_ANON_KEY",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "SERPAPI_KEY",
  // BELEGTE LUECKE (Skalierungssprint Z3, 2026-08-26). Der TATSAECHLICHE Produktionsanbieter
  // fuer KI ist Azure (`lib/helmut/ai.js: isAzure()` -> `AZURE_OPENAI_KEY` +
  // `AZURE_OPENAI_ENDPOINT`, Vorrang vor OpenAI laut `docs/betrieb/env-inventar.md` §38).
  // Genau diese beiden Namen fehlten hier: in einer Cloud-Sitzung wurden sie deshalb an
  // JEDEN Testkindprozess weitergereicht. Gehalten hat bisher allein die Laufzeitsperre —
  // ein einziger Riegel, wo der Entwurf zwei vorsieht. Ein Handlauf mit umgangener oder
  // aufgehobener Laufzeitsperre haette echte, kostenpflichtige Modellaufrufe auf dem
  // Production-Konto ausgeloest. `AZURE_OPENAI_API_KEY` ist der dokumentierte Alias.
  "AZURE_OPENAI_KEY", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT",
  "VERCEL_TOKEN", "BLOB_READ_WRITE_TOKEN", "VAPID_PRIVATE_KEY"
];
// Bleibt als Gesamtliste erhalten: `scripts/lokal.js` entfernt genau diese Namen aus der
// Umgebung des Kindprozesses. Adressvariablen gehoeren dazu, weil eine geerbte fremde
// Datenbankadresse denselben Schaden anrichtet wie ein geerbter Schluessel.
const PRODUCTION_KENNUNGEN = [
  ...REINE_ZUGANGSDATEN, "SUPABASE_DB_URL", "POSTGRES_URL", "DATABASE_URL", "PGURL"
];

// Datenbankvariablen, deren Adresse lokal sein MUSS, wenn sie gesetzt ist.
const DB_HOST_VARIABLEN = ["HELMUT_TEST_PG_HOST", "PGHOST"];
const DB_URL_VARIABLEN = ["DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL", "PGURL"];

function hostAusUrl(roh) {
  try {
    const u = new URL(String(roh));
    return u.hostname;
  } catch { return null; }
}

// ── Die Pruefung ─────────────────────────────────────────────────────────────────────────
// Liefert eine Liste von Gruenden. Leere Liste = alles in Ordnung.
function pruefe(env = process.env) {
  const gruende = [];

  // (5) Quellenmodus muss eindeutig aus sein.
  const quellmodus = String(env.HELMUT_SOURCE_MODE == null ? "" : env.HELMUT_SOURCE_MODE).trim().toLowerCase();
  if (quellmodus !== "off") {
    gruende.push(`HELMUT_SOURCE_MODE ist ${quellmodus === "" ? "nicht gesetzt" : `"${quellmodus}"`}, erforderlich ist genau "off"`);
  }

  // (2)+(6) Production-Kennungen und externe Anbieter — nur die REINEN Zugangsdaten.
  // Adressvariablen werden weiter unten nach ihrer Adresse beurteilt, nicht nach Anwesenheit.
  const gefunden = REINE_ZUGANGSDATEN.filter((n) => String(env[n] || "").trim() !== "");
  if (gefunden.length) {
    gruende.push(`Production-/Anbieterkennungen in der Umgebung: ${gefunden.join(", ")} `
      + `(Werte werden bewusst nicht ausgegeben)`);
  }

  // (1)+(4) Datenbankadressen muessen lokal UND brauchbar sein.
  for (const n of DB_HOST_VARIABLEN) {
    const roh = env[n];
    if (roh == null || String(roh).trim() === "") continue;   // nicht gesetzt ist erlaubt
    if (!istLokalerHost(roh)) gruende.push(`${n} ist keine eindeutig lokale Adresse`);
  }
  for (const n of DB_URL_VARIABLEN) {
    const roh = env[n];
    if (roh == null || String(roh).trim() === "") continue;
    const host = hostAusUrl(roh);
    if (host === null) gruende.push(`${n} ist gesetzt, aber keine gueltige URL (ungueltige Angabe)`);
    else if (!istLokalerHost(host)) gruende.push(`${n} zeigt auf eine nicht-lokale Adresse`);
  }

  // (3) Widerspruch: eine lokale Adresse, die von einer nicht-lokalen ueberschrieben wird.
  const gesetzteHosts = [...DB_HOST_VARIABLEN, ...DB_URL_VARIABLEN]
    .map((n) => ({ n, roh: env[n] }))
    .filter((x) => x.roh != null && String(x.roh).trim() !== "")
    .map((x) => ({ n: x.n, host: DB_URL_VARIABLEN.includes(x.n) ? hostAusUrl(x.roh) : x.roh }));
  const lokale = gesetzteHosts.filter((x) => istLokalerHost(x.host));
  const fremde = gesetzteHosts.filter((x) => !istLokalerHost(x.host));
  if (lokale.length && fremde.length) {
    gruende.push(`widerspruechliche Datenbankangaben: ${lokale.map((x) => x.n).join(", ")} ist lokal, `
      + `${fremde.map((x) => x.n).join(", ")} aber nicht — welche gilt, ist nicht entscheidbar`);
  }

  return gruende;
}

function abbrechen(gruende, anlass) {
  const zeilen = [
    "",
    `${MARKER} ABBRUCH — dieser Lauf haette Production erreichen koennen.`,
    `  Anlass: ${anlass}`,
    "  Gruende:"
  ];
  gruende.forEach((g, i) => zeilen.push(`    ${i + 1}. ${g}`));
  // Der Hinweis nennt GENAU die Variablen, die in DIESER Umgebung gefunden wurden. Eine feste
  // Liste war hier falsch: der Riegel prueft alle reinen Zugangsdaten, der Hinweis fuenf — wer
  // an VERCEL_TOKEN scheiterte, bekam einen Befehl, der nicht half (gefunden 2026-08-08 beim
  // Integrationslauf). Erste Empfehlung bleibt `scripts/lokal.js`, weil Handarbeit vergessen wird.
  const gefunden = REINE_ZUGANGSDATEN.filter((n) => String(process.env[n] || "").trim() !== "");
  const unsetListe = (gefunden.length ? gefunden : REINE_ZUGANGSDATEN).map((n) => `-u ${n}`).join(" ");
  zeilen.push(
    "",
    "  So laeuft es lokal richtig (Zugangsdaten aus der Umgebung nehmen, nicht loeschen):",
    "    node scripts/lokal.js -- node <skript>            # empfohlen: entfernt sie selbst",
    "  oder von Hand — genau die hier gefundenen Kennungen:",
    `    env ${unsetListe} HELMUT_SOURCE_MODE=off node <skript>`,
    "",
    "  Dieser Riegel ist ABSICHTLICH fail closed: er laesst im Zweifel nichts durch.",
    "  Er gilt NUR lokal — Production laedt diese Datei nie.",
    ""
  );
  process.stderr.write(zeilen.join("\n") + "\n");
  process.exit(3);
}

// ── Laufzeitsperre (7) ───────────────────────────────────────────────────────────────────
// Zweiter, unabhaengiger Riegel: selbst wenn die Umgebung sauber ist, wird JEDE Verbindung
// zu einem nicht-lokalen Ziel hart abgewiesen. Zwei Riegel, weil einer irgendwann uebersehen
// wird.
let blockierteVersuche = [];

function installiereLaufzeitsperre() {
  const verweigere = (ziel, weg) => {
    const msg = `${MARKER} Nicht-lokale Verbindung blockiert (${weg} -> ${ziel})`;
    blockierteVersuche.push({ ziel, weg });
    process.stderr.write(msg + "\n");
    return new Error(msg);
  };

  const hostAus = (arg) => {
    try {
      if (typeof arg === "string") {
        if (arg.startsWith("/")) return "localhost";           // Unix-Socket
        return new URL(arg, "http://localhost").hostname;
      }
      if (arg instanceof URL) return arg.hostname;
      if (arg && typeof arg === "object") {
        if (arg.path && String(arg.path).startsWith("/") && !arg.host && !arg.hostname) return "localhost";
        if (arg.url) return new URL(String(arg.url), "http://localhost").hostname;
        const roh = arg.hostname || arg.host || "localhost";
        return String(roh).replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
      }
    } catch { return null; }
    return null;
  };

  for (const modName of ["http", "https"]) {
    const mod = require(modName);
    for (const fn of ["request", "get"]) {
      const orig = mod[fn];
      mod[fn] = function (...args) {
        const host = hostAus(args[0]);
        if (host && !istLokalerHost(host)) throw verweigere(host, `${modName}.${fn}`);
        return orig.apply(this, args);
      };
    }
  }

  if (typeof globalThis.fetch === "function") {
    const orig = globalThis.fetch;
    globalThis.fetch = function (input, init) {
      const roh = (input && typeof input === "object" && !(input instanceof URL) && input.url) ? input.url : input;
      const host = hostAus(roh);
      if (host && !istLokalerHost(host)) return Promise.reject(verweigere(host, "fetch"));
      return orig.call(this, input, init);
    };
  }

  // Rohe Sockets: ohne diesen Riegel liefe jede Datenbankbibliothek am Schutz vorbei.
  const net = require("net");
  for (const fn of ["connect", "createConnection"]) {
    const orig = net[fn];
    net[fn] = function (...args) {
      const erst = args[0];
      let host = null;
      if (typeof erst === "object" && erst) host = erst.path ? "localhost" : (erst.host || erst.hostname);
      else if (typeof erst === "string" && erst.startsWith("/")) host = "localhost";
      else if (typeof args[1] === "string") host = args[1];
      if (host && !istLokalerHost(host)) throw verweigere(host, `net.${fn}`);
      return orig.apply(this, args);
    };
  }
  const tls = require("tls");
  const origTls = tls.connect;
  tls.connect = function (...args) {
    const erst = args[0];
    let host = null;
    if (typeof erst === "object" && erst) host = erst.host || erst.servername;
    else if (typeof args[1] === "string") host = args[1];
    if (host && !istLokalerHost(host)) throw verweigere(host, "tls.connect");
    return origTls.apply(this, args);
  };
}

// ── Vererbung an Unterprozesse ───────────────────────────────────────────────────────────
// Ein Schutz, der beim ersten `spawn` endet, ist keiner. Jeder Kindprozess erbt den Preload.
function vererbeAnUnterprozesse() {
  const vorhandene = String(process.env.NODE_OPTIONS || "");
  const preload = `--require ${__filename}`;
  if (!vorhandene.includes(__filename)) {
    process.env.NODE_OPTIONS = (vorhandene + " " + preload).trim();
  }
  process.env.HELMUT_LOKALER_SCHUTZ = "aktiv";
}

// ── Aktivierung ──────────────────────────────────────────────────────────────────────────
//
// EINE eng begrenzte Ausnahme, und sie ist NICHT das Abschalten des Schutzes.
//
// Einige Suiten pruefen die Verweigerungslogik der WERKZEUGE: `restore-drill-test.js` setzt
// absichtlich eine Production-aussehende Ziel-URL, um zu beweisen, dass das Restore-Werkzeug
// sie ablehnt. Dieselbe Art Nachweis fuehren `backup-export-test.js` und
// `understanding-recovery-test.js`. Mein Umgebungsriegel beendete diese Prozesse (Exit 3),
// BEVOR das Werkzeug seine eigene Verweigerung (Exit 2) zeigen konnte — der Schutz haette
// also ausgerechnet die Nachweise zerstoert, die dieselbe Gefahr abdecken.
//
// Deshalb: `HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG=ja` ueberspringt die UMGEBUNGSPRUEFUNG —
// und NUR sie. Die LAUFZEITSPERRE bleibt vollstaendig aktiv: jede Verbindung zu einem
// nicht-lokalen Ziel wird weiterhin hart abgewiesen. Die eigentliche Zusage ("es kann nichts
// nach draussen") haengt an der Laufzeitsperre, nicht an der Umgebungspruefung. Die
// Umgebungspruefung ist der Schutz vor dem VERSEHEN; hier ist nichts versehentlich.
function simulierteUmgebung(env = process.env) {
  return String(env.HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG || "").trim().toLowerCase() === "ja";
}

function aktiviere({ env = process.env, anlass = null } = {}) {
  if (!simulierteUmgebung(env)) {
    const gruende = pruefe(env);
    if (gruende.length) abbrechen(gruende, anlass || (process.argv[1] || "unbekannter Aufruf"));
  }
  // IMMER — auch bei simulierter Umgebung.
  installiereLaufzeitsperre();
  vererbeAnUnterprozesse();
  return { aktiv: true, umgebungspruefung: !simulierteUmgebung(env), blockierteVersuche };
}

module.exports = {
  MARKER, LOKALE_HOSTS, PRODUCTION_KENNUNGEN, REINE_ZUGANGSDATEN, DB_HOST_VARIABLEN, DB_URL_VARIABLEN,
  istLokalerHost, pruefe, aktiviere, installiereLaufzeitsperre, simulierteUmgebung,
  blockierteVersuche: () => blockierteVersuche.slice()
};

// Wird die Datei direkt geladen (als `--require`-Preload oder per `require`), schaltet der
// Schutz sofort scharf. Wer nur die Pruefungen benutzen will (z. B. der Test), setzt
// HELMUT_LOKALER_SCHUTZ_NUR_LADEN=ja.
if (String(process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN || "").trim().toLowerCase() !== "ja") {
  aktiviere();
}
