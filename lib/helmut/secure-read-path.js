"use strict";

// ============================================================================
// Secure Read Path — Sicherheitsfundament fuer SPAETERE Lese-Zugriffe
// ============================================================================
//
// SPRINT 9 — "Production Read Security Hardening".
//
// ZWECK: Dies ist die technische Sicherheitsbasis fuer einen kuenftigen,
// mandantengetrennten Lesepfad auf die Quellen-/Wissensplattform. Der Pfad ist
// BEWUSST INERT (fail-closed): ohne ausdrueckliche, gepruefte Lese-Berechtigung
// liest er NICHTS. Er wird in diesem Sprint NICHT aktiviert, NICHT deployt,
// NICHT migriert und an KEINEN Live-Lesepfad verdrahtet. Kein Modul im Repo
// ruft ihn im Produktivpfad auf (Beweis: `grep secure-read-path` zeigt nur
// Tests + Doku). Er aendert damit KEIN sichtbares Verhalten.
//
// ------------------------------------------------------------------------
// WARUM EIN EIGENER PFAD (statt storage.supabaseRequest)?
// ------------------------------------------------------------------------
// Der gesamte Bestand liest heute ueber `service_role` (RLS-Bypass) + einen
// app-seitig ANGEHAENGTEN `user_id=eq.<tenant>`-Filter (docs/quellenarchitektur/
// 05-sicherheitsmodell-rls.md). Das Restrisiko dieses Musters ist ein EINZIGER
// vergessener Filter: ein Entwickler baut einen mandantenbezogenen Read ohne
// `assertTenant` + Filter, und weil RLS inert ist, faengt die DB das NICHT ab
// (latentes IDOR). Der Secure Read Path beseitigt genau diese Klasse von
// Fehlern konstruktiv:
//
//   1. (P0) Tenant-Isolation ist TECHNISCH UNVERMEIDBAR — der Filter wird nicht
//      vom Aufrufer angehaengt, sondern vom Builder erzwungen. Es gibt keinen
//      Code-Pfad, der eine mandantenbezogene Query OHNE den Filter erzeugt. Ein
//      Entwickler kann ihn nicht "vergessen" (kein Roh-Endpoint-Eingang).
//   2. (Aufgabe 2) KEIN impliziter service_role-Fallback. Fehlt die sichere
//      Lese-Berechtigung -> fail-closed (throw). Nicht lesen, nicht degradieren.
//   3. (Aufgabe 3) `approvedReader` ist modul-PRIVAT (nicht exportiert). Ein
//      Reader entsteht nur ueber ein geprueftes Capability-Gate; die Capability
//      traegt ein privates Brand-Symbol und ist unfaelschbar/sealed.
//   4. (Aufgabe 4) Parameter (select/filter/order/limit/offset/or/in/header/
//      Mehrfachparameter/Encoding/Query-Pollution) sind allowlisted oder
//      blockiert. Alles andere: fail-closed.
//   5. (Aufgabe 5) Genau EINE verbindliche Tenant-Wahrheit (die Capability).
//   6. (Aufgabe 7) Read-only ist technisch erzwungen: der Transport sendet
//      ausschliesslich GET; RPC/POST/PATCH/DELETE/UPSERT sind konstruktiv
//      unmoeglich (kein Methoden-Eingang, /rpc/ verboten, Objekt eingefroren).
//
// ------------------------------------------------------------------------
// AKTIVIERUNGS-VORAUSSETZUNGEN (Aufgabe 8, NICHT Teil dieses Sprints):
// ------------------------------------------------------------------------
// Aktivierbar erst, wenn eine ECHTE, read-only DB-Rolle bereitsteht (eigener,
// freigabepflichtiger Schritt). Bis dahin sind weder `HELMUT_SECURE_READ_ROLE`
// noch `HELMUT_SECURE_READ_GRANT` gesetzt -> `resolveReadGrant()` liefert
// {ok:false} -> jede Capability-Ausgabe faellt fail-closed. Details:
// docs/quellenarchitektur/29-secure-read-path-haertung.md.
//
// KEIN Netz, KEINE DB im Modul selbst: der Transport nutzt `global.fetch`
// (in Tests stubbbar) und ist ohne konfigurierte, gueltige Read-Rolle unerreichbar.

const crypto = require("crypto");

// ── Private Marken/Symbole ──────────────────────────────────────────────────
// Ein nicht exportiertes Symbol als "Brand": nur dieses Modul kann eine gueltige
// Capability erzeugen. Ein von aussen gebautes Plain-Object hat dieses Symbol
// nie -> die Brand-Pruefung schlaegt fehl (Schutz gegen gefaelschte Capabilities,
// Aufgabe 3/9). Symbols sind nicht ueber JSON/Reflection nachbildbar.
const CAPABILITY_BRAND = Symbol("helmut.secureRead.capability");
const READER_BRAND = Symbol("helmut.secureRead.reader");

