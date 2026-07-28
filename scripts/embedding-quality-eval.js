"use strict";

// Sprint 22B — Qualitätsauswertung Merkmalsvektor vs. semantisches Embedding
// gegen den festen Goldstandard (scripts/fixtures/embedding-testset-22b.json).
//
// Rein offline: liest ausschließlich die Fixture (und optional eine lokale
// Semantik-Ergebnisdatei aus shadow-store/), berechnet Legacy-Vektoren
// deterministisch nach (Reproduzierbarkeit gegen Production ist belegt:
// 56/56 Vektoren, max. Abweichung < 5e-8) und schreibt NIE in eine Datenbank.
//
// Aufruf:
//   node scripts/embedding-quality-eval.js                     → Legacy-Auswertung
//   node scripts/embedding-quality-eval.js --semantik <datei>  → zusätzlich Semantik
//     (<datei> = Ergebnisdatei der Offline-Shadow-Pipeline, id → Eintrag mit vector)

const fs = require("fs");
const path = require("path");
const matching = require("../lib/helmut/matching.js");

const FIXTURE = path.join(__dirname, "fixtures", "embedding-testset-22b.json");

// Positiv = das Modell soll das Paar hoch bewerten; Negativ = niedrig.
// thematisch-verwandt und unklar bleiben aus der binären Wertung heraus
// (kein eindeutiges Soll), werden aber als eigene Klassen berichtet.
const POSITIV = new Set(["gleicher-vorgang", "wahrscheinliches-duplikat", "aktualisierung"]);
const NEGATIV = new Set(["aehnliche-sprache-anderer-vorgang", "nicht-verwandt"]);

function ladeFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
}

function legacyVektoren(objekte) {
  const map = new Map();
  for (const o of objekte) map.set(o.id, matching.computeFeatureVectorForKnowledgeObject(o));
  return map;
}

function semantikVektoren(datei) {
  const roh = JSON.parse(fs.readFileSync(datei, "utf8"));
  const eintraege = roh.eintraege || roh; // Pipeline-Format oder flaches id→vector
  const map = new Map();
  for (const [id, e] of Object.entries(eintraege)) {
    const vec = Array.isArray(e) ? e : e.vector;
    if (Array.isArray(vec) && vec.length && e.status !== "fehlgeschlagen") map.set(id, vec);
  }
  return map;
}

function paarKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

function alleKosinus(objekte, vek) {
  const sims = new Map();
  for (let i = 0; i < objekte.length; i += 1) {
    for (let j = i + 1; j < objekte.length; j += 1) {
      const a = objekte[i].id, b = objekte[j].id;
      if (!vek.has(a) || !vek.has(b)) continue;
      sims.set(paarKey(a, b), matching.cosineSimilarity(vek.get(a), vek.get(b)));
    }
  }
  return sims;
}

// Rang von b unter allen Nachbarn von a (1 = ähnlichster Nachbar).
function rang(objekte, sims, a, b) {
  const werte = [];
  for (const o of objekte) {
    if (o.id === a) continue;
    const s = sims.get(paarKey(a, o.id));
    if (s != null) werte.push([o.id, s]);
  }
  werte.sort((x, y) => y[1] - x[1]);
  const idx = werte.findIndex(([id]) => id === b);
  return idx < 0 ? null : idx + 1;
}

function auswerten(name, fixture, vek) {
  const { objekte, goldstandard } = fixture;
  const sims = alleKosinus(objekte, vek);
  const zeilen = [];
  const proKlasse = {};

  for (const g of goldstandard) {
    const s = sims.get(paarKey(g.a, g.b));
    if (s == null) continue;
    const rAB = rang(objekte, sims, g.a, g.b);
    const rBA = rang(objekte, sims, g.b, g.a);
    zeilen.push({ ...g, kosinus: s, rangAB: rAB, rangBA: rBA });
    (proKlasse[g.klasse] = proKlasse[g.klasse] || []).push(s);
  }

  // Schwellen-Zielkonflikt auf den binär bewertbaren Paaren
  const schwellen = [];
  for (let t = 0.2; t <= 0.901; t += 0.05) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const z of zeilen) {
      if (POSITIV.has(z.klasse)) { if (z.kosinus >= t) tp += 1; else fn += 1; }
      else if (NEGATIV.has(z.klasse)) { if (z.kosinus >= t) fp += 1; else tn += 1; }
    }
    schwellen.push({
      schwelle: Math.round(t * 100) / 100, tp, fp, fn, tn,
      praezision: tp + fp ? tp / (tp + fp) : null,
      trefferquote: tp + fn ? tp / (tp + fn) : null
    });
  }

  // Rangqualität: je Objekt mit Gold-Positiven → bester Rang des Positivs
  const positive = zeilen.filter((z) => POSITIV.has(z.klasse));
  const raenge = positive.flatMap((z) => [z.rangAB, z.rangBA]).filter((r) => r != null);
  const rangStat = {
    paare: positive.length,
    rang1: raenge.filter((r) => r === 1).length,
    top5: raenge.filter((r) => r <= 5).length,
    gesamt: raenge.length,
    mittel: raenge.length ? raenge.reduce((a, b) => a + b, 0) / raenge.length : null
  };

  // Trefferquoten je Positivklasse bei Beispielschwelle (nur zur Anschauung,
  // die Schwellentabelle oben ist die eigentliche Wahrheit)
  const klassenStat = {};
  for (const [klasse, werte] of Object.entries(proKlasse)) {
    const sortiert = [...werte].sort((a, b) => a - b);
    klassenStat[klasse] = {
      n: werte.length,
      min: sortiert[0],
      median: sortiert[Math.floor(sortiert.length / 2)],
      max: sortiert[sortiert.length - 1]
    };
  }

  // Sondergruppen: Verhalten bei fehlendem Fachgebiet / Ebene unknown / regional
  const gruppe = (nr) => new Set(objekte.filter((o) => (o.fallgruppen || []).includes(nr)).map((o) => o.id));
  const ohneFach = gruppe(12), unbekannt = gruppe(13), regional = new Set([...gruppe(10), ...gruppe(11)]);
  const inGruppe = (z, g) => g.has(z.a) || g.has(z.b);
  const gruppenStat = (g) => {
    const pos = positive.filter((z) => inGruppe(z, g));
    const rs = pos.flatMap((z) => [z.rangAB, z.rangBA]).filter((r) => r != null);
    return { paare: pos.length, top5: rs.filter((r) => r <= 5).length, gesamt: rs.length };
  };

  return {
    name,
    abgedeckt: vek.size,
    zeilen,
    schwellen,
    rangStat,
    klassenStat,
    sonder: {
      ohneFachgebiet: gruppenStat(ohneFach),
      ebeneUnknown: gruppenStat(unbekannt),
      regional: gruppenStat(regional)
    }
  };
}

