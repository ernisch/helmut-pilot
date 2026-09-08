"use strict";

// Production 08.09.: 1.678 geplante Auftraege passten seriell nicht in 60 s.
// Echte Planerlogik, kontrollierte RPC-Latenz, kein Netz, keine Datenbank/KI.
const assert = require("node:assert/strict");
const SP = require("../lib/helmut/scalable-pipeline");
const MK = require("../lib/helmut/mandatsklasse");
const ENV = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416" };
const profile = Array.from({ length: 500 }, (_, i) => ({
  id: i < 5 ? `mandat-planung-${i}` : `test-kohorte-planung-${i}`
}));
const job = (jobType, tenantId, i) => ({ jobType, tenantId,
  idempotencyKey: `${jobType}:${tenantId || i}`, freshnessWindow: "testfenster", payload: {} });
const quellen = [...Array.from({ length: 178 }, (_, i) => job("source_fetch", null, i)),
  ...profile.map((p) => job("source_fetch", p.id))];
const mandat = profile.flatMap((p) => [job("mandate_projection", p.id),
  job("briefing_materialization", p.id)]);
const anzahl = quellen.length + mandat.length;
function deps(enqueue, now = () => 0) {
  return { enqueue, now, listFullProfiles: async () => profile,
    profilPruefung: { isDisabled: () => false },
    sourceDemand: {
      kompiliereQuellenbedarf: async () => ({ auftraege: quellen, statistik: {}, fehlerhafteProfile: [] }),
      planeMandatsarbeit: () => ({ auftraege: mandat, fenster: "testfenster" })
    }
  };
}
async function microtasks() { for (let i = 0; i < 30; i += 1) await Promise.resolve(); }

async function main() {
  // Ein Tick repraesentiert 70 ms Datenbankwartezeit fuer gleichzeitig gestartete
  // RPCs. Seriell brauchen 1.678 Auftraege 117,46 s, unabhaengig von CPU/Jitter.
  let jetzt = 0, aktiv = 0, maximum = 0, timer = null;
  let realeFertig = 0, geteilteFertig = 0;
  const wartet = [], gespeichert = new Map();
  const plan = await SP.planeArbeit({ env: ENV, planungsDeadlineMs: 60000,
    deps: deps((auftrag) => {
      if (!auftrag.tenantId) assert.equal(realeFertig, 15, "reale Arbeit vor geteilter Arbeit abschliessen");
      if (MK.istSynthetischeKennung(auftrag.tenantId)) {
        assert.equal(realeFertig, 15);
        assert.equal(geteilteFertig, 178, "geteilte Arbeit vor synthetischer Arbeit abschliessen");
      }
      aktiv += 1; maximum = Math.max(maximum, aktiv);
      return new Promise((resolve) => {
        wartet.push(() => {
          aktiv -= 1;
          assert.equal(gespeichert.has(auftrag.idempotencyKey), false, "kein doppelter Aufruf");
          gespeichert.set(auftrag.idempotencyKey, auftrag);
          if (!auftrag.tenantId) geteilteFertig += 1;
          else if (!MK.istSynthetischeKennung(auftrag.tenantId)) realeFertig += 1;
          resolve({ verfuegbar: true, neu: true });
        });
        if (timer === null) timer = setImmediate(() => {
          jetzt += 70; timer = null;
          for (const fertig of wartet.splice(0)) fertig();
        });
      });
    }, () => jetzt)
  });
  assert.equal(plan.ok, true, JSON.stringify({ neu: plan.neu, ausstehend: plan.ausstehend, jetzt }));
  assert.equal(plan.geplant, anzahl);
  assert.equal(plan.neu, anzahl);
  assert.equal(plan.ausstehend, 0);
  assert.ok(maximum > 1 && maximum <= 4, `begrenzte Nebenlaeufigkeit: ${maximum}`);
  assert.equal(aktiv, 0);
  for (const typ of ["mandate_projection", "briefing_materialization"]) {
    assert.equal(new Set([...gespeichert.values()].filter((j) => j.jobType === typ)
      .map((j) => j.tenantId)).size, 500, `alle 500 erhalten ${typ}`);
  }
  console.log(`PASS  1.678 Auftraege fuer alle 500 innerhalb 60 s, maximal ${maximum} RPCs, Prioritaeten erhalten`);

  // Bereits gestartete RPCs werden auch beim Ablauf der Frist fertig beobachtet.
  jetzt = 0;
  let begonnen = 0, beendet = 0;
  const freigaben = [];
  const begrenzt = SP.planeArbeit({ env: ENV, planungsDeadlineMs: 50,
    deps: deps(() => {
      begonnen += 1;
      return new Promise((resolve) => freigaben.push(() => { beendet += 1;
        resolve({ verfuegbar: true, neu: true }); }));
    }, () => jetzt)
  });
  await microtasks();
  assert.equal(begonnen, 4);
  jetzt = 60;
  for (const fertig of freigaben) fertig();
  const teil = await begrenzt;
  assert.equal(teil.ok, false);
  assert.equal(teil.grund, "planung-zeitbudget");
  assert.equal(teil.versucht, 4);
  assert.equal(teil.ausstehend, anzahl - 4);
  assert.equal(beendet, 4);
  await microtasks();
  assert.equal(begonnen, 4, "nach Rueckgabe kein Hintergrundschreiber");
  console.log("PASS  Deadline: alle gestarteten Schreibvorgaenge beobachtet, kein weiterer gestartet");

  // Promise.all waere hier falsch: der erste Fehler duerfte die anderen drei
  // gestarteten Schreibvorgaenge nicht unbeobachtet beim Aufrufer zuruecklassen.
  const offen = [];
  let fertigGemeldet = false;
  const fehlerPlan = SP.planeArbeit({ env: ENV, deps: deps(() =>
    new Promise((resolve, reject) => offen.push({ resolve, reject }))) });
  const ergebnis = fehlerPlan.then(() => { fertigGemeldet = true; return null; },
    (error) => { fertigGemeldet = true; return error; });
  await microtasks();
  assert.equal(offen.length, 4);
  offen[0].reject(new Error("rpc-schreibausgang-unklar"));
  await microtasks();
  assert.equal(fertigGemeldet, false, "Fehlerantwort muss andere gestartete RPCs abwarten");
  for (const rpc of offen.slice(1)) rpc.resolve({ verfuegbar: true, neu: true });
  assert.match((await ergebnis).message, /rpc-schreibausgang-unklar/);
  await microtasks();
  assert.equal(offen.length, 4, "bei Fehler keine naechste Gruppe beginnen");
  console.log("PASS  RPC Fehler: kein frueher Ruecksprung und keine Folgegruppe");

  let nummer = 0;
  const gemischt = await SP.planeArbeit({ env: ENV, deps: deps(async () => {
    const i = nummer++;
    if (i === 1) return { verfuegbar: true, neu: false };
    if (i === 2) return { verfuegbar: false, grund: "db-nicht-verfuegbar" };
    if (i === 3) return undefined;
    return { verfuegbar: true, neu: true };
  }) });
  assert.equal(gemischt.versucht, anzahl);
  assert.equal(gemischt.neu, anzahl - 3);
  assert.equal(gemischt.vorhanden, 1);
  assert.equal(gemischt.nichtEingereiht, 2);
  assert.equal(gemischt.ausstehend, 0);
  assert.equal(gemischt.ok, false);
  assert.deepEqual(gemischt.gruende, ["db-nicht-verfuegbar"]);
  console.log("PASS  Teilfehler, vorhandene Auftraege und fehlende Antworten bleiben ehrlich gezaehlt");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
