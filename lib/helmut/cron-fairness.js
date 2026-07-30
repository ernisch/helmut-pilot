"use strict";

// Helmut Core — Fairness der Mandantenreihenfolge in Mehrmandanten-Crons (OP-25).
// =============================================================================================
// BEFUND (belegt, 2026-07-24 und erneut 2026-07-29): `runCronForTenants` verarbeitete die
// aktiven Mandate SERIELL in ALPHABETISCH fester Reihenfolge (`tenant-context.listActiveTenantIds`
// endet auf `ids.sort()`) gegen eine HARTE Laufzeitgrenze. Wer hinten stand, fiel bei knapper
// Laufzeit aus — und zwar IMMER derselbe. Am 2026-07-24 wurden vier von sechs aktiven Mandaten
// über Tage nie gecrawlt; am 2026-07-29 erreichte der 16:00-Lauf genau EINEN von sieben
// Mandaten bis zur Matching-Stufe. Der Lauf selbst meldete `ok:true`.
//
// KERNGEDANKE DIESES MODULS: Reihenfolge nach dem ÄLTESTEN letzten Versuch statt nach der
// Kennung. Das ist kein Zufall und keine Streuung, sondern eine nachrechenbare Rotation:
//
//   Werden je regulärem Lauf mindestens `k >= 1` Mandate BEGONNEN, dann wird bei `n` planbaren
//   Mandaten jedes Mandat spätestens im `ceil(n / k)`-ten Lauf begonnen.
//   Für einen Lauf mit `k = 0` gilt sie NICHT (siehe fairnessBound/ohneFortschritt).
//
// Beweisidee (deterministisch getestet in scripts/cron-fairness-test.js): begonnene Mandate
// erhalten einen frischen Versuchszeitpunkt und stehen damit STRIKT hinter jedem nicht
// begonnenen Mandat. Ein nicht begonnenes Mandat rückt deshalb je Lauf um mindestens `k`
// Plätze vor; von Rang `n-1` erreicht es die vorderen `k` Plätze nach höchstens `ceil(n/k)`
// Läufen. Mandate ohne jeden Versuch gelten als „ältester Versuch" und stehen vorn.
//
// WARUM DER VERSUCH ZÄHLT UND NICHT DER ERFOLG: würde nach dem letzten ERFOLG sortiert, bliebe
// ein dauerhaft scheiterndes (oder hängendes) Mandat für immer vorn und verdrängte alle
// anderen — genau der heutige Fehler mit umgekehrtem Vorzeichen. Der Versuch wird deshalb VOR
// der Verarbeitung persistiert (Punkt 4/6 der Vorgabe), der Erfolg getrennt danach.
//
// PERSISTENZ OHNE MIGRATION: der Fairnesszustand liegt in EINER eigenen Zeile des bereits
// existierenden `helmut_store` (`<storeId>-cron-fairness`, storage.readCronFairnessState).
// Eigene Zeile = kein Last-Write-Wins-Wettlauf mit dem Auth-/Main-Blob (Befund W-2), keine
// neue Tabelle, keine Migration, kein Freigabegate — der Fix wirkt mit dem Deployment.
// Inhalt sind ausschließlich Scheduler-Metadaten: pseudonyme Mandatskennung, Zeitstempel,
// Zähler, Statuswort. KEINE Inhalte, KEINE PII, KEINE Fehler-Rohtexte.
//
// FAIL-SAFE: ist der Zustand nicht lesbar oder nicht schreibbar, läuft der Cron WEITER
// (Reihenfolge dann ohne Verlaufswissen, siehe `tiebreak`) und meldet das als
// `zustandGeladen:false` / `zustandFehler` — ein Fairnessproblem darf nie ein Ausfall werden.
// Ein Zustand, der dauerhaft nicht schreibbar ist, hat KEINE Fairnessgarantie; genau deshalb
// meldet der Aufrufer das als Systemfehler statt es zu verschweigen (CLAUDE.md §4.4).

const crypto = require("crypto");

const FAIRNESS_VERSION = 1;

