"use strict";

// Helmut — EIN SLOTLAUF DES REALISTIKNACHWEISES Z3 (2026-08-26).
// =============================================================================================
// WAS DIESER PROZESS IST: die Nachbildung EINER Cron-Ausfuehrung des Warteschlangenslots —
// ein eigener Node-Prozess mit eigenem Zeitbudget, eigenen Datenbankverbindungen und eigenem
// Lease-Besitzer, so wie eine Serverless-Ausfuehrung. Er faehrt DIESELBE Reihenfolge wie
// `server.js runCronUeberWarteschlange`:
//
//   1. Laufquittung "running" schreiben          (storage.schreibeWarteschlangenLaufquittung)
//   2. planen                                    (scalable-pipeline.planeArbeit)
//   3. Wiedervorlage                             (scalable-pipeline.wiedervorlage)
//   4. Outbox-Abgleich und Weckversand           (job-dispatch — bei `shadow` ein No-Op)
//   5. arbeiten                                  (worker-betrieb.durchlauf, echte Handler)
//   6. Laufquittung abschliessen
//
// WAS ECHT IST: alle sechs Schritte sind der unveraenderte Produktionscode. Der Datenzugriff
// laeuft ueber `SUPABASE_URL` — also HTTP/PostgREST/PostgreSQL, nicht ueber `psql`. Die
// Fachhandler sind die echten (`HANDLER` in `scalable-pipeline.js`): echter Abruf, echtes
// Parsen, echtes Verstehen mit echtem Modellaufruf, echte Projektion, echtes Briefing.
//
// >>> DIE EINE BENANNTE ERSETZUNG <<<
//   Beim PLANEN wird der URSPRUNGS-HOST jeder Quellenadresse auf den lokalen Anbieter-
//   ursprung umgeschrieben (Pfad und Abfrage bleiben unveraendert). Grund: die Adressen
//   zeigen im Produktionscode fest auf `news.google.com`; ein Lasttest gegen einen fremden
//   Anbieter waere ein Massen-Crawl (CLAUDE.md §5) und ohne Freigabe verboten. FOLGE, die
//   ausdruecklich benannt wird: der Google-Sonderweg (`isGoogleNewsUrl`) greift damit NICHT
//   — Browser-Kennung, Google-Gate, Circuit-Breaker und Artikel-URL-Aufloesung bleiben in
//   diesem Lauf UNGEPRUEFT. Sie gehoeren zum offenen Teil des Nachweises.
//
// SICHERHEIT — DREI RIEGEL, jeder fuer sich fail closed:
//   1. Der Prozess bricht ab, wenn irgendeine Production-Kennung sichtbar ist.
//   2. Er bricht ab, wenn `SUPABASE_URL` oder der KI-Endpunkt nicht die Schleifenadresse ist.
//   3. Der geerbte Laufzeitriegel (`scripts/lokaler-netzschutz.js`) weist jede nicht-lokale
//      Verbindung ab — er wird NICHT abgeschaltet.
//
// Ausgabe: genau eine JSON-Zeile auf stdout (die letzte), damit der Elternprozess sie liest.

const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

function arg(name, standard = "") {
  const treffer = process.argv.find((a) => a.startsWith("--" + name + "="));
  return treffer ? treffer.slice(name.length + 3) : standard;
}

const LOKALE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
function istLokal(rohUrl) {
  try { return LOKALE_HOSTS.has(new URL(String(rohUrl)).hostname); } catch (_) { return false; }
}

// ── Riegel 1 und 2, VOR jedem Laden von Produktionscode ──────────────────────────────────────
const PRODUKTIONSKENNUNGEN = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "VERCEL_TOKEN",
  "OPENAI_API_KEY", "BLOB_READ_WRITE_TOKEN"];
const sichtbar = PRODUKTIONSKENNUNGEN.filter((n) => String(process.env[n] || "").trim() !== "");
if (sichtbar.length) {
  process.stdout.write(JSON.stringify({ fehler: `abbruch-produktionskennung: ${sichtbar.join(", ")}` }) + "\n");
  process.exit(3);
}

const DATENBANK_URL = arg("datenbank");
const KI_URL = arg("ki");
const URSPRUNG_URL = arg("ursprung");
if (!istLokal(DATENBANK_URL) || !istLokal(KI_URL) || !istLokal(URSPRUNG_URL)) {
  process.stdout.write(JSON.stringify({
    fehler: "abbruch-nicht-lokal: Datenbanktor, KI-Endpunkt und Anbieterursprung muessen auf 127.0.0.1 zeigen"
  }) + "\n");
  process.exit(3);
}

