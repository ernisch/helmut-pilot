"use strict";
const assert = require("node:assert/strict");
const { relevanteBetriebsDokumente } = require("../lib/helmut/scheduler");
const profile = { id: "mdb-fictional", fullName: "Fiktive Abgeordnete", profileActive: true,
  party: "Fiktive Partei", focusTopics: ["Pflege", "Mindestlohn"], committees: ["Arbeit und Soziales"] };
const items = [
  { id: "pflege", url: "https://example.invalid/pflege", title: "Pflege: Bundesregierung plant Reform der ambulanten Versorgung",
    content: "Der Ausschuss Arbeit und Soziales beraet den Gesetzentwurf zur Pflege.", publishedAt: "2026-11-05T12:00:00Z" },
  { id: "sport", url: "https://example.invalid/sport", title: "Tennisturnier auf dem Centre Court",
    content: "Die Spielerin gewinnt das Finale in drei Saetzen.", publishedAt: "2026-11-05T12:00:00Z" }
];
// Echte Rohquellen-Relevanz: vor KI-Klassifizierung liegen weder KO-tags noch
// policy_field vor. Relevante Quellen duerfen dadurch nicht unsichtbar werden.
assert.deepEqual(relevanteBetriebsDokumente(items, profile).map(item => item.id), ["pflege"]);
assert.deepEqual(relevanteBetriebsDokumente(items, { ...profile, profileActive: false }), []);
assert.deepEqual(relevanteBetriebsDokumente(items, { ...profile, deletedAt: "2026-11-01T00:00:00Z" }), []);
assert.deepEqual(relevanteBetriebsDokumente([], profile), []);
console.log("PASS: echte Quellencluster behalten Profilrelevanz; fremde/deaktivierte Eingaben ausgeschlossen (0 Netz/KI)");
