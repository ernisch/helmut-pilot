"use strict";
const Q = require("../../lib/helmut/lage-quellenbeleg");
function payload() {
  const quellen = [{ vorgang_id: "vg-beleg", quellenbelege: [
    { quelle_id: "q-beleg1", titel: "Bundestag beraet den Haushalt", auszug: "", url: "https://example.org/haushalt" },
    { quelle_id: "q-beleg2", titel: "Ausschuss diskutiert Rentenreform", auszug: "", url: "https://example.org/rente" }
  ] }];
  return { koSetHash: "a".repeat(32), quellenVersion: 2, quellenHash: Q.hashEingabe(quellen), quellen,
    qualitaet: { version: 1, methode: "separater-modellabgleich-und-exakte-belegstelle" },
    paragraphs: quellen[0].quellenbelege.map(q => ({ text: q.titel + ".", vorgang_ids: ["vg-beleg"],
      quellen_ids: [q.quelle_id], belegstellen: [{ quelle_id: q.quelle_id, text: q.titel }] })) };
}
module.exports = { payload };
