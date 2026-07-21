"use strict";

// Helmut — Sprint 1 "Universelles Mandatsregister" · Resolver.
//
// EIN kanonischer Ort, der aus einem (beliebigen) Mandatsprofil ein vollstaendig
// aufgeloestes, universelles Mandat ableitet — fuer JEDEN Bundestagsabgeordneten,
// unabhaengig von Partei, Fraktion oder Ausschuss. Beantwortet die sechs
// Sprint-1-Kernfragen (Auftrag):
//   • Wer ist der Mandant?            -> identity (kanonischer Personenschluessel, externe IDs)
//   • Partei und Fraktion?            -> party / fraction (datengetrieben aus mandate-registry)
//   • Ausschuesse und Funktionen?     -> committees / functions
//   • Welche Themen ergeben sich?     -> themes (Politikfelder + Thementermini + Ministerien)
//   • Welche Pflichtdaten fehlen?     -> requiredData / validation (profile-validation)
//   • Welche Quellenpakete spaeter?   -> packages (profile-packages)
// und darauf aufbauend EINEN verbindlichen Versorgungsstatus + eine Coverage-Zeile.
//
// PRINZIPIEN:
//   - KEINE Pilot-/Partei-/Ausschuss-Sonderlogik. Alle Fach-Relationen sind DATEN
//     (seeds/mandate-registry.js). Neue Partei/neuer Ausschuss/neues Thema = Datenzeile.
//   - WIEDERVERWENDUNG: parliamentTypeOf/accountType (config), validateProfile
//     (profile-validation), resolveProfilePackages/profileSupplyStatus (profile-packages),
//     normalizeParty/committeeMatchKey (matching). Kein Doppelmodell.
//   - EHRLICHKEIT: fehlt/unklar etwas, wird es AUSGEWIESEN (missing/reviewFlags/blockers),
//     nie geraten oder mit einem Default aufgehuebscht. Kein fremdes Profil als Fallback.
//
// Reine, deterministische Logik. Kein Netz, keine KI, kein Storage-Write, kein Rendering.

const { parliamentTypeOf, accountTypeOf } = require("./config");
const { validateProfile } = require("./profile-validation");
const {
  resolveProfilePackages, profileSupplyStatus
} = require("./quellenarchitektur/profile-packages");
const { PACKAGE_DEFINITIONS } = require("./quellenarchitektur/seeds/packages");
const registry = require("./quellenarchitektur/seeds/mandate-registry");

const PACKAGE_BY_KEY = new Map((PACKAGE_DEFINITIONS || []).map((p) => [p.key, p]));

const REGISTER_VERSION = registry.REGISTRY_VERSION;

// Verbindliche Versorgungs-/Coverage-Zustaende (Auftrag §4/§7).
const COVERAGE = {
  COMPLETE: "vollstaendig",     // genug Daten fuer spaetere hochwertige Briefings; keine Blocker
  INCOMPLETE: "unvollstaendig", // Pflichtdaten fehlen -> der Mandant/Betreiber muss ergaenzen
  BLOCKED: "blockiert",         // Daten ok, aber strukturell (noch) nicht versorgbar (fehlendes Modul/Paket/deaktiviert)
  REVIEW: "review"              // Aufloesung unsicher (unbekannte Partei/Ausschuss, mehrdeutige Identitaet, Fehler) -> menschliche Pruefung
};

// --- kleine Helfer ----------------------------------------------------------
function hasStr(v) { return String(v == null ? "" : v).trim().length > 0; }

