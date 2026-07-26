"use strict";

// Helmut — Quellenarchitektur · Phase-1-Punkt 14: AKTIVIERUNGSPLAN Berlin.
// =============================================================================================
// REINE DATEN + REINE HELFER. Diese Datei beschreibt, WAS eine spaetere, freigabepflichtige
// Berlin-Aktivierung in Production genau aendern wuerde — und was ausdruecklich NICHT.
// Sie aktiviert NICHTS: kein Flag, kein Statuswechsel, kein DB-Zugriff, kein Netz.
//
// Sie ist die EINE Quelle fuer:
//   - das generierte Aktivierungs-SQL + Rollback (scripts/generate-berlin-aktivierung-sql.js)
//   - die Tests (scripts/berlin-aktivierung-test.js)
//   - das Betriebsdokument (docs/betrieb/berlin-aktivierung.md)
// Damit koennen Runbook, SQL und Test nicht auseinanderlaufen.
//
// BRANDENBURG: kommt hier ausschliesslich als NEGATIV-Bezug vor (Nachweis der Nicht-Beruehrung).
// Kein Eintrag dieser Datei aendert einen Brandenburg-Datensatz.
//
// GRUNDLAGE der Wegdaten: seeds/landesmodule-quellen.js (dedupliziertes Landesmodul-Abbild) —
// abgeleitet, nicht abgeschrieben. Aendert sich dort ein Weg, aendert sich der Plan mit.

const { buildLandesmodulSeed } = require("./landesmodule-quellen");
const { LIVE_URTEILE, LIVE_META } = require("./landesmodule-verifikation");
const { LANDESMODUL_BASIS_PFLICHTKLASSEN, LANDESMODUL_PARTEI_PFLICHTKLASSEN } = require("./packages");
const { VERIFIKATION_20260726, VERIFIKATION_META, darfAktiviertWerden, frischeStufe } = require("./berlin-neutralitaet");

const LAND = "berlin";
const GEOGRAPHY_ID = "geo-land-berlin";
const POLITICAL_LEVEL = "land";
const BASISPAKET_ID = "pkg-berlin-basis";
const BASISPAKET_KEY = "berlin-basis";
const PARTEIPAKET_ID = "pkg-die-linke-berlin";
const PARTEIPAKET_KEY = "die-linke-berlin";

// --- Was aktiviert wird ----------------------------------------------------------------------
// Die Wege des NEUTRALEN Basispakets, die real AKTUELLE Dokumente in die sichtbare Pipeline
// liefern. Zielzustand je Weg: status='healthy', activation_mode='auto'.
//
// KORREKTUR 2026-07-26 (Neuverifikation V2, Runs 30208901908 + 30208997672, zweimal identisch):
// Das Set war 6 Wege gross. Zwei davon sind seit der Alt-Verifikation vom 2026-07-14 VERALTET —
// sie antworten mit HTTP 200 und parsen sauber 20 Items, aber ihr juengster Eintrag ist Monate
// alt. Erreichbarkeit ist nicht Lieferfaehigkeit; eine taegliche Morgenlage kann daraus nichts
// bauen. Beide bleiben deshalb gesperrt (siehe NICHT_AKTIVIERT):
//   rp-be-landesparlament  juengstes Item 156 Tage  (2026-07-14 noch: 23 Tage)
//   rp-be-landesfraktionen juengstes Item  41 Tage  (2026-07-14 noch: 28 Tage)
// Das ist eine echte Verschlechterung der Quellenlage, keine Verschaerfung des Massstabs.
const AKTIVIERUNGSSET = Object.freeze(["rp-be-landesregierung", "rp-be-staatskanzlei",
  "rp-be-regionale_leitmedien", "rp-rbb24-politik"]);

// --- Gestaffelte Aktivierung ------------------------------------------------------------------
// Warum gestaffelt: Befund B1 (146 von 163 Wegen laufen bereits ueber Google) und OP-15
// (Drosselung/circuit-open) sind offen. Die zwei Direktfeeds erzeugen NULL Google-Requests und
// koennen die Kette allein beweisen; erst danach kommen die zwei Google-Suchwege dazu.
// Beide Stufen sind je ein eigener, einzeln rueckrollbarer SQL-Block.
const AKTIVIERUNGSSTUFEN = Object.freeze([
  Object.freeze({
    stufe: 1, wege: Object.freeze(["rp-be-regionale_leitmedien", "rp-rbb24-politik"]),
    grund: "Direktfeeds (Tagesspiegel, rbb24) — 0 Google-Requests, beide juengstes Item 0 Tage.",
    weiterErst: "nach einem vollen Crawl-Zyklus (mind. 2 Laeufe) ohne neue Fehler"
  }),
  Object.freeze({
    stufe: 2, wege: Object.freeze(["rp-be-landesregierung", "rp-be-staatskanzlei"]),
    grund: "Amtliche Ebene ueber Google News — bringt die Google-Last, deshalb nach Stufe 1.",
    weiterErst: "—"
  })
]);

