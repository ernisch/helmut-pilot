"use strict";

// Ein optionaler Modus des BESTEHENDEN Lage Crons und 500er Controllers.
// Keine Queueeinreihung, keine geaenderte Faelligkeit, kein zweiter Generator.
const D = require("./testkohorte-direkt500");
const F = require("./funktionstest-500");
const Q = require("./lage-quellenbeleg");
const { berlinTagKey } = require("./briefing-frische");
const { kostenBefund, PROJECT_URL } = require("../../scripts/github-fachzyklus-a");
const { crons } = require("../../vercel.json");
const CONFIRM = "TESTKOHORTE_500_FEHLENDE_TEXTE_EINMAL_BESTAETIGT";
const LOCK = "500-textnachlauf";
const PROCESS = "briefing-nachlauf-500";
const BUDGET_MS = 240000;
const RESERVE_MS = 90000;
const istQualitaetsfehler = grund => /^(?:nachlauf-textfehler-)?ai-text-(?:paragraph-count|empty-or-type|source-reference|profile-reference|visible-id|word-limit|quality-incomplete|source-support|evidence-quote|repetition)$/.test(grund || "");
const BUILD_LEERGRUENDE = new Set(["existing-result", "no-current-sources", "no-vorgaenge"]);
const BUILD_ABBRUCHGRUENDE = new Map([
  ["store-error", "nachlauf-speicherfehler"],
  ["generating", "nachlauf-mandat-bereits-aktiv"],
  ["budget", "nachlauf-kostenstopp"],
  ["no-profile", "nachlauf-konfiguration-abweichend"],
  ["v3-disabled", "nachlauf-konfiguration-abweichend"]
]);
// Ausschliesslich feste, nicht geheime Ablaufklassen. Dieser Vertrag darf von
// einem reinen Betriebsleser verwendet werden, um einen bereits beendeten Lauf
// zu erklaeren, ohne freie Fehlertexte oder Mandatsinhalte auszugeben.
const SICHERE_LAUFGRUENDE = new Set([
  "nachlauf-freigabe-fehlt", "nachlauf-arbeitsbeginn-ungueltig",
  "nachlauf-konfiguration-abweichend", "nachlauf-arbeitsauswahl-nicht-deployt",
  "nachlauf-tageswechsel", "nachlauf-cronkonkurrenz", "nachlauf-speicherziel-abweichend",
  "nachlauf-status-unlesbar", "nachlauf-speicher-unlesbar", "nachlauf-bestand-abweichend",
  "nachlauf-konkurrierende-verarbeitung", "nachlauf-tageszaehler-fehlt",
  "nachlauf-konkurrierender-lauf", "nachlauf-kommunikation-unlesbar",
  "nachlauf-kommunikationsverletzung", "nachlauf-kosten-unklar", "nachlauf-kostenstopp",
  "nachlauf-textbestand-unlesbar", "nachlauf-projektionsbeleg-unvollstaendig",
  "nachlauf-vorige-ergebnisse-unlesbar", "nachlauf-bereits-aktiv",
  "nachlauf-kennung-bereits-verwendet", "nachlauf-startquittung-fehlt",
  "nachlauf-ziel-abweichend", "nachlauf-zielprofil-veraendert", "nachlauf-zeitbudget",
  "nachlauf-speicherung-nicht-bestaetigt", "nachlauf-reparatur-nicht-bestaetigt",
  "nachlauf-profilbestand-veraendert", "nachlauf-bestandstext-veraendert",
  "nachlauf-qualitaetsfehler", "nachlauf-netz-speicher-oder-antwortfehler",
  "nachlauf-endquittung-fehlt", "nachlauf-speicherfehler",
  "nachlauf-mandat-bereits-aktiv", "nachlauf-textfehler-unbekannt"
]);
function istSichererLaufgrund(grund) {
  return SICHERE_LAUFGRUENDE.has(grund)
    || /^nachlauf-textfehler-ai-(?:unavailable|cost-receipt-missing|response-incomplete|response-invalid-json|provider-unavailable|text-invalid)$/.test(grund || "")
    || /^nachlauf-textfehler-ai-provider-http-[45][0-9]{2}$/.test(grund || "")
    || istQualitaetsfehler(grund);
}
function sichererBuildAbbruchgrund(reason) {
  if (BUILD_ABBRUCHGRUENDE.has(reason)) return BUILD_ABBRUCHGRUENDE.get(reason);
  if (/^ai-(?:unavailable|cost-receipt-missing|response-incomplete|response-invalid-json|provider-unavailable|text-invalid)$/.test(reason || "")
    || /^ai-provider-http-[45][0-9]{2}$/.test(reason || "")) return "nachlauf-textfehler-" + reason;
  return "nachlauf-textfehler-unbekannt";
}

