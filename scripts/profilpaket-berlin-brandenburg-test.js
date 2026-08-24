"use strict";

// Helmut — Abnahmeprüfung für das LOKALE Importpaket der 20 zusätzlichen Mandatsprofile
// (10 Abgeordnetenhaus von Berlin, 10 Landtag Brandenburg; Sprint „Vorbereitung 25 Mandate“,
// 2026-08-24).
//
// Diese Prüfung ist OFFLINE (kein Netz, keine Datenbank, keine KI). Sie beweist NICHT die
// inhaltliche Richtigkeit der Angaben — die entscheidet allein die amtliche Profilseite
// (bytegenaue Bestätigung steht aus, s. u.). Sie beweist:
//   1. Das Paket erfüllt den Importvertrag (lib/helmut/profil-import.js: „importierbar“).
//   2. Es sind GENAU die 20 vorgesehenen Personen (10 Berlin, 10 Brandenburg).
//   3. AUSNAHMSLOS `aktiv: false`; die Abbildung nach Helmut ergibt `profileActive: false`.
//   4. Keine Dubletten über die drei Vertragsachsen (Kennung, Vollname, amtliche Seite).
//   5. PRÜFSTAND: jedes Profil trägt `geprueftAm: 2026-08-24` — die bytegenaue Prüfung
//      lief über den freigegebenen, rein lesenden GitHub-Actions-Lauf
//      (profil-quellen-verifikation.yml, alle 20 Seiten HTTP 200); jede Notiz nennt ihn.
//   6. Die fünf für eine spätere erste Erweiterung empfohlenen Brandenburger Profile sind
//      enthalten (Empfehlung ist KEINE Aktivierung).

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const IMPORT = require(path.join(ROOT, "lib/helmut/profil-import.js"));

const PAKET_PFAD = path.join(ROOT, "daten/mandatsprofile-berlin-brandenburg-2026-08-24.json");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const ERWARTET_BERLIN = [
  "Dirk Stettner", "Christian Goiny", "Danny Freymark", "Raed Saleh", "Jörg Stroedter",
  "Bettina Jarasch", "Werner Sebastian Graf", "Katrin Schmidberger", "Tobias Schulze",
  "Niklas Schrader"
];
// Lüders: amtliche Schreibweise laut Recherche 2026-08-24 mit Bindestrich („Niels-Olaf“);
// der Auftrag nannte „Niels Olaf“ und verlangte ausdrücklich die Prüfung der Schreibweise.
const ERWARTET_BRANDENBURG = [
  "Björn Lüttmann", "Ludwig Scheetz", "Prof. Dr. Ulrike Liedtke", "Katja Poschmann",
  "Steeven Bretz", "Kristy Augustin", "Niels-Olaf Lüders", "Christian Dorst",
  "Jenny Meyer", "Falk Peschel"
];
// Empfohlene erste Erweiterung (nur Vorbereitung — keine Aktivierung, kein Import):
const EMPFOHLENE_ERSTE_GRUPPE = [
  "Steeven Bretz", "Katja Poschmann", "Niels-Olaf Lüders", "Jenny Meyer",
  "Prof. Dr. Ulrike Liedtke"
];

abschnitt("Paketdatei und Vertragsprüfung");

const roh = fs.readFileSync(PAKET_PFAD, "utf8");
const datei = JSON.parse(roh);
const ergebnis = IMPORT.pruefeImport(datei);

check("Der Importprüfer meldet „importierbar“ (0 Fehler)", ergebnis.ok,
  ergebnis.ok ? `${ergebnis.gueltig}/${ergebnis.profile} gültig` :
    IMPORT.berichte(ergebnis).split("\n").slice(0, 12).join(" | "));
check("Genau 20 Profile", ergebnis.profile === 20, `gefunden: ${ergebnis.profile}`);
check("Alle Profile einzeln gültig", ergebnis.gueltig === ergebnis.profile,
  `${ergebnis.gueltig}/${ergebnis.profile}`);

const nachParlament = (ergebnis.zusammenfassung && ergebnis.zusammenfassung.nachParlament) || {};
check("10 × landtag-berlin", nachParlament["landtag-berlin"] === 10,
  `gefunden: ${nachParlament["landtag-berlin"] || 0}`);
check("10 × landtag-brandenburg", nachParlament["landtag-brandenburg"] === 10,
  `gefunden: ${nachParlament["landtag-brandenburg"] || 0}`);

