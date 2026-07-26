"use strict";

// Helmut — Phase 1, Punkt 16: Quellenstörungen automatisch erkennen.
// ============================================================================
// PROBLEM (Befund A-6, am 2026-07-26 read-only nachgemessen):
//   `source_crawl_telemetry` trägt 13 081 echte Laufzeilen (seit 2026-07-16) —
//   aber im Code gab es dafür KEINEN Lesepfad. Gleichzeitig sind
//   `retrieval_paths.last_success_at` / `last_error` / `error_streak` zu
//   0 von 163 befüllt. Die Admin-Ansicht las also genau die drei Spalten, die
//   leer sind, und meldete „keine problematischen Abrufwege" — falsches Grün
//   über einer Datenbank voller belegter Timeouts, 429er und Leerläufe.
//
// FÜHRENDE QUELLE (Architekturentscheidung dieses Sprints):
//   `source_crawl_telemetry` ist die führende Wahrheit für die Störungserkennung.
//   Der Zustand je Quelle wird daraus ABGELEITET, nicht ein zweites Mal
//   gespeichert. Gründe:
//     * Die Telemetrie ist bereits live, vollständig und wächst je Crawl.
//     * Ein Rückschreiben in `retrieval_paths` wäre ein Production-Write je
//       Crawl (in diesem Sprint verboten) und eine redundante Zweitspeicherung.
//     * Historie (Problembeginn, Wiederholungen, letzte Lieferung, Erholung)
//       steckt vollständig in der Telemetrie — Ableitung ist zuverlässig und
//       billig (eine Abfrage je Report).
//   Folge: KEINE Migration, KEIN neues Schema, keine Berührung mit Punkt 14
//   (Berlin-Aktivierung) oder Punkt 17 (Kostenmessung).
//
// REINE, DETERMINISTISCHE LOGIK. Kein I/O, kein Netz, keine KI, kein Storage.
// Alle Eingaben werden injiziert; jede Ausgabe ist aus den Eingaben erklärbar.
//
// DSGVO: verarbeitet ausschließlich die ohnehin inhaltsfreien Telemetriefelder
// (IDs, Zähler, Zeitstempel, klassifizierte Fehlercodes). Es entstehen keine
// neuen personenbezogenen Daten und keine Rohfehlertexte.

// ---------------------------------------------------------------------------
// 1 · Stabile Zustandsklassen
// ---------------------------------------------------------------------------
// Eine Quelle hat zu jedem Zeitpunkt GENAU EINE Klasse. Die Reihenfolge unten
// ist zugleich die Prüfreihenfolge in `klassifiziereQuelle` (Priorität).
const STOERUNGSKLASSEN = {
  INAKTIV: "inaktiv",                 // bewusst pausiert/archiviert/dev_only — kein technischer Fehler
  MANUELL: "manuell",                 // bewusst manueller Abrufweg — läuft planmäßig nicht automatisch
  UNBEKANNT: "unbekannt",             // zu wenig Daten für eine seriöse Aussage
  GEDROSSELT: "gedrosselt",           // zentraler Circuit Breaker/Aggregator-Drosselung, kein Quellendefekt
  NIE_ERFOLGREICH: "nie_erfolgreich", // im Fenster nie erfolgreich — nie geliefert, nicht „ausgefallen"
  BLOCKIERT: "blockiert",             // Anbieter begrenzt/sperrt (429/403)
  LANGSAM: "langsam",                 // Timeout oder wiederholt deutlich zu lange Laufzeit
  PARSERFEHLER: "parserfehler",       // HTTP ok, Inhalt nicht mehr lesbar
  ABRUFFEHLER: "abruffehler",         // sonstiger/unklarer Abruffehler (ehrlich unspezifisch)
  INSTABIL: "instabil",               // wiederkehrende Ausfälle mit zwischenzeitlicher Erholung
  ERHOLT: "erholt",                   // war gestört, liefert wieder
  LEER: "leer",                       // technisch erfolgreich, aber wiederholt ohne Inhalt
  VERALTET: "veraltet",               // liefert seit deutlich mehr als dem erwarteten Rhythmus nichts
  OK: "ok"                            // erfolgreich
};

// Klassen, in denen der Weg die Versorgung TATSÄCHLICH trägt. Grundlage für
// „Alternative vorhanden" — verhindert die Falschbehauptung eines vollständigen
// Versorgungsausfalls, solange ein anderer Weg desselben Pakets liefert.
const WIRKSAME_KLASSEN = new Set([STOERUNGSKLASSEN.OK, STOERUNGSKLASSEN.ERHOLT]);

// Trägt DIESER Befund die Versorgung noch? Die Klasse allein genügt nicht:
// 'langsam' entsteht sowohl aus einer Timeout-Serie (liefert NICHTS) als auch
// aus reiner Laufzeit (liefert weiterhin, nur träge). Ein einzelner Fehlversuch
// nach gesunder Historie zählt ebenfalls als tragend — sonst würde ein Ausreißer
// das ganze Paket als geschwächt melden.
function istWirksam(befund = {}) {
  if (WIRKSAME_KLASSEN.has(befund.klasse)) return true;
  if (befund.klasse === STOERUNGSKLASSEN.LANGSAM && befund.ursache === "laufzeit") return true;
  if (befund.einzelfall === true) return true;
  return false;
}

// Klassen, die KEIN technisches Problem sind (bewusster Betriebszustand oder
// schlicht fehlende Datengrundlage). Sie dürfen nie als Störung alarmieren.
const KEINE_STOERUNG = new Set([
  STOERUNGSKLASSEN.OK, STOERUNGSKLASSEN.INAKTIV, STOERUNGSKLASSEN.MANUELL,
  STOERUNGSKLASSEN.ERHOLT, STOERUNGSKLASSEN.UNBEKANNT
]);

// ---------------------------------------------------------------------------
// 2 · Handlungsstufen — bewusst nur vier
// ---------------------------------------------------------------------------
const HANDLUNGSSTUFEN = { KEINE: "keine", BEOBACHTEN: "beobachten", ZEITNAH: "zeitnah_pruefen", AKUT: "akut" };
const STUFEN_RANG = { keine: 0, beobachten: 1, zeitnah_pruefen: 2, akut: 3 };
const STUFEN_TEXT = {
  keine: "Kein Handeln erforderlich",
  beobachten: "Beobachten",
  zeitnah_pruefen: "Zeitnah prüfen",
  akut: "Akut prüfen"
};

