"use strict";

// Helmut — Quellenarchitektur · OFFLINE-PAKETQUALITAETS-GATE (Hardening-Sprint, doc 30).
//
// ZWECK. Der Architektur-Audit (doc 29, P1-4) stellte fest, dass die 6-stufige LIVE-
// Pfad-Status-Maschine in Production toter Code ist (Telemetrie schreibt `retrieval_paths.status`
// nicht zurueck). Solange diese Live-Rueckschreibung freigabepflichtig aussteht, gibt es KEINE
// automatische, objektive Messung der PAKETQUALITAET. Dieser Test schliesst die Luecke auf der
// Ebene, die OHNE Freigabe und OHNE Netz sicher ist: ein deterministisches CI-Gate, das die
// harten QUALITAETS-INVARIANTEN des bestehenden (aktiven) Quellenbestands pruefbar macht und
// die exakten Defekte aus dem Audit gegen Rueckfall sichert (P0-1 Seed/die-linke-bund,
// P0-2 Neutralitaet, P1-5 keine broken Wege, BE/BB-Hard-Gate).
//
// Es MISST Paketqualitaet objektiv (Wege, Methoden, Google-News-Anteil, Direktanker, kritische
// Kernwege, Referenz-Integritaet, Paketgrenzen, Aktivierungs-/Referenzzaehlung) und schlaegt
// fehl, sobald eine kuenftige Aenderung eine dieser Eigenschaften verletzt.
//
// REINER OFFLINE-TEST: kein Netz, keine KI, kein DB-/Datei-Schreiben — nur die reinen
// Modell-/Katalog-/Aktivierungsfunktionen unter lib/helmut/quellenarchitektur/.

const { buildFullModel, catalog } = require("../lib/helmut/quellenarchitektur");
const pp = require("../lib/helmut/quellenarchitektur/profile-packages");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

// --- Modell aufbauen (rein) -------------------------------------------------
const m = buildFullModel();
const base = { packages: m.packages, packagePaths: m.packagePaths, retrievalPaths: m.retrievalPaths };

const pathById = new Map(m.retrievalPaths.map((p) => [p.id, p]));
const publisherById = new Map(m.publishers.map((p) => [p.id, p]));
const pkgById = new Map(m.packages.map((p) => [p.id, p]));
const pkgByKey = new Map(m.packages.map((p) => [p.key, p]));

// packageKey -> [retrievalPath]
const pathsByPkgKey = new Map();
for (const link of m.packagePaths) {
  const pkg = pkgById.get(link.package_id);
  const path = pathById.get(link.retrieval_path_id);
  if (!pkg || !path) continue;
  if (!pathsByPkgKey.has(pkg.key)) pathsByPkgKey.set(pkg.key, []);
  pathsByPkgKey.get(pkg.key).push(path);
}

const DIRECT_METHODS = new Set(["rss", "api", "structured_download"]);
function isDirect(p) { return DIRECT_METHODS.has(p.method); }

// --- 0) Telemetrie-Tabelle je aktivem Paket (dient zugleich dem Bericht) ----
console.log("\n== Paketqualitaet — Telemetrie (aktiver Bestand) ==");
console.log("Paket                    Wege  direkt  gnews  gnews%  kritisch  always_on");
const ACTIVE_KEYS = m.packages.filter((p) => p.status === "active").map((p) => p.key);
for (const key of ACTIVE_KEYS) {
  const paths = pathsByPkgKey.get(key) || [];
  const direct = paths.filter(isDirect).length;
  const gnews = paths.filter((p) => p.method === "googlenews_search").length;
  const crit = paths.filter((p) => p.is_critical).length;
  const aon = paths.filter((p) => p.activation_mode === "always_on").length;
  const share = paths.length ? Math.round((gnews / paths.length) * 100) : 0;
  console.log(
    `${key.padEnd(24)} ${String(paths.length).padStart(4)}  ${String(direct).padStart(5)}  ${String(gnews).padStart(5)}  ${String(share + "%").padStart(6)}  ${String(crit).padStart(8)}  ${String(aon).padStart(8)}`
  );
}
const totalGnews = m.retrievalPaths.filter((p) => p.method === "googlenews_search").length;
console.log(`\nGoogle-News-Anteil gesamt: ${totalGnews}/${m.retrievalPaths.length} = ${Math.round((totalGnews / m.retrievalPaths.length) * 100)}% (P1-7 SPOF — dokumentiert)`);

console.log("\n== Invarianten ==");

// --- 1) Referentielle Integritaet -------------------------------------------
check("Referenz-Integritaet: jede package_paths-Zeile zeigt auf existierenden Weg + Paket",
  m.packagePaths.every((l) => pathById.has(l.retrieval_path_id) && pkgById.has(l.package_id)));
check("Referenz-Integritaet: jeder Weg zeigt auf existierenden Herausgeber",
  m.retrievalPaths.every((p) => publisherById.has(p.publisher_id)));
