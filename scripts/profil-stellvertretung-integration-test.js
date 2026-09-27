"use strict";

// Helmut — gezielter Integrationstest: ausschliesslich STELLVERTRETENDE
// Ausschussmitgliedschaften (Roadmap §3, belegter Integrationsfehler 27.09.2026).
// =============================================================================================
// Belegter Fehler: `lage-textqualitaet.profilKontext` und `dip-vorgangsfakten` fuehrten
// stellvertretende Mitgliedschaften bereits getrennt, aber `profil-import.js` (Fachachse),
// `config.profileCompleteness`, `profile-validation.validateProfile`,
// `profile-readiness.bewerteBundestagsprofil` und `scheduler.mandateNewsSources` ignorierten
// sie; `quellenarchitektur/profile-packages.profileFieldset` las nur snake_case
// `stellvertretende_ausschuesse`, nicht camelCase `deputyCommittees`.
//
// Dieser Test fuehrt EIN synthetisches Nur-Stellvertretungs-Profil durch den ECHTEN Pfad:
//   Import -> zuHelmutProfil -> Storage-Serializer/Leser -> Vollstaendigkeit/Readiness
//   -> Paketzuordnung -> Scheduler-Quellen.
// Abnahme: belegtes nichtleeres Stellvertretungsfeld zaehlt als fachliche Achse; der
// Scheduler nimmt eine Stellvertretung NUR als Fallback ohne ordentlichen Ausschuss; die
// Mitgliedschaftsart wird nicht umgedeutet, keine Themen/Positionen erfunden, keine
// Schwellen abgesenkt. Negativproben: leere Stellvertretung, unbekannter/alter
// Bundestagsausschuss, Rollenkonflikt — und unveraendertes Verhalten fuer ordentliche Profile.
//
// KEIN Netz, keine DB, kein Modell, keine Production-Aktion. Reine Offline-Pruefung.
//
// Aufruf:  node scripts/lokal.js -- node scripts/profil-stellvertretung-integration-test.js

const IMPORT = require("../lib/helmut/profil-import.js");
const config = require("../lib/helmut/config.js");
const validation = require("../lib/helmut/profile-validation.js");
const readiness = require("../lib/helmut/profile-readiness.js");
const storage = require("../lib/helmut/storage.js");
const sched = require("../lib/helmut/scheduler.js");
const packages = require("../lib/helmut/quellenarchitektur/profile-packages.js");

process.env.HELMUT_SOURCE_MODE = process.env.HELMUT_SOURCE_MODE || "off";

let pass = 0;
let fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function eq(x, y) { return JSON.stringify(x) === JSON.stringify(y); }

// Ein synthetisches Bundestagsprofil, das AUSSCHLIESSLICH stellvertretende
// Ausschussmitgliedschaften traegt (keine ordentlichen Ausschuesse, keine Themen).
function nurStellvertretung(ueber = {}) {
  return {
    mandatsId: "rt-stv-abgeordneter",
    vollname: "Stellvertretende Testperson",
    parlament: "bundestag",
    partei: "Testpartei",
    fraktion: "Testpartei",
    bundesland: "Berlin",
    wahlkreis: "Testkreis Mitte",
    stellvertretendeAusschuesse: ["Ausschuss für Arbeit und Soziales"],
    offizielleQuellen: [{ art: "parlament-profil", url: "https://www.bundestag.de/abgeordnete/stv-test" }],
    aktiv: false,
    ...ueber
  };
}

// ── 1 · Import: eine belegte Stellvertretung traegt die fachliche Achse ───────────────────
abschnitt("1 · Import akzeptiert ein Nur-Stellvertretungs-Profil (Achse belegt)");
const rohEingang = nurStellvertretung();
const rohKopie = JSON.parse(JSON.stringify(rohEingang));
const einzel = IMPORT.pruefeProfil(rohEingang);
check("1.1 pruefeProfil: ok (kein schwerpunkt-fehlt)", einzel.ok === true,
  JSON.stringify(einzel.fehler.map((f) => f.code)));
check("1.2 keine Fehler und kein fehlendes Ausschussfeld", einzel.fehler.length === 0);

// ── 2 · zuHelmutProfil: Rollen bleiben strikt getrennt, nichts wird befördert ──────────────
abschnitt("2 · zuHelmutProfil trennt ordentlich/stellvertretend, aktiv=false");
const helmut = IMPORT.zuHelmutProfil(rohEingang);
check("2.1 committees bleibt leer (keine Beförderung zur ordentlichen Mitgliedschaft)",
  Array.isArray(helmut.committees) && helmut.committees.length === 0, JSON.stringify(helmut.committees));
check("2.2 committee bleibt leer", helmut.committee === "");
check("2.3 deputyCommittees traegt die belegte Stellvertretung",
  eq(helmut.deputyCommittees, ["Ausschuss für Arbeit und Soziales"]), JSON.stringify(helmut.deputyCommittees));
