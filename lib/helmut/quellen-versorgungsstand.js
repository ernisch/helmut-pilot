"use strict";

// Rein lesende Betriebsbeobachtung, kein fachliches Vollversorgungsurteil.
// Nach aussen nur drei Zustaende, keine fremden Mandate, Kennungen oder Zaehler.
async function lese({ mandat, jetztMs = Date.now(), fenster = null, env = process.env, deps = {} } = {}) {
  if (!require("./quellen-arbeitsfenster").aktiv(env)) return null;
  const result = zustand => ({ version: 1, zustand });
  if (typeof mandat !== "string" || !mandat.trim() || !Number.isFinite(jetztMs)) return result("unbekannt");
  try {
    const S = require("./scalable-pipeline");
    const journal = deps.planungsrest || require("./quellen-planungsrest").erzeugePlanungsrest({
      request: deps.request || require("./storage").supabaseRequest,
      storeId: env.HELMUT_SUPABASE_STORE_ID || "main"
    });
    const tag = new Date(jetztMs).toISOString().slice(0, 10);
    const plan = await journal.lesen(tag);
    if (!plan) return result("unbekannt");
    if (plan.zustand !== "fertig") return result("offen");
    const reste = await journal.offene({ bisTag: tag, limit: 7 });
    if (!reste || !Array.isArray(reste.plaene) || typeof reste.weitereVorhanden !== "boolean") return result("unbekannt");
    if (reste.plaene.length || reste.weitereVorhanden) return result("offen");
    const fensterListe = S.enthalteneFenster(fenster || tag + "T00Z", env);
    if (!fensterListe.length) return result("unbekannt");
    const stand = await (deps.offeneVorbedingungen || require("./storage").jobQueueOffeneVorbedingungen)({
      fenster: fensterListe, typen: S.VORBEDINGUNGEN.briefing_materialization, mandat: mandat.trim()
    });
    if (stand?.verfuegbar !== true || !Number.isSafeInteger(stand.offen) || stand.offen < 0
      || !Number.isSafeInteger(stand.fehlgeschlagen) || stand.fehlgeschlagen < 0) return result("unbekannt");
    if (stand.offen > 0 || stand.fehlgeschlagen > 0) return result("offen");
    // Ein idempotent wiedergefundener Understandingauftrag behaelt sein altes
    // Fenster, auch wenn derselbe Artikel heute erneut gefunden wurde. Fertige
    // Planjournale beweisen nur das Enqueue, nicht die Verarbeitung dieses Rests.
    const rest = await (deps.offeneVorbedingungen || require("./storage").jobQueueOffeneVorbedingungen)({
      fenster: null, typen: ["document_understanding"], mandat: mandat.trim()
    });
    if (rest?.verfuegbar !== true || !Number.isSafeInteger(rest.offen) || rest.offen < 0) return result("unbekannt");
    // Historische terminale Fehler werden hier nicht als dauernde Tagesluecke
    // umgedeutet. Heutige Terminalfehler sind bereits oben enthalten.
    return result(rest.offen > 0 ? "offen" : "kein-bekannter-rueckstand");
  } catch { return result("unbekannt"); }
}
module.exports = { lese };