// ---------------------------------------------------------------------------
// 3 · Schwellenwerte — zentral, env-überschreibbar, keine Magic Numbers
// ---------------------------------------------------------------------------
// Die Defaults sind an den am 2026-07-26 gemessenen Production-Zahlen kalibriert
// (13 081 Zeilen / 10 Tage / 105 Läufe ≈ 10,5 Läufe je Tag; Laufzeit p50 552 ms,
// p95 2 331 ms, p99 7 338 ms, max 28 276 ms).
const STANDARD_SCHWELLEN = {
  fensterTage: 14,          // Bewertungsfenster
  minLaeufe: 3,             // darunter: keine Aussage (ehrlich 'unbekannt')
  fehlerAbLaeufen: 2,       // aufeinanderfolgende Fehlversuche bis „akute Störung"
  leerAbLaeufen: 3,         // aufeinanderfolgende Leerläufe bis „leer"
  instabilAbEpisoden: 2,    // getrennte Fehlerepisoden im Fenster bis „instabil"
  gedrosseltAbLaeufen: 3,   // Circuit-open-Läufe bis „gedrosselt" (ohne eigenen Erfolg)
  gedrosseltAnteil: 0.5,    // …und Mindestanteil an allen Zeilen des Fensters
  veraltetTage: 14,         // Standard, wenn kein Rhythmus bekannt und Historie zu dünn
  veraltetTageMin: 3,       // Untergrenze der historisch abgeleiteten Erwartung
  veraltetTageMax: 60,      // Obergrenze der historisch abgeleiteten Erwartung
  rhythmusMinLieferungen: 4,// ab so vielen Lieferungen darf die Historie den Rhythmus setzen
  rhythmusFaktor: 3,        // erwarteter Abstand × Faktor = Veraltet-Schwelle
  langsamMs: 8000,          // absoluter Grenzwert (über dem gemessenen p99 von 7 338 ms)
  langsamFaktor: 3,         // ODER das Faktor-Fache des eigenen Medians (Verschlechterung)
  langsamRelMinMs: 3000,    // …aber nie unterhalb dieser Bodenschwelle (300 ms -> 900 ms ist kein Problem)
  langsamAnteil: 0.5,       // Anteil langsamer Versuche im Fenster
  langsamMinVersuche: 4,    // darunter keine Laufzeitaussage
  erholungLaeufe: 1,        // technisch erfolgreiche Läufe nach der Störung
  erholungBrauchtLieferung: true // …davon mindestens einer MIT Inhalt (§13)
};

function zahl(raw, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER, ganz = true } = {}) {
  const s = String(raw == null ? "" : raw).trim();
  if (s === "") return fallback;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return ganz ? Math.floor(n) : n;
}

