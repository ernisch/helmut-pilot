"use strict";

// Helmut — VERBINDLICHER FRISCHEVERTRAG für das morgendliche Briefing.
// =============================================================================
// EINE Wahrheit für die Frage „ist das, was der Abgeordnete gerade sieht, das
// HEUTIGE Briefing?". Reine Logik: KEIN Netz, KEINE KI, KEINE Persistenz,
// KEIN Zugriff auf Speicher oder Umgebung ausser den hier benannten Schaltern.
//
// Warum ein eigenes Modul: die Frischeaussage entstand bisher an drei Stellen
// unabhaengig voneinander (server.decorateBriefingFreshness, briefingContract
// Tages-Guard, lage.js Berlin-Tagesschluessel). Drei Implementierungen derselben
// Aussage sind drei Gelegenheiten fuer falsches Gruen. Ab hier gilt: wer eine
// Frischeaussage trifft — Cron, API, Cache, Oberflaeche — nutzt DIESES Modul.
//
// Der Vertrag in einem Satz: Helmut behauptet „aktuell" nur dann, wenn fuer den
// HEUTIGEN Berliner Kalendertag ein erfolgreicher Briefinglauf BELEGT ist und die
// zugrunde liegenden Daten nicht aelter sind als die Vertragsgrenze. Fehlt der
// Beleg, ist er fehlgeschlagen oder sind die Daten zu alt, sagt Helmut ehrlich
// „Briefing noch nicht aktuell" — es gibt KEINEN Rueckfall auf den Vortag.

const TZ = "Europe/Berlin";

// --- Vertragskennung --------------------------------------------------------
// Steht in jeder Lauf-Quittung. Aeltere Quittungen bleiben lesbar; eine Quittung
// aus einer NEUEREN Vertragsversion wird nicht als Beleg akzeptiert (ehrlich
// „unbekannt" statt stillschweigend falsch ausgelegt).
const VERTRAG_VERSION = 1;

// --- Zustaende --------------------------------------------------------------
const STATUS_AKTUELL = "aktuell";
const STATUS_NICHT_AKTUELL = "nicht_aktuell";

// Gruende, warum der heutige Stand NICHT als aktuell gilt (maschinenlesbar).
const GRUND = {
  AKTUELL: "aktuell",
  LAUF_FEHLT: "lauf-fehlt",
  LAUF_FEHLGESCHLAGEN: "lauf-fehlgeschlagen",
  LAUF_VERALTET: "lauf-veraltet",
  LAUF_UNBEKANNTE_VERSION: "lauf-unbekannte-version",
  DATEN_VERALTET: "daten-veraltet",
  DATENSTAND_UNBEKANNT: "datenstand-unbekannt",
  ZEITZONE_UNBESTIMMT: "zeitzone-unbestimmt"
};

// Der EINE Text, den die Oberflaeche zeigt, wenn kein heutiges Briefing belegt
// ist. Bewusst identisch fuer alle Gruende — der Nutzer braucht die Wahrheit,
// nicht die Fehlerklasse; die Klasse steht im Feld `grund` fuer Betrieb/Admin.
const LABEL_NICHT_AKTUELL = "Briefing noch nicht aktuell";
const LABEL_AKTUELL = "Aktuell";

const GRUND_TEXT = {
  [GRUND.AKTUELL]: "Das heutige Morgenbriefing ist erzeugt und die Daten sind aktuell.",
  [GRUND.LAUF_FEHLT]: "Für heute liegt noch kein erzeugtes Morgenbriefing vor.",
  [GRUND.LAUF_FEHLGESCHLAGEN]: "Der heutige Briefinglauf ist fehlgeschlagen.",
  [GRUND.LAUF_VERALTET]: "Der letzte Briefinglauf stammt nicht vom heutigen Tag.",
  [GRUND.LAUF_UNBEKANNTE_VERSION]: "Der hinterlegte Lauf stammt aus einer neueren Vertragsversion und wird nicht als Beleg gewertet.",
  [GRUND.DATEN_VERALTET]: "Die zugrunde liegenden Daten sind nicht ausreichend aktuell.",
  [GRUND.DATENSTAND_UNBEKANNT]: "Der Datenstand ist nicht belegbar.",
  [GRUND.ZEITZONE_UNBESTIMMT]: "Der Berliner Kalendertag ist nicht bestimmbar."
};

