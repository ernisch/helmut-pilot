#!/usr/bin/env node
"use strict";
// Rein lokaler Reader: keine Env-, Runtime-, Provider-, DB- oder HTTP-Imports.
const fs = require("node:fs");
const path = require("node:path");
const R = require("../lib/helmut/synthetik-500-provider-routen");
function leseQuellen(root) {
  const files = [];
  function add(relative) {
    const full = path.join(root, relative), stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error("synthetik500-routen-source-symlink");
    if (!stat.isFile()) throw new Error("synthetik500-routen-source-keine-datei");
    files.push({ path: relative, bytes: fs.readFileSync(full) });
  }
  function walk(relative, extensions) {
    const dir = path.join(root, relative), stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("synthetik500-routen-source-verzeichnis");
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const rel = relative + "/" + e.name;
      if (e.isSymbolicLink()) throw new Error("synthetik500-routen-source-symlink");
      if (e.isDirectory()) walk(rel, extensions);
      else if (e.isFile() && extensions.includes(path.extname(e.name))) add(rel);
    }
  }
  for (const dir of ["lib", "scripts", "api"]) walk(dir, [".js"]);
  walk(".github/workflows", [".yml", ".yaml"]);
  for (const f of ["server.js", "vercel.json", "package.json"]) add(f);
  return files;
}
function main(argv) {
  if (argv.length < 1 || argv.length > 2 || argv.some(x => x.startsWith("--")))
    throw new Error("Aufruf: node scripts/synthetik-500-provider-routen.js NEUES_PRIVATES_AUSGABEDIR [DEKLARATIONEN_JSON]");
  const out = path.resolve(argv[0]);
  if (!path.isAbsolute(argv[0])) throw new Error("synthetik500-routen-ausgabe-absolut");
  fs.mkdirSync(out, { mode: 0o700 }); // EXCL: bestehender Ordner wird nicht benutzt
  const root = path.resolve(__dirname, "..");
  const files = leseQuellen(root);
  const input = argv[1] === undefined ? null : JSON.parse(fs.readFileSync(path.resolve(argv[1]), "utf8"));
  const inventory = R.vorbereite(files, input);
  R.pruefeInventar(inventory, files);
  const write = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  write("provider-routen.json", inventory);
  const raw = fs.readFileSync(path.join(out, "provider-routen.json"));
  const code = ["lib/helmut/synthetik-500-provider-routen.js", "scripts/synthetik-500-provider-routen.js"].map(p => {
    const bytes = fs.readFileSync(path.join(root, p)); return { path: p, bytes: bytes.length, sha256: R.bytesHash(bytes) };
  });
  write("freeze.json", { version: "helmut-synthetik500-provider-routen-freeze/1", inventoryHash: inventory.inventoryHash,
    sourceGraphHash: inventory.source.sourceGraphHash, code, files: [{ path: "provider-routen.json", bytes: raw.length, sha256: R.bytesHash(raw) }],
    executionReady: false, runtimeEnforcement: false, paidGo: false });
  console.log(JSON.stringify({ outputDirectory: out, inventoryHash: inventory.inventoryHash,
    sourceGraphHash: inventory.source.sourceGraphHash, routes: inventory.paidRoutes.length,
    sourceFiles: inventory.source.sourceRefs.length, runtimeEnforcement: false, executionReady: false }));
  return inventory;
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { leseQuellen, main };
