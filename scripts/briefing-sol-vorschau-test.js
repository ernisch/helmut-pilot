"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const B = require("../lib/helmut/briefing-speicher");
const { ausPaket } = require("../lib/helmut/briefing-ausgabebeleg");
const { buildCurrentHelmutState } = require("../lib/helmut/briefingContract");
const Fakten = require("../lib/helmut/prosa-faktenplan");
const P = require("../lib/helmut/prosa-einordnung");
const { binde } = require("../lib/helmut/briefing-sol-vorschau");
const Fixture = require("./fixtures/prosa-einordnung");

const timestamp = "2026-11-24T07:00:00.000Z";
const now = new Date(timestamp);
const tag = "2026-11-24";
const profile = { id: "synthetisch-sol", parliamentType: "Bundestag", fullName: "Alex Beispiel",
  focusTopics: ["Verkehr"], topics: ["Verkehr"] };
const vorgangId = "vg-verkehr";
const doc = { id: "quellenauszug-1", title: "Stellungnahmen zum Verkehr",
  summary: "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 24.11.2026 um 13:00 Uhr Berliner Zeit.",
  url: "https://parlament.example/stellungnahmen/verkehr", published_at: "2026-11-23T18:00:00.000Z",
  source_type: "media" };
const ko = { id: "ko-verkehr", vorgang_id: vorgangId, status: "neu", understanding_status: "complete",
  deadline: tag, display_title: doc.title, was_ist_passiert: doc.summary, updated_at: timestamp };

function eingabe() {
  const state = buildCurrentHelmutState({ profile, tenantId: profile.id, now,
    decisions: [{ knowledge_object_id: ko.id, decision: "Sofort reagieren" }],
    kosById: { [ko.id]: ko }, sourcesByVorgang: { [vorgangId]: [doc] } });
  assert.equal(state.tagesAnlass?.art, "heutige-frist");
  const payload = { version: 1, mandat: profile.id, tag, erzeugtAm: timestamp,
    profilHash: B.profilHash(profile), profilHashVersion: 2,
    briefing: { available: true, currentHelmutState: state, items: [{ vorgangId, sources: [
      { url: doc.url, title: doc.title, publishedAt: doc.published_at }
    ] }] }, lage: null };
  const paket = { id: `bf-${profile.id}-mandatsbriefing-${tag}`, user_id: profile.id,
    slot: "mandatsbriefing", generated_at: timestamp, payload };
  const quelle = { id: doc.id, vorgangId, url: doc.url, titel: doc.title,
    auszug: doc.summary, veroeffentlichtAm: doc.published_at };
  const fakt = { id: "frist", vorgangId, quelleId: quelle.id, quellenHash: B.hash(quelle),
    stelle: { feld: "auszug", von: 0, bis: quelle.auszug.length, kontextVon: 0, kontextBis: quelle.auszug.length },
    akteur: null, handlung: null, gegenstand: null, aussagegrad: null, verneinung: null,
    zuschreibung: null, bedingung: null, ereigniszeit: null, profilHash: null,
    formulierungen: { zeit: doc.summary } };
  const basis = { profile, tag, quellen: [quelle], fakten: [fakt],
    feldvertrag: [{ pfad: "/frist", zweck: "zeit", vorgangId }],
    trustedFreigaben: [{ faktId: fakt.id, faktHash: B.hash(fakt), pruefer: "synthetisch", tag,
      nachweisHash: B.hash(doc), urteil: "getragen" }] };
  const faktenPlan = { version: 1, basisHash: Fakten.binde(basis).basisHash,
    felder: [{ pfad: "/frist", faktId: fakt.id, zweck: "zeit" }] };
  const lauf = { berlinTag: tag, tenantId: profile.id, vertragVersion: 1, status: "erfolg", erzeugtAm: timestamp };
  return neuQuittieren({ paket, lauf, basis, faktenPlan });
}

function neuQuittieren(daten) {
  daten.paket.payload.inhaltHash = B.inhaltHash(daten.paket.payload);
  daten.lauf.ausgabeBeleg = ausPaket(daten.paket, 2);
  return daten;
}

