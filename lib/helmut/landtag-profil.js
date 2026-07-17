"use strict";

// Helmut — Landtagsprofil-Modell (Landtag-Sprint Phase 3).
// =============================================================================================
// Definiert die ERWEITERTEN Profilfelder fuer Landtagsmandate und eine beratende
// Vollstaendigkeitsauswertung. KEINE neue Persistenzschicht und KEINE Migration:
//
//   - Bestehende Felder (mandate_profiles-Spalten): bundesland/state, wahlkreis/constituency,
//     partei/party, fraktion/faction, ausschuesse/committees (+stellvertretende_ausschuesse),
//     rolle/function, regierungsrolle/governmentRole, regionale_themen/regionalTopics,
//     regionale_interessen/regionalInterests, relevante_ministerien/relevantMinistries.
//   - NEUE kanonische Felder (camelCase) reisen VERLUSTFREI ueber den bestehenden
//     profil_extras-Auffangbehaelter (storage.collectProfileExtras) und stehen nach dem
//     Roundtrip wieder am Profil: parliament, speakerRoles, functions,
//     relevantAuthorities, relevantMedia.
//
// Das konkrete Parlament wird NICHT geraten: explizites `parliament`-Feld gewinnt;
// sonst Ableitung aus politische_ebene + bundesland ueber die Parlaments-Registry.
//
// REINE LOGIK: kein Netz, kein Storage, kein LLM. Keine echten Profile — Fixtures
// liegen unter test/fixtures/profiles/ (anonymisiert).

const { resolveParlament } = require("./parlamente");
const { validateProfile } = require("./profile-validation");

// Kanonische erweiterte Felder eines Landtagsprofils (Dokumentations- + Pruefgrundlage).
// persistenz: 'spalte' (eigene mandate_profiles-Spalte) | 'extras' (profil_extras).
const LANDTAG_PROFILE_FIELDS = Object.freeze([
  { key: "bundesland", aliases: ["state"], label: "Bundesland", persistenz: "spalte", pflicht: true },
  { key: "parliament", aliases: ["parlament"], label: "Parlament", persistenz: "extras", pflicht: false, hinweis: "Explizit oder aus Ebene+Bundesland abgeleitet (Registry)." },
  { key: "wahlkreis", aliases: ["constituency"], label: "Wahlkreis", persistenz: "spalte", pflicht: false },
  { key: "partei", aliases: ["party"], label: "Partei", persistenz: "spalte", pflicht: true },
  { key: "fraktion", aliases: ["faction"], label: "Fraktion", persistenz: "spalte", pflicht: false },
  { key: "ausschuesse", aliases: ["committees", "committee", "stellvertretende_ausschuesse", "deputyCommittees"], label: "Ausschüsse", persistenz: "spalte", pflicht: false },
  { key: "speakerRoles", aliases: ["sprecherrollen"], label: "Sprecherrollen", persistenz: "extras", pflicht: false, hinweis: "z. B. 'Sprecherin für Bildungspolitik' (Fraktionszuschnitt)." },
  { key: "functions", aliases: ["funktionen", "function", "role", "governmentRole", "regierungsrolle"], label: "Funktionen", persistenz: "extras", pflicht: false, hinweis: "z. B. Fraktionsvorsitz, PGF, Ausschussvorsitz." },
  { key: "regionalTopics", aliases: ["regionale_themen", "regionalInterests", "regionale_interessen"], label: "Regionale Zuständigkeiten", persistenz: "spalte", pflicht: false },
  { key: "relevantMinistries", aliases: ["relevante_ministerien"], label: "Relevante Ministerien/Senatsverwaltungen", persistenz: "spalte", pflicht: false },
  { key: "relevantAuthorities", aliases: ["relevante_behoerden"], label: "Relevante Behörden", persistenz: "extras", pflicht: false },
  { key: "relevantMedia", aliases: ["relevante_medien", "localMedia"], label: "Relevante Medien", persistenz: "extras", pflicht: false }
]);

function readField(profile, field) {
  const keys = [field.key, ...(field.aliases || [])];
  for (const k of keys) {
    const v = profile ? profile[k] : undefined;
    if (Array.isArray(v) && v.some((x) => String(x || "").trim())) return v;
    if (!Array.isArray(v) && v != null && String(v).trim()) return v;
  }
  return undefined;
}

// Beratende Vollstaendigkeit fuer Landtagsprofile: baut auf validateProfile (Pflicht-
// achsen unveraendert) auf und weist zusaetzlich aus, welche ERWEITERTEN Landtag-
// Felder belegt/offen sind. Aendert KEIN Verarbeitungsverhalten (nur Anzeige/Doku).
function landtagProfilStatus(profile = {}) {
  const validation = validateProfile(profile);
  const parlament = resolveParlament(profile);
  const felder = LANDTAG_PROFILE_FIELDS.map((f) => {
    const wert = readField(profile, f);
    return { key: f.key, label: f.label, pflicht: f.pflicht, belegt: wert !== undefined, persistenz: f.persistenz };
  });
  const offenePflicht = felder.filter((f) => f.pflicht && !f.belegt).map((f) => f.key);
  const offeneOptional = felder.filter((f) => !f.pflicht && !f.belegt).map((f) => f.key);
  return {
    istLandtag: parlament.ebene === "land",
    parlament: readField(profile, LANDTAG_PROFILE_FIELDS[1]) || parlament.name,
    parlamentKey: parlament.key,
    validation,
    felder,
    offenePflicht,
    offeneOptional,
    vollstaendigErweitert: offenePflicht.length === 0 && offeneOptional.length === 0
  };
}

module.exports = { LANDTAG_PROFILE_FIELDS, landtagProfilStatus };
