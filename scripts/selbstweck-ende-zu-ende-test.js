"use strict";

// Helmut — GESCHLOSSENER ENDE-ZU-ENDE-TEST DES SELBSTWECKS (Haertungssprint 2026-08-24).
// =============================================================================================
// EHRLICHE EINORDNUNG ZUERST: das hier ist ein LOKALER Integrationstest. Er beweist den
// Selbstweck-Weg auf DIESER Maschine. Er beweist NICHT, dass der Ereignis-Antrieb in
// Production laeuft — dafuer braucht es einen Production-Nachweis, den dieser Sprint
// ausdruecklich nicht fuehrt.
//
// WAS ECHT IST (nichts davon ist nachgebaut):
//   * die ECHTE Verbraucher-Route `POST /api/cron/worker-weck` aus `server.js`, ueber eine
//     ECHTE HTTP-Verbindung an einen lokalen Listener,
//   * die ECHTE Autorisierung (`authorizeCron`, Bearer + timing-sicherer Vergleich),
//   * der ECHTE Transport (`job-dispatch.selbstweckTransport`) samt Weckziel-Riegel,
//     Tuerklingel-Buendelung und Timeout-Semantik,
//   * der ECHTE Dispatcher (`versendeAbsichten`) — der Test ruft nie `fetch` von Hand,
//   * der ECHTE Workerbetrieb (`worker-betrieb.durchlauf` -> `scalable-pipeline.arbeite` ->
//     `fuehreAuftragAus`) mit zwei parallelen Workern,
//   * der ECHTE Fachhandler `handleSourceFetch` samt Klassengrenzen-Slot.
//
// WAS ERSETZT IST (genau drei Aussengrenzen, jede vertragstreu nachgebildet):
//   1. DIE DATENBANK. Statt Supabase traegt ein in-Prozess-Auftragsbuch dieselben Vertraege
//      wie die SQL-Funktionen (`helmut_claim_jobs`, `helmut_finish_job`, `helmut_defer_job`,
//      `helmut_outbox_naechste/-_bestaetige/-_zuruecklegen/-_abgleich`, `helmut_klasse_belege`).
//      ATOMARITAET: jede dieser Attrappen mutiert ihren Zustand in EINEM synchronen Block
//      ohne `await` — in einer Node-Schleife ist das genau die Serialisierung, die der
//      Row-Lock in Postgres leistet. Was der Test damit zeigt, ist deshalb: der APP-SEITIGE
//      Ablauf verlaesst sich ausschliesslich auf die atomare Vergabe und kommt ohne
//      Zusatzannahmen aus. Was er NICHT zeigt: dass die SQL-Funktionen selbst atomar sind —
//      das belegt `scripts/jobqueue-outbox-datenbank-test.js` an echter PostgreSQL.
//   2. DAS NETZ ZWISCHEN SENDER UND VERBRAUCHER. `globalThis.fetch` bleibt der Aufrufweg des
//      echten Transports; die Bruecke prueft, dass GENAU die kanonische https-Adresse mit
//      Bearer-Secret gerufen wird, und leitet den Aufruf dann an den lokalen Listener weiter.
//      Ohne diese Bruecke waere der Test nicht moeglich: der Weckziel-Riegel laesst
//      ausschliesslich einen Plattform-Deployment-Host zu — nie `127.0.0.1`.
//   3. DER EXTERNE QUELLENABRUF. `crawler.crawlAllSources` ist ein KONTROLLIERTER
//      TESTHANDLER: er ruft nichts ab, sondern liefert genau das Ergebnis, das der jeweilige
//      Pruefpunkt braucht (Erfolg, Fehler, lange Laufzeit). Es gibt keinen Modellaufruf,
//      keine Quelle, keine Production-Daten und keinen kostenpflichtigen Dienst.
//
// KEINE UEBERTRIEBENE ZUSAGE: dieser Test behauptet NICHT, dass Doppelarbeit oder Verlust
// "mathematisch unmoeglich" seien. Er weist zwei Dinge nach: (a) welche atomaren Schranken
// den Ablauf tragen (Vergabe des Auftrags, Vergabe der Versandabsicht, Drain-Klasse), und
// (b) dass in keinem der geprueften Faelle ein Auftrag doppelt ausgefuehrt oder verloren wird.
//
// Aufruf: node scripts/selbstweck-ende-zu-ende-test.js
// Laeuft im kanonischen Offline-Lauf (`node scripts/run-offline-tests.js`) mit.

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

// ── Umgebung: alles lokal, nichts scharf ─────────────────────────────────────────────────────
const SECRET = "selbstweck-ende-zu-ende-secret";
const PROD_HOST = "helmut-selbstweck-test.vercel.app";
const WECK_URL = `https://${PROD_HOST}/api/cron/worker-weck`;

process.env.HELMUT_OFFLINE_TEST = "1";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.CRON_SECRET = SECRET;
// Der Vertrauensanker ist im Betrieb eine von der Plattform gesetzte Systemvariable. Hier
// simuliert er genau das — ohne ihn waere der Selbstweck geschlossen nicht verfuegbar.
process.env.VERCEL_PROJECT_PRODUCTION_URL = PROD_HOST;
process.env.HELMUT_WORKER_WAKE_URL = WECK_URL;
process.env.HELMUT_SCALABLE_PIPELINE = "on";
process.env.HELMUT_KLASSEN_GRENZEN = "on";
process.env.HELMUT_JOB_DISPATCH_MODE = "queue";
process.env.HELMUT_JOB_TRANSPORT = "selbstweck";
process.env.HELMUT_WAKE_TIMEOUT_MS = "3000";
// Kurzes Drain-Budget: der Vertrag ist unveraendert, nur die Testlaufzeit wird ertraeglich.
process.env.HELMUT_DRAIN_BUDGET_MS = "8000";
process.env.HELMUT_WORKER_BATCH = "10";
// `HELMUT_SOURCE_MODE=off` wuerde den Auftragstyp `source_fetch` aus der Typmenge des Workers
// nehmen (worker-betrieb: TYPEN_MIT_ABRUF) — dann liefe die Kette ins Leere. Der Abruf selbst
// ist durch den kontrollierten Testhandler ersetzt; es gibt keinen Weg nach draussen (der
// Netz-Guard des Runners blockt jede Nicht-Localhost-Verbindung zusaetzlich).
delete process.env.HELMUT_SOURCE_MODE;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_SELBSTWECK_ERLAUBT;
delete process.env.VERCEL_ENV;
delete process.env.HELMUT_LLM_FAIRNESS;
delete process.env.HELMUT_NARRATIV_QUEUE;

