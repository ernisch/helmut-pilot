"use strict";

// Helmut — SLOTGENAUE SIMULATION DER MORGENLAGE (Kapazitaetssprint 2026-08-09).
// =============================================================================================
// WAS DIESE DATEI ANDERS MACHT ALS `skalierung-lauf.js`.
// Die bestehende Tagessimulation laesst alle zwei Minuten einen Workertrupp laufen — einen
// Dauerbetrieb. Production hat den nicht: Production hat CRON-SLOTS. Ein Slot ist EINE
// Vercel-Ausfuehrung mit `maxDuration 300`, in der `workerBetrieb.durchlauf` P Worker mit je
// 230 000 ms Arbeitsbudget startet; danach ist der Slot vorbei, ob fertig oder nicht. Genau
// diese Differenz war Befund R1 des Abschlussreviews von PR #236 — und sie ist der Grund,
// warum eine gruene Tagessimulation nichts ueber die Morgenlage aussagt.
//
// Hier wird deshalb GENAU der Slot nachgebildet:
//   * echte `workerBetrieb.durchlauf` mit echten Grenzen (Budget, Lease, Stapel, Parallel),
//   * echter `scalable-pipeline.arbeite`, echter `HANDLER.tenant_narrative`,
//   * echte In-Speicher-Warteschlange (`jobqueue-speicher-treiber.js`, gegen die echte
//     Datenbank auf Verhaltensgleichheit geprueft — `jobqueue-vertrag-test.js`),
//   * echte Budgetschicht-Semantik nach der R4-Korrektur (ein Buch, ein Schreiber).
//
// DIE VIRTUELLE UHR. Damit ein 230-s-Slot nicht 230 echte Sekunden dauert, laeuft die Zeit
// virtuell: `warte(ms)` parkt einen Worker, und erst wenn ALLE laufenden Worker geparkt sind,
// springt die Uhr auf den naechsten faelligen Weckzeitpunkt. Das modelliert echte
// Parallelitaet korrekt (P Worker, die gleichzeitig auf das Modell warten, warten auch
// gleichzeitig) und ist deterministisch — kein `Math.random`, keine Wanduhr.
//
// WAS MODELLIERT IST — und ausdruecklich nicht echt:
//   1. Der Modellaufruf. Er kommt aus einer MESSREIHE (unten), nicht aus einem Anbieter.
//   2. Die Zeitgrenze eines Auftrags. `mitZeitgrenze` benutzt `setTimeout` auf der WANDUHR;
//      in virtueller Zeit wuerde sie nie feuern. Deshalb schneidet der Adapter selbst bei
//      `scalable-pipeline.typZeitgrenze("tenant_narrative")` ab — demselben Wert, den der
//      echte Worker benutzt, aus demselben Modul gelesen. Dass die ECHTE Zeitgrenze wirklich
//      schneidet, prueft `morgenkapazitaet-test.js` zusaetzlich in echter Zeit.
//   3. Antwortzeiten der Datenbank (Standard 0 ms, im Szenario "verzoegerte Datenbank" gesetzt).
// Alles andere ist Produktionscode.
//
// KEIN PRODUCTION-BEWEIS. Diese Datei rechnet mit gemessenen Eingangsgroessen; sie beweist
// nicht, dass Production sich so verhaelt.

const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const pipeline = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const workerBetrieb = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));
const fair = require(path.join(ROOT, "lib/helmut/llm-budget-fair.js"));
const { erzeugeSpeicherWarteschlange } = require(path.join(__dirname, "jobqueue-speicher-treiber.js"));

