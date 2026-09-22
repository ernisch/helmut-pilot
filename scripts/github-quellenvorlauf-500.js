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
const RUN_KEY = "quellenvorlauf500-20260922-a";
const MAX_SOURCE_FETCH = D.QUELLENVORLAUF_MAX_SOURCE_FETCH;
const MAX_MS = D.QUELLENVORLAUF_MAX_MS;
const PARALLEL = 1;

// ── EINMALIGE FORTSETZUNG des teilweise fehlgeschlagenen Laufs Run 35725341566 ───────────────
// Ausschliesslich die exakt 38 dort fehlgeschlagenen Auftraege, hart an den EINGEFRORENEN
// Plan gebunden (zielHash/planHash/RestHash). Kein stiller Wechsel auf einen neuen Plan,
// keine Wiederverwendung der alten Quittung. Quelle der Listen: rein lesend aus dem
// Run-Log von 35725341566.
const REST_KEYS = Object.freeze([
  "source_fetch|geteilt|07c5c294f061354e40fa0083ece859d6|2026-09-22T08Z",
  "source_fetch|geteilt|09a87c6f3c502472e1e6f67d8509dd41|2026-09-22T08Z",
  "source_fetch|geteilt|0d80543b7c8eec227b0fba7351258de6|2026-09-22T08Z",
  "source_fetch|geteilt|10746fcb15769edc185be5b2d7f78ed8|2026-09-22T08Z",
  "source_fetch|geteilt|10a02c62ae9fa32469c5e173fb6e9782|2026-09-22T08Z",
  "source_fetch|geteilt|128f7627aca7b6201979f3f454063251|2026-09-22T08Z",
  "source_fetch|geteilt|1553c867f6b34056938af87b74991c12|2026-09-22T08Z",
  "source_fetch|geteilt|2af9be9177bb5a0fc2d2f3a1dfffa39d|2026-09-22T08Z",
  "source_fetch|geteilt|4164460b41fc3d7847fd36f9b937e327|2026-09-22T08Z",
  "source_fetch|geteilt|46dc2471d26aa23f19ad1e8620bd920f|2026-09-22T08Z",
  "source_fetch|geteilt|4bdadfca992618923731e021cdec1218|2026-09-22T08Z",
  "source_fetch|geteilt|4d9c82cf431d8d57c41768e3e22d4b1f|2026-09-22T08Z",
  "source_fetch|geteilt|62985680a85a594c9d7907882bcc0c7c|2026-09-22T08Z",
  "source_fetch|geteilt|62a896976a43be447c8eb439e8a852d8|2026-09-22T08Z",
  "source_fetch|geteilt|651e976201f00a8f601a8621dd67477e|2026-09-22T08Z",
  "source_fetch|geteilt|65ce8334b729de1e7d80d2dc707fa315|2026-09-22T08Z",
  "source_fetch|geteilt|673d445c66b484524c9d1d35ef251826|2026-09-22T08Z",
  "source_fetch|geteilt|7808c4a91ba5fff422162c49e1edcabd|2026-09-22T08Z",
  "source_fetch|geteilt|8eadb652ff9324d9d1dab008c7976f1c|2026-09-22T08Z",
  "source_fetch|geteilt|8f3b894616b7815660b533e2d2694484|2026-09-22T08Z",
  "source_fetch|geteilt|9765667e32490d9c9664142dd38adaf4|2026-09-22T08Z",
  "source_fetch|geteilt|992b078df7f5d221cb9891afd4f4cdc5|2026-09-22T08Z",
  "source_fetch|geteilt|a53458f89b962d17b78926174975b8ec|2026-09-22T08Z",
  "source_fetch|geteilt|ba1a7550678fae0968f44ec753e56d77|2026-09-22T08Z",
  "source_fetch|geteilt|beac504326d0610cc251598eb5b32bbc|2026-09-22T08Z",
  "source_fetch|geteilt|c0da2deb2fed7af233f7b49553703cc5|2026-09-22T08Z",
  "source_fetch|geteilt|c6ebec7c1a2819f937c180059a5b6aa4|2026-09-22T08Z",
  "source_fetch|geteilt|c86c8f3f18a9ea49bd38773a87d260b3|2026-09-22T08Z",
  "source_fetch|geteilt|ccf2602ae29a03262b8916133ceebe95|2026-09-22T08Z",
  "source_fetch|geteilt|f5c179385d02fcd525cf68ffbe582c30|2026-09-22T08Z",
  "source_fetch|person|cem-ince|1ad3be5ab0f87b52669ae3bb33ef051f|2026-09-22T00Z",
  "source_fetch|person|cem-ince|be011e8ada562d2e140f9a19b483b394|2026-09-17T00Z",
  "source_fetch|person|helmut-kleebank|4e4f3ca52c53b8e626694626b4b36fb3|2026-09-22T00Z",
  "source_fetch|person|helmut-kleebank|ce7a63d2b14597926d4a10019b3ff5b6|2026-09-17T00Z",
  "source_fetch|person|ottilie-paola-klein-2|34c0bd4c44672dfddb7a76113dec7acb|2026-09-22T00Z",
  "source_fetch|person|ottilie-paola-klein-2|3f98f465866773da8158e561336e4729|2026-09-17T00Z",
  "source_fetch|person|ruppert-st-we|0547030eeafeb4e10867b6c61ba03a9d|2026-09-17T00Z",
  "source_fetch|person|ruppert-st-we|539792c4eebb864487c3ce472dff2172|2026-09-22T00Z"
]);
const ERFOLGREICH_KEYS = Object.freeze([
  "source_fetch|geteilt|6497d073fffa6dd2572c7422f7c24ff1|2026-09-22T08Z",
  "source_fetch|geteilt|8317ecb7a4447be7e04be195d1ba0afc|2026-09-22T08Z",
  "source_fetch|geteilt|f44e4ddc33280e15ae91245cdb2a96d0|2026-09-22T08Z",
  "source_fetch|person|annika-klose|152252de810e5b468f0322e9f6fa2b85|2026-09-22T00Z",
  "source_fetch|person|annika-klose|d5fef451498e1d218034c19f87cfd0f3|2026-09-17T00Z"
]);
const FORTSETZUNG = Object.freeze({
  key: "quellenvorlauf500-20260922-b",
  originalRunId: "35725341566",
  zielHash: "dda70a02c9918d73a7ae45b7ab4febd6bae5a1df0a4d3fc65b9a260c62bcdfc6",
  planHash: "105d85aa8a7a9b42e52471fec39695a6aad483d84bb19889e2b762ab321633a2",
  restAnzahl: REST_KEYS.length,
  restHash: "b766750a0d5e1b7478c4e3e3a7e7a8e612d867e9cda1c9b5bdd730d642b7b265",
  restKeys: REST_KEYS,
  erfolgreichKeys: ERFOLGREICH_KEYS
});
// Eine Vertagung zeigt auf das Ende der Kalenderminute; mehr als ~65 s sind nie noetig.
const MAX_WARTEN_MS = 65000;
// Damit das 20-min-Budget nach dem Warten sicher reicht, bleibt diese Reserve frei.
const REST_RESERVE_MS = 60000;
const schlafe = ms => new Promise(r => setTimeout(r, ms));

