"use strict";

// Helmut — Nachweis der AUTOMATISCHEN Paketzuweisung (Phase 1, Punkt 12 der Roadmap-Checkliste).
//
// Zweck: beweisen, dass ein NEU angelegtes Profil OHNE Codeaenderung automatisch die
// richtigen Quellenpakete erhaelt — und zwar nicht nur gegen den Bund-Code-Seed, sondern
// auch gegen einen Katalog in der FORM des Production-Katalogs (Landesmodule mit echten
// Abrufwegen, ein personenbezogenes Paket).
//
// Warum eine zweite Katalogform? Der Code-Seed (`buildFullModel`) traegt die Landesmodule
// nur strukturell (0 Abrufwege) und KEIN personenbezogenes Paket. Production traegt beides
// (Landesmodul-Seed + je Mandat eine `profil-<mandats-id>`-Zeile). Ein Test, der nur gegen
// den Code-Seed laeuft, kann daher nicht zeigen, dass ein Landespaket auch DANN korrekt
// nicht aktiviert wird, wenn es Abrufwege besitzt (Status `prepared` muss allein reichen).
//
// Verbindlich offline: keine DB, kein Netz, keine KI. Der produktionsfoermige Katalog wird
// aus dem Code-Seed + neutralen Platzhaltern gebaut — es liegen KEINE Production-Daten und
// keine realen Mandantendaten in diesem Repository.
//
// Deckt die 10 Pflichtpruefungen des Sprints ab (Nummerierung unten je Block).

const pp = require("../lib/helmut/quellenarchitektur/profile-packages");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const M = buildFullModel();
const seedKatalog = { packages: M.packages, packagePaths: M.packagePaths, retrievalPaths: M.retrievalPaths };

// ── Produktionsfoermiger Katalog (neutrale Platzhalter, KEINE Production-Daten) ──
// Form-Merkmale, die Production vom Code-Seed unterscheidet:
//   a) berlin-basis / brandenburg-basis tragen Abrufwege (Status weiterhin 'prepared',
//      Wege 'needs_review'/'manual'),
//   b) ein gemeinsamer Abrufweg haengt in BEIDEN Landespaketen (rbb24-Kopplung),
//   c) es existiert ein personenbezogenes Paket 'profil-<mandats-id>' als Katalogzeile.
const BESTANDS_MANDAT = "bestandsmandat-eins"; // klar kuenstlich
function baueProduktionsfoermigenKatalog() {
  const packages = M.packages.map((p) => ({ ...p }));
  const retrievalPaths = M.retrievalPaths.map((r) => ({ ...r }));
  const packagePaths = M.packagePaths.map((l) => ({ ...l }));

  const landesweg = (paket, klasse) => {
    const id = `rp-${paket}-${klasse}`;
    retrievalPaths.push({ id, legacy_source_id: `${paket}-${klasse}`, name: `Testweg ${klasse}`, status: "needs_review", activation_mode: "manual", is_critical: false });
    packagePaths.push({ package_id: `pkg-${paket}-basis`, retrieval_path_id: id });
  };
  for (const k of ["landesparlament", "plenum", "landesregierung", "staatskanzlei", "landesfraktionen", "regionale_leitmedien"]) landesweg("berlin", k);
  for (const k of ["landesparlament", "plenum", "landesregierung", "ausschuesse", "ministerien", "landesfraktionen"]) landesweg("brandenburg", k);
  // (b) ein Weg in beiden Landespaketen
  retrievalPaths.push({ id: "rp-oer-be-bb", legacy_source_id: "oer-be-bb", name: "OER Landesberichterstattung BE/BB", status: "needs_review", activation_mode: "manual", is_critical: false });
  packagePaths.push({ package_id: "pkg-berlin-basis", retrieval_path_id: "rp-oer-be-bb" });
  packagePaths.push({ package_id: "pkg-brandenburg-basis", retrieval_path_id: "rp-oer-be-bb" });
  // (c) personenbezogenes Paket eines Bestandsmandats
  packages.push({ id: `pkg-profil-${BESTANDS_MANDAT}`, key: `profil-${BESTANDS_MANDAT}`, name: "Personenbezogene Beobachtung (Testmandat)", status: "active", is_base: false, political_level: "bund", geography_id: null, required_classes: [] });
  retrievalPaths.push({ id: `rp-${BESTANDS_MANDAT}-news`, legacy_source_id: `${BESTANDS_MANDAT}-news`, name: "Personensuche (Testmandat)", status: "needs_review", activation_mode: "auto", is_critical: false });
  packagePaths.push({ package_id: `pkg-profil-${BESTANDS_MANDAT}`, retrieval_path_id: `rp-${BESTANDS_MANDAT}-news` });

  return { packages, packagePaths, retrievalPaths };
}
const prodKatalog = baueProduktionsfoermigenKatalog();

