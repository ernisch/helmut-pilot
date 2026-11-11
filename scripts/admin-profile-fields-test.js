"use strict";

// Tests fuer die Admin-Profilbearbeitung (Mehrmandantenfaehigkeit Phase 4):
// normalizeProfile uebernimmt die neuen strukturierten Felder korrekt, validiert
// sie und loescht beim Bearbeiten nie ungewollt Bestandsfelder.
// Offline: neutrale Defaults plus echte Profil-PATCH/GET-Route im lokalen Store.
// Synthetische Profile, echter Login/CSRF, keine externen Requests oder KI.

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORE_CACHE_MS = "0";
const dataDir = path.join(__dirname, "..", ".helmut-data");
const snapshots = new Map(fs.existsSync(dataDir)
  ? fs.readdirSync(dataDir).map(file => [file, fs.readFileSync(path.join(dataDir, file))]) : []);
function restoreStore() {
  if (!fs.existsSync(dataDir)) return;
  for (const file of fs.readdirSync(dataDir)) if (!snapshots.has(file)) fs.unlinkSync(path.join(dataDir, file));
  for (const [file, content] of snapshots) fs.writeFileSync(path.join(dataDir, file), content);
}
process.on("exit", restoreStore);
const server = require("../server");
const normalizeProfile = server.__normalizeProfile;
const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");
const { validateProfile } = require("../lib/helmut/profile-validation");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}
function equal(name, actual, expected) {
  try { assert.deepEqual(actual, expected); check(name, true); }
  catch (error) { check(name, false); console.log(error.message); }
}

