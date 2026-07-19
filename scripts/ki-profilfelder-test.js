"use strict";

// KI-Profilfelder-Test (Umsetzungsnotiz §7/§8/§9, P1+P2):
//  - publicProfile traegt die 5 neuen Felder (publicPositions, keyAudiences,
//    riskTopics, opportunityTopics, governmentRole), gekappt, leere weggelassen
//  - Rollen-Framing aus governmentRole: ein Regierungsmandat erzeugt KEINE
//    Oppositionssprache (Abnahmekriterium §7)
//  - Guardrail-Regelsaetze nur bei belegten Feldern
//  - normalizeProfile leitet preferredChannels aus officeFormats ab (§8) und
//    uebernimmt opponents ("Zu beobachtende Akteure")
//  - scoring.channelFactor matcht die abgeleiteten Kanalnamen
//  - Client-/Server-Quelltext: UI-Verdrahtung vorhanden, tote Elemente entfernt
// Offline: kein Netz, keine KI, kein Supabase.

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

delete process.env.HELMUT_AUTH_MODE; // wie admin-profile-fields-test: Legacy-Pfad reicht
process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;

const ai = require("../lib/helmut/ai");
const scoring = require("../lib/helmut/scoring");
const server = require("../server");
const normalizeProfile = server.__normalizeProfile;

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

