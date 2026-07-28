"use strict";

// Sprint 23B-1 — Offline-Tests der Matching-Auditpersistenz (Roadmap-Punkt 23).
//
// REIN OFFLINE: Fixtures + eine In-Memory-Nachbildung der Datenbank.
// Kein Netz, keine KI, keine echte Datenbank, keine Production-Beruehrung.
//
// Die Nachbildung setzt dieselben Regeln durch wie die Migration
// 20260728_matching_audit.sql — insbesondere den Teilindex fuer die
// Idempotenz und den Unveraenderlichkeits-Trigger fuer abgeschlossene Laeufe.
// Damit pruefen die Tests nicht nur den Anwendungscode, sondern auch, dass er
// mit den DB-Zusicherungen zusammenpasst.
//
// Abgedeckt: T1…T18 der Sprintvorgabe.

const fs = require("fs");
const path = require("path");

const contract = require("../lib/helmut/matching-contract");
const auditModul = require("../lib/helmut/matching-audit");
const begruendung = require("../lib/helmut/matching-begruendung");
const matching = require("../lib/helmut/matching");

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const j = (v) => JSON.stringify(v);

const WURZEL = path.join(__dirname, "..");
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), "utf8");

// Statische Pruefungen muessen auf dem AUSFUEHRBAREN Teil arbeiten. Ein
// Kommentar, der ausdruecklich festhaelt „diese Tabelle wird NICHT gelesen",
// darf nicht als Fund gelten — sonst wuerde die Doku den Test brechen.
const ohneJsKommentare = (src) => String(src)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^[ \t]*\/\/.*$/gm, " ")
  .replace(/([^:])\/\/.*$/gm, "$1");
const ohneSqlKommentare = (src) => String(src).replace(/^[ \t]*--.*$/gm, " ").replace(/--.*$/gm, "");
// Zusaetzlich Zeichenketten entfernen: `comment on … is '…'` ist ausfuehrbares
// SQL, aber reine Dokumentation — es fasst keine Tabelle an.
const nurAnweisungen = (src) => ohneSqlKommentare(src).replace(/'(?:[^']|'')*'/g, "''");
// Nur das, was die Migration BEIM ANWENDEN tut. Funktionsrümpfe ($$ … $$) sind
// Laufzeitlogik und werden hier bewusst ausgeblendet — sonst zaehlte ein
// UPDATE innerhalb der Publish-Funktion faelschlich als Backfill.
const nurDdl = (src) => nurAnweisungen(src).replace(/\$\$[\s\S]*?\$\$/g, " ");

const MIGRATION = lies("supabase/migrations/20260728_matching_audit.sql");
const ROLLBACK = lies("supabase/migrations/20260728_matching_audit_rollback.sql");
const SRC_CONTRACT = lies("lib/helmut/matching-contract.js");
const SRC_AUDIT = lies("lib/helmut/matching-audit.js");
const SRC_BEGRUENDUNG = lies("lib/helmut/matching-begruendung.js");
const SRC_MATCHING = lies("lib/helmut/matching.js");

// ═══════════════════════════════════════════════════════════════════════════
// In-Memory-Nachbildung der Datenbank
// ═══════════════════════════════════════════════════════════════════════════

// Fachliche Spalten eines Laufs — an einem abgeschlossenen Lauf unveraenderlich
// (identisch zur Liste im Trigger helmut_matching_run_immutable).
const UNVERAENDERLICH = [
  "status", "user_id", "mandate_profile_id", "pipeline_run_id", "ausloeser",
  "engine_version", "rezept_version", "vektor_version", "profil_hash",
  "kandidaten_hash", "schwellenwerte", "eingabe_fingerabdruck", "gestartet_am",
  "beendet_am", "kandidaten", "berechnet", "veroeffentlicht", "abgeloest",
  "ergebnis", "created_at"
];

function makeDb() {
  const db = {
    runs: new Map(),
    results: new Map(),
    locks: new Map(),
    zaehler: { insertRun: 0, patchRun: 0, saveResults: 0, publish: 0, lockAcquire: 0, findRun: 0 },
    lockFehlschlagFuer: null,
    insertFehler: null,
    publishFehler: null,
    uhr: 0,
    lauf: 0
  };

  db.jetzt = () => new Date(Date.UTC(2026, 6, 28, 12, 0, 0) + (db.uhr += 1000));

  db.deps = {
    enabled: () => true,
    now: () => db.jetzt(),
    randomSuffix: () => String(1000 + (db.lauf += 1)),

    acquireLock: (name) => {
      db.zaehler.lockAcquire += 1;
      if (db.lockFehlschlagFuer === name) return false;
      if (db.locks.get(name)) return false;
      db.locks.set(name, true);
      return true;
    },
    releaseLock: (name) => { db.locks.delete(name); return true; },

    findCompletedRun: ({ userId, fingerprint }) => {
      db.zaehler.findRun += 1;
      if (!userId) throw new Error("[tenant-guard] findCompletedRun: kein Mandant");
      for (const r of db.runs.values()) {
        // exakt der Teilindex der Migration: nur status='vollstaendig'
        if (r.user_id === userId && r.eingabe_fingerabdruck === fingerprint && r.status === "vollstaendig") {
          return { ...r };
        }
      }
      return null;
    },

    insertRun: (row) => {
      db.zaehler.insertRun += 1;
      if (db.insertFehler) throw new Error(db.insertFehler);
      if (!row.user_id) throw new Error("[tenant-guard] saveMatchingRun: kein Mandant");
      if (!row.mandate_profile_id || !String(row.mandate_profile_id).trim()) {
        throw new Error("check-constraint: mandate_profile_id leer");
      }
      if (!contract.RUN_STATUS_VALUES.includes(row.status)) {
        throw new Error(`check-constraint: status ${row.status} unzulaessig`);
      }
      if (db.runs.has(row.id)) throw new Error("primary key: doppelte Laufkennung");
      db.runs.set(row.id, { ...row, created_at: db.jetzt().toISOString() });
      return { ...db.runs.get(row.id) };
    },

    patchRun: (id, patch, userId) => {
      db.zaehler.patchRun += 1;
      if (!userId) throw new Error("[tenant-guard] updateMatchingRun: kein Mandant");
      const alt = db.runs.get(id);
      // Der Mandantenfilter ist Pflicht: eine fremde Zeile ist nicht erreichbar.
      if (!alt || alt.user_id !== userId) {
        throw new Error(`matching_runs: Lauf ${id} fuer Mandant ${userId} nicht aktualisierbar`);
      }
      // Trigger helmut_matching_run_immutable
      if (alt.status === "vollstaendig") {
        for (const feld of UNVERAENDERLICH) {
          if (Object.prototype.hasOwnProperty.call(patch, feld) && j(patch[feld]) !== j(alt[feld])) {
            throw new Error(`matching_runs: abgeschlossener Lauf ${id} ist unveraenderlich (${feld})`);
          }
        }
      }
      // Teilindex matching_runs_fingerprint_uidx
      if (patch.status === "vollstaendig") {
        for (const r of db.runs.values()) {
          if (r.id !== id && r.user_id === alt.user_id
            && r.eingabe_fingerabdruck === alt.eingabe_fingerabdruck && r.status === "vollstaendig") {
            throw new Error("unique violation: matching_runs_fingerprint_uidx");
          }
        }
      }
      db.runs.set(id, { ...alt, ...patch });
      return { ...db.runs.get(id) };
    },

    // ATOMARE Veroeffentlichung — bildet helmut_publish_matching_run nach,
    // INKLUSIVE Transaktionssemantik: vor dem ersten Schreiben wird ein
    // Schnappschuss gezogen; jeder Fehler an JEDER Stelle stellt ihn
    // vollstaendig wieder her. Damit prueft die Suite genau das, was die
    // Datenbank zusichert — nicht nur die Aufrufreihenfolge im Anwendungscode.
    // `db.publishFehler` setzt den Abbruchpunkt: 'vor' | 'mitten' | 'nach'.
    publishRun: ({ runId, userId, rows = [], abgeloestAm }) => {
      db.zaehler.publish += 1;
      const snapRuns = new Map([...db.runs].map(([k, v]) => [k, { ...v }]));
      const snapResults = new Map([...db.results].map(([k, v]) => [k, { ...v }]));
      try {
        if (db.publishFehler === "vor") throw new Error("Abbruch VOR dem Schreiben (simuliert)");
        if (!userId) throw new Error("[tenant-guard] publishMatchingRun: kein Mandant");
        const lauf = db.runs.get(runId);
        // Nur ein LAUFENDER Lauf des richtigen Mandanten ist veroeffentlichbar.
        if (!lauf || lauf.user_id !== userId) {
          throw new Error(`publish: Lauf ${runId} fuer Mandant ${userId} nicht gefunden`);
        }
        if (lauf.status !== contract.RUN_STATUS.LAUFEND) {
          throw new Error(`publish: Lauf ${runId} ist im Zustand ${lauf.status}`);
        }
        for (const r of rows) {
          if (!r || r.user_id !== userId) throw new Error("[tenant-guard] CROSS_TENANT_WRITE");
          if (r.run_id !== runId) throw new Error("publish: Zeile verweist auf fremden Lauf");
          if (!r.id || !r.knowledge_object_id) throw new Error("publish: Zeile ohne Kennung");
        }
        const keep = new Set(rows.map((r) => r.knowledge_object_id));
        let abgeloest = 0;
        if (rows.length) {
          for (const row of db.results.values()) {
            if (row.user_id === userId && row.aktuell !== false && !keep.has(row.knowledge_object_id)) abgeloest += 1;
          }
        }
        // Schritt 1: Lauf abschliessen (damit der Riegel unten greifen kann).
        db.runs.set(runId, {
          ...lauf, status: contract.RUN_STATUS.VOLLSTAENDIG,
          beendet_am: db.jetzt().toISOString(), veroeffentlicht: rows.length, abgeloest
        });
        // Schritt 2: Projektion schreiben — mit Riegel matching_results_run_complete.
        rows.forEach((r, i) => {
          if (db.publishFehler === "mitten" && i === Math.floor(rows.length / 2)) {
            throw new Error("Abbruch WAEHREND der Ergebnisschreibung (simuliert)");
          }
          if (r.run_id) {
            const ziel = db.runs.get(r.run_id);
            if (!ziel) throw new Error(`matching_results: unbekannte Laufkennung ${r.run_id}`);
            if (ziel.status !== contract.RUN_STATUS.VOLLSTAENDIG) {
              throw new Error(`matching_results.run_id ${r.run_id} zeigt auf einen Lauf im Zustand ${ziel.status}`);
            }
          }
          const alt = db.results.get(r.id);
          db.results.set(r.id, {
            ...(alt || {}), ...r, aktuell: true, abgeloest_am: null,
            created_at: (alt && alt.created_at) || db.jetzt().toISOString()
          });
        });
        if (db.publishFehler === "nach") {
          throw new Error("Abbruch NACH der Ergebnisschreibung, vor dem Commit (simuliert)");
        }
        // Schritt 3: Abloesung — es wird NIE geloescht.
        if (rows.length) {
          for (const [id, row] of db.results) {
            if (row.user_id !== userId) continue;
            if (row.aktuell === false) continue;
            if (keep.has(row.knowledge_object_id)) continue;
            db.results.set(id, { ...row, aktuell: false, abgeloest_am: abgeloestAm });
          }
        }
        return { runId, status: contract.RUN_STATUS.VOLLSTAENDIG, veroeffentlicht: rows.length, abgeloest };
      } catch (e) {
        // ROLLBACK der gesamten Transaktion.
        db.runs = snapRuns;
        db.results = snapResults;
        throw e;
      }
    },

    profileBelongsToTenant: (profileId, tenantId) => String(profileId) === String(tenantId)
  };

  db.saveResults = (rows) => {
    db.zaehler.saveResults += 1;
    const besitzer = new Set(rows.map((r) => r.user_id));
    if (besitzer.size > 1) throw new Error("[tenant-guard] CROSS_TENANT_WRITE");
    for (const r of rows) {
      if (!r.user_id) throw new Error("[tenant-guard] Zeile ohne Mandant");
      db.results.set(r.id, { aktuell: true, abgeloest_am: null, ...r });
    }
    return { saved: rows.length };
  };

  db.audit = {
    acquireRunLock: (t) => auditModul.acquireRunLock(t, db.deps),
    releaseRunLock: (t) => auditModul.releaseRunLock(t, db.deps),
    auditRun: (input) => auditModul.auditRun(input, db.deps)
  };

  return db;
}

