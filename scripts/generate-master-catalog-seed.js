"use strict";

// Helmut — Master Quellenkatalog · Sprint 3 · Seed-Generator (Werkzeug, KEIN Test).
//
// Erzeugt aus dem JS-Seed (lib/.../master/seeds/catalog-seed.js) eine VORBEREITETE SQL-Seed-Datei
// unter supabase/seeds/. Diese Datei wird NICHT automatisch eingespielt — sie ist ein vorbereiteter
// Import fuer die (freigabepflichtige) Migration 20260722_master_source_catalog.sql.
// Idempotent: alle INSERTs nutzen ON CONFLICT DO NOTHING. KEIN Netz, kein DB-Zugriff.
//
// Aufruf: node scripts/generate-master-catalog-seed.js

const fs = require("fs");
const path = require("path");
const master = require("../lib/helmut/quellenarchitektur/master");
const taxonomy = require("../lib/helmut/quellenarchitektur/master/taxonomy");

function q(v) {
  if (v == null) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function qd(v) { return v == null ? "null" : `'${String(v).replace(/'/g, "''")}'::date`; }

function publisherTypeFor(sourceType) {
  const t = taxonomy.getSourceType(sourceType);
  if (!t) return "other";
  const map = {
    parlament: "parliament", bundesrat: "parliament", landtag: "parliament",
    bundesregierung: "government", landesregierung: "government", ministerium: "ministry",
    behoerde: "authority", datenportal: "authority", rechnungshof: "authority", gericht: "authority",
    partei: "party", fraktion: "parliamentary_group", abgeordnete: "person",
    gewerkschaft: "union", arbeitgeberverband: "association", fachverband: "association", ngo: "association",
    wissenschaft: "other", thinktank: "other",
    medien_ueberregional: "media", medien_regional: "media", fachmedien: "media",
    bundesland: "government", kommunal: "government", wahlkreis: "authority", suchanbieter: "aggregator"
  };
  return map[sourceType] || "other";
}

function main() {
  const cat = master.buildMasterCatalog();
  const lines = [];
  lines.push("-- Helmut — Master Quellenkatalog · Sprint 3 · VORBEREITETER Seed (NICHT automatisch eingespielt).");
  lines.push("-- Erzeugt von scripts/generate-master-catalog-seed.js aus dem JS-Seed. Idempotent (ON CONFLICT DO NOTHING).");
  lines.push("-- Setzt die Tabellen aus 20260722_master_source_catalog.sql voraus (freigabepflichtig).");
  lines.push("-- Belegbarkeit: jede Quelle traegt discovery_origin + evidence_url. Keine erfundenen URLs.");
  lines.push("");
  lines.push("begin;");
  lines.push("");

  // 1) Herausgeber (aus den Records rekonstruiert; ein Herausgeber je publisher_id).
  const publishers = new Map();
  for (const r of cat.records) {
    if (publishers.has(r.publisher_id)) continue;
    const domain = r.publisher_id === "aggregator-google-news" ? "news.google.com" : r.publisher_id.replace(/^publisher-/, "");
    const tmeta = taxonomy.getSourceType(r.source_type);
    publishers.set(r.publisher_id, {
      id: r.publisher_id,
      name: domain,
      canonical_domain: domain,
      publisher_type: publisherTypeFor(r.source_type),
      evidence_role: tmeta ? tmeta.evidence_role : "journalistic",
      trust: r.trust || "unbekannt"
    });
  }
  lines.push("-- Herausgeber (kanonisch, einmal je Domain) -------------------------------------------------");
  for (const p of publishers.values()) {
    lines.push(`insert into public.catalog_publishers (id, name, canonical_domain, publisher_type, evidence_role, trust) values (${q(p.id)}, ${q(p.name)}, ${q(p.canonical_domain)}, ${q(p.publisher_type)}, ${q(p.evidence_role)}, ${q(p.trust)}) on conflict (id) do nothing;`);
  }
  lines.push("");

  // 2) Quellen (kanonischer Record mit den 20 Attributen).
  lines.push("-- Quellen (globaler kanonischer Record) -----------------------------------------------------");
  for (const r of cat.records) {
    lines.push(
      `insert into public.catalog_sources (id, canonical_key, publisher_id, canonical_url, source_type, political_level, institution_id, party_id, group_id, language, content_stance, discovery_origin, evidence_url, discovered_at, last_checked_at, trust, license_status, privacy_status, review_status, release_status, responsible, legacy_source_id) values (` +
      `${q(r.id)}, ${q(r.canonical_key)}, ${q(r.publisher_id)}, ${q(r.canonical_url)}, ${q(r.source_type)}, ${q(r.political_level)}, ${q(r.institution_id)}, ${q(r.party_id)}, ${q(r.group_id)}, ${q(r.language)}, ${q(r.content_stance)}, ${q(r.discovery_origin)}, ${q(r.evidence_url)}, ${qd(r.discovered_at)}, ${q(r.last_checked_at)}, ${q(r.trust)}, ${q(r.license_status)}, ${q(r.privacy_status)}, ${q(r.review_status)}, ${q(r.release_status)}, ${q(r.responsible)}, ${q(r.legacy_source_id)}) on conflict (id) do nothing;`
    );
  }
  lines.push("");

  // 3) Technische Abrufwege (1:n).
  lines.push("-- Technische Abrufwege ----------------------------------------------------------------------");
  for (const r of cat.records) {
    const rp = r.retrieval || {};
    lines.push(
      `insert into public.catalog_source_paths (id, source_id, method, url, query, parser, expected_frequency) values (` +
      `${q(r.id + "-path")}, ${q(r.id)}, ${q(rp.method)}, ${q(rp.url)}, ${q(rp.query)}, ${q(rp.parser)}, ${q(rp.expected_frequency)}) on conflict (id) do nothing;`
    );
  }
  lines.push("");

  // 4) Klassifikations-Verknuepfungen (Ausschuesse/Regionen).
  lines.push("-- Klassifikation: Ausschuesse ---------------------------------------------------------------");
  for (const r of cat.records) for (const c of r.committee_ids || []) {
    lines.push(`insert into public.catalog_source_committees (source_id, committee_id) values (${q(r.id)}, ${q(c)}) on conflict do nothing;`);
  }
  lines.push("-- Klassifikation: Regionen ------------------------------------------------------------------");
  for (const r of cat.records) for (const g of r.region_ids || []) {
    lines.push(`insert into public.catalog_source_regions (source_id, geography_id) values (${q(r.id)}, ${q(g)}) on conflict do nothing;`);
  }
  lines.push("");

  // 5) Mandatsbezogene Zuweisung (Paket -> Quelle als Referenz).
  lines.push("-- Zuweisung: Paket -> Quelle (Referenz, keine Kopie) ----------------------------------------");
  for (const [pkgKey, ids] of Object.entries(cat.assignments)) {
    for (const sid of ids) {
      lines.push(`insert into public.catalog_package_assignments (package_key, source_id, assigned_by) values (${q(pkgKey)}, ${q(sid)}, 'regel:datengetriebene-zuweisung') on conflict do nothing;`);
    }
  }
  lines.push("");
  lines.push("commit;");
  lines.push("");

  const outPath = path.join(__dirname, "..", "supabase", "seeds", "20260722_master_source_catalog_seed.sql");
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`Seed geschrieben: ${outPath}`);
  console.log(`Herausgeber: ${publishers.size} · Quellen: ${cat.records.length} · Pakete: ${cat.packages.length} · Zuweisungen: ${Object.values(cat.assignments).reduce((s, a) => s + a.length, 0)}`);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
