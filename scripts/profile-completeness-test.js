"use strict";

// Profil-Vollstaendigkeitstest (Phase 15 Nachtrag).
// Beweist, dass der DB-Pfad (toMandateProfileRow -> fromMandateProfileRow) JEDES
// Profilfeld verlustfrei abbildet — inkl. der zuvor fehlenden Felder
// (regionalInterests, relevantMinistries, topicPriorities, opponents,
// monitoringTargets) UND aller uebrigen Blob-Felder via profil_extras
// (localMedia, mainQuestion, officeFormats, outputNeeds, location, ...).
// Getestet gegen Cems reales Profil + mehrere Testprofile.

const storage = require("../lib/helmut/storage");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Cems vollstaendiges Profil, exakt wie im Production-Blob (aus dem Live-Dump).
const CEM = {
  id: "cem-ince",
  fullName: "Cem Ince",
  party: "Die Linke",
  faction: "Die Linke",
  function: "Bundestagsabgeordneter",
  role: "Bundestagsabgeordneter",
  politicalLevel: "Bund",
  constituency: "Salzgitter-Wolfenbüttel",
  state: "Niedersachsen",
  location: "Salzgitter",
  committee: "Arbeit und Soziales",
  committees: ["Arbeit und Soziales"],
  committeeUnknown: false,
  focusTopics: ["Arbeit", "Soziales", "Bürgergeld", "Mindestlohn", "Pflege", "Familie", "Rente", "Gesundheit", "Tarifbindung", "Arbeitsmarkt", "Sozialstaat", "Armut", "Gewerkschaften", "Tariftreue", "Arbeitszeit", "Industriearbeitsplätze", "Pflegeversicherung", "Bundesregierung Vorhaben im Bereich Arbeit und Soziales"],
  topicPriorities: { Arbeit: 5, Soziales: 5, Bürgergeld: 5, Mindestlohn: 5, Pflege: 4, Rente: 5 },
  mainQuestion: "Welche Pläne hat die Bundesregierung im Bereich Arbeit und Soziales?",
  monitoringTargets: ["Meine Partei", "Meine Person", "Mein Fachausschuss", "Bundesregierung Vorhaben", "Arbeit und Soziales"],
  outputNeeds: ["Was ist heute wichtig?", "Was kann ignoriert werden?", "Worauf sollte ich reagieren?", "Welche Chance entsteht?", "Welches Risiko entsteht?", "Welche Formulierung kann ich nutzen?"],
  regionalInterests: ["Niedersachsen", "Salzgitter-Wolfenbüttel", "Salzgitter", "Wolfenbüttel", "lokale Beschäftigung", "Industriearbeitsplätze", "VW-Beschäftigte", "Betriebsräte", "Stahlindustrie", "Pflegeversorgung", "Armutsbekämpfung", "Tarifbindung vor Ort"],
  relevantMinistries: ["BMAS", "BMG", "BMF", "Bundesregierung"],
  opponents: ["CDU/CSU", "SPD-Regierungslinie", "FDP", "AfD"],
  localMedia: ["Salzgitter Zeitung", "Braunschweiger Zeitung", "Wolfsburger Nachrichten", "NDR Niedersachsen", "Hannoversche Allgemeine", "taz", "nd"],
  communicationStyle: "Lösungsorientiert",
  riskTopics: ["Bürgergeld-Sanktionsframe", "Angriffe auf soziale Sicherung", "fehlende Tarifkontrollen", "Renten- und Sozialstaatsdebatten ohne linke Linie", "Angriffe auf Erwerbslose", "zu späte Reaktion auf BMAS-Vorhaben"],
  opportunityTopics: ["Tariftreue", "Mindestlohn", "gute Arbeit", "Pflegearbeitsbedingungen", "BMAS Vorhaben früh einordnen", "Rente für niedrige Einkommen"],
  noGoTopics: ["unbelegte persönliche Angriffe", "verkürzte Kulturkampf-Frames", "unklare Forderungen ohne Handlungsvorschlag"],
  preferredChannels: ["presse", "linkedin", "x", "ausschuss", "buergerdialog"],
  officeHandoffMethod: "share",
  officeFormats: ["pressemitteilung", "social", "rede"],
  reportingTopics: ["Arbeit", "Soziales", "Bürgergeld", "Mindestlohn", "Rente", "Pflege", "Tariftreue", "Arbeitszeit"],
  currentCampaigns: ["Gute Arbeit", "Armutsfester Sozialstaat", "Tarifbindung stärken", "Gute Arbeit und Tarifbindung", "Mindestlohn und Respekt für Beschäftigte", "Pflege sozial absichern"],
  publicPositions: ["Gute Arbeit braucht Tarifbindung und Kontrolle.", "Soziale Sicherung darf Menschen nicht unter Generalverdacht stellen.", "Pflege braucht verlässliche Arbeitsbedingungen."],
  keyAudiences: ["Beschäftigte", "Gewerkschaften", "Sozialverbände", "Pflegekräfte", "Menschen mit niedrigen Einkommen"],
  upcomingAppointments: ["Gespräch mit Sozialverband | 2026-06-30T14:00:00+02:00", "Wahlkreiszeit Salzgitter | 2026-07-01T10:00:00+02:00"],
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

console.log("== 1) Cem: JEDES Feld überlebt den DB-Roundtrip ==");
const back = roundtrip(CEM);
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
  check(`Cem.${f} identisch`, eq(back[f], CEM[f]), `db=${JSON.stringify(back[f])} blob=${JSON.stringify(CEM[f])}`);
}
check("Cem.politicalLevel = 'Bund' (aus bundestag rekonstruiert)", back.politicalLevel === "Bund");

console.log("== 2) Kein Blob-Feld geht verloren (Schlüssel-Vollständigkeit) ==");
const verloren = Object.keys(CEM).filter((k) => {
  if (["id", "fullName", "updatedAt", "parliamentType"].includes(k)) return false; // separat/abgeleitet
  return !(k in back) || back[k] === undefined;
});
check("keine verlorenen Felder", verloren.length === 0, `verloren: ${verloren.join(", ")}`);

console.log("== 3) profil_extras enthält NUR die spaltenlosen Felder ==");
const row = storage.toMandateProfileRow(CEM);
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
