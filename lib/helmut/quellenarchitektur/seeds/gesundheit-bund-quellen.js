"use strict";

// Helmut — Quellenarchitektur · Quellenpaket GESUNDHEIT (Bund): strukturierte, INAKTIVE
// Vorbereitung der fachlichen Kernquellen als Herausgeber / Abrufwege / Paketzuordnungen /
// politische Ebenen / Geografien.
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, keine KI, kein Storage-Write, KEIN Rendering.
// Baut nach demselben Muster wie seeds/landesmodule-quellen.js einen VORBEREITETEN Seed:
//   - retrieval_paths: status "needs_review" (NIE healthy/active), activation_mode "manual"
//     (NIE auto/always_on) -> werden nie automatisch aktiviert/gecrawlt.
//   - Zuordnung NUR zum Paket gesundheit-bund (Katalogstatus "prepared", siehe seeds/packages.js)
//     -> computeGlobalActivation aktiviert es NICHT (kein Profil-Mapping mappt darauf).
//   - path_expected_levels = ["bund"], path_expected_geographies = geo-bund.
// Damit ist das Politikfeld Gesundheit (Bund) strukturell vollständig vorbereitet, aber
// technisch INAKTIV. Das Anwenden auf Production (DB-Insert) bleibt ein eigener, ausdrücklich
// freigabepflichtiger Schritt. Dieses Modul erzeugt NUR das In-Memory-Abbild + eine anwendbare
// Seed-Struktur; es schreibt nichts und ist NICHT in buildFullModel/catalog.js verdrahtet.
//
// BESTANDSWIEDERVERWENDUNG (keine Duplikate, Auftrag §1/§7):
//   - Herausgeber bundesgesundheitsministerium.de / bundesrat.de / destatis.de existieren
//     bereits im Basis-Seed -> werden NUR referenziert (reusedPublisherIds), NICHT neu angelegt.
//   - Entitäten ministry-bmg / parliament-bundesrat / statoffice-destatis existieren bereits
//     -> werden NUR referenziert (reusedEntityIds), NICHT neu angelegt.
//   - Der parlamentarische Prozess (Bundestag, Ausschuss für Gesundheit) ist im Bestand bereits
//     über die DIP-API (rp-dip, Bund Basis) UND den Google-News-Weg rp-committee-gesundheit
//     (committee-bt-gesundheit, Bund Basis) abgedeckt -> es wird bewusst KEIN neuer Abrufweg für
//     Bundestags-Drucksachen erzeugt (Funktionsdublette vermieden, Auftrag §7).
//
// EHRLICHKEIT (Recherche-Vorbehalt, Auftrag §5): Die URLs sind per WebSearch belegt
// (Recherche-Ebene = "kandidat"), aber in dieser Sandbox NICHT byte-genau abrufbar
// (Egress-Proxy blockt jeden CONNECT, Kontroll-Abruf example.com = 403). Die byte-genaue
// Verifikation ist als eigene, DATIERTE Ebene in seeds/gesundheit-bund-verifikation.js geführt
// und über den etablierten offenen Egress-Runner (GitHub Actions) nachzuholen. Wo nur ein
// Feed-/API-Hub belegt ist (nicht der konkrete Deep-Link), trägt der Kandidat den robust
// byte-verifizierbaren googlenews_search-Weg (site:) UND dokumentiert die fachlich bevorzugte
// strukturierte Alternative in `strukturierteAlternative` (vor Aktivierung fixieren).

// Paketziel (Katalogstatus "prepared", siehe seeds/packages.js).
const PACKAGE_ID = "pkg-gesundheit-bund";
const GEO_BUND = "geo-bund";

// Frequenzklasse -> Empfehlung (Auftrag §6). Priorität wird in den Abrufweg geschrieben;
// Timeout/Retry sind KEINE Spalten von retrieval_paths -> als Betriebsempfehlung dokumentiert.
const FREQ = Object.freeze({
  ereignisnah: { priority: 85, expected_frequency: "anlassbezogen", timeoutMs: 20000, retries: 3 },
  regelmaessig: { priority: 65, expected_frequency: "woechentlich", timeoutMs: 20000, retries: 2 },
  periodisch:  { priority: 45, expected_frequency: "jaehrlich",     timeoutMs: 30000, retries: 2 }
});

