"use strict";

// Helmut — SICHERER STARTWEG DER LAMBDA-KONFIGURATION (Korrekturlauf 2026-08-14/3).
// =============================================================================================
// DAS PROBLEM, DAS DIESES MODUL LOEST: die Lambda-Funktion bekommt aus der
// Infrastrukturdefinition ausschliesslich PARAMETERNAMEN — nie Werte. Ohne diesen Startweg
// haette der Verbraucher in AWS keine Supabase-Verbindung: `storage.js` faellt ohne
// SUPABASE_URL/Service-Schluessel/HELMUT_STORAGE_BACKEND still auf den LOKALEN Speicher
// zurueck. Ein Verbraucher, der lokal statt in Supabase arbeitet, wuerde Auftraege
// "erledigen", die niemand je sieht — der schlimmste denkbare Ausgang.
//
// DIE FUENF ZUSAGEN:
//   1. VOR dem ersten Fachaufruf sind SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und
//      HELMUT_STORAGE_BACKEND=supabase gesetzt — sonst wird gar nicht gearbeitet.
//   2. Die Werte kommen aus AWS Systems Manager MIT Entschluesselung (SecureString) und
//      liegen ausschliesslich im Prozessspeicher.
//   3. Sie werden NIE protokolliert — auch nicht gekuerzt, auch nicht im Fehlerfall.
//      Fehlertexte werden auf eine feste, wertfreie Ursache abgebildet.
//   4. Warme Aufrufe benutzen den Prozesscache; ein FEHLGESCHLAGENER Start wird NICHT
//      zwischengespeichert (sonst blieben alle warmen Aufrufe dauerhaft kaputt).
//   5. Jeder Fehler stoppt GESCHLOSSEN: die Nachricht wird erneut zugestellt, es wird
//      NIEMALS still auf den lokalen Speicher zurueckgefallen.

const SSM_REGION_STANDARD = "eu-central-1";

// Prozesscache: ueberlebt warme Lambda-Aufrufe, stirbt mit dem Container.
let geladen = false;
let ladeVorgang = null;

// Fehlerursachen sind bewusst eine KLEINE, feste Menge: so kann kein Parameterwert und
// kein AWS-Fehlertext (der einen ARN oder Parameternamen tragen koennte) in ein Protokoll
// gelangen.
const URSACHEN = Object.freeze({
  NAMEN_FEHLEN: "ssm-parameternamen-fehlen",
  NICHT_LESBAR: "ssm-parameter-nicht-lesbar",
  LEER: "ssm-parameter-leer",
  SDK_FEHLT: "ssm-sdk-nicht-verfuegbar",
  URL_UNGUELTIG: "supabase-url-ungueltig"
});

function konfigurationsFehler(ursache) {
  const fehler = new Error(ursache);
  fehler.helmutUrsache = ursache;
  return fehler;
}

// Liest EINEN Parameter mit Entschluesselung. Wirft ausschliesslich wertfreie Fehler.
async function leseParameter(ssm, name) {
  let antwort;
  try {
    antwort = await ssm.getParameter(name);
  } catch (_) {
    // Der AWS-Fehlertext wird bewusst VERWORFEN: er enthaelt den Parameternamen und
    // teils den ARN. Die Ursache genuegt fuer die Fehlersuche.
    throw konfigurationsFehler(URSACHEN.NICHT_LESBAR);
  }
  const wert = antwort && antwort.Parameter && typeof antwort.Parameter.Value === "string"
    ? antwort.Parameter.Value.trim()
    : "";
  if (!wert) throw konfigurationsFehler(URSACHEN.LEER);
  return wert;
}

// Der echte SSM-Zugriff (lazy geladen, damit Tests und der lokale Betrieb ohne AWS-SDK
// auskommen). `deps.ssm` ersetzt im Test ausschliesslich die AWS-Netzwerkgrenze.
function erstelleSsm(env, deps) {
  if (deps && typeof deps.ssm === "object" && deps.ssm) return deps.ssm;
  const region = String((env && env.AWS_REGION) || SSM_REGION_STANDARD).trim();
  let client;
  try {
    // eslint-disable-next-line global-require
    const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
    client = new SSMClient({ region });
    return {
      getParameter: (name) => client.send(new GetParameterCommand({
        Name: name,
        WithDecryption: true            // SecureString: ohne das kaeme nur Chiffretext
      }))
    };
  } catch (_) {
    throw konfigurationsFehler(URSACHEN.SDK_FEHLT);
  }
}

// ── Der Startweg ──────────────────────────────────────────────────────────────────────────────
// Idempotent: mehrfaches Aufrufen laedt hoechstens einmal. Gleichzeitige Aufrufe teilen sich
// denselben Ladevorgang (ein einziger SSM-Aufruf je Container, nicht einer je Nachricht).
async function stelleKonfigurationSicher({ env = process.env, deps = {} } = {}) {
  if (geladen) return { geladen: true, ausCache: true };
  if (ladeVorgang) return ladeVorgang;

  ladeVorgang = (async () => {
    const urlName = String((env && env.HELMUT_SUPABASE_URL_PARAMETER) || "").trim();
    const keyName = String((env && env.HELMUT_SUPABASE_KEY_PARAMETER) || "").trim();
    if (!urlName || !keyName) throw konfigurationsFehler(URSACHEN.NAMEN_FEHLEN);

    const ssm = erstelleSsm(env, deps);
    const url = await leseParameter(ssm, urlName);
    const schluessel = await leseParameter(ssm, keyName);

    // Eine offensichtlich falsche URL (kein https) faellt hier auf, statt spaeter als
    // raetselhafter Netzfehler. Der WERT wird dabei nie ausgegeben.
    if (!/^https:\/\/[^\s/]+/i.test(url)) throw konfigurationsFehler(URSACHEN.URL_UNGUELTIG);

    // NUR im Prozessspeicher. Kein Schreiben in eine Datei, kein Protokoll, keine Rueckgabe
    // der Werte an den Aufrufer.
    env.SUPABASE_URL = url;
    env.SUPABASE_SERVICE_ROLE_KEY = schluessel;
    // OHNE diese Zeile faellt storage.js still auf den lokalen Speicher zurueck.
    env.HELMUT_STORAGE_BACKEND = "supabase";

    geladen = true;
    return { geladen: true, ausCache: false };
  })();

  try {
    return await ladeVorgang;
  } catch (fehler) {
    // FEHLSCHLAEGE WERDEN NICHT ZWISCHENGESPEICHERT: der naechste Aufruf versucht es erneut
    // (ein voruebergehender SSM-Fehler darf den Container nicht dauerhaft vergiften).
    ladeVorgang = null;
    throw fehler;
  } finally {
    if (geladen) ladeVorgang = null;
  }
}

// Prueft, ob die Fachumgebung WIRKLICH auf Supabase zeigt. Wird vom Verbraucher unmittelbar
// vor dem ersten Fachaufruf benutzt — ein stiller Rueckfall auf den lokalen Speicher ist
// damit strukturell ausgeschlossen.
function supabaseBereit(env = process.env) {
  return String(env.HELMUT_STORAGE_BACKEND || "").trim().toLowerCase() === "supabase"
    && Boolean(String(env.SUPABASE_URL || "").trim())
    && Boolean(String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim());
}

// Nur fuer Tests: den Prozesscache zuruecksetzen.
function _cacheZuruecksetzen() {
  geladen = false;
  ladeVorgang = null;
}

module.exports = {
  URSACHEN,
  stelleKonfigurationSicher,
  supabaseBereit,
  _cacheZuruecksetzen
};
