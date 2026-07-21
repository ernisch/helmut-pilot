"use strict";

// ============================================================================
// Secure Read Path — Funktions- + Haertungstest (Sprint 9)
// ============================================================================
// Beweist die Sicherheitsgarantien des kuenftigen Lesepfads OHNE Netz/DB/LLM:
//   Aufgabe 1 — Tenant-Isolation technisch unvermeidbar (P0)
//   Aufgabe 2 — kein service_role-Fallback, fail-closed ohne Read-Grant
//   Aufgabe 3 — approvedReader nicht direkt nutzbar, Capability-gated
//   Aufgabe 4 — Parameter-Hardening (select/filter/order/limit/offset/or/in/…)
//   Aufgabe 5 — genau eine verbindliche Tenant-Wahrheit
//   Aufgabe 6 — DSGVO-Gating (personenbezogen/Art.9 nur mit Freigabe)
//   Aufgabe 7 — Read-only technisch erzwungen (GET-only)
//
// KEIN echtes Netz: der HTTP-Transport wird ueber deps.fetch mit einem lokalen
// Recorder gestubbt (kein globaler Zustand, kein Egress).

const secure = require("../lib/helmut/secure-read-path");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function throws(fn) {
  try { const r = fn(); if (r && typeof r.then === "function") return r.then(() => null, (e) => e); return null; }
  catch (e) { return e; }
}
async function throwsAsync(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

// Gueltiger Test-Grant (read-only Rolle, KEIN service_role-Credential).
const GRANT_ENV = { HELMUT_SECURE_READ_ROLE: "secure_reader", HELMUT_SECURE_READ_GRANT: "test-readonly-key-abc123", SUPABASE_URL: "https://example.supabase.co" };
const deps = (extra = {}) => ({ env: { ...GRANT_ENV, ...(extra.env || {}) }, ...extra });

(async () => {
  // ── Aufgabe 2: fail-closed ohne/mit falschem Grant ────────────────────────
  {
    const e1 = throws(() => secure.openSecureReader({ scope: "global" }, { env: {} }));
    check("Ohne Read-Grant: openSecureReader wirft (fail-closed)", e1 && e1.code === "SECURE_READ_NO_CAPABILITY", String(e1));

    const e2 = throws(() => secure.openSecureReader({ scope: "global" }, { env: { HELMUT_SECURE_READ_GRANT: "x" } }));
    check("Grant ohne Rolle: fail-closed", e2 && e2.code === "SECURE_READ_NO_CAPABILITY", String(e2));

    const e3 = throws(() => secure.openSecureReader({ scope: "global" }, { env: { HELMUT_SECURE_READ_ROLE: "service_role", HELMUT_SECURE_READ_GRANT: "x" } }));
    check("Rolle=service_role: abgewiesen (kein privilegierter Fallback)", e3 && e3.code === "SECURE_READ_NO_CAPABILITY", String(e3));

    const e4 = throws(() => secure.openSecureReader({ scope: "global" }, { env: { HELMUT_SECURE_READ_ROLE: "admin", HELMUT_SECURE_READ_GRANT: "x" } }));
    check("Rolle nicht allowlisted: abgewiesen", e4 && e4.code === "SECURE_READ_NO_CAPABILITY", String(e4));

    // Grant-Credential = service_role-Key -> getarnter Fallback, muss scheitern.
    const e5 = throws(() => secure.openSecureReader({ scope: "global" }, { env: {
      HELMUT_SECURE_READ_ROLE: "secure_reader", HELMUT_SECURE_READ_GRANT: "SRK-SECRET",
      SUPABASE_SERVICE_ROLE_KEY: "SRK-SECRET"
    } }));
    check("Grant-Credential == service_role-Key: abgewiesen (Tarnung erkannt)", e5 && e5.code === "SECURE_READ_NO_CAPABILITY", String(e5));

    check("secureReadStatus meldet inert ohne Grant", secure.secureReadStatus({ env: {} }).inert === true);
    check("secureReadStatus meldet aktivierbar mit gueltigem Grant", secure.secureReadStatus(deps()).activatable === true);
  }

  // ── Aufgabe 3: approvedReader nicht exportiert / nicht direkt nutzbar ──────
  {
    check("approvedReader ist NICHT exportiert", secure.approvedReader === undefined);
    check("Kein Transport/kein Roh-Endpoint exportiert",
      secure.createReadOnlyTransport === undefined && secure.supabaseRequest === undefined);
    // Gefaelschte Capability (Plain-Object) wird nicht akzeptiert.
    const fake = { scope: "tenant", tenantId: "evil", grant: { role: "secure_reader", credential: "x" } };
    check("Gefaelschte Capability besteht Brand-Pruefung NICHT", secure.isMintedCapability(fake) === false);
    const real = secure.mintReadCapability({ scope: "tenant", tenantId: "t-1" }, deps());
    check("Echte Capability besteht Brand-Pruefung", secure.isMintedCapability(real) === true);
    check("Echte Capability ist eingefroren (sealed)", Object.isFrozen(real));
  }

  // ── Aufgabe 1 + P0: Tenant-Filter technisch unvermeidbar ──────────────────
  {
    const reader = secure.openSecureReader({ scope: "tenant", tenantId: "tenant-A" }, deps());
    check("tenant-Reader traegt gebundenen tenantId", reader.tenantId === "tenant-A");

    // Jeder Plan auf eine tenant-Tabelle enthaelt GENAU einen Tenant-Filter.
    const tenantTables = Object.entries(secure.CATALOG).filter(([, d]) => d.scope === "tenant").map(([t]) => t);
    for (const table of tenantTables) {
      const plan = reader.plan({ table });
      const needle = `user_id=eq.tenant-A`;
      const count = plan.endpoint.split(needle).length - 1;
      check(`Plan(${table}) enthaelt GENAU 1 Tenant-Filter`, count === 1, plan.endpoint);
    }

    // Auch OHNE spec.filters wird der Filter erzwungen.
    const plan = reader.plan({ table: "briefings", filters: [] });
    check("Leere filters-Liste -> Tenant-Filter trotzdem erzwungen", plan.endpoint.includes("user_id=eq.tenant-A"), plan.endpoint);

    // Der Aufrufer kann die Tenant-Spalte NICHT selbst filtern (auch nicht 'richtig').
    const eOwn = throws(() => reader.plan({ table: "briefings", filters: [{ column: "user_id", op: "eq", value: "tenant-A" }] }));
    check("Eigener Tenant-Filter (sogar korrekt) wird abgewiesen", eOwn && eOwn.code === "SECURE_READ_TENANT_TRUTH", String(eOwn));
    const eForeign = throws(() => reader.plan({ table: "briefings", filters: [{ column: "user_id", op: "eq", value: "tenant-B" }] }));
    check("Fremd-Tenant-Filter wird abgewiesen", eForeign && eForeign.code === "SECURE_READ_TENANT_TRUTH", String(eForeign));

    // Es gibt keinen Roh-Endpoint-Eingang -> spec.endpoint ist ein Fehler.
    const eEndpoint = throws(() => reader.plan({ table: "briefings", endpoint: "/rest/v1/briefings?select=*" }));
    check("spec.endpoint (Roh-Endpoint) wird abgewiesen", eEndpoint && eEndpoint.code === "SECURE_READ_PARAM_BLOCKED", String(eEndpoint));
  }

  // ── Aufgabe 5: genau EINE Tenant-Wahrheit ─────────────────────────────────
  {
    // global-Capability darf keine tenantId tragen.
    const e = throws(() => secure.mintReadCapability({ scope: "global", tenantId: "sneaky" }, deps()));
    check("global-Capability mit tenantId -> abgewiesen", e && e.code === "SECURE_READ_TENANT_TRUTH", String(e));

    // tenant-Capability ohne tenantId -> abgewiesen.
    const e2 = throws(() => secure.mintReadCapability({ scope: "tenant" }, deps()));
    check("tenant-Capability ohne tenantId -> abgewiesen", e2 && e2.code === "SECURE_READ_TENANT_TRUTH", String(e2));

    // tenant-Tabelle mit global-Capability -> abgewiesen.
    const g = secure.openSecureReader({ scope: "global" }, deps());
    const e3 = throws(() => g.plan({ table: "briefings" }));
    check("global-Reader darf keine tenant-Tabelle lesen", e3 && e3.code === "SECURE_READ_TENANT_TRUTH", String(e3));

    // globale Tabelle mit tenant-Capability -> abgewiesen (klare Scope-Trennung).
    const t = secure.openSecureReader({ scope: "tenant", tenantId: "t-x" }, deps());
    const e4 = throws(() => t.plan({ table: "publishers" }));
    check("tenant-Reader darf keine globale Tabelle lesen", e4 && e4.code === "SECURE_READ_TENANT_TRUTH", String(e4));

    // llm_usage (dual tenant column) ist bewusst NICHT registriert.
    check("llm_usage als mehrdeutig markiert", secure.TENANT_AMBIGUOUS_TABLES.includes("llm_usage"));
    check("llm_usage NICHT im Katalog (keine zweite Tenant-Wahrheit)", secure.CATALOG.llm_usage === undefined);
  }

  // ── Aufgabe 4: Parameter-Hardening ────────────────────────────────────────
  {
    const g = secure.openSecureReader({ scope: "global" }, deps());
    const t = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps());

    // Unbekannte Tabelle
    check("Unbekannte Tabelle -> blockiert", (throws(() => g.plan({ table: "geheim_tabelle" })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // Unbekannter spec-Schluessel (Query-Pollution/Roh-Param)
    check("Unbekannter spec-Schluessel -> blockiert", (throws(() => g.plan({ table: "publishers", or: "(id.eq.1)" })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("spec.header -> blockiert (keine Header-Injection)", (throws(() => g.plan({ table: "publishers", header: { x: "y" } })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // select '*' verboten
    check("select '*' -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["*"] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // nicht-allowlisted Spalte
    check("Unbekannte select-Spalte -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["secret_col"] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // doppelte Spalte
    check("Doppelte select-Spalte -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["id", "id"] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // Operator nicht erlaubt
    check("Filter-Operator 'cs' (contains) -> blockiert", (throws(() => g.plan({ table: "publishers", filters: [{ column: "name", op: "cs", value: "x" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // 'or' als Operator existiert nicht -> blockiert
    check("Filter-Operator 'or' -> blockiert", (throws(() => g.plan({ table: "publishers", filters: [{ column: "id", op: "or", value: "x" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // Wert mit Strukturzeichen (Komma/Klammer) -> blockiert (PostgREST-Aufbruch)
    check("Filterwert mit Komma -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["id"], filters: [{ column: "canonical_domain", op: "eq", value: "a,b" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("Filterwert mit Klammer -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["id"], filters: [{ column: "canonical_domain", op: "eq", value: "a)or(1" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // Steuerzeichen / Newline / Nullbyte / Space im Wert -> blockiert
    check("Filterwert mit Newline -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["id"], filters: [{ column: "canonical_domain", op: "eq", value: "a\nb" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("Filterwert mit Nullbyte -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["id"], filters: [{ column: "canonical_domain", op: "eq", value: "a" + String.fromCharCode(0) + "b" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("Filterwert mit Tab -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["id"], filters: [{ column: "canonical_domain", op: "eq", value: "a\tb" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("Filterwert mit Space -> blockiert (Query-Pollution)", (throws(() => g.plan({ table: "publishers", select: ["id"], filters: [{ column: "canonical_domain", op: "eq", value: "a b" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("Filterwert mit Prozent (Encoding-Bypass) -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["id"], filters: [{ column: "canonical_domain", op: "eq", value: "a%00b" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // limit/offset-Grenzen
    check("limit 0 -> blockiert", (throws(() => g.plan({ table: "publishers", limit: 0 })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("limit 9999 -> blockiert (Deckel)", (throws(() => g.plan({ table: "publishers", limit: 9999 })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("limit 1.5 -> blockiert (keine Ganzzahl)", (throws(() => g.plan({ table: "publishers", limit: 1.5 })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("offset -1 -> blockiert", (throws(() => g.plan({ table: "publishers", offset: -1 })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // order-Richtung
    check("order-Richtung 'sideways' -> blockiert", (throws(() => g.plan({ table: "publishers", order: { column: "name", direction: "sideways" } })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    check("in-Filter mit >100 Werten -> blockiert", (throws(() => g.plan({ table: "publishers", select: ["id"], filters: [{ column: "id", op: "in", value: Array.from({ length: 101 }, (_, i) => "v" + i) }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");

    // Positiv: ein valider, gedeckelter Plan
    const okPlan = g.plan({ table: "publishers", select: ["id", "canonical_domain", "trust"], filters: [{ column: "trust", op: "eq", value: "hoch" }], order: { column: "canonical_domain" }, limit: 50 });
    check("Valider global-Plan enthaelt limit-Deckel", okPlan.endpoint.includes("limit=50"), okPlan.endpoint);
    check("Valider Plan ist GET", okPlan.method === "GET");
    // Ohne explizites limit: Default-Deckel greift trotzdem.
    check("Ohne limit -> Default-Deckel im Endpoint", g.plan({ table: "publishers", select: ["id"] }).endpoint.includes("limit=200"));

    // 'name' ist personenbezogen -> im global-Default-Select NICHT enthalten.
    const dflt = g.plan({ table: "publishers" });
    check("Default-Select laesst personenbezogene 'name' weg (Datensparsamkeit)", !/select=[^&]*\bname\b/.test(dflt.endpoint), dflt.endpoint);
  }

  // ── Aufgabe 6: DSGVO-Gating ───────────────────────────────────────────────
  {
    // personenbezogen nur mit allowPersonal.
    const gNoPii = secure.openSecureReader({ scope: "global" }, deps());
    check("Ohne allowPersonal: select 'name' (PII) blockiert", (throws(() => gNoPii.plan({ table: "publishers", select: ["name"] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    const gPii = secure.openSecureReader({ scope: "global", allowPersonal: true }, deps());
    check("Mit allowPersonal: select 'name' erlaubt", gPii.plan({ table: "publishers", select: ["name"] }).endpoint.includes("name"));

    // Art. 9 nur mandantengebunden + allowSensitive.
    const tNoSens = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps());
    check("Ohne allowSensitive: Art.9 'headline' blockiert", (throws(() => tNoSens.plan({ table: "briefings", select: ["headline"] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    const tSens = secure.openSecureReader({ scope: "tenant", tenantId: "t-1", allowSensitive: true }, deps());
    check("Mit allowSensitive (tenant): Art.9 'headline' erlaubt", tSens.plan({ table: "briefings", select: ["headline"] }).endpoint.includes("headline"));

    // Art. 9 kann NIE global freigeschaltet werden (allowSensitive im global-Scope wirkungslos).
    const gSensAttempt = secure.mintReadCapability({ scope: "global", allowSensitive: true }, deps());
    check("allowSensitive im global-Scope bleibt false", gSensAttempt.allowSensitive === false);

    // Katalog-Invariante: keine Art.9-Spalte in globaler Tabelle.
    let art9Global = false;
    for (const [, d] of Object.entries(secure.CATALOG)) {
      if (d.scope === "global") for (const c of Object.values(d.columns)) if (c.klasse === "art9") art9Global = true;
    }
    check("Keine Art.9-Spalte in einer globalen Tabelle", art9Global === false);
  }

  // ── Aufgabe 7: Read-only technisch — GET-only Transport ───────────────────
  {
    const calls = [];
    const fakeFetch = async (url, opts) => {
      calls.push({ url, method: opts.method, headers: opts.headers });
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: "row-1" }]) };
    };
    const reader = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps({ fetch: fakeFetch }));
    const rows = await reader.read({ table: "briefings", select: ["id", "status"] });
    check("read() liefert Zeilen ueber gestubbten Transport", Array.isArray(rows) && rows[0].id === "row-1");
    check("Transport sendet ausschliesslich GET", calls.length === 1 && calls[0].method === "GET", JSON.stringify(calls[0] && calls[0].method));
    check("Transport-URL enthaelt Tenant-Filter", calls[0].url.includes("user_id=eq.t-1"), calls[0].url);
    check("Transport nutzt KEIN service_role (Authorization = Read-Grant)", calls[0].headers.Authorization === "Bearer test-readonly-key-abc123");
    check("Transport traegt Read-Rollen-Header", calls[0].headers["X-Helmut-Read-Role"] === "secure_reader");

    // Reader hat KEINE Schreibmethoden.
    check("Reader hat keine write/insert/update/delete-Methoden",
      ["write", "insert", "update", "delete", "post", "patch", "rpc", "upsert"].every((m) => typeof reader[m] === "undefined"));
    check("Reader ist eingefroren (kein Anheften von Methoden)", Object.isFrozen(reader));

    // Selbst ein manipuliertes fetch kann keine non-GET-Methode erhalten:
    // read() ruft transport, transport haelt method hart auf GET.
    const mutating = [];
    const evilFetch = async (url, opts) => { mutating.push(opts.method); return { ok: true, status: 200, text: async () => "[]" }; };
    const reader2 = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps({ fetch: evilFetch }));
    await reader2.read({ table: "briefings" });
    check("Auch mit veraendertem fetch bleibt Methode GET", mutating.every((m) => m === "GET"));
  }

  console.log(`\n${passed}/${passed + failed} Secure-Read-Path-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
