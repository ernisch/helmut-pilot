"use strict";

// Einmaliger Betreiberauftrag vom 15.09.2026. Keine Aktivierung, kein Modell.
// Der Timer fordert ausschliesslich den bestehenden manuellen Abschluss an.
const { pruefe: konfiguration } = require("./github-laufzeitpruefung");
const T = require("../lib/helmut/testkohorte-testende");
const { fordere, DirektAbbruch } = require("../lib/helmut/testkohorte-direkt500");
const { PROJECT_URL } = require("./github-fachzyklus-a");
const K = require("../lib/helmut/testkosten-budget");
const REPO = "ernisch/helmut-pilot";
const START = Date.parse("2026-09-15T10:00:00Z");
const ENDE = Date.parse("2026-09-16T11:00:00Z");
const END_CRON = "43 10 16 9 *";
const MONITOR_CRON = "17 * 15,16 9 *";

function kosten(tag, day) {
  K.pruefeTag(tag, day);
  const gebunden = K.belegt(tag);
  return { verbrauchtMikroUsd: tag.spent, reserveMikroUsd: gebunden - tag.spent,
    gebundenMikroUsd: gebunden, limitMikroUsd: tag.limit };
}

async function ausfuehren({ env = process.env, fetchFn = global.fetch,
  now = () => Date.now(), warten = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let dispatchVersucht = false;
  try {
    fordere(env.GITHUB_REPOSITORY === REPO && env.GITHUB_REF === "refs/heads/main"
      && env.GITHUB_WORKFLOW_REF === REPO + "/.github/workflows/500-testfenster.yml@refs/heads/main"
      && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ""), "timer-kontext-ungueltig");
    const geplant = env.GITHUB_EVENT_NAME === "schedule";
    fordere(geplant || env.GITHUB_EVENT_NAME === "workflow_dispatch", "timer-ereignis-ungueltig");
    fordere(!geplant || [END_CRON, MONITOR_CRON].includes(env.HELMUT_TIMER_CRON), "timer-zeitplan-ungueltig");
    const probe = env.HELMUT_TIMER_DISPATCH_PROBE === "true";
    fordere(!probe || !geplant, "timer-dispatchprobe-nur-manuell");
    if (now() < START || now() >= ENDE + 2 * 3600000) {
      return { ok: true, reinLesend: true, grund: "ausserhalb-einmaligem-testfenster" };
    }
    const endauftrag = geplant && env.HELMUT_TIMER_CRON === END_CRON;
    if (endauftrag) {
      fordere(env.GITHUB_RUN_ATTEMPT === "1", "timer-keine-automatische-wiederholung");
      fordere(now() >= ENDE - 20 * 60000, "timer-endauftrag-zu-frueh");
      while (now() < ENDE) await warten(Math.min(30000, ENDE - now()));
    }
    fordere(env.GITHUB_TOKEN && env.HELMUT_CRON_SECRET && env.SUPABASE_SERVICE_ROLE_KEY
      && String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL, "timer-zugang-fehlt");
    async function github(path, body) {
      const r = await fetchFn("https://api.github.com/repos/" + REPO + path, {
        method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10", ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      fordere(r.status === 200, "timer-github-antwort-ungueltig");
      return r.json();
    }
    const head = await github("/branches/main");
    fordere(head?.commit?.sha === env.GITHUB_SHA, "timer-main-inzwischen-geaendert");
    const status = await github("/commits/" + env.GITHUB_SHA + "/status");
    const vercel = status.statuses?.find(s => s.context === "Vercel");
    fordere(status.sha === env.GITHUB_SHA && vercel?.state === "success"
      && /^https:\/\/vercel\.com\/nohut\/helmut-pilot\/[a-zA-Z0-9]+$/.test(vercel.target_url || ""),
    "timer-vercel-erfolg-fehlt");
    // Unabhaengig vom GitHub Status muss der Hauptalias denselben Commit ausgeben.
    const config = await konfiguration({ env: { ...env, HELMUT_PRODUCTION_COMMIT: env.GITHUB_SHA }, fetchFn });
    fordere(config.ok && config.storageSupabase && config.v3Bereit && config.profileRelational
      && config.profileExclusive && config.retention === 36 && config.kommunikationGesperrt
      && config.testKosten?.version === 2 && config.testKosten.aktiv, "timer-production-nicht-bestaetigt");
    async function db(tail) {
      const r = await fetchFn(PROJECT_URL + "/rest/v1/" + tail, { method: "GET", redirect: "error",
        signal: AbortSignal.timeout(20000), headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" } });
      fordere(r.status === 200, "timer-datenbank-unlesbar");
      const rows = await r.json(); fordere(Array.isArray(rows), "timer-datenbankformat"); return rows;
    }
    const [mandate, identitaeten, auth] = await Promise.all([
      db("mandate_profiles?select=*&order=user_id&limit=505"),
      db("profiles?select=*&order=id&limit=506"),
      db("helmut_store?select=data&id=eq.main-auth&limit=2")
    ]);
    fordere(auth.length === 1, "timer-auth-nicht-eindeutig");
    const vor = T.pruefeSnapshot({ mandate, identitaeten, auth: auth[0].data });
    fordere(vor.gesamt === 504 && identitaeten.length === 505
      && T.KOHORTE_KENNUNGEN.every(id => mandate.some(m => m.user_id === id)), "timer-kohorte-unvollstaendig");
    const tag = new Date(now()).toISOString().slice(0, 10);
    let tageskosten;
    try { tageskosten = kosten(auth[0].data.testKostenTage?.[tag], tag); }
    catch { tageskosten = { kostenbuchNichtBestaetigt: true }; }
    // Auch ein fehlendes Kostenbuch darf den kostenfreien Abschluss nicht verhindern.
    const bericht = { ok: true, reinLesend: true, zeit: new Date(now()).toISOString(),
      ende: new Date(ENDE).toISOString(), gesamt: vor.gesamt, aktiv: vor.aktiv,
      synthetischAktiv: vor.aktive.length, synthetischInaktiv: 495 - vor.aktive.length,
      tageskosten, modellaufrufe: 0, funktionsnachweis500: false };
    if ((!endauftrag && !probe) || (endauftrag && vor.aktive.length === 0)) return bericht;
    fordere(env.GITHUB_RUN_ATTEMPT === "1", "timer-keine-automatische-wiederholung");
    const runs = await github("/actions/workflows/500-testende.yml/runs?per_page=100");
    fordere(Array.isArray(runs.workflow_runs), "timer-abschlussliste-unlesbar");
    const vorige = runs.workflow_runs.filter(r => r.status !== "completed"
      || Date.parse(r.created_at) >= ENDE - 30 * 60000);
    fordere(vorige.length === 0, "timer-abschluss-bereits-angefordert-oder-unklar");
    // Genau ein POST. Bei Timeout/Fehler keinen zweiten Aufruf ausloesen.
    dispatchVersucht = true;
    const dispatch = await github("/actions/workflows/500-testende.yml/dispatches", { ref: "main", inputs: {
      schritt: probe ? "vorpruefung" : "deaktivierung", production_commit: env.GITHUB_SHA,
      bestaetigung: probe ? "" : T.CONFIRM
    } });
    fordere(Number.isSafeInteger(dispatch.workflow_run_id) && dispatch.workflow_run_id > 0
      && dispatch.html_url === "https://github.com/" + REPO + "/actions/runs/" + dispatch.workflow_run_id,
    "timer-abschlusskennung-unlesbar");
    return { ...bericht, reinLesend: false, abschlussAngefordert: !probe, vorpruefungAngefordert: probe,
      abschlussRunId: dispatch.workflow_run_id, testendeBestaetigt: false, automatischeWiederholung: false };
  } catch (e) {
    return { ok: false, reinLesend: !dispatchVersucht, dispatchVersucht,
      ausgangUnbekannt: dispatchVersucht, automatischeWiederholung: false,
      grund: e instanceof DirektAbbruch ? e.grund : "timer-netz-oder-lesefehler" };
  }
}
if (require.main === module) ausfuehren().then(r => {
  console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1;
});
module.exports = { ausfuehren, kosten, START, ENDE, END_CRON, MONITOR_CRON };
