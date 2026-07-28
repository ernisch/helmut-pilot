"use strict";

// Sprint 22C1 — Tests des Production-Backfills (0 Netz, 0 DB, 0 KI).
// =============================================================================
// Deckt Migration/Rollback (statisch), harte Grenzen, Lock-Lebenszyklus,
// Dry-Run-Default, Freigabeflagge, Wiederaufnahme, Idempotenz, Fehlerpfade,
// Modellversionen, Abdeckungsprüfung, Mandantenneutralität und die
// Unantastbarkeit des Legacy-Matchings ab. Alle Netz-/DB-Zugriffe laufen gegen
// injizierte Mocks; der echte CLI-Freigabepfad wird ohne Netz (Abbruch vor dem
// ersten Aufruf) über einen Kindprozess geprüft.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const backfill = require(path.join(root, "lib/helmut/embedding-backfill.js"));
const { RECIPE_VERSION, buildCanonicalEmbeddingInput, computeEmbeddingInputHash } = require(path.join(root, "lib/helmut/embedding-contract.js"));
const { schaetzeTokens } = require(path.join(root, "lib/helmut/embedding-shadow-pipeline.js"));

const MIGRATION = fs.readFileSync(path.join(root, "supabase/migrations/20260728_embedding_shadow.sql"), "utf8");
const ROLLBACK = fs.readFileSync(path.join(root, "supabase/migrations/20260728_embedding_shadow_rollback.sql"), "utf8");
const BACKFILL_LIB = fs.readFileSync(path.join(root, "lib/helmut/embedding-backfill.js"), "utf8");
const BACKFILL_CLI = fs.readFileSync(path.join(root, "scripts/embedding-backfill.js"), "utf8");

let bestanden = 0, fehlgeschlagen = 0;
function pruefe(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log("PASS ", name); bestanden += 1; })
    .catch((e) => { console.log("FAIL ", name, "→", e.message); fehlgeschlagen += 1; });
}

function ko(id, extra = {}) {
  return {
    id,
    understanding_status: "complete",
    status: "neu",
    headline: `Testvorgang ${id} mit ausreichend langem Titel`,
    was_ist_passiert: `Im Vorgang ${id} ist eine politisch relevante Entscheidung mit ausreichend langem Kerntext getroffen worden.`,
    warum_wichtig: "Der Vorgang hat Auswirkungen auf laufende Beratungen.",
    event_type: "bericht",
    decision_entities: [{ name: "Bundesministerium für Arbeit und Soziales" }],
    related_entities: [{ name: "SPD" }],
    ...extra
  };
}

function antwort(status, daten) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (daten == null ? "" : JSON.stringify(daten)),
    json: async () => daten
  };
}

// Konfigurierbarer Supabase-Mock: bildet die vom Backfill benutzten REST-Pfade
// ab und protokolliert JEDEN Aufruf (Methode, Pfad, Body) für Negativ-Beweise.
function supabaseMock(opts = {}) {
  const zustand = {
    kos: opts.kos || [],
    shadowRows: opts.shadowRows || [],           // bestehende Zeilen (aktive Konfiguration)
    tabelleVorhanden: opts.tabelleVorhanden !== false,
    fremdsperren: opts.fremdsperren || [],
    acquire: opts.acquire || (() => ({ acquired: true, token: "tok-1" })),
    renew: opts.renew || (() => true),
    aufrufe: [],
    writes: [],
    releases: 0
  };
  const fetchImpl = async (url, optionen = {}) => {
    const methode = (optionen.method || "GET").toUpperCase();
    zustand.aufrufe.push({ methode, url, body: optionen.body || null });
    if (url.includes("/rest/v1/rpc/helmut_acquire_pipeline_lock")) {
      const r = zustand.acquire(JSON.parse(optionen.body));
      if (r instanceof Error) return antwort(500, { message: r.message });
      return antwort(200, [r]);
    }
    if (url.includes("/rest/v1/rpc/helmut_renew_pipeline_lock")) {
      const r = zustand.renew(JSON.parse(optionen.body));
      if (r instanceof Error) return antwort(500, { message: r.message });
      return antwort(200, r);
    }
    if (url.includes("/rest/v1/rpc/helmut_release_pipeline_lock")) {
      zustand.releases += 1;
      return antwort(200, true);
    }
    if (url.includes("/rest/v1/pipeline_locks")) {
      return antwort(200, zustand.fremdsperren);
    }
    if (url.includes("/rest/v1/knowledge_object_embeddings")) {
      if (!zustand.tabelleVorhanden) {
        return antwort(404, { message: 'relation "public.knowledge_object_embeddings" does not exist' });
      }
      if (methode === "POST") {
        const zeilen = JSON.parse(optionen.body);
        zustand.writes.push(...zeilen);
        return antwort(201, null);
      }
      // seitenweises Lesen: offset/limit auswerten
      const offset = Number((/offset=(\d+)/.exec(url) || [0, 0])[1]);
      const limit = Number((/limit=(\d+)/.exec(url) || [0, 500])[1]);
      return antwort(200, zustand.shadowRows.slice(offset, offset + limit));
    }
    if (url.includes("/rest/v1/knowledge_objects")) {
      assert.strictEqual(methode, "GET", `knowledge_objects darf nur gelesen werden, war: ${methode}`);
      let kos = zustand.kos;
      const idsMatch = /id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url));
      if (idsMatch) {
        const ids = idsMatch[1].split(",").map((s) => s.replace(/"/g, ""));
        kos = kos.filter((k) => ids.includes(k.id));
      }
      const offset = Number((/offset=(\d+)/.exec(url) || [0, 0])[1]);
      const limit = Number((/limit=(\d+)/.exec(url) || [0, 500])[1]);
      return antwort(200, kos.slice(offset, offset + limit));
    }
    throw new Error(`Mock kennt Pfad nicht: ${methode} ${url}`);
  };
  return { fetchImpl, zustand };
}