// Ein „laufend" registrierter Versuch blockiert das Mandat für andere (überlappende) Läufe.
// 30 min > Funktionslimit (300 s) und > TTL des Crawl-Locks (15 min): ein abgestürzter Lauf
// gibt sein Mandat also kontrolliert wieder frei, ohne dass ein paralleler Lauf es doppelt
// beginnt.
const DEFAULT_STALE_CLAIM_MS = 30 * 60 * 1000;

// Mindest-Restlaufzeit, bevor ein WEITERES Mandat begonnen wird. Ohne diese Reserve würde ein
// Mandat mit 2 s Restzeit „begonnen" (und damit als versucht vermerkt), ohne echte Arbeit zu
// leisten — die Rotation würde Arbeit vortäuschen. Senkt kein Budget und hebt keines an.
const DEFAULT_TENANT_RESERVE_MS = 15 * 1000;

// Gleichstandsfenster für den Losentscheid (unten). 6 h = Abstand der regulären Crawl-Läufe.
const DEFAULT_TIEBREAK_BUCKET_MS = 6 * 60 * 60 * 1000;

// Aufräumen: Einträge ohne Versuch seit 90 Tagen fallen weg. Rein zeitbasiert — NIE anhand der
// aktiven Mandantenliste, damit ein vorübergehend deaktiviertes Mandat seinen Verlauf behält
// und nach der Reaktivierung korrekt wieder einsortiert wird.
const ENTRY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const STATUS_LAUFEND = "laufend";
const STATUS_ERFOLG = "erfolgreich";
const STATUS_FEHLER = "fehlgeschlagen";

