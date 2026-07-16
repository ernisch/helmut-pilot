"use strict";

// P1-4 — Begrenzte Recovery fehlgeschlagener Wissensobjekte (bounded Auto-Retry).
//
// Belegt (mit injizierten In-Memory-Deps, kein Netz/DB):
//  * Ein failed-KO wird bis zur Obergrenze (maxRetries) auf 'pending' zurückgesetzt.
//  * Nach erschöpften Retries wird es 'failed-final' (terminal) — NIE wieder versucht.
//  * KEINE Endlosschleife über wiederholte Läufe.
//  * Default AUS (HELMUT_FAILED_KO_RECOVERY) -> reiner No-Op (kein Prod-Write).
//  * Fail-safe: ein einzelner Reset-Fehler bricht den Lauf nicht ab.

const { recoverFailedUnderstanding, recoveryEnabled } = require("../lib/helmut/ko-recovery");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// In-Memory-KO-Store: vorgangId -> understanding_status.
function makeStore(vorgaenge) {
  const status = new Map(vorgaenge.map((v) => [v, "failed"]));
  let retries = {};
  return {
    status,
    getStatus: (v) => status.get(v),
    deps: {
      enabled: () => true,
      maxRetries: 2,
      listFailed: async () => [...status.entries()].filter(([, s]) => s === "failed").map(([vorgang_id]) => ({ vorgang_id })),
      resetToPending: async (v) => { if (status.get(v) === "failed") status.set(v, "pending"); },
      markTerminal: async (v) => { if (status.get(v) === "failed") status.set(v, "failed-final"); },
      readRetries: async () => retries,
      writeRetries: async (m) => { retries = { ...m }; }
    },
    getRetries: () => retries
  };
}

(async () => {
  // ── Bounded Retry -> Terminal über mehrere Läufe ────────────────────────────
  const s = makeStore(["vg-1"]);

  // Lauf 1: failed -> pending (Zähler 1)
  const r1 = await recoverFailedUnderstanding(s.deps);
  check("Lauf 1: 1 retried", r1.retried === 1 && r1.terminal === 0);
  check("Lauf 1: Status pending", s.getStatus("vg-1") === "pending");
  check("Lauf 1: Zähler = 1", s.getRetries()["vg-1"] === 1);

  // Der Understanding-Lauf schlägt erneut fehl -> zurück auf failed (Simulation).
  s.status.set("vg-1", "failed");
  const r2 = await recoverFailedUnderstanding(s.deps);
  check("Lauf 2: erneut retried (Zähler < max)", r2.retried === 1 && s.getRetries()["vg-1"] === 2);

  // Erneuter Fehlschlag -> jetzt ist der Zähler = maxRetries -> Terminal.
  s.status.set("vg-1", "failed");
  const r3 = await recoverFailedUnderstanding(s.deps);
  check("Lauf 3: Terminal statt Retry", r3.terminal === 1 && r3.retried === 0);
  check("Lauf 3: Status failed-final (terminal)", s.getStatus("vg-1") === "failed-final");
  check("Lauf 3: Zähler aufgeräumt", !("vg-1" in s.getRetries()));

  // ── KEINE Endlosschleife: weitere Läufe fassen das terminale KO nie wieder an ─
  s.status.set("vg-1", "failed-final");
  const r4 = await recoverFailedUnderstanding(s.deps);
  check("Lauf 4: terminal wird nie wieder angefasst", r4.checked === 0 && r4.retried === 0 && r4.terminal === 0);

  // ── Default AUS -> No-Op ────────────────────────────────────────────────────
  delete process.env.HELMUT_FAILED_KO_RECOVERY;
  check("recoveryEnabled ohne Flag -> false", recoveryEnabled() === false);
  const off = await recoverFailedUnderstanding({ ...s.deps, enabled: recoveryEnabled });
  check("Default AUS: No-Op (skipped=disabled)", off.skipped === true && off.reason === "disabled");

  // ── Fail-safe: ein Reset-Fehler bricht den Lauf nicht ab ────────────────────
  const s2 = makeStore(["a", "b"]);
  let calls = 0;
  s2.deps.resetToPending = async (v) => { calls += 1; if (v === "a") throw new Error("transient"); s2.status.set(v, "pending"); };
  const rf = await recoverFailedUnderstanding(s2.deps);
  check("Fail-safe: beide versucht trotz Fehler bei 'a'", calls === 2);
  check("Fail-safe: 'b' erfolgreich pending", s2.getStatus("b") === "pending" && rf.retried === 1);

  console.log(`\n${passed}/${passed + failed} KO-Recovery-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
