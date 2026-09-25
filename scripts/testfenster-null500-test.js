"use strict";
const A = require("node:assert/strict");
const N = require("../lib/helmut/testfenster-null500");
const F = require("./fixtures/null500");
let pass = 0;
function test(name, fn) { fn(); pass++; console.log("PASS " + name); }
const make = () => N.plane(F.snapshot(), F.auswahl, F.vertrag());
test("Explizite 495 plus fuenf bei 504 inaktiven Profilen, keine Schreibabhaengigkeit", () => {
  const s = F.snapshot(), vor = structuredClone(s), m = N.plane(s, F.auswahl, F.vertrag());
  A.equal(m.ids.length, 500); A.deepEqual(m.ausserhalb, ["bestand-5", "bestand-6", "bestand-7", "bestand-8"]);
  A.deepEqual(s, vor); A.equal(Object.hasOwn(N, "ausfuehren"), false);
});
test("Alte Annahme fuenf bereits aktiv wird nicht still akzeptiert", () => {
  const s = F.snapshot(); s.mandate[0].aktiv = true;
  A.throws(() => N.plane(s, F.auswahl, F.vertrag()), /geschuetzter-profilbestand/);
});
test("Fremde Auswahl, doppelte IDs, aktive synthetische Konten und Profile verweigert", () => {
  for (const ids of [F.auswahl.slice(1), [...F.auswahl.slice(1), F.auswahl[1]], [...F.auswahl.slice(1), "fremd"]])
    A.throws(() => N.plane(F.snapshot(), ids, F.vertrag()));
  for (const defekt of ["konto", "profil"]) {
    const s = F.snapshot();
    if (defekt === "konto") s.auth.users.find(u => u.politicianId.startsWith("test-kohorte-")).active = true;
    else s.mandate.find(p => p.user_id.startsWith("test-kohorte-")).aktiv = true;
    A.throws(() => N.plane(s, F.auswahl, F.vertrag()));
  }
});
test("Abgelaufene strukturelle Fenster, Tageswechsel und ungebundene Limits sind ungueltig", () => {
  for (const patch of [{ startBis: "2026-09-19T12:06:00.000Z" }, { endeAm: "2026-09-20T01:00:00.000Z" },
    { maxKostenMikroUsd: 4000001 }, { maxKostenMikroUsd: 1000000 }, { bestaetigung: "alte-freigabe" },
    { productionCommit: "main" }, { grundlinie: {} }, { extra: "$null500$" }])
    A.throws(() => N.pruefeManifest({ ...make(), ...patch }));
});
test("Leser trennt Commit, fehlenden Commit, Abschluss und unbekannten Teilzustand", () => {
  const m = make(), basis = { gesamt: 504, aktiv: 0, zielvorhanden: 500, zielaktiv: 0, ausserhalbaktiv: 0,
    ausserhalbkennungen: m.ausserhalb, quittung: null };
  A.equal(N.bewerteLesung(m, basis).zustand, "nicht-aktiviert");
  A.equal(N.bewerteLesung(m, { ...basis, aktiv: 500, zielaktiv: 500, quittung: { manifest: m, zustand: "aktiv" } }).zustand, "500-bestaetigt");
  A.equal(N.bewerteLesung(m, { ...basis, quittung: { manifest: m, zustand: "beendet" } }).zustand, "0-bestaetigt");
  for (const patch of [{ aktiv: 499, zielaktiv: 499 }, { ausserhalbaktiv: 1 }, { zielvorhanden: 499 },
    { quittung: { manifest: m, zustand: "aktiv" } }, { aktiv: "0" }, { ausserhalbkennungen: ["fremd"] },
    { quittung: { manifest: { ...m, laufId: "fremd" }, zustand: "beendet" } }]) {
    const r = N.bewerteLesung(m, { ...basis, ...patch });
    A.equal(r.zustand, "unklar"); A.equal(r.automatischeWiederholung, false); A.equal(r.teststartFreigegeben, false);
  }
});
test("Vollstaendiger vorhandener Kostenvertrag gilt auch im Planer", () => {
  for (const patch of [{ spent: 999 }, { calls: { x: { status: "unbekannt" } } }, { tarif: "fremd" },
    { frozen: "test-usd-ausgang-unklar" }, { baseline: 4000000, spent: 4000000 }]) {
    const s = F.snapshot(); Object.assign(s.auth.testKostenTage["2026-09-19"], patch);
    A.throws(() => N.plane(s, F.auswahl, F.vertrag()));
  }
});
test("Reiner Lesetext und getrennte Aktivierungs-/Endtransaktion ohne impliziten Writer", () => {
  const m = make(), lesen = N.baueSql(m, "lesen");
  A.doesNotMatch(lesen, /\b(?:insert|update|delete|do|begin|commit)\b/i);
  for (const schritt of ["aktivierung", "ende"]) {
    const sql = N.baueSql(m, schritt);
    A.equal((sql.match(/\nbegin;/g) || []).length, 1);
    A.equal((sql.match(/\ncommit;/g) || []).length, 1);
    A.doesNotMatch(sql, /\b(?:delete|truncate|alter|create)\b/i);
  }
  A.throws(() => N.baueSql(m, "schreiben"));
});
test("DB Fixture prueft Ablauf statt versehentlichem UTC Kostenwechsel", () => {
  for (const text of ["2026-09-20T00:00:00.000Z", "2026-09-20T00:01:40.000Z", "2026-09-20T23:59:59.999Z"]) {
    const zeit = new Date(text), v = F.abgelaufenerVertrag(zeit);
    const m = N.pruefeManifest({ ...make(), ...v });
    A.ok(Date.parse(m.startBis) < +zeit); A.ok(Date.parse(m.endeAm) < +zeit);
    A.equal(m.vorflugAm.slice(0, 10), m.endeAm.slice(0, 10));
  }
  for (const text of ["2026-09-20T00:00:00.000Z", "2026-09-20T00:01:40.000Z", "2026-09-20T23:58:00.000Z"]) {
    const zeit = new Date(text), v = F.liveVertrag(zeit).vertrag;
    const m = N.pruefeManifest({ ...make(), ...v });
    A.ok(Date.parse(m.vorflugAm) <= +zeit); A.ok(Date.parse(m.startBis) > +zeit);
    A.equal(m.vorflugAm.slice(0, 10), text.slice(0, 10));
    A.equal(m.endeAm.slice(0, 10), text.slice(0, 10));
  }
  const warten = F.liveVertrag(new Date("2026-09-20T23:59:59.000Z"));
  A.equal(warten.vertrag, undefined); A.equal(warten.warteMs, 1050);
  // Die Production Ablehnung eines echten Tageswechsels bleibt verbindlich.
  A.throws(() => N.pruefeManifest({ ...make(), endeAm: "2026-09-20T01:00:00.000Z" }), /null500-kostenfenster-ungueltig/);
});
test("Version2 bindet exakt500 Bestand; alte und neue Form sind nicht austauschbar", () => {
  const s = F.snapshotBereinigt(), v = { ...F.vertrag(), version: 2 }, vor = structuredClone(s);
  const m = N.plane(s, F.auswahl, v);
  A.deepEqual(s, vor); A.deepEqual(m.ausserhalb, []); A.equal(m.version, 2);
  A.throws(() => N.plane(F.snapshot(), F.auswahl, v));
  A.throws(() => N.plane(s, F.auswahl, F.vertrag()));
  A.throws(() => N.pruefeManifest({ ...m, version: 1 }));
  A.throws(() => N.pruefeManifest({ ...make(), version: 2 }));
  A.throws(() => N.plane(s, F.auswahl, { ...v, version: 3 }));
  const r = { gesamt: 500, aktiv: 500, zielvorhanden: 500, zielaktiv: 500,
    ausserhalbaktiv: 0, ausserhalbkennungen: [], quittung: { manifest: m, zustand: "aktiv" } };
  A.equal(N.bewerteLesung(m, r).zustand, "500-bestaetigt");
  A.equal(N.bewerteLesung(m, { ...r, gesamt: 504 }).zustand, "unklar");
  A.equal(N.bewerteLesung(m, { ...r, ausserhalbkennungen: null }).zustand, "unklar");
  const Z = require("../lib/helmut/testnachweis-ziel500");
  A.equal(Z.auswahl(s.mandate, r.quittung).length, 500);
  A.throws(() => Z.auswahl(F.snapshot().mandate, r.quittung));
  for (const defekt of ["real", "synthetisch", "konto"]) {
    const kaputt = structuredClone(s);
    if (defekt === "konto") kaputt.auth.users.find(u => u.politicianId.startsWith("test-kohorte-")).active = true;
    else kaputt.mandate = kaputt.mandate.filter(p => p.user_id !== (defekt === "real" ? F.auswahl[0] : "test-kohorte-c-400"));
    A.throws(() => N.plane(kaputt, F.auswahl, v));
  }
});
console.log(`${pass} PASS, 0 FAIL. PostgreSQL Transaktionsnachweis ist ein eigener Pflichtlauf.`);
