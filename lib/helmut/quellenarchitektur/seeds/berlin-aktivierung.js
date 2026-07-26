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

const LAND = "berlin";
const GEOGRAPHY_ID = "geo-land-berlin";
const POLITICAL_LEVEL = "land";
const BASISPAKET_ID = "pkg-berlin-basis";
const BASISPAKET_KEY = "berlin-basis";
const PARTEIPAKET_ID = "pkg-die-linke-berlin";
const PARTEIPAKET_KEY = "die-linke-berlin";

// --- Was aktiviert wird ----------------------------------------------------------------------
// Die 6 Wege des NEUTRALEN Basispakets, die real Dokumente in die sichtbare Pipeline liefern
// koennen. Zielzustand je Weg: status='healthy', activation_mode='auto'.
const AKTIVIERUNGSSET = Object.freeze(["rp-be-landesparlament", "rp-be-landesregierung",
  "rp-be-staatskanzlei", "rp-be-landesfraktionen", "rp-be-regionale_leitmedien", "rp-rbb24-politik"]);

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
  crawlLaeufeProTag: 2,           // vercel.json: 0 4 * * * und 0 20 * * *
  crawlNebenlaufigkeit: 20,       // crawler.js crawlConcurrency (CRAWLER_CONCURRENCY, Default 20)
  funktionsLaufzeitSekundenMax: 300, // vercel.json functions.api/index.js.maxDuration
  llmCallsJeWeg: 0                // Crawl ruft KEIN LLM; Kosten entstehen erst im Understanding
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
    weg: "rp-be-landesparlament", art: "aggregator-umweg",
    beschreibung: "Kein Direktfeed des Abgeordnetenhauses auffindbar; Abruf laeuft ueber Google News (site:parlament-berlin.de). Die Domain selbst antwortet generischen Bots mit 403.",
    ausfallform: "Google-Drosselung (429) trifft diesen Weg wie alle Google-Wege; Befund B1.",
    monitoring: "429-Rate und circuit-open-Zeilen je Weg.",
    alternative: "Direktfeed erneut suchen, sobald das Abgeordnetenhaus einen anbietet."
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
    weg: "rp-be-landesfraktionen", art: "aggregator-umweg",
    beschreibung: "Die Fraktionsseite des Abgeordnetenhauses ist eine Landingpage ohne RSS; Ersatz ist eine Google-News-Suche.",
    ausfallform: "Google-Drosselung; unvollstaendige Fraktionsabdeckung.",
    monitoring: "leere Laeufe; Verteilung der gefundenen Fraktionen.",
    alternative: "Buendel der fuenf Einzel-Fraktionsfeeds, falls vorhanden."
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

module.exports = {
  LAND, GEOGRAPHY_ID, POLITICAL_LEVEL,
  BASISPAKET_ID, BASISPAKET_KEY, PARTEIPAKET_ID, PARTEIPAKET_KEY,
  AKTIVIERUNGSSET, NICHT_AKTIVIERT, UMHAENGUNG, VORAUSSETZUNGEN,
  LAST_ANNAHMEN, EINSCHRAENKUNGEN, NICHT_BERUEHRT,
  berlinWegeAusSeed, pflichtklassenAbdeckung, lastprognose
};
