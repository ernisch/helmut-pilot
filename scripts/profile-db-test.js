"use strict";

// Profil-DB-Pfad-Tests (Mehrmandantenfaehigkeit Phase 3, docs/multitenancy-profilmodell.md).
// Prueft:
//  1) Flag AUS (Default) -> getProfile/saveProfile bytegleich zum bisherigen Blob-Verhalten,
//     KEIN DB-Aufruf.
//  2) toMandateProfileRow()/fromMandateProfileRow() sind ein verlustfreier Roundtrip fuer
//     alle Pflicht- und optionalen Felder (inkl. der neuen Phase-2-Spalten).
//  3) getProfile() mit Flag AN: SQL-Treffer hat Vorrang, SQL-Fehlschlag faellt auf den
//     Blob zurueck (kein Crash, kein Datenverlust).
//  4) saveProfile() mit Flag AN: Blob wird IMMER geschrieben (Fallback-Treue), der
//     DB-Schreibfehler darf saveProfile() nie zum Scheitern bringen.
//  5) Cem-Vorher/Nachher: cemInceProfile (Code) -> toMandateProfileRow() ->
//     fromMandateProfileRow() liefert alle matching-relevanten Felder unveraendert
//     zurueck (Partei/Ausschuss/Wahlkreis/Themen -- die vier Scoring-Dimensionen).
//
// Deterministisch/offline: alle DB-Aufrufe werden ueber deps.request/deps.upsert
// gefaelscht (kein Netzwerk).

const storage = require("../lib/helmut/storage");
const { cemInceProfile } = require("../lib/helmut/config");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); console.log(`      ^ Bedingung war falsch`); }
}

