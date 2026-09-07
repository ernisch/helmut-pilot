#!/usr/bin/env node
"use strict";

// Genau eine kontrollierte Production-Pipeline-Scheibe fuer Stufe A nach SR §41.
// Der Ausfuehrer liest alle Starttore frisch, gibt keine Kennungen oder Secrets
// aus und wiederholt einen fehlgeschlagenen oder unbekannten Aufruf niemals.
const crypto = require("crypto");
const F = require("../lib/helmut/funktionstest-500");
const Z = require("../lib/helmut/funktionstest-zyklus");
const K = require("../lib/helmut/kapazitaet-500");
const S = require("../lib/helmut/testkohorte-stufen");
const { evaluatePipelineResponse } = require("./watchdog-eval");
const { pruefe: leseKonfiguration } = require("./github-laufzeitpruefung");
const CRONS = require("../vercel.json").crons;

const PROJECT_URL = "https://ddckuvvpcytqbyfmbvie.supabase.co";
const PUBLIC_URL = "https://helmut-pilot.vercel.app";
const CONFIRM = "FACHZYKLUS_A_EINE_SCHEIBE_BESTAETIGT";
const ZUSATZ_RESERVE_USD = 2;
const PFLICHTKLASSEN = Object.freeze([
  "source_fetch", "mandate_projection", "briefing_materialization"
]);

class Abbruch extends Error {}
function fordere(wert, grund) { if (!wert) throw new Abbruch(grund); }
function liste(wert, grund) { fordere(Array.isArray(wert), grund); return wert; }
function hash(wert) { return crypto.createHash("sha256").update(JSON.stringify(wert)).digest("hex"); }

function pruefeZeit(zeit) {
  const minute = zeit.getUTCHours() * 60 + zeit.getUTCMinutes();
  fordere(minute >= 21 * 60 + 36 && minute < 23 * 60 + 54,
    "a-fachzyklus-ausserhalb-des-heutigen-sicheren-fensters");
}

function pruefeProfile(rows) {
  liste(rows, "profilantwort-ungueltig");
  const ids = new Set(rows.map((r) => r.user_id));
  const a = new Set(S.kennungenBisStufe("a"));
  fordere(rows.length === 29 && ids.size === 29, "profilbestand-abweichend");
  fordere(rows.every((r) => typeof r.aktiv === "boolean" && r.geloescht_at === null),
    "profilzustand-abweichend");
  fordere(rows.filter((r) => r.aktiv).length === 25, "aktive-profile-abweichend");
  fordere(rows.filter((r) => a.has(r.user_id) && r.aktiv).length === 20,
    "stufe-a-unvollstaendig");
  fordere(rows.every((r) => !r.user_id.startsWith("test-kohorte-") || a.has(r.user_id)),
    "fremde-kohortenstufe");
  return {
    weitereAktiveMandate: rows.filter((r) => r.aktiv && !a.has(r.user_id)).map((r) => r.user_id),
    nichtkohortenHash: hash(rows.filter((r) => !r.user_id.startsWith("test-kohorte-")))
  };
}

function pruefeAuth(data) {
  const users = liste(data && data.users, "authspeicher-nicht-lesbar");
  const a = new Set(S.kennungenBisStufe("a"));
  const kohorte = users.filter((u) => String(u.politicianId || "").startsWith("test-kohorte-"));
  fordere(users.length === 25 && users.filter((u) => u.active === true).length === 3,
    "authkonten-bestand-abweichend");
  fordere(kohorte.length === 20 && kohorte.every((u) => a.has(u.politicianId) && u.active === false),
    "kohortenkonto-aktiv-oder-bestand-abweichend");
  return {
    kohortenKonten: kohorte.length,
    kohortenAktiv: kohorte.filter((u) => u.active === true).length,
    nutzerHash: hash(users),
    pushHash: hash(Array.isArray(data.pushEvents) ? data.pushEvents : [])
  };
}

function pruefeIdentitaeten(rows) {
  liste(rows, "identitaetsprofile-nicht-lesbar");
  const ids = rows.map((r) => r.id);
  const a = new Set(S.kennungenBisStufe("a"));
  fordere(rows.length === 30 && new Set(ids).size === 30, "identitaetsprofile-abweichend");
  fordere(ids.filter((id) => a.has(id)).length === 20, "identitaetsprofile-a-abweichend");
  fordere(ids.every((id) => !String(id).startsWith("test-kohorte-") || a.has(id)),
    "fremde-kohortenidentitaet");
  return hash(ids);
}

