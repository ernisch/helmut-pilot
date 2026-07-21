"use strict";

// Sprint-4-Shadow · PII-freie Telemetrie (Aufgabe 7). REINE LOGIK. Deckt ab: nur technische
// Kennzahlen + anonymisierte Referenzen; verbotene Felder (Namen, E-Mail, Profile, Secrets,
// fremde Tenant-IDs, Freitext) werden zurueckgewiesen.

const T = require("../lib/helmut/quellenarchitektur/shadow-telemetry");
const shadow = require("../lib/helmut/quellenarchitektur/shadow");
const F = require("./shadow-fixtures");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const ctx = F.buildFixtureContext({ withHealth: true });
const res = shadow.runOne({ id: "m-real-name-Erika-Mustermann", partei: "SPD", fraktion: "SPD", mandatsebene: "Bundestag", bundesland: "Berlin", ausschuesse: ["Gesundheit"] }, ctx, { tenantId: "tenant-A", durationMs: 5 });

check("1 erzeugte Telemetrie ist PII-frei",
  res.telemetry.clean === true, JSON.stringify(res.telemetry.violations));
check("2 Mandatsreferenz ist ANONYMISIERT (Hash, kein Klartext-Name/keine ID)",
  /^m-[0-9a-f]{12}$/.test(res.telemetry.record.mandatsRef) && !JSON.stringify(res.telemetry.record).includes("Erika") && !JSON.stringify(res.telemetry.record).includes("m-real-name"));
check("3 Tenant-Referenz ist anonymisiert",
  /^t-[0-9a-f]{12}$/.test(res.telemetry.record.tenantRef) && !JSON.stringify(res.telemetry.record).includes("tenant-A"));
check("4 nur Allowlist-Schluessel im Record",
  Object.keys(res.telemetry.record).every((k) => T.TELEMETRY_ALLOWED_KEYS.has(k)));

// Verbotene Felder werden zurueckgewiesen.
const base = T.buildTelemetryRecord({ run: res.shadow, comparison: res.comparison, abort: res.abort, tenantId: "tenant-A" });
check("5 Klartext-Name wird zurueckgewiesen",
  T.checkTelemetryClean({ ...base, name: "Erika Mustermann" }).clean === false);
check("6 E-Mail wird zurueckgewiesen",
  T.checkTelemetryClean({ ...base, kontakt: "erika@example.com" }).clean === false);
check("7 vollstaendiges Profil (Objekt) wird zurueckgewiesen",
  T.checkTelemetryClean({ ...base, profil: { id: "x", partei: "SPD" } }).clean === false);
check("8 Secret/Token wird zurueckgewiesen (nicht-Allowlist-Feld)",
  T.checkTelemetryClean({ ...base, apiKey: "sk-123" }).clean === false);
check("9 fremde Tenant-ID im Klartext wird zurueckgewiesen (nicht-Allowlist-Feld)",
  T.checkTelemetryClean({ ...base, foreignTenant: "tenant-B" }).clean === false);
check("10 ungefilterter Rohtext (Freitext > 48 / Whitespace) wird zurueckgewiesen",
  T.checkTelemetryClean({ ...base, coverageStatus: "das ist ein langer ungefilterter rohtext mit vielen woertern" }).clean === false);
check("11 verbotener Slug-Array-Inhalt (Freitext) wird zurueckgewiesen",
  T.checkTelemetryClean({ ...base, blockerRegeln: ["dies ist ein satz"] }).clean === false);

// Positivkontrolle: der saubere Basisrecord bleibt clean.
check("12 sauberer Basisrecord ist clean",
  T.checkTelemetryClean(base).clean === true, JSON.stringify(T.checkTelemetryClean(base).violations));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Shadow-Telemetrie-Assertions`);
process.exit(failed > 0 ? 1 : 0);
