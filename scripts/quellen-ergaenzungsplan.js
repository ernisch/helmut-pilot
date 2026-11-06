"use strict";

// Ausschliesslich lokale Artefakte; kein Apply-/DB-/Netzpfad. Der Baseline-Export
// muss alle zehn Quellentabellen samt serverseitig geprueften counts enthalten.
const fs = require("fs");
const path = require("path");
const P = require("../lib/helmut/quellenarchitektur/ergaenzungsplan");

const HELP = "node scripts/quellen-ergaenzungsplan.js --baseline SNAPSHOT.json --out VERZEICHNIS [--desired KATALOG.json] [--include-landesmodule] [--receipt APPLY-RECEIPT.json]\nErzeugt plan.json, apply.sql, rollback.sql. Fuehrt niemals SQL aus.\nBaseline: {complete:true,capturedAt:ISO,counts:{TABELLENNAME:ANZAHL},tables:{TABELLENNAME:[ZEILEN]}}.\nTabellen: " + P.TABLES.join(", ");

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") opts.help = true;
    else if (arg === "--include-landesmodule") opts.includeLandesmodule = true;
    else if (["--baseline", "--out", "--desired", "--receipt"].includes(arg)) {
      if (!argv[i + 1] || argv[i + 1].startsWith("--") || opts[arg.slice(2)]) throw new Error(`Ungueltiges Argument: ${arg}`);
      opts[arg.slice(2)] = argv[++i];
    } else throw new Error(`Nicht unterstuetztes Argument: ${arg}; dieses Werkzeug fuehrt niemals SQL aus`);
  }
  if (!opts.help && (!opts.baseline || !opts.out)) throw new Error("--baseline und --out sind erforderlich");
  if (opts.desired && opts.includeLandesmodule) throw new Error("--desired und --include-landesmodule nicht kombinieren");
  return opts;
}
function defaultDesired(includeLandesmodule) {
  const model = require("../lib/helmut/quellenarchitektur").buildFullModel();
  if (!includeLandesmodule) return model;
  const extra = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen").buildLandesmodulSeed();
  const base = P.normalizeDesired(model), land = P.normalizeDesired(extra);
  for (const t of P.TABLES) {
    const keys = new Map(base[t].map((r) => [P.stringify(P.SPECS[t].pk.map((k) => r[k])), r]));
    for (const r of land[t]) {
      const k = P.stringify(P.SPECS[t].pk.map((c) => r[c])), old = keys.get(k);
      if (!old) { base[t].push(r); keys.set(k, r); }
      else if ((t === "publishers" && old.canonical_domain !== r.canonical_domain) || (t === "retrieval_paths" && (old.publisher_id !== r.publisher_id || old.url !== r.url))) throw new Error(`Landesmodul kollidiert mit Sollkatalog: ${t} ${k}`);
    }
  }
  return { tables: base };
}
function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) { process.stdout.write(HELP + "\n"); return; }
  const read = (file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = P.artifacts(read(opts.baseline), opts.desired ? read(opts.desired) : defaultDesired(opts.includeLandesmodule), opts.receipt ? read(opts.receipt) : undefined);
  const dir = path.resolve(opts.out);
  // Vorhandene reviewte Artefakte nicht versehentlich ersetzen.
  fs.mkdirSync(dir, { recursive: true });
  const files = { "plan.json": JSON.stringify(result.plan, null, 2) + "\n", "apply.sql": result.applySql, "rollback.sql": result.rollbackSql };
  for (const name of Object.keys(files)) if (fs.existsSync(path.join(dir, name))) throw new Error(`Zieldatei besteht bereits: ${name}`);
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body, { flag: "wx" });
  process.stdout.write(JSON.stringify({ planHash: result.plan.planHash, additions: result.plan.counts, deferred: result.plan.deferred.length, sqlExecuted: false, output: dir }, null, 2) + "\n");
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(String(err.message) + "\n"); process.exitCode = 1; }
}
module.exports = { HELP, parseArgs, defaultDesired, main };
