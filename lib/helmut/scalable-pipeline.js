"use strict";

// Helmut — SKALIERBARER PFAD (OP-30): Scheduler und Worker ueber der Arbeitswarteschlange.
// =============================================================================================
// FLAGGRENZE — das Erste, was hier steht, weil es das Wichtigste ist:
//
//   `HELMUT_SCALABLE_PIPELINE` ist DEFAULT AUS und fail closed. Ohne ausdrueckliches `on`
//   wird von hier NICHTS aufgerufen. Der bestehende Cron-Pfad (`cronSchwererPfad` ->
//   `runCronForTenants` bzw. `runCronMitGlobalerPhase`) bleibt byte-gleich unberuehrt.
//   Es gibt in diesem Modul keinen Codepfad, der ohne gesetztes Flag externe Arbeit
//   ausloest — auch keinen Schattenlauf, auch keine Messung.
//
// KEINE DOPPELTE EXTERNE ARBEIT (Auftrag §13.4): der Riegel dafuer ist strukturell und nicht
// eine Absprache. `waehleVerarbeitungspfad()` liefert GENAU EINEN Pfad. Ist das Flag an, gibt
// es fuer die schweren Crons nur noch den Warteschlangenpfad; ist es aus, nur den bisherigen.
// Es existiert keine Konstellation, in der beide dieselbe Quelle abrufen.
//
// WAS DIESES MODUL BEWUSST NICHT TUT:
//   - Es schreibt KEINE V3-Funktion um. Handler rufen die unveraenderten Produktionsfunktionen
//     auf (`crawlAllSources`, `runUnderstandingShadow`, `runMatchingShadow`,
//     `runDecisionShadow`, `buildV3Briefing`). AUSNAHME seit Option B (Reparatursprint
//     2026-08-19): die Rohdokument-Persistenz des Warteschlangenpfads ist
//     `persistiereRohdokumenteWarteschlange` (relational, gebuendelt, ohne Blob) — der
//     Altpfad (`saveRawItems` + `persistRawDocumentsShadow`) bleibt fuer den Motor mit
//     Flag AUS byte-identisch bestehen.
//     Wo eine Bestandsfunktion nicht sicher wiederverwendbar ist, wird der Handler ehrlich als
//     `nicht-implementiert` gemeldet statt eine zweite Fachlogik zu bauen (Auftrag §6).
//   - Es aendert KEINE Cron-Zeit, KEIN Zeitbudget, KEIN Flag, KEINE Env.
//   - Es fuehrt KEINEN eigenen KI-Aufruf. Verstehen laeuft ueber den unveraenderten
//     V3-Pfad und damit ueber dessen unveraenderten globalen Deckel; das Lage-Narrativ
//     (fuenfter Auftragstyp `tenant_narrative`, E1) laeuft ueber die unveraenderte
//     Produktionsfunktion `lage.buildLageBriefing` und deren unveraenderte Gates.

const crypto = require("crypto");
// OP-30 CAS: nur die Flagpruefung (`casAktiv`) wird hier gebraucht — die Klassengrenze
// `verstehen` darf 1 nur ueberschreiten, wenn der atomare Vertrag aktiv ist.
const verstehenVertrag = require("./verstehen-vertrag");

// --- Flaggrenze -------------------------------------------------------------------------------

// Fail closed, exakt wie `vorgangskontext.kontextpfadEnabled`: nur eine ausdrueckliche Zusage
// schaltet ein; jeder andere Wert — leer, `off`, Tippfehler — bedeutet AUS.
function skalierbarerPfadAktiv(env = process.env) {
  const roh = String((env && env.HELMUT_SCALABLE_PIPELINE) || "").trim().toLowerCase();
  return roh === "on" || roh === "true" || roh === "1" || roh === "an";
}

// Genau EIN Pfad. Der Aufrufer bekommt eine Entscheidung, keine Menge.
function waehleVerarbeitungspfad(env = process.env) {
  return skalierbarerPfadAktiv(env)
    ? { pfad: "warteschlange", grund: "HELMUT_SCALABLE_PIPELINE" }
    : { pfad: "bestand", grund: "flag-aus" };
}

// ── EINREIHEN MIT ODER OHNE VERSANDABSICHT (OP-30-Zielarchitektur, 2026-08-13) ───────────────
// Der EINE Bauplatz der Enqueue-Wahl: ist der Dispatch aktiv (HELMUT_JOB_DISPATCH_MODE
// shadow/queue UND Warteschlange an), laeuft jedes Einreihen durch
// helmut_enqueue_job_mit_outbox — Auftrag und Versandabsicht entstehen in EINER
// Datenbanktransaktion. Ist er aus (Default), bleibt das Einreihen byte-identisch zum
// Bestand. Kein Handler und kein Planer trifft diese Wahl selbst.
function standardEnqueue(env = null) {
  return (auftrag) => {
    const wirksam = env || process.env;
    const dispatch = require("./job-dispatch");
    if (dispatch.dispatchAktiv(wirksam)) {
      return require("./storage").jobQueueEnqueueMitOutbox({
        ...auftrag, schemaVersion: dispatch.SCHEMA_VERSION
      });
    }
    return require("./storage").jobQueueEnqueue(auftrag);
  };
}

// ── VERTEILTE ARBEITSKLASSENGRENZEN (OP-30-Zielarchitektur, DEFAULT AUS, fail closed) ────────
// Prozesslokale Grenzen (Worker-Parallelitaet 1–8, Google-Gate 5/Prozess) addieren sich bei
// mehreren Instanzen unkontrolliert. Mit HELMUT_KLASSEN_GRENZEN=on belegt jede Arbeit einer
// Klasse VOR der Ausfuehrung einen datenbank-atomaren Slot (Migration 20260813,
// helmut_klasse_belege) und gibt ihn danach frei; Abstuerze heilen ueber die Slot-TTL.
// FAIL CLOSED in beide Richtungen: Flag aus -> Adapter null -> Verhalten byte-identisch;
// Flag an, aber Grenze nicht pruefbar (Migration fehlt, DB-Fehler) -> es wird NICHT
// gearbeitet, die Arbeit wird ehrlich zurueckgestellt (Auftrag §12.10).
const KLASSEN_STANDARD = Object.freeze({
  // Quellenabruf: identisch zum prozesslokalen Google-Gate (Parallelitaet 5) — die Grenze
  // wandert von "je Prozess" zu "gesamtes System", sie erhoeht nichts.
  quellenabruf: 5,
  // Verstehen: 1 = die heutige globale Serialisierung, jetzt ehrlich verteilt. Mehr als 1
  // ist NUR zusammen mit HELMUT_VERSTEHEN_KONKURRENZ (Vorgangswache) sicher.
  verstehen: 1,
  // Wecksignal-Verbraucher: wie viele Drain-Laeufe gleichzeitig (Selbstweck-Kette).
  "worker-drain": 1
});

function klassenGrenzenAktiv(env = process.env) {
  const roh = String((env && env.HELMUT_KLASSEN_GRENZEN) || "").trim().toLowerCase();
  return roh === "on" || roh === "true" || roh === "1" || roh === "an";
}

// HARTER RIEGEL FUER `verstehen` (OP-30 CAS): eine Klassengrenze groesser 1 ist nur mit dem
// ATOMAREN VERSTEHENSVERTRAG sicher. Vor diesem Sprint war das eine Kommentarzeile — jetzt
// ist es Code. Ohne HELMUT_VERSTEHEN_CAS wird die konfigurierte Zahl auf 1 GEKLEMMT und
// einmalig gemeldet: Konfiguration darf eine Sicherheitszusage nie aushebeln (und ein
// vergessenes Flag darf nicht in doppelte KI-Kosten muenden).
let verstehenGrenzeGemeldet = false;

function klassenMax(klasse, env = process.env) {
  const schluessel = `HELMUT_KLASSE_${String(klasse).toUpperCase().replace(/-/g, "_")}_MAX`;
  const roh = String((env && env[schluessel]) ?? "").trim();
  const n = Number(roh);
  const gewuenscht = (roh !== "" && Number.isFinite(n) && n > 0) ? Math.floor(n) : (KLASSEN_STANDARD[klasse] ?? 1);
  if (klasse === "verstehen" && gewuenscht > 1 && !verstehenVertrag.casAktiv(env)) {
    if (!verstehenGrenzeGemeldet) {
      verstehenGrenzeGemeldet = true;
      try {
        console.warn(`[klassen] HELMUT_KLASSE_VERSTEHEN_MAX=${gewuenscht} wird auf 1 geklemmt:`
          + " ohne HELMUT_VERSTEHEN_CAS gibt es keinen atomaren Verstehensvertrag"
          + " (Vormerkungen wuerden sich gegenseitig ueberschreiben).");
      } catch (_) { /* ignore */ }
    }
    return 1;
  }
  return gewuenscht;
}

function klassenAdapter({ env = process.env, owner = null, deps = {} } = {}) {
  if (!klassenGrenzenAktiv(env)) return null;
  const speicher = deps.klassenSpeicher || {
    belege: (o) => require("./storage").klasseBelege(o),
    // ERNEUERUNG (Korrekturlauf 2026-08-14/3): ein festes TTL ist nur dann eine echte
    // Grenze, wenn die Arbeit garantiert kuerzer ist. Externe Anbieteraufrufe sind das
    // nicht — wer laenger arbeitet, erneuert seinen Slot; scheitert die Erneuerung, hat
    // er die Grenze verloren und muss abbrechen.
    erneuere: async (slot, { ttlMs = 60000 } = {}) => {
      const r = await (deps.klasseErneuere || ((o) => storage.klasseErneuere(o)))({
        slot, owner, ttlMs
      }).catch(() => ({ verfuegbar: false }));
      return { erneuert: Boolean(r && r.verfuegbar !== false && r.erneuert === true) };
    },
    gebeFrei: (o) => require("./storage").klasseGebeFrei(o)
  };
  const wer = String(owner || `klassen-${crypto.randomUUID()}`);
  return {
    aktiv: true,
    belege: async (klasse, { ttlMs = 180000 } = {}) => {
      const antwort = await speicher.belege({
        klasse, max: klassenMax(klasse, env), ttlMs, owner: wer
      }).catch((error) => ({ verfuegbar: false, grund: bereinigeFehler(error) }));
      if (!antwort || antwort.verfuegbar === false) {
        return { erlaubt: false, grund: `grenze-nicht-verfuegbar:${(antwort && antwort.grund) || "unbekannt"}`, slot: null };
      }
      return {
        erlaubt: antwort.erlaubt === true,
        grund: antwort.erlaubt === true ? null : "klasse-voll",
        slot: antwort.slot || null,
        belegt: antwort.belegt
      };
    },
    gebeFrei: async (slot) => {
      if (!slot) return;
      await speicher.gebeFrei({ slot, owner: wer }).catch(() => null);
    }
  };
}

// ── FUENFTER AUFTRAGSTYP: das Lage-Narrativ ueber die Warteschlange (E1, 2026-08-09) ──────────
//
// ENTSCHEIDUNG E1 (Gruenderfreigabe nach PR #235): der einzige mandatsbezogene KI-Pfad —
// das Lage-Narrativ (`lage.buildLageBriefing`, bisher Cron `lage-briefing`, EIN Slot mit
// `maxDuration 300`) — wird als Auftragstyp `tenant_narrative` in die bestehende
// Warteschlange integriert. Kein paralleles System; der Handler ruft die UNVERAENDERTE
// Produktionsfunktion auf (Inhalt, Prompt, Modell und sichtbare Qualitaet bleiben identisch).
//
// DRITTES, EIGENES FLAG — und warum es sein MUSS (Auftrag §7: nur wenn eine unabhaengige
// sichere Kontrolle sonst unmoeglich ist — genau das ist hier der Fall):
//   1. Der Aktivierungsplan (op30-aktivierungsreife §8) schaltet die Warteschlange in
//      Stufe 2 mit 5 Mandaten scharf, E1 aber erst ab Stufe 5. Ohne eigenes Flag wuerde
//      `HELMUT_SCALABLE_PIPELINE=on` das Narrativ SOFORT mit umziehen — zwei Entscheidungen
//      an einem Schalter, bei einem Fehler nicht auswertbar (dieselbe Begruendung wie bei
//      `HELMUT_LLM_FAIRNESS`).
//   2. Der Rueckweg muss unabhaengig sein: ein Fehler im Narrativpfad darf ohne Abschaltung
//      der gesamten Warteschlange zuruecknehmbar sein — Flag `off` + Redeploy stellt den
//      bisherigen Cron-Direktpfad wieder her, die uebrigen vier Auftragstypen laufen weiter.
//
// Fail closed wie alle OP-30-Flags: nur eine ausdrueckliche Zusage schaltet ein.
function narrativFlagAktiv(env = process.env) {
  const roh = String((env && env.HELMUT_NARRATIV_QUEUE) || "").trim().toLowerCase();
  return roh === "on" || roh === "true" || roh === "1" || roh === "an";
}

// Wirksam ist der fuenfte Auftragstyp NUR mit BEIDEN Flags: ohne Warteschlange gibt es
// niemanden, der ihn plant oder abarbeitet — ein einzeln gesetztes `HELMUT_NARRATIV_QUEUE`
// ist vollstaendig wirkungslos (keine teilweise Aktivierung, Auftrag §7.2).
function narrativUeberWarteschlange(env = process.env) {
  return skalierbarerPfadAktiv(env) && narrativFlagAktiv(env);
}

// --- Fehlerbereinigung ------------------------------------------------------------------------

// Was in `last_error` landen darf. Der Auftrag verlangt: keine Geheimnisse, keine
// vollstaendigen externen Antworten, keine unnoetigen personenbezogenen Inhalte.
// Vorgehen: erst maskieren, dann kappen. Die Reihenfolge ist wichtig — ein gekappter
// Token waere immer noch ein Teiltoken.
const GEHEIMNIS_MUSTER = [
  // Bearer-/Basic-Token, JWTs, API-Keys, Supabase-/OpenAI-Schluessel, Query-Secrets
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi,
  /\beyJ[A-Za-z0-9._-]{20,}/g,                       // JWT
  /\bsk-[A-Za-z0-9_-]{16,}/g,                        // OpenAI-artig
  /\bsb[a-z]*_[A-Za-z0-9_-]{16,}/gi,                 // Supabase-artig
  // BELEGTER FEHLER (gefunden von jobqueue-sicherheit-test.js 8.1): die erste Fassung
  // verlangte den Parameternamen EXAKT — `?key=` wurde maskiert, `?service_key=` nicht.
  // Genau die zusammengesetzten Namen sind aber die haeufigen (`service_key`, `apikey`,
  // `access_token`, `anon_key`). Deshalb ist jetzt ein beliebiges Wortpraefix erlaubt.
  /([?&][\w.-]*(?:secret|token|key|password|passwd|pwd|signature|credential)=)[^&\s"']+/gi,
  /("?[\w.-]*(?:secret|token|key|password|authorization|credential)"?\s*[:=]\s*"?)[^\s",}]{6,}/gi
];

function bereinigeFehler(roh, maxLaenge = 300) {
  let text = roh instanceof Error ? String(roh.message || roh) : String(roh == null ? "" : roh);
  if (!text) return null;
  for (const muster of GEHEIMNIS_MUSTER) {
    // ACHTUNG (belegter Fehler, beim ersten Smoke-Test gefunden): bei einem Muster OHNE
    // Fanggruppe ist das zweite Callback-Argument der OFFSET (eine Zahl), nicht die Gruppe.
    // Ein blosses `praefix ? …` haette die Trefferstelle in den Text geschrieben
    // ("13<entfernt>"). Deshalb wird ausdruecklich auf `string` geprueft.
    text = text.replace(muster, (treffer, praefix) =>
      (typeof praefix === "string" ? `${praefix}<entfernt>` : "<entfernt>"));
  }
  // Absolute URLs mit Zugangsdaten im Autoritaetsteil.
  text = text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, "$1<entfernt>@");
  // Mehrzeilige Stacktraces auf die erste Zeile reduzieren: der Rest ist Dateisystempfad-Rauschen.
  text = text.split("\n")[0].trim();
  return text.length > maxLaenge ? `${text.slice(0, maxLaenge)}…` : text;
}

// Vorübergehend oder endgueltig? Vorübergehende Fehler bekommen Backoff, endgueltige nicht.
// Konservativ: im Zweifel VORUEBERGEHEND, damit ein unbekannter Fehler nicht sofort einen
// Auftrag verbrennt. Die Versuchsobergrenze faengt den Dauerfall ohnehin ab.
function istEndgueltig(fehlertext) {
  // `budget-dauerhaft-erschoepft` (Befund O4) gehoert ausdruecklich hierher: nach der
  // Wartefrist ist weiteres Wiederholen keine Fehlerbehandlung mehr, sondern Leerlauf.
  // Endgueltig heisst hier NICHT "fuer immer verloren" — die Wiedervorlage (Befund O5)
  // holt solche Auftraege begrenzt oft zurueck.
  // `narrativ-nicht-moeglich` (fuenfter Auftragstyp): der zugrunde liegende Zustand
  // (V3-Ablage abgeschaltet, kein Profil) erledigt sich nicht durch Wiederholen.
  // `…-uebersprungen-dauerhaft`: ein V3-Lauf, der laenger als die Budgetwartefrist
  // uebersprungen wurde (Sperre, abgeschalteter Pfad), ist ein Zustand, kein Warten —
  // dieselbe Obergrenzen-Logik wie `budget-dauerhaft-erschoepft`.
  return /unbekannter-aufgabentyp|payload-ungueltig|nicht-implementiert|profil-nicht-gefunden|budget-dauerhaft-erschoepft|narrativ-nicht-moeglich|verstehen-uebersprungen-dauerhaft|projektion-uebersprungen-dauerhaft/i
    .test(String(fehlertext || ""));
}

// Exponentieller Backoff mit stabiler Streuung (kein Math.random: der Test muss ihn
// nachrechnen koennen). Streuung aus der Auftrags-ID — verhindert, dass 1000 gleichzeitig
// gescheiterte Auftraege synchron wiederkommen.
function backoffMs(versuche, auftragsId, { basisMs = 30000, deckelMs = 30 * 60 * 1000 } = {}) {
  const n = Math.max(1, Number(versuche) || 1);
  const roh = Math.min(deckelMs, basisMs * Math.pow(2, n - 1));
  const streu = crypto.createHash("sha256").update(String(auftragsId || "x"), "utf8").digest().readUInt32BE(0);
  // Halb fest, halb gestreut (dasselbe Muster wie google-news-hardening.computeRetryDelayMs).
  return Math.floor(roh / 2 + (streu % Math.max(1, Math.floor(roh / 2))));
}

// Zeitgrenze EINES Auftrags. Ohne sie kann der Worker sein Laufzeitbudget nicht halten:
// `crawlAllSources` hat je EINZELNER Anfrage ein Timeout (`CRAWLER_TIMEOUT_MS`), aber KEINE
// Gesamtgrenze — belegt in docs/betrieb/vorgangskontext.md §7.6 (Befund F-REQ: einzelne
// Production-Quellen liefen 41 892 ms bei 7 000 ms Anfragelimit und `retry_count = 0`, weil
// eine Google-Quelle eine Kette von 37–98 Anfragen ausloest). Ein einziger haengender Auftrag
// wuerde sonst den ganzen Slot verbrauchen.
//
// EHRLICHE GRENZE, ausdruecklich: `Promise.race` BEENDET die urspruengliche Promise nicht
// (dieselbe Einschraenkung wie beim aeusseren Cron-Zeitlimit, R-6). Der Auftrag laeuft im
// Hintergrund weiter; der Worker gibt ihn aber NICHT als erledigt aus, sondern als
// voruebergehend gescheitert — die Lease laeuft aus und der Auftrag kehrt zurueck.
const AUFTRAG_MAX_MS = Math.max(5000, Number(process.env.HELMUT_JOB_TIMEOUT_MS) || 120000);

