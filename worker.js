"use strict";

const { setTimeout: warten } = require("node:timers/promises");
const { quellenAusfuehrungAusgelagert } = require("./lib/helmut/quellen-ausfuehrung");
const arbeitsfenster = require("./lib/helmut/quellen-arbeitsfenster");
const tagesbetrieb = require("./lib/helmut/quellen-tagesbetrieb");
const workerBetrieb = require("./lib/helmut/worker-betrieb");
const abdeckung = require("./lib/helmut/quellenarchitektur/cron-abdeckung");
const { runCronUeberWarteschlange, helmutRunId } = require("./lib/helmut/quellen-warteschlangenlauf");
const { baueResponsesUrl } = require("./lib/helmut/azure-endpunkt");
const { readAuthStore, supabaseRequest } = require("./lib/helmut/storage");
const betriebskosten = require("./lib/helmut/betriebskosten-budget");

const INTERVALL_MS = 15 * 60 * 1000;
const PRODUKTIONS_SUPABASE_HOST = "ddckuvvpcytqbyfmbvie.supabase.co";

function pruefeEinmalZiel(env = process.env) {
  if (quellenAusfuehrungAusgelagert(env)) throw Error("einmaltest-erfordert-standby");
  if (env.HELMUT_WORKER_SUPABASE_HOST === PRODUKTIONS_SUPABASE_HOST) {
    throw Error("einmaltest-erfordert-testdatenbank");
  }
}

function konfigurationsfehler(env = process.env) {
  if (env.VERCEL || env.VERCEL_ENV) return "vercel-laufzeit";
  let supabase;
  try { supabase = new URL(env.SUPABASE_URL); }
  catch { return "supabase-url-fehlt-oder-ungueltig"; }
  if (supabase.protocol !== "https:" || supabase.port || supabase.username || supabase.password
      || supabase.pathname !== "/" || supabase.search || supabase.hash
      || supabase.hostname !== env.HELMUT_WORKER_SUPABASE_HOST
      || !supabase.hostname.endsWith(".supabase.co")) return "supabase-ziel-nicht-bestaetigt";
  if (env.HELMUT_STORAGE_BACKEND !== "supabase" || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return "supabase-speicher-nicht-konfiguriert";
  }
  if (!arbeitsfenster.aktiv(env) || !arbeitsfenster.grenzen(env).gueltig
      || !["off", "shadow"].includes(env.HELMUT_JOB_DISPATCH_MODE || "off")) {
    return "quellenarbeitsfenster-nicht-konfiguriert";
  }
  const azureUrl = baueResponsesUrl(env.AZURE_OPENAI_ENDPOINT);
  if (!env.AZURE_OPENAI_KEY || !env.AZURE_OPENAI_DEPLOYMENT || !azureUrl) return "azure-nicht-konfiguriert";
  try {
    const vertrag = betriebskosten.vertrag(env);
    betriebskosten.zulassung(vertrag, env);
    if (vertrag.route.model !== env.AZURE_OPENAI_DEPLOYMENT
        || vertrag.route.responsesUrl !== azureUrl) {
      return "azure-route-weicht-vom-geldvertrag-ab";
    }
  } catch { return "geldvertrag-nicht-bestaetigt"; }
  return null;
}

function quellenlauf() {
  return arbeitsfenster.fuehreAus({ ganztags: true, arbeit: ({ freigabe, startMs }) => {
    const runId = helmutRunId("cron-crawl", startMs);
    return abdeckung.runQuellenCronMitAbdeckung(
      () => runCronUeberWarteschlange("crawl", {
        deadlineMs: 270000, runId, startedMs: startMs, arbeitsfenster: freigabe,
        buildV3Briefing: (...args) => require("./server").__buildV3Briefing(...args)
      }),
      { runId, cronName: "crawl", deadlineAt: startMs + 290000 }
    );
  } });
}

async function fuehreQuellenfensterAus(lauf, log) {
  const ergebnis = await lauf();
  log(JSON.stringify({ dienst: "quellenworker", ereignis: "quellenfenster",
    gestartet: Boolean(ergebnis.arbeitsfenster), ok: ergebnis.ok === true,
    laufId: ergebnis.lauf?.laufId, status: ergebnis.lauftelemetrie?.status,
    quittungGespeichert: ergebnis.lauftelemetrie?.ende,
    grund: ergebnis.grund || ergebnis.reason || ergebnis.lauftelemetrie?.fehlerklasse,
    erledigt: ergebnis.verarbeitung?.erledigt }));
  return ergebnis;
}

