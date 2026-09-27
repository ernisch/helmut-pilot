"use strict";

const assert = require("assert/strict");
const z = require("../lib/helmut/profil-zulassung");
const imp = require("../lib/helmut/profil-import");
const validation = require("../lib/helmut/profile-validation");
const readiness = require("../lib/helmut/profile-readiness");
const provisioning = require("../lib/helmut/provisioning");
const storage = require("../lib/helmut/storage");
const scheduler = require("../lib/helmut/scheduler");
let checks = 0;
const check = (ok) => { assert.ok(ok); checks++; };

(async () => {
  // Ausschliesslich synthetische Negativfaelle. Keine AfD-Zielprofile anlegen.
  for (const value of ["AfD", "AFD", "Alternative für Deutschland", "Alternative fuer Deutschland",
    "AfD-Fraktion", "AfD-Bundestagsfraktion", "Fraktion der AfD", "AfD (Bundestag 2025 - 2029)"]) {
    for (const field of ["party", "partei", "faction", "fraktion"]) check(z.istAusgeschlossen({ [field]: value }));
  }
  for (const party of ["SPD", "CDU", "CSU", "CDU/CSU", "Bündnis 90/Die Grünen", "Die Linke", "FDP", "BSW", "Freie Wähler", "fraktionslos"]) {
    check(!z.istAusgeschlossen({ party, focusTopics: ["AfD beobachten"], opponents: ["AfD"], role: "ehemals AfD" }));
  }
  check(!z.istAusgeschlossen(null));
  check(z.istAusgeschlossen({ party: "AfD", faction: "Fraktionslos", fraktionslos: true }));
  check(z.istAusgeschlossen({ party: "SPD", partei: "AfD" }));
  check(z.istAusgeschlossen({ party: ["SPD", "AfD"] }));
  check(z.istAusgeschlossen({ faction: "fraktionslos / AfD" }));
  for (const parliamentType of ["Bundestag", "Landtag"]) {
    const p = { id: "synthetischer-negativfall", fullName: "Synthetischer Negativfall", party: "AfD",
      faction: "AfD", parliamentType, state: "Berlin", committees: ["Ausschuss für Sport"], profileActive: true };
    const v = validation.validateProfile(p);
    check(validation.isDisabled(p) && !v.usable && !v.ready && !Object.values(v.impact).some(Boolean));
    check(!readiness.pruefeNeuaktivierung({ ...p, profileActive: false }).zulaessig);
    check(provisioning.validateSpec({ ...p, name: p.fullName }).includes(z.GRUND));
    assert.throws(() => provisioning.buildProfile(p, { aktiv: false }), { code: "profil-zielgruppe-ausgeschlossen" }); checks++;
    const im = { mandatsId: p.id, vollname: p.fullName, partei: "AfD", parlament: parliamentType === "Bundestag" ? "bundestag" : "landtag-berlin",
      bundesland: "Berlin", wahlkreis: "Synthetischer Wahlkreis", ausschuesse: p.committees,
      offizielleQuellen: [{ art: "parlament-profil", url: parliamentType === "Bundestag" ? "https://www.bundestag.de/SYNTHETISCH/profil" : "https://www.parlament-berlin.de/SYNTHETISCH/profil" }], aktiv: false };
    check(imp.pruefeProfil(im).fehler.some(e => e.code === "profil-zielgruppe-ausgeschlossen"));
    assert.throws(() => imp.zuHelmutProfil(im), { code: "profil-zielgruppe-ausgeschlossen" }); checks++;
    let writes = 0;
    await assert.rejects(storage.saveProfile(p), { code: "profil-zielgruppe-ausgeschlossen" }); checks++;
    await assert.rejects(storage.saveProfileToDb(p, { strict: true, upsert: async () => writes++ }), { code: "profil-zielgruppe-ausgeschlossen" }); checks++;
    check(writes === 0);
    check((await scheduler.getSourcesForProfile(p)).length === 0);
    assert.throws(() => scheduler.filterRelevantItemsForProfile([], p), { code: "profil-zielgruppe-ausgeschlossen" }); checks++;
  }
  console.log(`PASS ${checks}: Zulassung, Import, Speicherung, Aktivierung und Verarbeitung gesperrt; Nachrichtenthemen bleiben unberuehrt.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
