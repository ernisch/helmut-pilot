"use strict";

// Helmut — Quellenarchitektur · Quellenmodus (off/shadow/on) + relationaler Crawl-Plan.
// =============================================================================================
// FEATURE-GUARD  HELMUT_SOURCE_MODE  (Default AUS, via lib/helmut/flags.js: env > Datei > Default):
//   off (default) -> alter hartcodierter Katalog bleibt die aktive Quellenwahrheit.
//                    KEINE Verhaltensänderung (byte-identisch).
//   shadow        -> alter Katalog bleibt aktiv. Der relationale Crawl-Plan wird PARALLEL
//                    erzeugt und NUR verglichen/angezeigt (Admin-Report, isolierte Läufe).
//                    KEIN relationales Item erreicht die sichtbare Pipeline.
//   on            -> die relationale Datenbank (publishers/retrieval_paths/source_packages/
//                    package_paths) wird aktive Quellenwahrheit; der alte Katalog bleibt als
//                    FALLBACK (leerer Plan oder Ladefehler -> alter Katalog). "on" ist der
//                    QUELLEN-CUTOVER und seit 2026-07-15 LIVE (Gründer-Freigabe „Go Quellen
//                    Cutover", helmut-flags.json: HELMUT_SOURCE_MODE=on). Rollback: Wert zurück
//                    auf 'shadow'/'off' + Deploy — oder Vercel-Env (überstimmt die Datei sofort).
//
// GRUNDSÄTZE (aus dem Auftrag):
//   - Ein Abrufweg kommt GLOBAL genau EINMAL im Plan vor (Referenzzählung statt Kopien;
//     100 Profile mit demselben Paket erzeugen keinen doppelten Crawl).
//   - Ohne aktivierungsberechtigte Profile laufen NUR die always_on-Kernwege.
//   - Berlin/Brandenburg bleiben per DEFAULT VOLLSTÄNDIG ausgeschlossen (Gate zusätzlich zur
//     prepared-Datenlage). Landtag-Sprint P2-1: das Gate ist jetzt je Bundesland über
//     HELMUT_LANDESMODULE freigebbar (Default LEER = unverändert gesperrt); die Freigabe
//     bleibt eine ausdrückliche Gründerentscheidung (siehe docs/landtag/ Aktivierungscheckliste).
//   - dev_only-/Testwege laufen NIE in Production; pausierte/archivierte Wege (Orphans)
//     werden NICHT automatisch reaktiviert; defekte (broken, u. a. bot-gesperrte) Wege
//     stehen im Plan als NICHT ausführbar.
//   - DIP bleibt erhalten: der api-Pfad (rp-dip) läuft NICHT über den Quellen-Crawl,
//     sondern unverändert über lib/helmut/dip.js (eigener, always_on-Pfad).
//
// REINE LOGIK: alle Daten (DB-Zeilen, Legacy-Katalog, Profile) werden injiziert.

const { flagValue } = require("../flags");
const model = require("./model");
const { computeGlobalActivation } = require("./profile-packages");
// Landtag-Sprint (P2-1): Landesmodul-Erkennung + Freigabe leben jetzt in der Registry
// lib/helmut/quellenarchitektur/landesmodule.js. Default (kein Flag) = ALLES gesperrt,
// byte-identisch zum bisherigen harten Gate.
const { landesmodulGate, landesmoduleFuerPath, freigegebeneLandesmodule } = require("./landesmodule");

function sourceMode(env = process.env) {
  const raw = String(flagValue("HELMUT_SOURCE_MODE", env) || "").trim().toLowerCase();
  if (raw === "shadow") return "shadow";
  if (raw === "on" || raw === "live" || raw === "active") return "on";
  return "off";
}

// Ist ein Abrufweg Teil eines Landesmoduls Berlin/Brandenburg? (Erkennung jetzt ueber die
// Registry; Signatur/Boolesche Semantik unveraendert — Freigabe entscheidet das Gate unten.)
function isLandesmodulPath(path = {}, packageKeysForPath = []) {
  return landesmoduleFuerPath(path, packageKeysForPath).size > 0;
}

