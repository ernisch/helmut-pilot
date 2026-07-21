"use strict";

// Tests des Gesundheitsmotors (Auftrag §5) + Ausfallszenarien. REINE, deterministische
// Zustandsmaschine mit injizierter Uhr. Deckt alle geforderten Zustände ab:
//   erreichbar / defekt / langsam / nie geprüft / deaktiviert / Parserfehler /
//   Rate Limit / HTTP Fehler + letzter Erfolg + Fehlerserie. Plus Ausfallszenarien
//   (transienter Fehler erholt sich; Fehlerserie eskaliert zu defekt; Stale-Erfolg).

const { initialHealth, classifyObservation, applyObservation, foldObservations, summarizeHealth, BROKEN_STREAK } = require("../lib/helmut/quellenbibliothek/health-engine");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- 1) Ausgangszustand -----------------------------------------------------
const init = initialHealth();
check("1a Startzustand nie geprüft", init.state === "never_checked" && init.lastSuccessAt === null && init.errorStreak === 0);

// --- 2) Einzelbeobachtung klassifizieren ------------------------------------
check("2a Erfolg schnell -> erreichbar", classifyObservation({ ok: true, latencyMs: 200 }).state === "reachable");
check("2b Erfolg langsam -> langsam", classifyObservation({ ok: true, latencyMs: 8000 }).state === "slow");
check("2c HTTP 429 -> rate_limited", classifyObservation({ httpStatus: 429 }).state === "rate_limited");
check("2d rateLimited-Flag -> rate_limited", classifyObservation({ rateLimited: true }).state === "rate_limited");
check("2e HTTP 500 -> http_error", classifyObservation({ httpStatus: 500 }).state === "http_error");
check("2f HTTP 404 -> http_error", classifyObservation({ httpStatus: 404 }).state === "http_error");
check("2g parserOk=false -> parser_error", classifyObservation({ httpStatus: 200, parserOk: false }).state === "parser_error");
check("2h disabled -> deaktiviert", classifyObservation({ disabled: true }).state === "disabled");
check("2i Priorität: Rate Limit vor Parserfehler", classifyObservation({ httpStatus: 429, parserOk: false }).state === "rate_limited");

// --- 3) Fortschreibung: Erfolg setzt Serie + letzten Erfolg -----------------
let h = applyObservation(init, { ok: true, latencyMs: 300, at: 1000 });
check("3a Erfolg -> erreichbar, letzter Erfolg gesetzt", h.state === "reachable" && h.lastSuccessAt === 1000 && h.errorStreak === 0);
h = applyObservation(h, { httpStatus: 503, at: 2000 });
check("3b ein Fehler -> Fehlerserie 1, letzter Erfolg bleibt", h.state === "http_error" && h.errorStreak === 1 && h.lastSuccessAt === 1000);
h = applyObservation(h, { ok: true, latencyMs: 300, at: 3000 });
check("3c Erholung -> Serie zurückgesetzt, erreichbar", h.state === "reachable" && h.errorStreak === 0 && h.lastSuccessAt === 3000);

// --- 4) Ausfallszenario: Fehlerserie eskaliert zu defekt --------------------
let e = initialHealth();
for (let i = 0; i < BROKEN_STREAK; i++) e = applyObservation(e, { httpStatus: 500, at: 1000 + i });
check("4a Fehlerserie >= Schwelle -> defekt", e.state === "broken" && e.errorStreak === BROKEN_STREAK);
check("4b defekt erfordert Aufmerksamkeit", e.needsAttention === true);
check("4c unter der Schwelle NOCH nicht defekt", (() => {
  let x = initialHealth();
  for (let i = 0; i < BROKEN_STREAK - 1; i++) x = applyObservation(x, { httpStatus: 500, at: i });
  return x.state !== "broken";
})());
// Erholung nach Defekt
e = applyObservation(e, { ok: true, latencyMs: 200, at: 9999 });
check("4d ein Erfolg heilt den Defekt", e.state === "reachable" && e.errorStreak === 0);

// --- 5) Deaktivierung ist kein Fehler ---------------------------------------
let d = applyObservation(applyObservation(init, { ok: true, at: 100 }), { disabled: true, at: 200 });
check("5a Deaktivierung -> Zustand deaktiviert, Serie NICHT erhöht", d.state === "disabled" && d.errorStreak === 0);

// --- 6) Rate-Limit-Serie (transient) ----------------------------------------
const rl = foldObservations([
  { ok: true, latencyMs: 200, at: 1 },
  { httpStatus: 429, at: 2 },
  { httpStatus: 429, at: 3 },
  { ok: true, latencyMs: 200, at: 4 }
]);
check("6a Rate-Limit-Serie erholt sich -> erreichbar, Serie 0", rl.state === "reachable" && rl.errorStreak === 0);

// --- 7) Stale-Erfolg: lange kein frischer Erfolg -> Aufmerksamkeit -----------
const stale = applyObservation({ state: "reachable", errorStreak: 0, lastSuccessAt: 0, lastCheckedAt: 0 }, { ok: true, at: 100 * 3600 * 1000 }, { now: 100 * 3600 * 1000, staleSuccessMs: 72 * 3600 * 1000 });
check("7a frischer Erfolg -> keine Aufmerksamkeit nötig", stale.needsAttention === false);
const staleNoSuccess = applyObservation({ state: "reachable", errorStreak: 0, lastSuccessAt: 0, lastCheckedAt: 0 }, { httpStatus: 500, at: 100 * 3600 * 1000 }, { now: 100 * 3600 * 1000 });
check("7b lange kein Erfolg + neuer Fehler -> Aufmerksamkeit", staleNoSuccess.needsAttention === true);

// --- 8) Unveränderlichkeit + Aggregat ---------------------------------------
const before = initialHealth();
applyObservation(before, { httpStatus: 500, at: 1 });
check("8a Eingabe-Record wird nicht mutiert", before.errorStreak === 0 && before.state === "never_checked");
const summary = summarizeHealth([{ state: "reachable" }, { state: "broken", needsAttention: true }, { state: "slow" }, { state: "never_checked" }]);
check("8b Flottenbericht zählt Zustände", summary.total === 4 && summary.byState.reachable === 1 && summary.byState.broken === 1 && summary.needsAttention === 1);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Health-Assertions`);
process.exit(failed > 0 ? 1 : 0);