// ═══════════════════════════════════════════════════════════════════════════
// Fixtures — mandantenneutral, frei erfundene Kennungen
// ═══════════════════════════════════════════════════════════════════════════

const profilA = {
  id: "mandant-alpha",
  partei: "SPD",
  committees: ["Ausschuss für Arbeit und Soziales"],
  wahlkreis: "Musterstadt",
  focusTopics: ["Rente"]
};
const profilB = {
  id: "mandant-beta",
  partei: "CDU",
  committees: ["Ausschuss für Verkehr"],
  wahlkreis: "Andersstadt",
  focusTopics: ["Schiene"]
};

const koRente = {
  id: "ko-rente", vorgang_id: "vg-rente", ko_version: 1,
  status: "neu", understanding_status: "complete",
  headline: "Rentenreform beschlossen",
  was_ist_passiert: "Der Bundestag hat die Rentenreform beschlossen.",
  warum_wichtig: "Die Reform verändert die Altersvorsorge.",
  ausschuesse: ["Ausschuss für Arbeit und Soziales"],
  parteien: ["SPD"], mentioned_locations: ["Musterstadt"], tags: ["Rente"]
};
const koKlima = {
  id: "ko-klima", vorgang_id: "vg-klima", ko_version: 1,
  status: "neu", understanding_status: "complete",
  headline: "Klimapaket vorgestellt",
  was_ist_passiert: "Die Regierung hat ein Klimapaket vorgestellt.",
  warum_wichtig: "Es betrifft die Energiewirtschaft.",
  ausschuesse: ["Ausschuss für Umwelt"], parteien: ["Grüne"], tags: ["Klima"]
};

const TREFFER = [
  { id: "ko-rente", vorgang_id: "vg-rente", similarity: 0.42 },
  { id: "ko-klima", vorgang_id: "vg-klima", similarity: 0.11 }
];

function laufDeps(db, { profile, kos = [koRente, koKlima], treffer = TREFFER, auditAn = true }) {
  return {
    enabled: () => true,
    getProfile: () => profile,
    saveProfileEmbedding: () => ({ saved: true }),
    matchByEmbedding: () => ({ results: treffer }),
    listKnowledgeObjects: () => kos,
    saveMatchingResults: (rows) => db.saveResults(rows),
    auditEnabled: () => auditAn,
    audit: () => db.audit
  };
}

const lauf = (db, opts, input = {}) =>
  matching.runMatchingShadow({ profile: opts.profile, ...input }, laufDeps(db, opts));

