"use strict";

// Helmut — Phase-1-Punkt 14 (Fortsetzung): NEUTRALITAET, VERIFIKATION, PROFILWEG, LAST.
// =============================================================================================
// Reiner Offline-Test: kein Netz, keine KI, kein DB-Zugriff, kein Datei-Schreiben.
// Ergaenzt scripts/berlin-aktivierung-test.js (Gate/Auswahl/Sperren/Rollback) um die vier
// Fragen, die dort noch nicht ausfuehrbar beantwortet waren:
//
//   1  Neutralitaet — ist berlin-basis frei von Partei-/Fraktions-/Personenquellen? Und zwar
//      geprueft gegen den Code UND gegen den gemessenen Datenbankbestand, mit DEMSELBEN Pruefer.
//   2  Verifikation — wird ein Weg ohne aktuelle, liefernde Verifikation zuverlaessig abgelehnt?
//   3  Profilweg   — zieht das geplante Berliner Abnahmeprofil genau Bund + Berlin, und werden
//      fehlerhafte Profile abgelehnt?
//   4  Last        — steht die Prognose gegen GEMESSENE Production-Zahlen, nicht gegen Annahmen?
//
// Brandenburg wird in keiner Pruefung veraendert; mehrere Pruefungen belegen genau das.

const B = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");
const N = require("../lib/helmut/quellenarchitektur/seeds/berlin-neutralitaet");
const P = require("../lib/helmut/quellenarchitektur/seeds/berlin-profilplan");
const PP = require("../lib/helmut/quellenarchitektur/profile-packages");
const { validateProfile } = require("../lib/helmut/profile-validation");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const seed = buildLandesmodulSeed();

// ══ 1) Neutralitaet von berlin-basis ═════════════════════════════════════════════════════════
{
  const code = N.pruefeBerlinNeutralitaet(N.codeBestand());
  check("1a Code-Abbild: berlin-basis ist neutral (0 Verstoesse)", code.neutral && code.verstoesse.length === 0,
    code.verstoesse.map((v) => v.weg).join(","));
  check("1b Code-Abbild: alle 10 Berliner Paketzuordnungen sind eingestuft", code.geprueftePaketzuordnungen === 10);
  check("1c Keine Zuordnung bleibt 'unklar' (kein stilles Gruen)", code.unklar.length === 0, JSON.stringify(code.unklar));

  // Der Kern: dieselbe Funktion, angewandt auf den GEMESSENEN Datenbankbestand, muss den
  // Production-Befund A-3 finden. Ein Pruefer, der nur den Code gruen meldet, waere wertlos.
  const ist = N.pruefeBerlinNeutralitaet(N.productionBestand(false));
  check("1d Production-Ist 2026-07-26: berlin-basis ist NICHT neutral (Befund A-3 reproduziert)", ist.neutral === false);
  check("1e Genau 3 benannte Verstoesse, mit Kategorie",
    gleich(ist.verstoesse.map((v) => `${v.weg}:${v.kategorie}`).sort(),
      ["rp-be-fraktion_pilot:fraktionsspezifisch", "rp-be-partei_pilot:parteispezifisch", "rp-be-person_pilot:personenspezifisch"]));
  check("1f Jeder Verstoss nennt die Wirkung auf JEDES Mandat des Pflichtpakets",
    ist.verstoesse.every((v) => /Jedes Mandat/.test(v.wirkung) && v.paket === "berlin-basis"));

  const nachher = N.pruefeBerlinNeutralitaet(N.productionBestand(true));
  check("1g Nach Block A ist der gemessene Bestand neutral — die Umhaengung genuegt und nichts sonst",
    nachher.neutral && nachher.verstoesse.length === 0);

  // Einzelpruefungen der drei Merkmalsarten (Auftrag Phase 5, Punkte 2-4).
  const basisWege = N.codeBestand().packagePaths
    .filter((pp) => pp.package_id === "pkg-berlin-basis").map((pp) => pp.retrieval_path_id);
  const pubById = new Map(seed.publishers.map((p) => [p.id, p]));
  const wegById = new Map(seed.retrievalPaths.map((w) => [w.id, w]));
  const typDerWege = basisWege.map((id) => (pubById.get((wegById.get(id) || {}).publisher_id) || {}).publisher_type);
  check("1h Keine Parteiquelle im Basispaket", !typDerWege.includes("party"));
  check("1i Keine Fraktionsquelle im Basispaket", !typDerWege.includes("parliamentary_group"));
  check("1j Keine Personenquelle im Basispaket", !typDerWege.includes("person"));
  check("1k Keine der drei Pilot-Pflichtklassen im Basispaket",
    basisWege.every((id) => ((wegById.get(id) || {}).covers || []).every((k) => !N.BINDENDE_KLASSEN.includes(k))));

  // Zwei unabhaengige Signale: eine Quelle mit falsch gepflegtem Herausgebertyp faellt trotzdem auf.
  check("1l Erkennung ueber die Pflichtklasse allein (Herausgebertyp verfaelscht) greift",
    N.bindendeMerkmale({ covers: ["partei_pilot"] }, { publisher_type: "government" }).length === 1);
  check("1m Erkennung ueber den Herausgebertyp allein (Klasse verfaelscht) greift",
    N.bindendeMerkmale({ covers: ["landesregierung"] }, { publisher_type: "party" }).length === 1);
  check("1n Negativkontrolle: eine neutrale amtliche Quelle erzeugt KEIN bindendes Merkmal",
    N.bindendeMerkmale({ covers: ["landesregierung"] }, { publisher_type: "government" }).length === 0);

  // Negativkontrolle auf Paketebene: haenge testweise eine Parteiquelle zurueck ans Basispaket.
  const manipuliert = N.codeBestand();
  const verletzt = N.pruefeNeutralitaet({
    ...manipuliert,
    packagePaths: [...manipuliert.packagePaths, { package_id: "pkg-berlin-basis", retrieval_path_id: "rp-be-partei_pilot" }]
  });
  check("1o Negativkontrolle: eine zurueckgehaengte Parteiquelle wird erkannt",
    verletzt.neutral === false && verletzt.verstoesse.some((v) => v.weg === "rp-be-partei_pilot"));

  // Ein NICHT-is_base-Paket darf Parteiquellen tragen — sonst waere das Parteipaket unmoeglich.
  check("1p die-linke-berlin traegt genau die 3 Partei-/Fraktions-/Personenwege",
    gleich(N.codeBestand().packagePaths.filter((pp) => pp.package_id === "pkg-die-linke-berlin")
      .map((pp) => pp.retrieval_path_id).sort(),
      ["rp-be-fraktion_pilot", "rp-be-partei_pilot", "rp-be-person_pilot"]));
  check("1q die-linke-berlin ist NICHT is_base (kein Mandat erhaelt es zwingend)",
    PACKAGE_DEFINITIONS.find((p) => p.key === "die-linke-berlin").is_base === false);
}

