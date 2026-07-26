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
//   - Berlin/Brandenburg bleiben VOLLSTÄNDIG ausgeschlossen (hartes Gate zusätzlich zur
//     prepared/needs_review-Datenlage).
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

// --- Landesmodul-Gate: JE BUNDESLAND freigebbar -------------------------------------------
// VORHER (bis Phase-1-Punkt 15): ein einziges, unbedingtes Gate sperrte "Berlin/Brandenburg"
// gemeinsam. Das hatte zwei belegte Folgen:
//   1. Eine reine DATENAENDERUNG (Paket prepared -> active) blieb WIRKUNGSLOS — das Gate sitzt
//      im Code und griff vor jeder Paket-/Statuspruefung. Aktivierung war also zwingend eine
//      Code-Aenderung + Deployment, was nirgends dokumentiert war.
//   2. Die Sperre kannte kein einzelnes Land. Berlin zuerst freizugeben, OHNE Brandenburg
//      mitzuaktivieren (die verbindliche Reihenfolge), war technisch nicht ausfuehrbar.
//
// JETZT: das Gate bleibt geschlossen, laesst sich aber JE LAND oeffnen. Der Schalter ist eine
// FREIGABE (Erlaubnis), niemals ein AKTIVIERER: ein freigegebenes Land durchlaeuft danach
// unveraendert alle normalen Regeln (Paket aktiv, Weg nicht paused/broken, Referenzzaehlung).
// Zusaetzlich muss ein Landesweg ausdruecklich abgenommen sein — `activation_mode='manual'`
// und `status='needs_review'` bleiben eigenstaendige Sperren (siehe unten, Regel 1b/1c).
//
// Default = LEER = exakt das bisherige Verhalten (alles gesperrt). Wildcards ("all", "*",
// "on", "true") werden BEWUSST NICHT unterstuetzt und wirken wie leer — eine Blankofreigabe
// durch einen Tippfehler ist damit ausgeschlossen (fail-closed).
const LANDESMODUL_LAENDER = Object.freeze(["berlin", "brandenburg"]);
const LANDESMODUL_PACKAGE_KEYS = new Map([
  ["berlin-basis", "berlin"],
  ["die-linke-berlin", "berlin"],
  ["brandenburg-basis", "brandenburg"],
  ["die-linke-brandenburg", "brandenburg"]
]);
const LANDESMODUL_PATH_PREFIXES = new Map([["rp-be-", "berlin"], ["rp-bb-", "brandenburg"]]);
const LANDESMODUL_LEGACY_PREFIXES = new Map([["be-", "berlin"], ["bb-", "brandenburg"]]);

// Welche Bundeslaender beansprucht dieser Abrufweg? Mehrfachnennung ist real: der
// rbb-Zwei-Laender-Feed (rp-rbb24-politik) gehoert berlin-basis UND brandenburg-basis.
function landesmodulLaenderFuerPfad(path = {}, packageKeysForPath = []) {
  const treffer = new Set();
  const id = String(path.id || "").toLowerCase();
  for (const [prefix, land] of LANDESMODUL_PATH_PREFIXES) if (id.startsWith(prefix)) treffer.add(land);
  const legacy = String(path.legacy_source_id || "").toLowerCase();
  for (const [prefix, land] of LANDESMODUL_LEGACY_PREFIXES) if (legacy.startsWith(prefix)) treffer.add(land);
  for (const k of packageKeysForPath || []) {
    const land = LANDESMODUL_PACKAGE_KEYS.get(String(k || "").toLowerCase());
    if (land) treffer.add(land);
  }
  return LANDESMODUL_LAENDER.filter((l) => treffer.has(l)); // stabile Reihenfolge
}

// Freigegebene Landesmodule aus HELMUT_LANDESMODUL_FREIGABE (Komma-/Leerzeichenliste).
// Unbekannte Token werden ignoriert -> unbekannt == gesperrt.
function landesmodulFreigabe(env = process.env) {
  const raw = String(flagValue("HELMUT_LANDESMODUL_FREIGABE", env) || "").trim().toLowerCase();
  const out = new Set();
  if (!raw) return out;
  for (const teil of raw.split(/[,;\s]+/)) {
    const land = teil.trim();
    if (LANDESMODUL_LAENDER.includes(land)) out.add(land);
  }
  return out;
}

// Eingabe (Array/Set/undefined) -> geprueftes Freigabe-Set. undefined => aus der Umgebung.
function normalisiereFreigabe(input, env) {
  if (input == null) return landesmodulFreigabe(env);
  const roh = input instanceof Set ? [...input] : (Array.isArray(input) ? input : [input]);
  return new Set(roh.map((l) => String(l || "").trim().toLowerCase()).filter((l) => LANDESMODUL_LAENDER.includes(l)));
}

function sourceMode(env = process.env) {
  const raw = String(flagValue("HELMUT_SOURCE_MODE", env) || "").trim().toLowerCase();
  if (raw === "shadow") return "shadow";
  if (raw === "on" || raw === "live" || raw === "active") return "on";
  return "off";
}