// ── Fehlerklassen (fail-closed, eindeutig unterscheidbar in Tests) ──────────
class SecureReadError extends Error {
  constructor(code, message) {
    super(`[secure-read] ${message}`);
    this.name = "SecureReadError";
    this.code = code;
  }
}
// Fehlende/ungueltige Lese-Berechtigung (Aufgabe 2: fail-closed statt service_role).
class ReadCapabilityError extends SecureReadError {
  constructor(message) { super("SECURE_READ_NO_CAPABILITY", message); this.name = "ReadCapabilityError"; }
}
// Fehlender/mehrdeutiger Mandantenkontext (Aufgabe 1/5).
class TenantTruthError extends SecureReadError {
  constructor(message) { super("SECURE_READ_TENANT_TRUTH", message); this.name = "TenantTruthError"; }
}
// Nicht erlaubter Parameter/Endpoint/Methode (Aufgabe 4/7).
class ParameterHardeningError extends SecureReadError {
  constructor(message) { super("SECURE_READ_PARAM_BLOCKED", message); this.name = "ParameterHardeningError"; }
}

// ============================================================================
// DSGVO-KLASSIFIKATION + Spalten-Allowlist je Tabelle (Aufgabe 4 + Aufgabe 6)
// ============================================================================
// class: eine der folgenden Einstufungen (Begruendung: siehe Doku Aufgabe 6)
//   "oeffentlich"  — oeffentlich zugaengliche Sachinformation (kein Personenbezug)
//   "technisch"    — technische Metadaten (IDs, Zeitstempel, Status, Zaehler)
//   "personenbezogen" — Art. 4 DSGVO: kann eine natuerliche Person betreffen
//   "art9"         — besondere Kategorie (Art. 9): politische Meinung/Inhalte
//
// REGELN, die die Klassifikation TECHNISCH durchsetzt (nicht nur dokumentiert):
//   - Eine Spalte ist nur selektierbar, wenn sie in der Allowlist steht
//     (positive Liste — unbekannte/neue Spalten sind automatisch fail-closed).
//   - "personenbezogen" nur, wenn die Capability `allowPersonal` traegt.
//   - "art9" nur, wenn die Capability `allowSensitive` traegt UND scope==='tenant'
//     (Art.-9-Inhalte gibt es nur mandantengebunden — nie im globalen Scope).
//   - Der Default-Select (spec.select weggelassen) liefert NUR
//     "oeffentlich"/"technisch" — Datensparsamkeit ab Werk.
const C = Object.freeze({ PUB: "oeffentlich", TECH: "technisch", PII: "personenbezogen", ART9: "art9" });

// Hilfsbau: {col: klasse} -> eingefrorene Spaltendefinition.
function cols(map) {
  const out = {};
  for (const [name, klasse] of Object.entries(map)) out[name] = Object.freeze({ column: name, klasse });
  return Object.freeze(out);
}

