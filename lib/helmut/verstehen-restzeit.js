"use strict";

// Helmut — ZENTRALE RESTZEITENTSCHEIDUNG vor jedem bezahlten Verstehens-Modellaufruf.
// =====================================================================================
// ANLASS (Reparatursprint 2026-08-20, Runbook §29): Der Verstehens-Loop kannte nur ein
// RELATIVES Zeitbudget ab Loop-Start und prüfte es ausschließlich VOR jedem Cluster.
// Ein bei Budget−ε gestarteter Cluster führte seinen kompletten Modellaufruf (~20 s)
// plus Speicherung (~10 s) noch aus — und konnte damit in das äußere Funktionsende
// (Vercel maxDuration 300 s bzw. die 280-s-Antwortgrenze) laufen. Wird die Function
// dort eingefroren oder beendet, läuft kein `finally` mehr: die Vorgangszeile bleibt
// als `modell-laeuft` mit ablaufender Lease stehen (Production-belegt: `25c6c69d`
// 19.08. 10:05 UTC, `df1a6700` 20.08. 10:06 UTC — beide aus dem 10:00-Lage-Check).
//
// DIE EINE REGEL: Ein neuer Modellaufruf beginnt nur, wenn bis zur ABSOLUTEN Deadline
// des Aufrufers noch genügend Zeit für Modellantwort + Speicherung + Abschluss bleibt.
// Reicht die Zeit nicht, wird der Vorgang ehrlich zurückgestellt — ohne Reservierung,
// ohne Lease, ohne Budgetverbrauch, ohne Versuchszählung; er bleibt Nachholkandidat.
//
// OHNE Deadline (Aufrufer ohne Zeitfenster, z. B. Nachhollauf/Debug) ist die
// Entscheidung IMMER „erlaubt" — Bestandsverhalten byte-identisch.
//
// Die Reserve setzt sich aus den realen Obergrenzen der drei Schritte zusammen:
//   1. Modellantwort  — der HTTP-Timeout des KI-Aufrufs (ai.js, Default 20 s),
//   2. Speicherung    — der Storage-Client-Timeout eines Supabase-Calls (Default 10 s),
//   3. Abschluss      — Vertragsabschluss/Verknüpfung/Telemetrie (pauschal 5 s).
// Ändert der Betreiber einen der Timeouts per Env, wandert die Reserve automatisch mit.

const MODELL_ANTWORT_RESERVE_MS = 20000; // Default des KI-HTTP-Timeouts (ai.js)
const SPEICHER_RESERVE_MS = 10000;       // Default von HELMUT_SUPABASE_TIMEOUT_MS (storage.js)
const ABSCHLUSS_RESERVE_MS = 5000;       // Abschlussschreiben nach der Persistenz

// Der KI-HTTP-Timeout ist hier zentral definiert, damit ai.js (der Aufruf) und die
// Reserve (die Entscheidung) nie auseinanderlaufen können. Vorher war der Wert ein
// Literal in ai.js; der Default bleibt unverändert 20 000 ms.
function kiTimeoutMs(env = process.env) {
  const n = Number(env && env.HELMUT_KI_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : MODELL_ANTWORT_RESERVE_MS;
}

function speicherTimeoutMs(env = process.env) {
  const n = Number(env && env.HELMUT_SUPABASE_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : SPEICHER_RESERVE_MS;
}

function reserveMs(env = process.env) {
  const explizit = Number(env && env.HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS);
  if (Number.isFinite(explizit) && explizit >= 1000) return Math.floor(explizit);
  return kiTimeoutMs(env) + speicherTimeoutMs(env) + ABSCHLUSS_RESERVE_MS;
}

// Die eine Entscheidung. `deadlineMs` ist ein ABSOLUTER Epoch-Zeitpunkt (das Ende des
// Zeitfensters, das der Aufrufer verantwortet), keine Dauer. 0/undefined = keine
// Deadline bekannt = erlaubt (Bestandsverhalten).
function restzeitEntscheidung({ deadlineMs, jetztMs, env = process.env } = {}) {
  const reserve = reserveMs(env);
  const deadline = Number(deadlineMs);
  if (!Number.isFinite(deadline) || deadline <= 0) {
    return { erlaubt: true, grund: "keine-deadline", restMs: null, reserveMs: reserve };
  }
  const jetzt = Number.isFinite(Number(jetztMs)) && Number(jetztMs) > 0 ? Number(jetztMs) : Date.now();
  const rest = deadline - jetzt;
  if (rest >= reserve) {
    return { erlaubt: true, grund: null, restMs: rest, reserveMs: reserve };
  }
  return { erlaubt: false, grund: "restzeit-unter-reserve", restMs: rest, reserveMs: reserve };
}

module.exports = {
  restzeitEntscheidung,
  reserveMs,
  kiTimeoutMs,
  speicherTimeoutMs,
  MODELL_ANTWORT_RESERVE_MS,
  SPEICHER_RESERVE_MS,
  ABSCHLUSS_RESERVE_MS
};
