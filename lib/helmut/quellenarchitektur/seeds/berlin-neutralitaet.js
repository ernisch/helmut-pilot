"use strict";

// Helmut — Quellenarchitektur · Phase-1-Punkt 14: NEUTRALITAET von berlin-basis, ausfuehrbar.
// =============================================================================================
// REINE DATEN + REINE HELFER. Kein Netz, kein DB-Zugriff, kein Schreiben, keine Aktivierung.
//
// Warum es diese Datei gibt: Bedingung V1 der Berlin-Aktivierung ("berlin-basis enthaelt keine
// Partei-/Fraktions-/Personenquelle") war bisher eine SQL-Zeile in einem Runbook. Eine Bedingung,
// die nur als Text existiert, kann nicht scheitern — sie kann nur vergessen werden. Hier wird
// daraus eine Funktion, die gegen JEDEN Bestand laeuft:
//   - gegen das Code-Abbild (seeds/landesmodule-quellen.js) und
//   - gegen einen gemessenen Datenbank-Bestand (PRODUCTION_IST_20260726).
// Beides mit demselben Pruefer. Damit ist belegbar, dass der Code neutral ist UND dass die
// Datenbank es (Stand 2026-07-26) nicht ist — Befund A-3.
//
// Zusaetzlich zwei Dinge, die vorher nur behauptet wurden:
//   1. PFLICHTKLASSEN-TIEFE. "8 von 12 Klassen liefern" zaehlt eine Klasse auch dann als
//      erfuellt, wenn sie bloss als Nebenprodukt der Suchanfrage einer ANDEREN Klasse mitlaeuft
//      (ausschuesse haengt an derselben Google-Suche wie landesparlament, ministerien an
//      derselben wie landesregierung). Das ist formale, nicht fachliche Erfuellung.
//   2. AKTUALITAETSGATE. Ein Weg, der zwar antwortet und parst, dessen juengstes Dokument aber
//      Monate alt ist, traegt zu einer taeglichen Morgenlage nichts bei. Erreichbarkeit ist
//      nicht Lieferfaehigkeit.
//
// BRANDENBURG kommt hier ausschliesslich als Negativbezug vor. Kein Eintrag aendert einen
// Brandenburg-Datensatz; der Pruefer ist landesunabhaengig, wird aber nur auf Berlin angewandt.

const { buildLandesmodulSeed } = require("./landesmodule-quellen");
const { PACKAGE_DEFINITIONS, LANDESMODUL_BASIS_PFLICHTKLASSEN } = require("./packages");

// --- Die acht Einstufungskategorien -----------------------------------------------------------
// Genau diese Menge; `unklar` ist der ehrliche Auffangwert und gilt als Befund, nicht als "ok".
const KATEGORIEN = Object.freeze([
  "amtlich_neutral",        // 1 neutrale amtliche Landesquelle
  "journalistisch_neutral", // 2 neutrale journalistische Landesquelle
  "parteispezifisch",       // 3
  "fraktionsspezifisch",    // 4
  "personenspezifisch",     // 5
  "technisch_ungeeignet",   // 6 technisch ungeeignet oder strukturell leer
  "mehrlaendrig",           // 7 deckt mehr als ein Bundesland ab
  "unklar"                  // 8
]);

// Ein Weg mit einem dieser Merkmale bindet ein Mandat an eine Partei, eine Fraktion oder eine
// Person. Er darf in KEINEM is_base-Paket stehen — unabhaengig vom Bundesland.
const BINDENDE_PUBLISHER_TYPEN = Object.freeze(["party", "parliamentary_group", "person"]);
const BINDENDE_KLASSEN = Object.freeze(["partei_pilot", "fraktion_pilot", "person_pilot"]);

const KATEGORIE_JE_PUBLISHER_TYP = Object.freeze({
  party: "parteispezifisch",
  parliamentary_group: "fraktionsspezifisch",
  person: "personenspezifisch"
});

