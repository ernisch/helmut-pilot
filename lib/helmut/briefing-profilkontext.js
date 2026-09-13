"use strict";

// Enger Uebergang 1 -> 2. Historische Originalzeile bleibt unveraendert.
const { isDeepStrictEqual } = require("node:util");
const { berlinTagKey } = require("./briefing-frische");
const fordere = ok => { if (!ok) throw new Error("briefing-profilkontext-abweichend"); };
function kennung(userId, day, profilHash) {
  require("./storage").assertTenant(userId, "briefingProfilkontextKennung");
  fordere(/^\d{4}-\d{2}-\d{2}$/.test(day || "") && /^[a-f0-9]{64}$/.test(profilHash || ""));
  return `bf-${userId}-mandatsbriefing-${day}-profil-v2-${profilHash}`;
}
function standHash(row) {
  // DB ergaenzt created_at; beide Leseprojektionen binden dieselben Nutzdaten.
  const { id, user_id, slot, generated_at, payload } = row;
  return require("./briefing-speicher").hash({ id, user_id, slot, generated_at, payload });
}
function pruefeAlt(row, { userId, day, profile }) {
  const B = require("./briefing-speicher");
  B.pruefeZeile(row, { userId, day, profile, historisch: true });
  fordere(B.profilBindungsstand(row).version === 1
    && row.payload.pruefung?.strukturellVollstaendig === false
    && B.pruefeInhalt(row.payload.briefing, row.payload.lage).strukturellVollstaendig === false
    && row.payload.profilHash !== B.profilHash(profile)
    && Number.isFinite(Date.parse(row.generated_at))
    && berlinTagKey(new Date(row.generated_at)) === day);
}
function pruefeBelegstruktur(row, alt, { userId, day, profile }) {
  const B = require("./briefing-speicher"), hash = B.profilHash(profile);
  pruefeAlt(alt, { userId, day, profile });
  B.pruefeZeile(row, { userId, day, profile, id: kennung(userId, day, hash) });
  const p = row.payload, u = p.profilkontextUebergang;
  fordere(p.profilHashVersion === 2 && u?.version === 1 && u.vorgaengerId === alt.id
    && u.vorgaengerHash === standHash(alt) && u.fachbasisHash === B.hash(u.fachbasis)
    && Number.isFinite(Date.parse(row.generated_at))
    && berlinTagKey(new Date(row.generated_at)) === day
    && Date.parse(row.generated_at) >= Date.parse(alt.generated_at)
    && p.erzeugtAm === row.generated_at
    && isDeepStrictEqual(p.pruefung, B.pruefeInhalt(p.briefing, p.lage))
    && p.pruefung.strukturellVollstaendig === true
    && require("./lage-quellenbeleg").gespeicherterTextGueltig(p.lage));
  return row;
}

function pruefeNachfolger(row, alt, { userId, day, profile }) {
  pruefeBelegstruktur(row, alt, { userId, day, profile });
  const B = require("./briefing-speicher"), p = row.payload, u = p.profilkontextUebergang;
  const fach = require("./briefing-lagebindung").pruefe(u.fachbasis, profile, userId, new Date(row.generated_at));
  fordere(fach.eingabeHash === p.lage.briefingEingabeHash
    && isDeepStrictEqual(p.briefing, u.fachbasis.briefing)
    && p.lage.koSetHash === B.hash({ ranked: fach.ranked, briefingEingabeHash: fach.eingabeHash }).slice(0, 32)
    && isDeepStrictEqual(p.lage.quellen, require("./lage-quellenbeleg").baueEingabe(
      fach.ranked, fach.sources, new Date(row.generated_at))));
  return row;
}

