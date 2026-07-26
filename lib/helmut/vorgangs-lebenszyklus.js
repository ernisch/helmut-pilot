"use strict";

// Helmut — Lebenszyklus eines Rohdokuments (Betriebsbefund B4, Phase 10).
// =============================================================================
// REINE LOGIK: kein Netz, keine KI, keine Datenbank. Alle Daten kommen als
// Parameter herein; die Aufrufer (Nachhol-Werkzeug, Watchdog, Messung) holen sie
// jeweils selbst und ausschliesslich LESEND.
//
// PROBLEM (belegt in docs/befund-csd-2026-vorgangsverlust.md): ein Rohdokument
// konnte die Verarbeitung verlassen, ohne dass irgendwo stand, was mit ihm
// passiert ist. `skipped-exists` erzeugte weder Verknuepfung noch Telemetrie noch
// Fehler. Ein Betreiber konnte deshalb nicht unterscheiden zwischen
// "verarbeitet", "bewusst verworfen" und "lautlos verloren".
//
// LOESUNG OHNE NEUE TABELLE: der Endzustand wird aus Daten ABGELEITET, die es
// bereits gibt — `ko_document_links` (haengt das Dokument an einem Vorgang?) und
// dem Zustand des zugehoerigen Knowledge Objects. Die Vorgangsbildung stellt
// seit demselben Sprint sicher, dass JEDER Ausgang, der einen Vorgang gefunden
// oder gebildet hat, diese Verknuepfung schreibt (Verknuepfungsinvariante).
//
// EHRLICHE GRENZE — und sie wird bewusst nicht kaschiert:
// Aus dauerhaften Daten sind SECHS Zustaende unterscheidbar (siehe ZUSTAND).
// Die feinere Unterscheidung zwischen "echtes Duplikat", "in Bestand aufgenommen"
// und "Bestand aktualisiert" liegt in der LAUFTELEMETRIE (processRuns), nicht am
// einzelnen Dokument. Sie wird hier deshalb nicht erfunden, sondern benannt:
// `spaeterErgaenzt` und `koVersion` zeigen, was aus den Daten ableitbar IST.

// Die sechs aus Bestandsdaten unterscheidbaren Endzustaende.
// Genau EINER davon ist unzulaessig: OHNE_ENDZUSTAND.
const ZUSTAND = {
  VERSTANDEN: "verstanden",            // haengt an einem verstandenen Vorgang
  AUSGESCHLOSSEN: "ausgeschlossen",    // haengt an einem terminal aussortierten Vorgang
  FEHLGESCHLAGEN: "fehlgeschlagen",    // haengt an einem nach KI-Fehlschlag geparkten Vorgang
  WIEDERVORLAGE: "wiedervorlage",      // haengt an einem vorgemerkten Vorgang (erneute Verarbeitung vorgesehen)
  OFFEN: "offen",                      // noch nicht verarbeitet, aber innerhalb der Karenzzeit
  OHNE_ENDZUSTAND: "ohne-endzustand"   // UNZULAESSIG: keine Spur, Karenzzeit ueberschritten
};

// Nur diese Zustaende gelten als gueltiger Abschluss der Verarbeitung.
const GUELTIGE_ENDZUSTAENDE = new Set([
  ZUSTAND.VERSTANDEN, ZUSTAND.AUSGESCHLOSSEN, ZUSTAND.FEHLGESCHLAGEN,
  ZUSTAND.WIEDERVORLAGE, ZUSTAND.OFFEN
]);

// Karenzzeit: so lange darf ein frisch eingesammeltes Rohdokument unverarbeitet
// sein, ohne dass das ein Befund ist. Bezug: der Crawl laeuft mehrmals taeglich,
// der dedizierte Understanding-Lauf zweimal (05:30/21:30 UTC). 24 h deckt einen
// ausgefallenen Lauf ab, ohne einen echten Rueckstand zu verstecken.
const KARENZ_STUNDEN = 24;

// Obergrenze der namentlich gemeldeten Dokumente. Ein Rueckstand von Tausenden
// darf weder den Report noch den Alarmkanal fluten; die echte Zahl steht daneben.
const MAX_GEMELDETE_IDS = 50;

function ms(v) {
  const t = Date.parse(v || "");
  return Number.isFinite(t) ? t : null;
}

function isTerminal(understandingStatus) {
  // Bewusst lokal gehalten statt aus pending-terminal.js importiert: dieses Modul
  // soll ohne jede weitere Abhaengigkeit ladbar bleiben. Die Semantik ist
  // identisch — "failed-final" ist der terminale Zustand aus OP-06/P1-4.
  return String(understandingStatus || "").toLowerCase() === "failed-final";
}

