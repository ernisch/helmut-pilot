"use strict";

// Offline Vorstufe des Prosa Belegplans, noch KEIN Production Generator.
// Die Fachfreigaben kommen ausschliesslich vom aufrufenden Quellenpruefer,
// niemals aus dem Modellplan. Hashes pruefen Bindung, nicht Bedeutung.
const { hash } = require("./briefing-speicher");
const { artikelUrl } = require("./lage-quellenbeleg");
const VERSION = 1;
const ZWECKE = Object.freeze(["ereignis", "zuschreibung", "zeit", "wirkung", "profil", "option", "kommunikation"]);
const FAKTFELDER = ["id", "vorgangId", "quelleId", "quellenHash", "stelle", "akteur", "handlung",
  "gegenstand", "aussagegrad", "verneinung", "zuschreibung", "bedingung", "ereigniszeit",
  "profilHash", "formulierungen"];
const keys = (o, ks) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).length === ks.length && ks.every(k => Object.hasOwn(o, k));
const text = x => typeof x === "string" && x.trim().length > 0;
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
function fordere(ok, grund) { if (!ok) throw new Error("prosa-fakten-" + grund); }
const unbekanntOderText = x => x === null || text(x);

function eindeutigeMap(rows, key) {
  fordere(Array.isArray(rows), "liste-fehlt");
  const map = new Map();
  for (const r of rows) {
    fordere(r && text(r[key]) && !map.has(r[key]), "kennung-abweichend");
    map.set(r[key], r);
  }
  return map;
}

// trustedFreigaben ist eine eigene Servereingabe. Der spaetere Aufrufer muss
// Herkunft/Leserecht separat absichern; ein mitgeliefertes true reicht nicht.
// Die Version verlangt separat gepruefte ganze Saetze pro Verwendungszweck.
// Keine automatische Interpretation, Grammatikreparatur oder Teilzitatmontage.
function binde({ quellen, fakten, trustedFreigaben, profile, tag, feldvertrag }) {
  const data = structuredClone({ quellen, fakten, trustedFreigaben, profile, tag, feldvertrag });
  fordere(text(data.profile?.id) && /^\d{4}-\d{2}-\d{2}$/.test(data.tag || "")
    && Number.isFinite(Date.parse(data.tag))
    && new Date(data.tag).toISOString().slice(0, 10) === data.tag, "kontext-fehlt");
  const qs = eindeutigeMap(data.quellen, "id"), fs = eindeutigeMap(data.fakten, "id");
  const approvals = eindeutigeMap(data.trustedFreigaben, "faktId");
  const fields = eindeutigeMap(data.feldvertrag, "pfad");
  fordere(fields.size > 0 && [...fields.values()].every(r => keys(r, ["pfad", "zweck", "vorgangId"])
    && ZWECKE.includes(r.zweck) && text(r.vorgangId)), "feldvertrag-fehlt");
  fordere(fs.size > 0 && approvals.size === fs.size, "freigabe-unvollstaendig");
  const ph = hash(data.profile);
  for (const f of fs.values()) {
    const q = qs.get(f.quelleId), a = approvals.get(f.id), s = f.stelle;
    fordere(keys(f, FAKTFELDER) && text(f.vorgangId) && sha(f.quellenHash)
      && ["akteur", "handlung", "gegenstand", "aussagegrad", "zuschreibung", "bedingung", "ereigniszeit"]
        .every(k => unbekanntOderText(f[k]))
      && [null, true, false].includes(f.verneinung), "fakt-ungueltig");
    fordere(q && q.vorgangId === f.vorgangId && artikelUrl(q.url)
      && f.quellenHash === hash(q), "quelle-abweichend");
    fordere(keys(s, ["feld", "von", "bis", "kontextVon", "kontextBis"])
      && ["titel", "auszug"].includes(s.feld) && typeof q[s.feld] === "string"
      && [s.von, s.bis, s.kontextVon, s.kontextBis].every(Number.isInteger)
      && s.kontextVon >= 0 && s.kontextVon <= s.von && s.von < s.bis
      && s.bis <= s.kontextBis && s.kontextBis <= q[s.feld].length
      && q[s.feld].slice(s.von, s.bis).trim().length > 0, "textstelle-abweichend");
    fordere(f.profilHash === null || f.profilHash === ph, "profil-abweichend");
    fordere(f.formulierungen && typeof f.formulierungen === "object" && !Array.isArray(f.formulierungen)
      && Object.keys(f.formulierungen).length > 0
      && Object.entries(f.formulierungen).every(([k, v]) => ZWECKE.includes(k) && text(v)), "formulierungen-ungueltig");
    if (["profil", "option", "kommunikation"].some(k => Object.hasOwn(f.formulierungen, k)))
      fordere(f.profilHash === ph, "profilbindung-fehlt");
    fordere(keys(a, ["faktId", "faktHash", "pruefer", "nachweisHash", "tag", "urteil"])
      && a.faktHash === hash(f) && text(a.pruefer) && sha(a.nachweisHash)
      && a.tag === data.tag && a.urteil === "getragen", "freigabe-fehlt");
  }
  const basisHash = hash(data);

  function formuliere(plan) {
    fordere(keys(plan, ["version", "basisHash", "felder"]) && plan.version === VERSION
      && plan.basisHash === basisHash && Array.isArray(plan.felder)
      && plan.felder.length === fields.size, "plan-abweichend");
    const gesehen = new Set();
    const felder = plan.felder.map(r => {
      fordere(keys(r, ["pfad", "faktId", "zweck"]) && text(r.pfad)
        && /^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/.test(r.pfad)
        && !gesehen.has(r.pfad) && ZWECKE.includes(r.zweck), "planfeld-abweichend");
      gesehen.add(r.pfad);
      const f = fs.get(r.faktId), field = fields.get(r.pfad);
      fordere(f && field && field.zweck === r.zweck && field.vorgangId === f.vorgangId
        && Object.hasOwn(f.formulierungen, r.zweck), "fakt-nicht-freigegeben");
      return { pfad: r.pfad, text: f.formulierungen[r.zweck], vorgangId: f.vorgangId,
        faktId: f.id, zweck: r.zweck, quelleId: f.quelleId, quellenHash: f.quellenHash };
    });
    // JavaScript map ueberspringt unbesetzte Arrayplaetze. Die Laenge allein
    // darf deshalb keinen vollstaendigen Feldvertrag vortaeuschen.
    fordere(gesehen.size === fields.size, "plan-unvollstaendig");
    return { version: VERSION, basisHash, mandat: data.profile.id, tag: data.tag,
      felder, planHash: hash(plan), inhaltHash: hash(felder), vollstaendigeFaktenpruefung: false };
  }

  // Gegen die erneut formulierte GANZE Ausgabe pruefen, nicht nur ihre
  // mitgelieferten Hashes. Gilt auch nach JSON Speicherung und Ruecklesung.
  function pruefe(plan, gespeichert) {
    try {
      const soll = formuliere(plan);
      return { gebunden: hash(soll) === hash(gespeichert), vollstaendigeFaktenpruefung: false };
    } catch {
      return { gebunden: false, vollstaendigeFaktenpruefung: false };
    }
  }
  return Object.freeze({ basisHash, formuliere, pruefe });
}

module.exports = { VERSION, ZWECKE, binde };
