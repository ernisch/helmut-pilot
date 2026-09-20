"use strict";

// Rein lokale Nachsicht geschlossener Versuche. Kein Reparieren, kein Entfernen
// unbenutzter Knoten, keine Bedeutungsfreigabe und keine Mutation der Quittung.
const E = require("./quellenrelationen-eingang");
const R = require("./quellenrelationen");
const schema = (v, keys) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("|") === [...keys].sort().join("|");

function diagnostiziere(position, answer) {
  const block = E.block(position), fehler = [], quellen = [];
  const out = { version: 1, position, manifestHash: block.manifestHash, fehler, quellen,
    akzeptiert: false, automatischeBedeutungsbewertung: false,
    vollstaendigeFaktenpruefung: false, produktpfadeGeprueft: 0 };
  if (!schema(answer, ["quellen"]) || !Array.isArray(answer.quellen) || answer.quellen.length > 24) {
    fehler.push({ typ: "antwortschema" }); return out;
  }
  const gesehen = new Set();
  answer.quellen.forEach((q, i) => {
    const add = value => fehler.push({ quelle: i + 1, ...value });
    if (!schema(q, ["id", "knoten", "relationen"]) || typeof q.id !== "string"
      || !Array.isArray(q.knoten) || q.knoten.length > 128
      || !Array.isArray(q.relationen) || q.relationen.length > 256) {
      add({ typ: "quellschema" }); return;
    }
    if (gesehen.has(q.id)) add({ typ: "kennung-doppelt", id: q.id });
    gesehen.add(q.id);
    const f = block.faelle.find(f => f.id === q.id);
    if (!f) { add({ typ: "kennung-fremd", id: q.id }); return; }
    const row = { id: f.id, soll: f.referenz.relationen.length, geliefert: q.relationen.length,
      knoten: [], relationen: [], graphFehler: null, vergleich: null,
      bedeutungsabdeckung: "nicht-automatisch-beurteilt" };
    quellen.push(row);
    const graph = { quelleId: f.id, quellenHash: R.sha(f.quelle.text), knoten: [], relationen: [] };
    let bindung = true;
    const span = (s, ort) => {
      try { return E.positioniere(f.quelle.text, s); }
      catch { bindung = false; add({ typ: "spanne-ungebunden", ...ort }); return null; }
    };
    q.knoten.forEach((n, j) => {
      if (!schema(n, ["id", "spanne"])) {
        bindung = false; add({ typ: "knotenschema", knoten: j + 1 }); return;
      }
      const s = span(n.spanne, { knoten: j + 1 });
      row.knoten.push({ nummer: j + 1, id: n.id, gebunden: !!s });
      graph.knoten.push({ id: n.id, spanne: s });
    });
    q.relationen.forEach((r, j) => {
      if (!schema(r, ["typ", "von", "nach", "signale"]) || !Array.isArray(r.signale)
        || r.signale.length > 8) {
        bindung = false; add({ typ: "relationsschema", relation: j + 1 }); return;
      }
      const signale = r.signale.map((s, k) => span(s, { relation: j + 1, signal: k + 1 }));
      row.relationen.push({ nummer: j + 1, typ: r.typ, signaleGebunden: signale.every(Boolean),
        // Weder Originalwoerter noch ein gueltiger Typ beweisen ihren Zusammenhang.
        bedeutungGeprueft: false });
      graph.relationen.push({ ...r, signale });
    });
    if (bindung) {
      row.graphFehler = R.graphFehler(f.quelle, graph);
      row.graphFehler.forEach(add);
      // Ein ungueltiger Graph besitzt keinen vollstaendigen Referenzvergleich.
      // Null darf hier nicht als null fehlende Relationen missverstanden werden.
      if (!row.graphFehler.length) row.vergleich = R.vergleiche(f.quelle, graph, f.referenz);
    }
  });
  for (const f of block.faelle) if (!gesehen.has(f.id)) fehler.push({ typ: "sollkennung-fehlt", id: f.id });
  try { out.urspruenglicherVergleich = E.pruefe(position, answer); }
  catch (e) { out.urspruenglicherFehler = e.code || "RELATIONEN_UNBEKANNT"; }
  return out;
}
module.exports = { diagnostiziere };
