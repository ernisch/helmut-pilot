"use strict";
const A = require("node:assert/strict");
const K = require("../lib/helmut/test-kohorte-500");
const B = require("../lib/helmut/testkohorte-bundestag");
const D = require("../lib/helmut/testkohorte-direkt500");
const F = require("./fixtures/null500");
const N = require("../lib/helmut/testfenster-null500");
const S = require("../lib/helmut/storage");
const R = require("../lib/helmut/profile-readiness");
const P = require("../lib/helmut/quellenarchitektur/profile-packages");
let pass = 0;
function test(name, fn) { fn(); pass++; console.log("PASS " + name); }
const neu = new Map(B.baueBundestagsKohorte().map(s => [s.id, s]));
function umstellen(s, anzahl = 61) {
  const ids = new Set(B.UMSTELL_IDS.slice(0, anzahl));
  for (const m of s.mandate) if (ids.has(m.user_id)) {
    m.politische_ebene = "bundestag";
    m.ausschuesse = [...neu.get(m.user_id).committees];
  }
  return s;
}
test("Genau61 Aenderungen; historische Sollmenge und434 Profile bleiben gleich", () => {
  const alt = K.baueKohorte(), vorher = structuredClone(alt), b = B.baueBundestagsKohorte();
  A.equal(B.UMSTELL_IDS.length, 61); A.equal(new Set(B.UMSTELL_IDS).size, 61);
  A.equal(b.length, 495); A.equal(b.filter(s => s.parliamentType === "Bundestag").length, 495);
  for (let i = 0; i < alt.length; i++) {
    if (alt[i].parliamentType === "Bundestag") A.deepEqual(b[i], alt[i]);
    else {
      const { parliamentType, committees, region, ...rest } = alt[i];
      const { parliamentType: np, committees: nc, constituency, ...nr } = b[i];
      A.deepEqual(nr, rest); A.equal(constituency, region);
      A.equal(new Set(nc).size, 2); A(nc.every(c => K.BUNDESTAGSAUSSCHUESSE.includes(c)));
    }
  }
  A.deepEqual(K.baueKohorte(), vorher); A.deepEqual(B.baueBundestagsKohorte(), b);
});
test("Alle495 bestehen regulaere Bundestagsreife, kein synthetischer Sonderpfad", () => {
  const s = umstellen(F.snapshot());
  for (const m of s.mandate.filter(m => neu.has(m.user_id))) {
    const p = S.fromMandateProfileRow(s.identitaeten.find(i => i.id === m.user_id), m);
    const r = R.pruefeNeuaktivierung(p); A.equal(r.zutreffend, true);
    A.equal(r.zulaessig, true, JSON.stringify({ id: m.user_id, fehler: r.fehler }));
  }
});
test("61 fehlende Landespflichtpakete fallen durch echte Ebenenumstellung weg", () => {
  const s = F.snapshot();
  A.equal(s.mandate.filter(m => P.resolveProfilePackages(m).requiredMissing.length).length, 61);
  umstellen(s);
  A.equal(s.mandate.filter(m => P.resolveProfilePackages(m).requiredMissing.length).length, 0);
});
test("Alte und vollstaendige neue Kohorte werden exakt gebunden, inklusive500er Plan", () => {
  for (const bereinigt of [false, true]) {
    const s = bereinigt ? F.snapshotBereinigt() : F.snapshot();
    const v = { ...F.vertrag(), version: bereinigt ? 2 : 1 };
    const vorher = structuredClone(s);
    const alt = N.plane(s, F.auswahl, v);
    umstellen(s); const n = N.plane(s, F.auswahl, v);
    A.deepEqual(n.ids, alt.ids); A.deepEqual(n.ausserhalb, alt.ausserhalb);
    A.deepEqual(s.identitaeten, vorher.identitaeten); A.deepEqual(s.auth, vorher.auth);
    A.deepEqual(s.mandate.filter(m => !B.UMSTELL_IDS.includes(m.user_id)),
      vorher.mandate.filter(m => !B.UMSTELL_IDS.includes(m.user_id)));
    A.equal(s.mandate.filter(m => m.aktiv).length, 0);
  }
});
test("Teilumstellung, reine Ebenenumschreibung und falsche Inhalte bleiben gesperrt", () => {
  for (const anzahl of [1, 30, 60]) A.throws(() => D.pruefeSnapshot(umstellen(F.snapshot(), anzahl), "500-ruhend"), /kohorteninhalt/);
  for (const feld of ["ausschuesse", "partei", "fachpolitische_schwerpunkte", "ki_budget_taeglich_cent"]) {
    const s = umstellen(F.snapshot()), m = s.mandate.find(m => m.user_id === B.UMSTELL_IDS[0]);
    m[feld] = Array.isArray(m[feld]) ? ["fremd"] : feld === "partei" ? "fremd" : 99;
    A.throws(() => D.pruefeSnapshot(s, "500-ruhend"), /kohorteninhalt/);
  }
  const s = F.snapshot(); for (const m of s.mandate) m.politische_ebene = "bundestag";
  A.throws(() => D.pruefeSnapshot(s, "500-ruhend"), /kohorteninhalt/);
});
test("Neue Sollmenge erlaubt weder aktive Konten noch aktive Profile vor dem Plan", () => {
  for (const art of ["konto", "profil"]) {
    const s = umstellen(F.snapshot());
    if (art === "konto") s.auth.users.find(u => u.politicianId === B.UMSTELL_IDS[0]).active = true;
    else s.mandate.find(m => m.user_id === B.UMSTELL_IDS[0]).aktiv = true;
    A.throws(() => N.plane(s, F.auswahl, F.vertrag()));
  }
});
console.log(`Bundestagskohorte: ${pass}/6 Gruppen bestanden`);
