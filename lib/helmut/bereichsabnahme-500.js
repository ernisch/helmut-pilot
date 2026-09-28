"use strict";

// Kleinster, rein lokaler Aggregator fuer die vollstaendige 500er Bereichsabnahme.
// Er fuehrt ausschliesslich bereits vorhandene, gebundene Einzelurteile zu einem
// fail-closed Gesamtergebnis zusammen: kein Modellaufruf, kein Netz, keine DB,
// keine neue Fachbewertung. Rohe Modellantworten oder rohe Paarobjekte werden nie
// als positives Einzelurteil verwendet.
//
// Die drei Bereichspaare und die Eingabe-/Urteilsstruktur stammen unveraendert aus
// dem bestehenden Vertrag (briefing-bereichspruefung). Dieses Modul veraendert den
// Einzelpruefer nicht und fuehrt selbst keine fachliche Bedeutungspruefung durch.
const { hash } = require("./briefing-speicher");
const {
  BEREICHE,
  PAARE,
  VERSION: PRUEFVERSION,
} = require("./briefing-bereichspruefung");

const VERSION = 1;
// Die Bereichsabnahme verlangt exakt 500 erwartete, eindeutige Profil-IDs.
const ZIEL = 500;
const POSITIV = "getrennt";
const LEER = "leer";
const NEGATIV = Object.freeze(["wiederholung", "unklar"]);
// Die im bestehenden Vertrag zulaessigen Paarurteile. Jeder andere Wert ist
// ungueltig und sperrt das Gesamtergebnis (fail-closed).
const URTEILE = Object.freeze([POSITIV, ...NEGATIV, LEER]);
// Eigene 1500er Paarbilanz: Die drei Bereichspaare bilden ueber alle 500
// erwarteten Profile eine separate Gesamtheit von ZIEL * PAARE.length = 1500
// erwarteten Paarplaetzen (profilId, paar). Jeder erwartete Paarplatz faellt in
// GENAU eine disjunkte, fail-closed Kategorie; nicht erwartete Paarschluessel
// sind "unerwartet" ausserhalb dieser 1500. Kategorien:
//   positiv    - genau ein auswertbares Urteil "getrennt" fuer den Paarplatz
//   negativ    - genau ein auswertbares Urteil "wiederholung"/"unklar"
//   leer       - genau ein auswertbares Urteil "leer"
//   fehlend    - erwarteter Paarplatz ohne gelieferten Vergleich
//   dupliziert - doppelter Schluessel (Profil ODER Paar); ALLE betroffenen
//                erwarteten Paarplaetze eines doppelten Schluessels werden
//                ausgeschlossen und nie positiv gewertet
//   ungueltig  - erwarteter Paarplatz eines Profils ohne auswertbare Eingabe
//                oder ohne auswertbares Einzelurteil (alle drei Plaetze)
//   hashgedriftet - erwarteter Paarplatz eines Profils, dessen Eingabe- oder
//                Rendererhash vom erwarteten Stand abweicht (alle drei Plaetze);
//                die gelieferten Paarurteile gehoeren zu einem anderen erwarteten
//                Stand und sind aus der fachlichen Wertung ausgeschlossen
// erhalten = eindeutige, auswertbare ERWARTETE Paarschluessel
//          = positiv + negativ + leer (nur auswertbar gebunden und erwartungskonform).
const PAAR_KATEGORIEN = Object.freeze(["positiv", "negativ", "leer", "fehlend",
  "dupliziert", "ungueltig", "hashgedriftet"]);
// Exakter Nicht-bestanden-Grund des bestehenden Einzelpruefervertrags aus
// briefing-bereichspruefung.pruefe() (offen("bereichstrennung-nicht-bestaetigt")).
// Hier nur gespiegelt; der Einzelpruefer selbst bleibt unveraendert.
const NICHT_BESTANDEN_GRUND = "bereichstrennung-nicht-bestaetigt";
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const METHODE = "separates-semantisches-urteil-drei-gerenderte-ansichten";
const EINGABE_FELDER = Object.freeze(["version", "mandat", "tag", "rendererCommit",
  "rendererHash", "profilHash", "datenHash", "fachinhalt", "ansichten"]);
