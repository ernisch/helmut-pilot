'use strict';
// Evaluate the actual checked-in job conditions; no jobs, secrets or network.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8');
const mode = 'mock500-materials-capsule-readback';
const parts = source.slice(source.indexOf('jobs:\n') + 6).split(/^  ([a-zA-Z0-9_-]+):\n/m);
const jobs = {};
for (let i = 1; i < parts.length; i += 2) jobs[parts[i]] = parts[i + 1];
function evaluate(expression, event, selected) {
  const value = expression.replace(/^\s*\$\{\{/, '').replace(/\}\}\s*$/, '');
  return vm.runInNewContext('(' + value + ')', {
    github: {event_name: event, ref: 'refs/heads/codex/w15-github-end500-preparation-20261028', head_ref: ''},
    inputs: {w15_mode: selected}, format: (pattern, item) => pattern.replace('{0}', item)
  }, {timeout: 100});
}
function enabled(event, selected) {
  return Object.entries(jobs).filter(([, block]) => {
    const match = block.match(/^    if: (.+)$/m);
    assert(match, 'Every existing job must retain an explicit admission condition');
    return evaluate(match[1], event, selected);
  }).map(([name]) => name).sort();
}
assert.deepEqual(enabled('workflow_dispatch', mode), ['w15-materials-capsule-readback']);
assert.deepEqual(enabled('pull_request', mode), ['browser-smoke', 'offline-suite']);
assert.deepEqual(enabled('workflow_dispatch', 'standard'), ['browser-smoke', 'offline-suite']);
for (const [selected, expected] of [
  ['mock500-full-host-functional-gated', 'mock500-full-gated'],
  ['mock500-materials-diagnostic-gated', 'mock500-full-gated'],
  ['end500-receiver-check', 'w15-receiver-check']
]) assert.deepEqual(enabled('workflow_dispatch', selected), [expected]);
const cancel = source.match(/^  cancel-in-progress: (.+)$/m)[1];
assert.equal(evaluate(cancel, 'workflow_dispatch', mode), false);
const group = source.match(/^  group: (.+)$/m)[1];
assert.equal(evaluate(group.slice(group.lastIndexOf('${{')), 'workflow_dispatch', mode), '-w15-functional-chain');
const job = jobs['w15-materials-capsule-readback'];
assert.match(job, /^    environment: helmut-ci-originals$/m);
assert.match(job, /^    timeout-minutes: 5$/m);
assert.match(job, /^      contents: read\n      actions: read$/m);
assert(!/upload-artifact|cache@|docker|postgrest|restore_workflow|mock500_workflow/.test(job));
const transport = fs.readFileSync(path.join(__dirname, 'artifact_transport.py'), 'utf8');
assert.match(transport, /d3f86a106a0bac45b974a628896c90dbdf5c8093/);
assert.match(job, /'artifact-ids': '13193926779'/);
assert.match(job, /'run-id': '41554774560'/);
assert.match(job, /existing_capsule_readonly=True/);
assert.match(job, /except BaseException:\n\s+print\(json.dumps\(\{'status': 'FAIL_OR_BLOCKED_EXISTING_CAPSULE_CIPHER_DOWNLOAD'\}\)\)/);
assert(job.indexOf('--admit-existing-capsule-readonly') < job.indexOf("transport._tool('download'"));
assert(job.indexOf("transport._tool('download'") < job.indexOf('--read-existing-capsule-only'));
for (const line of job.split('\n').filter(line => /^        run:/.test(line) && !line.endsWith('|'))) {
  assert(!line.includes('${{'), 'Workflow inputs must never be interpolated into shell code');
  assert(line.includes('"$EXPECTED_COMMIT"') && line.includes('"$RUNNER_TEMP"'));
}
assert.equal((job.match(/HELMUT_W15_RECEIVER_PROTECTED_KEY_B64:/g) || []).length, 1);
assert.equal((job.match(/HELMUT_W15_RECEIVER_PASSPHRASE:/g) || []).length, 1);
console.log('PASS closed capsule-only route, old routes, noncancellation, fixed artifact and input isolation');
