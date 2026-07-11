"use strict";

// Helmut Core V3 — Stabschef-Sprache (Sprach-Sprint).
// =============================================================================
// EINZIGE Quelle fuer die SPRACHE, in der zukuenftige V3-Inhalte formuliert
// werden. Rein statische Textbausteine (Prompt-Fragmente) — KEINE KI, KEIN Netz,
// KEINE Client-Logik, KEIN Scheduler, KEIN Datenmotor. understanding.js injiziert
// diese Bausteine in den EINEN globalen Understanding-Call; die Bausteine aendern
// NUR die Formulierungsanweisung, nicht die Datenarchitektur.
//
// Zielbild: Helmut spricht wie ein digitaler politischer Stabschef zu einer/einem
// Abgeordneten — nicht zu Entwickler/Analyst/Monitoring-Nutzer. Er sagt, was
// politisch WICHTIG ist und was JETZT zu tun ist, nicht, was alles passiert ist.
//
// WICHTIG (Trennung Fakt/Handlung): Die FAKTENFELDER bleiben strikt sachlich und
// neutral (amtlicher Vorgangstitel, reine Ereignisbeschreibung). Nur die
// HANDLUNGSFELDER sprechen im professionellen Du direkt zur/zum Abgeordneten.

// Felder, die reine Fakten tragen und NEUTRAL bleiben (kein Du, keine Wertung).
const FACT_FIELDS = ["display_title", "display_summary", "was_ist_passiert"];

// Felder, die als kurze politische Einschaetzung/Handlung formuliert werden.
const ADVISORY_FIELDS = [
  "why_relevant", "recommendation", "risk_of_no_action", "opportunity_summary",
  "recommended_communication", "action_items"
];

// --- A. Grundprinzip Stabschef-Sprache (Persona + Ton) ----------------------
// Wird VOR die Feld-Anweisungen gestellt und rahmt die Handlungsfelder.
const STABSCHEF_VOICE = [
  "Deine ROLLE: Du bist der digitale politische Stabschef einer/eines Abgeordneten.",
  "Der Leser ist eine politische Entscheidungsperson — NICHT ein Entwickler, Analyst",
  "oder Monitoring-Nutzer. Sag nicht, was alles passiert ist, sondern was politisch",
  "WICHTIG ist und was JETZT zu tun ist.",
  "SPRACHE der Handlungsfelder (" + ADVISORY_FIELDS.join(", ") + "):",
  "kurz, klar, entscheidungsorientiert, politisch relevant, handlungsnah, professionell,",
  "direkt zur/zum Abgeordneten im professionellen Du (passend zu 'Dein politischer",
  "Stabschef' / 'Was du jetzt tun solltest'). NICHT kumpelig, NICHT journalistisch,",
  "NICHT buerokratisch, NICHT wie ein Behoerdenvermerk, NICHT wie ein Newsletter,",
  "NICHT wie Medienmonitoring.",
  "FAKTENFELDER (" + FACT_FIELDS.join(", ") + ") bleiben davon UNBERUEHRT: strikt",
  "sachlich, neutral, ohne Du, ohne Bewertung — wie ein amtlicher Vorgangstitel bzw.",
  "eine reine Ereignisbeschreibung."
];

// --- I. Sprachverbote -------------------------------------------------------
// Als eigener Prompt-Block ans Ende der Feld-Anweisungen. Konkrete, vom Produkt
// benannte Floskeln, die vermieden werden sollen.
const SPRACHVERBOTE = [
  "SPRACHVERBOTE (in den Handlungsfeldern strikt vermeiden):",
  "- reine Monitoring-Sprache / neutraler Nachrichtenstil.",
  "- lange Verwaltungssaetze, verschachtelte Nebensaetze, Floskeln.",
  "- 'befasst sich mit ...', 'betrifft Zustaendigkeiten', 'ein Ausschuss ist betroffen'",
  "  ohne die politische Bedeutung UND Handlungskonsequenz zu nennen.",
  "- 'eine Einschaetzung erarbeiten' ohne konkreten Zweck.",
  "- 'pruefen' ohne zu sagen, WAS geprueft werden soll.",
  "- 'Position entwickeln' ohne politische Richtung oder Ziel.",
  "- technische Enum-Sprache / Rohwerte im Freitext."
];

