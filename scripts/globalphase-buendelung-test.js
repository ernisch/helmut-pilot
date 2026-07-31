"use strict";

// Helmut — Testsuite OP-25 K2: fachliche Absicherung der GLOBALEN BUENDELUNG.
// =============================================================================================
// AUFTRAG (K2): beweisen oder widerlegen, dass die globale Buendelung dieselben politischen
// Vorgaenge korrekt zusammenfuehrt — und Befund **K1-1** endgueltig bewerten.
//
// K1 hatte K1-1 so beschrieben: „die Vorgangskennung haengt an der Buendelung; alle Kennungen
// teilen dasselbe Suchpraefix, `sameVorgang` haelt sie fuer denselben Vorgang, es entsteht kein
// zweiter Vorgang". Diese Suite prueft genau das nach — und zwar nicht an EINEM Beispiel,
// sondern an konstruierten Gegenbeispielen aus allen geforderten Fallfamilien.
//
// ERGEBNIS IN EINEM SATZ (im Detail belegt in den Abschnitten 4–7):
//   K1-1 ist NICHT widerlegt, sondern **breiter als dokumentiert**. Es geht nicht nur um den
//   Suffix einer Kennung: die DOKUMENTPARTITION selbst aendert sich — in beide Richtungen
//   (Zusammenfuehrung UND Trennung). Kein Dokument geht verloren, kein Wissensobjekt
//   verschwindet, es entstehen keine doppelten Vorgaenge; aber welche Dokumente EINEN Vorgang
//   bilden, ist im globalen Pfad nachweislich eine andere Einteilung.
//
// DIE URSACHE, mechanisch (Abschnitt 7 — der eigentliche Erkenntnisgewinn dieses Sprints):
// Helmut entscheidet „gehoert zusammen" in ZWEI verschiedenen Regimen.
//   LOSES REGIME  — INNERHALB eines Batches: `clusterRawDocuments` bildet Zusammenhangs-
//                   komponenten ueber `docsShareEvent`. Eine EINZIGE paarweise Kante genuegt,
//                   und Kanten sind transitiv wirksam (A~B, B~C ⇒ A,B,C in EINEM Vorgang).
//   STRENGES REGIME — ZWISCHEN Batches/Laeufen: `resolveVorgang` sucht Kandidaten ueber das
//                   Themenwurzel-PRAEFIX (`candidatePrefixes`) und prueft sie mit
//                   `sameVorgang` KERN gegen KERN (plus Riegel fuer Ein-Dokument-Vorgaenge).
//                   Zwei Dokumente ohne gemeinsame Themenwurzel werden dort nie auch nur als
//                   Kandidaten betrachtet.
// Die globale Buendelung verschiebt eine grosse Dokumentmenge — alles aus MANDATSEIGENEN
// Quellen (Personen-, Partei-, Ausschussquellen; nach K1-Messung 58 von 196 Wegen bei acht
// Profilen) — vom STRENGEN in das LOSE Regime. Das ist K1-1, praezise formuliert.
//
// WAS DIESE SUITE NICHT BEHAUPTET:
//   - Sie misst KEINE Production-Haeufigkeit. Die Faelle hier sind KONSTRUIERT (Phase 2 des
//     Auftrags verlangt genau das). Wie oft die Muster in Production auftreten, ist offen und
//     ohne Aktivierung nicht messbar.
//   - Sie aendert NICHTS am Produktionsverhalten. Sie verankert das GEMESSENE Verhalten, damit
//     eine spaetere Korrektur sichtbar wird statt still zu passieren.
//
// Deterministisch und offline: keine Uhr-Abhaengigkeit im Ergebnis, kein Zufall, kein Netz,
// keine KI, keine Production-Daten. Der KI-Aufruf ist ein Testdouble; alles davor und danach
// (Ankerbildung, Clusterbildung, Kennung, Resolver, Verknuepfung, Schemapruefung) ist der
// ECHTE Produktionscode.
//
// Aufbau:
//   1  Vertrag der Kantenrelation (paarweise, kontextfrei)
//   2  Partition und Vollstaendigkeit — kein Dokument geht verloren
//   3  Die geforderten Fallfamilien durch BEIDE Pfade
//   4  Phase-3-Beweise je Fall
//   5  Adversariale Proben (Reihenfolge, Quellen, Mandate, erzwungene Duplikate)
//   6  Befund K1-1 — die drei Teilbefunde als Regressionsriegel
//   7  Zwei-Regime-Nachweis (die Ursache)
//   8  Gemessene Wirkung des Formularvokabulars (Option, NICHT umgesetzt)
//   9  Sicherheitsgrenzen

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const V = require(path.join(ROOT, "lib", "helmut", "vorgang-identity.js"));
const U = require(path.join(ROOT, "lib", "helmut", "understanding.js"));
const G = require(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }
function info(text) { console.log(`  INFO  ${text}`); }

// ── Dokumentbau ──────────────────────────────────────────────────────────────────────────────
// Alle Texte sind ERFUNDENE Testdaten mit erfundenen Adressen (`example.invalid`). Sie stehen
// fuer Muster, nicht fuer echte Meldungen — Belegpflicht (CLAUDE.md §4.3) gilt fuer Produkt-
// inhalte, nicht fuer Testfixtures, und diese hier verlassen den Test nie.
function dok(id, quelle, titel, kurzfassung, zeit) {
  return {
    id, source_id: quelle, source_name: quelle,
    title: titel, summary: kurzfassung,
    published_at: new Date(zeit).toISOString(),
    url: `https://example.invalid/${id}`, content_hash: id,
    link_type: "article", confidence: 0.8
  };
}

// ── KI-Testdouble ────────────────────────────────────────────────────────────────────────────
// Genau die Pflichtfelder des echten Schemas, damit `assembleKnowledgeObject` +
// `validateKnowledgeObject` (Produktionscode) wirklich durchlaufen und ein `saved` entsteht.
const KI_ANTWORT = () => ({
  was_ist_passiert: "Ein politischer Vorgang wurde beraten.",
  warum_wichtig: "Er beruehrt die Zustaendigkeit des Mandats.",
  wer_ist_betroffen: "Betroffen sind die im Vorgang genannten Akteure.",
  handlungsempfehlung: "Position im Buero abstimmen.",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  mentioned_people: [], mentioned_mps: [], mentioned_parties: [], mentioned_committees: [],
  mentioned_ministries: [], mentioned_locations: [], mentioned_organizations: [],
  display_title: "Vorgang", display_summary: "Kurzfassung.", why_relevant: "Relevanz.",
  recommendation: "Empfehlung.", display_category: "gesetzgebung",
  confidence_score: 70, zeitdruck: "mittel", risk_level: "unknown", opportunity_level: "unknown"
});

