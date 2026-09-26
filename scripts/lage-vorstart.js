"use strict";
// Ein manueller, einmaliger Vorstartcheck. Keine Aktivierung, kein500er Lauf.
const crypto = require("node:crypto");
const { hash, profilHash } = require("../lib/helmut/briefing-speicher");
const QUITTUNG = "lage-vorstart-20260926-a", TAG = "2026-09-26";
const MAX_MS = 240000, MAX_USD = 0.50;
const fordere = (ok, grund) => { if (!ok) throw new Error("lage-vorstart-" + grund); };
const bindung = p => hash({ id:p.id, profilHash:profilHash(p) });
function konfiguration(env, commit, jetzt = Date.now()) {
  fordere(/^[a-f0-9]{40}$/.test(commit || "") && env.HELMUT_VORSTART_COMMIT === commit
    && env.GITHUB_SHA === commit && env.GITHUB_ACTIONS === "true"
    && env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === "refs/heads/main"
    && env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_RUN_ATTEMPT === "1", "runtime");
  fordere(/^[a-f0-9]{64}$/.test(env.HELMUT_VORSTART_PROFIL || "")
    && /^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID || ""), "bindung");
  fordere(new Date(jetzt).toISOString().slice(0,10) === TAG
    && new Date(jetzt + MAX_MS).toISOString().slice(0,10) === TAG, "tag");
  return { commit, profilHash:env.HELMUT_VORSTART_PROFIL, runId:"nachlauf500-" + env.GITHUB_RUN_ID };
}
function pruefeAufruf({ calls, start, jetzt, kosten, laufkosten, reserve, bestand, grundlinie }) {
  fordere(Number.isInteger(calls) && calls >= 0 && calls < 2, "aufrufgrenze");
  fordere(jetzt >= start && jetzt - start < MAX_MS - 60000
    && new Date(jetzt).toISOString().slice(0,10) === TAG, "restzeit");
  fordere(kosten?.startklar === true && kosten.offeneReservierungen === 0
    && kosten.limitUsd === 4 && Number.isFinite(kosten.gebundenUsd)
    && kosten.gebundenUsd >= 0 && Number.isFinite(reserve) && reserve > 0
    && Number.isFinite(laufkosten) && laufkosten >= 0
    && laufkosten + reserve <= MAX_USD && kosten.gebundenUsd + reserve < 4, "kosten");
  fordere(typeof grundlinie === "string" && bestand === grundlinie, "profilbestand");
}
async function einmallauf(cfg, d) {
  const start = d.now(), grundlinie = await d.ruhe(), profile = await d.profile();
  fordere(profile?.id && bindung(profile) === cfg.profilHash, "profil");
  fordere(!await d.cache(profile.id), "bestehender-tagessatz");
  const vorschau = await d.vorschau(profile);
  fordere(vorschau?.available === true && vorschau.pendingNarrative === true
    && vorschau.vorgaenge?.length >= 2,"quellen-vorpruefung");
  let calls = 0;
  const pruefe = async () => {
    const [kosten,laufkosten,bestand] = await Promise.all([d.kosten(),d.laufkosten(),d.bestand()]);
    pruefeAufruf({ calls,start,jetzt:d.now(),kosten,laufkosten,reserve:d.reserve,bestand,grundlinie });
  };
  await pruefe();
  if (!d.execute) return { ok:true, plan:true, profile:1, maxAufrufe:2,maxUsd:MAX_USD,maxMs:MAX_MS,
    vorgangskarten:vorschau.vorgaenge.length,profilHash:cfg.profilHash };
  const lock = await d.acquire();
  fordere(lock?.granted === true && lock.active === true, "sperre");
  let claimed = false;
  const receipt = { quittungsschluessel:QUITTUNG,runId:cfg.runId,idHash:cfg.profilHash,
    runtimeCommit:cfg.commit,gestartetAm:new Date(start).toISOString(),maxUsd:MAX_USD,maxMs:MAX_MS,maxAufrufe:2 };
  let out = { ok:false,grund:"technischer-fehler" };
  try {
    fordere(await d.claim({ ...receipt,status:"laeuft" }), "verbraucht"); claimed = true;
    const result = await d.build(profile,{ missingOnly:true,costRunId:cfg.runId,
      beforeGenerate:async id => { fordere(id === profile.id,"fremdes-profil"); await pruefe(); calls++; } });
    const saved = await d.cache(profile.id);
    const ok = result?.available === true && result.fromCache === false && calls === 2
      && d.gueltig(saved?.payload);
    out = { ok,grund:ok ? null : (result?.reason || "kein-gueltiger-tagessatz"),
      abschnitte:result?.paragraphs?.length || 0,gespeichert:ok,inhaltHash:saved?.payload ? hash(saved.payload) : null };
  } finally {
    await d.release();
    const [nach,kosten,laufkosten] = await Promise.all([d.ruhe(),d.kosten(),d.laufkosten()]);
    fordere(nach === grundlinie,"profilbestand");
    fordere(kosten.offeneReservierungen === 0 && laufkosten <= MAX_USD,"nachkosten");
    out = { ...out,freigegebeneAufrufe:calls,laufkostenUsd:laufkosten,profileUnveraendert:true,
      funktionsnachweis500:false,automatischeWiederholung:false };
    if (claimed) await d.finish({ ...receipt,...out,status:out.ok ? "abgeschlossen" : "gestoppt",
      beendetAm:new Date(d.now()).toISOString() });
  }
  return out;
}
async function main(args = process.argv.slice(2), env = process.env) {
  fordere(args.length === 1 && ["--plan","--execute"].includes(args[0]),"argumente");
  const B = require("./verstehen-einmalig-169"), cfg = konfiguration(env,B.echterCommit());
  const S = require("../lib/helmut/storage"), K = require("../lib/helmut/testkosten-budget");
  const execute = args[0] === "--execute";
  fordere(!execute || env.HELMUT_VORSTART_FREIGABE === "EIN_PROFIL_LAGE_MAX_ZWEI_AUFRUFE","freigabe");
  fordere(S.v3StoreReady() && S.profileDbModeEnabled() && S.profileDbExclusiveEnabled()
    && K.aktiv(env) && env.HELMUT_UNDERSTANDING_LOCK === "on" && env.HELMUT_ATOMIC_LOCK === "on"
    && env.HELMUT_TESTLAUF_KOMMUNIKATION === "gesperrt" && !env.HELMUT_LAGE_DEMO,"umgebung");
  if (execute) { const ai = require("../lib/helmut/ai");
    fordere(ai.isAiEnabled() && ai.aiProviderName() === "azure" && ai.understandingModelName() === "gpt-5-mini","modell"); }
  const read = async (table,query) => {
    const r = await fetch(env.SUPABASE_URL.replace(/\/$/,"") + "/rest/v1/" + table + "?" + query,
      { redirect:"error",signal:AbortSignal.timeout(15000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer " + env.SUPABASE_SERVICE_ROLE_KEY} });
    fordere(r.status === 200,"lesen");const rows = await r.json();fordere(Array.isArray(rows),"leseformat");return rows;
  };
  let profiles;
  const bestand = async () => {
    const [m,p] = await Promise.all([read("mandate_profiles","select=*&order=user_id.asc&limit=505"),read("profiles","select=*&order=id.asc&limit=506")]);
    fordere(m.length === 500 && p.length === 501 && m.every(r => r.aktiv === false && r.geloescht_at === null),"bestand");
    profiles = m.map(r => S.fromMandateProfileRow(p.find(x => x.id === r.user_id),r));
    return crypto.createHash("sha256").update(JSON.stringify({m,p})).digest("hex");
  };
  const ruhe = async () => {
    const now = encodeURIComponent(new Date().toISOString());
    const [h,j,l,c,a,runs] = await Promise.all([bestand(),
      read("helmut_jobs","select=id&or=(status.neq.erledigt,lease_expires_at.gt."+now+")&limit=1"),
      read("pipeline_locks","select=job_name&expires_at=gt."+now+"&limit=1"),
      read("helmut_verstehen_reservierungen","select=vorgang_id&lease_bis=gt."+now+"&limit=1"),S.readAuthStore(),
      read("process_runs","select=run_id&finished_at=is.null&started_at=gt."
        +encodeURIComponent(new Date(Date.now()-30*60000).toISOString())+"&limit=1")]);
    fordere(!j.length && !l.length && !c.length && !runs.length
      && !Object.values(a.pipelineLocks || {}).some(x => x?.expiresAt > Date.now()),"parallelbetrieb");return h;
  };
  fordere(!(await read("helmut_store","select=id&id=eq."+QUITTUNG+"&limit=1")).length,"verbraucht");
  fordere(await K.laufGebundenUsd(cfg.runId,{env}) === 0,"laufkosten-vorhanden");
  const q = execute ? B.quittungsAdapter(env) : null;
  const timer = execute ? setTimeout(() => { console.error("lage-vorstart-harte-laufzeit; kein Retry");process.exit(1); },MAX_MS) : null;
  try {
    const result = await einmallauf(cfg,{ execute,now:Date.now,ruhe,bestand,
      profile:async () => { const found = profiles.filter(p => bindung(p) === cfg.profilHash);fordere(found.length === 1,"auswahl");return found[0]; },
      kosten:async () => K.pruefeStart(await S.readAuthStore(),TAG,await S.leseLlmTageszaehler(new Date().toISOString())),
      laufkosten:() => K.laufGebundenUsd(cfg.runId,{env}),reserve:K.reservierungHoeheUsd(),
      cache:id => S.getRenderedBriefingV3(id,"lage",require("../lib/helmut/briefing-frische").berlinTagKey(new Date()),{strict:true}),
      acquire:() => S.acquireGlobalUnderstandingLock(MAX_MS+60000),release:() => S.releaseGlobalUnderstandingLock(),
      claim:d => q.claimRun(d),finish:d => q.finishRun(d),build:require("../lib/helmut/lage").buildLageBriefing,
      vorschau:p => require("../lib/helmut/lage").buildLageBriefing(p,{cacheOnly:true}),
      gueltig:require("../lib/helmut/lage-quellenbeleg").gespeicherterTextGueltig });
    console.log(JSON.stringify(result,null,2));return result.ok ? 0 : 1;
  } finally { if (timer) clearTimeout(timer); }
}
if (require.main === module) main().then(c => { process.exitCode=c; }).catch(e => {
  console.log(JSON.stringify({ok:false,grund:/^lage-vorstart-[a-z-]+$/.test(e.message || "") ? e.message : "lage-vorstart-technischer-fehler",automatischeWiederholung:false}));process.exitCode=1;
});
module.exports = {konfiguration,pruefeAufruf,einmallauf,bindung,main};
