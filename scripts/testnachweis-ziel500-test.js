"use strict";
const A = require("node:assert/strict"), Z = require("../lib/helmut/testnachweis-ziel500");
const F = require("./fixtures/nachweis-null500");
const rows = [...F.manifest.ids, ...F.manifest.ausserhalb].map(user_id => ({ user_id, aktiv: false }));
const q = Z.pruefeQuittung([F.zeile("beendet")], F.manifest.laufId);
A.deepEqual(Z.auswahl(rows, q), F.manifest.ids);
for (const r of rows) r.aktiv = true;
A.deepEqual(Z.auswahl(rows, q), F.manifest.ids);
for (const mutation of [r => r.pop(), r => { r[0].user_id = "fremd"; },
  r => { r[0].user_id = r[1].user_id; }, r => { r[0].aktiv = "false"; }]) {
  const r = structuredClone(rows); mutation(r); A.throws(() => Z.auswahl(r, q));
}
for (const mutation of [r => { r.id += "fremd"; }, r => { r.data.manifest.ids[0] = "fremd"; },
  r => { r.data.manifest.ausserhalb[0] = r.data.manifest.ids[0]; },
  r => { r.data.manifest.zielHash = "f".repeat(64); }, r => { r.data.zustand = "geplant"; },
  r => { r.data.bestaetigtAktiv = 499; }, r => { r.data.aktiviertAm = r.data.manifest.startBis; },
  r => { r.data.beendetAm = "2026-09-18T12:00:00Z"; }, r => { r.data.deaktiviert = 501; }]) {
  const r = F.zeile("beendet"); mutation(r); A.throws(() => Z.pruefeQuittung([r], F.manifest.laufId));
}
A.throws(() => Z.pruefeQuittung([], F.manifest.laufId));
A.throws(() => Z.pruefeQuittung([F.zeile(), F.zeile()], F.manifest.laufId));
Z.gleich(q, structuredClone(q));
A.throws(() => Z.gleich(q, F.zeile().data));
console.log("4/4 Zielgruppen: gespeicherte exakte500 unabhaengig von Aktivitaet, fremde/beschaedigte Auswahl und wechselnde Quittung abgewiesen.");