// --- Einstufung eines einzelnen Wegs ----------------------------------------------------------
// Zwei UNABHAENGIGE Signale: der Herausgebertyp und die abgedeckten Pflichtklassen. Eines
// genuegt. So faellt eine Partei-/Personenquelle auch dann auf, wenn genau eines der beiden
// Merkmale falsch gepflegt ist — eine Pruefung, die nur ein Merkmal liest, waere umgehbar.
function bindendeMerkmale(weg = {}, publisher = {}) {
  const typ = String(publisher.publisher_type || weg.publisher_type || "").trim().toLowerCase();
  const klassen = Array.isArray(weg.covers) ? weg.covers.map((k) => String(k)) : [];
  const treffer = [];
  if (BINDENDE_PUBLISHER_TYPEN.includes(typ)) treffer.push({ merkmal: "publisher_type", wert: typ });
  for (const k of klassen) if (BINDENDE_KLASSEN.includes(k)) treffer.push({ merkmal: "pflichtklasse", wert: k });
  return treffer;
}

// Kategorie eines Wegs. Reihenfolge ist Absicht: die bindenden Kategorien schlagen alles andere,
// damit eine Parteiquelle nicht ueber ihren Abrufweg (googlenews) zur "neutralen" Quelle wird.
function kategorisiereWeg(weg = {}, publisher = {}, opts = {}) {
  const merkmale = bindendeMerkmale(weg, publisher);
  if (merkmale.length) {
    const typ = String(publisher.publisher_type || weg.publisher_type || "").trim().toLowerCase();
    if (KATEGORIE_JE_PUBLISHER_TYP[typ]) return KATEGORIE_JE_PUBLISHER_TYP[typ];
    // Kein bindender Herausgebertyp, aber eine bindende Klasse -> ueber die Klasse einstufen.
    const k = merkmale.find((m) => m.merkmal === "pflichtklasse");
    if (k && k.wert === "partei_pilot") return "parteispezifisch";
    if (k && k.wert === "fraktion_pilot") return "fraktionsspezifisch";
    if (k && k.wert === "person_pilot") return "personenspezifisch";
    return "unklar";
  }
  if (opts.strukturellLeer) return "technisch_ungeeignet";
  if (opts.mehrlaendrig) return "mehrlaendrig";
  const rolle = String(publisher.evidence_role || weg.evidence_role || "").trim().toLowerCase();
  const typ = String(publisher.publisher_type || weg.publisher_type || "").trim().toLowerCase();
  if (["parliament", "government", "ministry"].includes(typ) || rolle === "official_primary") return "amtlich_neutral";
  if (typ === "media" || rolle === "journalistic") return "journalistisch_neutral";
  return "unklar";
}

// --- Neutralitaetspruefung ueber einen beliebigen Bestand -------------------------------------
// Erwartet ein Abbild in Datenbankform. Funktioniert fuer das Code-Abbild ebenso wie fuer einen
// gemessenen Production-Auszug — beide werden im Test durch DIESELBE Funktion geschickt.
//
// Ein Verstoss ist: ein Weg mit bindendem Merkmal in einem Paket mit is_base = true.
// `unklar` ist KEIN Verstoss, wird aber als offener Punkt zurueckgegeben (kein stilles Gruen).
function pruefeNeutralitaet(bestand = {}) {
  const pakete = bestand.packages || PACKAGE_DEFINITIONS;
  const packagePaths = bestand.packagePaths || [];
  const wege = bestand.retrievalPaths || [];
  const publishers = bestand.publishers || [];

  const paketById = new Map(pakete.map((p) => [p.id, p]));
  const wegById = new Map(wege.map((w) => [w.id, w]));
  const pubById = new Map(publishers.map((p) => [p.id, p]));

  const verstoesse = [];
  const unklar = [];
  const geprueft = [];

  for (const pp of packagePaths) {
    const paket = paketById.get(pp.package_id);
    const weg = wegById.get(pp.retrieval_path_id);
    if (!paket || !weg) continue; // fremde/unbekannte Zeile: nicht bewertbar, nicht erfinden
    const publisher = pubById.get(weg.publisher_id) || {};
    const merkmale = bindendeMerkmale(weg, publisher);
    const kategorie = kategorisiereWeg(weg, publisher, {
      mehrlaendrig: Boolean(weg.landModule && String(weg.landModule).includes("+"))
    });
    geprueft.push({ paket: paket.key, weg: weg.id, kategorie, isBase: Boolean(paket.is_base) });
    if (paket.is_base && merkmale.length) {
      verstoesse.push({
        paket: paket.key, paketId: paket.id, weg: weg.id, kategorie,
        herausgeber: publisher.name || null,
        merkmale,
        wirkung: `Jedes Mandat mit dem Pflichtpaket ${paket.key} erhaelt diese Quelle zwingend.`
      });
    }
    if (kategorie === "unklar") unklar.push({ paket: paket.key, weg: weg.id });
  }

  return {
    neutral: verstoesse.length === 0,
    verstoesse,
    unklar,
    geprueft,
    geprueftePaketzuordnungen: geprueft.length
  };
}

