"use strict";

// Punkt 29A — Befundproben (SOLL-Erwartung der gefundenen Produktionsfehler).
// ===========================================================================
// Dieses Skript ist der "rote Regressionstest" der Befundregel des Sprints 29A:
// es prueft fuer jeden gefundenen echten Produktionsfehler die SOLL-Erwartung
// des Fehlervertrags. SOLANGE DIE BEFUNDE BESTEHEN, IST DIESES SKRIPT
// ERWARTUNGSGEMAESS ROT (Exit 1) — es ist das Abnahmewerkzeug der getrennten,
// freigabepflichtigen Fix-Sprints und wird vom Offline-Runner bewusst NICHT
// eingesammelt (Dateiname endet nicht auf -test.js).
//
// Das HEUTIGE Verhalten ist gepinnt in scripts/punkt29-fehlervertrag-test.js
// (B9, C9, D9) — nach einem Fix muessen dort die gepinnten Assertions mit
// umgestellt werden, sonst wird die Suite rot (gewollt: der Fix ist sichtbar).
//
// BEFUNDE (Beschreibung, Ursache, Wirkung: docs/roadmap/punkt-29-fehlervertrag.md §5):
//   P29-1  cron-fairness.js:535-537 — ein von perTenant ZURUECKGEGEBENES
//          Fehler-/Timeout-Objekt (Cron-Routen liefern z. B.
//          { ok:false, bounded:true, reason:"crawl-timeout" }) wird als ERFOLG
//          verbucht: letzterErfolgAt gesetzt, fehlerSerie 0, erfolge+1.
//   P29-2  understanding.js:839 (ausserhalb try) + ai.js parseJsonText("null")
//          liefert null OHNE throw — ein nicht verwertbarer KI-Rueckgabewert
//          endet als cluster-error OHNE markFailed/logSkip: kein failed-Zustand,
//          Dokumente ohne Endzustand, unbegrenzter Retry im naechsten Lauf.
//   P29-3  understanding.js:762-764 verknuepft neue Dokumente VOR dem KI-Call —
//          eine GESCHEITERTE Aktualisierung erscheint beim naechsten identischen
//          Lauf als "duplicate"; der zweite Update-Versuch findet nie statt.
//   P29-4  storage.js:2344-2353 + 2961-2975 — getKnowledgeObjectByVorgang gibt
//          bei LESEFEHLER null zurueck; savePendingKnowledgeObject upsertet dann
//          status='pending'/understanding_status='pending' ueber ein womoeglich
//          vorhandenes fertiges Wissensobjekt (fail-open statt fail-closed).
//
// KEIN Netz (nur 127.0.0.1-Stub fuer P29-4), KEINE KI, KEINE Production-Secrets.

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const understanding = require("../lib/helmut/understanding");
const matchingRelevanz = require("../lib/helmut/matching-relevanz");
const dedup = require("../lib/helmut/dedup");
const fairness = require("../lib/helmut/cron-fairness");
const { testPoliticianOne } = require("./fixtures/test-profiles");
const G = require("./e2e-vertrag-geruest");

const PROFIL_A = Object.freeze({ ...testPoliticianOne, id: "p29-befund-mandat", profileActive: true });