const PRUEFEINGABE_FELDER = Object.freeze([...EINGABE_FELDER, "eingabeHash"]);
// Genau die Felder, die briefing-bereichspruefung.pruefe() im positiven
// Vertrag ausgibt. Zusaetzliche historische Metadaten am Einzelurteil sind
// zulaessig, duerfen aber nichts an der positiven Bewertung aendern.
const URTEIL_FELDER = Object.freeze(["bereit", "grund", "bereichstrennungBestanden",
  "vollstaendigeFaktenpruefung", "funktionsnachweis500", "eingabeHash", "urteilHash",
  "vergleiche", "methode", "bedeutungUnabhaengigBewiesen"]);
const VERGLEICH_FELDER = Object.freeze(["paar", "urteil"]);

const istObjekt = v => v !== null && typeof v === "object" && !Array.isArray(v);
const istText = v => typeof v === "string" && v.trim().length > 0;
const hatFelder = (v, felder) => istObjekt(v) && felder.every(k => Object.hasOwn(v, k));
const nurFelder = (v, felder) => hatFelder(v, felder) && Object.keys(v).length === felder.length;
const sortiert = liste => [...liste].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const sortiertObjekte = liste => [...liste].sort((a, b) => {
  const links = JSON.stringify(a), rechts = JSON.stringify(b);
  return links < rechts ? -1 : links > rechts ? 1 : 0;
});
const eindeutig = liste => [...new Set(liste)];
const tagGueltig = tag => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag || "")) return false;
  const datum = new Date(tag + "T12:00:00Z");
  return Number.isFinite(datum.getTime())
    && datum.toISOString().slice(0, 10) === tag;
};

// Erwartungsvertrag: exakt ZIEL eindeutige Profil-IDs, jede mit gebundenem
// Eingabe- und Rendererhash. Fehlt oder driftet spaeter ein Hash, sperrt das.
function pruefeVertrag(erwartet) {
  if (!Array.isArray(erwartet)) return { fehler: "erwartung-fehlt" };
  if (erwartet.length !== ZIEL) return { fehler: "zielgroesse-ungleich-" + ZIEL };
  const eintraege = [];
  const ids = new Set();
  for (const e of erwartet) {
    const profilId = e?.profilId ?? e?.mandat;
    if (!istText(profilId)) return { fehler: "erwartete-id-ungueltig" };
    if (ids.has(profilId)) return { fehler: "erwartete-id-doppelt" };
    if (!HEX64.test(e?.eingabeHash || "") || !HEX64.test(e?.rendererHash || ""))
      return { fehler: "erwarteter-hash-fehlt" };
    ids.add(profilId);
    eintraege.push({ profilId, eingabeHash: e.eingabeHash, rendererHash: e.rendererHash });
  }
  return { eintraege };
}

// Eine gespeicherte Einzelpruefeingabe ist nur vertrauenswuerdig, wenn sie die
// exakte Struktur aus briefing-bereichspruefung.binde() traegt und ihr eigener
// Eingabehash unveraendert nachrechenbar ist. Das ist Bindung, keine neue
// fachliche Bewertung.
function istPruefeingabe(eingabe, profilId) {
  if (!nurFelder(eingabe, PRUEFEINGABE_FELDER)) return false;
  const { eingabeHash, ...input } = eingabe;
  if (!HEX64.test(eingabeHash || "") || hash(input) !== eingabeHash) return false;
  if (input.version !== PRUEFVERSION || !istText(input.mandat)
    || input.mandat !== profilId) return false;
  if (!tagGueltig(input.tag) || !HEX40.test(input.rendererCommit || "")) return false;
  if (![input.rendererHash, input.profilHash, input.datenHash]
    .every(h => HEX64.test(h || ""))) return false;
  if (!nurFelder(input.fachinhalt, BEREICHE)
    || !BEREICHE.every(b => typeof input.fachinhalt[b] === "boolean")) return false;
  if (!nurFelder(input.ansichten, BEREICHE)) return false;
  for (const b of BEREICHE) {
    const ansicht = input.ansichten[b];
    if (!nurFelder(ansicht, ["text", "htmlHash"]) || !istText(ansicht.text)
      || !HEX64.test(ansicht.htmlHash || "")) return false;
  }
  return true;
}

