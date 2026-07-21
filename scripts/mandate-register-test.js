"use strict";

// Sprint 1 "Universelles Mandatsregister" — Testsuite.
//
// Prueft das datengetriebene Register (Parteien/Fraktionen/Ausschuesse/Funktionen/Themen)
// und den Resolver (Identitaet/Dubletten, Auflösung, verbindlicher Versorgungsstatus,
// Coverage-Matrix) fuer BELIEBIGE Bundestagsabgeordnete — nicht nur den Pilot-Typ.
//
// Rein offline, deterministisch (kein Netz/KI/Storage). Wird vom CI-Offline-Runner
// automatisch eingesammelt (scripts/*-test.js).

const fs = require("fs");
const path = require("path");
const reg = require("../lib/helmut/quellenarchitektur/seeds/mandate-registry");
const R = require("../lib/helmut/mandate-register");

let fail = 0;
let count = 0;
function check(name, cond) {
  count += 1;
  if (!cond) { fail += 1; console.log(`FAIL  ${name}`); }
  else console.log(`PASS  ${name}`);
}
function eq(name, got, exp) { check(`${name} (=${JSON.stringify(exp)})`, JSON.stringify(got) === JSON.stringify(exp)); }

// Basis-Mandat-Baukasten (vollstaendig, damit Einzelachsen isoliert testbar sind).
function mandate(over = {}) {
  return Object.assign({
    id: "t-" + (over.id || "x"), fullName: "Test Person", party: "SPD",
    committees: ["Finanzen"], parliamentType: "Bundestag", constituency: "WK 1"
  }, over);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n== 1. Registry: datengetrieben & vollstaendig ==");
const sum = reg.registrySummary();
eq("9 Parteien", sum.parties, 9);
eq("8 Fraktionen", sum.fractions, 8);
eq("23 Ausschuesse", sum.committees, 23);
eq("22 Ausschuesse mit Politikfeld (nur Petitionen ohne)", sum.committeesWithPolicyField, 22);
check("alle 9 Parteien aufloesbar", ["CDU", "CSU", "SPD", "Bündnis 90/Die Grünen", "FDP", "AfD", "Die Linke", "BSW", "SSW"].every((p) => reg.resolveParty(p).known));
check("Partei->Fraktion fuer JEDE Partei bestimmbar", reg.listParties().every((p) => reg.fractionForParty(p.key)));
eq("CDU und CSU teilen die CDU/CSU-Fraktion", [reg.fractionForParty("cdu").key, reg.fractionForParty("csu").key], ["cdu-csu", "cdu-csu"]);
eq("Union -> cdu-csu-Fraktion", reg.fractionForParty("union") ? reg.fractionForParty("union").key : null, "cdu-csu");
check("jeder der 23 Ausschuesse hat Thementermini oder ist Petitionen", reg.listCommittees().every((c) => c.themeTerms.length > 0 || c.key === "petitionen"));

console.log("\n== 2. Ausschuss-Aufloesung inkl. dokumentierter Kollision ==");
eq("Sozialausschuss -> arbeit-und-soziales", reg.resolveCommittee("Sozialausschuss").key, "arbeit-und-soziales");
eq("Menschenrechtsausschuss != recht (Kollision abgefangen)", reg.resolveCommittee("Menschenrechtsausschuss").key, "menschenrechte");
eq("Rechtsausschuss -> recht", reg.resolveCommittee("Rechtsausschuss").key, "recht");
eq("Digitalausschuss -> digitales (Alias)", reg.resolveCommittee("Digitalausschuss").key, "digitales");
eq("Ausschuss f. Klima und Umwelt -> umwelt", reg.resolveCommittee("Ausschuss für Klima und Umwelt").key, "umwelt");
check("unbekannter Ausschuss -> known=false", reg.resolveCommittee("Ausschuss für Weltraumfahrt").known === false);

console.log("\n== 3. Funktionen (maximal-munch) ==");
eq("Stellv. Vorsitz spezifischer als Vorsitz", (reg.resolveFunction("Stellvertretende Vorsitzende") || {}).key, "stellv-vorsitz");
eq("Ausschussvorsitzender -> vorsitz", (reg.resolveFunction("Ausschussvorsitzender") || {}).key, "vorsitz");
eq("Obfrau -> obmann", (reg.resolveFunction("Obfrau") || {}).key, "obmann");
eq("stellv. Mitglied -> stellv-mitglied", (reg.resolveFunction("stellvertretendes Mitglied") || {}).key, "stellv-mitglied");
check("leere Funktion -> null", reg.resolveFunction("") === null);

console.log("\n== 4. Identitaet & Dubletten ==");
eq("Namensslug faltet Umlaute+Titel", R.nameSlug("Prof. Dr. Änna von Müller-Schmidt (MdB)"), "aenna-mueller-schmidt");
const idStable = R.mandateIdentity(mandate({ bundestagId: "11004711" }));
eq("stabile externe ID -> personKey ext:", idStable.personKey, "ext:bundestag:11004711");
eq("stabile ID -> Konfidenz stable", idStable.confidence, "stable");
const idName = R.mandateIdentity(mandate({ fullName: "Klara Klar" }));
eq("nur Name -> personKey name:", idName.personKey, "name:klara-klar");
eq("nur Name -> Konfidenz name", idName.confidence, "name");
// echte Dublette (gleicher Name+Partei+Wahlkreis, keine externe ID)
const dup = R.detectDuplicates([
  mandate({ id: "a", fullName: "Max Muster", party: "CDU", constituency: "WK 5" }),
  mandate({ id: "b", fullName: "Dr. Max Muster", party: "CDU", constituency: "WK 5" }), // Titel gefaltet -> selbe Person
  mandate({ id: "c", fullName: "Max Muster", party: "SPD", constituency: "WK 9" })      // Namensvetter (andere Partei/WK)
]);
eq("genau 1 echte Dublette (a+b)", dup.duplicates.length, 1);
eq("Dublette umfasst a und b", dup.duplicates[0].profileIds.sort(), ["a", "b"]);
check("c NICHT als Dublette (Namensvetter)", !dup.duplicateClusterKeys.has(R.identityClusterKey(mandate({ id: "c", fullName: "Max Muster", party: "SPD", constituency: "WK 9" }))));
check("Namensvetter-Gruppe sichtbar gemacht", dup.namesakes.some((n) => n.nameSlug === "max-muster"));
// stabile IDs trennen gleichnamige Personen
const dup2 = R.detectDuplicates([
  mandate({ id: "x", fullName: "Eva Gleich", bundestagId: "1" }),
  mandate({ id: "y", fullName: "Eva Gleich", bundestagId: "2" })
]);
eq("verschiedene stabile IDs -> KEINE Dublette", dup2.duplicates.length, 0);

console.log("\n== 5. Universalitaet: JEDE Partei/JEDER Ausschuss wird register-reif ==");
const ALL_PARTIES = ["CDU", "CSU", "SPD", "Bündnis 90/Die Grünen", "FDP", "AfD", "Die Linke", "BSW"];
for (const party of ALL_PARTIES) {
  const m = R.resolveMandate(mandate({ id: "p-" + party, fullName: party + " Abgeordnete", party, committees: ["Finanzen"] }));
  check(`Partei ${party}: registerReady`, m.versorgungsstatus.registerReady === true && m.coverageStatus === "vollstaendig");
  check(`Partei ${party}: Fraktion aufgeloest`, Boolean(m.fraction.key));
}
for (const c of reg.listCommittees()) {
  const m = R.resolveMandate(mandate({ id: "c-" + c.key, committees: [c.name] }));
  const expectReady = c.key !== "petitionen"; // Petitionen liefert kein Politikfeld -> Themen leer, aber Pflichtdaten via committee erfuellt
  check(`Ausschuss ${c.key}: coverage=vollstaendig`, m.coverageStatus === "vollstaendig");
  if (expectReady) check(`Ausschuss ${c.key}: Politikfeld abgeleitet`, m.themes.policyFields.length === 1);
}

console.log("\n== 6. Verbindlicher Versorgungsstatus (4 Zustaende) ==");
eq("vollstaendiges Mandat -> vollstaendig",
  R.resolveMandate(mandate({})).coverageStatus, "vollstaendig");
eq("fehlende Pflichtdaten -> unvollstaendig",
  R.resolveMandate({ id: "u", fullName: "Nur Name" }).coverageStatus, "unvollstaendig");
eq("unbekannte Partei -> review",
  R.resolveMandate(mandate({ party: "Piratenpartei" })).coverageStatus, "review");
eq("unbekannter Ausschuss -> review",
  R.resolveMandate(mandate({ committees: ["Ausschuss für Weltraumfahrt"] })).coverageStatus, "review");
eq("fehlerhaftes Budget -> review",
  R.resolveMandate(mandate({ aiBudgetDailyCents: -3 })).coverageStatus, "review");
eq("Landtag ohne Landesmodul -> blockiert",
  R.resolveMandate(mandate({ parliamentType: "Landtag", bundesland: "Baden-Württemberg" })).coverageStatus, "blockiert");
eq("Landtag Berlin (prepared) -> blockiert",
  R.resolveMandate(mandate({ parliamentType: "Landtag", bundesland: "Berlin" })).coverageStatus, "blockiert");
eq("deaktiviertes Profil -> blockiert",
  R.resolveMandate(mandate({ profileActive: false })).coverageStatus, "blockiert");
check("nur-Name identity ist ADVISORY (kein review-Ausloeser)",
  R.resolveMandate(mandate({})).versorgungsstatus.infoFlags.some((f) => f.code === "identitaet-nur-name"));

console.log("\n== 7. Feldnamen-Bruecke DE/EN (mandate_profiles) ==");
const de = R.resolveMandate({ id: "de", fullName: "Deutsch Feld", partei: "AfD", fraktion: "AfD", ausschuesse: ["Gesundheit"], politische_ebene: "bundestag", wahlkreis: "WK 3" });
check("deutsche Felder werden erkannt -> vollstaendig", de.coverageStatus === "vollstaendig");
eq("partei (de) -> party.key", de.party.key, "afd");
eq("ausschuesse (de) -> committee", de.committees.map((c) => c.key), ["gesundheit"]);

console.log("\n== 8. Themen-Ableitung (datengetrieben aus Ausschuss) ==");
const themed = R.resolveMandate(mandate({ committees: ["Ausschuss für Arbeit und Soziales"] }));
eq("A&S -> Politikfeld", themed.themes.policyFields, ["Arbeit und Soziales"]);
eq("A&S -> Leitministerium BMAS", themed.themes.ministries, ["BMAS"]);
check("A&S -> Thementermini vorhanden", themed.themes.themeTerms.length >= 10);
const multi = R.resolveMandate(mandate({ committees: ["Finanzausschuss", "Haushaltsausschuss"] }));
eq("mehrere Ausschuesse -> mehrere Politikfelder", multi.themes.policyFields.sort(), ["Finanzen", "Haushalt"]);

console.log("\n== 9. Quellen-Ausblick: getrennt von Datenreife (Sprint-2-Ehrlichkeit) ==");
const pilot = R.resolveMandate(mandate({ id: "pilot", fullName: "Pilot Typ", party: "Die Linke", committees: ["Ausschuss für Arbeit und Soziales"], bundesland: "Niedersachsen", constituency: "Salzgitter" }));
check("Pilot-Typ: registerReady UND sourceReady", pilot.versorgungsstatus.registerReady && pilot.supplyOutlook.allNeededActive);
const cdu = R.resolveMandate(mandate({ id: "cdu2", party: "CDU", committees: ["Verteidigung"] }));
check("CDU-Verteidigung: registerReady ABER nicht sourceReady", cdu.versorgungsstatus.registerReady && !cdu.supplyOutlook.allNeededActive);
check("CDU-Verteidigung: konkrete Sprint-2-Bauliste", cdu.supplyOutlook.gaps.some((g) => g.need === "parteipaket:cdu") && cdu.supplyOutlook.gaps.some((g) => g.need === "themenpaket:verteidigung"));

console.log("\n== 10. Coverage-Matrix ==");
const matrix = R.buildCoverageMatrix([
  mandate({ id: "m1", fullName: "Erika Eins", party: "CDU", committees: ["Verteidigung"] }),
  mandate({ id: "m2", fullName: "Bruno Zwei", party: "SPD", committees: ["Gesundheit"] }),
  { id: "m3", fullName: "Clara Leer" },
  mandate({ id: "m4", fullName: "Doro Vier", parliamentType: "Landtag", bundesland: "Sachsen" }),
  mandate({ id: "m5", fullName: "Ernst Fünf", party: "Unbekanntpartei" }),
  mandate({ id: "d1", fullName: "Twin Twin", party: "FDP", constituency: "WK 7" }),
  mandate({ id: "d2", fullName: "Twin Twin", party: "FDP", constituency: "WK 7" })
]);
eq("Matrix: 7 Zeilen", matrix.summary.total, 7);
eq("Matrix: 2 vollstaendig (m1,m2)", matrix.summary.vollstaendig, 2);
eq("Matrix: 1 unvollstaendig (m3)", matrix.summary.unvollstaendig, 1);
eq("Matrix: 1 blockiert (m4)", matrix.summary.blockiert, 1);
eq("Matrix: 3 review (m5 + d1/d2 Dublette)", matrix.summary.review, 3);
eq("Matrix: 1 Dubletten-Gruppe", matrix.summary.duplicateGroups, 1);
check("Matrix: jede Zeile hat coverageStatus + registerReady", matrix.rows.every((r) => r.coverageStatus && typeof r.registerReady === "boolean"));
check("Matrix: Dubletten-Zeilen tragen review-Flag", matrix.rows.filter((r) => ["d1", "d2"].includes(r.profileId)).every((r) => r.reviewFlags.includes("moegliche-dublette")));

console.log("\n== 11. Robustheit (kein Absturz bei Muell) ==");
for (const bad of [null, undefined, {}, [], 42, "x", { id: 1 }]) {
  try { R.resolveMandate(bad); check(`resolveMandate(${JSON.stringify(bad)}) wirft nicht`, true); }
  catch (e) { check(`resolveMandate(${JSON.stringify(bad)}) wirft nicht`, false); }
}
check("buildCoverageMatrix(nicht-Array) -> leere Matrix", R.buildCoverageMatrix(null).summary.total === 0);

console.log("\n== 12. Vorbereitete Migration: existiert, NICHT angewendet, wohlgeformt ==");
const root = path.join(__dirname, "..");
const preparedSql = path.join(root, "supabase/migrations/prepared/20260722_mandate_register.sql");
const preparedRb = path.join(root, "supabase/migrations/prepared/20260722_mandate_register_rollback.sql");
check("prepared-Migration existiert", fs.existsSync(preparedSql));
check("Rollback existiert", fs.existsSync(preparedRb));
// Invariante: die Migration liegt NICHT im aktiven Pfad (supabase/migrations/*.sql).
check("NICHT im aktiven Migrationspfad (kein Auto-Apply)",
  !fs.existsSync(path.join(root, "supabase/migrations/20260722_mandate_register.sql")));
if (fs.existsSync(preparedSql)) {
  const sql = fs.readFileSync(preparedSql, "utf8");
  const begins = (sql.match(/\bbegin\s*;/gi) || []).length;
  const commits = (sql.match(/\bcommit\s*;/gi) || []).length;
  check("begin/commit balanciert", begins === commits && begins >= 1);
  check("legt mandate_register an", /create table if not exists public\.mandate_register/.test(sql));
  check("legt mandate_external_ids an", /create table if not exists public\.mandate_external_ids/.test(sql));
  check("coverage_status CHECK auf die 4 Zustaende", /coverage_status in \('vollstaendig','unvollstaendig','blockiert','review'\)/.test(sql));
  check("UNIQUE(id_source, external_id) = DB-Dubletten-Schutz", /unique \(id_source, external_id\)/.test(sql));
  check("RLS aktiviert", /enable row level security/.test(sql));
  check("Zugriff von anon/authenticated entzogen", /revoke all on table public\.mandate_register\s+from public, anon, authenticated/.test(sql));
  check("additiv: aendert keine bestehende Tabelle (kein alter table auf mandate_profiles)", !/alter table public\.mandate_profiles/.test(sql.replace(/--.*$/gm, "")));
}
if (fs.existsSync(preparedRb)) {
  const rb = fs.readFileSync(preparedRb, "utf8");
  check("Rollback droppt beide Tabellen", /drop table if exists public\.mandate_external_ids/.test(rb) && /drop table if exists public\.mandate_register/.test(rb));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${count - fail}/${count} Checks grün`);
process.exit(fail ? 1 : 0);
