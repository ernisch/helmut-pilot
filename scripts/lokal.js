"use strict";

// Helmut — LOKALER STARTER (OP-30, Korrektursprint).
// =============================================================================================
// WOZU: `scripts/lokaler-netzschutz.js` bricht fail closed ab, sobald Production-Kennungen in
// der Umgebung liegen. Das ist richtig — aber in einer Sitzung, in der diese Variablen nun
// einmal gesetzt SIND, waere die Folge, dass man vor jedem Aufruf von Hand ein langes
// `env -u …` tippt. Genau solche Handarbeit wird irgendwann vergessen; das Vergessen war die
// Ursache des Vorfalls vom 2026-08-08.
//
// Dieser Starter nimmt die Handarbeit ab: er entfernt die Zugangsdaten AUS DER UMGEBUNG DES
// KINDPROZESSES (nie aus einer Datei, nie dauerhaft), setzt `HELMUT_SOURCE_MODE=off` und
// laedt den Schutz als Preload. Danach kann der gestartete Befehl Production nicht mehr
// erreichen — weder versehentlich noch absichtlich.
//
// AUFRUF:
//   node scripts/lokal.js scripts/irgendein-skript.js [argumente…]
//   node scripts/lokal.js --  node -e '…'
//
// WAS ER NICHT TUT: er aendert keine Datei, kein Flag und keine dauerhafte Konfiguration.
// Die Zugangsdaten der Sitzung bleiben unangetastet — sie werden nur nicht weitergereicht.

const path = require("path");
const { spawnSync } = require("child_process");

const SCHUTZ = path.join(__dirname, "lokaler-netzschutz.js");
const { PRODUCTION_KENNUNGEN } = (() => {
  process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN = "ja";
  const m = require(SCHUTZ);
  delete process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN;
  return m;
})();

// SPEICHERWAHL-SCHALTER (Skalierungssprint 2026-08-25).
// ---------------------------------------------------------------------------
// Diese beiden Variablen sind KEINE Zugangsdaten und standen deshalb nicht in
// PRODUCTION_KENNUNGEN — sie entscheiden aber laut lib/helmut/production-schreibgate.js
// (§ "URSACHE — zwei UNABHAENGIGE Schalter") darueber, WOHIN geschrieben wird:
//   * HELMUT_V3_STORE=1        -> Fachtabellen ueber den V3-Store
//   * HELMUT_STORAGE_BACKEND   -> Betriebsdaten ueber Supabase
// In einer Cloud-Sitzung sind sie gesetzt. Da die Zugangsdaten oben bereits entfernt
// werden, konnte damit zwar nichts Production erreichen — aber der Lauf verhielt sich
// ANDERS als der kanonische Offline-Lauf und als die CI. Belegt am 2026-08-25:
// `HELMUT_V3_STORE=1` liess privacy-vollstaendigkeit, provision-tenant und
// tenant-neutrality scheitern, `HELMUT_STORAGE_BACKEND=supabase` profile-db —
// vier Fehlschlaege, die in der CI nicht auftreten (dort 277/277 gruen).
// Der lokale Lauf wird deshalb hart auf den lokalen Dateimodus gestellt. Das
// schwaecht keine einzige Zusicherung ab: die Suiten pruefen unveraendert dasselbe,
// nur eben in der Umgebung, fuer die sie geschrieben sind.
const SPEICHERWAHL = { HELMUT_STORAGE_BACKEND: "local", HELMUT_V3_STORE: "" };

function baueUmgebung(basis) {
  const env = { ...basis };
  for (const name of PRODUCTION_KENNUNGEN) delete env[name];
  // Der Quellenmodus wird hart auf `off` gesetzt, nicht nur geprueft.
  env.HELMUT_SOURCE_MODE = "off";
  // Speicherwahl deterministisch auf lokal — siehe Begruendung oben.
  env.HELMUT_STORAGE_BACKEND = SPEICHERWAHL.HELMUT_STORAGE_BACKEND;
  delete env.HELMUT_V3_STORE;
  // Preload fuer den Kindprozess UND alle seine Kinder.
  const vorhandene = String(env.NODE_OPTIONS || "");
  if (!vorhandene.includes(SCHUTZ)) env.NODE_OPTIONS = (vorhandene + ` --require ${SCHUTZ}`).trim();
  env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN = "";
  delete env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN;
  return env;
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.log("Aufruf: node scripts/lokal.js <skript.js> [argumente…]");
    console.log("        node scripts/lokal.js -- node -e '…'");
    console.log("");
    console.log("Entfernt Production-Zugangsdaten aus der Umgebung des Kindprozesses,");
    console.log("erzwingt HELMUT_SOURCE_MODE=off und laedt den lokalen Netzschutz.");
    console.log("Entfernt werden (nur im Kindprozess): " + PRODUCTION_KENNUNGEN.join(", "));
    process.exit(0);
  }

  const env = baueUmgebung(process.env);
  const entfernt = PRODUCTION_KENNUNGEN.filter((n) => process.env[n] && !env[n]);
  if (entfernt.length) {
    console.error(`[lokal] ${entfernt.length} Zugangsdaten NICHT an den Kindprozess weitergereicht `
      + `(${entfernt.join(", ")}) — Werte bleiben in dieser Sitzung unveraendert.`);
  }
  const umgestellt = Object.keys(SPEICHERWAHL)
    .filter((n) => String(process.env[n] || "") !== String(env[n] || ""));
  if (umgestellt.length) {
    console.error(`[lokal] Speicherwahl fuer den Kindprozess auf lokal gestellt (${umgestellt.join(", ")}) `
      + "— Werte bleiben in dieser Sitzung unveraendert.");
  }

  const [erst, ...rest] = argv;
  const befehl = erst === "--" ? rest[0] : process.execPath;
  const args = erst === "--" ? rest.slice(1) : argv;

  const r = spawnSync(befehl, args, { stdio: "inherit", env });
  process.exit(r.status == null ? 1 : r.status);
}

main();
