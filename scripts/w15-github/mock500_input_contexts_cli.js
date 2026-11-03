'use strict';
// Private stdin paths select only already authenticated, fixed archive members.
const fs=require('node:fs'),path=require('node:path');
const B=require('./mock500_bindings');
try{
  if(process.version!=='v24.19.0'||!require.cache[require.resolve('../lokaler-netzschutz')])throw Error();
  const raw=fs.readFileSync(0);if(!raw.length||raw.length>16384)throw Error();
  const value=JSON.parse(raw),keys=['qualificationReport','qualifiedRows','qualifiedFixtures','publicationPolicy'];
  if(Object.keys(value).sort().join()!=='assets,executionISO'
    ||Object.keys(value.assets).sort().join()!==keys.slice().sort().join())throw Error();
  const names={qualificationReport:'ALL500_MOCK_BINDINGS_CHECK.SAFE.json',qualifiedRows:'QUALIFIED_ROWS.PRIVATE.json',qualifiedFixtures:'QUALIFIED_MOCK_FIXTURES.PRIVATE.json',publicationPolicy:'publication-policy.PRIVATE.json'};
  const pins={qualificationReport:[13706128,'d2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d'],
    qualifiedRows:[99566746,'22d4f73337178ec260c6d963f5539044f15e07d952aafc83e258cfdc4d267359'],
    qualifiedFixtures:[1895933,'548a5bd3e268be76a85ba8088c6993c0860b4f90659b47da1c76526cf486d9d1'],
    publicationPolicy:[493,'274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04']};
  const decoded={};
  for(const key of keys){
    const pin=value.assets[key];
    if(!pin||pin.bytes!==pins[key][0]||pin.sha256!==pins[key][1]||path.basename(pin.path)!==names[key])throw Error();
    const bytes=B.privateBytes(pin,key==='qualificationReport'?16*1024**2:256*1024**2);
    decoded[key]=JSON.parse(bytes);
    if(key==='publicationPolicy')process.env.HELMUT_PUBLICATION_ELIGIBILITY_JSON=bytes.toString('utf8');
  }
  process.env.VERCEL_ENV='production';process.env.HELMUT_TESTLAUF_KOMMUNIKATION='gesperrt';
  const {inspectRows}=require('./mock500_input_contexts');
  const q=decoded.qualificationReport;
  if(q.status!=='PASS_ALL500_CURRENT_ORIGINAL_MOCK_BINDINGS'||q.completedOwners!==500||q.qualifiedOwners!==500
    ||q.failedOwners!==0||q.qualifiedAssetsPinned!==true||q.sourceDatesRewritten!==false)throw Error();
  for(const [key,alias]of [['qualifiedRows','rows'],['qualifiedFixtures','fixtures']])
    if(q.qualifiedAssets?.[alias]?.bytes!==pins[key][0]||q.qualifiedAssets[alias].sha256!==pins[key][1])throw Error();
  // The approval is bound to the actual runtime day, never a backdated clock.
  const now=new Date().toISOString(),berlin=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
  if(value.executionISO?.slice(0,10)!==now.slice(0,10)||berlin(value.executionISO)!==berlin(now))throw Error();
  const report=inspectRows({rows:decoded.qualifiedRows,fixtures:decoded.qualifiedFixtures,executionISO:value.executionISO,historicalExecutionISO:q.executionISO});
  process.stdout.write(JSON.stringify(report)+'\n');
}catch{process.stderr.write('INPUT_CONTEXT_FILE_BINDING_REJECTED\n');process.exitCode=1;}