// ── DIE MESSREIHE ────────────────────────────────────────────────────────────────────────────
// GEMESSEN, nicht geschaetzt: alle 134 `lageBriefing`-Aufrufe aus dem Production-Kostenlog
// (`helmut_store` id `main-auth`, Feld `llmUsage`), Zeitraum 2026-07-10 bis 2026-08-09, rein
// lesend erhoben am 2026-08-09. Je Eintrag: Dauer in ms und ob der Aufruf erfolgreich war.
// Es sind KEINE personenbezogenen Daten enthalten — nur Dauer und Ausgang.
//
// Kennzahlen dieser Reihe: n = 134 · Median 5 033 ms · p90 7 765 ms · p95 32 201 ms ·
// Maximum 471 985 ms · 8 Fehlschlaege (5,97 %).
// DER BEFUND, DER DIE ZEITGRENZE BEGRUENDET: von den acht Aufrufen ueber 20 s war KEINER
// erfolgreich; der langsamste erfolgreiche Aufruf lag bei 20 012 ms.
const MESSREIHE = Object.freeze([
  [5212, 1], [5327, 1], [5669, 1], [6464, 1], [5179, 1], [3633, 1], [6198, 1], [6416, 1],
  [20004, 0], [4822, 1], [32201, 0], [207215, 0], [7765, 1], [7204, 1], [5122, 1], [4098, 1],
  [71189, 0], [4005, 1], [4720, 1], [4308, 1], [4815, 1], [4543, 1], [6331, 1], [4720, 1],
  [5384, 1], [5028, 1], [5702, 1], [5692, 1], [4274, 1], [5082, 1], [4637, 1], [4885, 1],
  [6894, 1], [4207, 1], [5390, 1], [4361, 1], [5927, 1], [5033, 1], [5204, 1], [7131, 1],
  [63704, 0], [3935, 1], [5638, 1], [3727, 1], [3572, 1], [3141, 1], [4446, 1], [3788, 1],
  [5074, 1], [4198, 1], [4387, 1], [3720, 1], [450867, 0], [471985, 0], [20012, 1], [6754, 1],
  [3221, 1], [4304, 1], [5171, 1], [5134, 1], [3640, 1], [7590, 1], [5700, 1], [5326, 1],
  [6981, 1], [5184, 1], [6450, 1], [4258, 1], [2767, 1], [5713, 1], [9669, 1], [3868, 1],
  [7501, 1], [5672, 1], [5664, 1], [5377, 1], [12404, 1], [4678, 1], [6760, 1], [5574, 1],
  [4340, 1], [8761, 1], [6501, 1], [4536, 1], [8967, 1], [171730, 0], [4060, 1], [3204, 1],
  [4947, 1], [3285, 1], [4378, 1], [5755, 1], [4119, 1], [3350, 1], [4078, 1], [5754, 1],
  [2866, 1], [6647, 1], [6834, 1], [5138, 1], [5334, 1], [5003, 1], [5814, 1], [3128, 1],
  [5765, 1], [6144, 1], [3391, 1], [6865, 1], [3483, 1], [5071, 1], [4814, 1], [4753, 1],
  [2998, 1], [4095, 1], [3909, 1], [3717, 1], [3188, 1], [2960, 1], [3792, 1], [6008, 1],
  [4497, 1], [6427, 1], [3354, 1], [1859, 1], [5684, 1], [2876, 1], [2903, 1], [1916, 1],
  [4298, 1], [2379, 1], [3740, 1], [2551, 1], [3654, 1], [7260, 1]
]);

// GEMESSEN (Production, `process_runs`, n = 13, 2026-07-28 bis 2026-08-09): der bisherige
// Direktpfad brauchte im Mittel 42 118 ms fuer 9 Profile, davon 5 aktive — p95 53 227 ms.
// Das ist der Anhalt fuer den NICHT-Modellanteil eines Narrativs (Sperre, Lesen der Matches,
// Cacheschreiben, Telemetrie): 42 118 / 5 = 8 424 ms je Mandat gegenueber einem gemessenen
// Modellmittel von 5 107 ms je ERFOLGREICHEM Aufruf ⇒ rund 3 300 ms Nebenaufwand.
// Die Warteschlange legt noch das Reservieren, Melden und Abschliessen darauf.
const NEBENAUFWAND_MS = Object.freeze({ optimistisch: 1500, realistisch: 3300, unguenstig: 6000 });
// Warteschlangenaufwand je Auftrag (claim/vorbedingung/reservieren/melden/finish).
const WARTESCHLANGE_MS = Object.freeze({ optimistisch: 150, realistisch: 400, unguenstig: 1200 });
// Aus Production ABGELEITET (Messreihe n = 126 bepreiste Aufrufe): USD je erfolgreichem
// Narrativ. KEIN Anbieterpreis — dieselbe Grundlage wie `narrativ-stufen-test.js`.
const USD_JE_NARRATIV = 0.001307;

const SLOT_BUDGET_MS = 230000;        // server.js narrativSlotGrenzen()
const SLOT_LEASE_MS = 300000;
const MORGEN_START_MS = Date.parse("2026-08-10T05:45:00.000Z");
const SLOT_ZWEI_MS = Date.parse("2026-08-10T06:15:00.000Z");
// Das verbindliche Zeitfenster der Morgenlage: fertig bis 06:30 UTC = 08:30 Berlin (Sommer).
// ABGELEITET, nicht erfunden: der Produktvertrag ist der Slot 05:45 UTC (07:45 Berlin,
// `vercel.json`); 06:30 UTC ist der spaeteste Zeitpunkt, zu dem eine "Morgenlage" fuer ein
// Buero, das um 08:00 beginnt, noch eine Morgenlage ist. Wer ein anderes Fenster will, muss
// es hier aendern — dann aendern sich alle Zahlen mit.
const MORGENFENSTER_ENDE_MS = Date.parse("2026-08-10T06:30:00.000Z");

