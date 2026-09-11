"use strict";
const A = require("node:assert/strict");
const B = require("../lib/helmut/briefing-lagebindung");
const Q = require("../lib/helmut/briefing-aussagenbindung");
const S = require("../lib/helmut/storage");
const L = require("../lib/helmut/lage");
const ai = require("../lib/helmut/ai");
const P = require("../lib/helmut/briefing-speicher");
const now = new Date(), day = require("../lib/helmut/briefing-frische").berlinTagKey(now);
const profile = { id: "lagebindung-test", committees: ["Haushaltsausschuss"] };
const kos = ["a", "b", "alt"].map(id => ({ id: "ko-" + id, vorgang_id: "vg-" + id,
  headline: "Bundestag beraet Haushalt " + id, was_ist_passiert: "Eine Beratung des Haushalts ist vorgesehen.",
  understanding_status: "complete", status: "ready", updated_at: now.toISOString() }));
const sourcesByVorgang = Object.fromEntries(kos.map(k => [k.vorgang_id, [{ id: "rd-" + k.id,
  title: k.headline, summary: k.was_ist_passiert, source_name: "Bundestag",
  url: "https://www.bundestag.de/dokumente/" + k.id,
  canonical_url: "https://www.bundestag.de/dokumente/ungepruefte-andere-adresse",
  published_at: new Date(now.getTime() - 3600000).toISOString() }]]));
const briefing = { available: true, items: kos.slice(0, 2).map(k => ({ vorgangId: k.vorgang_id,
  title: k.headline, summary: k.was_ist_passiert })) };
const eingabe = Q.baueEingabe({ briefing, kos, sourcesByVorgang, profile, userId: profile.id, day });
const urteil = { version: Q.VERSION, eingabeHash: eingabe.eingabeHash, ursprungHash: eingabe.eingabeHash,
  ausgelasseneVorgaenge: [], aussagen: eingabe.aussagen.map(a => ({ ...a, sachlichGetragen: true,
    kontextGetragen: true, mandatsbezugGetragen: true, begruendung: "Fiktives Vertragsurteil, keine Production Abnahme.",
    belege: [{ vorgangId: a.vorgangId, documentId: sourcesByVorgang[a.vorgangId][0].id,
      feld: "auszug", text: sourcesByVorgang[a.vorgangId][0].summary }] })) };
const result = { briefing, eingabe, korrekturBasis: { kos, sourcesByVorgang } };
urteil.gesamtpruefung = require("./fixtures/briefing-fachurteil")(result, urteil);
let count = 0, cache = null, writes = 0, calls = 0, gates = 0, lastInput = null;
const test = async (name, fn) => { await fn(); console.log("PASS " + name); count++; };
const basis = () => B.baue(result, urteil);
const options = () => ({ politicianId: profile.id, missingOnly: true, repairIncomplete: true,
  briefingEingabe: basis(), beforeGenerate: async id => { A.equal(id, profile.id); gates++; },
  beforeSave: async id => { A.equal(id, profile.id); } });
const reset = () => { cache = null; writes = calls = gates = 0; lastInput = null; };
S.v3StoreReady = () => true;
// Jeder ungebundene Nachladeweg waere ein echter Testfehler.
for (const name of ["listKnowledgeObjects", "listMatchingResults", "listKnowledgeObjectsByIds", "getSourcesForVorgang"])
  S[name] = async () => { throw new Error("Ungepruefter Nachladeweg " + name); };
S.getRenderedBriefingV3 = async () => structuredClone(cache);
S.acquirePipelineLock = async () => true;
S.releasePipelineLock = async () => {};
S.canSpendLlmForTenant = async () => ({ allowed: true });
S.insertRenderedBriefingV3 = async entry => { cache = structuredClone(entry); writes++; return { saved: true }; };
S.saveRenderedBriefingV3 = async () => { throw new Error("Unerlaubtes Ueberschreiben"); };
ai.generateLageBriefing = async (input, p, opts) => {
  calls++; lastInput = structuredClone(input);
  A.equal(p.id, profile.id); await opts.beforeReview();
  return { paragraphs: input.map(v => ({ text: v.quellenbelege[0].titel,
    vorgang_ids: [v.vorgang_id], quellen_ids: [v.quellenbelege[0].quelle_id],
    belegstellen: [{ quelle_id: v.quellenbelege[0].quelle_id, text: v.quellenbelege[0].titel }] })),
    qualitaet: { version: require("../lib/helmut/lage-textqualitaet").VERSION } };
};

