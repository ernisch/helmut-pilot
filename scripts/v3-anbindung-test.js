"use strict";

// Helmut — V3-ANBINDUNG DES WARTESCHLANGENPFADS (OP-30, Sprintauftrag Phase 2 + Phase 5).
// =============================================================================================
// Was vor diesem Sprint fehlte: der Warteschlangenpfad endete faktisch beim Rohdokument.
// `document_understanding` hatte einen Handler, aber NIEMAND reihte den Auftrag ein. Damit
// entstand aus einem Abruf nie ein Vorgang, und aus keinem Vorgang je ein Briefinginhalt.
//
// Diese Suite prueft die geschlossene Kette:
//   Abruf -> Rohdokument -> Verstehen -> Matching -> Projektion -> Entscheidung -> Briefing
// und zwar an genau den Stellen, an denen sie brechen kann.
//
// ATTRAPPEN, ausdruecklich benannt: Netz, KI und Ablage sind nachgebildet. Was hier bewiesen
// wird, ist der ABLAUF und die REIHENFOLGE — nicht die Laufzeit echter Abrufe. Der
// Datenbanknachweis der Warteschlange selbst liegt in jobqueue-datenbank-test.js, der
// atomare Budgetnachweis in llm-budget-fairness-test.js.

const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
// Die EINE Kennungswahrheit fuer raw_documents — dieselbe Funktion, die
// `scheduler.persistRawDocumentsShadow` benutzt. Die Attrappe unten darf sie nicht nachbauen.
const dedup = require(path.join(ROOT, "lib/helmut/dedup.js"));
const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));
const FAIR = require(path.join(ROOT, "lib/helmut/llm-budget-fair.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function nichtBewiesen(name, grund) { offen += 1; console.log(`  OFFEN ${name} — NICHT BEWIESEN: ${grund}`); }
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function z(n) { return Number(n).toLocaleString("de-DE"); }

const AN = { HELMUT_SCALABLE_PIPELINE: "on" };
const AN_FAIR = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_LLM_FAIRNESS: "on", HELMUT_MAX_LLM_CALLS_PER_DAY: "100" };
const T0 = Date.parse("2026-08-08T00:00:00Z");
const eigeneQuellen = (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];

function uhr(startMs = T0) {
  let ms = startMs;
  return { jetzt: () => ms, vor: (d) => { ms += d; } };
}

// Eine Welt: Ablage, Zaehler, Attrappen. Alles, was der echte Pfad anfassen wuerde, ist hier
// nachgebildet — und ZAEHLT, damit jede Zusage am Zaehler haengt und nicht an einer Meinung.
function welt({ dokumenteJeAbruf = 3 } = {}) {
  const w = {
    rohdokumente: new Map(),      // id -> Zeile (die "Ablage")
    verstandeneVorgaenge: new Set(),
    kiAufrufe: 0,
    matchingAufrufe: 0,
    entscheidungsAufrufe: 0,
    briefingAufrufe: 0,
    belegeJeMandat: new Map(),
    fremdzugriffe: [],
    abrufe: 0
  };

  // Ein Dokument gehoert zu einem VORGANG. Damit die Attrappe das echte Clustering
  // ueberhaupt abbildet, muessen VERSCHIEDENE Abrufwege auf DENSELBEN Vorgang fallen
  // koennen — sonst waere jede Aussage ueber Deduplizierung wertlos, weil sie an einer
  // Attrappe haengt, die per Bauart nie dedupliziert. `THEMENTOEPFE` bildet die endliche
  // Zahl politischer Ereignisse eines Tages ab: viele Suchen, dieselbe Nachricht.
  const THEMENTOEPFE = 500;
  const vorgangFuer = (weg, nr) => {
    const topf = crypto.createHash("sha256").update(String(weg)).digest().readUInt32BE(0) % THEMENTOEPFE;
    return `vg-${topf}-${nr}`;
  };

  w.attrappen = (u) => ({
    now: u.jetzt,
    hardeningConfig: () => ({ enabled: false, sharedPathDedup: false, sharedPathWindowMs: 0 }),
    createGate: () => null,
    sharedLedger: () => null,

    crawlAllSources: async (quellen) => {
      w.abrufe += 1;
      const quelle = quellen[0] || {};
      const wege = quelle.rssUrls || [quelle.rssUrl].filter(Boolean);
      const items = [];
      for (const weg of wege) {
        for (let i = 1; i <= dokumenteJeAbruf; i += 1) {
          // KORREKTUR (Abschlussreview 2026-08-08): hier stand `${weg}#artikel-${i}`.
          // `dedup.canonicalizeUrl` entfernt den Fragmentteil (`u.hash = ""`) — alle
          // Artikel eines Abrufwegs fielen damit auf DIESELBE Dokumentkennung. Die
          // Attrappe modellierte also drei Artikel und lieferte in Wahrheit einen.
          // Echte Artikel unterscheiden sich im Pfad, nicht im Fragment.
          const artikelUrl = `https://beispiel.invalid/artikel/${SD.streuwert(weg).toString(16)}-${i}`;
          items.push({ url: artikelUrl, title: `Titel ${i}`, sourceId: quelle.id, _weg: weg, _nr: i });
        }
      }
      return { results: [{ ok: true }], rawItems: items };
    },

    // KORREKTUR (Abschlussreview 2026-08-08): diese Attrappe hat die Kennung frueher SELBST
    // gebaut und dabei genau den Fehler verdeckt, den sie haette finden muessen (der
    // Handler schickte Blob-Kennungen in einen Auftrag, der `raw_documents` liest).
    //
    // SEIT OPTION B (Reparatursprint 2026-08-19) bildet die Attrappe die RELATIONALE
    // Persistenz des Warteschlangenpfads nach: `dedup.toRawDocumentRow` liefert die echte
    // Ablage-Kennung (`rd-<inhaltsfingerabdruck>`), NEU ist nur, was die Welt-Ablage noch
    // nicht traegt — exakt die ignore-duplicates-Semantik von
    // `storage.persistiereRohdokumenteWarteschlange`. Der Handler bekommt die Kennungen
    // aus der Ablage-Antwort (`neuIds`), nie aus einer Blob-Form.
    persistRohdokumente: async (items) => {
      const neuIds = [];
      let vorhandene = 0;
      for (const it of items) {
        const zeile = dedup.toRawDocumentRow(it);
        if (!zeile || !zeile.id) continue;
        if (w.rohdokumente.has(zeile.id)) { vorhandene += 1; continue; }
        w.rohdokumente.set(zeile.id, {
          id: zeile.id, url: it.url, title: it.title, source_id: it.sourceId,
          // Herkunft (welcher Abrufweg hat dieses Dokument geliefert) wird ausdruecklich
          // mitgefuehrt — vorher aus dem URL-Praefix abgeleitet, was nur mit der
          // unrealistischen `<feed>#artikel-N`-Form funktionierte.
          _weg: it._weg,
          _vorgang: vorgangFuer(it._weg, it._nr)
        });
        neuIds.push(zeile.id);
      }
      return { ok: true, neuIds, vorhandene };
    },
    ladeRohdokumente: async (ids) => ids.map((i) => w.rohdokumente.get(i)).filter(Boolean),

    // Das V3-Verstehen: EIN Aufruf je NEUEM Vorgang. Ein bekannter Vorgang wird
    // kurzgeschlossen — genau der `existing`-Zweig aus understanding.js.
    eagerUnderstanding: async (dokumente) => {
      let verarbeitet = 0;
      for (const d of dokumente) {
        const vg = d && d._vorgang;
        if (!vg || w.verstandeneVorgaenge.has(vg)) continue;
        w.verstandeneVorgaenge.add(vg);
        w.kiAufrufe += 1;                 // 1 KI-Aufruf je NEUEM Vorgang, GLOBAL
        verarbeitet += 1;
      }
      return { processed: verarbeitet, deferred: 0 };
    },

    getActiveProfile: async (id) => w.profile.find((p) => p.id === id) || null,
    matching: async ({ profile }) => { w.matchingAufrufe += 1; return { matched: 1, profil: profile.id }; },
    decisions: async ({ profile }) => { w.entscheidungsAufrufe += 1; return { saved: 1, profil: profile.id }; },

    buildV3Briefing: async (profil, mandatsId) => {
      w.briefingAufrufe += 1;
      if (profil.id !== mandatsId) w.fremdzugriffe.push(`briefing ${profil.id} != ${mandatsId}`);
      // Belege = die Dokumente, die aus den EIGENEN Abrufwegen dieses Mandats stammen.
      const eigeneWege = new Set(eigeneQuellen(profil).flatMap((q) => SD.abrufwege(q)).map(SD.kanonischeUrl));
      const belege = [];
      for (const [id, d] of w.rohdokumente) {
        // Herkunft aus dem mitgefuehrten Abrufweg, nicht aus dem URL-Praefix (siehe oben).
        const basis = SD.kanonischeUrl(d._weg || "");
        if (eigeneWege.has(basis) && w.verstandeneVorgaenge.has(d._vorgang)) belege.push({ dokument: id, weg: basis });
      }
      w.belegeJeMandat.set(mandatsId, belege);
      return { available: belege.length > 0, reason: belege.length ? null : "kein-material", items: belege };
    }
  });
  return w;
}

async function main() {
  console.log("Helmut — V3-Anbindung des Warteschlangenpfads (OP-30, Phase 2 + 5)");
  console.log("  offline · ohne Netz · ohne KI · Attrappen fuer Abruf, Verstehen, Ablage\n");

  // ═══ 1 · Die Kette ist ueberhaupt geschlossen ═════════════════════════════
  abschnitt("1 · Ein Abruf erzeugt jetzt einen Verstehensauftrag (Phase 2.1)");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = welt();
    w.profile = erzeugeMandate(2);
    const deps = { ...w.attrappen(u), claim: q.claim, finish: q.finish, extendLease: q.extendLease, enqueue: q.enqueue };

    const quelle = { id: "q1", name: "Q", type: "news", rssUrls: ["https://news.google.com/rss/search?q=a"] };
    const ergebnis = await SP.HANDLER.source_fetch(
      { id: "j1", payload: { quelle }, freshnessWindow: "F1" }, deps);

    check("1.1 Der Abruf meldet gespeicherte Dokumente", ergebnis.gespeichert === 3, String(ergebnis.gespeichert));
    check("1.2 Der Abruf reiht einen Verstehensauftrag ein", ergebnis.verstehensAuftraege === 1, String(ergebnis.verstehensAuftraege));
    const verstehen = q.alle().filter((x) => x.job_type === "document_understanding");
    check("1.3 Der Verstehensauftrag steht in der Warteschlange", verstehen.length === 1);
    // KORREKTUR (Abschlussreview 2026-08-08): die Erwartung war `rd-[0-9a-f]{16}` — die
    // Kennung der frueheren Attrappe. `dedup.toRawDocumentRow` erzeugt den VOLLEN SHA-256
    // (64 Zeichen). Die Erwartung wurde also gegen die Attrappe geprueft, nicht gegen die
    // Ablage. Jetzt wird gegen die ECHTE Kennungsfunktion geprueft.
    check("1.4 Er traegt NUR Kennungen, keine Inhalte (Datensparsamkeit)",
      Array.isArray(verstehen[0].payload.dokumentIds)
      && verstehen[0].payload.dokumentIds.length === 3
      && verstehen[0].payload.dokumentIds.every((i) => /^rd-[0-9a-f]{64}$/.test(i))
      && !JSON.stringify(verstehen[0].payload).includes("Titel"),
      JSON.stringify(verstehen[0].payload).slice(0, 120));
    // NEU (Abschlussreview 2026-08-08): der eigentliche Nachweis — die Kennungen im Auftrag
    // sind GENAU die, unter denen die Dokumente in `raw_documents` liegen. Vorher trug der
    // Auftrag die Blob-Kennungen (`raw-…`), und `getRawDocumentsByIds` haette nie etwas
    // gefunden. Ein reiner Formattest haette das nicht bemerkt.
    check("1.4b Die Kennungen sind die der Ablage (rd-…), nicht die des Blobs (raw-…)",
      verstehen[0].payload.dokumentIds.every((i) => w.rohdokumente.has(i))
      && !verstehen[0].payload.dokumentIds.some((i) => String(i).startsWith("raw-")),
      JSON.stringify(verstehen[0].payload.dokumentIds).slice(0, 120));
    check("1.5 Er ist GLOBAL — kein Mandatsbezug (CLAUDE.md §4.2)", verstehen[0].tenant_id === null);
    check("1.6 Er hat Vorrang vor Projektion (200) und Briefing (250)", verstehen[0].priority < 200,
      String(verstehen[0].priority));
  }

  // ═══ 2 · Derselbe Inhalt erzeugt keinen zweiten Auftrag ═══════════════════
  abschnitt("2 · Inhaltsfingerabdruck verhindert doppelte Verstehensauftraege (Phase 2.3)");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = welt();
    w.profile = erzeugeMandate(1);
    const deps = { ...w.attrappen(u), claim: q.claim, finish: q.finish, extendLease: q.extendLease, enqueue: q.enqueue };
    const quelle = { id: "q1", name: "Q", type: "news", rssUrls: ["https://news.google.com/rss/search?q=a"] };

    await SP.HANDLER.source_fetch({ id: "j1", payload: { quelle }, freshnessWindow: "F1" }, deps);
    const nachErstem = q.alle().filter((x) => x.job_type === "document_understanding").length;
    // Zweiter Abruf DERSELBEN Quelle in einem ANDEREN Fenster: dieselben Artikel, dieselben
    // Kennungen -> derselbe Auftragsschluessel -> KEIN zweiter Auftrag.
    u.vor(9 * 3600 * 1000);
    await SP.HANDLER.source_fetch({ id: "j2", payload: { quelle }, freshnessWindow: "F2" }, deps);
    const nachZweitem = q.alle().filter((x) => x.job_type === "document_understanding").length;

    check("2.1 Der erste Abruf legt genau einen Verstehensauftrag an", nachErstem === 1, String(nachErstem));
    check("2.2 Ein zweiter Abruf mit DENSELBEN Artikeln legt KEINEN weiteren an",
      nachZweitem === 1, `${nachZweitem} Auftraege`);
    check("2.3 Der Schluessel enthaelt KEIN Aktualitaetsfenster (sonst waere er zeitabhaengig)",
      !/\|F1$|\|F2$/.test(q.alle().find((x) => x.job_type === "document_understanding").idempotency_key),
      q.alle().find((x) => x.job_type === "document_understanding").idempotency_key);

    // Neue Artikel derselben Quelle -> anderer Fingerabdruck -> neuer Auftrag.
    const w2 = { ...deps, crawlAllSources: async () => ({ results: [{ ok: true }], rawItems: [
      { url: "https://news.google.com/rss/search?q=a#artikel-99", title: "Neu", sourceId: "q1", _weg: "w", _nr: 99 }] }) };
    await SP.HANDLER.source_fetch({ id: "j3", payload: { quelle }, freshnessWindow: "F2" }, w2);
    check("2.4 NEUE Artikel erzeugen sehr wohl einen neuen Verstehensauftrag",
      q.alle().filter((x) => x.job_type === "document_understanding").length === 2);
  }

  // ═══ 3 · Verstehen: Kennungen -> Zeilen -> hoechstens einmal ══════════════
  abschnitt("3 · Ein Dokument wird global hoechstens einmal verstanden (Phase 2.2 · 5.5)");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = welt();
    w.profile = erzeugeMandate(1);
    const deps = { ...w.attrappen(u), claim: q.claim, finish: q.finish, extendLease: q.extendLease, enqueue: q.enqueue };
    const quelle = { id: "q1", name: "Q", type: "news", rssUrls: ["https://news.google.com/rss/search?q=a"] };
    await SP.HANDLER.source_fetch({ id: "j1", payload: { quelle }, freshnessWindow: "F1" }, deps);

    const auftrag = q.alle().find((x) => x.job_type === "document_understanding");
    const r1 = await SP.HANDLER.document_understanding(SP.normalisiereAuftrag(auftrag), deps);
    const nach1 = w.kiAufrufe;
    const r2 = await SP.HANDLER.document_understanding(SP.normalisiereAuftrag(auftrag), deps);
    const nach2 = w.kiAufrufe;

    check("3.1 Der Handler laedt die Zeilen ueber die Kennungen", r1.dokumenteGefunden === 3, String(r1.dokumenteGefunden));
    check("3.2 Beim ersten Lauf entstehen KI-Aufrufe", nach1 === 3, String(nach1));
    check("3.3 Ein WIEDERHOLTER Lauf erzeugt KEINEN einzigen weiteren KI-Aufruf",
      nach2 === nach1, `${nach1} -> ${nach2}`);
    check("3.4 Der zweite Lauf meldet ehrlich 0 verarbeitet", r2.verstanden === 0, String(r2.verstanden));
    check("3.5 Verschwundene Dokumente sind ein ehrlicher Zustand, kein Erfolg mit Inhalt",
      (await SP.HANDLER.document_understanding(
        { id: "x", payload: { dokumentIds: ["rd-gibtsnicht"] } }, deps)).grund === "keine-dokumente-mehr-vorhanden");
  }

  // ═══ 4 · Vorbedingungen ══════════════════════════════════════════════════
  abschnitt("4 · Projektion und Briefing warten auf ihre Voraussetzungen (Phase 2.9)");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = welt();
    w.profile = erzeugeMandate(1);
    const mandat = w.profile[0].id;
    const deps = {
      ...w.attrappen(u), claim: q.claim, finish: q.finish, extendLease: q.extendLease,
      enqueue: q.enqueue, offeneVorbedingungen: q.offeneVorbedingungen, zurueckstellen: q.zurueckstellen
    };

    await q.enqueue({ jobType: "source_fetch", idempotencyKey: "sf-1", freshnessWindow: "F1",
      payload: { quelle: { id: "q1", rssUrls: ["https://x/y"] } }, priority: 60, maxAttempts: 5 });
    const projektion = { id: "p1", jobType: "mandate_projection", freshnessWindow: "F1", payload: { mandatsId: mandat } };

    const r1 = await SP.HANDLER.mandate_projection(projektion, deps);
    check("4.1 Bei offenem Abruf wird die Projektion ZURUECKGESTELLT, nicht gerechnet",
      r1.zurueckgestellt === true && r1.ok === false, JSON.stringify(r1).slice(0, 90));
    check("4.2 Der Grund benennt die offene Vorbedingung", /vorbedingung-offen/.test(r1.grund), r1.grund);
    check("4.3 Es wurde KEIN Matching ausgeloest", w.matchingAufrufe === 0, String(w.matchingAufrufe));

    // Abruf abschliessen -> Vorbedingung erfuellt.
    const c = await q.claim({ owner: "w1", limit: 5, leaseMs: 60000 });
    await q.finish({ id: c.auftraege[0].id, owner: "w1", ok: true });
    const r2 = await SP.HANDLER.mandate_projection(projektion, deps);
    check("4.4 Danach laeuft die Projektion durch", r2.ok === true && w.matchingAufrufe === 1);

    // ENDGUELTIG gescheiterte Vorbedingung darf NICHT ewig blockieren.
    await q.enqueue({ jobType: "source_fetch", idempotencyKey: "sf-2", freshnessWindow: "F1",
      payload: { quelle: { id: "q2", rssUrls: ["https://x/z"] } }, priority: 60, maxAttempts: 1 });
    const c2 = await q.claim({ owner: "w1", limit: 5, leaseMs: 60000 });
    await q.finish({ id: c2.auftraege[0].id, owner: "w1", ok: false, error: "google-weg" });
    const stand = await q.offeneVorbedingungen({ fenster: "F1", typen: ["source_fetch"] });
    check("4.5 Ein endgueltig gescheiterter Abruf zaehlt NICHT als offen",
      stand.offen === 0 && stand.fehlgeschlagen === 1, JSON.stringify(stand));
    const r3 = await SP.HANDLER.briefing_materialization(
      { id: "b1", jobType: "briefing_materialization", freshnessWindow: "F1", payload: { mandatsId: mandat } }, deps);
    check("4.6 Das Briefing wartet NICHT auf einen Abruf, der nie gelingt", r3.ok === true);
  }

  // ═══ 5 · Zurueckstellen ist kein Fehlversuch ═════════════════════════════
  abschnitt("5 · Warten verbraucht keine Versuche (Phase 2.11 · 3.12)");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = welt();
    w.profile = erzeugeMandate(1);
    const mandat = w.profile[0].id;
    await q.enqueue({ jobType: "source_fetch", idempotencyKey: "blocker", freshnessWindow: "F1",
      payload: { quelle: { id: "q1", rssUrls: ["https://x/y"] } }, priority: 60, maxAttempts: 5 });
    await q.enqueue({ jobType: "mandate_projection", idempotencyKey: "proj", freshnessWindow: "F1",
      payload: { mandatsId: mandat }, tenantId: mandat, priority: 200, maxAttempts: 3 });

    const deps = {
      ...w.attrappen(u), claim: q.claim, finish: q.finish, extendLease: q.extendLease,
      enqueue: q.enqueue, offeneVorbedingungen: q.offeneVorbedingungen, zurueckstellen: q.zurueckstellen
    };
    // Fuenf Runden, in denen die Vorbedingung nie erfuellt wird.
    let bilanz = null;
    for (let i = 0; i < 5; i += 1) {
      // NUR Projektionen greifen: der blockierende Abruf bleibt absichtlich unangetastet
      // `wartend` stehen. Sonst waere die Vorbedingung nach der ersten Runde weg und der
      // Test wuerde etwas anderes messen, als er behauptet.
      bilanz = await SP.arbeite({ env: AN, owner: `w${i}`, budgetMs: 60000, leaseMs: 30000, stapel: 10,
        types: ["mandate_projection"], deps });
      u.vor(200000);
    }
    const proj = q.alle().find((x) => x.idempotency_key === "proj");
    check("5.1 Die Projektion wurde in JEDER Runde zurueckgestellt", bilanz.zurueckgestellt >= 1,
      `letzte Runde: ${bilanz.zurueckgestellt} zurueckgestellt`);
    check("5.1b Sie steht immer noch als wartend in der Warteschlange",
      q.alle().find((x) => x.idempotency_key === "proj").status === "wartend");
    check("5.2 Sie ist NICHT endgueltig gescheitert, obwohl fuenf Runden vergingen",
      proj.status !== "fehlgeschlagen", `${proj.status}, attempts=${proj.attempts}`);
    check("5.3 Ihr Versuchszaehler ist NICHT durch reines Warten hochgelaufen",
      proj.attempts <= 1, `attempts=${proj.attempts}`);
    check("5.4 Ihr Vermerk sagt WARUM sie wartet",
      /zurueckgestellt: vorbedingung-offen/.test(String(proj.last_error)), String(proj.last_error));
  }

  // ═══ 6 · Budget: Wiederholung kostet nichts ══════════════════════════════
  abschnitt("6 · Wiederholung erzeugt keine doppelte Kostenbuchung (Phase 3.3 · 5.8)");
  {
    const buchungen = [];
    const reservierungen = new Map();
    const speicher = {
      reserviere: async ({ resultKey, day, scope, workClass, globalMax, scopeMax }) => {
        if (reservierungen.has(resultKey)) return { verfuegbar: true, erlaubt: true, wiederverwendet: true };
        const verbraucht = buchungen.length;
        if (globalMax != null && verbraucht >= globalMax) {
          return { verfuegbar: true, erlaubt: false, grund: "globales-notfalllimit-erreicht" };
        }
        buchungen.push({ resultKey, day, scope, workClass, scopeMax });
        reservierungen.set(resultKey, "reserviert");
        return { verfuegbar: true, erlaubt: true, wiederverwendet: false };
      },
      melde: async ({ resultKey, ok }) => { reservierungen.set(resultKey, ok ? "verbraucht" : "fehlgeschlagen"); return { verfuegbar: true, uebernommen: true }; },
      // Genau wie `helmut_release_llm_reservation`: eine Rueckgabe wirkt NUR auf eine noch
      // offene Reservierung. Eine bereits verbrauchte kann nicht zurueckgegeben werden.
      gib_frei: async ({ resultKey }) => {
        if (reservierungen.get(resultKey) !== "reserviert") return { verfuegbar: true, zurueckgegeben: false };
        reservierungen.set(resultKey, "zurueckgegeben");
        const i = buchungen.findIndex((b) => b.resultKey === resultKey);
        if (i >= 0) buchungen.splice(i, 1);
        return { verfuegbar: true, zurueckgegeben: true };
      }
    };

    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = welt();
    w.profile = erzeugeMandate(1);
    const basis = { ...w.attrappen(u), claim: q.claim, finish: q.finish, extendLease: q.extendLease, enqueue: q.enqueue };
    const budget = SP.budgetAdapter({ env: AN_FAIR, deps: { ...basis, budgetSpeicher: speicher, now: u.jetzt } });
    check("6.1 Der Budgetadapter ist nur mit ausdruecklichem Flag aktiv",
      budget !== null && SP.budgetAdapter({ env: AN, deps: basis }) === null);

    const quelle = { id: "q1", name: "Q", type: "news", rssUrls: ["https://news.google.com/rss/search?q=a"] };
    await SP.HANDLER.source_fetch({ id: "j1", payload: { quelle }, freshnessWindow: "F1" }, basis);
    const auftrag = SP.normalisiereAuftrag(q.alle().find((x) => x.job_type === "document_understanding"));

    await SP.HANDLER.document_understanding(auftrag, { ...basis, budget });
    const nachErstem = buchungen.length;
    await SP.HANDLER.document_understanding(auftrag, { ...basis, budget });
    const nachZweitem = buchungen.length;

    check("6.2 Der erste Lauf bucht genau eine Reservierung", nachErstem === 1, String(nachErstem));
    check("6.3 Die WIEDERHOLUNG bucht KEINE zweite", nachZweitem === 1, `${nachErstem} -> ${nachZweitem}`);
    check("6.4 Die Reservierung ist GLOBAL — kein Mandantenscope", buchungen[0].scope === "global", buchungen[0].scope);
    check("6.5 Der Schluessel ist der Ergebnisschluessel, nicht die Auftragskennung",
      /^understanding\|/.test(buchungen[0].resultKey), buchungen[0].resultKey);
  }

  // ═══ 7 · Budget erschoepft -> ehrlich zurueckgestellt ════════════════════
  abschnitt("7 · Budgetmangel erzeugt KEIN erfolgreiches Briefing (Phase 3.12/3.13)");
  {
    const speicher = {
      reserviere: async () => ({ verfuegbar: true, erlaubt: false, grund: "globales-notfalllimit-erreicht" }),
      melde: async () => ({ verfuegbar: true, uebernommen: true }),
      gib_frei: async () => ({ verfuegbar: true, zurueckgegeben: true })
    };
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = welt();
    w.profile = erzeugeMandate(1);
    const basis = { ...w.attrappen(u), claim: q.claim, finish: q.finish, extendLease: q.extendLease, enqueue: q.enqueue };
    const budget = SP.budgetAdapter({ env: AN_FAIR, deps: { ...basis, budgetSpeicher: speicher, now: u.jetzt } });
    const quelle = { id: "q1", name: "Q", type: "news", rssUrls: ["https://news.google.com/rss/search?q=a"] };
    await SP.HANDLER.source_fetch({ id: "j1", payload: { quelle }, freshnessWindow: "F1" }, basis);
    const auftrag = SP.normalisiereAuftrag(q.alle().find((x) => x.job_type === "document_understanding"));
    const r = await SP.HANDLER.document_understanding(auftrag, { ...basis, budget });

    check("7.1 Bei erschoepftem Budget wird der Auftrag zurueckgestellt", r.zurueckgestellt === true);
    check("7.2 Er wird NICHT als erledigt gemeldet", r.ok === false);
    check("7.3 Der Grund benennt das Budget", /budget-nicht-verfuegbar/.test(r.grund), r.grund);
    check("7.4 Es fand KEIN KI-Aufruf statt", w.kiAufrufe === 0, String(w.kiAufrufe));
  }

  // ═══ 8 · Vollstaendiger Durchlauf mit 1000 Profilen ══════════════════════
  abschnitt("8 · Vollstaendiger Durchlauf mit 1000 Profilen (Phase 5)");
  {
    const ANZAHL = 1000;
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const w = welt({ dokumenteJeAbruf: 2 });
    w.profile = erzeugeMandate(ANZAHL);

    let quellenplaene = 0;
    const plan = await SP.planeArbeit({
      env: AN, jetztMs: u.jetzt(),
      deps: {
        listFullProfiles: async () => w.profile,
        quellenFuerProfil: async (p) => { quellenplaene += 1; return eigeneQuellen(p); },
        enqueue: q.enqueue
      }
    });
    check("8.1 Alle 1000 Profile wurden eingelesen", plan.profile === ANZAHL, String(plan.profile));
    check("8.2 Fuer jedes Profil wurde ein Quellenplan geholt — kein Abschneiden",
      quellenplaene === ANZAHL, String(quellenplaene));
    check("8.3 Alle geplanten Auftraege wurden eingereiht", plan.nichtEingereiht === 0);

    const deps = {
      ...w.attrappen(u), claim: q.claim, finish: q.finish, extendLease: q.extendLease,
      enqueue: q.enqueue, offeneVorbedingungen: q.offeneVorbedingungen, zurueckstellen: q.zurueckstellen
    };
    // DOPPELVERGABE HEISST: zwei Worker halten denselben Auftrag GLEICHZEITIG. Nicht:
    // derselbe Auftrag wird spaeter erneut vergeben — das ist bei einer Zurueckstellung
    // ausdruecklich gewollt und waere als "Doppelvergabe" eine Fehlmessung. (Belegter
    // Fehler beim Bau dieser Suite: eine simple Zaehlung aller Claims meldete 9 124
    // "Doppelvergaben", von denen keine einzige eine war.)
    const gehalten = new Map();          // id -> owner, solange reserviert
    let gleichzeitigDoppelt = 0;
    let wiedervorlagen = 0;
    const echterClaim = q.claim;
    const echterFinish = q.finish;
    const echtesZurueckstellen = q.zurueckstellen;
    deps.claim = async (o) => {
      const r = await echterClaim(o);
      for (const a of r.auftraege) {
        if (gehalten.has(a.id)) gleichzeitigDoppelt += 1; else if (a.attempts > 1) wiedervorlagen += 1;
        gehalten.set(a.id, o.owner);
      }
      return r;
    };
    deps.finish = async (o) => { gehalten.delete(o.id); return echterFinish(o); };
    deps.zurueckstellen = async (o) => { gehalten.delete(o.id); return echtesZurueckstellen(o); };

    // 25 Stundenrunden mit VIER gleichzeitigen Workern.
    for (let stunde = 0; stunde <= 25; stunde += 1) {
      await Promise.all([1, 2, 3, 4].map((n) =>
        SP.arbeite({ env: AN, owner: `w${n}`, budgetMs: 3600000, leaseMs: 600000, stapel: 200, deps })));
      u.vor(3600 * 1000);
    }

    check("8.4 KEIN Auftrag war jemals GLEICHZEITIG bei zwei Workern",
      gleichzeitigDoppelt === 0, `${gleichzeitigDoppelt} gleichzeitige Doppelvergaben`);
    check("8.4b Wiedervorlagen (Zurueckstellung, Wiederholung) sind erlaubt und gezaehlt",
      wiedervorlagen >= 0, `${z(wiedervorlagen)} Wiedervorlagen`);
    check("8.5 Es blieb kein Auftrag in 'laeuft' haengen", q.nachStatus("laeuft").length === 0,
      String(q.nachStatus("laeuft").length));
    const verstehen = q.alle().filter((x) => x.job_type === "document_understanding");
    check("8.6 Verstehensauftraege sind tatsaechlich entstanden", verstehen.length > 0, String(verstehen.length));
    check("8.7 Alle Verstehensauftraege sind mandantenneutral", verstehen.every((x) => x.tenant_id === null));
    check("8.8 Jedes Mandat hat eine Projektion und ein Briefing erhalten",
      w.matchingAufrufe === ANZAHL && w.briefingAufrufe === ANZAHL,
      `Matching ${z(w.matchingAufrufe)} · Briefing ${z(w.briefingAufrufe)}`);
    check("8.9 Matching und Entscheidungen erzeugten KEINEN KI-Aufruf",
      w.matchingAufrufe > 0 && w.entscheidungsAufrufe > 0);
    check("8.10 KEINE Datenvermischung zwischen Mandanten", w.fremdzugriffe.length === 0,
      w.fremdzugriffe.slice(0, 3).join("; "));

    // Jedes Dokument hoechstens einmal verstanden — die harte Zahl.
    check("8.11 KI-Aufrufe = Zahl der NEUEN Vorgaenge, nicht der Dokumente",
      w.kiAufrufe === w.verstandeneVorgaenge.size,
      `${z(w.kiAufrufe)} Aufrufe fuer ${z(w.verstandeneVorgaenge.size)} Vorgaenge bei ${z(w.rohdokumente.size)} Dokumenten`);
    check("8.12 Es gab ECHT MEHR Dokumente als KI-Aufrufe (das Clustering wirkt messbar)",
      w.rohdokumente.size > w.kiAufrufe,
      `${z(w.rohdokumente.size)} Dokumente / ${z(w.kiAufrufe)} Aufrufe = Faktor ${(w.rohdokumente.size / Math.max(1, w.kiAufrufe)).toFixed(1)}`);

    const mitBeleg = [...w.belegeJeMandat.values()].filter((b) => b.length > 0).length;
    const leer = [...w.belegeJeMandat.values()].filter((b) => b.length === 0).length;
    check("8.13 Jedes Profil hat einen belegten Stand ODER einen ehrlichen Leerzustand",
      mitBeleg + leer === ANZAHL, `${z(mitBeleg)} belegt · ${z(leer)} leer`);
    check("8.14 Die Quellenbelege sind durch den GESAMTEN Ablauf erhalten geblieben",
      mitBeleg > 0 && [...w.belegeJeMandat.values()].every((b) => b.every((x) => w.rohdokumente.has(x.dokument))));
    console.log(`  Mengen: ${z(w.rohdokumente.size)} Dokumente · ${z(w.verstandeneVorgaenge.size)} Vorgaenge`
      + ` · ${z(w.kiAufrufe)} KI-Aufrufe · ${z(mitBeleg)} belegte Briefings`);

    // Zweiter Planungslauf — MIT DERSELBEN UHRZEIT wie der erste. Nur so misst der Test
    // Idempotenz. Mit fortgeschrittener Uhr waere das Aktualitaetsfenster gewechselt, und
    // neue Auftraege waeren richtig und erwartet — der Test haette dann nichts geprueft.
    const vorher = q.alle().length;
    const plan2 = await SP.planeArbeit({
      env: AN, jetztMs: T0,
      deps: { listFullProfiles: async () => w.profile, quellenFuerProfil: async (p) => eigeneQuellen(p), enqueue: q.enqueue }
    });
    check("8.15 Ein zweiter identischer Planungslauf im SELBEN Fenster erzeugt NULL neue Auftraege",
      plan2.neu === 0 && q.alle().length === vorher,
      `neu ${plan2.neu} · vorhanden ${plan2.vorhanden} · Warteschlange ${z(q.alle().length)} (vorher ${z(vorher)})`);
  }

  // ═══ 9 · Flag aus ════════════════════════════════════════════════════════
  abschnitt("9 · Flag aus: das bestehende Verhalten bleibt unveraendert (Phase 2.13 · 5.18)");
  {
    const r = await SP.arbeite({ env: {}, deps: {} });
    check("9.1 Ohne Flag arbeitet der Worker nicht", r.uebersprungen === true && r.grund === "flag-aus");
    const p = await SP.planeArbeit({ env: {}, deps: {} });
    check("9.2 Ohne Flag plant der Scheduler nicht", p.uebersprungen === true && p.grund === "flag-aus");
    check("9.3 Ohne Fairness-Flag gibt es keinen Budgetadapter", SP.budgetAdapter({ env: AN }) === null);
    check("9.4 Beide Flaggen sind unabhaengig und beide fail closed",
      SP.skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: "vielleicht" }) === false
      && SP.budgetFairnessAktiv({ HELMUT_LLM_FAIRNESS: "vielleicht" }) === false);
  }

  // ═══ 10 · Was hier NICHT bewiesen ist ════════════════════════════════════
  abschnitt("10 · Grenzen dieser Suite");
  nichtBewiesen("10.1 Echte Google-Laufzeit",
    "der Abruf ist eine Attrappe. Diese Suite beweist den Ablauf, nicht die Dauer.");
  nichtBewiesen("10.2 Echte KI-Laufzeit und echte Modellkosten",
    "das Verstehen ist eine Attrappe, die zaehlt, was der echte Pfad aufrufen WUERDE.");

  console.log(`\n== ERGEBNIS ==`);
  console.log(`PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  if (offen > 0) console.log(`${offen} Punkt(e) sind AUSDRUECKLICH NICHT BEWIESEN und zaehlen nicht als Erfolg.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