// ── EIGENE ZEITGRENZE JE AUFGABENTYP (Kapazitaetssprint 2026-08-09) ─────────────────────────
// WARUM: 120 s sind fuer einen QUELLENABRUF richtig (eine Personenquelle loest eine Kette von
// 37–98 Anfragen aus, Befund F-REQ) — fuer ein LAGE-NARRATIV sind sie zu grosszuegig. Ein
// Morgenslot hat 230 s Arbeitsbudget je Worker; ein einziger haengender Narrativauftrag
// verbraucht davon mehr als die Haelfte, und der Wiederholungslauf noch einmal so viel.
//
// DIE MESSUNG, DIE DEN WERT BEGRUENDET (Production, `llmUsage`, n = 134, 2026-07-10 bis
// 2026-08-09, rein lesend erhoben): Median 5 033 ms · p90 7 765 ms · p95 32 201 ms ·
// Maximum 471 985 ms. Entscheidend ist NICHT das Perzentil, sondern der Zusammenhang mit dem
// Ausgang: von den sieben Aufrufen ueber 21 s ist KEIN EINZIGER erfolgreich gewesen
// (20 004 / 32 201 / 63 704 / 71 189 / 171 730 / 207 215 / 450 867 / 471 985 ms — alle
// `success:false`), der langsamste ERFOLGREICHE Aufruf lag bei 20 012 ms. Ein Narrativ, das
// laenger als ~21 s braucht, ist in der gemessenen Geschichte nie fertig geworden.
//
// 45 000 ms sind daher mit Absicht mehr als das Doppelte des langsamsten je erfolgreichen
// Aufrufs: die Grenze kostet in der gemessenen Reihe KEIN einziges Narrativ und nimmt einem
// haengenden Auftrag 75 s Slotzeit ab. Sie kann nur SENKEN, nie erhoehen (`Math.min`), und
// ist ueber `HELMUT_NARRATIV_TIMEOUT_MS` verstellbar.
//
// WIRKT NUR IM WARTESCHLANGENPFAD. Der Altpfad (Cron-Direktschleife) kennt diese Grenze
// nicht und bleibt unveraendert.
const TYP_ZEITGRENZE_MS = Object.freeze({
  tenant_narrative: Math.max(5000, Number(process.env.HELMUT_NARRATIV_TIMEOUT_MS) || 45000)
});

function typZeitgrenze(typ) {
  const eigen = TYP_ZEITGRENZE_MS[String(typ || "")];
  return Number.isFinite(eigen) && eigen > 0 ? Math.min(AUFTRAG_MAX_MS, eigen) : AUFTRAG_MAX_MS;
}

function mitZeitgrenze(promise, maxMs, kennung) {
  let zeiger = null;
  const wecker = new Promise((_, ablehnen) => {
    zeiger = setTimeout(() => ablehnen(new Error(`auftrag-zeitlimit (${kennung}, ${maxMs} ms)`)), maxMs);
  });
  return Promise.race([promise, wecker]).finally(() => { if (zeiger) clearTimeout(zeiger); });
}

// --- Scheduler --------------------------------------------------------------------------------

// Der Scheduler PLANT nur. Er fuehrt keinen schweren externen Abruf aus (Auftrag §8) und
// gibt ehrliche Zaehler zurueck.
async function planeArbeit({
  deps = {},
  jetztMs = Date.now(),
  env = process.env,
  // ABSOLUTES Ende der Planungsphase. Die Grenze sitzt bewusst IN der seriellen
  // Einreiheschleife und nicht als Promise.race beim Aufrufer: Promise.race beendet
  // den Planer nicht. Der alte Aufruf konnte deshalb bereits `neu: 0` melden, waehrend
  // dieselbe Planungs-Promise im Hintergrund weiter Auftraege schrieb. Hier wird ein
  // bereits gestartetes (im Produktionsadapter selbst zeitbegrenztes) Einreihen noch
  // abgewartet; danach beginnt garantiert kein weiterer Schreibvorgang.
  planungsDeadlineMs = null
} = {}) {
  if (!skalierbarerPfadAktiv(env)) {
    return { uebersprungen: true, grund: "flag-aus", geplant: 0, neu: 0, vorhanden: 0 };
  }
  const sourceDemand = deps.sourceDemand || require("./source-demand");
  const listFullProfiles = deps.listFullProfiles || (() => require("./storage").listFullProfiles());
  const quellenFuerProfil = deps.quellenFuerProfil || ((p) => require("./scheduler").getSourcesForProfile(p));
  // Zielarchitektur: mit aktivem Dispatch entstehen Auftrag UND Versandabsicht atomar.
  const enqueue = deps.enqueue || standardEnqueue(env);

  const alleProfile = await listFullProfiles();
  // AKTIVE Profile. KEINE Obergrenze, kein `slice` (Auftrag §7.12): wer aktiv ist, wird geplant.
  //
  // BELEGTER FEHLER (Abschlussreview 2026-08-08): hier stand `p.disabled !== true`. Ein
  // Mandatsprofil traegt aber gar kein Feld `disabled` — das gibt es nur am ERGEBNIS von
  // `profile-validation.validateProfile`. `p.disabled` war also immer `undefined`, die
  // Bedingung immer wahr, und der Scheduler haette JEDES Profil geplant: auch die
  // deaktivierten (`profileActive === false`) und die soft-geloeschten (`deletedAt` /
  // `geloescht_at`). In Production sind das heute drei von acht Profilen — es waeren also
  // Personensuchen, Projektionen und Briefings fuer Mandate entstanden, die der Betreiber
  // ausdruecklich abgeschaltet hat (und deren m5-Mandatswahrheit OP-25 absichert).
  // Verbindlich ist das Praedikat des Projekts, nicht ein eigenes.
  const { isDisabled } = deps.profilPruefung || require("./profile-validation");
  const profile = (Array.isArray(alleProfile) ? alleProfile : [])
    .filter((p) => p && p.id && !isDisabled(p));

  // ── TAGESPLAN UND ROTATION (OP-30, Befund O1) ────────────────────────────────────────────
  // `llm-budget-fair` war gebaut, getestet und im Produktionspfad UNBENUTZT: weder
  // `tagesplan` noch `rotationsReihenfolge` noch `mandantenDeckel` wurden je aufgerufen, und
  // `scopeMax` war immer `null`. Damit war die Zusage "faire Rotation" eine Behauptung.
  //
  // Hier wird sie eingeloest. Der Tagesplan entscheidet NICHT, wer geplant wird — es wird
  // weiterhin jedes aktive Mandat geplant. Er liefert die REIHENFOLGE des Tages, und die
  // wandert taeglich. Der Rest (Faelligkeit im Phasenfenster) haengt daran.
  //
  // Die Schrittweite der Rotation kommt aus `tagesplan` selbst: reicht das Budget fuer alle,
  // ist die Reihenfolge stabil (dann verhungert auch niemand); reicht es NICHT, wandert sie
  // um genau die Zahl der Plaetze weiter — nach `ceil(n / Plaetze)` Tagen war jedes Mandat
  // einmal vorn (Nachweis: `llm-budget-fair.bedienteMandateUeberTage`).
  const fair = deps.fair || require("./llm-budget-fair");
  const mandatsIds = profile.map((p) => String(p.id));
  const tagesplan = fair.tagesplan({
    mandate: mandatsIds,
    deckel: globalerTagesdeckel(env),
    tag: fair.tagesSchluessel(jetztMs),
    env
  });

  const bedarf = await sourceDemand.kompiliereQuellenbedarf({
    profile, quellenFuerProfil, jetztMs, env, rotation: tagesplan.reihenfolge
  });
  const mandatsarbeit = sourceDemand.planeMandatsarbeit({
    profile, jetztMs, env, rotation: tagesplan.reihenfolge,
    // FUENFTER AUFTRAGSTYP (E1): nur mit BEIDEN Flags werden `tenant_narrative`-Auftraege
    // geplant. Ohne das Narrativflag ist der Plan byte-gleich zu vorher — der bisherige
    // Cron `lage-briefing` bleibt der einzige Narrativpfad (kein Doppelpfad, Auftrag §7.6).
    narrativAktiv: narrativUeberWarteschlange(env)
  });
  const alle = [...bedarf.auftraege, ...mandatsarbeit.auftraege];

  let neu = 0;
  let vorhanden = 0;
  let nichtEingereiht = 0;
  let versucht = 0;
  const gruende = new Set();
  const uhr = typeof deps.now === "function" ? deps.now : Date.now;
  const planungsEnde = Number(planungsDeadlineMs);
  const hatPlanungsDeadline = Number.isFinite(planungsEnde) && planungsEnde > 0;
  for (const auftrag of alle) {
    // Keine neue Mutation mehr beginnen, sobald das Budget gerissen ist. Das gilt auch,
    // wenn Profil-/Quellenkompilierung bereits die ganze Planungszeit verbraucht hat.
    if (hatPlanungsDeadline && uhr() >= planungsEnde) break;
    const ergebnis = await enqueue(auftrag);
    versucht += 1;
    if (!ergebnis || ergebnis.verfuegbar === false) {
      nichtEingereiht += 1;
      if (ergebnis && ergebnis.grund) gruende.add(String(ergebnis.grund));
      continue;
    }
    if (ergebnis.neu) neu += 1; else vorhanden += 1;
  }

  const ausstehend = Math.max(0, alle.length - versucht);
  const zeitbudgetErschoepft = ausstehend > 0
    && hatPlanungsDeadline
    && uhr() >= planungsEnde;

  return {
    uebersprungen: false,
    profile: profile.length,
    geplant: alle.length,
    neu,
    vorhanden,
    versucht,
    ausstehend,
    zeitbudgetErschoepft,
    ...(zeitbudgetErschoepft ? { grund: "planung-zeitbudget" } : {}),
    // EHRLICH: was nicht eingereiht werden konnte, wird benannt — nicht verschwiegen
    // (CLAUDE.md §4.4). Ein Scheduler, der 7000 Auftraege plant und 7000 stillschweigend
    // verliert, wuerde sonst wie ein erfolgreicher Lauf aussehen.
    nichtEingereiht,
    gruende: [...gruende],
    ok: nichtEingereiht === 0 && ausstehend === 0,
    bedarf: bedarf.statistik,
    fehlerhafteProfile: bedarf.fehlerhafteProfile,
    fenster: mandatsarbeit.fenster,
    // Der Tagesplan wird MITGEGEBEN, nicht nur benutzt: der Worker braucht ihn fuer die
    // Budgetdeckel (`scopeMax`), und der Betreiber soll die Rotation sehen koennen.
    tagesplan: tagesplanSicht(tagesplan, fair, mandatsIds.length, env)
  };
}

// Die EINE Form, in der ein Tagesplan den Worker erreicht. Bewusst als eigene Funktion,
// damit es nicht zwei Bauplaetze gibt: `planeArbeit` (schwere Crons) und
// `tagesplanFuerLauf` (Narrativslot) liefern dasselbe Objekt.
function tagesplanSicht(plan, fair, mandatsBedarf, env) {
  return {
    tag: plan.tag,
    mandate: plan.mandate,
    deckel: plan.deckel,
    plaetze: plan.reihenfolge.length,
    reihenfolge: plan.reihenfolge,
    reichtFuerAlleNotwendigen: plan.reichtFuerAlleNotwendigen,
    notwendigOffen: plan.notwendigOffen,
    zuteilung: plan.zuteilung,
    global: fair.globalerTopf({ deckel: plan.deckel, mandatsBedarf, env })
  };
}

// ── Tagesplan OHNE Planung (Befund R2, Abschlussreview PR #236) ─────────────────────────────
//
// BELEGTER FEHLER: der Cron `lage-briefing` startet im Narrativzweig einen Worker, uebergab
// ihm aber KEINEN Tagesplan. Damit war `scopeMax` in jeder Reservierung `null`, die SQL-
// Funktion uebersprang den Mandantenanteil vollstaendig (`p_scope <> 'global' and
// p_scope_max is not null`), `llm-budget-fair.mandantenDeckel` blieb unbenutzt und in
// `llm_budget_counters` entstand nicht eine einzige `tenant:<id>`-Zeile — der Betreiber
// haette den mandatsbezogenen KI-Verbrauch nirgends gesehen. Das ist exakt Befund O1, und
// zwar bei genau dem Verbraucher, fuer den O1 gebaut wurde. An echter PostgreSQL 16.13
// nachgemessen (Review 2026-08-09).
//
// Dieser Einstieg liefert den Tagesplan OHNE zu planen: er kompiliert keinen Quellenbedarf
// und reiht nichts ein — er liest die aktiven Profile und rechnet die Zuteilung. Das ist
// dieselbe eine Profilabfrage, die der Altpfad an dieser Stelle ohnehin machte.
//
// EHRLICH: schlaegt etwas fehl, gibt es `null` zurueck statt zu raten. Der Worker meldet
// das dann als `budgetSchicht: "ohne-tagesplan"` — kein stiller, erfundener Deckel.
async function tagesplanFuerLauf({ deps = {}, jetztMs = Date.now(), env = process.env } = {}) {
  if (!skalierbarerPfadAktiv(env)) return null;
  try {
    const listFullProfiles = deps.listFullProfiles || (() => require("./storage").listFullProfiles());
    const { isDisabled } = deps.profilPruefung || require("./profile-validation");
    const fair = deps.fair || require("./llm-budget-fair");
    const alle = await listFullProfiles();
    const mandatsIds = (Array.isArray(alle) ? alle : [])
      .filter((p) => p && p.id && !isDisabled(p))
      .map((p) => String(p.id));
    if (!mandatsIds.length) return null;
    const plan = fair.tagesplan({
      mandate: mandatsIds,
      deckel: globalerTagesdeckel(env),
      tag: fair.tagesSchluessel(jetztMs),
      env
    });
    return tagesplanSicht(plan, fair, mandatsIds.length, env);
  } catch (_) {
    return null;
  }
}

// Der globale KI-Tagesdeckel, wie ihn der Rest des Systems liest. EINE Wahrheit: derselbe
// fail-closed-Rueckfall (50) wie in `storage.js` und im Budgetadapter unten. Er wird hier
// ausschliesslich GELESEN — dieses Modul setzt keinen Deckel und hebt keinen an.
function globalerTagesdeckel(env = process.env) {
  const roh = String((env && env.HELMUT_MAX_LLM_CALLS_PER_DAY) ?? "").trim();
  const n = Number(roh);
  return roh !== "" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
}

// --- Handler ----------------------------------------------------------------------------------

// Jeder Handler bekommt (auftrag, deps) und liefert { ok, ... } oder wirft.
// Sie rufen ausschliesslich UNVERAENDERTE Bestandsfunktionen auf.

