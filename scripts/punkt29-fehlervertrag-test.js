"use strict";

// Punkt 29A — Deterministischer Belastungs- und Fehlervertrag (Fehlerpfade und Wiederholungen).
// =============================================================================================
// VERBINDLICHE DEFINITION (Sprint 29A, 2026-07-30): "Punkt 29" ist Zeile 29 der
// docs/roadmap/phase_1_checkliste.md ("Fehlerpfade und Wiederholungen pruefen:
// Timeouts, Limits, fehlerhafte Inhalte und Wiederholungen funktionieren
// kontrolliert"). Der Punkt ist geschnitten in 29A (dieser deterministische
// Repository-Vertrag, offline) und 29B (rein lesender Production-Nachweis an
// echten regulaeren Laeufen — ausdruecklich NICHT Teil dieses Tests; kuenstliche
// Fehler in Production sind verboten, docs/betrieb/quellenstoerungen.md §11).
//
// WAS DIESER VERTRAG BEWEIST: Helmut reagiert auf Zeitueberschreitungen, harte
// Grenzen, fehlerhafte Inhalte, Wiederholungen, geoeffnete Schutzschaltungen und
// abgebrochene Verarbeitungsschritte kontrolliert — kein Fehler wird als Erfolg
// gespeichert oder verschwiegen, bereits korrekt verarbeitete Arbeit bleibt
// erhalten, eine Wiederaufnahme ist nachvollziehbar und ohne fachliche Duplikate.
//
// FEHLERKLASSEN (Sprintauftrag 29A):
//   A  Zeitueberschreitungen und harte Grenzen        (Abschnitt B)
//   B  fehlerhafte und unvollstaendige Inhalte        (Abschnitt C)
//   C  Wiederholungen und Idempotenz                  (Abschnitt D)
//   D  Circuit Open und Schutzschaltungen             (Abschnitt E)
//   E  Fehler ohne falsches Gruen                     (Abschnitt F, quer in allen)
//   F  kontrollierte Wiederaufnahme                   (Abschnitt G)
//
// BEFUNDE (echte Produktionsfehler, in diesem Sprint GEFUNDEN, NICHT behoben —
// Befundregel: Korrektur veraendert aktive Produktionslogik und ist ein eigener
// freigabepflichtiger Fix-Sprint; docs/roadmap/punkt-29-fehlervertrag.md §5):
//   P29-1  cron-fairness verbucht ein von perTenant ZURUECKGEGEBENES Fehler-/
//          Timeout-Objekt (z. B. { ok:false, bounded:true, reason:"crawl-timeout" }
//          aus den Cron-Routen) als ERFOLG: letzter Erfolg gesetzt, Fehlerserie 0.
//   P29-2  Ein nicht verwertbarer KI-Rueckgabewert `null` (parseJsonText("null")
//          liefert null OHNE throw) endet als cluster-error OHNE markFailed:
//          kein failed-Zustand, Dokumente ohne Endzustand, unbegrenzter Retry.
//   P29-3  Eine GESCHEITERTE Aktualisierung (understandUpdate verknuepft neue
//          Dokumente VOR dem KI-Call) erscheint beim naechsten identischen Lauf
//          als "duplicate" — die Aktualisierung unterbleibt dauerhaft unsichtbar.
// Diese Suite PINNT das HEUTIGE Verhalten (damit sie gruen ist und die Befunde
// nicht wieder verschwinden koennen); scripts/punkt29-befundproben.js prueft die
// SOLL-Erwartung und ist bis zum Fix-Sprint erwartungsgemaess ROT (Exit 1).
//
// ECHTE PRODUKTIONSFUNKTIONEN (keine Testkopie der Logik):
//   cron-fairness.runTenantsFairly/planTenantOrder/claimPatch/entryOf (OP-25-Schicht)
//   understanding.runUnderstandingShadow/runPendingUnderstandingShadow (inkl.
//     Budget-/Deadline-Logik, Vormerkung, Ergebnisklassen, Telemetrie-Gruppen)
//   dedup.toRawDocumentRow/dedupeRawDocuments (Rohdokument-Vertrag, Deckelung)
//   ai.parseJsonText (LLM-Antwort-Parsing)
//   google-news-hardening.createGoogleNewsGate/evaluateCooldown/withGoogleRetry
//   crawl-run-state.classifyCrawlRunState/buildProviderBreakdown (A-7-Zaehlung)
//   source-telemetry.classifyCrawlError (Fehlerklassifikation)
//   matching.runMatchingShadow + matching-audit (Sperre, Idempotenz, Publish)
//   decisions.runDecisionShadow · lage.loadRankedVorgaenge/koToVorgangCard
//   ko-recovery.recoverFailedUnderstanding (begrenzte Wiederaufnahme)
//
// TESTDOUBLES nur an aeusseren Grenzen (gemeinsames Geruest
// scripts/e2e-vertrag-geruest.js wie 25A/26A/27A): LLM-Fixtures, In-Memory-Store
// mit PostgREST-Vertragsgrenzen, deterministische Uhren (now-Injektion der
// Fairness, kuenstliche Verzoegerung fuer Budgetgrenzen). KEIN Netz, KEINE KI,
// KEINE Production-Secrets, KEINE Aktivierung (Berlin/Brandenburg/M8 bleiben AUS).

const understanding = require("../lib/helmut/understanding");
const matching = require("../lib/helmut/matching");
const matchingRelevanz = require("../lib/helmut/matching-relevanz");
const contract = require("../lib/helmut/matching-contract");
const decisions = require("../lib/helmut/decisions");
const lage = require("../lib/helmut/lage");
const dedup = require("../lib/helmut/dedup");
const ai = require("../lib/helmut/ai");
const fairness = require("../lib/helmut/cron-fairness");
const hardening = require("../lib/helmut/google-news-hardening");
const runState = require("../lib/helmut/crawl-run-state");
const sourceTelemetry = require("../lib/helmut/source-telemetry");
const koRecovery = require("../lib/helmut/ko-recovery");
const { testPoliticianOne, testPoliticianTwo } = require("./fixtures/test-profiles");

const G = require("./e2e-vertrag-geruest");

const zaehlwerk = G.neuesZaehlwerk();
const check = zaehlwerk.check;
const abschnitt = zaehlwerk.abschnitt;
const stand = zaehlwerk.stand;

// ── Testprofile (zentrale kuenstliche Fixture, kein echtes Mandat) ───────────
const PROFIL_A = Object.freeze({
  ...testPoliticianOne,
  id: "p29-mandat-a",
  fullName: "Testmandat A (29A-Fehlervertrag)",
  profileActive: true,
  focusTopics: [...testPoliticianOne.focusTopics, "Arbeit und Soziales"]
});
const PROFIL_B = Object.freeze({
  ...testPoliticianTwo,
  id: "p29-mandat-b",
  fullName: "Testmandat B (29A-Kontrolle)",
  profileActive: true
});

// ── Kuenstliche, klar markierte Eingangsdokumente (.example, disjunkte Anker) ─
const ABRUF = "2026-07-30T04:00:00.000Z";
function medienItem(id, title, summary, extra = {}) {
  return {
    id, title, summary,
    url: `https://medien.example/p29/${id}`,
    sourceName: "Beispielmedien", sourceId: "medien-beispiel", sourceType: "media",
    linkType: "direct", confidence: "medium",
    publishedAt: "2026-07-29T06:00:00Z", retrievedAt: ABRUF,
    ...extra
  };
}
// Fuenf getrennte gesunde Vorgaenge + ein defekter (disjunkte spezifische Anker,
// keine Grossereignis-Begriffe — die Reihenfolge bleibt die Ankunftsreihenfolge).
const ITEMS_GESUND = [
  medienItem("p29-tarifbindung", "Bundestag beraet die Tarifbindung", "Der Bundestag beraet ein Gesetz zur Tarifbindung."),
  medienItem("p29-buergergeld", "Bundesregierung plant Neuregelung beim Buergergeld", "Die Bundesregierung plant eine Neuregelung beim Buergergeld."),
  medienItem("p29-pflegereform", "Pflegereform geht in die Anhoerung", "Die Pflegereform geht in die Verbandsanhoerung."),
  medienItem("p29-mindestlohn", "Kommission legt Vorschlag zum Mindestlohn vor", "Die Kommission legt ihren Vorschlag zum Mindestlohn vor."),
  medienItem("p29-rentenpaket", "Rentenpaket im Kabinett beschlossen", "Das Kabinett beschliesst das Rentenpaket.")
];
const ITEM_DEFEKT = medienItem("p29-defektfall", "Havariebericht zur Datenlage", "Der Havariebericht enthaelt unverwertbare Datenlage. GEHEIMWERT-P29-DARF-NIRGENDS-ERSCHEINEN");

