"use strict";

// Isolierter Vertragsnachweis: kein HTTP, keine Modelle, keine Production.
// Die atomare RPC selbst ist im vorhandenen Anbieter-Datenbanktest nachgewiesen.
const assert = require("node:assert/strict");
const fenster = require("../lib/helmut/quellen-arbeitsfenster");
const dispatch = require("../lib/helmut/job-dispatch");
const worker = require("../lib/helmut/worker-betrieb");
const pipeline = require("../lib/helmut/scalable-pipeline");
const config = require("../vercel.json");
const ENV = Object.freeze({
  HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SCALABLE_PIPELINE: "on",
  HELMUT_JOB_DISPATCH_MODE: "shadow", HELMUT_KLASSEN_GRENZEN: "on",
  HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16"
});
let pass = 0;
async function check(name, fn) { await fn(); pass++; console.log(`PASS ${name}`); }
function welt() {
  let zeit = Date.parse("2026-11-09T03:00:00Z");
  let leaseBis = 0;
  let frei = 0;
  const konten = new Map(), rpcs = [];
  const deps = {
    now: () => zeit,
    bereitschaft: async () => ({ bereit: true }),
    automatik: async () => ({ erlaubt: true }),
    reserviere: async (o) => {
      rpcs.push(o);
      const key = `${new Date(zeit).toISOString().slice(0, 10)}|${o.schluessel}`;
      const verbraucht = konten.get(key) || 0;
      if (verbraucht + o.menge > o.grenzeTag) return { verfuegbar: true, erlaubt: false, grund: "tagesgrenze", fruehesteMs: 23456 };
      konten.set(key, verbraucht + o.menge);
      return { verfuegbar: true, erlaubt: true };
    },
    klassen: {
      belege: async (klasse, { ttlMs }) => {
        assert.equal(klasse, "worker-drain");
        if (leaseBis > zeit) return { erlaubt: false };
        leaseBis = zeit + ttlMs;
        return { erlaubt: true, slot: "eigene-lease" };
      },
      gebeFrei: async () => { frei++; leaseBis = 0; }
    }
  };
  return { deps, rpcs, konten, zeit: () => zeit, setze: x => { zeit = Date.parse(x); },
    weiter: ms => { zeit += ms; }, frei: () => frei,
    stand: key => konten.get(`${new Date(zeit).toISOString().slice(0, 10)}|${key}`) || 0 };
}
const lauf = (w, arbeit = async () => ({ ok: true }), env = ENV) => fenster.fuehreAus({ env, deps: w.deps, arbeit });