const CATALOG = Object.freeze({
  // ── Globale Referenztabellen (mandantenlos, scope 'global') ───────────────
  // Enthalten oeffentliche Quellendefinitionen. Personennamen (Person-Entitaeten,
  // Herausgeber, die Personen sind) werden KONSERVATIV als personenbezogen
  // eingestuft und sind global per Default NICHT lesbar (allowPersonal noetig).
  geographies: {
    scope: "global", tenantColumn: null,
    columns: cols({ id: C.TECH, level: C.TECH, name: C.PUB, parent_id: C.TECH, ags: C.PUB,
      created_at: C.TECH, updated_at: C.TECH })
  },
  electoral_districts: {
    scope: "global", tenantColumn: null,
    columns: cols({ id: C.TECH, kind: C.TECH, number: C.TECH, name: C.PUB, geography_id: C.TECH,
      created_at: C.TECH, updated_at: C.TECH })
  },
  political_entities: {
    scope: "global", tenantColumn: null,
    columns: cols({ id: C.TECH, entity_type: C.TECH, name: C.PII, canonical_key: C.TECH,
      level: C.TECH, geography_id: C.TECH, aliases: C.PII, created_at: C.TECH, updated_at: C.TECH })
  },
  publishers: {
    scope: "global", tenantColumn: null,
    columns: cols({ id: C.TECH, name: C.PII, canonical_domain: C.PUB, publisher_type: C.PUB,
      evidence_role: C.PUB, trust: C.PUB, lifecycle_status: C.PUB, entity_id: C.TECH,
      created_at: C.TECH, updated_at: C.TECH })
  },
  retrieval_paths: {
    scope: "global", tenantColumn: null,
    columns: cols({ id: C.TECH, publisher_id: C.TECH, legacy_source_id: C.TECH, name: C.PUB,
      method: C.TECH, url: C.PUB, query: C.PUB, parser: C.TECH, expected_frequency: C.TECH,
      priority: C.TECH, status: C.TECH, activation_mode: C.TECH, is_critical: C.TECH,
      max_items: C.TECH, last_success_at: C.TECH, last_error: C.TECH, error_streak: C.TECH,
      represents_type: C.TECH, created_at: C.TECH, updated_at: C.TECH })
  },
  source_packages: {
    scope: "global", tenantColumn: null,
    columns: cols({ id: C.TECH, key: C.TECH, name: C.PUB, purpose: C.PUB, status: C.TECH,
      is_base: C.TECH, political_level: C.PUB, geography_id: C.TECH, required_classes: C.TECH,
      created_at: C.TECH, updated_at: C.TECH })
  },

  // ── Mandantengebundene Tabellen (scope 'tenant', tenantColumn 'user_id') ──
  // Diese Tabellen tragen politische Inhalte/Bewertungen zum Mandat => Art. 9.
  // Der Default-Select liefert nur technische Spalten (Datensparsamkeit);
  // Inhalts-/Art.-9-Spalten sind nur mit allowSensitive selektierbar.
  // Nur eine POSITIVE Allowlist — unbekannte Inhalts-Spalten bleiben unlesbar.
  briefings: {
    scope: "tenant", tenantColumn: "user_id",
    columns: cols({ id: C.TECH, user_id: C.TECH, status: C.TECH, generated_at: C.TECH,
      created_at: C.TECH, updated_at: C.TECH, headline: C.ART9, summary: C.ART9 })
  },
  decisions: {
    scope: "tenant", tenantColumn: "user_id",
    columns: cols({ id: C.TECH, user_id: C.TECH, vorgang_id: C.TECH, score: C.TECH,
      decision_level: C.TECH, created_at: C.TECH, updated_at: C.TECH, rationale: C.ART9 })
  },
  matching_results: {
    scope: "tenant", tenantColumn: "user_id",
    columns: cols({ id: C.TECH, user_id: C.TECH, vorgang_id: C.TECH, score: C.TECH,
      created_at: C.TECH, updated_at: C.TECH })
  },
  office_outputs: {
    scope: "tenant", tenantColumn: "user_id",
    columns: cols({ id: C.TECH, user_id: C.TECH, kind: C.TECH, status: C.TECH,
      created_at: C.TECH, updated_at: C.TECH, content: C.ART9 })
  },
  profile_embeddings: {
    scope: "tenant", tenantColumn: "user_id",
    // embedding = technischer Merkmalsvektor; schwer + nie im Default-Select.
    columns: cols({ user_id: C.TECH, profile_hash: C.TECH, dim: C.TECH, updated_at: C.TECH })
  }
});

// ── Bekannte Tenant-Fallen (Aufgabe 5): Spalten, die faelschlich als zweite ──
// Tenant-Wahrheit missbraucht werden koennten. llm_usage traegt historisch
// BEIDE (user_id UND politician_id) — das ist die Schema-Inkonsistenz aus
// 20260712_tenant_rls_policies.sql. Der Secure Read Path registriert llm_usage
// BEWUSST NICHT als lesbar: es gaebe keine EINE verbindliche Tenant-Spalte.
// Wer llm_usage spaeter lesbar machen will, muss zuerst auf genau eine
// Tenant-Spalte kanonisieren (Migration, freigabepflichtig).
const TENANT_AMBIGUOUS_TABLES = Object.freeze(["llm_usage"]);

// Invariante (einmalig beim Laden geprueft): jede Tabelle hat HOECHSTENS eine
// Tenant-Spalte; tenant-scoped Tabellen haben GENAU eine; globale Tabellen
// enthalten keine Art.-9-Spalte (Art. 9 gibt es nur mandantengebunden).
(function assertCatalogInvariants() {
  for (const [table, def] of Object.entries(CATALOG)) {
    if (def.scope === "tenant") {
      if (!def.tenantColumn || !def.columns[def.tenantColumn]) {
        throw new SecureReadError("SECURE_READ_CATALOG_INVALID", `${table}: tenant-scoped ohne gueltige tenantColumn`);
      }
    }
    if (def.scope === "global") {
      if (def.tenantColumn) throw new SecureReadError("SECURE_READ_CATALOG_INVALID", `${table}: globale Tabelle mit tenantColumn`);
      for (const c of Object.values(def.columns)) {
        if (c.klasse === C.ART9) throw new SecureReadError("SECURE_READ_CATALOG_INVALID", `${table}.${c.column}: Art.9 im globalen Scope verboten`);
      }
    }
  }
})();

