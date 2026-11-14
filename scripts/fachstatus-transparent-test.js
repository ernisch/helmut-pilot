"use strict";

// Neue Status-/Matchinginteraktionen; keine Wiederholung der Fachbelegannahme,
// Artikelverarbeitung oder historischen Quellenabschlussgruppen.
const A = require("node:assert/strict"), B = require("../lib/helmut/briefingContract"),
  D = require("../lib/helmut/decisions"), F = require("../lib/helmut/fachliche-einordnung"),
  scoring = require("../lib/helmut/scoring");
const { testPoliticianOne, testPoliticianTwo } = require("./fixtures/test-profiles");
if (process.argv.length !== 2) throw Error("Unbekannte Testauswahl");
const effects = [], fail = name => () => { effects.push(name); throw Error(name + " verboten"); };
global.fetch = fail("Netz"); require("node:https").request = fail("HTTPS"); require("node:http").request = fail("HTTP");
for (const key of ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "mkdir", "mkdirSync", "rename", "unlink"])
  require("node:fs")[key] = fail("Dateischreiben");
const now = new Date("2026-11-14T10:00:00Z"), fenster = { start: "2026-11-14T05:00:00Z", ende: now.toISOString() },
  komplett = { version: 1, zustand: "kein-bekannter-rueckstand" },
  profiles = [testPoliticianOne, testPoliticianTwo].map(p => ({ ...structuredClone(p), tenantId: "synthetisch-" + p.id }));
