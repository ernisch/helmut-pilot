"use strict";
// Ausschliesslich synthetische lokale Zeilen. Kein Production Bestand.
const { welt } = require("./direkt500");
const { baueKohorte } = require("../../lib/helmut/test-kohorte-500");
const P = require("../../lib/helmut/provisioning");
const S = require("../../lib/helmut/storage");
const N = require("../../lib/helmut/testfenster-null500");
function snapshot() {
  const w = welt(), s = w.snapshot();
  for (const spec of baueKohorte().slice(20)) {
    const p = P.buildProfile(spec, { aktiv: false });
    s.mandate.push({ user_id: spec.id, ...S.toMandateProfileRow(p) });
    s.identitaeten.push({ id: spec.id, name: spec.name, email: spec.email });
    s.auth.users.push({ id: "konto-" + spec.id, politicianId: spec.id, name: spec.name,
      email: spec.email, role: "abgeordneter", active: false });
  }
  s.mandate.forEach(p => { p.aktiv = false; });
  s.auth.testKostenTage = { "2026-09-19": kostentag("2026-09-19") };
  return s;
}
function kostentag(day) {
  return { version: 1, day, tarif: "azure-gpt5-mini-obergrenze-20260909", limit: 4000000,
    spent: 1000, baseline: 1000, baselineCalls: 0, manualCalls: 0, manualUntil: null,
    frozen: null, calls: {} };
}
function snapshotBereinigt() {
  const s = snapshot(), entfernt = new Set(["bestand-5", "bestand-6", "bestand-7", "bestand-8"]);
  s.mandate = s.mandate.filter(p => !entfernt.has(p.user_id));
  s.identitaeten = s.identitaeten.filter(p => !entfernt.has(p.id));
  // Drei verbleibende aktive Bestandskonten; die synthetischen Konten bleiben inaktiv.
  s.auth.users = s.auth.users.filter(u => u.active || u.politicianId.startsWith("test-kohorte-"));
  return s;
}
const auswahl = Array.from({ length: 5 }, (_, i) => "bestand-" + i);
function vertrag(zeit = new Date("2026-09-19T12:00:00.000Z")) {
  return { laufId: "00000000-0000-4000-8000-000000000001", productionCommit: "a".repeat(40),
    vorflugAm: zeit.toISOString(), startBis: new Date(+zeit + 60000).toISOString(),
    endeAm: new Date(+zeit + 10 * 60000).toISOString(), maxKostenMikroUsd: 4000000,
    grundlinie: Object.fromEntries(["profile", "identitaeten", "auth", "main"].map(k => [k, "a".repeat(64)])),
    bestaetigung: N.FREIGABE };
}
// Reale DB Zeit bleibt unveraendert. Nur die synthetischen Testfenster
// muessen innerhalb eines UTC Kostentags liegen, auch nahe Mitternacht.
function liveVertrag(zeit = new Date()) {
  const dayStart = Date.parse(zeit.toISOString().slice(0, 10) + "T00:00:00.000Z");
  const dayEnd = dayStart + 86400000;
  // Der positive Start braucht seinen echten Spielraum. In der letzten
  // Minute wartet ausschliesslich die lokale Fixture auf den Tageswechsel.
  if (dayEnd - +zeit <= 61000) return { warteMs: dayEnd - +zeit + 50 };
  const v = vertrag(new Date(Math.max(dayStart, +zeit - 1000)));
  v.endeAm = new Date(Math.min(Date.parse(v.endeAm), dayEnd - 1)).toISOString();
  return { vertrag: v };
}
function abgelaufenerVertrag(zeit = new Date()) {
  const dayStart = Date.parse(zeit.toISOString().slice(0, 10) + "T00:00:00.000Z");
  return vertrag(new Date(dayStart - 12 * 3600000));
}
module.exports = { snapshot, snapshotBereinigt, auswahl, vertrag, kostentag, liveVertrag, abgelaufenerVertrag };
