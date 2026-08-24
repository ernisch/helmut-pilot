"use strict";

// Helmut — Offline-Test der Auswertungslogik der Profil-Quellen-Verifikation (PR #267,
// Strenge-Stufe 2 mit den Lauf-4-Korrekturen). KEIN Netz. Getestet werden die reinen
// Funktionen: URL-Schranke, Normalisierung, HTML→Text, Mitgliedschafts-/Rollenlogik,
// Mandatsachsen-, Funktions- und Regionspruefung sowie die navigationsfesten
// Fraktions-/Funktionsbelege und die drei exakten Berliner Strukturueberschriften.

const V = require("./profil-quellen-verifikation.js");

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

abschnitt("URL-Schranke: nur amtliche Hosts, nur https (unveraendert streng)");

check("parlament-berlin.de erlaubt", V.urlErlaubt("https://www.parlament-berlin.de/Abgeordnete/x"));
check("landtag.brandenburg.de erlaubt", V.urlErlaubt("https://www.landtag.brandenburg.de/de/x/1"));
check("fremder Host abgelehnt", !V.urlErlaubt("https://www.abgeordnetenwatch.de/x"));
check("Subdomain-Trick abgelehnt", !V.urlErlaubt("https://parlament-berlin.de.boese.example/x"));
check("http (ohne TLS) abgelehnt", !V.urlErlaubt("http://www.parlament-berlin.de/x"));
check("wahlen-berlin.de ist KEIN erlaubter Host mehr (Zusatzquellen entfernt)",
  !V.urlErlaubt("https://www.wahlen-berlin.de/x"));
check("Abruf-Obergrenze je Lauf ist 30 Seiten", V.MAX_SEITEN === 30);

abschnitt("Normalisierung und Entities");

check("Umlaute transliteriert", V.norm("Ausschuss für Bildung, Jugend und Sport") === "ausschuss fuer bildung jugend und sport");
check("Bindestrich egalisiert", V.norm("Niels-Olaf Lüders") === V.norm("Niels Olaf Lueders"));
const entZeilen = V.htmlZuText("<p>Enquete-Kommission &bdquo;Finanzierung und Gestaltung&ldquo;</p>");
check("&bdquo;/&ldquo; dekodiert (keine Buchstabenreste)", V.norm(entZeilen[0]) === "enquete kommission finanzierung und gestaltung");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FUELLER = Array.from({ length: 30 }, (_, i) =>
  `Absatz ${i + 1} der Biografie mit ausreichend Fliesstext zu Werdegang, Terminen und parlamentarischer Arbeit im Landtag.`);

// Brandenburg-Seite wie in Lauf 2/3 beobachtet: Navigation nennt ALLE vier Fraktionen und
// den Praesidiums-Block, die eigene Fraktion steht zusaetzlich in den Stammdaten; dann
// Historik und die amtlichen Mitgliedschaftsabschnitte.
function bbZeilen({ ordentlich = [], stellvertretend = [], extraVorAbschnitt = [], mitLandesliste = true } = {}) {
  return [
    "Erika Muster",
    "SPD-Fraktion", "AfD-Fraktion", "CDU-Fraktion", "BSW-Fraktion", // Navigation: ALLE Fraktionen
    "Präsidentin", "Vizepräsidenten", "Präsidentin und Präsidium", "Präsidium", "Schriftführer/-innen", // Praesidiums-Navigation
    "Petitionsausschuss", "Kommissionen", // Navigation auf JEDER BB-Seite
    "SPD-Fraktion", // Stammdaten: eigene Fraktion (zweites Vorkommen)
    ...(mitLandesliste ? ["Landesliste SPD-Fraktion, Platz 7"] : []),
    "2019 bis 2021 stellvertretender Vorsitzender im Ausschuss für Wissenschaft, Forschung und Kultur", // Historik
    ...extraVorAbschnitt,
    "Ordentliche Ausschuss- und Gremienmitgliedschaften",
    ...ordentlich,
    ...(stellvertretend.length ? ["Stellvertretende Ausschuss- und Gremienmitgliedschaften", ...stellvertretend] : []),
    ...FUELLER
  ];
}
const BB_PROFIL = {
  mandatsId: "erika-muster", vollname: "Erika Muster", fraktion: "SPD", partei: "SPD",
  parlament: "landtag-brandenburg", listenmandat: true, regionHinweis: "Brandenburg (Landesliste, Platz 7)",
  ausschuesse: ["Hauptausschuss"], stellvertretendeAusschuesse: [], aktiv: false
};

abschnitt("Gegenprobe 9: Mitgliedschaft im richtigen Abschnitt wird erkannt");

