"use strict";

// Helmut — VERTEILTE ANBIETERSTEUERUNG (OP-30-Haertungssprint, 2026-08-14, Auftrag Phase 4).
// =============================================================================================
// WARUM ES DAS BRAUCHT (bestaetigter Befund 4): `helmut_klasse_belege` begrenzt ausschliesslich
// GLEICHZEITIGE Arbeit. Externe Anbieter begrenzen aber nach RATE (Anfragen/Minute) und
// TAGESKONTINGENT — und sie antworten bei Ueberschreitung mit Fehlern, nicht mit Warten.
// Fuenf gleichzeitige Abrufe unter einer Minutenrate von 60 sind etwas voellig anderes als
// fuenf gleichzeitige Abrufe unter einer Rate von 6.
//
// WAS DIESE SCHICHT LEISTET (alles atomar in der Datenbank, damit es ueber Instanzen hinweg
// gilt — eine prozesslokale Grenze ist bei mehreren Lambda-Verbrauchern wertlos):
//   1. Reservierung gegen Minuten- UND Tagesgrenze,
//   2. Rueckgabe des FRUEHESTEN zulaessigen naechsten Zeitpunkts,
//   3. VERTAGUNG des Auftrags statt Fehler bei ausgeschoepftem Limit,
//   4. exponentielle Wiederholung mit Jitter (deterministisch aus der Auftrags-ID),
//   5. Schutzschaltung bei gehaeuften Timeouts/Anbieterfehlern,
//   6. automatische Erholung nach begrenzter Zeit,
//   7. KEINE Warteschleife innerhalb einer Function — gewartet wird, indem der AUFTRAG
//      vertagt wird und die Function endet.
//
// KEINE ERFUNDENEN ANBIETERWERTE: die Standardwerte unten sind bewusst KLEIN und sicher
// gewaehlt, nicht aus Anbieterdokumentation abgeleitet. Welche Werte in Production gelten,
// ist eine Betreiberentscheidung anhand der echten Vertragsbedingungen — jede Klasse ist
// ueber eine eigene Umgebungsvariable einstellbar (docs/betrieb/env-inventar.md).
//
// FLAGGRENZE: `HELMUT_ANBIETER_STEUERUNG` (Default AUS). Ohne das Flag verhaelt sich alles
// byte-identisch wie bisher — diese Schicht ist dann eine inerte Verzweigung.

const crypto = require("crypto");
const { isStrictGoogleNewsUrl, isStrictGoogleSearchUrl } = require("./provider-url");

// ── Sicher gewaehlte Standardwerte (KEINE Anbieterzusagen, nur konservative Deckel) ──────────
// Sie sind so niedrig, dass sie im Zweifel bremsen statt zu ueberfahren. Jeder Wert ist
// einzeln erhoehbar, sobald die echte Anbieterbedingung belegt ist.
const STANDARD_GRENZEN = Object.freeze({
  // Google-Auflösung (OP-15 ist der belegte Blocker: die reale Rate ist UNBEKANNT).
  "google": { minute: 30, tag: 0 },
  // KI-Anbieter. Das TAGESBUDGET bleibt bei helmut_reserve_llm_call — hier steht bewusst 0
  // (nicht pruefen), damit nichts doppelt gezaehlt wird. Nur die RATE ist neu.
  "openai": { minute: 20, tag: 0 },
  "azure-openai": { minute: 20, tag: 0 },
  // Allgemeiner Quellenabruf (RSS, Webseiten) — pro Anbieter/Host.
  "quelle": { minute: 60, tag: 0 }
});

const STANDARD_SCHUTZ = Object.freeze({
  schwelle: 5,        // aufeinanderfolgende Fehler bis zur Sperre
  offenMs: 60000,     // Sperrdauer
  erholung: 2         // Erfolge im Halbzustand bis zur vollstaendigen Erholung
});

// Die zugehoerige PostgreSQL-Funktion nimmt `integer` entgegen. Ein Wert, der
// zwar in JavaScript endlich ist, aber nicht in diesen Datentyp passt, darf
// deshalb nie als aufnahmebereit gelten und erst am RPC in eine Dauervertagung
// laufen.
const POSTGRES_INTEGER_MAX = 2147483647;

function steuerungAktiv(env = process.env) {
  return String((env && env.HELMUT_ANBIETER_STEUERUNG) || "").trim().toLowerCase() === "on";
}

