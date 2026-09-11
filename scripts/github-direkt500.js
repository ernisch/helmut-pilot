"use strict";

// Geschuetzter Adapter fuer den bestehenden Kohorten CLI. Anlage und
// Aktivierung benutzen provisioning.js, Facharbeit den bestehenden Cron.
const D = require("../lib/helmut/testkohorte-direkt500");
const { pruefe: leseKonfiguration } = require("./github-laufzeitpruefung");
const { kostenBefund, PROJECT_URL } = require("./github-fachzyklus-a");
const VORFLUG = require("../lib/helmut/speicherpfad-vorflug");
async function ausfuehren({ vorgang, scharf = false, env = process.env,
  fetchFn = global.fetch, now = () => new Date(),
  schreibe = null, fortschritt = null } = {}) {
  const vorpruefung = vorgang === "vorpruefung";
  const plan = vorpruefung ? { ziel: 500, vorgang, reinLesend: true } : D.plan(vorgang);
  if (!scharf && !vorpruefung) return { ...plan, modus: "trockenlauf", schreibversuche: 0, ok: false };
  let wiederherstellen = null;
  let fachlaufAusgeloest = false;
  let serverBefund = null;
  let pipelineBefund = null;
  let kosten = null;
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
    let kommunikationsHash = null;
    const startIso = now().toISOString();
    async function pruefeBetrieb(eigeneSperre = null) {
      config = await leseKonfiguration({ env, fetchFn });
      D.fordere(config.ok && config.storageSupabase && config.v3Bereit && config.profileRelational
        && config.profileExclusive && config.retentionGueltig && config.retention === 36
        && config.kommunikationGesperrt && config.kohortenQuellenGesperrt
        && config.tagesdeckel === 2416 && config.understandingReserve === 702
        && config.vorrangreserveReal >= 200, "production-konfiguration-abweichend");
      const jetzt = now();
      const iso = encodeURIComponent(jetzt.toISOString());
      const [locks, leases, verwaist, counters, auth, outbox] = await Promise.all([
        db("pipeline_locks?select=job_name&expires_at=gt." + iso
          + (eigeneSperre === "500-quellenkontext" ? "&job_name=neq.500-quellenkontext" : "") + "&limit=1"),
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
      D.fordere(kosten.aufrufbelege <= kosten.reservierungen,
        "kosten-nachweis-unvollstaendig");
      if (auth.testKostenTage?.[jetzt.toISOString().slice(0, 10)] && config.testKosten?.version === 2
        && config.testKosten.aktiv === true && config.testKosten.limitUsd === 4
        && config.testKosten.unbekanntBleibtReserviert === true) {
        try { Object.assign(kosten, require("../lib/helmut/testkosten-budget")
          // Auch eine ganz fehlende Nutzungszeile braucht eine volle Reserve.
          // Die Ticketdeckung muss den groesseren atomaren Zaehler abdecken.
          .kontrolliere(auth, jetzt.toISOString().slice(0, 10),
            kosten.unbekannteKosten + kosten.reservierungsluecke, kosten.reservierungen)); }
        catch { D.fordere(false, "kosten-ausgang-unklar"); }
      } else {
        D.fordere(kosten.reservierungsluecke === 0, "kosten-nachweis-unvollstaendig");
        D.fordere(!auth.testKostenTage?.[jetzt.toISOString().slice(0, 10)]?.frozen, "kosten-ausgang-unklar");
        D.fordere(kosten.unbekannteKosten === 0, "kosten-nachweis-unvollstaendig");
        D.fordere(kosten.prognoseUsd < 9, "kosten-sicherheitsstopp");
      }
      const spur = D.hash({ pushEvents: auth.pushEvents || [], auditEvents: auth.auditEvents || [] });
      D.fordere(outbox.length === 0 && (kommunikationsHash === null || kommunikationsHash === spur),
        "kommunikationsspur-veraendert");
      kommunikationsHash = spur;
    }
    await pruefeBetrieb();
    const bestand = await snapshot();
    const vollbestand = vorgang === "reaktivierung" || (bestand.mandate.length === 504
      && ["vorpruefung", "fachzyklus", "textnachlauf", "quellenkontext"].includes(vorgang));
    const snapshotModus = vollbestand ? "500-bestand" : "vorpruefung";
    const zielAnzahl = vollbestand ? 495 : 475;
    const vor = D.pruefeSnapshot(bestand, snapshotModus);
    // Der Betreiber verlangt den direkten Test ohne vorgelagerte A Abnahme.
    // Qualitaet wird am tatsaechlichen 500er Ergebnis bewertet, nie vorausgesetzt.
    if (vorpruefung) return { ...plan, ok: true, gesamt: vor.gesamt, aktiv: vor.aktiv,
      angelegteZielprofile: vor.vorhandene.length, aktiveZielprofile: vor.aktive.length,
      geschuetzterBestandHash: vor.geschuetzterBestandHash, kosten,
      aAbnahmeErforderlich: false, nachtfensterErforderlich: false,
      bereitZurAnlage: vor.aktive.length === 0,
      bereitZurAktivierung: vor.vorhandene.length === zielAnzahl,
      reaktivierung: vollbestand,
      bereitZumFachzyklus: vor.aktiv === 500,
      scharferSchrittFreigegeben: false, funktionsnachweis500: false };

    if (vorgang === "textnachlauf") {
      const T = require("../lib/helmut/testkohorte-textnachlauf");
      const arbeitsbeginn = T.pruefeArbeitsbeginn(env.HELMUT_TEXTNACHLAUF_AB_POSITION || 1);
      D.fordere(arbeitsbeginn === 1 || config.textnachlaufArbeitsauswahlVersion === 1,
        "textnachlauf-arbeitsauswahl-nicht-deployt");
      D.fordere(config.textnachlaufVersion === 2 && config.testKosten?.version === 2
        && config.testKosten.aktiv === true && config.testKosten.limitUsd === 4
        && config.testKosten.maxManualCalls === null && config.testKosten.maxWindowMs === null
        && config.testKosten.unbekanntBleibtReserviert === true, "textnachlauf-nicht-deployt");
      D.fordere(vor.gesamt === 504 && vor.aktiv === 500 && vor.aktive.length === zielAnzahl,
        "textnachlauf-braucht-500-aktive-profile");
      T.pruefeKosten(bestand.auth, kosten.reservierungen, now().toISOString().slice(0, 10));
      D.fordere(/^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID || "") && env.GITHUB_RUN_ATTEMPT === "1",
        "textnachlauf-keine-wiederholung");
      const hash = D.hash({ mandate: bestand.mandate, identitaeten: bestand.identitaeten, users: bestand.auth.users });
      const runId = "nachlauf500-" + env.GITHUB_RUN_ID;
      const kostenVorher = kosten;
      const day = require("../lib/helmut/briefing-frische").berlinTagKey(now());
      const ids = bestand.mandate.filter(m => m.aktiv).map(m => m.user_id).sort();
      const arbeitsIdsErlaubt = new Set(ids.slice(arbeitsbeginn - 1));
      const auswahlBestaetigt = b => (b?.arbeitsbeginn ?? 1) === arbeitsbeginn
        && Array.isArray(b?.results) && b.results.every(r => arbeitsIdsErlaubt.has(r?.userId)
          || (r?.gestartet === false && r?.gespeichert !== true && r?.lageVorhanden !== true
            && r?.grund === "ausserhalb-arbeitsauswahl"));
      async function leseTexte() {
        const rows = [];
        for (let i = 0; i < ids.length; i += 50) {
          const teil = ids.slice(i, i + 50);
          const result = await db("briefings?select=*&slot=eq.lage&user_id=in.("
            + encodeURIComponent(teil.map(id => JSON.stringify(id)).join(",")) + ")&id=like.*-lage-" + day + "&limit=51");
          D.fordere(result.length <= 50 && result.every(r => teil.includes(r.user_id)
            && r.id === `bf-${r.user_id}-lage-${day}`), "textnachlauf-textbestand-ungueltig");
          rows.push(...result);
        }
        D.fordere(new Set(rows.map(r => r.id)).size === rows.length, "textnachlauf-doppelte-texte");
        return rows;
      }
      const texteVorher = await leseTexte();
      fachlaufAusgeloest = true;
      const res = await fetchFn("https://helmut-pilot.vercel.app/api/cron/lage-briefing?nachlauf=fehlende-500", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(295000),
        headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json",
          "x-helmut-production-commit": env.GITHUB_SHA, "x-helmut-lauf": runId,
          "x-helmut-bestaetigung": T.CONFIRM,
          ...(arbeitsbeginn > 1 ? { "x-helmut-arbeitsbeginn": String(arbeitsbeginn) } : {}) }
      });
      D.fordere(res.status === 200, "textnachlauf-http-fehler");
      const b = await res.json();
      const gruende = ["ai-unavailable", "ai-cost-receipt-missing", "ai-response-incomplete",
        "ai-response-invalid-json", "ai-provider-unavailable", "ai-text-invalid",
        "ai-text-paragraph-count", "ai-text-empty", "ai-text-empty-or-type", "ai-text-source-reference",
        "ai-text-profile-reference", "ai-text-visible-id",
        "ai-text-word-limit", "ai-text-quality-incomplete", "ai-text-source-support",
        "ai-text-evidence-quote", "ai-text-repetition"]
        .map(g => "nachlauf-textfehler-" + g);
      const festeGruende = ["nachlauf-qualitaetsfehler", "nachlauf-zeitbudget",
        "nachlauf-endquittung-fehlt", "nachlauf-netz-speicher-oder-antwortfehler",
        "nachlauf-speicherfehler", "nachlauf-mandat-bereits-aktiv", "nachlauf-kostenstopp",
        "nachlauf-konfiguration-abweichend", "nachlauf-textfehler-unbekannt", ...gruende];
      // Eine fachlich gescheiterte HTTP-200-Antwort kann bereits Texte gespeichert
      // haben. Nur feste Diagnoseklassen und validierte Zaehler uebernehmen;
      // ohne unabhaengige Nachkontrolle bleibt der Zustand ausdruecklich unklar.
      if (b?.ok === false && b.schemaVersion === 1 && b.runId === runId
        && b.modus === "manuell-fehlende-texte" && b.ziel === 500
        && Number.isSafeInteger(b.gespeichert) && b.gespeichert >= 0 && b.gespeichert <= 500) {
        const grund = festeGruende.includes(b.grund)
          || /^nachlauf-textfehler-ai-provider-http-[45][0-9]{2}$/.test(b.grund || "")
          ? b.grund : "nachlauf-fehler-ohne-freigegebene-diagnose";
        serverBefund = { runId, grund, lautServerGespeichert: b.gespeichert,
          unabhaengigBestaetigt: false };
        // Auch bei verlorener DB-Endquittung vorhandene HTTP-Einzelbelege
        // erhalten. Dies sind ausdruecklich SERVERANGABEN, keine nachtraeglich
        // erfundene Abschlussquittung und keine Freigabe fuer Wiederholungen.
        if (auswahlBestaetigt(b) && Array.isArray(b.results) && b.results.length === 500
          && new Set(b.results.map(r => r?.userId)).size === 500
          && b.results.every(r => r && ids.includes(r.userId)
            && ["gestartet", "gespeichert", "lageVorhanden"].every(k => r[k] === undefined || typeof r[k] === "boolean"))
          && b.results.filter(r => r.gespeichert === true).length === b.gespeichert
          && b.funktionsnachweis500 === false) {
          const einzelGruende = new Set([...festeGruende, "vorhanden-geschuetzt", "zeitbudget", "ausserhalb-arbeitsauswahl",
            "nicht-erreicht-nach-abbruch", "existing-result", "no-current-sources", "no-vorgaenge"]);
          serverBefund.einzelbelege = b.results.map(r => ({
            mandatHash: D.hash(r.userId), gestartet: r.gestartet === true,
            lautServerLageGespeichert: r.gespeichert === true || r.lageVorhanden === true,
            grund: einzelGruende.has(r.grund) ? r.grund
              : r.grund == null && r.gespeichert === true ? "gespeichert" : "nicht-freigegebene-diagnose",
            diagnose: require("../lib/helmut/lage-textqualitaet").sichereDiagnose(r.diagnose)
          }));
        }
      }
      const qualitaetslauf = b?.ok === false && b.grund === "nachlauf-qualitaetsfehler"
        && Number.isSafeInteger(b.qualitaetsfehler) && b.qualitaetsfehler > 0 && b.qualitaetsfehler <= 500;
      const zeitlauf = b?.ok === false && b.grund === "nachlauf-zeitbudget"
        && Number.isSafeInteger(b.qualitaetsfehler) && b.qualitaetsfehler >= 0 && b.qualitaetsfehler < 500
        && Array.isArray(b.results) && b.results.filter(r => r.grund === "nachlauf-zeitbudget").length === 1;
      const festerFehlerlauf = b?.ok === false && festeGruende.includes(b.grund)
        && !["nachlauf-qualitaetsfehler", "nachlauf-zeitbudget", "nachlauf-endquittung-fehlt"].includes(b.grund)
        && Number.isSafeInteger(b.qualitaetsfehler) && b.qualitaetsfehler >= 0 && b.qualitaetsfehler < 500
        && Array.isArray(b.results) && b.results.filter(r => r.grund === b.grund).length === 1;
      D.fordere((b?.ok === true || qualitaetslauf || zeitlauf || festerFehlerlauf)
        && b.schemaVersion === 1 && b.runId === runId
        && auswahlBestaetigt(b)
        && b.modus === "manuell-fehlende-texte" && b.ziel === 500
        && Number.isSafeInteger(b.gespeichert) && b.gespeichert >= 0 && b.gespeichert <= 500
        && Array.isArray(b.results) && b.results.length === 500
        && new Set(b.results.map(r => r.userId)).size === 500
        && b.results.every(r => ids.includes(r.userId))
        && b.results.filter(r => r.gespeichert === true).length === b.gespeichert
        && b.funktionsnachweis500 === false, "textnachlauf-antwort-nicht-bestaetigt");
      const rows = await db("process_runs?select=run_id,status,reason,processed_count,failed_count,started_at,finished_at"
        + "&process=eq." + T.PROCESS + "&run_id=eq." + runId + "&limit=2");
      D.fordere(rows.length === 1 && rows[0].run_id === runId
        && rows[0].status === (qualitaetslauf || zeitlauf || festerFehlerlauf ? "failed" : "success")
        && (!(zeitlauf || festerFehlerlauf) || rows[0].reason === b.grund)
        && rows[0].failed_count === (zeitlauf || festerFehlerlauf
          ? b.qualitaetsfehler + 1 : qualitaetslauf ? b.qualitaetsfehler : 0)
        && rows[0].processed_count === b.gespeichert && Date.parse(rows[0].started_at) >= Date.parse(startIso)
        && Date.parse(rows[0].finished_at) >= Date.parse(rows[0].started_at)
        && Date.parse(rows[0].finished_at) <= now().getTime(), "textnachlauf-quittung-abweichend");
      await pruefeBetrieb();
      const nach = await snapshot();
      D.pruefeSnapshot(nach, snapshotModus);
      D.fordere(hash === D.hash({ mandate: nach.mandate, identitaeten: nach.identitaeten, users: nach.auth.users }),
        "textnachlauf-bestand-veraendert");
      T.pruefeKosten(nach.auth, kosten.reservierungen, now().toISOString().slice(0, 10));
      const texteNachher = await leseTexte();
      D.fordere(texteNachher.filter(r => !arbeitsIdsErlaubt.has(r.user_id)).every(r =>
        texteVorher.some(v => v.id === r.id && D.hash(v) === D.hash(r))),
      "textnachlauf-ausserhalb-arbeitsauswahl-veraendert");
      const Q = require("../lib/helmut/lage-quellenbeleg");
      D.fordere(texteVorher.every(r => texteNachher.some(n => n.id === r.id && Q.bestandErhalten(r, n))),
        "textnachlauf-hat-vorhandenen-text-veraendert");
      D.fordere(b.results.filter(r => r.gespeichert).every(r => (!texteVorher.some(v => v.user_id === r.userId)
          || (r.repariert === true && texteVorher.some(v => v.user_id === r.userId && !Q.gespeicherterTextGueltig(v.payload))))
        && texteNachher.some(n => n.user_id === r.userId && Date.parse(n.generated_at) >= Date.parse(startIso)
          && Date.parse(n.generated_at) === Date.parse(r.generatedAt) && n.payload?.paragraphs?.length > 0)),
      "textnachlauf-texte-nicht-gespeichert");
      return { ...plan, ...b, ausgeloest: true, zustandUnbekannt: false,
        ...(serverBefund ? { serverBefund: { ...serverBefund, unabhaengigBestaetigt: true } } : {}),
        kostenVorher, kostenNachher: kosten };
    }

    if (vorgang === "fachzyklus") {
      D.fordere(vor.gesamt === 504 && vor.aktiv === 500 && vor.aktive.length === zielAnzahl,
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
        && Number.isSafeInteger(v.wiederholt) && v.wiederholt >= 0
        && Number.isSafeInteger(v.verarbeitet)
        && v.verarbeitet === v.erledigt + v.wiederholt + v.endgueltigFehlgeschlagen
        && v.endgueltigFehlgeschlagen === 0 && b.weckVersand?.versendet === 0,
        "fachzyklus-kein-bestaetigter-fortschritt");
      const quittungen = await db("process_runs?select=run_id,process,status,started_at,finished_at,processed_count,failed_count"
        + "&run_id=eq." + encodeURIComponent(b.lauf.laufId) + "&process=eq.warteschlange-pipeline&limit=2");
      const q = quittungen[0];
      // Die Quittung speichert Abschluesse. `verarbeitet` in der Cronantwort
      // enthaelt zusaetzlich Wiederholungen und endgueltige Fehler.
      D.fordere(quittungen.length === 1 && q.run_id === b.lauf.laufId && q.status === "success"
        && q.processed_count === v.erledigt && q.processed_count > 0 && q.failed_count === 0
        && Date.parse(q.started_at) >= start.getTime() && Date.parse(q.finished_at) >= Date.parse(q.started_at)
        && Date.parse(q.finished_at) <= now().getTime(), "fachzyklus-laufquittung-fehlt-oder-abweichend");
      // Bereits gespeicherte Arbeit bleibt auch bei einem nachfolgenden
      // Kostenstopp belegt. Sie darf weder verschwinden noch erneut laufen.
      pipelineBefund = { laufId: q.run_id, fertiggestellteAuftraege: q.processed_count,
        unabhaengigBestaetigt: true };
      await pruefeBetrieb();
      const nach = await snapshot();
      D.pruefeSnapshot(nach, snapshotModus);
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
      HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt",
      ...(vorgang === "quellenkontext" ? { HELMUT_ATOMIC_LOCK: "1", HELMUT_ANBIETER_STEUERUNG: "on" } : {}) };
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
    if (vorgang === "quellenkontext") {
      D.fordere(env === process.env && !schreibe, "quellenkontext-braucht-echten-geprueften-adapter");
      D.fordere(vor.aktiv === 5 && vor.aktive.length === 0, "quellenkontext-nur-bei-geschlossener-kohorte");
      return await require("./github-quellenkontext-500").ausfuehren({ bestand, config, env: laufEnv,
        db, fetchFn, now, pruefeBetrieb, snapshot, fortschritt });
    }
    const writer = schreibe || (async ({ id, spec }) => {
      const P = require("../lib/helmut/provisioning");
      return vorgang === "provisionierung"
        ? P.provisionTenant(spec, {}, { neuAktiv: false, kontoBeiFehlerBehalten: true })
        : P.setTestProfileParticipation(id, true);
    });
    return await D.fuehreAus({ vorgang, env: laufEnv, grundlinieHash: vor.geschuetzterBestandHash,
      deps: { leseSnapshot: snapshot, pruefeBetrieb, schreibe: writer, jetzt: now, fortschritt,
        leseZiel: async (id) => {
          // Nur bekannte Zielkennungen; expliziter Mandatsfilter, kein Fallback.
          D.fordere((vorgang === "reaktivierung" ? D.ALLE_KENNUNGEN : D.KENNUNGEN).includes(id), "fremde-zielkennung");
          const rows = await db("mandate_profiles?select=user_id,aktiv,geloescht_at&user_id=eq."
            + encodeURIComponent(id) + "&limit=2");
          D.fordere(rows.length === 1, "zielantwort-nicht-eindeutig");
          return rows[0];
        }
      } });
  } catch (error) {
    return { ...plan, ok: false, schreibversuche: fachlaufAusgeloest ? 1 : 0, ausgeloest: fachlaufAusgeloest,
      zustandUnbekannt: fachlaufAusgeloest, funktionsnachweis500: false,
      ...(serverBefund ? { serverBefund } : {}),
      ...(pipelineBefund ? { pipelineBefund } : {}),
      ...(kosten ? { kostenStand: kosten } : {}),
      grund: error instanceof D.DirektAbbruch ? error.grund : "netz-speicher-oder-antwortfehler",
      automatischeWiederholung: false };
  } finally { if (wiederherstellen) wiederherstellen(); }
}

module.exports = { ausfuehren };
