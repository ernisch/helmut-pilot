"use strict";

// Helmut — Quellenarchitektur · Geografie-Gedaechtnis (Sprint 20)
// =============================================================================
// REIN, DETERMINISTISCH, KEINE KI, kein Netz, kein Storage, KEIN zusaetzlicher
// KI-Aufruf. Schwestermodul zu `ebenen-gedaechtnis.js` (Sprint 19) — dort die
// politische Ebene, hier die Geografie. Die beiden Fragen sind ausdruecklich
// GETRENNT:
//
//   politische Ebene  ->  "land"     (WER entscheidet)
//   Geografie         ->  "Berlin"   (WO es wirkt)
//
// Ein Vorgang darf die Ebene 'land' tragen und geografisch UNBEKANNT bleiben.
//
// ---------------------------------------------------------------------------
// BEFUND, DER DIESES MODUL AUSLOEST (analysiert am 2026-07-27, Sprint 20)
// ---------------------------------------------------------------------------
// `classification.deriveAffectedGeographies(level, mentionedGeos)` erzeugte die
// betroffene Geografie AUSSCHLIESSLICH aus der politischen Ebene:
//
//   level === 'bund'  -> [Deutschland]                     (aus der Ebene erfunden)
//   level === 'land'  -> erstes erwaehntes Bundesland      (Erwaehnung = Betroffenheit)
//                        sonst [Deutschland]               (falscher Ersatzwert)
//   level === 'eu'    -> [Europaeische Union]              (aus der Ebene erfunden)
//   sonst             -> erstes erwaehntes Bundesland      (nur EINE Region moeglich)
//
// Vier Fehler in vier Zeilen: (1) Geografie aus der Ebene abgeleitet, (2) blosse
// Erwaehnung als Betroffenheit gewertet, (3) Deutschland als Ersatz fuer eine
// unbekannte Landesgeografie, (4) strukturell nur EINE betroffene Region.
//
// ---------------------------------------------------------------------------
// ZIELMODELL (kleinste dauerhaft tragfaehige Loesung)
// ---------------------------------------------------------------------------
// KEINE neue Tabelle, KEINE Migration, KEINE zweite Geografiestruktur. Die drei
// fachlichen Bedeutungen werden auf die BEREITS VORHANDENEN Strukturen gelegt:
//
//   betroffene Geografie  -> knowledge_objects.affected_geographies  (jsonb[])
//   erwaehnte Geografie   -> knowledge_objects.mentioned_geographies (jsonb[])
//   Quellengeografie      -> nur INDIZ; sie ist bereits kanonisch relational
//                            vorhanden (source_packages.geography_id /
//                            path_expected_geographies je Abrufweg) und wird
//                            NICHT ein zweites Mal am Vorgang gespeichert.
//                            Was dieses Modul garantiert: eine Quellengeografie
//                            kann NIE eine betroffene Geografie werden. Sie wird
//                            additiv als Indiz in classification_confidence
//                            vermerkt (geography_indizien).
//
// Jeder Eintrag traegt zusaetzlich zu {name, level, geography_id} seine
// HERKUNFT. Das ist der einzige additive Zuwachs im Datensatz und die
// Voraussetzung dafuer, dass ein staerkerer Nachweis einen schwaecheren
// nachvollziehbar korrigieren darf.
//
// ---------------------------------------------------------------------------
// HERKUNFTSPRIORITAET (Auftrag §"Erwartete Herkunftspriorität")
// ---------------------------------------------------------------------------
//   parser      6  strukturierte Daten eines spezialisierten Parlamentsparsers
//                  (pardok-parser.js liefert `geografie: 'geo-land-berlin'`;
//                   Berlin/Brandenburg sind BEWUSST inaktiv -> heute unbefuellt,
//                   die Aufnahme ist verdrahtet und getestet)
//   amtlich     5  eindeutige amtliche Metadaten (heute keine Quelle -> unbefuellt,
//                  Rang existiert, damit ein spaeterer Zulauf nicht umgebaut werden muss)
//   inhalt      4  explizite inhaltliche Aussage des Dokuments: eine im Vorgang
//                  handelnde/genannte SUBNATIONALE Institution aus dem kanonischen
//                  Entitaetenkatalog (Abgeordnetenhaus von Berlin, Senat von Berlin,
//                  Landtag Brandenburg, Staatskanzlei …). Bundesinstitutionen sind
//                  AUSGESCHLOSSEN — sie tragen keine regionale Information ueber die
//                  Ebene hinaus; sie zuzulassen waere die verbotene Ableitung
//                  "Ebene -> Geografie" durch die Hintertuer.
//   ki          3  bestehende strukturierte KI-Analyse (ai.affected_geographies aus
//                  dem OHNEHIN stattfindenden Understanding-Call)
//   erwaehnung  2  blosse Nennung im Text (mentioned_locations). Erzeugt NIE eine
//                  betroffene Geografie — nur eine erwaehnte.
//   quelle      1  Abrufweg/Quellenkontext. NUR INDIZ. Strukturell davon
//                  ausgeschlossen, eine betroffene Geografie zu werden.
//
// Alt-Eintraege ohne Herkunft (alle Zeilen vor Sprint 20) werden als
// 'bestand-alt' (Rang 2) gelesen: sie gehen nie verloren (Regel 8), duerfen aber
// von jedem echten inhaltlichen Nachweis (Rang >= 3) korrigiert werden (Regel 9).
// Eine Nachklassifikation des Altbestands findet in Sprint 20 NICHT statt.
//
// ---------------------------------------------------------------------------
// ENTSCHEIDUNGSREGELN (in dieser Reihenfolge)
// ---------------------------------------------------------------------------
//   1. Keine neuen betroffenen Kandidaten  -> Bestand bleibt unveraendert.
//      >>> FAIL CLOSED: eine belastbare Geografie wird NIE durch leer/unbekannt
//          ersetzt. <<<
//   2. Kein Bestand -> die neuen Kandidaten sind die Erstermittlung.
//   3. Gleiche Menge -> bestaetigt (Herkunft darf sich verbessern, der Zeitpunkt
//      der Erstermittlung bleibt).
//   4. Neue Kandidaten STAERKER als der Bestand -> Korrektur (der Bestand wird
//      ersetzt, `geaendert: true`, Grund protokolliert).
//   5. Gleich stark -> VEREINIGUNG. Ein Vorgang kann mehrere Regionen betreffen
//      (Regel 6); ein zweiter Lauf mit einer zusaetzlich belegten Region ergaenzt,
//      statt zu verdraengen.
//   6. Neue Kandidaten SCHWAECHER -> Bestand bleibt (kein Verduennen).
//
// Damit ist das Ergebnis IDEMPOTENT: dieselbe Eingabe liefert dieselbe Ausgabe,
// wiederholte Verarbeitung erzeugt keine Duplikate und keinen Rueckschritt.
//
// KOSTEN: null. Es entsteht KEIN zusaetzlicher KI-Aufruf; die bereits bezahlte
// Analyse wird nur nicht mehr weggeworfen.

