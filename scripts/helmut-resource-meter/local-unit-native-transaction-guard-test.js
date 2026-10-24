"use strict";

// Pure boundary tests. No start(), child, socket, authority or database execution.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const probe=require("./local-unit-native-transaction-guard");
const good={exitObserved:true,exitCode:0,exitSignal:null,stdoutEOF:true,stderrEOF:true,failure:null};
let checks=0;
function test(work){work();checks++;}
test(()=>assert.deepEqual([...probe.CASES],["state","same-root-usage","late-old-mirror","late-outside"]));
test(()=>assert.equal(probe.confirmedClose(good),true));
for(const [key,value] of Object.entries({exitObserved:false,exitCode:3,exitSignal:"SIGTERM",stdoutEOF:false,stderrEOF:false,failure:"unknown"}))
  test(()=>assert.equal(probe.confirmedClose({...good,[key]:value}),false));
for(const reason of ["original-bridge-old-full-auth-mirror","original-bridge-outside-keyset-changed"]){
  const row={...good,exitCode:3},error=Buffer.from("psql:<stdin>:417: ERROR:  "+reason+"\n");
  test(()=>assert.equal(probe.confirmedClose(row,reason,error),true));
  test(()=>assert.equal(probe.confirmedClose({...row,exitCode:0},reason,error),false));
  test(()=>assert.equal(probe.confirmedClose({...row,stderrEOF:false},reason,error),false));
  for(const text of ["ERROR:  other\n",error.toString()+"extra\n",error.toString().trim(),"FATAL:  "+reason+"\n"])
    test(()=>assert.equal(probe.confirmedClose(row,reason,Buffer.from(text)),false));
}
const sql=probe.snapshotSQL({database:"helmut_unit_diagnostic_"+"a".repeat(32),commandHash:"b".repeat(64)});
test(()=>assert.match(sql,/BEGIN READ ONLY;/));
test(()=>assert.match(sql,/c\.relkind='r'/));
test(()=>assert.match(sql,/helmut_auth_state_nodes_local','llm_usage','briefings','profiles'/));
test(()=>assert.match(sql,/to_jsonb\(r\)::text/));
test(()=>assert.match(sql,/string_agg\(h,'' ORDER BY h\)/));
test(()=>assert.doesNotMatch(sql,/rolpassword|pg_authid|DISABLE|session_replication_role|CREATE FUNCTION/i));
test(()=>assert.match(sql,/<>11 THEN/));
const rowHashSQL=/\$row_digest\$([\s\S]*?)\$row_digest\$/.exec(sql)[1];
// An ordinary inline subquery allows the planner to carry whole rows into a
// presort. The materialized producer must expose ONLY the fixed-size digest.
const producer=/^WITH row_hashes AS MATERIALIZED \(\s*([\s\S]*?)\n   \) ([\s\S]*)$/.exec(rowHashSQL);
test(()=>assert.ok(producer,"explicit materialization fence before aggregate"));
test(()=>assert.match(producer[1],/^SELECT encode\(sha256\(convert_to\(to_jsonb\(r\)::text,'UTF8'\)\),'hex'\) AS h FROM %I\.%I r\s*$/));
test(()=>assert.doesNotMatch(producer[1],/ORDER BY|SELECT \*|r\.\*/i));
test(()=>assert.match(producer[2],/string_agg\(h,'' ORDER BY h\).* FROM row_hashes$/));
test(()=>assert.doesNotMatch(producer[2],/to_jsonb|r\.|%I|hashed_rows/));
test(()=>assert.doesNotMatch(sql,/SET\s+(?:LOCAL\s+)?(?:work_mem|temp_file_limit|enable_presorted_aggregate)/i));
const enumGuard=sql.indexOf("IF NOT (t.nspname||'.'||t.relname=ANY(ARRAY[");
const marker=sql.indexOf("RAISE NOTICE 'HELMUT_TRANSACTION_GUARD_SNAPSHOT_TABLE_V1 %',t.nspname||'.'||t.relname;");
const hash=sql.indexOf("EXECUTE format($row_digest$");
test(()=>assert.ok(enumGuard>=0 && marker>enumGuard && hash>marker));
const names=[...sql.slice(enumGuard,marker).matchAll(/'((?:helmut_unit_diagnostic|public)\.[a-z_]+)'/g)].map(row=>row[1]);
test(()=>assert.deepEqual(names,["helmut_unit_diagnostic.artifacts","helmut_unit_diagnostic.authority","helmut_unit_diagnostic.leases",
  "helmut_unit_diagnostic.legacy_read_rpcs","helmut_unit_diagnostic.runtime_observations","helmut_unit_diagnostic.state",
  "public.briefings","public.helmut_auth_state_nodes_local","public.helmut_store","public.llm_usage","public.profiles"]));
test(()=>assert.equal((sql.match(/RAISE NOTICE/g)||[]).length,1));
const before={schema:"s",database:"d",databaseOID:"1",catalogSHA256:"c",tables:{own:{count:1,sha256:"a"},nodes:{count:3,sha256:"b"}}};
test(()=>probe.assertDelta(before,structuredClone(before),[]));
test(()=>probe.assertDelta(before,{...before,tables:{...before.tables,own:{count:1,sha256:"different"}}},["own"]));
for(const after of [{...before,catalogSHA256:"different"},{...before,databaseOID:"2"},
  {...before,tables:{...before.tables,nodes:{count:4,sha256:"b"}}},{...before,tables:{own:before.tables.own}}])
  test(()=>assert.throws(()=>probe.assertDelta(before,after,["own"])));
const source=fs.readFileSync(path.join(__dirname,"local-unit-native-transaction-guard.js"),"utf8");
test(()=>assert.match(source,/await psql\(packet\.sql,label,negative\)/));
test(()=>assert.match(source,/T\.acceptResult\(packet,result\.stdout\)/));
test(()=>assert.doesNotMatch(source,/packet\.sql\.(?:replace|slice)|authAck\s*:\s*\[/));
test(()=>assert.match(source,/auth\.llmUsage=\[record,\.\.\.history\]/));
console.log("PASS native transaction guard pure boundaries: "+checks);