async function handleSourceFetch(auftrag, deps) {
  const quelle = auftrag && auftrag.payload && auftrag.payload.quelle;
  if (!quelle || !quelle.id) throw new Error("payload-ungueltig: quelle fehlt");

  // VERTEILTE KLASSENGRENZE (Auftrag §12, DEFAULT INERT): mit aktiven Klassengrenzen
  // belegt der Abruf einen systemweiten `quellenabruf`-Slot. Ist die Klasse voll oder
  // die Grenze nicht pruefbar, wird EHRLICH zurueckgestellt — kein Versuch verbraucht,
  // kein Abruf ohne Grenze (fail closed). Ohne Adapter: byte-identisches Verhalten.
  let klassenSlot = null;
  if (deps.klassen && typeof deps.klassen.belege === "function") {
    const freigabe = await deps.klassen.belege("quellenabruf");
    if (!freigabe || freigabe.erlaubt !== true) {
      return {
        ok: false, zurueckgestellt: true,
        grund: `klassengrenze-belegt: quellenabruf${freigabe && freigabe.grund ? ` (${freigabe.grund})` : ""}`
      };
    }
    klassenSlot = freigabe.slot;
  }
  try {

  // 1. Abruf — die unveraenderte Produktionsfunktion, mit derselben Google-Haertung.
  const hardening = deps.hardeningConfig();
  const gate = hardening.enabled ? deps.createGate(hardening, {}) : null;
  const bilanz = await deps.crawlAllSources([quelle], {
    googleGate: gate,
    cooldown: { active: false, skipGoogle: false, reason: null },
    hardeningConfig: hardening,
    // Das prozessweite Gedaechtnis geteilter Wege bleibt aktiv: es schadet nie und faengt
    // strukturgleiche Wege ab, die der Compiler bewusst nicht zusammengelegt hat.
    sharedLedger: hardening.enabled && hardening.sharedPathDedup ? deps.sharedLedger(hardening.sharedPathWindowMs) : null
  });

  const ergebnis = (bilanz.results || [])[0] || {};
  if (ergebnis.ok === false) {
    // Ein Abruffehler ist VORUEBERGEHEND (Drosselung, Timeout) -> Backoff, nicht endgueltig.
    throw new Error(ergebnis.error || "abruf-fehlgeschlagen");
  }

  // 2. OPTION B (Reparatursprint 2026-08-19): Rohitems werden KANONISCH RELATIONAL
  //    persistiert (`raw_documents`, gebuendelt, ignore-duplicates) — der Warteschlangenpfad
  //    fasst die zentralen Blob-Zeilen `main`/`main-auth` JE AUFTRAG NICHT MEHR an.
  //    Belegter Anlass: Row-Lock-Konvoi auf der 1,29-MB-Zeile `main` unter Parallelitaet 4
  //    (jeder Auftrag las UND schrieb die volle Zeile via `saveRawItems`), 0 von 193
  //    Auftraegen im Aktivierungslauf 18.08. 20:00 UTC — Runbook
  //    op30-aktivierung-5-mandate.md §27. Die NEU-Erkennung liegt jetzt in der relationalen
  //    Ablage selbst (`ignore-duplicates` + `return=representation` liefert exakt die neu
  //    eingefuegten Kennungen) statt in der Blob-Deduplizierung.
  const roh = bilanz.rawItems || [];
  const persistenz = roh.length
    ? await deps.persistRohdokumente(roh, { runId: auftrag.id })
    : { ok: true, neuIds: [], vorhandene: 0, anfragen: 0 };

  // ERFOLG WIRD GEGEN DIE ABLAGE GEPRUEFT (CLAUDE.md §4.10): gab es Dokumente, muss die
  // relationale Persistenz sie angenommen haben. Sonst ist der Auftrag NICHT erledigt —
  // der Fehler ist voruebergehend (Timeout, Netz) -> Backoff, kein Endzustand.
  if (roh.length && (!persistenz || persistenz.ok !== true)) {
    throw new Error("persistenz-fehlgeschlagen-oder-unbekannt"
      + `${persistenz && persistenz.grund ? `: ${String(persistenz.grund).slice(0, 160)}` : ""}`);
  }

  // LESESPIEGEL, NIE JE AUFTRAG: die Rohitems dieses Auftrags werden fuer den EINEN
  // Blob-Write am SLOTENDE gesammelt (`worker-betrieb.durchlauf` -> `blobSpiegel`) — der
  // Blob versorgt weiterhin Lage-Check (`getRawItemsSince`) und Admin-Zaehler. Ohne Sammler
  // (Direktaufruf `arbeite`, verwalteter Verbraucher) entfaellt der Spiegel ehrlich; die
  // kanonische relationale Ablage ist davon unabhaengig.
  let blobSpiegel = roh.length ? "kein-sammler" : "leer";
  if (roh.length && deps.blobSpiegel && typeof deps.blobSpiegel.sammle === "function") {
    try { deps.blobSpiegel.sammle(roh); blobSpiegel = "gesammelt"; } catch (_) { blobSpiegel = "sammler-fehler"; }
  }

  // 3. VERSTEHEN EINREIHEN — die Stufe, die bisher fehlte.
  //    Bis zu diesem Sprint erzeugte der Compiler `source_fetch`, `mandate_projection` und
  //    `briefing_materialization`, aber NIEMAND reihte `document_understanding` ein. Der
  //    Handler existierte und war getestet — er wurde nur nie aufgerufen. Damit endete der
  //    Warteschlangenpfad faktisch beim Rohdokument.
  //
  //    Der Schluessel ist der INHALT, nicht die Zeit: die Dokumentkennung ist `rd-<hash>`
  //    (siehe `dedup.toRawDocumentRow`), also ein Inhaltsfingerabdruck. Derselbe Artikel
  //    erzeugt morgen dieselbe Kennung, dieselbe Kennungsmenge denselben Auftragsschluessel —
  //    und `helmut_enqueue_job` legt ihn kein zweites Mal an. Ein Aktualitaetsfenster waere
  //    hier FALSCH: es wuerde denselben Artikel in jedem Fenster erneut zum Verstehen
  //    anmelden.
  const einreihen = typeof deps.enqueue === "function" ? deps.enqueue : null;
  let verstehensAuftraege = 0;
  let verstehenNeu = 0;
  let verstehenNichtEingereiht = 0;
  const nichtEingereihtGruende = new Set();
  // Die Kennungen kommen seit Option B direkt aus der relationalen Persistenz: es SIND
  // bereits die `rd-<hash>`-Kennungen, unter denen die Dokumente in `raw_documents` liegen
  // (`persistiereRohdokumenteWarteschlange` liefert exakt die neu eingefuegten Zeilen) —
  // dieselbe eine Kennungswahrheit wie zuvor ueber `rohdokumentKennungen`.
  const kennungen = [...new Set((persistenz.neuIds || []).map(String))].sort();
  if (einreihen && kennungen.length) {
    for (let i = 0; i < kennungen.length; i += UNDERSTANDING_BUENDEL) {
      const teil = kennungen.slice(i, i + UNDERSTANDING_BUENDEL);
      const schluessel = `document_understanding|${buendelHash(teil)}`;
      const ergebnis = await einreihen({
        jobType: "document_understanding",
        idempotencyKey: schluessel,
        // Das Fenster dient hier NUR der Auswertbarkeit (Vorbedingungszaehlung), nicht der
        // Idempotenz — die steckt vollstaendig im Schluessel oben.
        freshnessWindow: auftrag.freshnessWindow || auftrag.freshness_window || null,
        // GETEILTE, GLOBALE ARBEIT: kein Mandatsbezug (CLAUDE.md §4.2). Ein Vorgang gehoert
        // keinem Mandanten, auch dann nicht, wenn ihn eine persoenliche Suche gefunden hat.
        tenantId: null,
        priority: 80,                       // vor Projektion (200) und Briefing (250)
        maxAttempts: 3,
        payload: { dokumentIds: teil }      // NUR Kennungen — kein Titel, kein Text
      });
      // BELEGTER FEHLER (Abschlussreview 2026-08-08): hier wurde `verstehensAuftraege`
      // bedingungslos hochgezaehlt und danach `ok: true` gemeldet — auch dann, wenn
      // `enqueue` `verfuegbar:false` zurueckgab. Der Auftrag galt damit als erledigt,
      // obwohl die Ablage KEINEN Verstehensauftrag traegt. Weil der Idempotenzschluessel
      // des Abrufs sein Aktualitaetsfenster enthaelt, waere er im selben Fenster nie
      // wiederholt worden — und die relationale Persistenz meldet beim naechsten Fenster
      // nur NEUE Zeilen als `neuIds`, die Dokumente waeren also nie verstanden worden.
      // CLAUDE.md §4.10: Wer einen Erfolg meldet, prueft ihn gegen den persistierten Stand.
      if (!ergebnis || ergebnis.verfuegbar === false) {
        verstehenNichtEingereiht += 1;
        if (ergebnis && ergebnis.grund) nichtEingereihtGruende.add(String(ergebnis.grund));
        continue;
      }
      verstehensAuftraege += 1;
      if (ergebnis.neu) verstehenNeu += 1;
    }
  }

  if (verstehenNichtEingereiht > 0) {
    // Voruebergehend, nicht endgueltig: `istEndgueltig` trifft auf diesen Text nicht zu,
    // der Auftrag bekommt also Backoff und kommt wieder.
    throw new Error(`verstehen-nicht-eingereiht: ${verstehenNichtEingereiht} Auftrag(e)`
      + `${nichtEingereihtGruende.size ? ` (${[...nichtEingereihtGruende].join(", ")})` : ""}`);
  }

  return {
    ok: true,
    quellen: 1,
    rohitems: roh.length,
    // Seit Option B zaehlt `gespeichert` die NEU in `raw_documents` eingefuegten Zeilen —
    // dieselbe fachliche Bedeutung wie zuvor (neu erkannte Dokumente), nur aus der
    // kanonischen relationalen Ablage statt aus der Blob-Deduplizierung.
    gespeichert: kennungen.length,
    neueRohdokumente: kennungen.length,
    bereitsVorhanden: Number.isFinite(persistenz && persistenz.vorhandene) ? persistenz.vorhandene : null,
    blobSpiegel,
    verstehensAuftraege,
    verstehenNeu
  };

  // Slot IMMER freigeben — auch im Fehlerpfad. Bei Absturz uebernimmt die Slot-TTL.
  } finally {
    if (klassenSlot && deps.klassen && typeof deps.klassen.gebeFrei === "function") {
      await Promise.resolve(deps.klassen.gebeFrei(klassenSlot)).catch(() => {});
    }
  }
}

// Die Kennungen, unter denen gespeicherte Dokumente in `raw_documents` LIEGEN.
//
// SEIT OPTION B (Reparatursprint 2026-08-19) braucht `handleSourceFetch` diese Ableitung
// nicht mehr: `persistiereRohdokumenteWarteschlange` liefert die `rd-<hash>`-Kennungen der
// neu eingefuegten Zeilen direkt aus der Ablage. Die Funktion bleibt als EINE
// Kennungswahrheit fuer Tests und Auswertungen erhalten (dieselbe Ableitung wie
// `dedup.toRawDocumentRow`).
//
// BELEGTER FEHLER (Abschlussreview 2026-08-08): hier stand `gespeichert.map((d) => d.id)`.
// `storage.saveRawItems` liefert aber die BLOB-Zeilen, und deren Kennung ist
// `raw-<hash16>` (crawler.js: `id: \`raw-${hash.slice(0, 16)}\``). In `raw_documents`
// steht dasselbe Dokument unter `rd-<inhaltsfingerabdruck>` (dedup.toRawDocumentRow).
// Die beiden Kennungen koennen sich nie treffen — `storage.getRawDocumentsByIds` haette
// also IMMER eine leere Menge geliefert, und `handleDocumentUnderstanding` haette jeden
// Auftrag mit `ok:true, verstanden:0, grund:"keine-dokumente-mehr-vorhanden"` beantwortet.
// Der Warteschlangenpfad haette damit NIE ein Dokument verstanden und das auch noch als
// Erfolg gemeldet. Nachgewiesen mit den echten Funktionen; Regression:
// `scripts/jobqueue-vertrag-test.js` §12.
//
// Die Ableitung benutzt dieselbe Funktion wie `scheduler.persistRawDocumentsShadow`
// (`dedup.toRawDocumentRow`) — es gibt damit genau EINE Kennungswahrheit statt zweier.
function rohdokumentKennungen(items = [], deps = {}) {
  const zuKennung = typeof deps.dokumentKennung === "function"
    ? deps.dokumentKennung
    : (item) => { const zeile = require("./dedup").toRawDocumentRow(item); return zeile && zeile.id; };
  const kennungen = [];
  for (const item of Array.isArray(items) ? items : []) {
    let k = null;
    try { k = zuKennung(item); } catch (_) { k = null; }
    if (k) kennungen.push(String(k));
  }
  return [...new Set(kennungen)].sort();
}

// Wie viele Dokumentkennungen kommen in EINEN Verstehensauftrag? Klein genug, dass ein
// Auftrag in seinem Zeitbudget bleibt; gross genug, dass nicht je Artikel ein Auftrag
// entsteht. Der V3-Clusterschritt arbeitet ohnehin ueber die uebergebene Menge.
const UNDERSTANDING_BUENDEL = Math.max(1, Number(process.env.HELMUT_UNDERSTANDING_BUENDEL) || 25);

function buendelHash(kennungen) {
  return crypto.createHash("sha256").update(kennungen.join("\n"), "utf8").digest("hex").slice(0, 32);
}

async function handleDocumentUnderstanding(auftrag, deps, kontext = {}) {
  // V3-VERTRAG: ein Dokument wird GLOBAL nur einmal verstanden. Dieser Handler ruft die
  // unveraenderte `runUnderstandingShadow` auf; deren `existing`-Kurzschluss und deren
  // GLOBALER Budgetdeckel (`canSpendLlm(null)`) bleiben die einzige Wahrheit.
  // Es wird KEIN mandatsbezogener KI-Deckel belastet — globale Dokumente werden keinem
  // zufaelligen Mandanten zugerechnet (Auftrag §13.6).
  //
  // DREI SCHICHTEN GEGEN DOPPELTES VERSTEHEN, bewusst uebereinander:
  //   1. Auftragsebene: der Idempotenzschluessel ist der Inhaltsfingerabdruck der
  //      Dokumentmenge -> dieselbe Menge wird nie zweimal eingereiht.
  //   2. Budgetebene: die Reservierung ist an den `result_key` gebunden -> eine WIEDERHOLUNG
  //      desselben Auftrags zahlt NICHT ein zweites Mal.
  //   3. V3-Ebene: `runUnderstandingShadow` kurzschliesst bereits verstandene Vorgaenge
  //      (`existing` -> `duplicate`) ohne Modellaufruf. Diese Schicht ist die eigentliche
  //      Garantie; die beiden darueber sparen die Arbeit, die sie sonst leisten muesste.
  const payload = (auftrag && auftrag.payload) || {};
  let dokumente = Array.isArray(payload.dokumente) ? payload.dokumente : null;
  const kennungen = Array.isArray(payload.dokumentIds) ? payload.dokumentIds : null;

  if (!dokumente && !kennungen) throw new Error("payload-ungueltig: weder dokumente noch dokumentIds");
  if (dokumente && !Array.isArray(dokumente)) throw new Error("payload-ungueltig: dokumente kein Array");

  // Kennungen -> minimierte Zeilen aus der Ablage. Der Auftrag traegt bewusst KEINE Inhalte
  // (Datensparsamkeit); die Zeilen kommen aus `raw_documents`.
  if (!dokumente) {
    if (typeof deps.ladeRohdokumente !== "function") throw new Error("dokumentladen-nicht-verfuegbar");
    dokumente = await deps.ladeRohdokumente(kennungen);
    if (!Array.isArray(dokumente)) throw new Error("dokumentladen-fehlgeschlagen");
    // EHRLICH: sind Dokumente verschwunden (Aufbewahrung, Loeschung), ist das kein Fehler
    // des Auftrags — aber es wird gezaehlt und nicht stillschweigend als Erfolg verbucht.
    if (!dokumente.length) {
      return { ok: true, verstanden: 0, zurueckgestellt: 0, dokumenteGefunden: 0, grund: "keine-dokumente-mehr-vorhanden" };
    }
  }

  // VERTEILTE VERSTEHENSGRENZE (Auftrag §12, DEFAULT INERT): Standard-Maximum 1 ist die
  // heutige globale Serialisierung — nur ehrlich verteilt statt prozesslokal erhofft.
  // Mehr als 1 ist ausschliesslich zusammen mit der Vorgangswache
  // (HELMUT_VERSTEHEN_KONKURRENZ) sicher; ohne sie bleibt die Grenze bei 1.
  let verstehenSlot = null;
  if (deps.klassen && typeof deps.klassen.belege === "function") {
    const freigabe = await deps.klassen.belege("verstehen", { ttlMs: 300000 });
    if (!freigabe || freigabe.erlaubt !== true) {
      return {
        ok: false, zurueckgestellt: true,
        grund: `klassengrenze-belegt: verstehen${freigabe && freigabe.grund ? ` (${freigabe.grund})` : ""}`
      };
    }
    verstehenSlot = freigabe.slot;
  }
  try {

  // BUDGETRESERVIERUNG (nur wenn der Aufrufer sie mitgibt — ohne sie verhaelt sich der
  // Handler exakt wie bisher, damit bestehende Tests und der Flag-aus-Pfad unberuehrt sind).
  const budget = deps.budget || null;
  let reservierung = null;
  if (budget && typeof budget.reserviere === "function") {
    reservierung = await budget.reserviere({
      art: "understanding",
      gegenstand: auftrag.idempotencyKey || auftrag.idempotency_key || auftrag.id,
      mandatsId: null                      // GLOBAL — niemals einem Mandanten zugerechnet
    });
    if (reservierung && reservierung.erlaubt === false) {
      // OBERGRENZE DES BUDGETWARTENS (Befund O4 des Abschlussreviews — hier behoben).
      // Ohne sie pendelt ein Verstehensauftrag bei dauerhaft erschoepftem Tagesbudget
      // UNBEGRENZT zwischen `wartend` und `laeuft`: `helmut_defer_job` nimmt den Versuch
      // ausdruecklich zurueck, es gibt also keine Zaehlung, die ihn je beendet. Er bleibt
      // dann fuer immer in der Warteschlange, erzeugt bei jedem Durchlauf Datenbanklast und
      // haelt einen Rueckstand offen, der nie kleiner wird.
      //
      // Bezugspunkt ist die ENTSTEHUNG, nicht die Faelligkeit — aus demselben Grund wie bei
      // `VORBEDINGUNG_MAX_WARTE_MS`: `due_at` verschiebt genau das Zurueckstellen nach vorn.
      const jetztMs = typeof deps.now === "function" ? deps.now() : Date.now();
      const entstanden = Date.parse(auftrag.createdAt || auftrag.created_at || "") || null;
      if (entstanden && jetztMs - entstanden > BUDGET_MAX_WARTE_MS) {
        // ENDGUELTIG und EHRLICH benannt: nach dieser Frist gilt das Verstehen dieser
        // Dokumentmenge als aufgegeben. `istEndgueltig` kennt den Text, der Auftrag wird
        // also nicht noch fuenfmal wiederholt. Er ist damit NICHT fuer immer verloren:
        // `helmut_jobs_wiedervorlage` (Migration 20260809) legt endgueltig gescheiterte
        // Verstehensauftraege spaeter begrenzt oft wieder vor (Befund O5).
        throw new Error(`budget-dauerhaft-erschoepft: ${Math.round((jetztMs - entstanden) / 3600000)} h`
          + ` ohne freies KI-Budget (${reservierung.grund || "unbekannt"})`);
      }
      // KEIN Fehler, kein falsches Gruen: der Auftrag bleibt ehrlich offen und kommt wieder,
      // wenn wieder Budget da ist. Ein "erledigt" waere hier eine Luege ueber die Ablage.
      //
      // LANGE Wartezeit, nicht die kurze. BELEGTER ANLASS (2026-08-08,
      // scripts/skalierung-simulation-test.js): mit erschoepftem Tagesbudget wurde derselbe
      // Auftrag in jeder Runde erneut geholt und erneut abgelehnt — gemessen **38 549
      // abgelehnte Reservierungen** an einem simulierten Tag. Das ist keine Arbeit, das ist
      // Leerlauf, der echte Datenbanklast erzeugt und die Warteschlange blockiert.
      // Ein erschoepftes TAGESBUDGET loest sich nicht in zwei Minuten, sondern beim
      // Tageswechsel. Also wird entsprechend lange zurueckgestellt.
      return {
        ok: false,
        zurueckgestellt: true,
        langeWarten: true,
        grund: `budget-nicht-verfuegbar: ${reservierung.grund || "unbekannt"}`
      };
    }
  }

  // KLEINSTE SICHERE ABLOESUNG DES GLOBALEN SCHLOSSES (Auftrag §8): mit
  // HELMUT_VERSTEHEN_KONKURRENZ ersetzt die VORGANGSWACHE (understanding.defaultDeps →
  // storage.vorgangsWache, datenbank-atomar je Vorgang) das globale Schloss fuer DIESEN
  // Lauf — zwei Worker verstehen verschiedene Vorgaenge parallel, derselbe Vorgang
  // bleibt exklusiv. Ohne das Flag bleibt das globale Schloss byte-identisch bestehen.
  const konkurrenz = typeof deps.verstehenKonkurrenz === "function"
    ? deps.verstehenKonkurrenz()
    : require("./storage").verstehenKonkurrenzEnabled();

  let ergebnis = null;
  try {
    ergebnis = await deps.eagerUnderstanding(dokumente, {
      budgetMs: Number(payload.budgetMs) || 60000,
      // RESTZEITWACHE (§29): das absolute Auftragsfensterende aus fuehreAuftragAus —
      // kein Modellaufruf beginnt mehr, der nicht mehr in dieses Fenster passt.
      deadlineMs: Number(kontext.auftragsDeadlineMs) > 0 ? Number(kontext.auftragsDeadlineMs) : 0,
      runId: auftrag.id,
      ...(konkurrenz ? {
        acquireLock: async () => ({ granted: true, active: false, ersetzt: "vorgangswache" }),
        releaseLock: async () => {}
      } : {})
    });
  } catch (error) {
    if (budget && reservierung && typeof budget.melde === "function") {
      await budget.melde({ reservierung, ok: false, note: "understanding-fehler" });
    }
    throw error;
  }

  if (budget && reservierung && typeof budget.melde === "function") {
    // Hat der V3-Kurzschluss gegriffen (nichts verarbeitet, kein Modellaufruf), wird die
    // Reservierung AUSDRUECKLICH zurueckgegeben — das ist der einzige Fall, in dem der
    // Aufrufer beweisen kann, dass kein Aufruf stattgefunden hat.
    //
    // ABER NIE BEI EINER WIEDERVERWENDETEN RESERVIERUNG. BELEGTER FEHLER (2026-08-08, von
    // dieser Suite gefunden): beim zweiten Lauf desselben Auftrags greift oben die Idempotenz
    // (`wiederverwendet`), unten meldet V3 dann folgerichtig "0 verarbeitet" — und die
    // urspruengliche, laengst VERBRAUCHTE Reservierung wurde daraufhin zurueckgegeben. Der
    // Zaehler waere gesunken, obwohl der Aufruf beim ERSTEN Mal wirklich stattgefunden hat.
    // Aus einer Idempotenzzusage waere so eine Budgetleckage geworden.
    const nichtsGetan = Number((ergebnis && ergebnis.processed) || 0) === 0;
    const darfFreigeben = nichtsGetan && !reservierung.wiederverwendet;
    await budget.melde({
      reservierung, ok: true, ungenutzt: darfFreigeben,
      note: darfFreigeben ? "v3-kurzschluss" : null
    });
  }

  // EIN AUSDRUECKLICH UEBERSPRUNGENER V3-LAUF IST KEIN ERLEDIGTER AUFTRAG.
  //
  // BELEGTER FEHLER (adversariale Nachpruefung des Abschlussreviews 2026-08-08, Fix bis
  // 2026-08-11 nur auf dem nie gemergten Branch `claude/helmut_scaling_foundation_1000`):
  // `runUnderstandingShadow` liefert in mehreren Faellen `{ skipped: true, reason }` —
  // darunter `understanding-locked` (ein anderer Lauf haelt die Sperre) und `ai-disabled`.
  // Der Handler meldete darauf `ok:true, verstanden:0`, und der Auftrag galt als ERLEDIGT.
  // Weil der Idempotenzschluessel des Verstehens bewusst KEIN Aktualitaetsfenster traegt,
  // waere dieselbe Dokumentmenge nie wieder eingereiht worden: eine VORUEBERGEHENDE
  // Sperrkollision haette die Dokumente DAUERHAFT unverstanden gelassen — gemeldet als
  // Erfolg (CLAUDE.md §4.10: eine Meldung behauptet nur, was die Ablage traegt).
  //
  // Jetzt wird zurueckgestellt statt abgeschlossen (`helmut_defer_job` nimmt den Versuch
  // zurueck — Warten ist kein Fehlversuch). Die Reservierung ist oben bereits zurueck-
  // gegeben (nichts verarbeitet, nicht wiederverwendet). Und mit derselben Obergrenze
  // wie das Budgetwarten (Befund O4): ein Zustand, der sich nach der Wartefrist nicht
  // aufgeloest hat, ist kein Warten mehr, sondern ein Befund — er endet ENDGUELTIG und
  // sichtbar; die Wiedervorlage (O5) holt ihn spaeter begrenzt oft zurueck.
  if (ergebnis && ergebnis.skipped === true) {
    const grund = String(ergebnis.reason || "unbekannt");
    const jetztUeberspringen = typeof deps.now === "function" ? deps.now() : Date.now();
    const entstandenUeberspringen = Date.parse(auftrag.createdAt || auftrag.created_at || "") || null;
    if (entstandenUeberspringen && jetztUeberspringen - entstandenUeberspringen > BUDGET_MAX_WARTE_MS) {
      throw new Error(`verstehen-uebersprungen-dauerhaft: ${grund} seit `
        + `${Math.round((jetztUeberspringen - entstandenUeberspringen) / 3600000)} h`);
    }
    return {
      ok: false,
      zurueckgestellt: true,
      // Eine Sperrkollision loest sich in Sekunden — kurze Wartezeit reicht. Ein
      // abgeschalteter Pfad (`ai-disabled`, `v3-store-disabled`) loest sich nicht von
      // selbst — lange Wartezeit, sonst entsteht genau der Leerlauf, den die Budget-
      // messung belegt hat (38 549 abgelehnte Reservierungen an einem simulierten Tag).
      langeWarten: /disabled/.test(grund),
      grund: `verstehen-uebersprungen: ${grund}`,
      dokumenteGefunden: dokumente.length
    };
  }

  return {
    ok: true,
    verstanden: (ergebnis && ergebnis.processed) || 0,
    zurueckgestellt: (ergebnis && ergebnis.deferred) || 0,
    dokumenteGefunden: dokumente.length,
    budgetWiederverwendet: Boolean(reservierung && reservierung.wiederverwendet)
  };

  // Verstehens-Slot IMMER freigeben; bei Absturz uebernimmt die Slot-TTL.
  } finally {
    if (verstehenSlot && deps.klassen && typeof deps.klassen.gebeFrei === "function") {
      await Promise.resolve(deps.klassen.gebeFrei(verstehenSlot)).catch(() => {});
    }
  }
}

