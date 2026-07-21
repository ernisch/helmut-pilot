"use strict";

// Tests — Master Quellenkatalog · Mandantentrennung + Datenschutz (Sprint 3, Phase 10).
// Deckt ab: private Mandantenquelle (10), Mandantentrennung (11), Datenschutz/Datenminimierung (21).
// Reine Offline-Tests, kein Netz/DB/KI. Ausschliesslich KUENSTLICHE Mandanten-IDs.

const M = require("../lib/helmut/quellenarchitektur/master");
const { tenant, sourceRecord, model } = M;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// Globaler Katalog (Referenzen; wird NIE pro Mandant kopiert).
const globalCatalog = [
  { id: "src-a", source_type: "parlament" },
  { id: "src-b", source_type: "ministerium" },
  { id: "src-c", source_type: "medien_ueberregional" }
];
const A = "tenant-alpha", B = "tenant-beta";

// Private Quellen zweier Mandanten.
const privateSources = [
  { id: "priv-a1", tenant_id: A, source_type: "kommunal", canonical_url: "https://interner-verteiler-a.example" },
  { id: "priv-b1", tenant_id: B, source_type: "kommunal", canonical_url: "https://interner-verteiler-b.example" }
];

console.log("== Schichtenmodell (7 Schichten) ==");
check("7 SaaS-Schichten deklariert", tenant.SCOPE_LAYERS.length === 7);
check("globale Schichten ohne tenant-Spalte", tenant.SCOPE_LAYERS.filter((l) => l.scope === "global").every((l) => l.tenant_column === null));
check("tenant-Schichten mit tenant_id", tenant.SCOPE_LAYERS.filter((l) => l.scope === "tenant").every((l) => l.tenant_column === "tenant_id"));

// ============================ 9/…) Globale Quelle wird nicht pro Mandant kopiert ============================
console.log("== Keine Duplikate globaler Quellen ==");
{
  const rA = tenant.resolveTenantSources(A, {
    globalCatalogById: globalCatalog,
    mandateSourceIds: ["src-a", "src-b"],
    privateSources
  });
  check("Mandant A sieht seine globalen Referenzen", rA.globalReferencedCount === 2);
  check("globale Quellen sind Referenzen (IDs), keine Kopien", rA.sources.filter((s) => !s.private).every((s) => globalCatalog.some((g) => g.id === s.source_id)));
}

// ============================ 10) Private Mandantenquelle ============================
console.log("== Private Mandantenquelle ==");
{
  const rA = tenant.resolveTenantSources(A, { globalCatalogById: globalCatalog, mandateSourceIds: ["src-a"], privateSources });
  check("A erhaelt genau seine private Quelle", rA.privateCount === 1 && rA.sources.some((s) => s.private && s.source_id === "priv-a1"));
  check("A erhaelt NICHT die private Quelle von B", !rA.sources.some((s) => s.source_id === "priv-b1"));
}

// ============================ Private ID darf globale Referenz nicht verdraengen ============================
console.log("== Namespacing private vs. global ==");
{
  const gcat = [{ id: "shared-id", source_type: "parlament" }];
  const r = tenant.resolveTenantSources(A, {
    globalCatalogById: gcat, mandateSourceIds: ["shared-id"],
    privateSources: [{ id: "shared-id", tenant_id: A }]
  });
  const hits = r.sources.filter((s) => s.source_id === "shared-id");
  check("gleiche ID global+privat: beide erhalten, keine Verdraengung", hits.length === 2 && hits.some((s) => s.private) && hits.some((s) => !s.private));
}