check("2.4 focusTopics bleibt leer (keine erfundenen Themen)",
  Array.isArray(helmut.focusTopics) && helmut.focusTopics.length === 0);
check("2.5 Import aktiviert nie", helmut.profileActive === false);

// ── 3 · Echter Storage-Serializer/Leser: Roundtrip bleibt getrennt ─────────────────────────
abschnitt("3 · Storage-Hin-/Rueckweg (toMandateProfileRow/fromMandateProfileRow)");
const row = storage.toMandateProfileRow(helmut);
check("3.1 serialisierte Zeile: ausschuesse leer", Array.isArray(row.ausschuesse) && row.ausschuesse.length === 0);
check("3.2 serialisierte Zeile: stellvertretende_ausschuesse belegt",
  eq(row.stellvertretende_ausschuesse, ["Ausschuss für Arbeit und Soziales"]), JSON.stringify(row.stellvertretende_ausschuesse));
const gelesen = storage.fromMandateProfileRow({ id: helmut.id, name: helmut.fullName }, row);
check("3.3 gelesene committees leer/undefiniert",
  !Array.isArray(gelesen.committees) || gelesen.committees.length === 0, JSON.stringify(gelesen.committees));
check("3.4 gelesene deputyCommittees belegt",
  eq(gelesen.deputyCommittees, ["Ausschuss für Arbeit und Soziales"]), JSON.stringify(gelesen.deputyCommittees));
check("3.5 gelesenes committee bleibt leer", !gelesen.committee);
check("3.6 Identitaet/Fraktion ueberleben unveraendert",
  gelesen.fullName === "Stellvertretende Testperson" && gelesen.party === "Testpartei");

// ── 4 · Vollstaendigkeit und Readiness: Stellvertretung ist die fachliche Achse ────────────
abschnitt("4 · config.profileCompleteness und validateProfile");
const komplett = config.profileCompleteness(gelesen);
check("4.1 profileCompleteness meldet committee_or_topics NICHT als fehlend",
  !komplett.missing.includes("committee_or_topics"), JSON.stringify(komplett.missing));
const geprueft = validation.validateProfile(gelesen);
check("4.2 validateProfile meldet schwerpunkt_oder_ausschuss NICHT als fehlend",
  !geprueft.missingRequired.includes("schwerpunkt_oder_ausschuss"), JSON.stringify(geprueft.missingRequired));

abschnitt("5 · profile-readiness.bewerteBundestagsprofil");
const reife = readiness.bewerteBundestagsprofil(gelesen);
check("5.1 zutreffend + inhaltlich bereit", reife.zutreffend === true && reife.bereit === true,
  JSON.stringify({ fehlend: reife.fehlend, ungueltig: reife.ungueltig, widersprueche: reife.widersprueche }));
check("5.2 fachliche Achse nicht mehr als fehlend", !reife.fehlend.some((f) => f.feld === "schwerpunkt_oder_ausschuss"));
check("5.3 kein ungueltiger Eintrag (belegte WP-21-Bezeichnung)", reife.ungueltig.length === 0);
check("5.4 kein Rollenkonflikt", reife.widersprueche.length === 0);
const ausschussWarnung = reife.warnungen.find((w) => w.feld === "committees");
check("5.5 Ausschuss-Warnung nennt den Stellvertretungs-Fallback, nicht den Entfall des Themenradars",
  Boolean(ausschussWarnung) && /stellvertretung/i.test(ausschussWarnung.hinweis)
  && !/Themenradar \(Quelle Nr\. 4\) und Radar-Ausschussbeleg entfallen/.test(ausschussWarnung.hinweis),
  ausschussWarnung && ausschussWarnung.hinweis);

// ── 6 · Paketzuordnung: camelCase deputyCommittees wie snake_case ──────────────────────────
abschnitt("6 · profile-packages.profileFieldset nimmt camelCase deputyCommittees");
const pakete = packages.resolveProfilePackages(gelesen);
check("6.1 stellvertretender Sozialausschuss -> Paket arbeit-und-soziales",
  pakete.optional.includes("arbeit-und-soziales"), JSON.stringify(pakete.optional));
check("6.2 Pflicht-Basispaket bund-basis vorhanden", pakete.required.includes("bund-basis"));

// ── 7 · Scheduler: Ausschussquelle nutzt die Stellvertretung als Fallback ──────────────────
abschnitt("7 · scheduler.mandateNewsSources (Fallback)");
const quellen = sched.mandateNewsSources(gelesen);
const ausschussQuelle = quellen.find((q) => q.id === `${gelesen.id}-news-ausschuss-themen`);
check("7.1 Ausschuss-Themenradar (Quelle Nr. 4) entsteht aus der Stellvertretung",
  Boolean(ausschussQuelle), quellen.map((q) => q.id).join(", "));
check("7.2 Quelle nennt die belegte Stellvertretung woertlich",
  Boolean(ausschussQuelle) && ausschussQuelle.name.includes("Ausschuss für Arbeit und Soziales")
  && decodeURIComponent(ausschussQuelle.url).includes("Ausschuss für Arbeit und Soziales"),
  ausschussQuelle && ausschussQuelle.url);
