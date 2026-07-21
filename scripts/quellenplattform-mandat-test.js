"use strict";

// Tests — Quellenplattform (Konsolidierung) · Mandat als EINZIGE Profilwahrheit + datengetriebene
// Zuweisung (Aufgabe 9: 1, 6, 7, 8, 9, 10, 11). Rein statisch, kein Netz, keine KI, kein Storage.

const { P, PROFILE_BUND_SPD, resolveEntityIds } = require("./quellenplattform-fixture");
const assignment = require("../lib/helmut/quellenplattform/assignment");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

const mandate = P.resolveMandate(PROFILE_BUND_SPD);
const req = assignment.buildRequirement(mandate, { profile: PROFILE_BUND_SPD });

console.log("== 1. Mandatsregister ist die einzige Profil->Anforderungs-Wahrheit ==");
// buildRequirement leitet NICHT selbst aus dem Rohprofil ab, sondern aus dem aufgeloesten Mandat.
const reqFromProfile = assignment.buildRequirement(PROFILE_BUND_SPD);
const reqFromMandate = assignment.buildRequirement(mandate, { profile: PROFILE_BUND_SPD });
check("Anforderung aus Profil == Anforderung aus aufgeloestem Mandat (eine Wahrheit)",
  JSON.stringify(reqFromProfile.parties) === JSON.stringify(reqFromMandate.parties) &&
  JSON.stringify(reqFromProfile.committees) === JSON.stringify(reqFromMandate.committees));
check("Partei/Ausschuss/Themen stammen aus Sprint-1-Auflösung (mandate.party/committees/themes)",
  req.parties.includes(mandate.party.key) && req.committees.includes(mandate.committees[0].key));
// Es gibt keine zweite deriveRequirement mehr: die Konsolidierung exportiert nur buildRequirement.
check("Nur EINE Anforderungs-Ableitung exportiert (buildRequirement, keine deriveRequirement)",
  typeof assignment.buildRequirement === "function" && assignment.deriveRequirement === undefined);

console.log("\n== 7. Partei und Fraktion ==");
check("Partei-Key + Entity-ID in der Anforderung", req.parties.includes("spd") && req.parties.includes(mandate.party.entity_id));
check("Fraktions-Key + Entity-ID in der Anforderung", req.factions.includes("spd") && req.factions.includes(mandate.fraction.entity_id));

console.log("\n== 6. Ausschuss -> Politikfeld-Verbindung ==");
check("Ausschuss 'arbeit-und-soziales' in committees", req.committees.includes("arbeit-und-soziales"));
check("Politikfeld aus Ausschuss abgeleitet (policyFields enthält Ausschuss/Politikfeld)",
  req.policyFields.includes("arbeit-und-soziales"));

console.log("\n== 8. Regionale Zuordnung ==");
check("Region 'niedersachsen' aus Bundesland abgeleitet", req.regions.includes("niedersachsen"));
const srcNds = { id: "s-nds", source_type: "medien_regional", political_level: "land", region_ids: ["niedersachsen"], trust: "mittel", review_status: "active" };
const srcBay = { id: "s-bay", source_type: "medien_regional", political_level: "land", region_ids: ["bayern"], trust: "mittel", review_status: "active" };
check("Regionalquelle Niedersachsen ist relevant", assignment.scoreSource(srcNds, req).relevant === true);
check("Regionalquelle Bayern ist NICHT relevant (kein Regionstreffer)", assignment.scoreSource(srcBay, req).relevant === false);

console.log("\n== 9/10/11. Neue Partei/Ausschuss/Region OHNE Codeänderung (datengetrieben) ==");
// Erfundene Tokens, die in KEINER Codeliste stehen — der Match entsteht rein aus Datenüberschneidung.
const reqNovel = {
  parties: ["erfundene-partei-xyz"], factions: [], committees: ["neuer-ausschuss-quantenethik"],
  policyFields: ["neuer-ausschuss-quantenethik"], ministries: [], regions: ["neue-region-atlantis"],
  _want: {
    parties: new Set(["erfundene-partei-xyz"]), factions: new Set(),
    policyFields: new Set(["neuer-ausschuss-quantenethik"]), ministries: new Set(),
    regions: new Set(["neue-region-atlantis"])
  }
};
const sNewParty = { id: "np", source_type: "partei", political_level: "bund", party_id: "erfundene-partei-xyz", trust: "mittel", review_status: "active" };
const sNewComm = { id: "nc", source_type: "ausschuss", political_level: "bund", committee_ids: ["neuer-ausschuss-quantenethik"], trust: "hoch", review_status: "active" };
const sNewReg = { id: "nr", source_type: "medien_regional", political_level: "land", region_ids: ["neue-region-atlantis"], trust: "mittel", review_status: "active" };
check("Neue Partei matcht rein über Daten (kein Code-Literal)", assignment.scoreSource(sNewParty, reqNovel).relevant === true);
check("Neuer Ausschuss matcht rein über Daten", assignment.scoreSource(sNewComm, reqNovel).relevant === true);
check("Neue Region matcht rein über Daten", assignment.scoreSource(sNewReg, reqNovel).relevant === true);
// Gegenprobe: dieselbe neue Region gegen ein Mandat OHNE diese Region -> kein Treffer.
check("Neue Region ohne Anforderungstreffer bleibt ausgeschlossen", assignment.scoreSource(sNewReg, req).relevant === false);

console.log(`\n== ${pass} PASS, ${fail} FAIL ==`);
if (fail) process.exit(1);
