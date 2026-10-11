"use strict";
// Only explicitly isolated PostgreSQL. No managed DB or paid API credentials.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {execFileSync}=require("node:child_process"),EU=require("../lib/helmut/synthetik-500-eu-service-contract");
const container=process.env.HELMUT_EU_PG_CONTAINER;
const db="helmut_eu_contract_"+crypto.randomBytes(8).toString("hex");
function psql(sql,database=db){assert([db,"postgres"].includes(database));return execFileSync("docker",["--host=unix:///var/run/docker.sock","exec","-i",container,
  "psql","-X","-w","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d",database,"-f","-"],{input:sql,encoding:"utf8",timeout:20000,
  env:{PATH:process.env.PATH},stdio:["pipe","pipe","pipe"]}).trim();}
function main(){assert.match(container||"",/^blocker3-eu-pg-[0-9]{8}$/);
  const info=JSON.parse(execFileSync("docker",["--host=unix:///var/run/docker.sock","inspect",container],{encoding:"utf8",env:{PATH:process.env.PATH}}))[0];
  assert.equal(info.HostConfig.NetworkMode,"none");assert.equal(info.Config.Image,"postgres:17.6-bookworm");assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
  const originals=process.env.HELMUT_EU_NATIVE_FUNCTION_DIR;assert(originals?.startsWith("/workspace/private/"));
  psql(`create database ${db} template template0 lc_collate 'C' lc_ctype 'C';`,"postgres");
  try{
    const old=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261007104720_synthetik500_unabhaengiger_endwaechter.sql"),"utf8");
    const tables=old.slice(old.indexOf("create table helmut_end500_internal.heartbeat"),old.indexOf("create unique index end500_one_open"));
    psql(`create schema helmut_end500_internal;create schema helmut_synthetik500_internal;
      create table mandate_profiles(user_id text primary key,aktiv boolean not null default false);
      insert into mandate_profiles select 'fictional-'||i,false from generate_series(1,500)i;
      do $$begin if not exists(select from pg_roles where rolname='anon')then create role anon;end if;
      if not exists(select from pg_roles where rolname='authenticated')then create role authenticated;end if;
      if not exists(select from pg_roles where rolname='service_role')then create role service_role;end if;end$$;
      ${tables}`);
    for(const name of ["helmut_synthetik500_internal-pruefe.sql","helmut_end500_internal-bind.sql","native-time-status.sql"])
      psql(fs.readFileSync(path.join(originals,name),"utf8"));
    const previous=psql("select pg_get_functiondef('helmut_end500_internal.bind(text,text,text,timestamptz,timestamptz,text)'::regprocedure);");
    psql(fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261011213611_synthetik500_eu_service_contract_time.sql"),"utf8"));
    assert.equal(psql("select pg_get_functiondef('helmut_end500_internal.bind(text,text,text,timestamptz,timestamptz,text)'::regprocedure);"),previous);
    const insert=(hours,hash)=>`insert into helmut_end500_internal.bindings(operation_id,manifest_hash,production_commit,start_am,ende_am,service_contract_hash)
      values('synthetik500-offline-20261012','${"a".repeat(64)}','${"b".repeat(40)}','2026-10-12T10:00Z','2026-10-12T10:00Z'::timestamptz+interval '${hours}',${hash===null?"null":"'"+hash+"'"});`;
    for(const [duration,hash] of [["9 hours",EU.HASH],["4 hours",null]]){psql("begin;"+insert(duration,hash)+"rollback;");}
    for(const [duration,hash] of [["9 hours 1 second",EU.HASH],["9 hours",null],["4 hours 1 second",null],["1 hour","0".repeat(64)]])
      assert.throws(()=>psql("begin;"+insert(duration,hash)+"rollback;"));
    for(const role of ["anon","authenticated"])
      assert.equal(psql(`select has_function_privilege('${role}','public.helmut_end500_eu_binden(text,text,text,timestamptz,timestamptz,text,text)','EXECUTE');`),"f");
    assert.equal(psql("select has_function_privilege('service_role','public.helmut_end500_eu_binden(text,text,text,timestamptz,timestamptz,text,text)','EXECUTE');"),"t");
    assert.equal(psql("select coalesce(bool_or(a.grantee=0 and a.privilege_type='EXECUTE'),false) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where p.proname='helmut_end500_eu_binden';"),"f");
    const e={manifest:{profilvertrag:{version:EU.MANIFEST_VERSION,serviceContractHash:EU.HASH}}};
    assert.equal(psql(`select helmut_synthetik500_internal.status('${JSON.stringify(e)}'::jsonb,0)->>'serviceContractHash';`),EU.HASH);
    assert.equal(psql("select helmut_synthetik500_internal.status('{}'::jsonb,0) ? 'serviceContractHash';"),"f");
    assert.equal(psql("select count(*) from helmut_end500_internal.bindings;"),"0");
    assert.equal(psql("select count(*) from mandate_profiles where aktiv;"),"0");
    console.log("PASS isolated PG17 migration preimages, exact EU9h/legacy4h/null checks, service-only RPC, old binder unchanged, native status hash, zero activation/bindings");
  }finally{psql(`drop database ${db} with(force);`,"postgres");}
}
if(require.main===module){try{main();}catch(e){console.error(String(e.stderr||e.stack));process.exitCode=1;}}
module.exports={main};