check("7.3 keine Umdeutung: queryTerms traegt keine erfundenen Themen",
  eq(ausschussQuelle.queryTerms, ["Ausschuss für Arbeit und Soziales"]), JSON.stringify(ausschussQuelle.queryTerms));

abschnitt("8 · Fallback-Regel: ordentlicher Ausschuss hat Vorrang");
const ordentlichUndStv = { ...gelesen, committees: ["Haushaltsausschuss"] };
const q2 = sched.mandateNewsSources(ordentlichUndStv).find((q) => q.id === `${ordentlichUndStv.id}-news-ausschuss-themen`);
check("8.1 bei ordentlichem Ausschuss nutzt Nr. 4 den ORDENTLICHEN, nicht die Stellvertretung",
  Boolean(q2) && q2.name.includes("Haushaltsausschuss") && !q2.name.includes("Arbeit und Soziales"),
  q2 && q2.name);

// ── 9 · Negativproben ─────────────────────────────────────────────────────────────────────
abschnitt("9 · Negativproben");
const leereStv = IMPORT.pruefeProfil(nurStellvertretung({ stellvertretendeAusschuesse: [] }));
check("9.1 leere Stellvertretung -> schwerpunkt-fehlt",
  leereStv.ok === false && leereStv.fehler.some((f) => f.code === "schwerpunkt-fehlt"),
  JSON.stringify(leereStv.fehler.map((f) => f.code)));
const readLeer = readiness.bewerteBundestagsprofil({ ...gelesen, deputyCommittees: [] });
check("9.2 leere Stellvertretung -> fachliche Achse wieder offen",
  !readLeer.bereit && readLeer.fehlend.some((f) => f.feld === "schwerpunkt_oder_ausschuss"));

const altStv = readiness.bewerteBundestagsprofil({ ...gelesen, deputyCommittees: ["Ausschuss für Inneres und Heimat"] });
check("9.3 alter/unbekannter BT-Ausschuss als Stellvertretung -> ungueltig (WP-21-Namenspruefung bleibt streng)",
  !altStv.bereit && altStv.ungueltig.some((u) => u.feld === "deputyCommittees"),
  JSON.stringify(altStv.ungueltig));

const konflikt = readiness.bewerteBundestagsprofil({ ...gelesen, committees: ["Haushaltsausschuss"], deputyCommittees: ["Haushaltsausschuss"] });
check("9.4 ordentlich + stellvertretend fuer denselben Ausschuss -> Konfliktsperre",
  !konflikt.bereit && konflikt.widersprueche.some((w) => w.feld === "committees/deputyCommittees"),
  JSON.stringify(konflikt.widersprueche));

// ── 10 · Ordentliches Profilverhalten unveraendert ────────────────────────────────────────
abschnitt("10 · Ordentliches Profil verhaelt sich unveraendert");
const nurOrdentlich = { ...gelesen, committees: ["Haushaltsausschuss"], deputyCommittees: undefined };
const eOrdentlich = readiness.bewerteBundestagsprofil(nurOrdentlich);
check("10.1 ordentlicher Ausschuss -> bereit, keine Ausschuss-Warnung",
  eOrdentlich.bereit === true && !eOrdentlich.warnungen.some((w) => w.feld === "committees"));
check("10.2 ordentliche Achse in profileCompleteness/validateProfile",
  !config.profileCompleteness(nurOrdentlich).missing.includes("committee_or_topics")
  && !validation.validateProfile(nurOrdentlich).missingRequired.includes("schwerpunkt_oder_ausschuss"));
const qOrdentlich = sched.mandateNewsSources(nurOrdentlich).find((q) => q.id === `${nurOrdentlich.id}-news-ausschuss-themen`);
check("10.3 Scheduler Nr. 4 nutzt den ordentlichen Ausschuss",
  Boolean(qOrdentlich) && qOrdentlich.name.includes("Haushaltsausschuss"));

// ── 11 · Keine Mutation, kein erfundenes Feld ─────────────────────────────────────────────
abschnitt("11 · Eingabe bleibt unveraendert (keine stille Mutation)");
const vorher = JSON.parse(JSON.stringify(rohEingang));
IMPORT.pruefeProfil(rohEingang);
IMPORT.zuHelmutProfil(rohEingang);
check("11.1 Eingabeprofil unveraendert", JSON.stringify(rohEingang) === JSON.stringify(vorher));
check("11.2 keine erfundenen Felder/Themen im Importprofil",
  JSON.stringify(rohKopie) === JSON.stringify(vorher)
  && !Object.prototype.hasOwnProperty.call(helmut, "stellvertretendeAusschuesse"));

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: Stellvertretungs-Integration ${pass} bestanden, ${fail} fehlgeschlagen`);
if (fail !== 0) process.exitCode = 1;