// --- Was BEWUSST NICHT aktiviert wird ---------------------------------------------------------
// Jeder Eintrag nennt den Weg, den Grund und die Folge fuer die Pflichtklassen. Ein Weg ohne
// Eintrag hier UND ohne Eintrag im Aktivierungsset waere ein Planfehler (wird geprueft).
const NICHT_AKTIVIERT = Object.freeze([
  Object.freeze({
    id: "rp-be-plenum",
    bleibt: { status: "needs_review", activation_mode: "manual" },
    grund: "pardok-dispatch-liefert-strukturell-0-items",
    begruendung:
      "Der einzige Weg mit method='structured_download'. lib/helmut/quellenarchitektur/pardok-dispatch.js "
      + "haelt die harte Invariante items:[] in JEDEM Modus (off und shadow); ein Live-Modus ist bewusst "
      + "NICHT implementiert — das waere der PARDOK-Cutover (Schritt D/E) mit eigener Freigabe. Aktivieren "
      + "wuerde je Crawl einen ~48-MB-Download ausloesen und 0 Dokumente liefern.",
    folge: "Die 4 Pflichtklassen plenum/drucksachen/schriftliche_anfragen/gesetzgebung bleiben "
      + "vorbereitet OHNE Lieferung. Das ist der ehrliche Leerzustand, nicht ein erfuellter Zustand."
  }),
  Object.freeze({
    id: "rp-be-landesparlament",
    bleibt: { status: "needs_review", activation_mode: "manual" },
    grund: "veraltet-trotz-erreichbarkeit",
    begruendung:
      "Neuverifikation 2026-07-26 (zwei unabhaengige Laeufe): HTTP 200, Feed parst 20 Items — aber "
      + "das juengste Item ist 156 Tage alt, Titel[0] ist eine Bilderseite. Google News indexiert "
      + "site:parlament-berlin.de praktisch nicht mehr aktuell. Am 2026-07-14 waren es noch 23 Tage. "
      + "Ein Weg, der nur Halbjahresaltes liefert, gehoert nicht in eine taegliche Morgenlage.",
    folge: "Die Pflichtklassen landesparlament und ausschuesse bleiben OHNE liefernden Weg. Damit "
      + "hat das Berliner Basispaket vorerst KEINE amtliche parlamentarische Quelle. Reparatur "
      + "(tragfaehigere Suchanfrage oder Direktfeed) ist ein eigener, verifizierter Schritt."
  }),
  Object.freeze({
    id: "rp-be-landesfraktionen",
    bleibt: { status: "needs_review", activation_mode: "manual" },
    grund: "veraltet-trotz-erreichbarkeit",
    begruendung:
      "Neuverifikation 2026-07-26 (zwei unabhaengige Laeufe): HTTP 200, 20 Items, juengstes Item "
      + "41 Tage alt. Die Suchanfrage ist eine Phrasensuche in Anfuehrungszeichen "
      + "(\"Abgeordnetenhaus Berlin\" Fraktion) und damit zu eng.",
    folge: "Die Pflichtklasse landesfraktionen bleibt ohne liefernden Weg."
  }),
  Object.freeze({
    id: "rp-be-partei_pilot",
    bleibt: { status: "needs_review", activation_mode: "manual" },
    grund: "parteipaket-nicht-basispaket",
    begruendung: "Parteiquelle (Die Linke Berlin). Gehoert per P0-2 in das optionale Paket "
      + PARTEIPAKET_KEY + " und niemals in das is_base-Pflichtpaket, das JEDES Berliner Landtagsmandat erhaelt.",
    folge: "Wird durch die Umhaengung aus " + BASISPAKET_KEY + " entfernt; bleibt inaktiv."
  }),
  Object.freeze({
    id: "rp-be-fraktion_pilot",
    bleibt: { status: "needs_review", activation_mode: "manual" },
    grund: "parteipaket-nicht-basispaket",
    begruendung: "Fraktionsquelle (Linksfraktion Berlin). Wie oben — plus Live-Urteil "
      + "'geeignet mit Einschraenkung' (HTTP 429, Bot-Sperre).",
    folge: "Wird umgehaengt; bleibt inaktiv."
  }),
  Object.freeze({
    id: "rp-be-person_pilot",
    bleibt: { status: "needs_review", activation_mode: "manual" },
    grund: "parteipaket-nicht-basispaket",
    begruendung: "Personensuche zu einer namentlich benannten realen Person. Gehoert nicht in ein "
      + "Pflichtpaket; personenbezogene Quellen entstehen zur Laufzeit aus dem Profil.",
    folge: "Wird umgehaengt; bleibt inaktiv."
  })
]);

