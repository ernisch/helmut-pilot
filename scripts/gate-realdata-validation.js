"use strict";

// Production-Daten-Shadow-Abgleich (Phase A): laesst das ECHTE JS-Gate (understanding-gate.js)
// ueber eine REALE, read-only aus Production gezogene Stichprobe laufen und vergleicht mit der
// SQL-Spiegel-Entscheidung, mit der die Gegenmatrix + kritischen Fehler ueber die GESAMTE
// Population gemessen wurden. Zweck: nachweisen, dass der SQL-Spiegel das JS-Gate korrekt
// abbildet (Instrument-Validierung) — und dass Abweichungen NUR in die SICHERE Richtung gehen
// (JS inklusiver: verstehen/zurueckstellen statt parken), NIE in die kritische (JS parkt, was
// der Spiegel behalten wuerde). REINE LOGIK, kein Netz/DB.

const G = require("../lib/helmut/quellenarchitektur/understanding-gate");
const SAMPLE = require("../test/fixtures/gate/realdata-sample.js");
const NOW = Date.parse("2026-07-14T12:00:00Z");
const RANK = { verstehen: 3, zurueckstellen: 2, parken: 1, hygiene: 0, unveraendert: 2 };

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

let gleich = 0, sicherer = 0, kritisch = 0;
const abweichungen = [];
for (const row of SAMPLE) {
  const js = G.assessDocument(row, { now: NOW }).decision;
  const sql = row.sqlgate;
  if (js === sql) { gleich += 1; continue; }
  const richtung = RANK[js] > RANK[sql] ? "sicherer(JS inklusiver)" : "KRITISCH(JS restriktiver)";
  if (RANK[js] > RANK[sql]) sicherer += 1; else { kritisch += 1; }
  abweichungen.push({ id: row.id, sql, js, richtung, titel: row.title.slice(0, 60) });
}

console.log(`\nStichprobe n=${SAMPLE.length}: identisch=${gleich}  sicher-abweichend=${sicherer}  KRITISCH-abweichend=${kritisch}`);
for (const a of abweichungen) console.log(`  ~ ${a.id} sql=${a.sql} js=${a.js} [${a.richtung}] · ${a.titel}`);

// Verbindlich: KEINE kritische Abweichung (JS darf nie parken, was der Spiegel behalten wuerde).
check("Keine KRITISCHE Abweichung (JS parkt nie, was der Spiegel behalten wuerde)", kritisch === 0);
// Uebereinstimmung hoch (>= 85 %), Rest nur sichere Richtung.
check("Uebereinstimmung >= 85% (Rest nur sichere Richtung)", (gleich / SAMPLE.length) >= 0.85);
// Alle amtlichen (Dokumentart/-plenum) -> verstehen (nie geparkt).
const amtlich = SAMPLE.filter((r) => r.document_type || /-plenum$/.test(r.source_id));
check("alle amtlichen Stichproben -> verstehen", amtlich.every((r) => G.assessDocument(r, { now: NOW }).decision === "verstehen"));

console.log(`\n== Gate Realdata-Abgleich: ${fail === 0 ? "BESTANDEN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