// Bequemer Berlin-Schnitt: nur die Zuordnungen der beiden Berliner Pakete.
function pruefeBerlinNeutralitaet(bestand = {}) {
  const berlinPakete = new Set(["pkg-berlin-basis", "pkg-die-linke-berlin"]);
  return pruefeNeutralitaet({
    ...bestand,
    packagePaths: (bestand.packagePaths || []).filter((pp) => berlinPakete.has(pp.package_id))
  });
}

// Das Code-Abbild als Bestand (so, wie der Seed es in die Datenbank schreiben WUERDE).
function codeBestand() {
  const seed = buildLandesmodulSeed();
  return {
    packages: PACKAGE_DEFINITIONS,
    packagePaths: seed.packagePaths,
    retrievalPaths: seed.retrievalPaths,
    publishers: seed.publishers
  };
}

// --- Gemessener Production-Ist-Zustand (read-only, 2026-07-26) ---------------------------------
// Ausschliesslich `select`-Abfragen; in diesem Sprint wurde keine Zeile geschrieben. Der Auszug
// ist der BELEG fuer Befund A-3 und zugleich das Fixture, gegen das der Pruefer laufen muss.
// Er bildet exakt die 10 Zuordnungen ab, die die Datenbank an berlin-basis fuehrt.
const PRODUCTION_IST_20260726 = Object.freeze({
  gemessenAm: "2026-07-26",
  methode: "read-only select ueber package_paths/source_packages/retrieval_paths/publishers",
  packages: Object.freeze([
    Object.freeze({ id: "pkg-berlin-basis", key: "berlin-basis", is_base: true, status: "prepared", wegeInDb: 10 }),
    Object.freeze({ id: "pkg-die-linke-berlin", key: "die-linke-berlin", is_base: false, status: "prepared", wegeInDb: 0 })
  ]),
  // package_paths, wie gemessen: ALLE zehn Berliner Wege haengen am is_base-Pflichtpaket.
  packagePaths: Object.freeze([
    "rp-be-fraktion_pilot", "rp-be-landesfraktionen", "rp-be-landesparlament", "rp-be-landesregierung",
    "rp-be-partei_pilot", "rp-be-person_pilot", "rp-be-plenum", "rp-be-regionale_leitmedien",
    "rp-be-staatskanzlei", "rp-rbb24-politik"
  ].map((id) => Object.freeze({ package_id: "pkg-berlin-basis", retrieval_path_id: id }))),
  // Herausgeber-Merkmale je Weg, wie gemessen (publisher_type / evidence_role).
  publisherJeWeg: Object.freeze({
    "rp-be-fraktion_pilot": Object.freeze({ name: "Linksfraktion Berlin (Abgeordnetenhaus)", publisher_type: "parliamentary_group", evidence_role: "direct_interest" }),
    "rp-be-landesfraktionen": Object.freeze({ name: "Abgeordnetenhaus von Berlin", publisher_type: "parliament", evidence_role: "official_primary" }),
    "rp-be-landesparlament": Object.freeze({ name: "Abgeordnetenhaus von Berlin", publisher_type: "parliament", evidence_role: "official_primary" }),
    "rp-be-landesregierung": Object.freeze({ name: "Land Berlin — Landespressedienst", publisher_type: "government", evidence_role: "official_primary" }),
    "rp-be-partei_pilot": Object.freeze({ name: "Die Linke Berlin", publisher_type: "party", evidence_role: "direct_interest" }),
    "rp-be-person_pilot": Object.freeze({ name: "Tobias Schulze (MdA, Die Linke)", publisher_type: "person", evidence_role: "direct_interest" }),
    "rp-be-plenum": Object.freeze({ name: "Abgeordnetenhaus von Berlin", publisher_type: "parliament", evidence_role: "official_primary" }),
    "rp-be-regionale_leitmedien": Object.freeze({ name: "Der Tagesspiegel", publisher_type: "media", evidence_role: "journalistic" }),
    "rp-be-staatskanzlei": Object.freeze({ name: "Land Berlin — Landespressedienst", publisher_type: "government", evidence_role: "official_primary" }),
    "rp-rbb24-politik": Object.freeze({ name: "rbb24 (Rundfunk Berlin-Brandenburg)", publisher_type: "media", evidence_role: "journalistic" })
  }),
  // Alle zehn Wege standen bei der Messung auf needs_review/manual — nichts lief.
  wegzustand: Object.freeze({ status: "needs_review", activation_mode: "manual" }),
  brandenburgUnveraendert: Object.freeze({
    paket: "brandenburg-basis", status: "prepared", wegeInDb: 9,
    hinweis: "9 = 8 eigene rp-bb-*-Wege + die geteilte rbb24-Referenz. Alle needs_review/manual."
  })
});

