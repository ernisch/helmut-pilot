"use strict";

// Helmut — Phase-1-Punkt 14: AKTIVIERUNGSREIFE BERLIN, ausführbar geprüft.
// =============================================================================================
// Reiner Offline-Test: kein Netz (ausser 127.0.0.1 für den Fehler-Isolationsfall), keine KI,
// kein DB-Zugriff, kein Datei-Schreiben ausserhalb von os.tmpdir().
//
// Der Test beantwortet ausführbar:
//   1  Gate       — Landesmodule sind ohne ausdrückliche Freigabe gesperrt (Default LEER)
//   2  Auswahl    — welches Profil bekommt welches Paket (relationaler Pfad + Fallback)
//   3  Sperren    — prepared/manual/paused/broken/dev_only greifen einzeln und in Kombination
//   4  Brandenburg— bleibt unter jeder geprüften Konstellation inaktiv
//   5  Bund       — bleibt vollständig erhalten und wird nicht verdrängt
//   6  Wege       — URL/Domain/Query/Parser/Ebene/Geografie je Berliner Weg
//   7  Kette      — Rohdokument -> Dedup -> Klassifikation (Ebene land, Geografie Berlin)
//   8  Last       — Abrufe je Lauf/Tag aus dem Crawler abgeleitet, nicht behauptet
//   9  Rollback   — das committete SQL wird ausgeführt und wieder zurückgenommen
//  10  Nicht-     — kein Brandenburg-Bezeichner in ausführbarem SQL, keine Production-
//      Berührung    Konfiguration verändert, keine aktive Bundesquelle angefasst

const fs = require("fs");
const path = require("path");
const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const PP = require("../lib/helmut/quellenarchitektur/profile-packages");
const B = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { pardokDispatch } = require("../lib/helmut/quellenarchitektur/pardok-dispatch");
const { planDedupWrites } = require("../lib/helmut/quellenarchitektur/dedup-global");
const C = require("../lib/helmut/quellenarchitektur/classification");
const flags = require("../lib/helmut/flags");
const crawler = require("../lib/helmut/crawler");
const scheduler = require("../lib/helmut/scheduler");
const { v1Sources } = require("../lib/helmut/sources");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Fixtures: produktionsförmiger Katalog ─────────────────────────────────────────────────────
// Gebaut aus dem ECHTEN Landesmodul-Abbild (seeds/landesmodule-quellen.js) plus neutralen
// Bund-Platzhaltern. Enthält KEINE Production-Daten und keine reale Mandantenidentität.
const landesSeed = buildLandesmodulSeed();
const BUND_WEGE = [
  { id: "rp-kern-1", legacy_source_id: "kern-1", name: "Kernquelle 1", method: "rss", url: "https://kern1.example/rss", parser: "rss-regex", status: "healthy", activation_mode: "always_on", priority: 100 },
  { id: "rp-kern-2", legacy_source_id: "kern-2", name: "Kernquelle 2", method: "rss", url: "https://kern2.example/rss", parser: "rss-regex", status: "healthy", activation_mode: "always_on", priority: 99 },
  { id: "rp-bund-a", legacy_source_id: "bund-a", name: "Bundesweg A", method: "rss", url: "https://bunda.example/rss", parser: "rss-regex", status: "healthy", activation_mode: "auto", priority: 90 },
  { id: "rp-bund-b", legacy_source_id: "bund-b", name: "Bundesweg B", method: "googlenews_search", url: "https://news.google.com/rss/search?q=bund", parser: "googlenews-batchexecute", status: "healthy", activation_mode: "auto", priority: 89 },
  { id: "rp-bund-defekt", legacy_source_id: "bund-defekt", name: "Bundesweg defekt", method: "rss", url: "https://kaputt.example/rss", parser: "rss-regex", status: "broken", activation_mode: "auto", priority: 88, last_error: "403 bot protection" },
  { id: "rp-bund-test", legacy_source_id: "bund-test", name: "Testweg", method: "rss", url: "https://test.example/rss", parser: "rss-regex", status: "healthy", activation_mode: "dev_only", priority: 10 }
];
const BUND_LINKS = [
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-kern-1" },
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-kern-2" },
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-bund-a" },
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-bund-b" },
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-bund-defekt" },
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-bund-test" }
];

// Landesmodul-Wege im gemessenen PRODUCTION-Ist (2026-07-26): needs_review + manual,
// die 3 Pilotwege noch am Pflicht-Basispaket (Befund A-3).
const IST_LINKS = landesSeed.packagePaths.map((pp) => (
  B.UMHAENGUNG.wege.includes(pp.retrieval_path_id) && pp.package_id === B.PARTEIPAKET_ID
    ? { package_id: B.BASISPAKET_ID, retrieval_path_id: pp.retrieval_path_id }
    : { ...pp }
));

function katalog({ berlinAktiv = false, neutralisiert = false, ueberschreibungen = {} } = {}) {
  const aktivSet = new Set(B.AKTIVIERUNGSSET);
  const retrievalPaths = [
    ...BUND_WEGE.map((p) => ({ ...p })),
    ...landesSeed.retrievalPaths.map((p) => ({
      id: p.id, legacy_source_id: p.legacy_source_id, name: p.name,
      method: p.method === "opendata_xml" || p.method === "api_xml" ? "structured_download" : p.method,
      url: p.url, query: p.query, parser: p.parser, priority: p.priority, max_items: p.max_items,
      is_critical: p.is_critical,
      status: berlinAktiv && aktivSet.has(p.id) ? "healthy" : "needs_review",
      activation_mode: berlinAktiv && aktivSet.has(p.id) ? "auto" : "manual",
      ...(ueberschreibungen[p.id] || {})
    }))
  ];
  const packages = PACKAGE_DEFINITIONS.map((pk) => ({
    ...pk,
    status: pk.key === B.BASISPAKET_KEY && berlinAktiv ? "active" : pk.status
  }));
  const packagePaths = [...BUND_LINKS, ...(neutralisiert ? landesSeed.packagePaths.map((pp) => ({ ...pp })) : IST_LINKS.map((pp) => ({ ...pp })))];
  return { retrievalPaths, packages, packagePaths };
}

const P_BUND = { id: "t-bund", aktiv: true, politische_ebene: "bundestag", name: "Testprofil Bund", partei: "SPD", ausschuesse: ["Ausschuss für Arbeit und Soziales"] };
const P_BERLIN_CDU = { id: "t-be-cdu", aktiv: true, politische_ebene: "landtag", bundesland: "Berlin", name: "Testprofil Berlin CDU", partei: "CDU", ausschuesse: ["Innenausschuss"] };
const P_BERLIN_LINKE = { id: "t-be-linke", aktiv: true, politische_ebene: "landtag", bundesland: "Berlin", name: "Testprofil Berlin Linke", partei: "Die Linke" };
const P_BRANDENBURG = { id: "t-bb", aktiv: true, politische_ebene: "landtag", bundesland: "Brandenburg", name: "Testprofil Brandenburg", partei: "SPD" };

const plan = (opts = {}) => SM.buildRelationalCrawlPlan({
  ...katalog(opts),
  profiles: opts.profiles || [],
  legacySources: [],
  env: opts.env || {}
});
const aktivIds = (p) => p.aktiv.map((a) => a.id).sort();
const grundVon = (p, id) => (p.ausgeschlossen.find((a) => a.id === id) || {}).grund || (p.defekt.find((d) => d.id === id) || {}).grund || null;

