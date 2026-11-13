"use strict";

// Rein lesende Entscheidung. Keine Planung, Reservierung, Erstattung oder Quelle.
const TEXTE = Object.freeze({
  "automatik-aus": "Die automatische Quellenarbeit ist ausgeschaltet.",
  "automatik-erster-start": "Der erste automatische Quellenlauf steht heute noch aus.",
  "automatik-restarbeit": "Es ist noch Quellenarbeit offen. Die Automatik darf fortsetzen.",
  "automatik-erledigt": "Die Automatik hat keine offenen Arbeitsaufträge mehr. Sie startet nicht erneut. Fehlerfreie Ergebnisse sind damit nicht bestätigt.",
  "automatik-wartet": "Die Automatik wartet: Offene Aufträge sind noch nicht fällig oder noch gesperrt.",
  "automatik-startfehler": "Die Automatik hat nach einem Lauf- oder Startfehler angehalten. Bitte den letzten Lauf prüfen.",
  "automatik-unbekannt": "Die Automatik hält an: Der letzte Lauf oder die Restarbeit ist nicht sicher prüfbar."
});
function entscheidung(grund) {
  return { erlaubt: ["automatik-erster-start", "automatik-restarbeit"].includes(grund), grund, text: TEXTE[grund] };
}
const ganz = v => Number.isSafeInteger(v) && v >= 0;
function eineZeile(rows) {
  if (!Array.isArray(rows) || rows.length > 1 || rows.some(r => !r || typeof r.id !== "string" || !r.id)) throw Error("automatik-jobantwort");
  return rows.length === 1;
}

// Ein bestaetigter terminaler Einzeljobfehler darf andere Tagesarbeit nicht
// sperren. Nur eine vollstaendige Abschlussbilanz ist fortsetzbar; verlorene
// Leases, Transport-/Speicherfehler und unklare Ausgaenge bleiben gesperrt.
function einzelFehlerFortsetzbar(r) {
  const felder = ["zielmenge", "processed", "deferred", "fehlgeschlagen", "wiederholt", "leaseVerloren"];
  return r.status === "partial" && !r.reason
    && ["auftraege-endgueltig-fehlgeschlagen", "lease-ohne-fortschritt"].includes(r.fehlerklasse)
    && felder.every(k => ganz(r[k])) && r.fehlgeschlagen > 0 && r.leaseVerloren === 0
    && r.processed + r.deferred + r.fehlgeschlagen + r.wiederholt === r.zielmenge;
}

