"use strict";

// Helmut — Quellenarchitektur · EXTERNE fachliche Sollmenge: die staendigen Ausschuesse des
// 21. Deutschen Bundestages.
//
// WARUM DIESE DATEI EXISTIERT
// ---------------------------
// Die Vollstaendigkeitspruefung des neutralen Pflicht-Basispakets ("bund-basis" sagt im
// `purpose` ALLE Ausschuesse zu) war zuvor **katalogrelativ**: die Sollmenge wurde aus dem
// Katalog selbst abgeleitet. Damit konnte sie nur beweisen, dass jeder Ausschuss, den der
// Katalog kennt, im Pflichtpaket liegt — nicht, dass der Katalog die richtige Menge kennt.
// Genau dort lag der Fehler: der Katalog fuehrte **23** Ausschuesse, der 21. Bundestag hat
// **24**.
//
// Diese Datei ist deshalb eine EXTERN VERANKERTE Sollmenge. Sie wird NICHT aus dem Katalog
// abgeleitet, sondern aus dem Einsetzungsbeschluss des Bundestages, und der Katalog wird
// gegen sie geprueft (nicht umgekehrt).
//
// PRIMAERQUELLEN
// --------------
// Einsetzungsbeschluss: Deutscher Bundestag, Drucksache 21/150 vom 13.05.2025 ("Einsetzung von
// Ausschuessen", gemeinsamer Antrag CDU/CSU + SPD), angenommen am 15.05.2025 -> 24 staendige
// Ausschuesse. Amtliche Bekanntgabe von Zahl UND Aufzaehlung:
//   - bundestag.de/dokumente/textarchiv/2025/kw20-de-einsetzung-ausschuesse-1064982
//     ("Bundestag beschliesst die Einsetzung von 24 staendigen Ausschuessen") — zaehlt alle 24
//     Ausschuesse in der Reihenfolge des Beschlusses mit ihren Mitgliederzahlen auf
//   - bundestag.de/presse/hib/kurzmeldungen-1065308 ("Einsetzung von 24 staendigen Ausschuessen")
//   - bundestag.de/dokumente/textarchiv/2025/kw33-ausschuesse-erklaertext-1104972
//     ("24 staendige Ausschuesse bereiten die Beschluesse des Bundestages vor")
//
// ABRUFGRENZE (bewusst dokumentiert, nicht kaschiert): Der VOLLTEXT der Drucksache 21/150 ist aus
// der Arbeitsumgebung nicht abrufbar — dserver.bundestag.de liefert auf jedem Pfad HTTP 403, DIP
// ist eine JavaScript-Anwendung. Zahl, Aufzaehlung und Reihenfolge stammen deshalb aus den oben
// genannten AMTLICHEN Bundestagsseiten zum Beschluss (nicht aus Drittquellen), die amtliche
// BEZEICHNUNG jedes einzelnen Ausschusses zusaetzlich je Eintrag aus einer eigenen amtlichen
// Fundstelle der 21. Wahlperiode (kanonische Ausschussseite bzw. Ausschuss-Tagesordnung).
// Keine Drittquelle ist in diese Datei eingeflossen.
//
// Die Bezeichnungen sind bewusst WOERTLICH uebernommen — mehrere Ausschuesse wurden zur
// 21. Wahlperiode umbenannt oder neu zusammengesetzt, und eine Umbenennung darf hier nicht durch
// eine gleich bleibende Anzahl unbemerkt bleiben. Der Innenausschuss belegt, warum das
// wahlperiodengenau gepflegt werden muss: 18. WP "Innenausschuss" -> 19./20. WP "Ausschuss fuer
// Inneres und Heimat" -> 21. WP wieder "Innenausschuss".
//
// REINE DATEN. Kein Netz, keine KI, kein Storage-Zugriff. Diese Datei wird NICHT automatisch
// aktualisiert: eine neue Wahlperiode oder eine Umbenennung ist eine bewusste, belegpflichtige
// Pflege dieser Datei (und macht die Pruefungen bis dahin rot — das ist gewollt).

// Wahlperiode, auf die sich die Sollmenge bezieht. Aendert sich die Wahlperiode, muss die Liste
// gegen den neuen Einsetzungsbeschluss geprueft werden.
const WAHLPERIODE = 21;

