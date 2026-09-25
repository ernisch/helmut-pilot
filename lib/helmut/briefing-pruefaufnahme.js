"use strict";
const A = require("node:assert/strict");
const { hash } = require("./briefing-speicher");
const { berlinTagKey } = require("./briefing-frische");

// Vom bereits Cron-geschuetzten GET aufgerufen, vor jedem Account-Vorlauf.
// Inaktive Kohorte oder der ausdruecklich gebundene Cem-Radar-Nachweis.
// Keinerlei Writer oder Modellfunktion; Cron-Authentisierung bleibt zwingend.
async function erfasse({ userId, tag, expectedCommit, commit, production, storage, build, now = () => new Date() }) {
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
  A.equal(hash(await storage.getProfile(userId)), hash(profile));
  A.equal(berlinTagKey(now()), tag);
  return { version: 1, art: "production-briefing-eingabe", productionCommit: commit,
    erfasstAm: start.toISOString(), reinLesend: true, modellaufrufe: 0,
    transaktionalerSnapshot: false, fachlicheFreigabe: false, profile, result };
}
module.exports = { erfasse };
