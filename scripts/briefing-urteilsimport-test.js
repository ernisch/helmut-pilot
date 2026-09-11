"use strict";
const A = require("node:assert/strict");
const I = require("../lib/helmut/briefing-urteilsimport");
const Q = require("../lib/helmut/briefing-aussagenbindung");
const F = require("../lib/helmut/briefing-fachurteil");
const S = require("../lib/helmut/storage");
const { hash } = require("../lib/helmut/briefing-speicher");
const makeGesamt = require("./fixtures/briefing-fachurteil");
const userId = "test-kohorte-b-055", day = "2026-09-11";
const initialNow = "2026-09-11T12:00:00Z";
const clone = structuredClone;
function harness() {
  let clock = new Date(initialNow), reads = 0, builds = 0, writes = 0, checks = 0, inserted = 0;
  const rows = new Map(), hooks = {};
  const context = { profile: { id: userId, committees: ["Haushaltsausschuss"] },
    identitaet: { id: userId, name: "Fiktive Testperson" },
    mandat: { user_id: userId, aktiv: false, geloescht_at: null } };
  const kos = ["a", "b"].map(id => ({ id: "ko-" + id, vorgang_id: "vg-" + id,
    understanding_status: "complete", was_ist_passiert: "Der fiktive Ausschuss beraet einen fiktiven Entwurf." }));
  const sourcesByVorgang = Object.fromEntries(kos.map(k => [k.vorgang_id, [{ id: "rd-" + k.id,
    title: "Fiktive Ausschussberatung", summary: k.was_ist_passiert,
    url: "https://www.bundestag.de/dokumente/" + k.id, published_at: initialNow }]]));
  const briefing = { available: true, items: kos.map(k => ({ vorgangId: k.vorgang_id,
    title: sourcesByVorgang[k.vorgang_id][0].title })), currentHelmutState: { primaryVorgangId: "vg-a" } };
  const result = () => ({ briefing: clone(briefing), korrekturBasis: clone({ kos, sourcesByVorgang }),
    eingabe: Q.baueEingabe({ briefing, profile: context.profile, userId, day, kos, sourcesByVorgang }) });
  const r = result(), urteil = { version: Q.VERSION, eingabeHash: r.eingabe.eingabeHash,
    ursprungHash: r.eingabe.eingabeHash, ausgelasseneVorgaenge: [], aussagen: r.eingabe.aussagen.map(a => ({
      pfad: a.pfad, text: a.text, sachlichGetragen: true, kontextGetragen: true, mandatsbezugGetragen: true,
      begruendung: "Fiktive Einzelpruefung fuer den technischen Vertragstest.",
      belege: [{ vorgangId: a.vorgangId, documentId: sourcesByVorgang[a.vorgangId][0].id,
        feld: "titel", text: a.text }] })) };
  urteil.gesamtpruefung = makeGesamt(r, urteil);
  const freigabe = { version: 1, userId, tag: day, productionCommit: "a".repeat(40),
    urteilHash: hash(urteil), eingabeHash: r.eingabe.eingabeHash, kontextHash: hash(context),
    maxNeuanlagen: 1, modellaufrufe: 0, gueltigBis: "2026-09-11T13:00:00Z" };
  const storage = { assertTenant: S.assertTenant,
    getRenderedBriefingV3: async (id, slot, tag, opts) => {
      A.equal(id, userId); A.equal(slot, Q.SLOT); A.equal(tag, day); A.equal(opts.strict, true);
      return clone(rows.get(`bf-${id}-${slot}-${tag}`) || null);
    },
    insertBriefingFachurteil: async (entry, deps) => S.insertBriefingFachurteil(entry, { ...deps, bereit: true,
      request: async (url, opts) => {
        writes++; A(url.includes("user_id=eq." + userId)); A(url.includes("on_conflict=id"));
        A.equal(opts.method, "POST"); A.equal(opts.headers.Prefer, "resolution=ignore-duplicates,return=representation");
        await hooks.beforeRequest?.();
        if (rows.has(entry.id)) return [];
        const stored = { ...clone(entry), generated_at: entry.generated_at.replace("Z", "+00:00"),
          created_at: initialNow };
        rows.set(entry.id, stored); inserted++;
        await hooks.afterInsert?.(entry);
        return [{ ...clone(entry), generated_at: stored.generated_at, created_at: stored.created_at }];
      } }) };
  const args = { userId, urteil, freigabe, storage, now: () => new Date(clock),
    leseKontext: async () => { await hooks.context?.(++reads); return clone(context); },
    build: async () => { await hooks.build?.(++builds); return result(); },
    pruefeBetrieb: async commit => { A.equal(commit, freigabe.productionCommit); await hooks.gate?.(++checks); } };
  return { args, context, kos, sourcesByVorgang, briefing, result, hooks, rows,
    counts: () => ({ writes, inserted }), setTime: t => { clock = new Date(t); },
    approve: () => { freigabe.urteilHash = hash(urteil); } };
}
let count = 0;
const test = async (name, fn) => { await fn(); console.log("PASS " + name); count++; };
(async () => {
  await test("Fiktive Vollabnahme: echte Writerfunktion, exakter Reader, genau eine Neuanlage", async () => {
    const h = harness(), r = await I.ausfuehren(h.args);
    A.equal(r.verwendbar, true); A.equal(r.gespeichert, true); A.equal(r.schreibversuche, 1);
    A.deepEqual(h.counts(), { writes: 1, inserted: 1 }); A.equal(r.funktionsnachweis500, false);
    A.equal(r.vollstaendigeFaktenpruefung, false); A.equal(r.modellaufrufe, 0);
    const before = clone([...h.rows]); const repeat = await I.ausfuehren(h.args);
    A.equal(repeat.schreibversuche, 0); A.equal(repeat.verwendbar, false); A.deepEqual([...h.rows], before);
  });
  await test("Positive Einzelstellen ersetzen weder Gesamturteil noch Rangfolge oder Vollstaendigkeit", async () => {
    for (const change of [u => { delete u.gesamtpruefung; },
      ...F.KRITERIEN.map(k => u => { u.gesamtpruefung.kriterien[k].bestanden = false; }),
      u => { u.gesamtpruefung.umfang.auswahl.reverse(); },
      u => { u.gesamtpruefung.umfang.hauptvorgang = "vg-b"; },
      u => { u.gesamtpruefung.quellen.pop(); },
      u => { u.gesamtpruefung.quellen[1] = u.gesamtpruefung.quellen[0]; },
      u => { u.gesamtpruefung.kriterien.rangfolge.extra = true; },
      u => { u.aussagen[0].ungepruefteFreigabe = true; },
      u => { u.aussagen[0].belege[0].fremdesFeld = true; },
      u => { u.aussagen[0].kontextGetragen = false; }]) {
      const h = harness(); change(h.args.urteil); h.approve();
      A.equal((await I.ausfuehren(h.args)).verwendbar, false); A.equal(h.counts().writes, 0);
    }
  });
  await test("Titel allein bleibt trotz wortgetreuem Zitat und positivem Gesamtformular gesperrt", async () => {
    const h = harness(); h.sourcesByVorgang["vg-a"][0].summary = null;
    const r = h.result(), u = h.args.urteil;
    u.eingabeHash = u.ursprungHash = r.eingabe.eingabeHash; u.gesamtpruefung = makeGesamt(r, u);
    h.args.freigabe.eingabeHash = u.eingabeHash; h.approve();
    A.equal(Q.pruefe(r.eingabe, u).bereit, true); A.equal(F.pruefe(r, u).bereit, false);
    A.equal((await I.ausfuehren(h.args)).schreibversuche, 0);
  });
  await test("Quellen-, Wissens-, Profil- und Identitaetsdrift verhindern den ersten Insert", async () => {
    for (const change of [h => { h.sourcesByVorgang["vg-a"][0].summary += " Nachtrag"; },
      h => { h.kos[1].was_ist_passiert += " Andere Analyse"; },
      h => { h.context.profile.committees = ["Innenausschuss"]; },
      h => { h.context.identitaet.name = "Andere Person"; },
      h => { h.context.mandat.aktiv = true; },
      h => { h.briefing.items.reverse(); }]) {
      const h = harness(); h.hooks.build = n => { if (n === 2) change(h); };
      A.equal((await I.ausfuehren(h.args)).schreibversuche, 0); A.equal(h.counts().writes, 0);
    }
  });
  await test("Freigabe, Umfang, Originalschutz, Betriebsabbruch und Berliner Tageswechsel sperren", async () => {
    for (const change of [h => { h.args.freigabe.maxNeuanlagen = 2; },
      h => { h.args.freigabe.modellaufrufe = 1; }, h => { h.args.freigabe.urteilHash = "b".repeat(64); },
      h => { h.args.freigabe.extra = true; }, h => { h.args.userId = "helmut-kleebank"; },
      h => { h.args.urteil.quellenupdate = {}; h.approve(); },
      h => { h.hooks.gate = () => { throw new Error("Andere Ausfuehrung"); }; },
      h => { h.hooks.context = n => { if (n === 4) h.setTime("2026-09-11T22:00:00Z"); }; }]) {
      const h = harness(); change(h);
      A.equal((await I.ausfuehren(h.args)).schreibversuche, 0); A.equal(h.counts().writes, 0);
    }
  });
  await test("Transportverlust nach Insert wird nur durch exaktes Lesen geklaert, nie wiederholt", async () => {
    const h = harness(); h.hooks.afterInsert = () => { throw new Error("Timeout nach Commit"); };
    const r = await I.ausfuehren(h.args); A.equal(r.verwendbar, true);
    A.equal(r.grund, "durch-ruecklesung-bestaetigt"); A.deepEqual(h.counts(), { writes: 1, inserted: 1 });
    const lost = harness(); lost.hooks.beforeRequest = () => { throw new Error("Timeout vor Quittung"); };
    const l = await I.ausfuehren(lost.args); A.equal(l.verwendbar, false); A.equal(l.zustandUnbekannt, true);
    A.deepEqual(lost.counts(), { writes: 1, inserted: 0 });
  });
  await test("Falsche Quittung, Ruecklesung und Drift nach Insert erlauben keine Folgearbeit", async () => {
    for (const change of [h => { h.context.identitaet.name = "Andere Person"; },
      h => { h.setTime("2026-09-11T22:00:00Z"); },
      (h, entry) => { h.rows.get(entry.id).payload.importbeleg.urteilHash = "b".repeat(64); },
      (_h, entry) => { entry.user_id = "fremd"; }]) {
      const h = harness(); h.hooks.afterInsert = entry => change(h, entry);
      const r = await I.ausfuehren(h.args); A.equal(r.verwendbar, false); A.equal(h.counts().writes, 1);
    }
  });
  await test("Zwei gleichzeitige Versuche haben atomar hoechstens eine Neuanlage", async () => {
    const h = harness(); let waiting = 0, release;
    const barrier = new Promise(r => { release = r; });
    h.hooks.beforeRequest = async () => { if (++waiting === 2) release(); await barrier; };
    const r = await Promise.all([I.ausfuehren(h.args), I.ausfuehren(h.args)]);
    A.equal(h.counts().inserted, 1); A.equal(r.filter(x => x.verwendbar).length, 1);
    A.equal(h.rows.size, 1);
  });
  await test("Getrennter Speicherweg verweigert allgemeines Upsert, fremde Slots und negative Payloads", async () => {
    await A.rejects(S.saveRenderedBriefingV3({ slot: Q.SLOT }), /getrennter-writer/);
    const h = harness(); await I.ausfuehren(h.args); const row = [...h.rows.values()][0];
    for (const change of [r => { r.slot = "lage"; }, r => { r.user_id = "fremd"; },
      r => { r.payload.urteil.gesamtpruefung.kriterien.rangfolge.bestanden = false; },
      r => { r.payload.ungepruefterZusatz = true; }]) {
      const wrong = clone(row); change(wrong); let requests = 0;
      await A.rejects(S.insertBriefingFachurteil(wrong, { result: h.result(), bereit: true,
        request: async () => { requests++; return []; } })); A.equal(requests, 0);
    }
  });
  await test("Gebundene Korrektur laeuft durch echten Builder, Import und anschliessenden Urteilleser", async () => {
    const h = harness();
    S.v3StoreReady = () => true;
    S.listKnowledgeObjects = async () => h.kos;
    S.getSourcesForVorgang = async id => h.sourcesByVorgang[id];
    require("../lib/helmut/decisions").decideForUser = (_p, kos) => kos.map(k => ({
      knowledge_object_id: k.id, vorgang_id: k.vorgang_id, score: 50,
      decision: "Beobachten", matched_features: [] }));
    const build = require("../server").__buildV3Briefing;
    h.args.build = build;
    const opts = { aussagenEingabe: true, now: new Date(initialNow) };
    const original = await build(h.context.profile, userId, opts), q = h.sourcesByVorgang["vg-a"][0];
    const korrektur = { version: 1, ursprungHash: original.eingabe.eingabeHash,
      entwuerfe: [{ vorgangId: "vg-a", begruendung: "Fiktive vollstaendige Ersetzung im Vertragstest.",
        quellenIds: [q.id], inhalt: { titel: q.title, zusammenfassung: q.summary,
          mandatsbezug: "Fiktiver Anlass fuer den Haushaltsausschuss.", handlung: "Fiktiver Vorschlag: Unterlagen pruefen.",
          kommunikation: "Fiktiver Vorschlag: Fragen intern sammeln.", ausschuesse: ["Haushaltsausschuss"], ebene: "bund" } }],
      auslassungen: [{ vorgangId: "vg-b", begruendung: "Fiktive Auslassung im technischen Vertragstest." }] };
    const result = await build(h.context.profile, userId, { ...opts, aussagenKorrektur: korrektur });
    const urteil = { version: Q.VERSION, eingabeHash: result.eingabe.eingabeHash, korrektur,
      aussagen: result.eingabe.aussagen.map(a => ({ pfad: a.pfad, text: a.text, sachlichGetragen: true,
        kontextGetragen: true, mandatsbezugGetragen: true, begruendung: "Fiktives Urteil zum technischen Integrationstest.",
        ...(a.art === "ausgabe" ? { ausgabeBeleg: result.eingabe.darstellungsHash, belege: [] }
          : { belege: [{ vorgangId: "vg-a", documentId: q.id, feld: "auszug", text: q.summary }] }) })) };
    urteil.gesamtpruefung = makeGesamt(result, urteil);
    h.args.urteil = urteil;
    Object.assign(h.args.freigabe, { urteilHash: hash(urteil), eingabeHash: urteil.eingabeHash });
    const r = await I.ausfuehren(h.args);
    A.equal(r.verwendbar, true); A.deepEqual(h.counts(), { writes: 1, inserted: 1 });
    const read = await Q.leseFuerNachlauf({ profile: h.context.profile, userId,
      storage: h.args.storage, build, now: new Date(initialNow) });
    A.deepEqual(read.lageEingabe.briefing.items.map(i => i.vorgangId), ["vg-a"]);
    A.equal(read.eingabeHash, result.eingabe.eingabeHash);
  });
  console.log(`${count}/${count} Urteilsimportgruppen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
