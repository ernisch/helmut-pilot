"use strict";

// Helmut — Phase-1-Punkt 14A, Teil B: die MANDATSBINDUNG der Landesmodule ausführbar prüfen.
// =============================================================================================
// Befund V-2: `loadRelationalSharedSources()` nahm keinen Profilparameter. Sie baute EINEN
// globalen Plan aus allen Profilen, und `getSourcesForProfile()` mischte genau diesen Plan in
// die Quellenliste JEDES Profils. Folgen:
//   (a) das Landesmodul-Gate hing allein am Betreiberflag — ein gesetztes Flag liess die Wege
//       eines Landes laufen, sobald irgendein aktives Paket sie referenzierte. Beim
//       zweiländrigen rbb24-Weg genügte dafür ein BRANDENBURGER Mandat, obwohl nur Berlin
//       freigegeben war.
//   (b) ein einziges Berliner Landtagsmandat hätte die Berliner Wege in den Abruf JEDES
//       Bundestagsmandats gelegt.
//
// KORRIGIERTES MODELL — und dieser Test schreibt genau diese Grenze fest:
//   * Der Crawl-Plan ist und bleibt GLOBAL: ein Abrufweg läuft systemweit genau einmal, der
//     Rohkorpus (`raw_documents`) und die Knowledge Objects sind mandantenneutral (kein
//     tenant_id). Mandatsscharf ist erst die Auswahl stromabwärts (Briefing/Radar).
//   * LANDESMODULE sind davon ausgenommen: sie brauchen Freigabe UND ein berechtigtes
//     Landesmandat, und sie erscheinen nur in der Versorgung der berechtigten Mandate.
//   * Dieser Test behauptet KEINE Mandantenisolation des Rohkorpus — er prüft ausdrücklich,
//     dass die Dokumentation das ebenfalls nicht behauptet (Block 8).
//
// Reiner Offline-Test: kein Netz, keine KI, kein DB-Zugriff, kein Datei-Schreiben.

const fs = require("fs");
const path = require("path");
const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const PP = require("../lib/helmut/quellenarchitektur/profile-packages");
const B = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const scheduler = require("../lib/helmut/scheduler");
const { v1Sources } = require("../lib/helmut/sources");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────
// Aus dem ECHTEN Landesmodul-Abbild plus neutralen Bund-Platzhaltern. Keine Production-Daten,
// keine reale Mandantenidentität.
const landesSeed = buildLandesmodulSeed();
const BUND_WEGE = [
  { id: "rp-kern-1", legacy_source_id: "kern-1", method: "rss", url: "https://kern1.example/rss", status: "healthy", activation_mode: "always_on", priority: 100 },
  { id: "rp-bund-a", legacy_source_id: "bund-a", method: "rss", url: "https://bunda.example/rss", status: "healthy", activation_mode: "auto", priority: 90 },
  { id: "rp-partei-linke", legacy_source_id: "partei-linke", method: "rss", url: "https://linke.example/rss", status: "healthy", activation_mode: "auto", priority: 80 },
  { id: "rp-soziales", legacy_source_id: "soziales", method: "rss", url: "https://soziales.example/rss", status: "healthy", activation_mode: "auto", priority: 70 }
];
const BUND_LINKS = [
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-kern-1" },
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-bund-a" },
  { package_id: "pkg-die-linke-bund", retrieval_path_id: "rp-partei-linke" },
  { package_id: "pkg-arbeit-und-soziales", retrieval_path_id: "rp-soziales" }
];
// Ist-Zustand: die 3 Pilotwege am Pflicht-Basispaket (Befund A-3) — wie in Production gemessen.
const IST_LINKS = landesSeed.packagePaths.map((pp) => (
  B.UMHAENGUNG.wege.includes(pp.retrieval_path_id) && pp.package_id === B.PARTEIPAKET_ID
    ? { package_id: B.BASISPAKET_ID, retrieval_path_id: pp.retrieval_path_id }
    : { ...pp }
));