// ═══════════════════════════════════════════════════════════════════════════
// T1 — Identischer Eingang
// ═══════════════════════════════════════════════════════════════════════════
(async () => {
  const db = makeDb();
  const r1 = await lauf(db, { profile: profilA });
  const nachErstem = {
    runs: db.runs.size,
    saveResults: db.zaehler.saveResults,
    ergebnisse: [...db.results.values()].map((r) => ({ ...r }))
  };
  const r2 = await lauf(db, { profile: profilA });

  check("T1a erster Lauf erzeugt genau eine vollstaendige Laufzeile",
    nachErstem.runs === 1 && r1.audit.status === contract.RUN_STATUS.VOLLSTAENDIG && r1.audit.idempotent === false,
    j(r1.audit));
  check("T1b zweiter identischer Lauf erzeugt KEINE neue Laufzeile",
    db.runs.size === 1 && r2.audit.idempotent === true, `runs=${db.runs.size} ${j(r2.audit)}`);
  check("T1c zweiter identischer Lauf schreibt KEINE Ergebniszeile",
    db.zaehler.saveResults === nachErstem.saveResults, `saveResults=${db.zaehler.saveResults}`);
  check("T1d berechnet_am und updated_at bleiben unveraendert",
    j([...db.results.values()].map((r) => [r.berechnet_am, r.updated_at]))
      === j(nachErstem.ergebnisse.map((r) => [r.berechnet_am, r.updated_at])));
  check("T1e Wiederholung wird am Lauf mitgezaehlt (genau ein UPDATE)",
    [...db.runs.values()][0].wiederholungen === 1 && r2.audit.wiederholungen === 1);
  check("T1f identischer Zweitlauf erzeugt denselben Fingerabdruck",
    r1.audit.fingerprint === r2.audit.fingerprint);
  check("T1g Kandidatenzahl bleibt ehrlich, veroeffentlicht ist 0",
    r2.candidates === 2 && r2.saved === 0, j({ c: r2.candidates, s: r2.saved }));

  // ═════════════════════════════════════════════════════════════════════════
  // T2 — Profiländerung
  // ═════════════════════════════════════════════════════════════════════════
  const alteLaufzeile = j([...db.runs.values()][0]);
  const profilAgeaendert = { ...profilA, committees: ["Ausschuss für Gesundheit"] };
  const r3 = await lauf(db, { profile: profilAgeaendert });

  check("T2a geaenderter Profilstand erzeugt neuen Fingerabdruck",
    r3.audit.fingerprint !== r1.audit.fingerprint);
  check("T2b geaenderter Profilstand erzeugt eine neue Laufzeile",
    db.runs.size === 2 && r3.audit.idempotent === false);
  const alteZeileJetzt = j(db.runs.get(r1.audit.runId));
  check("T2c die alte Laufzeile bleibt fachlich unveraendert erhalten",
    alteZeileJetzt === alteLaufzeile, "Laufzeile wurde veraendert");
  check("T2d beide Laufzeilen tragen unterschiedliche Profilhashes",
    db.runs.get(r1.audit.runId).profil_hash !== db.runs.get(r3.audit.runId).profil_hash);

  // ═════════════════════════════════════════════════════════════════════════
  // T3 — Wissensobjektänderung
  // ═════════════════════════════════════════════════════════════════════════
  const db3 = makeDb();
  const a = await lauf(db3, { profile: profilA });
  // (a) fachlich wirksame Aenderung am Wissensobjekt, Aehnlichkeit unveraendert
  const koRenteNeu = { ...koRente, ausschuesse: ["Ausschuss für Gesundheit"], ko_version: 2 };
  const b = await lauf(db3, { profile: profilA, kos: [koRenteNeu, koKlima] });
  check("T3a geaenderte Merkmale des Wissensobjekts erzeugen neuen Fingerabdruck",
    b.audit.fingerprint !== a.audit.fingerprint);
  check("T3b die Aenderung erzeugt eine neue nachvollziehbare Generation",
    db3.runs.size === 2 && b.audit.idempotent === false);
  check("T3c die neue Generation traegt die neue Vorgangsversion",
    db3.runs.get(b.audit.runId).ergebnis.find((e) => e.ko_id === "ko-rente").ko_version === 2);
  // (b) geaenderte Aehnlichkeit erzeugt ebenfalls eine neue Generation
  const c = await lauf(db3, {
    profile: profilA, kos: [koRenteNeu, koKlima],
    treffer: [{ id: "ko-rente", vorgang_id: "vg-rente", similarity: 0.55 }, TREFFER[1]]
  });
  check("T3d geaenderte Aehnlichkeit erzeugt neuen Fingerabdruck",
    c.audit.fingerprint !== b.audit.fingerprint && db3.runs.size === 3);
  // (c) Aenderung ohne fachlichen Einfluss erzeugt KEINE neue Generation
  const koRenteKosmetik = { ...koRenteNeu, display_titel: "egal", classification_confidence: { x: 1 } };
  const d = await lauf(db3, {
    profile: profilA, kos: [koRenteKosmetik, koKlima],
    treffer: [{ id: "ko-rente", vorgang_id: "vg-rente", similarity: 0.55 }, TREFFER[1]]
  });
  check("T3e Aenderung ohne fachlichen Einfluss erzeugt KEINE neue Generation",
    d.audit.idempotent === true && db3.runs.size === 3, j(d.audit));

  // ═════════════════════════════════════════════════════════════════════════
  // T4 — Algorithmuswechsel
  // ═════════════════════════════════════════════════════════════════════════
  const basis = {
    tenantId: "mandant-alpha", mandateProfileId: "mandant-alpha", profileHash: "hash-1",
    engineVersion: "legacy-shadow-1", recipeVersion: "legacy_relevance_v1",
    vectorVersion: "feature-hash-256-v1",
    thresholds: { matchCount: 20, schwelle: null, filter: {} },
    ranking: [{ knowledge_object_id: "ko-a", rank: 1, similarity: 0.5 }]
  };
  const fpBasis = contract.computeInputFingerprint(basis).fingerprint;
  check("T4a neue Rezeptversion erzeugt einen anderen Fingerabdruck",
    contract.computeInputFingerprint({ ...basis, recipeVersion: "semantik_relevance_v1" }).fingerprint !== fpBasis);
  check("T4b neue Engine-Version erzeugt einen anderen Fingerabdruck",
    contract.computeInputFingerprint({ ...basis, engineVersion: "engine-2" }).fingerprint !== fpBasis);
  check("T4c neue Vektorversion erzeugt einen anderen Fingerabdruck",
    contract.computeInputFingerprint({ ...basis, vectorVersion: "semantic-256-v1" }).fingerprint !== fpBasis);
  check("T4d Engine, Rezept und Vektor sind DREI getrennte Achsen",
    ["engine_version", "rezept_version", "vektor_version"].every((s) => MIGRATION.includes(s)));

  // Ein abgeschlossener Lauf laesst sich fachlich nicht ueberschreiben.
  const db4 = makeDb();
  const alt4 = await lauf(db4, { profile: profilA });
  let ueberschriebbar = true;
  try {
    await db4.deps.patchRun(alt4.audit.runId, { ergebnis: [] }, "mandant-alpha");
  } catch (_) { ueberschriebbar = false; }
  check("T4e ein abgeschlossener Lauf ist gegen Ueberschreiben gesperrt", ueberschriebbar === false);
  let technischOk = true;
  try {
    await db4.deps.patchRun(alt4.audit.runId, { wiederaufnahme_am: "2026-07-28T13:00:00.000Z" }, "mandant-alpha");
  } catch (_) { technischOk = false; }
  check("T4f technische Wiederaufnahme-Metadaten bleiben fortschreibbar", technischOk === true);

  // ═════════════════════════════════════════════════════════════════════════
  // T5 — Teilweiser / fehlgeschlagener Lauf
  // ═════════════════════════════════════════════════════════════════════════
  const db5 = makeDb();
  const gut = await lauf(db5, { profile: profilA });
  const standNachGut = j([...db5.results.values()]);
  db5.publishFehler = "nach";
  let fehlerGeworfen = false;
  try {
    await lauf(db5, {
      profile: profilA,
      treffer: [{ id: "ko-rente", vorgang_id: "vg-rente", similarity: 0.9 }, TREFFER[1]]
    });
  } catch (_) { fehlerGeworfen = true; }
  db5.publishFehler = null;

  const fehlLauf = [...db5.runs.values()].find((r) => r.status === contract.RUN_STATUS.FEHLGESCHLAGEN);
  check("T5a ein Fehler in der Veroeffentlichung wird sichtbar gemeldet", fehlerGeworfen === true);
  check("T5b der Lauf steht auf fehlgeschlagen und traegt den Fehlertext",
    !!fehlLauf && typeof fehlLauf.fehler === "string" && fehlLauf.fehler.length > 0);
  check("T5c der letzte VOLLSTAENDIGE Lauf bleibt unveraendert erhalten",
    db5.runs.get(gut.audit.runId).status === contract.RUN_STATUS.VOLLSTAENDIG
    && db5.runs.get(gut.audit.runId).eingabe_fingerabdruck === gut.audit.fingerprint);
  // Ein fehlgeschlagener Lauf zaehlt NIE als idempotenter Treffer.
  const nachFehler = fehlLauf
    ? db5.deps.findCompletedRun({ userId: "mandant-alpha", fingerprint: fehlLauf.eingabe_fingerabdruck })
    : "kein-fehlgeschlagener-Lauf-vorhanden";
  check("T5d ein fehlgeschlagener Lauf gilt NIE als vollstaendiger Treffer", nachFehler === null,
    j(nachFehler));
  // Ein 'laufend' stehengebliebener Lauf ebenfalls nicht.
  db5.runs.set("mrun-haenger", {
    id: "mrun-haenger", user_id: "mandant-alpha", status: contract.RUN_STATUS.LAUFEND,
    eingabe_fingerabdruck: "fp-haenger"
  });
  check("T5e ein abgebrochener (laufend gebliebener) Lauf gilt NIE als Treffer",
    db5.deps.findCompletedRun({ userId: "mandant-alpha", fingerprint: "fp-haenger" }) === null);
  check("T5f nur drei Laufzustaende sind zugelassen",
    contract.RUN_STATUS_VALUES.length === 3
    && contract.RUN_STATUS_VALUES.join(",") === "laufend,vollstaendig,fehlgeschlagen");
  check("T5g der bisherige Ergebnisstand ging durch den Fehler nicht verloren",
    [...db5.results.values()].length === JSON.parse(standNachGut).length);

  // ═════════════════════════════════════════════════════════════════════════
  // T6 — Parallelität (gleiches Profil)
  // ═════════════════════════════════════════════════════════════════════════
  const db6 = makeDb();
  db6.locks.set(auditModul.lockName("mandant-alpha"), true); // fremder Lauf haelt die Sperre
  const gesperrt = await lauf(db6, { profile: profilA });
  check("T6a ein zweiter gleichzeitiger Lauf desselben Profils wird abgewiesen",
    gesperrt.skipped === true && gesperrt.reason === "matching-locked", j(gesperrt));
  check("T6b der abgewiesene Lauf schreibt NICHTS",
    db6.runs.size === 0 && db6.results.size === 0 && db6.zaehler.saveResults === 0);
  check("T6c die Sperre traegt keine feste Mandantenbindung",
    auditModul.lockName("x-1") === "matching-x-1" && !/cem/i.test(auditModul.lockName("x-1")));
  check("T6d nach einem regulaeren Lauf ist die Sperre wieder frei",
    (await (async () => {
      const d = makeDb();
      await lauf(d, { profile: profilA });
      return d.locks.size === 0;
    })()));

  // ═════════════════════════════════════════════════════════════════════════
  // T7 — Unterschiedliche Profile parallel
  // ═════════════════════════════════════════════════════════════════════════
  const db7 = makeDb();
  db7.locks.set(auditModul.lockName("mandant-alpha"), true);
  const anderer = await lauf(db7, { profile: profilB });
  check("T7a ein anderes Profil laeuft trotz gehaltener Fremdsperre",
    anderer.skipped !== true && anderer.audit && anderer.audit.status === contract.RUN_STATUS.VOLLSTAENDIG,
    j(anderer));
  check("T7b unterschiedliche Profile tragen unterschiedliche Sperrnamen",
    auditModul.lockName("mandant-alpha") !== auditModul.lockName("mandant-beta"));
  check("T7c die Laeufe beider Profile sind sauber getrennt",
    [...db7.runs.values()].every((r) => r.user_id === "mandant-beta"));

  // ═════════════════════════════════════════════════════════════════════════
  // T8 — Fremder Mandant / fremdes Profil
  // ═════════════════════════════════════════════════════════════════════════
  const db8 = makeDb();
  let fremdesProfilAbgelehnt = false, fehlerCode = null;
  try {
    await auditModul.auditRun({
      ...basis, tenantId: "mandant-alpha", mandateProfileId: "mandant-beta",
      buildRows: () => []
    }, db8.deps);
  } catch (e) { fremdesProfilAbgelehnt = true; fehlerCode = e.code; }
  check("T8a eine fremde Profilkennung wird hart abgelehnt", fremdesProfilAbgelehnt === true);
  check("T8b die Ablehnung traegt den Mandanten-Fehlercode", fehlerCode === "CROSS_TENANT_WRITE");
  check("T8c der abgelehnte Schreibversuch hinterlaesst nichts",
    db8.runs.size === 0 && db8.results.size === 0 && db8.zaehler.insertRun === 0);

  let ohneMandant = false;
  try {
    await auditModul.auditRun({ ...basis, tenantId: "", buildRows: () => [] }, db8.deps);
  } catch (_) { ohneMandant = true; }
  check("T8d ein Lauf ohne Mandant wird abgelehnt", ohneMandant === true);

  let fremdePatch = false;
  const db8b = makeDb();
  const eigen = await lauf(db8b, { profile: profilA });
  try {
    await db8b.deps.patchRun(eigen.audit.runId, { wiederholungen: 99 }, "mandant-beta");
  } catch (_) { fremdePatch = true; }
  check("T8e ein fremder Mandant kann eine bestehende Laufzeile nicht aendern", fremdePatch === true);

  let gemischt = false;
  try {
    db8b.saveResults([
      { id: "mr-a", user_id: "mandant-alpha", knowledge_object_id: "ko-1" },
      { id: "mr-b", user_id: "mandant-beta", knowledge_object_id: "ko-2" }
    ]);
  } catch (_) { gemischt = true; }
  check("T8f ein gemischter Schreibstapel wird abgelehnt (CROSS_TENANT_WRITE)", gemischt === true);

  // ═════════════════════════════════════════════════════════════════════════
  // T9 — RLS und Berechtigungen (statisch gegen die Migration)
  // ═════════════════════════════════════════════════════════════════════════
  check("T9a RLS ist auf matching_runs aktiviert",
    /alter table public\.matching_runs enable row level security/.test(MIGRATION));
  check("T9b es gibt eine Mandantentrennungs-Policy gegen helmut_current_tenant()",
    /create policy matching_runs_tenant_read[\s\S]*using \(user_id = public\.helmut_current_tenant\(\)\)/.test(MIGRATION));
  check("T9c die Policy gilt NUR fuer authenticated und NUR lesend",
    /for select to authenticated/.test(MIGRATION));
  check("T9d es gibt KEINE Policy fuer anon",
    !/to anon/.test(MIGRATION) && !/create policy[^;]*anon/.test(MIGRATION));
  check("T9e Default-Grants werden entzogen (public, anon, authenticated)",
    /revoke all on table public\.matching_runs from public, anon, authenticated/.test(nurAnweisungen(MIGRATION)));
  check("T9f authenticated bekommt ausschliesslich SELECT — kein Schreibrecht, kein TRUNCATE",
    /grant select on table public\.matching_runs to authenticated/.test(nurAnweisungen(MIGRATION))
    && !/grant (insert|update|delete|truncate|all)[^;]*matching_runs/i.test(nurAnweisungen(MIGRATION)));
  check("T9g die Auditstruktur erbt den TRUNCATE-Befund M-6 nicht",
    !/grant[^;]*truncate/i.test(nurAnweisungen(MIGRATION)));
  check("T9h bestehende Berechtigungen anderer Tabellen bleiben unangetastet",
    !/(revoke|grant)[^;]*matching_results/i.test(nurAnweisungen(MIGRATION)));

  // ═════════════════════════════════════════════════════════════════════════
  // T10 — service_role wird NICHT als RLS-geschuetzt behauptet
  // ═════════════════════════════════════════════════════════════════════════
  check("T10a die Migration benennt den service_role-Bypass ausdruecklich",
    /service_role/.test(MIGRATION) && /(BYPASSRLS|umgeht)/.test(MIGRATION));
  check("T10b die Migration nennt die App-Guards als das Durchsetzende",
    /assertTenant/.test(MIGRATION) && /user_id=eq\./.test(MIGRATION));
  check("T10c weder Migration noch Module behaupten RLS-Schutz fuer service_role",
    ![MIGRATION, SRC_AUDIT, SRC_CONTRACT].some((t) => /service_role[^.\n]{0,80}(durch RLS|von RLS) (geschuetzt|geschützt)/i.test(t)));
  check("T10d die Audit-Schnittstelle dokumentiert die app-seitige Durchsetzung",
    /service_role umgeht RLS/.test(SRC_AUDIT) || /Mandantentrennung liegt\s*\n?\/\/ app-seitig/.test(SRC_AUDIT));

  // ═════════════════════════════════════════════════════════════════════════
  // T11 — Legacy-Stabilität: Scores, Ranking, matched_features unveraendert
  // ═════════════════════════════════════════════════════════════════════════
  const LEGACY_FELDER = ["id", "user_id", "knowledge_object_id", "vorgang_id",
    "similarity", "rank", "matched_features", "filters"];
  const nurLegacy = (rows) => rows.map((r) => {
    const o = {};
    for (const f of LEGACY_FELDER) o[f] = r[f];
    return o;
  });

  const dbAus = makeDb();
  const ausRows = [];
  const resAus = await matching.runMatchingShadow({ profile: profilA }, {
    ...laufDeps(dbAus, { profile: profilA, auditAn: false }),
    saveMatchingResults: (rows) => { ausRows.push(...rows); return { saved: rows.length }; }
  });
  const dbAn = makeDb();
  const anRows = [];
  const echterPublish = dbAn.deps.publishRun;
  dbAn.deps.publishRun = (p) => { anRows.push(...p.rows); return echterPublish(p); };
  const resAn = await matching.runMatchingShadow({ profile: profilA },
    laufDeps(dbAn, { profile: profilA, auditAn: true }));
  dbAn.deps.publishRun = echterPublish;

  check("T11a Kandidaten, Aehnlichkeiten, Raenge, matched_features und Kennungen sind identisch",
    j(nurLegacy(ausRows)) === j(nurLegacy(anRows)),
    `aus=${j(nurLegacy(ausRows))} an=${j(nurLegacy(anRows))}`);
  check("T11b die Ergebniskennungen folgen unveraendert dem Muster mr-<mandant>-<vorgang>",
    anRows.every((r) => r.id === `mr-${r.user_id}-${r.knowledge_object_id}`));
  check("T11c die Auswahl (Anzahl und Reihenfolge) ist unveraendert",
    ausRows.length === anRows.length && j(ausRows.map((r) => r.rank)) === j(anRows.map((r) => r.rank)));
  check("T11d die bestehende Rueckgabe bleibt kompatibel",
    resAus.userId === resAn.userId && resAus.candidates === resAn.candidates
    && resAus.saved === resAn.saved && j(resAus.filters) === j(resAn.filters));
  check("T11e kein Schwellenwert wird eingefuehrt (Rangliste unbeschnitten)",
    anRows.length === 2 && dbAn.runs.get(resAn.audit.runId).schwellenwerte.schwelle === null);
  check("T11g der Auditpfad ruft saveMatchingResults NICHT mehr auf (nur die atomare Veroeffentlichung)",
    dbAn.zaehler.saveResults === 0 && dbAn.zaehler.publish === 1,
    j({ save: dbAn.zaehler.saveResults, publish: dbAn.zaehler.publish }));
  check("T11f die Audit-Erweiterung sitzt NACH der Zeilenbildung",
    SRC_MATCHING.indexOf("const rows = (search.results || []).map")
    < SRC_MATCHING.indexOf("// ── Mit Auditpersistenz"));

  // ═════════════════════════════════════════════════════════════════════════
  // T12 — Semantik strikt getrennt
  // ═════════════════════════════════════════════════════════════════════════
  const NEUE_MODULE = { SRC_CONTRACT, SRC_AUDIT, SRC_BEGRUENDUNG };
  for (const [name, src] of Object.entries(NEUE_MODULE)) {
    check(`T12a ${name} liest knowledge_object_embeddings nicht`,
      !/knowledge_object_embeddings/.test(ohneJsKommentare(src)));
  }
  check("T12a2 auch der Auditpfad in matching.js beruehrt die Embedding-Tabelle nicht",
    !/knowledge_object_embeddings|embedding-contract|embedding-backfill/.test(ohneJsKommentare(SRC_MATCHING)));
  check("T12b die Migration fasst knowledge_object_embeddings nicht an",
    !/knowledge_object_embeddings/.test(nurAnweisungen(MIGRATION))
    && !/knowledge_object_embeddings/.test(nurAnweisungen(ROLLBACK)));
  check("T12c die Rezeptversion des Legacy-Pfades ist nicht der Embedding-Datenvertrag",
    contract.LEGACY_RECIPE_VERSION === "legacy_relevance_v1"
    && contract.LEGACY_RECIPE_VERSION !== require("../lib/helmut/embedding-contract").RECIPE_VERSION);
  check("T12d der 256-dim Merkmalsvektor wird ehrlich als Legacy-Vektorversion gefuehrt",
    contract.legacyVectorVersion(256) === "feature-hash-256-v1");
  check("T12e Engine- und Vektorversion verhindern eine spaetere Verwechslung",
    contract.LEGACY_ENGINE_VERSION !== contract.LEGACY_RECIPE_VERSION
    && contract.legacyVectorVersion(256) !== contract.LEGACY_RECIPE_VERSION);
  check("T12f semantische Aehnlichkeit wird nicht als Relevanzsignal gespeichert",
    !/semantic|semantisch(e|er)? (Aehnlichkeit|Ähnlichkeit)/i.test(
      j([...dbAn.results.values()].map((r) => r.signale))));
  check("T12g die Eingabehashes beider Rezepte sind eigenstaendig",
    contract.computeKnowledgeObjectInputHash([{ token: "a", weight: 1 }], "legacy_relevance_v1")
    !== contract.computeKnowledgeObjectInputHash([{ token: "a", weight: 1 }], "ko-kanon-1"));

  // ═════════════════════════════════════════════════════════════════════════
  // T13 — Stabile Reihenfolge
  // ═════════════════════════════════════════════════════════════════════════
  const eintraege = [
    { knowledge_object_id: "ko-c", rank: 3, similarity: 0.1, ko_eingabe_hash: "h3" },
    { knowledge_object_id: "ko-a", rank: 1, similarity: 0.9, ko_eingabe_hash: "h1" },
    { knowledge_object_id: "ko-b", rank: 2, similarity: 0.5, ko_eingabe_hash: "h2" }
  ];
  const gedreht = [...eintraege].reverse();
  check("T13a dieselbe Menge in anderer Reihenfolge ergibt dieselbe gespeicherte Rangliste",
    j(contract.buildRanking(eintraege)) === j(contract.buildRanking(gedreht)));
  check("T13b die gespeicherte Rangliste ist nach Rang sortiert",
    j(contract.buildRanking(gedreht).map((e) => e.ko_id)) === j(["ko-a", "ko-b", "ko-c"]));
  check("T13c dieselbe Menge in anderer Reihenfolge ergibt denselben Fingerabdruck",
    contract.computeInputFingerprint({ ...basis, ranking: eintraege }).fingerprint
    === contract.computeInputFingerprint({ ...basis, ranking: gedreht }).fingerprint);
  check("T13d der Kandidatenhash ist reihenfolgeunabhaengig",
    contract.computeCandidateSetHash(eintraege, "r1") === contract.computeCandidateSetHash(gedreht, "r1"));
  check("T13e gleiche Aehnlichkeit wird stabil nach Kennung aufgeloest",
    j(contract.buildRanking([
      { knowledge_object_id: "ko-z", similarity: 0.5 }, { knowledge_object_id: "ko-a", similarity: 0.5 }
    ]).map((e) => e.ko_id)) === j(["ko-a", "ko-z"]));
  check("T13f der Fingerabdruck haengt NICHT von Lauf-ID, Zeit oder Ausloeser ab",
    contract.computeInputFingerprint(basis).fingerprint
    === contract.computeInputFingerprint({ ...basis, pipelineRunId: "x", ausloeser: "manuell", startedAt: new Date() }).fingerprint);
  check("T13g die kanonische Serialisierung ist schluesselreihenfolgeunabhaengig",
    contract.canonicalJson({ b: 1, a: 2 }) === contract.canonicalJson({ a: 2, b: 1 }));
  check("T13h die Sortierung ist byte-stabil (kein localeCompare im Vertrag)",
    !/localeCompare/.test(ohneJsKommentare(SRC_CONTRACT)));
  check("T13i Token-Umsortierung im Wissensobjekt aendert den Eingabehash nicht",
    contract.computeKnowledgeObjectInputHash(
      [{ token: "b", weight: 2 }, { token: "a", weight: 1 }], "r") ===
    contract.computeKnowledgeObjectInputHash(
      [{ token: "a", weight: 1 }, { token: "b", weight: 2 }], "r"));

  // ═════════════════════════════════════════════════════════════════════════
  // T14 — Deterministische Begründung
  // ═════════════════════════════════════════════════════════════════════════
  const signale = begruendung.buildSignals([
    { type: "partei", value: "SPD" },
    { type: "ausschuss", value: "Arbeit und Soziales" },
    { type: "thema", value: "Rente" }
  ], 0.42);
  const satz = begruendung.begruendungAusSignalen(signale, []);
  check("T14a identische Signale erzeugen exakt dieselbe Begruendung",
    Array.from({ length: 50 }, () => begruendung.begruendungAusSignalen(signale, []))
      .every((s) => s === satz));
  const BAUSTEINE = ["deinen Ausschuss", "deinen Schwerpunkt", "deinen Wahlkreis", "deine Partei"];
  const alleVier = begruendung.buildSignals([
    { type: "partei", value: "SPD" }, { type: "ausschuss", value: "Arbeit und Soziales" },
    { type: "thema", value: "Rente" }, { type: "wahlkreis", value: "Musterstadt" }
  ], 0.42);
  const satzVier = begruendung.begruendungAusSignalen(alleVier, []);
  check("T14b die Begruendung nennt hoechstens zwei Gruende — auch bei vier Belegen",
    BAUSTEINE.filter((b) => satzVier.includes(b)).length === 2, satzVier);
  check("T14c Ausschuss und Fachthema schlagen die Partei",
    satz === "Betrifft deinen Ausschuss Arbeit und Soziales und deinen Schwerpunkt Rente.", satz);
  check("T14d die Begruendung enthaelt keine Zahl, keinen Score, kein Fachwort",
    !/\d/.test(satz) && !/(Score|Rang|Ähnlichkeit|Aehnlichkeit|Vektor|Matching|%)/i.test(satz));
  check("T14e Partei allein wird genannt, wenn sie der einzige Beleg ist",
    begruendung.begruendungAusSignalen(
      begruendung.buildSignals([{ type: "partei", value: "SPD" }], 0.2), []) === "Betrifft deine Partei SPD.");
  check("T14f die Prioritaetsreihenfolge ist fest verankert",
    j(begruendung.PRIORITAET) === j(["ausschuss", "thema", "wahlkreis", "partei"]));
  check("T14g die Begruendung entsteht ohne KI und ohne Netz",
    !/(fetch|https?:\/\/|require\(".\/ai")/.test(SRC_BEGRUENDUNG));

  // ═════════════════════════════════════════════════════════════════════════
  // T15 — Keine Begründung ohne Beleg
  // ═════════════════════════════════════════════════════════════════════════
  check("T15a ohne belegtes Signal entsteht KEINE Begruendung",
    begruendung.begruendungAusSignalen({}, []) === null);
  check("T15b ein reiner Aehnlichkeitswert ist kein Grund",
    begruendung.begruendungAusSignalen(begruendung.buildSignals([], 0.9), []) === null);
  check("T15c leere Merkmalswerte erzeugen keinen Satz",
    begruendung.begruendungAusSignalen({}, [{ type: "ausschuss", value: "   " }]) === null);
  check("T15d unbelegte Vorgaenge tragen begruendung=null in der Projektion",
    [...dbAn.results.values()].some((r) => r.knowledge_object_id === "ko-klima" && r.begruendung === null));
  check("T15e es wird kein Ersatzgrund erfunden",
    !/(vermutlich|moeglicherweise|möglicherweise|koennte|könnte)/i.test(SRC_BEGRUENDUNG.replace(/^\/\/.*$/gm, "")));
  check("T15f signale enthaelt nur real berechnete Werte, keine leeren Teilscores",
    !/fachlich(er)?_score|geografisch(er)?_score|institutionell(er)?_score/.test(SRC_BEGRUENDUNG + MIGRATION));

  // ═════════════════════════════════════════════════════════════════════════
  // T16 — Migration
  // ═════════════════════════════════════════════════════════════════════════
  const ADDITIVE_SPALTEN = ["run_id", "profil_hash", "ko_eingabe_hash", "ko_version",
    "engine_version", "rezept_version", "vektor_version", "eingabe_fingerabdruck",
    "berechnet_am", "aktuell", "abgeloest_am", "signale", "begruendung", "updated_at"];
  check("T16a die Migration ist in eine Transaktion gefasst",
    /^begin;/m.test(MIGRATION) && /^commit;/m.test(MIGRATION));
  check("T16b alle 14 additiven Spalten werden ergaenzt",
    ADDITIVE_SPALTEN.every((s) => new RegExp(`add column if not exists ${s}\\b`).test(MIGRATION)),
    ADDITIVE_SPALTEN.filter((s) => !new RegExp(`add column if not exists ${s}\\b`).test(MIGRATION)).join(","));
  check("T16c die Migration ist wiederholbar (leere UND bestehende Struktur)",
    /create table if not exists public\.matching_runs/.test(MIGRATION)
    && /create unique index if not exists/.test(MIGRATION)
    && !/add column (?!if not exists)/.test(MIGRATION));
  check("T16d die Migration ist NICHT destruktiv",
    !/drop table|drop column|truncate|delete from|alter column [a-z_]+ type|alter column [a-z_]+ set not null/i
      .test(nurDdl(MIGRATION)));
  check("T16e die Migration selbst veraendert keine bestehende Ergebniszeile (kein Backfill)",
    !/update public\.matching_results/i.test(nurDdl(MIGRATION))
    && !/insert into public\.matching_results/i.test(nurDdl(MIGRATION)));
  check("T16f der eindeutige Index auf der operativen Identitaet ist angelegt",
    /create unique index if not exists matching_results_tenant_ko_uidx[\s\S]*\(user_id, knowledge_object_id\)/.test(MIGRATION));
  check("T16g die Idempotenz ist als Teilindex datenbankseitig erzwungen",
    /create unique index if not exists matching_runs_fingerprint_uidx[\s\S]*where status = 'vollstaendig'/.test(MIGRATION));
  check("T16h die Statusliste der Datenbank stimmt mit dem Code ueberein",
    contract.RUN_STATUS_VALUES.every((s) => MIGRATION.includes(`'${s}'`))
    && /check \(status in \('laufend', 'vollstaendig', 'fehlgeschlagen'\)\)/.test(MIGRATION));
  check("T16i keine SECURITY-DEFINER-Funktion wird eingefuehrt",
    !/security definer/i.test(ohneSqlKommentare(MIGRATION)));
  check("T16j der Suchpfad der neuen Funktion ist fest gesetzt",
    /alter function public\.helmut_matching_run_immutable\(\) set search_path = public, pg_temp/.test(MIGRATION));
  check("T16k ein Rollback existiert und nimmt alle 14 Spalten zurueck",
    ADDITIVE_SPALTEN.every((s) => new RegExp(`drop column if exists ${s}\\b`).test(ROLLBACK)));
  check("T16l das Rollback entfernt Tabelle, Trigger, Policy und Funktion",
    /drop table if exists public\.matching_runs/.test(ROLLBACK)
    && /drop trigger if exists matching_runs_immutable/.test(ROLLBACK)
    && /drop policy if exists matching_runs_tenant_read/.test(ROLLBACK)
    && /drop function if exists public\.helmut_matching_run_immutable/.test(ROLLBACK));
  check("T16m das Rollback laesst die operative Projektion unangetastet",
    !/drop column if exists (similarity|rank|matched_features|filters|created_at|vorgang_id|user_id|knowledge_object_id)\b/
      .test(ROLLBACK));
  check("T16n die Migration ist als freigabepflichtig gekennzeichnet",
    /FREIGABEPFLICHTIG/.test(MIGRATION) && /NICHT ANWENDEN OHNE/.test(MIGRATION));
  check("T16o beide Dateien liegen im selben Verzeichnis (CLAUDE.md §4.8)",
    fs.existsSync(path.join(WURZEL, "supabase/migrations/20260728_matching_audit_rollback.sql")));

  // ═════════════════════════════════════════════════════════════════════════
  // T17 — Abbruch VOR der Veröffentlichung
  // ═════════════════════════════════════════════════════════════════════════
  const db17 = makeDb();
  const vorher = await lauf(db17, { profile: profilA });
  const standVorher = j([...db17.results.values()].sort((a, b) => a.id < b.id ? -1 : 1));
  const laeufeVorher = db17.runs.size;
  db17.insertFehler = "Laufzeile nicht schreibbar (simuliert)";
  let abgebrochen = false;
  try {
    await lauf(db17, {
      profile: profilA,
      treffer: [{ id: "ko-rente", vorgang_id: "vg-rente", similarity: 0.99 }]
    });
  } catch (_) { abgebrochen = true; }
  db17.insertFehler = null;
  check("T17a ein Auditfehler VOR der Veroeffentlichung bricht den Lauf ab", abgebrochen === true);
  check("T17b der bisherige Ergebnisstand bleibt byte-identisch erhalten",
    j([...db17.results.values()].sort((a, b) => a.id < b.id ? -1 : 1)) === standVorher);
  check("T17c es entsteht keine unvollstaendige Laufzeile", db17.runs.size === laeufeVorher);
  check("T17d der letzte vollstaendige Lauf bleibt der aktuelle Stand",
    db17.runs.get(vorher.audit.runId).status === contract.RUN_STATUS.VOLLSTAENDIG);
  check("T17e die Sperre wurde trotz Abbruch wieder freigegeben", db17.locks.size === 0);

  // Ablösung: aus der Trefferliste gefallene Zeilen bleiben erhalten.
  const db17b = makeDb();
  await lauf(db17b, { profile: profilA });
  const nurRente = await lauf(db17b, {
    profile: profilA,
    treffer: [{ id: "ko-rente", vorgang_id: "vg-rente", similarity: 0.42 }]
  });
  const klimaZeile = [...db17b.results.values()].find((r) => r.knowledge_object_id === "ko-klima");
  check("T17f eine aus der Trefferliste gefallene Zeile wird NICHT geloescht", !!klimaZeile);
  check("T17g sie wird als abgeloest markiert statt still weiterzugelten",
    klimaZeile.aktuell === false && !!klimaZeile.abgeloest_am && nurRente.audit.abgeloest === 1,
    j({ aktuell: klimaZeile.aktuell, ab: klimaZeile.abgeloest_am, n: nurRente.audit.abgeloest }));

  // ═════════════════════════════════════════════════════════════════════════
  // T18 — Feature-Grenze deaktiviert
  // ═════════════════════════════════════════════════════════════════════════
  const db18 = makeDb();
  const aus = await lauf(db18, { profile: profilA, auditAn: false });
  check("T18a ohne Auditpersistenz entsteht KEINE Laufzeile", db18.runs.size === 0);
  check("T18b ohne Auditpersistenz wird KEINE Sperre genommen", db18.zaehler.lockAcquire === 0);
  check("T18c ohne Auditpersistenz wird die Auditstruktur NICHT gelesen", db18.zaehler.findRun === 0);
  check("T18d die Ergebniszeilen tragen KEINE Audit-Spalten",
    ausRows.every((r) => !("run_id" in r) && !("aktuell" in r) && !("signale" in r) && !("begruendung" in r)));
  check("T18e die Rueckgabe ist die bisherige (ohne audit-Block)",
    aus.audit === undefined && aus.saved === 2 && aus.candidates === 2, j(aus));
  check("T18f das Flag ist standardmaessig AUS",
    (() => {
      const storage = require("../lib/helmut/storage");
      const alt = process.env.HELMUT_MATCHING_AUDIT;
      delete process.env.HELMUT_MATCHING_AUDIT;
      const off = storage.matchingAuditEnabled();
      if (alt === undefined) delete process.env.HELMUT_MATCHING_AUDIT; else process.env.HELMUT_MATCHING_AUDIT = alt;
      return off === false;
    })());
  check("T18g das Flag allein genuegt nicht — ohne V3-Store bleibt der Auditpfad inert",
    (() => {
      // Umgebungsunabhaengig: der Store wird fuer die Dauer der Pruefung
      // ausdruecklich entzogen (diese Sitzung kann Production-Secrets tragen).
      const storage = require("../lib/helmut/storage");
      const sichern = ["HELMUT_MATCHING_AUDIT", "SUPABASE_URL"].map((k) => [k, process.env[k]]);
      process.env.HELMUT_MATCHING_AUDIT = "on";
      delete process.env.SUPABASE_URL;
      const ohneStore = storage.matchingAuditEnabled();
      for (const [k, v] of sichern) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      return ohneStore === false;
    })());
  check("T18g2 die Rollout-Grenze ist an Flag UND Store gekoppelt",
    /isFlagOn\(process\.env\.HELMUT_MATCHING_AUDIT\) && v3StoreReady\(\)/.test(lies("lib/helmut/storage.js")));
  check("T18h HELMUT_SCORING_MODE wird von diesem Sprint nicht angefasst",
    !/HELMUT_SCORING_MODE/.test(SRC_MATCHING + SRC_AUDIT + SRC_CONTRACT + MIGRATION));

  // ═════════════════════════════════════════════════════════════════════════
  // A — ATOMIZITÄT DER VERÖFFENTLICHUNG
  //
  // Nachgereichte Verschärfung: matching_results ist die aktuelle operative
  // Produktprojektion und darf AUSSCHLIESSLICH auf einen vollständig
  // veröffentlichten Lauf zeigen. Eine blosse Schreibreihenfolge genügt dafür
  // nicht — matching_results wird in place überschrieben, ein Abbruch nach dem
  // Ergebnis-Upsert hätte den letzten vollständigen Stand also bereits
  // zerstört. Diese Gruppe prüft die Transaktionsgarantie an jedem Abbruchpunkt.
  // ═════════════════════════════════════════════════════════════════════════

  // Gemeinsame Ausgangslage: ein vollständiger Lauf ist veröffentlicht.
  async function mitStand() {
    const d = makeDb();
    const erst = await lauf(d, { profile: profilA });
    return {
      db: d,
      erst,
      stand: j([...d.results.values()].sort((a, b) => (a.id < b.id ? -1 : 1))),
      laeufe: d.runs.size
    };
  }
  // Ein zweiter Lauf mit anderem Eingang, damit er wirklich veröffentlichen will.
  const ANDERER_EINGANG = {
    profile: profilA,
    treffer: [{ id: "ko-rente", vorgang_id: "vg-rente", similarity: 0.77 }, TREFFER[1]]
  };
  const zeigtNurAufVollstaendige = (d) =>
    [...d.results.values()].every((r) => {
      if (!r.run_id) return true;
      const lz = d.runs.get(r.run_id);
      return !!lz && lz.status === contract.RUN_STATUS.VOLLSTAENDIG;
    });

  // ── A1 · Abbruch VOR der Ergebnisschreibung ───────────────────────────────
  {
    const { db: d, erst, stand, laeufe } = await mitStand();
    d.insertFehler = "Laufzeile nicht schreibbar (simuliert)";
    let geworfen = false;
    try { await lauf(d, ANDERER_EINGANG); } catch (_) { geworfen = true; }
    d.insertFehler = null;
    check("A1a Abbruch vor der Ergebnisschreibung wird gemeldet", geworfen === true);
    check("A1b die Projektion ist byte-identisch unveraendert",
      j([...d.results.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) === stand);
    check("A1c es entsteht keine zusaetzliche Laufzeile", d.runs.size === laeufe);
    check("A1d die vorherige vollstaendige Generation ist weiterhin die aktuelle",
      d.runs.get(erst.audit.runId).status === contract.RUN_STATUS.VOLLSTAENDIG
      && [...d.results.values()].every((r) => r.run_id === erst.audit.runId && r.aktuell === true));
    check("A1e es wurde ueberhaupt nicht veroeffentlicht", d.zaehler.publish === 1);
  }

  // ── A2 · Abbruch WÄHREND der Ergebnisschreibung ───────────────────────────
  {
    const { db: d, erst, stand } = await mitStand();
    d.publishFehler = "mitten";
    let geworfen = false;
    try { await lauf(d, ANDERER_EINGANG); } catch (_) { geworfen = true; }
    d.publishFehler = null;
    check("A2a Abbruch mitten in der Ergebnisschreibung wird gemeldet", geworfen === true);
    check("A2b die Transaktion wurde vollstaendig zurueckgerollt — keine halb geschriebene Projektion",
      j([...d.results.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) === stand);
    check("A2c der abgebrochene Lauf ist NICHT vollstaendig",
      [...d.runs.values()].filter((r) => r.status === contract.RUN_STATUS.VOLLSTAENDIG).length === 1);
    check("A2d die vorherige vollstaendige Generation bleibt aktuell",
      [...d.results.values()].every((r) => r.run_id === erst.audit.runId && r.aktuell === true));
    check("A2e keine Ergebniszeile verweist auf einen unvollstaendigen Lauf", zeigtNurAufVollstaendige(d));
  }

  // ── A3 · Abbruch NACH der Ergebnisschreibung, vor dem Laufabschluss ───────
  // Der kritische Fall aus dem Einwand: genau hier hätte eine blosse
  // Schreibreihenfolge den alten Stand bereits verloren.
  {
    const { db: d, erst, stand } = await mitStand();
    d.publishFehler = "nach";
    let geworfen = false;
    try { await lauf(d, ANDERER_EINGANG); } catch (_) { geworfen = true; }
    d.publishFehler = null;
    check("A3a Abbruch nach der Ergebnisschreibung wird gemeldet", geworfen === true);
    check("A3b der bisherige vollstaendige Stand ist VOLLSTAENDIG erhalten (byte-identisch)",
      j([...d.results.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) === stand,
      "die Projektion wurde trotz Rollback veraendert");
    check("A3c keine Aehnlichkeit wurde durch den abgebrochenen Lauf ueberschrieben",
      [...d.results.values()].find((r) => r.knowledge_object_id === "ko-rente").similarity === 0.42);
    check("A3d der abgebrochene Lauf steht auf fehlgeschlagen",
      [...d.runs.values()].some((r) => r.status === contract.RUN_STATUS.FEHLGESCHLAGEN));
    check("A3e die vorherige Generation ist weiterhin die aktuelle",
      [...d.results.values()].every((r) => r.run_id === erst.audit.runId && r.aktuell === true));
    check("A3f keine Ergebniszeile verweist auf den fehlgeschlagenen Lauf", zeigtNurAufVollstaendige(d));
  }

  // ── A4 · Fehler BEIM Laufabschluss ────────────────────────────────────────
  // Laufabschluss und Projektion sind derselbe Aufruf — ein Fehler dabei kann
  // die Projektion konstruktiv nicht halb aktualisiert hinterlassen.
  {
    const { db: d, erst, stand } = await mitStand();
    d.publishFehler = "vor"; // scheitert, bevor irgendetwas geschrieben ist
    let geworfen = false;
    try { await lauf(d, ANDERER_EINGANG); } catch (_) { geworfen = true; }
    d.publishFehler = null;
    check("A4a ein Fehler beim Laufabschluss wird gemeldet", geworfen === true);
    check("A4b Laufabschluss und Projektion sind EIN Aufruf — kein Zwischenzustand",
      j([...d.results.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) === stand
      && [...d.runs.values()].filter((r) => r.status === contract.RUN_STATUS.VOLLSTAENDIG).length === 1);
    check("A4c der letzte vollstaendige Lauf ist unveraendert",
      d.runs.get(erst.audit.runId).veroeffentlicht === 2
      && d.runs.get(erst.audit.runId).status === contract.RUN_STATUS.VOLLSTAENDIG);
  }

  // ── A5 · Parallele Veröffentlichung desselben Profils ─────────────────────
  {
    const { db: d, erst, stand } = await mitStand();
    // (a) App-Sperre: ein zweiter Lauf desselben Profils kommt gar nicht erst durch.
    d.locks.set(auditModul.lockName("mandant-alpha"), true);
    const parallel = await lauf(d, ANDERER_EINGANG);
    d.locks.delete(auditModul.lockName("mandant-alpha"));
    check("A5a die App-Sperre weist den parallelen Lauf desselben Profils ab",
      parallel.skipped === true && parallel.reason === "matching-locked");
    check("A5b der parallele Lauf veroeffentlicht nichts",
      j([...d.results.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) === stand);

    // (b) Zweite Verteidigung IN der Datenbank: derselbe Lauf kann nicht zweimal
    //     veroeffentlicht werden — der zweite Versuch findet ihn nicht mehr als
    //     'laufend' vor (Zustandspruefung unter Zeilensperre).
    let zweitVeroeffentlichung = false;
    try {
      await d.deps.publishRun({
        runId: erst.audit.runId, userId: "mandant-alpha",
        rows: [{ id: "mr-x", user_id: "mandant-alpha", knowledge_object_id: "ko-rente", run_id: erst.audit.runId }],
        abgeloestAm: "2026-07-28T12:30:00.000Z"
      });
    } catch (_) { zweitVeroeffentlichung = true; }
    check("A5c ein bereits vollstaendiger Lauf kann nicht erneut veroeffentlicht werden",
      zweitVeroeffentlichung === true);
    check("A5d auch dieser Versuch hat nichts veraendert",
      j([...d.results.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) === stand);

    // (c) Zwei echte Läufe nacheinander bleiben widerspruchsfrei: die Projektion
    //     gehoert danach genau EINEM vollstaendigen Lauf.
    const zweit = await lauf(d, ANDERER_EINGANG);
    check("A5e nach zwei Laeufen gehoert die aktuelle Projektion genau einem vollstaendigen Lauf",
      [...d.results.values()].filter((r) => r.aktuell).every((r) => r.run_id === zweit.audit.runId)
      && d.runs.get(zweit.audit.runId).status === contract.RUN_STATUS.VOLLSTAENDIG);
    check("A5f der aeltere vollstaendige Lauf bleibt als Historie erhalten",
      d.runs.get(erst.audit.runId).status === contract.RUN_STATUS.VOLLSTAENDIG);
  }

  // ── A6 · Nach JEDEM Fehler bleibt die vorherige vollständige Generation aktuell
  {
    for (const punkt of ["vor", "mitten", "nach"]) {
      const { db: d, erst, stand } = await mitStand();
      d.publishFehler = punkt;
      try { await lauf(d, ANDERER_EINGANG); } catch (_) { /* erwartet */ }
      d.publishFehler = null;
      const aktuelle = [...d.results.values()].filter((r) => r.aktuell);
      check(`A6 Abbruchpunkt '${punkt}': vorherige vollstaendige Generation bleibt aktuell`,
        j([...d.results.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) === stand
        && aktuelle.length === 2
        && aktuelle.every((r) => r.run_id === erst.audit.runId)
        && zeigtNurAufVollstaendige(d));
    }
    // Auch der Abbruch vor dem Anlegen der Laufzeile.
    const { db: d, erst, stand } = await mitStand();
    d.insertFehler = "Laufzeile nicht schreibbar (simuliert)";
    try { await lauf(d, ANDERER_EINGANG); } catch (_) { /* erwartet */ }
    d.insertFehler = null;
    check("A6 Abbruchpunkt 'Laufzeile': vorherige vollstaendige Generation bleibt aktuell",
      j([...d.results.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) === stand
      && [...d.results.values()].every((r) => r.run_id === erst.audit.runId && r.aktuell));
  }

  // ── A7 · Keine matching_results-Zeile verweist auf laufend/fehlgeschlagen ──
  {
    const d = makeDb();
    await lauf(d, { profile: profilA });
    for (const punkt of ["vor", "mitten", "nach"]) {
      d.publishFehler = punkt;
      try { await lauf(d, ANDERER_EINGANG); } catch (_) { /* erwartet */ }
      d.publishFehler = null;
    }
    d.insertFehler = "Laufzeile nicht schreibbar (simuliert)";
    try { await lauf(d, ANDERER_EINGANG); } catch (_) { /* erwartet */ }
    d.insertFehler = null;
    const zustaende = [...d.runs.values()].map((r) => r.status);
    check("A7a die Testlage enthaelt tatsaechlich fehlgeschlagene Laeufe",
      zustaende.includes(contract.RUN_STATUS.FEHLGESCHLAGEN), j(zustaende));
    check("A7b KEINE Ergebniszeile verweist auf einen laufenden oder fehlgeschlagenen Lauf",
      zeigtNurAufVollstaendige(d),
      j([...d.results.values()].map((r) => [r.id, r.run_id, d.runs.get(r.run_id) && d.runs.get(r.run_id).status])));
    check("A7c der Riegel ist datenbankseitig verankert, nicht nur im Code",
      /create trigger matching_results_run_complete[\s\S]*before insert or update of run_id on public\.matching_results/
        .test(nurAnweisungen(MIGRATION))
      && /zeigt auf einen Lauf im Zustand/.test(MIGRATION));
    // Gegenprobe: ein direkter Schreibversuch auf einen laufenden Lauf wird abgelehnt.
    let riegelGreift = false;
    d.runs.set("mrun-offen", {
      id: "mrun-offen", user_id: "mandant-alpha", mandate_profile_id: "mandant-alpha",
      status: contract.RUN_STATUS.LAUFEND, eingabe_fingerabdruck: "fp-offen"
    });
    try {
      d.deps.publishRun({
        runId: "mrun-offen", userId: "mandant-alpha",
        rows: [{ id: "mr-y", user_id: "mandant-alpha", knowledge_object_id: "ko-klima", run_id: "mrun-anderer" }]
      });
    } catch (_) { riegelGreift = true; }
    check("A7d eine Zeile mit fremder/unvollstaendiger Laufkennung wird abgelehnt", riegelGreift === true);
  }

  // ── A8 · Ein erfolgreicher Lauf veröffentlicht konsistent ─────────────────
  {
    const d = makeDb();
    const erfolg = await lauf(d, { profile: profilA });
    const lz = d.runs.get(erfolg.audit.runId);
    const zeilen = [...d.results.values()];
    check("A8a der Lauf ist vollstaendig und traegt ein Ende",
      lz.status === contract.RUN_STATUS.VOLLSTAENDIG && !!lz.beendet_am);
    check("A8b Laufzaehler und tatsaechliche Projektion stimmen ueberein",
      lz.veroeffentlicht === zeilen.length && zeilen.length === 2);
    check("A8c die Rangliste des Laufs deckt sich mit der Projektion",
      j(lz.ergebnis.map((e) => e.ko_id).sort())
      === j(zeilen.map((r) => r.knowledge_object_id).sort()));
    check("A8d jede Ergebniszeile verweist auf genau diesen vollstaendigen Lauf",
      zeilen.every((r) => r.run_id === erfolg.audit.runId && r.aktuell === true));
    check("A8e die Versionsangaben stehen an Lauf UND Projektion konsistent",
      zeilen.every((r) => r.rezept_version === lz.rezept_version
        && r.vektor_version === lz.vektor_version
        && r.engine_version === lz.engine_version
        && r.eingabe_fingerabdruck === lz.eingabe_fingerabdruck
        && r.profil_hash === lz.profil_hash));
    check("A8f die Veroeffentlichung war EIN einziger Aufruf",
      d.zaehler.publish === 1 && d.zaehler.saveResults === 0);
    check("A8g der Laufabschluss ist kein eigener Schreibvorgang mehr",
      d.zaehler.patchRun === 0, `patchRun=${d.zaehler.patchRun}`);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Z — Mandantenneutralität, Vollständigkeit, Vertragsdetails
  // ═════════════════════════════════════════════════════════════════════════
  for (const [name, src] of Object.entries({ ...NEUE_MODULE, MIGRATION, ROLLBACK })) {
    check(`Z1 ${name} enthaelt keinen hartkodierten Mandanten`, !/cem[-_\s]?ince/i.test(src));
  }
  check("Z2 die Laufzeile bildet alle geforderten Auditangaben ab",
    ["id", "user_id", "mandate_profile_id", "engine_version", "rezept_version", "vektor_version",
      "profil_hash", "kandidaten_hash", "schwellenwerte", "eingabe_fingerabdruck", "gestartet_am",
      "beendet_am", "status", "fehler", "kandidaten", "berechnet", "veroeffentlicht", "ergebnis",
      "created_at", "wiederaufnahme_am"].every((f) => MIGRATION.includes(f)));
  check("Z3 die kompakte Rangliste traegt genau die vereinbarten Felder",
    (() => {
      const e = db.runs.get(r1.audit.runId).ergebnis[0];
      return j(Object.keys(e).sort()) === j(["begruendung", "ko_eingabe_hash", "ko_id", "ko_version",
        "rank", "result_id", "signale", "similarity", "vorgang_id"].sort());
    })(), j(db.runs.get(r1.audit.runId).ergebnis[0]));
  check("Z4 die Rangliste speichert keine Texte und keine Vektoren",
    !/headline|was_ist_passiert|warum_wichtig|embedding/.test(j(db.runs.get(r1.audit.runId).ergebnis)));
  check("Z5 eine unvollstaendige Laufbeschreibung wird abgelehnt",
    (() => {
      try { contract.describeRun({ tenantId: "x" }); return false; }
      catch (e) { return e.code === "AUDIT_DESCRIPTOR_INCOMPLETE"; }
    })());
  check("Z6 die Profilkennung ist ersetzbar und nicht fest an den Mandanten gebunden",
    /profileBelongsToTenant/.test(SRC_AUDIT));
  check("Z7 das Auditprotokoll ist in der DSGVO-Loeschung gefuehrt",
    /\{ table: "matching_runs", key: "user_id" \}/.test(lies("lib/helmut/storage.js")));
  check("Z8 die Schwellenwerte werden ehrlich als 'kein Schwellenwert' gespeichert",
    j(contract.normalizeThresholds({ matchCount: 20, filter: {} }))
    === j({ match_count: 20, schwelle: null, filter: {} }));
  check("Z9 die Vertragsversion ist gesetzt und geht in den Fingerabdruck ein",
    contract.AUDIT_SCHEMA_VERSION === "matching-audit-1"
    && contract.computeInputFingerprint(basis).kanon.schema === "matching-audit-1");
  check("Z10 die Ablösung loescht niemals",
    !/delete/i.test(SRC_AUDIT) && !/DELETE FROM/i.test(MIGRATION));

  console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  console.error("FATAL", e && e.stack || e);
  process.exitCode = 1;
});
