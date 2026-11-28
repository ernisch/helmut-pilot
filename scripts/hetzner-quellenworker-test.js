"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { betreibe, einmal, konfigurationsfehler, pruefeEinmalZiel, pruefeProduktionsstand } = require("../worker");

async function pruefeSchleife() {
  const stunden = [6, 6, 6, 6, 7, 7, 7, 7], minuten = [29, 30, 31, 45, 0, 29, 30, 45];
  // 06:45 bis 07:30 Berliner Zeit ist die redaktionelle Sperre. Im Winter
  // liegt der Schadenfall um 06:30 Berlin im Pruefslot vor dieser Sperre.
  const minutenBerlin = stunden.map((stunde, i) =>
    Date.UTC(2026, 10, 23, stunde - 1, minuten[i]));
  const controller = new AbortController();
  let index = 0;
  const gestartet = [], logs = [];
  await betreibe({ signal: controller.signal, jetzt: () => minutenBerlin[index],
    lauf: async () => {
      gestartet.push(index);
      if (index === 1) throw Object.assign(Error("https://test.invalid/?token=synthetisch"), { code: "ETIMEDOUT" });
      if (index === 6) throw { code: "synthetischer-token", name: "unbekannter-typ" };
      if (index === 7) controller.abort();
      return { ok: true, arbeitsfenster: {}, verarbeitung: { erledigt: 1 } };
    },
    pause: async ms => { assert(ms > 0 && ms <= 30000); assert(++index < stunden.length); },
    log: eintrag => logs.push(JSON.parse(eintrag)) });
  assert.deepEqual(gestartet, [1, 6, 7]);
  assert.deepEqual(logs[0], { dienst: "quellenworker", ereignis: "quellenfenster-fehler", fehlerklasse: "ETIMEDOUT" });
  assert.deepEqual(logs[1], { dienst: "quellenworker", ereignis: "quellenfenster-fehler", fehlerklasse: "unbekannt" });
  assert.equal(logs[2].erledigt, 1);
}

async function pruefeEinmalmodus(env) {
  assert.doesNotThrow(() => pruefeEinmalZiel(env));
  assert.throws(() => pruefeEinmalZiel({ ...env, HELMUT_CRAWL_EXECUTOR: "hetzner" }),
    /einmaltest-erfordert-standby/);
  const prod = "ddckuvvpcytqbyfmbvie.supabase.co";
  assert.throws(() => pruefeEinmalZiel({ ...env, HELMUT_WORKER_SUPABASE_HOST: prod }),
    /einmaltest-erfordert-testdatenbank/);
  const child = spawn(process.execPath, ["worker.js", "--once"],
    { env: { ...process.env, HELMUT_CRAWL_EXECUTOR: "", SUPABASE_URL: "" } });
  const fertig = once(child, "close");
  const meldungen = [];
  child.stderr.on("data", d => meldungen.push(d));
  assert.deepEqual(await fertig, [1, null]);
  assert.match(Buffer.concat(meldungen).toString(), /supabase-url-fehlt-oder-ungueltig/);

  const signal = new AbortController().signal;
  const jetzt = () => Date.UTC(2026, 10, 23, 5, 30);
  let starts = 0;
  const meldung = [];
  const ergebnis = { arbeitsfenster: {}, ok: true, lauf: { laufId: "testlauf" },
    lauftelemetrie: { ende: true, status: "success" }, verarbeitung: { erledigt: 1 } };
  const lauf = async () => { starts++; return ergebnis; };
  const log = wert => meldung.push(JSON.parse(wert));
  assert.equal(await einmal({ signal, jetzt, lauf, log }), true);
  assert.equal(starts, 1);
  assert.equal(meldung[0].quittungGespeichert, true);
  ergebnis.lauftelemetrie.ende = false;
  assert.equal(await einmal({ signal, jetzt, lauf, log }), false);
  await assert.rejects(einmal({ signal, jetzt: () => Date.UTC(2026, 10, 23, 5, 45), lauf, log }),
    /ausserhalb-quellenarbeitsfenster/);
  assert.equal(starts, 2);
}