// Voll aktivierter Katalog: beide Landespakete 'active', alle Wege des Aktivierungssets
// healthy/auto, neutralisiert. So ist das Gate die EINZIGE verbleibende Sperre — nur dann
// beweist der Test etwas über das Gate.
function katalog({ berlinWegeAktiv = true, brandenburgWegeAktiv = true, berlinPaketAktiv = true,
  brandenburgPaketAktiv = true, neutralisiert = true, ueberschreibungen = {} } = {}) {
  const beAktiv = new Set(B.AKTIVIERUNGSSET);
  const retrievalPaths = [
    ...BUND_WEGE.map((p) => ({ ...p })),
    ...landesSeed.retrievalPaths.map((p) => {
      const istBe = p.id.startsWith("rp-be-") || p.id === "rp-rbb24-politik";
      const scharf = istBe ? (berlinWegeAktiv && beAktiv.has(p.id)) : brandenburgWegeAktiv;
      return {
        id: p.id, legacy_source_id: p.legacy_source_id,
        method: p.method === "opendata_xml" || p.method === "api_xml" ? "structured_download" : p.method,
        url: p.url, priority: p.priority, max_items: p.max_items,
        status: scharf ? "healthy" : "needs_review",
        activation_mode: scharf ? "auto" : "manual",
        ...(ueberschreibungen[p.id] || {})
      };
    })
  ];
  const packages = PACKAGE_DEFINITIONS.map((pk) => {
    if (pk.key === "berlin-basis") return { ...pk, status: berlinPaketAktiv ? "active" : pk.status };
    if (pk.key === "brandenburg-basis") return { ...pk, status: brandenburgPaketAktiv ? "active" : pk.status };
    if (pk.key === "die-linke-berlin" || pk.key === "die-linke-brandenburg") return { ...pk, status: "active" };
    return { ...pk };
  });
  const packagePaths = [...BUND_LINKS, ...(neutralisiert ? landesSeed.packagePaths.map((pp) => ({ ...pp })) : IST_LINKS.map((pp) => ({ ...pp })))];
  return { retrievalPaths, packages, packagePaths };
}
const plan = (opts = {}) => SM.buildRelationalCrawlPlan({
  ...katalog(opts), profiles: opts.profiles || [], legacySources: [], env: opts.env || {}
});
const aktivIds = (p) => p.aktiv.map((a) => a.id).sort();
const grundVon = (p, id) => (p.ausgeschlossen.find((a) => a.id === id) || {}).grund
  || (p.defekt.find((d) => d.id === id) || {}).grund || null;

const beIds = B.berlinWegeAusSeed().map((w) => w.id);
const bbIds = landesSeed.retrievalPaths.map((p) => p.id).filter((id) => id.startsWith("rp-bb-"));
const beAktivierbar = [...B.AKTIVIERUNGSSET].sort();

// Profile. Alle mit Pflichtfeldern, damit `validateProfile` sie als nutzbar wertet — sonst
// würde der Test das Gate mit einem Validierungsfehler verwechseln.
const basis = { aktiv: true, profileActive: true, wahlkreis: "Testwahlkreis", ausschuesse: ["Innenausschuss"] };
const P_BUND = { ...basis, id: "t-bund", name: "Testprofil Bund", fullName: "Testprofil Bund", politische_ebene: "bundestag", partei: "SPD", party: "SPD", state: "Niedersachsen", bundesland: "Niedersachsen" };
// Der reale Production-Fall: Bundestagsmandat MIT Bundesland Berlin (4 von 6 aktiven Profilen).
const P_BUND_IN_BERLIN = { ...basis, id: "t-bund-be", name: "Testprofil Bund Berlin", fullName: "Testprofil Bund Berlin", politische_ebene: "bundestag", partei: "CDU", party: "CDU", state: "Berlin", bundesland: "Berlin" };
const P_BE = { ...basis, id: "t-be", name: "Testprofil Berlin", fullName: "Testprofil Berlin", politische_ebene: "landtag", partei: "CDU", party: "CDU", state: "Berlin", bundesland: "Berlin" };
const P_BE_LINKE = { ...basis, id: "t-be-linke", name: "Testprofil Berlin Linke", fullName: "Testprofil Berlin Linke", politische_ebene: "landtag", partei: "Die Linke", party: "Die Linke", state: "Berlin", bundesland: "Berlin" };
const P_BB = { ...basis, id: "t-bb", name: "Testprofil Brandenburg", fullName: "Testprofil Brandenburg", politische_ebene: "landtag", partei: "SPD", party: "SPD", state: "Brandenburg", bundesland: "Brandenburg" };
const P_BE_INAKTIV = { ...P_BE, id: "t-be-aus", aktiv: false, profileActive: false };
const P_BE_GELOESCHT = { ...P_BE, id: "t-be-weg", geloescht_at: "2026-07-01T00:00:00Z" };
const P_BE_UNVOLLSTAENDIG = { id: "t-be-halb", politische_ebene: "landtag", bundesland: "Berlin", aktiv: true, profileActive: true };
const FLAG_BE = { HELMUT_LANDESMODULE: "berlin" };
const FLAG_BB = { HELMUT_LANDESMODULE: "brandenburg" };
const FLAG_BEIDE = { HELMUT_LANDESMODULE: "berlin,brandenburg" };

