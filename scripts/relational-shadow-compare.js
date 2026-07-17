"use strict";

// P8 — Relationaler Shadow-Vergleich gegen ECHTE Produktionsdaten (read-only, isoliert).
// =============================================================================================
// Vergleicht den alten (Live-)Crawl-Plan mit dem relationalen Crawl-Plan auf Basis eines
// Production-Snapshots (retrieval_paths/source_packages/package_paths + Blob-Quellen +
// Blob-Profile) und bewertet die AUSFÜHRUNG über die echten 30-Tage-Erträge je Quelle
// (raw_documents/ko_document_links) — der Alt-Plan LIEF real; identische Abruf-URLs
// (legacy_source_id-Mapping) machen den Bestandsertrag zum Ausführungsnachweis des
// relationalen Plans, ohne einen einzigen Produktions-Write.
//
// Aufruf:  node scripts/relational-shadow-compare.js <snapshot-dir> [mandats-id]
//   erwartet: retrieval_paths.json, source_packages.json, package_paths.json,
//             blob_sources.json, blob_profiles.json, ertrag30.json
//   mandats-id (optional): Profil fuer die Mandats-Sicht; ohne Angabe das erste
//   Profil im Snapshot (KEIN Mandant ist im Code hinterlegt).
// Ausgabe:  kompakter Bericht (stdout) + <snapshot-dir>/vergleich.json

const fs = require("fs");
const path = require("path");
const { buildRelationalCrawlPlan, comparePlans } = require("../lib/helmut/quellenarchitektur/source-mode");
const { resolveProfilePackages, profileSupplyStatus } = require("../lib/helmut/quellenarchitektur/profile-packages");

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error("Nutzung: node scripts/relational-shadow-compare.js <snapshot-dir>");
  process.exit(2);
}
const load = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));

const retrievalPaths = load("retrieval_paths.json");
const packages = load("source_packages.json");
const packagePaths = load("package_paths.json");
const legacySources = load("blob_sources.json");
const profiles = load("blob_profiles.json");
const ertrag = load("ertrag30.json");

// --- Pläne bauen ---------------------------------------------------------------------------
const plan = buildRelationalCrawlPlan({ retrievalPaths, packages, packagePaths, profiles, legacySources });
const cmp = comparePlans({ legacySources, relationalPlan: plan });

// --- Ertrag je legacy_source_id aggregieren (source_id in raw_documents = Legacy-ID) --------
const ertragBySource = new Map();
for (const e of ertrag) {
  const key = e.source_id || e.source_name;
  if (!key) continue;
  const agg = ertragBySource.get(key) || { docs30: 0, eindeutig30: 0, koKandidaten: 0, mitFingerprint: 0, letzterAbruf: null };
  agg.docs30 += Number(e.docs30) || 0;
  agg.eindeutig30 += Number(e.eindeutig30) || 0;
  agg.koKandidaten += Number(e.ko_kandidaten) || 0;
  agg.mitFingerprint += Number(e.mit_fingerprint) || 0;
  if (!agg.letzterAbruf || String(e.letzter_abruf) > agg.letzterAbruf) agg.letzterAbruf = String(e.letzter_abruf || "");
  ertragBySource.set(key, agg);
}
const yieldOf = (legacyId) => ertragBySource.get(legacyId) || { docs30: 0, eindeutig30: 0, koKandidaten: 0, mitFingerprint: 0, letzterAbruf: null };

// --- Versorgungsvergleich: Ertrag der aktiven Alt-Quellen vs. vom relationalen Plan abgedeckt
const legacyShared = legacySources.filter((s) => s && s.type !== "person" && s.active !== false);
const relCoveredIds = new Set(plan.aktiv.map((p) => p.legacy_source_id).filter(Boolean));
const defektIds = new Set(plan.defekt.map((d) => {
  const p = retrievalPaths.find((rp) => rp.id === d.id);
  return p && p.legacy_source_id;
}).filter(Boolean));

let altDocs = 0, relDocs = 0, altKo = 0, relKo = 0;
const fehlendMitErtrag = [];
for (const s of legacyShared) {
  const y = yieldOf(s.id);
  altDocs += y.docs30; altKo += y.koKandidaten;
  if (relCoveredIds.has(s.id)) { relDocs += y.docs30; relKo += y.koKandidaten; }
  else if (y.docs30 > 0) fehlendMitErtrag.push({ id: s.id, name: s.name, docs30: y.docs30, koKandidaten: y.koKandidaten, defektImRelationalen: defektIds.has(s.id) });
}

// --- Mandats-Sicht ---------------------------------------------------------------------------
// Mandat per CLI-Arg waehlbar; sonst das erste Profil im Snapshot. Kein Mandant im Code.
const wantedId = String(process.argv[3] || "").trim().toLowerCase();
const mandat = (wantedId && profiles.find((p) => String(p.id || p.politicianId || "").toLowerCase() === wantedId)) || profiles[0] || {};
const mandatId = mandat.id || mandat.politicianId || "(kein Profil im Snapshot)";
const mandatPakete = resolveProfilePackages(mandat);
const packageByKey = new Map(packages.map((p) => [p.key, p]));
const mandatPaketStatus = mandatPakete.all.map((key) => {
  const pk = packageByKey.get(key);
  const wege = pk ? packagePaths.filter((l) => l.package_id === pk.id).length : 0;
  const aktiveWege = pk ? plan.aktiv.filter((p) => p.packageKeys.includes(key)).length : 0;
  return { paket: key, dbStatus: pk ? pk.status : "FEHLT-IN-DB", wege, aktiveWege };
});
const supply = profileSupplyStatus(mandat, { packages });

