"use strict";

// Kalender — Zeitzonen-Normalisierung (Sprint „Kalender Machbarkeit 1").
// =============================================================================
// EINE Aufgabe: aus einer Wanduhrzeit (Jahr/Monat/Tag/Stunde/Minute/Sekunde) plus
// einer TZID einen eindeutigen UTC-Zeitpunkt machen — oder ehrlich scheitern.
//
// WARUM NICHT DIE EINGEBETTETE VTIMEZONE?
// Eine ICS-Einladung bringt ihre Zeitzonenregeln als VTIMEZONE-Block mit. Diese
// Regeln stammen vom SENDER und koennen veraltet sein (Outlook schleppt teils
// jahrealte Regelsaetze mit; Exchange-Server werden nicht immer nachgezogen).
// Wir normalisieren deshalb ueber den IANA-Namen mit der Zeitzonendatenbank von
// Node/ICU — die ist im Betrieb aktuell und faellt unter unsere Kontrolle.
// Die VTIMEZONE wird bewusst NICHT ausgewertet.
//
// PREIS DIESER ENTSCHEIDUNG, ehrlich benannt: eine TZID, die wir nicht auf einen
// IANA-Namen abbilden koennen, ist damit NICHT verarbeitbar. Wir raten dann
// nicht (kein „nimm halt Europe/Berlin"), sondern lehnen kontrolliert ab.
//
// KEIN NETZ, KEINE DATEIEN, KEIN ZUSTAND — reine Berechnung.

// Windows-Zonennamen -> IANA. Outlook-Desktop und Exchange schreiben
// `TZID:W. Europe Standard Time`, Google und Apple schreiben `TZID:Europe/Berlin`.
// Ohne diese Tabelle waere jede Outlook-Desktop-Einladung unverarbeitbar.
//
// GRENZE, bewusst: das ist ein AUSSCHNITT der CLDR-Tabelle `windowsZones.xml` —
// die fuer Helmut realistischen Zonen (Deutschland, Nachbarn, EU-Hauptstaedte,
// UTC, und die wenigen Ziele deutscher Delegationsreisen). Kein Anspruch auf
// Vollstaendigkeit; was fehlt, wird abgelehnt und nicht geraten.
const WINDOWS_ZU_IANA = Object.freeze({
  "w. europe standard time": "Europe/Berlin",
  "central europe standard time": "Europe/Budapest",
  "central european standard time": "Europe/Warsaw",
  "romance standard time": "Europe/Paris",
  "gmt standard time": "Europe/London",
  "greenwich standard time": "Atlantic/Reykjavik",
  "utc": "UTC",
  "coordinated universal time": "UTC",
  "e. europe standard time": "Europe/Chisinau",
  "gtb standard time": "Europe/Bucharest",
  "fle standard time": "Europe/Kiev",
  "turkey standard time": "Europe/Istanbul",
  "russian standard time": "Europe/Moscow",
  "eastern standard time": "America/New_York",
  "central standard time": "America/Chicago",
  "mountain standard time": "America/Denver",
  "pacific standard time": "America/Los_Angeles",
  "china standard time": "Asia/Shanghai",
  "tokyo standard time": "Asia/Tokyo",
  "india standard time": "Asia/Kolkata",
  "israel standard time": "Asia/Jerusalem",
  "arabian standard time": "Asia/Dubai",
  "aus eastern standard time": "Australia/Sydney"
});

// Ergebnis-Cache der ICU-Pruefung. Ein `new Intl.DateTimeFormat` je Aufruf waere
// bei vielen VEVENTs unnoetig teuer; die Antwort ist prozessweit konstant.
const ICU_CACHE = new Map();

/**
 * Ist `name` eine von ICU akzeptierte Zeitzone?
 * @param {string} name
 * @returns {boolean}
 */
function istIanaZone(name) {
  if (typeof name !== "string" || !name) return false;
  if (ICU_CACHE.has(name)) return ICU_CACHE.get(name);
  let ok = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    ok = true;
  } catch {
    ok = false;
  }
  ICU_CACHE.set(name, ok);
  return ok;
}

/**
 * Bildet eine TZID aus einer ICS-Datei auf einen IANA-Namen ab.
 * Reihenfolge: direkter IANA-Treffer -> Windows-Tabelle -> nicht aufloesbar.
 *
 * @param {string} tzid Rohwert aus dem TZID-Parameter
 * @returns {string|null} IANA-Name oder null, wenn nicht aufloesbar
 */
