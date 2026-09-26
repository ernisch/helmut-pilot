"use strict";
// Plan ist rein lesend. Ausfuehrung braucht eigene konkrete Freigabe; Import-GO reicht nicht.
const crypto = require("node:crypto");
const V = require("../lib/helmut/verstehen-einmalig");
const F = require("../lib/helmut/verstehen-frische18-vertrag");
const Bedienung = require("./verstehen-einmalig-169");
const BESTAETIGUNG = "DIE_18_GEBUNDENEN_QUELLEN_EINMAL_VERSTEHEN";
const fordere = (v, g) => { if (!v) throw new Error("frische18-" + g); };
function argumente(args) {
  fordere(args.length === 1 && args[0] === "--plan" || args.length === 2
    && args[0] === "--execute" && args[1] === BESTAETIGUNG, "argumente-ungueltig");
  return args[0] === "--execute";
}
function pruefeRuntime(env, gitCommit) {
  const commit = env.HELMUT_FRISCHE18_RUNTIME_COMMIT;
  fordere(/^[a-f0-9]{40}$/.test(commit || "") && commit === gitCommit, "runtime-abweichend");
  fordere(env.GITHUB_ACTIONS === "true" && env.GITHUB_REPOSITORY === "ernisch/helmut-pilot"
    && env.GITHUB_REF === "refs/heads/main" && env.GITHUB_EVENT_NAME === "workflow_dispatch"
    && env.GITHUB_RUN_ATTEMPT === "1" && env.GITHUB_SHA === commit, "dispatch-abweichend");
  return commit;
}
function leser(env = process.env) {
  return async (table, query) => {
    fordere(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY, "zugang-fehlt");
    const res = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + table + "?" + query,
      { method: "GET", redirect: "error", signal: AbortSignal.timeout(15000), headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY } });
    fordere(res.status === 200, "lesung-fehlgeschlagen");
    const rows = await res.json(); fordere(Array.isArray(rows), "lesung-ungueltig"); return rows;
  };
}
async function ruhe(read, jetzt = new Date().toISOString()) {
  const [mandate, profile, jobs, locks, runs, leases, quittungen] = await Promise.all([
    read("mandate_profiles", "select=*&order=user_id.asc&limit=505"),
    read("profiles", "select=*&order=id.asc&limit=506"),
    read("helmut_jobs", "select=id&or=(status.neq.erledigt,lease_expires_at.gt." + encodeURIComponent(jetzt) + ")&limit=1"),
    read("pipeline_locks", "select=job_name&expires_at=gt." + encodeURIComponent(jetzt) + "&limit=1"),
    read("process_runs", "select=run_id&finished_at=is.null&started_at=gt." + encodeURIComponent(new Date(Date.parse(jetzt) - 30 * 60000).toISOString()) + "&limit=1"),
    read("helmut_verstehen_reservierungen", "select=vorgang_id&lease_bis=gt." + encodeURIComponent(jetzt) + "&limit=1"),
    read("helmut_store", "select=id&id=eq." + F.QUITTUNG + "&limit=1")
  ]);
  fordere(mandate.length === 500 && profile.length === 501 && mandate.every(m => m.aktiv === false && m.geloescht_at === null), "profilbestand-abweichend");
  fordere(!jobs.length && !locks.length && !runs.length && !leases.length, "parallelbetrieb");
  fordere(!quittungen.length, "auftrag-bereits-verwendet");
  return crypto.createHash("sha256").update(JSON.stringify({ mandate, profile })).digest("hex");
}
async function main(args = process.argv.slice(2), env = process.env) {
  const execute = argumente(args);
  const runtimeCommit = pruefeRuntime(env, Bedienung.echterCommit());
  const storage = require("../lib/helmut/storage"), budget = require("../lib/helmut/testkosten-budget");
  fordere(storage.v3StoreReady(), "speicher-nicht-verfuegbar");
  const read = leser(env), profilHash = await ruhe(read);
  const auth = await storage.readAuthStore();
  fordere(!Object.values(auth.pipelineLocks || {}).some(l => l?.expiresAt > Date.now()), "blob-parallelbetrieb");
  const day = new Date().toISOString().slice(0, 10), kosten = budget.pruefeStart(auth, day, await storage.leseLlmTageszaehler(new Date().toISOString()));
  fordere(kosten.offeneReservierungen === 0 && kosten.gebundenUsd < 4
    && kosten.startklar === true, "kosten-nicht-frei");
  if (execute) {
    const ai = require("../lib/helmut/ai");
    fordere(ai.isAiEnabled() && ai.aiProviderName() === "azure" && ai.understandingModelName() === "gpt-5-mini"
      && budget.aktiv(env) && env.HELMUT_VERSTEHEN_CAS === "on" && env.HELMUT_UNDERSTANDING_LOCK === "on"
      && env.HELMUT_ATOMIC_LOCK === "on", "umgebung-abweichend");
  }
  const eingaben = await read("helmut_store", "select=data&id=eq." + F.EINGABE + "&limit=2");
  fordere(eingaben.length === 1 && eingaben[0].data?.status === "importiert", "eingabe-fehlt");
  const eingabe = eingaben[0].data;
  const ids = (eingabe.rows || []).map(d => d.id);
  fordere(ids.length === 18 && V.idsHash(ids) === F.FRISCHE18.idHash, "ids-abweichend");
  const originale = await storage.getRawDocumentsByIds(ids);
  const versorgung = F.ausGesichertenBelegen(originale, eingabe.belege);
  const liste = { ids };
  fordere(/^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID || ""), "laufkennung-abweichend");
  fordere(new Date(Date.now() + F.FRISCHE18.maxMs).toISOString().slice(0, 10) === day, "tageswechsel");
  const runId = "verstehen18-" + env.GITHUB_RUN_ID;
  // Den echten Kostenleser schon im Nurleseplan ausfuehren, vor jeder Quittung.
  const [neueKosten, links] = await Promise.all([
    budget.laufGebundenUsd(runId, { env }),
    read("ko_document_links", "select=raw_document_id&raw_document_id=in.(" + ids.join(",") + ")&limit=1")
  ]);
  fordere(links.length === 0, "bereits-verknuepft");
  const reserve = budget.reservierungHoeheUsd();
  fordere(neueKosten === 0 && reserve <= F.FRISCHE18.maxUsd
    && kosten.gebundenUsd + reserve <= 4, "kostenplan-nicht-frei");
  const deps = Bedienung.baueDeps(env, runId, { mitQuittung: execute });
  // Kein alter Fehler darf eine implizite Freigabe aus einer anderen Liste erben.
  deps.listWiederaufnahmen = async () => [];
  deps.artikelkontextVersorgung = versorgung;
  // Sperre deckt das volle Fuenfzehnminutenfenster plus Abschlussreserve ab.
  deps.acquireLock = () => storage.acquireGlobalUnderstandingLock(F.FRISCHE18.maxMs + 60000);
  const timer = execute ? setTimeout(() => { console.error("frische18-harte-laufzeit; nur nachlesen, kein Retry"); process.exit(1); }, F.FRISCHE18.maxMs) : null;
  try {
    const out = await V.fuehreAus({ ids: liste.ids, deps, execute, erwartet: F.FRISCHE18,
      commit: F.FRISCHE18.commit, runtimeCommit, runId, quittungsschluessel: F.QUITTUNG, env });
    // Einmalquittung verhindert zweiten Lauf; Nachlesung muss diese deshalb explizit ausnehmen.
    const nachRead = (table, query) => table === "helmut_store" ? Promise.resolve([]) : read(table, query);
    const nachHash = await ruhe(nachRead);
    const nachAuth = await storage.readAuthStore();
    fordere(!(nachAuth.pipelineLocks?.["global-understanding"]?.expiresAt > Date.now()), "sperre-nicht-frei");
    out.profileUnveraendert = profilHash === nachHash;
    out.vollstaendigVerstanden = execute && out.ergebnisse?.length === F.FRISCHE18.cluster
      && out.ergebnisse.every(r => ["saved", "updated", "merged", "duplicate"].includes(r.status));
    out.ok = out.ok && out.profileUnveraendert && (!execute || out.vollstaendigVerstanden);
    out.quellenkontextCommit = F.FRISCHE18.commit;
    delete out.snapshotCommit;
    out.funktionsnachweis500 = false;
    out.kostenleserVorabBestaetigt = true;
    console.log(JSON.stringify(out, null, 2)); return out.ok ? 0 : 1;
  } finally { if (timer) clearTimeout(timer); }
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(e => {
  console.log(JSON.stringify({ ok: false, grund: /^frische18-[a-z-]+$/.test(e.message || "") ? e.message : "frische18-technischer-fehler", automatischeWiederholung: false })); process.exitCode = 1;
});
module.exports = { argumente, pruefeRuntime, ruhe, main, BESTAETIGUNG };
