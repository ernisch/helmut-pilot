"use strict";

// Tests fuer die zentrale Profilvalidierung (Phase 5).
// Prueft alle 5 Zustaende, die Pflichtfeld-Erkennung, die Funktionsauswirkung
// und dass das zentrale (klar kuenstliche) Fixture-Profil als "vollstaendig" gilt.

const { validateProfile, STATES } = require("../lib/helmut/profile-validation");
const { profileCompleteness } = require("../lib/helmut/config");
const { testPoliticianOne } = require("./fixtures/test-profiles");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// --- Vollstaendiges Profil (Bundestag) ---
const full = {
  id: "voll-mdb", fullName: "Voll Ständig", party: "SPD", parliamentType: "Bundestag",
  constituency: "Köln I", committees: ["Gesundheit"], focusTopics: ["Pflege"], profileActive: true
};
console.log("== Vollständig ==");
const rFull = validateProfile(full);
check("Zustand vollstaendig", rFull.state === STATES.COMPLETE);
check("ready=true", rFull.ready === true);
check("keine fehlenden Pflichtfelder", rFull.missingRequired.length === 0);
check("kann Briefing erhalten", rFull.impact.kannBriefingErhalten === true);
check("kann Radar", rFull.impact.kannRadar === true);
check("kann Lage personalisieren", rFull.impact.kannLagePersonalisieren === true);
check("kann Helmut empfehlen", rFull.impact.kannHelmutEmpfehlen === true);

// --- Teilweise vollstaendig (Identitaet da, aber Region + Ausschuss/Themen fehlen) ---
console.log("== Teilweise vollständig ==");
const partial = { id: "teil-mdb", fullName: "Teil Weise", party: "CDU", parliamentType: "Bundestag" };
const rPartial = validateProfile(partial);
check("Zustand teilweise", rPartial.state === STATES.PARTIAL);
check("ready=false", rPartial.ready === false);
check("usable=true (funktioniert eingeschränkt)", rPartial.usable === true);
check("Region fehlt gemeldet", rPartial.missingRequired.includes("region_oder_wahlkreis"));
check("Schwerpunkt/Ausschuss fehlt gemeldet", rPartial.missingRequired.includes("schwerpunkt_oder_ausschuss"));
check("kann Briefing (Partei-Dimension reicht)", rPartial.impact.kannBriefingErhalten === true);

// --- Nicht bereit (leer) ---
console.log("== Nicht bereit (leer) ==");
const empty = { id: "leer-mdb" };
const rEmpty = validateProfile(empty);
check("Zustand nicht_bereit", rEmpty.state === STATES.NOT_READY);
check("kann NICHTS", rEmpty.impact.kannBriefingErhalten === false && rEmpty.impact.kannLagePersonalisieren === false);
check("Name fehlt gemeldet", rEmpty.missingRequired.includes("name"));

// --- Fehlerhaft (ungültiges Budget) ---
console.log("== Fehlerhaft (Budget) ==");
const badBudget = { ...full, aiBudgetDailyCents: -5 };
const rBad = validateProfile(badBudget);
check("Zustand fehlerhaft", rBad.state === STATES.INVALID);
check("Budget-Problem gemeldet", rBad.budgetProblems.length === 1 && rBad.budgetProblems[0].field === "aiBudgetDailyCents");
check("nicht usable trotz sonst vollständig", rBad.usable === false);
const badBudget2 = { ...full, aiBudgetMonthlyCents: 0 };
check("Monatsbudget 0 -> fehlerhaft", validateProfile(badBudget2).state === STATES.INVALID);
const okBudget = { ...full, aiBudgetDailyCents: 150, aiBudgetMonthlyCents: 3000 };
check("gültiges Budget -> vollständig", validateProfile(okBudget).state === STATES.COMPLETE);
const noBudget = { ...full };
check("kein Budget gesetzt -> gültig (Systemdefault)", validateProfile(noBudget).state === STATES.COMPLETE);

