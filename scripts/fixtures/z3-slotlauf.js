"use strict";

// Helmut — EIN SLOTLAUF DES REALISTIKNACHWEISES Z3 (2026-08-26).
// =============================================================================================
// WAS DIESER PROZESS IST: die Nachbildung EINER Cron-Ausfuehrung des Warteschlangenslots —
// ein eigener Node-Prozess mit eigenem Zeitbudget, eigenen Datenbankverbindungen und eigenem
// Lease-Besitzer, so wie eine Serverless-Ausfuehrung. Er faehrt dieselben sechs
// Produktionsfunktionen in derselben Reihenfolge wie `server.js runCronUeberWarteschlange`:
//
//   1. Laufquittung "running" schreiben          (storage.schreibeWarteschlangenLaufquittung)
//   2. planen                                    (scalable-pipeline.planeArbeit)
//   3. Wiedervorlage                             (scalable-pipeline.wiedervorlage)
//   4. Outbox-Abgleich und Weckversand           (job-dispatch — bei `shadow` ein No-Op)
//   5. arbeiten                                  (worker-betrieb.durchlauf, echte Handler)
//   6. Laufquittung abschliessen
//
// WAS ECHT IST: alle sechs Schritte rufen den unveraenderten Produktionscode. Die umgebende
// Orchestrierung ist in dieser Datei weiterhin separat abgebildet und deshalb ein offener
// Codebefund, kein Beleg fuer bytegleichen Routencode. Der Datenzugriff
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
const fs = require("fs");
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
const PRODUKTIONSKENNUNGEN = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
  "SUPABASE_ANON_KEY", "SUPABASE_JWT_SECRET", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY",
  "VERCEL_TOKEN", "OPENAI_API_KEY", "BLOB_READ_WRITE_TOKEN"];
const DATENBANK_URL = arg("datenbank");
const KI_URL = arg("ki");
const URSPRUNG_URL = arg("ursprung");
const FACHWEG_LAUF = String(arg("fachwegLauf", process.env.HELMUT_Z3B_FACHWEG_LAUF || "")).trim();
const FACHWEG_MANIFEST_SHA = String(arg("manifestSha256", "")).trim();
const IST_FACHWEG = FACHWEG_LAUF !== "";
const FACHWEG_UMGEBUNG = Object.freeze({
  HELMUT_NARRATIV_QUEUE: "on",
  HELMUT_LLM_FAIRNESS: "on",
  HELMUT_LLM_GLOBAL_ANTEIL: "0.5",
  HELMUT_WIEDERVORLAGE_STUNDEN: "24",
  HELMUT_WIEDERVORLAGE_MAX: "2",
  HELMUT_JOB_TIMEOUT_MS: "120000",
  HELMUT_NARRATIV_TIMEOUT_MS: "45000",
  HELMUT_UNDERSTANDING_BUENDEL: "25",
  HELMUT_VORBEDINGUNG_WARTE_MS: "120000",
  HELMUT_VORBEDINGUNG_MAX_WARTE_MS: "21600000",
  HELMUT_BUDGET_WARTE_MS: "3600000",
  HELMUT_BUDGET_MAX_WARTE_MS: "172800000",
  HELMUT_WORKER_LEERLAUF_MS: "0",
  CRAWLER_TIMEOUT_MS: "7000",
  HELMUT_KI_TIMEOUT_MS: "20000",
  HELMUT_WORKER_LEASE_MS: "300000",
  HELMUT_KLASSEN_GRENZEN: "on",
  HELMUT_KLASSE_QUELLENABRUF_MAX: "5",
  HELMUT_KLASSE_VERSTEHEN_MAX: "1",
  HELMUT_KLASSE_WORKER_DRAIN_MAX: "1",
  HELMUT_VERSTEHEN_KONKURRENZ: "off",
  HELMUT_VERSTEHEN_PARALLELITAET: "1",
  HELMUT_VERSTEHEN_LEASE_MS: "300000",
  HELMUT_VERSTEHEN_WIEDERAUFNAHME_MAX: "25",
  HELMUT_KO_SCAN_LIMIT: "500",
  HELMUT_LAGE_MAX_VORGAENGE: "12",
  HELMUT_LAGE_DEMO: "off",
  HELMUT_LLM_BUDGET_FAIL_CLOSED: "on",
  HELMUT_UNDERSTANDING_GATE: "off",
  HELMUT_UNDERSTANDING_PRIORITY: "off",
  HELMUT_MAX_LLM_CALLS_PER_DAY: "1000000",
  HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY: "1000000",
  HELMUT_LLM_RESERVE_UNDERSTANDING: "0"
});

