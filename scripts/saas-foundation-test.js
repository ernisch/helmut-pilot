#!/usr/bin/env node
"use strict";

// SaaS Data Trust Foundation — Offline-Checks fuer den Sprint:
//   1) Stille Personen-Fallbacks im Schreibpfad geschlossen (Account-Modus).
//   2) Ingestion profilbasiert (keine harten Cem-/Die-Linke-/BMAS-Standards).
//   3) Bundestag/Landtag als Ebenen + Profil-Vollstaendigkeit.
//   4) Quellen-Kategorien inkl. Medien.
//   6) Source Safety Guard (kritische Claims, Whitelist, Link-Sicherheit).
//
// Rein in-process, deterministisch, kein Netzwerk/Supabase/KI.
// Ausfuehren:  node scripts/saas-foundation-test.js   (Exit 0 = alle bestanden)

process.env.HELMUT_STORAGE_BACKEND = process.env.HELMUT_STORAGE_BACKEND || "local";
process.env.HELMUT_STORE_CACHE_MS = "0";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
function contains(hay, needle) { return String(hay).includes(needle); }

const safety = require("../lib/helmut/sourceSafety");
const config = require("../lib/helmut/config");
const scheduler = require("../lib/helmut/scheduler");
const { cemInceProfile } = config;

// ============================ 1) Schreibpfad-Gating ============================
(function gating() {
  // Pilot-Modus (kein Account-Modus): cem-ince erbt seine reichen Demo-Defaults.
  delete process.env.HELMUT_AUTH_MODE;
  const pilotCem = scheduler.mergeProfileDefaults({ id: "cem-ince" });
  check("Pilot: cem-ince erbt Demo-Defaults (committee=Arbeit und Soziales)", pilotCem.committee === "Arbeit und Soziales", pilotCem.committee);
  check("Pilot: cem-ince bleibt als Account moeglich (id erhalten)", pilotCem.id === "cem-ince");

  // Account-Modus: KEIN stiller Personen-Fallback.
  process.env.HELMUT_AUTH_MODE = "accounts";
  const acctCem = scheduler.mergeProfileDefaults({ id: "cem-ince" });
  check("Account: cem-ince erbt KEINE Cem-Defaults (committee leer)", !acctCem.committee, JSON.stringify(acctCem.committee));
  check("Account: cem-ince erbt KEINE Cem-Themen (focusTopics leer)", (acctCem.focusTopics || []).length === 0);

  const acctIdless = scheduler.mergeProfileDefaults({ fullName: "Neu Ohne Id" });
  check("Account: id-loses Profil gilt NICHT als Demo (keine Cem-Defaults)", !acctIdless.committee && (acctIdless.focusTopics || []).length === 0);
  check("Account: id-loses Profil erfindet KEINE cem-ince id", acctIdless.id !== "cem-ince");

  const gruene = scheduler.mergeProfileDefaults({ id: "gruene-mdb", fullName: "Anna Muster", party: "Grüne", committee: "Umweltausschuss", focusTopics: ["Klimaschutz"] });
  check("Account: fremdes Profil behaelt eigene Werte, keine Cem-Themen", gruene.committee === "Umweltausschuss" && !contains(JSON.stringify(gruene.focusTopics), "Bürgergeld"));
  delete process.env.HELMUT_AUTH_MODE;
})();

