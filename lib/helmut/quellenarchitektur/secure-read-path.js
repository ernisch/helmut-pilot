"use strict";

// Helmut — Quellenplattform · Sprint 7 · Sicherer Read-Only-Produktionspfad (nur ENTWURF/Leitplanken).
// =============================================================================================
// WICHTIG: Dieses Modul liest NICHTS. Es aktiviert KEINEN Produktionszugriff. Es enthaelt KEINE
// Credentials, KEINEN Supabase-/Storage-Import, KEINEN Netz-Client. Es baut ausschliesslich die
// Sicherheits-Leitplanken (Allowlists + Pruefungen + read-only Repository-VERTRAG), die ein spaeter
// FREIGEGEBENER Read-only-Zugriff durchlaufen muesste. Ohne eine ausdruecklich injizierte, freigegebene
// Lese-Funktion ist das Repository INERT (jede Leseoperation wirft) — es gibt am Ende dieses Sprints
// weiterhin KEINE Moeglichkeit, Produktionsdaten zu lesen.

const guard = require("./production-read-guard");
const { ReadOnlyViolation } = guard;

// =============================================================================================
// Aufgabe 4 — TABELLEN-ALLOWLIST (nur was Sprint 6 wirklich braucht; keine Wildcards)
// =============================================================================================
const TABLE_ALLOWLIST = Object.freeze(["mandate_profiles", "source_crawl_telemetry"]);

// =============================================================================================
// Aufgabe 5 — FELD-ALLOWLIST je Tabelle (nur exakt benoetigte Spalten; NIE PII)
// =============================================================================================
// Mandat: nur fachliche Zuweisungsfelder + technischer Status. user_id NUR zur Pseudonymisierung
// (wird nach der Referenzbildung verworfen, nie ausgegeben). Kein Name/Mail/Telefon/Freitext.
const FIELD_ALLOWLIST = Object.freeze({
  mandate_profiles: Object.freeze([
    "user_id",                    // nur -> Pseudonym (mandat-NNN), danach verworfen
    "partei", "fraktion", "ausschuesse", "stellvertretende_ausschuesse",
    "regierungsrolle",            // Funktion
    "regionale_interessen", "regionale_themen", "relevante_ministerien",
    "themen_prioritaeten", "bundesland", "mandatsebene",
    "aktiv", "geloescht_at", "onboarding_status" // Profilvollstaendigkeit/Status
  ]),
  source_crawl_telemetry: Object.freeze([
    "source_id", "status", "started_at", "finished_at", "duration_ms",
    "error_code", "source_mode", "political_level", "source_category"
  ])
});

// Felder, die NIEMALS gelesen werden duerfen (hart, tabellenuebergreifend). Auch wenn eine Spalte
// versehentlich in einer Allowlist landet, blockt diese Sperrliste sie zusaetzlich.
const FORBIDDEN_FIELDS = Object.freeze([
  "name", "namensvarianten", "vorname", "nachname", "fullname", "full_name",
  "email", "e_mail", "mail", "telefon", "phone", "mobil", "mobilnummer",
  "adresse", "address", "session", "session_token", "token", "access_token",
  "refresh_token", "jwt", "password", "passwort", "password_hash", "passwort_hash",
  "secret", "api_key", "apikey", "gegner", "buero_uebergabe", "profil_extras", "namen"
]);

// =============================================================================================
// Aufgabe 3 — ENDPOINT-ALLOWLIST (nur exakt definierte read-only GET-Endpunkte)
// =============================================================================================
// Ein Endpoint ist NUR erlaubt, wenn er (a) GET ist, (b) auf eine Allowlist-Tabelle unter
// /rest/v1/ zielt, (c) einen expliziten select= NUR aus Allowlist-Feldern traegt (kein select=*),
// (d) einen Tenant-Filter traegt und (e) kein schreibfaehiges/RPC-Muster enthaelt.
const ENDPOINT_PREFIX = "/rest/v1/";
const ENDPOINT_ALLOWLIST_TABLES = new Set(TABLE_ALLOWLIST);

// Parst ein PostgREST-Endpoint in {table, params}. Kein Netz, reine Zerlegung.
function parseEndpoint(endpoint = "") {
  const raw = String(endpoint || "");
  if (!raw.startsWith(ENDPOINT_PREFIX)) return { ok: false, reason: "endpoint-praefix-unerlaubt" };
  const rest = raw.slice(ENDPOINT_PREFIX.length);
  const qi = rest.indexOf("?");
  const table = (qi >= 0 ? rest.slice(0, qi) : rest).trim();
  const query = qi >= 0 ? rest.slice(qi + 1) : "";
  const params = {};
  for (const kv of query.split("&")) {
    if (!kv) continue;
    const eq = kv.indexOf("=");
    const k = eq >= 0 ? kv.slice(0, eq) : kv;
    const v = eq >= 0 ? decodeURIComponent(kv.slice(eq + 1)) : "";
    (params[k] || (params[k] = [])).push(v);
  }
  return { ok: true, table, params };
}

