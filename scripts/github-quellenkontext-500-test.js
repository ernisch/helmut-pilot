"use strict";
const assert = require("node:assert/strict");
const D = require("../lib/helmut/testkohorte-direkt500");
const S = require("../lib/helmut/storage");
const G = require("./github-quellenkontext-500");
const { JETZT, SHA, kopie } = require("./fixtures/direkt500");
const title = "Parlament beraet kommunale Pflegeangebote";
const summary = "Der Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an. Die Beratung betrifft Angebote in den Gemeinden.";
function fixture(count = 2) {
  const ids = [...Array.from({ length: 5 }, (_, i) => "dummy-" + i), ...D.ALLE_KENNUNGEN];
  const bestand = { mandate: ids.map((id, i) => ({ user_id: id, aktiv: i < 5 })),
    identitaeten: ids.map(id => ({ id })), auth: { users: [], llmUsage: [] }, main: { rawItems: [] } };
  const documents = Array.from({ length: count }, (_, i) => ({ id: `rd-fixture-${String(i).padStart(3, "0")}`, title,
    url: `https://example.org/artikel/pflege-${i}`, canonical_url: `https://example.org/artikel/pflege-${i}`,
    summary: null, raw: { erhalten: "Altmetadaten" }, published_at: "2026-09-10T21:00:00Z", content_hash: `hash-${i}`, source_type: "official" }));
  const kos = Array.from({ length: Math.ceil(count / 6) }, (_, i) => ({ id: `ko-vg-fixture-${i}`, vorgang_id: `vg-fixture-${i}`,
    title, status: "active", understanding_status: "complete", was_ist_passiert: "Eine oeffentliche Anhoerung ist geplant." }));
  const f = { bestand, documents, acquired: 0, released: 0, locked: false, writes: 0, fetches: 0, counter: 0, fail: null };
  f.args = { bestand, config: { quellenkontext: { version: 1, scoring: "off", relevanzordnung: false,
    koScan: 500, lageMax: 12, relevanzTage: 14, sourceSafetyStandard: true, atomicLock: true } },
    env: { GITHUB_SHA: SHA, GITHUB_RUN_ID: "123456789", GITHUB_RUN_ATTEMPT: "1", SUPABASE_SERVICE_ROLE_KEY: "offline" },
    now: () => new Date(JETZT), snapshot: async () => kopie(bestand),
    pruefeBetrieb: async () => { if (f.fail === "konkurrenz") throw new D.DirektAbbruch("aktive-oder-verwaiste-lease"); },
    db: async path => {
      const u = new URL("https://offline.invalid/" + path), table = u.pathname.slice(1), p = u.searchParams;
      if (table === "llm_budget_counters") return [{ used: f.counter }];
      if (table === "pipeline_locks") return f.locked ? [{ job_name: "500-quellenkontext" }] : [];
      if (table === "matching_results") return [];
      if (table === "ko_document_links") {
        if (f.fail === "quellenlesen") throw Error("Transportfehler");
        const i = Number(p.get("knowledge_object_id").split("-").at(-1));
        return documents.slice(i * 6, i * 6 + 6).map(d => ({ raw_documents: kopie(d) }));
      }
      if (table === "raw_documents") return kopie(documents.filter(d => d.id === p.get("id").slice(3)));
      throw Error("Unerwarteter Lesezugriff");
    },
    fetchFn: async (url, opts) => {
      assert.equal(opts.method, "PATCH"); assert.equal(opts.redirect, "error"); assert(opts.signal);
      const u = new URL(url), p = u.searchParams;
      assert.equal(u.pathname, "/rest/v1/raw_documents");
      const d = documents.find(d => "eq." + d.id === p.get("id"));
      assert(d); assert.equal(p.get("raw"), "eq." + JSON.stringify(d.raw));
      assert.equal(p.get("title"), "eq." + d.title); assert.equal(p.get("url"), "eq." + d.url);
      if (f.fail === "cas") return { status: 200, json: async () => [] };
      const patch = JSON.parse(opts.body); assert.deepEqual(Object.keys(patch).sort(), ["raw", "summary"]);
      Object.assign(d, patch); f.writes++;
      if (f.fail === "ruecklesung") d.content_hash = "konkurrierend";
      if (f.fail === "kosten") f.counter++;
      return { status: 200, json: async () => [kopie(d)] };
    },
    deps: { storage: { fromMandateProfileRow: S.fromMandateProfileRow,
      listKnowledgeObjects: async () => kopie(kos),
      acquirePipelineLock: async () => { f.acquired++; f.locked = f.fail !== "sperre"; return f.locked; },
      releasePipelineLock: async () => { f.released++; f.locked = false; } },
      fetchArticle: async (url, depth, deps) => {
        f.fetches++; assert.equal(depth, 0); assert.equal(deps.allowedHost, "example.org");
        if (f.fail === "artikel") throw Error("HTTP 503");
        return { finalUrl: url, body: `<meta property="og:title" content="${title}"><meta property="og:description" content="${summary}">` };
      } }
  };
  return f;
}
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("500 Profile teilen genau eine Nachlese fuer einen Treffer ausserhalb des Fensters", async () => {
    const f=fixture(), db=f.args.db; let reads=0;
    const wanted={id:"ko-vg-fixture-0",vorgang_id:"vg-fixture-0",status:"active",
      understanding_status:"complete",was_ist_passiert:"Eine oeffentliche Anhoerung ist geplant."};
    f.args.deps.storage.listKnowledgeObjects=async()=>[];
    f.args.deps.storage.listKnowledgeObjectsByIds=async ids=>{
      reads++; assert.deepEqual(ids,[wanted.id]); return [wanted];
    };
    f.args.db=async path=>{
      if(!path.startsWith("matching_results?"))return db(path);
      const filter=new URL("https://offline.invalid/"+path).searchParams.get("user_id");
      return f.bestand.mandate.filter(m=>filter.includes(JSON.stringify(m.user_id)))
        .map(m=>({id:"m-"+m.user_id,user_id:m.user_id,knowledge_object_id:wanted.id,rank:1}));
    };
    const r=await G.ausfuehren(f.args);
    assert.equal(r.ok,true,JSON.stringify(r)); assert.equal(r.gepruefteProfile,500);
    assert.equal(reads,1); assert.equal(r.ergaenzt,2); assert.equal(r.modellaufrufe,0);
  });
  await test("Fehlgeschlagene Treffer Nachlese verhindert Quellenwrites und gibt die Sperre frei", async () => {
    const f=fixture(), db=f.args.db;
    f.args.deps.storage.listKnowledgeObjects=async()=>[];
    f.args.deps.storage.listKnowledgeObjectsByIds=async()=>{throw Error("Lesefehler");};
    f.args.db=async path=>{
      if(!path.startsWith("matching_results?"))return db(path);
      const filter=new URL("https://offline.invalid/"+path).searchParams.get("user_id");
      return f.bestand.mandate.filter(m=>filter.includes(JSON.stringify(m.user_id)))
        .map(m=>({id:"m-"+m.user_id,user_id:m.user_id,knowledge_object_id:"ko-fehlt",rank:1}));
    };
    const r=await G.ausfuehren(f.args);
    assert.equal(r.ok,false); assert.equal(f.writes,0); assert.equal(f.fetches,0);
    assert.equal(f.released,1); assert.equal(f.locked,false);
  });
  await test("Volle unbekannte Reserve erlaubt Quellenarbeit und bleibt unveraendert", async () => {
    const B = require("../lib/helmut/testkosten-budget");
    for (const mode of ["reserviert", "ungeklaert", "ohne-buch", "ohne-reserve", "alte-regel", "fremde-sperre"]) {
      const f = fixture(), day = JETZT.slice(0, 10);
      await B.reserviere({ model: "gpt-5-mini", maxOutputTokens: 3000 }, {
        env: { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", AZURE_OPENAI_KEY: "offline" },
        now: () => new Date(JETZT), id: () => "unbekannter-aufuf",
        storage: { leseLlmTageszaehler: async () => ({ ok: true, used: 0 }),
          mutateAuthStore: async fn => fn(f.bestand.auth) }
      });
      const buch = f.bestand.auth.testKostenTage[day];
      buch.frozen = "test-usd-ausgang-unklar";
      f.bestand.auth.llmUsage = [{ createdAt: JETZT, model: "gpt-5-mini", estimatedCost: null }];
      f.counter = 1;
      f.args.config.testKosten = { version: 2, aktiv: true, limitUsd: 4, unbekanntBleibtReserviert: true };
      if (mode === "ungeklaert") { Object.values(buch.calls)[0].status = "ungeklaert"; buch.frozen = null; }
      if (mode === "ohne-buch") delete f.bestand.auth.testKostenTage;
      if (mode === "ohne-reserve") buch.calls = {};
      if (mode === "alte-regel") f.args.config.testKosten.version = 1;
      if (mode === "fremde-sperre") buch.frozen = "test-usd-beleg-obergrenze-verletzt";
      const before = D.hash(f.bestand.auth);
      const r = await G.ausfuehren(f.args);
      const erlaubt = ["reserviert", "ungeklaert"].includes(mode);
      assert.equal(r.ok, erlaubt, JSON.stringify(r));
      assert.equal(D.hash(f.bestand.auth), before, "Kein Kostenbuchwrite und keine Erstattung");
      assert.equal(f.fetches, erlaubt ? 2 : 0); assert.equal(f.writes, erlaubt ? 2 : 0);
      if (erlaubt) { assert.equal(r.modellaufrufe, 0); assert.equal(r.kosten.gebundenUsd, 0.212); }
      else assert.equal(f.acquired, 0);
    }
  });
  await test("Fehlende Nutzungszeilen brauchen je eine volle Reserve am echten Zaehler", async () => {
    const B = require("../lib/helmut/testkosten-budget");
    for (const mode of ["nur-fehlend", "beide-luecken", "eine-reserve-fehlt", "zaehler-zu-klein", "legacy-luecke", "falsches-limit"]) {
      const f = fixture(), day = JETZT.slice(0, 10);
      await B.reserviere({ model: "gpt-5-mini", maxOutputTokens: 3000 }, {
        env: { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", AZURE_OPENAI_KEY: "offline" },
        now: () => new Date(JETZT), id: () => "fehlende-nutzung",
        storage: { leseLlmTageszaehler: async () => ({ ok: true, used: 0 }),
          mutateAuthStore: async fn => fn(f.bestand.auth) }
      });
      const buch = f.bestand.auth.testKostenTage[day];
      buch.calls["fehlende-nutzung"].status = "ungeklaert";
      buch.baselineCalls = 1; buch.baseline = 10; buch.spent = 10;
      f.bestand.auth.llmUsage = [{ createdAt: JETZT, model: "gpt-5-mini", estimatedCost: 0.00001 }];
      f.counter = 2;
      f.args.config.testKosten = { version: 2, aktiv: true, limitUsd: 4, unbekanntBleibtReserviert: true };
      if (["beide-luecken", "eine-reserve-fehlt"].includes(mode)) {
        f.counter = 3;
        f.bestand.auth.llmUsage.push({ createdAt: JETZT, model: "gpt-5-mini", estimatedCost: null });
        if (mode === "beide-luecken") buch.calls["zweiter-unbekannter"] = kopie(buch.calls["fehlende-nutzung"]);
      }
      if (mode === "zaehler-zu-klein") f.bestand.auth.llmUsage = [0, 1, 2].map(() =>
        ({ createdAt: JETZT, model: "gpt-5-mini", estimatedCost: 0.001 }));
      if (mode === "legacy-luecke") delete f.bestand.auth.testKostenTage;
      if (mode === "falsches-limit") f.args.config.testKosten.limitUsd = 5;
      const before = D.hash(f.bestand.auth), erlaubt = ["nur-fehlend", "beide-luecken"].includes(mode);
      const r = await G.ausfuehren(f.args);
      assert.equal(r.ok, erlaubt, mode + ": " + JSON.stringify(r));
      assert.equal(D.hash(f.bestand.auth), before, "Kein Nachtrag, keine Erstattung");
      assert.equal(f.fetches, erlaubt ? 2 : 0); assert.equal(f.writes, erlaubt ? 2 : 0);
      if (erlaubt) {
        assert.equal(r.modellaufrufe, 0); assert.equal(r.kosten.reservierungsluecke, 1);
        assert.equal(r.kosten.gebundenUsd, mode === "beide-luecken" ? 0.42401 : 0.21201);
      } else { assert.equal(f.acquired, 0); assert.equal(r.grund, mode === "falsches-limit"
        ? "quellenkontext-kostenregel-abweichend" : "quellenkontext-kosten-unklar"); }
    }
  });
  await test("500 Profile lesen, leere Originalauszuege ergaenzen, null Modellarbeit", async () => {
    const f = fixture(), before = D.hash(f.bestand);
    const r = await G.ausfuehren(f.args);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.gepruefteProfile, 500);
    assert.equal(r.ergaenzt, 2); assert.equal(r.profileMitZweiAuszuegen, 500);
    assert.equal(f.writes, 2); assert.equal(f.fetches, 2); assert.equal(f.counter, 0);
    assert.equal(D.hash(f.bestand), before); assert.equal(f.released, 1); assert.equal(f.locked, false);
    assert.equal(r.funktionsnachweis500, false);
    assert(f.documents.every(d => d.raw.erhalten === "Altmetadaten" && d.summary === summary));
    const next = await G.ausfuehren(f.args);
    assert.equal(next.ok, true, JSON.stringify(next)); assert.equal(next.ergaenzt, 0); assert.equal(f.fetches, 2);
  });
  await test("Harte Scheibengrenze 40 Quellen, Fortsetzung nur bei bisher unversuchten Quellen", async () => {
    const f = fixture(45); f.fail = "artikel";
    const r = await G.ausfuehren(f.args);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.nichtErgaenzbar, 40);
    assert.equal(r.nochNichtVersucht, 5); assert.equal(f.writes, 40); assert.equal(f.fetches, 40);
    f.fail = null;
    const next = await G.ausfuehren(f.args);
    assert.equal(next.ergaenzt, 5); assert.equal(f.writes, 45); assert.equal(f.fetches, 45);
  });
  await test("Zeitreserve beendet eine Scheibe vor weiterer Quelle", async () => {
    const f = fixture(); let clock = Date.parse(JETZT);
    f.args.now = () => new Date(clock);
    const get = f.args.deps.fetchArticle;
    f.args.deps.fetchArticle = async (...args) => { const r = await get(...args); clock += 390000; return r; };
    const r = await G.ausfuehren(f.args);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.ergaenzt, 1); assert.equal(f.fetches, 1);
    assert.equal(f.locked, false);
  });
  await test("Anbieterfehler bleiben rot und werden am selben Stand nicht wiederholt", async () => {
    const f = fixture(); f.fail = "artikel";
    const r = await G.ausfuehren(f.args);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.ergaenzt, 0); assert.equal(r.nichtErgaenzbar, 2);
    assert.equal(r.profileOhneAuszug, 500); assert(f.documents.every(d => d.summary === null));
    const next = await G.ausfuehren(f.args);
    assert.equal(next.bereitsGeprueft, 2); assert.equal(f.fetches, 2); assert.equal(f.writes, 2);
    f.args.env.GITHUB_SHA = "b".repeat(40);
    f.fail = null;
    const neuerCommit = await G.ausfuehren(f.args);
    assert.equal(neuerCommit.ok, true); assert.equal(neuerCommit.bereitsGeprueft, 2);
    assert.equal(neuerCommit.ergaenzt, 0); assert.equal(f.fetches, 2); assert.equal(f.writes, 2);
    assert(f.documents.every(d => d.summary === null && d.raw.helmutQuellenkontext.commit === SHA));
  });
  await test("Aktive Kohorte, falsche Runtime oder Actions Wiederholung sperren vor Lock", async () => {
    for (const mode of ["aktiv", "runtime", "wiederholung"]) {
      const f = fixture();
      if (mode === "aktiv") f.bestand.mandate[5].aktiv = true;
      if (mode === "runtime") f.args.config.quellenkontext.relevanzTage = 30;
      if (mode === "wiederholung") f.args.env.GITHUB_RUN_ATTEMPT = "2";
      const r = await G.ausfuehren(f.args);
      assert.equal(r.ok, false); assert.equal(f.acquired, 0); assert.equal(f.writes, 0); assert.equal(f.fetches, 0);
    }
  });
  await test("Konkurrenz und Lesefehler stoppen ohne Artikelfetch oder Datenwrite", async () => {
    for (const mode of ["sperre", "konkurrenz", "quellenlesen"]) {
      const f = fixture(); f.fail = mode;
      const r = await G.ausfuehren(f.args);
      assert.equal(r.ok, false); assert.equal(f.writes, 0); assert.equal(f.fetches, 0); assert.equal(f.locked, false);
    }
  });
  await test("CAS Konflikt und abweichende Ruecklesung stoppen mit offenem Zustand", async () => {
    for (const mode of ["cas", "ruecklesung"]) {
      const f = fixture(); f.fail = mode;
      const r = await G.ausfuehren(f.args);
      assert.equal(r.ok, false); assert.equal(r.zustandUnbekannt, true); assert.equal(f.fetches, 1); assert.equal(f.locked, false);
    }
  });
  await test("Ein geaenderter Kostenzähler darf keinen kostenfreien Erfolg melden", async () => {
    const f = fixture(); f.fail = "kosten";
    const r = await G.ausfuehren(f.args);
    assert.equal(r.ok, false); assert.equal(r.grund, "quellenkontext-modellkosten-veraendert"); assert.equal(f.locked, false);
  });
  console.log(`${pass}/${pass} Controllerpruefgruppen bestanden`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
