"use strict";
// Ausschliesslich netzloser eigener PG17-Container. Kuenstliche Ausgangsdaten.
const A = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const P = require("../lib/helmut/synthetik-500-profile");
const MIG = path.join(__dirname,"../supabase/migrations/20261007104720_synthetik500_unabhaengiger_endwaechter.sql");
const BACK = path.join(__dirname,"../supabase/migrations/rollback_20261007104720_synthetik500_unabhaengiger_endwaechter.sql");
const container = process.env.HELMUT_END500_PG_CONTAINER;
const env = { PATH:process.env.PATH, LANG:"C.UTF-8" };
const dockerArgs = ["--host=unix:///var/run/docker.sock"];
const q = s => "'"+String(s).replace(/'/g,"''")+"'";
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
function sql(text) {
  return execFileSync("docker",[...dockerArgs,"exec","-i",container,"psql","-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],
    {input:text,encoding:"utf8",env,timeout:20000,maxBuffer:1024*1024,stdio:["pipe","pipe","pipe"]}).trim();
}
function status() { return JSON.parse(sql("select public.helmut_end500_status();")); }
const bind = (op,seconds=120) => `select public.helmut_end500_binden(${q(op)},${q("a".repeat(64))},${q("b".repeat(40))},clock_timestamp(),clock_timestamp()+interval '${seconds} seconds','NUR_ENDSTEUERUNG_KEINE_AKTIVIERUNG');`;
const stop = op => `select public.helmut_end500_notstopp(${q(op)},${q("a".repeat(64))},'GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN');`;
async function main() {
  A.equal(process.env.HELMUT_END500_PG_ISOLIERT,"JA");
  A.match(container,/^end500-pg-[a-f0-9]{8,16}$/);
  const info=JSON.parse(execFileSync("docker",[...dockerArgs,"inspect",container],{encoding:"utf8",env}))[0];
  A.equal(info.HostConfig.NetworkMode,"none");
  A.equal(info.Config.Image,"helmut-end500-pg17:1");
  A.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
  A.ok(info.Mounts.every(m=>m.Type==="volume" && m.Destination==="/var/lib/postgresql/data"));
  A.equal(Number(sql("show server_version_num")),170006);
  sql("create role service_role nologin; create role anon nologin; create role authenticated nologin; create table public.mandate_profiles(user_id text primary key,aktiv boolean not null,geloescht_at timestamptz,fach text default 'unveraendert'); grant usage on schema public to service_role,anon,authenticated; grant select,update on public.mandate_profiles to service_role;");
  const ids=P.erzeuge().profile.map(p=>p.mandatsId); // Test muss reale Generator-ID-Struktur verwenden.
  A.equal(ids.length,500);
  sql("insert into public.mandate_profiles(user_id,aktiv) values "+ids.map(id=>`(${q(id)},false)`).join(",")+";");
  sql(fs.readFileSync(MIG,"utf8"));
  let passed=0;
  const ok=label=>{passed++;console.log("PASS "+label);};
  const reject=(text,reason)=>A.throws(()=>sql(text),e=>String(e.stderr).includes(reason));
  const service=text=>sql("set role service_role;"+text);
  const read=()=>JSON.parse(service("select public.helmut_end500_status();"));
  const unchanged=()=>sql("select md5(string_agg((to_jsonb(m)-'aktiv')::text,',' order by user_id)) from public.mandate_profiles m;");
  const baseline=unchanged();
  A.deepEqual(JSON.parse(sql("select to_jsonb(helmut_end500_internal.ids());")),ids.sort());
  A.equal(read().state,"standby");A.equal(read().activeTargets,0);ok("Installation: exaktGenerator500/0 und standby");
  reject("update mandate_profiles set aktiv=true;","end500-kein-offenes-fenster");
  reject("update mandate_profiles set user_id='fremd' where user_id="+q(ids[0])+";","end500-zielidentitaet-unveraenderlich");
  ok("OhneFenster: Aktivierung und Zielumbenennung gesperrt");
  for(const role of ["anon","authenticated"]) {
    for(const call of ["select public.helmut_end500_status();",bind("synthetik500-verboten01"),stop("synthetik500-verboten01"),
      "select * from helmut_end500_internal.bindings;","select cron.schedule('boese','30 seconds','select 1');"])
      reject("set role "+role+";"+call,"permission denied");
  }
  for(const call of ["select * from helmut_end500_internal.bindings;","update helmut_end500_internal.heartbeat set ticks=10;",
    "select helmut_end500_internal.tick();","select cron.schedule('boese','30 seconds','select 1');"])
    reject("set role service_role;"+call,"permission denied");
  ok("Rechte: anon/auth ausgeschlossen; Dienstrolle kein Tabellen-/Schedulerwrite");
  reject("set role service_role;"+bind("synthetik500-zu-frueh01"),"end500-kein-lebender-scheduler");
  const liveDeadline=Date.now()+75000;
  while(read().recentSuccessfulRuns<2 && Date.now()<liveDeadline) await wait(1000);
  const live=read();A.ok(live.recentSuccessfulRuns>=2);A.ok(live.ticks>=2);A.equal(live.schedulerActive,true);
  A.ok(Date.now()-Date.parse(live.lastTick)<35000);ok("EchterCron: zwei unabhaengige30sRuns, frischerHeartbeat");
  reject("set role service_role;"+bind("synthetik500-falsch01").replace("NUR_ENDSTEUERUNG_KEINE_AKTIVIERUNG","FALSCH"),"end500-bindung-ungueltig");
  for(const seconds of [-10,14401]) reject("set role service_role;"+bind("synthetik500-falsch02",seconds),"end500-bindung-ungueltig");
  ok("Bindung: falsche Bestaetigung/abgelaufeneFrist/ueber4h verweigert");
  const op="synthetik500-notstopp-test01";
  A.equal(JSON.parse(service(bind(op))).activeTargets,0);
  A.equal(read().operationId,op);A.equal(read().activationRight,false);
  reject("set role service_role;"+bind("synthetik500-doppelt01"),"duplicate key");
  reject(`select helmut_end500_internal.stop(${q(op)},${q("a".repeat(64))},'frist','GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN');`,"end500-frist-nicht-erreicht");
  reject(`set role service_role; select helmut_end500_internal.stop(${q(op)},${q("a".repeat(64))},'notstopp','FALSCH');`,"end500-endauftrag");
  reject("set role service_role;"+stop(op).replace("a".repeat(64),"f".repeat(64)),"end500-fremde-bindung");
  reject("set role service_role;"+stop(op).replace("GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN","FALSCH"),"end500-bestaetigung-fehlt");
  ok("ExakteFensterbindung: keine zweiteBindung, fremderHash und vorzeitigeFrist abgewiesen");
  // Ausschliesslich kuenstliche lokale aktive Ausgangszeilen, keine Production-Aktivierung.
  service("update mandate_profiles set aktiv=true;");
  sql("update mandate_profiles set fach='gepruefte-fachdrift' where user_id="+q(ids[0])+";");
  const drift=unchanged();
  const stopped=JSON.parse(service(stop(op)));
  A.equal(stopped.reason,"notstopp");A.equal(stopped.activeTargets,0);A.equal(stopped.deactivated,500);
  A.equal(unchanged(),drift);ok("Notstopp500->0 funktioniert trotz Fachdrift; Fachfelder erhalten");
  const stoppedRows=sql("select md5(string_agg(to_jsonb(b)::text,',' order by operation_id)) from helmut_end500_internal.bindings b;");
  service(stop(op));
  A.equal(sql("select md5(string_agg(to_jsonb(b)::text,',' order by operation_id)) from helmut_end500_internal.bindings b;"),stoppedRows);
  reject("update mandate_profiles set aktiv=true;","end500-kein-offenes-fenster");
  reject("set role service_role;"+bind(op),"duplicate key");
  ok("Notstopp idempotent; Reaktivierung und Verbrauchswiederverwendung gesperrt");
  sql("update mandate_profiles set fach='unveraendert';");A.equal(unchanged(),baseline);
  const partial="synthetik500-teilaktiv-test01";
  service(bind(partial));service("update mandate_profiles set aktiv=true where user_id<>"+q(ids[0])+";");
  const p=JSON.parse(service(stop(partial)));A.equal(p.deactivated,499);A.equal(p.activeTargets,0);
  reject("set role service_role;"+stop(op),"end500-alte-bindung");
  ok("Teilaktivierung499->0; alterEndauftrag kann neuesFenster nicht beenden");
  const automatic="synthetik500-cron-frist01";
  service(bind(automatic,3));service("update mandate_profiles set aktiv=true;");
  const autoDeadline=Date.now()+40000;
  while(read().state!=="stopped" && Date.now()<autoDeadline) await wait(1000);
  const auto=read();A.equal(auto.state,"stopped");A.equal(auto.reason,"frist");
  A.equal(auto.deactivated,500);A.equal(auto.activeTargets,0);A.equal(unchanged(),baseline);
  A.ok(Number(sql(`select count(*) from cron.job_run_details where jobid=${auto.jobId} and status='succeeded' and end_time>=${q(auto.endAt)}::timestamptz;`))>=1);
  ok("EchterCron beendet Frist500->0 ohne Stop-/Tickaufruf aus Testprozess");
  const race="synthetik500-abschluss-race01";service(bind(race));
  const child=spawn("docker",[...dockerArgs,"exec","-i",container,"psql","-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],{env,stdio:["pipe","pipe","pipe"]});
  let childErr="";child.stderr.on("data",b=>{childErr+=b;});
  const finished=new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",code=>code===0?resolve():reject(new Error(childErr)));});
  child.stdin.end("begin; set role service_role; update mandate_profiles set aktiv=true; select pg_sleep(1); commit;");
  // Beobachtete offene Transaktion statt einer geratenen Race-Reihenfolge.
  let seen=false;
  for(let attempt=0;attempt<20&&!seen;attempt++) {
    seen=sql("select exists(select from pg_stat_activity where query like '%select pg_sleep(1)%' and pid<>pg_backend_pid() and wait_event='PgSleep');")==="t";
    if(!seen) await wait(50);
  }
  A.ok(seen,"offene Writertransaktion beobachtet");
  const r=JSON.parse(service(stop(race)));await finished;
  A.equal(r.activeTargets,0);A.equal(read().activeTargets,0);ok("Notstopp serialisiert konkurrierendenWriter und verhindert Wiederaktivierung");
  const back="synthetik500-rueckweg-test01";service(bind(back));
  reject(fs.readFileSync(BACK,"utf8"),"end500-rueckweg-nicht-null");
  A.equal(read().state,"armed");service(stop(back));
  sql(fs.readFileSync(BACK,"utf8"));
  A.equal(sql("select to_regnamespace('helmut_end500_internal') is null;"),"t");
  A.equal(sql("select to_regprocedure('public.helmut_end500_status()') is null;"),"t");
  A.equal(sql("select exists(select from pg_extension where extname='pg_cron');"),"f");
  A.equal(sql("select count(*) from mandate_profiles where aktiv;"),"0");A.equal(unchanged(),baseline);
  ok("GebundenerRueckweg: offen verweigert, nach0 erfolgreich; Scheduler/Schema weg, Profile erhalten");
  A.ok(passed>0);console.log(`${passed} PASS / 0 FAIL — echte isoliertePG17/pg_cron-Endsteuerung, kein500erProductiontest.`);
}
if(require.main===module) main().catch(e=>{console.error(String(e.stderr||e.message));process.exitCode=1;});
