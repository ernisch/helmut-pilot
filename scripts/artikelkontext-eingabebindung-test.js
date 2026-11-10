"use strict";

// Echte Fachfunktionen, isolierte Modell- und Speicherattrappen. Kein Netz/DB/LLM.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const U = require("../lib/helmut/understanding");
const A = require("../lib/helmut/artikelkontext");
const V = require("../lib/helmut/verstehen-vertrag");
const D = require("../lib/helmut/dedup");
const vorgangId = "vg-test-konferenz";
const ANALYSE = {
  headline: "Konferenz", was_ist_passiert: "Synthetischer Testinhalt", warum_wichtig: "Test", wer_ist_betroffen: "Test",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "Test", confidence_score: 70,
  display_title: "Konferenz zur Verkehrspolitik in Neustadt", display_summary: "Synthetischer Testinhalt",
  why_relevant: "Test", recommendation: "Test", display_category: "Verkehr"
};
function fixture() {
  const doc = D.toRawDocumentRow({ title: ANALYSE.display_title,
    summary: "Die Konferenz sollte einen Austausch ueber neue Bahnstrecken ermoeglichen.",
    url: "https://example.org/politik/konferenz", sourceName: "Testmedium",
    publishedAt: "2026-09-14T16:00:00Z" });
  return { cluster: { documents: [doc] }, beleg: {
    version: 1, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc),
    artikelUrl: doc.url, artikelTitel: doc.title, herkunft: "manueller-originalvergleich",
    gelesenAm: "2026-09-17T12:30:00Z", absatzPosition: 2,
    text: "Die Konferenz endete am Montag mit einer gemeinsamen Erklaerung."
  } };
}
function mehrere() {
  const f = fixture(), d = D.toRawDocumentRow({ ...f.cluster.documents[0],
    title: "Zweite Quelle berichtet ueber die Verkehrskonferenz", url: "https://example.org/politik/zweite-quelle" });
  f.cluster.documents.push(d);
  f.belege = [f.beleg, { ...f.beleg, dokumentId: d.id, artikelUrl: d.url, artikelTitel: d.title,
    quellenHash: A.quellenstandHash(d), text: "Die zweite Quelle berichtet von einer Erklaerung zur Verkehrspolitik." }];
  return f;
}
function pruefstand(overrides = {}) {
  const p = { schritte: [], hashes: [], prompts: [], kos: [], unbekannt: 0 };
  const vertrag = {
    reserviere: async ({ eingabeHash }) => { p.schritte.push("reservieren"); p.hashes.push(eingabeHash); return { erlaubt: true, fencing: 1 }; },
    modellstart: async () => { p.schritte.push("modellstart"); return { erlaubt: true }; },
    schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { p.schritte.push("speichern"); p.kos.push(ko); return { gespeichert: true, pruefbar: true }; },
    freigabe: async () => { p.schritte.push("freigabe"); },
    freigabeOhneAufruf: async () => { p.schritte.push("freigabe-ohne-aufruf"); },
    ausgangUnbekannt: async () => { p.unbekannt++; },
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {}
  };
  const deps = {
    canSpend: async () => { p.schritte.push("budget"); return { allowed: true }; },
    requestUnderstanding: async prompt => { p.schritte.push("modellattrappe"); p.prompts.push(prompt); return { ...ANALYSE }; },
    getExistingStreng: async id => [...p.kos].reverse().find(ko => ko.vorgang_id === id) || null,
    save: async () => { throw new Error("Unbedingter Speicherweg unerlaubt"); },
    saveSources: async (_id, docs) => ({ saved: docs.length }), markFailed: async () => {}, modelName: () => "isolierte-attrappe", logSkip: () => {},
    findVorgangCandidates: async () => [], listVorgangDocuments: async () => [], ...overrides
  };
  return { p, vertrag, deps };
}
function run(f, s, extra = {}) {
  return U.understandOneCluster(f.cluster, s.deps, {
    vorgangId, existing: null, vertrag: s.vertrag, artikelkontextVersuch: f.beleg, ...extra
  });
}
const sources = p => p.split("\n").filter(s => s.startsWith('{"quelle_id":')).map(JSON.parse);
const basisHash = (f, modus = "erst", koVersion = null) => V.eingabeHash({ vorgangId, dokumente: f.cluster.documents, modus, koVersion });
const promptHash = (basis, prompt) => crypto.createHash("sha256")
  .update(JSON.stringify(["artikelkontext-v1", basis, prompt])).digest("hex").slice(0, 40);
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }

