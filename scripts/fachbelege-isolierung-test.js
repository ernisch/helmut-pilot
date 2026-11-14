"use strict";

// Nur neue Isolierungs-/Diagnoseinteraktionen; keine Wiederholung der bisherigen
// Fachthemen-, Parser- oder Betriebsnachweise. Kein Netz, Modell oder Datenbank.
const A = require("node:assert/strict");
if (process.argv.length !== 2) throw Error("Unbekannte Testauswahl");
const effects = [], fail = name => () => { effects.push(name); throw Error(name + " verboten"); };
global.fetch = fail("Netz"); require("node:https").request = fail("HTTPS"); require("node:http").request = fail("HTTP");
const F = require("../lib/helmut/understanding-fachthemen"), U = require("../lib/helmut/understanding"),
  C = require("../lib/helmut/verstehen-vertrag"), M = require("../lib/helmut/matching"),
  D = require("../lib/helmut/decisions"), B = require("../lib/helmut/briefingContract"),
  S = require("../lib/helmut/understanding-schema"), H = require("../lib/helmut/quellen-lektuerebeleg");
const { testPoliticianOne, testPoliticianTwo } = require("./fixtures/test-profiles");
const text = "Der synthetische Bericht untersucht die Tarifbindung der Beschäftigten.",
  rente = "Die Rente wird in einem anderen Abschnitt des synthetischen Berichts untersucht.", id = "vg-isolierte-fachbelege";
const doc = (key = "rd-fachbelege", summary = text) => ({ id: key, title: "Bericht untersucht die Tarifbindung",
  summary, source_name: "Synthetische Quelle", url: "https://example.org/original/" + key,
  published_at: "2026-11-14T08:00:00Z", retrieved_at: "2026-11-14T08:30:00Z" });
const beleg = (tag = "Tarifbindung", passage = text, quelle_id = "rd-fachbelege", feld = "auszug") =>
  ({ tag, quelle_id, feld, passage });
const raw = () => ({ headline: "Bericht untersucht die Tarifbindung", was_ist_passiert: text,
  warum_wichtig: "Der Bericht beschreibt die Tarifbindung.", wer_ist_betroffen: "Beschäftigte",
  handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.", confidence_score: 85,
  zeitdruck: "keiner", parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [] });
const mixed = bad => ({ ...raw(), tags: ["Tarifbindung", "Rente"], fachthemen_belege: [beleg(), bad || beleg("Rente")] });
const cluster = { documents: [doc()] }, prompt = U.buildUnderstandingPrompt(cluster),
  koBasis = { vorgang_id: id, ko_version: 1 };
