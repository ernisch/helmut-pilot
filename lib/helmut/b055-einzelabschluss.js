"use strict";

// Einmaliger, ausdruecklich freigegebener Abschluss eines INAKTIVEN Testprofils.
// Kein Ersatz fuer den 500er Controller und keine Aktivierung/Kommunikation.
const D = require("./testkohorte-direkt500");
const T = require("./testkohorte-textnachlauf");
const B = require("./briefing-speicher");
const Q = require("./briefing-aussagenbindung");
const I = require("./briefing-urteilsimport");
const K = require("./testkosten-budget");
const { berlinTagKey } = require("./briefing-frische");
const MANDAT = "test-kohorte-b-055";
const COMMAND = "b055-einzelabschluss-v1";
const START_ID = `bf-${MANDAT}-${COMMAND}-start`;
const SLOT = "b055-einzelstart";
const CONFIRM = "B055_INAKTIV_EINMAL_ZWEI_MODELLE_MAX_0424_USD";
const LOCK = "500-textnachlauf";
const PROCESS = "briefing-einzelabschluss";
const MAX_MICRO_USD = 424000;
class Abbruch extends Error {}
const fordere = (ok, reason) => { if (!ok) throw new Abbruch(reason); };
const bestandHash = s => B.hash({ mandate: s.mandate, identitaeten: s.identitaeten, users: s.auth.users });

function pruefeAuftrag(c, { commit, commandHash, now }) {
  fordere(c && B.hash(c) === commandHash && /^[a-f0-9]{64}$/.test(commandHash || "")
    && c.version === 1 && c.id === COMMAND && c.userId === MANDAT
    && c.productionCommit === commit && /^[a-f0-9]{40}$/.test(commit || "")
    && c.tag === berlinTagKey(now) && c.utcTag === now.toISOString().slice(0, 10)
    && c.maxModellaufrufe === 2 && c.maxMicroUsd === MAX_MICRO_USD
    && c.automatischeWiederholung === false
    && Number.isFinite(Date.parse(c.gueltigBis)) && Date.parse(c.gueltigBis) > now.getTime()
    && Date.parse(c.gueltigBis) <= Date.parse(c.utcTag + "T23:59:59Z")
    && /^nachlauf500-[0-9]{5,20}$/.test(c.runId || "")
    && /^[a-f0-9]{64}$/.test(c.kontextHash || "")
    && c.urteil?.eingabeHash && c.urteil?.korrektur?.ursprungHash,
  "einzelauftrag-abweichend");
  // Der bestehende Run-ID-Vertrag dient allein der Kosten-/Entwurfszuordnung.
  // Daraus wird ausdruecklich KEIN 500er Nachweis abgeleitet.
  return c;
}

