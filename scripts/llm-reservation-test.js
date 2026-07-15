"use strict";

// Tests fuer die atomare LLM-Call-Reservierung (Race-Fix 2026-07).
// Prueft: Parallelitaet (kein Read-then-Decide-Ueberholen), Grenzwert exakt,
// Understanding-Reserve, Tageswechsel, RPC-Fehlermodi (fail-open/fail-closed,
// fehlende Migration), lokalen Datei-Modus und die Durchsetzung am Choke-Point
// (ai.requestOpenAI) — alles offline, ohne Netz und ohne echte DB.

const assert = require("assert");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Nachbau der SQL-Semantik von helmut_reserve_llm_call als Fake-RPC: atomar,
// weil Node den synchronen Abschnitt nicht unterbricht — genau wie der Row-Lock
// in Postgres konkurrierende Upserts serialisiert.
function makeFakeRpc(state = { rows: new Map() }, opts = {}) {
  const rpc = async ({ p_day, p_scope, p_max }) => {
    if (opts.beforeEach) await opts.beforeEach();
    const key = `${p_day}|${p_scope}`;
    const row = state.rows.get(key) || { used: 0 };
    if (p_max != null && p_max <= 0) return { allowed: false, used: row.used };
    if (!state.rows.has(key)) {
      state.rows.set(key, { used: 1 });
      return { allowed: true, used: 1 };
    }
    if (p_max == null || row.used < p_max) {
      row.used += 1;
      return { allowed: true, used: row.used };
    }
    return { allowed: false, used: row.used };
  };
  rpc.state = state;
  return rpc;
}