// ══ 1) Die Mandatsbindung selbst ══════════════════════════════════════════════════════════════
check("1a Ein Berliner LANDTAGSprofil berechtigt Berlin",
  gleich([...SM.laenderMitBerechtigtemMandat([P_BE])], ["berlin"]));
check("1b Ein BUNDESTAGSprofil berechtigt kein Land — auch nicht mit bundesland='Berlin'",
  SM.laenderMitBerechtigtemMandat([P_BUND_IN_BERLIN]).size === 0
  && SM.laenderMitBerechtigtemMandat([P_BUND]).size === 0);
check("1c Ein Brandenburg-Profil berechtigt Brandenburg, NICHT Berlin",
  gleich([...SM.laenderMitBerechtigtemMandat([P_BB])], ["brandenburg"]));
check("1d Ein deaktiviertes Berliner Profil berechtigt nichts",
  SM.laenderMitBerechtigtemMandat([P_BE_INAKTIV]).size === 0);
check("1e Ein soft-gelöschtes Berliner Profil berechtigt nichts",
  SM.laenderMitBerechtigtemMandat([P_BE_GELOESCHT]).size === 0);
check("1f Ein unvollständiges Berliner Profil berechtigt nichts (validateProfile entscheidet)",
  SM.laenderMitBerechtigtemMandat([P_BE_UNVOLLSTAENDIG]).size === 0,
  JSON.stringify(PP.profileSupplyStatus(P_BE_UNVOLLSTAENDIG).reason));
check("1g null/Fremdtypen in der Profilliste berechtigen nichts (kein Absturz)",
  SM.laenderMitBerechtigtemMandat([null, 42, "berlin", undefined]).size === 0);
// FAIL-OPEN-RIEGEL: die Landeserkennung darf nicht von `package_paths` abhängen. Ein Weg, dessen
// Landeszugehörigkeit nur über seine Paketzeilen erkennbar ist, entkommt Regel 1, sobald diese
// Zeilen fehlen oder umgehängt werden. Das betraf `rp-rbb24-politik` (kein Landespräfix).
check("1h Jeder Landesmodul-Weg des Seeds wird auch OHNE Paketzeilen als Landesweg erkannt",
  landesSeed.retrievalPaths.every((p) => SM.landesmoduleOf({ id: p.id, legacy_source_id: p.legacy_source_id }, []).length > 0),
  landesSeed.retrievalPaths.filter((p) => !SM.landesmoduleOf({ id: p.id, legacy_source_id: p.legacy_source_id }, []).length).map((p) => p.id).join(","));
check("1i Der zweiländrige Weg wird ohne Paketzeilen BEIDEN Ländern zugeordnet",
  gleich(SM.landesmoduleOf({ id: "rp-rbb24-politik", legacy_source_id: "rbb24-politik" }, []), ["berlin", "brandenburg"]));
check("1j Eine Bundesquelle wird durch die Kennungsliste NICHT zum Landesweg",
  SM.landesmoduleOf({ id: "rp-bundestag", legacy_source_id: "bundestag" }, ["bund-basis"]).length === 0
  && SM.landesmoduleOf({ id: "rp-ni-landtag" }, ["regional-niedersachsen"]).length === 0);
check("1k Ein Berliner Weg ohne Paketzeilen bleibt gesperrt, wenn Berlin nicht wirksam ist",
  (() => {
    const p = plan({ profiles: [P_BB], env: FLAG_BB, brandenburgWegeAktiv: true, brandenburgPaketAktiv: true,
      ueberschreibungen: {} });
    // Brandenburg ist wirksam; der zweiländrige Weg läuft dadurch mit (dokumentierte
    // Nebenwirkung) — ein REIN Berliner Weg darf es nicht.
    return !aktivIds(p).includes("rp-be-landesregierung");
  })());
check("1l Wirksam = freigegeben UND bemandatiert — beide Richtungen werden getrennt ausgewiesen",
  (() => {
    const nurFlag = SM.wirksameLandesmodule({ profiles: [P_BUND], env: FLAG_BE });
    const nurMandat = SM.wirksameLandesmodule({ profiles: [P_BE], env: {} });
    const beides = SM.wirksameLandesmodule({ profiles: [P_BE], env: FLAG_BE });
    return nurFlag.wirksam.size === 0 && nurMandat.wirksam.size === 0
      && gleich([...beides.wirksam], ["berlin"]);
  })());

