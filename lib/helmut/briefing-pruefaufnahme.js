"use strict";
const A = require("node:assert/strict");
const { hash } = require("./briefing-speicher");
const { berlinTagKey } = require("./briefing-frische");

// Vom bereits Cron-geschuetzten GET aufgerufen, vor jedem Account-Vorlauf.
// Inaktive Kohorte oder der ausdruecklich gebundene Cem-Radar-Nachweis.
// Keinerlei Writer oder Modellfunktion; Cron-Authentisierung bleibt zwingend.
async function erfasse({ userId, tag, expectedCommit, commit, production, storage, build, leseLage, now = () => new Date() }) {
  A.equal(production, true);
  A.match(commit || "", /^[a-f0-9]{40}$/);
  A.equal(expectedCommit, commit);
  A(require("./testkohorte-betrieb").istKohortenKennung(userId) || userId === "cem-ince");
  const start = now();
  A.equal(tag, berlinTagKey(start));
  const profile = await storage.getProfile(userId);
  A.equal(profile?.id, userId); A.equal(profile.profileActive, false);
  const result = await build(profile, userId, { aussagenEingabe: true, now: start });
  A.equal(result?.eingabe?.mandat, userId); A.equal(result.eingabe.tag, tag);
  A(result.korrekturBasis && Array.isArray(result.korrekturBasis.kos));
  // Fuer die konkrete Cem-Bereichsabnahme dieselbe lesende Lage-Auswahl wie
  // beim App-Start aufnehmen. Getrennt vom Aussagenvertrag: dessen Hash darf
  // durch eine nachtraeglich angehaengte Ansicht nicht ungueltig werden.
  // cacheOnly darf weder einen fehlenden Text erzeugen noch einen Lock nehmen.
  let lageAnsicht;
  if (userId === "cem-ince") {
    A.equal(typeof leseLage, "function");
    lageAnsicht = await leseLage(profile, { politicianId: userId, cacheOnly: true });
    A(lageAnsicht && lageAnsicht.demo === false
      && Array.isArray(lageAnsicht.vorgaenge) && Array.isArray(lageAnsicht.paragraphs));
  }
  A.equal(hash(await storage.getProfile(userId)), hash(profile));
  A.equal(berlinTagKey(now()), tag);
  return { version: 1, art: "production-briefing-eingabe", productionCommit: commit,
    erfasstAm: start.toISOString(), reinLesend: true, modellaufrufe: 0,
    transaktionalerSnapshot: false, fachlicheFreigabe: false, profile, result,
    ...(lageAnsicht ? { lageAnsicht, gespeichertesGesamtpaket: false } : {}) };
}
module.exports = { erfasse };
