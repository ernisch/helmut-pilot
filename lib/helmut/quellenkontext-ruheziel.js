"use strict";

// Explizite Auswahl fuer eine Quellenreparatur. Kein Aktivierungsrecht, kein
// Schreiben und kein implizites Ableiten realer Profile aus aktiven Konten.
const D = require("./testkohorte-direkt500");
function pruefe(s, auswahl, version = 1) {
  D.fordere(version === 1 || version === 2, "quellenkontext-bestandsversion-ungueltig");
  D.pruefeSnapshot(s, version === 2 ? "500-bereinigt-ruhend" : "500-ruhend");
  D.fordere(Array.isArray(auswahl) && auswahl.length === 5
    && auswahl.every(id => typeof id === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(id))
    && new Set(auswahl).size === 5, "quellenkontext-bestandsauswahl-ungueltig");
  const synthetisch = new Set(D.ALLE_KENNUNGEN);
  D.fordere(auswahl.every(id => !synthetisch.has(id)
    && s.mandate.some(m => m.user_id === id) && s.identitaeten.some(p => p.id === id)),
  "quellenkontext-bestandsauswahl-fremd");
  const ids = [...auswahl, ...D.ALLE_KENNUNGEN].sort();
  const ausserhalb = s.mandate.map(m => m.user_id).filter(id => !ids.includes(id)).sort();
  D.fordere(ids.length === 500 && ausserhalb.length === (version === 2 ? 0 : 4), "quellenkontext-ruhe-zielmenge-abweichend");
  return { ids, ausserhalb, zielHash: D.hash(ids) };
}
function ausUmgebung(s, value) {
  D.fordere(typeof value === "string" && value.length > 0 && value.length <= 1200,
    "quellenkontext-bestandsauswahl-fehlt");
  let ids;
  try { ids = JSON.parse(value); } catch { D.fordere(false, "quellenkontext-bestandsauswahl-ungueltig"); }
  return pruefe(s, ids);
}
module.exports = { pruefe, ausUmgebung };