async function routeChecks() {
  const id = "profile-patch-synthetic";
  const rich = await normalizeProfile({
    fullName: "Fiktives Profil Speicherprobe", party: "SPD", faction: "SPD",
    parliamentType: "Bundestag", politische_ebene: "bundestag", politicalLevel: "Bund",
    function: "Bundestagsabgeordneter", role: "Eigenständige Rollenangabe",
    committee: "Gesundheit", committees: ["Gesundheit", "Bildung"],
    focusTopics: ["Pflege", "Bildung"], topicPriorities: { Pflege: 5, Bildung: 1 },
    state: "Berlin", constituency: "Testwahlkreis", location: "Berlin",
    mainQuestion: "Was hilft vor Ort?", officeFormats: ["presse"], preferredChannels: ["social"],
    currentCampaigns: ["Historische Testkampagne"], opponents: ["Historischer Testakteur"],
    upcomingAppointments: ["Vergangener Testtermin | 2000-01-01", "Späterer Testtermin | 2030-01-01"],
    noGoTopics: ["Unbelegte Behauptungen"], publicPositions: ["Testposition"],
    keyAudiences: ["Testzielgruppe"], aiBudgetDailyCents: 150,
    profileActive: false, customFutureField: "Erhaltener Zusatzwert"
  }, id);
  await storage.saveProfile(rich);
  const password = "Synthetic-Profile-Patch-123!";
  await accounts.createUser({ email: "patch@profile.invalid", name: "Fiktives Testkonto",
    role: "abgeordneter", politicianId: id, password });
  const api = http.createServer(server);
  await new Promise((resolve, reject) => { api.once("error", reject); api.listen(0, "127.0.0.1", resolve); });
  const port = api.address().port;
  let cookie = "", csrf = "";
  async function request(route, method = "GET", body) {
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port, path: route, method,
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) } }, res => {
        let text = ""; res.setEncoding("utf8"); res.on("data", part => text += part);
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(text), headers: res.headers }); }
          catch (error) { reject(error); }
        });
      });
      req.setTimeout(10000, () => req.destroy(new Error("Lokales HTTP-Zeitlimit")));
      req.on("error", reject); req.end(payload);
    });
  }
  const route = `/api/profile/current?politicianId=${id}`;
  async function patch(body) {
    const saved = await request(route, "PATCH", body);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const read = await request(route);
    assert.equal(read.status, 200);
    for (const [key, value] of Object.entries(saved.body)) {
      if (key !== "profilValidierung") assert.deepEqual(read.body[key], value, `GET/PATCH ${key}`);
    }
    return read.body;
  }
  try {
    const login = await request("/api/auth/login", "POST", { email: "patch@profile.invalid", password });
    assert.equal(login.status, 200);
    cookie = login.headers["set-cookie"][0].split(";")[0];
    csrf = (await request("/api/security/csrf")).body.token;
    const before = (await request(route)).body;
    let after = await patch({ communicationStyle: "Vermittelnd" });
    const stableFields = ["committees", "committee", "focusTopics", "topicPriorities", "mainQuestion", "role",
      "preferredChannels", "currentCampaigns", "opponents", "upcomingAppointments", "noGoTopics", "publicPositions",
      "keyAudiences", "aiBudgetDailyCents", "profileActive", "customFutureField", "parliamentType", "politicalLevel", "politische_ebene"];
    equal("Stil-PATCH erhaelt alle nicht gesendeten Felder", Object.fromEntries(stableFields.map(k => [k, after[k]])),
      Object.fromEntries(stableFields.map(k => [k, before[k]])));
    equal("Ausgeblendete Alt-Termine bleiben inklusive Vergangenheit erhalten", after.upcomingAppointments, rich.upcomingAppointments);
    equal("Stil-PATCH leitet Kanaele nicht erneut aus Alt-Formaten ab", after.preferredChannels, ["social"]);
    after = await patch({ committee: "Alter Primaerwert", committees: ["Wirtschaft", "Verkehr", "Wirtschaft"] });
    equal("Mehrere Ausschuesse bleiben erhalten und gewinnen vor altem Einzelfeld", [after.committee, after.committees], ["Wirtschaft", ["Wirtschaft", "Verkehr"]]);
    after = await patch({ committee: "Wirtschaft", committees: [] });
    equal("Leere Ausschussauswahl leert auch Primaerausschuss", [after.committee, after.committees, after.committeeUnknown], ["", [], true]);
    after = await patch({ fullName: "Fiktives Profil umbenannt" });
    equal("Leere Ausschuesse bleiben nach anderem PATCH und GET leer", [after.committee, after.committees], ["", []]);
    after = await patch({ committee: "Gesundheit" });
    equal("Legacy-Einzelfeld setzt konsistente Auswahl", [after.committee, after.committees, after.committeeUnknown], ["Gesundheit", ["Gesundheit"], false]);
    after = await patch({ committee: "" });
    equal("Legacy-Einzelfeld kann Ausschuss loeschen", [after.committee, after.committees], ["", []]);
    after = await patch({ mainQuestion: "" });
    equal("Explizit leere Leitfrage bleibt auch nach erneutem Lesen leer", after.mainQuestion, "");
    after = await patch({ topicPriorities: { Wohnen: 1, Arbeit: 3 } });
    equal("Prioritaeten-only ersetzt Altmap und aktiviert auch Normal1", [after.focusTopics, after.topicPriorities], [["Wohnen", "Arbeit"], { Wohnen: 1, Arbeit: 3 }]);
    after = await patch({ focusTopics: ["Arbeit", "Pflege"] });
    equal("Themen-only behaelt bestehendes Gewicht und setzt neue auf Normal1", [after.focusTopics, after.topicPriorities], [["Arbeit", "Pflege"], { Arbeit: 3, Pflege: 1 }]);
    after = await patch({ focusTopics: ["Pflege", "Arbeit"], topicPriorities: { Pflege: 5, Arbeit: 1, Altlast: 4 } });
    equal("Konsistente Auswahl entfernt verborgene Altthemen", [after.focusTopics, after.topicPriorities], [["Pflege", "Arbeit"], { Pflege: 5, Arbeit: 1 }]);
    after = await patch({ parliamentType: "Landtag" });
    equal("Landtag synchronisiert Ebene und neutrale Mandatsbezeichnung", [after.parliamentType, after.politicalLevel, after.politische_ebene, after.function, after.role],
      ["Landtag", "Land", "landtag", "Landtagsabgeordneter", "Eigenständige Rollenangabe"]);
    equal("Mandatswechsel aendert keine Themen", [after.focusTopics, after.topicPriorities], [["Pflege", "Arbeit"], { Pflege: 5, Arbeit: 1 }]);
    after = await patch({ state: "", constituency: "", location: "", regionalInterests: [] });
    equal("Bewusste regionale Neuauswahl leert alte Zuordnung dauerhaft", [after.state, after.constituency, after.location, after.regionalInterests], ["", "", "", []]);
    after = await patch({ state: "Brandenburg", constituency: "Neuer Testwahlkreis", location: "Neuer Testort", regionalInterests: ["Brandenburg", "Neuer Testwahlkreis", "Neuer Testort"] });
    after = await patch({ communicationStyle: "Sachlich" });
    equal("Stil-PATCH erhaelt neu gesetzte Regionalfelder", [after.state, after.constituency, after.location, after.regionalInterests],
      ["Brandenburg", "Neuer Testwahlkreis", "Neuer Testort", ["Brandenburg", "Neuer Testwahlkreis", "Neuer Testort"]]);
    const conflict = await request(route, "PATCH", { parliamentType: "Bundestag", politische_ebene: "landtag" });
    equal("Widerspruechliche explizite Ebenen werden abgewiesen", conflict.status, 400);
    equal("Abgewiesener Ebenenwechsel aendert gespeichertes Mandat nicht", (await request(route)).body.parliamentType, "Landtag");
    const roleConflict = await request(route, "PATCH", { parliamentType: "Landtag", function: "Bundestagsabgeordneter" });
    equal("Widerspruechliche Funktion und Ebene werden abgewiesen", roleConflict.status, 400);
    after = await patch({ topicPriorities: {} });
    equal("Leere Gewichtsmap leert Auswahl dauerhaft", [after.focusTopics, after.topicPriorities], [[], {}]);
    after = await patch({ focusTopics: ["Pflege"], topicPriorities: { Pflege: 5 } });
    after = await patch({ focusTopics: [] });
    equal("Leere Themenliste entfernt alte Gewichte dauerhaft", [after.focusTopics, after.topicPriorities], [[], {}]);
    equal("Ausgeblendete Altdaten ueberleben die gesamte Bearbeitung", [after.currentCampaigns, after.opponents, after.upcomingAppointments],
      [rich.currentCampaigns, rich.opponents, rich.upcomingAppointments]);
  } finally {
    api.closeAllConnections();
    await new Promise(resolve => api.close(resolve));
  }
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

  console.log("== Echte Profilroute: partielle Aenderung, Leeren und erneutes Lesen ==");
  await routeChecks();

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Admin-Profilfelder-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})().catch(error => { console.error(error); process.exitCode = 1; });
