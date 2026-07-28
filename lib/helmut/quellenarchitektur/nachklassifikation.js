"use strict";

// Helmut — Quellenarchitektur · Nachklassifikation des Altbestands (Sprint 21)
// =============================================================================
// REIN, DETERMINISTISCH, KEINE KI, kein Netz, kein Storage, KEIN zusaetzlicher
// KI-Aufruf. Das Modul entscheidet ausschliesslich AUS DEM BEREITS GESPEICHERTEN
// Datensatz, was an einem Wissensobjekt falsch ist und wie es zu korrigieren
// waere. Es schreibt nichts — es baut einen PLAN. Das Schreiben ist Sache des
// Werkzeugs `scripts/nachklassifikation.js` und braucht dort einen ausdruecklichen
// Schalter.
//
// ---------------------------------------------------------------------------
// WARUM ES DIESES MODUL GIBT (Ausgangsbefund, OP-24)
// ---------------------------------------------------------------------------
// Sprint 20 hat den SCHREIBPFAD korrigiert: eine betroffene Geografie entsteht
// nur noch aus Nachweisen, nie aus `decision_level`. Der ALTBESTAND blieb
// bewusst unangetastet. Er traegt deshalb weiterhin die vier Fehler der alten
// Funktion `deriveAffectedGeographies(level, mentionedGeos)`:
//
//   level === 'bund'  -> [Deutschland]                  (aus der Ebene erfunden)
//   level === 'land'  -> erstes ERWAEHNTES Bundesland    (Erwaehnung = Betroffenheit)
//                        sonst [Deutschland]            (verbotener Ersatzwert)
//   level === 'eu'    -> [Europaeische Union, id: null] (frei erfunden, nicht kanonisch)
//   sonst             -> erstes erwaehntes Bundesland   (strukturell nur EINE Region)
//
// Genau diese vier Formen — und NUR sie — sind hier maschinell wiedererkennbar.
// Alles andere bleibt unangetastet.
//
// ---------------------------------------------------------------------------
// DIE ZENTRALE SICHERHEITSREGEL
// ---------------------------------------------------------------------------
// Sprint 21 ist KEIN vollstaendiges Neuschreiben. Ein Altwert wird nur dann
// entfernt, wenn ZWEI Bedingungen zugleich gelten:
//
//   (1) Er traegt KEINE Herkunft bzw. nur eine schwache (`bestand-alt`, Rang 2).
//       Jeder Eintrag mit einer echten Herkunft (Rang >= `ki`) ist geschuetzt und
//       wird NIE angefasst — er stammt aus einem Nachweis, nicht aus der Ebene.
//   (2) Die erneute, rein deterministische Nachweissuche findet fuer genau diese
//       Geografie KEINEN Beleg.
//
// Passt ein Altwert in keine der bekannten Fehlerformen, bleibt er stehen und
// wird zur MANUELLEN Pruefung gemeldet. Fail closed: im Zweifel nichts tun.
//
// ---------------------------------------------------------------------------
// WARUM OHNE KI (Kostenentscheidung, Auftrag §"Technisches Zielmodell")
// ---------------------------------------------------------------------------
// Die vier moeglichen Wege waren: (1) gespeicherte Understanding-Ergebnisse
// wiederverwenden, (2) Understanding erneut laufen lassen, (3) selektive
// Neuklassifikation, (4) regelbasierte Bereinigung + bestehende KI-Analyse.
// Gewaehlt ist (4) in seiner kostenfreien Form: die Nachweissuche laeuft ueber
// `classification.sammleGeografieKandidaten` auf den BEREITS GESPEICHERTEN
// Feldern des Wissensobjekts (Ausschuesse, Ministerien, Erwaehnungen, Prosa).
// Das ist derselbe Code, den der Schreibpfad seit Sprint 20 benutzt — es
// entsteht ausdruecklich KEINE zweite, parallele Klassifikationslogik.
//
// Erwartete KI-Aufrufe: 0. Erwartete Kosten: 0,00 USD.
//
// Was das NICHT leisten kann, und zwar ehrlich: die urspruengliche KI-Antwort
// (`ai.affected_geographies`) wurde vom alten Schreibpfad verworfen und ist im
// Bestand nicht mehr vorhanden. Ein Nachweis aus der KI laesst sich fuer den
// Altbestand deshalb nicht rekonstruieren. Objekte, deren Region ausschliesslich
// die KI kennen koennte, bleiben nach diesem Lauf ehrlich OHNE betroffene
// Geografie — statt mit einer falschen. Das ist der Zweck des Sprints.

const {
  normText, deriveDecisionLevel, sammleGeografieKandidaten,
  buildDecisionEntities, buildRelatedEntities, resolveEntity
} = require("./classification");
const {
  entscheideEbene, EBENEN, UNERMITTELT, HERKUNFT_RANG: EBENEN_HERKUNFT_RANG
} = require("./ebenen-gedaechtnis");
const {
  entscheideGeografien, geografieKonfidenz, geoSchluessel, herkunftRang,
  HERKUNFT_RANG, HERKUNFT_BESTAND_ALT
} = require("./geografie-gedaechtnis");

