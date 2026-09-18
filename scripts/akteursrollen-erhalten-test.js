"use strict";

// Neutrale Quellen und feste Modellantworten. Geprueft wird die echte
// Nachverarbeitung bis zum injizierten Speicher, keine reale Modellbefolgung.
const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const C = require("../lib/helmut/quellenarchitektur/classification");
const M = require("../lib/helmut/matching");
const { buildClassificationPatch } = require("../lib/helmut/ko-classification-backfill");
const PAARE = [
  ["ausschuesse", "mentioned_committees", "Ausschuss für Mobilität", "committee"],
  ["ministerien", "mentioned_ministries", "Ministerium für Mobilität", "ministry"]
];
const BASIS = {
  headline: "Verein diskutiert Busangebot", display_title: "Verein diskutiert Busangebot",
  was_ist_passiert: "Ein Verein diskutiert das Busangebot.",
  display_summary: "Ein Verein diskutiert das Busangebot.",
  warum_wichtig: "Das Busangebot ist Gegenstand der Diskussion.",
  wer_ist_betroffen: "Der berichtende Verein.",
  handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.",
  zeitdruck: "keiner", confidence_score: 70, parteien: [], ausschuesse: [], ministerien: [],
  risiken: [], chancen: [], mentioned_committees: [], mentioned_ministries: []
};
function quelle(name, beteiligt) {
  return { id: "rd-rollenprobe", title: "Diskussion zum Busangebot", source_name: "Testbericht",
    summary: beteiligt ? `${name} diskutiert das Busangebot.`
      : `Ein Verein diskutiert das Busangebot. ${name} wird nur als Hintergrund genannt und ist nicht beteiligt.`,
    url: "https://example.org/rollenprobe", published_at: "2026-09-01T10:00:00Z" };
}
async function lauf(modus, antwort, dokument) {
  const gespeichert = []; let aufrufe = 0;
  const eingabe = { documents: [dokument] }, vorher = structuredClone({ eingabe, antwort });
  const bestand = { id: "ko-vg-rollenprobe", ko_version: 3, headline: "Bestand",
    decision_level: "unknown", decision_entities: [{ name: "Alter Eintrag", type: "ministry", entity_id: null }] };
  const bestandVorher = structuredClone(bestand);
  const vertrag = {
    reserviere: async () => ({ erlaubt: true, fencing: 1 }),
    modellstart: async () => ({ erlaubt: true }), schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { gespeichert.push(ko); return { gespeichert: true, pruefbar: true }; },
    ausgangUnbekannt: async () => {}, freigabe: async () => {}, freigabeOhneAufruf: async () => {},
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {}
  };
  const deps = {
    canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async () => { aufrufe++; return structuredClone(antwort); },
    save: async ko => { gespeichert.push(ko); return true; }, saveSources: async () => {},
    markFailed: async () => {}, logSkip: () => {}, modelName: () => "attrappe",
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => []
  };
  const opts = { vorgangId: "vg-rollenprobe", vertrag, existing: modus === "update" ? bestand : null };
  const r = modus === "update"
    ? await U.understandUpdate(eingabe, deps, { ...opts, neueDocs: eingabe.documents,
      neueAnker: [], spur: {}, alleDocs: eingabe.documents })
    : await U.understandOneCluster(eingabe, deps, opts);
  assert.equal(r.status, modus === "update" ? "updated" : "saved");
  assert.equal(aufrufe, 1); assert.equal(gespeichert.length, 1);
  assert.deepEqual({ eingabe, antwort }, vorher); assert.deepEqual(bestand, bestandVorher);
  return gespeichert[0];
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Blosse Erwaehnung wird in Erstverstehen und Update nicht zum handelnden Akteur", async () => {
    for (const [aktiv, erwaehnt, name, type] of PAARE) for (const modus of ["erst", "update"]) {
      const ko = await lauf(modus, { ...BASIS, [erwaehnt]: [name] }, quelle(name, false));
      assert.deepEqual(ko.decision_entities, [], "Erwaehnung darf keine Akteursrolle erzeugen");
      assert(ko.related_entities.some(e => e.name === name && e.type === type));
      assert.deepEqual(ko[aktiv], []); assert.deepEqual(ko[erwaehnt], [name]);
      assert.equal(ko.display_summary, BASIS.display_summary);
    }
  });
  await test("Tatsaechlich beteiligte Institution bleibt in beiden Speicherpfaden erhalten", async () => {
    for (const [aktiv, , name, type] of PAARE) for (const modus of ["erst", "update"]) {
      const text = `${name} diskutiert das Busangebot.`;
      const ko = await lauf(modus, { ...BASIS, [aktiv]: [name], was_ist_passiert: text,
        display_summary: text }, quelle(name, true));
      assert(ko.decision_entities.some(e => e.name === name && e.type === type));
      assert.equal(ko.related_entities.length, 0); assert.equal(ko.display_summary, text);
    }
  });
  await test("Gemischte Rollen bleiben getrennt; Eingabe und vollstaendige Nennungen bleiben erhalten", () => {
    const ko = { ausschuesse: ["Ausschuss für Wegeplanung"], ministerien: ["Ministerium für Wegeplanung"],
      mentioned_committees: [PAARE[0][2]], mentioned_ministries: [PAARE[1][2]] };
    const vorher = structuredClone(ko), r = C.classifyKnowledgeObject(ko);
    assert.deepEqual(r.decision_entities.map(e => e.name), ["Ausschuss für Wegeplanung", "Ministerium für Wegeplanung"]);
    assert.deepEqual(r.related_entities.map(e => e.name), PAARE.map(p => p[2]));
    assert.deepEqual(ko, vorher);
  });
  await test("Doppelte Nennungen bleiben dedupliziert; explizite Beteiligung wird nicht geloescht", () => {
    const name = PAARE[0][2];
    const r = C.classifyKnowledgeObject({ ausschuesse: [name, name], mentioned_committees: [name, name] });
    assert.equal(r.decision_entities.length, 1); assert.equal(r.related_entities.length, 1);
    assert.equal(r.decision_entities[0].name, name); assert.equal(r.related_entities[0].name, name);
  });
  await test("Auswerter benutzt dieselbe Rollentrennung und bewahrt positive Akteure", async () => {
    for (const [aktiv, erwaehnt, name] of PAARE) for (const beteiligt of [false, true]) {
      const r = await U.evaluateUnderstandingCase({ raw_documents: [quelle(name, beteiligt)] },
        async () => ({ ...BASIS, [beteiligt ? aktiv : erwaehnt]: [name] }));
      assert.equal(r.valid, true); assert.equal(r.ko.decision_entities.length, beteiligt ? 1 : 0);
      assert.equal(r.ko.related_entities.length, beteiligt ? 0 : 1);
    }
  });
  await test("Reine Backfillplanung erfindet keine Rolle und verliert keine Erwaehnung", () => {
    for (const [, erwaehnt, name] of PAARE) {
      const r = buildClassificationPatch({ [erwaehnt]: [name] }, { embed: () => [] });
      assert.deepEqual(r.decision_entities, []); assert.equal(r.related_entities[0].name, name);
    }
  });
  await test("Andere verwandte Akteure und leerer Fall bleiben erhalten", () => {
    assert.deepEqual(C.buildDecisionEntities({}), []); assert.deepEqual(C.buildRelatedEntities({}), []);
    const r = C.buildRelatedEntities({ mentioned_organizations: ["Verein für Busverkehr"] });
    assert.equal(r[0].name, "Verein für Busverkehr"); assert.equal(r[0].type, "organization");
  });
  await test("Ausdruecklich unbekannte Ebene und Ereignisart werden in beiden Pfaden nicht erraten", async () => {
    const name = PAARE[0][2];
    const text = `Ein Verein diskutiert das Busangebot. ${name} und das Bundeskabinett werden nur als Hintergrund genannt.`;
    for (const modus of ["erst", "update"]) {
      const ko = await lauf(modus, { ...BASIS, mentioned_committees: [name],
        was_ist_passiert: text, display_summary: text, decision_level: "unknown", event_type: "unknown" },
      { ...quelle(name, false), summary: text });
      assert.equal(ko.decision_level, "unknown", "Kein Ersatz fuer ausdrueckliche Unsicherheit");
      assert.equal(ko.political_level, "unknown"); assert.equal(ko.event_type, "unknown");
      assert.equal(ko.classification_confidence.level, "unknown");
    }
  });
  await test("Explizite Ebenen und Ereignisarten sowie geschuetzter Bestand bleiben moeglich", () => {
    for (const level of C.LEVELS) for (const event of C.EVENT_TYPES.filter(x => x !== "unknown")) {
      const r = C.classifyKnowledgeObject({}, { decision_level: level, event_type: event });
      assert.equal(r.decision_level, level); assert.equal(r.event_type, event);
    }
    const bestand = { decision_level: "kommune", classification_confidence: { level_quelle: "ki", level: "high" } };
    const vorher = structuredClone(bestand);
    const r = C.classifyKnowledgeObject({ mentioned_committees: [PAARE[0][2]] },
      { decision_level: "unknown", event_type: "unknown" }, { bestand });
    assert.equal(r.decision_level, "kommune"); assert.equal(r.classification_confidence.level_wiederverwendet, true);
    assert.deepEqual(bestand, vorher);
  });
  await test("Explizit leere betroffene Geografie wird nicht aus einer Hintergrundinstitution ersetzt", async () => {
    const text = "Ein Verein diskutiert das Busangebot. Der Berliner Senat wird nur als Hintergrund genannt.";
    for (const modus of ["erst", "update"]) {
      const ko = await lauf(modus, { ...BASIS, mentioned_organizations: ["Berliner Senat"],
        mentioned_locations: ["Berlin"], was_ist_passiert: text, display_summary: text,
        affected_geographies: [], decision_level: "unknown", event_type: "unknown" },
      { ...quelle("Berliner Senat", false), summary: text });
      assert.deepEqual(ko.affected_geographies, []);
      assert(ko.mentioned_geographies.some(g => g.name === "Berlin"));
    }
  });
  await test("Explizite betroffene Geografie, amtlicher Beleg und geschuetzter Bestand bleiben erhalten", () => {
    const r = C.classifyKnowledgeObject({}, { affected_geographies: [{ name: "Berlin" }] });
    assert(r.affected_geographies.some(g => g.name === "Berlin"));
    for (const opts of [{ strukturiert: [{ geografie: "geo-land-berlin" }] },
      { amtlich: [{ name: "Berlin" }] }, { bestand: r }]) {
      const p = C.classifyKnowledgeObject({}, { affected_geographies: [] }, opts);
      assert(p.affected_geographies.some(g => g.name === "Berlin"));
    }
  });
  await test("Auch bei fehlenden Optionalfeldern begruenden Erwaehnungslisten weder Ebene noch Ereignis", async () => {
    const antwort = { ...BASIS, mentioned_committees: ["Ausschuss für Mobilität"],
      mentioned_organizations: ["Bundeskabinett"] };
    const dokument = { ...quelle("Ausschuss für Mobilität", false),
      summary: "Ein Verein diskutiert das Busangebot. Ausschuss für Mobilität und Bundeskabinett werden nur als Hintergrund genannt." };
    for (const modus of ["erst", "update"]) {
      const r = await lauf(modus, antwort, dokument);
      assert.equal(r.decision_level, "unknown"); assert.equal(r.event_type, "unknown");
      assert(r.related_entities.some(e => e.name === "Ausschuss für Mobilität"));
    }
    const patch = buildClassificationPatch(antwort, { embed: () => [] });
    assert.equal(patch.decision_level, "unknown"); assert.equal(patch.event_type, "unknown");
    const positiv = C.classifyKnowledgeObject({ ...BASIS,
      ministerien: ["Bundesministerium für Verkehr"],
      was_ist_passiert: "Das Bundeskabinett hat einen Kabinettsbeschluss gefasst." });
    assert.equal(positiv.decision_level, "bund"); assert.equal(positiv.event_type, "kabinettsbeschluss");
  });
  await test("Erwaehnte Regionalinstitution bleibt auch ohne optionale Geografieliste nur erwaehnt", async () => {
    for (const feld of ["mentioned_committees", "mentioned_ministries", "mentioned_organizations"]) {
      const antwort = { ...BASIS, [feld]: ["Berliner Senat"] };
      for (const modus of ["erst", "update"]) {
        const r = await lauf(modus, antwort, quelle("Berliner Senat", false));
        assert.deepEqual(r.affected_geographies, []);
        assert(r.mentioned_geographies.some(g => g.name === "Berlin"));
      }
      const patch = buildClassificationPatch(antwort, { embed: () => [] });
      assert.deepEqual(patch.affected_geographies, []);
    }
    const positiv = C.classifyKnowledgeObject({ ministerien: ["Berliner Senat"] });
    assert(positiv.affected_geographies.some(g => g.name === "Berlin"));
  });
  await test("Ein fachlicher Ausschussname allein beweist keine Bundesebene", async () => {
    const name = "Ausschuss für Mobilität";
    for (const modus of ["erst", "update"]) {
      const text = `${name} diskutiert das Busangebot.`;
      const r = await lauf(modus, { ...BASIS, ausschuesse: [name],
        was_ist_passiert: text, display_summary: text }, quelle(name, true));
      assert.equal(r.decision_level, "unknown");
      assert.equal(r.decision_entities[0].name, name);
    }
    assert.equal(C.deriveDecisionLevel({ ausschuesse: [name] }).level, "unknown");
    assert.equal(C.deriveDecisionLevel({ ministerien: ["BMG"] }).level, "bund");
    assert.equal(C.deriveDecisionLevel({ ausschuesse: [name],
      headline: "Der Bundestag beschliesst einen Bericht" }).level, "bund");
  });
  await test("Themenaehnlichkeit ersetzt keine belegte Ausschussidentitaet", async () => {
    const name = "Ausschuss für Bildung des Stadtrats";
    for (const feld of ["ausschuesse", "mentioned_committees"]) for (const modus of ["erst", "update"]) {
      const r = await lauf(modus, { ...BASIS, [feld]: [name], decision_level: "unknown" }, quelle(name, feld === "ausschuesse"));
      const e = (feld === "ausschuesse" ? r.decision_entities : r.related_entities)[0];
      assert.equal(e.name, name); assert.equal(e.entity_id, null);
      assert.deepEqual(r[feld], [name]);
    }
    assert.equal(C.resolveEntity("Arbeit und Soziales", "committee").entity_id, "committee-bt-arbeit-soziales");
    assert.equal(C.resolveEntity("Haushaltsausschuss", "committee").entity_id, "committee-bt-haushalt");
    assert.equal(C.resolveEntity("Ausschuss für Bildung und Forschung", "committee").entity_id, "committee-bt-bildung");
    const kurz = C.resolveEntity("Ausschuss für Bildung", "committee");
    assert.equal(kurz.name, "Ausschuss für Bildung"); assert.equal(kurz.entity_id, null);
  });
  await test("Erwaehnter Fachausschuss begruendet kein Sachgebiet; belegtes Fachgebiet bleibt moeglich", async () => {
    for (const modus of ["erst", "update"]) {
      const r = await lauf(modus, { ...BASIS, mentioned_committees: ["Finanzausschuss"] }, quelle("Finanzausschuss", false));
      assert.deepEqual(M.derivePolicyFields(r), []);
      assert.deepEqual(M.knowledgeObjectFeatures(r).topics, []);
      assert.deepEqual(r.mentioned_committees, ["Finanzausschuss"]);
    }
    assert.deepEqual(M.derivePolicyFields({ ausschuesse: ["Finanzausschuss"] }), ["Finanzen"]);
    assert.deepEqual(M.knowledgeObjectFeatures({ tags: ["Busverkehr"],
      mentioned_committees: ["Finanzausschuss"] }).topics, ["Busverkehr"]);
  });
  console.log(`${pass}/${pass} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
