"use strict";

// Helmut — Quellenarchitektur · Sprint (Validierung): strukturierte VORBEREITUNG des
// Bund-Fachthemenpakets „Wohnen, Bauen & Stadtentwicklung" als Herausgeber / Abrufwege /
// Paketzuordnungen / politische Ebene / Geografie.
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Dieses Modul ist — wie seeds/landesmodule-quellen.js — ein EIGENSTÄNDIGES, additiv
// vorbereitetes Abbild. Es wird NICHT in index.buildFullModel() verdrahtet: der
// hartkodierte Katalog (catalog.js) + die Kern-Seeds (entities/publishers/packages)
// bleiben BYTE-IDENTISCH. Es verändert damit KEINE Bestandsquelle, kein Registry, keinen
// Generator, keine Methodik.
//
// STATUS: das Paket ist VOLLSTÄNDIG INAKTIV vorbereitet.
//   - retrieval_paths: status "needs_review" (nie healthy/active), activation_mode "manual"
//     (nie auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - Paket wohnen-bauen-stadtentwicklung-bund trägt status "prepared" (NICHT active) und
//     lebt bewusst NUR in diesem Seed, NICHT in seeds/packages.js PACKAGE_DEFINITIONS.
//     -> computeGlobalActivation/buildFullModel kennen es nicht; es kann nichts auslösen.
//   - path_expected_levels = ["bund"], path_expected_geographies = ["geo-bund"].
// Das Anwenden auf Production (DB-Insert) bleibt ein eigener, ausdrücklich freigabepflichtiger
// Schritt (idempotentes ON-CONFLICT-DO-NOTHING-SQL, siehe scripts/generate-wohnen-bauen-seed.js).
//
// WIEDERVERWENDUNG STATT DUBLETTEN (Auftrag §1/§3): bestehende Herausgeber/Entitäten werden
// über ihre KANONISCHE ID wiederverwendet, nicht neu erzeugt:
//   - Destatis  -> Entität statoffice-destatis + Herausgeber publisher-destatis.de (existiert)
//   - Bundesrat -> Entität parliament-bundesrat + Herausgeber publisher-bundesrat.de (existiert)
//   - Bundestag/DIP -> parlamentarische Abdeckung liegt bereits im Basispaket bund-basis
//     (DIP-API rp-dip, always_on) + der Fachausschuss existiert als Entität
//     committee-bt-bau-wohnen. Es wird KEIN paralleler parlamentarischer Weg erzeugt.
// Nur echte, im Bestand FEHLENDE Organisationen werden ergänzt (NEUE_ENTITAETEN).
//
// EHRLICHKEIT (Verifikations-Vorbehalt): Der Egress dieser Umgebung ist per Org-Policy für
// deutsche Gov-/Medien-Domains gesperrt (403 CONNECT beim Proxy; bmwsb.bund.de, bbsr.bund.de,
// destatis.de, gmbl-online.de real geblockt — siehe Integrationsprotokoll). Es wurde daher
// KEINE Feed-/API-URL erfunden. Jeder vorbereitete Weg nutzt eine `site:`-Google-News-Suche
// über die REALE, per WebSearch belegte Herausgeber-Domain — genau das Muster, das der
// Bundeswege-Reparatur-Seed und der Landesmodul-Seed für nicht byte-verifizierbare Direktfeeds
// verwenden. `nativeFeedHint` dokumentiert, wo ein nativer Feed vermutet wird (vor Aktivierung
// byte-genau zu prüfen). `verifyBeforeActivation: true` bleibt überall gesetzt.

const PACKAGE = Object.freeze({
  id: "pkg-wohnen-bauen-stadtentwicklung-bund",
  key: "wohnen-bauen-stadtentwicklung-bund",
  name: "Wohnen, Bauen & Stadtentwicklung (Bund)",
  purpose: "Fachthemenpaket Wohnungs-, Bau- und Stadtentwicklungspolitik auf Bundesebene "
    + "(Ministerium, Bau-/Stadt-/Raumforschung, amtliche Statistik, Förderbank, kommunale "
    + "Spitzenverbände, Stadtforschung). Fachthema, NICHT Region. VORBEREITET/INAKTIV.",
  status: "prepared",
  is_base: false,
  political_level: "bund",
  geography_id: "geo-bund",
  required_classes: []
});

