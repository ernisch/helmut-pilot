"use strict";

// Helmut — Phase-1-Punkt 14B: das Berliner ABNAHMEPROFIL, ausführbar geprüft.
// =============================================================================================
// Reiner Offline-Test: kein Netz, keine KI, kein DB-Zugriff, kein Datei-Schreiben.
//
// Der Test beantwortet ausführbar:
//   1  Identität   — Testmandat, keine reale Person, keine E-Mail, keine Parteibindung
//   2  Berechtigung— das gemappte Profil ist aktivierungsberechtigt UND zieht genau
//                    bund-basis + berlin-basis (kein Brandenburg, kein Parteipaket)
//   3  Gate        — Flag UND Mandat sind beide nötig; eines allein wirkt nicht
//   4  Rückweg     — ZWEI voneinander unabhängige, datenbankseitige Not-Aus-Schalter, jeder
//                    für sich hinreichend, um jeden Berliner Abruf zu stoppen
//   5  Bedingungen — jede Bedingungsart des Schritts trifft ihren Fall (ok und Verletzung)
//   6  SQL         — die 4 committeten Dateien sind fail-closed, berühren keine Quelle,
//                    kein Paket, keinen Abrufweg, kein DDL und keinen Brandenburg-Bezeichner
//   7  Last        — was das zusätzliche Mandat den Betrieb kostet, gemessen statt behauptet
//   8  Neutralität — die Abnahme-Id steht in keiner aktiven Mandantenlogik (CLAUDE.md §4.2)

const fs = require("fs");
const path = require("path");
const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const PP = require("../lib/helmut/quellenarchitektur/profile-packages");
const P = require("../lib/helmut/quellenarchitektur/seeds/berlin-profilplan");
const B = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { validateProfile } = require("../lib/helmut/profile-validation");
const tenantContext = require("../lib/helmut/tenant-context");
const scheduler = require("../lib/helmut/scheduler");
const generator = require("./generate-berlin-abnahmeprofil-sql");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SEEDS = path.join(__dirname, "..", "supabase", "seeds");
const lies = (datei) => fs.readFileSync(path.join(SEEDS, datei), "utf8");
// Nur die ausführbaren Zeilen — Kommentare dürfen Begriffe nennen, Statements nicht.
const ausfuehrbar = (text) => text.split("\n").filter((z) => !z.trim().startsWith("--")).join("\n");

// ── Fixtures: produktionsförmiger Katalog (keine Production-Daten, keine reale Identität) ─────
const landesSeed = buildLandesmodulSeed();
const BUND_WEGE = [
  { id: "rp-kern-1", legacy_source_id: "kern-1", method: "rss", url: "https://kern1.example/rss", status: "healthy", activation_mode: "always_on", priority: 100 },
  { id: "rp-bund-a", legacy_source_id: "bund-a", method: "rss", url: "https://bunda.example/rss", status: "healthy", activation_mode: "auto", priority: 90 }
];
const BUND_LINKS = [
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-kern-1" },
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-bund-a" }
];