// ── GEZIELT TESTBARE FORTSETZUNGS-PRUEFUNGEN ────────────────────────────────────────────────
// An den eingefrorenen Plan gebunden; ein Frischefensterwechsel oder sonstiger Planunterschied
// stoppt VOR jedem Abruf — kein stiller Wechsel auf einen neuen Plan.
function pruefeFortsetzung(plan) {
  D.fordere(plan.ziel.zielHash === FORTSETZUNG.zielHash, "quellenvorlauf-fortsetzung-zielhash-abweichend");
  D.fordere(plan.planHash === FORTSETZUNG.planHash, "quellenvorlauf-fortsetzung-planhash-abweichend");
  const erlaubt = new Set(FORTSETZUNG.restKeys);
  const rest = plan.jobs.filter(j => erlaubt.has(j.idempotencyKey));
  D.fordere(rest.length === FORTSETZUNG.restAnzahl, "quellenvorlauf-fortsetzung-restmenge-abweichend");
  D.fordere(rest.every(j => !FORTSETZUNG.erfolgreichKeys.includes(j.idempotencyKey)),
    "quellenvorlauf-fortsetzung-erfolg-erneut");
  D.fordere(D.hash(rest.map(j => j.idempotencyKey).sort()) === FORTSETZUNG.restHash,
    "quellenvorlauf-fortsetzung-resthash-abweichend");
  return rest;
}