function medienItem(id, title, summary) {
  return {
    id, title, summary,
    url: `https://medien.example/p29b/${id}`,
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
  medienItem("p29b-tarifbindung", "Bundestag beraet die Tarifbindung", "Der Bundestag beraet ein Gesetz zur Tarifbindung."),
  medienItem("p29b-havarie", "Havariebericht zur Datenlage", "Der Havariebericht enthaelt unverwertbare Datenlage.")
];
const fixture = G.macheFixtureUnderstanding([
  analyse("Tarifbindung", "Bundestag beraet die Tarifbindung"),
  analyse("Havariebericht", "Havariebericht zur Datenlage")
]);
const ROH = dedup.dedupeRawDocuments(ITEMS.map(dedup.toRawDocumentRow).filter(Boolean));

function neuerStore() {
  return G.neuerStore({
    getProfile: (u) => (u === PROFIL_A.id ? PROFIL_A : null),
    requestUnderstanding: fixture.requestUnderstanding,
    relevanzGateEnabled: () => matchingRelevanz.relevanzGateAktiv(process.env)
  });
}

const befunde = [];
function probe(name, soll, detail = "") {
  const behoben = Boolean(soll);
  befunde.push({ name, behoben });
  console.log(`${behoben ? "BEHOBEN     " : "BEFUND ROT  "}${name}${!behoben && detail ? "\n              " + String(detail).slice(0, 300) : ""}`);
}

(async () => {
  console.log("Punkt-29A-Befundproben — SOLL-Erwartungen (erwartungsgemaess ROT, solange die Befunde bestehen)\n");

  // ── P29-1: zurueckgegebenes Timeout-/Fehlerobjekt darf KEIN Erfolg sein ────
  {
    const umgebung = { t: 0, state: fairness.normalizeState({}) };
    await fairness.runTenantsFairly({
      cronName: "p29b-crawl", tenantIds: ["m1"], runId: "p29b-lauf-1",
      deadlineMs: 100000, startedMs: 0, now: () => umgebung.t, reserveMs: 100,
      loadState: async () => umgebung.state,
      saveState: async (patch) => {
        umgebung.state = fairness.mergeState(umgebung.state, patch, { nowMs: umgebung.t });
        return { state: umgebung.state };
      },
      perTenant: async () => { umgebung.t += 10; return { ok: false, bounded: true, reason: "crawl-timeout" }; }
    });
    const e = fairness.entryOf(umgebung.state, "p29b-crawl", "m1");
    probe("P29-1 ein zurueckgegebenes Timeout-Objekt (ok:false, bounded:true) wird NICHT als Erfolg verbucht",
      e && e.status !== fairness.STATUS_ERFOLG && e.letzterErfolgAt === null && e.erfolge === 0,
      `heutiger Eintrag: ${JSON.stringify(e)}`);
  }

  // ── P29-2: KI-Rueckgabewert null muss kontrolliert geparkt werden ──────────
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
    const failedGeparkt = [...s.knowledgeObjects.values()].some((k) => k.understanding_status === "failed");
    probe("P29-2 ein nicht verwertbarer KI-Rueckgabewert (null) wird als failed geparkt (markFailed + Skip-Log) statt als anonymer cluster-error ohne Endzustand",
      (u.counts["cluster-error"] || 0) === 0 && failedGeparkt
        && skips.some((c) => c === "skipped-understanding-error" || c === "skipped-understanding-invalid"),
      `heutige counts: ${JSON.stringify(u.counts)}, failed geparkt: ${failedGeparkt}, skips: ${JSON.stringify(skips)}`);
  }

  // ── P29-3: gescheiterte Aktualisierung darf nicht dauerhaft als Duplikat enden ─
  {
    const s = neuerStore();
    await understanding.runUnderstandingShadow(ROH, s.api); // Bestand: 2 complete
    const neuesDok = medienItem("p29b-tarifbindung-update", "Bundestag beraet die Tarifbindung erneut",
      "Neue Beratungsrunde zur Tarifbindung mit geaendertem Zeitplan.");
    const rohUpdate = dedup.dedupeRawDocuments([...ITEMS, neuesDok].map(dedup.toRawDocumentRow).filter(Boolean));
    let updateVersuche = 0;
    const api = {
      ...s.api,
      requestUnderstanding: (prompt) => {
        if (String(prompt).includes("erneut")) { updateVersuche += 1; throw new Error("simulierter KI-Fehler bei der Aktualisierung"); }
        return fixture.requestUnderstanding(prompt);
      }
    };
    const u1 = await understanding.runUnderstandingShadow(rohUpdate, api);
    const u2 = await understanding.runUnderstandingShadow(rohUpdate, api);
    // Praezisierte Erwartung (2026-07-31): frueher stand hier zusaetzlich
    // (u2.counts.duplicate || 0) === 0. Das war UEBERSTRENG und fachlich falsch:
    // der Bestand enthaelt 2 Cluster, nur EINES wird aktualisiert. Das andere ist
    // beim identischen Neustart voellig zu Recht ein 'duplicate' — genau dafuer ist
    // die Duplikaterkennung da. Die Bedingung haette also auch nach einem korrekten
    // Fix niemals gruen werden koennen. Geprueft wird jetzt, was der Befund
    // tatsaechlich verlangt: der GESCHEITERTE Cluster wird erneut versucht und
    // taucht sichtbar wieder auf, statt stillschweigend als Duplikat zu enden.
    probe("P29-3 nach einer gescheiterten Aktualisierung fuehrt der identische Neustart zu einem ZWEITEN Update-Versuch (kein stilles 'duplicate')",
      (u1.counts["skipped-error"] || 0) === 1
        && updateVersuche >= 2
        && (u2.counts["skipped-error"] || 0) === 1
        && (u2.counts.duplicate || 0) === 1,
      `heutige Versuche: ${updateVersuche}, zweiter Lauf: ${JSON.stringify(u2.counts)}`);
  }

  // ── P29-4: Lesefehler darf keinen Schreibvorgang ausloesen (fail-closed) ───
  await new Promise((fertig) => {
    const schreibvorgaenge = [];
    const stub = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        if (req.method === "GET" && req.url.startsWith("/rest/v1/knowledge_objects")) {
          res.statusCode = 500; res.end("simulierter Lesefehler"); return;
        }
        if (req.method === "POST" && req.url.startsWith("/rest/v1/knowledge_objects")) {
          schreibvorgaenge.push(body.slice(0, 300));
          res.statusCode = 201; res.setHeader("content-type", "application/json");
          res.end(JSON.stringify([{ id: "ko-vg-p29-befund4" }])); return;
        }
        res.statusCode = 200; res.setHeader("content-type", "application/json"); res.end("[]");
      });
    });
    stub.listen(0, "127.0.0.1", () => {
      const port = stub.address().port;
      // Kindprozess ASYNCHRON (spawn, nicht spawnSync): der Stub laeuft in DIESEM
      // Prozess und muss waehrend des Kindlaufs antworten koennen. Frisches
      // storage.js gegen den Stub — KEINE echten Secrets, Umgebung unveraendert.
      const kind = spawn(process.execPath, ["-e", `
        const storage = require(${JSON.stringify(path.join(__dirname, "..", "lib", "helmut", "storage.js"))});
        storage.savePendingKnowledgeObject("vg-p29-befund4", { headline: "Befundprobe P29-4", source_document_count: 1 })
          .then((r) => { console.log("ERGEBNIS:" + JSON.stringify(r)); process.exit(0); })
          .catch((e) => { console.log("ERGEBNIS:" + JSON.stringify({ fehler: String(e && e.message) })); process.exit(0); });
      `], {
        env: {
          PATH: process.env.PATH,
          SUPABASE_URL: `http://127.0.0.1:${port}`,
          SUPABASE_SERVICE_ROLE_KEY: "p29-befundprobe-kein-echter-schluessel",
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
          const lesefehlerGesehen = /getKnowledgeObjectByVorgang fehlgeschlagen/.test(ausgabe);
          probe("P29-4 ein Lesefehler beim Existenz-Check loest KEINEN pending-Schreibvorgang aus (ein fertiges Wissensobjekt kann sonst auf pending zurueckfallen)",
            lesefehlerGesehen && schreibvorgaenge.length === 0,
            `heutige Schreibvorgaenge nach Lesefehler: ${schreibvorgaenge.length} (${(schreibvorgaenge[0] || "-").slice(0, 120)}); Kindprozess: ${ausgabe.trim().slice(0, 200)}`);
          fertig();
        });
      });
    });
  });

  const offen = befunde.filter((b) => !b.behoben);
  console.log(`\n${befunde.length - offen.length} von ${befunde.length} Befunden behoben.`);
  if (offen.length) {
    console.log("Erwartungsgemaess ROT — die Befunde bestehen. Fix ist ein eigener, freigabepflichtiger Sprint");
    console.log("(docs/roadmap/punkt-29-fehlervertrag.md §5). Nach dem Fix zusaetzlich die gepinnten");
    console.log("Assertions B9/C9/D9 in scripts/punkt29-fehlervertrag-test.js umstellen.");
    process.exit(1);
  }
  console.log("Alle Befunde behoben — jetzt die gepinnten Assertions B9/C9/D9 im Fehlervertrag umstellen.");
  process.exit(0);
})().catch((error) => {
  console.error("PROBEN-FEHLER:", (error && error.stack) || error);
  process.exit(2);
});
