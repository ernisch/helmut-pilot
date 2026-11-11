"use strict";
const assert = require("node:assert/strict");
const { pruefe } = require("../lib/helmut/quellen-automatik");
const fenster = require("../lib/helmut/quellen-arbeitsfenster");
const ENV = { HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SCALABLE_PIPELINE: "on", HELMUT_SOURCE_MODE: "off",
  HELMUT_JOB_DISPATCH_MODE: "off", HELMUT_KLASSEN_GRENZEN: "on",
  HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16" };
let pass = 0;
async function check(name, fn) { await fn(); console.log("PASS " + name); pass++; }
function welt() {
  let zeit = Date.parse("2026-11-11T03:00:00Z");
  const w = { laeufe: [], verbraucht: 0, plan: null, alt: [], offen: [], faellig: [], fehlgeschlagen: [], reads: [], reservierungen: 0, arbeit: 0, frei: 0 };
  w.now = () => zeit; w.weiter = ms => zeit += ms;
  w.run = (status, reason = null) => ({ runId: "synthetischer-lauf-" + zeit, process: "warteschlange-crawl", status, reason,
    startedAt: new Date(zeit - 10000).toISOString(), finishedAt: status === "running" ? null : new Date(zeit - 1000).toISOString() });
  w.deps = {
    leseLaeufe: async o => w.laeufe.filter(r => r.process === o.process),
    journal: { lesen: async () => w.plan, offene: async () => ({ plaene: w.alt, weitereVorhanden: false }) },
    request: async (url, options) => {
      assert.equal(options, undefined, "Entscheidung darf ausschliesslich lesen"); w.reads.push(url);
      if (url.startsWith("/rest/v1/helmut_anbieter_fenster?")) return w.konten || (w.verbraucht ? [
        { schluessel: "quellenarbeit|fenster", verbraucht: w.verbraucht },
        ...Array.from({ length: Math.max(0, w.verbraucht) }, (_, i) => ({ schluessel: `quellenarbeit|slot|${i}`, verbraucht: 1 }))] : []);
      assert.ok(url.startsWith("/rest/v1/helmut_jobs?")); assert.match(url, /limit=1/);
      if (url.includes("status=eq.fehlgeschlagen")) return w.fehlgeschlagen;
      return url.includes("&or=") ? w.faellig : w.offen;
    }
  };
  w.pruefe = () => pruefe({ env: ENV, now: w.now, deps: w.deps });
  w.gate = (arbeit, adminAuftrag = null) => fenster.fuehreAus({ env: ENV, adminAuftrag, arbeit: async () => { w.arbeit++; return arbeit(); },
    deps: { now: w.now, bereitschaft: async () => ({ bereit: true }), automatik: w.pruefe,
      reserviere: async () => { w.reservierungen++; return { verfuegbar: true, erlaubt: true }; },
      klassen: { belege: async () => ({ erlaubt: true, slot: "synthetic-slot" }), gebeFrei: async () => { w.frei++; } } } });
  w.fertig = () => { w.plan = { zustand: "fertig", cursor: 1, auftraege: [{}] }; w.verbraucht = 1; w.laeufe = [w.run("success")]; };
  return w;
}
async function main() {
  await check("Default aus liest nichts und schafft keine Freigabe", async () => {
    assert.equal((await pruefe({ env: {}, deps: { request: () => assert.fail("kein IO") } })).grund, "automatik-aus");
  });
  await check("erster Start ohne Tagesplan/Reservierung ist erlaubt", async () => {
    const w = welt(); assert.equal((await w.pruefe()).grund, "automatik-erster-start");
  });
  await check("ein erfolgreicher Lauf ohne Rest verbraucht bei sieben Folgeterminen kein weiteres Fenster", async () => {
    const w = welt();
    assert.equal((await w.gate(async () => { w.fertig(); return { ok: true }; })).ok, true);
    for (let i = 0; i < 7; i++) {
      w.weiter(15 * 60000); assert.equal((await w.gate(() => assert.fail("keine leere Wiederholung"))).grund, "automatik-erledigt");
    }
    assert.equal(w.arbeit, 1); assert.equal(w.reservierungen, 3); assert.equal(w.frei, 7);
  });
  await check("Startfehler stoppt die restlichen sieben Termine vor jeder weiteren Reservierung", async () => {
    const w = welt();
    await w.gate(async () => { w.verbraucht = 1; w.laeufe = [w.run("failed", "planung-einreihung-nicht-bestaetigt")]; return { ok: false }; });
    for (let i = 0; i < 7; i++) {
      w.weiter(15 * 60000); assert.equal((await w.gate(() => assert.fail("kein Fehler-Retry"))).grund, "automatik-startfehler");
    }
    assert.equal(w.reservierungen, 3); assert.equal(w.arbeit, 1);
  });
  await check("echte Planreste und faellige Queueauftraege erlauben Fortsetzung", async () => {
    const w = welt(); w.fertig(); w.alt = [{ zustand: "offen" }];
    assert.equal((await w.pruefe()).grund, "automatik-restarbeit");
    w.alt = []; w.offen = w.faellig = [{ id: "synthetischer-auftrag", attempts: 0, max_attempts: 3 }];
    assert.equal((await w.pruefe()).grund, "automatik-restarbeit");
    assert.match(decodeURIComponent(w.reads.at(-1)), /status.eq.laeuft,lease_expires_at.lt./);
  });
  await check("noch nicht faellige und aktive geleaste Auftraege verbrauchen kein Leerfenster", async () => {
    const w = welt(); w.fertig(); w.offen = [{ id: "wartet" }];
    assert.equal((await w.gate(() => assert.fail("keine faellige Arbeit"))).grund, "automatik-wartet");
    assert.equal(w.reservierungen, 0);
  });
  await check("regulaeres Planungszeitlimit ist fortsetzbar, harter oder unbekannter Ausgang stoppt", async () => {
    for (const status of ["failed", "partial", "timeout", "running", "unknown"]) {
      const w = welt(); w.fertig(); w.alt = [{}]; w.laeufe = [w.run(status)];
      assert.equal((await w.pruefe()).erlaubt, false);
    }
    const w = welt(); w.fertig(); w.alt = [{}]; w.laeufe = [{ ...w.run("partial", "planung-zeitbudget-fortsetzbar"), fehlerklasse: "planung-zeitbudget" }];
    assert.equal((await w.pruefe()).erlaubt, true);
  });
  await check("verlorene Start-/Endquittung und Teilreserve bleiben gesperrt und werden nicht erstattet", async () => {
    const w = welt(); w.verbraucht = 1;
    assert.equal((await w.pruefe()).grund, "automatik-unbekannt");
    w.laeufe = [w.run("success")]; w.laeufe[0].finishedAt = null;
    assert.equal((await w.pruefe()).grund, "automatik-unbekannt");
    assert.equal(w.verbraucht, 1); assert.equal(w.reservierungen, 0);
  });
  await check("Tagwechsel liest neu; alte Fehler sind keine dauerhafte Sperre", async () => {
    const w = welt(); w.laeufe = [w.run("failed")]; w.weiter(86400000);
    assert.equal((await w.pruefe()).grund, "automatik-erster-start");
    assert.match(decodeURIComponent(w.reads[0]), /2026-11-12T00:00:00Z/);
  });
  await check("bestaetigter manueller Erfolg nach Fehler erlaubt bei Rest wieder Automatik", async () => {
    const w = welt(); w.fertig(); const failed = w.run("failed"); w.weiter(1000);
    w.laeufe = [failed, w.run("success")]; w.verbraucht = 2; w.offen = w.faellig = [{ id: "rest", attempts: 0, max_attempts: 3 }];
    assert.equal((await w.pruefe()).grund, "automatik-restarbeit");
  });
  await check("manueller Einstieg behaelt seine eigenen Gates, ohne automatische Fehlersperre zu umgehen", async () => {
    const w = welt(); w.verbraucht = 1; w.laeufe = [w.run("failed")];
    assert.equal((await w.gate(() => ({ ok: true }), { tag: "2026-11-11", auftragId: "00000000-0000-4000-8000-000000000001" })).ok, true);
    assert.equal(w.reads.length, 0); assert.equal(w.reservierungen, 3);
  });
  await check("Leseausfall, ungueltige Antworten und Widerspruch ergeben keine Arbeit oder Entwarnung", async () => {
    for (const part of ["laeufe", "konten", "plan", "alt", "queue", "widerspruch"]) {
      const w = welt(); w.fertig();
      if (part === "laeufe") w.deps.leseLaeufe = async () => null;
      if (part === "konten") w.verbraucht = -1;
      if (part === "plan") w.plan.cursor = 0;
      if (part === "alt") w.deps.journal.offene = async () => null;
      if (part === "queue") w.offen = null;
      if (part === "widerspruch") w.faellig = [{ id: "unbelegt", attempts: 0, max_attempts: 3 }];
      assert.equal((await w.pruefe()).grund, "automatik-unbekannt", part);
    }
    const w = welt(); w.deps.request = async () => { throw Error("Leseausfall"); };
    assert.equal((await w.pruefe()).grund, "automatik-unbekannt");
  });
  await check("Slot-Teilreservierung und manuelle Slotmarker ohne Laufbeleg sind UNKNOWN", async () => {
    for (const suffix of ["03:00", "admin|2026-11-11|nonce"]) {
      const w = welt(); w.konten = [{ schluessel: "quellenarbeit|slot|" + suffix, verbraucht: 1 }];
      assert.equal((await w.pruefe()).grund, "automatik-unbekannt");
    }
  });
  await check("Claimfaehigkeit: ausgeschaltete Abruftypen und erschoepfte Versuche starten keine Arbeit", async () => {
    const w = welt(); w.fertig(); w.offen = [{ id: "wartet" }];
    w.faellig = [{ id: "erschoepft", attempts: 3, max_attempts: 3 }];
    assert.equal((await w.pruefe()).grund, "automatik-wartet");
    const query = w.reads.find(q => q.includes("&or="));
    assert.match(query, /job_type=in\.\(document_understanding/); assert.ok(!query.includes("source_fetch"));
    w.faellig = Array.from({ length: 101 }, (_, i) => ({ id: `x${i}`, attempts: 3, max_attempts: 3 }));
    assert.equal((await w.pruefe()).grund, "automatik-unbekannt");
  });
  await check("heutige terminale Fehler bleiben nach leerem Adminerfolg sichtbar statt falschem Erledigt", async () => {
    const w = welt(); w.fertig(); w.fehlgeschlagen = [{ id: "heutiger-fehler" }];
    assert.equal((await w.pruefe()).grund, "automatik-startfehler");
    const query = w.reads.find(r => r.includes("status=eq.fehlgeschlagen"));
    assert.match(decodeURIComponent(query), /finished_at=gte.2026-11-11T00:00:00Z/);
  });
  console.log(`PASS ${pass}/${pass} Quellenautomatik; nur lokale Ersatzantworten`);
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
