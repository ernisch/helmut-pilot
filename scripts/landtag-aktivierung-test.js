"use strict";

// Landtag-Sprint Phase 7/8 — BEWEIS: Landtagsaktivierung erfolgt AUSSCHLIESSLICH ueber
// Konfiguration (Flag HELMUT_LANDESMODULE) + Daten (Paketstatus, Profile) — ohne neue
// Kernlogik. REINE LOGIK, kein Netz/DB/LLM: alle Zeilen werden injiziert.
//
// Beweispunkte (Sprint-Auftrag Phase 8):
//   A  Bundestag funktioniert unveraendert (Default: Plan identisch, DIP aktiv fuer Bund).
//   B  Ohne Freigabe ist KEINE BE/BB-Quelle aktivierbar — auch nicht bei Paket 'active'.
//   C  Freigabe Berlin (nur Konfiguration+Daten) -> Berlin-Wege im Plan, Brandenburg NICHT.
//   D  Berlin erhaelt keine Brandenburg-Inhalte und umgekehrt (Plan- und Paketebene).
//   E  DIP wird nicht automatisch fuer Landtagsprofile genutzt (und der DIP-api-Weg
//      bleibt in JEDER Konstellation vom Quellen-Crawl ausgeschlossen).
//   F  prepared-Pakete aktivieren NIE (Datenlage-Sperre wirkt unabhaengig vom Gate).

const { buildRelationalCrawlPlan } = require("../lib/helmut/quellenarchitektur/source-mode");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { freigegebeneLandesmodule, LANDESMODULE } = require("../lib/helmut/quellenarchitektur/landesmodule");
const { usesDip } = require("../lib/helmut/parlamente");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

// --- Testdaten: realer BE/BB-Seed + synthetischer Bund-Bestand ---------------------------------
const lm = buildLandesmodulSeed();
const bundPath = { id: "rp-bund-tagesschau", legacy_source_id: "tagesschau", name: "Tagesschau", method: "rss", url: "https://www.tagesschau.de/xml/rss2/", status: "healthy", activation_mode: "always_on", priority: 90 };
const dipPath = { id: "rp-dip", legacy_source_id: "dip", name: "DIP Bundestag", method: "api", url: "https://search.dip.bundestag.de/api/v1", status: "healthy", activation_mode: "always_on", priority: 95 };
const paths = [bundPath, dipPath, ...lm.retrievalPaths];
const bundPaket = { id: "pkg-bund-basis", key: "bund-basis", status: "active", is_base: true };
const packagesPrepared = [bundPaket, ...PACKAGE_DEFINITIONS.filter((p) => ["berlin-basis", "brandenburg-basis"].includes(p.key))];
const packagePaths = [
  { package_id: "pkg-bund-basis", retrieval_path_id: "rp-bund-tagesschau" },
  ...lm.packagePaths
];

const btProfil = { id: "bt-1", fullName: "Testprofil Bund", party: "SPD", committees: ["Arbeit und Soziales"], state: "Niedersachsen", politische_ebene: "bundestag", profileActive: true };
const beProfil = { id: "be-1", fullName: "Testprofil Berlin", party: "SPD", committees: ["Hauptausschuss"], state: "Berlin", politische_ebene: "landtag", profileActive: true };
const bbProfil = { id: "bb-1", fullName: "Testprofil Brandenburg", party: "CDU", committees: ["Hauptausschuss"], state: "Brandenburg", politische_ebene: "landtag", profileActive: true };

function plan({ freigabe, packages, profiles }) {
  return buildRelationalCrawlPlan({
    retrievalPaths: paths, packages, packagePaths,
    profiles, legacySources: [], landesmoduleFreigabe: freigabe
  });
}
const istLandweg = (id) => id.startsWith("rp-be-") || id.startsWith("rp-bb-") || id === "rp-rbb24-politik";
const aktiveLandwege = (p) => p.aktiv.map((x) => x.id).filter(istLandweg);

// --- A: Bundestag unveraendert -----------------------------------------------------------------
const planDefault = plan({ freigabe: [], packages: packagesPrepared, profiles: [btProfil] });
check("A1 Default (keine Freigabe): Bund-Weg aktiv, ALLE BE/BB-Wege ausgeschlossen",
  planDefault.aktiv.some((x) => x.id === "rp-bund-tagesschau") && aktiveLandwege(planDefault).length === 0);
check("A2 Ausschlussgrund unveraendert: 'landesmodul-gesperrt (Berlin/Brandenburg nur mit eigener Freigabe)'",
  planDefault.ausgeschlossen.filter((x) => x.grund.startsWith("landesmodul-gesperrt")).length === lm.retrievalPaths.length);
check("A3 DIP-api-Weg bleibt eigener Pfad (nie im Quellen-Crawl)",
  planDefault.ausgeschlossen.some((x) => x.id === "rp-dip" && /eigenstaendiger-api-pfad/.test(x.grund)));
check("A4 DIP aktiv fuer Bundestagsprofil (usesDip=true, unveraendert)", usesDip(btProfil) === true);

