"use strict";

// Sprint 7 · Sicherer Read-Only-Produktionspfad (nur Leitplanken). REINE LOGIK, KEIN Produktionsread,
// KEINE Verbindung. Deckt Aufgabe 8 ab: Allowlist, Blocklist, Read-only-Guard, Endpoint-/Feld-/
// Tabellen-/Tenant-Pruefung, Angriffssimulationen — und die harte Garantie: das Repository ist INERT.

const fs = require("fs");
const path = require("path");
const S = require("../lib/helmut/quellenarchitektur/secure-read-path");
const guard = require("../lib/helmut/quellenarchitektur/production-read-guard");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const OWN = "tenant-1", VALID = ["tenant-1", "tenant-2"];
function legit(endpoint, tenantId = OWN) { return S.validateReadRequest({ method: "GET", endpoint, tenantId, validTenantIds: VALID }); }

// --- Allowlists ------------------------------------------------------------------------------
check("1 Tabellen-Allowlist ist minimal + ohne Wildcard",
  S.TABLE_ALLOWLIST.length === 2 && S.TABLE_ALLOWLIST.includes("mandate_profiles") && S.TABLE_ALLOWLIST.includes("source_crawl_telemetry") && !S.TABLE_ALLOWLIST.includes("*"));
check("2 Feld-Allowlist enthaelt KEINE PII-Spalten",
  Object.values(S.FIELD_ALLOWLIST).flat().every((f) => !S.FORBIDDEN_FIELDS.includes(String(f).toLowerCase())));
check("3 Sperrliste deckt Name/Mail/Telefon/Session/Token/Passwort ab",
  ["name", "email", "telefon", "session", "token", "passwort", "password_hash", "namensvarianten"].every((f) => S.FORBIDDEN_FIELDS.includes(f)));

// --- legitimer Zugriff -----------------------------------------------------------------------
check("4 legitimer Mandats-GET (Allowlist-Felder + Tenant) wird akzeptiert",
  legit(S.buildMandateEndpoint(OWN)).ok === true);
check("5 legitimer Telemetrie-GET wird akzeptiert",
  S.validateReadRequest({ method: "GET", endpoint: S.buildTelemetryEndpoint(), tenantId: OWN, validTenantIds: VALID }).ok === true);
check("6 gebaute Endpunkte enthalten KEIN select=* und nur Allowlist-Felder",
  !S.buildMandateEndpoint(OWN).includes("select=*") && !S.buildTelemetryEndpoint().includes("select=*"));

// --- Aufgabe 7: Angriffssimulationen — ALLE muessen blockiert werden --------------------------
const attacks = S.simulateAttacks({ ownTenant: OWN, validTenantIds: VALID });
const REQUIRED_ATTACKS = ["POST-write", "PATCH-write", "DELETE-write", "RPC-call", "SELECT-star", "foreign-tenant", "unknown-table", "unknown-field", "pii-field-email", "unknown-endpoint", "missing-tenant", "unvalidated-tenant", "body-smuggle", "on-conflict-upsert"];
check("7 alle geforderten Angriffe sind abgedeckt",
  REQUIRED_ATTACKS.every((a) => attacks.some((x) => x.name === a)));
check("8 JEDER simulierte Angriff wird blockiert (keiner geht durch)",
  attacks.every((a) => a.blocked === true), attacks.filter((a) => !a.blocked).map((a) => a.name).join(","));
check("9 POST/PATCH/DELETE scheitern an 'methode-nicht-get'",
  ["POST-write", "PATCH-write", "DELETE-write"].every((n) => attacks.find((a) => a.name === n).reason === "methode-nicht-get"));
check("10 SELECT * wird als 'select-stern-verboten' blockiert",
  attacks.find((a) => a.name === "SELECT-star").reason === "select-stern-verboten");
check("11 Fremd-Tenant-Filter wird als 'cross-tenant-filter' blockiert",
  attacks.find((a) => a.name === "foreign-tenant").reason === "cross-tenant-filter");
check("12 unbekannte Tabelle wird blockiert",
  attacks.find((a) => a.name === "unknown-table").reason === "tabelle-nicht-allowlisted");
