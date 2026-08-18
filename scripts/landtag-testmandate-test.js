"use strict";

// Helmut — Sprint "Berlin/Brandenburg-Vorrat" (2026-08-18): Testsuite fuer den deaktivierten
// Landtags-Testmandate-Vorrat (12 Berlin + 8 Brandenburg), die Berliner Parlaments-Sollmenge
// und das Kapazitaetsmodell der 25-Mandate-Stufe.
//
// Beweisziele (Auftrag Teil D):
//   1. Profilnormalisierung: jede aktivierte Kopie ist ein VOLLSTAENDIGES, brauchbares Profil
//      (validateProfile), inkl. Radar-/Briefing-/Lage-Faehigkeit — MdL wie MdB durch dieselbe
//      Validierung, ohne Sonderpfad.
//   2. Mandantentrennung/Vermischung: Berliner Profile ziehen NIE brandenburg-basis (und
//      umgekehrt), MdB-Profile NIE ein Landespaket; Landesmodul-Quellen bleiben im Fallback
//      fuer fremde/Bundes-Profile gesperrt.
//   3. Fail closed: die deaktivierten Seed-Daten aktivieren NICHTS (0 Referenzen, 0 aktive
//      Landeswege), auch aktivierte Kopien aktivieren die prepared-Landespakete nicht.
//   4. Quellenherkunft/Belegpflicht: jede Fraktion, jeder Ausschuss und jede Kennzahl des
//      Kapazitaetsmodells traegt Herkunft und Beleg; unbelegte Werte sind Testfehler.
//   5. Kosten/Kapazitaet: das Modell rechnet deterministisch, nennt seine Annahmen und
//      erfindet keine Brandenburg-Messwerte.
//
// Reiner Offline-Test: kein Netz, keine KI, kein DB-Zugriff, kein Datei-Schreiben.

const seed = require("../lib/helmut/quellenarchitektur/seeds/landtag-testmandate");
const kap = require("../lib/helmut/quellenarchitektur/seeds/landesstufe-kapazitaet");
const parl = require("../lib/helmut/quellenarchitektur/seeds/parlamentszusammensetzung");
const { TESTMANDATE: MDB_TESTMANDATE } = require("../lib/helmut/quellenarchitektur/seeds/bundestag-testmandate");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const {
  resolveProfilePackages, isActivationEligible, computeGlobalActivation, profileSupplyStatus
} = require("../lib/helmut/quellenarchitektur/profile-packages");
const { validateProfile } = require("../lib/helmut/profile-validation");
const { parliamentTypeOf } = require("../lib/helmut/config");
const {
  laenderMitBerechtigtemMandat, wirksameLandesmodule, landesmodulQuelleGesperrt
} = require("../lib/helmut/quellenarchitektur/source-mode");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const BE = seed.BERLIN_TESTMANDATE;
const BB = seed.BRANDENBURG_TESTMANDATE;
const ALLE = seed.TESTMANDATE;
const aktiv = ALLE.map(seed.aktivierteKopie);

// ============ A · Berliner Parlaments-Sollmenge (neu) ============

check("A1 Abgeordnetenhaus Berlin (19. WP) ist als Sollmenge hinterlegt",
  !!parl.ABGEORDNETENHAUS_BERLIN_19 && parl.parlament("abgeordnetenhaus-berlin") === parl.ABGEORDNETENHAUS_BERLIN_19);
check("A2 Sollmengen-Selbstschutz bleibt mit Berlin gruen", parl.validateSollmenge().ok === true);
check("A3 Berlin fuehrt genau die 5 Fraktionen der Wiederholungswahl (CDU/SPD/Gruene/Linke/AfD)",
  (() => {
    const keys = parl.ABGEORDNETENHAUS_BERLIN_19.fraktionen.map((f) => f.key).sort().join(",");
    return keys === "afd,cdu,gruene,linke,spd";
  })());
check("A4 FDP ist als nicht vertreten gefuehrt (4,6 %), mit Grund und Beleg",
  (() => {
    const l = parl.fraktionsLage({ parlament: "abgeordnetenhaus-berlin", wahlperiode: 19, partei: "fdp" });
    return l.bekannt && l.nichtVertreten && !l.hatMandate && !!l.eintrag.grund && !!l.eintrag.beleg;
  })());