// --- Paket-Umhaengung (P0-2, NUR Berlin) ------------------------------------------------------
// Production-Befund A-3 (weiterhin offen, gemessen 2026-07-26): die drei Wege oben haengen in der
// DATENBANK weiterhin am is_base-Paket berlin-basis. Der Landesmodul-Seed 20260717 wuerde das
// beheben — er wuerde aber ZUGLEICH eine Brandenburg-Zeile umhaengen (rp-bb-partei_pilot).
// Dieser Sprint darf Brandenburg nicht beruehren, deshalb ist die Umhaengung hier BERLIN-GENAU
// formuliert und laeuft nicht ueber den Seed.
const UMHAENGUNG = Object.freeze({
  von: BASISPAKET_ID,
  nach: PARTEIPAKET_ID,
  wege: Object.freeze(["rp-be-partei_pilot", "rp-be-fraktion_pilot", "rp-be-person_pilot"]),
  grund: "P0-2: das is_base-Landespaket muss neutral sein (Mandantenneutralitaet).",
  blockiertAktivierung: true
});

// --- Voraussetzungen, die VOR der Aktivierung erfuellt sein muessen ----------------------------
// `pruefbar` beschreibt die objektive Pruefung; nichts davon wird hier ausgefuehrt.
const VORAUSSETZUNGEN = Object.freeze([
  Object.freeze({
    id: "V1-neutralisierung",
    titel: "berlin-basis enthaelt keine Partei-/Fraktions-/Personenquelle mehr",
    pruefbar: "select count(*) from package_paths where package_id='" + BASISPAKET_ID
      + "' and retrieval_path_id in ('rp-be-partei_pilot','rp-be-fraktion_pilot','rp-be-person_pilot') -- erwartet 0",
    mutierend: true,
    kritisch: true
  }),
  Object.freeze({
    id: "V2-live-verifikation",
    titel: "die 6 Wege des Aktivierungssets sind erneut real abgerufen worden",
    pruefbar: "Lauf von .github/workflows/sprint9b-verify.yml (Runner mit offenem Egress); je Weg "
      + "HTTP-Status, Item-Zahl und Alter des juengsten Eintrags. Der bestehende Nachweis stammt vom "
      + LIVE_META.datum + " (Run " + LIVE_META.run + ") und ist damit aelter als der Aktivierungszeitpunkt.",
    mutierend: false,
    kritisch: true
  }),
  Object.freeze({
    id: "V3-landtagsprofil",
    titel: "es existiert genau ein aktivierungsberechtigtes Berliner Landtagsprofil",
    pruefbar: "select count(*) from mandate_profiles where politische_ebene='landtag' and lower(bundesland)='berlin' and aktiv -- erwartet 1",
    mutierend: true,
    kritisch: true
  }),
  Object.freeze({
    id: "V4-freigabeflag",
    titel: "HELMUT_LANDESMODULE nennt genau 'berlin'",
    pruefbar: "Vercel-Env oder helmut-flags.json; Wert exakt 'berlin' (nicht 'berlin,brandenburg', kein 'alle').",
    mutierend: true,
    kritisch: true
  }),
  Object.freeze({
    id: "V5-paketstatus",
    titel: "berlin-basis steht auf 'active'",
    pruefbar: "select status from source_packages where key='" + BASISPAKET_KEY + "' -- erwartet active",
    mutierend: true,
    kritisch: true
  }),
  Object.freeze({
    id: "V6-sicherung",
    titel: "eine Sicherung der 8 Quellentabellen liegt vor",
    pruefbar: "node scripts/backup-export.js --scope=seed; Manifest mit vollstaendig:true",
    mutierend: false,
    kritisch: true
  })
]);