function pruefeStartSicherheit() {
  const sichtbar = PRODUKTIONSKENNUNGEN.filter((n) => String(process.env[n] || "").trim() !== "");
  if (sichtbar.length) {
    throw Object.assign(new Error(`abbruch-produktionskennung: ${sichtbar.join(", ")}`), { exitCode: 3 });
  }
  if (!istLokal(DATENBANK_URL) || !istLokal(KI_URL) || !istLokal(URSPRUNG_URL)) {
    throw Object.assign(new Error(
      "abbruch-nicht-lokal: Datenbanktor, KI-Endpunkt und Anbieterursprung muessen auf 127.0.0.1 zeigen"
    ), { exitCode: 3 });
  }
  if (IST_FACHWEG) {
    if (!/^[a-z0-9]{6,32}$/.test(FACHWEG_LAUF)
        || FACHWEG_LAUF !== String(process.env.HELMUT_Z3B_FACHWEG_LAUF || "").trim()) {
      throw Object.assign(new Error("abbruch-fachweglauf-nicht-gebunden"), { exitCode: 3 });
    }
    if (!/^[0-9a-f]{64}$/.test(FACHWEG_MANIFEST_SHA)) {
      throw Object.assign(new Error("abbruch-fachwegmanifest-nicht-gebunden"), { exitCode: 3 });
    }
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(
      String(process.env.HELMUT_Z3B_FACHWEG_KI_MODELL || "").trim().toLowerCase())) {
      throw Object.assign(new Error("abbruch-fachwegmodell-nicht-gebunden"), { exitCode: 3 });
    }
    if (Number(arg("budgetMs", "")) !== 290000
        || Number(arg("parallel", "")) !== 4
        || Number(arg("stapel", "")) !== 25) {
      throw Object.assign(new Error("abbruch-fachweggrenzen-widerspruechlich"), { exitCode: 3 });
    }
    const ziel = Number(arg("mandate", ""));
    const slot = Number(arg("slot", ""));
    const cronStunden = [4, 16, 20];
    const erwartetMs = Date.parse("2026-08-26T00:00:00Z")
      + Math.floor((slot - 1) / 3) * 86400000 + cronStunden[(slot - 1) % 3] * 3600000;
    if (![200, 500].includes(ziel) || !Number.isInteger(slot) || slot < 1 || slot > 6
        || Number(arg("jetztMs", "")) !== erwartetMs
        || Number(arg("kiDeckel", "")) !== 1000000 || Number(arg("kiReserve", "")) !== 0) {
      throw Object.assign(new Error("abbruch-fachwegziel-slot-oder-ki-grenze-widerspruechlich"), { exitCode: 3 });
    }
    const envDatei = [".env.local", ".env", "env.local", "env.local.html"]
      .find((name) => fs.existsSync(path.join(ROOT, name)));
    if (envDatei) {
      throw Object.assign(new Error(`abbruch-lokale-env-datei-sichtbar:${envDatei}`), { exitCode: 3 });
    }
  }
  if (!String(process.env.NODE_EXTRA_CA_CERTS || "").trim()) {
    throw Object.assign(new Error(
      "abbruch-ca-fehlt: NODE_EXTRA_CA_CERTS muss beim Prozessstart gesetzt sein"
    ), { exitCode: 3 });
  }
}