async function main() {
  await check("ausgeschaltet ohne jede Reservierung", async () => {
    const w = welt();
    assert.equal((await lauf(w, undefined, {})).grund, "arbeitsfenster-aus");
    assert.equal(w.rpcs.length, 0);
  });
  await check("fehlende, null, negative, nichtganzzahlige und zu grosse Grenzen stoppen vor IO", async () => {
    for (const key of ["HELMUT_QUELLEN_FENSTER_TAG", "HELMUT_QUELLEN_SEKUNDEN_TAG", "HELMUT_ORIGINALABRUFE_TAG"]) {
      for (const value of ["", "0", "-1", "1.5", "NaN", "Infinity", "2147483648"]) {
        const w = welt();
        assert.equal((await lauf(w, undefined, { ...ENV, [key]: value })).grund, "arbeitslimits-ungueltig");
        assert.equal(w.rpcs.length, 0);
      }
    }
  });
  await check("skalierbarer Motor und Cronmodus sind erforderlich", async () => {
    for (const override of [{ HELMUT_SCALABLE_PIPELINE: "off" }, { HELMUT_JOB_DISPATCH_MODE: "queue" }]) {
      const w = welt(); assert.equal((await lauf(w, undefined, { ...ENV, ...override })).ok, false); assert.equal(w.rpcs.length, 0);
    }
  });
  await check("ausserhalb Planfenster und nach Zustellkulanz kein IO", async () => {
    for (const time of ["02:59:59", "03:05:00", "03:14:59", "04:50:00", "05:00:00", "23:59:59"]) {
      const w = welt(); w.setze(`2026-11-09T${time}Z`);
      assert.equal((await lauf(w)).grund, "ausserhalb-quellenarbeitsfenster"); assert.equal(w.rpcs.length, 0);
    }
    assert.equal(fenster.slotFuerZeit(Date.parse("2026-11-09T04:49:59Z")), "04:45");
  });
  await check("acht Fenster reservieren global achtmal300s, ohne Erstattung", async () => {
    const w = welt(); let n = 0;
    for (let i = 0; i < 8; i++) { assert.equal((await lauf(w, async () => { n++; return { ok: true }; })).ok, true); w.weiter(15 * 60000); }
    assert.equal(n, 8); assert.equal(w.stand(fenster.SCHLUESSEL.fenster), 8); assert.equal(w.stand(fenster.SCHLUESSEL.sekunden), 2400);
    assert.equal(w.frei(), 0);
  });
  await check("fehlender Bereitschaftsbeleg stoppt vor jeder Quote und erlaubt spaetere bestaetigte Zustellung", async () => {
    for (const befund of [null, {}, { bereit: false }, { bereit: "true" }, new Error("Lesefehler")]) {
      const w = welt();
      w.deps.bereitschaft = async () => { if (befund instanceof Error) throw befund; return befund; };
      const r = await lauf(w, async () => assert.fail("kein Arbeitsbeginn ohne Vorflug"));
      assert.equal(r.grund, "arbeitsfenster-vorflug-nicht-bereit");
      assert.equal(r.verarbeitet, false); assert.equal(w.rpcs.length, 0); assert.equal(w.frei(), 1);
      w.deps.bereitschaft = async () => ({ bereit: true });
      assert.equal((await lauf(w)).ok, true); assert.equal(w.stand(fenster.SCHLUESSEL.fenster), 1);
      assert.equal(w.stand(fenster.SCHLUESSEL.sekunden), 300);
    }
  });
  await check("echte Workerbereitschaft liest erst unter Lease; kritischer Rueckstand bleibt bearbeitbar", async () => {
    const w = welt(), original = pipeline.betriebsstatus; let erlaubt = false, reads = 0;
    delete w.deps.bereitschaft;
    pipeline.betriebsstatus = async o => {
      reads++; assert.equal(o.env, ENV); assert.equal(w.rpcs.length, 0); assert.equal(w.frei(), 0);
      return erlaubt ? { verfuegbar: true, zustand: "kritisch" } : { verfuegbar: false, grund: "migration-fehlt" };
    };
    try {
      assert.equal((await lauf(w)).grund, "arbeitsfenster-vorflug-nicht-bereit");
      assert.equal(reads, 1); assert.equal(w.rpcs.length, 0);
      erlaubt = true;
      pipeline.betriebsstatus = async o => { assert.equal(o.env, ENV); reads++; return { verfuegbar: true, zustand: "kritisch" }; };
      assert.equal((await lauf(w)).ok, true); assert.equal(reads, 2); assert.equal(w.rpcs.length, 3);
    } finally { pipeline.betriebsstatus = original; }
  });
  await check("zu langer Lease-/Vorflugstart oder abgelaufene Zustellkulanz verbraucht keine Quote", async () => {
    for (const phase of ["lease", "vorflug", "kulanz"]) {
      const w = welt();
      if (phase === "kulanz") w.setze("2026-11-09T03:04:30Z");
      if (phase === "lease") {
        const belege = w.deps.klassen.belege;
        w.deps.klassen.belege = async (...args) => { const r = await belege(...args); w.weiter(60000); return r; };
      } else w.deps.bereitschaft = async () => { w.weiter(phase === "kulanz" ? 31000 : 60000); return { bereit: true }; };
      assert.equal((await lauf(w, async () => assert.fail("kein spaeter Arbeitsbeginn"))).grund, "arbeitsfenster-vorbereitung-zu-lang");
      assert.equal(w.rpcs.length, 0); assert.equal(w.frei(), 1);
    }
  });
  await check("erst nach Reservierung bemerkte Verzoegerung behaelt alle Kontingente", async () => {
    const w = welt(), reserviere = w.deps.reserviere;
    w.deps.reserviere = async o => { const r = await reserviere(o); if (o.schluessel === fenster.SCHLUESSEL.sekunden) w.weiter(60000); return r; };
    assert.equal((await lauf(w, async () => assert.fail("keine Arbeit nach Zeitgrenze"))).grund, "arbeitsfenster-vorbereitung-zu-lang");
    assert.equal(w.stand(fenster.SCHLUESSEL.fenster), 1); assert.equal(w.stand(fenster.SCHLUESSEL.sekunden), 300);
    assert.equal(w.frei(), 1);
  });
  await check("globale Fenstergrenze stoppt weiteren Slot", async () => {
    const w = welt(), env = { ...ENV, HELMUT_QUELLEN_FENSTER_TAG: "1" };
    await lauf(w, undefined, env); w.weiter(15 * 60000);
    const r = await lauf(w, async () => assert.fail("unerlaubte Arbeit"), env);
    assert.equal(r.limit, fenster.SCHLUESSEL.fenster); assert.equal(r.wartenMs, 23456);
  });
  await check("Sekundengrenze unabhängig von Fensterzahl, Teilreserve bleibt gebunden", async () => {
    const w = welt(), env = { ...ENV, HELMUT_QUELLEN_SEKUNDEN_TAG: "300" };
    await lauf(w, undefined, env); w.weiter(15 * 60000);
    assert.equal((await lauf(w, async () => assert.fail("kein zweiter Drain"), env)).limit, fenster.SCHLUESSEL.sekunden);
    assert.equal(w.stand(fenster.SCHLUESSEL.fenster), 2); assert.equal(w.stand(fenster.SCHLUESSEL.sekunden), 300);
  });
  await check("doppelte Zustellung und ueberlappender Prozess ohne zweite Arbeit", async () => {
    const w = welt(); let gestartet = 0, fertig;
    const erster = lauf(w, async () => { gestartet++; await new Promise(r => { fertig = r; }); return { ok: true }; });
    while (!fertig) await Promise.resolve();
    const zweiter = await lauf(w, async () => { gestartet++; });
    assert.equal(zweiter.grund, "arbeitsfenster-belegt-oder-unbekannt");
    fertig(); await erster;
    // Selbst nach regulärem Leaseablauf laesst dieselbe nominale Slotreservation
    // keinen zweiten Drain durch (simulierte erneute Zulassung derselben Minute).
    w.deps.klassen.belege = async () => ({ erlaubt: true, slot: "zweiter-prozess" });
    assert.match((await lauf(w)).limit, /slot\|03:00$/); assert.equal(gestartet, 1);
  });
  await check("unklarer RPC-Ausgang: kein Retry, kein Worker, kein Kontingentreset", async () => {
    const w = welt(); let calls = 0;
    const original = w.deps.reserviere;
    w.deps.reserviere = async o => { calls++; const result = await original(o); if (calls === 2) throw Error("Antwort verloren"); return result; };
    assert.equal((await lauf(w, async () => assert.fail("kein Worker"))).grund, "arbeitslimit-nicht-pruefbar");
    assert.equal(calls, 2); assert.equal(w.stand(fenster.SCHLUESSEL.fenster), 1);
  });
  await check("Crash verbraucht Fenster, naechster Termin kann gespeicherten Rest aufnehmen", async () => {
    const w = welt();
    await assert.rejects(lauf(w, async () => { throw Error("Unterbrechung"); }), /Unterbrechung/);
    assert.equal(w.frei(), 0); assert.equal(w.stand(fenster.SCHLUESSEL.sekunden), 300);
    w.weiter(15 * 60000); assert.equal((await lauf(w)).ok, true);
  });
  await check("Tageswechsel erneuert nur DB-Tagesfenster, kein eigener Reset", async () => {
    const w = welt(); await lauf(w); w.setze("2026-11-10T03:00:00Z"); await lauf(w);
    assert.equal(w.stand(fenster.SCHLUESSEL.fenster), 1); assert.equal(w.konten.size, 6);
  });
  await check("Originale global16, auch bei konkurrierenden Aufrufern", async () => {
    const w = welt();
    const r = await Promise.all(Array.from({ length: 40 }, () => fenster.reserviereOriginal({ env: ENV, deps: w.deps })));
    assert.equal(r.filter(x => x.erlaubt).length, 16); assert.equal(w.stand(fenster.SCHLUESSEL.originale), 16);
    assert.ok(w.rpcs.every(o => o.schluessel === fenster.SCHLUESSEL.originale && o.grenzeTag === 16 && o.grenzeMinute === 0));
  });
  await check("Originallimit nicht pruefbar bedeutet vorHTTP STOP", async () => {
    const r = await fenster.reserviereOriginal({ env: ENV, deps: { reserviere: async () => ({ verfuegbar: false }) } });
    assert.equal(r.erlaubt, false); assert.equal(r.geprueft, false);
  });
  await check("Selbstweck trotz alter queue/on-Konfiguration gesperrt", async () => {
    const env = { ...ENV, HELMUT_JOB_DISPATCH_MODE: "queue", HELMUT_SELBSTWECK_ERLAUBT: "on" };
    assert.equal(dispatch.waehleAntrieb(env).antrieb, "cron-queue"); assert.equal(dispatch.selbstweckErlaubt(env).erlaubt, false);
  });
  await check("unreservierter und gefaelschter Worker stoppen vor Claim", async () => {
    for (const arbeitsfenster of [null, { endeMs: Date.now() + 300000 }]) {
      assert.equal((await worker.durchlauf({ env: ENV, arbeitsfenster })).grund, "arbeitsfenster-nicht-reserviert");
    }
  });
  await check("echter reservierter Worker hat parallel1, Stapel1 und verbleibendes Zeitbudget", async () => {
    const w = welt(); const alt = pipeline.arbeite; let calls = 0, receipt;
    pipeline.arbeite = async o => { calls++; assert.equal(o.stapel, 1); assert.ok(o.budgetMs <= 290000); return { erledigt: 1 }; };
    try {
      await lauf(w, async ({ freigabe }) => {
        receipt = freigabe;
        const r = await worker.durchlauf({ env: { ...ENV, HELMUT_WORKER_PARALLEL: "8" }, arbeitsfenster: freigabe,
          deps: { now: w.deps.now }, grenzen: { parallel: 8, budgetMs: 900000, stapel: 200 } });
        assert.equal(r.worker, 1); assert.equal(r.erledigt, 1); return { ok: true };
      });
      assert.equal(calls, 1); assert.equal(fenster.freigabeGueltig(receipt, w.zeit()), false);
    } finally { pipeline.arbeite = alt; }
  });
  await check("Cronplan: acht Quellenfenster, zwei Briefings, mindestens15min Abstand", () => {
    const termine = [];
    for (const cron of config.crons) {
      const [minute, stunde, ...rest] = cron.schedule.split(" "); assert.deepEqual(rest, ["*", "*", "*"]);
      for (const m of minute.split(",").map(Number)) termine.push({ minute: Number(stunde) * 60 + m, path: cron.path });
    }
    termine.sort((a, b) => a.minute - b.minute);
    assert.deepEqual(termine.filter(t => t.path.startsWith("/api/cron/crawl")).map(t => t.minute), [180, 195, 210, 225, 240, 255, 270, 285]);
    assert.equal(termine.length, 10); assert.equal(config.functions["api/index.js"].maxDuration, fenster.FENSTER_SEKUNDEN);
    for (let i = 1; i < termine.length; i++) assert.ok(termine[i].minute - termine[i - 1].minute >= 15);
    assert.equal(termine[8].path, "/api/cron/lage-briefing"); assert.equal(termine[9].path, "/api/cron/morning-briefing");
  });
  console.log(`PASS ${pass}/${pass} Quellen-Arbeitsfenster; keine Productionaufrufe`);
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
