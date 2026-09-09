"use strict";

const assert = require("node:assert/strict");
const T = require("../lib/helmut/testkohorte-textnachlauf");
const D = require("../lib/helmut/testkohorte-direkt500");
const S = require("../lib/helmut/storage");
const P = require("../lib/helmut/provisioning");
const { baueKohorte } = require("../lib/helmut/test-kohorte-500");
const { welt, kopie, SHA } = require("./fixtures/direkt500");
let passed = 0;
async function test(name, fn) { await fn(); console.log("PASS " + name); passed++; }
const start = "2026-09-08T17:00:00.000Z";

function fixture() {
  const w = welt();
  const s = w.snapshot();
  for (const spec of baueKohorte().slice(20)) {
    const p = P.buildProfile(spec, { aktiv: true });
    s.mandate.push({ user_id: p.id, ...S.toMandateProfileRow(p), created_at: start, updated_at: start });
    s.identitaeten.push({ id: p.id, name: p.fullName, email: spec.email });
    s.auth.users.push({ id: "konto-" + p.id, politicianId: p.id, email: spec.email,
      name: p.fullName, role: "abgeordneter", active: false });
  }
  s.mandate.sort((a, b) => a.user_id.localeCompare(b.user_id));
  s.identitaeten.sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(D.pruefeSnapshot(s, "aktivierung").aktiv, 500);
  const config = { production: true, commit: SHA, storageSupabase: true, v3Bereit: true,
    profileRelational: true, profileExclusive: true, retentionGueltig: true, retention: 36,
    kommunikationGesperrt: true, kohortenQuellenGesperrt: true, tagesdeckel: 2416,
    understandingReserve: 702, vorrangreserveReal: 200, atomicLock: true, narrativQueue: false,
    modell: "gpt-5-mini", azure: true };
  const h = { s, config, clock: Date.parse(start), stepMs: 10, calls: [], rows: [], locks: [], leases: [],
    orphans: [], outbox: [], events: [], runs: [], receipts: [], counter: 1, fault: null };
  s.auth.llmUsage = [{ createdAt: start, model: "gpt-5-mini", estimatedCost: 0.01 }];
  h.jobs = s.mandate.filter(m => m.aktiv).map(m => ({ tenant_id: m.user_id, status: "erledigt", due_at: start }));
  for (const m of s.mandate.filter(m => m.aktiv).slice(0, 22)) h.rows.push({ id: `bf-${m.user_id}-lage-2026-09-08`,
    user_id: m.user_id, slot: "lage", generated_at: "2026-09-08T05:45:00.000Z",
    payload: { paragraphs: [{ text: "Vorhandener Text", vorgang_ids: ["vg-vorhanden"] }] } });
  const storage = {
    fromMandateProfileRow: S.fromMandateProfileRow,
    acquirePipelineLock: async (name) => { h.locks.push({ job_name: name }); return true; },
    releasePipelineLock: async (name) => { h.locks = h.locks.filter(l => l.job_name !== name); },
    getRenderedBriefingV3: async (id, slot, day, opts) => {
      assert.equal(slot, "lage"); assert.equal(day, "2026-09-08"); assert.equal(opts.strict, true);
      return kopie(h.rows.find(r => r.user_id === id) || null);
    },
    schreibeWarteschlangenLaufquittung: async (entry) => S.schreibeWarteschlangenLaufquittung(entry, {
      bereit: true, insertRelational: async row => {
        h.receipts.push(kopie(row));
        h.runs = row.status === "running" ? [{ run_id: row.run_id }] : [];
      }
    })
  };
  h.args = { commit: SHA, runId: "nachlauf500-123456789", confirmation: T.CONFIRM,
    config: () => config, deps: { storage, now: () => new Date(h.clock),
      get: async path => {
        if (h.fault) throw new Error(h.fault);
        const u = new URL("https://example.invalid/" + path), table = u.pathname.slice(1);
        if (table === "briefings") {
          const ids = JSON.parse("[" + u.searchParams.get("user_id").slice(4, -1) + "]");
          assert(ids.length <= 50); assert(path.length < 4096);
          assert.equal(u.searchParams.get("slot"), "eq.lage");
          assert.equal(u.searchParams.get("id"), "like.*-lage-2026-09-08");
          assert.equal(u.searchParams.get("limit"), "51");
          return kopie(h.rows.filter(r => ids.includes(r.user_id)));
        }
        if (table === "mandate_profiles") {
          const id = u.searchParams.get("user_id")?.slice(3);
          return kopie(id ? s.mandate.filter(m => m.user_id === id) : s.mandate);
        }
        if (table === "profiles") return kopie(s.identitaeten);
        if (table === "helmut_store") {
          if (u.searchParams.get("select").includes("pushEvents")) return [{ id: "main-auth", pushEvents: h.events, auditEvents: [] }];
          return [{ data: kopie(u.searchParams.get("id") === "eq.main-auth" ? s.auth : s.main) }];
        }
        if (table === "pipeline_locks") return kopie(h.locks);
        if (table === "helmut_job_outbox") return kopie(h.outbox);
        if (table === "helmut_jobs") {
          if (u.searchParams.has("job_type")) return kopie(h.jobs);
          return kopie(u.searchParams.has("or") ? h.orphans : h.leases);
        }
        if (table === "process_runs") return kopie(u.searchParams.has("status") ? h.runs : h.receipts.filter(r => r.run_id === h.args.runId));
        if (table === "llm_budget_counters") return [{ used: h.counter }];
        throw new Error("Unerwarteter Pfad " + path);
      },
      build: async (p, opts) => {
        assert.equal(p.id, opts.politicianId); assert.equal(opts.missingOnly, true);
        assert.equal(opts.force, undefined); assert.equal(opts.cacheOnly, undefined);
        await opts.beforeGenerate(p.id);
        h.calls.push(p.id); h.clock += h.stepMs;
        h.counter++; s.auth.llmUsage.push({ createdAt: new Date(h.clock).toISOString(), model: "gpt-5-mini", estimatedCost: 0.001 });
        const row = { id: `bf-${p.id}-lage-2026-09-08`, user_id: p.id, slot: "lage",
          generated_at: new Date(h.clock).toISOString(), payload: { paragraphs: [{ text: "Neu", vorgang_ids: ["vg-test"] }] } };
        h.rows.push(row);
        return { available: true, fromCache: false, paragraphs: row.payload.paragraphs };
      }
    } };
  return h;
}

