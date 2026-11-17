"use strict";

// Gezielter neuer Liefervertrag mit bestehenden synthetischen Quellen und dem
// echten HTTP-Handler. Kein Lastlauf, Browser, Modell oder Datenbankzugriff.
const A = require("node:assert/strict");
const B = require("../lib/helmut/briefing-speicher");
const D = require("../lib/helmut/tagespaket-auslieferung");
const L = require("../lib/helmut/briefing-lauf");
const P = require("../lib/helmut/publication-eligibility");
const S = require("../lib/helmut/storage");
const fixture = require("./fixtures/profilhash-integration");
const { profile, day, now } = fixture;
const clone = structuredClone;
let n = 0;
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
async function test(name, fn) { if (only && !name.includes(only)) return; await fn(); n++; console.log("PASS " + name); }
async function state({ partial = false } = {}) {
  const original = fixture.fixture(), rows = new Map(), reads = [];
  const text = clone(original.text); rows.set(text.id, text);
  const briefing = clone(fixture.briefing);
  briefing.items = briefing.items.map((v,i) => ({ ...v, title: "Synthetische Beratung " + i,
    sources: [{ url: "https://example.invalid/dokument/" + (i + 1), publishedAt: day + "T05:00:00Z" }] }));
  briefing.currentHelmutState.status = "fresh";
  if (partial) briefing.currentHelmutState.versorgung = { version: 1, zustand: "offen" };
  briefing.currentRadarState = { status: "fresh", articles: [{ vorgangId: "vg-synth-1", title: "Gespeicherter Radarhinweis" }] };
  briefing.tagespaketGrundlage = [1,2].map(i => ({ id: "ko-synth-" + i, vorgang_id: "vg-synth-" + i }));
  const lageAnsicht = { ...B.lageAusgabe(text.payload), vorgaenge: [1,2].map(i => ({
    vorgangId: "vg-synth-" + i, displayTitle: "Gespeicherte Lagekarte " + i,
    displaySummary: "Vollstaendige gepruefte Kartenansicht", sources: briefing.items[i - 1].sources })) };
  const storage = { assertTenant: S.assertTenant,
    getRenderedBriefingV3: async (id, slot, tag) => {
      reads.push([id,slot,tag]); return clone(rows.get(`bf-${id}-${slot}-${tag}`) || null);
    },
    insertRenderedBriefingV3: async row => { rows.set(row.id, clone(row)); return { saved: true }; },
    ergaenzeUnvollstaendigesBriefing: async (before, after) => {
      A.deepEqual(rows.get(before.id), before); rows.set(after.id, clone(after)); return { saved: true };
    }
  };
  await B.materialisiere({ profile, userId: profile.id, now, briefing, lageAnsicht, storage });
  const row = rows.get(`bf-${profile.id}-${B.SLOT}-${day}`);
  const receipt = L.quittung({ tenantId: profile.id, berlinTag: day, erzeugtAm: now,
    status: L.STATUS_ERFOLG, ausgabeBeleg: require("../lib/helmut/briefing-ausgabebeleg").ausPaket(row),
    fensterStart: day + "T00:00:00Z" });
  rows.set(L.laufId(profile.id,day), { id: L.laufId(profile.id,day), user_id: profile.id,
    slot: L.SLOT_ERFOLG, generated_at: now.toISOString(), payload: receipt });
  reads.length = 0;
  return { rows, reads, storage, row, briefing, lageAnsicht,
    read: args => D.lese({ userId: profile.id, profile, now, storage, ...args }) };
}
function bindeTeststand(f) {
  const row = f.rows.get(f.row.id);
  row.payload.quellenStand = D.quellenStand(row.payload);
  row.payload.inhaltHash = B.inhaltHash(row.payload);
  f.rows.get(L.laufId(profile.id, day)).payload = L.quittung({ tenantId: profile.id, berlinTag: day,
    erzeugtAm: now, status: L.STATUS_ERFOLG,
    ausgabeBeleg: require("../lib/helmut/briefing-ausgabebeleg").ausPaket(row), fensterStart: day + "T00:00:00Z" });
}
(async () => {
  await test("Normale Auslieferung liest genau Paket und gebundene Quittung, kein Korpus", async () => {
    const f = await state(), before = JSON.stringify([...f.rows]);
    const result = await f.read();
    A.deepEqual(result.briefing.items, f.briefing.items);
    A.deepEqual(result.briefing.currentRadarState, f.briefing.currentRadarState);
    A.deepEqual(result.briefing.lageBriefing.vorgaenge, f.lageAnsicht.vorgaenge);
    A.equal(result.briefing.paketStatus.vollstaendig, true);
    A.equal(result.briefing.paketStatus.quittungGebunden, true);
    A.equal(result.frischeKontext.lauf.status, "erfolg");
    A.equal(f.reads.length, 2); A.equal(JSON.stringify([...f.rows]), before);
    A.equal(result.briefing.paketStatus.fachlicheVollabnahme, false);
  });
  await test("Offene Einzelartikel erhalten Lage, Radar und Briefing als ehrlichen Teilstand", async () => {
    const f = await state({ partial: true }), result = await f.read();
    A.equal(result.briefing.paketStatus.zustand, "teilweise");
    A(result.briefing.paketStatus.fehler.includes("quellenversorgung-unvollstaendig"));
    A.deepEqual(result.briefing.items, f.briefing.items);
    A.deepEqual(result.briefing.lageBriefing.vorgaenge, f.lageAnsicht.vorgaenge);
    A.deepEqual(result.briefing.currentRadarState, f.briefing.currentRadarState);
  });
  await test("Lageabsatz zeigt aktuellen Mandatsbezug ohne Text-, Hash-, Quittungs- oder Speicherverlust", async () => {
    const f = await state(), before = clone([...f.rows]), out = (await f.read()).briefing;
    const paragraphs = out.lageBriefing.paragraphs;
    A.equal(paragraphs.length, 2);
    A.match(paragraphs[0].relevanz.satz, /Stellvertretung.*Haushaltsausschuss/);
    A.match(paragraphs[1].relevanz.satz, /Pflege/);
    for (const [index, p] of paragraphs.entries()) {
      const { relevanz, ...original } = p;
      A.deepEqual(original, f.lageAnsicht.paragraphs[index]); A(relevanz.belege.length > 0);
    }
    A.equal(out.gespeicherterNachweis.inhaltHash, f.row.payload.inhaltHash);
    A.equal(out.paketStatus.quittungGebunden, true); A.equal(f.reads.length, 2);
    A.deepEqual([...f.rows], before); A(!JSON.stringify(out).includes("mandatsbegruendung"));
    A.equal((await f.read({ profile: { ...profile, committees: ["Gesundheitsausschuss"] } })).briefing.available, false);
  });
  await test("Aktuelle belegte Karten ersetzen alte Cachegruende und ordnen Fachthema vor Stellvertretung", async () => {
    const f = await state(), row = f.rows.get(f.row.id);
    row.payload.lageAnsicht.vorgaenge = B.lageAusgabe(row.payload.lage).vorgaenge.map(k => ({ ...k,
      relevanz: { satz: "VERALTETER PERSOENLICHER GRUND", belege: [] }, whyRelevant: "VERALTETER PERSOENLICHER GRUND" }));
    bindeTeststand(f); const before = clone([...f.rows]), out = (await f.read()).briefing.lageBriefing;
    A.deepEqual(out.vorgaenge.map(k => k.vorgangId), ["vg-synth-2", "vg-synth-1"]);
    A.match(out.vorgaenge[0].relevanz.satz, /Pflege/);
    A.match(out.vorgaenge[1].relevanz.satz, /Stellvertretung/);
    A(!JSON.stringify(out).includes("VERALTETER")); A.deepEqual([...f.rows], before);
  });
  await test("Mandatsgruende bleiben am eigenen Original und am jeweiligen freigegebenen Absatz gebunden", async () => {
    const f = await state(), row = f.rows.get(f.row.id), raw = row.payload.lage;
    raw.quellen[0].quellenbelege[0].auszug += " Ein Pflegeentwurf wird beraten.";
    raw.quellenHash = require("../lib/helmut/lage-quellenbeleg").hashEingabe(raw.quellen);
    row.payload.lageAnsicht.quellenBindung.quellenHash = raw.quellenHash;
    bindeTeststand(f);
    const out = (await f.read()).briefing.lageBriefing;
    A.match(out.paragraphs[0].relevanz.satz, /Haushaltsausschuss/);
    A(!JSON.stringify(out.paragraphs[0].relevanz).includes("Pflege"));
    A.match(out.paragraphs[1].relevanz.satz, /Pflege/);
    A.deepEqual(out.paragraphs.map(p => p.text), raw.paragraphs.map(p => p.text));
  });
  await test("Fachfremde gebundene Altkarte verschwindet nur aus der Ausgabe, gueltiger Sachtext bleibt", async () => {
    const f = await state(), row = f.rows.get(f.row.id), raw = row.payload.lage;
    const q = raw.quellen[0].quellenbelege[0];
    q.titel = "Ministerium stellt eine Vorlage vor"; q.auszug = q.titel;
    raw.paragraphs[0].text = q.titel; raw.paragraphs[0].belegstellen[0].text = q.titel;
    raw.quellenHash = require("../lib/helmut/lage-quellenbeleg").hashEingabe(raw.quellen);
    row.payload.lageAnsicht = B.lageAusgabe(raw);
    row.payload.lageAnsicht.vorgaenge[0].relevanz = { satz: "Falscher alter Pflegebezug", belege: [] };
    bindeTeststand(f); const before = clone([...f.rows]), out = (await f.read()).briefing;
    A.equal(out.lageBriefing.paragraphs[0].text, q.titel);
    A.equal(out.lageBriefing.paragraphs[0].relevanz, undefined);
    A.deepEqual(out.lageBriefing.vorgaenge.map(k => k.vorgangId), ["vg-synth-2"]);
    A.deepEqual([...f.rows], before); A.equal(out.paketStatus.quittungGebunden, true);
    // Fehlende Bindung allein ist keine Negativbewertung einer Altkarte.
    row.payload.lageAnsicht.vorgaenge[0].sources = [{ url: "https://example.invalid/anderer-artikel" }];
    row.payload.lageAnsicht.vorgaenge[0].whyRelevant = "Falscher alter Pflegebezug";
    bindeTeststand(f); const legacyBefore = clone([...f.rows]);
    const legacy = (await f.read()).briefing.lageBriefing.vorgaenge.find(k => k.vorgangId === "vg-synth-1");
    A.equal(legacy.displaySummary, q.titel); A.deepEqual(legacy.sources, row.payload.lageAnsicht.vorgaenge[0].sources);
    A.equal(legacy.relevanz, undefined); A.equal(legacy.whyRelevant, undefined);
    A.deepEqual([...f.rows], legacyBefore);
  });
  await test("Unvollstaendiger Nachlauf darf bestaetigten Volltext nicht aus dem Tagespaket entfernen", async () => {
    const f = await state({ partial: true });
    const before = clone(f.row); f.rows.delete(`bf-${profile.id}-lage-${day}`);
    await A.rejects(B.materialisiere({ profile, userId: profile.id, now: new Date(now.getTime() + 1000), storage: f.storage,
      briefing: { available: false, items: [], currentHelmutState: { versorgung: { version: 1, zustand: "unbekannt" } },
        currentRadarState: {} }, lageAnsicht: null }), { code: "BRIEFING_VOLLTEXT_ERHALT" });
    const row = f.rows.get(f.row.id);
    A.deepEqual(row, before, "Der gesperrte Ersatz erhaelt das gesamte bestaetigte Paket");
    A.deepEqual(row.payload.lage, before.payload.lage);
    A.deepEqual(row.payload.lageAnsicht, before.payload.lageAnsicht);
    A.deepEqual(row.payload.briefing.items, before.payload.briefing.items);
    A.deepEqual(row.payload.briefing.currentRadarState, before.payload.briefing.currentRadarState);
    A.equal(row.payload.briefing.currentHelmutState.versorgung.zustand, "offen");
    A.equal((await f.read({ now: new Date(now.getTime() + 2000) })).briefing.paketStatus.zustand, "teilweise");
  });
  await test("Fehlendes Paket erzeugt weder Rueckfall auf gestern noch Neuberechnung", async () => {
    const f = await state(); f.rows.delete(f.row.id);
    const r = await f.read(); A.equal(r.briefing.available, false);
    A.equal(r.briefing.reason, "tagespaket-fehlt"); A.equal(r.briefing.generatedAt, null);
    A.equal(r.briefing.lageBriefing.demo, false); A.equal(r.briefing.lageBriefing.latestUpdatedAt, null);
    A.deepEqual(r.briefing.lageBriefing.vorgaenge, []); A.equal(f.reads.length, 1);
  });
  await test("Berliner Tag wechselt schon vor dem UTC-Tag; alte Pakete werden nicht umetikettiert", async () => {
    const f = await state();
    const r = await f.read({ now: new Date(day + "T23:30:00Z") });
    A.equal(r.briefing.paketStatus.tag, "2026-09-14"); A.equal(r.briefing.available, false);
    A.equal(f.reads[0][2], "2026-09-14"); A.equal(f.reads.length, 1);
  });
  await test("Fremde Zeile, geaendertes Profil und manipulierte Quellen werden geschlossen abgewiesen", async () => {
    for (const change of [f => { f.rows.get(f.row.id).user_id = "foreign"; },
      f => { f.rows.get(f.row.id).payload.lageAnsicht.vorgaenge[0].sources[0].url = "https://example.invalid/foreign"; },
      f => { f.rows.get(f.row.id).payload.quellenStand.lageQuellenHash = "f".repeat(64); }]) {
      const f = await state(); change(f); const r = await f.read(); A.equal(r.briefing.available, false);
      A.equal(r.briefing.reason, "tagespaket-nicht-bestaetigt");
    }
    const f = await state();
    A.equal((await f.read({ profile: { ...profile, focusTopics: ["anderes Thema"] } })).briefing.available, false);
    await A.rejects(f.read({ userId: "foreign" }), /profil-abweichend/);
  });
  await test("Fremder Quittungsinhalt stuft Frische herab, behaelt aber alle geprueften Inhalte", async () => {
    const f = await state(); f.rows.get(L.laufId(profile.id,day)).payload.ausgabeBeleg.briefingHash = "f".repeat(64);
    const r = await f.read(); A.equal(r.frischeKontext.lauf, null);
    A.equal(r.briefing.paketStatus.quittungGebunden, false); A.deepEqual(r.briefing.items, f.briefing.items);
  });
  await test("Neue Quellensperre gilt sofort ohne Modell oder Ranglistenaufbau", async () => {
    const f = await state(); process.env.HELMUT_SOURCE_BLOCKLIST = "example.invalid";
    try { const r = await f.read(); A.equal(r.briefing.available, false);
      A.equal(r.briefing.reason, "tagespaket-quellenstand-nicht-bestaetigt"); A.equal(f.reads.length, 1); }
    finally { delete process.env.HELMUT_SOURCE_BLOCKLIST; }
  });
  await test("Aktive Publikationssperre prueft neue Quellenverknuepfungen der gespeicherten IDs", async () => {
    const f = await state();
    process.env[P.ENV] = JSON.stringify({ version: 1, holds: [{ publicationUrl: "https://example.invalid/held",
      reason: "unresolved-event-relation", review: { id: "synthetic", receiptSHA256: "a".repeat(64),
        koSHA256: "b".repeat(64), sourceSHA256: "c".repeat(64) } }] });
    try {
      const row = f.rows.get(f.row.id); row.payload.briefing.publicationEligibilityPolicy = P.publicInfo();
      row.payload.quellenStand = D.quellenStand(row.payload); row.payload.inhaltHash = B.inhaltHash(row.payload);
      let identityReads = 0;
      f.storage.getPublicationSourceIdentities = async deps => { identityReads++;
        A.deepEqual(deps.map(d => d.id), ["ko-synth-1","ko-synth-2"]);
        return { "ko-synth-1": [{ url: "https://example.invalid/held" }], "ko-synth-2": [] }; };
      A.equal((await f.read()).briefing.available, false); A.equal(identityReads, 1);
      A.equal(f.reads.length, 1);
    } finally { delete process.env[P.ENV]; }
  });
  await test("Quellenschutzmanifest ist selbst an den Inhaltshash gebunden",async()=>{
    const f=await state(), row=f.rows.get(f.row.id);
    row.payload.quellenStand.sicherheitsHash="f".repeat(64);
    A.equal((await f.read()).briefing.reason,"tagespaket-nicht-bestaetigt");
  });
  await test("Neuer Profil- oder Quellenkontext bekommt keinen abgewiesenen alten Lagecache", async () => {
    for (const geaendert of ["profil", "quellen"]) {
      const f = await state(); f.rows.delete(f.row.id);
      const aktuell = geaendert === "profil" ? { ...profile, focusTopics: ["Bildung"] } : profile;
      const ansicht = { ...clone(f.lageAnsicht), fromCache: false, pendingNarrative: true,
        paragraphs: [], quellenBindung: undefined };
      await B.materialisiere({ profile: aktuell, userId: profile.id, now, briefing: f.briefing,
        lageAnsicht: ansicht, storage: f.storage });
      const row = f.rows.get(f.row.id), out = await f.read({ profile: aktuell });
      A.equal(row.payload.profilHash, B.profilHash(aktuell)); A.equal(row.payload.lage, null);
      A.deepEqual(out.briefing.lageBriefing.paragraphs, []);
      A.deepEqual(out.briefing.lageBriefing.vorgaenge, f.lageAnsicht.vorgaenge);
      A.equal(out.briefing.paketStatus.zustand, "teilweise");
      A.deepEqual(out.briefing.currentRadarState, f.briefing.currentRadarState);
    }
  });
  await test("Ausgetauschter Rohcache nach cacheOnly-Pruefung wird nicht neu gebunden", async () => {
    const f = await state(); A.ok(f.row.payload.lage, "Exakt gebundener aktueller Cache bleibt zulaessig"); f.rows.delete(f.row.id);
    f.rows.get(`bf-${profile.id}-lage-${day}`).payload.koSetHash = "e".repeat(32);
    await B.materialisiere({ profile, userId: profile.id, now, briefing: f.briefing,
      lageAnsicht: f.lageAnsicht, storage: f.storage });
    A.equal(f.rows.get(f.row.id).payload.lage, null);
    A.deepEqual((await f.read()).briefing.lageBriefing.vorgaenge, f.lageAnsicht.vorgaenge);
  });
  await test("Echter cacheOnly-Lagebauer bindet alle bereits geladenen Karten-KOs", async () => {
    const lage = require("../lib/helmut/lage"), safety = require("../lib/helmut/sourceSafety"), ai = require("../lib/helmut/ai");
    const names = ["v3StoreReady", "listKnowledgeObjects", "listMatchingResults", "listAktuelleLageQuellen",
      "getSourcesForVorgang", "getRenderedBriefingV3"], old = Object.fromEntries(names.map(k => [k, S[k]]));
    const oldSafety = safety.guardKnowledgeObject, oldAi = ai.generateLageBriefing;
    const kos = [1,2].map(i => ({ id: `ko-karten-${i}`, vorgang_id: `vg-karten-${i}`, status: "update", understanding_status: "complete",
      headline: "Rentenberatung " + i, was_ist_passiert: "Ein Vorschlag zur Rente wird beraten.", warum_wichtig: "Rentenrecht.",
      display_title: "Rentenberatung " + i, display_summary: "Ein Vorschlag zur Rente wird beraten.",
      why_relevant: "Rente im Ausschuss.", recommendation: "Beratung verfolgen.",
      best_source_url: `https://example.invalid/rente/${i}`, updated_at: new Date().toISOString() }));
    S.v3StoreReady = () => true; S.listKnowledgeObjects = async () => kos;
    S.listMatchingResults = async () => [];
    S.getSourcesForVorgang = async id => [{ id: "rd-" + id, url: `https://example.invalid/rente/${id.endsWith("1") ? 1 : 2}`,
      source_name: "Synthetische Quelle", source_type: "official", title: "Vorschlag zur Rente",
      summary: "Ein synthetischer Vorschlag zur Rente wird im zustaendigen parlamentarischen Ausschuss beraten. Die Beratung betrifft die Ausgestaltung der Rentenversicherung und die naechsten Verfahrensschritte.",
      published_at: new Date(Date.now() - 3600000).toISOString() }];
    S.listAktuelleLageQuellen = require("./fixtures/lage-quellenmetadaten")(kos, id => S.getSourcesForVorgang(id));
    S.getRenderedBriefingV3 = async () => null;
    safety.guardKnowledgeObject = () => ({ status: "ok" });
    ai.generateLageBriefing = async () => { throw Error("Kein Modell im cacheOnly-Lagebauer"); };
    try {
      const result = await lage.buildLageBriefing({ id: profile.id, committees: ["Arbeit und Soziales"], focusTopics: ["Rente"] },
        { politicianId: profile.id, cacheOnly: true });
      A.equal(result.pendingNarrative, true, JSON.stringify(result)); A.equal(result.vorgaenge.length,2);
      A.deepEqual(result.tagespaketGrundlage, kos.map(k => ({ id: k.id, vorgang_id: k.vorgang_id })));
      const read = S.getSourcesForVorgang;
      S.getSourcesForVorgang = async id => (await read(id)).map(doc => ({ ...doc, published_at: null }));
      const ohneText = await lage.buildLageBriefing({ id: profile.id, committees: ["Arbeit und Soziales"], focusTopics: ["Rente"] },
        { politicianId: profile.id, cacheOnly: true });
      A.equal(ohneText.reason,"no-current-sources"); A.equal(ohneText.vorgaenge.length,2);
      A.deepEqual(ohneText.tagespaketGrundlage, result.tagespaketGrundlage);
    } finally { Object.assign(S, old); safety.guardKnowledgeObject = oldSafety; ai.generateLageBriefing = oldAi; }
  });
  await test("Lage-only-Karten behalten ihre Quellenbindung bei unbeteiligter Publikationssperre", async () => {
    const f = await state(); f.rows.delete(f.row.id);
    process.env[P.ENV] = JSON.stringify({ version: 1, holds: [{ publicationUrl: "https://example.invalid/unbeteiligt",
      reason: "unresolved-event-relation", review: { id: "synthetic", receiptSHA256: "a".repeat(64),
        koSHA256: "b".repeat(64), sourceSHA256: "c".repeat(64) } }] });
    try {
      f.briefing.publicationEligibilityPolicy = P.publicInfo();
      f.briefing.items = f.briefing.items.slice(0,1);
      f.briefing.tagespaketGrundlage = [{ id: "ko-synth-1", vorgang_id: "vg-synth-1" }];
      f.lageAnsicht.tagespaketGrundlage = [1,2].map(i => ({ id: `ko-synth-${i}`, vorgang_id: `vg-synth-${i}` }));
      await B.materialisiere({ profile, userId: profile.id, now, briefing: f.briefing,
        lageAnsicht: f.lageAnsicht, storage: f.storage });
      let reads = 0;
      f.storage.getPublicationSourceIdentities = async deps => {
        reads++; A.deepEqual(deps.map(d => d.id), ["ko-synth-1", "ko-synth-2"]);
        return { "ko-synth-1": [{ url: "https://example.invalid/dokument/1" }],
          "ko-synth-2": [{ url: "https://example.invalid/dokument/2" }] };
      };
      const result = await f.read(); A.equal(result.briefing.available, true); A.equal(reads,1);
      A.deepEqual(result.briefing.lageBriefing.vorgaenge, f.lageAnsicht.vorgaenge);
      f.storage.getPublicationSourceIdentities = async () => ({ "ko-synth-1": [],
        "ko-synth-2": [{ url: "https://example.invalid/unbeteiligt" }] });
      A.equal((await f.read()).briefing.reason, "tagespaket-quellenstand-nicht-bestaetigt");
    } finally { delete process.env[P.ENV]; }
  });
  await test("Echter HTTP-Einstieg liefert denselben Paketstand fuer App, Briefing und Lage", async () => {
    const f = await state(), accounts = require("../lib/helmut/accounts");
    process.env.HELMUT_AUTH_MODE = "accounts";
    accounts.resolveSession = async () => ({ user: { id: "synthetic-user", role: "abgeordneter", politicianId: profile.id } });
    accounts.recordUserActivity = async () => {};
    S.getProfile = async id => { A.equal(id, profile.id); return clone(profile); };
    S.getTasks = S.getUserNotes = async () => [];
    S.getRenderedBriefingV3 = f.storage.getRenderedBriefingV3;
    let forbidden = 0;
    const fail = async () => { forbidden++; throw Error("Korpus/Modell/Schreibpfad im Appstart"); };
    S.listKnowledgeObjects = S.getLatestCompleteKnowledgeObjectAt = S.getSourcesForVorgang = fail;
    S.insertRenderedBriefingV3 = S.saveRenderedBriefingV3 = fail;
    const original = D.lese; D.lese = args => original({ ...args, now });
    const handler = require("../server");
    let csrf = "";
    async function get(url, cookie = "helmut_session=synthetic") {
      return new Promise((resolve, reject) => {
        const response = { headersSent: false, setHeader() {}, writeHead(status) { this.status = status; this.headersSent = true; },
          end(body) { resolve({ status: this.status || 200, body: JSON.parse(body) }); } };
        Promise.resolve(handler({ method: "GET", url, headers: { host: "localhost", cookie, "x-csrf-token": csrf } }, response)).catch(reject);
      });
    }
    try {
      csrf = (await get("/api/security/csrf")).body.token;
      const app = await get("/api/app/start?politicianId=foreign"), brief = await get("/api/briefing/latest"), lage = await get("/api/lage/briefing");
      A.equal(app.status, 200); A.equal(app.body.profile.id, profile.id);
      A.deepEqual(app.body.briefing.lageBriefing.vorgaenge, f.lageAnsicht.vorgaenge);
      A.deepEqual(app.body.briefing.currentRadarState, f.briefing.currentRadarState);
      A.equal(app.body.briefing.gespeicherterNachweis.inhaltHash, brief.body.gespeicherterNachweis.inhaltHash);
      A.equal(lage.status, 200, JSON.stringify(lage.body));
      A.deepEqual(lage.body.vorgaenge, f.lageAnsicht.vorgaenge);
      A.equal((await get("/api/app/start", "")).status, 401); A.equal(forbidden, 0);
    } finally { D.lese = original; }
  });
  await test("Gespeicherte frische Fremdoption wird ohne Lage-, Quittungs-, Hash- oder Speicherverlust zurueckgehalten", async () => {
    const f = await state({ partial: true }), row = f.rows.get(f.row.id);
    row.payload.briefing.currentHelmutState = { profileId: profile.id, status: "fresh", qualityStatus: "partial",
      versorgung: { version: 1, zustand: "offen" }, generatedAt: now.toISOString(),
      primaryVorgangId: "vg-synth-1", primaryItem: { id: "vg-synth-1", title: "Fraktionsausschluss beantragt",
        sourceUrl: "https://example.invalid/dokument/1", sourceIds: ["rd-synth-1"], sourceCount: 1 }, items: [],
      recommendation: "Die Fraktion sollte transparente Verfahrenskommunikation sicherstellen.",
      whyItMatters: "Neue Quellen im aktuellen Briefingfenster.", urgency: "hoch", riskOfNoAction: "Unbelegter persoenlicher Nachteil",
      riskSummary: "Alte Risikobehauptung", riskLevel: "high", opportunitySummary: "Alte Chance", opportunityLevel: "high",
      recommendedCommunication: { communicationLine: "Unbelegte persoenliche Linie" }, actionItems: [{ title: "Unbelegter Auftrag" }],
      tagesAnlass: { art: "neue-quelle", documentIds: ["rd-synth-1"], text: "Neue Quellen im aktuellen Briefingfenster." } };
    bindeTeststand(f); const before = clone([...f.rows]), result = (await f.read()).briefing, h = result.currentHelmutState;
    A.equal(h.status, "empty"); A.equal(h.primaryItem, null); A.equal(h.recommendation, ""); A.equal(h.whyItMatters, "");
    A.equal(h.urgency, "unknown"); A.equal(h.riskOfNoAction, ""); A.equal(h.riskSummary, ""); A.equal(h.opportunitySummary, "");
    A.deepEqual(h.actionItems, []); A.equal(h.recommendedCommunication.communicationLine, "");
    A.equal(result.paketStatus.vollstaendig, false); A(result.paketStatus.fehler.includes("briefing-handlungsbeleg-fehlt"));
    A.equal(result.paketStatus.quittungGebunden, true);
    A.deepEqual(result.items, row.payload.briefing.items); A.deepEqual([...f.rows], before);
    A.deepEqual(result.lageBriefing.paragraphs.map(p => p.text), f.lageAnsicht.paragraphs.map(p => p.text));
    A.equal(result.gespeicherterNachweis.inhaltHash, row.payload.inhaltHash); A.equal(f.reads.length, 2);
  });
  await test("Gespeicherter Originalauftrag ohne Frist bleibt fuer dasselbe Mandat sichtbar", async () => {
    const f = await state(), row = f.rows.get(f.row.id), C = require("../lib/helmut/briefingContract");
    const ko = { id: "ko-synth-2", vorgang_id: "vg-synth-2", headline: "Pflegereform: Nachbesserungen angekündigt",
      was_ist_passiert: "Bei der Beratung der Pflegereform wurden Nachbesserungen angekündigt.",
      status: "neu", understanding_status: "complete", zeitdruck: "keiner" };
    const doc = { id: "rd-synth-2", title: ko.headline, url: "https://example.invalid/dokument/2", published_at: day + "T05:00:00Z",
      summary: "Bei der Beratung der Pflegereform wurden Schwachstellen eingeräumt und Nachbesserungen für die weitere parlamentarische Arbeit angekündigt." };
    row.payload.briefing.currentHelmutState = C.buildCurrentHelmutState({ profile, now, kosById: { [ko.id]: ko },
      decisions: [{ knowledge_object_id: ko.id, decision: "Beobachten", score: 50 }], sourcesByVorgang: { [ko.vorgang_id]: [doc] } });
    A.equal(row.payload.briefing.currentHelmutState.tagesAnlass.art, "angekuendigter-schritt");
    bindeTeststand(f); const before = clone([...f.rows]), out = (await f.read()).briefing;
    A.equal(out.currentHelmutState.primaryVorgangId, ko.vorgang_id);
    A.equal(out.currentHelmutState.tagesAnlass.beleg.text, doc.summary);
    A(out.currentHelmutState.recommendation); A(out.currentHelmutState.tagesAnlass.profilbezug.belege.length);
    A.equal(out.paketStatus.quittungGebunden, true); A.deepEqual([...f.rows], before);
    const bestaetigt = clone(f.rows.get(f.row.id));
    for (const mutate of [h => h.primaryItem.sourceIds = ["fremde-quelle"],
      h => h.primaryItem.sourceUrl = "https://example.invalid/fremder-artikel",
      h => h.tagesAnlass.beleg.publishedAt = day + "T04:00:00Z"]) {
      f.rows.set(f.row.id, clone(bestaetigt)); mutate(f.rows.get(f.row.id).payload.briefing.currentHelmutState);
      bindeTeststand(f); const vorher = clone([...f.rows]), gesperrt = (await f.read()).briefing;
      A.equal(gesperrt.currentHelmutState.primaryItem, null);
      A.equal(gesperrt.currentHelmutState.recommendation, ""); A.deepEqual([...f.rows], vorher);
    }
  });
  console.log(`\n${n} PASS, 0 FAIL`);
})().catch(error => { console.error(error); process.exitCode = 1; });
