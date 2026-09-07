"use strict";

// Geschuetzter Adapter fuer den bestehenden Kohorten CLI. Anlage und
// Aktivierung benutzen provisioning.js, Facharbeit den bestehenden Cron.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const D = require("../lib/helmut/testkohorte-direkt500");
const { pruefe: leseKonfiguration } = require("./github-laufzeitpruefung");
const { kostenBefund, PROJECT_URL } = require("./github-fachzyklus-a");
const VORFLUG = require("../lib/helmut/speicherpfad-vorflug");
const F = require("../lib/helmut/funktionstest-500");
const CRONS = require("../vercel.json").crons;
const ROOT = path.join(__dirname, "..");
const ABNAHME_DATEI = "belege/500/abnahme-a.json";

function ladeAbnahme() {
  let a;
  try { a = JSON.parse(fs.readFileSync(path.join(ROOT, ABNAHME_DATEI), "utf8")); }
  catch { throw new D.DirektAbbruch("a-abnahmedatei-fehlt-oder-ungueltig"); }
  for (const q of Array.isArray(a.qualitaet) ? a.qualitaet : []) {
    D.fordere(typeof q.beleg === "string" && /^belege\/[a-zA-Z0-9_./-]+\.(json|md)$/.test(q.beleg)
      && !q.beleg.includes(".."), "qualitaetsbeleg-pfad-ungueltig");
    const datei = path.join(ROOT, q.beleg);
    D.fordere(fs.realpathSync(datei).startsWith(path.join(ROOT, "belege") + path.sep)
      && fs.statSync(datei).size > 0, "qualitaetsbeleg-nicht-vorhanden");
  }
  D.fordere(/^[a-f0-9]{40}$/.test(a.productionCommit || ""), "a-abnahme-commit-fehlt");
  try { execFileSync("git", ["merge-base", "--is-ancestor", a.productionCommit, "HEAD"],
    { cwd: ROOT, stdio: "ignore" }); }
  catch { throw new D.DirektAbbruch("a-abnahme-commit-nicht-in-main"); }
  return a;
}