// ── Die drei geforderten Profilfaelle + ein Bestandsmandat ─────────────────────
// Alle Identitaeten sind klar kuenstlich. Kein realer Mandant, kein Pilot.
const P_BUND = { id: "testprofil-bund", fullName: "Testprofil Bundestag", partei: "SPD", fraktion: "SPD", politische_ebene: "bundestag", ausschuesse: ["Ausschuss für Arbeit und Soziales"], bundesland: "Hessen", aktiv: true, profileActive: true };
const P_BERLIN = { id: "testprofil-berlin", fullName: "Testprofil Abgeordnetenhaus", partei: "CDU", fraktion: "CDU", politische_ebene: "landtag", bundesland: "Berlin", ausschuesse: ["Ausschuss für Inneres"], aktiv: true, profileActive: true };
const P_BRANDENBURG = { id: "testprofil-brandenburg", fullName: "Testprofil Landtag Brandenburg", partei: "Die Linke", fraktion: "Die Linke", politische_ebene: "landtag", bundesland: "Brandenburg", ausschuesse: ["Ausschuss für Wirtschaft"], aktiv: true, profileActive: true };
const P_BESTAND = { id: BESTANDS_MANDAT, fullName: "Bestandsmandat Eins", partei: "Die Linke", fraktion: "Die Linke", politische_ebene: "bundestag", bundesland: "Niedersachsen", ausschuesse: ["Arbeit und Soziales"], fachpolitische_schwerpunkte: ["Rente"], regionale_interessen: ["Salzgitter"], aktiv: true, profileActive: true };

const KATALOGE = [["Code-Seed", seedKatalog], ["produktionsfoermig", prodKatalog]];

// ============ 1) Bund-Profil erhaelt Bund Basis ============
console.log("== 1) Bundestagsprofil erhaelt das Bund-Basispaket ==");
for (const [label, kat] of KATALOGE) {
  const r = pp.resolveProfilePackages(P_BUND);
  const s = pp.profileSupplyStatus(P_BUND, kat);
  check(`[${label}] required == genau ['bund-basis']`, JSON.stringify(r.required) === JSON.stringify(["bund-basis"]));
  check(`[${label}] vollstaendig aktiviert (Bund Basis active + versorgt)`, s.fullyActivated === true, s.reason);
  const a = pp.computeGlobalActivation({ ...kat, profiles: [P_BUND] });
  check(`[${label}] bund-basis technisch aktiv`, a.packageStatus.find((p) => p.key === "bund-basis").activation === "active");
}

// ============ 2) Berlin-Profil erhaelt Berlin Basis ============
console.log("== 2) Berliner Landtagsprofil erhaelt das Berlin-Basispaket ==");
for (const [label, kat] of KATALOGE) {
  const r = pp.resolveProfilePackages(P_BERLIN);
  check(`[${label}] required == ['bund-basis','berlin-basis']`, JSON.stringify([...r.required].sort()) === JSON.stringify(["berlin-basis", "bund-basis"]));
  const a = pp.computeGlobalActivation({ ...kat, profiles: [P_BERLIN] });
  const be = a.packageStatus.find((p) => p.key === "berlin-basis");
  check(`[${label}] berlin-basis wird angefordert (refCount 1)`, be.refCount === 1);
  // Kernpunkt des produktionsfoermigen Katalogs: auch MIT Abrufwegen bleibt 'prepared' inaktiv.
  check(`[${label}] berlin-basis NICHT technisch aktiv (Status prepared)`, be.activation === "requested_unsupplied", be.activation);
  const s = pp.profileSupplyStatus(P_BERLIN, kat);
  check(`[${label}] Profil ist ehrlich NICHT vollstaendig aktiviert`, s.fullyActivated === false && s.reason === "pflichtpaket-unversorgt");
  check(`[${label}] missingBasePackages nennt berlin-basis mit Grund`, s.missingBasePackages.some((m) => m.key === "berlin-basis" && /prepared/.test(m.reason)));
}

