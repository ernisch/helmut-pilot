"use strict";

// Helmut — GEMEINSAMER SIMULATIONSLAUF fuer die Skalierungsnachweise (OP-30).
// =============================================================================================
// HERKUNFT: dieser Code stand bis zum 2026-08-09 woertlich in
// `scripts/skalierung-simulation-test.js`. Er ist hierher gezogen, weil der Stufennachweis
// (5/25/50/100/200 Mandate, `scripts/skalierung-stufen-test.js`) DENSELBEN Lauf braucht.
//
// WARUM NICHT ZWEI HARNESSE: zwei Simulationen, die dasselbe behaupten, aber verschieden
// gebaut sind, koennen sich widersprechen — und dann glaubt man derjenigen, die gerade
// gruen ist. Eine Wahrheit, zwei Aufrufer.
//
// >>> WAS DAS IST UND WAS NICHT <<<
// Der Lauf benutzt die ECHTEN OP-30-Module (`scalable-pipeline`, `source-demand`,
// `llm-budget-fair`, `worker-betrieb`, `dedup`, `scheduler`). Attrappen sind ausschliesslich
// die AUSSENWELT: Netz (Abruf), KI (Verstehen), Ablage (Speicherwarteschlange) und die Uhr.
// Bewiesen werden damit Ablauf, Reihenfolge, Fairness und Buchhaltung — NICHT die reale Dauer
// eines Google-Abrufs und nicht die realen Modellkosten.
//
// Deterministisch: kein `Math.random`, kein echtes Warten, kein `setTimeout` als Taktgeber.

const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..", "..");