// --- Fundstellen/Dedup-Status (ehrlich) ------------------------------------------------------
const fingerprintDocs = [...ertragBySource.values()].reduce((s, y) => s + y.mitFingerprint, 0);

const bericht = {
  erstellt: null, // wird vom Aufrufer gestempelt (kein Date.now in Workflows noetig; hier Skript: unten gesetzt)
  planStats: plan.stats,
  aktivierung: plan.aktivierung,
  vergleich: cmp,
  ertragsVergleich: {
    hinweis: "Ausführungsnachweis über echte 30-Tage-Erträge des Alt-Plans (identische Abruf-URLs via legacy_source_id). Live-Fetch aus der Arbeitsumgebung netzwerkseitig gesperrt.",
    altAktiveQuellen: legacyShared.length,
    altDocs30: altDocs, altKoKandidaten30: altKo,
    relationalAbgedeckteDocs30: relDocs, relationalKoKandidaten30: relKo,
    abdeckungDocsProzent: altDocs ? Math.round((relDocs / altDocs) * 1000) / 10 : 100,
    abdeckungKoProzent: altKo ? Math.round((relKo / altKo) * 1000) / 10 : 100,
    fehlendMitErtrag
  },
  mandat: { id: mandatId, pakete: mandatPakete, paketStatus: mandatPaketStatus, versorgung: supply },
  dedupFundstellen: {
    docsMitFingerprint30Tage: fingerprintDocs,
    hinweis: fingerprintDocs === 0 ? "content_fingerprint/document_findings in Production noch unbefüllt — Schreibpfad ist Teil des Cutovers (P9-Shadow-Nachweis separat)." : "Fingerprints teilweise befüllt."
  },
  defekteWege: plan.defekt,
  ausgeschlossen: {
    landesmodul: plan.ausgeschlossen.filter((a) => /landesmodul/.test(a.grund)).map((a) => a.id),
    dip: plan.ausgeschlossen.filter((a) => /dip/i.test(a.grund)).map((a) => a.id),
    keinAktivesPaket: plan.ausgeschlossen.filter((a) => /kein-aktives-paket/.test(a.grund)).length,
    doppelt: plan.ausgeschlossen.filter((a) => /doppelter/.test(a.grund)).map((a) => a.id),
    sonstige: plan.ausgeschlossen.filter((a) => !/landesmodul|dip|kein-aktives-paket|doppelter/i.test(a.grund))
  }
};
bericht.erstellt = new Date().toISOString();

fs.writeFileSync(path.join(dir, "vergleich.json"), JSON.stringify(bericht, null, 2));

// --- Kompakte Konsole -------------------------------------------------------------------------
console.log("== P8 Relationaler Shadow-Vergleich (Production-Snapshot, read-only) ==");
console.log(`Wege gesamt=${plan.stats.wegeGesamt} aktiv=${plan.stats.aktiv} defekt=${plan.stats.defekt} ausgeschlossen=${plan.stats.ausgeschlossen}`);
console.log(`Aktive Profile=${plan.aktivierung.aktiveProfile} aktive Pakete=${plan.aktivierung.aktivePakete}`);
console.log(`Alt-Plan: ${cmp.quellenzahl.alt} geteilte Quellen · relational aktiv: ${cmp.quellenzahl.relationalAktiv}`);
console.log(`Fehlend im Relationalen: ${cmp.fehlendImRelationalen.length} · zusätzlich: ${cmp.zusaetzlichImRelationalen.length} · Alt-URL-Duplikate: ${cmp.doppelteImLegacy.length}`);
console.log(`Ertrag 30 Tage: alt=${altDocs} docs / ${altKo} KO-Kandidaten · relational abgedeckt=${relDocs} docs (${bericht.ertragsVergleich.abdeckungDocsProzent}%) / ${relKo} KO (${bericht.ertragsVergleich.abdeckungKoProzent}%)`);
console.log(`Fehlende Wege MIT realem Ertrag: ${fehlendMitErtrag.length}${fehlendMitErtrag.length ? " -> " + fehlendMitErtrag.map((f) => `${f.id}(${f.docs30}d${f.defektImRelationalen ? ",defekt" : ""})`).join(", ") : ""}`);
console.log(`Mandats-Pakete (${mandatId}): ${mandatPakete.all.join(", ")}`);
for (const st of mandatPaketStatus) console.log(`  - ${st.paket}: db=${st.dbStatus} wege=${st.wege} aktiv=${st.aktiveWege}`);
console.log(`BE/BB gesperrt: ${bericht.ausgeschlossen.landesmodul.join(", ") || "-"} · DIP separat: ${bericht.ausgeschlossen.dip.join(", ") || "-"}`);
console.log(`Defekt (kein Abruf): ${plan.defekt.map((d) => d.id).join(", ") || "-"}`);
console.log(`Bericht: ${path.join(dir, "vergleich.json")}`);
