"use strict";

// Sprint 22C1 — Production-Backfill für semantische Wissensobjekt-Embeddings.
// =============================================================================
// Dieses Modul verbindet die Offline-Shadow-Pipeline (embedding-shadow-pipeline.js)
// mit der Production-Shadow-Tabelle knowledge_object_embeddings (Migration
// 20260728_embedding_shadow.sql). Es ist der EINZIGE Schreibpfad in diese
// Tabelle. Alle Netz-/DB-Zugriffe laufen über injizierbare Abhängigkeiten
// (deps.fetchImpl), damit jede Regel offline testbar ist.
//
// SICHERHEITSMODELL (verbindlich, docs/embedding-architektur.md §9/§14):
//  * SCHREIBT NIE in knowledge_objects, profile_embeddings, matching_results
//    oder irgendeine andere bestehende Tabelle — ausschließlich in die additive
//    Shadow-Tabelle. Die Legacy-Spalte knowledge_objects.embedding wird weder
//    gelesen noch geschrieben.
//  * KEIN Understanding-Pfad: dieses Modul importiert weder ai.js noch
//    understanding.js — ein Embedding-Fehler kann strukturell keine neue
//    Understanding-Analyse auslösen und keine Understanding-Budgets verbrauchen.
//  * HARTE GRENZEN sind fail-closed und NICHT überschreibbar: höchstens
//    1 000 Objekte, 200 000 Tokens, 0,05 USD, Batchgröße 50, Parallelität 1.
//    Das Kostenlimit wird zusätzlich in ein Tokenlimit übersetzt und über den
//    fail-closed Token-Mechanismus der Pipeline erzwungen.
//  * EIGENES LOCK 'semantic_embedding_backfill' (pipeline_locks-Familie,
//    atomare RPCs aus 20260719 + Renew aus 20260728) — nie der Crawl-,
//    Understanding- oder Matching-Lock. Erwerb fail-closed; Erneuerung nach
//    jedem Batch; schlägt die Erneuerung fehl, bricht der Lauf ab.
//  * MANDANTENNEUTRAL: kein user_id im Eingang, keine Mandantenfilter, kein
//    Mandant hartkodiert (testgesichert).
//  * Budgettrennung: Embedding-Verbrauch wird NICHT über das Understanding-
//    Tagesbudget (helmut_reserve_llm_call / llm_usage) gezählt. Die
//    Tokenwahrheit liegt je Objekt in der Shadow-Tabelle (input_tokens) und je
//    Lauf im maschinenlesbaren Protokoll (Schätzung + providergemeldete
//    Ist-Tokens). Ein eigener regulärer Embedding-Tagesdeckel ist damit später
//    aus der Tabelle ableitbar, ohne ein zweites Budgetsystem zu erfinden.

const {
  RECIPE_VERSION,
  buildCanonicalEmbeddingInput,
  isEligibleForEmbedding,
  computeEmbeddingInputHash,
  validateVector,
  isEmbeddingCurrent
} = require("./embedding-contract.js");
const { runShadowPipeline, schaetzeTokens, kostenSchaetzung } = require("./embedding-shadow-pipeline.js");

// Harte Sicherheitsobergrenzen des einmaligen Backfills (Sprintauftrag 22C1,
// Phase 5). Das sind OBERGRENZEN, keine Zielwerte — ein Aufruf mit höheren
// Werten wird abgelehnt statt gekappt (fail-closed, kein stilles Verkleinern).
const HARTE_GRENZEN = Object.freeze({
  maxObjekte: 1000,
  maxTokens: 200000,
  maxKostenUsd: 0.05,
  batchGroesse: 50,
  parallelitaet: 1
});

const LOCK_NAME = "semantic_embedding_backfill";
const LOCK_TTL_MS_DEFAULT = 10 * 60 * 1000;
const AZURE_API_VERSION = "2024-10-21";