const EINSETZUNGSBESCHLUSS = Object.freeze({
  wahlperiode: WAHLPERIODE,
  drucksache: "21/150",
  drucksache_datum: "2025-05-13",
  beschluss_datum: "2025-05-15",
  staendige_ausschuesse: 24,
  titel: "Einsetzung von Ausschuessen",
  // Amtlich mitberichtet: der 21. Bundestag setzt EINEN Ausschuss weniger ein als der 20.
  // (20. WP: 25 staendige Ausschuesse, konstituiert am 15.12.2021).
  vorherige_wahlperiode: Object.freeze({
    wahlperiode: 20,
    staendige_ausschuesse: 25,
    beleg: "bundestag.de/webarchiv/Ausschuesse/ausschuesse20"
  }),
  belege: Object.freeze([
    "bundestag.de/dokumente/textarchiv/2025/kw20-de-einsetzung-ausschuesse-1064982",
    "bundestag.de/presse/hib/kurzmeldungen-1065308",
    "bundestag.de/dokumente/textarchiv/2025/kw33-ausschuesse-erklaertext-1104972"
  ]),
  // Der Volltext der Drucksache selbst ist aus der Arbeitsumgebung nicht abrufbar (HTTP 403).
  // Das ist eine Abrufgrenze, KEINE Beleglucke: Zahl, Aufzaehlung und Reihenfolge stehen in den
  // amtlichen Bundestagsseiten oben. Wer den Volltext hat, prueft gegen dieselbe Sollmenge.
  volltext_abrufbar: false,
  volltext_fundstelle: "dserver.bundestag.de/btd/21/001/2100150.pdf"
});