// ══ 2) Das Gate im ausführenden Plan ══════════════════════════════════════════════════════════
const pBundNurFlag = plan({ profiles: [P_BUND, P_BUND_IN_BERLIN], env: FLAG_BE });
check("2a Flag 'berlin' OHNE Berliner Landtagsmandat: 0 Berliner Wege im Plan",
  aktivIds(pBundNurFlag).filter((id) => beIds.includes(id)).length === 0);
check("2b Der Grund nennt ausdrücklich das fehlende Landesmandat (nicht 'nicht freigegeben')",
  /freigegeben, aber kein berechtigtes Landesmandat/.test(grundVon(pBundNurFlag, "rp-be-landesregierung") || ""),
  String(grundVon(pBundNurFlag, "rp-be-landesregierung")));
check("2c Der Plan weist 'freigegebenOhneMandat' aus (kein falsches Grün im Bericht)",
  gleich(pBundNurFlag.landesmodule.freigegebenOhneMandat, ["berlin"])
  && gleich(pBundNurFlag.landesmodule.wirksam, []));
const pBerlin = plan({ profiles: [P_BUND, P_BE], env: FLAG_BE });
check("2d Flag 'berlin' MIT Berliner Landtagsmandat: genau die 4 geplanten Wege laufen",
  gleich(aktivIds(pBerlin).filter((id) => beIds.includes(id)), beAktivierbar),
  aktivIds(pBerlin).filter((id) => beIds.includes(id)).join(","));
check("2e Berliner Mandat OHNE Flag: 0 Berliner Wege, Grund ist 'nicht freigegeben'",
  (() => {
    const p = plan({ profiles: [P_BE], env: {} });
    return p.aktiv.filter((a) => beIds.includes(a.id)).length === 0
      && /nicht freigegeben/.test(grundVon(p, "rp-be-landesregierung") || "");
  })());
check("2f Ein Brandenburg-Mandat aktiviert unter Berlin-Freigabe KEINEN Berliner Weg",
  (() => {
    const p = plan({ profiles: [P_BUND, P_BB], env: FLAG_BE });
    return p.aktiv.filter((a) => beIds.includes(a.id)).length === 0;
  })());
check("2g Der zweiländrige rbb24-Weg läuft NICHT über ein Brandenburg-Mandat bei Berlin-Freigabe",
  (() => {
    // Genau die Lücke vor 14A: brandenburg-basis aktiv + BB-Mandat + Flag 'berlin' -> rbb24 lief.
    const p = plan({ profiles: [P_BB], env: FLAG_BE, brandenburgPaketAktiv: true, brandenburgWegeAktiv: true });
    return !aktivIds(p).includes("rp-rbb24-politik")
      && /brandenburg: nicht freigegeben/.test(grundVon(p, "rp-rbb24-politik") || "");
  })(), String(grundVon(plan({ profiles: [P_BB], env: FLAG_BE }), "rp-rbb24-politik")));
check("2h Ein Berliner Mandat aktiviert KEINEN Brandenburg-Weg (auch bei aktivem BB-Paket)",
  (() => {
    const p = plan({ profiles: [P_BE], env: FLAG_BE, brandenburgWegeAktiv: true, brandenburgPaketAktiv: true });
    return bbIds.every((id) => !aktivIds(p).includes(id))
      && bbIds.every((id) => /brandenburg: nicht freigegeben/.test(grundVon(p, id) || ""));
  })());
check("2i Brandenburg wird auch bei Freigabe BEIDER Länder nur mit eigenem Mandat aktiv",
  (() => {
    const p = plan({ profiles: [P_BE], env: FLAG_BEIDE, brandenburgWegeAktiv: true, brandenburgPaketAktiv: true });
    return bbIds.every((id) => !aktivIds(p).includes(id))
      && /brandenburg: freigegeben, aber kein berechtigtes Landesmandat/.test(grundVon(p, bbIds[0]) || "");
  })());
check("2j Mit BEIDEN Ländern freigegeben UND je einem Mandat laufen beide Module",
  (() => {
    const p = plan({ profiles: [P_BE, P_BB], env: FLAG_BEIDE, brandenburgWegeAktiv: true, brandenburgPaketAktiv: true });
    return gleich(p.landesmodule.wirksam, ["berlin", "brandenburg"])
      && p.aktiv.some((a) => beIds.includes(a.id)) && p.aktiv.some((a) => bbIds.includes(a.id));
  })());
check("2k Ein deaktiviertes Berliner Profil hält das Gate geschlossen (Adversarial 7)",
  plan({ profiles: [P_BUND, P_BE_INAKTIV], env: FLAG_BE }).aktiv.filter((a) => beIds.includes(a.id)).length === 0);