// Abrufweg (DB-Zeile) -> Quelle in Crawler-Form. Bevorzugt das Legacy-Katalog-Objekt
// (legacy_source_id), damit Verhalten/Sicherheits-Tags je Quelle identisch bleiben —
// die relationale Ebene entscheidet WELCHE Wege laufen, nicht WIE gecrawlt wird.
function toCrawlerSource(path = {}, legacyById = new Map()) {
  const legacy = path.legacy_source_id ? legacyById.get(path.legacy_source_id) : null;
  if (legacy) return { ...legacy, active: true };
  const method = String(path.method || "").toLowerCase();
  const base = {
    id: path.legacy_source_id || path.id,
    name: path.name || path.id,
    type: path.represents_type || "media",
    url: path.url || "",
    priority: Number.isFinite(Number(path.priority)) ? Number(path.priority) : 50,
    active: true,
    lastCrawledAt: null
  };
  if (method === "rss" || method === "googlenews_search") {
    return { ...base, crawlMethod: "rss", rssUrl: path.url, rssUrls: [path.url], maxItems: path.max_items || undefined };
  }
  if (method === "html") return { ...base, crawlMethod: "html", maxItems: 1 };
  if (method === "structured_download") return { ...base, crawlMethod: "structured_download", maxItems: path.max_items || undefined };
  return { ...base, crawlMethod: "rss", rssUrls: path.url ? [path.url] : [] };
}

// Kern: relationaler Crawl-Plan aus DB-Zeilen + Profilen. Deterministisch, ohne Netz.
// Rückgabe: { modusUnabhaengig } — der Aufrufer entscheidet je Modus, was damit passiert.
function buildRelationalCrawlPlan({
  retrievalPaths = [],
  packages = [],
  packagePaths = [],
  profiles = [],
  legacySources = [],
  // Landtag-Sprint (P2-1): freigegebene Landesmodule (Set/Array von Registry-Schluesseln,
  // z. B. ['berlin']). Default undefined -> Flag HELMUT_LANDESMODULE (Default LEER = alles
  // gesperrt, bisheriges Verhalten). Injizierbar fuer deterministische Tests.
  landesmoduleFreigabe = undefined
} = {}) {
  const freigegeben = landesmoduleFreigabe === undefined
    ? freigegebeneLandesmodule()
    : new Set([...landesmoduleFreigabe].map((k) => String(k || "").toLowerCase()));
  const legacyById = new Map(legacySources.map((s) => [s.id, s]));
  const packageById = new Map(packages.map((p) => [p.id, p]));
  const packageKeysByPath = new Map();
  for (const link of packagePaths) {
    if (!link || !link.retrieval_path_id) continue;
    const pk = packageById.get(link.package_id);
    if (!packageKeysByPath.has(link.retrieval_path_id)) packageKeysByPath.set(link.retrieval_path_id, []);
    packageKeysByPath.get(link.retrieval_path_id).push(pk ? (pk.key || pk.id) : link.package_id);
  }

  const activation = computeGlobalActivation({ retrievalPaths, packages, packagePaths, profiles });
  const activeById = new Map(activation.pathActivation.map((p) => [p.id, p]));

  const aktiv = [];
  const defekt = [];
  const ausgeschlossen = [];
  const seenUrls = new Set();

  // Deterministische Reihenfolge: Priorität absteigend, dann ID (stabil für Vergleiche).
  const ordered = [...retrievalPaths].sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(a.id).localeCompare(String(b.id)));

  for (const path of ordered) {
    const packageKeys = packageKeysByPath.get(path.id) || [];
    const act = activeById.get(path.id) || { active: false, refCount: 0, reason: "unbekannt" };

    // 1) Landesmodul-Gate (Berlin/Brandenburg) — unabhängig von Status/Paketen. Default
    //    (Flag leer) bleibt der VOLLAUSSCHLUSS wie bisher; nur ausdrücklich freigegebene
    //    Landesmodule (HELMUT_LANDESMODULE bzw. injizierte Freigabe) passieren das Gate —
    //    danach gelten Paketstatus/Referenzzählung/Status unverändert weiter.
    const gate = landesmodulGate(path, packageKeys, freigegeben);
    if (gate.gesperrt) {
      ausgeschlossen.push({ id: path.id, grund: gate.grund, packageKeys });
      continue;
    }
    // 2) DIP bleibt eigener API-Pfad (lib/helmut/dip.js), nie Teil des Quellen-Crawls.
    if (String(path.method || "").toLowerCase() === "api") {
      ausgeschlossen.push({ id: path.id, grund: "eigenstaendiger-api-pfad (DIP läuft unverändert über lib/helmut/dip.js)", packageKeys });
      continue;
    }
    // 3) Test-/Entwicklungswege laufen nie in Production.
    if (path.activation_mode === "dev_only") {
      ausgeschlossen.push({ id: path.id, grund: "testquelle-dev-only", packageKeys });
      continue;
    }
    // 4) Pausierte/archivierte Wege (inkl. Orphans) werden nicht automatisch reaktiviert.
    if (path.status === "paused" || path.status === "archived") {
      ausgeschlossen.push({ id: path.id, grund: `nicht-reaktiviert (status=${path.status})`, packageKeys });
      continue;
    }
    // 5) Referenzzählung: ohne aktives Paket läuft nur always_on.
    if (!act.active) {
      ausgeschlossen.push({ id: path.id, grund: `kein-aktives-paket (${act.reason})`, packageKeys });
      continue;
    }
    // 6) Defekte (broken — u. a. bot-gesperrte) Wege: im Plan sichtbar, aber NICHT ausführbar.
    if (path.status === "broken") {
      defekt.push({ id: path.id, grund: `defekt (${(path.last_error || "").slice(0, 80) || "error_streak=" + (path.error_streak || "?")})`, packageKeys, refCount: act.refCount });
      continue;
    }
    // 7) Globale URL-Dedup: dieselbe normalisierte Abruf-URL läuft genau einmal.
    const urlKey = `${String(path.method || "").toLowerCase()}|${model.normalizeUrl(path.url || "")}`;
    if (path.url && seenUrls.has(urlKey)) {
      ausgeschlossen.push({ id: path.id, grund: "doppelter-abrufweg (URL bereits im Plan)", packageKeys });
      continue;
    }
    if (path.url) seenUrls.add(urlKey);

    aktiv.push({
      id: path.id,
      legacy_source_id: path.legacy_source_id || null,
      method: path.method,
      url: path.url || "",
      status: path.status,
      activation_mode: path.activation_mode,
      refCount: act.refCount,
      grund: act.reason,
      packageKeys,
      source: toCrawlerSource(path, legacyById)
    });
  }

  return {
    aktivierung: {
      aktiveProfile: activation.activeProfileCount,
      aktivePakete: activation.activePackageCount,
      paketStatus: activation.packageStatus
    },
    aktiv,
    defekt,
    ausgeschlossen,
    stats: {
      wegeGesamt: retrievalPaths.length,
      aktiv: aktiv.length,
      defekt: defekt.length,
      ausgeschlossen: ausgeschlossen.length
    }
  };
}

