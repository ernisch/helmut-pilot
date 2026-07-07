"use strict";

// Helmut Core V3 — Source Safety Guard + Quellen-Kategorien/Vertrauensstufen.
//
// REGELBASIERT, deterministisch, KEINE KI, kein Netzwerk. Zweck: verhindern, dass
// kritische politische Falschmeldungen aus unbekannten/unserioesen Quellen
// automatisch als Wahrheit in Aktuelle Lage, Radar oder Helmut-Briefing landen.
//
// Kein grosses Fact-Checking-System, keine externen Agenten. Die Freigabe eines
// kritischen Claims beruht auf REGELN (Quelle + Kategorie + Bestaetigung), nicht auf
// KI-Bauchgefuehl. KI darf kritische Claims *erkennen* helfen — die Freigabe nicht.
//
// Das Modul ist reine Logik (Unit-testbar, offline). Es wird an zwei Stellen genutzt:
//   1. Ingestion/Admin: jede Quelle bekommt Kategorie + Vertrauensstufe (categorize).
//   2. Lese-Pfad: guardKnowledgeObject() entscheidet, ob ein Vorgang mit kritischem,
//      unbestaetigtem Claim ins Briefing darf oder in Quarantaene geht.

// --- Kategorien & Vertrauensstufen ------------------------------------------
const SOURCE_CATEGORIES = ["offiziell", "medien", "partei_fraktion", "regional", "profil", "unbekannt", "quarantaene"];
const TRUST_LEVELS = ["hoch", "mittel", "niedrig", "blockiert", "unbekannt"];

// Offizielle Domains (Vertrauen "hoch"): Parlamente, Regierung, Ministerien, amtliche
// Register. Suffix-Match (host === d ODER host endet auf "." + d).
const OFFICIAL_DOMAINS = [
  "bundestag.de", "dip.bundestag.de", "bundesregierung.de", "bundesrat.de",
  "bmas.de", "bmg.bund.de", "bundesgesundheitsministerium.de", "bmf.bund.de",
  "bundesfinanzministerium.de", "bmi.bund.de", "bmwk.de", "bmvg.de", "bmz.de",
  "bmuv.de", "bmbf.de", "bmwsb.bund.de", "bmdv.bund.de", "auswaertiges-amt.de",
  "bundeskanzler.de", "bund.de", "gesetze-im-internet.de", "destatis.de",
  // Landtage / Landesregierungen (Suffix deckt die meisten .de-Landtagsdomains):
  "landtag.de", "landtag-bw.de", "bayern.landtag.de", "parlament-berlin.de",
  "landtag.brandenburg.de", "bremische-buergerschaft.de", "buergerschaft-hh.de",
  "hessischer-landtag.de", "landtag-mv.de", "landtag-niedersachsen.de",
  "landtag.nrw.de", "landtag.rlp.de", "landtag-saar.de", "landtag.sachsen.de",
  "landtag.sachsen-anhalt.de", "landtag.ltsh.de", "thueringer-landtag.de"
];

// Vertrauenswuerdige, journalistische Medien (Vertrauen "hoch" fuer die grossen
// Leitmedien/Agenturen; regionale/oeffentlich-rechtliche unten mit "mittel").
const TRUSTED_MEDIA_HIGH = [
  "tagesschau.de", "ard.de", "zdf.de", "deutschlandfunk.de", "dlf.de",
  "spiegel.de", "zeit.de", "faz.net", "sueddeutsche.de", "welt.de", "taz.de",
  "handelsblatt.com", "tagesspiegel.de", "dpa.com", "reuters.com", "afp.com",
  "n-tv.de", "focus.de", "stern.de", "rnd.de", "nd-aktuell.de"
];
const TRUSTED_MEDIA_MID = [
  "ndr.de", "wdr.de", "br.de", "swr.de", "mdr.de", "hr.de", "rbb24.de",
  "sr.de", "radiobremen.de", "deutschlandfunkkultur.de", "phoenix.de",
  "epd.de", "kna.de", "table.media", "zdfheute.de"
];

const PARTY_DOMAINS = [
  "die-linke.de", "linksfraktion.de", "spd.de", "spdfraktion.de", "cdu.de",
  "cducsu.de", "csu.de", "gruene.de", "gruene-bundestag.de", "fdp.de",
  "fdpbt.de", "afd.de", "afdbundestag.de", "bsw-vg.de", "freiewaehler.eu"
];