// Sind die Vorbedingungen dieses Auftrags im SELBEN Aktualitaetsfenster fertig?
//
// WARUM UEBERHAUPT: der skalierbare Pfad trennt Planung und Verarbeitung, damit ist die
// Reihenfolge Abruf -> Verstehen -> Projektion -> Briefing nicht mehr durch den Programm-
// ablauf gesichert. Die Phasenfenster der Faelligkeit sind eine gute Naeherung, aber eine
// Annahme ueber die Laufzeit. Hier wird daraus eine Pruefung.
//
// WAS SIE NICHT TUT: sie wartet nicht auf Auftraege, die ENDGUELTIG gescheitert sind. Ein
// Briefing darf nicht ewig auf einen Abruf warten, den Google nie beantwortet — es entsteht
// dann eben mit weniger Belegen oder als ehrlicher Leerzustand. Genau diese Unterscheidung
// liefert `helmut_jobs_offen` mit (`offen` gegen `fehlgeschlagen`).
//
// Ohne verfuegbare Zaehlung (Migration fehlt, Attrappe ohne diese Faehigkeit) gilt der
// bisherige Zustand: die Faelligkeit entscheidet. Das ist der Rueckfall, nicht der Normalfall.
const VORBEDINGUNGEN = {
  mandate_projection: ["source_fetch", "document_understanding"],
  briefing_materialization: ["source_fetch", "document_understanding", "mandate_projection"],
  // FUENFTER AUFTRAGSTYP (E1): das Narrativ wartet auf Abruf und Verstehen — NICHT auf die
  // Projektion desselben Fensters. Das ist kein Zufall, sondern der bestehende Produktvertrag:
  // der bisherige Cron (`vercel.json`: 05:45Z, nach crawl 04:00 und understanding 05:30) liest
  // die GESPEICHERTEN Matches des Vortags (`storage.listMatchingResults`); die Projektion des
  // eigenen Fensters wird erst ab 50 % des Tages faellig und wuerde die Morgenlage bis in den
  // Nachmittag verschieben. Gleiche Eingangsbasis wie der Altpfad, erzwungen statt gehofft.
  tenant_narrative: ["source_fetch", "document_understanding"]
};
const VORBEDINGUNG_WARTE_MS = Math.max(10000, Number(process.env.HELMUT_VORBEDINGUNG_WARTE_MS) || 120000);
// OBERGRENZE DES WARTENS. Ohne sie wartet ein Briefing UNBEGRENZT.
//
// BELEGTER FEHLER (2026-08-08, von scripts/skalierung-simulation-test.js gefunden):
// bei einem vollstaendigen Google-Ausfall und bei erschoepftem KI-Budget blieben die
// Abruf- und Verstehensauftraege dauerhaft offen. Die Briefingauftraege wurden daraufhin
// in JEDER Runde erneut zurueckgestellt — und die Mandate bekamen am Ende **gar kein
// Briefing**, nicht einmal einen leeren. Gemessen: 0 von 200 Briefings.
//
// Das ist schlimmer als ein Leerzustand: ein leeres Briefing sagt "heute nichts Belastbares",
// gar kein Briefing sagt nichts. Genau das verbietet die Ehrlichkeitsregel (CLAUDE.md §4.4).
//
// Deshalb: nach `VORBEDINGUNG_MAX_WARTE_MS` ab Faelligkeit wird NICHT mehr gewartet. Der
// Auftrag laeuft mit dem, was da ist, und meldet ausdruecklich, dass er ohne vollstaendige
// Vorbedingung gelaufen ist. Zeitbasiert und damit ohne zusaetzlichen Zustand — ein Zaehler
// im Auftrag waere bei jedem Neustart wieder bei null.
// Wartezeit bei erschoepftem Tagesbudget. Standard: eine Stunde. Kuerzer waere Leerlauf,
// laenger wuerde freiwerdendes Budget (Tageswechsel, zurueckgegebene Reservierung) zu
// lange ungenutzt lassen.
const BUDGET_WARTE_MS = Math.max(60000, Number(process.env.HELMUT_BUDGET_WARTE_MS) || 3600 * 1000);

// OBERGRENZE des Budgetwartens (Befund O4). Standard 48 h — bewusst laenger als ein
// Tageswechsel, damit ein einzelner ausgeschoepfter Tag NICHT dazu fuehrt, dass Dokumente
// ungelesen aufgegeben werden. Erst wenn ZWEI volle Tagesbudgets nichts frei gemacht haben,
// ist das kein Warten mehr, sondern ein Zustand — und der gehoert benannt.
const BUDGET_MAX_WARTE_MS = Math.max(
  3600 * 1000, Number(process.env.HELMUT_BUDGET_MAX_WARTE_MS) || 48 * 3600 * 1000
);

const VORBEDINGUNG_MAX_WARTE_MS = Math.max(
  60000, Number(process.env.HELMUT_VORBEDINGUNG_MAX_WARTE_MS) || 6 * 3600 * 1000
);

// Welche Aktualitaetsfenster gehoeren zu DIESEM Auftrag?
//
// BELEGTER FEHLER (Abschlussreview 2026-08-08, Befund O3 — hier behoben): die Pruefung fragte
// mit dem EINEN Fenster des Auftrags. Ein Projektions-/Briefingauftrag traegt aber das
// 24-h-Mandatsfenster (`2026-08-08T00Z`), waehrend die geteilten Abrufe in 8-h-Fenstern liegen
// (`…T00Z`, `…T08Z`, `…T16Z`) und die Verstehensauftraege das Fenster ihres Abrufs erben.
// Zwei Drittel der Vorbedingungen waren damit unsichtbar, und ein Briefing hielt sich fuer
// vorbedingungsfrei, obwohl seine Abrufe noch liefen.
//
// Zurueckgegeben werden alle Fenster der konfigurierten Breiten, die VOLLSTAENDIG im Fenster
// des Auftrags liegen. „Vollstaendig enthalten" ist die richtige Grenze:
//   * die drei 8-h-Abruffenster eines Tages liegen im 24-h-Mandatsfenster  -> zaehlen mit,
//   * das 7-Tage-Archivfenster ist GROESSER als der Tag                     -> zaehlt NICHT.
// Genau so soll es sein: ein Briefing darf nicht auf eine Hintergrundsuche mit Wochenkadenz
// warten (die Archivsuche traegt deshalb auch Prioritaet 300).
function enthalteneFenster(fenster, env = process.env) {
  const startMs = Date.parse(String(fenster || "").replace(/Z$/, ":00:00.000Z"));
  if (!Number.isFinite(startMs)) return [];
  const konfig = require("./source-demand").fensterKonfig(env);
  // Die Breite DES AUFTRAGS ist nicht im Fensterschluessel kodiert. Sie ergibt sich daraus,
  // welche konfigurierte Breite diesen Startzeitpunkt erzeugen wuerde — die groesste, die
  // passt, ist die des Auftrags. Konservativ: im Zweifel die kleinste (dann fragt der Auftrag
  // nur nach sich selbst und verhaelt sich wie vorher).
  const breiten = [...new Set([
    konfig.geteiltStundenFenster, konfig.personStundenFenster,
    konfig.archivStundenFenster, konfig.mandatMaxAlterStunden
  ])].filter((h) => Number.isFinite(h) && h > 0).sort((a, b) => a - b);
  const eigeneBreite = breiten.filter((h) => startMs % (h * 3600 * 1000) === 0).pop() || breiten[0];
  const endeMs = startMs + eigeneBreite * 3600 * 1000;

  const raus = new Set();
  for (const h of breiten) {
    if (h > eigeneBreite) continue;                 // groessere Fenster ragen hinaus
    const breiteMs = h * 3600 * 1000;
    for (let t = startMs; t < endeMs; t += breiteMs) {
      raus.add(new Date(t).toISOString().slice(0, 13) + "Z");
    }
  }
  return [...raus].sort();
}

// WELCHES MANDAT FRAGT? (Befund Z22)
//
// Die Vorbedingungszaehlung war bis 2026-08-26 mandatsblind: sie zaehlte JEDEN offenen
// Auftrag im Fenster, auch den eines fremden Mandats. Ein einziges Mandat mit einem
// dauerhaft nicht antwortenden persoenlichen Abrufweg hielt damit die Projektion und das
// Briefing ALLER anderen Mandate zurueck (Belegdatei z3-realistiknachweis-2026-08-26.md
// §7/§10.5: langsamster Slot +93 % bei 5 Mandaten).
//
// Massgeblich ist die SPALTE `tenant_id` der Warteschlange, nicht `payload.mandatsId`: nach
// ihr filtert die Zaehlung, und nur sie ist fuer jeden Auftragstyp gesetzt. Die Nutzlast
// wird NICHT als Ersatz herangezogen — zwei Wahrheiten waeren hier eine Einladung zum
// Auseinanderlaufen (der Realistiklauf prueft ihre Gleichheit eigens, Kriterium Z9).
//
// FAIL CLOSED: ist die Kennung leer, kein String oder unbrauchbar, wird KEIN Filter
// uebergeben. Dann zaehlt die Datenbank wie bisher global — der Auftrag wartet also auf
// MEHR, nie auf weniger. Ein stiller Sicherheitsverlust durch eine fehlende Kennung ist
// damit ausgeschlossen.
function mandatsKennungVon(auftrag) {
  const roh = auftrag && (auftrag.tenantId ?? auftrag.tenant_id);
  return typeof roh === "string" && roh.trim() !== "" ? roh.trim() : null;
}

async function vorbedingungOffen(auftrag, deps) {
  if (typeof deps.offeneVorbedingungen !== "function") return null;
  const typen = VORBEDINGUNGEN[auftrag.jobType || auftrag.job_type] || null;
  const fenster = auftrag.freshnessWindow || auftrag.freshness_window || null;
  if (!typen || !fenster) return null;

  // Wartefrist abgelaufen? Dann NICHT mehr fragen — der Auftrag laeuft.
  //
  // BEZUGSPUNKT IST DIE ENTSTEHUNG, NICHT DIE FAELLIGKEIT. Belegter Fehler (2026-08-08,
  // von scripts/skalierung-simulation-test.js gefunden): die erste Fassung verglich gegen
  // `due_at`. Genau die verschiebt das Zurueckstellen aber bei JEDEM Mal nach vorn
  // (`helmut_defer_job` setzt `due_at = now() + delay`). Die Frist konnte damit NIE ablaufen —
  // ein Briefing wartete unendlich, und bei erschoepftem Budget entstanden am Ende
  // **0 von 200 Briefings**. `created_at` steht fest und wandert nie.
  const jetzt = typeof deps.now === "function" ? deps.now() : Date.now();
  const entstanden = Date.parse(auftrag.createdAt || auftrag.created_at || "") || null;
  const faellig = Date.parse(auftrag.dueAt || auftrag.due_at || "") || null;
  const bezug = entstanden || faellig;
  if (bezug && jetzt - bezug > VORBEDINGUNG_MAX_WARTE_MS) return null;

  const fensterListe = enthalteneFenster(fenster, deps.env || process.env);
  const stand = await deps.offeneVorbedingungen({
    fenster: fensterListe.length ? fensterListe : [fenster], typen,
    mandat: mandatsKennungVon(auftrag)
  });
  if (!stand || stand.verfuegbar === false) return null;   // ehrlicher Rueckfall
  return Number(stand.offen) > 0 ? { ...stand, fenster: fensterListe } : null;
}

async function handleMandateProjection(auftrag, deps) {
  const mandatsId = auftrag && auftrag.payload && auftrag.payload.mandatsId;
  if (!mandatsId) throw new Error("payload-ungueltig: mandatsId fehlt");
  const offen = await vorbedingungOffen(auftrag, deps);
  if (offen) {
    return {
      ok: false, zurueckgestellt: true,
      grund: `vorbedingung-offen: ${offen.offen} Auftrag(e) im Fenster (${offen.wartend} wartend, ${offen.laufend} laufend)`
    };
  }
  const profil = await deps.getActiveProfile(mandatsId);
  if (!profil) throw new Error("profil-nicht-gefunden");
  // Beides KI-frei (V3-Vertrag §13.3/§13.4) — belegt in docs/betrieb/llm-pfad-karte.md 14/15.
  const matching = await deps.matching({ profile: profil, pipelineRunId: auftrag.id, ausloeser: "warteschlange" });
  const decisions = await deps.decisions({ profile: profil });

  // GLEICHE LEHRE WIE BEIM VERSTEHEN (Abschlussreview 2026-08-08, Fix bis 2026-08-11 nur
  // auf dem nie gemergten Branch): `runMatchingShadow` und `runDecisionShadow` liefern
  // `{ skipped: true, reason }` — u. a. bei `matching-locked`, also einer VORUEBERGEHENDEN
  // Sperrkollision. Ein solcher Lauf wurde als erfolgreiche Projektion verbucht; weil der
  // Idempotenzschluessel der Projektion das Aktualitaetsfenster TRAEGT, haette das Mandat
  // seine Projektion fuer das GANZE Fenster (Standard 24 h) verloren — als Erfolg gemeldet.
  //
  // DREI FAELLE, ehrlich getrennt:
  //   * `no-vorgaenge` ist ein EHRLICHER LEERZUSTAND, kein Hindernis: es gibt in diesem
  //     Fenster nichts zu projizieren. Erledigt mit 0 — kein Zurueckstellen, sonst
  //     pendelte ein gesundes leeres Mandat bis zur Wartefrist-Obergrenze.
  //   * `decision-error` verpackt einen ECHTEN Fehler als Ueberspringen
  //     (decisions.js faengt ihn ab). Er wird als Fehler GEWORFEN: er verbraucht einen
  //     Versuch, bekommt Backoff und endet nach `max_attempts` SICHTBAR als
  //     `fehlgeschlagen` — Zurueckstellen wuerde ihn unbegrenzt verstecken.
  //   * alles andere (Sperren, abgeschaltete Pfade) wird zurueckgestellt, mit derselben
  //     Obergrenze wie das Budgetwarten (O4): danach endgueltig und sichtbar.
  if (decisions && decisions.skipped === true && decisions.reason === "decision-error") {
    throw new Error(`projektion-entscheidungen-fehler: ${decisions.error || "unbekannt"}`);
  }
  const uebersprungen = [
    matching && matching.skipped === true ? `matching:${matching.reason || "unbekannt"}` : null,
    decisions && decisions.skipped === true && decisions.reason !== "no-vorgaenge"
      ? `entscheidungen:${decisions.reason || "unbekannt"}` : null
  ].filter(Boolean);
  if (uebersprungen.length) {
    const jetztUeberspringen = typeof deps.now === "function" ? deps.now() : Date.now();
    const entstandenUeberspringen = Date.parse(auftrag.createdAt || auftrag.created_at || "") || null;
    if (entstandenUeberspringen && jetztUeberspringen - entstandenUeberspringen > BUDGET_MAX_WARTE_MS) {
      throw new Error(`projektion-uebersprungen-dauerhaft: ${uebersprungen.join(", ")}`);
    }
    return {
      ok: false,
      zurueckgestellt: true,
      langeWarten: uebersprungen.every((g) => /disabled/.test(g)),
      grund: `projektion-uebersprungen: ${uebersprungen.join(", ")}`
    };
  }

  return {
    ok: true,
    matched: (matching && (matching.matched ?? matching.count)) || 0,
    entscheidungen: (decisions && (decisions.saved ?? decisions.count)) || 0
  };
}

async function handleBriefingMaterialization(auftrag, deps) {
  const mandatsId = auftrag && auftrag.payload && auftrag.payload.mandatsId;
  if (!mandatsId) throw new Error("payload-ungueltig: mandatsId fehlt");
  const offen = await vorbedingungOffen(auftrag, deps);
  if (offen) {
    return {
      ok: false, zurueckgestellt: true,
      grund: `vorbedingung-offen: ${offen.offen} Auftrag(e) im Fenster (${offen.wartend} wartend, ${offen.laufend} laufend)`
    };
  }
  const profil = await deps.getActiveProfile(mandatsId);
  if (!profil) throw new Error("profil-nicht-gefunden");
  // `buildV3Briefing` ist eine reine Lese-Transformation, 0 KI (llm-pfad-karte.md Zeile 15).
  // Ein Leerzustand ist ein EHRLICHES Ergebnis, kein Fehler: `available:false` heisst
  // "keine belastbare Lage", nicht "Auftrag gescheitert" (CLAUDE.md §4.3).
  const briefing = await deps.buildV3Briefing(profil, mandatsId);
  return {
    ok: true,
    verfuegbar: Boolean(briefing && briefing.available),
    grund: (briefing && briefing.reason) || null,
    positionen: (briefing && Array.isArray(briefing.items) ? briefing.items.length : 0)
  };
}