function pruefeCronRoute() {
  process.env.HELMUT_CRAWL_EXECUTOR = "hetzner";
  process.env.CRON_SECRET = "lokaler-testwert";
  const handler = require("../server");
  function aufruf(url, authorization, method = "GET") {
    return new Promise(resolve => {
      const req = { url, method, headers: { host: "localhost", authorization } };
      const res = { writeHead(status) { this.status = status; },
        end(body) { resolve({ status: this.status, body: JSON.parse(body) }); } };
      handler(req, res);
    });
  }
  return Promise.all([
    aufruf("/api/cron/crawl?arbeitsfenster=1&betrieb=24h", "Bearer lokaler-testwert"),
    aufruf("/api/cron/crawl", "Bearer falsch"),
    aufruf("/api/cron/worker-weck", "Bearer lokaler-testwert", "POST"),
    aufruf("/api/cron/quellen-operator", "Bearer lokaler-testwert", "POST")
  ]).then(([crawl, verweigert, weck, operator]) => {
    assert.deepEqual(crawl, { status: 200,
      body: { ok: true, uebersprungen: true, grund: "quellenlauf-auf-hetzner" } });
    assert.equal(verweigert.status, 403);
    for (const result of [weck, operator]) {
      assert.equal(result.status, 503);
      assert.equal(result.body.verarbeitet, false);
    }
  });
}

async function pruefeProzess() {
  const env = { ...process.env, HELMUT_CRAWL_EXECUTOR: "", SUPABASE_URL: "" };
  const child = spawn(process.execPath, ["worker.js"], { env });
  const fertig = once(child, "exit");
  const [ausgabe] = await once(child.stdout, "data");
  assert.match(String(ausgabe), /"ereignis":"standby"/);
  assert.equal(child.kill("SIGTERM"), true);
  assert.deepEqual(await fertig, [0, null]);
}