// --- Meldungsklassen (Punkt 3/4 des Vertrags) -------------------------------
// `neu`               = seit dem letzten erfolgreichen Morgenbriefing entstanden
//                       (schliesst Meldungen vom SPAETEN VORABEND ausdruecklich ein).
// `weiterhin_relevant`= aelter, aber im laufenden Vorgangsfenster.
// `hintergrund`       = deutlich aelter; nur als Einordnung.
// KEINE dieser Klassen veraendert je das tatsaechliche Datum einer Meldung.
const KLASSE_NEU = "neu";
const KLASSE_WEITERHIN = "weiterhin_relevant";
const KLASSE_HINTERGRUND = "hintergrund";
const KLASSE_UNDATIERT = "undatiert";

const KLASSE_LABEL = {
  [KLASSE_NEU]: "Neu seit dem letzten Briefing",
  [KLASSE_WEITERHIN]: "Weiterhin relevant",
  [KLASSE_HINTERGRUND]: "Hintergrund",
  [KLASSE_UNDATIERT]: "Ohne belegtes Datum"
};

// --- Schalter ---------------------------------------------------------------
// Der Vertrag ist EHRLICHKEIT, kein Funktionsumfang — deshalb Default AN.
// `HELMUT_BRIEFING_FRISCHE=off` ist ein reiner Not-Aus fuer den Betreiber
// (Ruecknahme ohne Redeploy des Codes), KEIN Aktivierungsschalter.
function vertragAktiv(env = process.env) {
  const raw = String((env && env.HELMUT_BRIEFING_FRISCHE) || "").trim().toLowerCase();
  return !["off", "0", "false", "aus", "nein"].includes(raw);
}

