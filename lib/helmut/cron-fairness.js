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
//
// ---------------------------------------------------------------------------------------------
// BEFUND R-6 (2026-07-31, Production-Nachweis OP-25 §10.4) UND SEINE BEHEBUNG
// ---------------------------------------------------------------------------------------------
// URSACHE, im Code belegt: `/api/cron/crawl` und `/api/cron/pipeline` (und ebenso
// `/api/cron/lage-check`) umschließen `runCronForTenants` mit `withTimeout(…, 280000)`.
// `withTimeout` ist ein `Promise.race` — es BEENDET die ursprüngliche Promise nicht (Node kennt
// kein Cancel). Greift das äußere Zeitlimit, kehrt `runCronForTenants` NIE zurück; alles, was
// NACH `runTenantsFairly` steht (die Zeile `[cron/*/fairness]`, der Zeitbudget-Systemfehler,
// der Antwortkörper), wird nie ausgeführt. Betroffen waren 3 von 5 gewerteten Läufen.
//
// WARUM DIE 10 s DIFFERENZ (270 000 innen / 280 000 außen) NICHT REICHEN: die innere Deadline
// ist ein START-Gatter, kein STOPP-Gatter. Sie wird VOR dem Beginn eines Mandats geprüft
// (`now() + reserveMs > deadline`); ein bei 269 s begonnenes Mandat darf beliebig lange
// weiterlaufen — `perTenant` (runSourceCrawl) hat sein eigenes, unabhängiges Budget. Die
// Überschreitung ist damit nach oben offen und nicht durch einen konstanten Aufschlag zu decken.
//
// WARUM KEIN `finally` REICHT: bei einem echten Plattformabbruch (Vercel beendet/friert die
// Instanz nach der Antwort) läuft die Ereignisschleife nicht weiter — `finally`, `process.on`
// und jede Abschlussarbeit entfallen. Ein Vertrag, der auf Abschlusscode am Laufende beruht,
// ist deshalb prinzipiell nicht haltbar.
//
// BEHEBUNG (additiv, ohne Änderung an Reihenfolge, `k` oder ceil(n/k)): derselbe persistente
// Zustand trägt zusätzlich einen kompakten LAUFDATENSATZ je Cron (`laeufe[<cron>]`). Er wird
// NICHT am Ende geschrieben, sondern bei jedem Mandatsübergang — huckepack auf die
// Schreibvorgänge, die für die Buchführung ohnehin stattfinden (Claim/Abschluss). Nach jedem
// Übergang existiert damit ein rekonstruierbarer Stand; ein Prozessabbruch lässt den Datensatz
// als `laufend` zurück (nach `staleMs` ableitbar als `abgebrochen`) und kann keinen erfundenen
// Erfolg erzeugen. `rekonstruiereLauf` rechnet daraus die vollständige Telemetriezeile nach.

const crypto = require("crypto");
const mandatsklasse = require("./mandatsklasse");

// Schemaversion der ABGELEGTEN Form.
//   1 = nur `crons` (Buchführung je Mandat)
//   2 = zusätzlich `laeufe` (Laufdatensatz je Cron, R-6)
// Die Erhöhung ist Pflicht: ein Codestand der Version 1 kennt `laeufe` nicht und würde den
// Bereich beim Verschmelzen STILL verwerfen (Weißliste in normalizeState). Genau dagegen
// wirkt die Versionsschranke in storage.saveCronFairnessState (Schranke 2). Preis: läuft
// während eines Rollouts noch eine Instanz mit Version 1, verweigert SIE den Schreibvorgang
// (`zustand-neuere-version-2`) — laut, fail-safe und auf das Rolloutfenster begrenzt, statt
// den Laufdatensatz lautlos zu löschen (CLAUDE.md §4.4).
const FAIRNESS_VERSION = 2;

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

// --- Laufdatensatz (R-6) ----------------------------------------------------------------------
// Laufzustände. `abgebrochen` wird NIE aus dem Lauf heraus behauptet — es entsteht entweder
// aus dem äußeren Timeout-Vermerk oder wird beim Lesen aus einem veralteten `laufend`
// ABGELEITET (laufStatus). Ein Prozessabbruch kann damit keinen Abschluss vortäuschen.
const LAUF_LAUFEND = "laufend";
const LAUF_TEILWEISE = "teilweise";
const LAUF_ABGESCHLOSSEN = "abgeschlossen";
const LAUF_ABGEBROCHEN = "abgebrochen";

// Monotone Rangfolge: ein späterer Schreibvorgang darf einen Zustand nur nach OBEN bewegen.
// `abgebrochen` (äußeres Zeitlimit hat gegriffen) ist bewusst schwächer als ein echter
// Abschluss: schreibt die weiterlaufende Promise danach doch noch ihren Abschluss, gewinnt er.
const LAUF_RANG = {
  [LAUF_LAUFEND]: 0,
  [LAUF_ABGEBROCHEN]: 1,
  [LAUF_TEILWEISE]: 2,
  [LAUF_ABGESCHLOSSEN]: 2
};

// Ausgang EINES Mandats innerhalb EINES Laufs.
const AUSGANG_BEGONNEN = "begonnen";              // Versuch registriert, noch kein Abschluss
const AUSGANG_ERFOLG = "erfolgreich";
const AUSGANG_FEHLER = "fehlgeschlagen";          // geworfener Fehler ODER Fehler-/Timeout-Objekt
const AUSGANG_LAEUFT_BEREITS = "laeuft-bereits";  // von der Planung/vom fremden Halter abgewiesen
const AUSGANG_SPERRE_VERWEIGERT = "sperre-verweigert"; // von `crawl-<mandat>` abgewiesen
const AUSGANG_ZEITBUDGET = "zeitbudget";          // NICHT begonnen, Restlaufzeit reichte nicht

