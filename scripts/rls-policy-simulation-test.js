"use strict";

// RLS-Policy-Simulationstest (P0-2, Sprint 2, audit/fix-plan.md).
//
// WICHTIGER HINWEIS ZUR AUSSAGEKRAFT: Dies ist KEIN Test gegen eine echte
// Postgres-Instanz — es gibt in dieser Umgebung keinen erlaubten Weg, DDL
// (CREATE POLICY / ALTER TABLE) gegen die Produktions-DB auszuführen, auch
// nicht probeweise in einer zurückgerollten Transaktion (das würde reale
// DDL-Locks auf Production ziehen). Stattdessen wird JEDES SQL-Policy-
// Prädikat aus supabase/migrations/20260712_tenant_rls_policies.sql 1:1 als
// JS-Funktion nachgebildet und gegen einen synthetischen Mehr-Mandanten-
// Datensatz ausgeführt (Muster wie scripts/tenant-guard-test.js).
//
// Das verifiziert: (a) die LOGIK der Prädikate ist korrekt (Isolation,
// Deny-by-default ohne Claim, Sonderfälle helmut_store/profiles/llm_usage),
// NICHT (b) dass die SQL-Syntax gegen die reale Postgres-Instanz fehlerfrei
// ausführt. (b) ist als empfohlener nächster Schritt auf einer isolierten
// Supabase-Branch dokumentiert (docs/rls-tenant-policies-draft.md §7) und
// NICHT Teil dieses Sprints (Kosten-/Freigabepflicht).

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

// ── 1:1-Nachbildung von public.helmut_current_tenant() ──────────────────────
// select nullif(auth.jwt() ->> 'user_id', '')
function helmutCurrentTenant(jwt) {
  const v = jwt && typeof jwt === "object" ? jwt.user_id : undefined;
  return v == null || v === "" ? null : v;
}

// ── Nachbildung der tenant_isolation-Policy (Kategorie A) ───────────────────
// using (user_id = helmut_current_tenant())
function tenantIsolationUsing(row, jwt) {
  const tenant = helmutCurrentTenant(jwt);
  if (tenant === null) return false; // impliziter Deny ohne Claim (auch anon)
  return row.user_id === tenant;
}

// ── llm_usage-Sonderfall: user_id ODER politician_id ────────────────────────
function llmUsageUsing(row, jwt) {
  const tenant = helmutCurrentTenant(jwt);
  if (tenant === null) return false;
  return row.user_id === tenant || row.politician_id === tenant;
}

// ── profiles-Sonderfall: id ist der Mandant ─────────────────────────────────
function profilesUsing(row, jwt) {
  const tenant = helmutCurrentTenant(jwt);
  if (tenant === null) return false;
  return row.id === tenant;
}

// ── helmut_store-Sonderfall: nur 'main-p-<tenant>' matcht, SELECT-only ──────
function helmutStoreSelectUsing(row, jwt) {
  const tenant = helmutCurrentTenant(jwt);
  if (tenant === null) return false;
  return row.id === `main-p-${tenant}`;
}

// ── shared_read-Policy (Kategorie B): using (true), aber TO authenticated ───
// (kein Claim noetig, ABER Rolle muss 'authenticated' sein -> anon bleibt aussen vor)
function sharedReadUsing(_row, jwt, role) {
  return role === "authenticated"; // Policy ist rollen-gescoped, prädikatslos "true"
}

// pipeline_locks: KEINE Policy fuer authenticated/anon -> implizite Verweigerung
// (in Postgres: keine passende Policy = 0 sichtbare Zeilen für nicht-service_role)
function noPolicyDeny(_row, _jwt, role) {
  return role === "service_role";
}

function selectRows(rows, predicate, jwt, role = "authenticated") {
  return rows.filter((r) => predicate(r, jwt, role));
}

// ── Synthetischer Mehr-Mandanten-Datensatz (Muster wie tenant-guard-test.js) ─
const decisions = [
  { id: "dec-a-1", user_id: "mdb-a" },
  { id: "dec-a-2", user_id: "mdb-a" },
  { id: "dec-b-1", user_id: "mdb-b" }
];
const officeOutputs = [
  { id: "off-a-1", user_id: "mdb-a" },
  { id: "off-b-1", user_id: "mdb-b" }
];
const llmUsage = [
  { id: "llm-a-uid", user_id: "mdb-a", politician_id: null },
  { id: "llm-a-pid", user_id: null, politician_id: "mdb-a" }, // Legacy-Spalte befuellt
  { id: "llm-b-uid", user_id: "mdb-b", politician_id: null }
];
const profilesRows = [
  { id: "mdb-a", name: "Mandant A" },
  { id: "mdb-b", name: "Mandant B" }
];
const helmutStoreRows = [
  { id: "main" },
  { id: "main-auth" },
  { id: "main-p-mdb-a" },
  { id: "main-p-mdb-b" }
];
const sharedKnowledgeObjects = [{ id: "ko-1" }, { id: "ko-2" }];

const JWT_A = { user_id: "mdb-a" };
const JWT_B = { user_id: "mdb-b" };
const JWT_NONE = {}; // authentifiziert, aber ohne user_id-Claim (fehlkonfiguriert)
const JWT_ANON = null; // kein JWT