(async () => {
  console.log("== §7 publicProfile: die 5 Felder erreichen das Modell ==");
  const vollProfil = {
    fullName: "Testa Mandat",
    party: "SPD",
    governmentRole: "regierung",
    publicPositions: ["Für den Ausbau der Bahn"],
    keyAudiences: ["Pendlerinnen und Pendler"],
    riskTopics: ["Flughafenlärm"],
    opportunityTopics: ["Strukturwandel-Fonds"],
    noGoTopics: ["Privates"]
  };
  const pub = ai.publicProfile(vollProfil);
  check("publicPositions im Snapshot", Array.isArray(pub.publicPositions) && pub.publicPositions[0] === "Für den Ausbau der Bahn");
  check("keyAudiences im Snapshot", Array.isArray(pub.keyAudiences) && pub.keyAudiences.length === 1);
  check("riskTopics im Snapshot", Array.isArray(pub.riskTopics) && pub.riskTopics.length === 1);
  check("opportunityTopics im Snapshot", Array.isArray(pub.opportunityTopics) && pub.opportunityTopics.length === 1);
  check("governmentRole im Snapshot", pub.governmentRole === "regierung");
  check("Bestandsfelder unveraendert (noGoTopics, party)", pub.noGoTopics && pub.party === "SPD");

  const leerProfil = ai.publicProfile({ fullName: "Leer", publicPositions: [], governmentRole: "unbekannt" });
  check("leere Freitexte werden weggelassen", !("publicPositions" in leerProfil) && !("keyAudiences" in leerProfil));
  check("governmentRole 'unbekannt' wird weggelassen (neutral)", !("governmentRole" in leerProfil));

  const lang = ai.publicProfile({ publicPositions: ["x".repeat(2000)], keyAudiences: Array.from({ length: 30 }, (_, i) => `Gruppe ${i}`) });
  check("ueberlange Eintraege gekappt (capText)", lang.publicPositions[0].length <= 300, `len=${lang.publicPositions[0].length}`);
  check("Listen gedeckelt (max. 12 Eintraege)", lang.keyAudiences.length <= 12, `n=${lang.keyAudiences.length}`);

  console.log("== §7 Rollen-Framing: Regierungsmandat ohne Oppositionssprache ==");
  const oppBrief = ai.briefingRoleLine({ governmentRole: "opposition" });
  const regBrief = ai.briefingRoleLine({ governmentRole: "regierung" });
  const neutralBrief = ai.briefingRoleLine({});
  check("Opposition -> Oppositions-Referent-Framing", /Oppositions-Referent/.test(oppBrief));
  check("Regierung -> KEINE Oppositionssprache im Briefing-Framing", !/Opposition/i.test(regBrief), regBrief);
  check("Regierung -> erklaeren/verteidigen statt Luecke", /verteidig|erklär/.test(regBrief), regBrief);
  check("ohne Rolle -> neutral (keine Oppositionssprache)", !/Opposition/i.test(neutralBrief), neutralBrief);
  const oppComm = ai.communicationRoleLine({ governmentRole: "opposition" });
  const regComm = ai.communicationRoleLine({ governmentRole: "regierung" });
  check("Kommunikation Opposition -> Oppositionslogik", /Oppositionslogik/.test(oppComm));
  check("Kommunikation Regierung -> KEINE Oppositionslogik", !/Oppositionslogik|Lücke/.test(regComm), regComm);
  check("ungueltige Rolle faellt auf neutral zurueck", !/Opposition/i.test(ai.briefingRoleLine({ governmentRole: "quatsch" })));

  console.log("== §7 Guardrails: Regelsaetze nur bei belegten Feldern ==");
  const guards = ai.profileGuardrailLines(vollProfil);
  check("Positionen -> nie widersprechen", /nie widersprechen/.test(guards));
  check("Risiko -> Vorsicht", /Vorsicht/.test(guards));
  check("Chancen -> Rückenwind", /Rückenwind/.test(guards));
  check("Zielgruppen -> Ton ausrichten", /Ton/.test(guards));
  check("leeres Profil -> keine toten Regeln", ai.profileGuardrailLines({}) === "");

  console.log("== §8 Kanal-Ableitung aus officeFormats (normalizeProfile) ==");
  const abgeleitet = await normalizeProfile({
    fullName: "Kanal Test",
    officeFormats: ["presse", "anfrage", "buergerbrief", "intern", "rede", "linkedin"]
  }, "kanal-test");
  const kanaele = abgeleitet.preferredChannels;
  check("presse -> press", kanaele.includes("press"), JSON.stringify(kanaele));
  check("anfrage -> committee_question", kanaele.includes("committee_question"));
  check("buergerbrief -> citizen_dialogue", kanaele.includes("citizen_dialogue"));
  check("intern -> internal_line", kanaele.filter((k) => k === "internal_line").length === 1);
  check("Rest direkt (linkedin, rede unveraendert)", kanaele.includes("linkedin") && kanaele.includes("rede"));

  // Review-Fix: alle Formate abgewaehlt ([]) muss die Kanaele ehrlich leeren,
  // nicht den alten Stand einfrieren.
  const geleert = await normalizeProfile({ fullName: "Leer Test", officeFormats: [] }, "kanal-leer");
  check("officeFormats [] -> Kanaele ehrlich leer", Array.isArray(geleert.preferredChannels) && geleert.preferredChannels.length === 0, JSON.stringify(geleert.preferredChannels));

  const explizit = await normalizeProfile({
    fullName: "Explizit Test",
    officeFormats: ["presse"],
    preferredChannels: ["social"]
  }, "kanal-explizit");
  check("explizit gesendete preferredChannels gewinnen", explizit.preferredChannels.length === 1 && explizit.preferredChannels[0] === "social", JSON.stringify(explizit.preferredChannels));

  console.log("== §8 Akteure: opponents wird uebernommen (Radar-Quelle) ==");
  const mitAkteuren = await normalizeProfile({
    fullName: "Akteur Test",
    opponents: ["Netzagentur-Chef", "Gegenkandidatin Y"]
  }, "akteur-test");
  check("opponents-Array uebernommen", mitAkteuren.opponents.length === 2 && mitAkteuren.opponents.includes("Gegenkandidatin Y"));
  const mitAkteurenString = await normalizeProfile({ fullName: "Akteur Test", opponents: "A GmbH, B e.V." }, "akteur-string");
  check("Komma-String -> Array (arrayValue)", mitAkteurenString.opponents.length === 2 && mitAkteurenString.opponents[0] === "A GmbH", JSON.stringify(mitAkteurenString.opponents));

  console.log("== §8 Scoring: abgeleitete Kanaele zaehlen in der Kanal-Passung ==");
  const ko = { recommended_communication_struct: { recommendedChannel: "parliamentary", recommendedFormat: "none", suggestedOutputs: [] } };
  const mitPassung = scoring.actionability(ko, { preferredChannels: ["committee_question"] });
  const ohnePassung = scoring.actionability(ko, { preferredChannels: [] });
  check("committee_question matcht parliamentary (+0.2)", mitPassung.factors.channel > ohnePassung.factors.channel,
    `mit=${mitPassung.factors.channel} ohne=${ohnePassung.factors.channel}`);
  const koPress = { recommended_communication_struct: { recommendedChannel: "press", recommendedFormat: "none", suggestedOutputs: [] } };
  check("press matcht abgeleitetes 'press'", scoring.actionability(koPress, { preferredChannels: ["press"] }).factors.channel > scoring.actionability(koPress, { preferredChannels: [] }).factors.channel);
  check("internal_line matcht internal", scoring.actionability({ recommended_communication_struct: { recommendedChannel: "internal", recommendedFormat: "none", suggestedOutputs: [] } }, { preferredChannels: ["internal_line"] }).factors.channel > 0.6);

  console.log("== UI-Verdrahtung im Quelltext (Client/Server) ==");
  const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
  check("Admin-Formular ohne Passwortfeld", !clientSrc.includes("createUserPassword"));
  check("Einladung erneut senden vorhanden", clientSrc.includes("data-admin-user-invite"));
  check("Passwort aendern (Self-Service) vorhanden", clientSrc.includes("data-password-change"));
  check("Akteure-Feld an opponents gebunden", clientSrc.includes('profileArea("opponents"'));
  check("totes Feld 'Bevorzugte Kanaele' entfernt", !clientSrc.includes('profileArea("preferredChannels"'));
  check("Version-Footer nutzt echte Build-Version (§9)", clientSrc.includes("appBuildVersion") && !clientSrc.includes("Helmut · Version 1.0"));
  check("Server: oeffentliche Seite /passwort-setzen registriert", serverSrc.includes('url.pathname === "/passwort-setzen"'));
  check("Server: /api/app/start traegt version", /version: ASSET_VERSION/.test(serverSrc));

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} KI-Profilfelder-Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