// `begonnen` ist der einzige VORLÄUFIGE Ausgang; jeder andere ist endgültig und darf nicht
// wieder auf `begonnen` zurückfallen. Unter gleichrangigen Ausgängen führt der spätere
// Schreibvorgang (innerhalb eines Laufs sind die Schreibvorgänge streng sequenziell).
const AUSGANG_RANG = {
  [AUSGANG_BEGONNEN]: 1,
  [AUSGANG_ERFOLG]: 2,
  [AUSGANG_FEHLER]: 2,
  [AUSGANG_LAEUFT_BEREITS]: 2,
  [AUSGANG_SPERRE_VERWEIGERT]: 2,
  [AUSGANG_ZEITBUDGET]: 2
};

// Ein Mandat zählt genau dann zur Kapazität `k`, wenn dieser Lauf es wirklich begonnen hat.
// Abgewiesene (Planung/fremder Halter/Sperre) und nicht begonnene zählen NICHT — exakt die
// Definition, die runTenantsFairly über `begonnen` führt.
const AUSGANG_ZAEHLT_ALS_BEGONNEN = new Set([AUSGANG_BEGONNEN, AUSGANG_ERFOLG, AUSGANG_FEHLER]);

// Wachstumsgrenzen des Laufbereichs. Der Zustand ist eine SCHEDULER-Notiz, kein Archiv:
// je Cron genau EIN (der letzte) Datensatz, höchstens so viele Crons wie es real gibt,
// und Datensätze, die niemand mehr fortschreibt, fallen zeitbasiert weg.
const MAX_LAUF_CRONS = 12;
const MAX_LAUF_MANDATE = 200;
const LAUF_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

// Antwort von `scheduler.runSourceCrawl`, wenn die Sperre `crawl-<mandat>` VERWEIGERT wurde
// (ein anderer Lauf hat das Mandat). Sie WIRFT dabei nicht, sie liefert diesen Grund zurück —
// deshalb sähe ein naives `erfolg = true` hier eine Verarbeitung, die nie stattgefunden hat.
// Reihenfolge im Ablauf: der Fairnessvermerk entsteht VOR der Verarbeitung, die Sperre erst
// IN runSourceCrawl. Ein Mandat kann also registriert und danach abgewiesen werden.
// Der Zeichenkettenvertrag ist testgesichert (scripts/cron-fairness-test.js §18b2).
const SPERRE_VERWEIGERT_GRUND = "already running";

function sperreVerweigert(ergebnis) {
  return Boolean(
    ergebnis && typeof ergebnis === "object" && ergebnis.skipped === true
    && String(ergebnis.reason || "").trim().toLowerCase() === SPERRE_VERWEIGERT_GRUND
  );
}

// P29-1 (Fix-Sprint Punkt 29): die Cron-Routen geben Zeitueberschreitungen und
// Fehlschlaege als OBJEKTE zurueck statt zu werfen — z. B.
// { ok:false, bounded:true, reason:"crawl-timeout" } oder der als status:'stable'
// maskierte lage-check-Timeout. Ein solches Ergebnis ist KEINE erfolgreiche
// Verarbeitung: es darf weder letzterErfolgAt setzen noch erfolge zaehlen noch
// die fehlerSerie zuruecksetzen. Ein ehrlicher Skip ({ skipped:true }) hat
// Vorrang und bleibt damit von einem Fehler klar unterscheidbar — auch wenn er
// zusaetzlich ok:false traegt (z. B. "Push ist nicht konfiguriert").
function ergebnisFehlgeschlagen(ergebnis) {
  if (!ergebnis || typeof ergebnis !== "object") return false;
  if (ergebnis.skipped === true) return false;
  return ergebnis.ok === false || ergebnis.bounded === true || ergebnis.failed === true;
}

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

function kennung(value, max = 120) {
  return value ? String(value).slice(0, max) : null;
}

function kennungsListe(value) {
  const roh = Array.isArray(value) ? value : [];
  return [...new Set(roh.filter(Boolean).map((x) => String(x).slice(0, 120)))].slice(0, MAX_LAUF_MANDATE);
}

// Ein Laufdatensatz. Ohne Laufkennung gibt es keinen Datensatz — ohne sie ließe sich der
// Fortschritt keinem Lauf zuordnen und ein Nachzügler könnte einen fremden Lauf überschreiben.
function normalizeLauf(raw = {}) {
  if (!raw || typeof raw !== "object") return null;
  const laufId = kennung(raw.laufId);
  if (!laufId) return null;
  const ausgaenge = {};
  const rohAusgaenge = raw.ausgaenge && typeof raw.ausgaenge === "object" ? raw.ausgaenge : {};
  for (const [tenantId, wert] of Object.entries(rohAusgaenge)) {
    if (!tenantId || !Object.prototype.hasOwnProperty.call(AUSGANG_RANG, wert)) continue;
    if (Object.keys(ausgaenge).length >= MAX_LAUF_MANDATE) break;
    ausgaenge[String(tenantId).slice(0, 120)] = wert;
  }
  const obergrenze = Number(raw.obergrenzeLaeufe);
  return {
    laufId,
    status: Object.prototype.hasOwnProperty.call(LAUF_RANG, raw.status) ? raw.status : LAUF_LAUFEND,
    grund: kennung(raw.grund, 60),
    startAt: isoOrNull(raw.startAt),
    standAt: isoOrNull(raw.standAt),
    beendetAt: isoOrNull(raw.beendetAt),
    // TATSACHE, keine Behauptung über den Lauf: „das äußere Zeitlimit hat zu diesem Zeitpunkt
    // gegriffen." Ob die ursprüngliche Promise danach noch weiterlief, sagt das Feld nicht.
    aeusseresTimeoutAt: isoOrNull(raw.aeusseresTimeoutAt),
    aktive: counter(raw.aktive),
    geplant: kennungsListe(raw.geplant),
    blockiert: kennungsListe(raw.blockiert),
    ausgaenge,
    kapazitaet: counter(raw.kapazitaet),
    obergrenzeLaeufe: Number.isFinite(obergrenze) && obergrenze >= 0 ? Math.floor(obergrenze) : null,
    naechstesMandat: kennung(raw.naechstesMandat),
    zustandGeladen: raw.zustandGeladen !== false,
    zustandFehler: kennung(raw.zustandFehler, 200)
  };
}

