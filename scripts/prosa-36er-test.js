"use strict";

// Gezielte Offline-Abnahme der 36er-Fixture. Kein Modellaufruf, kein Netz,
// keine Productiondaten. Geprueft werden ausschliesslich die eingefrorenen
// Faelle, ihre Bindung an den echten Faktenvertrag und die Trennung der
// Sollurteile vom Modellpayload.
const A = require("node:assert/strict");
const P = require("../lib/helmut/prosa-einordnung");
const F = require("./fixtures/prosa-36er");

let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }

test("6 Sachklassen x 3 Fallarten ergeben 18 Fachfaelle und 36 eindeutige Pfadfaelle", () => {
  const liste = F.pfadfaelle();
  A.equal(F.faelle.length, 6, "Sachklassen");
  A.equal(F.faelle.length * F.ARTEN.length, 18, "Fachfaelle");
  A.equal(liste.length, 36);
  A.equal(new Set(liste.map(f => f.id)).size, 36, "Pfadfall-IDs nicht eindeutig");
  A.equal(new Set(liste.map(f => f.klasse)).size, 6);
  for (const art of F.ARTEN) A.equal(liste.filter(f => f.art === art).length, 12, art + " nicht 12x");
  for (const b of F.BEREICHE) A.equal(liste.filter(f => f.bereich === b).length, 18, b + " nicht 18x");
});

test("jeder Pfadfall bindet an den echten Faktenvertrag (Basis-Hash stabil)", () => {
  const liste = F.pfadfaelle(), p = F.paket();
  for (const f of liste) {
    const v = P.binde({ basis: f.basis, faktenPlan: f.faktenPlan, bereich: f.bereich });
    A.equal(v.basisHash, p.basisHashes[f.id], "Basis-Hash abweichend fuer " + f.id);
  }
});

test("die drei Fallarten sind korrekt verdrahtet (Aussage im Sollentwurf)", () => {
  for (const f of F.pfadfaelle()) {
    const c = F.faelle.find(x => x.klasse === f.klasse);
    const soll = { negativ: c.negativ, positiv: c.positiv, unklar: c.unklar }[f.art];
    A.equal(f.entwurf.bloecke[0].einordnung.option, soll, f.id);
    A.equal(f.erwartet, F.erwartet(f.art));
  }
  A.equal(F.erwartet("negativ"), "nicht-akzeptiert");
  A.equal(F.erwartet("positiv"), "akzeptiert");
});

test("Sollurteile und Begruendungen liegen nicht im Modellpayload", () => {
  for (const f of F.pfadfaelle()) {
    A.equal(Object.hasOwn(f.entwurf, "erwartet"), false);
    const payload = JSON.stringify({ basis: f.basis, entwurf: f.entwurf });
    A.equal(payload.includes("nicht-akzeptiert"), false);
    A.equal(payload.includes("erwartet"), false);
  }
});

test("kein Entwurf erfindet Zahlen gegenueber den gelieferten Fakten", () => {
  for (const f of F.pfadfaelle()) {
    const bekannt = new Set(JSON.stringify(f.basis.fakten).match(/[0-9]+/g) || []);
    for (const b of f.entwurf.bloecke) {
      for (const s of Object.values(b.einordnung).filter(x => x !== null)) {
        for (const n of String(s).match(/[0-9]+/g) || []) A.equal(bekannt.has(n), true, f.id + " erfindet " + n);
      }
    }
  }
});

test("das Paket ist stabil und umfasst alle 36 Pfadfaelle", () => {
  const p1 = F.paket(), p2 = F.paket();
  A.equal(p1.paketHash, p2.paketHash, "paketHash nicht stabil (nicht eingefroren)");
  A.equal(p1.paketHash.length, 64);
  A.equal(Object.keys(p1.basisHashes).length, 36);
  A.equal(p1.faelle.length, 36);
});

test("beide Bereiche sind fuer denselben Entwurf gueltig (2 Bloecke)", () => {
  for (const f of F.pfadfaelle()) {
    const v = P.binde({ basis: f.basis, faktenPlan: f.faktenPlan, bereich: f.bereich });
    A.equal(f.entwurf.bloecke.length, 2);
    A.doesNotThrow(() => v.vorbereite(f.entwurf), f.id);
  }
});

console.log(`${count}/${count} 36er-Fixture-Tests bestanden; keine Modellabnahme, keine Productionwirkung.`);