// Baut aus dem gemessenen Auszug einen Bestand in derselben Form wie codeBestand().
// So laeuft DERSELBE Pruefer ueber Code und Datenbank.
function productionBestand(nachUmhaengung = false) {
  const seed = buildLandesmodulSeed();
  const wegById = new Map(seed.retrievalPaths.map((w) => [w.id, w]));
  const umzuhaengen = new Set(["rp-be-partei_pilot", "rp-be-fraktion_pilot", "rp-be-person_pilot"]);
  const packagePaths = PRODUCTION_IST_20260726.packagePaths.map((pp) => (
    nachUmhaengung && umzuhaengen.has(pp.retrieval_path_id)
      ? { package_id: "pkg-die-linke-berlin", retrieval_path_id: pp.retrieval_path_id }
      : { ...pp }
  ));
  const publishers = Object.entries(PRODUCTION_IST_20260726.publisherJeWeg)
    .map(([wegId, p]) => ({ id: `pub-fuer-${wegId}`, ...p }));
  const retrievalPaths = PRODUCTION_IST_20260726.packagePaths.map((pp) => {
    const ausSeed = wegById.get(pp.retrieval_path_id) || {};
    return { ...ausSeed, id: pp.retrieval_path_id, publisher_id: `pub-fuer-${pp.retrieval_path_id}` };
  });
  return {
    packages: PRODUCTION_IST_20260726.packages.map((p) => ({ ...p })),
    packagePaths, retrievalPaths, publishers
  };
}

// --- Aktualitaetsgate: Erreichbarkeit ist nicht Lieferfaehigkeit -------------------------------
// Gemessen am 2026-07-26 auf einem GitHub-Actions-Runner mit offenem Egress (Workflow
// sprint9b-verify.yml, Eingrenzung S9B_ONLY="BE,BE+BB"). Kontroll-Abruf example.com/google.com
// = HTTP 200 -> die Urteile stammen vom Zielserver, nicht vom Egress-Proxy.
const VERIFIKATION_META = Object.freeze({
  datum: "2026-07-26",
  run: "30208901908",
  runner: "GitHub Actions ubuntu-latest (offener Egress)",
  umfang: "BE,BE+BB (10 Berliner Wege)",
  egressOffen: true,
  realGeprueft: 10,
  gesamt: 10,
  vorlauf: "2026-07-14 (Run 29297142235) — abgeloest, weil zwei Wege seitdem veraltet sind"
});

// Alterstufen. Grundlage ist der Produktzweck: Helmut baut eine TAEGLICHE Morgenlage. Ein Weg,
// dessen juengstes Dokument Wochen alt ist, kann dazu nichts beitragen — er ist erreichbar,
// aber nicht liefernd.
const FRISCHE_STUFEN = Object.freeze([
  Object.freeze({ id: "frisch", maxTage: 7, aktivierbar: true, beobachtung: false }),
  Object.freeze({ id: "beobachtung", maxTage: 30, aktivierbar: true, beobachtung: true }),
  Object.freeze({ id: "veraltet", maxTage: Infinity, aktivierbar: false, beobachtung: true })
]);

function frischeStufe(tage) {
  if (!Number.isFinite(tage)) return FRISCHE_STUFEN[FRISCHE_STUFEN.length - 1];
  return FRISCHE_STUFEN.find((s) => tage <= s.maxTage) || FRISCHE_STUFEN[FRISCHE_STUFEN.length - 1];
}