async function ausfuehren({ commit, commandHash, confirmation, config, build,
  env = process.env, fetchFn = global.fetch, deps = {} } = {}) {
  const now = deps.now || (() => new Date());
  const start = now(), end = start.getTime() + 240000;
  const storage = deps.storage || require("./storage");
  let get, c, locked = false, begonnen = false, freigegebeneModelle = 0;
  let baseline, kommunikationHash, kostenVorher, kostenNachher, importbericht, lage, briefing, grund = null;
  let kostenBelege = [];
  const readStore = async id => {
    const rows = await get("helmut_store?select=data&id=eq." + encodeURIComponent(id) + "&limit=2");
    fordere(rows.length === 1 && rows[0].data, "einzelspeicher-unlesbar");
    return rows[0].data;
  };
  const snapshot = async () => {
    const [mandate, identitaeten, auth, main] = await Promise.all([
      get("mandate_profiles?select=*&order=user_id.asc&limit=505"),
      get("profiles?select=*&order=id.asc&limit=506"), readStore("main-auth"), readStore("main")]);
    const s = { mandate, identitaeten, auth, main }, b = D.pruefeSnapshot(s, "500-bestand");
    fordere(b.gesamt === 504 && b.aktiv === 5 && b.aktive.length === 0
      && identitaeten.length === 505, "einzelbestand-abweichend");
    if (baseline) fordere(bestandHash(s) === baseline, "einzelbestand-veraendert");
    return s;
  };
  const leseKontext = async id => {
    storage.assertTenant(id, "b055Einzelkontext"); fordere(id === MANDAT, "einzelziel-abweichend");
    const [m, p] = await Promise.all([
      get("mandate_profiles?select=*&user_id=eq." + encodeURIComponent(id) + "&limit=2"),
      get("profiles?select=*&id=eq." + encodeURIComponent(id) + "&limit=2")]);
    fordere(m.length === 1 && p.length === 1 && m[0].user_id === id && p[0].id === id
      && m[0].aktiv === false && m[0].geloescht_at === null, "einzelprofil-nicht-inaktiv");
    const ctx = { profile: storage.fromMandateProfileRow(p[0], m[0]), identitaet: p[0], mandat: m[0] };
    fordere(ctx.profile.id === id && ctx.profile.profileActive === false
      && B.hash(ctx) === c.kontextHash, "einzelkontext-veraendert");
    return ctx;
  };
  const guard = async (ownTenant = false) => {
    T.pruefeConfig(await config(), commit);
    pruefeAuftrag(c, { commit, commandHash, now: now() });
    fordere(now().getTime() < end, "einzelzeitbudget");
    const iso = encodeURIComponent(now().toISOString());
    const [locks, leases, orphan, counters, auth, communication, outbox, runs] = await Promise.all([
      get("pipeline_locks?select=job_name&expires_at=gt." + iso + "&limit=1001"),
      get("helmut_jobs?select=id&lease_expires_at=gt." + iso + "&limit=1"),
      get("helmut_jobs?select=id&status=eq.laeuft&or=(lease_expires_at.is.null,lease_expires_at.lt." + iso + ")&limit=1"),
      get("llm_budget_counters?select=used&scope=eq.global&day=eq." + c.utcTag + "&limit=2"),
      readStore("main-auth"),
      get("helmut_store?select=id,pushEvents:data->pushEvents,auditEvents:data->auditEvents&order=id.asc&limit=1001"),
      get("helmut_job_outbox?select=id&confirmed_at=gte." + c.utcTag + "T00:00:00Z&limit=1"),
      get("process_runs?select=run_id&status=eq.running&started_at=gte."
        + encodeURIComponent(new Date(now().getTime() - 10 * 60000).toISOString()) + "&limit=1001")]);
    fordere(locks.length < 1001 && locks.every(l => (locked && l.job_name === LOCK)
      || (ownTenant && l.job_name === "lage-briefing-" + MANDAT))
      && leases.length === 0 && orphan.length === 0 && runs.length < 1001
      && runs.every(r => begonnen && r.run_id === c.runId), "einzelkonkurrenz");
    fordere(counters.length === 1, "einzelkostenzaehler-fehlt");
    fordere(communication.length > 0 && communication.length < 1001 && communication.every(r =>
      (r.pushEvents == null || Array.isArray(r.pushEvents))
      && (r.auditEvents == null || Array.isArray(r.auditEvents))), "einzelkommunikation-unlesbar");
    const traces = communication.map(r => ({ id: r.id,
      push: (r.pushEvents || []).filter(e => e.createdAt?.slice(0, 10) === c.utcTag),
      audit: (r.auditEvents || []).filter(e => e.createdAt?.slice(0, 10) === c.utcTag) }));
    fordere(outbox.length === 0 && traces.every(r => !r.push.length && !r.audit.length)
      && (!kommunikationHash || B.hash(traces) === kommunikationHash), "einzelkommunikationsverletzung");
    kommunikationHash = B.hash(traces);
    const k = T.pruefeKosten(auth, counters[0].used, c.utcTag);
    fordere(k.atomarerUsdRiegel === true, "einzelkostenriegel-fehlt");
    const book = K.pruefeTag(auth[K.KEY]?.[c.utcTag], c.utcTag);
    kostenBelege = Object.entries(book.calls).filter(([, v]) => v.bezug?.runId === c.runId)
      .map(([id, v]) => ({ id, ...v }));
    fordere(kostenBelege.length <= freigegebeneModelle && kostenBelege.length <= 2
      && kostenBelege.every(v => v.bezug.mandatHash === D.hash(MANDAT)
        && ["entwurf", "pruefung"].includes(v.bezug.phase))
      && new Set(kostenBelege.map(v => v.bezug.phase)).size === kostenBelege.length
      && kostenBelege.reduce((n, v) => n + v.reserved, 0) <= MAX_MICRO_USD,
    "einzelkostenbezug-abweichend");
    fordere(K.belegt(book) + (2 - freigegebeneModelle) * 212000 <= book.limit, "einzelkostenreserve-fehlt");
    await snapshot(); await leseKontext(MANDAT);
    return k;
  };
  try {
    fordere(confirmation === CONFIRM && typeof build === "function", "einzelfreigabe-fehlt");
    T.pruefeConfig(await config(), commit);
    get = deps.get || T.getReader(env, fetchFn);
    c = pruefeAuftrag(await readStore(COMMAND), { commit, commandHash, now: start });
    const fenster = require("./funktionstest-500").pruefeStartfenster({ startUtc: start.toISOString(),
      dauerMinuten: 6, crons: require("../../vercel.json").crons, maxLaufzeitMs: 8 * 60000 });
    fordere(fenster.startErlaubt && berlinTagKey(new Date(end + 60000)) === c.tag
      && new Date(end + 60000).toISOString().slice(0, 10) === c.utcTag, "einzelstartfenster");
    baseline = bestandHash(await snapshot());
    kostenVorher = await guard();
    const readStart = () => get("briefings?select=*&user_id=eq." + MANDAT
      + "&id=eq." + START_ID + "&limit=2");
    fordere((await readStart()).length === 0, "einzelstart-bereits-verbraucht");
    for (const slot of [Q.SLOT, "lage", B.SLOT]) fordere(
      !await storage.getRenderedBriefingV3(MANDAT, slot, c.tag, { strict: true }), "einzelbestandstext-geschuetzt");
    // Vor dem dauerhaften Start nur lesen: veraltete Fachurteile kosten nichts.
    const ctx = await leseKontext(MANDAT);
    const original = await build(ctx.profile, MANDAT, { aussagenEingabe: true, now: now() });
    fordere(original.eingabe.eingabeHash === c.urteil.korrektur.ursprungHash, "einzelursprung-veraltet");
    I.pruefeUrteil(await build(ctx.profile, MANDAT, { aussagenEingabe: true,
      aussagenKorrektur: c.urteil.korrektur, now: now() }), c.urteil);
    locked = await storage.acquirePipelineLock(LOCK, 360000);
    fordere(locked === true, "einzelstart-gesperrt");
    await guard();
    const startRow = { id: START_ID, user_id: MANDAT, slot: SLOT, generated_at: now().toISOString(),
      payload: { version: 1, commandHash, runId: c.runId, productionCommit: commit,
        tag: c.tag, maxModellaufrufe: 2, maxMicroUsd: MAX_MICRO_USD, automatischeWiederholung: false } };
    // Eindeutige, tagesuebergreifende ID. Auch ein Timeout ist KEINE Retry-Erlaubnis.
    const ack = await (deps.insertStart || require("./b055-einzelstart").insert)(startRow, { storage });
    fordere(ack?.saved === true, "einzelstart-bereits-verbraucht");
    const started = await readStart();
    fordere(started.length === 1 && B.hash(started[0].payload) === B.hash(startRow.payload)
      && Date.parse(started[0].generated_at) === Date.parse(startRow.generated_at), "einzelstart-unbestaetigt");
    begonnen = true;
    const q = await storage.schreibeWarteschlangenLaufquittung({ process: PROCESS, runId: c.runId,
      mode: "manual", location: "vercel", status: "running", startedAt: start.toISOString(), finishedAt: null });
    fordere(q?.ok === true, "einzelquittung-fehlt");
    importbericht = await (deps.importiere || I.ausfuehren)({ userId: MANDAT, urteil: c.urteil, storage,
      build, leseKontext, now, pruefeBetrieb: () => guard(), freigabe: { version: 1, userId: MANDAT,
        tag: c.tag, productionCommit: commit, urteilHash: B.hash(c.urteil), eingabeHash: c.urteil.eingabeHash,
        kontextHash: c.kontextHash, maxNeuanlagen: 1, modellaufrufe: 0, gueltigBis: c.gueltigBis } });
    fordere(importbericht.verwendbar === true, "einzelimport-abgelehnt");
    const fach = async () => {
      const check = await (deps.leseFach || Q.leseFuerNachlauf)({ profile: ctx.profile,
        userId: MANDAT, build, storage, now: now() });
      fordere(check.bereit === true && check.eingabeHash === c.urteil.eingabeHash, "einzelfachbasis-veraltet");
      return check;
    };
    const basis = await fach();
    lage = await (deps.lage || require("./lage").buildLageBriefing)(ctx.profile, {
      politicianId: MANDAT, missingOnly: true, costRunId: c.runId, briefingEingabe: basis.lageEingabe,
      beforeGenerate: async owner => {
        fordere(owner === MANDAT && freigegebeneModelle < 2, "einzelmodellgrenze");
        await guard(true); await fach();
        fordere(now().getTime() + 90000 < end, "einzelzeitbudget");
        fordere(kostenBelege.length === freigegebeneModelle && kostenBelege.every(v => v.status === "abgerechnet")
          && (freigegebeneModelle === 0 || kostenBelege[0].bezug.phase === "entwurf"), "einzelkosten-unbestaetigt");
        freigegebeneModelle++;
      }, beforeSave: async owner => {
        fordere(owner === MANDAT && freigegebeneModelle === 2, "einzelmodellgrenze");
        await guard(true); await fach();
        fordere(kostenBelege.length === 2 && kostenBelege.every(v => v.status === "abgerechnet"), "einzelkosten-unbestaetigt");
      } });
    fordere(lage.available === true && lage.fromCache === false, "einzellage-abgelehnt");
    const saved = await storage.getRenderedBriefingV3(MANDAT, "lage", c.tag, { strict: true });
    fordere(saved?.user_id === MANDAT && saved.slot === "lage" && saved.id === `bf-${MANDAT}-lage-${c.tag}`
      && Date.parse(saved.generated_at) >= start.getTime() && saved.payload.briefingEingabeHash === c.urteil.eingabeHash
      && require("./lage-quellenbeleg").gespeicherterTextGueltig(saved.payload), "einzellage-unbestaetigt");
    await guard(); const finalBasis = await fach();
    briefing = await (deps.materialisiere || B.materialisiere)({ profile: ctx.profile, userId: MANDAT,
      briefing: finalBasis.briefing, aussagenEingabeHash: finalBasis.eingabeHash,
      profilkontextUebergang: finalBasis.lageEingabe, storage, now: now() });
    fordere(briefing.gespeichert === true && briefing.vollstaendig === true, "einzelbriefing-unbestaetigt");
    kostenNachher = await guard();
  } catch (e) {
    grund = e instanceof Abbruch ? e.message : "einzelbetrieb-abgebrochen";
  } finally {
    if (begonnen) {
      const q = await storage.schreibeWarteschlangenLaufquittung({ process: PROCESS, runId: c.runId,
        mode: "manual", location: "vercel", status: grund ? "failed" : "success", startedAt: start.toISOString(),
        finishedAt: now().toISOString(), zielmenge: 1, processed: briefing?.gespeichert ? 1 : 0,
        gespeichert: briefing?.gespeichert ? 1 : 0, fehlgeschlagen: grund ? 1 : 0, reason: grund, commit }).catch(() => null);
      if (q?.ok !== true) grund = "einzelendquittung-fehlt";
    }
    if (locked) await storage.releasePipelineLock(LOCK).catch(() => null);
  }
  return { ok: grund === null, grund, begonnen, userId: MANDAT, runId: c?.runId, productionCommit: commit,
    freigegebeneModelle, maxMicroUsd: MAX_MICRO_USD, kostenVorher, kostenNachher, kostenBelege,
    importbericht, lage, briefing, funktionsnachweis500: false, automatischeWiederholung: false };
}
module.exports = { ausfuehren, pruefeAuftrag, MANDAT, COMMAND, START_ID, SLOT, CONFIRM, MAX_MICRO_USD };
