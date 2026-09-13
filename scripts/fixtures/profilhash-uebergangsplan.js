"use strict";

// Ausschliesslich lokaler Entwurf. Kein produktiver Leser, Writer oder Generator.
// Der Plan ist keine Freigabe und wird von keiner Anwendung importiert.
const B = require("../../lib/helmut/briefing-speicher");
const S = require("../../lib/helmut/storage");
const L = require("../../lib/helmut/briefing-lagebindung");
const { berlinTagKey } = require("../../lib/helmut/briefing-frische");
const { isDeepStrictEqual } = require("node:util");
const fordere = (ok) => { if (!ok) throw new Error("profilhash-uebergang-nicht-vorbereitet"); };

async function plane({ altbeleg, profile, userId, now, neueFachbasis = null }) {
  S.assertTenant(userId, "profilhashUebergangsplan");
  fordere(profile?.id === userId && now instanceof Date && Number.isFinite(now.getTime()));
  const day = berlinTagKey(now), alt = structuredClone(altbeleg);
  // Bestehender echter Pruefer: auch historisch bleiben Inhalt und Mandant gebunden.
  await B.lese({ userId, day, profile, historisch: true,
    storage: { assertTenant: S.assertTenant, getRenderedBriefingV3: async () => alt } });
  fordere(alt && B.profilBindungsstand(alt).version === 1
    && alt.payload.pruefung?.strukturellVollstaendig === false
    && Number.isFinite(Date.parse(alt.generated_at)) && Date.parse(alt.generated_at) <= now.getTime()
    && berlinTagKey(new Date(alt.generated_at)) === day);
  const aktuell = B.profilHash(profile);
  fordere(alt.payload.profilHash !== aktuell);
  let eingabeHash = null;
  if (neueFachbasis !== null) {
    // Nur ein gesondertes aktuelles Einzel UND Gesamturteil traegt diese Bindung.
    // Auch ein positives synthetisches Urteil ist keine reale Fachabnahme.
    eingabeHash = L.pruefe(neueFachbasis, profile, userId, now).eingabeHash;
  }
  const inhalt = { version: 1, art: "lokaler-uebergangsentwurf", userId, tag: day,
    altbeleg: { id: alt.id, standHash: B.hash(alt), profilHashVersion: 1,
      profilHash: alt.payload.profilHash, inhaltHash: alt.payload.inhaltHash },
    ziel: { id: `${alt.id}-profil-v2-${aktuell}`, slot: B.SLOT,
      profilHashVersion: 2, profilHash: aktuell, aussagenEingabeHash: eingabeHash,
      aussagenUrteilHash: neueFachbasis === null ? null : B.hash(neueFachbasis.urteil) },
    naechstesTor: eingabeHash ? "speicher-und-leser-integration-offen" : "neue-fachbindung-fehlt",
    altbelegUnveraendert: true, speicherFreigegeben: false, auslieferbar: false,
    fachlichAbgenommen: false, automatischerStart: false };
  return { ...inhalt, planHash: B.hash(inhalt) };
}

async function pruefeFrisch(plan, args) {
  const aktuell = await plane(args);
  fordere(isDeepStrictEqual(plan, aktuell));
  return aktuell;
}

module.exports = { plane, pruefeFrisch };
