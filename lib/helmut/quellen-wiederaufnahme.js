"use strict";

// Expliziter Betreiberweg nach einem unbestaetigten source_fetch-Abschluss.
// Nur vorhandene GET-Leser und der unveraenderte native Queue-Motor. Kein PATCH,
// kein Reaper-Sonderaufruf, kein Zuruecksetzen und keine fingierte Erfolgskorrektur.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const admin = require("./quellen-adminstart");
const tagesbetrieb = require("./quellen-tagesbetrieb");
const budget = require("./betriebskosten-budget");
const DATEIEN = ["worker.js", "lib/helmut/quellen-arbeitsfenster.js",
  "lib/helmut/quellen-wiederaufnahme.js", "lib/helmut/quellen-automatik.js"];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const stabil = x => Array.isArray(x) ? x.map(stabil) : x && typeof x === "object"
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stabil(x[k])])) : x;
const hash = x => sha(JSON.stringify(stabil(x)));
const fordere = (ok, grund) => { if (!ok) throw Error("wiederaufnahme-" + grund); };
const ganz = x => Number.isSafeInteger(x) && x >= 0;
function zielGueltig(z) {
  return z && Object.keys(z).sort().join(",") === "jobId,runId"
    && UUID.test(z.jobId) && /^cron-crawl-[a-z0-9-]+$/.test(z.runId);
}
function digest(b) { const { gelesenAm, digest: _, ...rest } = b; return hash(rest); }
function pruefeBindung(auftrag, b, jetzt = Date.now()) {
  fordere(admin.auftragGueltig(auftrag) && b && b.version === 1
    && zielGueltig(b.ziel) && hash(auftrag) === hash(b.auftrag), "auftrag");
  fordere(auftrag.tag === new Date(jetzt).toISOString().slice(0, 10)
    && new Date(jetzt + 300000).toISOString().slice(0, 10) === auftrag.tag, "tag");
  const gelesen = Date.parse(b.gelesenAm);
  fordere(Number.isFinite(gelesen) && gelesen <= jetzt && jetzt - gelesen <= 300000, "bindung-abgelaufen");
  fordere(b.digest === digest(b), "bindung-digest");
  pruefeStand(b, jetzt);
}
function pruefeStand(b, jetzt) {
  const s = b.stand, j = s?.job, r = s?.laeufe?.[0];
  fordere(/^[a-f0-9]{40}$/.test(b.commit || ""), "commit");
  fordere(b.limits?.aufrufe === 100 && b.limits.reserve === 0 && b.limits.originale === 16
    && b.limits.tagUsd === 1 && b.limits.gesamtUsd === 30, "limits");
  fordere(j?.id === b.ziel.jobId && j.job_type === "source_fetch" && j.tenant_id === null
    && j.status === "laeuft" && j.finished_at === null && j.attempts === 1 && j.max_attempts === 3
    && Number.isSafeInteger(j.attempts) && Number.isSafeInteger(j.max_attempts)
    && j.lease_owner?.startsWith(b.ziel.runId + "-")
    && Number.isFinite(Date.parse(j.lease_expires_at)) && Date.parse(j.lease_expires_at) < jetzt
    && j.payload?.quelle?.id && j.payload?.quelle?.retrievalPathId, "einzelauftrag");
  fordere(Array.isArray(s.laufend) && s.laufend.length === 1 && s.laufend[0].id === j.id, "andere-arbeit");
  fordere(r?.run_id === b.ziel.runId && r.process === "warteschlange-crawl"
    && r.status === "failed" && r.error_class === "warteschlange-nicht-verfuegbar"
    && r.location === "hetzner-de" && !r.reason
    && Number.isFinite(Date.parse(r.started_at)) && Number.isFinite(Date.parse(r.finished_at))
    && Date.parse(r.finished_at) >= Date.parse(r.started_at) && Date.parse(r.finished_at) < jetzt
    && r.started_at.slice(0, 10) === b.auftrag.tag, "letzter-lauf");
  fordere([r.target_count,r.processed_count,r.deferred_count,r.failed_count].every(ganz)
    && r.telemetrie?.wiederholt === 0 && r.telemetrie.leaseVerloren === 0
    && /^[a-f0-9]{40}$/.test(r.commit_ref || "")
    && Date.parse(j.updated_at) >= Date.parse(r.started_at) && Date.parse(j.updated_at) <= Date.parse(r.finished_at)
    && r.target_count === r.processed_count + r.deferred_count + r.failed_count + 1, "unbestaetigte-bilanz");
  fordere(s.zaehler?.length === 1 && s.zaehler[0].day === b.auftrag.tag
    && s.zaehler[0].scope === "global" && s.zaehler[0].used === 100
    && s.geld?.heutigeAbgerechneteAufrufe === 100 && s.geld.offeneHeute === 0
    && /^[a-f0-9]{64}$/.test(s.geld.buchHash), "kein-modellrecht");
  fordere(Array.isArray(s.ressourcen) && s.ressourcen.length <= 99
    && s.ressourcen.every(x => ganz(x.verbraucht))
    && new Set(s.ressourcen.map(x => x.schluessel)).size === s.ressourcen.length, "ressourcen");
  const konto = key => s.ressourcen.find(x => x.schluessel === "quellenarbeit|" + key)?.verbraucht;
  const slots = s.ressourcen.filter(x => x.schluessel.startsWith("quellenarbeit|slot|"));
  const n = konto("fenster");
  fordere(s.laeufe.every(x => ["success","partial","failed","timeout"].includes(x.status)
    && ["warteschlange-crawl","warteschlange-pipeline"].includes(x.process)
    && Number.isFinite(Date.parse(x.started_at)) && x.started_at.slice(0,10) === b.auftrag.tag
    && Number.isFinite(Date.parse(x.finished_at)) && Date.parse(x.finished_at) >= Date.parse(x.started_at)
    && Date.parse(x.finished_at) <= jetzt), "offene-laufquittung");
  fordere(ganz(n) && n > 0 && n < tagesbetrieb.MAX_FENSTER && slots.length === n
    && slots.every(x => x.verbraucht === 1) && s.ressourcen.length === slots.length + 3 && s.laeufe.length === n
    && new Set(s.laeufe.map(x => x.run_id)).size === n
    && konto("reservierte-sekunden") === n * 300
    && ganz(konto("originalabrufe")) && konto("originalabrufe") <= 16
    && !slots.some(x => x.schluessel === "quellenarbeit|slot|admin|" + b.auftrag.tag + "|" + b.auftrag.auftragId), "einmal-kontingent");
  fordere(b.codeHashes && DATEIEN.every(f => /^[a-f0-9]{64}$/.test(b.codeHashes[f] || "")), "codebindung");
}