// Fremde/kaputte Formen werden zu einem leeren Zustand — nie zu einem Absturz.
// Unbekannte Felder werden bewusst NICHT durchgereicht (Weißliste in normalizeEntry):
// ein fremdes Feld darf die Reihenfolge nicht beeinflussen.
function normalizeState(raw = {}) {
  const out = { version: Math.max(FAIRNESS_VERSION, stateVersion(raw) || 0), crons: {}, laeufe: {} };
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
  const laeufe = raw && typeof raw === "object" && raw.laeufe && typeof raw.laeufe === "object" ? raw.laeufe : {};
  for (const [cronName, lauf] of Object.entries(laeufe)) {
    if (!cronName) continue;
    const norm = normalizeLauf(lauf);
    if (norm) out.laeufe[String(cronName).slice(0, 60)] = norm;
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
  let lead = selberVersuch
    || (bMs === null && aMs === null)
    || (bMs !== null && (aMs === null || bMs >= aMs))
    ? b : a;
  let unterlegen = lead === b ? a : b;
  // EIN ABSCHLUSS FAELLT NICHT ZURUECK (Kriterium F-CAS-2). Ohne diese Schranke koennte ein
  // verspaeteter Versuchsvermerk DESSELBEN Laufs (Regel „selber Versuch fuehrt immer") einen
  // bereits erreichten Endzustand wieder auf `laufend` setzen — genau die Signatur des
  // Vorfalls vom 2026-08-02, nur auf einem zweiten Weg.
  //
  // Zurueckgedreht werden darf ein Endzustand ausschliesslich von einem ECHT NEUEREN Versuch
  // (strikt juengerer Versuchszeitpunkt). Damit bleibt der Ueberlappungsschutz unberuehrt: ein
  // fremder Lauf, der das Mandat neu beginnt, setzt weiterhin `laufend` — und `fremderHalter`
  // sieht ihn.
  const endzustand = (status) => status === STATUS_ERFOLG || status === STATUS_FEHLER;
  const echtNeuerer = (x, y) => {
    const xs = msOf(x.letzterVersuchAt);
    const ys = msOf(y.letzterVersuchAt);
    return xs !== null && ys !== null && xs > ys;
  };
  if (!endzustand(lead.status) && endzustand(unterlegen.status) && !echtNeuerer(lead, unterlegen)) {
    const getauscht = lead;
    lead = unterlegen;
    unterlegen = getauscht;
  }
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

function neueresIso(x, y) {
  const xs = msOf(x);
  const ys = msOf(y);
  if (xs === null) return isoOrNull(y);
  if (ys === null) return isoOrNull(x);
  return new Date(Math.max(xs, ys)).toISOString();
}

// Monotone Verschmelzung zweier Laufdatensätze.
//
// VERSCHIEDENE LÄUFE: der jüngere Start gewinnt vollständig — ein Nachzügler eines älteren,
// noch weiterlaufenden Laufs darf den Datensatz des neueren nicht überschreiben (überlappende
// Läufe). Die Buchführung je Mandat (`crons`) bleibt davon unberührt und verschmilzt weiter.
//
// DERSELBE LAUF: Zeitstempel und Mengen wachsen nur, Ausgänge nur entlang AUSGANG_RANG,
// der Laufzustand nur entlang LAUF_RANG. Damit kann keine Schreibreihenfolge — auch nicht
// die zwischen äußerem Timeout-Vermerk und weiterlaufender Promise — Wissen zerstören.
function mergeLauf(base, patch) {
  const a = base ? normalizeLauf(base) : null;
  const b = patch ? normalizeLauf(patch) : null;
  if (!a) return b;
  if (!b) return a;
  if (a.laufId !== b.laufId) {
    const aMs = msOf(a.startAt);
    const bMs = msOf(b.startAt);
    if (aMs === null && bMs === null) return b.laufId > a.laufId ? b : a;
    if (aMs === null) return b;
    if (bMs === null) return a;
    if (bMs !== aMs) return bMs > aMs ? b : a;
    return b.laufId > a.laufId ? b : a; // reproduzierbar, nicht zufällig
  }
  const ausgaenge = { ...a.ausgaenge };
  for (const [tenantId, wert] of Object.entries(b.ausgaenge)) {
    const alt = ausgaenge[tenantId];
    if (!alt || AUSGANG_RANG[wert] >= AUSGANG_RANG[alt]) ausgaenge[tenantId] = wert;
  }
  const fuehrt = LAUF_RANG[b.status] >= LAUF_RANG[a.status] ? b : a;
  return {
    laufId: a.laufId,
    status: fuehrt.status,
    // Der Abbruchgrund gehört zum führenden Zustand: hebt ein echter Abschluss den
    // Datensatz aus `abgebrochen` heraus, ist der Grund erledigt — die TATSACHE des
    // äußeren Zeitlimits bleibt als `aeusseresTimeoutAt` erhalten.
    grund: fuehrt.grund,
    startAt: a.startAt || b.startAt,
    standAt: neueresIso(a.standAt, b.standAt),
    beendetAt: neueresIso(a.beendetAt, b.beendetAt),
    aeusseresTimeoutAt: neueresIso(a.aeusseresTimeoutAt, b.aeusseresTimeoutAt),
    aktive: Math.max(a.aktive, b.aktive),
    geplant: [...new Set([...a.geplant, ...b.geplant])].slice(0, MAX_LAUF_MANDATE),
    blockiert: [...new Set([...a.blockiert, ...b.blockiert])].slice(0, MAX_LAUF_MANDATE),
    ausgaenge,
    kapazitaet: Math.max(a.kapazitaet, b.kapazitaet),
    obergrenzeLaeufe: b.obergrenzeLaeufe !== null ? b.obergrenzeLaeufe : a.obergrenzeLaeufe,
    naechstesMandat: b.naechstesMandat || a.naechstesMandat,
    zustandGeladen: a.zustandGeladen && b.zustandGeladen,
    zustandFehler: b.zustandFehler || a.zustandFehler
  };
}

function mergeState(base, patch, { nowMs = null } = {}) {
  const a = normalizeState(base);
  const b = normalizeState(patch);
  // Die höhere Version bleibt erhalten — ein alter Codestand kann die Marke einer
  // neueren Ablageform nicht zurückdrehen.
  const out = { version: Math.max(a.version, b.version), crons: {}, laeufe: {} };
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
  for (const cronName of new Set([...Object.keys(a.laeufe), ...Object.keys(b.laeufe)])) {
    const merged = mergeLauf(a.laeufe[cronName], b.laeufe[cronName]);
    if (!merged) continue;
    // Zeitbasierte Retention — ein Laufdatensatz, den niemand mehr fortschreibt, ist
    // Betriebsgeschichte und gehört nicht dauerhaft in eine Scheduler-Notiz.
    const standMs = msOf(merged.standAt) !== null ? msOf(merged.standAt) : msOf(merged.startAt);
    if (nowMs !== null && standMs !== null && nowMs - standMs > LAUF_RETENTION_MS) continue;
    out.laeufe[cronName] = merged;
  }
  // Harte Obergrenze gegen unkontrolliertes Wachstum (etwa durch einen fehlerhaften
  // oder fremden Patch mit erfundenen Cron-Namen): die ältesten Datensätze fallen weg.
  const laufNamen = Object.keys(out.laeufe);
  if (laufNamen.length > MAX_LAUF_CRONS) {
    laufNamen
      .sort((x, y) => (msOf(out.laeufe[y].standAt) || 0) - (msOf(out.laeufe[x].standAt) || 0))
      .slice(MAX_LAUF_CRONS)
      .forEach((name) => { delete out.laeufe[name]; });
  }
  return out;
}

// Entfernt ein Mandat vollständig aus dem Fairnesszustand (DSGVO-Löschung/Teardown) —
// einschließlich seiner Spur im Laufdatensatz (Kennung in `geplant`/`blockiert`/`ausgaenge`).
function withoutTenant(state, tenantId) {
  const normalized = normalizeState(state);
  if (!tenantId) return normalized;
  const id = String(tenantId);
  for (const bucket of Object.values(normalized.crons)) delete bucket[id];
  for (const lauf of Object.values(normalized.laeufe)) {
    lauf.geplant = lauf.geplant.filter((x) => x !== id);
    lauf.blockiert = lauf.blockiert.filter((x) => x !== id);
    delete lauf.ausgaenge[id];
  }
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
    // VORRANG DER REALEN MANDATE (Sprint 02.09.). Diese Ordnung entscheidet, wer
    // in einem Lauf mit hartem Zeitbudget ueberhaupt noch drankommt. Bei 5 realen
    // und 495 synthetischen Mandaten wuerde die reine Wartezeit-Ordnung ein reales
    // Mandat regelmaessig ans Ende schieben — der Lauf endet dann am Zeitbudget,
    // bevor es bearbeitet ist. Reale Mandate stehen deshalb vor synthetischen.
    // STRUKTURELL WIRKUNGSLOS bei homogener Mandatsmenge (heutiger Stand: 0
    // synthetische Zeilen) — dort ist `aReal === bReal` fuer jedes Paar und die
    // bisherige Ordnung entscheidet unveraendert weiter.
    const aReal = mandatsklasse.klassifiziereMandat(a.politicianId) !== mandatsklasse.KLASSE_SYNTHETISCH;
    const bReal = mandatsklasse.klassifiziereMandat(b.politicianId) !== mandatsklasse.KLASSE_SYNTHETISCH;
    if (aReal !== bReal) return aReal ? -1 : 1;
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

// --- Laufdatensatz: Patches, Ableitung, Rekonstruktion (R-6) ----------------------------------
//
// Alle Patches tragen NUR `laeufe` (bzw. werden mit einem `crons`-Patch zu EINEM
// Schreibvorgang zusammengelegt). Ein reiner `laeufe`-Patch fasst die Buchführung je Mandat
// deshalb nicht an — genau das braucht der Fall „verweigerte Sperre": sichtbarer Ausgang,
// aber KEIN Abschluss-Schreibvorgang am Mandatseintrag (§3a.1 der Doku).

function laufPatch(cronName, lauf) {
  return { version: FAIRNESS_VERSION, laeufe: { [cronName]: lauf } };
}

// Laufbeginn: Planung ist entschieden, noch kein Mandat begonnen. Ab hier ist `geplant`
// persistent — auch dann, wenn der Prozess mitten im ERSTEN (längsten) Mandat stirbt.
function laufStartPatch({
  cronName, laufId, startAt, nowMs = Date.now(), aktive = 0,
  geplant = [], blockiert = [], zustandGeladen = true, zustandFehler = null
} = {}) {
  const ausgaenge = {};
  for (const tenantId of kennungsListe(blockiert)) ausgaenge[tenantId] = AUSGANG_LAEUFT_BEREITS;
  return laufPatch(cronName, {
    laufId,
    status: LAUF_LAUFEND,
    startAt: new Date(startAt).toISOString(),
    standAt: new Date(nowMs).toISOString(),
    aktive,
    geplant,
    blockiert,
    ausgaenge,
    zustandGeladen,
    zustandFehler
  });
}

// Ein Mandatsübergang. Wird — wo immer möglich — mit dem ohnehin fälligen Claim- bzw.
// Abschluss-Schreibvorgang zu EINEM Schreibvorgang zusammengelegt (kein zusätzliches IO).
function laufAusgangPatch({ cronName, laufId, startAt, tenantId, ausgang, nowMs = Date.now() } = {}) {
  return laufPatch(cronName, {
    laufId,
    status: LAUF_LAUFEND,
    startAt: startAt === null || startAt === undefined ? null : new Date(startAt).toISOString(),
    standAt: new Date(nowMs).toISOString(),
    ausgaenge: { [tenantId]: ausgang }
  });
}

// Regulärer Abschluss des Mehrmandantenlaufs. `teilweise` genau dann, wenn mindestens ein
// GEPLANTES Mandat aus Zeitmangel nicht begonnen wurde — der operativ entscheidende
// Unterschied. Abgewiesene Mandate (fremder Lauf/Sperre) sind kein Rückstand dieses Laufs.
function laufAbschlussPatch({
  cronName, laufId, startAt, nowMs = Date.now(), zeitbudget = [], kapazitaet = 0,
  obergrenzeLaeufe = null, naechstesMandat = null, zustandGeladen = true, zustandFehler = null
} = {}) {
  const offen = kennungsListe(zeitbudget);
  const ausgaenge = {};
  for (const tenantId of offen) ausgaenge[tenantId] = AUSGANG_ZEITBUDGET;
  return laufPatch(cronName, {
    laufId,
    status: offen.length ? LAUF_TEILWEISE : LAUF_ABGESCHLOSSEN,
    startAt: new Date(startAt).toISOString(),
    standAt: new Date(nowMs).toISOString(),
    beendetAt: new Date(nowMs).toISOString(),
    ausgaenge,
    kapazitaet,
    obergrenzeLaeufe,
    naechstesMandat,
    zustandGeladen,
    zustandFehler
  });
}

// Vermerk des ÄUSSEREN Zeitlimits. Er behauptet NICHT, dass die ursprüngliche Promise
// beendet wurde — `withTimeout` ist ein `Promise.race` und beendet nichts. Er hält allein
// fest: „zu diesem Zeitpunkt hatte der Lauf noch nicht zurückgegeben." Schreibt der Lauf
// danach doch noch seinen Abschluss, hebt dieser den Zustand (LAUF_RANG), und der Vermerk
// bleibt als `aeusseresTimeoutAt` daneben stehen.
function laufTimeoutPatch({ cronName, laufId, startAt, nowMs = Date.now(), grund = "aeusseres-timeout" } = {}) {
  return laufPatch(cronName, {
    laufId,
    status: LAUF_ABGEBROCHEN,
    grund,
    startAt: startAt === null || startAt === undefined ? null : new Date(startAt).toISOString(),
    standAt: new Date(nowMs).toISOString(),
    aeusseresTimeoutAt: new Date(nowMs).toISOString()
  });
}

// ABGELEITETER Laufzustand. Ein `laufend`, das seit `staleMs` nicht mehr fortgeschrieben
// wurde, ist ein Prozessabbruch — kein laufender Lauf und erst recht kein Erfolg. Genau
// diese Ableitung verhindert, dass ein hart beendeter Lauf für immer „läuft noch" aussieht.
function laufStatus(lauf, { nowMs = Date.now(), staleMs = DEFAULT_STALE_CLAIM_MS } = {}) {
  const l = normalizeLauf(lauf);
  if (!l) return null;
  if (l.status !== LAUF_LAUFEND) return l.status;
  const standMs = msOf(l.standAt) !== null ? msOf(l.standAt) : msOf(l.startAt);
  if (standMs === null) return LAUF_LAUFEND;
  return nowMs - standMs >= staleMs ? LAUF_ABGEBROCHEN : LAUF_LAUFEND;
}

// Rechnet die vollständige Fairness-Telemetrie EINES Laufs aus den persistenten
// Zwischenständen nach — die Antwort auf R-6: die Zeile `[cron/*/fairness]` ist nicht mehr
// die einzige vollständige Quelle. Reine Funktion, kein IO.
function rekonstruiereLauf(state, cronName, { nowMs = Date.now(), staleMs = DEFAULT_STALE_CLAIM_MS } = {}) {
  const normalized = normalizeState(state);
  const lauf = normalized.laeufe ? normalized.laeufe[cronName] : null;
  if (!lauf) return null;
  const mitAusgang = (wert) => Object.entries(lauf.ausgaenge)
    .filter(([, v]) => v === wert)
    .map(([id]) => id);
  const begonnen = Object.entries(lauf.ausgaenge)
    .filter(([, v]) => AUSGANG_ZAEHLT_ALS_BEGONNEN.has(v))
    .map(([id]) => id);
  // Nicht begonnen = geplant, aber ohne jeden Ausgang. Das deckt beide Wege ab: durch das
  // Zeitbudget ausgelassen (mit Vermerk) und nie erreicht (Prozessabbruch, ohne Vermerk).
  const ohneAusgang = lauf.geplant.filter((id) => !lauf.ausgaenge[id]);
  const zeitbudget = mitAusgang(AUSGANG_ZEITBUDGET);
  const kapazitaet = begonnen.length;
  const grenze = fairnessBound(lauf.geplant.length, kapazitaet);
  const abgeleitet = laufStatus(lauf, { nowMs, staleMs });
  return {
    cronName,
    laufId: lauf.laufId,
    status: abgeleitet,
    gemeldeterStatus: lauf.status,
    vollstaendig: Boolean(lauf.beendetAt),
    grund: lauf.grund,
    startAt: lauf.startAt,
    standAt: lauf.standAt,
    beendetAt: lauf.beendetAt,
    aeusseresTimeoutAt: lauf.aeusseresTimeoutAt,
    aktive: lauf.aktive,
    geplant: lauf.geplant,
    begonnen,
    erfolgreich: mitAusgang(AUSGANG_ERFOLG),
    fehlgeschlagen: mitAusgang(AUSGANG_FEHLER),
    // Begonnen, aber ohne Abschluss-Schreibvorgang: der Lauf wurde hier abgebrochen.
    // Bewusst NICHT als Erfolg und NICHT als Fehler gedeutet.
    ohneAbschluss: mitAusgang(AUSGANG_BEGONNEN),
    laeuftBereits: mitAusgang(AUSGANG_LAEUFT_BEREITS).concat(mitAusgang(AUSGANG_SPERRE_VERWEIGERT)),
    sperreVerweigert: mitAusgang(AUSGANG_SPERRE_VERWEIGERT),
    zeitbudget,
    nichtBegonnen: ohneAusgang.concat(zeitbudget).filter((id, i, alle) => alle.indexOf(id) === i),
    kapazitaet,
    obergrenzeLaeufe: Number.isFinite(grenze) ? grenze : null,
    ohneFortschritt: lauf.geplant.length > 0 && kapazitaet === 0,
    // Was der Lauf SELBST am Ende gemeldet hat (fehlt, wenn er nie zurückkehrte) —
    // damit sich Rekonstruktion und Meldung gegeneinander prüfen lassen.
    gemeldeteKapazitaet: lauf.beendetAt ? lauf.kapazitaet : null,
    gemeldeteObergrenzeLaeufe: lauf.beendetAt ? lauf.obergrenzeLaeufe : null,
    naechstesMandat: lauf.naechstesMandat,
    zustandGeladen: lauf.zustandGeladen,
    zustandFehler: lauf.zustandFehler
  };
}

// Vermerk einer festgestellten ABWEICHUNG zwischen gemeldeter und persistierter Wahrheit.
// Hebt den Laufzustand NICHT (LAUF_LAUFEND ist der niedrigste Rang) und fasst keinen
// Ausgang an — er schreibt allein die Tatsache, dass beide Sichten auseinanderfielen.
function laufAbweichungPatch({ cronName, laufId, startAt, nowMs = Date.now(), abweichung = "" } = {}) {
  return laufPatch(cronName, {
    laufId,
    status: LAUF_LAUFEND,
    startAt: startAt === null || startAt === undefined ? null : new Date(startAt).toISOString(),
    standAt: new Date(nowMs).toISOString(),
    zustandFehler: `persistenz-abweichung: ${abweichung}`.slice(0, 200)
  });
}

// --- Gegenprobe: stimmt die gemeldete Telemetrie mit der ABLAGE überein? (F-CAS) --------------
//
// Die Protokollzeile `[cron/*/fairness]` entsteht aus dem, was DIESER Lauf getan hat. Ob es
// auch in der Ablage steht, war bisher nirgends geprüft — genau deshalb konnte am 2026-08-02
// ein Lauf `erfolgreich=6` melden, während die Zeile nur fünf Abschlüsse trug (ein
// überlappender Cron hatte den sechsten beim Zurückschreiben gelöscht). Diese Funktion
// vergleicht beides und benennt jede Abweichung; sie erfindet nichts und repariert nichts.
//
// Reine Funktion, kein IO. Gemeldet werden nur pseudonyme Kennungen und Statuswörter.
function persistenzAbweichungen({
  stand,
  cronName,
  laufId,
  runId = null,
  startedMs = null,
  erfolgreich = [],
  fehlgeschlagen = [],
  kapazitaet = 0,
  nowMs = Date.now(),
  staleMs = DEFAULT_STALE_CLAIM_MS
} = {}) {
  const normalized = normalizeState(stand);
  const lauf = (normalized.laeufe || {})[cronName] || null;
  if (!lauf) return ["laufdatensatz-fehlt"];
  if (lauf.laufId !== laufId) {
    // Ein NEUERER Lauf desselben Crons darf den Datensatz ersetzen — je Cron gibt es
    // bewusst nur den letzten (§11.5). Ein ÄLTERER darf es nicht: das wäre ein Rückfall.
    const fremdMs = msOf(lauf.startAt);
    const eigenMs = startedMs === null ? null : Number(startedMs);
    if (fremdMs === null || eigenMs === null || fremdMs < eigenMs) return [`laufdatensatz-zurueckgefallen:${lauf.laufId}`];
    return [];
  }
  const abweichungen = [];
  const nach = rekonstruiereLauf(normalized, cronName, { nowMs, staleMs });
  const istErfolg = new Set(nach.erfolgreich);
  const istFehler = new Set(nach.fehlgeschlagen);
  for (const tenantId of erfolgreich) {
    if (!istErfolg.has(tenantId)) abweichungen.push(`ausgang:${tenantId}:${lauf.ausgaenge[tenantId] || "-"}`);
    const eintrag = entryOf(normalized, cronName, tenantId);
    // Hat inzwischen ein FREMDER Lauf das Mandat übernommen (andere Laufkennung), ist das
    // kein Verlust dieses Laufs — dann schweigt die Prüfung bewusst.
    if (!eintrag) abweichungen.push(`buchfuehrung:${tenantId}:fehlt`);
    else if ((!runId || eintrag.letzteLaufkennung === runId) && eintrag.status !== STATUS_ERFOLG) {
      abweichungen.push(`buchfuehrung:${tenantId}:${eintrag.status || "-"}`);
    }
  }
  for (const tenantId of fehlgeschlagen) {
    if (!istFehler.has(tenantId)) abweichungen.push(`ausgang:${tenantId}:${lauf.ausgaenge[tenantId] || "-"}`);
  }
  if (nach.kapazitaet !== kapazitaet) abweichungen.push(`kapazitaet:${nach.kapazitaet}!=${kapazitaet}`);
  return abweichungen;
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

  // LAUFPROTOKOLL (R-6). Eine stabile Kennung ist Pflicht, damit ein späterer Vermerk
  // (etwa aus dem äußeren Timeout-Catch) denselben Lauf trifft und keinen fremden.
  // Ohne übergebene Kennung wird sie DETERMINISTISCH abgeleitet — kein Zufall, damit die
  // Suite reproduzierbar bleibt.
  const laufId = runId ? String(runId).slice(0, 120) : `${cronName}-${startedMs}`;

  for (const eintrag of planung.blockiert) {
    results.push({ politicianId: eintrag.politicianId, skipped: true, reason: "laeuft-bereits" });
    verlauf.push({ politicianId: eintrag.politicianId, ausgang: "laeuft-bereits" });
  }

  // EIN Schreibvorgang VOR dem ersten Mandat: ab hier sind Planung, aktive Mandatszahl und
  // die bereits abgewiesenen Mandate persistent. Das ist der Kern der R-6-Behebung — der
  // Fortschritt wird nicht erst am Ende protokolliert. Kostet zwei Rundläufe auf einer
  // ~4-KB-Zeile (~0,04 % des Zeitbudgets) und verschiebt kein Budget.
  await speichern(laufStartPatch({
    cronName,
    laufId,
    startAt: startedMs,
    nowMs: now(),
    aktive: planung.aktive,
    geplant: planung.order,
    blockiert: planung.blockiert.map((e) => e.politicianId),
    zustandGeladen,
    zustandFehler
  }));

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
    // Buchführung je Mandat UND Laufprotokoll in EINEM Schreibvorgang: der Ausgang
    // `begonnen` entsteht damit ohne zusätzliches IO, aber VOR der Verarbeitung. Stirbt der
    // Prozess im Mandat, bleibt es als begonnen-ohne-Abschluss sichtbar — nicht als Erfolg.
    const registrierung = await speichern(
      {
        ...claimPatch({ cronName, tenantId, runId, nowMs: versuchMs, vorher }),
        ...laufAusgangPatch({ cronName, laufId, startAt: startedMs, tenantId, ausgang: AUSGANG_BEGONNEN, nowMs: versuchMs })
      },
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
      // Eigener kleiner Schreibvorgang: hier folgt KEIN Abschluss, auf den sich der Ausgang
      // huckepack setzen könnte — ohne ihn bliebe im Protokoll ein `begonnen` stehen, das
      // nie eines war. Selten (nur bei überlappenden Läufen) und nur `laeufe`.
      await speichern(laufAusgangPatch({
        cronName, laufId, startAt: startedMs, tenantId, ausgang: AUSGANG_LAEUFT_BEREITS, nowMs: now()
      }));
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
    // VERWEIGERTE SPERRE IST KEINE VERARBEITUNG.
    // `runSourceCrawl` wirft nicht, wenn die Sperre `crawl-<mandat>` schon gehalten wird —
    // es liefert `{ skipped: true, reason: "already running" }`. Ohne diese Behandlung
    // schriebe der Abschluss einen ERFUNDENEN Erfolg (Erfolgszeitpunkt, Erfolgszähler,
    // Fehlerserie zurück auf 0), das Mandat zählte zur Kapazität `k` und die gemeldete
    // Obergrenze ceil(n/k) wäre zu optimistisch. Deshalb:
    //   - kein Abschluss-Schreibvorgang (kein Erfolg, kein Fehler — nichts ist geschehen)
    //   - nicht als begonnen zählen, also auch nicht in `k`
    //   - eigener, sichtbarer Ausgang statt eines normalen Versuchs
    // Der VERSUCHSVERMERK aus dem Claim bleibt bewusst stehen: er ist `laufend`, hält das
    // Mandat für weitere überlappende Läufe gesperrt und läuft nach `staleMs` kontrolliert
    // ab — danach steht das Mandat wieder vorn, weil sein Versuchszeitpunkt der älteste ist.
    if (erfolg && sperreVerweigert(ergebnis)) {
      begonnen.delete(tenantId);
      results.push({ politicianId: tenantId, ...ergebnis });
      verlauf.push({ politicianId: tenantId, ausgang: "laeuft-bereits", sperreVerweigert: true });
      // Nur `laeufe`, KEIN `crons`: der Mandatseintrag bleibt unangetastet (kein erfundener
      // Erfolg, kein erfundener Fehler — §3a.1). Der Ausgang ist trotzdem persistent und
      // bleibt von Erfolg und Fehler eindeutig getrennt.
      await speichern(laufAusgangPatch({
        cronName, laufId, startAt: startedMs, tenantId, ausgang: AUSGANG_SPERRE_VERWEIGERT, nowMs: now()
      }));
      continue;
    }
    // P29-1: ein ZURUECKGEGEBENES Fehler-/Timeout-Objekt wird wie ein geworfener
    // Fehler gebucht — sonst entstuende ein erfundener letzter Erfolg und eine
    // faelschlich zurueckgesetzte Fehlerserie in der Fairness-Buchfuehrung.
    const rueckgabeFehler = erfolg && ergebnisFehlgeschlagen(ergebnis);
    if (rueckgabeFehler) erfolg = false;
    const dauerMs = Math.max(0, now() - versuchMs);
    // Abschluss je Mandat + Laufprotokoll wieder in EINEM Schreibvorgang. Ein
    // zurückgegebenes Fehler-/Timeout-Objekt ist hier bereits als Fehlschlag gebucht
    // (P29-1) und wird deshalb auch im Protokoll NICHT als Erfolg geführt.
    await speichern({
      ...finishPatch({
        cronName,
        tenantId,
        runId,
        erfolg,
        startedMs: versuchMs,
        nowMs: versuchMs + dauerMs,
        vorher: entryOf(zustand, cronName, tenantId)
      }),
      ...laufAusgangPatch({
        cronName, laufId, startAt: startedMs, tenantId,
        ausgang: erfolg ? AUSGANG_ERFOLG : AUSGANG_FEHLER,
        nowMs: versuchMs + dauerMs
      })
    });
    if (erfolg) {
      results.push({
        politicianId: tenantId,
        ...(ergebnis && typeof ergebnis === "object" ? ergebnis : { result: ergebnis })
      });
      verlauf.push({ politicianId: tenantId, ausgang: "erfolgreich", dauerMs, versuchRegistriert: registriert });
    } else if (rueckgabeFehler) {
      // Das Ergebnisobjekt bleibt erhalten (Grund/Diagnose), wird aber sichtbar
      // als Fehlschlag markiert — kein stiller Verlust des Timeout-Grunds.
      results.push({ politicianId: tenantId, ...ergebnis, failed: true });
      verlauf.push({ politicianId: tenantId, ausgang: "fehlgeschlagen", ergebnisFehler: true, dauerMs, versuchRegistriert: registriert });
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
  const zeitbudgetListe = verlauf.filter((v) => v.ausgang === "zeitbudget").map((v) => v.politicianId);

  // ABSCHLUSS des Laufprotokolls. Erst dieser Schreibvorgang unterscheidet einen
  // ordentlich beendeten Lauf von einem abgebrochenen: bleibt er aus (äußeres Zeitlimit,
  // Prozessabbruch), bleibt der Datensatz `laufend` und wird beim Lesen als `abgebrochen`
  // abgeleitet. Er kann den Zustand also nie fälschlich auf „fertig" heben.
  const abschluss = await speichern(laufAbschlussPatch({
    cronName,
    laufId,
    startAt: startedMs,
    nowMs: now(),
    zeitbudget: zeitbudgetListe,
    kapazitaet,
    obergrenzeLaeufe: Number.isFinite(grenze) ? grenze : null,
    naechstesMandat: nachher.order[0] || null,
    zustandGeladen,
    zustandFehler
  }));

  // GEGENPROBE (F-CAS): stimmt das, was dieser Lauf gleich meldet, mit dem überein, was
  // wirklich in der Ablage steht? Der Vergleich läuft gegen den vom Speicher
  // zurückgegebenen Stand — nicht gegen die eigene Sicht, die sich sonst selbst bestätigen
  // würde. Seit dem bedingten Schreiben (Compare-and-Set) IST dieser Rückgabewert der
  // Zeileninhalt. Kein zusätzliches IO im Normalfall.
  const gemeldetErfolg = verlauf.filter((v) => v.ausgang === "erfolgreich").map((v) => v.politicianId);
  const gemeldetFehler = verlauf.filter((v) => v.ausgang === "fehlgeschlagen").map((v) => v.politicianId);
  const persistenzAbweichung = fair && abschluss.ok && abschluss.remote
    ? persistenzAbweichungen({
      stand: abschluss.remote,
      cronName,
      laufId,
      runId,
      startedMs,
      erfolgreich: gemeldetErfolg,
      fehlgeschlagen: gemeldetFehler,
      kapazitaet,
      nowMs: now(),
      staleMs
    })
    : [];
  if (persistenzAbweichung.length) {
    // Der Lauf darf jetzt nicht sauber aussehen. Beides wird gesetzt: der Fehlertext für
    // Protokoll und Systemfehler UND ein Vermerk in der Ablage selbst — sonst läse ein
    // späterer Leser (R-6-/29B-Nachweis) eine falsche Zeile ohne jeden Hinweis.
    const text = `persistenz-abweichung: ${persistenzAbweichung.join(",")}`.slice(0, 200);
    zustandFehler = zustandFehler ? `${zustandFehler}; ${text}`.slice(0, 200) : text;
    await speichern(laufAbweichungPatch({
      cronName, laufId, startAt: startedMs, nowMs: now(), abweichung: persistenzAbweichung.join(",")
    }));
  }

  return {
    results,
    zustandGeladen,
    zustandFehler,
    fairness: {
      cronName,
      laufId,
      // Der Zustand, den DIESER Lauf soeben persistiert hat — dieselbe Wahrheit, die ein
      // späterer Leser aus der Ablage rekonstruiert. Bei `HELMUT_CRON_FAIRNESS=off` gibt es
      // kein Zustands-IO und damit ehrlich `null` statt einer erfundenen Angabe.
      laufStatus: fair ? (laufStatus((zustand.laeufe || {})[cronName], { nowMs: now(), staleMs }) || LAUF_LAUFEND) : null,
      aktive: planung.aktive,
      geplant: planung.order,
      begonnen: [...begonnen],
      erfolgreich: verlauf.filter((v) => v.ausgang === "erfolgreich").map((v) => v.politicianId),
      fehlgeschlagen: verlauf.filter((v) => v.ausgang === "fehlgeschlagen").map((v) => v.politicianId),
      zeitbudget: zeitbudgetListe,
      laeuftBereits: verlauf.filter((v) => v.ausgang === "laeuft-bereits").map((v) => v.politicianId),
      // Teilmenge von `laeuftBereits`: hier hat nicht die Planung, sondern die SPERRE
      // abgewiesen — das Mandat war schon in Arbeit, als dieser Lauf es anfassen wollte.
      // Getrennt ausgewiesen, weil es der einzige Fall ist, in dem ein Versuchsvermerk
      // ohne Abschluss zurückbleibt.
      lockVerweigert: verlauf.filter((v) => v.sperreVerweigert === true).map((v) => v.politicianId),
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
      zustandFehler,
      // Leere Liste = die Ablage trägt genau das, was diese Zeile meldet. Nicht leer =
      // sie tut es NICHT, und das steht im Protokoll, im Systemfehler und in der Ablage.
      persistenzAbweichung
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
  LAUF_LAUFEND,
  LAUF_TEILWEISE,
  LAUF_ABGESCHLOSSEN,
  LAUF_ABGEBROCHEN,
  AUSGANG_BEGONNEN,
  AUSGANG_ERFOLG,
  AUSGANG_FEHLER,
  AUSGANG_LAEUFT_BEREITS,
  AUSGANG_SPERRE_VERWEIGERT,
  AUSGANG_ZEITBUDGET,
  MAX_LAUF_CRONS,
  MAX_LAUF_MANDATE,
  LAUF_RETENTION_MS,
  fairnessEnabled,
  staleClaimMs,
  tenantReserveMs,
  normalizeState,
  normalizeEntry,
  normalizeLauf,
  stateVersion,
  entryOf,
  mergeEntry,
  mergeLauf,
  mergeState,
  withoutTenant,
  tiebreak,
  planTenantOrder,
  fairnessBound,
  fremderHalter,
  claimPatch,
  finishPatch,
  laufStartPatch,
  laufAusgangPatch,
  laufAbschlussPatch,
  laufTimeoutPatch,
  laufAbweichungPatch,
  laufStatus,
  rekonstruiereLauf,
  persistenzAbweichungen,
  ergebnisFehlgeschlagen,
  runTenantsFairly
};
