"use strict";
// Standard und einziger CLI-Modus: private lokale Vorbereitung. Keine Simulation,
// SQL-Erzeugung, Installation, Aktivierung, Netzwerk- oder Provideraufrufe.
const fs = require("node:fs");
const path = require("node:path");
const E = require("../lib/helmut/synthetik-500-executor");
const { schreibePrivat } = require("./realkohorte-500-start-sql");
function argumente(argv) {
  const args = {};
  if (!Array.isArray(argv) || ![2, 4, 6].includes(argv.length)) throw Error("synthetik500-executor-cli-argumente");
  for (let i = 0; i < argv.length; i += 2) {
    const k = { "--paket": "paket", "--eingaben": "eingaben", "--out": "out" }[argv[i]];
    if (!k || Object.hasOwn(args, k) || typeof argv[i + 1] !== "string"
      || !path.isAbsolute(argv[i + 1]) || argv[i + 1] !== argv[i + 1].trim()) throw Error("synthetik500-executor-cli-argumente");
    args[k] = argv[i + 1];
  }
  if (!args.paket) throw Error("synthetik500-executor-cli-argumente");
  return args;
}
function lesePrivat(file) {
  const s = fs.lstatSync(file);
  if (!s.isFile() || (s.mode & 0o777) !== 0o600 || s.size > 16 * 1024 * 1024) throw Error("synthetik500-executor-private-eingabe");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function main(argv) {
  const a = argumente(argv), paket = lesePrivat(a.paket);
  const v = E.vorbereite(paket, a.eingaben ? lesePrivat(a.eingaben) : E.offeneEingaben());
  if (a.out) schreibePrivat(a.out, JSON.stringify(v, null, 2) + "\n");
  const r = { version: E.VERSION, executorHash: v.executorHash, strukturVollstaendig: v.strukturVollstaendig,
    erwarteteAusgaben: v.erwartetePositionen.length, fehlendeEingaben: v.fehlendeEingaben,
    offeneProductionTore: v.offeneProductionTore, privateDateiErstellt: Boolean(a.out),
    productionReady: false, startrecht: false, modellaufrufe: 0, schreibaufrufe: 0 };
  console.log(JSON.stringify(r)); return r;
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(/^synthetik500-executor-[a-z0-9-]+$/.test(e.message || "")
    ? e.message : "synthetik500-executor-private-vorbereitung-verweigert"); process.exitCode = 1; }
}
module.exports = { argumente, lesePrivat, main };
