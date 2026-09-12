"use strict";
const assert = require("node:assert/strict");
const R = require("../lib/helmut/radarState");
const now = new Date("2026-09-12T10:00:00Z");
const profile = { id: "radar-test-eins", fullName: "Alex Muster", party: "Testpartei", committees: [] };
const kos = Array.from({ length: 6 }, (_, i) => ({
  id: `k${i}`, vorgang_id: `v${i}`, display_title: `Internationaler Bericht ${i}`,
  status: "neu", understanding_status: "complete", created_at: "2026-09-11T10:00:00Z",
  source_document_count: i === 0 ? 3 : 1
}));
const sourcesByVorgang = Object.fromEntries(kos.map(k => [k.vorgang_id, [{
  id: `d${k.id}`, url: `https://example.org/bericht/${k.id}`, source_type: "media",
  title: k.display_title, published_at: "2026-09-11T10:00:00Z"
}]]));
const args = { profile, kosById: Object.fromEntries(kos.map(k => [k.id, k])), knowledgeObjects: kos,
  decisions: kos.map(k => ({ knowledge_object_id: k.id, vorgang_id: k.vorgang_id, score: 60, matched_features: [] })),
  sourcesByVorgang, now };
const before = JSON.stringify(args);
const state = R.buildCurrentRadarState(args);
assert.equal(state.dynamics.length, 1);
assert.equal(state.articles.length, 6);
assert.equal(state.anzeige.dynamics.length, 0);
assert.equal(state.anzeige.articles.length, 0);
assert.equal(state.anzeige.summary.line1, "In dieser Radaransicht werden derzeit keine zugeordneten Signale angezeigt.");
assert.equal(state.anzeige.summary.text, state.anzeige.summary.line1);
assert.equal(state.anzeige.summary.line2, "");
assert.match(state.summary.line2, /ein neues Signal/);
assert.equal(JSON.stringify(args), before, "Zusammenfassung verändert keine Auswahl oder Quelldaten");

const mentioned = { ...kos[0], mentioned_mps: [profile.fullName] };
const mentionArgs = { ...args, knowledgeObjects: [mentioned], kosById: { k0: mentioned }, decisions: [] };
const own = R.buildCurrentRadarState(mentionArgs);
assert.equal(own.anzeige.mentions.length, 1);
assert.match(own.anzeige.summary.line1, /eine direkte Erwähnung/);
assert.doesNotMatch(own.anzeige.summary.text, /keine zugeordneten Signale/);
const other = R.buildCurrentRadarState({ ...mentionArgs, profile: { ...profile, id: "radar-test-zwei", fullName: "Robin Beispiel" } });
assert.equal(other.mentions.length, 0, "Fremde Erwähnung wird nicht dem anderen Profil zugeschrieben");
assert.equal(R.buildCurrentRadarState(mentionArgs).anzeige.summary.text, own.anzeige.summary.text);

const emptyEnv = { party: [], constituency: [], committees: [] };
assert.match(R.buildSummary([], emptyEnv, [], now).text, /Im vorliegenden Datenbestand/);
const visibleSignal = R.buildSummary([], emptyEnv, [{}], now, { nurAnzeige: true });
assert.equal(visibleSignal.line1, "In dieser Radaransicht werden derzeit keine direkten Erwähnungen angezeigt.");
assert.match(visibleSignal.line2, /ein neues Signal/);
console.log("17/17 Radar Zusammenfassungsprüfungen bestanden");
