"use strict";

// Ein optionaler Modus des BESTEHENDEN Lage Crons und 500er Controllers.
// Keine Queueeinreihung, keine geaenderte Faelligkeit, kein zweiter Generator.
const D = require("./testkohorte-direkt500");
const F = require("./funktionstest-500");
const M = require("./mandatsklasse");
const { berlinTagKey } = require("./briefing-frische");
const { kostenBefund, PROJECT_URL } = require("../../scripts/github-fachzyklus-a");
const { crons } = require("../../vercel.json");
const CONFIRM = "TESTKOHORTE_500_FEHLENDE_TEXTE_EINMAL_BESTAETIGT";
const LOCK = "500-textnachlauf";
const PROCESS = "briefing-nachlauf-500";
const BUDGET_MS = 240000;
const RESERVE_MS = 90000;

function fordere(wert, grund) { D.fordere(wert, grund); }
function profilHash(s) {
  return D.hash({ mandate: s.mandate, identitaeten: s.identitaeten, users: s.auth.users });
}
function pruefeKosten(auth, counter, tag) {
  const k = kostenBefund(auth, counter, tag);
  fordere(k.unbekannteKosten === 0 && k.reservierungsluecke === 0
    && k.aufrufbelege === k.reservierungen, "nachlauf-kosten-unklar");
  fordere(k.prognoseUsd + k.reserveJeLueckeUsd < 9, "nachlauf-kostenstopp");
  return k;
}
function pruefeConfig(c, commit) {
  fordere(c && c.production === true && c.commit === commit && /^[a-f0-9]{40}$/.test(commit || "")
    && c.storageSupabase && c.v3Bereit && c.profileRelational && c.profileExclusive
    && c.retentionGueltig && c.retention === 36 && c.kommunikationGesperrt
    && c.kohortenQuellenGesperrt && c.tagesdeckel === 2416 && c.understandingReserve === 702
    && c.vorrangreserveReal >= 200 && c.atomicLock === true && c.narrativQueue === false
    && c.modell === "gpt-5-mini" && c.azure === true,
  "nachlauf-konfiguration-abweichend");
}
function getReader(env, fetchFn) {
  fordere(String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL
    && env.SUPABASE_SERVICE_ROLE_KEY, "nachlauf-speicherziel-abweichend");
  return async (path) => {
    const r = await fetchFn(PROJECT_URL + "/rest/v1/" + path, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(12000),
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" }
    });
    fordere(r.status === 200, "nachlauf-status-unlesbar");
    const b = await r.json();
    fordere(Array.isArray(b), "nachlauf-status-unlesbar");
    return b;
  };
}

async function leseTexte(get, ids, day) {
  const rows = [];
  // Kleine, explizit mandantengebundene URLs. Der historische Sammelleser
  // wuerde alle 500 Kennungen in JEDEN URL Filter aufnehmen und ignoriert
  // Nichtarray Antworten. Beides ist fuer diesen strengen Vorflug ungeeignet.
  for (let i = 0; i < ids.length; i += 50) {
    const teil = ids.slice(i, i + 50);
    const result = await get("briefings?select=*&slot=eq.lage&user_id=in.("
      + encodeURIComponent(teil.map(id => JSON.stringify(id)).join(","))
      + ")&id=like.*-lage-" + day + "&limit=51");
    fordere(Array.isArray(result) && result.length <= 50 && result.every(r => r
      && teil.includes(r.user_id) && r.id === `bf-${r.user_id}-lage-${day}`),
    "nachlauf-textbestand-unlesbar");
    rows.push(...result);
  }
  fordere(new Set(rows.map(r => r.id)).size === rows.length, "nachlauf-textbestand-unlesbar");
  return rows;
}

