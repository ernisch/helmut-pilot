"use strict";
// Input eligibility only; no authority, source mutation, provider install or DB.
const B = require('./mock500_bindings');
const Binding = require('../../lib/helmut/briefing-lagebindung');
const Lage = require('../../lib/helmut/lage');
const SCHEMA = 'helmut-w15-mock500-input-contexts/1';
const canonicalISO = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const empty = (index, status = 'TECHNICAL', phase = 'INPUT') => ({index,status,contextCount:'UNKNOWN',timeOnlyExclusion:'UNKNOWN',phase});

function inspectRows({rows,fixtures,executionISO,historicalExecutionISO} = {}) {
  const results = Array.from({length:500},(_,i)=>empty(i));
  let bindingAccepted = false,inspected=0;
  function finish() {
    const counts={valid:0,missing:0,empty:0,unusable:0,technical:0};
    for(const row of results)counts[row.status.toLowerCase()]++;
    return {schema:SCHEMA,bindingAccepted,expected:500,inspected,counts,
      all500Valid:bindingAccepted && inspected===500 && counts.valid===500,results};
  }
  if(!Array.isArray(rows)||!Array.isArray(fixtures)||fixtures.length!==500
    ||!canonicalISO(executionISO)||!canonicalISO(historicalExecutionISO)
    ||executionISO<historicalExecutionISO)return finish();
  const owners=fixtures.map(f=>f?.owner);
  if(owners.some(x=>typeof x!=='string'||!x)||new Set(owners).size!==500
    ||fixtures.some((f,i)=>f.index!==i))return finish();
  const byOwner=new Map(),duplicates=new Set();let malformed=false;
  for(const row of rows){
    const id=row?.profile?.id;
    if(typeof id!=='string'||!id){malformed=true;continue;}
    if(byOwner.has(id))duplicates.add(id);
    else byOwner.set(id,row);
  }
  const expected=new Set(owners);
  bindingAccepted=!malformed&&rows.length===500&&byOwner.size===500&&duplicates.size===0
    &&[...byOwner.keys()].every(id=>expected.has(id));
  for(let index=0;index<500;index++){
    inspected++;
    const fixture=fixtures[index],original=byOwner.get(fixture.owner);
    if(!original?.profile||!original?.briefingEingabe){results[index]=empty(index,'MISSING');continue;}
    if(duplicates.has(fixture.owner)||original.briefingDatum!==historicalExecutionISO)continue;
    let derived;
    try{derived=B.calendarRow(original,executionISO).row;}
    catch(error){results[index]=empty(index,error?.message?.startsWith('w15-local-calendar-')
      ||error?.message==='briefing-lagebindung-abweichend'?'UNUSABLE':'TECHNICAL','CALENDAR');continue;}
    try{
      const prepared=B.calendarFixture(fixture,derived);
      if(!Number.isSafeInteger(prepared.contextSources)||prepared.contextSources<=0||prepared.contextSources>500)
        throw Error('INVALID_CONTEXT_COUNT');
      results[index]={index,status:'VALID',contextCount:prepared.contextSources,timeOnlyExclusion:false,phase:'COMPLETE'};
    }catch(error){
      if(error?.code==='ERR_ASSERTION'&&error.message==='w15-unit0-provider-empty-context'){
        const result={index,status:'EMPTY',contextCount:0,timeOnlyExclusion:'UNKNOWN',phase:'PROVIDER'};
        // Same exact ranked/source inputs; only the pure projection's time varies.
        // This comparison never qualifies an old context for today's sender.
        try{
          const bound=Binding.pruefe(derived.briefingEingabe,derived.profile,derived.profile.id,new Date(executionISO),{acceptedSnapshot:true});
          const current=Lage.prepareDContext(bound.ranked,bound.sources,new Date(executionISO),bound).koLite;
          const historical=Lage.prepareDContext(bound.ranked,bound.sources,new Date(historicalExecutionISO),bound).koLite;
          if(current.length===0&&historical.length>0)result.timeOnlyExclusion=true;
        }catch{}
        results[index]=result;
      }else results[index]=empty(index,error?.code==='ERR_ASSERTION'
        ||error?.message==='briefing-lagebindung-abweichend'?'UNUSABLE':'TECHNICAL','PROVIDER');
    }
  }
  return finish();
}
module.exports={inspectRows};