// --- B: Ohne Freigabe sperrt das Gate auch bei Paket 'active' ----------------------------------
const packagesAktiv = packagesPrepared.map((p) => ({ ...p, status: "active" }));
const planOhneFreigabeAktiv = plan({ freigabe: [], packages: packagesAktiv, profiles: [btProfil, beProfil, bbProfil] });
check("B1 Paket active + Landtagsprofile, aber KEINE Freigabe -> weiterhin 0 BE/BB-Wege",
  aktiveLandwege(planOhneFreigabeAktiv).length === 0);

// --- C: Aktivierung NUR ueber Konfiguration+Daten (Freigabe berlin + Paket active + Profil) ----
const planBerlin = plan({ freigabe: ["berlin"], packages: packagesAktiv, profiles: [btProfil, beProfil] });
const aktiveBerlin = aktiveLandwege(planBerlin);
check("C1 Freigabe berlin + Paket active + BE-Profil -> Berlin-Wege laufen (inkl. rbb24)",
  aktiveBerlin.some((id) => id.startsWith("rp-be-")) && aktiveBerlin.includes("rp-rbb24-politik"));
check("C2 Brandenburg bleibt dabei VOLLSTAENDIG ausgeschlossen (kein rp-bb-*)",
  aktiveBerlin.every((id) => !id.startsWith("rp-bb-"))
  && planBerlin.ausgeschlossen.filter((x) => x.id.startsWith("rp-bb-")).every((x) => x.grund.startsWith("landesmodul-gesperrt")));
check("C3 Bund-Betrieb unveraendert unter Berlin-Freigabe (Bund-Weg aktiv, DIP weiter ausgeschlossen)",
  planBerlin.aktiv.some((x) => x.id === "rp-bund-tagesschau")
  && planBerlin.ausgeschlossen.some((x) => x.id === "rp-dip"));

// --- D: Spiegelbild Brandenburg + beidseitige Isolation -----------------------------------------
const planBB = plan({ freigabe: ["brandenburg"], packages: packagesAktiv, profiles: [btProfil, bbProfil] });
check("D1 Freigabe brandenburg -> BB-Wege laufen, Berlin-eigene (rp-be-*) NICHT",
  aktiveLandwege(planBB).some((id) => id.startsWith("rp-bb-"))
  && aktiveLandwege(planBB).every((id) => !id.startsWith("rp-be-")));
check("D2 Paket-Isolation: Berlin-Profil referenziert nie brandenburg-basis (und umgekehrt)",
  (() => {
    const { resolveProfilePackages } = require("../lib/helmut/quellenarchitektur/profile-packages");
    return !resolveProfilePackages(beProfil).all.includes("brandenburg-basis")
      && !resolveProfilePackages(bbProfil).all.includes("berlin-basis");
  })());

// --- E: DIP nicht automatisch fuer Landtag ------------------------------------------------------
check("E1 usesDip=false fuer Landtagsprofile (BE und BB)", usesDip(beProfil) === false && usesDip(bbProfil) === false);
check("E2 auch unter Voll-Freigabe bleibt der DIP-api-Weg vom Quellen-Crawl ausgeschlossen",
  plan({ freigabe: ["berlin", "brandenburg"], packages: packagesAktiv, profiles: [beProfil, bbProfil] })
    .ausgeschlossen.some((x) => x.id === "rp-dip"));

// --- F: prepared-Pakete aktivieren nie (Datenlage-Sperre unabhaengig vom Gate) -----------------
const planPreparedTrotzFreigabe = plan({ freigabe: ["berlin", "brandenburg"], packages: packagesPrepared, profiles: [beProfil, bbProfil] });
check("F1 Freigabe OHNE Paket-Flip (prepared) -> weiterhin 0 aktive BE/BB-Wege (kein-aktives-paket)",
  aktiveLandwege(planPreparedTrotzFreigabe).length === 0
  && planPreparedTrotzFreigabe.ausgeschlossen.some((x) => x.id.startsWith("rp-be-") && /kein-aktives-paket/.test(x.grund)));

// --- G: Flag-Mechanik fail-closed ---------------------------------------------------------------
check("G1 freigegebeneLandesmodule: leer/unbekannt/Falschwerte -> leere Menge (fail-closed)",
  freigegebeneLandesmodule({ HELMUT_LANDESMODULE: "" }).size === 0
  && freigegebeneLandesmodule({ HELMUT_LANDESMODULE: "sachsen,alle,true,1" }).size === 0
  && freigegebeneLandesmodule({}).size === 0);
check("G2 freigegebeneLandesmodule: nur Registry-Schluessel wirken",
  [...freigegebeneLandesmodule({ HELMUT_LANDESMODULE: "berlin, sachsen ,brandenburg" })].sort().join(",") === "berlin,brandenburg"
  && Object.keys(LANDESMODULE).sort().join(",") === "berlin,brandenburg");

console.log(`\n== Landtag-Aktivierungspfad-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
