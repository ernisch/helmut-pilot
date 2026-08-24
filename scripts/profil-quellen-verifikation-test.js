"use strict";

// Helmut — Offline-Test der Auswertungslogik der Profil-Quellen-Verifikation (PR #267).
// KEIN Netz: getestet werden ausschliesslich die reinen Funktionen (URL-Schranke,
// Normalisierung, HTML→Text, Gremienzeilen, Bewertung). Der echte Abruf laeuft nur im
// GitHub-Actions-Workflow profil-quellen-verifikation.yml.

const V = require("./profil-quellen-verifikation.js");

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

abschnitt("URL-Schranke: nur amtliche Hosts, nur https");

check("parlament-berlin.de erlaubt", V.urlErlaubt("https://www.parlament-berlin.de/Abgeordnete/x"));
check("landtag.brandenburg.de erlaubt", V.urlErlaubt("https://www.landtag.brandenburg.de/de/x/1"));
check("fremder Host abgelehnt", !V.urlErlaubt("https://www.abgeordnetenwatch.de/x"));
check("Subdomain-Trick abgelehnt", !V.urlErlaubt("https://parlament-berlin.de.boese.example/x"));
check("http (ohne TLS) abgelehnt", !V.urlErlaubt("http://www.parlament-berlin.de/x"));
check("bundestag.de NICHT im Abrufumfang (nur BE/BB-Paket)", !V.urlErlaubt("https://www.bundestag.de/abgeordnete"));

abschnitt("Normalisierung");

check("Umlaute transliteriert", V.norm("Ausschuss für Bildung, Jugend und Sport") === "ausschuss fuer bildung jugend und sport");
check("Bindestrich egalisiert", V.norm("Niels-Olaf Lüders") === V.norm("Niels Olaf Lueders"));

abschnitt("HTML → Text");

// Fuelltext, damit die synthetische Seite die Mindestlaenge echter Profilseiten erreicht
// (die Bewertung weist zu kurze Seiten ehrlich als nicht_eindeutig aus).
const FUELLER = "<p>" + Array.from({ length: 30 }, (_, i) =>
  `Absatz ${i + 1} der Biografie mit ausreichend Fliesstext zu Werdegang, Terminen und parlamentarischer Arbeit im Landtag.`
).join(" ") + "</p>";
const html = "<html><head><title>Muster, Erika</title><style>.x{}</style></head><body>" +
  "<h1>Erika Muster</h1><p>SPD-Fraktion</p><script>evil()</script>" +
  "<h2>Ausschüsse</h2><ul><li>Mitglied im Hauptausschuss</li><li>Stellvertretendes Mitglied im Petitionsausschuss</li></ul>" +
  "<p>Wahlkreis 9 (Oranienburg)</p>" + FUELLER + "</body></html>";
const zeilen = V.htmlZuText(html);
check("Skript-/Style-Inhalte entfernt", !zeilen.join(" ").includes("evil"));
check("Listenpunkte als eigene Zeilen", zeilen.some((z) => z === "Mitglied im Hauptausschuss"));

abschnitt("Gremienzeilen und Rollendeutung");

const gremien = V.gremienZeilen(zeilen);
check("Hauptausschuss-Zeile erkannt", gremien.some((g) => /Hauptausschuss/.test(g.zeile)));
check("stellvertretend erkannt", gremien.some((g) => /Petitionsausschuss/.test(g.zeile) && g.rolleVermutet === "stellvertretend"));

abschnitt("Bewertung");

const profilOk = {
  mandatsId: "erika-muster", vollname: "Erika Muster", fraktion: "SPD", partei: "SPD",
  wahlkreis: "Wahlkreis 9 (Oranienburg)", ausschuesse: ["Hauptausschuss"],
  stellvertretendeAusschuesse: ["Petitionsausschuss"], aktiv: false
};
const seite = { zeilen, gremien };
const b1 = V.bewerteProfil(profilOk, seite, { ok: true });
check("volle Uebereinstimmung → bestaetigt", b1.ergebnis === "bestaetigt", JSON.stringify(b1.gruende));

const b2 = V.bewerteProfil({ ...profilOk, ausschuesse: ["Hauptausschuss", "Rechtsausschuss"] }, seite, { ok: true });
check("fehlender Ausschuss → abweichung", b2.ergebnis === "abweichung");
check("Grund nennt den fehlenden Ausschuss", b2.gruende.some((g) => g.includes("Rechtsausschuss")));

const b3 = V.bewerteProfil({ ...profilOk, vollname: "Max Anders" }, seite, { ok: true });
check("Name nicht auffindbar → nicht_eindeutig", b3.ergebnis === "nicht_eindeutig");

const b4 = V.bewerteProfil(profilOk, { zeilen: [] }, { ok: false, grund: "HTTP 403" });
check("Abruf gescheitert → nicht_erreichbar", b4.ergebnis === "nicht_erreichbar");
check("nicht_erreichbar zaehlt nie als bestaetigt", b4.ergebnis !== "bestaetigt");

const b5 = V.bewerteProfil({ ...profilOk, wahlkreis: "Wahlkreis 27 (Anderswo)" }, seite, { ok: true });
check("falscher Wahlkreis → abweichung", b5.ergebnis === "abweichung");

const seiteMitFremdem = { zeilen: [...zeilen, "Mitglied im Rechtsausschuss"], gremien: V.gremienZeilen([...zeilen, "Mitglied im Rechtsausschuss"]) };
const b6 = V.bewerteProfil(profilOk, seiteMitFremdem, { ok: true });
check("Seite nennt Mitgliedschaft ausserhalb des Pakets → abweichung", b6.ergebnis === "abweichung");
check("Grund nennt das fremde Gremium", b6.gruende.some((g) => g.includes("Rechtsausschuss")));

const listenProfil = { ...profilOk, wahlkreis: undefined, listenmandat: true, regionHinweis: "Oranienburg" };
const listenZeilen = V.htmlZuText(html.replace("Wahlkreis 9 (Oranienburg)", "Einzug über die Landesliste, Listenplatz 2"));
const b7 = V.bewerteProfil(listenProfil, { zeilen: listenZeilen, gremien: V.gremienZeilen(listenZeilen) }, { ok: true });
check("Listenmandat mit Listen-Marker → bestaetigt", b7.ergebnis === "bestaetigt", JSON.stringify(b7.gruende));

const nameVariante = { ...profilOk, vollname: "Prof. Dr. Erika Muster", namensvarianten: ["Erika Muster"] };
const b8 = V.bewerteProfil(nameVariante, seite, { ok: true });
check("Namensvariante wird gefunden", b8.gefunden.name === true);

const kurz = V.bewerteProfil(profilOk, { zeilen: ["Erika"], gremien: [] }, { ok: true });
check("zu kurzer Seitentext → nicht_eindeutig", kurz.ergebnis === "nicht_eindeutig");

console.log(`\n== ERGEBNIS ==`);
console.log(`PASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
if (fail > 0) process.exit(1);
console.log("Auswertungslogik der Profil-Quellen-Verifikation ist offline belegt.");
