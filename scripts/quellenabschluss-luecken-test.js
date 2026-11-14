"use strict";
// Neue Uebergabe vom abgeschlossenen Fehlertraeger zur ehrlichen Kundenausgabe.
const A = require("node:assert/strict"), V = require("../lib/helmut/quellen-versorgungsstand"),
  B = require("../lib/helmut/briefingContract"), S = require("../lib/helmut/briefing-speicher");
const { testPoliticianOne, testPoliticianTwo } = require("./fixtures/test-profiles");
const now = new Date("2026-11-14T07:00:00Z"), calls = [];
global.fetch = () => { throw Error("Netz verboten"); };
const env = { HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SCALABLE_PIPELINE: "on" };
async function supply(stand, mandat = "synthetischer-abschluss") {
  return V.lese({ mandat, jetztMs: now.getTime(), env, deps: {
    planungsrest: { lesen: async () => ({ zustand: "fertig" }) },
    offeneVorbedingungen: async args => { calls.push(args); return stand; }
  } });
}
function state(versorgung, profile = testPoliticianOne) {
  return B.buildCurrentHelmutState({ profile, tenantId: profile.id, now, versorgung });
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Abgeschlossene Einzelfehler erklaeren Versorgungsluecke ohne Ruhe oder Vollfreigabe", async () => {
    const v = await supply({ verfuegbar: true, offen: 0, fehlgeschlagen: 2 }), current = state(v);
    A.deepEqual(v, { version: 1, zustand: "offen", verarbeitungBeendet: true });
    A.equal(current.emptyState.kind, "gap"); A.equal(current.emptyState.headline, "Quellenlage mit Lücken");
    A.match(current.emptyState.detail, /Verarbeitungslauf ist beendet/); A.match(current.emptyState.detail, /nicht belegt/);
    const dto = B.toBriefingContractV3({ profile: testPoliticianOne, now, versorgung: v });
    const check = S.pruefeInhalt(dto, null);
    A.equal(check.strukturellVollstaendig, false); A.ok(check.fehler.includes("quellenversorgung-unvollstaendig"));
    A.equal(current.primaryItem, null); A.equal(JSON.stringify(v).includes("fehlgeschlagen"), false);
  });
  await test("Offene Nachbarn behalten laufenden Zustand trotz schon abgeschlossener Fehler", async () => {
    const v = await supply({ verfuegbar: true, offen: 1, fehlgeschlagen: 2 }), current = state(v);
    A.deepEqual(v, { version: 1, zustand: "offen" });
    A.match(current.emptyState.detail, /noch nicht abgeschlossen/);
    A.equal(current.emptyState.headline, "Quellenlage noch nicht ausreichend ausgewertet");
  });
  await test("Unklare oder ungueltige Zaehler erlauben keinen behaupteten Abschluss", async () => {
    for (const stand of [{ verfuegbar: false, offen: 0, fehlgeschlagen: 1 },
      { verfuegbar: true, offen: -1, fehlgeschlagen: 1 }, { verfuegbar: true, offen: 0, fehlgeschlagen: null }]) {
      const v = await supply(stand); A.deepEqual(v, { version: 1, zustand: "unbekannt" });
      A.match(state(v).emptyState.detail, /nicht bestätigt/);
    }
    const v = await V.lese({ mandat: "synthetischer-abschluss", jetztMs: now.getTime(), env,
      deps: { planungsrest: { lesen: async () => { throw Error("Speicher unbekannt"); } } } });
    A.deepEqual(v, { version: 1, zustand: "unbekannt" });
    A.equal(state({ version: 99, zustand: "offen", verarbeitungBeendet: true }).versorgung.verarbeitungBeendet, undefined);
  });
  await test("Getrennte Mandate behalten eigene IDs und sehen keine fremden Fehlerdaten", async () => {
    for (const profile of [testPoliticianOne, testPoliticianTwo]) {
      const v = await supply({ verfuegbar: true, offen: 0, fehlgeschlagen: 3 }, profile.id), s = state(v, profile);
      A.equal(calls.at(-1).mandat, profile.id); A.equal(s.profileId, profile.id); A.equal(s.tenantId, profile.id);
      A.deepEqual(s.versorgung, v); A.equal(Object.keys(s.versorgung).length, 3);
    }
    const v = await supply({ verfuegbar: true, offen: 0, fehlgeschlagen: 0 });
    A.deepEqual(v, { version: 1, zustand: "kein-bekannter-rueckstand" });
  });
  A.equal(count, 4);
  console.log("4/4 neue Quellenabschluss-/Gapgruppen bestanden; keine alten Pruefungen oder Produktionszugriffe.");
})().catch(e => { console.error(e); process.exitCode = 1; });
