"use strict";

// Helmut — AUSTAUSCHBARER TRANSPORT für Wecksignale (OP-30-Zielarchitektur, 2026-08-13).
// =============================================================================================
// WAS DAS IST: die eine, kleine Schicht zwischen dem Auftragsbuch (helmut_jobs + Outbox in
// Supabase) und einem austauschbaren Zustellweg, der Verbraucher EREIGNISGESTEUERT aufweckt.
//
// DIE DREI UNVERHANDELBAREN ZUSAGEN DIESER SCHICHT:
//   1. SUPABASE BLEIBT DIE WAHRHEIT. Kein Transportdienst erfährt oder entscheidet je den
//      Zustand eines Auftrags. Der Transport trägt ausschließlich ein Wecksignal; der
//      Verbraucher beansprucht den Auftrag ATOMAR in Supabase (helmut_claim_jobs) — mehrfache
//      Zustellung ist damit strukturell ungefährlich.
//   2. DATENSPARSAMKEIT IST STRUKTURELL. Das Transport-Payload besteht aus GENAU zwei
//      Feldern: der zufälligen Auftrags-ID (uuid) und der Schema-Version. Keine politischen
//      Inhalte, keine Namen, keine Mandats-IDs, keine Quellen-URLs, keine Prompts, keine
//      Dokumenttexte. `transportPayload` kann nichts anderes bauen, und `pruefeTransportPayload`
//      weist jedes abweichende Objekt hart ab (Vertragstest + Laufzeitriegel).
//   3. AUSTAUSCHBARKEIT OHNE FACHKERN-ÄNDERUNG. Kein Fachhandler kennt einen Transport.
//      Ein Wechsel (Selbstweck ↔ Vercel Queues ↔ späterer externer Worker) ändert
//      ausschließlich diese Datei bzw. die Konfiguration — nie Auftragstypen, Handler oder
//      Ergebnisdaten.
//
// FLAGGRENZE — fail closed wie alle OP-30-Flags:
//   HELMUT_JOB_DISPATCH_MODE = off | shadow | queue.  Jeder andere Wert — leer, Tippfehler,
//   Großschreibung mit Zusatz — bedeutet 'off'. Bedeutung:
//     off    → keine Outbox-Schreibung, kein Versand, byte-identisches Bestandsverhalten.
//     shadow → Auftrag + Versandabsicht + Versandplanung werden BEWIESEN (Outbox-Zeilen
//              durchlaufen den vollen Zustandsautomaten), aber es verlässt NICHTS den
//              Prozess. Kein HTTP, kein externer Dienst.
//     queue  → Versand über den konfigurierten Transport (HELMUT_JOB_TRANSPORT).
//
// BETRIEBSMODI (Auftrag §14) — es gibt immer genau EINEN primären Antrieb:
//     bestand    → HELMUT_SCALABLE_PIPELINE aus: der alte Direktpfad. Dispatch-Konfiguration
//                  ist dann WIRKUNGSLOS (und wird als Widerspruch benannt, nie still gelebt).
//     cron-queue → Warteschlange an, Dispatch off/shadow: die Cron-Slots sind der Antrieb
//                  (heutiger Zustand; shadow beweist nebenher die Outbox).
//     ereignis   → Warteschlange an, Dispatch queue: Wecksignale sind der primäre Antrieb;
//                  die Cron-Slots bleiben Planer + Abgleich + kontrollierter Rückfallweg.

const crypto = require("crypto");

const SCHEMA_VERSION = 1;
// Wartezeit, mit der eine zurueckgelegte Versandabsicht erneut faellig wird.
const RUECKLEGE_WARTE_S = 60;

// ── Modus (fail closed) ───────────────────────────────────────────────────────────────────────
const GUELTIGE_MODI = Object.freeze(["off", "shadow", "queue"]);

function dispatchModus(env = process.env) {
  const roh = String((env && env.HELMUT_JOB_DISPATCH_MODE) || "").trim().toLowerCase();
  return GUELTIGE_MODI.includes(roh) ? roh : "off";
}

// Outbox-Schreibung aktiv? NUR wenn der skalierbare Pfad überhaupt läuft UND ein Modus
// jenseits von off gewählt ist. Ohne Warteschlange gibt es nichts zu versenden.
function dispatchAktiv(env = process.env) {
  const scalable = require("./scalable-pipeline");
  return scalable.skalierbarerPfadAktiv(env) && dispatchModus(env) !== "off";
}

// ── Der EINE primäre Antrieb (Auftrag §14) ────────────────────────────────────────────────────
// Widersprüchliche Konfiguration stoppt geschlossen: sie wird benannt und der sicherste
// Modus gilt — nie schaltet ein Widerspruch still einen schärferen Pfad ein.
function waehleAntrieb(env = process.env) {
  const scalable = require("./scalable-pipeline");
  const pfadAn = scalable.skalierbarerPfadAktiv(env);
  const roh = String((env && env.HELMUT_JOB_DISPATCH_MODE) || "").trim().toLowerCase();
  const modus = dispatchModus(env);
  const widersprueche = [];

  if (roh && !GUELTIGE_MODI.includes(roh)) {
    widersprueche.push(`dispatch-modus-unbekannt:${roh.slice(0, 20)} (wirkt als off)`);
  }
  if (!pfadAn) {
    if (modus !== "off") {
      widersprueche.push("dispatch-ohne-warteschlange (HELMUT_JOB_DISPATCH_MODE gesetzt, HELMUT_SCALABLE_PIPELINE aus) — Dispatch wirkungslos");
    }
    return { antrieb: "bestand", modus: "off", widersprueche };
  }
  if (modus === "queue") {
    return { antrieb: "ereignis", modus, widersprueche };
  }
  return { antrieb: "cron-queue", modus, widersprueche };
}

// ── Transport-Payload: GENAU zwei Felder ──────────────────────────────────────────────────────
const PAYLOAD_FELDER = Object.freeze(["jobId", "schemaVersion"]);
const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function transportPayload(jobId, schemaVersion = SCHEMA_VERSION) {
  const payload = Object.freeze({ jobId: String(jobId), schemaVersion: Number(schemaVersion) });
  pruefeTransportPayload(payload);
  return payload;
}