// Ergebnis je Weg. `juengstesItemTage: null` = kein Item datierbar (Bot-Sperre / XML-Bestand).
const VERIFIKATION_20260726 = Object.freeze({
  "rp-be-landesparlament": Object.freeze({
    urteil: "geeignet mit Einschränkung", http: 200, items: 20, juengstesItemTage: 156,
    beleg: "site:parlament-berlin.de — Feed parst (20 Items), juengstes Item 156 Tage alt; Titel[0] 'Bilder - Abgeordnetenhaus Berlin'",
    einschraenkung: "Google News indexiert die Domain praktisch nicht mehr aktuell."
  }),
  "rp-be-plenum": Object.freeze({
    urteil: "geeignet", http: 200, items: 8108, juengstesItemTage: null,
    beleg: "PARDOK WP19: 8108 <Dokument>, wohlgeformtes Open-Data-XML",
    einschraenkung: "Dispatch haelt items:[] in JEDEM Modus — der Weg liefert trotz gueltiger Quelle 0 Dokumente."
  }),
  "rp-be-landesregierung": Object.freeze({
    urteil: "geeignet", http: 200, items: 20, juengstesItemTage: 0,
    beleg: "Senat Berlin site:berlin.de — 20 Items, juengstes 0 Tage ('Senat geht mit Mietenscan gegen Wuchermieten vor')",
    einschraenkung: null
  }),
  "rp-be-staatskanzlei": Object.freeze({
    urteil: "geeignet", http: 200, items: 20, juengstesItemTage: 14,
    beleg: "Regierender Buergermeister/Senatskanzlei — 20 Items, juengstes 14 Tage",
    einschraenkung: "Inhaltliche Teilmenge von rp-be-landesregierung; Aktualitaet an der Grenze."
  }),
  "rp-be-landesfraktionen": Object.freeze({
    urteil: "geeignet mit Einschränkung", http: 200, items: 20, juengstesItemTage: 41,
    beleg: "\"Abgeordnetenhaus Berlin\" Fraktion — Feed parst (20 Items), juengstes Item 41 Tage alt",
    einschraenkung: "Die Phrasensuche in Anfuehrungszeichen ist zu eng; Treffer versanden."
  }),
  "rp-be-regionale_leitmedien": Object.freeze({
    urteil: "geeignet", http: 200, items: 20, juengstesItemTage: 0,
    beleg: "Tagesspiegel Berlin-Feed — 20 Items, juengstes 0 Tage, Originaladresse auf tagesspiegel.de",
    einschraenkung: "Volltext teilweise hinter 'Tagesspiegel Plus'; Metadaten frei."
  }),
  "rp-rbb24-politik": Object.freeze({
    urteil: "geeignet", http: 200, items: 20, juengstesItemTage: 0,
    beleg: "rbb24 /politik — 20 Items, juengstes 0 Tage, Originaladresse auf rbb24.de",
    einschraenkung: "Mehrlaendrig: mischt Berlin UND Brandenburg."
  }),
  "rp-be-partei_pilot": Object.freeze({
    urteil: "geeignet mit Einschränkung", http: 429, items: 0, juengstesItemTage: null,
    beleg: "HTTP 429 Bot-/Zugriffssperre — kein Item lesbar",
    einschraenkung: "Bot-Sperre; nicht umgehen."
  }),
  "rp-be-fraktion_pilot": Object.freeze({
    urteil: "geeignet mit Einschränkung", http: 429, items: 0, juengstesItemTage: null,
    beleg: "HTTP 429 Bot-/Zugriffssperre — kein Item lesbar",
    einschraenkung: "Bot-Sperre; nicht umgehen."
  }),
  "rp-be-person_pilot": Object.freeze({
    urteil: "geeignet", http: 200, items: 20, juengstesItemTage: 12,
    beleg: "\"Tobias Schulze\" Berlin — 20 Items, juengstes 12 Tage",
    einschraenkung: "Personensuche auf eine namentlich benannte reale Person."
  })
});

// Darf dieser Weg aktiviert werden? Vier unabhaengige Bedingungen, alle mit Grund.
// Die Funktion ERFINDET nichts: fehlt ein Verifikationsergebnis, ist die Antwort "nein".
function darfAktiviertWerden(wegId, opts = {}) {
  const v = (opts.verifikation || VERIFIKATION_20260726)[wegId];
  const gruende = [];
  if (!v) return { erlaubt: false, gruende: ["keine-aktuelle-verifikation"], stufe: null };
  if (v.urteil === "ablehnen" || v.urteil === "nicht_verifizierbar") gruende.push(`urteil-${v.urteil}`);
  if (v.http !== 200) gruende.push(`http-${v.http}`);
  const stufe = frischeStufe(v.juengstesItemTage == null ? Infinity : v.juengstesItemTage);
  if (!stufe.aktivierbar) gruende.push(`veraltet-${v.juengstesItemTage}-tage`);
  if (opts.strukturellLeer) gruende.push("liefert-strukturell-0-items");
  if (opts.bindend) gruende.push("partei-fraktions-oder-personenquelle");
  return { erlaubt: gruende.length === 0, gruende, stufe: stufe.id, beobachtung: Boolean(stufe.beobachtung) };
}

