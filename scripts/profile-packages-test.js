"use strict";

// Tests fuer Profil->Paket-Zuordnung, Pflichtpakete, Aktivierung + Referenzzaehlung — Sprint 4.
// Deckt die 7 verbindlichen Pflichtfaelle (Auftrag) + Edge-Cases ab.
// Reine Offline-Tests (Fixtures + echter Katalog aus Sprint 1), kein Netz, keine KI, kein DB-Zugriff.

const pp = require("../lib/helmut/quellenarchitektur/profile-packages");
const { buildFullModel } = require("../lib/helmut/quellenarchitektur");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const M = buildFullModel();
const base = { packages: M.packages, packagePaths: M.packagePaths, retrievalPaths: M.retrievalPaths };

// Profil-Fixtures (verbindlich mandate_profiles: politische_ebene 'bundestag'/'landtag').
// Alle Identitaeten sind KLAR KUENSTLICH (kein realer Mandant im Test).
const bundestag = { id: "mdb", fullName: "MdB Test", party: "SPD", politische_ebene: "bundestag", committees: ["Gesundheit"], state: "NRW", profileActive: true };
const vollprofil = { id: "tenant-alpha", fullName: "Test Politician One", party: "Die Linke", politische_ebene: "bundestag", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", fachpolitische_schwerpunkte: ["Rente"], profileActive: true };
const berlin = { id: "berlinMdA", fullName: "Berlin MdA", party: "SPD", politische_ebene: "landtag", bundesland: "Berlin", ausschuesse: ["Inneres"], profileActive: true };
const brandenburg = { id: "bbMdL", fullName: "BB MdL", party: "CDU", politische_ebene: "landtag", bundesland: "Brandenburg", ausschuesse: ["Wirtschaft"], profileActive: true };

// ============================ PFLICHTFALL 1 ============================
console.log("== 1) Bundestagsprofil erhaelt Bund Basis ==");
const r1 = pp.resolveProfilePackages(bundestag);
check("Bundestagsprofil required enthaelt bund-basis", r1.required.includes("bund-basis"));
check("Bundestagsprofil hat KEIN Landespaket", !r1.required.some((k) => /basis/.test(k) && k !== "bund-basis"));
const s1 = pp.profileSupplyStatus(bundestag, base);
check("Bundestagsprofil ist vollstaendig aktiviert (Bund Basis versorgt)", s1.fullyActivated === true);

// ============================ PFLICHTFALL 2 ============================
console.log("== 2) Landtagsprofil erhaelt Bund Basis + Landespaket ==");
check("Berlin: required = bund-basis + berlin-basis", JSON.stringify(pp.resolveProfilePackages(berlin).required.sort()) === JSON.stringify(["berlin-basis", "bund-basis"]));
check("Brandenburg: required = bund-basis + brandenburg-basis", JSON.stringify(pp.resolveProfilePackages(brandenburg).required.sort()) === JSON.stringify(["brandenburg-basis", "bund-basis"]));
const s2 = pp.profileSupplyStatus(berlin, base);
check("Berliner Landtagsprofil NICHT vollstaendig aktiviert (berlin-basis prepared/leer)", s2.fullyActivated === false);
check("... missingBasePackages nennt berlin-basis", s2.missingBasePackages.some((m) => m.key === "berlin-basis"));
check("... Grund = pflichtpaket-unversorgt", s2.reason === "pflichtpaket-unversorgt");

// ============================ PFLICHTFALL 3 ============================
console.log("== 3) Partei/Fraktion/Ausschuss/Thema/Region ergaenzen Pakete ==");
const rc = pp.resolveProfilePackages(vollprofil);
check("Die Linke -> die-linke-bund", rc.optional.includes("die-linke-bund"));
check("Ausschuss Arbeit und Soziales -> arbeit-und-soziales", rc.optional.includes("arbeit-und-soziales"));
check("Region Niedersachsen -> regional-niedersachsen", rc.optional.includes("regional-niedersachsen"));
check("Fachthema (Rente) allein -> arbeit-und-soziales", pp.resolveProfilePackages({ fullName: "x", party: "SPD", politische_ebene: "bundestag", fachpolitische_schwerpunkte: ["Rente"], profileActive: true }).optional.includes("arbeit-und-soziales"));
check("Nicht-Sozial-Ausschuss -> KEIN Sozialpaket", !pp.resolveProfilePackages(bundestag).optional.includes("arbeit-und-soziales"));

// ====================== P0-2: LANDES-PARTEI-PAKET (Architektur-Audit 29) ======================
// Nachweis, dass die Neutralisierung der Landes-Basispakete (Partei-/Personenquellen raus)
// ein echtes Linke-Mandat in Berlin/Brandenburg NICHT unversorgt zurueckliess: es erhaelt sein
// Partei-Paket weiterhin automatisch — nur eben ueber ein eigenes optionales Paket statt ueber
// das Pflicht-Basispaket. Klar kuenstliche Fixtures, kein realer Mandant.
console.log("== 3b) Landes-Partei-Paket: Linke-Mandat in Berlin/Brandenburg bleibt versorgt (P0-2) ==");
const berlinLinke = { id: "berlinLinke", fullName: "Berlin Linke MdA", party: "Die Linke", politische_ebene: "landtag", bundesland: "Berlin", profileActive: true };
const brandenburgLinke = { id: "bbLinke", fullName: "BB Linke MdL", party: "Die Linke", politische_ebene: "landtag", bundesland: "Brandenburg", profileActive: true };
check("Berlin + Die Linke -> optional enthaelt die-linke-berlin", pp.resolveProfilePackages(berlinLinke).optional.includes("die-linke-berlin"));
check("Brandenburg + Die Linke -> optional enthaelt die-linke-brandenburg", pp.resolveProfilePackages(brandenburgLinke).optional.includes("die-linke-brandenburg"));
check("Berlin + SPD (nicht Linke) -> KEIN die-linke-berlin", !pp.resolveProfilePackages(berlin).optional.includes("die-linke-berlin"));
check("Brandenburg + CDU (nicht Linke) -> KEIN die-linke-brandenburg", !pp.resolveProfilePackages(brandenburg).optional.includes("die-linke-brandenburg"));
check("Bundestagsprofil (kein Landtag) loest NIEMALS ein Landes-Partei-Paket aus, auch bei Die Linke", !pp.resolveProfilePackages(vollprofil).optional.some((k) => /^die-linke-(berlin|brandenburg)$/.test(k)));
// Bindend statt vakuos: 'required' kann strukturell nie einen Parteischluessel enthalten, ein
// blosses "nicht enthalten" konnte also nie fehlschlagen. Geprueft wird jetzt die exakte
// Pflichtmenge — sie faellt rot, wenn ein Parteipaket in die Pflicht rutscht ODER das neutrale
// Basispaket verlorengeht. Ausserdem: das Parteipaket ist trotzdem zugeteilt (ueber 'all').
check("Berlin-Linke-Landtagsprofil: Pflichtmenge ist exakt bund-basis + berlin-basis (neutral)", (() => {
  const r = pp.resolveProfilePackages(berlinLinke);
  return JSON.stringify(r.required.slice().sort()) === JSON.stringify(["berlin-basis", "bund-basis"]);
})());
check("Berlin-Linke-Landtagsprofil: Parteipaket ist trotz Neutralisierung zugeteilt (in 'all')", pp.resolveProfilePackages(berlinLinke).all.includes("die-linke-berlin"));

// ============================ PFLICHTFALL 4 ============================
console.log("== 4) 100 Profile mit demselben Paket -> nur EINE technische Aktivierung ==");
const one = pp.computeGlobalActivation({ ...base, profiles: [vollprofil] });
const hundred = pp.computeGlobalActivation({ ...base, profiles: Array.from({ length: 100 }, (_, i) => ({ ...vollprofil, id: "tenant-" + i })) });
check("aktive Abrufwege 1 Profil == 100 Profile (keine Verdopplung)", one.activePathCount === hundred.activePathCount);
check("Referenzzaehlung bund-basis = 100 (korrekt gezaehlt)", hundred.packageStatus.find((p) => p.key === "bund-basis").refCount === 100);
check("aber activePackageCount identisch", one.activePackageCount === hundred.activePackageCount);

// ============================ PFLICHTFALL 5 ============================
console.log("== 5) Pausiertes/geloeschtes Profil reduziert Referenzzaehlung ==");
const active = pp.computeGlobalActivation({ ...base, profiles: [vollprofil] });
const paused = pp.computeGlobalActivation({ ...base, profiles: [{ ...vollprofil, profileActive: false }] });
const deleted = pp.computeGlobalActivation({ ...base, profiles: [{ ...vollprofil, geloescht_at: "2026-07-13T00:00:00Z" }] });
check("aktiv: die-linke-bund refCount 1", active.packageStatus.find((p) => p.key === "die-linke-bund").refCount === 1);
check("pausiert: refCount 0 (Profil zaehlt nicht)", paused.packageStatus.find((p) => p.key === "die-linke-bund").refCount === 0);
check("geloescht: refCount 0", deleted.packageStatus.find((p) => p.key === "die-linke-bund").refCount === 0);
check("pausiert: activeProfileCount 0", paused.activeProfileCount === 0);
check("pausiert: die-linke-bund NICHT technisch aktiv", paused.packageStatus.find((p) => p.key === "die-linke-bund").activation !== "active");

// ============================ PFLICHTFALL 6 ============================
console.log("== 6) Kein aktives Profil -> NUR die dauerhaft aktiven Kern-Abrufwege ==");
const none = pp.computeGlobalActivation({ ...base, profiles: [] });
check("kein Profil: KEIN Paket technisch aktiv (keine Paket-Daueraktivierung)", none.packageStatus.filter((p) => p.activation === "active").length === 0);
check("kein Profil: aktive Abrufwege = 5 (nur neutrale Kern-Systemquellen)", none.activePathCount === 5);
check("kein Profil: aktive Abrufwege sind exakt die 5 always_on-Kernquellen", JSON.stringify(none.pathActivation.filter((p) => p.active).map((p) => p.legacy_source_id).sort()) === JSON.stringify(["bundesregierung", "bundestag", "deutschlandfunk-politik", "dip", "tagesschau-politik"]));
check("kein Profil: bund-basis NICHT voll aktiv (nur seine Kern-Abrufwege laufen)", none.packageStatus.find((p) => p.key === "bund-basis").activation !== "active");
check("kein Profil: kein dev_only-Abrufweg aktiv", none.pathActivation.filter((p) => p.active).every((p) => p.activation_mode !== "dev_only"));

// ============================ PFLICHTFALL 7 ============================
console.log("== 7) Fehlerhafte/unvollstaendige Profile -> keine falsche Aktivierung ==");
check("leeres Profil ist nicht aktivierungsberechtigt", pp.isActivationEligible({ id: "leer" }) === false);
const emptyAct = pp.computeGlobalActivation({ ...base, profiles: [{ id: "leer" }] });
check("leeres Profil aktiviert keine optionalen Pakete", emptyAct.packageStatus.filter((p) => p.activation === "active").every((p) => p.key === "bund-basis"));
const ltNoBl = pp.resolveProfilePackages({ fullName: "x", party: "SPD", politische_ebene: "landtag", profileActive: true });
check("Landtag ohne Bundesland: KEIN falsches Landespaket", !ltNoBl.required.some((k) => k !== "bund-basis"));
check("Landtag ohne Bundesland: requiredMissing meldet fehlendes Landesmodul", ltNoBl.requiredMissing.length === 1 && /landespaket/.test(ltNoBl.requiredMissing[0]));
const s7 = pp.profileSupplyStatus({ fullName: "x", party: "SPD", politische_ebene: "landtag", profileActive: true }, base);
check("Landtag ohne Bundesland: nicht vollstaendig aktiviert", s7.fullyActivated === false);
check("falsche Partei erzeugt kein Partei-Paket", !pp.resolveProfilePackages({ fullName: "x", party: "Fantasiepartei", politische_ebene: "bundestag", profileActive: true }).optional.includes("die-linke-bund"));

// ============================ K3: GETRENNTE PROFILE ============================
// Klaerung: warum aktiviert EIN voll versorgtes Profil 144 Abrufwege? Weil es alle
// belegten Dimensionen zieht (Bund Basis + Arbeit&Soziales + Die Linke + Regional NDS).
// Ein reines Bundestagsprofil aktiviert NUR das, was es braucht.
console.log("== K3) Getrennte Profile: nur benoetigte Pakete/Abrufwege ==");
const reinBT = { id: "rein-bt", fullName: "Rein Bundestag", party: "SPD", politische_ebene: "bundestag", committees: ["Gesundheit"], profileActive: true };
const berlinP = { id: "be", fullName: "Berlin MdA", party: "SPD", politische_ebene: "landtag", bundesland: "Berlin", ausschuesse: ["Inneres"], profileActive: true };
const bbP = { id: "bb", fullName: "BB MdL", party: "CDU", politische_ebene: "landtag", bundesland: "Brandenburg", ausschuesse: ["Wirtschaft"], profileActive: true };
const aReinBT = pp.computeGlobalActivation({ ...base, profiles: [reinBT] });
const aVoll = pp.computeGlobalActivation({ ...base, profiles: [vollprofil] });
const aBerlin = pp.computeGlobalActivation({ ...base, profiles: [berlinP] });
const aBB = pp.computeGlobalActivation({ ...base, profiles: [bbP] });
check("reines Bundestagsprofil: nur bund-basis aktiv", JSON.stringify(aReinBT.packageStatus.filter((p) => p.activation === "active").map((p) => p.key)) === JSON.stringify(["bund-basis"]));
check("reines Bundestagsprofil: 54 Abrufwege (NICHT 144)", aReinBT.activePathCount === 54);
check("voll versorgtes Profil: 4 Sachpakete aktiv (KEIN Personenpaket im Code-Seed)", aVoll.packageStatus.filter((p) => p.activation === "active").length === 4);
check("voll versorgtes Profil: kein 'profil-*'-Paket im Katalog-Seed vorhanden", aVoll.packageStatus.every((p) => !p.key.startsWith("profil-")));
check("voll versorgtes Profil: 144 Abrufwege (alle Sachquellen, KEINE Personenquelle im Katalog)", aVoll.activePathCount === 144);
check("voll versorgt > reines Bundestagsprofil (mehr belegte Dimensionen)", aVoll.activePathCount > aReinBT.activePathCount);
check("Berliner Landtag: bund-basis aktiv (54), berlin-basis requested_unsupplied", aBerlin.activePathCount === 54 && aBerlin.packageStatus.find((p) => p.key === "berlin-basis").activation === "requested_unsupplied");
check("Brandenburger Landtag: bund-basis aktiv (54), brandenburg-basis requested_unsupplied", aBB.activePathCount === 54 && aBB.packageStatus.find((p) => p.key === "brandenburg-basis").activation === "requested_unsupplied");
check("reines Bundestagsprofil aktiviert KEINE Sozial-/Linke-/Regionalquellen", ["arbeit-und-soziales", "die-linke-bund", "regional-niedersachsen"].every((k) => aReinBT.packageStatus.find((p) => p.key === k).activation !== "active"));

// ============================ PERSONENPAKET-KONVENTION ============================
console.log("== Personenpaket-Konvention (profil-<mandats-id>) + Wortanfang-Matching ==");
// Konvention statt Hardcode: JEDES Profil referenziert sein persoenliches Paket
// "profil-<id>" optional; WIRKSAM wird das nur, wenn das Paket (DB-Zeile) existiert.
check("personalPackageKeyFor bildet 'profil-<id>' (kleingeschrieben)",
  pp.personalPackageKeyFor("Tenant-Alpha") === "profil-tenant-alpha");
check("personalPackageKeyFor ohne ID -> leer", pp.personalPackageKeyFor("") === "" && pp.personalPackageKeyFor(null) === "");
check("JEDES Profil referenziert sein Personenpaket 'profil-<id>' optional",
  pp.resolveProfilePackages({ id: "tenant-alpha", fullName: "Test Politician One", party: "SPD", politische_ebene: "bundestag", profileActive: true }).optional.includes("profil-tenant-alpha"));
check("andere Profil-ID -> anderes Personenpaket (an ID gebunden, nicht Name)", (() => {
  const r = pp.resolveProfilePackages({ id: "tenant-beta", fullName: "Test Politician One", party: "SPD", politische_ebene: "bundestag", profileActive: true });
  return r.optional.includes("profil-tenant-beta") && !r.optional.includes("profil-tenant-alpha");
})());
check("user_id-Feld (mandate_profiles) bindet ebenfalls das personenbezogene Paket",
  pp.resolveProfilePackages({ user_id: "tenant-alpha", fullName: "Test Politician One", party: "SPD", politische_ebene: "bundestag", profileActive: true }).optional.includes("profil-tenant-alpha"));
check("nicht existierendes Personenpaket wird NICHT technisch aktiv (nur Referenz)",
  aVoll.packageStatus.every((p) => p.key !== "profil-tenant-alpha"));
// Existiert das Paket als (DB-)Zeile, aktiviert die Konvention es fuer genau dieses Mandat.
const synthPkgs = [...M.packages, { id: "pkg-profil-tenant-alpha", key: "profil-tenant-alpha", status: "active" }];
const synthPaths = [...M.retrievalPaths, { id: "rp-tenant-alpha-news", legacy_source_id: "tenant-alpha-news", status: "needs_review", activation_mode: "auto" }];
const synthLinks = [...M.packagePaths, { package_id: "pkg-profil-tenant-alpha", retrieval_path_id: "rp-tenant-alpha-news" }];
const aSynth = pp.computeGlobalActivation({ packages: synthPkgs, packagePaths: synthLinks, retrievalPaths: synthPaths, profiles: [vollprofil] });
check("existierendes DB-Personenpaket 'profil-tenant-alpha' wird fuer das Mandat aktiv",
  aSynth.packageStatus.find((p) => p.key === "profil-tenant-alpha").activation === "active");
check("... und traegt den Personen-Abrufweg (145 = 144 Sachwege + 1 Personenweg)", aSynth.activePathCount === 145);
check("fremdes Mandat aktiviert das Personenpaket NICHT", (() => {
  const aFremd = pp.computeGlobalActivation({ packages: synthPkgs, packagePaths: synthLinks, retrievalPaths: synthPaths, profiles: [reinBT] });
  return aFremd.packageStatus.find((p) => p.key === "profil-tenant-alpha").activation !== "active";
})());
// Fix 4: Sozial-Begriffe am Wortanfang statt als blosser Teilstring.
const soc = (topic) => pp.resolveProfilePackages({ fullName: "x", party: "SPD", politische_ebene: "bundestag", fachpolitische_schwerpunkte: [topic], profileActive: true }).optional.includes("arbeit-und-soziales");
check("Fehltreffer behoben: 'Denkmalpflege' allein -> KEIN arbeit-und-soziales", soc("Denkmalpflege") === false);
check("Fehltreffer behoben: 'Landschaftspflege' allein -> KEIN arbeit-und-soziales", soc("Landschaftspflege") === false);
check("Recall erhalten: 'Pflege' -> arbeit-und-soziales", soc("Pflege") === true);
check("Recall erhalten: 'Pflegeversicherung' (Sozial-Praefix) -> arbeit-und-soziales", soc("Pflegeversicherung") === true);
check("Recall erhalten: 'Tarifbindung' (Sozial-Praefix) -> arbeit-und-soziales", soc("Tarifbindung") === true);
check("Recall erhalten: 'Rente' -> arbeit-und-soziales", soc("Rente") === true);
check("kein Fehltreffer: 'Gesundheit' -> KEIN arbeit-und-soziales", soc("Gesundheit") === false);

// ============================ EDGE / KONSISTENZ ============================
console.log("== Edge / Konsistenz ==");
check("bund-basis ist Pflicht-Basispaket (is_base); KEIN Paket-always_on-Flag mehr", (() => { const b = M.packages.find((p) => p.key === "bund-basis"); return b.is_base === true && b.always_on === undefined; })());
check("berlin/brandenburg sind prepared (nicht aktivierbar bis Quellen)", ["berlin-basis", "brandenburg-basis"].every((k) => M.packages.find((p) => p.key === k).status === "prepared"));
check("angefordertes prepared-Paket erscheint als requested_unsupplied", (() => {
  const act = pp.computeGlobalActivation({ ...base, profiles: [berlin] });
  return act.packageStatus.find((p) => p.key === "berlin-basis").activation === "requested_unsupplied";
})());
check("gemischte Profile: nur benoetigte optionale Pakete aktiv", (() => {
  const act = pp.computeGlobalActivation({ ...base, profiles: [bundestag] }); // Gesundheit, kein Sozial
  return act.packageStatus.find((p) => p.key === "arbeit-und-soziales").activation !== "active"
    && act.packageStatus.find((p) => p.key === "bund-basis").activation === "active";
})());
check("englische Feldnamen (Objekt-Mapping) funktionieren auch", pp.resolveProfilePackages({ fullName: "x", party: "Die Linke", parliamentType: "Bundestag", committees: ["Arbeit und Soziales"], profileActive: true }).optional.includes("arbeit-und-soziales"));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
