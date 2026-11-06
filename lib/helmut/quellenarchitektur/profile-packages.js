"use strict";

// Helmut — Neue Quellenarchitektur · Profil->Paket-Ableitung + Aktivierung + Referenzzählung (Sprint 4).
//
// Reine, deterministische Logik (KEINE KI, kein Netz, kein Storage). Setzt die Auftrags-
// Aktivierungslogik (§9/§10) um:
//   1. Ein aktives Profil erhaelt AUTOMATISCH die passenden Pakete (keine kopierte Quellenliste).
//      Pflicht-Basispaket: Bundestag -> Bund Basis; Landtag -> Bund Basis + Landespaket.
//   2. Technische Paketaktivierung per REFERENZZAEHLUNG: braucht >=1 aktives Profil ein Paket,
//      werden dessen Abrufwege GLOBAL EINMAL aktiv — 100 Profile mit demselben Paket erzeugen
//      genau EINE technische Aktivierung. Ohne Profil bleiben nur always_on-Basisquellen aktiv.
//   3. Ein Profil ohne (versorgtes) Pflicht-Basispaket ist NICHT vollstaendig aktiviert und
//      wird als solches sichtbar (profileSupplyStatus) — Admin/Validierung.
//
// Verbindlich baut das auf `mandate_profiles` auf (deutsche Felder), liest aber robust auch
// die englischen Aliase des gemappten Profil-Objekts. Wiederverwendung statt Doppelmodell:
// parliamentTypeOf (config), validateProfile (profile-validation), normalizeParty/Committee
// (matching), computePathRefcounts/isPathActive (model).

const { parliamentTypeOf } = require("../config");
const { validateProfile } = require("../profile-validation");
const { resolveFachpakete, resolveParteipakete, partyKeys, unresolvedPartyLabels } = require("./seeds/fach-parteiquellen");
const { LANDESMODULE } = require("./seeds/landesmodule-deutschland");
const model = require("./model");
const { PACKAGE_DEFINITIONS, REGION_TERMS_BY_PACKAGE } = require("./seeds/packages");

// Einheitliche Landesregistratur; ein vorbereitetes Modul ist noch keine
// vollständige Versorgung. Namen, Kurzcode und Slug bezeichnen dasselbe Paket.
const LANDESPAKET_BY_BUNDESLAND = Object.fromEntries(LANDESMODULE.flatMap((land) =>
  [land.bundesland, land.code, land.slug].map((name) => [norm(name), land.key])));
// Bestehende lokale Quellpakete bleiben erreichbar. Ihre reale Mehrtiefe ist
// keine Vollständigkeitszusage für andere Parteien; der Abdeckungsbericht zeigt sie.
const LANDESPARTEIPAKET_BY_BUNDESLAND = {
  berlin: { linke: "die-linke-berlin" }, brandenburg: { linke: "die-linke-brandenburg" }
};

// Personenbezogene Pakete: an EIN konkretes Profil gebunden, NICHT aus Sachfeldern
// ableitbar (personenbezogene Nachrichtensuche nur fuer dieses Profil, Auftrag §7.4).
// KONVENTION statt Hardcode: Das persoenliche Paket eines Mandats traegt den Key
// "profil-<mandats-id>" (so sind die bestehenden Production-Daten bereits benannt).
// Die Bindung entsteht ausschliesslich aus Profil-ID + tatsaechlich vorhandenem
// Paket — kein Nutzer ist im Code hinterlegt.
const PERSONAL_PACKAGE_KEY_PREFIX = "profil-";
function personalPackageKeyFor(profileId) {
  const id = String(profileId == null ? "" : profileId).trim().toLowerCase();
  return id ? `${PERSONAL_PACKAGE_KEY_PREFIX}${id}` : "";
}

// Kompatibler Export; die Regeln werden gemeinsam mit allen Fachpaketen gepflegt.
const SOCIAL_TERMS = require("./seeds/fach-parteiquellen").FACHPAKETE
  .find((p) => p.key === "arbeit-und-soziales").topics;

// Regionsbegriffe des Regionalpakets: EINE Quelle der Wahrheit in der Paketdefinition
// (seeds/packages.js REGION_TERMS_BY_PACKAGE). Vorher stand die Liste hier als Duplikat —
// dadurch konnten Profilzuweisung und Paketinhalt auseinanderlaufen (Punkt 13).
const REGIONALPAKET_KEY_NIEDERSACHSEN = "regional-niedersachsen";
const REGIO_NIEDERSACHSEN_TERMS = REGION_TERMS_BY_PACKAGE[REGIONALPAKET_KEY_NIEDERSACHSEN] || [];