// ══ 1) Gate: Default gesperrt, Freigabe je Land, fail-closed ══════════════════════════════════
check("1a Default: kein Landesmodul freigegeben (leeres env)", SM.freigegebeneLandesmodule({}).size === 0);
check("1b Freigabe 'berlin' wirkt nur für Berlin",
  gleich([...SM.freigegebeneLandesmodule({ HELMUT_LANDESMODULE: "berlin" })], ["berlin"]));
check("1c Unbekannter Wert wirkt nicht (fail-closed)", SM.freigegebeneLandesmodule({ HELMUT_LANDESMODULE: "bayern" }).size === 0);
check("1d Es gibt KEIN Sammel-Schlüsselwort ('alle'/'*' sind wirkungslos)",
  SM.freigegebeneLandesmodule({ HELMUT_LANDESMODULE: "alle" }).size === 0
  && SM.freigegebeneLandesmodule({ HELMUT_LANDESMODULE: "*" }).size === 0);
check("1e Groß-/Kleinschreibung und Trenner tolerant, Semantik unverändert",
  gleich([...SM.freigegebeneLandesmodule({ HELMUT_LANDESMODULE: " Berlin ; brandenburg " })].sort(), ["berlin", "brandenburg"]));
check("1f Eingecheckte Flags-Datei setzt KEIN Landesmodul (Production bleibt gesperrt)",
  !flags.loadFileFlags(path.join(__dirname, "..", "helmut-flags.json")).HELMUT_LANDESMODULE);
check("1g HELMUT_LANDESMODULE steht auf der Datei-Allowlist (Freigabe als reviewbarer Diff möglich)",
  flags.FILE_FLAG_ALLOWLIST.includes("HELMUT_LANDESMODULE"));
check("1h Landeserkennung: Id-Präfix, legacy-Präfix und Paketbindung greifen je einzeln",
  gleich(SM.landesmoduleOf({ id: "rp-be-x" }, []), ["berlin"])
  && gleich(SM.landesmoduleOf({ id: "rp-x", legacy_source_id: "bb-y" }, []), ["brandenburg"])
  && gleich(SM.landesmoduleOf({ id: "rp-x" }, ["die-linke-berlin"]), ["berlin"])
  && gleich(SM.landesmoduleOf({ id: "rp-x" }, ["bund-basis"]), []));
check("1i Mehrländriger Weg wird beiden Ländern zugeordnet",
  gleich(SM.landesmoduleOf({ id: "rp-rbb24-politik" }, ["berlin-basis", "brandenburg-basis"]), ["berlin", "brandenburg"]));
check("1j isLandesmodulPath bleibt rückwärtskompatibel",
  SM.isLandesmodulPath({ id: "rp-be-plenum" }, []) === true && SM.isLandesmodulPath({ id: "rp-kern-1" }, ["bund-basis"]) === false);

// ══ 2) Auswahlpfad relational: Profil -> Paket ════════════════════════════════════════════════
const rBerlinCdu = PP.resolveProfilePackages(P_BERLIN_CDU);
const rBerlinLinke = PP.resolveProfilePackages(P_BERLIN_LINKE);
const rBund = PP.resolveProfilePackages(P_BUND);
const rBrandenburg = PP.resolveProfilePackages(P_BRANDENBURG);
check("2a Berliner Landtagsprofil erhält bund-basis UND berlin-basis als Pflichtpakete",
  gleich(rBerlinCdu.required.sort(), ["berlin-basis", "bund-basis"]));
check("2b Berliner Linke-Profil erhält zusätzlich die-linke-berlin", rBerlinLinke.optional.includes("die-linke-berlin"));
check("2c Berliner CDU-Profil erhält NICHT die-linke-berlin", !rBerlinCdu.all.includes("die-linke-berlin"));
check("2d Bundestagsprofil erhält KEIN Landespaket",
  !rBund.all.some((k) => ["berlin-basis", "brandenburg-basis", "die-linke-berlin", "die-linke-brandenburg"].includes(k)));
check("2e Brandenburg-Profil erhält KEIN Berliner Paket",
  !rBrandenburg.all.some((k) => k.includes("berlin")) && rBrandenburg.required.includes("brandenburg-basis"));
check("2f Berlin-Profil fordert KEIN Brandenburg-Paket an",
  !rBerlinCdu.all.some((k) => k.includes("brandenburg")) && !rBerlinLinke.all.some((k) => k.includes("brandenburg")));
check("2g Berlin-Profil erhält kein fremdes Regionalpaket", !rBerlinCdu.all.includes("regional-niedersachsen"));

// ══ 3) Sperren: heutiger Zustand — Berlin läuft unter KEINER Konstellation ════════════════════
const pHeuteOhne = plan({ profiles: [P_BUND] });
const pHeuteBerlin = plan({ profiles: [P_BUND, P_BERLIN_CDU] });
// Berliner Wege = alles, was an einem Berliner Paket hängt (inkl. des mehrländrigen rbb24).
const berlinIds = B.berlinWegeAusSeed().map((w) => w.id);
const bbIds = landesSeed.retrievalPaths.map((p) => p.id).filter((id) => id.startsWith("rp-bb-"));
check("3a Heute (kein Flag): 0 Berliner Wege im Plan, auch mit Berliner Profil",
  aktivIds(pHeuteBerlin).filter((id) => berlinIds.includes(id)).length === 0);
check("3b Heute: Ausschlussgrund ist das Landesmodul-Gate, nicht Zufall",
  /landesmodul-gesperrt/.test(grundVon(pHeuteBerlin, "rp-be-landesparlament") || ""));
check("3c Heute: der Bundplan ist mit und ohne Berliner Profil identisch (keine Verdrängung)",
  gleich(aktivIds(pHeuteOhne), aktivIds(pHeuteBerlin)));

// Flag gesetzt, aber Paket weiterhin 'prepared' -> keine Aktivierung (Regel: prepared ≠ aktiv)
const pFlagOhnePaket = plan({ profiles: [P_BUND, P_BERLIN_CDU], env: { HELMUT_LANDESMODULE: "berlin" } });
check("3d Paket 'prepared' + Flag gesetzt: weiterhin 0 Berliner Wege",
  aktivIds(pFlagOhnePaket).filter((id) => berlinIds.includes(id)).length === 0);
check("3e Grund ist jetzt die manuelle Sperre bzw. das fehlende aktive Paket, NICHT mehr das Gate",
  !/landesmodul-gesperrt/.test(grundVon(pFlagOhnePaket, "rp-be-landesparlament") || ""));
check("3f 'prepared' erscheint als requested_unsupplied, nicht als aktiv",
  (pFlagOhnePaket.aktivierung.paketStatus.find((p) => p.key === B.BASISPAKET_KEY) || {}).activation === "requested_unsupplied");