// Spalten, die der Backfill aus knowledge_objects liest: ausschließlich der
// kanonische Eingang (ko-kanon-1) + die Berechtigungsfelder. BEWUSST NICHT
// dabei: embedding (Legacy-Merkmalsvektor), user-/Mandats-/Matchingdaten.
const KO_SPALTEN = [
  "id", "understanding_status", "status",
  "headline", "was_ist_passiert", "warum_wichtig",
  "event_type", "decision_entities", "related_entities"
].join(",");

function formatVector(arr) {
  return `[${(Array.isArray(arr) ? arr : []).map((n) => Number(n)).join(",")}]`;
}

// --- Harte Grenzen (fail-closed) --------------------------------------------

function pruefeHarteGrenzen(cfg = {}) {
  const fehler = [];
  const zahl = (v) => Number(v);
  if (!Number.isFinite(zahl(cfg.maxObjekte)) || zahl(cfg.maxObjekte) < 1) {
    fehler.push(`maxObjekte fehlt oder ist ungültig (${cfg.maxObjekte})`);
  } else if (zahl(cfg.maxObjekte) > HARTE_GRENZEN.maxObjekte) {
    fehler.push(`maxObjekte ${cfg.maxObjekte} überschreitet die harte Grenze ${HARTE_GRENZEN.maxObjekte}`);
  }
  if (!Number.isFinite(zahl(cfg.maxTokens)) || zahl(cfg.maxTokens) < 1) {
    fehler.push(`maxTokens fehlt oder ist ungültig (${cfg.maxTokens})`);
  } else if (zahl(cfg.maxTokens) > HARTE_GRENZEN.maxTokens) {
    fehler.push(`maxTokens ${cfg.maxTokens} überschreitet die harte Grenze ${HARTE_GRENZEN.maxTokens}`);
  }
  if (!Number.isFinite(zahl(cfg.maxKostenUsd)) || zahl(cfg.maxKostenUsd) <= 0) {
    fehler.push(`maxKostenUsd fehlt oder ist ungültig (${cfg.maxKostenUsd})`);
  } else if (zahl(cfg.maxKostenUsd) > HARTE_GRENZEN.maxKostenUsd) {
    fehler.push(`maxKostenUsd ${cfg.maxKostenUsd} überschreitet die harte Grenze ${HARTE_GRENZEN.maxKostenUsd}`);
  }
  if (!Number.isFinite(zahl(cfg.batchGroesse)) || zahl(cfg.batchGroesse) < 1) {
    fehler.push(`batchGroesse fehlt oder ist ungültig (${cfg.batchGroesse})`);
  } else if (zahl(cfg.batchGroesse) > HARTE_GRENZEN.batchGroesse) {
    fehler.push(`batchGroesse ${cfg.batchGroesse} überschreitet die harte Grenze ${HARTE_GRENZEN.batchGroesse}`);
  }
  if (zahl(cfg.parallelitaet) !== HARTE_GRENZEN.parallelitaet) {
    fehler.push(`parallelitaet muss genau ${HARTE_GRENZEN.parallelitaet} sein (${cfg.parallelitaet})`);
  }
  if (!Number.isFinite(zahl(cfg.preisProMTok)) || zahl(cfg.preisProMTok) <= 0) {
    fehler.push(`preisProMTok fehlt oder ist ungültig (${cfg.preisProMTok}) — ohne Preis ist das Kostenlimit nicht erzwingbar`);
  }
  return { ok: fehler.length === 0, fehler };
}

// Kostenlimit → Tokenlimit (fail-closed über den Token-Mechanismus der
// Pipeline). Es gilt immer das STRENGERE der beiden Limits.
function effektivesTokenLimit(cfg) {
  const ausKosten = Math.floor((Number(cfg.maxKostenUsd) / Number(cfg.preisProMTok)) * 1e6);
  return Math.min(Number(cfg.maxTokens), ausKosten);
}

// --- Supabase-REST (injizierbar) --------------------------------------------

function restDeps(deps = {}) {
  const env = deps.env || process.env;
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY || "";
  const fetchImpl = deps.fetchImpl || fetch;
  if (!url || !key) throw new Error("SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY sind Pflicht (process.env, CLAUDE.md §4.9)");
  return { url, key, fetchImpl };
}