// Der Schluessel bildet exakt die vom Auftrag geforderten Dimensionen ab. Weggelassene
// Dimensionen erzeugen einen groeberen (und damit strengeren) Schluessel — nie einen
// zufaelligen.
function grenzSchluessel({ anbieter, modell = null, klasse = null, mandat = null } = {}) {
  const teile = [String(anbieter || "unbekannt").trim().toLowerCase()];
  if (modell) teile.push(String(modell).trim().toLowerCase());
  if (klasse) teile.push(String(klasse).trim().toLowerCase());
  if (mandat) teile.push(String(mandat).trim().toLowerCase());
  return teile.join("|");
}

function positiveGrenze(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { gueltig: false, wert: null, grund: "fehlt" };
  // Nur kanonische positive Dezimalzahlen. Schreibweisen wie 0x10 oder 1e3
  // sind fuer Betreiberwerte unnoetig mehrdeutig und umgehen sonst die
  // textuelle Validierung, obwohl die Datenbank nur `integer` akzeptiert.
  if (!/^[1-9]\d*$/.test(text)) {
    return { gueltig: false, wert: null, grund: "keine-kanonische-positive-ganzzahl" };
  }
  const n = Number(text);
  // Anbieterfenster zaehlen ganze Aufrufe. Ein Dezimalwert darf deshalb nicht
  // still abgerundet werden: "0.5" wuerde sonst trotz positivem Text zu 0 und
  // damit in der Datenbank zur historisch unbegrenzten Semantik werden.
  if (!Number.isSafeInteger(n) || n <= 0 || n > POSTGRES_INTEGER_MAX) {
    return { gueltig: false, wert: null, grund: "ausserhalb-postgresql-integer" };
  }
  return { gueltig: true, wert: n, grund: null };
}

function istPositiveGanzzahl(value) {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value > 0 && value <= POSTGRES_INTEGER_MAX;
}

function grenzenFuer(anbieter, env = process.env) {
  const name = String(anbieter || "").trim().toLowerCase();
  const basis = STANDARD_GRENZEN[name] || { minute: 0, tag: 0 };
  const varName = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const minuteName = `HELMUT_ANBIETER_${varName}_MINUTE`;
  const tagName = `HELMUT_ANBIETER_${varName}_TAG`;
  const minute = positiveGrenze(env && env[minuteName]);
  const tag = positiveGrenze(env && env[tagName]);
  return {
    minute: minute.gueltig ? minute.wert : basis.minute,
    tag: tag.gueltig ? tag.wert : basis.tag,
    konfiguriert: { minute: minute.gueltig, tag: tag.gueltig },
    variablen: { minute: minuteName, tag: tagName },
    befunde: [
      ...(!minute.gueltig ? [`minute-${minute.grund}`] : []),
      ...(!tag.gueltig ? [`tag-${tag.grund}`] : [])
    ]
  };
}

// Aufnahmebereitschaft ist strenger als ein konservativer Laufzeit-Default:
// fuer eine Kapazitaetsfreigabe muessen Minuten- UND Tagesgrenze positiv und
// explizit gesetzt sein. Insbesondere bedeutet 0 hier nie "unbegrenzt".
function aufnahmeBereitschaft({ anbieter = "google", env = process.env, grenzen = null } = {}) {
  const name = String(anbieter || "").trim().toLowerCase();
  const g = grenzen || grenzenFuer(name, env);
  // Auch ein injiziertes Grenzobjekt (Tests/Adapter) muss seine Herkunft
  // explizit belegen. Nur Zahlen zu reichen waere ein Bypass um die Pflicht,
  // beide Betreiberwerte tatsaechlich zu konfigurieren.
  const explizit = Boolean(g && g.konfiguriert
    && g.konfiguriert.minute === true && g.konfiguriert.tag === true);
  const befunde = [];
  if (!steuerungAktiv(env)) befunde.push("anbietersteuerung-aus");
  if (!g || !istPositiveGanzzahl(g.minute)) befunde.push("minutengrenze-fehlt-oder-ungueltig");
  if (!g || !istPositiveGanzzahl(g.tag)) befunde.push("tagesgrenze-fehlt-oder-ungueltig");
  if (!explizit) befunde.push("grenzen-nicht-beide-explizit-konfiguriert");
  return {
    bereit: befunde.length === 0,
    anbieter: name,
    minute: g && istPositiveGanzzahl(g.minute) ? Number(g.minute) : null,
    tag: g && istPositiveGanzzahl(g.tag) ? Number(g.tag) : null,
    befunde: Array.from(new Set(befunde)),
    variablen: (g && g.variablen) || null
  };
}

