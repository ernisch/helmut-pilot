"use strict";

// Private Offline-JSON-Vorbereitung; kein Runtime-, Auth-, SQL- oder HTTP-Zugriff.
const fs = require("node:fs");
const path = require("node:path");
const C = require("../lib/helmut/synthetik-500-kosten-plan");
const { argumente } = require("./synthetik-500-kosten-intents");
const { schreibePrivat } = require("./realkohorte-500-start-sql");
function lesePrivat(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("synthetik500-kostenplan-private-eingabe");
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > 64 * 1024 * 1024)
      throw new Error("synthetik500-kostenplan-private-eingabe");
    return JSON.parse(fs.readFileSync(fd, "utf8"));
  } finally { fs.closeSync(fd); }
}
function main(argv) {
  const args = argumente(argv), paket = lesePrivat(args.paket);
  const plan = C.vorbereite(paket, lesePrivat(args.eingaben));
  if (args.out) schreibePrivat(args.out, C.serialisiere(plan, paket));
  const meta = { ...C.pruefe(plan, paket), privateDateiErstellt: Boolean(args.out) };
  console.log(JSON.stringify(meta));
  return meta;
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(/^synthetik500-(kostenplan|intents)-[a-z0-9-]+$/.test(error.message || "")
      ? error.message : "synthetik500-kostenplan-private-vorbereitung-verweigert");
    process.exitCode = 1;
  }
}
module.exports = { argumente, lesePrivat, main };