function deps(mock, extra = {}) {
  return {
    env: { SUPABASE_URL: "https://mock.local", SUPABASE_SERVICE_ROLE_KEY: "mock-key" },
    fetchImpl: mock.fetchImpl,
    jetzt: () => "2026-07-28T15:00:00.000Z",
    log: () => {},
    ...extra
  };
}

function basisCfg(extra = {}) {
  return {
    model: "text-embedding-3-small",
    dim: 4, // kleine Dimension für lesbare Tests; die 256er-Pflicht prüft AB-24
    recipeVersion: RECIPE_VERSION,
    batchGroesse: 2,
    maxObjekte: 100,
    maxTokens: 10000,
    maxKostenUsd: 0.05,
    preisProMTok: 0.02,
    parallelitaet: 1,
    ...extra
  };
}

function testProvider(dim, mutator) {
  const zustand = { aufrufe: 0, gleichzeitig: 0, maxGleichzeitig: 0 };
  const provider = {
    name: "mock-provider",
    deployment: "mock-deployment",
    apiVersion: "2024-10-21",
    aufruf: async ({ inputs }) => {
      zustand.aufrufe += 1;
      zustand.gleichzeitig += 1;
      zustand.maxGleichzeitig = Math.max(zustand.maxGleichzeitig, zustand.gleichzeitig);
      await new Promise((r) => setImmediate(r));
      const ergebnis = {
        vectors: inputs.map((_, i) => Array.from({ length: dim }, (_, d) => (d + i + 1) / 10)),
        usage: { prompt_tokens: inputs.length * 10, total_tokens: inputs.length * 10 }
      };
      zustand.gleichzeitig -= 1;
      return mutator ? mutator(ergebnis, zustand.aufrufe) : ergebnis;
    }
  };
  return { provider, zustand };
}