// --- Fehlerklassen ----------------------------------------------------------
// Jede Klasse hat GENAU EINE Einstufung. Die Einstufungen sind die aus dem
// Auftrag (Phase 1, Punkt 5) und bestimmen, was ein Lauf ueberhaupt anfassen darf.
const EINSTUFUNG = {
  SICHER: "sicher-korrigierbar",
  WAHRSCHEINLICH: "wahrscheinlich-korrigierbar",
  KI: "erfordert-ki-neuanalyse",
  MANUELL: "erfordert-manuelle-pruefung",
  UNVERAENDERLICH: "darf-nicht-veraendert-werden"
};

// Nur Klassen mit dieser Einstufung schreibt der Prozess automatisch.
const AUTOMATISCH_ERLAUBT = new Set([EINSTUFUNG.SICHER]);

const KLASSEN = {
  // ---- Geografie: die vier belegten Altfehler ----
  "geo-ebenen-ableitung-bund": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "Deutschland wurde allein aus der politischen Ebene 'bund' erzeugt; kein geografischer Nachweis vorhanden.",
    massnahme: "entfernen"
  },
  "geo-ersatzwert-land": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "Deutschland stand als verbotener Ersatzwert fuer ein unbekanntes Bundesland (Ebene 'land').",
    massnahme: "entfernen"
  },
  "geo-eu-nicht-kanonisch": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "Europaeische Union als freie Textgeografie ohne kanonische ID; im Geografie-Seed existiert kein solcher Datensatz.",
    massnahme: "entfernen"
  },
  "geo-erwaehnung-als-betroffenheit": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "Eine blosse Ortsnennung wurde als Betroffenheit gespeichert.",
    massnahme: "nach mentioned_geographies verschieben"
  },
  "geo-beleg-ergaenzt": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "Ein inhaltlicher Nachweis (subnationale Institution, die ihre Region selbst nennt) belegt eine betroffene Region.",
    massnahme: "betroffene Geografie setzen bzw. Herkunft heraufstufen"
  },
  "geo-unklar-manuell": {
    einstufung: EINSTUFUNG.MANUELL,
    beschreibung: "Altwert passt in keine bekannte Fehlerform und hat zugleich keinen Nachweis.",
    massnahme: "unveraendert lassen, Betreiber pruefen lassen"
  },
  "geo-belegt-geschuetzt": {
    einstufung: EINSTUFUNG.UNVERAENDERLICH,
    beschreibung: "Eintrag traegt eine echte Herkunft (Rang >= ki) und ist damit ein Nachweis, kein Altfehler.",
    massnahme: "unveraendert lassen"
  },

  // ---- Politische Ebene ----
  "ebene-erstermittlung": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "Die Ebene war 'unknown'/leer; die deterministische Ableitung findet jetzt ein Signal.",
    massnahme: "Ebene setzen (fail closed: nie zurueck auf unknown)"
  },
  "ebene-schreibweise": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "Ebene in Grossschreibung/Alt-Schreibweise gespeichert ('Bund' statt 'bund').",
    massnahme: "kanonische Kleinschreibung herstellen"
  },
  "ebene-spiegel": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "Die Alt-Spalte political_level weicht von decision_level ab oder ist leer.",
    massnahme: "political_level auf decision_level spiegeln"
  },
  "ebene-unbestimmt-ki": {
    einstufung: EINSTUFUNG.KI,
    beschreibung: "Die Ebene ist unbestimmt und die deterministische Ableitung findet kein Signal; nur eine KI-Analyse koennte sie klaeren.",
    massnahme: "nicht in diesem Prozess"
  },

  // ---- Entitaeten ----
  "entitaet-kanonisiert": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "Ein gespeicherter Entitaetseintrag ohne kanonische ID laesst sich heute gegen den Entitaetenkatalog aufloesen.",
    massnahme: "entity_id ergaenzen (Name unveraendert, kein Eintrag entfaellt)"
  },

  // ---- Fachgebiete ----
  "fachgebiet-fehlt-ki": {
    einstufung: EINSTUFUNG.KI,
    beschreibung: "Weder tags noch policy_field gefuellt. Zustaendig ist der BESTEHENDE Anreicherungspfad (ko-enrichment), nicht dieser Prozess.",
    massnahme: "nicht in diesem Prozess"
  },

  // ---- Konfidenz ----
  "konfidenz-geografie-ehrlich": {
    einstufung: EINSTUFUNG.SICHER,
    beschreibung: "classification_confidence.geography mass bisher die Zahl der ERWAEHNUNGEN statt der Belegstaerke der Betroffenheit.",
    massnahme: "ehrliche Kennzahl schreiben"
  }
};

function einstufungVon(klasse) {
  const k = KLASSEN[klasse];
  return k ? k.einstufung : EINSTUFUNG.MANUELL;
}

function istAutomatischSicher(klasse) {
  return AUTOMATISCH_ERLAUBT.has(einstufungVon(klasse));
}