function ko(key = "offen") {
  return { id: "ko-fachstatus-" + key, vorgang_id: "vg-fachstatus-" + key, ko_version: 1,
    headline: "Eine Vorlage wurde veröffentlicht", was_ist_passiert: "Die Vorlage enthält einen neuen Sachstand.",
    warum_wichtig: "Die Bedeutung für das Mandat ist nicht bestätigt.", status: "neu", understanding_status: "complete",
    decision_level: "Bund", tags: [], policy_field: [], ausschuesse: [], mentioned_committees: [],
    parteien: [], mentioned_parties: [], mentioned_locations: [], source_document_count: 2, confidence_score: 85,
    // Keine zufaellige Hashvektor-Aehnlichkeit im Statusgegenfall; native
    // strukturierte Merkmale und ihre unveraenderten Gewichte bleiben wirksam.
    embedding: Array(256).fill(0),
    zeitdruck: "keiner", deadline: null, created_at: "2026-11-14T08:00:00Z", updated_at: "2026-11-14T09:00:00Z" };
}
function docs(k, published = "2026-11-14T08:00:00Z") {
  return [1, 2].map(i => ({ id: "rd-" + k.vorgang_id + "-" + i, title: "Neue Vorlage veröffentlicht",
    summary: "Die veröffentlichte Vorlage enthält den belegten Sachstand.", source_name: "Synthetische Quelle " + i,
    url: "https://example.org/quelle/" + k.vorgang_id + "/" + i,
    published_at: published, retrieved_at: "2026-11-14T09:30:00Z" }));
}
function input(profile, k, sources = docs(k), extra = {}) {
  return { profile, decisions: D.decideForUser(profile, [k]), kosById: { [k.id]: k },
    sourcesByVorgang: { [k.vorgang_id]: sources }, now, frischeFenster: fenster, versorgung: komplett, ...extra };
}
function gap(s, p) {
  A.equal(s.status, "empty"); A.equal(s.emptyState.kind, "gap"); A.equal(s.emptyState.headline, "Fachliche Einordnung noch offen");
  A.match(s.emptyState.detail, /keine geprüfte Ruhelage/); A.equal(s.primaryItem, null);
  A.equal(s.profileId, p.id); A.equal(s.tenantId, p.tenantId); A.equal(s.recommendation, "");
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Aktuelle ungepruefte Fachzuordnung verhindert Ruhe fuer zwei Mandate ohne Decisionaenderung", () => {
    for (const p of profiles) {
      const k = ko(), args = input(p, k), before = structuredClone(args), dto = B.toBriefingContractV3(args);
      A.equal(args.decisions.length, 1); A.equal(args.decisions[0].decision, "Ignorieren");
      A.deepEqual(args.decisions[0].matched_features, []); gap(dto.currentHelmutState, p);
      A.equal(dto.items[0].decision, "Ignorieren"); A.equal(dto.items[0].finalScore, args.decisions[0].score);
      A.equal(dto.items[0].relevance_score, args.decisions[0].score); A.equal(dto.items[0].recommendedAction, "");
      A.deepEqual(args, before);
    }
  });
  await test("Optionale private Fachbelegzustaende sind weder Irrelevanzbeweis noch oeffentliche Diagnose", () => {
    for (const p of profiles) for (const status of [null, "fehlt", "leer", "unbelegt", "teilweise", "belegt", "fremd"]) {
      const k = ko("metadaten");
      k.classification_confidence = { helmut_fachthemen: status && { version: 2, status, semantischePruefung: "offen",
        diagnosen: [{ grund: "PRIVATE_FACHDIAGNOSE", passageHash: "PRIVATE_HASH" }] } };
      const dto = B.toBriefingContractV3(input(p, k)); gap(dto.currentHelmutState, p);
      for (const secret of ["helmut_fachthemen", "PRIVATE_FACHDIAGNOSE", "PRIVATE_HASH", "semantischePruefung"])
        A.equal(JSON.stringify(dto).includes(secret), false);
    }
  });
  await test("Bestehendes Versorgungsgap behaelt seinen Text vor der neuen Fachstatuspruefung", () => {
    for (const p of profiles) for (const versorgung of [{ version: 1, zustand: "offen" },
      { version: 1, zustand: "offen", verarbeitungBeendet: true }, { version: 1, zustand: "unbekannt" }]) {
      const ohne = B.buildCurrentHelmutState({ profile: p, tenantId: p.tenantId, now, versorgung });
      const mit = B.buildCurrentHelmutState(input(p, ko(), undefined, { versorgung }));
      A.deepEqual(mit, ohne); A.equal(mit.emptyState.kind, "gap");
    }
  });
  await test("Scoringfallback mit aktuellen Originalquellen darf Unbekannt nicht als Ruhe bescheinigen", () => {
    const old = process.env.HELMUT_SCORING_MODE;
    try {
      process.env.HELMUT_SCORING_MODE = "on";
      for (const p of profiles) {
        const k = ko("fallback"), args = input(p, k, undefined, { decisions: [], kosById: {}, knowledgeObjects: [k] });
        A.equal(scoring.tabEmptyState("helmut", { kos: [k], hasRankedItems: false, now: now.getTime() }).kind, "quiet");
        gap(B.buildCurrentHelmutState(args), p);
      }
    } finally { if (old === undefined) delete process.env.HELMUT_SCORING_MODE; else process.env.HELMUT_SCORING_MODE = old; }
  });
  await test("Alte umdatierte kuenftige und widerspruechliche Artikel erzeugen keinen heutigen Fachmangel", () => {
    for (const p of profiles) {
      const k = ko("historisch"), old = docs(k, "2026-11-10T08:00:00Z"), future = docs(k, "2026-11-14T11:00:00Z"),
        invalid = docs(k, "ungueltig"), conflict = docs(k);
      conflict.push({ ...conflict[0], id: conflict[0].id + "-alias", published_at: "2026-11-10T08:00:00Z" });
      conflict[1].published_at = "2026-11-10T08:00:00Z";
      for (const d of [old, future, invalid, conflict, []]) {
        const args = input(p, k, d), before = structuredClone(args);
        A.equal(F.aktuellerFachstandOffen({ vorgaenge: [{ ko: k, docs: d }], decisions: args.decisions,
          profilId: p.id, jetzt: now, fenster }), false);
        A.notEqual(B.buildCurrentHelmutState(args).emptyState?.headline, "Fachliche Einordnung noch offen");
        A.deepEqual(args, before);
      }
    }
  });
  await test("Spaetere echte Mandatstreffer haben Vorrang ohne fachfremde Profile positiv zu machen", () => {
    const themen = ["Tarifbindung", "Gesundheit"];
    for (const [i, p] of profiles.entries()) {
      const unbekannt = ko("nebenher"), positiv = ko("positiv-" + i);
      positiv.tags = [themen[i]]; positiv.ausschuesse = [p.committee];
      const decisions = D.decideForUser(p, [unbekannt, positiv]), positive = decisions.find(d => d.knowledge_object_id === positiv.id),
        fremd = profiles[1 - i], fremdeEntscheidung = D.decideForUser(fremd, [positiv])[0];
      A.ok(positive.matched_features.some(f => f.type === "thema")); A.ok(positive.score >= 40);
      A.equal(fremdeEntscheidung.matched_features.some(f => f.type === "thema" || f.type === "ausschuss"), false);
      const args = input(p, unbekannt, undefined, { decisions, kosById: { [unbekannt.id]: unbekannt, [positiv.id]: positiv },
        sourcesByVorgang: { [unbekannt.vorgang_id]: docs(unbekannt), [positiv.vorgang_id]: docs(positiv) } });
      const dto = B.toBriefingContractV3(args);
      A.equal(dto.currentHelmutState.primaryVorgangId, positiv.vorgang_id);
      A.notEqual(dto.currentHelmutState.emptyState?.kind, "gap");
      gap(B.buildCurrentHelmutState(input(fremd, positiv)), fremd);
    }
  });
  await test("Positive Merkmale bleiben mandatsgebunden und jede neue Ausgabe bleibt rein lesend", () => {
    const k = ko("fremd");
    for (const [i, p] of profiles.entries()) {
      const args = input(p, k), fremde = { ...args.decisions[0], user_id: profiles[1 - i].id,
        matched_features: [{ type: "thema", value: "Fremdes belegtes Thema" }] };
      gap(B.buildCurrentHelmutState({ ...args, decisions: [fremde] }), p);
      const ungebunden = { ...fremde }; delete ungebunden.user_id;
      gap(B.buildCurrentHelmutState({ ...args, decisions: [ungebunden] }), p);
      for (const type of ["partei", "ausschuss", "wahlkreis", "thema"]) {
        const eigene = { ...fremde, user_id: p.id, matched_features: [{ type, value: "Bestätigtes Merkmal" }] };
        A.equal(F.aktuellerFachstandOffen({ vorgaenge: [{ ko: k, docs: docs(k) }], decisions: [eigene],
          profilId: p.id, jetzt: now, fenster }), false);
      }
    }
    A.deepEqual(effects, []);
  });
  A.equal(count, 7);
  console.log("7/7 neue Fachstatus-/Mandatsausgabegruppen bestanden; keine alten Pruefungen, Schreib-, Modell- oder Produktionszugriffe.");
})().catch(e => { console.error(e); process.exitCode = 1; });
