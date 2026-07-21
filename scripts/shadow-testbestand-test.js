"use strict";

// Sprint-4-Shadow · Repraesentativer Testbestand (Aufgabe 4) + weitere Pflichtfaelle (Aufgabe 9).
// REINE LOGIK, synthetische Fixtures, KEINE reale Person. Deckt ab: 14 Faelle, verschiedene
// Parteien/Ausschuesse/Regionen, unvollstaendige Profile, KEINE Pilot-Sonderlogik, Google News
// nicht als alleinige Pflichtversorgung, globale Quellen nicht dupliziert, private Tenant-Isolation.

const fs = require("fs");
const path = require("path");
const shadow = require("../lib/helmut/quellenarchitektur/shadow");
const versorgungsplan = require("../lib/helmut/quellenarchitektur/konsolidierung-versorgungsplan");
const F = require("./shadow-fixtures");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const ctx = F.buildFixtureContext({ withHealth: true });
const cases = F.representativeMandates();

// 1) Alle 14 repraesentativen Faelle laufen OHNE Ausnahme durch (Neu-Plan oder ehrlicher Fehler).
let allRan = true; const perCase = {};
for (const c of cases) {
  const res = shadow.runOne(c.profile, ctx, c.key === "private-tenant" ? { tenantId: "A", privateSources: [{ tenant_id: "A", id: "privA" }, { tenant_id: "B", id: "privB" }] } : {});
  perCase[c.key] = res;
  if (!res.shadow || res.shadow.legacyIntact !== true) allRan = false;
}
check("1 mindestens 14 repraesentative Faelle abgedeckt", cases.length >= 14, String(cases.length));
check("2 alle Faelle laufen durch, Legacy bleibt in jedem Fall intakt", allRan);

// 16) verschiedene Parteien -> verschiedene Plaene.
check("3 verschiedene Parteien ergeben verschiedene Quellenmengen",
  planIds(perCase["partei-linke"]) !== planIds(perCase["partei-spd"]));
// 17) verschiedene Ausschuesse.
check("4 verschiedene Ausschuesse werden getroffen (Arbeit&Soziales vs. Gesundheit)",
  perCase["partei-linke"].shadow.neu.sources.some((s) => s.id === "src-bmas") &&
  perCase["partei-spd"].shadow.neu.sources.some((s) => s.id === "src-bmg"));
// 18) verschiedene Regionen.
check("5 verschiedene Regionen werden getroffen (Bayern vs. Niedersachsen)",
  perCase["bundesland-bayern"].shadow.neu.sources.some((s) => s.id === "src-bayern") &&
  perCase["bundesland-nds"].shadow.neu.sources.some((s) => s.id === "src-nds"));
// mehrere Ausschuesse gleichzeitig
check("6 mehrere Ausschuesse gleichzeitig werden beide abgedeckt",
  perCase["mehrere-ausschuesse"].shadow.neu.sources.some((s) => s.id === "src-bmas") &&
  perCase["mehrere-ausschuesse"].shadow.neu.sources.some((s) => s.id === "src-bmg"));
// 19) unvollstaendiges Profil -> kein Crash, ehrlicher Status.
check("7 unvollstaendiges Profil: kein Crash, Legacy intakt",
  perCase["unvollstaendig"].shadow.legacyIntact === true && perCase["unvollstaendig"].shadow.neu != null);
// neue Partei / neue Region OHNE Sonderlogik -> generisch behandelt (unterversorgt, ehrlich).
check("8 neue Partei ohne Sonderlogik: generisch behandelt, kritische Luecke ehrlich benannt",
  perCase["neue-partei"].abort.blockers.some((b) => b.regel === "neue-kritische-luecke"));
check("9 neue Region ohne Sonderlogik: generisch behandelt (kein Crash)",
  perCase["neue-region"].shadow.neu != null && perCase["neue-region"].shadow.legacyIntact === true);

// 10) Google News NICHT als alleinige Pflichtversorgung (AfD -> Blocker).
check("10 Suchanbieter-Alleinversorgung eines Pflichtbedarfs -> Abbruch (nie stille Freigabe)",
  perCase["google-news-abhaengig"].abort.blockers.some((b) => b.regel === "suchanbieter-alleinversorgung") &&
  perCase["google-news-abhaengig"].abort.freigabefaehig === false);

// 11) globale Quellen NICHT pro Mandant kopiert (100 gleiche Mandate -> jede Quelle einmal).
const many = Array.from({ length: 100 }, (_, i) => ({ id: "m" + i, partei: "SPD", fraktion: "SPD", ausschuesse: ["Gesundheit"] }));
const global = versorgungsplan.buildGlobalSupplyPlan(many, ctx.registry);
check("11 globale Quellen nicht dupliziert (100 Mandate -> jede Quelle einmal, refCount=100)",
  global.activeSourceCount <= F.buildFixtureCatalog().length &&
  global.activeSources.some((s) => s.refCount === 100));

// 12) private Tenant-Isolation: A sieht NIE die private Quelle von B.
check("12 private Tenant-Isolation eingehalten (A sieht nicht B)",
  perCase["private-tenant"].tenantIsolated === true);

// 20) KEINE Pilot-/Mandanten-Sonderlogik in der Shadow-Schicht.
const SHADOW_FILES = ["shadow.js", "shadow-adapter.js", "shadow-run.js", "shadow-compare.js", "shadow-telemetry.js", "shadow-report.js"];
const FORBIDDEN = [/===\s*["']pilot["']/i, /["']pilot["']\s*===/i, /isPilot/i, /pilotOnly/i];
let pilotHit = null;
for (const f of SHADOW_FILES) {
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", f), "utf8");
  for (const re of FORBIDDEN) if (re.test(src)) { pilotHit = `${f}:${re}`; break; }
  if (pilotHit) break;
}
check("13 keine Pilot-Sonderlogik in der Shadow-Schicht (strukturell)", pilotHit === null, pilotHit || "");
// Ein 'pilot'-benanntes Mandat laeuft denselben Pfad (kein Sonderzweig).
const pilotRes = shadow.runOne({ id: "pilot", partei: "SPD", fraktion: "SPD", ausschuesse: ["Gesundheit"] }, ctx, {});
const normalRes = shadow.runOne({ id: "m-normal", partei: "SPD", fraktion: "SPD", ausschuesse: ["Gesundheit"] }, ctx, {});
check("14 'pilot'-Mandat nutzt denselben Code-Pfad wie jedes andere (gleiche Quellenmenge)",
  planIds(pilotRes) === planIds(normalRes));

function planIds(res) { return JSON.stringify((res.shadow.neu ? res.shadow.neu.sources : []).map((s) => s.id)); }

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Shadow-Testbestand-Assertions`);
process.exit(failed > 0 ? 1 : 0);