// --- Lesen des Bestands (roh, mit Herkunftsinformation) ---------------------

function leseListeRoh(roh) {
  if (Array.isArray(roh)) return roh;
  if (typeof roh === "string" && roh.trim()) {
    try {
      const parsed = JSON.parse(roh);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* kaputtes jsonb ist kein Grund, eine Geografie zu verlieren */ }
  }
  return [];
}

function leseKonfidenz(ko) {
  const roh = ko && ko.classification_confidence;
  if (roh && typeof roh === "object" && !Array.isArray(roh)) return roh;
  if (typeof roh === "string" && roh.trim()) {
    try {
      const p = JSON.parse(roh);
      if (p && typeof p === "object" && !Array.isArray(p)) return p;
    } catch (_) { /* still */ }
  }
  return {};
}

// Ein gespeicherter Geografie-Eintrag mit der Information, OB er eine echte
// Herkunft traegt. Genau daran haengt der Schutz: ein Eintrag ohne Herkunft
// stammt aus der Zeit vor Sprint 20 und ist damit ein Kandidat; ein Eintrag mit
// Herkunft ist ein Nachweis.
function leseAltEintrag(roh) {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const name = String(roh.name == null ? "" : roh.name).trim().slice(0, 120);
  const id = roh.geography_id == null ? null : String(roh.geography_id).trim().slice(0, 80) || null;
  if (!name && !id) return null;
  const herkunftRoh = String(roh.herkunft == null ? "" : roh.herkunft).trim().toLowerCase();
  const hatHerkunft = Boolean(HERKUNFT_RANG[herkunftRoh]);
  return {
    name: name || id,
    level: String(roh.level == null ? "" : roh.level).trim().toLowerCase().slice(0, 20) || "unknown",
    geography_id: id,
    herkunft: hatHerkunft ? herkunftRoh : HERKUNFT_BESTAND_ALT,
    hatHerkunft
  };
}

// --- Erkennung der vier Altfehler -------------------------------------------

function istDeutschland(e) {
  return e.geography_id === "geo-bund" || normText(e.name) === "deutschland";
}

// "Europaeische Union" OHNE kanonische ID. Der Geografie-Seed kennt bewusst
// keinen EU-Datensatz (er bildet Deutschland/Bundesland/Bezirk/Kommune ab) —
// ein solcher Eintrag KANN also nie kanonisch sein und ist immer frei erzeugt.
function istFreieEu(e) {
  if (e.geography_id) return false;
  const n = normText(e.name);
  return n === "europaeische union" || n === "eu" || n === "europaische union";
}

// Alle Orte, die im Wissensobjekt nachweislich nur ERWAEHNT sind.
function erwaehnteSchluessel(ko) {
  const schluessel = new Set();
  for (const roh of leseListeRoh(ko && ko.mentioned_geographies)) {
    const e = leseAltEintrag(roh);
    if (e) schluessel.add(geoSchluessel(e));
  }
  for (const name of Array.isArray(ko && ko.mentioned_locations) ? ko.mentioned_locations : []) {
    const n = normText(name);
    if (n) schluessel.add(`name:${n}`);
  }
  return schluessel;
}

// --- Nachweissuche ----------------------------------------------------------
// Dieselbe Funktion, die auch der Schreibpfad benutzt. KEINE zweite Logik.
// Ohne KI-Eingang (`ai = {}`) und ohne Parser-/Quellenkontext bleiben genau die
// inhaltlichen Nachweise uebrig — das ist alles, was aus einem gespeicherten
// Datensatz ehrlich rekonstruierbar ist.
function sucheKandidaten(ko) {
  return sammleGeografieKandidaten(ko, {}, {}).filter(Boolean);
}

function sucheNachweise(ko) {
  return sucheKandidaten(ko).filter((k) => k.rolle === "betroffen");
}