// --- Pflichtklassen-Tiefe ---------------------------------------------------------------------
// Drei Zustaende statt zwei. Der Unterschied zwischen "eigenstaendig" und "mitabgedeckt" ist der
// Unterschied zwischen einer Klasse, fuer die es eine eigene Suchanfrage/Quelle gibt, und einer,
// die nur mitlaeuft, weil eine andere Klasse dieselbe Rohquelle benutzt.
//   eigenstaendig  — es gibt einen aktivierten Weg, dessen ERSTE (namensgebende) Klasse diese ist
//   mitabgedeckt   — ein aktivierter Weg deckt sie mit ab, ist aber fuer eine andere Klasse gebaut
//   nicht_geliefert— kein aktivierter Weg deckt sie ab
//
// Die namensgebende Klasse wird aus der Weg-Id abgeleitet (rp-be-<klasse>), nicht aus der
// Reihenfolge von `covers` — die Reihenfolge waere eine stille Abhaengigkeit von der Seed-Schleife.
// Deckt ein Weg nur EINE Klasse ab, ist er per Definition fuer sie gebaut, auch wenn seine Id
// anders heisst: rp-rbb24-politik traegt den Sendernamen (er haengt in zwei Landespaketen) und
// deckt ausschliesslich oer_landesberichterstattung ab.
function namensgebendeKlasse(wegId, weg = null) {
  const covers = weg && Array.isArray(weg.covers) ? weg.covers : null;
  if (covers && covers.length === 1) return covers[0];
  const m = /^rp-(?:be|bb)-(.+)$/.exec(String(wegId || ""));
  return m ? m[1] : null;
}

function klassenAbdeckung(aktivierteWegIds, opts = {}) {
  const seed = opts.seed || buildLandesmodulSeed();
  const aktiv = new Set(aktivierteWegIds || []);
  const wegById = new Map(seed.retrievalPaths.map((w) => [w.id, w]));
  const eigenstaendig = new Map();  // klasse -> wegId
  const mitabgedeckt = new Map();
  for (const id of aktiv) {
    const weg = wegById.get(id);
    if (!weg) continue;
    const namensgebend = namensgebendeKlasse(id, weg);
    for (const k of weg.covers || []) {
      if (k === namensgebend) eigenstaendig.set(k, id);
      else if (!eigenstaendig.has(k)) mitabgedeckt.set(k, id);
    }
  }
  const basis = LANDESMODUL_BASIS_PFLICHTKLASSEN;
  const zeilen = basis.map((k) => ({
    klasse: k,
    zustand: eigenstaendig.has(k) ? "eigenstaendig" : (mitabgedeckt.has(k) ? "mitabgedeckt" : "nicht_geliefert"),
    weg: eigenstaendig.get(k) || mitabgedeckt.get(k) || null
  }));
  return {
    gesamt: basis.length,
    eigenstaendig: zeilen.filter((z) => z.zustand === "eigenstaendig").map((z) => z.klasse),
    mitabgedeckt: zeilen.filter((z) => z.zustand === "mitabgedeckt").map((z) => z.klasse),
    nichtGeliefert: zeilen.filter((z) => z.zustand === "nicht_geliefert").map((z) => z.klasse),
    zeilen
  };
}

module.exports = {
  KATEGORIEN, BINDENDE_PUBLISHER_TYPEN, BINDENDE_KLASSEN,
  bindendeMerkmale, kategorisiereWeg,
  pruefeNeutralitaet, pruefeBerlinNeutralitaet, codeBestand,
  PRODUCTION_IST_20260726, productionBestand,
  VERIFIKATION_META, VERIFIKATION_20260726, FRISCHE_STUFEN, frischeStufe, darfAktiviertWerden,
  namensgebendeKlasse, klassenAbdeckung
};
