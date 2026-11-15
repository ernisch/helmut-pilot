"use strict";

// Nur Offline-Tests der alten synthetischen Einzelversuche. Der echte Aufrufer
// behaelt seine PROMPTS-Hashes und lehnt den heutigen geaenderten Generator ab.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const crypto = require("node:crypto"), zlib = require("node:zlib");
function ladeHistorisch(name) {
  const file = require.resolve("../" + name);
  const fixture = require("./prosa-historische-prompts.json");
  const bytes = Buffer.from(fixture.gzipBase64, "base64");
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== fixture.sha256)
    throw Error("historische-prosa-fixture-abweichend");
  const rows = JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: 256 * 1024 }));
  const schemaArchiv = require("./prosa-historisches-schema.json");
  const schemaText = zlib.gunzipSync(Buffer.from(schemaArchiv.gzipBase64, "base64"), { maxOutputLength: 64 * 1024 });
  if (crypto.createHash("sha256").update(schemaText).digest("hex") !== schemaArchiv.sha256)
    throw Error("historisches-prosa-schema-abweichend");
  const schemaModul = new Module(file + ".historisches-schema", module);
  schemaModul._compile(schemaText.toString("utf8"), schemaModul.id);
  const real = require("../../lib/helmut/understanding");
  const m = new Module(file, module); m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  const original = m.require.bind(m);
  m.require = id => id === "../lib/helmut/understanding-schema" ? schemaModul.exports : id === "../lib/helmut/understanding" ? { ...real,
    buildUnderstandingPrompt: cluster => {
      const docs = cluster.documents || [];
      const row = docs.length === 1 && rows.find(r => r.id === docs[0].id);
      if (!row || !require("node:util").isDeepStrictEqual(cluster, row.cluster))
        throw Error("historischer-prosa-testfall-unbekannt");
      return row.prompt;
    } } : original(id);
  m._compile(fs.readFileSync(file, "utf8"), file);
  return m.exports;
}
module.exports = { ladeHistorisch };
