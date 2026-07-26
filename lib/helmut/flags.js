"use strict";

// Helmut — Deployment-Flags aus eingecheckter Datei (helmut-flags.json im Repo-Root).
// =============================================================================================
// ZWECK: Die Production-Env-Werte liegen in Vercel als "sensitive" und sind aus der
// Arbeitsumgebung weder les- noch schreibbar. Vom Gründer freigegebene MODUS-Umschaltungen
// (z. B. Understanding-Gate auf shadow) werden deshalb als Datei-Flag deployt — jede Änderung
// ist damit ein normaler, reviewbarer, sofort rollbarer Git-Diff.
//
// PRÄZEDENZ (fest):  process.env  >  helmut-flags.json  >  Code-Default.
//   Eine in Vercel gesetzte Env-Variable gewinnt IMMER — der Betreiber behält die volle
//   Kontrolle und kann jedes Datei-Flag ohne Deployment im Dashboard überstimmen.
//
// SICHERHEIT (fail-closed):
//   - Feste Allowlist: NUR die unten gelisteten Schlüssel wirken; alles andere in der Datei
//     wird ignoriert (kein Weg, beliebige Env-Namen — etwa Secrets — per Datei zu setzen).
//   - Fehlende/kaputte/nicht-objektförmige Datei => {} (Code-Defaults gelten).
//   - Nur String-Werte; alles andere wird ignoriert. Keine Secrets in dieser Datei.
//   - HERMETIK: Datei-Flags gelten NUR für die echte Prozessumgebung (env === process.env).
//     Tests, die ein eigenes env-Objekt injizieren, bleiben davon unberührt — deren
//     off-Default-Zusicherungen können durch die Datei nicht kippen.

const fs = require("fs");
const path = require("path");

const FLAG_FILE = path.join(__dirname, "..", "..", "helmut-flags.json");

// Nur MODUS-/Schalter-Flags, die der Gründer ausdrücklich über Deployments steuern will.
// Bewusst NICHT enthalten: HELMUT_MAX_LLM_CALLS_PER_DAY (Kostenschalter bleibt exklusiv
// beim Betreiber in Vercel), Secrets/Keys/URLs jeder Art.
const FILE_FLAG_ALLOWLIST = Object.freeze([
  "HELMUT_UNDERSTANDING_GATE",
  "HELMUT_PARDOK_DISPATCH",
  "HELMUT_SOURCE_MODE",
  // Freigabe der Landesmodule je Land (Default LEER = alle gesperrt). Als Datei-Flag
  // gefuehrt, damit eine Landesfreigabe ein reviewbarer, sofort rollbarer Git-Diff ist
  // (Vercel-Env ueberstimmt die Datei weiterhin). Kein Secret, kein Kostenschalter.
  "HELMUT_LANDESMODULE"
]);

let cachedFileFlags = null;

// Auf Allowlist + String-Werte filtern. Wirft NIE.
function filterAllowlist(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out = {};
  for (const name of FILE_FLAG_ALLOWLIST) {
    const value = parsed[name];
    if (typeof value === "string" && value.trim() !== "") out[name] = value.trim();
  }
  return out;
}

// Datei lesen + filtern. Wirft NIE. Mit explizitem Pfad (Tests) via fs; ohne Pfad via
// statischem require — das garantiert, dass Vercels Bundler (nft) die Datei ins
// Serverless-Bundle aufnimmt (fs-Pfade mit __dirname sind dort nicht zuverlässig).
function loadFileFlags(file) {
  try {
    if (file) return filterAllowlist(JSON.parse(fs.readFileSync(file, "utf8")));
    // Statischer Literal-Pfad — NICHT dynamisch machen (Bundler-Tracing).
    return filterAllowlist(require("../../helmut-flags.json"));
  } catch (_) {
    return {};
  }
}

function fileFlags() {
  if (cachedFileFlags === null) cachedFileFlags = loadFileFlags();
  return cachedFileFlags;
}

// Effektiver Flag-Wert + Quelle. Rückgabe: { wert: string|null, quelle: "env"|"datei"|"default" }.
// opts.fileFlags erlaubt Tests, die Datei-Ebene explizit zu injizieren.
function flagInfo(name, env = process.env, opts = {}) {
  const fromEnv = env ? env[name] : undefined;
  if (fromEnv != null && String(fromEnv).trim() !== "") {
    return { wert: String(fromEnv).trim(), quelle: "env" };
  }
  const flags = opts.fileFlags !== undefined
    ? opts.fileFlags
    : (env === process.env ? fileFlags() : {});
  const fromFile = flags && typeof flags === "object" ? flags[name] : undefined;
  if (typeof fromFile === "string" && fromFile.trim() !== "") {
    return { wert: fromFile.trim(), quelle: "datei" };
  }
  return { wert: null, quelle: "default" };
}

// Bequemer Kurzweg: effektiver Wert oder null.
function flagValue(name, env = process.env, opts = {}) {
  return flagInfo(name, env, opts).wert;
}

module.exports = { flagValue, flagInfo, loadFileFlags, fileFlags, FILE_FLAG_ALLOWLIST, FLAG_FILE };