const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));
// Die EINE Kennungswahrheit fuer raw_documents — die Attrappe darf sie nicht nachbauen.
const dedup = require(path.join(ROOT, "lib/helmut/dedup.js"));
const FAIR = require(path.join(ROOT, "lib/helmut/llm-budget-fair.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));
// Fuenfter Auftragstyp (E1): der ECHTE Narrativpfad bis zur Modellgrenze. `lage.js` und
// dessen Cache-/Sperr-/Auswahllogik laufen unveraendert; ersetzt werden ausschliesslich die
// Aussenwelt (Ablage im Speicher) und der Anbieteraufruf (`ai.generateLageBriefing`).
const lage = require(path.join(ROOT, "lib/helmut/lage.js"));
const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
const ai = require(path.join(ROOT, "lib/helmut/ai.js"));
const profilValidation = require(path.join(ROOT, "lib/helmut/profile-validation.js"));

const AN = { HELMUT_SCALABLE_PIPELINE: "on" };
const T0 = Date.parse("2026-08-08T00:00:00Z");
const STUNDE = 3600 * 1000;
const eigeneQuellen = (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];

function uhr(startMs = T0) {
  let ms = startMs;
  return { jetzt: () => ms, vor: (d) => { ms += d; }, setze: (v) => { ms = v; } };
}

// ── Die simulierte Welt ─────────────────────────────────────────────────────────────────
// Jede Zusage haengt an einem Zaehler dieser Welt, nicht an einer Behauptung.
function welt({ profile, ausfall = [], drosselung = 0, dokumenteJeWeg = 2, deckel = null, tag = "2026-08-08" }) {
  const w = {
    profile,
    rohdokumente: new Map(),
    verstandeneVorgaenge: new Set(),
    kiAufrufe: 0,
    kiAbgelehnt: 0,
    kostenbuchungen: [],          // je Buchung: {schluessel, scope}
    doppelbuchungen: 0,
    briefings: new Map(),         // mandat -> {belege, leer}
    leerzustaende: 0,
    abrufe: 0,
    abrufFehler: 0,
    drosselungsfehler: 0,
    fremdzugriffe: [],
    verstehensAuftraege: 0
  };

  const THEMENTOEPFE = 500;
  const vorgangFuer = (weg, nr) =>
    `vg-${crypto.createHash("sha256").update(String(weg)).digest().readUInt32BE(0) % THEMENTOEPFE}-${nr}`;

  // Budgetbuchhaltung: idempotent ueber den Ergebnisschluessel, mit Deckel.
  const reserviert = new Map();
  w.budgetSpeicher = {
    reserviere: async ({ resultKey, scope, workClass }) => {
      if (reserviert.has(resultKey)) return { verfuegbar: true, erlaubt: true, wiederverwendet: true };
      if (deckel != null && w.kostenbuchungen.length >= deckel) {
        w.kiAbgelehnt += 1;
        return { verfuegbar: true, erlaubt: false, grund: "globales-notfalllimit-erreicht" };
      }
      reserviert.set(resultKey, "reserviert");
      w.kostenbuchungen.push({ schluessel: resultKey, scope, workClass });
      return { verfuegbar: true, erlaubt: true, wiederverwendet: false };
    },
    melde: async ({ resultKey, ok }) => { reserviert.set(resultKey, ok ? "verbraucht" : "fehlgeschlagen"); return { verfuegbar: true, uebernommen: true }; },
    gib_frei: async ({ resultKey }) => {
      if (reserviert.get(resultKey) !== "reserviert") return { verfuegbar: true, zurueckgegeben: false };
      reserviert.set(resultKey, "zurueckgegeben");
      const i = w.kostenbuchungen.findIndex((b) => b.schluessel === resultKey);
      if (i >= 0) w.kostenbuchungen.splice(i, 1);
      return { verfuegbar: true, zurueckgegeben: true };
    }
  };

  w.attrappen = (u) => ({
    now: u.jetzt,
    hardeningConfig: () => ({ enabled: false, sharedPathDedup: false, sharedPathWindowMs: 0 }),
    createGate: () => null, sharedLedger: () => null,

    crawlAllSources: async (quellen) => {
      w.abrufe += 1;
      const quelle = quellen[0] || {};
      const wege = quelle.rssUrls || [quelle.rssUrl].filter(Boolean);
      const anbieter = SD.anbieterVonWegen(wege);
      if (ausfall.includes(anbieter)) {
        w.abrufFehler += 1;
        return { results: [{ ok: false, error: `${anbieter}: keine Antwort` }], rawItems: [] };
      }
      // Drosselung: ein deterministischer Anteil der Abrufe antwortet mit HTTP 429.
      if (drosselung > 0) {
        const wert = crypto.createHash("sha256").update(String(quelle.id) + w.abrufe).digest().readUInt32BE(0) % 100;
        if (wert < drosselung * 100) {
          w.drosselungsfehler += 1;
          w.abrufFehler += 1;
          return { results: [{ ok: false, error: "HTTP 429 rate limited" }], rawItems: [] };
        }
      }
      const items = [];
      for (const weg of wege) {
        for (let i = 1; i <= dokumenteJeWeg; i += 1) {
          // KORREKTUR (Abschlussreview 2026-08-08): hier stand `${weg}#a${i}`.
          // `dedup.canonicalizeUrl` entfernt den Fragmentteil — alle Artikel eines
          // Abrufwegs fielen damit auf DIESELBE Dokumentkennung. Echte Artikel
          // unterscheiden sich im Pfad, nicht im Fragment.
          items.push({ url: `https://beispiel.invalid/a/${SD.streuwert(weg).toString(16)}-${i}`,
            title: `T${i}`, sourceId: quelle.id, _weg: weg, _nr: i });
        }
      }
      return { results: [{ ok: true }], rawItems: items };
    },

    // KORREKTUR (Abschlussreview 2026-08-08): die Attrappe baute die Kennung selbst und gab
    // sie im Rueckgabewert mit — und verdeckte damit genau den Fehler, den sie haette
    // finden muessen. Seit OPTION B (Reparatursprint 2026-08-19) bildet die Attrappe die
    // relationale Persistenz nach: `dedup.toRawDocumentRow` liefert die Ablage-Kennung
    // (`rd-<inhaltsfingerabdruck>`), NEU ist nur, was die Welt-Ablage noch nicht traegt —
    // exakt die ignore-duplicates-Semantik von `persistiereRohdokumenteWarteschlange`.
    persistRohdokumente: async (items) => {
      const neuIds = [];
      let vorhandene = 0;
      for (const it of items) {
        const zeile = dedup.toRawDocumentRow(it);
        if (!zeile || !zeile.id) continue;
        if (w.rohdokumente.has(zeile.id)) { vorhandene += 1; continue; }
        w.rohdokumente.set(zeile.id, {
          id: zeile.id, url: it.url, title: it.title, source_id: it.sourceId,
          _weg: it._weg, _vorgang: vorgangFuer(it._weg, it._nr)
        });
        neuIds.push(zeile.id);
      }
      return { ok: true, neuIds, vorhandene };
    },
    ladeRohdokumente: async (ids) => ids.map((i) => w.rohdokumente.get(i)).filter(Boolean),

    eagerUnderstanding: async (dokumente) => {
      let n = 0;
      for (const d of dokumente) {
        const vg = d && d._vorgang;
        if (!vg || w.verstandeneVorgaenge.has(vg)) continue;
        w.verstandeneVorgaenge.add(vg);
        w.kiAufrufe += 1;
        n += 1;
      }
      return { processed: n, deferred: 0 };
    },

    getActiveProfile: async (id) => w.profile.find((p) => p.id === id) || null,
    matching: async () => ({ matched: 1 }),
    decisions: async () => ({ saved: 1 }),
    buildV3Briefing: async (profil, mandatsId) => {
      if (profil.id !== mandatsId) w.fremdzugriffe.push(`${profil.id}!=${mandatsId}`);
      const eigeneWege = new Set(eigeneQuellen(profil).flatMap((q) => SD.abrufwege(q)).map(SD.kanonischeUrl));
      const belege = [];
      for (const [id, d] of w.rohdokumente) {
        // Herkunft aus dem mitgefuehrten Abrufweg, nicht aus dem URL-Praefix (siehe oben).
        const basis = SD.kanonischeUrl(d._weg || "");
        if (eigeneWege.has(basis) && w.verstandeneVorgaenge.has(d._vorgang)) belege.push(id);
      }
      if (!belege.length) w.leerzustaende += 1;
      w.briefings.set(mandatsId, { belege, leer: belege.length === 0 });
      return { available: belege.length > 0, reason: belege.length ? null : "kein-material", items: belege };
    }
  });
  return w;
}

// ── Fuenfter Auftragstyp: Narrativwelt (E1, 2026-08-09) ─────────────────────────────────
//
// AUFTRAGSVORGABE (§12): "Lokale Lasttests muessen den echten Produktionscode bis zur
// Modellgrenze verwenden. Nur der externe Anbieteraufruf darf durch einen kontrollierten
// Adapter ersetzt werden." Genau das passiert hier:
//   * `lage.buildLageBriefing` laeuft WOERTLICH — Auswahl, Quarantaene-Guard, Tagescache,
//     Datenstand-Fingerabdruck, Sperre, Budget-Vorpruefung, Veroeffentlichungsweg.
//   * Ersetzt ist die ABLAGE (In-Speicher statt Supabase — dieselbe Grenze wie bei der
//     Warteschlange selbst) und `ai.generateLageBriefing` (die Modellgrenze; dieselbe
//     Ersetzungsstelle wie in `scripts/lage-cacheonly-test.js`).
//   * Der Adapter reproduziert die PRODUCTION-METADATEN vom 2026-08-09 (134 Aufrufe,
//     ausschliesslich gpt-5-mini): Median 5 052 ms, p95 24 278 ms, Fehlerquote 6 %
//     (request-error/ECONNRESET), 4/134 ueber dem 120-s-Auftragslimit, ~1 735
//     Eingabe-/~437 Ausgabetoken. Fehler- und Drosselquoten sind je Lauf konfigurierbar
//     (Auftrag §14 verlangt 5 % Modellfehler und 2 % Rate Limits).
//
// Die Ueberschreibungen sind PROZESSWEIT (Modul-Singletons) und werden nach jedem Lauf
// byte-genau zurueckgestellt (`aufraeumen`), damit keine zweite Suite sie erbt.
function installiereNarrativWelt(w, u, konfig = {}) {
  const fehlerRate = Math.max(0, Number(konfig.fehlerRate) || 0);
  const rateLimitRate = Math.max(0, Number(konfig.rateLimitRate) || 0);
  const timeoutRate = Math.max(0, Number(konfig.timeoutRate) || 0);
  const tagIso = new Date(T0).toISOString();

  w.narrativ = {
    aufrufe: 0, erzeugt: 0, ausCache: 0, fehler: 0, rateLimits: 0, timeouts: 0,
    anbieterZeitMs: 0, tokensEin: 0, tokensAus: 0,
    doppeltErzeugt: 0, fremd: 0,
    jeMandat: new Map(),                     // mandat -> { versuche, erzeugt }
    veroeffentlichtMs: [],                   // Zeitpunkte der Cache-Schreibvorgaenge
    cache: new Map()                         // bf-<mandat>-lage-<tag> -> Eintrag
  };

  const locks = new Map();
  const streu = (schluessel, offset = 0) =>
    (crypto.createHash("sha256").update(String(schluessel)).digest().readUInt32BE(offset) % 100000) / 100000;

  // Latenzmodell aus den gemessenen Perzentilen (linear interpoliert, deterministisch).
  // Der Schwanz ueber 120 s wird als eigener Timeout-Anteil gefuehrt (s. u.), nicht hier.
  const latenzMs = (schluessel) => {
    const t = streu(schluessel, 8);
    if (t < 0.5) return Math.round(1500 + (t / 0.5) * (5052 - 1500));
    if (t < 0.95) return Math.round(5052 + ((t - 0.5) / 0.45) * (24278 - 5052));
    return Math.round(24278 + ((t - 0.95) / 0.05) * (110000 - 24278));
  };

  const originale = {
    v3StoreReady: storage.v3StoreReady,
    listKnowledgeObjects: storage.listKnowledgeObjects,
    listMatchingResults: storage.listMatchingResults,
    getSourcesForVorgang: storage.getSourcesForVorgang,
    getRenderedBriefingV3: storage.getRenderedBriefingV3,
    saveRenderedBriefingV3: storage.saveRenderedBriefingV3,
    acquirePipelineLock: storage.acquirePipelineLock,
    releasePipelineLock: storage.releasePipelineLock,
    canSpendLlmForTenant: storage.canSpendLlmForTenant,
    recordLlmUsage: storage.recordLlmUsage,
    generateLageBriefing: ai.generateLageBriefing
  };

  storage.v3StoreReady = () => true;
  // Verstandene Vorgaenge der Welt als Knowledge Objects — updated_at konstant, damit der
  // Datenstand-Fingerabdruck (`hashKoSet`) nur von der MENGE abhaengt, wie in echt vom
  // Verstehensfortschritt.
  storage.listKnowledgeObjects = async ({ limit = 500 } = {}) =>
    [...w.verstandeneVorgaenge].slice(0, limit).map((vg) => ({
      id: `ko-${vg}`, vorgang_id: vg, status: "active", understanding_status: "complete",
      headline: `Vorgang ${vg}`,
      was_ist_passiert: `Zum Vorgang ${vg} liegt ein neuer Stand vor.`,
      warum_wichtig: "Beruehrt laufende Mandatsarbeit.",
      updated_at: tagIso
    }));
  // Gespeicherte, personalisierte Matches (die Projektion des Vortags): deterministische,
  // mandatsabhaengige Auswahl — zwei Mandate sehen verschiedene Teilmengen.
  storage.listMatchingResults = async ({ userId, limit = 12 } = {}) => {
    const alle = [...w.verstandeneVorgaenge];
    alle.sort((a, b) => {
      const ha = crypto.createHash("sha256").update(`${userId}|${a}`).digest().readUInt32BE(0);
      const hb = crypto.createHash("sha256").update(`${userId}|${b}`).digest().readUInt32BE(0);
      return ha - hb || String(a).localeCompare(String(b));
    });
    return alle.slice(0, limit).map((vg) => ({ knowledge_object_id: `ko-${vg}`, user_id: userId }));
  };
  storage.getSourcesForVorgang = async (vg) => [{
    url: `https://beispiel.invalid/beleg/${vg}`, source_name: "Beispielquelle",
    published_at: tagIso, title: `Beleg zu ${vg}`
  }];
  storage.getRenderedBriefingV3 = async (userId, slot, day) =>
    w.narrativ.cache.get(`bf-${userId}-${slot}-${day}`) || null;
  storage.saveRenderedBriefingV3 = async (entry) => {
    w.narrativ.cache.set(entry.id, { ...entry });
    w.narrativ.veroeffentlichtMs.push(u.jetzt());
    return { saved: true, id: entry.id };
  };
  storage.acquirePipelineLock = async (name, ttlMs) => {
    const bis = locks.get(name);
    if (bis != null && bis > u.jetzt()) return false;
    locks.set(name, u.jetzt() + (Number(ttlMs) || 90000));
    return true;
  };
  storage.releasePipelineLock = async (name) => { locks.delete(name); return true; };
  // Das innere Budget-Gate bleibt DURCHLAESSIG: die Budgetknappheit wird in diesen Laeufen
  // von der Fairness-Reservierung der Warteschlange getragen (dort ist sie messbar) —
  // zwei gleichzeitig simulierte Deckel wuerden die Zurechnung unlesbar machen.
  storage.canSpendLlmForTenant = async () => ({ allowed: true });
  storage.recordLlmUsage = async () => null;

  // DIE MODELLGRENZE. Deterministisch je (Mandat, Versuch); kein Math.random.
  ai.generateLageBriefing = async (koLite, profil, meta) => {
    const mandat = String((meta && meta.politicianId) || (profil && profil.id) || "");
    if (profil && profil.id && meta && meta.politicianId && String(profil.id) !== String(meta.politicianId)) {
      w.narrativ.fremd += 1;
    }
    w.narrativ.aufrufe += 1;
    const stand = w.narrativ.jeMandat.get(mandat) || { versuche: 0, erzeugt: 0 };
    stand.versuche += 1;
    w.narrativ.jeMandat.set(mandat, stand);
    const schluessel = `narrativ|${mandat}|${stand.versuche}`;
    const wurf = streu(schluessel, 0);
    if (wurf < rateLimitRate) {
      w.narrativ.rateLimits += 1;
      w.narrativ.anbieterZeitMs += 800;
      return null;                                    // wie ein 429: kein Fake, kein Inhalt
    }
    if (wurf < rateLimitRate + fehlerRate) {
      w.narrativ.fehler += 1;
      w.narrativ.anbieterZeitMs += 2000;
      return null;                                    // request-error/ECONNRESET
    }
    if (wurf < rateLimitRate + fehlerRate + timeoutRate) {
      w.narrativ.timeouts += 1;
      w.narrativ.anbieterZeitMs += 120000;            // das Auftragslimit kappt bei 120 s
      return null;
    }
    w.narrativ.anbieterZeitMs += latenzMs(schluessel);
    w.narrativ.tokensEin += 1435 + Math.round(streu(schluessel, 12) * 600);   // um 1 735
    w.narrativ.tokensAus += 337 + Math.round(streu(schluessel, 16) * 200);    // um 437
    w.narrativ.erzeugt += 1;
    stand.erzeugt += 1;
    if (stand.erzeugt > 1) w.narrativ.doppeltErzeugt += 1;
    const ids = (Array.isArray(koLite) ? koLite : []).map((k) => k && k.vorgang_id).filter(Boolean);
    return {
      paragraphs: [
        { text: "Die politische Lage des Tages, verdichtet auf das Wesentliche.", vorgang_ids: ids.slice(0, 6) },
        ...(ids.length > 6 ? [{ text: "Weitere Entwicklungen im Blick.", vorgang_ids: ids.slice(6, 12) }] : [])
      ],
      model: "gpt-5-mini",
      wordCount: 14
    };
  };

  return {
    // Der Handler-Einsprung: die ECHTE Produktionsfunktion, plus Cache-Zaehlung.
    lageNarrativ: async (profil, meta) => {
      const ergebnis = await lage.buildLageBriefing(profil, { ...meta });
      if (ergebnis && ergebnis.available === true && ergebnis.fromCache === true) w.narrativ.ausCache += 1;
      return ergebnis;
    },
    aufraeumen: () => {
      storage.v3StoreReady = originale.v3StoreReady;
      storage.listKnowledgeObjects = originale.listKnowledgeObjects;
      storage.listMatchingResults = originale.listMatchingResults;
      storage.getSourcesForVorgang = originale.getSourcesForVorgang;
      storage.getRenderedBriefingV3 = originale.getRenderedBriefingV3;
      storage.saveRenderedBriefingV3 = originale.saveRenderedBriefingV3;
      storage.acquirePipelineLock = originale.acquirePipelineLock;
      storage.releasePipelineLock = originale.releasePipelineLock;
      storage.canSpendLlmForTenant = originale.canSpendLlmForTenant;
      storage.recordLlmUsage = originale.recordLlmUsage;
      ai.generateLageBriefing = originale.generateLageBriefing;
    }
  };
}

// Ein simulierter Tag. Gibt die volle Messreihe zurueck.
//
// URSACHE DER FRUEHEREN "25 STUNDEN" (gefunden und behoben am 2026-08-08, Korrektursprint).
// Die erste Fassung liess den Worker GENAU EINMAL je simulierter Stunde laufen und schob die
// Uhr danach um eine volle Stunde vor. Das war kein Kapazitaets-, Budget- oder
// Parallelitaetsbefund, sondern ein ABTASTFEHLER der Simulation:
//
//   `VORBEDINGUNG_WARTE_MS` ist **120 000 ms = 2 Minuten**. Ein Auftrag, der auf eine
//   Vorbedingung wartet, ist zwei Minuten spaeter wieder faellig. Die Simulation gab ihm
//   aber erst nach EINER STUNDE die naechste Gelegenheit — sie tastete den Betrieb also mit
//   einem Dreissigstel der Rate ab, die das System tatsaechlich erlaubt.
//
//   Bei einer Vorbedingungskette der Tiefe drei (Abruf -> Verstehen -> Projektion ->
//   Briefing) kostete das allein durch die Abtastung Stunden. Gemessen: der Bestand lief
//   ueber die Stunden 20-24 mit 156 -> 95 -> 44 -> 16 -> 0 aus — ein gleichmaessiges
//   Abtropfen, kein Engpass.
//
// Der Takt ist deshalb jetzt ein Parameter und steht standardmaessig auf genau der
// Granularitaet, die das System selbst vorgibt. Das ist KEINE kuenstliche Beschleunigung:
// es wird keine Arbeit uebersprungen, kein Deckel erhoeht, kein Tag verlaengert und keine
// Wartezeit verkuerzt — es wird nur die kuenstliche VERLANGSAMUNG der Messung entfernt.
// Wer den alten Takt sehen will, uebergibt `taktMs: 3600 * 1000`.
async function simuliereTag({
  anzahlMandate, stunden = 72, workerJeRunde = 4, deckel = null,
  ausfall = [], drosselung = 0, absturzInStunde = null, doppelterScheduler = false,
  fairness = false, startMs = T0, langsam = false,
  taktMs = SP.VORBEDINGUNG_WARTE_MS || 120000,
  // ── Ergaenzungen fuer den Stufennachweis (2026-08-09) ─────────────────────────────────
  // Alle vier sind DEFAULT AUS: ohne sie verhaelt sich der Lauf exakt wie vorher.
  //
  // Deaktivierte Mandate: sie werden dem Profilbestand ZUSAETZLICH beigemischt. Der echte
  // Scheduler muss sie ueber `profile-validation.isDisabled` selbst aussortieren — genau das
  // war Befund B4, und genau deshalb duerfen sie hier nicht vorgefiltert werden.
  deaktivierteMandate = 0,
  // Neue Mandate MITTEN im laufenden Zeitraum: ab dieser Stunde kommen sie dazu und der
  // Scheduler wird erneut ausgeloest. Prueft, ob ein spaeter Zugang noch bedient wird.
  neueMandateAbStunde = null,
  neueMandate = 0,
  // Rueckstand aus einem VORHERIGEN Lauf: so viele Auftraege liegen zu Beginn bereits
  // ueberfaellig in der Warteschlange.
  vorlaufRueckstand = 0,
  // Ein besonders grosses Mandat (mehr eigene Quellen) neben vielen kleinen.
  grossesMandat = false,
  // ── Fuenfter Auftragstyp (E1, 2026-08-09) — DEFAULT AUS ────────────────────────────────
  // Ohne `narrativ: true` ist dieser Lauf byte-gleich zu vorher (bestehende Suiten bleiben
  // unberuehrt). Mit `narrativ: true` laeuft der Tag mit ALLEN FUENF Auftragstypen:
  // Flag `HELMUT_NARRATIV_QUEUE` an, `tenant_narrative` wird geplant, der Handler ruft das
  // ECHTE `lage.buildLageBriefing` auf (Modellgrenze: Adapter, s. installiereNarrativWelt).
  narrativ = false,
  // Stoerprofil des Anbieter-Adapters (Auftrag §14): Anteile je Aufruf, deterministisch.
  narrativStoerung = {},
  // Kontrollierte Mehrlast (Reserveprobe): Dokumente je Abrufweg (Standard 2, wie bisher).
  dokumenteJeWeg = 2
}) {
  const u = uhr(startMs);
  const ENV = narrativ ? { ...AN, HELMUT_NARRATIV_QUEUE: "on" } : AN;
  const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
  const aktive = erzeugeMandate(anzahlMandate);
  if (grossesMandat && aktive.length) {
    // Ein Mandat mit deutlich mehr Themen und Ausschuessen erzeugt mehr eigene Abrufwege.
    // Es ist der Fall, an dem sich zeigt, ob ein Schwergewicht die Kleinen verdraengt.
    aktive[0] = {
      ...aktive[0],
      focusTopics: Array.from({ length: 12 }, (_, i) => `Grossthema ${i}`),
      committees: Array.from({ length: 6 }, (_, i) => `Grossausschuss ${i}`),
      regionalInterests: Array.from({ length: 6 }, (_, i) => `Grossregion ${i}`)
    };
  }
  // Deaktivierte Profile: dieselbe Erzeugung, danach ausdruecklich abgeschaltet — und mit
  // eigener Kennung, damit sie sich nicht mit den aktiven ueberschneiden.
  const deaktiviert = erzeugeMandate(deaktivierteMandate).map((p, i) => ({
    ...p, id: `deaktiviert-${i}-${p.id}`, profileActive: false
  }));
  const spaetere = erzeugeMandate(neueMandate).map((p, i) => ({ ...p, id: `spaet-${i}-${p.id}` }));

  let profile = [...aktive, ...deaktiviert];
  const w = welt({ profile: [...aktive, ...deaktiviert, ...spaetere], ausfall, drosselung, deckel, dokumenteJeWeg });
  // Narrativwelt NUR im Fuenf-Typen-Modus installieren (und am Ende IMMER zurueckstellen).
  const narrativWelt = narrativ ? installiereNarrativWelt(w, u, narrativStoerung) : null;

  // Planung. Optional zweimal ausgeloest (doppelter Scheduler).
  const planen = () => SP.planeArbeit({
    env: ENV, jetztMs: u.jetzt(),
    deps: { listFullProfiles: async () => profile, quellenFuerProfil: async (p) => eigeneQuellen(p), enqueue: q.enqueue }
  });
  // RUECKSTAND AUS EINEM VORHERIGEN LAUF. Er entsteht VOR der Planung, damit er wirklich
  // aelter ist als alles andere — sonst waere er kein Rueckstand, sondern nur Arbeit.
  const vorlaufIds = [];
  for (let i = 0; i < vorlaufRueckstand; i += 1) {
    const r = await q.enqueue({
      jobType: "source_fetch",
      idempotencyKey: `vorlauf|${i}`,
      freshnessWindow: new Date(startMs - 24 * STUNDE).toISOString().slice(0, 13) + "Z",
      tenantId: null, priority: 100, maxAttempts: 5,
      dueAt: new Date(startMs - 12 * STUNDE).toISOString(),
      payload: { art: "geteilt", quelle: { id: `vorlauf-${i}`, rssUrls: [`https://vorlauf.invalid/${i}`] } }
    });
    if (r && r.id) vorlaufIds.push(r.id);
  }
  // Damit der Rueckstand wirklich alt AUSSIEHT (die Attrappe setzt created_at auf `jetzt`):
  for (const zeile of q.alle()) {
    if (vorlaufIds.includes(zeile.id)) {
      zeile.created_at = new Date(startMs - 12 * STUNDE).toISOString();
      if (zeile.first_due_at !== undefined) zeile.first_due_at = zeile.due_at;
    }
  }

  const plan1 = await planen();
  const plan2 = doppelterScheduler ? await planen() : null;

  const budget = fairness
    ? SP.budgetAdapter({
      env: { ...ENV, HELMUT_LLM_FAIRNESS: "on", HELMUT_MAX_LLM_CALLS_PER_DAY: String(deckel == null ? 100000 : deckel) },
      deps: { budgetSpeicher: w.budgetSpeicher, now: u.jetzt }
    })
    : null;

  const gehalten = new Map();
  let gleichzeitigDoppelt = 0;
  let verloren = 0;
  const echterClaim = q.claim;
  const echterFinish = q.finish;
  const echtesDefer = q.zurueckstellen;

  // WARTEZEITEN. Gemessen wird die Spanne von der URSPRUENGLICHEN Faelligkeit bis zum
  // erfolgreichen Abschluss — nicht bis zum ersten Zugriff und nicht ab `due_at`. Genau das
  // war Befund B2: `due_at` wird vom Zurueckstellen nach vorn geschoben, eine Messung dagegen
  // ist durch Warten loeschbar. Die Attrappe kennt `first_due_at` nicht, deshalb merkt sich
  // dieser Lauf die erste gesehene Faelligkeit selbst.
  const ersteFaelligkeit = new Map();
  const wartezeitenS = [];
  const jeMandat = new Map();          // mandatsId -> erledigte Auftraege (Fairness)
  const fehlerJeMandat = new Map();

  const deps = {
    ...w.attrappen(u),
    claim: async (o) => {
      const r = await echterClaim(o);
      for (const a of r.auftraege) {
        if (gehalten.has(a.id)) gleichzeitigDoppelt += 1;
        gehalten.set(a.id, o.owner);
        if (!ersteFaelligkeit.has(a.id)) ersteFaelligkeit.set(a.id, Date.parse(a.due_at));
      }
      return r;
    },
    finish: async (o) => {
      gehalten.delete(o.id);
      const zeile = q.hole(o.id);
      const mandat = zeile && zeile.tenant_id;
      if (o.ok) {
        const start = ersteFaelligkeit.get(o.id);
        if (Number.isFinite(start)) wartezeitenS.push(Math.max(0, (u.jetzt() - start) / 1000));
        if (mandat) jeMandat.set(mandat, (jeMandat.get(mandat) || 0) + 1);
      } else if (mandat) {
        fehlerJeMandat.set(mandat, (fehlerJeMandat.get(mandat) || 0) + 1);
      }
      return echterFinish(o);
    },
    zurueckstellen: async (o) => { gehalten.delete(o.id); return echtesDefer(o); },
    extendLease: q.extendLease,
    enqueue: q.enqueue,
    offeneVorbedingungen: q.offeneVorbedingungen,
    budget,
    // Fuenfter Auftragstyp: echter Narrativpfad (nur im Fuenf-Typen-Modus installiert;
    // ohne ihn faellt ein — dann fehlerhaft eingereihter — Narrativauftrag ehrlich auf
    // die Standardverdrahtung zurueck, die in dieser Umgebung keine Ablage findet).
    ...(narrativWelt ? {
      lageNarrativ: narrativWelt.lageNarrativ,
      istDeaktiviert: (p) => profilValidation.isDisabled(p)
    } : {})
  };

  let maxQueue = 0;
  let maxRueckstandS = 0;
  const verlauf = [];
  let stundenBisFertig = null;
  let ohneFortschritt = 0;
  let letzterStand = "";

  // Anzahl der Takte fuer den gewuenschten Zeitraum.
  const takteGesamt = Math.max(1, Math.ceil((stunden * STUNDE) / taktMs));
  let fertigMs = null;
  try {
  for (let takt = 0; takt < takteGesamt; takt += 1) {
    // `stunde` bleibt die Zeitachse der Auswertung: welche simulierte Stunde laeuft gerade.
    const stunde = Math.floor((takt * taktMs) / STUNDE);
    // NEUE MANDATE MITTEN IM ZEITRAUM. Genau einmal, zu Beginn der genannten Stunde: der
    // Scheduler laeuft erneut und muss sie einplanen, ohne die laufende Arbeit zu stoeren.
    if (neueMandateAbStunde != null && stunde === neueMandateAbStunde
        && ((takt * taktMs) % STUNDE) === 0 && spaetere.length && !profile.includes(spaetere[0])) {
      profile = [...profile, ...spaetere];
      await planen();
    }
    const abgestuerzt = absturzInStunde != null && absturzInStunde === stunde && ((takt * taktMs) % STUNDE) === 0;
    const n = abgestuerzt ? workerJeRunde - 1 : workerJeRunde;
    await Promise.all(Array.from({ length: n }, (_, i) =>
      SP.arbeite({
        env: ENV, owner: `w${stunde}-${i}`,
        budgetMs: langsam ? 600000 : 3600000,
        leaseMs: 600000, stapel: langsam ? 20 : 200, deps
      })));

    if (abgestuerzt) {
      // Absturz: ein Worker haelt Auftraege und verschwindet. Die Lease laeuft ab.
      const laufend = q.nachStatus("laeuft");
      for (const zeile of laufend) { zeile.lease_expires_at = new Date(u.jetzt() - 1000).toISOString(); }
    }

    // PFLICHTARBEIT = alles ausser der Archivsuche (die hat per Entwurf ein 7-Tage-Fenster
    // und ist an Tag 1 gar nicht faellig).
    //
    // BELEGTER MESSFEHLER (2026-08-08, in dieser Suite): eine erste Fassung zaehlte nur die
    // GERADE FAELLIGEN Auftraege als offen und brach ab, sobald diese Zahl 0 war. Weil die
    // Faelligkeiten absichtlich ueber das Fenster gestreut sind, war das schon nach der
    // ersten Stunde der Fall — der Lauf endete nach 1 Stunde mit 130 von 1 255 Auftraegen
    // und meldete "fertig". Abbruchkriterium ist deshalb: NICHTS Nicht-Archivisches mehr
    // wartend oder laufend.
    const istArchiv = (x) => x.payload && x.payload.art === "person-archiv";
    // EIN Durchlauf statt vier (Befund R6, reine Ressourcenfrage — dieselben Zahlen):
    // vorher entstanden hier je Takt vier vollstaendige Arrays ueber alle Zeilen.
    let pflichtOffen = 0;
    let fertig = 0;
    let aeltesteFaelligS = 0;
    const jetztMs = u.jetzt();
    for (const x of q._zeilen.values()) {
      if (x.status === "erledigt") fertig += 1;
      else if (x.status === "wartend" || x.status === "laeuft") {
        if (!istArchiv(x)) pflichtOffen += 1;
        if (x.status === "wartend") {
          const rueckstandS = (jetztMs - Date.parse(x.due_at)) / 1000;
          if (rueckstandS > aeltesteFaelligS) aeltesteFaelligS = rueckstandS;
        }
      }
    }
    const offen = pflichtOffen;
    maxQueue = Math.max(maxQueue, q.groesse());
    if (aeltesteFaelligS > maxRueckstandS) maxRueckstandS = aeltesteFaelligS;
    if (((takt * taktMs) % STUNDE) === 0 || pflichtOffen === 0) verlauf.push({ stunde, offen, erledigt: fertig });
    if (pflichtOffen === 0 && fertigMs == null) {
      // EXAKTER Zeitpunkt, nicht auf volle Stunden aufgerundet. Die alte Zeile lautete
      // `stundenBisFertig = stunde + 1` — das machte aus "fertig um 23:58" die Aussage
      // "24 Stunden" und aus "fertig um 24:02" die Aussage "25 Stunden".
      fertigMs = u.jetzt() + taktMs - startMs;
      stundenBisFertig = Math.ceil(fertigMs / STUNDE);
    }
    // Kein Fortschritt mehr? Dann ist der Rest strukturell blockiert, nicht nur langsam —
    // und weiterlaufen wuerde nur Rechenzeit verbrennen, ohne etwas zu zeigen.
    // Fortschritt heisst: es wurde etwas erledigt ODER die Zahl der offenen Pflichtauftraege
    // hat sich bewegt. Ohne den zweiten Teil gilt eine Runde, in der nur zurueckgestellt
    // wurde, faelschlich als Stillstand.
    const stand = `${fertig}|${pflichtOffen}`;
    if (stand === letzterStand) ohneFortschritt += 1; else ohneFortschritt = 0;
    letzterStand = stand;
    u.vor(taktMs);
    if (pflichtOffen === 0) break;
    // Kein Fortschritt ueber sechs Runden = strukturell blockiert. Sechs statt drei, weil
    // die Faelligkeiten gestreut sind und einzelne Stunden legitim leer sein koennen.
    // Stillstand darf ERST NACH Stunde 36 zum Abbruch fuehren. Vorher waere er eine
    // Fehlmessung: die Vorbedingungs-Wartefrist laeuft sechs Stunden ab Faelligkeit, und
    // Briefings werden bis Stunde 23,5 faellig — ein Abbruch bei Stunde 12 haette den
    // entscheidenden Teil des Tages nie gesehen. (Belegter Messfehler in dieser Suite:
    // A1 meldete 0 Briefings, weil der Lauf vorher endete.)
    if (ohneFortschritt >= 12 && stunde >= 36) break;
  }
  } finally {
    // Die Modul-Ueberschreibungen der Narrativwelt IMMER zuruecknehmen — auch wenn der
    // Lauf abbricht. Sonst erbte der naechste Lauf (oder eine andere Suite im selben
    // Prozess) eine fremde Ablage.
    if (narrativWelt) narrativWelt.aufraeumen();
  }

  const alle = q.alle();
  const erledigt = q.nachStatus("erledigt").length;
  const wartend = q.nachStatus("wartend").length;
  const istArchivZeile = (x) => x.payload && x.payload.art === "person-archiv";
  const wartendFaellig = q.alle().filter((x) => x.status === "wartend" && !istArchivZeile(x)).length;
  const nochNichtFaellig = wartend - wartendFaellig;
  const laufend = q.nachStatus("laeuft").length;
  const fehlgeschlagen = q.nachStatus("fehlgeschlagen").length;
  // VERLUST richtig gemessen. Die erste Fassung rechnete `geplant - vorhanden` und kam auf
  // NEGATIVE Verluste — weil der Abrufhandler waehrend des Laufs zusaetzlich
  // `document_understanding`-Auftraege einreiht. Die Warteschlange WAECHST also gegenueber
  // dem Plan, und das ist richtig so. Verlust heisst: eine Zeile ist in keinem der vier
  // gueltigen Zustaende oder ganz verschwunden.
  const inGueltigemZustand = erledigt + wartend + laufend + fehlgeschlagen;
  verloren = alle.length - inGueltigemZustand;
  const unterPlan = Math.max(0, plan1.geplant - alle.length);

  // Fairness: wie verteilen sich die Kostenbuchungen auf die Mandate?
  const jeScope = new Map();
  for (const b of w.kostenbuchungen) jeScope.set(b.scope, (jeScope.get(b.scope) || 0) + 1);
  const mandatsScopes = [...jeScope].filter(([s]) => s !== "global");

  // ── Kennzahlen des Stufennachweises ──────────────────────────────────────────────────
  const sortiert = [...wartezeitenS].sort((a, b) => a - b);
  const perzentil = (p) => (sortiert.length
    ? sortiert[Math.min(sortiert.length - 1, Math.floor((p / 100) * sortiert.length))] : 0);
  const aktiveIds = new Set(aktive.map((p) => p.id));
  const bedient = [...aktiveIds].filter((id) => (jeMandat.get(id) || 0) > 0).length;
  const proMandat = [...aktiveIds].map((id) => jeMandat.get(id) || 0);
  const minProMandat = proMandat.length ? Math.min(...proMandat) : 0;
  const maxProMandat = proMandat.length ? Math.max(...proMandat) : 0;
  // Deaktivierte Mandate duerfen in KEINER Auftragszeile auftauchen.
  const deaktivierteIds = new Set(deaktiviert.map((p) => p.id));
  const deaktivierteInArbeit = alle.filter((x) => x.tenant_id && deaktivierteIds.has(x.tenant_id)).length;

  return {
    anzahlMandate, deckel, stunden, workerJeRunde,
    // Neu (Stufennachweis 2026-08-09):
    mandate: {
      geplant: aktiveIds.size,
      deaktiviertBeigemischt: deaktivierteIds.size,
      deaktivierteInArbeit,
      spaetHinzugekommen: neueMandateAbStunde != null ? spaetere.length : 0,
      beruecksichtigt: bedient,
      vollstaendigVerarbeitet: [...w.briefings.keys()].filter((m) => aktiveIds.has(m)).length,
      minAuftraegeProMandat: minProMandat,
      maxAuftraegeProMandat: maxProMandat,
      // Fairness als Verhaeltnis: 1,0 = alle gleich bedient. 0 = mindestens einer leer.
      fairness: maxProMandat > 0 ? Math.round((minProMandat / maxProMandat) * 1000) / 1000 : 0,
      mitFehlern: fehlerJeMandat.size
    },
    warten: {
      anzahl: sortiert.length,
      maxS: sortiert.length ? sortiert[sortiert.length - 1] : 0,
      medianS: perzentil(50),
      p95S: perzentil(95)
    },
    vorlauf: { eingestellt: vorlaufRueckstand, offen: vorlaufIds.filter((id) => {
      const zeile = alle.find((x) => x.id === id);
      return zeile && zeile.status !== "erledigt";
    }).length },
    stundenBisFertig,
    fertigMs,
    fertigUhrzeit: fertigMs == null ? null : (() => {
      const s = Math.floor(fertigMs / 1000);
      const hh = String(Math.floor(s / 3600)).padStart(2, "0");
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    })(),
    taktMs,
    stundenGelaufen: verlauf.length,
    unterPlan,
    plan: { geplant: plan1.geplant, neu: plan1.neu, zweiterLaufNeu: plan2 ? plan2.neu : null },
    queue: { gesamt: alle.length, erledigt, wartend, wartendFaellig, nochNichtFaellig, laufend, fehlgeschlagen, maxQueue },
    verloren,
    gleichzeitigDoppelt,
    maxRueckstandS,
    ki: { aufrufe: w.kiAufrufe, abgelehnt: w.kiAbgelehnt, vorgaenge: w.verstandeneVorgaenge.size },
    kosten: {
      buchungen: w.kostenbuchungen.length,
      eindeutig: new Set(w.kostenbuchungen.map((b) => b.schluessel)).size,
      global: w.kostenbuchungen.filter((b) => b.scope === "global").length,
      mandatsbezogen: mandatsScopes.length
    },
    abruf: { versuche: w.abrufe, fehler: w.abrufFehler, drosselung: w.drosselungsfehler },
    briefings: {
      gesamt: w.briefings.size,
      belegt: [...w.briefings.values()].filter((b) => !b.leer).length,
      leer: [...w.briefings.values()].filter((b) => b.leer).length
    },
    fremdzugriffe: w.fremdzugriffe.length,
    dokumente: w.rohdokumente.size,
    verlauf,
    // ── Fuenfter Auftragstyp (nur im Fuenf-Typen-Modus gefuellt) ─────────────────────────
    narrativ: narrativ ? (() => {
      const zeilen = alle.filter((x) => x.job_type === "tenant_narrative");
      const zeiten = [...w.narrativ.veroeffentlichtMs].sort((a, b) => a - b);
      return {
        auftraege: zeilen.length,
        erledigt: zeilen.filter((x) => x.status === "erledigt").length,
        wartend: zeilen.filter((x) => x.status === "wartend").length,
        laufend: zeilen.filter((x) => x.status === "laeuft").length,
        fehlgeschlagen: zeilen.filter((x) => x.status === "fehlgeschlagen").length,
        aufrufe: w.narrativ.aufrufe,
        erzeugt: w.narrativ.erzeugt,
        ausCache: w.narrativ.ausCache,
        fehler: w.narrativ.fehler,
        rateLimits: w.narrativ.rateLimits,
        timeouts: w.narrativ.timeouts,
        anbieterZeitMs: w.narrativ.anbieterZeitMs,
        tokensEin: w.narrativ.tokensEin,
        tokensAus: w.narrativ.tokensAus,
        doppeltErzeugt: w.narrativ.doppeltErzeugt,
        fremd: w.narrativ.fremd,
        veroeffentlichteMandate: new Set(
          [...w.narrativ.cache.keys()].map((k) => k.replace(/^bf-/, "").replace(/-lage-.*$/, ""))
        ).size,
        erstesFertigMs: zeiten.length ? zeiten[0] - startMs : null,
        letztesFertigMs: zeiten.length ? zeiten[zeiten.length - 1] - startMs : null
      };
    })() : null
  };
}
module.exports = { AN, T0, STUNDE, eigeneQuellen, uhr, welt, simuliereTag, installiereNarrativWelt };