function fordere(wert, grund) { D.fordere(wert, grund); }
function profilHash(s) {
  return D.hash({ mandate: s.mandate, identitaeten: s.identitaeten, users: s.auth.users });
}
function pruefeKosten(auth, counter, tag) {
  const k = kostenBefund(auth, counter, tag);
  fordere(k.aufrufbelege <= k.reservierungen, "nachlauf-kosten-unklar");
  if (auth.testKostenTage?.[tag]) {
    // Der Aufrufer hat die aktive 4-USD-Regel bereits geprueft. Fehlende
    // Nutzungszeilen bleiben unbekannt und brauchen eigene volle Reserven.
    try { Object.assign(k, require("./testkosten-budget").kontrolliere(auth, tag,
      k.unbekannteKosten + k.reservierungsluecke, k.reservierungen)); }
    catch { fordere(false, "nachlauf-kosten-unklar"); }
  } else {
    fordere(k.reservierungsluecke === 0, "nachlauf-kosten-unklar");
    fordere(k.unbekannteKosten === 0, "nachlauf-kosten-unklar");
    fordere(k.prognoseUsd + k.reserveJeLueckeUsd < 9, "nachlauf-kostenstopp");
  }
  return k;
}
function pruefeArbeitsbeginn(value = 1) {
  const n = Number(value);
  fordere(["number", "string"].includes(typeof value) && Number.isSafeInteger(n)
    && n >= 1 && n <= 500 && String(n) === String(value), "nachlauf-arbeitsbeginn-ungueltig");
  return n;
}
function pruefeConfig(c, commit, arbeitsbeginn = 1) {
  fordere(c && c.production === true && c.commit === commit && /^[a-f0-9]{40}$/.test(commit || "")
    && c.storageSupabase && c.v3Bereit && c.profileRelational && c.profileExclusive
    && c.retentionGueltig && c.retention === 36 && c.kommunikationGesperrt
    && c.kohortenQuellenGesperrt && c.tagesdeckel === 2416 && c.understandingReserve === 702
    && c.vorrangreserveReal >= 200 && c.atomicLock === true && c.narrativQueue === false
    && c.modell === "gpt-5-mini" && c.azure === true
    && c.testKosten?.version === 2 && c.testKosten.aktiv === true && c.testKosten.limitUsd === 4
    && c.testKosten.maxManualCalls === null && c.testKosten.maxWindowMs === null
    && c.testKosten.unbekanntBleibtReserviert === true,
  "nachlauf-konfiguration-abweichend");
  fordere(arbeitsbeginn === 1 || c.textnachlaufArbeitsauswahlVersion === 1,
    "nachlauf-arbeitsauswahl-nicht-deployt");
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

async function ausfuehren({ commit, runId, confirmation, config, arbeitsbeginn = 1,
  env = process.env, fetchFn = global.fetch, deps = {} } = {}) {
  const now = deps.now || (() => new Date());
  const start = now();
  const tag = start.toISOString().slice(0, 10);
  const day = berlinTagKey(start);
  const end = start.getTime() + BUDGET_MS;
  const results = [];
  let storage, get, locked = false, begonnen = false, kostenVorher, grund = null;
  let grundlinie, vorher = [], ids = [], freigegebeneModelle = 0, kommunikationHash = null;
  let projektionsbeleg = null;
  let aktuellesMandat = null;
  let startPosition = null;
  let arbeitsIdsErlaubt = new Set();
  let qualitaetsfehler = 0;
  let atomarerUsdRiegel = false;
  const bereitsAbgelehnt = new Map();
  const offeneEntwuerfe = new Map();
  // Nach einem begonnenen Lauf haben HTTP Antwort und Datenbankquittung dieselbe
  // Zielmenge. Nicht erreichte Mandate bleiben explizit unbearbeitet, nie Erfolg.
  const einzelergebnisse = () => begonnen ? ids.map(id => results.find(r => r.userId === id)
    || { userId: id, gestartet: false, grund: arbeitsIdsErlaubt.has(id)
      ? "nicht-erreicht-nach-abbruch" : "ausserhalb-arbeitsauswahl" }) : results;
  const bericht = () => ({ ok: grund === null, schemaVersion: 1, runId,
    modus: "manuell-fehlende-texte", ziel: 500, begonnen,
    arbeitsbeginn: startPosition, ausgewaehlteMandate: arbeitsIdsErlaubt.size,
    gespeichert: results.filter(r => r.gespeichert).length,
    freigegebeneModelle, results: einzelergebnisse(), grund, qualitaetsfehler, automatischeWiederholung: false,
    funktionsnachweis500: false, kostenVorher, projektionsbeleg, atomarerUsdRiegel });
  try {
    fordere(confirmation === CONFIRM && /^nachlauf500-[0-9]{5,20}$/.test(runId || ""), "nachlauf-freigabe-fehlt");
    startPosition = pruefeArbeitsbeginn(arbeitsbeginn);
    pruefeConfig(await config(), commit, startPosition);
    atomarerUsdRiegel = true;
    fordere(new Date(end + 60000).toISOString().slice(0, 10) === tag
      && berlinTagKey(new Date(end + 60000)) === day, "nachlauf-tageswechsel");
    // Ein ausdruecklich gestarteter Fehlstellenlauf braucht keine Morgenwartezeit.
    // Tatsächliche Konkurrenz und der UTC Kostentag bleiben separat geschuetzt.
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
      const b = D.pruefeSnapshot(s, "500-bestand");
      fordere(b.gesamt === 504 && b.aktiv === 500 && b.aktive.length === 495,
        "nachlauf-bestand-abweichend");
      return s;
    };
    const guard = async (ownTenant = null) => {
      pruefeConfig(await config(), commit, startPosition);
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
    // Betreiber 09.09.: saemtliche 500 Profile sind Testprofile, kein Sondervorrang.
    ids = s.mandate.filter(m => m.aktiv).map(m => m.user_id).sort();
    arbeitsIdsErlaubt = new Set(ids.slice(startPosition - 1));
    vorher = await leseTexte(get, ids, day);
    fordere(Array.isArray(vorher) && vorher.length <= 500
      && new Set(vorher.map(r => r.id)).size === vorher.length
      && vorher.every(r => ids.includes(r.user_id) && r.id === `bf-${r.user_id}-lage-${day}`),
    "nachlauf-textbestand-unlesbar");
    const vorherMap = new Map(vorher.map(r => [r.user_id, r]));
    const vorhanden = new Set(vorher.filter(r => Q.gespeicherterTextGueltig(r.payload)).map(r => r.user_id));
    const jobs = await get("helmut_jobs?select=tenant_id,status,due_at&job_type=eq.mandate_projection"
      + "&freshness_window=eq." + tag + "T00Z&limit=501");
    fordere(jobs.length === 500 && new Set(jobs.map(j => j.tenant_id)).size === 500
      && jobs.every(j => ids.includes(j.tenant_id)), "nachlauf-projektionsbeleg-unvollstaendig");
    fordere(jobs.every(j => ["wartend", "laeuft", "erledigt", "fehlgeschlagen"].includes(j.status)
      && Number.isFinite(Date.parse(j.due_at))), "nachlauf-projektionsbeleg-unvollstaendig");
    // Ein bestaetigt abgelehntes Mandat wird bei einer manuellen Fortsetzung
    // desselben Tages und Codebestands nicht erneut kostenpflichtig versucht.
    // Provider-, Speicher- und Kostenfehler bleiben globale Stopps.
    const alteLaeufe = await get("process_runs?select=run_id,status,commit_ref,telemetrie"
      + "&process=eq." + PROCESS + "&commit_ref=eq." + commit
      + "&started_at=gte." + tag + "T00:00:00Z&order=started_at.asc&limit=1000");
    fordere(Array.isArray(alteLaeufe) && alteLaeufe.length < 1000
      && alteLaeufe.every(r => r.commit_ref === commit && ["success", "failed"].includes(r.status)
        && Array.isArray(r.telemetrie?.mandatsErgebnisse)), "nachlauf-vorige-ergebnisse-unlesbar");
    for (const lauf of alteLaeufe) for (const r of lauf.telemetrie.mandatsErgebnisse) {
      if (/^[a-f0-9]{64}$/.test(r.mandatHash || "") && istQualitaetsfehler(r.grund))
        bereitsAbgelehnt.set(r.mandatHash, r);
    }
    // Auch nach einer technischen Codekorrektur kann ein bereits bezahlter
    // Entwurf vor seinem Review an der Zeitgrenze stehen. Nur diese eindeutig
    // beendete Fehlerklasse darf ihren unveraenderlichen Beleg weiterreichen.
    const zeitLaeufe = await get("process_runs?select=run_id,status,reason,finished_at,telemetrie"
      + "&process=eq." + PROCESS + "&status=eq.failed&reason=eq.nachlauf-zeitbudget"
      + "&started_at=gte." + tag + "T00:00:00Z&order=started_at.asc&limit=1000");
    fordere(Array.isArray(zeitLaeufe) && zeitLaeufe.length < 1000 && zeitLaeufe.every(r =>
      /^nachlauf500-[0-9]{5,20}$/.test(r.run_id || "") && r.run_id !== runId
      && r.status === "failed" && r.reason === "nachlauf-zeitbudget"
      && Number.isFinite(Date.parse(r.finished_at)) && Date.parse(r.finished_at) <= start.getTime()
      && Array.isArray(r.telemetrie?.mandatsErgebnisse)), "nachlauf-vorige-ergebnisse-unlesbar");
    for (const lauf of zeitLaeufe) for (const r of lauf.telemetrie.mandatsErgebnisse) {
      if (/^[a-f0-9]{64}$/.test(r.mandatHash || "") && r.gestartet === true && r.grund === "nachlauf-zeitbudget")
        offeneEntwuerfe.set(r.mandatHash, lauf.run_id);
    }
    projektionsbeleg = {
      gesamt: jobs.length,
      erledigt: jobs.filter(j => j.status === "erledigt").length,
      erledigtUndFaellig: jobs.filter(j => j.status === "erledigt"
        && Date.parse(j.due_at) <= start.getTime()).length,
      wartend: jobs.filter(j => j.status === "wartend").length,
      laufend: jobs.filter(j => j.status === "laeuft").length,
      fehlgeschlagen: jobs.filter(j => j.status === "fehlgeschlagen").length
    };
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
    // Bei spaeteren Scheiben duerfen hunderte Cache-/Briefingleser nicht das
    // gesamte kurze Arbeitsfenster verbrauchen, bevor die naechste Luecke dran ist.
    // Die vollstaendige Zielmenge und Einzelquittung bleiben unveraendert.
    // Bereits bezahlte, noch ungepruefte Entwuerfe zuerst erreichen. Sonst
    // verbrauchen neue Entwuerfe das kurze Fenster vor ihrem fehlenden Review.
    // Die eigentliche Uebernahme prueft weiterhin Besitzer, Tag, Hash und Kontext.
    const vorrang = id => vorhanden.has(id) ? 2 : offeneEntwuerfe.has(D.hash(id)) ? 0 : 1;
    const arbeitsIds = [...ids].sort((a, b) => vorrang(a) - vorrang(b));
    for (const id of arbeitsIds) {
      // Explizite Betreiber-Arbeitsauswahl, keine Aufloesung alter Fehler.
      // Die Gesamtmenge bleibt 500; ausserhalb weder KI noch Materialisierung.
      if (!arbeitsIdsErlaubt.has(id)) {
        aktuellesMandat = null;
        results.push({ userId: id, gestartet: false, grund: "ausserhalb-arbeitsauswahl" });
        continue;
      }
      aktuellesMandat = id;
      if (vorhanden.has(id)) {
        const result = { userId: id, lageVorhanden: true, grund: "vorhanden-geschuetzt" };
        results.push(result);
        if (deps.materialisiereBriefing && now().getTime() + RESERVE_MS < end) {
          await guard(id);
          const p = storage.fromMandateProfileRow(profileMap.get(id), mandateMap.get(id));
          result.briefing = await deps.materialisiereBriefing(p, id);
        }
        continue;
      }
      const abgelehnt = bereitsAbgelehnt.get(D.hash(id));
      if (abgelehnt) {
        qualitaetsfehler++;
        results.push({ userId: id, gestartet: false, grund: abgelehnt.grund,
          bereitsAbgelehnt: true, diagnose: require("./lage-textqualitaet").sichereDiagnose(abgelehnt.diagnose) });
        continue;
      }
      // Der regulaere Lage-Lauf um 05:45 baut denselben Text direkt aus den
      // verstandenen Wissensobjekten und ihren Quellen. Er wartet nicht auf die
      // ueber den Tag verteilte mandate_projection-Faelligkeit. Der ausdruecklich
      // bestaetigte manuelle Fehlstellenlauf folgt nun derselben fachlichen
      // Voraussetzung. Die 500 Projektionszeilen bleiben als unveraenderter,
      // sichtbarer Beleg im Ergebnis; keine due_at-Zeit wird vorgezogen.
      if (now().getTime() + RESERVE_MS >= end) { results.push({ userId: id, grund: "zeitbudget" }); continue; }
      const p = storage.fromMandateProfileRow(profileMap.get(id), mandateMap.get(id));
      const r = await build(p, { politicianId: id, missingOnly: true, repairIncomplete: true, costRunId: runId,
        fortsetzenNachZeitbudget: offeneEntwuerfe.get(D.hash(id)),
        beforeGenerate: async (owner) => {
          fordere(owner === id && arbeitsIdsErlaubt.has(owner)
            && freigegebeneModelle < 1000, "nachlauf-ziel-abweichend");
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
        fordere(Q.gespeicherterTextGueltig(saved.payload)
          && (!vorherMap.has(id) || Q.bestandErhalten(vorherMap.get(id), saved)), "nachlauf-reparatur-nicht-bestaetigt");
        const result = { userId: id, gestartet: true, gespeichert: true, repariert: vorherMap.has(id), generatedAt: saved.generated_at };
        results.push(result);
        // Der unabhaengig gelesene Text bleibt auch bei einem nachfolgenden
        // Briefingfehler im Ergebnis erhalten. Keine blinde Neuerzeugung.
        result.briefing = deps.materialisiereBriefing ? await deps.materialisiereBriefing(p, id) : null;
      } else {
        const reason = r.reason || "unbekannt";
        results.push({ userId: id, gestartet: true, lageVorhanden: vorherMap.has(id),
          grund: istQualitaetsfehler(reason) ? "nachlauf-textfehler-" + reason : reason,
          diagnose: require("./lage-textqualitaet").sichereDiagnose(r.diagnose) });
        if (istQualitaetsfehler(reason)) { qualitaetsfehler++; continue; }
        fordere(BUILD_LEERGRUENDE.has(reason), sichererBuildAbbruchgrund(reason));
      }
    }
    await guard();
    const nach = await snapshot();
    fordere(profilHash(nach) === grundlinie, "nachlauf-profilbestand-veraendert");
    const texts = await leseTexte(get, ids, day);
    fordere(Array.isArray(texts) && vorher.every(r => {
      const row = texts.find(x => x.id === r.id);
      return Q.bestandErhalten(r, row);
    }), "nachlauf-bestandstext-veraendert");
    if (qualitaetsfehler) grund = "nachlauf-qualitaetsfehler";
  } catch (error) {
    grund = error instanceof D.DirektAbbruch ? error.grund : "nachlauf-netz-speicher-oder-antwortfehler";
    if (aktuellesMandat) {
      const result = results.find(r => r.userId === aktuellesMandat);
      if (result) result.grund = grund;
      else results.push({ userId: aktuellesMandat, gestartet: true, grund });
    }
  } finally {
    if (begonnen) {
      const q = await storage.schreibeWarteschlangenLaufquittung({ process: PROCESS, runId, mode: "manual",
        location: "vercel", status: grund ? "failed" : "success", startedAt: start.toISOString(),
        finishedAt: now().toISOString(), processed: results.filter(r => r.gespeichert).length,
        fehlgeschlagen: qualitaetsfehler + (grund && grund !== "nachlauf-qualitaetsfehler" ? 1 : 0), zielmenge: 500,
        gespeichert: results.filter(r => r.gespeichert).length,
        mandatsErgebnisse: einzelergebnisse().map(r => {
          return { mandatHash: D.hash(r.userId), gestartet: r.gestartet === true,
            lageGespeichert: r?.gespeichert === true || r?.lageVorhanden === true,
            briefingGespeichert: r?.briefing?.gespeichert === true,
            diagnose: r?.diagnose,
            grund: r?.grund || (r?.gespeichert ? "gespeichert" : "nicht-erreicht-nach-abbruch") };
        }),
        reason: grund, commit }).catch(() => null);
      if (q?.ok !== true) grund = "nachlauf-endquittung-fehlt";
    }
    if (locked) await storage.releasePipelineLock(LOCK);
  }
  return bericht();
}

module.exports = { ausfuehren, pruefeKosten, pruefeConfig, pruefeArbeitsbeginn, leseTexte,
  istQualitaetsfehler, istSichererLaufgrund, sichererBuildAbbruchgrund, SICHERE_LAUFGRUENDE,
  CONFIRM, PROCESS, BUDGET_MS, RESERVE_MS };
