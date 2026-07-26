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
// Ausschuesse. Amtliche Bekanntgabe der Zahl:
//   - bundestag.de/dokumente/textarchiv/2025/kw20-de-einsetzung-ausschuesse-1064982
//     ("Bundestag beschliesst die Einsetzung von 24 staendigen Ausschuessen")
//   - bundestag.de/presse/hib/kurzmeldungen-1065308 ("Einsetzung von 24 staendigen Ausschuessen")
//
// Die amtliche BEZEICHNUNG jedes einzelnen Ausschusses ist unten je Eintrag mit einem eigenen
// amtlichen Fundstellen-Hinweis belegt (Ausschuss-Tagesordnungen der 21. Wahlperiode auf
// bundestag.de bzw. die kanonische Ausschussseite). Die Bezeichnungen sind bewusst WOERTLICH
// uebernommen — mehrere Ausschuesse wurden zur 21. Wahlperiode umbenannt oder neu
// zusammengesetzt, und eine Umbenennung darf hier nicht durch eine gleich bleibende Anzahl
// unbemerkt bleiben.
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
  belege: Object.freeze([
    "bundestag.de/dokumente/textarchiv/2025/kw20-de-einsetzung-ausschuesse-1064982",
    "bundestag.de/presse/hib/kurzmeldungen-1065308"
  ])
});

// Die 24 staendigen Ausschuesse. `key` ist eine STABILE fachliche Kennung (nicht die
// Katalog-Id und nicht der amtliche Name) — sie ueberlebt Umbenennungen und ist der
// Verknuepfungspunkt zum Quellenkatalog. `name` ist die amtliche Bezeichnung, WOERTLICH.
// Reihenfolge: wie im Einsetzungsbeschluss (Ausschussnummerierung des Bundestages).
const STAENDIGE_AUSSCHUESSE = Object.freeze([
  { key: "wahlpruefung-immunitaet-geschaeftsordnung", name: "Ausschuss für Wahlprüfung, Immunität und Geschäftsordnung", beleg: "bundestag.de/resource/blob/1178498/to07.pdf (21. WP, 7. Sitzung); bundestag.de/go" },
  { key: "petitionen", name: "Petitionsausschuss", beleg: "Art. 45c GG; bundestag.de/petitionsausschuss (21. WP)" },
  { key: "auswaertiges", name: "Auswärtiger Ausschuss", beleg: "Art. 45a GG; bundestag.de/resource/blob/1132238/TO-14-17-12-2025.pdf (21. WP)" },
  { key: "inneres-heimat", name: "Ausschuss für Inneres und Heimat", beleg: "bundestag.de/inneresundheimat (21. WP)" },
  { key: "sport-ehrenamt", name: "Ausschuss für Sport und Ehrenamt", beleg: "bundestag.de/resource/blob/1150374/to18.pdf (21. WP, 18. Sitzung)" },
  { key: "recht-verbraucherschutz", name: "Ausschuss für Recht und Verbraucherschutz", beleg: "bundestag.de/resource/blob/1188062/to_011.pdf (21. WP)" },
  { key: "finanzen", name: "Finanzausschuss", beleg: "bundestag.de/finanzen (21. WP)" },
  { key: "haushalt", name: "Haushaltsausschuss", beleg: "bundestag.de/resource/blob/1187970/to_041.pdf (21. WP, 41. Sitzung)" },
  { key: "wirtschaft-energie", name: "Ausschuss für Wirtschaft und Energie", beleg: "bundestag.de/resource/blob/1193326/to_43_08-07-2026.pdf (21. WP, 43. Sitzung)" },
  { key: "landwirtschaft-ernaehrung-heimat", name: "Ausschuss für Landwirtschaft, Ernährung und Heimat", beleg: "bundestag.de/landwirtschaft; bundestag.de/resource/blob/1194092/TO_28_Sitzung_am_08_07_2026_1_Ergaenzungsmitteilung.pdf (21. WP, 28. Sitzung)" },
  { key: "arbeit-soziales", name: "Ausschuss für Arbeit und Soziales", beleg: "bundestag.de/resource/blob/1178496/TO_30-20-05-2026-Internet.pdf (21. WP, 30. Sitzung)" },
  { key: "verteidigung", name: "Verteidigungsausschuss", beleg: "Art. 45a GG; bundestag.de/verteidigung (21. WP)" },
  { key: "bildung-familie-senioren-frauen-jugend", name: "Ausschuss für Bildung, Familie, Senioren, Frauen und Jugend", beleg: "bundestag.de/resource/blob/1193316/a13-28-TO.pdf (21. WP, 28. Sitzung)" },
  { key: "gesundheit", name: "Ausschuss für Gesundheit", beleg: "bundestag.de/resource/blob/1193358/to_052.pdf (21. WP, 52. Sitzung)" },
  { key: "verkehr", name: "Ausschuss für Verkehr", beleg: "bundestag.de/verkehr (21. WP)" },
  { key: "umwelt-klimaschutz-naturschutz-nukleare-sicherheit", name: "Ausschuss für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit", beleg: "bundestag.de/resource/blob/1193498/to-40.pdf (21. WP, 40. Sitzung)" },
  { key: "menschenrechte-humanitaere-hilfe", name: "Ausschuss für Menschenrechte und humanitäre Hilfe", beleg: "bundestag.de/resource/blob/1193250/to_27.pdf (21. WP, 27. Sitzung)" },
  { key: "forschung-technologie-raumfahrt", name: "Ausschuss für Forschung, Technologie, Raumfahrt und Technikfolgenabschätzung", beleg: "bundestag.de/ausschuesse/forschung; bundestag.de/resource/blob/1150576/to16_04-03-2026.pdf (21. WP, 16. Sitzung)" },
  { key: "wirtschaftliche-zusammenarbeit-entwicklung", name: "Ausschuss für wirtschaftliche Zusammenarbeit und Entwicklung", beleg: "bundestag.de/resource/blob/1193786/10_Wortprotokoll_03-12-2025.pdf (21. WP, 10. Sitzung)" },
  { key: "tourismus", name: "Ausschuss für Tourismus", beleg: "bundestag.de/resource/blob/1190982/to32.pdf (21. WP, 32. Sitzung)" },
  { key: "kultur-medien", name: "Ausschuss für Kultur und Medien", beleg: "bundestag.de/kulturundmedien (21. WP)" },
  { key: "digitales-staatsmodernisierung", name: "Ausschuss für Digitales und Staatsmodernisierung", beleg: "bundestag.de/resource/blob/1192024/TO-31-Sitzung.pdf (21. WP, 31. Sitzung)" },
  { key: "wohnen-stadtentwicklung-bauwesen-kommunen", name: "Ausschuss für Wohnen, Stadtentwicklung, Bauwesen und Kommunen", beleg: "bundestag.de/resource/blob/1193336/28-Sitzung-08-07-2026-TO.pdf (21. WP, 28. Sitzung)" },
  { key: "europaeische-union", name: "Ausschuss für die Angelegenheiten der Europäischen Union", beleg: "Art. 45 GG; bundestag.de/resource/blob/1193974/28-Sitzung_08-07-2026_TOE1_Internet.pdf (21. WP, 28. Sitzung)" }
]);