async function ausfuehren({ commit, runId, confirmation, config,
  env = process.env, fetchFn = global.fetch, deps = {} } = {}) {
  const now = deps.now || (() => new Date());
  const start = now();
  const tag = start.toISOString().slice(0, 10);
  const day = berlinTagKey(start);
  const end = start.getTime() + BUDGET_MS;
  const results = [];
  let storage, get, locked = false, begonnen = false, kostenVorher, grund = null;
  let grundlinie, vorher = [], ids = [], freigegebeneModelle = 0, kommunikationHash = null;
  const bericht = () => ({ ok: grund === null, schemaVersion: 1, runId,
    modus: "manuell-fehlende-texte", ziel: 500, begonnen,
    gespeichert: results.filter(r => r.gespeichert).length,
    freigegebeneModelle, results, grund, automatischeWiederholung: false,
    funktionsnachweis500: false, kostenVorher, atomarerUsdRiegel: false });
  try {
    fordere(confirmation === CONFIRM && /^nachlauf500-[0-9]{5,20}$/.test(runId || ""), "nachlauf-freigabe-fehlt");
    pruefeConfig(await config(), commit);
    fordere(new Date(end + 60000).toISOString().slice(0, 10) === tag
      && berlinTagKey(new Date(end + 60000)) === day, "nachlauf-tageswechsel");
    // Nur nach dem heutigen regulaeren 05:45 Slot. Kein vorgezogener Morgenlauf.
    fordere(start.getUTCHours() * 60 + start.getUTCMinutes() >= 350, "nachlauf-morgenslot-noch-nicht-faellig");
    const fenster = F.pruefeStartfenster({ startUtc: start.toISOString(), dauerMinuten: 6,
      crons, maxLaufzeitMs: 8 * 60000 });
    fordere(fenster.startErlaubt, "nachlauf-cronkonkurrenz");
    storage = deps.storage || require("./storage");
    const build = deps.build || require("./lage").buildLageBriefing;
    get = deps.get || getReader(env, fetchFn);
    const readStore = async (id) => {
      const rows = await get("helmut_store?select=data&id=eq." + id + "&limit=2");
      fordere(rows.length === 1 && rows[0].data, "nachlauf-speicher-unlesbar");
      return rows[0].data;
    };
    const snapshot = async () => {
      const [mandate, identitaeten, auth, main] = await Promise.all([
        get("mandate_profiles?select=*&order=user_id.asc&limit=505"),
        get("profiles?select=*&order=id.asc&limit=506"), readStore("main-auth"), readStore("main")
      ]);
      const s = { mandate, identitaeten, auth, main };
      const b = D.pruefeSnapshot(s, "aktivierung");
      fordere(b.gesamt === 504 && b.aktiv === 500 && b.aktive.length === 475,
        "nachlauf-bestand-abweichend");
      return s;
    };
    const guard = async (ownTenant = null) => {
      pruefeConfig(await config(), commit);
      fordere(now().toISOString().slice(0, 10) === tag && berlinTagKey(now()) === day, "nachlauf-tageswechsel");
      const iso = encodeURIComponent(now().toISOString());
      const [locks, leases, orphan, counters, auth, communication, outbox, runs] = await Promise.all([
        get("pipeline_locks?select=job_name&expires_at=gt." + iso + "&limit=1001"),
        get("helmut_jobs?select=id&lease_expires_at=gt." + iso + "&limit=1"),
        get("helmut_jobs?select=id&status=eq.laeuft&or=(lease_expires_at.is.null,lease_expires_at.lt." + iso + ")&limit=1"),
        get("llm_budget_counters?select=used&scope=eq.global&day=eq." + tag + "&limit=2"), readStore("main-auth"),
        get("helmut_store?select=id,pushEvents:data->pushEvents,auditEvents:data->auditEvents&order=id.asc&limit=1001"),
        get("helmut_job_outbox?select=id&confirmed_at=gte." + tag + "T00:00:00Z&limit=1"),
        get("process_runs?select=run_id&status=eq.running&started_at=gte."
          + encodeURIComponent(new Date(now().getTime() - 10 * 60000).toISOString()) + "&limit=1001")
      ]);
      fordere(locks.length < 1001 && locks.every(l =>
        (locked && l.job_name === LOCK) || (ownTenant && l.job_name === "lage-briefing-" + ownTenant))
        && leases.length === 0 && orphan.length === 0, "nachlauf-konkurrierende-verarbeitung");
      fordere(counters.length === 1, "nachlauf-tageszaehler-fehlt");
      fordere(runs.length < 1001 && runs.every(r => begonnen && r.run_id === runId), "nachlauf-konkurrierender-lauf");
      fordere(communication.length > 0 && communication.length < 1001
        && communication.every(r => (r.pushEvents == null || Array.isArray(r.pushEvents))
          && (r.auditEvents == null || Array.isArray(r.auditEvents))), "nachlauf-kommunikation-unlesbar");
      const tagesSpuren = communication.map(r => ({ id: r.id,
        pushEvents: (r.pushEvents || []).filter(e => e.createdAt?.slice(0, 10) === tag),
        auditEvents: (r.auditEvents || []).filter(e => e.createdAt?.slice(0, 10) === tag) }));
      const spur = D.hash(tagesSpuren);
      fordere(outbox.length === 0 && tagesSpuren.every(r => !r.pushEvents.length && !r.auditEvents.length)
        && (kommunikationHash === null || kommunikationHash === spur),
        "nachlauf-kommunikationsverletzung");
      kommunikationHash = spur;
      return pruefeKosten(auth, counters[0].used, tag);
    };
    kostenVorher = await guard();
    const s = await snapshot();
    grundlinie = profilHash(s);
    ids = M.sortiereRealZuerst(s.mandate.filter(m => m.aktiv), m => m.user_id).map(m => m.user_id);
    vorher = await leseTexte(get, ids, day);
    fordere(Array.isArray(vorher) && vorher.length <= 500
      && new Set(vorher.map(r => r.id)).size === vorher.length
      && vorher.every(r => ids.includes(r.user_id) && r.id === `bf-${r.user_id}-lage-${day}`),
    "nachlauf-textbestand-unlesbar");
    const vorhanden = new Set(vorher.map(r => r.user_id));
    const jobs = await get("helmut_jobs?select=tenant_id,status,due_at&job_type=eq.mandate_projection"
      + "&freshness_window=eq." + tag + "T00Z&limit=501");
    fordere(jobs.length === 500 && new Set(jobs.map(j => j.tenant_id)).size === 500
      && jobs.every(j => ids.includes(j.tenant_id)), "nachlauf-projektionsbeleg-unvollstaendig");
    const bereit = new Set(jobs.filter(j => j.status === "erledigt" && Date.parse(j.due_at) <= start.getTime()).map(j => j.tenant_id));
    locked = await storage.acquirePipelineLock(LOCK, 360000);
    fordere(locked === true, "nachlauf-bereits-aktiv");
    await guard();
    const alt = await get("process_runs?select=run_id&process=eq." + PROCESS + "&run_id=eq." + runId + "&limit=1");
    fordere(alt.length === 0, "nachlauf-kennung-bereits-verwendet");
    const q = await storage.schreibeWarteschlangenLaufquittung({ process: PROCESS, runId, mode: "manual",
      location: "vercel", status: "running", startedAt: start.toISOString(), finishedAt: null });
    fordere(q?.ok === true, "nachlauf-startquittung-fehlt");
    begonnen = true;
    const profileMap = new Map(s.identitaeten.map(p => [p.id, p]));
    const mandateMap = new Map(s.mandate.map(p => [p.user_id, p]));
    for (const id of ids) {
      if (vorhanden.has(id)) { results.push({ userId: id, grund: "vorhanden-geschuetzt" }); continue; }
      if (!bereit.has(id)) { results.push({ userId: id, grund: "projektion-noch-nicht-erledigt" }); continue; }
      if (now().getTime() + RESERVE_MS >= end) { results.push({ userId: id, grund: "zeitbudget" }); continue; }
      const p = storage.fromMandateProfileRow(profileMap.get(id), mandateMap.get(id));
      const r = await build(p, { politicianId: id, missingOnly: true,
        beforeGenerate: async (owner) => {
          fordere(owner === id && freigegebeneModelle < 500, "nachlauf-ziel-abweichend");
          await guard(id);
          const aktuell = await get("mandate_profiles?select=*&user_id=eq." + encodeURIComponent(id) + "&limit=2");
          fordere(aktuell.length === 1 && D.hash(aktuell[0]) === D.hash(mandateMap.get(id)),
            "nachlauf-zielprofil-veraendert");
          fordere(now().getTime() + RESERVE_MS < end, "nachlauf-zeitbudget");
          freigegebeneModelle++;
        } });
      if (r.available && r.fromCache === false && r.paragraphs?.length) {
        const saved = await storage.getRenderedBriefingV3(id, "lage", day, { strict: true });
        fordere(saved?.user_id === id && Date.parse(saved.generated_at) >= start.getTime()
          && saved.payload?.paragraphs?.length === r.paragraphs.length, "nachlauf-speicherung-nicht-bestaetigt");
        results.push({ userId: id, gespeichert: true, generatedAt: saved.generated_at });
      } else {
        const reason = r.reason || "unbekannt";
        results.push({ userId: id, grund: reason });
        fordere(["existing-result", "no-current-sources", "no-vorgaenge"].includes(reason), "nachlauf-textfehler-" + reason);
      }
    }
    await guard();
    const nach = await snapshot();
    fordere(profilHash(nach) === grundlinie, "nachlauf-profilbestand-veraendert");
    const texts = await leseTexte(get, ids, day);
    fordere(Array.isArray(texts) && vorher.every(r => {
      const row = texts.find(x => x.id === r.id);
      return row && D.hash(row) === D.hash(r);
    }), "nachlauf-bestandstext-veraendert");
  } catch (error) {
    grund = error instanceof D.DirektAbbruch ? error.grund : "nachlauf-netz-speicher-oder-antwortfehler";
  } finally {
    if (begonnen) {
      const q = await storage.schreibeWarteschlangenLaufquittung({ process: PROCESS, runId, mode: "manual",
        location: "vercel", status: grund ? "failed" : "success", startedAt: start.toISOString(),
        finishedAt: now().toISOString(), processed: results.filter(r => r.gespeichert).length,
        fehlgeschlagen: grund ? 1 : 0, zielmenge: 500,
        gespeichert: results.filter(r => r.gespeichert).length,
        reason: grund, commit }).catch(() => null);
      if (q?.ok !== true) grund = "nachlauf-endquittung-fehlt";
    }
    if (locked) await storage.releasePipelineLock(LOCK);
  }
  return bericht();
}

module.exports = { ausfuehren, pruefeKosten, pruefeConfig, leseTexte, CONFIRM, PROCESS, BUDGET_MS, RESERVE_MS };
