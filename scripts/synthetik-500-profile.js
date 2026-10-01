"use strict";

// Default: nur redigierte Metadaten. --out schreibt private lokale JSON-Daten;
// kein Importclient, kein SQL, keine Authkonten und keine Aktivierung.
const P = require("../lib/helmut/synthetik-500-profile");
const { schreibePrivat } = require("./realkohorte-500-start-sql");

function argumente(argv) {
  if (!Array.isArray(argv) || argv.length % 2 || argv.length > 4) throw new Error("synthetik500-cli-argumente");
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i] === "--variante" ? "variante" : argv[i] === "--out" ? "out" : null;
    if (!key || Object.hasOwn(o, key) || typeof argv[i + 1] !== "string" || !argv[i + 1].trim()
      || argv[i + 1] !== argv[i + 1].trim()) throw new Error("synthetik500-cli-argumente");
    o[key] = argv[i + 1];
  }
  return o;
}
function main(argv) {
  const o = argumente(argv), paket = P.erzeuge(o.variante === undefined ? {} : { variante: o.variante });
  if (o.out) schreibePrivat(o.out, P.serialisiere(paket));
  const meta = { ...P.metadaten(paket), privateDateiErstellt: Boolean(o.out) };
  console.log(JSON.stringify(meta));
  return meta;
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    const code = /^(?:synthetik500|real500-startsql)-[a-z0-9-]+$/.test(error.message || "")
      ? error.message : "synthetik500-private-ausgabe-verweigert";
    console.error(code); process.exitCode = 1;
  }
}
module.exports = { argumente, main };
