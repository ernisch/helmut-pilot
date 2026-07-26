"use strict";

// Helmut — Phase-1-Punkt 14: Generator für das Berliner AKTIVIERUNGS-SQL + Rollback.
// =============================================================================================
// REINE CODEGEN. Kein DB-Zugriff, kein Netz, kein Flag. Das erzeugte SQL wird von diesem
// Sprint AUSDRÜCKLICH NICHT ausgeführt — es ist der freigabepflichtige Production-Schritt.
//
// Quelle der Wahrheit: lib/helmut/quellenarchitektur/seeds/berlin-aktivierung.js.
// Der Seed-Drift-Test hält die committeten Dateien byte-genau an diesen Generator.
//
// AUFBAU (zwei getrennte Blöcke, zwei getrennte Transaktionen):
//   Block A — NEUTRALISIERUNG (Vorbedingung, P0-2 Befund A-3, Berlin-genau):
//             hängt die 3 Partei-/Fraktions-/Personenwege von berlin-basis nach
//             die-linke-berlin um. Ohne Block A bekäme JEDES Berliner Landtagsmandat
//             zwingend die Quellen EINER Partei.
//   Block B — AKTIVIERUNG: berlin-basis -> 'active' und die 6 liefernden Wege ->
//             status='healthy', activation_mode='auto'.
//
// ROLLBACK (drei Stufen, absteigende Eingriffstiefe):
//   Stufe 0  Flag  HELMUT_LANDESMODULE  leeren  -> wirkt sofort, KEIN DB-Schreibzugriff.
//   Stufe 1  ..._rollback.sql              -> dreht NUR Block B zurück (Betriebs-Abbruch).
//                                            Die Neutralisierung bleibt bestehen.
//   Stufe 2  ..._rollback_vollstaendig.sql -> dreht Block B UND Block A zurück und stellt
//                                            damit exakt den gemessenen Ist-Zustand
//                                            (2026-07-26) wieder her — inklusive des
//                                            Befunds A-3. Nur für den Fall, dass die
//                                            Umhängung selbst Schaden anrichtet.
//
// BRANDENBURG: kein Statement dieser Dateien nennt eine rp-bb-*-Id oder ein
// brandenburg-*-Paket. Der Test prüft das als Zeichenketten-Invariante.

const fs = require("fs");
const path = require("path");
const B = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");

const SEED_DIR = path.join(__dirname, "..", "supabase", "seeds");
const DATEI = "20260726_berlin_aktivierung.sql";
const DATEI_RB = "20260726_berlin_aktivierung_rollback.sql";
const DATEI_RB_VOLL = "20260726_berlin_aktivierung_rollback_vollstaendig.sql";

function q(v) { return `'${String(v).replace(/'/g, "''")}'`; }
function idListe(ids) { return ids.map(q).join(", "); }

function kopf(titel) {
  return [
    `-- Helmut — ${titel}`,
    "-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.",
    "-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14 NICHT ausgeführt.",
    "-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): " + B.VORAUSSETZUNGEN.map((v) => v.id).join(" · ")
  ];
}

function build() {
  const wege = B.berlinWegeAusSeed();
  const aktiv = wege.filter((w) => w.aktiviert).map((w) => w.id).sort();
  const out = [];
  out.push(...kopf("Berlin-Aktivierung (Phase-1-Punkt 14)"));
  out.push("--");
  out.push("-- Block A: Neutralisierung von " + B.BASISPAKET_KEY + " (P0-2 / Befund A-3).");
  out.push("-- Block B: Aktivierung von " + B.BASISPAKET_KEY + " + " + aktiv.length + " Abrufwegen.");
  out.push("");

  // ---------------- Block A ----------------
  out.push("-- ============================ BLOCK A · NEUTRALISIERUNG ============================");
  out.push("-- Vorher (erwartet 3 Zeilen), nachher (erwartet 0 Zeilen):");
  out.push(`--   select retrieval_path_id from public.package_paths where package_id = ${q(B.UMHAENGUNG.von)}`);
  out.push(`--     and retrieval_path_id in (${idListe(B.UMHAENGUNG.wege)});`);
  out.push("begin;");
  out.push("");
  out.push("-- A1) Zielzuordnung anlegen (idempotent).");
  out.push("insert into public.package_paths (package_id, retrieval_path_id) values");
  out.push(B.UMHAENGUNG.wege.map((w) => `  (${q(B.UMHAENGUNG.nach)}, ${q(w)})`).join(",\n"));
  out.push("on conflict (package_id, retrieval_path_id) do nothing;");
  out.push("");
  out.push("-- A2) Alte Zuordnung am Pflicht-Basispaket entfernen (eng begrenzt auf diese 3 Wege).");
  out.push(`delete from public.package_paths where package_id = ${q(B.UMHAENGUNG.von)}`);
  out.push(`  and retrieval_path_id in (${idListe(B.UMHAENGUNG.wege)});`);
  out.push("");
  out.push("commit;");
  out.push("");

  // ---------------- Block B ----------------
  out.push("-- ============================ BLOCK B · AKTIVIERUNG ===============================");
  out.push("-- Erst ausführen, wenn Block A verifiziert ist und alle Voraussetzungen erfüllt sind.");
  out.push("begin;");
  out.push("");
  out.push("-- B1) Paketstatus: prepared -> active. Erst dadurch zählt die Referenz eines");
  out.push("--     Berliner Landtagsprofils (computeGlobalActivation).");
  out.push(`update public.source_packages set status = 'active' where key = ${q(B.BASISPAKET_KEY)} and status = 'prepared';`);
  out.push("");
  out.push(`-- B2) Die ${aktiv.length} liefernden Abrufwege scharfschalten. ALLE anderen Berliner Wege bleiben`);
  out.push("--     unverändert (needs_review + manual) — insbesondere rp-be-plenum (PARDOK, 0 Items)");
  out.push("--     und die 3 Wege aus Block A.");
  out.push("update public.retrieval_paths set status = 'healthy', activation_mode = 'auto'");
  out.push(`  where id in (${idListe(aktiv)})`);
  out.push("    and status = 'needs_review' and activation_mode = 'manual';");
  out.push("");
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  out.push("-- ============================ SELBSTPRÜFUNG (read-only) ===========================");
  out.push("-- 1) genau " + aktiv.length + " aktive Berliner Wege:");
  out.push(`--    select count(*) from public.retrieval_paths where id in (${idListe(aktiv)})`);
  out.push("--      and status = 'healthy' and activation_mode = 'auto';");
  out.push("-- 2) 0 Partei-/Fraktions-/Personenwege im Pflicht-Basispaket:");
  out.push(`--    select count(*) from public.package_paths where package_id = ${q(B.UMHAENGUNG.von)}`);
  out.push(`--      and retrieval_path_id in (${idListe(B.UMHAENGUNG.wege)});`);
  out.push("-- 3) 0 aktive Brandenburg-Wege (Nachweis der Nicht-Berührung):");
  out.push("--    select count(*) from public.retrieval_paths where id like 'rp-bb-%'");
  out.push("--      and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("-- 4) brandenburg-basis unverändert 'prepared':");
  out.push("--    select status from public.source_packages where key = 'brandenburg-basis';");
  out.push("");
  return out.join("\n");
}

