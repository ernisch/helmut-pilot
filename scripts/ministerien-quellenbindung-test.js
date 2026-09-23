"use strict";

const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const { pruefeAkteurslistenQuellenbindung: pruefe,
  ohneUnbelegteAkteurswerte: reduziert } = require("../lib/helmut/akteurslisten-quellenbindung");
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
  await test("Erstverstehen speichert ohne unbelegtes Ministerium — die Antwort bleibt bestehen", async () => {
    for (const field of ["ministerien", "mentioned_ministries"]) {
      const s = stand({ ...ANALYSE, [field]: ["NichtBelegtesMinisterium"] });
      const r = await first(fixture(), s);
      assert.equal(r.status, "saved", JSON.stringify(r));
      assert.equal(s.p.aufrufe, 1, "weiterhin genau ein Modellaufruf");
      assert.equal(s.p.gespeichert.length, 1);
      assert.deepEqual(s.p.gespeichert[0][field], [], "unbelegter Wert wird nicht gespeichert");
      // Die uebrigen Pflichtinhalte bleiben vollstaendig erhalten.
      assert.equal(s.p.gespeichert[0].headline, ANALYSE.headline);
      assert.equal(s.p.gespeichert[0].was_ist_passiert, ANALYSE.was_ist_passiert);
      assert.deepEqual(s.p.gespeichert[0].risiken, []);
      assert.equal(s.p.unbekannt, 0); assert.equal(s.p.failed, 0);
    }
  });
  await test("Gemischte Liste: nur der woertlich belegte Wert wird gespeichert", async () => {
    const s = stand({ ...ANALYSE, ministerien: ["BMG", "Auswaertiges Amt"],
      mentioned_ministries: ["Ministerium fuer Zukunftsfragen", "NichtBelegtesMinisterium"] });
    const r = await first(fixture("BMG und das Ministerium fuer Zukunftsfragen legen einen Bericht vor."), s);
    assert.equal(r.status, "saved", JSON.stringify(r));
    assert.deepEqual(s.p.gespeichert[0].ministerien, ["BMG"]);
    assert.deepEqual(s.p.gespeichert[0].mentioned_ministries, ["Ministerium fuer Zukunftsfragen"]);
  });
  await test("Woertlich belegtes Ministerium bleibt unveraendert erhalten", async () => {
    for (const name of ["BMG", "Ministerium fuer Zukunftsfragen"]) {
      const s = stand({ ...ANALYSE, ministerien: [name], mentioned_ministries: [name] });
      const r = await first(fixture(`${name} stellt einen Bericht vor.`), s);
      assert.equal(r.status, "saved", JSON.stringify(r));
      assert.deepEqual(s.p.gespeichert[0].ministerien, [name]);
      assert.deepEqual(s.p.gespeichert[0].mentioned_ministries, [name]);
    }
  });
  await test("Keine Alias-, Kuerzel-, Ressort- oder Fuzzy-Erweiterung bei der Speicherung", async () => {
    const faelle = [
      { quelle: "Bundesministerium fuer Gesundheit berichtet.", wert: "BMG" },        // Kuerzel
      { quelle: "BMG berichtet.", wert: "Bundesministerium fuer Gesundheit" },        // ausschreiben
      { quelle: "Das Verkehrsministerium prueft.", wert: "Ministerium fuer Verkehr" }, // Ressort
      { quelle: "Ministerium fuer Mondverkehr prueft.", wert: "Ministerium fuer Mondverkeh" }, // Teilwort
      { quelle: "BMGruppen berichten.", wert: "BMG" }                                 // Teilworttreffer
    ];
    for (const f of faelle) for (const feld of ["ministerien", "mentioned_ministries"]) {
      const s = stand({ ...ANALYSE, [feld]: [f.wert] });
      const r = await first(fixture(f.quelle), s);
      assert.equal(r.status, "saved", JSON.stringify({ fall: f, feld, status: r.status }));
      assert.deepEqual(s.p.gespeichert[0][feld], [], `${feld}: ${f.wert}`);
    }
  });
  await test("Die Reduktion entfernt nur unbelegte Strings und mutiert die Antwort nicht", () => {
    const analyse = { ministerien: ["BMG", "NichtBelegt"], mentioned_ministries: [], parteien: [] };
    const vorher = structuredClone(analyse), p = prompt("BMG berichtet.");
    assert.deepEqual(reduziert(analyse, p),
      { ministerien: ["BMG"], mentioned_ministries: [], parteien: [] });
    assert.deepEqual(analyse, vorher, "die Modellantwort wird nicht mutiert");
    // Kein Array bleibt unangetastet: der strenge Validator meldet es unveraendert.
    assert.equal(reduziert({ ministerien: "BMG" }, p).ministerien, "BMG");
    assert.equal(pruefe({ ministerien: "BMG" }, p).valid, false);
  });
  await test("Beteiligungslisten parteien/ausschuesse bleiben fuer unbelegte Werte streng (kein Freibrief)", async () => {
    for (const feld of ["parteien", "ausschuesse"]) {
      const s = stand({ ...ANALYSE, [feld]: ["Voellig Unbelegt"] });
      const r = await first(fixture(), s);
      assert.equal(r.status, "skipped-invalid", `${feld} muss weiter sperren`);
      assert(r.errors.includes(`quellenbeleg-${feld}`), JSON.stringify(r.errors));
      assert.equal(s.p.gespeichert.length, 0); assert.equal(s.p.aufrufe, 1);
    }
  });
  await test("Erwaehnungslisten werden deterministisch reduziert und sperren die Antwort nicht mehr", async () => {
    // Production-Befund 2026-09-24 (Run 35934515630): ein einzelner unbelegter
    // mentioned_people-Wert zerstörte eine ansonsten brauchbare Antwort. Die Erwähnungslisten
    // `mentioned_*` sind reine Nennungen; ein unbelegter Wert entfällt, die Antwort bleibt.
    for (const feld of ["mentioned_ministries", "mentioned_parties", "mentioned_people",
      "mentioned_mps", "mentioned_committees"]) {
      const s = stand({ ...ANALYSE, [feld]: ["Voellig Unbelegt"] });
      const r = await first(fixture(), s);
      assert.equal(r.status, "saved", `${feld}: ${JSON.stringify(r)}`);
      assert.deepEqual(s.p.gespeichert[0][feld], [], `${feld}: unbelegter Wert wird nicht gespeichert`);
      assert.equal(s.p.aufrufe, 1, `${feld}: weiterhin genau ein Modellaufruf`);
      assert.equal(s.p.unbekannt, 0); assert.equal(s.p.failed, 0);
    }
  });
  await test("Gemischte Erwaehnungsliste: nur der woertlich belegte Wert bleibt", async () => {
    const s = stand({ ...ANALYSE, mentioned_people: ["Max Mustermann", "Nicht Belegt"],
      mentioned_parties: ["Die Linke", "Nicht Belegt"] });
    const r = await first(fixture("Max Mustermann fordert mehr Busverkehr; Die Linke unterstuetzt das."), s);
    assert.equal(r.status, "saved", JSON.stringify(r));
    assert.deepEqual(s.p.gespeichert[0].mentioned_people, ["Max Mustermann"]);
    assert.deepEqual(s.p.gespeichert[0].mentioned_parties, ["Die Linke"]);
  });
  await test("Schemafehler und decision_level-Konflikt bleiben fail closed", async () => {
    // Pflichtfeld leer: auch mit weggefiltertem Ministerium wird nichts gespeichert.
    const bad = stand({ ...ANALYSE, was_ist_passiert: "", ministerien: ["NichtBelegtesMinisterium"] });
    assert.equal((await first(fixture(), bad)).status, "skipped-invalid");
    assert.equal(bad.p.gespeichert.length, 0);
    // Bestand 'land' + Antwort 'bund' bleibt gesperrt (gleiche Sperre wie ohne Ministerien).
    const konflikt = stand({ ...ANALYSE, decision_level: "bund", mentioned_ministries: ["NichtBelegtesMinisterium"] });
    // Der Bestand haengt an einer ANDEREN Dokumentverknuepfung: sonst greift der kostenfreie
    // Bestandskurzschluss (`merged`) und der Ebenenkonflikt wird gar nicht erst geprueft.
    konflikt.deps.listVorgangDocuments = async () => [{ id: "rd-alt", title: "Altbestand",
      summary: "Altbestand", url: "https://example.org/alt", published_at: "2026-09-01T00:00:00Z" }];
    const rK = await first(fixture(), konflikt, { existing: { id: "ko-" + vorgangId, ko_version: 4,
      decision_level: "land", political_level: "land",
      classification_confidence: { level: "high", level_quelle: "ki", level_ermittelt_am: "2026-09-20T08:00:00Z" } } });
    assert.equal(rK.status, "skipped-invalid", JSON.stringify(rK));
    assert(rK.errors.includes("decision_level-antwortkonflikt"), JSON.stringify(rK.errors));
    assert.equal(konflikt.p.gespeichert.length, 0);
  });
  await test("Aktualisierung: unbelegtes Ministerium ueberschreibt den Bestand nicht und wird nicht gespeichert", async () => {
    const c = fixture(), s = stand({ ...ANALYSE, ministerien: ["NichtBelegtesMinisterium"] });
    const existing = { id: "ko-" + vorgangId, ko_version: 4, headline: "Erhaltener Bestand" };
    const r = await U.understandUpdate(c, s.deps, { vorgangId, existing, neueDocs: c.documents,
      neueAnker: [], spur: {}, alleDocs: c.documents, vertrag: s.vertrag });
    assert.equal(r.status, "updated", JSON.stringify(r));
    assert.equal(s.p.gespeichert.length, 1);
    assert.deepEqual(s.p.gespeichert[0].ministerien, []);
    assert.equal(s.p.gespeichert[0].ko_version, 5);
    assert.equal(s.p.aufrufe, 1); assert.equal(s.p.unbekannt, 0);
  });
  await test("Aktualisierung: unbelegte Partei haelt Bestand und Sperre unveraendert", async () => {
    const c = fixture(), s = stand({ ...ANALYSE, parteien: ["Unbelegte Partei"] });
    const existing = { id: "ko-" + vorgangId, ko_version: 4, headline: "Erhaltener Bestand" };
    const vorher = structuredClone(existing);
    const r = await U.understandUpdate(c, s.deps, { vorgangId, existing, neueDocs: c.documents,
      neueAnker: [], spur: {}, alleDocs: c.documents, vertrag: s.vertrag });
    assert.equal(r.status, "skipped-invalid"); assert.deepEqual(existing, vorher);
    assert.equal(s.p.failed, 0); assert.equal(s.p.updates, 1); assert.equal(s.p.gespeichert.length, 0);
    assert.equal(s.p.aufrufe, 1); assert.equal(s.p.unbekannt, 1); assert.equal(s.p.frei, 0);
  });
  await test("Quelle wird gegen abgesendete Eingabe statt nachtraeglicher Mutation geprueft", async () => {
    const c = fixture(), s = stand({ ...ANALYSE, parteien: ["Unbelegte Partei"] }, () => { c.documents[0].summary = "Unbelegte Partei berichtet."; });
    assert.equal((await first(c, s)).status, "skipped-invalid");
    assert.equal(s.p.gespeichert.length, 0);
  });
  await test("Ohne CAS bleibt eine unbelegte Partei sichtbar; belegtes Ministerium speichert", async () => {
    const bad = stand({ ...ANALYSE, parteien: ["Unbelegte Partei"] });
    assert.equal((await first(fixture(), bad, { vertrag: null })).status, "skipped-invalid");
    assert.equal(bad.p.failed, 1); assert.equal(bad.p.gespeichert.length, 0);
    const good = stand({ ...ANALYSE, ministerien: ["BMG"] });
    assert.equal((await first(fixture("BMG legt Bericht vor."), good)).status, "saved");
    assert.equal(good.p.gespeichert.length, 1);
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
  await test("Goldsetauswertung darf unbelegte Antwort ebenfalls nicht als gueltig melden", async () => {
    const c = fixture();
    const r = await U.evaluateUnderstandingCase({ name: "fehlender-ministerienbeleg", raw_documents: c.documents },
      async () => ({ ...ANALYSE, mentioned_ministries: ["BMG"] }));
    assert.equal(r.valid, false); assert(r.errors.includes("quellenbeleg-mentioned_ministries"));
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
