"use strict";

// Tests der Discovery-Strategie (Auftrag §6). REINE LOGIK mit injizierten Providern
// (kein Netz). Deckt ab:
//   - neue Quellen finden (Provider-Intake, Normalisierung, Dedup gegen Bestand)
//   - doppelte Quellen erkennen (harte Dubletten + Redundanz-Hinweis)
//   - veraltete Quellen erkennen (kein Erfolg seit Frist / defekt / archiviert / verboten)
//   - defekte Quellen ersetzen (gleichwertige gesunde Ersatzkandidaten)
//   - Qualitätsverlust verhindern (Dimensionsabdeckung/Score/Vertrauen dürfen nicht sinken)

const { SourceRegistry } = require("../lib/helmut/quellenbibliothek/registry");
const { intakeCandidates, findStaleSources, findDuplicateClusters, proposeReplacements, guardQualityLoss } = require("../lib/helmut/quellenbibliothek/discovery");
const { normalizeDescriptor } = require("../lib/helmut/quellenbibliothek/descriptor");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- 1) Intake neuer Quellen ------------------------------------------------
const reg = new SourceRegistry();
reg.add({ id: "bestand", publisher: "Bestand", name: "Bestand", access: { method: "rss", url: "https://bestand.de/rss", parser: "generic_rss" }, topics: ["t"] });

const providerA = {
  name: "sitemap",
  discover: () => [
    { publisher: "Neu1", access: { method: "rss", url: "https://neu1.de/rss" }, topics: ["arbeit"] },
    { publisher: "Bestand", access: { method: "rss", url: "https://bestand.de/rss?utm_source=x" }, topics: ["t"] }, // = Bestand (Dublette)
    { publisher: "", access: { method: "rss", url: "https://kaputt.de/rss" } }                                // ungültig (kein publisher/keine Dimension)
  ]
};
const providerB = {
  name: "outlinks",
  discover: () => [
    { publisher: "Neu1", access: { method: "rss", url: "https://neu1.de/rss" }, topics: ["arbeit"] },        // = providerA Neu1 (intra-dup)
    { publisher: "Neu2", access: { method: "rss", url: "https://neu2.de/rss" }, regions: ["berlin"] }
  ]
};
const intake = intakeCandidates(reg, [providerA, providerB]);
check("1a neue eindeutige Kandidaten aufgenommen", intake.accepted.map((d) => d.publisher).sort().join(",") === "Neu1,Neu2");
check("1b Bestands-Dublette erkannt (nicht erneut)", intake.knownDuplicates.length === 1);
check("1c Provider-übergreifende Dublette erkannt", intake.intraDuplicates.length === 1);
check("1d ungültiger Kandidat abgelehnt", intake.rejected.length === 1);
check("1e Fundweg (discoveredVia) am Kandidaten vermerkt", intake.accepted.every((d) => d.meta && typeof d.meta.discoveredVia === "string"));
check("1f defekter Provider (wirft) bricht Intake nicht ab", (() => {
  const bad = { name: "boom", discover: () => { throw new Error("x"); } };
  const r = intakeCandidates(reg, [bad, providerB]);
  return r.accepted.length >= 1;
})());

// --- 2) Doppelte Quellen erkennen -------------------------------------------
const descs = [
  normalizeDescriptor({ id: "x1", publisher: "X", access: { method: "rss", url: "https://x.de/feed" }, topics: ["t"] }),
  normalizeDescriptor({ id: "x2", publisher: "X", access: { method: "rss", url: "https://x.de/feed?utm_source=a" }, topics: ["t"] }), // = x1
  normalizeDescriptor({ id: "x3", publisher: "X", access: { method: "rss", url: "https://x.de/other" }, topics: ["t"] })       // gleicher Herausgeber+Methode
];
const dup = findDuplicateClusters(descs);
check("2a harte Dublette (identischer canonicalKey) erkannt", dup.hardDuplicates.length === 1 && dup.hardDuplicates[0].ids.length === 2);
check("2b Redundanz-Hinweis (Herausgeber+Methode mehrfach)", dup.redundant.some((c) => c.ids.length >= 2));

