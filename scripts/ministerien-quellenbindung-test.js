"use strict";

const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const { pruefeAkteurslistenQuellenbindung: pruefe } = require("../lib/helmut/akteurslisten-quellenbindung");
const ANALYSE = {
  headline: "Konferenz diskutiert Bahnverkehr", was_ist_passiert: "Die Konferenz endete.",
  warum_wichtig: "Bahnverkehr", wer_ist_betroffen: "Reisende", parteien: [], ausschuesse: [],
  ministerien: [], risiken: [], chancen: [], zeitdruck: "gering", handlungsempfehlung: "Quellen lesen.",
  confidence_score: 70, display_title: "Konferenz diskutiert Bahnverkehr"
};
const vorgangId = "vg-test-ministerien";
function fixture(text = "Die Konferenz zum Bahnverkehr ist beendet.") {
  const doc = { id: "rd-test-konferenz", title: "Konferenz diskutiert Bahnverkehr", summary: text,
    url: "https://example.org/politik/konferenz", source_name: "Testmedium", published_at: "2026-09-14T16:00:00Z" };
  return { documents: [doc] };
}
function prompt(text) { return U.buildUnderstandingPrompt(fixture(text)); }
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
    requestUnderstanding: async eingabe => { p.aufrufe++; p.prompt = eingabe; waehrendAufruf(); return structuredClone(antwort); },
    save: async ko => { p.gespeichert.push(ko); return true; }, saveSources: async () => {},
    markFailed: async () => { p.failed++; }, logSkip: () => {}, modelName: () => "attrappe",
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => []
  };
  return { p, vertrag, deps };
}
function first(cluster, s, extra = {}) {
  return U.understandOneCluster(cluster, s.deps, { vorgangId, existing: null, vertrag: s.vertrag, ...extra });
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Belegter Fehlertyp wird ohne Artikelkennung oder Ressortliste abgewiesen", () => {
    for (const name of ["Auswaertiges Amt", "BMWK", "Ministerium fuer Mondverkehr"]) {
      assert.equal(pruefe({ ministerien: [name], mentioned_ministries: [name] }, prompt()).valid, false);
    }
  });
  await test("Explizite Namen aus Titel oder Auszug bleiben erhalten", () => {
    for (const name of ["BMG", "Ministerium für Zukunftsfragen", "Ressort (Verkehr)"]) {
      assert.equal(pruefe({ ministerien: [name] }, prompt(`${name} stellt einen Bericht vor.`)).valid, true);
      const c = fixture(); c.documents[0].title = `${name} stellt Bericht vor`;
      assert.equal(pruefe({ mentioned_ministries: [name] }, U.buildUnderstandingPrompt(c)).valid, true);
    }
    assert.equal(pruefe({ ministerien: ["MINISTERIUM FÜR ZUKUNFTSFRAGEN"] }, prompt("Ministerium fu\u0308r\n Zukunftsfragen berichtet.")).valid, true);
  });
  await test("Metadaten, Promptbeispiele, URLs und andere Antwortfelder sind kein Beleg", () => {
    const c = fixture(); Object.assign(c.documents[0], { source_name: "BMAS", url: "https://example.org/BMAS",
      ministerien: ["BMAS"], full_text: "BMAS berichtet.", artikelkontext: { text: "BMAS berichtet." } });
    assert.equal(pruefe({ ministerien: ["BMAS"], was_ist_passiert: "BMAS berichtet." }, U.buildUnderstandingPrompt(c)).valid, false);
  });
  await test("Keine Teilworttreffer, Feldbruecken, Kurzformableitung oder Regexauswertung", () => {
    assert.equal(pruefe({ ministerien: ["BMG"] }, prompt("BMGruppen berichten.")).valid, false);
    assert.equal(pruefe({ ministerien: ["BMG"] }, prompt("Bundesministerium für Gesundheit berichtet.")).valid, false);
    assert.equal(pruefe({ ministerien: [".*"] }, prompt()).valid, false);
    const c = fixture("Amt berichtet."); c.documents[0].title = "Auswaertiges";
    assert.equal(pruefe({ ministerien: ["Auswaertiges Amt"] }, U.buildUnderstandingPrompt(c)).valid, false);
  });
  await test("Leere Listen passieren, fehlende Quelle und falsche Feldtypen sperren Nennungen", () => {
    assert.equal(pruefe({ ministerien: [], mentioned_ministries: [] }, "").valid, true);
    for (const value of [["BMG"], [17], "BMG"]) assert.equal(pruefe({ ministerien: value }, "").valid, false);
  });
  await test("Nur ausgewaehlte Quellen zaehlen, keine weggelassenen Clustertexte", () => {
    const c = fixture(); c.documents = Array.from({ length: 14 }, (_, i) => ({ ...c.documents[0],
      id: `rd-${i}`, summary: `Ministerium Test${i} berichtet zum Bahnverkehr.` }));
    const p = U.buildUnderstandingPrompt(c);
    const selected = p.split("\n").filter(l => l.startsWith('{"quelle_id":')).map(l => JSON.parse(l).quelle_id);
    assert.equal(selected.length, 12);
    const omitted = c.documents.findIndex(d => !selected.includes(d.id)); assert(omitted >= 0);
    assert.equal(pruefe({ ministerien: [`Ministerium Test${omitted}`] }, p).valid, false);
  });
  await test("Erstverstehen sperrt gesamte Antwort vor Speichern, kein Retry", async () => {
    for (const field of ["ministerien", "mentioned_ministries"]) {
      const s = stand({ ...ANALYSE, [field]: ["BMWK"] });
      const r = await first(fixture(), s);
      assert.equal(r.status, "skipped-invalid"); assert(r.errors.includes(`quellenbeleg-${field}`));
      assert.equal(s.p.aufrufe, 1); assert.equal(s.p.gespeichert.length, 0);
      assert.equal(s.p.unbekannt, 1); assert.equal(s.p.frei, 0);
    }
  });
  await test("Aktualisierung erhaelt Bestand und bestehende Sperre", async () => {
    const c = fixture(), s = stand({ ...ANALYSE, ministerien: ["BMWK"] });
    const existing = { id: "ko-" + vorgangId, ko_version: 4, headline: "Erhaltener Bestand" };
    const vorher = structuredClone(existing);
    const r = await U.understandUpdate(c, s.deps, { vorgangId, existing, neueDocs: c.documents,
      neueAnker: [], spur: {}, alleDocs: c.documents, vertrag: s.vertrag });
    assert.equal(r.status, "skipped-invalid"); assert.deepEqual(existing, vorher);
    assert.equal(s.p.failed, 0); assert.equal(s.p.updates, 1); assert.equal(s.p.gespeichert.length, 0);
    assert.equal(s.p.aufrufe, 1); assert.equal(s.p.unbekannt, 1); assert.equal(s.p.frei, 0);
  });
  await test("Quelle wird gegen abgesendete Eingabe statt nachtraeglicher Mutation geprueft", async () => {
    const c = fixture(), s = stand({ ...ANALYSE, ministerien: ["BMWK"] }, () => { c.documents[0].summary = "BMWK berichtet."; });
    assert.equal((await first(c, s)).status, "skipped-invalid");
    assert.equal(s.p.gespeichert.length, 0);
  });
  await test("Explizit gebundener Artikelabsatz darf Nennung belegen", async () => {
    for (const modus of ["erst", "update"]) {
      const c = fixture(), doc = c.documents[0], s = stand({ ...ANALYSE, ministerien: ["Verkehrsministerium"] });
      const beleg = { version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
        artikelUrl: doc.url, artikelTitel: doc.title, herkunft: "manueller-originalvergleich",
        gelesenAm: "2026-09-18T10:00:00Z", absatzPosition: 2,
        text: "Das Verkehrsministerium stellte einen Bericht vor." };
      const r = modus === "erst" ? await first(c, s, { artikelkontextVersuch: beleg })
        : await U.understandUpdate(c, s.deps, { vorgangId, existing: { id: "ko-" + vorgangId, ko_version: 4 },
          neueDocs: c.documents, neueAnker: [], spur: {}, alleDocs: c.documents, vertrag: s.vertrag, artikelkontextVersuch: beleg });
      assert.equal(r.status, modus === "erst" ? "saved" : "updated");
      assert.deepEqual(s.p.gespeichert[0].ministerien, ["Verkehrsministerium"]);
    }
  });
  await test("Ohne CAS bleibt invalid sichtbar; belegter normaler Fall speichert", async () => {
    const bad = stand({ ...ANALYSE, ministerien: ["BMG"] });
    assert.equal((await first(fixture(), bad, { vertrag: null })).status, "skipped-invalid");
    assert.equal(bad.p.failed, 1); assert.equal(bad.p.gespeichert.length, 0);
    const good = stand({ ...ANALYSE, ministerien: ["BMG"] });
    assert.equal((await first(fixture("BMG legt Bericht vor."), good)).status, "saved");
    assert.equal(good.p.gespeichert.length, 1);
  });
  await test("Goldsetauswertung darf unbelegte Antwort ebenfalls nicht als gueltig melden", async () => {
    const c = fixture();
    const r = await U.evaluateUnderstandingCase({ name: "fehlender-ministerienbeleg", raw_documents: c.documents },
      async () => ({ ...ANALYSE, mentioned_ministries: ["BMG"] }));
    assert.equal(r.valid, false); assert(r.errors.includes("quellenbeleg-mentioned_ministries"));
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