// ============================================================================
// Read-Grant: die EINZIGE Berechtigung, mit der der Pfad ueberhaupt liest.
// ============================================================================
// KEIN impliziter service_role-Fallback (Aufgabe 2). Ein Grant ist nur gueltig,
// wenn (a) eine Rolle gesetzt ist, die in READ_ONLY_ROLES steht und NICHT
// service_role ist, und (b) ein Credential vorliegt, das NICHT einem bekannten
// service-role-Schluessel entspricht. Fehlt/irrt eines -> {ok:false} ->
// fail-closed. Ist nichts konfiguriert (Produktion heute) -> inert.

const READ_ONLY_ROLES = Object.freeze(["secure_reader", "readonly", "read_only", "authenticated_readonly"]);

// Alle Schluessel, die im Bestand als privilegierter service_role-Zugang gelten.
// Der Read-Grant darf mit KEINEM davon uebereinstimmen (sonst waere es ein
// getarnter service_role-Fallback).
function knownServiceRoleKeys(env = process.env) {
  return [env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_SERVICE_KEY, env.SUPABASE_SECRET_KEY]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Prueft, ob ein Credential (auch bei whitespace-Varianten) einem service-role-
// Schluessel entspricht — timing-safe, damit der Vergleich keine Laenge verraet.
function isServiceRoleCredential(credential, env = process.env) {
  const cred = String(credential || "").trim();
  if (!cred) return false;
  return knownServiceRoleKeys(env).some((k) => timingSafeEqualStr(cred, k));
}

// Liefert {ok:true, grant:{role, credential}} NUR bei valider read-only-Rolle;
// sonst {ok:false, reason}. deps.env injizierbar fuer Tests (kein globaler Zustand).
function resolveReadGrant(deps = {}) {
  const env = deps.env || process.env;
  const role = String(env.HELMUT_SECURE_READ_ROLE || "").trim().toLowerCase();
  const credential = String(env.HELMUT_SECURE_READ_GRANT || "").trim();
  if (!role && !credential) return { ok: false, reason: "not-configured" };
  if (!role) return { ok: false, reason: "missing-role" };
  if (!credential) return { ok: false, reason: "missing-credential" };
  if (role === "service_role" || role === "postgres" || role === "supabase_admin") {
    return { ok: false, reason: "role-is-privileged" };
  }
  if (!READ_ONLY_ROLES.includes(role)) return { ok: false, reason: "role-not-allowlisted" };
  if (isServiceRoleCredential(credential, env)) return { ok: false, reason: "credential-is-service-role" };
  return { ok: true, grant: Object.freeze({ role, credential }) };
}

// ============================================================================
// Query-Builder (REINE Funktion — testbar ohne Netz). Aufgabe 4 lebt hier.
// ============================================================================
// Erzeugt aus einem STRUKTURIERTEN spec einen PostgREST-Endpoint. Der Aufrufer
// uebergibt NIE einen Roh-String -> Query-Pollution/Encoding-Bypass/Header-
// Injection sind konstruktiv ausgeschlossen. Jeder Wert wird ueber unser eigenes
// encodeURIComponent kodiert; alles Nicht-Allowlisted -> throw (fail-closed).

const ALLOWED_FILTER_OPS = Object.freeze(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"]);
const ALLOWED_SPEC_KEYS = Object.freeze(["table", "select", "filters", "order", "limit", "offset"]);
const MAX_LIMIT = 200;
const MAX_OFFSET = 100000;
const MAX_FILTERS = 12;
const MAX_IN_VALUES = 100;
const MAX_VALUE_LEN = 256;
const MAX_SELECT_COLUMNS = 40;

// Erlaubtes Zeicheninventar fuer skalare Filterwerte: druckbare Zeichen ohne die
// PostgREST-Strukturzeichen, die einen Filter aufbrechen koennten. Steuerzeichen
// (inkl. eingebettete Newlines/Nullbytes) und Komma/Klammern -> blockiert.
const SAFE_VALUE_RE = /^[A-Za-z0-9._:@/-]*$/;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isSafeColumnName(name) {
  return typeof name === "string" && /^[a-z][a-z0-9_]*$/.test(name) && name.length <= 63;
}
function isIntInRange(n, min, max) {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

function assertScalarValue(value, ctx) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) throw new ParameterHardeningError(`${ctx}: nicht-endlicher Zahlenwert`);
    return String(value);
  }
  if (t === "boolean") return value ? "true" : "false";
  if (t !== "string") throw new ParameterHardeningError(`${ctx}: Wert-Typ ${t} nicht erlaubt`);
  if (value.length > MAX_VALUE_LEN) throw new ParameterHardeningError(`${ctx}: Wert zu lang (>${MAX_VALUE_LEN})`);
  if (!SAFE_VALUE_RE.test(value)) throw new ParameterHardeningError(`${ctx}: Wert enthaelt blockierte Zeichen (Steuerzeichen/Komma/Klammer)`);
  return value;
}

