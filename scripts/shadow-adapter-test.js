"use strict";

// Sprint-4-Shadow · Read-Only-Adapter (Aufgabe 2). REINE LOGIK. Deckt ab: kein Schreiben, fehlende/
// widerspruechliche Daten bleiben SICHTBAR, KEINE erfundenen Fallbackwerte.

const A = require("../lib/helmut/quellenarchitektur/shadow-adapter");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// 1) Mandatsprofile: Identitaets-/Vollstaendigkeitsluecken bleiben sichtbar.
const mp = A.adaptMandateProfiles([
  { id: "m1", partei: "SPD", fraktion: "SPD", mandatsebene: "Bundestag", bundesland: "Berlin", name: "X", ausschuesse: ["Gesundheit"] },
  { partei: "SPD" },                    // keine ID -> Identitaet unsicher
  {}                                     // leeres Profil -> nicht nutzbar
]);
check("1 fehlende Profil-ID -> Identitaet UNSICHER (sichtbar)",
  mp.profiles[1].identityUncertain === true && mp.profiles[1].mandateId === null);
check("2 Identitaetsunsicherheit wird aggregiert gezaehlt",
  mp.identityUncertainCount >= 2);
check("3 kein erfundener Fallback: fehlende ID bleibt null (nicht generiert)",
  mp.profiles[2].mandateId === null);

// 2) Master-Katalog: ohne injizierte Records -> in-repo Seed; leerer injizierter Katalog sichtbar.
const catSeed = A.adaptMasterCatalog({});
check("4 ohne Records: Katalog aus in-repo Seed (kein Produktions-Read)",
  catSeed.source === "seed" && catSeed.count > 0);
const catEmpty = A.adaptMasterCatalog({ records: [] });
check("5 leerer injizierter Katalog bleibt sichtbar (empty:true, available:false)",
  catEmpty.empty === true && catEmpty.available === false);

// 4) Gesundheit: ohne Telemetrie -> 'unbekannt' (nie faelschlich healthy).
const hNone = A.adaptSourceHealth({});
check("6 ohne Telemetrie: Gesundheit einer Quelle ist 'unbekannt' (kein erfundenes healthy)",
  hNone.available === false && hNone.healthOf("irgendwas") === "unbekannt");
const hSome = A.adaptSourceHealth({ telemetry: [{ source_id: "s1", status: "ok", finished_at: "2026-07-20T10:00:00Z" }] });
check("7 mit Telemetrie: kanonischer Gesundheitszustand je beobachteter Quelle",
  ["healthy", "degraded", "broken", "needs_review", "paused", "archived"].includes(hSome.healthOf("s1")));
check("8 mit Telemetrie, aber unbeobachtete Quelle -> 'needs_review' (nie healthy geraten)",
  hSome.healthOf("nie-gesehen") === "needs_review");

// 5) Qualitaet: ohne Dokumentdaten -> nicht verfuegbar (nichts erfunden).
const qNone = A.adaptQualityInfo({});
check("9 ohne Dokumentdaten: Qualitaet nicht verfuegbar (available:false)",
  qNone.available === false);

// 6) Tenant: fremde private Quelle wird abgewiesen + sichtbar gezaehlt (keine Vermischung).
const tc = A.adaptTenantContext({ tenantId: "A", privateSources: [{ tenant_id: "A", id: "pa" }, { tenant_id: "B", id: "pb" }] });
check("10 Tenant-Adapter nimmt NUR eigene private Quellen (fremde abgewiesen + gezaehlt)",
  tc.privateSources.length === 1 && tc.privateSources[0].id === "pa" && tc.foreignRejected === 1);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Shadow-Adapter-Assertions`);
process.exit(failed > 0 ? 1 : 0);