// Stufe 1: dreht NUR Block B zurück (Betriebs-Abbruch). Neutralisierung bleibt.
function buildRollback() {
  const aktiv = B.berlinWegeAusSeed().filter((w) => w.aktiviert).map((w) => w.id).sort();
  const out = [];
  out.push(...kopf("Berlin-Aktivierung · ROLLBACK Stufe 1 (nur Block B)"));
  out.push("--");
  out.push("-- Stoppt die Berliner Versorgung und lässt die Neutralisierung (Block A) bestehen.");
  out.push("-- SCHNELLER Weg ohne DB-Schreibzugriff: HELMUT_LANDESMODULE leeren (Stufe 0).");
  out.push("-- Bereits erzeugte Berliner Dokumente werden NICHT gelöscht (Audit-Spur bleibt).");
  out.push("begin;");
  out.push("update public.retrieval_paths set status = 'needs_review', activation_mode = 'manual'");
  out.push(`  where id in (${idListe(aktiv)});`);
  out.push(`update public.source_packages set status = 'prepared' where key = ${q(B.BASISPAKET_KEY)};`);
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  out.push("-- Prüfung: 0 Zeilen erwartet.");
  out.push(`-- select id, status, activation_mode from public.retrieval_paths where id in (${idListe(aktiv)})`);
  out.push("--   and (status <> 'needs_review' or activation_mode <> 'manual');");
  out.push("");
  return out.join("\n");
}

// Stufe 2: Block B + Block A zurück -> exakt der gemessene Ist-Zustand vom 2026-07-26.
function buildRollbackVollstaendig() {
  const aktiv = B.berlinWegeAusSeed().filter((w) => w.aktiviert).map((w) => w.id).sort();
  const out = [];
  out.push(...kopf("Berlin-Aktivierung · ROLLBACK Stufe 2 (Block B + Block A)"));
  out.push("--");
  out.push("-- Stellt den Zustand VOR der Aktivierung vollständig wieder her — inklusive des");
  out.push("-- Befunds A-3 (Partei-/Fraktions-/Personenwege am Pflicht-Basispaket). Nur nutzen,");
  out.push("-- wenn die Umhängung selbst Schaden angerichtet hat; sonst genügt Stufe 1.");
  out.push("begin;");
  out.push("-- B rückwärts:");
  out.push("update public.retrieval_paths set status = 'needs_review', activation_mode = 'manual'");
  out.push(`  where id in (${idListe(aktiv)});`);
  out.push(`update public.source_packages set status = 'prepared' where key = ${q(B.BASISPAKET_KEY)};`);
  out.push("-- A rückwärts:");
  out.push("insert into public.package_paths (package_id, retrieval_path_id) values");
  out.push(B.UMHAENGUNG.wege.map((w) => `  (${q(B.UMHAENGUNG.von)}, ${q(w)})`).join(",\n"));
  out.push("on conflict (package_id, retrieval_path_id) do nothing;");
  out.push(`delete from public.package_paths where package_id = ${q(B.UMHAENGUNG.nach)}`);
  out.push(`  and retrieval_path_id in (${idListe(B.UMHAENGUNG.wege)});`);
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return out.join("\n");
}

function writeFiles() {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  fs.writeFileSync(path.join(SEED_DIR, DATEI), build());
  fs.writeFileSync(path.join(SEED_DIR, DATEI_RB), buildRollback());
  fs.writeFileSync(path.join(SEED_DIR, DATEI_RB_VOLL), buildRollbackVollstaendig());
  const l = B.lastprognose();
  console.log(`Aktivierungs-SQL geschrieben: supabase/seeds/${DATEI} (+ 2 Rollback-Stufen)`);
  console.log(`Wege im Aktivierungsset: ${l.wegeProLauf} · Abrufe je Lauf: ${l.abrufeProLaufMin}–${l.abrufeProLaufMax}`);
  console.log("AUSGEFÜHRT WURDE NICHTS — die Ausführung ist ein eigener, freigabepflichtiger Schritt.");
}

if (require.main === module) writeFiles();

module.exports = { build, buildRollback, buildRollbackVollstaendig, DATEI, DATEI_RB, DATEI_RB_VOLL, writeFiles };
