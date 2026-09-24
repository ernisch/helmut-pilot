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
async function auswertung(c, antwort) {
  return U.evaluateUnderstandingCase({ name: "neutraler-parteienbeleg", raw_documents: c.documents },
    async () => structuredClone(antwort));
}
// Fuehrt denselben Fall in BEIDEN Pfaden aus (Erstverstehen und Aktualisierung).
async function jeModus(c, antwort, pruefer) {
  for (const modus of ["erst", "update"]) {
    const s = stand(structuredClone(antwort));
    pruefer(await run(modus, c, s), s, modus);
  }
}
// Fail closed: die Antwort wird abgewiesen und NICHTS gespeichert.
function gesperrt(r, s) {
  assert.equal(r.status, "skipped-invalid", JSON.stringify(r));
  assert(r.errors.includes("quellenbeleg-parteien"), JSON.stringify(r.errors));
  assert.equal(s.p.gespeichert.length, 0, "es wird nichts gespeichert");
}
// Gerettet: die uebrige Antwort wird gespeichert, `parteien` gemaess Erwartung.
function gerettet(r, s, modus, erwarteteParteien = []) {
  assert.equal(r.status, modus === "erst" ? "saved" : "updated", JSON.stringify(r));
  assert.deepEqual(s.p.gespeichert[0].parteien, erwarteteParteien);
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Unbelegte Beteiligungspartei wird entfernt und NICHT gespeichert (Erstverstehen und Update)", async () => {
    // Production-Befund 2026-09-24 (Run 35987448290): DREI lokale `quellenbeleg-parteien`-Fehler
    // sperrten die gesamte, sonst brauchbare Antwort. `parteien` wird jetzt — wie die
    // Erwaeehnungslisten — deterministisch auf den woertlich belegten Teil reduziert: der
    // unbelegte Wert entfaellt vollstaendig (in `parteien` UND `mentioned_parties`), die uebrige
    // Antwort bleibt erhalten. KEINE unbelegte strukturelle Beteiligung wird gespeichert.
    for (const modus of ["erst", "update"]) {
      const s = stand({ ...ANALYSE, parteien: [PARTEI] });
      const r = await run(modus, fixture(), s);
      assert.equal(r.status, modus === "erst" ? "saved" : "updated", JSON.stringify(r));
      assert.equal(s.p.aufrufe, 1);
      assert.equal(s.p.unbekannt, 0);
      assert.equal(s.p.failed, 0);
      assert.deepEqual(s.p.gespeichert[0].parteien, [], "unbelegte strukturelle Zuordnung darf nicht gespeichert werden");
      assert.deepEqual(s.p.gespeichert[0].mentioned_parties, []);
    }
  });
  await test("Gemischte Liste: der belegte Wert bleibt, der unbelegte entfaellt", async () => {
    for (const modus of ["erst", "update"]) {
      const c = fixture(); c.documents[0].summary = `${PARTEI} fordert mehr Busverkehr.`;
      const s = stand({ ...ANALYSE, parteien: [PARTEI, "Andere Zukunftspartei"] });
      assert.equal((await run(modus, c, s)).status, modus === "erst" ? "saved" : "updated");
      assert.deepEqual(s.p.gespeichert[0].parteien, [PARTEI], "nur der woertlich belegte Wert bleibt");
    }
  });
  await test("Unbelegte Erwaehnungspartei sperrt die Antwort nicht mehr (deterministische Reduktion)", async () => {
    // Erwaehnungslisten sind reine Nennungen (Production-Befund 2026-09-24): ein unbelegter
    // Wert entfaellt, die uebrige Antwort bleibt.
    for (const modus of ["erst", "update"]) {
      const s = stand({ ...ANALYSE, mentioned_parties: [PARTEI] });
      const r = await run(modus, fixture(), s);
      assert.equal(r.status, modus === "erst" ? "saved" : "updated", JSON.stringify(r));
      assert.deepEqual(s.p.gespeichert[0].mentioned_parties, []);
      assert.equal(s.p.aufrufe, 1); assert.equal(s.p.unbekannt, 0);
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
  await test("Leere Listen bleiben gueltig; ein unbelegter Zusatz wird im Auswerter abgelehnt und im Speicherpfad entfernt", async () => {
    assert.equal((await auswertung(fixture(), ANALYSE)).valid, true);
    // GOLDSET-AUSWERTER (Qualitaetswaechter, speichert nichts): unveraendert streng.
    for (const feld of FELDER) {
      const r = await auswertung(fixture(`${PARTEI} fordert mehr Busverkehr.`),
        { ...ANALYSE, [feld]: [PARTEI, "Andere Zukunftspartei"] });
      assert.equal(r.valid, false); assert(r.errors.includes(`quellenbeleg-${feld}`));
    }
    // SPEICHERPFAD: derselbe unbelegte Zusatz entfaellt, die uebrige Antwort bleibt.
    const s = stand({ ...ANALYSE, parteien: [PARTEI, "Andere Zukunftspartei"] });
    const c = fixture(`${PARTEI} fordert mehr Busverkehr.`);
    assert.equal((await run("erst", c, s)).status, "saved");
    assert.deepEqual(s.p.gespeichert[0].parteien, [PARTEI]);
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
  await test("Nachtraeglich veraenderte Eingabe liefert keinen rueckwirkenden Beleg (Wert entfaellt)", async () => {
    for (const modus of ["erst", "update"]) {
      const c = fixture(), s = stand({ ...ANALYSE, parteien: [PARTEI], mentioned_parties: [PARTEI] },
        () => { c.documents[0].summary = `${PARTEI} fordert mehr Busverkehr.`; });
      assert.equal((await run(modus, c, s)).status, modus === "erst" ? "saved" : "updated");
      assert.deepEqual(s.p.gespeichert[0].parteien, [], "die nachtraegliche Mutation belegt nichts");
      assert.deepEqual(s.p.gespeichert[0].mentioned_parties, []);
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
  await test("Die Reduktion ist reine Logik (kein CAS noetig) — der unbelegte Wert entfaellt, der belegte bleibt", async () => {
    const prompt = U.buildUnderstandingPrompt(fixture(`${PARTEI} fordert mehr Busverkehr.`));
    const out = QB.ohneUnbelegteAkteurswerte({ parteien: [PARTEI, "Andere Zukunftspartei"], mentioned_parties: ["Andere Zukunftspartei"] }, prompt);
    assert.deepEqual(out.parteien, [PARTEI], "nur der woertlich belegte Wert bleibt");
    assert.deepEqual(out.mentioned_parties, [], "der unbelegte Wert entfaellt auch aus der Erwaehnungsliste");
    // Der strenge Validator bleibt daneben unveraendert streng (derselbe Beleg, keine Aufweichung).
    assert.equal(QB.pruefeAkteurslistenQuellenbindung({ parteien: [PARTEI, "Andere Zukunftspartei"] }, prompt).valid, false);
    assert.equal(QB.pruefeAkteurslistenQuellenbindung({ parteien: [PARTEI] }, prompt).valid, true);
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
    // Der GOLDSET-AUSWERTER prueft unveraendert streng (Qualitaetswaechter, er speichert nichts).
    // Nur im SPEICHERPFAD werden die reduzierbaren Akteurslisten (Erwaehnungslisten `mentioned_*`
    // und die beiden Ministeriumslisten) auf den woertlich belegten Teil reduziert — siehe
    // docs/betrieb/ministerien-quellenbindung-2026-09-18.md, Nachtrag 23.09. und 24.09.2026.
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

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Abhaengigkeitspruefung der Beteiligungsliste `parteien` (Reviewblocker 2)
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // Der historische Grund fuer die Sonderstrenge (docs/betrieb/parteien-quellenbindung-2026-09-18.md)
  // war ausdruecklich das Risiko einer „stillen Listenbereinigung bei gleichzeitig erhaltener
  // abhaengiger Empfehlung“. Deshalb gilt: `parteien` wird NUR reduziert, wenn der unbelegte Wert
  // in KEINEM anderen gespeicherten Feld vorkommt. Sonst bleibt die Antwort fail closed — und es
  // wird KEINE abhaengige Prosa entfernt oder umgeschrieben.
  await test("A1 (1/10/10) Unabhaengig: unbelegte Partei nur in `parteien` => gespeichert, Liste leer", async () => {
    await jeModus(fixture(), { ...ANALYSE, parteien: [PARTEI] }, (r, s, modus) => {
      gerettet(r, s, modus, []);
      assert.equal(s.p.unbekannt, 0);
      assert.equal(s.p.aufrufe, 1);
      // Die uebrige Antwort bleibt vollstaendig erhalten — nichts wurde entfernt.
      assert.equal(s.p.gespeichert[0].was_ist_passiert, ANALYSE.was_ist_passiert);
      assert.equal(s.p.gespeichert[0].handlungsempfehlung, ANALYSE.handlungsempfehlung);
    });
  });
  await test("A2 (2) Unbelegte Partei auch in `warum_wichtig` => fail closed", async () => {
    await jeModus(fixture(), { ...ANALYSE, parteien: [PARTEI], warum_wichtig: `${PARTEI} fordert mehr Busverkehr.` }, gesperrt);
  });
  await test("A3 (3) Unbelegte Partei auch in `handlungsempfehlung` => fail closed", async () => {
    await jeModus(fixture(), { ...ANALYSE, parteien: [PARTEI], handlungsempfehlung: `${PARTEI} soll sich aeussern.` }, gesperrt);
  });
  await test("A4 (4) Unbelegte Partei auch in `recommendation` => fail closed", async () => {
    await jeModus(fixture(), { ...ANALYSE, parteien: [PARTEI], recommendation: `Mit ${PARTEI} sprechen.` }, gesperrt);
  });
  await test("A5 (5) Unbelegte Partei in Risiko oder Chance => fail closed", async () => {
    await jeModus(fixture(), { ...ANALYSE, parteien: [PARTEI], risiken: [`${PARTEI} blockiert den Beschluss.`] }, gesperrt);
    await jeModus(fixture(), { ...ANALYSE, parteien: [PARTEI], chancen: [`${PARTEI} profiliert sich.`] }, gesperrt);
  });
  await test("A6 (5) Unbelegte Partei in strukturierten Kommunikations-/Handlungselementen => fail closed", async () => {
    await jeModus(fixture(), { ...ANALYSE, parteien: [PARTEI],
      recommended_communication_struct: { communicationLine: `${PARTEI} sollte reagieren.`,
        recommendedChannel: "press", recommendedFormat: "statement", suggestedOutputs: [] } }, gesperrt);
    await jeModus(fixture(), { ...ANALYSE, parteien: [PARTEI],
      risk_of_no_action: `Ohne Reaktion bleibt ${PARTEI} bestimmend.` }, gesperrt);
  });
  await test("A7 (6) Gemischte Liste: unabhaengig => nur der belegte Wert bleibt", async () => {
    const c = fixture(`${PARTEI} fordert mehr Busverkehr.`);
    await jeModus(c, { ...ANALYSE, parteien: [PARTEI, "Andere Zukunftspartei"] },
      (r, s, modus) => gerettet(r, s, modus, [PARTEI]));
  });
  await test("A8 (6) Gemischte Liste: abhaengig => fail closed", async () => {
    const c = fixture(`${PARTEI} fordert mehr Busverkehr.`);
    await jeModus(c, { ...ANALYSE, parteien: [PARTEI, "Andere Zukunftspartei"],
      chancen: ["Andere Zukunftspartei profiliert sich."] }, gesperrt);
  });
  await test("A9 (7) Tatsaechlich belegte strukturelle Partei bleibt unveraendert erhalten", async () => {
    const c = fixture(`${PARTEI} fordert mehr Busverkehr.`);
    await jeModus(c, { ...ANALYSE, parteien: [PARTEI], mentioned_parties: [PARTEI] },
      (r, s, modus) => {
        gerettet(r, s, modus, [PARTEI]);
        assert.deepEqual(s.p.gespeichert[0].mentioned_parties, [PARTEI]);
      });
  });
  await test("A10 (8) Bloß erwaehnte Partei wird nie zur strukturellen Beteiligung befördert", async () => {
    const c = fixture(`${PARTEI} fordert mehr Busverkehr.`);
    await jeModus(c, { ...ANALYSE, parteien: [], mentioned_parties: [PARTEI] }, (r, s, modus) => {
      gerettet(r, s, modus, []);
      assert.deepEqual(s.p.gespeichert[0].mentioned_parties, [PARTEI], "die Erwaehnung bleibt Erwaehnung");
    });
    // Die Reduktion fuegt NIE etwas in `parteien` ein.
    const out = QB.ohneUnbelegteAkteurswerte({ parteien: [], mentioned_parties: [PARTEI] },
      U.buildUnderstandingPrompt(c));
    assert.deepEqual(out.parteien, []);
  });
  await test("A11 Die Abhaengigkeitspruefung ist reine Logik und laesst `parteien` bei Abhaengigkeit unveraendert", () => {
    const p = U.buildUnderstandingPrompt(fixture());
    const unabhaengig = QB.ohneUnbelegteAkteurswerte({ parteien: [PARTEI], warum_wichtig: "Busverkehr" }, p);
    assert.deepEqual(unabhaengig.parteien, []);
    const abhaengig = QB.ohneUnbelegteAkteurswerte({ parteien: [PARTEI], warum_wichtig: `${PARTEI} fordert mehr.` }, p);
    assert.deepEqual(abhaengig.parteien, [PARTEI], "bei Abhaengigkeit bleibt der Wert stehen (fail closed)");
    // Auch in einer Liste und in einer verschachtelten Struktur wird die Abhaengigkeit erkannt.
    assert.deepEqual(QB.ohneUnbelegteAkteurswerte({ parteien: [PARTEI], risiken: [`${PARTEI} blockiert.`] }, p).parteien, [PARTEI]);
    assert.deepEqual(QB.ohneUnbelegteAkteurswerte({ parteien: [PARTEI],
      recommended_communication_struct: { communicationLine: `${PARTEI} reagiert.` } }, p).parteien, [PARTEI]);
    assert.equal(QB.parteienAbhaengig({ parteien: [PARTEI], chancen: [`${PARTEI} profiliert.`] }, [PARTEI]), true);
    assert.equal(QB.parteienAbhaengig({ parteien: [PARTEI] }, [PARTEI]), false);
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