// ── FUENFTER AUFTRAGSTYP: `tenant_narrative` (E1, 2026-08-09) ─────────────────────────────────
//
// Der EINZIGE mandatsbezogene KI-Verbraucher der Warteschlange. Der Handler baut KEINE eigene
// Fachlogik: er ruft die unveraenderte Produktionsfunktion `lage.buildLageBriefing` auf —
// dieselbe, die der Cron `lage-briefing` je Profil aufruft. Damit bleiben Inhalt, Prompt,
// Modell, Budget-Gates, Sperre, Tagescache und Veroeffentlichungsweg IDENTISCH (Auftrag §3).
//
// WAS DIE BESTANDSFUNKTION BEREITS GARANTIERT (und hier deshalb nicht dupliziert wird):
//   * ATOMARE VEROEFFENTLICHUNG: sichtbar wird das Narrativ ausschliesslich ueber den
//     idempotenten Tagescache (`bf-<mandat>-lage-<Berlin-Tag>`); jeder Fehler davor laesst
//     den sichtbaren Stand unveraendert (`available:false` liefert nur einen Grund).
//   * SCHUTZ VOR VERALTETEN ERGEBNISSEN: der Cache traegt den Fingerabdruck der Eingangsdaten
//     (`koSetHash`); neue Eingangsdaten machen ihn ungueltig, ein unveraenderter Datenstand
//     erzeugt KEINEN zweiten Modellaufruf.
//   * NUR EIN GENERATOR: `acquirePipelineLock('lage-briefing-<mandat>')` — auch gegen den
//     Altpfad und gegen den App-Start-Nachzieher, falls beide gleichzeitig laufen.
//   * BUDGET: globaler Tagesdeckel + per-Mandat-EUR-Deckel aus dem Profil, fail closed.
//
// WAS DER HANDLER DAZUGIBT: Idempotenz je Mandat und Fenster (Auftragsschluessel),
// Vorbedingungspruefung, Wiederholungen mit Backoff, die faire Mandatsreservierung der
// Budgetschicht (`scopeMax` aus dem Tagesplan — der Verbraucher, der O1 bisher fehlte) und
// die erneute Pruefung deaktivierter Mandate unmittelbar VOR der Ausfuehrung.
async function handleTenantNarrative(auftrag, deps) {
  // FLAGGRENZE IM HANDLER, nicht nur im Planer. Nach einem Rueckbau (Flag wieder aus)
  // koennen Auftraege aus dem laufenden Fenster uebrig sein. Sie werden hier OHNE
  // Modellaufruf als uebersprungen abgeschlossen — der Altpfad (Cron-Direktschleife)
  // versorgt das Produkt dann wieder, und die Warteschlange altert nicht mit Arbeit,
  // die niemand mehr will. Kein stiller Doppelpfad in beide Richtungen.
  const env = deps.env || process.env;
  if (!narrativUeberWarteschlange(env)) {
    return { ok: true, uebersprungen: true, veroeffentlicht: false, grund: "narrativ-flag-aus" };
  }

  const mandatsId = auftrag && auftrag.payload && auftrag.payload.mandatsId;
  if (!mandatsId) throw new Error("payload-ungueltig: mandatsId fehlt");

  const offen = await vorbedingungOffen(auftrag, deps);
  if (offen) {
    return {
      ok: false, zurueckgestellt: true,
      grund: `vorbedingung-offen: ${offen.offen} Auftrag(e) im Fenster (${offen.wartend} wartend, ${offen.laufend} laufend)`
    };
  }

  const profil = await deps.getActiveProfile(mandatsId);
  if (!profil) throw new Error("profil-nicht-gefunden");
  // DEAKTIVIERTE MANDATE, unmittelbar vor der Ausfuehrung erneut geprueft (Auftrag §5.10):
  // zwischen Planung und Ausfuehrung koennen Stunden liegen, und ein KI-Aufruf fuer ein
  // inzwischen abgeschaltetes Mandat waere Geld fuer Arbeit, die niemand sehen darf.
  // Verbindlich ist das Praedikat des Projekts (dasselbe wie im Scheduler, Befund 12.12).
  const istDeaktiviert = typeof deps.istDeaktiviert === "function"
    ? deps.istDeaktiviert
    : (p) => require("./profile-validation").isDisabled(p);
  if (istDeaktiviert(profil)) {
    return { ok: true, uebersprungen: true, veroeffentlicht: false, grund: "profil-deaktiviert" };
  }

  // FAIRE MANDATSRESERVIERUNG (O1 — hier bekommt `mandantenDeckel` seinen Verbraucher).
  // Nur mit aktiver Budgetschicht; ohne sie gelten unveraendert die Gates in der
  // Bestandsfunktion selbst (globaler Tagesdeckel + Profil-EUR-Deckel).
  const budget = deps.budget || null;
  let reservierung = null;
  const melde = async (ok, ungenutzt, note) => {
    if (budget && reservierung && typeof budget.melde === "function") {
      await budget.melde({
        reservierung, ok,
        ungenutzt: Boolean(ungenutzt) && !reservierung.wiederverwendet,
        note: note || null
      });
    }
  };
  if (budget && typeof budget.reserviere === "function") {
    reservierung = await budget.reserviere({
      art: "lageBriefing",
      // Gegenstand = Aktualitaetsfenster: ein bezahltes Narrativ je Mandat und Fenster.
      // Eine WIEDERHOLUNG desselben Auftrags zahlt nicht ein zweites Mal (Idempotenz der
      // Reservierung), ein neues Fenster ist eine neue Absicht.
      gegenstand: auftrag.freshnessWindow || auftrag.freshness_window || auftrag.id,
      mandatsId
    });
    if (reservierung && reservierung.erlaubt === false) {
      // OBERGRENZE DES BUDGETWARTENS — dieselbe O4-Disziplin wie beim Verstehen: nach
      // zwei vollen Tagesbudgets ohne freien Aufruf ist das kein Warten mehr, sondern
      // ein Zustand, und der wird endgueltig benannt (und von der Betriebsanzeige gesehen).
      const jetztMs = typeof deps.now === "function" ? deps.now() : Date.now();
      const entstanden = Date.parse(auftrag.createdAt || auftrag.created_at || "") || null;
      if (entstanden && jetztMs - entstanden > BUDGET_MAX_WARTE_MS) {
        throw new Error(`budget-dauerhaft-erschoepft: ${Math.round((jetztMs - entstanden) / 3600000)} h`
          + ` ohne freies KI-Budget (${reservierung.grund || "unbekannt"})`);
      }
      return {
        ok: false, zurueckgestellt: true, langeWarten: true,
        grund: `budget-nicht-verfuegbar: ${reservierung.grund || "unbekannt"}`
      };
    }
  }

  let ergebnis = null;
  try {
    ergebnis = await deps.lageNarrativ(profil, { politicianId: mandatsId });
  } catch (error) {
    await melde(false, false, "narrativ-fehler");
    throw error;
  }

  if (ergebnis && ergebnis.available === true) {
    const ausCache = Boolean(ergebnis.fromCache);
    // Kam das Ergebnis aus dem Tagescache, hat KEIN Modellaufruf stattgefunden — die
    // Reservierung wird ausdruecklich zurueckgegeben (nie bei einer wiederverwendeten,
    // dieselbe Budgetleckage-Lehre wie beim Verstehen).
    await melde(true, ausCache, ausCache ? "narrativ-cache" : null);
    return {
      ok: true,
      veroeffentlicht: true,
      ausCache,
      absaetze: Array.isArray(ergebnis.paragraphs) ? ergebnis.paragraphs.length : 0,
      vorgaenge: Array.isArray(ergebnis.vorgaenge) ? ergebnis.vorgaenge.length : 0,
      modell: ergebnis.model || null
    };
  }

  // KEIN veroeffentlichtes Narrativ. Die Bestandsfunktion liefert dafuer einen GRUND —
  // und der entscheidet ueber Zurueckstellen, Wiederholen oder endgueltiges Scheitern.
  const grund = String((ergebnis && ergebnis.reason) || "unbekannt");

  if (grund === "budget") {
    // Die inneren Gates (globaler Tageszaehler, Profil-EUR-Deckel) haben verweigert —
    // es gab KEINEN Modellaufruf. Reservierung zurueckgeben, dann dieselbe O4-Grenze.
    await melde(false, true, "narrativ-budget");
    const jetztMs = typeof deps.now === "function" ? deps.now() : Date.now();
    const entstanden = Date.parse(auftrag.createdAt || auftrag.created_at || "") || null;
    if (entstanden && jetztMs - entstanden > BUDGET_MAX_WARTE_MS) {
      throw new Error(`budget-dauerhaft-erschoepft: ${Math.round((jetztMs - entstanden) / 3600000)} h`
        + " ohne freies KI-Budget (inneres Gate)");
    }
    return { ok: false, zurueckgestellt: true, langeWarten: true, grund: "budget-nicht-verfuegbar: inneres Gate" };
  }

  if (grund === "generating") {
    // Ein anderer Generator haelt die Sperre (Altpfad-Restlauf, App-Start-Nachzieher).
    // Kein Fehler, kein Versuch verbraucht: kurz zurueckstellen und wiederkommen —
    // beim naechsten Anlauf liegt das Ergebnis im Cache und wird ohne Aufruf uebernommen.
    await melde(false, true, "narrativ-gesperrt");
    return { ok: false, zurueckgestellt: true, grund: "narrativ-wird-bereits-erzeugt" };
  }

  if (grund === "no-vorgaenge") {
    // EHRLICHER LEERZUSTAND, kein Fehlschlag (CLAUDE.md §4.3): es gibt heute keine
    // belastbare Lage fuer dieses Mandat. Kein Modellaufruf, kein erfundener Inhalt.
    await melde(false, true, "narrativ-leer");
    return { ok: true, veroeffentlicht: false, grund: "no-vorgaenge" };
  }

  if (grund === "v3-disabled" || grund === "no-profile") {
    // Erledigt sich nicht durch Wiederholen — endgueltig, mit dem Wort, das
    // `istEndgueltig` dafuer kennt.
    await melde(false, true, `narrativ-${grund}`);
    throw new Error(`narrativ-nicht-moeglich: ${grund}`);
  }

  // `ai-unavailable`, `store-error` und alles Unbekannte: VORUEBERGEHEND. Bei
  // `ai-unavailable` KANN ein Modellaufruf stattgefunden und gescheitert sein — die
  // Reservierung wird deshalb NICHT zurueckgegeben (konservativ: lieber eine Reservierung
  // zu viel gezaehlt als ein bezahlter Aufruf zu wenig). `store-error` ist ein Lesefehler
  // VOR jedem Aufruf, gibt also zurueck.
  await melde(false, grund === "store-error", `narrativ-${grund}`);
  throw new Error(`narrativ-voruebergehend: ${grund}`);
}

const HANDLER = {
  source_fetch: handleSourceFetch,
  document_understanding: handleDocumentUnderstanding,
  mandate_projection: handleMandateProjection,
  briefing_materialization: handleBriefingMaterialization,
  tenant_narrative: handleTenantNarrative
};

// --- KI-Budget als Worker-Abhaengigkeit (OP-30, DEFAULT AUS) ---------------------------------
//
// ZWEITE FLAGGRENZE, bewusst getrennt von der ersten. `HELMUT_SCALABLE_PIPELINE` entscheidet,
// OB der Warteschlangenpfad laeuft. `HELMUT_LLM_FAIRNESS` entscheidet, ob dabei die neue
// ergebnisbezogene Budgetschicht dazwischenliegt. Beide sind fail closed und beide sind aus.
//
// WARUM ZWEI FLAGGEN: die Budgetschicht kann Arbeit ZURUECKSTELLEN. Das ist genau richtig,
// wenn das Budget knapp ist — aber es ist eine Verhaltensaenderung, die man getrennt vom
// Warteschlangenumbau erproben koennen muss. Ein Flag, das zwei Dinge zugleich einschaltet,
// ist bei einem Fehler nicht auswertbar.
//
// WAS SIE NIE TUT: sie erhoeht keinen Deckel. `HELMUT_MAX_LLM_CALLS_PER_DAY` bleibt der
// globale Notfallwert; die Schicht kann nur WENIGER zulassen, nie mehr.
function budgetFairnessAktiv(env = process.env) {
  const roh = String((env && env.HELMUT_LLM_FAIRNESS) || "").trim().toLowerCase();
  return roh === "on" || roh === "true" || roh === "1" || roh === "an";
}

function budgetAdapter({ env = process.env, deps = {}, tagesplan = null } = {}) {
  if (!budgetFairnessAktiv(env)) return null;
  const fair = deps.fair || require("./llm-budget-fair");
  const speicher = deps.budgetSpeicher || {
    reserviere: (o) => require("./storage").llmReserveResult(o),
    melde: (o) => require("./storage").llmSettleResult(o),
    gib_frei: (o) => require("./storage").llmReleaseResult(o)
  };
  const jetzt = typeof deps.now === "function" ? deps.now : () => Date.now();
  // Der globale Deckel wird GELESEN, nie gesetzt. Fehlt er, gilt derselbe fail-closed-Wert
  // wie in storage.js (Schutzlimit 50) — nicht "unbegrenzt".
  const globalMax = (() => {
    const roh = String(env.HELMUT_MAX_LLM_CALLS_PER_DAY ?? "").trim();
    const n = Number(roh);
    return roh !== "" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
  })();

  // ── `scopeMax` — der Befund O1, hier eingeloest ─────────────────────────────────────────
  // Bis zum Abschlussreview uebergab dieser Adapter `scopeMax` IMMER als `null`. Die
  // Bereichsspalte in `helmut_reserve_llm_result` war damit reine Buchhaltung ohne Grenze,
  // und `llm-budget-fair.mandantenDeckel` wurde nie aufgerufen. Jetzt kommt fuer jede
  // Reservierung ein echter Deckel aus dem Tagesplan:
  //
  //   GLOBAL (Verstehen)  -> `globalerTopf`: der Tagesdeckel MINUS dem, was die
  //                          mandatsbezogene KI an diesem Tag tatsaechlich braucht
  //                          (ein Lage-Narrativ je aktivem Mandat), hoechstens jedoch der
  //                          konfigurierte Mandatsanteil. Er verhindert genau das, was ohne
  //                          ihn passieren wuerde: das Verstehen raeumt den Tagesdeckel leer
  //                          und die sichtbaren Lage-Narrative fallen aus.
  //   MANDATSBEZOGEN      -> `mandantenDeckel`: die Zuteilung dieses Mandats aus dem Plan.
  //
  // EHRLICHE GRENZE, ausdruecklich (CLAUDE.md §4.4): im heutigen Warteschlangenpfad gibt es
  // KEINEN mandatsbezogenen KI-Verbraucher — Projektion und Briefing sind KI-frei. Der
  // mandatsbezogene Zweig ist also verdrahtet, vertraglich geprueft und in der Simulation
  // belegt, aber im Betrieb erst wirksam, wenn das Lage-Narrativ in die Warteschlange
  // kommt. Das ist eine Architekturentscheidung des Betreibers und wird hier NICHT getroffen
  // (docs/betrieb/op30-aktivierungsreife-2026-08-09.md §3, Entscheidungsfrage E1).
  const deckelFuer = (art, mandatsId) => {
    if (!tagesplan) return null;
    if (fair.istGlobaleArt(art)) {
      const g = tagesplan.global;
      return g && Number.isFinite(g.globalTopf) ? g.globalTopf : null;
    }
    return fair.mandantenDeckel(tagesplan, mandatsId);
  };

  return {
    aktiv: true,
    tagesplanVorhanden: Boolean(tagesplan),
    async reserviere({ art, gegenstand, mandatsId = null, workClass = "notwendig", scopeMax = undefined } = {}) {
      const tag = fair.tagesSchluessel(jetzt());
      const resultKey = fair.ergebnisSchluessel({ art, gegenstand, mandatsId });
      const scope = fair.scopeFuer({ art, mandatsId });
      // Ein ausdruecklich uebergebener Wert hat Vorrang (Tests, Sonderfaelle); sonst
      // entscheidet der Tagesplan. `null` bleibt moeglich — aber nur, wenn es KEINEN Plan
      // gibt, und dann ist das die ehrliche Aussage "kein Bereichsdeckel bekannt".
      const wirksamerScopeMax = scopeMax === undefined ? deckelFuer(art, mandatsId) : scopeMax;
      const antwort = await speicher.reserviere({
        resultKey, day: tag, scope, workClass,
        globalMax, scopeMax: wirksamerScopeMax
      });
      if (antwort && antwort.verfuegbar !== false) {
        // Der wirksame Deckel wandert mit zurueck, damit der Aufrufer ihn melden kann und
        // eine Ablehnung nachvollziehbar ist statt nur "nicht erlaubt".
        antwort.scopeMax = wirksamerScopeMax;
        antwort.scope = scope;
      }
      if (!antwort || antwort.verfuegbar === false) {
        // Steht die Budgetschicht nicht zur Verfuegung (Migration fehlt), wird NICHT
        // stillschweigend durchgelassen und auch nicht blockiert: der Aufrufer bekommt
        // `null` und faellt auf den bestehenden Deckel im V3-Pfad zurueck. Genau der greift
        // ohnehin und war vor diesem Sprint die einzige Schranke.
        return null;
      }
      return { ...antwort, resultKey };
    },
    async melde({ reservierung, ok = true, ungenutzt = false, note = null } = {}) {
      if (!reservierung || !reservierung.resultKey) return null;
      if (ungenutzt) return speicher.gib_frei({ resultKey: reservierung.resultKey, note });
      return speicher.melde({ resultKey: reservierung.resultKey, ok, note });
    }
  };
}

// --- Worker -----------------------------------------------------------------------------------

function workerDeps(overrides = {}) {
  const lazy = (modul, name) => (...args) => require(modul)[name](...args);
  return {
    now: () => Date.now(),
    claim: (o) => require("./storage").jobQueueClaim(o),
    finish: (o) => require("./storage").jobQueueFinish(o),
    extendLease: (o) => require("./storage").jobQueueExtendLease(o),
    // NEU in diesem Sprint — die drei fehlenden Verbindungen zum V3-Ablauf.
    // Zielarchitektur: die Enqueue-Wahl (mit/ohne Versandabsicht) liegt an EINER Stelle.
    enqueue: (o) => standardEnqueue()(o),
    ladeRohdokumente: (ids) => require("./storage").getRawDocumentsByIds(ids),
    offeneVorbedingungen: (o) => require("./storage").jobQueueOffeneVorbedingungen(o),
    zurueckstellen: (o) => require("./storage").jobQueueDefer(o),
    // OP-30/O5:
    wiedervorlage: (o) => require("./storage").jobQueueWiedervorlage(o),
    blockierte: (o) => require("./storage").jobQueueBlockiert(o),
    crawlAllSources: lazy("./crawler", "crawlAllSources"),
    // OPTION B (Reparatursprint 2026-08-19): der Warteschlangenpfad persistiert Rohdokumente
    // KANONISCH RELATIONAL und fasst die Blob-Zeilen `main`/`main-auth` je Auftrag nicht
    // mehr an. `saveRawItems`/`persistRawDocumentsShadow` sind hier bewusst NICHT mehr
    // verdrahtet — ihre Rueckkehr in die Worker-Deps macht der Waechtertest
    // `scripts/warteschlange-blob-entkopplung-test.js` rot. Der Blob-Lesespiegel laeuft
    // ausschliesslich ueber `blobSpiegel` (worker-betrieb.durchlauf, einmal je Slot).
    persistRohdokumente: lazy("./storage", "persistiereRohdokumenteWarteschlange"),
    eagerUnderstanding: lazy("./understanding", "runUnderstandingShadow"),
    matching: lazy("./matching", "runMatchingShadow"),
    decisions: lazy("./decisions", "runDecisionShadow"),
    getActiveProfile: lazy("./scheduler", "getActiveProfile"),
    // FUENFTER AUFTRAGSTYP (E1): die unveraenderte Produktionsfunktion des Lage-Narrativs —
    // dieselbe, die der Cron `lage-briefing` je Profil aufruft. Sie traegt ihre eigenen
    // Gates (Budget, Sperre, Tagescache, Datenstand-Fingerabdruck) selbst.
    lageNarrativ: lazy("./lage", "buildLageBriefing"),
    // Dasselbe Praedikat wie im Scheduler (Befund 12.12): verbindlich ist die
    // Projektdefinition eines deaktivierten Profils, kein eigenes Feld.
    istDeaktiviert: (p) => require("./profile-validation").isDisabled(p),
    // BELEGTER FEHLER (Abschlussreview 2026-08-08): hier stand
    // `lazy("./briefingContract", "buildV3Briefing")`. `lib/helmut/briefingContract.js`
    // exportiert diesen Namen NICHT — `buildV3Briefing` ist eine Funktion in `server.js`
    // (dort ab Zeile ~2234). Jeder Briefingauftrag scheiterte damit an
    // `require(...)[name] is not a function`, wurde fuenfmal wiederholt und endete
    // `fehlgeschlagen`: die gesamte Briefingstufe des Warteschlangenpfads war tot, und der
    // Fehlertext zeigte nicht darauf. Nachgewiesen zur Laufzeit; Regression:
    // `scripts/jobqueue-vertrag-test.js` §12.9/§12.10 prueft ALLE Abhaengigkeiten.
    //
    // `server.js` reicht die echte Funktion jetzt ein (`runCronUeberWarteschlange`). Sie
    // hierher zu verschieben waere ein Umbau von Production-Code und gehoert nicht in einen
    // Review. Ohne Einreichung bricht der Handler EHRLICH ab — mit dem Wort, das dieses
    // Modul dafuer vorsieht (`nicht-implementiert`, endgueltig statt endlos wiederholt).
    buildV3Briefing: async () => {
      throw new Error("nicht-implementiert: buildV3Briefing wird vom Aufrufer eingereicht "
        + "(server.js runCronUeberWarteschlange) und ist in dieser Umgebung nicht verfuegbar");
    },
    hardeningConfig: lazy("./google-news-hardening", "googleHardeningConfig"),
    createGate: lazy("./google-news-hardening", "createGoogleNewsGate"),
    sharedLedger: lazy("./google-news-hardening", "sharedFetchLedger"),
    handler: HANDLER,
    ...overrides
  };
}

