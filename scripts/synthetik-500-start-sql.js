"use strict";
// Rein lokale Vorbereitung. Kein Client, keine Anwendung. Paket explizit binden.
const fs = require("node:fs");
const V = require("../lib/helmut/synthetik-500-vertrag");
const S = require("../lib/helmut/synthetik-500-startschutz");
const F = require("./realkohorte-500-start-sql");
function erzeugeStartSql(bytes) {
  return F.erzeugeStartSql(V.erzeugeVertrag(bytes), S.erzeugeStartschutz(bytes), { synthetik: true });
}
function main(argv) {
  V.fordere(argv.length===6 && argv[0]==="--paket" && argv[2]==="--input" && argv[4]==="--out", "startsql-cli-argumente");
  const bytes = fs.readFileSync(argv[1]), input = JSON.parse(fs.readFileSync(argv[3],"utf8"));
  V.fordere(Object.keys(input).every(k=>["runtimeManifest","snapshot","belege","schritt","aktivierungsGo"].includes(k)),"startsql-cli-eingabe");
  const g = erzeugeStartSql(bytes);
  g.schreibePrivat(argv[5],g.baueSql(input,bytes));
  console.log("Private Synthetik-Startvorbereitung erstellt (0600). Nichts angewendet; keine Aktivierungsfreigabe.");
}
if (require.main===module) {
  try { main(process.argv.slice(2)); } catch { console.error("Synthetik-Startvorbereitung verweigert."); process.exitCode=1; }
}
module.exports = { erzeugeStartSql, main };