// --- Deaktiviert ---
console.log("== Deaktiviert ==");
const disabled = { ...full, profileActive: false };
const rDis = validateProfile(disabled);
check("Zustand deaktiviert", rDis.state === STATES.DISABLED);
check("disabled=true", rDis.disabled === true);
check("kann NICHTS wenn deaktiviert", rDis.impact.kannBriefingErhalten === false && rDis.impact.kannRadar === false);
const softDeleted = { ...full, deletedAt: "2026-07-10T00:00:00Z" };
check("Soft-Delete -> deaktiviert", validateProfile(softDeleted).state === STATES.DISABLED);

// --- Landtag: Bundesland Pflicht ---
console.log("== Landtag ==");
const landtagOhneLand = { id: "ltg", fullName: "Land Tag", party: "Grüne", parliamentType: "Landtag", constituency: "WK 5", committees: ["Umwelt"] };
const rLtg = validateProfile(landtagOhneLand);
check("Landtag ohne Bundesland -> teilweise", rLtg.state === STATES.PARTIAL);
check("Bundesland fehlt gemeldet", rLtg.missingRequired.includes("bundesland"));
const landtagMitLand = { ...landtagOhneLand, state: "Bayern" };
check("Landtag mit Bundesland -> vollständig", validateProfile(landtagMitLand).state === STATES.COMPLETE);

// Fix 2: profileCompleteness (config) muss — wie validateProfile — state ODER bundesland
// akzeptieren. Sonst meldet es bei mandate_profiles-Profilen (Feld 'bundesland') faelschlich
// "state fehlt", obwohl das Bundesland gesetzt ist.
console.log("== Landtag: profileCompleteness akzeptiert bundesland ==");
const ltEbeneBundesland = { fullName: "L T", party: "Grüne", politische_ebene: "landtag", constituency: "WK 5", committees: ["Umwelt"], bundesland: "Sachsen" };
check("Landtag mit 'bundesland' (ohne 'state') -> profileCompleteness meldet NICHT state fehlt",
  !profileCompleteness(ltEbeneBundesland).missing.includes("state"));
check("Landtag mit 'bundesland' (ohne 'state') -> profileCompleteness complete=true",
  profileCompleteness(ltEbeneBundesland).complete === true);
const ltOhneBeides = { fullName: "L T", party: "Grüne", politische_ebene: "landtag", constituency: "WK 5", committees: ["Umwelt"] };
check("Landtag ohne state UND ohne bundesland -> profileCompleteness meldet state fehlt",
  profileCompleteness(ltOhneBeides).missing.includes("state"));
check("Bundestag -> profileCompleteness meldet nie state fehlt",
  !profileCompleteness({ fullName: "B T", party: "SPD", politische_ebene: "bundestag", constituency: "WK 1", committees: ["Gesundheit"] }).missing.includes("state"));

// --- Fraktionslos zählt als Partei-Angabe ---
console.log("== Fraktionslos ==");
const fraktionslos = { ...full, party: "Fraktionslos" };
check("Fraktionslos gilt als Partei-Angabe", !validateProfile(fraktionslos).missingRequired.includes("partei_oder_fraktionslos"));

// --- Zentrales Fixture-Profil (voll ausgefuellt, rein kuenstlich) ---
console.log("== Fixture-Profil (vollständig) ==");
const rFix = validateProfile({ ...testPoliticianOne });
check("Fixture-Profil ist vollständig", rFix.state === STATES.COMPLETE);
check("Fixture-Profil kann alles", rFix.impact.kannBriefingErhalten && rFix.impact.kannRadar && rFix.impact.kannLagePersonalisieren && rFix.impact.kannHelmutEmpfehlen);

console.log("");
const total = pass + fail;
if (fail === 0) { console.log(`${pass}/${total} Profilvalidierungs-Assertions erfolgreich.`); process.exit(0); }
console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
process.exit(1);
