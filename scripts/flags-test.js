"use strict";

// Test des Deployment-Flag-Mechanismus (lib/helmut/flags.js + helmut-flags.json).
// Beweist die Sicherheitseigenschaften:
//   1. Präzedenz: env > Datei > Default (eine gesetzte Env-Variable gewinnt IMMER)
//   2. Hermetik: injizierte Test-Envs sehen die Datei-Flags NICHT (off-Defaults kippen nie)
//   3. Allowlist: nur die freigegebenen Schlüssel wirken; Secrets/Fremdnamen sind unerreichbar
//   4. Fail-closed: fehlende/kaputte/nicht-objektförmige Datei => Code-Defaults
//   5. Die eingecheckte helmut-flags.json enthält GENAU die freigegebene Shadow-Schaltung
//   6. Guards (gateMode/dispatchMode) folgen der Präzedenz korrekt

const fs = require("fs");
const os = require("os");
const path = require("path");
const flags = require("../lib/helmut/flags");
const { gateMode } = require("../lib/helmut/quellenarchitektur/understanding-gate");
const { dispatchMode } = require("../lib/helmut/quellenarchitektur/pardok-dispatch");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function tmpJson(content) {
  const file = path.join(os.tmpdir(), `helmut-flags-test-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, content);
  return file;
}

// --- 1) Präzedenz -------------------------------------------------------------------------
{
  const fileFlags = { HELMUT_UNDERSTANDING_GATE: "shadow" };
  const env = { HELMUT_UNDERSTANDING_GATE: "off" };
  check("1a env gewinnt gegen Datei", flags.flagInfo("HELMUT_UNDERSTANDING_GATE", env, { fileFlags }).quelle === "env");
  check("1b env-Wert wird geliefert", flags.flagValue("HELMUT_UNDERSTANDING_GATE", env, { fileFlags }) === "off");
  check("1c ohne env greift Datei", flags.flagInfo("HELMUT_UNDERSTANDING_GATE", {}, { fileFlags }).quelle === "datei");
  check("1d Datei-Wert wird geliefert", flags.flagValue("HELMUT_UNDERSTANDING_GATE", {}, { fileFlags }) === "shadow");
  check("1e ohne beides: Default", flags.flagInfo("HELMUT_UNDERSTANDING_GATE", {}, { fileFlags: {} }).quelle === "default"
    && flags.flagValue("HELMUT_UNDERSTANDING_GATE", {}, { fileFlags: {} }) === null);
  check("1f leerer env-String zählt als nicht gesetzt", flags.flagInfo("HELMUT_UNDERSTANDING_GATE", { HELMUT_UNDERSTANDING_GATE: "  " }, { fileFlags }).quelle === "datei");
}

// --- 2) Hermetik: injizierte Envs sehen die echte Datei NICHT ------------------------------
{
  // Die eingecheckte helmut-flags.json setzt GATE=shadow. Ein injiziertes leeres env
  // (Testmuster ueberall in der Suite) MUSS trotzdem off liefern.
  check("2a gateMode({}) bleibt off trotz Datei-Flag shadow", gateMode({}) === "off");
  check("2b dispatchMode({}) bleibt off trotz Datei-Flag shadow", dispatchMode({}) === "off");
  check("2c gateMode({GATE:'off'}) bleibt off", gateMode({ HELMUT_UNDERSTANDING_GATE: "off" }) === "off");
  // Die ECHTE Prozessumgebung nutzt die Datei (Prod-Verhalten): hier nur pruefen, dass
  // die Aufloesung der Datei-Ebene fuer process.env aktiv ist, OHNE process.env zu mutieren.
  const real = flags.flagInfo("HELMUT_UNDERSTANDING_GATE", process.env);
  const envGesetzt = process.env.HELMUT_UNDERSTANDING_GATE != null && String(process.env.HELMUT_UNDERSTANDING_GATE).trim() !== "";
  check("2d process.env-Aufloesung: env-Wert oder Datei-Flag shadow", envGesetzt ? real.quelle === "env" : (real.quelle === "datei" && real.wert === "shadow"));
}

// --- 3) Allowlist -------------------------------------------------------------------------
{
  const file = tmpJson(JSON.stringify({
    HELMUT_UNDERSTANDING_GATE: "shadow",
    SUPABASE_SERVICE_ROLE_KEY: "GEHEIM-DARF-NIE-WIRKEN",
    HELMUT_MAX_LLM_CALLS_PER_DAY: "999999",
    EVIL_FLAG: "x"
  }));
  const loaded = flags.loadFileFlags(file);
  check("3a Allowlist-Schluessel wird geladen", loaded.HELMUT_UNDERSTANDING_GATE === "shadow");
  check("3b Secret-Schluessel wird ignoriert", loaded.SUPABASE_SERVICE_ROLE_KEY === undefined);
  check("3c Kostenschalter ist NICHT dateisteuerbar (bleibt exklusiv beim Betreiber)", loaded.HELMUT_MAX_LLM_CALLS_PER_DAY === undefined);
  check("3d Fremdschluessel wird ignoriert", loaded.EVIL_FLAG === undefined);
  fs.rmSync(file);
}

// --- 4) Fail-closed -----------------------------------------------------------------------
{
  check("4a fehlende Datei => {}", JSON.stringify(flags.loadFileFlags(path.join(os.tmpdir(), "gibt-es-nicht-xyz.json"))) === "{}");
  const broken = tmpJson("{ kaputt");
  check("4b kaputte Datei => {}", JSON.stringify(flags.loadFileFlags(broken)) === "{}");
  fs.rmSync(broken);
  const arr = tmpJson("[1,2,3]");
  check("4c Array statt Objekt => {}", JSON.stringify(flags.loadFileFlags(arr)) === "{}");
  fs.rmSync(arr);
  const nonString = tmpJson(JSON.stringify({ HELMUT_UNDERSTANDING_GATE: 42 }));
  check("4d Nicht-String-Wert wird ignoriert", flags.loadFileFlags(nonString).HELMUT_UNDERSTANDING_GATE === undefined);
  fs.rmSync(nonString);
}

// --- 5) Eingecheckte Datei = exakt die freigegebene Schaltung ------------------------------
{
  const checked = flags.loadFileFlags(path.join(__dirname, "..", "helmut-flags.json"));
  check("5a GATE=shadow eingecheckt", checked.HELMUT_UNDERSTANDING_GATE === "shadow");
  check("5b PARDOK=shadow eingecheckt", checked.HELMUT_PARDOK_DISPATCH === "shadow");
  check("5c Quellenmodus=shadow (freigegeben) — und ausdrücklich NICHT 'on' (Cutover freigabepflichtig)",
    checked.HELMUT_SOURCE_MODE === "shadow");
  check("5d nichts Weiteres wirkt", Object.keys(checked).length === 3, JSON.stringify(Object.keys(checked)));
}

// --- 6) Guards folgen der Präzedenz ---------------------------------------------------------
{
  // Simuliere Prod: env ohne GATE/PARDOK — Aufloesung muss der Datei folgen. Wir testen die
  // Modul-Logik direkt ueber flags (hermetisch), nicht ueber process.env-Mutation.
  const fileFlags = flags.loadFileFlags(path.join(__dirname, "..", "helmut-flags.json"));
  check("6a GATE wird shadow (Datei), wenn env leer", String(flags.flagValue("HELMUT_UNDERSTANDING_GATE", {}, { fileFlags })).toLowerCase() === "shadow");
  check("6b PARDOK wird shadow (Datei), wenn env leer", String(flags.flagValue("HELMUT_PARDOK_DISPATCH", {}, { fileFlags })).toLowerCase() === "shadow");
  check("6c env 'off' ueberstimmt Datei fuer GATE", flags.flagValue("HELMUT_UNDERSTANDING_GATE", { HELMUT_UNDERSTANDING_GATE: "off" }, { fileFlags }) === "off");
  check("6d env 'off' ueberstimmt Datei fuer PARDOK", flags.flagValue("HELMUT_PARDOK_DISPATCH", { HELMUT_PARDOK_DISPATCH: "off" }, { fileFlags }) === "off");
}

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Flag-Mechanismus-Assertions`);
process.exit(failed > 0 ? 1 : 0);
