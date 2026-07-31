"use strict";

// Helmut — gemeinsames Nachweisgeruest fuer OP-25 K2.1 (kontextgebundene Vorgangsbildung).
// =============================================================================================
// ZWECK: die Fallfamilien und die drei Verarbeitungspfade an EINER Stelle halten, damit
// Testsuite (`vorgangskontext-test.js`) und Mutationsprobe (`vorgangskontext-mutationsprobe.js`)
// exakt dieselben Faelle gegen exakt denselben Produktionscode fahren. Bewusst KEINE Datei mit
// `-test.js`-Endung: der Offline-Runner sammelt nur `scripts/*-test.js` ein.
//
// HERKUNFT: die dreizehn Fallfamilien stammen unveraendert aus der K2-Analyse
// (`scripts/globalphase-buendelung-test.js`, Sprint OP-25 K2). Sie sind dort einzeln begruendet
// und mutationsgesichert. Hier kommt genau EIN Pfad hinzu — der K2.1-Pfad — und ein
// Herkunftsmodell, das es in K2 noch nicht gab.
//
// WAS ECHT IST: Ankerbildung, Clusterbildung, Vorgangskennung, Resolver, Verknuepfung und
// Schemapruefung sind der unveraenderte Produktionscode. Testdouble ist ausschliesslich der
// KI-Aufruf und die Vorgangsablage (sie bildet die vier Storage-Zugriffe nach, die
// `understandOneCluster` benutzt).
//
// Alle Texte sind ERFUNDENE Testdaten mit erfundenen Adressen (`example.invalid`). Sie stehen
// fuer Muster, nicht fuer echte Meldungen.

const path = require("path");

const ROOT = path.join(__dirname, "..");
const V = require(path.join(ROOT, "lib", "helmut", "vorgang-identity.js"));
const U = require(path.join(ROOT, "lib", "helmut", "understanding.js"));
const K = require(path.join(ROOT, "lib", "helmut", "vorgangskontext.js"));