// Die 24 staendigen Ausschuesse. `key` ist eine STABILE fachliche Kennung (nicht die
// Katalog-Id und nicht der amtliche Name) — sie ueberlebt Umbenennungen und ist der
// Verknuepfungspunkt zum Quellenkatalog. Deshalb heisst der Innenausschuss hier weiterhin
// `inneres-heimat`: die Kennung wird bei einer Umbenennung ABSICHTLICH nicht mitgezogen, sonst
// waere sie keine stabile Kennung. `name` ist die amtliche Bezeichnung, WOERTLICH.
//
// `nummer` ist die amtliche Ausschussnummer = die Position in der Aufzaehlung des
// Einsetzungsbeschlusses (Beleg: die drei amtlichen Beschlussseiten in EINSETZUNGSBESCHLUSS.belege,
// die alle 24 Ausschuesse in dieser Reihenfolge mit Mitgliederzahlen auffuehren). Unabhaengig
// bestaetigt durch die amtlichen Dokument-Praefixe der 21. WP: `a13-28-TO.pdf` (Bildung/Familie =
// 13) und `PA22_to09/to13/to14` (Kultur und Medien = 22). Die Nummerierung gilt je Wahlperiode und
// ist NICHT uebertragbar — in der 20. WP war Tourismus `a20`, in der 21. WP ist er Nr. 23.
const STAENDIGE_AUSSCHUESSE = Object.freeze([
  { nummer: 1, key: "wahlpruefung-immunitaet-geschaeftsordnung", name: "Ausschuss für Wahlprüfung, Immunität und Geschäftsordnung", beleg: "bundestag.de/resource/blob/1178498/to07.pdf (21. WP, 7. Sitzung); bundestag.de/go" },
  { nummer: 2, key: "petitionen", name: "Petitionsausschuss", beleg: "Art. 45c GG; bundestag.de/petitionsausschuss (21. WP)" },
  { nummer: 3, key: "auswaertiges", name: "Auswärtiger Ausschuss", beleg: "Art. 45a GG; bundestag.de/resource/blob/1194628/TO-27-08-07-2026.pdf (21. WP, 27. Sitzung)" },
  { nummer: 4, key: "inneres-heimat", name: "Innenausschuss", beleg: "bundestag.de/inneres (kanonische Ausschussseite 21. WP, Titel „Deutscher Bundestag - Innenausschuss“); bundestag.de/resource/blob/1188034/to037.pdf (21. WP, 37. Sitzung)" },
  { nummer: 5, key: "sport-ehrenamt", name: "Ausschuss für Sport und Ehrenamt", beleg: "bundestag.de/resource/blob/1150374/to18.pdf (21. WP, 18. Sitzung)" },
  { nummer: 6, key: "recht-verbraucherschutz", name: "Ausschuss für Recht und Verbraucherschutz", beleg: "bundestag.de/resource/blob/1190632/to_042-pdf.pdf (21. WP, 42. Sitzung)" },
  { nummer: 7, key: "finanzen", name: "Finanzausschuss", beleg: "bundestag.de/finanzen (21. WP)" },
  { nummer: 8, key: "haushalt", name: "Haushaltsausschuss", beleg: "bundestag.de/resource/blob/1178354/to_010.pdf (21. WP, 10. Sitzung)" },
  { nummer: 9, key: "wirtschaft-energie", name: "Ausschuss für Wirtschaft und Energie", beleg: "bundestag.de/resource/blob/1193326/to_43_08-07-2026.pdf (21. WP, 43. Sitzung)" },
  { nummer: 10, key: "landwirtschaft-ernaehrung-heimat", name: "Ausschuss für Landwirtschaft, Ernährung und Heimat", beleg: "bundestag.de/resource/blob/1185078/TO_27_Sitzung_am_24_06_2026.pdf (21. WP, 27. Sitzung)" },
  { nummer: 11, key: "arbeit-soziales", name: "Ausschuss für Arbeit und Soziales", beleg: "bundestag.de/resource/blob/1178496/TO_30-20-05-2026-Internet.pdf (21. WP, 30. Sitzung)" },
  { nummer: 12, key: "verteidigung", name: "Verteidigungsausschuss", beleg: "Art. 45a GG; bundestag.de/verteidigung (21. WP)" },
  { nummer: 13, key: "bildung-familie-senioren-frauen-jugend", name: "Ausschuss für Bildung, Familie, Senioren, Frauen und Jugend", beleg: "bundestag.de/resource/blob/1193316/a13-28-TO.pdf (21. WP, 28. Sitzung; Praefix a13 = Ausschuss Nr. 13)" },
  { nummer: 14, key: "gesundheit", name: "Ausschuss für Gesundheit", beleg: "bundestag.de/resource/blob/1193358/to_052.pdf (21. WP, 52. Sitzung)" },
  { nummer: 15, key: "verkehr", name: "Verkehrsausschuss", beleg: "bundestag.de/ausschuesse/verkehr (kanonische Ausschussseite 21. WP, Titel „Deutscher Bundestag - Verkehrsausschuss“); bundestag.de/resource/blob/1149142/21-Sitzung-23-02-2026.pdf (21. WP, 21. Sitzung)" },
  { nummer: 16, key: "umwelt-klimaschutz-naturschutz-nukleare-sicherheit", name: "Ausschuss für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit", beleg: "bundestag.de/ausschuesse/umwelt; bundestag.de/resource/blob/1193498/to-40.pdf (21. WP, 40. Sitzung)" },
  { nummer: 17, key: "menschenrechte-humanitaere-hilfe", name: "Ausschuss für Menschenrechte und humanitäre Hilfe", beleg: "bundestag.de/resource/blob/1193250/to_27.pdf (21. WP, 27. Sitzung)" },
  { nummer: 18, key: "forschung-technologie-raumfahrt", name: "Ausschuss für Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung", beleg: "bundestag.de/ausschuesse/forschung; bundestag.de/resource/blob/1150576/to16_04-03-2026.pdf (21. WP, 16. Sitzung)" },
  { nummer: 19, key: "wirtschaftliche-zusammenarbeit-entwicklung", name: "Ausschuss für wirtschaftliche Zusammenarbeit und Entwicklung", beleg: "bundestag.de/resource/blob/1193788/11_Wortprotokoll_17-12-2025.pdf (21. WP, 11. Sitzung)" },
  { nummer: 20, key: "europaeische-union", name: "Ausschuss für die Angelegenheiten der Europäischen Union", beleg: "Art. 45 GG; bundestag.de/resource/blob/1193210/28-Sitzung_08-07-2026.pdf (21. WP, 28. Sitzung)" },
  { nummer: 21, key: "digitales-staatsmodernisierung", name: "Ausschuss für Digitales und Staatsmodernisierung", beleg: "bundestag.de/resource/blob/1192024/TO-31-Sitzung.pdf (21. WP, 31. Sitzung)" },
  { nummer: 22, key: "kultur-medien", name: "Ausschuss für Kultur und Medien", beleg: "bundestag.de/resource/blob/1139146/PA22_to14-pdf.pdf (21. WP, 14. Sitzung; Praefix PA22 = Ausschuss Nr. 22)" },
  { nummer: 23, key: "tourismus", name: "Ausschuss für Tourismus", beleg: "bundestag.de/resource/blob/1190982/to32.pdf (21. WP, 32. Sitzung)" },
  { nummer: 24, key: "wohnen-stadtentwicklung-bauwesen-kommunen", name: "Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen", beleg: "bundestag.de/resource/blob/1193336/28-Sitzung-08-07-2026-TO.pdf (21. WP, 28. Sitzung)" }
]);

