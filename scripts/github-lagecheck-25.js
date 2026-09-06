#!/usr/bin/env node
"use strict";

// Ein manueller, begrenzter Aufruf der bestehenden Production Route nach SR §41.
// Kein Ersatzcrawl, kein Profilwrite, keine Secret Ausgabe und keine Wiederholung.
// Die USD Rechnung ist eine konservative Vorhersage, kein atomarer Dollarzaehler.
const { pruefe: leseKonfiguration } = require("./github-laufzeitpruefung");
const CRONS = require("../vercel.json").crons;
const PROJECT_URL = "https://ddckuvvpcytqbyfmbvie.supabase.co";
const LAGE_URL = "https://helmut-pilot.vercel.app/api/cron/lage-check";
const CONFIRM = "LAGECHECK_25_NACH_NATURLAUF_BESTAETIGT";
const ZUSATZ_RESERVE_USD = 2;

class Abbruch extends Error {}
function fordere(wert, grund) { if (!wert) throw new Abbruch(grund); }
function liste(wert, grund) { fordere(Array.isArray(wert), grund); return wert; }

function pruefeZeit(now) {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  // Der Aufruf darf weder einen regulären Cron noch den UTC Tageswechsel schneiden.
  fordere(minute >= 10 && minute < 1430, "utc-tageswechsel-zu-nah");
  for (const cron of CRONS) {
    const teile = cron.schedule.split(/\s+/);
    fordere(/^\d+$/.test(teile[0]) && /^\d+$/.test(teile[1])
      && teile.slice(2).join(" ") === "* * *", "cronplan-nicht-auswertbar");
    const termin = Number(teile[1]) * 60 + Number(teile[0]);
    fordere(minute < termin - 8 || minute > termin + 8, "natuerlicher-cron-zu-nah");
  }
}

function pruefeProfile(rows) {
  liste(rows, "profilantwort-ungueltig");
  fordere(rows.length === 29 && new Set(rows.map(r => r.user_id)).size === 29, "profilbestand-abweichend");
  const a = new Set(Array.from({ length: 20 }, (_, i) => `test-kohorte-a-${String(i + 1).padStart(3, "0")}`));
  fordere(rows.every(r => typeof r.aktiv === "boolean" && r.geloescht_at === null), "profilzustand-abweichend");
  fordere(rows.filter(r => r.aktiv).length === 25, "aktive-profile-abweichend");
  fordere(rows.filter(r => a.has(r.user_id) && r.aktiv).length === 20, "stufe-a-unvollstaendig");
  fordere(rows.every(r => !r.user_id.startsWith("test-kohorte-") || a.has(r.user_id)), "fremde-kohortenstufe");
}

function kostenBefund(usage, counter, utcDay) {
  liste(usage, "kostenring-nicht-lesbar");
  fordere(Number.isSafeInteger(counter) && counter >= 0 && counter < 2416, "tageszaehler-ungueltig");
  const heute = usage.filter(r => typeof r.createdAt === "string" && r.createdAt.slice(0, 10) === utcDay);
  fordere(counter === 0 || heute.length > 0, "kostenbelege-fehlen");
  fordere(heute.every(r => r.model === "gpt-5-mini" && Number.isFinite(r.estimatedCost)
    && r.estimatedCost >= 0), "kosten-oder-modell-unbekannt");
  const geschaetztUsd = heute.reduce((sum, r) => sum + r.estimatedCost, 0);
  const reservierungsluecke = Math.max(0, counter - heute.length);
  const jeFehlendemBelegUsd = Math.max(0.05, ...heute.map(r => r.estimatedCost));
  const mitLueckenreserveUsd = geschaetztUsd + reservierungsluecke * jeFehlendemBelegUsd;
  return { reservierungen: counter, protokollierteEintraege: heute.length, geschaetztUsd,
    reservierungsluecke, mitLueckenreserveUsd, zusatzReserveUsd: ZUSATZ_RESERVE_USD,
    prognoseUsd: mitLueckenreserveUsd + ZUSATZ_RESERVE_USD, atomarerUsdRiegel: false };
}