async function pruefeWiederaufnahme() {
  const W=require("../lib/helmut/quellen-wiederaufnahme");
  // Deklarierte synthetische Fehlerzustandsfixture, keine Modellantwort oder Originalquittung.
  const zeit=Date.parse("2026-11-28T12:00:00Z"),tag="2026-11-28",id="00000000-0000-4000-8000-000000000001";
  const r={run_id:"cron-crawl-synthetisch",process:"warteschlange-crawl",status:"failed",error_class:"warteschlange-nicht-verfuegbar",
    location:"hetzner-de",reason:null,started_at:tag+"T08:00:00Z",finished_at:tag+"T08:01:59Z",commit_ref:"b".repeat(40),
    target_count:23,processed_count:1,deferred_count:19,failed_count:2,telemetrie:{wiederholt:0,leaseVerloren:0}};
  const basis={version:1,auftrag:{tag,auftragId:id},ziel:{jobId:id,runId:r.run_id},commit:"a".repeat(40),gelesenAm:new Date(zeit).toISOString(),
    limits:{aufrufe:100,reserve:0,originale:16,tagUsd:1,gesamtUsd:30},
    codeHashes:Object.fromEntries(["worker.js","lib/helmut/quellen-arbeitsfenster.js","lib/helmut/quellen-wiederaufnahme.js","lib/helmut/quellen-automatik.js"].map(f=>[f,"c".repeat(64)])),
    stand:{job:{id,job_type:"source_fetch",tenant_id:null,status:"laeuft",finished_at:null,attempts:1,max_attempts:3,lease_owner:r.run_id+"-worker",
      lease_expires_at:tag+"T08:06:48Z",updated_at:tag+"T08:01:48Z",payload:{quelle:{id:"synthetische-quelle",retrievalPathId:"synthetischer-pfad"}}},
      laufend:[{id}],laeufe:[r,...Array.from({length:29},(_,i)=>({...r,run_id:"cron-crawl-alt-"+i,status:"partial"}))],
      zaehler:[{day:tag,scope:"global",used:100}],geld:{buchHash:"d".repeat(64),heutigeAbgerechneteAufrufe:100,offeneHeute:0},
      ressourcen:[{schluessel:"quellenarbeit|fenster",verbraucht:30},{schluessel:"quellenarbeit|reservierte-sekunden",verbraucht:9000},
        {schluessel:"quellenarbeit|originalabrufe",verbraucht:6},...Array.from({length:30},(_,i)=>({schluessel:"quellenarbeit|slot|"+i,verbraucht:1}))]}};
  function fall(aendere){const b=structuredClone(basis);aendere?.(b);b.digest=W.digest(b);return b;}
  let checks=0;const gut=fall();W.pruefeBindung(gut.auftrag,gut,zeit);checks++;
  for(const aendere of [b=>b.stand.job.job_type="document_understanding",b=>b.stand.job.attempts=3,
    b=>b.stand.job.lease_expires_at=new Date(zeit+1).toISOString(),b=>b.stand.job.lease_owner="anderer-worker",
    b=>b.stand.laufend.push({id:"anderer"}),b=>b.stand.laeufe[0].status="success",b=>b.stand.laeufe[0].target_count=22,
    b=>b.stand.laeufe[0].telemetrie.leaseVerloren=1,b=>b.stand.laeufe[1].status="running",
    b=>b.stand.zaehler[0].used=99,b=>b.stand.geld.offeneHeute=1,b=>b.limits.aufrufe=101,b=>b.limits.originale=17,
    b=>b.stand.ressourcen[0].verbraucht=31,b=>b.stand.ressourcen[1].verbraucht=9300,
    b=>b.gelesenAm=new Date(zeit-300001).toISOString(),b=>b.gelesenAm=new Date(zeit+1).toISOString()]){
    const b=fall(aendere);assert.throws(()=>W.pruefeBindung(b.auftrag,b,zeit),/wiederaufnahme-/);checks++;
  }
  const verfremdet=fall();verfremdet.digest="f".repeat(64);assert.throws(()=>W.pruefeBindung(verfremdet.auftrag,verfremdet,zeit),/digest/);checks++;
  assert.throws(()=>W.pruefeBindung(gut.auftrag,gut,zeit+86400000),/tag/);checks++;
  assert.deepEqual(await W.pruefeLive(gut.auftrag,gut,{jetzt:()=>zeit,lese:async()=>fall()}),{bereit:true});checks++;
  for(const mutate of [b=>b.stand.geld.buchHash="e".repeat(64),b=>b.stand.job.updated_at="2026-11-28T08:01:49Z",b=>b.commit="e".repeat(40)]){
    await assert.rejects(W.pruefeLive(gut.auftrag,gut,{jetzt:()=>zeit,lese:async()=>fall(mutate)}),/vorwert-drift/);checks++;
  }
  let now=zeit;
  await assert.rejects(W.pruefeLive(gut.auftrag,gut,{jetzt:()=>now,lese:async()=>{now+=300001;return gut;}}),/bindung-abgelaufen/);checks++;
  await assert.rejects(W.pruefeLive(gut.auftrag,gut,{jetzt:()=>zeit,lese:async()=>{throw Error("synthetischer DB-Ausfall");}}),/DB-Ausfall/);checks++;
  assert.throws(()=>require("../worker").quellenlauf({adminAuftrag:gut.auftrag}),/wiederaufnahme-auftrag/);checks++;
  const success={ok:true,lauftelemetrie:{start:true,ende:true,status:"success"}};
  assert.equal(W.ausgangBestaetigt(success),true);checks++;
  for(const bad of [{...success,ok:false},{...success,lauftelemetrie:{...success.lauftelemetrie,start:false}},
    {...success,lauftelemetrie:{...success.lauftelemetrie,ende:false}},
    {...success,reason:"blob-spiegel-fehlgeschlagen"},
    {...success,verarbeitung:{blobSpiegel:{geschrieben:false}}},
    {...success,verarbeitung:{blobSpiegel:{verworfen:1}}},
    {...success,lauftelemetrie:{...success.lauftelemetrie,fehlerklasse:"unbekannt"}},
    ...["lease-verloren","vertagung-unbestaetigt","auftragsausgang-unbestaetigt","auftraege-endgueltig-fehlgeschlagen"]
      .map(fehlerklasse=>({...success,lauftelemetrie:{...success.lauftelemetrie,status:"partial",fehlerklasse}}))]){
    assert.equal(W.ausgangBestaetigt(bad),false);checks++;
  }
  // Echter CLI-Kindprozess mit deklarierter nativer Ersatzantwort. Kein DB/Provider.
  for(const [native,exit] of [[success,0],[{ok:false,lauftelemetrie:{start:true,ende:true,status:"partial",fehlerklasse:"auftragsausgang-unbestaetigt"}},2],
    [{ok:true,lauftelemetrie:{start:true,ende:false,status:"success"}},2],
    [{...success,verarbeitung:{blobSpiegel:{geschrieben:false}}},2]]){
    const file=require.resolve("../lib/helmut/quellen-wiederaufnahme");
    const childCode=`const M=require('node:module'),load=M._load,file=${JSON.stringify(file)};
      process.argv=[process.execPath,file,'--freigeben'];Date.now=()=>${zeit};
      M._load=function(id,parent,isMain){if(parent?.filename===file&&id==='../../worker')return{quellenlauf:async()=>(${JSON.stringify(native)})};return load.apply(this,arguments);};
      M._load(file,null,true);`;
    const child=spawnSync(process.execPath,["-e",childCode],{input:JSON.stringify(gut),encoding:"utf8",timeout:5000});
    assert.equal(child.status,exit,child.stderr);assert.deepEqual(JSON.parse(child.stdout).nativeAntwort,native);checks++;
  }
  console.log("PASS "+checks+" gezielte Wiederaufnahme-Bindungen; keine Netzwerk-/Modellaufrufe");
}