// --- Rollen und Herkuenfte ---------------------------------------------------

// Rolle einer Zuordnung. 'quelle' ist bewusst eine eigene Rolle und KEINE
// schwache Form von 'betroffen' — der Unterschied ist fachlich, nicht graduell.
const ROLLEN = ["betroffen", "erwaehnt", "quelle"];

const HERKUNFT_RANG = {
  quelle: 1,
  erwaehnung: 2,
  "bestand-alt": 2,
  ki: 3,
  inhalt: 4,
  amtlich: 5,
  parser: 6
};

// Herkuenfte, die NIEMALS allein eine betroffene Geografie tragen duerfen.
// Regel 4 des Auftrags: "Eine Quellengeografie darf nicht ungeprueft als
// betroffene Geografie uebernommen werden." Hier ist es keine Pruefung, sondern
// ein struktureller Ausschluss — das ist die staerkere Garantie.
const NUR_INDIZ_HERKUENFTE = new Set(["quelle"]);

// Herkunft eines Alt-Eintrags ohne explizite Angabe.
const HERKUNFT_BESTAND_ALT = "bestand-alt";
// Herkunft, wenn ein Aufrufer gar keine angibt.
const HERKUNFT_STANDARD = "erwaehnung";

// Mengengrenzen. Ein Vorgang, der ueber Monate Dokumente sammelt, soll nicht
// unbegrenzt Geografien anhaeufen; die Grenzen sind grosszuegig und schneiden
// deterministisch ab (schwaechste zuerst).
const MAX_BETROFFEN = 12;
const MAX_ERWAEHNT = 24;
const MAX_INDIZIEN = 12;