(async () => {
  const storage = require("../lib/helmut/storage");
  const REF = "2026-07-17T09:00:00.000Z";
  const origLimit = process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
  const origReserve = process.env.HELMUT_LLM_RESERVE_UNDERSTANDING;
  const origFailClosed = process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;

  console.log("== 1) Kein Limit gesetzt -> FAIL-CLOSED Schutzlimit 50 (Budget-Rollout), Reservierung findet statt ==");
  // Seit dem Budget-Rollout gibt es KEINEN "kein Limit"-Wert mehr: fehlend/leer/
  // ungueltig aktiviert das Schutzlimit 50 (fail-closed statt unbegrenzt). Die
  // Reservierung muss dann normal greifen — mit Limit 50 statt Infinity.
  delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
  delete process.env.HELMUT_LLM_RESERVE_UNDERSTANDING;
  delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
  {
    let rpcCalled = 0;
    let seenMax = null;
    const r = await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc: async (params) => { rpcCalled += 1; seenMax = params.p_max; return { allowed: true, used: 1 }; } } });
    check("ohne gesetzte Variable: Schutzlimit 50 aktiv (limit=50, erlaubt)", r.allowed === true && r.limit === 50);
    check("Reservierung findet statt (RPC 1x, p_max=50)", rpcCalled === 1 && seenMax === 50);
  }

  console.log("== 2) RPC-Modus: Grenzwert exakt (Limit 3 -> genau 3 erlaubt) ==");
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "3";
  {
    const rpc = makeFakeRpc();
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc } }));
    check("exakt 3 erlaubt", results.filter((r) => r.allowed).length === 3);
    check("4. Reservierung abgelehnt mit ehrlichem Grund", results[3].allowed === false && results[3].reason === "daily-llm-budget-reached");
    check("used/remaining berichtet", results[2].used === 3 && results[2].remaining === 0);
    check("atomic=true im RPC-Modus", results[0].atomic === true);
  }

  console.log("== 3) RPC-Modus: 10 PARALLELE Reservierungen bei Limit 5 -> exakt 5 (der belegte Race) ==");
  {
    // beforeEach mit zufaelliger Verzoegerung VOR dem atomaren Abschnitt: simuliert
    // 10 gleichzeitige Vercel-Invocations, die alle "denselben alten Zaehlerstand"
    // sehen WUERDEN — die Atomik der Reservierung muss das Ueberholen verhindern.
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "5";
    const rpc = makeFakeRpc(undefined, { beforeEach: () => new Promise((res) => setTimeout(res, Math.floor(Math.random() * 10))) });
    const results = await Promise.all(Array.from({ length: 10 }, () => storage.reserveLlmCall({ callType: "communicationDraft", referenceIso: REF, deps: { rpc } })));
    const allowed = results.filter((r) => r.allowed).length;
    check("parallel: exakt 5 von 10 erlaubt (kein Ueberholen)", allowed === 5, `erlaubt=${allowed}`);
    check("Zaehler steht exakt auf 5", rpc.state.rows.get("2026-07-17|global").used === 5);
  }

  console.log("== 4) Understanding-Reserve: Buero stoppt frueher, Understanding darf weiter ==");
  {
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "10";
    process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = "4";
    const rpc = makeFakeRpc();
    // 6 Buero-Calls passen (10 - 4 Reserve) ...
    const office = [];
    for (let i = 0; i < 8; i++) office.push(await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc } }));
    check("Buero: exakt 6 erlaubt (Limit 10 - Reserve 4)", office.filter((r) => r.allowed).length === 6);
    check("Buero-Ablehnung nennt die Reserve als Grund", office[6].reason === "daily-llm-budget-reserved-for-understanding");
    // ... Understanding nutzt danach die volle Grenze:
    const und = [];
    for (let i = 0; i < 6; i++) und.push(await storage.reserveLlmCall({ callType: "understanding", referenceIso: REF, deps: { rpc } }));
    check("Understanding: 4 weitere erlaubt (volles Limit 10)", und.filter((r) => r.allowed).length === 4);
    check("Understanding-Ablehnung am Gesamtlimit", und[4].allowed === false && und[4].reason === "daily-llm-budget-reached");
    check("priority-Kennzeichnung", und[0].priority === true && office[0].priority === false);
  }

  console.log("== 5) Ungueltige Reserve -> 0 (Limit selbst unberuehrt) ==");
  {
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "2";
    process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = "vier";
    const rpc = makeFakeRpc();
    const a = await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc } });
    const b = await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc } });
    const c = await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc } });
    check("ungueltige Reserve wirkt wie 0 (2 von 2 erlaubt, 3. abgelehnt)", a.allowed && b.allowed && !c.allowed);
    delete process.env.HELMUT_LLM_RESERVE_UNDERSTANDING;
  }

  console.log("== 6) Tageswechsel: neuer Tag -> frischer Zaehler ==");
  {
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "1";
    const rpc = makeFakeRpc();
    const d1a = await storage.reserveLlmCall({ callType: "office-output", referenceIso: "2026-07-17T23:59:00.000Z", deps: { rpc } });
    const d1b = await storage.reserveLlmCall({ callType: "office-output", referenceIso: "2026-07-17T23:59:30.000Z", deps: { rpc } });
    const d2 = await storage.reserveLlmCall({ callType: "office-output", referenceIso: "2026-07-18T00:00:30.000Z", deps: { rpc } });
    check("Tag 1: 1 erlaubt, 2. abgelehnt", d1a.allowed === true && d1b.allowed === false);
    check("Tag 2: Zaehler frisch (erlaubt)", d2.allowed === true && d2.used === 1);
  }

  console.log("== 7) Mehrere Mandanten/Nutzer teilen den GLOBALEN Deckel ==");
  {
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "2";
    const rpc = makeFakeRpc();
    const a = await storage.reserveLlmCall({ politicianId: "mdb-a", callType: "lageBriefing", referenceIso: REF, deps: { rpc } });
    const b = await storage.reserveLlmCall({ politicianId: "mdb-b", callType: "lageBriefing", referenceIso: REF, deps: { rpc } });
    const c = await storage.reserveLlmCall({ politicianId: "mdb-c", callType: "lageBriefing", referenceIso: REF, deps: { rpc } });
    check("globaler Deckel gilt ueber Mandanten hinweg (2 erlaubt, 3. abgelehnt)", a.allowed && b.allowed && !c.allowed);
    check("ein gemeinsamer global-Scope-Zaehler", rpc.state.rows.size === 1 && rpc.state.rows.has("2026-07-17|global"));
  }

  console.log("== 8) Fehlende Migration (PGRST202/404) -> Altverhalten (nicht-atomar), kein Ausfall ==");
  {
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "5";
    const missingRpc = async () => { throw new Error('Supabase storage failed (404): {"code":"PGRST202","message":"Could not find the function"}'); };
    const usageToday = async () => ({ calls: 2 });
    const r = await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc: missingRpc, usageToday } });
    check("Fallback erlaubt unter Limit", r.allowed === true && r.atomic === false);
    const usageAt = async () => ({ calls: 5 });
    const r2 = await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc: missingRpc, usageToday: usageAt } });
    check("Fallback lehnt am Limit ab", r2.allowed === false && r2.reason === "daily-llm-budget-reached");
  }

  console.log("== 9) RPC-Infrastrukturfehler: fail-open ohne Flag, fail-closed mit Flag ==");
  {
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "5";
    const brokenRpc = async () => { throw new Error("Supabase storage failed (500): internal"); };
    delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
    const open = await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc: brokenRpc } });
    check("ohne Flag: fail-open (erlaubt) + ehrlicher Grund", open.allowed === true && open.reason === "budget-check-failed-open");
    process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = "1";
    const closed = await storage.reserveLlmCall({ callType: "office-output", referenceIso: REF, deps: { rpc: brokenRpc } });
    check("mit Flag: fail-closed (abgelehnt)", closed.allowed === false && closed.reason === "budget-check-failed-closed");
    delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
  }

  console.log("== 10) Lokaler Datei-Modus: parallel korrekt (in-Prozess-Serialisierung) ==");
  {
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "3";
    const DAY = "2026-08-01";
    let seeded = 0;
    const usageToday = async () => { seeded += 1; return { calls: 0 }; };
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      storage.reserveLlmCall({ callType: "office-output", referenceIso: `${DAY}T10:00:00.000Z`, deps: { usageToday } })
    ));
    check("lokal parallel: exakt 3 von 8 erlaubt", results.filter((r) => r.allowed).length === 3, JSON.stringify(results.map((r) => r.allowed)));
    check("Zaehler nur einmal aus dem Log geseedet", seeded === 1);
    const nextDay = await storage.reserveLlmCall({ callType: "office-output", referenceIso: "2026-08-02T10:00:00.000Z", deps: { usageToday: async () => ({ calls: 0 }) } });
    check("lokal: Tageswechsel setzt frisch auf", nextDay.allowed === true && nextDay.used === 1);
  }

  console.log("== 11) Choke-Point: ai.requestText wird bei erschoepftem Budget VOR dem Netz gestoppt ==");
  {
    const ai = require("../lib/helmut/ai");
    const origKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-dummy-niemals-benutzt";
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "5";
    const origReserveFn = storage.reserveLlmCall;
    const origRecordFn = storage.recordLlmUsage;
    const skips = [];
    storage.reserveLlmCall = async () => ({ allowed: false, used: 5, limit: 5, remaining: 0, reason: "daily-llm-budget-reached", priority: false, atomic: true });
    storage.recordLlmUsage = async (entry) => { skips.push(entry); return entry; };
    let thrown = null;
    try {
      await ai.requestText("testprompt", { callType: "office-output", politicianId: "mdb-a" });
    } catch (e) { thrown = e; }
    // Kurz warten: das Skip-Logging ist fire-and-forget.
    await new Promise((res) => setTimeout(res, 20));
    storage.reserveLlmCall = origReserveFn;
    storage.recordLlmUsage = origRecordFn;
    if (origKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = origKey;
    check("Budget erschoepft -> typisierter Fehler VOR dem HTTP-Call", thrown && thrown.code === "LLM_BUDGET_EXHAUSTED", String(thrown && thrown.message));
    check("Skip-Eintrag mit ehrlichem Grund geloggt (zaehlt nicht als billable)",
      skips.length === 1 && skips[0].callType === "skipped-office-output" && skips[0].error === "daily-llm-budget-reached");
  }

  console.log("== 12) Choke-Point: erlaubte Reservierung laesst den Call durch (genau 1 Reservierung, HTTP-Versuch findet statt) ==");
  {
    const ai = require("../lib/helmut/ai");
    const https = require("https");
    const origKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-dummy";
    const origReserveFn = storage.reserveLlmCall;
    const origRecordFn = storage.recordLlmUsage;
    const origHttpsRequest = https.request;
    let reserved = 0;
    let httpAttempts = 0;
    storage.reserveLlmCall = async () => { reserved += 1; return { allowed: true, used: 1, limit: 5, remaining: 4, reason: null, priority: false, atomic: true }; };
    storage.recordLlmUsage = async (entry) => entry;
    // Fake-https: kein Netz — der "Request" scheitert deterministisch mit einem
    // Netzfehler NACH request.end(). Beweist: die Kette lief bis zum HTTP-Versuch.
    https.request = (_url, _opts, _cb) => {
      httpAttempts += 1;
      const handlers = {};
      return {
        on(event, fn) { handlers[event] = fn; return this; },
        write() {},
        end() {
          const err = new Error("offline-test");
          err.code = "ETESTOFFLINE";
          setImmediate(() => handlers.error && handlers.error(err));
        },
        destroy() {}
      };
    };
    let thrown = null;
    try {
      await ai.requestText("testprompt", { callType: "office-output" });
    } catch (e) { thrown = e; }
    https.request = origHttpsRequest;
    storage.reserveLlmCall = origReserveFn;
    storage.recordLlmUsage = origRecordFn;
    if (origKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = origKey;
    check("Reservierung wurde genau einmal geholt", reserved === 1);
    check("HTTP-Versuch fand statt (Reservierung blockiert erlaubte Calls nicht)", httpAttempts === 1);
    check("Fehler ist der Netzfehler, KEIN Budget-Fehler", thrown && thrown.code === "ETESTOFFLINE", String(thrown && thrown.code));
  }

  // Env wiederherstellen
  if (origLimit === undefined) delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY; else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = origLimit;
  if (origReserve === undefined) delete process.env.HELMUT_LLM_RESERVE_UNDERSTANDING; else process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = origReserve;
  if (origFailClosed === undefined) delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED; else process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = origFailClosed;

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error("Testlauf abgebrochen:", error);
  process.exit(1);
});