// ── Dokumentbau ──────────────────────────────────────────────────────────────────────────────
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
// Der Zeitstempel ist ein MONOTONER Zaehler statt einer Uhr: die Kandidatenreihenfolge wird
// dadurch reproduzierbar, ohne dass das Geruest von `Date.now()` abhaengt.
function neueAblage(vorbelegung = null) {
  const kos = new Map();
  const links = new Map();
  let seq = 0;
  let kiAufrufe = 0;
  const stempel = () => { seq += 1; return `2026-07-31T00:00:${String(seq).padStart(2, "0")}.000Z`; };

  if (vorbelegung) {
    for (const [k, v] of (vorbelegung.kos || new Map()).entries()) kos.set(k, { ...v });
    for (const [k, m] of (vorbelegung.links || new Map()).entries()) links.set(k, new Map(m));
  }

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

// ── Der gemeinsame Lauf ueber eine Folge von Stapeln ─────────────────────────────────────────
// Ein „Stapel" ist genau das, was ein Aufruf von `clusterRawDocuments` zu sehen bekommt. Die
// drei Pfade unterscheiden sich AUSSCHLIESSLICH darin, wie sie die Stapel bilden.
async function laufe(stapel, { ablage = null } = {}) {
  const speicher = ablage || neueAblage();
  const protokoll = [];
  for (const teil of stapel) {
    if (!teil.length) continue;
    for (const cluster of V.clusterRawDocuments(teil)) {
      const r = await U.understandOneCluster(cluster, speicher.deps, { retriesCtx: { geladen: false, map: null } });
      protokoll.push({
        status: r.status, vorgangId: r.vorgangId, begruendung: r.begruendung || null,
        docs: (cluster.documents || []).map((d) => d.id)
      });
    }
  }
  return { ablage: speicher, protokoll };
}

// Entdoppelte Mandatsbatches (ALT): jedes Dokument nur im Batch des ersten Mandats, das es sieht.
function entdoppelt(batchesJeMandat) {
  const gesehen = new Set();
  return batchesJeMandat.map((batch) => batch.filter((d) => {
    if (gesehen.has(d.id)) return false;
    gesehen.add(d.id);
    return true;
  }));
}

function vereinigung(batchesJeMandat) {
  const gesehen = new Set();
  const out = [];
  for (const batch of batchesJeMandat) {
    for (const d of batch) { if (gesehen.has(d.id)) continue; gesehen.add(d.id); out.push(d); }
  }
  return out;
}

// ── DIE DREI PFADE ───────────────────────────────────────────────────────────────────────────
// ALT   — heute: je Mandat ein Stapel, mit globaler Rohdokument-Entdoppelung. Reihenfolge-
//         abhaengig (K2 §8a.3).
// K1    — globale Buendelung: EIN Stapel ueber alles. Ursache von Befund K1-1.
// K2.1  — kontextgebunden: je SICHTBARKEITSMENGE ein Stapel.
const altPfad = (batchesJeMandat, opts) => laufe(entdoppelt(batchesJeMandat), opts);
const k1Pfad = (batchesJeMandat, opts) => laufe([vereinigung(batchesJeMandat)], opts);

function kontextPlanFuer(batchesJeMandat, mandatsIds) {
  return K.planKontexte({
    dokumente: vereinigung(batchesJeMandat),
    herkunftJeQuelle: herkunftAus(batchesJeMandat, mandatsIds),
    reihenfolge: mandatsIds
  });
}

const k21Pfad = (batchesJeMandat, mandatsIds, opts) =>
  laufe(kontextPlanFuer(batchesJeMandat, mandatsIds).kontexte.map((k) => k.dokumente), opts);

// HERKUNFTSMODELL: welche Mandate erhalten welche Quelle? Genau die Angabe, die in Production
// aus der Vereinigungsmenge kommt (`cron-globalphase.planGlobaleQuellen(...).herkunft`).
function herkunftAus(batchesJeMandat, mandatsIds) {
  const herkunft = {};
  batchesJeMandat.forEach((batch, i) => {
    const mandat = mandatsIds[i];
    for (const d of batch) {
      const q = d.source_id;
      if (!herkunft[q]) herkunft[q] = [];
      if (!herkunft[q].includes(mandat)) herkunft[q].push(mandat);
    }
  });
  return herkunft;
}

// Die GRUPPIERUNG (welche Dokumente bilden EINEN Vorgang) — unabhaengig von der Kennung.
function gruppierung(ablage) {
  const g = new Map();
  for (const [dok_, vids] of ablage.zuordnung().entries()) {
    const key = [...vids].sort().join("+");
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(dok_);
  }
  return [...g.values()].map((x) => x.sort().join(",")).sort();
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// KORPUS — die dreizehn Fallfamilien aus K2, unveraendert.
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

// Zusatzfamilien, die es in K2 noch nicht gab — sie treffen genau die Grenze, die K2.1 zieht.
const ZUSATZFAMILIEN = [
  {
    id: "Z1", titel: "vier Mandate · zwei DISJUNKTE geteilte Quellen (A/B gegen C/D)",
    soll: "ZWEI Vorgaenge", sollGetrennt: true,
    mandate: {
      A: [dok("z1-ab", "regional-nord",
        "Ausschuss fordert Aenderung beim Kuestenschutz",
        "Der Ausschuss fordert eine Aenderung beim Kuestenschutz und kuendigt einen Antrag an.", t(8))],
      B: [dok("z1-ab", "regional-nord",
        "Ausschuss fordert Aenderung beim Kuestenschutz",
        "Der Ausschuss fordert eine Aenderung beim Kuestenschutz und kuendigt einen Antrag an.", t(8))],
      C: [dok("z1-cd", "regional-sued",
        "Ausschuss fordert Aenderung beim Alpenschutz",
        "Der Ausschuss fordert eine Aenderung beim Alpenschutz und kuendigt einen Antrag an.", t(8, 30))],
      D: [dok("z1-cd", "regional-sued",
        "Ausschuss fordert Aenderung beim Alpenschutz",
        "Der Ausschuss fordert eine Aenderung beim Alpenschutz und kuendigt einen Antrag an.", t(8, 30))]
    }
  },
  {
    id: "Z2", titel: "Personenquelle von A gegen Ausschussquelle von B · verschiedene Vorgaenge",
    soll: "ZWEI Vorgaenge", sollGetrennt: true,
    mandate: {
      A: [dok("z2-person", "mandat-a-news",
        "Abgeordneter beantragt Aenderung der Tagesordnung",
        "Der Abgeordnete beantragt eine Aenderung der Tagesordnung und kuendigt eine Anhoerung an.", t(7))],
      B: [dok("z2-ausschuss", "ausschuss-inneres",
        "Ausschuss beantragt Aenderung der Tagesordnung",
        "Der Ausschuss beantragt eine Aenderung der Tagesordnung und kuendigt eine Anhoerung an.", t(7, 20))]
    }
  },
  {
    id: "Z3", titel: "gleicher Drucksachentyp, andere Nummer · beide mandatseigen",
    soll: "ZWEI Vorgaenge", sollGetrennt: true,
    mandate: {
      A: [dok("z3-a", "mandat-a-news",
        "Kleine Anfrage — Drucksache 21/2001",
        "Die Abgeordneten stellen eine Kleine Anfrage. Drucksache 21/2001 betrifft die Bahnhofsanierung.", t(6))],
      B: [dok("z3-b", "mandat-b-news",
        "Kleine Anfrage — Drucksache 21/2002",
        "Die Abgeordneten stellen eine Kleine Anfrage. Drucksache 21/2002 betrifft die Schulsanierung.", t(6, 15))]
    }
  }
];

const alleDokumente = (fam) => vereinigung(Object.values(fam.mandate));
const mandatsIdsVon = (fam) => Object.keys(fam.mandate);
const batchesVon = (fam) => Object.values(fam.mandate);

module.exports = {
  V, U, K,
  dok, KI_ANTWORT, neueAblage, laufe,
  entdoppelt, vereinigung, herkunftAus,
  altPfad, k1Pfad, k21Pfad, kontextPlanFuer,
  gruppierung,
  FAMILIEN, ZUSATZFAMILIEN,
  alleDokumente, mandatsIdsVon, batchesVon,
  t
};
