"use strict";

// Explizite zweite Sollmenge fuer den Bundestagsnachweis. Der historische
// gemischte Generator bleibt unveraendert; keine Datenbank-/Aktivierungswirkung.
const K = require("./test-kohorte-500");
const ALT = K.baueKohorte();
const UMSTELL_IDS = Object.freeze(ALT.filter(s => s.parliamentType === "Landtag").map(s => s.id));

function baueBundestagsKohorte() {
  return K.baueKohorte().map((s, i) => {
    if (s.parliamentType !== "Landtag") return s;
    const { region, ...rest } = s;
    return { ...rest, parliamentType: "Bundestag", constituency: region,
      committees: [K.BUNDESTAGSAUSSCHUESSE[i % K.BUNDESTAGSAUSSCHUESSE.length],
        K.BUNDESTAGSAUSSCHUESSE[(i + 5) % K.BUNDESTAGSAUSSCHUESSE.length]] };
  });
}

module.exports = { UMSTELL_IDS, baueBundestagsKohorte };
