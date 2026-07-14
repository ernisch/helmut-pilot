"use strict";

// Tests fuer Sprint 9 (inkl. Korrekturen 1+2): Quellenkandidaten Berlin & Brandenburg.
// Reine Offline-Tests der Seed-Daten. Prueft:
//  - Klassenabdeckung (alle 15 Klassen im Modul; besetzt vs. bewusst unbesetzt),
//  - dass NICHTS aktiviert/verifiziert/einsatzbereit ist (Reifegrad-Modell),
//  - Korrektur 1: KEIN SPD-Ausweich fuer BB fraktion_pilot/person_pilot (bleiben unbesetzt),
//  - Ehrlichkeit (verifyBeforeActivation, WebSearch-belegt), rbb-Dedup, abgelehnte Kandidaten.

const k = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-kandidaten");
const { LANDESMODUL_PFLICHTKLASSEN } = require("../lib/helmut/quellenarchitektur/seeds/packages");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

const be = k.BERLIN_KANDIDATEN, bb = k.BRANDENBURG_KANDIDATEN;
const beByKlasse = Object.fromEntries(be.map((c) => [c.klasse, c]));
const bbByKlasse = Object.fromEntries(bb.map((c) => [c.klasse, c]));
const alle = [...be, ...bb];
const besetzt = alle.filter((c) => c.readiness !== "unbesetzt");
const unbesetzt = alle.filter((c) => c.readiness === "unbesetzt");

console.log("== Klassenabdeckung (alle 15 Klassen im Modul) ==");
check("Berlin enthält alle 15 Pflichtklassen", LANDESMODUL_PFLICHTKLASSEN.every((c) => beByKlasse[c]) && be.length === 15);
check("Brandenburg enthält alle 15 Pflichtklassen", LANDESMODUL_PFLICHTKLASSEN.every((c) => bbByKlasse[c]) && bb.length === 15);
check("keine unbekannte Klasse (nur die 15 Pflichtklassen)", alle.every((c) => LANDESMODUL_PFLICHTKLASSEN.includes(c.klasse)));
check("Berlin: 15 Klassen mit Kandidat besetzt, 0 unbesetzt", be.filter((c) => c.readiness !== "unbesetzt").length === 15);
check("Brandenburg: 13 besetzt + 2 unbesetzt", bb.filter((c) => c.readiness !== "unbesetzt").length === 13 && bb.filter((c) => c.readiness === "unbesetzt").length === 2);

console.log("== Reifegrad (Kandidat != einsatzbereit) ==");
const sum = k.candidateSummary();
check("candidateSummary: aktiviert === 0", sum.aktiviert === 0);
check("candidateSummary: verifiziert === 0", sum.verifiziert === 0);
check("candidateSummary: einsatzbereit === 0", sum.einsatzbereit === 0);
check("candidateSummary: status 'prepared'", sum.status === "prepared");
check("JEDER besetzte Kandidat ist Reifegrad 'kandidat' (nichts verifiziert/bereit/aktiv)", besetzt.every((c) => c.readiness === "kandidat"));
check("Reifegrad-Skala geordnet: unbesetzt < kandidat < verifiziert < bereit < aktiv", k.READINESS_RANG.unbesetzt < k.READINESS_RANG.kandidat && k.READINESS_RANG.kandidat < k.READINESS_RANG.verifiziert && k.READINESS_RANG.verifiziert < k.READINESS_RANG.bereit && k.READINESS_RANG.bereit < k.READINESS_RANG.aktiv);
check("readinessByGeography: Berlin 15 Kandidat / 0 einsatzbereit", k.readinessByGeography()["geo-land-berlin"].kandidat === 15 && k.readinessByGeography()["geo-land-berlin"].einsatzbereit === 0);
check("readinessByGeography: Brandenburg 13 Kandidat / 2 unbesetzt / 0 einsatzbereit", (() => { const r = k.readinessByGeography()["geo-land-brandenburg"]; return r.kandidat === 13 && r.unbesetzt === 2 && r.einsatzbereit === 0; })());
check("KEIN Kandidat trägt Aktiv-/Enabled-Flag", alle.every((c) => !("active" in c) && !("enabled" in c) && !("activation_mode" in c)));

