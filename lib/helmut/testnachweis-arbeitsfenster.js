"use strict";

// Rein lesende Freigabegrenze fuer Facharbeit innerhalb einer vorhandenen
// 0/500/0-Quittung. Keine Aktivierung, keine Fristverlaengerung, kein Modell.
const Z = require("./testnachweis-ziel500");
const { fordere, hash } = require("./testkohorte-direkt500");
const PREFIX = require("./testfenster-null500").PREFIX;

function pruefe(q, { commit, jetzt, profile, vorher } = {}) {
  fordere(q.zustand === "aktiv", "nachlauf-testfenster-nicht-aktiv");
  fordere(q.manifest.productionCommit === commit, "nachlauf-testfenster-commit-abweichend");
  const t = new Date(jetzt).getTime();
  fordere(Number.isFinite(t) && t >= Date.parse(q.aktiviertAm)
    && t < Date.parse(q.manifest.endeAm), "nachlauf-testfenster-geschlossen");
  if (vorher) fordere(hash(vorher) === hash(q), "nachlauf-testfenster-veraendert");
  const ids = Z.auswahl(profile, q);
  fordere(hash(profile.filter(p => p.aktiv).map(p => p.user_id).sort()) === hash(ids),
    "nachlauf-testfenster-ziel-abweichend");
  return q;
}

async function lese({ laufId, commit, get, jetzt, profile, vorher }) {
  if (laufId === undefined) {
    // Ein alter Auftrag darf ein neues Testfenster nicht durch Weglassen der
    // UUID umgehen. Bereits eine erhaltene neue Quittung sperrt den Altmodus.
    const rows = await get("helmut_store?select=id&id=like." + PREFIX + "*&limit=1");
    fordere(Array.isArray(rows) && rows.length === 0, "nachlauf-testfenster-id-fehlt");
    return null;
  }
  let q;
  try {
    const id = Z.schluessel(laufId);
    q = Z.pruefeQuittung(await get("helmut_store?select=id,data&id=eq." + id + "&limit=2"), laufId);
  } catch { fordere(false, "nachlauf-testfenster-unlesbar"); }
  const bestand = profile || await get("mandate_profiles?select=user_id,aktiv&order=user_id.asc&limit=505");
  // Uhrzeit erst NACH den beiden Netzlesungen nehmen, nicht vor ihnen.
  return pruefe(q, { commit, jetzt: jetzt(), profile: bestand, vorher });
}

function beleg(q) {
  return q ? { id: q.manifest.laufId, manifestHash: hash(q.manifest),
    zielHash: q.manifest.zielHash, endeAm: q.manifest.endeAm } : null;
}
module.exports = { lese, pruefe, beleg };