const s1 = { zeilen: bbZeilen({ ordentlich: ["Hauptausschuss"] }) };
const b1 = V.bewerteProfil(BB_PROFIL, s1, { ok: true });
check("BB: ordentliche Mitgliedschaft im Ordentlich-Abschnitt → bestaetigt", b1.ergebnis === "bestaetigt", JSON.stringify(b1.gruende.concat(b1.unbelegt)));

abschnitt("Gegenprobe 1: ordentlich erwartet, nur stellvertretend gefuehrt → rot");

const s2 = { zeilen: bbZeilen({ ordentlich: [], stellvertretend: ["Hauptausschuss"] }) };
const b2 = V.bewerteProfil(BB_PROFIL, s2, { ok: true });
check("Rollenfehler ordentlich→stellvertretend ist abweichung", b2.ergebnis === "abweichung");
check("Grund nennt den Rollenfehler", b2.gruende.some((g) => /STELLVERTRETEND gefuehrt/.test(g)));

abschnitt("Gegenprobe 2: stellvertretend erwartet, nur ordentlich gefuehrt → rot");

const stvProfil = { ...BB_PROFIL, ausschuesse: [], stellvertretendeAusschuesse: ["Hauptausschuss"] };
const b3 = V.bewerteProfil(stvProfil, s1, { ok: true });
check("Rollenfehler stellvertretend→ordentlich ist abweichung", b3.ergebnis === "abweichung");
check("Grund nennt den Rollenfehler", b3.gruende.some((g) => /ORDENTLICH gefuehrt/.test(g)));

abschnitt("Gegenprobe 3: Petitionsausschuss nur in der Navigation");

const petProfil = { ...BB_PROFIL, ausschuesse: ["Petitionsausschuss"] };
const b4 = V.bewerteProfil(petProfil, s1, { ok: true });
check("Navigation bestaetigt KEINE erwartete Petitionsausschuss-Mitgliedschaft", b4.ergebnis === "abweichung");
const b5 = V.bewerteProfil(BB_PROFIL, s1, { ok: true });
check("Navigation erzeugt auch keine Ausserhalb-Meldung (verbirgt nichts faelschlich)",
  !b5.gruende.some((g) => /Petitionsausschuss/.test(g)));

abschnitt("Gegenprobe 4: Ausschuss nur in historischer Biografiezeile");

const histProfil = { ...BB_PROFIL, ausschuesse: ["Ausschuss für Wissenschaft, Forschung und Kultur"] };
const b6 = V.bewerteProfil(histProfil, s1, { ok: true });
check("Historik gilt nicht als aktuelle Mitgliedschaft → abweichung", b6.ergebnis === "abweichung");
check("Historikzeile erzeugt keinen Ausserhalb-Treffer", !b1.gruende.some((g) => /Wissenschaft, Forschung und Kultur/.test(g)));

abschnitt("Gegenprobe 5: Mandatsachse weder bestaetigt noch widerlegt → nicht_eindeutig");

const beListe = {
  mandatsId: "max-muster", vollname: "Max Muster", fraktion: "SPD", partei: "SPD",
  parlament: "landtag-berlin", listenmandat: true, regionHinweis: "Land Berlin (Listenmandat)",
  ausschuesse: [], stellvertretendeAusschuesse: [], aktiv: false
};
const beOhneAchse = { h1: "Max Muster, SPD", zeilen: ["Max Muster", "SPD-Fraktion", "Wahlkreisbüro", ...FUELLER] };
const b7 = V.bewerteProfil(beListe, beOhneAchse, { ok: true });
check("fehlende Achsenangabe ist KEINE Bestaetigung → nicht_eindeutig", b7.ergebnis === "nicht_eindeutig", JSON.stringify(b7.unbelegt));
const beMitWk = { h1: "Max Muster, SPD", zeilen: ["Max Muster", "SPD-Fraktion", "Wahlkreis: Spandau 2", ...FUELLER] };
const b10 = V.bewerteProfil(beListe, beMitWk, { ok: true });
check("Profilseite weist Wahlkreis zu, Paket sagt Liste → abweichung", b10.ergebnis === "abweichung");

abschnitt("Gegenprobe 11 (Lauf 4): Bezirkslisten-Beleg direkt von der Profilseite");

const beBezirk = { ...beListe, regionHinweis: "Land Berlin (Bezirksliste)" };
const beBezirkSeite = { h1: "Max Muster, SPD", zeilen: ["Max Muster", "SPD-Fraktion", "gewählt über:", "Bezirksliste", "Wahlkreisbüro", ...FUELLER] };
const b8 = V.bewerteProfil(beBezirk, beBezirkSeite, { ok: true });
check("„gewählt über: Bezirksliste“ auf der eigenen Profilseite belegt die Achse → bestaetigt",
  b8.ergebnis === "bestaetigt", JSON.stringify(b8.gruende.concat(b8.unbelegt)));
