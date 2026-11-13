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
  await test("Unvollstaendiger Nachlauf behaelt vorher bestaetigte Inhalte bei ausgefallener Teilquelle", async () => {
    const f = await state({ partial: true });
    const before = clone(f.row); f.rows.delete(`bf-${profile.id}-lage-${day}`);
    await B.materialisiere({ profile, userId: profile.id, now: new Date(now.getTime() + 1000), storage: f.storage,
      briefing: { available: false, items: [], currentHelmutState: { versorgung: { version: 1, zustand: "unbekannt" } },
        currentRadarState: {} }, lageAnsicht: null });
    const row = f.rows.get(f.row.id);
    A.deepEqual(row.payload.lage, before.payload.lage);
    A.deepEqual(row.payload.lageAnsicht, before.payload.lageAnsicht);
    A.deepEqual(row.payload.briefing.items, before.payload.briefing.items);
    A.deepEqual(row.payload.briefing.currentRadarState, before.payload.briefing.currentRadarState);
    A.equal(row.payload.briefing.currentHelmutState.versorgung.zustand, "unbekannt");
    A.deepEqual(row.payload.vorherigerStand, before);
    A.equal((await f.read({ now: new Date(now.getTime() + 2000) })).briefing.paketStatus.zustand, "teilweise");
  });
  await test("Fehlendes Paket erzeugt weder Rueckfall auf gestern noch Neuberechnung", async () => {
    const f = await state(); f.rows.delete(f.row.id);
    const r = await f.read(); A.equal(r.briefing.available, false);
    A.equal(r.briefing.reason, "tagespaket-fehlt"); A.equal(r.briefing.generatedAt, null);
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
  console.log(`\n${n} PASS, 0 FAIL`);
})().catch(error => { console.error(error); process.exitCode = 1; });