// ── Die Umgebung DIESES Slotlaufs ────────────────────────────────────────────────────────────
// Alle Werte zeigen auf die Schleifenadresse. `scripts/lokal.js` hat die Kennungen der Sitzung
// bereits entfernt; hier entstehen ausschliesslich lokale Ersatzwerte. Es wird KEINE Datei und
// KEINE Sitzungsvariable veraendert.
function initialisiereUmgebung() {
  process.env.SUPABASE_URL = DATENBANK_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = arg("dienstschluessel");
  process.env.AZURE_OPENAI_ENDPOINT = KI_URL;
  // Attrappenwerte fuer den LOKALEN Endpunkt. Sie berechtigen zu nichts: der KI-Endpunkt
  // verlangt nur, dass die Kopfzeile `api-key` ueberhaupt gesetzt ist.
  process.env.AZURE_OPENAI_KEY = "attrappe-lokaler-z3-endpunkt";
  process.env.CRON_SECRET = `attrappe-z3-${process.pid}`;
  process.env.HELMUT_SCALABLE_PIPELINE = "on";
  process.env.HELMUT_JOB_DISPATCH_MODE = IST_FACHWEG ? "shadow" : arg("dispatch", "shadow");
  process.env.HELMUT_STORAGE_BACKEND = "supabase";
  process.env.HELMUT_V3_STORE = "1";
  process.env.HELMUT_SOURCE_MODE = "on";
  process.env.HELMUT_V3_MATCHING = arg("v3Matching", "1");
  process.env.HELMUT_MATCHING_AUDIT = arg("matchingAudit", "on");
  process.env.HELMUT_PROCESS_RUNS_RELATIONAL = "on";
  process.env.HELMUT_ATOMIC_LOCK = "on";
  process.env.HELMUT_VERSTEHEN_CAS = "on";
  process.env.HELMUT_WORKER_PARALLEL = IST_FACHWEG ? "4" : arg("parallel", "4");
  process.env.HELMUT_WORKER_STAPEL = IST_FACHWEG ? "25" : arg("stapel", "25");
  process.env.HELMUT_WORKER_BATCH = IST_FACHWEG ? "25" : arg("stapel", "25");
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = arg("kiDeckel", "100000");
  process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = arg("kiReserve", "0");
  process.env.CRAWLER_TIMEOUT_MS = arg("abrufTimeoutMs", "7000");
  if (IST_FACHWEG) {
    Object.assign(process.env, FACHWEG_UMGEBUNG);
    process.env.AZURE_OPENAI_DEPLOYMENT = String(process.env.HELMUT_Z3B_FACHWEG_KI_MODELL);
    delete process.env.HELMUT_MATCHING_DIM;
  }
}