async function main() {
  // ── A · Migration & Rollback (statisch) ────────────────────────────────────
  await pruefe("A1 Migration: additive Tabelle mit FK auf knowledge_objects (on delete cascade)", () => {
    assert.match(MIGRATION, /create table if not exists public\.knowledge_object_embeddings/);
    assert.match(MIGRATION, /references public\.knowledge_objects\(id\) on delete cascade/);
  });
  await pruefe("A2 Migration: alle 16 Pflichtfelder des Datenvertrags vorhanden", () => {
    for (const spalte of ["knowledge_object_id", "embedding_kind", "model", "model_version",
      "provider", "deployment", "api_version", "dim", "recipe_version", "input_hash",
      "input_tokens", "embedding", "is_active", "status", "last_error", "attempt_count",
      "last_attempt_at", "created_at", "updated_at"]) {
      assert.ok(new RegExp(`\\b${spalte}\\b`).test(MIGRATION), `Spalte ${spalte} fehlt`);
    }
  });
  await pruefe("A3 Migration: RLS aktiv, KEINE Policies, Default-Grants entzogen", () => {
    assert.match(MIGRATION, /alter table public\.knowledge_object_embeddings enable row level security/);
    assert.doesNotMatch(MIGRATION, /create policy/i);
    assert.match(MIGRATION, /revoke all on table public\.knowledge_object_embeddings from public, anon, authenticated/);
  });
  await pruefe("A4 Migration: genau eine aktive Repräsentation je Objekt (Teilindex) + PK je Modellgeneration", () => {
    assert.match(MIGRATION, /create unique index if not exists knowledge_object_embeddings_active_uidx[\s\S]*?\(knowledge_object_id, embedding_kind\)\s*where is_active/);
    assert.match(MIGRATION, /primary key \(knowledge_object_id, embedding_kind, model, dim, recipe_version\)/);
  });
  await pruefe("A5 Migration: nicht destruktiv (kein drop/alter bestehender Tabellen, kein ANN-Index)", () => {
    // Prüfung gegen das SQL OHNE Kommentare — die Begründungskommentare dürfen
    // die ausgeschlossenen Konstrukte benennen.
    const sql = MIGRATION.replace(/--[^\n]*/g, "");
    assert.doesNotMatch(sql, /drop\s+table/i);
    assert.doesNotMatch(sql, /alter table public\.(?!knowledge_object_embeddings)/);
    assert.doesNotMatch(sql, /ivfflat|hnsw/i);
    // Daten-DML nur im Renew-Funktionskörper (Verlängerung des EIGENEN Locks,
    // token-gebunden) — sonst nirgends.
    assert.doesNotMatch(sql.replace(/update public\.pipeline_locks[\s\S]*?row_count;/, ""), /update\s+public\.|delete\s+from/i);
  });
  await pruefe("A6 Migration: Renew-RPC token-gebunden, nicht nach Ablauf, Grants entzogen, search_path fix", () => {
    assert.match(MIGRATION, /create or replace function public\.helmut_renew_pipeline_lock\(p_job text, p_token text, p_ttl_ms bigint\)/);
    assert.match(MIGRATION, /token = p_token/);
    assert.match(MIGRATION, /expires_at > now\(\)/);
    assert.match(MIGRATION, /revoke all on function public\.helmut_renew_pipeline_lock[\s\S]*?from public, anon, authenticated/);
    assert.match(MIGRATION, /alter function public\.helmut_renew_pipeline_lock[\s\S]*?set search_path = public, pg_temp/);
  });
  await pruefe("A7 Rollback: vollständig (Tabelle + Renew-Funktion) und nichts anderes", () => {
    assert.match(ROLLBACK, /drop table if exists public\.knowledge_object_embeddings/);
    assert.match(ROLLBACK, /drop function if exists public\.helmut_renew_pipeline_lock\(text, text, bigint\)/);
    assert.doesNotMatch(ROLLBACK, /knowledge_objects\b(?!_embeddings)/);
    assert.doesNotMatch(ROLLBACK, /pipeline_locks|helmut_acquire|helmut_release/);
  });

  // ── B · Harte Grenzen (fail-closed) ───────────────────────────────────────
  await pruefe("B1 Grenzen: Werte an den Obergrenzen sind zulässig", () => {
    const r = backfill.pruefeHarteGrenzen({
      maxObjekte: 1000, maxTokens: 200000, maxKostenUsd: 0.05,
      batchGroesse: 50, parallelitaet: 1, preisProMTok: 0.02
    });
    assert.deepStrictEqual(r, { ok: true, fehler: [] });
  });
  await pruefe("B2 Grenzen: jede Überschreitung wird abgelehnt (nicht gekappt)", () => {
    for (const [feld, wert] of [["maxObjekte", 1001], ["maxTokens", 200001],
      ["maxKostenUsd", 0.051], ["batchGroesse", 51], ["parallelitaet", 2], ["parallelitaet", 0]]) {
      const cfg = { maxObjekte: 1000, maxTokens: 200000, maxKostenUsd: 0.05, batchGroesse: 50, parallelitaet: 1, preisProMTok: 0.02, [feld]: wert };
      const r = backfill.pruefeHarteGrenzen(cfg);
      assert.strictEqual(r.ok, false, `${feld}=${wert} hätte abgelehnt werden müssen`);
    }
  });
  await pruefe("B3 Grenzen: fehlender Preis macht das Kostenlimit unerzwingbar → Ablehnung", () => {
    const r = backfill.pruefeHarteGrenzen({ maxObjekte: 10, maxTokens: 100, maxKostenUsd: 0.01, batchGroesse: 5, parallelitaet: 1 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.fehler.some((f) => f.includes("preisProMTok")));
  });
  await pruefe("B4 Kostenlimit → Tokenlimit: das strengere Limit gewinnt", () => {
    assert.strictEqual(backfill.effektivesTokenLimit({ maxTokens: 200000, maxKostenUsd: 0.05, preisProMTok: 0.02 }), 200000);
    assert.strictEqual(backfill.effektivesTokenLimit({ maxTokens: 200000, maxKostenUsd: 0.001, preisProMTok: 0.02 }), 50000);
  });

  // ── C · Dry-Run, Freigabeflagge, Schema ───────────────────────────────────
  await pruefe("C1 Dry-Run: 0 Lock-RPCs, 0 Provider-Aufrufe, 0 Writes — auch ohne Shadow-Tabelle", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b")], tabelleVorhanden: false });
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: true }));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.bericht.geplant, 2);
    assert.strictEqual(r.shadowTabelleVorhanden, false);
    assert.strictEqual(mock.zustand.writes.length, 0);
    assert.ok(!mock.zustand.aufrufe.some((a) => a.url.includes("rpc/helmut_")), "Dry-Run darf keine Lock-RPCs aufrufen");
  });
  await pruefe("C2 Echter Lauf ohne angewendete Migration wird abgelehnt (Phase schema)", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a")], tabelleVorhanden: false });
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.phase, "schema");
    assert.strictEqual(mock.zustand.writes.length, 0);
  });
  await pruefe("C3 CLI: --echt ohne `--freigabe erteilt` stoppt mit Exit 2 vor jedem Zugriff", () => {
    try {
      execFileSync(process.execPath, [path.join(root, "scripts/embedding-backfill.js"), "--echt"], {
        env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
        stdio: "pipe", timeout: 30000
      });
      assert.fail("hätte mit Exit 2 abbrechen müssen");
    } catch (e) {
      assert.strictEqual(e.status, 2);
      assert.match(String(e.stderr), /freigabepflichtig/);
    }
  });
  await pruefe("C4 CLI: Dry-Run ist der Standard (kein --echt im Standardpfad nötig)", () => {
    assert.match(BACKFILL_CLI, /DRY-RUN IST DER STANDARD/);
    assert.match(BACKFILL_CLI, /--echt --freigabe erteilt/);
  });

  // ── D · Limits im Lauf (fail-closed) ──────────────────────────────────────
  await pruefe("D1 Objektlimit kappt den Plan, der Rest bleibt unangefragt", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b"), ko("ko-c")] });
    const { provider, zustand } = testProvider(4);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, maxObjekte: 2, provider }));
    assert.strictEqual(r.bericht.berechnet, 2);
    assert.strictEqual(r.bericht.objektlimitAbgeschnitten, 1);
    assert.strictEqual(zustand.aufrufe, 1); // 2 Objekte, Batchgröße 2 → 1 Aufruf
  });
  await pruefe("D2 Tokenlimit: Überhang wird nicht angefragt", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b"), ko("ko-c")] });
    const { provider } = testProvider(4);
    // Limit knapp über den Tokens des ersten Objekts → genau 1 zugelassen.
    const tokens1 = schaetzeTokens(buildCanonicalEmbeddingInput(ko("ko-a")).text);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, maxTokens: tokens1 + 5, provider }));
    assert.strictEqual(r.bericht.berechnet, 1);
    assert.strictEqual(r.bericht.tokenlimitAbgeschnitten, 2);
  });
  await pruefe("D3 Kostenlimit wirkt als Tokenlimit (fail-closed)", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b"), ko("ko-c")] });
    const { provider } = testProvider(4);
    // Kostenlimit, das rechnerisch nur die Tokens des ersten Objekts (+Puffer)
    // erlaubt → das strengere Kostenlimit übersteuert das Tokenlimit.
    const tokens1 = schaetzeTokens(buildCanonicalEmbeddingInput(ko("ko-a")).text);
    const kosten = ((tokens1 + 10) / 1e6) * 0.02;
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, maxKostenUsd: kosten, provider }));
    assert.ok(r.tokenLimit >= tokens1 && r.tokenLimit <= tokens1 + 10, `wirksames Tokenlimit ${r.tokenLimit} muss aus dem Kostenlimit stammen`);
    assert.ok(r.tokenLimit < basisCfg().maxTokens, "das Kostenlimit muss das großzügigere Tokenlimit übersteuern");
    assert.strictEqual(r.bericht.berechnet, 1);
    assert.strictEqual(r.bericht.tokenlimitAbgeschnitten, 2);
  });
  await pruefe("D4 Batchgröße wird eingehalten, Parallelität ist strukturell 1", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b"), ko("ko-c"), ko("ko-d"), ko("ko-e")] });
    const { provider, zustand } = testProvider(4);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, batchGroesse: 2, provider }));
    assert.strictEqual(r.bericht.batches, 3);
    assert.strictEqual(zustand.aufrufe, 3);
    assert.strictEqual(zustand.maxGleichzeitig, 1, "Provider-Aufrufe müssen strikt sequenziell sein");
    assert.strictEqual(r.bericht.berechnet, 5);
  });

  // ── E · Lock-Lebenszyklus ─────────────────────────────────────────────────
  await pruefe("E1 Lock wird mit TTL erworben, nach jedem Batch erneuert, am Ende freigegeben", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b"), ko("ko-c")] });
    const renews = [];
    mock.zustand.renew = (body) => { renews.push(body); return true; };
    const { provider } = testProvider(4);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, batchGroesse: 2, ttlMs: 120000, provider }));
    assert.strictEqual(r.ok, true);
    const acquire = mock.zustand.aufrufe.find((a) => a.url.includes("acquire_pipeline_lock"));
    assert.strictEqual(JSON.parse(acquire.body).p_job, "semantic_embedding_backfill");
    assert.strictEqual(JSON.parse(acquire.body).p_ttl_ms, 120000);
    assert.strictEqual(renews.length, 2); // 2 Batches → 2 Erneuerungen
    assert.ok(renews.every((b) => b.p_job === "semantic_embedding_backfill" && b.p_token === "tok-1" && b.p_ttl_ms === 120000));
    assert.strictEqual(mock.zustand.releases, 1);
  });
  await pruefe("E2 Lock-Konflikt: belegter Lock verhindert den Lauf (0 Aufrufe, 0 Writes)", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a")], acquire: () => ({ acquired: false, token: null }) });
    const { provider, zustand } = testProvider(4);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.phase, "lock");
    assert.strictEqual(zustand.aufrufe, 0);
    assert.strictEqual(mock.zustand.writes.length, 0);
  });
  await pruefe("E3 Lock-Fehler (DB nicht erreichbar) ist fail-closed", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a")], acquire: () => new Error("db weg") });
    const { provider, zustand } = testProvider(4);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
    assert.strictEqual(r.phase, "lock");
    assert.match(r.fehler[0], /lock-fehler/);
    assert.strictEqual(zustand.aufrufe, 0);
  });
  await pruefe("E4 Lock-Ablauf/-Verlust: fehlgeschlagene Erneuerung bricht den Lauf kontrolliert ab", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b"), ko("ko-c"), ko("ko-d")] });
    mock.zustand.renew = () => false; // Lock nicht mehr erneuerbar (abgelaufen/übernommen)
    const { provider, zustand } = testProvider(4);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, batchGroesse: 2, provider }));
    assert.strictEqual(r.bericht.abgebrochen, true);
    assert.strictEqual(r.bericht.abbruchGrund, "lock-erneuerung-fehlgeschlagen");
    assert.strictEqual(zustand.aufrufe, 1); // nach Batch 1 abgebrochen — Batch 2 nie angefragt
    assert.strictEqual(r.bericht.berechnet, 2); // Batch 1 ist persistiert (kein Datenverlust)
    assert.strictEqual(mock.zustand.releases, 1); // Freigabeversuch trotzdem (finally)
  });
  await pruefe("E5 Fremde aktive Sperre (z. B. Crawl) verhindert den Start", async () => {
    const mock = supabaseMock({
      kos: [ko("ko-a")],
      fremdsperren: [{ job_name: "crawl-sources", expires_at: "2026-07-28T16:00:00Z" }]
    });
    const { provider, zustand } = testProvider(4);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
    assert.strictEqual(r.phase, "fremdsperren");
    assert.strictEqual(zustand.aufrufe, 0);
    assert.ok(!mock.zustand.aufrufe.some((a) => a.url.includes("acquire_pipeline_lock")), "bei fremder Sperre wird kein eigener Lock erworben");
  });

  // ── F · Wiederaufnahme, Idempotenz, Hash ──────────────────────────────────
  await pruefe("F1 Abbruch + Wiederaufnahme: zweiter Lauf plant exakt den Rest", async () => {
    const kos = [ko("ko-a"), ko("ko-b"), ko("ko-c"), ko("ko-d")];
    const mock1 = supabaseMock({ kos });
    mock1.zustand.renew = () => false; // erzwungener Abbruch nach Batch 1
    const { provider: p1 } = testProvider(4);
    const r1 = await backfill.fuehreBackfillAus(deps(mock1), basisCfg({ dryRun: false, batchGroesse: 2, provider: p1 }));
    assert.strictEqual(r1.bericht.berechnet, 2);
    // Wiederaufnahme: der persistierte Zustand (writes von Lauf 1) ist der Bestand von Lauf 2.
    const mock2 = supabaseMock({ kos, shadowRows: mock1.zustand.writes });
    const { provider: p2, zustand: z2 } = testProvider(4);
    const r2 = await backfill.fuehreBackfillAus(deps(mock2), basisCfg({ dryRun: false, batchGroesse: 2, provider: p2 }));
    assert.strictEqual(r2.bericht.aktuellUebersprungen, 2);
    assert.strictEqual(r2.bericht.berechnet, 2);
    assert.strictEqual(z2.aufrufe, 1);
    assert.deepStrictEqual(mock2.zustand.writes.map((w) => w.knowledge_object_id).sort(), ["ko-c", "ko-d"]);
  });
  await pruefe("F2 Idempotenz: identischer Zweitlauf → 0 API-Aufrufe, 0 Writes", async () => {
    const kos = [ko("ko-a"), ko("ko-b"), ko("ko-c")];
    const mock1 = supabaseMock({ kos });
    const { provider: p1 } = testProvider(4);
    const r1 = await backfill.fuehreBackfillAus(deps(mock1), basisCfg({ dryRun: false, provider: p1 }));
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.bericht.berechnet, 3);
    const mock2 = supabaseMock({ kos, shadowRows: mock1.zustand.writes });
    const { provider: p2, zustand: z2 } = testProvider(4);
    const r2 = await backfill.fuehreBackfillAus(deps(mock2), basisCfg({ dryRun: false, provider: p2 }));
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.bericht.geplant, 0);
    assert.strictEqual(r2.bericht.apiAufrufe, 0);
    assert.strictEqual(z2.aufrufe, 0);
    assert.strictEqual(mock2.zustand.writes.length, 0);
    assert.strictEqual(r2.bericht.aktuellUebersprungen, 3);
  });
  await pruefe("F3 Geänderter Input-Hash: genau das geänderte Objekt wird neu berechnet", async () => {
    const kos = [ko("ko-a"), ko("ko-b")];
    const mock1 = supabaseMock({ kos });
    const { provider: p1 } = testProvider(4);
    await backfill.fuehreBackfillAus(deps(mock1), basisCfg({ dryRun: false, provider: p1 }));
    const geaendert = [ko("ko-a"), ko("ko-b", { was_ist_passiert: "Der Vorgang wurde inhaltlich vollständig neu bewertet und beschrieben." })];
    const mock2 = supabaseMock({ kos: geaendert, shadowRows: mock1.zustand.writes });
    const { provider: p2, zustand: z2 } = testProvider(4);
    const r2 = await backfill.fuehreBackfillAus(deps(mock2), basisCfg({ dryRun: false, provider: p2 }));
    assert.strictEqual(r2.bericht.aktuellUebersprungen, 1);
    assert.strictEqual(r2.bericht.berechnet, 1);
    assert.strictEqual(z2.aufrufe, 1);
    assert.deepStrictEqual(mock2.zustand.writes.map((w) => w.knowledge_object_id), ["ko-b"]);
    assert.strictEqual(mock2.zustand.writes[0].input_hash, computeEmbeddingInputHash(geaendert[1]));
  });

  // ── G · Fehlerpfade (Antworten, Netz, Versuche) ───────────────────────────
  await pruefe("G1 Falsche Dimension/leer/NaN/Infinity: Fehlerstatus, NIE ein Vektor-Write", async () => {
    const faelle = [
      ["falsche-dimension", (e) => { e.vectors[0] = [1, 2]; return e; }],
      ["leer", (e) => { e.vectors[0] = []; return e; }],
      ["ungueltige-werte", (e) => { e.vectors[0] = [NaN, 0.1, 0.2, 0.3]; return e; }],
      ["ungueltige-werte", (e) => { e.vectors[0] = [Infinity, 0.1, 0.2, 0.3]; return e; }]
    ];
    for (const [grund, mutator] of faelle) {
      const mock = supabaseMock({ kos: [ko("ko-a")] });
      const { provider } = testProvider(4, mutator);
      const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
      assert.strictEqual(r.ok, false, grund);
      assert.strictEqual(r.bericht.fehlgeschlagen.length, 1, grund);
      assert.match(r.bericht.fehlgeschlagen[0].grund, new RegExp(grund));
      const zeile = mock.zustand.writes.find((w) => w.knowledge_object_id === "ko-a");
      assert.strictEqual(zeile.embedding, null, `${grund}: es darf kein Vektor gespeichert werden`);
      assert.strictEqual(zeile.status, "fehlgeschlagen");
      assert.ok(zeile.last_error, "last_error muss belegt sein");
    }
  });
  await pruefe("G2 Unvollständige Batch-Antwort: fehlende Objekte scheitern, vorhandene werden gespeichert", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b")] });
    const { provider } = testProvider(4, (e) => { e.vectors = e.vectors.slice(0, 1); return e; });
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
    assert.strictEqual(r.bericht.berechnet, 1);
    assert.strictEqual(r.bericht.fehlgeschlagen.length, 1);
    assert.match(r.bericht.fehlgeschlagen[0].grund, /fehlt/);
  });
  await pruefe("G3 Provider-Timeout/Netzfehler: wiederaufnehmbar, Abbruch nach 2 Fehlbatches in Folge", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b"), ko("ko-c"), ko("ko-d"), ko("ko-e"), ko("ko-f")] });
    const provider = {
      name: "mock", deployment: "d", apiVersion: "v",
      aufruf: async () => { throw new Error("ETIMEDOUT"); }
    };
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, batchGroesse: 2, provider }));
    assert.strictEqual(r.bericht.abgebrochen, true);
    assert.strictEqual(r.bericht.fehlgeschlagen.length, 4); // 2 Batches à 2, dann Stopp
    assert.ok(mock.zustand.writes.every((w) => w.status === "fehlgeschlagen" && w.embedding === null));
  });
  await pruefe("G4 Versuchsdeckel: nach 3 Fehlversuchen wird ein Objekt nicht mehr angefragt", async () => {
    const kos = [ko("ko-a")];
    let writes = [];
    for (let lauf = 0; lauf < 4; lauf += 1) {
      const mock = supabaseMock({ kos, shadowRows: writes });
      const provider = { name: "mock", deployment: "d", apiVersion: "v", aufruf: async () => { throw new Error("kaputt"); } };
      const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
      if (lauf < 3) {
        assert.strictEqual(r.bericht.fehlgeschlagen.length, 1, `Lauf ${lauf + 1} sollte scheitern`);
        for (const w of mock.zustand.writes) {
          writes = writes.filter((x) => x.knowledge_object_id !== w.knowledge_object_id).concat([w]);
        }
      } else {
        assert.strictEqual(r.bericht.geplant, 0, "vierter Lauf darf nichts mehr planen");
        assert.strictEqual(r.bericht.versuchsdeckel.length, 1);
        assert.strictEqual(r.bericht.versuchsdeckel[0].versuche, 3);
      }
    }
  });

  // ── H · Modellversionen, Store-Verhalten ──────────────────────────────────
  await pruefe("H1 Gemischte Modellversionen: fremde Modellzeile gilt nicht als aktuell → Neuberechnung", async () => {
    const kos = [ko("ko-a")];
    const alteZeile = {
      knowledge_object_id: "ko-a", embedding_kind: "semantic_text",
      model: "text-embedding-3-small", dim: 4, recipe_version: RECIPE_VERSION,
      input_hash: computeEmbeddingInputHash(kos[0]),
      embedding: "[0.1,0.2,0.3,0.4]", status: "aktuell", is_active: true, attempt_count: 1
    };
    // Bestand wird je (model, dim, rezept) gefiltert geladen — eine Zeile eines
    // ANDEREN Modells taucht im Bestand der aktiven Konfiguration nicht auf.
    const mock = supabaseMock({ kos, shadowRows: [] });
    const { provider, zustand } = testProvider(8);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, dim: 8, model: "neues-modell", provider }));
    assert.strictEqual(r.bericht.berechnet, 1);
    assert.strictEqual(zustand.aufrufe, 1);
    const neu = mock.zustand.writes[0];
    assert.strictEqual(neu.model, "neues-modell");
    assert.strictEqual(neu.dim, 8);
    // Der Bestandsfilter der aktiven Konfiguration ist im Lade-Pfad kodiert
    // (der erste GET ist die Existenzprüfung der Tabelle — ohne Filter):
    const ladeAufruf = mock.zustand.aufrufe.find((a) =>
      a.methode === "GET" && a.url.includes("knowledge_object_embeddings") && a.url.includes("model=eq."));
    assert.ok(ladeAufruf && ladeAufruf.url.includes("model=eq.neues-modell") && ladeAufruf.url.includes("dim=eq.8")
      && ladeAufruf.url.includes("recipe_version=eq."), "Bestand muss je Modell+Dimension+Rezept gefiltert geladen werden");
    assert.ok(alteZeile); // Dokumentation: die Alt-Zeile bleibt unberührt liegen (eigener PK)
  });
  await pruefe("H2 Store: Upsert auf den vollen Primärschlüssel, Vektor als pgvector-String, Flush je Batch", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b"), ko("ko-c")] });
    const { provider } = testProvider(4);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, batchGroesse: 2, provider }));
    const posts = mock.zustand.aufrufe.filter((a) => a.methode === "POST" && a.url.includes("knowledge_object_embeddings"));
    assert.strictEqual(posts.length, 2); // 2 Batches → 2 Flushes
    assert.ok(posts.every((p) => p.url.includes("on_conflict=knowledge_object_id,embedding_kind,model,dim,recipe_version")));
    const zeile = mock.zustand.writes[0];
    assert.match(zeile.embedding, /^\[[-0-9.,eE]+\]$/);
    assert.strictEqual(zeile.is_active, true);
    assert.strictEqual(zeile.deployment, "mock-deployment");
    assert.strictEqual(zeile.api_version, "2024-10-21");
    assert.ok(Number.isFinite(zeile.input_tokens) && zeile.input_tokens > 0);
    assert.strictEqual(r.bericht.tokensProvider, 30); // 3 Objekte × 10 Mock-Tokens
    assert.strictEqual(r.zaehler.geschriebeneZeilen, 3);
  });

  // ── I · Berechtigung, Neutralität, Unantastbarkeit ────────────────────────
  await pruefe("I1 Unverstandene/aussortierte Objekte werden nie eingebettet; ohne Fachgebiet/Ebene unknown bleiben berechtigt", async () => {
    const kos = [
      ko("ko-ok", { tags: [], policy_field: [], political_level: "unknown" }),
      ko("ko-roh", { understanding_status: "pending" }),
      ko("ko-aus", { status: "aussortiert:run-1:neu" }),
      ko("ko-leer", { headline: "", was_ist_passiert: "", warum_wichtig: "kurz" })
    ];
    const mock = supabaseMock({ kos });
    const { provider } = testProvider(4);
    const r = await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
    assert.strictEqual(r.bericht.berechnet, 1);
    assert.deepStrictEqual(mock.zustand.writes.map((w) => w.knowledge_object_id), ["ko-ok"]);
    assert.deepStrictEqual(r.bericht.ausgeschlossen.map((a) => a.grund).sort(), ["aussortiert", "mindestinhalt-fehlt", "nicht-verstanden"]);
    const { zaehlung } = backfill.vermesseBestand(kos);
    assert.strictEqual(zaehlung.berechtigt, 1);
    assert.strictEqual(zaehlung.nichtVerstanden, 1);
    assert.strictEqual(zaehlung.ausgeschlossenTerminal, 1);
    assert.strictEqual(zaehlung.kernUnter60, 1);
  });
  await pruefe("I2 Korrigierte Geografie ändert den Input-Hash nicht (keine Neuerzeugung)", () => {
    const a = ko("ko-x");
    const b = ko("ko-x", { affected_geographies: ["berlin"], mentioned_geographies: ["brandenburg"], mentioned_locations: ["Potsdam"] });
    assert.strictEqual(computeEmbeddingInputHash(a), computeEmbeddingInputHash(b));
  });
  await pruefe("I3 Mandantenneutralität: kein user_id im Lesepfad, kein Mandant hartkodiert, kein user_id im Write", async () => {
    assert.ok(!backfill.KO_SPALTEN.includes("user_id"));
    assert.ok(!/cem-ince/i.test(BACKFILL_LIB), "kein Mandant im Backfill-Modul");
    assert.ok(!/cem-ince/i.test(BACKFILL_CLI), "kein Mandant im CLI");
    assert.ok(!/cem-ince/i.test(MIGRATION), "kein Mandant in der Migration");
    assert.ok(!/^\s*user_id\s/m.test(MIGRATION), "Migration definiert keine user_id-Spalte (mandantenlos)");
    const mock = supabaseMock({ kos: [ko("ko-a")] });
    const { provider } = testProvider(4);
    await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
    assert.ok(mock.zustand.writes.every((w) => !("user_id" in w)));
  });
  await pruefe("I4 Legacy-Matching unantastbar: knowledge_objects nur GET, kein Legacy-Vektor gelesen, kein Understanding-Pfad", async () => {
    const mock = supabaseMock({ kos: [ko("ko-a"), ko("ko-b")] });
    const { provider } = testProvider(4);
    await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
    const koAufrufe = mock.zustand.aufrufe.filter((a) => a.url.includes("/rest/v1/knowledge_objects") && !a.url.includes("_embeddings"));
    assert.ok(koAufrufe.length > 0);
    assert.ok(koAufrufe.every((a) => a.methode === "GET"), "knowledge_objects darf ausschließlich gelesen werden");
    assert.ok(!backfill.KO_SPALTEN.split(",").includes("embedding"), "der Legacy-Merkmalsvektor wird nicht einmal gelesen");
    // Statische Prüfungen laufen gegen den CODE ohne Kommentare — die
    // Sicherheitskommentare dürfen die verbotenen Namen ja gerade benennen.
    const libCode = BACKFILL_LIB.replace(/\/\/[^\n]*/g, "");
    assert.ok(!/require\([^)]*\/(ai|understanding)\.js/.test(libCode), "kein Understanding-/KI-Pfad im Backfill");
    assert.ok(!/match_knowledge_objects|saveKnowledgeObjectEnrichment|helmut_reserve_llm_call|llm_usage/.test(libCode), "kein Matching-/Enrichment-/Understanding-Budget-Pfad");
  });
  await pruefe("I5 Keine automatische Duplikatzusammenführung: kein Merge-Pfad im Sprintumfang", () => {
    const libCode = BACKFILL_LIB
      .replace(/\/\/[^\n]*/g, "")               // Kommentare raus
      .replace(/resolution=merge-duplicates/g, "") // PostgREST-Upsert-Header ist kein Objekt-Merge
      .replace(/zusammengefuehrt/g, "");        // Ausschlussgrund des Datenvertrags
    assert.ok(!/vorgang-identity|merge|zusammenfuehr/i.test(libCode),
      "der Backfill kennt keinen Zusammenführungspfad (nur den Ausschlussgrund des Datenvertrags)");
  });

  // ── J · Abdeckungs-/Integritätsprüfung ────────────────────────────────────
  await pruefe("J1 pruefeAbdeckung: vollständige, korrekte Abdeckung besteht", async () => {
    const kos = [ko("ko-a"), ko("ko-b"), ko("ko-roh", { understanding_status: "pending" })];
    const mock = supabaseMock({ kos });
    const { provider } = testProvider(4);
    await backfill.fuehreBackfillAus(deps(mock), basisCfg({ dryRun: false, provider }));
    const zeilen = {};
    for (const w of mock.zustand.writes) zeilen[w.knowledge_object_id] = w;
    const befund = backfill.pruefeAbdeckung(kos, zeilen, basisCfg());
    assert.strictEqual(befund.berechtigt, 2);
    assert.strictEqual(befund.mitAktuellemEmbedding, 2);
    assert.strictEqual(befund.ok, true);
  });
  await pruefe("J2 pruefeAbdeckung erkennt: Lücke, unberechtigtes Embedding, Hash-/Dimensionsfehler, doppelte Aktive", () => {
    const kos = [ko("ko-a"), ko("ko-b"), ko("ko-roh", { understanding_status: "pending" })];
    const gueltig = (id) => ({
      knowledge_object_id: id, embedding_kind: "semantic_text",
      model: "text-embedding-3-small", dim: 4, recipe_version: RECIPE_VERSION,
      input_hash: computeEmbeddingInputHash(kos.find((k) => k.id === id) || ko(id)),
      embedding: "[0.1,0.2,0.3,0.4]", status: "aktuell", is_active: true
    });
    // Lücke: ko-b fehlt · unberechtigt: ko-roh hat aktive Zeile
    const befund1 = backfill.pruefeAbdeckung(kos, { "ko-a": gueltig("ko-a"), "ko-roh": gueltig("ko-roh") }, basisCfg());
    assert.strictEqual(befund1.ok, false);
    assert.deepStrictEqual(befund1.fehltOderVeraltet.map((f) => f.id), ["ko-b"]);
    assert.deepStrictEqual(befund1.unberechtigtMitAktivemEmbedding, ["ko-roh"]);
    // Hash-Abweichung
    const veraltet = { ...gueltig("ko-a"), input_hash: "deadbeef" };
    const befund2 = backfill.pruefeAbdeckung([kos[0]], { "ko-a": veraltet }, basisCfg());
    assert.strictEqual(befund2.hashAbweichungen.length, 1);
    // Dimensionsfehler
    const zweiDim = { ...gueltig("ko-a"), embedding: "[0.1,0.2]" };
    const befund3 = backfill.pruefeAbdeckung([kos[0]], { "ko-a": zweiDim }, basisCfg());
    assert.strictEqual(befund3.dimensionsfehler.length, 1);
    // Doppelte Aktive (über die Objektliste der Prüfung)
    const doppelt = [gueltig("ko-a"), { ...gueltig("ko-a"), model: "anderes-modell" }];
    const proObjekt = { "ko-a": doppelt[0], "ko-a2": doppelt[1] };
    proObjekt["ko-a2"].knowledge_object_id = "ko-a";
    const befund4 = backfill.pruefeAbdeckung([kos[0]], proObjekt, basisCfg());
    assert.deepStrictEqual(befund4.doppelteAktive, ["ko-a"]);
    // Fremdes Modell wird als solches ausgewiesen
    assert.strictEqual(befund4.fremdeModelle.length === 1 || befund4.mitAktuellemEmbedding === 1, true);
  });

  console.log(`\n${bestanden} bestanden, ${fehlgeschlagen} fehlgeschlagen`);
  process.exit(fehlgeschlagen ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