// ══ 2) Verifikationsgate: erreichbar ist nicht liefernd ══════════════════════════════════════
{
  check("2a Verifikation ist aktuell und stammt von einem Runner mit offenem Egress",
    N.VERIFIKATION_META.datum === "2026-07-26" && N.VERIFIKATION_META.egressOffen === true
    && N.VERIFIKATION_META.realGeprueft === N.VERIFIKATION_META.gesamt);
  check("2b Alle 10 Berliner Wege tragen ein aktuelles Verifikationsergebnis",
    seed.retrievalPaths.filter((w) => w.id.startsWith("rp-be-") || w.id === "rp-rbb24-politik")
      .every((w) => Boolean(N.VERIFIKATION_20260726[w.id])));

  check("2c Ein Weg OHNE Verifikationsergebnis wird abgelehnt (nichts wird erfunden)",
    N.darfAktiviertWerden("rp-gibt-es-nicht").erlaubt === false
    && N.darfAktiviertWerden("rp-gibt-es-nicht").gruende.includes("keine-aktuelle-verifikation"));
  check("2d Der 156-Tage-Weg wird abgelehnt, obwohl er HTTP 200 liefert",
    N.darfAktiviertWerden("rp-be-landesparlament").erlaubt === false
    && N.darfAktiviertWerden("rp-be-landesparlament").gruende.some((g) => /veraltet-156/.test(g)));
  check("2e Der 41-Tage-Weg wird abgelehnt",
    N.darfAktiviertWerden("rp-be-landesfraktionen").erlaubt === false);
  check("2f Die bot-gesperrten 429-Wege werden abgelehnt",
    N.darfAktiviertWerden("rp-be-partei_pilot").erlaubt === false
    && N.darfAktiviertWerden("rp-be-fraktion_pilot").erlaubt === false);
  check("2g Der 14-Tage-Weg ist erlaubt, aber unter Beobachtung",
    N.darfAktiviertWerden("rp-be-staatskanzlei").erlaubt === true
    && N.darfAktiviertWerden("rp-be-staatskanzlei").beobachtung === true);
  check("2h Die drei 0-Tage-Wege sind erlaubt und NICHT unter Beobachtung",
    ["rp-be-landesregierung", "rp-be-regionale_leitmedien", "rp-rbb24-politik"]
      .every((id) => N.darfAktiviertWerden(id).erlaubt && !N.darfAktiviertWerden(id).beobachtung));
  check("2i Ein strukturell leerer Weg wird auch bei gueltiger Quelle abgelehnt (PARDOK)",
    N.darfAktiviertWerden("rp-be-plenum", { strukturellLeer: true }).erlaubt === false);
  check("2j Eine bindende Quelle wird auch bei perfekter Verifikation abgelehnt",
    N.darfAktiviertWerden("rp-be-person_pilot", { bindend: true }).erlaubt === false);

  // Grenzwerte der Frischestufen — explizit, damit eine spaetere Aenderung auffaellt.
  check("2k Frischestufen: 7 frisch · 8 Beobachtung · 30 Beobachtung · 31 veraltet",
    N.frischeStufe(7).id === "frisch" && N.frischeStufe(8).id === "beobachtung"
    && N.frischeStufe(30).id === "beobachtung" && N.frischeStufe(31).id === "veraltet");
  check("2l Ein Weg ohne datierbares Item gilt als veraltet, nicht als frisch",
    N.frischeStufe(null).id === "veraltet" && N.frischeStufe(Infinity).id === "veraltet");

  // Das Gate muss auf das Aktivierungsset durchschlagen.
  check("2m JEDER Weg im Aktivierungsset besteht das Verifikationsgate",
    B.AKTIVIERUNGSSET.every((id) => N.darfAktiviertWerden(id).erlaubt),
    B.AKTIVIERUNGSSET.filter((id) => !N.darfAktiviertWerden(id).erlaubt).join(","));
  check("2n Kein abgelehnter Weg steht im Aktivierungsset",
    ["rp-be-landesparlament", "rp-be-landesfraktionen", "rp-be-partei_pilot", "rp-be-fraktion_pilot", "rp-be-person_pilot", "rp-be-plenum"]
      .every((id) => !B.AKTIVIERUNGSSET.includes(id)));
}

