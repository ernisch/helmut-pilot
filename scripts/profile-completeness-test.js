"use strict";

// Profil-Vollstaendigkeitstest (Phase 15 Nachtrag).
// Beweist, dass der DB-Pfad (toMandateProfileRow -> fromMandateProfileRow) JEDES
// Profilfeld verlustfrei abbildet — inkl. der zuvor fehlenden Felder
// (regionalInterests, relevantMinistries, topicPriorities, opponents,
// monitoringTargets) UND aller uebrigen Blob-Felder via profil_extras
// (localMedia, mainQuestion, officeFormats, outputNeeds, location, ...).
// Getestet gegen das zentrale (klar kuenstliche) Fixture-Profil + mehrere Testprofile.

const storage = require("../lib/helmut/storage");
const { testPoliticianOne } = require("./fixtures/test-profiles");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Vollstaendiges, rein kuenstliches Profil: zentrale Fixture + die Zusatzfelder,
// die den profil_extras-Pfad abdecken (officeFormats, onboardedAt).
const FULL = {
  ...testPoliticianOne,
  officeFormats: ["pressemitteilung", "social", "rede"],
  onboardedAt: "2026-06-01T00:00:00Z"
};

// Simuliert die DB-Runde OHNE Netz: die Zeile ist genau das, was gespeichert und
// zurueckgelesen wird (Arrays/JSONB bleiben unveraendert). PostgREST/PG geben die
// Werte verbatim zurueck -> der reine JS-Roundtrip ist die faithful Simulation.
function roundtrip(profile) {
  const row = storage.toMandateProfileRow(profile);
  // Die DB traegt user_id + updated_at; profiles traegt id/name.
  const mandateRow = { user_id: profile.id, updated_at: "2026-07-12T00:00:00Z", ...row };
  return storage.fromMandateProfileRow({ id: profile.id, name: profile.fullName }, mandateRow);
}

console.log("== 1) Fixture: JEDES Feld überlebt den DB-Roundtrip ==");
const back = roundtrip(FULL);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fields = [
  "party", "faction", "function", "role", "constituency", "state", "committee",
  "committees", "focusTopics", "reportingTopics", "currentCampaigns",
  "publicPositions", "keyAudiences", "communicationStyle", "riskTopics",
  "opportunityTopics", "noGoTopics", "preferredChannels", "upcomingAppointments",
  // die zuvor FEHLENDEN Felder:
  "regionalInterests", "relevantMinistries", "opponents", "monitoringTargets",
  "topicPriorities", "officeHandoffMethod",
  // die profil_extras-Felder:
  "localMedia", "mainQuestion", "outputNeeds", "officeFormats", "location", "onboardedAt", "committeeUnknown"
];
for (const f of fields) {
  check(`Fixture.${f} identisch`, eq(back[f], FULL[f]), `db=${JSON.stringify(back[f])} blob=${JSON.stringify(FULL[f])}`);
}
check("Fixture.politicalLevel = 'Bund' (aus bundestag rekonstruiert)", back.politicalLevel === "Bund");

console.log("== 2) Kein Blob-Feld geht verloren (Schlüssel-Vollständigkeit) ==");
const verloren = Object.keys(FULL).filter((k) => {
  if (["id", "fullName", "updatedAt", "parliamentType"].includes(k)) return false; // separat/abgeleitet
  return !(k in back) || back[k] === undefined;
});
check("keine verlorenen Felder", verloren.length === 0, `verloren: ${verloren.join(", ")}`);

console.log("== 3) profil_extras enthält NUR die spaltenlosen Felder ==");
const row = storage.toMandateProfileRow(FULL);
const extrasKeys = Object.keys(row.profil_extras).sort();
check("profil_extras enthält localMedia/mainQuestion/outputNeeds/officeFormats/location/committeeUnknown/onboardedAt",
  ["committeeUnknown", "localMedia", "location", "mainQuestion", "officeFormats", "onboardedAt", "outputNeeds"].every((k) => extrasKeys.includes(k)), extrasKeys.join(","));
check("profil_extras enthält KEIN Feld mit eigener Spalte (z.B. party/focusTopics/regionalInterests)",
  !["party", "focusTopics", "regionalInterests", "relevantMinistries", "opponents", "topicPriorities"].some((k) => extrasKeys.includes(k)), extrasKeys.join(","));

console.log("== 4) Mehrere Testprofile: verlustfrei + korrekt ==");
const T_SPD = { id: "t-spd", fullName: "T SPD", party: "SPD", parliamentType: "Landtag", state: "Bayern", constituency: "München", committees: ["Gesundheit"], focusTopics: ["Pflege"], relevantMinistries: ["StMGP"], opponents: ["CSU"], monitoringTargets: ["Landesregierung"], regionalInterests: ["München"], topicPriorities: { Pflege: 5 }, officeHandoffMethod: "email", customFutureField: "beliebig" };
const spdBack = roundtrip(T_SPD);
check("T-SPD Landtag -> parliamentType Landtag", spdBack.parliamentType === "Landtag");
check("T-SPD relevantMinistries erhalten", eq(spdBack.relevantMinistries, ["StMGP"]));
check("T-SPD topicPriorities erhalten", eq(spdBack.topicPriorities, { Pflege: 5 }));
check("T-SPD officeHandoffMethod=email erhalten", spdBack.officeHandoffMethod === "email");
check("T-SPD unbekanntes Zukunftsfeld via extras erhalten", spdBack.customFutureField === "beliebig");

console.log("== 5) Leeres Profil: keine erfundenen Felder, keine leeren Arrays ==");
const leer = roundtrip({ id: "t-leer" });
check("leer: kein party", leer.party === undefined);
check("leer: kein regionalInterests (nicht [])", leer.regionalInterests === undefined);
check("leer: kein topicPriorities (nicht {})", leer.topicPriorities === undefined);
check("leer: kein officeHandoffMethod", leer.officeHandoffMethod === undefined);
check("leer: id bleibt", leer.id === "t-leer");

console.log("");
const total = pass + fail;
if (fail === 0) { console.log(`${pass}/${total} Profil-Vollständigkeits-Assertions erfolgreich.`); process.exit(0); }
console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
process.exit(1);