// ======================= 2)+3) Profilbasierte Ingestion =======================
(function ingestion() {
  const gruene = {
    id: "gruene-mdb", fullName: "Anna Muster", party: "Grüne", faction: "Bündnis 90/Die Grünen",
    committee: "Umweltausschuss", committees: ["Umweltausschuss"], focusTopics: ["Klimaschutz", "Energie"],
    relevantMinistries: ["BMUV"], politicalLevel: "Bund"
  };
  const sources = scheduler.mandateNewsSources(gruene);
  const blob = JSON.stringify(sources);
  const cemTerms = ["Die Linke", "BMAS", "Arbeit und Soziales", "Bürgergeld", "Mindestlohn", "Tarifbindung"];
  const leaked = cemTerms.filter((t) => contains(blob, t));
  check("Ingestion: KEINE harten Cem-/Die-Linke-/BMAS-Begriffe fuer fremdes Profil", leaked.length === 0, leaked.join(", "));
  check("Ingestion: Partei aus Profil (Grüne)", contains(blob, "Grüne"));
  check("Ingestion: Ministerium aus Profil (BMUV)", contains(blob, "BMUV"));
  check("Ingestion: Ausschuss aus Profil (Umweltausschuss)", contains(blob, "Umweltausschuss"));
  check("Ingestion: Themen aus Profil (Klimaschutz)", contains(blob, "Klimaschutz"));

  // Landtag-Ebene: Landes-/Regionalquelle mit Bundesland.
  const landtag = { id: "by-mdl", fullName: "Max Bayer", party: "CSU", parliamentType: "Landtag", state: "Bayern", focusTopics: ["Verkehr"] };
  const lsources = scheduler.mandateNewsSources(landtag);
  const hasLandtag = lsources.some((s) => contains(s.name, "Landtag Bayern") && s.category === "regional");
  check("Ingestion: Landtag-Profil erhaelt regionale Landtag-Quelle", hasLandtag);
  const bund = { id: "b-mdb", fullName: "B", party: "SPD", parliamentType: "Bundestag", focusTopics: ["Digitales"] };
  check("Ingestion: Bundestag-Profil OHNE Landtag-Quelle", !scheduler.mandateNewsSources(bund).some((s) => contains(s.name, "Landtag")));

  // topProfileTopics: Cem-Standardthemen NUR im Demo (Pilot), sonst nie.
  delete process.env.HELMUT_AUTH_MODE;
  const demoTopics = scheduler.topProfileTopics({ id: "cem-ince" }, 5);
  check("Themen: Demo-Profil (Pilot) erhaelt Cem-Standardthemen", demoTopics.includes("Bürgergeld"), demoTopics.join(","));
  process.env.HELMUT_AUTH_MODE = "accounts";
  const acctDemoTopics = scheduler.topProfileTopics({ id: "cem-ince" }, 5);
  check("Themen: cem-ince im Account-Modus erhaelt KEINE Standardthemen", acctDemoTopics.length === 0, acctDemoTopics.join(","));
  const foreignTopics = scheduler.topProfileTopics({ id: "gruene-mdb", focusTopics: ["Klima"] }, 5);
  check("Themen: fremdes Profil bekommt NUR eigene Themen", foreignTopics.length === 1 && foreignTopics[0] === "Klima");
  const emptyTopics = scheduler.topProfileTopics({ id: "leer-mdb" }, 5);
  check("Themen: Profil ohne Themen -> leer (kein Cem-Fallback)", emptyTopics.length === 0);
  delete process.env.HELMUT_AUTH_MODE;
})();

// =========================== 3) Profil-Vollstaendigkeit ========================
(function completeness() {
  const full = { fullName: "A", party: "SPD", committee: "Haushalt", focusTopics: ["Haushalt"], politicalLevel: "Bund" };
  check("Vollstaendigkeit: vollstaendiges Bundestagsprofil -> complete/full", config.profileCompleteness(full).level === "full");
  const nameOnly = { fullName: "B" };
  const c2 = config.profileCompleteness(nameOnly);
  check("Vollstaendigkeit: nur Name -> restricted", c2.level === "restricted" && c2.restricted === true);
  const empty = {};
  check("Vollstaendigkeit: leeres Profil -> empty", config.profileCompleteness(empty).level === "empty");
  const landtagNoState = { fullName: "C", party: "CSU", committee: "Verkehr", parliamentType: "Landtag" };
  check("Vollstaendigkeit: Landtag ohne Bundesland -> fehlt 'state'", config.profileCompleteness(landtagNoState).missing.includes("state"));
  check("Ebene: politicalLevel 'Bund' -> Bundestag", config.parliamentTypeOf({ politicalLevel: "Bund" }) === "Bundestag");
  check("Ebene: parliamentType 'Landtag' -> Landtag", config.parliamentTypeOf({ parliamentType: "Landtag" }) === "Landtag");
  check("Kontotyp: Default abgeordneter", config.accountTypeOf({}) === "abgeordneter");
  check("Kontotyp: pressestelle -> ministerium", config.accountTypeOf({ accountType: "pressestelle" }) === "ministerium");
})();

