"use strict";
const a = require("node:assert/strict");
const { bauePlan } = require("./500-themenplan");
const { baueKohorte } = require("../lib/helmut/test-kohorte-500");
const { STAENDIGE_AUSSCHUESSE: rollen } = require("../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse");
// Aktuelle Kohorte: alle 495 auf Bundestag umgestellt, vorhandene Rollenrotation.
const profiles = baueKohorte().map((p, i) => ({ ...p, parliamentType: "Bundestag", profileActive: false,
  committee: rollen[i % 24].name, committees: [rollen[i % 24].name, rollen[(i + 5) % 24].name] }));
for (let i = 0; i < 5; i++) profiles.push({ id: `bestand-${i}`, profileActive: false,
  focusTopics: ["Persoenliches Thema"], extra: { erhalten: true } });
const vorher = JSON.stringify(profiles), plan = bauePlan(profiles);
a.equal(JSON.stringify(profiles), vorher);
a.equal(JSON.stringify(bauePlan(profiles)), JSON.stringify(plan));
a.equal(plan.zahlen.geaendert, 495);
a.equal(plan.luecken.length, 123);
a.equal(plan.abgeleitet.filter(p => p.id.startsWith("test-kohorte-") && !p.focusTopics.length).length, 0);
for (let i = 0; i < 500; i++) {
  if (i >= 495) a.deepEqual(plan.abgeleitet[i], profiles[i]);
  else { const { focusTopics: alt, ...restAlt } = profiles[i];
    const { focusTopics: neu, ...restNeu } = plan.abgeleitet[i]; a.deepEqual(restNeu, restAlt); }
}
// Unabhaengige fachliche Erwartungen: keine bloße Wiederholung der Implementierung.
const themen = key => plan.rollen.find(r => r.key === key).topics;
a.deepEqual(themen("landwirtschaft-ernaehrung-heimat"), ["Ernährung und Landwirtschaft"]);
a.deepEqual(themen("menschenrechte-humanitaere-hilfe"), ["Menschenrechte"]);
a.deepEqual(themen("bildung-familie-senioren-frauen-jugend"), ["Bildung", "Familie"]);
a.deepEqual(themen("wirtschaft-energie"), ["Wirtschaft"]);
a.deepEqual(themen("recht-verbraucherschutz"), ["Recht"]);
a.deepEqual(themen("forschung-technologie-raumfahrt"), []);
function rejects(change) { const p = structuredClone(profiles); change(p); a.throws(() => bauePlan(p)); }
rejects(p => p.pop()); rejects(p => p.push(p[0])); rejects(p => p[0].id = p[1].id);
rejects(p => p[0].id = "test-kohorte-a-999"); rejects(p => p[499].id = "test-mdb-fremd");
rejects(p => p[0].profileActive = true); rejects(p => delete p[0].profileActive);
rejects(p => p[499].active = true); rejects(p => p[0].geloescht_at = "2026-01-01");
rejects(p => p[0].parliamentType = "Landtag"); rejects(p => p[0].committees = "Recht");
const unbekannt = structuredClone(profiles);
unbekannt[0].committee = "Ausschuss fuer erfundene Wirtschaft";
unbekannt[0].committees = [unbekannt[0].committee];
const luecke = bauePlan(unbekannt);
a.deepEqual(luecke.abgeleitet[0].focusTopics, []);
a(luecke.luecken.some(l => l.id === profiles[0].id && l.grund === "unbekannter-ausschuss"));
a(luecke.luecken.some(l => l.id === profiles[0].id && l.grund === "kein-profilthema"));
a.notEqual(luecke.eingabeHash, plan.eingabeHash);
plan.abgeleitet[499].extra.erhalten = false; a.equal(profiles[499].extra.erhalten, true);
console.log("PASS: Themenplan, 500 Profildifferenzen, unabhaengige Fachfaelle, Luecken und Eingabesicherungen");