function selectFields(params) {
  const sel = (params.select && params.select[0]) || "";
  return sel.split(",").map((s) => s.trim()).filter(Boolean);
}

// =============================================================================================
// Aufgabe 6 — AUTOMATISCHE SICHERHEITSPRUEFUNG vor JEDEM (spaeteren) Read
// =============================================================================================
// Rueckgabe {ok:true} ODER {ok:false, reason}. `assertReadRequest` wirft bei Verstoss (Abbruch).
function validateReadRequest({ method = "GET", endpoint = "", body, tenantId, validTenantIds } = {}) {
  const m = String(method || "").toUpperCase();
  // 1) Methode = GET
  if (m !== "GET") return fail("methode-nicht-get", m);
  if (body != null) return fail("body-verboten");
  // schreibfaehige/RPC-Muster (zweite Verteidigungslinie, deckt on_conflict/rpc/insert/…)
  try { guard.assertReadOnlyRequest({ method: m, endpoint, body }); }
  catch (e) { return fail("schreibfaehiges-muster", e.message); }

  const parsed = parseEndpoint(endpoint);
  if (!parsed.ok) return fail(parsed.reason, endpoint);
  const { table, params } = parsed;

  // 2/3) Endpoint + Tabelle erlaubt
  if (!ENDPOINT_ALLOWLIST_TABLES.has(table)) return fail("tabelle-nicht-allowlisted", table);
  if (!TABLE_ALLOWLIST.includes(table)) return fail("tabelle-nicht-allowlisted", table);

  // 4) SELECT * / Wildcards verboten; select MUSS explizit sein
  const fields = selectFields(params);
  if (!fields.length) return fail("kein-explizites-select");
  if (fields.includes("*") || fields.some((f) => f.includes("*"))) return fail("select-stern-verboten");

  // 5) Felder erlaubt (aus der Feld-Allowlist der Tabelle) UND nicht auf der Sperrliste
  const allowed = FIELD_ALLOWLIST[table] || [];
  for (const f of fields) {
    const base = f.toLowerCase();
    if (FORBIDDEN_FIELDS.includes(base)) return fail("feld-verboten-pii", f);
    if (!allowed.includes(f)) return fail("feld-nicht-allowlisted", f);
  }

  // 6) Tenant vorhanden + validiert
  const T = String(tenantId == null ? "" : tenantId).trim();
  if (!T) return fail("tenant-fehlt");
  if (Array.isArray(validTenantIds) && !validTenantIds.map(String).includes(T)) return fail("tenant-nicht-validiert", T);

  // 7) Keine Cross-Tenant-Abfrage: falls die Tabelle tenant-gebunden ist, MUSS der Filter exakt
  // auf den eigenen Tenant zeigen; ein abweichender/fehlender Tenant-Filter ist verboten. Fuer
  // mandate_profiles laeuft die Bindung ueber RLS (Tenant-JWT) — ein expliziter Fremd-Filter ist
  // trotzdem verboten. Wir pruefen jeden vorhandenen tenant-artigen Filter.
  const tenantFilterKeys = ["tenant_id", "user_id"];
  for (const key of tenantFilterKeys) {
    const vals = params[key] || [];
    for (const v of vals) {
      // Erwartete Form: eq.<wert>. Ein Fremd-Tenant im Filter ist ein harter Verstoss.
      const val = v.replace(/^eq\./, "");
      if (key === "tenant_id" && val && val !== T) return fail("cross-tenant-filter", val);
    }
  }

  return { ok: true, table, fields, tenantId: T };
}

function assertReadRequest(req) {
  const r = validateReadRequest(req);
  if (!r.ok) throw new ReadOnlyViolation(`Sicherheitspruefung fehlgeschlagen: ${r.reason}${r.detail ? " (" + r.detail + ")" : ""}`);
  return r;
}
function fail(reason, detail) { return { ok: false, reason, detail: detail != null ? String(detail) : undefined }; }

// =============================================================================================
// Aufgabe 2 — READ-ONLY REPOSITORY LAYER (Vertrag, INERT bis Freigabe)
// =============================================================================================
// Baut die exakten, erlaubten GET-Endpunkte und laesst KEINE andere Operation zu. Es gibt KEINE
// Schreibmethoden. Solange keine ausdruecklich FREIGEGEBENE Lese-Funktion injiziert ist, wirft jeder
// Read (`__notApproved`) — es kann NICHTS aus Produktion gelesen werden.
function notApprovedReader() {
  return async function () {
    throw new ReadOnlyViolation("Kein freigegebener Produktions-Lesepfad injiziert — Zugriff strukturell gesperrt.");
  };
}

