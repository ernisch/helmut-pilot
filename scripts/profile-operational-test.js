"use strict";

// Offline-Test der ZENTRALEN Einsatzbereitschafts-Definition
// (profile-validation.isProfileOperational) — die EINE Stelle, die entscheidet,
// ob die normale App freigegeben wird oder die Erstkonfiguration greift.
// KEIN Netz, KEINE DB.

const { isProfileOperational, hasOperationalCore, operationalCoreMissing, validateProfile } = require("../lib/helmut/profile-validation");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

// Vollständiger Bundestags-Kern (ohne die optionalen Felder!) INKL. Datenschutz.
const btCore = {
  id: "mandat-a", fullName: "Katrin Vogt", role: "MdB", parliamentType: "Bundestag",
  party: "Die Linke", constituency: "Salzgitter-Wolfenbüttel", state: "Niedersachsen",
  privacyConfirmedAt: "2026-07-19T00:00:00Z"
};

// ── Kernfelder ──────────────────────────────────────────────────────────────
check("Kern vollständig (Bundestag)", hasOperationalCore(btCore));
check("optionale Felder fehlen -> Kern trotzdem vollständig (nicht blockierend)",
  hasOperationalCore(btCore) && operationalCoreMissing(btCore).length === 0);

check("Einzelner Name (kein Nachname) -> Kern unvollständig",
  !hasOperationalCore({ ...btCore, fullName: "Katrin" }) && operationalCoreMissing({ ...btCore, fullName: "Katrin" }).includes("name"));
check("Ohne Partei UND Fraktion -> Kern unvollständig",
  !hasOperationalCore({ ...btCore, party: "", faction: "" }));
check("Ohne Ebene -> Kern unvollständig",
  !hasOperationalCore({ ...btCore, parliamentType: "", politicalLevel: "" }));
check("Ohne Region/Wahlkreis -> Kern unvollständig",
  !hasOperationalCore({ ...btCore, constituency: "", state: "", location: "" }));
check("Ohne id/Mandatszuordnung -> Kern unvollständig",
  !hasOperationalCore({ ...btCore, id: "" }) && operationalCoreMissing({ ...btCore, id: "" }).includes("mandatszuordnung"));
check("Ohne Datenschutzbestätigung -> Kern unvollständig",
  !hasOperationalCore({ ...btCore, privacyConfirmedAt: "" }) && operationalCoreMissing({ ...btCore, privacyConfirmedAt: "" }).includes("datenschutz"));

// Landtag: Bundesland Pflicht.
const ltCore = { id: "mandat-l", fullName: "Lea Berg", role: "MdL", parliamentType: "Landtag", party: "Grüne", constituency: "Hannover-Mitte", privacyConfirmedAt: "2026-07-19T00:00:00Z" };
check("Landtag ohne Bundesland -> Kern unvollständig", !hasOperationalCore(ltCore) && operationalCoreMissing(ltCore).includes("bundesland"));
check("Landtag mit Bundesland -> Kern vollständig", hasOperationalCore({ ...ltCore, state: "Niedersachsen" }));

// ── isProfileOperational: Status-Logik ──────────────────────────────────────
check("Kern + Status 'abgeschlossen' -> einsatzbereit", isProfileOperational({ ...btCore, onboardingStatus: "abgeschlossen" }) === true);
check("Kern + Status 'neu' -> NICHT einsatzbereit (neuer Nutzer onboardet)", isProfileOperational({ ...btCore, onboardingStatus: "neu" }) === false);
check("Kern + Status 'in_bearbeitung' -> NICHT einsatzbereit (Ablauf läuft)", isProfileOperational({ ...btCore, onboardingStatus: "in_bearbeitung" }) === false);

// Altprofile OHNE onboardingStatus: nach den echten Kernfeldern bewerten.
check("Altprofil (kein Status) + Kern vollständig -> einsatzbereit (kein erneutes Onboarding)",
  isProfileOperational(btCore) === true);
check("Altprofil (kein Status) + Kern unvollständig -> NICHT einsatzbereit (gezielt ergänzen)",
  isProfileOperational({ ...btCore, constituency: "", state: "", location: "" }) === false);

// Optionale Felder blockieren nie.
check("Kern + abgeschlossen OHNE Ausschüsse/Themen -> einsatzbereit (optional ist nicht Pflicht)",
  isProfileOperational({ ...btCore, onboardingStatus: "abgeschlossen", committees: [], focusTopics: [] }) === true);

// Kein Kern -> nie einsatzbereit, egal welcher Status.
check("Leeres Profil + 'abgeschlossen' -> NICHT einsatzbereit (Kern fehlt)",
  isProfileOperational({ id: "x", onboardingStatus: "abgeschlossen" }) === false);

// ── validateProfile trägt das Urteil (für den Client) ───────────────────────
const v1 = validateProfile({ ...btCore, onboardingStatus: "abgeschlossen" });
check("validateProfile.operational === true bei einsatzbereitem Profil", v1.operational === true);
check("validateProfile.operationalMissing leer bei einsatzbereitem Profil", Array.isArray(v1.operationalMissing) && v1.operationalMissing.length === 0);
const v2 = validateProfile({ ...btCore, onboardingStatus: "neu" });
check("validateProfile.operational === false bei 'neu'", v2.operational === false);
const v3 = validateProfile({ id: "x", fullName: "Nur Vorname" });
check("validateProfile.operationalMissing benennt fehlende Kernfelder", v3.operational === false && v3.operationalMissing.includes("mandatsebene"));

// ── SICHERHEITS-NACHPRÜFUNG (Frage 1 & 2) ────────────────────────────────────
// Status 'abgeschlossen' ist NUR ein Zusatzkriterium, NIE ein Ersatz für die
// tatsächlichen Kernfelder — inkl. Datenschutzbestätigung.
const btNoPrivacy = { ...btCore, privacyConfirmedAt: "" };
check("F2.1 abgeschlossen + Datenschutz fehlt -> NICHT einsatzbereit",
  isProfileOperational({ ...btNoPrivacy, onboardingStatus: "abgeschlossen" }) === false);
check("F2.2 abgeschlossen + Partei fehlt -> NICHT einsatzbereit",
  isProfileOperational({ ...btCore, party: "", faction: "", onboardingStatus: "abgeschlossen" }) === false);
check("F2.3 abgeschlossen + politische Ebene fehlt -> NICHT einsatzbereit",
  isProfileOperational({ ...btCore, parliamentType: "", politicalLevel: "", onboardingStatus: "abgeschlossen" }) === false);
check("F2.4 abgeschlossen + ALLE Kernfelder (inkl. Datenschutz) -> einsatzbereit",
  isProfileOperational({ ...btCore, onboardingStatus: "abgeschlossen" }) === true);
check("F2.5 Altprofil ohne Status + alle Kernfelder + Datenschutz -> NICHT unnötig blockiert",
  isProfileOperational(btCore) === true);
// Zusatz: Status allein (leerer Kern) gibt NIE frei.
check("F2.x abgeschlossen bei leerem Kern -> NICHT einsatzbereit (Status ist kein Ersatz)",
  isProfileOperational({ id: "x", onboardingStatus: "abgeschlossen" }) === false);

console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Einsatzbereitschafts-Assertions`);
process.exit(fail > 0 ? 1 : 0);