// Effektive, gegen die Capability geprüfte Spalten-Allowlist (DSGVO-Gating).
function allowedColumnsFor(tableDef, capability) {
  const allow = [];
  for (const def of Object.values(tableDef.columns)) {
    if (def.klasse === C.PII && !capability.allowPersonal) continue;
    if (def.klasse === C.ART9 && !(capability.allowSensitive && capability.scope === "tenant")) continue;
    allow.push(def.column);
  }
  return allow;
}
// Default-Projektion = nur oeffentlich/technisch (Datensparsamkeit ab Werk).
function defaultSelectFor(tableDef) {
  return Object.values(tableDef.columns)
    .filter((d) => d.klasse === C.PUB || d.klasse === C.TECH)
    .map((d) => d.column);
}

// Baut den Endpoint. `capability` ist die EINZIGE Tenant-Wahrheit (Aufgabe 5).
function buildSecureQuery(capability, spec) {
  if (!isPlainObject(spec)) throw new ParameterHardeningError("spec muss ein Objekt sein");

  // (Aufgabe 4 — Query-Pollution/Unbekannte Schluessel) Fail-closed bei jedem
  // Schluessel ausserhalb der Allowlist. Kein "header", kein "or", kein
  // "endpoint", kein durchgereichter Roh-Parameter.
  for (const key of Object.keys(spec)) {
    if (!ALLOWED_SPEC_KEYS.includes(key)) throw new ParameterHardeningError(`unbekannter spec-Schluessel: ${key}`);
  }

  const table = spec.table;
  if (!isSafeColumnName(table) || !Object.prototype.hasOwnProperty.call(CATALOG, table)) {
    throw new ParameterHardeningError(`Tabelle nicht in der Allowlist: ${String(table)}`);
  }
  const tableDef = CATALOG[table];

  // (Aufgabe 1/5) Scope-/Tenant-Konsistenz: tenant-Tabelle nur mit tenant-
  // Capability + gebundenem tenantId; globale Tabelle nur mit global-Capability.
  if (tableDef.scope === "tenant") {
    if (capability.scope !== "tenant") throw new TenantTruthError(`${table}: tenant-Tabelle nur mit tenant-Capability lesbar`);
    if (!capability.tenantId) throw new TenantTruthError(`${table}: kein gebundener Mandantenkontext`);
  } else {
    if (capability.scope !== "global") throw new TenantTruthError(`${table}: globale Tabelle nur mit global-Capability lesbar`);
  }

  const params = [];

  // ── select ────────────────────────────────────────────────────────────────
  const allowedCols = allowedColumnsFor(tableDef, capability);
  let selectCols;
  if (spec.select === undefined) {
    selectCols = defaultSelectFor(tableDef);
  } else {
    if (!Array.isArray(spec.select)) throw new ParameterHardeningError("select muss ein Array sein");
    if (spec.select.length === 0 || spec.select.length > MAX_SELECT_COLUMNS) {
      throw new ParameterHardeningError(`select: 1..${MAX_SELECT_COLUMNS} Spalten`);
    }
    const seen = new Set();
    for (const c of spec.select) {
      if (!isSafeColumnName(c)) throw new ParameterHardeningError(`select: ungueltiger Spaltenname ${String(c)}`);
      if (c === "*") throw new ParameterHardeningError("select: '*' verboten (explizite Allowlist)");
      if (!allowedCols.includes(c)) throw new ParameterHardeningError(`select: Spalte nicht erlaubt/DSGVO-gesperrt: ${c}`);
      if (seen.has(c)) throw new ParameterHardeningError(`select: doppelte Spalte ${c}`);
      seen.add(c);
    }
    selectCols = spec.select;
  }
  params.push(`select=${selectCols.map(encodeURIComponent).join(",")}`);

  // ── filters ─────────────────────────────────────────────────────────────
  let tenantFilterCount = 0;
  if (spec.filters !== undefined) {
    if (!Array.isArray(spec.filters)) throw new ParameterHardeningError("filters muss ein Array sein");
    if (spec.filters.length > MAX_FILTERS) throw new ParameterHardeningError(`filters: max ${MAX_FILTERS}`);
    for (const f of spec.filters) {
      if (!isPlainObject(f)) throw new ParameterHardeningError("filter muss ein Objekt sein");
      for (const k of Object.keys(f)) {
        if (!["column", "op", "value"].includes(k)) throw new ParameterHardeningError(`filter: unbekannter Schluessel ${k}`);
      }
      const { column, op, value } = f;
      if (!isSafeColumnName(column)) throw new ParameterHardeningError(`filter: ungueltige Spalte ${String(column)}`);
      if (!allowedCols.includes(column)) throw new ParameterHardeningError(`filter: Spalte nicht erlaubt/DSGVO-gesperrt: ${column}`);
      if (!ALLOWED_FILTER_OPS.includes(op)) throw new ParameterHardeningError(`filter: Operator nicht erlaubt: ${String(op)}`);

      // (Aufgabe 1/5) Der Aufrufer darf die Tenant-Spalte NICHT selbst filtern —
      // der Tenant-Filter kommt AUSSCHLIESSLICH aus der Capability. Ein
      // eigener Tenant-Filter (auch der "richtige") wird abgewiesen, damit es
      // genau eine verbindliche Tenant-Wahrheit gibt (keine Divergenz moeglich).
      if (tableDef.tenantColumn && column === tableDef.tenantColumn) {
        throw new TenantTruthError(`filter auf Tenant-Spalte '${column}' verboten — Tenant kommt nur aus der Capability`);
      }

      let encoded;
      if (op === "in") {
        if (!Array.isArray(value)) throw new ParameterHardeningError("filter in: value muss ein Array sein");
        if (value.length === 0 || value.length > MAX_IN_VALUES) throw new ParameterHardeningError(`filter in: 1..${MAX_IN_VALUES} Werte`);
        const parts = value.map((v, i) => assertScalarValue(v, `filter in[${i}]`));
        encoded = `in.(${parts.map(encodeURIComponent).join(",")})`;
      } else if (op === "is") {
        const v = value === null ? "null" : String(value).toLowerCase();
        if (!["null", "true", "false"].includes(v)) throw new ParameterHardeningError("filter is: nur null/true/false");
        encoded = `is.${v}`;
      } else {
        const scalar = assertScalarValue(value, `filter ${column}`);
        encoded = `${op}.${encodeURIComponent(scalar)}`;
      }
      params.push(`${encodeURIComponent(column)}=${encoded}`);
    }
  }

  // ── (P0) Tenant-Filter ERZWINGEN — technisch unvermeidbar ────────────────
  // Fuer tenant-scoped Tabellen wird der Filter aus der versiegelten Capability
  // hier IMMER angehaengt. Es gibt keinen Ausgang aus dieser Funktion fuer eine
  // tenant-Tabelle ohne diesen Filter (auch nicht bei leerem spec.filters).
  if (tableDef.scope === "tenant") {
    params.push(`${encodeURIComponent(tableDef.tenantColumn)}=eq.${encodeURIComponent(capability.tenantId)}`);
    tenantFilterCount += 1;
  }

  // ── order ────────────────────────────────────────────────────────────────
  if (spec.order !== undefined) {
    if (!isPlainObject(spec.order)) throw new ParameterHardeningError("order muss ein Objekt sein");
    for (const k of Object.keys(spec.order)) {
      if (!["column", "direction"].includes(k)) throw new ParameterHardeningError(`order: unbekannter Schluessel ${k}`);
    }
    const { column, direction } = spec.order;
    if (!isSafeColumnName(column)) throw new ParameterHardeningError(`order: ungueltige Spalte ${String(column)}`);
    if (!allowedCols.includes(column)) throw new ParameterHardeningError(`order: Spalte nicht erlaubt: ${column}`);
    const dir = direction === undefined ? "asc" : direction;
    if (dir !== "asc" && dir !== "desc") throw new ParameterHardeningError(`order: direction nur asc/desc`);
    params.push(`order=${encodeURIComponent(column)}.${dir}`);
  }

  // ── limit / offset (immer gedeckelt; Default-Limit erzwungen) ─────────────
  let limit = MAX_LIMIT;
  if (spec.limit !== undefined) {
    if (!isIntInRange(spec.limit, 1, MAX_LIMIT)) throw new ParameterHardeningError(`limit: Ganzzahl 1..${MAX_LIMIT}`);
    limit = spec.limit;
  }
  params.push(`limit=${limit}`);
  if (spec.offset !== undefined) {
    if (!isIntInRange(spec.offset, 0, MAX_OFFSET)) throw new ParameterHardeningError(`offset: Ganzzahl 0..${MAX_OFFSET}`);
    params.push(`offset=${spec.offset}`);
  }

  const endpoint = `/rest/v1/${table}?${params.join("&")}`;

  // ── Nachweis-Guards (Defense-in-Depth, nach dem Bau nochmals geprueft) ────
  // Selbst wenn oben je ein Fehler entstuende, faengt diese Endkontrolle einen
  // fehlenden/mehrfachen Tenant-Filter oder eingeschmuggelte Strukturzeichen ab.
  if (tableDef.scope === "tenant") {
    const needle = `${tableDef.tenantColumn}=eq.${encodeURIComponent(capability.tenantId)}`;
    const occurrences = endpoint.split(needle).length - 1;
    if (occurrences !== 1 || tenantFilterCount !== 1) {
      throw new TenantTruthError(`Tenant-Filter-Invariante verletzt (erwartet genau 1, gefunden ${occurrences})`);
    }
  }
  if (endpoint.includes("/rpc/")) throw new ParameterHardeningError("RPC-Endpoint verboten");
  if (/[\u0000-\u0020\u007f]/.test(endpoint)) throw new ParameterHardeningError("Steuerzeichen im Endpoint");

  return endpoint;
}

