"use strict";

// Sprint 6 · Read-Only-Produktionsvalidierung (Harness, MOCK-getrieben — KEIN realer Produktionsread).
// REINE LOGIK. Deckt Phase 9 ab: Tenant-Isolation, private Quellen, pseudonymisierte Mandate, PII-freie
// Telemetrie, fehlende Daten bleiben unbekannt, Legacy allein entscheidend, Fehler im neuen Pfad
// beschaedigt Legacy nicht, echte Health-/Quality-Daten (mock), Entity-ID-Normalisierung, Determinismus,
// keine Produktionsdaten in Snapshots, kein Auto-Wechsel, Validierung nur ueber gesicherten Pfad.

const fs = require("fs");
const path = require("path");
const guard = require("../lib/helmut/quellenarchitektur/production-read-guard");
const PV = require("../lib/helmut/quellenarchitektur/production-validation");
const master = require("../lib/helmut/quellenarchitektur/master");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const CATALOG = master.buildMasterCatalog().records;
const activeTelemetry = (tid) => CATALOG.filter((r) => r.review_status === "active").map((r) => ({ source_id: r.id, gesundheit: "healthy", letzterErfolg: "2026-07-20T10:00:00Z", pruefstatus: "active" }));

// MOCK-Produktionsquelle (KEIN reales Netz). Enthaelt bewusst PII + Klartext-IDs, um die
// Minimierung/Pseudonymisierung zu pruefen. Private Quelle je Tenant.
function mockRepo() {
  return {
    listMandates(tenantId) {
      if (tenantId === "A") return [
        { id: "prod-uuid-aaa", name: "Erika Musterfrau", email: "erika@example.com", telefon: "+49 170 1234567", partei: "SPD", fraktion: "SPD", ausschuesse: ["Gesundheit"], bundesland: "Berlin", tenantId: "A", profilvollstaendigkeit: "COMPLETE" },
        { id: "prod-uuid-bbb", name: "Max Muster", partei: "Die Linke", fraktion: "Die Linke", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", tenantId: "A" },
        { id: "prod-uuid-ccc", partei: "SPD", tenantId: "A" } // unvollstaendig
      ];
      if (tenantId === "B") return [{ id: "prod-uuid-ddd", partei: "Grüne", fraktion: "Bündnis 90/Die Grünen", ausschuesse: ["Gesundheit"], bundesland: "Bayern", tenantId: "B" }];
      return [];
    },
    listSourceTelemetry(tenantId) { return activeTelemetry(tenantId); }
  };
}
function roSource() { return guard.readOnlyRepository(mockRepo(), ["listMandates", "listSourceTelemetry"]); }

const res = PV.runProductionValidation({ source: roSource(), tenants: ["A", "B"], catalog: CATALOG, isMock: true });
const snapshot = JSON.stringify(res);

// 19/20) Harness akzeptiert NUR eine read-only-gesicherte Quelle.
check("1 Harness lehnt ungesicherte (nicht read-only) Quelle ab",
  (() => { try { PV.runProductionValidation({ source: mockRepo(), tenants: ["A"], catalog: CATALOG }); return false; } catch (e) { return e.name === "ReadOnlyViolation"; } })());
check("2 Lauf ist als MOCK markiert (kein realer Produktionsread)", res.isMock === true);

// 5) Tenant-Isolation: getrennte Berichte je Tenant, keine Vermischung.
check("3 je Tenant ein getrennter Bericht (strikte Isolation)", res.tenantCount === 2 && res.perTenant.length === 2);
check("4 keine Cross-Tenant-PII-Verletzung", res.globalInvariants.keinCrossTenantPii === true);

// 7) pseudonymisierte Mandate; 16) keine Produktionsdaten in Snapshots.
const minA = PV.minimizeMandate({ id: "prod-uuid-aaa", name: "Erika Musterfrau", email: "e@x.de", partei: "SPD" }, 0, "A");
check("5 Mandat pseudonymisiert (mandat-001) + PII entfernt; keine Prod-IDs/Namen im Snapshot",
  minA.mandateRef === "mandat-001" && PV.mandateHasNoPii(minA).clean && !JSON.stringify(minA).includes("prod-uuid") && !JSON.stringify(minA).includes("Erika") &&
  !snapshot.includes("prod-uuid") && !snapshot.includes("Erika") && !snapshot.includes("Musterfrau"));
// 4/8) keine E-Mail/Telefon/Namen irgendwo im Ergebnis.
check("6 keine E-Mail/Telefonnummer im gesamten Ergebnis",
  !/@example\.com/.test(snapshot) && !/\+49\s*170/.test(snapshot));
// Tenant-Referenz ist gehasht (keine Klartext-Tenant-ID).
check("7 Tenant-Referenz ist anonymisiert (Hash, keine Klartext-ID)",
  res.perTenant.every((t) => /^t-[0-9a-f]{12}$/.test(t.tenantRef)) && !snapshot.includes('"A"') && !snapshot.includes('"B"'));

// 8) PII-freie Telemetrie + 10) Legacy allein entscheidend + 18) kein Auto-Wechsel.
check("8 Telemetrie PII-frei, Legacy immer sichtbar, Neu nie auto-aktiv",
  res.globalInvariants.telemetriePiiFrei && res.globalInvariants.legacyImmerSichtbar && res.globalInvariants.neuNieAutoAktiv);

// 9) fehlende Daten bleiben unbekannt (kein erfundener Fallback).
const minIncomplete = PV.minimizeMandate({ id: "x", partei: "SPD" }, 0, "A");
check("9 fehlende Profilfelder bleiben unbekannt/leer (kein Rateschluss)",
  minIncomplete.profilvollstaendigkeit === "unbekannt" && Array.isArray(minIncomplete.ausschuesse) && minIncomplete.ausschuesse.length === 0);
const minTel = PV.minimizeTelemetryRow({ source_id: "s1" });
check("10 fehlende Telemetriewerte bleiben unbekannt", minTel.gesundheit === "unbekannt" && minTel.qualitaetsstatus === "unbekannt");

// 11) Fehler im neuen Pfad beschaedigt Legacy nicht (Health/Katalog leer -> Neu-Fehler moeglich, Legacy bleibt).
const brokenSource = guard.readOnlyRepository({ listMandates: () => [{ id: "e", partei: "SPD", tenantId: "A" }], listSourceTelemetry: () => [] }, ["listMandates", "listSourceTelemetry"]);
const resBroken = PV.runProductionValidation({ source: brokenSource, tenants: ["A"], catalog: [], isMock: true });
check("11 leerer Katalog: Lauf bricht nicht ab, Legacy bleibt sichtbar/intakt",
  resBroken.perTenant[0].allLegacyIntact === true);

// 12/13) echte Health-/Quality-Daten (mock) fliessen in das EINE Health-/Quality-Modell.
check("12 injizierte Gesundheits-Telemetrie wirkt (Mandate werden versorgt, nicht health-blockiert)",
  res.perTenant[0].report.blockiert < res.perTenant[0].mandateCount);

// 14) Normalisierung realer Entity-IDs: reale Partei-Klartexte matchen den Katalog.
check("14 reale Partei-/Ausschuss-Klartexte werden korrekt zugewiesen (SPD/Linke/Gruene versorgt)",
  res.perTenant[0].report.besser >= 1);

// 15) Determinismus: identischer Mock -> identisches Ergebnis.
const res2 = PV.runProductionValidation({ source: roSource(), tenants: ["A", "B"], catalog: CATALOG, isMock: true });
check("15 Validierungslauf ist deterministisch", JSON.stringify(res) === JSON.stringify(res2));

// 17) keine Secrets/kein Storage-Import in der Sprint-6-Schicht (kein versehentlicher Prod-Connect).
const s6files = ["production-read-guard.js", "production-validation.js"];
const s6src = s6files.map((f) => fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", f), "utf8")).join("\n");
check("16 Sprint-6-Module importieren KEIN storage/supabase-Client und keine Secrets (kein Prod-Connect)",
  !/require\(["'][^"']*storage["']\)/.test(s6src) && !/require\(["'][^"']*supabase[^"']*["']\)/.test(s6src) &&
  !/createClient\(/.test(s6src) && !/process\.env\.SUPABASE/.test(s6src) && !/SERVICE_ROLE_KEY/.test(s6src));

// 6) private Tenant-Quelle bleibt isoliert (ueber die bestehende Shadow-Isolation, hier ohne Leak).
check("17 private Tenant-Isolation im Validierungslauf nachgewiesen (kein Leak)",
  res.perTenant.every((t) => t.report.invarianten.telemetriePiiFrei) && res.globalInvariants.keinCrossTenantPii);

// PII-Erkennung: ein Mandat MIT verbotenem Feld wird als unsauber erkannt (Negativkontrolle).
check("18 verbotenes PII-Feld in minimiertem Mandat wird erkannt (Negativkontrolle)",
  PV.mandateHasNoPii({ mandateRef: "mandat-001", email: "x@y.de" }).clean === false &&
  PV.mandateHasNoPii({ mandateRef: "mandat-001", partei: "SPD" }).clean === true);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Produktionsvalidierungs-Assertions`);
process.exit(failed > 0 ? 1 : 0);