// ============================ 11) Mandantentrennung (harte Isolation) ============================
console.log("== Mandantentrennung ==");
{
  const rA = tenant.resolveTenantSources(A, { globalCatalogById: globalCatalog, mandateSourceIds: ["src-a", "src-b"], privateSources });
  const rB = tenant.resolveTenantSources(B, { globalCatalogById: globalCatalog, mandateSourceIds: ["src-a", "src-b"], privateSources });
  const isoA = tenant.assertPrivateIsolation(A, rA, privateSources);
  const isoB = tenant.assertPrivateIsolation(B, rB, privateSources);
  check("A sieht keine Fremd-Privatquelle", isoA.isolated === true && isoA.leaked.length === 0);
  check("B sieht keine Fremd-Privatquelle", isoB.isolated === true);
  // Relevanz/Korrektur eines Fremd-Mandanten wird strikt ignoriert.
  const rA2 = tenant.resolveTenantSources(A, {
    globalCatalogById: globalCatalog, mandateSourceIds: ["src-a"],
    tenantRelevance: [{ tenant_id: B, source_id: "src-c", relevance: 9 }],  // Fremd-Tenant
    tenantOverrides: [{ tenant_id: B, source_id: "src-a", action: "mute" }] // Fremd-Tenant
  });
  check("Fremd-Relevanz beeinflusst A nicht", !rA2.sources.some((s) => s.source_id === "src-c"));
  check("Fremd-Korrektur (mute) beeinflusst A nicht", rA2.sources.some((s) => s.source_id === "src-a"));
}

// ============================ Manuelle Korrekturen (Belang 7), mandantengetrennt ============================
console.log("== Manuelle Korrekturen ==");
{
  const muted = tenant.resolveTenantSources(A, { globalCatalogById: globalCatalog, mandateSourceIds: ["src-a", "src-b"], tenantOverrides: [{ tenant_id: A, source_id: "src-b", action: "mute" }] });
  check("eigenes mute entfernt Quelle nur fuer A", !muted.sources.some((s) => s.source_id === "src-b"));
  const replaced = tenant.resolveTenantSources(A, { globalCatalogById: globalCatalog, mandateSourceIds: ["src-a"], tenantOverrides: [{ tenant_id: A, source_id: "src-a", action: "replace", replacement_source_id: "src-c" }] });
  check("replace ersetzt Quelle (nur A)", !replaced.sources.some((s) => s.source_id === "src-a") && replaced.sources.some((s) => s.source_id === "src-c"));
  const pinned = tenant.resolveTenantSources(A, { globalCatalogById: globalCatalog, mandateSourceIds: [], tenantOverrides: [{ tenant_id: A, source_id: "src-c", action: "pin" }] });
  check("pin nimmt globale Quelle fuer A auf", pinned.sources.some((s) => s.source_id === "src-c"));
}

// ============================ leere Mandanten-ID -> keine Datenherausgabe ============================
console.log("== Leere Mandanten-ID ==");
{
  const r = tenant.resolveTenantSources("", { globalCatalogById: globalCatalog, mandateSourceIds: ["src-a"], privateSources });
  check("leere tenant_id -> keine Quellen, Verletzung protokolliert", r.sources.length === 0 && r.violations.includes("leere-tenant-id"));
}

// ============================ 21) Datenschutz & Datenminimierung ============================
console.log("== Datenschutz & Datenminimierung ==");
check("Katalogschema kennt verbotene PII-Felder als Sperrliste", sourceRecord.FORBIDDEN_PII_KEYS.length > 0);
{
  const withPrivateMail = sourceRecord.buildSourceRecord({
    url: "https://x.de", method: "html", source_type: "abgeordnete", political_level: "bund",
    discovery_origin: "manual_curation", discovered_at: "2026-07-21", evidence_url: "https://x.de",
    responsible: "max.mustermann@gmail.com"
  });
  const v = sourceRecord.validateSourceRecord(withPrivateMail);
  check("private E-Mail im Verantwortlich-Feld -> Fehler", !v.ok && v.errors.some((e) => /private E-Mail/.test(e)));
}
{
  const roleMail = sourceRecord.buildSourceRecord({
    url: "https://x.de", method: "html", source_type: "behoerde", political_level: "bund",
    discovery_origin: "official_directory", discovered_at: "2026-07-21", responsible: "presse@bmas.de"
  });
  check("amtliche Rollen-Mailbox (presse@) ist erlaubt", !sourceRecord.scanForPrivatePii(roleMail).length);
}
{
  const forbidden = { private_phone: "0170 1234567", source_type: "behoerde" };
  check("verbotenes Feld private_phone wird erkannt", sourceRecord.scanForPrivatePii(forbidden).some((e) => /private_phone/.test(e)));
}
check("kein Seed-Record enthaelt personenbezogene Kontaktdaten", M.buildMasterCatalog().records.every((r) => sourceRecord.scanForPrivatePii(r).length === 0));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
