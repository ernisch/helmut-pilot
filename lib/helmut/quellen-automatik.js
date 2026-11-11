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
      if ((letzter.status !== "success" || letzter.fehlerklasse || letzter.reason) && !zeitrest)
        return entscheidung("automatik-startfehler");
    }
    const gescheitert = await request("/rest/v1/helmut_jobs?select=id&status=eq.fehlgeschlagen"
      + `&finished_at=gte.${encodeURIComponent(tag + "T00:00:00Z")}&finished_at=lte.${encodeURIComponent(new Date(zeit).toISOString())}&limit=1`);
    if (eineZeile(gescheitert)) return entscheidung("automatik-startfehler");
    const [plan, alt] = await Promise.all([journal.lesen(tag), journal.offene({ bisTag: tag, limit: 1 })]);
    if (!alt || !Array.isArray(alt.plaene) || typeof alt.weitereVorhanden !== "boolean") throw Error("automatik-planantwort");
    if (alt.plaene.length || alt.weitereVorhanden) return entscheidung("automatik-restarbeit");
    if (!plan) return entscheidung(letzter ? "automatik-unbekannt" : "automatik-erster-start");
    if (plan.zustand !== "fertig" || plan.cursor !== plan.auftraege.length) throw Error("automatik-planstand");
    const zeitIso = new Date(zeit).toISOString();
    const worker = require("./worker-betrieb");
    const typen = worker.quellenmodusAus(env) ? worker.ALLE_TYPEN.filter(t => !worker.TYPEN_MIT_ABRUF.includes(t)) : worker.ALLE_TYPEN;
    const [offen, faellig] = await Promise.all([
      request("/rest/v1/helmut_jobs?select=id&status=in.(wartend,laeuft)&limit=1"),
      request("/rest/v1/helmut_jobs?select=id,attempts,max_attempts&limit=101&job_type=in.(" + typen.join(",") + ")&or=" + encodeURIComponent(
        `(and(status.eq.wartend,due_at.lte.${zeitIso}),and(status.eq.laeuft,lease_expires_at.lt.${zeitIso},due_at.lte.${zeitIso}))`))
    ]);
    const hatOffene = eineZeile(offen);
    if (!Array.isArray(faellig) || faellig.length > 101 || faellig.some(r => !r?.id || !ganz(r.attempts)
        || !Number.isSafeInteger(r.max_attempts) || r.max_attempts <= 0)) throw Error("automatik-claimantwort");
    const hatFaellige = faellig.some(r => r.attempts < r.max_attempts);
    if (!hatFaellige && faellig.length === 101) throw Error("automatik-claimmenge-unbekannt");
    if (hatFaellige && !hatOffene) throw Error("automatik-widerspruch");
    return entscheidung(hatFaellige ? "automatik-restarbeit" : hatOffene ? "automatik-wartet" : "automatik-erledigt");
  } catch (_) { return entscheidung("automatik-unbekannt"); }
}

module.exports = { pruefe, entscheidung };