// Der Worker baut den Budgetadapter EINMAL je Lauf und reicht ihn den Handlern durch.
// Ist die Fairness aus, ist `budget` schlicht `null` und jeder Handler verhaelt sich exakt
// wie vor diesem Sprint.
function mitBudget(d, env, tagesplan = null) {
  if (d.budget !== undefined) return d;                 // Test-/Aufruferschicht hat Vorrang
  return { ...d, budget: budgetAdapter({ env, deps: d, tagesplan }) };
}

// Ein Worker-Durchlauf. Haelt ein FESTES Laufzeitbudget ein und verlaengert bei Bedarf die
// Lease. Er verliert nach einem Absturz keine Arbeit: was reserviert und nicht abgeschlossen
// wurde, wird nach Ablauf der Lease vom naechsten Claim wieder aufgenommen (der Riegel dafuer
// steht in der SQL-Funktion, nicht hier).
// ═══ EINE AUSFUEHRUNG EINES AUFTRAGS — DER GETEILTE KERN (Haertungssprint 2026-08-14) ═══
// Bis hierher lag diese Logik als Schleifenrumpf IN `arbeite`. Der verwaltete
// Queue-Verbraucher (SQS/Lambda) muss GENAU dieselbe Ausfuehrung verwenden — sonst
// entstuende eine zweite Fachimplementierung mit eigener Wiederholungs-, Zurueckstellungs-
// und Abschlusslogik (Auftrag Phase 2, Punkt 17). Deshalb ist der Rumpf jetzt eine
// exportierte Funktion, die `arbeite` UND der Verbraucher aufrufen. Das Verhalten im
// Cron-/Warteschlangenpfad ist unveraendert (Bestandssuiten belegen das).
//
// Sie erledigt genau vier Dinge, in dieser Reihenfolge:
//   1. Lease verlaengern, wenn die verbleibende Lease knapp wird (fremder Halter -> Finger weg),
//   2. den FACHHANDLER unter harter Zeitgrenze ausfuehren,
//   3. eine ehrliche Zurueckstellung (Warten ist kein Fehler) ohne Versuchsverbrauch,
//   4. sonst den Abschluss buchen (erledigt | wiederholt | endgueltig fehlgeschlagen).
//
// `restzeitMs` ist die vom AUFRUFER verantwortete Restzeit fuer diesen einen Auftrag.
// `bilanz` wird fortgeschrieben; fehlt sie, wird eine eigene angelegt und zurueckgegeben.
function leereAuftragsBilanz() {
  return {
    nachTyp: {}, erledigt: 0, wiederholt: 0, endgueltigFehlgeschlagen: 0,
    zurueckgestellt: 0, zurueckstellGruende: {}, zurueckstellungNichtVerfuegbar: 0,
    leaseVerloren: 0, nichtUebernommen: 0
  };
}

async function fuehreAuftragAus({
  auftrag, deps, besitzer, leaseMs = 120000, restzeitMs = AUFTRAG_MAX_MS, bilanz = null
} = {}) {
  const d = deps;
  const b = bilanz || leereAuftragsBilanz();
  const typ = auftrag.job_type;
  b.nachTyp[typ] = b.nachTyp[typ] || { erledigt: 0, fehler: 0 };
  const handler = d.handler[typ];

  let ergebnis = null;
  let fehler = null;
  let fehlerRoh = null;
  if (typeof handler !== "function") {
    fehler = "unbekannter-aufgabentyp";           // endgueltig, kein Backoff
  } else {
    try {
      // Lease verlaengern, wenn die verbleibende Lease knapp wird. Bei langen Abrufen
      // (eine Personenquelle sind ~98 Anfragen) ist das der Unterschied zwischen
      // "laeuft noch" und "wird einem zweiten Worker gegeben".
      const leaseEnde = Date.parse(auftrag.lease_expires_at || "") || 0;
      if (leaseEnde && leaseEnde - d.now() < leaseMs / 2) {
        const v = await d.extendLease({ id: auftrag.id, owner: besitzer, leaseMs });
        if (v && v.verfuegbar && v.verlaengert === false) {
          b.leaseVerloren += 1;
          return { bilanz: b, ausgang: "lease-verloren" };   // fremder Halter -> Finger weg
        }
      }
      // Die Auftragsgrenze ist zusaetzlich durch die RESTZEIT gedeckelt: ein Auftrag
      // darf nie ueber die Abschlussreserve des Aufrufers hinaus laufen.
      //
      // UND durch die halbe LEASE (Abschlussreview 2026-08-08): die Verlaengerung oben
      // greift nur VOR dem Auftrag. Ein einzelner Auftrag, der genauso lange laufen
      // darf wie seine Lease, ueberlebt sie — ein zweiter Worker uebernaehme ihn dann
      // MITTEN in der Ausfuehrung, und derselbe Quellenabruf liefe doppelt. Mit der
      // halben Lease als Obergrenze ist das strukturell ausgeschlossen.
      const auftragsBudget = Math.max(1000, Math.min(
        typZeitgrenze(typ),
        restzeitMs,
        Math.floor(Number(leaseMs) / 2) || AUFTRAG_MAX_MS
      ));
      // RESTZEITWACHE (§29): der Handler erfaehrt sein ABSOLUTES Zeitfensterende.
      // `mitZeitgrenze` ist nur ein Promise.race — es bricht die Arbeit nicht ab; ohne
      // diese Deadline konnte ein Verstehens-Handler nach seiner Zeitgrenze im
      // Hintergrund weiterlaufen und noch bezahlte Modellaufrufe starten.
      ergebnis = await mitZeitgrenze(
        Promise.resolve(handler(normalisiereAuftrag(auftrag), d, {
          auftragsDeadlineMs: d.now() + auftragsBudget
        })),
        auftragsBudget,
        typ
      );
    } catch (error) {
      fehlerRoh = error;
      fehler = bereinigeFehler(error);
    }
  }

  // ANBIETERGRENZE = VERTAGUNG, NICHT FEHLER (Korrekturlauf 2026-08-14/3). Die Engstellen
  // (crawler.fetchUrl, ai.requestOpenAI) werfen bei ausgeschoepfter Grenze einen Fehler mit
  // `anbieterVertagung`. Hier wird daraus die bekannte, ehrliche Zurueckstellung: der Auftrag
  // wartet bis zum FRUEHESTEN zulaessigen Zeitpunkt, verbraucht keinen Versuch und behauptet
  // keine Stoerung. Eine Warteschleife innerhalb der Function gibt es nicht.
  if (!ergebnis && fehlerRoh && fehlerRoh.anbieterVertagung) {
    const v = fehlerRoh.anbieterVertagung;
    ergebnis = {
      zurueckgestellt: true,
      grund: `anbietergrenze: ${v.grund}`,
      langeWarten: Number(v.wartenMs) > 5 * 60 * 1000
    };
    fehler = null;
  }

  // EHRLICHE ZURUECKSTELLUNG. Ein Auftrag, der auf seine Vorbedingung oder auf freies
  // Budget wartet, ist nicht gescheitert — und darf deshalb weder einen Versuch
  // verbrauchen noch einen Fehlertext bekommen, der eine Stoerung behauptet.
  if (ergebnis && ergebnis.zurueckgestellt === true) {
    b.zurueckgestellt += 1;
    const kurz = String(ergebnis.grund || "unbekannt").split(":")[0];
    b.zurueckstellGruende[kurz] = (b.zurueckstellGruende[kurz] || 0) + 1;
    if (typeof d.zurueckstellen === "function") {
      const z = await d.zurueckstellen({
        id: auftrag.id, owner: besitzer,
        // Ein erschoepftes Tagesbudget braucht eine LANGE Wartezeit, eine offene
        // Vorbedingung eine kurze.
        delayMs: ergebnis.langeWarten ? BUDGET_WARTE_MS : VORBEDINGUNG_WARTE_MS,
        grund: ergebnis.grund || null
      });
      // Steht die Zurueckstellung nicht zur Verfuegung (Migration fehlt), wird NICHTS
      // abgeschlossen: die Lease laeuft aus und der Auftrag kehrt von selbst zurueck.
      // Das ist langsamer, aber es verliert nichts und behauptet nichts.
      if (z && z.verfuegbar === false) b.zurueckstellungNichtVerfuegbar += 1;
    } else {
      b.zurueckstellungNichtVerfuegbar += 1;
    }
    return { bilanz: b, ausgang: "zurueckgestellt", grund: ergebnis.grund || null };
  }

  const ok = Boolean(ergebnis && ergebnis.ok);
  const versuche = Number(auftrag.attempts) || 1;
  const maxVersuche = Number(auftrag.max_attempts) || 5;
  const endgueltig = !ok && (istEndgueltig(fehler) || versuche >= maxVersuche);
  const abschluss = await d.finish({
    id: auftrag.id,
    owner: besitzer,
    ok,
    error: ok ? null : (fehler || "unbekannter-fehler"),
    // Ueber den Zielstatus entscheidet allein `helmut_finish_job`: die Funktion setzt
    // einen Auftrag nur dann auf `fehlgeschlagen`, wenn `attempts >= max_attempts`. Ein
    // als endgueltig EINGESTUFTER Fehler vor dieser Grenze kommt also wieder — nur ohne
    // Wartezeit. Das ist Absicht: ein Fehler, der sich nicht von selbst erledigt, soll
    // seine Versuche schnell aufbrauchen statt tagelang Kapazitaet zu binden.
    retryDelayMs: ok || endgueltig ? 0 : backoffMs(versuche, auftrag.id)
  });

  if (!abschluss || abschluss.verfuegbar === false) {
    b.nichtUebernommen += 1;
    return { bilanz: b, ausgang: "nicht-uebernommen" };
  }
  if (abschluss.uebernommen === false) {
    b.leaseVerloren += 1;                          // jemand anderes haelt ihn jetzt
    return { bilanz: b, ausgang: "lease-verloren" };
  }
  if (ok) {
    b.erledigt += 1; b.nachTyp[typ].erledigt += 1;
    return { bilanz: b, ausgang: "erledigt" };
  }
  if (abschluss.neuerStatus === "fehlgeschlagen") {
    b.endgueltigFehlgeschlagen += 1; b.nachTyp[typ].fehler += 1;
    return { bilanz: b, ausgang: "endgueltig-fehlgeschlagen", fehler };
  }
  b.wiederholt += 1; b.nachTyp[typ].fehler += 1;
  return { bilanz: b, ausgang: "wiederholt", fehler };
}

async function arbeite({
  deps = {},
  owner = null,
  budgetMs = 240000,
  leaseMs = 120000,
  stapel = 10,
  types = null,
  env = process.env,
  // OP-30/O1: der Tagesplan des Schedulers. Er liefert die Bereichsdeckel (`scopeMax`).
  // Fehlt er, ist das KEIN Fehler — dann gibt es schlicht keinen Bereichsdeckel, und genau
  // das wird in der Bilanz benannt statt stillschweigend als "unbegrenzt" gelebt.
  tagesplan = null,
  // ── LEERLAUFWARTEN (Kapazitaetssprint 2026-08-09) — DEFAULT 0 = UNVERAENDERT ─────────────
  // BELEGTER ANLASS (slotgenaue Simulation, 200 Mandate, Parallelitaet 8, zwei Morgenslots):
  // 198 von 200 Narrativen waren im Morgenfenster fertig, 2 nicht. Ursache war KEINE
  // Kapazitaetsgrenze — beide Slots hatten Budget uebrig. Ursache war der Wiederholungs-
  // Backoff: ein Auftrag, der GEGEN ENDE eines Slots scheitert, wird um 15–30 s
  // zurueckgestellt, der Worker findet in derselben Sekunde nichts Faelliges mehr und
  // beendet den Slot (`if (!auftraege.length) break`). Die Wiederholung war damit erst im
  // 16:00-Slot dran — die Morgenlage dieser zwei Mandate haette am Nachmittag gestanden.
  //
  // DIE ENG GEFASSTE ABHILFE: ein Worker, der SELBST Arbeit zurueckgestellt oder wiederholt
  // hat, wartet bei leerer Warteschlange kurz und schaut noch einmal nach — solange sein
  // Slotbudget das traegt. Wer NICHTS zurueckgestellt hat, beendet den Slot sofort wie
  // bisher; ein leerer Morgen kostet also keine zusaetzliche Ausfuehrungszeit.
  //
  // Default 0 ⇒ jeder bestehende Aufrufer verhaelt sich byte-gleich. Gesetzt wird der Wert
  // ausschliesslich von den beiden Morgenslots (`server.js narrativSlotGrenzen`).
  leerlaufWarteMs = 0
} = {}) {
  if (!skalierbarerPfadAktiv(env)) {
    return { uebersprungen: true, grund: "flag-aus", verarbeitet: 0 };
  }
  const d = mitBudget(workerDeps(deps), env, tagesplan);
  // Die Umgebung des LAUFS wandert in die Handler-Deps: `handleTenantNarrative` prueft seine
  // Flaggrenze gegen genau die Umgebung, unter der dieser Worker gestartet wurde — nicht
  // gegen `process.env` (Tests und Simulation reichen eine eigene Umgebung ein).
  if (d.env === undefined) d.env = env;
  const start = d.now();
  const besitzer = owner || `worker-${crypto.randomUUID()}`;
  // VERTEILTE KLASSENGRENZEN (Auftrag §12): der Adapter wird EINMAL je Lauf gebaut und an
  // den Lease-Besitzer gebunden. Ohne HELMUT_KLASSEN_GRENZEN ist er null und alle Handler
  // verhalten sich byte-identisch. Eine Test-/Aufruferschicht hat Vorrang.
  if (d.klassen === undefined) d.klassen = klassenAdapter({ env, owner: besitzer, deps: d });
  const verbleibend = () => Math.max(0, budgetMs - (d.now() - start));

  const bilanz = {
    uebersprungen: false, owner: besitzer,
    reserviert: 0, erledigt: 0, wiederholt: 0, endgueltigFehlgeschlagen: 0,
    leaseVerloren: 0, nichtUebernommen: 0,
    zurueckgestellt: 0, zurueckstellGruende: {}, zurueckstellungNichtVerfuegbar: 0,
    stapelrestZurueckgegeben: 0, stapelrestNichtZurueckgegeben: 0,
    leerlaufWarten: 0,
    nachTyp: {}, dauerMs: 0, verfuegbar: true, grund: null,
    // EHRLICH benannt (O1): laeuft die Budgetschicht mit einem echten Bereichsdeckel oder
    // ohne? Ohne Tagesplan gibt es keinen — das darf nicht wie ein durchgesetzter Deckel
    // aussehen.
    budgetSchicht: d.budget ? (d.budget.tagesplanVorhanden ? "mit-tagesplan" : "ohne-tagesplan") : "aus"
  };

  // RESERVE fuer den Abschluss: die letzte Runde darf nicht mitten im Abschlussschreiben
  // in das aeussere Zeitlimit laufen (dieselbe Lehre wie K8 der globalen Phase).
  const ABSCHLUSS_RESERVE_MS = 5000;

  // Schlafen ist injizierbar, weil die Zeit im Test virtuell ist: ein echtes `setTimeout`
  // wuerde eine virtuelle Uhr nie weiterbewegen und das Leerlaufwarten waere nicht pruefbar.
  const schlafe = typeof d.schlafe === "function"
    ? d.schlafe
    : (ms) => new Promise((r) => setTimeout(r, ms));

  // Reservierte, aber im Zeitbudget nicht mehr bearbeitete Auftraege EHRLICH zurueckgeben.
  //
  // BELEGTER FEHLER (Abschlussreview 2026-08-08, an echter PostgreSQL nachgemessen):
  // `helmut_claim_jobs` erhoeht `attempts` fuer den GANZEN reservierten Stapel. Wer den
  // Rest des Stapels nur liegen liess, verbrauchte damit einen Versuch fuer Arbeit, die
  // NIE stattgefunden hat. Gemessen: fuenf Reservierungen ohne eine einzige Ausfuehrung
  // ergaben `attempts = 5`, und der naechste Claim setzte den Auftrag endgueltig auf
  // `fehlgeschlagen` mit `last_error = 'versuche-erschoepft'`. Bei Stapel 10 reicht dafuer
  // ein einziger langsamer Auftrag je Lauf.
  //
  // `helmut_defer_job` nimmt den Versuch zurueck (`attempts = greatest(0, attempts - 1)`)
  // und macht den Auftrag sofort wieder faellig. Steht die Zurueckstellung nicht zur
  // Verfuegung, bleibt das bisherige Verhalten (Lease laeuft aus) — nie schlechter als
  // vorher, aber ehrlich gezaehlt.
  const gibStapelrestZurueck = async (rest) => {
    for (const a of rest) {
      // Ist auch die Reserve aufgebraucht, wird nichts mehr geschrieben: dann traegt die
      // ablaufende Lease den Auftrag zurueck (langsamer, aber nichts geht verloren).
      if (verbleibend() <= 0 || typeof d.zurueckstellen !== "function") {
        bilanz.stapelrestNichtZurueckgegeben += 1;
        continue;
      }
      const z = await d.zurueckstellen({
        id: a.id, owner: besitzer, delayMs: 1000, grund: "zeitbudget-des-laufs-erschoepft"
      }).catch(() => null);
      if (z && z.verfuegbar !== false && z.uebernommen !== false) bilanz.stapelrestZurueckgegeben += 1;
      else bilanz.stapelrestNichtZurueckgegeben += 1;
    }
  };

  while (verbleibend() > ABSCHLUSS_RESERVE_MS) {
    const claim = await d.claim({ owner: besitzer, limit: stapel, leaseMs, types });
    if (!claim || claim.verfuegbar === false) {
      bilanz.verfuegbar = false;
      bilanz.grund = (claim && claim.grund) || "warteschlange-nicht-verfuegbar";
      break;
    }
    const auftraege = claim.auftraege || [];
    if (!auftraege.length) {
      // Nichts faellig. Hat DIESER Worker eigene Arbeit zurueckgestellt, ist "nichts faellig"
      // nicht dasselbe wie "nichts mehr zu tun" — die Wiederholung ist nur noch nicht dran.
      const eigeneWiedervorlage = bilanz.wiederholt > 0 || bilanz.zurueckgestellt > 0;
      if (leerlaufWarteMs > 0 && eigeneWiedervorlage
          && verbleibend() > leerlaufWarteMs + ABSCHLUSS_RESERVE_MS) {
        bilanz.leerlaufWarten += 1;
        await schlafe(leerlaufWarteMs);
        continue;
      }
      break;                                            // nichts faellig -> sauberes Ende
    }
    bilanz.reserviert += auftraege.length;

    for (let index = 0; index < auftraege.length; index += 1) {
      const auftrag = auftraege[index];
      if (verbleibend() <= ABSCHLUSS_RESERVE_MS) {
        // Zeit alle: NICHT abschliessen — aber auch nicht einfach liegen lassen. Der Rest
        // des Stapels wird zurueckgegeben, damit er den bereits gezogenen Versuch nicht
        // verbraucht (siehe gibStapelrestZurueck). Das ist der Unterschied zu
        // "still verlieren" UND zu "still verbrennen".
        await gibStapelrestZurueck(auftraege.slice(index));
        break;
      }
      // Ausfuehrung ueber den GETEILTEN Kern (siehe fuehreAuftragAus): identisch fuer
      // Cron, Warteschlange und den verwalteten Queue-Verbraucher.
      const lauf = await fuehreAuftragAus({
        auftrag, deps: d, besitzer, leaseMs,
        restzeitMs: verbleibend() - ABSCHLUSS_RESERVE_MS,
        bilanz
      });
      if (lauf.ausgang === "lease-verloren" && lauf.bilanz === bilanz) continue;
    }
  }

  bilanz.dauerMs = d.now() - start;
  bilanz.verarbeitet = bilanz.erledigt + bilanz.wiederholt + bilanz.endgueltigFehlgeschlagen;
  return bilanz;
}