// ============================================================================
// Read-only Transport (Aufgabe 7). Sendet AUSSCHLIESSLICH GET.
// ============================================================================
// Der Transport ist eine Closure — der Grant/Credential ist von aussen NICHT
// erreichbar (kein Feld, kein Getter). Methode ist hart GET; es gibt keinen
// Parameter, um sie zu aendern. POST/PATCH/DELETE/RPC/UPSERT sind damit
// konstruktiv unmoeglich, egal was der Aufrufer tut.
function createReadOnlyTransport(grant, deps = {}) {
  const fetchImpl = deps.fetch || (typeof global.fetch === "function" ? global.fetch : null);
  const baseUrl = String((deps.env || process.env).SUPABASE_URL || "").replace(/\/+$/, "");

  // Frisch berechnete, unveraenderliche Header. KEIN service_role. Der Aufrufer
  // kann keine Header beisteuern (keine Header im spec) -> keine Header-Injection.
  function headers() {
    return Object.freeze({
      apikey: grant.credential,
      Authorization: `Bearer ${grant.credential}`,
      Accept: "application/json",
      // Signalisiert der DB die gewuenschte Rolle (bei echtem Auth ausgewertet).
      "X-Helmut-Read-Role": grant.role
    });
  }

  // GET-only. `endpoint` MUSS von buildSecureQuery stammen (mit /rest/v1/... +
  // ?-Query). Ein /rpc/-Aufruf oder eine andere Methode ist hier unmoeglich.
  return async function readOnlyGet(endpoint) {
    if (typeof endpoint !== "string" || !endpoint.startsWith("/rest/v1/")) {
      throw new ParameterHardeningError("Transport akzeptiert nur /rest/v1/-Endpoints");
    }
    if (endpoint.includes("/rpc/")) throw new ParameterHardeningError("RPC verboten");
    if (!fetchImpl) throw new SecureReadError("SECURE_READ_NO_FETCH", "kein fetch verfuegbar");
    // Methode HART GET. Auch ein manipuliertes fetchImpl bekommt nie method!=GET.
    const res = await fetchImpl(`${baseUrl}${endpoint}`, { method: "GET", headers: headers() });
    if (!res || res.ok === false) {
      const status = res ? res.status : "n/a";
      throw new SecureReadError("SECURE_READ_HTTP", `Lesefehler (${status})`);
    }
    if (res.status === 204) return [];
    const text = typeof res.text === "function" ? await res.text() : "";
    return text ? JSON.parse(text) : [];
  };
}