// ── Vorgangsablage (Testdouble fuer storage) ─────────────────────────────────────────────────
// Bildet exakt die vier Zugriffe nach, die `resolveVorgang`/`understandOneCluster` benutzen:
//   findVorgangCandidates  -> storage.listKnowledgeObjectsByVorgangPrefix (Praefixsuche,
//                             `updated_at` absteigend, Limit)
//   listVorgangDocuments   -> storage.listKoDocuments (Limit 40)
//   save / saveSources     -> saveKnowledgeObject / saveKoDocumentLinks
// Der Zeitstempel ist ein MONOTONER Zaehler statt einer Uhr: die Kandidatenreihenfolge wird
// dadurch reproduzierbar, ohne dass die Suite von `Date.now()` abhaengt.
function neueAblage() {
  const kos = new Map();     // vorgang_id -> Zeile
  const links = new Map();   // koId -> Map(dokId -> Dokument)
  let seq = 0;
  let kiAufrufe = 0;
  const stempel = () => { seq += 1; return `2026-07-31T00:00:${String(seq).padStart(2, "0")}.000Z`; };

  const deps = {
    findVorgangCandidates: async (praefixe, limit) => [...kos.values()]
      .filter((k) => (praefixe || []).some((p) => String(k.vorgang_id).startsWith(p)))
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, limit)
      .map((k) => ({ ...k })),
    listVorgangDocuments: async (koId) => [...(links.get(koId) || new Map()).values()].slice(0, 40),
    getExisting: async (vid) => (kos.has(vid) ? { ...kos.get(vid) } : null),
    save: async (ko) => {
      kos.set(ko.vorgang_id, { ...(kos.get(ko.vorgang_id) || {}), ...ko, updated_at: stempel() });
      return { saved: true };
    },
    saveSources: async (koId, docs) => {
      if (!links.has(koId)) links.set(koId, new Map());
      for (const d of docs || []) if (d && d.id) links.get(koId).set(d.id, d);
    },
    markFailed: async (vid, meta) => {
      kos.set(vid, {
        id: `ko-${vid}`, vorgang_id: vid, status: "pending", understanding_status: "failed",
        headline: (meta && meta.headline) || "", updated_at: stempel()
      });
    },
    savePending: async (vid, meta) => {
      if (kos.has(vid)) return { saved: false, reason: "exists", id: `ko-${vid}` };
      kos.set(vid, {
        id: `ko-${vid}`, vorgang_id: vid, status: "pending", understanding_status: null,
        headline: (meta && meta.headline) || "", updated_at: stempel()
      });
      return { saved: true, id: `ko-${vid}` };
    },
    canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async () => { kiAufrufe += 1; return KI_ANTWORT(); },
    modelName: () => "testmodell",
    logSkip: () => {}
  };

  return {
    deps, kos, links,
    kiAufrufe: () => kiAufrufe,
    // dokId -> vorgangId, zurueckgerechnet aus den ECHTEN Verknuepfungen (ko_document_links).
    // Genau diese Verknuepfung ist laut `understanding.js` die Verknuepfungsinvariante:
    // verknuepft = verarbeitet, unverknuepft = offen.
    zuordnung: () => {
      const out = new Map();
      for (const [koId, m] of links.entries()) {
        const vid = String(koId).replace(/^ko-/, "");
        for (const id of m.keys()) {
          if (!out.has(id)) out.set(id, new Set());
          out.get(id).add(vid);
        }
      }
      return out;
    }
  };
}

// ── Die beiden Pfade ─────────────────────────────────────────────────────────────────────────
// ALT (heute): je Mandat ein eigener Batch. Modelliert wird dabei die GLOBALE Entdoppelung der
// Rohdokumente: `saveRawItems` speichert ein Dokument nur EINMAL, also enthaelt der Batch eines
// spaeteren Mandats nur die Dokumente, die noch kein frueheres Mandat gespeichert hat. Genau
// deshalb landen Dokumente GETEILTER Quellen heute vollstaendig im Batch des ERSTEN Mandats —
// fuer sie aendert die globale Buendelung strukturell nichts.
// NEU (K1): ein einziger Batch ueber die Vereinigungsmenge.
async function laufe(batches) {
  const ablage = neueAblage();
  const protokoll = [];
  for (const batch of batches) {
    if (!batch.length) continue;
    for (const cluster of V.clusterRawDocuments(batch)) {
      const r = await U.understandOneCluster(cluster, ablage.deps, { retriesCtx: { geladen: false, map: null } });
      protokoll.push({
        status: r.status, vorgangId: r.vorgangId, begruendung: r.begruendung || null,
        docs: (cluster.documents || []).map((d) => d.id)
      });
    }
  }
  return { ablage, protokoll };
}

const altPfad = (batchesJeMandat) => laufe(batchesJeMandat);
const neuPfad = (batchesJeMandat) => {
  const gesehen = new Set();
  const vereinigung = [];
  for (const batch of batchesJeMandat) {
    for (const d of batch) { if (gesehen.has(d.id)) continue; gesehen.add(d.id); vereinigung.push(d); }
  }
  return laufe([vereinigung]);
};

// Entdoppelte Mandatsbatches (ALT): jedes Dokument nur im Batch des ersten Mandats, das es sieht.
function entdoppelt(batchesJeMandat) {
  const gesehen = new Set();
  return batchesJeMandat.map((batch) => batch.filter((d) => {
    if (gesehen.has(d.id)) return false;
    gesehen.add(d.id);
    return true;
  }));
}

// Die GRUPPIERUNG (welche Dokumente bilden EINEN Vorgang) — unabhaengig von der Kennung.
// Genau das ist die fachlich relevante Groesse: eine andere Kennung ist harmlos, eine andere
// Gruppierung ist eine andere Lage.
function gruppierung(ablage) {
  const g = new Map();
  for (const [dok, vids] of ablage.zuordnung().entries()) {
    const key = [...vids].sort().join("+");
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(dok);
  }
  return [...g.values()].map((x) => x.sort().join(",")).sort();
}