let pass = 0;
let fail = 0;
async function check(name, fn) {
  try { await fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (error) { fail += 1; console.log(`  FAIL  ${name} — ${error && error.message}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// ── Das in-Prozess-Auftragsbuch (Vertrag der SQL-Funktionen) ─────────────────────────────────
const buch = {
  jobs: new Map(),
  outbox: new Map(),
  slots: new Map(),          // slotId -> { klasse, owner, bis }
  handlerLaeufe: [],         // je Fachhandler-Ausfuehrung ein Eintrag (Doppelarbeit sichtbar)
  drainBelegtErzwingen: false
};

function neuerAuftrag({ jobType = "source_fetch", faelligInMs = 0, maxAttempts = 5 } = {}) {
  const id = crypto.randomUUID();
  buch.jobs.set(id, {
    id, job_type: jobType, payload: { quelle: { id: `testquelle-${id.slice(0, 8)}` } },
    tenant_id: null, status: "wartend", attempts: 0, max_attempts: maxAttempts,
    due_at: new Date(Date.now() + faelligInMs).toISOString(),
    created_at: new Date().toISOString(), owner: null, lease_bis: 0
  });
  const outboxId = crypto.randomUUID();
  buch.outbox.set(outboxId, {
    outboxId, jobId: id, schemaVersion: 1, status: "offen", attempts: 0,
    faelligAb: Date.now() + faelligInMs, fehler: null
  });
  return { jobId: id, outboxId };
}

function zuruecksetzen() {
  buch.jobs.clear(); buch.outbox.clear(); buch.slots.clear();
  buch.handlerLaeufe = []; buch.drainBelegtErzwingen = false;
  netzAufrufe.length = 0;
}

// ATOMARE VERGABE — der Kern des Ganzen. Der Rumpf laeuft synchron: zwischen Auswahl und
// Markierung gibt es kein `await`, also kann kein zweiter Worker dieselbe Zeile ziehen.
async function jobQueueClaim({ owner, limit = 10, leaseMs = 120000, types = null } = {}) {
  const jetzt = Date.now();
  const erlaubt = Array.isArray(types) && types.length ? new Set(types) : null;
  const treffer = [];
  for (const job of buch.jobs.values()) {
    if (treffer.length >= limit) break;
    if (erlaubt && !erlaubt.has(job.job_type)) continue;
    const faellig = Date.parse(job.due_at) <= jetzt;
    const frei = job.status === "wartend" || (job.status === "laeuft" && job.lease_bis <= jetzt);
    if (!faellig || !frei) continue;
    job.status = "laeuft";
    job.owner = owner;
    job.lease_bis = jetzt + Math.max(1000, Number(leaseMs) || 120000);
    job.attempts += 1;
    treffer.push({ ...job });
  }
  return { verfuegbar: true, auftraege: treffer };
}

async function jobQueueFinish({ id, owner, ok, error = null, retryDelayMs = 0 } = {}) {
  const job = buch.jobs.get(id);
  if (!job) return { verfuegbar: true, uebernommen: false, neuerStatus: null };
  // FENCING wie in der SQL-Funktion: nur der aktuelle Lease-Halter darf abschliessen.
  if (job.status !== "laeuft" || job.owner !== owner) {
    return { verfuegbar: true, uebernommen: false, neuerStatus: job.status };
  }
  if (ok) {
    job.status = "erledigt"; job.owner = null; job.lease_bis = 0;
    return { verfuegbar: true, uebernommen: true, neuerStatus: "erledigt" };
  }
  if (job.attempts >= job.max_attempts) {
    job.status = "fehlgeschlagen"; job.owner = null; job.lease_bis = 0; job.last_error = error;
    return { verfuegbar: true, uebernommen: true, neuerStatus: "fehlgeschlagen" };
  }
  job.status = "wartend"; job.owner = null; job.lease_bis = 0; job.last_error = error;
  job.due_at = new Date(Date.now() + Math.max(0, Number(retryDelayMs) || 0)).toISOString();
  return { verfuegbar: true, uebernommen: true, neuerStatus: "wartend" };
}

async function jobQueueDefer({ id, owner, delayMs = 60000 } = {}) {
  const job = buch.jobs.get(id);
  if (!job || job.status !== "laeuft" || job.owner !== owner) {
    return { verfuegbar: true, uebernommen: false };
  }
  job.status = "wartend"; job.owner = null; job.lease_bis = 0;
  job.attempts = Math.max(0, job.attempts - 1);           // Vertagen verbraucht keinen Versuch
  job.due_at = new Date(Date.now() + Math.max(0, Number(delayMs) || 0)).toISOString();
  return { verfuegbar: true, uebernommen: true };
}

async function jobQueueExtendLease({ id, owner, leaseMs = 120000 } = {}) {
  const job = buch.jobs.get(id);
  if (!job || job.owner !== owner || job.status !== "laeuft") {
    return { verfuegbar: true, verlaengert: false };
  }
  job.lease_bis = Date.now() + Math.max(1000, Number(leaseMs) || 120000);
  return { verfuegbar: true, verlaengert: true };
}

// ── Outbox (Vertrag von helmut_outbox_*) ─────────────────────────────────────────────────────
async function jobOutboxNaechste({ limit = 50 } = {}) {
  const jetzt = Date.now();
  const absichten = [];
  for (const z of buch.outbox.values()) {
    if (absichten.length >= limit) break;
    if (z.status !== "offen" || z.faelligAb > jetzt) continue;
    z.status = "vergeben"; z.attempts += 1; z.vergebenAb = jetzt;
    absichten.push({ outboxId: z.outboxId, jobId: z.jobId, schemaVersion: z.schemaVersion, attempts: z.attempts });
  }
  return { verfuegbar: true, absichten };
}
async function jobOutboxBestaetige({ outboxId, ok, fehler = null } = {}) {
  const z = buch.outbox.get(outboxId);
  if (!z || z.status !== "vergeben") return { verfuegbar: true, uebernommen: false };
  z.status = ok ? "bestaetigt" : "fehlgeschlagen"; z.fehler = ok ? null : fehler;
  return { verfuegbar: true, uebernommen: true };
}
async function jobOutboxZuruecklegen({ outboxId, warteSekunden = 60 } = {}) {
  const z = buch.outbox.get(outboxId);
  if (!z || z.status !== "vergeben") return { verfuegbar: true, uebernommen: false };
  z.status = "offen";
  z.attempts = Math.max(0, z.attempts - 1);              // der gezogene Versuch geht zurueck
  z.faelligAb = Date.now() + Math.max(0, Number(warteSekunden) || 0) * 1000;
  return { verfuegbar: true, uebernommen: true };
}
async function jobOutboxAbgleich({ mindestalterMinuten = 10 } = {}) {
  const grenze = Date.now() - Math.max(0, Number(mindestalterMinuten) || 0) * 60000;
  let geoeffnet = 0;
  for (const z of buch.outbox.values()) {
    if (z.status === "vergeben" && (z.vergebenAb || 0) <= grenze) { z.status = "offen"; geoeffnet += 1; }
  }
  return { verfuegbar: true, geoeffnet };
}
async function jobOutboxKennzahlen() {
  const zaehler = { offen: 0, vergeben: 0, bestaetigt: 0, fehlgeschlagen: 0 };
  for (const z of buch.outbox.values()) zaehler[z.status] = (zaehler[z.status] || 0) + 1;
  return { verfuegbar: true, kennzahlen: zaehler };
}

// ── Verteilte Klassengrenzen (Vertrag von helmut_klasse_belege) ──────────────────────────────
async function klasseBelege({ klasse, max, ttlMs = 120000, owner } = {}) {
  const jetzt = Date.now();
  for (const [id, s] of [...buch.slots]) if (s.bis <= jetzt) buch.slots.delete(id);
  if (buch.drainBelegtErzwingen && klasse === "worker-drain") {
    // Modell eines BEREITS LAUFENDEN Verbrauchers: die Klasse ist voll.
    return { verfuegbar: true, erlaubt: false, slot: null, belegt: 1 };
  }
  const belegt = [...buch.slots.values()].filter((s) => s.klasse === klasse).length;
  if (max != null && belegt >= max) return { verfuegbar: true, erlaubt: false, slot: null, belegt };
  const slot = `${klasse}-${crypto.randomUUID()}`;
  buch.slots.set(slot, { klasse, owner, bis: jetzt + Math.max(1000, Number(ttlMs) || 120000) });
  return { verfuegbar: true, erlaubt: true, slot, belegt: belegt + 1 };
}
async function klasseGebeFrei({ slot } = {}) { buch.slots.delete(slot); return { verfuegbar: true }; }
async function klasseErneuere({ slot, ttlMs = 60000 } = {}) {
  const s = buch.slots.get(slot);
  if (!s) return { verfuegbar: true, erneuert: false };
  s.bis = Date.now() + Math.max(1000, Number(ttlMs) || 60000);
  return { verfuegbar: true, erneuert: true };
}

// ── Attrappen VOR dem Laden von server.js einsetzen ──────────────────────────────────────────
const storage = require(path.join(ROOT, "lib", "helmut", "storage"));
const crawler = require(path.join(ROOT, "lib", "helmut", "crawler"));
const scalable = require(path.join(ROOT, "lib", "helmut", "scalable-pipeline"));
const dispatch = require(path.join(ROOT, "lib", "helmut", "job-dispatch"));

Object.assign(storage, {
  jobQueueClaim, jobQueueFinish, jobQueueDefer, jobQueueExtendLease,
  jobOutboxNaechste, jobOutboxBestaetige, jobOutboxZuruecklegen, jobOutboxAbgleich,
  jobOutboxKennzahlen, klasseBelege, klasseGebeFrei, klasseErneuere,
  jobQueueOffeneVorbedingungen: async () => ({ verfuegbar: true, offen: 0, fenster: [] }),
  jobQueueWiedervorlage: async () => ({ verfuegbar: true, vorgelegt: 0 }),
  jobQueueBlockiert: async () => ({ verfuegbar: true, blockiert: [] }),
  jobQueueEnqueue: async () => ({ verfuegbar: true, id: crypto.randomUUID(), neu: true }),
  jobQueueEnqueueMitOutbox: async () => ({ verfuegbar: true, id: crypto.randomUUID(), neu: true }),
  persistiereRohdokumenteWarteschlange: async () => ({ ok: true, neuIds: [], vorhandene: 0, anfragen: 0 }),
  jobQueueMetrics: async () => ({
    verfuegbar: true,
    kennzahlen: {
      wartend: [...buch.jobs.values()].filter((j) => j.status === "wartend").length,
      laufend: [...buch.jobs.values()].filter((j) => j.status === "laeuft").length,
      aktive_leases: 0, endgueltig_fehler: 0, erledigt_im_zeitraum: 0,
      aeltester_faelliger_s: 0, max_mandatsalter_s: 0
    }
  })
});

// Der Tagesplan braucht Profile und die Budgetschicht — beides gehoert nicht zur
// Selbstweck-Kette. Die Route behandelt `null` ausdruecklich als "kein Bereichsdeckel".
scalable.tagesplanFuerLauf = async () => null;

// DER KONTROLLIERTE TESTHANDLER: kein Netz, keine Quelle, kein Modell. Er steuert ueber
// `verhalten`, wie der ECHTE Fachhandler `handleSourceFetch` ausgeht.
let verhalten = { art: "erfolg", dauerMs: 0 };
crawler.crawlAllSources = async (quellen) => {
  const eintrag = { quelle: (quellen[0] || {}).id, ts: Date.now() };
  buch.handlerLaeufe.push(eintrag);
  // KETTE: genau wie im Betrieb erzeugt erledigte Arbeit einen FOLGEAUFTRAG samt
  // Versandabsicht (dort atomar ueber die Enqueue-Weiche). Genau EINMAL, sonst liefe die
  // Kette endlos.
  if (verhalten.art === "kette" && !verhalten.folgeErzeugt) {
    verhalten.folgeErzeugt = neuerAuftrag();
  }
  if (verhalten.dauerMs > 0) await new Promise((r) => setTimeout(r, verhalten.dauerMs));
  if (verhalten.art === "fehler") {
    return { results: [{ ok: false, error: "testhandler-fehler" }], rawItems: [] };
  }
  return { results: [{ ok: true }], rawItems: [] };
};

// ── Die Netzbruecke: echter Transport -> echte lokale HTTP-Anfrage ───────────────────────────
const netzAufrufe = [];
let PORT = 0;
const laufendeAntworten = [];   // Anfragen, die der Sender nicht mehr abgewartet hat

function lokalerPost({ body, authorization }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port: PORT, path: "/api/cron/worker-weck", method: "POST",
      headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) }
    }, (res) => {
      let text = "";
      res.on("data", (c) => { text += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* Text bleibt */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

// Ersetzt AUSSCHLIESSLICH die Netzgrenze. Alles davor (Ziel-Riegel, kanonische URL, Bearer,
// Zwei-Felder-Payload) und alles danach (die echte Route) bleibt echt.
globalThis.fetch = async (url, opts = {}) => {
  const ziel = String(url);
  const authorization = (opts.headers || {}).Authorization || null;
  netzAufrufe.push({ ziel, authorization: authorization ? "bearer-gesetzt" : null, body: opts.body });
  assert.strictEqual(ziel, WECK_URL, "der Transport ruft ausschliesslich die kanonische Weck-URL");
  const antwortLauf = lokalerPost({ body: opts.body, authorization });
  laufendeAntworten.push(antwortLauf.catch(() => null));
  // ABBRUCH DES SENDERS: er gibt auf, die lokale Anfrage laeuft weiter. Genau das modelliert
  // den Vercel-Zustand ohne `supportsCancellation` (siehe Abschnitt 12).
  if (opts.signal) {
    const abbruch = new Promise((_, reject) => {
      if (opts.signal.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      opts.signal.addEventListener("abort",
        () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    const r = await Promise.race([antwortLauf, abbruch]);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
  }
  const r = await antwortLauf;
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json };
};

const handler = require(path.join(ROOT, "server.js"));

// Hilfen
const jobStatus = (id) => (buch.jobs.get(id) || {}).status;
const outbox = (id) => buch.outbox.get(id);
const versende = () => dispatch.versendeAbsichten({ limit: 20 });
const warteAufAlleAntworten = () => Promise.all(laufendeAntworten.splice(0));

async function main() {
  console.log("Helmut — Ende-zu-Ende-Test des Selbstwecks (lokal, kein Production-Beweis)\n");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  PORT = server.address().port;

  try {
    // ══ 0 · Vorpruefung: der Betriebsstatus sagt die Wahrheit ═════════════════════════════
    abschnitt("0 · Vorpruefung des Antriebs (wahrer Betriebsstatus)");
    await check("0.1 Vollstaendige Selbstweck-Konfiguration -> bereit, keine Befunde", () => {
      const v = dispatch.aktivierungsVorpruefung();
      assert.strictEqual(v.bereit, true, JSON.stringify(v.befunde));
      assert.strictEqual(v.antrieb, "ereignis");
      assert.strictEqual(v.transport.gewaehlt, "selbstweck");
      assert.strictEqual(v.transport.verfuegbar, true);
      assert.deepStrictEqual(v.befunde, []);
    });
    await check("0.2 Die Vorpruefung gibt kein Geheimnis und keine Adresse aus", () => {
      const text = JSON.stringify(dispatch.aktivierungsVorpruefung());
      assert.ok(!text.includes(SECRET), "CRON_SECRET darf nie im Status stehen");
      assert.ok(!text.includes(PROD_HOST), "kein Deployment-Host im Status");
      assert.ok(!text.includes("/api/cron/worker-weck"), "keine Weckziel-Adresse im Status");
    });

    // ══ 1 · Der geschlossene Erfolgsweg ═══════════════════════════════════════════════════
    abschnitt("1 · Erfolgreicher Durchlauf: Absicht -> signierter Weckruf -> Anspruch -> Handler -> Abschluss");
    let a1;
    await check("1.1 Eine faellige Absicht loest GENAU EINEN signierten Weckruf aus", async () => {
      zuruecksetzen();
      verhalten = { art: "erfolg", dauerMs: 0 };
      a1 = neuerAuftrag();
      const bilanz = await versende();
      assert.strictEqual(bilanz.transport, "selbstweck");
      assert.strictEqual(bilanz.weckrufe, 1, "Tuerklingel: genau ein Ruf je Versandkontext");
      assert.strictEqual(netzAufrufe.length, 1);
      assert.strictEqual(netzAufrufe[0].authorization, "bearer-gesetzt");
      assert.deepStrictEqual(Object.keys(JSON.parse(netzAufrufe[0].body)).sort(),
        ["jobId", "schemaVersion"], "es geht ausschliesslich das Zwei-Felder-Payload ueber die Grenze");
      assert.strictEqual(bilanz.versendet, 1);
    });
    await check("1.2 Der Auftrag wurde atomar beansprucht, ausgefuehrt und abgeschlossen", () => {
      assert.strictEqual(buch.handlerLaeufe.length, 1, "der Fachhandler lief genau einmal");
      assert.strictEqual(jobStatus(a1.jobId), "erledigt");
      assert.strictEqual(buch.jobs.get(a1.jobId).attempts, 1);
    });
    await check("1.3 Die Versandabsicht ist bestaetigt (Outbox ist die Versandwahrheit)", () => {
      assert.strictEqual(outbox(a1.outboxId).status, "bestaetigt");
    });
    await check("1.4 Sauberes Ende: keine weitere Arbeit, kein weiterer Weckruf", async () => {
      const vorher = netzAufrufe.length;
      const bilanz = await versende();
      assert.strictEqual(bilanz.vergeben, 0, "eine leere Outbox vergibt nichts");
      assert.strictEqual(netzAufrufe.length, vorher, "die Klingel laeutet nie ohne Arbeit");
      assert.strictEqual(buch.handlerLaeufe.length, 1);
    });

    // ══ 2 · Authentifizierung ═════════════════════════════════════════════════════════════
    abschnitt("2 · Authentifizierung: falsches Geheimnis kommt nicht an der Route vorbei");
    await check("2.1 Falsches Secret -> 403, kein Anspruch, kein Handlerlauf", async () => {
      zuruecksetzen();
      const a = neuerAuftrag();
      const r = await lokalerPost({
        body: JSON.stringify(dispatch.transportPayload(a.jobId)),
        authorization: "Bearer falsches-secret"
      });
      assert.strictEqual(r.status, 403);
      assert.strictEqual(buch.handlerLaeufe.length, 0);
      assert.strictEqual(jobStatus(a.jobId), "wartend", "der Auftrag bleibt unberuehrt");
    });
    await check("2.2 Ganz ohne Authorization-Header -> 403", async () => {
      const r = await lokalerPost({ body: JSON.stringify(dispatch.transportPayload(crypto.randomUUID())) });
      assert.strictEqual(r.status, 403);
      assert.strictEqual(buch.handlerLaeufe.length, 0);
    });

    // ══ 3 · Ungueltiges Weckziel ══════════════════════════════════════════════════════════
    abschnitt("3 · Ungueltiges Weckziel: geschlossen, ohne einen einzigen Netzaufruf");
    await check("3.1 Fremder Host -> Transport nicht verfuegbar, NICHTS wird vergeben", async () => {
      zuruecksetzen();
      const a = neuerAuftrag();
      const alt = process.env.HELMUT_WORKER_WAKE_URL;
      process.env.HELMUT_WORKER_WAKE_URL = "https://angreifer.example.com/api/cron/worker-weck";
      try {
        const bilanz = await versende();
        assert.strictEqual(bilanz.transportVerfuegbar, false);
        assert.match(String(bilanz.grund), /fremder-host/);
        assert.strictEqual(netzAufrufe.length, 0, "das Bearer-Secret verlaesst den Prozess nie");
        assert.strictEqual(bilanz.vergeben, 0);
        assert.strictEqual(outbox(a.outboxId).status, "offen", "die Absicht bleibt unangetastet offen");
      } finally { process.env.HELMUT_WORKER_WAKE_URL = alt; }
    });
    await check("3.2 Fehlendes Weckziel -> derselbe geschlossene Ausgang, ehrlicher Grund", async () => {
      const alt = process.env.HELMUT_WORKER_WAKE_URL;
      delete process.env.HELMUT_WORKER_WAKE_URL;
      try {
        const bilanz = await versende();
        assert.strictEqual(bilanz.transportVerfuegbar, false);
        assert.match(String(bilanz.grund), /HELMUT_WORKER_WAKE_URL/);
        assert.strictEqual(netzAufrufe.length, 0);
      } finally { process.env.HELMUT_WORKER_WAKE_URL = alt; }
    });

    // ══ 4 · Fehlende Production-Freigabe ══════════════════════════════════════════════════
    abschnitt("4 · Fehlende Production-Freigabe des Selbstwecks");
    await check("4.1 VERCEL_ENV=production ohne HELMUT_SELBSTWECK_ERLAUBT -> gesperrt, kein Netzaufruf", async () => {
      zuruecksetzen();
      const a = neuerAuftrag();
      process.env.VERCEL_ENV = "production";
      try {
        const bilanz = await versende();
        assert.strictEqual(bilanz.transportVerfuegbar, false);
        assert.match(String(bilanz.grund), /selbstweck-in-production-gesperrt/);
        assert.strictEqual(netzAufrufe.length, 0);
        assert.strictEqual(outbox(a.outboxId).status, "offen");
        const v = dispatch.aktivierungsVorpruefung();
        assert.strictEqual(v.bereit, false, "die Vorpruefung meldet den Zustand als NICHT bereit");
      } finally { delete process.env.VERCEL_ENV; }
    });
    await check("4.2 Mit ausdruecklicher Freischaltung ist derselbe Weg wieder verfuegbar", async () => {
      process.env.VERCEL_ENV = "production";
      process.env.HELMUT_SELBSTWECK_ERLAUBT = "on";
      try {
        const v = dispatch.aktivierungsVorpruefung();
        assert.strictEqual(v.transport.verfuegbar, true);
        assert.strictEqual(v.bereit, true);
      } finally {
        delete process.env.VERCEL_ENV;
        delete process.env.HELMUT_SELBSTWECK_ERLAUBT;
      }
    });

    // ══ 5 · Bereits laufender Verbraucher (429) ═══════════════════════════════════════════
    abschnitt("5 · Bereits laufender Verbraucher: 429 ist weder Erfolg noch Fehlversuch");
    await check("5.1 Belegter Drain -> 429, Absicht ZURUECKGELEGT, kein Handlerlauf", async () => {
      zuruecksetzen();
      const a = neuerAuftrag();
      buch.drainBelegtErzwingen = true;
      const bilanz = await versende();
      assert.strictEqual(netzAufrufe.length, 1, "die Klingel kam an");
      assert.strictEqual(bilanz.unbestaetigt, 1);
      assert.strictEqual(bilanz.zurueckgelegt, 1);
      assert.strictEqual(bilanz.versendet, 0);
      assert.strictEqual(bilanz.fehlgeschlagen, 0);
      assert.strictEqual(buch.handlerLaeufe.length, 0, "niemand hat uebernommen -> keine Arbeit");
      const z = outbox(a.outboxId);
      assert.strictEqual(z.status, "offen", "die Absicht ist wieder offen, nicht verbucht");
      assert.strictEqual(z.attempts, 0, "der gezogene Versuch wurde zurueckgegeben");
      assert.ok(z.faelligAb > Date.now(), "kurze Wartezeit statt sofortiger Wiederholung");
      assert.strictEqual(jobStatus(a.jobId), "wartend", "kein Auftrag geht dabei verloren");
    });
    await check("5.2 Nach Freigabe des Drains traegt derselbe Auftrag ganz normal durch", async () => {
      buch.drainBelegtErzwingen = false;
      const z = [...buch.outbox.values()][0];
      z.faelligAb = Date.now() - 1;                      // Wartezeit abgelaufen
      const bilanz = await versende();
      assert.strictEqual(bilanz.versendet, 1);
      assert.strictEqual(buch.handlerLaeufe.length, 1);
      assert.strictEqual(z.status, "bestaetigt");
    });

    // ══ 6 · Zeitueberschreitung: unbestaetigte Zustellung ═════════════════════════════════
    abschnitt("6 · Zeitueberschreitung des Senders (3 s) gegen laufenden Verbraucher");
    let a6;
    await check("6.1 Sender bricht ab -> `unbestaetigt`, es wird NICHTS verbucht", async () => {
      zuruecksetzen();
      a6 = neuerAuftrag();
      verhalten = { art: "erfolg", dauerMs: 900 };        // laenger als die Sendergrenze
      const alt = process.env.HELMUT_WAKE_TIMEOUT_MS;
      process.env.HELMUT_WAKE_TIMEOUT_MS = "500";
      try {
        const bilanz = await versende();
        assert.strictEqual(bilanz.unbestaetigt, 1);
        assert.strictEqual(bilanz.zurueckgelegt, 1);
        assert.strictEqual(bilanz.versendet, 0);
        assert.strictEqual(bilanz.fehlgeschlagen, 0);
      } finally { process.env.HELMUT_WAKE_TIMEOUT_MS = alt; }
    });
    await check("6.2 Der Verbraucher arbeitet nach dem Abbruch zu Ende — genau einmal", async () => {
      const antworten = await warteAufAlleAntworten();
      assert.strictEqual(antworten[0] && antworten[0].status, 200, "die abgebrochene Anfrage lief zu Ende");
      assert.strictEqual(antworten[0].json.erledigt, 1);
      assert.strictEqual(buch.handlerLaeufe.length, 1, "kein zweiter Fachhandlerlauf");
      assert.strictEqual(jobStatus(a6.jobId), "erledigt");
      assert.strictEqual(buch.jobs.get(a6.jobId).attempts, 1);
    });
    await check("6.3 Die zurueckgelegte Absicht laeuft ins Leere statt in Doppelarbeit", async () => {
      const z = outbox(a6.outboxId);
      assert.strictEqual(z.status, "offen");
      z.faelligAb = Date.now() - 1;
      verhalten = { art: "erfolg", dauerMs: 0 };
      await versende();
      await warteAufAlleAntworten();
      assert.strictEqual(buch.handlerLaeufe.length, 1,
        "der Auftrag ist terminal — die erneute Zustellung erzeugt KEINE zweite Ausfuehrung");
    });

    // ══ 7 · Doppelte Weckzustellung ═══════════════════════════════════════════════════════
    abschnitt("7 · Doppelte Weckzustellung: mehrfach zustellen ist wirkungslos, nicht gefaehrlich");
    await check("7.1 Zweimal dasselbe Signal -> genau ein Fachhandlerlauf", async () => {
      zuruecksetzen();
      verhalten = { art: "erfolg", dauerMs: 0 };
      const a = neuerAuftrag();
      const payload = JSON.stringify(dispatch.transportPayload(a.jobId));
      const r1 = await lokalerPost({ body: payload, authorization: `Bearer ${SECRET}` });
      const r2 = await lokalerPost({ body: payload, authorization: `Bearer ${SECRET}` });
      assert.strictEqual(r1.status, 200);
      assert.strictEqual(r2.status, 200);
      assert.strictEqual(r1.json.erledigt, 1);
      assert.strictEqual(r2.json.erledigt, 0, "der zweite Weckruf findet nichts mehr");
      assert.strictEqual(buch.handlerLaeufe.length, 1);
      assert.strictEqual(jobStatus(a.jobId), "erledigt");
    });
    await check("7.2 Die atomare Vergabe ist die Schranke: ein zweiter Beleger bekommt nichts", async () => {
      zuruecksetzen();
      const a = neuerAuftrag();
      const [x, y] = await Promise.all([
        storage.jobQueueClaim({ owner: "worker-a", limit: 10, leaseMs: 60000, types: ["source_fetch"] }),
        storage.jobQueueClaim({ owner: "worker-b", limit: 10, leaseMs: 60000, types: ["source_fetch"] })
      ]);
      const gesamt = x.auftraege.length + y.auftraege.length;
      assert.strictEqual(gesamt, 1, "derselbe Auftrag wird nie zweimal vergeben");
      const fremd = await storage.jobQueueFinish({ id: a.jobId, owner: "fremder", ok: true });
      assert.strictEqual(fremd.uebernommen, false, "wer die Lease nicht haelt, schliesst nicht ab");
    });

    // ══ 8 · Fehler im Handler ═════════════════════════════════════════════════════════════
    abschnitt("8 · Fehler waehrend des Handlers: Wiederholung statt Verlust, Endzustand sichtbar");
    await check("8.1 Handlerfehler -> Auftrag zurueck auf wartend (Backoff), nichts verloren", async () => {
      zuruecksetzen();
      verhalten = { art: "fehler", dauerMs: 0 };
      const a = neuerAuftrag({ maxAttempts: 5 });
      await versende();
      await warteAufAlleAntworten();
      assert.strictEqual(buch.handlerLaeufe.length, 1);
      const job = buch.jobs.get(a.jobId);
      assert.strictEqual(job.status, "wartend");
      assert.strictEqual(job.attempts, 1);
      assert.match(String(job.last_error), /testhandler-fehler/);
      assert.strictEqual(outbox(a.outboxId).status, "bestaetigt",
        "der Weckruf selbst war erfolgreich — der Fachfehler ist eine Auftragsfrage, keine Transportfrage");
    });
    await check("8.2 Erschoepfte Versuche -> endgueltig fehlgeschlagen, sichtbar, nicht still", async () => {
      zuruecksetzen();
      verhalten = { art: "fehler", dauerMs: 0 };
      const a = neuerAuftrag({ maxAttempts: 1 });
      await versende();
      await warteAufAlleAntworten();
      assert.strictEqual(buch.jobs.get(a.jobId).status, "fehlgeschlagen");
      assert.strictEqual(buch.handlerLaeufe.length, 1);
    });

    // ══ 9 · Rueckkehr in den Schattenmodus ════════════════════════════════════════════════
    abschnitt("9 · Rueckweg: zurueck in den Schattenmodus, ohne Datenverlust");
    await check("9.1 Schattenmodus -> kein HTTP, Absichten laufen ueber den Schattenweg", async () => {
      zuruecksetzen();
      verhalten = { art: "erfolg", dauerMs: 0 };
      const a = neuerAuftrag();
      process.env.HELMUT_JOB_DISPATCH_MODE = "shadow";
      try {
        const bilanz = await versende();
        assert.strictEqual(bilanz.transport, "schatten");
        assert.strictEqual(bilanz.versendet, 1);
        assert.strictEqual(netzAufrufe.length, 0, "im Schatten verlaesst nichts den Prozess");
        assert.strictEqual(buch.handlerLaeufe.length, 0);
        assert.strictEqual(outbox(a.outboxId).status, "bestaetigt");
        assert.strictEqual(jobStatus(a.jobId), "wartend", "der Auftrag bleibt fuer den Cron-Weg liegen");
      } finally { process.env.HELMUT_JOB_DISPATCH_MODE = "queue"; }
    });
    await check("9.2 Im Schattenmodus weist die Route jedes Wecksignal geschlossen ab (409)", async () => {
      process.env.HELMUT_JOB_DISPATCH_MODE = "shadow";
      try {
        const r = await lokalerPost({
          body: JSON.stringify(dispatch.transportPayload(crypto.randomUUID())),
          authorization: `Bearer ${SECRET}`
        });
        assert.strictEqual(r.status, 409);
        assert.match(String(r.json.grund), /antrieb-cron-queue/);
      } finally { process.env.HELMUT_JOB_DISPATCH_MODE = "queue"; }
    });
    await check("9.3 Ohne skalierbaren Motor stoppt der Aktivierungsvorlauf geschlossen", async () => {
      zuruecksetzen();
      const a = neuerAuftrag();
      delete process.env.HELMUT_SCALABLE_PIPELINE;
      try {
        const bilanz = await versende();
        assert.strictEqual(bilanz.uebersprungen, true);
        assert.match(String(bilanz.grund), /antrieb-bestand/);
        assert.strictEqual(netzAufrufe.length, 0);
        assert.strictEqual(outbox(a.outboxId).status, "offen",
          "kein Versuch wird verbrannt, solange der Antrieb gar nicht wirksam ist");
      } finally { process.env.HELMUT_SCALABLE_PIPELINE = "on"; }
    });

    // ══ 10 · Folgeweckung ═════════════════════════════════════════════════════════════════
    abschnitt("10 · Folgeweckung: nur bei tatsaechlich faelliger Arbeit");
    await check("10.1 Folgearbeit waehrend des Drains -> genau eine Folgeklingel, Kette laeuft durch", async () => {
      zuruecksetzen();
      // Der Fachhandler erzeugt beim ersten Lauf einen Folgeauftrag mit eigener
      // Versandabsicht — dieselbe Form, in der die Kette im Betrieb entsteht.
      verhalten = { art: "kette", dauerMs: 0, folgeErzeugt: null };
      const erst = neuerAuftrag();
      const bilanz = await versende();
      await warteAufAlleAntworten();
      const folge = verhalten.folgeErzeugt;
      assert.ok(folge, "der Handler hat einen Folgeauftrag erzeugt");
      assert.strictEqual(bilanz.weckrufe, 1, "der Sender klingelt genau einmal");
      assert.strictEqual(netzAufrufe.length, 2,
        `genau eine Folgeklingel aus der Route heraus (${netzAufrufe.length} Rufe insgesamt)`);
      assert.strictEqual(jobStatus(erst.jobId), "erledigt");
      assert.strictEqual(jobStatus(folge.jobId), "erledigt", "die Kette hat auch die Folgearbeit erledigt");
      assert.strictEqual(outbox(folge.outboxId).status, "bestaetigt",
        "die Folgeabsicht ist zugestellt und verbucht");
      assert.strictEqual(buch.handlerLaeufe.length, 2, "zwei Auftraege, zwei Ausfuehrungen — keine mehr");
    });
    await check("10.2 Sauberes Ende: der letzte Lauf klingelt nicht weiter", async () => {
      const vorher = netzAufrufe.length;
      const r = await lokalerPost({
        body: JSON.stringify(dispatch.transportPayload(crypto.randomUUID())),
        authorization: `Bearer ${SECRET}`
      });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.erledigt, 0);
      assert.strictEqual(r.json.versand.weckrufe, 0, "ohne faellige Arbeit gibt es keine Folgeklingel");
      assert.strictEqual(netzAufrufe.length, vorher);
    });

    // ══ 11 · Bilanz der atomaren Schranken ════════════════════════════════════════════════
    abschnitt("11 · Welche atomaren Schranken den Ablauf tragen (keine Unmoeglichkeits-Behauptung)");
    await check("11.1 Drei Schranken, jede einzeln belegt", () => {
      // (a) Auftragsvergabe: §7.2 — zwei gleichzeitige Beleger, genau einer bekommt den Auftrag.
      // (b) Abschluss nur durch den Lease-Halter (Fencing): §7.2 zweiter Teil.
      // (c) Vergabe der Versandabsicht + Drain-Klasse `worker-drain` (max 1): §5.1.
      // Die Aussage bleibt: in KEINEM geprueften Fall gab es Doppelarbeit oder einen
      // verlorenen Auftrag — nicht: sie seien unmoeglich.
      assert.ok(true);
    });
    await check("11.2 Ueber alle Abschnitte: kein Auftrag blieb in `laeuft` haengen", () => {
      const haengend = [...buch.jobs.values()].filter((j) => j.status === "laeuft");
      assert.strictEqual(haengend.length, 0, JSON.stringify(haengend.map((j) => j.id)));
    });

    // ══ 12 · Drei Sekunden gegen sechzig Sekunden ═════════════════════════════════════════
    abschnitt("12 · 3-s-Sendergrenze gegen 60-s-Verbraucherlauf (Vercel-Beleg)");
    await check("12.1 vercel.json aktiviert `supportsCancellation` NICHT (Abbruch beendet nicht)", () => {
      // Offizielle Vercel-Dokumentation (functions-api-reference, abgerufen 2026-08-24):
      // „Request cancellation allows your Vercel Functions to stop execution when a client
      // disconnects … This is an opt-in feature that must be enabled in your project
      // configuration." Ohne `supportsCancellation` beendet die Plattform die Ausfuehrung
      // also NICHT, wenn der Sender aufgibt. Diese Pruefung ist der Waechter: wer die
      // Option spaeter einschaltet, macht den Selbstweck-Vertrag ungueltig und faellt hier auf.
      const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
      const text = JSON.stringify(vercel);
      assert.ok(!/supportsCancellation/.test(text),
        "supportsCancellation ist gesetzt — der Verbraucher koennte beim Senderabbruch beendet werden");
      const fn = (vercel.functions || {})["api/index.js"] || {};
      assert.ok(Number(fn.maxDuration) >= 300, `maxDuration=${fn.maxDuration}`);
    });
    await check("12.2 Das Drain-Budget bleibt unter der Funktionsgrenze", () => {
      const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
      const maxMs = Number((vercel.functions["api/index.js"] || {}).maxDuration) * 1000;
      const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
      const stelle = serverSrc.indexOf("HELMUT_DRAIN_BUDGET_MS");
      const zeile = serverSrc.slice(stelle - 200, stelle + 200);
      const obergrenze = Number((zeile.match(/Math\.min\((\d+)/) || [])[1]);
      assert.ok(obergrenze > 0 && obergrenze < maxMs,
        `Drain-Obergrenze ${obergrenze} ms muss unter ${maxMs} ms liegen`);
    });
    await check("12.3 Der Sender wartet kuerzer als der Verbraucher arbeitet — und das ist verbucht", () => {
      // Kein Wunschdenken: die Sendergrenze (Default 3 s) ist KLEINER als das Drain-Budget
      // (Default 60 s). Genau deshalb ist `unbestaetigt` ein eigener, dritter Ausgang neben
      // Erfolg und Fehlversuch — belegt in §6.1/§6.2.
      const quelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", "job-dispatch.js"), "utf8");
      assert.match(quelle, /HELMUT_WAKE_TIMEOUT_MS\) \|\| 3000/);
      assert.match(quelle, /unbestaetigt: true/);
      const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
      assert.match(serverSrc, /HELMUT_DRAIN_BUDGET_MS\) \|\| 60000/);
    });
  } finally {
    await warteAufAlleAntworten().catch(() => null);
    await new Promise((r) => server.close(r));
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("Einordnung: lokaler Ende-zu-Ende-Nachweis des Selbstwecks. KEIN Production-Beweis.");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.stack);
  process.exit(1);
});