// ============================================================================
// approvedReader — PRIVAT. Nicht exportiert (Aufgabe 3).
// ============================================================================
// Der einzige Weg an einen Reader ist openSecureReader() nach Capability-Gate.
// approvedReader baut den read-only Transport aus einem BEREITS GEPRUEFTEN Grant
// und liefert ein EINGEFRORENES Reader-Objekt. Der Transport steckt in der
// Closure — nicht als Feld -> kein Repository-Austausch/keine DI von aussen.
function approvedReader(capability, grant, deps = {}) {
  const transport = createReadOnlyTransport(grant, deps);

  // plan(): reine Vorschau des Requests OHNE Netz & OHNE Secret (nur Header-
  // NAMEN, keine Werte) — fuer Beweistests der Tenant-/Read-only-Invarianten.
  function plan(spec) {
    const endpoint = buildSecureQuery(capability, spec);
    return Object.freeze({ method: "GET", endpoint, headerNames: ["apikey", "Authorization", "Accept", "X-Helmut-Read-Role"] });
  }

  async function read(spec) {
    const endpoint = buildSecureQuery(capability, spec);
    return transport(endpoint);
  }

  const reader = {
    [READER_BRAND]: true,
    scope: capability.scope,
    tenantId: capability.tenantId,
    plan,
    read
  };
  // Einfrieren: read/plan koennen nicht ueberschrieben, keine Schreibmethode
  // kann angeheftet werden (Aufgabe 7 — kein Monkey-Patching des Readers).
  return Object.freeze(reader);
}