async function einmal({ signal, jetzt = Date.now, lauf = quellenlauf, log = console.log }) {
  if (signal.aborted) throw Error("einmaltest-abgebrochen");
  if (!tagesbetrieb.quellenslot(jetzt())) throw Error("ausserhalb-quellenarbeitsfenster");
  const ergebnis = await fuehreQuellenfensterAus(lauf, log);
  return Boolean(ergebnis.arbeitsfenster && ergebnis.ok === true && ergebnis.lauf?.laufId
    && ergebnis.lauftelemetrie?.ende === true && ergebnis.lauftelemetrie?.status === "success"
    && ergebnis.verarbeitung?.erledigt > 0);
}

async function betreibe({ signal, jetzt = Date.now, lauf = quellenlauf, log = console.log,
  pause = ms => warten(ms, undefined, { signal }) }) {
  let letzterTermin = null;
  while (!signal.aborted) {
    const zeit = jetzt();
    const termin = Math.floor(zeit / INTERVALL_MS);
    if (termin !== letzterTermin && tagesbetrieb.quellenslot(zeit)) {
      letzterTermin = termin;
      try {
        await fuehreQuellenfensterAus(lauf, log);
      } catch {
        log(JSON.stringify({ dienst: "quellenworker", ereignis: "quellenfenster-fehler" }));
      }
    }
    if (signal.aborted) break;
    const bisNaechsterTermin = INTERVALL_MS - jetzt() % INTERVALL_MS;
    try { await pause(Math.min(30000, bisNaechsterTermin)); }
    catch (error) { if (!signal.aborted) throw error; }
  }
}

async function main() {
  const [argument, ...weitere] = process.argv.slice(2);
  if (weitere.length || (argument && !["--check", "--once"].includes(argument))) throw Error("aufruf-ungueltig");
  const pruefen = argument === "--check";
  const einmalig = argument === "--once";
  const kontrolliert = new AbortController();
  const stop = () => kontrolliert.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    if (pruefen || einmalig || quellenAusfuehrungAusgelagert()) {
      const fehler = konfigurationsfehler();
      if (fehler) throw Error(fehler);
      if (einmalig) pruefeEinmalZiel();
      const status = await workerBetrieb.readiness();
      if (!status.bereit || !status.abrufErlaubt) {
        console.error(JSON.stringify({ dienst: "quellenworker", ereignis: "nicht-bereit",
          gruende: status.gruende.map(grund => /^[a-z0-9:-]{1,100}$/.test(grund) ? grund : "unbekannt") }));
        process.exitCode = 1;
        return;
      }
      try { await supabaseRequest("/rest/v1/helmut_quellen_dlq?select=job_id&limit=0"); }
      catch { throw Error("quellen-dlq-nicht-bestaetigt"); }
      try {
        const frischerTestErlaubt = (einmalig || pruefen)
          && process.env.HELMUT_WORKER_SUPABASE_HOST !== PRODUKTIONS_SUPABASE_HOST
          && !quellenAusfuehrungAusgelagert();
        const fields = frischerTestErlaubt ? [betriebskosten.KEY, "llmUsage"] : [betriebskosten.KEY];
        const auth = await readAuthStore({ strict: true, fields });
        const vertrag = betriebskosten.vertrag();
        // Auf einer frischen Testdatenbank legt nur die echte Modellreservierung das Buch an.
        if (auth[betriebskosten.KEY] || !frischerTestErlaubt
            || auth.llmUsage.some(r => r.createdAt >= vertrag.startsAt && r.keinAufruf !== true)) {
          betriebskosten.pruefeBuch(auth[betriebskosten.KEY], vertrag);
        }
      } catch { throw Error("bestehendes-kostenbuch-nicht-bestaetigt"); }
      console.log(JSON.stringify({ dienst: "quellenworker", ereignis: "bereit",
        ort: process.env.HELMUT_EXEC_LOCATION || "lokal", commit: process.env.HELMUT_COMMIT_SHA }));
      if (einmalig) {
        if (!await einmal({ signal: kontrolliert.signal })) process.exitCode = 2;
      } else if (!pruefen) {
        await betreibe({ signal: kontrolliert.signal });
      }
    } else {
      console.log(JSON.stringify({ dienst: "quellenworker", ereignis: "standby" }));
      while (!kontrolliert.signal.aborted) {
        await warten(60000, undefined, { signal: kontrolliert.signal }).catch(() => {});
      }
    }
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}

if (require.main === module) {
  main().catch(error => {
    const grund = error?.message;
    console.error(JSON.stringify({ dienst: "quellenworker", ereignis: "start-fehler",
      grund: typeof grund === "string" && /^[a-z0-9-]{1,70}$/.test(grund) ? grund : "unbekannt" }));
    process.exitCode = 1;
  });
}

module.exports = { betreibe, einmal, konfigurationsfehler, pruefeEinmalZiel };
