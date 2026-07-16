"use strict";

// Sprint 1 (Sicherheit & Mehrmandantenfaehigkeit) — atomarer Kostendeckel JE MANDANT.
// Prueft die per-Mandant-Reservierung ZUSAETZLICH zum globalen Notfalldeckel:
//   * exaktes Tageslimit je Mandant (Anf. 14)
//   * parallele KI-Anfragen ueberschreiten das Limit nicht (Anf. 15)
//   * globales Limit greift zusaetzlich (Anf. 16)
//   * ein ausgeschoepfter Mandant blockiert/aushungert keinen anderen (Anf. 17)
//   * fail-closed bei fehlendem/uneindeutigem Mandantenkontext (Anf. 8)
//   * geteilte Calls (understanding/*-backfill/koTagsBackfill) sind NICHT gedeckelt
//   * Default AUS -> byte-identisch zum bisherigen Verhalten (nur globaler Scope)
//   * per-Mandant-Konfiguration (JSON-Map > uniformer Default > sicherer Fallback)
//   * lokaler Datei-Modus (in-Prozess-Serialisierung) parallel korrekt
// Alles offline: kein Netz, keine echte DB. Nur SYNTHETISCHE Mandanten.

const REF = "2026-07-17T09:00:00.000Z";
const DAY = "2026-07-17";

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Nachbau der SQL-Semantik von helmut_reserve_llm_call fuer BELIEBIGE Scopes
// (global UND tenant:<id>) — atomar, weil Node den synchronen Abschnitt nicht
// unterbricht (wie der Row-Lock in Postgres).
function makeFakeRpc(state = { rows: new Map() }, opts = {}) {
  const rpc = async ({ p_day, p_scope, p_max }) => {
    if (opts.beforeEach) await opts.beforeEach();
    const key = `${p_day}|${p_scope}`;
    const row = state.rows.get(key) || { used: 0 };
    if (p_max != null && p_max <= 0) return { allowed: false, used: row.used };
    if (!state.rows.has(key)) { state.rows.set(key, { used: 1 }); return { allowed: true, used: 1 }; }
    if (p_max == null || row.used < p_max) { row.used += 1; return { allowed: true, used: row.used }; }
    return { allowed: false, used: row.used };
  };
  rpc.state = state;
  return rpc;
}

