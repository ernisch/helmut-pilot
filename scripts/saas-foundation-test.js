#!/usr/bin/env node
"use strict";

// SaaS Data Trust Foundation — Offline-Checks fuer den Sprint:
//   1) KEINE Personen-Fallbacks mehr: mergeProfileDefaults ist fuer JEDE ID
//      neutral (kein Demo-/Pilotprofil), fehlender Mandantenkontext blockiert.
//   2) Ingestion profilbasiert (keine harten Personen-/Partei-/Ministeriums-Standards).
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
const { testPoliticianOne } = require("./fixtures/test-profiles");

// ===================== 1) Schreibpfad: neutrale Defaults =====================
// INVERTIERT gegenueber dem alten Pilot-Verhalten: NIEMAND erbt mehr reiche
// Demo-Defaults. mergeProfileDefaults liefert fuer JEDE ID dasselbe neutrale
// Geruest — unabhaengig vom Auth-Modus. Eine fehlende id wird NIE erfunden.
(function gating() {
  delete process.env.HELMUT_AUTH_MODE;
  const anyTenant = scheduler.mergeProfileDefaults({ id: "test-politician-one" });
  check("Neutral: KEINE Sonder-Defaults fuer irgendeine ID (committee leer)", !anyTenant.committee, JSON.stringify(anyTenant.committee));
  check("Neutral: KEINE geerbten Themen (focusTopics leer)", (anyTenant.focusTopics || []).length === 0);
  check("Neutral: id bleibt erhalten", anyTenant.id === "test-politician-one");

  // Auch im Account-Modus: identisch neutral (kein Modus-Sonderfall mehr).
  process.env.HELMUT_AUTH_MODE = "accounts";
  const acct = scheduler.mergeProfileDefaults({ id: "test-politician-one" });
  check("Account-Modus: identisch neutral (committee leer)", !acct.committee, JSON.stringify(acct.committee));
  check("Account-Modus: identisch neutral (focusTopics leer)", (acct.focusTopics || []).length === 0);

  const acctIdless = scheduler.mergeProfileDefaults({ fullName: "Neu Ohne Id" });
  check("id-loses Profil: keine Sonder-Defaults", !acctIdless.committee && (acctIdless.focusTopics || []).length === 0);
  check("id-loses Profil: id wird NIE erfunden (bleibt leer)", acctIdless.id === "");

  const gruene = scheduler.mergeProfileDefaults({ id: "gruene-mdb", fullName: "Anna Muster", party: "Grüne", committee: "Umweltausschuss", focusTopics: ["Klimaschutz"] });
  check("Profil behaelt eigene Werte, erbt keine fremden Themen", gruene.committee === "Umweltausschuss" && !contains(JSON.stringify(gruene.focusTopics), "Bürgergeld"));
  delete process.env.HELMUT_AUTH_MODE;
})();

// ================ 1b) Fehlender Mandantenkontext blockiert hart ==============
// Es gibt keinen Standardmandanten mehr: mandantsbezogene Pfade brechen ohne
// explizite politicianId mit TenantContextError ab, statt still zu raten.
async function tenantContextGuard() {
  const expectTenantError = async (name, fn) => {
    try {
      await fn();
      check(name, false, "kein Fehler geworfen");
    } catch (err) {
      check(name, err && err.name === "TenantContextError", err && `${err.name}: ${err.message}`);
    }
  };
  await expectTenantError("Kontext: getActiveProfile ohne id -> TenantContextError", () => scheduler.getActiveProfile(""));
  await expectTenantError("Kontext: runSourceCrawl ohne id -> TenantContextError", () => scheduler.runSourceCrawl());
  await expectTenantError("Kontext: runLageCheck ohne id -> TenantContextError", () => scheduler.runLageCheck());
}