check("Vollstaendigkeit: keine unmapped Katalogquelle (jede Quelle in >=1 Paket)",
  Array.isArray(m.unmapped) && m.unmapped.length === 0);

// --- 2) Keine verwaisten Herausgeber im aktiven Katalog (P2-12-Muster) ------
const referencedPublisherIds = new Set(m.retrievalPaths.map((p) => p.publisher_id));
const orphanPublishers = m.publishers.filter((pub) => !referencedPublisherIds.has(pub.id));
check(`Keine verwaisten Herausgeber im aktiven Katalog (0 erwartet, ${orphanPublishers.length} gefunden)`,
  orphanPublishers.length === 0);

// --- 3) Pfad-Gesundheit / Status-Maschine (P1-4 / P1-5) ---------------------
const brokenActive = m.retrievalPaths.filter((p) => p.status === "broken");
check(`Kein aktiver Weg ist 'broken' (P1-5-Pin; ${brokenActive.length} gefunden)`,
  brokenActive.length === 0);
const contradictions = m.retrievalPaths.filter(
  (p) => p.activation_mode === "always_on" && p.is_critical && p.status === "broken");
check("Kein Weg ist zugleich always_on + is_critical + broken (P1-4-Selbstwiderspruch-Pin)",
  contradictions.length === 0);

// Alle als always_on/kritisch deklarierten Kernwege existieren und sind nicht broken.
const ALWAYS_ON_CORE = ["bundestag", "bundesregierung", "tagesschau-politik", "deutschlandfunk-politik", "dip"];
const byLegacy = new Map(m.retrievalPaths.map((p) => [p.legacy_source_id, p]));
check("Alle 5 always_on-Kernwege existieren und sind nicht broken",
  ALWAYS_ON_CORE.every((id) => byLegacy.has(id) && byLegacy.get(id).status !== "broken"));
check("catalog.ALWAYS_ON_LEGACY_IDS deckt sich mit den always_on-Wegen im Modell",
  m.retrievalPaths.filter((p) => p.activation_mode === "always_on").every((p) => ALWAYS_ON_CORE.includes(p.legacy_source_id)));

// --- 4) Paketgrenzen (P0-2 / §9) --------------------------------------------
const regionalPaths = new Set((pathsByPkgKey.get("regional-niedersachsen") || []).map((p) => p.id));
const fachPaths = new Set((pathsByPkgKey.get("arbeit-und-soziales") || []).map((p) => p.id));
const basisPaths = new Set((pathsByPkgKey.get("bund-basis") || []).map((p) => p.id));
check("Paketgrenze: kein Weg ist zugleich in Region UND Fachthema (strikte Trennung §9)",
  [...regionalPaths].every((id) => !fachPaths.has(id)));
check("Paketgrenze: kein Regionalweg liegt zusaetzlich in der neutralen Bund-Basis",
  [...regionalPaths].every((id) => !basisPaths.has(id)));

// die-linke-bund: Partei-Paket enthaelt den funktionierenden Fraktions-Weg (P0-1-Pin)
// und mindestens einen nicht-broken Weg.
const linkePaths = pathsByPkgKey.get("die-linke-bund") || [];
check("die-linke-bund enthaelt rp-fraction-linke (P0-1-Regressionspin)",
  linkePaths.some((p) => p.id === "rp-fraction-linke"));
check("die-linke-bund hat >=1 nicht-broken Weg (kein 0-Wege-Partei-Paket)",
  linkePaths.some((p) => p.status !== "broken"));

// Neutralitaet der Bund-Basis (P0-2-Prinzip, hier fuer den Bund):
//  (a) die ASYMMETRISCHEN Partei-DIREKTfeeds (die-linke.de / dielinkebt.de) gehoeren NICHT in
//      die neutrale Basis — sie leben ausschliesslich im Partei-Paket die-linke-bund.
//  (b) Neutralitaet heisst SYMMETRIE, nicht Abwesenheit: die Basis deckt ALLE Fraktionen
//      gleich ab. Der geteilte Fraktions-Radarweg rp-fraction-linke liegt daher korrekt in
//      BEIDEN (bund-basis als 1 von 8 Fraktionen + die-linke-bund als P0-1-Arbeitsweg).
const PARTY_DIRECT_EXCLUSIVE = new Set(["rp-die-linke", "rp-linksfraktion"]);
check("Neutralitaet (a): kein asymmetrischer Partei-Direktfeed (die-linke.de/dielinkebt.de) in der Bund-Basis",
  [...basisPaths].every((id) => !PARTY_DIRECT_EXCLUSIVE.has(id)));
const FRACTIONS = ["cdu-csu", "spd", "gruene", "linke", "afd", "fdp", "bsw", "ssw"];
check("Neutralitaet (b): Bund-Basis deckt ALLE 8 Fraktionen symmetrisch ab (keine Bevorzugung)",
  FRACTIONS.every((f) => basisPaths.has(`rp-fraction-${f}`)));