// Zustand NACH Block A, B1 und Stufe 1 — also genau der Zustand, in dem das Abnahmeprofil im
// Beweislauf steht: Paket active, die 2 Stufe-1-Wege scharf, alles andere gesperrt.
function katalog({ berlinAktiv = true, wegeScharf = true } = {}) {
  const scharf = new Set(wegeScharf ? B.stufenWege(1) : []);
  const retrievalPaths = [
    ...BUND_WEGE.map((p) => ({ ...p })),
    ...landesSeed.retrievalPaths.map((p) => ({
      id: p.id, legacy_source_id: p.legacy_source_id,
      method: p.method === "opendata_xml" || p.method === "api_xml" ? "structured_download" : p.method,
      url: p.url, priority: p.priority,
      status: scharf.has(p.id) ? "healthy" : "needs_review",
      activation_mode: scharf.has(p.id) ? "auto" : "manual"
    }))
  ];
  const packages = PACKAGE_DEFINITIONS.map((pk) => ({
    ...pk, status: pk.key === B.BASISPAKET_KEY && berlinAktiv ? "active" : pk.status
  }));
  // Neutralisiert (nach Block A): die 3 Partei-/Fraktions-/Personenwege hängen am Parteipaket.
  const packagePaths = [...BUND_LINKS, ...landesSeed.packagePaths.map((pp) => ({ ...pp }))];
  return { retrievalPaths, packages, packagePaths };
}
const plan = (opts = {}) => SM.buildRelationalCrawlPlan({
  ...katalog(opts), profiles: opts.profiles || [], legacySources: [], env: opts.env || {}
});
const berlinIds = landesSeed.retrievalPaths.map((p) => p.id).filter((id) => id.startsWith("rp-be-") || id === "rp-rbb24-politik");
const berlinAktivIm = (pl) => pl.aktiv.filter((a) => berlinIds.includes(a.id)).map((a) => a.id).sort();
const bundAktivIm = (pl) => pl.aktiv.filter((a) => a.id.startsWith("rp-kern") || a.id.startsWith("rp-bund")).map((a) => a.id).sort();

// Das Abnahmeprofil in der Form, in der die Aktivierungslogik es sieht.
const A = P.GEMAPPTES_PROFIL;
// Dasselbe Profil ohne die profiles-Zeile (Befund P-2) und deaktiviert (Rückweg Stufe 0).
const A_OHNE_NAMEN = { ...A, fullName: undefined };
const A_DEAKTIVIERT = { ...A, profileActive: false };
const A_GELOESCHT = { ...A, geloescht_at: "2026-07-26T20:00:00Z" };
const P_BUND = { id: "t-bund", aktiv: true, politische_ebene: "bundestag", name: "Testprofil Bund", partei: "Testpartei" };
const FLAG_BE = { HELMUT_LANDESMODULE: "berlin" };

// ══ 1) Identität: Testmandat, keine reale Person ══════════════════════════════════════════════
{
  const z = P.PRODUCTION_ZEILEN;
  check("1a Der Name ist ausdrücklich als Testmandat erkennbar",
    /testmandat/i.test(z.profiles.name) && /helmut-abnahme/i.test(z.profiles.name + " " + P.PROFIL_ID));
  check("1b Die Partei bindet an kein Parteipaket ('Fraktionslos')", z.mandate_profiles.partei === "Fraktionslos");
  check("1c Keine E-Mail-Adresse im Plan und im SQL",
    !("email" in z.profiles) && !/email/i.test(ausfuehrbar(lies(P.DATEI_ANLEGEN))));
  check("1d Die Id trägt kein Personenmerkmal (kein Klarname, kein Wahlkreis einer Person)",
    /^helmut-abnahme-berlin$/.test(P.PROFIL_ID));
  check("1e Bundesland und Ebene sind exakt gesetzt",
    z.mandate_profiles.bundesland === "Berlin" && z.mandate_profiles.politische_ebene === "landtag");
  check("1f Onboarding-Status ist ein von der Datenbank erlaubter Wert",
    ["neu", "in_bearbeitung", "abgeschlossen"].includes(z.mandate_profiles.onboarding_status));
}

