"use strict";

// Tests fuer Sprint 9: Quellenkandidaten Berlin & Brandenburg (nur 'prepared').
// Reine Offline-Tests der Seed-Daten. Prueft Klassenabdeckung, dass NICHTS aktiviert ist,
// die Ehrlichkeit (verifyBeforeActivation, WebSearch-belegt), die Brandenburg-Fraktionslinie
// (Die Linke nicht im Landtag), rbb-Dedup und die abgelehnten Kandidaten.

const k = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-kandidaten");
const { LANDESMODUL_PFLICHTKLASSEN } = require("../lib/helmut/quellenarchitektur/seeds/packages");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

const be = k.BERLIN_KANDIDATEN, bb = k.BRANDENBURG_KANDIDATEN;
const beByKlasse = Object.fromEntries(be.map((c) => [c.klasse, c]));
const bbByKlasse = Object.fromEntries(bb.map((c) => [c.klasse, c]));

console.log("== Klassenabdeckung ==");
check("Berlin deckt alle 15 Pflichtklassen ab", LANDESMODUL_PFLICHTKLASSEN.every((c) => beByKlasse[c]) && be.length === 15);
check("Brandenburg deckt alle 15 Pflichtklassen ab", LANDESMODUL_PFLICHTKLASSEN.every((c) => bbByKlasse[c]) && bb.length === 15);
check("keine unbekannte Klasse (nur die 15 Pflichtklassen)", [...be, ...bb].every((c) => LANDESMODUL_PFLICHTKLASSEN.includes(c.klasse)));

console.log("== NICHTS aktiviert (nur vorbereitet) ==");
const sum = k.candidateSummary();
check("candidateSummary: aktiviert === 0", sum.aktiviert === 0);
check("candidateSummary: status 'prepared'", sum.status === "prepared");
check("KEIN Kandidat trägt ein Aktiv-/Enabled-Flag", [...be, ...bb].every((c) => c.status === undefined || c.status === "prepared") && [...be, ...bb].every((c) => !("active" in c) && !("enabled" in c) && !("activation_mode" in c)));

console.log("== Ehrlichkeit (Recherche-Vorbehalt) ==");
check("JEDER Kandidat: verifyBeforeActivation=true (Egress-Block, byte-genau prüfen)", [...be, ...bb].every((c) => c.verifyBeforeActivation === true));
check("jeder Kandidat hat konkrete URL + Methode + Herausgeber", [...be, ...bb].every((c) => /^https?:\/\//.test(c.url) && c.method && c.publisher));
const validMethods = ["rss", "opendata_xml", "api_xml", "googlenews_search", "html"];
check("nur bekannte Abrufmethoden", [...be, ...bb].every((c) => validMethods.includes(c.method)));
const validRec = ["empfohlen", "mit_einschraenkung", "abgelehnt"];
check("nur bekannte Empfehlungswerte", [...be, ...bb].every((c) => validRec.includes(c.recommendation)));

console.log("== Brandenburg-Fraktionslinie (Die Linke nicht im Landtag) ==");
check("BB partei_pilot = Die Linke Brandenburg (Partei existiert)", /die linke/i.test(bbByKlasse.partei_pilot.publisher));
check("BB fraktion_pilot NICHT Die Linke (Ausweich SPD)", !/linksfraktion|die linke/i.test(bbByKlasse.fraktion_pilot.publisher) && /spd/i.test(bbByKlasse.fraktion_pilot.publisher));
check("BB fraktion_pilot als 'mit_einschraenkung' markiert (Ausweich)", bbByKlasse.fraktion_pilot.recommendation === "mit_einschraenkung");
check("BB person_pilot NICHT Die Linke (Ausweich SPD-MdL)", !/die linke/i.test(bbByKlasse.person_pilot.publisher));
check("BB landesfraktionen nennt nur SPD/AfD/BSW/CDU (8. WP)", /SPD\/AfD\/BSW\/CDU/.test(bbByKlasse.landesfraktionen.publisher));
// Berlin darf die Die-Linke-Pilotlinie sauber halten
check("Berlin partei_pilot = Die Linke Berlin", /die linke/i.test(beByKlasse.partei_pilot.publisher));
check("Berlin fraktion_pilot = Linksfraktion", /linksfraktion/i.test(beByKlasse.fraktion_pilot.publisher));

console.log("== Dedup / Überschneidung ==");
check("rbb24 ist DERSELBE Feed für Berlin und Brandenburg (dedup)", beByKlasse.oer_landesberichterstattung.url === bbByKlasse.oer_landesberichterstattung.url && /rbb24/.test(beByKlasse.oer_landesberichterstattung.url));
check("schriftliche_anfragen = dieselbe Rohquelle wie drucksachen (Teilmenge, nicht doppelt)", beByKlasse.schriftliche_anfragen.url === beByKlasse.drucksachen.url && bbByKlasse.schriftliche_anfragen.url === bbByKlasse.drucksachen.url);
check("schriftliche_anfragen als 'mit_einschraenkung' (Filter, nicht Rohquelle)", beByKlasse.schriftliche_anfragen.recommendation === "mit_einschraenkung" && bbByKlasse.schriftliche_anfragen.recommendation === "mit_einschraenkung");
check("Dedup-Hinweise dokumentiert (rbb, Open-Data-Korpus, Landespressedienst)", k.DEDUP_HINWEISE.length >= 3 && k.DEDUP_HINWEISE.some((h) => /rbb24/.test(h)));

console.log("== Abgelehnte Kandidaten (mit Grund) ==");
check("mind. 5 abgelehnte Kandidaten mit Grund", k.ABGELEHNTE_KANDIDATEN.length >= 5 && k.ABGELEHNTE_KANDIDATEN.every((a) => a.grund && a.kandidat && a.klasse));
check("MAZ-Direkt-RSS abgelehnt (Paywall/kein Feed)", k.ABGELEHNTE_KANDIDATEN.some((a) => /MAZ/i.test(a.kandidat) && /paywall|kein.*feed|rss/i.test(a.grund)));
check("BB regionale_leitmedien nutzt googlenews (MAZ-Ersatz)", bbByKlasse.regionale_leitmedien.method === "googlenews_search");
check("linksfraktion-brandenburg als aktiver Pilot abgelehnt (Linke nicht im Landtag)", k.ABGELEHNTE_KANDIDATEN.some((a) => /linksfraktion.brandenburg/i.test(a.kandidat) && /8\. WP|nicht.*Landtag/i.test(a.grund)));
check("GVBl/BRAVORS als eigener Feed abgelehnt (kein RSS)", k.ABGELEHNTE_KANDIDATEN.some((a) => /gvbl|bravors|gesetze\.berlin/i.test(a.kandidat)));

console.log("== Empfehlungslage ==");
check("Berlin: 13 empfohlen + 2 mit_einschraenkung", sum.berlin.empfohlen === 13 && sum.berlin.mitEinschraenkung === 2);
check("Brandenburg: 11 empfohlen + 4 mit_einschraenkung", sum.brandenburg.empfohlen === 11 && sum.brandenburg.mitEinschraenkung === 4);
check("überwiegend RSS/Open-Data (nicht scrape-lastig)", (sum.berlin.methoden.rss + (sum.berlin.methoden.opendata_xml || 0)) >= 12);

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
