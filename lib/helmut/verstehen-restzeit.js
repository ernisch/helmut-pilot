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
// ZWEI RESERVEN (Review-Korrektur 2026-08-20 abends — der `modellstart`-RPC ist selbst
// ein bis zu 10 s dauernder Supabase-Aufruf und war von der ersten Fassung nicht gedeckt):
//
//   KERNRESERVE `reserveMs` — alles AB dem externen KI-Aufruf:
//     1. Modellantwort   — der HTTP-Timeout des KI-Aufrufs (ai.js, Default 20 s),
//     2. Schreibrecht    — ein Storage-Client-Aufruf (Default 10 s),
//     3. Speicherung     — der atomare Speicher-RPC (Default 10 s),
//     4. Abschluss       — Vertragsabschluss/Verknüpfung/Telemetrie (pauschal 5 s).
//     Default 45 s. Sie ist die Grenze des GATES UNMITTELBAR VOR dem externen Aufruf
//     (nach dem Modellstart-Vermerk — dort ist noch belegbar nichts abgesendet, der
//     Rückweg `freigabeOhneAufruf` steht offen).
//
//   VOR-MODELLSTART-RESERVE `reserveVorModellstartMs` = Kernreserve + ein weiterer
//     Storage-Aufruf (der `modellstart`-RPC selbst, Default 10 s) = Default 55 s.
//     Sie ist die Grenze aller Prüfungen VOR dem Modellstart (Loop-Gates, Gate vor der
//     Reservierung, Gate vor dem Modellstart-Vermerk).
//
// Ändert der Betreiber einen der Timeouts per Env, wandern beide Reserven automatisch
// mit; `HELMUT_VERSTEHEN_RESTZEIT_RESERVE_MS` überschreibt die KERNRESERVE (die
// Vor-Modellstart-Reserve bleibt Override + ein Storage-Aufruf).

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
  // KI-Aufruf + Schreibrecht + Speicherung + Abschluss (siehe Kopf).
  return kiTimeoutMs(env) + 2 * speicherTimeoutMs(env) + ABSCHLUSS_RESERVE_MS;
}

// Reserve fuer alle Pruefungen VOR dem Modellstart-Vermerk: der `modellstart`-RPC ist
// selbst ein Storage-Aufruf und kommt zur Kernreserve hinzu.
function reserveVorModellstartMs(env = process.env) {
  return reserveMs(env) + speicherTimeoutMs(env);
}

// Die eine Entscheidung. `deadlineMs` ist ein ABSOLUTER Epoch-Zeitpunkt (das Ende des
// Zeitfensters, das der Aufrufer verantwortet), keine Dauer. 0/undefined = keine
// Deadline bekannt = erlaubt (Bestandsverhalten). `reserveMs` (optional) waehlt die
// zu pruefende Reserve — Default ist die Kernreserve; die Gates vor dem Modellstart
// uebergeben `reserveVorModellstartMs()`.
function restzeitEntscheidung({ deadlineMs, jetztMs, env = process.env, reserveMs: reserveVorgabe } = {}) {
  const reserve = Number.isFinite(Number(reserveVorgabe)) && Number(reserveVorgabe) >= 1
    ? Math.floor(Number(reserveVorgabe))
    : reserveMs(env);
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
  reserveVorModellstartMs,
  kiTimeoutMs,
  speicherTimeoutMs,
  MODELL_ANTWORT_RESERVE_MS,
  SPEICHER_RESERVE_MS,
  ABSCHLUSS_RESERVE_MS
};