// Harter Riegel VOR jedem Versand und in jedem Vertragstest: alles außer
// { jobId: <uuid>, schemaVersion: <int>=1 } wird abgewiesen. Damit kann auch ein künftiger
// Programmierfehler keine Inhalte in den Transport schieben — der Versand bricht dann ab
// und die Absicht bleibt ehrlich offen (kein Datenabfluss, kein stiller Verlust).
function pruefeTransportPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("transport-payload-ungueltig: kein Objekt");
  }
  const schluessel = Object.keys(payload).sort();
  if (schluessel.length !== PAYLOAD_FELDER.length
      || schluessel.some((k, i) => k !== [...PAYLOAD_FELDER].sort()[i])) {
    throw new Error(`transport-payload-ungueltig: unerlaubte Felder (${schluessel.join(",")})`);
  }
  if (!UUID_MUSTER.test(String(payload.jobId))) {
    // Die Auftrags-ID ist eine zufällige uuid (gen_random_uuid). Alles andere — ein
    // Idempotenzschlüssel, eine Mandats-ID, eine URL — fällt hier durch.
    throw new Error("transport-payload-ungueltig: jobId ist keine uuid");
  }
  if (!Number.isInteger(payload.schemaVersion) || payload.schemaVersion < 1) {
    throw new Error("transport-payload-ungueltig: schemaVersion");
  }
  return true;
}

// ── Weckziel-Vertrauensanker (Sicherheitskorrektur 2026-08-14) ────────────────────────────────
// CRON_SECRET darf NIE an eine beliebige konfigurierte Adresse gehen. Der Selbstweck ruft
// ausschließlich eine vertrauenswürdige Helmut-Deployment-Adresse: HTTPS, exakt der
// Verbraucher-Pfad, kein Userinfo, kein Query, kein Fragment, kein expliziter Port — und der
// Host muss einem von der PLATTFORM gesetzten Deployment-Host entsprechen
// (VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL / VERCEL_BRANCH_URL sind reservierte
// System-Variablen, die Vercel selbst setzt; sie sind kein freier Operator-Text). Ohne
// Vertrauensanker — z. B. lokal — ist der Transport geschlossen nicht verfügbar; das Secret
// verlässt den Prozess dann in keinem Fall.
const WECK_PFAD = "/api/cron/worker-weck";

function vertrauenswuerdigeWeckHosts(env = process.env) {
  const hosts = new Set();
  for (const name of ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_BRANCH_URL"]) {
    const wert = String((env && env[name]) || "").trim();
    if (!wert) continue;
    try {
      // Plattformwerte sind nackte Hosts ("helmut-…​.vercel.app"). Alles, was nach dem
      // Parsen mehr trägt als einen Hostnamen, wird nie in den Vertrauensanker übernommen.
      const u = new URL(`https://${wert}`);
      if (u.username || u.password || u.port || u.search || u.hash || u.pathname !== "/") continue;
      hosts.add(u.hostname);
    } catch (_) { /* unbrauchbarer Wert wird nie vertraut */ }
  }
  return hosts;
}

// Liefert { ok:true, url:<kanonische URL> } oder { ok:false, grund } — fail closed.
// Es wird IMMER die hier kanonisch neu gebaute URL versendet, nie der Rohwert.
function pruefeWeckZiel(rohUrl, env = process.env) {
  const roh = String(rohUrl || "").trim();
  if (!roh) return { ok: false, grund: "weckziel-fehlt (HELMUT_WORKER_WAKE_URL)" };
  let ziel;
  try {
    ziel = new URL(roh);
  } catch (_) {
    return { ok: false, grund: "weckziel-keine-url" };
  }
  if (ziel.protocol !== "https:") return { ok: false, grund: "weckziel-nicht-https" };
  if (ziel.username || ziel.password) return { ok: false, grund: "weckziel-zugangsdaten-in-url" };
  if (ziel.port) return { ok: false, grund: "weckziel-expliziter-port" };
  if (ziel.search) return { ok: false, grund: "weckziel-queryparameter" };
  if (ziel.hash) return { ok: false, grund: "weckziel-fragment" };
  // Strikter Pfadvergleich NACH URL-Normalisierung: Traversal ("/../"), Backslashes und
  // Groß-/Kleinschreibung fallen hier durch; Prozent-Codierungen bleiben erhalten und
  // scheitern am Gleichheitsvergleich.
  if (ziel.pathname !== WECK_PFAD) return { ok: false, grund: "weckziel-falscher-pfad" };
  const hosts = vertrauenswuerdigeWeckHosts(env);
  if (hosts.size === 0) {
    return { ok: false, grund: "weckziel-kein-vertrauensanker (VERCEL_PROJECT_PRODUCTION_URL/VERCEL_URL/VERCEL_BRANCH_URL fehlen)" };
  }
  if (!hosts.has(ziel.hostname)) return { ok: false, grund: "weckziel-fremder-host" };
  return { ok: true, url: `https://${ziel.hostname}${WECK_PFAD}` };
}

// ── Transporte ────────────────────────────────────────────────────────────────────────────────
// Ein Transport ist { name, verfuegbar, sende(payload) -> { ok, grund? } }. `sende` erhält
// AUSSCHLIESSLICH ein geprüftes Transport-Payload. `buendelt: true` erklärt einen Transport
// zur Türklingel: EIN Weckruf weckt den Verbraucher für ALLE gerade fälligen Absichten
// (der Verbraucher beansprucht Arbeit ohnehin nur atomar in der Datenbank, nie aus dem
// Payload) — der Dispatcher versendet dann höchstens einen Weckruf je Aufrufkontext.

function schattenTransport() {
  return {
    name: "schatten",
    verfuegbar: true,
    // Beweist die Versandplanung, versendet nichts: kein HTTP, kein Prozessverlassen.
    sende: async (payload) => {
      pruefeTransportPayload(payload);
      return { ok: true, schatten: true };
    }
  };
}