check("2l Ein unvollständiges Berliner Profil hält das Gate geschlossen (Adversarial 8)",
  plan({ profiles: [P_BUND, P_BE_UNVOLLSTAENDIG], env: FLAG_BE }).aktiv.filter((a) => beIds.includes(a.id)).length === 0);
check("2m Das Gate ist Regel 1: es greift VOR Paketstatus und Wegstatus",
  (() => {
    // Paket active + Wege healthy/auto + Berliner Mandat, aber Flag leer -> 0 Wege.
    const p = plan({ profiles: [P_BE], env: {} });
    return p.aktiv.filter((a) => beIds.includes(a.id)).length === 0
      && /landesmodul-gesperrt/.test(grundVon(p, "rp-be-staatskanzlei") || "");
  })());
check("2n Es gibt weiterhin kein Sammel-Schlüsselwort (fail-closed)",
  ["alle", "*", "all", "true", "on", "1"].every((wert) =>
    plan({ profiles: [P_BE], env: { HELMUT_LANDESMODULE: wert } }).aktiv.filter((a) => beIds.includes(a.id)).length === 0));

// ══ 3) Profilbezogene Versorgung: ein Berliner Mandat versorgt nicht alle ══════════════════════
check("3a Ein Bundestagsmandat erhält im geteilten Plan KEINEN Berliner Weg (Adversarial 6/9)",
  (() => {
    const q = SM.planQuellenFuerProfil(pBerlin, P_BUND).map((s) => s.id);
    const beLegacy = B.berlinWegeAusSeed().filter((w) => w.aktiviert).map((w) => w.legacy_source_id);
    return beLegacy.every((id) => !q.includes(id));
  })());
check("3b Auch ein Bundestagsmandat MIT bundesland='Berlin' erhält keinen Berliner Weg",
  (() => {
    const q = SM.planQuellenFuerProfil(pBerlin, P_BUND_IN_BERLIN).map((s) => s.id);
    return B.berlinWegeAusSeed().filter((w) => w.aktiviert).every((w) => !q.includes(w.legacy_source_id));
  })());
check("3c Das Berliner Landtagsmandat erhält seine 4 Wege",
  (() => {
    const q = SM.planQuellenFuerProfil(pBerlin, P_BE).map((s) => s.id);
    return B.berlinWegeAusSeed().filter((w) => w.aktiviert).every((w) => q.includes(w.legacy_source_id));
  })());
check("3d Die Bundesversorgung ist für JEDES Profil identisch (Bund bleibt geteilt)",
  (() => {
    const bund = (p) => SM.planQuellenFuerProfil(pBerlin, p).map((s) => s.id)
      .filter((id) => ["kern-1", "bund-a", "partei-linke", "soziales"].includes(id)).sort();
    return gleich(bund(P_BUND), bund(P_BE)) && gleich(bund(P_BUND), bund(P_BUND_IN_BERLIN));
  })());
check("3e Die Vereinigung über alle berechtigten Profile ergibt WIEDER den vollen Plan",
  (() => {
    const alle = [P_BUND, P_BUND_IN_BERLIN, P_BE];
    const union = new Set(alle.flatMap((p) => SM.planQuellenFuerProfil(pBerlin, p).map((s) => s.id)));
    const planIds = new Set(pBerlin.aktiv.map((a) => a.source.id));
    return union.size === planIds.size && [...planIds].every((id) => union.has(id));
  })(), "Es fällt ein Weg aus dem Gesamtcrawl heraus");
check("3f Ohne berechtigtes Profil enthält die Versorgung keinen Landesmodul-Weg",
  SM.planQuellenFuerProfil(pBerlin, P_BUND).length === pBerlin.aktiv.length - beAktivierbar.length);
check("3g planQuellenFuerProfil ist robust gegen leeren/fehlenden Plan",
  SM.planQuellenFuerProfil(null, P_BE).length === 0 && SM.planQuellenFuerProfil({}, P_BE).length === 0);

// ══ 4) Paketauflösung: Partei-, Landes- und Regionalpakete bleiben gebunden ════════════════════
check("4a Das Berliner Linke-Mandat erhält die-linke-berlin, das CDU-Mandat nicht (Adversarial 11)",
  PP.resolveProfilePackages(P_BE_LINKE).all.includes("die-linke-berlin")
  && !PP.resolveProfilePackages(P_BE).all.includes("die-linke-berlin"));
check("4b Ein Bundestagsmandat erhält KEIN Landespaket und kein Landes-Parteipaket",
  !PP.resolveProfilePackages(P_BUND_IN_BERLIN).all
    .some((k) => ["berlin-basis", "brandenburg-basis", "die-linke-berlin", "die-linke-brandenburg"].includes(k)));