(async () => {
  console.log("== 1) Deny ohne Tenant-Kontext (fehlender Claim) — alle Kategorie-A-Tabellen ==");
  check("decisions: JWT ohne user_id-Claim -> 0 Zeilen", selectRows(decisions, tenantIsolationUsing, JWT_NONE).length === 0);
  check("officeOutputs: JWT ohne user_id-Claim -> 0 Zeilen", selectRows(officeOutputs, tenantIsolationUsing, JWT_NONE).length === 0);
  check("decisions: kein JWT (anon-artig) -> 0 Zeilen", selectRows(decisions, tenantIsolationUsing, JWT_ANON).length === 0);
  check("llmUsage: kein JWT -> 0 Zeilen", selectRows(llmUsage, llmUsageUsing, JWT_ANON).length === 0);
  check("profiles: kein JWT -> 0 Zeilen", selectRows(profilesRows, profilesUsing, JWT_ANON).length === 0);
  check("helmutStore: kein JWT -> 0 Zeilen", selectRows(helmutStoreRows, helmutStoreSelectUsing, JWT_ANON).length === 0);

  console.log("== 2) Cross-Tenant-Isolation: Mandant A sieht NIE Mandant B ==");
  const decA = selectRows(decisions, tenantIsolationUsing, JWT_A);
  check("decisions(A): genau A's 2 Zeilen", decA.length === 2 && decA.every((r) => r.user_id === "mdb-a"));
  check("decisions(A): KEINE B-Zeile", !decA.some((r) => r.user_id === "mdb-b"));
  const decB = selectRows(decisions, tenantIsolationUsing, JWT_B);
  check("decisions(B): genau B's 1 Zeile, nie A", decB.length === 1 && decB[0].user_id === "mdb-b");

  const offA = selectRows(officeOutputs, tenantIsolationUsing, JWT_A);
  check("officeOutputs(A): nur A", offA.length === 1 && offA[0].user_id === "mdb-a");

  console.log("== 3) erlaubter Zugriff innerhalb desselben Tenants (positiv) ==");
  check("A erhält beide eigenen Decisions", decA.length === 2);
  check("A erhält den eigenen OfficeOutput", offA.length === 1);

  console.log("== 4) llm_usage-Sonderfall: user_id ODER politician_id ==");
  const llmA = selectRows(llmUsage, llmUsageUsing, JWT_A);
  check("llmUsage(A): 2 Zeilen (user_id- UND politician_id-Variante)", llmA.length === 2);
  check("llmUsage(A): keine B-Zeile", !llmA.some((r) => r.user_id === "mdb-b"));
  const llmB = selectRows(llmUsage, llmUsageUsing, JWT_B);
  check("llmUsage(B): genau 1 eigene Zeile", llmB.length === 1);

  console.log("== 5) profiles-Sonderfall: id IST der Mandant ==");
  const profA = selectRows(profilesRows, profilesUsing, JWT_A);
  check("profiles(A): nur die eigene Zeile (id=mdb-a)", profA.length === 1 && profA[0].id === "mdb-a");
  check("profiles(A): NICHT die B-Zeile", !profA.some((r) => r.id === "mdb-b"));

  console.log("== 6) helmut_store-Sonderfall: NUR main-p-<tenant>, NIE main/main-auth/fremd ==");
  const storeA = selectRows(helmutStoreRows, helmutStoreSelectUsing, JWT_A);
  check("helmutStore(A): genau 1 Zeile (main-p-mdb-a)", storeA.length === 1 && storeA[0].id === "main-p-mdb-a");
  check("helmutStore(A): 'main' NICHT sichtbar", !storeA.some((r) => r.id === "main"));
  check("helmutStore(A): 'main-auth' (Login-Daten aller Mandanten) NICHT sichtbar", !storeA.some((r) => r.id === "main-auth"));
  check("helmutStore(A): 'main-p-mdb-b' (fremdes Mandat) NICHT sichtbar", !storeA.some((r) => r.id === "main-p-mdb-b"));

  console.log("== 7) shared_read (Kategorie B): jeder authentifizierte Tenant liest denselben Korpus ==");
  check("knowledge_objects: authenticated (A) sieht alle geteilten Zeilen", selectRows(sharedKnowledgeObjects, sharedReadUsing, JWT_A, "authenticated").length === 2);
  check("knowledge_objects: authenticated (B) sieht dieselben geteilten Zeilen", selectRows(sharedKnowledgeObjects, sharedReadUsing, JWT_B, "authenticated").length === 2);
  check("knowledge_objects: anon-Rolle (keine Policy fuer anon) -> 0 Zeilen", selectRows(sharedKnowledgeObjects, sharedReadUsing, JWT_A, "anon").length === 0);

  console.log("== 8) pipeline_locks: keine Policy fuer authenticated/anon -> impliziter Deny ==");
  check("pipeline_locks: authenticated -> 0 (keine Policy vorhanden)", selectRows([{ job_name: "crawl-mdb-a" }], noPolicyDeny, JWT_A, "authenticated").length === 0);
  check("pipeline_locks: service_role (RLS-Bypass, ausserhalb der Policy-Prüfung) -> sieht alles", selectRows([{ job_name: "crawl-mdb-a" }], noPolicyDeny, JWT_A, "service_role").length === 1);

  console.log("== 9) anon-Rolle (volle CRUD-Grants laut information_schema, aber KEIN passendes JWT) ==");
  check("decisions: anon-Rolle ohne user_id-Claim -> 0 Zeilen (Grants allein reichen nicht)", selectRows(decisions, tenantIsolationUsing, JWT_ANON, "anon").length === 0);
  check("profiles: anon-Rolle -> 0 Zeilen", selectRows(profilesRows, profilesUsing, JWT_ANON, "anon").length === 0);

  console.log("");
  const total = pass + fail;
  if (fail === 0) {
    console.log(`${pass}/${total} RLS-Policy-Simulations-Assertionen erfolgreich.`);
    console.log("HINWEIS: Logik-Simulation, keine Live-Postgres-Ausführung (siehe Kommentar am Dateianfang).");
    process.exit(0);
  } else {
    console.log(`${fail} von ${total} RLS-Policy-Simulations-Assertionen FEHLGESCHLAGEN.`);
    process.exit(1);
  }
})();