// ══ 2) Berechtigung und Paketauflösung ═══════════════════════════════════════════════════════
{
  const v = validateProfile(A);
  check("2a Das gemappte Abnahmeprofil ist brauchbar (usable)", v.usable === true, v.state);
  check("2b Es ist aktivierungsberechtigt (isActivationEligible)", PP.isActivationEligible(A) === true);
  check("2c BEFUND P-2: mit profiles-Zeile kann der Radar Personentreffer bilden", v.impact.kannRadar === true);
  check("2d BEFUND P-2: OHNE profiles-Zeile bliebe der Radar stumm — ein Beweislauf mit stillem Radar-Ausfall",
    validateProfile(A_OHNE_NAMEN).impact.kannRadar === false);
  const r = PP.resolveProfilePackages(A);
  check("2e Pflichtpakete sind genau bund-basis + berlin-basis",
    gleich(r.required.slice().sort(), P.ERWARTETE_PAKETE.required.slice().sort()), r.required.join(","));
  check("2f Kein Pflichtpaket fehlt (requiredMissing leer)", r.requiredMissing.length === 0, r.requiredMissing.join(","));
  check("2g Optional ist ausschliesslich das (nicht existierende) persönliche Paket",
    gleich(r.optional, P.ERWARTETE_PAKETE.optionalErlaubt), r.optional.join(","));
  check("2h Kein verbotenes Paket wird gezogen",
    P.ERWARTETE_PAKETE.verboten.every((k) => !r.all.includes(k)), r.all.join(","));
  check("2i Die Referenz auf das persönliche Paket bleibt folgenlos (kein solches Paket existiert)",
    !PACKAGE_DEFINITIONS.some((pk) => pk.key === "profil-" + P.PROFIL_ID));
  // Gegenproben aus dem Plan — dieselbe Logik, andere Profile.
  check("2j Ein Bundestagsmandat mit bundesland='Berlin' zieht KEIN Landespaket",
    !PP.resolveProfilePackages({ ...A, parliamentType: "Bundestag", politische_ebene: "bundestag", politicalLevel: "Bund" })
      .all.includes("berlin-basis"));
  check("2k Ein Brandenburger Testprofil zieht Brandenburg statt Berlin",
    PP.resolveProfilePackages(P.GEGENPROBE_PROFILE.brandenburg).required.includes("brandenburg-basis")
    && !PP.resolveProfilePackages(P.GEGENPROBE_PROFILE.brandenburg).required.includes("berlin-basis"));
  check("2l Deaktiviert/gelöscht/leer sind nicht aktivierungsberechtigt",
    !PP.isActivationEligible(A_DEAKTIVIERT) && !PP.isActivationEligible(A_GELOESCHT)
    && !PP.isActivationEligible(P.GEGENPROBE_PROFILE.leer));
}

// ══ 3) Gate: Freigabe UND Mandat — eines allein wirkt nicht (14A/V-2) ═════════════════════════
{
  const nurFlag = SM.wirksameLandesmodule({ profiles: [P_BUND], env: FLAG_BE });
  check("3a Flag ohne Landtagsmandat: freigegeben, aber NICHT wirksam",
    nurFlag.freigegeben.has("berlin") && !nurFlag.mitMandat.has("berlin") && nurFlag.wirksam.size === 0);
  const nurMandat = SM.wirksameLandesmodule({ profiles: [A], env: {} });
  check("3b Abnahmeprofil ohne Flag: bemandatiert, aber NICHT wirksam",
    nurMandat.mitMandat.has("berlin") && !nurMandat.freigegeben.has("berlin") && nurMandat.wirksam.size === 0);
  const beides = SM.wirksameLandesmodule({ profiles: [P_BUND, A], env: FLAG_BE });
  check("3c Flag + Abnahmeprofil: Berlin wirksam, Brandenburg nicht",
    beides.wirksam.has("berlin") && !beides.wirksam.has("brandenburg"));
  check("3d Das Abnahmeprofil berechtigt ausschliesslich Berlin",
    gleich([...SM.laenderMitBerechtigtemMandat([A])], ["berlin"]));
  const plBeides = plan({ profiles: [P_BUND, A], env: FLAG_BE });
  check("3e Erst mit beidem laufen die 2 Stufe-1-Wege",
    gleich(berlinAktivIm(plBeides), B.stufenWege(1).slice().sort()), berlinAktivIm(plBeides).join(","));
  check("3f Kein Weg der Stufe 2 läuft dabei mit",
    B.stufenWege(2).every((id) => !berlinAktivIm(plBeides).includes(id)));
  check("3g Kein Brandenburger Weg läuft",
    plBeides.aktiv.every((a) => !a.id.startsWith("rp-bb-")));
  check("3h Die Bundesversorgung ist unverändert",
    gleich(bundAktivIm(plBeides), bundAktivIm(plan({ profiles: [P_BUND], env: {} }))));
  check("3i Der Sperrgrund benennt, WELCHE der beiden Bedingungen fehlt",
    /kein berechtigtes Landesmandat/.test(
      (plan({ profiles: [P_BUND], env: FLAG_BE }).ausgeschlossen.find((a) => a.id === B.stufenWege(1)[0]) || {}).grund || ""));
}

