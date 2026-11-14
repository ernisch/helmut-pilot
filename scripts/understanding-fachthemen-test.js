"use strict";

// Ausschliesslich neue Fachbelegfaelle. Echter Understanding-/Matchingkern mit
// synthetischer Anbieterantwort und Speicher: kein Netz, Modell oder Datenbank.
const A = require("node:assert/strict");
if (process.argv.length !== 2) throw Error("Unbekannte Testauswahl");
const forbidden = [];
const verboten = name => () => { forbidden.push(name); throw Error(name + " verboten"); };
global.fetch = verboten("Netz");
require("node:https").request = verboten("HTTPS");
const U = require("../lib/helmut/understanding"), F = require("../lib/helmut/understanding-fachthemen"),
  S = require("../lib/helmut/understanding-schema"), L = require("../lib/helmut/quellen-lektuerebeleg"),
  C = require("../lib/helmut/verstehen-vertrag"), K = require("../lib/helmut/artikelkontext"),
  M = require("../lib/helmut/matching");
const { testPoliticianOne, testPoliticianTwo } = require("./fixtures/test-profiles");
const passage = "Die Tarifbindung der Beschäftigten wird im vorgelegten Tarifbericht untersucht.";
const doc = (id = "rd-fachvertrag", summary = passage) => ({ id, title: "Tarifbericht untersucht Beschäftigung",
  summary, source_name: "Synthetische amtliche Quelle", url: "https://example.invalid/fachvertrag/" + id,
  published_at: "2026-11-13T08:00:00Z", retrieved_at: "2026-11-14T03:00:00Z" });
const raw = () => ({ headline: "Tarifbericht untersucht Beschäftigung", was_ist_passiert: passage,
  warum_wichtig: "Der Bericht beschreibt die Tarifbindung.", wer_ist_betroffen: "Beschäftigte",
  handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.",
  confidence_score: 85, zeitdruck: "keiner", parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [] });
const beleg = (tag = "Tarifbindung", id = "rd-fachvertrag", text = passage, feld = "auszug") =>
  ({ tags: [tag], fachthemen_belege: [{ tag, quelle_id: id, feld, passage: text }] });
const cluster = d => ({ documents: [d || doc()] });
const assemble = (antwort, c = cluster(), option = {}) => U.assembleKnowledgeObject(antwort, c,
  "vg-fachvertrag-synthetisch", { prompt: U.buildUnderstandingPrompt(c, option), ...option });