// Paket aktiv, Wege aber weiterhin manual -> keine Ausführung (die fehlende Sperre von Punkt 14)
const pPaketOhneWege = plan({ berlinAktiv: false, neutralisiert: true, profiles: [P_BUND, P_BERLIN_CDU], env: { HELMUT_LANDESMODULE: "berlin" } });
const pPaketAktivManual = SM.buildRelationalCrawlPlan({
  ...(() => { const k = katalog({ neutralisiert: true }); k.packages = k.packages.map((p) => (p.key === B.BASISPAKET_KEY ? { ...p, status: "active" } : p)); return k; })(),
  profiles: [P_BUND, P_BERLIN_CDU], legacySources: [], env: { HELMUT_LANDESMODULE: "berlin" }
});
check("3g Paket AKTIV + alle Wege 'manual': 0 Berliner Wege laufen (activation_mode ist eine echte Sperre)",
  aktivIds(pPaketAktivManual).filter((id) => berlinIds.includes(id)).length === 0);
check("3h Grund ist ausdrücklich 'manuell-gesperrt'",
  grundVon(pPaketAktivManual, "rp-be-landesparlament") === "manuell-gesperrt (activation_mode=manual)");
void pPaketOhneWege;

// Vollständige Aktivierung (Flag + Paket active + 6 Wege auto + neutralisiert)
const pAktiv = plan({ berlinAktiv: true, neutralisiert: true, profiles: [P_BUND, P_BERLIN_CDU], env: { HELMUT_LANDESMODULE: "berlin" } });
const berlinAktivIds = aktivIds(pAktiv).filter((id) => berlinIds.includes(id));
check("3i Vollständige Aktivierung: genau die 6 geplanten Wege laufen",
  gleich(berlinAktivIds, [...B.AKTIVIERUNGSSET].sort()), berlinAktivIds.join(","));
check("3j rp-be-plenum läuft NICHT mit (PARDOK liefert strukturell 0 Items)",
  !berlinAktivIds.includes("rp-be-plenum") && grundVon(pAktiv, "rp-be-plenum") === "manuell-gesperrt (activation_mode=manual)");
check("3k Die 3 Partei-/Fraktions-/Personenwege laufen NICHT mit",
  B.UMHAENGUNG.wege.every((id) => !berlinAktivIds.includes(id)));
check("3l Aktiver Weg in einem NICHT aktiven Paket läuft nicht (Parteipaket bleibt prepared)",
  (() => {
    const k = katalog({ berlinAktiv: true, neutralisiert: true });
    k.retrievalPaths = k.retrievalPaths.map((p) => (p.id === "rp-be-partei_pilot" ? { ...p, status: "healthy", activation_mode: "auto" } : p));
    k.packages = k.packages.map((p) => (p.key === B.BASISPAKET_KEY ? { ...p, status: "active" } : p));
    const pl = SM.buildRelationalCrawlPlan({ ...k, profiles: [P_BERLIN_LINKE], legacySources: [], env: { HELMUT_LANDESMODULE: "berlin" } });
    return !aktivIds(pl).includes("rp-be-partei_pilot") && /kein-aktives-paket/.test(grundVon(pl, "rp-be-partei_pilot") || "");
  })());
check("3m Ein 'paused' gesetzter Berliner Weg läuft auch bei voller Freigabe nicht",
  (() => {
    const pl = plan({ berlinAktiv: true, neutralisiert: true, profiles: [P_BERLIN_CDU], env: { HELMUT_LANDESMODULE: "berlin" }, ueberschreibungen: { "rp-be-landesparlament": { status: "paused", activation_mode: "auto" } } });
    return !aktivIds(pl).includes("rp-be-landesparlament") && grundVon(pl, "rp-be-landesparlament") === "nicht-reaktiviert (status=paused)";
  })());
check("3n Ein 'broken' gesetzter Berliner Weg steht im Plan als defekt, NICHT als ausführbar",
  (() => {
    const pl = plan({ berlinAktiv: true, neutralisiert: true, profiles: [P_BERLIN_CDU], env: { HELMUT_LANDESMODULE: "berlin" }, ueberschreibungen: { "rp-be-staatskanzlei": { status: "broken", activation_mode: "auto" } } });
    return !aktivIds(pl).includes("rp-be-staatskanzlei") && pl.defekt.some((d) => d.id === "rp-be-staatskanzlei");
  })());
check("3o dev_only läuft auch bei voller Freigabe nie",
  (() => {
    const pl = plan({ berlinAktiv: true, neutralisiert: true, profiles: [P_BERLIN_CDU], env: { HELMUT_LANDESMODULE: "berlin" }, ueberschreibungen: { "rp-be-landesfraktionen": { activation_mode: "dev_only" } } });
    return !aktivIds(pl).includes("rp-be-landesfraktionen") && grundVon(pl, "rp-be-landesfraktionen") === "testquelle-dev-only";
  })());
check("3p Ohne Berliner Profil bleibt Berlin auch bei Flag + aktivem Paket aus (Referenzzählung)",
  (() => {
    const pl = plan({ berlinAktiv: true, neutralisiert: true, profiles: [P_BUND], env: { HELMUT_LANDESMODULE: "berlin" } });
    return aktivIds(pl).filter((id) => berlinIds.includes(id)).length === 0;
  })());

// ══ 4) Brandenburg bleibt inaktiv — unter JEDER geprüften Konstellation ═══════════════════════
const bbFrei = [pHeuteBerlin, pFlagOhnePaket, pPaketAktivManual, pAktiv]
  .every((p) => aktivIds(p).every((id) => !bbIds.includes(id)));
check("4a Brandenburg-Wege laufen in keiner der vier geprüften Konstellationen", bbFrei);
check("4b Berlin-Freigabe lässt brandenburg-basis 'prepared' und inaktiv",
  (pAktiv.aktivierung.paketStatus.find((p) => p.key === "brandenburg-basis") || {}).activation === "inactive");