check("A5 Die Linke HAT in Berlin eine Fraktion — im Gegensatz zu Brandenburg (8. WP)",
  parl.fraktionsLage({ parlament: "abgeordnetenhaus-berlin", wahlperiode: 19, partei: "linke" }).hatFraktion === true
  && parl.fraktionsLage({ parlament: "landtag-brandenburg", wahlperiode: 8, partei: "linke" }).hatMandate === false);
check("A6 falsche Wahlperiode wird nicht gedeutet (bekannt: false)",
  parl.fraktionsLage({ parlament: "abgeordnetenhaus-berlin", wahlperiode: 20, partei: "cdu" }).bekannt === false);
check("A7 der Wahlperiodenwechsel 20.09.2026 ist als Hinweis hinterlegt (Pflege-Erinnerung)",
  /20\.09\.2026/.test(parl.ABGEORDNETENHAUS_BERLIN_19.hinweis || ""));

// ============ B · Seed-Vertrag der 20 Testmandate ============

check("B1 Selbstschutz: 20 Testmandate erfuellen den Vertrag", seed.validateLandtagTestmandate().ok === true);
check("B2 genau 12 Berlin + 8 Brandenburg", BE.length === 12 && BB.length === 8);
check("B3 ALLE 20 sind deaktiviert und als synthetische Testmandate markiert",
  ALLE.every((t) => t.profileActive === false && t.internesTestmandat === true && t.synthetisch === true));
check("B4 jede Kennung traegt das Testpraefix und kollidiert mit keinem Bestand",
  ALLE.every((t) => /^test-(mda-be|mdl-bb)-[0-9]{2}$/.test(t.id) && !seed.FREMDE_IDS.includes(t.id)));
check("B5 kein Eintrag traegt Konto-/Auth-Felder",
  ALLE.every((t) => ["email", "password", "passwordHash", "inviteUrl"].every((f) => !(f in t))));
check("B6 jeder verwendete Ausschuss steht in der belegten Ausschussliste seines Landes",
  (() => {
    const be = new Set(seed.BERLIN_AUSSCHUESSE_19.map((a) => a.name));
    const bb = new Set(seed.BRANDENBURG_AUSSCHUESSE_8.map((a) => a.name));
    return ALLE.every((t) => t.committees.every((a) => (t.bundesland === "Berlin" ? be : bb).has(a)));
  })());
check("B7 jede Ausschusszeile beider Listen traegt einen amtlichen Beleg",
  [...seed.BERLIN_AUSSCHUESSE_19, ...seed.BRANDENBURG_AUSSCHUESSE_8]
    .every((a) => typeof a.beleg === "string" && a.beleg.includes(".")));
check("B8 jedes Mandat traegt Herkunft, Belege, Abrufdatum und den Synthetik-Hinweis",
  ALLE.every((t) => t.herkunft && t.herkunft.belege.length >= 1 && t.herkunft.abrufdatum
    && /keine reale Person/i.test(t.herkunft.hinweis || "")));
check("B9 Mutations-Gegenprobe: ein aktiviertes Seed-Mandat macht den Vertrag rot",
  seed.validateLandtagTestmandate({ mandate: ALLE.map((t, i) => (i === 0 ? { ...t, profileActive: true } : t)) }).ok === false);
check("B10 Mutations-Gegenprobe: ein Brandenburger Linke-Mandat macht den Vertrag rot (8. WP nicht vertreten)",
  seed.validateLandtagTestmandate({ mandate: ALLE.map((t) => (t.id === "test-mdl-bb-08" ? { ...t, party: "Die Linke" } : t)) }).ok === false);
check("B11 Mutations-Gegenprobe: ein Berliner FDP-Mandat macht den Vertrag rot (Wiederholungswahl)",
  seed.validateLandtagTestmandate({ mandate: ALLE.map((t) => (t.id === "test-mda-be-01" ? { ...t, party: "FDP" } : t)) }).ok === false);
check("B12 Mutations-Gegenprobe: ein unbelegter Ausschuss macht den Vertrag rot",
  seed.validateLandtagTestmandate({ mandate: ALLE.map((t) => (t.id === "test-mda-be-02" ? { ...t, committees: ["Ausschuss für Erfundenes"] } : t)) }).ok === false);