// ============ 3) Brandenburg-Profil erhaelt Brandenburg Basis ============
console.log("== 3) Brandenburger Landtagsprofil erhaelt das Brandenburg-Basispaket ==");
for (const [label, kat] of KATALOGE) {
  const r = pp.resolveProfilePackages(P_BRANDENBURG);
  check(`[${label}] required == ['brandenburg-basis','bund-basis']`, JSON.stringify([...r.required].sort()) === JSON.stringify(["brandenburg-basis", "bund-basis"]));
  const a = pp.computeGlobalActivation({ ...kat, profiles: [P_BRANDENBURG] });
  const bb = a.packageStatus.find((p) => p.key === "brandenburg-basis");
  check(`[${label}] brandenburg-basis angefordert, aber prepared -> nicht aktiv`, bb.refCount === 1 && bb.activation === "requested_unsupplied");
}

// ============ 4) Fachpakete werden korrekt ergaenzt ============
console.log("== 4) Fachpakete entstehen aus den Profildaten (nicht aus einer Namensliste) ==");
const rBund = pp.resolveProfilePackages(P_BUND);
check("Ausschuss 'Arbeit und Soziales' -> arbeit-und-soziales", rBund.optional.includes("arbeit-und-soziales"));
const rBb = pp.resolveProfilePackages(P_BRANDENBURG);
check("Partei 'Die Linke' -> die-linke-bund", rBb.optional.includes("die-linke-bund"));
check("Region Niedersachsen -> regional-niedersachsen", pp.resolveProfilePackages(P_BESTAND).optional.includes("regional-niedersachsen"));
check("Fachthema allein (ohne Ausschuss) genuegt", pp.resolveProfilePackages({ id: "t", fullName: "T", partei: "SPD", politische_ebene: "bundestag", fachpolitische_schwerpunkte: ["Mindestlohn"], profileActive: true }).optional.includes("arbeit-und-soziales"));
// Landes-Parteipakete (P0-2, Architektur-Audit 29): das Landes-BASISpaket bleibt neutral,
// das Parteipaket des Mandats kommt als eigenes, optionales Landespaket dazu.
check("Landtag Brandenburg + Die Linke -> die-linke-brandenburg", rBb.optional.includes("die-linke-brandenburg"));
check("Landtag Brandenburg + Die Linke -> NICHT die-linke-berlin", !rBb.all.includes("die-linke-berlin"));
{
  const berlinLinke = pp.resolveProfilePackages({ id: "t-be-linke", fullName: "T", partei: "Die Linke", politische_ebene: "landtag", bundesland: "Berlin", profileActive: true });
  check("Landtag Berlin + Die Linke -> die-linke-berlin", berlinLinke.optional.includes("die-linke-berlin"));
  check("Landes-Parteipaket ist optional, nie Pflicht", !berlinLinke.required.includes("die-linke-berlin"));
  check("Landtag Berlin + Die Linke -> NICHT die-linke-brandenburg", !berlinLinke.all.includes("die-linke-brandenburg"));
}
check("nicht-sozialer Ausschuss erzeugt KEIN Fachpaket", !pp.resolveProfilePackages({ id: "t", fullName: "T", partei: "SPD", politische_ebene: "bundestag", ausschuesse: ["Ausschuss für Verkehr"], profileActive: true }).optional.includes("arbeit-und-soziales"));

