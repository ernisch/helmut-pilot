"use strict";

// Tests — Quellenplattform (Konsolidierung) · Master-Katalog als EINZIGE Quellenwahrheit +
// kanonisches Laufzeitmodell + globale Quelle ohne Mandantenduplikat (Aufgabe 9: 2, 12).

const { P, PROFILE_BUND_SPD, PROFILE_BUND_CDU, buildCompleteCatalog, resolveEntityIds } = require("./quellenplattform-fixture");
const runtimeSource = require("../lib/helmut/quellenplattform/runtime-source");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

console.log("== 2. Master-Katalog / kanonisches Laufzeitmodell als einzige Quellenwahrheit ==");
// #6 "Partei und Fraktion" = zwei Felder (party_id + group_id) -> 21 Feldnamen für 20 Attribute.
check("Laufzeitmodell deckt mindestens die 20 geforderten Attribute ab", runtimeSource.RUNTIME_FIELDS.length >= 20);
const rec = { id: "src-x", publisher_id: "pub-x", source_type: "parlament", political_level: "bund", trust: "hoch", license_status: "presse_erlaubt", privacy_status: "unbedenklich", review_status: "active", discovery_origin: "official_directory", discovered_at: "2026-07-01", health: "healthy", canonical_url: "https://x.example", retrieval: { method: "rss", url: "https://x.example/rss" } };
const rs = runtimeSource.toRuntimeSource(rec, { visibility: "global" });
for (const f of runtimeSource.RUNTIME_FIELDS) check(`Feld vorhanden: ${f}`, Object.prototype.hasOwnProperty.call(rs, f));
check("Gesundheit vereinheitlicht (Objekt mit gültigem state)", P.health.isHealthState(rs.health.state));
check("Autorität aus Taxonomie abgeleitet (parlament -> official_primary)", rs.authority.role === "official_primary");
// Es entsteht KEIN viertes Modell: das Laufzeitobjekt validiert über den Sprint-3-Record.
const v = runtimeSource.validateRuntimeSource(rs);
check("Laufzeitobjekt validiert über Sprint-3-Record (ok)", v.ok === true);

console.log("\n== Sichtbarkeits-Invariante (global vs. privat) ==");
check("globale Quelle mit tenant_id ist ungültig", runtimeSource.validateRuntimeSource({ ...rs, visibility: "global", tenant_id: "t1" }).ok === false);
const priv = runtimeSource.toRuntimeSource({ ...rec, id: "p1", tenant_id: "t1" }, { visibility: "private", tenantId: "t1" });
check("private Quelle trägt tenant_id", priv.tenant_id === "t1" && priv.visibility === "private");
check("private Quelle OHNE tenant_id ist ungültig", runtimeSource.validateRuntimeSource({ ...priv, tenant_id: null }).ok === false);

console.log("\n== 12. Globale Quelle wird NICHT pro Mandant dupliziert ==");
const catalog = buildCompleteCatalog(resolveEntityIds(PROFILE_BUND_SPD));
const planA = P.planSupplyForMandate(PROFILE_BUND_SPD, { globalSources: catalog, tenantId: "tenant-A" });
const planB = P.planSupplyForMandate(PROFILE_BUND_SPD, { globalSources: catalog, tenantId: "tenant-B" });
// Dieselbe globale Quelle wird von beiden Mandanten per IDENTISCHER ID referenziert (nicht kopiert).
const idA = planA.sources.filter((s) => s.visibility === "global").map((s) => s.id).sort();
const idB = planB.sources.filter((s) => s.visibility === "global").map((s) => s.id).sort();
check("beide Mandanten referenzieren dieselben globalen Quellen-IDs", JSON.stringify(idA) === JSON.stringify(idB) && idA.length > 0);
check("keine globale Quelle trägt eine tenant_id (mandantenneutral)", planA.sources.every((s) => s.visibility !== "global" || s.tenant_id == null));
check("Plan meldet Invariante 'keine Pro-Mandant-Kopien'", planA.invariants.noPerTenantCopies === true);
// Innerhalb EINES Plans erscheint jede Quelle genau einmal (kein Duplikat).
const ids = planA.sources.map((s) => s.id);
check("jede Quelle im Plan genau einmal (kein Duplikat)", ids.length === new Set(ids).size);

console.log(`\n== ${pass} PASS, ${fail} FAIL ==`);
if (fail) process.exit(1);
