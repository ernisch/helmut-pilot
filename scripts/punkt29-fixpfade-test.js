"use strict";

// Punkt 29 — Fix-Sprint P29-1…P29-4: Regressionsvertrag der geschlossenen Fehlerpfade.
// ====================================================================================
// SOLL-Erwartungen der vier in Punkt 29A deterministisch belegten Produktionsfehler
// (kanonische Befunddoku: docs/roadmap/punkt-29-fehlervertrag.md §5 auf dem
// 29A-Branch / PR #187; Fix-Doku dieses Sprints: docs/roadmap/punkt-29-fixsprint.md).
// Auf dem Ausgangscode (main 75d7286) war diese Suite in den Fix-Assertionen ROT
// (Befundstand); nach dem Fix-Sprint ist sie der dauerhafte Regressionsschutz:
//
//   P29-1  ein von perTenant ZURUECKGEGEBENES Fehler-/Timeout-Objekt wird als
//          Fehler gebucht (kein erfundener letzter Erfolg, keine zurueckgesetzte
//          Fehlerserie); ein ehrlicher Skip bleibt von einem Fehler unterscheidbar.
//   P29-2  ein nicht verwertbarer KI-Rueckgabewert (null/kein Objekt) wird
//          kontrolliert geparkt (markFailed + Skip-Log) statt als anonymer
//          cluster-error ohne Endzustand zu enden; kein unbegrenzter Retry.
//   P29-3  eine gescheiterte/vertagte Aktualisierung endet nicht als stilles
//          "duplicate", sondern wird BEGRENZT wieder aufgenommen (Deckel, kein
//          fachliches Duplikat, echter Erfolg loest die Vormerkung auf).
//   P29-4  ein Lesefehler beim Existenz-Check der Pending-Vormerkung ist
//          fail-closed: KEIN Schreibvorgang, ein fertiges Wissensobjekt kann
//          nicht auf pending zurueckgestuft werden.
//
// Echte Produktionsfunktionen; Testdoubles nur an den aeusseren Grenzen (Zeit,
// Ablage, KI, DB). KEIN Netz (nur 127.0.0.1-Stub fuer P29-4), KEINE KI, KEINE
// Production-Secrets — identisches Ergebnis mit und ohne Secrets.

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const understanding = require("../lib/helmut/understanding");
const matchingRelevanz = require("../lib/helmut/matching-relevanz");
const dedup = require("../lib/helmut/dedup");
const fairness = require("../lib/helmut/cron-fairness");
const { testPoliticianOne } = require("./fixtures/test-profiles");
const G = require("./e2e-vertrag-geruest");

const { check, abschnitt, stand } = G.neuesZaehlwerk();

const PROFIL_A = Object.freeze({ ...testPoliticianOne, id: "p29fix-mandat", profileActive: true });

// ── Fixtures (kuenstlich, .example-Domaenen — keine Production-Daten) ─────────
function medienItem(id, title, summary) {
  return {
    id, title, summary,
    url: `https://medien.example/p29fix/${id}`,
    sourceName: "Beispielmedien", sourceId: "medien-beispiel", sourceType: "media",
    linkType: "direct", confidence: "medium",
    publishedAt: "2026-07-29T06:00:00Z", retrievedAt: "2026-07-30T04:00:00.000Z"
  };
}
function analyse(marker, headline) {
  return {
    marker,
    result: {
      headline,
      was_ist_passiert: `${headline}. Der Bundestag ist beteiligt.`,
      warum_wichtig: "Betrifft die Sozialpolitik.", wer_ist_betroffen: "Beschaeftigte.",
      handlungsempfehlung: "Beobachten.", parteien: [], ausschuesse: [], ministerien: [],
      risiken: [], chancen: [], mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: [], mentioned_locations: [],
      mentioned_organizations: [], tags: ["Soziales"], zeitdruck: "mittel", confidence_score: 70,
      display_title: headline, display_summary: `${headline}.`,
      why_relevant: "Einschlaegig.", recommendation: "Beobachten.",
      display_category: "Arbeit und Soziales", risk_level: "low", opportunity_level: "low"
    }
  };
}

