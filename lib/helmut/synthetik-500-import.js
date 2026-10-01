"use strict";

// Enger Fiktionspfad: ausschliesslich geschlossene Generatorvarianten. Keine
// amtlichen Belege, Zulassungs-Ausnahmen oder Freigaben fuer echte Profile.
const S = require("./synthetik-500-profile");
function erzeugeZeilen(paket) {
  const meta = S.pruefePaket(paket);
  const kanonisch = S.erzeuge({ variante: meta.variante });
  const profileRows = kanonisch.profile.map(p => ({ id: p.mandatsId, name: p.vollname }));
  const mandateRows = kanonisch.profile.map(p => ({
    user_id: p.mandatsId, partei: p.partei, fraktion: p.fraktion, rolle: null,
    politische_ebene: p.parlament === "bundestag" ? "bundestag" : "landtag",
    wahlkreis: p.wahlkreis, bundesland: p.bundesland, ausschuesse: [],
    berichterstatter_themen: [], fachpolitische_schwerpunkte: [...p.themen],
    namensvarianten: [], stellvertretende_ausschuesse: [], regionale_themen: [],
    regierungsrolle: null, relevante_ministerien: [], regionale_interessen: [],
    aktiv: false, onboarding_status: "neu", profil_extras: {
      parlament: p.parlament, synthetisch: true, herkunft: p.herkunft,
      szenario: p.szenario, profilHash: S.hash(p), paketHash: meta.paketHash
    }
  }));
  return { profileRows, mandateRows };
}
function projizierteBindung(paket) {
  const meta = S.pruefePaket(paket);
  return { paketHash: meta.paketHash, idsHash: meta.idsHash, profileHash: meta.profileHash,
    erwartungenHash: meta.erwartungenHash,
    rowsHash: S.hash(erzeugeZeilen(paket)), profile: 500, mandate: 500, aktiv: 0 };
}
module.exports = { erzeugeZeilen, projizierteBindung };