const pruefe = (answer, p = prompt, ko = koBasis) => F.pruefe(answer, p, ko);
function publicFields(value, path = "") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    A.ok(![F.FELD, "diagnosen", "fachthemen_belege", "antwortStruktur", "passageHash", "semantischePruefung"].includes(key), path + "." + key);
    publicFields(child, path + "." + key);
  }
}
let count = 0; async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Gemischte Antwort behaelt nativen Assemble Matching Decisions und oeffentlichen DTO ohne Diagnoseleck", () => {
    const answer = mixed(), before = structuredClone(answer), ko = U.assembleKnowledgeObject(answer, cluster, id, { prompt }),
      a = structuredClone(testPoliticianOne), b = structuredClone(testPoliticianTwo),
      matchA = M.matchProfileToKnowledgeObjects(a, [ko], { limit: 1 })[0], matchB = M.matchProfileToKnowledgeObjects(b, [ko], { limit: 1 })[0];
    A.deepEqual(ko.tags, ["Tarifbindung"]); A.equal(ko.classification_confidence[F.FELD].status, "teilweise");
    A.ok(matchA.matched_features.some(x => x.type === "thema" && /tarifbindung/i.test(x.value)));
    A.equal(matchB.matched_features.some(x => x.type === "thema"), false);
    const decisionsA = D.decideForUser(a, [ko]), decisionsB = D.decideForUser(b, [ko]);
    A.ok(decisionsA[0].matched_features.some(x => x.type === "thema"));
    A.equal(decisionsB[0].matched_features.some(x => x.type === "thema"), false);
    const without = { ...ko, tags: [] }; delete without.embedding;
    A.ok(decisionsA[0].score > D.decideForUser(a, [without])[0].score);
    const dto = B.toBriefingContractV3({ profile: a, decisions: decisionsA, kosById: { [ko.id]: ko },
      sourcesByVorgang: { [id]: [doc()] }, now: new Date("2026-11-14T10:00:00Z") });
    A.equal(dto.items.length, 1); A.deepEqual(dto.items[0].matchedFeatures, decisionsA[0].matched_features); publicFields(dto);
    A.equal(ko.classification_confidence[F.FELD].semantischePruefung, "offen");
    A.equal(S.validateKnowledgeObject(ko).valid, true); A.deepEqual(answer, before);
  });
  await test("Normalisierte Zitatnaehe wird privat sichtbar und bleibt streng abgewiesen", () => {
    const q = "Der synthetische Bericht untersucht die Rente der Beschäftigten.", d = doc("rd-rente", q),
      p = U.buildUnderstandingPrompt({ documents: [doc(), d] }), bad = beleg("Rente", q.toLowerCase(), d.id), r = pruefe(mixed(bad), p),
      diag = r.nachweis.diagnosen.find(d => d.belegIndex === 1);
    A.deepEqual(r.tags, ["Tarifbindung"]); A.equal(diag.grund, "fachthemen-passage-nicht-wortgleich");
    A.equal(diag.pruefung.passageWortgleich, false); A.equal(diag.pruefung.passageNormalisiert, true);
    A.equal(diag.pruefung.ganzesTaglabel, true); A.equal(diag.eingabe.passage.hash, H.hash(bad.passage));
    A.equal(JSON.stringify(r.nachweis).includes(bad.passage), false);
    const label = pruefe({ ...raw(), tags: ["Tarifbindung", "Tarif"], fachthemen_belege: [beleg(), beleg("Tarif")] });
    A.deepEqual(label.tags, ["Tarifbindung"]); A.equal(label.nachweis.diagnosen[1].grund, "fachthemen-taglabel-fehlt");
    A.equal(label.nachweis.diagnosen[1].pruefung.passageWortgleich, true);
  });
  await test("Feld Quellenkennung Metatext und Stoertext erhalten getrennte private Ablehnungsgruende", () => {
    const meta = doc("rd-meta", "Hier finden Sie Informationen zur Rente und zur Arbeit des Ministeriums."),
      stoer = doc("rd-stoer", "Bitte aktivieren Sie JavaScript, um diesen Bericht zur Rente zu lesen."),
      p = U.buildUnderstandingPrompt({ documents: [doc(), meta, stoer] });
    for (const [bad, grund] of [[beleg("Rente", rente, "rd-ungelesen"), "fachthemen-quelle-nicht-gelesen"],
      [beleg("Rente", rente, "rd-fachbelege", "artikelkontext.text"), "fachthemen-feld-ungueltig"],
      [beleg("Rente", rente, "rd-fachbelege", "artikelkontext"), "fachthemen-feldtext-fehlt"],
      [beleg("Rente", meta.summary, meta.id), "fachthemen-institutioneller-metatext"],
      [beleg("Rente", stoer.summary, stoer.id), "fachthemen-stoertext"],
      [beleg("Rente", 17), "fachthemen-passage-ungueltig"]]) {
      const r = pruefe(mixed(bad), p); A.deepEqual(r.tags, ["Tarifbindung"]);
      A.equal(r.nachweis.diagnosen[1].grund, grund); A.equal(r.nachweis.diagnosen[0].grund, null);
    }
  });
  await test("Fehlende fremde und kaputte Einzelbelege lassen ihren gueltigen Nachbarn bestehen", () => {
    for (const bad of [null, { ...beleg("Rente"), ungeprueft: "Nicht speichern" }]) {
      const result = pruefe({ ...mixed(), fachthemen_belege: [beleg(), bad] });
      A.deepEqual(result.tags, ["Tarifbindung"]); A.equal(result.nachweis.diagnosen[1].grund, "fachthemen-belegstruktur-ungueltig");
    }
    const missing = pruefe({ ...mixed(), fachthemen_belege: [beleg()] });
    A.deepEqual(missing.tags, ["Tarifbindung"]); A.equal(missing.nachweis.diagnosen[1].grund, "fachthemen-beleg-fehlt");
    const orphan = pruefe({ tags: ["Tarifbindung"], fachthemen_belege: [beleg(), beleg("Rente")] });
    A.deepEqual(orphan.tags, ["Tarifbindung"]); A.equal(orphan.nachweis.diagnosen[1].grund, "fachthemen-tag-nicht-deklariert");
    const p = U.buildUnderstandingPrompt({ documents: [doc(), doc("rd-rente", rente)] }),
      duplicate = pruefe({ tags: ["Tarifbindung", "Rente"], fachthemen_belege: [beleg(), beleg(), beleg("Rente", rente, "rd-rente")] }, p);
    A.deepEqual(duplicate.tags, ["Rente"]); A.equal(duplicate.nachweis.diagnosen[0].grund, "fachthemen-beleg-mehrdeutig");
  });
  await test("Gueltiger Abschnittsnachbar bleibt gebunden wenn ein ungelesener Abschnitt als Beleg angeboten wird", () => {
    const d = doc("rd-lang-isoliert", (text + " ").repeat(160) + (rente + " ").repeat(140)),
      c = { documents: [d], quellenAbschnitte: { [d.id]: 0 } }, p = U.buildUnderstandingPrompt(c),
      answer = { tags: ["Tarifbindung", "Rente"], fachthemen_belege: [beleg("Tarifbindung", text, d.id), beleg("Rente", rente, d.id)] },
      r = pruefe(answer, p), proof = r.nachweis.belege[0], diag = r.nachweis.diagnosen[1],
      q = JSON.parse(p.split("\n").find(line => line.startsWith('{"quelle_id":'))), expected = H.quellenLektuereBeleg(q);
    A.deepEqual(r.tags, ["Tarifbindung"]); A.equal(proof.abschnitt.index, 0);
    A.equal(proof.quellenHash, expected.quellenHash); A.equal(proof.textstandHash, expected.textstandHash);
    A.equal(diag.pruefung.passageWortgleich, false); A.equal(diag.grund, "fachthemen-passage-nicht-wortgleich");
  });
  await test("Neue Diagnose ist begrenzt hashgebunden unveraenderlich und bewahrt keine privaten Rohwerte", () => {
    const bad = { ...beleg("Rente"), passage: "NICHT ARCHIVIEREN " + "z".repeat(600),
      quelle_id: "PRIVATE UNGEBUNDENE KENNUNG", tag: "private@example.invalid" }, answer = { ...mixed(), tags: ["Tarifbindung", bad.tag], fachthemen_belege: [beleg(), bad] },
      r = pruefe(answer), again = pruefe(structuredClone(answer)), changed = pruefe(answer, U.buildUnderstandingPrompt({ documents: [doc("rd-fachbelege", text + " Ein weiterer Satz.")] }));
    A.deepEqual(r.tags, ["Tarifbindung"]); A.equal(r.nachweis.version, 2); A.equal(r.nachweis.diagnosen[1].grund, "fachthemen-tag-ungueltig");
    for (const v of [bad.tag, bad.passage, bad.quelle_id]) A.equal(JSON.stringify(r.nachweis).includes(v), false);
    A.equal(r.nachweis.belegHash, again.nachweis.belegHash); A.notEqual(r.nachweis.belegHash, changed.nachweis.belegHash);
    A.throws(() => { r.nachweis.belege[0].passageHash = "fremd"; }, TypeError);
    A.throws(() => { r.nachweis.diagnosen[0].pruefung.passageWortgleich = false; }, TypeError);
    A.throws(() => r.tags.push("Rente"), TypeError);
    A.deepEqual(pruefe({ tags: Array(7).fill("Tarifbindung"), fachthemen_belege: [beleg()] }).tags, []);
    A.deepEqual(pruefe({ tags: ["Tarifbindung"], fachthemen_belege: Array(7).fill(beleg()) }).tags, []);
    A.ok(JSON.stringify(r.nachweis).length < 12000);
  });
  await test("Gemischtes Ergebnis passiert nativen CAS einmal und verursacht beim Duplikat keinen weiteren Aufruf", async () => {
    const calls = [], stored = [], claims = [], source = doc(), c = { documents: [source] };
    const vertrag = C.baueVertrag({ besitzer: "synthetische-isolierung", env: { HELMUT_VERSTEHEN_CAS: "true" }, deps: { speicher: {
      verstehenReserviere: async x => { claims.push(x); return { erlaubt: true, fencing: 1 }; },
      verstehenModellstart: async () => ({ ok: true }), verstehenSchreibrecht: async () => ({ ok: true }),
      verstehenSpeichere: async x => { stored.push(structuredClone(x.ko)); return { ergebnis: "gespeichert" }; },
      verstehenVormerkungLese: async () => ({ verfuegbar: true, eintraege: {} }),
      verstehenAusgangUnbekannt: fail("UNKNOWN"), verstehenFreigabe: fail("Freigabe") } } });
    const deps = { canSpend: async () => ({ allowed: true }), requestUnderstanding: async p => { calls.push(p); return mixed(); },
      save: fail("CAS-Bypass"), saveSources: async (_id, docs) => ({ saved: docs.length }), markFailed: fail("Sachstandverlust"),
      logSkip: () => {}, findVorgangCandidates: async () => [], listVorgangDocuments: async () => [source] };
    const first = await U.understandOneCluster(c, deps, { vorgangId: id, existing: null, vertrag });
    A.equal(first.status, "saved"); A.equal(stored.length, 1); A.deepEqual(stored[0].tags, ["Tarifbindung"]);
    A.equal(stored[0].classification_confidence[F.FELD].diagnosen.length, 2); A.equal(S.validateKnowledgeObject(stored[0]).valid, true);
    const second = await U.understandOneCluster(c, deps, { vorgangId: id, existing: stored[0], vertrag });
    A.equal(second.status, "duplicate"); A.equal(calls.length, 1); A.equal(claims.length, 1);
    A.equal(claims[0].eingabeHash, C.eingabeHash({ vorgangId: id, dokumente: [source] }));
  });
  await test("Fehlende leere und alte unbekannte Fachantworten werden nicht semantisch negativ umgedeutet", () => {
    for (const [answer, status] of [[{}, "fehlt"], [{ tags: [], fachthemen_belege: [] }, "leer"]]) {
      const r = pruefe(answer); A.deepEqual(r.tags, []); A.equal(r.nachweis.status, status);
      A.equal(r.nachweis.semantischePruefung, "offen"); A.deepEqual(r.nachweis.diagnosen, []);
    }
    const existing = { tags: ["Rente"], classification_confidence: { [F.FELD]: { version: 1, status: "unbelegt", grund: "fachthemen-originalpassage-fehlt" } } },
      before = structuredClone(existing), ko = U.assembleKnowledgeObject(raw(), cluster, id, { prompt, bestand: existing });
    A.deepEqual(existing, before); A.deepEqual(ko.tags, []); A.equal(ko.classification_confidence[F.FELD].status, "fehlt");
    A.equal(ko.classification_confidence[F.FELD].semantischePruefung, "offen");
  });
  A.equal(count, 8); A.deepEqual(effects, []);
  console.log("8/8 neue Fachbeleg-Isolierungsgruppen bestanden; keine alten Suiten, echten Modelle oder Produktionszugriffe.");
})().catch(e => { console.error(e); process.exitCode = 1; });