let SP;
let workerBetrieb;
let storage;
let jobDispatch;
let sched;
let erzeugeMandate;
const kiKlassen = { understanding: 0, lage: 0, buero: 0, sonstige: 0 };
const ausstehendeKiProtokolle = new Set();
function kiKlasse(callType) {
  const typ = String(callType || "").trim().toLowerCase();
  if (typ === "understanding") return "understanding";
  if (typ === "lagebriefing" || typ === "lage-narrativ") return "lage";
  if (typ === "office-output") return "buero";
  return "sonstige";
}
function ladeProduktionsmodule() {
  SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
  workerBetrieb = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));
  storage = require(path.join(ROOT, "lib/helmut/storage.js"));
  jobDispatch = require(path.join(ROOT, "lib/helmut/job-dispatch.js"));
  sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));
  ({ erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js")));
  if (IST_FACHWEG && storage && typeof storage.recordLlmUsage === "function") {
    const original = storage.recordLlmUsage.bind(storage);
    storage.recordLlmUsage = (entry = {}) => {
      const callType = String(entry.callType || "");
      if (entry.keinAufruf !== true && !callType.startsWith("skipped-")) {
        kiKlassen[kiKlasse(callType)] += 1;
      }
      const aufruf = Promise.resolve(original(entry));
      ausstehendeKiProtokolle.add(aufruf);
      aufruf.then(
        () => ausstehendeKiProtokolle.delete(aufruf),
        () => ausstehendeKiProtokolle.delete(aufruf)
      );
      return aufruf;
    };
  }
}

async function warteAufKiProtokolle() {
  while (ausstehendeKiProtokolle.size) {
    await Promise.allSettled([...ausstehendeKiProtokolle]);
  }
}

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

function pruefeFachwegIntegritaet({ plan, wieder, outboxAbgleich, weckVersand,
  durchlauf, startQuittung, abschlussQuittung, kiZaehler,
  laufkennung = null, fachwegLauf = null, zielMandate = null, quittungsStatus = null } = {}) {
  const fehler = [];
  if (!fachwegLauf || !String(laufkennung || "").startsWith(`z3b-${fachwegLauf}-`)) {
    fehler.push("laufquittung-nicht-an-fachweg-gebunden");
  }
  if (!plan || plan.ok !== true || plan.uebersprungen !== false) {
    fehler.push("planung-nicht-erfolgreich");
  } else {
    const namen = ["geplant", "neu", "vorhanden", "versucht", "ausstehend", "nichtEingereiht"];
    const gueltig = namen.every((name) => Number.isInteger(plan[name]) && plan[name] >= 0);
    if (!gueltig) fehler.push("planung-zaehler-unvollstaendig");
    else {
      if (plan.versucht !== plan.geplant) fehler.push("planung-nicht-vollstaendig-versucht");
      if (plan.neu + plan.vorhanden !== plan.versucht) fehler.push("planung-bilanz-widerspruch");
      if (plan.ausstehend !== 0) fehler.push("planung-ausstehend");
      if (plan.nichtEingereiht !== 0) fehler.push("planung-nicht-eingereiht");
    }
    if (plan.profile !== zielMandate) fehler.push("planung-mandatsmenge-widerspruechlich");
    if (plan.zeitbudgetErschoepft !== false) fehler.push("planung-zeitbudget");
    if (!plan.tagesplan || typeof plan.tagesplan !== "object") fehler.push("planung-tagesplan-fehlt");
  }
  if (!wieder || wieder.verfuegbar !== true || wieder.uebersprungen !== false
      || wieder.trockenlauf !== false
      || !Number.isInteger(wieder.gefunden) || wieder.gefunden < 0
      || !Number.isInteger(wieder.wiedervorgelegt) || wieder.wiedervorgelegt < 0) {
    fehler.push("wiedervorlage-nicht-verfuegbar");
  }
  if (!outboxAbgleich || outboxAbgleich.verfuegbar !== true
      || outboxAbgleich.uebersprungen !== false
      || ["fehlend", "wiedereroeffnet", "verzichtet"]
        .some((name) => !Number.isInteger(outboxAbgleich[name]) || outboxAbgleich[name] < 0)) {
    fehler.push("outbox-abgleich-nicht-verfuegbar");
  }
  if (!weckVersand || weckVersand.uebersprungen !== false
      || weckVersand.modus !== "shadow"
      || weckVersand.transport !== "schatten"
      || weckVersand.transportVerfuegbar !== true
      || ["vergeben", "versendet", "fehlgeschlagen"]
        .some((name) => !Number.isInteger(weckVersand[name]) || weckVersand[name] < 0)
      || weckVersand.fehlgeschlagen !== 0
      || weckVersand.versendet !== weckVersand.vergeben) {
    fehler.push("outbox-versand-nicht-erfolgreich");
  }
  const workerZaehler = ["reserviert", "erledigt", "wiederholt", "zurueckgestellt",
    "endgueltigFehlgeschlagen", "leaseVerloren"];
  if (!durchlauf || durchlauf.gestartet !== true || durchlauf.fehler
      || durchlauf.worker !== 4 || !durchlauf.grenzen
      || durchlauf.grenzen.parallel !== 4 || durchlauf.grenzen.stapel !== 25
      || durchlauf.grenzen.leaseMs !== 300000 || durchlauf.grenzen.leerlaufWarteMs !== 0
      || workerZaehler.some((name) => !Number.isInteger(durchlauf[name]) || durchlauf[name] < 0)
      || !Array.isArray(durchlauf.bilanzen) || durchlauf.bilanzen.length !== 4
      || durchlauf.bilanzen.some((wert) => !wert || wert.verfuegbar !== true || wert.fehler
        || wert.budgetSchicht !== "mit-tagesplan"
        || workerZaehler.some((name) => !Number.isInteger(wert[name]) || wert[name] < 0))) {
    fehler.push("worker-nicht-vollstaendig-verfuegbar");
  }
  if (durchlauf && Array.isArray(durchlauf.bilanzen)) {
    for (const name of workerZaehler) {
      const summe = durchlauf.bilanzen.reduce((wert, bilanz) => wert + Number(bilanz && bilanz[name]), 0);
      if (Number.isInteger(durchlauf[name]) && summe !== durchlauf[name]) {
        fehler.push(`worker-summenwiderspruch:${name}`);
      }
    }
  }
  if (!startQuittung || startQuittung.ok !== true || startQuittung.uebersprungen !== false
      || !startQuittung.eintrag || startQuittung.eintrag.runId !== laufkennung
      || startQuittung.eintrag.status !== "running") fehler.push("startquittung-fehlt");
  if (!abschlussQuittung || abschlussQuittung.ok !== true || abschlussQuittung.uebersprungen !== false
      || !abschlussQuittung.eintrag || abschlussQuittung.eintrag.runId !== laufkennung
      || abschlussQuittung.eintrag.status !== quittungsStatus
      || !new Set(["success", "partial"]).has(quittungsStatus)) fehler.push("endquittung-fehlt");
  if (!kiZaehler || ["understanding", "lage", "buero", "sonstige"]
    .some((name) => !Number.isInteger(kiZaehler[name]) || kiZaehler[name] < 0)) {
    fehler.push("ki-klassenzaehler-unvollstaendig");
  }
  return { ok: fehler.length === 0, fehler };
}

async function main() {
  pruefeStartSicherheit();
  initialisiereUmgebung();
  ladeProduktionsmodule();
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
  const laufkennung = IST_FACHWEG
    ? `z3b-${FACHWEG_LAUF}-stufe${mandate}-slot${slot}-${start}`
    : `z3-stufe${mandate}-slot${slot}-${start}`;
  const verbleibend = () => Math.max(0, budgetMs - (Date.now() - start));

  const profile = erzeugeMandate(mandate).map((p) => (
    p.id === fehlerMandat
      // DAS FEHLERMANDAT ist ECHT krank: sein PERSOENLICHER Abrufweg zeigt auf eine Adresse,
      // die der lokale Ursprung nie beantwortet. Es scheitert damit im ECHTEN Abrufpfad
      // (Zeitueberschreitung), nicht durch einen ausgetauschten Handler.
      ? { ...p, __z3fehler: true }
      : p
  ));
  if (IST_FACHWEG) {
    const modus = String(process.env.HELMUT_Z3_FEHLERMANDAT || "").trim().toLowerCase();
    const erwartet = modus === "an" ? String(profile[0] && profile[0].id || "") : "";
    if (!new Set(["an", "aus"]).has(modus) || fehlerMandat !== erwartet) {
      throw Object.assign(new Error("abbruch-fehlermandat-nicht-an-laufmodus-gebunden"), { exitCode: 3 });
    }
  }

  // 1 · Laufquittung
  const startQuittung = await storage.schreibeWarteschlangenLaufquittung({
    process: `warteschlange-z3-${mandate}`.slice(0, 40), runId: laufkennung, mode: "warteschlange",
    location: "z3-lasttest", status: "running",
    startedAt: new Date(start).toISOString(), finishedAt: null
  }).catch((e) => ({ ok: false, grund: String((e && e.message) || "fehler").slice(0, 120) }));

  // 2 · Planen — Produktionsfunktion, nur die Quellenadresse zeigt lokal.
  const planStart = Date.now();
  const planungsBudgetMs = Math.min(60000, Math.floor(budgetMs * 0.25));
  const plan = await SP.planeArbeit({
      jetztMs: planungsZeitMs,
      ...(IST_FACHWEG ? { planungsDeadlineMs: Date.now() + planungsBudgetMs } : {}),
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
  }).catch((e) => ({
    ok: false,
    grund: "planung-fehler",
    fehler: String((e && e.message) || "fehler").slice(0, 200),
    zaehlerVollstaendig: false
  }));
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
  if (IST_FACHWEG) await warteAufKiProtokolle();

  // 6 · Laufquittung abschliessen
  const planFehlgeschlagen = !(plan && plan.ok === true);
  const workerNichtVerfuegbar = !(durchlauf && durchlauf.gestartet === true) || Boolean(durchlauf && durchlauf.fehler);
  const quittungsStatus = planFehlgeschlagen || workerNichtVerfuegbar
    ? "failed"
    : ((Number(durchlauf.endgueltigFehlgeschlagen) || 0) > 0
      || ((Number(durchlauf.reserviert) || 0) > 0 && (Number(durchlauf.erledigt) || 0) === 0)
      ? "partial" : "success");
  const quittungsFehlerklasse = planFehlgeschlagen
    ? (plan && plan.grund === "planung-zeitbudget" ? "planung-zeitbudget" : "planung-fehlgeschlagen")
    : (workerNichtVerfuegbar
      ? "warteschlange-nicht-verfuegbar"
      : ((Number(durchlauf.reserviert) || 0) > 0 && (Number(durchlauf.erledigt) || 0) === 0
        ? "lease-ohne-fortschritt"
        : ((Number(durchlauf.endgueltigFehlgeschlagen) || 0) > 0
          ? "auftraege-endgueltig-fehlgeschlagen" : null)));
  const spiegel = (durchlauf && durchlauf.blobSpiegel) || {};
  const abschlussQuittung = await storage.schreibeWarteschlangenLaufquittung({
    process: `warteschlange-z3-${mandate}`.slice(0, 40), runId: laufkennung, mode: "warteschlange",
    location: "z3-lasttest",
    status: quittungsStatus,
    startedAt: new Date(start).toISOString(), finishedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    zielmenge: Number(durchlauf && durchlauf.reserviert) || 0,
    processed: Number(durchlauf && durchlauf.erledigt) || 0,
    deferred: Number(durchlauf && durchlauf.zurueckgestellt) || 0,
    fehlgeschlagen: Number(durchlauf && durchlauf.endgueltigFehlgeschlagen) || 0,
    wiederholt: Number(durchlauf && durchlauf.wiederholt) || 0,
    leaseVerloren: Number(durchlauf && durchlauf.leaseVerloren) || 0,
    ...(Number.isFinite(plan && plan.geplant) ? { geplant: plan.geplant } : {}),
    ...(Number.isFinite(plan && plan.neu) ? { neuGeplant: plan.neu } : {}),
    spiegelGesammelt: spiegel.gesammelt ?? 0,
    spiegelGeschrieben: spiegel.geschrieben === true ? (spiegel.neuImBlob ?? 0) : null,
    fehlerklasse: quittungsFehlerklasse,
    reason: planFehlgeschlagen
      ? String((plan && plan.grund) || "planung-fehlgeschlagen").slice(0, 120)
      : (spiegel.geschrieben === false ? "blob-spiegel-fehlgeschlagen" : null)
  }).catch((e) => ({ ok: false, grund: String((e && e.message) || "fehler").slice(0, 120) }));

  const integritaet = IST_FACHWEG
    ? pruefeFachwegIntegritaet({
      plan, wieder, outboxAbgleich, weckVersand, durchlauf, startQuittung, abschlussQuittung,
      kiZaehler: kiKlassen, laufkennung, fachwegLauf: FACHWEG_LAUF,
      zielMandate: mandate, quittungsStatus
    })
    : { ok: true, fehler: [] };
  const ausgabe = {
    slot, mandate, laufkennung, planungsZeit: new Date(planungsZeitMs).toISOString(),
    fachwegLauf: IST_FACHWEG ? FACHWEG_LAUF : null,
    fachwegManifestSha256: IST_FACHWEG ? FACHWEG_MANIFEST_SHA : null,
    dauerMs: Date.now() - start, planDauerMs, planungsBudgetMs, arbeitDauerMs,
    plan,
    wiedervorlage: wieder,
    outbox: { abgleich: outboxAbgleich, versand: weckVersand },
    kiKlassen: { ...kiKlassen },
    durchlauf,
    quittung: {
      start: Boolean(startQuittung && startQuittung.ok === true),
      ende: Boolean(abschlussQuittung && abschlussQuittung.ok === true),
      status: quittungsStatus,
      fehlerklasse: quittungsFehlerklasse,
      startBeleg: startQuittung,
      endeBeleg: abschlussQuittung,
      ...(startQuittung && startQuittung.ok === true ? {} : { startGrund: (startQuittung && startQuittung.grund) || "unbekannt" }),
      ...(abschlussQuittung && abschlussQuittung.ok === true ? {} : { endeGrund: (abschlussQuittung && abschlussQuittung.grund) || "unbekannt" })
    },
    integritaet
  };
  process.stdout.write(JSON.stringify(ausgabe) + "\n");
  process.exit(IST_FACHWEG && !integritaet.ok ? 2 : 0);
}

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(JSON.stringify({ fehler: String((error && error.stack) || error).slice(0, 900) }) + "\n");
    process.exit(Number(error && error.exitCode) || 1);
  });
}

module.exports = { FACHWEG_UMGEBUNG, istLokal, kiKlasse, pruefeFachwegIntegritaet };