function clusterSignatur(docs) {
  return V.clusterRawDocuments(docs)
    .map((c) => c.documents.map((d) => d.id).sort().join("+")).sort().join(" | ");
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// KORPUS — die vom Auftrag geforderten Fallfamilien.
// Jede Familie nennt: welches Mandat welche Quelle abruft, und was fachlich RICHTIG waere.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const t = (h, m = 0) => `2026-07-30T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;

const FAMILIEN = [
  {
    id: "F1", titel: "gleiche Vorgangsnummer · amtlicher Weg (geteilt) + Personenquelle von B",
    soll: "EIN Vorgang", sollGetrennt: false,
    mandate: {
      A: [dok("f1-amt", "bt-drucksachen",
        "Gesetzentwurf zur Pflegereform 2026 — Drucksache 21/1234",
        "Die Bundesregierung legt den Gesetzentwurf zur Pflegereform 2026 vor. Drucksache 21/1234 regelt die Finanzierung der Pflegeversicherung.", t(6))],
      B: [dok("f1-amt", "bt-drucksachen",
        "Gesetzentwurf zur Pflegereform 2026 — Drucksache 21/1234",
        "Die Bundesregierung legt den Gesetzentwurf zur Pflegereform 2026 vor. Drucksache 21/1234 regelt die Finanzierung der Pflegeversicherung.", t(6)),
      dok("f1-person", "mandat-b-news",
        "Pflegereform 2026: Abgeordnete fordert Nachbesserung bei der Pflegeversicherung",
        "Zur Pflegereform 2026 fordert die Abgeordnete Nachbesserungen bei der Finanzierung der Pflegeversicherung. Drucksache 21/1234.", t(9))]
    }
  },
  {
    id: "F2", titel: "identisches Dokument aus zwei verschiedenen Quellen",
    soll: "EIN Vorgang", sollGetrennt: false,
    mandate: {
      A: [dok("f2-a", "tagesschau",
        "Bundesrat stimmt Tariftreuegesetz zu",
        "Der Bundesrat hat dem Tariftreuegesetz zugestimmt. Das Tariftreuegesetz verpflichtet Auftragnehmer des Bundes zur Tarifbindung.", t(7))],
      B: [dok("f2-b", "zeit-online",
        "Bundesrat stimmt Tariftreuegesetz zu",
        "Der Bundesrat hat dem Tariftreuegesetz zugestimmt. Das Tariftreuegesetz verpflichtet Auftragnehmer des Bundes zur Tarifbindung.", t(7, 5))]
    }
  },
  {
    id: "F3", titel: "leicht unterschiedliche Dokumente · unterschiedliche Schreibweisen",
    soll: "EIN Vorgang", sollGetrennt: false,
    mandate: {
      A: [dok("f3-a", "bmas-presse",
        "Emissionshandel: Kabinett beschliesst Novelle",
        "Das Kabinett hat die Novelle zum Emissionshandel beschlossen. Der Emissionshandel wird auf Gebaeude ausgeweitet.", t(8))],
      B: [dok("f3-b", "mandat-b-news",
        "Emissionshandelsreform trifft Mieterinnen und Mieter",
        "Die Emissionshandelsreform der Bundesregierung belastet nach Ansicht von Fachleuten Mieterinnen und Mieter. Die Novelle zum Emissionshandel gilt ab 2027.", t(10))]
    }
  },
  {
    id: "F4", titel: "unterschiedliche Vorgangsnummer · zwei Vorgaenge mit aehnlichem Titel",
    soll: "ZWEI Vorgaenge", sollGetrennt: true,
    mandate: {
      A: [dok("f4-a", "ausschuss-gesundheit",
        "Antrag zur Krankenhausreform — Drucksache 21/5678",
        "Die Fraktion beantragt eine Aenderung der Krankenhausreform. Drucksache 21/5678 betrifft die Vorhaltefinanzierung der Kliniken.", t(6, 30))],
      B: [dok("f4-b", "ausschuss-verkehr",
        "Antrag zum Deutschlandtakt — Drucksache 21/9012",
        "Die Fraktion beantragt eine Aenderung beim Deutschlandtakt. Drucksache 21/9012 betrifft die Fahrplanverdichtung im Schienenverkehr.", t(6, 35))]
    }
  },
  {
    id: "F5", titel: "mehrere Dokumente EINES Vorgangs, verteilt ueber beide Mandate",
    soll: "EIN Vorgang", sollGetrennt: false,
    mandate: {
      A: [dok("f5-a", "tagesschau",
        "Vergesellschaftung: Volksentscheid erreicht das Quorum",
        "Der Volksentscheid zur Vergesellschaftung grosser Wohnungsunternehmen hat das Quorum erreicht.", t(5)),
      dok("f5-b", "mandat-a-news",
        "Vergesellschaftung — Gesetzesinitiative angekuendigt",
        "Nach dem Volksentscheid zur Vergesellschaftung ist eine Gesetzesinitiative angekuendigt worden.", t(11))],
      B: [dok("f5-c", "fraktion-spd",
        "Fraktion beraet Vergesellschaftung nach Volksentscheid",
        "Die Fraktion beraet die Konsequenzen aus dem Volksentscheid zur Vergesellschaftung.", t(12))]
    }
  },
  {
    id: "F6", titel: "Ausschussquellen beider Mandate · derselbe Ausschussvorgang",
    soll: "EIN Vorgang", sollGetrennt: false,
    mandate: {
      A: [dok("f6-a", "ausschuss-gesundheit",
        "Gesundheitsausschuss: Anhoerung zur Suchtpraevention",
        "Der Gesundheitsausschuss fuehrt eine oeffentliche Anhoerung zur Suchtpraevention durch.", t(6, 10))],
      B: [dok("f6-b", "ausschuss-gesundheit-b",
        "Anhoerung zur Suchtpraevention im Gesundheitsausschuss",
        "Sachverstaendige aeussern sich in der Anhoerung zur Suchtpraevention im Gesundheitsausschuss.", t(6, 20))]
    }
  },
  {
    id: "F7", titel: "parteispezifische Quellen · zwei Parteien, EIN Thema",
    soll: "EIN Vorgang (dieselbe Debatte)", sollGetrennt: false,
    mandate: {
      A: [dok("f7-a", "fraktion-spd",
        "SPD-Fraktion fordert hoeheren Mindestlohn",
        "Die SPD-Fraktion fordert eine Anhebung des Mindestlohns auf 15 Euro.", t(7, 30))],
      B: [dok("f7-b", "fraktion-cdu",
        "CDU-Fraktion lehnt Mindestlohnerhoehung ab",
        "Die CDU-Fraktion lehnt die geforderte Anhebung des Mindestlohns auf 15 Euro ab.", t(7, 40))]
    }
  },
  {
    id: "F8", titel: "Personenquellen zweier Mandate · DASSELBE Ereignis",
    soll: "EIN Vorgang", sollGetrennt: false,
    mandate: {
      A: [dok("f8-a", "mandat-a-news",
        "Abgeordneter besucht Klinikum Neukoelln",
        "Der Abgeordnete besuchte das Klinikum Neukoelln und sprach ueber die Personalsituation.", t(13))],
      B: [dok("f8-b", "mandat-b-news",
        "Abgeordnete besucht Klinikum Neukoelln",
        "Die Abgeordnete besuchte das Klinikum Neukoelln und sprach ueber die Personalsituation.", t(13, 10))]
    }
  },
  {
    id: "F9", titel: "Personenquellen zweier Mandate · ZWEI VERSCHIEDENE Ereignisse",
    soll: "ZWEI Vorgaenge", sollGetrennt: true,
    mandate: {
      A: [dok("f9-a", "mandat-a-news",
        "Abgeordneter besucht Pflegeheim in Spandau",
        "Der Abgeordnete besuchte ein Pflegeheim in Spandau und sprach mit Beschaeftigten ueber die Personalsituation.", t(9))],
      B: [dok("f9-b", "mandat-b-news",
        "Abgeordnete besucht Jugendzentrum in Harburg",
        "Die Abgeordnete besuchte ein Jugendzentrum in Harburg und sprach mit Jugendlichen ueber die Freizeitangebote.", t(10))]
    }
  },
  {
    id: "F10", titel: "Ausschussquellen zweier Mandate · VERSCHIEDENE Ausschuesse, gleiches Formular",
    soll: "ZWEI Vorgaenge", sollGetrennt: true,
    mandate: {
      A: [dok("f10-a", "ausschuss-gesundheit",
        "Ausschuss fuer Gesundheit: oeffentliche Anhoerung von Sachverstaendigen",
        "Der Ausschuss fuehrt eine oeffentliche Anhoerung von Sachverstaendigen durch. Die Tagesordnung wurde veroeffentlicht.", t(9))],
      B: [dok("f10-b", "ausschuss-verkehr",
        "Ausschuss fuer Verkehr: oeffentliche Anhoerung von Sachverstaendigen",
        "Der Ausschuss fuehrt eine oeffentliche Anhoerung von Sachverstaendigen durch. Die Tagesordnung wurde veroeffentlicht.", t(9, 30))]
    }
  },
  {
    id: "F11", titel: "parteispezifische Quellen · VERSCHIEDENE Themen, gleiche Formulierung",
    soll: "ZWEI Vorgaenge", sollGetrennt: true,
    mandate: {
      A: [dok("f11-a", "fraktion-spd",
        "SPD-Fraktion fordert Aenderung beim Mindestlohn",
        "Die Fraktion fordert eine Aenderung beim Mindestlohn und kuendigt einen Antrag an.", t(9))],
      B: [dok("f11-b", "fraktion-cdu",
        "CDU-Fraktion fordert Aenderung beim Elterngeld",
        "Die Fraktion fordert eine Aenderung beim Elterngeld und kuendigt einen Antrag an.", t(9, 30))]
    }
  },
  {
    id: "F12", titel: "Kette ueber die Mandatsgrenze (x~y, y~z, x!~z)",
    soll: "ZWEI Vorgaenge", sollGetrennt: true,
    mandate: {
      A: [dok("f12-x", "tagesschau",
        "Vergesellschaftung: Volksentscheid erreicht das Quorum",
        "Der Volksentscheid zur Vergesellschaftung grosser Wohnungsunternehmen hat das Quorum erreicht.", t(8)),
      dok("f12-y", "mandat-a-news",
        "Vergesellschaftung und Mietendeckel: Senat prueft beide Instrumente",
        "Der Senat prueft die Vergesellschaftung und zugleich einen neuen Mietendeckel fuer Berlin.", t(9))],
      B: [dok("f12-z", "mandat-b-news",
        "Mietendeckel: Gericht verhandelt ueber die Verfassungsbeschwerde",
        "Das Gericht verhandelt ueber die Verfassungsbeschwerde gegen den Mietendeckel.", t(10))]
    }
  },
  {
    id: "F13", titel: "Kernanker-Nachpruefung · globale Buendelung TRENNT einen Mandatsvorgang",
    soll: "Mandatsgruppierung bleibt erhalten", sollGetrennt: false,
    mandate: {
      A: [dok("f13-m1", "bt-plenum",
        "Tariftreuegesetz im Bundesrat",
        "Der Bundesrat beraet das Tariftreuegesetz.", t(8)),
      dok("f13-m2", "bt-plenum",
        "Tariftreuegesetz und Vergaberecht",
        "Das Tariftreuegesetz aendert das Vergaberecht des Bundes.", t(8, 30))],
      B: [dok("f13-m3", "mandat-b-news",
        "Vergaberecht: Novelle im Kabinett",
        "Das Kabinett beschliesst eine Novelle des Vergaberechts.", t(9)),
      dok("f13-m4", "mandat-b-news",
        "Vergaberecht der Kommunen",
        "Die Kommunen wenden das Vergaberecht unterschiedlich an.", t(9, 30)),
      dok("f13-m5", "mandat-b-news",
        "Vergaberecht und Mittelstand",
        "Der Mittelstand kritisiert das Vergaberecht.", t(10))]
    }
  }
];

const alleDokumente = (fam) => {
  const gesehen = new Set();
  const out = [];
  for (const batch of Object.values(fam.mandate)) {
    for (const d of batch) { if (gesehen.has(d.id)) continue; gesehen.add(d.id); out.push(d); }
  }
  return out;
};

// ═════════════════════════════════════════════════════════════════════════════════════════════
(async () => {
  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("1 · Vertrag der Kantenrelation (paarweise und kontextfrei)");
  {
    // Das ist die Grundlage jeder weiteren Aussage: `docsShareEvent(a,b)` haengt AUSSCHLIESSLICH
    // von a und b ab. Daraus folgt, dass die globale Buendelung die Kanten nicht neu erfindet —
    // sie kann nur Kanten WIRKSAM werden lassen, die es paarweise ohnehin gibt.
    const alle = FAMILIEN.flatMap(alleDokumente);
    let paare = 0;
    let stabil = 0;
    for (let i = 0; i < alle.length; i += 1) {
      for (let j = i + 1; j < alle.length; j += 1) {
        paare += 1;
        const a = V.docsShareEvent(alle[i], alle[j]).gleich;
        const b = V.docsShareEvent(alle[j], alle[i]).gleich;                        // symmetrisch?
        const c = V.docsShareEvent(alle[i], alle[j], {}).gleich;                    // ohne Kontext gleich?
        if (a === b && a === c) stabil += 1;
      }
    }
    check("1.1 die Kantenrelation ist symmetrisch und kontextfrei (alle Paare des Korpus)",
      stabil === paare, `${stabil}/${paare}`);
    info(`Kantenpruefung ueber ${paare} Dokumentpaare`);

    // Die Kante haengt NICHT an source_id/source_name: `docAnchors` liest Titel + Kurzfassung.
    // Damit kann die Herkunftsquelle eine Zusammenfuehrung weder ausloesen noch verhindern —
    // wichtig, weil im globalen Batch Dokumente fremder Mandatsquellen erstmals aufeinandertreffen.
    const q1 = { ...FAMILIEN[0].mandate.A[0], source_id: "quelle-x", source_name: "Quelle X" };
    const q2 = { ...FAMILIEN[0].mandate.A[0], id: "kopie", source_id: "quelle-y", source_name: "Quelle Y" };
    // Gegenprobe in beide Richtungen: dieselbe Quelle darf zwei fachfremde Dokumente NICHT
    // verbinden. Ohne diese Richtung waere die Zusage nur halb geprueft — und genau ueber die
    // Quellenkennung wuerde im globalen Batch jeder Feed zu einem eigenen Sammelvorgang.
    const gleicheQuelle = (id, titel, text) => dok(id, "pressestelle-bundestag", titel, text, t(9));
    check("1.2 die Quellenkennung beeinflusst die Kante nicht — weder verbindend noch trennend",
      V.docsShareEvent(q1, q2).gleich === true
      && V.docsShareEvent(
        gleicheQuelle("sq-1", "Klimageld: Kabinett vertagt die Entscheidung",
          "Das Kabinett hat die Auszahlung des Klimageldes vertagt."),
        gleicheQuelle("sq-2", "Seenotrettung: Plenum debattiert das Mittelmeer",
          "Das Plenum debattiert die Seenotrettung im Mittelmeer.")
      ).gleich === false);

    check("1.3 `clusterRawDocuments` bildet Zusammenhangskomponenten (Transitivitaet ist wirksam)",
      (() => {
        const f12 = FAMILIEN.find((f) => f.id === "F12");
        const [x, y] = f12.mandate.A;
        const [z] = f12.mandate.B;
        const xy = V.docsShareEvent(x, y).gleich;
        const yz = V.docsShareEvent(y, z).gleich;
        const xz = V.docsShareEvent(x, z).gleich;
        const cl = V.clusterRawDocuments([x, y, z]);
        return xy && yz && !xz && cl.length === 1 && cl[0].documents.length === 3;
      })(),
      "x~y und y~z, aber x!~z — trotzdem EIN Cluster");
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("2 · Partition und Vollstaendigkeit — kein Dokument geht verloren");
  {
    let partitionOk = true;
    let details = "";
    for (const fam of FAMILIEN) {
      for (const menge of [alleDokumente(fam), ...Object.values(fam.mandate)]) {
        const cl = V.clusterRawDocuments(menge);
        const ids = cl.flatMap((c) => c.documents.map((d) => d.id));
        const eingang = [...new Set(menge.map((d) => d.id))].sort();
        if (ids.length !== new Set(ids).size || ids.slice().sort().join(",") !== eingang.join(",")) {
          partitionOk = false; details = `${fam.id}: ${ids.join(",")} != ${eingang.join(",")}`;
        }
      }
    }
    check("2.1 `clusterRawDocuments` ist eine PARTITION: jedes Dokument genau einmal, keines fehlt",
      partitionOk, details);

    const gesamt = FAMILIEN.flatMap(alleDokumente);
    const clAlle = V.clusterRawDocuments(gesamt);
    check("2.2 auch ueber den GESAMTEN Korpus (alle Familien in EINEM Batch) bleibt es eine Partition",
      clAlle.flatMap((c) => c.documents.map((d) => d.id)).sort().join(",")
      === [...new Set(gesamt.map((d) => d.id))].sort().join(","));

    check("2.3 die leere Menge ergibt keine Cluster (kein erfundener Vorgang)",
      V.clusterRawDocuments([]).length === 0 && V.clusterRawDocuments(null).length === 0);

    check("2.4 jedes Dokument erhaelt in BEIDEN Pfaden eine Verknuepfung (Verknuepfungsinvariante)",
      await (async () => {
        for (const fam of FAMILIEN) {
          const batches = entdoppelt(Object.values(fam.mandate));
          const alt = await altPfad(batches);
          const neu = await neuPfad(batches);
          const soll = alleDokumente(fam).map((d) => d.id).sort().join(",");
          if ([...alt.ablage.zuordnung().keys()].sort().join(",") !== soll) return false;
          if ([...neu.ablage.zuordnung().keys()].sort().join(",") !== soll) return false;
        }
        return true;
      })());

    check("2.5 kein Dokument haengt an ZWEI Vorgaengen (keine doppelten Vorgaenge je Dokument)",
      await (async () => {
        for (const fam of FAMILIEN) {
          const batches = entdoppelt(Object.values(fam.mandate));
          for (const lauf of [await altPfad(batches), await neuPfad(batches)]) {
            for (const vids of lauf.ablage.zuordnung().values()) if (vids.size !== 1) return false;
          }
        }
        return true;
      })());
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("3 · Die geforderten Fallfamilien durch BEIDE Pfade");
  const ERGEBNISSE = [];
  {
    for (const fam of FAMILIEN) {
      const batches = entdoppelt(Object.values(fam.mandate));
      const alt = await altPfad(batches);
      const neu = await neuPfad(batches);
      const gAlt = gruppierung(alt.ablage);
      const gNeu = gruppierung(neu.ablage);
      const gleich = JSON.stringify(gAlt) === JSON.stringify(gNeu);
      ERGEBNISSE.push({ fam, alt, neu, gAlt, gNeu, gleich });
      info(`${fam.id} ${fam.titel}`);
      info(`     fachlich richtig: ${fam.soll}`);
      info(`     ALT  ${JSON.stringify(gAlt)}  (KI ${alt.ablage.kiAufrufe()})`);
      info(`     NEU  ${JSON.stringify(gNeu)}  (KI ${neu.ablage.kiAufrufe()})`);
      info(`     Gruppierung gleich: ${gleich}`);
    }
    const abweichend = ERGEBNISSE.filter((e) => !e.gleich).map((e) => e.fam.id);
    check("3.1 mindestens eine Familie zeigt eine ABWEICHENDE Gruppierung (K1-1 ist real)",
      abweichend.length > 0, JSON.stringify(abweichend));
    info(`abweichende Familien: ${JSON.stringify(abweichend)}`);

    // Strukturbeweis fuer die Reichweite: Dokumente GETEILTER Quellen liegen heute ohnehin
    // vollstaendig im Batch des ERSTEN Mandats (globale Rohdokument-Entdoppelung). Fuer sie ist
    // der globale Batch identisch mit dem heutigen — die Buendelung kann sich nicht aendern.
    const nurGeteilt = [
      dok("sh-1", "bt-drucksachen", "Gesetzentwurf zur Rentenanpassung — Drucksache 21/2222",
        "Die Bundesregierung legt den Gesetzentwurf zur Rentenanpassung vor. Drucksache 21/2222 regelt die Rentenformel.", t(6)),
      dok("sh-2", "bt-drucksachen", "Rentenanpassung: Bundesrat beraet den Gesetzentwurf",
        "Der Bundesrat beraet den Gesetzentwurf zur Rentenanpassung und die geaenderte Rentenformel.", t(7)),
      dok("sh-3", "tagesschau", "Klimageld: Kabinett vertagt die Entscheidung",
        "Das Kabinett hat die Entscheidung ueber das Klimageld vertagt.", t(8))
    ];
    // Beide Mandate rufen dieselben geteilten Quellen ab — nach der Entdoppelung sieht nur A sie.
    const geteiltBatches = entdoppelt([nurGeteilt, nurGeteilt]);
    const geteiltAlt = await altPfad(geteiltBatches);
    const geteiltNeu = await neuPfad(geteiltBatches);
    check("3.2 bei ausschliesslich GETEILTEN Quellen sind beide Pfade deckungsgleich (Reichweite von K1-1)",
      JSON.stringify(gruppierung(geteiltAlt.ablage)) === JSON.stringify(gruppierung(geteiltNeu.ablage))
      && geteiltBatches[1].length === 0,
      JSON.stringify({ alt: gruppierung(geteiltAlt.ablage), neu: gruppierung(geteiltNeu.ablage) }));
    check("3.3 jede abweichende Familie enthaelt mindestens eine MANDATSEIGENE Quelle",
      ERGEBNISSE.filter((e) => !e.gleich).every((e) => Object.values(e.fam.mandate).flat()
        .some((d) => /^(mandat-|fraktion-|ausschuss-)/.test(String(d.source_id)))),
      "K1-1 wirkt nur dort, wo Dokumente heute in verschiedenen Batches liegen");

    // Die Bilanz der Abweichungen, ehrlich in beide Richtungen sortiert.
    const besser = ERGEBNISSE.filter((e) => !e.gleich && !e.fam.sollGetrennt && e.gNeu.length === 1);
    const schlechter = ERGEBNISSE.filter((e) => !e.gleich && e.fam.sollGetrennt && e.gNeu.length === 1);
    const anders = ERGEBNISSE.filter((e) => !e.gleich && !besser.includes(e) && !schlechter.includes(e));
    check("3.4 die Abweichungen gehen in BEIDE Richtungen (weder durchweg besser noch durchweg schlechter)",
      besser.length > 0 && schlechter.length > 0,
      JSON.stringify({ besser: besser.map((e) => e.fam.id), schlechter: schlechter.map((e) => e.fam.id) }));
    info(`Bilanz — NEU fachlich BESSER: ${JSON.stringify(besser.map((e) => e.fam.id))}`
      + ` · NEU fachlich SCHLECHTER: ${JSON.stringify(schlechter.map((e) => e.fam.id))}`
      + ` · nur andere Einteilung: ${JSON.stringify(anders.map((e) => e.fam.id))}`);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("4 · Phase-3-Beweise je Fall");
  {
    // (a) Was fachlich EIN Vorgang ist, bleibt im globalen Pfad EIN Vorgang.
    //     F13 ist ausgenommen: dort geht es nicht um EIN Ereignis, sondern um die Frage, ob
    //     eine bereits gebildete Mandatsgruppierung erhalten bleibt (Teilbefund K1-1b, 4.2).
    const zusammen = ERGEBNISSE.filter((e) => !e.fam.sollGetrennt && e.fam.id !== "F13");
    check("4.1 gleicher Vorgang bleibt gleich: jede Familie mit fachlich EINEM Vorgang ergibt global EINEN",
      zusammen.every((e) => e.gNeu.length === 1),
      JSON.stringify(zusammen.filter((e) => e.gNeu.length !== 1).map((e) => e.fam.id)));
    info(`geprueft: ${zusammen.map((e) => e.fam.id).join(", ")}`);

    // (b) F13 ist die Ausnahme — und zwar eine BELEGTE, keine uebersehene.
    const f13 = ERGEBNISSE.find((e) => e.fam.id === "F13");
    check("4.2 BEFUND K1-1b: bei F13 TRENNT die globale Buendelung, was mandatsweise EIN Vorgang war",
      f13.gAlt.includes("f13-m1,f13-m2") && !f13.gNeu.includes("f13-m1,f13-m2")
      && f13.gNeu.includes("f13-m1"),
      `ALT ${JSON.stringify(f13.gAlt)} NEU ${JSON.stringify(f13.gNeu)}`);

    // (c) Verschiedene Vorgaenge verschmelzen NICHT — im globalen Pfad nachweislich DOCH.
    const getrennt = ERGEBNISSE.filter((e) => e.fam.sollGetrennt);
    const verschmolzen = getrennt.filter((e) => e.gNeu.length === 1);
    check("4.3 BEFUND K1-1a: fachlich VERSCHIEDENE Vorgaenge verschmelzen im globalen Pfad",
      verschmolzen.length > 0, JSON.stringify(verschmolzen.map((e) => e.fam.id)));
    info(`global verschmolzen, obwohl fachlich getrennt: ${JSON.stringify(verschmolzen.map((e) => e.fam.id))}`);
    info(`fachlich getrennt UND global getrennt geblieben: `
      + JSON.stringify(getrennt.filter((e) => e.gNeu.length > 1).map((e) => e.fam.id)));

    // (d) Kein Dokumentverlust, kein KO-Verlust, keine doppelten Vorgaenge — in BEIDEN Pfaden.
    check("4.4 kein Dokument geht verloren (beide Pfade, alle Familien)",
      ERGEBNISSE.every((e) => {
        const soll = alleDokumente(e.fam).length;
        return e.alt.ablage.zuordnung().size === soll && e.neu.ablage.zuordnung().size === soll;
      }));
    check("4.5 kein Wissensobjekt verschwindet: jeder gebildete Cluster fuehrt zu einem Vorgang",
      ERGEBNISSE.every((e) => e.alt.protokoll.every((p) => p.vorgangId)
        && e.neu.protokoll.every((p) => p.vorgangId)));
    check("4.6 keine doppelten Vorgaenge: keine zwei Kennungen fuer dieselbe Dokumentmenge",
      ERGEBNISSE.every((e) => {
        for (const lauf of [e.alt, e.neu]) {
          const mengen = new Map();
          for (const [dokId, vids] of lauf.ablage.zuordnung().entries()) {
            for (const v of vids) {
              if (!mengen.has(v)) mengen.set(v, []);
              mengen.get(v).push(dokId);
            }
          }
          const sigs = [...mengen.values()].map((x) => x.sort().join(","));
          if (sigs.length !== new Set(sigs).size) return false;
        }
        return true;
      }));

    // (e) Kosten: die globale Buendelung kostet nie mehr KI-Aufrufe.
    const teurer = ERGEBNISSE.filter((e) => e.neu.ablage.kiAufrufe() > e.alt.ablage.kiAufrufe());
    check("4.7 die globale Buendelung braucht in keiner Familie MEHR KI-Aufrufe als die mandatsweise",
      teurer.length === 0, JSON.stringify(teurer.map((e) => e.fam.id)));
    const kAlt = ERGEBNISSE.reduce((s, e) => s + e.alt.ablage.kiAufrufe(), 0);
    const kNeu = ERGEBNISSE.reduce((s, e) => s + e.neu.ablage.kiAufrufe(), 0);
    info(`KI-Aufrufe ueber alle Familien: ALT ${kAlt} · NEU ${kNeu}`);
    // MESSWERTRIEGEL: die Suite ist vollstaendig deterministisch, also ist die Zahl der
    // KI-Aufrufe ein reproduzierbarer Messwert. Er wird hier festgeschrieben, damit eine
    // Kostenaenderung an der Vorgangsbildung nicht unbemerkt durchgeht.
    check("4.7b gemessene KI-Aufrufe unveraendert: ALT 24 · NEU 14 (deterministischer Messwert)",
      kAlt === 24 && kNeu === 14, `ALT ${kAlt} · NEU ${kNeu}`);

    // (f) Mandantentrennung: Wissensobjekte tragen KEINEN Mandantenbezug — in beiden Pfaden.
    check("4.8 kein Wissensobjekt traegt einen Mandantenbezug (Mandantentrennung unveraendert)",
      ERGEBNISSE.every((e) => [...e.alt.ablage.kos.values(), ...e.neu.ablage.kos.values()]
        .every((ko) => ko.user_id === undefined && ko.politician_id === undefined
          && ko.politicianId === undefined && ko.tenant === undefined)));

    // (g) Matching/Entscheidungen/Briefing/Lage lesen den Vorgang ueber `vorgang_id` + die
    //     verknuepften Dokumente. Beides existiert in beiden Pfaden vollstaendig — was sich
    //     aendert, ist ausschliesslich die EINTEILUNG. Das ist die ehrliche Formulierung:
    //     „Matching bleibt korrekt" gilt fuer den MECHANISMUS, nicht fuer das ERGEBNIS.
    check("4.9 jeder Vorgang traegt eine Kennung im vereinbarten Format `vg-<wurzel>[-<tag>-<pruefsumme>]`",
      ERGEBNISSE.every((e) => [...e.alt.ablage.kos.keys(), ...e.neu.ablage.kos.keys()]
        .every((v) => /^vg-[a-z0-9äöüß-]+$/.test(String(v)))));
    check("4.10 jede Kennung ist unter ihrem eigenen Suchpraefix auffindbar (Resolver bleibt anschlussfaehig)",
      ERGEBNISSE.every((e) => e.neu.protokoll.every((p) => {
        const wurzel = String(p.vorgangId).replace(/^vg-/, "").split("-")[0];
        return String(p.vorgangId).startsWith(V.vorgangPrefix(wurzel));
      })));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("5 · Adversariale Proben");
  {
    const gesamt = FAMILIEN.flatMap(alleDokumente);

    // 5.1 Dokumentreihenfolge im globalen Batch
    const basis = clusterSignatur(gesamt);
    let reihenfolgeStabil = true;
    let abweichungBei = null;
    for (let i = 0; i < 120 && reihenfolgeStabil; i += 1) {
      const k = i % gesamt.length;
      const rotiert = [...gesamt.slice(k), ...gesamt.slice(0, k)];
      const kandidat = (i % 3 === 0) ? rotiert.slice().reverse()
        : (i % 3 === 1) ? rotiert
          : rotiert.slice().sort((a, b) => String(b.id).localeCompare(String(a.id)));
      if (clusterSignatur(kandidat) !== basis) { reihenfolgeStabil = false; abweichungBei = i; }
    }
    check("5.1 Dokumentreihenfolge: 120 deterministische Permutationen ergeben dieselbe Buendelung",
      reihenfolgeStabil, `Abweichung bei Permutation ${abweichungBei}`);

    // 5.2 Quellenreihenfolge (nach source_id sortiert, auf- und absteigend)
    const nachQuelle = (dir) => gesamt.slice().sort((a, b) =>
      dir * String(a.source_id).localeCompare(String(b.source_id)) || String(a.id).localeCompare(String(b.id)));
    check("5.2 Quellenreihenfolge: auf- und absteigend nach Quelle sortiert aendert nichts",
      clusterSignatur(nachQuelle(1)) === basis && clusterSignatur(nachQuelle(-1)) === basis);

    // 5.3 Mandatsreihenfolge im globalen Pfad
    check("5.3 Mandatsreihenfolge: A-dann-B und B-dann-A ergeben im globalen Pfad dieselbe Gruppierung",
      await (async () => {
        for (const fam of FAMILIEN) {
          const mandate = Object.values(fam.mandate);
          const vw = gruppierung((await neuPfad(entdoppelt(mandate))).ablage);
          const rw = gruppierung((await neuPfad(entdoppelt(mandate.slice().reverse()))).ablage);
          if (JSON.stringify(vw) !== JSON.stringify(rw)) return false;
        }
        return true;
      })());

    // 5.4 Mandatsreihenfolge im ALTEN Pfad — hier ist sie NICHT gleichgueltig. Das ist ein
    //     Bestandsbefund und zugleich das Gegenargument gegen „heute ist es stabil":
    //     welches Mandat zuerst laeuft, entscheidet heute mit ueber die Vorgangsbildung.
    const altOrdnungsAbhaengig = await (async () => {
      const abweichend = [];
      for (const fam of FAMILIEN) {
        const mandate = Object.values(fam.mandate);
        const vw = gruppierung((await altPfad(entdoppelt(mandate))).ablage);
        const rw = gruppierung((await altPfad(entdoppelt(mandate.slice().reverse()))).ablage);
        if (JSON.stringify(vw) !== JSON.stringify(rw)) abweichend.push(fam.id);
      }
      return abweichend;
    })();
    check("5.4 der ALTE Pfad ist von der Mandatsreihenfolge abhaengig (Bestandsbefund, belegt)",
      altOrdnungsAbhaengig.length > 0, JSON.stringify(altOrdnungsAbhaengig));
    info(`ALT reihenfolgeabhaengige Familien: ${JSON.stringify(altOrdnungsAbhaengig)}`
      + " — NEU ist in allen Familien reihenfolgeunabhaengig (5.3)");

    // 5.5 Kuenstliche Duplikate: dasselbe Dokument mehrfach im Batch
    check("5.5 erzwungene Duplikate (dieselbe Kennung mehrfach) erzeugen keinen zweiten Vorgang",
      await (async () => {
        const f = FAMILIEN[0];
        const doppelt = [...alleDokumente(f), ...alleDokumente(f), ...alleDokumente(f)];
        const lauf = await laufe([doppelt]);
        const z = lauf.ablage.zuordnung();
        return z.size === alleDokumente(f).length && [...z.values()].every((s) => s.size === 1);
      })());

    // 5.6 Inhaltsgleiche Dokumente mit VERSCHIEDENEN Kennungen (zwei Quellen, gleicher Text)
    check("5.6 inhaltsgleiche Dokumente unter zwei Kennungen landen in EINEM Vorgang",
      (() => {
        const f2 = FAMILIEN.find((f) => f.id === "F2");
        return V.clusterRawDocuments(alleDokumente(f2)).length === 1;
      })());

    // 5.7 Der Versuch, K1-1 kaputtzumachen: Kann die globale Buendelung ein Dokument
    //     VOLLSTAENDIG verlieren, wenn man Zeit, Kennung und Text feindlich waehlt?
    const feindlich = [
      dok("adv-1", "q1", "", "", t(1)),                                   // leerer Text
      dok("adv-2", "q2", "A", "B", t(1)),                                 // zu kurz fuer Anker
      { id: "adv-3", title: "Ohne Zeitangabe", summary: "Kein published_at.", source_id: "q3" },
      dok("adv-4", "q4", "2026 2026 2026", "2026", t(1)),                 // nur Jahreszahlen
      dok("adv-5", "q5", "Der die das und oder aber", "Wegen gegen unter ueber", t(1))
    ];
    const advCl = V.clusterRawDocuments(feindlich);
    check("5.7 feindliche Dokumente (leer, zu kurz, ohne Zeit, nur Jahreszahlen, nur Fuellwoerter) gehen nicht verloren",
      advCl.flatMap((c) => c.documents.map((d) => d.id)).sort().join(",") === "adv-1,adv-2,adv-3,adv-4,adv-5");
    check("5.8 auch fuer ein Dokument ohne Themenwurzel entsteht eine Kennung (kein stiller Ausfall)",
      advCl.every((c) => /^vg-/.test(V.deriveVorgangId(c))));

    // 5.9 Sicherheitsventil: eine sehr grosse globale Komponente wird NICHT zum Digest-Cluster.
    const gross = [];
    for (let i = 0; i < 90; i += 1) {
      gross.push(dok(`gr-${String(i).padStart(3, "0")}`, `q${i % 7}`,
        `Vergaberecht: Bericht Nummer ${i}`,
        "Das Vergaberecht des Bundes wird nach Ansicht von Fachleuten unterschiedlich angewendet.",
        `2026-07-${String(20 + (i % 5)).padStart(2, "0")}T08:00:00Z`));
    }
    const grossCl = V.clusterRawDocuments(gross);
    check("5.9 eine 90-Dokumente-Komponente wird auf hoechstens MAX_CLUSTER_DOKUMENTE begrenzt",
      grossCl.every((c) => c.documents.length <= V.MAX_CLUSTER_DOKUMENTE)
      && grossCl.flatMap((c) => c.documents.map((d) => d.id)).length === 90,
      JSON.stringify(grossCl.map((c) => c.documents.length)));
    info(`Sicherheitsventil: 90 Dokumente -> ${grossCl.length} Cluster `
      + `(${grossCl.map((c) => c.documents.length).join("/")}), Obergrenze ${V.MAX_CLUSTER_DOKUMENTE}`);

    // 5.10 Der globale Batch ist groesser — die Buendelung derselben Dokumente faellt deshalb
    //      anders aus als mandatsweise. Das ist der SKALIERUNGSTEIL von K1-1: mit jedem
    //      zusaetzlichen Mandat waechst der Batch, und die Einteilung wird dadurch nicht
    //      stabiler, sondern anders.
    const haelfteA = gross.filter((_, i) => i % 2 === 0);
    const haelfteB = gross.filter((_, i) => i % 2 === 1);
    const clA = V.clusterRawDocuments(haelfteA);
    const clB = V.clusterRawDocuments(haelfteB);
    const groessteMandatsgruppe = Math.max(...clA.map((c) => c.documents.length), ...clB.map((c) => c.documents.length));
    const groessteGlobal = Math.max(...grossCl.map((c) => c.documents.length));
    check("5.10 dieselben Dokumente ergeben mandatsweise eine ANDERE Einteilung als global",
      clA.length + clB.length !== grossCl.length
      || clA.map((c) => c.documents.length).join() !== grossCl.map((c) => c.documents.length).join(),
      `A ${clA.map((c) => c.documents.length).join("/")} · B ${clB.map((c) => c.documents.length).join("/")} · global ${grossCl.map((c) => c.documents.length).join("/")}`);
    info(`Skalierung: mandatsweise 2x45 -> ${clA.length}+${clB.length} Cluster `
      + `(groesster ${groessteMandatsgruppe}) · global 90 -> ${grossCl.length} Cluster (groesster ${groessteGlobal})`);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("6 · Befund K1-1 — die drei Teilbefunde als Regressionsriegel");
  {
    // Diese Pruefungen verankern GEMESSENES Verhalten. Aendert sich eines davon, ist das kein
    // Zufall, sondern eine bewusste Korrektur — und diese Suite meldet sie.
    const f9 = ERGEBNISSE.find((e) => e.fam.id === "F9");
    const f10 = ERGEBNISSE.find((e) => e.fam.id === "F10");
    const f11 = ERGEBNISSE.find((e) => e.fam.id === "F11");
    const f12 = ERGEBNISSE.find((e) => e.fam.id === "F12");
    const f13 = ERGEBNISSE.find((e) => e.fam.id === "F13");

    check("6.1 K1-1a ZUSAMMENFUEHRUNG · zwei Personenquellen, zwei Ereignisse: ALT getrennt, NEU EIN Vorgang",
      f9.gAlt.length === 2 && f9.gNeu.length === 1, `ALT ${JSON.stringify(f9.gAlt)} NEU ${JSON.stringify(f9.gNeu)}`);
    check("6.2 K1-1a ZUSAMMENFUEHRUNG · zwei Parteiquellen, zwei Themen: ALT getrennt, NEU EIN Vorgang",
      f11.gAlt.length === 2 && f11.gNeu.length === 1, `ALT ${JSON.stringify(f11.gAlt)} NEU ${JSON.stringify(f11.gNeu)}`);
    check("6.3 K1-1c KETTE · x~y~z mit x!~z: ALT zwei Vorgaenge, NEU einer",
      f12.gAlt.length === 2 && f12.gNeu.length === 1, `ALT ${JSON.stringify(f12.gAlt)} NEU ${JSON.stringify(f12.gNeu)}`);
    check("6.4 K1-1b TRENNUNG · die Kernanker-Nachpruefung ist nicht monoton: NEU trennt f13-m1 heraus",
      f13.gNeu.includes("f13-m1") && f13.gAlt.includes("f13-m1,f13-m2"),
      `ALT ${JSON.stringify(f13.gAlt)} NEU ${JSON.stringify(f13.gNeu)}`);
    check("6.5 GEGENPROBE · zwei Ausschussquellen mit gleichem Formular verschmelzen in BEIDEN Pfaden",
      f10.gAlt.length === 1 && f10.gNeu.length === 1,
      "der Fehler ist NICHT von K1 eingefuehrt — er ist Bestand und wird nur breiter wirksam");

    // Die zentrale Aussage aus `docs/betrieb/cron-globalphase.md` §8 wird hier direkt geprueft:
    // „alle Kennungen teilen dasselbe Suchpraefix, `sameVorgang` haelt sie fuer denselben
    // Vorgang". Das gilt fuer das dort gemessene Beispiel — aber NICHT allgemein.
    const f1 = FAMILIEN.find((f) => f.id === "F1");
    const [amt] = f1.mandate.A;
    const person = f1.mandate.B[1];
    const clGlobal = V.clusterRawDocuments([amt, person]);
    const clEinzeln = [V.clusterRawDocuments([amt])[0], V.clusterRawDocuments([person])[0]];
    check("6.6 §8-Aussage bestaetigt fuer den dort gemessenen Fall (gemeinsames Suchpraefix)",
      V.candidatePrefixes(clGlobal[0], 3).some((p) => V.candidatePrefixes(clEinzeln[0], 3).includes(p))
      && V.candidatePrefixes(clGlobal[0], 3).some((p) => V.candidatePrefixes(clEinzeln[1], 3).includes(p)),
      JSON.stringify({
        global: V.candidatePrefixes(clGlobal[0], 3),
        amt: V.candidatePrefixes(clEinzeln[0], 3),
        person: V.candidatePrefixes(clEinzeln[1], 3)
      }));
    check("6.7 §8-Aussage gilt NICHT allgemein: bei F9 haben die beiden Mandatscluster KEIN gemeinsames Praefix",
      (() => {
        const f9fam = FAMILIEN.find((f) => f.id === "F9");
        const a = V.clusterRawDocuments(f9fam.mandate.A)[0];
        const b = V.clusterRawDocuments(f9fam.mandate.B)[0];
        const pa = V.candidatePrefixes(a, 3);
        const pb = V.candidatePrefixes(b, 3);
        return !pa.some((p) => pb.includes(p));
      })(),
      "genau deshalb trennt der ALTE Pfad sie — der Resolver sieht sie nie als Kandidaten");

    // Die fachliche Folge, ausgeschrieben: ein verschmolzener Vorgang ist EIN Wissensobjekt mit
    // EINER Ueberschrift, EINER Empfehlung und EINER Entscheidung. Kein Dokument fehlt — aber
    // der zweite politische Vorgang hat danach keine eigene Entscheidung mehr. Das ist die
    // Fehlerklasse „Digest-Cluster" aus Betriebsbefund B4 / Rollbackfall F-3.
    check("6.8 FOLGE · bei F9 entsteht global genau EIN Wissensobjekt fuer ZWEI politische Vorgaenge",
      f9.neu.ablage.kos.size === 1 && f9.alt.ablage.kos.size === 2,
      `ALT ${f9.alt.ablage.kos.size} KO · NEU ${f9.neu.ablage.kos.size} KO`);
    check("6.9 FOLGE · dieses eine Wissensobjekt traegt trotzdem BEIDE Dokumente (nichts verschwindet)",
      [...f9.neu.ablage.links.values()].reduce((s, m) => s + m.size, 0) === 2);
    info("Bewertung: technisch verlustfrei, fachlich ein Verlust an Entscheidungsschaerfe — "
      + "der zweite Vorgang hat keine eigene Ueberschrift und keine eigene Empfehlung mehr.");
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("7 · Zwei-Regime-Nachweis (die Ursache von K1-1)");
  {
    // Das LOSE Regime (innerhalb eines Batches) und das STRENGE Regime (zwischen Batches)
    // werden hier direkt gegeneinander gehalten — an DENSELBEN Dokumenten.
    const faelle = FAMILIEN.filter((f) => f.sollGetrennt);
    const zeilen = [];
    for (const fam of faelle) {
      const a = V.clusterRawDocuments(fam.mandate.A);
      const b = V.clusterRawDocuments(fam.mandate.B);
      if (!a.length || !b.length) continue;
      const kante = V.clusterRawDocuments(alleDokumente(fam)).length === 1;                  // loses Regime
      const praefixTreffer = V.candidatePrefixes(b[0], 3).some((p) => V.candidatePrefixes(a[0], 3).includes(p));
      const urteil = V.sameVorgang(b[0], {
        vorgangId: V.deriveVorgangId(a[0]), documents: a[0].documents
      });
      const streng = praefixTreffer && urteil.gleich;                                        // strenges Regime
      zeilen.push({ id: fam.id, lose: kante, praefix: praefixTreffer, sameVorgang: urteil.gleich, grund: urteil.grund, streng });
    }
    for (const z of zeilen) {
      info(`${z.id}  loses Regime (Batch): ${z.lose ? "ZUSAMMEN" : "getrennt"}`
        + `  ·  strenges Regime (Bestand): ${z.streng ? "ZUSAMMEN" : "getrennt"}`
        + `  [Praefixtreffer ${z.praefix}, sameVorgang ${z.sameVorgang}${z.grund ? ` (${z.grund})` : ""}]`);
    }
    check("7.1 es gibt Faelle, in denen das lose Regime ZUSAMMENFUEHRT und das strenge TRENNT",
      zeilen.some((z) => z.lose && !z.streng),
      JSON.stringify(zeilen.filter((z) => z.lose && !z.streng).map((z) => z.id)));
    check("7.2 der umgekehrte Fall (streng fuehrt zusammen, lose trennt) kommt im Korpus NICHT vor",
      !zeilen.some((z) => !z.lose && z.streng));
    check("7.3 das strenge Regime trennt hier ueber die PRAEFIXSUCHE, nicht ueber `sameVorgang`",
      zeilen.some((z) => z.lose && !z.praefix),
      JSON.stringify(zeilen.filter((z) => z.lose && !z.praefix).map((z) => z.id)));
    // Das ist der unbequeme Teil und der Grund, warum die §8-Bewertung aus K1 nicht traegt:
    // in genau den Faellen, die der alte Pfad trennt, wuerde `sameVorgang` sie ZUSAMMENFUEHREN.
    // Der heutige Schutz ist also kein fachliches Urteil, sondern die Enge der Kandidatensuche.
    check("7.4 in den heute getrennten Faellen wuerde `sameVorgang` selbst ZUSAMMENFUEHREN",
      zeilen.filter((z) => z.lose && !z.praefix).every((z) => z.sameVorgang === true),
      JSON.stringify(zeilen.filter((z) => z.lose && !z.praefix).map((z) => ({ id: z.id, sameVorgang: z.sameVorgang }))));
    info("Folge: die globale Buendelung verschiebt Dokumente MANDATSEIGENER Quellen aus dem "
      + "strengen in das lose Regime. Genau das ist K1-1.");
    info("Und: der heutige Schutz vor diesen Zusammenfuehrungen ist die enge Praefixsuche, "
      + "nicht der Belegvergleich — `sameVorgang` wuerde sie ebenfalls zusammenfuehren (7.4).");
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("8 · Formularvokabular — gemessene Wirkung einer moeglichen Nachschaerfung");
  {
    // NUR MESSUNG, KEINE AENDERUNG. `GENERISCHE_ANKER` wird in einem eigenen Prozessabschnitt
    // temporaer erweitert und danach exakt zurueckgesetzt; das Repository bleibt unveraendert.
    // Zweck: dem Betreiber eine BELEGTE Option an die Hand geben statt einer Vermutung.
    const ZUSATZ = [
      "antrag", "antraege", "antraegen", "drucksache", "drucksachen", "fraktion", "fraktionen",
      "beantragt", "beantragen", "betrifft", "ausschuss", "ausschuesse", "sachverstaendige",
      "sachverstaendigen", "tagesordnung", "abgeordnete", "abgeordneter", "abgeordneten",
      "besuch", "besucht", "besuchte", "sprach", "kuendigt", "angekuendigt", "veroeffentlicht",
      "oeffentliche", "oeffentlichen", "fuehrt", "fuehren", "durch", "wurde", "wurden"
    ];
    const messe = () => FAMILIEN.map((f) => ({
      id: f.id,
      getrennt: V.clusterRawDocuments(alleDokumente(f)).length > 1,
      soll: Boolean(f.sollGetrennt)
    }));
    // F13 misst die Trennung eines Mandatsvorgangs, nicht eine Ereignistrennung — ausgenommen.
    const bewertbar = (liste) => liste.filter((r) => r.id !== "F13");
    const vorher = messe();
    const trefferVorher = bewertbar(vorher).filter((r) => r.getrennt === r.soll).length;
    const gesichert = new Set([...V.GENERISCHE_ANKER]);
    for (const w of ZUSATZ) V.GENERISCHE_ANKER.add(w);
    const nachher = messe();
    const trefferNachher = bewertbar(nachher).filter((r) => r.getrennt === r.soll).length;
    // exakt zuruecksetzen
    for (const w of [...V.GENERISCHE_ANKER]) if (!gesichert.has(w)) V.GENERISCHE_ANKER.delete(w);

    check("8.1 die Messung hat `GENERISCHE_ANKER` exakt wiederhergestellt (kein Seiteneffekt)",
      V.GENERISCHE_ANKER.size === gesichert.size
      && [...gesichert].every((w) => V.GENERISCHE_ANKER.has(w)));
    check("8.2 nach der Wiederherstellung ist das Verhalten wieder das gemessene Ausgangsverhalten",
      JSON.stringify(messe()) === JSON.stringify(vorher));
    check("8.3 eine rein AUFGEZAEHLTE Formularliste wuerde die Fehlverschmelzungen messbar senken",
      trefferNachher > trefferVorher,
      `${trefferVorher}/${bewertbar(vorher).length} -> ${trefferNachher}/${bewertbar(nachher).length}`);
    info(`Formularliste (${ZUSATZ.length} Woerter, Experiment): korrekte Trennung `
      + `${trefferVorher}/${bewertbar(vorher).length} -> ${trefferNachher}/${bewertbar(nachher).length}`);
    info("NICHT umgesetzt: die Aenderung wirkt SOFORT und OHNE Flag auf die aktive "
      + "Vorgangsbildung beider Pfade und ist deshalb eine Freigabeentscheidung (CLAUDE.md §5).");
    const falschGetrennt = bewertbar(nachher).filter((r) => r.getrennt && !r.soll).map((r) => r.id);
    check("8.4 die Formularliste trennt keinen fachlich ZUSAMMENGEHOERIGEN Fall auseinander",
      falschGetrennt.length === 0, JSON.stringify(falschGetrennt));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("9 · Sicherheitsgrenzen");
  {
    check("9.1 das Flag `HELMUT_CRON_GLOBALPHASE` ist ohne ausdrueckliche Zusage AUS",
      G.globalPhaseEnabled({}) === false
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "" }) === false
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "onn" }) === false
      && G.globalPhaseEnabled({ HELMUT_CRON_GLOBALPHASE: "off" }) === false);
    check("9.2 dieser Sprint hat das Flag NICHT in die Datei-Allowlist aufgenommen",
      !fs.readFileSync(path.join(ROOT, "helmut-flags.json"), "utf8").includes("HELMUT_CRON_GLOBALPHASE"));
    check("9.3 `vercel.json` (Cron-Zeiten) enthaelt keinen Bezug auf die Globalphase",
      !fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8").includes("GLOBALPHASE"));
    check("9.4 die Buendelungslogik selbst ist unveraendert: `MIN_BEWEISGEWICHT` = 2, `MAX_CLUSTER_DOKUMENTE` = 60",
      V.MIN_BEWEISGEWICHT === 2 && V.MAX_CLUSTER_DOKUMENTE === 60
      && V.FERN_MIN_BEWEISGEWICHT === 3 && V.VORGANG_FORTSCHREIBUNG_TAGE === 14);
    check("9.5 diese Suite ruft keine KI und kein Netz (nur Testdoubles)",
      /requestUnderstanding: async \(\) => \{ kiAufrufe \+= 1; return KI_ANTWORT\(\); \}/
        .test(fs.readFileSync(__filename, "utf8")));
    check("9.6 diese Suite veraendert keine Produktionsdatei (nur Lesezugriffe auf das Repo)",
      !/fs\.writeFileSync|fs\.appendFileSync|fs\.rmSync|fs\.unlinkSync/.test(fs.readFileSync(__filename, "utf8")));
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (!fail) {
    console.log("K1-1 ist NICHT widerlegt und breiter als in K1 dokumentiert: die globale");
    console.log("Buendelung aendert die Dokumentpartition in BEIDE Richtungen. Kein Dokument geht");
    console.log("verloren, kein Wissensobjekt verschwindet, keine doppelten Vorgaenge, keine");
    console.log("zusaetzlichen KI-Aufrufe — aber die Einteilung der Vorgaenge ist eine andere.");
    console.log("Ursache: mandatseigene Quellen wandern vom strengen in das lose Regime (§7).");
    console.log("EMPFEHLUNG: HELMUT_CRON_GLOBALPHASE bleibt AUS.");
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER:", e && e.stack); process.exit(1); });