// --- Kernentscheidung: der Plan fuer EIN Wissensobjekt ----------------------
//
//   ko:    das gespeicherte knowledge_object (vollstaendige Zeile)
//   jetzt: ISO-Zeitstempel fuer eine Erstermittlung (Testbarkeit)
//
// Rueckgabe:
//   { id, vorgang_id, unveraendert, patch, aenderungen[], klassen[],
//     kiNoetig, manuellePruefung, sicherAutomatisch }
//
// `patch` enthaelt ausschliesslich die Felder, die sich tatsaechlich aendern —
// bleibt der Datensatz gleich, ist `patch` null und der Lauf schreibt nichts.
// `erlaubteKlassen`: optionale Positivliste von Fehlerklassen. Sie ist der
// technische Unterbau der Abnahmebedingung "nur die vorher freigegebenen
// Objektklassen wurden veraendert" — der Betreiber kann eine Freigabe auf
// einzelne Klassen begrenzen, und der Lauf kann dann gar nichts anderes
// schreiben. Ohne Angabe gelten alle als sicher eingestuften Klassen.
function planeNachklassifikation(ko = {}, { jetzt = null, erlaubteKlassen = null } = {}) {
  const zeitpunkt = jetzt || new Date().toISOString();
  const erlaubt = erlaubteKlassen && erlaubteKlassen.length ? new Set(erlaubteKlassen) : null;
  const konfidenz = leseKonfidenz(ko);
  const aenderungen = [];

  // ===== 1. Geografie =======================================================
  const altBetroffen = leseListeRoh(ko.affected_geographies).map(leseAltEintrag).filter(Boolean);
  // Genau die Kandidatensuche des Schreibpfads — inklusive der bereits gegen den
  // kanonischen Seed AUFGELOESTEN Erwaehnungen. Sie hier selbst nachzubauen haette
  // unaufgeloeste Namensdubletten erzeugt ("Berlin" einmal mit, einmal ohne ID).
  const alleKandidaten = sucheKandidaten(ko);
  const nachweise = alleKandidaten.filter((k) => k.rolle === "betroffen");
  const nachweisSchluessel = new Set(nachweise.map(geoSchluessel));
  const erwaehnt = erwaehnteSchluessel(ko);
  const gespeicherteEbene = String(ko.decision_level == null ? "" : ko.decision_level).trim().toLowerCase();

  const behalten = [];
  const verschoben = [];

  for (const e of altBetroffen) {
    const alt = { name: e.name, level: e.level, geography_id: e.geography_id };

    // (1) Echte Herkunft -> Nachweis, kein Altfehler. Unantastbar.
    if (e.hatHerkunft && herkunftRang(e.herkunft) >= HERKUNFT_RANG.ki) {
      behalten.push(e);
      aenderungen.push(bau("affected_geographies", alt, alt, "geo-belegt-geschuetzt", e.herkunft, e.herkunft, false));
      continue;
    }

    // (2) Es gibt einen echten Nachweis fuer genau diese Geografie -> behalten.
    //     Die Heraufstufung der Herkunft erledigt danach das Sprint-20-Gedaechtnis.
    if (nachweisSchluessel.has(geoSchluessel(e))) {
      behalten.push(e);
      continue;
    }

    // (3) Die vier bekannten Altfehler — und nur sie.
    if (istDeutschland(e) && gespeicherteEbene === "bund") {
      aenderungen.push(bau("affected_geographies", alt, null, "geo-ebenen-ableitung-bund", e.herkunft, null, true));
      continue;
    }
    if (istDeutschland(e) && gespeicherteEbene === "land") {
      aenderungen.push(bau("affected_geographies", alt, null, "geo-ersatzwert-land", e.herkunft, null, true));
      continue;
    }
    if (istFreieEu(e)) {
      aenderungen.push(bau("affected_geographies", alt, null, "geo-eu-nicht-kanonisch", e.herkunft, null, true));
      continue;
    }
    if (e.level === "land" && erwaehnt.has(geoSchluessel(e))) {
      verschoben.push({ name: e.name, level: e.level, geography_id: e.geography_id, herkunft: "erwaehnung" });
      aenderungen.push(bau("affected_geographies", alt, null, "geo-erwaehnung-als-betroffenheit", e.herkunft, "erwaehnung", true));
      continue;
    }

    // (4) Kein bekanntes Muster, kein Nachweis -> stehen lassen, melden.
    behalten.push(e);
    aenderungen.push(bau("affected_geographies", alt, alt, "geo-unklar-manuell", e.herkunft, e.herkunft, false));
  }

  // Der BEREINIGTE Bestand geht in das unveraenderte Sprint-20-Gedaechtnis.
  // Damit gelten dort weiterhin alle Schutzregeln (fail closed gegen leer,
  // Vereinigung bei Gleichstand, Korrektur nur durch hoehere Herkunft).
  const bereinigterBestand = {
    affected_geographies: behalten.map((e) => ({
      name: e.name, level: e.level, geography_id: e.geography_id, herkunft: e.herkunft
    })),
    mentioned_geographies: leseListeRoh(ko.mentioned_geographies),
    classification_confidence: konfidenz
  };

  const geo = entscheideGeografien({
    bestand: bereinigterBestand,
    kandidaten: [...alleKandidaten, ...verschoben.map((v) => ({ ...v, rolle: "erwaehnt" }))],
    jetzt: konfidenz.geography_ermittelt_am || zeitpunkt
  });

  // Vorher/Nachher je Region sichtbar machen: neu belegte Regionen UND
  // Altwerte, deren Herkunft durch einen gefundenen Nachweis steigt. Der zweite
  // Fall ist wichtig, weil eine echte Betroffenheit dadurch dauerhaft geschuetzt
  // wird — ohne die eingetragene Herkunft bliebe sie ein `bestand-alt`-Wert.
  const altNachSchluessel = new Map(altBetroffen.map((e) => [geoSchluessel(e), e]));
  for (const n of geo.betroffen) {
    const vorher = altNachSchluessel.get(geoSchluessel(n));
    const neuerWert = { name: n.name, level: n.level, geography_id: n.geography_id };
    if (!vorher) {
      aenderungen.push(bau("affected_geographies", null, neuerWert, "geo-beleg-ergaenzt", null, n.herkunft, true));
      continue;
    }
    if (herkunftRang(n.herkunft) > herkunftRang(vorher.herkunft)) {
      aenderungen.push(bau("affected_geographies",
        { name: vorher.name, level: vorher.level, geography_id: vorher.geography_id },
        neuerWert, "geo-beleg-ergaenzt", vorher.herkunft, n.herkunft, true));
    }
  }

  // ===== 2. Politische Ebene ================================================
  // `bestand: ko` heisst: die Sprint-19-Regeln gelten unveraendert. Ein
  // belastbarer Wert kann durch diesen Lauf strukturell nicht auf 'unknown'
  // fallen — der Deriver ist die schwaechste Herkunft und darf nichts ersetzen.
  const abgeleitet = deriveDecisionLevel(ko);
  const ebene = entscheideEbene({
    bestand: ko,
    neu: { level: abgeleitet.level, quelle: "deriver", konfidenz: abgeleitet.confidence },
    jetzt: konfidenz.level_ermittelt_am || zeitpunkt
  });

  const alteEbeneRoh = String(ko.decision_level == null ? "" : ko.decision_level);
  const neueEbene = ebene.ebene;

  if (!EBENEN.includes(alteEbeneRoh) && EBENEN.includes(neueEbene)) {
    // Zwei getrennte Faelle mit derselben Wirkung, aber unterschiedlichem Grund:
    // eine echte Erstermittlung ('unknown' -> 'bund') und eine reine
    // Schreibweisenkorrektur ('Bund' -> 'bund').
    const klasse = normText(alteEbeneRoh) === normText(neueEbene) ? "ebene-schreibweise" : "ebene-erstermittlung";
    aenderungen.push(bau("decision_level", alteEbeneRoh || null, neueEbene, klasse,
      konfidenz.level_quelle || null, ebene.quelle, true));
  }
  if (neueEbene === UNERMITTELT) {
    aenderungen.push(bau("decision_level", alteEbeneRoh || null, alteEbeneRoh || null,
      "ebene-unbestimmt-ki", konfidenz.level_quelle || null, konfidenz.level_quelle || null, false));
  }

  const altPolitical = String(ko.political_level == null ? "" : ko.political_level).trim().toLowerCase();
  const spiegelNoetig = EBENEN.includes(neueEbene) && altPolitical !== neueEbene;
  if (spiegelNoetig) {
    aenderungen.push(bau("political_level", ko.political_level || null, neueEbene, "ebene-spiegel", null, null, true));
  }

  // ===== 3. Entitaeten ======================================================
  // NUR ergaenzend: eine fehlende kanonische ID wird nachgetragen, ein bisher
  // unbekannter kanonischer Eintrag ergaenzt. Es wird NIE ein gespeicherter
  // Eintrag entfernt und NIE ein Name ueberschrieben — damit kann dieser Schritt
  // keinen belastbaren Wert zerstoeren.
  const entitaeten = [
    planeEntitaeten("decision_entities", leseListeRoh(ko.decision_entities), buildDecisionEntities(ko)),
    planeEntitaeten("related_entities", leseListeRoh(ko.related_entities), buildRelatedEntities(ko))
  ];
  for (const e of entitaeten) aenderungen.push(...e.aenderungen);

  // ===== 4. Fachgebiete =====================================================
  // BEWUSST NICHT VERAENDERT. `tags` entstehen ueber einen KI-Aufruf,
  // `policy_field` ueber den bestehenden Anreicherungspfad `ko-enrichment.js`.
  // Eine eigene Logik hier waere die im Auftrag ausdruecklich verbotene zweite,
  // parallele Klassifikation. Der Befund wird nur GEMELDET.
  const ohneFachgebiet = !(Array.isArray(ko.tags) && ko.tags.length)
    && !(Array.isArray(ko.policy_field) && ko.policy_field.length);
  if (ohneFachgebiet) {
    aenderungen.push(bau("tags/policy_field", [], [], "fachgebiet-fehlt-ki", null, null, false));
  }

  // ===== 5. Ehrliche Geografie-Konfidenz ====================================
  const neueKonfidenz = geografieKonfidenz(geo);
  if (String(konfidenz.geography || "") !== neueKonfidenz) {
    aenderungen.push(bau("classification_confidence.geography",
      konfidenz.geography == null ? null : String(konfidenz.geography), neueKonfidenz,
      "konfidenz-geografie-ehrlich", null, null, true));
  }

  // ===== Patch bauen ========================================================
  // Nur wirklich geaenderte Felder. Ein Objekt ohne Aenderung erzeugt keinen
  // Schreibvorgang — das ist die Grundlage der Idempotenz und verhindert, dass
  // ein zweiter Lauf `updated_at` ohne Sachgrund fortschreibt.
  const schreibbar = aenderungen.filter((a) => a.aenderungSchreibt
    && istAutomatischSicher(a.klasse)
    && (!erlaubt || erlaubt.has(a.klasse)));
  const patch = {};

  // `mentioned_geographies` wird AUSSCHLIESSLICH zusammen mit einer
  // Geografie-Korrektur geschrieben. Sonst entstuende ein Schreibvorgang ohne
  // protokollierten Grund — und der Auftrag verlangt, dass jede Aenderung
  // nachvollziehbar ist. Ohne Geografie-Korrektur bleibt das Feld unberuehrt.
  if (schreibbar.some((a) => a.feld === "affected_geographies")) {
    patch.affected_geographies = geo.betroffen;
    patch.mentioned_geographies = geo.erwaehnt;
  }
  // Die EHRLICHE Geografie-Konfidenz ist ein eigener Schreibgrund, nicht nur ein
  // Anhaengsel. Die Alt-Kennzahl mass die Zahl der ERWAEHNUNGEN und nannte das
  // Geografie-Konfidenz: ein Vorgang ohne jede belegte Region behauptet dort
  // "medium". Das ist genau das falsche Gruen, das CLAUDE.md §4.4 verbietet —
  // und es bliebe stehen, wenn an dem Objekt sonst nichts zu aendern ist.
  if (schreibbar.some((a) => a.feld === "classification_confidence.geography")) {
    patch.classification_confidence = konfidenz; // wird unten vollstaendig ersetzt
  }
  if (schreibbar.some((a) => a.feld === "decision_level")) patch.decision_level = neueEbene;
  if (schreibbar.some((a) => a.feld === "political_level")) patch.political_level = neueEbene;
  for (const e of entitaeten) {
    if (e.geaendert && schreibbar.some((a) => a.feld === e.feld)) patch[e.feld] = e.neu;
  }

  if (Object.keys(patch).length) {
    // Der Konfidenzblock wird nur mitgeschrieben, wenn ohnehin geschrieben wird.
    // Er ist additiv und ueberschreibt keine fremden Schluessel.
    patch.classification_confidence = {
      ...konfidenz,
      level: ebene.konfidenz,
      geography: neueKonfidenz,
      level_quelle: ebene.quelle,
      level_ermittelt_am: ebene.ermittelt_am,
      level_wiederverwendet: ebene.wiederverwendet,
      geography_quelle: geo.quelle,
      geography_ermittelt_am: geo.ermittelt_am,
      geography_wiederverwendet: geo.wiederverwendet,
      geography_indizien: geo.indizien,
      // Nachvollziehbarkeit: welcher Lauf hat diesen Datensatz angefasst und warum.
      nachklassifikation_am: zeitpunkt,
      nachklassifikation_klassen: [...new Set(schreibbar.map((a) => a.klasse))].sort()
    };
  }

  const klassen = [...new Set(aenderungen.map((a) => a.klasse))].sort();
  return {
    id: ko.id || null,
    vorgang_id: ko.vorgang_id || null,
    // Vorher/Nachher der beiden Kernachsen — auch dann, wenn nichts geschrieben
    // wird. Genau daran ist im Protokoll ablesbar, dass ein belastbarer Wert
    // WIEDERVERWENDET und nicht neu berechnet wurde.
    ebene: {
      vorher: alteEbeneRoh || null,
      nachher: neueEbene,
      quelle: ebene.quelle,
      wiederverwendet: ebene.wiederverwendet,
      grund: ebene.grund
    },
    geografie: {
      vorher: altBetroffen.map((e) => e.geography_id || e.name),
      nachher: geo.betroffen.map((e) => e.geography_id || e.name),
      quelle: geo.quelle,
      wiederverwendet: geo.wiederverwendet,
      grund: geo.grund
    },
    unveraendert: Object.keys(patch).length === 0,
    patch: Object.keys(patch).length ? patch : null,
    aenderungen,
    klassen,
    kiNoetig: aenderungen.some((a) => a.kiNoetig),
    manuellePruefung: aenderungen.some((a) => a.manuellePruefungEmpfohlen),
    sicherAutomatisch: schreibbar.length > 0
  };
}