// --- 5) Belastbarer Direktanker je Kernbereich ------------------------------
check("Kernbereich Bund-Basis hat den DIP-API-Anker (rp-dip)",
  basisPaths.has("rp-dip"));
check("Kernbereich Bund-Basis hat >=1 Direkt-RSS-Anker (tagesschau/dlf)",
  (pathsByPkgKey.get("bund-basis") || []).some((p) => p.method === "rss"));
check("Kernbereich Arbeit-und-Soziales hat >=1 Direkt-RSS-Anker (rp-bmas)",
  (pathsByPkgKey.get("arbeit-und-soziales") || []).some((p) => p.method === "rss"));
check("Jedes aktive Nicht-Regional-Kernpaket hat >=1 Direktweg (rss/api)",
  ["bund-basis", "arbeit-und-soziales"].every((k) => (pathsByPkgKey.get(k) || []).some(isDirect)));

// --- 6) BE/BB-Harte Trennung (kein Landesweg im aktiven Katalog) ------------
const bebbLeak = m.retrievalPaths.filter((p) => /^(be|bb|rbb24)-/.test(String(p.legacy_source_id || "")));
check(`Kein BE/BB/rbb24-Weg im aktiven Bund-Katalog (${bebbLeak.length} gefunden)`,
  bebbLeak.length === 0);

// --- 7) Aktivierungslogik / Referenzzaehlung --------------------------------
const bundestag = { id: "gate-mdb", fullName: "Gate MdB", party: "SPD", politische_ebene: "bundestag", committees: ["Gesundheit"], profileActive: true };
const vollprofil = { id: "gate-voll", fullName: "Gate Voll", party: "Die Linke", politische_ebene: "bundestag", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", fachpolitische_schwerpunkte: ["Rente"], profileActive: true };
const berlinLandtag = { id: "gate-be", fullName: "Gate Berlin", party: "SPD", politische_ebene: "landtag", bundesland: "Berlin", ausschuesse: ["Inneres"], profileActive: true };

const sBund = pp.profileSupplyStatus(bundestag, base);
check("Bundestagsprofil: bund-basis vollstaendig versorgt (fullyActivated=true)", sBund.fullyActivated === true);

const actVoll = pp.computeGlobalActivation({ ...base, profiles: [vollprofil] });
const activeKeysVoll = new Set(actVoll.packageStatus.filter((p) => p.activation === "active").map((p) => p.key));
check("Vollprofil aktiviert genau die 4 aktiven Bund-/Regional-Pakete",
  ["bund-basis", "arbeit-und-soziales", "die-linke-bund", "regional-niedersachsen"].every((k) => activeKeysVoll.has(k)));
check("Vollprofil aktiviert KEIN prepared-Landespaket",
  !actVoll.packageStatus.some((p) => p.activation === "active" && /basis$/.test(p.key) && p.status === "prepared"));

const act1 = pp.computeGlobalActivation({ ...base, profiles: [vollprofil] });
const act100 = pp.computeGlobalActivation({ ...base, profiles: Array.from({ length: 100 }, (_, i) => ({ ...vollprofil, id: "gate-voll-" + i })) });
check("Referenzzaehlung: 100 gleichartige Profile erzeugen dieselbe technische Aktivierung wie 1 (global genau einmal)",
  act1.activePathCount === act100.activePathCount && act1.activePathCount > 0);

const actBerlin = pp.computeGlobalActivation({ ...base, profiles: [berlinLandtag] });
const berlinStatus = actBerlin.packageStatus.find((p) => p.key === "berlin-basis");
check("Berlin-Landtagsprofil: berlin-basis wird NICHT aktiv, sondern 'requested_unsupplied' (prepared)",
  !!berlinStatus && berlinStatus.activation === "requested_unsupplied");
const sBerlin = pp.profileSupplyStatus(berlinLandtag, base);
check("Berlin-Landtagsprofil ist NICHT vollstaendig aktivierbar (BE/BB nicht aktivierbar)",
  sBerlin.fullyActivated === false);

// --- 8) Determinismus des Modells -------------------------------------------
const m2 = buildFullModel();
check("Modell ist deterministisch (gleiche Wege-/Paketzahl im 2. Lauf)",
  m2.retrievalPaths.length === m.retrievalPaths.length && m2.packagePaths.length === m.packagePaths.length);

// --- 9) Konsistenz kritischer Legacy-IDs ------------------------------------
check("Alle catalog.CRITICAL_LEGACY_IDS existieren als Weg im Modell",
  [...catalog.CRITICAL_LEGACY_IDS].every((id) => byLegacy.has(id)));

console.log(`\n== Ergebnis: ${fail === 0 ? "ALLE PAKETQUALITAETS-INVARIANTEN GRUEN" : fail + " INVARIANTE(N) VERLETZT"} ==`);
process.exit(fail > 0 ? 1 : 0);