abschnitt("Deaktivierung — ein Import aktiviert niemals");

check("Zusammenfassung bestätigt alleAktivFalse",
  !!(ergebnis.zusammenfassung && ergebnis.zusammenfassung.alleAktivFalse === true));
check("Jedes Profil trägt wörtlich `aktiv: false`",
  Array.isArray(datei.profile) && datei.profile.length > 0 &&
  datei.profile.every((p) => p && p.aktiv === false));
const abbildungen = (datei.profile || []).map((p) => IMPORT.zuHelmutProfil(p));
check("Abbildung nach Helmut ergibt ausnahmslos profileActive: false",
  abbildungen.length === 20 && abbildungen.every((h) => h && h.profileActive === false));

abschnitt("Dubletten über die drei Vertragsachsen");

const dublettenFehler = (ergebnis.fehler || []).filter((f) => String(f.code || "").startsWith("dublette-"));
check("Keine Dubletten (Kennung, Vollname, amtliche Profilseite)", dublettenFehler.length === 0,
  dublettenFehler.map((f) => f.code).join(", ") || "0 Befunde");
const ids = new Set((datei.profile || []).map((p) => p.mandatsId));
check("20 verschiedene Mandatskennungen", ids.size === 20, `distinct: ${ids.size}`);

abschnitt("Personenliste — exakt die 20 vorgesehenen");

const namen = new Set((datei.profile || []).map((p) => String(p.vollname || "").trim()));
for (const n of [...ERWARTET_BERLIN, ...ERWARTET_BRANDENBURG]) {
  check(`enthalten: ${n}`, namen.has(n));
}
check("Keine zusätzliche Person", namen.size === 20, `distinct Namen: ${namen.size}`);
check("„Werner Sebastian Graf“ mit vollem amtlichen Namen (nicht nur „Werner Graf“)",
  namen.has("Werner Sebastian Graf") && !namen.has("Werner Graf"));

abschnitt("Prüfstand (bytegenauer Abgleich über den Actions-Lauf)");

check("Jede amtliche Quelle trägt `geprueftAm: 2026-08-24`",
  (datei.profile || []).every((p) =>
    (p.offizielleQuellen || []).filter((q) => q.art === "parlament-profil")
      .every((q) => q.geprueftAm === "2026-08-24")));
check("Jede Notiz benennt den Actions-Lauf als Prüfgrundlage",
  (datei.profile || []).every((p) => /Actions-Lauf/i.test(String(p.notiz || ""))));
check("Jede Notiz bleibt in der Vertragsgrenze (max. 500 Zeichen)",
  (datei.profile || []).every((p) => String(p.notiz || "").length <= 500));
check("Kein SYNTHETISCH-Marker (dies ist eine Recherche, kein Beispiel)",
  !/SYNTHETISCH/.test(roh));

abschnitt("Amtliche Profilseiten");

const HOSTS = { "landtag-berlin": "parlament-berlin.de", "landtag-brandenburg": "landtag.brandenburg.de" };
check("Jedes Profil hat genau eine amtliche parlament-profil-Quelle auf dem richtigen Host",
  (datei.profile || []).every((p) => {
    const amtlich = (p.offizielleQuellen || []).filter((q) => q.art === "parlament-profil");
    if (amtlich.length !== 1) return false;
    try {
      const h = new URL(amtlich[0].url).hostname.replace(/^www\./, "");
      return h === HOSTS[p.parlament] || h.endsWith(`.${HOSTS[p.parlament]}`);
    } catch { return false; }
  }));
check("Vorgegebene amtliche Seite von Kristy Augustin (…/augustin_kristy/13480) übernommen",
  (datei.profile || []).some((p) => p.vollname === "Kristy Augustin" &&
    (p.offizielleQuellen || []).some((q) => q.url.includes("/augustin_kristy/13480"))));
check("Vorgegebene amtliche Seite von Falk Peschel (…/peschel_falk/40626) übernommen",
  (datei.profile || []).some((p) => p.vollname === "Falk Peschel" &&
    (p.offizielleQuellen || []).some((q) => q.url.includes("/peschel_falk/40626"))));

abschnitt("Bereits festgestellte Korrekturen bleiben eingehalten");

