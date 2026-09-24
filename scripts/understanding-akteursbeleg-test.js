"use strict";

// Helmut — Vertrag des Akteursbelegs im Understanding (Sprint 2026-09-23).
// =============================================================================================
// Zwei belegte Ursachen, zwei Vertraege:
//   A) Der bestaetigte Herausgebersuffix eines Titels ist METADATUM, kein Quellentext. Der
//      Modellprompt traegt nur den Titelrumpf (kanonische herausgeber.titelRumpf()-Logik); der
//      Herausgeber bleibt getrennt. Der Artikelkontext-Quellenhash bleibt unveraendert.
//   B) Ein woertlich belegter, aber eindeutig FALSCH TYPISIERTER Akteurswert wird im
//      Production-Speicherpfad entfernt (zentrale Entitaetsschicht). Unbekannte belegte Werte
//      bleiben; die strenge Quellenbindung bleibt sonst unveraendert.
// REINE OFFLINE-LOGIK, kein Netz, keine KI, keine DB.
//
// Aufruf:  node scripts/lokal.js -- node scripts/understanding-akteursbeleg-test.js

const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const Q = require("../lib/helmut/quellen-zeitvertrag");
const A = require("../lib/helmut/artikelkontext");
const IB = require("../lib/helmut/akteurslisten-quellenbindung");
const C = require("../lib/helmut/quellenarchitektur/classification");

let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS  " + name); }

function doc(titel, auszug, source_name = "Testmedium", url = "https://example.org/x") {
  return { id: "q1", title: titel, summary: auszug, source_name, url, published_at: "2026-03-01T00:00:00Z" };
}
function promptQuelle(d) {
  const zeile = U.buildUnderstandingPrompt({ documents: [d] }).split("\n").find((l) => l.startsWith('{"quelle_id":'));
  return JSON.parse(zeile);
}

const ANALYSE = {
  headline: "Bundesregierung berät Reform", was_ist_passiert: "Bundesregierung berät.",
  warum_wichtig: "Reform", wer_ist_betroffen: "Bürger", parteien: [], mentioned_parties: [],
  ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "keiner",
  handlungsempfehlung: "Quellen lesen.", confidence_score: 70, display_title: "Bundesregierung berät Reform"
};
const vorgangId = "vg-test-akteursbeleg";
function stand(antwort) {
  const p = { aufrufe: 0, gespeichert: [], failed: 0, unbekannt: 0, frei: 0, updates: 0 };
  const vertrag = {
    reserviere: async () => ({ erlaubt: true, fencing: 1 }), modellstart: async () => ({ erlaubt: true }),
    schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { p.gespeichert.push(ko); return { gespeichert: true, pruefbar: true }; },
    ausgangUnbekannt: async () => { p.unbekannt++; }, freigabe: async () => { p.frei++; },
    freigabeOhneAufruf: async () => { p.frei++; },
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => { p.updates++; }, vormerkungLoese: async () => {}
  };
  const deps = {
    canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async () => { p.aufrufe++; return structuredClone(antwort); },
    save: async (ko) => { p.gespeichert.push(ko); return true; }, saveSources: async () => {},
    markFailed: async () => { p.failed++; }, logSkip: () => {}, modelName: () => "attrappe",
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => []
  };
  return { p, vertrag, deps };
}
function cluster(text = "Bundesregierung berät über die Reform.") {
  return { documents: [doc("Bundesregierung berät Reform", text)] };
}