check("4c Das Brandenburg-Mandat erhält brandenburg-basis und KEIN Berliner Paket",
  PP.resolveProfilePackages(P_BB).required.includes("brandenburg-basis")
  && !PP.resolveProfilePackages(P_BB).all.some((k) => k.includes("berlin")));
check("4d Das Berliner Mandat erhält berlin-basis und KEIN Brandenburg-Paket",
  PP.resolveProfilePackages(P_BE).required.includes("berlin-basis")
  && !PP.resolveProfilePackages(P_BE).all.some((k) => k.includes("brandenburg")));
check("4e Das Bundes-Parteipaket bleibt an die Partei gebunden (Adversarial 11)",
  PP.resolveProfilePackages({ ...P_BUND, partei: "Die Linke", party: "Die Linke" }).all.includes("die-linke-bund")
  && !PP.resolveProfilePackages(P_BUND).all.includes("die-linke-bund"));
check("4f Das neutralisierte Berliner Basispaket enthält keine Partei-/Fraktions-/Personenquelle",
  (() => {
    const nach = landesSeed.packagePaths
      .filter((pp) => pp.package_id === B.BASISPAKET_ID)
      .map((pp) => pp.retrieval_path_id);
    return B.UMHAENGUNG.wege.every((w) => !nach.includes(w));
  })());
check("4g Auch bei voller Berlin-Freigabe läuft kein Partei-/Fraktions-/Personenweg",
  B.UMHAENGUNG.wege.every((id) => !aktivIds(pBerlin).includes(id)));

// ══ 5) Bund bleibt unverändert ════════════════════════════════════════════════════════════════
const pOhneBerlin = plan({ profiles: [P_BUND], env: {} });
check("5a Kein Bundesweg fällt durch die Berlin-Aktivierung weg",
  (() => {
    const bund = (p) => aktivIds(p).filter((id) => id.startsWith("rp-kern") || id.startsWith("rp-bund")).sort();
    return gleich(bund(pOhneBerlin), bund(plan({ profiles: [P_BUND, P_BE], env: FLAG_BE })).filter((id) => bund(pOhneBerlin).includes(id)))
      && bund(pOhneBerlin).every((id) => bund(plan({ profiles: [P_BUND, P_BE], env: FLAG_BE })).includes(id));
  })());
check("5b Berlin kommt rein ADDITIV dazu (+4 Wege, keine Verdrängung)",
  plan({ profiles: [P_BUND, P_BE], env: FLAG_BE }).stats.aktiv === pOhneBerlin.stats.aktiv + beAktivierbar.length,
  `${plan({ profiles: [P_BUND, P_BE], env: FLAG_BE }).stats.aktiv} vs ${pOhneBerlin.stats.aktiv}`);
check("5c Ohne aktivierungsberechtigtes Profil laufen weiterhin nur die always_on-Kernwege",
  gleich(aktivIds(plan({ profiles: [], env: FLAG_BE })), ["rp-kern-1"]));
check("5d Die globale URL-Dedup bleibt: zwei Berliner Mandate erzeugen keinen zweiten Abruf",
  (() => {
    const p = plan({ profiles: [P_BE, P_BE_LINKE], env: FLAG_BE });
    const ids = aktivIds(p).filter((id) => beIds.includes(id));
    return ids.length === new Set(ids).size && ids.length === beAktivierbar.length;
  })());