async function main() {
  const env = {
    SUPABASE_URL: "https://testprojekt.supabase.co",
    HELMUT_WORKER_SUPABASE_HOST: "testprojekt.supabase.co",
    HELMUT_STORAGE_BACKEND: "supabase",
    SUPABASE_SERVICE_ROLE_KEY: "testwert",
    HELMUT_QUELLEN_ARBEITSFENSTER: "on",
    HELMUT_QUELLEN_FENSTER_TAG: "8",
    HELMUT_QUELLEN_SEKUNDEN_TAG: "2400",
    HELMUT_ORIGINALABRUFE_TAG: "16",
    AZURE_OPENAI_ENDPOINT: "https://testing.openai.azure.com",
    AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
    AZURE_OPENAI_KEY: "testwert",
    HELMUT_BETRIEBSKOSTENVERTRAG_JSON: JSON.stringify({
      version: 1, profileId: "testprofil", startsAt: "2026-11-23T00:00:00.000Z",
      dailyLimitUsd: 1, totalLimitUsd: 30, route: { provider: "azure",
        responsesUrl: "https://testing.openai.azure.com/openai/v1/responses", model: "gpt-5-mini" }
    })
  };
  assert.equal(konfigurationsfehler(env), null);
  const prod = { ...env, HELMUT_WORKER_SUPABASE_HOST: "ddckuvvpcytqbyfmbvie.supabase.co",
    HELMUT_VERSTEHEN_CAS: "on", HELMUT_SOURCE_TELEMETRY: "on", HELMUT_COMMIT_SHA: "a".repeat(40) };
  assert.equal(await pruefeProduktionsstand(env, () => assert.fail("Kein Produktionscheck im Testprojekt")), null);
  assert.equal(await pruefeProduktionsstand(prod, async () => [{ id: "testprofil", profileActive: true }]), null);
  assert.equal(await pruefeProduktionsstand(prod, async () => []), "betriebskosten-profilbindung-abweichend");
  assert.equal(await pruefeProduktionsstand(prod, async () => { throw Error("Lesefehler"); }), "betriebskosten-profilbindung-nicht-bestaetigt");
  assert.equal(await pruefeProduktionsstand({ ...prod, HELMUT_VERSTEHEN_CAS: "off" }), "verstehen-cas-erforderlich");
  assert.equal(await pruefeProduktionsstand({ ...prod, HELMUT_SOURCE_TELEMETRY: "" }), "quellentelemetrie-deaktiviert");
  assert.equal(await pruefeProduktionsstand({ ...prod, HELMUT_COMMIT_SHA: "abcdef" }), "worker-commit-unbekannt");
  assert.equal(konfigurationsfehler({ ...env, HELMUT_WORKER_SUPABASE_HOST: "falsch.supabase.co" }),
    "supabase-ziel-nicht-bestaetigt");
  assert.equal(konfigurationsfehler({ ...env, VERCEL: "1" }), "vercel-laufzeit");
  assert.equal(konfigurationsfehler({ ...env, HELMUT_BETRIEBSKOSTENVERTRAG_JSON: "" }),
    "geldvertrag-nicht-bestaetigt");
  assert.equal(konfigurationsfehler({ ...env, AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini-eu" }),
    "azure-route-weicht-vom-geldvertrag-ab");
  await pruefeSchleife();
  await pruefeEinmalmodus(env);
  await pruefeCronRoute();
  await pruefeProzess();
  await pruefeWiederaufnahme();
  console.log("PASS Konfiguration, Viertelstunden, Redaktionssperre, Fehlerisolierung, Einmalmodus, Cron und SIGTERM");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