// Bezeichnungen, die NACHWEISLICH einer FRUEHEREN Wahlperiode gehoeren und in der 21. WP nicht
// mehr existieren. Dient als Negativkontrolle: ein solcher Eintrag im Katalog muss die Pruefung
// rot machen, auch wenn die Gesamtzahl stimmt (Umbenennung/Zusammenlegung).
// Belege: Webarchiv der 20. Wahlperiode auf bundestag.de.
const VERALTETE_AUSSCHUSSNAMEN = Object.freeze([
  { name: "Ausschuss für Ernährung und Landwirtschaft", wahlperiode: 20, beleg: "bundestag.de/webarchiv/Ausschuesse/ausschuesse20/a10_ernaehrung_landwirtschaft" },
  { name: "Ausschuss für Digitales", wahlperiode: 20, beleg: "bundestag.de/resource/blob/956264/…/to042-data.pdf (20. WP, Ausschuss für Digitales)" },
  { name: "Ausschuss für Inneres und Heimat", wahlperiode: 20, beleg: "bundestag.de/webarchiv/Ausschuesse/ausschuesse20/a04_inneres (Titel „Deutscher Bundestag - Ausschuss für Inneres und Heimat“)" },
  { name: "Ausschuss für Verkehr und digitale Infrastruktur", wahlperiode: 19, beleg: "bundestag.de/webarchiv/Ausschuesse/ausschuesse19/a15_Verkehr" }
]);

const AUSSCHUSS_KEYS = Object.freeze(STAENDIGE_AUSSCHUESSE.map((a) => a.key));
const AUSSCHUSS_NAMEN = Object.freeze(STAENDIGE_AUSSCHUESSE.map((a) => a.name));

// Amtliche Bezeichnungsform eines Bundestagsausschusses: entweder "Ausschuss für <Zustaendigkeit>"
// oder ein Kompositum "<Feld>ausschuss" (Innenausschuss, Finanzausschuss, Verkehrsausschuss, …),
// dazu der Sonderfall "Auswärtiger Ausschuss". Das ist eine TIPPFEHLER-Schranke, kein
// Inhaltsbeweis — dass die Bezeichnung die richtige ist, belegt `beleg` je Eintrag.
const AMTLICHE_BEZEICHNUNGSFORM = /^(Ausschuss für .+|Auswärtiger Ausschuss|[A-ZÄÖÜ][a-zäöüß]+ausschuss)$/;

