"use strict";

const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const M = require("../lib/helmut/matching");
const QB = require("../lib/helmut/akteurslisten-quellenbindung");
const ANALYSE = {
  headline: "Kommunen diskutieren Busverkehr", was_ist_passiert: "Kommunen diskutieren den Busverkehr.",
  warum_wichtig: "Busverkehr", wer_ist_betroffen: "Reisende", parteien: [], mentioned_parties: [],
  ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "keiner",
  handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.",
  confidence_score: 70, display_title: "Kommunen diskutieren Busverkehr"
};
const FELDER = ["parteien", "mentioned_parties"];
const PARTEI = "Partei für Zukunftsfragen"; // synthetisch, keine feste Parteienliste
const vorgangId = "vg-test-parteien";
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
function verworfen(r, s, feld) {
  assert.equal(r.status, "skipped-invalid");
  assert(r.errors.includes(`quellenbeleg-${feld}`), JSON.stringify(r.errors));
  assert.equal(s.p.aufrufe, 1); assert.equal(s.p.gespeichert.length, 0);
  assert.equal(s.p.unbekannt, 1); assert.equal(s.p.frei, 0);
}
async function auswertung(c, antwort) {
  return U.evaluateUnderstandingCase({ name: "neutraler-parteienbeleg", raw_documents: c.documents },
    async () => structuredClone(antwort));
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Unbelegte Partei in jeder Liste sperrt Erstverstehen und Update vor dem Speichern", async () => {
    for (const feld of FELDER) for (const modus of ["erst", "update"]) {
      const s = stand({ ...ANALYSE, [feld]: [PARTEI] });
      verworfen(await run(modus, fixture(), s), s, feld);
      assert.equal(s.p.failed, modus === "erst" ? 1 : 0);
      assert.equal(s.p.updates, modus === "update" ? 1 : 0);
    }
  });
  await test("Ausdrueckliche Nennung aus Titel oder Auszug bleibt in beiden Pfaden erhalten", async () => {
    for (const quelle of ["title", "summary"]) for (const modus of ["erst", "update"]) {
      const c = fixture(); c.documents[0][quelle] = `${PARTEI} fordert mehr Busverkehr.`;
      const s = stand({ ...ANALYSE, parteien: [PARTEI], mentioned_parties: [PARTEI] });
      assert.equal((await run(modus, c, s)).status, modus === "erst" ? "saved" : "updated");
      for (const feld of FELDER) assert.deepEqual(s.p.gespeichert[0][feld], [PARTEI]);
      // Der Quellenbeleg darf den fachlich gueltigen Parteitreffer nicht entfernen.
      const profile = { id: "synthetisches-profil", party: PARTEI };
      const match = M.matchProfileToKnowledgeObjects(profile, s.p.gespeichert, { limit: 1 })[0];
      assert(match.matched_features.some(f => f.type === "partei" && f.value === PARTEI));
    }
  });
  await test("Leere Listen bleiben gueltig; ein einziger unbelegter Zusatz sperrt die Antwort", async () => {
    assert.equal((await auswertung(fixture(), ANALYSE)).valid, true);
    for (const feld of FELDER) {
      const r = await auswertung(fixture(`${PARTEI} fordert mehr Busverkehr.`),
        { ...ANALYSE, [feld]: [PARTEI, "Andere Zukunftspartei"] });
      assert.equal(r.valid, false); assert(r.errors.includes(`quellenbeleg-${feld}`));
    }
  });
  await test("Metadaten, URL, Promptbeispiele und andere Antwortfelder ersetzen keinen Beleg", async () => {
    const c = fixture(); Object.assign(c.documents[0], { source_name: "SPD", url: "https://example.org/SPD",
      parteien: ["SPD"], full_text: "SPD fordert mehr Busverkehr.", artikelkontext: { text: "SPD fordert mehr Busverkehr." } });
    for (const feld of FELDER) assert.equal((await auswertung(c,
      { ...ANALYSE, [feld]: ["SPD"], was_ist_passiert: "SPD fordert mehr Busverkehr." })).valid, false);
  });
  await test("Keine Teilworttreffer, Namensableitung oder Verbindung verschiedener Quellfelder", async () => {
    for (const [text, name] of [["ABCD berichtet.", "ABC"], ["Anna Beispiel berichtet.", PARTEI],
      ["Zukunftspartei berichtet.", "ZP"], ["Kommunen berichten.", ".*"]]) {
      for (const feld of FELDER) assert.equal((await auswertung(fixture(text), { ...ANALYSE, [feld]: [name] })).valid, false);
    }
    const c = fixture("für Zukunftsfragen fordert mehr Busverkehr."); c.documents[0].title = "Partei";
    assert.equal((await auswertung(c, { ...ANALYSE, parteien: [PARTEI] })).valid, false);
    assert.equal((await auswertung(fixture("PARTEI FU\u0308R\n ZUKUNFTSFRAGEN fordert mehr Busverkehr."),
      { ...ANALYSE, parteien: [PARTEI] })).valid, true);
  });
  await test("Nicht ausgewaehlte Quellen duerfen keine Parteienliste begruenden", async () => {
    const c = fixture(); c.documents = Array.from({ length: 14 }, (_, i) => ({ ...c.documents[0],
      id: `rd-${i}`, summary: `Partei Test${i} fordert mehr Busverkehr.` }));
    const selected = U.buildUnderstandingPrompt(c).split("\n").filter(l => l.startsWith('{"quelle_id":')).map(l => JSON.parse(l).quelle_id);
    assert.equal(selected.length, 12);
    const omitted = c.documents.findIndex(d => !selected.includes(d.id)); assert(omitted >= 0);
    for (const feld of FELDER) assert.equal((await auswertung(c, { ...ANALYSE, [feld]: [`Partei Test${omitted}`] })).valid, false);
  });
  await test("Nachtraeglich veraenderte Eingabe liefert keinen rueckwirkenden Beleg", async () => {
    for (const modus of ["erst", "update"]) {
      const c = fixture(), s = stand({ ...ANALYSE, parteien: [PARTEI] },
        () => { c.documents[0].summary = `${PARTEI} fordert mehr Busverkehr.`; });
      verworfen(await run(modus, c, s), s, "parteien");
    }
  });
  await test("Explizit gebundener Artikelabsatz darf eine Partei belegen", async () => {
    for (const modus of ["erst", "update"]) {
      const c = fixture(), doc = c.documents[0], s = stand({ ...ANALYSE, parteien: [PARTEI], mentioned_parties: [PARTEI] });
      const beleg = { version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
        artikelUrl: doc.url, artikelTitel: doc.title, herkunft: "manueller-originalvergleich",
        gelesenAm: "2026-09-18T10:00:00Z", absatzPosition: 2, text: `${PARTEI} fordert mehr Busverkehr.` };
      assert.equal((await run(modus, c, s, { artikelkontextVersuch: beleg })).status, modus === "erst" ? "saved" : "updated");
      for (const feld of FELDER) assert.deepEqual(s.p.gespeichert[0][feld], [PARTEI]);
    }
  });
  await test("Ohne CAS bleibt der Fehler sichtbar und wird nicht gespeichert", async () => {
    for (const feld of FELDER) {
      const s = stand({ ...ANALYSE, [feld]: [PARTEI] });
      const r = await run("erst", fixture(), s, { vertrag: null });
      assert.equal(r.status, "skipped-invalid"); assert(r.errors.includes(`quellenbeleg-${feld}`));
      assert.equal(s.p.failed, 1); assert.equal(s.p.aufrufe, 1); assert.equal(s.p.gespeichert.length, 0);
    }
  });
  await test("Artikelvariante derselben Partei belegt (nur die belegte Bezeichnung 'Linke', beide Listen)", async () => {
    const faelle = [
      ["Die Linke fordert mehr Busverkehr.", "Linke"],
      ["Die Linke fordert mehr Busverkehr.", "Die Linke"],
      ["Linke fordert mehr Busverkehr.", "Die Linke"],
      ["LINKE fordert mehr Busverkehr.", "die linke"]
    ];
    for (const [text, name] of faelle) {
      for (const feld of FELDER) {
        assert.equal((await auswertung(fixture(text), { ...ANALYSE, [feld]: [name] })).valid, true,
          `${text} | ${name} | ${feld}`);
      }
    }
  });
  await test("Der Vertrag deckt ausschliesslich 'Die Linke'/'Linke' ab — 'Die Grünen' NICHT", async () => {
    // Quelle nennt nur „Grünen“; das Modell liefert die Artikelform — vom Vertrag NICHT gedeckt
    // (normalisiere() faltet keine Umlaute, es gibt bewusst keinen 'gruenen'/'grünen'-Eintrag).
    for (const feld of FELDER) {
      assert.equal((await auswertung(fixture("Grünen fordern mehr Busverkehr."), { ...ANALYSE, [feld]: ["Die Grünen"] })).valid, false);
    }
    // Abgrenzung: die reine Wortlautform bleibt unveraendert belegbar (strikte Regel, unberuehrt).
    for (const feld of FELDER) {
      assert.equal((await auswertung(fixture("Grünen fordern mehr Busverkehr."), { ...ANALYSE, [feld]: ["Grünen"] })).valid, true);
    }
  });
  await test("Ohne Parteiennennung bleibt jede Partei abgelehnt (auch mit Artikel)", async () => {
    const texteOhnePartei = [
      "Kommunen diskutieren den Busverkehr.",
      "Der Minister und eine Abgeordnete beraten.",
      "SPD und CDU streiten ueber den Busverkehr.",
      "Linksabbieger blockieren die Kreuzung.",
      "Die Linken-nahe Stiftung aeussert sich."
    ];
    for (const text of texteOhnePartei) {
      for (const feld of FELDER) {
        for (const name of ["Die Linke", "Linke"]) {
          assert.equal((await auswertung(fixture(text), { ...ANALYSE, [feld]: [name] })).valid, false,
            `${text} | ${name} | ${feld}`);
        }
      }
    }
  });
  await test("Nur belegte Artikelvarianten: Fraktionsnamen, Synonyme und Flexionen bleiben abgelehnt", async () => {
    const abgelehnt = [
      ["Die Linke fordert mehr Busverkehr.", "Linksfraktion"],
      ["Die Linke fordert mehr Busverkehr.", "Linken"],
      ["Die Linke fordert mehr Busverkehr.", "Sozialdemokraten"],
      ["Die Linke fordert mehr Busverkehr.", "Die Linke Partei"],
      ["Die Linke fordert mehr Busverkehr.", "Union"],
      ["Die Linke fordert mehr Busverkehr.", "Sahra Wagenknecht"]
    ];
    for (const [text, name] of abgelehnt) {
      for (const feld of FELDER) {
        assert.equal((await auswertung(fixture(text), { ...ANALYSE, [feld]: [name] })).valid, false,
          `${text} | ${name} | ${feld}`);
      }
    }
  });
  await test("Die Artikelregel gilt nur fuer belegte Parteien, nicht fuer beliebige 'Die X'-Werte", async () => {
    const text = "Kommunen diskutieren den Busverkehr.";
    for (const feld of FELDER) {
      // "Die Kommunen" traegt artikel-los das Quellwort "Kommunen" — darf trotzdem NICHT belegt sein.
      assert.equal((await auswertung(fixture(text), { ...ANALYSE, [feld]: ["Die Kommunen"] })).valid, false);
    }
  });
  await test("Andere Akteurslisten bleiben unveraendert streng (kein Artikel-Freibrief)", async () => {
    const text = "Die Linke fordert mehr Busverkehr.";
    const rA = await auswertung(fixture(text), { ...ANALYSE, ausschuesse: ["Verkehrsausschuss"], mentioned_committees: ["Verkehrsausschuss"] });
    assert.equal(rA.valid, false); assert(rA.errors.includes("quellenbeleg-ausschuesse"));
    const rM = await auswertung(fixture(text), { ...ANALYSE, ministerien: ["Verkehrsministerium"], mentioned_ministries: ["Verkehrsministerium"] });
    assert.equal(rM.valid, false); assert(rM.errors.includes("quellenbeleg-ministerien"));
    const rP = await auswertung(fixture(text), { ...ANALYSE, mentioned_people: ["Max Mustermann"], mentioned_mps: ["Max Mustermann"] });
    assert.equal(rP.valid, false); assert(rP.errors.includes("quellenbeleg-mentioned_people"));
  });
  await test("Der Validator gibt ausschliesslich valid und errors zurueck (keine Rohinhalte)", async () => {
    const r = QB.pruefeAkteurslistenQuellenbindung({ parteien: ["Die Linke"] }, "kein quellentext");
    assert.deepEqual(Object.keys(r).sort(), ["errors", "valid"]);
    assert.equal(r.valid, false); assert.deepEqual(r.errors, ["quellenbeleg-parteien"]);
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