// Frequenzklassen (Auftrag §6): ereignisnah | regelmäßig | periodisch.
const FREQUENZKLASSEN = Object.freeze(["ereignisnah", "regelmaessig", "periodisch"]);

// --- Neu benötigte politische Entitäten (nur solche, die NICHT in seeds/entities.js stehen) --
// Bestehend genutzt (NICHT hier dupliziert): statoffice-destatis, parliament-bundesrat,
// parliament-bundestag, government-bund, committee-bt-bau-wohnen.
const NEUE_ENTITAETEN = [
  // canonical_key bewusst null (wie alle Ministerien in seeds/entities.js): der Resolver-
  // Schlüssel bleibt frei, keine Kollision mit dem Ausschuss committee-bt-bau-wohnen ("wohnen").
  { id: "ministry-bmwsb", entity_type: "ministry", name: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen", canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["BMWSB"] },
  { id: "authority-bbsr", entity_type: "authority", name: "Bundesinstitut für Bau-, Stadt- und Raumforschung", canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["BBSR", "BBR", "Bundesamt für Bauwesen und Raumordnung"] },
  { id: "authority-uba", entity_type: "authority", name: "Umweltbundesamt", canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["UBA"] },
  { id: "authority-bib", entity_type: "authority", name: "Bundesinstitut für Bevölkerungsforschung", canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["BiB"] },
  { id: "authority-kfw", entity_type: "authority", name: "KfW", canonical_key: null, level: "bund", geography_id: "geo-bund", aliases: ["Kreditanstalt für Wiederaufbau"] },
  { id: "association-difu", entity_type: "association", name: "Deutsches Institut für Urbanistik", canonical_key: null, level: null, geography_id: null, aliases: ["Difu"] },
  { id: "association-staedtetag", entity_type: "association", name: "Deutscher Städtetag", canonical_key: null, level: null, geography_id: null, aliases: ["Städtetag"] },
  { id: "association-landkreistag", entity_type: "association", name: "Deutscher Landkreistag", canonical_key: null, level: null, geography_id: null, aliases: ["Landkreistag", "DLT"] }
];

// --- Herausgeber-Metadaten je Domain -----------------------------------------------------
// `reuse: true` markiert einen bereits im Bestandskatalog existierenden Herausgeber (gleiche
// deterministische ID publisher-<domain>): das Seed-SQL setzt ON CONFLICT (id) DO NOTHING,
// die Bestandszeile bleibt unverändert -> KEINE Dublette. entity_id verweist auf die
// (bestehende oder neue) Entität.
const PUBLISHER_META = {
  "bmwsb.bund.de": { name: "Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen", type: "ministry", entity_id: "ministry-bmwsb", reuse: false },
  "bbsr.bund.de": { name: "Bundesinstitut für Bau-, Stadt- und Raumforschung (BBSR im BBR)", type: "authority", entity_id: "authority-bbsr", reuse: false },
  "destatis.de": { name: "Statistisches Bundesamt", type: "statistical_office", entity_id: "statoffice-destatis", reuse: true },
  "bundesrat.de": { name: "Bundesrat", type: "parliament", entity_id: "parliament-bundesrat", reuse: true },
  "umweltbundesamt.de": { name: "Umweltbundesamt", type: "authority", entity_id: "authority-uba", reuse: false },
  "bib.bund.de": { name: "Bundesinstitut für Bevölkerungsforschung", type: "authority", entity_id: "authority-bib", reuse: false },
  "kfw.de": { name: "KfW", type: "authority", entity_id: "authority-kfw", reuse: false },
  "difu.de": { name: "Deutsches Institut für Urbanistik", type: "association", entity_id: "association-difu", reuse: false },
  "staedtetag.de": { name: "Deutscher Städtetag", type: "association", entity_id: "association-staedtetag", reuse: false },
  "landkreistag.de": { name: "Deutscher Landkreistag", type: "association", entity_id: "association-landkreistag", reuse: false }
};

// --- Kernquellen (integrationsreif) ------------------------------------------------------
// Jeder Eintrag erzeugt GENAU EINEN Abrufweg (googlenews_search über die reale Domain).
// felder:
//   klasse            — stabiler Klassenschlüssel (Slug) für die legacy_source_id
//   publisher/domain  — kanonischer Herausgebername + reale Domain
//   evidenceRole      — official_primary | direct_interest | data_source | journalistic | aggregator
//   query             — die site:-Suchdefinition (KEINE erfundene Feed-URL)
//   frequenz          — Frequenzklasse (Auftrag §6)
//   produktnutzen     — hoch | mittel  (politische Entscheidungsrelevanz Bund)
//   nativeFeedHint    — vermuteter nativer Feed (vor Aktivierung byte-genau prüfen), oder null
//   note              — Verifikations-/Dedup-/Reuse-Hinweis
const KERNQUELLEN = [
  {
    klasse: "bmwsb-steuerung", publisher: "BMWSB", domain: "bmwsb.bund.de",
    evidenceRole: "official_primary",
    query: "site:bmwsb.bund.de (Wohnen OR Bauen OR Stadtentwicklung OR Wohngeld OR Baugesetzbuch OR Städtebauförderung)",
    frequenz: "regelmaessig", produktnutzen: "hoch",
    nativeFeedHint: "GSB-Pressemitteilungs-Feed (bmwsb.bund.de) vermutet — konkreten RSS-Pfad vor Aktivierung entnehmen.",
    note: "Zentraler politischer Steuerungshebel des Bundes (Stadtentwicklungsbericht jährlich=periodisch, PM laufend=regelmäßig). Domain in sourceSafety OFFICIAL_DOMAINS belegt. Egress hier gesperrt -> site:-Ersatz."
  },
  {
    klasse: "bbsr-forschung", publisher: "BBSR (im BBR)", domain: "bbsr.bund.de",
    evidenceRole: "data_source",
    query: "site:bbsr.bund.de (Raumordnung OR Wohnungsmarkt OR Städtebau OR Stadtentwicklung OR Raumforschung)",
    frequenz: "periodisch", produktnutzen: "hoch",
    nativeFeedHint: "BBSR-Veröffentlichungen/News-Feed vermutet — vor Aktivierung prüfen.",
    note: "Wissenschaftliches Gedächtnis der Bundespolitik. BBSR ist der Forschungsbereich IM BBR (bbr.bund.de) — EINE Institution, hier EINE Entität authority-bbsr (BBR als Alias). KEINE Doppelmodellierung BBR/BBSR."
  },
  {
    klasse: "destatis-bau-wohnen", publisher: "Statistisches Bundesamt", domain: "destatis.de",
    evidenceRole: "data_source",
    query: "site:destatis.de (Baugenehmigungen OR Baufertigstellungen OR Bautätigkeit OR Wohnungsbau OR Wohnungsbestand OR Baupreise)",
    frequenz: "regelmaessig", produktnutzen: "hoch",
    nativeFeedHint: "GENESIS-Online / Destatis-Themenseite Bautätigkeit — strukturierter Zugang später prüfen (kein erfundener API-Pfad).",
    note: "Objektive Datenbasis (Baugenehmigungen monatlich=regelmäßig, Wohnungsbestand jährlich=periodisch). Herausgeber+Entität BESTEHEN (reuse) — bündelt mehrere Reihen über EINEN Weg (Auftrag §3 Destatis)."
  },
  {
    klasse: "bundesrat-staedtebau", publisher: "Bundesrat", domain: "bundesrat.de",
    evidenceRole: "official_primary",
    query: "site:bundesrat.de (Städtebau OR Wohnungswesen OR Raumordnung OR Baugesetzbuch OR Baulandmobilisierung)",
    frequenz: "regelmaessig", produktnutzen: "mittel",
    nativeFeedHint: "Bundesrat-Plenum/Ausschuss-Feed vermutet — vor Aktivierung prüfen.",
    note: "Länderinteressen im Bundesgesetzgebungsverfahren (Ausschuss für Städtebau, Wohnungswesen und Raumordnung). Herausgeber+Entität parliament-bundesrat BESTEHEN (reuse). Kein paralleler parlamentarischer Weg — thematische Sicht auf die eigene Domain."
  },
  {
    klasse: "uba-nachhaltiges-bauen", publisher: "Umweltbundesamt", domain: "umweltbundesamt.de",
    evidenceRole: "data_source",
    query: "site:umweltbundesamt.de (nachhaltiges Bauen OR Gebäude OR Ressourcenschonung OR Umbaukultur OR klimagerechtes Bauen)",
    frequenz: "periodisch", produktnutzen: "mittel",
    nativeFeedHint: "UBA-Presse/Publikations-Feed vermutet — vor Aktivierung prüfen.",
    note: "Klimagerechtes/ressourcenschonendes Bauen. Thematisch gefiltert, damit der breite UBA-Output auf das Baufeld begrenzt bleibt."
  },
  {
    klasse: "bib-demografie", publisher: "Bundesinstitut für Bevölkerungsforschung", domain: "bib.bund.de",
    evidenceRole: "data_source",
    query: "site:bib.bund.de (Wohnen OR Haushalte OR Wohnungsbedarf OR Bevölkerungsentwicklung OR Binnenwanderung)",
    frequenz: "periodisch", produktnutzen: "mittel",
    nativeFeedHint: "BiB besitzt laut WebSearch einen RSS-News-Feed (BiB.Aktuell ~10×/Jahr) — vor Aktivierung nativen Feed byte-genau prüfen und ggf. bevorzugen.",
    note: "Demografische Grundlagen für Wohnungsbedarfsprognosen. Nativer RSS existiert -> starker Kandidat für Direkt-Feed-Upgrade vor Live-Gang."
  },
  {
    klasse: "kfw-foerderung", publisher: "KfW", domain: "kfw.de",
    evidenceRole: "data_source",
    query: "site:kfw.de (Förderprogramm OR Wohngebäude OR Neubau OR Sanierung OR Wohneigentum) (Wohnen OR Bauen)",
    frequenz: "ereignisnah", produktnutzen: "hoch",
    nativeFeedHint: "KfW-Newsroom/Programm-Änderungs-Feed vermutet — vor Aktivierung prüfen.",
    note: "Förderinstrumente (klimafreundlicher Neubau, energetische Sanierung). Programmänderungen laufend+kurzfristig -> ereignisnah. Auftrag §3 KfW: dauerhaft politikrelevant -> eigener Retrieval Path gerechtfertigt, thematisch auf Wohnen/Bauen begrenzt."
  },
  {
    klasse: "staedtetag-kommunal", publisher: "Deutscher Städtetag", domain: "staedtetag.de",
    evidenceRole: "direct_interest",
    query: "site:staedtetag.de (Wohnungsbau OR Städtebauförderung OR Baurecht OR Wohnen OR Bodenpolitik)",
    frequenz: "regelmaessig", produktnutzen: "mittel",
    nativeFeedHint: "Städtetag-Presse/Positionspapier-Feed vermutet — vor Aktivierung prüfen.",
    note: "Kommunale Spitzenverband-Positionen zu Gesetzesvorhaben. Nicht-Bund (association), aber unmittelbar bundespolitisch wirksam (Positionspapiere zu BauGB/Förderung)."
  },
  {
    klasse: "landkreistag-laendlich", publisher: "Deutscher Landkreistag", domain: "landkreistag.de",
    evidenceRole: "direct_interest",
    query: "site:landkreistag.de (Wohnen OR Bauen OR Raumordnung OR gleichwertige Lebensverhältnisse OR Baurecht)",
    frequenz: "periodisch", produktnutzen: "mittel",
    nativeFeedHint: "Landkreistag-Presse-Feed vermutet — vor Aktivierung prüfen.",
    note: "Ländliche Perspektive (gleichwertige Lebensverhältnisse). Publikationsfrequenz unregelmäßig -> periodisch."
  },
  {
    klasse: "difu-stadtforschung", publisher: "Deutsches Institut für Urbanistik", domain: "difu.de",
    evidenceRole: "journalistic",
    query: "site:difu.de (Stadtentwicklung OR Wohnen OR Kommunalfinanzen OR Smart City OR Städtebau)",
    frequenz: "periodisch", produktnutzen: "mittel",
    nativeFeedHint: "Difu-Berichte/News-Feed vermutet — vor Aktivierung prüfen.",
    note: "Größtes kommunalwissenschaftliches Institut. Nicht-Bund; ergänzt die amtliche Sicht um angewandte Stadtforschung."
  }
];

// --- Future Targets (fachlich wertvoll, technisch (noch) NICHT integrationsreif) ----------
// Auftrag §3: keine fachlich gute Quelle wegen technischer Schwierigkeiten fachlich abwerten.
// Diese erzeugen BEWUSST KEINEN Abrufweg (kein Publisher-Row, kein Path), sondern bleiben
// dokumentierte Ziele — exakt wie ABGELEHNTE_KANDIDATEN im Landesmodul.
const FUTURE_TARGETS = [
  {
    id: "gmbl", name: "Gemeinsames Ministerialblatt (GMBl)", domain: "gmbl-online.de",
    fachqualitaet: "A (amtliches Publikationsorgan der Bundesregierung, hrsg. BMI seit 1950; Verwaltungsvorschriften/Richtlinien/Erlasse)",
    grund: "Technisch ungeeignet für automatisierten Abruf: Volltext-PDF nur für Abonnenten (Paywall ~41,90€/20 Hefte, Registrierung); Recherche frei, aber KEIN RSS/API nachgewiesen. -> Future Target, NICHT fachlich abgewertet.",
    frequenz: "regelmaessig"
  },
  {
    id: "argebau-beschluesse", name: "Bauministerkonferenz (ARGEBAU) — Beschlussdatenbank / Musterbauordnung", domain: "bauministerkonferenz.de",
    fachqualitaet: "A (Musterbauordnung MBO = Grundlage aller Landesbauordnungen; föderale Länder-Ebene)",
    grund: "ASP.NET-Portal (.aspx) + IS-ARGEBAU-Downloadbereich, KEIN RSS/API; Beschlüsse werden ereignisweise als Dokumente publiziert. Systematischer Zugang zur Beschlussdatenbank = Future Target #1 der Facharchitektur.",
    frequenz: "ereignisnah"
  },
  {
    id: "wohnungsmarktbeobachtung-laender", name: "Wohnungsmarktbeobachtung der Länder", domain: null,
    fachqualitaet: "B/A (systematische Aggregation dezentraler Länderberichte)",
    grund: "Dezentral, keine einheitliche Bezugsquelle -> erst nach Landesmodul-Ausbau aggregierbar. Future Target.",
    frequenz: "periodisch"
  },
  {
    id: "forschungsdatenzentren-statistik", name: "Forschungsdatenzentren der Statistik (Mikrodaten)", domain: "forschungsdatenzentrum.de",
    fachqualitaet: "A (Mikrodaten für tiefe Analysen)",
    grund: "Nur über kontrollierten, antragspflichtigen Zugang -> kein offener Abrufweg. Future Target.",
    frequenz: "periodisch"
  },
  {
    id: "landesbauordnungen-vergleich", name: "Bauordnungsrecht der Länder (systematischer Vergleich)", domain: null,
    fachqualitaet: "B (16 Landesbauordnungen)",
    grund: "Bisher nur manueller Vergleich; kein strukturierter Sammelfeed. Future Target (koppelt an Landesmodule).",
    frequenz: "periodisch"
  }
];

// --- Bewusst wiederverwendete Bestandsstrukturen (Dokumentation, KEINE neuen Rows) --------
const REUSED = [
  { kind: "entity", id: "statoffice-destatis", warum: "Destatis existiert bereits als typisierte Entität — wiederverwendet, nicht dupliziert." },
  { kind: "publisher", id: "publisher-destatis.de", warum: "Herausgeber Destatis existiert im Bestandskatalog — ON CONFLICT DO NOTHING, Bestandszeile unverändert." },
  { kind: "entity", id: "parliament-bundesrat", warum: "Bundesrat existiert bereits — wiederverwendet für den Ausschuss Städtebau/Wohnungswesen/Raumordnung." },
  { kind: "publisher", id: "publisher-bundesrat.de", warum: "Herausgeber Bundesrat existiert im Bestandskatalog — reuse." },
  { kind: "entity", id: "committee-bt-bau-wohnen", warum: "Bundestags-Fachausschuss (Bauen und Wohnen) existiert bereits — KEIN paralleler parlamentarischer Weg. (Amtl. voller Name der 21. WP: 'Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen'.)" },
  { kind: "retrieval_path", id: "rp-dip", warum: "DIP-API (Bundestag/Bundesrat-Drucksachen & Vorgänge) ist bereits ein aktiver always_on-Abrufweg im Basispaket bund-basis — deckt Drucksachen/Anträge/Gesetzentwürfe zu BauGB etc. ab. KEIN Parallelweg." },
  { kind: "entity", id: "parliament-bundestag", warum: "Bundestag existiert — parlamentarische Abdeckung über bund-basis + DIP, nicht neu modelliert." },
  { kind: "publisher", id: "aggregator-google-news", warum: "Aggregator-Herausgeber für die site:-Suchwege existiert bereits." }
];

// --- Bewusst NICHT in DIESEM Paket (Scope-Ehrlichkeit) -----------------------------------
// Ergänzende Verbände/EU-Quellen aus der Facharchitektur bleiben bewusst außen vor (Fokus
// dieses Sprints = Bund-Kern). Sie sind dokumentiert, damit spätere Threads sie nicht neu
// „entdecken" müssen.
const NICHT_IN_PAKET = [
  { name: "GdW, ZIA, Bundesarchitektenkammer, Bundesingenieurkammer, Deutscher Verband", grund: "Ergänzende Wirtschafts-/Kammerquellen (Kategorie 'ergänzend', B/★★★). Nicht Bund-Kern — später erweiterbar." },
  { name: "BKG, Demografieportal", grund: "Geodaten/Portal — unterstützend, nicht politikentscheidend für dieses Paket." },
  { name: "EU-Kommission Regionalpolitik, ESPON", grund: "EU-Ebene — eigener geografischer Scope (nicht Bund)." },
  { name: "Tagespresse, Immobilienportale, Gutachterausschüsse, Social Media, Wikipedia, Parteipublikationen", grund: "Von der Facharchitektur ausdrücklich ausgeschlossen (keine politikrelevante Primärtiefe / nicht neutral)." }
];

// --- Reine Helfer ------------------------------------------------------------------------

function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, ""); }

