"use strict";

// Offline-Tests der V3-Radar-Engine (lib/helmut/radar.js). KEIN Netz, KEINE KI.
// Prüft die server-seitige, deterministische Klassifikation aus STRUKTURFELDERN
// (nicht Volltext-Keywords), den personen-/parteischarfen Filter, Determinismus,
// DSGVO und Fail-safe. Radar hatte bisher NULL Testabdeckung.

const radar = require("../lib/helmut/radar");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = new Date("2026-07-06T12:00:00Z").getTime();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const base = { status: "neu", understanding_status: "complete" };

const koRisk = { ...base, id: "ko-r", vorgang_id: "vg-r", display_title: "Angriff auf Abgeordnete", mentioned_people: ["Test Abgeordnete"], risiken: ["Scharfe Kritik"], updated_at: iso(3600e3), best_source_url: "https://a.de/x" };
const koDemand = { ...base, id: "ko-d", vorgang_id: "vg-d", mentioned_people: ["Test Abgeordnete"], instrument: "Kleine Anfrage", updated_at: iso(3600e3) };
const koChance = { ...base, id: "ko-c", vorgang_id: "vg-c", mentioned_parties: ["SPD"], chancen: ["Positive Presse"], updated_at: iso(3600e3) };
const koWarn = { ...base, id: "ko-w", vorgang_id: "vg-w", mentioned_people: ["Test Abgeordnete"], updated_at: iso(3600e3) };            // frisch, kein starkes Signal
const koMention = { ...base, id: "ko-m", vorgang_id: "vg-m", mentioned_people: ["Test Abgeordnete"], updated_at: iso(10 * 864e5) };   // alt -> Erwähnung
const koBoth = { ...base, id: "ko-b", vorgang_id: "vg-b", mentioned_people: ["Test Abgeordnete"], risiken: ["x"], chancen: ["y"], updated_at: iso(3600e3) };
const koUnrelated = { ...base, id: "ko-u", vorgang_id: "vg-u", mentioned_people: ["Andere Person"], mentioned_parties: ["CDU"], updated_at: iso(3600e3) };
const koPending = { id: "ko-p", vorgang_id: "vg-p", status: "pending", understanding_status: "pending", mentioned_people: ["Test Abgeordnete"] };

const profile = { id: "u-1", fullName: "Test Abgeordnete", party: "SPD" };
const allKos = [koRisk, koDemand, koChance, koWarn, koMention, koBoth, koUnrelated, koPending];

// --- 1) Klassifikation aus Strukturfeldern (Priorität risk>demand>chance>warning>mention)
check("Risiko-KO -> 'risk'", radar.classifyRadarSignal(koRisk, NOW) === "risk");
check("Anfrage/Ausschuss-KO -> 'demand'", radar.classifyRadarSignal(koDemand, NOW) === "demand");
check("Chance-KO -> 'chance'", radar.classifyRadarSignal(koChance, NOW) === "chance");
check("Frischer neutraler KO -> 'warning'", radar.classifyRadarSignal(koWarn, NOW) === "warning");
check("Alter neutraler KO -> 'mention'", radar.classifyRadarSignal(koMention, NOW) === "mention");
check("KO mit Risiko UND Chance -> 'risk' (Priorität)", radar.classifyRadarSignal(koBoth, NOW) === "risk");

// --- 2) Personen-/parteischarfer Filter + Erwähnungsgrund -------------------
const result = radar.buildRadarSignals(profile, allKos, { now: NOW });
check("Nicht-erwähnte Vorgänge werden ausgeschlossen (Andere Person/CDU)", !result.signals.some((s) => s.vorgangId === "vg-u"));
check("Pending-Vorgänge werden ausgeschlossen", !result.signals.some((s) => s.vorgangId === "vg-p"));
check("Namens-Erwähnung -> reason 'person'", (result.signals.find((s) => s.vorgangId === "vg-r") || {}).reason === "person");
check("Partei-Erwähnung -> reason 'partei'", (result.signals.find((s) => s.vorgangId === "vg-c") || {}).reason === "partei");
check("6 erwähnte Vorgänge im Radar (r,d,c,w,m,b)", result.total === 6, `total=${result.total}`);

// --- 3) Buckets: gültig + vollständige Partition ---------------------------
check("Alle signalType ∈ RADAR_BUCKETS", result.signals.every((s) => radar.RADAR_BUCKETS.includes(s.signalType)));
const bucketSum = radar.RADAR_BUCKETS.reduce((n, b) => n + result.buckets[b].length, 0);
check("Buckets partitionieren die Signale vollständig", bucketSum === result.total, `sum=${bucketSum} total=${result.total}`);
check("Risiko-Vorgang liegt im risk-Bucket", result.buckets.risk.some((s) => s.vorgangId === "vg-r"));

