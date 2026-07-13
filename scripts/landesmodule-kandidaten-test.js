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
check("BB landesfraktionen nennt reale Fraktionen SPD/AfD/BSW/CDU (allgemeines Paket)", /SPD\/AfD\/BSW\/CDU/.test(bbByKlasse.landesfraktionen.publisher) && bbByKlasse.landesfraktionen.readiness === "kandidat");
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
check("schriftliche_anfragen als 'mit_einschraenkung' (Filter, nicht Rohquelle)", beByKlasse.schriftliche_anfragen.recommendation === "mit_einschraenkung" && bbByKlasse.schriftliche_anfragen.recommendation === "mit_einschraenkung");
check("Dedup-Hinweise dokumentiert (rbb, Open-Data-Korpus, Landespressedienst)", k.DEDUP_HINWEISE.length >= 3 && k.DEDUP_HINWEISE.some((h) => /rbb24/.test(h)));

console.log("== Abgelehnte Kandidaten (mit Grund) ==");
check("mind. 5 abgelehnte Kandidaten mit Grund", k.ABGELEHNTE_KANDIDATEN.length >= 5 && k.ABGELEHNTE_KANDIDATEN.every((a) => a.grund && a.kandidat && a.klasse));
check("MAZ-Direkt-RSS abgelehnt (Paywall/kein Feed)", k.ABGELEHNTE_KANDIDATEN.some((a) => /MAZ/i.test(a.kandidat) && /paywall|kein.*feed|rss/i.test(a.grund)));
check("BB regionale_leitmedien nutzt googlenews (MAZ-Ersatz)", bbByKlasse.regionale_leitmedien.method === "googlenews_search");
check("SPD-Fraktion als BB-Pilot-Ersatz ABGELEHNT (kein Partei-Ersatz)", k.ABGELEHNTE_KANDIDATEN.some((a) => /spd-fraktion/i.test(a.kandidat) && a.klasse === "fraktion_pilot"));
check("SPD-Person (Lüttmann) als BB-Pilot-Ersatz ABGELEHNT (kein Personen-Ersatz)", k.ABGELEHNTE_KANDIDATEN.some((a) => a.klasse === "person_pilot" && /spd|lüttmann|luettmann/i.test(a.kandidat)));
check("linksfraktion-brandenburg als aktive Fraktion abgelehnt (Linke nicht im Landtag 8. WP)", k.ABGELEHNTE_KANDIDATEN.some((a) => /linksfraktion.brandenburg/i.test(a.kandidat) && /8\. WP|nicht.*Landtag/i.test(a.grund)));
check("GVBl/BRAVORS als eigener Feed abgelehnt (kein RSS)", k.ABGELEHNTE_KANDIDATEN.some((a) => /gvbl|bravors|gesetze\.berlin/i.test(a.kandidat)));

console.log("== Empfehlungslage (nur besetzte) ==");
check("Berlin: 13 empfohlen + 2 mit_einschraenkung", sum.berlin.empfohlen === 13 && sum.berlin.mitEinschraenkung === 2);
check("Brandenburg: 11 empfohlen + 2 mit_einschraenkung (SPD-Ausweich entfernt)", sum.brandenburg.empfohlen === 11 && sum.brandenburg.mitEinschraenkung === 2);
check("Brandenburg Kandidatenabdeckung 13/15 (2 Pilotklassen unbesetzt)", sum.brandenburg.klassenAbgedeckt === 13 && sum.brandenburg.unbesetzt === 2);
check("Brandenburg klassenFehlend = genau die 2 unbesetzten Pilotklassen", sum.brandenburg.klassenFehlend.length === 2 && sum.brandenburg.klassenFehlend.includes("fraktion_pilot") && sum.brandenburg.klassenFehlend.includes("person_pilot"));
check("Berlin klassenFehlend leer (alle 15 besetzt)", sum.berlin.klassenFehlend.length === 0);
check("Reifegrad-Rollup: keine 'unknown' (alle readiness-Werte gültig)", sum.berlin.readiness.unknown === 0 && sum.brandenburg.readiness.unknown === 0);
check("landReadiness.hoechsteStufe = 'kandidat' (besetzte vorhanden)", k.landReadiness(bb).hoechsteStufe === "kandidat" && k.landReadiness(be).hoechsteStufe === "kandidat");
check("landReadiness leere Liste -> hoechsteStufe 'unbesetzt' (nicht 'kandidat')", k.landReadiness([]).hoechsteStufe === "unbesetzt");
check("überwiegend RSS/Open-Data (nicht scrape-lastig)", (sum.berlin.methoden.rss + (sum.berlin.methoden.opendata_xml || 0)) >= 12);

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
