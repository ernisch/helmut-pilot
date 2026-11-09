"use strict";
// Bekannter technischer Rueckstand ist kein fachlich ruhiger Tag. Vorhandene
// Fachadapter, Materialisierung und Renderer; kein Netz und kein Modell.
const A = require("node:assert/strict");
const C = require("../lib/helmut/briefingContract");
const B = require("../lib/helmut/briefing-speicher");
const render = require("./lib/briefing-ansichten");
const now = new Date("2026-11-09T05:15:33Z");
const profile = { id: "versorgung-isoliert", fullName: "Isoliertes Fachprofil", party: "SPD",
  parliamentType: "Bundestag", focusTopics: ["Pflege"], state: "Berlin" };
const ko = { id: "ko-versorgung", vorgang_id: "vg-versorgung", understanding_status: "complete", status: "neu",
  headline: "Pflegebericht veroeffentlicht", was_ist_passiert: "Der Bericht beschreibt die Pflegeversorgung.",
  created_at: "2026-11-06T06:00:00Z", updated_at: "2026-11-06T06:00:00Z" };
const doc = { id: "rd-versorgung", title: ko.headline, url: "https://example.org/isoliert/pflegebericht",
  source_name: "Deklariertes Testmedium", published_at: "2026-11-06T03:57:13Z",
  summary: "Der Bericht beschreibt die regionale Pflegeversorgung und den bestehenden Beratungsbedarf der beteiligten Einrichtungen. Er nennt keinen bevorstehenden Verfahrensschritt." };
const decision = { knowledge_object_id: ko.id, vorgang_id: ko.vorgang_id, decision: "Ignorieren", score: 10, matched_features: [] };
const base = { profile, decisions: [decision], kosById: { [ko.id]: ko }, sourcesByVorgang: { [ko.vorgang_id]: [doc] }, now };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log("PASS " + name); }
(async () => {
  check("Ohne technische Messung bleibt der vorhandene fachliche Leerzustand erhalten", () => {
    A.equal(C.toBriefingContractV3(base).currentHelmutState.emptyState.kind, "quiet");
  });
  for (const zustand of ["offen", "unbekannt"]) check(`${zustand}: derselbe vorhandene Artikel erzeugt keine Ruhebehauptung`, () => {
    const b = C.toBriefingContractV3({ ...base, versorgung: { version: 1, zustand } });
    A.equal(b.currentHelmutState.emptyState.kind, "gap"); A.equal(b.currentHelmutState.primaryItem, null);
    A.equal(b.currentHelmutState.versorgung.zustand, zustand);
    const html = render(b, now.toISOString()).html.briefing;
    A(html.includes('data-empty-kind="gap"')); A(!html.includes("hstand-state-card--quiet"));
    A(html.includes("Quellenlage noch nicht ausreichend ausgewertet"));
  });
  check("Keine bekannten Rueckstaende behauptet keine allgemeine Vollabdeckung", () => {
    A.equal(C.toBriefingContractV3({ ...base, versorgung: { version: 1, zustand: "kein-bekannter-rueckstand" } })
      .currentHelmutState.emptyState.kind, "quiet");
    A.equal(C.toBriefingContractV3({ ...base, versorgung: { version: 9, zustand: "vollstaendig" } })
      .currentHelmutState.emptyState.kind, "gap");
  });
  check("Ein belegter Vorbereitungsauftrag bleibt trotz Rueckstand erhalten", () => {
    const d = { ...doc, summary: "Die öffentliche Beratung zur Pflegereform findet am 2026-11-11 mit den beteiligten Verbänden im Parlament statt." };
    const b = C.toBriefingContractV3({ ...base, sourcesByVorgang: { [ko.vorgang_id]: [d] }, versorgung: { version: 1, zustand: "offen" } });
    A(b.currentHelmutState.primaryItem); A.equal(b.currentHelmutState.primaryVorgangId, ko.vorgang_id);
    A.equal(b.currentHelmutState.versorgung.zustand, "offen");
  });
  const store = require("../lib/helmut/storage"), decisions = require("../lib/helmut/decisions");
  store.v3StoreReady = () => true;
  store.listKnowledgeObjects = async () => [ko];
  store.getPruefSourcesByVorgaenge = async () => ({ [ko.vorgang_id]: [doc] });
  decisions.decideForUser = () => [decision];
  const b = await require("../server").__buildV3Briefing(profile, profile.id,
    { now, versorgung: { version: 1, zustand: "offen" } });
  check("Echter Server-Lesepfad gibt den technischen Stand bis zum Fachadapter weiter", () => {
    A.equal(b.currentHelmutState.emptyState.kind, "gap"); A.equal(b.currentHelmutState.versorgung.zustand, "offen");
  });
  const rows = new Map(), storage = { assertTenant: store.assertTenant,
    getRenderedBriefingV3: async (id, slot, day) => structuredClone(rows.get(`bf-${id}-${slot}-${day}`) || null),
    insertRenderedBriefingV3: async row => { rows.set(row.id, structuredClone(row)); return { saved: true }; } };
  const r = await B.materialisiere({ profile, userId: profile.id, now, storage, briefing: b });
  const read = await B.lese({ userId: profile.id, day: "2026-11-09", profile, storage });
  check("Technische Unterversorgung bleibt gespeichert, zurueckgelesen und angezeigt unvollstaendig", () => {
    A.equal(r.gespeichert, true); A.equal(r.vollstaendig, false); A.equal(r.qualitaetBestanden, false);
    A.equal(read.payload.briefing.currentHelmutState.emptyState.kind, "gap");
    const view = render(read.payload.briefing, now.toISOString());
    A.equal(view.fachinhalt.briefing, false); A(view.html.briefing.includes('data-empty-kind="gap"'));
    A.equal(read.payload.pruefung.bestanden, false);
  });
  console.log(`${checks}/${checks} Versorgungsgruppen bestanden; keine Modellbefolgung oder Productionwirkung behauptet.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