// Env-Overrides bleiben absichtlich schmal: nur die sechs Werte, die im Betrieb
// realistisch nachjustiert werden. Alles andere ist Code-Entscheidung.
function stoerungsSchwellen(env = process.env, overrides = {}) {
  const e = env || {};
  return {
    ...STANDARD_SCHWELLEN,
    fensterTage: zahl(e.HELMUT_STOERUNG_FENSTER_TAGE, STANDARD_SCHWELLEN.fensterTage, { min: 1, max: 365 }),
    fehlerAbLaeufen: zahl(e.HELMUT_STOERUNG_FEHLER_AB, STANDARD_SCHWELLEN.fehlerAbLaeufen, { min: 1, max: 100 }),
    leerAbLaeufen: zahl(e.HELMUT_STOERUNG_LEER_AB, STANDARD_SCHWELLEN.leerAbLaeufen, { min: 1, max: 100 }),
    veraltetTage: zahl(e.HELMUT_STOERUNG_VERALTET_TAGE, STANDARD_SCHWELLEN.veraltetTage, { min: 1, max: 365 }),
    langsamMs: zahl(e.HELMUT_STOERUNG_LANGSAM_MS, STANDARD_SCHWELLEN.langsamMs, { min: 100, max: 600000 }),
    instabilAbEpisoden: zahl(e.HELMUT_STOERUNG_INSTABIL_AB, STANDARD_SCHWELLEN.instabilAbEpisoden, { min: 2, max: 100 }),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// 4 · Laufhistorie aus der Telemetrie
// ---------------------------------------------------------------------------
const TAG_MS = 24 * 60 * 60 * 1000;

function ms(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
function zahlOderNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function median(werte) {
  const s = werte.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Art einer einzelnen Telemetriezeile. ENTSCHEIDEND für die Fehlalarmvermeidung:
//  - 'uebersprungen' (skipped-shared/skipped-cooldown): der Abruf fand NIE statt.
//    In Production sind das 1 736 von 13 081 Zeilen — würde man sie als Fehler
//    oder als Leerlauf zählen, wäre praktisch jede geteilte Quelle „gestört".
//  - 'gedrosselt' (circuit-open): der zentrale Breaker hat abgebrochen. Das sind
//    in Production 4 044 Zeilen — mit Abstand der häufigste „Fehler". Es ist
//    aber EIN Aggregator-Ereignis, kein Defekt von N Einzelquellen
//    (dieselbe Logik wie in crawl-run-state.js).
// Beide sind KEINE Abrufversuche und begründen daher nie eine Fehlerserie.
function laufart(zeile = {}) {
  const status = String(zeile.status || "").toLowerCase();
  const code = String(zeile.error_code || zeile.errorCode || "").toLowerCase();
  if (status === "skipped-shared" || status === "skipped-cooldown") return "uebersprungen";
  if (status === "circuit-open" || code === "circuit-open") return "gedrosselt";
  const docs = zahlOderNull(zeile.found_documents != null ? zeile.found_documents : zeile.foundDocuments) || 0;
  if (status === "ok") return docs > 0 ? "lieferung" : "leer";
  if (status === "empty") return "leer";
  if (status === "error") return "fehler";
  // Unbekannter Status: nicht raten. Zählt als Versuch, aber ohne Erfolgsaussage.
  return "unklar";
}

const VERSUCHSARTEN = new Set(["lieferung", "leer", "fehler", "unklar"]);
const ERFOLGSARTEN = new Set(["lieferung", "leer"]); // technisch erfolgreich

// Baut je source_id eine geordnete, verdichtete Historie. Rein, ohne I/O.
function buildLaufhistorie(telemetrie = [], { now = Date.now(), schwellen = null } = {}) {
  const s = schwellen || stoerungsSchwellen();
  const seit = now - s.fensterTage * TAG_MS;
  const proQuelle = new Map();

  for (const zeile of Array.isArray(telemetrie) ? telemetrie : []) {
    if (!zeile) continue;
    const sid = zeile.source_id || zeile.sourceId;
    if (!sid) continue;
    const at = ms(zeile.created_at || zeile.createdAt || zeile.finished_at || zeile.finishedAt);
    if (at == null || at < seit || at > now) continue;
    if (!proQuelle.has(sid)) proQuelle.set(sid, []);
    proQuelle.get(sid).push({
      at,
      art: laufart(zeile),
      code: zeile.error_code || zeile.errorCode || null,
      dauerMs: zahlOderNull(zeile.duration_ms != null ? zeile.duration_ms : zeile.durationMs),
      dokumente: zahlOderNull(zeile.found_documents != null ? zeile.found_documents : zeile.foundDocuments) || 0,
      runId: zeile.run_id || zeile.runId || null
    });
  }

  const out = new Map();
  for (const [sid, roh] of proQuelle) {
    roh.sort((a, b) => a.at - b.at);
    out.set(sid, verdichteHistorie(sid, roh, s));
  }
  return out;
}

function verdichteHistorie(sourceId, laeufe, s) {
  const versuche = laeufe.filter((l) => VERSUCHSARTEN.has(l.art));
  const gedrosselte = laeufe.filter((l) => l.art === "gedrosselt");
  const uebersprungene = laeufe.filter((l) => l.art === "uebersprungen");
  const lieferungen = laeufe.filter((l) => l.art === "lieferung");
  const erfolge = laeufe.filter((l) => ERFOLGSARTEN.has(l.art));

  // Serien werden AUSSCHLIESSLICH über echte Versuche gezählt — übersprungene
  // und gedrosselte Läufe unterbrechen eine Serie weder, noch verlängern sie sie.
  let fehlerserie = 0;
  for (let i = versuche.length - 1; i >= 0; i--) { if (versuche[i].art === "fehler") fehlerserie++; else break; }
  let leerserie = 0;
  for (let i = versuche.length - 1; i >= 0; i--) { if (versuche[i].art === "leer") leerserie++; else break; }

  // Fehlerepisoden = maximale Blöcke aufeinanderfolgender Fehlversuche.
  // 18 Timeouts am Stück sind EINE Episode (akut), nicht 18 Instabilitäten.
  let episoden = 0;
  let inEpisode = false;
  for (const v of versuche) {
    if (v.art === "fehler") { if (!inEpisode) { episoden++; inEpisode = true; } }
    else inEpisode = false;
  }

  const letzterLauf = laeufe.length ? laeufe[laeufe.length - 1] : null;
  const letzterVersuch = versuche.length ? versuche[versuche.length - 1] : null;
  const letzterErfolg = erfolge.length ? erfolge[erfolge.length - 1] : null;
  const letzteLieferung = lieferungen.length ? lieferungen[lieferungen.length - 1] : null;
  const fehlversuche = versuche.filter((v) => v.art === "fehler");
  const letzterFehler = fehlversuche.length ? fehlversuche[fehlversuche.length - 1] : null;

  // Beginn der laufenden Störung = Zeitpunkt des ERSTEN Fehlversuchs der
  // aktuellen Serie (nicht des letzten) — das ist die Antwort auf „seit wann?".
  let problemSeit = null;
  if (fehlerserie > 0) problemSeit = versuche[versuche.length - fehlerserie].at;
  else if (leerserie >= s.leerAbLaeufen) problemSeit = versuche[versuche.length - leerserie].at;

  // Dominante Ursache der laufenden Fehlerserie (häufigster Code, bei Gleichstand
  // der jüngste) — nie geraten, immer aus den tatsächlichen Codes.
  let ursache = null;
  if (fehlerserie > 0) {
    const serie = versuche.slice(versuche.length - fehlerserie);
    const zaehler = new Map();
    for (const v of serie) { const c = v.code || "unknown"; zaehler.set(c, (zaehler.get(c) || 0) + 1); }
    let best = null, bestN = -1;
    for (const v of serie) { const c = v.code || "unknown"; const n = zaehler.get(c); if (n >= bestN) { bestN = n; best = c; } }
    ursache = best;
  }

  // Ein Lauf gilt als langsam, wenn er den absoluten Grenzwert reißt ODER sich
  // gegenüber der EIGENEN Historie deutlich verschlechtert hat (§6.6) — Letzteres
  // aber nie unterhalb der Bodenschwelle, damit aus 300 ms -> 900 ms kein Befund
  // wird. Der absolute Grenzwert liegt bewusst über dem gemessenen p99.
  const dauern = versuche.map((v) => v.dauerMs).filter((d) => Number.isFinite(d) && d > 0);
  const medianDauer = median(dauern);
  const relGrenze = medianDauer != null ? Math.max(s.langsamRelMinMs, medianDauer * s.langsamFaktor) : Infinity;
  const istLangsam = (d) => d > s.langsamMs || d > relGrenze;
  const langsamGrenze = Math.min(s.langsamMs, relGrenze);
  const langsameVersuche = dauern.filter(istLangsam).length;

  // Beobachteter Lieferabstand (Median) — Grundlage für die rhythmus-bewusste
  // Veraltet-Schwelle. Nur mit genügend Lieferungen überhaupt aussagekräftig.
  let medianLieferabstandTage = null;
  if (lieferungen.length >= 2) {
    const abstaende = [];
    for (let i = 1; i < lieferungen.length; i++) abstaende.push((lieferungen[i].at - lieferungen[i - 1].at) / TAG_MS);
    medianLieferabstandTage = median(abstaende);
  }

  return {
    sourceId,
    laeufeGesamt: laeufe.length,
    versuche: versuche.length,
    erfolge: erfolge.length,
    lieferungen: lieferungen.length,
    fehler: versuche.filter((v) => v.art === "fehler").length,
    leerlaeufe: versuche.filter((v) => v.art === "leer").length,
    gedrosselt: gedrosselte.length,
    uebersprungen: uebersprungene.length,
    fehlerserie,
    leerserie,
    episoden,
    ursache,
    problemSeit,
    letzterLaufAt: letzterLauf ? letzterLauf.at : null,
    letzterVersuchAt: letzterVersuch ? letzterVersuch.at : null,
    letzterErfolgAt: letzterErfolg ? letzterErfolg.at : null,
    letzteLieferungAt: letzteLieferung ? letzteLieferung.at : null,
    letzterFehlerAt: letzterFehler ? letzterFehler.at : null,
    dokumenteGesamt: lieferungen.reduce((n, l) => n + (l.dokumente || 0), 0),
    medianDauerMs: medianDauer,
    langsameVersuche,
    langsamGrenzeMs: langsamGrenze,
    medianLieferabstandTage
  };
}

// ---------------------------------------------------------------------------
// 5 · Erwarteter Rhythmus → Veraltet-Schwelle
// ---------------------------------------------------------------------------
// Production-Realität (gemessen 2026-07-26): `expected_frequency` ist bei ALLEN
// 163 Abrufwegen NULL. Die Erwartung muss also aus der Historie kommen — sonst
// wäre jede selten aktualisierte Quelle sofort „veraltet" (§6.2).
const RHYTHMUS_TAGE = {
  hourly: 1, stuendlich: 1, "15min": 1, hourly6: 1,
  daily: 3, taeglich: 3, täglich: 3, weekday: 3, werktags: 3,
  weekly: 14, woechentlich: 14, wöchentlich: 14,
  biweekly: 21, monthly: 45, monatlich: 45,
  quarterly: 120, irregular: 45, unregelmaessig: 45
};

function veraltetSchwelleTage(weg = {}, historie = null, s = STANDARD_SCHWELLEN) {
  const freq = String(weg.expected_frequency || weg.expectedFrequency || "").trim().toLowerCase();
  if (freq && RHYTHMUS_TAGE[freq] != null) {
    return { tage: RHYTHMUS_TAGE[freq], grundlage: "hinterlegter Rhythmus", rhythmus: freq };
  }
  if (historie && historie.lieferungen >= s.rhythmusMinLieferungen && historie.medianLieferabstandTage != null) {
    const abgeleitet = historie.medianLieferabstandTage * s.rhythmusFaktor;
    const tage = Math.min(s.veraltetTageMax, Math.max(s.veraltetTageMin, abgeleitet));
    return { tage, grundlage: "beobachteter Lieferrhythmus", rhythmus: null };
  }
  return { tage: s.veraltetTage, grundlage: "Standardwert (kein Rhythmus hinterlegt, Historie zu dünn)", rhythmus: null };
}

// ---------------------------------------------------------------------------
// 6 · Klassifikation einer einzelnen Quelle
// ---------------------------------------------------------------------------
function wegIstInaktiv(weg = {}) {
  const status = String(weg.status || "").toLowerCase();
  const modus = String(weg.activation_mode || weg.activationMode || "").toLowerCase();
  return status === "paused" || status === "archived" || modus === "dev_only";
}

const URSACHE_TEXT = {
  "http-429": "Der Anbieter begrenzt die Abrufe (HTTP 429).",
  "http-4xx": "Der Anbieter weist den Abruf ab (HTTP 4xx).",
  "http-5xx": "Der Anbieter meldet einen Serverfehler (HTTP 5xx).",
  timeout: "Der Abruf läuft in die Zeitüberschreitung.",
  parse: "Die Antwort kam an, ließ sich aber nicht mehr lesen.",
  "empty-feed": "Der Feed antwortet, enthält aber keine Einträge.",
  dns: "Die Adresse ist nicht auflösbar (DNS).",
  connection: "Die Verbindung bricht ab.",
  tls: "Die verschlüsselte Verbindung scheitert (TLS).",
  "response-too-large": "Die Antwort ist zu groß.",
  "circuit-open": "Der Schutzschalter hat den Abruf zentral abgebrochen.",
  unknown: "Die Ursache ist aus den Laufdaten nicht eindeutig bestimmbar."
};

// Fehlercode -> Zustandsklasse. Alles Unklare wird bewusst zu ABRUFFEHLER
// („unbekannter Abruffehler") statt zu einer erfundenen präzisen Ursache (§9).
function klasseAusUrsache(code) {
  switch (String(code || "").toLowerCase()) {
    case "http-429": return STOERUNGSKLASSEN.BLOCKIERT;
    case "http-4xx": return STOERUNGSKLASSEN.BLOCKIERT;
    case "timeout": return STOERUNGSKLASSEN.LANGSAM;
    case "parse": return STOERUNGSKLASSEN.PARSERFEHLER;
    case "circuit-open": return STOERUNGSKLASSEN.GEDROSSELT;
    default: return STOERUNGSKLASSEN.ABRUFFEHLER;
  }
}

// Erholungsregel (§13): nach der letzten Fehlerepisode muss es mindestens
// `erholungLaeufe` technisch erfolgreiche Läufe geben UND — sofern
// `erholungBrauchtLieferung` — mindestens eine echte Lieferung. Eine rein
// technische 200-Antwort ohne Inhalt gilt NICHT als vollständige Erholung.
function erholungAnerkannt(h, s) {
  if (!h || h.fehlerserie > 0) return false;      // fällt gerade noch aus
  if (h.episoden === 0) return false;             // war nie gestört
  if (h.letzterFehlerAt == null) return false;
  // Technisch erfolgreiche Läufe NACH dem letzten Fehler.
  if (h.letzterErfolgAt == null || h.letzterErfolgAt <= h.letzterFehlerAt) return false;
  if (h.erfolge < s.erholungLaeufe) return false;
  if (!s.erholungBrauchtLieferung) return true;
  // §13: eine rein technische 200-Antwort OHNE Inhalt ist keine vollständige
  // Erholung. Es muss nach dem letzten Fehler wieder etwas geliefert worden sein.
  return h.letzteLieferungAt != null && h.letzteLieferungAt > h.letzterFehlerAt;
}

function klassifiziereQuelle({ sourceId, historie = null, weg = null, schwellen = null, now = Date.now() } = {}) {
  const s = schwellen || stoerungsSchwellen();
  const h = historie;
  const id = sourceId || (h && h.sourceId) || (weg && (weg.legacy_source_id || weg.id)) || null;

  const basis = {
    sourceId: id,
    wegId: weg ? weg.id : null,
    name: (weg && (weg.name || weg.id)) || id,
    methode: weg ? (weg.method || null) : null,
    kritisch: Boolean(weg && (weg.is_critical === true || weg.isCritical === true)),
    imKatalog: Boolean(weg),
    laufdaten: h ? {
      laeufe: h.laeufeGesamt, versuche: h.versuche, erfolge: h.erfolge, lieferungen: h.lieferungen,
      fehler: h.fehler, leerlaeufe: h.leerlaeufe, gedrosselt: h.gedrosselt, uebersprungen: h.uebersprungen,
      fehlerserie: h.fehlerserie, leerserie: h.leerserie, episoden: h.episoden,
      dokumente: h.dokumenteGesamt, medianDauerMs: h.medianDauerMs
    } : null,
    letzterLaufAt: h ? h.letzterLaufAt : null,
    letzterErfolgAt: h ? h.letzterErfolgAt : null,
    letzteLieferungAt: h ? h.letzteLieferungAt : null,
    problemSeit: h ? h.problemSeit : null,
    wiederholungen: h ? Math.max(h.fehlerserie, h.leerserie >= s.leerAbLaeufen ? h.leerserie : 0) : 0,
    erholt: false
  };

  const fertig = (klasse, kurz, erklaerung, extra = {}) => ({
    ...basis, klasse, kurz, erklaerung,
    ursache: extra.ursache || null,
    ursacheText: extra.ursache ? (URSACHE_TEXT[extra.ursache] || URSACHE_TEXT.unknown) : null,
    ...extra
  });

  // (1) Bewusst inaktiv — nie ein akuter technischer Fehler (§6.4).
  if (weg && wegIstInaktiv(weg)) {
    return fertig(STOERUNGSKLASSEN.INAKTIV, "Bewusst deaktiviert",
      "Quelle ist bewusst deaktiviert oder archiviert — kein technischer Fehler.");
  }
  // (2) Bewusst manuell (§6.3).
  if (weg && String(weg.activation_mode || weg.activationMode || "").toLowerCase() === "manual") {
    return fertig(STOERUNGSKLASSEN.MANUELL, "Bewusst manuell",
      "Quelle ist bewusst als manueller Abrufweg geführt und läuft planmäßig nicht automatisch.");
  }
  // (3) Überhaupt keine Laufdaten.
  if (!h || h.laeufeGesamt === 0) {
    return fertig(STOERUNGSKLASSEN.UNBEKANNT, "Keine Laufdaten",
      "Für diese Quelle liegen im Bewertungsfenster keine Laufdaten vor — es wird bewusst nichts behauptet.");
  }
  // (4) Zentrale Drosselung dominiert und die Quelle kam nie zum Zug.
  //     WICHTIG: kein Quellendefekt. In Production ist das der mit Abstand
  //     häufigste „Fehler" (4 044 Zeilen) — würde er als Abruffehler zählen,
  //     wäre der Bericht dauerhaft rot.
  if (h.erfolge === 0 && h.gedrosselt >= s.gedrosseltAbLaeufen
      && h.gedrosselt >= h.laeufeGesamt * s.gedrosseltAnteil) {
    return fertig(STOERUNGSKLASSEN.GEDROSSELT, "Zentral gedrosselt",
      `Der Abruf wurde ${h.gedrosselt}× vom Schutzschalter abgebrochen und kam nicht zur Quelle durch. Das ist eine zentrale Drosselung, kein Defekt dieser Quelle.`,
      { ursache: "circuit-open" });
  }
  // (5) Zu dünne Datenlage → ehrlich unbekannt statt geratener Befund (§9).
  if (h.versuche < s.minLaeufe) {
    return fertig(STOERUNGSKLASSEN.UNBEKANNT, "Zu wenige Läufe",
      `Nur ${h.versuche} echte Abrufversuche im Fenster (Mindestmaß ${s.minLaeufe}) — für eine belastbare Aussage zu wenig.`);
  }
  // (6) Im Fenster nie erfolgreich — ausdrücklich UNTERSCHIEDEN von einer
  //     früher erfolgreichen, inzwischen ausgefallenen Quelle (§6.5).
  if (h.erfolge === 0) {
    return fertig(STOERUNGSKLASSEN.NIE_ERFOLGREICH, "Noch nie erfolgreich",
      `Diese Quelle wurde in ${h.versuche} Versuchen noch nie erfolgreich abgerufen — sie ist nicht ausgefallen, sie hat nie geliefert.`,
      { ursache: h.ursache || "unknown" });
  }
  // (7) Laufende Fehlerserie → akute Störung, Klasse aus der echten Ursache.
  if (h.fehlerserie >= s.fehlerAbLaeufen) {
    const klasse = klasseAusUrsache(h.ursache);
    const kurz = {
      [STOERUNGSKLASSEN.BLOCKIERT]: "Abruf wird begrenzt",
      [STOERUNGSKLASSEN.LANGSAM]: "Zeitüberschreitung",
      [STOERUNGSKLASSEN.PARSERFEHLER]: "Inhalt nicht lesbar",
      [STOERUNGSKLASSEN.GEDROSSELT]: "Zentral gedrosselt",
      [STOERUNGSKLASSEN.ABRUFFEHLER]: "Abruf schlägt fehl"
    }[klasse] || "Abruf schlägt fehl";
    return fertig(klasse, kurz,
      `${h.fehlerserie} Läufe in Folge fehlgeschlagen. ${URSACHE_TEXT[h.ursache] || URSACHE_TEXT.unknown}`,
      { ursache: h.ursache || "unknown" });
  }
  // (8) Wiederkehrende Ausfälle mit zwischenzeitlicher Erholung (§6.10).
  if (h.episoden >= s.instabilAbEpisoden) {
    return fertig(STOERUNGSKLASSEN.INSTABIL, "Wiederholt instabil",
      `${h.episoden} getrennte Ausfälle im Bewertungsfenster (${h.fehler} von ${h.versuche} Läufen fehlgeschlagen) — die Quelle erholt sich jeweils, fällt aber wiederholt aus.`,
      { ursache: h.ursache || null, erholt: h.fehlerserie === 0 });
  }
  // (9) Einzelner Fehlversuch am Ende: benannt, aber nie ein Alarm (§6.1-Analogie).
  if (h.fehlerserie > 0) {
    const klasse = klasseAusUrsache(h.ursache);
    return fertig(klasse, "Einzelner Fehlversuch",
      `Der letzte Lauf ist fehlgeschlagen, die Läufe davor waren erfolgreich. ${URSACHE_TEXT[h.ursache] || URSACHE_TEXT.unknown}`,
      { ursache: h.ursache || "unknown", einzelfall: true });
  }
  // (10) Erholung — eigenes, sichtbares Ereignis (§13).
  if (erholungAnerkannt(h, s)) {
    return fertig(STOERUNGSKLASSEN.ERHOLT, "Wieder erreichbar",
      "Die Quelle war gestört und liefert seit dem letzten Lauf wieder.",
      { erholt: true });
  }
  // (11)+(12) Leer / veraltet — BEIDE rhythmus-bewusst.
  //
  // Entscheidend gegen Fehlalarme (§6.2): eine wöchentlich aktualisierte Quelle
  // wird bei 5 Crawl-Vollrunden je Tag zwangsläufig dutzende Leerläufe erzeugen.
  // Eine reine Zählschwelle („3 Leerläufe = kaputt") würde also genau die
  // seltener aktualisierten Quellen dauerhaft als gestört melden. Deshalb muss
  // ZUSÄTZLICH die erwartete Lieferpause überschritten sein.
  const erwartung = veraltetSchwelleTage(weg || {}, h, s);
  const ohneLieferungTage = h.letzteLieferungAt == null
    ? (h.letzterLaufAt != null ? (now - (h.problemSeit || h.letzterLaufAt)) / TAG_MS : null)
    : (now - h.letzteLieferungAt) / TAG_MS;
  const ueberfaellig = ohneLieferungTage == null ? false : ohneLieferungTage > erwartung.tage;

  // (11) Technisch erfolgreich, aber wiederholt ohne Inhalt — und länger als
  //      der erwartete Rhythmus zulässt.
  if (h.leerserie >= s.leerAbLaeufen && (ueberfaellig || h.lieferungen === 0)) {
    return fertig(STOERUNGSKLASSEN.LEER, "Liefert keine Inhalte",
      h.lieferungen === 0
        ? `Seit ${h.leerserie} geplanten Läufen antwortet die Quelle technisch einwandfrei, hat im Bewertungsfenster aber noch nie Inhalte geliefert.`
        : `Seit ${h.leerserie} geplanten Läufen antwortet die Quelle technisch einwandfrei, liefert aber keine neuen Inhalte (erwartet höchstens ${Math.round(erwartung.tage)} Tage Pause, ${erwartung.grundlage}).`,
      { erwartungTage: Math.round(erwartung.tage), erwartungGrundlage: erwartung.grundlage });
  }
  // (12) Veraltet — nie allein aus „0 Dokumente" abgeleitet (§6), sondern aus
  //      letzter Lieferung gegen den erwarteten Rhythmus.
  if (h.letzteLieferungAt != null && ueberfaellig) {
    return fertig(STOERUNGSKLASSEN.VERALTET, "Seit Langem ohne neue Inhalte",
      `Die letzte Lieferung liegt ${Math.round(ohneLieferungTage)} Tage zurück; erwartet werden höchstens ${Math.round(erwartung.tage)} Tage (${erwartung.grundlage}).`,
      { erwartungTage: Math.round(erwartung.tage), erwartungGrundlage: erwartung.grundlage });
  }
  // (13) Laufzeit — nur gegen Grenzwert UND eigene Historie (§6.6).
  if (h.versuche >= s.langsamMinVersuche && h.langsameVersuche >= Math.ceil(h.versuche * s.langsamAnteil)) {
    return fertig(STOERUNGSKLASSEN.LANGSAM, "Wiederholt zu langsam",
      `${h.langsameVersuche} von ${h.versuche} Läufen lagen über ${Math.round(h.langsamGrenzeMs)} ms — deutlich über dem eigenen Median von ${Math.round(h.medianDauerMs || 0)} ms.`,
      { ursache: "laufzeit" });
  }
  // (14) Alles unauffällig.
  return fertig(STOERUNGSKLASSEN.OK, "Erfolgreich",
    `Die Quelle liefert planmäßig (${h.lieferungen} Lieferungen, ${h.dokumenteGesamt} Dokumente im Fenster).`);
}

// ---------------------------------------------------------------------------
// 7 · Paket- und Mandatswirkung
// ---------------------------------------------------------------------------
// Nutzt AUSSCHLIESSLICH bestehende Beziehungen (package_paths, source_packages)
// und — falls Profile übergeben werden — den vorhandenen Profil-Resolver.
// Ohne Profile wird die Mandatswirkung EHRLICH als nicht bestimmbar gemeldet
// statt geraten (§14.4).
function bewertePaketwirkung({ befunde = [], retrievalPaths = [], packages = [], packagePaths = [], profiles = null } = {}) {
  const wege = (Array.isArray(retrievalPaths) ? retrievalPaths : []).filter((p) => p && p.id);
  const paketeListe = (Array.isArray(packages) ? packages : []).filter((p) => p && p.id);
  const alleBefunde = (Array.isArray(befunde) ? befunde : []).filter(Boolean);
  const wegById = new Map(wege.map((p) => [p.id, p]));
  const paketById = new Map(paketeListe.map((p) => [p.id, p]));
  const befundByWegId = new Map();
  for (const b of alleBefunde) if (b.wegId) befundByWegId.set(b.wegId, b);

  const wegeProPaket = new Map();
  const paketeProWeg = new Map();
  for (const pp of packagePaths || []) {
    if (!pp || !pp.package_id || !pp.retrieval_path_id) continue;
    if (!wegeProPaket.has(pp.package_id)) wegeProPaket.set(pp.package_id, []);
    wegeProPaket.get(pp.package_id).push(pp.retrieval_path_id);
    if (!paketeProWeg.has(pp.retrieval_path_id)) paketeProWeg.set(pp.retrieval_path_id, []);
    paketeProWeg.get(pp.retrieval_path_id).push(pp.package_id);
  }

  // Versorgungslage je Paket aus den Befunden der zugehörigen Wege.
  const paketLage = new Map();
  for (const [pkgId, wegIds] of wegeProPaket) {
    const pkg = paketById.get(pkgId);
    let wirksam = 0, gestoert = 0, inaktiv = 0, unbekannt = 0;
    for (const wid of wegIds) {
      const b = befundByWegId.get(wid);
      if (!b) { unbekannt++; continue; }
      if (b.klasse === STOERUNGSKLASSEN.INAKTIV || b.klasse === STOERUNGSKLASSEN.MANUELL) { inaktiv++; continue; }
      if (b.klasse === STOERUNGSKLASSEN.UNBEKANNT) { unbekannt++; continue; }
      if (istWirksam(b)) wirksam++; else gestoert++;
    }
    let versorgung;
    if (!wegIds.length) versorgung = "leer";
    else if (wirksam > 0 && gestoert === 0) versorgung = "versorgt";
    else if (wirksam > 0) versorgung = "teilweise_geschwaecht";
    else if (gestoert > 0) versorgung = "ohne_funktionierenden_weg";
    else versorgung = "unbestimmt"; // nur inaktive/unbekannte Wege — keine Störungsaussage
    paketLage.set(pkgId, {
      id: pkgId, key: pkg ? pkg.key : pkgId, name: pkg ? pkg.name : null,
      isBase: Boolean(pkg && (pkg.is_base === true || pkg.isBase === true)),
      politicalLevel: pkg ? (pkg.political_level || pkg.politicalLevel || null) : null,
      status: pkg ? pkg.status : null,
      wege: wegIds.length, wirksam, gestoert, inaktiv, unbekannt, versorgung
    });
  }

  // Mandatswirkung: nur mit übergebenen Profilen und nur über den bestehenden
  // Resolver. Ein Paket wirkt auf ein Mandat, wenn es dessen Pflicht- oder
  // Optionalpaket ist.
  let paketZuMandaten = null;
  let mandatswirkungVerfuegbar = false;
  let mandateGesamt = 0;
  if (Array.isArray(profiles) && profiles.length) {
    try {
      const { resolveProfilePackages } = require("./profile-packages");
      paketZuMandaten = new Map();
      for (const profile of profiles) {
        if (!profile || typeof profile !== "object") continue;
        mandateGesamt++;
        const r = resolveProfilePackages(profile);
        const keys = [...new Set([...(r.required || []), ...(r.optional || [])])];
        for (const key of keys) {
          if (!paketZuMandaten.has(key)) paketZuMandaten.set(key, new Set());
          paketZuMandaten.get(key).add(profile.id || profile.user_id || profile.userId || `profil-${mandateGesamt}`);
        }
      }
      mandatswirkungVerfuegbar = true;
    } catch (_) {
      paketZuMandaten = null;
      mandatswirkungVerfuegbar = false;
    }
  }

  // Wirkung je Befund anreichern.
  const angereichert = alleBefunde.map((b) => {
    const wegId = b.wegId;
    const pkgIds = wegId ? (paketeProWeg.get(wegId) || []) : [];
    const pakete = pkgIds.map((id) => paketLage.get(id)).filter(Boolean);
    const gestoert = !KEINE_STOERUNG.has(b.klasse);

    // Alternativen: andere Wege desselben Pakets, die tatsächlich tragen.
    const alternativen = [];
    for (const pkgId of pkgIds) {
      for (const wid of (wegeProPaket.get(pkgId) || [])) {
        if (wid === wegId) continue;
        const other = befundByWegId.get(wid);
        if (other && istWirksam(other)) alternativen.push(other.sourceId || wid);
      }
    }
    const alternativenVorhanden = alternativen.length > 0;

    let wirkung;
    if (!wegId || !wegById.has(wegId)) wirkung = "nicht_bestimmbar";
    else if (!pkgIds.length) wirkung = "kein_paket";
    else if (!gestoert) wirkung = "keine";
    else if (pakete.some((p) => p.versorgung === "ohne_funktionierenden_weg")) wirkung = "paket_ohne_funktionierenden_weg";
    else if (alternativenVorhanden) wirkung = "einzelne_quelle_gestoert_alternativen_vorhanden";
    else wirkung = "paket_teilweise_geschwaecht";

    // Mandatswirkung — nur wo zuverlässig ableitbar.
    let mandate;
    if (!mandatswirkungVerfuegbar) {
      const basisPaket = pakete.some((p) => p.isBase);
      mandate = {
        bestimmbar: false,
        betroffene: null,
        grund: "Keine Mandatsprofile übergeben — die Mandatswirkung ist aus den Laufdaten allein nicht bestimmbar.",
        strukturhinweis: basisPaket && gestoert
          ? "Betrifft ein Pflicht-Basispaket; damit potenziell jedes Mandat der betroffenen Ebene."
          : null
      };
    } else if (!gestoert || !pakete.length) {
      mandate = { bestimmbar: true, betroffene: [], grund: null, strukturhinweis: null };
    } else {
      const ids = new Set();
      for (const p of pakete) {
        if (p.versorgung === "versorgt") continue;
        for (const mid of (paketZuMandaten.get(p.key) || [])) ids.add(mid);
      }
      mandate = {
        bestimmbar: true,
        betroffene: [...ids].sort(),
        grund: null,
        strukturhinweis: alternativenVorhanden
          ? "Für die betroffenen Pakete liefert mindestens ein anderer Abrufweg — kein vollständiger Versorgungsausfall."
          : null
      };
    }

    return {
      ...b,
      wirkung: {
        art: wirkung,
        pakete: pakete.map((p) => ({ key: p.key, isBase: p.isBase, versorgung: p.versorgung, wege: p.wege, wirksam: p.wirksam, gestoert: p.gestoert })),
        alternativenVorhanden,
        alternativen,
        mandate
      }
    };
  });

  return { befunde: angereichert, paketLage: [...paketLage.values()] };
}

// ---------------------------------------------------------------------------
// 8 · Handlungsstufe
// ---------------------------------------------------------------------------
function handlungsstufe(befund) {
  const k = befund.klasse;
  if (k === STOERUNGSKLASSEN.OK || k === STOERUNGSKLASSEN.INAKTIV || k === STOERUNGSKLASSEN.MANUELL || k === STOERUNGSKLASSEN.ERHOLT) {
    return HANDLUNGSSTUFEN.KEINE;
  }
  if (k === STOERUNGSKLASSEN.UNBEKANNT) return HANDLUNGSSTUFEN.BEOBACHTEN;

  const wirkung = (befund.wirkung && befund.wirkung.art) || "nicht_bestimmbar";
  const paketOhneWeg = wirkung === "paket_ohne_funktionierenden_weg";
  const alternativen = Boolean(befund.wirkung && befund.wirkung.alternativenVorhanden);
  const kritisch = befund.kritisch === true;

  // Einzelner Fehlversuch ist NIE mehr als „beobachten" — ausdrückliche
  // Fehlalarmbremse (ein Ausreißer ist keine Störung).
  if (befund.einzelfall) return HANDLUNGSSTUFEN.BEOBACHTEN;

  // „Leicht" heißt: die Quelle liefert weiter oder der Zustand ist ein bewusster
  // Schutzmechanismus. WICHTIG (Production-Gegenprobe 2026-07-26): 'langsam' ist
  // nur dann leicht, wenn es aus der LAUFZEIT stammt. Eine Timeout-Serie trägt
  // dieselbe Klasse, liefert aber gar nichts — sie darf nicht auf „beobachten"
  // heruntergestuft werden, nur weil sie denselben Klassennamen hat.
  const leicht = new Set([STOERUNGSKLASSEN.LEER, STOERUNGSKLASSEN.VERALTET,
    STOERUNGSKLASSEN.INSTABIL, STOERUNGSKLASSEN.GEDROSSELT]);
  const istLeicht = leicht.has(k) || (k === STOERUNGSKLASSEN.LANGSAM && befund.ursache === "laufzeit");
  let stufe = istLeicht ? HANDLUNGSSTUFEN.BEOBACHTEN : HANDLUNGSSTUFEN.ZEITNAH;

  // Hochstufen nur mit echtem Grund.
  if (paketOhneWeg) stufe = HANDLUNGSSTUFEN.AKUT;
  else if (kritisch && !istLeicht) stufe = HANDLUNGSSTUFEN.AKUT;
  else if (kritisch) stufe = HANDLUNGSSTUFEN.ZEITNAH;

  // Herunterstufen, wenn eine Alternative die Versorgung trägt: die Störung
  // bleibt sichtbar, ist aber kein akuter Versorgungsausfall (§14).
  if (stufe === HANDLUNGSSTUFEN.AKUT && alternativen && !paketOhneWeg) stufe = HANDLUNGSSTUFEN.ZEITNAH;
  return stufe;
}

// ---------------------------------------------------------------------------
// 9 · Meldung + Deduplizierung
// ---------------------------------------------------------------------------
// Signatur = alles, was eine Meldung fachlich AUSMACHT. Bleibt sie gleich, ist
// das Problem unverändert und darf NICHT erneut gemeldet werden (§12).
function alarmSignatur(befund = {}) {
  const pakete = ((befund.wirkung && befund.wirkung.pakete) || []).map((p) => p.key).sort().join(",");
  return [befund.klasse || "", befund.ursache || "", befund.stufe || "", pakete].join("|");
}

const AENDERUNG = {
  NEU: "neu", VERSCHAERFT: "verschaerft", ENTSCHAERFT: "entschaerft",
  URSACHE_GEAENDERT: "ursache_geaendert", AUSGEWEITET: "ausgeweitet",
  ERHOLT: "erholt", ERNEUT: "erneut", UNVERAENDERT: "unveraendert"
};

// Vergleicht den vorherigen mit dem aktuellen Stand und liefert NUR die
// relevanten Zustandsänderungen. `vorher` ist eine Liste bereits gemeldeter
// Befunde (oder deren Signaturen) aus dem letzten Lauf.
function diffAlarme(vorher = [], jetzt = []) {
  const vorherByKey = new Map();
  for (const v of Array.isArray(vorher) ? vorher : []) {
    if (!v) continue;
    const key = v.sourceId || v.source_id || v.wegId;
    if (key) vorherByKey.set(key, v);
  }

  const meldungen = [];
  for (const b of Array.isArray(jetzt) ? jetzt : []) {
    if (!b) continue;
    const key = b.sourceId || b.wegId;
    const alt = key ? vorherByKey.get(key) : null;
    const sigJetzt = b.signatur || alarmSignatur(b);
    const gestoert = !KEINE_STOERUNG.has(b.klasse);

    if (!alt) {
      if (gestoert) meldungen.push({ art: AENDERUNG.NEU, sourceId: key, befund: b, signatur: sigJetzt });
      continue;
    }
    const sigAlt = alt.signatur || alarmSignatur(alt);
    const altGestoert = !KEINE_STOERUNG.has(alt.klasse);

    if (sigAlt === sigJetzt) continue; // identisches Problem -> keine neue Meldung

    if (altGestoert && !gestoert) {
      meldungen.push({ art: AENDERUNG.ERHOLT, sourceId: key, befund: b, vorher: alt, signatur: sigJetzt });
      continue;
    }
    if (!altGestoert && gestoert) {
      // War bereits einmal gestört und ist es erneut -> als Rückfall kennzeichnen.
      const art = alt.klasse === STOERUNGSKLASSEN.ERHOLT ? AENDERUNG.ERNEUT : AENDERUNG.NEU;
      meldungen.push({ art, sourceId: key, befund: b, vorher: alt, signatur: sigJetzt });
      continue;
    }
    if (!gestoert) continue; // beide harmlos, nur kosmetische Änderung

    const rangAlt = STUFEN_RANG[alt.stufe] ?? 0;
    const rangJetzt = STUFEN_RANG[b.stufe] ?? 0;
    if (rangJetzt > rangAlt) { meldungen.push({ art: AENDERUNG.VERSCHAERFT, sourceId: key, befund: b, vorher: alt, signatur: sigJetzt }); continue; }
    if (rangJetzt < rangAlt) { meldungen.push({ art: AENDERUNG.ENTSCHAERFT, sourceId: key, befund: b, vorher: alt, signatur: sigJetzt }); continue; }
    if ((alt.ursache || null) !== (b.ursache || null) || alt.klasse !== b.klasse) {
      meldungen.push({ art: AENDERUNG.URSACHE_GEAENDERT, sourceId: key, befund: b, vorher: alt, signatur: sigJetzt }); continue;
    }
    const paketeAlt = new Set(((alt.wirkung && alt.wirkung.pakete) || []).map((p) => p.key));
    const paketeJetzt = ((b.wirkung && b.wirkung.pakete) || []).map((p) => p.key);
    if (paketeJetzt.some((k) => !paketeAlt.has(k))) {
      meldungen.push({ art: AENDERUNG.AUSGEWEITET, sourceId: key, befund: b, vorher: alt, signatur: sigJetzt });
    }
  }
  return meldungen;
}

// ---------------------------------------------------------------------------
// 10 · Gesamtbericht
// ---------------------------------------------------------------------------
// Einziger Einstiegspunkt für Server/Admin. Alles injiziert, alles rein.
function bewerteQuellenstoerungen({
  telemetrie = [],
  retrievalPaths = [],
  packages = [],
  packagePaths = [],
  profiles = null,
  vorherigeBefunde = null,
  now = Date.now(),
  schwellen = null,
  env = process.env
} = {}) {
  const s = schwellen || stoerungsSchwellen(env);
  const telemetrieVerfuegbar = Array.isArray(telemetrie) && telemetrie.length > 0;
  const historien = buildLaufhistorie(telemetrie, { now, schwellen: s });

  // Bewertet werden ALLE Katalogwege (auch die ganz ohne Telemetrie) UND alle
  // Telemetriequellen ohne Katalogweg (Laufzeit-Personenquellen entstehen zur
  // Laufzeit aus dem Profil und stehen nie im geteilten Katalog).
  const befunde = [];
  const gesehen = new Set();
  for (const weg of Array.isArray(retrievalPaths) ? retrievalPaths : []) {
    if (!weg || !weg.id) continue;
    const sid = weg.legacy_source_id || weg.legacySourceId || weg.id;
    gesehen.add(sid);
    befunde.push(klassifiziereQuelle({ sourceId: sid, historie: historien.get(sid) || null, weg, schwellen: s, now }));
  }
  for (const [sid, historie] of historien) {
    if (gesehen.has(sid)) continue;
    befunde.push({ ...klassifiziereQuelle({ sourceId: sid, historie, weg: null, schwellen: s, now }), laufzeitquelle: true });
  }

  const { befunde: mitWirkung, paketLage } = bewertePaketwirkung({
    befunde, retrievalPaths, packages, packagePaths, profiles
  });

  const fertig = mitWirkung.map((b) => {
    const stufe = handlungsstufe(b);
    const angereichert = { ...b, stufe, stufeText: STUFEN_TEXT[stufe] };
    return { ...angereichert, signatur: alarmSignatur(angereichert) };
  });

  const gestoerte = fertig.filter((b) => !KEINE_STOERUNG.has(b.klasse));
  const zaehler = {};
  for (const k of Object.values(STOERUNGSKLASSEN)) zaehler[k] = 0;
  for (const b of fertig) zaehler[b.klasse] = (zaehler[b.klasse] || 0) + 1;
  const stufen = { keine: 0, beobachten: 0, zeitnah_pruefen: 0, akut: 0 };
  for (const b of fertig) stufen[b.stufe] = (stufen[b.stufe] || 0) + 1;

  const rang = (b) => -(STUFEN_RANG[b.stufe] ?? 0);
  const sortiert = [...fertig].sort((a, b) =>
    (rang(a) - rang(b))
    || (Number(b.kritisch) - Number(a.kritisch))
    || ((b.wiederholungen || 0) - (a.wiederholungen || 0))
    || String(a.sourceId || "").localeCompare(String(b.sourceId || "")));

  const meldungen = vorherigeBefunde ? diffAlarme(vorherigeBefunde, fertig) : null;

  return {
    generatedAtMs: now,
    // EHRLICHKEIT: ohne Telemetrie wird nichts behauptet — der Bericht sagt
    // dann ausdrücklich, dass keine Störungserkennung möglich ist.
    verfuegbar: telemetrieVerfuegbar,
    hinweis: telemetrieVerfuegbar
      ? null
      : "Keine Quellen-Telemetrie im Bewertungsfenster (source_crawl_telemetry leer oder Schreibpfad aus) — es wird keine Quellenstörung behauptet.",
    schwellen: s,
    fensterTage: s.fensterTage,
    zaehler,
    stufen,
    befunde: sortiert,
    gestoerte: sortiert.filter((b) => !KEINE_STOERUNG.has(b.klasse)),
    handlungsbedarf: sortiert.filter((b) => b.stufe === HANDLUNGSSTUFEN.AKUT || b.stufe === HANDLUNGSSTUFEN.ZEITNAH),
    paketLage,
    meldungen,
    summe: {
      quellen: fertig.length,
      gestoert: gestoerte.length,
      akut: stufen.akut,
      zeitnah: stufen.zeitnah_pruefen,
      beobachten: stufen.beobachten,
      erholt: zaehler[STOERUNGSKLASSEN.ERHOLT] || 0,
      mandatswirkungBestimmbar: Array.isArray(profiles) && profiles.length > 0
    }
  };
}

module.exports = {
  STOERUNGSKLASSEN,
  HANDLUNGSSTUFEN,
  STUFEN_RANG,
  STUFEN_TEXT,
  AENDERUNG,
  WIRKSAME_KLASSEN,
  istWirksam,
  KEINE_STOERUNG,
  STANDARD_SCHWELLEN,
  URSACHE_TEXT,
  stoerungsSchwellen,
  laufart,
  buildLaufhistorie,
  veraltetSchwelleTage,
  erholungAnerkannt,
  klasseAusUrsache,
  klassifiziereQuelle,
  bewertePaketwirkung,
  handlungsstufe,
  alarmSignatur,
  diffAlarme,
  bewerteQuellenstoerungen
};
