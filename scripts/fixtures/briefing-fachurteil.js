"use strict";
// Ausschliesslich fiktive Vertragstestdaten. Nie als Produktionsurteil nutzen.
const F = require("../../lib/helmut/briefing-fachurteil");
const { hash } = require("../../lib/helmut/briefing-speicher");
module.exports = (result, urteil) => ({ version: F.VERSION, umfang: F.umfang(result, urteil),
  kriterien: Object.fromEntries(F.KRITERIEN.map(k => [k, { bestanden: true,
    begruendung: "Fiktives Gesamturteil fuer einen technischen Vertragstest." }])),
  quellen: result.eingabe.quellen.filter(q => result.briefing.items.some(i => i.vorgangId === q.vorgangId))
    .map(q => ({ vorgangId: q.vorgangId, documentId: q.documentId, quellenHash: hash(q),
      kontextGetragen: true, begruendung: "Fiktiver Quellentiefenbeleg fuer einen technischen Vertragstest." })) });