function bestandAusJobs(rows, frischefenster) {
  liste(rows, "auftragsbestand-nicht-lesbar");
  const erlaubt = new Set(["wartend", "laeuft", "erledigt", "fehlgeschlagen"]);
  fordere(rows.every((r) => PFLICHTKLASSEN.includes(r.job_type) && erlaubt.has(r.status)
    && r.freshness_window === frischefenster), "auftragsbestand-enthaelt-fremde-zeilen");
  const klassen = {};
  for (const typ of PFLICHTKLASSEN) {
    const teil = rows.filter((r) => r.job_type === typ);
    fordere(teil.length === 20 && new Set(teil.map((r) => r.tenant_id)).size === 20,
      `auftragsbestand-${typ}-abweichend`);
    klassen[typ] = {
      wartend: teil.filter((r) => r.status === "wartend").length,
      laufend: teil.filter((r) => r.status === "laeuft").length,
      erledigt: teil.filter((r) => r.status === "erledigt").length,
      endgueltigFehlerhaft: teil.filter((r) => r.status === "fehlgeschlagen").length
    };
  }
  return { gemessen: true, stufe: "a", frischefenster, klassen };
}

function kostenBefund(data, counter, utcDay) {
  const usage = liste(data && data.llmUsage, "kostenring-nicht-lesbar")
    .filter((r) => typeof r.createdAt === "string" && r.createdAt.slice(0, 10) === utcDay);
  fordere(Number.isSafeInteger(counter) && counter >= 0 && counter < 2416,
    "tageszaehler-ungueltig");
  fordere(counter === 0 || usage.length > 0, "kostenbelege-fehlen");
  const kosten = usage.map((r) => {
    const wert = typeof r.estimatedCost === "number" ? r.estimatedCost
      : (/^[0-9]+(?:\.[0-9]+)?$/.test(String(r.estimatedCost || ""))
        ? Number(r.estimatedCost) : null);
    return Number.isFinite(wert) && wert >= 0 ? wert : null;
  });
  // Ein historischer Lückenbeleg kann ausdrücklich `model: "none"` tragen.
  // Er ist nur zusammen mit ebenfalls unbekannten Kosten zulässig und wird
  // unten wie jede andere Lücke konservativ reserviert. Ein fremdes Modell mit
  // Kostenwert oder jeder andere Modellname bleibt fail closed gesperrt.
  fordere(usage.every((r, i) => r.model === "gpt-5-mini"
    || (r.model === "none" && kosten[i] === null)), "modell-unbekannt");
  const bekannteKostenUsd = kosten.reduce((n, wert) => n + (wert === null ? 0 : wert), 0);
  const unbekannteKosten = kosten.filter((wert) => wert === null).length;
  const reservierungsluecke = Math.max(0, counter - usage.length);
  const reserveJeLueckeUsd = Math.max(0.05, ...kosten.filter((wert) => wert !== null), 0);
  const mitLueckenreserveUsd = bekannteKostenUsd
    + (unbekannteKosten + reservierungsluecke) * reserveJeLueckeUsd;
  return { reservierungen: counter, protokollierteEintraege: usage.length,
    bekannteKostenUsd, unbekannteKosten, reservierungsluecke, reserveJeLueckeUsd,
    zusatzReserveUsd: ZUSATZ_RESERVE_USD,
    prognoseUsd: mitLueckenreserveUsd + ZUSATZ_RESERVE_USD, atomarerUsdRiegel: false };
}

