"use strict";

// Lokale Gegenprobe fuer Roadmap §3.3; kein Import-/Aktivierungsweg.
// Feste Themen vor Quellenauswahl, abgeleitet aus den vorhandenen Ausschussrollen.
// Keine Nachrichten, Uhr, KI, Datenbank oder Veraenderung der Produktbewertung.
const crypto = require("node:crypto");
const { baueKohorte } = require("../lib/helmut/test-kohorte-500");
const { STAENDIGE_AUSSCHUESSE } = require("../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse");
const { POLICY_FIELD_LABELS } = require("../lib/helmut/matching");

// Exakte amtliche Kennungen, keine Teilwortsuche: Landwirtschaft ist nicht Wirtschaft,
// Menschenrechte nicht Recht. Zusammengelegter Bildungs-/Familienausschuss: beide Felder.
// Drei Rollen haben kein eigenes Feld im vorhandenen Themenvokabular: sichtbare Luecke.
const FELDER = {
  "wahlpruefung-immunitaet-geschaeftsordnung": [], "petitionen": [],
  "auswaertiges": ["auswaertiges"], "inneres-heimat": ["inneres"],
  "sport-ehrenamt": ["sport"], "recht-verbraucherschutz": ["recht"],
  "finanzen": ["finanzen"], "haushalt": ["haushalt"],
  "wirtschaft-energie": ["wirtschaft"], "landwirtschaft-ernaehrung-heimat": ["ernaehrung"],
  "arbeit-soziales": ["arbeit-und-soziales"], "verteidigung": ["verteidigung"],
  "bildung-familie-senioren-frauen-jugend": ["bildung", "familie"],
  "gesundheit": ["gesundheit"], "verkehr": ["verkehr"],
  "umwelt-klimaschutz-naturschutz-nukleare-sicherheit": ["umwelt"],
  "menschenrechte-humanitaere-hilfe": ["menschenrechte"],
  "forschung-technologie-raumfahrt": [],
  "wirtschaftliche-zusammenarbeit-entwicklung": ["entwicklung"],
  "europaeische-union": ["europa"], "digitales-staatsmodernisierung": ["digitales"],
  "kultur-medien": ["kultur"], "tourismus": ["tourismus"],
  "wohnen-stadtentwicklung-bauwesen-kommunen": ["wohnen"]
};
const assert = require("node:assert/strict");
assert.deepEqual(Object.keys(FELDER).sort(), STAENDIGE_AUSSCHUESSE.map(a => a.key).sort());
const ROLLEN = STAENDIGE_AUSSCHUESSE.map(a => ({
  key: a.key, name: a.name, beleg: a.beleg,
  topics: FELDER[a.key].map(k => { assert(POLICY_FIELD_LABELS[k]); return POLICY_FIELD_LABELS[k]; })
}));
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const kohortenIds = new Set(baueKohorte().map(p => p.id));
const rollenNachName = new Map(ROLLEN.map(r => [r.name, r]));

function bauePlan(profiles) {
  assert(Array.isArray(profiles) && profiles.length === 500, "exakt 500 Profile erforderlich");
  assert(profiles.every(p => p && typeof p.id === "string" && p.id.trim() === p.id && p.id), "Profilkennung fehlt");
  const ids = new Set(profiles.map(p => p.id));
  assert.equal(ids.size, 500, "doppelte Profilkennung");
  assert([...kohortenIds].every(id => ids.has(id)), "495 festgelegte Kohortenkennungen erforderlich");
  const reale = profiles.filter(p => !kohortenIds.has(p.id));
  assert(reale.every(p => !/^(test-|synth-|stapel-)/.test(p.id)), "unbekannte synthetische Kennung");
  for (const p of profiles) {
    assert.equal(p.profileActive, false, "explizit inaktives Profil erforderlich");
    for (const k of ["aktiv", "active"]) assert(p[k] === undefined || p[k] === false, "widerspruechlicher Aktivierungszustand");
    assert(!p.geloescht_at, "geloeschtes Profil unzulaessig");
  }
  const luecken = [], mapping = [];
  const abgeleitet = structuredClone(profiles);
  for (const p of abgeleitet) {
    if (!kohortenIds.has(p.id)) { mapping.push({ id: p.id, geaendert: false }); continue; }
    assert.equal(p.parliamentType, "Bundestag", "Themenplan gilt nur fuer die aktuelle Bundestagskohorte");
    assert(Array.isArray(p.committees) && p.committees.every(c => typeof c === "string" && c.trim()), "Ausschussliste ungueltig");
    assert(typeof p.committee === "string" && p.committee.trim(), "Hauptausschuss fehlt");
    const committees = [...new Set([p.committee, ...p.committees])];
    const topics = [];
    for (const c of committees) {
      const r = rollenNachName.get(c);
      if (!r || !r.topics.length) luecken.push({ id: p.id, ausschuss: c,
        grund: r ? "kein-kanonisches-themenfeld" : "unbekannter-ausschuss" });
      if (r) topics.push(...r.topics);
    }
    const vorher = p.focusTopics;
    p.focusTopics = [...new Set(topics)];
    if (!p.focusTopics.length) luecken.push({ id: p.id, grund: "kein-profilthema" });
    mapping.push({ id: p.id, committees, vorher, nachher: p.focusTopics,
      geaendert: JSON.stringify(vorher) !== JSON.stringify(p.focusTopics) });
  }
  return { version: "500-themenplan/1", eingabeHash: hash(profiles),
    regelHash: hash(ROLLEN), abgeleitetHash: hash(abgeleitet), rollen: structuredClone(ROLLEN),
    zahlen: { gesamt: 500, synthetisch: 495, realeUnveraendert: 5,
      geaendert: mapping.filter(m => m.geaendert).length, luecken: luecken.length },
    mapping, luecken, abgeleitet, productionWrites: 0, aktivierungsfreigabe: false };
}
module.exports = { bauePlan };
if (require.main === module) {
  try {
    assert.equal(process.argv.length, 3, "Aufruf: node scripts/lokal.js scripts/500-themenplan.js <profile.json>");
    const profiles = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
    process.stdout.write(JSON.stringify(bauePlan(profiles), null, 2) + "\n");
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