console.log("== Korrektur 1: KEIN Partei-/Personen-Ersatz in Brandenburg ==");
check("BB fraktion_pilot ist UNBESETZT (kein Publisher)", bbByKlasse.fraktion_pilot.readiness === "unbesetzt" && bbByKlasse.fraktion_pilot.publisher === null && bbByKlasse.fraktion_pilot.url === null);
check("BB person_pilot ist UNBESETZT (kein Publisher)", bbByKlasse.person_pilot.readiness === "unbesetzt" && bbByKlasse.person_pilot.publisher === null);
check("BB fraktion_pilot/person_pilot recommendation = 'offen'", bbByKlasse.fraktion_pilot.recommendation === "offen" && bbByKlasse.person_pilot.recommendation === "offen");
check("KEIN besetzter BB-Pilot (_pilot) nennt SPD als Ersatz", !bb.some((c) => c.readiness !== "unbesetzt" && c.klasse.endsWith("_pilot") && /\bspd\b/i.test(c.publisher || "")));
check("KEINE Ersatzperson (Lüttmann/Björn) in einem besetzten BB-Eintrag", bb.every((c) => c.readiness === "unbesetzt" || !/lüttmann|luettmann|björn|bjoern/i.test(c.publisher || "")));
check("BB partei_pilot = Die Linke Brandenburg (Partei darf beobachtet werden)", bbByKlasse.partei_pilot.readiness === "kandidat" && /die linke/i.test(bbByKlasse.partei_pilot.publisher));
check("BB landesfraktionen nennt die 4 realen Fraktionen SPD/AfD/CDU/BSW (allgemeines Paket)", ["SPD","AfD","CDU","BSW"].every((f) => bbByKlasse.landesfraktionen.publisher.includes(f)) && bbByKlasse.landesfraktionen.readiness === "kandidat");
// Berlin behaelt die saubere Die-Linke-Pilotlinie (Linke sitzt im Abgeordnetenhaus)
check("Berlin partei_pilot = Die Linke Berlin", /die linke/i.test(beByKlasse.partei_pilot.publisher));
check("Berlin fraktion_pilot = Linksfraktion (besetzt)", /linksfraktion/i.test(beByKlasse.fraktion_pilot.publisher) && beByKlasse.fraktion_pilot.readiness === "kandidat");
check("Berlin person_pilot besetzt (Tobias Schulze, Linke)", /tobias schulze/i.test(beByKlasse.person_pilot.publisher));