function welt(antwort) {
  const w = { prompts: [], gespeichert: [], start: 0, reserviert: [], failed: 0 };
  w.vertrag = C.baueVertrag({ besitzer: "synthetischer-fachvertrag", env: { HELMUT_VERSTEHEN_CAS: "true" }, deps: { speicher: {
    verstehenReserviere: async x => { w.reserviert.push(x); return { erlaubt: true, fencing: 1 }; },
    verstehenModellstart: async () => { w.start++; return { ok: true }; }, verstehenSchreibrecht: async () => ({ ok: true }),
    verstehenSpeichere: async ({ ko }) => { w.gespeichert.push(structuredClone(ko)); return { ergebnis: "gespeichert" }; },
    verstehenAusgangUnbekannt: verboten("Unbekannter Ausgang"), verstehenFreigabe: verboten("Freigabe nach Erfolg"),
    verstehenFreigabeOhneAufruf: verboten("Freigabe ohne Aufruf"),
    verstehenVormerkungLese: async () => ({ verfuegbar: true, eintraege: {} }),
    verstehenVormerkungLoese: async () => ({ ok: true }) } } });
  w.deps = { canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async prompt => { w.prompts.push(prompt); return structuredClone(antwort); },
    save: verboten("CAS-Bypass"), saveSources: async (_id, docs) => ({ saved: docs.length }),
    markFailed: async () => { w.failed++; }, logSkip: () => {}, modelName: () => "synthetische-antwort",
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => [] };
  w.run = (d = doc()) => U.understandOneCluster(cluster(d), w.deps,
    { vorgangId: "vg-fachvertrag-synthetisch", existing: null, vertrag: w.vertrag });
  return w;
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Gleicher Understandingaufruf persistiert nur exakten Originalfachbeleg im bestehenden CAS", async () => {
    const antwort = { ...raw(), ...beleg() }, vorher = structuredClone(antwort), w = welt(antwort), r = await w.run();
    A.equal(r.status, "saved"); A.equal(w.prompts.length, 1); A.equal(w.start, 1); A.equal(w.gespeichert.length, 1);
    const ko = w.gespeichert[0], p = w.prompts[0], q = JSON.parse(p.split("\n").find(l => l.startsWith('{"quelle_id":'))),
      gelesen = L.quellenLektuereBeleg(q), nachweis = ko.classification_confidence[F.FELD];
    A.deepEqual(ko.tags, ["Tarifbindung"]); A.equal(nachweis.status, "belegt");
    A.equal(nachweis.belege[0].quellenHash, gelesen.quellenHash);
    A.equal(nachweis.belege[0].textstandHash, gelesen.textstandHash);
    A.equal(nachweis.belege[0].passageHash, L.hash(passage));
    A.equal(nachweis.vorgangId, ko.vorgang_id); A.equal(nachweis.koVersion, ko.ko_version);
    A.equal(ko.fachthemen_belege, undefined); A.equal(JSON.stringify(nachweis).includes(passage), false);
    A.match(p, /FACHTHEMEN/); A.match(p, /Hintergrundnennung/); A.equal(S.KNOWLEDGE_OBJECT_SCHEMA.properties.tags.maxItems, 6);
    A.equal(S.KNOWLEDGE_OBJECT_SCHEMA.required.includes("tags"), false);
    A.equal(S.validateKnowledgeObject(ko).valid, true); A.deepEqual(antwort, vorher);
    A.equal(w.reserviert.length, 1); A.equal(w.reserviert[0].vorgangId, ko.vorgang_id);
    A.equal(w.reserviert[0].eingabeHash, C.eingabeHash({ vorgangId: ko.vorgang_id, dokumente: [doc()], modus: "erst" }));
  });
  await test("Fehlende oder ungueltige optionale Fachbelege blockieren keinen bestaetigten Sachstand", async () => {
    for (const extra of [{}, { tags: ["Tarifbindung"] }, { tags: "Tarifbindung", fachthemen_belege: [] },
      beleg("Tarifbindung", "fremde-quelle"), { tags: [], fachthemen_belege: [] }]) {
      const w = welt({ ...raw(), ...extra }), r = await w.run(); A.equal(r.status, "saved");
      A.equal(w.failed, 0); A.equal(w.prompts.length, 1); A.equal(w.gespeichert.length, 1);
      const ko = w.gespeichert[0]; A.deepEqual(ko.tags, []); A.equal(ko.was_ist_passiert, passage);
      A.equal(ko.classification_confidence[F.FELD].status, Object.keys(extra).length === 0 ? "fehlt"
        : Array.isArray(extra.tags) && extra.tags.length === 0 ? "leer" : "unbelegt");
      A.equal(S.validateKnowledgeObject(ko).valid, true);
    }
  });
  await test("DocID und ganze Passage gehoeren zusammen; Titel, Metatext und Teilwoerter tragen kein Thema", () => {
    const a = doc("rd-a", "Der Bericht untersucht die Beschäftigung nach der Ausbildung."), b = doc("rd-b"),
      c = { documents: [a, b] }, p = U.buildUnderstandingPrompt(c);
    for (const extra of [beleg("Tarifbindung", a.id), beleg("Tarif", b.id), beleg("Tarifbindung Mindestlohn", b.id),
      { tags: ["Tarifbindung", "Tarifbindung"], fachthemen_belege: [beleg().fachthemen_belege[0], beleg().fachthemen_belege[0]] },
      { tags: Array(7).fill("Tarifbindung"), fachthemen_belege: Array(7).fill(beleg().fachthemen_belege[0]) }])
      A.deepEqual(F.pruefe(extra, p).tags, []);
    const titleOnly = doc("rd-titel", "Der Bericht wurde veröffentlicht."); titleOnly.title = passage;
    A.deepEqual(assemble({ ...raw(), ...beleg("Tarifbindung", titleOnly.id) }, cluster(titleOnly)).tags, []);
    for (const text of ["Hier finden Sie Informationen über Tarifbindung und die Arbeit des Ministeriums.",
      "Bitte aktivieren Sie JavaScript, um Informationen zur Tarifbindung zu lesen."]) {
      const d = doc("rd-meta", text);
      A.deepEqual(assemble({ ...raw(), ...beleg("Tarifbindung", d.id, text) }, cluster(d)).tags, []);
    }
    A.deepEqual(F.pruefe(beleg("Tarifbindung", b.id), p + '\n{"quelle_id":"rd-b"}').tags, []);
  });
  await test("Moderne Quellenabschnitte geben nur den gelesenen Teil und dessen Versionshash fuer Fachbelege frei", () => {
    const rente = "Die Rente wird im getrennten Teil des Berichts untersucht.",
      d = doc("rd-lang", (passage + " ").repeat(140) + (rente + " ").repeat(160)),
      c = { documents: [d], quellenAbschnitte: { [d.id]: 0 } }, p = U.buildUnderstandingPrompt(c),
      q = JSON.parse(p.split("\n").find(l => l.startsWith('{"quelle_id":')));
    A.ok(q.quellenabschnitt); A.equal(q.quellenabschnitt.index, 0); A.equal(q.auszug.includes(rente), false);
    const good = assemble({ ...raw(), ...beleg("Tarifbindung", d.id) }, c),
      bad = assemble({ ...raw(), ...beleg("Rente", d.id, rente) }, c);
    A.deepEqual(good.tags, ["Tarifbindung"]); A.deepEqual(bad.tags, []);
    A.equal(good.classification_confidence[F.FELD].belege[0].abschnitt.index, 0);
    const last = require("../lib/helmut/artikel-abschnitte").segmentiere(d.summary).count - 1,
      later = assemble({ ...raw(), ...beleg("Rente", d.id, rente) }, { documents: [d], quellenAbschnitte: { [d.id]: last } });
    A.deepEqual(later.tags, ["Rente"]);
    A.notEqual(later.classification_confidence[F.FELD].belege[0].textstandHash,
      good.classification_confidence[F.FELD].belege[0].textstandHash);
    const docs = Array.from({ length: 13 }, (_, i) => doc("rd-auswahl-" + i));
    const prompt = U.buildUnderstandingPrompt({ documents: docs }), ids = new Set(prompt.split("\n")
      .filter(l => l.startsWith('{"quelle_id":')).map(l => JSON.parse(l).quelle_id));
    const ungelesen = docs.find(d => !ids.has(d.id)); A.ok(ungelesen);
    A.deepEqual(F.pruefe(beleg("Tarifbindung", ungelesen.id), prompt).tags, []);
  });
  await test("Artikelkontextbeleg gilt nur im gesendeten Kontext; weitere Rohfelder liefern keine Fachbelege", () => {
    const d = doc("rd-kontext", "Der Bericht wurde veröffentlicht."), c = cluster(d),
      kontext = { version: 1, dokumentId: d.id, quellenHash: K.quellenstandHash(d), artikelUrl: d.url,
        artikelTitel: d.title, herkunft: "manueller-originalvergleich", gelesenAm: "2026-11-14T03:00:00Z",
        absatzPosition: 1, text: passage };
    d.raw = { ungelesen: passage };
    const antwort = { ...raw(), ...beleg("Tarifbindung", d.id, passage, "artikelkontext") },
      good = assemble(antwort, c, { artikelkontextVersuch: kontext }), bad = assemble(antwort, c);
    A.deepEqual(good.tags, ["Tarifbindung"]); A.deepEqual(bad.tags, []);
    A.equal(good.classification_confidence[F.FELD].belege[0].feld, "artikelkontext");
    A.throws(() => U.buildUnderstandingPrompt(cluster({ ...d, summary: "Anderer Quellenstand." }),
      { artikelkontextVersuch: kontext }), /quellenstand-abweichend/);
  });
  await test("Aktualisierung uebernimmt keine Bestandstags und erfindet weder Ausschuss noch Dringlichkeit", async () => {
    for (const extra of [beleg(), {}]) {
      const w = welt({ ...raw(), ...extra }), d = doc(), existing = { id: "ko-vg-fachvertrag-synthetisch",
        vorgang_id: "vg-fachvertrag-synthetisch", ko_version: 2, tags: ["Mindestlohn"], headline: "Erhaltener Bestand" },
        before = structuredClone(existing), r = await U.understandUpdate(cluster(d), w.deps, {
          vorgangId: existing.vorgang_id, existing, neueDocs: [d], alleDocs: [d], neueAnker: [], spur: {}, vertrag: w.vertrag });
      A.equal(r.status, "updated"); A.equal(w.prompts.length, 1); const ko = w.gespeichert[0];
      A.equal(ko.ko_version, 3); A.deepEqual(ko.tags, extra.tags || []);
      A.deepEqual(ko.ausschuesse, []); A.equal(ko.zeitdruck, "keiner"); A.equal(ko.deadline, undefined);
      A.equal(ko.policy_field, undefined); A.deepEqual(existing, before);
    }
  });
  await test("Bestaetigter Altstand bleibt kostenlos, UNKNOWN bleibt auf gleichem CAS-Subject gesperrt", async () => {
    const d = doc(), c = cluster(d), id = "vg-fachvertrag-synthetisch", w = welt({ ...raw(), ...beleg() }),
      existing = { id: "ko-" + id, vorgang_id: id, ko_version: 1, status: "neu", understanding_status: "complete",
        headline: "Bestaetigter Altstand ohne Fachthemen" }, before = structuredClone(existing);
    w.deps.listVorgangDocuments = async () => [d];
    const r = await U.understandOneCluster(c, w.deps, { vorgangId: id, existing, vertrag: null });
    A.equal(r.status, "duplicate"); A.deepEqual(w.prompts, []); A.deepEqual(w.reserviert, []); A.deepEqual(existing, before);
    const claims = [], pending = { ...existing, status: "pending", understanding_status: "pending" },
      v = C.baueVertrag({ besitzer: "synthetischer-fachvertrag", env: { HELMUT_VERSTEHEN_CAS: "true" }, deps: { speicher: {
        verstehenReserviere: async arg => { claims.push(arg); return { verfuegbar: true, erlaubt: false,
          zustand: "unbekannt", grund: "ausgang-unbekannt", fencing: 3, versuche: 1 }; },
        verstehenModellstart: verboten("UNKNOWN-Modellstart"), verstehenSpeichere: verboten("UNKNOWN-Speicher") } } });
    const blocked = await U.understandOneCluster(c, w.deps, { vorgangId: id, existing: pending, vertrag: v });
    A.equal(blocked.status, "skipped-ausgang-unbekannt"); A.equal(claims.length, 1);
    A.equal(claims[0].vorgangId, id); A.equal(claims[0].eingabeHash, C.eingabeHash({ vorgangId: id, dokumente: [d] }));
    const kontext = { version: 1, dokumentId: d.id, quellenHash: K.quellenstandHash(d), artikelUrl: d.url,
      artikelTitel: d.title, herkunft: "manueller-originalvergleich", gelesenAm: "2026-11-14T03:00:00Z",
      absatzPosition: 1, text: passage },
      modernBlocked = await U.understandOneCluster(c, w.deps, { vorgangId: id, existing: pending,
        vertrag: v, artikelkontextVersuch: kontext });
    A.equal(modernBlocked.status, "skipped-ausgang-unbekannt"); A.equal(claims.length, 2);
    A.ok(claims.every(x => x.vorgangId === id), "Auch geaenderter Kontextprompt bleibt im gesperrten CAS-Subject");
    A.deepEqual(w.prompts, []); A.deepEqual(w.gespeichert, []);
  });
  await test("Belegte Themen erreichen native Fachueberschneidung fuer fiktives MdB und MdL ohne neue Schwellen", () => {
    // Bestehende kuenstliche Profile; fuer den zweiten Fall allein die deklarierte
    // Parlamentsebene des fiktiven Gegenprofils variieren, keine echten Personen.
    const mdb = structuredClone(testPoliticianOne), mdl = { ...structuredClone(testPoliticianTwo),
      parliamentType: "Landtag", politicalLevel: "Land", function: "Landtagsabgeordnete", role: "Landtagsabgeordnete" },
      pflege = "Die Pflegeversicherung steht im Mittelpunkt des veröffentlichten Berichts.",
      d = doc("rd-pflege", pflege), tarif = assemble({ ...raw(), ...beleg() }),
      koPflege = assemble({ ...raw(), was_ist_passiert: pflege,
        ...beleg("Pflegeversicherung", d.id, pflege) }, cluster(d));
    const features = (p, ko) => M.matchProfileToKnowledgeObjects(p, [ko], { limit: 1 })[0]?.matched_features || [];
    A.ok(features(mdb, tarif).some(x => x.type === "thema" && /tarifbindung/i.test(x.value)));
    A.equal(features(mdl, tarif).some(x => x.type === "thema"), false);
    A.ok(features(mdl, koPflege).some(x => x.type === "thema" && /pflegeversicherung/i.test(x.value)));
    A.equal(features(mdb, { ...tarif, tags: [] }).some(x => x.type === "thema"), false);
    A.ok(features(mdl, koPflege).every(x => x.type !== "ausschuss"));
    const D = require("../lib/helmut/decisions");
    A.equal(D.decisionFromScore(39), "Ignorieren"); A.equal(D.decisionFromScore(40), "Beobachten");
    A.equal(D.decisionFromScore(60), "Sofort reagieren");
  });
  A.deepEqual(forbidden, []); A.equal(count, 8);
  console.log(count + "/8 neue Fachthemen-Gruppen bestanden; keine alten Suiten oder echten Modell-/Datenzugriffe.");
})().catch(e => { console.error(e); process.exitCode = 1; });