// ══ 4) ZWEI unabhängige datenbankseitige Not-Aus-Schalter ════════════════════════════════════
// Kernaussage dieses Sprints: der Flag-Rückweg (Ebene 0) ist aus einer Cloud-Sitzung nicht
// verfügbar — die beiden DB-seitigen Rückwege sind es. Jeder für sich stoppt JEDEN Berliner
// Abruf, auch bei gesetztem Flag. Das wird hier nicht behauptet, sondern gezeigt.
{
  const scharf = plan({ profiles: [P_BUND, A], env: FLAG_BE });
  check("4a Ausgangslage: 2 Berliner Wege laufen", berlinAktivIm(scharf).length === 2);

  const nachProfilRueckweg = plan({ profiles: [P_BUND, A_DEAKTIVIERT], env: FLAG_BE });
  check("4b NOT-AUS 1 (Profil deaktivieren, Rollback Stufe 0): 0 Berliner Wege — trotz gesetztem Flag",
    berlinAktivIm(nachProfilRueckweg).length === 0);
  check("4c NOT-AUS 1 lässt die Bundesversorgung unangetastet",
    gleich(bundAktivIm(nachProfilRueckweg), bundAktivIm(scharf)));
  check("4d NOT-AUS 1 wirkt auch über geloescht_at (Rollback Stufe 1)",
    berlinAktivIm(plan({ profiles: [P_BUND, A_GELOESCHT], env: FLAG_BE })).length === 0);

  const nachWegRueckweg = plan({ profiles: [P_BUND, A], env: FLAG_BE, wegeScharf: false });
  check("4e NOT-AUS 2 (Wege auf needs_review/manual, S1-RB): 0 Berliner Wege — trotz Flag und Profil",
    berlinAktivIm(nachWegRueckweg).length === 0);
  check("4f NOT-AUS 2 lässt die Bundesversorgung unangetastet",
    gleich(bundAktivIm(nachWegRueckweg), bundAktivIm(scharf)));
  check("4g Beide Not-Aus zusammen: ebenfalls 0 (keine gegenseitige Aufhebung)",
    berlinAktivIm(plan({ profiles: [P_BUND, A_DEAKTIVIERT], env: FLAG_BE, wegeScharf: false })).length === 0);
  check("4h Der Rückweg des Profils ist im Plan als 3 Stufen beschrieben und beginnt mit Deaktivieren",
    P.RUECKWEG.length === 3 && P.RUECKWEG[0].stufe === 0 && /aktiv = false/.test(P.RUECKWEG[0].mittel));
  check("4i Nur Stufe 2 ist ausdrücklich nicht sofort ausführbar",
    P.RUECKWEG.filter((r) => r.sofort === false).length === 1 && P.RUECKWEG[2].sofort === false);
}

