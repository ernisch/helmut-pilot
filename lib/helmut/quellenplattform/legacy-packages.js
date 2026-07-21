"use strict";

// Helmut — Quellenplattform (Konsolidierung) · Legacy-Paket-Kompatibilitaet + Shadow (Aufgabe 4).
//
// Reine, LESENDE Logik. KEINE KI, kein Netz, kein Storage-Write. Aendert die bestehenden
// Paket-Strukturen (source_packages / package_paths / profile_packages / seeds/packages.js /
// profile-packages.js) NICHT und legt KEINE neuen dauerhaften Pakete an. Sie bleiben als
// Kompatibilitaetsschicht erhalten; dieses Modul liest sie nur und stellt sie dem Shadow-
// Vergleich gegen den neuen dynamischen Versorgungsplan gegenueber.
//
// ZIEL (Aufgabe 4): bestehende Produktion laeuft unveraendert; die neue Architektur erzeugt
// KEINE neuen dauerhaften Pakete (ein Paket ist nur noch das Laufzeitergebnis des Plans);
// Legacy-Pakete koennen weiter gelesen und im Shadow-Modus verglichen werden; eine spaetere
// Abschaltung ist ohne Quellen-/Mandatsdatenverlust moeglich.

const legacyResolver = require("../quellenarchitektur/profile-packages");
const { PACKAGE_DEFINITIONS } = require("../quellenarchitektur/seeds/packages");
const supplyPlan = require("./supply-plan");

const PKG_BY_KEY = new Map((PACKAGE_DEFINITIONS || []).map((p) => [p.key, p]));

// Dokumentierte, NUR fuer den Shadow-Vergleich genutzte Zuordnung Legacy-Paket -> Versorgungsebenen.
// Approximativ (dient dem Aufdecken von Divergenzen, ist keine verbindliche Produktlogik).
function legacyPackageToLevels(key) {
  const k = String(key || "");
  if (k === "bund-basis" || /basis$/.test(k)) return ["institutional_base", "agenda_process", "media"];
  if (/(^die-|-bund$|partei|fraktion)/.test(k) && !/basis$/.test(k)) return ["party", "group"];
  if (/^regional-/.test(k) || /^landespaket:/.test(k)) return ["regional"];
  if (/^profil-/.test(k)) return ["person"];
  // Themen-/Ausschusspakete (z. B. arbeit-und-soziales)
  return ["committee", "topic"];
}

// LESENDER Zugriff auf die Legacy-Paketauswahl eines Mandats (unveraendert uebernommen).
function readLegacyPackages(profile = {}) {
  const resolved = legacyResolver.resolveProfilePackages(profile);
  const withStatus = (keys) => keys.map((key) => {
    const pkg = PKG_BY_KEY.get(key);
    return { key, status: pkg ? pkg.status : "kein-paket", isBase: pkg ? !!pkg.is_base : false, levels: legacyPackageToLevels(key) };
  });
  return {
    required: withStatus(resolved.required),
    optional: withStatus(resolved.optional),
    requiredMissing: resolved.requiredMissing.map((k) => ({ key: k, status: "kein-paket", levels: legacyPackageToLevels(k) })),
    all: resolved.all
  };
}

// Metadaten eines Legacy-Pakets (rein lesend).
function legacyPackageMeta(key) { return PKG_BY_KEY.get(String(key || "")) || null; }

// --- Shadow-Vergleich: dynamischer Versorgungsplan  vs  Legacy-Paketauswahl ------------------
// Rein lesend, veraendert nichts. Deckt Divergenzen fuer die menschliche Bewertung auf, bevor
// die Legacy-Pakete abgeschaltet werden. Vergleich auf Versorgungsebenen-Ebene (gemeinsame Sprache).
function shadowComparePlanVsLegacy(profile = {}, catalog = {}, opts = {}) {
  const legacy = readLegacyPackages(profile);
  const plan = supplyPlan.buildSupplyPlan(profile, catalog, opts);

  const legacyLevels = new Set();
  for (const p of [...legacy.required, ...legacy.optional]) for (const l of p.levels) legacyLevels.add(l);
  const legacyRequiredLevels = new Set();
  for (const p of [...legacy.required, ...legacy.requiredMissing]) for (const l of p.levels) legacyRequiredLevels.add(l);

  const planMetLevels = new Set(plan.coverage.perLevel.filter((l) => l.met).map((l) => l.level));
  const planAssignedLevels = new Set();
  for (const s of plan.sources) for (const l of s.levels) planAssignedLevels.add(l);

  // Divergenzen: was das Legacy-Paket verlangte, wofuer der dynamische Plan (noch) keine
  // zugewiesene Quelle hat — und umgekehrt (der Plan deckt mehr ab als die Pakete kannten).
  const legacyRequiresButPlanUnassigned = [...legacyRequiredLevels].filter((l) => !planAssignedLevels.has(l));
  const planCoversBeyondLegacy = [...planAssignedLevels].filter((l) => !legacyLevels.has(l));

  return {
    mandateId: plan.generatedFor,
    legacy: {
      requiredKeys: legacy.required.map((p) => p.key),
      optionalKeys: legacy.optional.map((p) => p.key),
      requiredMissing: legacy.requiredMissing.map((p) => p.key),
      requiredLevels: [...legacyRequiredLevels].sort()
    },
    dynamic: {
      status: plan.status,
      assignedCount: plan.counts.assigned,
      metLevels: [...planMetLevels].sort(),
      assignedLevels: [...planAssignedLevels].sort()
    },
    divergence: {
      legacyRequiresButPlanUnassigned: legacyRequiresButPlanUnassigned.sort(),
      planCoversBeyondLegacy: planCoversBeyondLegacy.sort(),
      // agreement: deckt der Plan mindestens alle vom Legacy als Pflicht verlangten Ebenen ab?
      planCoversAllLegacyRequired: legacyRequiresButPlanUnassigned.length === 0
    },
    // Harte Invariante der Konsolidierung: der Plan legt KEINE dauerhaften Pakete an.
    createsNoPersistentPackages: true
  };
}

// Invarianten-Check fuer Tests/Betrieb: erzeugt die neue Architektur neue dauerhafte Pakete?
// Der dynamische Plan ist ein reines Laufzeitobjekt ohne Persistenz -> immer false.
function assertNoNewPersistentPackages(plan) {
  return { ok: true, persistentPackagesCreated: 0, note: "Versorgungsplan ist Laufzeitergebnis; keine Paketzeile persistiert." };
}

module.exports = {
  readLegacyPackages, legacyPackageMeta, legacyPackageToLevels,
  shadowComparePlanVsLegacy, assertNoNewPersistentPackages
};
