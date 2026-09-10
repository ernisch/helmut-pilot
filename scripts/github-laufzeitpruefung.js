#!/usr/bin/env node
"use strict";

// Nur nach unabhaengigem READY Beleg des erwarteten Production Commits starten.
// Die neue Route liegt VOR jedem Account-/Speicher-Vorlauf und liest nur Konfiguration.
const STATUS_URL = "https://helmut-pilot.vercel.app/api/cron/testnachweis-status";
const BOOLEAN_FELDER = Object.freeze([
  "storageSupabase", "v3Bereit", "profileRelational", "profileExclusive",
  "retentionGueltig", "kommunikationGesperrt", "kohortenQuellenGesperrt"
]);
const ZAHL_FELDER = Object.freeze(["retention", "tagesdeckel", "understandingReserve", "vorrangreserveReal"]);

async function pruefe({ env = process.env, fetchFn = global.fetch } = {}) {
  const bericht = { ok: false, reinLesend: true, grund: "nicht-geprueft", httpStatus: null };
  const erwartet = env.HELMUT_PRODUCTION_COMMIT || "";
  // Der Checkout muss genau der separat als READY bestaetigte Commit sein.
  if (!/^[a-f0-9]{40}$/.test(erwartet) || erwartet !== env.GITHUB_SHA) {
    return { ...bericht, grund: "bestaetigter-production-commit-fehlt-oder-weicht-ab" };
  }
  if (!env.HELMUT_CRON_SECRET) return { ...bericht, grund: "cron-secret-fehlt" };
  try {
    const response = await fetchFn(STATUS_URL, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json" }
    });
    bericht.httpStatus = Number.isInteger(response.status)
      && response.status >= 100 && response.status <= 599 ? response.status : null;
    if (response.status !== 200) return { ...bericht, grund: "statuszugang-nicht-bestaetigt" };
    const body = await response.json();
    if (!body || body.ok !== true || body.schemaVersion !== 1 || body.reinLesend !== true
        || body.production !== true || body.commit !== erwartet) {
      return { ...bericht, grund: "production-antwort-nicht-bestaetigt" };
    }
    if (BOOLEAN_FELDER.some((f) => typeof body[f] !== "boolean")
        || ZAHL_FELDER.some((f) => body[f] !== null && (!Number.isSafeInteger(body[f]) || body[f] < 0))) {
      return { ...bericht, grund: "konfigurationsantwort-ungueltig" };
    }
    return {
      ok: true, reinLesend: true, grund: "production-laufzeit-gelesen", httpStatus: 200, commit: erwartet,
      ...Object.fromEntries([...BOOLEAN_FELDER, ...ZAHL_FELDER].map((f) => [f, body[f]])),
      ...([1, 2].includes(body.textnachlaufVersion) ? { textnachlaufVersion: body.textnachlaufVersion } : {}),
      ...(body.textnachlaufArbeitsauswahlVersion === 1 ? { textnachlaufArbeitsauswahlVersion: 1 } : {}),
      ...(body.quellenkontext?.version === 1 && ["on", "off", "shadow"].includes(body.quellenkontext.scoring)
        && typeof body.quellenkontext.relevanzordnung === "boolean" && typeof body.quellenkontext.atomicLock === "boolean"
        && Number.isSafeInteger(body.quellenkontext.koScan) && Number.isSafeInteger(body.quellenkontext.lageMax)
        && Number.isFinite(body.quellenkontext.relevanzTage) && body.quellenkontext.relevanzTage > 0
        && typeof body.quellenkontext.sourceSafetyStandard === "boolean"
        ? { quellenkontext: Object.fromEntries(["version", "scoring", "relevanzordnung", "koScan", "lageMax", "relevanzTage", "sourceSafetyStandard", "atomicLock"]
          .map(k => [k, body.quellenkontext[k]])) } : {}),
      ...(body.testKosten?.version === 2 && typeof body.testKosten.aktiv === "boolean"
        && body.testKosten.limitUsd === 4 && body.testKosten.maxManualCalls === null
        && body.testKosten.maxWindowMs === null && body.testKosten.unbekanntBleibtReserviert === true
        ? { testKosten: { version: 2, aktiv: body.testKosten.aktiv, limitUsd: 4,
          maxManualCalls: null, maxWindowMs: null, unbekanntBleibtReserviert: true } } : {}),
      ...(body.testKosten?.version === 1 && typeof body.testKosten.aktiv === "boolean"
        && body.testKosten.limitUsd === 4 && body.testKosten.maxManualCalls === 1000
        ? { testKosten: { version: 1, aktiv: body.testKosten.aktiv, limitUsd: 4, maxManualCalls: 1000 } } : {}),
      scharferPfadFreigegeben: false
    };
  } catch {
    return { ...bericht, grund: "netz-oder-antwortfehler" };
  }
}

if (require.main === module) {
  if (process.argv.length !== 2) {
    console.error("Aufruffehler: Keine Argumente erlaubt.");
    process.exitCode = 2;
  } else pruefe().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.ok ? 0 : 1;
  }).catch(() => { console.error("Laufzeitpruefung fehlgeschlagen."); process.exitCode = 1; });
}
module.exports = { pruefe, STATUS_URL };
