"use strict";

// Tests — Quellenplattform (Konsolidierung) · dynamische Zuweisung, Laufzeit-Versorgungsplan,
// Suchanbieter-Regel, Legacy-Shadow (Aufgabe 9: 3, 4, 5, 16). Rein statisch, kein Netz/KI/Storage.

const { P, PROFILE_BUND_SPD, buildCompleteCatalog, buildPrivateSources, resolveEntityIds } = require("./quellenplattform-fixture");
const assignment = require("../lib/helmut/quellenplattform/assignment");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

const ent = resolveEntityIds(PROFILE_BUND_SPD);
const catalog = buildCompleteCatalog(ent);
const plan = P.planSupplyForMandate(PROFILE_BUND_SPD, { globalSources: catalog, privateSources: buildPrivateSources(), tenantId: "tenant-A" });

console.log("== 3. Dynamische, nachvollziehbare Zuweisung ==");
check("Zuweisung liefert gewichtete, sortierte Quellen (Score desc)", plan.sources.length > 0 &&
  plan.sources.every((s, i) => i === 0 || plan.sources[i - 1].relevanceScore >= s.relevanceScore));
check("jede gewählte Quelle trägt nachvollziehbare Kriterien (reasons mit Dimension)",
  plan.sources.every((s) => Array.isArray(s.reasons) && s.reasons.every((r) => r.dimension)));
check("Fraktions-/Parteiquelle punktet höher als reine Grundversorgung",
  (plan.sources.find((s) => s.id === "fraktion-spd").relevanceScore) > (plan.sources.find((s) => s.id === "medien-zeit").relevanceScore));
check("hart gesperrte Quelle ist ausgeschlossen (mit Grund)", plan.excluded.some((e) => e.id === "gesperrt" && /nicht-abrufbar/.test(e.reason)));
check("Fremdregion-Quelle ausgeschlossen", plan.excluded.some((e) => e.id === "regional-bayern"));

console.log("\n== 4. Laufzeit-Versorgungsplan: alle 10 nachvollziehbaren Aussagen ==");
check("(1) welche Quelle gewählt", plan.sources.length > 0 && plan.sources[0].id);
check("(2) für welche Versorgungsebene", plan.sources.every((s) => Array.isArray(s.levels)));
check("(3) aufgrund welcher Kriterien", plan.sources[0].reasons.length > 0);
check("(4) mit welchem Relevanzwert", typeof plan.sources[0].relevanceScore === "number");
check("(5) welche Pflichtebene erfüllt (coverage.perLevel mit met)", plan.coverage.perLevel.some((l) => l.required && l.met));
check("(6) welche Alternativen existieren", plan.alternativesByLevel && typeof plan.alternativesByLevel === "object");
check("(7) welche Quelle ausgeschlossen und warum", plan.excluded.length > 0 && plan.excluded[0].reason);
check("(8) welche Versorgungslücke bleibt", Array.isArray(plan.gaps));
check("(9) Suchanbieter-Abhängigkeit ausgewiesen", typeof plan.forbiddenSearchProviderDependency === "boolean");
check("(10) Mandat vollständig/eingeschränkt/blockiert versorgt", ["vollstaendig", "eingeschraenkt", "blockiert"].includes(plan.status));
check("gut versorgtes Mandat ist NICHT blockiert (keine blockierende Lücke)", plan.coverage.ok === true && plan.status !== "blockiert");

console.log("\n== 16. Suchanbieter nie als alleinige Pflichtversorgung ==");
check("Suchanbieter ist niemals universale Grundversorgung", assignment.isUniversalSource({ source_type: "suchanbieter", political_level: "bund" }) === false);
// Ebene, die NUR ein Suchanbieter bedient, wird als verbotene Abhängigkeit markiert.
check("nur-Suchanbieter-Ebene wird als verbotene Abhängigkeit erkannt (Ebene 'person')",
  plan.forbiddenSearchProviderDependency === true && plan.searchOnlyLevels.includes("person"));
// Direkte Prüfung des Versorgungsstandards: eine Ebene mit ausschließlich Suchanbieter ist nicht erfüllt.
const supplyStd = require("../lib/helmut/quellenarchitektur/master/supply-standard");
const onlySearch = supplyStd.evaluateLevel(supplyStd.LEVEL_BY_ID.get("media"), [{ id: "s", source_type: "suchanbieter", publisher_id: "pub-g", trust: "niedrig", health: "healthy", review_status: "active", retrieval: { method: "googlenews_search" } }]);
check("Versorgungsstandard: reine Suchanbieter-Ebene = nicht erfüllt", onlySearch.met === false && onlySearch.reasons.includes("nur-suchanbieter-versorgung"));

console.log("\n== 5. Legacy-Paket-Shadow-Vergleich ==");
const shadow = P.shadowComparePlanVsLegacy(PROFILE_BUND_SPD, { globalSources: catalog, privateSources: buildPrivateSources(), tenantId: "tenant-A" });
check("Shadow liefert Legacy-Pflicht + dynamischen Status", shadow.legacy.requiredKeys.includes("bund-basis") && shadow.dynamic.status);
check("Shadow: dynamischer Plan deckt alle Legacy-Pflichtebenen ab", shadow.divergence.planCoversAllLegacyRequired === true);
check("Shadow: Konsolidierung legt KEINE dauerhaften Pakete an", shadow.createsNoPersistentPackages === true);
check("Invariante: keine neuen persistenten Pakete", P.legacyPackages.assertNoNewPersistentPackages(plan).persistentPackagesCreated === 0);

console.log(`\n== ${pass} PASS, ${fail} FAIL ==`);
if (fail) process.exit(1);
