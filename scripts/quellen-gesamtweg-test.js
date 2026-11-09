"use strict";

// Kleine deklarierte Synthetik: 30 Artikel, zwei fiktive Profile. Die echten
// Fachfunktionen laufen mit injizierten Speicher-/Modellantworten ohne Netz.
// Positive Urteile belegen Vertragsbindung, niemals echte Modellbefolgung.
const A = require("node:assert/strict");
const P = require("../lib/helmut/scalable-pipeline");
const U = require("../lib/helmut/understanding");
const D = require("../lib/helmut/dedup");
const R = require("../lib/helmut/roh-quellenstaende");
const B = require("../lib/helmut/betriebskosten-budget");
const C = require("../lib/helmut/briefingContract");
const S = require("../lib/helmut/briefing-speicher");
const L = require("../lib/helmut/lage-quellenbeleg");
const Q = require("../lib/helmut/lage-textqualitaet");
const render = require("./lib/briefing-ansichten");
const now = new Date("2026-11-10T05:15:33Z"), start = Date.parse("2026-11-09T04:00:00Z");
const profiles = ["Pflege", "Verkehr"].map((topic, i) => ({ id: `isoliert-gesamt-${i}`, fullName: `Fiktives Fachprofil ${topic}`,
  party: "SPD", faction: "SPD", parliamentType: "Bundestag", state: i ? "Berlin" : "Niedersachsen",
  constituency: `Synthetischer Wahlkreis ${topic}`, focusTopics: [topic], committees: [i ? "Verkehrsausschuss" : "Gesundheitsausschuss"], profileActive: true }));
const docs = Array.from({ length: 30 }, (_, i) => {
  const topic = i % 2 ? "Verkehr" : "Pflege";
  return D.toRawDocumentRow({ title: `${i === 29 ? "Verkehr und Pflege" : topic}: Beratung zum Vorhaben ${i} angekuendigt`,
    summary: `Die öffentliche Beratung zum Vorhaben ${i} im Bereich ${topic} findet am 2026-11-11 mit den beteiligten Verbänden im Parlament statt. `
      + `Der ${i % 2 ? "Verkehrsausschuss" : "Gesundheitsausschuss"}${i === 29 ? " und der Gesundheitsausschuss" : ""} bereitet die Unterlagen für die parlamentarische Beratung des Vorhabens ${i} vor.`,
    url: `https://example.org/isolierter-gesamtweg/artikel-${i}`, sourceName: "Deklariertes synthetisches Testmedium",
    sourceType: "media", publishedAt: "2026-11-09T04:30:00Z" });
});
const contract = { version: 1, profileId: profiles[0].id, startsAt: "2026-11-05T00:00:00.000Z", dailyLimitUsd: 1, totalLimitUsd: 30,
  route: { provider: "azure", responsesUrl: "https://offline.openai.azure.com/openai/v1/responses", model: "gpt-5-mini" } };
const env = { HELMUT_ARTIKELKONTEXT: "on", HELMUT_SUCHWEGAUSZUEGE_HOSTS: "www.dgb.de,www.radio-hannover.de", HELMUT_UNDERSTANDING_JOB_BUDGET_MS: "120000",
  HELMUT_BETRIEBSKOSTENVERTRAG_JSON: JSON.stringify(contract) };
env[B.ZULASSUNG_ENV] = JSON.stringify({ version: 1, budgetContractHash: B.vertrag(env).contractHash, profileIds: profiles.map(p => p.id) });
const raw = new Map(), jobs = new Map(), kos = new Map(), sourceLinks = new Map(), prompts = [];
const modelSources = new Set();
const hash = R.standHash;
let budgetPause = true, portions = 0, persistedBriefings = 0;
const sourceJob = { id: "isolierter-eingang", payload: { quelle: { id: "isolierter-rss-weg" } } };
const analysis = doc => ({ headline: doc.title, display_title: doc.title, was_ist_passiert: doc.summary, display_summary: doc.summary,
  warum_wichtig: "Der belegte Beratungsstand ist offen.", wer_ist_betroffen: "Die beteiligten Verbaende.",
  parteien: [], ausschuesse: doc.title.startsWith("Verkehr und Pflege") ? ["Gesundheitsausschuss", "Verkehrsausschuss"]
    : [doc.title.startsWith("Pflege") ? "Gesundheitsausschuss" : "Verkehrsausschuss"], ministerien: [], risiken: [], chancen: [], zeitdruck: "keiner", confidence_score: 75,
  why_relevant: "Ein offener parlamentarischer Beratungsstand.", recommendation: "Unterlagen für die parlamentarische Vorbereitung prüfen.",
  handlungsempfehlung: "Unterlagen für die parlamentarische Vorbereitung prüfen.",
  display_category: doc.title.startsWith("Pflege") ? "Pflege" : "Verkehr" });
