"use strict";

// Helmut — Offline-Test der Auswertungslogik der Profil-Quellen-Verifikation (PR #267,
// Strenge-Stufe 2). KEIN Netz. Getestet werden die reinen Funktionen: URL-Schranke,
// Normalisierung, HTML→Text, Mitgliedschafts-/Rollenlogik, Mandatsachsen-, Funktions- und
// Regionspruefung sowie die Mandatsart-Belegung aus einer Zusatzquelle.

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
check("Manifest-Zusatzhost NUR wenn uebergeben", !V.urlErlaubt("https://www.wahlen-berlin.de/x") &&
  V.urlErlaubt("https://www.wahlen-berlin.de/x", ["www.wahlen-berlin.de"]));
check("Abruf-Obergrenze je Lauf ist 30 Seiten", V.MAX_SEITEN === 30);

abschnitt("Normalisierung und Entities");

check("Umlaute transliteriert", V.norm("Ausschuss für Bildung, Jugend und Sport") === "ausschuss fuer bildung jugend und sport");
check("Bindestrich egalisiert", V.norm("Niels-Olaf Lüders") === V.norm("Niels Olaf Lueders"));
const entZeilen = V.htmlZuText("<p>Enquete-Kommission &bdquo;Finanzierung und Gestaltung&ldquo;</p>");
check("&bdquo;/&ldquo; dekodiert (keine Buchstabenreste)", V.norm(entZeilen[0]) === "enquete kommission finanzierung und gestaltung");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FUELLER = Array.from({ length: 30 }, (_, i) =>
  `Absatz ${i + 1} der Biografie mit ausreichend Fliesstext zu Werdegang, Terminen und parlamentarischer Arbeit im Landtag.`);

// Brandenburg-Seite: Navigation VOR den Abschnitten, Historik, dann amtliche Abschnitte.
function bbZeilen({ ordentlich = [], stellvertretend = [], extraVorAbschnitt = [] } = {}) {
  return [
    "Erika Muster", "SPD-Fraktion", "Landesliste SPD-Fraktion, Platz 7",
    "Petitionsausschuss", "Kommissionen", // Navigation auf JEDER BB-Seite
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
const beOhneAchse = { zeilen: ["Max Muster", "SPD-Fraktion", "Wahlkreisbüro", ...FUELLER] };
const b7 = V.bewerteProfil(beListe, beOhneAchse, { ok: true });
check("fehlende Achsenangabe ist KEINE Bestaetigung → nicht_eindeutig", b7.ergebnis === "nicht_eindeutig", JSON.stringify(b7.unbelegt));
const b8 = V.bewerteProfil(beListe, beOhneAchse, { ok: true }, { urteil: "liste-belegt" });
check("Manifest-Zusatzbeleg macht die Achse belegt → bestaetigt", b8.ergebnis === "bestaetigt", JSON.stringify(b8.gruende.concat(b8.unbelegt)));
const b9 = V.bewerteProfil(beListe, beOhneAchse, { ok: true }, { urteil: "wahlkreis-zuordnung" });
check("Zusatzquelle ordnet Wahlkreis zu → abweichung", b9.ergebnis === "abweichung");
const beMitWk = { zeilen: ["Max Muster", "SPD-Fraktion", "Wahlkreis: Spandau 2", ...FUELLER] };
const b10 = V.bewerteProfil(beListe, beMitWk, { ok: true });
check("Profilseite weist Wahlkreis zu, Paket sagt Liste → abweichung", b10.ergebnis === "abweichung");

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
const beSeite = { zeilen: ["Max Muster", "SPD-Fraktion", "Landesliste", "Hauptausschuss", ...FUELLER] };
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

abschnitt("Mandatsart-Beleg aus der Gewaehlten-Zusatzquelle");

const gewText = "Gewählte in den Wahlkreisen Wahlkreis 21 Beispiel, Anna CDU\nGewählte nach Bezirksliste der SPD Muster, Max SPD\n";
const u1 = V.belegeMandatsart(gewText, "Max Muster");
check("Name in Nachname-Vorname-Form gefunden, Listen-Abschnitt naeher → liste-belegt", u1.gefunden && u1.urteil === "liste-belegt", u1.urteil);
const u2 = V.belegeMandatsart(gewText, "Anna Beispiel");
check("Wahlkreis-Abschnitt naeher → wahlkreis-zuordnung", u2.gefunden && u2.urteil === "wahlkreis-zuordnung");
const u3 = V.belegeMandatsart(gewText, "Nie Genannt");
check("nicht gelisteter Name → name-nicht-gefunden", !u3.gefunden && u3.urteil === "name-nicht-gefunden");

console.log(`\n== ERGEBNIS ==`);
console.log(`PASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
if (fail > 0) process.exit(1);
console.log("Auswertungslogik der Profil-Quellen-Verifikation (Strenge-Stufe 2) ist offline belegt.");