// Genau die Ausgabe von briefing-bereichspruefung.pruefe(): Pflichtfelder,
// Methode, gebundener Eingabehash, gueltiger Urteilshash und die abgesicherten
// Paarurteile. Zusaetzliche historische Metadaten am Urteil bleiben erlaubt,
// werden aber nie fuer die fachliche Wertung ausgewertet.
function leseEinzelurteil(urteil) {
  if (!hatFelder(urteil, URTEIL_FELDER)) return null;
  if (typeof urteil.bereit !== "boolean"
    || typeof urteil.bereichstrennungBestanden !== "boolean") return null;
  if (urteil.vollstaendigeFaktenpruefung !== false
    || urteil.funktionsnachweis500 !== false) return null;
  if (urteil.methode !== METHODE || urteil.bedeutungUnabhaengigBewiesen !== false) return null;
  if (!HEX64.test(urteil.eingabeHash || "") || !HEX64.test(urteil.urteilHash || "")) return null;
  if (urteil.grund !== null && !istText(urteil.grund)) return null;
  if (!Array.isArray(urteil.vergleiche)) return null;
  const paare = [];
  for (const v of urteil.vergleiche) {
    if (!nurFelder(v, VERGLEICH_FELDER) || !istText(v.paar)
      || !URTEILE.includes(v.urteil)) return null;
    paare.push({ paar: v.paar, urteil: v.urteil });
  }
  return { bereit: urteil.bereit, grund: urteil.grund,
    bereichstrennungBestanden: urteil.bereichstrennungBestanden,
    eingabeHash: urteil.eingabeHash, urteilHash: urteil.urteilHash, paare };
}

// Prueft die interne Zusammenfassung eines Einzelurteils gegen den bestehenden
// Einzelpruefervertrag (briefing-bereichspruefung.pruefe()). Das ist KEINE neue
// Fachbewertung: Nur der dortige Ausgang
//   bestanden = alle fachinhalt-Bools true UND alle Vergleichsurteile "getrennt"
// wird gespiegelt. Dazu muessen bereit, bereichstrennungBestanden und grund
// exakt passen (bestanden => true/true/null, sonst => false/false/<Grund>).
// Weicht die Zusammenfassung ab, ist das gesamte Einzelurteil widerspruechlich.
function summaryWiderspruch(urteil, fachinhalt) {
  const fachAlleTrue = BEREICHE.every(b => fachinhalt[b] === true);
  const alleGetrennt = urteil.paare.every(p => p.urteil === POSITIV);
  const bestanden = fachAlleTrue && alleGetrennt;
  return urteil.bereit !== bestanden
    || urteil.bereichstrennungBestanden !== bestanden
    || urteil.grund !== (bestanden ? null : NICHT_BESTANDEN_GRUND);
}

function analysiereEintrag(eintrag, soll) {
  const eingabe = eintrag?.eingabe;
  const eingabeGueltig = istPruefeingabe(eingabe, eintrag?.profilId);
  const urteil = eingabeGueltig ? leseEinzelurteil(eintrag?.urteil) : null;
  const urteilGueltig = Boolean(urteil && urteil.eingabeHash === eingabe.eingabeHash);
  return {
    eingabeGueltig,
    urteilGueltig,
    eingabeHashDrift: eingabeGueltig && eingabe.eingabeHash !== soll.eingabeHash,
    rendererHashDrift: eingabeGueltig && eingabe.rendererHash !== soll.rendererHash,
    urteil,
  };
}

