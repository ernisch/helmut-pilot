"use strict";
const A = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const P = require("../lib/helmut/prosa-einordnung");
const AI = require("../lib/helmut/prosa-einordnung-ai");
const F = require("./fixtures/prosa-einordnung");
const { hash } = require("../lib/helmut/briefing-speicher");
const quittung = x => ({ gespeichert: true, runId: x.runId, phase: x.phase, mandat: x.mandat,
  basisHash: x.basisHash, antwortHash: hash(x.antwort) });
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const setup = (bereich = "briefing", klasse = 0) => {
  const b = F.basis(klasse), p = P.binde({ ...b, bereich }), e = F.entwurf(klasse);
  return { b, p, e, u: F.urteil(p.vorbereite(e)) };
};
(async () => {
  // 36 redaktionelle Vertragsfaelle, NICHT 36 echte Produkt-/Modellabnahmen.
  for (const bereich of ["briefing", "lage"]) for (let i = 0; i < F.faelle.length; i++) {
    const c = F.faelle[i];
    await test(`${bereich} ${c.klasse}: positive Tatsache und Option bleiben erhalten`, () => {
      const { p, e, u } = setup(bereich, i), out = p.formuliere(e, u);
      A.equal(out.bloecke[0].tatsachen.saetze[0].text, c.tatsache);
      A.equal(out.bloecke[0].einordnung.felder.find(f => f.art === "option").text, c.option);
      A.equal(out.bloecke[0].einordnung.label, P.LABEL);
      A.equal(p.pruefe(e, u, out).gebunden, true);
      A.equal(out.pruefung.vollstaendigeFaktenpruefung, false);
      A.equal(out.pruefung.produktabnahme, false);
    });
    await test(`${bereich} ${c.klasse}: falsche Einordnung bleibt trotz Label abgelehnt`, () => {
      const { p, e } = setup(bereich, i); e.bloecke[0].einordnung.option = c.falsch;
      const u = F.urteil(p.vorbereite(e));
      const r = u.pruefungen.find(r => r.block === 0 && r.feld === "option");
      Object.assign(r, { status: "widersprochen", keineNeueTatsache: false, begruendung: c.grund });
      A.throws(() => p.formuliere(e, u), /pruefung-abgelehnt/);
    });
    await test(`${bereich} ${c.klasse}: unbekannt ist keine positive Pruefung`, () => {
      const { p, e, u } = setup(bereich, i);
      u.pruefungen[0].status = "unklar";
      A.throws(() => p.formuliere(e, u), /pruefung-abgelehnt/);
      A.throws(() => p.formuliere(e, null), /pruefung-abweichend/);
    });
  }
  await test("Generator kann keine Fakten, Freigaben oder Zusatzfelder einschleusen", () => {
    const { p, e } = setup();
    for (const key of ["text", "tatsachen", "trustedFreigaben", "pruefung"]) {
      const x = structuredClone(e); x.bloecke[0][key] = "Neue Tatsache";
      A.throws(() => p.vorbereite(x), /faktauswahl/);
    }
    const x = structuredClone(e); x.bloecke[0].einordnung.ungeprueft = "Neue Behauptung";
    A.throws(() => p.vorbereite(x), /einordnungsfelder/);
    const y = structuredClone(e); y.bloecke[0].faktIds = ["fremd"];
    A.throws(() => p.vorbereite(y), /fakt-unbekannt/);
  });
  await test("Quelle oder Fakt geaendert: altes Quellenurteil bleibt unbrauchbar", () => {
    for (const aendere of [b => { b.basis.fakten[0].formulierungen.ereignis = "Neue Tatsache"; },
      b => { b.basis.quellen[0].auszug += " Die Meldung wurde widerrufen."; }]) {
      const b = F.basis(); aendere(b);
      A.throws(() => P.binde({ ...b, bereich: "briefing" }));
    }
  });
  await test("Kein Austausch von Tag, Profil, Bereich, Entwurf oder Sprecher nach dem Review", () => {
    const { b, e, u } = setup();
    const fremd = F.basis(); fremd.basis.profile.id = "fremdes-mandat";
    fremd.faktenPlan.basisHash = require("../lib/helmut/prosa-faktenplan").binde(fremd.basis).basisHash;
    A.throws(() => P.binde({ ...fremd, bereich: "briefing" }).formuliere(e, u), /pruefung-abweichend/);
    A.throws(() => P.binde({ ...b, bereich: "lage" }).formuliere(e, u), /pruefung-abweichend/);
    e.bloecke[0].einordnung.option = "Du könntest die Aussage der Redaktion aufgreifen.";
    A.throws(() => P.binde({ ...b, bereich: "briefing" }).formuliere(e, u), /pruefung-abweichend/);
  });
  await test("Alle sichtbaren Einordnungsfelder, auch Kommunikation, brauchen ein eigenes Urteil", () => {
    const { p, e } = setup();
    e.bloecke[0].einordnung.kommunikation = "Wir wollen die Wirkung des Zuschusses politisch prüfen.";
    const u = F.urteil(p.vorbereite(e));
    const out = p.formuliere(e, u);
    A(P.textAusgabe(out).includes("Formulierungsvorschlag: Wir wollen"));
    u.pruefungen = u.pruefungen.filter(r => r.feld !== "kommunikation");
    A.throws(() => p.formuliere(e, u), /pruefung-unvollstaendig/);
  });
  await test("Jedes getrennte Sachkriterium bleibt zwingend", () => {
    for (const key of P.URTEILFELDER) {
      const { p, e, u } = setup(); u.pruefungen[0][key] = false;
      A.throws(() => p.formuliere(e, u), /pruefung-abgelehnt/);
    }
    const { p, e, u } = setup(); u.pruefungen[1] = u.pruefungen[0];
    A.throws(() => p.formuliere(e, u), /pruefung-unvollstaendig/);
  });
  await test("Lage verlangt zwei Sachverhalte und alle Paarurteile", () => {
    const { p, e, u } = setup("lage");
    A.throws(() => p.vorbereite({ bloecke: [e.bloecke[0]] }), /entwurf/);
    u.vergleiche = []; A.throws(() => p.formuliere(e, u), /paarpruefung-fehlt/);
    const r = F.urteil(p.vorbereite(e)); r.vergleiche[0].eigenstaendigeSachverhalte = false;
    A.throws(() => p.formuliere(e, r), /sachverhalt-wiederholt/);
    e.bloecke[1].faktIds = ["f-0"]; A.throws(() => p.vorbereite(e), /fakt-unbekannt/);
  });
  await test("Fremder Mandatsbezug und technische Platzhalter sind gesperrt", () => {
    const { p, e } = setup(); e.bloecke[0].mandatsbezug.wert = "Haushaltsausschuss";
    A.throws(() => p.vorbereite(e), /mandatsbezug/);
    e.bloecke[0].mandatsbezug.wert = "Testthema1";
    A.throws(() => p.vorbereite(e), /mandatsbezug/);
  });
  await test("Bekannte neue Zahlen bleiben auch vor einem positiven Review gesperrt", () => {
    const { p, e } = setup(); e.bloecke[0].einordnung.option = "Du könntest die zugesagten 999 Euro anfordern.";
    A.throws(() => p.vorbereite(e), /sachdetail-unbelegt/);
  });
  await test("Keine abgeschnittene Negation, unsichtbaren Richtungszeichen oder Sparse Arrays", () => {
    const { p, e } = setup();
    const x = structuredClone(e); x.bloecke[0].einordnung.option = "x".repeat(601);
    A.throws(() => p.vorbereite(x), /einordnungsfelder/);
    x.bloecke[0].einordnung.option = "Gültig\u202e verborgen";
    A.throws(() => p.vorbereite(x), /einordnungsfelder/);
    A.throws(() => p.vorbereite({ bloecke: new Array(2) }), /entwurf/);
    x.bloecke[0].faktIds = new Array(1); A.throws(() => p.vorbereite(x), /faktauswahl/);
  });
  await test("Speicherung, Ruecklesung und Copy Export erhalten die Trennung exakt", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-einordnung-"));
    try {
      for (const bereich of ["briefing", "lage"]) {
        const { b, p, e, u } = setup(bereich);
        const file = path.join(dir, bereich + ".json");
        fs.writeFileSync(file, JSON.stringify({ b, e, u, out: p.formuliere(e, u) }));
        const saved = JSON.parse(fs.readFileSync(file, "utf8"));
        const neu = P.binde({ ...saved.b, bereich });
        A.equal(neu.pruefe(saved.e, saved.u, saved.out).gebunden, true);
        A.equal(P.textAusgabe(saved.out).split(P.LABEL).length - 1, 2);
        saved.out.bloecke[0].einordnung.label = "Belegte Tatsache";
        const { inhaltHash, ...rest } = saved.out; saved.out.inhaltHash = hash(rest);
        A.equal(neu.pruefe(saved.e, saved.u, saved.out).gebunden, false);
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  await test("Ein falsches positives Sprachurteil bleibt eine ausdrueckliche Methodengrenze", () => {
    const { p, e } = setup(); e.bloecke[0].einordnung.option = F.faelle[0].falsch;
    const u = F.urteil(p.vorbereite(e));
    const out = p.formuliere(e, u);
    A.equal(out.pruefung.vollstaendigeFaktenpruefung, false);
    A.equal(out.pruefung.produktabnahme, false);
    A.equal(out.bloecke[0].tatsachen.saetze[0].text, F.faelle[0].tatsache);
    A.equal(out.bloecke[0].einordnung.felder.find(f => f.art === "option").text, F.faelle[0].falsch);
    // Die Bindung beweist das separate Urteil, nicht dessen Richtigkeit.
  });
  await test("Vorbereiteter Adapter ruft Entwurf und Review getrennt auf und belegt beide vor Weiterverarbeitung", async () => {
    const { b, p, e, u } = setup(); const events = [];
    const ai = { understandingModelName: () => "gpt-5-mini", requestStructuredJson: async (prompt, schema, meta, model, opts) => {
      events.push("call:" + meta.testKostenPhase); A.equal(meta.politicianId, b.basis.profile.id);
      A.equal(meta.budgetExempt, undefined); A.equal(opts.strict, true); A.equal(model, "gpt-5-mini");
      if (meta.testKostenPhase === "pruefung") A(prompt.includes(p.vorbereite(e).eingabeHash));
      return meta.testKostenPhase === "entwurf" ? e : u;
    } };
    const out = await AI.erzeuge({ ...b, bereich: "briefing", runId: "nachlauf500-20260921999",
      beforeCall: async x => { events.push("gate:" + x.phase); },
      onResponse: async x => { events.push("save:" + x.phase); const r = quittung(x); x.antwort.bloecke = []; return r; } }, { ai });
    A.deepEqual(events, ["gate:entwurf", "call:entwurf", "save:entwurf", "gate:pruefung", "call:pruefung", "save:pruefung"]);
    A.equal(p.pruefe(e, u, out.ausgabe).gebunden, true);
  });
  await test("Keine zweite Kostenphase bei fehlendem Beleg, ungueltigem Entwurf oder Stop", async () => {
    for (const mode of ["invalid", "receipt", "unconfirmed", "wrong_hash", "wrong_phase", "gate", "provider"]) {
      const { b, e, u } = setup(); let calls = 0;
      const ai = { understandingModelName: () => "gpt-5-mini", requestStructuredJson: async () => {
        calls++; if (mode === "provider") throw new Error("Providerfehler");
        return mode === "invalid" ? { bloecke: [] } : calls === 1 ? e : u;
      } };
      await A.rejects(AI.erzeuge({ ...b, bereich: "briefing", runId: "nachlauf500-20260921999",
        beforeCall: async x => { if (mode === "gate" && x.phase === "pruefung") throw new Error("Stop"); },
        onResponse: async x => {
          if (mode === "receipt") throw new Error("Nicht gespeichert");
          const r = quittung(x);
          if (mode === "unconfirmed") r.gespeichert = false;
          if (mode === "wrong_hash") r.antwortHash = "fremd";
          if (mode === "wrong_phase") r.phase = "pruefung";
          return r;
        } }, { ai }));
      A.equal(calls, 1);
    }
  });
  await test("Alte Versuchskennung, fehlende Hooks und anderes Modell starten keinen Aufruf", async () => {
    const b = F.basis(); let calls = 0;
    const ai = { understandingModelName: () => "anderes-modell", requestStructuredJson: async () => { calls++; } };
    await A.rejects(AI.erzeuge({ ...b, bereich: "briefing", runId: "quellenrelationen20260920" }, { ai }));
    await A.rejects(AI.erzeuge({ ...b, bereich: "briefing", runId: "nachlauf500-20260921999",
      beforeCall: async () => {}, onResponse: async () => {} }, { ai }), /modell-abweichend/);
    A.equal(calls, 0);
  });
  console.log(`${passed}/${passed} Vertragsgruppen bestanden. Keine Modellqualitaet oder 36er Produktabnahme behauptet.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
