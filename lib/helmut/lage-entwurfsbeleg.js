"use strict";

// Private, unveraenderliche Arbeitsbelege des ausdruecklich gestarteten
// Fehlstellenlaufs. Kein auslieferbarer Text und kein Bestandteil der App.
const { isDeepStrictEqual } = require("node:util");
const { hash, profilHash } = require("./briefing-speicher");
const { berlinTagKey } = require("./briefing-frische");
const SLOT = "lage-pruefentwurf";
function fordere(ok) { if (!ok) throw new Error("lage-entwurfsbeleg-nicht-bestaetigt"); }
function baue({ userId, runId, phase, antwort, quellen, profile, fortgesetztAus = null, now = new Date() }) {
  fordere(typeof userId === "string" && userId.length > 0 && userId.length <= 200
    && /^nachlauf500-[0-9]{5,20}$/.test(runId || "") && ["entwurf", "pruefung"].includes(phase));
  const raw = JSON.stringify(antwort);
  fordere(antwort && typeof antwort === "object" && !Array.isArray(antwort)
    && typeof raw === "string" && raw.length <= 24000 && Array.isArray(quellen)
    && JSON.stringify(quellen).length <= 17000 && profile?.id === userId);
  const day = berlinTagKey(now);
  const inhalt = { version: 1, runId, phase, tag: day, profilHash: profilHash(profile),
    quellen, antwort: JSON.parse(raw), auslieferbar: false, qualitaetBestanden: false };
  if (fortgesetztAus) {
    fordere(typeof fortgesetztAus.id === "string" && fortgesetztAus.id.startsWith(`bf-${userId}-${SLOT}-${day}-`)
      && /^[a-f0-9]{64}$/.test(fortgesetztAus.inhaltHash || ""));
    inhalt.fortgesetztAus = { id: fortgesetztAus.id, inhaltHash: fortgesetztAus.inhaltHash };
  }
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
// Der Aufrufer hat einen beendeten Zeitstopp VOR dem Review belegt. Andere
// Fehlerklassen, verlorene Anbieterantworten und abgeschlossene Reviews sind
// keine Fortsetzungskandidaten. Alte Belege bleiben unveraendert.
async function leseFortsetzung({ userId, runId, quellen, profile, now = new Date() }, storage = require("./storage")) {
  require("./storage").assertTenant(userId, "lageEntwurfFortsetzen");
  fordere(/^nachlauf500-[0-9]{5,20}$/.test(runId || "") && profile?.id === userId);
  const day = berlinTagKey(now), prefix = `bf-${userId}-${SLOT}-${day}-${runId}-`;
  const [entry, review] = await Promise.all([
    storage.getLageEntwurfsbeleg(userId, prefix + "entwurf"),
    storage.getLageEntwurfsbeleg(userId, prefix + "pruefung")
  ]);
  fordere(!review);
  if (!entry) return null; // Die Zeitgrenze kann schon vor dem Entwurf greifen.
  const p = entry.payload, { inhaltHash, ...inhalt } = p || {};
  fordere(entry.id === prefix + "entwurf" && entry.user_id === userId && entry.slot === SLOT
    && Number.isFinite(Date.parse(entry.generated_at)) && Date.parse(entry.generated_at) <= now.getTime()
    && berlinTagKey(new Date(entry.generated_at)) === day
    && p?.version === 1 && p.runId === runId && p.phase === "entwurf" && p.tag === day
    && p.auslieferbar === false && p.qualitaetBestanden === false && inhaltHash === hash(inhalt)
    && p.antwort && typeof p.antwort === "object" && !Array.isArray(p.antwort)
    && JSON.stringify(p.antwort).length <= 24000 && Array.isArray(p.quellen)
    && JSON.stringify(p.quellen).length <= 17000 && /^[a-f0-9]{64}$/.test(p.profilHash || ""));
  if (p.profilHash !== profilHash(profile) || !isDeepStrictEqual(p.quellen, quellen)) return null;
  return { antwort: structuredClone(p.antwort), id: entry.id, inhaltHash };
}
module.exports = { SLOT, baue, speichere, leseFortsetzung };