// ============ 5) Fremde Regionalpakete werden NICHT zugewiesen ============
console.log("== 5) Keine fremden Regional-/Landespakete ==");
check("Berlin-Profil erhaelt KEIN brandenburg-basis", !pp.resolveProfilePackages(P_BERLIN).all.includes("brandenburg-basis"));
check("Brandenburg-Profil erhaelt KEIN berlin-basis", !pp.resolveProfilePackages(P_BRANDENBURG).all.includes("berlin-basis"));
check("Berlin-Profil erhaelt KEIN regional-niedersachsen", !pp.resolveProfilePackages(P_BERLIN).all.includes("regional-niedersachsen"));
check("Berlin-Profil (CDU) erhaelt KEIN fremdes Landes-Parteipaket", !pp.resolveProfilePackages(P_BERLIN).all.some((k) => /^die-linke-/.test(k)));
check("Landes-Basispakete sind neutral: kein Parteipaket ist Pflichtpaket", [P_BERLIN, P_BRANDENBURG].every((p) => pp.resolveProfilePackages(p).required.every((k) => !/^die-linke-/.test(k))));
check("Brandenburg-Profil erhaelt KEIN regional-niedersachsen", !pp.resolveProfilePackages(P_BRANDENBURG).all.includes("regional-niedersachsen"));
check("Bundesprofil (Hessen) erhaelt KEIN Landespaket", !pp.resolveProfilePackages(P_BUND).all.some((k) => /-basis$/.test(k) && k !== "bund-basis"));
check("Berlin-Profil erhaelt KEIN fremdes Personenpaket", !pp.resolveProfilePackages(P_BERLIN).all.includes(`profil-${BESTANDS_MANDAT}`));
{
  const a = pp.computeGlobalActivation({ ...prodKatalog, profiles: [P_BERLIN] });
  check("Berlin-Profil aktiviert das fremde Personenpaket auch technisch nicht",
    a.packageStatus.find((p) => p.key === `profil-${BESTANDS_MANDAT}`).activation !== "active");
  check("Berlin-Profil aktiviert regional-niedersachsen technisch nicht",
    a.packageStatus.find((p) => p.key === "regional-niedersachsen").activation !== "active");
}

// ============ 6) Wiederholte Ausfuehrung erzeugt keine Duplikate ============
console.log("== 6) Idempotenz: wiederholte Ausfuehrung aendert nichts ==");
for (const [label, kat] of KATALOGE) {
  const laeufe = [1, 2, 3].map(() => JSON.stringify(pp.computeGlobalActivation({ ...kat, profiles: [P_BUND, P_BERLIN, P_BRANDENBURG, P_BESTAND] })));
  check(`[${label}] 3 Laeufe byte-identisch`, laeufe[0] === laeufe[1] && laeufe[1] === laeufe[2]);
}
for (const p of [P_BUND, P_BERLIN, P_BRANDENBURG, P_BESTAND]) {
  const r = pp.resolveProfilePackages(p);
  check(`${p.id}: 'all' enthaelt keine Dublette`, r.all.length === new Set(r.all).size);
  check(`${p.id}: 'optional' enthaelt keine Dublette`, r.optional.length === new Set(r.optional).size);
  check(`${p.id}: zweiter Aufruf liefert identisches Ergebnis`, JSON.stringify(r) === JSON.stringify(pp.resolveProfilePackages(p)));
}
// Dasselbe Profil doppelt in der Liste -> Referenzzaehlung bleibt 1 (Set ueber Profil-IDs).
{
  const doppelt = pp.computeGlobalActivation({ ...prodKatalog, profiles: [P_BUND, { ...P_BUND }] });
  check("dasselbe Profil doppelt -> refCount bleibt 1", doppelt.packageStatus.find((p) => p.key === "bund-basis").refCount === 1);
  check("dasselbe Profil doppelt -> activeProfileCount 2, aber keine doppelten Abrufwege",
    doppelt.activePathCount === pp.computeGlobalActivation({ ...prodKatalog, profiles: [P_BUND] }).activePathCount);
  check("aktive Abrufweg-IDs sind eindeutig", doppelt.activePathIds.length === new Set(doppelt.activePathIds).size);
}
// Der Eingabekatalog darf nicht mutiert werden (sonst waere Wiederholung nicht idempotent).
{
  const vorher = JSON.stringify(prodKatalog);
  pp.computeGlobalActivation({ ...prodKatalog, profiles: [P_BUND, P_BERLIN] });
  pp.profileSupplyStatus(P_BERLIN, prodKatalog);
  check("Katalog wird nicht mutiert (keine Seiteneffekte)", JSON.stringify(prodKatalog) === vorher);
}