// Praezisierung 29.08.: Redirect-Hops und Retry-Versuche reservieren seit diesem
// Zweig JE HOP neu (crawler.js, fetchUrl/fetchPardokText) — der frueher hier
// benannte Umleitungs-Luecke ist damit prozesslokal geschlossen. `false` bleibt
// trotzdem bewusst stehen: die Reservierung ist eine DB-Runde je Hop, aber ein
// lueckenloser, VERTEILT bewiesener Per-HTTP-Versuch-Vertrag (inkl. aller
// Aufloesungs- und Anreicherungspfade unter Last) ist nicht erbracht. Das
// laesst sich nicht ehrlich mit einem positiven Env-Wert wegkonfigurieren;
// eine belastbare 500er-Kapazitaetsfreigabe bleibt bis zu einem verteilten
// Per-Transport-Hop-Vertrag gesperrt. Diese Aussage aendert keine Laufzeitdaten.
const TRANSPORT_GRENZEN_STATUS = Object.freeze({
  proHttpVersuchGlobal: false,
  blocker: "provider-transport-nicht-je-http-versuch-global-begrenzt"
});

function kapazitaetsBereitschaft({ anbieter = "google", env = process.env, grenzen = null } = {}) {
  const konfiguration = aufnahmeBereitschaft({ anbieter, env, grenzen });
  const befunde = [...konfiguration.befunde];
  if (!TRANSPORT_GRENZEN_STATUS.proHttpVersuchGlobal) {
    befunde.push(TRANSPORT_GRENZEN_STATUS.blocker);
  }
  return {
    bereit: befunde.length === 0,
    konfigurationBereit: konfiguration.bereit,
    anbieter: konfiguration.anbieter,
    befunde: Array.from(new Set(befunde)),
    transport: TRANSPORT_GRENZEN_STATUS
  };
}

// ── Exponentielle Wiederholung MIT JITTER, deterministisch ────────────────────────────────────
// Deterministisch aus (Kennung, Versuch): zwei Instanzen desselben Auftrags berechnen
// dieselbe Wartezeit, aber zwei VERSCHIEDENE Auftraege desselben Anbieters laufen
// auseinander — genau das verhindert den Gleichschritt (Thundering Herd) nach einer
// Anbieterstoerung. Kein Math.random: dieselbe Regel wie im uebrigen Datenmotor.
function wiederholungMs(versuch, kennung, { basisMs = 1000, deckelMs = 15 * 60 * 1000 } = {}) {
  const n = Math.max(1, Number(versuch) || 1);
  const roh = Math.min(deckelMs, basisMs * Math.pow(2, n - 1));
  const hash = crypto.createHash("sha256").update(`${kennung || "?"}:${n}`).digest();
  // Jitter im Bereich [50 %, 100 %] der Rohwartezeit ("full jitter" nach unten begrenzt,
  // damit eine Wiederholung nie faktisch sofort erfolgt).
  const anteil = 0.5 + (hash[0] / 255) * 0.5;
  return Math.max(basisMs, Math.round(roh * anteil));
}

