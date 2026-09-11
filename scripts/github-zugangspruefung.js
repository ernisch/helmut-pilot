#!/usr/bin/env node
"use strict";

// Ausschliesslich lesender Nachweis des GitHub Ausfuehrungszugangs.
// Kein storage.js: dessen Lesepfad kann fehlende Blobzeilen anlegen.
// Keine Helmut HTTP Route: der bestehende Auth Vorlauf kann Adminseed schreiben.
// Genau ein festes PostgREST GET auf die vorhandene globale Betriebszeile.
// Keine RPC, kein Modell, kein Schreiber, keine Zugangsdaten im Ergebnis.

const PROJEKT_ORIGIN = "https://ddckuvvpcytqbyfmbvie.supabase.co";
const LESEPFAD = "/rest/v1/helmut_store?id=eq.main&select=id&limit=1";
const TEXT_PROCESS = "briefing-nachlauf-500";
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
    supabase: { erreicht: false, zielBestaetigt: false, grund: "nicht-geprueft", httpStatus: null },
    cron: { authentifiziert: false, grund: "nicht-aufgerufen" },
    letzterTextlauf: null,
    textVorbedingungen: null,
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
    // Nur eine gueltige Statusnummer, niemals fremden Antworttext ausgeben.
    bericht.supabase.httpStatus = Number.isInteger(response.status)
      && response.status >= 100 && response.status <= 599 ? response.status : null;
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

    // Zweiter ausschliesslich lesender Abruf. Er liefert nur feste
    // Ablaufklassen und technische Quittungsfelder des letzten Textlaufs am
    // aktuellen UTC Tag. Der Textlauf kann auf dem vorherigen Production
    // Commit gelaufen sein, deshalb wird nicht auf den aktuellen Commit
    // eingeschraenkt. Freitext und Mandatsdaten werden weder angefordert noch
    // ausgegeben.
    const tag = jetzt.toISOString().slice(0, 10);
    const textResponse = await fetchFn(`${PROJEKT_ORIGIN}/rest/v1/process_runs?select=run_id,process,status,reason,commit_ref,processed_count,failed_count,started_at,finished_at,telemetrie`
      + `&process=eq.${TEXT_PROCESS}&started_at=gte.${tag}T00:00:00Z&order=started_at.asc&limit=1000`, {
      method: "GET", redirect: "error",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });
    if (textResponse.status !== 200) {
      bericht.supabase.erreicht = false;
      bericht.supabase.grund = "textlaufquittung-nicht-lesbar";
      return bericht;
    }
    const textRows = await textResponse.json();
    if (!Array.isArray(textRows) || textRows.length >= 1000) {
      bericht.supabase.erreicht = false;
      bericht.supabase.grund = "textlaufquittung-nicht-eindeutig";
      return bericht;
    }
    bericht.textVorbedingungen = {
      heutigeTextquittungen: textRows.length,
      quittungenMitMandatsergebnissen: textRows.filter(r => Array.isArray(r?.telemetrie?.mandatsErgebnisse)).length,
      zeitbudgetOhneMandatsergebnisse: textRows.filter(r => r?.status === "failed"
        && r?.reason === "nachlauf-zeitbudget" && !Array.isArray(r?.telemetrie?.mandatsErgebnisse)).length,
      projektionen: null,
      eindeutigeProjektionsmandate: null,
      projektionsvertragVollstaendig: false
    };
    const row = [...textRows].reverse().find(r => ["success", "failed"].includes(r?.status));
    if (row) {
      const T = require("../lib/helmut/testkohorte-textnachlauf");
      const gueltig = row.process === TEXT_PROCESS
        && /^nachlauf500-[0-9]{5,20}$/.test(row.run_id || "")
        && ["success", "failed"].includes(row.status)
        && /^[a-f0-9]{40}$/.test(row.commit_ref || "")
        && Number.isSafeInteger(row.processed_count) && row.processed_count >= 0 && row.processed_count <= 500
        && Number.isSafeInteger(row.failed_count) && row.failed_count >= 0 && row.failed_count <= 500
        && Number.isFinite(Date.parse(row.started_at)) && Number.isFinite(Date.parse(row.finished_at))
        && Date.parse(row.finished_at) >= Date.parse(row.started_at);
      if (!gueltig) {
        bericht.supabase.erreicht = false;
        bericht.supabase.grund = "textlaufquittung-ungueltig";
        return bericht;
      }
      bericht.letzterTextlauf = {
        runId: row.run_id,
        status: row.status,
        grund: T.istSichererLaufgrund(row.reason) ? row.reason : "nicht-freigegebene-diagnose",
        commit: row.commit_ref,
        aktuellerCommit: /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || "") && row.commit_ref === env.GITHUB_SHA,
        verarbeitet: row.processed_count,
        fehlgeschlagen: row.failed_count,
        gestartetAt: row.started_at,
        beendetAt: row.finished_at
      };
    }

    const projektionResponse = await fetchFn(`${PROJEKT_ORIGIN}/rest/v1/helmut_jobs?select=tenant_id,status,due_at`
      + `&job_type=eq.mandate_projection&freshness_window=eq.${tag}T00Z&limit=501`, {
      method: "GET", redirect: "error",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });
    if (projektionResponse.status !== 200) {
      bericht.supabase.erreicht = false;
      bericht.supabase.grund = "projektionsbeleg-nicht-lesbar";
      return bericht;
    }
    const projektionen = await projektionResponse.json();
    if (!Array.isArray(projektionen) || projektionen.length > 500) {
      bericht.supabase.erreicht = false;
      bericht.supabase.grund = "projektionsbeleg-ungueltig";
      return bericht;
    }
    const eindeutige = new Set(projektionen.map(r => r?.tenant_id)).size;
    const gueltig = projektionen.every(r => r && typeof r.tenant_id === "string"
      && ["wartend", "laeuft", "erledigt", "fehlgeschlagen"].includes(r.status)
      && Number.isFinite(Date.parse(r.due_at)));
    bericht.textVorbedingungen.projektionen = projektionen.length;
    bericht.textVorbedingungen.eindeutigeProjektionsmandate = eindeutige;
    bericht.textVorbedingungen.projektionsvertragVollstaendig = gueltig
      && projektionen.length === 500 && eindeutige === 500;
  } catch {
    // Providerfehler koennen URLs oder Zugangsdaten enthalten. Nie ausgeben.
    bericht.supabase.erreicht = false;
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

module.exports = { pruefe, PROJEKT_ORIGIN, LESEPFAD, TEXT_PROCESS };
