"use strict";

// Nachkontrolle eines bereits geschlossenen Versuchs. Keine Normalisierung,
// keine Aenderung von Sollwerten, keine Reparatur und keine Fachfreigabe.
const E = require("./aussagenabdeckung-eingang");
const FELDER = ["akteur", "handlung", "gegenstand", "aussagegrad", "zuschreibung",
  "verneinung", "adressat", "bedingung", "wirkung", "zeit", "ort", "publikationszeit", "kontext"];
const objekt = v => v && typeof v === "object" && !Array.isArray(v);
const schema = (v, keys) => objekt(v) && Object.keys(v).sort().join("|") === [...keys].sort().join("|");

function diagnostiziere(position, answer) {
  const b = E.block(position), fehler = [], quellen = [];
  const out = { version:1, position, manifestHash:b.manifestHash, fehler, quellen,
    akzeptiert:false, vollstaendigeFaktenpruefung:false, automatischeBedeutungsbewertung:false };
  if (!schema(answer,["quellen"]) || !Array.isArray(answer.quellen) || answer.quellen.length > 24) {
    fehler.push({typ:"antwortschema"}); return out;
  }
  const gesehen = new Set();
  answer.quellen.forEach((q,index) => {
    if (!schema(q,["id","beleg","aussagen"]) || typeof q.id !== "string"
      || typeof q.beleg !== "string" || !Array.isArray(q.aussagen) || q.aussagen.length > 8) {
      fehler.push({quelle:index+1,typ:"quellschema"}); return;
    }
    if (gesehen.has(q.id)) fehler.push({quelle:index+1,typ:"kennung-doppelt",id:q.id});
    gesehen.add(q.id);
    const nachId = b.faelle.find(f => f.id === q.id);
    // Wortgleicher Originaltext ist allein eine Diagnosehilfe fuer den Menschen.
    // Diese Zuordnung darf niemals als akzeptierte Kennungsreparatur dienen.
    const texte = b.faelle.filter(f => f.quelle.text === q.beleg);
    const f = nachId || (texte.length === 1 ? texte[0] : null);
    if (!nachId) fehler.push({quelle:index+1,typ:"kennung-fremd",geliefert:q.id,erwartet:f?.id || null});
    if (!f || f.quelle.text !== q.beleg) fehler.push({quelle:index+1,typ:"original-abweichend"});
    const eintrag = {quelle:index+1, geliefert:q.id, referenz:f?.id || null,
      zuordnungNurDiagnose:!nachId && !!f, originalExakt:!!f && f.quelle.text === q.beleg,
      sollAussagen:f?.referenz.length ?? null, gelieferteAussagen:q.aussagen.length,
      bedeutungsabdeckung:"nicht-automatisch-beurteilt", aussagen:[]};
    quellen.push(eintrag);
    q.aussagen.forEach((a,j) => {
      if (!schema(a,FELDER)) { fehler.push({quelle:index+1,aussage:j+1,typ:"aussageschema"}); return; }
      const belegt = [], leer = [], ungebunden = [];
      for (const feld of FELDER) {
        if (a[feld] === null) leer.push(feld);
        else if (typeof a[feld] !== "string" || !a[feld].length || !q.beleg.includes(a[feld])) {
          ungebunden.push(feld);
          fehler.push({quelle:index+1,aussage:j+1,typ:"keine-originalspanne",feld,wert:a[feld]});
        } else belegt.push(feld);
      }
      eintrag.aussagen.push({nummer:j+1,belegteFelder:belegt,leereFelder:leer,ungebundeneFelder:ungebunden});
    });
  });
  for (const f of b.faelle) {
    if (!answer.quellen.some(q => q?.id === f.id)) fehler.push({typ:"sollkennung-fehlt",id:f.id});
    if (!quellen.some(q => q.referenz === f.id && q.originalExakt)) fehler.push({typ:"original-fehlt",id:f.id});
  }
  // Die urspruengliche Pruefung bleibt unveraendert und entscheidend fuer den
  // damaligen technischen Vertrag. Auch ihr Erfolg waere keine Fachfreigabe.
  try { out.urspruenglicherVergleich = E.pruefe(position,answer); }
  catch (e) { out.urspruenglicherFehler = e.code || "ABDECKUNG_UNBEKANNT"; }
  return out;
}
module.exports = { diagnostiziere };