async function ausfuehren({ env = process.env, fetchFn = global.fetch,
  now = () => new Date() } = {}) {
  let ausgeloest = false;
  let vorKosten = null;
  try {
    fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot"
      && env.GITHUB_REF === "refs/heads/main" && env.GITHUB_EVENT_NAME === "workflow_dispatch",
    "nur-manuell-auf-main");
    fordere(env.HELMUT_FACHZYKLUS_A_CONFIRM === CONFIRM, "bestaetigung-fehlt");
    fordere(String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL
      && env.SUPABASE_SERVICE_ROLE_KEY && env.HELMUT_CRON_SECRET,
    "geschuetzter-production-zugang-fehlt");
    fordere(env.HELMUT_PRODUCTION_COMMIT === env.GITHUB_SHA, "production-commit-weicht-ab");
    const nat = env.HELMUT_NATURLAUF_ID || "";
    fordere(/^cron-crawl-\d{14}-[a-z0-9]{1,16}$/.test(nat), "naturlauf-kennung-fehlt");
    const start = now();
    pruefeZeit(start);
    const utcDay = start.toISOString().slice(0, 10);
    const frischefenster = `${utcDay}T00Z`;

    const config = await leseKonfiguration({ env, fetchFn });
    fordere(config.ok && config.storageSupabase && config.v3Bereit && config.profileRelational
      && config.profileExclusive && config.kommunikationGesperrt && config.kohortenQuellenGesperrt
      && config.retentionGueltig && config.retention === 36
      && config.tagesdeckel === 2416 && config.understandingReserve === 702
      && config.vorrangreserveReal >= 200,
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
    const profilPfad = "mandate_profiles?select=user_id,aktiv,geloescht_at,updated_at&order=user_id.asc&limit=30";
    const profileVor = await db(profilPfad);
    const profilBefund = pruefeProfile(profileVor);
    const authVorRows = await db("helmut_store?select=data&id=eq.main-auth&limit=2");
    fordere(authVorRows.length === 1, "authspeicher-nicht-eindeutig");
    const authVor = pruefeAuth(authVorRows[0].data);
    const identitaetenPfad = "profiles?select=id&order=id.asc&limit=31";
    const identitaetenHashVor = pruefeIdentitaeten(await db(identitaetenPfad));
    const natural = await db("process_runs?select=run_id,process,status,started_at,finished_at,processed_count,failed_count&run_id=eq."
      + encodeURIComponent(nat) + "&limit=2");
    const natStart = natural.length === 1 ? Date.parse(natural[0].started_at) : NaN;
    const natEnde = natural.length === 1 ? Date.parse(natural[0].finished_at) : NaN;
    const abendStart = Date.parse(`${utcDay}T20:00:00Z`);
    fordere(natural.length === 1 && natural[0].process === "warteschlange-crawl"
      && natural[0].run_id === nat && nat.startsWith(`cron-crawl-${utcDay.replace(/-/g, "")}20`)
      && natural[0].status === "success" && natural[0].processed_count > 0
      && natural[0].failed_count === 0 && natStart >= abendStart
      && natStart < abendStart + 3600000 && natEnde >= natStart && natEnde <= start.getTime(),
    "erfolgreicher-natuerlicher-abendcrawl-fehlt");
    const jetztIso = start.toISOString();
    fordere((await db("pipeline_locks?select=job_name&expires_at=gt."
      + encodeURIComponent(jetztIso) + "&limit=1")).length === 0, "aktive-pipelinesperre");
    fordere((await db("helmut_jobs?select=id&lease_expires_at=gt."
      + encodeURIComponent(jetztIso) + "&limit=1")).length === 0, "aktive-auftragslease");
    const jobPfad = "helmut_jobs?select=job_type,status,tenant_id,freshness_window"
      + "&tenant_id=like.test-kohorte-a-*&freshness_window=eq." + encodeURIComponent(frischefenster)
      + "&limit=100";
    const jobsVor = await db(jobPfad);
    const bestandVor = bestandAusJobs(jobsVor, frischefenster);
    const counterVor = await db("llm_budget_counters?select=used&scope=eq.global&day=eq."
      + utcDay + "&limit=2");
    fordere(counterVor.length === 1, "tageszaehler-nicht-eindeutig");
    vorKosten = kostenBefund(authVorRows[0].data, counterVor[0].used, utcDay);
    fordere(vorKosten.prognoseUsd < 9, "kosten-sicherheitsstopp");
    const outboxPfad = "helmut_job_outbox?select=id&confirmed_at=gte."
      + encodeURIComponent(jetztIso) + "&limit=1";
    fordere((await db(outboxPfad)).length === 0, "kommunikationsspur-vor-start");

    const messungen = Object.fromEntries(Object.entries(K.BELEGTE_MESSUNGEN)
      .map(([name, beleg]) => [name, beleg.belegt === true]));
    fordere(Object.values(messungen).every(Boolean), "externe-messung-offen");
    const fensterStart = Date.parse(`${utcDay}T21:36:00Z`);
    const fensterEnde = fensterStart + 383 * 60000;
    const startfenster = F.pruefeStartfenster({ startUtc: new Date(fensterStart).toISOString(),
      dauerMinuten: 383, crons: CRONS, watchdogBeruecksichtigen: true });
    const laufEnv = { ...env, CRON_SECRET: env.HELMUT_CRON_SECRET, HELMUT_PUBLIC_URL: PUBLIC_URL,
      HELMUT_TESTKOHORTE_EXECUTE: "1",
      HELMUT_TESTKOHORTE_CONFIRM: S.startfreigabe("a", {}).erwartetesWort,
      HELMUT_TESTLAUF_VORRANG_REAL: String(config.vorrangreserveReal) };
    const bereitschaft = F.startbereitschaft({
      stufe: "a", bestandeneStufen: [], env: laufEnv, isolation: true,
      konfiguration: { gesamtdeckel: 2416, reserveVerstehen: 702,
        maxAnfragenJeMinute: 82, maxTokenJeMinute: 250000, kostenbudgetUsd: 9,
        vorrangreserveReal: config.vorrangreserveReal, maxParallel: 1 },
      grenzen: { maxFehlerquote: 0.05, kostenbudgetUsd: 9, maxLaufzeitMinuten: 5,
        maxRueckstandWachstum: 200, erwarteterCommit: env.GITHUB_SHA,
        mindestVerarbeiteteVorgaenge: 1 },
      messungen, startfenster: { startUtc: new Date(fensterStart).toISOString(),
        dauerMinuten: 383, crons: CRONS, watchdogBeruecksichtigen: true },
      faelligkeitsfenster: { fensterStartMs: fensterStart, fensterEndeMs: fensterEnde,
        planungsZeitpunktMs: start.getTime(), mindestAbdeckung: 1, bestand: bestandVor,
        weitereAktiveMandate: profilBefund.weitereAktiveMandate }
    });
    fordere(bereitschaft.startbereit === true, "starttor-nicht-vollstaendig");
    fordere(now().getTime() - start.getTime() < 90000, "grundlinie-zu-alt");
    pruefeZeit(now());

    ausgeloest = true;
    const ergebnis = await Z.fuehreZyklusAus({ modus: Z.MODUS_SCHARF, env: laufEnv,
      stufe: "a", startfensterBefund: startfenster, jetztUtc: now().toISOString(),
      parallel: 1, maxScheiben: 1, startbereit: true,
      deps: { rufeRouteAuf: async ({ pfad, basisUrl, secret }) => {
        const res = await fetchFn(`${basisUrl}${pfad}`, { method: "GET", redirect: "error",
          signal: AbortSignal.timeout(295000),
          headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" } });
        let koerper = null;
        try { koerper = await res.json(); } catch { koerper = null; }
        const fachlich = evaluatePipelineResponse(koerper);
        return { ok: res.ok && fachlich.ok === true && fachlich.note !== true,
          status: res.status, koerper };
      }, jetztMs: () => now().getTime(), warte: async () => {} }
    });

    const profileNach = await db(profilPfad);
    const profilNachBefund = pruefeProfile(profileNach);
    const authNachRows = await db("helmut_store?select=data&id=eq.main-auth&limit=2");
    fordere(authNachRows.length === 1, "authspeicher-nicht-eindeutig-nach-lauf");
    const authNach = pruefeAuth(authNachRows[0].data);
    const identitaetenHashNach = pruefeIdentitaeten(await db(identitaetenPfad));
    const jobsNach = bestandAusJobs(await db(jobPfad), frischefenster);
    const counterNach = await db("llm_budget_counters?select=used&scope=eq.global&day=eq."
      + utcDay + "&limit=2");
    fordere(counterNach.length === 1, "tageszaehler-nicht-eindeutig-nach-lauf");
    const nachKosten = kostenBefund(authNachRows[0].data, counterNach[0].used, utcDay);
    const profileGleich = JSON.stringify(profileVor) === JSON.stringify(profileNach)
      && profilBefund.nichtkohortenHash === profilNachBefund.nichtkohortenHash;
    const identitaetenGleich = identitaetenHashVor === identitaetenHashNach;
    const kontenGleich = authVor.nutzerHash === authNach.nutzerHash;
    const kommunikationGleich = authVor.pushHash === authNach.pushHash
      && (await db(outboxPfad)).length === 0;
    const nachIso = now().toISOString();
    const sperrenFrei = (await db("pipeline_locks?select=job_name&expires_at=gt."
      + encodeURIComponent(nachIso) + "&limit=1")).length === 0
      && (await db("helmut_jobs?select=id&lease_expires_at=gt."
        + encodeURIComponent(nachIso) + "&limit=1")).length === 0;
    return { ok: ergebnis.ok === true && profileGleich && identitaetenGleich && kontenGleich
        && kommunikationGleich
        && authNach.kohortenAktiv === 0 && nachKosten.prognoseUsd < 9 && sperrenFrei,
      ausgeloest, keineAutomatischeWiederholung: true, route: ergebnis.route,
      scheiben: ergebnis.erfolgreich, httpFehler: ergebnis.fehlgeschlagen,
      starttor: { bereit: bereitschaft.startbereit, offeneHuerden: bereitschaft.offen.length,
        vorrangreserveReal: config.vorrangreserveReal },
      profileGleich, identitaetenGleich, kontenGleich, kommunikationGleich,
      kohortenKontenAktiv: authNach.kohortenAktiv,
      jobsVor: bestandVor.klassen, jobsNach: jobsNach.klassen,
      vorKosten, nachKosten, sperrenFrei, unabhaengigeProductionAbnahmeOffen: true };
  } catch (error) {
    return { ok: false, ausgeloest, grund: error instanceof Abbruch ? error.message
      : "netz-oder-antwortfehler", vorKosten, keineAutomatischeWiederholung: true };
  }
}

if (require.main === module) {
  if (process.argv.length !== 2) { console.error("Keine Argumente erlaubt."); process.exitCode = 2; }
  else ausfuehren().then((r) => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1; });
}

module.exports = { ausfuehren, pruefeZeit, pruefeProfile, pruefeAuth, pruefeIdentitaeten, bestandAusJobs,
  kostenBefund, CONFIRM, PROJECT_URL, PUBLIC_URL };