// Eine einzelne Aenderungszeile des Vorschauprotokolls. Die Feldnamen sind
// bewusst genau die zwoelf im Auftrag geforderten Angaben.
// WICHTIG: Ebene und Geografie haben ZWEI VERSCHIEDENE Herkunftsskalen.
//   Ebene     (Sprint 19): deriver 1 < ki 2
//   Geografie (Sprint 20): quelle 1 < erwaehnung/bestand-alt 2 < ki 3 < inhalt 4 < amtlich 5 < parser 6
// Wuerde man beide ueber dieselbe Tabelle rechnen, erschiene der Ebenen-Deriver
// als Rang 2 (der Fallback der Geografie-Skala) — eine falsche Zahl im Protokoll.
function vertrauensrang(feld, herkunft) {
  if (!herkunft) return null;
  if (String(feld).startsWith("decision_level") || String(feld).startsWith("political_level")) {
    return EBENEN_HERKUNFT_RANG[String(herkunft).trim().toLowerCase()] || null;
  }
  return herkunftRang(herkunft);
}

function bau(feld, alt, neu, klasse, herkunftVorher, herkunftNachher, schreibt) {
  const einstufung = einstufungVon(klasse);
  return {
    feld,
    alterWert: alt,
    neuerWert: neu,
    klasse,
    grund: (KLASSEN[klasse] || {}).beschreibung || klasse,
    massnahme: (KLASSEN[klasse] || {}).massnahme || "unveraendert lassen",
    einstufung,
    herkunftVorher: herkunftVorher || null,
    herkunftNachher: herkunftNachher || null,
    vertrauenVorher: vertrauensrang(feld, herkunftVorher),
    vertrauenNachher: vertrauensrang(feld, herkunftNachher),
    vertrauensskala: String(feld).startsWith("decision_level") || String(feld).startsWith("political_level")
      ? "ebene" : "geografie",
    kiNoetig: einstufung === EINSTUFUNG.KI,
    automatischSicher: einstufung === EINSTUFUNG.SICHER,
    manuellePruefungEmpfohlen: einstufung === EINSTUFUNG.MANUELL,
    // Interner Schalter: nur wenn beides gilt (sicher UND wirkliche Aenderung)
    // entsteht ein Schreibvorgang.
    aenderungSchreibt: Boolean(schreibt)
  };
}

