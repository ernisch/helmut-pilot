"use strict";

// Isolierter Vertragsnachweis: kein HTTP, keine Modelle, keine Production.
// Die atomare RPC selbst ist im vorhandenen Anbieter-Datenbanktest nachgewiesen.
const assert = require("node:assert/strict");
const fenster = require("../lib/helmut/quellen-arbeitsfenster");
const tagbetrieb = require("../lib/helmut/quellen-tagesbetrieb");
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
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
async function check(name, fn) { if (only && !name.includes(only)) return; await fn(); pass++; console.log(`PASS ${name}`); }
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
const OPERATOR_KEY = "quellenarbeit|operatorabschluss-20261117";
const operatorAuftrag = (tag = "2026-11-17", letzteZiffer = "1") => ({ tag,
  auftragId: `00000000-0000-4000-8000-00000000000${letzteZiffer}` });
function operatorWelt(time = "2026-11-17T09:16:00Z") {
  const w = welt(); w.setze(time);
  const tag = new Date(w.zeit()).toISOString().slice(0, 10);
  for (const [key, wert] of [[fenster.SCHLUESSEL.fenster, 8], [fenster.SCHLUESSEL.sekunden, 2400], [fenster.SCHLUESSEL.originale, 16]])
    w.konten.set(`${tag}|${key}`, wert);
  return w;
}
const operatorLauf = (w, arbeit = async () => ({ ok: true }), auftrag = operatorAuftrag(), env = ENV) =>
  fenster.fuehreAus({ env, deps: w.deps, arbeit, adminAuftrag: auftrag });