// ── Die Reservierung ──────────────────────────────────────────────────────────────────────────
// Rueckgabe:
//   { erlaubt: true }                                  -> Aufruf darf stattfinden
//   { erlaubt: false, vertagen: true, wartenMs, grund } -> Auftrag VERTAGEN (kein Fehler!)
// Fail closed: ist die Steuerung eingeschaltet, aber die Datenbankfunktion nicht verfuegbar,
// wird NICHT stillschweigend durchgelassen — der Auftrag wird vertagt und der Grund benannt.
async function reserviere({
  anbieter, modell = null, klasse = null, mandat = null, menge = 1,
  env = process.env, deps = {}
} = {}) {
  if (!steuerungAktiv(env)) return { erlaubt: true, grund: "steuerung-aus", geprueft: false };

  const storage = deps.storage || require("./storage");
  const schluessel = grenzSchluessel({ anbieter, modell, klasse, mandat });
  const grenzen = deps.grenzen || grenzenFuer(anbieter, env);

  // Google News ist der belegte Aufnahmeengpass. Sobald seine verteilte
  // Steuerung aktiv ist, sind positive Minuten- UND Tagesgrenzen Pflicht.
  // Fehlend, leer, 0 oder ungueltig => vor jedem DB-/Netzaufruf vertagen.
  if (String(anbieter || "").trim().toLowerCase() === "google") {
    const bereit = aufnahmeBereitschaft({ anbieter, env, grenzen });
    if (!bereit.bereit) {
      return {
        erlaubt: false, vertagen: true, geprueft: false, schluessel,
        wartenMs: 60000,
        grund: `anbietergrenzen-nicht-aufnahmebereit: ${bereit.befunde.join(",")}`,
        grenzenBereitschaft: bereit
      };
    }
  }

  const antwort = await (deps.reserviere || ((o) => storage.anbieterReserviere(o)))({
    schluessel, menge, grenzeMinute: grenzen.minute, grenzeTag: grenzen.tag
  }).catch((fehler) => ({ verfuegbar: false, grund: String((fehler && fehler.message) || "unbekannt") }));

  if (!antwort || antwort.verfuegbar === false) {
    return {
      erlaubt: false, vertagen: true, geprueft: false,
      wartenMs: 60000,
      grund: `anbietersteuerung-nicht-pruefbar: ${(antwort && antwort.grund) || "unbekannt"}`
    };
  }
  if (antwort.erlaubt === true) {
    return { erlaubt: true, geprueft: true, schluessel, grenzen };
  }
  return {
    erlaubt: false, vertagen: true, geprueft: true, schluessel,
    // Der frueheste zulaessige Zeitpunkt kommt aus der Datenbank (Fensterende), nicht aus
    // einer Schaetzung. Bei offener Schutzschaltung ist es die Restsperrzeit.
    wartenMs: Math.max(1000, Number(antwort.fruehesteMs) || 60000),
    grund: `anbietergrenze-${antwort.grund || "unbekannt"}`
  };
}

// Ergebnis eines Anbieteraufrufs melden (Schutzschaltung). Ein `false` bei einem FACHLICHEN
// Fehler (z. B. leeres Suchergebnis) waere falsch — gemeldet werden nur Transport- und
// Anbieterfehler (Timeouts, 429, 5xx).
async function melde({
  anbieter, modell = null, klasse = null, mandat = null,
  ok, grund = null, env = process.env, deps = {}
} = {}) {
  if (!steuerungAktiv(env)) return { gemeldet: false, grund: "steuerung-aus" };
  const storage = deps.storage || require("./storage");
  // Exakt derselbe Dimensionsvertrag wie bei `reserviere`: sonst oeffnet die
  // Meldung einen anderen Schutzschalter als die naechste Reservierung prueft.
  const schluessel = grenzSchluessel({ anbieter, modell, klasse, mandat });
  const schutz = deps.schutz || STANDARD_SCHUTZ;
  const antwort = await (deps.melde || ((o) => storage.anbieterMelde(o)))({
    schluessel, ok: Boolean(ok), schwelle: schutz.schwelle,
    offenMs: schutz.offenMs, erholung: schutz.erholung, grund
  }).catch(() => ({ verfuegbar: false }));
  return { gemeldet: antwort && antwort.verfuegbar !== false, zustand: (antwort && antwort.zustand) || null };
}

// ── ANBIETERKLASSE AUS EINER ADRESSE ──────────────────────────────────────────────────────────
// Bildet die vom Auftrag geforderten Anbieter ab, ohne eine Liste zu raten: Google-News und
// Google-Suche haben eigene Grenzen (sie sind der belegte Engpass, OP-15), alles Uebrige
// faellt in eine gemeinsame, konservative Klasse `quelle` — je HOST getrennt, damit eine
// langsame Quelle nicht alle anderen ausbremst.
function anbieterAusUrl(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch (_) { return { anbieter: "quelle" }; }
  const host = parsed.hostname.toLowerCase();
  if (isStrictGoogleNewsUrl(parsed.toString())) return { anbieter: "google", modell: "news" };
  // Auch die allgemeine Google-Suche nur ueber die heute tatsaechlich erzeugte,
  // exakte HTTPS-Domain klassifizieren. Subdomain-/Suffix-Traps bleiben Quelle.
  if (isStrictGoogleSearchUrl(parsed.toString())) {
    return { anbieter: "google", modell: "suche" };
  }
  return { anbieter: "quelle", modell: host };
}

