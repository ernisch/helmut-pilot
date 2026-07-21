"use strict";

// Tests — Quellenplattform (Konsolidierung) · Mandantentrennung, DSGVO/PII, keine Pilot-Sonderlogik,
// Rückwärtskompatibilität (Aufgabe 9: 13, 18, 19, 20). Rein statisch, kein Netz/KI/Storage.

const fs = require("fs");
const path = require("path");
const { P, PROFILE_BUND_SPD, PROFILE_BUND_CDU, buildCompleteCatalog, buildPrivateSources, resolveEntityIds } = require("./quellenplattform-fixture");
const sourceRecord = require("../lib/helmut/quellenarchitektur/master/source-record");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

console.log("== 13. Private Quellen: strikte Tenant-Isolation ==");
const catalog = buildCompleteCatalog(resolveEntityIds(PROFILE_BUND_SPD));
const privs = buildPrivateSources(); // priv-a1 (tenant-A), priv-b1 (tenant-B)
const planA = P.planSupplyForMandate(PROFILE_BUND_SPD, { globalSources: catalog, privateSources: privs, tenantId: "tenant-A" });
const planB = P.planSupplyForMandate(PROFILE_BUND_SPD, { globalSources: catalog, privateSources: privs, tenantId: "tenant-B" });
check("Mandant A sieht seine eigene private Quelle", planA.sources.some((s) => s.id === "priv-a1" && s.visibility === "private"));
check("Mandant A sieht NIEMALS die private Quelle von B", !planA.sources.some((s) => s.id === "priv-b1"));
check("Mandant B sieht seine eigene private Quelle, nicht die von A", planB.sources.some((s) => s.id === "priv-b1") && !planB.sources.some((s) => s.id === "priv-a1"));
check("alle privaten Quellen im Plan tragen die eigene tenant_id", planA.invariants.allPrivateOwnTenant === true);
// Zweite Verteidigungslinie: harte Isolationsprüfung über tenant-scope.
const iso = P.tenant.resolveTenantSources("tenant-A", { globalCatalogById: new Map(catalog.map((r) => [r.id, r])), mandateSourceIds: ["parlament"], privateSources: privs });
const assertIso = P.tenant.assertPrivateIsolation("tenant-A", iso, privs);
check("tenant-scope: harte Isolationsprüfung ist sauber (kein Leak)", assertIso.isolated === true && assertIso.leaked.length === 0);
check("fremde private Quelle wird als Verletzung abgewiesen", iso.violations.some((v) => /fremde-private-quelle/.test(v)));

console.log("\n== 19. DSGVO / PII-Schutz ==");
const withEmail = sourceRecord.buildSourceRecord({ id: "s1", publisher_id: "p", source_type: "partei", political_level: "bund", discovery_origin: "manual_curation", discovered_at: "2026-07-01", responsible: "kontakt: max.mustermann@gmail.com", canonical_url: "https://x.example", method: "html" });
check("private E-Mail im Record wird als PII erkannt", sourceRecord.scanForPrivatePii(withEmail).some((e) => /E-Mail/i.test(e)));
check("Rollen-Postfach (presse@) ist erlaubt (kein PII-Fehlalarm)", sourceRecord.scanForPrivatePii({ responsible: "presse@bundestag.de" }).length === 0);
const withPhone = { responsible: "Rückfragen: +49 30 12345678" };
check("private Telefonnummer im Freitext wird erkannt", sourceRecord.scanForPrivatePii(withPhone).some((e) => /Telefonnummer/i.test(e)));
check("verbotenes PII-Feld (private_email) wird erkannt", sourceRecord.scanForPrivatePii({ private_email: "a@b.de" }).length > 0);
// Der Versorgungsplan/das Laufzeitobjekt enthält keine Rohprofile/personenbezogenen Klartexte.
const planJson = JSON.stringify(planA);
check("Plan enthält kein Rohprofil / keinen Klarnamen des Mandanten", !planJson.includes("Erika Mustermann") && !/@gmail|@web\.de/.test(planJson));

console.log("\n== 18. Keine Pilot-Sonderlogik / kein hartkodierter Sonderfall ==");
// Funktional: der Wechsel der Partei ändert die Zuweisung rein über Daten, ohne Sonderpfad.
const reqSpd = P.buildRequirement(PROFILE_BUND_SPD);
const reqCdu = P.buildRequirement(PROFILE_BUND_CDU);
check("anderes Mandat -> andere Partei-Anforderung (datengetrieben, kein Sonderfall)",
  reqSpd.parties.includes("spd") && reqCdu.parties.some((p) => /cdu/.test(p)) && !reqCdu.parties.includes("spd"));
// Quellcode-Scan: die konsolidierten Module tragen keine Pilot-/Partei-Sonderlogik.
const dir = path.join(__dirname, "..", "lib", "helmut", "quellenplattform");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
let hardcodeHits = [];
for (const f of files) {
  const txt = fs.readFileSync(path.join(dir, f), "utf8");
  // verbotene Sonderfall-Muster: Pilot-Sonderpfade, party/tenant-spezifische Gleichheitszweige.
  if (/\bpilot\b/i.test(txt)) hardcodeHits.push(`${f}:pilot`);
  if (/===\s*["'](spd|cdu|csu|gruene|grüne|afd|fdp|linke|bsw)["']/i.test(txt)) hardcodeHits.push(`${f}:partei-literal`);
  if (/LANDESPAKET_BY_BUNDESLAND|SOCIAL_TERMS/.test(txt)) hardcodeHits.push(`${f}:legacy-hardcode`);
}
check(`konsolidierte Module ohne Pilot-/Partei-Sonderlogik (${hardcodeHits.join(",") || "sauber"})`, hardcodeHits.length === 0);

console.log("\n== 20. Rückwärtskompatibilität zur bestehenden main-Architektur ==");
// Legacy-Paketauflösung funktioniert UNVERÄNDERT (Kompatibilitätsschicht).
const legacy = P.legacyPackages.readLegacyPackages(PROFILE_BUND_SPD);
check("Legacy-Paketauflösung liefert weiterhin bund-basis (unverändert)", legacy.required.some((p) => p.key === "bund-basis"));
check("bestehende Quellenarchitektur (main) lädt unverändert", typeof require("../lib/helmut/quellenarchitektur/model") === "object");
check("bestehende profile-packages (main) unverändert nutzbar", typeof require("../lib/helmut/quellenarchitektur/profile-packages").resolveProfilePackages === "function");
// Die Konsolidierung ist additiv: sie erzeugt keine neuen dauerhaften Pakete.
check("additiv: keine neuen persistenten Pakete", P.legacyPackages.assertNoNewPersistentPackages(planA).ok === true);

console.log(`\n== ${pass} PASS, ${fail} FAIL ==`);
if (fail) process.exit(1);