// ============================================================================
// Capability-Minting + oeffentliches Gate
// ============================================================================
// mintReadCapability erzeugt eine versiegelte, gebrandete Capability. Sie ist
// die EINZIGE Tenant-Wahrheit und traegt die DSGVO-Freigaben (allowPersonal/
// allowSensitive). Ohne gueltigen Grant -> ReadCapabilityError (fail-closed).
function mintReadCapability(options = {}, deps = {}) {
  const scope = options.scope === "global" ? "global" : options.scope === "tenant" ? "tenant" : null;
  if (!scope) throw new SecureReadError("SECURE_READ_BAD_SCOPE", "scope muss 'tenant' oder 'global' sein");

  // (Aufgabe 2) Grant zwingend + geprueft. Kein service_role-Fallback.
  const resolved = resolveReadGrant(deps);
  if (!resolved.ok) throw new ReadCapabilityError(`keine sichere Lese-Berechtigung (${resolved.reason}) — fail-closed`);

  let tenantId = null;
  if (scope === "tenant") {
    const raw = options.tenantId;
    if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
      throw new TenantTruthError("tenant-Capability ohne tenantId");
    }
    tenantId = String(raw).trim();
    // Tenant-ID selbst haerten: keine Strukturzeichen (verhindert, dass eine
    // praeparierte ID den erzwungenen Filter aufbricht).
    if (!SAFE_VALUE_RE.test(tenantId) || tenantId.length > MAX_VALUE_LEN) {
      throw new TenantTruthError("tenantId enthaelt unerlaubte Zeichen");
    }
  } else if (options.tenantId != null) {
    // Global-Capability darf keinen Mandanten tragen (keine zweite Wahrheit).
    throw new TenantTruthError("global-Capability darf keine tenantId tragen");
  }

  const capability = {
    [CAPABILITY_BRAND]: true,
    scope,
    tenantId,
    allowPersonal: options.allowPersonal === true,
    // Art. 9 nur mandantengebunden (nie global).
    allowSensitive: options.allowSensitive === true && scope === "tenant",
    grant: resolved.grant
  };
  return Object.freeze(capability);
}

// Brand-Pruefung: nur eine von DIESEM Modul erzeugte, versiegelte Capability
// wird akzeptiert. Ein gefaelschtes Plain-Object hat CAPABILITY_BRAND nie.
function isMintedCapability(cap) {
  return Boolean(cap) && typeof cap === "object" && cap[CAPABILITY_BRAND] === true &&
    (cap.scope === "tenant" || cap.scope === "global") &&
    cap.grant && typeof cap.grant === "object" && typeof cap.grant.credential === "string";
}

// ── OEFFENTLICHER EINSTIEG ─────────────────────────────────────────────────
// Der EINZIGE unterstuetzte Weg an einen Reader. Nimmt Optionen (scope/tenantId/
// DSGVO-Freigaben), mintet + prueft die Capability und gibt den gegateten,
// read-only, tenant-gebundenen Reader zurueck. Kein Roh-Transport, kein
// approvedReader von aussen.
function openSecureReader(options = {}, deps = {}) {
  const capability = mintReadCapability(options, deps);
  if (!isMintedCapability(capability)) throw new ReadCapabilityError("Capability-Brand-Pruefung fehlgeschlagen");
  return approvedReader(capability, capability.grant, deps);
}

// Nicht-werfende Statusabfrage: ist der Secure Read Path derzeit aktivierbar?
// (Fuer Admin-Diagnose/Doku — verraet KEIN Secret, nur ok/reason.)
function secureReadStatus(deps = {}) {
  const resolved = resolveReadGrant(deps);
  return Object.freeze({
    activatable: resolved.ok,
    reason: resolved.ok ? "grant-present" : resolved.reason,
    role: resolved.ok ? resolved.grant.role : null,
    inert: !resolved.ok
  });
}

module.exports = {
  // Oeffentliches Gate:
  openSecureReader,
  secureReadStatus,
  // Fuer Beweistests (reine Bausteine — KEIN approvedReader, KEIN Transport-Export):
  buildSecureQuery,
  mintReadCapability,
  isMintedCapability,
  resolveReadGrant,
  isServiceRoleCredential,
  CATALOG,
  TENANT_AMBIGUOUS_TABLES,
  DSGVO_CLASSES: C,
  READ_ONLY_ROLES,
  // Fehlerklassen:
  SecureReadError,
  ReadCapabilityError,
  TenantTruthError,
  ParameterHardeningError
};