// --- Schalter ---------------------------------------------------------------------------------
// Default AN: das Modul behebt einen belegten Betriebsfehler, ein „Default aus" wäre ein
// wirkungsloses Deployment. `HELMUT_CRON_FAIRNESS=off` ist der Rückweg OHNE Codeänderung
// (dann gilt wieder die alphabetische Reihenfolge von listActiveTenantIds).
function fairnessEnabled(env = process.env) {
  const raw = String((env && env.HELMUT_CRON_FAIRNESS) || "").trim().toLowerCase();
  return raw !== "off" && raw !== "false" && raw !== "0";
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function staleClaimMs(env = process.env) {
  return positiveNumber(env && env.HELMUT_CRON_FAIRNESS_STALE_MS, DEFAULT_STALE_CLAIM_MS);
}

function tenantReserveMs(env = process.env) {
  return positiveNumber(env && env.HELMUT_CRON_TENANT_RESERVE_MS, DEFAULT_TENANT_RESERVE_MS);
}

// --- Zustand ----------------------------------------------------------------------------------

function isoOrNull(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function msOf(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

function counter(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalizeEntry(raw = {}) {
  const status = [STATUS_LAUFEND, STATUS_ERFOLG, STATUS_FEHLER].includes(raw && raw.status)
    ? raw.status
    : null;
  return {
    status,
    letzterVersuchAt: isoOrNull(raw && raw.letzterVersuchAt),
    letzterErfolgAt: isoOrNull(raw && raw.letzterErfolgAt),
    letzterFehlerAt: isoOrNull(raw && raw.letzterFehlerAt),
    letzteLaufkennung: raw && raw.letzteLaufkennung ? String(raw.letzteLaufkennung).slice(0, 120) : null,
    letzteDauerMs: Number.isFinite(Number(raw && raw.letzteDauerMs)) ? Math.max(0, Math.floor(Number(raw.letzteDauerMs))) : null,
    versuche: counter(raw && raw.versuche),
    erfolge: counter(raw && raw.erfolge),
    fehler: counter(raw && raw.fehler),
    fehlerSerie: counter(raw && raw.fehlerSerie)
  };
}

// Schemaversion der ABGELEGTEN Form. Sie ist nicht Dekoration: liest ein älterer
// Codestand eine NEUERE Version (Rollout mit zwei laufenden Fassungen), darf er sie
// nicht überschreiben — er kennt die zusätzlichen Felder nicht und würde sie beim
// Verschmelzen verwerfen. `null` = keine oder keine deutbare Angabe (Altbestand).
function stateVersion(raw) {
  const v = raw && typeof raw === "object" ? Number(raw.version) : NaN;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

// Fremde/kaputte Formen werden zu einem leeren Zustand — nie zu einem Absturz.
// Unbekannte Felder werden bewusst NICHT durchgereicht (Weißliste in normalizeEntry):
// ein fremdes Feld darf die Reihenfolge nicht beeinflussen.
function normalizeState(raw = {}) {
  const out = { version: Math.max(FAIRNESS_VERSION, stateVersion(raw) || 0), crons: {} };
  const crons = raw && typeof raw === "object" && raw.crons && typeof raw.crons === "object" ? raw.crons : {};
  for (const [cronName, tenants] of Object.entries(crons)) {
    if (!cronName || !tenants || typeof tenants !== "object") continue;
    const bucket = {};
    for (const [tenantId, entry] of Object.entries(tenants)) {
      if (!tenantId || !entry || typeof entry !== "object") continue;
      bucket[tenantId] = normalizeEntry(entry);
    }
    out.crons[String(cronName)] = bucket;
  }
  return out;
}

function entryOf(state, cronName, tenantId) {
  const cron = state && state.crons ? state.crons[cronName] : null;
  const entry = cron ? cron[tenantId] : null;
  return entry ? normalizeEntry(entry) : null;
}

// Monotone Verschmelzung zweier Einträge. Zeitstempel und Zähler können NIE zurückfallen;
// die „führende" Seite (jüngerer Versuch, bei Gleichstand der Patch) bestimmt Status,
// Laufkennung, Dauer und Fehlerserie. Damit kann ein verspätet geschriebener älterer Stand
// einen jüngeren nicht überschreiben — der Wettlauf zweier überlappender Läufe verliert
// seine schädliche Richtung.
function mergeEntry(base, patch) {
  const a = base ? normalizeEntry(base) : null;
  const b = patch ? normalizeEntry(patch) : null;
  if (!a) return b;
  if (!b) return a;
  const aMs = msOf(a.letzterVersuchAt);
  const bMs = msOf(b.letzterVersuchAt);
  // Derselbe Versuch (gleiche Laufkennung) -> der Patch führt IMMER. Sonst könnte ein
  // Abschluss, dessen Startzeitstempel geringfügig vor dem registrierten Versuch liegt,
  // hinter dem eigenen `laufend`-Vermerk zurückfallen und das Mandat scheinbar hängen lassen.
  const selberVersuch = Boolean(a.letzteLaufkennung && b.letzteLaufkennung && a.letzteLaufkennung === b.letzteLaufkennung);
  const lead = selberVersuch
    || (bMs === null && aMs === null)
    || (bMs !== null && (aMs === null || bMs >= aMs))
    ? b : a;
  const neuer = (x, y) => {
    const xs = msOf(x);
    const ys = msOf(y);
    if (xs === null) return isoOrNull(y);
    if (ys === null) return isoOrNull(x);
    return new Date(Math.max(xs, ys)).toISOString();
  };
  return {
    status: lead.status,
    letzterVersuchAt: neuer(a.letzterVersuchAt, b.letzterVersuchAt),
    letzterErfolgAt: neuer(a.letzterErfolgAt, b.letzterErfolgAt),
    letzterFehlerAt: neuer(a.letzterFehlerAt, b.letzterFehlerAt),
    letzteLaufkennung: lead.letzteLaufkennung,
    letzteDauerMs: lead.letzteDauerMs,
    versuche: Math.max(a.versuche, b.versuche),
    erfolge: Math.max(a.erfolge, b.erfolge),
    fehler: Math.max(a.fehler, b.fehler),
    fehlerSerie: lead.fehlerSerie
  };
}

function mergeState(base, patch, { nowMs = null } = {}) {
  const a = normalizeState(base);
  const b = normalizeState(patch);
  // Die höhere Version bleibt erhalten — ein alter Codestand kann die Marke einer
  // neueren Ablageform nicht zurückdrehen.
  const out = { version: Math.max(a.version, b.version), crons: {} };
  for (const cronName of new Set([...Object.keys(a.crons), ...Object.keys(b.crons)])) {
    const links = a.crons[cronName] || {};
    const rechts = b.crons[cronName] || {};
    const bucket = {};
    for (const tenantId of new Set([...Object.keys(links), ...Object.keys(rechts)])) {
      const merged = mergeEntry(links[tenantId], rechts[tenantId]);
      if (!merged) continue;
      // Zeitbasierte Retention (nie anhand der aktiven Mandantenliste).
      const versuchMs = msOf(merged.letzterVersuchAt);
      if (nowMs !== null && versuchMs !== null && nowMs - versuchMs > ENTRY_RETENTION_MS) continue;
      bucket[tenantId] = merged;
    }
    if (Object.keys(bucket).length) out.crons[cronName] = bucket;
  }
  return out;
}

// Entfernt ein Mandat vollständig aus dem Fairnesszustand (DSGVO-Löschung/Teardown).
function withoutTenant(state, tenantId) {
  const normalized = normalizeState(state);
  if (!tenantId) return normalized;
  for (const bucket of Object.values(normalized.crons)) delete bucket[tenantId];
  return normalized;
}

// --- Reihenfolge ------------------------------------------------------------------------------

// Losentscheid bei GLEICHSTAND (beide ohne Versuch oder identischer Zeitstempel).
// Bewusst NICHT die Kennung: sonst entschiede wieder das Alphabet. Bewusst an ein Zeitfenster
// gebunden: fällt der Zustand dauerhaft aus, trifft es nicht immer dasselbe Mandat.
// Innerhalb EINES Laufs ist der Wert konstant (gleiches `nowMs` -> gleiche Reihenfolge).
function tiebreak(cronName, tenantId, nowMs, bucketMs = DEFAULT_TIEBREAK_BUCKET_MS) {
  const fenster = Math.floor(Number(nowMs) / Math.max(1, bucketMs));
  const h = crypto.createHash("sha256").update(`${cronName}|${fenster}|${tenantId}`).digest();
  return h.readUInt32BE(0);
}

// Plant EINEN regulären Lauf. Reine Funktion — kein IO, keine Uhr, kein Zufall.
//
// Rangfolge:
//   1. Mandate mit aktivem („laufend", nicht veraltetem) Versuch werden NICHT geplant.
//   2. Mandate ohne jeden Versuch zuerst.
//   3. danach ältester letzter Versuch zuerst.
//   4. Gleichstand: Losentscheid je Zeitfenster (nicht die Kennung).
//   5. verbleibender Gleichstand: Kennung — nur damit die Ausgabe reproduzierbar ist.
function planTenantOrder({
  cronName,
  tenantIds = [],
  state = null,
  nowMs = Date.now(),
  staleMs = DEFAULT_STALE_CLAIM_MS,
  tiebreakBucketMs = DEFAULT_TIEBREAK_BUCKET_MS
} = {}) {
  const normalized = normalizeState(state);
  const aktive = [...new Set((Array.isArray(tenantIds) ? tenantIds : []).filter(Boolean).map(String))];
  const planbar = [];
  const blockiert = [];
  for (const tenantId of aktive) {
    const entry = entryOf(normalized, cronName, tenantId);
    const versuchMs = entry ? msOf(entry.letzterVersuchAt) : null;
    const laufend = Boolean(entry && entry.status === STATUS_LAUFEND && versuchMs !== null && nowMs - versuchMs < staleMs);
    const kandidat = {
      politicianId: tenantId,
      letzterVersuchAt: entry ? entry.letzterVersuchAt : null,
      letzterErfolgAt: entry ? entry.letzterErfolgAt : null,
      letzterFehlerAt: entry ? entry.letzterFehlerAt : null,
      letzterStatus: entry ? entry.status : null,
      versuche: entry ? entry.versuche : 0,
      fehlerSerie: entry ? entry.fehlerSerie : 0,
      wartetMs: versuchMs === null ? null : Math.max(0, nowMs - versuchMs),
      nieVersucht: versuchMs === null,
      veralteterVersuch: Boolean(entry && entry.status === STATUS_LAUFEND && versuchMs !== null && nowMs - versuchMs >= staleMs),
      los: tiebreak(cronName, tenantId, nowMs, tiebreakBucketMs)
    };
    if (laufend) blockiert.push({ ...kandidat, grund: "laeuft-bereits" });
    else planbar.push(kandidat);
  }
  planbar.sort((a, b) => {
    if (a.nieVersucht !== b.nieVersucht) return a.nieVersucht ? -1 : 1;
    if (!a.nieVersucht && !b.nieVersucht) {
      const diff = msOf(a.letzterVersuchAt) - msOf(b.letzterVersuchAt);
      if (diff !== 0) return diff;
    }
    if (a.los !== b.los) return a.los - b.los;
    return a.politicianId < b.politicianId ? -1 : a.politicianId > b.politicianId ? 1 : 0;
  });
  return {
    cronName,
    order: planbar.map((k) => k.politicianId),
    plan: planbar.map((k, i) => ({ ...k, rang: i + 1 })),
    blockiert,
    aktive: aktive.length,
    planbar: planbar.length
  };
}

// Nachrechenbare Obergrenze: bei `n` planbaren Mandaten und mindestens `k` BEGONNENEN
// Mandaten je regulärem Lauf ist jedes Mandat spätestens im ceil(n/k)-ten Lauf begonnen.
//
// WICHTIG — die Garantie hängt an `k >= 1`: sie sagt nichts über einen Lauf aus, der
// KEIN einziges Mandat beginnen konnte (Restlaufzeit kleiner als die Reserve). Ein
// solcher Lauf bringt keinen Fortschritt; `Infinity` ist hier die ehrliche Antwort und
// kein Rechenfehler. Der Aufrufer macht diesen Fall sichtbar (`ohneFortschritt`), statt
// eine Zahl zu melden, die es nicht gibt.
function fairnessBound(n, k) {
  const mandate = Math.max(0, Math.floor(Number(n) || 0));
  const kapazitaet = Math.floor(Number(k) || 0);
  if (!mandate) return 0;
  if (kapazitaet <= 0) return Infinity; // 0 begonnene Mandate je Lauf = keine Garantie
  return Math.ceil(mandate / kapazitaet);
}

// Hält ein ANDERER Lauf dieses Mandat gerade? Wird direkt NACH dem Registrieren des
// eigenen Versuchs gegen den verschmolzenen Zustand geprüft: gewinnt dort eine fremde
// Laufkennung, hat der andere Lauf das Mandat und dieser Lauf lässt es aus. Das ist die
// Absicherung gegen zwei überlappende Läufe OBERHALB der eigentlichen Sperre
// (`crawl-<mandat>`), nicht deren Ersatz.
function fremderHalter(state, cronName, tenantId, eigeneLaufkennung, nowMs, staleMs = DEFAULT_STALE_CLAIM_MS) {
  const entry = entryOf(state, cronName, tenantId);
  if (!entry || entry.status !== STATUS_LAUFEND) return null;
  if (!entry.letzteLaufkennung || !eigeneLaufkennung) return null;
  if (entry.letzteLaufkennung === eigeneLaufkennung) return null;
  const versuchMs = msOf(entry.letzterVersuchAt);
  if (versuchMs === null || nowMs - versuchMs >= staleMs) return null; // veraltet -> nicht blockierend
  return entry.letzteLaufkennung;
}

// --- Zustandsübergänge ------------------------------------------------------------------------

function claimPatch({ cronName, tenantId, runId = null, nowMs = Date.now(), vorher = null } = {}) {
  const alt = vorher ? normalizeEntry(vorher) : null;
  return {
    version: FAIRNESS_VERSION,
    crons: {
      [cronName]: {
        [tenantId]: {
          status: STATUS_LAUFEND,
          letzterVersuchAt: new Date(nowMs).toISOString(),
          letzterErfolgAt: alt ? alt.letzterErfolgAt : null,
          letzterFehlerAt: alt ? alt.letzterFehlerAt : null,
          letzteLaufkennung: runId || null,
          letzteDauerMs: null,
          versuche: (alt ? alt.versuche : 0) + 1,
          erfolge: alt ? alt.erfolge : 0,
          fehler: alt ? alt.fehler : 0,
          fehlerSerie: alt ? alt.fehlerSerie : 0
        }
      }
    }
  };
}

function finishPatch({
  cronName,
  tenantId,
  runId = null,
  erfolg = true,
  startedMs = Date.now(),
  nowMs = Date.now(),
  vorher = null
} = {}) {
  const alt = vorher ? normalizeEntry(vorher) : null;
  const abschluss = new Date(nowMs).toISOString();
  return {
    version: FAIRNESS_VERSION,
    crons: {
      [cronName]: {
        [tenantId]: {
          status: erfolg ? STATUS_ERFOLG : STATUS_FEHLER,
          // Der Versuchszeitpunkt des Claims bleibt der Anker der Rotation.
          letzterVersuchAt: new Date(startedMs).toISOString(),
          letzterErfolgAt: erfolg ? abschluss : (alt ? alt.letzterErfolgAt : null),
          letzterFehlerAt: erfolg ? (alt ? alt.letzterFehlerAt : null) : abschluss,
          letzteLaufkennung: runId || null,
          letzteDauerMs: Math.max(0, nowMs - startedMs),
          versuche: alt ? alt.versuche : 1,
          erfolge: (alt ? alt.erfolge : 0) + (erfolg ? 1 : 0),
          fehler: (alt ? alt.fehler : 0) + (erfolg ? 0 : 1),
          fehlerSerie: erfolg ? 0 : (alt ? alt.fehlerSerie : 0) + 1
        }
      }
    }
  };
}

// --- Ausführung -------------------------------------------------------------------------------
//
// Die Schleife selbst — bewusst hier und nicht in server.js, damit sie offline und ohne HTTP
// deterministisch getestet werden kann (scripts/cron-fairness-test.js).
//
// Reihenfolge der Schritte je Mandat ist Absicht:
//   Restzeitprüfung -> Versuch registrieren (persistent) -> Verarbeitung -> Abschluss.
// Ein Abbruch zwischen Registrierung und Abschluss lässt das Mandat als „laufend" zurück; es
// wird nach `staleMs` kontrolliert erneut zugelassen und gilt bis dahin als versucht — es
// verdrängt also niemanden.
async function runTenantsFairly({
  cronName,
  tenantIds = [],
  perTenant,
  runId = null,
  deadlineMs = 240000,
  startedMs = Date.now(),
  now = () => Date.now(),
  loadState = async () => ({}),
  saveState = async () => {},
  staleMs = DEFAULT_STALE_CLAIM_MS,
  reserveMs = DEFAULT_TENANT_RESERVE_MS,
  tiebreakBucketMs = DEFAULT_TIEBREAK_BUCKET_MS,
  // "unveraendert" = Rueckweg auf das Verhalten VOR OP-25: uebergebene Reihenfolge,
  // kein Zustands-IO, keine Registrierung, kein Ueberlappungsschutz. Nur dafuer da,
  // dass `HELMUT_CRON_FAIRNESS=off` wirklich den Altzustand herstellt.
  reihenfolge = "fair"
} = {}) {
  const deadline = startedMs + deadlineMs;
  const fair = reihenfolge !== "unveraendert";
  let zustand = null;
  let zustandGeladen = true;
  let zustandFehler = null;
  try {
    zustand = normalizeState(fair ? await loadState() : {});
  } catch (error) {
    zustand = normalizeState({});
    zustandGeladen = false;
    zustandFehler = String((error && error.message) || "zustand-nicht-lesbar").slice(0, 200);
  }

  const planung = fair
    ? planTenantOrder({
      cronName,
      tenantIds,
      state: zustand,
      nowMs: now(),
      staleMs,
      tiebreakBucketMs
    })
    : (() => {
      const ids = [...new Set((Array.isArray(tenantIds) ? tenantIds : []).filter(Boolean).map(String))];
      return {
        cronName,
        order: ids,
        plan: ids.map((politicianId, i) => ({ politicianId, rang: i + 1, letzterVersuchAt: null, letzterErfolgAt: null, letzterFehlerAt: null, letzterStatus: null, versuche: 0, fehlerSerie: 0, wartetMs: null, nieVersucht: true, veralteterVersuch: false, los: 0 })),
        blockiert: [],
        aktive: ids.length,
        planbar: ids.length
      };
    })();

  // Ein Mandat darf innerhalb EINES Laufs höchstens einmal begonnen werden — auch dann,
  // wenn die aktive Mandantenliste es (fehlerhaft) doppelt enthielte.
  const begonnen = new Set();
  const results = [];
  const verlauf = [];

  // `pruefen` nur beim Registrieren des Versuchs: der Aufrufer liest dann nach dem
  // Schreiben gegen und wiederholt bei einem verlorenen Schreibvorgang. Beim ABSCHLUSS
  // wäre die Gegenprüfung Verschwendung — ein verlorener Abschluss lässt den Eintrag
  // `laufend`, und der läuft nach `staleMs` ohnehin kontrolliert ab.
  const speichern = async (patch, { pruefen = false } = {}) => {
    if (!fair) return { ok: true, remote: null };
    try {
      zustand = mergeState(zustand, patch, { nowMs: now() });
      const ergebnis = await saveState(patch, { pruefen });
      // Der Speicher darf den verschmolzenen FERNSTAND zurückgeben. Dann gilt er als
      // Wahrheit — nur so sieht dieser Lauf den Versuch eines überlappenden Laufs.
      const remote = ergebnis && ergebnis.state ? ergebnis.state : null;
      if (remote) zustand = mergeState(zustand, remote, { nowMs: now() });
      return { ok: true, remote };
    } catch (error) {
      // Fail-safe: der Lauf geht weiter. Ohne Zustand gibt es keine Garantie — das meldet
      // der Aufrufer als Systemfehler, es wird nicht verschwiegen.
      if (!zustandFehler) zustandFehler = String((error && error.message) || "zustand-nicht-schreibbar").slice(0, 200);
      return { ok: false, remote: null };
    }
  };

  for (const eintrag of planung.blockiert) {
    results.push({ politicianId: eintrag.politicianId, skipped: true, reason: "laeuft-bereits" });
    verlauf.push({ politicianId: eintrag.politicianId, ausgang: "laeuft-bereits" });
  }

  for (const kandidat of planung.plan) {
    const tenantId = kandidat.politicianId;
    if (begonnen.has(tenantId)) continue;
    // Restzeit VOR dem Beginn prüfen. Nicht begonnene Mandate werden NICHT als versucht
    // vermerkt — sie bleiben damit im nächsten Lauf vorn.
    if (now() + reserveMs > deadline) {
      results.push({ politicianId: tenantId, skipped: true, reason: "zeitbudget" });
      verlauf.push({ politicianId: tenantId, ausgang: "zeitbudget" });
      continue;
    }
    begonnen.add(tenantId);
    const versuchMs = now();
    const vorher = entryOf(zustand, cronName, tenantId);
    const registrierung = await speichern(
      claimPatch({ cronName, tenantId, runId, nowMs: versuchMs, vorher }),
      { pruefen: true }
    );
    const registriert = registrierung.ok;
    // Hat ein ueberlappender Lauf dasselbe Mandat kurz vor uns registriert, gewinnt SEINE
    // Laufkennung im verschmolzenen Zustand. Dann wird hier nicht verarbeitet — der
    // andere Lauf tut es bereits. Kein Ersatz fuer die Sperre `crawl-<mandat>`, sondern
    // eine zweite, unabhaengige Schranke davor.
    const fremd = registriert ? fremderHalter(zustand, cronName, tenantId, runId, now(), staleMs) : null;
    if (fremd) {
      begonnen.delete(tenantId);
      results.push({ politicianId: tenantId, skipped: true, reason: "laeuft-bereits" });
      verlauf.push({ politicianId: tenantId, ausgang: "laeuft-bereits" });
      continue;
    }
    let erfolg = false;
    let ergebnis = null;
    let fehler = null;
    try {
      ergebnis = await perTenant(tenantId);
      erfolg = true;
    } catch (error) {
      // Fehler-Isolation: nur DIESES Mandat scheitert.
      fehler = error;
    }
    const dauerMs = Math.max(0, now() - versuchMs);
    await speichern(finishPatch({
      cronName,
      tenantId,
      runId,
      erfolg,
      startedMs: versuchMs,
      nowMs: versuchMs + dauerMs,
      vorher: entryOf(zustand, cronName, tenantId)
    }));
    if (erfolg) {
      results.push({
        politicianId: tenantId,
        ...(ergebnis && typeof ergebnis === "object" ? ergebnis : { result: ergebnis })
      });
      verlauf.push({ politicianId: tenantId, ausgang: "erfolgreich", dauerMs, versuchRegistriert: registriert });
    } else {
      results.push({ politicianId: tenantId, error: fehler && fehler.message, failed: true });
      verlauf.push({ politicianId: tenantId, ausgang: "fehlgeschlagen", dauerMs, versuchRegistriert: registriert });
    }
  }

  // Vorhersage: welches Mandat kommt beim nächsten regulären Lauf zuerst? Aus dem
  // FORTGESCHRIEBENEN Zustand berechnet, damit die Vorhersage zur Rotation passt.
  const nachher = fair
    ? planTenantOrder({ cronName, tenantIds, state: zustand, nowMs: now(), staleMs, tiebreakBucketMs })
    : planung;

  // KAPAZITÄT DIESES LAUFS (`k`) und daraus die Frage, ob er überhaupt eine
  // Fortschrittsgarantie hatte. `k = 0` heißt: es war planbare Arbeit da, aber die
  // Restlaufzeit reichte für kein einziges Mandat — dieser Lauf hat NICHTS bewegt und
  // trägt deshalb KEINE Garantie. Genau das wird ausgewiesen, statt eine Zahl zu melden.
  const kapazitaet = begonnen.size;
  const grenze = fairnessBound(planung.planbar, kapazitaet);
  const ohneFortschritt = planung.planbar > 0 && kapazitaet === 0;
  return {
    results,
    zustandGeladen,
    zustandFehler,
    fairness: {
      cronName,
      aktive: planung.aktive,
      geplant: planung.order,
      begonnen: [...begonnen],
      erfolgreich: verlauf.filter((v) => v.ausgang === "erfolgreich").map((v) => v.politicianId),
      fehlgeschlagen: verlauf.filter((v) => v.ausgang === "fehlgeschlagen").map((v) => v.politicianId),
      zeitbudget: verlauf.filter((v) => v.ausgang === "zeitbudget").map((v) => v.politicianId),
      laeuftBereits: verlauf.filter((v) => v.ausgang === "laeuft-bereits").map((v) => v.politicianId),
      wartend: planung.plan.map((k) => ({
        politicianId: k.politicianId,
        rang: k.rang,
        letzterVersuchAt: k.letzterVersuchAt,
        letzterErfolgAt: k.letzterErfolgAt,
        wartetMs: k.wartetMs,
        fehlerSerie: k.fehlerSerie,
        veralteterVersuch: k.veralteterVersuch
      })),
      naechstesMandat: nachher.order[0] || null,
      // Kapazität dieses Laufs und die daraus folgende Obergrenze. `null` statt einer
      // Zahl, wenn es keine Garantie gibt — `Infinity` würde in JSON zu `null` werden
      // und wäre dort nicht von „unbekannt" zu unterscheiden.
      kapazitaet,
      fortschrittsgarantie: Number.isFinite(grenze) && kapazitaet > 0,
      ohneFortschritt,
      obergrenzeLaeufe: Number.isFinite(grenze) ? grenze : null,
      zustandGeladen,
      zustandFehler
    }
  };
}

module.exports = {
  FAIRNESS_VERSION,
  DEFAULT_STALE_CLAIM_MS,
  DEFAULT_TENANT_RESERVE_MS,
  DEFAULT_TIEBREAK_BUCKET_MS,
  ENTRY_RETENTION_MS,
  STATUS_LAUFEND,
  STATUS_ERFOLG,
  STATUS_FEHLER,
  fairnessEnabled,
  staleClaimMs,
  tenantReserveMs,
  normalizeState,
  normalizeEntry,
  stateVersion,
  entryOf,
  mergeEntry,
  mergeState,
  withoutTenant,
  tiebreak,
  planTenantOrder,
  fairnessBound,
  fremderHalter,
  claimPatch,
  finishPatch,
  runTenantsFairly
};