// --- B. Drei Briefing-Typen (sprachlich vorbereitet) ------------------------
// STABILES Feld: briefingType existiert bereits Ende-zu-Ende (Contract-Adapter
// buildCurrentHelmutState -> currentHelmutState.briefingType -> Client-Label
// HSTAND_TYPE_LABEL). Der DATENMOTOR, der pro Tageslauf einen NICHT-'daily'-Typ
// SETZT und je Typ eigene Inhalte generiert, existiert noch NICHT (bewusst kein
// Scheduler/keine drei echten Laeufe in diesem Sprint). Hier liegt NUR die
// SPRACHE je Typ bereit, damit ein spaeterer Briefing-Motor sie nutzen kann.
const BRIEFING_TYPES = {
  // Tages-/Default-Briefing (aktueller globaler Lauf): typ-neutral, entscheidungsnah.
  daily: {
    key: "daily",
    label: "Tagesbriefing",
    // Kein zusaetzlicher typ-spezifischer Zwang: der Grundton (STABSCHEF_VOICE) genuegt.
    instruction: []
  },
  morning: {
    key: "morning",
    label: "Morgenbriefing",
    instruction: [
      "BRIEFING-TYP: Morgenbriefing. Aufgabe: Was ist HEUTE wichtig, was soll die/der",
      "Abgeordnete heute tun, worauf muss reagiert werden, was kann ignoriert werden?",
      "Sprache: entscheidend, priorisierend, klar, tagesbezogen.",
      "Richtung (Form, nicht kopieren): 'Heute intern Linie klaeren. Arbeitsrechtliche",
      "Optionen vorbereiten lassen. Bis Mittag beobachten, ob das Thema oeffentlich zieht.'"
    ]
  },
  midday: {
    key: "midday",
    label: "Mittagsbriefing",
    instruction: [
      "BRIEFING-TYP: Mittagsbriefing. Aufgabe: Was hat sich seit dem Morgen VERAENDERT,",
      "ist etwas dringlicher geworden, muss die Linie angepasst werden, gibt es neue",
      "Risiken oder Chancen? Sprache: kurz, aktualisierend, korrigierend — NICHT wie ein",
      "komplett neues Briefing.",
      "Richtung (Form, nicht kopieren): 'Seit dem Morgen keine oeffentliche Eskalation.",
      "Das Thema bleibt intern relevant. Fachliche Einschaetzung bis 16 Uhr einholen.'"
    ]
  },
  evening: {
    key: "evening",
    label: "Abendbriefing",
    instruction: [
      "BRIEFING-TYP: Abendbriefing. Aufgabe: Was muss fuer MORGEN vorbereitet sein,",
      "welche Linie braucht das Buero, welche Fragen koennten morgen kommen, was soll",
      "ueber Nacht beobachtet werden? Sprache: vorausschauend, ruhig, vorbereitend,",
      "morgenorientiert.",
      "Richtung (Form, nicht kopieren): 'Fuer morgen eine kurze Linie zu Tarifbindung",
      "vorbereiten. Moegliche Nachfragen im Ausschuss antizipieren. Entwicklung bis 8 Uhr",
      "weiter beobachten.'"
    ]
  }
};

// Erlaubte Typ-Schluessel (stabil). 'daily' ist der ehrliche Default.
const BRIEFING_TYPE_KEYS = Object.keys(BRIEFING_TYPES);

function normalizeBriefingType(value) {
  const v = String(value == null ? "" : value).trim().toLowerCase();
  return BRIEFING_TYPES[v] ? v : "daily";
}