// ======================= 2)+3) Profilbasierte Ingestion =======================
(function ingestion() {
  const gruene = {
    id: "gruene-mdb", fullName: "Anna Muster", party: "Grüne", faction: "Bündnis 90/Die Grünen",
    committee: "Umweltausschuss", committees: ["Umweltausschuss"], focusTopics: ["Klimaschutz", "Energie"],
    relevantMinistries: ["BMUV"], politicalLevel: "Bund"
  };
  const sources = scheduler.mandateNewsSources(gruene);
  const blob = JSON.stringify(sources);
  // Begriffe des frueheren, hartkodierten Sozial-Seed-Profils: duerfen fuer ein
  // fremdes Profil NIRGENDS auftauchen (kein Produktstandard mehr).
  const fremdTerms = ["Die Linke", "BMAS", "Arbeit und Soziales", "Bürgergeld", "Mindestlohn", "Tarifbindung"];
  const leaked = fremdTerms.filter((t) => contains(blob, t));
  check("Ingestion: KEINE harten Sozial-/Partei-/Ministeriums-Begriffe fuer fremdes Profil", leaked.length === 0, leaked.join(", "));
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

  // topProfileTopics: es gibt KEINE Standardthemen mehr — fuer keine ID, in
  // keinem Modus. Themen kommen ausschliesslich aus dem eigenen Profil.
  delete process.env.HELMUT_AUTH_MODE;
  const idOnlyTopics = scheduler.topProfileTopics({ id: "test-politician-one" }, 5);
  check("Themen: nackte ID erhaelt KEINE Standardthemen (Pilot-Sonderfall entfernt)", idOnlyTopics.length === 0, idOnlyTopics.join(","));
  process.env.HELMUT_AUTH_MODE = "accounts";
  const acctIdOnlyTopics = scheduler.topProfileTopics({ id: "test-politician-one" }, 5);
  check("Themen: auch im Account-Modus KEINE Standardthemen", acctIdOnlyTopics.length === 0, acctIdOnlyTopics.join(","));
  const ownTopics = scheduler.topProfileTopics(testPoliticianOne, 5);
  check("Themen: volles Profil bekommt NUR seine eigenen Themen", ownTopics.length === 5 && ownTopics.every((t) => testPoliticianOne.focusTopics.includes(t) || t in testPoliticianOne.topicPriorities), ownTopics.join(","));
  const foreignTopics = scheduler.topProfileTopics({ id: "gruene-mdb", focusTopics: ["Klima"] }, 5);
  check("Themen: fremdes Profil bekommt NUR eigene Themen", foreignTopics.length === 1 && foreignTopics[0] === "Klima");
  const emptyTopics = scheduler.topProfileTopics({ id: "leer-mdb" }, 5);
  check("Themen: Profil ohne Themen -> leer (KEIN Fallback)", emptyTopics.length === 0);
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

  // (b) Sozialprofil (zentrale Fixture, als GESPEICHERTES Profil uebergeben):
  //     bekommt Sozialthemen WEITERHIN — aus dem eigenen Profil, nicht als Default.
  delete process.env.HELMUT_AUTH_MODE;
  const social = scheduler.mergeProfileDefaults(testPoliticianOne);
  const cSrc = await scheduler.getSourcesForProfile(social);
  const cIds = idset(cSrc);
  check("Katalog: Sozialprofil bekommt sozial-thematische Quellen", socialThemed(cSrc).length > 0);
  check("Katalog: Sozialprofil bekommt BMAS + DGB (Profil traegt Arbeit und Soziales)", cIds.has("bmas") && cIds.has("dgb"));
  check("Katalog: Sozialprofil bekommt regionale Quellen (Niedersachsen aus Profil)", themed(cSrc).some((s) => s.regional && /niedersachsen/i.test(s.name)));
  // Gegenprobe: die NACKTE ID des Fixtures (ohne gespeichertes Profil) bekommt
  // NICHTS davon — beweist, dass die Quellen aus dem Profil kommen, nicht aus der ID.
  const bareId = scheduler.mergeProfileDefaults({ id: testPoliticianOne.id });
  const bareSrc = await scheduler.getSourcesForProfile(bareId);
  check("Katalog: nackte ID ohne Profildaten -> KEINE Sozial-/Regionalquellen", themed(bareSrc).length === 0, `themed=${themed(bareSrc).length}`);

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

  // (d) Unvollstaendiges Profil: NUR neutrale Basis, kein fremder Fallback —
  //     modusunabhaengig (der fruehere Modus-Sonderfall existiert nicht mehr).
  const empty = scheduler.mergeProfileDefaults({ id: "leer-mdb" });
  const eSrc = await scheduler.getSourcesForProfile(empty);
  check("Katalog: unvollstaendiges Profil -> nur neutrale Basis (0 thematisch)", themed(eSrc).length === 0);
  check("Katalog: unvollstaendiges Profil -> KEINE Personenquelle als Standard", !eSrc.some((s) => s.type === "person"));
  check("Katalog: unvollstaendiges Profil -> trotzdem neutrale Institutionen", eSrc.some((s) => s.category === "offiziell"));

  // (e) Die-Linke-Profil bekommt seine Fraktionsquellen (Partei-Gating funktioniert).
  const linke = { id: "linke-mdb", fullName: "L Inke", party: "Die Linke", faction: "Die Linke", parliamentType: "Bundestag", focusTopics: ["Frieden"] };
  const linkeSrc = await scheduler.getSourcesForProfile(linke);
  check("Katalog: Die-Linke-Profil bekommt Linke-Parteiquellen (Partei-Gating)", themed(linkeSrc).some((s) => s.party === "Die Linke"));

  // (f) Katalog-Qualitaet (Admin Datenstatus nutzt genau dieses summarizeSources):
  //     Medien ist eine eigene, gezaehlte Kategorie neben offiziell.
  const summary = safety.summarizeSources(sources.v1Sources);
  check("Admin: Quellen-Summary zaehlt Medien als eigene Kategorie", summary.byCategory.medien > 0 && summary.byCategory.offiziell > 0);
  check("Admin: Quellen-Summary liefert Vertrauensstufen (hoch vorhanden)", summary.byTrust.hoch > 0);

  // (g) Wortgrenzen-Theme-Matching: Sozialquellen duerfen NICHT durch zufaellige
  //     Wortbestandteile ausgeloest werden (Fix aus dem Read-Only-Review).
  const socialProbeIds = ["bmas", "dgb", "ausschuss-arbeit-soziales", "news-deutsche-rentenversicherung", "news-arbeitsagentur"];
  const hasAnySocial = (src) => { const s = idset(src); return socialProbeIds.some((id) => s.has(id)) || socialThemed(src).length > 0; };
  const mkProfile = (label, topics, extra = {}) => ({ id: `wb-${label}`, fullName: `WB ${label}`, party: "Grüne", parliamentType: "Bundestag", focusTopics: topics, ...extra });

  const kultur = await scheduler.getSourcesForProfile(mkProfile("kultur", ["Denkmalpflege"], { committee: "Kultur und Medien" }));
  check("Wortgrenze: Kulturprofil 'Denkmalpflege' -> 0 Sozialquellen (kein BMAS/DGB/Rente)", !hasAnySocial(kultur), `soz=${socialThemed(kultur).length}`);

  const umwelt = await scheduler.getSourcesForProfile(mkProfile("umwelt", ["Landschaftspflege", "Gewässerpflege", "Gartenpflege"], { committee: "Umwelt" }));
  check("Wortgrenze: Umweltprofil 'Landschaftspflege' -> 0 Sozialquellen", !hasAnySocial(umwelt), `soz=${socialThemed(umwelt).length}`);

  const digital = await scheduler.getSourcesForProfile(mkProfile("digital", ["IT", "Digitalisierung"], { committee: "Digitales" }));
  check("Wortgrenze: Digitalprofil 'IT' -> 0 Sozialquellen (nicht ueber 'Arbeitszeit')", !hasAnySocial(digital), `soz=${socialThemed(digital).length}`);

  const echtPflege = await scheduler.getSourcesForProfile(mkProfile("pflege", ["Pflege", "Pflegeversicherung", "Altenpflege"], { committee: "Gesundheit", party: "SPD" }));
  check("Wortgrenze: echtes Pflegeprofil 'Pflege/Pflegeversicherung' -> bekommt Sozialquellen", socialThemed(echtPflege).length > 0 && idset(echtPflege).has("bmas"));

  const haushalt = await scheduler.getSourcesForProfile(mkProfile("haushalt", ["Bundeshaushalt", "Schuldenbremse", "Steuern"], { committee: "Haushaltsausschuss", party: "FDP", relevantMinistries: ["BMF"] }));
  check("Wortgrenze: Haushaltspolitiker -> weiterhin 0 Sozialquellen", !hasAnySocial(haushalt), `soz=${socialThemed(haushalt).length}`);
  // Verteidigung (aus (a)) bleibt sauber:
  check("Wortgrenze: Verteidigungsprofil -> weiterhin 0 Sozialquellen", !hasAnySocial(dSrc));
  // Sozialprofil (aus (b)) bleibt funktionsfaehig:
  check("Wortgrenze: Sozialprofil bekommt weiterhin passende Sozialquellen aus Profil", socialThemed(cSrc).length > 0 && cIds.has("bmas"));
}

// ================================ Zusammenfassung ============================
tenantContextGuard().then(catalogDecoupling).then(() => {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} SaaS-Foundation-Checks bestanden.`);
  if (failed.length) { console.error("FEHLGESCHLAGEN:\n" + failed.map((f) => " - " + f.name).join("\n")); process.exit(1); }
  process.exit(0);
}).catch((err) => { console.error("TESTLAUF-FEHLER:", err && err.stack || err); process.exit(1); });
