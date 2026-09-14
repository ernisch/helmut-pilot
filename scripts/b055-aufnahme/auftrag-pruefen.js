'use strict';
const fs = require('node:fs'), cp = require('node:child_process'), A = require('node:assert/strict');
const {validateRequest} = require('./aufnahme');
function gate(req,env,now=new Date(),git=cp.execFileSync) {
  A.equal(env.GITHUB_REPOSITORY,'ernisch/helmut-pilot');
  A.equal(env.GITHUB_REF,'refs/heads/codex/b055-relative-fristen-20260914');
  A.equal(env.GITHUB_EVENT_NAME,'push'); A.equal(env.GITHUB_RUN_ATTEMPT,'1');
  if(req.freigegeben === false) return false;
  validateRequest(req); A.match(req.codeCommit,/^[a-f0-9]{40}$/);
  const until = Date.parse(req.gueltigBisUtc); A(Number.isFinite(until) && until > now.getTime() && until-now.getTime() <= 24*3600000);
  git('git',['diff','--quiet',req.codeCommit,'--','scripts','.github/workflows',':(exclude)scripts/b055-aufnahme/auftrag.json'],{stdio:'pipe'});
  return true;
}
if(require.main === module) {
  try {
    const req = JSON.parse(fs.readFileSync('scripts/b055-aufnahme/auftrag.json','utf8'));
    const enabled = gate(req,process.env);
    A(process.env.GITHUB_OUTPUT);
    fs.appendFileSync(process.env.GITHUB_OUTPUT,`enabled=${enabled}\n`);
    console.log(enabled ? 'Einmalige B055 Aufnahme freigegeben.' : 'B055 Aufnahme ausgeschaltet.');
  } catch {console.error('B055 Auftrag nicht bestätigt.'); process.exitCode=1;}
}
module.exports={gate};