// ── Virtuelle Uhr mit echter Parallelitaet ──────────────────────────────────────────────────
function virtuelleUhr(startMs) {
  let jetzt = startMs;
  let aktiv = 0;                        // laufende Worker
  let maxGleichzeitigAktiv = 0;
  const wartende = [];
  let geplant = false;

  function planePruefung() {
    if (geplant) return;
    geplant = true;
    setImmediate(() => {
      geplant = false;
      // `setImmediate` laeuft NACH der vollstaendig geleerten Mikrotask-Schlange: zu diesem
      // Zeitpunkt hat jeder lauffaehige Worker seine naechste Wartezeit bereits angemeldet.
      // Erst dann springt die Zeit — und nur auf den fruehesten faelligen Weckpunkt, damit
      // gleichzeitig Wartende auch gleichzeitig aufwachen.
      if (!wartende.length) return;
      wartende.sort((a, b) => a.zeit - b.zeit);
      jetzt = Math.max(jetzt, wartende[0].zeit);
      while (wartende.length && wartende[0].zeit <= jetzt) wartende.shift().aufloesen();
      if (wartende.length) planePruefung();
    });
  }

  // ARBEITSZEITKONTO. Jede gewartete Millisekunde ist belegte Workerzeit — genau die Groesse,
  // gegen die die Kapazitaetsreserve gerechnet werden muss (Befund B16: Reserve gegen
  // ARBEITSLAST, nicht gegen die Mandatszahl).
  let belegteWorkerMs = 0;
  return {
    jetzt: () => jetzt,
    setze: (ms) => { jetzt = Math.max(jetzt, ms); },
    belegteWorkerMs: () => belegteWorkerMs,
    maxParallel: () => maxGleichzeitigAktiv,
    // Wie viele Worker haben GLEICHZEITIG an einem Modellaufruf gehangen? Der Adapter meldet
    // Beginn und Ende; das ist die einzige ehrliche Messung realer Parallelitaet.
    betrete: () => { aktiv += 1; maxGleichzeitigAktiv = Math.max(maxGleichzeitigAktiv, aktiv); },
    verlasse: () => { aktiv = Math.max(0, aktiv - 1); },
    warte(ms) {
      if (!(ms > 0)) return Promise.resolve();
      belegteWorkerMs += ms;
      return new Promise((aufloesen) => {
        wartende.push({ zeit: jetzt + ms, aufloesen });
        planePruefung();
      });
    }
  };
}

function streu(schluessel, versatz = 0) {
  return crypto.createHash("sha256").update(String(schluessel)).digest().readUInt32BE(versatz);
}

// ── Die Budgetschicht in-Speicher, nach der R4-Korrektur ────────────────────────────────────
// EIN BUCH, EIN SCHREIBER: `getaetigt` zaehlt nur echte Modellaufrufe (der Choke-Point),
// die Reservierungen tragen die Absichten. Belegung = getaetigt + laufend. Die SQL-Fassung
// derselben Regeln ist an echter PostgreSQL bewiesen (`budgetvertrag-test.js`).
function speicherBudget() {
  const reservierungen = new Map();     // resultKey -> {tag, scope, status}
  const getaetigt = new Map();          // tag -> Zahl
  const verletzungen = [];
  const zaehle = (tag, status) => [...reservierungen.values()]
    .filter((r) => r.tag === tag && status.includes(r.status)).length;
  return {
    getaetigt,
    verletzungen,
    modellaufruf(tag, deckel) {
      const jetzt = getaetigt.get(tag) || 0;
      if (deckel != null && jetzt >= deckel) return false;
      getaetigt.set(tag, jetzt + 1);
      if (deckel != null && jetzt + 1 > deckel) verletzungen.push({ tag, stand: jetzt + 1, deckel });
      return true;
    },
    async reserviere({ resultKey, day, scope, workClass = "notwendig", globalMax, scopeMax }) {
      const vorhanden = reservierungen.get(resultKey);
      const belegtGlobal = () => (getaetigt.get(day) || 0) + zaehle(day, ["reserviert"]);
      const belegtScope = () => [...reservierungen.values()].filter((r) =>
        r.tag === day && r.scope === scope && ["reserviert", "verbraucht", "fehlgeschlagen"].includes(r.status)).length;
      if (vorhanden && vorhanden.status !== "zurueckgegeben") {
        return { verfuegbar: true, erlaubt: true, wiederverwendet: true, grund: "bereits-reserviert",
          globalVerbraucht: belegtGlobal(), scopeVerbraucht: belegtScope() };
      }
      if (vorhanden) reservierungen.delete(resultKey);
      if (scopeMax != null && belegtScope() >= Math.max(0, scopeMax)) {
        return { verfuegbar: true, erlaubt: false, wiederverwendet: false,
          grund: scope === "global" ? "verstehensanteil-erschoepft" : "mandantenanteil-erschoepft",
          globalVerbraucht: belegtGlobal(), scopeVerbraucht: belegtScope() };
      }
      if (globalMax != null && belegtGlobal() >= Math.max(0, globalMax)) {
        return { verfuegbar: true, erlaubt: false, wiederverwendet: false,
          grund: "globales-notfalllimit-erreicht",
          globalVerbraucht: belegtGlobal(), scopeVerbraucht: belegtScope() };
      }
      reservierungen.set(resultKey, { tag: day, scope, status: "reserviert", workClass });
      return { verfuegbar: true, erlaubt: true, wiederverwendet: false, grund: null,
        globalVerbraucht: belegtGlobal(), scopeVerbraucht: belegtScope() };
    },
    async melde({ resultKey, ok = true }) {
      const r = reservierungen.get(resultKey);
      if (!r || r.status !== "reserviert") return { verfuegbar: true, uebernommen: false };
      r.status = ok ? "verbraucht" : "fehlgeschlagen";
      return { verfuegbar: true, uebernommen: true, status: r.status };
    },
    async gib_frei({ resultKey }) {
      const r = reservierungen.get(resultKey);
      if (!r || r.status !== "reserviert") return { verfuegbar: true, zurueckgegeben: false };
      r.status = "zurueckgegeben";
      return { verfuegbar: true, zurueckgegeben: true };
    }
  };
}

