"use strict";
const { vertrag } = require("./null500");
const D = require("../../lib/helmut/testkohorte-direkt500");
const N = require("../../lib/helmut/testfenster-null500");
const ids = [...D.ALLE_KENNUNGEN, ...Array.from({ length: 5 }, (_, i) => "mandat-fixture-" + i)].sort();
const ausserhalb = Array.from({ length: 4 }, (_, i) => "mandat-fixture-" + (i + 5));
const manifest = { ...vertrag(), version: 1, ids, ausserhalb, zielHash: D.hash(ids) };
function zeile(zustand = "aktiv") {
  return { id: N.PREFIX + manifest.laufId, data: { manifest: structuredClone(manifest),
    zustand, aktiviertAm: "2026-09-19T12:00:15.000Z", bestaetigtAktiv: 500,
    ...(zustand === "beendet" ? { beendetAm: "2026-09-19T12:10:00.000Z", deaktiviert: 500 } : {}) } };
}
module.exports = { manifest, zeile };