async function ausfuehren({ env = process.env, fetchFn = global.fetch, now = () => new Date() } = {}) {
  let ausgeloest = false;
  let vorKosten = null;
  try {
    fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === "refs/heads/main"
      && env.GITHUB_EVENT_NAME === "workflow_dispatch", "nur-manuell-auf-main");
    fordere(env.HELMUT_LAGE_25_CONFIRM === CONFIRM, "bestaetigung-fehlt");
    fordere(String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL
      && env.SUPABASE_SERVICE_ROLE_KEY, "fester-datenbankzugang-fehlt");
    const nat = env.HELMUT_NATURLAUF_ID || "";
    fordere(/^cron-crawl-\d{14}-[a-z0-9]{1,16}$/.test(nat), "naturlauf-kennung-fehlt");
    const start = now();
    pruefeZeit(start);
    const utcDay = start.toISOString().slice(0, 10);
    const config = await leseKonfiguration({ env, fetchFn });
    fordere(config.ok && config.storageSupabase && config.v3Bereit && config.profileRelational
      && config.profileExclusive && config.kommunikationGesperrt && config.kohortenQuellenGesperrt
      && config.retentionGueltig
      && config.retention === 36 && config.tagesdeckel === 2416 && config.understandingReserve === 702,
    "production-konfiguration-nicht-bestaetigt");
    async function db(pfad) {
      const res = await fetchFn(PROJECT_URL + "/rest/v1/" + pfad, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" }
      });
      fordere(res.status === 200, "datenbankabruf-fehlgeschlagen");
      return liste(await res.json(), "datenbankantwort-ungueltig");
    }
    const profiles = await db("mandate_profiles?select=user_id,aktiv,geloescht_at,updated_at&order=user_id.asc&limit=30");
    pruefeProfile(profiles);
    const natural = await db("process_runs?select=run_id,process,status,started_at,finished_at,processed_count,failed_count&run_id=eq."
      + encodeURIComponent(nat) + "&limit=2");
    fordere(natural.length === 1 && natural[0].process === "warteschlange-crawl"
      && natural[0].status === "success" && natural[0].processed_count > 0 && natural[0].failed_count === 0
      && natural[0].finished_at && Date.parse(natural[0].finished_at) <= start.getTime()
      && Date.parse(natural[0].started_at) >= Date.parse(utcDay + "T20:00:00Z")
      && start.getTime() - Date.parse(natural[0].finished_at) < 6 * 3600000,
    "erfolgreicher-natuerlicher-abendcrawl-fehlt");
    const after = encodeURIComponent(start.toISOString());
    fordere((await db("pipeline_locks?select=job_name&expires_at=gt." + after + "&limit=1")).length === 0,
      "aktive-pipelinesperre");
    fordere((await db("helmut_jobs?select=id&lease_expires_at=gt." + after + "&limit=1")).length === 0,
      "aktive-auftragslease");
    async function kostenLesen() {
      const counters = await db("llm_budget_counters?select=used&scope=eq.global&day=eq." + utcDay + "&limit=2");
      const auth = await db("helmut_store?select=usage:data->llmUsage&id=eq.main-auth&limit=2");
      fordere(counters.length === 1 && auth.length === 1, "kostenbestand-nicht-eindeutig");
      return kostenBefund(auth[0].usage, counters[0].used, utcDay);
    }
    vorKosten = await kostenLesen();
    fordere(vorKosten.prognoseUsd < 9, "kosten-sicherheitsstopp");
    fordere(now().getTime() - start.getTime() < 90000, "grundlinie-zu-alt");
    pruefeZeit(now());
    // Genau ein Versuch. Auch eine verlorene Antwort erlaubt keine Wiederholung.
    ausgeloest = true;
    const response = await fetchFn(LAGE_URL, { method: "GET", redirect: "error",
      signal: AbortSignal.timeout(295000), headers: {
        Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json"
      } });
    fordere(response.status === 200, "lage-http-fehlgeschlagen-ausgang-pruefen");
    const body = await response.json();
    const f = body && body.fairness;
    const counts = Object.fromEntries(["geplant", "begonnen", "erfolgreich", "fehlgeschlagen", "zeitbudget", "laeuftBereits", "lockVerweigert", "persistenzAbweichung"]
      .map(key => [key, f && Array.isArray(f[key]) ? f[key].length : null]));
    const nachKosten = await kostenLesen();
    const nachProfile = await db("mandate_profiles?select=user_id,aktiv,geloescht_at,updated_at&order=user_id.asc&limit=30");
    const bestandGleich = JSON.stringify(profiles) === JSON.stringify(nachProfile);
    const aktive = profiles.filter(p => p.aktiv).map(p => p.user_id).sort();
    const identischeKennungen = ["geplant", "begonnen", "erfolgreich"].every(key =>
      f && Array.isArray(f[key]) && f[key].every(id => typeof id === "string")
      && JSON.stringify([...f[key]].sort()) === JSON.stringify(aktive));
    const fachlichVollstaendig = body.ok === true && body.tenants === 25 && !body.bounded
      && body.fairnessGestoert === false && body.ohneFortschritt === false
      && body.budgetSkipped === 0 && Array.isArray(body.persistenzAbweichung)
      && body.persistenzAbweichung.length === 0 && f.zustandGeladen === true
      && !f.zustandFehler && f.laufStatus === "abgeschlossen" && identischeKennungen
      && counts.geplant === 25 && counts.begonnen === 25 && counts.erfolgreich === 25
      && counts.fehlgeschlagen === 0 && counts.zeitbudget === 0 && counts.laeuftBereits === 0
      && counts.lockVerweigert === 0 && counts.persistenzAbweichung === 0;
    return { ok: fachlichVollstaendig && bestandGleich && nachKosten.prognoseUsd < 9,
      ausgeloest, httpStatus: 200, fachlichVollstaendig, bestandGleich, zaehlwerte: counts,
      laufId: f && /^cron-lage-check-\d{14}-[a-z0-9]{1,16}$/.test(f.laufId || "") ? f.laufId : null,
      vorKosten, nachKosten, unabhaengigeProductionAbnahmeOffen: true };
  } catch (error) {
    const grund = error instanceof Abbruch ? error.message : "netz-oder-antwortfehler";
    return { ok: false, ausgeloest, grund, vorKosten, keineAutomatischeWiederholung: true };
  }
}

if (require.main === module) {
  if (process.argv.length !== 2) { console.error("Keine Argumente erlaubt."); process.exitCode = 2; }
  else ausfuehren().then(r => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1; });
}
module.exports = { ausfuehren, pruefeProfile, pruefeZeit, kostenBefund, CONFIRM, PROJECT_URL, LAGE_URL };
