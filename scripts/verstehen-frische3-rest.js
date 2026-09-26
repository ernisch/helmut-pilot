"use strict";
// Plan ist rein lesend. Ausfuehrung braucht eigene konkrete Freigabe; Import-GO reicht nicht.
const crypto = require("node:crypto");
const V = require("../lib/helmut/verstehen-einmalig");
const F = require("../lib/helmut/verstehen-frische3-rest-vertrag");
const F5 = require("../lib/helmut/verstehen-frische5-vertrag");
const Bedienung = require("./verstehen-einmalig-169");
const BESTAETIGUNG = "DIE_3_RESTQUELLEN_EINMAL_VERSTEHEN";
const fordere = (v, g) => { if (!v) throw new Error("frische3-rest-" + g); };
function argumente(args) {
  fordere(args.length === 1 && args[0] === "--plan" || args.length === 2
    && args[0] === "--execute" && args[1] === BESTAETIGUNG, "argumente-ungueltig");
  return args[0] === "--execute";
}
function pruefeRuntime(env, gitCommit) {
  const commit = env.HELMUT_FRISCHE3_REST_RUNTIME_COMMIT;
  fordere(/^[a-f0-9]{40}$/.test(commit || "") && commit === gitCommit, "runtime-abweichend");
  fordere(env.GITHUB_ACTIONS === "true" && env.GITHUB_REPOSITORY === "ernisch/helmut-pilot"
    && env.GITHUB_REF === "refs/heads/main" && env.GITHUB_EVENT_NAME === "workflow_dispatch"
    && env.GITHUB_RUN_ATTEMPT === "1" && env.GITHUB_SHA === commit, "dispatch-abweichend");
  return commit;
}
// Der Original-Fuenfer-Beleg wird VOLL kanonisch geprueft: genau eine Zeile, deren
// kanonischer Hash exakt der des gesicherten Belegs ist. Keine Feldauswahl — der
// ganze Beleg ist gebunden.
function pruefeF5Quittung(rows) {
  fordere(Array.isArray(rows) && rows.length === 1 && rows[0].id === F.VORGAENGER_QUITTUNG
    && F.kanonischerHash(rows[0].data) === F.F5_QUITTUNG_HASH, "f5-quittung-abweichend");
  return rows[0].data;
}
// Der alte unknown-Vorgang: KO unveraendert gegenueber dem Quarantaenearchiv.
function pruefeAltesKo(rows) {
  fordere(Array.isArray(rows) && rows.length === 1
    && F.kanonischerHash(rows[0]) === F.ARCHIV_KO_HASH, "altes-ko-abweichend");
  return rows[0];
}
// Der alte CAS bleibt gesperrt: unveraendert gegenueber dem Archiv und weiter
// `unbekannt`. Der alte unknown-Ausgang wird NIE freigegeben.
function pruefeAltesCas(rows) {
  fordere(Array.isArray(rows) && rows.length === 1 && rows[0].zustand === "unbekannt"
    && F.kanonischerHash(rows[0]) === F.ARCHIV_CAS_HASH, "altes-cas-abweichend");
  return rows[0];
}
// Die durch Root entfernte Vormerkung muss entfernt bleiben: keine Zeile.
function pruefeKeineVormerkung(rows) {
  fordere(Array.isArray(rows) && rows.length === 0, "alte-vormerkung-vorhanden");
  return true;
}
function pruefeArchiv(rows) {
  fordere(Array.isArray(rows) && rows.length === 1
    && rows[0].id === "quarantaene-wadephul-ki-20260926-a"
    && F.kanonischerHash(rows[0].data) === F.ARCHIV_HASH, "archiv-abweichend");
  return rows[0].data;
}
async function pruefeQuarantaene(read) {
  const [ko, cas, vormerkungen, archiv] = await Promise.all([
    read("knowledge_objects", "select=*&id=eq." + encodeURIComponent(F.ALT_KO_ID) + "&limit=2"),
    read("helmut_verstehen_reservierungen", "select=*&vorgang_id=eq." + encodeURIComponent(F.VORGANG) + "&limit=2"),
    read("helmut_verstehen_vormerkungen", "select=*&vorgang_id=eq." + encodeURIComponent(F.VORGANG) + "&limit=2"),
    read("helmut_store", "select=id,data&id=eq.quarantaene-wadephul-ki-20260926-a&limit=2")
  ]);
  pruefeAltesKo(ko); pruefeAltesCas(cas); pruefeKeineVormerkung(vormerkungen);
  pruefeArchiv(archiv);
  return { ko: F.ARCHIV_KO_HASH, cas: F.ARCHIV_CAS_HASH };
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
  // Der technische Tagesriegel kommt aus der bestehenden Auftragslogik (6 USD); kein
  // eigener Grenzwert, keine Erhoehung, keine Kopie der alten 4-USD-Konstante.
  const tagesriegelUsd = budget.LIMIT_MICRO_USD / 1e6;
  fordere(storage.v3StoreReady(), "speicher-nicht-verfuegbar");
  const read = leser(env), profilHash = await ruhe(read);
  const auth = await storage.readAuthStore();
  fordere(!Object.values(auth.pipelineLocks || {}).some(l => l?.expiresAt > Date.now()), "blob-parallelbetrieb");
  const day = new Date().toISOString().slice(0, 10), kosten = budget.pruefeStart(auth, day, await storage.leseLlmTageszaehler(new Date().toISOString()));
  fordere(kosten.offeneReservierungen === 0 && kosten.gebundenUsd < tagesriegelUsd
    && kosten.startklar === true, "kosten-nicht-frei");
  if (execute) {
    const ai = require("../lib/helmut/ai");
    fordere(ai.isAiEnabled() && ai.aiProviderName() === "azure" && ai.understandingModelName() === "gpt-5-mini"
      && budget.aktiv(env) && env.HELMUT_VERSTEHEN_CAS === "on" && env.HELMUT_UNDERSTANDING_LOCK === "on"
      && env.HELMUT_ATOMIC_LOCK === "on", "umgebung-abweichend");
  }
  // Die BESTEHENDE Fuenfer-Eingabe wird unveraendert gelesen und VOLL validiert;
  // erst danach werden genau die drei Restids ausgewaehlt.
  const eingaben = await read("helmut_store", "select=data&id=eq." + F.EINGABE + "&limit=2");
  fordere(eingaben.length === 1 && eingaben[0].data?.status === "importiert", "eingabe-fehlt");
  const eingabe = eingaben[0].data;
  const ids5 = (eingabe.rows || []).map(d => d.id);
  fordere(ids5.length === 5 && V.idsHash(ids5) === F5.FRISCHE5.idHash, "f5-ids-abweichend");
  const originale = await storage.getRawDocumentsByIds(ids5);
  const versorgung = F.ausGesichertenBelegen(originale, eingabe.belege);
  fordere(V.idsHash(F.IDS) === F.FRISCHE3_REST.idHash, "rest-ids-abweichend");
  // BEIDE historischen Belege voll kanonisch pruefen, den alten unknown-Vorgang
  // unveraendert und ohne Vormerkung bestaetigen — VOR jedem Schreibzugriff.
  const f5Quittung = await read("helmut_store", "select=id,data&id=eq." + F.VORGAENGER_QUITTUNG + "&limit=2");
  pruefeF5Quittung(f5Quittung);
  await pruefeQuarantaene(read);
  fordere(/^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID || ""), "laufkennung-abweichend");
  fordere(new Date(Date.now() + F.FRISCHE3_REST.maxMs).toISOString().slice(0, 10) === day, "tageswechsel");
  const runId = "verstehen3-" + env.GITHUB_RUN_ID;
  // Den echten Kostenleser schon im Nurleseplan ausfuehren, vor jeder Quittung, und
  // bestaetigen, dass ALLE DREI Restquellen vor dem Start unverknuepft sind.
  const [neueKosten, links] = await Promise.all([
    budget.laufGebundenUsd(runId, { env }),
    read("ko_document_links", "select=raw_document_id&raw_document_id=in.(" + F.IDS.join(",") + ")&limit=1")
  ]);
  fordere(links.length === 0, "bereits-verknuepft");
  const reserve = budget.reservierungHoeheUsd();
  fordere(neueKosten === 0 && reserve <= F.FRISCHE3_REST.maxUsd
    && kosten.gebundenUsd + reserve <= tagesriegelUsd, "kostenplan-nicht-frei");
  const deps = Bedienung.baueDeps(env, runId, { mitQuittung: execute });
  // Kein alter Fehler darf eine implizite Freigabe aus einer anderen Liste erben.
  deps.listWiederaufnahmen = async () => [];
  deps.artikelkontextVersorgung = versorgung;
  // Sperre deckt das volle Siebenminutenfenster plus Abschlussreserve ab.
  deps.acquireLock = () => storage.acquireGlobalUnderstandingLock(F.FRISCHE3_REST.maxMs + 60000);
  const timer = execute ? setTimeout(() => { console.error("frische3-rest-harte-laufzeit; nur nachlesen, kein Retry"); process.exit(1); }, F.FRISCHE3_REST.maxMs) : null;
  try {
    const out = await V.fuehreAus({ ids: F.IDS.slice(), deps, execute, erwartet: F.FRISCHE3_REST,
      commit: F.FRISCHE3_REST.commit, runtimeCommit, runId, quittungsschluessel: F.QUITTUNG, env });
    // Einmalquittung verhindert zweiten Lauf; Nachlesung muss diese deshalb explizit ausnehmen.
    const nachRead = (table, query) => table === "helmut_store" ? Promise.resolve([]) : read(table, query);
    const nachHash = await ruhe(nachRead);
    const nachAuth = await storage.readAuthStore();
    fordere(!(nachAuth.pipelineLocks?.["global-understanding"]?.expiresAt > Date.now()), "sperre-nicht-frei");
    // Nachkontrolle: der alte unknown-Vorgang ist unveraendert und weiter gesperrt.
    await pruefeQuarantaene(read);
    out.alterUnknownVorgangUnveraendert = true;
    out.historischeBelege = { quittung: F.F5_QUITTUNG_HASH, archiv: F.ARCHIV_HASH };
    out.profileUnveraendert = profilHash === nachHash;
    out.vollstaendigVerstanden = execute && out.ergebnisse?.length === F.FRISCHE3_REST.cluster
      && out.ergebnisse.every(r => ["saved", "updated", "merged", "duplicate"].includes(r.status));
    out.ok = out.ok && out.profileUnveraendert && (!execute || out.vollstaendigVerstanden);
    out.quellenkontextCommit = F.FRISCHE3_REST.commit;
    delete out.snapshotCommit;
    out.funktionsnachweis500 = false;
    out.kostenleserVorabBestaetigt = true;
    console.log(JSON.stringify(out, null, 2)); return out.ok ? 0 : 1;
  } finally { if (timer) clearTimeout(timer); }
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(e => {
  console.log(JSON.stringify({ ok: false, grund: /^frische3-rest-[a-z-]+$/.test(e.message || "") ? e.message : "frische3-rest-technischer-fehler", automatischeWiederholung: false })); process.exitCode = 1;
});
module.exports = { argumente, pruefeRuntime, pruefeF5Quittung, pruefeAltesKo, pruefeAltesCas,
  pruefeKeineVormerkung, pruefeArchiv, pruefeQuarantaene, ruhe, main, BESTAETIGUNG };
