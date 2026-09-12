"use strict";

// Fiktive Vertragstestdaten. Keine Artikelabrufe oder fachlichen Freigaben.
const A = require("node:assert/strict");
const Q = require("../lib/helmut/briefing-aussagenbindung");
const F = require("../lib/helmut/briefing-fachurteil");
const makeGesamt = require("./fixtures/briefing-fachurteil");

function fixture() {
  const docs = ["a", "b"].map(id => ({ id: "rd-" + id,
    title: "Fiktive Etatberatung " + id,
    summary: "Fiktiver Beleg zur Beratung eines Ressortetats " + id + ".",
    url: "https://www.bundestag.de/dokumente/etat-test-12345" + id }));
  return { profile: { id: "reihenfolge-test", fullName: "Alex Beispiel",
    committees: ["Haushaltsausschuss"] }, userId: "reihenfolge-test", day: "2026-09-12",
  kos: docs.map((d, i) => ({ id: "ko-" + i, vorgang_id: "vg-" + i })),
  sourcesByVorgang: Object.fromEntries(docs.map((d, i) => ["vg-" + i, [d]])),
  briefing: { available: true, status: "Aktuell",
    items: docs.map((d, i) => ({ vorgangId: "vg-" + i, title: d.title,
      summary: d.summary, details: { "quote/~": d.summary }, finalScore: 50 - i })),
    currentHelmutState: { primaryVorgangId: "vg-0", status: "ready" } } };
}

// Simuliert eine andere JSON Serialisierung: nur Objektschluessel, keine Arrays umordnen.
function andereSchluesselfolge(value) {
  if (Array.isArray(value)) return value.map(andereSchluesselfolge);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .reverse().map(([k, v]) => [k, andereSchluesselfolge(v)]));
  return value;
}
function urteil(result) {
  const e = result.eingabe;
  const u = { version: Q.VERSION, eingabeHash: e.eingabeHash, ursprungHash: e.eingabeHash,
    ausgelasseneVorgaenge: [], aussagen: e.aussagen.map(a => {
      const q = e.quellen.find(q => q.vorgangId === a.vorgangId);
      return { ...a, sachlichGetragen: true, kontextGetragen: true, mandatsbezugGetragen: true,
        begruendung: "Fiktives Fachurteil fuer den unveraenderten technischen Testkontext.",
        belege: [{ vorgangId: q.vorgangId, documentId: q.documentId, feld: "auszug", text: q.auszug }] };
    }) };
  u.gesamtpruefung = makeGesamt(result, u);
  return u;
}
const build = data => ({ briefing: data.briefing, eingabe: Q.baueEingabe(data) });
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }

test("JSON Schluesselumordnung erhaelt Eingabe und beide gebundenen Urteile", () => {
  const data = fixture(), before = JSON.stringify(data), original = build(data), u = urteil(original);
  const reordered = andereSchluesselfolge(JSON.parse(before));
  A.notEqual(JSON.stringify(reordered), before);
  const next = build(reordered);
  A.deepEqual(next.eingabe, original.eingabe);
  A.equal(JSON.stringify(data), before, "Eingabe darf nicht mutiert werden");
  A.equal(next.eingabe.aussagen.length, 6);
  A(next.eingabe.aussagen.some(a => a.pfad === "/items/0/details/quote~1~0"));
  A.equal(Q.pruefe(next.eingabe, u).bereit, true);
  A.equal(F.pruefe(next, u).bereit, true);
});
for (const [name, change] of [
  ["Text", d => { d.briefing.items[0].summary += " Neuer Inhalt."; }],
  ["Neuer Textpfad", d => { d.briefing.items[0].neu = "Zusaetzlicher Inhalt"; }],
  ["Quellenauszug", d => { d.sourcesByVorgang["vg-0"][0].summary += " Nachtrag."; }],
  ["Quellenadresse", d => { d.sourcesByVorgang["vg-0"][0].url += "/nachtrag"; }],
  ["Profil", d => { d.profile.committees = ["Innenausschuss"]; }],
  ["Auswahl", d => { d.briefing.items.pop(); }],
  ["Kartenreihenfolge", d => { d.briefing.items.reverse(); }],
  ["Rangwert", d => { d.briefing.items[0].finalScore++; }],
  ["Hauptvorgang", d => { d.briefing.currentHelmutState.primaryVorgangId = "vg-1"; }],
  ["Status", d => { d.briefing.status = "Veraltet"; }]
]) test(name + " macht bisherige Einzel und Gesamtbindung ungueltig", () => {
  const data = fixture(), original = build(data), u = urteil(original);
  change(data); const next = build(data);
  A.notEqual(next.eingabe.eingabeHash, original.eingabe.eingabeHash);
  A.equal(Q.pruefe(next.eingabe, u).grund, "briefing-aussagenpruefung-veraltet");
  A.equal(F.pruefe(next, u).grund, "briefing-gesamtpruefung-veraltet");
});
test("Negative Urteile bleiben nach JSON Umordnung negativ", () => {
  const data = fixture(), original = build(data), u = urteil(original);
  u.aussagen[0].kontextGetragen = false;
  u.gesamtpruefung.kriterien.quellentiefe.bestanden = false;
  const next = build(andereSchluesselfolge(data));
  A.equal(Q.pruefe(next.eingabe, u).grund, "briefing-aussagenpruefung-abgelehnt");
  A.equal(F.pruefe(next, u).grund, "briefing-gesamtpruefung-abgelehnt");
});
console.log(`${passed}/${passed} Gruppen zur stabilen Aussagenbindung bestanden`);