// Entitaeten: rein additiv. Zwei erlaubte Bewegungen, sonst nichts.
//   (a) ein gespeicherter Eintrag OHNE kanonische ID bekommt seine ID nachgetragen
//   (b) eine kanonische Entitaet, die der Deriver heute findet, wird ergaenzt
// Es wird NIE ein Eintrag entfernt und NIE ein Name ueberschrieben.
function planeEntitaeten(feld, altRoh, neuBerechnet) {
  const alt = (Array.isArray(altRoh) ? altRoh : []).filter((e) => e && typeof e === "object");
  const nachId = new Map();
  for (const e of Array.isArray(neuBerechnet) ? neuBerechnet : []) {
    if (e && e.entity_id) nachId.set(normText(e.name), e);
  }

  const aenderungen = [];
  const ergebnis = [];
  const gesehen = new Set();
  let geaendert = false;

  for (const e of alt) {
    const name = String(e.name == null ? "" : e.name);
    const schluessel = e.entity_id || `${e.type || "unknown"}:${normText(name)}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);

    // Direkt gegen den kanonischen Katalog aufloesen. Die Neuberechnung allein
    // genuegt nicht: ein gespeicherter Entitaetsname kann aus einem Feld
    // stammen, das der Deriver heute gar nicht mehr liest. `resolveEntity`
    // liefert bei Misserfolg entity_id null — dann bleibt der Altwert stehen.
    const treffer = e.entity_id ? null : kanonischerTreffer(name, e.type, nachId);
    if (treffer) {
      gesehen.add(treffer.entity_id);
      ergebnis.push({ ...e, entity_id: treffer.entity_id, type: e.type || treffer.type });
      aenderungen.push(bau(feld,
        { name, type: e.type || treffer.type, entity_id: null },
        { name, type: e.type || treffer.type, entity_id: treffer.entity_id },
        "entitaet-kanonisiert", null, null, true));
      geaendert = true;
      continue;
    }
    ergebnis.push(e);
  }

  // Kanonische Entitaeten, die der Deriver heute findet, die aber im Bestand
  // fehlen. Nur mit kanonischer ID — freie Textvarianten werden NICHT ergaenzt.
  for (const e of Array.isArray(neuBerechnet) ? neuBerechnet : []) {
    if (!e || !e.entity_id || gesehen.has(e.entity_id)) continue;
    gesehen.add(e.entity_id);
    ergebnis.push(e);
    aenderungen.push(bau(feld, null, { name: e.name, type: e.type, entity_id: e.entity_id },
      "entitaet-kanonisiert", null, null, true));
    geaendert = true;
  }

  return { feld, neu: ergebnis, geaendert, aenderungen };
}

function kanonischerTreffer(name, typ, nachId) {
  const direkt = resolveEntity(name, typ);
  if (direkt && direkt.entity_id) return direkt;
  const ausNeuberechnung = nachId.get(normText(name));
  return ausNeuberechnung && ausNeuberechnung.entity_id ? ausNeuberechnung : null;
}

// --- Zusammenfassung ueber viele Plaene -------------------------------------
function fasseZusammen(plaene = []) {
  const liste = Array.isArray(plaene) ? plaene : [];
  const jeKlasse = {};
  const jeEinstufung = {};
  let unveraendert = 0;
  let geografienEntfernt = 0;
  let geografienErgaenzt = 0;
  let geografienBelegGestaerkt = 0;
  let ebenenKorrigiert = 0;
  let entitaetenVeraendert = 0;
  let kiNoetig = 0;
  let manuell = 0;
  let schreibvorgaenge = 0;

  for (const p of liste) {
    if (!p) continue;
    if (p.unveraendert) unveraendert += 1; else schreibvorgaenge += 1;
    if (p.kiNoetig) kiNoetig += 1;
    if (p.manuellePruefung) manuell += 1;
    for (const a of p.aenderungen || []) {
      jeKlasse[a.klasse] = (jeKlasse[a.klasse] || 0) + 1;
      jeEinstufung[a.einstufung] = (jeEinstufung[a.einstufung] || 0) + 1;
      if (!a.aenderungSchreibt) continue;
      if (a.feld === "affected_geographies" && a.neuerWert === null) geografienEntfernt += 1;
      else if (a.feld === "affected_geographies" && a.alterWert === null) geografienErgaenzt += 1;
      else if (a.feld === "affected_geographies") geografienBelegGestaerkt += 1;
      if (a.feld === "decision_level" || a.feld === "political_level") ebenenKorrigiert += 1;
      if (a.feld === "decision_entities" || a.feld === "related_entities") entitaetenVeraendert += 1;
    }
  }

  return {
    objekte: liste.length,
    unveraendert,
    schreibvorgaenge,
    geografienEntfernt,
    geografienErgaenzt,
    geografienBelegGestaerkt,
    ebenenKorrigiert,
    entitaetenVeraendert,
    kiNoetig,
    manuell,
    // Diese Zahl ist die Kostenaussage des ganzen Sprints.
    erwarteteKiAufrufe: 0,
    erwarteteKostenUsd: 0,
    jeKlasse,
    jeEinstufung
  };
}

// --- DSGVO: Maskierung des Protokolls ---------------------------------------
// Ein Vorschauprotokoll verlaesst die Sitzung (Datei, PR, Doku). Es darf deshalb
// KEINE personenbezogenen Daten enthalten. Drei Massnahmen, alle rein:
//
//   1. Das Protokoll enthaelt von vornherein KEINE Prosafelder. Ueberschrift,
//      "was ist passiert", Zusammenfassung und Dokumenttitel werden nie
//      uebernommen — sie sind der eigentliche Traeger personenbezogener Inhalte.
//   2. Entitaetsnamen vom Typ `person` werden durch `[person]` ersetzt — und
//      zwar DATENGETRIEBEN am mitgefuehrten `type`, nicht nur ueber den
//      Katalog. Das ist wichtig, weil der kanonische Entitaetenkatalog
//      bewusst KEINE Person enthaelt (Mandantenneutralitaet, CLAUDE.md §4.2):
//      ein Personenname im Bestand steht dort als unaufgeloester Eintrag mit
//      `type: "person"` und `entity_id: null`. Eine reine Katalogpruefung
//      wuerde ihn deshalb NIE erfassen. Der Katalogabgleich bleibt als zweite,
//      vorsorgliche Schicht bestehen.
//   3. Jede verbleibende Zeichenkette laeuft durch `redactSensitive` — dieselbe
//      zentrale Redaction wie Alarme und Fehlerpfade (E-Mail, Telefon, Tokens).
const { POLITICAL_ENTITIES } = require("./seeds/entities");
const { redactSensitive } = require("../redact");

const PERSONEN_NAMEN = (() => {
  const s = new Set();
  for (const ent of POLITICAL_ENTITIES) {
    if (ent.entity_type !== "person") continue;
    s.add(normText(ent.name));
    for (const al of ent.aliases || []) s.add(normText(al));
  }
  return s;
})();

function maskiereWert(wert, env) {
  if (wert == null) return wert;
  if (typeof wert === "string") return redactSensitive(wert, env);
  if (Array.isArray(wert)) return wert.map((w) => maskiereWert(w, env));
  if (typeof wert !== "object") return wert;
  const istPersonensatz = String(wert.type || "").trim().toLowerCase() === "person";
  const out = {};
  for (const [k, v] of Object.entries(wert)) {
    if (k === "name" && typeof v === "string" && (istPersonensatz || PERSONEN_NAMEN.has(normText(v)))) {
      out[k] = "[person]";
      continue;
    }
    out[k] = maskiereWert(v, env);
  }
  return out;
}

// Maskiert einen Plan fuer die Ausgabe. Der Plan selbst bleibt unveraendert —
// das Werkzeug arbeitet weiter mit den echten Werten, nur das PROTOKOLL ist
// maskiert.
function maskiereProtokoll(plan, env = process.env) {
  if (!plan || typeof plan !== "object") return plan;
  return {
    id: plan.id,
    vorgang_id: redactSensitive(plan.vorgang_id || "", env) || null,
    unveraendert: plan.unveraendert,
    ebene: plan.ebene,
    geografie: maskiereWert(plan.geografie, env),
    kiNoetig: plan.kiNoetig,
    manuellePruefung: plan.manuellePruefung,
    sicherAutomatisch: plan.sicherAutomatisch,
    klassen: plan.klassen,
    aenderungen: (plan.aenderungen || []).map((a) => maskiereWert(a, env))
  };
}

module.exports = {
  EINSTUFUNG, KLASSEN, AUTOMATISCH_ERLAUBT,
  einstufungVon, istAutomatischSicher,
  istDeutschland, istFreieEu, leseAltEintrag, sucheNachweise,
  planeEntitaeten, planeNachklassifikation, fasseZusammen,
  PERSONEN_NAMEN, maskiereWert, maskiereProtokoll
};