// --- Slot-Ableitung aus der Uhrzeit (fuer den slot-aware Read-Pfad) ----------
// Reine LESE-Ableitung des BRIEFING-SLOTS aus der aktuellen Zeit — KEINE KI,
// KEINE Persistenz, KEINE Frische-Aussage. Der Slot bestimmt nur Label/Sprache,
// niemals die Daten (lastUpdated bleibt die Wahrheit).
//
// Produktentscheidung (Serverzeit, Standard-Zone Europe/Berlin):
//   00:00-10:59 -> morning   11:00-16:59 -> midday   17:00-23:59 -> evening
//
// Bewusst tageszeit-scharf: die Ableitung liefert IMMER morning/midday/evening
// (nie 'daily'). 'daily' ist der ehrliche FALLBACK, wenn die Zeit-/Zonen-
// Bestimmung fehlschlaegt (defekte Date/Intl) oder ein Override 'daily' setzt.
// Standard-Zone fuer Slot-Ableitung UND Tages-Frische (eine Quelle, siehe Produktentscheid).
const DEFAULT_TIMEZONE = "Europe/Berlin";

const SLOT_BY_HOUR = [
  { untilHour: 11, type: "morning" }, // 0..10
  { untilHour: 17, type: "midday" },  // 11..16
  { untilHour: 24, type: "evening" }  // 17..23
];

// Stunde (0-23) in der Zielzone bestimmen. Robust ueber Intl (h23 -> 00..23).
// Wirft/liefert bei Fehler null (Aufrufer faellt dann auf 'daily' zurueck).
function hourInTimezone(date, timezone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" })
      .formatToParts(d).find((p) => p.type === "hour");
    const h = part ? Number(part.value) : NaN;
    if (!Number.isInteger(h) || h < 0 || h > 23) return null;
    return h;
  } catch (_) {
    return null; // ungueltige Zeitzone o. ae. -> sicherer Fallback beim Aufrufer
  }
}

// Slot aus der Uhrzeit ableiten. date optional (Default: jetzt), timezone optional
// (Default: Europe/Berlin). Fehlerfall (ungueltige Date/Zone) -> 'daily' (nie Crash).
function deriveBriefingTypeFromDate(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  const h = hourInTimezone(date, timezone);
  if (h == null) return "daily"; // ehrlicher Fallback, keine erfundene Tageszeit
  const bucket = SLOT_BY_HOUR.find((b) => h < b.untilHour);
  return bucket ? bucket.type : "daily";
}

// Kalendertag (YYYY-MM-DD) eines Zeitpunkts in der Zielzone — fuer den ehrlichen
// Tages-Frische-Guard (ist der ANGEZEIGTE Datenstand von HEUTE?). Reine Lese-Logik,
// KEINE KI. Bei ungueltiger Date/Zone -> null (Aufrufer behauptet dann keine Frische
// UND keine Veraltung, sondern laesst den bestehenden Status unveraendert).
function dateKeyInTimezone(date, timezone = DEFAULT_TIMEZONE) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(d);
    const get = (t) => { const p = parts.find((x) => x.type === t); return p ? p.value : null; };
    const y = get("year"), m = get("month"), day = get("day");
    return (y && m && day) ? `${y}-${m}-${day}` : null;
  } catch (_) {
    return null; // ungueltige Zeitzone o. ae. -> kein Frische-Urteil (Status bleibt)
  }
}

// Typ-spezifischer Prompt-Block (Array von Zeilen). Unbekannt/leer -> 'daily'
// (kein zusaetzlicher Zwang). Fuer einen SPAETEREN Briefing-Motor gedacht — der
// aktuelle globale Understanding-Call ruft dies ohne Typ auf (bleibt 'daily').
function buildBriefingTypeInstruction(briefingType) {
  const type = BRIEFING_TYPES[normalizeBriefingType(briefingType)];
  return Array.isArray(type.instruction) ? type.instruction.slice() : [];
}

module.exports = {
  FACT_FIELDS,
  ADVISORY_FIELDS,
  STABSCHEF_VOICE,
  SPRACHVERBOTE,
  BRIEFING_TYPES,
  BRIEFING_TYPE_KEYS,
  DEFAULT_TIMEZONE,
  normalizeBriefingType,
  deriveBriefingTypeFromDate,
  dateKeyInTimezone,
  buildBriefingTypeInstruction
};