// Aggregatoren/Proxys: keine EIGENSTAENDIGE Quelle. Ein kritischer Claim, der NUR
// hierueber "belegt" ist, gilt als unbestaetigt (der Direktlink zaehlt, nicht der Proxy).
const AGGREGATOR_DOMAINS = ["news.google.com", "google.com", "gstatic.com", "googleusercontent.com"];

// URL-Verkuerzer sind als Quellbeleg fuer kritische Claims nicht zulaessig.
const URL_SHORTENERS = ["bit.ly", "t.co", "tinyurl.com", "ow.ly", "buff.ly", "is.gd", "cutt.ly", "rebrand.ly", "shorturl.at", "lnkd.in"];

function envList(name) {
  return String(process.env[name] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
// Betreiber-erweiterbar (kein Deploy noetig fuer Sperren): HELMUT_SOURCE_BLOCKLIST,
// HELMUT_SOURCE_ALLOWLIST (kommagetrennte Domains).
function blockedDomains() { return envList("HELMUT_SOURCE_BLOCKLIST"); }
function extraAllowedDomains() { return envList("HELMUT_SOURCE_ALLOWLIST"); }

// --- kleine Helfer ----------------------------------------------------------
function hostOf(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try { return new URL(raw).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}
function isHttps(url) { return /^https:\/\//i.test(String(url || "").trim()); }
function suffixMatch(host, domain) {
  const h = String(host || "").toLowerCase();
  const d = String(domain || "").toLowerCase();
  return Boolean(h) && Boolean(d) && (h === d || h.endsWith("." + d));
}
function inList(host, list) { return list.some((d) => suffixMatch(host, d)); }

function isShortener(host) { return inList(host, URL_SHORTENERS); }
function isAggregator(host) { return inList(host, AGGREGATOR_DOMAINS); }
function isBlocked(host) { return Boolean(host) && inList(host, blockedDomains()); }

// Domain -> Kategorie (nur wenn eindeutig zuordenbar, sonst null).
function domainCategory(host) {
  if (!host) return null;
  if (inList(host, OFFICIAL_DOMAINS)) return "offiziell";
  if (inList(host, PARTY_DOMAINS)) return "partei_fraktion";
  if (inList(host, TRUSTED_MEDIA_HIGH) || inList(host, TRUSTED_MEDIA_MID)) return "medien";
  return null;
}

// Domain -> Vertrauensstufe.
function domainTrust(host) {
  if (!host) return "unbekannt";
  if (isBlocked(host)) return "blockiert";
  if (inList(host, extraAllowedDomains())) return "hoch";
  if (inList(host, OFFICIAL_DOMAINS)) return "hoch";
  if (inList(host, TRUSTED_MEDIA_HIGH)) return "hoch";
  if (inList(host, PARTY_DOMAINS)) return "mittel"; // Interessenvertreter: bewusst nicht "hoch"
  if (inList(host, TRUSTED_MEDIA_MID)) return "mittel";
  if (isShortener(host)) return "blockiert";
  if (isAggregator(host)) return "unbekannt"; // Proxy, kein eigenstaendiger Beleg
  return "unbekannt";
}

// --- Kategorie/Trust einer QUELLE (source-Objekt) ---------------------------
// Prioritaet: explizite Felder am Source > Domain-Ableitung > type-Mapping.
const TYPE_CATEGORY = {
  committee: "offiziell", ministry: "offiziell", bundestag: "offiziell", official: "offiziell",
  media: "medien", party: "partei_fraktion", faction: "partei_fraktion",
  local: "regional", regional: "regional", person: "profil", profile: "profil"
};

function categorizeSource(source = {}) {
  const explicit = String(source.category || "").trim().toLowerCase();
  if (SOURCE_CATEGORIES.includes(explicit)) return explicit;
  const host = hostOf(source.url || source.rssUrl || (Array.isArray(source.rssUrls) ? source.rssUrls[0] : ""));
  // Google-News-Suchen tragen ihre echte Kategorie ueber source.type/category, nicht
  // ueber den Aggregator-Host — daher type-Mapping vor Domain fuer news.google.com.
  if (isAggregator(host)) {
    return TYPE_CATEGORY[String(source.type || "").toLowerCase()] || "medien";
  }
  return domainCategory(host) || TYPE_CATEGORY[String(source.type || "").toLowerCase()] || "unbekannt";
}

function trustForSource(source = {}) {
  const explicit = String(source.trust || "").trim().toLowerCase();
  if (TRUST_LEVELS.includes(explicit)) return explicit;
  const host = hostOf(source.url || source.rssUrl || (Array.isArray(source.rssUrls) ? source.rssUrls[0] : ""));
  if (isAggregator(host)) {
    // Kategorie bestimmt das Basisvertrauen der Suche (der Direktlink wird spaeter geprueft).
    const cat = categorizeSource(source);
    if (cat === "offiziell") return "hoch";
    if (cat === "partei_fraktion") return "mittel";
    if (cat === "profil") return "mittel";
    return "mittel"; // Medien-Suche
  }
  return domainTrust(host);
}

// Zaehlt Quellen (source-Objekte) nach Kategorie + Vertrauensstufe. Fuer Ingestion + Admin.
function summarizeSources(sources = []) {
  const byCategory = {};
  const byTrust = {};
  for (const c of SOURCE_CATEGORIES) byCategory[c] = 0;
  for (const t of TRUST_LEVELS) byTrust[t] = 0;
  for (const s of Array.isArray(sources) ? sources : []) {
    byCategory[categorizeSource(s)] = (byCategory[categorizeSource(s)] || 0) + 1;
    byTrust[trustForSource(s)] = (byTrust[trustForSource(s)] || 0) + 1;
  }
  return { total: (sources || []).length, byCategory, byTrust };
}

// --- Kritische Claims (regelbasierte Erkennung) -----------------------------
// Extreme/sensible Behauptungen, die aus schwacher Quelle NICHT als Fakt gelten duerfen.
const CRITICAL_CLAIM_PATTERNS = [
  { key: "tod", re: /\b(ist tot|tot aufgefunden|verstorben|gestorben|todesf|leiche|ums leben gekommen)\b/i },
  { key: "ruecktritt", re: /\b(r[üu]cktritt|zur[üu]ckgetreten|tritt zur[üu]ck|amtsniederlegung|abberufen)\b/i },
  { key: "strafverfahren", re: /\b(strafverfahren|angeklagt|anklage|ermittlungsverfahren|festgenommen|verhaftet|inhaftiert|razzia|durchsuchung)\b/i },
  { key: "korruption", re: /\b(korruption|bestechung|bestechlichkeit|schmiergeld|vorteilsnahme|veruntreuung)\b/i },
  { key: "terror", re: /\b(terror|terroranschlag|anschlag|attentat|sprengsatz|geiselnahme)\b/i },
  { key: "krieg", re: /\b(kriegserkl[äa]rung|kriegsbeginn|invasion|angriffskrieg|milit[äa]rschlag)\b/i },
  { key: "wahlmanipulation", re: /\b(wahlbetrug|wahlmanipulation|wahlf[äa]lschung|manipulierte wahl|putsch|staatsstreich)\b/i },
  { key: "gewalt", re: /\b(schwere gewalt|t[öo]tungsdelikt|erschossen|niedergestochen|missbrauch|vergewaltigung)\b/i },
  { key: "skandal", re: /\b(schwerer skandal|korruptionsskandal|spendenaff[äa]re|geheimdossier|geldw[äa]sche)\b/i }
];

function detectCriticalClaim(text) {
  const s = String(text || "");
  const terms = [];
  for (const p of CRITICAL_CLAIM_PATTERNS) if (p.re.test(s)) terms.push(p.key);
  return { isCritical: terms.length > 0, terms };
}

// --- Link-Sicherheit --------------------------------------------------------
function assessLink(url) {
  const host = hostOf(url);
  const trust = domainTrust(host);
  const category = domainCategory(host) || "unbekannt";
  const https = isHttps(url);
  const shortener = isShortener(host);
  const aggregator = isAggregator(host);
  const blocked = trust === "blockiert" || isBlocked(host);
  // "verdaechtig" = kein brauchbarer Beleg: blockiert, Verkuerzer, kein Host, oder
  // (unbekannt UND nicht https).
  const suspicious = blocked || shortener || !host || (trust === "unbekannt" && !https);
  return { url: String(url || ""), host, https, shortener, aggregator, blocked, category, trust, suspicious };
}

// Trust/Kategorie eines EINZELNEN Quell-Dokuments (raw_document / Karten-Quelle).
// Beruecksichtigt explizite Felder am Dokument und den (aufgeloesten) Link.
function assessDocument(doc = {}) {
  const url = doc.url || doc.canonical_url || doc.originalUrl || "";
  const link = assessLink(url);
  const category = String(doc.source_category || doc.category || "").trim().toLowerCase()
    || categorizeSource({ type: doc.source_type || doc.sourceType, url });
  const explicitTrust = String(doc.source_trust || doc.trust || "").trim().toLowerCase();
  const trust = TRUST_LEVELS.includes(explicitTrust) ? explicitTrust : link.trust;
  return { url, host: link.host, category, trust, https: link.https, suspicious: link.suspicious, blocked: link.blocked };
}

// Bestaetigung eines kritischen Claims: >=1 offizielle (hoch) ODER >=2 unabhaengige
// vertrauenswuerdige Medien (hoch/mittel, verschiedene Hosts). Partei/Aggregator/
// unbekannt zaehlen NICHT als Bestaetigung.
function isCriticalClaimConfirmed(docAssessments = []) {
  const good = docAssessments.filter((d) => d && !d.blocked && !d.suspicious);
  const official = good.filter((d) => d.category === "offiziell" && d.trust === "hoch");
  if (official.length >= 1) return true;
  const mediaHosts = new Set(
    good.filter((d) => d.category === "medien" && (d.trust === "hoch" || d.trust === "mittel") && d.host)
      .map((d) => d.host)
  );
  return mediaHosts.size >= 2;
}

// --- Haupt-Guard: darf dieser Vorgang (KO) in Briefing/Lage/Radar? ----------
// docs = Quell-Dokumente des Vorgangs (aus ko_document_links / Karten-Quellen).
// Rueckgabe: { status:'ok'|'quarantine', reason, critical, confirmed, flags }.
function guardKnowledgeObject(ko = {}, docs = []) {
  const text = [
    ko.display_title, ko.headline, ko.display_summary,
    ko.was_ist_passiert, ko.warum_wichtig,
    Array.isArray(ko.risiken) ? ko.risiken.join(" ") : ko.risiken,
    Array.isArray(ko.tags) ? ko.tags.join(" ") : ""
  ].filter(Boolean).join(" ");

  const critical = detectCriticalClaim(text);
  const assessments = (Array.isArray(docs) ? docs : []).map(assessDocument);
  const usable = assessments.filter((d) => !d.blocked && !d.suspicious && d.host);
  const blockedCount = assessments.filter((d) => d.blocked).length;
  const unknownCount = assessments.filter((d) => d.trust === "unbekannt").length;
  const allBlocked = assessments.length > 0 && assessments.every((d) => d.blocked);
  const confirmed = isCriticalClaimConfirmed(assessments);

  const flags = {
    critical: critical.isCritical,
    criticalTerms: critical.terms,
    confirmed,
    sourceCount: assessments.length,
    usableSources: usable.length,
    blockedSources: blockedCount,
    unknownSources: unknownCount,
    criticalUnconfirmed: critical.isCritical && !confirmed
  };

  // Regel 1: ALLE Quellen explizit blockiert (Sperrliste/URL-Verkuerzer) -> nie ins
  // Briefing. Unbekannte (nicht gesperrte) Quellen bleiben fuer NICHT-kritische
  // Inhalte erlaubt (sonst waere das Produkt leer); sie zaehlen aber nie als
  // Bestaetigung (Regel 2) und sind im Admin sichtbar.
  if (allBlocked) {
    return { status: "quarantine", reason: "nur-blockierte-quellen", critical, confirmed, flags };
  }
  // Regel 2: kritischer Claim ohne Bestaetigung (>=1 offizielle ODER >=2 unabhaengige
  // vertrauenswuerdige Medien) -> Quarantaene, erscheint NICHT als Fakt.
  if (critical.isCritical && !confirmed) {
    return { status: "quarantine", reason: `kritischer-claim-unbestaetigt:${critical.terms.join(",")}`, critical, confirmed, flags };
  }
  return { status: "ok", reason: null, critical, confirmed, flags };
}

// Bequemer Filter fuer den Lese-Pfad: teilt eine KO-Liste in erlaubt/quarantaene.
// getDocs(ko) liefert die Quell-Dokumente des Vorgangs (Map/Funktion, optional).
function partitionBySafety(kos = [], getDocs = () => []) {
  const allowed = [];
  const quarantined = [];
  for (const ko of Array.isArray(kos) ? kos : []) {
    if (!ko) continue;
    const verdict = guardKnowledgeObject(ko, getDocs(ko) || []);
    if (verdict.status === "quarantine") quarantined.push({ ko, verdict });
    else allowed.push(ko);
  }
  return { allowed, quarantined };
}

module.exports = {
  SOURCE_CATEGORIES,
  TRUST_LEVELS,
  hostOf,
  categorizeSource,
  trustForSource,
  summarizeSources,
  detectCriticalClaim,
  assessLink,
  assessDocument,
  isCriticalClaimConfirmed,
  guardKnowledgeObject,
  partitionBySafety
};
