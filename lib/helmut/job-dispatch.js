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
function erstelleTransport(env = process.env, deps = {}) {
  const modus = dispatchModus(env);
  if (modus === "off") return { name: "keiner", verfuegbar: false, grund: "dispatch-off", sende: async () => ({ ok: false, grund: "dispatch-off" }) };
  if (modus === "shadow") return schattenTransport();
  const name = String((env && env.HELMUT_JOB_TRANSPORT) || "selbstweck").trim().toLowerCase();
  if (name === "selbstweck") return selbstweckTransport(env, deps);
  if (name === "vercel-queues") return vercelQueuesTransport(env, deps);
  return {
    name,
    verfuegbar: false,
    grund: `transport-unbekannt:${name.slice(0, 30)}`,
    sende: async () => ({ ok: false, grund: "transport-unbekannt" })
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
  const transport = deps.transport || erstelleTransport(env, deps);
  const naechste = deps.naechste || ((o) => storage.jobOutboxNaechste(o));
  const bestaetige = deps.bestaetige || ((o) => storage.jobOutboxBestaetige(o));

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
      bilanz.unbestaetigt = absichten.length;
      bilanz.gruende["weck-timeout-unbestaetigt"] = absichten.length;
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
async function abgleich({ env = process.env, deps = {}, limit = 200 } = {}) {
  if (dispatchModus(env) === "off") return { uebersprungen: true, grund: "dispatch-off" };
  const storage = deps.storage || require("./storage");
  const fn = deps.abgleich || ((o) => storage.jobOutboxAbgleich(o));
  const antwort = await fn({ limit }).catch((error) => ({ verfuegbar: false, grund: bereinigeGrund(error) }));
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
  vertrauenswuerdigeWeckHosts,
  pruefeWeckZiel,
  dispatchModus,
  dispatchAktiv,
  waehleAntrieb,
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