(async () => {
  console.log("== 1) Flag AUS (Default): profileDbModeEnabled() ==");
  delete process.env.HELMUT_PROFILE_DB_MODE;
  check("profileDbModeEnabled() === false ohne Flag", storage.profileDbModeEnabled() === false);
  check("getProfileFromDb() -> null ohne Flag (kein DB-Zugriff)", (await storage.getProfileFromDb("cem-ince")) === null);
  const saveSkipped = await storage.saveProfileToDb({ id: "cem-ince", fullName: "Cem Ince" });
  check("saveProfileToDb() -> skipped ohne Flag", saveSkipped && saveSkipped.skipped === true);

  console.log("== 2) toMandateProfileRow() / fromMandateProfileRow() Roundtrip ==");
  const fullProfile = {
    id: "test-mdb",
    fullName: "Test Abgeordnete",
    party: "SPD",
    faction: "SPD",
    function: "Bundestagsabgeordnete",
    role: "Bundestagsabgeordnete",
    parliamentType: "Bundestag",
    politicalLevel: "Bund",
    constituency: "Koeln I",
    state: "Nordrhein-Westfalen",
    committees: ["Gesundheit", "Digitales"],
    deputyCommittees: ["Finanzen"],
    reportingTopics: ["Pflege"],
    focusTopics: ["Pflege", "Digitalisierung"],
    regionalTopics: ["Koelner Stadtteile"],
    currentCampaigns: ["Pflegereform jetzt"],
    publicPositions: ["Pflege braucht mehr Personal."],
    keyAudiences: ["Pflegekraefte"],
    communicationStyle: "Sachlich",
    riskTopics: ["Pflegepersonalmangel"],
    opportunityTopics: ["Digitalisierung der Pflege"],
    noGoTopics: ["unbelegte Vorwuerfe"],
    preferredChannels: ["presse", "x"],
    upcomingAppointments: ["Ausschusssitzung | 2026-08-01T10:00:00+02:00"],
    nameVariants: ["Test-Abg."],
    governmentRole: "opposition",
    profileActive: true,
    onboardingStatus: "abgeschlossen",
    aiBudgetDailyCents: 150,
    aiBudgetMonthlyCents: 3000,
    privacyConfirmedAt: "2026-07-01T00:00:00Z"
  };
  const row = storage.toMandateProfileRow(fullProfile);
  check("Row: partei gesetzt", row.partei === "SPD");
  check("Row: politische_ebene = 'bundestag' (Enum, nicht 'Bund')", row.politische_ebene === "bundestag");
  check("Row: ausschuesse Array", Array.isArray(row.ausschuesse) && row.ausschuesse.length === 2);
  check("Row: aktiv boolean", row.aktiv === true);
  check("Row: onboarding_status", row.onboarding_status === "abgeschlossen");
  check("Row: ki_budget_taeglich_cent numerisch", row.ki_budget_taeglich_cent === 150);
  check("Row: KEINE unbekannte Spalte 'name'", row.name === undefined);
  check("Row: KEINE unbekannte Spalte 'buero_uebergabe'", row.buero_uebergabe === undefined);

  const back = storage.fromMandateProfileRow({ id: "test-mdb", name: "Test Abgeordnete" }, row);
  check("Roundtrip: party", back.party === "SPD");
  check("Roundtrip: committees", Array.isArray(back.committees) && back.committees.includes("Gesundheit") && back.committees.includes("Digitales"));
  check("Roundtrip: committee (erstes Element)", back.committee === "Gesundheit");
  check("Roundtrip: constituency", back.constituency === "Koeln I");
  check("Roundtrip: state", back.state === "Nordrhein-Westfalen");
  check("Roundtrip: focusTopics", Array.isArray(back.focusTopics) && back.focusTopics.length === 2);
  check("Roundtrip: parliamentType = 'Bundestag'", back.parliamentType === "Bundestag");
  check("Roundtrip: politicalLevel = 'Bund'", back.politicalLevel === "Bund");
  check("Roundtrip: aiBudgetDailyCents", back.aiBudgetDailyCents === 150);
  check("Roundtrip: onboardingStatus", back.onboardingStatus === "abgeschlossen");
  check("Roundtrip: governmentRole", back.governmentRole === "opposition");

  console.log("== 3) Landtag-Ableitung ==");
  const landtagRow = storage.toMandateProfileRow({ id: "x", parliamentType: "Landtag", state: "Bayern" });
  check("Landtag -> politische_ebene = 'landtag'", landtagRow.politische_ebene === "landtag");
  const landtagBack = storage.fromMandateProfileRow({ id: "x" }, landtagRow);
  check("Landtag Roundtrip -> parliamentType = 'Landtag'", landtagBack.parliamentType === "Landtag");

  console.log("== 4) Leeres Profil -> keine erfundenen Felder ==");
  const emptyBack = storage.fromMandateProfileRow({ id: "empty-profile" }, null);
  check("Leeres Profil: kein party-Feld (nicht '' oder null)", emptyBack.party === undefined);
  check("Leeres Profil: kein committees-Feld (nicht [])", emptyBack.committees === undefined);
  check("Leeres Profil: id bleibt erhalten", emptyBack.id === "empty-profile");
  check("Leeres Profil: profileActive default true (aktiv, bis explizit deaktiviert)", emptyBack.profileActive === true);

  console.log("== 5) Soft-Delete wird wie 'nicht vorhanden' behandelt ==");
  process.env.HELMUT_PROFILE_DB_MODE = "1";
  process.env.HELMUT_V3_STORE = "1";
  process.env.SUPABASE_URL = "https://example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key-for-test";
  check("profileDbModeEnabled() === true mit Flag+Store", storage.profileDbModeEnabled() === true);
  const deletedRequest = async () => [{ id: "deleted-mdb", name: "Geloescht", mandate_profiles: [{ user_id: "deleted-mdb", geloescht_at: "2026-07-10T00:00:00Z" }] }];
  const deletedResult = await storage.getProfileFromDb("deleted-mdb", { request: deletedRequest });
  check("Soft-geloeschtes Profil -> null (wie nicht vorhanden)", deletedResult === null);

  console.log("== 6) getProfile(): SQL-Treffer hat Vorrang vor Blob ==");
  const fakeSqlRequest = async (endpoint) => {
    check("Endpoint traegt id=eq.<userId>", endpoint.includes("id=eq.cem-ince"));
    check("Endpoint nutzt PostgREST-Embed fuer mandate_profiles", endpoint.includes("mandate_profiles(*)"));
    return [{
      id: "cem-ince",
      name: "Cem Ince (aus DB)",
      mandate_profiles: [{ user_id: "cem-ince", partei: "Die Linke", politische_ebene: "bundestag" }]
    }];
  };
  const dbFirst = await storage.getProfile("cem-ince", { request: fakeSqlRequest });
  check("getProfile() liefert DB-Wert (fullName aus DB)", dbFirst && dbFirst.fullName === "Cem Ince (aus DB)");
  check("getProfile() liefert DB-Partei", dbFirst && dbFirst.party === "Die Linke");

  console.log("== 7) getProfile(): DB-Fehler -> Fallback auf Blob (KEIN Crash, KEIN Datenverlust) ==");
  const failingRequest = async () => { throw new Error("simulierter Netzwerkfehler"); };
  let fellBack = false;
  try {
    const result = await storage.getProfile("nicht-im-blob-und-db-kaputt", { request: failingRequest });
    fellBack = result === null; // Blob hat auch nichts -> null, aber KEIN throw
  } catch (_) { fellBack = false; }
  check("DB-Fehler wirft NICHT, faellt sicher zurueck", fellBack === true);

  console.log("== 8) saveProfile(): DB-Fehler darf Blob-Schreiben nie verhindern ==");
  const failingUpsert = async () => { throw new Error("simulierter Schreibfehler"); };
  let saveThrew = false;
  let saved = null;
  try {
    saved = await storage.saveProfile({ id: "resilient-test", fullName: "Resilient" }, { upsert: failingUpsert });
  } catch (_) { saveThrew = true; }
  check("saveProfile() wirft NICHT, obwohl DB-Write scheitert", saveThrew === false);
  check("saveProfile() liefert trotzdem das gespeicherte Profil zurueck", saved && saved.id === "resilient-test");

  console.log("== 9) Cem-Vorher/Nachher: cemInceProfile ueberlebt Roundtrip vollstaendig ==");
  const cemRow = storage.toMandateProfileRow(cemInceProfile);
  const cemBack = storage.fromMandateProfileRow({ id: cemInceProfile.id, name: cemInceProfile.fullName }, cemRow);
  check("Cem: party unveraendert", cemBack.party === cemInceProfile.party);
  check("Cem: faction unveraendert", cemBack.faction === cemInceProfile.faction);
  check("Cem: committees unveraendert (Ausschuss-Dimension, 34 Punkte)", JSON.stringify(cemBack.committees) === JSON.stringify(cemInceProfile.committees));
  check("Cem: constituency unveraendert (Wahlkreis-Dimension, 20 Punkte)", cemBack.constituency === cemInceProfile.constituency);
  check("Cem: focusTopics vollstaendig (16 Themen, Themen-Dimension)", Array.isArray(cemBack.focusTopics) && cemBack.focusTopics.length === cemInceProfile.focusTopics.length);
  check("Cem: politicalLevel abgeleitet aus 'Bund' -> 'bundestag' -> 'Bund'", cemBack.politicalLevel === "Bund");
  check("Cem: alle 16 focusTopics identisch (kein Verlust, keine Erfindung)",
    cemInceProfile.focusTopics.every((t) => cemBack.focusTopics.includes(t)) && cemBack.focusTopics.every((t) => cemInceProfile.focusTopics.includes(t)));

  delete process.env.HELMUT_PROFILE_DB_MODE;
  delete process.env.HELMUT_V3_STORE;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Profil-DB-Pfad-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
