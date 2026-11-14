"use strict";

// Ein NEUER verbundener Szenariobeleg auf unveraendertem Runtimecode.
// Native Anwendung: Queue/Worker, Understanding/CAS/Fachbelege, individuelle
// Entscheidungen, Briefing/Radar, cacheOnly-Lage, Paketwrite/Readback und Leser.
// Kuenstliche Grenzen: Quellen und Modellantworten sind VORGEGEBEN; Queue und
// Speicher sind lokale Attrappen. KEIN echter KI-, DB-, Cron- oder Kundenbeweis.
// Ein fehlender Lage-Narrativ bleibt absichtlich ehrlich Teilstand.
const A = require("node:assert/strict"), P = require("../lib/helmut/scalable-pipeline"),
  U = require("../lib/helmut/understanding"), V = require("../lib/helmut/verstehen-vertrag"),
  C = require("../lib/helmut/briefingContract"), D = require("../lib/helmut/dedup"),
  R = require("../lib/helmut/roh-quellenstaende"), F = require("../lib/helmut/understanding-fachthemen"),
  E = require("../lib/helmut/artikelkontext-belegspeicher"), Q = require("../lib/helmut/quellen-versorgungsstand"),
  B = require("../lib/helmut/briefing-speicher"), L = require("../lib/helmut/briefing-lauf"),
  T = require("../lib/helmut/tagespaket-auslieferung"), S = require("../lib/helmut/storage"),
  H = require("../lib/helmut/quellen-lektuerebeleg"), I = require("../lib/helmut/publication-eligibility");
const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber"),
  fixtures = require("./fixtures/test-profiles"), clone = structuredClone;
if (process.argv.length !== 2) throw Error("Unbekannte Auswahl");
const verboten = [], fail = name => () => { verboten.push(name); throw Error(name + " verboten"); };
global.fetch = fail("Netz"); require("node:https").request = fail("HTTPS"); require("node:http").request = fail("HTTP");
const now = new Date(), day = require("../lib/helmut/briefing-frische").berlinTagKey(now), zeit = now.getTime(),
  env = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_VERSTEHEN_CAS: "on", HELMUT_ARTIKELKONTEXT: "on",
    HELMUT_SOURCE_MODE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on",
    HELMUT_SUCHWEGAUSZUEGE_HOSTS: "www.bundestag.de,www.bundesregierung.de" },
  profiles = [
    { ...clone(fixtures.testPoliticianOne), id: "synthetisch-kette-alpha", focusTopics: ["Tarifbindung"],
      reportingTopics: [], topicPriorities: { Tarifbindung: 5 } },
    { ...clone(fixtures.testPoliticianTwo), id: "synthetisch-kette-beta", focusTopics: ["Pflege"],
      reportingTopics: [], topicPriorities: { Pflege: 5 } }
  ];
const specs = [
  { key: "tarif", topic: "Tarifbindung", committee: "Arbeit und Soziales", person: profiles[0].fullName,
    title: "Synthetische Beratung zur Tarifbindung", category: "Arbeit" },
  { key: "pflege", topic: "Pflege", committee: "Gesundheit", person: profiles[1].fullName,
    title: "Synthetische Beratung zur Pflege", category: "Gesundheit" }
];
function doc(key, extra = {}) {
  return D.toRawDocumentRow({ title: "Synthetischer Artikel " + key,
    // Erfundener, nie abgerufener Testpfad unter einem nativ unterstuetzten Host.
    url: "https://www.bundestag.de/presse/synthetische-kettensimulation-" + key, sourceId: "synthetische-kettenquelle",
    sourceName: "Kuenstliche Quelle fuer die lokale Simulation", sourceType: "official", linkType: "direct",
    publishedAt: new Date(zeit - 3600000).toISOString(), retrievedAt: now.toISOString(), summary: null, ...extra });
}
const gute = specs.map(s => doc(s.key, { title: s.title,
  summary: `Der Ausschuss für ${s.committee} des Bundestages berät die ${s.topic}. ${s.person} nimmt an der öffentlichen Beratung teil. Die Sachverständigen besprechen die Umsetzung und die nächsten Schritte des Vorschlags.` })),
  publisher = doc("fehlendes-ziel", { url: null, linkType: "publisher" }),
  kaputt = doc("technisch-unlesbar"), unklar = doc("abruf-unklar"),
  dokumente = [publisher, kaputt, unklar, ...gute], docsById = new Map(dokumente.map(d => [d.id, d]));