// ══ 3) Plan-Selbstpruefung + Pflichtklassen-Tiefe ════════════════════════════════════════════
{
  const pp = B.planpruefung();
  check("3a Plan ist in sich schluessig (jeder Weg genau einmal eingestuft, Gate erfuellt)", pp.ok, JSON.stringify(pp));
  check("3b Kein Weg ohne Einstufung", pp.ohneEinstufung.length === 0, pp.ohneEinstufung.join(","));
  check("3c Kein Weg doppelt eingestuft", pp.doppelt.length === 0, pp.doppelt.join(","));
  check("3d Die Aktivierungsstufen decken das Aktivierungsset vollstaendig ab", pp.stufenVollstaendig);
  check("3e Stufe 1 enthaelt AUSSCHLIESSLICH Direktfeeds (0 Google-Requests)",
    B.AKTIVIERUNGSSTUFEN[0].wege.every((id) => {
      const w = B.berlinWegeAusSeed().find((x) => x.id === id);
      return w && w.method !== "googlenews_search";
    }));
  check("3f Stufe 2 enthaelt die Google-Wege", B.AKTIVIERUNGSSTUFEN[1].wege.every((id) => {
    const w = B.berlinWegeAusSeed().find((x) => x.id === id);
    return w && w.method === "googlenews_search";
  }));
  check("3g Die Stufen ueberschneiden sich nicht",
    B.AKTIVIERUNGSSTUFEN[0].wege.every((id) => !B.AKTIVIERUNGSSTUFEN[1].wege.includes(id)));

  // Pflichtklassen-Tiefe: der Unterschied zwischen "eigener Weg" und "laeuft nur mit".
  const a = N.klassenAbdeckung(B.AKTIVIERUNGSSET);
  check("3h 12 Basis-Pflichtklassen insgesamt", a.gesamt === 12);
  check("3i 4 Klassen eigenstaendig abgedeckt",
    gleich(a.eigenstaendig.slice().sort(),
      ["landesregierung", "oer_landesberichterstattung", "regionale_leitmedien", "staatskanzlei"]), a.eigenstaendig.join(","));
  check("3j 1 Klasse nur mitabgedeckt (ministerien laeuft an der Landesregierungs-Suche mit)",
    gleich(a.mitabgedeckt, ["ministerien"]));
  check("3k 7 Klassen ohne liefernden Weg", a.nichtGeliefert.length === 7, a.nichtGeliefert.join(","));
  check("3l Summe stimmt (keine Klasse doppelt oder verloren)",
    a.eigenstaendig.length + a.mitabgedeckt.length + a.nichtGeliefert.length === 12);

  // Gegenprobe: mit dem ALTEN 6er-Set waren es 6 eigenstaendig + 2 mitabgedeckt — die Aussage
  // "8 von 12 liefern" verdeckte also zwei nur formal erfuellte Klassen.
  const alt = N.klassenAbdeckung(["rp-be-landesparlament", "rp-be-landesregierung", "rp-be-staatskanzlei",
    "rp-be-landesfraktionen", "rp-be-regionale_leitmedien", "rp-rbb24-politik"]);
  check("3m Gegenprobe Alt-Set: 8 'liefernde' Klassen waren real 6 eigenstaendig + 2 mitabgedeckt",
    alt.eigenstaendig.length === 6 && alt.mitabgedeckt.length === 2
    && gleich(alt.mitabgedeckt.slice().sort(), ["ausschuesse", "ministerien"]));

  // Ein Weg, der nur EINE Klasse deckt, gilt fuer sie als eigenstaendig — auch wenn seine Id
  // anders heisst (rbb24 traegt den Sendernamen, nicht den Klassennamen).
  check("3n rbb24 gilt fuer oer_landesberichterstattung als eigenstaendig, nicht als Mitlaeufer",
    N.namensgebendeKlasse("rp-rbb24-politik", { covers: ["oer_landesberichterstattung"] }) === "oer_landesberichterstattung");
}