// ── WAS EIN ANBIETERFEHLER IST ────────────────────────────────────────────────────────────────
// NUR Transport- und Anbieterfehler zaehlen gegen die Schutzschaltung: Timeout, HTTP 429,
// HTTP 5xx, Verbindungsabbruch. Ein fachlich LEERES Ergebnis (0 Treffer, leerer Feed) ist
// KEIN Anbieterfehler — sonst wuerde eine ruhige Quelle den Anbieter sperren.
function istAnbieterFehler(fehlerOderStatus) {
  if (typeof fehlerOderStatus === "number") {
    return fehlerOderStatus === 429 || fehlerOderStatus >= 500;
  }
  const text = String((fehlerOderStatus && fehlerOderStatus.message) || fehlerOderStatus || "").toLowerCase();
  if (!text) return false;
  return /timeout|etimedout|econnreset|econnrefused|enotfound|socket hang up|aborted|429|50[0-9]\b|too many requests/.test(text);
}

// ── ERNEUERBARES LEASE + ECHTES ABBRUCHSIGNAL ─────────────────────────────────────────────────
// Ein externer Aufruf darf nie laenger laufen als sein Klassen-Slot gilt. Dieses Wachtuch
// erneuert den Slot in kurzen Abstaenden und BRICHT DEN AUFRUF AB, sobald die Erneuerung
// scheitert (der Slot wurde weggeraeumt, ein anderer arbeitet jetzt in dieser Grenze).
// Das Abbruchsignal ist ein echter AbortController — kein Merker, den niemand liest.
function starteLeaseWache({ klassen, klasse, slot, ttlMs = 60000, deps = {} } = {}) {
  const abbruch = new AbortController();
  if (!klassen || !slot) return { signal: abbruch.signal, beenden: () => {}, verloren: () => false };
  let verloren = false;
  const intervall = Math.max(5000, Math.floor(ttlMs / 3));
  const uhr = (deps.setInterval || setInterval)(async () => {
    const r = await klassen.erneuere(slot, { ttlMs }).catch(() => ({ erneuert: false }));
    if (!r || r.erneuert !== true) {
      verloren = true;
      abbruch.abort();                    // ECHTER Abbruch des laufenden Aufrufs
      (deps.clearInterval || clearInterval)(uhr);
    }
  }, intervall);
  if (uhr && typeof uhr.unref === "function") uhr.unref();
  return {
    signal: abbruch.signal,
    verloren: () => verloren,
    beenden: () => (deps.clearInterval || clearInterval)(uhr)
  };
}

// Bequemer Gesamtweg: reservieren -> aufrufen -> melden. Der Aufrufer bekommt entweder das
// Ergebnis oder eine VERTAGUNG (dieselbe Form, die die Fachhandler ohnehin kennen:
// { zurueckgestellt: true, grund, langeWarten }).
async function mitAnbietergrenze(bereich, aufruf, { env = process.env, deps = {} } = {}) {
  const res = await reserviere({ ...bereich, env, deps });
  if (!res.erlaubt) {
    return {
      zurueckgestellt: true,
      grund: res.grund,
      // Eine Tagesgrenze oder eine offene Schutzschaltung braucht eine LANGE Wartezeit,
      // eine Minutengrenze eine kurze.
      langeWarten: res.wartenMs > 5 * 60 * 1000,
      wartenMs: res.wartenMs
    };
  }
  try {
    const ergebnis = await aufruf();
    await melde({ ...bereich, ok: true, env, deps });
    return ergebnis;
  } catch (fehler) {
    await melde({ ...bereich, ok: false, grund: String((fehler && fehler.message) || "").slice(0, 200), env, deps });
    throw fehler;
  }
}

module.exports = {
  anbieterAusUrl,
  istAnbieterFehler,
  starteLeaseWache,
  STANDARD_GRENZEN,
  STANDARD_SCHUTZ,
  steuerungAktiv,
  grenzSchluessel,
  grenzenFuer,
  aufnahmeBereitschaft,
  kapazitaetsBereitschaft,
  TRANSPORT_GRENZEN_STATUS,
  wiederholungMs,
  reserviere,
  melde,
  mitAnbietergrenze
};