check("Achsenquelle ist die Profilseite (keine Zusatzquelle)",
  b8.gefunden && b8.gefunden.mandatAchseQuelle === "profilseite");
check("„Wahlkreisbüro“ zaehlt dabei nicht als Wahlkreis-Zuweisung", !b8.gruende.length);

abschnitt("Gegenprobe 6: gespeicherte Funktion ohne amtlichen Beleg");

const fkProfil = { ...BB_PROFIL, funktionen: ["Vorsitzende der SPD-Fraktion"] };
const b11 = V.bewerteProfil(fkProfil, s1, { ok: true });
check("unbelegte Funktion → nicht vollstaendig bestaetigt (abweichung)", b11.ergebnis === "abweichung");
check("Grund nennt die Funktion", b11.gruende.some((g) => /Funktion .*Vorsitzende der SPD-Fraktion/.test(g)));
const s1f = { zeilen: [...s1.zeilen, "Seit Dezember 2024 Vorsitzende der SPD-Fraktion des Landtages"] };
const b12 = V.bewerteProfil(fkProfil, s1f, { ok: true });
check("amtlich belegte Funktion → bestaetigt", b12.ergebnis === "bestaetigt", JSON.stringify(b12.gruende));
const fkHist = { zeilen: [...s1.zeilen, "2016 bis 2019 Vorsitzende der SPD-Fraktion des Landtages"] };
const b13 = V.bewerteProfil(fkProfil, fkHist, { ok: true });
check("nur historisch belegte Funktion zaehlt NICHT", b13.ergebnis === "abweichung");

abschnitt("Gegenprobe 12 (Lauf 4): Navigation beweist keine Funktion");

// Der Praesidiums-Navigationsblock steht bereits in bbZeilen ("Präsidium", "Präsidentin" …).
const navFkProfil = { ...BB_PROFIL, funktionen: ["Präsidium"] };
const b20 = V.bewerteProfil(navFkProfil, s1, { ok: true });
check("exakte Navigationszeile „Präsidium“ belegt die Funktion NICHT → abweichung", b20.ergebnis === "abweichung");
const echteFkProfil = { ...BB_PROFIL, funktionen: ["Mitglied im Präsidium des Landtages Brandenburg"] };
const s1p = { zeilen: [...s1.zeilen, "Seit Dezember 2024 Mitglied im Präsidium des Landtages Brandenburg"] };
const b21 = V.bewerteProfil(echteFkProfil, s1p, { ok: true });
check("echte Inhaltszeile belegt die Funktion weiterhin → bestaetigt", b21.ergebnis === "bestaetigt", JSON.stringify(b21.gruende));
const b22 = V.bewerteProfil(echteFkProfil, s1, { ok: true });
check("ohne Inhaltszeile bleibt die Funktion trotz Navigationsblock rot", b22.ergebnis === "abweichung");
// Zeilenweise Pruefung: ein zufaellig zeilenuebergreifender Text beweist nichts.
const splitFk = { zeilen: [...s1.zeilen, "Sie ist Vorsitzende der", "SPD-Fraktion des Landtages"] };
const b23 = V.bewerteProfil(fkProfil, splitFk, { ok: true });
check("zeilenuebergreifender Zufallstext belegt keine Funktion → abweichung", b23.ergebnis === "abweichung");

abschnitt("Gegenprobe 13 (Lauf 4): Fraktion navigationsfest — BB");

// Die Navigation nennt alle vier Fraktionen; nur die eigene steht zusaetzlich in den
// Stammdaten. Eine falsche Paket-Fraktion darf dadurch NIE gruen werden.
const falscheFraktion = { ...BB_PROFIL, fraktion: "AfD", partei: "AfD" };
const b24 = V.bewerteProfil(falscheFraktion, s1, { ok: true });
check("BB: Navigations-Nennung „AfD-Fraktion“ beweist keine AfD-Zugehoerigkeit → abweichung", b24.ergebnis === "abweichung");
check("Grund nennt die navigationsfeste Fraktionspruefung", b24.gruende.some((g) => /navigationsfest/.test(g)));
// Direktmandat ohne Landeslisten-Zeile: Mehrheitsregel (eigene 2x, andere je 1x).
const bbDirekt = {
  mandatsId: "erika-muster", vollname: "Erika Muster", fraktion: "SPD", partei: "SPD",
  parlament: "landtag-brandenburg", wahlkreis: "Wahlkreis 21 (Musterstadt)",
  ausschuesse: ["Hauptausschuss"], stellvertretendeAusschuesse: [], aktiv: false
};
const sDirekt = { zeilen: [...bbZeilen({ ordentlich: ["Hauptausschuss"], mitLandesliste: false }), "Wahlkreis 21"] };
const b25 = V.bewerteProfil(bbDirekt, sDirekt, { ok: true });
check("BB-Direktmandat: eigene Fraktionszeile in den Stammdaten (Mehrheitsregel) → bestaetigt",
  b25.ergebnis === "bestaetigt", JSON.stringify(b25.gruende.concat(b25.unbelegt)));