// ============ 7) Fehlende optionale Profildaten -> kein Absturz ============
console.log("== 7) Unvollstaendige Profile fuehren nicht zum Absturz ==");
const UNVOLLSTAENDIG = [
  ["nur Ebene", { id: "u1", politische_ebene: "bundestag" }],
  ["ohne Ausschuesse/Themen/Region", { id: "u2", fullName: "U2", partei: "SPD", politische_ebene: "bundestag", profileActive: true }],
  ["leeres Objekt", {}],
  ["null", null],
  ["undefined", undefined],
  ["Fremdtyp (String)", "kein-profil"],
  ["Arrays statt Strings", { id: "u3", fullName: "U3", partei: ["SPD"], politische_ebene: "bundestag", ausschuesse: null, fachpolitische_schwerpunkte: undefined, profileActive: true }],
  ["Zahlen in Textfeldern", { id: 42, fullName: 7, partei: 1, politische_ebene: "landtag", bundesland: 9, profileActive: true }]
];
for (const [label, prof] of UNVOLLSTAENDIG) {
  let r = null, err = null;
  try { r = pp.resolveProfilePackages(prof); } catch (e) { err = e; }
  check(`${label}: resolveProfilePackages wirft nicht`, err === null, err && err.message);
  check(`${label}: liefert trotzdem bund-basis als Pflichtpaket`, !!r && r.required.includes("bund-basis"));
  let s = null; err = null;
  try { s = pp.profileSupplyStatus(prof, prodKatalog); } catch (e) { err = e; }
  check(`${label}: profileSupplyStatus wirft nicht`, err === null, err && err.message);
  check(`${label}: liefert einen ehrlichen Grund`, !!s && typeof s.reason === "string" && s.reason.length > 0);
}
{
  let err = null;
  try { pp.computeGlobalActivation({ ...prodKatalog, profiles: [null, undefined, {}, "x", P_BUND] }); } catch (e) { err = e; }
  check("computeGlobalActivation vertraegt kaputte Profile in der Liste", err === null, err && err.message);
}

// ============ 8) Unbekannte Region -> kontrolliertes Ergebnis ============
console.log("== 8) Unbekannte/fehlende Region fuehrt zu einem kontrollierten Ergebnis ==");
for (const land of ["Sachsen", "Bayern", "Fantasialand", ""]) {
  const prof = { id: "lt-" + (land || "leer"), fullName: "LT", partei: "SPD", politische_ebene: "landtag", bundesland: land, profileActive: true };
  const r = pp.resolveProfilePackages(prof);
  check(`Landtag '${land || "(leer)"}': KEIN geratenes Landespaket`, !r.required.some((k) => k !== "bund-basis"));
  check(`Landtag '${land || "(leer)"}': requiredMissing benennt die Luecke`, r.requiredMissing.length === 1 && /^landespaket:/.test(r.requiredMissing[0]));
  const s = pp.profileSupplyStatus(prof, prodKatalog);
  check(`Landtag '${land || "(leer)"}': nicht vollstaendig aktiviert, Grund pflichtpaket-unversorgt`, s.fullyActivated === false && s.reason === "pflichtpaket-unversorgt");
  check(`Landtag '${land || "(leer)"}': als kein-landesmodul ausgewiesen`, s.missingBasePackages.some((m) => m.reason === "kein-landesmodul"));
}
check("unbekannte Region aktiviert kein einziges Landespaket", (() => {
  const a = pp.computeGlobalActivation({ ...prodKatalog, profiles: [{ id: "lt-sachsen", fullName: "LT", partei: "SPD", politische_ebene: "landtag", bundesland: "Sachsen", profileActive: true }] });
  return ["berlin-basis", "brandenburg-basis"].every((k) => a.packageStatus.find((p) => p.key === k).activation === "inactive");
})());