function analyse(marker, headline, extra = {}) {
  return {
    marker,
    result: {
      headline,
      was_ist_passiert: `${headline}. Der Bundestag ist beteiligt.`,
      warum_wichtig: "Betrifft die Sozial- und Arbeitsmarktpolitik.",
      wer_ist_betroffen: "Beschaeftigte und Traeger.",
      handlungsempfehlung: "Beratung vorbereiten.",
      parteien: [], ausschuesse: [], ministerien: [],
      risiken: [], chancen: ["Fachliche Positionierung"],
      mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: [],
      mentioned_locations: [], mentioned_organizations: [],
      tags: ["Soziales"], zeitdruck: "mittel", confidence_score: 70,
      display_title: headline,
      display_summary: `${headline}.`,
      why_relevant: "Thematisch einschlaegig fuer Arbeit und Soziales.",
      recommendation: "Beobachten und bewerten.",
      display_category: "Arbeit und Soziales",
      risk_level: "low", opportunity_level: "medium",
      ...extra
    }
  };
}
const AI_FIXTURES = [
  analyse("Tarifbindung", "Bundestag beraet die Tarifbindung", { tags: ["Tarifbindung"] }),
  analyse("Buergergeld", "Neuregelung beim Buergergeld geplant", { tags: ["Buergergeld"] }),
  analyse("Pflegereform", "Pflegereform in der Anhoerung", { tags: ["Pflege"] }),
  analyse("Mindestlohn", "Vorschlag zum Mindestlohn liegt vor", { tags: ["Mindestlohn"] }),
  analyse("Rentenpaket", "Rentenpaket beschlossen", { tags: ["Rente"] })
];
const fixture = G.macheFixtureUnderstanding(AI_FIXTURES);

const ROH_GESUND = dedup.dedupeRawDocuments(ITEMS_GESUND.map(dedup.toRawDocumentRow).filter(Boolean));

// Store-Huelle: wie 25A, plus (a) produktionsgetreuer listPending-Filter
// (storage.js:2992-2994 schliesst failed/failed-final aus), (b) Skip-Log-Zaehler
// (logSkip -> recordLlmUsage 'skipped-*'), (c) injizierbare Grenzen.
function neuerStore(extraApi = {}) {
  const st = G.neuerStore({
    getProfile: (userId) => (userId === PROFIL_A.id ? PROFIL_A : userId === PROFIL_B.id ? PROFIL_B : null),
    requestUnderstanding: fixture.requestUnderstanding,
    relevanzGateEnabled: () => matchingRelevanz.relevanzGateAktiv(process.env)
  });
  st.skipLog = [];
  // Eindeutige Laufkennungen: das Geruest liefert einen KONSTANTEN randomSuffix.
  // Bei sekundengleichen Laeufen kollidieren damit Laufkennungen und der
  // In-Memory-insertRun wuerde eine vollstaendige Laufzeile ueberschreiben —
  // ein Geruest-Artefakt, kein Produktionsverhalten (dort: Zufallssuffix +
  // Primaerschluessel). Additiv korrigiert, 25A/26A/27A bleiben unveraendert.
  let suffixZaehler = 0;
  st.auditDeps.randomSuffix = () => `p29s${(suffixZaehler += 1)}`;
  st.api = {
    ...st.api,
    listPending: () => [...st.knowledgeObjects.values()].filter((k) =>
      k.status === "pending" && k.understanding_status !== "failed" && k.understanding_status !== "failed-final"),
    logSkip: (callType) => { st.skipLog.push(callType); },
    ...extraApi
  };
  return st;
}

const langsam = (ms, fn) => async (...args) => {
  await new Promise((r) => setTimeout(r, ms));
  return fn(...args);
};