function loeseTzidAuf(tzid) {
  if (typeof tzid !== "string") return null;
  let roh = tzid.trim();
  if (!roh) return null;

  // Outlook/Exchange praefixen teils mit einer eigenen Kennung, z. B.
  // `TZID:(UTC+01:00) Amsterdam, Berlin, ...` oder `/mozilla.org/.../Europe/Berlin`.
  // Ein fuehrender Schraegstrich-Pfad ist im Standard als „global TZID" erlaubt.
  if (roh.startsWith("/")) {
    const teile = roh.split("/").filter(Boolean);
    // Der IANA-Name sind die letzten ein bis zwei Segmente ("Europe/Berlin").
    for (let n = 2; n >= 1; n -= 1) {
      const kandidat = teile.slice(-n).join("/");
      if (istIanaZone(kandidat)) return kandidat;
    }
  }

  if (istIanaZone(roh)) return roh;

  // `(UTC+01:00) W. Europe Standard Time` -> Klammerpraefix entfernen.
  const ohnePraefix = roh.replace(/^\((?:UTC|GMT)[^)]*\)\s*/i, "").trim();
  if (ohnePraefix !== roh && istIanaZone(ohnePraefix)) return ohnePraefix;
  roh = ohnePraefix || roh;

  const ausTabelle = WINDOWS_ZU_IANA[roh.toLowerCase()];
  if (ausTabelle && istIanaZone(ausTabelle)) return ausTabelle;

  return null;
}

/**
 * Offset einer Zone zu einem konkreten UTC-Zeitpunkt, in Millisekunden.
 * Positiv oestlich von Greenwich (Europe/Berlin im Sommer: +7 200 000).
 *
 * Der Weg fuehrt bewusst ueber `formatToParts`: das ist die einzige Stelle in
 * Node, die die ICU-Zeitzonendatenbank ohne Fremdpaket zugaenglich macht.
 */
function zonenOffsetMs(utcMs, ianaZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const p = {};
  for (const teil of fmt.formatToParts(new Date(utcMs))) {
    if (teil.type !== "literal") p[teil.type] = teil.value;
  }
  // `hour24` kann in manchen ICU-Staenden als "24" statt "00" erscheinen.
  const stunde = Number(p.hour) === 24 ? 0 : Number(p.hour);
  const alsUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    stunde, Number(p.minute), Number(p.second)
  );
  return alsUtc - utcMs;
}

/**
 * Wanduhrzeit in einer Zone -> UTC-Zeitpunkt.
 *
 * ZWEI ECHTE SONDERFAELLE, beide bewusst entschieden und dokumentiert:
 *  - MEHRDEUTIG (Rueckstellung Ende Oktober, 02:30 gibt es zweimal): wir waehlen
 *    das ERSTE Vorkommen, also noch die Sommerzeit. RFC 5545 legt nichts fest.
 *  - NICHT EXISTENT (Vorstellung Ende Maerz, 02:30 gibt es nicht): das Ergebnis
 *    rutscht um die Sprungweite nach vorn (02:30 -> 03:30 Ortszeit). Kein Fehler,
 *    aber ein gemeldeter Hinweis.
 *
 * @returns {{utcMs:number, hinweis:(string|null)}}
 */
function wanduhrZuUtc(teile, ianaZone) {
  const { jahr, monat, tag, stunde, minute, sekunde } = teile;
  const alsWaereUtc = Date.UTC(jahr, monat - 1, tag, stunde, minute, sekunde);

  // Erste Naeherung mit dem Offset, der am geratenen Zeitpunkt gilt …
  const off1 = zonenOffsetMs(alsWaereUtc, ianaZone);
  let ms = alsWaereUtc - off1;
  // … und eine Korrektur, falls der Zeitpunkt jenseits einer Umstellgrenze lag.
  const off2 = zonenOffsetMs(ms, ianaZone);
  if (off2 !== off1) ms = alsWaereUtc - off2;

  // Gegenprobe: ergibt der gefundene Zeitpunkt wieder die eingegebene Wanduhrzeit?
  // Wenn nicht, lag eine nicht existente Ortszeit vor (Vorstellung).
  const offFinal = zonenOffsetMs(ms, ianaZone);
  let hinweis = null;
  if (alsWaereUtc - offFinal !== ms) {
    hinweis = "ortszeit-nicht-existent";
    ms = alsWaereUtc - offFinal;
  }
  return { utcMs: ms, hinweis };
}

module.exports = {
  WINDOWS_ZU_IANA,
  istIanaZone,
  loeseTzidAuf,
  zonenOffsetMs,
  wanduhrZuUtc
};