function buildMandateEndpoint(tenantId) {
  return `${ENDPOINT_PREFIX}mandate_profiles?select=${FIELD_ALLOWLIST.mandate_profiles.join(",")}&aktiv=eq.true`;
}
function buildTelemetryEndpoint() {
  return `${ENDPOINT_PREFIX}source_crawl_telemetry?select=${FIELD_ALLOWLIST.source_crawl_telemetry.join(",")}&order=finished_at.desc`;
}

// `opts.approvedReader(endpoint)` wird NUR gesetzt, NACHDEM ein sicherer Pfad freigegeben wurde
// (spaeterer Sprint). Hier defaultet er auf notApprovedReader -> inert.
// Beobachtbar OHNE Produktionszugriff: ist ein freigegebener Reader injiziert? (In diesem Sprint
// nie — die Funktion existiert, damit ein Test die Inertheit pruefen kann.)
function isRepositoryConnected(opts = {}) {
  return typeof opts.approvedReader === "function";
}

function createSecureReadRepository(opts = {}) {
  const reader = typeof opts.approvedReader === "function" ? opts.approvedReader : notApprovedReader();
  const validTenantIds = Array.isArray(opts.validTenantIds) ? opts.validTenantIds.map(String) : null;

  async function guardedGet(endpoint, tenantId) {
    assertReadRequest({ method: "GET", endpoint, tenantId, validTenantIds });
    // Der Reader wird ausschliesslich lesend aufgerufen; er kann strukturell nichts anderes.
    return reader(endpoint, tenantId);
  }

  const repo = {
    __readOnly: true,
    listMandates(tenantId) { return guardedGet(buildMandateEndpoint(tenantId), tenantId); },
    listSourceTelemetry(tenantId) { return guardedGet(buildTelemetryEndpoint(), tenantId); }
  };
  // Read-only-Repository-Proxy: nur diese zwei Lese-Methoden aufrufbar, alles andere wirft.
  return guard.readOnlyRepository(repo, ["listMandates", "listSourceTelemetry"]);
}

// =============================================================================================
// Aufgabe 7 — ANGRIFFSSIMULATIONEN (alle muessen fehlschlagen)
// =============================================================================================
function simulateAttacks({ ownTenant = "tenant-1", validTenantIds = ["tenant-1"] } = {}) {
  const sel = FIELD_ALLOWLIST.mandate_profiles.join(",");
  const attacks = [
    { name: "POST-write", req: { method: "POST", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?select=${sel}`, tenantId: ownTenant, validTenantIds } },
    { name: "PATCH-write", req: { method: "PATCH", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?select=${sel}`, tenantId: ownTenant, validTenantIds } },
    { name: "DELETE-write", req: { method: "DELETE", endpoint: `${ENDPOINT_PREFIX}mandate_profiles`, tenantId: ownTenant, validTenantIds } },
    { name: "RPC-call", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}rpc/helmut_reserve_llm_call`, tenantId: ownTenant, validTenantIds } },
    { name: "SELECT-star", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?select=*`, tenantId: ownTenant, validTenantIds } },
    { name: "foreign-tenant", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?select=${sel}&tenant_id=eq.tenant-999`, tenantId: ownTenant, validTenantIds } },
    { name: "unknown-table", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}auth_users?select=user_id`, tenantId: ownTenant, validTenantIds } },
    { name: "unknown-field", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?select=namensvarianten`, tenantId: ownTenant, validTenantIds } },
    { name: "pii-field-email", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?select=email`, tenantId: ownTenant, validTenantIds } },
    { name: "unknown-endpoint", req: { method: "GET", endpoint: `/auth/v1/admin/users?select=id`, tenantId: ownTenant, validTenantIds } },
    { name: "missing-tenant", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?select=${sel}`, tenantId: "", validTenantIds } },
    { name: "unvalidated-tenant", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?select=${sel}`, tenantId: "tenant-hacker", validTenantIds } },
    { name: "body-smuggle", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?select=${sel}`, body: { x: 1 }, tenantId: ownTenant, validTenantIds } },
    { name: "on-conflict-upsert", req: { method: "GET", endpoint: `${ENDPOINT_PREFIX}mandate_profiles?on_conflict=user_id&select=${sel}`, tenantId: ownTenant, validTenantIds } }
  ];
  return attacks.map((a) => {
    const r = validateReadRequest(a.req);
    return { name: a.name, blocked: r.ok === false, reason: r.reason || null };
  });
}

module.exports = {
  TABLE_ALLOWLIST, FIELD_ALLOWLIST, FORBIDDEN_FIELDS, ENDPOINT_PREFIX,
  parseEndpoint, selectFields,
  validateReadRequest, assertReadRequest,
  buildMandateEndpoint, buildTelemetryEndpoint, notApprovedReader, createSecureReadRepository,
  isRepositoryConnected, simulateAttacks
};