// ── Der Modellaufruf als Adapter ────────────────────────────────────────────────────────────
function narrativAdapter({ uhr, budget, deckel, szenario, stoerung, uhrTag, mess, slotEnde }) {
  const typGrenze = pipeline.typZeitgrenze("tenant_narrative");
  // DIESELBE FORMEL WIE IM ECHTEN WORKER (`scalable-pipeline.arbeite`):
  //   auftragsBudget = min(typZeitgrenze, Restzeit des Slots - Abschlussreserve, Lease/2).
  // `mitZeitgrenze` setzt sie mit `setTimeout` auf der WANDUHR durch und kann deshalb in
  // virtueller Zeit nicht feuern — der Adapter rechnet sie hier selbst nach. Ohne das wuerde
  // ein einzelner langer Auftrag den Slot ueberlaufen, und die Simulation waere zu guenstig.
  const auftragsGrenze = () => Math.max(1000, Math.min(
    typGrenze, slotEnde() - 5000 - uhr.jetzt(), Math.floor(SLOT_LEASE_MS / 2)));
  const nebenAufwand = NEBENAUFWAND_MS[szenario] ?? NEBENAUFWAND_MS.realistisch;
  const cache = new Map();
  const streckung = szenario === "unguenstig" ? 1.6 : (szenario === "optimistisch" ? 0.8 : 1);
  return async (profil, opts = {}) => {
    const mandat = String((opts && opts.politicianId) || (profil && profil.id) || "");
    const tagSchluessel = uhrTag();
    const cacheKey = `bf-${mandat}-lage-${tagSchluessel}`;
    mess.versuche += 1;
    // 1) Nebenaufwand VOR dem Modell (Sperre, Matches lesen) — er faellt auch bei Cache an.
    await uhr.warte(Math.round(nebenAufwand * 0.4));
    if (cache.has(cacheKey)) { mess.ausCache += 1; return { ...cache.get(cacheKey), fromCache: true }; }

    // 2) Stoerbild: Quellenfehler und kuenstliche Wiederholungen — deterministisch gestreut.
    const wurf = streu(`${mandat}|${mess.versuche}`, 0) % 1000 / 1000;
    if (stoerung.quellenFehler && wurf < stoerung.quellenFehler) {
      await uhr.warte(200); mess.quellenFehler += 1;
      return { available: false, reason: "store-error" };
    }
    if (stoerung.wiederholungen && wurf >= 0.9 && wurf < 0.9 + stoerung.wiederholungen) {
      await uhr.warte(200); mess.kuenstlicheWiederholungen += 1;
      return { available: false, reason: "generating" };
    }

    // 3) Der Modellaufruf: Dauer und Ausgang aus der GEMESSENEN Reihe.
    const probe = MESSREIHE[streu(`${mandat}|${mess.versuche}|probe`, 4) % MESSREIHE.length];
    const grenze = auftragsGrenze();
    const rohDauer = Math.round(probe[0] * streckung * (stoerung.langsam ? 3 : 1));
    const erfolgreich = probe[1] === 1 && rohDauer <= grenze;
    const gewartet = Math.min(rohDauer, grenze);
    // Der Choke-Point: JEDER Modellaufruf zaehlt genau einmal gegen den Tagesdeckel.
    if (!budget.modellaufruf(tagSchluessel, deckel)) {
      await uhr.warte(50);
      return { available: false, reason: "budget" };
    }
    uhr.betrete();
    await uhr.warte(gewartet);
    uhr.verlasse();
    mess.modellzeitMs += gewartet;
    mess.modellaufrufe += 1;
    if (!erfolgreich) {
      mess.modellFehler += 1;
      return { available: false, reason: rohDauer > grenze ? "ai-unavailable" : "ai-unavailable" };
    }
    // 4) Nebenaufwand NACH dem Modell (Cache schreiben, Telemetrie).
    await uhr.warte(Math.round(nebenAufwand * 0.6));
    const ergebnis = { available: true, fromCache: false, paragraphs: ["a", "b"], vorgaenge: [1, 2], model: "gpt-5-mini" };
    cache.set(cacheKey, ergebnis);
    mess.erzeugt += 1;
    mess.kostenUsd += USD_JE_NARRATIV;
    mess.veroeffentlichtMs.push(uhr.jetzt());
    mess.jeMandat.set(mandat, (mess.jeMandat.get(mandat) || 0) + 1);
    return ergebnis;
  };
}