const b26 = V.bewerteProfil({ ...bbDirekt, fraktion: "CDU", partei: "CDU" }, sDirekt, { ok: true });
check("BB-Direktmandat: falsche Fraktion faellt durch die Mehrheitsregel → abweichung", b26.ergebnis === "abweichung");

abschnitt("Gegenprobe 14 (Lauf 4): Fraktion navigationsfest — Berlin (h1-Kuerzel)");

const beGruene = {
  mandatsId: "gerd-gruen", vollname: "Gerd Grün", fraktion: "Bündnis 90/Die Grünen", partei: "Bündnis 90/Die Grünen",
  parlament: "landtag-berlin", listenmandat: true, regionHinweis: "Land Berlin (Landesliste)",
  ausschuesse: [], stellvertretendeAusschuesse: [], aktiv: false
};
const beGrueneSeite = { h1: "Gerd Grün, GRÜNE", zeilen: ["Gerd Grün", "Landesliste", ...FUELLER] };
const b27 = V.bewerteProfil(beGruene, beGrueneSeite, { ok: true });
check("Berlin: h1-Kuerzel GRÜNE belegt Bündnis 90/Die Grünen → bestaetigt", b27.ergebnis === "bestaetigt", JSON.stringify(b27.gruende.concat(b27.unbelegt)));
const b28 = V.bewerteProfil({ ...beGruene, fraktion: "CDU", partei: "CDU" }, beGrueneSeite, { ok: true });
check("Berlin: falsche Paket-Fraktion trotz Seitentext-Nennungen → abweichung", b28.ergebnis === "abweichung");
const beOhneH1 = { zeilen: ["Gerd Grün", "Landesliste", "Fraktion Bündnis 90/Die Grünen", ...FUELLER] };
const b29 = V.bewerteProfil(beGruene, beOhneH1, { ok: true });
check("Berlin: ohne h1-Kuerzel gilt die Fraktion als unbelegt (kein Seitentext-Ersatz) → abweichung", b29.ergebnis === "abweichung");

abschnitt("Gegenprobe 7: Regionshinweis widerspricht der amtlichen Seite");

const regFalsch = { ...BB_PROFIL, regionHinweis: "Brandenburg (Landesliste, Platz 9)" };
const b14 = V.bewerteProfil(regFalsch, s1, { ok: true });
check("behaupteter Platz 9 gegen amtlichen Platz 7 → abweichung", b14.ergebnis === "abweichung");
check("Grund nennt den unbelegten Platz", b14.gruende.some((g) => /Platz 9/.test(g)));
check("korrekter Platz 7 wird belegt (Gegenprobe aus 9)", b1.ergebnis === "bestaetigt");

abschnitt("Gegenprobe 8: fehlende amtliche Quelle → niemals bestaetigt");

const b15 = V.bewerteProfil(BB_PROFIL, { zeilen: [] }, { ok: false, grund: "keine erlaubte amtliche URL im Paket" });
check("ohne Abruf → nicht_erreichbar", b15.ergebnis === "nicht_erreichbar");
check("nicht_erreichbar ist nie bestaetigt", b15.ergebnis !== "bestaetigt");
const b16 = V.bewerteProfil(BB_PROFIL, { zeilen: ["Erika"] }, { ok: true });
check("zu kurzer Seitentext → nicht_eindeutig", b16.ergebnis === "nicht_eindeutig");

abschnitt("Gegenprobe 10: Berlin ohne Rollenangabe — keine Rolle wird erfunden");

const beM = V.mitgliedschaften(["Hauptausschuss", "Stellvertretendes Mitglied im Petitionsausschuss", "Enquete-Kommission"], "landtag-berlin");
check("rollenlose Berliner Zeile ist UNBESTIMMT (nicht ordentlich)", beM.unbestimmt.includes("Hauptausschuss") && !beM.ordentlich.length);
check("explizit stellvertretende Berliner Zeile wird stellvertretend gefuehrt", beM.stellvertretend.length === 1);
check("Berliner Navigationszeile Enquete-Kommission ist ausgeschlossen",
  !beM.unbestimmt.includes("Enquete-Kommission"));