// ══ 4) Profilweg (Bedingung V3) ══════════════════════════════════════════════════════════════
{
  const abnahme = P.GEMAPPTES_PROFIL;
  const v = validateProfile(abnahme);
  check("4a Das Abnahmeprofil ist vollstaendig und aktivierungsberechtigt",
    v.state === "vollstaendig" && PP.isActivationEligible(abnahme) === true, v.missingRequired.join(","));
  check("4b Es ist als Testmandat erkennbar und nennt keine reale Person",
    /Testmandat/.test(P.PRODUCTION_ZEILEN.profiles.name) && P.PRODUCTION_ZEILEN.mandate_profiles.partei === "Fraktionslos");
  check("4c Radar-Faehigkeit ist gegeben (Name gesetzt)", v.impact.kannRadar === true);

  const r = PP.resolveProfilePackages(abnahme);
  check("4d Pflichtpakete sind genau Bund + Berlin", gleich(r.required, P.ERWARTETE_PAKETE.required));
  check("4e Kein Pflichtpaket fehlt (Bundesland ist aufloesbar)", r.requiredMissing.length === 0);
  check("4f Kein verbotenes Paket wird gezogen",
    P.ERWARTETE_PAKETE.verboten.every((k) => !r.all.includes(k)), r.all.join(","));
  check("4g Nur die erlaubte optionale Referenz (persoenliches Paket, das es nicht gibt)",
    gleich(r.optional, P.ERWARTETE_PAKETE.optionalErlaubt));
  check("4h Die persoenliche Paketreferenz bleibt folgenlos, solange kein solches Paket existiert",
    !PACKAGE_DEFINITIONS.some((p) => p.key === P.ERWARTETE_PAKETE.optionalErlaubt[0]));

  // Gegenproben — die vier Richtungen, in die es schiefgehen kann.
  const g = P.GEGENPROBE_PROFILE;
  check("4i Bundestagsprofil erhaelt KEIN Berliner Paket",
    !PP.resolveProfilePackages(g.bundestag).all.includes("berlin-basis"));
  check("4j Brandenburg-Profil erhaelt KEIN Berliner Paket und behaelt sein eigenes",
    !PP.resolveProfilePackages(g.brandenburg).all.includes("berlin-basis")
    && PP.resolveProfilePackages(g.brandenburg).required.includes("brandenburg-basis"));
  check("4k Berliner Linke-Profil erhaelt zusaetzlich das Parteipaket",
    PP.resolveProfilePackages(g.berlinLinke).optional.includes("die-linke-berlin"));
  check("4l Berliner Nicht-Linke-Profil erhaelt das Linke-Paket NICHT",
    !PP.resolveProfilePackages(abnahme).all.includes("die-linke-berlin"));
  check("4m Profil mit falschem Bundesland zieht kein Berliner Paket",
    !PP.resolveProfilePackages(g.falschesBundesland).all.includes("berlin-basis"));
  check("4n Profil ohne Mandatsebene zieht kein Landespaket",
    gleich(PP.resolveProfilePackages(g.ohneEbene).required, ["bund-basis"]));
  check("4o Profil ohne Bundesland zieht kein Landespaket",
    gleich(PP.resolveProfilePackages(g.ohneBundesland).required, ["bund-basis"]));
  check("4p Deaktiviertes Profil ist nicht aktivierungsberechtigt", PP.isActivationEligible(g.deaktiviert) === false);
  check("4q Geloeschtes Profil ist nicht aktivierungsberechtigt", PP.isActivationEligible(g.geloescht) === false);
  check("4r Leeres Profil ist nicht aktivierungsberechtigt", PP.isActivationEligible(g.leer) === false);

  // BEFUND P-1: die Zaehlabfrage des Runbooks belegt keine Aktivierungsberechtigung.
  // Eine rohe mandate_profiles-Zeile (nur deutsche Spalten) wuerde von ihr gezaehlt, ist aber
  // 'nicht_bereit' und traegt 0 zur Referenzzaehlung bei.
  const roh = { ...P.PRODUCTION_ZEILEN.mandate_profiles };
  check("4s BEFUND P-1: eine rohe DB-Zeile wuerde von der V3-Zaehlabfrage gezaehlt ...",
    roh.politische_ebene === "landtag" && String(roh.bundesland).toLowerCase() === "berlin" && roh.aktiv === true);
  check("4t ... ist aber NICHT aktivierungsberechtigt (nicht_bereit)",
    validateProfile(roh).state === "nicht_bereit" && PP.isActivationEligible(roh) === false);
  check("4u Die geschaerfte V3-Abfrage prueft Namen, Partei, Region und Schwerpunkt mit",
    /hat_namen/.test(P.V3_PRUEFABFRAGE) && /partei/.test(P.V3_PRUEFABFRAGE)
    && /wahlkreis/.test(P.V3_PRUEFABFRAGE) && /fachpolitische_schwerpunkte/.test(P.V3_PRUEFABFRAGE)
    && /geloescht_at is null/.test(P.V3_PRUEFABFRAGE));
  check("4v BEFUND P-2: der Plan verlangt ZWEI Zeilen (profiles + mandate_profiles)",
    Boolean(P.PRODUCTION_ZEILEN.profiles.id) && Boolean(P.PRODUCTION_ZEILEN.mandate_profiles.user_id)
    && P.PRODUCTION_ZEILEN.profiles.id === P.PRODUCTION_ZEILEN.mandate_profiles.user_id);
  check("4w Jedes Pflichtfeld nennt Spalte und Ausfallwirkung",
    P.PFLICHTFELDER.length >= 8 && P.PFLICHTFELDER.every((f) => f.feld && f.spalte && f.fehltWirkung));
  check("4x Der Rueckweg beginnt mit Deaktivieren, nicht mit Loeschen",
    P.RUECKWEG[0].stufe === 0 && /aktiv = false/.test(P.RUECKWEG[0].mittel) && P.RUECKWEG[0].sofort === true
    && P.RUECKWEG[P.RUECKWEG.length - 1].sofort === false);
  check("4y Die Production-Schritte legen das Profil VOR Paketstatus und Flag an",
    P.PRODUCTION_SCHRITTE[0].nr === 1 && P.PRODUCTION_SCHRITTE.filter((s) => s.mutierend).length === 2);

  // Referenzzaehlung end-to-end: das Abnahmeprofil aktiviert berlin-basis nur, wenn das Paket
  // 'active' ist — und aktiviert unter KEINEN Umstaenden ein Brandenburg-Paket.
  const paketeAktiv = PACKAGE_DEFINITIONS.map((p) => (p.key === "berlin-basis" ? { ...p, status: "active" } : { ...p }));
  const akt = PP.computeGlobalActivation({
    profiles: [abnahme], packages: paketeAktiv,
    packagePaths: N.codeBestand().packagePaths, retrievalPaths: seed.retrievalPaths
  });
  const statusVon = (key) => (akt.packageStatus.find((p) => p.key === key) || {}).activation;
  check("4z Abnahmeprofil aktiviert berlin-basis (Referenzzaehlung)", statusVon("berlin-basis") === "active");
  check("4z1 Abnahmeprofil aktiviert brandenburg-basis NICHT", statusVon("brandenburg-basis") === "inactive");
  check("4z2 Abnahmeprofil aktiviert die-linke-berlin NICHT", statusVon("die-linke-berlin") === "inactive");
  const aktivePfade = new Set(akt.activePathIds);
  check("4z3 Kein Brandenburg-Weg wird durch das Berliner Profil aktiv",
    seed.retrievalPaths.filter((w) => w.id.startsWith("rp-bb-")).every((w) => !aktivePfade.has(w.id)));
  // Bei 'prepared' bleibt alles aus — der Paketstatus ist ein eigener, wirksamer Riegel.
  const aktPrepared = PP.computeGlobalActivation({
    profiles: [abnahme], packages: PACKAGE_DEFINITIONS,
    packagePaths: N.codeBestand().packagePaths, retrievalPaths: seed.retrievalPaths
  });
  check("4z4 Bei berlin-basis='prepared' bleibt das Paket unversorgt (requested_unsupplied)",
    (aktPrepared.packageStatus.find((p) => p.key === "berlin-basis") || {}).activation === "requested_unsupplied");
}