const ITEMS = [
  medienItem("p29fix-tarifbindung", "Bundestag beraet die Tarifbindung", "Der Bundestag beraet ein Gesetz zur Tarifbindung."),
  medienItem("p29fix-havarie", "Havariebericht zur Datenlage", "Der Havariebericht enthaelt unverwertbare Datenlage.")
];
const UPDATE_DOK = medienItem("p29fix-tarifbindung-update", "Bundestag beraet die Tarifbindung erneut",
  "Neue Beratungsrunde zur Tarifbindung mit geaendertem Zeitplan.");
const fixture = G.macheFixtureUnderstanding([
  analyse("Tarifbindung", "Bundestag beraet die Tarifbindung"),
  analyse("Havariebericht", "Havariebericht zur Datenlage")
]);
const ROH = dedup.dedupeRawDocuments(ITEMS.map(dedup.toRawDocumentRow).filter(Boolean));
const ROH_UPDATE = dedup.dedupeRawDocuments([...ITEMS, UPDATE_DOK].map(dedup.toRawDocumentRow).filter(Boolean));

function neuerStore() {
  return G.neuerStore({
    getProfile: (u) => (u === PROFIL_A.id ? PROFIL_A : null),
    requestUnderstanding: fixture.requestUnderstanding,
    relevanzGateEnabled: () => matchingRelevanz.relevanzGateAktiv(process.env)
  });
}

// ── Fairness-Umgebung (injizierte Uhr + In-Memory-Ablage, wie cron-fairness-test) ─
function fairnessUmgebung() {
  const u = { t: 0, state: fairness.normalizeState({}) };
  u.lauf = (nr, perTenant) => fairness.runTenantsFairly({
    cronName: "p29fix-cron", tenantIds: ["m1"], runId: `p29fix-lauf-${nr}`,
    deadlineMs: 100000, startedMs: u.t, now: () => u.t, reserveMs: 100,
    loadState: async () => u.state,
    saveState: async (patch) => {
      u.state = fairness.mergeState(u.state, patch, { nowMs: u.t });
      return { state: u.state };
    },
    perTenant: async (tenantId) => { u.t += 10; return perTenant(tenantId); }
  });
  u.eintrag = () => fairness.entryOf(u.state, "p29fix-cron", "m1");
  return u;
}