function singleDeps(doc) {
  return {
    runId: "isolierter-gesamtauftrag",
    canSpend: async () => ({ allowed: true }),
    requestUnderstanding: async prompt => {
      A(prompt.includes(doc.summary), "Belegter Originalinhalt muss im tatsaechlich abgefangenen Prompt stehen");
      prompts.push(prompt); modelSources.add(doc.id); return analysis(doc);
    },
    getExistingStreng: async id => kos.get(id) || null,
    save: async () => { throw Error("unbedingter KO-Schreibweg"); },
    saveSources: async (koId, selected) => { sourceLinks.set(koId, selected); return { saved: selected.length }; },
    markFailed: async () => {}, modelName: () => "isolierte-modellattrappe", logSkip: () => {},
    findVorgangCandidates: async () => [], listVorgangDocuments: async id => sourceLinks.get(`ko-${id}`) || []
  };
}
function cas() {
  return { reserviere: async () => ({ erlaubt: true, fencing: 1 }), modellstart: async () => ({ erlaubt: true }),
    schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { kos.set(ko.vorgang_id, structuredClone(ko)); return { gespeichert: true, pruefbar: true }; },
    freigabe: async () => {}, freigabeOhneAufruf: async () => {}, ausgangUnbekannt: async () => {},
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {} };
}
const contextProvider = Object.assign(async () => ({ angefordert: false }), { nurBestand: true });
const understandDeps = {
  env, now: () => start, listFullProfiles: async () => profiles, verstehenKonkurrenz: () => false,
  ladeRohdokumente: async ids => ids.map(id => raw.get(id)),
  ladeRohdokumentStaende: async (ids, hashes) => ids.map(id => { const d = raw.get(id); A.equal(hash(d), hashes[id]); return d; }),
  vorbereiteGespeicherteInhalte: async ({ dokumente, profile }) => {
    A.equal(profile.length, 2);
    return { dokumente, befund: dokumente.map(d => ({ id: d.id, status: "belegt" })), artikelkontextVersorgung: contextProvider };
  },
  budget: { reserviere: async () => ({ erlaubt: !budgetPause }), melde: async () => {} },
  eagerUnderstanding: async (documents, opts) => {
    portions++;
    const results = [], pending = documents.filter(d => !opts.quellenRestDokumentIds || opts.quellenRestDokumentIds.includes(d.id));
    for (const doc of pending.slice(0, 12)) {
      const vorgangId = `vg-isolierter-artikel-${docs.findIndex(d => d.id === doc.id)}`;
      const result = await U.understandOneCluster({ documents: [doc] }, singleDeps(doc),
        { vorgangId, existing: kos.get(vorgangId) || null, vertrag: cas(), quellenRestDokumentIds: [doc.id] });
      A(["saved", "updated", "duplicate"].includes(result.status), JSON.stringify(result)); results.push(result);
    }
    return { processed: results.length, deferred: Math.max(0, pending.length - 12), results };
  }
};
function makeLage(profile, sources, selected) {
  const entries = selected.slice(0, 2).map(ko => ({ vorgang_id: ko.vorgang_id, quellenbelege: [{
    quelle_id: `q-isoliert-${ko.vorgang_id}`, titel: sources[ko.vorgang_id][0].title,
    auszug: sources[ko.vorgang_id][0].summary, url: sources[ko.vorgang_id][0].url }] }));
  const bezug = Q.mandatsbezugAuswahl(profile).find(b => b.wert === profile.focusTopics[0]);
  A(bezug);
  const paragraphs = entries.map(e => ({ text: e.quellenbelege[0].titel + ".", vorgang_ids: [e.vorgang_id],
    quelle_id: e.quellenbelege[0].quelle_id, mandatsbezug: bezug }));
  const urteil = { pruefungen: paragraphs.map((p, i) => ({ absatz: i, quelle_id: p.quelle_id, belegfeld: "titel",
    vollstaendig_belegt: true, themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt",
    pruefbegruendung: "Deklariertes injiziertes Quellenurteil nur fuer die isolierte Vertragspruefung.",
    mandatsbegruendung: `Das synthetische Profil nennt ${bezug.wert}.` })),
    vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
      pruefbegruendung: "Die synthetischen Artikel benennen zwei unterschiedliche Vorhaben." }] };
  const checked = Q.pruefe(paragraphs, entries, urteil, profile); A.equal(checked.ok, true, JSON.stringify(checked));
  const lage = { koSetHash: "a".repeat(32), quellenVersion: L.VERSION, quellenHash: L.hashEingabe(entries), quellen: entries,
    paragraphs: checked.paragraphs, qualitaet: checked.qualitaet };
  A.equal(L.gespeicherterTextGueltig(lage), true); return lage;
}
(async () => {
  const sourceDeps = { hardeningConfig: () => ({ enabled: false }),
    crawlAllSources: async () => ({ rawItems: docs.slice(0, 25), results: [{ ok: true, items: docs }] }),
    persistRohdokumente: async input => { input.forEach(d => raw.set(d.id, structuredClone(d)));
      return { ok: true, neuIds: input.map(d => d.id), bestaetigteIds: input.map(d => d.id),
        quellenstaende: Object.fromEntries(input.map(d => [d.id, hash(d)])) }; },
    enqueue: async job => { jobs.set(job.idempotencyKey, structuredClone(job)); return { verfuegbar: true, neu: true }; } };
  await P.HANDLER.source_fetch(sourceJob, sourceDeps);
  A.equal(raw.size, 30); A.equal(jobs.size, 2); A([...jobs.values()].every(j => j.payload.dokumentIds.length <= 25));
  const first = [...jobs.values()][0], firstJob = { ...first, id: "isolierter-job-0", createdAt: new Date(start).toISOString() };
  const paused = await P.HANDLER.document_understanding(firstJob, understandDeps, { auftragsDeadlineMs: start + 120000 });
  A.equal(paused.zurueckgestellt, true); A.equal(prompts.length, 0, "Budgetpause ist keine Irrelevanz");
  budgetPause = false;
  for (const [i, input] of [...jobs.values()].entries()) {
    let job = { ...input, id: `isolierter-job-${i}`, createdAt: new Date(start).toISOString() };
    for (let n = 0; n < 5; n++) {
      const r = await P.HANDLER.document_understanding(job, understandDeps, { auftragsDeadlineMs: start + 120000 });
      if (r.ok) break;
      A(r.fortschrittPayload, JSON.stringify(r));
      // JSON-Roundtrip repraesentiert einen Prozessabbruch und Wiederaufnahme des gespeicherten Payloads.
      job = { ...job, payload: JSON.parse(JSON.stringify(r.fortschrittPayload)) };
    }
  }
  A.equal(modelSources.size, 30); A.equal(kos.size, 30); A(portions >= 3);
  const before = prompts.length;
  await P.HANDLER.document_understanding(firstJob, understandDeps, { auftragsDeadlineMs: start + 120000 });
  A.equal(prompts.length, before, "Doppelte Zustellung liest bestaetigte Quellen nicht erneut im Modell");

  const rows = new Map(), all = [...kos.values()];
  const storage = { assertTenant: require("../lib/helmut/storage").assertTenant,
    getRenderedBriefingV3: async (id, slot, day) => structuredClone(rows.get(`bf-${id}-${slot}-${day}`) || null),
    insertRenderedBriefingV3: async entry => { if (rows.has(entry.id)) return { saved: false, reason: "existing-result" };
      rows.set(entry.id, structuredClone(entry)); persistedBriefings++; return { saved: true }; } };
  const byVorgang = Object.fromEntries(all.map(ko => [ko.vorgang_id, sourceLinks.get(ko.id)]));
  const primaryIds = new Set();
  for (const profile of profiles) {
    const briefing = C.buildContractFromKnowledgeObjects(profile, all, byVorgang, { now, userId: profile.id });
    A(briefing.items.some(item => item.vorgangId === "vg-isolierter-artikel-29"), "Derselbe globale Artikel erreicht beide persoenlichen Ausgaben");
    A(briefing.currentHelmutState.primaryItem, JSON.stringify(briefing.currentHelmutState));
    A(briefing.currentHelmutState.primaryItem.title.includes(profile.focusTopics[0]));
    primaryIds.add(briefing.currentHelmutState.primaryVorgangId);
    const selected = all.filter(ko => ko.headline.startsWith(profile.focusTopics[0]));
    const lage = makeLage(profile, byVorgang, selected), day = "2026-11-10";
    rows.set(`bf-${profile.id}-lage-${day}`, { id: `bf-${profile.id}-lage-${day}`, user_id: profile.id, slot: "lage", payload: lage });
    const result = await P.HANDLER.briefing_materialization({ id: `materialisierung-${profile.id}`, payload: { mandatsId: profile.id } }, {
      getActiveProfile: async id => profiles.find(p => p.id === id), buildV3Briefing: async () => briefing,
      materialisiereBriefing: args => S.materialisiere({ ...args, storage, now }) });
    A.equal(result.gespeichert, true); A.equal(result.qualitaetBestanden, false);
    const saved = await S.lese({ userId: profile.id, day, profile, storage });
    A.equal(saved.user_id, profile.id); A.equal(saved.payload.pruefung.strukturellVollstaendig, true,
      JSON.stringify(saved.payload.pruefung));
    A.equal(saved.payload.pruefung.bestanden, false); A.equal(saved.payload.pruefung.vollstaendigeFaktenpruefung, false);
    const view = render({ ...saved.payload.briefing, lageBriefing: S.lageAusgabe(saved.payload.lage) }, now.toISOString());
    A.equal(view.fachinhalt.briefing, true); A(view.html.briefing.includes(profile.focusTopics[0]));
    A(!view.html.briefing.includes(profiles.find(p => p.id !== profile.id).fullName));
    await A.rejects(S.lese({ userId: profile.id, day, profile: profiles.find(p => p.id !== profile.id), storage }), /nachweis-abweichend/);
  }
  A.equal(primaryIds.size, 2); A.equal(prompts.length, before, "Profilprojektion und Anzeige verursachen keine neue globale Lektuere");
  A.equal(persistedBriefings, 2);
  const negativeNow = new Date("2026-11-11T05:15:33Z"), negativeDay = "2026-11-11";
  const empty = C.toBriefingContractV3({ profile: profiles[0], decisions: [], kosById: {}, sourcesByVorgang: {},
    now: negativeNow, reason: "technisch-unterversorgt" });
  const negative = await S.materialisiere({ profile: profiles[0], userId: profiles[0].id, briefing: empty, storage, now: negativeNow });
  A.equal(negative.vollstaendig, false); A.equal(negative.qualitaetBestanden, false);
  const deficient = await S.lese({ userId: profiles[0].id, day: negativeDay, profile: profiles[0], storage });
  A.equal(deficient.payload.briefing.reason, "technisch-unterversorgt");
  A.equal(deficient.payload.pruefung.strukturellVollstaendig, false);
  A(deficient.payload.pruefung.fehler.includes("lage-text-fehlt"));
  A.equal(render(deficient.payload.briefing, negativeNow.toISOString()).fachinhalt.briefing, false);
  console.log(JSON.stringify({ gefunden: 30, gespeichert: raw.size, textVerfuegbar: 30, tatsaechlichAbgefangenePromptquellen: modelSources.size,
    portionen: portions, globaleModellattrappen: prompts.length, gespeichertePersoenlicheBriefings: persistedBriefings - 1, separatGespeicherteUnterversorgung: 1,
    gerenderteProfile: profiles.length, gemeinsamWiederverwendeteArtikel: 1, budgetinjektion: "isolierter Vertragstest, keine Kapazitaetszusage unter 1USD",
    strukturellVollstaendig: true, qualitaetBestanden: false,
    vollstaendigeFaktenpruefung: false, produktionsnachweis: false, echteModellaufrufe: 0 }));
})().catch(e => { console.error(e); process.exitCode = 1; });