// ══ 5) Last gegen GEMESSENE Production-Zahlen ════════════════════════════════════════════════
{
  const ist = B.LAST_IST_20260726;
  const real = B.lastprognoseRealistisch();
  const grenze = B.lastprognose();

  check("5a Der Ist-Betrieb ist datiert und benennt sein Messfenster", ist.gemessenAm === "2026-07-26" && Boolean(ist.fenster));
  check("5b Die Alt-Annahme '15-20 Understandings/Tag' ist widerlegt (gemessen ~40)",
    ist.knowledgeObjectsProTagMittel >= 32 && ist.knowledgeObjectsProTagMin === 32 && ist.knowledgeObjectsProTagMax === 50);
  check("5c Rohdokumente sind nicht Understandings (nur ~13 % werden mit einem KO verknuepft)",
    ist.anteilRohdokumenteMitKoVerknuepfung > 0 && ist.anteilRohdokumenteMitKoVerknuepfung < 0.2);
  check("5d Der Ist-Eingang ist mit ~277 Rohdokumenten/Tag bereits groesser als die Berlin-Obergrenze der Alt-Rechnung",
    ist.rohdokumenteProTag > 192);
  check("5e Die echte Obergrenze ist das LLM-Tagesbudget, und es wurde einmal voll ausgeschoepft",
    ist.llmTagesbudget === 100 && ist.llmCallsProTagMax === 100);
  check("5f Der Pending-Rueckstand waechst nicht (Alt-Bestand, kein Zulauf)",
    ist.pendingWaechst === false && ist.pendingRueckstand === 50);

  check("5g Realistische Prognose bleibt deutlich unter dem Ist-Eingang (<10 % im Mittel)",
    real.anteilAmIstEingangMittel < 10 && real.anteilAmIstEingangMedian < 5);
  check("5h Im Mittel reicht das LLM-Tagesbudget nach der Aktivierung", real.budgetReichtImMittel === true);
  check("5i EHRLICH: am gemessenen Spitzentag reicht es NICHT — und das steht auch so da",
    real.budgetReichtAmSpitzentag === false && /KEINEN Spielraum/.test(real.hinweis));
  check("5j Der Erstlauf ist als einmaliger Ausschlag getrennt ausgewiesen",
    real.erstlaufDokumenteMax === 4 * 16 && real.erstlaufLlmCallsMax > real.zusaetzlicheLlmCallsProTagMittel);

  check("5k Obergrenze und Realprognose sind BEIDE ausgewiesen (keine geschoente Punktzahl)",
    grenze.dokumenteProTagMax === 320 && real.dokumenteProTagMittel < grenze.dokumenteProTagMax);
  check("5l Die Laufzahl je Tag ist gemessen, nicht aus vercel.json geraten",
    B.LAST_ANNAHMEN.crawlLaeufeProTag === 5 && /gemessen/.test(B.LAST_ANNAHMEN.crawlLaeufeProTagQuelle));
  check("5m Wiederholungslaeufe loesen keinen zweiten Abruf aus (skipped-shared)",
    B.LAST_ANNAHMEN.wiederholungslaeufeOhneAbruf === true);
  check("5n Der Crawl selbst kostet 0 LLM-Aufrufe", grenze.llmCallsDurchCrawl === 0);

  // Lastobergrenze im definierten Rahmen: das Abbruchkriterium des Runbooks liegt bei 250
  // zusaetzlichen Abrufen je Lauf. Die Obergrenze des Sets muss darunter liegen.
  check("5o Die Abruf-Obergrenze je Lauf bleibt unter dem Abbruchkriterium von 250",
    grenze.abrufeProLaufMax < 250, String(grenze.abrufeProLaufMax));
  check("5p Originalverweise werden in Production real aufgeloest (99,5 %, 0 verbliebene Google-URLs)",
    ist.originalverweisAufgeloest > 0.99 && ist.rohdokumenteNochMitGoogleUrl === 0);
}