// SELBSTWECK: das kleinste ereignisgesteuerte Wecksignal ohne neuen Dienst, ohne neuen
// Anbieter und ohne neue Kosten. Der Dispatcher ruft die eigene Verbraucher-Route
// (/api/cron/worker-weck) per HTTP auf; autorisiert mit demselben CRON_SECRET wie alle
// Betriebsendpunkte (authorizeCron, Bearer). Verliert ein Wecksignal (Timeout, Deploy-
// Wechsel), repariert der Abgleich — die Outbox ist die Wahrheit über den Versand,
// helmut_jobs die Wahrheit über die Arbeit.
//
// SICHERHEITSKORREKTUR 2026-08-14:
//   1. Das Ziel wird VOR jedem Versand über pruefeWeckZiel verriegelt (HTTPS, exakter
//      Pfad, Plattform-Vertrauensanker). Ein ungültiges Ziel macht den Transport
//      geschlossen nicht verfügbar — CRON_SECRET verlässt den Prozess dann nie.
//   2. TÜRKLINGEL-SEMANTIK (buendelt): der Weckruf trägt keine Arbeitszuteilung, er weckt
//      nur. Ein Ruf genügt für alle fälligen Absichten des Aufrufkontexts.
//   3. TIMEOUT = UNBESTÄTIGT, NICHT FEHLGESCHLAGEN: der Empfänger arbeitet bis zu
//      HELMUT_DRAIN_BUDGET_MS, bevor er antwortet — der Sender wartet aber höchstens
//      HELMUT_WAKE_TIMEOUT_MS. Ein Abbruch nach dem Absenden sagt nichts über den Ausgang;
//      er wird als { unbestaetigt: true } gemeldet und in der Outbox NICHT verbucht
//      (die Vergabe hat Versuchszähler und Backoff bereits gesetzt; erledigte Aufträge
//      räumt der Terminal-/Abgleichpfad — identisch zum bewiesenen Dispatcher-Crash-Pfad).
function selbstweckTransport(env = process.env, deps = {}) {
  const secret = String((env && env.CRON_SECRET) || "").trim();
  const timeoutMs = Math.max(500, Number(env && env.HELMUT_WAKE_TIMEOUT_MS) || 3000);
  const holen = deps.fetch || globalThis.fetch;
  const ziel = pruefeWeckZiel(env && env.HELMUT_WORKER_WAKE_URL, env);
  if (!ziel.ok || !secret || typeof holen !== "function") {
    return {
      name: "selbstweck",
      verfuegbar: false,
      buendelt: true,
      grund: !ziel.ok ? ziel.grund : (!secret ? "CRON_SECRET fehlt" : "fetch fehlt"),
      sende: async () => ({ ok: false, grund: "transport-nicht-verfuegbar" })
    };
  }
  return {
    name: "selbstweck",
    verfuegbar: true,
    buendelt: true,
    sende: async (payload) => {
      pruefeTransportPayload(payload);
      const abbruch = new AbortController();
      const wecker = setTimeout(() => abbruch.abort(), timeoutMs);
      try {
        // Versendet wird IMMER die kanonisch gebaute Ziel-URL, nie der Rohwert der Env.
        const antwort = await holen(ziel.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`
          },
          body: JSON.stringify(payload),
          signal: abbruch.signal
        });
        // 2xx = angenommen. Auch { verarbeitet:false } (z. B. Drain belegt: ein aktiver
        // Verbraucher arbeitet bereits) ist ein ERFOLGREICHER Weckruf — ob gearbeitet
        // wird, entscheidet der Verbraucher gegen die Datenbank, nie der Transport.
        // 4xx/5xx (Antrieb nicht ereignis, Schemaversion, Klassengrenzen aus) ist ein
        // KONFIGURATIONSBEFUND: definitiver Fehlversuch, die Absicht bleibt offen und
        // der Widerspruch wird sichtbar statt still geschluckt.
        if (antwort && antwort.ok) return { ok: true };
        // 429 = die Klingel kam an, aber NIEMAND hat uebernommen (Drain belegt). Das ist
        // weder Erfolg noch Fehlversuch: die Absicht wird zurueckgelegt und kurz darauf
        // erneut zugestellt (Haertung Befund 1).
        if (antwort && antwort.status === 429) {
          return { ok: false, unbestaetigt: true, grund: "weck-niemand-uebernommen" };
        }
        return { ok: false, grund: `http-${(antwort && antwort.status) || "unbekannt"}` };
      } catch (error) {
        if (abbruch.signal.aborted) {
          return { ok: false, unbestaetigt: true, grund: "weck-timeout-unbestaetigt" };
        }
        return { ok: false, grund: bereinigeGrund(error) };
      } finally {
        clearTimeout(wecker);
      }
    }
  };
}

// ── AMAZON SQS — DER VERWALTETE PRODUCTION-TRANSPORT (Haertungssprint 2026-08-14) ────────────
// WARUM SQS UND NICHT DER SELBSTWECK: der Selbstweck ist ein selbst gebauter HTTP-Weckruf
// ohne Sichtbarkeitszeit, ohne Zustellzaehler, ohne Quarantaene und ohne kontrollierte
// Parallelitaet — jede dieser vier Eigenschaften muesste sonst selbst gebaut und selbst
// bewiesen werden. SQS liefert sie als ausgereiften verwalteten Dienst in einer
// europaeischen Region (eu-central-1, Frankfurt), mit nativer Dead-Letter-Queue,
// Wiederholungen ueber `maxReceiveCount` und harter Parallelitaetsdeckelung ueber die
// reservierte Lambda-Nebenlaeufigkeit. Belegdatei §19.
//
// WAS DIE TRANSPORTGRENZE PASSIERT: ausschliesslich `{ jobId, schemaVersion }` — dieselben
// zwei Felder wie bei jedem anderen Transport, geprueft durch denselben Riegel. Keine
// Mandatsnummern, keine Namen, keine Quellen, keine Dokumente, keine Prompts, keine
// Ergebnisse. Die zufaellige Auftragsnummer ist zugleich der Idempotenzschluessel im
// EIGENEN Auftragsbuch (helmut_claim_job_by_id) — nicht in der Queue.
//
// REGION IST HART: eine andere Region als eine ausdruecklich erlaubte EU-Region wird
// geschlossen abgewiesen. Datenresidenz ist keine Konfigurationsfrage, die still
// danebengehen darf.
const SQS_ERLAUBTE_REGIONEN = Object.freeze(["eu-central-1"]);
const SQS_STANDARD_REGION = "eu-central-1";

// Die Queue-URL muss auf genau diese Region und auf HTTPS zeigen; ein Vertipper darf nie
// still in eine fremde Region oder zu einem fremden Dienst senden.
function pruefeSqsZiel(rohUrl, region) {
  const roh = String(rohUrl || "").trim();
  if (!roh) return { ok: false, grund: "sqs-queue-url-fehlt (HELMUT_SQS_QUEUE_URL)" };
  if (!SQS_ERLAUBTE_REGIONEN.includes(String(region || ""))) {
    return { ok: false, grund: `sqs-region-unzulaessig:${String(region || "").slice(0, 20)}` };
  }
  let ziel;
  try {
    ziel = new URL(roh);
  } catch (_) {
    return { ok: false, grund: "sqs-queue-url-keine-url" };
  }
  if (ziel.protocol !== "https:") return { ok: false, grund: "sqs-queue-url-nicht-https" };
  if (ziel.username || ziel.password) return { ok: false, grund: "sqs-queue-url-zugangsdaten" };
  if (ziel.search || ziel.hash) return { ok: false, grund: "sqs-queue-url-parameter" };
  if (ziel.hostname !== `sqs.${region}.amazonaws.com`) {
    return { ok: false, grund: "sqs-queue-url-fremder-host" };
  }
  return { ok: true, url: `https://${ziel.hostname}${ziel.pathname}` };
}

function sqsTransport(env = process.env, deps = {}) {
  const region = String((env && env.AWS_REGION) || SQS_STANDARD_REGION).trim();
  const ziel = pruefeSqsZiel(env && env.HELMUT_SQS_QUEUE_URL, region);
  let sende = deps.sqsSende || null;

  if (!sende && ziel.ok) {
    try {
      // Bewusst lazy: das SDK wird erst geladen, wenn dieser Transport wirklich gewaehlt
      // ist. Fehlt es (nicht installiert, Bundling-Fehler), meldet sich der Transport
      // ehrlich als nicht verfuegbar — der Cron-Rueckfallweg traegt weiter.
      // eslint-disable-next-line global-require
      const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
      const client = deps.sqsClient || new SQSClient({ region });
      sende = async (nachricht) => {
        await client.send(new SendMessageCommand({
          QueueUrl: ziel.url,
          MessageBody: JSON.stringify(nachricht)
        }));
      };
    } catch (_) {
      sende = null;
    }
  }

  if (!ziel.ok || typeof sende !== "function") {
    return {
      name: "sqs",
      verfuegbar: false,
      buendelt: false,
      grund: !ziel.ok ? ziel.grund : "sqs-sdk-nicht-verfuegbar (@aws-sdk/client-sqs)",
      sende: async () => ({ ok: false, grund: "transport-nicht-verfuegbar" })
    };
  }

  return {
    name: "sqs",
    verfuegbar: true,
    region,
    // NICHT gebuendelt: SQS traegt je Auftrag eine eigene Nachricht mit eigener
    // Sichtbarkeitszeit, eigenem Zustellzaehler und eigener Quarantaene. Genau das ist der
    // Gewinn gegenueber der Tuerklingel — jede Arbeitseinheit ist einzeln nachverfolgbar.
    buendelt: false,
    sende: async (payload) => {
      pruefeTransportPayload(payload);
      try {
        await sende(payload);
        return { ok: true };
      } catch (error) {
        return { ok: false, grund: bereinigeGrund(error) };
      }
    }
  };
}

// VERCEL QUEUES — Adapter zum offiziellen SDK (@vercel/queue, send(topic, payload, opts)).
// STATUS DES DIENSTES (geprüft 2026-08-13, docs/betrieb/op30-zielarchitektur-2026-08-13.md §4):
// Public Beta („queue/v2beta", experimentalTriggers), at-least-once, Aufbewahrung max. 7 Tage,
// Abrechnung je Operation — die Aktivierung ist eine GESONDERTE, KOSTENPFLICHTIGE
// Gründerentscheidung und findet in diesem Sprint nicht statt. Der Adapter existiert, damit
// der spätere Wechsel eine Konfigurationsentscheidung bleibt (Zusage 3 im Kopf). Ohne
// installiertes SDK meldet er sich ehrlich als nicht verfügbar — fail closed, die Absicht
// bleibt offen, der Cron-Rückfallweg trägt weiter.
function vercelQueuesTransport(env = process.env, deps = {}) {
  const topic = String((env && env.HELMUT_QUEUE_TOPIC) || "helmut-auftraege").trim();
  let sdkSend = deps.vercelQueueSend || null;
  if (!sdkSend) {
    try {
      // Bewusst lazy: das Repo trägt KEINE neue Abhängigkeit (einzige Dependency: ical.js).
      // Erst eine Gründerentscheidung installiert das SDK.
      // eslint-disable-next-line global-require
      sdkSend = require("@vercel/queue").send;
    } catch (_) {
      sdkSend = null;
    }
  }
  if (typeof sdkSend !== "function") {
    return {
      name: "vercel-queues",
      verfuegbar: false,
      grund: "vercel-queues-sdk-nicht-installiert (Aktivierung = kostenpflichtige Gruenderentscheidung)",
      sende: async () => ({ ok: false, grund: "transport-nicht-verfuegbar" })
    };
  }
  return {
    name: "vercel-queues",
    verfuegbar: true,
    sende: async (payload) => {
      pruefeTransportPayload(payload);
      try {
        // idempotencyKey = Auftrags-ID: dieselbe Absicht wird queue-seitig dedupliziert
        // (dokumentierte SDK-Option; Dedupe über die Message-TTL).
        await sdkSend(topic, payload, { idempotencyKey: payload.jobId });
        return { ok: true };
      } catch (error) {
        return { ok: false, grund: bereinigeGrund(error) };
      }
    }
  };
}

function bereinigeGrund(error) {
  const scalable = require("./scalable-pipeline");
  return scalable.bereinigeFehler(error, 200) || "unbekannt";
}

// Der EINE Ort der Transportwahl. Unbekannte Transportnamen sind fail closed „nicht
// verfügbar" — nie ein stiller Rückfall auf einen anderen Zustellweg.
// STANDARDTRANSPORT IST SEIT DEM HAERTUNGSSPRINT `sqs` (Haertungssprint 2026-08-14).
// Vorher war es `selbstweck` — ein selbst gebauter HTTP-Weckruf darf nicht der stille
// Standard des Production-Antriebs sein.
const STANDARD_TRANSPORT = "sqs";

// Der Selbstweck bleibt als ausdruecklich BEGRENZTER Entwicklungs- und Notfallweg bestehen.
// In einer Vercel-Production-Umgebung waehlt ihn nur, wer ihn ausdruecklich freischaltet —
// sonst stoppt der Dispatcher geschlossen, statt unbemerkt auf den schwaecheren Weg zu
// fallen. Ausserhalb von Production (lokal, Preview) ist er ohne Freischaltung nutzbar.
function selbstweckErlaubt(env = process.env) {
  const frei = String((env && env.HELMUT_SELBSTWECK_ERLAUBT) || "").trim().toLowerCase() === "on";
  if (frei) return { erlaubt: true, grund: "ausdruecklich-freigeschaltet" };
  const umgebung = String((env && env.VERCEL_ENV) || "").trim().toLowerCase();
  if (umgebung === "production") {
    return {
      erlaubt: false,
      grund: "selbstweck-in-production-gesperrt (nur mit HELMUT_SELBSTWECK_ERLAUBT=on als Notfallweg)"
    };
  }
  return { erlaubt: true, grund: `umgebung-${umgebung || "lokal"}` };
}

function erstelleTransport(env = process.env, deps = {}) {
  const modus = dispatchModus(env);
  if (modus === "off") return { name: "keiner", verfuegbar: false, grund: "dispatch-off", sende: async () => ({ ok: false, grund: "dispatch-off" }) };
  if (modus === "shadow") return schattenTransport();
  const name = String((env && env.HELMUT_JOB_TRANSPORT) || STANDARD_TRANSPORT).trim().toLowerCase();
  if (name === "sqs") return sqsTransport(env, deps);
  if (name === "selbstweck") {
    const frei = selbstweckErlaubt(env);
    if (!frei.erlaubt) {
      return {
        name: "selbstweck", verfuegbar: false, buendelt: true, grund: frei.grund,
        sende: async () => ({ ok: false, grund: "transport-nicht-verfuegbar" })
      };
    }
    return selbstweckTransport(env, deps);
  }
  if (name === "vercel-queues") return vercelQueuesTransport(env, deps);
  return {
    name,
    verfuegbar: false,
    grund: `transport-unbekannt:${name.slice(0, 30)}`,
    sende: async () => ({ ok: false, grund: "transport-unbekannt" })
  };
}

// ── WAHRER BETRIEBSSTATUS DES ANTRIEBS (Haertungssprint Selbstweck, 2026-08-24) ───────────────
// BELEGTER ANLASS: `waehleAntrieb` beantwortet nur die Frage "welcher Antrieb ist konfiguriert?".
// Es meldete `ereignis`, sobald `HELMUT_JOB_DISPATCH_MODE=queue` und die Warteschlange an waren
// — AUCH dann, wenn der gewaehlte Transport gar nicht versenden kann (kein Weckziel, kein
// Vertrauensanker, kein CRON_SECRET, in Production gesperrter Selbstweck, fehlende SQS-Adresse,
// fehlendes SDK). Der Betriebsstatus sah damit nach Ereignisbetrieb aus, obwohl faktisch
// ausschliesslich der Cron-Rueckfallweg trug — falsches Gruen im Sinne von CLAUDE.md §4.4.
//
// Diese Vorpruefung trennt SECHS Dinge, die vorher verschmolzen waren:
//   1. angeforderterModus  — was der Betreiber gesetzt hat (Rohwert, normalisiert)
//   2. modus               — was davon WIRKSAM ist (fail closed: Unbekanntes wirkt als `off`)
//   3. antrieb             — der eine tatsaechlich wirksame Antrieb (bestand/cron-queue/ereignis)
//   4. transport.gewaehlt  — welcher Zustellweg konfiguriert ist
//   5. transport.verfuegbar/grund — ob dieser Weg NACH SEINER KONFIGURATION ueberhaupt
//                            versenden duerfte (Ziel-Riegel, Secret vorhanden, SDK ladbar),
//                            und woran es sonst fehlt
//   6. bereit              — KONFIGURATIONSBEREITSCHAFT des Ereignis-Antriebs
//
// WAS `bereit: true` HEISST — und was NICHT (Korrekturrunde 2026-08-24/2, sprachliche
// Schaerfung nach berechtigtem Einwand):
//   HEISST:        Antrieb `ereignis` wirksam, Klassengrenzen an, Transportkonfiguration
//                  vollstaendig und intern widerspruchsfrei. Also: die Konfiguration ist fuer
//                  einen SPAETEREN echten Versuch fertig.
//   HEISST NICHT:  dass der Transport gerade zustellen KANN · dass das Weckziel erreichbar
//                  ist · dass das CRON_SECRET beim Empfaenger wirkt · dass je ein echter
//                  Weckruf stattgefunden hat. Diese Funktion macht KEINEN Netzaufruf und kann
//                  darueber nichts wissen. Der tatsaechliche Transport- und
//                  Production-Nachweis bleibt ein getrennter Betriebsbeleg.
//
// DATENSPARSAMKEIT: ausgegeben werden ausschliesslich Modus-, Antriebs- und Transportnamen sowie
// die bereits bereinigten Gruende. Weder CRON_SECRET noch Weckziel-URL, Queue-Adresse, Hostname
// oder irgendein Wert einer Umgebungsvariablen verlassen diese Funktion (Vertragstest §13.10).
const VORPRUEFUNG_VERTRAG = 1;
// Die EINE verbindliche Lesart des Feldes `bereit` — mitgeliefert statt nur dokumentiert.
const BEREIT_BEDEUTUNG = "konfigurationsbereit: Konfiguration vollstaendig und widerspruchsfrei"
  + " — KEIN Zustellnachweis, kein Erreichbarkeitsnachweis, kein Production-Beleg";

function aktivierungsVorpruefung(env = process.env, deps = {}) {
  const scalable = require("./scalable-pipeline");
  const roh = String((env && env.HELMUT_JOB_DISPATCH_MODE) || "").trim().toLowerCase();
  const { antrieb, modus, widersprueche } = waehleAntrieb(env);
  const motorAn = scalable.skalierbarerPfadAktiv(env);
  const grenzenAn = scalable.klassenGrenzenAktiv(env);
  const befunde = [...widersprueche];

  // Der gewaehlte Zustellweg — genau die Auswahl, die `erstelleTransport` trifft.
  // WICHTIG: massgeblich ist der WIRKSAME Modus aus `waehleAntrieb`, nicht der Rohwert. Ohne
  // Warteschlange ist ein gesetztes `queue` wirkungslos (`modus: "off"`); es darf dann auch
  // kein Transport gebaut und keiner als wirksam gemeldet werden.
  const konfiguriert = String((env && env.HELMUT_JOB_TRANSPORT) || STANDARD_TRANSPORT).trim().toLowerCase()
    || STANDARD_TRANSPORT;
  const gewaehlt = modus === "queue" ? konfiguriert : (modus === "shadow" ? "schatten" : "keiner");
  // Gebaut, NICHT benutzt: `erstelleTransport` versendet nichts und oeffnet keine Verbindung.
  // Ein nicht verfuegbarer Transport meldet hier seinen Grund, statt ihn erst beim Versand zu
  // zeigen.
  const transport = deps.transport || (modus === "off"
    ? { name: "keiner", verfuegbar: false, grund: "dispatch-off" }
    : erstelleTransport(env, deps));
  const verfuegbar = Boolean(transport && transport.verfuegbar);
  const grund = verfuegbar ? null : ((transport && transport.grund) || "transport-nicht-verfuegbar");
  if (!verfuegbar && modus !== "off") befunde.push(`transport-nicht-verfuegbar:${grund}`);

  if (!motorAn) befunde.push("skalierbarer-motor-aus (HELMUT_SCALABLE_PIPELINE)");
  if (antrieb === "ereignis" && !grenzenAn) {
    // Der Ereignis-Antrieb VERLANGT die verteilten Klassengrenzen: die Verbraucher-Route
    // antwortet ohne sie geschlossen mit 409. Ohne diesen Befund saehe der Status bereit aus,
    // waehrend jeder Weckruf abgewiesen wuerde.
    befunde.push("klassengrenzen-aus (HELMUT_KLASSEN_GRENZEN=on ist Pflicht im Ereignis-Antrieb)");
  }
  if (antrieb !== "ereignis") befunde.push(`kein-ereignis-antrieb:${antrieb}`);

  const bereit = antrieb === "ereignis" && verfuegbar && grenzenAn;

  return {
    vertrag: VORPRUEFUNG_VERTRAG,
    angeforderterModus: roh || "(nicht gesetzt)",
    modus,
    antrieb,
    // Die Widersprueche aus `waehleAntrieb` bleiben unveraendert sichtbar (sie sind eine
    // Teilmenge von `befunde`, aber als eigene Liste stabil auswertbar).
    widersprueche,
    skalierbarerMotor: motorAn,
    klassenGrenzen: grenzenAn,
    transport: {
      gewaehlt,
      wirksam: (transport && transport.name) || "keiner",
      verfuegbar,
      buendelt: Boolean(transport && transport.buendelt),
      grund
    },
    bereit,
    // Damit niemand `bereit` als Zustellnachweis liest — auch nicht beim Ueberfliegen der
    // Betriebsantwort. Fester Text, kein freier Kommentar.
    bereitBedeutung: BEREIT_BEDEUTUNG,
    befunde
  };
}

// ── Dispatcher: fällige Versandabsichten versenden ────────────────────────────────────────────
// Läuft in den Cron-Slots (und nach Verbraucherläufen). Er ist bewusst dünn:
//   1. fällige Absichten atomar vergeben (helmut_outbox_naechste),
//   2. je Absicht das geprüfte Zwei-Felder-Payload versenden,
//   3. Erfolg/Fehlschlag in der Outbox verbuchen (helmut_outbox_bestaetige).
// Ein Transportausfall lässt jede Absicht offen und jeden Auftrag unberührt.
async function versendeAbsichten({ env = process.env, deps = {}, limit = 50 } = {}) {
  const modus = dispatchModus(env);
  if (modus === "off") return { uebersprungen: true, grund: "dispatch-off", versendet: 0 };

  const storage = deps.storage || require("./storage");
  // EINE Transportinstanz fuer Vorpruefung UND Versand (Korrekturrunde 2026-08-24/2). Wuerde
  // die Vorpruefung ihren eigenen Transport bauen, koennten Vorpruefung und Versand theoretisch
  // auseinanderlaufen (Umgebung zwischen beiden Aufrufen geaendert, SDK erst beim zweiten Bau
  // ladbar). Hier ist das strukturell ausgeschlossen: es gibt genau ein Objekt.
  const transport = deps.transport || erstelleTransport(env, deps);

  // VOLLSTAENDIGER AKTIVIERUNGSVORLAUF, GESCHLOSSEN (Korrekturrunde 2026-08-24/2).
  // BELEGTE LUECKE 1 (erster Durchgang): `queue` OHNE `HELMUT_SCALABLE_PIPELINE` ergibt den
  // Antrieb `bestand`; der Dispatcher lebte den Widerspruch trotzdem und verbrannte Versuche.
  // BELEGTE LUECKE 2 (diese Runde): die Pruefung deckte nur den ANTRIEB ab. Fehlten die
  // verteilten Klassengrenzen (`HELMUT_KLASSEN_GRENZEN`), lief der Dispatcher weiter, VERGAB
  // eine Absicht (Versuchszaehler + Backoff) und klingelte — waehrend die Verbraucher-Route
  // jedes Signal mit 409 `klassengrenzen-aus` abweist. Die vollstaendige Vorpruefung meldete
  // fuer genau diesen Fall bereits `bereit: false`; der Versandpfad hoerte nur nicht darauf.
  //
  // JETZT GILT: im Queue-Modus wird VOR der ersten Outbox-Vergabe die VOLLSTAENDIGE
  // Vorpruefung ausgewertet. Ist sie nicht bereit, passiert nichts: keine Vergabe, kein
  // Versuch, kein Backoff, kein HTTP, kein SQS, keine Bestaetigung, keine Fehlverbuchung.
  // Die Absichten bleiben unberuehrt liegen, der Cron-Rueckfallweg traegt weiter, und der
  // Grund steht bereinigt und maschinenlesbar in der Bilanz.
  //
  // WICHTIG ZUR BEDEUTUNG: `bereit` heisst KONFIGURATIONSBEREIT — vollstaendig und intern
  // widerspruchsfrei. Es heisst NICHT, dass der Transport gerade zustellen kann, dass das Ziel
  // erreichbar ist oder dass die Zugangsdaten beim Empfaenger wirken. Der Riegel ist deshalb
  // bewusst EINSEITIG: `bereit: false` verhindert sicher jeden Versuch; `bereit: true` erlaubt
  // ihn nur — ob er gelingt, entscheidet erst der echte Versand weiter unten.
  if (modus === "queue") {
    const vorpruefung = aktivierungsVorpruefung(env, { ...deps, transport });
    if (!vorpruefung.bereit) {
      // Ein Grund, drei moegliche Ursachen — in der Reihenfolge, in der sie greifen.
      const grund = vorpruefung.antrieb !== "ereignis"
        ? `antrieb-${vorpruefung.antrieb}`
        : (vorpruefung.transport.verfuegbar !== true
          ? `transport-nicht-verfuegbar:${vorpruefung.transport.grund || "unbekannt"}`
          : "klassengrenzen-aus");
      return {
        uebersprungen: true,
        modus,
        transport: transport.name,
        transportVerfuegbar: Boolean(transport.verfuegbar),
        bereit: false,
        versendet: 0, vergeben: 0, fehlgeschlagen: 0,
        grund,
        befunde: vorpruefung.befunde,
        // Bestandsfeld: die Widersprueche aus `waehleAntrieb` bleiben separat sichtbar.
        widersprueche: vorpruefung.widersprueche
      };
    }
  }

  const naechste = deps.naechste || ((o) => storage.jobOutboxNaechste(o));
  const bestaetige = deps.bestaetige || ((o) => storage.jobOutboxBestaetige(o));
  // HAERTUNG (Befund 1): ein Weckruf mit UNBEKANNTEM Ausgang wird zurueckgelegt —
  // weder bestaetigt (dann wartet der Auftrag bis zum Abgleich) noch als Fehlversuch
  // verbucht (dann verbrennt er Versuche bis zur Quarantaene).
  const zuruecklegen = deps.zuruecklegen || ((o) => storage.jobOutboxZuruecklegen(o));

  const bilanz = {
    uebersprungen: false, modus, transport: transport.name,
    vergeben: 0, versendet: 0, fehlgeschlagen: 0, gruende: {}
  };

  if (!transport.verfuegbar) {
    // EHRLICH: kein Transport heißt „nichts versendet", nie „nichts zu tun". Die
    // Absichten bleiben in der Outbox liegen und der Rückfallweg (Cron-Drain) trägt.
    bilanz.transportVerfuegbar = false;
    bilanz.grund = transport.grund || "transport-nicht-verfuegbar";
    return bilanz;
  }
  bilanz.transportVerfuegbar = true;

  const antwort = await naechste({ limit, transport: transport.name });
  if (!antwort || antwort.verfuegbar === false) {
    bilanz.verfuegbar = false;
    bilanz.grund = (antwort && antwort.grund) || "outbox-nicht-verfuegbar";
    return bilanz;
  }
  const absichten = antwort.absichten || [];
  bilanz.vergeben = absichten.length;
  if (absichten.length === 0) return bilanz;

  // ── GEBÜNDELTER WECKRUF (Sicherheitskorrektur 2026-08-14, Türklingel-Semantik) ──
  // Beim Selbstweck trägt das Wecksignal keine Arbeitszuteilung: der Verbraucher
  // beansprucht fällige Aufträge ausschließlich atomar in der Datenbank. Deshalb genügt
  // GENAU EIN Weckruf je Aufrufkontext für alle gerade vergebenen Absichten — statt einer
  // HTTP-Kette mit einem Aufruf pro Absicht (Aufrufverstärkung). Verbucht wird nur ein
  // DEFINITIVER Ausgang: 2xx bestätigt alle gebündelten Absichten, eine echte
  // Fehlerantwort verbucht alle als Fehlversuch. Ein Timeout nach dem Absenden
  // (unbestaetigt) verbucht NICHTS — die Vergabe hat Versuchszähler und Backoff bereits
  // gesetzt, erledigte Aufträge räumt der Terminal-/Abgleichpfad (Crash-äquivalenter,
  // getesteter Pfad). Es geht kein Auftrag und keine Outbox-Wahrheit verloren.
  if (transport.buendelt === true) {
    const erste = absichten[0];
    let ergebnis;
    try {
      ergebnis = await transport.sende(transportPayload(erste.jobId, erste.schemaVersion));
    } catch (error) {
      ergebnis = { ok: false, grund: bereinigeGrund(error) };
    }
    bilanz.weckrufe = 1;
    if (ergebnis && ergebnis.ok) {
      for (const absicht of absichten) {
        await bestaetige({ outboxId: absicht.outboxId, ok: true, fehler: null });
      }
      bilanz.versendet = absichten.length;
    } else if (ergebnis && ergebnis.unbestaetigt === true) {
      // UNBEKANNTER AUSGANG (Timeout nach dem Absenden ODER nachweislich kein freier
      // Verbraucher): jede gebuendelte Absicht wird ZURUECKGELEGT — Status zurueck auf
      // `offen`, der bei der Vergabe gezogene Versuch wird zurueckgegeben, eine kurze
      // Wartezeit verhindert das sofortige Wiederholen. Damit haengt der Auftrag NICHT
      // bis zum Mindestalter des Abgleichs (Befund 1) und verbrennt zugleich keine
      // Versuche in Richtung Quarantaene.
      for (const absicht of absichten) {
        await zuruecklegen({ outboxId: absicht.outboxId, warteSekunden: RUECKLEGE_WARTE_S });
      }
      bilanz.unbestaetigt = absichten.length;
      bilanz.zurueckgelegt = absichten.length;
      bilanz.gruende[(ergebnis && ergebnis.grund) || "weck-unbestaetigt"] = absichten.length;
    } else {
      const grund = (ergebnis && ergebnis.grund) || "versand-fehlgeschlagen";
      for (const absicht of absichten) {
        await bestaetige({ outboxId: absicht.outboxId, ok: false, fehler: grund });
      }
      bilanz.fehlgeschlagen = absichten.length;
      const kurz = String(grund).split(":")[0];
      bilanz.gruende[kurz] = absichten.length;
    }
    return bilanz;
  }

  // Nicht bündelnde Transporte (schatten beweist den Zustandsautomaten je Absicht;
  // vercel-queues stellt je Absicht eine Nachricht mit idempotencyKey zu).
  for (const absicht of absichten) {
    let ergebnis;
    try {
      ergebnis = await transport.sende(transportPayload(absicht.jobId, absicht.schemaVersion));
    } catch (error) {
      ergebnis = { ok: false, grund: bereinigeGrund(error) };
    }
    if (ergebnis && ergebnis.ok !== true && ergebnis.unbestaetigt === true) {
      await zuruecklegen({ outboxId: absicht.outboxId, warteSekunden: RUECKLEGE_WARTE_S });
      bilanz.unbestaetigt = (bilanz.unbestaetigt || 0) + 1;
      bilanz.zurueckgelegt = (bilanz.zurueckgelegt || 0) + 1;
      continue;
    }
    const ok = Boolean(ergebnis && ergebnis.ok);
    await bestaetige({ outboxId: absicht.outboxId, ok, fehler: ok ? null : (ergebnis && ergebnis.grund) || "versand-fehlgeschlagen" });
    if (ok) {
      bilanz.versendet += 1;
    } else {
      bilanz.fehlgeschlagen += 1;
      const kurz = String((ergebnis && ergebnis.grund) || "unbekannt").split(":")[0];
      bilanz.gruende[kurz] = (bilanz.gruende[kurz] || 0) + 1;
    }
  }
  return bilanz;
}

// ── Abgleich: das Sicherheitsnetz ─────────────────────────────────────────────────────────────
async function abgleich({ env = process.env, deps = {}, limit = 200, mindestalterMinuten = 10 } = {}) {
  if (dispatchModus(env) === "off") return { uebersprungen: true, grund: "dispatch-off" };
  const storage = deps.storage || require("./storage");
  const fn = deps.abgleich || ((o) => storage.jobOutboxAbgleich(o));
  const antwort = await fn({ limit, mindestalterMinuten })
    .catch((error) => ({ verfuegbar: false, grund: bereinigeGrund(error) }));
  return { uebersprungen: false, ...antwort };
}

// ── Verbraucher-Schutz: Schema-Version ────────────────────────────────────────────────────────
// Ein Verbraucher verarbeitet NIE eine Schema-Version, die neuer ist als sein Deployment —
// während eines Deployment-Wechsels wartet das Signal, bis der Abgleich es einer neuen
// Instanz erneut vorlegt. Ältere Versionen sind erlaubt (der Vertrag ist abwärtsstabil:
// das Payload trägt nur die uuid, und die Wahrheit liegt ohnehin in der Datenbank).
function schemaVersionVerarbeitbar(version) {
  const n = Number(version);
  return Number.isInteger(n) && n >= 1 && n <= SCHEMA_VERSION;
}

// Eindeutige Verbraucher-Kennung (Lease-Besitzer der Wecksignal-Verarbeitung).
function verbraucherKennung(praefix = "weck") {
  return `${praefix}-${crypto.randomUUID()}`;
}

module.exports = {
  SCHEMA_VERSION,
  GUELTIGE_MODI,
  PAYLOAD_FELDER,
  WECK_PFAD,
  RUECKLEGE_WARTE_S,
  STANDARD_TRANSPORT,
  SQS_ERLAUBTE_REGIONEN,
  vertrauenswuerdigeWeckHosts,
  pruefeWeckZiel,
  pruefeSqsZiel,
  sqsTransport,
  selbstweckErlaubt,
  dispatchModus,
  dispatchAktiv,
  waehleAntrieb,
  VORPRUEFUNG_VERTRAG,
  BEREIT_BEDEUTUNG,
  aktivierungsVorpruefung,
  transportPayload,
  pruefeTransportPayload,
  erstelleTransport,
  schattenTransport,
  selbstweckTransport,
  vercelQueuesTransport,
  versendeAbsichten,
  abgleich,
  schemaVersionVerarbeitbar,
  verbraucherKennung
};