// --- Lastmodell ------------------------------------------------------------------------------
// KEINE Behauptung "kostenlos". Die Zahlen sind aus dem Crawler abgeleitet:
//   - je Weg 1 Feed-Abruf (toCrawlerSource setzt rssUrl == rssUrls[0] -> nach Dedup EINE URL)
//   - Google-News-Wege loesen zusaetzlich je Item die Zielurl auf (crawler.resolveEntryUrls):
//     bestenfalls 0 Requests (Dekodierung aus der URL), schlechtestenfalls 1 Seitenabruf +
//     2 batchexecute-POSTs = 3 Requests je Item.
//   - Obergrenze Items je Weg = max_items (16).
const LAST_ANNAHMEN = Object.freeze({
  maxItemsJeWeg: 16,
  requestsJeGoogleItemMax: 3,
  requestsJeGoogleItemMin: 0,
  // KORREKTUR 2026-07-26: hier stand 2 ("vercel.json: 0 4 * * * und 0 20 * * *"). Gemessen an
  // source_crawl_telemetry (8 Tage) laufen real FUENF Vollrunden je Tag — 04:00, ~07:5x, 10:00,
  // 16:00, 20:00 UTC; die beiden zusaetzlichen sind Lage-/Health-Laeufe, die ebenfalls einen
  // vollen Quellendurchlauf ausloesen. Die Alt-Annahme unterschaetzte die Abruflast um 2,5x.
  crawlLaeufeProTag: 5,
  crawlLaeufeProTagQuelle: "gemessen 2026-07-19..2026-07-25: je 5 Vollrunden (>=50 ok-Wege)",
  // Wiederholungslaeufe holen NICHT erneut ab: gemessen sind 134-135 von 145 Wegen je
  // Wiederholung 'skipped-shared' (crawler.js sharedFetchLedger). Nur die Vollrunden zaehlen.
  wiederholungslaeufeOhneAbruf: true,
  crawlNebenlaufigkeit: 20,       // crawler.js crawlConcurrency (CRAWLER_CONCURRENCY, Default 20)
  funktionsLaufzeitSekundenMax: 300, // vercel.json functions.api/index.js.maxDuration
  llmCallsJeWeg: 0                // Crawl ruft KEIN LLM; Kosten entstehen erst im Understanding
});

// --- Gemessener Ist-Betrieb (read-only, 2026-07-26) -------------------------------------------
// Grundlage jeder Aussage ueber "passt das noch rein". Ohne diese Zahlen ist eine Lastprognose
// eine Behauptung. Alles per `select` gemessen; in diesem Sprint wurde keine Zeile geschrieben.
//
// WARUM DAS WICHTIG IST: der Vorsprint stellte "bis 192 Rohdokumente/Tag" einer
// "Verarbeitungskapazitaet von ~15-20 Understandings/Tag" gegenueber und kam so zu einem
// dramatischen Missverhaeltnis. Beide Zahlen waren falsch angesetzt:
//   - Die reale Understanding-Leistung liegt bei ~40 Knowledge Objects pro Tag, nicht 15-20.
//   - Rohdokumente sind nicht Understandings: von den taeglich ~277 neuen Rohdokumenten wird
//     nur etwa jedes siebte ueberhaupt mit einem Knowledge Object verknuepft (~13 %).
// Die echte Obergrenze ist das LLM-TAGESBUDGET (100 + 30 Reserve, fail-closed) — und das ist
// im Messzeitraum EINMAL vollstaendig ausgeschoepft worden (2026-07-20: 100/100).
const LAST_IST_20260726 = Object.freeze({
  gemessenAm: "2026-07-26",
  fenster: "7 bzw. 8 Tage (rollierend)",
  rohdokumenteProTag: 277,                 // 1937 in 7 Tagen
  quellenMitLieferung: 97,
  dokumenteJeQuelleProTagMedian: 1.14,     // NICHT max_items — der Median liegt bei gut einem Dokument
  dokumenteJeQuelleProTagMittel: 2.85,
  dokumenteJeQuelleProTagMax: 41.0,        // Deutschlandfunk Politik
  anteilRohdokumenteMitKoVerknuepfung: 0.13,
  knowledgeObjectsProTagMittel: 40,        // 11 volle Tage, 32..50
  knowledgeObjectsProTagMin: 32,
  knowledgeObjectsProTagMax: 50,
  llmCallsProTagMittel: 64,                // llm_budget_counters, 11 volle Tage
  llmCallsProTagMax: 100,                  // 2026-07-20 — Tagesbudget vollstaendig ausgeschoepft
  llmTagesbudget: 100,
  llmTagesreserve: 30,
  llmCallsJeRohdokument: 0.23,             // 64 / 277
  pendingRueckstand: 50,                   // 43 'pending' + 7 'failed'
  pendingWaechst: false,                   // alle 43 stammen vom 2026-07-02/03 — Alt-Bestand, kein Zulauf
  originalverweisAufgeloest: 0.995,        // 1928 von 1937 mit canonical_target_url ausserhalb news.google.com
  rohdokumenteNochMitGoogleUrl: 0
});

