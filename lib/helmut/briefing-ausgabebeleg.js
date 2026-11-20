"use strict";

// Bestehende Belege binden den Briefinginhalt. Der regulaere Morgenlauf
// bestaetigt jetzt die gesamte Paketfassung mit ihrer tatsaechlichen Speicherzeit.
const { isDeepStrictEqual } = require("node:util");
const B = require("./briefing-speicher");
function ausPaket(row, version = 1) {
  const p = row?.payload;
  if (!p || !/^[a-f0-9]{64}$/.test(p.profilHash || "")) throw new Error("morgen-ausgabebeleg-fehlt");
  B.pruefeZeile(row, { userId: p.mandat, day: p.tag, id: row.id });
  const beleg = { version, mandat: p.mandat, tag: p.tag, paketId: row.id,
    profilHash: p.profilHash, briefingHash: B.hash(p.briefing) };
  if (version === 1) return beleg;
  const zeit = Date.parse(row.generated_at);
  if (version !== 2 || !Number.isFinite(zeit) || Date.parse(p.erzeugtAm) !== zeit)
    throw new Error("morgen-ausgabebeleg-zeit-abweichend");
  return { ...beleg, paketErzeugtAm: new Date(zeit).toISOString(), paketHash: p.inhaltHash };
}
function passt(beleg, row) {
  try { return isDeepStrictEqual(beleg, ausPaket(row, beleg?.version)); } catch { return false; }
}
function quittiert(lauf, row) {
  const zeit = Date.parse(row.generated_at);
  return zeit <= Date.parse(lauf.erzeugtAm) && Date.parse(row.payload?.erzeugtAm) === zeit
    && passt(lauf.ausgabeBeleg, row);
}
module.exports = { ausPaket, passt, quittiert };