// Google-News-Such-URL aus einer site:-Suchdefinition (keine erfundene Feed-URL, nur der
// bekannte Aggregator-Endpunkt mit encodetem q). Deutsch, DE-Region.
function googleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
}

// Pflicht-Primärquelle (nie still archivieren): amtliche Herausgeber (official_primary).
function isCritical(evidenceRole) { return evidenceRole === "official_primary"; }

// Baut das vorbereitete Paket-Abbild (dedup-bewusst) aus den Kernquellen.
function buildWohnenBauenSeed() {
  const publishers = new Map();
  const pathByKey = new Map();          // `${method}|${url}` -> retrieval_path (global dedup)
  const packagePaths = [];
  const pathExpectedLevels = [];
  const pathExpectedGeographies = [];
  const seenPkgPath = new Set();

  function upsertPublisher(domain) {
    const meta = PUBLISHER_META[domain] || { name: domain, type: "other_institution", entity_id: null, reuse: false };
    const id = domain === "news.google.com" ? "aggregator-google-news" : `publisher-${slug(domain)}`;
    if (!publishers.has(id)) {
      publishers.set(id, {
        id, name: meta.name, canonical_domain: domain, publisher_type: meta.type,
        evidence_role: publisherEvidenceRole(meta.type),
        trust: meta.reuse ? "hoch" : "unbekannt", lifecycle_status: "active",
        entity_id: meta.entity_id || null,
        reuse: !!meta.reuse, prepared: true
      });
    }
    return id;
  }

  for (const c of KERNQUELLEN) {
    const publisherId = upsertPublisher(c.domain);
    const method = "googlenews_search";
    const url = googleNewsUrl(c.query);
    const key = `${method}|${url}`;
    let path = pathByKey.get(key);
    if (!path) {
      path = {
        id: `rp-wbs-${c.klasse}`,
        publisher_id: publisherId,
        legacy_source_id: `wbs-${c.klasse}`,
        name: `${c.publisher} — Wohnen/Bauen/Stadtentwicklung`,
        method,
        url,
        query: c.query,
        parser: "googlenews-batchexecute",
        priority: 60,
        status: "needs_review",       // VORBEREITET — nie healthy/broken
        activation_mode: "manual",    // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
        is_critical: isCritical(c.evidenceRole),
        max_items: 16,
        frequenz: c.frequenz,
        evidence_role: c.evidenceRole,
        native_feed_hint: c.nativeFeedHint || null,
        verify_before_activation: true,
        covers: [c.klasse],
        prepared: true
      };
      pathByKey.set(key, path);
      pathExpectedLevels.push({ retrieval_path_id: path.id, level: "bund" });
      pathExpectedGeographies.push({ retrieval_path_id: path.id, geography_id: "geo-bund" });
    } else if (!path.covers.includes(c.klasse)) {
      path.covers.push(c.klasse);
      if (isCritical(c.evidenceRole)) path.is_critical = true;
    }
    const ppKey = `${PACKAGE.id}|${path.id}`;
    if (!seenPkgPath.has(ppKey)) { seenPkgPath.add(ppKey); packagePaths.push({ package_id: PACKAGE.id, retrieval_path_id: path.id }); }
  }

  const retrievalPaths = [...pathByKey.values()];
  return {
    package: PACKAGE,
    publishers: [...publishers.values()],
    entities: NEUE_ENTITAETEN,
    retrievalPaths,
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    futureTargets: FUTURE_TARGETS,
    reused: REUSED,
    summary: {
      status: "prepared",
      package: PACKAGE.key,
      publishers: publishers.size,
      publishersReused: [...publishers.values()].filter((p) => p.reuse).length,
      publishersNeu: [...publishers.values()].filter((p) => !p.reuse).length,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      abrufwege: retrievalPaths.length,
      abrufwegeKritisch: retrievalPaths.filter((p) => p.is_critical).length,
      paketzuordnungen: packagePaths.length,
      futureTargets: FUTURE_TARGETS.length,
      frequenz: retrievalPaths.reduce((m, p) => { m[p.frequenz] = (m[p.frequenz] || 0) + 1; return m; }, {}),
      // technisch inaktiv: kein Abrufweg ist aktiv/auto/always_on/healthy
      aktiveAbrufwege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length
    }
  };
}

// Herausgeber-evidence_role aus dem Publisher-Typ (DB-CHECK-konform, identisch zur
// Landesmodul-Logik): amtlich -> official_primary; Statistik -> data_source; Medien ->
// journalistic; Verband/Partei -> direct_interest; Aggregator -> aggregator.
function publisherEvidenceRole(type) {
  if (type === "aggregator") return "aggregator";
  if (type === "statistical_office") return "data_source";
  if (type === "media") return "journalistic";
  if (type === "association" || type === "union" || type === "party" || type === "parliamentary_group") return "direct_interest";
  return "official_primary";
}

module.exports = {
  buildWohnenBauenSeed,
  PACKAGE,
  PUBLISHER_META,
  NEUE_ENTITAETEN,
  KERNQUELLEN,
  FUTURE_TARGETS,
  REUSED,
  NICHT_IN_PAKET,
  FREQUENZKLASSEN,
  googleNewsUrl,
  publisherEvidenceRole
};
