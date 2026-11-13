"use strict";

// Nur neue Gegenfaelle der Tagesfortsetzung; keine DB, Modelle oder alten Mengenfaelle.
const A = require("node:assert/strict"), Q = require("../lib/helmut/quellen-automatik");
const ENV = { HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SOURCE_MODE: "on" };
const day = "2026-11-13", now = Date.parse(day + "T04:00:00Z");
function welt() {
  const w = { plan: { zustand: "fertig", cursor: 1, auftraege: [{}] }, reads: [],
    offen: [{ id: "heute-gut" }], faellig: [{ id: "heute-gut", attempts: 0, max_attempts: 3 }], fehler: [],
    run: { runId: "synthetischer-slot", process: "warteschlange-crawl", status: "partial",
      startedAt: day + "T03:15:00Z", finishedAt: day + "T03:19:00Z",
      fehlerklasse: "auftraege-endgueltig-fehlgeschlagen", reason: null,
      zielmenge: 46, processed: 3, deferred: 39, fehlgeschlagen: 2, wiederholt: 2, leaseVerloren: 0 } };
  w.deps = {
    leseLaeufe: async o => o.process === "warteschlange-crawl" ? [w.run] : [],
    journal: { lesen: async tag => { A.equal(tag, day); return w.plan; },
      offene: async () => A.fail("Historische Planreste duerfen keinen heutigen Slot ausloesen") },
    request: async (url, options) => {
      A.equal(options, undefined); w.reads.push(url);
      if (url.startsWith("/rest/v1/helmut_anbieter_fenster")) return [
        { schluessel: "quellenarbeit|fenster", verbraucht: 1 },
        { schluessel: "quellenarbeit|slot|03:15", verbraucht: 1 } ];
      const decoded = decodeURIComponent(url);
      A.match(decoded, /last_seen_window.gte.2026-11-13/);
      A.match(decoded, /last_seen_window.lt.2026-11-14/);
      A.match(decoded, /last_seen_window.is.null,freshness_window.gte.2026-11-13/);
      A.match(decoded, /freshness_window.lt.2026-11-14/);
      A.ok(!decoded.includes("select=*") && !decoded.includes("payload"));
      if (url.includes("status=eq.fehlgeschlagen")) return w.fehler;
      return url.includes("select=id,attempts,max_attempts") ? w.faellig : w.offen;
    }
  };
  w.pruefe = env => Q.pruefe({ env: env || ENV, now: () => now, deps: w.deps });
  return w;
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
(async () => {
  await test("bestaetigter isolierter Terminalfehler laesst brauchbare Tagesarbeit fortschreiten", async () => {
    const w = welt(); w.fehler = [{ id: "heute-einzelproblem" }];
    A.equal((await w.pruefe()).grund, "automatik-restarbeit");
  });
  await test("Null gute Abschluesse mit vollstaendig bestaetigter Einzeljobbilanz ist kein globaler Crash", async () => {
    const w = welt(); Object.assign(w.run, { fehlerklasse: "lease-ohne-fortschritt", zielmenge: 21,
      processed: 0, deferred: 19, fehlgeschlagen: 1, wiederholt: 1 });
    A.equal((await w.pruefe()).erlaubt, true);
  });
  await test("Crash Transportfehler verlorene Leases und unbekannte Bilanz bleiben gesperrt", async () => {
    for (const change of [r => { r.status = "running"; }, r => { r.status = "timeout"; },
      r => { r.fehlerklasse = "warteschlange-nicht-verfuegbar"; },
      r => { r.reason = "blob-spiegel-fehlgeschlagen"; }, r => { r.zielmenge = 6; },
      r => { r.leaseVerloren = 1; }, r => { r.deferred = null; }, r => { r.finishedAt = null; }]) {
      const w = welt(); change(w.run); A.equal((await w.pruefe()).erlaubt, false);
    }
  });
  await test("historische Planreste und heute beendete Altfehler sind kein heutiger Taktgeber", async () => {
    const w = welt(); Object.assign(w.run, { status: "success", fehlerklasse: null });
    w.offen = []; w.faellig = [];
    A.equal((await w.pruefe()).grund, "automatik-erledigt");
    A.equal(w.reads.filter(s => s.startsWith("/rest/v1/helmut_jobs")).length, 3);
    A.ok(w.reads.every(s => !s.includes("finished_at=")));
  });
  await test("heutiger offener Plancursor darf ohne Lesen historischer Plaene fortgesetzt werden", async () => {
    const w = welt(); w.plan = { zustand: "offen", cursor: 0, auftraege: [{}] };
    A.equal((await w.pruefe()).grund, "automatik-restarbeit");
    A.equal(w.reads.length, 1);
  });
  await test("ohne gute faellige Arbeit bleibt heutiger Fehler sichtbar statt falschem Erledigt", async () => {
    const w = welt(); w.offen = []; w.faellig = []; w.fehler = [{ id: "heute-einzelproblem" }];
    A.equal((await w.pruefe()).grund, "automatik-startfehler");
  });
  await test("spaetere Faelligkeit und deaktivierter Quellenmodus werden respektiert", async () => {
    const w = welt(); w.faellig = [];
    A.equal((await w.pruefe()).grund, "automatik-wartet");
    await w.pruefe({ ...ENV, HELMUT_SOURCE_MODE: "off" });
    const query = decodeURIComponent(w.reads.find(s => s.includes("select=id,attempts,max_attempts") && !s.includes("source_fetch")));
    A.ok(query.includes("document_understanding") && !query.includes("source_fetch"));
  });
  console.log(`${pass}/${pass} neue Tagesfortsetzungsgruppen bestanden; keine externen Aufrufe.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
