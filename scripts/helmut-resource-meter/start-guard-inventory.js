'use strict';
// Parse CODE only. Never import/execute a consumer (several are effectful IIFEs).
// Acorn is shipped inside the exact pinned Node runtime; no network/dependency install.
const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
function parser() {
  const source = process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'];
  if (typeof source !== 'string') throw Error('Pinned Node has no bundled Acorn; stop');
  const module = { exports: {} };
  vm.runInNewContext(source, { exports: module.exports, module }, { timeout: 5000 });
  return module.exports;
}
function inventory(file) {
  const bytes = fs.readFileSync(file), source = bytes.toString('utf8');
  const ast = parser().parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  const guards = [], requires = [];
  function walk(node, context = '<module>') {
    if (!node || typeof node !== 'object') return;
    let scope = context;
    if (/Function/.test(node.type)) scope = node.id?.name || context + '/<closure>';
    if (node.type === 'CallExpression') {
      const callee = source.slice(node.callee.start, node.callee.end);
      if (callee === 'require') {
        requires.push({ line: node.loc.start.line, literal: node.arguments[0]?.value ?? null,
          expression: source.slice(node.arguments[0]?.start, node.arguments[0]?.end) });
      }
      // Include ALL calls: consumers can hide mandatory validators behind any
      // alias/name. The inventory itself never labels a call semantically safe.
      {
        guards.push({ line: node.loc.start.line, endLine: node.loc.end.line, function: scope,
          kind: 'call', callee, sha256: sha(source.slice(node.start, node.end)),
          expression: source.slice(node.start, node.end) });
      }
    }
    if (node.type === 'ThrowStatement') guards.push({ line: node.loc.start.line,
      endLine: node.loc.end.line, function: scope, kind: 'throw',
      sha256: sha(source.slice(node.start, node.end)), expression: source.slice(node.start, node.end) });
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(value)) value.forEach(v => walk(v, scope));
      else if (value && typeof value === 'object') walk(value, scope);
    }
  }
  walk(ast);
  return { path: file, bytes: bytes.length, sha256: sha(bytes), guards, requires };
}
if (require.main === module) {
  const files = JSON.parse(fs.readFileSync(0, 'utf8'));
  process.stdout.write(JSON.stringify(files.map(inventory)) + '\n');
}
module.exports = { inventory };