check("B13 Mutations-Gegenprobe: eine Kollision mit einer Bestandskennung macht den Vertrag rot",
  seed.validateLandtagTestmandate({ mandate: ALLE.map((t, i) => (i === 0 ? { ...t, id: "helmut-abnahme-berlin" } : t)) }).ok === false);

// ============ C · Fail closed: der Vorrat aktiviert NICHTS ============

check("C1 kein Seed-Mandat ist aktivierungsberechtigt (deaktiviert -> 0 Referenzen)",
  ALLE.every((t) => isActivationEligible(t) === false));
check("C2 validateProfile stuft jedes Seed-Mandat als 'deaktiviert' ein",
  ALLE.every((t) => validateProfile(t).state === "deaktiviert"));

const lm = buildLandesmodulSeed();
const aktivierung = computeGlobalActivation({
  profiles: [...MDB_TESTMANDATE, ...ALLE], // 5 deaktivierte MdB + 20 deaktivierte MdL/MdA
  packages: PACKAGE_DEFINITIONS,
  packagePaths: lm.packagePaths,
  retrievalPaths: lm.retrievalPaths
});
check("C3 mit ausschliesslich deaktivierten Profilen: 0 aktive Profile, 0 aktive Pakete, 0 aktive Landeswege",
  aktivierung.activeProfileCount === 0 && aktivierung.activePackageCount === 0 && aktivierung.activePathCount === 0);
check("C4 berlin-basis und brandenburg-basis tragen 0 Referenzen",
  aktivierung.packageStatus.filter((p) => p.key === "berlin-basis" || p.key === "brandenburg-basis")
    .every((p) => p.refCount === 0 && p.activation === "inactive"));

// Auch AKTIVIERTE Kopien aktivieren die prepared-Landespakete nicht (Paketstatus-Riegel).
const aktivierungAktiv = computeGlobalActivation({
  profiles: aktiv,
  packages: PACKAGE_DEFINITIONS,
  packagePaths: lm.packagePaths,
  retrievalPaths: lm.retrievalPaths
});
check("C5 aktivierte Kopien referenzieren die Landespakete, aktivieren sie aber NICHT (prepared -> requested_unsupplied)",
  (() => {
    const be = aktivierungAktiv.packageStatus.find((p) => p.key === "berlin-basis");
    const bb = aktivierungAktiv.packageStatus.find((p) => p.key === "brandenburg-basis");
    return be && bb && be.refCount === 12 && bb.refCount === 8
      && be.activation === "requested_unsupplied" && bb.activation === "requested_unsupplied";
  })());
check("C6 kein einziger Landesmodul-Abrufweg wird dabei aktiv (alle manual/needs_review)",
  aktivierungAktiv.pathActivation.every((p) => p.active === false));
check("C7 profileSupplyStatus meldet das fehlende Landespaket ehrlich (pflichtpaket-unversorgt), kein falsches Gruen",
  aktiv.every((t) => {
    const s = profileSupplyStatus(t, { packages: PACKAGE_DEFINITIONS, packagePaths: lm.packagePaths });
    return s.eligible === true && s.fullyActivated === false && s.reason === "pflichtpaket-unversorgt";
  }));

// ============ D · Profilnormalisierung: aktivierte Kopien sind vollstaendige Profile ============

check("D1 jede aktivierte Kopie ist aktivierungsberechtigt und 'vollstaendig'",
  aktiv.every((t) => isActivationEligible(t) && validateProfile(t).state === "vollstaendig"));
check("D2 jede aktivierte Kopie kann Briefing, Radar und personalisierte Lage",
  aktiv.every((t) => {
    const v = validateProfile(t);
    return v.impact.kannBriefingErhalten && v.impact.kannRadar && v.impact.kannLagePersonalisieren;
  }));
check("D3 MdL/MdA werden als 'Landtag' erkannt — kein Sonderpfad, dieselbe Ebenenlogik wie MdB",
  ALLE.every((t) => parliamentTypeOf(t) === "Landtag")
  && MDB_TESTMANDATE.every((t) => parliamentTypeOf(t) === "Bundestag"));
