"use strict";
// Nur erfundene Daten, kein historisches Urteil und keine reale Fachabnahme.
const assert = require("node:assert/strict");
const B = require("../../lib/helmut/briefing-speicher");
const K = require("../../lib/helmut/briefing-profilkontext");
const A = require("../../lib/helmut/briefing-aussagenbindung");
const L = require("../../lib/helmut/briefing-lagebindung");
const Q = require("../../lib/helmut/lage-quellenbeleg");
const S = require("../../lib/helmut/storage");
const clone = structuredClone;
const day = "2026-09-13", now = new Date(day + "T12:00:00Z");
const profile = { id: "synthetisch-integration", fullName: "Erfundene Person", committees: ["Petitionsausschuss"],
  deputyCommittees: ["Haushaltsausschuss"], focusTopics: ["Pflege"] };
const kos = [1, 2].map(i => ({ id: `ko-synth-${i}`, vorgang_id: `vg-synth-${i}` }));
const docs = ["Beratung eines Haushaltsentwurfs", "Beratung eines Pflegeentwurfs"].map((title, i) => ({
  id: `rd-synth-${i + 1}`, title, summary: title + " im Ausschuss.",
  url: `https://example.invalid/dokument/${i + 1}`, published_at: day + "T05:00:00Z" }));
const sourcesByVorgang = Object.fromEntries(kos.map((k, i) => [k.vorgang_id, [docs[i]]]));
const briefing = { available: true, items: kos.map((k, i) => ({ vorgangId: k.vorgang_id, summary: docs[i].summary })),
  currentHelmutState: { tagesAnlass: require("../../lib/helmut/briefing-bereichsvertrag").tagesAnlass(docs, now) }, currentRadarState: {} };
function fixture(profileOverride = profile) {
  const profile = profileOverride;
  const result = { briefing: clone(briefing), eingabe: A.baueEingabe({ briefing, profile,
    userId: profile.id, day, kos, sourcesByVorgang }), korrekturBasis: { kos, sourcesByVorgang } };
  const e = result.eingabe;
  const urteil = { version: A.VERSION, eingabeHash: e.eingabeHash, ursprungHash: e.eingabeHash,
    ausgelasseneVorgaenge: [], aussagen: e.aussagen.map(a => ({ ...a, sachlichGetragen: true,
      kontextGetragen: true, mandatsbezugGetragen: true, begruendung: "Erfundenes technisches Vertragsurteil.",
      ...(a.art === "ausgabe" ? { ausgabeBeleg:e.darstellungsHash } : {
        belege: [{ vorgangId: a.vorgangId, documentId: sourcesByVorgang[a.vorgangId][0].id,
          feld: "auszug", text: sourcesByVorgang[a.vorgangId][0].summary }] }) })) };
  urteil.gesamtpruefung = require("./briefing-fachurteil")(result, urteil);
  const fachbasis = L.baue(result, urteil), fach = L.pruefe(fachbasis, profile, profile.id, now);
  const quellen = Q.baueEingabe(fach.ranked, fach.sources, now);
  const lage = { quellenVersion: Q.VERSION, quellen, quellenHash: Q.hashEingabe(quellen),
    koSetHash: B.hash({ ranked: fach.ranked, briefingEingabeHash: e.eingabeHash }).slice(0, 32),
    qualitaet: { version: require("../../lib/helmut/lage-textqualitaet").VERSION },
    paragraphs: quellen.map(v => ({ text: v.quellenbelege[0].titel, vorgang_ids: [v.vorgang_id],
      quellen_ids: [v.quellenbelege[0].quelle_id],
      belegstellen: [{ quelle_id: v.quellenbelege[0].quelle_id, text: v.quellenbelege[0].titel }] })),
    briefingEingabeHash: e.eingabeHash };
  assert(Q.gespeicherterTextGueltig(lage));
  const oldContext = { ebene: null, bundesland: null, partei: null, fraktion: null, wahlkreis: null,
    regierungsrolle: null, ausschuesse: ["Petitionsausschuss"], schwerpunkte: ["Pflege"], themengewichte: {} };
  const alt = { id: `bf-${profile.id}-mandatsbriefing-${day}`, user_id: profile.id, slot: B.SLOT,
    generated_at: day + "T04:01:00.000Z", payload: { version: 1, mandat: profile.id, tag: day,
      profilHash: B.hash(oldContext), briefing: clone(briefing), lage: null,
      inhaltHash: B.hash({ briefing, lage: null }), pruefung: B.pruefeInhalt(briefing, null) } };
  const text = { id: `bf-${profile.id}-lage-${day}`, user_id: profile.id, slot: "lage", payload: lage };
  const rows = new Map([[alt.id, clone(alt)], [text.id, clone(text)]]);
  const f = { rows, alt, text, fachbasis, writes: 0, builds: 0, reads: 0 };
  f.key = K.kennung(profile.id, day, B.profilHash(profile));
  f.storage = { assertTenant: S.assertTenant,
    getRenderedBriefingV3: async (uid, slot, date, opts) => {
      assert.equal(uid, profile.id); assert.equal(date, day); assert.equal(opts.strict, true); f.reads++;
      const id = opts.profilHash === undefined ? `bf-${uid}-${slot}-${date}` : K.kennung(uid, date, opts.profilHash);
      if (f.beforeRead) await f.beforeRead(id);
      return clone(rows.get(id) || null);
    },
    insertRenderedBriefingV3: async row => { f.writes++;
      if (f.onInsert) return f.onInsert(row);
      assert(!rows.has(row.id)); rows.set(row.id, clone(row)); return { saved: true };
    }, ergaenzeUnvollstaendigesBriefing: async () => { throw Error("PATCH verboten"); }
  };
  f.args = { profile, userId: profile.id, now, storage: f.storage, briefing: clone(briefing),
    aussagenEingabeHash: e.eingabeHash, profilkontextUebergang: fachbasis,
    build: async () => { f.builds++; throw Error("Kein Generator"); } };
  f.write = args => B.materialisiere({ ...f.args, ...args });
  f.read = args => B.lese({ userId: profile.id, profile, day, storage: f.storage, ...args });
  return f;
}
module.exports = { fixture, profile, day, now, briefing };
