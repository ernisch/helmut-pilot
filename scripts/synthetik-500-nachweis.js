"use strict";

// Nur lokale JSON-Dateien; kein Productionclient und keine Fachurteilserzeugung.
const fs = require("node:fs");
const N = require("../lib/helmut/synthetik-500-nachweis");
const { schreibePrivat } = require("./realkohorte-500-start-sql");
function argumente(argv) {
  if (!Array.isArray(argv) || argv.length !== 8) throw new Error("synthetik500-nachweis-cli-argumente");
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]?.slice(2);
    if (!["paket", "sollplan", "export", "out"].includes(k) || argv[i] !== "--" + k
      || Object.hasOwn(o, k) || typeof argv[i + 1] !== "string" || !argv[i + 1].trim())
      throw new Error("synthetik500-nachweis-cli-argumente");
    o[k] = argv[i + 1];
  }
  return o;
}
function main(argv) {
  const o = argumente(argv), lies = name => JSON.parse(fs.readFileSync(o[name], "utf8"));
  const paket = lies("paket"), sollplan = lies("sollplan"), daten = lies("export");
  const r = N.bilanziere({ paket, sollplan, ergebnisse: daten.ergebnisse, sichten: daten.sichten,
    urteile: daten.urteile, belege: daten.belege });
  schreibePrivat(o.out, JSON.stringify(r, null, 2) + "\n");
  // Texte, IDs und interne Belegreferenzen nicht ins Terminal/CI ausgeben.
  console.log(JSON.stringify({ version: r.version, status: r.status, zaehlungen: r.zaehlungen,
    nachweisHash: r.nachweisHash, technischReadyOffline: r.technischReadyOffline,
    primaerbelegvertragVollstaendig: r.primaerbelegvertragVollstaendig,
    unabhaengigeEndpruefung: r.unabhaengigeEndpruefung, productionNachweisErfolgreich: false }));
  if (!r.belegpaketBereitZurUnabhaengigenPruefung) process.exitCode = 1;
  return r;
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(/^synthetik500-nachweis-[a-z0-9-]+$/.test(e.message || "") ? e.message : "synthetik500-nachweis-private-eingabe-ausgabe-verweigert"); process.exitCode = 1; }
}
module.exports = { argumente, main };