check("4c Auch ein Brandenburger Profil aktiviert unter Berlin-Freigabe keinen BB-Weg",
  (() => {
    const pl = plan({ berlinAktiv: true, neutralisiert: true, profiles: [P_BERLIN_CDU, P_BRANDENBURG], env: { HELMUT_LANDESMODULE: "berlin" } });
    return aktivIds(pl).every((id) => !bbIds.includes(id))
      && bbIds.every((id) => /landesmodul-gesperrt \(brandenburg/.test(grundVon(pl, id) || ""));
  })());
check("4d Der Plan weist den mehrländrigen Weg ausdrücklich aus (keine stille Nebenwirkung)",
  pAktiv.landesmodule.mehrlaendrig.length === 1
  && pAktiv.landesmodule.mehrlaendrig[0].id === "rp-rbb24-politik"
  && gleich(pAktiv.landesmodule.mehrlaendrig[0].fremdlaender, ["brandenburg"]));
check("4e Plan-Kennzahlen: freigegeben=[berlin], gesperrt=[brandenburg]",
  gleich(pAktiv.landesmodule.freigegeben, ["berlin"]) && gleich(pAktiv.landesmodule.gesperrt, ["brandenburg"]));
check("4f Kein anderes Bundesland hat ein Landesmodul (Niedersachsen ist kein Landesmodul)",
  gleich(SM.LANDESMODUL_LAENDER, ["berlin", "brandenburg"])
  && SM.landesmoduleOf({ id: "rp-ni-landtag" }, ["regional-niedersachsen"]).length === 0);

// ══ 5) Bund bleibt vollständig erhalten ══════════════════════════════════════════════════════
const bundIdsHeute = aktivIds(pHeuteOhne).filter((id) => id.startsWith("rp-kern") || id.startsWith("rp-bund"));
const bundIdsAktiv = aktivIds(pAktiv).filter((id) => id.startsWith("rp-kern") || id.startsWith("rp-bund"));
check("5a Kein Bundesweg fällt durch die Berlin-Aktivierung weg", gleich(bundIdsHeute, bundIdsAktiv), `${bundIdsHeute} vs ${bundIdsAktiv}`);
check("5b Der defekte Bundesweg bleibt defekt (unverändert), nicht still reaktiviert",
  pAktiv.defekt.some((d) => d.id === "rp-bund-defekt"));
check("5c Berlin wird ADDITIV ergänzt: exakt +6 Wege gegenüber heute",
  pAktiv.stats.aktiv === pHeuteOhne.stats.aktiv + B.AKTIVIERUNGSSET.length,
  `${pAktiv.stats.aktiv} vs ${pHeuteOhne.stats.aktiv}`);
check("5d Ohne aktives Profil laufen weiterhin nur die always_on-Kernwege",
  (() => {
    const pl = plan({ berlinAktiv: true, neutralisiert: true, profiles: [], env: { HELMUT_LANDESMODULE: "berlin" } });
    return gleich(aktivIds(pl), ["rp-kern-1", "rp-kern-2"]);
  })());

// ══ 5b) Fallback-Pfad (alter Katalog) ════════════════════════════════════════════════════════
// Der Fallback greift, wenn der relationale Plan leer/nicht ladbar ist. Er darf Berlin NICHT
// auf einem zweiten Weg hereinlassen.
(async () => {
  const legacyBerlinLandesebene = v1Sources.filter((s) => /^be-|^rp-be-|^rbb24/.test(String(s.id || "")));
  check("5e Der alte Katalog enthält KEINE Berliner Landesmodul-Quelle (Fallback kann Berlin nicht crawlen)",
    legacyBerlinLandesebene.length === 0, legacyBerlinLandesebene.map((s) => s.id).join(","));
  // Fallback-Auswahl mit dem ECHTEN Filter des Schedulers (HELMUT_SOURCE_MODE bleibt hier
  // per Test-Env aus -> es läuft garantiert der Fallback-Pfad, kein DB-Zugriff).
  const fuerBerlinProfil = await scheduler.getSourcesForProfile({ id: "t-be-cdu", fullName: "Testprofil Berlin", party: "CDU", state: "Berlin" });
  const berlinLandInFallback = fuerBerlinProfil.filter((s) => /^be-|^rbb24/.test(String(s.id || "")));
  check("5f Auch die Fallback-Auswahl für ein Berliner Profil enthält keine Berliner Landesquelle",
    berlinLandInFallback.length === 0, berlinLandInFallback.map((s) => s.id).join(","));
  check("5g Der Fallback liefert einen nicht-leeren Katalog (kein stiller Nullzustand)",
    fuerBerlinProfil.length > 0);
  check("5h Der Fallback nimmt keine vorbereitete Quelle mit (active === false bleibt draussen)",
    fuerBerlinProfil.every((s) => s.active !== false));
  weiter();
})().catch((e) => { check("5e-5h Fallback-Prüfung lief durch", false, e && e.message); weiter(); });

function weiter() {
// ══ 6) Wege technisch: URL/Domain/Query/Parser/Ebene/Geografie ═══════════════════════════════
const wege = B.berlinWegeAusSeed();
const aktivierte = wege.filter((w) => w.aktiviert);
check("6a Plan kennt genau 10 Berliner Wege (7 Basis + 3 Partei)", wege.length === 10);
check("6b Jeder Weg ist entweder im Aktivierungsset oder hat einen benannten Nicht-Grund",
  wege.every((w) => w.aktiviert || w.nichtAktiviertGrund), wege.filter((w) => !w.aktiviert && !w.nichtAktiviertGrund).map((w) => w.id).join(","));
check("6c Aktivierungsset = 4 Wege (von 6 auf 4 reduziert: 2 Wege bei der Neuverifikation 2026-07-26 veraltet)",
  aktivierte.length === 4);
check("6d Jeder aktivierte Weg hat eine absolute https-URL", aktivierte.every((w) => /^https:\/\/[^\s]+$/.test(w.url)));
check("6e Jeder aktivierte Weg hat einen Parser, und der passt zur Methode",
  aktivierte.every((w) => (w.method === "googlenews_search" && w.parser === "googlenews-batchexecute")
    || (w.method === "rss" && w.parser === "rss-regex")));
check("6f Google-News-Wege tragen eine Query, Direktfeeds nicht",
  aktivierte.every((w) => (w.method === "googlenews_search") === Boolean(w.query)));
check("6g Domains sind die erwarteten Berliner bzw. Aggregator-Domains",
  aktivierte.every((w) => {
    const host = new URL(w.url).hostname;
    return ["news.google.com", "www.tagesspiegel.de", "www.rbb24.de"].includes(host);
  }));
check("6h Jeder Weg trägt politische Ebene 'land' und Geografie 'geo-land-berlin'",
  wege.every((w) => w.political_level === "land" && w.geography_id === "geo-land-berlin"));
check("6i Jeder aktivierte Weg traegt eine AKTUELLE Verifikation mit Urteil 'geeignet'",
  aktivierte.every((w) => (B.VERIFIKATION_20260726[w.id] || {}).urteil === "geeignet"),
  aktivierte.filter((w) => (B.VERIFIKATION_20260726[w.id] || {}).urteil !== "geeignet").map((w) => w.id).join(","));
check("6j Die beiden bot-gesperrten Wege (429) sind NICHT im Aktivierungsset",
  wege.filter((w) => w.eingeschraenkt).every((w) => !w.aktiviert));
check("6k Herausgeber und Belegrolle sind je Weg gesetzt",
  wege.every((w) => w.herausgeber && w.evidence_role));
check("6l Jeder aktivierte Weg hat eine Obergrenze für Dokumente (max_items)",
  aktivierte.every((w) => Number.isFinite(w.max_items) && w.max_items > 0));
check("6m Zu jedem Weg existiert eine benannte Einschränkung (auch zu den unbeschränkten)",
  wege.every((w) => B.EINSCHRAENKUNGEN.some((e) => e.weg === w.id) || B.UMHAENGUNG.wege.includes(w.id)));
check("6n Jede Einschränkung nennt Ausfallform, Monitoring-Signal und Alternative",
  B.EINSCHRAENKUNGEN.every((e) => e.ausfallform && e.monitoring && e.alternative));
check("6o Pflichtklassen ehrlich: 5 von 12 liefernd, 7 nur vorbereitet, 0 ohne Weg",
  (() => {
    const a = B.pflichtklassenAbdeckung(wege);
    return a.basisGesamt === 12 && a.basisLiefernd.length === 5 && a.basisNurVorbereitet.length === 7 && a.basisOhneWeg.length === 0;
  })());
// Die 7 nicht liefernden Klassen sind die 4 PARDOK-Klassen PLUS die 3, die an den zwei
// veralteten Wegen hingen (landesparlament + ausschuesse an rp-be-landesparlament,
// landesfraktionen an rp-be-landesfraktionen). Ein Weg, dessen juengstes Item Monate alt ist,
// zaehlt hier NICHT als liefernd — das ist der Unterschied zwischen erreichbar und liefernd.
check("6p Die 7 nicht liefernden Klassen sind die PARDOK-Klassen plus die 3 veralteten",
  gleich(B.pflichtklassenAbdeckung(wege).basisNurVorbereitet.slice().sort(),
    ["ausschuesse", "drucksachen", "gesetzgebung", "landesfraktionen", "landesparlament", "plenum", "schriftliche_anfragen"]));
check("6q Der relationale Plan hält für jeden aktiven Weg die Crawler-Quelle mit URL bereit (Originalabruf nachvollziehbar)",
  pAktiv.aktiv.filter((a) => berlinIds.includes(a.id)).every((a) => a.source && (a.source.rssUrl || a.source.url)));
check("6r Globale URL-Dedup: derselbe Weg erscheint auch bei zwei Berliner Profilen genau einmal",
  (() => {
    const pl = plan({ berlinAktiv: true, neutralisiert: true, profiles: [P_BERLIN_CDU, { ...P_BERLIN_LINKE }], env: { HELMUT_LANDESMODULE: "berlin" } });
    const ids = aktivIds(pl).filter((id) => berlinIds.includes(id));
    return ids.length === new Set(ids).size && ids.length === 4;
  })());

// ══ 7) PARDOK-Invariante + Fehlerisolation + Leerzustand ═════════════════════════════════════
(async () => {
  const be = { id: "be-plenum", url: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml", crawlMethod: "structured_download" };
  const off = await pardokDispatch(be, { env: {}, noWrite: true });
  const shadow = await pardokDispatch(be, { mode: "shadow", noWrite: true, fetchText: async () => "<Dokument><Titel>x</Titel></Dokument>" });
  check("7a PARDOK liefert im Modus off 0 Items", off.items.length === 0);
  check("7b PARDOK liefert auch im Modus shadow 0 Items (harte Invariante)", shadow.items.length === 0);
  check("7c PARDOK-Fetch-Fehler bricht nichts, sondern endet als 0 Items mit Grund",
    (await pardokDispatch(be, { mode: "shadow", noWrite: true, fetchText: async () => { throw new Error("timeout"); } })).reason.startsWith("fetch-fehler"));

  // Fehlerisolation über den echten Crawl-Einstieg: ein fehlschlagender Weg (localhost,
  // Verbindung abgelehnt) darf die anderen nicht mitreissen.
  const res = await crawler.crawlAllSources([
    { id: "ok-1", name: "OK 1", active: true, crawlMethod: "manual" },
    { id: "kaputt", name: "Kaputt", active: true, crawlMethod: "html", url: "http://127.0.0.1:1/" },
    { id: "ok-2", name: "OK 2", active: true, crawlMethod: "manual" }
  ]);
  check("7d Ein fehlschlagender Weg beschädigt den Lauf nicht (3 Ergebnisse, 1 Fehler, 2 ok)",
    res.results.length === 3 && res.results.filter((r) => r.ok).length === 2 && res.results.filter((r) => !r.ok).length === 1);
  check("7e Der Fehler ist sichtbar (status='error' mit Meldung)",
    res.results.some((r) => r.sourceId === "kaputt" && r.status === "error" && r.error));
  check("7f Leere Wege sind sichtbar (status='empty', nicht als Erfolg mit Inhalt gezählt)",
    res.results.filter((r) => r.status === "empty").length === 2 && res.newCandidateItems === 0);
  check("7g Inaktive Quellen werden gar nicht erst abgerufen",
    (await crawler.crawlAllSources([{ id: "aus", name: "Aus", active: false, crawlMethod: "manual" }])).results.length === 0);

  // ══ 8) Verarbeitungskette: Dedup + politische Ebene + Geografie ════════════════════════════
  // Realistischer Berliner Dedup-Fall: DIESELBE Meldung wird von zwei Google-News-Suchwegen
  // gefunden (landesparlament + staatskanzlei sind absichtlich überlappende Suchen) und nach
  // der URL-Auflösung auf dieselbe Zieladresse aufgelöst.
  const rohBerlin = [
    { sourceId: "be-landesparlament", title: "Abgeordnetenhaus von Berlin beschließt Nachtragshaushalt", url: "https://www.parlament-berlin.de/pm/1", originalUrl: "https://news.google.com/rss/articles/AAA", linkType: "direct", publishedAt: "2026-07-25T08:00:00Z" },
    { sourceId: "be-staatskanzlei", title: "Abgeordnetenhaus von Berlin beschließt Nachtragshaushalt", url: "https://www.parlament-berlin.de/pm/1", originalUrl: "https://news.google.com/rss/articles/BBB", linkType: "direct", publishedAt: "2026-07-25T08:00:00Z" },
    { sourceId: "be-regionale_leitmedien", title: "Senat Berlin legt Mietenkonzept vor", url: "https://www.tagesspiegel.de/berlin/2", linkType: "direct", publishedAt: "2026-07-25T10:00:00Z" }
  ];
  const dd = planDedupWrites(rohBerlin);
  check("8a Dedup: dieselbe Meldung über zwei Berliner Wege ergibt EIN Dokument",
    dd.persists.length === 2, `persists=${dd.persists.length}`);
  check("8b Beide Fundstellen bleiben erhalten (Herkunft je Weg nachvollziehbar)",
    dd.findings.length === 3 && new Set(dd.findings.map((f) => f.source_id)).size === 3);
  check("8c Jede Fundstelle trägt eine Original-URL (Rückverfolgbarkeit zum Abruf)",
    dd.findings.every((f) => /^https:\/\//.test(String(f.original_url || ""))));
  check("8d Das zusammengeführte Dokument trägt die aufgelöste Zieladresse, nicht den Google-Link",
    dd.persists.some((d) => d.finding_count === 2
      && /parlament-berlin\.de\/pm\/1$/.test(String(d.canonical_url))
      && !/news\.google\.com/.test(String(d.canonical_url))));
  check("8e Unterschiedliche Meldungen werden NICHT zusammengeworfen",
    dd.persists.some((d) => d.title === "Senat Berlin legt Mietenkonzept vor" && d.finding_count === 1));

  // Klassifikation arbeitet auf Knowledge-Object-Feldern (headline/was_ist_passiert/…),
  // nicht auf Rohdokument-Feldern — deshalb hier die echten KO-Feldnamen.
  const koBerlin = { headline: "Abgeordnetenhaus von Berlin beschließt Nachtragshaushalt", was_ist_passiert: "Das Abgeordnetenhaus hat den Nachtragshaushalt beschlossen.", mentioned_locations: ["Berlin"] };
  const ebene = C.deriveDecisionLevel(koBerlin);
  const geo = C.resolveGeographies(["Berlin"]);
  check("8f Politische Ebene wird als 'land' erkannt (Landesinstitution + Bundesland)",
    ebene.level === "land" && ebene.confidence === "medium", JSON.stringify(ebene));
  check("8g Geografie wird auf geo-land-berlin aufgelöst",
    geo.length === 1 && geo[0].geography_id === "geo-land-berlin" && geo[0].level === "land", JSON.stringify(geo));
  const klass = C.classifyKnowledgeObject(koBerlin, {});
  check("8h Die Klassifikation liefert Ebene UND betroffene Geografie zusammen",
    klass.decision_level === "land" && JSON.stringify(klass.affected_geographies).includes("geo-land-berlin"),
    JSON.stringify(klass).slice(0, 220));
  check("8i Eine Bundesmeldung wird NICHT als Landesebene klassifiziert",
    C.deriveDecisionLevel({ headline: "Bundestag beschließt Gesetz", was_ist_passiert: "Der Deutsche Bundestag ..." }).level === "bund");
  check("8j Eine Brandenburg-Meldung landet auf geo-land-brandenburg, nicht auf Berlin",
    (() => {
      const g = C.resolveGeographies(["Brandenburg"]);
      const k = C.classifyKnowledgeObject({ headline: "Landtag Brandenburg beschließt Haushalt", was_ist_passiert: "Der Landtag Brandenburg ...", mentioned_locations: ["Brandenburg"] }, {});
      return g.length === 1 && g[0].geography_id === "geo-land-brandenburg"
        && !JSON.stringify(k.affected_geographies).includes("geo-land-berlin");
    })());
  check("8k Ohne erkennbares Signal bleibt die Ebene ehrlich 'unknown' (kein stiller Bund-Default)",
    C.deriveDecisionLevel({ headline: "Verein eröffnet Sommerfest" }).level === "unknown");

  // ══ 9) Lastprognose ═══════════════════════════════════════════════════════════════════════
  const last = B.lastprognose(wege);
  check("9a Wege je Lauf = 4 (2 Google-News + 2 Direktfeeds)",
    last.wegeProLauf === 4 && last.davonGoogleNews === 2 && last.davonDirektfeeds === 2);
  check("9b Untergrenze der Abrufe je Lauf = 1 je Weg", last.abrufeProLaufMin === 4);
  check("9c Obergrenze je Lauf ist aus max_items und der URL-Auflösung abgeleitet (nicht geraten)",
    last.abrufeProLaufMax === 4 + 2 * 16 * 3 && last.abrufeProLaufMax === 100);
  // KORREKTUR: die Alt-Annahme "2 Crawl-Crons aus vercel.json" war falsch. Gemessen laufen
  // real 5 Vollrunden je Tag (04:00, ~07:5x, 10:00, 16:00, 20:00 UTC) — die Alt-Rechnung
  // unterschaetzte die Abruflast um den Faktor 2,5.
  check("9d Tageswerte folgen den 5 GEMESSENEN Vollrunden, nicht den 2 Crawl-Crons",
    last.abrufeProTagMin === 20 && last.abrufeProTagMax === 500);
  check("9e Der Crawl selbst löst 0 LLM-Aufrufe aus (Kosten entstehen erst im Understanding)",
    last.llmCallsDurchCrawl === 0);
  check("9f Dokument-Obergrenze ist begrenzt und benannt",
    last.dokumenteProLaufMax === 64 && last.dokumenteProTagMax === 320);
  check("9g Alle Annahmen sind mitgeliefert (nachrechenbar)",
    last.annahmen.maxItemsJeWeg === 16 && last.annahmen.crawlLaeufeProTag === 5 && last.annahmen.crawlNebenlaufigkeit === 20);

  // ══ 10) Rollback: das committete SQL wirklich ausführen ═══════════════════════════════════
  rollbackTests();
  adversarialBefunde();
  abschluss();
})().catch((e) => { check("7/8/9 Blöcke liefen durch", false, e && e.stack); abschluss(); });
}

// ── Mini-SQL-Executor: führt GENAU die Statementformen aus, die der Generator erzeugt.
// Jede unbekannte Form ist ein harter Fehler — der Test darf nichts stillschweigend überspringen.
//
// RIEGEL-BLÖCKE (14A): der Generator schreibt Vor-/Nachbedingungen als `do $$ … $$;`-Blöcke.
// Ein Mini-Executor kann kein PL/pgSQL. Er zählt sie deshalb und übergibt die SEMANTIK an
// B.pruefeBedingung — dieselbe deklarative Liste, aus der der Generator das SQL erzeugt
// (scripts/berlin-staffelung-test.js prüft Anzahl und Wirkung je Schritt).
function riegelBloecke(sql) {
  return (sql.match(/do \$\$[\s\S]*?\$\$;/g) || []);
}
function miniSql(db, sql) {
  const ohneRiegel = sql.replace(/do \$\$[\s\S]*?\$\$;/g, "");
  const statements = ohneRiegel
    .split("\n").filter((l) => !/^\s*--/.test(l)).join("\n")
    .split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  let angewandt = 0, uebersprungen = 0;
  for (const st of statements) {
    if (/^(begin|commit|notify)\b/i.test(st)) { uebersprungen += 1; continue; }
    let m;
    if ((m = st.match(/^update public\.retrieval_paths set status = '([^']+)', activation_mode = '([^']+)' where id in \(([^)]*)\)(?: and status = '([^']+)' and activation_mode = '([^']+)')?$/i))) {
      const ids = m[3].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
      for (const p of db.retrieval_paths) {
        if (!ids.includes(p.id)) continue;
        if (m[4] && !(p.status === m[4] && p.activation_mode === m[5])) continue;
        p.status = m[1]; p.activation_mode = m[2]; angewandt += 1;
      }
      continue;
    }
    if ((m = st.match(/^update public\.source_packages set status = '([^']+)' where key = '([^']+)'(?: and status = '([^']+)')?$/i))) {
      for (const pk of db.source_packages) {
        if (pk.key !== m[2]) continue;
        if (m[3] && pk.status !== m[3]) continue;
        pk.status = m[1]; angewandt += 1;
      }
      continue;
    }
    if ((m = st.match(/^insert into public\.package_paths \(package_id, retrieval_path_id\) values (.+) on conflict \(package_id, retrieval_path_id\) do nothing$/i))) {
      for (const tup of m[1].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)) {
        if (!db.package_paths.some((pp) => pp.package_id === tup[1] && pp.retrieval_path_id === tup[2])) {
          db.package_paths.push({ package_id: tup[1], retrieval_path_id: tup[2] }); angewandt += 1;
        }
      }
      continue;
    }
    if ((m = st.match(/^delete from public\.package_paths where package_id = '([^']+)' and retrieval_path_id in \(([^)]*)\)$/i))) {
      const ids = m[2].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
      const vorher = db.package_paths.length;
      db.package_paths = db.package_paths.filter((pp) => !(pp.package_id === m[1] && ids.includes(pp.retrieval_path_id)));
      angewandt += vorher - db.package_paths.length;
      continue;
    }
    throw new Error("Mini-SQL kennt dieses Statement nicht (Test würde es sonst still überspringen): " + st.slice(0, 160));
  }
  return { angewandt, uebersprungen };
}

function rollbackTests() {
  const seedDir = path.join(__dirname, "..", "supabase", "seeds");
  const lies = (f) => fs.readFileSync(path.join(seedDir, f), "utf8");
  // 14A: die Sammeldatei ist stillgelegt; die Aktivierung besteht aus 4 Einzelschritten.
  // Der Test führt sie in der vorgesehenen Reihenfolge aus — genau wie ein Operator.
  const sqlStop = lies(B.DATEI_STOP);
  const sqlAktivierung = [B.DATEI_A, B.DATEI_B1, B.DATEI_S1, B.DATEI_S2].map(lies).join("\n");
  const sqlRb1 = lies(B.DATEI_RB_ALLE);
  const sqlRb2 = lies(B.DATEI_RB_VOLL);

  // Ausgangs-DB = gemessener Production-Ist (2026-07-26).
  const frischeDb = () => ({
    retrieval_paths: [
      ...BUND_WEGE.map((p) => ({ id: p.id, status: p.status, activation_mode: p.activation_mode })),
      ...landesSeed.retrievalPaths.map((p) => ({ id: p.id, status: "needs_review", activation_mode: "manual" }))
    ],
    source_packages: PACKAGE_DEFINITIONS.map((p) => ({ key: p.key, status: p.status })),
    package_paths: [...BUND_LINKS.map((l) => ({ ...l })), ...IST_LINKS.map((l) => ({ ...l }))]
  });
  const bild = (db) => JSON.stringify({
    rp: db.retrieval_paths.slice().sort((a, b) => a.id.localeCompare(b.id)),
    sp: db.source_packages.slice().sort((a, b) => a.key.localeCompare(b.key)),
    pp: db.package_paths.map((p) => `${p.package_id}|${p.retrieval_path_id}`).sort()
  });

  // --- Anwenden ---
  const db = frischeDb();
  const vorher = bild(db);
  const a = miniSql(db, sqlAktivierung);
  check("10a Aktivierungs-SQL ist vollständig ausführbar und ändert Zeilen", a.angewandt > 0);
  check("10b Nach Block A: 0 Partei-/Fraktions-/Personenwege am Pflicht-Basispaket",
    db.package_paths.filter((pp) => pp.package_id === B.BASISPAKET_ID && B.UMHAENGUNG.wege.includes(pp.retrieval_path_id)).length === 0);
  check("10c Nach Block A: alle 3 Wege hängen am Parteipaket",
    B.UMHAENGUNG.wege.every((w) => db.package_paths.some((pp) => pp.package_id === B.PARTEIPAKET_ID && pp.retrieval_path_id === w)));
  check("10d Nach Block B: genau 4 Berliner Wege healthy+auto",
    db.retrieval_paths.filter((p) => p.status === "healthy" && p.activation_mode === "auto" && B.AKTIVIERUNGSSET.includes(p.id)).length === 4
    && db.retrieval_paths.filter((p) => p.id.startsWith("rp-be-") && p.status === "healthy").length === 3);
  check("10e Nach Block B: berlin-basis ist 'active', brandenburg-basis unverändert 'prepared'",
    db.source_packages.find((p) => p.key === "berlin-basis").status === "active"
    && db.source_packages.find((p) => p.key === "brandenburg-basis").status === "prepared");
  check("10f Kein Brandenburg-Weg wurde verändert",
    db.retrieval_paths.filter((p) => p.id.startsWith("rp-bb-")).every((p) => p.status === "needs_review" && p.activation_mode === "manual"));
  check("10g Kein Bundesweg wurde verändert",
    BUND_WEGE.every((o) => { const n = db.retrieval_paths.find((p) => p.id === o.id); return n.status === o.status && n.activation_mode === o.activation_mode; }));
  check("10h Idempotenz: zweite Ausführung ändert nichts mehr",
    (() => { const b1 = bild(db); miniSql(db, sqlAktivierung); return bild(db) === b1; })());

  // --- Rollback Stufe 1 (Betriebs-Abbruch) ---
  const db1 = frischeDb(); miniSql(db1, sqlAktivierung); miniSql(db1, sqlRb1);
  check("10i Rollback Stufe 1: alle 6 Wege wieder needs_review+manual, Paket wieder 'prepared'",
    B.AKTIVIERUNGSSET.every((id) => { const p = db1.retrieval_paths.find((x) => x.id === id); return p.status === "needs_review" && p.activation_mode === "manual"; })
    && db1.source_packages.find((p) => p.key === "berlin-basis").status === "prepared");
  check("10j Rollback Stufe 1 nimmt die Neutralisierung NICHT zurück (Befund A-3 kehrt nicht zurück)",
    db1.package_paths.filter((pp) => pp.package_id === B.BASISPAKET_ID && B.UMHAENGUNG.wege.includes(pp.retrieval_path_id)).length === 0);
  check("10k Nach Rollback Stufe 1 läuft kein Berliner Weg mehr im Plan",
    (() => {
      const k = katalog({ berlinAktiv: false, neutralisiert: true });
      const pl = SM.buildRelationalCrawlPlan({ ...k, profiles: [P_BERLIN_CDU], legacySources: [], env: { HELMUT_LANDESMODULE: "berlin" } });
      return aktivIds(pl).filter((id) => berlinIds.includes(id)).length === 0;
    })());

  // --- Rollback Stufe 2 (vollständige Wiederherstellung) ---
  const db2 = frischeDb(); const bild2 = bild(db2);
  miniSql(db2, sqlAktivierung); miniSql(db2, sqlRb2);
  check("10l Rollback Stufe 2 stellt den Ausgangszustand ZEILENGENAU wieder her", bild(db2) === bild2);
  check("10m Auch der Ausgangszustand VOR Block A wird exakt getroffen (3 Wege zurück am Basispaket)",
    db2.package_paths.filter((pp) => pp.package_id === B.BASISPAKET_ID && B.UMHAENGUNG.wege.includes(pp.retrieval_path_id)).length === 3
    && db2.package_paths.filter((pp) => pp.package_id === B.PARTEIPAKET_ID).length === 0);
  check("10n Rollback Stufe 2 ist idempotent",
    (() => { miniSql(db2, sqlRb2); return bild(db2) === bild2; })());
  check("10o Der schnellste Abbruch braucht gar kein SQL: Flag leeren genügt",
    (() => {
      const k = katalog({ berlinAktiv: true, neutralisiert: true });
      k.packages = k.packages.map((p) => (p.key === B.BASISPAKET_KEY ? { ...p, status: "active" } : p));
      const pl = SM.buildRelationalCrawlPlan({ ...k, profiles: [P_BERLIN_CDU], legacySources: [], env: {} });
      return aktivIds(pl).filter((id) => berlinIds.includes(id)).length === 0;
    })());
  check("10p Rollback löscht keine Dokumente (kein delete auf raw_documents/knowledge_objects)",
    !/delete\s+from\s+public\.(raw_documents|knowledge_objects|source_crawl_telemetry)/i.test(sqlRb1 + sqlRb2));

  // --- 14A: die stillgelegte Sammeldatei mutiert nichts mehr ---
  check("10p1 Die frühere Sammeldatei enthält KEIN mutierendes Statement mehr (V-1 fail-closed)",
    !/^\s*(update|insert|delete)\b/im.test(sqlStop.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n")));
  check("10p2 Die stillgelegte Sammeldatei bricht ausdrücklich ab und nennt die Einzelschritte",
    /raise exception 'STILLGELEGT/.test(sqlStop) && sqlStop.includes(B.DATEI_S1) && sqlStop.includes(B.DATEI_S2));
  check("10p3 Ihre Ausführung ändert im Mini-Executor keine Zeile",
    (() => { const d = frischeDb(); const v = bild(d); miniSql(d, sqlStop); return bild(d) === v; })());

  // --- Nicht-Berührung als Zeichenketten-Invariante über AUSFÜHRBARES SQL ---
  const ausfuehrbar = (s) => s.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  const alleAusfuehrbar = [sqlStop, sqlAktivierung, sqlRb1, sqlRb2,
    lies(B.DATEI_S1_RB), lies(B.DATEI_S2_RB)].map(ausfuehrbar).join("\n");
  check("10q Kein ausführbares Statement nennt einen Brandenburg-Bezeichner",
    !/rp-bb-|brandenburg/i.test(alleAusfuehrbar));
  check("10r Kein ausführbares Statement nennt eine Bundesquelle oder ein Bundespaket",
    !/bund-basis|arbeit-und-soziales|die-linke-bund|regional-niedersachsen/i.test(alleAusfuehrbar));
  check("10s Kein ausführbares Statement berührt Mandanten-/Profiltabellen",
    !/mandate_profiles|users|profil-/i.test(alleAusfuehrbar));
  check("10t Kein DDL, kein drop/truncate", !/\b(drop|truncate|alter)\b/i.test(alleAusfuehrbar));
  check("10u Production-Konfiguration unverändert: helmut-flags.json setzt weiterhin kein Landesmodul",
    !JSON.parse(fs.readFileSync(path.join(__dirname, "..", "helmut-flags.json"), "utf8")).HELMUT_LANDESMODULE);
  check("10v Alle 6 Voraussetzungen sind benannt und tragen eine objektive Prüfung",
    B.VORAUSSETZUNGEN.length === 6 && B.VORAUSSETZUNGEN.every((v) => v.id && v.titel && v.pruefbar));
  check("10w Die Betriebsdokumentation existiert und nennt Rollback und Abbruchkriterien",
    (() => {
      const p = path.join(__dirname, "..", "docs", "betrieb", "berlin-aktivierung.md");
      if (!fs.existsSync(p)) return false;
      const t = fs.readFileSync(p, "utf8");
      return /Rollback/i.test(t) && /Abbruchkriterien/i.test(t) && /HELMUT_LANDESMODULE/.test(t);
    })());
}

// ══ 11) Adversariale Befunde: Rate-Limit-Schutz, Parser-Metadatum, Warteschlange ═════════════
// Diese drei Punkte sind im adversarialen Review aufgefallen und werden hier festgeschrieben,
// damit sie nicht stillschweigend kippen.
function adversarialBefunde() {
  const { isGoogleNewsSource } = require("../lib/helmut/google-news-hardening");
  const P = require("../lib/helmut/quellenarchitektur/understanding-priority");

  // 11a-c: Greifen Google-Drossel, Retry und Circuit Breaker auch für die Berliner Wege?
  // Die Erkennung läuft über die URL, nicht über eine Quellenliste — ein Berliner Google-Weg
  // ohne Erkennung würde die Drossel umgehen und genau den Sturm auslösen, den B1 beschreibt.
  const quellen = pAktiv.aktiv.filter((a) => berlinIds.includes(a.id)).map((a) => ({ id: a.id, src: a.source }));
  const googleWege = B.berlinWegeAusSeed().filter((w) => w.aktiviert && w.method === "googlenews_search").map((w) => w.id);
  const direktWege = B.berlinWegeAusSeed().filter((w) => w.aktiviert && w.method !== "googlenews_search").map((w) => w.id);
  check("11a Alle 2 Berliner Google-News-Wege werden vom Google-Gate erkannt (Drossel/Retry/Breaker greifen)",
    googleWege.length === 2 && googleWege.every((id) => isGoogleNewsSource((quellen.find((q) => q.id === id) || {}).src || {})),
    googleWege.filter((id) => !isGoogleNewsSource((quellen.find((q) => q.id === id) || {}).src || {})).join(","));
  check("11b Die 2 Berliner Direktfeeds laufen NICHT über das Google-Gate (Provider-Trennung bleibt)",
    direktWege.length === 2 && direktWege.every((id) => !isGoogleNewsSource((quellen.find((q) => q.id === id) || {}).src || {})));
  check("11c Jede Plan-Quelle trägt die Item-Obergrenze in den Crawler (maxItems)",
    quellen.every((q) => Number(q.src.maxItems) === 16));

  // 11d/e: Das Feld `parser` ist METADATUM. toCrawlerSource entscheidet allein über `method`.
  // Festschreiben, damit niemand glaubt, eine Parser-Korrektur ändere das Abrufverhalten.
  const alsRss = SM.toCrawlerSource({ id: "x", method: "googlenews_search", url: "https://news.google.com/rss/search?q=x", parser: "voellig-falsch" }, new Map());
  const alsDownload = SM.toCrawlerSource({ id: "y", method: "structured_download", url: "https://a.example/x.xml", parser: null }, new Map());
  check("11d Der Parser-Wert steuert das Abrufverhalten NICHT — die Methode entscheidet",
    alsRss.crawlMethod === "rss" && alsRss.rssUrl === "https://news.google.com/rss/search?q=x");
  check("11e Ein fehlender Parser ändert am structured_download-Pfad nichts (PARDOK bleibt PARDOK)",
    alsDownload.crawlMethod === "structured_download");
  check("11f Trotzdem ist im Plan jeder Berliner Weg mit passendem Parser hinterlegt (Doku-Wahrheit)",
    B.berlinWegeAusSeed().every((w) => Boolean(w.parser)));

  // 11g/h: Landen Berliner Dokumente in der Understanding-Warteschlange vorn oder hinten?
  const koAmtlichBerlin = { decision: "verstehen", relevance: { level: "land", confidence: "medium", hasInstitution: true } };
  const koBerlinOhneInstitution = { decision: "beobachten", relevance: { level: "land", confidence: "low", hasInstitution: false } };
  check("11g Ein amtliches Berliner Dokument wird NICHT hinter den Bund zurückgestuft (Stufe ≤ 2)",
    P.priorityTier(koAmtlichBerlin) <= 2, String(P.priorityTier(koAmtlichBerlin)));
  check("11h Ein Berliner Dokument ohne Institutionsbezug landet auf der Regionalstufe (5), nicht darunter",
    P.priorityTier(koBerlinOhneInstitution) === P.TIER.REGIONAL);
  // 11i: Ehrlichkeit — diese Priorisierung ist SHADOW und ändert den Production-Deckel nicht.
  check("11i Die Priorisierung ist ausdrücklich als vorbereitet/shadow gekennzeichnet (kein falsches Grün)",
    /VORBEREITET|SHADOW/i.test(fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", "understanding-priority.js"), "utf8").slice(0, 1400)));

  // 11j: Es gibt downstream KEINEN zweiten Berlin-Filter, der die Kette still abbrechen würde —
  // die einzige strukturelle BE/BB-Sperre hinter dem Crawl ist die PARDOK-Invariante.
  const downstream = ["lage.js", "radarState.js", "briefingContract.js", "push.js"]
    .map((f) => fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", f), "utf8"))
    .join("\n")
    .split("\n")
    // Kommentarzeilen filtern nichts — nur ausführbarer Code zählt.
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .filter((l) => /berlin/i.test(l) && !/Europe\/Berlin|berlinDay|berlinDate|berlinTime|BerlinGreeting/i.test(l));
  check("11j Kein Berlin-Filter in Lage/Radar/Briefing/Push (die Kette bricht nicht still ab)",
    downstream.length === 0, downstream.slice(0, 2).join(" | "));
}

function abschluss() {
  console.log(`\n== Ergebnis: ${passed} PASS, ${failed} FAIL ==`);
  if (failed === 0) {
    console.log("Berlin ist AKTIVIERUNGSREIF geprüft — aktiviert wurde nichts.");
    console.log("Brandenburg blieb in jeder geprüften Konstellation inaktiv.");
  }
  process.exit(failed > 0 ? 1 : 0);
}
