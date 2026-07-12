"use strict";

// Tests fuer die Admin-Profilbearbeitung (Mehrmandantenfaehigkeit Phase 4):
// normalizeProfile uebernimmt die neuen strukturierten Felder korrekt, validiert
// sie und loescht beim Bearbeiten nie ungewollt Bestandsfelder.
// Offline: kein Supabase-Env -> activeProfile faellt auf neutrale Defaults/blankProfile.

delete process.env.HELMUT_AUTH_MODE; // Pilotmodus -> cem-ince = Demo-Basis verfuegbar
const server = require("../server");
const normalizeProfile = server.__normalizeProfile;
const { validateProfile } = require("../lib/helmut/profile-validation");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

(async () => {
  console.log("== Neue Felder werden uebernommen ==");
  const p = await normalizeProfile({
    fullName: "Neu Angelegt",
    party: "SPD",
    parliamentType: "Landtag",
    state: "Nordrhein-Westfalen",
    constituency: "Köln I",
    committee: "Gesundheit",
    profileActive: false,
    aiBudgetDailyCents: 200,
    aiBudgetMonthlyCents: 4000,
    governmentRole: "opposition",
    onboardingStatus: "in_bearbeitung",
    nameVariants: ["N. Angelegt"],
    regionalTopics: ["Kölner Kliniken"]
  }, "neu-angelegt");

  check("profileActive=false uebernommen", p.profileActive === false);
  check("aiBudgetDailyCents=200", p.aiBudgetDailyCents === 200);
  check("aiBudgetMonthlyCents=4000", p.aiBudgetMonthlyCents === 4000);
  check("governmentRole=opposition", p.governmentRole === "opposition");
  check("onboardingStatus=in_bearbeitung", p.onboardingStatus === "in_bearbeitung");
  check("nameVariants uebernommen", Array.isArray(p.nameVariants) && p.nameVariants.includes("N. Angelegt"));
  check("regionalTopics uebernommen", Array.isArray(p.regionalTopics) && p.regionalTopics.includes("Kölner Kliniken"));

  console.log("== Enum-Guards: ungueltige Werte -> Default/Basis ==");
  const bad = await normalizeProfile({ fullName: "X", governmentRole: "quatsch", onboardingStatus: "quatsch" }, "enum-test");
  check("ungueltige governmentRole -> null (nicht 'quatsch')", bad.governmentRole !== "quatsch");
  check("ungueltiger onboardingStatus -> 'neu'", bad.onboardingStatus === "neu");

  console.log("== KI-Budget: 0 = zuruecksetzen, leer = null, ungueltig durchgereicht ==");
  const b0 = await normalizeProfile({ fullName: "X", aiBudgetDailyCents: 0 }, "budget0");
  check("Budget 0 -> null (Systemdefault)", b0.aiBudgetDailyCents === null);
  const bNeg = await normalizeProfile({ fullName: "X", aiBudgetDailyCents: -5 }, "budgetneg");
  check("Budget -5 unveraendert durchgereicht (Validierung meldet fehlerhaft)", bNeg.aiBudgetDailyCents === -5);
  check("-> validateProfile meldet fehlerhaft", validateProfile(bNeg).state === "fehlerhaft");

  console.log("== profileActive default: fehlt -> aktiv (true) ==");
  const noActive = await normalizeProfile({ fullName: "X", party: "CDU" }, "default-active");
  check("profileActive default true", noActive.profileActive === true);

  console.log("== Bearbeiten loescht keine Bestandsfelder (partielles Update) ==");
  // Erst ein reiches Profil, dann nur EIN Feld aendern -> Rest bleibt.
  const rich = await normalizeProfile({ fullName: "Reich", party: "Die Linke", committee: "Arbeit und Soziales", focusTopics: ["Rente", "Pflege"], aiBudgetDailyCents: 150 }, "rich-mdb");
  check("Reich: focusTopics gesetzt", Array.isArray(rich.focusTopics) && rich.focusTopics.length === 2);
  check("Reich: Budget gesetzt", rich.aiBudgetDailyCents === 150);

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Admin-Profilfelder-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
