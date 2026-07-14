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

// Profil-Fixtures (verbindlich mandate_profiles: politische_ebene 'bundestag'/'landtag')
const bundestag = { id: "mdb", fullName: "MdB Test", party: "SPD", politische_ebene: "bundestag", committees: ["Gesundheit"], state: "NRW", profileActive: true };
const cem = { id: "cem", fullName: "Cem Ince", party: "Die Linke", politische_ebene: "bundestag", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", fachpolitische_schwerpunkte: ["Rente"], profileActive: true };
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
const rc = pp.resolveProfilePackages(cem);
check("Die Linke -> die-linke-bund", rc.optional.includes("die-linke-bund"));
check("Ausschuss Arbeit und Soziales -> arbeit-und-soziales", rc.optional.includes("arbeit-und-soziales"));
check("Region Niedersachsen -> regional-niedersachsen", rc.optional.includes("regional-niedersachsen"));
check("Fachthema (Rente) allein -> arbeit-und-soziales", pp.resolveProfilePackages({ fullName: "x", party: "SPD", politische_ebene: "bundestag", fachpolitische_schwerpunkte: ["Rente"], profileActive: true }).optional.includes("arbeit-und-soziales"));
check("Nicht-Sozial-Ausschuss -> KEIN Sozialpaket", !pp.resolveProfilePackages(bundestag).optional.includes("arbeit-und-soziales"));

// ============================ PFLICHTFALL 4 ============================
console.log("== 4) 100 Profile mit demselben Paket -> nur EINE technische Aktivierung ==");
const one = pp.computeGlobalActivation({ ...base, profiles: [cem] });
const hundred = pp.computeGlobalActivation({ ...base, profiles: Array.from({ length: 100 }, (_, i) => ({ ...cem, id: "cem" + i })) });
check("aktive Abrufwege 1 Profil == 100 Profile (keine Verdopplung)", one.activePathCount === hundred.activePathCount);
check("Referenzzaehlung bund-basis = 100 (korrekt gezaehlt)", hundred.packageStatus.find((p) => p.key === "bund-basis").refCount === 100);
check("aber activePackageCount identisch", one.activePackageCount === hundred.activePackageCount);

// ============================ PFLICHTFALL 5 ============================
console.log("== 5) Pausiertes/geloeschtes Profil reduziert Referenzzaehlung ==");
const active = pp.computeGlobalActivation({ ...base, profiles: [cem] });
const paused = pp.computeGlobalActivation({ ...base, profiles: [{ ...cem, profileActive: false }] });
const deleted = pp.computeGlobalActivation({ ...base, profiles: [{ ...cem, geloescht_at: "2026-07-13T00:00:00Z" }] });
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
// Klaerung: warum aktiviert EIN Cem-Profil 144 Abrufwege? Weil Cem der Spezialfall ist
// (voll versorgt: Bund Basis + Arbeit&Soziales + Die Linke + Regional NDS). Ein reines
// Bundestagsprofil aktiviert NUR das, was es braucht.
console.log("== K3) Getrennte Profile: nur benoetigte Pakete/Abrufwege ==");
const reinBT = { id: "rein-bt", fullName: "Rein Bundestag", party: "SPD", politische_ebene: "bundestag", committees: ["Gesundheit"], profileActive: true };
// Cems REALE Pilot-ID ("cem-ince") -> zusaetzlich das personenbezogene Paket profil-cem-ince.
const cemP = { id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", politische_ebene: "bundestag", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", fachpolitische_schwerpunkte: ["Rente"], profileActive: true };
const berlinP = { id: "be", fullName: "Berlin MdA", party: "SPD", politische_ebene: "landtag", bundesland: "Berlin", ausschuesse: ["Inneres"], profileActive: true };
const bbP = { id: "bb", fullName: "BB MdL", party: "CDU", politische_ebene: "landtag", bundesland: "Brandenburg", ausschuesse: ["Wirtschaft"], profileActive: true };
const aReinBT = pp.computeGlobalActivation({ ...base, profiles: [reinBT] });
const aCem = pp.computeGlobalActivation({ ...base, profiles: [cemP] });
const aBerlin = pp.computeGlobalActivation({ ...base, profiles: [berlinP] });
const aBB = pp.computeGlobalActivation({ ...base, profiles: [bbP] });
check("reines Bundestagsprofil: nur bund-basis aktiv", JSON.stringify(aReinBT.packageStatus.filter((p) => p.activation === "active").map((p) => p.key)) === JSON.stringify(["bund-basis"]));
check("reines Bundestagsprofil: 54 Abrufwege (NICHT 144)", aReinBT.activePathCount === 54);
check("Cem (Pilot cem-ince): 5 Pakete aktiv (voll versorgt + persoenliches Paket)", aCem.packageStatus.filter((p) => p.activation === "active").length === 5);
check("Cem: persoenliches Paket profil-cem-ince ist aktiv", aCem.packageStatus.find((p) => p.key === "profil-cem-ince").activation === "active");
check("Cem: 145 Abrufwege (144 Sach- + 1 personenbezogener demoOnly-Weg)", aCem.activePathCount === 145);
check("Cem > reines Bundestagsprofil (Cem hat mehr belegte Dimensionen)", aCem.activePathCount > aReinBT.activePathCount);
check("Berliner Landtag: bund-basis aktiv (54), berlin-basis requested_unsupplied", aBerlin.activePathCount === 54 && aBerlin.packageStatus.find((p) => p.key === "berlin-basis").activation === "requested_unsupplied");
check("Brandenburger Landtag: bund-basis aktiv (54), brandenburg-basis requested_unsupplied", aBB.activePathCount === 54 && aBB.packageStatus.find((p) => p.key === "brandenburg-basis").activation === "requested_unsupplied");
check("reines Bundestagsprofil aktiviert KEINE Sozial-/Linke-/Regionalquellen", ["arbeit-und-soziales", "die-linke-bund", "regional-niedersachsen"].every((k) => aReinBT.packageStatus.find((p) => p.key === k).activation !== "active"));

// ============================ VERIFY-FIXES ============================
console.log("== Verify-Fixes: personenbezogenes Paket + Wortanfang-Matching ==");
// Fix 1: profil-cem-ince war unerreichbar (resolveProfilePackages erzeugte es nie).
check("Pilot cem-ince erhaelt personenbezogenes Paket profil-cem-ince",
  pp.resolveProfilePackages({ id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", politische_ebene: "bundestag", profileActive: true }).optional.includes("profil-cem-ince"));
check("gleiche Person, aber ANDERE Profil-ID -> KEIN personenbezogenes Paket (an ID gebunden, nicht Name)",
  !pp.resolveProfilePackages({ id: "cem", fullName: "Cem Ince", party: "Die Linke", politische_ebene: "bundestag", profileActive: true }).optional.includes("profil-cem-ince"));
check("user_id-Feld (mandate_profiles) bindet ebenfalls das personenbezogene Paket",
  pp.resolveProfilePackages({ user_id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", politische_ebene: "bundestag", profileActive: true }).optional.includes("profil-cem-ince"));
check("kein personenbezogenes Paket ohne passende Profil-ID (Standardprofil)",
  !pp.resolveProfilePackages(bundestag).optional.includes("profil-cem-ince"));
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