// ══ 5) Bedingungsauswertung: jede Art trifft ihren Fall ══════════════════════════════════════
{
  const schritte = P.profilschritte();
  check("5a Es gibt genau 4 Schritte: 1 Anlegen, 3 Rückwege",
    schritte.length === 4 && schritte.filter((s) => s.art === "anlegen").length === 1
    && schritte.filter((s) => s.art === "rollback").length === 3);
  check("5b Jeder Schritt hat Datei, Vor- und Nachbedingungen",
    schritte.every((s) => s.datei && s.vorbedingungen.length > 0 && s.nachbedingungen.length > 0));

  const leer = { profiles: [], mandate_profiles: [], abhaengige: {} };
  const angelegt = {
    profiles: [{ id: P.PROFIL_ID, name: P.PRODUCTION_ZEILEN.profiles.name }],
    mandate_profiles: [{ user_id: P.PROFIL_ID, ...P.PRODUCTION_ZEILEN.mandate_profiles, geloescht_at: null }],
    abhaengige: {}
  };
  const anlegen = schritte[0];
  check("5c Vor dem Anlegen sind alle Vorbedingungen erfüllt (leere Datenbank)",
    anlegen.vorbedingungen.every((b) => P.pruefeProfilBedingung(b, leer).ok));
  check("5d Nach dem Anlegen sind alle Nachbedingungen erfüllt",
    anlegen.nachbedingungen.every((b) => P.pruefeProfilBedingung(b, angelegt).ok));
  check("5e Auf leerer Datenbank wären die Nachbedingungen NICHT erfüllt (kein falsches Grün)",
    anlegen.nachbedingungen.some((b) => !P.pruefeProfilBedingung(b, leer).ok));

  const fremd = { ...leer, profiles: [{ id: P.PROFIL_ID, name: "Jemand anderes" }] };
  check("5f Ein fremder Datensatz unter der Id verletzt die Vorbedingung",
    anlegen.vorbedingungen.some((b) => !P.pruefeProfilBedingung(b, fremd).ok));
  const fremdesLand = { ...leer, mandate_profiles: [{ user_id: "x", politische_ebene: "landtag", bundesland: "Brandenburg", aktiv: true }] };
  check("5g Ein fremdes (Brandenburger) Landtagsmandat verletzt die Vorbedingung",
    anlegen.vorbedingungen.some((b) => !P.pruefeProfilBedingung(b, fremdesLand).ok));

  // BEFUND P-1 als ausführbare Prüfung: eine Rohzeile ohne Identitätsfelder wird von einer
  // reinen Zeilenzählung mitgezählt, trägt aber 0 zur Referenzzählung bei.
  const rohzeile = {
    profiles: [],
    mandate_profiles: [{ user_id: P.PROFIL_ID, politische_ebene: "landtag", bundesland: "Berlin", aktiv: true, geloescht_at: null }],
    abhaengige: {}
  };
  const bedBerechtigt = anlegen.nachbedingungen.find((b) => b.art === "berechtigtes_berliner_mandat");
  check("5h BEFUND P-1: eine Rohzeile ohne Identitätsfelder gilt NICHT als berechtigtes Mandat",
    P.pruefeProfilBedingung(bedBerechtigt, rohzeile).ist === 0);
  check("5i BEFUND P-1: dieselbe Rohzeile wäre von einer reinen Zeilenzählung mitgezählt worden",
    rohzeile.mandate_profiles.filter((r) => r.politische_ebene === "landtag" && r.aktiv).length === 1);
  check("5j Die geschärfte V3-Abfrage steht im Plan und prüft mehr als die Ebene",
    /hat_namen/.test(P.V3_PRUEFABFRAGE) && /fachpolitische_schwerpunkte/.test(P.V3_PRUEFABFRAGE));

  const rb2 = schritte[3];
  const mitDaten = {
    profiles: angelegt.profiles,
    mandate_profiles: [{ ...angelegt.mandate_profiles[0], aktiv: false, geloescht_at: "2026-07-26T20:00:00Z" }],
    abhaengige: { briefings: 1 }
  };
  check("5k Stufe 2 ist mit anhängenden Daten nicht ausführbar (CASCADE-Schutz)",
    rb2.vorbedingungen.some((b) => !P.pruefeProfilBedingung(b, mitDaten).ok));
  check("5l Stufe 2 ist ohne anhängende Daten ausführbar",
    rb2.vorbedingungen.every((b) => P.pruefeProfilBedingung(b, { ...mitDaten, abhaengige: {} }).ok));
  check("5m Stufe 2 verlangt Stufe 0 UND Stufe 1 vorher",
    rb2.vorbedingungen.filter((b) => b.art === "mandatszeile" && ["inaktiv", "geloescht"].includes(b.modus)).length === 2);
  check("5n Die CASCADE-Liste nennt die gemessenen 14 abhängigen Tabellen",
    P.ABHAENGIGE_TABELLEN.length === 14 && P.ABHAENGIGE_TABELLEN.includes("briefings")
    && !P.ABHAENGIGE_TABELLEN.includes("mandate_profiles"));
  check("5o Eine unbekannte Bedingungsart wird abgelehnt, nicht stillschweigend als ok gewertet",
    (() => { try { P.pruefeProfilBedingung({ art: "erfunden", erlaubt: [0] }, leer); return false; } catch (_) { return true; } })());
}

