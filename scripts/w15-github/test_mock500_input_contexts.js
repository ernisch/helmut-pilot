'use strict';
// Invented input-validator checks only, never qualified originals or 500 units.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const B=require('./mock500_bindings'),{inspectRows}=require('./mock500_input_contexts');
const file=path.resolve(__dirname,'test_mock500_calendar_fixture.js');
const source=fs.readFileSync(file,'utf8').split('const before = structuredClone(fixture)')[0];
const rows=[],fixtures=[];
function fictional(index,oldSource=false){
  const text=source.replace("id: 'fictional-calendar-only'", "id: 'fictional-context-"+index+"'")
    .replace("published_at: '2026-10-28T11:00:00.000Z'",oldSource?"published_at: '2026-10-16T11:00:00.000Z'":"published_at: '2026-10-28T11:00:00.000Z'");
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));
  m._compile(text+'\nmodule.exports={historical,fixture};',file);
  const value=m.exports;value.fixture.index=index;return value;
}
for(let i=0;i<500;i++){const v=fictional(i);rows.push(v.historical);fixtures.push(v.fixture);}
const args={rows,fixtures,executionISO:'2026-11-03T12:00:00.000Z',historicalExecutionISO:'2026-10-28T12:00:00.000Z'};
const original=JSON.stringify(args),pass=inspectRows(args);
assert.equal(pass.all500Valid,true);assert.equal(pass.inspected,500);assert.equal(pass.counts.valid,500);
assert(pass.results.every((r,i)=>r.index===i&&r.status==='VALID'&&r.contextCount>0));
assert.equal(JSON.stringify(args),original);
const bad=structuredClone(args);bad.rows.splice(0,1);
const aged=fictional(74,true);bad.rows[73]=aged.historical;bad.fixtures[74]=aged.fixture;
bad.fixtures[249].reviewOutputSHA256='0'.repeat(64);
const calendarRow=B.calendarRow;
try{
  B.calendarRow=(row,time)=>{if(row.profile.id==='fictional-context-499')throw TypeError('PRIVATE_CANARY_DO_NOT_EMIT');return calendarRow(row,time);};
  const result=inspectRows(bad);
  assert.equal(result.all500Valid,false);assert.equal(result.inspected,500);
  assert.deepEqual(result.counts,{valid:496,missing:1,empty:1,unusable:1,technical:1});
  assert.equal(result.results[74].timeOnlyExclusion,true);
  assert.equal(result.results[499].status,'TECHNICAL');assert(!JSON.stringify(result).includes('PRIVATE_CANARY'));
}finally{B.calendarRow=calendarRow;}
const duplicate=structuredClone(args);duplicate.fixtures[499].owner=duplicate.fixtures[0].owner;
const rejected=inspectRows(duplicate);assert.equal(rejected.all500Valid,false);assert.equal(rejected.inspected,0);
assert.equal(rejected.counts.technical,500);
assert.equal(inspectRows({...args,executionISO:'2026-10-27T12:00:00.000Z'}).all500Valid,false);
console.log('PASS 500 invented input contexts, four distinct failure classes including last index, time-only comparison, no input mutation or original acceptance');
