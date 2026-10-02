"use strict";
// Isolierte PostgreSQL17-Abnahme: eigene Zufallsdatenbank, keine Production.
const A=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const P=require("../lib/helmut/synthetik-500-profile"),I=require("../lib/helmut/synthetik-500-import");
const IMPORT=require("./synthetik-500-import"),IF=require("./synthetik-500-import-test");
const {fixture,fixtureZeitfenster,COMMIT}=require("./synthetik-500-runtime-test");
const MIG=path.join(__dirname,"../supabase/migrations/20261001172619_synthetik500_end_runtime.sql");
const BACK=path.join(__dirname,"../supabase/migrations/rollback_20261001172619_synthetik500_end_runtime.sql");
const db="helmut_synthetik500_runtime_"+crypto.randomBytes(8).toString("hex");
const container=process.env.HELMUT_SYNTHETIK500_PG_CONTAINER,host=process.env.HELMUT_TEST_PG_HOST;
const literal=s=>"'"+String(s).replace(/'/g,"''")+"'",json=x=>literal(JSON.stringify(x))+"::jsonb";
function psql(sql,database=db){
  A.ok([db,"postgres"].includes(database));
  const args=["-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U",container?"postgres":(process.env.HELMUT_TEST_PG_USER||"helmut"),"-d",database,"-f","-"];
  const cmd=container?"docker":"psql",params=container?["--host=unix:///var/run/docker.sock","exec","-i",container,"psql",...args]:[...args,"-h",host,"-p",process.env.HELMUT_TEST_PG_PORT||"5433"];
  try{return execFileSync(cmd,params,{input:sql,encoding:"utf8",timeout:20000,maxBuffer:32*1024*1024,
    env:{PATH:process.env.PATH,LANG:"C.UTF-8",PGPASSWORD:"helmut",PGHOSTADDR:"127.0.0.1",PGCONNECT_TIMEOUT:"5",
      PGOPTIONS:"-c statement_timeout=15000 -c lock_timeout=3000"},stdio:["pipe","pipe","pipe"]}).trim();}
  catch(e){const stderr=String(e.stderr||""),detail=stderr.match(/ERROR:\s+([^\n]+)/)?.[1]||"kein-psql-fehlertext";
    const error=Error(stderr.match(/(?:synthetik500|real500)-[a-z0-9-]+/)?.[0]||"synthetik500-runtime-isolierte-sql-abweisung");
    error.isolierterFehler=detail;throw error;}
}
function bestand(){return JSON.parse(psql(`select jsonb_build_object('mandate_profiles',(select jsonb_agg(to_jsonb(p) order by user_id collate "C") from mandate_profiles p),
'profiles',(select jsonb_agg(to_jsonb(p) order by id collate "C") from profiles p),'store',(select jsonb_agg(to_jsonb(p) order by id collate "C") from helmut_store p));`));}
async function main(){
  A.equal(process.env.HELMUT_SYNTHETIK500_PG_ISOLIERT,"JA");
  if(container){A.match(container,/^synthetik500-runtime-pg-[a-f0-9]{8,16}$/);
    const info=JSON.parse(execFileSync("docker",["--host=unix:///var/run/docker.sock","inspect",container],{encoding:"utf8",env:{PATH:process.env.PATH}}))[0];
    A.equal(info.HostConfig.NetworkMode,"none");A.equal(info.Config.Image,"postgres:17.6-bookworm");A.ok(info.Mounts.every(m=>m.Type==="volume" && m.Destination==="/var/lib/postgresql/data"));
    A.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
  }else A.ok(["127.0.0.1","localhost"].includes(host));
  A.ok(Number(psql("show server_version_num","postgres"))>=170000);
  psql(`create database ${db} template template0 lc_collate 'C' lc_ctype 'C';`,"postgres");
  let n=0;const ok=label=>{n++;console.log("PASS "+label);};
  try{
    psql(`do $$ begin
      if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin;end if;
      if not exists(select from pg_roles where rolname='anon') then create role anon nologin;end if;
      if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end $$;`);
    const tmp=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"synthetik-runtime-import-"));
    try {
    const snapshotDir=path.join(tmp,"preimage"),old=IF.fixture(snapshotDir),outDir=path.join(tmp,"sql");
    IMPORT.baueDateien({paketBytes:IF.paketBytes,snapshotDir,outDir});
    const forward=fs.readFileSync(path.join(outDir,"synthetik500-ersatz.sql"),"utf8"),paket=JSON.parse(IF.paketBytes),rows=I.erzeugeZeilen(paket);
    async function seed(){
      psql("drop schema if exists helmut_synthetik500_internal cascade;"+IF.bootstrap(old));
      psql(forward);
      // Echte erzeugte Importquittung enthaelt500Zielidentitaeten, mitFremdprofil501.
      A.equal(psql("select jsonb_array_length(data->'profiles') from helmut_store where id='synthetik500-import-synthetik500-test-import';"),"500");
      psql(`create function fixture_touch() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp();return new;end $$;
        create trigger fixture_touch before update on mandate_profiles for each row execute function fixture_touch();
        grant usage on schema public to service_role;grant select,insert,update,delete on all tables in schema public to service_role;`);
      psql(fs.readFileSync(MIG,"utf8"));
      let b=bestand(),now=Date.now(),fenster=fixtureZeitfenster(now);
      if(fenster.warteMs){
        console.log("UTC-Tageswechsel: isolierte Testfixture wartet "+fenster.warteMs+"ms auf ihr frisches 1-Minuten-Fenster.");
        await new Promise(resolve=>setTimeout(resolve,fenster.warteMs));
        // Nach dem wirklichen Tageswechsel neu lesen; keine Uhrsimulation oder
        // Umetikettierung alter Kosten-/Bestandsbelege.
        b=bestand();now=Date.now();fenster=fixtureZeitfenster(now);
      }
      A.equal(fenster.warteMs,0);
      const snapshot={beobachtetAm:fenster.beobachtetAm,mandate_profiles:b.mandate_profiles,profiles:b.profiles};
      const x=fixture({snapshot,now,operationId:"synthetik500-isolierte-db-"+crypto.randomBytes(6).toString("hex")});
      x.belege.ruhe.mainHash=x.V.hash(b.store.find(r=>r.id==="main").data);
      psql(`update helmut_store set data=${json(x.belege.kosten.auth)} where id='main-auth';`);
      x.runtimeManifest=x.G.baueRuntimeManifest({manifest:x.manifest,snapshot,belege:x.belege},x.bytes,Date.now());
      x.full.endwaechter.manifestHash=x.V.hash(x.runtimeManifest);x.activate.aktivierungsGo.manifestHash=x.V.hash(x.runtimeManifest);
      x.prepare.runtimeManifest=x.runtimeManifest;x.activate.runtimeManifest=x.runtimeManifest;
      x.auftrag.manifestHash=x.V.hash(x.runtimeManifest);x.slot="synthetik500-runtime-"+x.manifest.operationId;
      return x;
    }
    await seed();
    for(const role of ["anon","authenticated"]){
      A.equal(psql(`select has_function_privilege('${role}','public.helmut_synthetik500_lesung(text,text,text)','EXECUTE');`),"f");
      A.equal(psql(`select has_function_privilege('${role}','public.helmut_synthetik500_ende(text,text,text,text,text)','EXECUTE');`),"f");
    }
    A.equal(psql("select coalesce(bool_or(a.grantee=0 and a.privilege_type='EXECUTE'),false) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.proname in ('helmut_synthetik500_lesung','helmut_synthetik500_ende');"),"f");
    ok("Echter Importgenerator erzeugt500Journal/501Bestand; eigener invoker/privateSchema ohnePUBLIC/anon/authenticated Zugriff");
    const read=x=>`select public.helmut_synthetik500_lesung(${literal(x.manifest.operationId)},${literal(x.auftrag.manifestHash)},${literal(COMMIT)});`;
    const end=x=>`select public.helmut_synthetik500_ende(${literal(x.manifest.operationId)},${literal(x.auftrag.manifestHash)},${literal(COMMIT)},'notstopp','GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN');`;
    const sql=x=>x.G.baueSql(x.prepare,x.bytes,Date.now());
    const reject=(stmt)=>{const before=bestand();A.throws(()=>psql("set role service_role;"+stmt));A.deepEqual(bestand(),before);};
    for(const blocker of ["insert into helmut_jobs(status,lease_expires_at) values('wartend',null);","insert into helmut_jobs(status,lease_expires_at) values('erledigt',clock_timestamp()+interval '1 minute');",
      "insert into pipeline_locks(expires_at) values(clock_timestamp()+interval '1 minute');","insert into process_runs(status,finished_at) values('running',null);",
      "insert into helmut_job_outbox values('offen','offen');","insert into helmut_job_outbox values('versendet','versendet');",
      "insert into helmut_job_outbox values('unbekannt','unbekannt');","insert into helmut_job_outbox values('nullstatus',null);"]){
      const x=await seed();psql(blocker);reject(sql(x));
    }
    ok("Wirkliche queuedJobs/Leases/PipelineLocks/Running/Outbox sperren prepared0 atomar");
    let x=await seed();const original=x.belege.kosten.auth;const withLock={...original,pipelineLocks:{fixture:{expiresAt:Date.now()+60000}}};
    psql(`update helmut_store set data=${json(withLock)} where id='main-auth';`);
    // Erneut frisch und korrekt hashen: Authhash allein ersetzt keine Ruhepruefung.
    x.belege.kosten.auth=withLock;x.belege.ruhe.authHash=x.V.hash(withLock);
    x.runtimeManifest=x.G.baueRuntimeManifest({manifest:x.manifest,snapshot:x.snapshot,belege:x.belege},x.bytes,Date.now());x.prepare.runtimeManifest=x.runtimeManifest;
    reject(sql(x));ok("Aktiver JSON-PipelineLock trotz korrekt neu gebundener Authhashes verweigert Start");
    x=await seed();psql("delete from helmut_store where id like 'synthetik500-import-%';");reject(sql(x));
    ok("Selbstgehashte synthetische Labels ohne vollstaendige passende Importquittung verweigert");
    x=await seed();psql(sql(x));let r=JSON.parse(psql("set role service_role;"+read(x)));A.equal(r.zustand,"vorbereitet");A.equal(r.aktiv,0);
    reject(sql(x));reject(end(x));ok("Prepared0 ist echte SQL-Lesung ohne Aktivquittung; Wiederverwendung/Endwrite gesperrt");
    let activate=x.G.baueSql(x.activate,x.bytes,Date.now());
    psql("insert into helmut_job_outbox values('race','versendet');");reject(activate);psql("delete from helmut_job_outbox;");
    psql(activate);r=JSON.parse(psql("set role service_role;"+read(x)));A.equal(r.aktiv,500);A.equal(r.zustand,"aktiv");
    ok("0 -> exakt500 Aktivierung in einer Transaktion mit preparedCAS und echter OutboxNachpruefung");
    const active=bestand();A.throws(()=>psql(fs.readFileSync(BACK,"utf8")),/rollback-aktiver-lauf/);A.deepEqual(bestand(),active);
    psql(`update mandate_profiles set aktiv=false where user_id=${literal(rows.mandateRows[0].user_id)};`);
    r=JSON.parse(psql("set role service_role;"+read(x)));A.equal(r.aktiv,499);
    r=JSON.parse(psql("set role service_role;"+end(x)));A.equal(r.aktiv,0);A.equal(r.zustand,"beendet");
    A.deepEqual(bestand().profiles,active.profiles);
    A.deepEqual(bestand().mandate_profiles.map(({aktiv,updated_at,...r})=>r),active.mandate_profiles.map(({aktiv,updated_at,...r})=>r));
    ok("AktiverRollback gesperrt; partielle499 enden automatisch gebunden auf0 ohne Fach-/Fremddrift");
    const closed=bestand();JSON.parse(psql("set role service_role;"+end(x)));A.deepEqual(bestand(),closed);
    reject(activate);ok("QuittiertesEnde idempotent lesbar; verbrauchterAuftrag kann keine Profile reaktivieren");
    x=await seed();psql(sql(x));psql(x.G.baueSql(x.activate,x.bytes,Date.now()));
    psql(`create function fixture_fail() returns trigger language plpgsql as $$ begin if new.user_id=${literal(rows.mandateRows[250].user_id)} then raise exception 'synthetik500-fixture-abbruch';end if;return new;end $$;
      create trigger fixture_fail before update on mandate_profiles for each row execute function fixture_fail();`);
    reject(end(x));psql("drop trigger fixture_fail on mandate_profiles;drop function fixture_fail();");
    ok("Echter Triggerabbruch mitten im500Update rollt alle Profile und Quittung atomar zurueck");
    psql(`create function fixture_drift() returns trigger language plpgsql as $$ begin update helmut_store set data=data||'{"drift":true}'::jsonb where id='main-auth';return new;end $$;
      create trigger fixture_drift before update on mandate_profiles for each row execute function fixture_drift();`);
    reject(end(x));psql("drop trigger fixture_drift on mandate_profiles;drop function fixture_drift();");
    ok("Echter Authseiteneffekt beimEnde wird erkannt und vollstaendig zurueckgerollt");
    JSON.parse(psql("set role service_role;"+end(x)));const beforeBack=bestand();psql(fs.readFileSync(BACK,"utf8"));A.deepEqual(bestand(),beforeBack);
    ok("InaktiverMigrationsrollback entfernt nur eigeneFunktionen und behaelt alle Daten");
    console.log(`${n}/${n} echte isolierte PostgreSQL17-Synthetikruntimepruefungen gruen; keine Production-/Liveabnahme.`);
    }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  }finally{psql(`drop database ${db};`,"postgres");}
}
if(require.main===module)main().catch(e=>{console.error("Synthetik-Runtime-DB-Abnahme fehlgeschlagen: "+e.message+(e.isolierterFehler?" ("+e.isolierterFehler+")":""));process.exitCode=1;});
module.exports={main};