// ── Ein Morgen ──────────────────────────────────────────────────────────────────────────────
async function simuliereMorgen({
  mandate = 5,
  parallel = 8,
  slots = 2,
  slotZeitenMs = null,          // absolute Startzeiten; sonst Standardplan
  slotBudgetMs = SLOT_BUDGET_MS,
  szenario = "realistisch",
  deckel = null,
  stapel = 10,
  stoerung = {},
  ausgefalleneWorker = 0,
  slotAusfall = null,            // Index eines vollstaendig ausgefallenen Slots
  vorlaufRueckstand = 0,
  neueMandateVorSlot = 0,        // kommen VOR dem zweiten Slot dazu
  deaktiviertVorSlot = 0,        // werden VOR dem zweiten Slot abgeschaltet
  grossesMandat = false,
  dbVerzoegerungMs = 0
} = {}) {
  const uhr = virtuelleUhr(MORGEN_START_MS);
  const q = erzeugeSpeicherWarteschlange({ now: uhr.jetzt });
  const budget = speicherBudget();
  const mess = {
    versuche: 0, erzeugt: 0, ausCache: 0, modellaufrufe: 0, modellFehler: 0,
    quellenFehler: 0, kuenstlicheWiederholungen: 0, modellzeitMs: 0, kostenUsd: 0,
    veroeffentlichtMs: [], jeMandat: new Map()
  };

  const ids = Array.from({ length: mandate }, (_, i) => `m-${String(i + 1).padStart(4, "0")}`);
  const deaktivierte = new Set();
  const profile = new Map(ids.map((id) => [id, {
    id, name: `Mandat ${id}`, profileActive: true,
    focusTopics: grossesMandat && id === ids[0] ? Array.from({ length: 12 }, (_, i) => `T${i}`) : ["T1", "T2"]
  }]));

  const uhrTag = () => new Date(uhr.jetzt()).toISOString().slice(0, 10);
  // DER TAGESPLAN WIRD JE SLOT NEU GERECHNET — genau wie in Production: `narrativSlotLauf`
  // ruft `tagesplanFuerLauf` zu Beginn JEDER Ausfuehrung und liest dabei die dann aktiven
  // Profile. Der erste Entwurf dieser Datei rechnete ihn EINMAL; ein Mandat, das zwischen
  // den Slots dazukam, bekam damit `mandantenDeckel = 0` und wurde bis zum Tagesende
  // zurueckgestellt. Das war ein Fehler der Attrappe, nicht des Produktionscodes — aber er
  // zeigt die echte Regel: ein Mandat, das der Tagesplan nicht kennt, bekommt KEIN Budget.
  // Fail closed, sichtbar zurueckgestellt, nie stillschweigend uebergangen.
  const rechnePlan = () => {
    const aktiv = ids.filter((i) => !deaktivierte.has(i));
    const gesamtDeckel = deckel == null ? aktiv.length * 4 : deckel;
    const plan = fair.tagesplan({
      mandate: aktiv, deckel: gesamtDeckel, tag: uhrTag(),
      bedarf: Object.fromEntries(aktiv.map((m) => [m, { notwendig: 3, optional: 0 }])), env: {}
    });
    plan.global = fair.globalerTopf({ deckel: gesamtDeckel, mandatsBedarf: aktiv.length, env: {} });
    return plan;
  };
  let tagesplan = rechnePlan();

  // Auftraege einreihen — mit derselben Idempotenz und Faelligkeit wie der echte Planer
  // (`source-demand`: Morgenkorridor ab 24 %, Streuung <= 1 s, Rang bestimmt die Reihenfolge).
  const fenster = new Date(MORGEN_START_MS).toISOString().slice(0, 13) + "Z";
  const reihenfolge = fair.rotationsReihenfolge(ids, uhrTag(), Math.max(1, ids.length));
  const einreihen = async (liste, versatzMs = 0) => {
    for (const id of liste) {
      const rang = Math.max(0, reihenfolge.indexOf(id));
      await q.enqueue({
        jobType: "tenant_narrative",
        idempotencyKey: `tenant_narrative|${id}|${fenster}`,
        freshnessWindow: fenster,
        payload: { mandatsId: id },
        dueAt: new Date(MORGEN_START_MS + versatzMs + Math.min(1000, rang)).toISOString(),
        priority: 240,
        tenantId: id
      });
    }
  };
  // RUECKSTAND AUS DEM VORTAG: aeltere, laengst faellige Auftraege eines anderen Fensters.
  const gestern = new Date(MORGEN_START_MS - 24 * 3600 * 1000).toISOString().slice(0, 13) + "Z";
  for (let i = 0; i < vorlaufRueckstand; i += 1) {
    await q.enqueue({
      jobType: "tenant_narrative",
      idempotencyKey: `tenant_narrative|${ids[i % ids.length]}|${gestern}`,
      freshnessWindow: gestern,
      payload: { mandatsId: ids[i % ids.length] },
      dueAt: new Date(MORGEN_START_MS - 12 * 3600 * 1000).toISOString(),
      priority: 240,
      tenantId: ids[i % ids.length]
    });
  }
  await einreihen(ids);

  const ersteFaelligkeit = new Map();
  const gehalten = new Map();
  let doppeltGleichzeitig = 0;
  let wiederaufnahmen = 0;
  const fertigMs = new Map();          // idempotencyKey -> Abschlusszeit
  let verloren = 0;
  let wiederholungen = 0;
  let zurueckgestellt = 0;
  let stapelrest = 0;
  let endgueltigFehler = 0;

  const langsameDb = async () => { if (dbVerzoegerungMs > 0) await uhr.warte(dbVerzoegerungMs); };
  const warteschlangeMs = WARTESCHLANGE_MS[szenario] ?? WARTESCHLANGE_MS.realistisch;

  const budgetFuerPlan = () => pipeline.budgetAdapter({
    env: { HELMUT_LLM_FAIRNESS: "on", HELMUT_MAX_LLM_CALLS_PER_DAY: String(deckel == null ? 1000000 : deckel) },
    deps: { budgetSpeicher: budget, fair, now: uhr.jetzt },
    tagesplan
  });
  let budgetAdapter = budgetFuerPlan();

  const deps = {
    now: uhr.jetzt,
    // Das Leerlaufwarten des Workers muss die VIRTUELLE Uhr bewegen, sonst waere es im Test
    // ein echtes `setTimeout` und die Simulation liefe in Wanduhrzeit.
    schlafe: (ms) => uhr.warte(ms),
    env: { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "on", HELMUT_SOURCE_MODE: "off" },
    claim: async (o) => {
      await langsameDb();
      await uhr.warte(Math.round(warteschlangeMs * 0.3));
      const r = await q.claim(o);
      for (const a of r.auftraege || []) {
        if (gehalten.has(a.id)) doppeltGleichzeitig += 1;
        gehalten.set(a.id, o.owner);
        if (!ersteFaelligkeit.has(a.id)) ersteFaelligkeit.set(a.id, Date.parse(a.due_at));
      }
      return r;
    },
    finish: async (o) => {
      await langsameDb();
      await uhr.warte(Math.round(warteschlangeMs * 0.3));
      gehalten.delete(o.id);
      const zeile = q.hole(o.id);
      if (o.ok && zeile) fertigMs.set(zeile.idempotency_key, uhr.jetzt());
      else if (!o.ok) {
        if (zeile && zeile.attempts >= zeile.max_attempts) endgueltigFehler += 1;
        else wiederholungen += 1;   // nur ECHTE Fehlabschluesse, nicht der Stapelrest
      }
      return q.finish(o);
    },
    // WICHTIG: `zurueckstellen` bedient ZWEI Faelle — die fachliche Zurueckstellung (Budget,
    // Vorbedingung, Sperre) UND die ehrliche Rueckgabe des nicht bearbeiteten Stapelrests am
    // Slotende. Nur der erste ist eine Wiederholung; den zweiten als Wiederholung zu zaehlen
    // haette die Wiederholungsquote im ersten Entwurf um Faktor 3 aufgeblaeht.
    zurueckstellen: async (o) => {
      gehalten.delete(o.id);
      if (/zeitbudget-des-laufs/.test(String(o.grund || ""))) stapelrest += 1;
      else zurueckgestellt += 1;
      return q.zurueckstellen(o);
    },
    extendLease: q.extendLease,
    enqueue: q.enqueue,
    offeneVorbedingungen: async () => {
      await uhr.warte(Math.round(warteschlangeMs * 0.2));
      return { verfuegbar: true, offen: 0, wartend: 0, laufend: 0 };
    },
    get budget() { return budgetAdapter; },
    getActiveProfile: async (id) => {
      await uhr.warte(Math.round(warteschlangeMs * 0.2));
      const p = profile.get(id);
      return p ? { ...p, profileActive: !deaktivierte.has(id) } : null;
    },
    istDeaktiviert: (p) => Boolean(p && p.profileActive === false),
    lageNarrativ: narrativAdapter({ uhr, budget, deckel, szenario, stoerung, uhrTag, mess, slotEnde: () => slotEndeMs })
  };

  // Ein Slot = EINE Vercel-Ausfuehrung. Der Worker laeuft nur innerhalb seines Budgets.
  const slotBilanzen = [];
  const slotZeiten = Array.isArray(slotZeitenMs) && slotZeitenMs.length
    ? slotZeitenMs
    : [MORGEN_START_MS, SLOT_ZWEI_MS, MORGEN_START_MS + 35 * 60000];
  let slotEndeMs = MORGEN_START_MS + slotBudgetMs;
  for (let s = 0; s < slots; s += 1) {
    if (s === 1 && neueMandateVorSlot > 0) {
      const neue = Array.from({ length: neueMandateVorSlot }, (_, i) => `neu-${i + 1}`);
      for (const id of neue) profile.set(id, { id, name: `Neu ${id}`, profileActive: true, focusTopics: ["T1"] });
      ids.push(...neue);
      await einreihen(neue);
    }
    if (s === 1 && deaktiviertVorSlot > 0) {
      for (const id of ids.slice(0, deaktiviertVorSlot)) deaktivierte.add(id);
    }
    // ENDE EINER VERCEL-AUSFUEHRUNG: der Prozess ist weg. Was der Slot noch hielt, haelt
    // niemand mehr — es kehrt ueber den Lease-Ablauf zurueck. Genau das ist der Unterschied
    // zwischen WIEDERAUFNAHME (richtig) und DOPPELVERARBEITUNG (verboten); ohne dieses
    // Leeren wuerde die Suite jede Wiederaufnahme faelschlich als Doppelverarbeitung zaehlen.
    wiederaufnahmen += gehalten.size;
    gehalten.clear();
    uhr.setze(slotZeiten[Math.min(s, slotZeiten.length - 1)]);
    // Wie `narrativSlotLauf`: der Tagesplan wird zu Beginn JEDER Ausfuehrung neu gerechnet.
    tagesplan = rechnePlan();
    budgetAdapter = budgetFuerPlan();
    slotEndeMs = uhr.jetzt() + slotBudgetMs;
    if (slotAusfall === s) { slotBilanzen.push({ ausgefallen: true, erledigt: 0 }); continue; }
    const p = Math.max(1, parallel - (s === 0 ? ausgefalleneWorker : 0));
    const t0 = uhr.jetzt();
    // ECHTER Durchlauf: Grenzen wie in `server.js narrativSlotGrenzen()`.
    const bilanz = await workerBetrieb.durchlauf({
      env: deps.env,
      deps,
      kennung: `slot${s}`,
      // Dieselben Grenzen wie `server.js narrativSlotGrenzen()` — inklusive Leerlaufwarten.
      grenzen: { budgetMs: slotBudgetMs, leaseMs: SLOT_LEASE_MS, stapel, parallel: p, leerlaufWarteMs: 20000 },
      tagesplan,
      typen: ["tenant_narrative"]
    });
    slotBilanzen.push({ ...bilanz, slot: s, startMs: t0, endeMs: uhr.jetzt(), dauerMs: uhr.jetzt() - t0, worker: p });
  }

  // ── Auswertung ────────────────────────────────────────────────────────────────────────────
  const alleZeilen = q.alle();
  const narrativZeilen = alleZeilen.filter((z) => z.job_type === "tenant_narrative");
  const erwartet = narrativZeilen.length;
  const erledigt = narrativZeilen.filter((z) => z.status === "erledigt").length;
  const offen = narrativZeilen.filter((z) => ["wartend", "laufend"].includes(z.status)).length;
  const gescheitert = narrativZeilen.filter((z) => z.status === "fehlgeschlagen").length;

  const fertig = [...fertigMs.values()].sort((a, b) => a - b);
  const perzentil = (liste, p) => (liste.length ? liste[Math.min(liste.length - 1, Math.floor(liste.length * p))] : null);
  const rechtzeitig = fertig.filter((t) => t <= MORGENFENSTER_ENDE_MS).length;
  const verspaetet = fertig.length - rechtzeitig;

  // ANGEBOTENE Workerzeit: was die Slots ueberhaupt hergeben (ausgefallene Slots zaehlen 0).
  const workerZeitMs = slotBilanzen.reduce((s, b) => s + (b.ausgefallen ? 0 : (b.worker || 0) * slotBudgetMs), 0);
  // BENOETIGTE Workerzeit: die Summe ALLER tatsaechlich gewarteten Millisekunden ueber alle
  // Worker — Modellzeit, Nebenaufwand und Warteschlangenaufwand zusammen.
  const belegtMs = uhr.belegteWorkerMs();
  const genutzteZeitMs = mess.modellzeitMs;
  const gesamtLaufzeitMs = fertig.length ? fertig[fertig.length - 1] - MORGEN_START_MS : 0;
  // KAPAZITAETSRESERVE gegen ARBEITSLAST (nicht gegen die Mandatszahl — das war Befund B16):
  // wie viel des angebotenen Workerbudgets blieb ungenutzt?
  const reserveAnteil = workerZeitMs > 0 ? Math.max(0, 1 - belegtMs / workerZeitMs) : 0;

  const jeMandatWerte = [...mess.jeMandat.values()];
  const fairness = jeMandatWerte.length
    ? { min: Math.min(...jeMandatWerte), max: Math.max(...jeMandatWerte), mandateMitNarrativ: mess.jeMandat.size }
    : { min: 0, max: 0, mandateMitNarrativ: 0 };

  return {
    eingang: { mandate: ids.length, parallel, slots, szenario, deckel, stapel, stoerung },
    auftraege: { erwartet, erledigt, offen, gescheitert, doppeltGleichzeitig, wiederaufnahmen, verloren },
    zeit: {
      gesamtLaufzeitMs,
      workerZeitMs,
      belegtMs,
      modellzeitMs: genutzteZeitMs,
      medianFertigMs: perzentil(fertig, 0.5) == null ? null : perzentil(fertig, 0.5) - MORGEN_START_MS,
      p95FertigMs: perzentil(fertig, 0.95) == null ? null : perzentil(fertig, 0.95) - MORGEN_START_MS,
      maxFertigMs: fertig.length ? fertig[fertig.length - 1] - MORGEN_START_MS : null,
      durchsatzProMinute: gesamtLaufzeitMs > 0 ? Math.round((fertig.length / (gesamtLaufzeitMs / 60000)) * 10) / 10 : 0,
      maxParallel: uhr.maxParallel()
    },
    fenster: { endeMs: MORGENFENSTER_ENDE_MS, rechtzeitig, verspaetet },
    rueckstand: { offenNachMorgen: offen, gescheitert, abgebautBisMs: offen === 0 ? gesamtLaufzeitMs : null },
    modell: {
      versuche: mess.versuche, aufrufe: mess.modellaufrufe, erzeugt: mess.erzeugt,
      ausCache: mess.ausCache, fehler: mess.modellFehler,
      quellenFehler: mess.quellenFehler, wiederholungen, zurueckgestellt, stapelrest, endgueltigFehler
    },
    kosten: {
      gesamtUsd: Math.round(mess.kostenUsd * 1e6) / 1e6,
      jeMandatUsd: ids.length ? Math.round((mess.kostenUsd / ids.length) * 1e6) / 1e6 : 0,
      grundlage: "aus Production abgeleitete Messreihe (n=126), KEIN Anbieterpreis"
    },
    budget: { getaetigt: budget.getaetigt.get(uhrTag()) || 0, deckel, verletzungen: budget.verletzungen.length },
    reserve: { anteil: Math.round(reserveAnteil * 1000) / 1000, prozent: Math.round(reserveAnteil * 1000) / 10 },
    fairness,
    slots: slotBilanzen.map((b) => ({
      slot: b.slot, ausgefallen: Boolean(b.ausgefallen), worker: b.worker || 0,
      reserviert: b.reserviert || 0, erledigt: b.erledigt || 0,
      zurueckgestellt: b.zurueckgestellt || 0, leerlaufWarten: b.leerlaufWarten || 0,
      dauerMs: b.dauerMs || 0
    }))
  };
}

module.exports = {
  MESSREIHE, USD_JE_NARRATIV, SLOT_BUDGET_MS, MORGEN_START_MS, SLOT_ZWEI_MS, MORGENFENSTER_ENDE_MS,
  NEBENAUFWAND_MS, WARTESCHLANGE_MS, virtuelleUhr, simuliereMorgen
};