// Vergleich alter Plan (Legacy-Katalog, gefiltert wie der echte Crawl: shared ohne
// person-Quellen) gegen den relationalen Plan. Reine Mengenlogik über IDs/URLs.
function comparePlans({ legacySources = [], relationalPlan = null } = {}) {
  const rel = relationalPlan || { aktiv: [], defekt: [], ausgeschlossen: [] };
  const legacyShared = legacySources.filter((s) => s && s.type !== "person" && s.active !== false);
  const legacyIds = new Set(legacyShared.map((s) => s.id));
  const relLegacyIds = new Set(rel.aktiv.map((p) => p.legacy_source_id).filter(Boolean));

  const fehlendImRelationalen = [...legacyIds].filter((id) => !relLegacyIds.has(id));
  const zusaetzlichImRelationalen = rel.aktiv.filter((p) => !p.legacy_source_id || !legacyIds.has(p.legacy_source_id)).map((p) => p.id);

  // Doppelte URLs im Legacy-Plan (der alte Katalog hat KEINE globale URL-Dedup).
  const seen = new Map();
  const doppelteImLegacy = [];
  for (const s of legacyShared) {
    const key = model.normalizeUrl(s.rssUrl || s.url || "");
    if (!key) continue;
    if (seen.has(key)) doppelteImLegacy.push({ id: s.id, wie: seen.get(key) });
    else seen.set(key, s.id);
  }

  return {
    quellenzahl: { alt: legacyShared.length, relationalAktiv: rel.aktiv.length, relationalDefekt: rel.defekt.length, relationalAusgeschlossen: rel.ausgeschlossen.length },
    fehlendImRelationalen,
    zusaetzlichImRelationalen,
    doppelteImLegacy
  };
}