// Herausgeber-evidence_role (DB-CHECK-konform) — spiegelt die fachliche Belegfunktion wider
// (Auftrag §3): normative Primärquelle/amtliche Zulassungsbehörde -> official_primary;
// amtliche Datenquelle / gesetzlich legitimierte Evidenz -> data_source;
// Interessenvertretung (Verband) -> direct_interest.
function methodParser(method) {
  return method === "rss" ? "rss-regex"
    : method === "structured_download" ? "genesis-csv"
    : method === "googlenews_search" ? "googlenews-batchexecute"
    : method === "html" ? "html-scrape"
    : method === "api" ? "api-json" : null;
}
function gnews(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=de&gl=DE&ceid=DE:de`;
}

// --- Herausgeber-Register --------------------------------------------------
// reuse:true  -> existiert bereits im Basis-Seed, wird NUR referenziert (kein Insert).
// reuse:false -> neuer Herausgeber (Insert).
const PUBLISHERS = Object.freeze({
  "bundesgesundheitsministerium.de": { id: "publisher-bundesgesundheitsministerium.de", name: "Bundesministerium für Gesundheit", type: "ministry", entity_id: "ministry-bmg", evidence_role: "official_primary", reuse: true },
  "bundesrat.de":            { id: "publisher-bundesrat.de", name: "Bundesrat", type: "parliament", entity_id: "parliament-bundesrat", evidence_role: "official_primary", reuse: true },
  "destatis.de":             { id: "publisher-destatis.de", name: "Statistisches Bundesamt", type: "statistical_office", entity_id: "statoffice-destatis", evidence_role: "data_source", reuse: true },
  "g-ba.de":                 { id: "publisher-g-ba.de", name: "Gemeinsamer Bundesausschuss", type: "other_institution", entity_id: "institution-g-ba", evidence_role: "official_primary", reuse: false },
  "rki.de":                  { id: "publisher-rki.de", name: "Robert Koch-Institut", type: "authority", entity_id: "authority-rki", evidence_role: "data_source", reuse: false },
  "gkv-spitzenverband.de":   { id: "publisher-gkv-spitzenverband.de", name: "GKV-Spitzenverband", type: "association", entity_id: "association-gkv-spitzenverband", evidence_role: "direct_interest", reuse: false },
  "kbv.de":                  { id: "publisher-kbv.de", name: "Kassenärztliche Bundesvereinigung", type: "association", entity_id: "association-kbv", evidence_role: "direct_interest", reuse: false },
  "dkgev.de":                { id: "publisher-dkgev.de", name: "Deutsche Krankenhausgesellschaft", type: "association", entity_id: "association-dkg", evidence_role: "direct_interest", reuse: false },
  "svr-gesundheit.de":       { id: "publisher-svr-gesundheit.de", name: "Sachverständigenrat zur Begutachtung der Entwicklung im Gesundheitswesen", type: "other_institution", entity_id: "institution-svr-gesundheit", evidence_role: "data_source", reuse: false },
  "bfarm.de":                { id: "publisher-bfarm.de", name: "Bundesinstitut für Arzneimittel und Medizinprodukte", type: "authority", entity_id: "authority-bfarm", evidence_role: "official_primary", reuse: false },
  "pei.de":                  { id: "publisher-pei.de", name: "Paul-Ehrlich-Institut", type: "authority", entity_id: "authority-pei", evidence_role: "official_primary", reuse: false },
  "iqwig.de":                { id: "publisher-iqwig.de", name: "Institut für Qualität und Wirtschaftlichkeit im Gesundheitswesen", type: "other_institution", entity_id: "institution-iqwig", evidence_role: "data_source", reuse: false },
  "bundesaerztekammer.de":   { id: "publisher-bundesaerztekammer.de", name: "Bundesärztekammer", type: "association", entity_id: "association-bundesaerztekammer", evidence_role: "direct_interest", reuse: false },
  "deutscher-pflegerat.de":  { id: "publisher-deutscher-pflegerat.de", name: "Deutscher Pflegerat", type: "association", entity_id: "association-deutscher-pflegerat", evidence_role: "direct_interest", reuse: false }
});

// --- Neu benötigte politische Entitäten (nur NICHT bereits in seeds/entities.js vorhandene) ---
// Bestehend genutzt (NICHT neu): ministry-bmg, parliament-bundesrat, statoffice-destatis,
// committee-bt-gesundheit, parliament-bundestag.
const NEUE_ENTITAETEN = Object.freeze([
  { id: "institution-g-ba", entity_type: "other_institution", name: "Gemeinsamer Bundesausschuss", canonical_key: "g-ba", level: "bund", geography_id: GEO_BUND, aliases: ["G-BA", "Gemeinsamer Bundesausschuss"] },
  { id: "authority-rki", entity_type: "authority", name: "Robert Koch-Institut", canonical_key: "rki", level: "bund", geography_id: GEO_BUND, aliases: ["RKI", "Robert Koch-Institut"] },
  { id: "association-gkv-spitzenverband", entity_type: "association", name: "GKV-Spitzenverband", canonical_key: "gkv-spitzenverband", level: "bund", geography_id: GEO_BUND, aliases: ["GKV-Spitzenverband", "GKV-SV"] },
  { id: "association-kbv", entity_type: "association", name: "Kassenärztliche Bundesvereinigung", canonical_key: "kbv", level: "bund", geography_id: GEO_BUND, aliases: ["KBV"] },
  { id: "association-dkg", entity_type: "association", name: "Deutsche Krankenhausgesellschaft", canonical_key: "dkg", level: "bund", geography_id: GEO_BUND, aliases: ["DKG", "Deutsche Krankenhausgesellschaft"] },
  { id: "institution-svr-gesundheit", entity_type: "other_institution", name: "Sachverständigenrat zur Begutachtung der Entwicklung im Gesundheitswesen", canonical_key: "svr-gesundheit", level: "bund", geography_id: GEO_BUND, aliases: ["SVR Gesundheit", "Sachverständigenrat Gesundheit"] },
  { id: "authority-bfarm", entity_type: "authority", name: "Bundesinstitut für Arzneimittel und Medizinprodukte", canonical_key: "bfarm", level: "bund", geography_id: GEO_BUND, aliases: ["BfArM"] },
  { id: "authority-pei", entity_type: "authority", name: "Paul-Ehrlich-Institut", canonical_key: "pei", level: "bund", geography_id: GEO_BUND, aliases: ["PEI", "Paul-Ehrlich-Institut"] },
  { id: "institution-iqwig", entity_type: "other_institution", name: "Institut für Qualität und Wirtschaftlichkeit im Gesundheitswesen", canonical_key: "iqwig", level: "bund", geography_id: GEO_BUND, aliases: ["IQWiG"] },
  { id: "association-bundesaerztekammer", entity_type: "association", name: "Bundesärztekammer", canonical_key: "bundesaerztekammer", level: "bund", geography_id: GEO_BUND, aliases: ["BÄK", "Bundesärztekammer"] },
  { id: "association-deutscher-pflegerat", entity_type: "association", name: "Deutscher Pflegerat", canonical_key: "deutscher-pflegerat", level: "bund", geography_id: GEO_BUND, aliases: ["DPR", "Deutscher Pflegerat"] }
]);

// --- Fachliche Kernquellen (16) als technische Kandidaten -------------------
// funktion = gesundheitspolitische Funktion (Abdeckungsmatrix). klassifizierung = fachliche
// Belegfunktion in Klartext (Auftrag §3). readiness = "kandidat" (recherchiert, NICHT byte-
// verifiziert) | "reuse" (durch Bestand abgedeckt, kein neuer Weg).
const KERNQUELLEN = Object.freeze([
  {
    legacy: "gesbund-bmg-gesetzgebung", domain: "bundesgesundheitsministerium.de",
    funktion: "Gesetzgebung", klassifizierung: "normative Primärquelle (Ressort)",
    method: "googlenews_search",
    query: "site:bundesgesundheitsministerium.de (Gesetz OR Verordnung OR Referentenentwurf OR Kabinett OR Formulierungshilfe)",
    frequenz: "ereignisnah", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "BMG RSS-Hub https://www.bundesgesundheitsministerium.de/service/rss-feed — konkrete Feed-URL(s) vor Aktivierung fixieren.",
    note: "Gesetze/Verordnungen + Referentenentwürfe. Herausgeber bundesgesundheitsministerium.de aus Bestand wiederverwendet (kein neuer Herausgeber). Distinkte Suchdefinition (NICHT Pflege) -> keine URL-Dublette zu news-bundesgesundheitsministerium-pflege."
  },
  {
    legacy: "gesbund-bundesrat-gesundheit", domain: "bundesrat.de",
    funktion: "Länderbeteiligung", klassifizierung: "normative Primärquelle (Länderkammer)",
    method: "googlenews_search",
    query: "site:bundesrat.de (Gesundheit OR Pflege OR Krankenhaus OR Gesundheitsausschuss OR Arzneimittel)",
    frequenz: "ereignisnah", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "Bundesrat-Plenum/TOP-Strukturdaten (Drucksachen-Suche) — strukturierten Abrufweg vor Aktivierung prüfen.",
    note: "Gesundheitsausschuss/Vermittlungsverfahren. Herausgeber bundesrat.de aus Bestand wiederverwendet. Funktionsabgrenzung zu allgemeinen Bundesrat-Dokumenten über site:-Themenfilter."
  },
  {
    legacy: "gesbund-gba-beschluesse", domain: "g-ba.de",
    funktion: "Selbstverwaltung", klassifizierung: "normative Primärquelle (Selbstverwaltung, verbindliche Richtlinien)",
    method: "rss", url: "https://www.g-ba.de/beschluesse/letzte-aenderungen/?rss=1",
    frequenz: "ereignisnah", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "Presse-RSS https://www.g-ba.de/presse/pressemitteilungen-meldungen/letzte-aenderungen/?rss=1 ; Feed-Hub https://www.g-ba.de/service/rss/",
    note: "Konkreter RSS-Deep-Link für Beschlüsse (letzte Änderungen). Byte-genaue Parse-Prüfung vor Aktivierung."
  },
  {
    legacy: "gesbund-rki-epidbull", domain: "rki.de",
    funktion: "Epidemiologie", klassifizierung: "amtliche Datenquelle (Bundesoberbehörde)",
    method: "googlenews_search",
    query: "site:rki.de (Epidemiologisches Bulletin OR STIKO OR Infektionsschutz OR Ausbruch)",
    frequenz: "ereignisnah", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "RKI RSS-Feed-Hub https://www.rki.de/DE/Aktuelles/Neuigkeiten-und-Presse/Newsletter-und-RSS-Feeds/RSSFeed_Verweis.html (dedizierter EpidBull-Feed) — RKI-Website 2024/25 migriert, alter Content/Infekt/EpidBull-Pfad NICHT mehr gültig; konkreten Feed-Deep-Link vor Aktivierung fixieren.",
    note: "Epidemiologisches Bulletin (wöchentlich, inkl. STIKO/KRINKO). RKI-URL-Migration = Risiko -> robuster site:-Weg als jetzt integrierbarer Kandidat."
  },
  {
    legacy: "gesbund-destatis-genesis", domain: "destatis.de",
    funktion: "Krankenhaus + Finanzierung", klassifizierung: "amtliche Datenquelle (Vollerhebung)",
    method: "structured_download", url: "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Gesundheit/_inhalt.html",
    frequenz: "periodisch", readiness: "kandidat", verifyBeforeActivation: true,
    covers: ["krankenhaus_grunddaten", "gesundheitsausgabenrechnung"],
    strukturierteAlternative: "GENESIS-Online REST/Webservice-API (Statistik 23111 Grunddaten der Krankenhäuser, 23611 Gesundheitsausgabenrechnung) https://www.destatis.de/DE/Service/OpenData/genesis-api-webservice-oberflaeche.html — API-Token + konkrete Tabellen-ID vor Aktivierung.",
    note: "EIN gemeinsamer strukturierter Abrufweg über den Herausgeber Destatis deckt BEIDE fachlich getrennt bewerteten Reihen ab (Auftrag §3 + §7: Destatis-Einzelseiten -> gemeinsamer Datenzugang). Herausgeber destatis.de aus Bestand wiederverwendet."
  },
  {
    legacy: "gesbund-gkv-spitzenverband", domain: "gkv-spitzenverband.de",
    funktion: "Kassenposition", klassifizierung: "Interessenvertretung (Akteursposition, kein neutraler Beleg)",
    method: "googlenews_search",
    query: "site:gkv-spitzenverband.de (Position OR Stellungnahme OR Prävention OR Pflege OR Finanzierung)",
    frequenz: "regelmaessig", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "GKV-SV Presse-/Statement-Seite (E-Mail-Abo bestätigt, kein öffentlicher RSS-Deep-Link belegt) — vor Aktivierung prüfen.",
    note: "Spitzenverband der GKV. Rolle: Akteursposition/Konfliktindikator — NICHT mit neutraler amtlicher Quelle gleichsetzen. Umbrella über vdek/AOK/BKK/PKV (die als ergänzend/Future geführt sind)."
  },
  {
    legacy: "gesbund-kbv-praxisnachrichten", domain: "kbv.de",
    funktion: "Ärzteposition (ambulant)", klassifizierung: "Interessenvertretung",
    method: "googlenews_search",
    query: "site:kbv.de (PraxisNachrichten OR Stellungnahme OR Honorar OR Vertragsarzt OR Versorgung)",
    frequenz: "regelmaessig", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "KBV PraxisNachrichten-Seite (wöchentlich Do., E-Mail-Abo) — konkreten Feed vor Aktivierung prüfen.",
    note: "Dachverband der 17 KVen. PraxisNachrichten wöchentlich. Abgrenzung zu Zi (Zentralinstitut, KV-nah) -> Zi ergänzend/Future."
  },
  {
    legacy: "gesbund-dkg-positionen", domain: "dkgev.de",
    funktion: "Krankenhausposition", klassifizierung: "Interessenvertretung",
    method: "googlenews_search",
    query: "site:dkgev.de (Position OR Stellungnahme OR Krankenhaus OR Finanzierung OR Fachkräfte)",
    frequenz: "regelmaessig", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "DKG Presse-Seite https://www.dkgev.de/dkg/presse/ — Feed vor Aktivierung prüfen.",
    note: "Dachverband der Krankenhausträger."
  },
  {
    legacy: "gesbund-svr-gutachten", domain: "svr-gesundheit.de",
    funktion: "Reformgutachten", klassifizierung: "gesetzlich legitimierte Evidenzquelle (§142 SGB V)",
    method: "googlenews_search",
    query: "site:svr-gesundheit.de (Gutachten OR Stellungnahme OR Empfehlung)",
    frequenz: "periodisch", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "SVR-Gutachten-Downloadseite — konkreten stabilen Publikationspfad vor Aktivierung prüfen.",
    note: "Unabhängige Reformgutachten (i. d. R. zweijährlich)."
  },
  {
    legacy: "gesbund-bfarm-lieferengpaesse", domain: "bfarm.de",
    funktion: "Arzneimittel", klassifizierung: "amtliche Zulassungs-/Sicherheitsbehörde (Bundesoberbehörde)",
    method: "googlenews_search",
    query: "site:bfarm.de (Lieferengpass OR Lieferengpässe OR Rückruf OR Arzneimittel)",
    frequenz: "ereignisnah", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "BfArM Lieferengpass-RSS (für den Bereich Lieferengpässe belegt) + Datenbank-Export — konkreten Feed-/Export-Endpunkt vor Aktivierung fixieren.",
    note: "Lieferengpass-Datenbank (laufend). RSS-Feed bestätigt, konkreter Deep-Link offen -> robuster site:-Weg als jetzt integrierbarer Kandidat."
  },
  {
    legacy: "gesbund-pei-sicherheit", domain: "pei.de",
    funktion: "Impfstoffe / biomedizinische Arzneimittel", klassifizierung: "amtliche Zulassungs-/Sicherheitsbehörde (Bundesoberbehörde)",
    method: "googlenews_search",
    query: "site:pei.de (Sicherheitsinformation OR Chargenprüfung OR Impfstoff OR Rote-Hand-Brief)",
    frequenz: "ereignisnah", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "PEI SiteGlobals-RSS (belegt) — konkreten Feed-Deep-Link vor Aktivierung fixieren.",
    note: "Chargenprüfung/Sicherheitsinformationen."
  },
  {
    legacy: "gesbund-iqwig-berichte", domain: "iqwig.de",
    funktion: "Evidenz / Nutzenbewertung", klassifizierung: "gesetzlich legitimierte Evidenzquelle (§139a SGB V)",
    method: "googlenews_search",
    query: "site:iqwig.de (Abschlussbericht OR Vorbericht OR Nutzenbewertung OR Berichtsplan)",
    frequenz: "regelmaessig", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "IQWiG RSS/Atom (belegt) — konkreten Feed-Deep-Link vor Aktivierung fixieren.",
    note: "Nutzenbewertungen fließen in G-BA-Beschlüsse ein. Abgrenzung zu G-BA: IQWiG = Evidenz-Zulieferer, G-BA = Entscheider (keine Funktionsdublette, beide behalten)."
  },
  {
    legacy: "gesbund-baek-stellungnahmen", domain: "bundesaerztekammer.de",
    funktion: "Ärzteschaft (Profession)", klassifizierung: "Interessenvertretung",
    method: "googlenews_search",
    query: "site:bundesaerztekammer.de (Stellungnahme OR Position OR Gesetzentwurf OR Richtlinie)",
    frequenz: "regelmaessig", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "BÄK Stellungnahmen-Seite — Feed vor Aktivierung prüfen.",
    note: "Spitzenorganisation der ärztlichen Selbstverwaltung. Abgrenzung zum Deutschen Ärzteblatt: BÄK = Akteur, Ärzteblatt = Fachmedium (ausgeschlossen, bereits im Bestand als Bund-Basis-Medium)."
  },
  {
    legacy: "gesbund-pflegerat-stellungnahmen", domain: "deutscher-pflegerat.de",
    funktion: "Pflege (Profession)", klassifizierung: "Interessenvertretung",
    method: "googlenews_search",
    query: "site:deutscher-pflegerat.de (Stellungnahme OR Position OR Pflege OR Gesetzentwurf)",
    frequenz: "regelmaessig", readiness: "kandidat", verifyBeforeActivation: true,
    strukturierteAlternative: "DPR Stellungnahmen-/Presse-Seite — Feed vor Aktivierung prüfen.",
    note: "Spitzenorganisation der Pflegeberufe."
  }
]);

// Fachliche Kernfunktion, die BEWUSST durch den Bestand abgedeckt wird (KEIN neuer Abrufweg,
// Auftrag §7 Funktionsdubletten-Vermeidung). Nur Dokumentation, erzeugt keine Seed-Zeile.
const BESTANDSABGEDECKT = Object.freeze([
  {
    funktion: "Parlamentarischer Prozess (Bundestag, Ausschuss für Gesundheit)",
    abgedecktDurch: ["rp-dip (DIP-API, Bund Basis)", "rp-committee-gesundheit (Google News, Bund Basis)"],
    entitaeten: ["parliament-bundestag", "committee-bt-gesundheit"],
    begruendung: "Drucksachen/Beschlussempfehlungen/Anhörungen sind über die DIP-API (strukturiert, always_on) und den bestehenden Gesundheitsausschuss-Suchweg bereits Teil jedes Mandats. Ein eigener gesundheit-bund-Weg wäre eine Funktionsdublette."
  }
]);

function buildGesundheitBundSeed() {
  const publishersOut = new Map();  // id -> publisher (nur NEUE)
  const reusedPublisherIds = new Set();
  const reusedEntityIds = new Set(["ministry-bmg", "parliament-bundesrat", "statoffice-destatis"]);
  const retrievalPaths = [];
  const packagePaths = [];
  const pathExpectedLevels = [];
  const pathExpectedGeographies = [];

  for (const q of KERNQUELLEN) {
    const pub = PUBLISHERS[q.domain];
    if (!pub) throw new Error(`Kein Herausgeber-Register-Eintrag für Domain ${q.domain}`);
    if (pub.reuse) {
      reusedPublisherIds.add(pub.id);
    } else if (!publishersOut.has(pub.id)) {
      publishersOut.set(pub.id, {
        id: pub.id, name: pub.name, canonical_domain: q.domain, publisher_type: pub.type,
        evidence_role: pub.evidence_role, trust: "unbekannt", lifecycle_status: "active",
        entity_id: pub.entity_id, prepared: true
      });
    }
    const freq = FREQ[q.frequenz];
    const isGnews = q.method === "googlenews_search";
    const url = isGnews ? gnews(q.query) : q.url;
    const path = {
      id: `rp-${q.legacy}`,
      publisher_id: pub.id,
      legacy_source_id: q.legacy,
      name: `${pub.name} — ${q.funktion}`,
      method: q.method,
      url,
      query: isGnews ? q.query : null,
      parser: methodParser(q.method),
      expected_frequency: freq.expected_frequency,
      priority: freq.priority,
      status: "needs_review",      // VORBEREITET — nie healthy/active
      activation_mode: "manual",   // VORBEREITET — nie auto/always_on -> kein Auto-Crawl
      is_critical: pub.evidence_role === "official_primary",
      max_items: 16,
      covers: q.covers || [q.funktion],
      frequenzklasse: q.frequenz,
      timeoutMsEmpfehlung: freq.timeoutMs,
      retriesEmpfehlung: freq.retries,
      prepared: true
    };
    retrievalPaths.push(path);
    packagePaths.push({ package_id: PACKAGE_ID, retrieval_path_id: path.id });
    pathExpectedLevels.push({ retrieval_path_id: path.id, level: "bund" });
    pathExpectedGeographies.push({ retrieval_path_id: path.id, geography_id: GEO_BUND });
  }

  const publishers = [...publishersOut.values()];
  return {
    packageId: PACKAGE_ID,
    publishers,                                  // NEUE Herausgeber (Insert)
    reusedPublisherIds: [...reusedPublisherIds], // bestehende (nur referenziert)
    entities: NEUE_ENTITAETEN,                   // NEUE Entitäten (Insert)
    reusedEntityIds: [...reusedEntityIds],       // bestehende (nur referenziert)
    retrievalPaths,
    packagePaths,
    pathExpectedLevels,
    pathExpectedGeographies,
    bestandsabgedeckt: BESTANDSABGEDECKT,
    summary: {
      status: "prepared",
      kernquellen: KERNQUELLEN.length,
      neueHerausgeber: publishers.length,
      wiederverwendeteHerausgeber: reusedPublisherIds.size,
      neueEntitaeten: NEUE_ENTITAETEN.length,
      wiederverwendeteEntitaeten: reusedEntityIds.size,
      abrufwege: retrievalPaths.length,
      abrufwegeKritisch: retrievalPaths.filter((p) => p.is_critical).length,
      paketzuordnungen: packagePaths.length,
      bestandsabgedeckteFunktionen: BESTANDSABGEDECKT.length,
      // Technisch inaktiv: kein Abrufweg ist aktiv/auto/always_on.
      aktiveAbrufwege: retrievalPaths.filter((p) => p.status === "healthy" || p.activation_mode === "auto" || p.activation_mode === "always_on").length,
      ereignisnah: retrievalPaths.filter((p) => p.frequenzklasse === "ereignisnah").length,
      regelmaessig: retrievalPaths.filter((p) => p.frequenzklasse === "regelmaessig").length,
      periodisch: retrievalPaths.filter((p) => p.frequenzklasse === "periodisch").length
    }
  };
}

module.exports = {
  buildGesundheitBundSeed,
  PACKAGE_ID, PUBLISHERS, NEUE_ENTITAETEN, KERNQUELLEN, BESTANDSABGEDECKT, FREQ
};
