"use strict";

// Neue, isolierte Ausnahmegrenzen. Echter Fensterkern, synthetische atomare
// RPC-Zaehler und bestehende Lease-Schnittstelle; kein Cron-, Modell- oder DB-Lauf.
const A = require("node:assert/strict");
if (process.argv.length !== 2) throw Error("Unbekannte Testauswahl");
const verboten = [];
const fail = name => () => { verboten.push(name); throw Error(name + " verboten"); };
global.fetch = fail("Netz"); require("node:https").request = fail("HTTPS");
const F = require("../lib/helmut/quellen-arbeitsfenster");
const ENV = Object.freeze({ HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SCALABLE_PIPELINE: "on",
  HELMUT_JOB_DISPATCH_MODE: "shadow", HELMUT_KLASSEN_GRENZEN: "on",
  HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16" });
const extraKey = "quellenarbeit|fachthemen-reparatur-v1", day = "2026-11-14";
const auftrag = (nr = 1, tag = day) => ({ tag, auftragId: "00000000-0000-4000-8000-" + String(nr).padStart(12, "0") });
function welt(start = day + "T12:00:00Z") {
  let zeit = Date.parse(start), leaseBis = 0, nr = 0;
  const w = { calls: [], leases: [], freed: [], works: [], konten: new Map() };
  const tag = () => new Date(zeit).toISOString().slice(0, 10);
  w.stand = (key, d = tag()) => w.konten.get(d + "|" + key) || 0;
  w.seed = (key, n, d = tag()) => w.konten.set(d + "|" + key, n);
  w.now = () => zeit; w.advance = n => { zeit += n; };
  w.seed(F.SCHLUESSEL.fenster, 8); w.seed(F.SCHLUESSEL.sekunden, 2400);
  w.deps = { now: () => zeit, bereitschaft: async () => ({ bereit: true }), automatik: async () => ({ erlaubt: true }),
    reserviere: async o => {
      w.calls.push(structuredClone(o));
      const n = w.stand(o.schluessel);
      if (n + o.menge > o.grenzeTag) return { verfuegbar: true, erlaubt: false, grund: "tagesgrenze" };
      w.seed(o.schluessel, n + o.menge); return { verfuegbar: true, erlaubt: true };
    }, klassen: { belege: async (klasse, options) => {
      w.leases.push({ klasse, ...options });
      if (leaseBis > zeit) return { erlaubt: false, grund: "belegt" };
      leaseBis = zeit + options.ttlMs; return { erlaubt: true, slot: "synthetische-globale-lease-" + (++nr) };
    }, gebeFrei: async slot => { w.freed.push(slot); leaseBis = 0; } } };
  w.run = (adminAuftrag = auftrag(), env = ENV, arbeit = async x => {
    A.equal(F.freigabeGueltig(x.freigabe, zeit), true); w.works.push(x);
    return { ok: true, verarbeitet: true };
  }) => F.fuehreAus({ env, deps: w.deps, adminAuftrag, arbeit });
  return w;
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Bestaetigtes achtes Tageslimit bucht genau einen globalen Zusatzstand auf neun und2700", async () => {
    const w = welt(), start = w.now(), r = await w.run();
    A.equal(r.ok, true); A.equal(w.works.length, 1);
    A.deepEqual(w.calls.map(c => [c.schluessel, c.menge, c.grenzeTag]), [
      ["quellenarbeit|slot|admin|" + day + "|" + auftrag().auftragId, 1, 1],
      [F.SCHLUESSEL.fenster, 1, 8], [extraKey, 1, 1], [F.SCHLUESSEL.fenster, 1, 9], [F.SCHLUESSEL.sekunden, 300, 2700]
    ]);
    A.ok(w.calls.every(c => c.grenzeMinute === 0)); A.equal(w.stand(F.SCHLUESSEL.fenster), 9);
    A.equal(w.stand(F.SCHLUESSEL.sekunden), 2700); A.equal(w.stand(extraKey), 1);
    A.equal(r.arbeitsfenster.grenzen.fenster, 9); A.equal(r.arbeitsfenster.grenzen.sekunden, 2700);
    A.equal(r.arbeitsfenster.einmalausnahme.grund, "fachthemen-reparatur-v1");
    A.deepEqual(r.arbeitsfenster.einmalausnahme.normaleGrenzen, { fenster: 8, sekunden: 2400, originale: 16 });
    A.equal(r.arbeitsfenster.grenzen.originale, 32);
    A.equal(r.arbeitsfenster.einmalausnahme.reservierungBestaetigt, true);
    A.equal(w.works[0].startMs, start); A.equal(w.works[0].freigabe.endeMs, start + 300000);
    A.deepEqual(w.leases, [{ klasse: "worker-drain", ttlMs: 360000 }]); A.deepEqual(w.freed, []);
    A.equal(F.freigabeGueltig(w.works[0].freigabe, start), false, "Lokale Freigabe nach Abschluss geloescht");
  });
  await test("Andere UUID und Wiederzustellung koennen das globale Zusatzfenster nicht erneut verbrauchen", async () => {
    const w = welt(); await w.run();
    // Die bestehende Lease bleibt bis ueber300s stehen; erst danach ein zweiter Auftrag.
    A.equal((await w.run(auftrag(2))).grund, "arbeitsfenster-belegt-oder-unbekannt");
    w.advance(361000); const second = await w.run(auftrag(2));
    A.equal(second.ok, false); A.equal(second.limit, extraKey); A.equal(w.works.length, 1);
    const calls = w.calls.length, repeat = await w.run(auftrag());
    A.equal(repeat.ok, false); A.ok(repeat.limit.startsWith("quellenarbeit|slot|admin|"));
    A.equal(w.calls.length, calls + 1); A.equal(w.stand(extraKey), 1);
    A.equal(w.stand(F.SCHLUESSEL.fenster), 9); A.equal(w.stand(F.SCHLUESSEL.sekunden), 2700);
  });
  await test("UTC15November Cron andere Limits und ungueltige Adminauftraege erhalten keine Ausnahme", async () => {
    for (const tag of ["2026-11-13", "2026-11-15"]) {
      const w = welt(tag + "T12:00:00Z"), r = await w.run(auftrag(1, tag));
      A.equal(r.ok, false); A.equal(w.calls.some(c => c.schluessel === extraKey), false); A.equal(w.works.length, 0);
    }
    const cron = welt(day + "T03:00:00Z"); A.equal((await cron.run(null)).ok, false);
    A.equal(cron.calls.some(c => c.schluessel === extraKey), false);
    for (const limits of [{ HELMUT_QUELLEN_FENSTER_TAG: "7" }, { HELMUT_QUELLEN_SEKUNDEN_TAG: "2100" },
      { HELMUT_ORIGINALABRUFE_TAG: "17" }]) {
      const w = welt(); A.equal((await w.run(auftrag(), { ...ENV, ...limits })).ok, false);
      A.equal(w.calls.some(c => c.schluessel === extraKey), false);
    }
    for (const bad of [{ tag: day, auftragId: "ungueltig" }, auftrag(1, "2026-11-13"), { ...auftrag(), extra: true }]) {
      const w = welt(); A.equal((await w.run(bad)).ok, false); A.deepEqual(w.calls, []);
    }
  });
  await test("Nur bekannte Fenster-Tagesgrenze eroeffnet die Ausnahme, niemals UNKNOWN oder andere Ablehnungen", async () => {
    for (const failure of [null, { verfuegbar: false, erlaubt: false }, { verfuegbar: true },
      { verfuegbar: true, erlaubt: false, grund: "minutengrenze" },
      { verfuegbar: true, erlaubt: false, grund: "unbekannt" }, "throw"]) {
      const w = welt(), reserve = w.deps.reserviere;
      w.deps.reserviere = async o => { if (o.schluessel === F.SCHLUESSEL.fenster) {
        w.calls.push(o); if (failure === "throw") throw Error("Unklarer Ausgang"); return failure;
      } return reserve(o); };
      A.equal((await w.run()).ok, false); A.equal(w.calls.some(c => c.schluessel === extraKey), false);
      A.equal(w.works.length, 0); A.equal(w.stand(F.SCHLUESSEL.sekunden), 2400);
    }
    const seconds = welt(); seconds.seed(F.SCHLUESSEL.fenster, 7);
    A.equal((await seconds.run()).ok, false); A.equal(seconds.calls.some(c => c.schluessel === extraKey), false);
  });
  await test("Verlorene Zusatzantwort wird nie kompensiert oder als Arbeitsfreigabe behandelt", async () => {
    const w = welt(), reserve = w.deps.reserviere;
    w.deps.reserviere = async o => { const r = await reserve(o);
      if (o.schluessel === extraKey && r.erlaubt) return { verfuegbar: false }; return r; };
    A.equal((await w.run()).ok, false); A.equal(w.stand(extraKey), 1); A.equal(w.works.length, 0);
    A.equal(w.stand(F.SCHLUESSEL.fenster), 8); A.equal(w.stand(F.SCHLUESSEL.sekunden), 2400);
    A.equal((await w.run(auftrag(2))).ok, false); A.equal(w.stand(extraKey), 1); A.equal(w.works.length, 0);
  });
  await test("Teilbuchungen bei unklarem Fenster oder Sekundenende bleiben unveraendert verbraucht", async () => {
    for (const part of [F.SCHLUESSEL.fenster, F.SCHLUESSEL.sekunden]) {
      const w = welt(), reserve = w.deps.reserviere;
      w.deps.reserviere = async o => { const r = await reserve(o);
        if (o.schluessel === part && r.erlaubt && o.grenzeTag === (part === F.SCHLUESSEL.fenster ? 9 : 2700))
          throw Error("Antwort nach bestaetigter Teilbuchung verloren"); return r; };
      const r = await w.run(); A.equal(r.ok, false); A.equal(r.geprueft, false); A.equal(w.works.length, 0);
      A.equal(r.einmalausnahme.reservierungBestaetigt, true); A.equal(w.stand(extraKey), 1);
      A.equal(w.stand(F.SCHLUESSEL.fenster), 9); A.equal(w.stand(F.SCHLUESSEL.sekunden), part === F.SCHLUESSEL.sekunden ? 2700 : 2400);
      const before = structuredClone([...w.konten]); await w.run(auftrag(2));
      for (const [key, value] of before) A.equal(w.konten.get(key), value, "Keine Kompensation einer Teilreservierung");
    }
  });
  await test("Readiness Vorbereitung und UTCWechsel nach Sonderbuchung geben kein verlaengertes Arbeitsfenster frei", async () => {
    const notReady = welt(); notReady.deps.bereitschaft = async () => ({ bereit: false });
    A.equal((await notReady.run()).ok, false); A.deepEqual(notReady.calls, []);
    for (const delay of [60000, 86400000]) {
      const w = welt(), reserve = w.deps.reserviere;
      w.deps.reserviere = async o => { const r = await reserve(o); if (o.schluessel === extraKey) w.advance(delay); return r; };
      const r = await w.run(); A.equal(r.grund, "arbeitsfenster-vorbereitung-zu-lang");
      A.equal(w.works.length, 0); A.equal(w.stand(extraKey, day), 1);
      A.equal(w.stand(F.SCHLUESSEL.fenster, day), 8); A.equal(w.stand(F.SCHLUESSEL.sekunden, day), 2400);
    }
  });
  await test("Hoechstens16Zusatzoriginale nur im lebenden Ausnahmecontext, niemals ausserhalb parallel oder UNKNOWN", async () => {
    const w = welt(); w.seed(F.SCHLUESSEL.originale, 16);
    const original = () => F.reserviereOriginal({ env: ENV, deps: w.deps });
    A.equal((await original()).erlaubt, false); A.equal(w.calls.at(-1).grenzeTag, 16);
    let gateOpen, inside, afterResolve, after,
      gate = new Promise(r => { gateOpen = r; }), started = new Promise(r => { inside = r; }),
      afterGate = new Promise(r => { afterResolve = r; });
    const task = w.run(auftrag(), ENV, async x => {
      A.equal(F.freigabeGueltig(x.freigabe, w.now()), true); inside(); await gate;
      for (let i = 0; i < 16; i++) A.equal((await original()).erlaubt, true);
      A.equal((await original()).erlaubt, false);
      // Diese Unterpromise erbt den Store, darf nach finally aber keine
      // weitere32er-Reservierung versuchen.
      after = afterGate.then(() => original());
      return { ok: true };
    });
    await started; A.equal((await original()).erlaubt, false, "Parallele aeussere Promise erbt kein Zusatzrecht");
    A.equal(w.calls.at(-1).grenzeTag, 16); gateOpen(); const r = await task;
    A.equal(r.ok, true); A.equal(w.stand(F.SCHLUESSEL.originale), 32);
    const beforeAfter = w.calls.length; afterResolve(); A.equal((await after).erlaubt, false);
    A.equal(w.calls.length, beforeAfter + 1); A.equal(w.calls.at(-1).grenzeTag, 16);
    const expired = welt(); expired.seed(F.SCHLUESSEL.originale, 16);
    await expired.run(auftrag(), ENV, async () => { expired.advance(300000);
      A.equal((await F.reserviereOriginal({ env: ENV, deps: expired.deps })).erlaubt, false);
      A.equal(expired.calls.at(-1).grenzeTag, 16); return { ok: false }; });
    const unknown = welt(), reserve = unknown.deps.reserviere; unknown.seed(F.SCHLUESSEL.originale, 16);
    unknown.deps.reserviere = async o => { if (o.schluessel === F.SCHLUESSEL.originale) {
      unknown.calls.push(o); return { verfuegbar: false }; } return reserve(o); };
    await unknown.run(auftrag(), ENV, async () => {
      A.equal((await F.reserviereOriginal({ env: ENV, deps: unknown.deps })).erlaubt, false); return { ok: false }; });
    A.equal(unknown.calls.filter(c => c.schluessel === F.SCHLUESSEL.originale).length, 1);
    A.equal(unknown.stand(F.SCHLUESSEL.originale), 16);
    for (const delay of [300000, 86400000]) {
      const awaited = welt(), reserveAwaited = awaited.deps.reserviere; awaited.seed(F.SCHLUESSEL.originale, 16);
      awaited.deps.reserviere = async o => { const result = await reserveAwaited(o);
        if (o.schluessel === F.SCHLUESSEL.originale && o.grenzeTag === 16) awaited.advance(delay); return result; };
      await awaited.run(auftrag(), ENV, async () => {
        A.equal((await F.reserviereOriginal({ env: ENV, deps: awaited.deps })).erlaubt, false); return { ok: false }; });
      A.equal(awaited.calls.at(-1).grenzeTag, 16, "Recheck nach erstem await verhindert zeitlich abgelaufene32er-Buchung");
    }
    const expiredDuringExtra = welt(), reserveExtra = expiredDuringExtra.deps.reserviere;
    expiredDuringExtra.seed(F.SCHLUESSEL.originale, 16);
    expiredDuringExtra.deps.reserviere = async o => { const result = await reserveExtra(o);
      if (o.schluessel === F.SCHLUESSEL.originale && o.grenzeTag === 32) expiredDuringExtra.advance(300000); return result; };
    await expiredDuringExtra.run(auftrag(), ENV, async () => {
      const result = await F.reserviereOriginal({ env: ENV, deps: expiredDuringExtra.deps });
      A.equal(result.erlaubt, false); A.equal(result.grund, "originalausnahme-abgelaufen"); return { ok: false }; });
    A.equal(expiredDuringExtra.stand(F.SCHLUESSEL.originale), 17, "Bestaetigte spaete Buchung bleibt verbraucht");
    const normal = welt(); normal.seed(F.SCHLUESSEL.fenster, 7); normal.seed(F.SCHLUESSEL.sekunden, 2100);
    const usual = await normal.run(); A.equal(usual.ok, true); A.equal(usual.arbeitsfenster.grenzen.fenster, 8);
    A.equal(usual.arbeitsfenster.grenzen.sekunden, 2400); A.equal(usual.arbeitsfenster.einmalausnahme, undefined);
    A.equal(normal.calls.some(c => c.schluessel === extraKey), false);
  });
  A.equal(count, 8); A.deepEqual(verboten, []);
  console.log("8/8 neue Einmalfenstergruppen bestanden; keine Aktivierung, Modelle oder Produktionszugriffe.");
})().catch(e => { console.error(e); process.exitCode = 1; });