async function ausfuehren({ vorgang, scharf = false, env = process.env,
  fetchFn = global.fetch, now = () => new Date(), ladeBeleg = ladeAbnahme,
  schreibe = null, fortschritt = null } = {}) {
  const vorpruefung = vorgang === "vorpruefung";
  const plan = vorpruefung ? { ziel: 500, vorgang, reinLesend: true } : D.plan(vorgang);
  if (!scharf && !vorpruefung) return { ...plan, modus: "trockenlauf", schreibversuche: 0, ok: false };
  let wiederherstellen = null;
  let fachlaufAusgeloest = false;
  try {
    D.fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === "refs/heads/main"
      && env.GITHUB_EVENT_NAME === "workflow_dispatch", "nur-manuell-auf-main");
    D.fordere(env.HELMUT_PRODUCTION_COMMIT === env.GITHUB_SHA
      && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || ""), "production-commit-nicht-bestaetigt");
    D.fordere(String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL
      && env.SUPABASE_SERVICE_ROLE_KEY && env.HELMUT_CRON_SECRET, "production-zugang-fehlt");
    if (!vorpruefung) {
      D.fordere(env.HELMUT_TESTKOHORTE_EXECUTE === "1"
        && env.HELMUT_TESTKOHORTE_CONFIRM === D.WORTE[vorgang], "direktfreigabe-fehlt");
      D.pruefeZeit(now());
      const fenster = F.pruefeStartfenster({ startUtc: "2026-01-01T21:36:00Z",
        dauerMinuten: 383, crons: CRONS, watchdogBeruecksichtigen: true });
      D.fordere(fenster.startErlaubt === true && fenster.gepruefteCrons > 0,
        "aktueller-cronplan-kollidiert-mit-direktausbau");
    }
    async function db(pfad) {
      const res = await fetchFn(PROJECT_URL + "/rest/v1/" + pfad, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" }
      });
      D.fordere(res.status === 200, "datenbankabruf-fehlgeschlagen");
      const body = await res.json();
      D.fordere(Array.isArray(body), "datenbankantwort-ungueltig");
      return body;
    }
    async function speicher(id) {
      const rows = await db("helmut_store?select=data&id=eq." + id + "&limit=2");
      D.fordere(rows.length === 1 && rows[0].data && typeof rows[0].data === "object",
        "speicherantwort-nicht-eindeutig");
      return rows[0].data;
    }
    async function snapshot() {
      const [mandate, identitaeten, auth, main] = await Promise.all([
        db("mandate_profiles?select=*&order=user_id.asc&limit=505"),
        db("profiles?select=*&order=id.asc&limit=506"), speicher("main-auth"), speicher("main")
      ]);
      D.fordere(mandate.length <= 504 && identitaeten.length <= 505, "bestand-zu-gross-oder-gekuerzt");
      return { mandate, identitaeten, auth, main };
    }
    let config;
    let kosten;
    let kommunikationsHash = null;
    const startIso = now().toISOString();
    async function pruefeBetrieb() {
      config = await leseKonfiguration({ env, fetchFn });
      D.fordere(config.ok && config.storageSupabase && config.v3Bereit && config.profileRelational
        && config.profileExclusive && config.retentionGueltig && config.retention === 36
        && config.kommunikationGesperrt && config.kohortenQuellenGesperrt
        && config.tagesdeckel === 2416 && config.understandingReserve === 702
        && config.vorrangreserveReal >= 200, "production-konfiguration-abweichend");
      const jetzt = now();
      const iso = encodeURIComponent(jetzt.toISOString());
      const [locks, leases, verwaist, counters, auth, outbox] = await Promise.all([
        db("pipeline_locks?select=job_name&expires_at=gt." + iso + "&limit=1"),
        db("helmut_jobs?select=id&lease_expires_at=gt." + iso + "&limit=1"),
        db("helmut_jobs?select=id&status=eq.laeuft&or=(lease_expires_at.is.null,lease_expires_at.lt."
          + iso + ")&limit=1"),
        db("llm_budget_counters?select=used&scope=eq.global&day=eq." + jetzt.toISOString().slice(0, 10) + "&limit=2"),
        speicher("main-auth"),
        db("helmut_job_outbox?select=id&confirmed_at=gte." + encodeURIComponent(startIso) + "&limit=1")
      ]);
      D.fordere(locks.length + leases.length + verwaist.length === 0, "aktive-oder-verwaiste-lease");
      D.fordere(counters.length <= 1, "tageszaehler-nicht-eindeutig");
      kosten = kostenBefund(auth, counters.length ? counters[0].used : 0, jetzt.toISOString().slice(0, 10));
      D.fordere(kosten.prognoseUsd < 9, "kosten-sicherheitsstopp");
      const spur = D.hash({ pushEvents: auth.pushEvents || [], auditEvents: auth.auditEvents || [] });
      D.fordere(outbox.length === 0 && (kommunikationsHash === null || kommunikationsHash === spur),
        "kommunikationsspur-veraendert");
      kommunikationsHash = spur;
    }
    await pruefeBetrieb();
    const bestand = await snapshot();
    const vor = D.pruefeSnapshot(bestand, "vorpruefung");
    let abnahme;
    let abnahmeFehler = null;
    try {
      abnahme = ladeBeleg();
      D.pruefeAbnahmeA(abnahme, now());
      D.fordere(abnahme.geschuetzterBestandHash === vor.geschuetzterBestandHash,
        "a-abnahme-passt-nicht-zum-bestand");
      const ids = abnahme.auftraege.map((j) => j.id);
      D.fordere(ids.every((id) => /^[a-zA-Z0-9_-]+$/.test(id)), "a-auftragskennung-ungueltig");
      const jobs = await db("helmut_jobs?select=id,tenant_id,job_type,status,freshness_window,finished_at"
        + "&id=in.(" + ids.join(",") + ")&limit=61");
      D.fordere(jobs.length === 60 && jobs.every((j) => {
        const b = abnahme.auftraege.find((r) => r.id === j.id);
        return b && j.status === "erledigt" && b.tenant_id === j.tenant_id && b.job_type === j.job_type
          && b.freshness_window === j.freshness_window
          && Date.parse(b.finished_at) === Date.parse(j.finished_at);
      }), "a-auftragsbeleg-nicht-mehr-gueltig");
      const counter = await db("llm_budget_counters?select=used&scope=eq.global&day=eq."
        + abnahme.budgetTag + "&limit=2");
      D.fordere(counter.length === 1 && counter[0].used >= abnahme.reservierungen,
        "a-budgetbeleg-nicht-bestaetigt");
    } catch (error) { abnahmeFehler = error instanceof D.DirektAbbruch ? error.grund : "a-beleg-nicht-lesbar"; }
    if (vorpruefung) return { ...plan, ok: true, gesamt: vor.gesamt, aktiv: vor.aktiv,
      angelegteZielprofile: vor.vorhandene.length, aktiveZielprofile: vor.aktive.length,
      geschuetzterBestandHash: vor.geschuetzterBestandHash, kosten,
      aAbnahmeBestaetigt: !abnahmeFehler, offeneAbnahme: abnahmeFehler,
      bereitZurAnlage: !abnahmeFehler && vor.aktive.length === 0,
      bereitZurAktivierung: !abnahmeFehler && vor.vorhandene.length === 475,
      bereitZumFachzyklus: !abnahmeFehler && vor.aktiv === 500,
      scharferSchrittFreigegeben: false };
    D.fordere(!abnahmeFehler, abnahmeFehler);

    if (vorgang === "fachzyklus") {
      D.fordere(vor.gesamt === 504 && vor.aktiv === 500 && vor.aktive.length === 475,
        "fachzyklus-braucht-500-aktive-profile");
      // Eine Runde muss vollstaendig in dasselbe Kostenfenster passen.
      const start = now();
      const ende = new Date(start.getTime() + 6 * 60000);
      D.pruefeZeit(ende);
      D.fordere(start.toISOString().slice(0, 10) === ende.toISOString().slice(0, 10),
        "fachzyklus-wuerde-utc-tag-wechseln");
      const profilHash = D.hash({ mandate: bestand.mandate, identitaeten: bestand.identitaeten,
        users: bestand.auth.users });
      const kostenVorher = kosten;
      fachlaufAusgeloest = true;
      const res = await fetchFn("https://helmut-pilot.vercel.app/api/cron/pipeline", {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(295000),
        headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json" }
      });
      D.fordere(res.status === 200, "fachzyklus-http-fehler");
      const b = await res.json();
      const v = b?.verarbeitung;
      D.fordere(b?.ok === true && b.pfad === "warteschlange" && b.tenants === 500
        && /^cron-pipeline-[a-zA-Z0-9-]+$/.test(b.lauf?.laufId || "")
        && b.lauftelemetrie?.start === true && b.lauftelemetrie?.ende === true
        && b.lauftelemetrie?.status === "success" && Number.isSafeInteger(v?.erledigt) && v.erledigt > 0
        && v.endgueltigFehlgeschlagen === 0 && b.weckVersand?.versendet === 0,
        "fachzyklus-kein-bestaetigter-fortschritt");
      const quittungen = await db("process_runs?select=run_id,process,status,started_at,finished_at,processed_count,failed_count"
        + "&run_id=eq." + encodeURIComponent(b.lauf.laufId) + "&process=eq.warteschlange-pipeline&limit=2");
      const q = quittungen[0];
      D.fordere(quittungen.length === 1 && q.run_id === b.lauf.laufId && q.status === "success"
        && q.processed_count === v.verarbeitet && q.processed_count > 0 && q.failed_count === 0
        && Date.parse(q.started_at) >= start.getTime() && Date.parse(q.finished_at) >= Date.parse(q.started_at)
        && Date.parse(q.finished_at) <= now().getTime(), "fachzyklus-laufquittung-fehlt-oder-abweichend");
      await pruefeBetrieb();
      const nach = await snapshot();
      D.pruefeSnapshot(nach, "aktivierung");
      D.fordere(profilHash === D.hash({ mandate: nach.mandate, identitaeten: nach.identitaeten,
        users: nach.auth.users }), "fachzyklus-hat-profilbestand-veraendert");
      return { ...plan, ok: true, ausgeloest: true, laufId: q.run_id, verarbeitet: q.processed_count,
        fertiggestellteAuftraege: v.erledigt, kostenVorher, kostenNachher: kosten,
        funktionsnachweis500: false,
        offen: "Gesamtabdeckung, Quellenqualitaet und faire Fortsetzung fuer alle 500 gesondert abnehmen" };
    }

    // Nur diesen Ausfuehrungsprozess an die frisch gelesene Production
    // Speicherwahl binden. Keine Vercel Variable, kein Secret wird veraendert.
    const gebunden = { HELMUT_STORAGE_BACKEND: "supabase", HELMUT_V3_STORE: "1",
      HELMUT_PROFILE_DB_MODE: "1", HELMUT_PROFILE_DB_EXCLUSIVE: "1",
      HELMUT_CRAWL_RUN_RETENTION: String(config.retention),
      HELMUT_MAX_LLM_CALLS_PER_DAY: String(config.tagesdeckel),
      HELMUT_LLM_RESERVE_UNDERSTANDING: String(config.understandingReserve),
      HELMUT_TESTLAUF_VORRANG_REAL: String(config.vorrangreserveReal),
      HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" };
    const laufEnv = { ...env, ...gebunden };
    VORFLUG.erzwingeSpeicherpfadOderWirf({ env: laufEnv, zweck: "Direkter Ausbau auf 500" });
    if (!schreibe) {
      D.fordere(env === process.env, "echter-schreibpfad-braucht-prozessumgebung");
      const alt = Object.fromEntries(Object.keys(gebunden).map((k) => [k, process.env[k]]));
      Object.assign(process.env, gebunden);
      wiederherstellen = () => {
        for (const [k, v] of Object.entries(alt)) {
          if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
      };
    }
    const writer = schreibe || (async ({ id, spec }) => {
      const P = require("../lib/helmut/provisioning");
      return vorgang === "provisionierung"
        ? P.provisionTenant(spec, {}, { neuAktiv: false, kontoBeiFehlerBehalten: true })
        : P.activateTenant(id);
    });
    return await D.fuehreAus({ vorgang, env: laufEnv, abnahmeA: abnahme,
      deps: { leseSnapshot: snapshot, pruefeBetrieb, schreibe: writer, jetzt: now, fortschritt,
        leseZiel: async (id) => {
          // Nur bekannte Zielkennungen; expliziter Mandatsfilter, kein Fallback.
          D.fordere(D.KENNUNGEN.includes(id), "fremde-zielkennung");
          const rows = await db("mandate_profiles?select=user_id,aktiv,geloescht_at&user_id=eq."
            + encodeURIComponent(id) + "&limit=2");
          D.fordere(rows.length === 1, "zielantwort-nicht-eindeutig");
          return rows[0];
        }
      } });
  } catch (error) {
    return { ...plan, ok: false, schreibversuche: 0, ausgeloest: fachlaufAusgeloest,
      zustandUnbekannt: fachlaufAusgeloest, funktionsnachweis500: false,
      grund: error instanceof D.DirektAbbruch ? error.grund : "netz-speicher-oder-antwortfehler",
      automatischeWiederholung: false };
  } finally { if (wiederherstellen) wiederherstellen(); }
}

module.exports = { ausfuehren, ladeAbnahme, ABNAHME_DATEI };