// --- 3) Veraltete Quellen erkennen ------------------------------------------
const now = 1000 * 3600 * 1000;
const reg2 = new SourceRegistry();
reg2.add({ id: "frisch", publisher: "F", name: "F", access: { method: "rss", url: "https://f.de/rss" }, topics: ["t"], status: "active", health: { state: "reachable", lastSuccessAt: now - 3600 * 1000 } });
reg2.add({ id: "alt", publisher: "A", name: "A", access: { method: "rss", url: "https://a.de/rss" }, topics: ["t"], status: "active", health: { state: "reachable", lastSuccessAt: now - 40 * 24 * 3600 * 1000 } });
reg2.add({ id: "kaputt", publisher: "K", name: "K", access: { method: "rss", url: "https://k.de/rss" }, topics: ["t"], status: "active", health: { state: "broken", lastSuccessAt: now - 5 * 24 * 3600 * 1000 } });
reg2.add({ id: "archiv", publisher: "Ar", name: "Ar", access: { method: "rss", url: "https://ar.de/rss" }, topics: ["t"], status: "archived" });
reg2.add({ id: "verboten", publisher: "V", name: "V", access: { method: "rss", url: "https://v.de/rss" }, topics: ["t"], status: "active", license: "prohibited" });
const stale = findStaleSources(reg2, { now, staleAfterMs: 30 * 24 * 3600 * 1000 });
const staleIds = stale.map((s) => s.id).sort();
check("3a veraltet erkannt: alt/kaputt/archiv/verboten, NICHT frisch", staleIds.join(",") === "alt,archiv,kaputt,verboten" && !staleIds.includes("frisch"));
check("3b Grund je Quelle ausgewiesen", stale.find((s) => s.id === "kaputt").reason === "dauerhaft-defekt" && stale.find((s) => s.id === "alt").reason === "kein-erfolg-seit-frist");

// --- 4) Defekte Quellen ersetzen --------------------------------------------
const reg3 = new SourceRegistry();
reg3.add({ id: "primar", publisher: "Primär", name: "Primär", access: { method: "rss", url: "https://primar.de/rss" }, topics: ["arbeit", "soziales"], regions: ["berlin"], trust: "hoch", health: { state: "broken" } });
reg3.add({ id: "ersatz-gut", publisher: "Ersatz", name: "Ersatz Gut", access: { method: "rss", url: "https://ersatz.de/rss" }, topics: ["arbeit", "soziales"], regions: ["berlin"], trust: "hoch", health: { state: "reachable" } });
reg3.add({ id: "ersatz-teil", publisher: "Teil", name: "Ersatz Teil", access: { method: "rss", url: "https://teil.de/rss" }, topics: ["arbeit"], trust: "mittel", health: { state: "reachable" } });
reg3.add({ id: "ersatz-krank", publisher: "Krank", name: "Ersatz Krank", access: { method: "rss", url: "https://krank.de/rss" }, topics: ["arbeit", "soziales"], regions: ["berlin"], health: { state: "broken" } });
reg3.add({ id: "fremd", publisher: "Fremd", name: "Fremd", access: { method: "rss", url: "https://fremd.de/rss" }, topics: ["umwelt"], health: { state: "reachable" } });
const repl = proposeReplacements(reg3, "primar");
const replIds = repl.candidates.map((c) => c.id);
check("4a bester Ersatz (volle Überlappung, gesund) zuerst", replIds[0] === "ersatz-gut");
check("4b teilweiser Ersatz enthalten, aber niedriger gerankt", replIds.includes("ersatz-teil") && replIds.indexOf("ersatz-teil") > replIds.indexOf("ersatz-gut"));
check("4c kranker Ersatz ausgeschlossen", !replIds.includes("ersatz-krank"));
check("4d thematisch fremde Quelle kein Ersatz", !replIds.includes("fremd"));

// --- 5) Qualitätsverlust verhindern -----------------------------------------
const outgoing = normalizeDescriptor({ publisher: "Alt", access: { method: "rss", url: "https://alt.de/rss" }, topics: ["arbeit", "soziales"], regions: ["berlin"], trust: "hoch" });
const goodIncoming = normalizeDescriptor({ publisher: "Neu", access: { method: "rss", url: "https://neu.de/rss" }, topics: ["arbeit", "soziales"], regions: ["berlin"], trust: "hoch" });
const lossyIncoming = normalizeDescriptor({ publisher: "Neu", access: { method: "rss", url: "https://neu.de/rss" }, topics: ["arbeit"], trust: "hoch" }); // verliert soziales + berlin
const weakIncoming = normalizeDescriptor({ publisher: "Neu", access: { method: "rss", url: "https://neu.de/rss" }, topics: ["arbeit", "soziales"], regions: ["berlin"], trust: "niedrig" });
check("5a gleichwertiger Ersatz ist sicher", guardQualityLoss({ outgoing, incoming: goodIncoming, outgoingScore: 0.8, incomingScore: 0.82 }).safe === true);
check("5b Ersatz mit weniger Abdeckung ist UNSICHER", (() => { const g = guardQualityLoss({ outgoing, incoming: lossyIncoming }); return g.safe === false && g.lostDimensions.length >= 2; })());
check("5c Ersatz mit gesunkenem Score ist UNSICHER", guardQualityLoss({ outgoing, incoming: goodIncoming, outgoingScore: 0.8, incomingScore: 0.5 }).safe === false);
check("5d Ersatz mit gesunkenem Vertrauen ist UNSICHER", guardQualityLoss({ outgoing, incoming: weakIncoming }).safe === false && guardQualityLoss({ outgoing, incoming: weakIncoming }).reasons.includes("vertrauen-sinkt"));
check("5e fehlende Ein-/Ausgabe -> unsicher (kein Blindtausch)", guardQualityLoss({ outgoing, incoming: null }).safe === false);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Discovery-Assertions`);
process.exit(failed > 0 ? 1 : 0);