async function materialisiere({ profile, userId, build, briefing, aussagenEingabeHash, storage, now, fachbasis }) {
  const B = require("./briefing-speicher"), day = berlinTagKey(now);
  const alt = await storage.getRenderedBriefingV3(userId, B.SLOT, day, { strict: true });
  // Ohne betroffenen Altbestand bleibt der vorhandene strenge Normalpfad aktiv.
  if (!alt || (B.profilBindungsstand(alt).version === 2 || alt.payload?.profilHash === B.profilHash(profile)))
    return B.materialisiere({ profile, userId, build, briefing, aussagenEingabeHash, storage, now });
  pruefeAlt(alt, { userId, day, profile });
  fordere(Date.parse(alt.generated_at) <= now.getTime());
  // JSONB speichert keine undefined Objektschluessel. Den tatsaechlichen
  // Speichervertrag vor dem Vergleich bilden; Hashvertraege bleiben gleich.
  fachbasis = JSON.parse(JSON.stringify(fachbasis));
  briefing = JSON.parse(JSON.stringify(briefing));
  const fach = require("./briefing-lagebindung").pruefe(fachbasis, profile, userId, now);
  fordere(aussagenEingabeHash === fach.eingabeHash && isDeepStrictEqual(briefing, fachbasis.briefing));
  const text = await storage.getRenderedBriefingV3(userId, "lage", day, { strict: true });
  fordere(text?.id === `bf-${userId}-lage-${day}` && text.user_id === userId && text.slot === "lage"
    && text.payload?.briefingEingabeHash === fach.eingabeHash);
  const generatedAt = now.toISOString(), lage = JSON.parse(JSON.stringify(text.payload));
  const payload = { version: B.VERSION, mandat: userId, tag: day, profilHash: B.profilHash(profile),
    profilHashVersion: 2, briefing: structuredClone(briefing), lage,
    inhaltHash: B.hash({ briefing, lage }), pruefung: B.pruefeInhalt(briefing, lage), erzeugtAm: generatedAt,
    profilkontextUebergang: { version: 1, vorgaengerId: alt.id, vorgaengerHash: standHash(alt), fachbasisHash: B.hash(fachbasis), fachbasis } };
  const entry = { id: kennung(userId, day, payload.profilHash), user_id: userId,
    slot: B.SLOT, generated_at: generatedAt, payload };
  pruefeNachfolger(entry, alt, { userId, day, profile });
  const vorhanden = await storage.getRenderedBriefingV3(userId, B.SLOT, day,
    { strict: true, profilHash: payload.profilHash });
  const inhalt = row => { const { erzeugtAm, ...rest } = row.payload; return rest; };
  if (vorhanden) {
    pruefeNachfolger(vorhanden, alt, { userId, day, profile });
    fordere(isDeepStrictEqual(inhalt(vorhanden), inhalt(entry)));
  }
  // Vorgaenger nochmals lesen; keine transaktionsuebergreifende Sperre behaupten.
  const frisch = await storage.getRenderedBriefingV3(userId, B.SLOT, day, { strict: true });
  fordere(frisch && standHash(frisch) === standHash(alt));
  let saved = { saved: false, reason: "existing-result" };
  if (!vorhanden) saved = await storage.insertRenderedBriefingV3(entry);
  fordere(saved?.saved === true || saved?.reason === "existing-result");
  // Unbekannter Schreibausgang wird geworfen, niemals automatisch wiederholt.
  const readback = await B.lese({ userId, day, profile, storage });
  fordere(readback?.id === entry.id && isDeepStrictEqual(inhalt(readback), inhalt(entry))
    && (saved.saved !== true || isDeepStrictEqual(readback.payload, entry.payload)));
  return { ok: true, gespeichert: true, bereitsVorhanden: saved.saved !== true, id: readback.id,
    vollstaendig: true, qualitaetBestanden: false };
}

function nachweisKennungGueltig(n, userId, day) {
  if (n?.id === `bf-${userId}-mandatsbriefing-${day}`) return true;
  try { return n?.profilbindung?.version === 2 && n.profilbindung.stellvertretungenImProfilhash === true
    && n.auswahl === "aktuell" && n.id === kennung(userId, day, n.profilHash)
    && n.vorgaengerId === `bf-${userId}-mandatsbriefing-${day}`; } catch { return false; }
}
module.exports = { kennung, standHash, pruefeAlt, pruefeBelegstruktur, pruefeNachfolger, materialisiere, nachweisKennungGueltig };