const ERSATZ_KEY = "quellenarbeit|operatorreadback-20261117";
function ersatzWelt() {
  const w = operatorWelt("2026-11-17T10:00:00Z");
  for (const [key,wert] of [[fenster.SCHLUESSEL.fenster,9],[fenster.SCHLUESSEL.sekunden,2700],[OPERATOR_KEY,1]])
    w.konten.set(`2026-11-17|${key}`,wert);
  w.quittung = [{ status:"failed", target_count:0,processed_count:0,failed_count:0,
    reason:"operator-planung-nicht-bestaetigt",error_class:"planung-nicht-bestaetigt",
    commit_ref:"3e174583dc8a8c66a3e129a7df57ce0ac9706f66",
    started_at:"2026-11-17T09:43:16.581Z",finished_at:"2026-11-17T09:43:19.390Z" }];
  w.job = [{id:"89dd9752-f517-40d0-ba72-d32beeb1c772"}];
  w.deps.request = async url => {
    if (url.startsWith("/rest/v1/helmut_anbieter_fenster?")) return w.staende ||
      [...w.konten].filter(([k])=>k.startsWith("2026-11-17|quellenarbeit|") && !k.includes("|slot|"))
        .map(([k,verbraucht])=>({schluessel:k.slice(11),verbraucht}));
    if (url.startsWith("/rest/v1/process_runs?")) {
      assert.match(url,/run_id=eq.admin-quellen-2026-11-17-5d84f123-2e13-4163-a6f9-4b6e2d82827b/);
      assert.match(url,/process=eq.warteschlange-crawl/);return structuredClone(w.quittung);
    }
    assert.match(url,/^\/rest\/v1\/helmut_jobs\?id=eq.89dd9752-f517-40d0-ba72-d32beeb1c772/);
    assert.match(url,/job_type=eq.source_fetch&tenant_id=is.null&status=eq.wartend&attempts=eq.0/);
    assert.match(decodeURIComponent(url),/idempotency_key=eq.source_fetch\|geteilt\|c3152336a40919745fd39b17b819a230\|2026-11-17T00Z/);
    assert.match(url,/select=id&limit=2$/);return structuredClone(w.job);
  };
  return w;
}

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
    const w = welt(), original = pipeline.betriebsstatus, storage = require("../lib/helmut/storage");
    const originalKern = storage.jobQueueTageskernBereit; let erlaubt = false, reads = 0;
    storage.jobQueueTageskernBereit = async () => ({ verfuegbar: true });
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
    } finally { pipeline.betriebsstatus = original; storage.jobQueueTageskernBereit = originalKern; }
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
  await check("104 Aufrufe mit Berliner Vorabend-, Nacht-, Pflicht- und Ausgabefenstern", () => {
    assert.equal(config.crons[0].schedule, "*/15 * * * *");
    assert.equal(config.functions["api/index.js"].maxDuration, fenster.FENSTER_SEKUNDEN);
    const termine = config.crons.slice(1).map(cron => {
      const [minute, stunde, ...rest] = cron.schedule.split(" ");
      assert.deepEqual(rest, ["*", "*", "*"]);
      return stunde.split(",").flatMap(h => minute.split(",").map(m => (Number(h) * 60 + Number(m)) * 60000));
    });
    assert.equal(96 + termine.flat().length, 104);
    for (const [tag, offset] of [["2026-03-28", 1], ["2026-03-29", 2], ["2026-10-24", 2], ["2026-10-25", 1]]) {
      const start = Date.parse(`${tag}T00:00:00Z`);
      const z = tagbetrieb.zeiten(start);
      assert.equal(z.redaktionsschluss, start + ((6 - offset) * 60 + 45) * 60000);
      assert.equal(z.frist, start + ((7 - offset) * 60 + 30) * 60000);
      assert.deepEqual(termine[0].map(t => start + t).filter(t => tagbetrieb.ausgabeFaellig("lage", t)),
        [z.redaktionsschluss, z.redaktionsschluss + 600000]);
      assert.deepEqual(termine[1].map(t => start + t).filter(t => tagbetrieb.ausgabeFaellig("briefing", t)),
        [z.paketStart, z.paketStart + 600000]);
      const slots = Array.from({ length: 96 }, (_, i) => tagbetrieb.quellenslot(start + i * 900000)).filter(Boolean);
      assert.equal(slots.length, 93);
      assert.equal(new Set(slots.map(s => s.slot)).size, 93);
      assert.equal(slots.filter(s => s.pflicht).length, 9);
      assert(slots.some(s => s.slot === "00:00") && slots.some(s => s.slot === "23:45"));
      assert.equal(tagbetrieb.quellenslot(z.redaktionsschluss - 10 * 60000), null, "Verspätung darf kein neues Fenster öffnen");
      assert.equal(tagbetrieb.quellenslot(z.redaktionsschluss), null);
      assert(tagbetrieb.quellenslot(z.frist));
    }
    const schnitt = Date.parse("2026-11-20T05:45:00Z");
    assert(tagbetrieb.vorSchnitt({ created_at: "2026-11-20T05:44:00Z" }, schnitt));
    assert(!tagbetrieb.vorSchnitt({ created_at: "2026-11-20T05:46:00Z", published_at: "2026-11-19" }, schnitt));
    assert(!tagbetrieb.vorSchnitt({ published_at: "2026-11-19" }, schnitt));
  });
  await check("Ganztag schützt elf Pflichtoriginale und einen Wiederholungsplatz vor Altaufträgen", async () => {
    const w = welt();
    const ganztag = arbeit => fenster.fuehreAus({ env: ENV, deps: w.deps, ganztags: true, arbeit });
    w.setze("2026-11-19T00:45:00Z");
    const original = pflichtOriginal => fenster.reserviereOriginal({ env: ENV, deps: w.deps, pflichtOriginal });
    const [quelle] = require("../lib/helmut/quellen-bundestag-termine").QUELLEN;
    let katalogLesungen = 0;
    const handler = require("../lib/helmut/scalable-pipeline").HANDLER.source_fetch;
    const termin = firstDueAt => handler({ id: "termin-fixture", firstDueAt, payload: { quelle } },
      { env: ENV, now: w.zeit, leseBundestagTermineKatalog: async () => { katalogLesungen++; return {}; } },
      { auftragsDeadlineMs: w.zeit() + 60000 });
    const alt = "2026-11-18T00:00:00Z";
    const erste = await ganztag(async () => {
      const vertagt = await termin(alt);
      assert.equal(vertagt.grund, "bundestag-termine-heutige-pflichtquellen-vorrang");
      assert.equal(vertagt.bundestagAbrufpauseMs, Date.parse("2026-11-19T06:30:00Z") - w.zeit());
      assert.equal(katalogLesungen, 0);
      assert.equal((await termin("2026-11-19T00:00:00Z")).grund, "bundestag-termine-rechte-oder-aktivierung-offen");
      for (let i = 0; i < 4; i++) assert((await original(false)).erlaubt);
      assert(!((await original(false)).erlaubt));
      for (let i = 0; i < 12; i++) assert((await original(true)).erlaubt);
      assert(!((await original(true)).erlaubt));
      return { ok: true };
    });
    assert.equal(erste.arbeitsfenster.grenzen.fenster, 96);
    assert.equal(erste.arbeitsfenster.grenzen.originale, 16);
    assert.equal(w.stand(fenster.SCHLUESSEL.originale), 16);
    await ganztag(() => assert.fail("Paralleler Abruf im selben Fenster"));
    w.setze("2026-11-19T01:15:00Z");
    assert((await ganztag(async () => ({ ok: true }))).ok);
    assert.equal(w.stand(fenster.SCHLUESSEL.fenster), 2);
    w.setze("2026-11-19T06:30:00Z");
    assert((await ganztag(async () => {
      assert.equal((await termin(alt)).grund, "bundestag-termine-rechte-oder-aktivierung-offen");
      assert.equal(katalogLesungen, 2);
      return { ok: true };
    })).ok);
  });
  await check("Verspätetes Original-OK verbraucht die Buchung ohne Abrufrecht", async () => {
    const w = welt();
    const result = await fenster.fuehreAus({ env: ENV, deps: w.deps, ganztags: true, arbeit: async () => {
      const original = await fenster.reserviereOriginal({ env: ENV, pflichtOriginal: true, deps: {
        reserviere: async args => {
          const buchung = await w.deps.reserviere(args);
          w.weiter(fenster.FENSTER_SEKUNDEN * 1000);
          return buchung;
        }
      } });
      assert.equal(original.erlaubt, false);
      assert.equal(original.grund, "originalfenster-abgelaufen");
      return { ok: true };
    } });
    assert.equal(result.ok, true);
    assert.equal(w.stand(fenster.SCHLUESSEL.originale), 1);
  });
  await check("17Nov ab09:16 genau ein global gebuchtes Zusatzfenster ohne weitere Originalrechte", async () => {
    const w = operatorWelt(); let arbeiten = 0;
    const r = await operatorLauf(w, async ({ freigabe }) => {
      arbeiten++; assert(fenster.freigabeGueltig(freigabe, w.zeit()));
      assert.equal((await fenster.reserviereOriginal({ env: ENV, deps: w.deps })).erlaubt, false);
      return { ok: true };
    });
    assert.equal(r.ok, true); assert.equal(arbeiten, 1);
    assert.deepEqual(r.arbeitsfenster.grenzen, { gueltig: true, fenster: 9, sekunden: 2700, originale: 16 });
    assert.equal(r.arbeitsfenster.einmalausnahme.grund, "operatorabschluss-20261117");
    assert.deepEqual(r.arbeitsfenster.einmalausnahme.normaleGrenzen, { fenster: 8, sekunden: 2400, originale: 16 });
    assert.equal(w.stand(OPERATOR_KEY), 1); assert.equal(w.stand(fenster.SCHLUESSEL.fenster), 9);
    assert.equal(w.stand(fenster.SCHLUESSEL.sekunden), 2700); assert.equal(w.stand(fenster.SCHLUESSEL.originale), 16);
    assert(w.rpcs.filter(o => o.schluessel === fenster.SCHLUESSEL.originale).every(o => o.grenzeTag === 16));
    w.weiter(360000);
    const wieder = await operatorLauf(w, async () => assert.fail("Kein zweites Zusatzfenster"), operatorAuftrag("2026-11-17", "2"));
    assert.equal(wieder.grund, "arbeitslimit-tagesgrenze"); assert.equal(wieder.limit, OPERATOR_KEY);
    assert.equal(w.stand(OPERATOR_KEY), 1); assert.equal(w.stand(fenster.SCHLUESSEL.fenster), 9);
    assert.equal(w.stand(fenster.SCHLUESSEL.sekunden), 2700); assert.equal(arbeiten, 1);
  });
  await check("17Nov Zusatzrecht gilt weder vor09:16 noch fuer regulaeren Cron oder andere Basisgrenzen", async () => {
    const vor = operatorWelt("2026-11-17T09:15:59Z");
    assert.equal((await operatorLauf(vor, async () => assert.fail("Noch nicht freigegeben"))).limit, fenster.SCHLUESSEL.fenster);
    assert.equal(vor.stand(OPERATOR_KEY), 0);
    const cron = operatorWelt("2026-11-17T04:45:00Z");
    assert.equal((await lauf(cron, async () => assert.fail("Keine Operatorausnahme im Cron"))).limit, fenster.SCHLUESSEL.fenster);
    assert.equal(cron.stand(OPERATOR_KEY), 0);
    for (const override of [{ HELMUT_QUELLEN_FENSTER_TAG: "7" }, { HELMUT_QUELLEN_SEKUNDEN_TAG: "2100" }, { HELMUT_ORIGINALABRUFE_TAG: "15" }]) {
      const w = operatorWelt();
      assert.equal((await operatorLauf(w, async () => assert.fail("Keine Erweiterung anderer Grenzen"), operatorAuftrag(), { ...ENV, ...override })).limit,
        fenster.SCHLUESSEL.fenster);
      assert.equal(w.stand(OPERATOR_KEY), 0);
    }
  });
  await check("Operatorauftrag braucht gueltigen heutigen Tag und endet vor UTC Tageswechsel", async () => {
    for (const auftrag of [operatorAuftrag("2026-11-16"), operatorAuftrag("2026-11-18"),
      { ...operatorAuftrag(), auftragId: "keine-uuid" }, { ...operatorAuftrag(), extra: true }]) {
      const w = operatorWelt();
      assert.equal((await operatorLauf(w, async () => assert.fail("Keine fremde Autoritaet"), auftrag)).grund, "adminauftrag-ungueltig-oder-abgelaufen");
      assert.equal(w.rpcs.length, 0);
    }
    const ende = operatorWelt("2026-11-17T23:55:00Z");
    assert.equal((await operatorLauf(ende, async () => assert.fail("Kein Start ueber Tagesende"))).grund, "adminauftrag-tagesende");
    assert.equal(ende.rpcs.length, 0);
    for (const tag of ["2026-11-16", "2026-11-18"]) {
      const w = operatorWelt(`${tag}T09:16:00Z`);
      assert.equal((await operatorLauf(w, async () => assert.fail("Keine Ausnahme am anderen Tag"), operatorAuftrag(tag))).limit, fenster.SCHLUESSEL.fenster);
      assert.equal(w.stand(OPERATOR_KEY), 0);
    }
  });
  await check("Operator UNKNOWN und Teilreservierung bleiben ohne Retry oder Erstattung verbraucht", async () => {
    for (const phase of ["normal", "extra", "fenster", "sekunden"]) {
      const w = operatorWelt(), reserviere = w.deps.reserviere; let arbeiten = 0, verloren = false;
      w.deps.reserviere = async o => {
        const r = await reserviere(o);
        const trifft = phase === "normal" && o.schluessel === fenster.SCHLUESSEL.fenster && o.grenzeTag === 8
          || phase === "extra" && o.schluessel === OPERATOR_KEY
          || phase === "fenster" && o.schluessel === fenster.SCHLUESSEL.fenster && o.grenzeTag === 9
          || phase === "sekunden" && o.schluessel === fenster.SCHLUESSEL.sekunden;
        if (!verloren && trifft) { verloren = true; throw Error("Antwort verloren"); }
        return r;
      };
      const r = await operatorLauf(w, async () => { arbeiten++; return { ok: true }; });
      assert.equal(r.grund, "arbeitslimit-nicht-pruefbar"); assert.equal(arbeiten, 0); assert.equal(verloren, true);
      assert.equal(w.stand(OPERATOR_KEY), phase === "normal" ? 0 : 1);
      assert.equal(w.stand(fenster.SCHLUESSEL.fenster), ["fenster", "sekunden"].includes(phase) ? 9 : 8);
      assert.equal(w.stand(fenster.SCHLUESSEL.sekunden), phase === "sekunden" ? 2700 : 2400);
      if (phase !== "normal") {
        const wieder = await operatorLauf(w, async () => assert.fail("UNKNOWN darf nicht wiederholt werden"), operatorAuftrag("2026-11-17", "2"));
        assert.equal(wieder.limit, OPERATOR_KEY); assert.equal(wieder.grund, "arbeitslimit-tagesgrenze");
        assert.equal(arbeiten, 0);
      } else assert.equal(w.rpcs.some(o => o.schluessel === OPERATOR_KEY), false);
    }
  });
  await check("genau ein beleggebundenes Ersatzfenster erhaelt alte9/2700 und Original16", async () => {
    const w=ersatzWelt();let n=0;
    const r=await operatorLauf(w,async()=>{n++;return{ok:true};});
    assert.equal(r.ok,true);assert.equal(r.arbeitsfenster.einmalausnahme.grund,"operatorreadback-20261117");
    assert.equal(w.stand(fenster.SCHLUESSEL.fenster),10);assert.equal(w.stand(fenster.SCHLUESSEL.sekunden),3000);
    assert.equal(w.stand(fenster.SCHLUESSEL.originale),16);assert.equal(w.stand(OPERATOR_KEY),1);assert.equal(w.stand(ERSATZ_KEY),1);
    assert.equal((await fenster.reserviereOriginal({env:ENV,deps:w.deps})).erlaubt,false);
    w.weiter(361000);
    await operatorLauf(w,()=>assert.fail("Kein zweites Ersatzfenster"),operatorAuftrag("2026-11-17","2"));
    assert.equal(n,1);assert.equal(w.stand(ERSATZ_KEY),1);assert.equal(w.stand(fenster.SCHLUESSEL.fenster),10);
  });
  await check("Ersatz braucht exakten vollstaendigen Quotenvorstand ohne UNKNOWN oder Doppelzeilen",async()=>{
    for(const mutate of [w=>w.konten.set("2026-11-17|"+fenster.SCHLUESSEL.fenster,8),
      w=>w.konten.set("2026-11-17|"+fenster.SCHLUESSEL.sekunden,2400),
      w=>w.konten.set("2026-11-17|"+OPERATOR_KEY,2),w=>w.konten.set("2026-11-17|"+ERSATZ_KEY,1),
      w=>w.konten.set("2026-11-17|"+fenster.SCHLUESSEL.originale,17),
      w=>w.konten.delete("2026-11-17|"+fenster.SCHLUESSEL.originale),
      w=>w.staende=[],w=>w.deps.request=async()=>{throw Error("UNKNOWN");}]){
      const w=ersatzWelt();mutate(w);let arbeit=0;await operatorLauf(w,async()=>{arbeit++;});
      assert.equal(arbeit,0);assert(!w.rpcs.some(r=>r.schluessel===ERSATZ_KEY));
    }
  });
  await check("Ersatz verlangt echte nullarbeits Fehlerquittung und exakt wartenden Erstauftrag",async()=>{
    for(const mutate of [w=>w.quittung=[],w=>w.quittung.push(w.quittung[0]),
      ...["status","reason","error_class","commit_ref","started_at","finished_at"].map(k=>w=>w.quittung[0][k]="fremd"),
      ...["target_count","processed_count","failed_count"].flatMap(k=>[w=>w.quittung[0][k]=1,w=>w.quittung[0][k]=null]),
      w=>w.job=[],w=>w.job=[{id:"fremd"}],w=>w.job.push(w.job[0])]){
      const w=ersatzWelt();mutate(w);await operatorLauf(w,()=>assert.fail("Fehlender Erstbeleg"));
      assert(!w.rpcs.some(r=>r.schluessel===ERSATZ_KEY));
    }
  });
  await check("UNKNOWN beim Ersatzkey bleibt verbraucht ohne nachtraeglichen Worker oder Erstattung",async()=>{
    const w=ersatzWelt(), reserve=w.deps.reserviere;
    w.deps.reserviere=async o=>{const r=await reserve(o);return o.schluessel===ERSATZ_KEY?null:r;};
    await operatorLauf(w,()=>assert.fail("UNKNOWN startet keine Arbeit"));
    assert.equal(w.stand(ERSATZ_KEY),1);assert.equal(w.stand(fenster.SCHLUESSEL.fenster),9);
    assert.equal(w.stand(fenster.SCHLUESSEL.sekunden),2700);
    w.weiter(361000);await operatorLauf(w,()=>assert.fail("UNKNOWN bleibt ohne Retry"),operatorAuftrag("2026-11-17","2"));
    assert.equal(w.stand(ERSATZ_KEY),1);assert.equal(w.stand(fenster.SCHLUESSEL.fenster),9);
  });
  console.log(`PASS ${pass}/${pass} Quellen-Arbeitsfenster; keine Productionaufrufe`);
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