async function main() {
  // ── A · Herausgeber trennen ─────────────────────────────────────────────────────────────────
  await test("A1 Der bestaetigte Herausgebersuffix steht NICHT mehr im Prompt-Titel, der Herausgeber bleibt", () => {
    const d = doc("Fragen und Antworten zur BAföG-Reform - bundesregierung.de", "Die Reform wird beraten.", "bundesregierung.de");
    const q = promptQuelle(d);
    assert.equal(q.titel, "Fragen und Antworten zur BAföG-Reform");
    assert.equal(q.herausgeber, "bundesregierung.de");
    assert(!q.titel.includes("bundesregierung"));
  });

  await test("A2 Ein Quellenname-Suffix ist kein Akteursbeleg mehr", () => {
    const q = promptQuelle(doc("Arbeitsmarktpolitik soll effizienter werden - Deutscher Bundestag", "…", "Deutscher Bundestag"));
    assert.equal(q.titel, "Arbeitsmarktpolitik soll effizienter werden");
    assert.equal(q.herausgeber, "Deutscher Bundestag");
  });

  await test("A3 Die echte Sachnennung bleibt erhalten, nur der Publisher-Suffix entfaellt", () => {
    assert.equal(promptQuelle(doc("Bundesregierung beschließt Reform - Beispielmedium", "…", "Beispielmedium")).titel,
      "Bundesregierung beschließt Reform");
  });

  await test("A4 Ein Publisher-Suffix belegt die Partei nicht; der echte Sachtext bleibt", () => {
    assert.equal(promptQuelle(doc("Aktionstag gegen Kürzungen - Die Linke Berlin", "…", "Die Linke Berlin")).titel,
      "Aktionstag gegen Kürzungen");
    assert.equal(promptQuelle(doc("Die Linke Berlin fordert mehr Busverkehr - Beispielmedium", "…", "Beispielmedium")).titel,
      "Die Linke Berlin fordert mehr Busverkehr");
  });

  await test("A5 Kanonische Quellenfunktion und Artikelkontext-Quellenhash bleiben unveraendert", () => {
    const d = doc("Fragen und Antworten zur BAföG-Reform - bundesregierung.de", "Die Reform wird beraten.", "bundesregierung.de");
    assert.equal(Q.understandingQuelle(d).titel, d.title);
    assert.equal(A.quellenstandHash(d), A.quellenstandHash(d));
    assert.notEqual(promptQuelle(d).titel, d.title);
  });

  // ── B · Entitaetstyp (zentrale Schicht) ─────────────────────────────────────────────────────
  await test("B1 Die zentrale Entitaetsschicht liefert die erwarteten Typen", () => {
    const faelle = [
      ["Bundesregierung", "ministry", "government"], ["Bundesrat", "committee", "parliament"],
      ["Deutscher Bundestag", "committee", "parliament"], ["Bundestag", "committee", "parliament"],
      ["DGB", "party", "union"], ["ver.di", "party", "union"], ["IG Metall", "party", "union"]
    ];
    for (const [name, hint, typ] of faelle) {
      assert.equal(C.resolveEntity(name, hint).type, typ, `${name} (${hint})`);
    }
  });

  await test("B2 Falsch typisierte, woertlich belegte Werte werden entfernt", () => {
    const p = U.buildUnderstandingPrompt({ documents: [doc("Bundesregierung beschließt Reform",
      "Der Bundesrat, die DGB und die Bundesregierung beraten; BMAS und IG Metall sind dabei.")] });
    assert.deepEqual(IB.ohneFalschTypisierteAkteure({ mentioned_ministries: ["Bundesregierung"] }, p).mentioned_ministries, []);
    assert.deepEqual(IB.ohneFalschTypisierteAkteure({ ausschuesse: ["Bundesrat"] }, p).ausschuesse, []);
    assert.deepEqual(IB.ohneFalschTypisierteAkteure({ mentioned_parties: ["DGB"] }, p).mentioned_parties, []);
    assert.deepEqual(IB.ohneFalschTypisierteAkteure({ mentioned_parties: ["IG Metall"] }, p).mentioned_parties, []);
    assert.deepEqual(IB.ohneFalschTypisierteAkteure({ mentioned_people: ["Bundesregierung"] }, p).mentioned_people, []);
  });

  await test("B3 Korrekte und unbekannte belegte Werte bleiben erhalten", () => {
    const p = U.buildUnderstandingPrompt({ documents: [doc("Bundesregierung beschließt Reform",
      "BMAS und die Partei für Zukunftsfragen und die SPD-Bundestagsfraktion beraten.")] });
    assert.deepEqual(IB.ohneFalschTypisierteAkteure({ ministerien: ["BMAS"] }, p).ministerien, ["BMAS"]);
    assert.deepEqual(IB.ohneFalschTypisierteAkteure({ mentioned_parties: ["Partei für Zukunftsfragen"] }, p).mentioned_parties,
      ["Partei für Zukunftsfragen"]);
    assert.deepEqual(IB.ohneFalschTypisierteAkteure({ mentioned_parties: ["SPD-Bundestagsfraktion"] }, p).mentioned_parties,
      ["SPD-Bundestagsfraktion"]);
  });

  await test("B4 Die Bereinigung mutiert die Antwort nicht und laesst Nicht-Arrays unangetastet", () => {
    const p = U.buildUnderstandingPrompt({ documents: [doc("Bundesregierung berät", "Bundesregierung berät.")] });
    const analyse = { mentioned_ministries: ["Bundesregierung"], parteien: "kein-array" };
    const vorher = structuredClone(analyse);
    const out = IB.ohneFalschTypisierteAkteure(analyse, p);
    assert.deepEqual(analyse, vorher, "Eingabe darf nicht mutiert werden");
    assert.deepEqual(out.mentioned_ministries, []);
    assert.equal(out.parteien, "kein-array", "Nicht-Array bleibt unangetastet (fail closed)");
  });

  // ── B · Speicherpfad (Erstverstehen / Update) ───────────────────────────────────────────────
  await test("B6b Eine unbelegte Beteiligungsliste `ausschuesse` bleibt streng (kein Freibrief)", async () => {
    const s = stand({ ...ANALYSE, ausschuesse: ["Unbelegter Ausschuss"] });
    const r = await U.understandOneCluster(cluster(), s.deps, { vorgangId, existing: null, vertrag: s.vertrag });
    assert.equal(r.status, "skipped-invalid", JSON.stringify(r));
    assert(r.errors.includes("quellenbeleg-ausschuesse"), JSON.stringify(r.errors));
    assert.equal(s.p.gespeichert.length, 0);
  });
  await test("B5 Erstverstehen speichert trotz falsch typisiertem Ministerium — der Wert entfaellt", async () => {
    const s = stand({ ...ANALYSE, mentioned_ministries: ["Bundesregierung"] });
    const r = await U.understandOneCluster(cluster(), s.deps, { vorgangId, existing: null, vertrag: s.vertrag });
    assert.equal(r.status, "saved", JSON.stringify(r));
    assert.equal(s.p.aufrufe, 1);
    assert.deepEqual(s.p.gespeichert[0].mentioned_ministries, []);
    assert.equal(s.p.gespeichert[0].headline, ANALYSE.headline);
  });

  await test("B6 Belegtes, korrekt typisiertes Ministerium bleibt erhalten", async () => {
    const s = stand({ ...ANALYSE, ministerien: ["BMAS"] });
    const r = await U.understandOneCluster(cluster("Das BMAS berät über die Reform."), s.deps, { vorgangId, existing: null, vertrag: s.vertrag });
    assert.equal(r.status, "saved", JSON.stringify(r));
    assert.deepEqual(s.p.gespeichert[0].ministerien, ["BMAS"]);
  });

  await test("B7 Eine unbelegte Partei sperrt die Antwort (fail closed); eine belegte bleibt", async () => {
    // 2026-09-24 (169er Production-Befund Run 35987448290): eine Reduktion von `parteien` wurde
    // geprueft und VERWORFEN — eine umschreibende Prosa kann semantisch von der entfernten
    // unbelegten Parteibeteiligung abhaengen, ohne den Namen zu nennen; dafuer gibt es keine
    // belastbare Belegstruktur je Aussage (`akteurslisten-quellenbindung.js`). `parteien` bleibt
    // daher streng: ein unbelegter Wert sperrt die ganze Antwort.
    const s = stand({ ...ANALYSE, parteien: ["Unbelegte Partei"] });
    const r = await U.understandOneCluster(cluster(), s.deps, { vorgangId, existing: null, vertrag: s.vertrag });
    assert.equal(r.status, "skipped-invalid", JSON.stringify(r));
    assert(r.errors.includes("quellenbeleg-parteien"), JSON.stringify(r.errors));
    assert.equal(s.p.gespeichert.length, 0);
    // Gegenprobe: die woertlich belegte Bezeichnung bleibt unveraendert erhalten.
    const s2 = stand({ ...ANALYSE, parteien: ["Unbelegte Partei"] });
    const r2 = await U.understandOneCluster(
      cluster("Die Unbelegte Partei berät über die Reform."), s2.deps,
      { vorgangId, existing: null, vertrag: s2.vertrag });
    assert.equal(r2.status, "saved", JSON.stringify(r2));
    assert.deepEqual(s2.p.gespeichert[0].parteien, ["Unbelegte Partei"]);
  });

  await test("B8 Goldset bleibt streng: ein unbelegter Wert ist dort weiterhin ungueltig", async () => {
    const r = await U.evaluateUnderstandingCase({ name: "akteurstyp", raw_documents: cluster().documents },
      async () => ({ ...ANALYSE, mentioned_ministries: [] }));
    assert.equal(r.valid, true);
    const r2 = await U.evaluateUnderstandingCase({ name: "unbelegt", raw_documents: cluster().documents },
      async () => ({ ...ANALYSE, mentioned_ministries: ["BMG"] }));
    assert.equal(r2.valid, false);
    assert(r2.errors.includes("quellenbeleg-mentioned_ministries"));
  });

  await test("B9 Aktualisierung entfernt falsch typisierte Werte genauso", async () => {
    const s = stand({ ...ANALYSE, mentioned_people: ["Bundesregierung"] });
    const c = cluster();
    const existing = { id: "ko-" + vorgangId, ko_version: 4, headline: "Bestand" };
    const r = await U.understandUpdate(c, s.deps, { vorgangId, existing, neueDocs: c.documents,
      neueAnker: [], spur: {}, alleDocs: c.documents, vertrag: s.vertrag });
    assert.equal(r.status, "updated", JSON.stringify(r));
    assert.deepEqual(s.p.gespeichert[0].mentioned_people, []);
  });

  // ── C · Erwaehnungslisten-Reduktion und strenge Beteiligungslisten (169er 2026-09-24) ────────
  // Run 35934515630, Vorgang vg-reformen-20260908-c646df: der Fehlercode
  // `quellenbeleg-mentioned_people` sperrte eine ansonsten brauchbare Antwort und beendete damit
  // den gesamten 169er Lauf (ausgang `unbekannt`). Ein einzelner unbelegter ERWAEHNUNGSWERT darf
  // die Antwort nicht mehr sperren; belegte Werte bleiben. Die BETEILIGUNGSLISTEN `parteien` und
  // `ausschuesse` bleiben dagegen STRENG (eine `parteien`-Reduktion wurde geprueft und verworfen).
  await test("C1 Production-Fehler mentioned_people sperrt die Antwort nicht mehr", async () => {
    const s = stand({ ...ANALYSE, mentioned_people: ["Nicht Belegt"] });
    const r = await U.understandOneCluster(cluster(), s.deps, { vorgangId, existing: null, vertrag: s.vertrag });
    assert.equal(r.status, "saved", JSON.stringify(r));
    assert.equal(s.p.aufrufe, 1);
    assert.deepEqual(s.p.gespeichert[0].mentioned_people, []);
    assert.equal(s.p.unbekannt, 0); assert.equal(s.p.failed, 0);
  });

  await test("C2 Belegte Personen bleiben, unbelegte entfallen", async () => {
    const s = stand({ ...ANALYSE, mentioned_people: ["Max Mustermann", "Nicht Belegt"] });
    const r = await U.understandOneCluster(cluster("Max Mustermann fordert mehr Busverkehr."),
      s.deps, { vorgangId, existing: null, vertrag: s.vertrag });
    assert.equal(r.status, "saved", JSON.stringify(r));
    assert.deepEqual(s.p.gespeichert[0].mentioned_people, ["Max Mustermann"]);
  });

  await test("C3 Reduzierbar sind die Erwaehnungslisten; `parteien` und `ausschuesse` bleiben streng", () => {
    const p = U.buildUnderstandingPrompt({ documents: [doc("Verein diskutiert Busangebot", "Ein Verein diskutiert das Busangebot.")] });
    for (const feld of ["mentioned_ministries", "mentioned_parties", "mentioned_people",
      "mentioned_mps", "mentioned_committees"]) {
      assert.deepEqual(IB.ohneUnbelegteAkteurswerte({ [feld]: ["Unbelegt"] }, p)[feld], [], feld);
    }
    for (const feld of ["parteien", "ausschuesse"]) {
      assert.deepEqual(IB.ohneUnbelegteAkteurswerte({ [feld]: ["Unbelegt"] }, p)[feld], ["Unbelegt"], feld);
    }
  });

  await test("C4 Wirklich unbelegte `ausschuesse` UND `parteien` sperren weiterhin (fail closed)", async () => {
    const sA = stand({ ...ANALYSE, ausschuesse: ["Unbelegte Rolle"] });
    const rA = await U.understandOneCluster(cluster(), sA.deps, { vorgangId, existing: null, vertrag: sA.vertrag });
    assert.equal(rA.status, "skipped-invalid", JSON.stringify(rA));
    assert(rA.errors.includes("quellenbeleg-ausschuesse"), JSON.stringify(rA.errors));
    assert.equal(sA.p.gespeichert.length, 0);
    const sP = stand({ ...ANALYSE, parteien: ["Unbelegte Rolle"] });
    const rP = await U.understandOneCluster(cluster(), sP.deps, { vorgangId, existing: null, vertrag: sP.vertrag });
    assert.equal(rP.status, "skipped-invalid", JSON.stringify(rP));
    assert(rP.errors.includes("quellenbeleg-parteien"), JSON.stringify(rP.errors));
    assert.equal(sP.p.gespeichert.length, 0);
  });

  await test("C5 Nicht sicher reduzierbare Angaben bleiben unangetastet und ungueltig", () => {
    const p = U.buildUnderstandingPrompt({ documents: [doc("Verein diskutiert Busangebot", "Ein Verein diskutiert das Busangebot.")] });
    assert.equal(IB.ohneUnbelegteAkteurswerte({ mentioned_people: "kein-array" }, p).mentioned_people, "kein-array");
    assert.equal(IB.pruefeAkteurslistenQuellenbindung({ mentioned_people: "kein-array" }, p).valid, false);
    assert.equal(IB.pruefeAkteurslistenQuellenbindung({ mentioned_people: [17] }, p).valid, false);
  });

  await test("C6 Schemafehler bleiben auch mit reduzierter Erwaehnung fail closed", async () => {
    const s = stand({ ...ANALYSE, was_ist_passiert: "", mentioned_people: ["Nicht Belegt"] });
    const r = await U.understandOneCluster(cluster(), s.deps, { vorgangId, existing: null, vertrag: s.vertrag });
    assert.equal(r.status, "skipped-invalid", JSON.stringify(r));
    assert.equal(s.p.gespeichert.length, 0);
  });

  console.log(`\n${pass}/${pass} Gruppen erfolgreich`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