// Ist ein Abrufweg ueberhaupt Teil eines Landesmoduls Berlin/Brandenburg?
function isLandesmodulPath(path = {}, packageKeysForPath = []) {
  return landesmodulLaenderFuerPfad(path, packageKeysForPath).length > 0;
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
  env = process.env,
  landesmodulFreigabe: freigabeInput
} = {}) {
  const freigabe = normalisiereFreigabe(freigabeInput, env);
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

    // 1) Landesmodul-Gate (Berlin/Brandenburg) — JE LAND freigebbar, sonst hart gesperrt.
    //    Drei unabhängige Riegel; jeder für sich verhindert den Abruf.
    const laender = landesmodulLaenderFuerPfad(path, packageKeys);
    if (laender.length) {
      // 1a) Freigabe: mindestens EINES der beanspruchten Länder muss freigegeben sein.
      //     Der Zwei-Länder-Weg (rbb24) läuft damit unter dem Land, das freigegeben ist —
      //     seine Referenzzählung kommt ohnehin nur aus dessen aktivem Paket (Regel 5).
      const freigegeben = laender.filter((l) => freigabe.has(l));
      if (!freigegeben.length) {
        ausgeschlossen.push({ id: path.id, grund: `landesmodul-gesperrt (${laender.join("+")} nicht freigegeben)`, packageKeys, laender });
        continue;
      }
      // 1b) Vorbereitete Wege laufen nie automatisch. Das macht die bereits dokumentierte
      //     Zusage „activation_mode='manual' wird nie automatisch abgerufen" erstmals wahr —
      //     model.isPathActive prüft nur paused/archived/dev_only, NICHT manual.
      if (path.activation_mode === "manual") {
        ausgeschlossen.push({ id: path.id, grund: "landesmodul-vorbereitet (activation_mode=manual)", packageKeys, laender });
        continue;
      }
      // 1c) Ein Landesweg muss ausdrücklich abgenommen sein. 'needs_review' ist der
      //     Auslieferungszustand aller 18 vorbereiteten Landeswege und blockt sonst nirgends.
      if (path.status === "needs_review") {
        ausgeschlossen.push({ id: path.id, grund: "landesmodul-ungeprueft (status=needs_review)", packageKeys, laender });
        continue;
      }
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
      paketStatus: activation.packageStatus,
      // Sichtbar im Admin-/Shadow-Bericht: welche Landesmodule sind freigegeben?
      // Leeres Array = keines (Normalzustand).
      landesmodulFreigabe: LANDESMODUL_LAENDER.filter((l) => freigabe.has(l))
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
// (z. B. deckt der persoenliche Paket-Abrufweg "rp-<mandats-id>-news" dieselbe Google-News-Suche ab wie die
// dynamische personNewsSource). Profilquellen zuerst (bewahren die Personen-Kennzeichnung).
//
// ZUSÄTZLICH source_id-Dedup (Dubletten-Fix 2026-07): Die reine URL-Dedup hat die
// Katalog-Dublette `cem-ince-news` NICHT gefangen, weil personNewsSource bei leerem
// Profil-fullName eine ANDERE Such-URL baut (q="<mandats-id>" statt q="<Vollname>")
// als der relationale Pfad rp-<mandats-id>-news — dieselbe logische Quelle lief
// dadurch pro Crawl zweimal unter identischer source_id (Production-Beleg: 145
// Telemetrie-Zeilen, 144 distinct source_id in den Läufen il02g/v268f/mb1k6).
// Eine source_id darf im Crawl-Plan GENAU EINMAL vorkommen: alle nachgelagerten
// Zuordnungen (Telemetrie, okById, Dedup-/Cap-Zähler) schlüsseln über source_id
// und würden bei Kollision still überschreiben. First-wins, Profilquellen zuerst.
// Unterschiedliche Quellen mit ähnlichen NAMEN, aber verschiedenen ids bleiben
// selbstverständlich erhalten (Dedup ausschließlich über id + normalisierte URL).
// Kollisionsregel: first-wins (Profilquellen zuerst) — AUSSER die gehaltene
// Quelle ist eine Personensuche, deren Query mangels Profil-fullName nur aus dem
// Mandats-Slug abgeleitet wurde (nameQueryComplete === false, gesetzt von
// scheduler.personNewsSource). Dann gewinnt der kuratierte Kandidat (z. B. der
// relationale rp-…-news-Weg mit korrekter Namens-Query) — sonst würde der Fix
// ausgerechnet die BESSERE Suche verwerfen (Review-Fix).
function dedupeSourcesById(sources = []) {
  const out = [];
  const indexById = new Map();
  for (const s of sources) {
    if (!s) continue;
    const id = String(s.id || "");
    if (!id) { out.push(s); continue; }
    if (!indexById.has(id)) {
      indexById.set(id, out.length);
      out.push(s);
      continue;
    }
    const keptIdx = indexById.get(id);
    const kept = out[keptIdx];
    if (kept && kept.nameQueryComplete === false && s.nameQueryComplete !== false) {
      out[keptIdx] = s;
    }
  }
  return out;
}

function mergeProfileAndPlanSources(profileSources = [], planSources = []) {
  const out = [];
  const seen = new Set();
  for (const s of [...profileSources, ...planSources]) {
    if (!s) continue;
    const key = model.normalizeUrl(s.rssUrl || (Array.isArray(s.rssUrls) && s.rssUrls[0]) || s.url || "") || `id:${String(s.id || "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  // Die source_id-Eindeutigkeit erzwingt EINE Implementierung (dedupeSourcesById)
  // — dieselbe, die auch der Fallback-Katalogpfad nutzt (keine zwei driftenden
  // Kopien derselben Invariante).
  return dedupeSourcesById(out);
}

module.exports = {
  sourceMode, buildRelationalCrawlPlan, comparePlans, toCrawlerSource, isLandesmodulPath,
  mergeProfileAndPlanSources, dedupeSourcesById, buildShadowRunReport,
  landesmodulLaenderFuerPfad, landesmodulFreigabe, LANDESMODUL_LAENDER
};