// --- Aufbau des Plans aus dem Landesmodul-Abbild ----------------------------------------------
function berlinWegeAusSeed() {
  const seed = buildLandesmodulSeed();
  const pubById = new Map(seed.publishers.map((p) => [p.id, p]));
  // Alle Wege, die dem Berliner Basis- ODER Parteipaket zugeordnet sind.
  const berlinPaketIds = new Set([BASISPAKET_ID, PARTEIPAKET_ID]);
  const wegIds = new Set(seed.packagePaths.filter((pp) => berlinPaketIds.has(pp.package_id)).map((pp) => pp.retrieval_path_id));
  const paketeJeWeg = new Map();
  for (const pp of seed.packagePaths) {
    if (!wegIds.has(pp.retrieval_path_id)) continue;
    if (!paketeJeWeg.has(pp.retrieval_path_id)) paketeJeWeg.set(pp.retrieval_path_id, []);
    paketeJeWeg.get(pp.retrieval_path_id).push(pp.package_id);
  }
  // Mehrlaendrig = derselbe Weg haengt zusaetzlich an einem NICHT-Berliner Paket (rbb24).
  const fremdpakete = new Map();
  for (const pp of seed.packagePaths) {
    if (!wegIds.has(pp.retrieval_path_id) || berlinPaketIds.has(pp.package_id)) continue;
    if (!fremdpakete.has(pp.retrieval_path_id)) fremdpakete.set(pp.retrieval_path_id, []);
    fremdpakete.get(pp.retrieval_path_id).push(pp.package_id);
  }

  return seed.retrievalPaths
    .filter((p) => wegIds.has(p.id))
    .map((p) => {
      const pub = pubById.get(p.publisher_id) || {};
      const live = LIVE_URTEILE[p.legacy_source_id] || null;
      const method = p.method === "opendata_xml" || p.method === "api_xml" ? "structured_download" : p.method;
      const nicht = NICHT_AKTIVIERT.find((n) => n.id === p.id) || null;
      const google = method === "googlenews_search";
      return {
        id: p.id,
        legacy_source_id: p.legacy_source_id,
        name: p.name,
        herausgeber: pub.name || null,
        publisher_type: pub.publisher_type || null,
        evidence_role: pub.evidence_role || null,
        method,
        parser: p.parser,
        url: p.url,
        query: p.query || null,
        max_items: p.max_items,
        priority: p.priority,
        is_critical: p.is_critical,
        klassen: [...(p.covers || [])].sort(),
        pakete: (paketeJeWeg.get(p.id) || []).slice().sort(),
        fremdpakete: (fremdpakete.get(p.id) || []).slice().sort(),
        mehrlaendrig: (fremdpakete.get(p.id) || []).length > 0,
        political_level: POLITICAL_LEVEL,
        geography_id: GEOGRAPHY_ID,
        // Ist-Zustand (Production 2026-07-26, read-only gemessen) und Zielzustand.
        ist: { status: "needs_review", activation_mode: "manual" },
        ziel: AKTIVIERUNGSSET.includes(p.id)
          ? { status: "healthy", activation_mode: "auto" }
          : (nicht ? { ...nicht.bleibt } : { status: "needs_review", activation_mode: "manual" }),
        aktiviert: AKTIVIERUNGSSET.includes(p.id),
        nichtAktiviertGrund: nicht ? nicht.grund : null,
        liveUrteil: live ? live.urteil : null,
        liveBeleg: live ? live.beleg : null,
        eingeschraenkt: Boolean(live && live.urteil === "geeignet mit Einschränkung"),
        // Abrufe je Crawl-Lauf (nur wenn aktiviert).
        abrufeMin: AKTIVIERUNGSSET.includes(p.id) ? 1 : 0,
        abrufeMax: AKTIVIERUNGSSET.includes(p.id)
          ? 1 + (google ? LAST_ANNAHMEN.maxItemsJeWeg * LAST_ANNAHMEN.requestsJeGoogleItemMax : 0)
          : 0
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// Pflichtklassen-Abdeckung: getrennt nach "liefert" (aktivierter Weg) und
// "nur vorbereitet" (Weg vorhanden, aber nicht aktiviert). Kein falsches Gruen.
function pflichtklassenAbdeckung(wege = berlinWegeAusSeed()) {
  const liefernd = new Set();
  const nurVorbereitet = new Set();
  for (const w of wege) {
    for (const k of w.klassen) (w.aktiviert ? liefernd : nurVorbereitet).add(k);
  }
  const basis = LANDESMODUL_BASIS_PFLICHTKLASSEN;
  return {
    basisGesamt: basis.length,
    basisLiefernd: basis.filter((k) => liefernd.has(k)),
    basisNurVorbereitet: basis.filter((k) => !liefernd.has(k) && nurVorbereitet.has(k)),
    basisOhneWeg: basis.filter((k) => !liefernd.has(k) && !nurVorbereitet.has(k)),
    parteiGesamt: LANDESMODUL_PARTEI_PFLICHTKLASSEN.length,
    parteiLiefernd: LANDESMODUL_PARTEI_PFLICHTKLASSEN.filter((k) => liefernd.has(k)),
    parteiNurVorbereitet: LANDESMODUL_PARTEI_PFLICHTKLASSEN.filter((k) => !liefernd.has(k) && nurVorbereitet.has(k))
  };
}

// Erwartete Zusatzlast einer Aktivierung. Alle Werte sind Ober-/Untergrenzen mit
// benannten Annahmen — keine Punktschaetzung, keine Behauptung "keine Auswirkungen".
function lastprognose(wege = berlinWegeAusSeed()) {
  const aktiv = wege.filter((w) => w.aktiviert);
  const google = aktiv.filter((w) => w.method === "googlenews_search");
  const direkt = aktiv.filter((w) => w.method !== "googlenews_search");
  const abrufeMin = aktiv.reduce((s, w) => s + w.abrufeMin, 0);
  const abrufeMax = aktiv.reduce((s, w) => s + w.abrufeMax, 0);
  return {
    wegeProLauf: aktiv.length,
    davonGoogleNews: google.length,
    davonDirektfeeds: direkt.length,
    abrufeProLaufMin: abrufeMin,
    abrufeProLaufMax: abrufeMax,
    abrufeProTagMin: abrufeMin * LAST_ANNAHMEN.crawlLaeufeProTag,
    abrufeProTagMax: abrufeMax * LAST_ANNAHMEN.crawlLaeufeProTag,
    googleRequestsProLaufMax: google.reduce((s, w) => s + w.abrufeMax, 0),
    dokumenteProLaufMax: aktiv.length * LAST_ANNAHMEN.maxItemsJeWeg,
    dokumenteProTagMax: aktiv.length * LAST_ANNAHMEN.maxItemsJeWeg * LAST_ANNAHMEN.crawlLaeufeProTag,
    llmCallsDurchCrawl: 0,
    annahmen: { ...LAST_ANNAHMEN }
  };
}

// Realistische Prognose gegen den GEMESSENEN Ist-Betrieb. Die Obergrenze oben ist eine
// Obergrenze — sie unterstellt, dass jeder Weg in jeder Runde max_items fabrikneue Dokumente
// liefert. Gemessen liefert eine Quelle im Median 1,14 Dokumente pro TAG. Beides wird
// ausgewiesen; die Entscheidung braucht die Spanne, nicht eine geschoente Punktzahl.
//
// Der Erstlauf ist gesondert ausgewiesen: ein neu aktivierter Feed holt einmalig seinen
// Bestand (bis max_items je Weg) und ist danach nur noch inkrementell.
function lastprognoseRealistisch(wege = berlinWegeAusSeed(), ist = LAST_IST_20260726) {
  const aktiv = wege.filter((w) => w.aktiviert);
  const n = aktiv.length;
  const median = n * ist.dokumenteJeQuelleProTagMedian;
  const mittel = n * ist.dokumenteJeQuelleProTagMittel;
  const erstlauf = n * LAST_ANNAHMEN.maxItemsJeWeg;
  const rechne = (dok) => Math.round(dok * ist.llmCallsJeRohdokument * 10) / 10;
  return {
    wege: n,
    // Dauerbetrieb
    dokumenteProTagMedian: Math.round(median * 10) / 10,
    dokumenteProTagMittel: Math.round(mittel * 10) / 10,
    anteilAmIstEingangMedian: Math.round((median / ist.rohdokumenteProTag) * 1000) / 10, // Prozent
    anteilAmIstEingangMittel: Math.round((mittel / ist.rohdokumenteProTag) * 1000) / 10,
    zusaetzlicheLlmCallsProTagMedian: rechne(median),
    zusaetzlicheLlmCallsProTagMittel: rechne(mittel),
    llmProTagNachAktivierungMittel: Math.round((ist.llmCallsProTagMittel + rechne(mittel)) * 10) / 10,
    llmTagesbudget: ist.llmTagesbudget,
    // Der einzige echte Ausschlag: der Erstbestand beim ersten Lauf.
    erstlaufDokumenteMax: erstlauf,
    erstlaufLlmCallsMax: rechne(erstlauf),
    // Ehrliche Einordnung statt Beruhigung.
    budgetReichtImMittel: (ist.llmCallsProTagMittel + rechne(mittel)) <= ist.llmTagesbudget,
    budgetReichtAmSpitzentag: (ist.llmCallsProTagMax + rechne(mittel)) <= ist.llmTagesbudget,
    hinweis: "Am gemessenen Spitzentag (2026-07-20, 100/100) gibt es KEINEN Spielraum. Das Budget "
      + "ist fail-closed: es bricht nicht, es verschiebt Arbeit auf den Folgetag."
  };
}

// Bekannte Einschraenkungen je Weg — jede mit Ausfallform und Monitoring-Signal.
// Eine eingeschraenkte Quelle darf NICHT als voll funktionsfaehig gefuehrt werden.
const EINSCHRAENKUNGEN = Object.freeze([
  Object.freeze({
    weg: "rp-rbb24-politik", art: "mehrlaendrig",
    beschreibung: "rbb ist ein Zwei-Laender-Sender; /politik mischt Berlin UND Brandenburg. Der Weg haengt in beiden Landespaketen.",
    ausfallform: "Brandenburg-Inhalte im Berliner Rohstrom; geografische Fehlklassifizierung moeglich.",
    monitoring: "Anteil der Dokumente dieses Wegs mit erkannter Geografie geo-land-brandenburg.",
    alternative: "spaeter ein geo-gefilterter rbb-Regionalfeed, falls der Sender einen anbietet."
  }),
  Object.freeze({
    weg: "rp-be-regionale_leitmedien", art: "paywall",
    beschreibung: "Tagesspiegel-RSS liefert Metadaten frei; 'Tagesspiegel Plus'-Artikel nur als Teaser.",
    ausfallform: "Volltext fehlt, Erkennung bleibt moeglich; bei Feed-Umbau 404 oder leerer Feed.",
    monitoring: "leere Laeufe dieses Wegs in source_crawl_telemetry (status='empty').",
    alternative: "keine gleichwertige freie Berliner Leitmedien-Quelle bekannt."
  }),
  Object.freeze({
    weg: "rp-be-landesparlament", art: "veraltet",
    beschreibung: "Kein Direktfeed des Abgeordnetenhauses auffindbar; Abruf laeuft ueber Google News (site:parlament-berlin.de). Die Domain selbst antwortet generischen Bots mit 403. NEU 2026-07-26: der Suchweg liefert HTTP 200 und 20 parsbare Items, das juengste ist aber 156 Tage alt (2026-07-14: 23 Tage).",
    ausfallform: "Der Weg ist erreichbar, traegt zur Tageslage aber nichts bei — der gefaehrlichere Ausfall, weil Telemetrie 'ok' meldet. Zusaetzlich Google-Drosselung (Befund B1).",
    monitoring: "Alter des juengsten Dokuments je Weg (nicht nur status='ok'); 429-Rate und circuit-open-Zeilen.",
    alternative: "Suchanfrage breiter fassen (ohne site:-Operator) oder Direktfeed erneut suchen — beides erst nach erneuter Verifikation aktivierbar."
  }),
  Object.freeze({
    weg: "rp-be-staatskanzlei", art: "teilmenge",
    beschreibung: "Suchweg zum Regierenden Buergermeister; inhaltlich Teilmenge von rp-be-landesregierung.",
    ausfallform: "Duplikate gegen landesregierung; leere Laeufe an ruhigen Tagen.",
    monitoring: "Duplikatquote zwischen den beiden Wegen (dedup-global).",
    alternative: "Weg streichen, wenn die Duplikatquote dauerhaft hoch ist."
  }),
  Object.freeze({
    weg: "rp-be-landesregierung", art: "aggregator-umweg",
    beschreibung: "Der Landespressedienst-Basisfeed war beim Live-Test leer; Ersatz ist eine Google-News-Suche (Senat Berlin site:berlin.de).",
    ausfallform: "Google-Drosselung; Suchtreffer statt amtlicher Vollstaendigkeit.",
    monitoring: "Anteil der Dokumente mit Zieldomain berlin.de.",
    alternative: "LPD-Feed erneut pruefen (institutions[]-Filter)."
  }),
  Object.freeze({
    weg: "rp-be-landesfraktionen", art: "veraltet",
    beschreibung: "Die Fraktionsseite des Abgeordnetenhauses ist eine Landingpage ohne RSS; Ersatz ist eine Google-News-Suche. NEU 2026-07-26: HTTP 200, 20 Items, juengstes 41 Tage alt (2026-07-14: 28 Tage). Die Phrasensuche \"Abgeordnetenhaus Berlin\" Fraktion ist zu eng.",
    ausfallform: "Erreichbar, aber ohne aktuelle Fraktionsaeusserungen; unvollstaendige Fraktionsabdeckung.",
    monitoring: "Alter des juengsten Dokuments; Verteilung der gefundenen Fraktionen.",
    alternative: "Suchanfrage entquoten oder Buendel der fuenf Einzel-Fraktionsfeeds — beides erst nach erneuter Verifikation."
  }),
  Object.freeze({
    weg: "rp-be-plenum", art: "strukturell-inert",
    beschreibung: "PARDOK-Dispatch liefert in JEDEM Modus 0 Items; ein Live-Modus ist nicht implementiert.",
    ausfallform: "keine — der Weg wird nicht aktiviert und erzeugt keinen Abruf.",
    monitoring: "entfaellt (kein Abruf).",
    alternative: "PARDOK-Cutover (Schritt D/E) als eigener, freigabepflichtiger Sprint."
  })
]);

// Nachweis der Nicht-Beruehrung: welche Kennungen dieser Plan NIEMALS anfasst.
const NICHT_BERUEHRT = Object.freeze({
  paketKeys: Object.freeze(["brandenburg-basis", "die-linke-brandenburg", "bund-basis",
    "arbeit-und-soziales", "die-linke-bund", "regional-niedersachsen"]),
  wegPraefixe: Object.freeze(["rp-bb-"]),
  hinweis: "rp-rbb24-politik haengt zusaetzlich an brandenburg-basis. Der Plan aendert an dieser "
    + "Zuordnung NICHTS — er aktiviert den Weg ueber die Berliner Referenz. brandenburg-basis "
    + "bleibt 'prepared' und steuert 0 Referenzen bei."
});

// Selbstpruefung der Plandaten: jeder Berliner Weg gehoert in GENAU EINE der beiden Listen
// (Aktivierungsset oder NICHT_AKTIVIERT), und kein Weg im Aktivierungsset darf am
// Verifikationsgate scheitern. Beides waere sonst ein stiller Planfehler.
function planpruefung(wege = berlinWegeAusSeed()) {
  const nichtIds = new Set(NICHT_AKTIVIERT.map((n) => n.id));
  const ohneEinstufung = wege.filter((w) => !AKTIVIERUNGSSET.includes(w.id) && !nichtIds.has(w.id)).map((w) => w.id);
  const doppelt = wege.filter((w) => AKTIVIERUNGSSET.includes(w.id) && nichtIds.has(w.id)).map((w) => w.id);
  const gateVerletzung = AKTIVIERUNGSSET
    .map((id) => ({ id, urteil: darfAktiviertWerden(id) }))
    .filter((x) => !x.urteil.erlaubt);
  const stufenWege = AKTIVIERUNGSSTUFEN.flatMap((s) => s.wege);
  const stufenVollstaendig = stufenWege.slice().sort().join(",") === AKTIVIERUNGSSET.slice().sort().join(",");
  return {
    ok: !ohneEinstufung.length && !doppelt.length && !gateVerletzung.length && stufenVollstaendig,
    ohneEinstufung, doppelt, gateVerletzung, stufenVollstaendig,
    unterBeobachtung: AKTIVIERUNGSSET.filter((id) => darfAktiviertWerden(id).beobachtung)
  };
}

module.exports = {
  LAND, GEOGRAPHY_ID, POLITICAL_LEVEL,
  BASISPAKET_ID, BASISPAKET_KEY, PARTEIPAKET_ID, PARTEIPAKET_KEY,
  AKTIVIERUNGSSET, AKTIVIERUNGSSTUFEN, NICHT_AKTIVIERT, UMHAENGUNG, VORAUSSETZUNGEN,
  LAST_ANNAHMEN, LAST_IST_20260726, EINSCHRAENKUNGEN, NICHT_BERUEHRT,
  VERIFIKATION_20260726, VERIFIKATION_META, darfAktiviertWerden, frischeStufe,
  berlinWegeAusSeed, pflichtklassenAbdeckung, lastprognose, lastprognoseRealistisch, planpruefung
};