async function pruefe({ env = process.env, now = Date.now, deps = {} } = {}) {
  if (!require("./quellen-arbeitsfenster-aktiv").aktiv(env)) return entscheidung("automatik-aus");
  try {
    const zeit = now(), tag = new Date(zeit).toISOString().slice(0, 10), von = Date.parse(tag + "T00:00:00Z");
    const storage = require("./storage"), request = deps.request || storage.supabaseRequest;
    const journal = deps.journal || require("./quellen-planungsrest").erzeugePlanungsrest({
      request, storeId: env.HELMUT_SUPABASE_STORE_ID || "main"
    });
    const leseLaeufe = deps.leseLaeufe || storage.listProcessRunsRelational;
    const [crawl, pipeline, konten] = await Promise.all([
      leseLaeufe({ process: "warteschlange-crawl", limit: 9 }),
      leseLaeufe({ process: "warteschlange-pipeline", limit: 9 }),
      request("/rest/v1/helmut_anbieter_fenster?or=" + encodeURIComponent("(schluessel.eq.quellenarbeit|fenster,schluessel.like.quellenarbeit|slot|*)")
        + `&fensterart=eq.tag&fenster_start=eq.${encodeURIComponent(tag + "T00:00:00Z")}&select=schluessel,verbraucht&limit=18`)
    ]);
    if (!Array.isArray(crawl) || !Array.isArray(pipeline) || !Array.isArray(konten) || konten.length >= 18
        || konten.some(k => !ganz(k?.verbraucht) || k.verbraucht > 8 || typeof k.schluessel !== "string")
        || new Set(konten.map(k => k.schluessel)).size !== konten.length) throw Error("automatik-leseantwort");
    const fenster = konten.find(k => k.schluessel === "quellenarbeit|fenster")?.verbraucht || 0;
    const slots = konten.filter(k => k.schluessel.startsWith("quellenarbeit|slot|"));
    if (slots.some(k => k.verbraucht !== 1) || slots.length !== fenster) return entscheidung("automatik-unbekannt");
    const laeufe = [...crawl, ...pipeline];
    if (laeufe.some(r => !r || typeof r.runId !== "string" || !r.runId
        || !["warteschlange-crawl", "warteschlange-pipeline"].includes(r.process)
        || !Number.isFinite(Date.parse(r.startedAt)))) throw Error("automatik-quittung");
    const heute = laeufe.filter(r => Date.parse(r.startedAt) >= von && Date.parse(r.startedAt) <= zeit);
    // Fehlende Startquittung nach erfolgter Reservierung darf nicht wie ein neuer
    // erster Start aussehen. Ebenso wenig eine Teilreservierung oder ein Crash.
    if (new Set(heute.map(r => r.runId)).size !== heute.length
        || heute.length !== fenster) return entscheidung("automatik-unbekannt");
    const letzter = heute.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    if (letzter) {
      if (!["success", "partial", "failed", "timeout"].includes(letzter.status)
          || !Number.isFinite(Date.parse(letzter.finishedAt))
          || Date.parse(letzter.finishedAt) < Date.parse(letzter.startedAt)
          || Date.parse(letzter.finishedAt) > zeit) return entscheidung("automatik-unbekannt");
      // Ein normales Planungszeitlimit ist fortsetzbare Restarbeit. Ein echter
      // Fehler oder unbekannter Abschluss wird nicht automatisch wiederholt.
      const zeitrest = letzter.status === "partial" && letzter.reason === "planung-zeitbudget-fortsetzbar"
        && letzter.fehlerklasse === "planung-zeitbudget";
      if ((letzter.status !== "success" || letzter.fehlerklasse || letzter.reason)
          && !zeitrest && !einzelFehlerFortsetzbar(letzter))
        return entscheidung("automatik-startfehler");
    }
    // Derselbe Tagesvorrang wie setzePlanungFort: historische Manifeste sind
    // weder Pflichtvorarbeit noch Anlass fuer einen heutigen leeren Slot.
    const plan = await journal.lesen(tag);
    if (!plan) return entscheidung(letzter ? "automatik-unbekannt" : "automatik-erster-start");
    if (!Array.isArray(plan.auftraege) || !ganz(plan.cursor) || plan.cursor > plan.auftraege.length
        || plan.zustand !== (plan.cursor < plan.auftraege.length ? "offen" : "fertig")) throw Error("automatik-planstand");
    if (plan.zustand === "offen") return entscheidung("automatik-restarbeit");
    const zeitIso = new Date(zeit).toISOString();
    const morgen = new Date(von + 86400000).toISOString().slice(0, 10);
    // last_seen_window ist der monotone Tagesbezug wiedergefundener Versionen.
    // Ein heute beendeter historischer Fehler bleibt historisch, sofern er nicht
    // erneut beobachtet wurde. Schmale, begrenzte Jobleser statt Payloads.
    const aktuell = `or(and(last_seen_window.gte.${tag},last_seen_window.lt.${morgen}),and(last_seen_window.is.null,freshness_window.gte.${tag},freshness_window.lt.${morgen}))`;
    const worker = require("./worker-betrieb");
    const typen = worker.quellenmodusAus(env) ? worker.ALLE_TYPEN.filter(t => !worker.TYPEN_MIT_ABRUF.includes(t)) : worker.ALLE_TYPEN;
    const [offen, faellig, gescheitert] = await Promise.all([
      request("/rest/v1/helmut_jobs?select=id&status=in.(wartend,laeuft)&limit=1&and=" + encodeURIComponent(`(${aktuell})`)),
      request("/rest/v1/helmut_jobs?select=id,attempts,max_attempts&limit=101&job_type=in.(" + typen.join(",") + ")&and=" + encodeURIComponent(
        `(${aktuell},or(and(status.eq.wartend,due_at.lte.${zeitIso}),and(status.eq.laeuft,lease_expires_at.lt.${zeitIso},due_at.lte.${zeitIso})))`)),
      request("/rest/v1/helmut_jobs?select=id&status=eq.fehlgeschlagen&limit=1&and=" + encodeURIComponent(`(${aktuell})`))
    ]);
    const hatOffene = eineZeile(offen);
    const hatFehler = eineZeile(gescheitert);
    if (!Array.isArray(faellig) || faellig.length > 101 || faellig.some(r => !r?.id || !ganz(r.attempts)
        || !Number.isSafeInteger(r.max_attempts) || r.max_attempts <= 0)) throw Error("automatik-claimantwort");
    const hatFaellige = faellig.some(r => r.attempts < r.max_attempts);
    if (!hatFaellige && faellig.length === 101) throw Error("automatik-claimmenge-unbekannt");
    if (hatFaellige && !hatOffene) throw Error("automatik-widerspruch");
    return entscheidung(hatFaellige ? "automatik-restarbeit" : hatFehler ? "automatik-startfehler"
      : hatOffene ? "automatik-wartet" : "automatik-erledigt");
  } catch (_) { return entscheidung("automatik-unbekannt"); }
}

module.exports = { pruefe, entscheidung };