// ══ 6) Die 4 committeten SQL-Dateien ═════════════════════════════════════════════════════════
{
  const erzeugt = generator.dateien();
  const namen = [P.DATEI_ANLEGEN, P.DATEI_RB0, P.DATEI_RB1, P.DATEI_RB2];
  check("6a Der Generator erzeugt genau die 4 deklarierten Dateien",
    gleich(Object.keys(erzeugt).sort(), namen.slice().sort()));
  check("6b Jede erzeugte Datei ist byte-genau die committete Datei",
    namen.every((n) => lies(n) === erzeugt[n]));
  check("6c Der Generator ist deterministisch (2. Lauf byte-identisch)",
    JSON.stringify(generator.dateien()) === JSON.stringify(erzeugt));

  const alleAusfuehrbar = namen.map((n) => ausfuehrbar(lies(n))).join("\n");
  check("6d Kein ausführbares Statement nennt einen Brandenburg-Bezeichner",
    !/rp-bb-|brandenburg-basis|die-linke-brandenburg/i.test(alleAusfuehrbar));
  check("6e Kein ausführbares Statement berührt Abrufwege, Pakete oder Zuordnungen",
    !/retrieval_paths|source_packages|package_paths|source_crawl_telemetry/i.test(alleAusfuehrbar));
  check("6f Kein DDL, kein drop/truncate/alter/create",
    !/\b(drop|truncate|alter|create)\b/i.test(alleAusfuehrbar));
  check("6g Keine Datei setzt ein Flag oder nennt HELMUT_LANDESMODULE ausführbar",
    !/HELMUT_LANDESMODULE/.test(alleAusfuehrbar));
  check("6h Jede Datei ist EINE Transaktion (genau ein begin und ein commit)",
    namen.every((n) => (ausfuehrbar(lies(n)).match(/^begin;$/gm) || []).length === 1
      && (ausfuehrbar(lies(n)).match(/^commit;$/gm) || []).length === 1));
  check("6i Jede Bedingung ist ein fail-closed Riegel (raise exception)",
    namen.every((n) => {
      const s = P.profilschritte().find((x) => x.datei === n);
      const anzahl = (ausfuehrbar(lies(n)).match(/raise exception/g) || []).length;
      return anzahl === s.vorbedingungen.length + s.nachbedingungen.length;
    }));
  check("6j Das Anlegen ist idempotent formuliert (on conflict do nothing, kein Überschreiben)",
    /on conflict \(id\) do nothing/.test(lies(P.DATEI_ANLEGEN))
    && /on conflict \(user_id\) do nothing/.test(lies(P.DATEI_ANLEGEN))
    && !/do update/.test(ausfuehrbar(lies(P.DATEI_ANLEGEN))));
  check("6k Nur die Stufe-2-Datei enthält ein delete",
    !/\bdelete\b/i.test(ausfuehrbar(lies(P.DATEI_ANLEGEN)) + ausfuehrbar(lies(P.DATEI_RB0)) + ausfuehrbar(lies(P.DATEI_RB1)))
    && /\bdelete\b/i.test(ausfuehrbar(lies(P.DATEI_RB2))));
  check("6l Jede Datei nennt ihre Einordnung in die Reihenfolge des Runbooks",
    namen.every((n) => /berlin-aktivierung\.md §9/.test(lies(n))));
  check("6m Die Dateien nennen ausdrücklich, dass in 14B nichts ausgeführt wurde",
    namen.every((n) => /NICHT ausgeführt/.test(lies(n))));
  check("6n Die Abnahme-Id erscheint in jeder Datei und keine andere Mandats-Id",
    namen.every((n) => {
      const s = ausfuehrbar(lies(n));
      return s.includes(P.PROFIL_ID) && !/'(cem|t-be|t-bb|t-bund)[^']*'/i.test(s);
    }));
}

