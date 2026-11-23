"use strict";

const { isDeepStrictEqual } = require("node:util");
const fertigeAbrufe = new Set(["terminstand", "keine-funde", "rohfassungen"]);
const inFilter = werte => `in.(${werte.map(wert => '"' + wert.replace(/["\\]/g, "\\$&") + '"').join(",")})`;

async function morgenabrufe(plan, mandat, schnitt, request, storeId) {
  const F = require("./quellen-faelligkeit");
  const belege = F.speicher({ request, storeId });
  const faellige = plan.auftraege.filter(job => job.jobType === "source_fetch"
    && (job.tenantId == null || job.tenantId === mandat) && job.payload?.art !== "person-archiv");
  if (faellige.some(job => !Number.isFinite(Date.parse(job.dueAt)) || !job.payload?.quelle)) return "unbekannt";
  const schluessel = new Map(faellige.filter(job => Date.parse(job.dueAt) <= schnitt).map(job => [job.idempotencyKey, job]));
  if (!schluessel.size) return "unbekannt";

  const erledigteQuellen = new Map();
  for (const job of schluessel.values()) {
    const quelle = job.payload.quelle;
    if (typeof quelle.id !== "string" || !quelle.id) return "unbekannt";
    erledigteQuellen.set(quelle.id, true);
  }
  const markiereOffen = key => erledigteQuellen.set(schluessel.get(key).payload.quelle.id, false);
  const keys = [...schluessel.keys()];
  for (let start = 0; start < keys.length; start += 32) {
    const batch = keys.slice(start, start + 32);
    const rows = await request("/rest/v1/helmut_jobs?" + new URLSearchParams({
      job_type: "eq.source_fetch", idempotency_key: inFilter(batch),
      select: "id,idempotency_key,tenant_id,first_due_at,status,finished_at,payload"
    }));
    if (!Array.isArray(rows) || new Set(rows.map(row => row.idempotency_key)).size !== rows.length
      || rows.some(row => !batch.includes(row.idempotency_key))) return "unbekannt";
    const vorhanden = new Set(rows.map(row => row.idempotency_key));
    for (const key of batch) if (!vorhanden.has(key)) markiereOffen(key);
    const abgeschlossen = [];
    for (const row of rows) {
      const job = schluessel.get(row.idempotency_key);
      if ((row.tenant_id ?? null) !== (job.tenantId ?? null)
        || !isDeepStrictEqual(row.payload?.quelle, job.payload.quelle)
        || Date.parse(row.first_due_at) !== Date.parse(job.dueAt)) return "unbekannt";
      if (row.status !== "erledigt") {
        markiereOffen(row.idempotency_key);
        continue;
      }
      if (!Number.isFinite(Date.parse(row.finished_at))) return "unbekannt";
      abgeschlossen.push(row);
    }

    if (abgeschlossen.length === 0) continue;
    const ids = abgeschlossen.map(row => belege.id(row.id));
    const quittungen = await request("/rest/v1/helmut_store?" + new URLSearchParams({
      id: inFilter(ids), select: "id,data"
    }));
    if (!Array.isArray(quittungen) || new Set(quittungen.map(row => row.id)).size !== quittungen.length
      || quittungen.some(row => !ids.includes(row.id))) return "unbekannt";
    const jeAuftrag = new Map(quittungen.map(row => [row.id, row.data]));
    for (const row of abgeschlossen) {
      const beleg = jeAuftrag.get(belege.id(row.id));
      if (!beleg) {
        markiereOffen(row.idempotency_key);
        continue;
      }
      if (!F.belegGueltig(beleg, { id: row.id, tenantId: row.tenant_id ?? null,
        firstDueAt: row.first_due_at, payload: row.payload })) return "unbekannt";
      const bestaetigt = Date.parse(beleg.bestaetigtAm);
      if (bestaetigt > Date.parse(row.finished_at)) return "unbekannt";
      if (bestaetigt > schnitt || !fertigeAbrufe.has(beleg.ergebnis.art) || beleg.ergebnis.quellenkonflikt)
        markiereOffen(row.idempotency_key);
    }
  }
  const geplant = erledigteQuellen.size;
  const bestaetigt = [...erledigteQuellen.values()].filter(Boolean).length;
  return { geplant, bestaetigt };
}

