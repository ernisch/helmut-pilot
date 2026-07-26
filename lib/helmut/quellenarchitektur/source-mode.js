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
//   - Landesmodule (Berlin/Brandenburg) sind ausgeschlossen, solange ihr Land nicht
//     AUSDRÜCKLICH freigegeben ist (Feature-Guard HELMUT_LANDESMODULE, Default LEER =
//     alle Länder gesperrt). Das Gate wirkt je Land getrennt und zusätzlich zur
//     prepared/needs_review-Datenlage.
//   - dev_only-/Testwege laufen NIE in Production; manuelle Wege (activation_mode='manual')
//     werden NICHT automatisch abgerufen; pausierte/archivierte Wege (Orphans) werden NICHT
//     automatisch reaktiviert; defekte (broken, u. a. bot-gesperrte) Wege stehen im Plan als
//     NICHT ausführbar.
//   - DIP bleibt erhalten: der api-Pfad (rp-dip) läuft NICHT über den Quellen-Crawl,
//     sondern unverändert über lib/helmut/dip.js (eigener, always_on-Pfad).
//
// REINE LOGIK: alle Daten (DB-Zeilen, Legacy-Katalog, Profile) werden injiziert.

const { flagValue } = require("../flags");
const model = require("./model");
const { computeGlobalActivation } = require("./profile-packages");

// --- Landesmodule: Kennungen je Land ----------------------------------------------------------
// Ein Abrufweg gehoert zum Landesmodul eines Landes, wenn seine Id ODER seine legacy_source_id
// das Landespraefix traegt ODER er in einem Paket dieses Landes haengt. Die PARTEI-Pakete
// (die-linke-<land>, P0-2) stehen bewusst mit in der Liste: ihre Wege tragen heute zwar dasselbe
// Praefix, aber die Paketbindung darf nicht die schwaechere Erkennung sein.
//
// MEHRLAENDRIGE WEGE: rbb24 ist ein Zwei-Laender-Sender und haengt in BEIDEN Landespaketen.
// Ein solcher Weg laeuft, sobald MINDESTENS EINES seiner Laender freigegeben ist (sonst haette
// Berlin keine oeffentlich-rechtliche Landesberichterstattung, obwohl der Weg zum Berlin-Paket
// gehoert). Die Referenzzaehlung bleibt davon unberuehrt: das nicht freigegebene Land bleibt
// `prepared` und steuert 0 Referenzen bei. Der Plan weist solche Wege in `mehrlaendrig` aus,
// damit die Nebenwirkung (Fremdland-Inhalte im Rohstrom) sichtbar bleibt und nicht behauptet
// werden kann, es kaeme ausschliesslich Inhalt des freigegebenen Landes an.
const LANDESMODULE = Object.freeze({
  berlin: Object.freeze({
    paketKeys: Object.freeze(["berlin-basis", "die-linke-berlin"]),
    idPraefixe: Object.freeze(["rp-be-"]),
    legacyPraefixe: Object.freeze(["be-"])
  }),
  brandenburg: Object.freeze({
    paketKeys: Object.freeze(["brandenburg-basis", "die-linke-brandenburg"]),
    idPraefixe: Object.freeze(["rp-bb-"]),
    legacyPraefixe: Object.freeze(["bb-"])
  })
});
const LANDESMODUL_LAENDER = Object.freeze(Object.keys(LANDESMODULE).sort());

function sourceMode(env = process.env) {
  const raw = String(flagValue("HELMUT_SOURCE_MODE", env) || "").trim().toLowerCase();
  if (raw === "shadow") return "shadow";
  if (raw === "on" || raw === "live" || raw === "active") return "on";
  return "off";
}

// Welche Landesmodule beruehrt dieser Abrufweg? Sortierte Liste (stabil), leer = kein Landesmodul.
function landesmoduleOf(path = {}, packageKeysForPath = []) {
  const id = String(path.id || "").toLowerCase();
  const legacy = String(path.legacy_source_id || "").toLowerCase();
  const keys = new Set((packageKeysForPath || []).map((k) => String(k || "").toLowerCase()));
  const treffer = [];
  for (const land of LANDESMODUL_LAENDER) {
    const def = LANDESMODULE[land];
    const hit = def.idPraefixe.some((p) => id.startsWith(p))
      || def.legacyPraefixe.some((p) => legacy.startsWith(p))
      || def.paketKeys.some((k) => keys.has(k));
    if (hit) treffer.push(land);
  }
  return treffer;
}

// Ist ein Abrufweg Teil eines Landesmoduls (unabhaengig von der Freigabe)?
function isLandesmodulPath(path = {}, packageKeysForPath = []) {
  return landesmoduleOf(path, packageKeysForPath).length > 0;
}