(async () => {
  // ═══ A · P29-1: Ergebnisklassifikation der Fairness-Buchfuehrung ═══
  abschnitt("A · P29-1: zurueckgegebene Fehler-/Timeout-Objekte sind KEIN Erfolg");

  check("A0 ergebnisFehlgeschlagen ist exportiert und klassifiziert die Vertragsformen",
    typeof fairness.ergebnisFehlgeschlagen === "function"
      && fairness.ergebnisFehlgeschlagen({ ok: false, bounded: true, reason: "crawl-timeout" }) === true
      && fairness.ergebnisFehlgeschlagen({ status: "stable", bounded: true, reason: "lage-check-timeout" }) === true
      && fairness.ergebnisFehlgeschlagen({ ok: false, reason: "push-timeout" }) === true
      && fairness.ergebnisFehlgeschlagen({ failed: true }) === true
      && fairness.ergebnisFehlgeschlagen({ ok: true, tenants: 1 }) === false
      && fairness.ergebnisFehlgeschlagen({ skipped: true, reason: "profil-deaktiviert" }) === false
      && fairness.ergebnisFehlgeschlagen({ ok: false, skipped: true, reason: "Push ist nicht konfiguriert." }) === false
      && fairness.ergebnisFehlgeschlagen(null) === false
      && fairness.ergebnisFehlgeschlagen("ok") === false
      && fairness.ergebnisFehlgeschlagen(undefined) === false
      && fairness.ergebnisFehlgeschlagen({ bounded: false, ok: true }) === false);

  {
    const u = fairnessUmgebung();
    const lauf = await u.lauf(1, () => ({ ok: false, bounded: true, reason: "crawl-timeout" }));
    const e = u.eintrag();
    check("A1 Timeout-Objekt (ok:false, bounded:true): Buchung als FEHLER — kein letzter Erfolg, erfolge 0, fehler 1, fehlerSerie 1",
      e && e.status === fairness.STATUS_FEHLER && e.letzterErfolgAt === null
        && e.erfolge === 0 && e.fehler === 1 && e.fehlerSerie === 1,
      JSON.stringify(e));
    const r = (lauf.results || []).find((x) => x.politicianId === "m1");
    check("A1b das Ergebnisobjekt bleibt in results erhalten und ist als failed markiert (kein stiller Verlust des Grunds)",
      r && r.failed === true && r.reason === "crawl-timeout" && r.bounded === true,
      JSON.stringify(r));
  }

  {
    const u = fairnessUmgebung();
    await u.lauf(1, () => ({ status: "stable", bounded: true, reason: "lage-check-timeout" }));
    const e = u.eintrag();
    check("A2 der maskierte lage-check-Timeout (status:'stable', bounded:true) wird als Fehler gebucht",
      e && e.status === fairness.STATUS_FEHLER && e.letzterErfolgAt === null && e.fehlerSerie === 1,
      JSON.stringify(e));
  }

  {
    const u = fairnessUmgebung();
    await u.lauf(1, () => ({ ok: false, reason: "push-timeout" }));
    const e = u.eintrag();
    check("A3 push-timeout (ok:false) wird als Fehler gebucht", e && e.status === fairness.STATUS_FEHLER && e.erfolge === 0, JSON.stringify(e));
  }

  {
    const u = fairnessUmgebung();
    // Erst ein ECHTER Erfolg, dann ein Timeout-Objekt: der alte Erfolgsstempel
    // bleibt stehen (er wird nicht neu erfunden), die Fehlerserie waechst.
    await u.lauf(1, () => ({ ok: true }));
    const erfolgAt = u.eintrag().letzterErfolgAt;
    u.t = 1000;
    await u.lauf(2, () => ({ ok: false, bounded: true, reason: "crawl-timeout" }));
    const e = u.eintrag();
    check("A4 nach echtem Erfolg + Timeout: letzterErfolgAt bleibt der ALTE Stempel, fehlerSerie 1, erfolge 1, fehler 1",
      Boolean(erfolgAt) && e.letzterErfolgAt === erfolgAt && e.fehlerSerie === 1 && e.erfolge === 1 && e.fehler === 1,
      JSON.stringify({ erfolgAt, e }));
  }

  {
    const u = fairnessUmgebung();
    await u.lauf(1, () => ({ ok: true, tenants: 1 }));
    const e = u.eintrag();
    check("A5 ein echter Erfolg wird weiter als Erfolg gebucht (Gegenprobe)",
      e && e.status === fairness.STATUS_ERFOLG && e.erfolge === 1 && e.fehler === 0 && Boolean(e.letzterErfolgAt),
      JSON.stringify(e));
  }

  {
    const u = fairnessUmgebung();
    await u.lauf(1, () => "einfacher-rueckgabewert");
    const e = u.eintrag();
    check("A6 ein Nicht-Objekt-Rueckgabewert bleibt wie bisher ein Erfolg (kein neuer Fehlerpfad fuer gesunde Aufrufer)",
      e && e.status === fairness.STATUS_ERFOLG && e.erfolge === 1, JSON.stringify(e));
  }

  {
    const u = fairnessUmgebung();
    const lauf = await u.lauf(1, () => ({ skipped: true, reason: "profil-deaktiviert" }));
    const e = u.eintrag();
    const r = (lauf.results || []).find((x) => x.politicianId === "m1");
    check("A7 ein ehrlicher Skip (skipped:true) wird NICHT als Fehler gebucht und bleibt von einem Fehler unterscheidbar",
      e && e.status !== fairness.STATUS_FEHLER && e.fehler === 0 && e.fehlerSerie === 0
        && r && r.skipped === true && r.failed !== true,
      JSON.stringify({ e, r }));
  }

  {
    const u = fairnessUmgebung();
    await u.lauf(1, () => ({ ok: false, skipped: true, reason: "Push ist nicht konfiguriert." }));
    const e = u.eintrag();
    check("A8 skipped:true hat Vorrang vor ok:false (unkonfigurierter Push loest keine Fehlerserie aus)",
      e && e.status !== fairness.STATUS_FEHLER && e.fehler === 0 && e.fehlerSerie === 0, JSON.stringify(e));
  }

  {
    const u = fairnessUmgebung();
    await u.lauf(1, () => ({ skipped: true, reason: "already running" }));
    const e = u.eintrag();
    check("A9 verweigerte Sperre bleibt UNGEBUCHT (kein Erfolg, kein Fehler — Vermerk bleibt 'laufend')",
      e && e.status === fairness.STATUS_LAUFEND && e.erfolge === 0 && e.fehler === 0, JSON.stringify(e));
  }

  {
    const u = fairnessUmgebung();
    await u.lauf(1, () => { throw new Error("kaputt"); });
    const nachFehler = { ...u.eintrag() };
    u.t = 1000;
    await u.lauf(2, () => ({ ok: false, bounded: true, reason: "crawl-timeout" }));
    const nachTimeout = { ...u.eintrag() };
    u.t = 2000;
    await u.lauf(3, () => ({ ok: true }));
    const nachErfolg = u.eintrag();
    check("A10 geworfener Fehler und Timeout-Objekt zaehlen in DIESELBE Fehlerserie; ein echter Erfolg setzt sie zurueck",
      nachFehler.fehlerSerie === 1 && nachTimeout.fehlerSerie === 2 && nachTimeout.fehler === 2
        && nachErfolg.fehlerSerie === 0 && nachErfolg.erfolge === 1,
      JSON.stringify({ nachFehler, nachTimeout, nachErfolg }));
  }

  // Routen-Quelltextvertrag: die Cron-Routen HEBEN innere Timeout-Befunde in die
  // Mandatsantwort, damit die Fairness-Buchfuehrung sie sehen kann (der Weg, auf
  // dem der Befund in Production entstand: build-/lage-check-/push-timeout).
  {
    const serverQuelle = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    check("A11 morning-briefing hebt build-/push-timeout als ok:false/bounded in die Mandatsantwort (Quelltextvertrag)",
      /const buildTimeout = Boolean\(briefing && briefing\.reason === "build-timeout"\)/.test(serverQuelle)
        && /buildTimeout \|\| pushTimeout \? \{ ok: false, bounded: true/.test(serverQuelle));
    check("A12 lage-check hebt den maskierten Timeout (bounded) und push-timeout in die Mandatsantwort (Quelltextvertrag)",
      /const lageTimeout = Boolean\(lageCheck && lageCheck\.bounded === true\)/.test(serverQuelle)
        && /lageTimeout \|\| pushTimeout \? \{ ok: false, bounded: true/.test(serverQuelle));
  }

  // ═══ B · P29-2: nicht verwertbare KI-Rueckgabewerte ═══
  abschnitt("B · P29-2: KI-Rueckgabewert null wird kontrolliert geparkt");

  {
    const s = neuerStore();
    const skips = [];
    const api = {
      ...s.api,
      logSkip: (c) => skips.push(c),
      requestUnderstanding: (prompt) => {
        if (String(prompt).includes("Havariebericht")) return null; // parseJsonText("null") -> null ohne throw
        return fixture.requestUnderstanding(prompt);
      }
    };
    const u = await understanding.runUnderstandingShadow(ROH, api);
    const geparkt = [...s.knowledgeObjects.values()].find((k) => k.understanding_status === "failed");
    check("B1 null-Antwort: kein cluster-error, sondern skipped-invalid mit failed-Parkung und Skip-Log",
      (u.counts["cluster-error"] || 0) === 0 && (u.counts["skipped-invalid"] || 0) === 1
        && Boolean(geparkt) && skips.includes("skipped-understanding-invalid"),
      JSON.stringify({ counts: u.counts, skips }));
    check("B2 der gesunde Nachbar-Cluster laeuft unbeeindruckt durch (saved)",
      (u.counts.saved || 0) === 1, JSON.stringify(u.counts));
    check("B3 die Dokumente des geparkten Vorgangs sind verknuepft (nachweisbarer Endzustand, Nachholpfad findet sie)",
      Boolean(geparkt) && (s.koLinks.get(geparkt.id) || []).length === 1,
      JSON.stringify({ geparkt: geparkt && geparkt.id, links: geparkt ? (s.koLinks.get(geparkt.id) || []).length : 0 }));
    check("B4 die Telemetrie zaehlt den Fall in der Gruppe 'fehlgeschlagen' (kein stiller Sammelzustand)",
      u.telemetrie && u.telemetrie.gruppen && (u.telemetrie.gruppen.fehlgeschlagen || 0) === 1,
      JSON.stringify(u.telemetrie && u.telemetrie.gruppen));

    // Wiederholung derselben Eingabe: der geparkte Vorgang wird NICHT erneut
    // versucht (kein unbegrenzter Retry) — er bleibt sichtbar skipped-failed.
    const aufrufeVorher = fixture.anzahlAufrufe();
    const u2 = await understanding.runUnderstandingShadow(ROH, api);
    check("B5 Wiederholung: geparkter Vorgang bleibt geparkt (skipped-failed), KEIN weiterer KI-Versuch fuer ihn",
      (u2.counts["skipped-failed"] || 0) === 1 && (u2.counts["cluster-error"] || 0) === 0
        && fixture.anzahlAufrufe() === aufrufeVorher,
      JSON.stringify({ counts: u2.counts, aufrufe: [aufrufeVorher, fixture.anzahlAufrufe()] }));
  }

  {
    // Andere nicht verwertbare Rueckgabetypen verhalten sich identisch.
    for (const [name, wert] of [["Zeichenkette", "keine analyse"], ["Array", [1, 2, 3]], ["Zahl", 42]]) {
      const s = neuerStore();
      const api = {
        ...s.api,
        requestUnderstanding: (prompt) => {
          if (String(prompt).includes("Havariebericht")) return wert;
          return fixture.requestUnderstanding(prompt);
        }
      };
      const u = await understanding.runUnderstandingShadow(ROH, api);
      check(`B6 nicht verwertbarer Rueckgabetyp ${name}: skipped-invalid + Parkung, kein cluster-error`,
        (u.counts["cluster-error"] || 0) === 0 && (u.counts["skipped-invalid"] || 0) === 1
          && [...s.knowledgeObjects.values()].some((k) => k.understanding_status === "failed"),
        JSON.stringify(u.counts));
    }
  }

  {
    // Update-Variante: null bei einer AKTUALISIERUNG parkt NICHT den gesunden
    // Bestand (er bleibt complete/ausgeliefert), sondern vermerkt die
    // gescheiterte Aktualisierung fuer die begrenzte Wiederaufnahme (P29-3).
    const s = neuerStore();
    await understanding.runUnderstandingShadow(ROH, s.api);
    const api = {
      ...s.api,
      requestUnderstanding: (prompt) => {
        if (String(prompt).includes("erneut")) return null;
        return fixture.requestUnderstanding(prompt);
      }
    };
    const u = await understanding.runUnderstandingShadow(ROH_UPDATE, api);
    const bestand = [...s.knowledgeObjects.values()].find((k) => String(k.vorgang_id || "").includes("tarifbindung"));
    check("B7 null bei Aktualisierung: skipped-invalid (aktualisierung-ungueltig), Bestand bleibt complete und unangetastet",
      (u.counts["skipped-invalid"] || 0) === 1 && (u.counts["cluster-error"] || 0) === 0
        && bestand && bestand.understanding_status === "complete" && Number(bestand.ko_version || 1) === 1,
      JSON.stringify({ counts: u.counts, bestand: bestand && { us: bestand.understanding_status, v: bestand.ko_version } }));
    check("B8 die gescheiterte Aktualisierung ist als offene Update-Vormerkung wiederauffindbar (Kopplung zu P29-3)",
      bestand && Object.prototype.hasOwnProperty.call(s.updateVormerkungen || {}, bestand.vorgang_id),
      JSON.stringify(s.updateVormerkungen));
  }

  // ═══ C · P29-3: gescheiterte Aktualisierung wird begrenzt wieder aufgenommen ═══
  abschnitt("C · P29-3: gescheiterte Aktualisierung endet nicht als stilles Duplikat");

  {
    const s = neuerStore();
    await understanding.runUnderstandingShadow(ROH, s.api); // Bestand: 2 complete
    let updateVersuche = 0;
    let kiKaputt = true;
    const api = {
      ...s.api,
      requestUnderstanding: (prompt) => {
        if (String(prompt).includes("erneut")) {
          updateVersuche += 1;
          if (kiKaputt) throw new Error("simulierter KI-Fehler bei der Aktualisierung");
        }
        return fixture.requestUnderstanding(prompt);
      }
    };

    const u1 = await understanding.runUnderstandingShadow(ROH_UPDATE, api);
    const vorgangId = [...s.knowledgeObjects.values()]
      .map((k) => k.vorgang_id).find((v) => String(v || "").includes("tarifbindung"));
    check("C1 gescheiterte Aktualisierung: skipped-error und offene Update-Vormerkung (1 Fehlversuch)",
      (u1.counts["skipped-error"] || 0) === 1 && updateVersuche === 1
        && Number((s.updateVormerkungen || {})[vorgangId]) === 1,
      JSON.stringify({ counts: u1.counts, vormerkungen: s.updateVormerkungen }));

    const u2 = await understanding.runUnderstandingShadow(ROH_UPDATE, api);
    check("C2 identischer Neustart fuehrt zum ZWEITEN Update-Versuch (kein stilles 'duplicate' fuer den gescheiterten Vorgang)",
      updateVersuche === 2 && (u2.counts["skipped-error"] || 0) === 1,
      JSON.stringify({ versuche: updateVersuche, counts: u2.counts }));
    check("C2b der unveraenderte Nachbar-Vorgang bleibt ehrlich ein Duplikat (genau 1) — keine unnoetigen KI-Laeufe",
      (u2.counts.duplicate || 0) === 1, JSON.stringify(u2.counts));

    // Heilung: die KI liefert wieder — die Wiederaufnahme aktualisiert den
    // Bestand GENAU EINMAL und loest die Vormerkung auf.
    kiKaputt = false;
    const u3 = await understanding.runUnderstandingShadow(ROH_UPDATE, api);
    const bestand = [...s.knowledgeObjects.values()].find((k) => k.vorgang_id === vorgangId);
    check("C3 erfolgreiche Wiederaufnahme: updated, ko_version erhoeht, Vormerkung aufgeloest",
      (u3.counts.updated || 0) === 1 && updateVersuche === 3
        && bestand && Number(bestand.ko_version) === 2 && bestand.understanding_status === "complete"
        && !Object.prototype.hasOwnProperty.call(s.updateVormerkungen || {}, vorgangId),
      JSON.stringify({ counts: u3.counts, version: bestand && bestand.ko_version, vormerkungen: s.updateVormerkungen }));

    const aufrufeVorher = fixture.anzahlAufrufe();
    const u4 = await understanding.runUnderstandingShadow(ROH_UPDATE, api);
    check("C4 nach der Heilung ist derselbe Lauf wieder ein ehrliches Duplikat (2x) — kein weiterer KI-Call, keine neue Generation",
      (u4.counts.duplicate || 0) === 2 && updateVersuche === 3 && fixture.anzahlAufrufe() === aufrufeVorher
        && bestand && Number(bestand.ko_version) === 2,
      JSON.stringify({ counts: u4.counts, versuche: updateVersuche }));
    check("C5 ueber alle Laeufe existiert GENAU EIN Wissensobjekt je Vorgang (kein fachliches Duplikat)",
      [...s.knowledgeObjects.values()].filter((k) => k.vorgang_id === vorgangId).length === 1
        && s.knowledgeObjects.size === 2,
      JSON.stringify([...s.knowledgeObjects.keys()]));
  }

  {
    // Deckel: eine DAUERHAFT scheiternde Aktualisierung wird nicht endlos versucht.
    const s = neuerStore();
    await understanding.runUnderstandingShadow(ROH, s.api);
    let updateVersuche = 0;
    const api = {
      ...s.api,
      requestUnderstanding: (prompt) => {
        if (String(prompt).includes("erneut")) { updateVersuche += 1; throw new Error("dauerhaft kaputt"); }
        return fixture.requestUnderstanding(prompt);
      }
    };
    const laeufe = [];
    for (let i = 0; i < 5; i += 1) laeufe.push(await understanding.runUnderstandingShadow(ROH_UPDATE, api));
    const finale = laeufe[4];
    check("C6 Deckel: nach 3 Fehlversuchen (1 Original + 2 Wiederaufnahmen) KEIN weiterer KI-Versuch — sichtbar skipped-update-final statt Endlosschleife",
      updateVersuche === 3
        && (laeufe[3].counts["skipped-update-final"] || 0) === 1
        && (finale.counts["skipped-update-final"] || 0) === 1
        && (finale.counts["skipped-error"] || 0) === 0,
      JSON.stringify({ versuche: updateVersuche, laufKlassen: laeufe.map((l) => l.counts) }));
    check("C6b der erschoepfte Zustand zaehlt in der Telemetrie als 'fehlgeschlagen' (kein falsches Gruen, kein Sammelzustand 'unbekannt')",
      finale.telemetrie && finale.telemetrie.gruppen && (finale.telemetrie.gruppen.fehlgeschlagen || 0) >= 1
        && (finale.telemetrie.gruppen.unbekannt || 0) === 0,
      JSON.stringify(finale.telemetrie && finale.telemetrie.gruppen));

    // Heilung ueber ECHTE neue Dokumente bleibt trotz erschoepftem Deckel moeglich
    // (der normale Update-Pfad haengt nicht an der Vormerkung).
    const nochNeueres = medienItem("p29fix-tarifbindung-einigung", "Tarifbindung Einigung im Vermittlungsausschuss",
      "Bund und Laender erzielen eine Einigung zur Tarifbindung im Vermittlungsausschuss.");
    const rohNeu = dedup.dedupeRawDocuments([...ITEMS, UPDATE_DOK, nochNeueres].map(dedup.toRawDocumentRow).filter(Boolean));
    const heilApi = { ...s.api, requestUnderstanding: fixture.requestUnderstanding };
    const uHeil = await understanding.runUnderstandingShadow(rohNeu, heilApi);
    const vorgangId = [...s.knowledgeObjects.values()]
      .map((k) => k.vorgang_id).find((v) => String(v || "").includes("tarifbindung"));
    check("C7 echte NEUE Dokumente heilen auch einen erschoepften Vorgang ueber den normalen Update-Pfad (updated, Vormerkung aufgeloest)",
      (uHeil.counts.updated || 0) === 1
        && !Object.prototype.hasOwnProperty.call(s.updateVormerkungen || {}, vorgangId),
      JSON.stringify({ counts: uHeil.counts, vormerkungen: s.updateVormerkungen }));
  }

  {
    // Budget-Vertagung ist KEIN Fehlversuch: sie oeffnet die Vormerkung (Wieder-
    // aufnahme moeglich), verbraucht aber den Deckel nicht.
    const s = neuerStore();
    await understanding.runUnderstandingShadow(ROH, s.api);
    let budgetZu = true;
    const api = {
      ...s.api,
      canSpend: () => (budgetZu ? { allowed: false, reason: "daily-limit" } : { allowed: true })
    };
    const u1 = await understanding.runUnderstandingShadow(ROH_UPDATE, api);
    const vorgangId = [...s.knowledgeObjects.values()]
      .map((k) => k.vorgang_id).find((v) => String(v || "").includes("tarifbindung"));
    check("C8 vertagte Aktualisierung (skipped-budget): Vormerkung offen mit 0 Fehlversuchen",
      (u1.counts["skipped-budget"] || 0) === 1
        && Number((s.updateVormerkungen || {})[vorgangId]) === 0,
      JSON.stringify({ counts: u1.counts, vormerkungen: s.updateVormerkungen }));
    budgetZu = false;
    const u2 = await understanding.runUnderstandingShadow(ROH_UPDATE, api);
    const bestand = [...s.knowledgeObjects.values()].find((k) => k.vorgang_id === vorgangId);
    check("C9 nach der Vertagung holt der naechste Lauf die Aktualisierung nach (updated statt duplicate), Vormerkung aufgeloest",
      (u2.counts.updated || 0) === 1 && bestand && Number(bestand.ko_version) === 2
        && !Object.prototype.hasOwnProperty.call(s.updateVormerkungen || {}, vorgangId),
      JSON.stringify({ counts: u2.counts, vormerkungen: s.updateVormerkungen }));
  }

  {
    // Ohne offene Vormerkung bleibt duplicate byte-identisch zum Bestandsverhalten.
    const s = neuerStore();
    await understanding.runUnderstandingShadow(ROH, s.api);
    const aufrufeVorher = fixture.anzahlAufrufe();
    const u = await understanding.runUnderstandingShadow(ROH, s.api);
    check("C10 unveraenderte Wiederholung ohne Vormerkung: 2x duplicate, 0 KI-Calls (Bestandsverhalten unveraendert)",
      (u.counts.duplicate || 0) === 2 && fixture.anzahlAufrufe() === aufrufeVorher,
      JSON.stringify(u.counts));
  }

  // ═══ D · P29-4: Existenz-Check der Pending-Vormerkung ist fail-closed ═══
  abschnitt("D · P29-4: Lesefehler stuft kein fertiges Wissensobjekt zurueck");

  // Frisches storage.js in einem Kindprozess gegen einen lokalen PostgREST-Stub —
  // KEINE echten Secrets, Umgebung des Testprozesses unveraendert.
  function savePendingGegenStub(getAntwort) {
    return new Promise((fertig, kaputt) => {
      const schreibvorgaenge = [];
      const stub = http.createServer((req, res) => {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
          if (req.method === "GET" && req.url.startsWith("/rest/v1/knowledge_objects")) {
            const antwort = getAntwort();
            res.statusCode = antwort.status;
            res.setHeader("content-type", "application/json");
            res.end(antwort.body);
            return;
          }
          if (req.method === "POST" && req.url.startsWith("/rest/v1/knowledge_objects")) {
            schreibvorgaenge.push(body.slice(0, 300));
            res.statusCode = 201; res.setHeader("content-type", "application/json");
            res.end(JSON.stringify([{ id: "ko-vg-p29fix-4" }])); return;
          }
          res.statusCode = 200; res.setHeader("content-type", "application/json"); res.end("[]");
        });
      });
      stub.listen(0, "127.0.0.1", () => {
        const port = stub.address().port;
        const kind = spawn(process.execPath, ["-e", `
          const storage = require(${JSON.stringify(path.join(__dirname, "..", "lib", "helmut", "storage.js"))});
          storage.savePendingKnowledgeObject("vg-p29fix-4", { headline: "Fixprobe P29-4", source_document_count: 1 })
            .then((r) => { console.log("ERGEBNIS:" + JSON.stringify(r)); process.exit(0); })
            .catch((e) => { console.log("ERGEBNIS:" + JSON.stringify({ geworfen: String(e && e.message) })); process.exit(0); });
        `], {
          env: {
            PATH: process.env.PATH,
            SUPABASE_URL: `http://127.0.0.1:${port}`,
            SUPABASE_SERVICE_ROLE_KEY: "p29fix-probe-kein-echter-schluessel",
            HELMUT_V3_STORE: "1",
            HELMUT_STORAGE_BACKEND: "supabase"
          }
        });
        let ausgabe = "";
        kind.stdout.on("data", (c) => { ausgabe += c; });
        kind.stderr.on("data", (c) => { ausgabe += c; });
        const frist = setTimeout(() => { try { kind.kill(); } catch (_) { /* ignore */ } }, 30000);
        kind.on("close", () => {
          clearTimeout(frist);
          stub.close(() => {
            const m = ausgabe.match(/ERGEBNIS:(\{.*\})/);
            let ergebnis = null;
            try { ergebnis = m ? JSON.parse(m[1]) : null; } catch (_) { ergebnis = null; }
            fertig({ schreibvorgaenge, ausgabe, ergebnis });
          });
        });
        kind.on("error", kaputt);
      });
    });
  }

  {
    const d = await savePendingGegenStub(() => ({ status: 500, body: "simulierter Lesefehler" }));
    check("D1 Lesefehler beim Existenz-Check: KEIN Schreibvorgang (fail-closed), Vormerkung nur vertagt",
      d.schreibvorgaenge.length === 0 && d.ergebnis && d.ergebnis.skipped === true
        && d.ergebnis.reason === "existenz-unbekannt",
      JSON.stringify({ writes: d.schreibvorgaenge.length, ergebnis: d.ergebnis }));
    check("D1b der Lesefehler bleibt sichtbar (Protokollzeile), er wird nicht verschluckt",
      /getKnowledgeObjectByVorgang fehlgeschlagen/.test(d.ausgabe), d.ausgabe.slice(0, 200));
  }

  {
    const d = await savePendingGegenStub(() => ({ status: 200, body: "[]" }));
    check("D2 Gegenprobe: bewiesene Abwesenheit (leere Antwort) schreibt die Vormerkung weiterhin (saved)",
      d.schreibvorgaenge.length === 1 && d.ergebnis && d.ergebnis.saved === true,
      JSON.stringify({ writes: d.schreibvorgaenge.length, ergebnis: d.ergebnis }));
  }

  {
    const fertigesKo = { id: "ko-vg-p29fix-4", vorgang_id: "vg-p29fix-4", status: "complete", understanding_status: "complete" };
    const d = await savePendingGegenStub(() => ({ status: 200, body: JSON.stringify([fertigesKo]) }));
    check("D3 ein vorhandenes fertiges Wissensobjekt wird NIE ueberschrieben (exists, kein Schreibvorgang)",
      d.schreibvorgaenge.length === 0 && d.ergebnis && d.ergebnis.skipped === true && d.ergebnis.reason === "exists",
      JSON.stringify({ writes: d.schreibvorgaenge.length, ergebnis: d.ergebnis }));
  }

  console.log(`\n${stand.passed} bestanden, ${stand.failed} fehlgeschlagen`);
  process.exit(stand.failed ? 1 : 0);
})().catch((error) => {
  console.error("SUITE-FEHLER:", (error && error.stack) || error);
  process.exit(2);
});