// ── Die Umgebung DIESES Slotlaufs ────────────────────────────────────────────────────────────
// Alle Werte zeigen auf die Schleifenadresse. `scripts/lokal.js` hat die Kennungen der Sitzung
// bereits entfernt; hier entstehen ausschliesslich lokale Ersatzwerte. Es wird KEINE Datei und
// KEINE Sitzungsvariable veraendert.
process.env.SUPABASE_URL = DATENBANK_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = arg("dienstschluessel");
process.env.AZURE_OPENAI_ENDPOINT = KI_URL;
// Attrappenwerte fuer den LOKALEN Endpunkt. Sie berechtigen zu nichts: der KI-Endpunkt
// verlangt nur, dass die Kopfzeile `api-key` ueberhaupt gesetzt ist, und beide Werte
// erreichen ausschliesslich 127.0.0.1.
process.env.AZURE_OPENAI_KEY = "attrappe-lokaler-z3-endpunkt";
process.env.CRON_SECRET = `attrappe-z3-${process.pid}`;

// NODE_EXTRA_CA_CERTS wird von Node beim PROZESSSTART gelesen — eine Zuweisung hier waere
// wirkungslos (belegt im ersten Probelauf: `unable to verify the first certificate`). Der
// Elternprozess setzt sie deshalb in der Startumgebung; hier wird nur geprueft, dass sie
// wirklich anliegt. Ohne sie waere jeder Modellaufruf ein TLS-Fehler statt einer Messung.
if (!String(process.env.NODE_EXTRA_CA_CERTS || "").trim()) {
  process.stdout.write(JSON.stringify({
    fehler: "abbruch-ca-fehlt: NODE_EXTRA_CA_CERTS muss beim Prozessstart gesetzt sein"
  }) + "\n");
  process.exit(3);
}

// Produktionsschalter des Warteschlangenbetriebs.
process.env.HELMUT_SCALABLE_PIPELINE = "on";
process.env.HELMUT_JOB_DISPATCH_MODE = arg("dispatch", "shadow");
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.HELMUT_V3_STORE = "1";
// Der Quellenmodus muss AN sein, sonst verweigert `worker-betrieb` jeden externen Abruf
// (TYPEN_MIT_ABRUF). Der Umgebungsriegel des Netzschutzes ist zu diesem Zeitpunkt bereits
// gelaufen; der LAUFZEITRIEGEL bleibt unveraendert scharf.
process.env.HELMUT_SOURCE_MODE = "on";
// DIE FLAGGEN, DIE PRODUCTION HEUTE FAEHRT (docs/CURRENT_STATE.md §4, docs/betrieb/env-inventar.md).
// Ohne sie waere der Lauf NICHT produktionsnah: `HELMUT_V3_MATCHING` ist in Production
// faktisch AN (belegt ueber frische `profile_embeddings`/`matching_results`, env-inventar
// §175) — fehlt es, meldet `runMatchingShadow` `matching-disabled`, jede Projektion wird
// zurueckgestellt und jedes Briefing wartet auf eine Vorbedingung, die nie faellt (im
// Eichlauf gemessen: 10 Auftraege blieben ueber alle Slots stehen).
process.env.HELMUT_V3_MATCHING = arg("v3Matching", "1");
process.env.HELMUT_MATCHING_AUDIT = arg("matchingAudit", "on");
process.env.HELMUT_PROCESS_RUNS_RELATIONAL = "on";
process.env.HELMUT_ATOMIC_LOCK = "on";
process.env.HELMUT_VERSTEHEN_CAS = "on";
// `HELMUT_MATCHING_DIM` bleibt ausdruecklich UNGESETZT (env-inventar §175: ein abweichender
// Wert erzeugte Vektoren, die nicht in die Spalte passen).
process.env.HELMUT_WORKER_PARALLEL = arg("parallel", "4");
process.env.HELMUT_WORKER_STAPEL = arg("stapel", "25");
process.env.HELMUT_WORKER_BATCH = arg("stapel", "25");
process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = arg("kiDeckel", "100000");
process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = arg("kiReserve", "0");
process.env.CRAWLER_TIMEOUT_MS = arg("abrufTimeoutMs", "7000");

const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const workerBetrieb = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));
const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
const jobDispatch = require(path.join(ROOT, "lib/helmut/job-dispatch.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));
const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));

