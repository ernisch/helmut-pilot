"use strict";

// Sprint-4-Shadow · Sicherheits-/Invarianten-Tests (Aufgabe 9). REINE LOGIK, strukturelle Checks.
// Deckt ab: richtige konsolidierte Basis, alle bisherigen Suiten vorhanden, Legacy allein
// entscheidend, Neu nur parallel, KEINE Produktionswrites, keine Auto-Aktivierung, Fehler im
// neuen Pfad beschaedigt Legacy nicht, Determinismus.

const fs = require("fs");
const path = require("path");
const shadow = require("../lib/helmut/quellenarchitektur/shadow");
const konso = require("../lib/helmut/quellenarchitektur/konsolidierung");
const F = require("./shadow-fixtures");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const LIB = path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur");
const SHADOW_FILES = ["shadow.js", "shadow-adapter.js", "shadow-run.js", "shadow-compare.js", "shadow-telemetry.js", "shadow-report.js"];
function readShadow(f) { return fs.readFileSync(path.join(LIB, f), "utf8"); }

// 1) Richtige konsolidierte Basis: Shadow baut auf der Konsolidierung auf, NICHT auf dem Dark Launch.
const allSrc = SHADOW_FILES.map(readShadow).join("\n");
check("1 Shadow-Schicht nutzt die konsolidierten Modelle (konsolidierung-*)",
  /konsolidierung-modelle/.test(allSrc) && /konsolidierung-versorgungsplan/.test(allSrc));
check("2 Shadow-Schicht importiert NICHT den isolierten Dark-Launch (kein Cherry-Pick)",
  !/require\(["'][^"']*dark-launch["']\)/.test(allSrc));
check("3 konsolidiertes Architektur-Manifest ist verfuegbar (EIN Health-/EIN Quality-Modell)",
  konso.ARCHITECTURE.health.authority === "quellenarchitektur/model.js" &&
  konso.ARCHITECTURE.quality.authority === "quellenarchitektur/quality-watchdog.js");

// 2) Alle bisherigen Suiten vorhanden (Stichprobe kritischer Vorgaenger-Suiten).
const MUST_EXIST = [
  "konsolidierung-architektur-test.js", "konsolidierung-versorgungsplan-test.js",
  "konsolidierung-legacy-shadow-test.js", "konsolidierung-tenant-isolation-test.js",
  "mandate-policyfield-consistency-test.js", "master-catalog-test.js",
  "quellenbibliothek-assignment-test.js", "tenant-neutrality-test.js"
];
check("4 bisherige Vorgaenger-Suiten sind weiterhin vorhanden (nichts entfernt)",
  MUST_EXIST.every((f) => fs.existsSync(path.join(__dirname, f))),
  MUST_EXIST.filter((f) => !fs.existsSync(path.join(__dirname, f))).join(","));

// 5) KEINE Produktionswrites / kein Netz in der Shadow-Schicht (strukturell).
const FORBIDDEN = [
  /require\(["'](fs|http|https|net|tls|child_process|dns)["']\)/,
  /\bfetch\s*\(/, /supabase/i, /writeFile|appendFile|createWriteStream/,
  /\bprocess\.env\[[^\]]+\]\s*=/, /\.rpc\(/, /INSERT\s+INTO|UPDATE\s+\w+\s+SET/i
];
let netHit = null;
for (const f of SHADOW_FILES) {
  const src = readShadow(f);
  for (const re of FORBIDDEN) if (re.test(src)) { netHit = `${f}:${re}`; break; }
  if (netHit) break;
}
check("5 keine Produktionswrites / kein Netz in der Shadow-Schicht (nur reine Logik + crypto-Hash)",
  netHit === null, netHit || "");

// 3+4+6) Legacy allein entscheidend, Neu nur parallel, keine Auto-Aktivierung.
const ctx = F.buildFixtureContext({ withHealth: true });
const batch = shadow.runShadowBatch(F.representativeMandates().map((m) => m.profile), ctx, {});
check("6 Legacy bleibt in JEDEM Fall intakt/sichtbar (allein entscheidend)",
  batch.allLegacyIntact === true);
check("7 die neue Plattform ist in KEINEM Fall automatisch aktivierbar",
  batch.noAutoActivate === true);
check("8 jeder Lauf traegt winner=legacy",
  batch.results.every((r) => r.abort.winner === "legacy"));

// 15) Fehler im neuen Pfad beschaedigt Legacy nicht.
const errShadow = shadow.run.runShadowMandate({ id: "e", partei: "SPD" }, { registry: null, legacyAdapter: ctx.legacyAdapter, healthAdapter: ctx.healthAdapter, qualityAdapter: ctx.qualityAdapter });
check("9 Fehler im neuen Pfad: neuError gesetzt, Legacy sichtbar + intakt",
  errShadow.neuError != null && errShadow.legacy.visible === true && errShadow.legacyIntact === true);

// 14) Determinismus des gesamten Batches.
const batch2 = shadow.runShadowBatch(F.representativeMandates().map((m) => m.profile), ctx, {});
check("10 gesamter Shadow-Batch ist deterministisch",
  JSON.stringify(batch.results.map((r) => r.telemetry.record)) === JSON.stringify(batch2.results.map((r) => r.telemetry.record)));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Shadow-Sicherheits-Assertions`);
process.exit(failed > 0 ? 1 : 0);
