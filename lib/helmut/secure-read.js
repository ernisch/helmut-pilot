"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// Secure Read Path (Zielarchitektur, Sprint 11) — fail-closed Lese-Gateway.
//
// Einziger erlaubter Weg für mandantenbezogene Reads in der Zielarchitektur:
//   Capability Gate → Tenant Gate → Parameter Allowlist → Read-only → Executor
//
// Der Executor ist transport-agnostisch (Dependency Injection):
//   * Preview:     führt gegen die readonly-Rolle einer Wegwerf-Postgres aus.
//   * Production:  würde gegen PostgREST mit einem GoTrue-Token der Rolle
//                  `helmut_readonly` + Tenant-Claim laufen (NICHT Teil dieses
//                  Sprints — kein Production-Wiring).
//
// Grundprinzip FAIL CLOSED: jede Unsicherheit (unbekannte Capability, fehlender
// Tenant, nicht-erlaubter Parameter, deaktiviertes Gate, Executor-Fehler)
// führt zu DENY, niemals zu einem breiteren Zugriff.
// ═══════════════════════════════════════════════════════════════════════════

// Ein Ergebnis ist IMMER { ok: bool, ... }. Bei ok=false steht in `reason` ein
// stabiler Maschinencode und in `detail` eine menschenlesbare Erklärung.
function deny(reason, detail) {
  return { ok: false, reason, detail: detail || reason, rows: null };
}
function allow(rows, meta) {
  return { ok: true, rows, reason: null, detail: null, meta: meta || {} };
}

// Ein Identifier-Guard: nur [a-z_][a-z0-9_]* — schützt vor jeder SQL-Injektion
// über Capability-/Spaltennamen (Werte gehen ohnehin nie in den SQL-Text).
const IDENT = /^[a-z_][a-z0-9_]*$/;

function isPlainTenant(t) {
  // Tenant-IDs des Projekts sind schlichte Slugs (politicianId). Kein Whitespace,
  // keine Quotes, nicht leer. Werte werden zwar als Claim (nicht als SQL) genutzt,
  // aber die Tenant-Gate lehnt offensichtlich manipulierte Werte früh ab.
  return typeof t === "string" && t.length > 0 && t.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(t);
}

// Baut aus einer Capability-Definition + geprüften Parametern eine reine
// SELECT-Anweisung. Es werden AUSSCHLIESSLICH allowlisted Identifier
// interpoliert; Filterwerte werden als Parameterliste zurückgegeben, damit der
// Executor sie gebunden (nicht interpoliert) einsetzt.
function buildSelect(cap, columns, filters) {
  const cols = columns.map((c) => `"${c}"`).join(", ");
  const where = [];
  const values = [];
  for (const key of Object.keys(filters)) {
    values.push(filters[key]);
    where.push(`"${key}" = $${values.length}`);
  }
  const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
  const limit = cap.maxRows ? ` limit ${Number(cap.maxRows) | 0}` : "";
  return { text: `select ${cols} from "${cap.table}"${whereSql}${limit}`, values };
}

