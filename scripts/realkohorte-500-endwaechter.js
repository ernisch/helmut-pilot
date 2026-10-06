"use strict";

// Nur expliziter manueller Endwaechter. Keine Aktivierung, Artefakte oder Schedule.
function erzeugeEndwaechter(R, optionen = {}) {
const envPrefix = optionen.synthetik ? "HELMUT_SYNTHETIK500_" : "HELMUT_REAL500_";
const workflow = optionen.synthetik ? "synthetik-500-endwaechter.yml" : "realkohorte-500-endwaechter.yml";
const K = require("../lib/helmut/testkosten-budget");
const PROJECT_URL = "https://ddckuvvpcytqbyfmbvie.supabase.co";
const STATUS_URL = "https://helmut-pilot.vercel.app/api/cron/testnachweis-status";
const REPO = "ernisch/helmut-pilot";
const MAX_MS = 20000;
const MAX_FENSTER_MS = 4 * 3600000;
const KOSTEN_PFAD = "/rest/v1/helmut_store?select=buecher:data->testKostenTage,auftrag:data->testKostenAuftrag&id=eq.main-auth&limit=2";
const fordere = (ok, grund) => { if (!ok) throw new Error("real500-waechter-" + grund); };

async function begrenztesJson(url, options, { fetchFn = global.fetch, timeoutMs = MAX_MS } = {}) {
  fordere(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_MS, "timeout-ungueltig");
  const controller = new AbortController(), parent = options.signal;
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  let timer;
  const arbeit = (async () => {
    const response = await fetchFn(url, { ...options, redirect: "error", signal: controller.signal });
    fordere(response?.status === 200, "http-antwort");
    // Das Zeitlimit umfasst Header, vollstaendigen Body und JSON, nicht nur fetch.
    return await response.json();
  })();
  const grenze = new Promise((_, reject) => {
    timer = setTimeout(() => { abort(); reject(new Error("real500-waechter-anfrage-zeitlimit")); }, timeoutMs);
  });
  try { return await Promise.race([arbeit, grenze]); }
  finally { clearTimeout(timer); parent?.removeEventListener("abort", abort); }
}

function requestFactory({ env = process.env, fetchFn = global.fetch, timeoutMs = MAX_MS } = {}) {
  fordere(String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL
    && env.SUPABASE_SERVICE_ROLE_KEY, "speicherzugang-fehlt");
  return ({ methode, pfad, body, signal }) => {
    fordere(["GET", "POST"].includes(methode) && typeof pfad === "string"
      && pfad.startsWith("/rest/v1/") && !pfad.includes("#") && !pfad.includes("\\"), "request-pfad");
    fordere((methode === "POST" && pfad === "/rest/v1/rpc/" + R.RPC_NAME)
      || (methode === "GET" && (pfad === KOSTEN_PFAD
        || pfad.startsWith("/rest/v1/rpc/" + R.READ_RPC_NAME + "?"))), "request-zweck");
    return begrenztesJson(PROJECT_URL + pfad, { method: methode, signal,
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { fetchFn, timeoutMs });
  };
}
async function lesendEinmalWiederholen(fn) {
  try { return await fn(); } catch { return await fn(); }
}
function pruefeKontext(auftrag, env) {
  R.pruefeAuftrag(auftrag);
  fordere(env.GITHUB_REPOSITORY === REPO && env.GITHUB_REF === "refs/heads/main"
    && env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_SHA === auftrag.productionCommit
    && env.GITHUB_WORKFLOW_REF === REPO + "/.github/workflows/" + workflow + "@refs/heads/main"
    && env.GITHUB_RUN_ATTEMPT === "1" && /^[0-9]+$/.test(env.GITHUB_RUN_ID || ""), "workflow-kontext");
}
function endbericht(result, auftrag) {
  let endzustandBestaetigt = false;
  const gelesen = result?.lesung || result?.gegenlesung;
  if (gelesen) {
    const r = R.pruefeLesung(auftrag, gelesen);
    endzustandBestaetigt = r.zustand === "beendet" && r.aktiv === 0;
  }
  return { ...result, ok: result?.zustand === "beendet-bestaetigt" && endzustandBestaetigt,
    endzustandBestaetigt, aktivierungsrecht: false, funktionsnachweis500: false,
    schreibversuch: result?.schreibversuche === 1, automatischeWiederholung: false,
    manuellerSqlRueckwegNoetig: !endzustandBestaetigt };
}

async function steuere({ auftrag, env, deps }) {
  pruefeKontext(auftrag, env);
  let endversuch = false, eigenerZustand = null;
  const beendeEinmal = async grund => {
    endversuch = true;
    return endbericht(await deps.beende({ ...auftrag, grund }), auftrag);
  };
  try {
    let status = R.pruefeLesung(auftrag, await lesendEinmalWiederholen(() => deps.lese()));
    eigenerZustand = status.zustand;
    if (status.zustand === "beendet")
      return endbericht({ zustand: "beendet-bestaetigt", schreibversuche: 0, lesung: status }, auftrag);
    const start = deps.jetzt(), ende = Date.parse(status.endeAm);
    // Ein spaet gestarteter Waechter muss bekannte aktive Profile trotzdem beenden.
    // Readinessfehler oder ein unzulaessig langes Fenster duerfen das Ende nicht sperren.
    if (status.zustand === "aktiv" && ende <= start) return await beendeEinmal("frist");
    if (status.zustand === "aktiv" && ende - start > MAX_FENSTER_MS)
      return await beendeEinmal("notstopp");
    fordere(ende > start && ende - start <= MAX_FENSTER_MS, "endfenster");
    try { await deps.leseRuntime(); }
    catch (e) {
      if (status.zustand === "aktiv") return await beendeEinmal("notstopp");
      throw e;
    }
    deps.melde({ zustand: "bereit-lesend", operationId: auftrag.operationId,
      manifestHash: auftrag.manifestHash, productionCommit: auftrag.productionCommit,
      profilManifestHash: status.profilManifestHash,
      jobId: env.GITHUB_RUN_ID, beobachtetAm: status.beobachtetAm, endeAm: status.endeAm,
      aktiv: status.aktiv, aktivierungsrecht: false, profilinhaltAusgegeben: false });
    while (status.zustand === "vorbereitet") {
      // Keine bestehende Aktivquittung erzeugen/behaupten. Maximal fuenf Minuten.
      fordere(deps.jetzt() - start < 300000 && deps.jetzt() < ende, "keine-startquittung");
      await deps.warte(Math.min(10000, ende - deps.jetzt()));
      status = R.pruefeLesung(auftrag, await lesendEinmalWiederholen(() => deps.lese()));
      eigenerZustand = status.zustand;
    }
    while (status.zustand === "aktiv") {
      let grund = deps.jetzt() >= ende ? "frist" : null;
      if (!grund) {
        try {
          const kosten = await lesendEinmalWiederholen(() => deps.leseKosten());
          fordere(kosten.tag === new Date(deps.jetzt()).toISOString().slice(0, 10)
            && kosten.tag === status.endeAm.slice(0, 10), "kostentag");
          const auftragslimit = optionen.synthetik ? kosten.auftragslimitMikroUsd : K.AUFTRAG_V3_LIMIT_MICRO_USD;
          fordere([K.AUFTRAG_V3_LIMIT_MICRO_USD, K.AUFTRAG_V4_LIMIT_MICRO_USD].includes(auftragslimit), "kostengrenzen");
          if (kosten.gebundenMikroUsd >= 6000000 || kosten.auftragGebundenMikroUsd >= auftragslimit
            || kosten.ungeklaert || kosten.frozen !== null) grund = "notstopp";
        } catch { grund = "notstopp"; }
      }
      if (grund) {
        // R.beende versucht einmal zu schreiben und einmal gebunden gegenzulesen.
        // Danach NIE eigene Wiederholung oder eine zweite Gegenlesung.
        return await beendeEinmal(grund);
      }
      await deps.warte(Math.min(60000, Math.max(0, ende - deps.jetzt())));
      try {
        status = R.pruefeLesung(auftrag, await lesendEinmalWiederholen(() => deps.lese()));
        eigenerZustand = status.zustand;
      }
      catch {
        // Die zuletzt gebundene aktive Quittung bleibt Grund fuer einen Endversuch.
        return await beendeEinmal("notstopp");
      }
    }
    fordere(status.zustand === "beendet" && status.aktiv === 0, "ende-nicht-bestaetigt");
    return { ok: true, zustand: "beendet", aktiv: 0, schreibversuch: false,
      automatischeWiederholung: false, aktivierungsrecht: false, funktionsnachweis500: false };
  } catch {
    return { ok: false, grund: "real500-waechter-ende-oder-vorbedingung-nicht-bestaetigt",
      schreibversuch: endversuch ? "unbekannt" : false, automatischeWiederholung: false, aktivierungsrecht: false,
      manuellerSqlRueckwegNoetig: endversuch || eigenerZustand === "aktiv" ? true
        : eigenerZustand === "vorbereitet" || eigenerZustand === "beendet" ? false : "unbekannt",
      funktionsnachweis500: false };
  }
}

async function ausfuehren({ scharf = false, auftrag, env = process.env, fetchFn = global.fetch,
  jetzt = Date.now, warte = ms => new Promise(resolve => setTimeout(resolve, ms)),
  melde = r => console.log(JSON.stringify(r)) } = {}) {
  try {
    auftrag ||= { operationId: env[envPrefix + "OPERATION_ID"], manifestHash: env[envPrefix + "MANIFEST_HASH"],
      productionCommit: env[envPrefix + "PRODUCTION_COMMIT"], grund: "frist" };
    pruefeKontext(auftrag, env);
    if (!scharf) return { ok: true, modus: "inerte-eingabepruefung", bewaffnet: false,
      externeAnfragen: 0, aktivierungsrecht: false, starttorFreigegeben: false };
    fordere(env[envPrefix + "ENDWAECHTER_EXECUTE"] === "1"
      && env[envPrefix + "ENDWAECHTER_CONFIRM"] === R.BESTAETIGUNG, "explizite-endfreigabe-fehlt");
    const request = requestFactory({ env, fetchFn });
    const json = (url, options) => begrenztesJson(url, options, { fetchFn });
    return await steuere({ auftrag, env, deps: { jetzt, warte, melde,
      lese: () => R.lese({ auftrag, request, timeoutMs: MAX_MS }),
      beende: a => R.beende({ auftrag: a, aktiviert: true, request, timeoutMs: MAX_MS }),
      leseRuntime: async () => {
        fordere(env.GITHUB_TOKEN && env.HELMUT_CRON_SECRET, "readiness-zugang-fehlt");
        const gh = { method: "GET", headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json" } };
        const main = await lesendEinmalWiederholen(() => json("https://api.github.com/repos/" + REPO + "/branches/main", gh));
        fordere(main?.commit?.sha === auftrag.productionCommit, "main-drift");
        const s = await lesendEinmalWiederholen(() => json("https://api.github.com/repos/" + REPO + "/commits/" + auftrag.productionCommit + "/status", gh));
        fordere(s.sha === auftrag.productionCommit && s.statuses?.some(v => v.context === "Vercel" && v.state === "success"),
          "production-ready-fehlt");
        const r = await lesendEinmalWiederholen(() => json(STATUS_URL, { method: "GET", headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json" } }));
        fordere(r?.ok === true && r.production === true && r.reinLesend === true && r.commit === auftrag.productionCommit
          && r.storageSupabase === true && r.v3Bereit === true && r.profileRelational === true
          && r.profileExclusive === true && r.kommunikationGesperrt === true
          && r.testKosten?.aktiv === true && K.tagespolitikGueltig(r.testKosten), "production-runtime-fehlt");
        return true;
      },
      leseKosten: async () => {
        // Projektion ausschliesslich Kostenbuecher; keine Authkonten/Snapshots.
        const rows = await request({ methode: "GET", pfad: KOSTEN_PFAD });
        fordere(Array.isArray(rows) && rows.length === 1 && rows[0].buecher && rows[0].auftrag, "kostenbuch-unlesbar");
        const auth = { [K.KEY]: rows[0].buecher, [K.AUFTRAG_KEY]: rows[0].auftrag };
        const tag = new Date(jetzt()).toISOString().slice(0, 10), k = K.kontrolliere(auth, tag), a = K.auftragsStand(auth, tag);
        fordere(k.limitUsd === 6 && (optionen.synthetik
          ? [K.AUFTRAG_V3_LIMIT_MICRO_USD, K.AUFTRAG_V4_LIMIT_MICRO_USD].includes(a?.limitMicroUsd)
          : a?.limitMicroUsd === K.AUFTRAG_V3_LIMIT_MICRO_USD) && a.grenzeInklusive, "kostengrenzen");
        const t = auth[K.KEY][tag];
        return { tag, gebundenMikroUsd: K.belegt(t), auftragGebundenMikroUsd: a.gebundenMicroUsd,
          auftragslimitMikroUsd: a.limitMicroUsd,
          ungeklaert: Object.values(t.calls).some(c => c.status === "ungeklaert"), frozen: t.frozen };
      }
    } });
  } catch {
    return { ok: false, grund: "real500-waechter-eingabe-oder-zugang-ungueltig", bewaffnet: false,
      aktivierungsrecht: false, starttorFreigegeben: false };
  }
}
return { MAX_MS, MAX_FENSTER_MS, begrenztesJson, requestFactory, lesendEinmalWiederholen,
  pruefeKontext, endbericht, steuere, ausfuehren };

}
module.exports = { ...erzeugeEndwaechter(require("../lib/helmut/realkohorte-500-end-runtime")), erzeugeEndwaechter };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--scharf")) process.exitCode = 2;
  else module.exports.ausfuehren({ scharf: args[0] === "--scharf" }).then(r => {
    console.log(JSON.stringify(r)); process.exitCode = r.ok ? 0 : 1;
  }).catch(() => { console.error("Realkohorten-Ende nicht bestaetigt; gebundenen manuellen Rueckweg pruefen."); process.exitCode = 1; });
}