// Vor JEDEM Abruf: nur die freigegebene Restmenge, keiner der bereits erfolgreichen Auftraege.
function pruefeRestauftrag(job) {
  D.fordere(!FORTSETZUNG.erfolgreichKeys.includes(job.idempotencyKey), "quellenvorlauf-fortsetzung-erfolg-erneut");
  D.fordere(FORTSETZUNG.restKeys.includes(job.idempotencyKey), "quellenvorlauf-fortsetzung-fremder-auftrag");
}

// Genau EIN begrenzter Zusatzversuch NUR bei einer STRUKTURIERTEN Anbietervertagung
// (anbieterVertagung.wartenMs) — kein Textparsen, keine Schleife, keine automatische Wiederholung.
// Ohne `aktiv` ist das Verhalten identisch zum bisherigen direkten Handleraufruf.
// Woher die strukturierte Vertagung kommt, entscheidet `vertagungAus`: standardmaessig traegt
// der Fehler sie selbst (`error.anbieterVertagung`); der Fortsetzungsmodus liest sie aus dem
// Abrufergebnis, weil der bestehende Handler sie bewusst NICHT am Fehler traegt.
async function versuchMitVertagung(erst, { aktiv = false, jetzt, ende, guard = null,
  schlafe: schlafeFn = schlafe, vertagungAus = null } = {}) {
  const liesVertagung = fehler => (typeof vertagungAus === "function"
    ? vertagungAus(fehler) : ((fehler && fehler.anbieterVertagung) || null));
  try {
    return { ok: true, wert: await erst() };
  } catch (e) {
    const v = aktiv ? liesVertagung(e) : null;
    const wartenMs = v && Number.isFinite(Number(v.wartenMs))
      ? Math.max(0, Math.min(Number(v.wartenMs), MAX_WARTEN_MS)) : null;
    // Zeitbudget: nach dem Warten muss die sichere Restzeit noch reichen.
    if (wartenMs === null || !(jetzt().getTime() + wartenMs + REST_RESERVE_MS < ende)) {
      return { ok: false, fehler: e, vertagung: Boolean(v) };
    }
    await schlafeFn(wartenMs);
    if (typeof guard === "function") await guard();   // Schutzguards nach dem Warten erneut
    try {
      return { ok: true, wert: await erst(), zusatzversuch: true };
    } catch (e2) {
      return { ok: false, fehler: e2, zusatzversuch: true, vertagung: Boolean(aktiv && liesVertagung(e2)) };
    }
  }
}

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

