"use strict";

// Kontrollierter Quellen-Vorlauf fuer exakt 500 ausgewaehlte, weiterhin INAKTIVE Profile.
// Er benutzt den bestehenden Quellenplan und den bestehenden source_fetch-Handler.
// Kein Profilwrite, keine Projektion, kein Briefing, kein Modellaufruf in diesem Schritt.
// Neu entdeckte Dokumente werden relational gespeichert; die vom Handler abgeleiteten
// document_understanding-Auftraege werden NUR im Speicher gesammelt und NICHT eingereiht.
// So kann der Betreiber nach dem echten Abruf die genaue Verstehensmenge und damit den
// kostenpflichtigen Folgeschritt separat freigeben.
const D = require("../lib/helmut/testkohorte-direkt500");
const R = require("../lib/helmut/quellenkontext-ruheziel");
const SD = require("../lib/helmut/source-demand");
const SP = require("../lib/helmut/scalable-pipeline");

const LOCK = "500-quellenvorlauf";
const MAX_SOURCE_FETCH = D.QUELLENVORLAUF_MAX_SOURCE_FETCH;
const MAX_MS = D.QUELLENVORLAUF_MAX_MS;
const PARALLEL = 1;

function kohortenquellenAktiv(env = process.env) {
  return String(env.HELMUT_TESTKOHORTE_QUELLEN || "").trim().toLowerCase() === "aktiv";
}
function jobBeleg(j) {
  return {
    jobType: j.jobType,
    tenantId: j.tenantId || null,
    idempotencyKey: j.idempotencyKey,
    freshnessWindow: j.freshnessWindow,
    payload: j.payload
  };
}
async function mapBounded(items, parallel, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function bauePlan({ bestand, bestandsauswahl, env = process.env, now = () => new Date(), deps = {} } = {}) {
  D.pruefeSnapshot(bestand, "500-ruhend");
  const ziel = R.pruefe(bestand, bestandsauswahl);
  D.fordere(!kohortenquellenAktiv(env), "quellenvorlauf-synthetische-eigenquellen-aktiv");

  const storage = deps.storage || require("../lib/helmut/storage");
  const scheduler = deps.scheduler || require("../lib/helmut/scheduler");
  const sourceDemand = deps.sourceDemand || SD;
  const profileAusZeilen = deps.profileAusZeilen
    || ((identitaet, mandat) => storage.fromMandateProfileRow(identitaet, mandat));
  const planCache = {};
  const quellenFuerProfil = deps.quellenFuerProfil
    || ((p) => scheduler.getSourcesForProfile(p, { planCache }));

  const mandate = new Map(bestand.mandate.map(m => [m.user_id, m]));
  const identitaeten = new Map(bestand.identitaeten.map(p => [p.id, p]));
  const profile = ziel.ids.map(id => {
    const m = mandate.get(id), p = identitaeten.get(id);
    D.fordere(m && p && m.aktiv === false, "quellenvorlauf-zielprofil-unvollstaendig");
    const out = profileAusZeilen(p, m);
    D.fordere(out && out.id === id, "quellenvorlauf-profilabbildung-abweichend");
    return out;
  });

  const quellenJeProfil = new Map();
  const bedarf = await sourceDemand.kompiliereQuellenbedarf({
    profile,
    jetztMs: now().getTime(),
    env,
    rotation: [...ziel.ids],
    quellenFuerProfil: async p => {
      const q = await quellenFuerProfil(p);
      D.fordere(Array.isArray(q), "quellenvorlauf-quellenplan-ungueltig");
      quellenJeProfil.set(p.id, q.length);
      return q;
    }
  });

  D.fordere(Array.isArray(bedarf.auftraege) && Array.isArray(bedarf.fehlerhafteProfile),
    "quellenvorlauf-plan-unlesbar");
  D.fordere(bedarf.fehlerhafteProfile.length === 0
    && bedarf.statistik?.profile === 500 && bedarf.statistik?.profilePlaene === 500,
  "quellenvorlauf-profile-nicht-vollstaendig-geplant");

  const ohneQuellen = ziel.ids.filter(id => !(quellenJeProfil.get(id) > 0));
  D.fordere(ohneQuellen.length === 0, "quellenvorlauf-profil-ohne-quellen");
  const jobs = bedarf.auftraege;
  D.fordere(jobs.length > 0 && jobs.length <= MAX_SOURCE_FETCH, "quellenvorlauf-quellenumfang-abweichend");
  D.fordere(jobs.every(j => j && j.jobType === "source_fetch" && j.payload?.quelle?.id
    && typeof j.idempotencyKey === "string" && j.idempotencyKey),
  "quellenvorlauf-fremder-auftrag");
  D.fordere(new Set(jobs.map(j => j.idempotencyKey)).size === jobs.length,
    "quellenvorlauf-doppelter-auftrag");

  const bestandsSet = new Set(bestandsauswahl);
  const synthetisch = new Set(D.ALLE_KENNUNGEN);
  D.fordere(jobs.every(j => j.tenantId == null || bestandsSet.has(j.tenantId)),
    "quellenvorlauf-synthetische-eigenquelle");
  D.fordere(jobs.every(j => j.tenantId == null || !synthetisch.has(j.tenantId)),
    "quellenvorlauf-synthetische-eigenquelle");

  const geteilt = jobs.filter(j => j.tenantId == null).length;
  const persoenlich = jobs.length - geteilt;
  return {
    ziel,
    jobs,
    planHash: D.hash(jobs.map(jobBeleg)),
    statistik: bedarf.statistik,
    profileMitQuellen: 500,
    profileOhneQuellen: [],
    sourceFetch: jobs.length,
    geteilt,
    persoenlich
  };
}

async function ausfuehren({ bestand, bestandsauswahl, env = process.env, now = () => new Date(),
  pruefeBetrieb = async () => {}, snapshot = async () => bestand, execute = false,
  fortschritt = null, deps = {} } = {}) {
  const start = now();
  D.fordere(start instanceof Date && Number.isFinite(start.getTime()), "quellenvorlauf-uhr-ungueltig");
  const plan = await bauePlan({ bestand, bestandsauswahl, env, now, deps });
  const report = {
    ok: true,
    reinLesend: !execute,
    ausgeloest: false,
    ziel: 500,
    zielHash: plan.ziel.zielHash,
    planHash: plan.planHash,
    profileMitQuellen: plan.profileMitQuellen,
    profileOhneQuellen: plan.profileOhneQuellen,
    sourceFetchGeplant: plan.sourceFetch,
    geteilt: plan.geteilt,
    persoenlich: plan.persoenlich,
    maxSourceFetch: MAX_SOURCE_FETCH,
    maxArbeitszeitMs: MAX_MS,
    modellaufrufe: 0,
    understandingEingereiht: 0,
    funktionsnachweis500: false,
    quellenversorgung500: false
  };
  if (!execute) return report;

  D.fordere(env.GITHUB_RUN_ATTEMPT === "1" && /^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID || ""),
    "quellenvorlauf-keine-wiederholung");
  D.fordere(!kohortenquellenAktiv(env), "quellenvorlauf-synthetische-eigenquellen-aktiv");
  const ende = start.getTime() + MAX_MS;
  D.fordere(new Date(ende + 60000).toISOString().slice(0, 10) === start.toISOString().slice(0, 10),
    "quellenvorlauf-tageswechsel");
  const F = require("../lib/helmut/funktionstest-500");
  D.fordere(F.pruefeStartfenster({
    startUtc: start.toISOString(),
    dauerMinuten: Math.ceil(MAX_MS / 60000),
    crons: require("../vercel.json").crons,
    maxLaufzeitMs: MAX_MS
  }).startErlaubt, "quellenvorlauf-cronkonkurrenz");

  const storage = deps.storage || require("../lib/helmut/storage");
  const handler = deps.handleSourceFetch || SP.HANDLER.source_fetch;
  const protectionBefore = D.hash(await snapshot());
  let locked = false;
  const verstehen = new Map();
  const ergebnisse = [];
  const runId = String(env.GITHUB_RUN_ID);
  const owner = "quellenvorlauf-" + runId;

  try {
    locked = await (deps.acquireLock
      ? deps.acquireLock(LOCK, MAX_MS + 120000)
      : storage.acquirePipelineLock(LOCK, MAX_MS + 120000));
    D.fordere(locked === true, "quellenvorlauf-bereits-aktiv");

    const guard = async reserve => {
      D.fordere(now().getTime() + reserve < ende, "quellenvorlauf-zeitbudget");
      D.fordere(now().toISOString().slice(0, 10) === start.toISOString().slice(0, 10),
        "quellenvorlauf-tageswechsel");
      await pruefeBetrieb(LOCK);
      const s = await snapshot();
      D.pruefeSnapshot(s, "500-ruhend");
      D.fordere(R.pruefe(s, bestandsauswahl).zielHash === plan.ziel.zielHash,
        "quellenvorlauf-zielmenge-veraendert");
      return s;
    };
    await guard(120000);

    const base = SP.workerDeps({
      env,
      enqueue: async job => {
        D.fordere(job?.jobType === "document_understanding" && job.tenantId == null
          && Array.isArray(job.payload?.dokumentIds) && job.payload.dokumentIds.length > 0,
        "quellenvorlauf-fremder-folgeauftrag");
        if (!verstehen.has(job.idempotencyKey)) verstehen.set(job.idempotencyKey, structuredClone(job));
        return { verfuegbar: true, neu: true };
      }
    });
    base.env = env;
    if (SP.klassenGrenzenAktiv(env)) {
      base.klassen = SP.klassenAdapter({ env, owner, deps: base });
    }

    let stop = null;
    await mapBounded(plan.jobs, PARALLEL, async (job, index) => {
      if (stop) return null;
      try {
        await guard(90000);
        const auftrag = {
          ...job,
          id: "quellenvorlauf-" + runId + "-" + String(index + 1).padStart(3, "0"),
          createdAt: start.toISOString()
        };
        const r = await handler(auftrag, base);
        const ok = r?.ok === true && r?.zurueckgestellt !== true;
        ergebnisse[index] = {
          idempotencyKey: job.idempotencyKey,
          quelleId: job.payload.quelle.id,
          tenantId: job.tenantId || null,
          ok,
          grund: ok ? null : String(r?.grund || "nicht-bestaetigt").slice(0, 160),
          neueRohdokumente: Number(r?.neueRohdokumente || 0),
          bereitsVorhanden: Number.isFinite(r?.bereitsVorhanden) ? r.bereitsVorhanden : null,
          verstehenNeu: Number(r?.verstehenNeu || 0)
        };
      } catch (e) {
        const message = String(e?.message || e || "unbekannt").slice(0, 200);
        ergebnisse[index] = { idempotencyKey: job.idempotencyKey, quelleId: job.payload.quelle.id,
          tenantId: job.tenantId || null, ok: false, grund: message,
          neueRohdokumente: 0, bereitsVorhanden: null, verstehenNeu: 0 };
        if (/persistenz-fehlgeschlagen|rueckles|zustand|speicher/i.test(message)) stop = message;
      }
      if (fortschritt) {
        const fertig = ergebnisse.filter(Boolean).length;
        fortschritt({ fertig, gesamt: plan.jobs.length, fehlgeschlagen: ergebnisse.filter(x => x && !x.ok).length });
      }
      return ergebnisse[index];
    });

    report.ausgeloest = true;
    report.sourceFetchVersucht = ergebnisse.filter(Boolean).length;
    report.sourceFetchBestaetigt = ergebnisse.filter(x => x?.ok).length;
    report.sourceFetchFehlgeschlagen = ergebnisse.filter(x => x && !x.ok).length;
    report.neueRohdokumente = ergebnisse.reduce((n, x) => n + Number(x?.neueRohdokumente || 0), 0);
    report.understandingAuftraegeVorbereitet = verstehen.size;
    report.understandingDokumente = [...verstehen.values()]
      .reduce((n, x) => n + x.payload.dokumentIds.length, 0);
    report.modellaufrufe = 0;
    report.understandingEingereiht = 0;
    report.ergebnisse = ergebnisse.filter(Boolean);
    report.ok = !stop && report.sourceFetchVersucht === plan.jobs.length
      && report.sourceFetchFehlgeschlagen === 0;

    if (locked) {
      await (deps.releaseLock ? deps.releaseLock(LOCK) : storage.releasePipelineLock(LOCK));
      locked = false;
    }
    await pruefeBetrieb();
    const after = await snapshot();
    D.pruefeSnapshot(after, "500-ruhend");
    D.fordere(D.hash(after) === protectionBefore, "quellenvorlauf-schutzbestand-veraendert");
    D.fordere(R.pruefe(after, bestandsauswahl).zielHash === plan.ziel.zielHash,
      "quellenvorlauf-zielmenge-veraendert");
    return report;
  } catch (e) {
    return {
      ...report,
      ok: false,
      ausgeloest: ergebnisse.length > 0,
      sourceFetchVersucht: ergebnisse.filter(Boolean).length,
      sourceFetchBestaetigt: ergebnisse.filter(x => x?.ok).length,
      sourceFetchFehlgeschlagen: ergebnisse.filter(x => x && !x.ok).length,
      neueRohdokumente: ergebnisse.reduce((n, x) => n + Number(x?.neueRohdokumente || 0), 0),
      understandingAuftraegeVorbereitet: verstehen.size,
      understandingDokumente: [...verstehen.values()].reduce((n, x) => n + x.payload.dokumentIds.length, 0),
      modellaufrufe: 0,
      understandingEingereiht: 0,
      ergebnisse: ergebnisse.filter(Boolean),
      grund: e instanceof D.DirektAbbruch ? e.grund : String(e?.message || "quellenvorlauf-fehler").slice(0, 200),
      automatischeWiederholung: false
    };
  } finally {
    if (locked) {
      try { await (deps.releaseLock ? deps.releaseLock(LOCK) : storage.releasePipelineLock(LOCK)); } catch (_) {}
    }
  }
}

module.exports = { bauePlan, ausfuehren, LOCK, MAX_SOURCE_FETCH, MAX_MS, PARALLEL };