// --- 4) Determinismus + Leerfall -------------------------------------------
const result2 = radar.buildRadarSignals(profile, allKos, { now: NOW });
check("Radar-Engine ist deterministisch (2 Läufe gleich)", JSON.stringify(result) === JSON.stringify(result2));
const empty = radar.buildRadarSignals(profile, [], { now: NOW });
check("Leerfall: total 0, Buckets leer, kein Crash", empty.total === 0 && radar.RADAR_BUCKETS.every((b) => empty.buckets[b].length === 0));
const noName = radar.buildRadarSignals({ id: "u-x", party: "" }, allKos, { now: NOW });
check("Profil ohne Name/Partei -> keine Fremd-Signale (kein universeller Match)", noName.total === 0);

// --- 5) DSGVO + Signalform --------------------------------------------------
check("Signale tragen nur öffentliche Vorgangsdaten (kein privates Profilfeld)",
  !JSON.stringify(result).toLowerCase().includes("email"));
const sig = result.signals.find((s) => s.vorgangId === "vg-r");
check("Signal trägt title + signalType + url + reason", sig && sig.title && sig.signalType && sig.knowledgeObjectId === "ko-r");

// --- 7) Eigenerwähnung des Abgeordneten zuverlässig erkennen (Step-4-Nachschliff)
// Radar muss Eigenerwähnungen finden — auch wenn der Name NICHT als strukturierte
// mentioned_*-Erwähnung extrahiert wurde, sondern nur im öffentlichen KO-Analysetext steht.
{
  const mdb = { id: "u-mdb", fullName: "Cem Özdemir", party: "Grüne" };
  const one = (ko) => radar.buildRadarSignals(mdb, [{ ...base, id: "ko-x", vorgang_id: "vg-x", updated_at: iso(3600e3), ...ko }], { now: NOW });
  check("Eigenerwähnung: voller Name in mentioned_mps -> reason=person",
    one({ mentioned_mps: ["Cem Özdemir"] }).signals[0] && one({ mentioned_mps: ["Cem Özdemir"] }).signals[0].reason === "person");
  check("Eigenerwähnung: Nachname allein in mentioned_people -> reason=person",
    (one({ mentioned_people: ["Özdemir"] }).signals[0] || {}).reason === "person");
  check("Eigenerwähnung PROSE-Fallback: voller Name im display_title (nicht extrahiert) -> person",
    (one({ display_title: "Cem Özdemir fordert schnellere Agrarwende" }).signals[0] || {}).reason === "person");
  check("Eigenerwähnung PROSE-Fallback: distinktiver Nachname als Wort im was_ist_passiert -> person",
    (one({ was_ist_passiert: "Im Ausschuss kritisierte Özdemir die Verzögerung." }).signals[0] || {}).reason === "person");
  check("Kein Fehltreffer: anderer Politiker + fremde Partei -> kein Signal",
    one({ mentioned_people: ["Robert Habeck"], mentioned_parties: ["SPD"], display_title: "Habeck stellt Plan vor" }).total === 0);
  // Whole-word-Guard: Nachname darf NICHT als Teilwort matchen ('ince' in 'provinces').
  check("Kein Teilwort-Fehltreffer: 'ince' in 'Provinces' matcht nicht",
    radar.buildRadarSignals({ id: "u-ince", fullName: "Cem Ince", party: "Die Linke" },
      [{ ...base, id: "ko-y", vorgang_id: "vg-y", updated_at: iso(3600e3), display_title: "Debatte über Provinces und Finanzen" }], { now: NOW }).total === 0);
}

// --- 6) Shadow-Runner: Fail-safe + Happy-Path (injizierte Deps) -------------
(async () => {
  const off = await radar.buildRadarForUser({ userId: "u-1" }, { enabled: () => false });
  check("buildRadarForUser: Store aus -> skipped (v3-store-disabled)", off.skipped && off.reason === "v3-store-disabled");

  const ok = await radar.buildRadarForUser({ profile, now: NOW }, {
    enabled: () => true,
    listKnowledgeObjects: () => allKos
  });
  check("buildRadarForUser Happy-Path: erwähnte Signale, korrekt gruppiert", ok.total === 6 && ok.buckets.risk.length >= 1);

  const errSafe = await radar.buildRadarForUser({ profile, now: NOW }, {
    enabled: () => true,
    listKnowledgeObjects: () => { throw new Error("boom"); }
  });
  check("buildRadarForUser: Fehler -> skipped (radar-error), kein Crash", errSafe.skipped && errSafe.reason === "radar-error");

  console.log(`\n${passed}/${passed + failed} Radar-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