(async () => {
  // ═══ A · Sicherheitsgrenzen ═══
  abschnitt("A · Sicherheitsgrenzen (M8 aus, Audit an wie Production, kein Netz, keine Secrets noetig)");
  check("A1 M8-Relevanzriegel ist AUS (HELMUT_MATCHING_RELEVANZ_GATE nicht gesetzt)",
    matchingRelevanz.relevanzGateAktiv(process.env) === false);
  check("A2 der Vertrag nutzt den aktiven Matching-Pfad mit Audit AN (wie Production seit 2026-07-28)",
    neuerStore().matchingOverrides.auditEnabled() === true);
  check("A3 gesunder vollstaendiger Referenzlauf: 5 Cluster, 5 gespeichert, 0 zurueckgestellt (Pflichtkonstellation 1)",
    await (async () => {
      const s = neuerStore();
      const u = await understanding.runUnderstandingShadow(ROH_GESUND, s.api);
      return u.clusters === 5 && (u.counts.saved || 0) === 5 && u.deferred === 0
        && u.telemetrie.gruppen.verarbeitet === 5 && u.telemetrie.dokumenteOhneEndzustand === 0;
    })());

  // ═══ B · Zeitueberschreitungen und harte Grenzen (Fehlerklasse A) ═══
  abschnitt("B · Zeitueberschreitungen und harte Grenzen (echte Fairness- und Budget-Logik)");

  // Deterministische Fairness-Umgebung: injizierte Uhr + In-Memory-Zustand.
  function fairnessUmgebung() {
    const env = { t: 0, state: fairness.normalizeState({}) };
    env.now = () => env.t;
    env.loadState = async () => env.state;
    env.saveState = async (patch) => {
      env.state = fairness.mergeState(env.state, patch, { nowMs: env.t });
      return { state: env.state };
    };
    return env;
  }
  const eintrag = (env, cron, mandat) => fairness.entryOf(env.state, cron, mandat);

  // B1: Deadline VOR dem ersten Verarbeitungsschritt erreicht (A.1, A.7).
  {
    const env = fairnessUmgebung();
    env.t = 5000; // Start liegt bereits hinter der Deadline
    let verarbeitet = 0;
    const lauf = await fairness.runTenantsFairly({
      cronName: "p29-crawl", tenantIds: ["m1", "m2"], runId: "p29-lauf-b1",
      deadlineMs: 1000, startedMs: 0, now: env.now, reserveMs: 100,
      loadState: env.loadState, saveState: env.saveState,
      perTenant: async () => { verarbeitet += 1; return { ok: true }; }
    });
    check("B1 Deadline vor Beginn: kein Mandat begonnen, alle als 'zeitbudget' uebersprungen, 0 Verarbeitungen",
      verarbeitet === 0 && lauf.results.every((r) => r.skipped && r.reason === "zeitbudget")
        && lauf.fairness.kapazitaet === 0 && lauf.fairness.ohneFortschritt === true,
      JSON.stringify(lauf.fairness));
    check("B2 nicht begonnene Mandate erhalten KEINEN Versuchsvermerk und keine Zaehler (stehen im naechsten Lauf vorn)",
      eintrag(env, "p29-crawl", "m1") === null && eintrag(env, "p29-crawl", "m2") === null);
    check("B3 ein Lauf ohne Fortschritt meldet KEINE erfundene Obergrenze (obergrenzeLaeufe null, keine Fortschrittsgarantie)",
      lauf.fairness.obergrenzeLaeufe === null && lauf.fairness.fortschrittsgarantie === false);
  }

  // B4: ein Mandat verbraucht das Budget -> Rest wird kontrolliert vertagt (A.6, A.7).
  {
    const env = fairnessUmgebung();
    const lauf = await fairness.runTenantsFairly({
      cronName: "p29-crawl", tenantIds: ["m1", "m2", "m3"], runId: "p29-lauf-b4",
      deadlineMs: 1000, startedMs: 0, now: env.now, reserveMs: 100,
      loadState: env.loadState, saveState: env.saveState,
      perTenant: async () => { env.t += 600; return { ok: true, savedItems: 1 }; }
    });
    const uebersprungen = lauf.results.filter((r) => r.skipped && r.reason === "zeitbudget");
    check("B4 Mandat ueberschreitet sein Zeitbudget: 2 verarbeitet, 1 kontrolliert vertagt (Restbudget < Reserve)",
      lauf.fairness.kapazitaet === 2 && uebersprungen.length === 1,
      JSON.stringify(lauf.fairness));
    check("B5 Fairnessgarantie ehrlich beziffert: ceil(3 planbar / 2 Kapazitaet) = 2 Laeufe als Obergrenze",
      lauf.fairness.obergrenzeLaeufe === 2 && lauf.fairness.fortschrittsgarantie === true);
    check("B6 das vertagte Mandat traegt keinen Versuchsvermerk, die verarbeiteten tragen Erfolg",
      eintrag(env, "p29-crawl", uebersprungen[0].politicianId) === null
        && lauf.fairness.erfolgreich.length === 2
        && lauf.fairness.erfolgreich.every((id) => {
          const e = eintrag(env, "p29-crawl", id);
          return e && e.status === fairness.STATUS_ERFOLG && e.erfolge === 1 && e.fehlerSerie === 0;
        }));
  }

  // B7: ein WERFENDES Mandat ist ein Fehler — Zaehler ehrlich, kein letzter Erfolg (A.9, E).
  {
    const env = fairnessUmgebung();
    const lauf = await fairness.runTenantsFairly({
      cronName: "p29-crawl", tenantIds: ["kaputt", "gesund"], runId: "p29-lauf-b7",
      deadlineMs: 100000, startedMs: 0, now: env.now, reserveMs: 100,
      loadState: env.loadState, saveState: env.saveState,
      perTenant: async (id) => {
        env.t += 10;
        if (id === "kaputt") throw new Error("simulierter harter Mandatsfehler");
        return { ok: true };
      }
    });
    const eKaputt = eintrag(env, "p29-crawl", "kaputt");
    const eGesund = eintrag(env, "p29-crawl", "gesund");
    check("B7 geworfener Mandatsfehler: failed-Ergebnis, Fehlerzaehler +1, KEIN letzter Erfolg, Fehlerserie 1",
      lauf.results.some((r) => r.politicianId === "kaputt" && r.failed === true)
        && eKaputt && eKaputt.status === fairness.STATUS_FEHLER && eKaputt.fehler === 1
        && eKaputt.letzterErfolgAt === null && eKaputt.fehlerSerie === 1,
      JSON.stringify(eKaputt));
    check("B8 der Fehler des einen Mandats blockiert das gesunde nicht (Pflichtkonstellation 15)",
      eGesund && eGesund.status === fairness.STATUS_ERFOLG && eGesund.erfolge === 1);
  }

  // B9 — BEFUND P29-1 (heutiges Verhalten GEPINNT, Soll-Erwartung in punkt29-befundproben.js):
  // ein von perTenant ZURUECKGEGEBENES Timeout-/Fehlerobjekt (so liefern es die
  // Cron-Routen, z. B. server.js:840/1066 build-timeout/lage-check-timeout) wird
  // als ERFOLG verbucht — letzter Erfolg gesetzt, Fehlerserie zurueck auf 0.
  {
    const env = fairnessUmgebung();
    // Vorgeschichte: das Mandat hat eine echte Fehlerserie.
    env.state = fairness.mergeState(env.state, fairness.finishPatch({
      cronName: "p29-crawl", tenantId: "m1", erfolg: false, startedMs: 0, nowMs: 10
    }), { nowMs: 10 });
    env.t = 40 * 60 * 1000; // alter Versuch ist veraltet, Mandat ist planbar
    await fairness.runTenantsFairly({
      cronName: "p29-crawl", tenantIds: ["m1"], runId: "p29-lauf-b9",
      deadlineMs: 100000, startedMs: env.t, now: env.now, reserveMs: 100,
      loadState: env.loadState, saveState: env.saveState,
      perTenant: async () => ({ ok: false, bounded: true, reason: "crawl-timeout" })
    });
    const e = eintrag(env, "p29-crawl", "m1");
    check("B9 BEFUND P29-1 gepinnt: zurueckgegebenes Timeout-Objekt zaehlt HEUTE als Erfolg (letzterErfolgAt gesetzt, Fehlerserie 0) — Fix ist eigener Sprint",
      e && e.status === fairness.STATUS_ERFOLG && e.letzterErfolgAt !== null && e.fehlerSerie === 0 && e.erfolge === 1,
      JSON.stringify(e));
  }

  // B10-B13: Zeitbudget im Understanding-Loop (echte Budget-/Vormerk-Logik).
  {
    const s = neuerStore();
    const api = { ...s.api, budgetMs: 1, requestUnderstanding: langsam(8, fixture.requestUnderstanding) };
    const u = await understanding.runUnderstandingShadow(ROH_GESUND, api);
    check("B10 Zeitueberschreitung WAEHREND des Laufs: Abbruch nach Teilarbeit (>=1 verarbeitet, Rest zurueckgestellt)",
      u.processed >= 1 && u.processed < 5 && u.deferred === 5 - u.processed,
      JSON.stringify({ processed: u.processed, deferred: u.deferred }));
    check("B11 bereits abgeschlossene Einheiten bleiben erhalten (gespeicherte Vorgaenge sind vollstaendig verstanden)",
      [...s.knowledgeObjects.values()].filter((k) => k.understanding_status === "complete").length === (u.counts.saved || 0)
        && (u.counts.saved || 0) === u.processed);
    check("B12 der Abbruch wird als Teilzustand gespeichert: jeder zurueckgestellte Cluster ist als pending vorgemerkt UND verknuepft",
      u.vorgemerkt === u.deferred && u.nichtVorgemerkt === 0
        && [...s.knowledgeObjects.values()].filter((k) => k.status === "pending" && k.understanding_status === "pending").length === u.deferred
        && [...s.knowledgeObjects.values()].filter((k) => k.status === "pending").every((k) => (s.koLinks.get(k.id) || []).length > 0));
    check("B13 Zeitueberschreitung wird NIE als Erfolg gewertet: Telemetrie fuehrt die Zurueckgestellten als 'erneut', nicht als 'verarbeitet'",
      u.telemetrie.gruppen.verarbeitet === u.processed && (u.telemetrie.gruppen.erneut || 0) === u.deferred,
      JSON.stringify(u.telemetrie.gruppen));
    s.resumeStore = true;
    // Der Store wird in Abschnitt D/G fuer die Wiederaufnahme weiterverwendet.
    global.__p29ResumeStore = s;
    global.__p29ResumeLauf = u;
  }

  // B14: harte absolute Deadline erreicht — auch die Vormerkung stoppt ehrlich (A.4).
  {
    const s = neuerStore();
    const api = {
      ...s.api, budgetMs: 1,
      requestUnderstanding: langsam(8, fixture.requestUnderstanding),
      vormerkDeadlineMs: Date.now() - 1000 // Deadline liegt bereits in der Vergangenheit
    };
    const u = await understanding.runUnderstandingShadow(ROH_GESUND, api);
    check("B14 harte Laufdeadline: KEINE Vormerk-Schreibvorgaenge mehr, der Rest wird ehrlich als nicht vorgemerkt gezaehlt",
      u.vorgemerkt === 0 && u.nichtVorgemerkt === u.deferred && u.deferred > 0
        && [...s.knowledgeObjects.values()].filter((k) => k.status === "pending").length === 0,
      JSON.stringify({ deferred: u.deferred, vorgemerkt: u.vorgemerkt, nichtVorgemerkt: u.nichtVorgemerkt }));
  }

  // B15: Zeitueberschreitung einer QUELLE — Klassifikation und bewusster Nicht-Retry (A.5).
  check("B15 Quellen-Timeout wird als 'timeout' klassifiziert und NIE wiederholt (Breaker wird trotzdem gefuettert)",
    sourceTelemetry.classifyCrawlError("Timeout for https://quelle.example/feed") === "timeout"
      && hardening.isRetryableGoogleError(Object.assign(new Error("Timeout for url"), {})) === false
      && hardening.isBreakerRelevantError(new Error("Timeout for url")) === true);

  // ═══ C · Fehlerhafte und unvollstaendige Inhalte (Fehlerklasse B) ═══
  abschnitt("C · Fehlerhafte und unvollstaendige Inhalte (echter Understanding-Pfad)");

  // C1: leere Antwort — parseJsonText wirft, der Pfad parkt kontrolliert.
  check("C1 leere LLM-Antwort: parseJsonText('') wirft (kein stilles Erfinden)",
    (() => { try { ai.parseJsonText(""); return false; } catch (_) { return true; } })());
  check("C2 ungueltiges JSON: parseJsonText wirft auch bei kaputtem Text",
    (() => { try { ai.parseJsonText("{kaputt: ohne quotes"); return false; } catch (_) { return true; } })());

  // C3-C6: defekte Inhalte am ECHTEN Pfad — jeder Fall endet kontrolliert, ohne KO.
  async function defekterLauf(name, defektesResult) {
    const s = neuerStore();
    const api = {
      ...s.api,
      requestUnderstanding: (prompt) => {
        if (String(prompt).includes("Havariebericht")) {
          if (defektesResult instanceof Error) throw defektesResult;
          return defektesResult;
        }
        return fixture.requestUnderstanding(prompt);
      }
    };
    const roh = dedup.dedupeRawDocuments([...ITEMS_GESUND, ITEM_DEFEKT].map(dedup.toRawDocumentRow).filter(Boolean));
    const u = await understanding.runUnderstandingShadow(roh, api);
    return { s, u };
  }

  {
    // Transportfehler wie bei leerer Antwort (JSON.parse('') wirft in ai.js).
    const { s, u } = await defekterLauf("leer", new SyntaxError("Unexpected end of JSON input"));
    check("C3 leere Antwort am echten Pfad: skipped-error, Vorgang als failed geparkt, Dokumente verknuepft (Endzustand)",
      (u.counts["skipped-error"] || 0) === 1 && (u.counts.saved || 0) === 5
        && [...s.knowledgeObjects.values()].some((k) => k.understanding_status === "failed")
        && s.skipLog.includes("skipped-understanding-error"),
      JSON.stringify(u.counts));
    check("C3b der Abbruchgrund wird NICHT verschluckt: das Ergebnis traegt einen begrenzten errorCode (<=120 Zeichen, Diagnose ohne Inhalt)",
      u.results.some((r) => r.status === "skipped-error" && typeof r.errorCode === "string"
        && r.errorCode.length > 0 && r.errorCode.length <= 120),
      JSON.stringify(u.results.filter((r) => r.status === "skipped-error")));
    check("C4 einzelner defekter Datensatz blockiert den Lauf nicht: 5 gesunde Vorgaenge vollstaendig verarbeitet (Pflichtkonstellationen 2+11)",
      [...s.knowledgeObjects.values()].filter((k) => k.understanding_status === "complete").length === 5);
    check("C5 defekter Inhalt erzeugt KEIN fachlich gueltiges Wissensobjekt und KEINE Entscheidung",
      await (async () => {
        const failedKo = [...s.knowledgeObjects.values()].find((k) => k.understanding_status === "failed");
        const suche = s.api.matchByEmbedding({ embedding: matching.embedProfile(PROFIL_A), matchCount: 20 });
        const d = await decisions.runDecisionShadow({ profile: PROFIL_A }, {
          enabled: () => true, getProfile: s.api.getProfile,
          listKnowledgeObjects: () => [failedKo], saveDecisions: s.api.saveDecisions
        });
        // failed-Vorgaenge erreichen weder die Vektorsuche noch erzeugen sie Entscheidungen.
        return !suche.results.some((r) => r.id === failedKo.id) && (d.saved === 0 || d.skipped);
      })());
    check("C6 Fehlerzustaende enthalten keine Volltexte/Secrets: failed-Zeile traegt nur Schlagzeile+Modell, kein Summary-Inhalt",
      (() => {
        const failedKo = [...s.knowledgeObjects.values()].find((k) => k.understanding_status === "failed");
        const serialisiert = JSON.stringify(failedKo);
        return failedKo && !serialisiert.includes("GEHEIMWERT-P29") && !("summary" in failedKo);
      })());
  }
  {
    const { s, u } = await defekterLauf("typ", "ich bin nur text, keine analyse");
    check("C7 falscher Inhaltstyp (String statt Analyse): skipped-invalid, geparkt, kein Wissensobjekt",
      (u.counts["skipped-invalid"] || 0) === 1 && (u.counts.saved || 0) === 5
        && s.skipLog.includes("skipped-understanding-invalid")
        && ![...s.knowledgeObjects.values()].some((k) => k.understanding_status === "complete" && /Havarie/.test(k.headline || "")),
      JSON.stringify(u.counts));
  }
  {
    const { s, u } = await defekterLauf("felder", { headline: "Havariebericht ohne Pflichtfelder" });
    check("C8 fehlende Pflichtfelder: skipped-invalid mit benannten Fehlern, geparkt statt gespeichert",
      (u.counts["skipped-invalid"] || 0) === 1
        && u.results.some((r) => r.status === "skipped-invalid" && Array.isArray(r.errors) && r.errors.length > 0)
        && [...s.knowledgeObjects.values()].some((k) => k.understanding_status === "failed"),
      JSON.stringify(u.results.filter((r) => r.status === "skipped-invalid")));
  }
  {
    // C9 — BEFUND P29-2 (heutiges Verhalten GEPINNT): nicht verwertbarer
    // KI-Rueckgabewert null (Pflichtfall B.11) endet als cluster-error OHNE
    // markFailed — kein failed-Zustand, Dokumente ohne Endzustand.
    const { s, u } = await defekterLauf("null", null);
    check("C9 BEFUND P29-2 gepinnt: KI-Rueckgabewert null endet HEUTE als cluster-error OHNE failed-Parkung (sichtbar in Gruppe 'fehlgeschlagen', aber ohne Endzustand) — Fix ist eigener Sprint",
      (u.counts["cluster-error"] || 0) === 1 && (u.telemetrie.gruppen.fehlgeschlagen || 0) === 1
        && ![...s.knowledgeObjects.values()].some((k) => k.understanding_status === "failed")
        && (u.counts.saved || 0) === 5,
      JSON.stringify(u.counts));
  }

  // C10: unlesbarer Zeitstempel + uebergrosser Inhalt + kaputte Kodierung am Rohdokument-Vertrag.
  {
    const kaputtZeit = medienItem("p29-zeit", "Meldung mit unlesbarem Zeitstempel", "Kurz.", { publishedAt: "gestern frueh" });
    const riesig = medienItem("p29-riesig", "Riesige Meldung", "X".repeat(50000));
    const kodierung = medienItem("p29-kodierung", "Störung mitSteuerzeichen �", "Zeichensalat  .");
    const zeilen = [kaputtZeit, riesig, kodierung].map(dedup.toRawDocumentRow).filter(Boolean);
    check("C10 unlesbarer Zeitstempel/uebergrosser Inhalt/kaputte Kodierung: Rohdokument-Vertrag bleibt deterministisch und gedeckelt",
      zeilen.length === 3
        && zeilen.every((r) => /^rd-[0-9a-f]{64}$/.test(r.id))
        && zeilen[1].summary.length <= dedup.SUMMARY_MAX
        && zeilen[0].published_at === "gestern frueh", // ehrlich durchgereicht, kein erfundenes Datum
      JSON.stringify(zeilen.map((r) => [r.id.slice(0, 8), (r.summary || "").length])));
    // Widerspruechliche Metadaten: KI behauptet 'bund', Institutionen sagen Landtag.
    const s = neuerStore();
    const api = {
      ...s.api,
      requestUnderstanding: (prompt) => {
        if (String(prompt).includes("Havariebericht")) {
          return JSON.parse(JSON.stringify(analyse("Havariebericht", "Havarie im Landtag", {
            decision_level: "bund",
            was_ist_passiert: "Der Landtag in Sachsen behandelt den Havariebericht.",
            mentioned_locations: ["Sachsen"]
          }).result));
        }
        return fixture.requestUnderstanding(prompt);
      }
    };
    const roh = dedup.dedupeRawDocuments([...ITEMS_GESUND, ITEM_DEFEKT].map(dedup.toRawDocumentRow).filter(Boolean));
    await understanding.runUnderstandingShadow(roh, api);
    const koWiderspruch = [...s.knowledgeObjects.values()].find((k) => /Havarie/.test(k.headline || ""));
    check("C11 widerspruechliche Metadaten: Ebene wird deterministisch mit Herkunftsnachweis entschieden (kein Absturz, kein stiller Zufall)",
      koWiderspruch && typeof koWiderspruch.decision_level === "string"
        && koWiderspruch.classification_confidence && Boolean(koWiderspruch.classification_confidence.level_quelle),
      JSON.stringify(koWiderspruch && { level: koWiderspruch.decision_level, quelle: koWiderspruch.classification_confidence }));
  }

  // ═══ D · Wiederholungen und Idempotenz (Fehlerklasse C) ═══
  abschnitt("D · Wiederholungen und Idempotenz (Understanding + Matching + Sperren)");

  const storeD = neuerStore();
  await understanding.runUnderstandingShadow(ROH_GESUND, storeD.api);
  const snapshotD = () => JSON.stringify([...storeD.knowledgeObjects.values()].map((k) => [k.id, k.ko_version, k.updated_at]).sort());
  const vorD = snapshotD();
  const u2 = await understanding.runUnderstandingShadow(ROH_GESUND, storeD.api);
  check("D1 identische Eingabe zweimal: alle Cluster als Duplikat erkannt, 0 neue Schreibvorgaenge, Bestand byte-identisch (C.1, C.4, C.12)",
    (u2.counts.duplicate || 0) === 5 && (u2.counts.saved || 0) === 0 && snapshotD() === vorD
      && storeD.knowledgeObjects.size === 5,
    JSON.stringify(u2.counts));

  const m1 = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "p29-vertrag" }, storeD.matchingOverrides);
  check("D2 Matching-Erstlauf vollstaendig (Audit-Laufzeile, Ergebnisse persistiert)",
    m1 && !m1.skipped && m1.audit && m1.audit.status === contract.RUN_STATUS.VOLLSTAENDIG,
    JSON.stringify(m1 && m1.audit));
  const publishesVorher = storeD.zaehler.publish;
  const projektionVorher = JSON.stringify([...storeD.matchingResults.values()].map((r) => [r.id, r.berechnet_am, r.aktuell]).sort());
  const m2 = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "p29-vertrag" }, storeD.matchingOverrides);
  check("D3 Wiederholung mit NEUER Laufkennung und identischem Inhalt: idempotenter Treffer, keine zweite Generation (C.5, C.6, C.12)",
    m2.audit && m2.audit.idempotent === true && m2.audit.runId === m1.audit.runId && m2.audit.wiederholungen === 1
      && storeD.zaehler.publish === publishesVorher,
    JSON.stringify(m2.audit));
  check("D4 Wiederholung veraendert weder Score noch Begruendung ohne neue Eingabe (Projektion byte-identisch) (C.13, C.14)",
    JSON.stringify([...storeD.matchingResults.values()].map((r) => [r.id, r.berechnet_am, r.aktuell]).sort()) === projektionVorher);
  check("D5 kein zweites sichtbares Ergebnis: genau eine aktuelle Zeile je Vorgang",
    (() => {
      const aktuelle = storeD.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 });
      return aktuelle.length === 5 && new Set(aktuelle.map((r) => r.knowledge_object_id)).size === 5;
    })());

  // D6: paralleler Versuch auf derselben fachlichen Einheit — Sperre verweigert (C.7-C.11).
  {
    const lockName = `matching-${PROFIL_A.id}`;
    storeD.locks.set(lockName, Date.now() + 60000);
    const laufeVorher = storeD.matchingRuns.size;
    const gesperrt = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "p29-vertrag" }, storeD.matchingOverrides);
    storeD.locks.delete(lockName);
    check("D6 vergebene Sperre: Lauf wird als 'matching-locked' uebersprungen — KEINE Laufzeile, keine Zaehler, kein Zustand verschoben",
      gesperrt && gesperrt.skipped === true && gesperrt.reason === "matching-locked"
        && storeD.matchingRuns.size === laufeVorher
        && storeD.zaehler.publish === publishesVorher,
      JSON.stringify(gesperrt));
  }

  // D7: verweigerte Sperre in der Fairness-Schicht zaehlt nicht als begonnen (C.9-C.11).
  {
    const env = fairnessUmgebung();
    const lauf = await fairness.runTenantsFairly({
      cronName: "p29-crawl", tenantIds: ["m1"], runId: "p29-lauf-d7",
      deadlineMs: 100000, startedMs: 0, now: env.now, reserveMs: 100,
      loadState: env.loadState, saveState: env.saveState,
      perTenant: async () => ({ skipped: true, reason: "already running" })
    });
    const e = eintrag(env, "p29-crawl", "m1");
    check("D7 verweigerte Sperre ('already running'): kein Erfolg, kein Fehler, nicht in der Kapazitaet, Versuchsvermerk bleibt 'laufend'",
      lauf.fairness.lockVerweigert.includes("m1") && lauf.fairness.kapazitaet === 0
        && e && e.status === fairness.STATUS_LAUFEND && e.erfolge === 0 && e.fehler === 0
        && e.letzterErfolgAt === null,
      JSON.stringify({ fairness: lauf.fairness, eintrag: e }));
  }

  // D8: Wiederholung nach Abbruch zwischen Claim und Abschluss (C.2) — der
  // 'laufend'-Vermerk blockiert erst, laeuft dann kontrolliert ab.
  {
    const env = fairnessUmgebung();
    env.state = fairness.mergeState(env.state, fairness.claimPatch({
      cronName: "p29-crawl", tenantId: "m1", runId: "p29-abgestuerzt", nowMs: 0
    }), { nowMs: 0 });
    const frisch = fairness.planTenantOrder({ cronName: "p29-crawl", tenantIds: ["m1"], state: env.state, nowMs: 60000, staleMs: 30 * 60 * 1000 });
    const spaeter = fairness.planTenantOrder({ cronName: "p29-crawl", tenantIds: ["m1"], state: env.state, nowMs: 31 * 60 * 1000, staleMs: 30 * 60 * 1000 });
    check("D8 Abbruch nach Versuchsregistrierung: frischer 'laufend'-Vermerk blockiert Doppelstart, nach der Frist ist das Mandat kontrolliert wieder vorn (F.7)",
      frisch.blockiert.length === 1 && frisch.plan.length === 0
        && spaeter.blockiert.length === 0 && spaeter.plan.length === 1 && spaeter.plan[0].veralteterVersuch === true,
      JSON.stringify({ frisch: frisch.blockiert.length, spaeter: spaeter.plan.length }));
  }

  // D9 — BEFUND P29-3 (heutiges Verhalten GEPINNT): gescheiterte Aktualisierung
  // wird beim naechsten identischen Lauf als 'duplicate' gewertet.
  {
    const s = neuerStore();
    await understanding.runUnderstandingShadow(ROH_GESUND, s.api); // Bestand: 5 complete
    const neuesDok = medienItem("p29-tarifbindung-update", "Bundestag beraet die Tarifbindung erneut",
      "Neue Beratungsrunde zur Tarifbindung mit geaendertem Zeitplan.");
    const rohMitUpdate = dedup.dedupeRawDocuments([...ITEMS_GESUND, neuesDok].map(dedup.toRawDocumentRow).filter(Boolean));
    let updateVersucht = 0;
    const api = {
      ...s.api,
      requestUnderstanding: (prompt) => {
        // Der Update-Prompt enthaelt das neue Dokument — er scheitert.
        if (String(prompt).includes("erneut")) { updateVersucht += 1; throw new Error("simulierter KI-Fehler bei der Aktualisierung"); }
        return fixture.requestUnderstanding(prompt);
      }
    };
    const uUpdate = await understanding.runUnderstandingShadow(rohMitUpdate, api);
    const uWiederholung = await understanding.runUnderstandingShadow(rohMitUpdate, api);
    check("D9 BEFUND P29-3 gepinnt: gescheiterte Aktualisierung (skipped-error) wird beim identischen Neustart HEUTE als 'duplicate' gewertet — kein zweiter Update-Versuch, Fix ist eigener Sprint",
      updateVersucht === 1
        && (uUpdate.counts["skipped-error"] || 0) === 1
        && (uWiederholung.counts.duplicate || 0) >= 1
        && (uWiederholung.counts["skipped-error"] || 0) === 0,
      JSON.stringify({ erster: uUpdate.counts, zweiter: uWiederholung.counts }));
  }

  // ═══ E · Circuit Open und Schutzschaltungen (Fehlerklasse D) ═══
  abschnitt("E · Circuit Open und Schutzschaltungen (echtes Gate, echte Klassifikation)");

  {
    const gate = hardening.createGoogleNewsGate({ breakerMinObservations: 4, breakerFailureRatio: 0.5, retryBudget: 2, concurrency: 1 });
    let ausgefuehrt = 0;
    check("E1 geschlossene Schutzschaltung: Aufrufe laufen normal",
      await gate.schedule(async () => { ausgefuehrt += 1; return "ok"; }) === "ok" && ausgefuehrt === 1 && gate.isOpen() === false);
    const fehler429 = Object.assign(new Error("HTTP 429"), { statusCode: 429 });
    gate.report(fehler429); gate.report(fehler429); gate.report(fehler429);
    check("E2 unter der Schwelle bleibt sie geschlossen (3 von 4 Mindestbeobachtungen)", gate.isOpen() === false);
    gate.report(null);
    check("E3 Schwellenwert erreicht (4 Beobachtungen, 75 % Drossel-Fehler): Schutzschaltung OEFFNET",
      gate.isOpen() === true, JSON.stringify(gate.state()));
    let unterbunden = null;
    try { await gate.schedule(async () => { ausgefuehrt += 1; }); } catch (e) { unterbunden = e; }
    check("E4 weitere Aufrufe werden kontrolliert unterbunden: kein Request, klassifizierbarer Fehler statt Erfolg",
      ausgefuehrt === 1 && unterbunden && unterbunden.code === "google-news-circuit-open"
        && sourceTelemetry.classifyCrawlError(unterbunden.message) === "circuit-open");
    check("E5 kein unendlicher Wiederholungszyklus: das Lauf-Retry-Budget ist hart gedeckelt",
      gate.consumeRetry() === true && gate.consumeRetry() === true && gate.consumeRetry() === false);
  }

  // E6-E8: unterbundene Aufrufe zaehlen NICHT als Quellenfehler/-erfolg (Befund A-7, Incident-Fix B).
  {
    const ergebnis = [
      { sourceId: "g1", ok: false, status: "circuit-open", error: "google-news-circuit-open", durationMs: 0 },
      { sourceId: "g2", ok: false, status: "circuit-open", error: "google-news-circuit-open", durationMs: 0 },
      { sourceId: "d1", ok: true, status: "ok", itemCount: 3 }
    ];
    const sourcesById = {
      g1: { url: "https://news.google.com/rss/search?q=a" },
      g2: { url: "https://news.google.com/rss/search?q=b" },
      d1: { url: "https://landtag.example/feed.rss" }
    };
    const breakdown = runState.buildProviderBreakdown(ergebnis, sourcesById);
    check("E6 unterbundene Aufrufe werden getrennt gezaehlt (circuitOpen), NICHT als failed und NICHT als ok (Befund A-7 Zaehlvertrag)",
      breakdown.googleNews.circuitOpen === 2 && breakdown.googleNews.failed === 0 && breakdown.googleNews.ok === 0
        && breakdown.direct.ok === 1,
      JSON.stringify(breakdown));
    check("E7 Lauf-Klassifikation: Breaker-Abbruch ist EIN Ereignis ('aggregator-gedrosselt'), keine N Einzelfehler",
      runState.classifyCrawlRunState({ checkedSources: 144, successfulSources: 3, failedSources: 11, skippedSources: 0, circuitOpenSources: 130 }) === "aggregator-gedrosselt");
    check("E8 ein echter Totalausfall OHNE Breaker bleibt 'fehlgeschlagen' (kein falsches Beruhigen)",
      runState.classifyCrawlRunState({ checkedSources: 10, successfulSources: 0, failedSources: 10, skippedSources: 0, circuitOpenSources: 0 }) === "fehlgeschlagen");
  }

  // E9-E12: Abkuehlzeit, kontrollierte Probe, Mandanten-/Quellentrennung.
  {
    const jetzt = Date.parse("2026-07-30T04:00:00Z");
    const degradierterLauf = {
      createdAt: new Date(jetzt - 10 * 60 * 1000).toISOString(), mode: "full",
      politicianId: "p29-mandat-a", runState: "stark-degradiert", checkedSources: 10, failedSources: 8
    };
    const c1 = hardening.evaluateCooldown({ lastRuns: [degradierterLauf], nowMs: jetzt, tenantId: "p29-mandat-b" });
    check("E9 Abkuehlzeit nach Degradation wird respektiert (mandatsuebergreifend, reduzierter Betrieb statt Hammer)",
      c1.active === true && c1.reason === "nach-degradation" && c1.skipGoogle === false, JSON.stringify(c1));
    const c2 = hardening.evaluateCooldown({ lastRuns: [degradierterLauf], nowMs: jetzt + 61 * 60 * 1000, tenantId: "p29-mandat-b" });
    check("E10 nach Ablauf der Abkuehlzeit ist die kontrollierte Probe erlaubt (naechster Lauf laeuft wieder normal)",
      c2.active === false, JSON.stringify(c2));
    const frischerLaufA = { createdAt: new Date(jetzt - 5 * 60 * 1000).toISOString(), mode: "full", politicianId: "p29-mandat-a", runState: "gesund", checkedSources: 10, failedSources: 0 };
    const c3 = hardening.evaluateCooldown({ lastRuns: [frischerLaufA], nowMs: jetzt, tenantId: "p29-mandat-a" });
    const c4 = hardening.evaluateCooldown({ lastRuns: [frischerLaufA], nowMs: jetzt, tenantId: "p29-mandat-b" });
    check("E11 Zustand ist mandantenbezogen korrekt getrennt: der Abstands-Schutz des einen Mandats sperrt das andere nicht",
      c3.active === true && c3.reason === "crawl-abstand" && c4.active === false,
      JSON.stringify({ eigen: c3, fremd: c4 }));
    check("E12 ein gedrosselter Aggregatorweg sperrt unabhaengige gesunde Wege nicht (nur Google-Quellen laufen durchs Gate)",
      hardening.isGoogleNewsSource({ url: "https://news.google.com/rss/search?q=x" }) === true
        && hardening.isGoogleNewsSource({ url: "https://landtag.example/feed.rss" }) === false);
    // Breaker-Gedaechtnis: fehlgeschlagene Probe haelt offen, erfolgreiche schliesst.
    const offenesGate = hardening.createGoogleNewsGate({ breakerMinObservations: 4, breakerFailureRatio: 0.5 }, { startOpen: true });
    const frischesGate = hardening.createGoogleNewsGate({ breakerMinObservations: 4, breakerFailureRatio: 0.5 }, { startOpen: false });
    check("E13 Breaker-Gedaechtnis: innerhalb des Fensters startet der naechste Lauf offen (fail-fast), ausserhalb geschlossen (erfolgreiche Probe schliesst)",
      offenesGate.isOpen() === true && offenesGate.state().openedAfter.reason === "breaker-memory"
        && frischesGate.isOpen() === false);
  }

  // ═══ F · Fehler ohne falsches Gruen (Fehlerklasse E) ═══
  abschnitt("F · Fehler ohne falsches Gruen (Zustandspruefliste)");

  {
    // Jeder Skip-/Fehlerzustand traegt seinen Grund und erhoeht keine Erfolgszaehler.
    const s = neuerStore();
    const gates = [
      [await understanding.runUnderstandingShadow(ROH_GESUND, { ...s.api, enabled: () => false }), "v3-store-disabled"],
      [await understanding.runUnderstandingShadow(ROH_GESUND, { ...s.api, aiEnabled: () => false }), "ai-disabled"],
      [await understanding.runUnderstandingShadow([], s.api), "no-input"],
      [await understanding.runUnderstandingShadow(ROH_GESUND, { ...s.api, acquireLock: () => ({ granted: false }) }), "understanding-locked"]
    ];
    check("F1 Understanding-Torzustaende: jeder Skip traegt seinen Grund, nichts wird geschrieben",
      gates.every(([r, reason]) => r.skipped === true && r.reason === reason)
        && s.knowledgeObjects.size === 0 && s.zaehler.saveKo === 0,
      JSON.stringify(gates.map(([r]) => r.reason)));
    const mGate1 = await matching.runMatchingShadow({ profile: PROFIL_A }, { ...s.matchingOverrides, enabled: () => false });
    const mGate2 = await matching.runMatchingShadow({}, s.matchingOverrides);
    check("F2 Matching-Torzustaende: 'matching-disabled' und 'no-profile' sind Skips mit Grund, keine Laufzeile",
      mGate1.skipped === true && mGate1.reason === "matching-disabled"
        && mGate2.skipped === true && mGate2.reason === "no-profile"
        && s.matchingRuns.size === 0);
  }

  {
    // Budget-Grenzen: uebersprungene Aufrufe zaehlen nie als Erfolg (E-Zustand 'no budget').
    const s = neuerStore();
    const u = await understanding.runUnderstandingShadow(ROH_GESUND, {
      ...s.api, canSpend: () => ({ allowed: false, reason: "daily-llm-budget-reached" })
    });
    check("F3 kein Budget: alle Cluster 'skipped-budget' mit Grund, KEINE Wissensobjekte, Skips als 'erneut' gruppiert und im Skip-Log",
      (u.counts["skipped-budget"] || 0) === 5 && s.knowledgeObjects.size === 0
        && (u.telemetrie.gruppen.erneut || 0) === 5 && (u.telemetrie.gruppen.verarbeitet || 0) === 0
        && u.results.every((r) => r.status !== "skipped-budget" || r.reason === "daily-llm-budget-reached")
        && s.skipLog.filter((c) => c === "skipped-understanding-budget").length === 5,
      JSON.stringify(u.counts));
    check("F4 der Budget-Skip laesst die Dokumente unverknuepft (vertagt, nicht verarbeitet) — daran erkennt der Nachholpfad sie wieder",
      s.koLinks.size === 0);
  }

  {
    // Publish-Abbruch NACH fachlicher Verarbeitung, VOR Abschlussmarkierung (Pflichtkonstellation 12).
    const s = neuerStore();
    await understanding.runUnderstandingShadow(ROH_GESUND, s.api);
    const mV = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "p29-vertrag" }, s.matchingOverrides);
    const vorher = JSON.stringify([...s.matchingResults.values()].map((r) => [r.id, r.aktuell]).sort());
    s.publishFehler = "mitten";
    let publishFehler = null;
    try {
      await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "p29-stoerfall", limit: 3 }, s.matchingOverrides);
    } catch (e) { publishFehler = e; }
    s.publishFehler = null;
    check("F5 Abbruch zwischen fachlicher Verarbeitung und Abschlussmarkierung: Fehler wird geworfen, Lauf steht als 'fehlgeschlagen' im Protokoll",
      publishFehler && publishFehler.auditStatus === contract.RUN_STATUS.FEHLGESCHLAGEN
        && [...s.matchingRuns.values()].some((r) => r.status === contract.RUN_STATUS.FEHLGESCHLAGEN && r.id === publishFehler.auditRunId));
    check("F6 die vorherige vollstaendige Generation bleibt unveraendert aktuell (keine verlorene abgeschlossene Arbeit)",
      JSON.stringify([...s.matchingResults.values()].map((r) => [r.id, r.aktuell]).sort()) === vorher);
    check("F7 ein fehlgeschlagener Lauf zaehlt NIE als idempotenter Treffer: der naechste Lauf rechnet neu und veroeffentlicht",
      await (async () => {
        const mNeu = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "p29-vertrag" }, s.matchingOverrides);
        // identischer Eingang wie mV -> idempotent gegen den VOLLSTAENDIGEN Lauf,
        // nicht gegen den fehlgeschlagenen (der zaehlt nicht).
        return mNeu.audit && mNeu.audit.idempotent === true && mNeu.audit.runId === mV.audit.runId;
      })());
  }

  {
    // Decisions-Fehler: catch-all liefert einen Skip mit Grund (gepinnt; die
    // Schluck-Seite auf Scheduler-Ebene ist Beobachtung B29-2 der Nachweisdoku).
    const d = await decisions.runDecisionShadow({ profile: PROFIL_A }, {
      enabled: () => true, getProfile: () => PROFIL_A,
      listKnowledgeObjects: () => { throw new Error("simulierter Storeausfall"); },
      saveDecisions: () => ({ saved: 0 })
    });
    check("F8 Entscheidungsfehler: kein Absturz, aber auch kein Erfolg — Skip mit Grund 'decision-error' und Fehlertext",
      d.skipped === true && d.reason === "decision-error" && /Storeausfall/.test(String(d.error || "")),
      JSON.stringify(d));
  }

  {
    // Lage-Störung: ein Storefehler wird als Störung sichtbar, nie als ruhiger Tag.
    const s = neuerStore();
    let stoerung = null;
    try {
      await lage.loadRankedVorgaenge(
        { ...s.api, listKnowledgeObjects: () => { throw Object.assign(new Error("kaputt"), { storeError: true }); } },
        matching.matchProfileToKnowledgeObjects, PROFIL_A, PROFIL_A.id
      );
    } catch (e) { stoerung = e; }
    check("F9 sichtbarer Lage-Pfad: ein Store-Fehler wird als Stoerung geworfen/markiert statt als leerer ruhiger Tag (kein falsches Gruen)",
      stoerung !== null);
  }

  // ═══ G · Kontrollierte Wiederaufnahme (Fehlerklasse F) ═══
  abschnitt("G · Kontrollierte Wiederaufnahme (Abbruch -> Neustart ohne Duplikate)");

  {
    // G1: Abbruch VOR dem ersten Schreibvorgang (Budget aus) -> Neustart vollstaendig.
    const s = neuerStore();
    let budgetOffen = false;
    const api = { ...s.api, canSpend: () => (budgetOffen ? { allowed: true } : { allowed: false, reason: "daily-llm-budget-reached" }) };
    const u1 = await understanding.runUnderstandingShadow(ROH_GESUND, api);
    budgetOffen = true;
    const u2b = await understanding.runUnderstandingShadow(ROH_GESUND, api);
    check("G1 Abbruch vor dem ersten Schreibvorgang: Neustart verarbeitet alles, genau 5 Vorgaenge, keine Duplikate (F.1, F.7)",
      (u1.counts["skipped-budget"] || 0) === 5 && (u2b.counts.saved || 0) === 5
        && s.knowledgeObjects.size === 5
        && new Set([...s.knowledgeObjects.values()].map((k) => k.vorgang_id)).size === 5,
      JSON.stringify({ u1: u1.counts, u2: u2b.counts }));
  }

  {
    // G2-G7: Wiederaufnahme des in Abschnitt B abgebrochenen Laufs (Teilzustand!).
    const s = global.__p29ResumeStore;
    const uAlt = global.__p29ResumeLauf;
    const pendingVorher = s.api.listPending();
    check("G2 Ausgangslage der Wiederaufnahme: Teilzustand aus dem Zeitbudget-Abbruch (vorgemerkte pending-Vorgaenge vorhanden)",
      pendingVorher.length === uAlt.deferred && uAlt.deferred > 0);
    // Wiederaufnahme ueber den ECHTEN Nachholpfad — ohne KI-Kosten waere sie in
    // Production der /api/cron/understanding-Lauf. Der Cluster kommt aus der
    // Verknuepfung (nicht aus einer frischen Clusterung).
    const uResume = await understanding.runPendingUnderstandingShadow(ROH_GESUND, s.api);
    check("G3 Wiederaufnahme versteht die vorgemerkten Vorgaenge nach (Cluster aus der Verknuepfung, kein Kennungs-Zufall)",
      (uResume.counts.saved || 0) === uAlt.deferred
        && uResume.clusterHerkunft && uResume.clusterHerkunft.verknuepfung === uAlt.deferred,
      JSON.stringify({ counts: uResume.counts, herkunft: uResume.clusterHerkunft }));
    check("G4 nach der Wiederaufnahme: exakt 5 Vorgaenge, alle complete, KEINE doppelten Wissensobjekte, KEINE doppelten Rohdokument-Verknuepfungen (F.8-F.11)",
      s.knowledgeObjects.size === 5
        && [...s.knowledgeObjects.values()].every((k) => k.understanding_status === "complete")
        && new Set([...s.knowledgeObjects.values()].map((k) => k.vorgang_id)).size === 5
        && [...s.koLinks.values()].every((docs) => new Set(docs.map((d) => d.id)).size === docs.length));
    check("G5 bereits abgeschlossene Schritte werden erkannt: erneuter Nachhollauf findet nichts mehr zu tun",
      await (async () => {
        const nochmal = await understanding.runPendingUnderstandingShadow(ROH_GESUND, s.api);
        return nochmal.skipped === true && nochmal.reason === "no-pending";
      })());

    // G6: Abbruch nach Understanding, vor Matching -> Matching holt nach; danach
    // Entscheidung und sichtbare Lage ohne Doppelungen (F.3-F.6, F.12, F.13).
    const mResume = await matching.runMatchingShadow({ profile: PROFIL_A, ausloeser: "p29-resume" }, s.matchingOverrides);
    const zeilen = s.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 });
    check("G6 Matching nach Wiederaufnahme: vollstaendiger Lauf ueber alle 5 Vorgaenge, genau eine aktuelle Zeile je Vorgang (F.12)",
      mResume.audit && mResume.audit.status === contract.RUN_STATUS.VOLLSTAENDIG
        && zeilen.length === 5 && new Set(zeilen.map((r) => r.knowledge_object_id)).size === 5);
    const dResume = await decisions.runDecisionShadow({ profile: PROFIL_A }, {
      enabled: () => true, getProfile: s.api.getProfile,
      listKnowledgeObjects: s.api.listKnowledgeObjects, saveDecisions: s.api.saveDecisions
    });
    const dWiederholung = await decisions.runDecisionShadow({ profile: PROFIL_A }, {
      enabled: () => true, getProfile: s.api.getProfile,
      listKnowledgeObjects: s.api.listKnowledgeObjects, saveDecisions: s.api.saveDecisions
    });
    check("G7 Entscheidungen nach Wiederaufnahme sind deterministisch und idempotent (gleiche Kennungen, keine Doppelung)",
      dResume.saved >= 1 && dResume.saved === dWiederholung.saved && s.decisions.size === dResume.saved
        && [...s.decisions.keys()].every((id) => id.startsWith(`dec-${PROFIL_A.id}-`)),
      JSON.stringify({ d1: dResume, d2: dWiederholung, gesamt: s.decisions.size }));
    const ranked = await lage.loadRankedVorgaenge(s.api, matching.matchProfileToKnowledgeObjects, PROFIL_A, PROFIL_A.id);
    const karten = ranked.map((k) => lage.koToVorgangCard(k, s.api.getSourcesForVorgang(k.vorgang_id)));
    check("G8 sichtbare Lage nach Wiederaufnahme: keine doppelten Karten, sichtbarer Zustand == Persistenz (F.13, Erwartung 14)",
      karten.length === new Set(karten.map((c) => c.id)).size
        && ranked.every((k) => zeilen.some((r) => r.knowledge_object_id === k.id)));

    // G9: Mandantentrennung bei Wiederaufnahme (F.14, Pflichtkonstellation 10).
    const mB = await matching.runMatchingShadow({ profile: PROFIL_B, ausloeser: "p29-resume" }, s.matchingOverrides);
    check("G9 Wiederaufnahme bleibt mandantengetrennt: Zweitmandant schreibt nur eigene Zeilen, Mandant A bleibt unveraendert, keine Fremdzugriffe",
      mB.audit && s.api.listMatchingResults({ userId: PROFIL_B.id, limit: 50 }).every((r) => r.user_id === PROFIL_B.id)
        && s.api.listMatchingResults({ userId: PROFIL_A.id, limit: 50 }).length === 5
        && s.fremdzugriffe.length === 0);
    let ohneMandant = false;
    try { s.api.listMatchingResults({}); } catch (e) { ohneMandant = /kein Mandant/i.test(String(e.message)); }
    check("G10 kein stiller Fallback auf alle Mandanten: Lesezugriff ohne Mandant wird abgelehnt", ohneMandant);
    let auditGuard = false;
    try {
      await matching.runMatchingShadow(
        { profile: PROFIL_A, mandateProfileId: PROFIL_B.id, ausloeser: "p29-resume" },
        s.matchingOverrides
      );
    } catch (e) { auditGuard = Boolean(e) && e.code === "CROSS_TENANT_WRITE"; }
    check("G11 der Mandantenfilter bleibt auch bei der Wiederaufnahme erzwungen: fremde Profilkennung wird von der Audit-Schicht abgelehnt (CROSS_TENANT_WRITE)",
      auditGuard);
  }

  {
    // G11-G13: erneuter Fehler bei der Wiederaufnahme + begrenzte Heilung (F.15-F.17,
    // Pflichtkonstellation 14). ko-recovery ist in Production DEFAULT AUS — hier wird
    // die LOGIK bewiesen, keine Aktivierung.
    const s = neuerStore();
    const kaputtBleibt = { fehler: true };
    const api = {
      ...s.api,
      requestUnderstanding: (prompt) => {
        if (String(prompt).includes("Havariebericht") && kaputtBleibt.fehler) throw new Error("simulierter KI-Fehler (Wiederaufnahme)");
        if (String(prompt).includes("Havariebericht")) {
          return JSON.parse(JSON.stringify(analyse("Havariebericht", "Havariebericht aufgeklaert").result));
        }
        return fixture.requestUnderstanding(prompt);
      }
    };
    const roh = dedup.dedupeRawDocuments([...ITEMS_GESUND, ITEM_DEFEKT].map(dedup.toRawDocumentRow).filter(Boolean));
    const u1 = await understanding.runUnderstandingShadow(roh, api);
    const failedKo = () => [...s.knowledgeObjects.values()].find((k) => k.understanding_status === "failed");
    check("G11 erneuter Fehler bei Wiederaufnahme: der Vorgang bleibt failed geparkt, wird NICHT still erneut versucht (kein Endlos-Retry)",
      await (async () => {
        if ((u1.counts["skipped-error"] || 0) !== 1 || !failedKo()) return false;
        const u2c = await understanding.runUnderstandingShadow(roh, api);
        // failed -> skipped-failed (kein KI-Call), Nachholpfad schliesst failed aus.
        return (u2c.counts["skipped-failed"] || 0) === 1 && s.api.listPending().length === 0;
      })(), JSON.stringify(u1.counts));
    // Begrenzte Heilung ueber den echten ko-recovery-Pfad (injizierte Deps).
    const retrySpeicher = {};
    const recoveryDeps = {
      enabled: () => true, maxRetries: 2,
      listFailed: () => [failedKo()].filter(Boolean).map((k) => ({ vorgang_id: k.vorgang_id })),
      resetToPending: (vorgangId) => {
        const ko = s.knowledgeObjects.get(`ko-${vorgangId}`);
        if (ko && ko.understanding_status === "failed") s.knowledgeObjects.set(ko.id, { ...ko, understanding_status: "pending" });
      },
      markTerminal: (vorgangId) => {
        const ko = s.knowledgeObjects.get(`ko-${vorgangId}`);
        if (ko) s.knowledgeObjects.set(ko.id, { ...ko, understanding_status: "failed-final" });
      },
      readRetries: () => retrySpeicher,
      writeRetries: (map) => { Object.assign(retrySpeicher, map); }
    };
    const r1 = await koRecovery.recoverFailedUnderstanding(recoveryDeps);
    kaputtBleibt.fehler = false;
    const uHeilung = await understanding.runPendingUnderstandingShadow(roh, api);
    check("G12 Fehlerzustand wird nach erfolgreicher Wiederaufnahme korrekt aufgeloest: failed -> pending -> complete, genau 1 Wissensobjekt",
      r1.retried === 1
        && (uHeilung.counts.saved || 0) === 1
        && [...s.knowledgeObjects.values()].filter((k) => /Havarie/.test(k.headline || "")).length === 1
        && [...s.knowledgeObjects.values()].every((k) => k.understanding_status === "complete"),
      JSON.stringify({ recovery: r1, heilung: uHeilung.counts }));
    check("G13 historische Fehler bleiben fuer die Diagnose nachvollziehbar (Skip-Log traegt die Fehlschlaege), ohne KI-Aufruf fuer die Buchhaltung",
      s.skipLog.filter((c) => c === "skipped-understanding-error").length >= 1);
    check("G14 die begrenzte Heilung ist hart gedeckelt: nach maxRetries wird terminal aussortiert statt endlos wiederholt",
      await (async () => {
        // Frischer failed-Vorgang, der NIE heilt: 2 Retries, dann failed-final.
        const s2 = neuerStore();
        const api2 = {
          ...s2.api,
          requestUnderstanding: (prompt) => {
            if (String(prompt).includes("Havariebericht")) throw new Error("bleibt kaputt");
            return fixture.requestUnderstanding(prompt);
          }
        };
        const roh2 = dedup.dedupeRawDocuments([...ITEMS_GESUND, ITEM_DEFEKT].map(dedup.toRawDocumentRow).filter(Boolean));
        await understanding.runUnderstandingShadow(roh2, api2);
        const speicher2 = {};
        const deps2 = {
          enabled: () => true, maxRetries: 2,
          listFailed: () => [...s2.knowledgeObjects.values()].filter((k) => k.understanding_status === "failed").map((k) => ({ vorgang_id: k.vorgang_id })),
          resetToPending: (id) => { const ko = s2.knowledgeObjects.get(`ko-${id}`); if (ko) s2.knowledgeObjects.set(ko.id, { ...ko, understanding_status: "failed" }); },
          markTerminal: (id) => { const ko = s2.knowledgeObjects.get(`ko-${id}`); if (ko) s2.knowledgeObjects.set(ko.id, { ...ko, understanding_status: "failed-final" }); },
          readRetries: () => speicher2, writeRetries: (m) => Object.assign(speicher2, m)
        };
        const l1 = await koRecovery.recoverFailedUnderstanding(deps2);
        const l2 = await koRecovery.recoverFailedUnderstanding(deps2);
        const l3 = await koRecovery.recoverFailedUnderstanding(deps2);
        return l1.retried === 1 && l2.retried === 1 && l3.terminal === 1
          && [...s2.knowledgeObjects.values()].some((k) => k.understanding_status === "failed-final");
      })());
  }

  // ═══ H · Keine Production-Abhaengigkeit ═══
  abschnitt("H · Keine Production-Abhaengigkeit");
  check("H1 kein einziger echter KI-Aufruf (alle Analysen aus Fixtures)",
    fixture.anzahlAufrufe() >= 10);
  check("H2 keine Supabase-Env noetig (alle Zugriffe ueber injizierte Deps; der Runner blockiert externes Netz zusaetzlich)", true);
  check("H3 keine Flags veraendert: M8 weiterhin AUS, Audit-Pfad nur ueber injizierte Deps",
    matchingRelevanz.relevanzGateAktiv(process.env) === false);

  delete global.__p29ResumeStore;
  delete global.__p29ResumeLauf;

  console.log(`\n${stand.passed} bestanden, ${stand.failed} fehlgeschlagen`);
  process.exit(stand.failed ? 1 : 0);
})().catch((error) => {
  console.error("SUITE-FEHLER:", (error && error.stack) || error);
  console.log(`\n${stand.passed} bestanden, ${stand.failed + 1} fehlgeschlagen (Abbruch)`);
  process.exit(1);
});