// FEATURE-GUARD  HELMUT_LANDESMODULE  (Default LEER = jedes Landesmodul gesperrt).
// Kommagetrennte Liste ausdruecklich freigegebener Laender, z. B. "berlin".
// FAIL-CLOSED: unbekannte Werte wirken nicht, und es gibt bewusst KEIN "alle"/"*" —
// jedes Land muss einzeln benannt werden. Die Freigabe ist damit eine Betreiber-
// entscheidung je Land (Vercel-Env oder helmut-flags.json), keine Code-Entscheidung.
function freigegebeneLandesmodule(env = process.env) {
  const raw = String(flagValue("HELMUT_LANDESMODULE", env) || "");
  const out = new Set();
  for (const teil of raw.split(/[,;\s]+/)) {
    const land = teil.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LANDESMODULE, land)) out.add(land);
  }
  return out;
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
  env = process.env
} = {}) {
  const freigegeben = freigegebeneLandesmodule(env);
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

    // 1) Landesmodul-Gate — unabhängig von Status/Paketen. Ein Weg eines Landesmoduls läuft
    //    NUR, wenn mindestens eines seiner Länder ausdrücklich freigegeben ist (Default: keins).
    const landesmodule = landesmoduleOf(path, packageKeys);
    if (landesmodule.length && !landesmodule.some((land) => freigegeben.has(land))) {
      ausgeschlossen.push({
        id: path.id,
        grund: `landesmodul-gesperrt (${landesmodule.join("+")}: nicht freigegeben)`,
        packageKeys, landesmodule
      });
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
    // 4b) MANUELLE Wege werden nicht automatisch abgerufen.
    //     Befund Punkt 14: `activation_mode='manual'` war bisher KEINE Sperre. model.isPathActive
    //     prüft nur dev_only/paused/archived — ein manueller Weg in einem aktiven Paket galt als
    //     aktiv. Für Berlin/Brandenburg fiel das nicht auf, weil Regel 1 vorher greift; sobald ein
    //     Land freigegeben wird, wären ALLE 10 vorbereiteten Wege des Pakets auf einmal gelaufen —
    //     inklusive der Partei-/Personen-Wege und des 48-MB-PARDOK-Downloads. Die Sperre steht hier
    //     (im ausführenden Plan) statt in model.isPathActive: dessen Semantik ist an anderer Stelle
    //     zugesichert, und der Plan ist die einzige Stelle, die tatsächlich Abrufe auslöst.
    //     Wirkung auf den Bund heute: KEINE — 0 Bundeswege tragen 'manual' (Production 2026-07-26:
    //     18 manuelle Wege, alle Berlin/Brandenburg).
    if (path.activation_mode === "manual") {
      ausgeschlossen.push({ id: path.id, grund: "manuell-gesperrt (activation_mode=manual)", packageKeys, landesmodule });
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
      landesmodule,
      source: toCrawlerSource(path, legacyById)
    });
  }

  // Ehrliche Landesmodul-Kennzahlen: was ist freigegeben, was läuft dadurch wirklich, und
  // welche laufenden Wege sind MEHRLÄNDRIG (liefern also auch Inhalte eines nicht
  // freigegebenen Landes). Ohne diese Zahl liesse sich "nur Berlin läuft" behaupten,
  // obwohl über rbb24 auch Brandenburg-Inhalte im Rohstrom landen.
  const landesmodulAktiv = aktiv.filter((a) => a.landesmodule.length);
  const mehrlaendrig = landesmodulAktiv
    .filter((a) => a.landesmodule.some((land) => !freigegeben.has(land)))
    .map((a) => ({ id: a.id, landesmodule: a.landesmodule, fremdlaender: a.landesmodule.filter((l) => !freigegeben.has(l)) }));

  return {
    aktivierung: {
      aktiveProfile: activation.activeProfileCount,
      aktivePakete: activation.activePackageCount,
      paketStatus: activation.packageStatus
    },
    aktiv,
    defekt,
    ausgeschlossen,
    landesmodule: {
      freigegeben: [...freigegeben].sort(),
      gesperrt: LANDESMODUL_LAENDER.filter((l) => !freigegeben.has(l)),
      aktiveWege: landesmodulAktiv.map((a) => a.id),
      aktiveWegeJeLand: LANDESMODUL_LAENDER.reduce((m, land) => {
        m[land] = landesmodulAktiv.filter((a) => a.landesmodule.includes(land)).map((a) => a.id);
        return m;
      }, {}),
      mehrlaendrig
    },
    stats: {
      wegeGesamt: retrievalPaths.length,
      aktiv: aktiv.length,
      defekt: defekt.length,
      ausgeschlossen: ausgeschlossen.length,
      landesmodulAktiv: landesmodulAktiv.length
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
  sourceMode, buildRelationalCrawlPlan, comparePlans, toCrawlerSource,
  isLandesmodulPath, landesmoduleOf, freigegebeneLandesmodule, LANDESMODULE, LANDESMODUL_LAENDER,
  mergeProfileAndPlanSources, dedupeSourcesById, buildShadowRunReport
};