function drucke(r) {
  const f = (x, d = 3) => (x == null ? "  – " : x.toFixed(d));
  console.log(`\n================ Auswertung: ${r.name} (${r.abgedeckt} Vektoren) ================`);
  console.log("\n-- Goldpaare (Kosinus | Rang a→b / b→a | Klasse) --");
  for (const z of [...r.zeilen].sort((a, b) => b.kosinus - a.kosinus)) {
    console.log(`${f(z.kosinus)} | ${String(z.rangAB).padStart(2)}/${String(z.rangBA).padStart(2)} | ${z.klasse.padEnd(33)} | ${z.a} ↔ ${z.b}`);
  }
  console.log("\n-- Klassenstatistik (min / median / max Kosinus) --");
  for (const [k, s] of Object.entries(r.klassenStat)) {
    console.log(`${k.padEnd(33)} n=${String(s.n).padStart(2)}  ${f(s.min)} / ${f(s.median)} / ${f(s.max)}`);
  }
  console.log("\n-- Schwellen-Zielkonflikt (Positiv=gleicher-vorgang/duplikat/aktualisierung, Negativ=aehnliche-sprache/nicht-verwandt) --");
  console.log("Schwelle  TP  FP  FN  TN  Präzision  Trefferquote");
  for (const s of r.schwellen) {
    console.log(`${s.schwelle.toFixed(2).padStart(8)}  ${String(s.tp).padStart(2)}  ${String(s.fp).padStart(2)}  ${String(s.fn).padStart(2)}  ${String(s.tn).padStart(2)}  ${f(s.praezision, 2).padStart(9)}  ${f(s.trefferquote, 2).padStart(12)}`);
  }
  const rs = r.rangStat;
  console.log(`\n-- Rangqualität der Positivpaare: Rang 1: ${rs.rang1}/${rs.gesamt} · Top-5: ${rs.top5}/${rs.gesamt} · mittlerer Rang: ${f(rs.mittel, 1)}`);
  console.log(`-- Sondergruppen (Positivpaare in Top-5): ohne Fachgebiet ${r.sonder.ohneFachgebiet.top5}/${r.sonder.ohneFachgebiet.gesamt} · Ebene unknown ${r.sonder.ebeneUnknown.top5}/${r.sonder.ebeneUnknown.gesamt} · regional ${r.sonder.regional.top5}/${r.sonder.regional.gesamt}`);
}

function main() {
  const args = process.argv.slice(2);
  const fixture = ladeFixture();
  const legacy = auswerten("Legacy-Merkmalsvektor (256, deterministisch)", fixture, legacyVektoren(fixture.objekte));
  drucke(legacy);
  const ergebnisse = { legacy };

  const si = args.indexOf("--semantik");
  if (si >= 0 && args[si + 1]) {
    const sem = auswerten(`Semantisches Embedding (${args[si + 1]})`, fixture, semantikVektoren(args[si + 1]));
    drucke(sem);
    ergebnisse.semantik = sem;
  }

  const ji = args.indexOf("--json");
  if (ji >= 0 && args[ji + 1]) {
    fs.writeFileSync(args[ji + 1], JSON.stringify(ergebnisse, (k, v) => (k === "zeilen" ? v.map(({ begruendung, ...rest }) => rest) : v), 1));
    console.log(`\nJSON geschrieben: ${args[ji + 1]}`);
  }
}

if (require.main === module) main();
module.exports = { auswerten, legacyVektoren, semantikVektoren, POSITIV, NEGATIV };