async function vorschau({ auftrag, ziel }, { env = process.env, storage = require("./storage"), jetzt = Date.now } = {}) {
  fordere(admin.auftragGueltig(auftrag) && zielGueltig(ziel), "parameter");
  const start = jetzt(), tag = new Date(start).toISOString().slice(0, 10);
  fordere(auftrag.tag === tag, "tag");
  const worker = require("../../worker");
  fordere(!worker.konfigurationsfehler(env)
    && env.HELMUT_WORKER_SUPABASE_HOST === "ddckuvvpcytqbyfmbvie.supabase.co"
    && !await worker.pruefeProduktionsstand(env), "produktionskonfiguration");
  const c = budget.vertrag(env), g = require("./quellen-arbeitsfenster").grenzen(env);
  const request = storage.supabaseRequest;
  const [job, laufend, crawl, pipeline, ressourcen, zaehler, auth] = await Promise.all([
    request("/rest/v1/helmut_jobs?id=eq." + ziel.jobId + "&select=*&limit=2"),
    request("/rest/v1/helmut_jobs?status=eq.laeuft&select=id&limit=2"),
    request("/rest/v1/process_runs?process=eq.warteschlange-crawl&started_at=gte." + tag + "T00:00:00Z&select=*&order=started_at.desc&limit=97"),
    request("/rest/v1/process_runs?process=eq.warteschlange-pipeline&started_at=gte." + tag + "T00:00:00Z&select=*&order=started_at.desc&limit=97"),
    request("/rest/v1/helmut_anbieter_fenster?fensterart=eq.tag&fenster_start=eq." + tag + "T00:00:00Z&schluessel=like.quellenarbeit%7C*&select=schluessel,verbraucht&order=schluessel&limit=100"),
    request("/rest/v1/llm_budget_counters?day=eq." + tag + "&scope=eq.global&select=*&limit=2"),
    storage.readAuthStore({ strict: true, fields: [budget.KEY] })
  ]);
  fordere(Array.isArray(job) && job.length === 1 && Array.isArray(crawl) && Array.isArray(pipeline), "leseantwort");
  const book = auth[budget.KEY]; budget.pruefeBuch(book, c);
  const heute = Object.values(book.calls).filter(x => x.day === tag);
  const b = { version: 1, auftrag, ziel, gelesenAm: new Date(start).toISOString(),
    commit: env.HELMUT_COMMIT_SHA,
    limits: { aufrufe: storage.llmDailyCallLimit(), reserve: storage.llmUnderstandingReserve(),
      originale: g.gueltig ? g.originale : null, tagUsd: c.dailyLimitUsd, gesamtUsd: c.totalLimitUsd },
    codeHashes: Object.fromEntries(DATEIEN.map(f => [f, sha(fs.readFileSync(path.join(__dirname, "../..", f)))])),
    stand: { job: job[0], laufend, laeufe: [...crawl, ...pipeline].sort((a,b) => Date.parse(b.started_at)-Date.parse(a.started_at)),
      ressourcen, zaehler, geld: { buchHash: hash(book), gesamtbindung: book.bound, vertragHash: book.contractHash,
        heutigeAbgerechneteAufrufe: heute.filter(x => x.status === "abgerechnet").length,
        offeneHeute: heute.filter(x => !["abgerechnet","nicht-gesendet"].includes(x.status)).length } } };
  b.digest = digest(b);
  pruefeBindung(auftrag, b, jetzt());
  return b;
}
async function pruefeLive(auftrag, bindung, { lese = vorschau, jetzt = Date.now } = {}) {
  // Aufruf innerhalb der nativen worker-drain-Lease, vor jeder Mengenbuchung.
  pruefeBindung(auftrag, bindung, jetzt());
  const frisch = await lese({ auftrag, ziel: bindung.ziel });
  fordere(frisch.digest === bindung.digest, "vorwert-drift");
  pruefeBindung(auftrag, bindung, jetzt());
  return { bereit: true };
}
function ausgangBestaetigt(r) {
  // Ein Teilstand ist keine volle Betriebsabnahme. Originalantwort behalten und
  // bei jedem nicht voll bestaetigten Ausgang stoppen; keine CLI-Retryschleife.
  return r?.ok === true && r.lauftelemetrie?.start === true && r.lauftelemetrie?.ende === true
    && r.lauftelemetrie.status === "success" && !r.reason && !r.lauftelemetrie.fehlerklasse
    && r.verarbeitung?.blobSpiegel?.geschrieben !== false && !(r.verarbeitung?.blobSpiegel?.verworfen > 0);
}
module.exports = { vorschau, pruefeLive, pruefeBindung, pruefeStand, digest, ausgangBestaetigt };

