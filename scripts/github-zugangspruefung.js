#!/usr/bin/env node
"use strict";

// Ausschliesslich lesender Nachweis des GitHub Ausfuehrungszugangs.
// Kein storage.js: dessen Lesepfad kann fehlende Blobzeilen anlegen.
// Keine Helmut HTTP Route: der bestehende Auth Vorlauf kann Adminseed schreiben.
// Genau ein festes PostgREST GET auf die vorhandene globale Betriebszeile.
// Keine RPC, kein Modell, kein Schreiber, keine Zugangsdaten im Ergebnis.

const PROJEKT_ORIGIN = "https://ddckuvvpcytqbyfmbvie.supabase.co";
const LESEPFAD = "/rest/v1/helmut_store?id=eq.main&select=id&limit=1";
const SECRET_NAMEN = Object.freeze([
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_CRON_SECRET"
]);
const BETRIEBSWERTE = Object.freeze([
  "HELMUT_STORAGE_BACKEND", "HELMUT_V3_STORE", "HELMUT_PROFILE_DB_MODE",
  "HELMUT_CRAWL_RUN_RETENTION", "HELMUT_MAX_LLM_CALLS_PER_DAY",
  "HELMUT_LLM_RESERVE_UNDERSTANDING", "HELMUT_TESTLAUF_KOMMUNIKATION"
]);

function vorhanden(env, name) {
  return typeof env[name] === "string" && env[name].trim().length > 0;
}

async function pruefe({ env = process.env, fetchFn = global.fetch, jetzt = new Date() } = {}) {
  const bericht = {
    schemaVersion: 1,
    geprueftAm: jetzt.toISOString(),
    modus: "rein-lesend",
    secretsVorhanden: Object.fromEntries(SECRET_NAMEN.map((n) => [n, vorhanden(env, n)])),
    betriebswerteVorhanden: Object.fromEntries(BETRIEBSWERTE.map((n) => [n, vorhanden(env, n)])),
    supabase: { erreicht: false, zielBestaetigt: false, grund: "nicht-geprueft" },
    cron: { authentifiziert: false, grund: "nicht-aufgerufen" },
    scharferPfadFreigegeben: false,
    modellaufrufe: 0,
    schreibaufrufe: 0
  };
  if (!bericht.secretsVorhanden.SUPABASE_URL || !bericht.secretsVorhanden.SUPABASE_SERVICE_ROLE_KEY) {
    bericht.supabase.grund = "github-secrets-fehlen";
    return bericht;
  }
  // Keine konfigurierbare Zieladresse fuer den privilegierten Schluessel.
  // Auch Benutzerinfo, Query, Fragment und abweichende Pfade werden verworfen.
  if (![PROJEKT_ORIGIN, `${PROJEKT_ORIGIN}/`].includes(env.SUPABASE_URL.trim())) {
    bericht.supabase.grund = "production-projekt-nicht-bestaetigt";
    return bericht;
  }
  bericht.supabase.zielBestaetigt = true;
  try {
    const response = await fetchFn(`${PROJEKT_ORIGIN}${LESEPFAD}`, {
      method: "GET",
      redirect: "error",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });
    if (response.status !== 200) {
      bericht.supabase.grund = [401, 403].includes(response.status)
        ? "zugang-abgewiesen" : "http-fehler";
      return bericht;
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== "main") {
      bericht.supabase.grund = "betriebszeile-nicht-bestaetigt";
      return bericht;
    }
    bericht.supabase.erreicht = true;
    bericht.supabase.grund = "bestehende-betriebszeile-gelesen";
  } catch {
    // Providerfehler koennen URLs oder Zugangsdaten enthalten. Nie ausgeben.
    bericht.supabase.grund = "netz-oder-antwortfehler";
  }
  return bericht;
}

async function main() {
  // Kein freier Modus, kein Zielargument, keine scharfe Option.
  if (process.argv.length !== 2) {
    console.error("Aufruffehler: Diese Zugangspruefung akzeptiert keine Argumente.");
    process.exitCode = 2;
    return;
  }
  const bericht = await pruefe();
  console.log(JSON.stringify(bericht, null, 2));
  process.exitCode = bericht.supabase.erreicht ? 0 : 1;
}

if (require.main === module) main().catch(() => {
  console.error("Zugangspruefung fehlgeschlagen. Keine Fehlerdetails oder Zugangsdaten ausgegeben.");
  process.exitCode = 1;
});

module.exports = { pruefe, PROJEKT_ORIGIN, LESEPFAD };