check("13 PII-Feld (email/namensvarianten) wird blockiert",
  attacks.find((a) => a.name === "pii-field-email").reason === "feld-verboten-pii" &&
  attacks.find((a) => a.name === "unknown-field").reason === "feld-verboten-pii");
check("14 RPC + on_conflict werden als schreibfaehiges Muster blockiert",
  attacks.find((a) => a.name === "RPC-call").reason === "schreibfaehiges-muster" &&
  attacks.find((a) => a.name === "on-conflict-upsert").reason === "schreibfaehiges-muster");

// --- einzelne Pruefungen (Endpoint/Feld/Tabelle/Tenant) --------------------------------------
check("15 fehlendes explizites select wird abgelehnt",
  S.validateReadRequest({ method: "GET", endpoint: "/rest/v1/mandate_profiles", tenantId: OWN, validTenantIds: VALID }).reason === "kein-explizites-select");
check("16 unbekanntes (nicht-PII, nicht-allowlisted) Feld wird abgelehnt",
  S.validateReadRequest({ method: "GET", endpoint: "/rest/v1/mandate_profiles?select=ki_budget_monatlich_cent", tenantId: OWN, validTenantIds: VALID }).reason === "feld-nicht-allowlisted");
check("17 fehlender Tenant wird abgelehnt",
  legit(S.buildMandateEndpoint(OWN), "").reason === "tenant-fehlt");
check("18 nicht-validierter Tenant wird abgelehnt",
  legit(S.buildMandateEndpoint(OWN), "tenant-fremd").reason === "tenant-nicht-validiert");

// --- Aufgabe 2: Repository ist INERT (kein Produktionsread moeglich) --------------------------
check("19 ohne freigegebenen Reader ist das Repository NICHT verbunden",
  S.isRepositoryConnected({}) === false && S.isRepositoryConnected({ validTenantIds: VALID }) === false);
(async () => {
  const repo = S.createSecureReadRepository({ validTenantIds: VALID });
  let blocked = false;
  try { await repo.listMandates(OWN); } catch (e) { blocked = e.name === "ReadOnlyViolation"; }
  check("20 Repository-Read ist strukturell gesperrt (inert, kein freigegebener Pfad)", blocked);
  let telBlocked = false;
  try { await repo.listSourceTelemetry(OWN); } catch (e) { telBlocked = e.name === "ReadOnlyViolation"; }
  check("21 auch Telemetrie-Read ist gesperrt", telBlocked);
  // Schreibmethoden existieren nicht -> Proxy wirft.
  let writeBlocked = false;
  try { repo.upsertMandate({}); } catch (e) { writeBlocked = e.name === "ReadOnlyViolation"; }
  check("22 keine Schreibmethode am Repository aufrufbar (Proxy sperrt)", writeBlocked);

  // --- selbst MIT (Test-)Reader kann NUR gelesen werden, und Angriffe scheitern VOR dem Reader --
  let readerCalls = [];
  const testRepo = S.createSecureReadRepository({ validTenantIds: VALID, approvedReader: async (ep) => { readerCalls.push(ep); return [{ ok: true }]; } });
  await testRepo.listMandates(OWN);
  check("23 injizierter Reader wird NUR mit validiertem Allowlist-GET aufgerufen",
    readerCalls.length === 1 && readerCalls[0].startsWith("/rest/v1/mandate_profiles?select=") && !readerCalls[0].includes("*"));

  // --- Strukturgarantie: KEIN Storage/Supabase/Secret-Import in der Sprint-7-Schicht ----------
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", "secure-read-path.js"), "utf8");
  check("24 Sprint-7-Modul importiert KEIN storage/supabase, keine Credentials, keinen Netz-Client",
    !/require\(["'][^"']*storage["']\)/.test(src) && !/require\(["'][^"']*supabase[^"']*["']\)/.test(src) &&
    !/createClient\(/.test(src) && !/process\.env/.test(src) && !/require\(["']https?["']\)/.test(src) && !/\bfetch\s*\(/.test(src));
  check("25 Service-Role + MCP kommen im Lesepfad strukturell nicht vor",
    !/service_role|SERVICE_ROLE/i.test(src) && !/mcp/i.test(src));

  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Secure-Read-Path-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})();