// Bezeichnungen, die NACHWEISLICH einer FRUEHEREN Wahlperiode gehoeren und in der 21. WP nicht
// mehr existieren. Dient als Negativkontrolle: ein solcher Eintrag im Katalog muss die Pruefung
// rot machen, auch wenn die Gesamtzahl stimmt (Umbenennung/Zusammenlegung).
// Belege: Webarchiv der 20. Wahlperiode auf bundestag.de.
const VERALTETE_AUSSCHUSSNAMEN = Object.freeze([
  { name: "Ausschuss für Ernährung und Landwirtschaft", wahlperiode: 20, beleg: "bundestag.de/webarchiv/Ausschuesse/ausschuesse20/a10_ernaehrung_landwirtschaft" },
  { name: "Ausschuss für Digitales", wahlperiode: 20, beleg: "bundestag.de/resource/blob/956264/…/to042-data.pdf (20. WP, Ausschuss für Digitales)" }
]);

const AUSSCHUSS_KEYS = Object.freeze(STAENDIGE_AUSSCHUESSE.map((a) => a.key));
const AUSSCHUSS_NAMEN = Object.freeze(STAENDIGE_AUSSCHUESSE.map((a) => a.name));

// Selbstschutz der Sollmenge: Anzahl und Eindeutigkeit muessen zum Einsetzungsbeschluss passen.
// Ein Tippfehler oder ein doppelter Eintrag darf nicht als "vollstaendig" durchgehen.
function validateSollmenge() {
  const fehler = [];
  if (STAENDIGE_AUSSCHUESSE.length !== EINSETZUNGSBESCHLUSS.staendige_ausschuesse) {
    fehler.push(`Anzahl ${STAENDIGE_AUSSCHUESSE.length} != Einsetzungsbeschluss ${EINSETZUNGSBESCHLUSS.staendige_ausschuesse}`);
  }
  if (new Set(AUSSCHUSS_KEYS).size !== AUSSCHUSS_KEYS.length) fehler.push("doppelte Kennung");
  if (new Set(AUSSCHUSS_NAMEN).size !== AUSSCHUSS_NAMEN.length) fehler.push("doppelte Bezeichnung");
  for (const a of STAENDIGE_AUSSCHUESSE) {
    if (!a.key || !/^[a-z0-9-]+$/.test(a.key)) fehler.push(`ungueltige Kennung: ${a.key}`);
    if (!a.name || !/^(Ausschuss |Auswärtiger Ausschuss|Petitionsausschuss|Finanzausschuss|Haushaltsausschuss|Verteidigungsausschuss)/.test(a.name)) {
      fehler.push(`ungueltige Bezeichnung: ${a.name}`);
    }
    if (!a.beleg) fehler.push(`Beleg fehlt: ${a.key}`);
  }
  const veraltet = AUSSCHUSS_NAMEN.filter((n) => VERALTETE_AUSSCHUSSNAMEN.some((v) => v.name === n));
  if (veraltet.length) fehler.push(`veraltete Bezeichnung in der Sollmenge: ${veraltet.join(", ")}`);
  return { ok: fehler.length === 0, fehler };
}

function ausschussByKey(key) {
  return STAENDIGE_AUSSCHUESSE.find((a) => a.key === String(key || "")) || null;
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
  validateSollmenge,
  ausschussByKey,
  vergleicheMitSollmenge
};
