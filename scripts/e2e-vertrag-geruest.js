"use strict";

// Gemeinsames TECHNISCHES Testgeruest der Laender-E2E-Repository-Vertraege (26A/27A).
// =============================================================================================
// HIER LIEGT AUSSCHLIESSLICH TESTINFRASTRUKTUR, die in jedem Landesvertrag identisch ist:
//   1. das Zaehlwerk (check/abschnitt),
//   2. der deterministische Fixture-Ersatz fuer den LLM-Aufruf (fail loud bei 0 oder >1 Treffern),
//   3. der In-Memory-Store mit denselben Vertragsgrenzen wie Supabase/PostgREST
//      (Mandantenfilter user_id=eq., aktuell=is.true, Tenant-Guard bei Schreibzugriffen,
//      atomare publish-Semantik wie helmut_publish_matching_run — modelliert nach
//      scripts/matching-audit-test.js) samt Audit-Doppel auf den ECHTEN
//      matching-audit-Funktionen.
//
// HIER LIEGT BEWUSST KEINE LANDES- ODER FACHLOGIK: Profile, Gold-Records, Analyse-Fixtures
// und saemtliche Assertions bleiben in den Laendersuiten (berlin-e2e-vertrag-test.js,
// brandenburg-e2e-vertrag-test.js). Dieses Geruest ist reiner Testcode — es ist KEIN
// Produktionsmodul und KEIN generisches Laender-Framework (kein Import aus server.js,
// kein Export in lib/).
//
// Der Runner sammelt nur scripts/*-test.js ein — diese Datei endet absichtlich anders.

const matching = require("../lib/helmut/matching");
const matchingAudit = require("../lib/helmut/matching-audit");
const contract = require("../lib/helmut/matching-contract");