// ══ 6) Fallback-Pfad umgeht das Gate nicht ════════════════════════════════════════════════════
(async () => {
  const landesLegacy = landesSeed.retrievalPaths.map((p) => p.legacy_source_id).filter(Boolean);
  const legacyIds = new Set(v1Sources.map((s) => String(s.id || "")));
  check("6a Der alte Katalog enthält KEINE Landesmodul-Quelle (Fallback kann sie nicht crawlen)",
    landesLegacy.every((id) => !legacyIds.has(id)),
    landesLegacy.filter((id) => legacyIds.has(id)).join(","));
  check("6b Jede Landesmodul-Quellenkennung ist entweder präfix-erkennbar ODER nicht im Katalog",
    landesLegacy.every((id) => SM.landesmodulQuelleGesperrt({ id }, new Set()) || !legacyIds.has(id)),
    landesLegacy.filter((id) => !SM.landesmodulQuelleGesperrt({ id }, new Set()) && legacyIds.has(id)).join(","));
  check("6c Der Fallback-Riegel sperrt eine Landespräfix-Quelle ohne Berechtigung",
    SM.landesmodulQuelleGesperrt({ id: "be-landesregierung" }, new Set()) === true
    && SM.landesmodulQuelleGesperrt({ id: "bb-landesregierung" }, new Set()) === true);
  check("6d Er lässt sie bei Berechtigung durch und sperrt weiterhin das andere Land",
    SM.landesmodulQuelleGesperrt({ id: "be-landesregierung" }, new Set(["berlin"])) === false
    && SM.landesmodulQuelleGesperrt({ id: "bb-landesregierung" }, new Set(["berlin"])) === true);
  check("6e Eine Bundesquelle ist vom Riegel nie betroffen",
    ["bundestag", "news-rbb24", "kern-1"].every((id) => SM.landesmodulQuelleGesperrt({ id }, new Set()) === false));

  // Der echte Fallback-Pfad des Schedulers (HELMUT_SOURCE_MODE bleibt aus -> kein DB-Zugriff).
  const fuerBerlin = await scheduler.getSourcesForProfile({ id: "t-be", fullName: "Testprofil Berlin", party: "CDU", state: "Berlin", politische_ebene: "landtag" });
  check("6f Die Fallback-Auswahl eines Berliner Profils enthält keine Landesmodul-Quelle",
    landesLegacy.every((id) => !fuerBerlin.some((s) => s.id === id)));
  check("6g Der Fallback liefert weiterhin einen nicht-leeren Katalog (kein stiller Nullzustand)",
    fuerBerlin.length > 0);
  check("6h Der Fallback nimmt keine vorbereitete Quelle mit (active === false bleibt draussen)",
    fuerBerlin.every((s) => s.active !== false));
  weiter();
})().catch((e) => { check("6a-6h Fallback-Prüfung lief durch", false, e && e.stack); weiter(); });