async function main() {
  await test("Vollstaendiger vorhandener DGB-Artikel erreicht abgefangenen Modellprompt inklusive Branchenkontext", async () => {
    const fs = require("node:fs"), path = require("node:path");
    const C = require("../lib/helmut/crawler"), G = require("../lib/helmut/artikelkontext-gewinnung");
    const feed = C.parseRssItems(fs.readFileSync(path.join(__dirname, "fixtures/quelleninhalt-20261107/dgb-google.xml"), "utf8"))[0];
    const url = "https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/dritte-tarifrunde-im-gebaeudereiniger-handwerk-endet-ohne-ergebnis/";
    const doc = D.toRawDocumentRow(C.normalizeRawItem({ ...feed, url, originalUrl: feed.url },
      { id: "dgb", name: "DGB", type: "association", url: "https://news.google.com/rss/search?q=site:dgb.de" }));
    const result = G.gewinneArtikeltext(doc, { body: fs.readFileSync(path.join(__dirname, "fixtures/inhaltsversorgung-20261108/dgb-artikel.html"), "utf8"),
      finalUrl: url, gelesenAm: "2026-11-08T08:00:00.000Z" });
    assert.equal(result.ok, true, result.reason);
    const s = pruefstand(), f = { cluster: { documents: [doc] }, beleg: result.beleg };
    const saved = await run(f, s); assert.equal(saved.status, "saved");
    const sent = sources(s.p.prompts[0])[0].artikelkontext;
    assert.equal(sent.text, result.beleg.text); assert(sent.text.includes("700.000 Menschen"));
    assert(sent.text.includes("500.000 von ihnen")); assert.equal(sent.gewinnung.verfahren, "artikeltext-v3");
    assert.deepEqual(saved.promptDokumentIds, [doc.id]);
  });
  await test("Volltextbudget zaehlt serialisierte Eingabe und setzt ganze nichtgesendete Quellen fort", async () => {
    const f = fixture(), hash = value => crypto.createHash("sha256").update(value).digest("hex");
    // Deklarierte synthetische Grosskontexte mit JSON-Escaping, kein Lasttest.
    const text = ('Die Konferenz diskutiert "Bahnstrecken" und \\Finanzierung\\. ').repeat(110);
    f.cluster.documents = Array.from({ length: 12 }, (_, i) => D.toRawDocumentRow({ ...f.cluster.documents[0],
      url: `https://example.org/konferenz/volltext-${i}`, title: `${ANALYSE.display_title} Quelle ${i}` }));
    const belege = f.cluster.documents.map(d => A.pruefeArtikelkontext([d], { version: 2,
      dokumentId: d.id, quellenHash: A.quellenstandHash(d), artikelUrl: d.url, artikelTitel: d.title,
      herkunft: "strukturierter-originalartikel", gelesenAm: "2026-09-17T12:30:00Z", absatzPosition: 1, text: text.trim(),
      gewinnung: { verfahren: "artikeltext-v3", positionsbasis: "html-article-p", antwortHash: hash("synthetische HTML-Antwort"),
        artikelTextHash: hash(text.trim()), artikelTextPosition: 0, titelTreffer: 0, kandidatZahl: 1,
        artikelAbsatzZahl: 1, absaetze: [text.trim()], zwischenTexte: [], struktur: "jsonld",
        datumsFeld: "datePublished", originalDatum: d.published_at, kanonischDeklariert: d.url } }));
    const ids = f.cluster.documents.map(d => d.id), s = pruefstand({ runId: "queue-volltextbudget",
      listVorgangDocuments: async () => f.cluster.documents });
    s.deps.artikelkontextVersorgung = async selected => ({ angefordert: true, ok: true,
      belege: belege.filter(b => selected.some(d => d.id === b.dokumentId)) });
    s.deps.artikelkontextVersorgung.nurBestand = true;
    let rest = ids, existing = null;
    for (let i = 0; rest.length && i < 4; i++) {
      const result = await run(f, s, { artikelkontextVersuch: undefined, existing, quellenRestDokumentIds: rest });
      assert(["saved", "updated"].includes(result.status), JSON.stringify(result));
      const sent = sources(s.p.prompts.at(-1));
      assert(sent.length > 0 && sent.length < 12); assert.deepEqual(result.promptDokumentIds, sent.map(q => q.quelle_id));
      assert(sent.every(q => q.artikelkontext.text === text.trim()), "Keine kuerzeren Saetze zur Budgetanpassung");
      const schema = require("../lib/helmut/understanding-schema").KNOWLEDGE_OBJECT_SCHEMA;
      assert(Buffer.byteLength(JSON.stringify({ input: s.p.prompts.at(-1), schema }), "utf8") + 4096 <= 128000);
      const next = rest.filter(id => !result.promptDokumentIds.includes(id));
      assert(next.length < rest.length, "Rest muss trotz stabiler globaler Sortierung fortschreiten");
      rest = next; existing = { ...s.p.kos.at(-1), status: "active", understanding_status: "complete" };
    }
    assert.equal(rest.length, 0); assert(s.p.prompts.length > 1);
    assert.equal(existing.classification_confidence.helmut_quellen_lektuere.quellen.length, 12);
  });
  await test("13 Quellen behalten den ungelesenen Rest und aktualisieren complete mit hoechstens 12 Promptquellen", async () => {
    const f = fixture();
    f.cluster.documents = Array.from({ length: 13 }, (_, i) => D.toRawDocumentRow({
      ...f.cluster.documents[0], url: `https://example.org/konferenz/quelle-${i}`,
      title: `${ANALYSE.display_title} Quelle ${i}` }));
    const ids = f.cluster.documents.map(d => d.id), links = [];
    const s = pruefstand({ runId: "queue-13-quellen", listVorgangDocuments: async () => f.cluster.documents,
      saveSources: async (_ko, docs) => { links.push(...docs.map(d => d.id)); return { saved: docs.length }; } });
    let reservierterHash, gespeicherterHash;
    const reserviere = s.vertrag.reserviere, speichere = s.vertrag.speichere;
    s.vertrag.reserviere = async args => {
      reservierterHash = args.eingabeHash;
      if (reservierterHash === gespeicherterHash) return { erlaubt: false, grund: "bereits-fertig" };
      return reserviere(args);
    };
    s.vertrag.speichere = async args => { const result = await speichere(args); gespeicherterHash = reservierterHash; return result; };
    s.deps.listWiederaufnahmen = async () => { throw new Error("Keine Betreiberfreigabe fuer Queue-Rest"); };
    const extra = { artikelkontextVersuch: undefined, quellenRestDokumentIds: ids };
    const first = await run(f, s, extra);
    assert.equal(first.status, "saved");
    assert.equal(first.promptDokumentIds.length, 12);
    assert.deepEqual(first.promptDokumentIds, sources(s.p.prompts[0]).map(q => q.quelle_id));
    assert.equal(new Set(links).size, 13, "Herkunftsverknuepfung darf nicht als Lektuere aller Quellen gelten");
    const rest = ids.filter(id => !first.promptDokumentIds.includes(id));
    assert.equal(rest.length, 1);
    const existing = { ...s.p.kos[0], status: "active", understanding_status: "complete", ko_version: 1 };
    const replay = await run(f, s, { ...extra, existing });
    assert.equal(replay.status, "duplicate"); assert.equal(replay.begruendung, "eingabe-bereits-verstanden");
    assert.equal(replay.promptBereitsGespeichert, true);
    assert.deepEqual(replay.promptDokumentIds, first.promptDokumentIds);
    assert.equal(s.p.prompts.length, 1, "Crash nach KO-Speichern fuehrt nicht zum zweiten Modellaufruf");
    const next = await run(f, s, { ...extra, existing, quellenRestDokumentIds: rest });
    assert.equal(next.status, "updated"); assert.equal(next.koVersion, 2);
    assert.equal(next.promptDokumentIds.length, 12); assert(next.promptDokumentIds.includes(rest[0]));
    assert.deepEqual(next.promptDokumentIds, sources(s.p.prompts[1]).map(q => q.quelle_id));
    assert.equal(new Set([...first.promptDokumentIds, ...next.promptDokumentIds]).size, 13);
    assert.notEqual(s.p.hashes[0], s.p.hashes[1]);
    const replayNext = await run(f, s, { ...extra, existing: s.p.kos[1], quellenRestDokumentIds: rest });
    assert.equal(replayNext.promptBereitsGespeichert, true); assert.equal(s.p.prompts.length, 2);
    // Ein anderer Auftrag mit einer ueberlappenden TEILMENGE hat weder denselben
    // Job noch dieselbe Resteingabe. Nur der dauerhaft gespeicherte Quellenbeleg traegt.
    s.deps.runId = "queue-zweiter-auftrag";
    const teil = { cluster: { documents: f.cluster.documents.slice(2, 6) } };
    const andererJob = await run(teil, s, { artikelkontextVersuch: undefined, existing: s.p.kos[1],
      quellenRestDokumentIds: teil.cluster.documents.map(d => d.id) });
    assert.equal(andererJob.status, "duplicate"); assert.equal(andererJob.promptBereitsGespeichert, true);
    assert(teil.cluster.documents.every(d => andererJob.promptDokumentIds.includes(d.id)));
    assert.equal(s.p.prompts.length, 2, "Anderer Queuejob modelliert bestaetigte Quellen nicht erneut");
    assert.equal(s.p.kos[1].classification_confidence.helmut_quellen_lektuere.quellen.length, 13);
    assert.equal(f.cluster.quellenRest, undefined, "Queue-Prioritaet mutiert den Eingabecluster nicht");
  });
  await test("Queue-Rest ist an aktuelle Dokumente und Auftrag gebunden und behaelt CAS Budget Deadline Endzustand", async () => {
    const f = fixture(), ids = f.cluster.documents.map(d => d.id);
    for (const rest of [["rd-fremd"], [...ids, ...ids], "falsch"]) {
      const s = pruefstand({ runId: "queue-negativ" });
      await assert.rejects(run(f, s, { quellenRestDokumentIds: rest }), /quellen-restbindung-ungueltig/);
      assert.deepEqual(s.p.schritte, []);
    }
    await assert.rejects(run(f, pruefstand(), { quellenRestDokumentIds: ids }), /quellen-restbindung-ungueltig/);
    for (const mode of ["cas", "budget", "deadline", "terminal", "unbekannt", "versuchsdeckel", "vormerkung-lesefehler"]) {
      const s = pruefstand({ runId: "queue-negativ", listVorgangDocuments: async () => f.cluster.documents });
      const extra = { artikelkontextVersuch: undefined, quellenRestDokumentIds: ids,
        existing: { id: "ko-" + vorgangId, status: "active", ko_version: 1, understanding_status: "complete" } };
      s.deps.getExistingStreng = async () => extra.existing;
      if (mode === "cas") extra.vertrag = null;
      if (mode === "budget") s.deps.canSpend = async () => ({ allowed: false });
      if (mode === "deadline") extra.deadlineMs = Date.now() - 1;
      if (mode === "terminal") extra.existing.understanding_status = "failed-final";
      if (mode === "unbekannt") s.vertrag.reserviere = async () => ({ erlaubt: false, grund: "ausgang-unbekannt" });
      if (mode === "versuchsdeckel") s.vertrag.vormerkungLese = async () => ({ verfuegbar: true, vorhanden: true, fehlversuche: 999 });
      if (mode === "vormerkung-lesefehler") s.vertrag.vormerkungLese = async () => ({ verfuegbar: false });
      const r = await run(f, s, extra);
      assert(r.status.startsWith("skipped-"), mode); assert.equal(r.promptDokumentIds, undefined, mode);
      assert.equal(r.promptBereitsGespeichert, undefined, mode); assert.equal(s.p.prompts.length, 0, mode);
    }
  });
  await test("Globaler Lektuerebeleg bindet separaten Textstand und weist Manipulation sowie konkurrierenden Bestand ab", async () => {
    const f = fixture(), ids = f.cluster.documents.map(d => d.id);
    const s = pruefstand({ runId: "auftrag-original", listVorgangDocuments: async () => f.cluster.documents });
    await run(f, s, { quellenRestDokumentIds: ids });
    const existing = s.p.kos[0], old = structuredClone(existing);
    s.deps.runId = "auftrag-anders";
    assert.equal((await run(f, s, { existing, quellenRestDokumentIds: ids })).status, "duplicate");
    assert.equal(s.p.prompts.length, 1);
    const kaputt = structuredClone(existing);
    kaputt.classification_confidence.helmut_quellen_lektuere.quellen[0].textstandHash = "0".repeat(64);
    const invalid = await run(f, s, { existing: kaputt, quellenRestDokumentIds: ids });
    assert.equal(invalid.status, "skipped-bestandslesefehler"); assert.equal(invalid.promptDokumentIds, undefined);
    assert.equal(s.p.prompts.length, 1);
    const beleg = { ...f.beleg, text: "Ein anderer gebundener Absatz beschreibt den aktualisierten Konferenzbeschluss." };
    const changed = await run(f, s, { existing, artikelkontextVersuch: beleg, quellenRestDokumentIds: ids });
    assert.equal(changed.status, "updated"); assert.equal(s.p.prompts.length, 2);
    assert.notEqual(s.p.kos[1].classification_confidence.helmut_quellen_lektuere.quellen[0].textstandHash,
      old.classification_confidence.helmut_quellen_lektuere.quellen[0].textstandHash);
    const t = pruefstand({ runId: "auftrag-konkurrierend", listVorgangDocuments: async () => f.cluster.documents });
    const snapshot = { id: "ko-" + vorgangId, vorgang_id: vorgangId, status: "active", ko_version: 1,
      understanding_status: "complete", source_document_count: 1 };
    let aktuell = snapshot;
    t.deps.getExistingStreng = async () => aktuell;
    const reserve = t.vertrag.reserviere;
    t.vertrag.reserviere = async args => { aktuell = { ...snapshot, ko_version: 2 }; return reserve(args); };
    const raced = await run(f, t, { existing: snapshot, quellenRestDokumentIds: ids });
    assert.equal(raced.status, "skipped-veraltet"); assert.equal(raced.promptDokumentIds, undefined);
    assert.equal(t.p.prompts.length, 0); assert(t.p.schritte.includes("freigabe"));
  });
  await test("Schattenlauf reicht Queue-Rest bis zum echten Updateprompt und ueberspringt bereits gelesene Cluster", async () => {
    const f = fixture(), docs = Array.from({ length: 13 }, (_, i) => D.toRawDocumentRow({
      ...f.cluster.documents[0], url: `https://example.org/schatten/quelle-${i}` }));
    const fremd = D.toRawDocumentRow({ title: "Windenergiegesetz regelt Offshoreparks in Nordsee",
      summary: "Das Windenergiegesetz foerdert Offshoreanlagen an der Nordsee.",
      url: "https://example.org/offshore", publishedAt: "2026-09-14T16:00:00Z" });
    const s = pruefstand({ enabled: () => true, aiEnabled: () => true,
      acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
      getExistingStreng: async id => s.p.kos.find(ko => ko.vorgang_id === id) || null,
      listVorgangDocuments: async () => docs, gateMode: () => "off", priorityEnabled: () => false });
    const deps = { ...s.deps, runId: "queue-schatten", verstehenVertrag: () => s.vertrag };
    const first = await U.runUnderstandingShadow([...docs, fremd], {
      ...deps, quellenRestDokumentIds: docs.map(d => d.id) });
    assert.equal(first.clusters, 1); assert.equal(first.results[0].status, "saved");
    const read = first.results[0].promptDokumentIds;
    assert.equal(read.length, 12); assert(!read.includes(fremd.id));
    const rest = docs.filter(d => !read.includes(d.id)).map(d => d.id);
    assert.equal(rest.length, 1);
    const next = await U.runUnderstandingShadow([...docs, fremd], { ...deps, quellenRestDokumentIds: rest });
    assert.equal(next.clusters, 1); assert.equal(next.results[0].status, "updated");
    assert(next.results[0].promptDokumentIds.includes(rest[0]));
    assert.equal(s.p.prompts.length, 2); assert.equal(sources(s.p.prompts[1]).length, 12);
  });
  await test("Singlepromptbytes aus main e8a4b08b bleiben auch mit einteiligem Belegarray exakt erhalten", async () => {
    const f = fixture(), sha = s => crypto.createHash("sha256").update(s).digest("hex");
    assert.equal(sha(U.buildUnderstandingPrompt(f.cluster)), "f0eb1dae2543d9e3a8dfda9f65e20015a20dd4aac264c5e72b2eebf69d834304");
    const single = U.buildUnderstandingPrompt(f.cluster, { artikelkontextVersuch: f.beleg });
    assert.equal(sha(single), "d844632ab3f18e2b2a7b2e38751ae7a229ff65ba94fada3fd4607c55039d80f1");
    assert.equal(U.buildUnderstandingPrompt(f.cluster, { artikelkontextBelege: [f.beleg] }), single);
    const s = pruefstand();
    await run(f, s);
    await run(f, s, { artikelkontextVersuch: undefined, artikelkontextBelege: [f.beleg] });
    assert.equal(s.p.hashes[0], s.p.hashes[1]); assert.equal(s.p.prompts[0], s.p.prompts[1]);
  });
  await test("Mehrere Texte bleiben getrennt und vollstaendig in Prompt und Reservierungskennung", async () => {
    const f = mehrere(), s = pruefstand(), before = structuredClone(f);
    const extra = { artikelkontextVersuch: undefined, artikelkontextBelege: f.belege };
    assert.equal((await run(f, s, extra)).status, "saved");
    assert.equal(s.p.hashes[0], promptHash(basisHash(f), s.p.prompts[0]));
    for (const b of f.belege) {
      const q = sources(s.p.prompts[0]).find(q => q.quelle_id === b.dokumentId);
      assert.equal(q.artikelkontext.text, b.text); assert.equal(q.url, b.artikelUrl);
    }
    await run(f, s, { ...extra, artikelkontextBelege: [...f.belege].reverse() });
    assert.equal(s.p.hashes[0], s.p.hashes[1]); assert.equal(s.p.prompts[0], s.p.prompts[1]);
    await run(f, s, { ...extra, artikelkontextBelege: [f.belege[0], { ...f.belege[1], text: "Zweiter gebundener Originalabsatz." }] });
    assert.notEqual(s.p.hashes[0], s.p.hashes[2]); assert.deepEqual(f, before);
  });
  await test("Leere, doppelte, fremde oder widerspruechliche Mehrbelege stoppen vor Wirkungen", async () => {
    const f = mehrere();
    for (const belege of [[], [f.belege[0], f.belege[0]],
      [f.belege[0], { ...f.belege[1], quellenHash: "0".repeat(64) }],
      [f.belege[0], { ...f.belege[1], dokumentId: "rd-fremd" }], Array(13).fill(f.belege[0])]) {
      assert.throws(() => U.buildUnderstandingPrompt(f.cluster, { artikelkontextBelege: belege }), /artikelkontext-/);
      const s = pruefstand();
      const result = await run(f, s, { artikelkontextVersuch: undefined, artikelkontextBelege: belege });
      assert.equal(result.status, "skipped-artikelkontext"); assert.deepEqual(s.p.schritte, []);
    }
    assert.throws(() => U.buildUnderstandingPrompt(f.cluster,
      { artikelkontextVersuch: f.beleg, artikelkontextBelege: f.belege }), /doppelte-option/);
    const s = pruefstand();
    assert.equal((await run(f, s, { artikelkontextBelege: f.belege })).status, "skipped-artikelkontext");
    assert.deepEqual(s.p.schritte, []);
  });
  await test("Mehrbelege bleiben auch bei Aktualisierung und nachtraeglicher Mutation an reservierte Eingabe gebunden", async () => {
    const f = mehrere(), s = pruefstand(), expected = U.buildUnderstandingPrompt(f.cluster, { artikelkontextBelege: f.belege });
    const reserve = s.vertrag.reserviere, original = structuredClone(f);
    s.vertrag.reserviere = async args => {
      const result = await reserve(args);
      f.belege[1].text = "Nachtraegliche Aenderung";
      f.cluster.documents[1].summary = "Nachtraegliche Quellenmutation";
      return result;
    };
    const result = await U.understandUpdate(f.cluster, s.deps, { vorgangId,
      existing: { id: "ko-" + vorgangId, ko_version: 4 }, neueDocs: [], neueAnker: [], spur: {},
      alleDocs: f.cluster.documents, vertrag: s.vertrag, artikelkontextBelege: f.belege });
    assert.equal(result.status, "updated"); assert.equal(result.koVersion, 5);
    assert.equal(s.p.prompts[0], expected);
    assert.equal(s.p.hashes[0], promptHash(basisHash(original, "update", 5), expected));
  });
  await test("Erstverstehen reicht den geprueften Beleg weiter und reserviert genau diesen Prompt", async () => {
    const f = fixture(), before = structuredClone(f), s = pruefstand();
    const r = await run(f, s);
    assert.equal(r.status, "saved");
    assert.equal(s.p.prompts.length, 1);
    assert.equal(sources(s.p.prompts[0])[0].artikelkontext?.text, f.beleg.text,
      "Der vorbereitete Originalkontext geht vor dem Verstehensaufruf verloren");
    assert.equal(s.p.hashes[0], promptHash(basisHash(f), s.p.prompts[0]));
    assert.deepEqual(s.p.schritte, ["reservieren", "budget", "modellstart", "modellattrappe", "speichern"]);
    assert.deepEqual(f, before);
    assert(!JSON.stringify(s.p.kos).includes("artikelkontext"), "Kein Text wird in fremde KO Felder geschmuggelt");
  });

  await test("Ohne Zusatz bleiben normaler Prompt und bisherige Reservierungskennung identisch", async () => {
    const f = fixture(), s = pruefstand();
    await run(f, s, { artikelkontextVersuch: undefined });
    assert.equal(s.p.prompts[0], U.buildUnderstandingPrompt(f.cluster));
    assert.equal(s.p.hashes[0], basisHash(f));
    const inherited = Object.assign(Object.create({ artikelkontextVersuch: f.beleg }),
      { vorgangId, existing: null, vertrag: s.vertrag });
    await U.understandOneCluster(f.cluster, s.deps, inherited);
    assert.equal(s.p.prompts[1], s.p.prompts[0]);
    assert.equal(s.p.hashes[1], s.p.hashes[0]);
  });

  await test("Anderer Zusatz und kein Zusatz werden bei gleicher Dokumentmenge unterschieden", async () => {
    const f = fixture(), s = pruefstand();
    await run(f, s);
    await run(f, s);
    f.beleg.text = "Der Termin soll erst am Dienstag stattfinden; die Angabe ist widerspruechlich.";
    await run(f, s);
    await run(f, s, { artikelkontextVersuch: undefined });
    assert.equal(s.p.hashes[0], s.p.hashes[1]);
    assert.notEqual(s.p.hashes[0], s.p.hashes[2]);
    assert.notEqual(s.p.hashes[0], s.p.hashes[3]);
    assert.equal(sources(s.p.prompts[2])[0].artikelkontext.text, f.beleg.text);
  });

  await test("Nach der Reservierung veraenderte Objekte veraendern den vorbereiteten Prompt nicht", async () => {
    const f = fixture(), s = pruefstand();
    const originalUrl = f.cluster.documents[0].url;
    const expected = U.buildUnderstandingPrompt(f.cluster, { artikelkontextVersuch: f.beleg });
    const reserve = s.vertrag.reserviere;
    s.vertrag.reserviere = async args => {
      const r = await reserve(args);
      f.beleg.text = "Nachtraeglicher Fremdtext.";
      f.cluster.documents[0].summary = "Nachtraeglich veraenderte Quelle.";
      f.cluster.documents[0].url = "https://example.org/fremder-artikel";
      return r;
    };
    await run(f, s);
    assert.equal(s.p.prompts[0], expected);
    assert.equal(s.p.hashes[0], promptHash(basisHash(f), expected));
    assert.equal(s.p.kos[0].best_source_url, originalUrl,
      "Auch der Quellenzeiger des Ergebnisses muss zur reservierten Eingabe gehoeren");
  });

  await test("Ungueltiger Zusatz oder fehlender CAS Vertrag endet vor Reservierung und Budget", async () => {
    for (const value of [null, { ...fixture().beleg, text: "x".repeat(601) },
      { ...fixture().beleg, dokumentId: "rd-fremd" }, { ...fixture().beleg, quellenHash: "0".repeat(64) }]) {
      const f = fixture(), s = pruefstand();
      await assert.rejects(run(f, s, { artikelkontextVersuch: value }), /artikelkontext-/);
      assert.deepEqual(s.p.schritte, []);
    }
    const f = fixture(), s = pruefstand();
    await assert.rejects(run(f, s, { vertrag: null }), /artikelkontext-cas-erforderlich/);
    assert.deepEqual(s.p.schritte, []);
  });

  await test("Direkte Aktualisierung bindet Beleg an alle Quelldokumente und die naechste Version", async () => {
    const f = fixture(), s = pruefstand();
    const originalUrl = f.cluster.documents[0].url;
    const reserve = s.vertrag.reserviere;
    s.vertrag.reserviere = async args => {
      const r = await reserve(args);
      f.cluster.documents[0].url = "https://example.org/fremde-fortsetzung";
      f.beleg.text = "Nach der Reservierung veraendert.";
      return r;
    };
    const originalText = f.beleg.text;
    const ctx = { vorgangId, existing: { id: "ko-" + vorgangId, ko_version: 4 },
      neueDocs: [], neueAnker: [], spur: {}, alleDocs: f.cluster.documents,
      vertrag: s.vertrag, artikelkontextVersuch: f.beleg };
    const r = await U.understandUpdate(f.cluster, s.deps, ctx);
    assert.equal(r.status, "updated"); assert.equal(r.koVersion, 5);
    assert.equal(sources(s.p.prompts[0])[0].artikelkontext.text, originalText);
    assert.equal(s.p.hashes[0], promptHash(basisHash(f, "update", 5), s.p.prompts[0]));
    assert.equal(s.p.kos[0].best_source_url, originalUrl);
  });

  await test("Weiterleitung in ausdruecklich freigegebene Aktualisierung erhaelt den Zusatz", async () => {
    const f = fixture(), s = pruefstand({ listVorgangDocuments: async () => f.cluster.documents });
    const r = await run(f, s, { existing: { id: "ko-" + vorgangId, status: "active", ko_version: 1 }, wiederaufnahmeFreigabe: true });
    assert.equal(r.status, "updated");
    assert.equal(sources(s.p.prompts[0])[0].artikelkontext.text, f.beleg.text);
  });

  await test("Neue Dokumente und vorgemerkte Aktualisierungen erhalten denselben expliziten Vertrag", async () => {
    for (const mode of ["neu", "vorgemerkt"]) {
      const f = fixture();
      const old = { ...f.cluster.documents[0], id: "rd-bestand", title: "Konferenz beginnt in Neustadt",
        summary: "Die Teilnehmenden treffen ein.", url: "https://example.org/politik/beginn",
        canonical_url: "https://example.org/politik/beginn" };
      const s = pruefstand({ listVorgangDocuments: async () => mode === "neu" ? [old] : f.cluster.documents });
      if (mode === "vorgemerkt") s.vertrag.vormerkungLese = async () => ({ verfuegbar: true, vorhanden: true, fehlversuche: 0 });
      const r = await run(f, s, { existing: { id: "ko-" + vorgangId, status: "active", ko_version: 1 } });
      assert.equal(r.status, "updated", mode);
      const q = sources(s.p.prompts[0]).find(q => q.artikelkontext);
      assert.equal(q.artikelkontext.text, f.beleg.text);
      assert.equal(q.artikelkontext.dokumentId, f.beleg.dokumentId);
      if (mode === "neu") assert.equal(sources(s.p.prompts[0]).length, 2);
    }
  });

  await test("Ein Zusatz erzwingt weder Neuverstehen eines Duplikats noch ein Aufheben des Endzustands", async () => {
    for (const existing of [{ id: "ko-" + vorgangId, status: "active", ko_version: 1 },
      { id: "ko-" + vorgangId, status: "pending", understanding_status: "failed-final" }]) {
      const f = fixture(), s = pruefstand({ listVorgangDocuments: async () => f.cluster.documents });
      const r = await run(f, s, { existing });
      assert(["duplicate", "skipped-terminal"].includes(r.status));
      assert.deepEqual(s.p.schritte, []);
    }
  });

  await test("Reservierungsabsage, unbekannter Ausgang, Budget und Deadline bleiben wirksam", async () => {
    for (const grund of ["belegt", "ausgang-unbekannt", "bereits-fertig"]) {
      const f = fixture(), s = pruefstand();
      s.vertrag.reserviere = async () => ({ erlaubt: false, grund });
      await run(f, s);
      assert.deepEqual(s.p.schritte, []);
    }
    const f = fixture(), s = pruefstand({ canSpend: async () => ({ allowed: false, reason: "budget" }) });
    assert.equal((await run(f, s)).status, "skipped-budget");
    assert.equal(s.p.prompts.length, 0); assert(s.p.schritte.includes("freigabe"));
    const t = pruefstand();
    assert.equal((await run(f, t, { deadlineMs: Date.now() - 1 })).status, "skipped-zeitbudget");
    assert.deepEqual(t.p.schritte, []);
  });
  await test("Langer RSS-Originalstand erreicht das Modell Abschnitt fuer Abschnitt ohne falschen Volllektuerestatus", async () => {
    const f = fixture(), doc = f.cluster.documents[0];
    doc.summary = Array.from({ length: 240 }, (_, i) => `Die Konferenz behandelt Bahnstrecken und Finanzierung im Abschnitt ${i} zur konkreten Planung.`).join(" ");
    const B = require("../lib/helmut/artikel-abschnitte"), bundle = B.segmentiere(doc.summary);
    assert(bundle.count > 1);
    const s = pruefstand({ runId: "queue-abschnitte", listVorgangDocuments: async () => [doc] });
    let existing = null;
    const gesendet = [];
    for (let index = 0; index < bundle.count; index++) {
      const extra = { artikelkontextVersuch: undefined, existing, quellenRestDokumentIds: [doc.id], quellenAbschnitte: { [doc.id]: index } };
      const result = await run(f, s, extra);
      assert(["saved", "updated"].includes(result.status), JSON.stringify(result));
      const q = sources(s.p.prompts.at(-1))[0];
      assert.equal(q.auszug, bundle.abschnitte[index].text); assert.equal(q.quellenabschnitt.index, index);
      assert.equal(q.quellenabschnitt.abschnitte, undefined, "Andere Originalabschnitte gehoeren nicht in dieselbe Modelleingabe");
      assert.equal(result.promptAbschnitte[doc.id].index, index); gesendet.push(q.auszug);
      existing = { ...s.p.kos.at(-1), status: "active", understanding_status: "complete" };
      assert.equal(existing.classification_confidence.helmut_quellen_lektuere.quellen[0].geleseneAbschnitte.length, index + 1);
      const vorher = s.p.prompts.length;
      const replay = await run(f, s, { ...extra, existing });
      assert.equal(replay.status, "duplicate"); assert.equal(replay.promptBereitsGespeichert, true);
      assert.equal(s.p.prompts.length, vorher, "Speichern vor Cursorwrite darf keinen zweiten Modellaufruf ausloesen");
    }
    assert.equal(gesendet.join(""), doc.summary);
    assert.equal(existing.classification_confidence.helmut_quellen_lektuere.quellen[0].geleseneAbschnitte.length, bundle.count);
    const p = pruefstand({ runId: "queue-falscher-abschnitt" });
    await assert.rejects(() => run(f, p, { artikelkontextVersuch: undefined, quellenRestDokumentIds: [doc.id], quellenAbschnitte: { [doc.id]: 1 } }), /abschnittsreihenfolge/);
    assert.equal(p.p.prompts.length, 0);
  });
  await test("Kanonische Quellenquittung ueberlebt JSONB-Reihenfolge; historischer v1-Beleg bleibt explizit und wiederverwendbar", async () => {
    const f = fixture(), doc = f.cluster.documents[0], s = pruefstand({ runId: "receipt-jsonb", listVorgangDocuments: async () => f.cluster.documents });
    const extra = { quellenRestDokumentIds: [doc.id] };
    const result = await run(f, s, extra); assert.equal(result.status, "saved");
    const ko = { ...s.p.kos.at(-1), status: "active", understanding_status: "complete" };
    const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().reverse().map(k => [k, reorder(value[k])])) : value;
    const L = require("../lib/helmut/quellen-lektuerebeleg");
    assert.deepEqual(L.leseQuellenLektuere(reorder(ko)), L.leseQuellenLektuere(ko));
    const before = s.p.prompts.length;
    assert.equal((await run(f, s, { ...extra, existing: reorder(ko) })).promptBereitsGespeichert, true);
    assert.equal(s.p.prompts.length, before);
    const legacy = structuredClone(ko), oldq = L.quellenLektuereBeleg(sources(s.p.prompts[0])[0], 1);
    delete oldq.hashVersion;
    const b = { version: 1, vorgangId: legacy.vorgang_id, koVersion: legacy.ko_version, quellen: [oldq] };
    b.belegHash = crypto.createHash("sha256").update(JSON.stringify([b.version, b.vorgangId, b.koVersion, b.quellen])).digest("hex");
    legacy.classification_confidence.helmut_quellen_lektuere = b;
    assert.equal(L.leseQuellenLektuere(reorder(legacy))[0].hashVersion, 1);
    const replay = await run(f, s, { ...extra, existing: reorder(legacy) });
    assert.equal(replay.promptBereitsGespeichert, true); assert.equal(s.p.prompts.length, before);
  });
  console.log(`${pass}/${pass} Pruefgruppen erfolgreich; ausschliesslich isolierte Attrappen.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
