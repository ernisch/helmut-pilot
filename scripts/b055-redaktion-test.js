"use strict";
// Ausschliesslich synthetische Offlineantworten; kein fachlicher Productionbeleg.
const A = require("node:assert/strict"), { neu } = require("./b055-neuer-versuch-test");
const C = require("../lib/helmut/b055-einzelabschluss"), B = require("../lib/helmut/briefing-speicher");
const Q = require("../lib/helmut/lage-textqualitaet"), D = require("../lib/helmut/testkohorte-direkt500");
const E = require("../lib/helmut/lage-entwurfsbeleg"), H = require("../lib/helmut/briefing-profilkontext").standHash;
const clone = structuredClone;
async function fixture() {
  const h = neu(); A.equal((await C.ausfuehren(h.args)).ok, true);
  const runId = h.c.runId, day = h.c.tag, stamp = h.now.toISOString(), profile = h.ctx.profile;
  const lage = h.rows.get(`bf-${C.MANDAT}-lage-${day}`);
  const field = Q.modellProfilKontext(profile).ausschuesse[0]; A(field);
  const raw = { paragraphs: lage.payload.paragraphs.map((p, i) => ({ text: p.text,
    quelle_id: lage.payload.quellen[0].quellenbelege[i].quelle_id, vorgang_ids: p.vorgang_ids,
    mandatsbezug: { feld: "ausschuss", wert: field } })) };
  h.review = { pruefungen: raw.paragraphs.map((p, i) => ({ absatz: i, quelle_id: p.quelle_id,
    textart: "konkreter_sachverhalt", belegfeld: "titel", vollstaendig_belegt: true,
    themenrein: true, profilbezug: true,
    pruefbegruendung: "Synthetische Beleglage des Speichervertrags.",
    mandatsbegruendung: `Der belegte Sachverhalt betrifft die fachliche Aufgabe des ${field}.` })),
    vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
      pruefbegruendung: "Zwei getrennte synthetische Sachverhalte." }] };
  const oldCheck = Q.pruefe(raw.paragraphs, lage.payload.quellen, h.review, profile); A(oldCheck.ok);
  lage.payload.paragraphs = oldCheck.paragraphs; lage.payload.qualitaet = oldCheck.qualitaet;
  const draft = E.baue({ userId: C.MANDAT, runId, phase: "entwurf", antwort: raw,
    quellen: lage.payload.quellen, profile, now: h.now }); h.rows.set(draft.id, draft);
  const b = { ...h.result.briefing, currentHelmutState: { ...h.result.briefing.currentHelmutState,
    tagesAnlass: { art: "neue-quelle", documentIds: ["rd-fixture"],
      text: "Synthetischer Tagesanlass nur für den Redaktions-Speichertest." } }, currentRadarState: { items: [] } };
  const payload = { version: 1, mandat: C.MANDAT, tag: day, profilHash: B.profilHash(profile), profilHashVersion: 2,
    briefing: b, lage: clone(lage.payload), inhaltHash: B.hash({ briefing: b, lage: lage.payload }),
    pruefung: B.pruefeInhalt(b, lage.payload), erzeugtAm: stamp };
  A(payload.pruefung.strukturellVollstaendig);
  const briefing = { id: `bf-${C.MANDAT}-${B.SLOT}-${day}`, user_id: C.MANDAT,
    slot: B.SLOT, generated_at: stamp, payload }; h.rows.set(briefing.id, briefing);
  h.success = { run_id: runId, status: "success", target_count: 1, saved_count: 1, finished_at: stamp };
  h.c.redaktion = { runId, startHash: B.hash(h.rows.get(C.START_NEU)), entwurfHash: draft.payload.inhaltHash,
    lageHash: H(lage), briefingHash: H(briefing), costMicroUsd: 2000,
    grund: "Nur synthetische redaktionelle Praezisierung im Offlinevertrag.", antwort: clone(raw) };
  h.c.redaktion.antwort.paragraphs[0].text = "Der Bundestag beraet den Haushalt.";
  h.c.version = 3; h.c.id = C.COMMAND_REDAKTION; h.c.runId = "nachlauf500-202609150156";
  h.args.confirmation = C.CONFIRM_REDAKTION; h.now = new Date(h.now.getTime() + 1000);
  const get = h.args.deps.get;
  h.args.deps.get = async p => p.startsWith("process_runs?select=*") && p.includes(runId)
    ? [clone(h.success)] : get(p);
  const s = h.args.deps.storage;
  s.getLageEntwurfsbeleg = async (id, key) => { A.equal(id, C.MANDAT); return clone(h.rows.get(key)); };
  s.insertLageEntwurfsbeleg = async row => { A(!h.rows.has(row.id)); h.rows.set(row.id, clone(row)); return { saved: true }; };
  s.saveRenderedBriefingV3 = async (row, opts) => {
    A.deepEqual(opts.expectedLage, h.rows.get(row.id)); A.deepEqual(row.payload.vorherigerStand, opts.expectedLage);
    const saved = clone(row);
    saved.generated_at = (h.dbZeitDiff ? new Date(Date.parse(row.generated_at) + 1).toISOString() : row.generated_at).replace(/Z$/, "+00:00");
    h.rows.set(row.id, saved); return { saved: true };
  };
  s.tenantRequest = async (url, id, opts) => {
    A.equal(id, C.MANDAT); A.equal(opts.method, "PATCH");
    const q = new URL("https://offline.invalid" + url).searchParams, key = q.get("id").slice(3);
    const before = h.rows.get(key); A.equal(q.get("user_id"), "eq." + C.MANDAT);
    A.equal(q.get("generated_at"), "eq." + before.generated_at);
    const body = JSON.parse(opts.body); A.deepEqual(body.payload.vorherigerStand, before);
    if (h.patchLost) throw Error("Unbekannter Schreibausgang");
    const row = { ...before, ...body, generated_at: body.generated_at.replace(/Z$/, "+00:00") }; h.rows.set(key, clone(row)); return [clone(row)];
  };
  h.args.deps.redaktionGenerate = async (sources, p, meta) => {
    A.deepEqual(meta.gespeicherterEntwurf, h.c.redaktion.antwort); await meta.onDraft(meta.gespeicherterEntwurf);
    await meta.beforeReview(); h.calls++; h.counter++;
    const book = h.s.auth.testKostenTage[day];
    book.calls.redaktion = { status: "abgerechnet", reserved: 212000, maxOutputTokens: 3000,
      manual: true, createdAt: stamp, cost: 1000, bezug: { version: 1, runId: h.c.runId,
        mandatHash: D.hash(C.MANDAT), phase: "pruefung" } };
    book.manualCalls++; book.spent += 1000;
    h.s.auth.llmUsage.push({ createdAt: stamp, model: "gpt-5-mini", estimatedCost: .001 });
    if (h.doubleReview) await meta.beforeReview();
    await meta.onReview(h.review);
    const result = Q.pruefe(meta.gespeicherterEntwurf.paragraphs, sources, h.review, p);
    if (!result.ok) throw Error("Synthetische Ablehnung");
    return { ...result, wordCount: 12, model: "gpt-5-mini" };
  };
  h.approve(); h.old = clone({ lage, briefing, draft }); return h;
}
(async () => {
  let passed = 0;
  const h = await fixture(), count = h.calls;
  const result = await C.ausfuehren(h.args); A.equal(result.ok, true, JSON.stringify(result));
  A.equal(h.calls - count, 1); A.equal(result.freigegebeneModelle, 1);
  A.deepEqual(h.rows.get(h.old.lage.id).payload.vorherigerStand, h.old.lage);
  A.deepEqual(h.rows.get(h.old.briefing.id).payload.vorherigerStand, h.old.briefing);
  A.deepEqual(h.rows.get(h.old.draft.id), h.old.draft);
  A.equal((await C.ausfuehren(h.args)).ok, false); A.equal(h.calls - count, 1); passed++;
  for (const mutate of [
    h => { h.success.status = "running"; }, h => { h.c.redaktion.costMicroUsd++; },
    h => { h.c.redaktion.lageHash = "f".repeat(64); }, h => { h.c.redaktion.antwort.paragraphs[0].quelle_id = "fremd"; },
    h => { h.c.redaktion.antwort.paragraphs[0].mandatsbezug.wert = "Testthema 15"; },
    h => { h.c.redaktion.antwort = clone(h.old.draft.payload.antwort); },
    h => { h.s.auth.testKostenTage[h.c.tag].baseline = 3600000; h.s.auth.testKostenTage[h.c.tag].spent += 3600000; },
    h => { h.c.redaktion.startHash = "f".repeat(64); }
  ]) {
    const t = await fixture(), before = t.calls; mutate(t); t.approve();
    A.equal((await C.ausfuehren(t.args)).ok, false); A.equal(t.calls, before);
    A.deepEqual(t.rows.get(t.old.briefing.id), t.old.briefing); A(!t.rows.has(C.START_REDAKTION)); passed++;
  }
  for (const mutate of [h => { h.review.pruefungen[0].vollstaendig_belegt = false; },
    h => { h.doubleReview = true; }, h => { h.patchLost = true; }, h => { h.dbZeitDiff = true; }]) {
    const t = await fixture(), before = t.calls; mutate(t);
    A.equal((await C.ausfuehren(t.args)).ok, false); A.equal(t.calls - before, 1);
    A.deepEqual(t.rows.get(t.old.briefing.id), t.old.briefing);
    A.equal((await C.ausfuehren(t.args)).ok, false); A.equal(t.calls - before, 1); passed++;
  }
  console.log(`${passed}/${passed} Redaktion: getrennte Startsperre, Vorgang/Kosten, echte Review-Gates, Altdaten, Datenbank-Zeitzonen, CAS und unbekannter Ausgang`);
})().catch(e => { console.error(e); process.exitCode = 1; });