// Feldnamen-Bruecke (Universalitaet): validateProfile/config lesen historisch NUR die
// englischen Aliase (party/faction/committees/focusTopics), NICHT die deutschen
// mandate_profiles-Felder (partei/fraktion/ausschuesse/fachpolitische_schwerpunkte).
// Ein universelles Register muss BEIDE Schreibweisen tragen. Diese Bruecke fuellt die
// englischen Aliase aus den deutschen, WENN sie fehlen — additiv, ohne Originalfelder zu
// veraendern (profile-packages liest ohnehin schon beide; hier fuer validateProfile).
function bridgeProfile(profile = {}) {
  const p = { ...profile };
  const pick = (...names) => { for (const n of names) if (hasStr(p[n]) || (Array.isArray(p[n]) && p[n].length)) return p[n]; return undefined; };
  if (!hasStr(p.fullName)) { const v = pick("fullName", "name", "voller_name", "vollstaendiger_name"); if (v !== undefined) p.fullName = v; }
  if (!hasStr(p.party)) { const v = pick("party", "partei"); if (v !== undefined) p.party = v; }
  if (!hasStr(p.faction)) { const v = pick("faction", "fraktion"); if (v !== undefined) p.faction = v; }
  if (!(Array.isArray(p.committees) && p.committees.length) && !hasStr(p.committee)) {
    const v = pick("committees", "ausschuesse", "committee", "ausschuss");
    if (v !== undefined) p.committees = Array.isArray(v) ? v : [v];
  }
  if (!(Array.isArray(p.focusTopics) && p.focusTopics.length)) {
    const v = pick("focusTopics", "fachpolitische_schwerpunkte", "themen", "reportingTopics", "berichterstatter_themen", "topics");
    if (v !== undefined) p.focusTopics = Array.isArray(v) ? v : [v];
  }
  if (!hasStr(p.state)) { const v = pick("state", "bundesland"); if (v !== undefined) p.state = v; }
  if (!hasStr(p.constituency)) { const v = pick("constituency", "wahlkreis"); if (v !== undefined) p.constituency = v; }
  return p;
}
function asList(...vals) {
  const out = [];
  for (const v of vals) {
    if (Array.isArray(v)) { for (const x of v) if (hasStr(x)) out.push(String(x).trim()); }
    else if (hasStr(v)) out.push(String(v).trim());
  }
  return out;
}
function uniq(list) { return [...new Set(list)]; }

// --- Identitaet -------------------------------------------------------------
// NUR akademische/parlamentarische Titel werden fuer den kanonischen Schluessel
// entfernt (Dubletten-Vermeidung: "Dr. Anna Mueller" == "Anna Mueller"). BEWUSST
// KEINE Adelspartikel (von/van/zu/der): diese sind seit 1919 Teil des gesetzlichen
// Nachnamens ("von der Leyen"); ihr Entfernen wuerde verschiedene Personen faelschlich
// verschmelzen (adversarialer Review-Befund). Falsch-Zusammenlegen ist die gefaehrliche
// Richtung — lieber weniger strippen.
const TITLE_TOKENS = new Set([
  "dr", "prof", "professor", "professorin", "med", "jur", "rer", "nat", "phil",
  "pol", "ing", "dipl", "mba", "llm", "mult", "hc", "mdb", "mda"
]);

