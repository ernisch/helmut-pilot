"use strict";
const A = require("node:assert/strict");
const E = require("../lib/helmut/b055-einzelabschluss");
const S = require("../lib/helmut/storage");
const B = require("../lib/helmut/briefing-speicher");
const Q = require("../lib/helmut/briefing-aussagenbindung");
const D = require("../lib/helmut/testkohorte-direkt500");
const { welt, SHA } = require("./fixtures/direkt500");
const { baueKohorte } = require("../lib/helmut/test-kohorte-500");
const { buildProfile } = require("../lib/helmut/provisioning");
const tag = "2026-09-15", zeit = tag + "T12:30:00.000Z", clone = structuredClone;
function fixture() {
  const s = welt().snapshot();
  for (const spec of baueKohorte().slice(20)) {
    const p = buildProfile(spec, { aktiv: false });
    s.mandate.push({ user_id: p.id, ...S.toMandateProfileRow(p) });
    s.identitaeten.push({ id: p.id, name: p.fullName, email: spec.email });
    s.auth.users.push({ id: "konto-" + p.id, politicianId: p.id, email: spec.email,
      name: p.fullName, role: "abgeordneter", active: false });
  }
  s.mandate.filter(m => m.user_id.startsWith("test-kohorte-")).forEach(m => { m.aktiv = false; });
  s.mandate.sort((a,b) => a.user_id.localeCompare(b.user_id)); s.identitaeten.sort((a,b) => a.id.localeCompare(b.id));
  const ctx = { mandat: s.mandate.find(m => m.user_id === E.MANDAT),
    identitaet: s.identitaeten.find(p => p.id === E.MANDAT) };
  ctx.profile = S.fromMandateProfileRow(ctx.identitaet, ctx.mandat);
  const kos = [{ id: "ko-fiktiv", vorgang_id: "vg-fiktiv", understanding_status: "complete",
    was_ist_passiert: "Der fiktive Ausschuss beraet einen fiktiven Entwurf." }];
  const sourcesByVorgang = { "vg-fiktiv": [{ id: "rd-fiktiv", title: "Fiktive Ausschussberatung",
    summary: kos[0].was_ist_passiert, url: "https://www.bundestag.de/dokumente/fiktiv", published_at: zeit }] };
  const briefing = { available: true, items: [{ vorgangId: "vg-fiktiv", title: sourcesByVorgang["vg-fiktiv"][0].title }],
    currentHelmutState: { primaryVorgangId: "vg-fiktiv" } };
  const result = { briefing, korrekturBasis: { kos, sourcesByVorgang },
    eingabe: Q.baueEingabe({ briefing, profile: ctx.profile, userId: E.MANDAT, day: tag, kos, sourcesByVorgang }) };
  const urteil = { version: Q.VERSION, eingabeHash: result.eingabe.eingabeHash,
    korrektur: { ursprungHash: result.eingabe.eingabeHash, auslassungen: [] },
    aussagen: result.eingabe.aussagen.map(a => ({ pfad: a.pfad, text: a.text,
      sachlichGetragen: true, kontextGetragen: true, mandatsbezugGetragen: true,
      begruendung: "Nur fiktives Fachurteil im technischen Offlinevertrag.",
      belege: [{ vorgangId: "vg-fiktiv", documentId: "rd-fiktiv", feld: "titel", text: a.text }] })) };
  urteil.gesamtpruefung = require("./fixtures/briefing-fachurteil")(result, urteil);
  const c = { version: 1, id: E.COMMAND, userId: E.MANDAT, productionCommit: SHA, tag, utcTag: tag,
    maxModellaufrufe: 2, maxMicroUsd: 424000, automatischeWiederholung: false, gueltigBis: tag + "T13:30:00Z",
    runId: "nachlauf500-202609150055", kontextHash: B.hash(ctx), urteil };
  const book = s.auth.testKostenTage = { [tag]: { version: 1, day: tag,
    tarif: "azure-gpt5-mini-obergrenze-20260909", limit: 4000000, spent: 0, baseline: 0, baselineCalls: 0,
    manualCalls: 0, manualUntil: null, calls: {}, frozen: null } };
  const h = { s, c, ctx, calls: 0, writes: 0, rows: new Map(), locks: [], runs: [], events: [],
    result, leases: [], now: new Date(zeit), counter: 0, hooks: {}, imports: 0, materialisiert: 0 };
  const config = { production: true, commit: SHA, storageSupabase: true, v3Bereit: true,
    profileRelational: true, profileExclusive: true, retentionGueltig: true, retention: 36,
    kommunikationGesperrt: true, kohortenQuellenGesperrt: true, tagesdeckel: 2416, understandingReserve: 702,
    vorrangreserveReal: 200, atomicLock: true, narrativQueue: false, modell: "gpt-5-mini", azure: true,
    testKosten: { version: 2, aktiv: true, limitUsd: 4, maxManualCalls: null, maxWindowMs: null, unbekanntBleibtReserviert: true } };
  const storage = { assertTenant: S.assertTenant, fromMandateProfileRow: S.fromMandateProfileRow,
    acquirePipelineLock: async name => { if (h.locks.some(l => l.job_name === name)) return false;
      h.locks.push({ job_name: name }); return true; },
    releasePipelineLock: async name => { h.locks = h.locks.filter(l => l.job_name !== name); },
    getRenderedBriefingV3: async (id, slot, day, opts) => { A.equal(id, E.MANDAT); A.equal(day, tag);
      A.equal(opts.strict, true); return clone(h.rows.get(`bf-${id}-${slot}-${day}`) || null); },
    insertB055Einzelstart: async entry => require("../lib/helmut/b055-einzelstart").insert(entry, { bereit: true, request: async (url, opts) => {
      A(url.includes("user_id=eq." + E.MANDAT)); A.equal(opts.method, "POST");
      A.equal(opts.headers.Prefer, "resolution=ignore-duplicates,return=representation"); h.writes++;
      await h.hooks.beforeStart?.(); if (h.rows.has(entry.id)) return [];
      h.rows.set(entry.id, clone(entry)); await h.hooks.afterStart?.(); return [clone(entry)]; } }),
    schreibeWarteschlangenLaufquittung: async e => { h.runs = e.status === "running" ? [{ run_id: c.runId }] : []; return { ok: true }; } };
  h.args = { commit: SHA, commandHash: B.hash(c), confirmation: E.CONFIRM, config: () => config,
    build: async () => { await h.hooks.build?.(); return clone(result); }, deps: { storage, insertStart: storage.insertB055Einzelstart, now: () => new Date(h.now),
      get: async path => {
        const u = new URL("https://example.invalid/" + path), t = u.pathname.slice(1), p = u.searchParams;
        if (t === "helmut_store") {
          if (p.get("select").includes("pushEvents")) return [{ id: "main-auth", pushEvents: clone(h.events), auditEvents: [] }];
          return [{ data: clone(["eq." + E.COMMAND, "eq." + E.COMMAND_NEU].includes(p.get("id")) ? c : p.get("id") === "eq.main-auth" ? s.auth : s.main) }];
        }
        if (t === "mandate_profiles") return clone(p.has("user_id") ? s.mandate.filter(m => m.user_id === p.get("user_id").slice(3)) : s.mandate);
        if (t === "profiles") return clone(p.has("id") ? s.identitaeten.filter(r => r.id === p.get("id").slice(3)) : s.identitaeten);
        if (t === "briefings") { A.equal(p.get("user_id"), "eq." + E.MANDAT); const id = p.get("id").slice(3);
          return h.rows.has(id) ? [clone(h.rows.get(id))] : []; }
        if (t === "pipeline_locks") return clone(h.locks);
        if (t === "helmut_jobs") return clone(h.leases);
        if (t === "process_runs") return clone(h.runs);
        if (t === "helmut_job_outbox") return [];
        if (t === "llm_budget_counters") return [{ used: h.counter }];
        throw new Error("Unexpected query");
      }, importiere: async () => { h.imports++; return { verwendbar: true, gespeichert: true }; },
      leseFach: async () => ({ bereit: true, eingabeHash: urteil.eingabeHash, lageEingabe: {}, briefing }),
      lage: async (p, opts) => {
        A.equal(p.id, E.MANDAT); A.equal(p.profileActive, false); A.equal(opts.missingOnly, true);
        A.equal(opts.force, undefined); A.equal(opts.repairIncomplete, undefined);
        for (const phase of ["entwurf", "pruefung"]) {
          await opts.beforeGenerate(p.id); h.calls++; h.counter++;
          book[tag].calls[phase] = { status: "abgerechnet", reserved: 212000, maxOutputTokens: 3000,
            manual: true, createdAt: zeit, cost: 1000, bezug: { version: 1, runId: c.runId, mandatHash: D.hash(E.MANDAT), phase } };
          book[tag].manualCalls++; book[tag].spent += 1000;
          s.auth.llmUsage.push({ createdAt: zeit, model: "gpt-5-mini", estimatedCost: 0.001 });
          await h.hooks.afterModel?.(phase, opts);
        }
        await opts.beforeSave(p.id);
        const payload = { ...require("./fixtures/lage-beleg").payload(), briefingEingabeHash: c.urteil.eingabeHash };
        h.rows.set(`bf-${E.MANDAT}-lage-${tag}`, { id: `bf-${E.MANDAT}-lage-${tag}`, user_id: E.MANDAT,
          slot: "lage", generated_at: zeit, payload });
        return { available: true, fromCache: false };
      }, materialisiere: async () => { h.materialisiert++; return { gespeichert: true, vollstaendig: true }; } } };
  h.approve = () => { h.args.commandHash = B.hash(c); };
  return h;
}
let passed = 0;
const test = async (name, f) => { await f(); passed++; console.log("PASS " + name); };
module.exports = { fixture };
if (require.main === module) (async () => {
  await test("Ein inaktives Profil, zwei Modelle, zwei Kostenbelege, Ruecklesung", async () => {
    const h = fixture(), before = B.hash({ m: h.s.mandate, p: h.s.identitaeten, u: h.s.auth.users });
    const r = await E.ausfuehren(h.args); A.equal(r.ok, true, JSON.stringify(r));
    A.equal(h.calls, 2); A.equal(h.writes, 1); A.equal(h.materialisiert, 1); A.equal(r.kostenBelege.length, 2);
    A.equal(r.funktionsnachweis500, false); A.equal(r.automatischeWiederholung, false);
    A.equal(B.hash({ m: h.s.mandate, p: h.s.identitaeten, u: h.s.auth.users }), before);
    const second = await E.ausfuehren(h.args); A.equal(second.ok, false); A.equal(h.calls, 2);
  });
  for (const [name, mutate] of [
    ["falscher Hash", h => { h.args.commandHash = "f".repeat(64); }],
    ["falsches Profil", h => { h.c.userId = "test-kohorte-b-056"; h.approve(); }],
    ["falscher Commit", h => { h.args.commit = "f".repeat(40); }],
    ["fehlende Freigabe", h => { h.args.confirmation = ""; }],
    ["drittes Modell freigegeben", h => { h.c.maxModellaufrufe = 3; h.approve(); }],
    ["abgelaufen", h => { h.now = new Date(tag + "T13:31:00Z"); }],
    ["aktives Ziel", h => { h.ctx.mandat.aktiv = true; }],
    ["anderes aktives Kohortenprofil", h => { h.s.mandate.find(m => m.user_id === "test-kohorte-b-056").aktiv = true; }],
    ["veralteter Ursprung", h => { h.c.urteil.korrektur.ursprungHash = "f".repeat(64); h.approve(); }],
    ["laufender Auftrag", h => { h.leases.push({ id: "busy" }); }],
    ["Kommunikationsspur", h => { h.events.push({ createdAt: zeit }); }],
    ["Bestandstext", h => { h.rows.set(`bf-${E.MANDAT}-lage-${tag}`, { payload: { unveraendert: true } }); }],
    ["dauerhafte Startquittung", h => { h.rows.set(E.START_ID, { payload: {} }); }]
  ]) await test(name + " stoppt vor jeder Modellarbeit", async () => {
    const h = fixture(); mutate(h); const r = await E.ausfuehren(h.args);
    A.equal(r.ok, false); A.equal(h.calls, 0); A.equal(h.imports, 0);
  });
  await test("Unklarer Startausgang wird dauerhaft nicht wiederholt", async () => {
    const h = fixture(); h.hooks.afterStart = () => { throw new Error("Antwort verloren"); };
    A.equal((await E.ausfuehren(h.args)).ok, false); delete h.hooks.afterStart;
    A.equal((await E.ausfuehren(h.args)).grund, "einzelstart-bereits-verbraucht"); A.equal(h.calls, 0); A.equal(h.writes, 1);
  });
  await test("Parallelstart gewinnt Insert: kein Import und kein Modell", async () => {
    const h = fixture(); h.hooks.beforeStart = () => h.rows.set(E.START_ID, { payload: {} });
    A.equal((await E.ausfuehren(h.args)).ok, false); A.equal(h.imports, 0); A.equal(h.calls, 0);
  });
  for (const [name, hook] of [
    ["Profilveraenderung", h => { h.ctx.mandat.aktiv = true; }],
    ["unbekannter Kostenbeleg", h => { const b = h.s.auth.testKostenTage[tag]; b.calls.entwurf.status = "ungeklaert";
      delete b.calls.entwurf.cost; b.spent = 0; }],
    ["Zeitbudget", h => { h.now = new Date(Date.parse(zeit) + 151000); }]
  ]) await test(name + " stoppt vor zweitem Modell", async () => {
    const h = fixture(); h.hooks.afterModel = () => hook(h);
    A.equal((await E.ausfuehren(h.args)).ok, false); A.equal(h.calls, 1); A.equal(h.materialisiert, 0);
  });
  await test("Dritter Generatoraufruf ist auch intern gesperrt", async () => {
    const h = fixture(); h.hooks.afterModel = async (phase, opts) => { if (phase === "pruefung") await opts.beforeGenerate(E.MANDAT); };
    A.equal((await E.ausfuehren(h.args)).ok, false); A.equal(h.calls, 2); A.equal(h.materialisiert, 0);
  });
  console.log(`${passed}/${passed} B055 Einzelabschluss bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
