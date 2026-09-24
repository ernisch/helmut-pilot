"use strict";

const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const ANALYSE = {
  headline: "Kommunen diskutieren Busverkehr", was_ist_passiert: "Kommunen diskutieren den Busverkehr.",
  warum_wichtig: "Busverkehr", wer_ist_betroffen: "Reisende", parteien: [], mentioned_parties: [],
  ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "keiner",
  handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.",
  confidence_score: 70, display_title: "Kommunen diskutieren Busverkehr"
};
const FELDER = ["mentioned_people", "mentioned_mps"];
const PERSON = "Mara Sommer"; // synthetisch, kein Personenverzeichnis
const vorgangId = "vg-test-personen";
function fixture(text = "Kommunen diskutieren den Busverkehr.") {
  return { documents: [{ id: "rd-bus", title: "Kommunen diskutieren Busverkehr", summary: text,
    url: "https://example.org/busverkehr", source_name: "Testmedium", published_at: "2026-09-14T16:00:00Z" }] };
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
  const existing = { id: "ko-" + vorgangId, ko_version: 4, headline: "Erhaltener Bestand" };
  const vorher = structuredClone(existing);
  const result = await U.understandUpdate(c, s.deps, { vorgangId, existing, neueDocs: c.documents,
    neueAnker: [], spur: {}, alleDocs: c.documents, vertrag: s.vertrag, ...extra });
  assert.deepEqual(existing, vorher, "Vorhandenes Objekt darf nicht mutiert werden");
  return result;
}
function auswertung(c, antwort) {
  return U.evaluateUnderstandingCase({ name: "neutraler-personenbeleg", raw_documents: c.documents },
    async () => structuredClone(antwort));
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Erfundener Vorname in jeder Personenliste wird entfernt (reduziert) und NICHT gespeichert", async () => {
    // Production-Befund 2026-09-24 (Run 35934515630): die Erwaeehnungslisten sperren die Antwort
    // seit PR #537 nicht mehr — ein unbelegter Wert entfaellt, die uebrige Antwort bleibt.
    for (const feld of FELDER) for (const modus of ["erst", "update"]) {
      const s = stand({ ...ANALYSE, [feld]: [PERSON] });
      const r = await run(modus, fixture("Ratsmitglied Sommer diskutiert Busverkehr."), s);
      assert.equal(r.status, modus === "erst" ? "saved" : "updated", JSON.stringify(r));
      assert.equal(s.p.aufrufe, 1); assert.equal(s.p.unbekannt, 0);
      assert.equal(s.p.failed, 0);
      assert.deepEqual(s.p.gespeichert[0][feld], [], `${feld}: unbelegter Name wird nicht gespeichert`);
    }
  });
  await test("Ausdrueckliche Nennung aus Titel oder Auszug bleibt in beiden Pfaden erhalten", async () => {
    for (const quelle of ["title", "summary"]) for (const modus of ["erst", "update"]) {
      const c = fixture(); c.documents[0][quelle] = `Abgeordnete ${PERSON} fordert mehr Busverkehr.`;
      const s = stand({ ...ANALYSE, mentioned_people: [PERSON], mentioned_mps: [PERSON] });
      assert.equal((await run(modus, c, s)).status, modus === "erst" ? "saved" : "updated");
      for (const feld of FELDER) assert.deepEqual(s.p.gespeichert[0][feld], [PERSON]);
    }
  });
  await test("Leere Listen bleiben gueltig; ein einziger unbelegter Zusatz sperrt die Antwort", async () => {
    assert.equal((await auswertung(fixture(), ANALYSE)).valid, true);
    for (const feld of FELDER) {
      const r = await auswertung(fixture(`${PERSON} fordert mehr Busverkehr.`),
        { ...ANALYSE, [feld]: [PERSON, "Paul Winter"] });
      assert.equal(r.valid, false); assert(r.errors.includes(`quellenbeleg-${feld}`));
    }
  });
  await test("Metadaten, URL, Promptbeispiele und andere Antwortfelder ersetzen keinen Beleg", async () => {
    const c = fixture(); Object.assign(c.documents[0], { source_name: "Mara Sommer", url: "https://example.org/Mara-Sommer",
      mentioned_people: ["Mara Sommer"], full_text: "Mara Sommer fordert mehr Busverkehr.", artikelkontext: { text: "Mara Sommer fordert mehr Busverkehr." } });
    for (const feld of FELDER) assert.equal((await auswertung(c,
      { ...ANALYSE, [feld]: ["Mara Sommer"], was_ist_passiert: "Mara Sommer fordert mehr Busverkehr." })).valid, false);
  });
  await test("Keine Teilworttreffer, Namensableitung oder Verbindung verschiedener Quellfelder", async () => {
    for (const [text, name] of [["Mara Sommerfeld berichtet.", PERSON], ["Sommer berichtet.", PERSON],
      ["M. Sommer berichtet.", PERSON], ["Lena Sommer berichtet.", PERSON],
      ["Mara Sommer berichtet.", "Mara Sommer (MdB)"], ["Kommunen berichten.", ".*"]]) {
      for (const feld of FELDER) assert.equal((await auswertung(fixture(text), { ...ANALYSE, [feld]: [name] })).valid, false);
    }
    const c = fixture("Sommer fordert mehr Busverkehr."); c.documents[0].title = "Mara";
    assert.equal((await auswertung(c, { ...ANALYSE, mentioned_people: [PERSON] })).valid, false);
    assert.equal((await auswertung(fixture("MARA\n SOMMER fordert mehr Busverkehr."),
      { ...ANALYSE, mentioned_people: [PERSON] })).valid, true);
  });
  await test("Belegte Initialen, Nachnamen und Unicode Namen bleiben ohne Ergaenzung erhalten", async () => {
    for (const [text, name] of [["Abgeordnete M. Sommer berichtet.", "M. Sommer"],
      ["Abgeordnete Sommer berichtet.", "Sommer"],
      ["Abgeordnete LE\u0301A D’ARCY berichtet.", "Léa d’Arcy"],
      ["Abgeordnete Mara Sommer (MdB) berichtet.", "Mara Sommer (MdB)"]]) {
      for (const feld of FELDER) for (const modus of ["erst", "update"]) {
        const s = stand({ ...ANALYSE, [feld]: [name] });
        assert.equal((await run(modus, fixture(text), s)).status, modus === "erst" ? "saved" : "updated");
        assert.deepEqual(s.p.gespeichert[0][feld], [name]);
      }
    }
  });
  await test("Nicht ausgewaehlte Quellen duerfen keine Personenliste begruenden", async () => {
    const c = fixture(); c.documents = Array.from({ length: 14 }, (_, i) => ({ ...c.documents[0],
      id: `rd-${i}`, summary: `Mara Test${i} fordert mehr Busverkehr.` }));
    const selected = U.buildUnderstandingPrompt(c).split("\n").filter(l => l.startsWith('{"quelle_id":')).map(l => JSON.parse(l).quelle_id);
    assert.equal(selected.length, 12);
    const omitted = c.documents.findIndex(d => !selected.includes(d.id)); assert(omitted >= 0);
    for (const feld of FELDER) assert.equal((await auswertung(c, { ...ANALYSE, [feld]: [`Mara Test${omitted}`] })).valid, false);
  });
  await test("Nachtraeglich veraenderte Eingabe liefert keinen rueckwirkenden Beleg (Wert entfaellt)", async () => {
    for (const modus of ["erst", "update"]) {
      const c = fixture(), s = stand({ ...ANALYSE, mentioned_people: [PERSON] },
        () => { c.documents[0].summary = `${PERSON} fordert mehr Busverkehr.`; });
      assert.equal((await run(modus, c, s)).status, modus === "erst" ? "saved" : "updated");
      assert.deepEqual(s.p.gespeichert[0].mentioned_people, [], "die nachtraegliche Mutation belegt nichts");
    }
  });
  await test("Explizit gebundener Artikelabsatz darf einen Namen belegen", async () => {
    for (const modus of ["erst", "update"]) {
      const c = fixture(), doc = c.documents[0], s = stand({ ...ANALYSE, mentioned_people: [PERSON], mentioned_mps: [PERSON] });
      const beleg = { version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
        artikelUrl: doc.url, artikelTitel: doc.title, herkunft: "manueller-originalvergleich",
        gelesenAm: "2026-09-18T10:00:00Z", absatzPosition: 2, text: `Abgeordnete ${PERSON} fordert mehr Busverkehr.` };
      assert.equal((await run(modus, c, s, { artikelkontextVersuch: beleg })).status, modus === "erst" ? "saved" : "updated");
      for (const feld of FELDER) assert.deepEqual(s.p.gespeichert[0][feld], [PERSON]);
    }
  });
  await test("Der strenge Validator prueft den Rohwert weiterhin (Auswerter), der Speicherpfad reduziert", async () => {
    for (const feld of FELDER) {
      const c = fixture("Ratsmitglied Sommer diskutiert Busverkehr.");
      assert.equal((await auswertung(c, { ...ANALYSE, [feld]: [PERSON] })).valid, false);
      const s = stand({ ...ANALYSE, [feld]: [PERSON] });
      const r = await run("erst", c, s);
      assert.equal(r.status, "saved");
      assert.deepEqual(s.p.gespeichert[0][feld], []);
    }
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