// ── Die eine benannte Ersetzung: Ursprungs-Host der Quellenadresse ───────────────────────────
function aufLokalenUrsprung(rohUrl) {
  try {
    const ziel = new URL(URSPRUNG_URL);
    const quelle = new URL(String(rohUrl));
    quelle.protocol = ziel.protocol;
    quelle.hostname = ziel.hostname;
    quelle.port = ziel.port;
    return quelle.toString();
  } catch (_) { return rohUrl; }
}
function quelleUmschreiben(quelle) {
  if (!quelle || typeof quelle !== "object") return quelle;
  const neu = { ...quelle };
  if (neu.url) neu.url = aufLokalenUrsprung(neu.url);
  if (neu.rssUrl) neu.rssUrl = aufLokalenUrsprung(neu.rssUrl);
  if (Array.isArray(neu.rssUrls)) neu.rssUrls = neu.rssUrls.map(aufLokalenUrsprung);
  return neu;
}

async function main() {
  const mandate = Number(arg("mandate", "25"));
  const budgetMs = Number(arg("budgetMs", "290000"));
  const slot = Number(arg("slot", "1"));
  const fehlerMandat = arg("fehlerMandat", "");
  const start = Date.now();
  // ── DIE PLANUNGSZEIT IST DIE CRON-ZEIT, NICHT DIE WANDUHR ────────────────────────────────
  // Die Aktualitaetsfenster der Bedarfsverdichtung sind Zeitfenster fester Breite
  // (`source-demand.fensterKennung`): geteilte Abrufe liegen in 8-Stunden-Fenstern,
  // mandatsgebundene Arbeit in einem 24-Stunden-Fenster. Welches Fenster ein Slot plant,
  // haengt also an SEINER Uhrzeit — und Production faehrt seine drei allgemeinen Abfluesse um
  // 04:00, 16:00 und 20:00 UTC, also in ZWEI verschiedenen 8-Stunden-Fenstern.
  //
  // BELEGTER MESSFEHLER (26.08.): ohne diese Vorgabe plante der Prüfstand mit der WANDUHR.
  // Ob zwei Slots dasselbe Fenster sahen, hing dann davon ab, ob der Lauf zufaellig eine
  // Fenstergrenze kreuzte — im Eichlauf plante Slot 2 einmal 0 und einmal 144 zusaetzliche
  // Auftraege. Die Ankunftsmenge war damit vom Startzeitpunkt des Laufs abhaengig.
  //
  // Der Aufrufer gibt deshalb die Cron-Zeit des Slots vor. Slot 1..3 sind die drei
  // regulaeren Abfluesse EINES Tages; jeder weitere Slot ist der naechste Abfluss des
  // FOLGENDEN Tages — genau die Aussage, um die es geht ("die Tagesmenge braucht mehr als
  // die Tagesslots").
  const planungsZeitMs = Number(arg("jetztMs", "")) || start;
  const laufkennung = `z3-stufe${mandate}-slot${slot}-${start}`;
  const verbleibend = () => Math.max(0, budgetMs - (Date.now() - start));

  const profile = erzeugeMandate(mandate).map((p) => (
    p.id === fehlerMandat
      // DAS FEHLERMANDAT ist ECHT krank: sein PERSOENLICHER Abrufweg zeigt auf eine Adresse,
      // die der lokale Ursprung nie beantwortet. Es scheitert damit im ECHTEN Abrufpfad
      // (Zeitueberschreitung), nicht durch einen ausgetauschten Handler.
      ? { ...p, __z3fehler: true }
      : p
  ));

  // 1 · Laufquittung
  const startQuittung = await storage.schreibeWarteschlangenLaufquittung({
    process: `warteschlange-z3-${mandate}`.slice(0, 40), runId: laufkennung, mode: "warteschlange",
    location: "z3-lasttest", status: "running",
    startedAt: new Date(start).toISOString(), finishedAt: null
  }).catch((e) => ({ ok: false, grund: String((e && e.message) || "fehler").slice(0, 120) }));

  // 2 · Planen — Produktionsfunktion, nur die Quellenadresse zeigt lokal.
  const planStart = Date.now();
  const plan = await SP.planeArbeit({
      jetztMs: planungsZeitMs,
      deps: {
        listFullProfiles: async () => profile,
        quellenFuerProfil: async (p) => {
          const quellen = [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];
          if (p.__z3fehler) {
            // NUR DER PERSOENLICHE WEG des Mandats ist tot — der, den `personNewsSource`
            // erzeugt (Kennung `<mandats-id>-news`) und der als EINZIGER die Mandatskennung
            // traegt. Alle uebrigen Wege eines Mandats sind GETEILTE Arbeit (`tenantId: null`,
            // `lib/helmut/source-demand.js`): sie gehoeren allen Mandaten gemeinsam. Zeigten
            // auch sie auf den toten Weg, scheiterte nicht EIN Mandat, sondern die geteilte
            // Grundversorgung — und der Lauf meldete Fehler, die keinem Mandat zuzurechnen
            // sind (im Eichlauf gemessen: 7 der 8 endgueltigen Fehler trugen `tenant_id`
            // NULL). Der tote Weg bleibt je Quelle UNTERSCHIEDLICH, sonst legte die
            // Bedarfsverdichtung (Hash der kanonisierten Abrufdefinition) mehrere Quellen zu
            // einem Auftrag zusammen und die Auftragsmenge der Stufe fiele kleiner aus.
            const persoenlich = `${p.id}-news`;
            return quellen.map((q) => {
              if (String(q.id || "") !== persoenlich) return quelleUmschreiben(q);
              const weg = `${URSPRUNG_URL}/immer-haenger/${encodeURIComponent(String(q.id))}`;
              return { ...quelleUmschreiben(q), rssUrl: weg, rssUrls: [weg], url: weg };
            });
          }
          return quellen.map(quelleUmschreiben);
        }
      }
  }).catch((e) => ({ ok: false, grund: String((e && e.message) || "fehler").slice(0, 200), geplant: 0, neu: 0 }));
  const planDauerMs = Date.now() - planStart;

  // 3 · Wiedervorlage
  const wieder = await SP.wiedervorlage({ trockenlauf: false })
    .catch((e) => ({ verfuegbar: false, grund: String((e && e.message) || "fehler").slice(0, 200) }));

  // 4 · Outbox-Abgleich und Weckversand (im Modus `shadow` ein No-Op — wie in Production)
  const outboxAbgleich = await jobDispatch.abgleich({ limit: 200 })
    .catch((e) => ({ verfuegbar: false, grund: String((e && e.message) || "fehler").slice(0, 200) }));
  const weckVersand = await jobDispatch.versendeAbsichten({ limit: 100 })
    .catch((e) => ({ versendet: 0, fehlgeschlagen: 0, grund: String((e && e.message) || "fehler").slice(0, 200) }));

  // 5 · Arbeiten — echte Handler ueber den Workerbetrieb, genau wie der Cron.
  const arbeitStart = Date.now();
  const durchlauf = await workerBetrieb.durchlauf({
    kennung: laufkennung,
    grenzen: { budgetMs: Math.max(1, verbleibend() - 10000), leaseMs: 300000, stapel: Number(arg("stapel", "25")) },
    tagesplan: (plan && plan.tagesplan) || null,
    deps: {
      // Dieselbe Einreichung wie in `server.js`: `buildV3Briefing` steht dort, nicht in `lib/`.
      buildV3Briefing: (profil, politicianId, opt) =>
        require(path.join(ROOT, "server.js")).__buildV3Briefing(profil, politicianId, opt)
    }
  }).catch((e) => ({ fehler: String((e && e.message) || "fehler").slice(0, 300) }));
  const arbeitDauerMs = Date.now() - arbeitStart;

  // 6 · Laufquittung abschliessen
  const abschlussQuittung = await storage.schreibeWarteschlangenLaufquittung({
    process: `warteschlange-z3-${mandate}`.slice(0, 40), runId: laufkennung, mode: "warteschlange",
    location: "z3-lasttest",
    status: durchlauf && durchlauf.fehler ? "error" : "success",
    startedAt: new Date(start).toISOString(), finishedAt: new Date().toISOString()
  }).catch((e) => ({ ok: false, grund: String((e && e.message) || "fehler").slice(0, 120) }));

  process.stdout.write(JSON.stringify({
    slot, mandate, laufkennung, planungsZeit: new Date(planungsZeitMs).toISOString(),
    dauerMs: Date.now() - start, planDauerMs, arbeitDauerMs,
    plan: { geplant: plan && plan.geplant, neu: plan && plan.neu, grund: plan && plan.grund || null },
    wiedervorlage: { verfuegbar: wieder && wieder.verfuegbar !== false, wiedervorgelegt: (wieder && wieder.wiedervorgelegt) || 0 },
    outbox: { abgleich: outboxAbgleich && outboxAbgleich.verfuegbar !== false, versendet: (weckVersand && weckVersand.versendet) || 0 },
    durchlauf,
    quittung: { start: startQuittung && startQuittung.ok !== false, ende: abschlussQuittung && abschlussQuittung.ok !== false }
  }) + "\n");
  process.exit(0);
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ fehler: String((error && error.stack) || error).slice(0, 900) }) + "\n");
  process.exit(1);
});
