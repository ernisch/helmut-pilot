"use strict";

// Nur neue Teilstandfaelle. Bestehende erfundene Quellen und echter strikter
// Qualitaetspruefer; vorhandene Storageadapter erhalten einen lokalen Transport.
const A = require("node:assert/strict"), B = require("../lib/helmut/briefing-speicher"),
  T = require("../lib/helmut/lage-teilstand"), E = require("../lib/helmut/lage-quellenbeleg"),
  Q = require("../lib/helmut/lage-textqualitaet"), C = require("../lib/helmut/lage-verarbeitungsbeleg"),
  D = require("../lib/helmut/tagespaket-auslieferung"), L = require("../lib/helmut/briefing-lauf"),
  P = require("../lib/helmut/publication-eligibility"), S = require("../lib/helmut/storage");
const base = require("./fixtures/profilhash-integration");
async function fixture({ storageApi = S, fullText = null, change = null, changeRows = null, packageNow = true } = {}) {
  const { profile, day, now } = base, full = structuredClone(fullText || base.fixture().text);
  const quellen = structuredClone(full.payload.quellen), rows = new Map(), requests = [];
  const eingabe = { koSetHash: full.payload.koSetHash, quellenHash: E.hashEingabe(quellen), profilHash: B.profilHash(profile) };
  const draft = { paragraphs: quellen.map((v, i) => ({ vorgang_ids: [v.vorgang_id], quelle_id: v.quellenbelege[0].quelle_id,
    mandatsbezug: { feld: i ? "schwerpunkt" : "ausschuss", wert: i ? "Pflege" : "Petitionsausschuss" },
    auswahlbegruendung: i ? "Pflege: Beratung eines Pflegeentwurfs." : "Petitionsausschuss: Beratung eines Haushaltsentwurfs.",
    text: v.quellenbelege[0].auszug })) };
  const review = { pruefungen: draft.paragraphs.map((p, i) => ({ absatz: i, quelle_id: p.quelle_id,
    belegfeld: "auszug", pruefbegruendung: "Die Quelle belegt genau diese Beratung.",
    vollstaendig_belegt: true, themenrein: true, profilbezug: i === 1, textart: "konkreter_sachverhalt",
    mandatsbegruendung: i ? "Pflege: Der Pflegeentwurf betrifft diesen Schwerpunkt." : "Petitionsausschuss: Der Haushaltsentwurf passt fachlich nicht." })),
    vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
      pruefbegruendung: "Verschiedene Beratungen zu Haushalt und Pflege." }] };
  if (change) change({ draft, review, quellen, eingabe });
  for (const [phase, antwort] of [["entwurf", draft], ["pruefung", review]]) {
    const row = C.eintrag({ userId: profile.id, tag: day, eingabeHash: B.hash(eingabe), phase, antwort,
      owner: "00000000-0000-4000-8000-000000000001", now }); rows.set(row.id, row);
  }
  if (changeRows) changeRows(rows);
  const original = JSON.stringify([...rows]);
  const request = async (path, options) => {
    const url = new URL(path, "https://local.invalid");
    A.equal(url.pathname, "/rest/v1/briefings"); A.equal(url.searchParams.get("user_id"), "eq." + profile.id);
    requests.push({ path, method: options?.method || "GET" });
    if (options?.method === "POST") {
      A.match(options.headers.Prefer, /ignore-duplicates/);
      const row = JSON.parse(options.body); A.equal(row.user_id, profile.id);
      if (rows.has(row.id)) return [];
      rows.set(row.id, row); return [{ id: row.id, user_id: row.user_id, slot: row.slot }];
    }
    A.equal(options, undefined);
    const row = rows.get(String(url.searchParams.get("id")).slice(3));
    return row ? [structuredClone(row)] : [];
  };
  const storage = { assertTenant: storageApi.assertTenant,
    getLageVerarbeitungsbeleg: (user, id) => storageApi.getLageVerarbeitungsbeleg(user, id, { bereit: true, request }),
    getLageTeilstand: (user, tag, hash) => storageApi.getLageTeilstand(user, tag, hash, { bereit: true, request }),
    insertLageTeilstand: (row, args) => storageApi.insertLageTeilstand(row, { ...args, bereit: true, request }),
    getRenderedBriefingV3: async (user, slot, tag) => {
      A.equal(user, profile.id); A.equal(tag, day); return structuredClone(rows.get(`bf-${user}-${slot}-${tag}`) || null);
    },
    insertRenderedBriefingV3: row => storageApi.insertRenderedBriefingV3(row, { bereit: true, request }),
    ergaenzeUnvollstaendigesBriefing: async (before, after) => {
      A.deepEqual(rows.get(before.id), before); rows.set(after.id, structuredClone(after)); return { saved: true };
    }
  };
  const args = { userId: profile.id, tag: day, profile, now, eingabe, quellen, storage };
  const part = await T.materialisiere(args);
  A.equal(JSON.stringify([...rows].filter(([,r]) => r.slot === "lage-verarbeitung")), original);
  const normal = B.lageAusgabe(full.payload), positive = B.lageAusgabe(part.payload, args);
  const view = { ...normal, paragraphs: positive.paragraphs, qualitaet: positive.qualitaet, teilstand: positive.teilstand,
    vorgaenge: normal.vorgaenge.map(v => ({ ...v, ...(positive.vorgaenge.find(p => p.vorgangId === v.vorgangId) || {}) })) };
  const briefing = structuredClone(base.briefing);
  briefing.currentHelmutState = { status: "empty", emptyState: { kind: "quiet", headline: "Keine neue Tagesprioritaet" } };
  briefing.currentRadarState = { status: "fresh", anzeige: { status: "fresh", dynamics: [{
    title: "Gespeicherter Radarhinweis", vorgangId: "vg-synth-1", sourceUrl: "https://example.invalid/dokument/1" }] } };
  briefing.publicationEligibilityPolicy = P.publicInfo();
  briefing.tagespaketGrundlage = quellen.map((v,i) => ({ id: "ko-synth-" + (i + 1), vorgang_id: v.vorgang_id }));
  const f = { profile, day, now, rows, requests, storage, args, part, view, briefing, full, draft, review, original };
  f.package = async () => {
    await B.materialisiere({ profile, userId: profile.id, now, briefing, lageAnsicht: view, storage });
    f.row = rows.get(`bf-${profile.id}-${B.SLOT}-${day}`);
    const receipt = L.quittung({ tenantId: profile.id, berlinTag: day, erzeugtAm: now,
      status: L.STATUS_ERFOLG, signatur: L.inhaltsSignatur(f.row.payload.briefing),
      ausgabeBeleg: require("../lib/helmut/briefing-ausgabebeleg").ausPaket(f.row), fensterStart: day + "T00:00:00Z" });
    rows.set(L.laufId(profile.id,day), { id: L.laufId(profile.id,day), user_id: profile.id,
      slot: L.SLOT_ERFOLG, generated_at: now.toISOString(), payload: receipt });
    return f.row;
  };
  f.read = (opts = {}) => D.lese({ userId: profile.id, profile, now, storage, ...opts });
  if (packageNow) await f.package();
  return f;
}
async function main() {
  let count = 0;
  const test = async (name, fn) => { await fn(); count++; console.log("PASS " + name); };
  await test("Negativer Profilabsatz bleibt abgelehnt, wortgleicher positiver Absatz wird streng als Teilstand gespeichert", async () => {
    const f = await fixture(), p = f.part.payload;
    A.equal(p.paragraphs.length, 1); A.equal(p.paragraphs[0].text, f.draft.paragraphs[1].text);
    A.equal(p.provenienz.originale.pruefung.payload.antwort.pruefungen[0].profilbezug, false);
    A.equal(Q.pruefe(require("../lib/helmut/ai").assembleLageParagraphs(f.draft,p.quellen,f.profile), p.quellen,f.review,f.profile).ok,false);
    A.equal(E.gespeicherterTextGueltig(p), false, "Normale2–4-Grenze bleibt strikt");
    A.equal(T.gueltig(p, f.args), true); A.equal(f.rows.has(f.full.id), false);
  });
  await test("Paket liefert nur positives Subset samt Teilhinweis, gebundener Quittung und bestehenden Karten ohne private Reviews", async () => {
    const f = await fixture(), before = JSON.stringify([...f.rows]), result = await f.read(), b = result.briefing;
    A.equal(b.paketStatus.zustand, "teilweise"); A.equal(b.paketStatus.vollstaendig, false);
    A(b.paketStatus.fehler.includes("lage-teilstand")); A.equal(b.paketStatus.quittungGebunden, true);
    A.equal(b.lageBriefing.paragraphs.length, 1); A.equal(b.lageBriefing.vorgaenge.length, 2);
    A.equal(b.lageBriefing.teilstand.vollstaendig, false); A.equal(b.lageBriefing.teilstand.hinweis, T.HINWEIS);
    A(!JSON.stringify(b).includes("provenienz")); A(!JSON.stringify(b).includes("mandatsbegruendung"));
    A(!JSON.stringify(b.lageBriefing.paragraphs).includes(f.draft.paragraphs[0].text));
    A.equal(JSON.stringify([...f.rows]), before); A.equal(B.inhaltHash(f.row.payload), f.row.payload.inhaltHash);
  });
  await test("Andere Ablehnungen unvollstaendige Schemas Paare oder Quellen bleiben vollstaendig gesperrt", async () => {
    for (const change of [
      ({ review }) => { review.pruefungen[0].vollstaendig_belegt = false; },
      ({ review }) => { review.pruefungen[0].themenrein = false; },
      ({ review }) => { review.pruefungen[0].textart = "unklar"; },
      ({ review }) => { review.pruefungen[1].profilbezug = false; },
      ({ review }) => { review.vergleiche = []; },
      ({ review }) => { review.vergleiche[0].eigenstaendige_sachverhalte = false; },
      ({ review }) => { review.pruefungen[1].absatz = 0; },
      ({ review }) => { review.pruefungen[0].extra = true; },
      ({ draft }) => { draft.paragraphs[1].quelle_id = "q-fremd"; },
      ({ draft }) => { draft.paragraphs[1].mandatsbezug.wert = "Fremd"; },
      ({ draft }) => { draft.paragraphs[1].text += " Dazu wurden 98765 neue Stellen beschlossen."; }
    ]) await A.rejects(fixture({ change }), /lage-|ai-/);
  });
  await test("Originalphasenhash Tenant Profil Tag Index Ausgabetext und Groesse bleiben verpflichtend", async () => {
    await A.rejects(fixture({ changeRows: rows => { rows.values().next().value.payload.antwort.paragraphs[0].text += " fremd"; } }), /originalhash/);
    const f = await fixture();
    for (const change of [p => { p.mandat = "fremd"; }, p => { p.profilHash = "f".repeat(64); },
      p => { p.tag = "2026-09-14"; }, p => { p.provenienz.originalIndex = 0; },
      p => { p.paragraphs[0].text += " fremd"; }, p => { p.quellen[0].quellenbelege[0].url += "fremd"; },
      p => { p.provenienz.originale.entwurf.payload.antwort.paragraphs[0].text = "x".repeat(T.MAX_BYTES); }]) {
      const p = structuredClone(f.part.payload); change(p); A.equal(T.gueltig(p,f.args), false);
    }
    A.equal(T.gueltig(f.part.payload,{ ...f.args, profile: { ...f.profile, focusTopics: ["Fremd"] } }), false);
    A.equal(T.gueltig(f.part.payload,{ ...f.args, now: new Date("2026-09-14T12:00:00Z") }), false);
  });
  await test("Insert-only Ableitung ist idempotent und klaert verlorene POST-Antwort ausschliesslich lesend", async () => {
    const f = await fixture(), posts = f.requests.filter(r => r.method === "POST").length;
    A.deepEqual(await T.materialisiere(f.args), f.part);
    A.equal(f.requests.filter(r => r.method === "POST").length, posts);
    f.rows.delete(f.part.id); let calls = 0;
    const insert = f.storage.insertLageTeilstand;
    f.storage.insertLageTeilstand = async (...args) => { calls++; await insert(...args); throw Error("verlorene Antwort"); };
    A.equal((await T.materialisiere(f.args)).id, f.part.id); A.equal(calls, 1);
  });
  await test("Unbestaetigter Schreibausgang oder fremde Speicherzeile erzeugen keine Teilausgabe", async () => {
    const f = await fixture(); f.rows.delete(f.part.id);
    f.storage.insertLageTeilstand = async () => { throw Error("unbekannt"); };
    await A.rejects(T.materialisiere(f.args), /speicherung-nicht-bestaetigt/);
    const bad = structuredClone(f.part); bad.user_id = "fremd"; f.rows.set(bad.id,bad);
    await A.rejects(T.lese(f.args), /fremd|tenant|Tenant|lage-/i);
  });
  await test("Ein zwischen Teilablesung und Paketbau bestaetigter Vollcache ersetzt auch sichtbare Teilstandkarten", async () => {
    const f = await fixture({ packageNow: false }); f.rows.set(f.full.id, structuredClone(f.full)); await f.package();
    A.equal(E.gespeicherterTextGueltig(f.row.payload.lage), true); A.equal(f.row.payload.lageAnsicht.teilstand, undefined);
    A.deepEqual(f.row.payload.lageAnsicht.vorgaenge, B.lageAusgabe(f.full.payload).vorgaenge);
    A.equal((await f.read()).briefing.lageBriefing.paragraphs.length, 2);
  });
  await test("Neue Quellensperre entwertet Teilstand und Paket sofort ohne Reparatur oder Modell", async () => {
    const f = await fixture(), previous = process.env.HELMUT_SOURCE_BLOCKLIST;
    try { process.env.HELMUT_SOURCE_BLOCKLIST = "example.invalid";
      A.equal(T.gueltig(f.part.payload,f.args),false); A.equal((await f.read()).briefing.available,false);
    } finally { if (previous === undefined) delete process.env.HELMUT_SOURCE_BLOCKLIST; else process.env.HELMUT_SOURCE_BLOCKLIST = previous; }
  });
  await test("Manipulierter oder umdeklarierter Teilbeleg sperrt auch sichtbare Karten und Detailtexte", async () => {
    for (const change of [p => { p.lage.provenienz.originalIndex = 0; },
      p => { delete p.lage.provenienz; },
      p => { p.lage = null; }]) {
      const f = await fixture(), p = f.row.payload;
      change(p); p.quellenStand = D.quellenStand(p); p.inhaltHash = B.inhaltHash(p);
      const lage = (await f.read()).briefing.lageBriefing;
      A.deepEqual(lage.paragraphs, []); A.deepEqual(lage.vorgaenge, []);
      A.equal(lage.available, false); A.equal(lage.teilstand, undefined);
      A(!JSON.stringify(lage).includes(f.draft.paragraphs[1].text));
    }
  });
  console.log(`${count}/${count} neue Lage-Teilstandgruppen bestanden; keine Modelle, HTTP oder echte Datenbank.`);
}
module.exports = { fixture };
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
