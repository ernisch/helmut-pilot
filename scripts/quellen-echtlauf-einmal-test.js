"use strict";

// NUR neue zweite Einmalberechtigung: echter vorhandener Fensterkern,
// synthetischer atomarer RPC-/Lesetransport. Kein alter Testimport/Netz/Modell/DB.
const A = require("node:assert/strict"), F = require("../lib/helmut/quellen-arbeitsfenster");
if (process.argv.length !== 2) throw Error("Unbekannte Testauswahl");
const verboten = [], fail = name => () => { verboten.push(name); throw Error(name + " verboten"); };
global.fetch = fail("Netz"); require("node:https").request = fail("HTTPS"); require("node:http").request = fail("HTTP");
const day = "2026-11-14", altKey = "quellenarbeit|fachthemen-reparatur-v1",
  neuKey = "quellenarbeit|briefing-echtnachweis-v1", clone = structuredClone,
  ENV = Object.freeze({ HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SCALABLE_PIPELINE: "on",
    HELMUT_JOB_DISPATCH_MODE: "shadow", HELMUT_KLASSEN_GRENZEN: "on",
    HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16" }),
  auftrag = (n = 1, tag = day) => ({ tag, auftragId: "00000000-0000-4000-8000-" + String(n).padStart(12, "0") });
function welt(start = day + "T21:25:00Z") {
  let zeit = Date.parse(start), leaseBis = 0;
  const w = { konten: new Map(), calls: [], reads: [], works: [], freed: [] }, tag = () => new Date(zeit).toISOString().slice(0, 10);
  w.now = () => zeit; w.advance = n => { zeit += n; };
  w.stand = (key, d = tag()) => w.konten.get(d + "|" + key) || 0;
  w.seed = (key, value, d = tag()) => w.konten.set(d + "|" + key, value);
  for (const [key, value] of [[F.SCHLUESSEL.fenster, 9], [F.SCHLUESSEL.sekunden, 2700],
    [F.SCHLUESSEL.originale, 23], [altKey, 1]]) w.seed(key, value);
  w.deps = { now: w.now, bereitschaft: async () => ({ bereit: true }), automatik: async () => ({ erlaubt: true }),
    request: async path => {
      w.reads.push(path); const u = new URL(path, "https://synthetischer-speicher.invalid");
      A.equal(u.pathname, "/rest/v1/helmut_anbieter_fenster"); A.equal(u.searchParams.get("fensterart"), "eq.tag");
      A.equal(u.searchParams.get("fenster_start"), "eq." + tag() + "T00:00:00Z");
      A.equal(u.searchParams.get("select"), "schluessel,verbraucht"); A.equal(u.searchParams.get("limit"), "6");
      const keys = [F.SCHLUESSEL.fenster, F.SCHLUESSEL.sekunden, F.SCHLUESSEL.originale, altKey, neuKey];
      A.equal(u.searchParams.get("schluessel"), "in.(" + keys.join(",") + ")");
      const rows = keys.filter(k => w.konten.has(tag() + "|" + k)).map(k => ({ schluessel: k, verbraucht: w.stand(k) }));
      return w.changeRead ? w.changeRead(rows) : rows;
    }, reserviere: async o => {
      w.calls.push(clone(o)); const value = w.stand(o.schluessel);
      if (value + o.menge > o.grenzeTag) return { verfuegbar: true, erlaubt: false, grund: "tagesgrenze" };
      w.seed(o.schluessel, value + o.menge); return { verfuegbar: true, erlaubt: true };
    }, klassen: { belege: async (klasse, opts) => {
      A.equal(klasse, "worker-drain"); A.equal(opts.ttlMs, 360000);
      if (leaseBis > zeit) return { erlaubt: false }; leaseBis = zeit + opts.ttlMs;
      return { erlaubt: true, slot: "synthetischer-echtlaufslot" };
    }, gebeFrei: async slot => { w.freed.push(slot); leaseBis = 0; } } };
  w.run = (a = auftrag(), env = ENV, arbeit = async x => {
    A.equal(F.freigabeGueltig(x.freigabe, zeit), true); w.works.push(x); return { ok: true };
  }) => F.fuehreAus({ env, deps: w.deps, adminAuftrag: a, arbeit });
  return w;
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Vollstaendiger9erVorstand und alterEinmalkey erlauben genau10Fenster3000s bei unveraendert32Originalen", async () => {
    const w = welt(), r = await w.run(); A.equal(r.ok, true); A.equal(w.reads.length, 1); A.equal(w.works.length, 1);
    A.deepEqual(w.calls.map(c => [c.schluessel, c.grenzeTag]), [
      ["quellenarbeit|slot|admin|" + day + "|" + auftrag().auftragId, 1], [F.SCHLUESSEL.fenster, 8],
      [altKey, 1], [neuKey, 1], [F.SCHLUESSEL.fenster, 10], [F.SCHLUESSEL.sekunden, 3000]
    ]);
    A.equal(w.stand(altKey), 1); A.equal(w.stand(neuKey), 1); A.equal(w.stand(F.SCHLUESSEL.fenster), 10);
    A.equal(w.stand(F.SCHLUESSEL.sekunden), 3000); A.equal(w.stand(F.SCHLUESSEL.originale), 23);
    A.deepEqual(r.arbeitsfenster.grenzen, { gueltig: true, fenster: 10, sekunden: 3000, originale: 32 });
    A.equal(r.arbeitsfenster.einmalausnahme.grund, "briefing-echtnachweis-v1");
    A.equal(r.arbeitsfenster.einmalausnahme.reservierungBestaetigt, true); A.deepEqual(w.freed, []);
    A.equal(F.freigabeGueltig(w.works[0].freigabe, w.now()), false);
  });
  await test("NeuerEinmalkey bleibt global einmalig auch fuer andereUUID und alteAuftragswiederzustellung", async () => {
    const w = welt(); await w.run(); A.equal((await w.run(auftrag(2))).grund, "arbeitsfenster-belegt-oder-unbekannt");
    w.advance(361000); const r = await w.run(auftrag(2)); A.equal(r.ok, false);
    A.equal(w.calls.filter(c => c.schluessel === neuKey).length, 1); A.equal(w.works.length, 1);
    A.equal(w.stand(neuKey), 1); A.equal(w.stand(F.SCHLUESSEL.fenster), 10); A.equal(w.stand(F.SCHLUESSEL.sekunden), 3000);
    const before = w.calls.length; A.equal((await w.run()).ok, false); A.equal(w.calls.length, before + 1);
  });
  await test("NeueBerechtigung gilt nur fuerUTC14Admin und unveraenderteNormalgrenzen", async () => {
    const vorFreigabe = welt(day + "T21:19:59.999Z"); A.equal((await vorFreigabe.run()).ok, false);
    A.equal(vorFreigabe.reads.length, 0); A.equal(vorFreigabe.calls.some(c => c.schluessel === neuKey), false);
    for (const d of ["2026-11-13", "2026-11-15"]) {
      const w = welt(d + "T12:00:00Z"); A.equal((await w.run(auftrag(1, d))).ok, false);
      A.equal(w.reads.length, 0); A.equal(w.calls.some(c => c.schluessel === neuKey), false);
    }
    const cron = welt(day + "T03:00:00Z"); A.equal((await cron.run(null)).ok, false); A.equal(cron.reads.length, 0);
    for (const delta of [{ HELMUT_QUELLEN_FENSTER_TAG: "7" }, { HELMUT_QUELLEN_SEKUNDEN_TAG: "2100" },
      { HELMUT_ORIGINALABRUFE_TAG: "17" }]) {
      const w = welt(); A.equal((await w.run(auftrag(), { ...ENV, ...delta })).ok, false); A.equal(w.reads.length, 0);
    }
    const bad = welt(); A.equal((await bad.run({ ...auftrag(), zusaetzlich: true })).ok, false); A.equal(bad.calls.length, 0);
  });
  await test("Unbekannte oder andere alteZusatzabsage wird nie in einen neuenKey umgedeutet", async () => {
    for (const failure of [null, { verfuegbar: false }, { verfuegbar: true },
      { verfuegbar: true, erlaubt: false, grund: "minutengrenze" }, "throw"]) {
      const w = welt(), reserve = w.deps.reserviere;
      w.deps.reserviere = async o => { if (o.schluessel === altKey) {
        w.calls.push(o); if (failure === "throw") throw Error("UNKNOWN"); return failure;
      } return reserve(o); };
      A.equal((await w.run()).ok, false); A.equal(w.reads.length, 0); A.equal(w.works.length, 0);
      A.equal(w.calls.some(c => c.schluessel === neuKey), false);
    }
  });
  await test("Fehlender manipulierter oder nurteilweisegebuchterVorstand sperrt vor neuemEinmalkey", async () => {
    for (const change of [r => null, r => r.slice(1), r => [...r, clone(r[0])],
      r => r.map(x => x.schluessel === F.SCHLUESSEL.fenster ? { ...x, verbraucht: 8 } : x),
      r => r.map(x => x.schluessel === F.SCHLUESSEL.sekunden ? { ...x, verbraucht: 2400 } : x),
      r => r.map(x => x.schluessel === F.SCHLUESSEL.originale ? { ...x, verbraucht: 33 } : x),
      r => [...r, { schluessel: neuKey, verbraucht: 1 }],
      r => r.map(x => ({ ...x, verbraucht: String(x.verbraucht) })), r => { throw Error("Read UNKNOWN"); }]) {
      const w = welt(); w.changeRead = change; const r = await w.run();
      A.equal(r.grund, "echtlauf-vorstand-nicht-bestaetigt"); A.equal(w.works.length, 0);
      A.equal(w.calls.some(c => c.schluessel === neuKey), false); A.equal(w.stand(F.SCHLUESSEL.fenster), 9);
    }
  });
  await test("Verlorene neueKey Fenster oder Sekundenantwort laesst Teilbuchungen stehen und verbietet Wiederaufnahme", async () => {
    for (const part of [neuKey, F.SCHLUESSEL.fenster, F.SCHLUESSEL.sekunden]) {
      const w = welt(), reserve = w.deps.reserviere;
      w.deps.reserviere = async o => { const r = await reserve(o);
        if (r.erlaubt && o.schluessel === part && (part === neuKey || o.grenzeTag > 2400 || o.grenzeTag === 10))
          return { verfuegbar: false }; return r; };
      A.equal((await w.run()).ok, false); A.equal(w.stand(neuKey), 1); A.equal(w.works.length, 0);
      A.equal(w.stand(F.SCHLUESSEL.fenster), part === neuKey ? 9 : 10);
      A.equal(w.stand(F.SCHLUESSEL.sekunden), part === F.SCHLUESSEL.sekunden ? 3000 : 2700);
      const before = clone([...w.konten]); A.equal((await w.run(auftrag(2))).ok, false);
      for (const [key, value] of before) A.equal(w.konten.get(key), value);
      A.equal(w.works.length, 0);
    }
  });
  await test("ZweiterAusnahmekontext teilt sich altenOriginalzaehler32 und endet mit Auftragsende oder300s", async () => {
    const w = welt(), original = () => F.reserviereOriginal({ env: ENV, deps: w.deps });
    A.equal((await original()).erlaubt, false);
    let start, release; const started = new Promise(r => { start = r; }), gate = new Promise(r => { release = r; });
    const task = w.run(auftrag(), ENV, async () => {
      start(); await gate; for (let i = 0; i < 9; i++) A.equal((await original()).erlaubt, true);
      A.equal((await original()).erlaubt, false); return { ok: true };
    });
    await started; A.equal((await original()).erlaubt, false); A.equal(w.calls.at(-1).grenzeTag, 16);
    release(); A.equal((await task).ok, true); A.equal(w.stand(F.SCHLUESSEL.originale), 32);
    A.equal((await original()).erlaubt, false); A.equal(w.calls.at(-1).grenzeTag, 16);
    const expired = welt(); await expired.run(auftrag(), ENV, async () => {
      expired.advance(300000); A.equal((await F.reserviereOriginal({ env: ENV, deps: expired.deps })).erlaubt, false);
      A.equal(expired.calls.at(-1).grenzeTag, 16); return { ok: false };
    });
  });
  await test("Vorstands und Einmalbuchung haltenVorbereitungsfrist und UTCWechsel strikt ein", async () => {
    for (const phase of ["read", "key"]) for (const delay of [60000, 86400000]) {
      const w = welt(), request = w.deps.request, reserve = w.deps.reserviere;
      if (phase === "read") w.deps.request = async p => { const r = await request(p); w.advance(delay); return r; };
      else w.deps.reserviere = async o => { const r = await reserve(o); if (o.schluessel === neuKey) w.advance(delay); return r; };
      A.equal((await w.run()).grund, "arbeitsfenster-vorbereitung-zu-lang"); A.equal(w.works.length, 0);
      A.equal(w.stand(neuKey, day), phase === "key" ? 1 : 0);
      A.equal(w.stand(F.SCHLUESSEL.fenster, day), 9); A.equal(w.stand(F.SCHLUESSEL.sekunden, day), 2700);
    }
  });
  A.equal(count, 8); A.deepEqual(verboten, []);
  console.log("8/8 neue Echtlauf-Einmalgruppen bestanden; keine alten Tests, Modelle, Produktion oder Netz.");
})().catch(e => { console.error(e); process.exitCode = 1; });