if (require.main === module) {
  (async () => {
    const mode = process.argv[2];
    fordere(process.argv.length === 3 && ["--vorschau","--freigeben"].includes(mode), "modus");
    let text = "";
    for await (const part of process.stdin) { text += part; fordere(Buffer.byteLength(text) <= 1048576, "eingabe-zu-gross"); }
    const input = JSON.parse(text);
    if (mode === "--vorschau") {
      console.log(JSON.stringify(await vorschau(input))); return;
    }
    pruefeBindung(input.auftrag, input);
    const result = await require("../../worker").quellenlauf({ adminAuftrag: input.auftrag, bindung: input });
    const ergebnis = admin.ergebnis(input.auftrag, result);
    if (!ausgangBestaetigt(result) && ergebnis.ok) Object.assign(ergebnis,
      { ok: false, zustand: "unbekannt", grund: "wiederaufnahme-abschluss-nicht-bestaetigt" });
    console.log(JSON.stringify({ ergebnis, nativeAntwort: result }));
    if (!ausgangBestaetigt(result)) process.exitCode = 2;
  })().catch(e => { console.error(JSON.stringify({ status: "STOP", grund: /^wiederaufnahme-[a-z-]+$/.test(e.message) ? e.message : "wiederaufnahme-unbekannter-ausgang" })); process.exitCode = 2; });
}

