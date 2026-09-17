"use strict";

// Echte Fachfunktionen, isolierte Modell- und Speicherattrappen. Kein Netz/DB/LLM.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const V = require("../lib/helmut/verstehen-vertrag");
const D = require("../lib/helmut/dedup");
const vorgangId = "vg-test-konferenz";
const ANALYSE = {
  headline: "Konferenz", was_ist_passiert: "Synthetischer Testinhalt", warum_wichtig: "Test", wer_ist_betroffen: "Test",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "Test", confidence_score: 70,
  display_title: "Konferenz zur Verkehrspolitik in Neustadt", display_summary: "Synthetischer Testinhalt",
  why_relevant: "Test", recommendation: "Test", display_category: "Verkehr"
};
function fixture() {
  const doc = D.toRawDocumentRow({ title: ANALYSE.display_title,
    summary: "Die Konferenz sollte einen Austausch ueber neue Bahnstrecken ermoeglichen.",
    url: "https://example.org/politik/konferenz", sourceName: "Testmedium",
    publishedAt: "2026-09-14T16:00:00Z" });
  return { cluster: { documents: [doc] }, beleg: {
    version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: doc.url, artikelTitel: doc.title, herkunft: "manueller-originalvergleich",
    gelesenAm: "2026-09-17T12:30:00Z", absatzPosition: 2,
    text: "Die Konferenz endete am Montag mit einer gemeinsamen Erklaerung."
  } };
}
function pruefstand(overrides = {}) {
  const p = { schritte: [], hashes: [], prompts: [], kos: [], unbekannt: 0 };
  const vertrag = {
    reserviere: async ({ eingabeHash }) => { p.schritte.push("reservieren"); p.hashes.push(eingabeHash); return { erlaubt: true, fencing: 1 }; },
    modellstart: async () => { p.schritte.push("modellstart"); return { erlaubt: true }; },
    schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { p.schritte.push("speichern"); p.kos.push(ko); return { gespeichert: true, pruefbar: true }; },
    freigabe: async () => { p.schritte.push("freigabe"); },
    freigabeOhneAufruf: async () => { p.schritte.push("freigabe-ohne-aufruf"); },
    ausgangUnbekannt: async () => { p.unbekannt++; },
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {}
  };
  const deps = {
    canSpend: async () => { p.schritte.push("budget"); return { allowed: true }; },
    requestUnderstanding: async prompt => { p.schritte.push("modellattrappe"); p.prompts.push(prompt); return { ...ANALYSE }; },
    save: async () => { throw new Error("Unbedingter Speicherweg unerlaubt"); },
    saveSources: async () => {}, markFailed: async () => {}, modelName: () => "isolierte-attrappe", logSkip: () => {},
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => [], ...overrides
  };
  return { p, vertrag, deps };
}
function run(f, s, extra = {}) {
  return U.understandOneCluster(f.cluster, s.deps, {
    vorgangId, existing: null, vertrag: s.vertrag, artikelkontextVersuch: f.beleg, ...extra
  });
}
const sources = p => p.split("\n").filter(s => s.startsWith('{"quelle_id":')).map(JSON.parse);
const basisHash = (f, modus = "erst", koVersion = null) => V.eingabeHash({ vorgangId, dokumente: f.cluster.documents, modus, koVersion });
const promptHash = (basis, prompt) => crypto.createHash("sha256")
  .update(JSON.stringify(["artikelkontext-v1", basis, prompt])).digest("hex").slice(0, 40);
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }

async function main() {
  await test("Erstverstehen reicht den geprueften Beleg weiter und reserviert genau diesen Prompt", async () => {
    const f = fixture(), before = structuredClone(f), s = pruefstand();
    const r = await run(f, s);
    assert.equal(r.status, "saved");
    assert.equal(s.p.prompts.length, 1);
    assert.equal(sources(s.p.prompts[0])[0].artikelkontext?.text, f.beleg.text,
      "Der vorbereitete Originalkontext geht vor dem Verstehensaufruf verloren");
    assert.equal(s.p.hashes[0], promptHash(basisHash(f), s.p.prompts[0]));
    assert.deepEqual(s.p.schritte, ["reservieren", "budget", "modellstart", "modellattrappe", "speichern"]);
    assert.deepEqual(f, before);
    assert(!JSON.stringify(s.p.kos).includes("artikelkontext"), "Kein Text wird in fremde KO Felder geschmuggelt");
  });

  await test("Ohne Zusatz bleiben normaler Prompt und bisherige Reservierungskennung identisch", async () => {
    const f = fixture(), s = pruefstand();
    await run(f, s, { artikelkontextVersuch: undefined });
    assert.equal(s.p.prompts[0], U.buildUnderstandingPrompt(f.cluster));
    assert.equal(s.p.hashes[0], basisHash(f));
    const inherited = Object.assign(Object.create({ artikelkontextVersuch: f.beleg }),
      { vorgangId, existing: null, vertrag: s.vertrag });
    await U.understandOneCluster(f.cluster, s.deps, inherited);
    assert.equal(s.p.prompts[1], s.p.prompts[0]);
    assert.equal(s.p.hashes[1], s.p.hashes[0]);
  });

  await test("Anderer Zusatz und kein Zusatz werden bei gleicher Dokumentmenge unterschieden", async () => {
    const f = fixture(), s = pruefstand();
    await run(f, s);
    await run(f, s);
    f.beleg.text = "Der Termin soll erst am Dienstag stattfinden; die Angabe ist widerspruechlich.";
    await run(f, s);
    await run(f, s, { artikelkontextVersuch: undefined });
    assert.equal(s.p.hashes[0], s.p.hashes[1]);
    assert.notEqual(s.p.hashes[0], s.p.hashes[2]);
    assert.notEqual(s.p.hashes[0], s.p.hashes[3]);
    assert.equal(sources(s.p.prompts[2])[0].artikelkontext.text, f.beleg.text);
  });

  await test("Nach der Reservierung veraenderte Objekte veraendern den vorbereiteten Prompt nicht", async () => {
    const f = fixture(), s = pruefstand();
    const originalUrl = f.cluster.documents[0].url;
    const expected = U.buildUnderstandingPrompt(f.cluster, { artikelkontextVersuch: f.beleg });
    const reserve = s.vertrag.reserviere;
    s.vertrag.reserviere = async args => {
      const r = await reserve(args);
      f.beleg.text = "Nachtraeglicher Fremdtext.";
      f.cluster.documents[0].summary = "Nachtraeglich veraenderte Quelle.";
      f.cluster.documents[0].url = "https://example.org/fremder-artikel";
      return r;
    };
    await run(f, s);
    assert.equal(s.p.prompts[0], expected);
    assert.equal(s.p.hashes[0], promptHash(basisHash(f), expected));
    assert.equal(s.p.kos[0].best_source_url, originalUrl,
      "Auch der Quellenzeiger des Ergebnisses muss zur reservierten Eingabe gehoeren");
  });

  await test("Ungueltiger Zusatz oder fehlender CAS Vertrag endet vor Reservierung und Budget", async () => {
    for (const value of [null, { ...fixture().beleg, text: "x".repeat(601) },
      { ...fixture().beleg, dokumentId: "rd-fremd" }, { ...fixture().beleg, quellenHash: "0".repeat(64) }]) {
      const f = fixture(), s = pruefstand();
      await assert.rejects(run(f, s, { artikelkontextVersuch: value }), /artikelkontext-/);
      assert.deepEqual(s.p.schritte, []);
    }
    const f = fixture(), s = pruefstand();
    await assert.rejects(run(f, s, { vertrag: null }), /artikelkontext-cas-erforderlich/);
    assert.deepEqual(s.p.schritte, []);
  });

  await test("Direkte Aktualisierung bindet Beleg an alle Quelldokumente und die naechste Version", async () => {
    const f = fixture(), s = pruefstand();
    const originalUrl = f.cluster.documents[0].url;
    const reserve = s.vertrag.reserviere;
    s.vertrag.reserviere = async args => {
      const r = await reserve(args);
      f.cluster.documents[0].url = "https://example.org/fremde-fortsetzung";
      f.beleg.text = "Nach der Reservierung veraendert.";
      return r;
    };
    const originalText = f.beleg.text;
    const ctx = { vorgangId, existing: { id: "ko-" + vorgangId, ko_version: 4 },
      neueDocs: [], neueAnker: [], spur: {}, alleDocs: f.cluster.documents,
      vertrag: s.vertrag, artikelkontextVersuch: f.beleg };
    const r = await U.understandUpdate(f.cluster, s.deps, ctx);
    assert.equal(r.status, "updated"); assert.equal(r.koVersion, 5);
    assert.equal(sources(s.p.prompts[0])[0].artikelkontext.text, originalText);
    assert.equal(s.p.hashes[0], promptHash(basisHash(f, "update", 5), s.p.prompts[0]));
    assert.equal(s.p.kos[0].best_source_url, originalUrl);
  });

  await test("Weiterleitung in ausdruecklich freigegebene Aktualisierung erhaelt den Zusatz", async () => {
    const f = fixture(), s = pruefstand({ listVorgangDocuments: async () => f.cluster.documents });
    const r = await run(f, s, { existing: { id: "ko-" + vorgangId, status: "active", ko_version: 1 }, wiederaufnahmeFreigabe: true });
    assert.equal(r.status, "updated");
    assert.equal(sources(s.p.prompts[0])[0].artikelkontext.text, f.beleg.text);
  });

  await test("Neue Dokumente und vorgemerkte Aktualisierungen erhalten denselben expliziten Vertrag", async () => {
    for (const mode of ["neu", "vorgemerkt"]) {
      const f = fixture();
      const old = { ...f.cluster.documents[0], id: "rd-bestand", title: "Konferenz beginnt in Neustadt",
        summary: "Die Teilnehmenden treffen ein.", url: "https://example.org/politik/beginn",
        canonical_url: "https://example.org/politik/beginn" };
      const s = pruefstand({ listVorgangDocuments: async () => mode === "neu" ? [old] : f.cluster.documents });
      if (mode === "vorgemerkt") s.vertrag.vormerkungLese = async () => ({ verfuegbar: true, vorhanden: true, fehlversuche: 0 });
      const r = await run(f, s, { existing: { id: "ko-" + vorgangId, status: "active", ko_version: 1 } });
      assert.equal(r.status, "updated", mode);
      const q = sources(s.p.prompts[0]).find(q => q.artikelkontext);
      assert.equal(q.artikelkontext.text, f.beleg.text);
      assert.equal(q.artikelkontext.dokumentId, f.beleg.dokumentId);
      if (mode === "neu") assert.equal(sources(s.p.prompts[0]).length, 2);
    }
  });

  await test("Ein Zusatz erzwingt weder Neuverstehen eines Duplikats noch ein Aufheben des Endzustands", async () => {
    for (const existing of [{ id: "ko-" + vorgangId, status: "active", ko_version: 1 },
      { id: "ko-" + vorgangId, status: "pending", understanding_status: "failed-final" }]) {
      const f = fixture(), s = pruefstand({ listVorgangDocuments: async () => f.cluster.documents });
      const r = await run(f, s, { existing });
      assert(["duplicate", "skipped-terminal"].includes(r.status));
      assert.deepEqual(s.p.schritte, []);
    }
  });

  await test("Reservierungsabsage, unbekannter Ausgang, Budget und Deadline bleiben wirksam", async () => {
    for (const grund of ["belegt", "ausgang-unbekannt", "bereits-fertig"]) {
      const f = fixture(), s = pruefstand();
      s.vertrag.reserviere = async () => ({ erlaubt: false, grund });
      await run(f, s);
      assert.deepEqual(s.p.schritte, []);
    }
    const f = fixture(), s = pruefstand({ canSpend: async () => ({ allowed: false, reason: "budget" }) });
    assert.equal((await run(f, s)).status, "skipped-budget");
    assert.equal(s.p.prompts.length, 0); assert(s.p.schritte.includes("freigabe"));
    const t = pruefstand();
    assert.equal((await run(f, t, { deadlineMs: Date.now() - 1 })).status, "skipped-zeitbudget");
    assert.deepEqual(t.p.schritte, []);
  });
  console.log(`${pass}/${pass} Pruefgruppen erfolgreich; ausschliesslich isolierte Attrappen.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