// ══ 7) Last: was das zusätzliche Mandat kostet — gemessen, nicht behauptet ════════════════════
{
  // Jedes AKTIVE Mandat erzeugt zur Laufzeit eigene Profilquellen (scheduler.getSourcesForProfile):
  // 1 Personensuche + die Mandatsquellen. Diese Quellen sind NICHT geteilt (eigene URLs) und
  // laufen daher je Crawl zusätzlich — unabhängig vom Landesmodul-Flag.
  const mandatsquellen = scheduler.mandateNewsSources(A);
  const codeZeile = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "scheduler.js"), "utf8");
  check("7a Der Code baut je Profil 1 Personenquelle + die Mandatsquellen",
    codeZeile.includes("[personNewsSource(profile), ...mandateNewsSources(profile)]"));
  check("7b Die Zahl der zusätzlichen Mandatsquellen ist klein und benannt",
    mandatsquellen.length >= 1 && mandatsquellen.length <= 6, `gemessen: ${mandatsquellen.length}`);
  console.log(`      -> gemessen: ${mandatsquellen.length} Mandatsquellen + 1 Personenquelle = ${mandatsquellen.length + 1} zusätzliche Abrufe je Crawl-Lauf`);
  check("7c Alle zusätzlichen Profilquellen laufen über Google News (verstärkt Befund B1)",
    mandatsquellen.every((s) => /news\.google\.com/.test(String(s.rssUrl || (s.rssUrls || [])[0] || ""))));
  check("7d Keine der Profilquellen ist ein Landesmodul-Weg (sie hängen am Profil, nicht am Paket)",
    mandatsquellen.every((s) => !SM.landesmodulQuelleGesperrt(s, new Set())
      || !/^rp-(be|bb)-/.test(String(s.id))));
  check("7e Das Abnahmeprofil ist ein zusätzlicher Cron-Mandant (sequenzielle Schleife)",
    typeof tenantContext.listActiveTenantIds === "function" && tenantContext.isActiveMandate({ id: P.PROFIL_ID, aktiv: true }) === true);
  check("7f Nach Rückweg Stufe 0 zählt es nicht mehr als Cron-Mandant",
    tenantContext.isActiveMandate({ id: P.PROFIL_ID, aktiv: false }) === false
    && tenantContext.isActiveMandate({ id: P.PROFIL_ID, aktiv: true, geloescht_at: "2026-07-26T20:00:00Z" }) === false);
  // Die Crons verarbeiten Mandate SEQUENZIELL mit hartem Zeitbudget. Ein zusätzliches Mandat
  // teilt sich dasselbe Budget — die Reihenfolge ist deshalb kein Detail, sondern ein
  // Lastthema (§20.6 des Runbooks). Seit OP-25 (2026-07-29) ist die Position NICHT mehr
  // alphabetisch fest, sondern folgt dem ältesten letzten Versuch (`cron-fairness.js`):
  // ein zusätzliches Mandat verschiebt niemanden dauerhaft nach hinten, es senkt die
  // Frequenz aller Mandate gleichmäßig (Obergrenze ceil(n/k) reguläre Läufe).
  const serverText = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const fairnessText = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "cron-fairness.js"), "utf8");
  check("7g Die Cron-Schleife ist sequenziell und zeitbudgetiert",
    // Die Signatur traegt seit R-6 zusaetzlich eine optionale Laufkennung (reine
    // Beobachtbarkeit) — das Zeitbudget selbst ist unveraendert.
    /runCronForTenants\(cronName, perTenant, \{ deadlineMs = \d+(, runId = null)? \}/.test(serverText)
    && /cronFairness\.runTenantsFairly\(/.test(serverText)
    && /reason: "zeitbudget"/.test(fairnessText)
    && /for \(const kandidat of planung\.plan\)/.test(fairnessText));
  check("7h Ein vom Zeitbudget abgeschnittenes Mandat erzeugt einen systemError (nicht still)",
    /Zeitbudget erschoepft/.test(serverText) && /recordSystemError/.test(serverText));
  check("7i Die Mandatsliste ist deterministisch sortiert (reproduzierbare Eingabemenge)",
    /return ids\.sort\(\);/.test(fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "tenant-context.js"), "utf8")));
  check("7j Die Verarbeitungsreihenfolge ist NICHT mehr alphabetisch, sondern fair rotiert",
    /planTenantOrder/.test(fairnessText) && /letzterVersuchAt/.test(fairnessText)
    && /a\.politicianId < b\.politicianId/.test(fairnessText));
}