// SHADOW-Messbericht eines ECHTEN Crawl-Laufs: rechnet die realen Ergebnisse des alten
// Plans dem relationalen Plan zu (gleiche Abruf-URLs via legacy-Mapping) — dadurch
// entsteht der Production-Shadow-Nachweis OHNE einen einzigen zusätzlichen Fetch und
// ohne Write in den Nutzerpfad. dedupPlanner (injiziert, z. B. planDedupWrites) läuft
// als reiner Dry-Run für eindeutige Dokumente/Fundstellen/Duplikate.
function buildShadowRunReport({ selectedSources = [], crawlResults = [], plan = null, dedupPlanner = null } = {}) {
  const rel = plan || { aktiv: [], defekt: [], ausgeschlossen: [], stats: {}, aktivierung: {} };
  const relIds = new Set(rel.aktiv.map((p) => p.source && p.source.id).filter(Boolean));
  const altIds = new Set(selectedSources.filter((s) => s && s.active !== false).map((s) => s.id));
  const gemeinsam = [...altIds].filter((id) => relIds.has(id));
  const nurAlt = [...altIds].filter((id) => !relIds.has(id));
  const nurRelational = [...relIds].filter((id) => !altIds.has(id));

  const byId = new Map(crawlResults.map((r) => [r.sourceId, r]));
  const zaehle = (ids) => {
    const s = { wege: ids.length ?? ids.size, erfolgreich: 0, fehler: 0, dokumente: 0, fehlerQuellen: [] };
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) continue; // Weg war in diesem Lauf nicht dabei (z. B. defekt/nicht gewählt)
      if (r.ok) s.erfolgreich += 1; else { s.fehler += 1; if (s.fehlerQuellen.length < 10) s.fehlerQuellen.push(id); }
      s.dokumente += r.itemCount || 0;
    }
    return s;
  };
  const alt = zaehle([...altIds]);
  const relational = zaehle([...relIds]);

  // Dedup-Dry-Run über die real gefundenen Items der relational abgedeckten Wege.
  let dedup = null;
  if (typeof dedupPlanner === "function") {
    const relItems = crawlResults.filter((r) => relIds.has(r.sourceId)).flatMap((r) => r.items || []);
    if (relItems.length) {
      const p = dedupPlanner(relItems);
      dedup = {
        kandidaten: relItems.length,
        eindeutigeDokumente: p.persists.length,
        duplikate: relItems.length - p.persists.length,
        fundstellen: p.findings.length
      };
    } else {
      dedup = { kandidaten: 0, eindeutigeDokumente: 0, duplikate: 0, fundstellen: 0 };
    }
  }

  return {
    modus: "shadow",
    alt,
    relational,
    vergleich: {
      gemeinsameWege: gemeinsam.length,
      nurAlt,
      nurRelational,
      abdeckungDokumenteProzent: alt.dokumente ? Math.round((relational.dokumente / alt.dokumente) * 1000) / 10 : 100
    },
    dedupDryRun: dedup,
    planStats: rel.stats,
    aktivierung: rel.aktivierung,
    kostenZusatz: 0 // keine zusätzlichen Fetches, kein LLM
  };
}

// ON-Modus: profilgenerierte Quellen (Personen-/Mandatssuche) + globaler relationaler Plan
// zusammenführen, OHNE doppelte Abrufe: dieselbe normalisierte Abruf-URL läuft genau einmal
// (z. B. deckt das persönliche Paket rp-cem-ince-news dieselbe Google-News-Suche ab wie die
// dynamische personNewsSource). Profilquellen zuerst (bewahren die Personen-Kennzeichnung).
function mergeProfileAndPlanSources(profileSources = [], planSources = []) {
  const out = [];
  const seen = new Set();
  for (const s of [...profileSources, ...planSources]) {
    if (!s) continue;
    const key = model.normalizeUrl(s.rssUrl || (Array.isArray(s.rssUrls) && s.rssUrls[0]) || s.url || "") || `id:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

module.exports = { sourceMode, buildRelationalCrawlPlan, comparePlans, toCrawlerSource, isLandesmodulPath, mergeProfileAndPlanSources, buildShadowRunReport };
