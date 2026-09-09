"use strict";

// Private, unveraenderliche Arbeitsbelege des ausdruecklich gestarteten
// Fehlstellenlaufs. Kein auslieferbarer Text und kein Bestandteil der App.
const { isDeepStrictEqual } = require("node:util");
const { hash, profilHash } = require("./briefing-speicher");
const { berlinTagKey } = require("./briefing-frische");
const SLOT = "lage-pruefentwurf";
function fordere(ok) { if (!ok) throw new Error("lage-entwurfsbeleg-nicht-bestaetigt"); }
function baue({ userId, runId, phase, antwort, quellen, profile, now = new Date() }) {
  fordere(typeof userId === "string" && userId.length > 0 && userId.length <= 200
    && /^nachlauf500-[0-9]{5,20}$/.test(runId || "") && ["entwurf", "pruefung"].includes(phase));
  const raw = JSON.stringify(antwort);
  fordere(antwort && typeof antwort === "object" && !Array.isArray(antwort)
    && typeof raw === "string" && raw.length <= 24000 && Array.isArray(quellen)
    && JSON.stringify(quellen).length <= 17000 && profile?.id === userId);
  const day = berlinTagKey(now);
  const inhalt = { version: 1, runId, phase, tag: day, profilHash: profilHash(profile),
    quellen, antwort: JSON.parse(raw), auslieferbar: false, qualitaetBestanden: false };
  return { id: `bf-${userId}-${SLOT}-${day}-${runId}-${phase}`, user_id: userId,
    slot: SLOT, generated_at: new Date(now).toISOString(), payload: { ...inhalt, inhaltHash: hash(inhalt) } };
}
async function speichere(args, storage = require("./storage")) {
  try {
    const entry = baue(args);
    // Unbekannter Ausgang wird nicht wiederholt. Der exakte immutable Beleg
    // bleibt spaeter durch den Betreiber unter Mandat und Lauf unabhaengig lesbar.
    const saved = await storage.insertLageEntwurfsbeleg(entry);
    fordere(saved?.saved === true || saved?.reason === "existing-result");
    const readback = await storage.getLageEntwurfsbeleg(entry.user_id, entry.id);
    fordere(readback?.id === entry.id && readback.user_id === entry.user_id
      && readback.slot === SLOT && isDeepStrictEqual(readback.payload, entry.payload));
    return { gespeichert: true };
  } catch { throw new Error("lage-entwurfsbeleg-nicht-bestaetigt"); }
}
module.exports = { SLOT, baue, speichere };