function positiveZahl(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Hoechstalter des juengsten verstandenen Vorgangs, ab dem der Datenbestand als
// „nicht ausreichend aktuell" gilt (Vertragspunkt 5). Default 24 h: ein voller
// Tageszyklus darf ausfallen, ohne dass Helmut luegt — ab dann meldet er ehrlich.
function maxDatenalterStunden(env = process.env) {
  return positiveZahl(env && env.HELMUT_BRIEFING_MAX_DATENALTER_H, 24);
}

// Wie weit reicht das Briefingfenster zurueck, wenn KEIN vorheriger erfolgreicher
// Lauf bekannt ist? Default 8 h vor Tagesbeginn = ab 16:00 Berliner Vorabend.
// Damit sind Meldungen vom spaeten Vorabend im Morgenbriefing „neu" (Punkt 3).
function vorabendStunden(env = process.env) {
  return positiveZahl(env && env.HELMUT_BRIEFING_VORABEND_H, 8);
}

// Ab wann ist ein aelterer Vorgang „Hintergrund" statt „weiterhin relevant"?
function relevanzTage(env = process.env) {
  return positiveZahl(env && env.HELMUT_BRIEFING_RELEVANZ_TAGE, 14);
}

// Wie weit zurueck darf der letzte erfolgreiche Lauf hoechstens liegen, damit er
// noch den Fensteranfang bestimmt? Danach greift der Vorabend-Standard (Default 3 Tage).
function maxRueckblickTage(env = process.env) {
  return positiveZahl(env && env.HELMUT_BRIEFING_MAX_RUECKBLICK_TAGE, 3);
}

// =============================================================================
// 1 · Zeitzone: Europe/Berlin ist verbindlich, inklusive Sommerzeit
// =============================================================================

function alsDatum(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Berliner Kalendertag als "YYYY-MM-DD". Nutzt die IANA-Zone (kein fester
// Stundenversatz) — damit stimmt der Tageswechsel auch an Umstellungstagen.
function berlinTagKey(value = new Date()) {
  const d = alsDatum(value);
  if (!d) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(d);
    const get = (t) => { const p = parts.find((x) => x.type === t); return p ? p.value : null; };
    const y = get("year"), m = get("month"), day = get("day");
    return (y && m && day) ? `${y}-${m}-${day}` : null;
  } catch (_) {
    return null; // ungueltige Zone -> KEIN Frischeurteil (ehrlich unbestimmt)
  }
}

// Tatsaechlicher Berliner UTC-Versatz in Minuten zum gegebenen Zeitpunkt
// (+60 Winterzeit, +120 Sommerzeit). Gemessen, nicht angenommen.
function berlinOffsetMinuten(value = new Date()) {
  const d = alsDatum(value);
  if (!d) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(d);
    const get = (t) => { const p = parts.find((x) => x.type === t); return p ? Number(p.value) : null; };
    const y = get("year"), m = get("month"), day = get("day");
    let h = get("hour");
    const min = get("minute"), s = get("second");
    if ([y, m, day, h, min, s].some((n) => !Number.isFinite(n))) return null;
    if (h === 24) h = 0; // manche ICU-Staende melden Mitternacht als 24
    const alsWaereUtc = Date.UTC(y, m - 1, day, h, min, s);
    return Math.round((alsWaereUtc - d.getTime()) / 60000);
  } catch (_) {
    return null;
  }
}

// Berliner Wanduhrzeit -> echter Zeitpunkt (UTC-Instant). Iterativ, weil der
// Versatz selbst vom gesuchten Zeitpunkt abhaengt; zwei Runden genuegen, die
// dritte ist der Beweis der Stabilitaet.
// SOMMERZEITRAENDER (praezisiert im Audit 2026-08-10):
//   * NICHT EXISTIERENDE Ortszeit (29.03., 02:00–02:59 gibt es nicht): das Verfahren
//     konvergiert nicht, sondern pendelt zwischen zwei Kandidaten; nach der festen
//     Rundenzahl liefert es DETERMINISTISCH den Zeitpunkt VOR der Luecke (02:30 ->
//     01:30 MEZ). Es erfindet keine nicht existierende Ortszeit und wirft nicht.
//   * DOPPELTE Ortszeit (25.10., 02:00–02:59 gibt es zweimal): es liefert
//     deterministisch das ERSTE Vorkommen (MESZ).
// Beides ist fuer den Vertrag folgenlos: der einzige Aufruf ist `berlinTagStart`
// mit 00:00, und Mitternacht liegt in Europe/Berlin nie in einem dieser Bereiche.
function berlinZeitpunkt(tagKey, stunde = 0, minute = 0) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tagKey || ""));
  if (!m) return null;
  const soll = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), stunde, minute, 0);
  let ts = soll - 60 * 60000;
  for (let i = 0; i < 3; i += 1) {
    const off = berlinOffsetMinuten(new Date(ts));
    if (off === null) return null;
    const naechster = soll - off * 60000;
    if (naechster === ts) break;
    ts = naechster;
  }
  return new Date(ts);
}

// Beginn (00:00) des Berliner Kalendertags, zu dem `value` gehoert.
function berlinTagStart(value = new Date()) {
  const key = berlinTagKey(value);
  return key ? berlinZeitpunkt(key, 0, 0) : null;
}