// Gelieferte Einzelurteile werden ausschliesslich normalisiert, nie neu bewertet.
// Historische Modellaufruf-Metadaten am Datensatz oder Urteil werden bewusst
// ignoriert: Der Aggregator startet selbst keinen Lauf und sperrt keine
// historischen Metadaten als Wiederverwendung.
function pruefeErhalten(erhalten) {
  if (!Array.isArray(erhalten)) return { eintraege: [] };
  return { eintraege: erhalten.map(e => ({
    profilId: e?.profilId ?? e?.mandat ?? e?.eingabe?.mandat,
    eingabe: e?.eingabe,
    urteil: e?.urteil,
  })) };
}

function gruppiereNachProfil(eintraege) {
  const gruppen = new Map();
  for (const eintrag of eintraege) {
    if (!gruppen.has(eintrag.profilId)) gruppen.set(eintrag.profilId, []);
    gruppen.get(eintrag.profilId).push(eintrag);
  }
  return gruppen;
}

function gruppierePaare(paare) {
  const gruppen = new Map();
  for (const paar of paare) {
    if (!gruppen.has(paar.paar)) gruppen.set(paar.paar, []);
    gruppen.get(paar.paar).push(paar);
  }
  return gruppen;
}

// Vollstaendige, deterministische Bilanz. Nie mutierend: Eingaben werden nur
// gelesen, alle Listen sind frische, sortierte Kopien.
function aggregiere({ erwartet, erhalten } = {}) {
  const vertrag = pruefeVertrag(erwartet);
  const { eintraege } = pruefeErhalten(erhalten);

  const sollNach = new Map();
  if (vertrag.eintraege) for (const e of vertrag.eintraege) sollNach.set(e.profilId, e);
  const erwarteteIds = vertrag.eintraege
    ? vertrag.eintraege.map(e => e.profilId)
    : (Array.isArray(erwartet)
      ? eindeutig(erwartet.map(e => e?.profilId ?? e?.mandat).filter(istText)) : []);

  const ohneId = eintraege.filter(e => !istText(e.profilId));
  const gueltig = eintraege.filter(e => istText(e.profilId));
  const istNach = gruppiereNachProfil(gueltig);
  const duplikate = sortiertObjekte([...istNach.entries()]
    .filter(([, liste]) => liste.length > 1)
    .map(([profilId, liste]) => ({ profilId, anzahl: liste.length })));

  const fehlend = [], eingabeDrift = [], rendererDrift = [];
  const leerzustaende = [], fehlendePaare = [], unerwartetePaare = [];
  const dupliziertePaare = [], ungueltigeUrteile = [];
  const positivIds = [], negativIds = [], unerwartetPaarProfil = [];
  // Paar-Bilanztopf: genau eine Kategorie je erwartetem Paarplatz.
  const paarPositiv = [], paarNegativ = [], paarLeer = [], paarFehlend = [];
  const paarDupliziert = [], paarUnerwartet = [], paarUngueltig = [];
  const paarHashgedriftet = [];
  const profile = [];

  for (const profilId of sortiert(sollNach.keys())) {
    const soll = sollNach.get(profilId);
    const treffer = istNach.get(profilId) || [];
    if (!treffer.length) {
      fehlend.push(profilId);
      for (const paar of PAARE) paarFehlend.push({ profilId, paar });
      profile.push({ profilId, vorhanden: false, doppelt: false, bewertet: false,
        positiv: false, einzelurteilValidiert: false, eingabeHashDrift: false,
        rendererHashDrift: false, eintraege: 0, fehlendePaare: [],
        unerwartetePaare: [], dupliziertePaare: [], leer: [], negativ: [], ungueltig: [] });
      continue;
    }

    const analysen = treffer.map(e => analysiereEintrag(e, soll));
    const eingabeHashDrift = analysen.some(a => a.eingabeHashDrift);
    const rendererHashDrift = analysen.some(a => a.rendererHashDrift);
    if (eingabeHashDrift) eingabeDrift.push(profilId);
    if (rendererHashDrift) rendererDrift.push(profilId);

    // Bei doppeltem Profilschluessel werden ALLE Eintraege dieses Schluessels
    // aus der fachlichen Wertung ausgeschlossen. Technische Hashbindungen
    // bleiben sichtbar, Paarurteile werden nicht mehr bewertet.
    if (treffer.length > 1) {
      for (const paar of PAARE)
        paarDupliziert.push({ profilId, paar, grund: "profil-doppelt",
          anzahl: treffer.length });
      profile.push({ profilId, vorhanden: true, doppelt: true, bewertet: false,
        positiv: false, einzelurteilValidiert: analysen.every(a => a.urteilGueltig),
        eingabeHashDrift, rendererHashDrift, eintraege: treffer.length,
        fehlendePaare: [], unerwartetePaare: [], dupliziertePaare: [],
          leer: [], negativ: [], ungueltig: [] });
      continue;
    }

    // Hash-Drift: Die gelieferten Paarurteile gehoeren zu einem anderen
    // erwarteten Stand und duerfen nicht positiv, negativ oder leer gewertet
    // werden. Alle drei erwarteten Paarplaetze wandern disjunkt in
    // "hashgedriftet" und bleiben aus der fachlichen Wertung ausgeschlossen.
    if (eingabeHashDrift || rendererHashDrift) {
      const grund = eingabeHashDrift ? "eingabehash-drift" : "rendererhash-drift";
      for (const paar of PAARE) paarHashgedriftet.push({ profilId, paar, grund });
      profile.push({ profilId, vorhanden: true, doppelt: treffer.length > 1,
        bewertet: false, positiv: false,
        einzelurteilValidiert: analysen.every(a => a.urteilGueltig),
        eingabeHashDrift, rendererHashDrift, eintraege: treffer.length,
        fehlendePaare: [], unerwartetePaare: [], dupliziertePaare: [],
        leer: [], negativ: [], ungueltig: [] });
      continue;
    }

    const analyse = analysen[0];
    const fehlende = [], unerwartete = [], doppeltePaare = [];
    const leer = [], negative = [];
    let widerspruechlich = false;
    let positivKern = false;

    if (!analyse.urteilGueltig) {
      widerspruechlich = true;
      const grund = analyse.eingabeGueltig ? "urteil-ungueltig" : "eingabe-ungueltig";
      ungueltigeUrteile.push({ profilId, grund });
      for (const paar of PAARE) paarUngueltig.push({ profilId, paar, grund });
    } else {
      const gruppen = gruppierePaare(analyse.urteil.paare);
      // Die Summary-Konsistenz ist nur aussagekraeftig, wenn die gelieferten
      // Paarurteile strukturell vollstaendig und eindeutig sind (jedes der drei
      // erwarteten Paare genau einmal). Fehlende, doppelte oder unerwartete
      // Paare werden weiterhin von den eigenen, bereits geprueften Kategorien
      // bilanziert.
      const strukturVollstaendig = analyse.urteil.paare.length === PAARE.length
        && PAARE.every(paar => gruppen.has(paar) && gruppen.get(paar).length === 1);
      if (strukturVollstaendig
        && summaryWiderspruch(analyse.urteil, treffer[0].eingabe.fachinhalt)) {
        // Widerspruechliche Zusammenfassung: Das gesamte Einzelurteil gilt als
        // ungueltig; alle drei Paarplaetze werden ungueltig, kein Paarwert bleibt
        // positiv, negativ oder leer.
        widerspruechlich = true;
        const grund = "urteil-widerspruechlich";
        ungueltigeUrteile.push({ profilId, grund });
        for (const paar of PAARE) paarUngueltig.push({ profilId, paar, grund });
      } else {
        for (const [paar, eintraegeZuPaar] of gruppen) {
          if (!PAARE.includes(paar)) {
            unerwartete.push(paar);
            unerwartetePaare.push({ profilId, paar, anzahl: eintraegeZuPaar.length });
            paarUnerwartet.push({ profilId, paar, anzahl: eintraegeZuPaar.length });
            continue;
          }
          // Auch bei doppeltem Paarschluessel werden ALLE Eintraege dieses
          // Schluessels aus der fachlichen Wertung ausgeschlossen; der erwartete
          // Paarplatz zaehlt als dupliziert.
          if (eintraegeZuPaar.length > 1) {
            doppeltePaare.push(paar);
            dupliziertePaare.push({ profilId, paar, anzahl: eintraegeZuPaar.length,
              urteile: sortiert(eintraegeZuPaar.map(p => p.urteil)) });
            paarDupliziert.push({ profilId, paar, grund: "paar-doppelt",
              anzahl: eintraegeZuPaar.length,
              urteile: sortiert(eintraegeZuPaar.map(p => p.urteil)) });
            continue;
          }
          const urteil = eintraegeZuPaar[0].urteil;
          if (urteil === POSITIV) {
            paarPositiv.push({ profilId, paar });
            continue;
          }
          if (urteil === LEER) {
            leer.push(paar);
            leerzustaende.push({ profilId, paar });
            paarLeer.push({ profilId, paar });
            continue;
          }
          if (NEGATIV.includes(urteil)) {
            negative.push(paar);
            paarNegativ.push({ profilId, paar, urteil });
            continue;
          }
          ungueltigeUrteile.push({ profilId, paar, urteil });
          paarUngueltig.push({ profilId, paar, urteil });
          widerspruechlich = true;
        }
        for (const paar of PAARE) if (!gruppen.has(paar)) {
          fehlende.push(paar);
          fehlendePaare.push({ profilId, paar });
          paarFehlend.push({ profilId, paar });
        }
        const eindeutigePaare = new Set(analyse.urteil.paare.map(p => p.paar));
        positivKern = analyse.urteil.bereit === true
          && analyse.urteil.bereichstrennungBestanden === true
          && analyse.urteil.grund === null
          && analyse.urteil.paare.length === PAARE.length
          && eindeutigePaare.size === PAARE.length
          && PAARE.every(paar => gruppen.has(paar) && gruppen.get(paar).length === 1
            && gruppen.get(paar)[0].urteil === POSITIV);
        if (!positivKern && !fehlende.length && !unerwartete.length
          && !doppeltePaare.length && !leer.length && !negative.length) {
          widerspruechlich = true;
          ungueltigeUrteile.push({ profilId, grund: "urteil-widerspruechlich" });
        }
      }
    }

    const positiv = !widerspruechlich && analyse.eingabeGueltig && analyse.urteilGueltig
      && positivKern && !eingabeHashDrift && !rendererHashDrift
      && !fehlende.length && !unerwartete.length && !doppeltePaare.length
      && !leer.length && !negative.length;
    if (positiv) positivIds.push(profilId);
    if (negative.length) negativIds.push(profilId);
    if (unerwartete.length) unerwartetPaarProfil.push(profilId);

    // Fail-closed Statussemantik: Bei einer widerspruechlichen Summary ist das
    // gesamte Einzelurteil ungueltig (siehe ungueltigeUrteile/paarUngueltig).
    // Der Profilstatus darf das nicht als "bewertet" oder "validiert" melden.
    const einzelurteilGueltig = analyse.urteilGueltig && !widerspruechlich;
    profile.push({ profilId, vorhanden: true, doppelt: false,
      bewertet: einzelurteilGueltig, positiv,
      einzelurteilValidiert: einzelurteilGueltig,
      eingabeHashDrift, rendererHashDrift, eintraege: treffer.length,
      fehlendePaare: sortiert(fehlende), unerwartetePaare: sortiert(unerwartete),
      dupliziertePaare: sortiert(doppeltePaare), leer: sortiert(leer),
      negativ: sortiert(negative),
      ungueltig: widerspruechlich ? ["einzelurteil"] : [] });
  }

  const unerwartet = sortiert([...istNach.keys()].filter(id => !sollNach.has(id)));
  const hashgedriftet = sortiert(eindeutig([...eingabeDrift, ...rendererDrift]));
  const dupliziertePaareSortiert = sortiertObjekte(dupliziertePaare);
  const ungueltigeUrteileSortiert = sortiertObjekte(ungueltigeUrteile);

  const zaehlungen = {
    erwartet: vertrag.eintraege ? vertrag.eintraege.length
      : (Array.isArray(erwartet) ? erwartet.length : 0),
    erhalten: eintraege.length,
    positiv: positivIds.length,
    negativ: negativIds.length,
    fehlend: fehlend.length,
    dupliziert: duplikate.length,
    hashgedriftet: hashgedriftet.length,
    unerwartet: unerwartet.length,
    leerzustaende: leerzustaende.length,
    fehlendePaare: fehlendePaare.length,
    unerwartetePaare: unerwartetePaare.length,
    dupliziertePaare: dupliziertePaareSortiert.length,
    ungueltigeUrteile: ungueltigeUrteileSortiert.length,
    eingabeDrift: eingabeDrift.length,
    rendererDrift: rendererDrift.length,
  };

  // Eigene, disjunkte 1500er Paarbilanz. erwartet zaehlt ausschliesslich gueltig
  // erwartete Profile (bei gueltigem Vertrag exakt ZIEL * PAARE.length = 1500).
  const paarPositivSortiert = sortiertObjekte(paarPositiv);
  const paarNegativSortiert = sortiertObjekte(paarNegativ);
  const paarLeerSortiert = sortiertObjekte(paarLeer);
  const paarFehlendSortiert = sortiertObjekte(paarFehlend);
  const paarDupliziertSortiert = sortiertObjekte(paarDupliziert);
  const paarUnerwartetSortiert = sortiertObjekte(paarUnerwartet);
  const paarUngueltigSortiert = sortiertObjekte(paarUngueltig);
  const paarHashgedriftetSortiert = sortiertObjekte(paarHashgedriftet);
  const paarZaehlungen = {
    erwartet: sollNach.size * PAARE.length,
    erhalten: paarPositiv.length + paarNegativ.length + paarLeer.length,
    positiv: paarPositiv.length,
    negativ: paarNegativ.length,
    leer: paarLeer.length,
    fehlend: paarFehlend.length,
    dupliziert: paarDupliziert.length,
    unerwartet: paarUnerwartet.length,
    ungueltig: paarUngueltig.length,
    hashgedriftet: paarHashgedriftet.length,
  };
  // Disjunktheitsnachweis: jeder erwartete Paarplatz genau einmal gezaehlt.
  paarZaehlungen.summeStimmt = paarZaehlungen.erwartet
    === PAAR_KATEGORIEN.reduce((summe, k) => summe + paarZaehlungen[k], 0);

  const bestanden = !vertrag.fehler && ohneId.length === 0 && zaehlungen.erhalten === ZIEL
    && fehlend.length === 0 && duplikate.length === 0 && unerwartet.length === 0
    && hashgedriftet.length === 0 && negativIds.length === 0 && leerzustaende.length === 0
    && ungueltigeUrteileSortiert.length === 0 && fehlendePaare.length === 0
    && unerwartetePaare.length === 0 && dupliziertePaareSortiert.length === 0
    && positivIds.length === ZIEL
    // Zusaetzlich zur Profilbilanz muss die eigene 1500er Paarbilanz vollstaendig
    // positiv sein: 500 erwartete Profile mal drei Bereichspaare.
    && paarZaehlungen.erwartet === ZIEL * PAARE.length
    && paarZaehlungen.erhalten === ZIEL * PAARE.length
    && paarZaehlungen.positiv === ZIEL * PAARE.length
    && paarZaehlungen.unerwartet === 0 && paarZaehlungen.summeStimmt;

  const gruende = [];
  if (vertrag.fehler) gruende.push(vertrag.fehler);
  if (ohneId.length) gruende.push("eingabe-ohne-profilId");
  if (fehlend.length) gruende.push("profil-fehlt");
  if (duplikate.length) gruende.push("profil-doppelt");
  if (unerwartet.length) gruende.push("profil-unerwartet");
  if (eingabeDrift.length) gruende.push("eingabehash-drift");
  if (rendererDrift.length) gruende.push("rendererhash-drift");
  if (fehlendePaare.length) gruende.push("paar-fehlt");
  if (unerwartetePaare.length) gruende.push("paar-unerwartet");
  if (dupliziertePaareSortiert.length) gruende.push("paar-doppelt");
  if (leerzustaende.length) gruende.push("leerzustand");
  if (negativIds.length) gruende.push("urteil-negativ");
  if (ungueltigeUrteileSortiert.length) gruende.push("urteil-ungueltig");
  if (paarZaehlungen.positiv !== ZIEL * PAARE.length
    || paarZaehlungen.erhalten !== ZIEL * PAARE.length
    || paarZaehlungen.unerwartet !== 0 || !paarZaehlungen.summeStimmt)
    gruende.push("paar-bilanz-unvollstaendig");
  if (!bestanden && !gruende.length) gruende.push("bilanz-unvollstaendig");

  const kern = {
    version: VERSION,
    art: "bereichsabnahme-500-aggregat",
    ziel: ZIEL,
    status: bestanden ? "bestanden" : "nicht-bestanden",
    grund: bestanden ? null : gruende[0],
    gruende,
    vertragGueltig: !vertrag.fehler,
    zaehlungen,
    paarZaehlungen,
    erwarteteIds: sortiert(erwarteteIds),
    erhalteneIds: sortiert([...istNach.keys()]),
    fehlend: sortiert(fehlend),
    dupliziert: duplikate.map(d => d.profilId),
    duplikate,
    unerwartet,
    eingabeDrift: sortiert(eingabeDrift),
    rendererDrift: sortiert(rendererDrift),
    hashgedriftet,
    positivIds: sortiert(positivIds),
    negativ: sortiert(negativIds),
    unerwartetPaarProfil: sortiert(eindeutig(unerwartetPaarProfil)),
    leerzustaende: sortiertObjekte(leerzustaende),
    fehlendePaare: sortiertObjekte(fehlendePaare),
    unerwartetePaare: sortiertObjekte(unerwartetePaare),
    dupliziertePaare: dupliziertePaareSortiert,
    ungueltigeUrteile: ungueltigeUrteileSortiert,
    // Vollstaendige, deterministische Paarlisten je Kategorie (betroffene
    // Profil/Paar-Paare bleiben einzeln sichtbar).
    paarPositiv: paarPositivSortiert,
    paarNegativ: paarNegativSortiert,
    paarLeer: paarLeerSortiert,
    paarFehlend: paarFehlendSortiert,
    paarDupliziert: paarDupliziertSortiert,
    paarUnerwartet: paarUnerwartetSortiert,
    paarUngueltig: paarUngueltigSortiert,
    paarHashgedriftet: paarHashgedriftetSortiert,
    profile,
    keineStichprobe: true,
    reinLesend: true,
    modellaufrufe: 0,
    neueFachbewertung: false,
    fachlicheFreigabe: false,
    funktionsnachweis500: false,
  };
  return { ...kern, ergebnisHash: hash(kern) };
}

module.exports = { VERSION, ZIEL, URTEILE, PAARE, PAAR_KATEGORIEN, aggregiere };