function cacheRow(d, zustand, reason) {
  const key = E.bereiteArtikelkontextVor(d, { versuch: true, kontext: "einstieg" }).key;
  const data = { version: 1, schluessel: key, versuchId: "00000000-0000-4000-8000-000000000001",
    reserviertAm: new Date(zeit - 1800000).toISOString(), zustand,
    ...(zustand === "luecke" ? { abgeschlossenAm: new Date(zeit - 1799000).toISOString(), reason } : {}) };
  return [key, data];
}
const cache = new Map([cacheRow(kaputt, "luecke", "artikelbereich-mehrdeutig-oder-fehlend"), cacheRow(unklar, "reserviert")]),
  q = erzeugeSpeicherWarteschlange({ now: () => zeit }), kos = new Map(), sources = {}, cas = new Map(),
  modelInputs = [], progress = [], rows = new Map(), storeCalls = [];
const marker = d => d.id === publisher.id ? "artikelziel-nicht-bestaetigt"
  : d.id === kaputt.id ? "artikelbereich-mehrdeutig-oder-fehlend" : "abruf-ausgang-offen";
function antwort(d) {
  const s = specs[gute.findIndex(x => x.id === d.id)]; A.ok(s, "Nur brauchbare Artikel duerfen Modell-Eingaben werden");
  return { headline: d.title, display_title: d.title, display_summary: `${s.topic} wird im Ausschuss beraten.`,
    was_ist_passiert: d.summary, warum_wichtig: `Der Vorschlag betrifft die ${s.topic}.`,
    wer_ist_betroffen: "Die im Vorschlag erfassten Beteiligten", handlungsempfehlung: "Beratung des Vorschlags verfolgen.",
    recommendation: "Beratung des Vorschlags verfolgen.", confidence_score: 85, zeitdruck: "keiner",
    decision_level: "bund", parteien: [], ausschuesse: [s.committee], ministerien: [], risiken: [], chancen: [],
    mentioned_people: [s.person], tags: [s.topic], fachthemen_belege: [{ tag: s.topic, quelle_id: d.id,
      feld: "auszug", passage: d.summary }], display_category: s.category };
}
function besitz(o, state) {
  const r = cas.get(o.vorgangId);
  return r && r.owner === o.besitzer && r.fencing === o.fencing && r.state === state;
}
const casStorage = {
  verstehenReserviere: async o => {
    const r = cas.get(o.vorgangId);
    if (r) return { erlaubt: false, grund: r.state === "fertig" ? "bereits-fertig" : "ausgang-unbekannt", zustand: r.state };
    cas.set(o.vorgangId, { owner: o.besitzer, fencing: 1, hash: o.eingabeHash, state: "reserviert" });
    return { erlaubt: true, fencing: 1 };
  },
  verstehenModellstart: async o => { A.ok(besitz(o, "reserviert")); cas.get(o.vorgangId).state = "modell-laeuft"; return { ok: true }; },
  verstehenSchreibrecht: async o => ({ ok: Boolean(besitz(o, "modell-laeuft")) }),
  verstehenSpeichere: async o => {
    A.ok(besitz(o, "modell-laeuft")); A.equal(o.ko.vorgang_id, o.vorgangId);
    kos.set(o.ko.id, clone(o.ko)); cas.get(o.vorgangId).state = "fertig"; return { ergebnis: "gespeichert" };
  },
  verstehenVormerkungLese: async () => ({ verfuegbar: true, eintraege: {} }),
  verstehenAusgangUnbekannt: fail("Unerwarteter unbekannter Modellversand"), verstehenFreigabe: fail("CAS-Reset")
};
const deps = { env, now: () => zeit, handler: P.HANDLER,
  klassen: { belege: async () => ({ erlaubt: true, slot: "synthetischer-kettenslot" }), gebeFrei: async () => {} },
  ladeRohdokumente: fail("Ungebundener Korpusread"), ladeRohdokumentStaende: async (ids, staende) => ids.map(id => {
    const d = docsById.get(id); A.equal(R.standHash(d), staende[id]); return clone(d);
  }), artikelBelegspeicher: { lesen: async key => clone(cache.get(key) ?? null) },
  listFullProfiles: async () => clone(profiles), verstehenKonkurrenz: () => false,
  vorbereiteGespeicherteInhalte: async ({ dokumente: ds }) => ({ dokumente: ds, fortsetzungOffen: false,
    befund: ds.map(d => ({ id: d.id, status: d.summary ? "vorhanden" : "luecke", ...(d.summary ? {} : { reason: marker(d) }) })),
    artikelkontextVersorgung: async () => ({ angefordert: false }) }),
  eagerUnderstanding: async (ds, options) => {
    const results = [];
    for (const d of ds) {
      const vorgangId = "vg-synthetische-kette-" + specs[gute.findIndex(x => x.id === d.id)].key,
        vertrag = V.baueVertrag({ besitzer: "synthetisch-" + d.id, env, deps: { speicher: casStorage } });
      const result = await U.understandOneCluster({ documents: [d] }, {
        runId: options.runId, canSpend: async () => ({ allowed: true }), requestUnderstanding: async prompt => {
          modelInputs.push(d.id);
          const q = JSON.parse(prompt.split("\n").find(line => line.startsWith('{"quelle_id":')));
          A.equal(q.quelle_id, d.id); A.equal(q.auszug, d.summary);
          return clone(antwort(d)); // AUSSCHLIESSLICH vorgegebene synthetische Antwort.
        }, save: fail("CAS-Bypass"), saveSources: async (koId, ds) => {
          const k = kos.get(koId); A.ok(k); sources[k.vorgang_id] = clone(ds); return { saved: ds.length };
        }, markFailed: fail("Unerwartete Understanding-Ablehnung"), logSkip: () => {},
        artikelkontextVersorgung: options.artikelkontextVersorgung,
        // Derselbe strenge Bestandsread wie im nativen Restvertrag: ein
        // bestaetigt fehlendes KO ist etwas anderes als ein fehlender Leser.
        getExistingStreng: async id => clone([...kos.values()].find(k => k.vorgang_id === id) || null),
        findVorgangCandidates: async () => [], listVorgangDocuments: async () => [d]
      }, { vorgangId, existing: null, vertrag, deadlineMs: options.deadlineMs,
        quellenRestDokumentIds: options.quellenRestDokumentIds, quellenAbschnitte: options.quellenAbschnitte });
      A.equal(result.status, "saved", JSON.stringify(result)); results.push(result);
    }
    return { processed: results.length, counts: { saved: results.length }, results };
  }, extendLease: q.extendLease, zurueckstellen: q.zurueckstellen, finish: q.finish,
  fortschritt: async o => {
    const r = q.hole(o.id); A.equal(r.status, "laeuft"); A.equal(r.lease_owner, o.owner);
    if (H.hash(r.payload) !== H.hash(o.vorher)) return { verfuegbar: true, uebernommen: false };
    r.payload = clone(o.payload); progress.push(o.id); return { verfuegbar: true, uebernommen: true };
  }
};
const storage = { assertTenant: S.assertTenant,
  getRenderedBriefingV3: async (uid, slot, tag) => {
    A.ok(profiles.some(p => p.id === uid)); storeCalls.push({ op: "read", uid, slot });
    const r = rows.get(`bf-${uid}-${slot}-${tag}`) || null; if (r) A.equal(r.user_id, uid); return clone(r);
  },
  insertRenderedBriefingV3: async row => {
    A.ok(profiles.some(p => p.id === row.user_id)); A.equal(rows.has(row.id), false);
    rows.set(row.id, clone(row)); storeCalls.push({ op: "insert", uid: row.user_id }); return { saved: true };
  }, ergaenzeUnvollstaendigesBriefing: fail("Ungeplanter Paket-PATCH")
};
async function nativeLage(profile, versorgung) {
  const lage = require("../lib/helmut/lage"), ai = require("../lib/helmut/ai"),
    overrides = { v3StoreReady: () => true, listKnowledgeObjects: async () => clone([...kos.values()]),
      listMatchingResults: async o => { A.equal(o.userId, profile.id); return []; },
      listAktuelleLageQuellen: require("./fixtures/lage-quellenmetadaten")([...kos.values()], id => clone(sources[id] || [])),
      getSourcesForVorgang: async id => clone(sources[id] || []), getRenderedBriefingV3: storage.getRenderedBriefingV3,
      getLageTeilstand: async () => null }, old = Object.fromEntries(Object.keys(overrides).map(k => [k, S[k]])),
    oldGenerate = ai.generateLageBriefing;
  Object.assign(S, overrides); ai.generateLageBriefing = fail("Modell beim App-Lage-Lesen");
  try { return await lage.buildLageBriefing(profile, { politicianId: profile.id, cacheOnly: true, versorgung }); }
  finally { Object.assign(S, old); ai.generateLageBriefing = oldGenerate; }
}
function noPrivate(value) {
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    A.ok(![F.FELD, "helmut_quellen_lektuere", "diagnosen", "fachthemen_belege", "antwortStruktur"].includes(k), k);
    noPrivate(v);
  }
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Gemischte Artikel durchlaufen native Verarbeitung bis zu zwei getrennten gespeicherten Tagesprioritaeten mit Lagekarten und Radar", async () => {
    for (const d of dokumente) await q.enqueue({ jobType: "document_understanding", idempotencyKey: "synthetische-kette|" + d.id,
      freshnessWindow: day + "T00Z", tenantId: null, priority: 80, maxAttempts: 3,
      payload: { dokumentIds: [d.id], quellenstaende: { [d.id]: R.standHash(d) } } });
    for (let i = 0; i < 15; i++) {
      const a = (await q.claim({ owner: "synthetische-kette", limit: 1, leaseMs: 120000 })).auftraege[0];
      if (!a) break; await P.fuehreAuftragAus({ auftrag: a, deps, besitzer: "synthetische-kette" });
    }
    const diagnose = JSON.stringify({ synthetischeAntworten: modelInputs.length, fortschritte: progress.length,
      jobs: q.alle().map(r => ({ status: r.status, artikel: r.payload.dokumentIds[0],
        versuche: r.attempts, grund: r.last_error })) });
    A.equal(q.nachStatus("erledigt").length, 2, diagnose); A.equal(q.nachStatus("fehlgeschlagen").length, 2, diagnose);
    A.equal(q.nachStatus("wartend").length, 1); A.equal(kos.size, 2);
    A.deepEqual(modelInputs.slice().sort(), gute.map(d => d.id).sort());
    const offen = q.nachStatus("wartend")[0]; A.equal(offen.payload.dokumentIds[0], unklar.id);
    A.equal(offen.payload.artikelVerarbeitungszustand, undefined); A.equal(offen.attempts, 0);
    for (const r of q.nachStatus("fehlgeschlagen")) {
      A.equal(r.payload.artikelVerarbeitungszustand.zustand, "abseits"); A.equal(r.attempts, 3);
    }
    for (const k of kos.values()) {
      A.equal(k.understanding_status, "complete"); A.equal(cas.get(k.vorgang_id).state, "fertig");
      A.equal(F.vollstaendigGebunden(k, sources[k.vorgang_id]), true);
    }
    const primaries = [];
    for (const [i, profile] of profiles.entries()) {
      const versorgung = await Q.lese({ mandat: profile.id, jetztMs: zeit, env,
        deps: { planungsrest: { lesen: async () => ({ zustand: "fertig" }) }, offeneVorbedingungen: q.offeneVorbedingungen } });
      A.equal(versorgung.zustand, "offen");
      const briefing = C.buildContractFromKnowledgeObjects(profile, [...kos.values()], sources,
        { userId: profile.id, now, versorgung }), expected = "vg-synthetische-kette-" + specs[i].key;
      A.equal(briefing.currentHelmutState.primaryVorgangId, expected);
      A.equal(briefing.currentHelmutState.profileId, profile.id); A.equal(briefing.currentHelmutState.tagesAnlass.art, "neue-quelle");
      A.equal(briefing.currentHelmutState.qualityStatus, "partial");
      A.ok(briefing.currentHelmutState.whyItMatters.includes("Briefingfenster"));
      A.ok(briefing.currentRadarState.mentions.some(x => x.vorgangId === expected));
      A.equal(briefing.currentRadarState.mentions.some(x => x.vorgangId === "vg-synthetische-kette-" + specs[1 - i].key), false);
      const lage = await nativeLage(profile, versorgung);
      A.equal(lage.available, true); A.equal(lage.pendingNarrative, true); A.equal(lage.paragraphs.length, 0);
      A.deepEqual(lage.vorgaenge.map(v => v.vorgangId), [expected]);
      A.notEqual(briefing.currentHelmutState.whyItMatters, lage.vorgaenge[0].displaySummary);
      briefing.tagespaketGrundlage = T.grundlage(briefing, [...kos.values()]); briefing.publicationEligibilityPolicy = I.publicInfo();
      await B.materialisiere({ userId: profile.id, profile, now, briefing, lageAnsicht: lage, storage });
      const row = rows.get(`bf-${profile.id}-${B.SLOT}-${day}`); A.ok(row);
      const quittung = L.quittung({ tenantId: profile.id, berlinTag: day, status: L.STATUS_ERFOLG,
        erzeugtAm: now, fensterStart: day + "T00:00:00Z", ausgabeBeleg: require("../lib/helmut/briefing-ausgabebeleg").ausPaket(row) });
      rows.set(L.laufId(profile.id, day), { id: L.laufId(profile.id, day), user_id: profile.id,
        slot: L.SLOT_ERFOLG, generated_at: now.toISOString(), payload: quittung });
      const before = clone([...rows]); storeCalls.length = 0;
      const out = await T.lese({ userId: profile.id, profile, now, storage });
      A.equal(out.briefing.available, true); A.equal(out.briefing.currentHelmutState.primaryVorgangId, expected);
      A.equal(out.briefing.paketStatus.quittungGebunden, true); A.equal(out.briefing.paketStatus.tag, day);
      A.equal(out.briefing.paketStatus.zustand, "teilweise"); A.equal(out.briefing.paketStatus.vollstaendig, false);
      A.equal(out.briefing.paketStatus.fachlicheVollabnahme, false);
      A.ok(out.briefing.paketStatus.fehler.includes("quellenversorgung-unvollstaendig"));
      A.ok(out.briefing.paketStatus.fehler.includes("lage-text-fehlt"));
      A.deepEqual(out.briefing.lageBriefing.vorgaenge, lage.vorgaenge);
      A.deepEqual(out.briefing.currentRadarState.anzeige.mentions.map(x => x.vorgangId), [expected]);
      A.equal(out.briefing.gespeicherterNachweis.profilHash, B.profilHash(profile));
      A.equal(storeCalls.length, 2); A.ok(storeCalls.every(c => c.op === "read" && c.uid === profile.id));
      A.deepEqual([...rows], before); noPrivate(out.briefing); primaries.push(expected);
    }
    A.notEqual(primaries[0], primaries[1]); A.equal(modelInputs.length, 2);
  });
  A.equal(count, 1); A.deepEqual(verboten, []);
  console.log(JSON.stringify({ szenario: "Neue verbundene Offline-Simulation", artikel: dokumente.length,
    erfolgreichVerstanden: kos.size, technischAbseits: q.nachStatus("fehlgeschlagen").length,
    unbekanntOffen: q.nachStatus("wartend").length, synthetischeMandate: profiles.length,
    synthetischeAntworten: modelInputs.length, echteModellaufrufe: 0, netz: 0, produktionsWrites: 0,
    lageNarrativ: "nicht simuliert; ehrlich noch offen", fachlicheVollabnahme: false,
    grenzen: "Kein KI-, Supabase-, Cron-, Kundenbrowser- oder Kapazitaetsbeweis" }));
  console.log("1/1 neue verbundene Gruppe bestanden; keine alten Tests wiederholt.");
})().catch(e => { console.error(e); process.exitCode = 1; });