// =========================== 4) Quellen-Kategorien ============================
(function categories() {
  check("Kategorie: Bundestag-Feed -> offiziell", safety.categorizeSource({ type: "committee", url: "https://www.bundestag.de/x" }) === "offiziell");
  check("Kategorie: Tagesschau -> medien", safety.categorizeSource({ type: "media", url: "https://www.tagesschau.de/x" }) === "medien");
  check("Kategorie: Parteiseite -> partei_fraktion", safety.categorizeSource({ url: "https://www.die-linke.de/x" }) === "partei_fraktion");
  check("Kategorie: Personensuche -> profil", safety.categorizeSource({ type: "person", url: "https://news.google.com/rss/search?q=x" }) === "profil");
  check("Kategorie: unbekannte Domain -> unbekannt", safety.categorizeSource({ url: "https://irgendwas-unbekannt-xyz.tld/a" }) === "unbekannt");
  check("Vertrauen: bundestag.de -> hoch", safety.trustForSource({ url: "https://www.bundestag.de/x" }) === "hoch");
  check("Vertrauen: spiegel.de -> hoch", safety.trustForSource({ url: "https://www.spiegel.de/x" }) === "hoch");
  check("Vertrauen: Partei -> mittel", safety.trustForSource({ url: "https://www.spd.de/x" }) === "mittel");
  const sum = safety.summarizeSources([{ type: "media", url: "https://tagesschau.de" }, { type: "committee", url: "https://bundestag.de" }]);
  check("Kategorien-Summary: zaehlt medien + offiziell", sum.byCategory.medien === 1 && sum.byCategory.offiziell === 1);
})();

// =========================== 6) Source Safety Guard ==========================
(function guard() {
  // Link-Sicherheit
  check("Link: bit.ly -> Verkuerzer/blockiert", safety.assessLink("https://bit.ly/abc").blocked === true);
  check("Link: http (kein https) -> markiert", safety.assessLink("http://unbekannt-xyz.tld/a").https === false);
  // Kritische Claims
  check("Claim: 'ist tot' -> kritisch (tod)", safety.detectCriticalClaim("Politiker X ist tot aufgefunden").isCritical);
  check("Claim: normale Reform -> nicht kritisch", !safety.detectCriticalClaim("Bundesregierung legt Rentenreform vor").isCritical);

  const criticalKo = { display_title: "Abgeordneter Y zurückgetreten", was_ist_passiert: "Rücktritt gemeldet." };
  const normalKo = { display_title: "Eckpunkte zur Pflegereform", was_ist_passiert: "BMG legt Eckpunkte vor." };

  // Normaler Inhalt aus unbekannter (nicht gesperrter) HTTPS-Quelle -> erlaubt.
  check("Guard: normaler Inhalt, unbekannte HTTPS-Quelle -> ok",
    safety.guardKnowledgeObject(normalKo, [{ url: "https://kleine-lokalzeitung-xyz.tld/a" }]).status === "ok");

  // Kritischer Claim aus EINER unbekannten Quelle -> Quarantaene.
  check("Guard: kritischer Claim, einzelne unbekannte Quelle -> Quarantaene",
    safety.guardKnowledgeObject(criticalKo, [{ url: "https://scam-news-xyz.tld/a" }]).status === "quarantine");

  // Kritischer Claim, bestaetigt durch offizielle Quelle -> ok.
  check("Guard: kritischer Claim + offizielle Quelle -> ok (bestaetigt)",
    safety.guardKnowledgeObject(criticalKo, [{ url: "https://www.bundestag.de/meldung", source_type: "bundestag" }]).status === "ok");

  // Kritischer Claim, bestaetigt durch 2 unabhaengige Medien -> ok.
  check("Guard: kritischer Claim + 2 vertrauenswuerdige Medien -> ok",
    safety.guardKnowledgeObject(criticalKo, [{ url: "https://www.tagesschau.de/a" }, { url: "https://www.spiegel.de/b" }]).status === "ok");

  // Kritischer Claim, nur EINE Medienquelle -> Quarantaene (nicht bestaetigt).
  check("Guard: kritischer Claim + nur 1 Medium -> Quarantaene",
    safety.guardKnowledgeObject(criticalKo, [{ url: "https://www.tagesschau.de/a" }]).status === "quarantine");

  // Alle Quellen blockiert -> Quarantaene (auch nicht-kritisch).
  process.env.HELMUT_SOURCE_BLOCKLIST = "boese-domain.tld";
  check("Guard: alle Quellen blockiert -> Quarantaene",
    safety.guardKnowledgeObject(normalKo, [{ url: "https://boese-domain.tld/a" }]).status === "quarantine");
  delete process.env.HELMUT_SOURCE_BLOCKLIST;

  // partitionBySafety
  const part = safety.partitionBySafety([normalKo, criticalKo], (ko) => ko === criticalKo ? [{ url: "https://scam-xyz.tld/a" }] : [{ url: "https://www.tagesschau.de/a" }]);
  check("partitionBySafety: trennt erlaubt/quarantaene korrekt", part.allowed.length === 1 && part.quarantined.length === 1);
})();