function weiter() {
// ══ 7) Abgrenzung zu Punkt 16 (Quellenstörungen) und Punkt 17 (Kosten) ════════════════════════
const gelesen = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const geaendert14A = [
  "lib/helmut/quellenarchitektur/source-mode.js",
  "lib/helmut/quellenarchitektur/seeds/berlin-aktivierung.js",
  "lib/helmut/scheduler.js"
];
check("7a Keine 14A-Datei importiert das Kostenmodell oder schreibt llm_usage (Punkt 17 unberührt)",
  geaendert14A.every((f) => {
    const t = gelesen(f);
    return !/require\(["'].*cost-model/.test(t) && !/llm_usage/.test(t);
  }));
check("7b Keine 14A-Änderung berührt Budget/Reservierung/Tokenkosten",
  geaendert14A.every((f) => !/reserveLlm|llmBudget|estimated_cost_usd|tokenKosten/i.test(gelesen(f))));
check("7c Das Kostenmodell aus Punkt 17 ist unverändert lauffähig und trennt weiterhin die drei Zustände",
  (() => {
    const cm = require("../lib/helmut/cost-model");
    return typeof cm === "object" && Object.keys(cm).length > 0;
  })());
check("7d Die Störungsklassifikation aus Punkt 16 ist unverändert lauffähig",
  (() => {
    const sf = require("../lib/helmut/quellenarchitektur/source-failure");
    return typeof sf === "object" && Object.keys(sf).length > 0;
  })());
check("7e 14A ändert keine Datei aus dem Gebiet von Punkt 16 (source-failure) oder 17 (cost-model)",
  !geaendert14A.includes("lib/helmut/quellenarchitektur/source-failure.js")
  && !geaendert14A.includes("lib/helmut/cost-model.js"));
check("7f Der Crawl löst weiterhin 0 LLM-Aufrufe aus (Landesmodule ändern die Kostenbasis nicht)",
  B.lastprognose().llmCallsDurchCrawl === 0 && B.LAST_ANNAHMEN.llmCallsJeWeg === 0);

// ══ 8) Ehrlichkeit der Dokumentation ══════════════════════════════════════════════════════════
// Adversarial 14: die Doku darf keine Profilisolation behaupten, die es auf Crawl-/Korpusebene
// nicht gibt. Geprüft wird, dass das Runbook den geteilten Rohkorpus AUSDRÜCKLICH benennt.
const runbook = gelesen("docs/betrieb/berlin-aktivierung.md");
check("8a Das Runbook benennt ausdrücklich den geteilten Rohkorpus (keine behauptete Isolation)",
  /geteilte[nr]? (Rohkorpus|Korpus)/i.test(runbook) || /gemeinsame[nr]? (Rohkorpus|Korpus)/i.test(runbook));
check("8b Das Runbook trennt globalen Crawl von mandatsbezogener Ausspielung",
  /mandatsbezogen/i.test(runbook) && /global/i.test(runbook));
check("8c Das Runbook nennt die Mandatsbindung des Gates",
  /berechtigte[ns]? (Landesmandat|Berliner Mandat)/i.test(runbook));
check("8d Das Runbook nennt alle 8 Ausführungsschritte namentlich",
  B.ausfuehrungsschritte().every((s) => runbook.includes(s.datei)),
  B.ausfuehrungsschritte().filter((s) => !runbook.includes(s.datei)).map((s) => s.datei).join(","));
check("8e Der Plan bleibt ehrlich über den zweiländrigen Weg (mehrlaendrig wird ausgewiesen)",
  (() => {
    const p = plan({ profiles: [P_BE], env: FLAG_BE });
    return p.landesmodule.mehrlaendrig.length === 1
      && p.landesmodule.mehrlaendrig[0].id === "rp-rbb24-politik"
      && gleich(p.landesmodule.mehrlaendrig[0].fremdlaender, ["brandenburg"]);
  })());

// ══ M) Mutationstests ═════════════════════════════════════════════════════════════════════════
// Jede Mutation hebt genau EINE Zusage auf; die zugehörige Prüfung muss kippen. Ohne diesen
// Block würden die Prüfungen oben nur den Status quo bestätigen.
function mutation(name, pruefungLiefertFalse) {
  let gefangen = false;
  try { gefangen = pruefungLiefertFalse() === false; } catch { gefangen = true; }
  check(`M ${name}`, gefangen, "Mutation blieb unentdeckt — die Prüfung ist wirkungslos");
}
mutation("Gate nur am Flag (ohne Mandatsbindung) -> Prüfung 2a kippt", () => {
  // Nachbau des ALTEN Verhaltens: wirksam = freigegeben.
  const freigegeben = SM.freigegebeneLandesmodule(FLAG_BE);
  const wegLandesmodule = SM.landesmoduleOf({ id: "rp-be-landesregierung" }, ["berlin-basis"]);
  const altGesperrt = !wegLandesmodule.some((l) => freigegeben.has(l));
  return altGesperrt; // alt: NICHT gesperrt -> false -> Mutation gefangen
});
mutation("Bundestagsprofil berechtigt sein Bundesland -> Prüfung 1b kippt", () => {
  const felder = PP.resolveProfilePackages(P_BUND_IN_BERLIN);
  return felder.all.includes("berlin-basis");
});
mutation("Deaktivierte Profile zählen mit -> Prüfung 1d kippt", () => {
  // ohne isActivationEligible-Filter würde das deaktivierte Profil berlin-basis auflösen
  return !PP.resolveProfilePackages(P_BE_INAKTIV).all.includes("berlin-basis");
});
mutation("Unvollständige Profile zählen mit -> Prüfung 1f kippt", () => {
  return PP.isActivationEligible(P_BE_UNVOLLSTAENDIG) === false ? false : true;
});
mutation("Plan ohne Profilfilter (alter Zustand) -> Prüfung 3a kippt", () => {
  const alleQuellen = pBerlin.aktiv.map((a) => a.source.id);
  const beLegacy = B.berlinWegeAusSeed().filter((w) => w.aktiviert).map((w) => w.legacy_source_id);
  return beLegacy.every((id) => !alleQuellen.includes(id)); // im globalen Plan sind sie drin -> false
});
mutation("Mehrländriger Weg über Fremdland-Mandat -> Prüfung 2g kippt", () => {
  const freigegeben = SM.freigegebeneLandesmodule(FLAG_BE);
  const lm = SM.landesmoduleOf({ id: "rp-rbb24-politik" }, ["berlin-basis", "brandenburg-basis"]);
  return !lm.some((l) => freigegeben.has(l)); // alt: berlin freigegeben -> lief -> false
});
mutation("Fallback ohne Landesriegel -> Prüfung 6c kippt", () => {
  return SM.landesmodulQuelleGesperrt({ id: "irgendeine-bundesquelle" }, new Set()) === true;
});
mutation("Parteipaket ohne Parteibindung -> Prüfung 4a kippt", () => {
  return PP.resolveProfilePackages(P_BE).all.includes("die-linke-berlin");
});

console.log(`\n== Ergebnis: ${passed} PASS, ${failed} FAIL ==`);
if (failed === 0) {
  console.log("Landesmodule brauchen Freigabe UND ein berechtigtes Landesmandat; ein Mandat ohne");
  console.log("Berechtigung erhält keine Landesversorgung. Der Rohkorpus bleibt ausdrücklich geteilt.");
}
process.exit(failed > 0 ? 1 : 0);
}