// executor(sql, { tenant, capability }) -> Promise<{ ok, rows } | throws>
// muss die readonly-Rolle + Tenant-Claim verwenden (RLS erzwingt Isolation).
function createSecureReadPath(config) {
  const {
    capabilities = {},
    executor,
    enabled = true, // Kill-Switch (Aufgabe 7: Aktivierung/Rollback ohne Handgriff)
    onEvent, // optionaler Audit-Hook (Aufgabe 6 Shadow/Telemetrie)
  } = config || {};

  // Capability-Definitionen einmalig validieren (fail closed beim Aufbau).
  for (const [name, cap] of Object.entries(capabilities)) {
    if (!IDENT.test(name)) throw new Error(`ungültiger Capability-Name: ${name}`);
    if (!cap || !IDENT.test(cap.table)) throw new Error(`Capability ${name}: ungültige table`);
    for (const c of cap.columns || []) if (!IDENT.test(c)) throw new Error(`Capability ${name}: ungültige Spalte ${c}`);
    for (const f of cap.filters || []) if (!IDENT.test(f)) throw new Error(`Capability ${name}: ungültiger Filter ${f}`);
    if (!cap.shared && !cap.tenantColumn) throw new Error(`Capability ${name}: tenantColumn fehlt (nicht shared)`);
    if (cap.tenantColumn && !IDENT.test(cap.tenantColumn)) throw new Error(`Capability ${name}: ungültige tenantColumn`);
  }

  async function read(request) {
    const req = request || {};
    const emit = (verdict, reason) => {
      if (typeof onEvent === "function") {
        try { onEvent({ capability: req.capability, tenant: req.tenant, verdict, reason }); } catch (_) { /* Audit darf nie den Pfad brechen */ }
      }
    };

    // ── Gate 0: Kill-Switch (fail closed) ─────────────────────────────────
    if (!enabled) { emit("deny", "disabled"); return deny("disabled", "Secure Read Path ist deaktiviert"); }

    // ── Gate 1: Capability Gate ───────────────────────────────────────────
    const cap = capabilities[req.capability];
    if (!cap) { emit("deny", "unknown_capability"); return deny("unknown_capability", `unbekannte Capability: ${req.capability}`); }

    // ── Gate 2: Read-only Gate ────────────────────────────────────────────
    // Nur explizit als read deklarierte Capabilities; jede andere Absicht (write)
    // ist in diesem Pfad strukturell unmöglich (es gibt keine write-Funktion).
    if (cap.mode && cap.mode !== "read") { emit("deny", "not_readonly"); return deny("not_readonly", "nur Lesezugriff erlaubt"); }

    // ── Gate 3: Tenant Gate (fail closed ohne gültigen Tenant) ─────────────
    let tenant = null;
    if (!cap.shared) {
      tenant = req.tenant;
      if (!isPlainTenant(tenant)) { emit("deny", "missing_tenant"); return deny("missing_tenant", "kein gültiger Tenant-Kontext"); }
    }

    // ── Gate 4: Parameter Allowlist ───────────────────────────────────────
    const params = req.params || {};
    const allowedFilters = new Set(cap.filters || []);
    const filters = {};
    for (const key of Object.keys(params)) {
      if (!allowedFilters.has(key)) { emit("deny", "param_not_allowed"); return deny("param_not_allowed", `Parameter nicht erlaubt: ${key}`); }
      const v = params[key];
      if (v == null || typeof v === "object") { emit("deny", "param_bad_type"); return deny("param_bad_type", `ungültiger Parameterwert für ${key}`); }
      filters[key] = v;
    }
    // Tenant-Filter wird IMMER serverseitig erzwungen (zusätzlich zur RLS —
    // Defense-in-Depth: die App vertraut sich selbst nicht, RLS ist die harte Linie).
    if (!cap.shared) filters[cap.tenantColumn] = tenant;

    // Spaltenauswahl: nur allowlisted Spalten; Default = alle erlaubten.
    let columns = cap.columns || [];
    if (Array.isArray(req.columns) && req.columns.length) {
      for (const c of req.columns) {
        if (!(cap.columns || []).includes(c)) { emit("deny", "column_not_allowed"); return deny("column_not_allowed", `Spalte nicht erlaubt: ${c}`); }
      }
      columns = req.columns;
    }
    if (!columns.length) { emit("deny", "no_columns"); return deny("no_columns", "keine lesbaren Spalten definiert"); }

    // ── Ausführung über den Executor (readonly-Rolle + Tenant-Claim) ───────
    const sql = buildSelect(cap, columns, filters);
    try {
      const res = await executor(sql, { tenant, capability: req.capability, cap });
      if (!res || res.ok !== true || !Array.isArray(res.rows)) {
        emit("deny", "executor_failed");
        return deny("executor_failed", "Executor lieferte kein gültiges Ergebnis");
      }
      emit("allow", null);
      return allow(res.rows, { rowCount: res.rows.length, sql: sql.text });
    } catch (e) {
      // FAIL CLOSED: jeder Executor-Fehler → DENY, niemals Fallback auf breiteren Zugriff.
      emit("deny", "executor_error");
      return deny("executor_error", String(e && e.message ? e.message : e));
    }
  }

  return { read, capabilities, enabled };
}

module.exports = { createSecureReadPath, buildSelect, isPlainTenant, IDENT };
