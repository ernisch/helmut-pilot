"use strict";

// Sprint 1 (Sicherheit) — statische Prüfung der Advisor-Härtungs-Migration.
// KEINE DB: prüft nur, dass die vorbereitete Migration + Rollback wohlgeformt,
// symmetrisch, additiv (kein Body-Umbau) und freigabepflichtig markiert sind.

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const migFile = path.join(root, "supabase/migrations/20260721_security_advisor_hardening.sql");
const rbFile = path.join(root, "supabase/migrations/20260721_security_advisor_hardening_rollback.sql");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const mig = fs.readFileSync(migFile, "utf8");
const rb = fs.readFileSync(rbFile, "utf8");
// Nur die ausführbaren Statements (Kommentarzeilen '--' entfernt) für die
// „keine gefährlichen Statements"-Prüfungen — Kommentare dürfen die Begriffe nennen.
const migCode = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

// Freigabe-/Sicherheitsbanner
check("Migration trägt FREIGABE-/NICHT-ANWENDEN-Banner", /NICHT ANWENDEN OHNE AUSDR/i.test(mig) && /FREIGABE/i.test(mig));
check("Migration ist additiv: KEIN CREATE OR REPLACE (kein Body-Umbau)", !/create\s+or\s+replace/i.test(migCode));
check("Transaktions-Klammer migration (begin/commit)", /\bbegin\s*;/i.test(mig) && /\bcommit\s*;/i.test(mig));
check("Transaktions-Klammer rollback (begin/commit)", /\bbegin\s*;/i.test(rb) && /\bcommit\s*;/i.test(rb));

// 1) search_path auf den 5 (+ensure_profile) Funktionen
const setPathFns = [
  "helmut_set_updated_at()",
  "match_knowledge_objects(vector, integer, text[], text[], text[])",
  "helmut_reserve_llm_call(text, text, integer)",
  "helmut_acquire_pipeline_lock(text, bigint)",
  "helmut_release_pipeline_lock(text, text)",
  "helmut_ensure_profile()"
];
for (const sig of setPathFns) {
  const re = new RegExp(`alter function public\\.${sig.replace(/[()[\]]/g, "\\$&")} set search_path = public, pg_temp`, "i");
  check(`Migration setzt search_path für ${sig}`, re.test(mig));
  const rre = new RegExp(`alter function public\\.${sig.replace(/[()[\]]/g, "\\$&")} (reset search_path|set search_path = public\\b)`, "i");
  check(`Rollback nimmt search_path für ${sig} zurück`, rre.test(rb));
}

// 2) REVOKE EXECUTE (0028/0029 + match_knowledge_objects)
check("REVOKE EXECUTE helmut_ensure_profile von anon/authenticated",
  /revoke execute on function public\.helmut_ensure_profile\(\) from public, anon, authenticated/i.test(mig));
check("REVOKE EXECUTE match_knowledge_objects von anon/authenticated",
  /revoke execute on function public\.match_knowledge_objects\(vector, integer, text\[\], text\[\], text\[\]\) from public, anon, authenticated/i.test(mig));
check("Rollback GRANT EXECUTE helmut_ensure_profile zurück", /grant execute on function public\.helmut_ensure_profile\(\) to public/i.test(rb));
check("Rollback GRANT EXECUTE match_knowledge_objects zurück", /grant execute on function public\.match_knowledge_objects\(.*\) to public/i.test(rb));

// 3) REVOKE ALL auf Telemetrie-Tabellen + Rollback GRANT ALL
for (const tbl of ["gate_shadow_events", "document_findings"]) {
  check(`REVOKE ALL auf ${tbl} von anon/authenticated`, new RegExp(`revoke all on table public\\.${tbl} from anon, authenticated`, "i").test(mig));
  check(`Rollback GRANT ALL auf ${tbl} zurück`, new RegExp(`grant all on table public\\.${tbl} to anon, authenticated`, "i").test(rb));
}

// Keine Daten-/Policy-/Spalten-Änderung (Sicherheit: nur Grants/search_path)
check("Migration ändert KEINE Daten (kein insert/update/delete/drop table/alter table)",
  !/\b(insert into|update\s+public|delete from|drop table|alter table)\b/i.test(migCode));
check("Migration erzeugt/entfernt KEINE Policy", !/\b(create policy|drop policy)\b/i.test(migCode));

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