function normText(wert) {
  return String(wert == null ? "" : wert)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function normHerkunft(wert) {
  const h = String(wert == null ? "" : wert).trim().toLowerCase();
  return HERKUNFT_RANG[h] ? h : HERKUNFT_STANDARD;
}

function herkunftRang(wert) {
  return HERKUNFT_RANG[String(wert == null ? "" : wert).trim().toLowerCase()] || HERKUNFT_RANG[HERKUNFT_STANDARD];
}

function normRolle(wert) {
  const r = String(wert == null ? "" : wert).trim().toLowerCase();
  return ROLLEN.includes(r) ? r : "erwaehnt";
}

function normZeitpunkt(wert) {
  const s = String(wert == null ? "" : wert).trim();
  return s ? s.slice(0, 40) : null;
}

// Stabiler Schluessel einer Geografie. Kanonische ID hat Vorrang; ein
// unaufgeloester Ort bleibt ueber seinen normalisierten Namen unterscheidbar
// (er wird ehrlich erhalten, nicht erfunden und nicht weggeworfen).
function geoSchluessel(eintrag) {
  if (!eintrag) return "";
  const id = String(eintrag.geography_id == null ? "" : eintrag.geography_id).trim();
  if (id) return `id:${id}`;
  const n = normText(eintrag.name);
  return n ? `name:${n}` : "";
}

// Einen einzelnen Eintrag auf die gespeicherte Form normalisieren.
// Bewusst NUR die vier Schluessel — nichts aus einer KI-Antwort landet
// ungefiltert im Datensatz.
function normEintrag(roh, standardHerkunft) {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const name = String(roh.name == null ? "" : roh.name).trim().slice(0, 120);
  const id = roh.geography_id == null ? null : String(roh.geography_id).trim().slice(0, 80) || null;
  if (!name && !id) return null;
  const level = String(roh.level == null ? "" : roh.level).trim().toLowerCase().slice(0, 20) || "unknown";
  const herkunft = normHerkunft(roh.herkunft || standardHerkunft);
  return { name: name || id, level, geography_id: id, herkunft };
}

// Deterministische Reihenfolge: staerkste Herkunft zuerst, danach alphabetisch
// nach Schluessel. Ohne feste Ordnung waeren wiederholte Laeufe nicht
// byte-identisch und wuerden `updated_at` ohne Sachgrund fortschreiben.
function sortiere(liste) {
  return [...liste].sort((a, b) => {
    const d = herkunftRang(b.herkunft) - herkunftRang(a.herkunft);
    if (d !== 0) return d;
    return geoSchluessel(a).localeCompare(geoSchluessel(b));
  });
}

// Vereinigt Listen und behaelt je Geografie den STAERKSTEN Beleg. Dieselbe
// Geografie zweimal (einmal aus der KI, einmal aus dem Katalog) ist EIN Eintrag —
// das ist der Duplikatsschutz bei wiederholter Verarbeitung.
function vereinige(...listen) {
  const beste = new Map();
  for (const liste of listen) {
    for (const e of Array.isArray(liste) ? liste : []) {
      const k = geoSchluessel(e);
      if (!k) continue;
      const vorhanden = beste.get(k);
      if (!vorhanden) { beste.set(k, e); continue; }
      // Staerkerer Beleg gewinnt; bei Gleichstand gewinnt der Eintrag mit
      // kanonischer ID (aufgeloest schlaegt unaufgeloest).
      if (herkunftRang(e.herkunft) > herkunftRang(vorhanden.herkunft)) { beste.set(k, e); continue; }
      if (herkunftRang(e.herkunft) === herkunftRang(vorhanden.herkunft) && e.geography_id && !vorhanden.geography_id) {
        beste.set(k, e);
      }
    }
  }
  return sortiere([...beste.values()]);
}

function staerke(liste) {
  let max = 0;
  for (const e of Array.isArray(liste) ? liste : []) max = Math.max(max, herkunftRang(e.herkunft));
  return max;
}

function gleicheMenge(a, b) {
  const ka = new Set((a || []).map(geoSchluessel));
  const kb = new Set((b || []).map(geoSchluessel));
  if (ka.size !== kb.size) return false;
  for (const k of ka) if (!kb.has(k)) return false;
  return true;
}

// --- Bestand lesen ----------------------------------------------------------

// jsonb kommt aus PostgREST als Array; Alt-/Testdaten koennen eine
// JSON-Zeichenkette sein. Beides fail-safe lesen, nie werfen — ein kaputtes jsonb
// ist kein Grund, eine Geografie zu verlieren.
function leseListe(roh) {
  if (Array.isArray(roh)) return roh;
  if (typeof roh === "string" && roh.trim()) {
    try {
      const parsed = JSON.parse(roh);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* absichtlich still */ }
  }
  return [];
}

function leseKonfidenzblock(bestand) {
  const roh = bestand && bestand.classification_confidence;
  if (roh && typeof roh === "object" && !Array.isArray(roh)) return roh;
  if (typeof roh === "string" && roh.trim()) {
    try {
      const parsed = JSON.parse(roh);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (_) { /* absichtlich still */ }
  }
  return {};
}

// Den gespeicherten Geografie-Stand eines Vorgangs lesen. Eintraege ohne
// Herkunft stammen aus der Zeit vor Sprint 20 -> 'bestand-alt'.
function leseBestand(bestand) {
  const konfidenz = leseKonfidenzblock(bestand);
  const betroffen = leseListe(bestand && bestand.affected_geographies)
    .map((e) => normEintrag(e, HERKUNFT_BESTAND_ALT)).filter(Boolean);
  const erwaehnt = leseListe(bestand && bestand.mentioned_geographies)
    .map((e) => normEintrag(e, HERKUNFT_BESTAND_ALT)).filter(Boolean);
  const indizien = leseListe(konfidenz.geography_indizien)
    .map((e) => normEintrag(e, "quelle")).filter(Boolean);
  return {
    betroffen: sortiere(betroffen),
    erwaehnt: sortiere(erwaehnt),
    indizien: sortiere(indizien),
    ermittelt: betroffen.length > 0,
    ermittelt_am: betroffen.length ? normZeitpunkt(konfidenz.geography_ermittelt_am) : null
  };
}

// --- Kandidaten einsortieren ------------------------------------------------

// Kandidat: { name, level, geography_id, herkunft, rolle }
// Ein Kandidat mit rolle 'betroffen' und einer NUR-INDIZ-Herkunft wird
// automatisch zum Indiz herabgestuft — der Ausschluss ist strukturell und laesst
// sich vom Aufrufer nicht umgehen.
function sortiereKandidaten(kandidaten) {
  const betroffen = [];
  const erwaehnt = [];
  const indizien = [];
  for (const roh of Array.isArray(kandidaten) ? kandidaten : []) {
    const e = normEintrag(roh, HERKUNFT_STANDARD);
    if (!e) continue;
    const rolle = normRolle(roh && roh.rolle);
    if (rolle === "quelle" || NUR_INDIZ_HERKUENFTE.has(e.herkunft)) {
      indizien.push({ ...e, herkunft: "quelle" });
      continue;
    }
    if (rolle === "betroffen") { betroffen.push(e); continue; }
    erwaehnt.push(e);
  }
  return {
    betroffen: vereinige(betroffen),
    erwaehnt: vereinige(erwaehnt),
    indizien: vereinige(indizien)
  };
}

// --- Kernentscheidung -------------------------------------------------------
//
//   bestand:    das gespeicherte knowledge_object (oder null/undefined)
//   kandidaten: Liste { name, level, geography_id, herkunft, rolle }
//   jetzt:      ISO-Zeitstempel fuer eine Erstermittlung (Testbarkeit)
//
// Rueckgabe (alle Felder immer gesetzt):
//   { betroffen, erwaehnt, indizien, ermittelt, quelle, ermittelt_am,
//     wiederverwendet, geaendert, grund }
function entscheideGeografien({ bestand = null, kandidaten = [], jetzt = null } = {}) {
  const b = leseBestand(bestand);
  const k = sortiereKandidaten(kandidaten);
  const zeitpunkt = normZeitpunkt(jetzt) || new Date().toISOString();

  // Erwaehnungen und Indizien sind additiv: ein Vorgang sammelt Dokumente, also
  // sammelt er auch Nennungen. Sie werden nie geleert, aber auch nie zu einer
  // Betroffenheit befoerdert.
  const erwaehnt = vereinige(b.erwaehnt, k.erwaehnt).slice(0, MAX_ERWAEHNT);
  const indizien = vereinige(b.indizien, k.indizien).slice(0, MAX_INDIZIEN);

  const fertig = (betroffen, extra) => ({
    betroffen: betroffen.slice(0, MAX_BETROFFEN),
    erwaehnt,
    indizien,
    ermittelt: betroffen.length > 0,
    quelle: betroffen.length ? betroffen[0].herkunft : null,
    ...extra
  });

  // 1) Keine neuen betroffenen Kandidaten -> Bestand bleibt (FAIL CLOSED).
  if (!k.betroffen.length) {
    return fertig(b.betroffen, {
      ermittelt_am: b.ermittelt_am,
      wiederverwendet: b.ermittelt,
      geaendert: false,
      grund: b.ermittelt ? "bestand-bleibt-kein-neues-signal" : "nicht-ermittelbar"
    });
  }

  // 2) Kein Bestand -> Erstermittlung.
  if (!b.ermittelt) {
    return fertig(k.betroffen, {
      ermittelt_am: zeitpunkt, wiederverwendet: false, geaendert: false, grund: "erstermittlung"
    });
  }

  // 3) Gleiche Menge -> bestaetigt. Die Herkunft darf sich verbessern, der
  //    Zeitpunkt der Erstermittlung bleibt.
  if (gleicheMenge(b.betroffen, k.betroffen)) {
    return fertig(vereinige(b.betroffen, k.betroffen), {
      ermittelt_am: b.ermittelt_am, wiederverwendet: true, geaendert: false, grund: "bestaetigt"
    });
  }

  const staerkeNeu = staerke(k.betroffen);
  const staerkeBestand = staerke(b.betroffen);

  // 4) Staerkerer Nachweis korrigiert nachvollziehbar.
  if (staerkeNeu > staerkeBestand) {
    return fertig(k.betroffen, {
      ermittelt_am: zeitpunkt, wiederverwendet: false, geaendert: true, grund: "hoeherwertige-herkunft"
    });
  }

  // 5) Gleich stark -> vereinigen (mehrere betroffene Regionen sind zulaessig).
  if (staerkeNeu === staerkeBestand) {
    const vereint = vereinige(b.betroffen, k.betroffen);
    return fertig(vereint, {
      ermittelt_am: b.ermittelt_am,
      wiederverwendet: true,
      geaendert: !gleicheMenge(b.betroffen, vereint),
      grund: "vereinigt-gleichstark"
    });
  }

  // 6) Schwaecher -> Bestand bleibt (kein Verduennen belastbarer Werte).
  return fertig(b.betroffen, {
    ermittelt_am: b.ermittelt_am, wiederverwendet: true, geaendert: false, grund: "bestand-stabil"
  });
}

// --- Ehrliche Konfidenz -----------------------------------------------------
// Die alte Kennzahl lautete `mentioned_geographies.length ? "medium" : "low"` —
// sie mass ERWAEHNUNGEN und nannte das Ergebnis Geografie-Konfidenz. Genau die
// Vermischung, die dieser Sprint aufloest. Massgeblich ist ausschliesslich, wie
// stark die BETROFFENE Geografie belegt ist.
function geografieKonfidenz(ergebnis) {
  const rang = ergebnis && ergebnis.betroffen && ergebnis.betroffen.length
    ? herkunftRang(ergebnis.betroffen[0].herkunft) : 0;
  if (rang >= HERKUNFT_RANG.amtlich) return "high";
  if (rang >= HERKUNFT_RANG.ki) return "medium";
  if (rang > 0) return "low";
  return "unknown";
}

// --- Trennung im Matchingkontext --------------------------------------------
// Abnahmekriterium 3: betroffene und lediglich erwaehnte Geografien muessen im
// Matchingkontext EINDEUTIG UNTERSCHEIDBAR sein. Diese beiden Lesehilfen liefern
// genau das. Sie aendern KEINE Gewichtung und KEIN Scoring (Regel 14) — sie
// machen die Unterscheidung nur verfuegbar.
function betroffeneRegionen(ko = {}) {
  return leseListe(ko.affected_geographies).map((e) => normEintrag(e, HERKUNFT_BESTAND_ALT))
    .filter(Boolean).map((e) => e.name);
}

function erwaehnteRegionen(ko = {}) {
  return leseListe(ko.mentioned_geographies).map((e) => normEintrag(e, HERKUNFT_BESTAND_ALT))
    .filter(Boolean).map((e) => e.name);
}

module.exports = {
  ROLLEN, HERKUNFT_RANG, NUR_INDIZ_HERKUENFTE,
  HERKUNFT_BESTAND_ALT, HERKUNFT_STANDARD,
  MAX_BETROFFEN, MAX_ERWAEHNT, MAX_INDIZIEN,
  geoSchluessel, herkunftRang, normEintrag,
  leseBestand, sortiereKandidaten, entscheideGeografien,
  geografieKonfidenz, betroffeneRegionen, erwaehnteRegionen
};
