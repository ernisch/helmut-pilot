"use strict";

// Prozesslokaler, nicht serialisierbarer Vorschauzugang. Keine Route, kein
// Requestparameter, keine Aktivierung und kein Ersatz fuer die Produktabnahme.
const P = require("./prosa-einordnung");
const { hash } = require("./briefing-speicher");
const handles = new WeakMap();
function erzeuge({ basis, faktenPlan, bereich, entwurf, urteil }) {
  const vertrag = P.binde({ basis, faktenPlan, bereich });
  const ausgabe = vertrag.formuliere(entwurf, urteil);
  const handle = Object.freeze({});
  handles.set(handle, ausgabe);
  return handle;
}
function lese(handle, { profile, userId, tag, bereich }) {
  const out = handles.get(handle);
  if (!out || profile?.id !== userId || out.mandat !== userId || out.tag !== tag
    || out.bereich !== bereich || out.profilHash !== hash(profile))
    throw new Error("prosa-vorschau-kontext-abweichend");
  require("./storage").assertTenant(userId, "prosaVorschau");
  return { available: true, prosaVorschau: true, prosaEinordnung: structuredClone(out),
    // Alte Leser erhalten keinen erfundenen vollstaendigen Fachvertrag.
    ...(bereich === "briefing" ? { items: [] } : { paragraphs: [], vorgaenge: [] }) };
}
module.exports = { erzeuge, lese };