(async () => {
  await test("Echter Urteilleser uebergibt die vollstaendige gebundene Eingabe", async () => {
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async (id, slot) => ({
      id: `bf-${id}-${slot}-${day}`, user_id: id, slot, payload: urteil }) };
    const r = await Q.leseFuerNachlauf({ profile, userId: profile.id, storage, now, build: async () => result });
    A.equal(r.bereit, true); A.equal(B.pruefe(r.lageEingabe, profile, profile.id).eingabeHash, eingabe.eingabeHash);
    A.deepEqual(B.pruefe(r.lageEingabe, profile, profile.id).ranked.map(k => k.vorgang_id), ["vg-a", "vg-b"]);
  });
  await test("Fremder Mandant, Tag, geaenderte Texte, Rohdaten oder Urteil scheitern vor Modellarbeit", async () => {
    for (const change of [b => { b.briefing.items[0].summary += " Andere Aussage"; },
      b => { b.korrekturBasis.kos[2].was_ist_passiert = "Geaendertes nicht sichtbares Objekt"; },
      b => { b.korrekturBasis.sourcesByVorgang["vg-a"][0].summary += " Nachtrag"; },
      b => { b.urteil.aussagen[0].sachlichGetragen = false; },
      b => { delete b.urteil.gesamtpruefung; },
      b => { b.urteil.gesamtpruefung.kriterien.rangfolge.bestanden = false; },
      b => { b.urteil.gesamtpruefung.umfang.auswahl.reverse(); },
      b => { b.eingabe.tag = "2020-01-01"; }, b => { b.eingabe.mandat = "fremd"; }]) {
      reset(); const opts = options(); change(opts.briefingEingabe);
      await A.rejects(L.buildLageBriefing(profile, opts), /briefing-lagebindung-abweichend/);
      A.equal(calls + writes + gates, 0);
    }
    A.throws(() => B.pruefe(basis(), { ...profile, committees: ["Innenausschuss"] }, profile.id));
    await A.rejects(L.buildLageBriefing(profile, { briefingEingabe: basis() }));
  });
  await test("Echter Lagepfad nutzt ausschliesslich gepruefte Auswahl, Adresse und Reihenfolge", async () => {
    reset(); const before = JSON.stringify(result), r = await L.buildLageBriefing(profile, options());
    A.equal(r.available, true); A.equal(calls, 1); A.equal(writes, 1); A.equal(gates, 2);
    A.deepEqual(lastInput.map(v => v.vorgang_id), ["vg-a", "vg-b"]);
    A(!JSON.stringify(lastInput).includes("vg-alt")); A(!JSON.stringify(lastInput).includes("ungepruefte-andere-adresse"));
    A.equal(cache.payload.briefingEingabeHash, eingabe.eingabeHash);
    A.equal(JSON.stringify(result), before);
  });
  await test("Vorhandener gueltiger Text bleibt vor jeglicher Neuerzeugung erhalten", async () => {
    const before = structuredClone(cache), n = calls;
    A.equal(require("../lib/helmut/lage-quellenbeleg").gespeicherterTextGueltig(cache.payload), true);
    const r = await L.buildLageBriefing(profile, options());
    A.equal(r.reason, "existing-result"); A.equal(calls, n); A.deepEqual(cache, before);
  });
  await test("Widerruf vor Entwurf oder Review verhindert finale Speicherung", async () => {
    for (const stopAt of [1, 2]) {
      reset(); let checks = 0; const opts = options();
      opts.beforeGenerate = async () => { if (++checks === stopAt) throw new Error("Eingabe veraendert"); };
      await A.rejects(L.buildLageBriefing(profile, opts), /Eingabe veraendert/);
      A.equal(writes, 0); A.equal(calls, stopAt - 1);
    }
  });
  await test("Erneute frische Pruefung vor Speicherung erhaelt Modellresultat als nicht abgenommen", async () => {
    reset(); const opts = options(); opts.beforeSave = async () => { throw new Error("Eingabe inzwischen veraendert"); };
    await A.rejects(L.buildLageBriefing(profile, opts), /Eingabe inzwischen veraendert/);
    A.equal(calls, 1); A.equal(writes, 0); A.equal(cache, null);
  });
  await test("Materialisierung akzeptiert nur den zur aktuellen Briefingpruefung gehoerenden Lagebeleg", async () => {
    reset(); await L.buildLageBriefing(profile, options());
    const text = structuredClone(cache); let materialisiert = null;
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async (_id, slot) =>
      structuredClone(slot === "lage" ? text : materialisiert),
      insertRenderedBriefingV3: async row => { materialisiert = structuredClone(row); return { saved: true }; } };
    for (const hash of ["b".repeat(64), "ungueltig"]) {
      await A.rejects(P.materialisiere({ profile, userId: profile.id, briefing, storage, now,
        aussagenEingabeHash: hash }), /briefing-lagebindung-abweichend/);
      A.equal(materialisiert, null);
    }
    const r = await P.materialisiere({ profile, userId: profile.id, briefing, storage, now,
      aussagenEingabeHash: eingabe.eingabeHash });
    A.equal(r.gespeichert, true); A.equal(r.qualitaetBestanden, false);
    A.equal(materialisiert.payload.lage.briefingEingabeHash, eingabe.eingabeHash);
  });
  console.log(`${count}/${count} Lagebindungsgruppen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