(async () => {
  const storage = require("../lib/helmut/storage");
  const env = {};
  for (const k of ["HELMUT_TENANT_LLM_CAP", "HELMUT_MAX_LLM_CALLS_PER_DAY", "HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY", "HELMUT_TENANT_LLM_LIMITS", "HELMUT_LLM_RESERVE_UNDERSTANDING", "HELMUT_LLM_BUDGET_FAIL_CLOSED"]) env[k] = process.env[k];
  const reset = () => { for (const k of Object.keys(env)) delete process.env[k]; storage.__resetLlmReservationForTests(); };

  // ── 0) Default AUS: Deckel inert, nur globaler Scope (verhaltensneutral) ──────
  reset();
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "100";
  // Deckel NICHT gesetzt -> tenantLlmCapEnabled()===false
  {
    const rpc = makeFakeRpc();
    for (let i = 0; i < 5; i++) await storage.reserveLlmCall({ politicianId: "tenant-a", callType: "office-output", referenceIso: REF, deps: { rpc } });
    check("Deckel AUS: KEIN tenant-Scope angelegt (nur global)", rpc.state.rows.size === 1 && rpc.state.rows.has(`${DAY}|global`));
    check("Deckel AUS: alle 5 erlaubt (global 100)", rpc.state.rows.get(`${DAY}|global`).used === 5);
  }

  // ── 1) Tageslimit je Mandant greift EXAKT (Anf. 14) ──────────────────────────
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1000";              // global weit offen
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "3";      // per Mandant: 3
  {
    const rpc = makeFakeRpc();
    const res = [];
    for (let i = 0; i < 5; i++) res.push(await storage.reserveLlmCall({ politicianId: "tenant-a", callType: "office-output", referenceIso: REF, deps: { rpc } }));
    check("Mandant: exakt 3 von 5 erlaubt", res.filter((r) => r.allowed).length === 3);
    check("4. Ablehnung nennt Mandanten-Deckel + scope", res[3].allowed === false && res[3].reason === "tenant-daily-budget-reached" && res[3].scope === "tenant");
    check("tenant-Scope-Zaehler steht exakt auf 3", rpc.state.rows.get(`${DAY}|tenant:tenant-a`).used === 3);
    check("AUSGESCHOEPFTER Mandant verbraucht KEINEN globalen Slot (global=3, nicht 5)", rpc.state.rows.get(`${DAY}|global`).used === 3);
  }

  // ── 2) Zwei Mandanten: getrennte Zaehler, kein Aushungern (Anf. 17) ──────────
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1000";
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "2";
  {
    const rpc = makeFakeRpc();
    // A schoepft sein Limit aus:
    const a = [];
    for (let i = 0; i < 4; i++) a.push(await storage.reserveLlmCall({ politicianId: "tenant-a", callType: "communicationDraft", referenceIso: REF, deps: { rpc } }));
    check("Mandant A: exakt 2 erlaubt", a.filter((r) => r.allowed).length === 2);
    // B ist davon voellig unberuehrt:
    const b = [];
    for (let i = 0; i < 4; i++) b.push(await storage.reserveLlmCall({ politicianId: "tenant-b", callType: "communicationDraft", referenceIso: REF, deps: { rpc } }));
    check("Mandant B trotz ausgeschoepftem A: eigene 2 erlaubt (kein Aushungern)", b.filter((r) => r.allowed).length === 2);
    check("getrennte Zaehler tenant:A=2, tenant:B=2", rpc.state.rows.get(`${DAY}|tenant:tenant-a`).used === 2 && rpc.state.rows.get(`${DAY}|tenant:tenant-b`).used === 2);
  }

  // ── 3) Globaler Deckel greift ZUSAETZLICH (Anf. 16) ──────────────────────────
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "2";                 // global nur 2
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "100";    // Mandant weit offen
  {
    const rpc = makeFakeRpc();
    const a = await storage.reserveLlmCall({ politicianId: "tenant-a", callType: "lageBriefing", referenceIso: REF, deps: { rpc } });
    const b = await storage.reserveLlmCall({ politicianId: "tenant-b", callType: "lageBriefing", referenceIso: REF, deps: { rpc } });
    const c = await storage.reserveLlmCall({ politicianId: "tenant-c", callType: "lageBriefing", referenceIso: REF, deps: { rpc } });
    check("globaler Deckel 2 gilt ueber Mandanten hinweg (2 erlaubt, 3. abgelehnt)", a.allowed && b.allowed && !c.allowed);
    check("3. Ablehnung traegt den GLOBALEN Grund", c.reason === "daily-llm-budget-reached");
  }

  // ── 4) Fail-closed bei fehlendem Mandantenkontext (Anf. 8) ───────────────────
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1000";
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "10";
  {
    const rpc = makeFakeRpc();
    const r = await storage.reserveLlmCall({ politicianId: null, callType: "office-output", referenceIso: REF, deps: { rpc } });
    check("tenant-Call ohne Mandant -> fail-closed (abgelehnt)", r.allowed === false && r.reason === "tenant-context-missing-fail-closed");
    const r2 = await storage.reserveLlmCall({ politicianId: "  ", callType: "office-output", referenceIso: REF, deps: { rpc } });
    check("leerer Mandant -> ebenfalls fail-closed", r2.allowed === false && r2.reason === "tenant-context-missing-fail-closed");
    check("fail-closed verbraucht KEINEN globalen Slot", !rpc.state.rows.has(`${DAY}|global`));
  }

  // ── 5) Geteilte Calls sind NICHT gedeckelt (understanding/*-backfill/koTags) ──
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1000";
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "1";      // sehr niedrig — darf geteilte Calls NICHT treffen
  {
    const rpc = makeFakeRpc();
    for (const ct of ["understanding", "understanding-backfill", "understanding-staff-backfill", "koTagsBackfill"]) {
      const r = await storage.reserveLlmCall({ politicianId: null, callType: ct, referenceIso: REF, deps: { rpc } });
      check(`geteilter Call '${ct}' ist erlaubt (kein Mandanten-Deckel, kein fail-closed)`, r.allowed === true);
    }
    check("geteilte Calls legen KEINEN tenant-Scope an (nur global)", ![...rpc.state.rows.keys()].some((k) => k.includes("|tenant:")));
    check("isSharedGlobalCallType erkennt understanding-Praefix + koTagsBackfill",
      storage.isSharedGlobalCallType("understanding") && storage.isSharedGlobalCallType("understanding-backfill") && storage.isSharedGlobalCallType("koTagsBackfill") && !storage.isSharedGlobalCallType("office-output"));
  }

  // ── 6) Parallele KI-Anfragen ueberschreiten das Mandanten-Limit nicht (Anf.15) ─
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1000";
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "5";
  {
    const rpc = makeFakeRpc(undefined, { beforeEach: () => new Promise((res) => setTimeout(res, Math.floor(Math.random() * 8))) });
    const results = await Promise.all(Array.from({ length: 12 }, () => storage.reserveLlmCall({ politicianId: "tenant-a", callType: "office-output", referenceIso: REF, deps: { rpc } })));
    check("12 parallele Calls, Mandanten-Limit 5: exakt 5 erlaubt (kein Ueberholen)", results.filter((r) => r.allowed).length === 5);
    check("tenant-Zaehler steht exakt auf 5, nie darueber", rpc.state.rows.get(`${DAY}|tenant:tenant-a`).used === 5);
  }

  // ── 7) Parallel + zwei Mandanten: A gedeckelt, B laeuft ungestoert weiter ─────
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1000";
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "3";
  {
    const rpc = makeFakeRpc(undefined, { beforeEach: () => new Promise((res) => setTimeout(res, Math.floor(Math.random() * 6))) });
    const mixed = await Promise.all([
      ...Array.from({ length: 10 }, () => storage.reserveLlmCall({ politicianId: "tenant-a", callType: "office-output", referenceIso: REF, deps: { rpc } })),
      ...Array.from({ length: 3 }, () => storage.reserveLlmCall({ politicianId: "tenant-b", callType: "office-output", referenceIso: REF, deps: { rpc } }))
    ]);
    check("tenant:A exakt 3 (Limit), tenant:B exakt 3 (alle B durchgelassen)",
      rpc.state.rows.get(`${DAY}|tenant:tenant-a`).used === 3 && rpc.state.rows.get(`${DAY}|tenant:tenant-b`).used === 3, JSON.stringify([...rpc.state.rows]));
  }

  // ── 8) Per-Mandant-Konfiguration: JSON-Map > uniformer Default > Fallback ─────
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "7";
  process.env.HELMUT_TENANT_LLM_LIMITS = '{"vip":25,"knapp":2}';
  {
    check("JSON-Override gewinnt (vip=25)", storage.tenantDailyCallLimit("vip") === 25);
    check("JSON-Override gewinnt (knapp=2)", storage.tenantDailyCallLimit("knapp") === 2);
    check("kein Eintrag -> uniformer Default (7)", storage.tenantDailyCallLimit("sonst") === 7);
    check("expliziter Override schlaegt alles (override=99)", storage.tenantDailyCallLimit("vip", { override: 99 }) === 99);
  }
  // Sicherer Fallback, wenn NICHTS konfiguriert ist (Anf. 7):
  delete process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY;
  delete process.env.HELMUT_TENANT_LLM_LIMITS;
  check("ohne jede Konfiguration greift sicherer Fallback (40)", storage.tenantDailyCallLimit("irgendwer") === 40);
  process.env.HELMUT_TENANT_LLM_LIMITS = "kein-json";
  check("ungueltiges JSON -> Fallback statt Absturz", storage.tenantDailyCallLimit("irgendwer") === 40);

  // ── 9) Lokaler Datei-Modus (kein rpc): per-Mandant parallel korrekt ──────────
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1000";
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "3";
  {
    let seededA = 0;
    const usageToday = async (tid) => { if (tid === "tenant-a") seededA += 1; return { calls: 0 }; };
    const results = await Promise.all(Array.from({ length: 9 }, () =>
      storage.reserveLlmCall({ politicianId: "tenant-a", callType: "office-output", referenceIso: REF, deps: { usageToday } })
    ));
    check("lokal parallel: exakt 3 von 9 fuer tenant-a erlaubt", results.filter((r) => r.allowed).length === 3, JSON.stringify(results.map((r) => r.allowed)));
  }

  // ── 10) Choke-Point-Naehe: Ablehnung traegt priority-Flag (Konsistenz) ───────
  reset();
  process.env.HELMUT_TENANT_LLM_CAP = "1";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1000";
  process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY = "1";
  {
    const rpc = makeFakeRpc();
    await storage.reserveLlmCall({ politicianId: "tenant-a", callType: "office-output", referenceIso: REF, deps: { rpc } });
    const denied = await storage.reserveLlmCall({ politicianId: "tenant-a", callType: "office-output", referenceIso: REF, deps: { rpc } });
    check("Mandanten-Ablehnung traegt priority:false + atomic:true", denied.allowed === false && denied.priority === false && denied.atomic === true);
  }

  // Env wiederherstellen
  reset();
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error("Testlauf abgebrochen:", error); process.exit(1); });