(async () => {
  await test("500 Zielprofile, vorhandene 22 geschuetzt, 478 lokale Textsimulationen und echte Quittung", async () => {
    const h = fixture(), baseline = D.hash(h.s), texts = kopie(h.rows);
    const r = await T.ausfuehren(h.args);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.gespeichert, 478);
    assert.equal(r.results.length, 500); assert.equal(new Set(h.calls).size, 478);
    assert.deepEqual(r.projektionsbeleg, { gesamt: 500, erledigt: 500,
      erledigtUndFaellig: 500, wartend: 0, laufend: 0, fehlgeschlagen: 0 });
    assert.equal(r.funktionsnachweis500, false); assert.equal(h.locks.length, 0);
    assert(texts.every(x => D.hash(h.rows.find(y => y.id === x.id)) === D.hash(x)));
    const q = h.receipts.at(-1);
    assert.equal(q.status, "success"); assert.equal(q.processed_count, 478); assert.equal(q.failed_count, 0);
    // Kostenring darf wachsen; Profile, Identitaeten und Konten bleiben identisch.
    h.s.auth.llmUsage = [{ createdAt: start, model: "gpt-5-mini", estimatedCost: 0.01 }];
    assert.equal(D.hash(h.s), baseline);
  });
  await test("Zeitgrenze endet mit ehrlicher Teilmenge, nie automatischer Fortsetzung", async () => {
    const h = fixture(); h.stepMs = 20000;
    const r = await T.ausfuehren(h.args);
    assert(r.ok); assert(r.gespeichert > 0 && r.gespeichert < 478);
    assert(r.results.some(x => x.grund === "zeitbudget")); assert.equal(r.automatischeWiederholung, false);
  });
  await test("Unlesbare, doppelte oder fremde Textzeilen sperren die erste Generierung", async () => {
    for (const bad of [{}, [null], [{ id: "fremd", user_id: "fremd" }], "duplicate"]) {
      const h = fixture(), get = h.args.deps.get;
      h.args.deps.get = async path => {
        const rows = await get(path);
        if (!path.startsWith("briefings?")) return rows;
        return bad === "duplicate" && rows.length ? [rows[0], rows[0]] : bad === "duplicate" ? rows : bad;
      };
      const r = await T.ausfuehren(h.args);
      assert.equal(r.grund, "nachlauf-textbestand-unlesbar");
      assert.equal(h.calls.length, 0); assert.equal(h.receipts.length, 0);
    }
  });
  await test("Spaetere Projektionen bleiben unveraendert sichtbar und sperren den Lage Text nicht", async () => {
    const h = fixture(); h.jobs.forEach(j => { j.status = "wartend"; j.due_at = "2026-09-08T20:00:00Z"; });
    const r = await T.ausfuehren(h.args);
    assert(r.ok); assert.equal(h.calls.length, 478);
    assert.deepEqual(r.projektionsbeleg, { gesamt: 500, erledigt: 0,
      erledigtUndFaellig: 0, wartend: 500, laufend: 0, fehlgeschlagen: 0 });
  });
  await test("Konfiguration, Freigabe, UTC Wechsel und Cronkonkurrenz sperren vor Schreiben", async () => {
    for (const change of [h => h.config.kommunikationGesperrt = false, h => h.config.narrativQueue = true,
      h => h.config.vorrangreserveReal = 199, h => h.args.confirmation = "ja",
      h => h.clock = Date.parse("2026-09-08T23:59:00Z"), h => h.clock = Date.parse("2026-09-08T17:28:00Z")]) {
      const h = fixture(); change(h); const r = await T.ausfuehren(h.args);
      assert.equal(r.ok, false); assert.equal(h.calls.length, 0); assert.equal(h.receipts.length, 0);
    }
  });
  await test("Unlesbarer Stand, unbekannte Kosten, Reservierungsluecke, fremde Leases und Versand stoppen", async () => {
    for (const change of [h => h.fault = "timeout", h => h.s.auth.llmUsage[0].estimatedCost = null,
      h => h.counter = 2, h => h.locks.push({ job_name: "fremd" }), h => h.leases.push({ id: "x" }),
      h => h.orphans.push({ id: "x" }), h => h.outbox.push({ id: "x" }), h => h.events.push({ createdAt: start }),
      h => h.runs.push({ run_id: "fremder-lauf" }), h => h.s.auth.llmUsage[0].estimatedCost = 7]) {
      const h = fixture(); change(h); const r = await T.ausfuehren(h.args);
      assert.equal(r.ok, false); assert.equal(h.calls.length, 0); assert.equal(h.receipts.length, 0);
    }
  });
  await test("Neue Kostenluecke nach erstem Modell sperrt den zweiten ohne Wiederholung", async () => {
    const h = fixture(), build = h.args.deps.build;
    h.args.deps.build = async (...args) => { const r = await build(...args); h.counter++; return r; };
    const r = await T.ausfuehren(h.args);
    assert.equal(r.ok, false); assert.equal(r.grund, "nachlauf-kosten-unklar");
    assert.equal(h.calls.length, 1); assert.equal(r.gespeichert, 1); assert.equal(h.receipts.at(-1).status, "failed");
  });
  await test("Modellfehler stoppt, ein fehlender Quellennachweis bleibt ehrlich offen", async () => {
    for (const reason of ["ai-unavailable", "no-current-sources"]) {
      const h = fixture(); let calls = 0;
      h.args.deps.build = async () => { calls++; return { available: false, reason }; };
      const r = await T.ausfuehren(h.args);
      assert.equal(r.gespeichert, 0);
      assert.equal(r.ok, reason === "no-current-sources");
      assert.equal(calls, reason === "no-current-sources" ? 478 : 1);
    }
  });
  await test("Bereits verwendete Laufkennung erzeugt keinen zweiten Lauf", async () => {
    const h = fixture(); h.receipts.push({ run_id: h.args.runId });
    const r = await T.ausfuehren(h.args);
    assert.equal(r.grund, "nachlauf-kennung-bereits-verwendet"); assert.equal(h.calls.length, 0); assert.equal(h.locks.length, 0);
  });
  await test("Geaenderte Profile und gespeicherte Texte schlagen die Nachkontrolle fehl", async () => {
    for (const type of ["profile", "text"]) {
      const h = fixture(), build = h.args.deps.build;
      h.args.deps.build = async (...args) => { const r = await build(...args); h.stepMs = 240000;
        if (type === "profile") h.s.mandate[0].updated_at = "veraendert";
        else h.rows[0].payload.paragraphs[0].text = "veraendert";
        return r;
      };
      const r = await T.ausfuehren(h.args);
      assert.equal(r.ok, false); assert.match(r.grund, /verae?ndert/);
    }
  });
  console.log(`${passed}/${passed} Textnachlauf Testgruppen bestanden. Alle Modellantworten waren lokale Fixtures.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