// DB-Zeile -> Handler-Sicht. Die SQL liefert snake_case, der Handler denkt in Fachbegriffen.
function normalisiereAuftrag(zeile = {}) {
  return {
    id: zeile.id,
    jobType: zeile.job_type,
    payload: zeile.payload || {},
    tenantId: zeile.tenant_id || null,
    attempts: Number(zeile.attempts) || 0,
    maxAttempts: Number(zeile.max_attempts) || 5,
    freshnessWindow: zeile.freshness_window || null,
    // Faelligkeit UND Entstehung werden durchgereicht: die Vorbedingungspruefung braucht
    // eine zeitliche Obergrenze, und die darf nicht an einem Wert haengen, den das
    // Zurueckstellen selbst verschiebt (siehe VORBEDINGUNG_MAX_WARTE_MS).
    dueAt: zeile.due_at || null,
    createdAt: zeile.created_at || null
  };
}

// --- Wiedervorlage (OP-30, Befund O5) ---------------------------------------------------------
//
// Der Idempotenzschluessel des Verstehens traegt kein Fenster (das ist richtig: derselbe
// Artikel soll nicht in jedem Fenster erneut angemeldet werden). Die Kehrseite: ein
// ENDGUELTIG gescheiterter Verstehensauftrag blockiert dieselbe Dokumentmenge fuer immer,
// und `helmut_jobs_bereinigen` raeumt `fehlgeschlagen` bewusst nicht weg. Ohne Gegenzug
// waeren diese Dokumente dauerhaft verloren — nach einer einzigen voruebergehenden Stoerung.
//
// Deshalb: vor dem Arbeiten werden endgueltig gescheiterte Auftraege BEGRENZT oft wieder
// vorgelegt. Nicht unbegrenzt — nach `HELMUT_WIEDERVORLAGE_MAX` Anlaeufen bleibt der Auftrag
// gescheitert und wird als `dauerhaft blockiert` GEMELDET statt still im Kreis zu laufen.
const WIEDERVORLAGE_STUNDEN = Math.max(1, Number(process.env.HELMUT_WIEDERVORLAGE_STUNDEN) || 24);
const WIEDERVORLAGE_MAX = (() => {
  const roh = String(process.env.HELMUT_WIEDERVORLAGE_MAX ?? "").trim();
  const n = Number(roh);
  return roh !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2;
})();
const WIEDERVORLAGE_TYPEN = ["document_understanding", "source_fetch"];

async function wiedervorlage({ deps = {}, env = process.env, trockenlauf = false } = {}) {
  if (!skalierbarerPfadAktiv(env)) return { uebersprungen: true, grund: "flag-aus" };
  const fn = deps.wiedervorlage || ((o) => require("./storage").jobQueueWiedervorlage(o));
  const antwort = await fn({
    typen: WIEDERVORLAGE_TYPEN,
    aelterAlsStunden: WIEDERVORLAGE_STUNDEN,
    maxWiedervorlagen: WIEDERVORLAGE_MAX,
    trockenlauf
  }).catch((error) => ({ verfuegbar: false, grund: bereinigeFehler(error) }));
  return { uebersprungen: false, ...antwort, max: WIEDERVORLAGE_MAX, stunden: WIEDERVORLAGE_STUNDEN };
}

// --- Betriebsmessung --------------------------------------------------------------------------

// Schwellen: Warnung VOR 24 h, kritisch spaetestens BEI 24 h oder bei einem endgueltigen
// Fehler (Auftrag §11). Keine neue Oberflaeche — eine serverseitige Funktion mit
// strukturierter, testbarer Ausgabe.
const WARN_ALTER_S = 18 * 3600;
const KRITISCH_ALTER_S = 24 * 3600;

// ── WORAUF SICH DIE ALTERSGRENZE BEZIEHT (Korrektursprint 2026-08-12) ──────────────────────
//
// BELEGTER FEHLBEFUND (Production, 2026-08-11 20:04 UTC, Runbook §15.5): der erste Lauf des
// skalierbaren Pfades erzeugte 235 Auftraege, alle wenige Minuten alt, 0 endgueltige Fehler,
// keiner haengend — und `betriebsstatus` meldete `kritisch` mit „aeltester offener Auftrag
// 504 477 s = 5,84 Tage". Die verbindliche Abbruchgrenze §8.2 trat ein, K2/K3 wurden nie
// begonnen. An echter PostgreSQL 16.13 nachgestellt (scripts/jobqueue-alter-datenbank-test.js).
//
// URSACHE: gemessen wurde die FAELLIGKEIT, nicht die WARTEZEIT. `first_due_at` ist die
// fachliche Faelligkeit beim Einreihen und liegt bauartbedingt in der Vergangenheit, sobald
// ein Auftrag in ein bereits laufendes Aktualitaetsfenster faellt (`source-demand.js` streut
// ab Fensterbeginn: „ein bereits faelliger Auftrag bleibt sofort faellig"). Beim
// ARCHIVFENSTER der Personensuchen ist dieses Fenster 7 Tage breit — ein heute erzeugter
// Archivauftrag traegt damit ein bis zu 6,3 Tage altes Quelldatum. In Production waren es
// genau die fuenf `person-archiv`-Auftraege im Fenster `2026-08-06T00Z`; alle 230 uebrigen
// lagen unter 24 h. Die Grenze haette bei JEDEM ersten Lauf in einem laufenden 7-Tage-Fenster
// ausgeloest — sie war strukturell unbrauchbar, nicht nur ungluecklich kalibriert.
//
// ZWEI BEGRIFFE, ab hier ueberall gleich benannt (SQL, App, Runbook):
//   FAELLIGKEITSRUECKSTAND = now - first_due_at
//     „Seit wann WAERE diese Arbeit fachlich faellig gewesen." Bleibt gemeldet — er ist ein
//     echter Datenbefund (OP-15: Personenquellen, die seit Tagen nicht durchlaufen). Er ist
//     aber KEINE Betriebsgrenze, weil ein historisches Quelldatum ihn sofort gross macht.
//   WARTEZEIT              = max(now - max(created_at, first_due_at), 0)
//     „Wie lange wartet dieser Auftrag TATSAECHLICH, seit er bearbeitbar ist." Darauf
//     beziehen sich WARN_ALTER_S und KRITISCH_ALTER_S.
//
// Warum `created_at` und nicht `due_at`: `due_at` verschiebt `helmut_defer_job` bei JEDEM
// Zurueckstellen nach vorn — eine Messung dagegen waere durch Warten loeschbar (belegter
// Fehler 2026-08-08). `created_at` steht fest; ein wirklich alter Auftrag altert also weiter,
// auch nach beliebig vielen Zurueckstellungen und Wiederholungen. `first_due_at` deckelt nach
// oben: ein erst spaeter bearbeitbarer Auftrag wartet jetzt 0 s.
//
// RUECKFALL: liefert die Datenbank die drei Wartezeit-Spalten nicht (Migration 20260812 noch
// nicht angewendet), wird NICHT stillschweigend auf „gruen" gerechnet und auch nicht geraten.
// Dann gilt ausdruecklich der alte, zu strenge Faelligkeitsvertrag — Fehlalarm statt falschem
// Gruen — und `altersvertrag` sagt, welcher Vertrag gemessen hat (CLAUDE.md §4.4).
const ALTERSVERTRAG_WARTEZEIT = "wartezeit";
const ALTERSVERTRAG_ALT = "faelligkeit-alt";

// Ab wann wartet dieser Auftrag wirklich? Eine Funktion, damit App und Attrappe denselben
// Satz benutzen wie die SQL-Fassung in 20260812_jobqueue_altersmessung.sql.
function bearbeitbarAbMs(zeile = {}) {
  const entstanden = Date.parse(zeile.createdAt || zeile.created_at || "");
  const faellig = Date.parse(zeile.firstDueAt || zeile.first_due_at || "");
  const werte = [entstanden, faellig].filter((n) => Number.isFinite(n));
  return werte.length ? Math.max(...werte) : null;
}

function wartezeitS(zeile, jetztMs) {
  const ab = bearbeitbarAbMs(zeile);
  if (ab == null) return 0;              // ohne jede Zeitangabe wird nichts behauptet
  return Math.max(0, (jetztMs - ab) / 1000);
}

// ── WARTESCHLANGENWACHE V2 (Sprint 2026-08-17, Runbook §19.6 Punkt 1 + §26) ────────────────
//
// BELEGTE FEHLBEFUNDE, die dieser Vertrag behebt:
//   * Ausgeschalteter Motor + inerter Bestand meldete `kritisch` („alter-…-ueber-24h"), als
//     laege ein Produktionsfehler vor — dabei holt bei `HELMUT_SCALABLE_PIPELINE=off` niemand
//     die Auftraege ab; die 24-h-Marke ist dort bedeutungslos (Runbook §19.5). Ein
//     ausgeschalteter Pfad darf aber auch NICHT als „gruen" erscheinen: niemand arbeitet.
//     Er bekommt deshalb einen EIGENEN, ehrlichen Zustand: `inaktiv`.
//   * Nach einer Reaktivierung zaehlte die Wartezeit ab `created_at` — ein Auftrag, der
//     nachweislich NICHT ausfuehrbar war (Motor aus), waere allein wegen seines
//     Erstellungsdatums sofort `kritisch` gewesen (die dritte Falle aus §17.7(d)). Die
//     betriebliche Frist beginnt erst, wenn der Auftrag AUSFUEHRBAR wird: der Betreiber
//     erklaert den Aktivierungszeitpunkt in `HELMUT_SCALABLE_PIPELINE_SEIT` (ISO-8601,
//     Teil des Aktivierungsablaufs); die effektive Wartezeit ist dann
//     min(gemessene Wartezeit, jetzt − aktivSeit). OHNE die Variable gilt weiterhin die
//     rohe Wartezeit — Fehlalarm zulaessig, falsches Gruen nie (CLAUDE.md §4.4).
//
// NEUN ZUSTANDSKLASSEN (maschinenlesbar in `zustandsklasse`; `zustand` bleibt die
// Schweregrad-Ampel fuer bestehende Verbraucher — Werte: inaktiv|gruen|warnung|kritisch|
// unbekannt; `inaktiv` ist neu und ueber `statusvertrag: 2` versioniert):
const STATUSVERTRAG_VERSION = 2;
const ZUSTANDSKLASSEN = Object.freeze({
  INAKTIV: "inaktiv-inert",                                  // 1 Motor aus, Bestand bewusst inert
  KEINE_FAELLIGE_ARBEIT: "aktiv-keine-faellige-arbeit",      // 2 Motor an, nichts faellig
  GESUND: "aktiv-gesund",                                    // 3 Motor an, gesunder Abfluss
  VERZOEGERT: "aktiv-verzoegert",                            // 4 Motor an, verzoegerter Abfluss
  FESTGEFAHREN: "aktiv-festgefahren",                        // 5 Motor an, wirklich festgefahren
  LEASE_OHNE_FORTSCHRITT: "aktiv-lease-ohne-fortschritt",    // 6 Lease abgelaufen, Zeile haengt in `laeuft`
  UEBERFAELLIG_TROTZ_ABFLUSS: "aktiv-ueberfaellig-trotz-abfluss", // 7 Verbraucher arbeiten, Altarbeit > 24 h
  ABHAENGIGKEIT: "aktiv-abhaengigkeit-oder-anbietergrenze",  // 8 Schloss/Vorbedingung/Deckel, nicht der Verbraucher
  UNBEKANNT: "unbekannt"                                     // 9 unlesbar/widerspruechlich -> geschlossen blockieren
});
// Jede Klasse traegt die zugehoerige Betreiberaktion — die Meldung sagt, WAS zu tun ist,
// nicht nur, dass etwas ist.
const BETREIBERAKTION = Object.freeze({
  [ZUSTANDSKLASSEN.INAKTIV]: "keine — Bestand ist inert; vor einer Reaktivierung neutralisieren (Runbook §26) und HELMUT_SCALABLE_PIPELINE_SEIT setzen",
  [ZUSTANDSKLASSEN.KEINE_FAELLIGE_ARBEIT]: "keine",
  [ZUSTANDSKLASSEN.GESUND]: "keine",
  [ZUSTANDSKLASSEN.VERZOEGERT]: "beobachten, Ursache klaeren; Stufe halten (Runbook §8.2)",
  [ZUSTANDSKLASSEN.FESTGEFAHREN]: "sofort stoppen und zuruecknehmen (Runbook §7)",
  [ZUSTANDSKLASSEN.LEASE_OHNE_FORTSCHRITT]: "naechsten Slot abwarten (Lease-Wiederaufnahme); wiederholt: Verbraucher pruefen (Runbook §26)",
  [ZUSTANDSKLASSEN.UEBERFAELLIG_TROTZ_ABFLUSS]: "Abflussrate erhoehen oder zuruecknehmen (Runbook §19.4)",
  [ZUSTANDSKLASSEN.ABHAENGIGKEIT]: "Abhaengigkeit/Deckel pruefen (Verstehens-Schloss, Vorbedingungen, KI-Budget, Anbieter) — NICHT den Verbraucher neu starten",
  [ZUSTANDSKLASSEN.UNBEKANNT]: "geschlossen blockieren: keine Weiterlauf- oder Aktivierungsentscheidung auf dieser Messung; Messweg reparieren"
});

// Der erklaerte Aktivierungszeitpunkt. Nur der Betreiber setzt ihn (mit dem Flag zusammen);
// fehlt er, wird konservativ die rohe Wartezeit gemessen. Ein Zeitpunkt in der Zukunft ist
// ein WIDERSPRUCH (Flag an, aber „noch nicht aktiv"?) und blockiert geschlossen.
function motorAktivSeit(env = process.env, jetztMs = Date.now()) {
  const roh = String((env && env.HELMUT_SCALABLE_PIPELINE_SEIT) || "").trim();
  if (!roh) return { seitMs: null, befund: null, widerspruch: false };
  const ms = Date.parse(roh);
  if (!Number.isFinite(ms)) {
    return { seitMs: null, befund: `aktivseit-ungueltig:${roh.slice(0, 40)}`, widerspruch: false };
  }
  if (ms > jetztMs + 60000) {
    return { seitMs: ms, befund: "aktivseit-in-der-zukunft", widerspruch: true };
  }
  return { seitMs: ms, befund: null, widerspruch: false };
}

// Zurueckstellgruende buendeln. REIHENFOLGE TRAEGT: `zeitbudget-deckel` enthaelt „deckel",
// ist aber normales Slotende — Zeitgrenzen werden deshalb VOR den Anbieter-Mustern geprueft.
function klassifiziereZurueckstellgrund(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return "sonstig";
  if (/zeitbudget|zeitlimit|slotende/.test(t)) return "slotende";
  if (/budget|deckel|anbieter|quota|rate|429/.test(t)) return "anbietergrenze";
  if (/verstehen-uebersprungen|understanding-locked|vorbedingung-offen|klassengrenze|locked|sperre|schloss/.test(t)) return "abhaengigkeit";
  return "sonstig";
}

