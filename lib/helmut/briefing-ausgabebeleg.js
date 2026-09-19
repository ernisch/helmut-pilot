"use strict";

// Bindet die Morgenquittung an den gesamten gespeicherten Briefinginhalt.
// Eine spaeter angehaengte Lage aendert diesen Inhalt nicht. Kein Fachurteil.
const { isDeepStrictEqual } = require("node:util");
const B = require("./briefing-speicher");
function ausPaket(row) {
  const p = row?.payload;
  if (!p || !/^[a-f0-9]{64}$/.test(p.profilHash || "")) throw new Error("morgen-ausgabebeleg-fehlt");
  B.pruefeZeile(row, { userId: p.mandat, day: p.tag, id: row.id });
  return { version: 1, mandat: p.mandat, tag: p.tag, paketId: row.id,
    profilHash: p.profilHash, briefingHash: B.hash(p.briefing) };
}
function passt(beleg, row) {
  try { return isDeepStrictEqual(beleg, ausPaket(row)); } catch { return false; }
}
module.exports = { ausPaket, passt };