// ============ 9) Keine fest codierte Abhaengigkeit von einem Mandanten ============
console.log("== 9) Keine fest codierte Mandanten-/Pilotabhaengigkeit in der Zuweisungslogik ==");
// (a) Statisch: die Zuweisungsdateien enthalten keinen konkreten Personen-/Paketschluessel.
const ZUWEISUNGS_DATEIEN = [
  "lib/helmut/quellenarchitektur/profile-packages.js",
  "lib/helmut/quellenarchitektur/seeds/packages.js"
];
for (const rel of ZUWEISUNGS_DATEIEN) {
  const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  // 'profil-' darf nur als Praefix-Konstante/Template vorkommen, nie als konkreter
  // Paketschluessel. Interne Statuszeichenketten (z. B. reason: "profil-nicht-aktivierbar")
  // sind keine Paketschluessel und werden ueber ihren Kontext ausgenommen.
  const konkrete = src.split("\n")
    .filter((zeile) => !/\breason\b/.test(zeile))
    .flatMap((zeile) => zeile.match(/["'`]profil-[a-z0-9][a-z0-9-]*["'`]/gi) || []);
  check(`${rel}: kein konkreter 'profil-<id>'-Schluessel im Code`, konkrete.length === 0, konkrete.join(","));
  // Ein personenbezogener Schluessel darf nur ueber personalPackageKeyFor entstehen.
  check(`${rel}: kein 'profil-'-Literal wird direkt in die Paketliste geschoben`,
    !/(optional|required)\.push\(\s*["'`]profil-/.test(src));
  check(`${rel}: keine 'demoOnly'-Sonderbehandlung eines benannten Mandats`, !/demoOnly\s*&&\s*["'`][a-z]/i.test(src));
}
// (b) Verhaltensbeweis (namensunabhaengig): dieselben Sachfelder unter beliebiger ID
//     ergeben dieselbe Sachzuordnung — nur der personenbezogene Schluessel folgt der ID.
{
  const sachfelder = (r) => r.all.filter((k) => !k.startsWith("profil-")).sort();
  const ids = ["bestandsmandat-eins", "irgendeine-andere-id", "x", "zzz-999", BESTANDS_MANDAT.toUpperCase()];
  const referenz = JSON.stringify(sachfelder(pp.resolveProfilePackages({ ...P_BESTAND, id: ids[0] })));
  let gleich = true;
  for (const id of ids) if (JSON.stringify(sachfelder(pp.resolveProfilePackages({ ...P_BESTAND, id }))) !== referenz) gleich = false;
  check("gleiche Sachfelder + beliebige ID -> identische Sachpakete", gleich);
  for (const id of ids) {
    const r = pp.resolveProfilePackages({ ...P_BESTAND, id });
    check(`ID '${id}': Personenpaket folgt der ID (kleingeschrieben)`, r.optional.includes(`profil-${String(id).toLowerCase()}`));
  }
}
// (c) Kein Mandant ist Default/Fallback: ohne aktives Profil ist KEIN Paket aktiv.
{
  const a = pp.computeGlobalActivation({ ...prodKatalog, profiles: [] });
  check("ohne aktives Profil ist kein Paket aktiv (kein Default-Mandant)", a.packageStatus.every((p) => p.activation === "inactive"));
  check("ohne aktives Profil laufen nur always_on-Wege", a.pathActivation.filter((p) => p.active).every((p) => p.activation_mode === "always_on"));
  check("ohne aktives Profil laeuft KEIN Personen-/Landesweg", a.pathActivation.filter((p) => p.active).every((p) => !/-news$/.test(p.legacy_source_id) && !/^(berlin|brandenburg|oer)-/.test(p.legacy_source_id)));
}

// ============ 10) Bestehende Mandanten werden nicht veraendert ============
console.log("== 10) Ein neues Profil aendert an bestehenden Mandanten nichts ==");
{
  const bestand = [P_BESTAND];
  const vorherProfil = JSON.stringify(pp.resolveProfilePackages(P_BESTAND));
  const vorherAkt = pp.computeGlobalActivation({ ...prodKatalog, profiles: bestand });

  for (const neu of [P_BUND, P_BERLIN, P_BRANDENBURG]) {
    const nachherAkt = pp.computeGlobalActivation({ ...prodKatalog, profiles: [...bestand, neu] });
    check(`+${neu.id}: Zuordnung des Bestandsmandats unveraendert`, JSON.stringify(pp.resolveProfilePackages(P_BESTAND)) === vorherProfil);
    check(`+${neu.id}: Personenpaket des Bestandsmandats bleibt aktiv`, nachherAkt.packageStatus.find((p) => p.key === `profil-${BESTANDS_MANDAT}`).activation === "active");
    check(`+${neu.id}: Personenpaket-refCount bleibt 1 (kein fremder Zugriff)`, nachherAkt.packageStatus.find((p) => p.key === `profil-${BESTANDS_MANDAT}`).refCount === 1);
    const vorherAktiv = vorherAkt.packageStatus.filter((p) => p.activation === "active").map((p) => p.key).sort();
    const nachherAktiv = nachherAkt.packageStatus.filter((p) => p.activation === "active").map((p) => p.key).sort();
    check(`+${neu.id}: kein bisher aktives Paket wird deaktiviert`, vorherAktiv.every((k) => nachherAktiv.includes(k)));
    check(`+${neu.id}: kein bisher aktiver Abrufweg faellt weg`, vorherAkt.activePathIds.every((id) => nachherAkt.activePathIds.includes(id)));
  }
  // Alle drei zusammen: die Landespakete bleiben unversorgt, der Bestand bleibt unberuehrt.
  const alle = pp.computeGlobalActivation({ ...prodKatalog, profiles: [...bestand, P_BUND, P_BERLIN, P_BRANDENBURG] });
  check("3 neue Profile: aktive Abrufwege des Bestands bleiben vollstaendig erhalten", vorherAkt.activePathIds.every((id) => alle.activePathIds.includes(id)));
  check("3 neue Profile: Landespakete bleiben requested_unsupplied (keine stille Aktivierung)",
    ["berlin-basis", "brandenburg-basis"].every((k) => alle.packageStatus.find((p) => p.key === k).activation === "requested_unsupplied"));
  check("3 neue Profile: kein 'prepared'-Paket wurde technisch aktiviert",
    alle.packageStatus.filter((p) => p.activation === "active").every((p) => p.status === "active"));
}

// ============ Konsistenz Code-Seed <-> Inventur-Annahmen ============
console.log("== Konsistenz: Annahmen der Paket-Inventur ==");
check("Code-Seed enthaelt ausschliesslich Sachpakete (kein Personenpaket im Code)",
  M.packages.length > 0 && M.packages.every((p) => !p.key.startsWith("profil-")));
check("Code-Seed enthaelt die 8 erwarteten Paketschluessel",
  JSON.stringify(M.packages.map((p) => p.key).sort()) === JSON.stringify([
    "arbeit-und-soziales", "berlin-basis", "brandenburg-basis", "bund-basis",
    "die-linke-berlin", "die-linke-brandenburg", "die-linke-bund", "regional-niedersachsen"
  ]));
check("berlin-basis und brandenburg-basis sind Pflicht-Basispakete", ["berlin-basis", "brandenburg-basis"].every((k) => M.packages.find((p) => p.key === k).is_base === true));
check("berlin-basis und brandenburg-basis sind 'prepared' (nicht aktivierbar)", ["berlin-basis", "brandenburg-basis"].every((k) => M.packages.find((p) => p.key === k).status === "prepared"));
check("nur Berlin und Brandenburg haben ein Landespaket-Mapping", JSON.stringify(Object.keys(pp.LANDESPAKET_BY_BUNDESLAND).sort()) === JSON.stringify(["berlin", "brandenburg"]));
check("jedes gemappte Landespaket existiert auch als Paket", Object.values(pp.LANDESPAKET_BY_BUNDESLAND).every((k) => M.packages.some((p) => p.key === k)));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