check("D4 zuProductionZeilen liefert die ZWEI Zeilen (profiles + mandate_profiles), deaktiviert angelegt",
  ALLE.every((t) => {
    const z = seed.zuProductionZeilen(t);
    return z.profiles.id === t.id && z.profiles.name === t.fullName
      && z.mandate_profiles.user_id === t.id
      && z.mandate_profiles.politische_ebene === "landtag"
      && z.mandate_profiles.aktiv === false;
  }));
check("D5 der Name ist gesetzt (Radar braucht ihn — Befund P-2 des Berliner Profilplans)",
  ALLE.every((t) => String(t.fullName || "").trim().length > 0));

// ============ E · Keine Vermischung: Land <-> Land und MdB <-> MdL ============

check("E1 Berliner Kopien ziehen exakt bund-basis + berlin-basis, NIE brandenburg-basis",
  BE.map(seed.aktivierteKopie).every((t) => {
    const r = resolveProfilePackages(t);
    return r.required.join(",") === "bund-basis,berlin-basis" && !r.all.includes("brandenburg-basis");
  }));
check("E2 Brandenburger Kopien ziehen exakt bund-basis + brandenburg-basis, NIE berlin-basis",
  BB.map(seed.aktivierteKopie).every((t) => {
    const r = resolveProfilePackages(t);
    return r.required.join(",") === "bund-basis,brandenburg-basis" && !r.all.includes("berlin-basis");
  }));
check("E3 die-linke-berlin NUR fuer die zwei Berliner Linke-Mandate; die-linke-brandenburg NIE",
  (() => {
    const mitPaket = aktiv.filter((t) => resolveProfilePackages(t).optional.includes("die-linke-berlin")).map((t) => t.id).sort();
    const bbPaket = aktiv.some((t) => resolveProfilePackages(t).all.includes("die-linke-brandenburg"));
    return mitPaket.join(",") === "test-mda-be-08,test-mda-be-09" && bbPaket === false;
  })());
check("E4 MdB-Testmandate (aktivierte Kopien) ziehen NIE ein Landespaket",
  MDB_TESTMANDATE.map((t) => ({ ...t, profileActive: true })).every((t) => {
    const r = resolveProfilePackages(t);
    return !r.all.includes("berlin-basis") && !r.all.includes("brandenburg-basis");
  }));
check("E5 laenderMitBerechtigtemMandat: nur die tatsaechlich aktivierten Laender erscheinen",
  (() => {
    const nurBerlin = laenderMitBerechtigtemMandat([seed.aktivierteKopie(BE[0])]);
    const nurBb = laenderMitBerechtigtemMandat([seed.aktivierteKopie(BB[0])]);
    const deaktiviert = laenderMitBerechtigtemMandat(ALLE);
    return nurBerlin.has("berlin") && !nurBerlin.has("brandenburg")
      && nurBb.has("brandenburg") && !nurBb.has("berlin")
      && deaktiviert.size === 0;
  })());
check("E6 Riegel 1+1b: Flag ohne Mandat und Mandat ohne Flag sind beide wirkungslos",
  (() => {
    const flagOhneMandat = wirksameLandesmodule({ profiles: [...MDB_TESTMANDATE], env: { HELMUT_LANDESMODULE: "berlin" } });
    const mandatOhneFlag = wirksameLandesmodule({ profiles: [seed.aktivierteKopie(BE[0])], env: {} });
    return flagOhneMandat.wirksam.size === 0 && mandatOhneFlag.wirksam.size === 0;
  })());
check("E7 Berlin-Freigabe + Berliner Mandat oeffnet NUR Berlin (Brandenburg bleibt gesperrt)",
  (() => {
    const w = wirksameLandesmodule({
      profiles: [seed.aktivierteKopie(BE[0]), seed.aktivierteKopie(BB[0])],
      env: { HELMUT_LANDESMODULE: "berlin" }
    });
    return w.wirksam.has("berlin") && !w.wirksam.has("brandenburg");
  })());
check("E8 Fallback-Riegel: eine be-/bb-Katalogquelle bleibt fuer fremde Laender gesperrt",
  (() => {
    const nurBerlinErlaubt = new Set(["berlin"]);
    return landesmodulQuelleGesperrt({ id: "bb-landesparlament" }, nurBerlinErlaubt) === true
      && landesmodulQuelleGesperrt({ id: "be-landesregierung" }, nurBerlinErlaubt) === false
      && landesmodulQuelleGesperrt({ id: "be-landesregierung" }, new Set()) === true
      && landesmodulQuelleGesperrt({ id: "bundestag" }, new Set()) === false;
  })());