async function betriebsstatus({ deps = {}, seitMinuten = 1440, env = process.env } = {}) {
  const metrics = deps.metrics || ((m) => require("./storage").jobQueueMetrics(m));
  const blockierteFn = deps.blockierte || ((o) => require("./storage").jobQueueBlockiert(o));
  const gruendeFn = deps.zurueckgestellte
    || ((o) => require("./storage").jobQueueZurueckgestellteGruende(o));
  const jetztMs = typeof deps.now === "function" ? deps.now() : Date.now();
  const flagAn = skalierbarerPfadAktiv(env);
  const antwort = await metrics(seitMinuten);
  if (!antwort || antwort.verfuegbar === false) {
    return {
      verfuegbar: false,
      grund: (antwort && antwort.grund) || "unbekannt",
      // NICHT "gruen": eine nicht lesbare Warteschlange ist ein unbekannter Zustand,
      // kein gesunder (CLAUDE.md §4.4). Klasse 9: geschlossen blockieren.
      zustand: "unbekannt",
      statusvertrag: STATUSVERTRAG_VERSION,
      zustandsklasse: ZUSTANDSKLASSEN.UNBEKANNT,
      betreiberaktion: BETREIBERAKTION[ZUSTANDSKLASSEN.UNBEKANNT],
      flag: flagAn ? "on" : "off"
    };
  }
  const k = antwort.kennzahlen || {};
  const zahl = (v) => (v == null ? 0 : Number(v));
  const aeltester = zahl(k.aeltester_faelliger_s);
  const maxMandat = zahl(k.max_mandatsalter_s);
  const endgueltig = zahl(k.endgueltig_fehler);

  // Liefert die Ablage die Wartezeitsicht? Alle drei Spalten muessen da sein — eine halbe
  // Messung waere schlimmer als die alte, weil niemand saehe, welcher Vertrag gilt.
  const wartezeitVertrag = k.aeltester_offener_s != null
    && k.max_mandatswartezeit_s != null
    && k.ueberfaellige_mandate_wartezeit != null;
  const altersvertrag = wartezeitVertrag ? ALTERSVERTRAG_WARTEZEIT : ALTERSVERTRAG_ALT;

  const wartezeit = zahl(k.aeltester_offener_s);
  const mandatsWartezeit = zahl(k.max_mandatswartezeit_s);
  const wartend = zahl(k.wartend);
  const laufend = zahl(k.laufend);
  const aktiveLeases = zahl(k.aktive_leases);
  const erledigtImZeitraum = zahl(k.erledigt_im_zeitraum);

  // ── KLASSE 9 ZUERST: widerspruechliche Messwerte blockieren GESCHLOSSEN ──────────────────
  // Ein Zaehler, der keiner ist, eine Lease-Zahl groesser als die Laufend-Zahl oder ein
  // erklaerter Aktivierungszeitpunkt in der Zukunft: darauf wird keine Betriebsentscheidung
  // gebaut — weder „gruen" noch „kritisch", sondern `unbekannt` (CLAUDE.md §4.4).
  const aktivSeit = flagAn ? motorAktivSeit(env, jetztMs) : { seitMs: null, befund: null, widerspruch: false };
  const widersprueche = [];
  for (const [name, wert] of [["wartend", wartend], ["laufend", laufend],
    ["aktive_leases", aktiveLeases], ["endgueltig_fehler", endgueltig],
    ["erledigt_im_zeitraum", erledigtImZeitraum]]) {
    if (!Number.isFinite(wert) || wert < 0) widersprueche.push(`${name}:${String(k[name]).slice(0, 20)}`);
  }
  // Auch die Alterswerte muessen Zahlen sein — eine NaN-Wartezeit wuerde sonst alle
  // Schwellenvergleiche still zu `false` machen und saehe aus wie „gruen". Negativ ist nur
  // dort ein Widerspruch, wo die Formel Negatives ausschliesst (Faelligkeits-/Wartezeit-
  // Maxima ueber gefilterte bzw. geklemmte Mengen); `max_mandatsalter_s` DARF negativ sein
  // (ein rein zukuenftig faelliger Bestand — SQL wie Attrappe rechnen `now - first_due_at`).
  for (const feld of ["aeltester_faelliger_s", "aeltester_offener_s",
    "max_mandatswartezeit_s", "ueberfaellige_mandate_wartezeit"]) {
    if (k[feld] != null && (!Number.isFinite(Number(k[feld])) || Number(k[feld]) < 0)) {
      widersprueche.push(`${feld}:${String(k[feld]).slice(0, 20)}`);
    }
  }
  if (k.max_mandatsalter_s != null && !Number.isFinite(Number(k.max_mandatsalter_s))) {
    widersprueche.push(`max_mandatsalter_s:${String(k.max_mandatsalter_s).slice(0, 20)}`);
  }
  if (Number.isFinite(aktiveLeases) && Number.isFinite(laufend) && aktiveLeases > laufend) {
    widersprueche.push("aktive_leases-groesser-laufend");
  }
  if (aktivSeit.widerspruch) widersprueche.push(aktivSeit.befund);
  if (widersprueche.length) {
    return {
      verfuegbar: true,
      flag: flagAn ? "on" : "off",
      zustand: "unbekannt",
      statusvertrag: STATUSVERTRAG_VERSION,
      zustandsklasse: ZUSTANDSKLASSEN.UNBEKANNT,
      betreiberaktion: BETREIBERAKTION[ZUSTANDSKLASSEN.UNBEKANNT],
      befunde: widersprueche.map((w) => `widerspruch:${w}`),
      altersvertrag
    };
  }

  // DIE GRENZE MISST DIE WARTEZEIT (siehe Block oben). Ohne die Migration bleibt der alte,
  // zu strenge Faelligkeitsbezug — sichtbar benannt, nie stillschweigend.
  const rohesAlter = wartezeitVertrag
    ? Math.max(wartezeit, mandatsWartezeit)
    : Math.max(aeltester, maxMandat);
  // EFFEKTIVE WARTEZEIT: die betriebliche Frist beginnt, wenn die Arbeit AUSFUEHRBAR wird.
  // Ein waehrend der Abschaltung entstandener Auftrag zaehlt ab dem erklaerten
  // Aktivierungszeitpunkt, nicht ab seinem Erstellungsdatum (§17.7(d), Vertrag §26).
  const alter = aktivSeit.seitMs != null
    ? Math.min(rohesAlter, Math.max(0, (jetztMs - aktivSeit.seitMs) / 1000))
    : rohesAlter;
  const ueberfaellig = wartezeitVertrag
    ? zahl(k.ueberfaellige_mandate_wartezeit)
    : zahl(k.ueberfaellige_mandate);
  // Abgelaufene Leases: Zeilen, die in `laeuft` stehen, deren Halter sich aber nicht mehr
  // meldet. Am Slotende by design (Wiederaufnahme im naechsten Slot) — aber nie unsichtbar.
  const abgelaufeneLeases = Math.max(0, laufend - aktiveLeases);
  // Faellige Arbeit: gibt es ueberhaupt etwas, das JETZT bearbeitet werden koennte?
  const faelligeArbeit = wartend > 0 && aeltester > 0;

  const befunde = [];
  if (aktivSeit.befund && !aktivSeit.widerspruch) befunde.push(aktivSeit.befund);
  if (aktivSeit.seitMs != null && rohesAlter > alter + 1) {
    // Sichtbar machen, dass geklemmt wurde — die rohe Messung bleibt in den Kennzahlen.
    befunde.push(`wartezeit-ab-aktivierung:${Math.round(alter)}s-statt-${Math.round(rohesAlter)}s`);
  }
  if (!wartezeitVertrag) {
    // Kein falsches Gruen und keine stille Umdeutung: der Betreiber muss sehen, dass hier
    // noch die Faelligkeit gemessen wurde und ein historisches Quelldatum durchschlagen kann.
    befunde.push("altersmessung-alt:migration-20260812-fehlt");
  } else if (maxMandat >= KRITISCH_ALTER_S) {
    // DER FACHLICHE RUECKSTAND BLEIBT SICHTBAR (CLAUDE.md §4.4), aendert aber den
    // Betriebszustand nicht: er sagt „diese Quelle laeuft seit Tagen nicht durch" (OP-15),
    // nicht „die Warteschlange kommt nicht hinterher".
    befunde.push(`faelligkeitsrueckstand:${Math.round(maxMandat)}s-nicht-wartezeit`);
  }

  // DAUERHAFT BLOCKIERTE ARBEIT (Befund O5). Sie steht in KEINER der Kennzahlen oben:
  // `endgueltig_fehler` zaehlt nur das gewaehlte Zeitfenster, und ein Auftrag, der seine
  // Wiedervorlagen aufgebraucht hat, faellt nach ein paar Tagen aus jeder Zeitreihe heraus.
  // Er ist dann unsichtbar — und die Warteschlange meldet „gruen", obwohl Dokumente
  // dauerhaft ungelesen bleiben. Genau das verbietet CLAUDE.md §4.4.
  const blockiert = await blockierteFn({ maxWiedervorlagen: WIEDERVORLAGE_MAX })
    .catch((error) => ({ verfuegbar: false, grund: bereinigeFehler(error) }));
  const dauerhaftBlockiert = blockiert && blockiert.verfuegbar ? Number(blockiert.blockiert) || 0 : null;

  // ZURUECKSTELLGRUENDE der wartenden Auftraege — unterscheidet „Abhaengigkeit/Deckel" von
  // „Verbraucher festgefahren". Ein Lesefehler ist eine benannte Messluecke, nie ein leeres
  // Ergebnis; die Klassifikation faellt dann auf die strengeren Klassen 4/5/7 zurueck.
  const gruendeRoh = wartend > 0
    ? await gruendeFn({ limit: 1000 }).catch((error) => ({ verfuegbar: false, grund: bereinigeFehler(error) }))
    : { verfuegbar: true, anzahl: 0, texte: [] };
  const nachGrundklasse = { abhaengigkeit: 0, anbietergrenze: 0, slotende: 0, sonstig: 0 };
  if (gruendeRoh && gruendeRoh.verfuegbar) {
    for (const text of gruendeRoh.texte || []) nachGrundklasse[klassifiziereZurueckstellgrund(text)] += 1;
  }
  const blockierendeGruende = nachGrundklasse.abhaengigkeit + nachGrundklasse.anbietergrenze;
  const anteilBlockierend = wartend > 0 ? blockierendeGruende / wartend : 0;
  const gruendeVerfuegbar = Boolean(gruendeRoh && gruendeRoh.verfuegbar);

  // ── KLASSENENTSCHEID (erste zutreffende Regel gewinnt) UND SCHWEREGRAD-AMPEL ─────────────
  // Der Schweregrad bleibt fuer Klassen 3–8 EXAKT der bisherige Vertrag (18 h Warnung,
  // 24 h kritisch, endgueltige Fehler kritisch, dauerhaft Blockierte kritisch) — ein echter
  // Rueckstau wird durch V2 NIE verharmlost. Neu ist ausschliesslich: `inaktiv` statt
  // fataler Fehlmeldung bei ausgeschaltetem Motor, die Aktivierungsklemme oben und die
  // Diagnoseklasse mit Betreiberaktion.
  let zustand;
  let zustandsklasse;
  if (!flagAn) {
    // KLASSE 1: bewusst inert. NICHT gruen (niemand arbeitet) und NICHT kritisch (die
    // 24-h-Marke ist ohne Verbraucher bedeutungslos, Runbook §19.5). Alles bleibt sichtbar.
    zustandsklasse = ZUSTANDSKLASSEN.INAKTIV;
    zustand = "inaktiv";
    const bestand = wartend + laufend;
    befunde.unshift(`inert-bestand:${bestand}`);
    if (laufend > 0) befunde.push(`inert-restarbeit:${laufend}`);
    if (endgueltig > 0) befunde.push(`endgueltige-fehler:${endgueltig}`);
    if (dauerhaftBlockiert != null && dauerhaftBlockiert > 0) befunde.push(`dauerhaft-blockiert:${dauerhaftBlockiert}`);
  } else {
    zustand = "gruen";
    if (endgueltig > 0) { zustand = "kritisch"; befunde.push(`endgueltige-fehler:${endgueltig}`); }
    if (alter >= KRITISCH_ALTER_S) { zustand = "kritisch"; befunde.push(`alter-${Math.round(alter)}s-ueber-24h`); }
    else if (alter >= WARN_ALTER_S) { if (zustand !== "kritisch") zustand = "warnung"; befunde.push(`alter-${Math.round(alter)}s-naehert-24h`); }
    if (ueberfaellig > 0) {
      if (zustand === "gruen") zustand = "warnung";
      befunde.push(`ueberfaellige-mandate:${ueberfaellig}`);
    }
    if (dauerhaftBlockiert != null && dauerhaftBlockiert > 0) {
      zustand = "kritisch";
      befunde.push(`dauerhaft-blockiert:${dauerhaftBlockiert}`);
    }
    if (abgelaufeneLeases > 0) {
      if (zustand === "gruen") zustand = "warnung";
      befunde.push(`leases-abgelaufen:${abgelaufeneLeases}`);
    }
    // Eine Messluecke ist keine gruene Zusage: ohne Blockierten-Sicht hoechstens `warnung`.
    if (dauerhaftBlockiert == null) {
      if (zustand === "gruen") zustand = "warnung";
      befunde.push(`blockierte-unbekannt:${(blockiert && blockiert.grund) || "unbekannt"}`);
    }
    if (!gruendeVerfuegbar && wartend > 0) {
      befunde.push(`zurueckstellgruende-unbekannt:${(gruendeRoh && gruendeRoh.grund) || "unbekannt"}`);
    }

    if (dauerhaftBlockiert != null && dauerhaftBlockiert > 0) {
      zustandsklasse = ZUSTANDSKLASSEN.ABHAENGIGKEIT;                        // Klasse 8
    } else if (endgueltig > 0) {
      zustandsklasse = ZUSTANDSKLASSEN.FESTGEFAHREN;                         // Klasse 5
    } else if (alter >= KRITISCH_ALTER_S) {
      if (gruendeVerfuegbar && anteilBlockierend >= 0.5) {
        zustandsklasse = ZUSTANDSKLASSEN.ABHAENGIGKEIT;                      // Klasse 8
      } else if (erledigtImZeitraum > 0) {
        zustandsklasse = ZUSTANDSKLASSEN.UEBERFAELLIG_TROTZ_ABFLUSS;         // Klasse 7
      } else {
        zustandsklasse = ZUSTANDSKLASSEN.FESTGEFAHREN;                       // Klasse 5
      }
    } else if (abgelaufeneLeases > 0) {
      zustandsklasse = ZUSTANDSKLASSEN.LEASE_OHNE_FORTSCHRITT;               // Klasse 6
    } else if (alter >= WARN_ALTER_S || ueberfaellig > 0) {
      zustandsklasse = (gruendeVerfuegbar && anteilBlockierend >= 0.5)
        ? ZUSTANDSKLASSEN.ABHAENGIGKEIT                                      // Klasse 8
        : ZUSTANDSKLASSEN.VERZOEGERT;                                        // Klasse 4
    } else if (laufend === 0 && (wartend === 0 || !faelligeArbeit)) {
      zustandsklasse = ZUSTANDSKLASSEN.KEINE_FAELLIGE_ARBEIT;                // Klasse 2
    } else {
      zustandsklasse = ZUSTANDSKLASSEN.GESUND;                               // Klasse 3
    }
  }

  return {
    verfuegbar: true,
    flag: flagAn ? "on" : "off",
    zustand,
    // Der maschinenlesbare Vertrag V2: Diagnoseklasse + zugehoerige Betreiberaktion.
    statusvertrag: STATUSVERTRAG_VERSION,
    zustandsklasse,
    betreiberaktion: BETREIBERAKTION[zustandsklasse],
    befunde,
    // Welcher Altersbegriff hat hier gemessen? Steht IMMER dabei, damit eine Meldung nie
    // mehr behauptet, als die Ablage traegt (CLAUDE.md §4.10).
    altersvertrag,
    motor: {
      aktiv: flagAn,
      aktivSeit: aktivSeit.seitMs != null ? new Date(aktivSeit.seitMs).toISOString() : null
    },
    blockiert: blockiert && blockiert.verfuegbar
      ? { anzahl: Number(blockiert.blockiert) || 0, nachTyp: blockiert.nachTyp || {}, aeltester: blockiert.aeltester || null }
      : { anzahl: null, grund: (blockiert && blockiert.grund) || "unbekannt" },
    zurueckgestellt: gruendeVerfuegbar
      ? { verfuegbar: true, nachGrundklasse, anteilBlockierend: Math.round(anteilBlockierend * 100) / 100 }
      : { verfuegbar: false, grund: (gruendeRoh && gruendeRoh.grund) || "unbekannt" },
    kennzahlen: {
      wartend: zahl(k.wartend),
      laufend: zahl(k.laufend),
      aktiveLeases: zahl(k.aktive_leases),
      aeltesterFaelligerS: aeltester,
      erledigtImZeitraum: zahl(k.erledigt_im_zeitraum),
      fehlgeschlagenGesamt: zahl(k.fehlgeschlagen_gesamt),
      endgueltigFehler: endgueltig,
      wiederholungen: zahl(k.wiederholungen),
      mittlereDauerS: zahl(k.mittlere_dauer_s),
      durchsatzProStunde: zahl(k.durchsatz_pro_stunde),
      // FAELLIGKEITSSICHT (unveraendert, weiter gemeldet, NICHT mehr die Grenze):
      ueberfaelligeMandate: zahl(k.ueberfaellige_mandate),
      maxMandatsalterS: maxMandat,
      // WARTEZEITSICHT (2026-08-12) — hierauf beziehen sich die Schwellen. `null` heisst
      // ausdruecklich „nicht gemessen" (Migration fehlt), nicht „0".
      aeltesterOffenerS: wartezeitVertrag ? wartezeit : null,
      maxMandatswartezeitS: wartezeitVertrag ? mandatsWartezeit : null,
      ueberfaelligeMandateWartezeit: wartezeitVertrag ? zahl(k.ueberfaellige_mandate_wartezeit) : null,
      // Der Wert, gegen den WARN_ALTER_S/KRITISCH_ALTER_S tatsaechlich geprueft wurden —
      // seit V2 die EFFEKTIVE Wartezeit (ab Ausfuehrbarkeit, s. `HELMUT_SCALABLE_PIPELINE_SEIT`).
      gemessenesAlterS: alter,
      // Die ungekappte Messung bleibt daneben stehen (kein Wert verschwindet).
      rohesAlterS: rohesAlter,
      // Zeilen in `laeuft`, deren Lease abgelaufen ist (Halter meldet sich nicht mehr).
      abgelaufeneLeases,
      nachTyp: k.nach_typ || {},
      nachStatus: k.nach_status || {},
      // Geschaetzte Kapazitaetsreserve: wie oft passt der Rueckstand in das, was im
      // Zeitraum tatsaechlich geschafft wurde? null = noch keine Messgrundlage.
      // Ausdruecklich eine SCHAETZUNG aus beobachtetem Durchsatz, keine Zusage.
      kapazitaetsreserveFaktor: zahl(k.erledigt_im_zeitraum) > 0 && zahl(k.wartend) > 0
        ? Math.round((zahl(k.erledigt_im_zeitraum) / zahl(k.wartend)) * 100) / 100
        : (zahl(k.wartend) === 0 ? null : 0)
    },
    schwellen: {
      warnungAlterS: WARN_ALTER_S,
      kritischAlterS: KRITISCH_ALTER_S,
      // Der Bezugspunkt gehoert zur Schwelle. Ohne ihn ist „24 h" zweideutig — genau die
      // Zweideutigkeit, die den Fehlbefund vom 2026-08-11 erzeugt hat.
      bezug: wartezeitVertrag ? "wartezeit-ab-bearbeitbarkeit" : "faelligkeit-first-due-at"
    }
  };
}

module.exports = {
  fuehreAuftragAus,
  leereAuftragsBilanz,
  skalierbarerPfadAktiv,
  waehleVerarbeitungspfad,
  // Fuenfter Auftragstyp (E1, 2026-08-09):
  narrativFlagAktiv,
  narrativUeberWarteschlange,
  planeArbeit,
  // Befund R2 (Abschlussreview PR #236): Tagesplan ohne Planung, fuer den Narrativslot.
  tagesplanFuerLauf,
  arbeite,
  betriebsstatus,
  workerDeps,
  normalisiereAuftrag,
  // OP-30/O1–O5 (Sprint Aktivierungsreife 2026-08-09):
  globalerTagesdeckel,
  enthalteneFenster,
  wiedervorlage,
  BUDGET_MAX_WARTE_MS,
  WIEDERVORLAGE_STUNDEN,
  WIEDERVORLAGE_MAX,
  WIEDERVORLAGE_TYPEN,
  // exportiert fuer Vertragstests:
  bereinigeFehler,
  istEndgueltig,
  backoffMs,
  mitZeitgrenze,
  AUFTRAG_MAX_MS,
  // Kapazitaetssprint 2026-08-09: eigene, nur SENKENDE Zeitgrenze je Aufgabentyp.
  TYP_ZEITGRENZE_MS,
  typZeitgrenze,
  HANDLER,
  WARN_ALTER_S,
  KRITISCH_ALTER_S,
  // Altersmessung (Korrektursprint 2026-08-12): eine Formel fuer App, Attrappe und Tests.
  ALTERSVERTRAG_WARTEZEIT,
  ALTERSVERTRAG_ALT,
  bearbeitbarAbMs,
  wartezeitS,
  // NEU in diesem Sprint (V3-Anbindung + Budget), exportiert fuer Vertragstests:
  budgetFairnessAktiv,
  budgetAdapter,
  vorbedingungOffen,
  mandatsKennungVon,
  VORBEDINGUNGEN,
  VORBEDINGUNG_WARTE_MS,
  VORBEDINGUNG_MAX_WARTE_MS,
  BUDGET_WARTE_MS,
  UNDERSTANDING_BUENDEL,
  buendelHash,
  // Abschlussreview 2026-08-08: exportiert, damit die Kennungswahrheit
  // (`rd-<inhaltsfingerabdruck>` statt Blob-`raw-…`) direkt pruefbar ist.
  rohdokumentKennungen,
  // OP-30-Zielarchitektur (2026-08-13): Enqueue-Weiche + verteilte Klassengrenzen,
  // exportiert fuer Vertrags-, Datenbank- und Mutationstests.
  standardEnqueue,
  klassenGrenzenAktiv,
  klassenMax,
  klassenAdapter,
  KLASSEN_STANDARD,
  // Warteschlangenwache V2 (2026-08-17): neun Zustandsklassen, Betreiberaktionen,
  // erklaerter Aktivierungszeitpunkt und Grundklassifikation — exportiert fuer Vertragstests.
  STATUSVERTRAG_VERSION,
  ZUSTANDSKLASSEN,
  BETREIBERAKTION,
  motorAktivSeit,
  klassifiziereZurueckstellgrund
};