// ══ 8) Mandantenneutralität (CLAUDE.md §4.2) ═════════════════════════════════════════════════
{
  // Die Abnahme-Id darf ausschliesslich im Profilplan (Daten) und im generierten SQL stehen —
  // niemals in aktiver Mandanten-, Quellen- oder Auswahllogik.
  const verbotene = [
    "lib/helmut/scheduler.js", "lib/helmut/storage.js", "lib/helmut/tenant-context.js",
    "lib/helmut/sources.js", "lib/helmut/quellenarchitektur/source-mode.js",
    "lib/helmut/quellenarchitektur/profile-packages.js", "server.js", "helmut-flags.json"
  ];
  const treffer = verbotene.filter((rel) => {
    const p = path.join(__dirname, "..", rel);
    return fs.existsSync(p) && fs.readFileSync(p, "utf8").includes(P.PROFIL_ID);
  });
  check("8a Die Abnahme-Id steht in keiner aktiven Mandanten-/Quellenlogik", treffer.length === 0, treffer.join(","));
  check("8b Der Profilplan legt selbst nichts an (reine Daten + reine Helfer)",
    !/fetch\(|require\(["'](?!\.)/.test(fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", "seeds", "berlin-profilplan.js"), "utf8")));
  check("8c helmut-flags.json setzt weiterhin KEIN Landesmodul (Production unverändert)",
    !JSON.parse(fs.readFileSync(path.join(__dirname, "..", "helmut-flags.json"), "utf8")).HELMUT_LANDESMODULE);
  check("8d Das Runbook beschreibt den Profilschritt mit Datei statt nur mit Prosa",
    (() => {
      const t = fs.readFileSync(path.join(__dirname, "..", "docs", "betrieb", "berlin-aktivierung.md"), "utf8");
      return t.includes(P.DATEI_ANLEGEN) && t.includes(P.DATEI_RB0);
    })());
}

console.log(`\n== Ergebnis: ${passed} PASS, ${failed} FAIL ==`);
if (failed === 0) {
  console.log("Das Abnahmeprofil ist ausführbar vorbereitet: 4 Dateien, fail-closed, idempotent, drei Rückwege.");
  console.log("Es wurde NICHTS angelegt, NICHTS aktiviert und KEIN Flag gesetzt.");
}
process.exit(failed > 0 ? 1 : 0);