const augustin = (datei.profile || []).find((p) => p.vollname === "Kristy Augustin");
check("Kristy Augustin als Listenmandat geführt (Listenplatz 2, NICHT Wahlkreis 34)",
  !!augustin && augustin.listenmandat === true && !augustin.wahlkreis);
const dorst = (datei.profile || []).find((p) => p.vollname === "Christian Dorst");
check("Christian Dorst ohne ungeprüfte Infrastrukturausschuss-Mitgliedschaft",
  !!dorst && !(dorst.ausschuesse || []).some((a) => /Infrastruktur/i.test(a)));
// Peschel: der amtliche Live-Abgleich (Actions-Lauf 1, 24.08.2026) ergab eine jüngere
// Umbesetzung — Hauptausschuss und die stellv. Angaben sind amtlich NICHT (mehr) geführt.
const peschel = (datei.profile || []).find((p) => p.vollname === "Falk Peschel");
const peschelAlle = [...((peschel && peschel.ausschuesse) || []), ...((peschel && peschel.stellvertretendeAusschuesse) || [])];
check("Falk Peschel ohne Haushaltskontroll- und ohne Hauptausschuss-Angabe (amtlich nicht geführt)",
  !!peschel && !peschelAlle.some((a) => /Haushaltskontrolle|^Hauptausschuss$/i.test(a)));
check("Falk Peschels Notiz dokumentiert Abrufzeit und Umbesetzung",
  !!peschel && /17:32:48 TR/.test(String(peschel.notiz || "")) && /NICHT \(mehr\) geführt/i.test(String(peschel.notiz || "")));

abschnitt("Korrekturen aus dem amtlichen Live-Abgleich (Actions-Lauf 1)");

const luettmann = (datei.profile || []).find((p) => p.vollname === "Björn Lüttmann");
check("Björn Lüttmann als Listenmandat (amtlich Landesliste Platz 7, kein Wahlkreis-Eintrag)",
  !!luettmann && luettmann.listenmandat === true && !luettmann.wahlkreis);
const meyer = (datei.profile || []).find((p) => p.vollname === "Jenny Meyer");
check("Jenny Meyer mit amtlichem Namen „Ausschuss für Infrastruktur und Landesplanung“",
  !!meyer && (meyer.ausschuesse || []).includes("Ausschuss für Infrastruktur und Landesplanung") &&
  !(meyer.ausschuesse || []).some((a) => /Landesentwicklung/.test(a)));
const liedtke = (datei.profile || []).find((p) => p.vollname === "Prof. Dr. Ulrike Liedtke");
check("Liedtke mit amtlicher Schreibweise „Wahlkreis 03“ und Hauptausschuss",
  !!liedtke && liedtke.wahlkreis === "Wahlkreis 03 (Ostprignitz-Ruppin I)" &&
  (liedtke.ausschuesse || []).includes("Hauptausschuss"));
const bretz = (datei.profile || []).find((p) => p.vollname === "Steeven Bretz");
check("Bretz: Hauptausschuss ordentlich, keine stellvertretenden Altangaben",
  !!bretz && (bretz.ausschuesse || []).includes("Hauptausschuss") &&
  !(bretz.stellvertretendeAusschuesse || []).length);

abschnitt("Empfohlene erste Brandenburger Gruppe (nur Vorbereitung)");

for (const n of EMPFOHLENE_ERSTE_GRUPPE) {
  const p = (datei.profile || []).find((x) => x.vollname === n);
  check(`empfohlen und deaktiviert: ${n}`,
    !!p && p.parlament === "landtag-brandenburg" && p.aktiv === false);
}
check("Jenny Meyer (nicht Christian Dorst) ist das Infrastruktur-Profil der Empfehlung",
  EMPFOHLENE_ERSTE_GRUPPE.includes("Jenny Meyer") && !EMPFOHLENE_ERSTE_GRUPPE.includes("Christian Dorst"));

console.log(`\n== ERGEBNIS ==`);
console.log(`PASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
if (fail > 0) {
  console.log("Das Paket ist NICHT abnahmefähig — Befunde oben.");
  process.exit(1);
}
console.log("Das lokale Importpaket ist formal importierbar, vollständig deaktiviert und dublettenfrei.");
console.log("Die inhaltliche Richtigkeit gegen die amtlichen Live-Seiten prüft NICHT dieser Offline-Test,");
console.log("sondern der rein lesende Actions-Lauf (.github/workflows/profil-quellen-verifikation.yml).");