function norm(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\s+/g, " ").trim();
}
function normRaw(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim(); }

// Wortanfang-Treffer auf dem normalisierten (ae/oe/ue) Text: der Begriff muss an einer
// Wortgrenze BEGINNEN (Anfang oder Nicht-Buchstabe davor), darf aber weiterlaufen (Kompositum).
// Nach norm() enthaelt der Text nur [a-z0-9 ] -> Grenze = Anfang/Ende oder Nicht-[a-z0-9].
function matchesTermAtWordStart(haystack, term) {
  const h = norm(haystack);
  const t = norm(term);
  if (!h || !t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}`).test(h);
}

function asList(...vals) {
  const out = [];
  for (const v of vals) {
    if (Array.isArray(v)) out.push(...v);
    else if (v != null && String(v).trim()) out.push(v);
  }
  return out;
}

// Robuste Feldextraktion (mandate_profiles-deutsch ODER gemapptes Objekt-englisch).
// Die Ebene kommt zentral aus config.parliamentTypeOf (wertet seit K2 auch politische_ebene aus).
function profileFieldset(profile = {}) {
  return {
    parliamentType: parliamentTypeOf(profile), // "Bundestag" | "Landtag" | ""
    bundesland: profile.bundesland || profile.state || "",
    parteien: asList(profile.partei, profile.party, profile.fraktion, profile.faction),
    ausschuesse: asList(profile.ausschuesse, profile.committees, profile.committee, profile.stellvertretende_ausschuesse, profile.deputyCommittees),
    themen: asList(profile.fachpolitische_schwerpunkte, profile.berichterstatter_themen, profile.focusTopics, profile.reportingTopics, profile.themen, profile.regionale_themen),
    regionen: asList(profile.regionale_interessen, profile.regionale_themen, profile.constituency, profile.wahlkreis, profile.location, profile.bundesland, profile.state)
  };
}

// --- Profil -> Pakete -------------------------------------------------------
// Rueckgabe: { required, requiredMissing, optional, all }
//   required        = Pflicht-Basispakete, die es als Paket GIBT (Bund Basis; ggf. Landespaket)
//   requiredMissing = Pflicht-Basispakete, fuer die es (noch) KEIN Paket gibt (z. B. Land ohne Modul)
//   optional        = ergaenzende Pakete (Partei/Fraktion/Ausschuss/Thema/Region)
function resolveProfilePackages(profile = {}) {
  if (!profile || typeof profile !== "object") profile = {}; // null-Element/Fremdtyp -> leeres Profil
  const f = profileFieldset(profile);
  const required = ["bund-basis"];      // jedes aktive Profil braucht Bund Basis
  const requiredMissing = [];
  const optional = [];
  const profileLand = LANDESMODULE.find((land) => [land.bundesland, land.code, land.slug].some((label) => norm(label) === norm(f.bundesland)));

  if (f.parliamentType === "Landtag") {
    const bl = norm(f.bundesland);
    const landespaket = LANDESPAKET_BY_BUNDESLAND[bl];
    if (landespaket) required.push(landespaket);
    else requiredMissing.push(`landespaket:${bl || "unbekannt"}`);
    const landKey = landespaket && landespaket.replace(/-basis$/, "");
    const local = LANDESPARTEIPAKET_BY_BUNDESLAND[landKey];
    if (local) {
      const explicit = asList(profile.partei, profile.party);
      for (const k of (explicit.length ? explicit : asList(profile.fraktion, profile.faction)).flatMap(partyKeys)) {
        if (local[k]) optional.push(local[k]);
      }
    }
  }

  optional.push(...resolveParteipakete(profile), ...resolveFachpakete(profile));

  // Region -> Regionalpaket (aktuell nur Niedersachsen vorhanden).
  if (profileLand?.slug === "niedersachsen" || f.regionen.some((r) => REGIO_NIEDERSACHSEN_TERMS.some((term) => norm(r).includes(norm(term))))) {
    optional.push(REGIONALPAKET_KEY_NIEDERSACHSEN);
  }

  // Personenbezogenes Paket (an die konkrete Profil-ID gebunden, NICHT aus Sachfeldern).
  // Konvention "profil-<mandats-id>": der Key wird immer referenziert; WIRKSAM wird
  // die Referenz nur, wenn ein Paket mit diesem Key tatsaechlich existiert
  // (computeGlobalActivation zaehlt nur vorhandene Pakete). So bleibt das persoenliche
  // Paket eines Mandats aktivierbar, ohne dass irgendeine ID im Code steht.
  const profileId = String(profile.id || profile.user_id || profile.politicianId || "").trim().toLowerCase();
  const personalPackage = personalPackageKeyFor(profileId);
  if (personalPackage) optional.push(personalPackage);

  const all = [...new Set([...required, ...optional])];
  const unresolvedParties = unresolvedPartyLabels(profile);
  // Die neuen Landesbasispakete versorgen Landtagsprofile. Daraus darf keine
  // gleichwertige Wahlkreisversorgung für Bundestagsprofile erfunden werden.
  const missingRegionalPackages = f.parliamentType === "Bundestag" && profileLand && profileLand.slug !== "niedersachsen"
    ? [`regionalpaket:${profileLand.slug}`] : [];
  return { required, requiredMissing, optional: [...new Set(optional)], all,
    optionalMissing: [...unresolvedParties.map((party) => `partei:${norm(party)}`), ...missingRegionalPackages],
    diagnostics: { unresolvedPartyLabels: unresolvedParties, missingRegionalPackages }
  };
}

// --- Aktivierungsberechtigung: welches Profil zaehlt fuer die Aktivierung? ---
// Nur AKTIVE (nicht deaktivierte/geloeschte) und brauchbare Profile. Fehlerhafte/leere
// Profile (INVALID/NOT_READY) tragen NICHT zur Aktivierung bei (§ Test 7: keine falsche
// Aktivierung). validateProfile deckt deaktiviert (profileActive=false) bereits ab.
function isActivationEligible(profile = {}) {
  if (!profile || typeof profile !== "object") return false; // null/Fremdtyp -> nie aktivierungsberechtigt
  if (profile.geloescht_at || profile.deleted_at) return false;
  const v = validateProfile(profile);
  return v.usable === true; // COMPLETE oder PARTIAL
}

// --- Versorgungsstatus eines Profils (Pflichtpaket-Check) -------------------
// fullyActivated nur, wenn ALLE Pflicht-Basispakete existieren, Status 'active' haben UND
// mindestens einen Abrufweg tragen (Landespaket 'prepared'/leer -> nicht vollstaendig).
function profileSupplyStatus(profile = {}, opts = {}) {
  const packages = opts.packages || PACKAGE_DEFINITIONS;
  const packagePaths = opts.packagePaths || [];
  const byKey = new Map(packages.map((p) => [p.key, p]));
  const pathCountByPkgId = countPathsByPackage(packagePaths);

  const resolved = resolveProfilePackages(profile);
  const eligible = isActivationEligible(profile);
  const missingBasePackages = [];

  for (const key of resolved.required) {
    const pkg = byKey.get(key);
    if (!pkg) { missingBasePackages.push({ key, reason: "paket-fehlt" }); continue; }
    if (pkg.status !== "active") { missingBasePackages.push({ key, reason: `paket-status-${pkg.status}` }); continue; }
    if (!(pathCountByPkgId.get(pkg.id) > 0)) { missingBasePackages.push({ key, reason: "keine-abrufwege" }); continue; }
  }
  // requiredMissing (kein Paket fuer dieses Land) zaehlt ebenfalls als fehlendes Pflichtpaket.
  for (const rm of resolved.requiredMissing) missingBasePackages.push({ key: rm, reason: "kein-landesmodul" });

  const fullyActivated = eligible && missingBasePackages.length === 0;
  return {
    eligible,
    fullyActivated,
    requiredPackages: resolved.required,
    requiredMissing: resolved.requiredMissing,
    optionalPackages: resolved.optional,
    missingBasePackages,
    reason: !eligible ? "profil-nicht-aktivierbar"
      : missingBasePackages.length ? "pflichtpaket-unversorgt" : "ok"
  };
}

function countPathsByPackage(packagePaths) {
  const m = new Map();
  for (const pp of packagePaths || []) {
    if (!pp || !pp.package_id) continue;
    m.set(pp.package_id, (m.get(pp.package_id) || 0) + 1);
  }
  return m;
}

// --- Globale Aktivierung + Referenzzaehlung ---------------------------------
// Aus allen Profilen die technisch aktiven Pakete + Abrufwege ableiten.
//   - Paket technisch aktiv NUR, wenn >=1 aktives Profil es braucht UND status==='active'.
//     (KEINE Paket-Ebene-Daueraktivierung: ohne aktives Profil ist KEIN Paket aktiv.
//      prepared/draft-Pakete werden nie technisch aktiviert; angefordert-aber-unversorgt
//      erscheint als 'requested_unsupplied'.)
//   - Abrufweg aktiv per Referenzzaehlung (>=1 aktives Paket via package_paths) ODER wenn er
//     selbst activation_mode='always_on' traegt. Ohne aktives Profil laufen daher AUSSCHLIESSLICH
//     die ausdruecklich dauerhaft aktiven Kern-Abrufwege (die 5 neutralen Bund-Basis-Systemquellen),
//     NICHT das ganze Bund-Basis-Paket (verbindliche Nachschaerfung K1).
function computeGlobalActivation(input = {}) {
  const profiles = input.profiles || [];
  const packages = input.packages || PACKAGE_DEFINITIONS;
  const packagePaths = input.packagePaths || [];
  const retrievalPaths = input.retrievalPaths || [];

  const activeProfiles = profiles.filter(isActivationEligible);

  // Paket-Referenzzaehlung: paketKey -> Set(profilId)
  const packageRefs = new Map();
  for (const p of activeProfiles) {
    const pid = p.id || p.user_id || p.politicianId || JSON.stringify(p).slice(0, 40);
    for (const key of resolveProfilePackages(p).all) {
      if (!packageRefs.has(key)) packageRefs.set(key, new Set());
      packageRefs.get(key).add(pid);
    }
  }

  // Paketstatus bestimmen. Ein Paket ist NUR aktiv, wenn ein aktives Profil es braucht
  // (keine Paket-Ebene-Daueraktivierung mehr — Daueraktivierung lebt allein auf der
  // Abrufweg-Ebene via activation_mode='always_on').
  const packageStatus = packages.map((pk) => {
    const refs = packageRefs.get(pk.key);
    const refCount = refs ? refs.size : 0;
    const neededByProfile = refCount > 0;
    let activation;
    if (pk.status === "active" && neededByProfile) activation = "active";
    else if (neededByProfile && pk.status !== "active") activation = "requested_unsupplied"; // gebraucht, aber (prepared/draft) nicht versorgt
    else activation = "inactive";
    return { id: pk.id, key: pk.key, status: pk.status, refCount, activation };
  });

  const activePackageIds = new Set(packageStatus.filter((p) => p.activation === "active").map((p) => p.id));

  // Abrufweg-Referenzzaehlung ueber die AKTIVEN Pakete (Sprint-1-Funktion, mit synthetischem
  // Status: nur aktive Pakete zaehlen).
  const packagesForRefcount = packages.map((pk) => ({ id: pk.id, status: activePackageIds.has(pk.id) ? "active" : "paused" }));
  const pathRefcounts = model.computePathRefcounts({ packagePaths, packages: packagesForRefcount });

  const pathActivation = retrievalPaths.map((rp) => {
    const refs = pathRefcounts[rp.id] || [];
    const active = model.isPathActive(rp, refs);
    return { id: rp.id, legacy_source_id: rp.legacy_source_id, activation_mode: rp.activation_mode, status: rp.status, refCount: refs.length, active, reason: active ? (rp.activation_mode === "always_on" ? "always_on" : "referenced") : (rp.activation_mode === "dev_only" ? "dev_only" : "no-active-package") };
  });

  const activePaths = pathActivation.filter((p) => p.active);

  return {
    activeProfileCount: activeProfiles.length,
    packageStatus,
    activePackageCount: activePackageIds.size,
    pathActivation,
    activePathIds: activePaths.map((p) => p.id),
    activePathCount: activePaths.length
  };
}

module.exports = {
  LANDESPAKET_BY_BUNDESLAND,
  LANDESPARTEIPAKET_BY_BUNDESLAND,
  personalPackageKeyFor,
  resolveProfilePackages,
  isActivationEligible,
  profileSupplyStatus,
  computeGlobalActivation
};
