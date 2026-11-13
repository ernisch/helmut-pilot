"use strict";

// Einmalige kostenpflichtige Phasen, getrennt von sichtbaren Ausgaben. Kleine,
// unveraenderliche Zeilen in der vorhandenen Briefingtabelle, kein neues Journal.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const hash = value => require("./briefing-speicher").hash(value);
const PHASEN = Object.freeze(["start", "entwurf", "pruefstart", "pruefung"]);
function unklar() { return Object.assign(Error("verarbeitung-ausgang-unklar"), { code: "LAGE_AUSGANG_UNKLAR" }); }
function eintrag({ userId, tag, eingabeHash, phase, antwort, owner, now = new Date() }) {
  if (!PHASEN.includes(phase) || !/^\d{4}-\d{2}-\d{2}$/.test(tag || "")
    || !/^[a-f0-9]{64}$/.test(eingabeHash || "") || !/^[a-f0-9-]{36}$/.test(owner || "")) throw unklar();
  if (["entwurf", "pruefung"].includes(phase)
    && (!antwort || typeof antwort !== "object" || Array.isArray(antwort))) throw unklar();
  const data = { version: 1, tag, eingabeHash, phase, owner, auslieferbar: false,
    ...(antwort === undefined ? {} : { antwort: structuredClone(antwort) }) };
  if (Buffer.byteLength(JSON.stringify(data)) > 128 * 1024) throw unklar();
  return { id: `bf-${userId}-lage-verarbeitung-${tag}-${eingabeHash}-${phase}`,
    user_id: userId, slot: "lage-verarbeitung", generated_at: new Date(now).toISOString(),
    payload: { ...data, inhaltHash: hash(data) } };
}
async function begin({ userId, tag, eingabe, now = new Date(), nurLesen = false }, storage = require("./storage")) {
  storage.assertTenant(userId, "lageVerarbeitung");
  const eingabeHash = hash(eingabe), owner = crypto.randomUUID();
  const args = { userId, tag, eingabeHash, owner, now };
  const id = phase => `bf-${userId}-lage-verarbeitung-${tag}-${eingabeHash}-${phase}`;
  const lesen = async phase => {
    const row = await storage.getLageVerarbeitungsbeleg(userId, id(phase));
    if (!row) return null;
    const { inhaltHash, ...data } = row.payload || {};
    if (row.id !== id(phase) || row.user_id !== userId || row.slot !== "lage-verarbeitung"
      || data.version !== 1 || data.tag !== tag || data.eingabeHash !== eingabeHash
      || data.phase !== phase || data.auslieferbar !== false || hash(data) !== inhaltHash) throw unklar();
    if (["entwurf", "pruefung"].includes(phase)
      && (!data.antwort || typeof data.antwort !== "object" || Array.isArray(data.antwort))) throw unklar();
    return row;
  };
  const sichern = async (phase, antwort) => {
    const entry = eintrag({ ...args, phase, antwort });
    // Auch bei verlorener Schreibantwort nur lesen, niemals blind erneut schreiben.
    try { await storage.insertLageVerarbeitungsbeleg(entry); } catch { /* unten bestaetigen */ }
    const row = await lesen(phase);
    if (!row || (antwort === undefined ? row.payload.owner !== owner
      : !isDeepStrictEqual(row.payload.antwort, antwort))) throw unklar();
    return row;
  };
  let start = await lesen("start");
  if (!start && nurLesen) return null;
  if (!start) start = await sichern("start");
  const entwurf = await lesen("entwurf"), pruefung = await lesen("pruefung");
  if (start.payload.owner !== owner && !entwurf) throw unklar();
  if (pruefung && !entwurf) throw unklar();
  if (!pruefung && await lesen("pruefstart")) throw unklar();
  let entwurfBestaetigt = Boolean(entwurf), pruefungBestaetigt = Boolean(pruefung);
  return {
    entwurf: entwurf?.payload.antwort,
    pruefung: pruefung?.payload.antwort,
    hatBestaetigtePhase: () => entwurfBestaetigt || pruefungBestaetigt,
    onDraft: async antwort => { const r = await sichern("entwurf", antwort); entwurfBestaetigt = true; return r; },
    onReview: async antwort => { const r = await sichern("pruefung", antwort); pruefungBestaetigt = true; return r; },
    beforeReview: async () => { if (!pruefung) await sichern("pruefstart"); },
    nichtGesendet: async error => {
      // Ausschliesslich der bestehende private Herkunftsbeleg der Sendeschranke,
      // niemals eine nachtraeglich gesetzte Fehlertext-/Boolean-Behauptung.
      if (!require("./ai").istInternerNichtversandBeleg(error)) return false;
      if (!pruefungBestaetigt) await storage.loeseLageVerarbeitungsstart(userId, id("pruefstart"), owner).catch(() => null);
      if (!entwurfBestaetigt) await storage.loeseLageVerarbeitungsstart(userId, id("start"), owner).catch(() => null);
      return true;
    }
  };
}
module.exports = { PHASEN, eintrag, begin };