// Selbstschutz der Sollmenge: Anzahl und Eindeutigkeit muessen zum Einsetzungsbeschluss passen.
// Ein Tippfehler oder ein doppelter Eintrag darf nicht als "vollstaendig" durchgehen.
function validateSollmenge() {
  const fehler = [];
  if (STAENDIGE_AUSSCHUESSE.length !== EINSETZUNGSBESCHLUSS.staendige_ausschuesse) {
    fehler.push(`Anzahl ${STAENDIGE_AUSSCHUESSE.length} != Einsetzungsbeschluss ${EINSETZUNGSBESCHLUSS.staendige_ausschuesse}`);
  }
  if (new Set(AUSSCHUSS_KEYS).size !== AUSSCHUSS_KEYS.length) fehler.push("doppelte Kennung");
  if (new Set(AUSSCHUSS_NAMEN).size !== AUSSCHUSS_NAMEN.length) fehler.push("doppelte Bezeichnung");
  STAENDIGE_AUSSCHUESSE.forEach((a, i) => {
    if (!a.key || !/^[a-z0-9-]+$/.test(a.key)) fehler.push(`ungueltige Kennung: ${a.key}`);
    if (!a.name || !AMTLICHE_BEZEICHNUNGSFORM.test(a.name)) {
      fehler.push(`ungueltige Bezeichnung: ${a.name}`);
    }
    // Die Reihenfolge der Liste IST die amtliche Ausschussnummerierung. Ein Umsortieren ohne
    // Anpassen der Nummer (oder umgekehrt) muss auffallen.
    if (a.nummer !== i + 1) fehler.push(`Ausschussnummer passt nicht zur Reihenfolge: ${a.key} (nummer=${a.nummer}, Position=${i + 1})`);
    if (!a.beleg) fehler.push(`Beleg fehlt: ${a.key}`);
  });
  const veraltet = AUSSCHUSS_NAMEN.filter((n) => VERALTETE_AUSSCHUSSNAMEN.some((v) => v.name === n));
  if (veraltet.length) fehler.push(`veraltete Bezeichnung in der Sollmenge: ${veraltet.join(", ")}`);
  return { ok: fehler.length === 0, fehler };
}

function ausschussByKey(key) {
  return STAENDIGE_AUSSCHUESSE.find((a) => a.key === String(key || "")) || null;
}

function ausschussByNummer(nummer) {
  return STAENDIGE_AUSSCHUESSE.find((a) => a.nummer === Number(nummer)) || null;
}

// Ist eine Bezeichnung nachweislich die einer FRUEHEREN Wahlperiode? Liefert den Belegeintrag.
function veralteteBezeichnung(name) {
  return VERALTETE_AUSSCHUSSNAMEN.find((v) => v.name === String(name || "")) || null;
}

// Vergleich einer IST-Menge (aus dem Quellenkatalog) gegen die Sollmenge.
// `ist`: [{ key, name }]. Liefert fehlende, unbekannte und namentlich abweichende Einträge —
// eine Umbenennung erscheint als `abweichenderName`, NICHT als Zahlengleichstand.
function vergleicheMitSollmenge(ist = []) {
  const istListe = (Array.isArray(ist) ? ist : []).filter(Boolean);
  const sollByKey = new Map(STAENDIGE_AUSSCHUESSE.map((a) => [a.key, a]));
  const istByKey = new Map();
  const doppelt = [];
  for (const e of istListe) {
    const k = String(e.key || "");
    if (istByKey.has(k)) doppelt.push(k);
    else istByKey.set(k, e);
  }
  const fehlend = STAENDIGE_AUSSCHUESSE.filter((a) => !istByKey.has(a.key)).map((a) => ({ key: a.key, name: a.name }));
  const unbekannt = [...istByKey.values()]
    .filter((e) => !sollByKey.has(String(e.key || "")))
    .map((e) => ({
      key: String(e.key || ""),
      name: String(e.name || ""),
      veraltet: VERALTETE_AUSSCHUSSNAMEN.find((v) => v.name === String(e.name || "")) || null
    }));
  const abweichenderName = [...istByKey.values()]
    .filter((e) => sollByKey.has(String(e.key || "")) && sollByKey.get(String(e.key || "")).name !== String(e.name || ""))
    .map((e) => ({ key: String(e.key || ""), ist: String(e.name || ""), soll: sollByKey.get(String(e.key || "")).name }));
  return {
    wahlperiode: WAHLPERIODE,
    soll: STAENDIGE_AUSSCHUESSE.length,
    ist: istByKey.size,
    fehlend,
    unbekannt,
    abweichenderName,
    doppelt,
    vollstaendig: fehlend.length === 0 && unbekannt.length === 0 && abweichenderName.length === 0 && doppelt.length === 0
  };
}

module.exports = {
  WAHLPERIODE,
  EINSETZUNGSBESCHLUSS,
  STAENDIGE_AUSSCHUESSE,
  VERALTETE_AUSSCHUSSNAMEN,
  AUSSCHUSS_KEYS,
  AUSSCHUSS_NAMEN,
  AMTLICHE_BEZEICHNUNGSFORM,
  validateSollmenge,
  ausschussByKey,
  ausschussByNummer,
  veralteteBezeichnung,
  vergleicheMitSollmenge
};