check("Berliner Petitionsausschuss-Zeile ist eine echte Mitgliedschaft (keine Blockliste)",
  V.mitgliedschaften(["Petitionsausschuss"], "landtag-berlin").unbestimmt.includes("Petitionsausschuss"));
const beMitgliedProfil = { ...beListe, ausschuesse: ["Hauptausschuss"] };
const beSeite = { h1: "Max Muster, SPD", zeilen: ["Max Muster", "SPD-Fraktion", "Landesliste", "Hauptausschuss", ...FUELLER] };
const b17 = V.bewerteProfil(beMitgliedProfil, beSeite, { ok: true });
check("Berliner Mitgliedschaft ohne Rollenausweis wird als Mitgliedschaft bestaetigt", b17.ergebnis === "bestaetigt", JSON.stringify(b17.gruende.concat(b17.unbelegt)));
const beStvProfil = { ...beListe, stellvertretendeAusschuesse: ["Hauptausschuss"] };
const b18 = V.bewerteProfil(beStvProfil, beSeite, { ok: true });
check("stellvertretende Behauptung ohne Rollenausweis ist unbelegbar → abweichung", b18.ergebnis === "abweichung");

abschnitt("Ausserhalb-Pruefung: Seite fuehrt Mitgliedschaft, die das Paket nicht kennt");

const s3 = { zeilen: bbZeilen({ ordentlich: ["Hauptausschuss", "Wahlprüfungsausschuss"] }) };
const b19 = V.bewerteProfil(BB_PROFIL, s3, { ok: true });
check("unzugeordnete Abschnittszeile → abweichung", b19.ergebnis === "abweichung");
check("Grund nennt den Wahlprüfungsausschuss", b19.gruende.some((g) => /Wahlprüfungsausschuss/.test(g)));

abschnitt("Gegenprobe 15 (Lauf 4): die drei exakten Berliner Strukturueberschriften");

// Lauf 3 wurde 10x rot, weil diese drei Seiten-/Reiterueberschriften als unzugeordnete
// Mitgliedschaften galten. Sie stehen auf jeder Berliner Profilseite — auch im Kopf- UND
// Fussbereich wiederholt — und duerfen weder bestaetigen noch rot melden.
const BE_STRUKTUR = ["Ausschüsse: Einladungen und Protokolle", "Ausschüsse: Vorgänge", "Mitgliedschaft in Ausschüssen"];
const beKopfFussProfil = { ...beListe, ausschuesse: ["Hauptausschuss"] };
const beKopfFussSeite = { h1: "Max Muster, SPD", zeilen: [
  ...BE_STRUKTUR, // Kopfbereich
  "Max Muster", "Landesliste", "Hauptausschuss",
  ...FUELLER,
  ...BE_STRUKTUR // Wiederholung im Fussbereich
] };
const b30 = V.bewerteProfil(beKopfFussProfil, beKopfFussSeite, { ok: true });
check("drei Strukturueberschriften in Kopf UND Fuss → kein Rot, Profil bestaetigt",
  b30.ergebnis === "bestaetigt", JSON.stringify(b30.gruende.concat(b30.unbelegt)));
check("Strukturueberschriften bestaetigen selbst KEINE Mitgliedschaft",
  V.mitgliedschaften(BE_STRUKTUR, "landtag-berlin").unbestimmt.length === 0);
const beEchteExtra = { h1: "Max Muster, SPD", zeilen: [
  ...BE_STRUKTUR,
  "Max Muster", "Landesliste", "Hauptausschuss",
  "Ausschuss für Sport", // ECHTE zusaetzliche Mitgliedschaft neben den Ueberschriften
  ...FUELLER,
  ...BE_STRUKTUR
] };
const b31 = V.bewerteProfil(beKopfFussProfil, beEchteExtra, { ok: true });
check("echte zusaetzliche Mitgliedschaft neben den Ueberschriften bleibt ROT", b31.ergebnis === "abweichung");
check("Grund nennt den Ausschuss für Sport", b31.gruende.some((g) => /Ausschuss für Sport/.test(g)));

console.log(`\n== ERGEBNIS ==`);
console.log(`PASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
if (fail > 0) process.exit(1);
console.log("Auswertungslogik der Profil-Quellen-Verifikation (Strenge-Stufe 2, Lauf-4-Korrekturen) ist offline belegt.");