async function bauePlan({ bestand, bestandsauswahl, env = process.env, now = () => new Date(), deps = {}, fortsetzung = false } = {}) {
  D.pruefeSnapshot(bestand, "500-ruhend");
  const ziel = R.pruefe(bestand, bestandsauswahl);
  D.fordere(String(env.HELMUT_SOURCE_MODE || "").trim().toLowerCase() === "on",
    "quellenvorlauf-source-mode-nicht-bestaetigt");
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
  const vollstaendig = {
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
  if (!fortsetzung) return vollstaendig;

  const rest = pruefeFortsetzung(vollstaendig);
  return {
    ...vollstaendig,
    fortsetzung: true,
    restAnzahl: rest.length,
    jobs: rest,
    sourceFetch: rest.length,
    geteilt: rest.filter(j => j.tenantId == null).length,
    persoenlich: rest.filter(j => j.tenantId != null).length
  };
}

async function ausfuehren({ bestand, bestandsauswahl, env = process.env, now = () => new Date(),
  pruefeBetrieb = async () => {}, snapshot = async () => bestand, execute = false,
  fortschritt = null, deps = {}, fortsetzung = null } = {}) {
  const start = now();
  D.fordere(start instanceof Date && Number.isFinite(start.getTime()), "quellenvorlauf-uhr-ungueltig");
  const istFortsetzung = fortsetzung === null
    ? String(env.HELMUT_QUELLENVORLAUF_FORTSETZUNG || "").trim() === "1"
    : fortsetzung === true;
  const runKey = istFortsetzung ? FORTSETZUNG.key : RUN_KEY;
  const plan = await (deps.bauePlan || bauePlan)({ bestand, bestandsauswahl, env, now, deps, fortsetzung: istFortsetzung });
  const report = {
    ok: true,
    reinLesend: !execute,
    ausgeloest: false,
    fortsetzung: istFortsetzung,
    quittungsschluessel: runKey,
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
  // ENGE Schutzprojektion (lib/helmut/testkohorte-direkt500.js): schuetzt Identitaet, Zugriff
  // und Fachinhalt. Reine Auth-Laufzeitmetadaten (Sessions, Nutzungszeitstempel, Revision,
  // Kosten-/Fehlertelemetrie) duerfen sich waehrend des Laufs legitim aendern und loesen hier
  // KEINEN Abbruch mehr aus. `D.pruefeSnapshot(after, "500-ruhend")` bleibt unveraendert
  // vorgeschaltet; Zielmenge, Kohorteninhalt und 504/0 bleiben damit fail closed.
  const schutzProjektion = s => D.hash(D.quellenvorlaufSchutzprojektion(s));
  const protectionBefore = schutzProjektion(await snapshot());
  let locked = false, claimed = false, quittiert = false;
  const verstehen = new Map();
  const ergebnisse = [];
  const runId = String(env.GITHUB_RUN_ID);
  const owner = "quellenvorlauf-" + runId;
  // Zusatzbindung der Fortsetzung (identisch in Start- und Abschlussquittung).
  const bindung = istFortsetzung
    ? { originalRunId: FORTSETZUNG.originalRunId, restHash: FORTSETZUNG.restHash, restAnzahl: FORTSETZUNG.restAnzahl }
    : {};

  try {
    locked = await (deps.acquireLock
      ? deps.acquireLock(LOCK, MAX_MS + 120000)
      : storage.acquirePipelineLock(LOCK, MAX_MS + 120000));
    D.fordere(locked === true, "quellenvorlauf-bereits-aktiv");

    const guard = async (reserve, voll = false) => {
      D.fordere(now().getTime() + reserve < ende, "quellenvorlauf-zeitbudget");
      D.fordere(now().toISOString().slice(0, 10) === start.toISOString().slice(0, 10),
        "quellenvorlauf-tageswechsel");
      if (typeof deps.pruefeNullAktive === "function") {
        D.fordere(await deps.pruefeNullAktive() === true, "quellenvorlauf-profil-aktiviert");
      } else {
        const kurz = await snapshot();
        D.pruefeSnapshot(kurz, "500-ruhend");
      }
      if (voll) {
        await pruefeBetrieb(LOCK);
        const s = await snapshot();
        D.pruefeSnapshot(s, "500-ruhend");
        D.fordere(R.pruefe(s, bestandsauswahl).zielHash === plan.ziel.zielHash,
          "quellenvorlauf-zielmenge-veraendert");
      }
    };
    await guard(120000, true);
    D.fordere(typeof deps.claimRun === "function" && typeof deps.finishRun === "function",
      "quellenvorlauf-quittungsadapter-fehlt");
    claimed = await deps.claimRun({
      version: 1, key: runKey, runId, commit: env.GITHUB_SHA || null,
      zielHash: plan.ziel.zielHash, planHash: plan.planHash,
      status: "laeuft", gestartetAm: start.toISOString(),
      sourceFetchGeplant: plan.jobs.length, maxSourceFetch: MAX_SOURCE_FETCH,
      modellaufrufe: 0, ...bindung
    });
    D.fordere(claimed === true, "quellenvorlauf-bereits-verwendet");

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

    // FORTSETZUNG: der bestehende Handler traegt die STRUKTURIERTE Anbietervertagung nicht am
    // Fehler (sein Verhalten bleibt bewusst UNVERAENDERT). Sie wird daher hier — ausschliesslich
    // im Fortsetzungsmodus und ohne jede Aenderung an Handler, Worker oder Anbietersteuerung —
    // aus dem Abrufergebnis abgegriffen. Kein Textparsen, kein Eingriff in andere Aufrufer.
    let letzteVertagung = null;
    const crawlAllSourcesRoh = base.crawlAllSources;
    if (istFortsetzung && typeof crawlAllSourcesRoh === "function") {
      base.crawlAllSources = async (...args) => {
        const bilanz = await crawlAllSourcesRoh(...args);
        const treffer = (bilanz && Array.isArray(bilanz.results) ? bilanz.results : [])
          .map(r => r && r.anbieterVertagung).find(Boolean) || null;
        if (treffer) letzteVertagung = treffer;
        return bilanz;
      };
    }

    let stop = null;
    await mapBounded(plan.jobs, PARALLEL, async (job, index) => {
      if (stop) return null;
      // FORTSETZUNG: vor jedem Abruf beweisen, dass der Auftrag zur freigegebenen Restmenge
      // gehoert und keiner der bereits erfolgreichen Auftraege erneut laeuft.
      if (istFortsetzung) pruefeRestauftrag(job);
      const auftrag = {
        ...job,
        id: "quellenvorlauf-" + runId + "-" + String(index + 1).padStart(3, "0"),
        createdAt: start.toISOString()
      };
      const bewerte = (r) => {
        const ok = r?.ok === true && r?.zurueckgestellt !== true;
        return {
          idempotencyKey: job.idempotencyKey,
          quelleId: job.payload.quelle.id,
          tenantId: job.tenantId || null,
          ok,
          grund: ok ? null : String(r?.grund || "nicht-bestaetigt").slice(0, 160),
          neueRohdokumente: Number(r?.neueRohdokumente || 0),
          bereitsVorhanden: Number.isFinite(r?.bereitsVorhanden) ? r.bereitsVorhanden : null,
          verstehenNeu: Number(r?.verstehenNeu || 0)
        };
      };
      let versuch;
      try {
        await guard(90000, index % 10 === 0);
        versuch = await versuchMitVertagung(() => {
          if (istFortsetzung) letzteVertagung = null;
          return handler(auftrag, base);
        }, {
          aktiv: istFortsetzung, jetzt: now, ende, guard: () => guard(90000, false),
          vertagungAus: () => letzteVertagung
        });
      } catch (e) {
        versuch = { ok: false, fehler: e, vertagung: false };
      }
      if (versuch.ok) {
        ergebnisse[index] = { ...bewerte(versuch.wert), ...(versuch.zusatzversuch ? { zusatzversuch: true } : {}) };
      } else {
        const message = String(versuch.fehler?.message || versuch.fehler || "unbekannt").slice(0, 200);
        ergebnisse[index] = { idempotencyKey: job.idempotencyKey, quelleId: job.payload.quelle.id,
          tenantId: job.tenantId || null, ok: false, grund: message,
          neueRohdokumente: 0, bereitsVorhanden: null, verstehenNeu: 0,
          ...(versuch.zusatzversuch ? { zusatzversuch: true } : {}),
          ...(versuch.vertagung ? { vertagung: true } : {}) };
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
    quittiert = await deps.finishRun({
      version: 1, key: runKey, runId, commit: env.GITHUB_SHA || null,
      zielHash: plan.ziel.zielHash, planHash: plan.planHash, ...bindung,
      status: report.ok ? "abgeschlossen" : "teilweise",
      beendetAm: now().toISOString(),
      sourceFetchGeplant: plan.jobs.length,
      sourceFetchVersucht: report.sourceFetchVersucht,
      sourceFetchBestaetigt: report.sourceFetchBestaetigt,
      sourceFetchFehlgeschlagen: report.sourceFetchFehlgeschlagen,
      neueRohdokumente: report.neueRohdokumente,
      understandingAuftraegeVorbereitet: report.understandingAuftraegeVorbereitet,
      understandingDokumente: report.understandingDokumente,
      understandingEingereiht: 0, modellaufrufe: 0
    });
    D.fordere(quittiert === true, "quellenvorlauf-quittung-unbekannt");
    report.quittung = runKey;

    if (locked) {
      await (deps.releaseLock ? deps.releaseLock(LOCK) : storage.releasePipelineLock(LOCK));
      locked = false;
    }
    await pruefeBetrieb();
    const after = await snapshot();
    D.pruefeSnapshot(after, "500-ruhend");
    D.fordere(schutzProjektion(after) === protectionBefore, "quellenvorlauf-schutzbestand-veraendert");
    D.fordere(R.pruefe(after, bestandsauswahl).zielHash === plan.ziel.zielHash,
      "quellenvorlauf-zielmenge-veraendert");
    return report;
  } catch (e) {
    if (claimed && !quittiert && typeof deps.finishRun === "function") {
      try {
        quittiert = await deps.finishRun({
          version: 1, key: runKey, runId, commit: env.GITHUB_SHA || null,
          zielHash: plan.ziel.zielHash, planHash: plan.planHash, ...bindung,
          status: "gestoppt", beendetAm: now().toISOString(),
          grund: e instanceof D.DirektAbbruch ? e.grund : String(e?.message || "quellenvorlauf-fehler").slice(0, 160),
          sourceFetchGeplant: plan.jobs.length,
          sourceFetchVersucht: ergebnisse.filter(Boolean).length,
          sourceFetchBestaetigt: ergebnisse.filter(x => x?.ok).length,
          sourceFetchFehlgeschlagen: ergebnisse.filter(x => x && !x.ok).length,
          neueRohdokumente: ergebnisse.reduce((n, x) => n + Number(x?.neueRohdokumente || 0), 0),
          understandingAuftraegeVorbereitet: verstehen.size,
          understandingDokumente: [...verstehen.values()].reduce((n, x) => n + x.payload.dokumentIds.length, 0),
          understandingEingereiht: 0, modellaufrufe: 0
        }) === true;
      } catch (_) { quittiert = false; }
    }
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
      automatischeWiederholung: false,
      quittung: quittiert ? runKey : null,
      zustandUnbekannt: claimed && !quittiert
    };
  } finally {
    if (locked) {
      try { await (deps.releaseLock ? deps.releaseLock(LOCK) : storage.releasePipelineLock(LOCK)); } catch (_) {}
    }
  }
}

module.exports = { bauePlan, ausfuehren, pruefeFortsetzung, pruefeRestauftrag, versuchMitVertagung,
  LOCK, RUN_KEY, FORTSETZUNG, MAX_WARTEN_MS, REST_RESERVE_MS, MAX_SOURCE_FETCH, MAX_MS, PARALLEL };