function foldName(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

// Kanonischer Namensslug: akademische Titel entfernt, Umlaute gefaltet, nur [a-z0-9-].
// "Prof. Dr. Anna Mueller-Schmidt (MdB)" -> "anna-mueller-schmidt"
// Umlaut-Faltung ist konsistent (ä/ö/ü/ß -> ae/oe/ue/ss): "Müller" == "Mueller"; sie
// setzt aber NICHT ue == u ("Müster"->"muester" ist bewusst != "Muster"->"muster").
// Rein numerische/leere Namen sind KEINE Identitaet -> "" (fallen auf weak/none zurueck),
// damit Platzhalter ("0"/"123") nicht als Person zusammenclustern.
function nameSlug(fullName) {
  const folded = foldName(fullName)
    .replace(/\(.*?\)/g, " ")          // Klammerzusaetze (MdB) entfernen
    .replace(/[^a-z0-9\s-]/g, " ")     // Satzzeichen -> Leer
    .replace(/-/g, " ");               // Bindestriche als Worttrenner behandeln
  const tokens = folded.split(/\s+/).filter(Boolean).filter((t) => !TITLE_TOKENS.has(t));
  const slug = tokens.join("-");
  return /[a-z]/.test(slug) ? slug : ""; // ohne Buchstaben keine gueltige Personenidentitaet
}

// Bekannte stabile PERSONEN-eindeutige externe ID-Quellen (Reihenfolge = Vertrauensrang).
// BEWUSST OHNE Wahlkreis-Nr: die ist ein GEOGRAFISCHER Schluessel (Direktkandidat +
// Listenkandidaten desselben Wahlkreises teilen ihn) — als Personen-ID wuerde sie
// verschiedene Menschen zu einer "stabilen" Dublette verschmelzen (adversarialer
// Review-Befund, high). Wahlkreis dient nur der DISAMBIGUIERUNG Namensgleicher (unten).
const EXTERNAL_ID_FIELDS = [
  { source: "bundestag", fields: ["bundestagId", "bundestag_id", "mdbId", "mdb_id"] },
  { source: "abgeordnetenwatch", fields: ["abgeordnetenwatchId", "abgeordnetenwatch_id", "awId", "aw_id"] }
];

function collectExternalIds(profile = {}) {
  const ids = [];
  for (const spec of EXTERNAL_ID_FIELDS) {
    for (const f of spec.fields) {
      if (hasStr(profile[f])) { ids.push({ source: spec.source, id: String(profile[f]).trim() }); break; }
    }
  }
  return ids;
}

// Liefert die Identitaet eines Mandats: kanonischer Personenschluessel (bevorzugt
// stabile externe ID, sonst Namensslug), Anzeigename, externe IDs, Konfidenz.
function mandateIdentity(profile = {}) {
  const displayName = String(profile.fullName || profile.name || "").replace(/\s+/g, " ").trim();
  const slug = nameSlug(displayName);
  const externalIds = collectExternalIds(profile);
  const partyKey = registry.resolveParty(profile.party || profile.partei || profile.faction || profile.fraktion).key;

  let personKey, confidence, keySource;
  if (externalIds.length) {
    personKey = `ext:${externalIds[0].source}:${externalIds[0].id}`;
    confidence = "stable";
    keySource = externalIds[0].source;
  } else if (slug) {
    personKey = `name:${slug}`;
    confidence = "name";       // eindeutig NUR ueber Namen -> Dubletten-Risiko bei Namensgleichheit
    keySource = "name";
  } else if (partyKey) {
    personKey = `party-only:${partyKey}`;
    confidence = "weak";       // kein Name -> nicht als Person identifizierbar
    keySource = "party";
  } else {
    personKey = "";
    confidence = "none";
    keySource = "none";
  }

  // Disambiguierungsschluessel (Namensgleiche trennen): Name + Partei + Wahlkreis.
  const wahlkreis = String(profile.constituency || profile.wahlkreis || "").trim().toLowerCase();
  const disambiguationKey = slug ? `name:${slug}|${partyKey || "?"}|${nameSlug(wahlkreis) || "?"}` : personKey;

  return {
    personKey,
    disambiguationKey,
    nameSlug: slug,
    displayName,
    externalIds,
    confidence,
    keySource,
    hasStableId: externalIds.length > 0
  };
}

// --- Partei / Fraktion / Ausschuesse / Funktionen ---------------------------
function resolvePartyBlock(profile = {}) {
  const partyField = profile.party || profile.partei || "";  // explizites Partei-Feld
  const factionRaw = profile.faction || profile.fraktion || "";
  const fromField = hasStr(partyField);
  // Partei bevorzugt aus dem Partei-Feld; sonst aus der Fraktion ableiten.
  const p = registry.resolveParty(fromField ? partyField : factionRaw);
  const party = p.party;
  // Fraktion: explizit angegebene Fraktion bevorzugen, sonst aus Partei ableiten (DATEN).
  let fraction = null; let derivedFromParty = false;
  if (hasStr(factionRaw)) {
    const fk = registry.resolveParty(factionRaw).key;
    fraction = registry.getFraction(registry.PARTY_TO_FRACTION[fk] || fk) || registry.fractionForParty(fk);
  }
  if (!fraction && p.key) { fraction = registry.fractionForParty(p.key); derivedFromParty = true; }

  return {
    party: {
      raw: String(fromField ? partyField : (factionRaw || "")), key: p.key,
      name: party ? party.name : null, entity_id: party ? party.entity_id : null,
      known: p.known,
      // fromField = die Partei kam aus dem Partei-Feld (nicht aus einer Fraktions-Ableitung).
      // Nur DANN ist eine unbekannte Partei ein Datenqualitaets-Review-Grund.
      fromField
    },
    fraction: fraction ? {
      key: fraction.key, name: fraction.name, entity_id: fraction.entity_id,
      known: true, derivedFromParty
    } : { key: null, name: null, entity_id: null, known: false, derivedFromParty: false }
  };
}

function resolveCommitteeBlock(profile = {}) {
  const raws = asList(
    profile.committees, profile.committee, profile.ausschuesse,
    profile.stellvertretende_ausschuesse
  );
  const seen = new Set();
  const committees = [];
  for (const raw of raws) {
    const r = registry.resolveCommittee(raw);
    if (!r.key || seen.has(r.key)) continue;
    seen.add(r.key);
    committees.push({
      raw: r.raw, key: r.key,
      name: r.committee ? r.committee.name : null,
      policyField: r.committee ? r.committee.policyField : null,
      ministry: r.committee ? r.committee.ministry : null,
      ministryEntity: r.committee ? r.committee.ministryEntity : null,
      themeTerms: r.committee ? r.committee.themeTerms : [],
      known: r.known
    });
  }
  return committees;
}

function resolveFunctionBlock(profile = {}) {
  const raws = asList(
    profile.functions, profile.funktionen, profile.roles, profile.rollen,
    profile.position, profile.funktion
  );
  const out = []; const seen = new Set();
  for (const raw of raws) {
    const fn = registry.resolveFunction(raw);
    if (fn && !seen.has(fn.key)) { seen.add(fn.key); out.push({ raw, key: fn.key, label: fn.label }); }
  }
  return out;
}

// --- Themen-Ableitung -------------------------------------------------------
// Politikfelder + Thementermini + relevante Ministerien folgen DATENGETRIEBEN aus
// den aufgeloesten Ausschuessen; explizite Fokusthemen des Profils kommen additiv hinzu.
function deriveThemes(committees, profile = {}) {
  const policyFields = uniq(committees.map((c) => c.policyField).filter(Boolean));
  const themeTerms = uniq(committees.flatMap((c) => c.themeTerms || []));
  const ministries = uniq(committees.map((c) => c.ministry).filter(Boolean));
  const ministryEntities = uniq(committees.map((c) => c.ministryEntity).filter(Boolean));
  const explicitTopics = uniq(asList(
    profile.focusTopics, profile.fachpolitische_schwerpunkte, profile.reportingTopics,
    profile.berichterstatter_themen, profile.themen, profile.topics
  ));
  return { policyFields, themeTerms, ministries, ministryEntities, explicitTopics };
}

// --- Quellen-Ausblick (Sprint-2-Vorbereitung, EHRLICH getrennt) -------------
// Beantwortet Auftrag §6 "Welche Quellenpakete werden spaeter benoetigt?" und macht
// die (heute grosse) Luecke sichtbar, OHNE ein Mandat faelschlich als versorgt zu
// melden. Register-Datenreife (coverageStatus) und Quellen-Versorgung (dieser
// Ausblick) sind BEWUSST zwei getrennte Achsen: Sprint 1 liefert die Datenreife,
// Sprint 2 baut die Pakete. gaps = die konkrete Bauliste je Mandat.
function packageStatusOf(key) {
  const pkg = PACKAGE_BY_KEY.get(key);
  if (!pkg) return "fehlt";
  return pkg.status === "active" ? "aktiv" : pkg.status; // prepared/draft/paused/archived
}

function computeSupplyOutlook(parts) {
  const { party, committees, packages, registerReady } = parts;
  const needed = []; // {category, subject, packageKey|null, status}  status: aktiv|prepared|draft|fehlt|kein-paket-definiert
  const gaps = [];

  // Basis (Pflicht) + evtl. Landespaket.
  for (const key of packages.required) {
    needed.push({ category: "basis", subject: key, packageKey: key, status: packageStatusOf(key) });
  }
  for (const rm of packages.requiredMissing) {
    needed.push({ category: "basis", subject: rm, packageKey: null, status: "kein-modul" });
    gaps.push({ category: "basis", need: rm, reason: "kein-landesmodul" });
  }

  // Partei -> Parteipaket (heute nur Die Linke vorhanden).
  if (party.known && party.key) {
    const pk = registry.partyPackageKey(party.key);
    const status = pk ? packageStatusOf(pk) : "kein-paket-definiert";
    needed.push({ category: "partei", subject: party.key, packageKey: pk, status });
    if (!pk || status !== "aktiv") gaps.push({ category: "partei", need: `parteipaket:${party.key}`, reason: pk ? `paket-${status}` : "kein-parteipaket" });
  }

  // Ausschuss/Politikfeld -> Themenpaket (heute nur Arbeit und Soziales vorhanden).
  const seenField = new Set();
  for (const c of committees) {
    if (!c.known || !c.policyField || seenField.has(c.key)) continue;
    seenField.add(c.key);
    const pk = registry.committeePackageKey(c.key);
    const status = pk ? packageStatusOf(pk) : "kein-paket-definiert";
    needed.push({ category: "thema", subject: c.policyField, packageKey: pk, status });
    if (!pk || status !== "aktiv") gaps.push({ category: "thema", need: `themenpaket:${c.key}`, reason: pk ? `paket-${status}` : "kein-themenpaket" });
  }

  // Optionale bereits aufgeloeste Zusatzpakete (z. B. Region) ehrlich mit Status.
  // Das persoenliche Paket "profil-<id>" ist eine LAUFZEIT-/DB-Zeile (nie im Code-Seed),
  // seine Existenz ist eine Provisionierungs-Frage, KEINE Sprint-2-Quellenbibliotheks-Frage
  // -> eigene Kategorie "persoenlich", aus dem Quellen-Gate/den gaps ausgenommen.
  for (const key of packages.optional) {
    if (needed.some((n) => n.packageKey === key)) continue;
    if (String(key).startsWith("profil-")) {
      needed.push({ category: "persoenlich", subject: key, packageKey: key, status: "laufzeit" });
      continue;
    }
    needed.push({ category: "zusatz", subject: key, packageKey: key, status: packageStatusOf(key) });
  }

  // Quellen-Gate: nur Bibliothekspakete (basis/partei/thema/zusatz), NICHT das
  // laufzeitgebundene persoenliche Paket. UND: nur ein register-datenreifes Mandat
  // kann ueberhaupt "quellen-versorgt" sein — sonst wuerde ein Mandat mit unaufloesbarer
  // Partei/Ausschuss (die nichts zur needs-Liste beitragen) oder ein leeres Profil
  // faelschlich als versorgt gemeldet (adversarialer Review-Befund). Bedarf ist nur
  // vertrauenswuerdig, wenn Identitaet/Partei/Ausschuss aufgeloest sind.
  const libraryNeeds = needed.filter((n) => n.category !== "persoenlich");
  const allNeededActive = Boolean(registerReady) && libraryNeeds.length > 0 && libraryNeeds.every((n) => n.status === "aktiv");
  return { needed, gaps, allNeededActive, hasSourceGap: gaps.length > 0 };
}

// --- Verbindlicher Versorgungsstatus + Coverage-Zustand ---------------------
// Kombiniert: Pflichtdaten (validateProfile) + Aufloesungs-Konfidenz (Registry) +
// strukturelle Versorgbarkeit (profileSupplyStatus). Ergebnis: EIN Coverage-Zustand
// (vollstaendig/unvollstaendig/blockiert/review) + maschinenlesbare Begruendungen.
//
// PRAEZEDENZ (bewusst, dokumentiert):
//   1. deaktiviert/gefiltert       -> blockiert (nimmt an keiner Versorgung teil)
//   2. Pflichtdaten fehlen         -> unvollstaendig (der aktionierbarste Zustand zuerst)
//   3. Aufloesung unsicher/fehler  -> review (unbekannte Partei/Ausschuss, mehrdeutige ID, Budgetfehler)
//   4. strukturell nicht versorgbar-> blockiert (Daten ok, aber Modul/Paket fehlt -> Sprint 2)
//   5. sonst                       -> vollstaendig
// Alle Achsen werden IMMER berechnet und als flags/blockers/reviewFlags mitgeliefert,
// damit nichts hinter der Praezedenz verschwindet.
function computeVersorgungsstatus(parts, opts = {}) {
  const { validation, identity, party, committees, supply } = parts;
  const reviewFlags = [];
  const blockers = [];
  const infoFlags = [];
  // hasPathData: nur wenn echte package_paths uebergeben wurden, kann "keine-abrufwege"
  // beurteilt werden. Ohne Wiring-Daten (Register-Standard) ist Paket-Verdrahtung eine
  // Sprint-2-Frage und KEIN Blocker — sonst waere JEDES Bundestagsmandat faelschlich blockiert.
  const hasPathData = Boolean(opts.hasPathData);

  // Aufloesungs-Unsicherheiten (review = menschliche Pruefung noetig):
  if (validation.state === "fehlerhaft") reviewFlags.push({ code: "validierung-fehlerhaft", detail: validation.reason });
  // Unbekannte Partei ist nur dann ein Review-Grund, wenn sie aus dem PARTEI-FELD kam
  // UND kein anerkannter fraktionsloser Status ist. "Fraktionslos" ist die dokumentierte
  // Konvention fuer unabhaengige Abgeordnete (profile-validation.js: partei="Fraktionslos"
  // erfuellt die Pflicht) — KEIN Datenfehler, egal ob im Partei- oder Fraktions-Feld.
  const isFraktionslos = party.key === "fraktionslos";
  if (party.fromField && hasStr(party.raw) && !party.known && !isFraktionslos) {
    reviewFlags.push({ code: "partei-unbekannt", detail: party.raw });
  }
  for (const c of committees) if (!c.known) reviewFlags.push({ code: "ausschuss-unbekannt", detail: c.raw });
  if (identity.confidence === "weak" || identity.confidence === "none") reviewFlags.push({ code: "identitaet-schwach", detail: identity.confidence });
  if (opts.duplicatePersonKey) reviewFlags.push({ code: "moegliche-dublette", detail: opts.duplicatePersonKey });

  // Advisory (kein Review-Ausloeser): fehlende stabile externe ID haertet nur die
  // Dubletten-Erkennung; ein sonst vollstaendiges Mandat wird deswegen NICHT zurueckgehalten.
  if (identity.confidence === "name") infoFlags.push({ code: "identitaet-nur-name", detail: "keine stabile externe ID (Namensgleichheit nur bei echter Kollision kritisch)" });

  // Strukturelle Versorgungsluecken (blockiert) — nur DATEN-bestimmbare Gaps:
  if (validation.disabled) blockers.push({ code: "profil-deaktiviert", detail: validation.reason });
  const seenBlock = new Set();
  for (const m of supply.missingBasePackages || []) {
    const reason = String(m.reason);
    const dataDeterminable =
      reason.startsWith("kein-landesmodul") ||   // Land ohne Modul (reine Registry-Daten)
      reason.startsWith("paket-status-") ||       // Paket existiert, aber prepared/draft (Seed-Daten)
      reason === "paket-fehlt" ||                 // Paket gibt es gar nicht (Seed-Daten)
      (reason === "keine-abrufwege" && hasPathData); // Verdrahtung nur mit echten Pfad-Daten beurteilbar
    if (!dataDeterminable) continue;
    const detail = `${m.key}:${reason}`;
    if (seenBlock.has(detail)) continue;
    seenBlock.add(detail);
    blockers.push({ code: "pflichtpaket-unversorgt", detail });
  }

  // Praezedenz-Entscheidung (dokumentiert im Kopfkommentar):
  let status;
  if (validation.disabled) status = COVERAGE.BLOCKED;
  else if (validation.missingRequired && validation.missingRequired.length) status = COVERAGE.INCOMPLETE;
  else if (reviewFlags.length) status = COVERAGE.REVIEW;
  else if (blockers.length) status = COVERAGE.BLOCKED;
  else status = COVERAGE.COMPLETE;

  return {
    status,
    label: coverageLabel(status),
    reason: coverageReason(status, { validation, reviewFlags, blockers }),
    missingRequired: validation.missingRequired || [],
    reviewFlags,
    blockers,
    infoFlags,
    // registerReady = Register-DATENREIFE (identifiziert, aufgeloest, Pflichtdaten da,
    // nicht strukturell blockiert). BEWUSST NICHT "briefingReady": ob die spaeteren
    // QUELLEN existieren, ist eine getrennte Achse (supplyOutlook) — Sprint 2. Ein
    // registerReady=true-Mandat ist die Voraussetzung, dass Sprint 2 es automatisch
    // versorgen kann, nicht die Garantie fertiger Quellen.
    registerReady: status === COVERAGE.COMPLETE
  };
}

function coverageLabel(status) {
  return {
    [COVERAGE.COMPLETE]: "Vollständig",
    [COVERAGE.INCOMPLETE]: "Unvollständig",
    [COVERAGE.BLOCKED]: "Blockiert",
    [COVERAGE.REVIEW]: "Review erforderlich"
  }[status] || status;
}
function coverageReason(status, ctx) {
  if (status === COVERAGE.INCOMPLETE) return `Pflichtdaten fehlen: ${(ctx.validation.missingRequiredLabels || ctx.validation.missingRequired).join(", ")}.`;
  if (status === COVERAGE.REVIEW) return `Auflösung unsicher: ${ctx.reviewFlags.map((f) => f.code).join(", ")}.`;
  if (status === COVERAGE.BLOCKED) return `Strukturell (noch) nicht versorgbar: ${ctx.blockers.map((b) => b.code).join(", ")}.`;
  if (status === COVERAGE.COMPLETE) return "Alle Pflichtdaten vorhanden, eindeutig aufgelöst, strukturell versorgbar.";
  return "";
}

// --- Hauptfunktion: vollstaendig aufgeloestes Mandat ------------------------
// opts: { packages, packagePaths, duplicatePersonKey } (Paket-/Weg-Daten optional;
// ohne sie nutzt profileSupplyStatus die Code-Seed-Paketdefinitionen).
function resolveMandate(profile = {}, opts = {}) {
  if (!profile || typeof profile !== "object") profile = {};
  const bridged = bridgeProfile(profile); // deutsche mandate_profiles-Felder -> englische Aliase
  const identity = mandateIdentity(bridged);
  const { party, fraction } = resolvePartyBlock(bridged);
  const committees = resolveCommitteeBlock(bridged);
  const functions = resolveFunctionBlock(bridged);
  const themes = deriveThemes(committees, bridged);
  const validation = validateProfile(bridged);
  const packages = resolveProfilePackages(bridged);
  const supply = profileSupplyStatus(bridged, { packages: opts.packages, packagePaths: opts.packagePaths });

  const versorgung = computeVersorgungsstatus(
    { validation, identity, party, committees, supply },
    { duplicatePersonKey: opts.duplicatePersonKey, hasPathData: Array.isArray(opts.packagePaths) && opts.packagePaths.length > 0 }
  );
  const supplyOutlook = computeSupplyOutlook({ party, committees, packages, registerReady: versorgung.registerReady });

  return {
    registerVersion: REGISTER_VERSION,
    profileId: String(profile.id || profile.user_id || profile.politicianId || "") || null,
    parliamentType: parliamentTypeOf(profile) || null,
    accountType: accountTypeOf(profile),
    identity,
    party,
    fraction,
    committees,
    functions,
    themes,
    requiredData: {
      missing: validation.missingRequired,
      missingLabels: validation.missingRequiredLabels,
      complete: validation.missingRequired.length === 0
    },
    packages,
    supply,
    supplyOutlook,
    validation: {
      state: validation.state, stateLabel: validation.stateLabel,
      usable: validation.usable, disabled: validation.disabled, ready: validation.ready
    },
    versorgungsstatus: versorgung,
    coverageStatus: versorgung.status
  };
}

// --- Coverage-Matrix ueber viele Mandate ------------------------------------
// Eine Zeile je Profil (kompakt) + Zusammenfassung; erkennt zusaetzlich Dubletten
// (gleicher Personenschluessel bei >1 Profil) und markiert die betroffenen Zeilen.
function buildCoverageMatrix(profiles = [], opts = {}) {
  const list = Array.isArray(profiles) ? profiles : [];
  const dupes = detectDuplicates(list);

  const rows = list.map((p) => {
    const ck = identityClusterKey(p);
    const dupHit = ck && dupes.duplicateClusterKeys.has(ck) ? ck : null;
    const m = resolveMandate(p, { ...opts, duplicatePersonKey: dupHit });
    return {
      profileId: m.profileId,
      name: m.identity.displayName || null,
      personKey: m.identity.personKey || null,
      party: m.party.key,
      fraction: m.fraction.key,
      parliamentType: m.parliamentType,
      committees: m.committees.map((c) => c.key),
      policyFields: m.themes.policyFields,
      coverageStatus: m.coverageStatus,
      coverageLabel: m.versorgungsstatus.label,
      missingRequired: m.versorgungsstatus.missingRequired,
      reviewFlags: m.versorgungsstatus.reviewFlags.map((f) => f.code),
      blockers: m.versorgungsstatus.blockers.map((b) => b.code),
      requiredPackages: m.packages.required,
      requiredMissingPackages: m.packages.requiredMissing,
      registerReady: m.versorgungsstatus.registerReady,
      // getrennte Achse: fehlen heute noch Quellenpakete (Sprint 2)?
      sourceGaps: m.supplyOutlook.gaps.map((g) => g.need),
      sourceReady: m.supplyOutlook.allNeededActive
    };
  });

  const summary = { total: rows.length };
  for (const key of Object.values(COVERAGE)) summary[key] = rows.filter((r) => r.coverageStatus === key).length;
  summary.registerReady = rows.filter((r) => r.registerReady).length;
  summary.sourceReady = rows.filter((r) => r.sourceReady).length;
  summary.duplicateGroups = dupes.duplicates.length;
  summary.namesakeGroups = dupes.namesakes.length;

  return { rows, summary, duplicates: dupes };
}

// --- Identitaets-Cluster + Dubletten-/Namensvetter-Erkennung -----------------
// Der Identitaets-Clusterschluessel bestimmt, wann ZWEI Datensaetze DIESELBE Person sind:
//   - mit stabiler externer ID  -> deren personKey (ext:<quelle>:<id>) ist der Cluster.
//   - ohne stabile ID           -> Name + Partei + Wahlkreis (disambiguationKey).
// So werden Namensvetter (gleicher Name, andere Partei/anderer Wahlkreis) NICHT zusammengelegt,
// echte Doppelanlagen (gleiche Person mehrfach) dagegen schon. Akademische Titel sind im
// Namensslug entfernt und Umlaute gefaltet ("Dr. Anna Müller" == "Anna Mueller").
function identityClusterKey(profile = {}) {
  const id = mandateIdentity(profile);
  if (id.hasStableId) return id.personKey;
  if (id.nameSlug) return id.disambiguationKey;
  return null; // ohne Name/ID keine Personenzuordnung bestimmbar
}

function detectDuplicates(profiles = []) {
  const list = Array.isArray(profiles) ? profiles : [];
  const byCluster = new Map();   // clusterKey -> members (dieselbe Person)
  const byName = new Map();      // nameSlug -> Set(clusterKey) (Namensvetter-Erkennung)
  for (const p of list) {
    const id = mandateIdentity(p);
    const ck = identityClusterKey(p);
    if (!ck) continue;
    if (!byCluster.has(ck)) byCluster.set(ck, []);
    byCluster.get(ck).push({ profile: p, identity: id });
    if (id.nameSlug) {
      if (!byName.has(id.nameSlug)) byName.set(id.nameSlug, new Set());
      byName.get(id.nameSlug).add(ck);
    }
  }

  // Echte Dubletten: EIN Clusterschluessel mit mehr als einem Datensatz.
  const duplicates = [];
  const duplicateClusterKeys = new Set();
  for (const [clusterKey, members] of byCluster) {
    if (members.length < 2) continue;
    duplicateClusterKeys.add(clusterKey);
    duplicates.push({
      clusterKey, kind: "dublette", count: members.length,
      profileIds: members.map((m) => String(m.profile.id || m.profile.user_id || "")).filter(Boolean),
      names: uniq(members.map((m) => m.identity.displayName))
    });
  }

  // Namensvetter: EIN Namensslug ueber MEHRERE Cluster (verschiedene Personen, nur sichtbar machen).
  const namesakes = [];
  for (const [name, clusters] of byName) {
    if (clusters.size < 2) continue;
    namesakes.push({ nameSlug: name, kind: "namensgleiche", clusterKeys: [...clusters] });
  }

  return {
    duplicates, namesakes, duplicateClusterKeys,
    duplicateCount: duplicates.length,
    // Rueckwaertskompatible Gesamtliste (Dubletten + Namensvetter):
    groups: [...duplicates, ...namesakes]
  };
}

module.exports = {
  REGISTER_VERSION,
  COVERAGE,
  // Identitaet
  mandateIdentity,
  nameSlug,
  collectExternalIds,
  identityClusterKey,
  detectDuplicates,
  // Aufloesung
  resolveMandate,
  resolvePartyBlock,
  resolveCommitteeBlock,
  resolveFunctionBlock,
  deriveThemes,
  // Versorgung / Coverage
  computeSupplyOutlook,
  computeVersorgungsstatus,
  buildCoverageMatrix,
  // Registry-Durchreiche (bequemer Zugriff fuer Konsumenten)
  registry
};