function berlinTagVerschieben(tagKey, tage) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tagKey || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(tage || 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function istSelberBerlinTag(a, b) {
  const ka = berlinTagKey(a), kb = berlinTagKey(b);
  return Boolean(ka && kb && ka === kb);
}

// Anzeigezeit einer Meldung — IMMER aus ihrem TATSAECHLICHEN Zeitstempel.
// „Heute"/„Gestern" ist reine Lesehilfe und wird nur vergeben, wenn der echte
// Berliner Kalendertag das hergibt. Ein aelteres Datum wird nie zu „heute".
function berlinZeitLabel(value, jetzt = new Date()) {
  const d = alsDatum(value);
  if (!d) return null;
  const tag = berlinTagKey(d), heute = berlinTagKey(jetzt);
  if (!tag || !heute) return null;
  let zeit = "";
  try {
    zeit = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  } catch (_) { return null; }
  if (tag === heute) return `Heute, ${zeit}`;
  if (tag === berlinTagVerschieben(heute, -1)) return `Gestern, ${zeit}`;
  try {
    const datum = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
    return `${datum}, ${zeit}`;
  } catch (_) { return null; }
}

// =============================================================================
// 2 · Briefingfenster: „neu seit dem letzten erfolgreichen Morgenbriefing"
// =============================================================================

// letzterErfolgAt = Zeitpunkt des letzten NACHWEISLICH erfolgreichen Briefinglaufs
// (aus der Lauf-Quittung). Fehlt er, greift der Vorabend-Standard, damit ein
// erster Lauf nicht faelschlich den ganzen Bestand als „neu" ausweist.
function frischeFenster({ jetzt = new Date(), letzterErfolgAt = null, env = process.env } = {}) {
  const heute = berlinTagKey(jetzt);
  const tagStart = heute ? berlinTagStart(jetzt) : null;
  const standard = tagStart ? new Date(tagStart.getTime() - vorabendStunden(env) * 3600000) : null;
  const letzter = alsDatum(letzterErfolgAt);
  // Der letzte erfolgreiche Lauf IST die Wahrheit des Fensters (Vertragspunkt 3) —
  // auch wenn er vor dem Vorabend-Standard liegt (gestern 07:00 < gestern 16:00).
  // Zwei Schranken: er darf nicht in der Zukunft liegen, und nach einem laengeren
  // Ausfall (> maxRueckblickTage) faellt das Fenster auf den Vorabend-Standard
  // zurueck — sonst waere ein tagelanger Stillstand ploetzlich ein riesiges
  // „neu"-Fenster, in dem alles als neue Meldung erschiene.
  const jetztMs = new Date(jetzt).getTime();
  const rueckblickGrenze = jetztMs - maxRueckblickTage(env) * 24 * 3600000;
  let start = standard;
  let quelle = "vorabend-standard";
  if (letzter && letzter.getTime() <= jetztMs && letzter.getTime() >= rueckblickGrenze) {
    start = letzter;
    quelle = "letzter-lauf";
  }
  return {
    berlinTag: heute,
    tagStart: tagStart ? tagStart.toISOString() : null,
    start: start ? start.toISOString() : null,
    quelle,
    letzterErfolgAt: letzter ? letzter.toISOString() : null
  };
}

// Klasse einer Meldung anhand ihres ECHTEN Zeitstempels. Ohne belegtes Datum
// gilt sie als `undatiert` — sie wird nie zu „neu" hochgestuft.
function klassifiziereMeldung(zeitpunkt, fenster = {}, jetzt = new Date(), env = process.env) {
  const d = alsDatum(zeitpunkt);
  if (!d) return KLASSE_UNDATIERT;
  const start = alsDatum(fenster && fenster.start);
  if (!start) return KLASSE_WEITERHIN;
  if (d.getTime() >= start.getTime()) return KLASSE_NEU;
  const grenze = new Date(new Date(jetzt).getTime() - relevanzTage(env) * 24 * 3600000);
  return d.getTime() >= grenze.getTime() ? KLASSE_WEITERHIN : KLASSE_HINTERGRUND;
}

// Reichert eine Item-Liste additiv an: `frischeKlasse`, `frischeLabel` und
// `zeitLabel`. Es wird KEIN Datum veraendert, nichts umsortiert, nichts entfernt.
function ordneMeldungen(items = [], fenster = {}, jetzt = new Date(), env = process.env) {
  const liste = Array.isArray(items) ? items : [];
  const angereichert = liste.map((item) => {
    if (!item || typeof item !== "object") return item;
    // REIHENFOLGE IST DER VERTRAG (Audit 2026-08-10, Befund F2): zuerst der BELEGTE
    // Meldungszeitpunkt (`meldungAt` / Veroeffentlichungsdatum), erst danach interne
    // Schreibzeitstempel. Ein `updated_at`, das nur sagt „Helmut hat die Zeile heute
    // angefasst", darf einen alten Vorgang weder zu „neu" machen noch ihm das Label
    // „Heute" geben.
    const stempel = item.meldungAt || item.publishedAt || item.published_at
      || item.lastUpdated || item.updatedAt || item.createdAt || null;
    const klasse = klassifiziereMeldung(stempel, fenster, jetzt, env);
    return {
      ...item,
      frischeKlasse: klasse,
      frischeLabel: KLASSE_LABEL[klasse] || null,
      zeitLabel: berlinZeitLabel(stempel, jetzt)
    };
  });
  const von = (k) => angereichert.filter((i) => i && i.frischeKlasse === k);
  return {
    items: angereichert,
    neu: von(KLASSE_NEU),
    weiterhinRelevant: von(KLASSE_WEITERHIN),
    hintergrund: von(KLASSE_HINTERGRUND),
    undatiert: von(KLASSE_UNDATIERT),
    kennzahlen: {
      gesamt: angereichert.length,
      neu: von(KLASSE_NEU).length,
      weiterhinRelevant: von(KLASSE_WEITERHIN).length,
      hintergrund: von(KLASSE_HINTERGRUND).length,
      undatiert: von(KLASSE_UNDATIERT).length
    }
  };
}

// =============================================================================
// 3 · Urteil: gilt der gezeigte Stand als HEUTIGES Briefing?
// =============================================================================

// lauf           = Lauf-Quittung des heutigen Berliner Tages (oder null)
// datenstandIso  = juengster verstandener Vorgang (Ausgabefrische des Datenmotors)
// quellen        = { geprueft, fehlgeschlagen } aus dem letzten Lauf (optional)
function beurteileFrische({
  jetzt = new Date(),
  lauf = null,
  datenstandIso = null,
  quellen = null,
  env = process.env
} = {}) {
  const heute = berlinTagKey(jetzt);
  const basis = {
    vertragVersion: VERTRAG_VERSION,
    berlinTag: heute,
    berlinOffsetMinuten: berlinOffsetMinuten(jetzt),
    geprueftAm: alsDatum(jetzt) ? new Date(jetzt).toISOString() : null,
    lauf: null,
    datenstand: alsDatum(datenstandIso) ? new Date(datenstandIso).toISOString() : null,
    datenAlterStunden: null,
    quellen: null
  };

  const urteil = (status, grund, extra = {}) => ({
    ...basis,
    ...extra,
    status,
    aktuell: status === STATUS_AKTUELL,
    grund,
    grundText: GRUND_TEXT[grund] || "",
    anzeige: status === STATUS_AKTUELL ? LABEL_AKTUELL : LABEL_NICHT_AKTUELL
  });

  if (!heute) return urteil(STATUS_NICHT_AKTUELL, GRUND.ZEITZONE_UNBESTIMMT);

  // --- Quellenlage (Punkt 8: teilweise fehlgeschlagene Quellen) -------------
  // Teilausfaelle machen ein Briefing NICHT unaktuell — sie werden benannt.
  if (quellen && typeof quellen === "object") {
    const geprueft = Number(quellen.geprueft || 0);
    const fehlgeschlagen = Number(quellen.fehlgeschlagen || 0);
    basis.quellen = {
      geprueft, fehlgeschlagen,
      teilausfall: fehlgeschlagen > 0,
      hinweis: fehlgeschlagen > 0
        ? `${fehlgeschlagen} von ${geprueft || fehlgeschlagen} Quellen waren beim letzten Lauf nicht erreichbar. Die Lage kann unvollständig sein.`
        : null
    };
  }

  // --- Lauf-Beleg ------------------------------------------------------------
  if (!lauf || typeof lauf !== "object") return urteil(STATUS_NICHT_AKTUELL, GRUND.LAUF_FEHLT);
  const laufVersion = Number(lauf.vertragVersion || 0);
  if (laufVersion > VERTRAG_VERSION) return urteil(STATUS_NICHT_AKTUELL, GRUND.LAUF_UNBEKANNTE_VERSION);

  const laufTag = lauf.berlinTag || berlinTagKey(lauf.erzeugtAm || lauf.generatedAt || null);
  basis.lauf = {
    berlinTag: laufTag || null,
    status: lauf.status || null,
    ausloeser: lauf.ausloeser || null,
    erzeugtAm: alsDatum(lauf.erzeugtAm) ? new Date(lauf.erzeugtAm).toISOString() : null,
    fensterStart: lauf.fensterStart || null,
    wiederholungen: Number(lauf.wiederholungen || 0)
  };
  if (!laufTag || laufTag !== heute) return urteil(STATUS_NICHT_AKTUELL, GRUND.LAUF_VERALTET);
  if (lauf.status !== "erfolg") return urteil(STATUS_NICHT_AKTUELL, GRUND.LAUF_FEHLGESCHLAGEN);

  // --- Datenfrische ---------------------------------------------------------
  const stand = alsDatum(datenstandIso);
  if (!stand) return urteil(STATUS_NICHT_AKTUELL, GRUND.DATENSTAND_UNBEKANNT);
  const alterStunden = (new Date(jetzt).getTime() - stand.getTime()) / 3600000;
  basis.datenAlterStunden = Math.round(alterStunden * 100) / 100;
  if (alterStunden > maxDatenalterStunden(env)) return urteil(STATUS_NICHT_AKTUELL, GRUND.DATEN_VERALTET);

  return urteil(STATUS_AKTUELL, GRUND.AKTUELL);
}

// =============================================================================
// 4 · Gesamtvertrag fuer die API-Antwort
// =============================================================================
// Ein Objekt, das API, Cache, Cron und Oberflaeche gleichermassen tragen: Urteil
// + Fenster + Meldungsklassen. `ruhelage` ist der EHRLICHE Fall „heutiges
// Briefing liegt vor, es gibt aber keine neue Meldung" — das ist AKTUELL, kein
// Fehler und kein Grund, alte Vorgaenge als neu auszugeben.
function briefingFrischevertrag({
  jetzt = new Date(),
  lauf = null,
  datenstandIso = null,
  quellen = null,
  items = [],
  letzterErfolgAt = null,
  fenster: fensterVorgabe = null,
  env = process.env
} = {}) {
  // Das Fenster wird VORGEGEBEN, wenn der Aufrufer bereits mit ihm gebaut hat
  // (Lesepfad: Contract und Antwort muessen dasselbe Fenster ausweisen).
  const fenster = fensterVorgabe && fensterVorgabe.start
    ? fensterVorgabe
    : frischeFenster({ jetzt, letzterErfolgAt, env });
  const urteil = beurteileFrische({ jetzt, lauf, datenstandIso, quellen, env });
  const ordnung = ordneMeldungen(items, fenster, jetzt, env);
  return {
    ...urteil,
    fenster,
    kennzahlen: ordnung.kennzahlen,
    ruhelage: urteil.aktuell && ordnung.kennzahlen.neu === 0,
    hinweis: urteil.aktuell
      ? (ordnung.kennzahlen.neu === 0
        ? "Heute liegt keine neue Meldung vor. Ältere Vorgänge stehen als weiterhin relevant oder Hintergrund darunter."
        : null)
      : urteil.grundText
  };
}

module.exports = {
  TZ,
  VERTRAG_VERSION,
  STATUS_AKTUELL,
  STATUS_NICHT_AKTUELL,
  GRUND,
  GRUND_TEXT,
  LABEL_AKTUELL,
  LABEL_NICHT_AKTUELL,
  KLASSE_NEU,
  KLASSE_WEITERHIN,
  KLASSE_HINTERGRUND,
  KLASSE_UNDATIERT,
  KLASSE_LABEL,
  vertragAktiv,
  maxDatenalterStunden,
  vorabendStunden,
  relevanzTage,
  maxRueckblickTage,
  berlinTagKey,
  berlinOffsetMinuten,
  berlinZeitpunkt,
  berlinTagStart,
  berlinTagVerschieben,
  istSelberBerlinTag,
  berlinZeitLabel,
  frischeFenster,
  klassifiziereMeldung,
  ordneMeldungen,
  beurteileFrische,
  briefingFrischevertrag
};
