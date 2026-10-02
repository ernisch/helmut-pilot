"use strict";

// Nur private lokale JSON-Eingaben/Inventur; kein HTTP, SQL oder Runtime-Import.
const fs = require("node:fs");
const path = require("node:path");
const I = require("../lib/helmut/synthetik-500-kosten-intents");
const { schreibePrivat } = require("./realkohorte-500-start-sql");
function argumente(argv) {
  const args = {};
  if (!Array.isArray(argv) || ![4, 6].includes(argv.length)) throw new Error("synthetik500-intents-cli-argumente");
  for (let i = 0; i < argv.length; i += 2) {
    const key = { "--paket": "paket", "--eingaben": "eingaben", "--out": "out" }[argv[i]];
    if (!key || Object.hasOwn(args, key) || typeof argv[i + 1] !== "string"
      || argv[i + 1] !== argv[i + 1].trim() || !path.isAbsolute(argv[i + 1]))
      throw new Error("synthetik500-intents-cli-argumente");
    args[key] = argv[i + 1];
  }
  if (!args.paket || !args.eingaben) throw new Error("synthetik500-intents-cli-argumente");
  return args;
}
function lesePrivat(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > 4 * 1024 * 1024)
    throw new Error("synthetik500-intents-private-eingabe");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function main(argv) {
  const args = argumente(argv), paket = lesePrivat(args.paket);
  const vorbereitung = I.vorbereite(paket, lesePrivat(args.eingaben));
  if (args.out) schreibePrivat(args.out, I.serialisiere(vorbereitung, paket));
  const meta = { ...I.pruefe(vorbereitung, paket), privateDateiErstellt: Boolean(args.out) };
  console.log(JSON.stringify(meta));
  return meta;
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(/^synthetik500-intents-[a-z0-9-]+$/.test(error.message || "")
      ? error.message : "synthetik500-intents-private-vorbereitung-verweigert");
    process.exitCode = 1;
  }
}
module.exports = { argumente, lesePrivat, main };