// ============ F · Kapazitaetsmodell 25 Mandate ============

check("F1 die Stufen des Auftrags sind 5/10/20 Zusatzmandate", kap.STUFEN.join(",") === "5,10,20");
check("F2 jede Eingabe traegt Herkunft und Beleg",
  Object.values(kap.EINGABEN).every((e) => ["gemessen", "prognose", "simuliert", "annahme"].includes(e.herkunft)
    && typeof e.beleg === "string" && e.beleg.length > 20));
check("F3 deterministisch: zwei Laeufe liefern identische Ergebnisse",
  JSON.stringify(kap.berechneLandesstufe(20)) === JSON.stringify(kap.berechneLandesstufe(20)));
check("F4 Stufenrechnung: 5/10/20 Zusatz ergeben 10/15/25 Mandate",
  kap.STUFEN.every((s) => kap.berechneLandesstufe(s).mandateGesamt === 5 + s));
check("F5 25 Mandate: Tagesmittel bleibt unter dem Deckel, der gemessene Spitzentag NICHT (ehrlich ausgewiesen)",
  (() => {
    const r = kap.berechneLandesstufe(20);
    return r.testbarkeit.deckel.mittelPasst === true
      && r.testbarkeit.deckel.spitzentagPasst === false
      && r.testbarkeit.deckel.mitReservePasst === true;
  })());
check("F6 der Altpfad wird fuer KEINE Stufe als testbar behauptet (Versuch-2-Befund)",
  kap.STUFEN.every((s) => kap.berechneLandesstufe(s).testbarkeit.altpfad.testbar === false));
check("F7 der neue Motor gilt nur MIT Voraussetzungen als testbar (inkl. OP-25-Wiederholung und PARDOK-Cutover)",
  (() => {
    const v = kap.berechneLandesstufe(20).testbarkeit.neuerMotor.voraussetzungen.join(" | ");
    return /OP-25/.test(v) && /PARDOK/.test(v) && /HELMUT_SCALABLE_PIPELINE/.test(v);
  })());
check("F8 Brandenburg-Dokumentmenge wird NICHT erfunden (null + Begruendung)",
  (() => {
    const r = kap.berechneLandesstufe(10);
    return r.dokumente.brandenburg === null && /KEINE Messung/i.test(r.dokumente.brandenburgHinweis);
  })());
check("F9 Annahmen und fehlende Messungen sind explizit benannt",
  (() => {
    const r = kap.berechneLandesstufe(20);
    return r.annahmen.length >= 5 && r.fehlendeMessungen.length >= 4;
  })());
check("F10 fail closed bei unsinniger Eingabe",
  kap.berechneLandesstufe(0).ok === false && kap.berechneLandesstufe("x").ok === false
  && kap.berechneLandesstufe(-3).ok === false);
check("F11 Narrativkosten skalieren linear mit der Messreihe (25 x 0,001307 USD)",
  Math.abs(kap.berechneLandesstufe(20).kosten.narrativProTagUsd - 0.0327) < 0.0001);
check("F12 Stufen ausserhalb des Auftrags sind markiert, nicht verboten",
  kap.berechneLandesstufe(3).imAuftrag === false && kap.berechneLandesstufe(20).imAuftrag === true);

// ============ G · Isolation ============

check("G1 die Seed-Daten sind eingefroren (Object.freeze)",
  Object.isFrozen(seed.TESTMANDATE) && Object.isFrozen(seed.TESTMANDATE[0]) && Object.isFrozen(kap.EINGABEN));
check("G2 kein Laufzeitmodul importiert den Testmandate-Seed (nur Skripte/Tests duerfen)",
  (() => {
    const fs = require("fs");
    const path = require("path");
    const verboten = ["scheduler.js", "storage.js", "server.js"];
    return verboten.every((f) => {
      const p = path.join(__dirname, "..", f === "server.js" ? f : path.join("lib", "helmut", f));
      if (!fs.existsSync(p)) return true;
      return !fs.readFileSync(p, "utf8").includes("landtag-testmandate");
    });
  })());

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