// ── Zaehlwerk ────────────────────────────────────────────────────────────────
// Jede Suite fuehrt ihr eigenes Zaehlwerk — kein geteilter Zustand zwischen Suiten.
function neuesZaehlwerk() {
  const stand = { passed: 0, failed: 0 };
  function check(name, cond, detail = "") {
    if (cond) { stand.passed += 1; console.log(`PASS  ${name}`); }
    else { stand.failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + String(detail).slice(0, 300) : ""}`); }
  }
  function abschnitt(titel) { console.log(`\n== ${titel} ==`); }
  return { check, abschnitt, stand };
}

// ── Deterministischer Fixture-Ersatz fuer den LLM-Aufruf ─────────────────────
// aiFixtures: [{ marker, result }]. Testdaten, KEIN Quellenbeleg — die Dokumente selbst
// stammen verbatim aus den Gold-Fixtures. Fail loud: ein Cluster ohne (oder mit
// mehrdeutiger) Fixture-Zuordnung waere ein stiller Teilerfolg — genau die Fehlerklasse,
// die die Vertraege ausschliessen.
function macheFixtureUnderstanding(aiFixtures) {
  let aiCalls = 0;
  function requestUnderstanding(prompt) {
    aiCalls += 1;
    const treffer = aiFixtures.filter((f) => String(prompt).includes(f.marker));
    if (treffer.length !== 1) {
      throw new Error(`kein eindeutiges AI-Fixture fuer Prompt (Treffer: ${treffer.length})`);
    }
    // Tiefe Kopie: die Pipeline darf die Fixture nicht mutieren koennen.
    return JSON.parse(JSON.stringify(treffer[0].result));
  }
  return { requestUnderstanding, anzahlAufrufe: () => aiCalls };
}

// ── In-Memory-Store (Vertragsgrenzen wie Supabase/PostgREST) ─────────────────
// opts:
//   getProfile(userId)      -> gemapptes Profil oder null (Landessuite liefert ihre Profile)
//   requestUnderstanding    -> deterministischer LLM-Ersatz (siehe oben)
//   relevanzGateEnabled()   -> echter M8-Flag-Leser der Landessuite
function neuerStore(opts) {
  if (!opts || typeof opts.getProfile !== "function" || typeof opts.requestUnderstanding !== "function"
    || typeof opts.relevanzGateEnabled !== "function") {
    throw new Error("neuerStore braucht getProfile, requestUnderstanding und relevanzGateEnabled");
  }
  const st = {
    knowledgeObjects: new Map(),      // id -> ko
    koLinks: new Map(),               // koId -> [raw_document rows]
    matchingResults: new Map(),       // id -> row (+aktuell)
    matchingRuns: new Map(),          // runId -> run
    decisions: new Map(),             // id -> row
    profileEmbeddings: new Map(),     // userId -> row
    locks: new Map(),                 // name -> bis (ms)
    zaehler: { publish: 0, saveMatching: 0, saveKo: 0 },
    publishFehler: null,
    fremdzugriffe: []                 // Protokoll unerwarteter/mandantenfremder Zugriffe
  };

  const tenantGuard = (rows, fn) => {
    const uids = new Set((rows || []).map((r) => r && r.user_id).filter(Boolean));
    if (uids.size > 1) {
      st.fremdzugriffe.push(fn);
      throw new Error(`[tenant-guard] ${fn}: CROSS_TENANT_WRITE (${[...uids].join(",")})`);
    }
  };

  st.api = {
    // --- Understanding-Deps -------------------------------------------------
    enabled: () => true,
    aiEnabled: () => true,
    acquireLock: () => ({ granted: true }),
    releaseLock: () => {},
    getExisting: (vorgangId) => [...st.knowledgeObjects.values()].find((k) => k.vorgang_id === vorgangId) || null,
    findVorgangCandidates: (prefixes, limit) => [...st.knowledgeObjects.values()]
      .filter((k) => (prefixes || []).some((p) => String(k.vorgang_id || "").startsWith(p)))
      .slice(0, limit || 8),
    listVorgangDocuments: (koId) => (st.koLinks.get(koId) || []).slice(),
    listPending: () => [...st.knowledgeObjects.values()].filter((k) => k.status === "pending"),
    savePending: (vorgangId, meta) => {
      const id = `ko-${vorgangId}`;
      if (st.knowledgeObjects.has(id)) return { saved: false, reason: "exists", id };
      st.knowledgeObjects.set(id, { id, vorgang_id: vorgangId, status: "pending", understanding_status: "pending", ...meta });
      return { saved: true, id };
    },
    canSpend: () => ({ allowed: true }),
    requestUnderstanding: opts.requestUnderstanding,
    save: (ko) => {
      st.zaehler.saveKo += 1;
      st.knowledgeObjects.set(ko.id, JSON.parse(JSON.stringify(ko)));
      return { saved: true };
    },
    saveSources: (koId, docs) => {
      const vorhandene = st.koLinks.get(koId) || [];
      const ids = new Set(vorhandene.map((d) => d.id));
      for (const d of docs || []) if (d && d.id && !ids.has(d.id)) { vorhandene.push(JSON.parse(JSON.stringify(d))); ids.add(d.id); }
      st.koLinks.set(koId, vorhandene);
      return { saved: true };
    },
    markFailed: (vorgangId, meta) => {
      const id = `ko-${vorgangId}`;
      const ko = st.knowledgeObjects.get(id) || { id, vorgang_id: vorgangId };
      st.knowledgeObjects.set(id, { ...ko, status: "pending", understanding_status: "failed", ...meta });
      return { saved: true };
    },
    modelName: () => "e2e-fixture-modell",
    logSkip: () => {},
    gateMode: () => "off",             // aktiver Production-Default (Gate nicht scharf)

    // --- Matching-Deps (aktiver Pfad: Audit AN wie in Production) -----------
    getProfile: (userId) => opts.getProfile(userId),
    listKnowledgeObjectsByIds: (ids) => (ids || []).map((id) => st.knowledgeObjects.get(id)).filter(Boolean),
    saveProfileEmbedding: (e) => { st.profileEmbeddings.set(e.user_id, e); return { saved: true }; },
    // Offline-Replik der SQL-RPC match_knowledge_objects (Semantik siehe supabase/schema.sql):
    // embedding not null AND status <> 'pending' AND understanding_status <> 'failed',
    // Ordnung nach Kosinus-Aehnlichkeit, limit match_count. Vektoren sind die ECHTEN
    // write-time-Merkmalsvektoren aus assembleKnowledgeObject.
    matchByEmbedding: ({ embedding, matchCount }) => {
      const rows = [...st.knowledgeObjects.values()]
        .filter((k) => Array.isArray(k.embedding) && k.embedding.length
          && k.status !== "pending" && k.understanding_status !== "failed")
        .map((k) => ({ id: k.id, vorgang_id: k.vorgang_id || null, similarity: matching.cosineSimilarity(embedding, k.embedding) }))
        .sort((a, b) => (b.similarity - a.similarity) || String(a.id).localeCompare(String(b.id)))
        .slice(0, Math.max(1, Number(matchCount) || 20));
      return { results: rows };
    },
    saveMatchingResults: (rows) => {
      tenantGuard(rows, "saveMatchingResults");
      st.zaehler.saveMatching += 1;
      for (const r of rows || []) st.matchingResults.set(r.id, { ...r, aktuell: true, created_at: new Date().toISOString() });
      return { saved: (rows || []).length };
    },
    // M8 (HELMUT_MATCHING_RELEVANZ_GATE): der ECHTE Flag-Leser gegen die echte Umgebung.
    relevanzGateEnabled: () => opts.relevanzGateEnabled(),
    auditEnabled: () => true,

    // --- Lage-/Decision-Lesepfad (PostgREST-Vertragsgrenzen) ----------------
    listKnowledgeObjects: (o = {}) => {
      const alle = [...st.knowledgeObjects.values()].map((k) => JSON.parse(JSON.stringify(k)));
      return alle.slice(0, Number(o.limit) > 0 ? Number(o.limit) : 500);
    },
    listMatchingResults: ({ userId, limit = 50, includeAbgeloest = false } = {}) => {
      if (!userId) throw new Error("[tenant-guard] listMatchingResults: kein Mandant");
      return [...st.matchingResults.values()]
        .filter((r) => r.user_id === userId && (includeAbgeloest || r.aktuell === true))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit);
    },
    getSourcesForVorgang: (vorgangId) => {
      const ko = [...st.knowledgeObjects.values()].find((k) => k.vorgang_id === vorgangId);
      return ko ? (st.koLinks.get(ko.id) || []).slice() : [];
    },
    saveDecisions: (rows) => {
      tenantGuard(rows, "saveDecisions");
      for (const r of rows || []) st.decisions.set(r.id, { ...r });
      return { saved: (rows || []).length };
    }
  };

  // Audit-Deps: ECHTES matching-audit.js, nur der Storage-Unterbau ist in-memory.
  // publish modelliert die dokumentierte Semantik von helmut_publish_matching_run
  // (eine Transaktion: Laufabschluss + Projektion + Abloesung; Riegel: Zeilen nur auf
  // vollstaendige Laeufe) — nach dem Vorbild von scripts/matching-audit-test.js.
  st.auditDeps = {
    enabled: () => true,
    acquireLock: (name, ttl) => {
      const bis = st.locks.get(name);
      if (bis && bis > Date.now()) return false;
      st.locks.set(name, Date.now() + ttl);
      return true;
    },
    releaseLock: (name) => { st.locks.delete(name); return true; },
    findCompletedRun: ({ userId, fingerprint }) => [...st.matchingRuns.values()]
      .find((r) => r.user_id === userId && r.eingabe_fingerabdruck === fingerprint && r.status === contract.RUN_STATUS.VOLLSTAENDIG) || null,
    insertRun: (row) => { st.matchingRuns.set(row.id, { ...row }); return { saved: true }; },
    patchRun: (id, patch, userId) => {
      const run = st.matchingRuns.get(id);
      if (!run || run.user_id !== userId) throw new Error(`patchRun: Lauf ${id} fuer ${userId} nicht gefunden`);
      st.matchingRuns.set(id, { ...run, ...patch });
      return { saved: true };
    },
    publishRun: ({ runId, userId, rows = [] }) => {
      st.zaehler.publish += 1;
      const snapRuns = new Map([...st.matchingRuns].map(([k, v]) => [k, { ...v }]));
      const snapResults = new Map([...st.matchingResults].map(([k, v]) => [k, { ...v }]));
      try {
        if (st.publishFehler === "vor") throw new Error("Abbruch VOR dem Schreiben (simuliert)");
        const lauf = st.matchingRuns.get(runId);
        if (!lauf || lauf.user_id !== userId) throw new Error(`publish: Lauf ${runId} fuer ${userId} nicht gefunden`);
        if (lauf.status !== contract.RUN_STATUS.LAUFEND) throw new Error(`publish: Lauf im Zustand ${lauf.status}`);
        for (const r of rows) {
          if (!r || r.user_id !== userId) throw new Error("[tenant-guard] CROSS_TENANT_WRITE");
          if (r.run_id !== runId) throw new Error("publish: Zeile verweist auf fremden Lauf");
        }
        const behalten = new Set(rows.map((r) => r.knowledge_object_id));
        let abgeloest = 0;
        for (const row of st.matchingResults.values()) {
          if (row.user_id === userId && row.aktuell !== false && !behalten.has(row.knowledge_object_id)) {
            row.aktuell = false; abgeloest += 1;
          }
        }
        st.matchingRuns.set(runId, { ...lauf, status: contract.RUN_STATUS.VOLLSTAENDIG, beendet_am: new Date().toISOString(), veroeffentlicht: rows.length, abgeloest });
        rows.forEach((r, i) => {
          if (st.publishFehler === "mitten" && i === Math.floor(rows.length / 2)) {
            throw new Error("Abbruch WAEHREND der Ergebnisschreibung (simuliert)");
          }
          const ziel = st.matchingRuns.get(r.run_id);
          if (!ziel || ziel.status !== contract.RUN_STATUS.VOLLSTAENDIG) {
            throw new Error("matching_results: Riegel run_complete verletzt");
          }
          st.matchingResults.set(r.id, { ...r, aktuell: true, created_at: new Date().toISOString() });
        });
        return { veroeffentlicht: rows.length, abgeloest };
      } catch (error) {
        // Transaktionssemantik: JEDER Fehler rollt vollstaendig zurueck.
        st.matchingRuns.clear(); for (const [k, v] of snapRuns) st.matchingRuns.set(k, v);
        st.matchingResults.clear(); for (const [k, v] of snapResults) st.matchingResults.set(k, v);
        throw error;
      }
    },
    now: () => new Date(),
    randomSuffix: () => "e2efest1"
  };

  // Der matching.js-Kern ruft audit.* OHNE Overrides auf — dieser Wrapper bindet die
  // ECHTEN matching-audit-Funktionen an die In-Memory-Deps.
  st.auditModul = {
    acquireRunLock: (tenantId) => matchingAudit.acquireRunLock(tenantId, st.auditDeps),
    releaseRunLock: (tenantId) => matchingAudit.releaseRunLock(tenantId, st.auditDeps),
    auditRun: (input) => matchingAudit.auditRun(input, st.auditDeps)
  };

  st.matchingOverrides = {
    enabled: () => true,
    getProfile: st.api.getProfile,
    listKnowledgeObjectsByIds: st.api.listKnowledgeObjectsByIds,
    saveProfileEmbedding: st.api.saveProfileEmbedding,
    matchByEmbedding: st.api.matchByEmbedding,
    saveMatchingResults: st.api.saveMatchingResults,
    auditEnabled: st.api.auditEnabled,
    relevanzGateEnabled: st.api.relevanzGateEnabled,
    audit: () => st.auditModul
  };

  return st;
}

module.exports = { neuesZaehlwerk, macheFixtureUnderstanding, neuerStore };
