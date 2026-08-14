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

function grenzenFuer(anbieter, env = process.env) {
  const name = String(anbieter || "").trim().toLowerCase();
  const basis = STANDARD_GRENZEN[name] || { minute: 0, tag: 0 };
  const varName = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const minute = Number(env && env[`HELMUT_ANBIETER_${varName}_MINUTE`]);
  const tag = Number(env && env[`HELMUT_ANBIETER_${varName}_TAG`]);
  return {
    minute: Number.isFinite(minute) && minute >= 0 ? minute : basis.minute,
    tag: Number.isFinite(tag) && tag >= 0 ? tag : basis.tag
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
async function melde({ anbieter, modell = null, ok, grund = null, env = process.env, deps = {} } = {}) {
  if (!steuerungAktiv(env)) return { gemeldet: false, grund: "steuerung-aus" };
  const storage = deps.storage || require("./storage");
  const schluessel = grenzSchluessel({ anbieter, modell });
  const schutz = deps.schutz || STANDARD_SCHUTZ;
  const antwort = await (deps.melde || ((o) => storage.anbieterMelde(o)))({
    schluessel, ok: Boolean(ok), schwelle: schutz.schwelle,
    offenMs: schutz.offenMs, erholung: schutz.erholung, grund
  }).catch(() => ({ verfuegbar: false }));
  return { gemeldet: antwort && antwort.verfuegbar !== false, zustand: (antwort && antwort.zustand) || null };
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
  STANDARD_GRENZEN,
  STANDARD_SCHUTZ,
  steuerungAktiv,
  grenzSchluessel,
  grenzenFuer,
  wiederholungMs,
  reserviere,
  melde,
  mitAnbietergrenze
};
