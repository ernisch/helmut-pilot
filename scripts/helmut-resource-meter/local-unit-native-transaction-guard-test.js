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