// Endzustand EINES Rohdokuments.
//   doc  { id, created_at }
//   kos  die zu diesem Dokument verknuepften Knowledge Objects (0..n)
function classifyDocument(doc = {}, kos = [], { now = Date.now(), karenzStunden = KARENZ_STUNDEN } = {}) {
  const verknuepft = (Array.isArray(kos) ? kos : []).filter(Boolean);
  const docMs = ms(doc.created_at);

  if (!verknuepft.length) {
    const alterH = docMs == null ? null : (now - docMs) / 3600000;
    // Ohne Zeitstempel laesst sich die Karenzzeit nicht beurteilen — dann gilt das
    // Dokument als ohne Endzustand. Lieber ein Befund zu viel als ein stiller Verlust.
    if (alterH != null && alterH <= karenzStunden) {
      return { zustand: ZUSTAND.OFFEN, gueltig: true, alterStunden: alterH, vorgangId: null };
    }
    return { zustand: ZUSTAND.OHNE_ENDZUSTAND, gueltig: false, alterStunden: alterH, vorgangId: null };
  }

  // Mehrfachverknuepfung: der STAERKSTE Zustand gewinnt. Ein Dokument, das an
  // einem verstandenen Vorgang haengt, ist verarbeitet — auch wenn es zusaetzlich
  // an einer alten Vormerkung haengt.
  const rang = (ko) => {
    if (!ko) return 0;
    if (isTerminal(ko.understanding_status)) return 3;
    if (String(ko.status) !== "pending") return 4;
    if (String(ko.understanding_status) === "failed") return 2;
    return 1; // pending/pending -> Wiedervorlage
  };
  const beste = verknuepft.slice().sort((a, b) => rang(b) - rang(a))[0];
  const koMs = ms(beste.created_at);
  const gemeinsam = {
    vorgangId: beste.vorgang_id || null,
    koId: beste.id || null,
    koVersion: Number(beste.ko_version) || null,
    // Kam das Dokument NACH der Entstehung des Vorgangs dazu? Dann wurde es einem
    // bestehenden Vorgang zugeordnet statt ihn zu begruenden.
    spaeterErgaenzt: docMs != null && koMs != null ? docMs > koMs : null,
    verarbeitungsdauerMs: docMs != null && koMs != null ? Math.max(0, koMs - docMs) : null
  };

  switch (rang(beste)) {
    case 4: return { zustand: ZUSTAND.VERSTANDEN, gueltig: true, ...gemeinsam };
    case 3: return { zustand: ZUSTAND.AUSGESCHLOSSEN, gueltig: true, ...gemeinsam };
    case 2: return { zustand: ZUSTAND.FEHLGESCHLAGEN, gueltig: true, ...gemeinsam };
    default: return { zustand: ZUSTAND.WIEDERVORLAGE, gueltig: true, ...gemeinsam };
  }
}

// Gesamtbewertung eines Zeitfensters.
//   rawDocs  [{ id, created_at, source_id, ... }]
//   links    [{ raw_document_id, knowledge_object_id }]
//   kos      [{ id, vorgang_id, status, understanding_status, ko_version, created_at }]
function assessLifecycle({ rawDocs = [], links = [], kos = [], now = Date.now(), karenzStunden = KARENZ_STUNDEN } = {}) {
  const koById = new Map((kos || []).filter(Boolean).map((k) => [k.id, k]));
  const linksByDoc = new Map();
  for (const l of links || []) {
    if (!l || !l.raw_document_id) continue;
    if (!linksByDoc.has(l.raw_document_id)) linksByDoc.set(l.raw_document_id, []);
    const ko = koById.get(l.knowledge_object_id);
    if (ko) linksByDoc.get(l.raw_document_id).push(ko);
  }

  const zustaende = Object.fromEntries(Object.values(ZUSTAND).map((z) => [z, 0]));
  const ohneEndzustand = [];
  const offene = [];
  const dauern = [];
  const je = [];

  for (const doc of rawDocs || []) {
    if (!doc || !doc.id) continue;
    const r = classifyDocument(doc, linksByDoc.get(doc.id) || [], { now, karenzStunden });
    zustaende[r.zustand] += 1;
    je.push({ id: doc.id, ...r });
    if (r.zustand === ZUSTAND.OHNE_ENDZUSTAND) ohneEndzustand.push({ id: doc.id, created_at: doc.created_at || null, source_id: doc.source_id || null });
    if (r.zustand === ZUSTAND.OFFEN) offene.push({ id: doc.id, created_at: doc.created_at || null });
    if (Number.isFinite(r.verarbeitungsdauerMs)) dauern.push(r.verarbeitungsdauerMs);
  }

  const gesamt = je.length;
  const anteile = Object.fromEntries(Object.entries(zustaende).map(([k, v]) =>
    [k, gesamt ? Math.round((v / gesamt) * 1000) / 10 : 0]));
  const aeltestes = (liste) => liste
    .map((d) => ({ ...d, ms: ms(d.created_at) }))
    .filter((d) => d.ms != null)
    .sort((a, b) => a.ms - b.ms)[0] || null;

  return {
    gesamt,
    zustaende,
    anteile,
    gueltigeEndzustaende: gesamt - zustaende[ZUSTAND.OHNE_ENDZUSTAND],
    karenzStunden,
    aeltestesOffenes: aeltestes(offene),
    aeltestesOhneEndzustand: aeltestes(ohneEndzustand),
    ohneEndzustandIds: ohneEndzustand.slice(0, MAX_GEMELDETE_IDS).map((d) => d.id),
    ohneEndzustandGesamt: ohneEndzustand.length,
    verarbeitungsdauer: dauern.length ? {
      gemessen: dauern.length,
      mittelMs: Math.round(dauern.reduce((a, b) => a + b, 0) / dauern.length),
      maxMs: Math.max(...dauern),
      medianMs: dauern.slice().sort((a, b) => a - b)[Math.floor(dauern.length / 2)]
    } : { gemessen: 0, mittelMs: null, maxMs: null, medianMs: null },
    je
  };
}

