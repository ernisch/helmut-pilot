"use strict";

const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const { pruefeAkteurslistenQuellenbindung: pruefe } = require("../lib/helmut/akteurslisten-quellenbindung");
const FELDER = ["ausschuesse", "mentioned_committees"];
const NAME = "Ausschuss für Mobilität";
const vorgangId = "vg-test-ausschuesse";
const ANALYSE = {
  headline: "Busangebot wird diskutiert", display_title: "Busangebot wird diskutiert",
  was_ist_passiert: "Ein Bericht beschreibt eine Diskussion zum Busangebot.",
  display_summary: "Ein Bericht beschreibt eine Diskussion zum Busangebot.",
  warum_wichtig: "Busverkehr", wer_ist_betroffen: "Reisende", parteien: [], ausschuesse: [],
  ministerien: [], risiken: [], chancen: [], zeitdruck: "keiner",
  handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.", confidence_score: 70
};
function fixture(text = "Ein Bericht beschreibt eine Diskussion zum Busangebot.") {
  return { documents: [{ id: "rd-bus", title: "Busangebot wird diskutiert", summary: text,
    url: "https://example.org/busangebot", source_name: "Testmedium", published_at: "2026-09-14T16:00:00Z" }] };
}
function stand(antwort, waehrendAufruf = () => {}) {
  const p = { aufrufe: 0, gespeichert: [], failed: 0, unbekannt: 0, frei: 0, updates: 0 };
  const vertrag = {
    reserviere: async () => ({ erlaubt: true, fencing: 1 }),
    modellstart: async () => ({ erlaubt: true }), schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { p.gespeichert.push(ko); return { gespeichert: true, pruefbar: true }; },
    ausgangUnbekannt: async () => { p.unbekannt++; },
    freigabe: async () => { p.frei++; }, freigabeOhneAufruf: async () => { p.frei++; },
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => { p.updates++; }, vormerkungLoese: async () => {}
  };
  const deps = {
    canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async prompt => { p.aufrufe++; p.prompt = prompt; waehrendAufruf(); return structuredClone(antwort); },
    save: async ko => { p.gespeichert.push(ko); return true; }, saveSources: async () => {},
    markFailed: async () => { p.failed++; }, logSkip: () => {}, modelName: () => "attrappe",
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => []
  };
  return { p, vertrag, deps };
}
async function run(modus, c, s, extra = {}) {
  if (modus === "erst") return U.understandOneCluster(c, s.deps, { vorgangId, existing: null, vertrag: s.vertrag, ...extra });
  const existing = { id: "ko-" + vorgangId, ko_version: 4, headline: "Erhaltener Bestand", ausschuesse: ["Bisheriger Ausschuss"] };
  const vorher = structuredClone(existing);
  const r = await U.understandUpdate(c, s.deps, { vorgangId, existing, neueDocs: c.documents,
    neueAnker: [], spur: {}, alleDocs: c.documents, vertrag: s.vertrag, ...extra });
  assert.deepEqual(existing, vorher, "Bisherige Inhalte duerfen nicht mutiert werden");
  return r;
}
function verworfen(r, s, feld) {
  assert.equal(r.status, "skipped-invalid");
  assert(r.errors.includes(`quellenbeleg-${feld}`), JSON.stringify(r.errors));
  assert.equal(s.p.aufrufe, 1); assert.equal(s.p.gespeichert.length, 0);
  assert.equal(s.p.unbekannt, 1); assert.equal(s.p.frei, 0);
}
async function auswertung(c, antwort) {
  return U.evaluateUnderstandingCase({ name: "neutraler-ausschussbeleg", raw_documents: c.documents },
    async () => structuredClone(antwort));
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Unbelegter Beteiligungsausschuss sperrt die Liste vor Speicherung in Erstverstehen und Update", async () => {
    for (const modus of ["erst", "update"]) {
      const s = stand({ ...ANALYSE, ausschuesse: [NAME] });
      verworfen(await run(modus, fixture(), s), s, "ausschuesse");
      assert.equal(s.p.failed, modus === "erst" ? 1 : 0);
      assert.equal(s.p.updates, modus === "update" ? 1 : 0);
    }
  });
  await test("Unbelegter Erwaehnungsausschuss sperrt die Antwort nicht mehr (deterministische Reduktion)", async () => {
    // Erwaehnungslisten sind reine Nennungen (Production-Befund 2026-09-24): ein unbelegter
    // Wert entfaellt, die uebrige Antwort bleibt; die Beteiligungsliste `ausschuesse` bleibt streng.
    for (const modus of ["erst", "update"]) {
      const s = stand({ ...ANALYSE, mentioned_committees: [NAME] });
      const r = await run(modus, fixture(), s);
      assert.equal(r.status, modus === "erst" ? "saved" : "updated", JSON.stringify(r));
      assert.deepEqual(s.p.gespeichert[0].mentioned_committees, []);
      assert.equal(s.p.aufrufe, 1); assert.equal(s.p.unbekannt, 0);
    }
  });
  await test("Gelieferte Bezeichnungen aus Titel und Auszug bleiben in beiden Pfaden erhalten", async () => {
    for (const name of [NAME, "Verkehrsausschuss"]) for (const quelle of ["title", "summary"]) for (const modus of ["erst", "update"]) {
      const c = fixture(); c.documents[0][quelle] = `${name} diskutiert das Busangebot.`;
      const s = stand({ ...ANALYSE, ausschuesse: [name], mentioned_committees: [name] });
      assert.equal((await run(modus, c, s)).status, modus === "erst" ? "saved" : "updated");
      assert.equal(s.p.aufrufe, 1); assert.equal(s.p.gespeichert.length, 1);
      for (const feld of FELDER) assert.deepEqual(s.p.gespeichert[0][feld], [name]);
    }
  });
  await test("Leere Listen bleiben gueltig; unbelegter Zusatz verwirft die gesamte Antwort im Auswerter", async () => {
    assert.equal((await auswertung(fixture(), ANALYSE)).valid, true);
    for (const feld of FELDER) {
      const r = await auswertung(fixture(`${NAME} diskutiert das Busangebot.`),
        { ...ANALYSE, [feld]: [NAME, "Ausschuss für Kultur"] });
      assert.equal(r.valid, false); assert(r.errors.includes(`quellenbeleg-${feld}`));
    }
  });
  await test("Metadaten, Rohfelder, Prompt und Antwortprosa ersetzen keinen Quellbeleg", async () => {
    const c = fixture(); Object.assign(c.documents[0], { source_name: NAME, url: "https://example.org/ausschuss",
      ausschuesse: [NAME], full_text: `${NAME} berichtet.`, artikelkontext: { text: `${NAME} berichtet.` } });
    for (const feld of FELDER) assert.equal((await auswertung(c,
      { ...ANALYSE, [feld]: [NAME], was_ist_passiert: `${NAME} diskutiert das Busangebot.` })).valid, false);
    for (const feld of FELDER) assert.equal(pruefe({ [feld]: ["Bundestagsausschuss"] }, U.buildUnderstandingPrompt(fixture())).valid, false);
  });
  await test("Rohe Werte statt bereinigter Listen pruefen; Unicode erhalten, keine Aliase oder Teilwoerter", () => {
    for (const feld of FELDER) {
      for (const wert of [[17], NAME, ["Mobilitätsausschuss"], [".*"]]) {
        assert.equal(pruefe({ [feld]: wert }, U.buildUnderstandingPrompt(fixture(`${NAME} berichtet.`))).valid, false);
      }
      assert.equal(pruefe({ [feld]: [NAME] }, U.buildUnderstandingPrompt(fixture(`${NAME}sforschung berichtet.`))).valid, false);
      const c = fixture("Mobilität berichtet."); c.documents[0].title = "Ausschuss für";
      assert.equal(pruefe({ [feld]: [NAME] }, U.buildUnderstandingPrompt(c)).valid, false);
      assert.equal(pruefe({ [feld]: [NAME] }, U.buildUnderstandingPrompt(fixture("AUSSCHUSS FU\u0308R\n MOBILITA\u0308T berichtet."))).valid, true);
    }
  });
  await test("Nicht ausgewaehlte Quellen begruenden keinen Ausschuss", () => {
    const c = fixture(); c.documents = Array.from({ length: 14 }, (_, i) => ({ ...c.documents[0],
      id: `rd-${i}`, summary: `Ausschuss Test${i} diskutiert das Busangebot.` }));
    const prompt = U.buildUnderstandingPrompt(c);
    const selected = prompt.split("\n").filter(l => l.startsWith('{"quelle_id":')).map(l => JSON.parse(l).quelle_id);
    assert.equal(selected.length, 12);
    const omitted = c.documents.findIndex(d => !selected.includes(d.id)); assert(omitted >= 0);
    for (const feld of FELDER) assert.equal(pruefe({ [feld]: [`Ausschuss Test${omitted}`] }, prompt).valid, false);
  });
  await test("Nachtraeglich ergaenzte Quelle liefert keinen rueckwirkenden Beleg", async () => {
    for (const modus of ["erst", "update"]) {
      const c = fixture(), s = stand({ ...ANALYSE, ausschuesse: [NAME] },
        () => { c.documents[0].summary = `${NAME} diskutiert das Busangebot.`; });
      verworfen(await run(modus, c, s), s, "ausschuesse");
    }
  });
  await test("Explizit gebundener Artikelabsatz belegt die gelieferte Bezeichnung", async () => {
    for (const modus of ["erst", "update"]) {
      const c = fixture(), doc = c.documents[0], s = stand({ ...ANALYSE, ausschuesse: [NAME], mentioned_committees: [NAME] });
      const beleg = { version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
        artikelUrl: doc.url, artikelTitel: doc.title, herkunft: "manueller-originalvergleich",
        gelesenAm: "2026-09-18T17:00:00Z", absatzPosition: 2, text: `${NAME} diskutiert das Busangebot.` };
      assert.equal((await run(modus, c, s, { artikelkontextVersuch: beleg })).status, modus === "erst" ? "saved" : "updated");
      for (const feld of FELDER) assert.deepEqual(s.p.gespeichert[0][feld], [NAME]);
    }
  });
  await test("Auch ohne CAS wird eine unbelegte Beteiligungsliste nicht gespeichert", async () => {
    const s = stand({ ...ANALYSE, ausschuesse: [NAME] });
    const r = await run("erst", fixture(), s, { vertrag: null });
    assert.equal(r.status, "skipped-invalid"); assert(r.errors.includes("quellenbeleg-ausschuesse"));
    assert.equal(s.p.failed, 1); assert.equal(s.p.aufrufe, 1); assert.equal(s.p.gespeichert.length, 0);
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