// ══ 6) Adversariale Gegenproben ══════════════════════════════════════════════════════════════
{
  // Eine Aggregator-Quelle darf nicht als amtlicher Direktbeleg durchgehen. Die vier
  // Google-News-Wege haengen an amtlichen Herausgebern (evidence_role official_primary) —
  // das ist zulaessig, muss aber ausgewiesen sein, sonst ist die Pflichtklasse nur formal erfuellt.
  const googleWegeMitAmtlichemHerausgeber = B.berlinWegeAusSeed()
    .filter((w) => w.method === "googlenews_search" && w.evidence_role === "official_primary");
  check("6a Jeder Google-Weg mit amtlichem Herausgeber traegt eine ausgewiesene Einschraenkung",
    googleWegeMitAmtlichemHerausgeber.every((w) => B.EINSCHRAENKUNGEN.some((e) => e.weg === w.id
      && ["aggregator-umweg", "veraltet", "teilmenge"].includes(e.art))),
    googleWegeMitAmtlichemHerausgeber.filter((w) => !B.EINSCHRAENKUNGEN.some((e) => e.weg === w.id)).map((w) => w.id).join(","));
  check("6b Kein aktivierter Weg wird als amtlicher DIREKTfeed ausgegeben, wenn er ueber Google laeuft",
    B.berlinWegeAusSeed().filter((w) => w.aktiviert && w.method === "googlenews_search")
      .every((w) => new URL(w.url).hostname === "news.google.com"));

  // Die mehrlaendrige Quelle darf nicht als rein berlinisch behandelt werden.
  const rbb = B.berlinWegeAusSeed().find((w) => w.id === "rp-rbb24-politik");
  check("6c rbb24 ist als mehrlaendrig ausgewiesen und nennt beide Pakete",
    rbb.mehrlaendrig === true && rbb.fremdpakete.includes("pkg-brandenburg-basis"));
  check("6d Die Einstufung von rbb24 ist 'mehrlaendrig', nicht 'journalistisch_neutral'",
    N.kategorisiereWeg({ covers: ["oer_landesberichterstattung"], landModule: "berlin+brandenburg" },
      { publisher_type: "media" }, { mehrlaendrig: true }) === "mehrlaendrig");
  check("6e Trotz rbb24 wird KEIN Brandenburg-Paket und KEIN rp-bb-Weg aktiviert",
    !B.AKTIVIERUNGSSET.some((id) => id.startsWith("rp-bb-"))
    && B.NICHT_BERUEHRT.paketKeys.includes("brandenburg-basis"));

  // Der Plan darf Brandenburg auch textlich nicht anfassen.
  const planText = JSON.stringify({
    set: B.AKTIVIERUNGSSET, stufen: B.AKTIVIERUNGSSTUFEN, umhaengung: B.UMHAENGUNG
  });
  check("6f Weder Aktivierungsset noch Stufen noch Umhaengung nennen einen rp-bb-Weg",
    !/rp-bb-/.test(planText));
  check("6g Die Umhaengung betrifft ausschliesslich Berliner Wege",
    B.UMHAENGUNG.wege.every((w) => w.startsWith("rp-be-")) && B.UMHAENGUNG.von === "pkg-berlin-basis"
    && B.UMHAENGUNG.nach === "pkg-die-linke-berlin");

  // Rollback darf keinen aktiven Weg hinterlassen: das Rollback-Ziel ist der gesperrte Zustand.
  check("6h Der Zielzustand jedes NICHT aktivierten Wegs ist needs_review + manual",
    B.NICHT_AKTIVIERT.every((n) => n.bleibt.status === "needs_review" && n.bleibt.activation_mode === "manual"));
  check("6i Jeder Nicht-Aktivierungsgrund nennt Begruendung UND Folge fuer die Pflichtklassen",
    B.NICHT_AKTIVIERT.every((n) => n.grund && n.begruendung && n.folge));

  // Die Dokumentation darf nicht mehr behaupten als bewiesen ist.
  check("6j Die Verifikation nennt fuer JEDEN Weg einen Beleg",
    Object.values(N.VERIFIKATION_20260726).every((v) => Boolean(v.beleg) && Number.isFinite(v.http)));
  check("6k Wege mit Einschraenkung tragen sie ausgeschrieben",
    Object.values(N.VERIFIKATION_20260726)
      .filter((v) => v.urteil !== "geeignet").every((v) => Boolean(v.einschraenkung)));
  check("6l Der PARDOK-Weg gilt trotz Urteil 'geeignet' NICHT als liefernd",
    N.VERIFIKATION_20260726["rp-be-plenum"].urteil === "geeignet"
    && !B.AKTIVIERUNGSSET.includes("rp-be-plenum"));

  // Rollback-Robustheit: das committete Rollback-SQL muss ALLE Wege des Basispakets
  // zuruecksetzen, nicht nur das heutige Aktivierungsset. Sonst bliebe ein Weg aktiv, den eine
  // aeltere Fassung des Plans (6 statt 4 Wege) scharfgeschaltet hat — und der Rollback wuerde
  // trotzdem als vollstaendig gemeldet.
  const fs = require("fs");
  const path = require("path");
  const seedDir = path.join(__dirname, "..", "supabase", "seeds");
  const rbText = fs.readFileSync(path.join(seedDir, "20260726_berlin_aktivierung_rollback.sql"), "utf8");
  const rbVollText = fs.readFileSync(path.join(seedDir, "20260726_berlin_aktivierung_rollback_vollstaendig.sql"), "utf8");
  const basisWegeAlle = B.berlinWegeAusSeed().map((w) => w.id).filter((id) => !B.UMHAENGUNG.wege.includes(id));
  check("6o Rollback Stufe 1 setzt ALLE 7 Basispaket-Wege zurueck, nicht nur die 4 aktivierten",
    basisWegeAlle.length === 7 && basisWegeAlle.every((id) => rbText.includes(`'${id}'`)),
    basisWegeAlle.filter((id) => !rbText.includes(`'${id}'`)).join(","));
  check("6p Rollback Stufe 2 ebenso", basisWegeAlle.every((id) => rbVollText.includes(`'${id}'`)));
  check("6q Insbesondere die zwei veralteten Wege stehen im Rollback (Alt-Aktivierung faengt sich)",
    rbText.includes("'rp-be-landesparlament'") && rbText.includes("'rp-be-landesfraktionen'"));
  check("6r Kein Rollback-SQL nennt einen Brandenburg-Bezeichner",
    !/rp-bb-|brandenburg-basis|die-linke-brandenburg/.test(
      rbText.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
      + rbVollText.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")));

  // Die Voraussetzungsliste muss die neue Lage abbilden.
  check("6s V1 bis V6 sind vollstaendig und jede kritische Voraussetzung ist als solche markiert",
    B.VORAUSSETZUNGEN.length === 6 && B.VORAUSSETZUNGEN.every((v) => v.id && v.titel && v.pruefbar && v.kritisch === true));
  check("6t Genau zwei Voraussetzungen sind nicht mutierend (Verifikation und Sicherung)",
    B.VORAUSSETZUNGEN.filter((v) => v.mutierend === false).length === 2);
}

console.log(`\n== Ergebnis: ${passed} PASS, ${failed} FAIL ==`);
if (failed === 0) {
  console.log("berlin-basis ist im Code neutral; der gemessene Production-Bestand ist es NICHT (Befund A-3).");
  console.log("Aktivierungsset auf 4 aktuell verifizierte Wege reduziert. Brandenburg unveraendert.");
}
process.exit(failed > 0 ? 1 : 0);