console.log("== Ehrlichkeit (Recherche-Vorbehalt) — nur besetzte ==");
check("JEDER besetzte Kandidat: verifyBeforeActivation=true (byte-genau prüfen)", besetzt.every((c) => c.verifyBeforeActivation === true));
check("UNBESETZTE Klassen: verifyBeforeActivation=false (nichts zu verifizieren)", unbesetzt.every((c) => c.verifyBeforeActivation === false));
check("UNBESETZTE Klassen: method/cost/url/publisher/domain konsequent null", unbesetzt.every((c) => c.method === null && c.cost === null && c.url === null && c.publisher === null && c.domain === null));
check("jeder besetzte Kandidat hat konkrete URL + Methode + Herausgeber", besetzt.every((c) => /^https?:\/\//.test(c.url) && c.method && c.publisher));
const validMethods = ["rss", "opendata_xml", "api_xml", "googlenews_search", "html"];
check("nur bekannte Abrufmethoden (besetzte)", besetzt.every((c) => validMethods.includes(c.method)));
check("nur bekannte Empfehlungswerte (besetzt: empfohlen/mit_einschraenkung; unbesetzt: offen)", besetzt.every((c) => ["empfohlen", "mit_einschraenkung"].includes(c.recommendation)) && unbesetzt.every((c) => c.recommendation === "offen"));

console.log("== Dedup / Überschneidung ==");
check("rbb24 ist DERSELBE Feed für Berlin und Brandenburg (dedup)", beByKlasse.oer_landesberichterstattung.url === bbByKlasse.oer_landesberichterstattung.url && /rbb24/.test(beByKlasse.oer_landesberichterstattung.url));
check("schriftliche_anfragen = dieselbe Rohquelle wie drucksachen (Teilmenge, nicht doppelt)", beByKlasse.schriftliche_anfragen.url === beByKlasse.drucksachen.url && bbByKlasse.schriftliche_anfragen.url === bbByKlasse.drucksachen.url);
check("schriftliche_anfragen ist Filter derselben Rohquelle (hoher duplicateRisk, nicht separat crawlen)", beByKlasse.schriftliche_anfragen.duplicateRisk === "hoch" && bbByKlasse.schriftliche_anfragen.duplicateRisk === "hoch" && /Filter|nicht.*doppelt/i.test(beByKlasse.schriftliche_anfragen.note));
check("Dedup-Hinweise dokumentiert (rbb, Open-Data-Korpus, Landespressedienst)", k.DEDUP_HINWEISE.length >= 3 && k.DEDUP_HINWEISE.some((h) => /rbb24/.test(h)));

console.log("== Abgelehnte Kandidaten (mit Grund) ==");
check("mind. 5 abgelehnte Kandidaten mit Grund", k.ABGELEHNTE_KANDIDATEN.length >= 5 && k.ABGELEHNTE_KANDIDATEN.every((a) => a.grund && a.kandidat && a.klasse));
check("MAZ-Direkt-RSS abgelehnt (Paywall/kein Feed)", k.ABGELEHNTE_KANDIDATEN.some((a) => /MAZ/i.test(a.kandidat) && /paywall|kein.*feed|rss/i.test(a.grund)));
check("BB regionale_leitmedien nutzt googlenews (MAZ-Ersatz)", bbByKlasse.regionale_leitmedien.method === "googlenews_search");
check("SPD-Fraktion als BB-Pilot-Ersatz ABGELEHNT (kein Partei-Ersatz)", k.ABGELEHNTE_KANDIDATEN.some((a) => /spd-fraktion/i.test(a.kandidat) && a.klasse === "fraktion_pilot"));
check("SPD-Person (Lüttmann) als BB-Pilot-Ersatz ABGELEHNT (kein Personen-Ersatz)", k.ABGELEHNTE_KANDIDATEN.some((a) => a.klasse === "person_pilot" && /spd|lüttmann|luettmann/i.test(a.kandidat)));
check("linksfraktion-brandenburg als aktive Fraktion abgelehnt (Linke nicht im Landtag 8. WP)", k.ABGELEHNTE_KANDIDATEN.some((a) => /linksfraktion.brandenburg/i.test(a.kandidat) && /8\. WP|nicht.*Landtag/i.test(a.grund)));
check("GVBl/BRAVORS als eigener Feed abgelehnt (kein RSS)", k.ABGELEHNTE_KANDIDATEN.some((a) => /gvbl|bravors|gesetze\.berlin/i.test(a.kandidat)));

console.log("== Empfehlungslage (technisch geprüft, nur besetzte) ==");
check("Berlin: 8 empfohlen + 7 mit_einschraenkung (technische Prüfung)", sum.berlin.empfohlen === 8 && sum.berlin.mitEinschraenkung === 7);
check("Brandenburg: 7 empfohlen + 6 mit_einschraenkung", sum.brandenburg.empfohlen === 7 && sum.brandenburg.mitEinschraenkung === 6);
check("Brandenburg Kandidatenabdeckung 13/15 (2 Pilotklassen unbesetzt)", sum.brandenburg.klassenAbgedeckt === 13 && sum.brandenburg.unbesetzt === 2);
check("Brandenburg klassenFehlend = genau die 2 unbesetzten Pilotklassen", sum.brandenburg.klassenFehlend.length === 2 && sum.brandenburg.klassenFehlend.includes("fraktion_pilot") && sum.brandenburg.klassenFehlend.includes("person_pilot"));
check("Berlin klassenFehlend leer (alle 15 besetzt)", sum.berlin.klassenFehlend.length === 0);
check("Reifegrad-Rollup: keine 'unknown' (alle readiness-Werte gültig)", sum.berlin.readiness.unknown === 0 && sum.brandenburg.readiness.unknown === 0);
check("landReadiness.hoechsteStufe = 'kandidat' (besetzte vorhanden)", k.landReadiness(bb).hoechsteStufe === "kandidat" && k.landReadiness(be).hoechsteStufe === "kandidat");
check("landReadiness leere Liste -> hoechsteStufe 'unbesetzt' (nicht 'kandidat')", k.landReadiness([]).hoechsteStufe === "unbesetzt");
check("überwiegend RSS/Open-Data (nicht scrape-lastig)", (sum.berlin.methoden.rss + (sum.berlin.methoden.opendata_xml || 0)) >= 12);

console.log("== Technische Prüfung (Sprint-9-Vertiefung) ==");
check("jeder besetzte Kandidat trägt evidenceRole + produktnutzen + stabileAdresse", besetzt.every((c) => ["official_primary","direct_interest","journalistic","data_source","aggregator"].includes(c.evidenceRole) && ["hoch","mittel","niedrig"].includes(c.produktnutzen) && typeof c.stabileAdresse === "boolean"));
check("URL-KORREKTUR Brandenburg: exportWP8.xml (8. WP), NICHT exportWP1.xml", ["plenum","drucksachen","schriftliche_anfragen","gesetzgebung"].every((kl) => /exportWP8\.xml$/.test(bbByKlasse[kl].url)) && !bb.some((c) => /exportWP1\.xml/.test(c.url || "")));
check("URL-PRÄZISIERUNG Berlin Open-Data: pardok-wp19.xml (Deep-Link, nicht Landingpage)", ["plenum","drucksachen","schriftliche_anfragen","gesetzgebung"].every((kl) => /opendata\/pardok-wp19\.xml$/.test(beByKlasse[kl].url)));
check("URL-PRÄZISIERUNG Berlin LPD-Feed: index/feed (nicht /presse/ oder /sen/)", /pressemitteilungen\/index\/feed/.test(beByKlasse.landesregierung.url) && !/\/sen\/$/.test(beByKlasse.ministerien.url));
check("abgelehnt: berlin.de/sen/ + fraktionen-Landing + OParl + exportWP1 dokumentiert", ["/sen/","das-parlament/fraktionen","OParl","exportWP1"].every((n) => k.ABGELEHNTE_KANDIDATEN.some((a) => (a.kandidat + a.grund).includes(n))));
check("Berlin partei_pilot Domain dielinke.berlin OHNE www", beByKlasse.partei_pilot.domain === "dielinke.berlin");

console.log("== Vorbereitete Struktur (landesmodule-quellen) ==");
const q = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const seed = q.buildLandesmodulSeed();
check("Struktur status 'prepared', 0 aktive Abrufwege", seed.summary.status === "prepared" && seed.summary.aktiveAbrufwege === 0);
check("ALLE Abrufwege status='needs_review' + activation_mode='manual' (technisch inaktiv)", seed.retrievalPaths.every((p) => p.status === "needs_review" && p.activation_mode === "manual"));
check("Dedup: weniger Abrufwege (19) als besetzte Kandidaten (28)", seed.retrievalPaths.length === 19 && seed.retrievalPaths.length < 28);
check("rbb24 GLOBAL dedup: ein Abrufweg, zwei Paketreferenzen (BE+BB)", seed.summary.rbb24GlobalDedup && seed.packagePaths.filter((pp) => pp.retrieval_path_id === "rp-rbb24-politik").length === 2);
check("Berlin PARDOK-Rohquelle deckt 4 Klassen ab (2/4/5/6)", (() => { const p = seed.retrievalPaths.find((x) => x.url.includes("pardok-wp19")); return p && p.covers.length === 4; })());
check("Paketzuordnungen nur zu berlin-basis/brandenburg-basis", seed.packagePaths.every((pp) => ["pkg-berlin-basis","pkg-brandenburg-basis"].includes(pp.package_id)));
check("politische Ebene 'land' + Geografie je Abrufweg gesetzt", seed.pathExpectedLevels.every((l) => l.level === "land") && seed.pathExpectedGeographies.every((g) => ["geo-land-berlin","geo-land-brandenburg"].includes(g.geography_id)));
check("neue Entitäten Landespartei/Fraktion/Person (nicht Bundes-Duplikate)", seed.entities.some((e) => e.id === "party-linke-berlin") && seed.entities.some((e) => e.id === "person-tobias-schulze") && seed.entities.some((e) => e.id === "party-linke-brandenburg"));

console.log("== Defekte Bundeswege — Reparaturen ==");
const rep = require("../lib/helmut/quellenarchitektur/seeds/bundeswege-reparaturen");
const rs = rep.reparaturSummary();
check("6 defekte Bundeswege dokumentiert", rep.BUNDESWEG_REPARATUREN.length === 6);
// 9B (echter Abruf): 3 repariert (bundestag/linksfraktion/ausschuss), 2 URL falsch (bundesregierung/dgb), 1 bot-gesperrt (die-linke).
check("9B: 3 repariert + 2 reparatur_url_falsch + 1 bot_gesperrt, 0 dauerhaft_defekt", rs.repariert === 3 && rs.reparaturUrlFalsch === 2 && rs.botGesperrt === 1 && rs.dauerhaftDefekt === 0);
check("9B EHRLICH: NICHT alle kritischen Wege gelöst (2/4 repariert, alleKritischGeloest=false)", rs.kritischGesamt === 4 && rs.kritischRepariert === 2 && rs.kritischOffen === 2 && rs.alleKritischGeloest === false);
check("nur echt getestete (geeignet) Wege sind verifiziert=true", rep.BUNDESWEG_REPARATUREN.filter((r) => r.verifiziert).length === 3 && rep.BUNDESWEG_REPARATUREN.every((r) => (r.verifiziert === true) === (r.bewertung === "repariert")));
check("bundestag repariert (real geeignet, HTTP 200)", rep.BUNDESWEG_REPARATUREN.some((r) => r.legacy_source_id === "bundestag" && r.bewertung === "repariert" && r.liveHttp === 200));
check("bundesregierung reparatur_url_falsch (real HTTP 404)", rep.BUNDESWEG_REPARATUREN.some((r) => r.legacy_source_id === "bundesregierung" && r.bewertung === "reparatur_url_falsch" && r.liveHttp === 404));
check("linksfraktion: dielinkebt.de repariert (NICHT veraltete linksfraktion.de)", rep.BUNDESWEG_REPARATUREN.some((r) => r.legacy_source_id === "linksfraktion" && /dielinkebt\.de/.test(r.reparaturUrl) && /linksfraktion\.de/.test(r.diagnose) && r.bewertung === "repariert"));
check("ausschuss-arbeit-soziales -> googlenews_search Ersatz (repariert)", rep.BUNDESWEG_REPARATUREN.some((r) => r.legacy_source_id === "ausschuss-arbeit-soziales" && r.reparaturMethod === "googlenews_search" && r.bewertung === "repariert"));
check("jede Reparatur: verifyBeforeActivation=true, angewendet=0", rep.BUNDESWEG_REPARATUREN.every((r) => r.verifyBeforeActivation === true) && rs.angewendet === 0);

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