const daten = eingabe();
const pilot = binde(daten);
const anfrage = pilot.entwurfsAnfrage();
assert.equal(anfrage.model, "helmut-briefing-test-sol62");
assert.deepEqual(anfrage.reasoning, { effort: "medium" });
assert.equal(anfrage.store, false);
assert.equal(anfrage.text.format.strict, true);
assert(anfrage.input.includes(doc.summary));
assert(!anfrage.input.includes(profile.id));
assert(!anfrage.input.includes(profile.fullName));
console.log("PASS Sol bekommt nur den belegten ausgewählten Vorgang mit strengem Antwortformat");

const entwurf = { bloecke: [{ faktIds: ["frist"], mandatsbezug: { feld: "schwerpunkt", wert: "Verkehr" },
  einordnung: { relevanz: "Für Ihren Schwerpunkt Verkehr eröffnet die Frist Gelegenheit zur Stellungnahme.",
    option: "Sie könnten eine schriftliche Stellungnahme vorbereiten.", risiko: null, chance: null, kommunikation: null } }] };
const eingabeFuerUrteil = P.binde({ basis: daten.basis, faktenPlan: daten.faktenPlan, bereich: "briefing" }).vorbereite(entwurf);
const urteil = Fixture.urteil(eingabeFuerUrteil);
const pruefauftrag = pilot.pruefauftrag(entwurf);
assert.equal(pruefauftrag.eingabeHash, urteil.eingabeHash);
assert(!pruefauftrag.prompt.includes(profile.id));
assert.throws(() => pilot.vorschau(entwurf, { ...urteil, eingabeHash: "fremd" }), /pruefung-abweichend/);
const handle = pilot.vorschau(entwurf, urteil);
const vorschau = require("../lib/helmut/prosa-vorschau").lese(handle, {
  profile, userId: profile.id, tag, bereich: "briefing"
});
assert.equal(vorschau.prosaVorschau, true);
assert.equal(vorschau.prosaEinordnung.pruefung.produktabnahme, false);
assert.equal(vorschau.prosaEinordnung.bloecke[0].tatsachen.saetze[0].text, doc.summary);
assert.equal(vorschau.prosaEinordnung.bloecke[0].einordnung.felder[1].text, entwurf.bloecke[0].einordnung.option);
console.log("PASS separates Urteil ist an den exakten Entwurf gebunden und erzeugt nur die Vorschau");

const ohnePrioritaet = eingabe();
ohnePrioritaet.paket.payload.briefing.currentHelmutState.primaryItem = null;
assert.throws(() => binde(neuQuittieren(ohnePrioritaet)), /tagesprioritaet-fehlt/);
const falscheQuelle = eingabe();
falscheQuelle.basis.quellen[0].auszug = "Die Frist endet um 18:00 Uhr.";
assert.throws(() => binde(falscheQuelle), /originalbelege-abweichend/);
const falscherTitel = eingabe();
falscherTitel.basis.quellen[0].titel = "Abstimmung ist abgeschlossen";
assert.throws(() => binde(falscherTitel), /originalbelege-abweichend/);
const falscherAnlass = eingabe();
falscherAnlass.paket.payload.briefing.currentHelmutState.tagesAnlass.beleg.documentId = "fremd";
assert.throws(() => binde(neuQuittieren(falscherAnlass)), /prioritaeten-abweichend/);
const andereQuittung = eingabe();
andereQuittung.lauf.ausgabeBeleg.paketHash = "fremd";
assert.throws(() => binde(andereQuittung), /morgenquittung-fehlt/);
console.log("PASS Lücke, fremder Beleg und unquittierte Fassung erzeugen keinen Sol Auftrag");

const run = spawnSync(process.execPath, [path.join(__dirname, "../lib/helmut/briefing-sol-vorschau.js"), "entwurf"],
  { input: JSON.stringify(daten), encoding: "utf8" });
assert.equal(run.status, 0, run.stderr);
assert.deepEqual(JSON.parse(run.stdout), anfrage);
console.log("PASS Bedieneraufruf erstellt dieselbe Anfrage offline");