// Rein lesende Betriebsbeobachtung, kein fachliches Vollversorgungsurteil.
// Nach aussen nur Zustaende und belegte Mengen fälliger Quellen des Mandats.
async function lese({ mandat, jetztMs = Date.now(), fenster = null, quellenBis = null, env = process.env, deps = {} } = {}) {
  if (!require("./quellen-arbeitsfenster").aktiv(env)) return null;
  let abrufabdeckung;
  const result = zustand => ({ version: 1, zustand, ...(abrufabdeckung ? { abrufabdeckung } : {}) });
  if (typeof mandat !== "string" || !mandat.trim() || !Number.isFinite(jetztMs)) return result("unbekannt");
  try {
    const S = require("./scalable-pipeline");
    const tageskern = S.skalierbarerPfadAktiv(env);
    const morgen = tageskern && quellenBis !== null;
    const kennung = mandat.trim();
    const request = deps.request || require("./storage").supabaseRequest;
    const storeId = env.HELMUT_SUPABASE_STORE_ID || "main";
    const journal = deps.planungsrest || require("./quellen-planungsrest").erzeugePlanungsrest({ request, storeId });
    const tag = new Date(jetztMs).toISOString().slice(0, 10);
    const plan = await journal.lesen(tag);
    if (!plan) return result("unbekannt");
    if (morgen) {
      const schnitt = require("./quellen-tagesbetrieb").zeiten(jetztMs)?.redaktionsschluss;
      if (quellenBis !== schnitt || jetztMs < schnitt) return result("unbekannt");
      // Das Manifest bindet die ursprüngliche Fälligkeit. Ein Retry darf einen
      // fälligen Abruf nicht aus dem Morgenfenster verschieben.
      const abrufe = await morgenabrufe(plan, kennung, schnitt, request, storeId);
      if (abrufe === "unbekannt") return result("unbekannt");
      abrufabdeckung = abrufe;
      if (abrufe.bestaetigt < abrufe.geplant) return result("offen");
    } else {
      if (plan.zustand !== "fertig") return result("offen");
      const gestern = new Date(Date.parse(tag) - 86400000).toISOString().slice(0, 10);
      const reste = await journal.offene({ bisTag: gestern, limit: 1 });
      if (!reste || !Array.isArray(reste.plaene) || typeof reste.weitereVorhanden !== "boolean") return result("unbekannt");
      if (reste.plaene.length || reste.weitereVorhanden) return result("offen");
    }
    const fensterListe = S.enthalteneFenster(fenster || tag + "T00Z", env);
    if (!fensterListe.length) return result("unbekannt");
    const stand = await (deps.offeneVorbedingungen || require("./storage").jobQueueOffeneVorbedingungen)({
      fenster: fensterListe, typen: morgen ? ["document_understanding", "mandate_projection"]
        : S.VORBEDINGUNGEN.briefing_materialization, mandat: kennung
    });
    if (stand?.verfuegbar !== true || !Number.isSafeInteger(stand.offen) || stand.offen < 0
      || !Number.isSafeInteger(stand.fehlgeschlagen) || stand.fehlgeschlagen < 0) return result("unbekannt");
    if (stand.offen > 0) return result("offen");
    // Ein abgeschlossener technischer Lauf kann fachliche Luecken behalten.
    // "offen" bleibt verbindlich fuer Paket-/Ruhepruefungen; nur die Erklaerung
    // unterscheidet wartende Arbeit von abgeschlossenen Einzelproblemen.
    if (stand.fehlgeschlagen > 0) return { ...result("offen"),
      ...(tageskern ? { verarbeitungBeendet: true } : {}) };
    if (morgen) return result("kein-bekannter-rueckstand");
    // Ein fertiger heutiger Plan kann ältere Abrufe und Artikelaufträge enthalten.
    const rest = await (deps.offeneVorbedingungen || require("./storage").jobQueueOffeneVorbedingungen)({
      fenster: null, typen: tageskern ? ["source_fetch", "document_understanding"] : ["document_understanding"], mandat: kennung
    });
    if (rest?.verfuegbar !== true || !Number.isSafeInteger(rest.offen) || rest.offen < 0) return result("unbekannt");
    // Historische terminale Fehler werden hier nicht als dauernde Tagesluecke
    // umgedeutet. Heutige Terminalfehler sind bereits oben enthalten.
    if (rest.offen > 0) return result("offen");
    if (tageskern) {
      const laeufe = await (deps.leseAbdeckung || require("./storage").listProcessRunsRelational)({
        process: "quellen-abdeckung", limit: 3
      });
      const belegt = Array.isArray(laeufe) && laeufe.find(r => r?.startedAt?.slice(0, 10) === tag);
      if (!belegt || belegt.status === "blocked" || !Number.isSafeInteger(belegt.ergebnisse?.fehlendePlanpositionen)
        || !Number.isSafeInteger(belegt.ergebnisse?.offeneAbrufbelege)) return result("unbekannt");
      if (belegt.ergebnisse.fehlendePlanpositionen || belegt.ergebnisse.offeneAbrufbelege) return result("offen");
    }
    return result("kein-bekannter-rueckstand");
  } catch { return result("unbekannt"); }
}
module.exports = { lese };