async function restRequest(deps, pfad, optionen = {}) {
  const { url, key, fetchImpl } = restDeps(deps);
  const res = await fetchImpl(`${url}${pfad}`, {
    ...optionen,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(optionen.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${optionen.method || "GET"} ${pfad.split("?")[0]}: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Wissensobjekte seitenweise lesen (nur Eingangs-/Berechtigungsfelder).
async function ladeWissensobjekte(deps, { seitengroesse = 500, ids = null } = {}) {
  const objekte = [];
  let offset = 0;
  const idFilter = Array.isArray(ids) && ids.length
    ? `&id=in.(${ids.map((i) => `"${String(i).replace(/"/g, "")}"`).join(",")})`
    : "";
  for (;;) {
    const seite = await restRequest(deps,
      `/rest/v1/knowledge_objects?select=${KO_SPALTEN}${idFilter}&order=id.asc&limit=${seitengroesse}&offset=${offset}`);
    if (!Array.isArray(seite)) throw new Error("knowledge_objects: unerwartete Antwort (kein Array)");
    objekte.push(...seite);
    if (seite.length < seitengroesse) break;
    offset += seitengroesse;
  }
  return objekte;
}

// Bestehende Shadow-Zeilen der aktiven Konfiguration lesen (für Idempotenz/
// Wiederaufnahme). Liefert eine Map knowledge_object_id → Zeile.
async function ladeShadowBestand(deps, cfg, { seitengroesse = 500 } = {}) {
  const filter = `embedding_kind=eq.semantic_text&model=eq.${encodeURIComponent(cfg.model)}`
    + `&dim=eq.${Number(cfg.dim)}&recipe_version=eq.${encodeURIComponent(cfg.recipeVersion || RECIPE_VERSION)}`;
  const zeilen = [];
  let offset = 0;
  for (;;) {
    const seite = await restRequest(deps,
      `/rest/v1/knowledge_object_embeddings?select=*&${filter}&order=knowledge_object_id.asc&limit=${seitengroesse}&offset=${offset}`);
    if (!Array.isArray(seite)) throw new Error("knowledge_object_embeddings: unerwartete Antwort (kein Array)");
    zeilen.push(...seite);
    if (seite.length < seitengroesse) break;
    offset += seitengroesse;
  }
  const proObjekt = {};
  for (const z of zeilen) proObjekt[z.knowledge_object_id] = z;
  return proObjekt;
}

// Existiert die Shadow-Tabelle? (Vor jedem echten Lauf geprüft — eine fehlende
// Migration soll eine klare Meldung erzeugen, keinen kryptischen REST-Fehler.)
async function shadowTabelleVorhanden(deps) {
  try {
    await restRequest(deps, "/rest/v1/knowledge_object_embeddings?select=knowledge_object_id&limit=1");
    return true;
  } catch (fehler) {
    if (/HTTP 404|does not exist|42P01/.test(String(fehler.message))) return false;
    throw fehler;
  }
}

// --- Store-Adapter: Shadow-Tabelle als Pipeline-Ablage ----------------------
// Implementiert die Store-Schnittstelle der Pipeline (eintraege/upsert/
// speichern). upsert puffert; speichern() schreibt den Puffer als EINEN
// PostgREST-Upsert (on_conflict = Primärschlüssel) — nach jedem Batch, damit
// ein Abbruch höchstens einen Batch verliert.
function createSupabaseShadowStore(deps, cfg, bestand = {}) {
  const eintraege = {};
  for (const [id, zeile] of Object.entries(bestand)) {
    // DB-Zeile → Pipeline-Eintrag: die Pipeline liest vector/embedding über
    // isEmbeddingCurrent (beide Feldnamen), Status/Versuche direkt.
    eintraege[id] = { ...zeile, vector: zeile.embedding != null ? zeile.embedding : null };
  }
  let puffer = {};
  const zaehler = { upserts: 0, flushes: 0, geschriebeneZeilen: 0 };
  return {
    pfad: "knowledge_object_embeddings",
    zaehler,
    get meta() { return null; },
    get eintraege() { return eintraege; },
    setMeta() { /* Metadaten stehen je Zeile im Datenvertrag */ },
    upsert(id, eintrag) {
      eintraege[id] = eintrag;
      puffer[id] = eintrag;
      zaehler.upserts += 1;
    },
    async speichern() {
      const ids = Object.keys(puffer);
      if (!ids.length) return;
      const zeilen = ids.map((id) => {
        const e = puffer[id];
        return {
          knowledge_object_id: id,
          embedding_kind: e.embedding_kind || "semantic_text",
          model: e.model,
          model_version: e.model_version || null,
          provider: e.provider,
          deployment: e.deployment || null,
          api_version: e.api_version || null,
          dim: e.dim,
          recipe_version: e.recipe_version,
          input_hash: e.input_hash,
          input_tokens: e.input_tokens != null ? e.input_tokens : null,
          embedding: Array.isArray(e.vector) ? formatVector(e.vector) : null,
          is_active: e.is_active !== false,
          status: e.status,
          last_error: e.last_error || null,
          attempt_count: e.attempt_count || 0,
          last_attempt_at: e.last_attempt_at || null,
          created_at: e.created_at || null,
          updated_at: e.updated_at || null
        };
      });
      await restRequest(deps,
        "/rest/v1/knowledge_object_embeddings?on_conflict=knowledge_object_id,embedding_kind,model,dim,recipe_version",
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(zeilen)
        });
      zaehler.flushes += 1;
      zaehler.geschriebeneZeilen += zeilen.length;
      puffer = {};
    }
  };
}

// --- Eigenes Lock (pipeline_locks-Familie, RPCs 20260719 + 20260728) --------

async function erwerbeLock(deps, { ttlMs = LOCK_TTL_MS_DEFAULT } = {}) {
  try {
    const rows = await restRequest(deps, "/rest/v1/rpc/helmut_acquire_pipeline_lock", {
      method: "POST",
      body: JSON.stringify({ p_job: LOCK_NAME, p_ttl_ms: Math.max(1, Math.floor(ttlMs)) })
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.acquired && row.token) return { acquired: true, token: row.token };
    return { acquired: false, token: null, grund: "lock-belegt" };
  } catch (fehler) {
    // FAIL-CLOSED: bei Lock-Fehler wird NICHT gelaufen.
    return { acquired: false, token: null, grund: `lock-fehler: ${fehler.message}` };
  }
}

async function erneuereLock(deps, token, { ttlMs = LOCK_TTL_MS_DEFAULT } = {}) {
  try {
    const ergebnis = await restRequest(deps, "/rest/v1/rpc/helmut_renew_pipeline_lock", {
      method: "POST",
      body: JSON.stringify({ p_job: LOCK_NAME, p_token: token, p_ttl_ms: Math.max(1, Math.floor(ttlMs)) })
    });
    return ergebnis === true;
  } catch {
    return false; // fail-closed: nicht erneuerbar → Lauf bricht ab
  }
}

async function gebeLockFrei(deps, token) {
  if (!token) return;
  try {
    await restRequest(deps, "/rest/v1/rpc/helmut_release_pipeline_lock", {
      method: "POST",
      body: JSON.stringify({ p_job: LOCK_NAME, p_token: token })
    });
  } catch { /* TTL räumt auf */ }
}

// Fremde Sperren (Crawl/Understanding/…): der Backfill startet nicht, solange
// IRGENDEINE andere aktive Sperre existiert (Runbook-Schritt 2).
async function ladeAktiveFremdsperren(deps) {
  const rows = await restRequest(deps,
    `/rest/v1/pipeline_locks?select=job_name,expires_at&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`);
  return (Array.isArray(rows) ? rows : []).filter((r) => r.job_name !== LOCK_NAME);
}

// --- Azure-Provider (Weg A, bestehender Helmut-Provider) --------------------
// Liefert zusätzlich die vom Provider gemeldeten Ist-Tokens (usage) zurück.
function azureEmbeddingProvider(env = process.env, fetchImpl = fetch) {
  const endpoint = env.AZURE_OPENAI_ENDPOINT;
  const key = env.AZURE_OPENAI_KEY || env.AZURE_OPENAI_API_KEY;
  const deployment = env.HELMUT_EMBEDDING_DEPLOYMENT;
  if (!endpoint || !key || !deployment) return null;
  const url = `${String(endpoint).replace(/\/$/, "")}/openai/deployments/${deployment}/embeddings?api-version=${AZURE_API_VERSION}`;
  return {
    name: "azure-openai",
    deployment,
    apiVersion: AZURE_API_VERSION,
    aufruf: async ({ dim, inputs }) => {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": key },
        body: JSON.stringify({ input: inputs, dimensions: dim })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = await res.json();
      const vectors = (json.data || []).slice().sort((a, b) => a.index - b.index).map((d) => d.embedding);
      return { vectors, usage: json.usage || null };
    }
  };
}

// --- Bestandsaufnahme (read-only, JS-exakte Berechtigung) -------------------

function vermesseBestand(objekte, shadowBestand = null) {
  const zaehlung = {
    alle: objekte.length,
    verstanden: 0,
    berechtigt: 0,
    nichtVerstanden: 0,
    ausgeschlossenTerminal: 0,
    zusammengefuehrt: 0,
    inhaltsleer: 0,
    kernUnter60: 0,
    ausschlussGruende: {}
  };
  const berechtigteIds = [];
  let tokens = 0;
  for (const ko of objekte) {
    if (ko.understanding_status === "complete") zaehlung.verstanden += 1;
    const elig = isEligibleForEmbedding(ko);
    if (elig.eligible) {
      zaehlung.berechtigt += 1;
      berechtigteIds.push(ko.id);
      tokens += schaetzeTokens(buildCanonicalEmbeddingInput(ko).text);
      continue;
    }
    zaehlung.ausschlussGruende[elig.reason] = (zaehlung.ausschlussGruende[elig.reason] || 0) + 1;
    if (elig.reason === "nicht-verstanden") zaehlung.nichtVerstanden += 1;
    else if (elig.reason === "aussortiert") zaehlung.ausgeschlossenTerminal += 1;
    else if (elig.reason === "zusammengefuehrt") zaehlung.zusammengefuehrt += 1;
    else if (elig.reason === "mindestinhalt-fehlt") zaehlung.kernUnter60 += 1;
  }
  zaehlung.tokensGeschaetzt = tokens;
  if (shadowBestand) {
    zaehlung.shadowZeilen = Object.keys(shadowBestand).length;
  }
  return { zaehlung, berechtigteIds };
}

// --- Abdeckungs-/Integritätsprüfung (read-only, Abnahmekriterien) -----------

function pruefeAbdeckung(objekte, shadowZeilen, cfg) {
  const erwartet = {
    model: cfg.model,
    dim: Number(cfg.dim),
    recipeVersion: cfg.recipeVersion || RECIPE_VERSION
  };
  const befund = {
    berechtigt: 0,
    mitAktuellemEmbedding: 0,
    fehltOderVeraltet: [],
    unberechtigtMitAktivemEmbedding: [],
    dimensionsfehler: [],
    wertfehler: [],
    hashAbweichungen: [],
    fremdeModelle: [],
    fehlgeschlageneZeilen: [],
    doppelteAktive: [],
    ok: false
  };
  const zeilenProObjekt = {};
  for (const z of Object.values(shadowZeilen)) {
    const liste = zeilenProObjekt[z.knowledge_object_id] || (zeilenProObjekt[z.knowledge_object_id] = []);
    liste.push(z);
  }
  const berechtigteIds = new Set();
  for (const ko of objekte) {
    const elig = isEligibleForEmbedding(ko);
    if (!elig.eligible) continue;
    berechtigteIds.add(ko.id);
    befund.berechtigt += 1;
    const zeilen = (zeilenProObjekt[ko.id] || []).filter((z) => z.is_active !== false);
    if (zeilen.length > 1) befund.doppelteAktive.push(ko.id);
    const zeile = zeilen[0];
    if (!zeile) { befund.fehltOderVeraltet.push({ id: ko.id, grund: "kein-eintrag" }); continue; }
    if (zeile.model !== erwartet.model || Number(zeile.dim) !== erwartet.dim
      || zeile.recipe_version !== erwartet.recipeVersion) {
      befund.fremdeModelle.push({ id: ko.id, model: zeile.model, dim: zeile.dim, recipe: zeile.recipe_version });
      continue;
    }
    if (zeile.status === "fehlgeschlagen") {
      befund.fehlgeschlageneZeilen.push({ id: ko.id, fehler: zeile.last_error, versuche: zeile.attempt_count });
      continue;
    }
    const inputHash = computeEmbeddingInputHash(ko);
    const pruefung = validateVector(zeile.embedding, erwartet.dim);
    if (!pruefung.ok) {
      (pruefung.reason === "falsche-dimension" ? befund.dimensionsfehler : befund.wertfehler)
        .push({ id: ko.id, grund: pruefung.reason });
      continue;
    }
    if (zeile.input_hash !== inputHash) {
      befund.hashAbweichungen.push({ id: ko.id });
      continue;
    }
    const cur = isEmbeddingCurrent({ ...zeile, vector: zeile.embedding }, { ...erwartet, inputHash });
    if (!cur.current) { befund.fehltOderVeraltet.push({ id: ko.id, grund: cur.reason }); continue; }
    befund.mitAktuellemEmbedding += 1;
  }
  for (const [koId, zeilen] of Object.entries(zeilenProObjekt)) {
    if (!berechtigteIds.has(koId) && zeilen.some((z) => z.is_active !== false && z.status === "aktuell")) {
      befund.unberechtigtMitAktivemEmbedding.push(koId);
    }
  }
  befund.ok = befund.mitAktuellemEmbedding === befund.berechtigt
    && !befund.fehltOderVeraltet.length && !befund.unberechtigtMitAktivemEmbedding.length
    && !befund.dimensionsfehler.length && !befund.wertfehler.length
    && !befund.hashAbweichungen.length && !befund.fremdeModelle.length
    && !befund.fehlgeschlageneZeilen.length && !befund.doppelteAktive.length;
  return befund;
}

// --- Hauptlauf ---------------------------------------------------------------
// deps: { env?, fetchImpl?, jetzt?, log? } — alles injizierbar für Tests.
// cfg:  { model, dim, recipeVersion?, batchGroesse, maxObjekte, maxTokens,
//         maxKostenUsd, preisProMTok, parallelitaet, dryRun, ids?, ttlMs?,
//         provider? (Test-Injektion; im echten Betrieb azureEmbeddingProvider) }
async function fuehreBackfillAus(deps = {}, cfg = {}) {
  const log = deps.log || (() => {});
  const grenzen = pruefeHarteGrenzen(cfg);
  if (!grenzen.ok) {
    return { ok: false, phase: "grenzen", fehler: grenzen.fehler, bericht: null };
  }
  const tokenLimit = effektivesTokenLimit(cfg);

  // 1) Bestand lesen (read-only). Der Dry-Run darf auch VOR der Migration
  // laufen (leere Shadow-Ablage, klar ausgewiesen) — der echte Lauf nicht.
  const objekte = await ladeWissensobjekte(deps, { ids: cfg.ids || null });
  const tabelleDa = await shadowTabelleVorhanden(deps);
  if (!tabelleDa && !cfg.dryRun) {
    return {
      ok: false, phase: "schema",
      fehler: ["Shadow-Tabelle knowledge_object_embeddings existiert nicht — Migration 20260728_embedding_shadow.sql ist nicht angewendet"],
      bericht: null
    };
  }
  const bestand = tabelleDa ? await ladeShadowBestand(deps, cfg) : {};

  const pipelineCfg = {
    model: cfg.model,
    dim: cfg.dim,
    recipeVersion: cfg.recipeVersion || RECIPE_VERSION,
    batchGroesse: cfg.batchGroesse,
    maxObjekte: cfg.maxObjekte,
    maxTokens: tokenLimit,
    preisProMTok: cfg.preisProMTok,
    maxVersuche: cfg.maxVersuche,
    jetzt: deps.jetzt,
    dryRun: !!cfg.dryRun
  };

  // 2) Dry-Run: nur planen und berichten — kein Lock, kein Provider, kein Write.
  if (cfg.dryRun) {
    const store = createSupabaseShadowStore(deps, cfg, bestand);
    const bericht = await runShadowPipeline(objekte, store, null, { ...pipelineCfg, providerName: "dry-run" });
    return { ok: true, phase: "dry-run", bericht, tokenLimit, zaehler: store.zaehler, shadowTabelleVorhanden: tabelleDa };
  }

  // 3) Echter Lauf: fremde Sperren prüfen, eigenes Lock erwerben (fail-closed).
  const fremdsperren = await ladeAktiveFremdsperren(deps);
  if (fremdsperren.length) {
    return {
      ok: false, phase: "fremdsperren",
      fehler: fremdsperren.map((s) => `aktive Sperre ${s.job_name} bis ${s.expires_at}`),
      bericht: null
    };
  }
  const ttlMs = cfg.ttlMs || LOCK_TTL_MS_DEFAULT;
  const lock = await erwerbeLock(deps, { ttlMs });
  if (!lock.acquired) {
    return { ok: false, phase: "lock", fehler: [lock.grund || "lock-belegt"], bericht: null };
  }

  const provider = cfg.provider || azureEmbeddingProvider(deps.env || process.env, deps.fetchImpl || fetch);
  if (!provider || typeof provider.aufruf !== "function") {
    await gebeLockFrei(deps, lock.token);
    return {
      ok: false, phase: "provider",
      fehler: ["kein Embedding-Provider: AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY + HELMUT_EMBEDDING_DEPLOYMENT in process.env setzen (Environment-Einstellungen, nie Chat/Commit)"],
      bericht: null
    };
  }

  const store = createSupabaseShadowStore(deps, cfg, bestand);
  let bericht;
  try {
    bericht = await runShadowPipeline(objekte, store, provider.aufruf, {
      ...pipelineCfg,
      providerName: provider.name,
      deployment: provider.deployment || null,
      apiVersion: provider.apiVersion || null,
      modelVersion: cfg.modelVersion || null,
      // Nach jedem Batch: Fortschritt melden + eigenes Lock erneuern.
      // Fail-closed: ohne erneuerbares Lock wird NICHT weitergeschrieben.
      nachBatch: async ({ batch, batches, bericht: zwischenstand }) => {
        log(`Batch ${batch}/${batches}: berechnet ${zwischenstand.berechnet}, fehlgeschlagen ${zwischenstand.fehlgeschlagen.length}, Tokens ${zwischenstand.tokens}`);
        const erneuert = await erneuereLock(deps, lock.token, { ttlMs });
        if (!erneuert) return { abbrechen: true, grund: "lock-erneuerung-fehlgeschlagen" };
        return null;
      }
    });
  } finally {
    await gebeLockFrei(deps, lock.token);
  }
  return {
    ok: !bericht.abgebrochen && bericht.fehlgeschlagen.length === 0,
    phase: "gelaufen",
    bericht,
    tokenLimit,
    zaehler: store.zaehler
  };
}

module.exports = {
  HARTE_GRENZEN,
  LOCK_NAME,
  LOCK_TTL_MS_DEFAULT,
  AZURE_API_VERSION,
  KO_SPALTEN,
  formatVector,
  pruefeHarteGrenzen,
  effektivesTokenLimit,
  ladeWissensobjekte,
  ladeShadowBestand,
  shadowTabelleVorhanden,
  createSupabaseShadowStore,
  erwerbeLock,
  erneuereLock,
  gebeLockFrei,
  ladeAktiveFremdsperren,
  azureEmbeddingProvider,
  vermesseBestand,
  pruefeAbdeckung,
  fuehreBackfillAus,
  kostenSchaetzung
};