// ============= 5) Geteilter Quellenkatalog: SaaS-Entkopplung =================
// Der geteilte Katalog (getSources) wird PROFILBASIERT gefiltert: neutrale Basis
// fuer jedes Mandat, sozial-/partei-/regional-gebundene Quellen NUR bei passendem
// Profil. Kein Sozialthema und keine Person ist Produktstandard.
async function catalogDecoupling() {
  const sources = require("../lib/helmut/sources");
  const themed = (srcs) => srcs.filter((s) => s.neutral === false);
  const socialThemed = (srcs) => srcs.filter((s) => s.neutral === false && !s.regional && !s.party && Array.isArray(s.themeTerms));
  const idset = (srcs) => new Set(srcs.map((s) => s.id));

  // (a) Verteidigungspolitiker (kein Sozialprofil): KEINE Sozialquellen als Standard.
  const defense = {
    id: "vt-mdb", fullName: "V Teidiger", party: "CDU", parliamentType: "Bundestag",
    committee: "Verteidigungsausschuss", committees: ["Verteidigungsausschuss"],
    focusTopics: ["Verteidigung", "Bundeswehr", "NATO"], relevantMinistries: ["BMVg"]
  };
  const dSrc = await scheduler.getSourcesForProfile(defense);
  const dIds = idset(dSrc);
  check("Katalog: Verteidigungsprofil bekommt 0 sozial-thematische Quellen", socialThemed(dSrc).length === 0, `themed=${JSON.stringify(themed(dSrc).map((s) => s.id))}`);
  check("Katalog: Verteidigungsprofil OHNE BMAS/DGB/Ausschuss-Arbeit-Soziales", !dIds.has("bmas") && !dIds.has("dgb") && !dIds.has("ausschuss-arbeit-soziales"));
  check("Katalog: Verteidigungsprofil OHNE Partei-Fremdquellen (Die Linke)", themed(dSrc).filter((s) => s.party).length === 0);
  check("Katalog: neutrale Basis vorhanden (Bundestag + Verteidigungsausschuss)", dIds.has("bundestag") && dSrc.some((s) => s.type === "committee"));
  check("Katalog: Medien bleibt eigene Quellen-Kategorie (neben offiziell)", dSrc.some((s) => s.category === "medien") && dSrc.some((s) => s.category === "offiziell"));

  // (b) Cem als normaler Account mit Sozialprofil: bekommt Sozialthemen WEITERHIN.
  delete process.env.HELMUT_AUTH_MODE;
  const cem = scheduler.mergeProfileDefaults({ id: "cem-ince" });
  const cSrc = await scheduler.getSourcesForProfile(cem);
  const cIds = idset(cSrc);
  check("Katalog: Cem (Sozialprofil) bekommt sozial-thematische Quellen", socialThemed(cSrc).length > 0);
  check("Katalog: Cem bekommt BMAS + DGB (Profil traegt Arbeit und Soziales)", cIds.has("bmas") && cIds.has("dgb"));
  check("Katalog: Cem bekommt regionale Quellen (Niedersachsen/Salzgitter)", themed(cSrc).some((s) => s.regional && /niedersachsen|salzgitter|wolfenb/i.test(s.name)));

  // (c) Landtag Bayern: nutzt state/Region, KEINE Sozialquellen als Standard.
  const landtag = {
    id: "by-mdl", fullName: "Max Bayer", party: "CSU", parliamentType: "Landtag",
    state: "Bayern", regionalInterests: ["München"], focusTopics: ["Verkehr"]
  };
  const lSrc = await scheduler.getSourcesForProfile(landtag);
  const lblob = JSON.stringify(lSrc.map((s) => ({ n: s.name, q: s.queryTerms }))).toLowerCase();
  check("Katalog: Landtag Bayern nutzt state/Region (Bayern in Profilquellen)", lblob.includes("bayern"));
  check("Katalog: Landtag Bayern ohne Sozialquellen als Standard", socialThemed(lSrc).length === 0);
  check("Katalog: Landtag Bayern erbt KEINE Fremd-Region (Salzgitter/Braunschweig)", !themed(lSrc).some((s) => /salzgitter|braunschweig|wolfenb/i.test(s.name)));

  // (d) Unvollstaendiges Profil (Account-Modus): NUR neutrale Basis, kein fremder Fallback.
  process.env.HELMUT_AUTH_MODE = "accounts";
  const empty = scheduler.mergeProfileDefaults({ id: "leer-mdb" });
  const eSrc = await scheduler.getSourcesForProfile(empty);
  check("Katalog: unvollstaendiges Profil -> nur neutrale Basis (0 thematisch)", themed(eSrc).length === 0);
  check("Katalog: unvollstaendiges Profil -> KEINE Personenquelle als Standard", !eSrc.some((s) => s.type === "person"));
  check("Katalog: unvollstaendiges Profil -> trotzdem neutrale Institutionen", eSrc.some((s) => s.category === "offiziell"));
  delete process.env.HELMUT_AUTH_MODE;

  // (e) Die-Linke-Profil bekommt seine Fraktionsquellen (Partei-Gating funktioniert).
  const linke = { id: "linke-mdb", fullName: "L Inke", party: "Die Linke", faction: "Die Linke", parliamentType: "Bundestag", focusTopics: ["Frieden"] };
  const linkeSrc = await scheduler.getSourcesForProfile(linke);
  check("Katalog: Die-Linke-Profil bekommt Linke-Parteiquellen (Partei-Gating)", themed(linkeSrc).some((s) => s.party === "Die Linke"));

  // (f) Katalog-Qualitaet (Admin Datenstatus nutzt genau dieses summarizeSources):
  //     Medien ist eine eigene, gezaehlte Kategorie neben offiziell.
  const summary = safety.summarizeSources(sources.v1Sources);
  check("Admin: Quellen-Summary zaehlt Medien als eigene Kategorie", summary.byCategory.medien > 0 && summary.byCategory.offiziell > 0);
  check("Admin: Quellen-Summary liefert Vertrauensstufen (hoch vorhanden)", summary.byTrust.hoch > 0);
}

// ================================ Zusammenfassung ============================
catalogDecoupling().then(() => {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} SaaS-Foundation-Checks bestanden.`);
  if (failed.length) { console.error("FEHLGESCHLAGEN:\n" + failed.map((f) => " - " + f.name).join("\n")); process.exit(1); }
  process.exit(0);
}).catch((err) => { console.error("TESTLAUF-FEHLER:", err && err.stack || err); process.exit(1); });