// --- Watchdog ---------------------------------------------------------------
// Meldet Rohdokumente OHNE gueltigen Endzustand. Bewusst zweistufig: ein einzelnes
// verwaistes Dokument ist ein Hinweis, ein systematischer Rueckstand ist ein Alarm.
// KEIN falsches Gruen: 0 Dokumente im Fenster liefert "unbekannt", nicht "ok".
const WATCHDOG_SCHWELLEN = {
  warnungAnteil: 1,    // Prozent der Dokumente ohne Endzustand
  alarmAnteil: 5,
  alarmAlterStunden: 72 // aeltestes Dokument ohne Endzustand
};

function watchdogVorgangsbildung(bewertung = {}, schwellen = {}) {
  const s = { ...WATCHDOG_SCHWELLEN, ...schwellen };
  const gesamt = Number(bewertung.gesamt) || 0;
  const ohne = Number(bewertung.ohneEndzustandGesamt) || 0;
  const anteil = gesamt ? (ohne / gesamt) * 100 : 0;
  const meldungen = [];

  if (!gesamt) {
    return {
      zustand: "unbekannt", meldungen: ["Keine Rohdokumente im Betrachtungsfenster — Aussage nicht moeglich."],
      kennzahlen: { gesamt, ohneEndzustand: ohne, anteilProzent: 0 }
    };
  }

  let zustand = "ok";
  if (ohne > 0) {
    const alter = bewertung.aeltestesOhneEndzustand;
    const alterH = alter && alter.ms ? Math.round((Date.now() - alter.ms) / 3600000) : null;
    meldungen.push(`${ohne} von ${gesamt} Rohdokumenten (${Math.round(anteil * 10) / 10} %) haben keinen nachvollziehbaren Endzustand.`);
    if (alter) meldungen.push(`Aeltestes betroffenes Dokument: ${alter.id}${alterH != null ? ` (${alterH} h alt)` : ""}.`);
    if (anteil >= s.alarmAnteil || (alterH != null && alterH >= s.alarmAlterStunden)) zustand = "alarm";
    else if (anteil >= s.warnungAnteil) zustand = "warnung";
    else zustand = "warnung";
  }

  const wiedervorlage = Number(bewertung.zustaende && bewertung.zustaende[ZUSTAND.WIEDERVORLAGE]) || 0;
  const fehlgeschlagen = Number(bewertung.zustaende && bewertung.zustaende[ZUSTAND.FEHLGESCHLAGEN]) || 0;
  if (wiedervorlage) meldungen.push(`${wiedervorlage} Rohdokumente warten auf erneute Verarbeitung (vorgemerkte Vorgaenge).`);
  if (fehlgeschlagen) meldungen.push(`${fehlgeschlagen} Rohdokumente haengen an Vorgaengen, die nach einem KI-Fehlschlag geparkt sind.`);

  return {
    zustand, meldungen,
    kennzahlen: {
      gesamt, ohneEndzustand: ohne,
      anteilProzent: Math.round(anteil * 10) / 10,
      wiedervorlage, fehlgeschlagen,
      verstanden: Number(bewertung.zustaende && bewertung.zustaende[ZUSTAND.VERSTANDEN]) || 0,
      offen: Number(bewertung.zustaende && bewertung.zustaende[ZUSTAND.OFFEN]) || 0
    }
  };
}

// Nachhol-Kandidaten: genau die Dokumente, die eine erneute Verarbeitung
// BRAUCHEN. Bewusst NICHT enthalten: verstandene und bewusst ausgeschlossene
// Dokumente — sie erneut zu verarbeiten wuerde Duplikate erzeugen und kosten.
const NACHHOLBARE_ZUSTAENDE = new Set([ZUSTAND.OHNE_ENDZUSTAND, ZUSTAND.WIEDERVORLAGE, ZUSTAND.FEHLGESCHLAGEN]);

function nachholKandidaten(bewertung = {}, { zustaende = null, limit = 200 } = {}) {
  const erlaubt = zustaende ? new Set(zustaende) : NACHHOLBARE_ZUSTAENDE;
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 200;
  const alle = (bewertung.je || []).filter((d) => erlaubt.has(d.zustand));
  return {
    gesamt: alle.length,
    gekappt: alle.length > safeLimit,
    kandidaten: alle.slice(0, safeLimit)
  };
}

module.exports = {
  ZUSTAND, GUELTIGE_ENDZUSTAENDE, NACHHOLBARE_ZUSTAENDE,
  KARENZ_STUNDEN, WATCHDOG_SCHWELLEN, MAX_GEMELDETE_IDS,
  classifyDocument, assessLifecycle, watchdogVorgangsbildung, nachholKandidaten
};
