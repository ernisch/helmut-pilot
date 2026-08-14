"use strict";

// Helmut — Vertragstest KONKURRENZWACHE JE VORGANG (OP-30-Zielarchitektur, Auftrag §8).
// =============================================================================================
// Die kleinste sichere Abloesung der globalen Verstehens-Serialisierung: eine atomare
// Belegung je VORGANG unmittelbar vor dem Modellaufruf (deps.clusterWache, gefuellt aus
// storage.vorgangsWache, Flag HELMUT_VERSTEHEN_KONKURRENZ, Default inert).
//
// Geprueft wird der VERTRAG (offline, Attrappen — die datenbank-atomare Belegung selbst
// weist verteilte-grenzen-datenbank-test.js §7 an echter PostgreSQL nach):
//   §1 Ohne Wache: byte-identisches Verhalten (kein Wache-Aufruf, KI laeuft)
//   §2 Belegte Wache: KEIN Modellaufruf, KEINE Verknuepfung, Cluster bleibt Nachholkandidat
//   §3 Freie Wache: genau ein Modellaufruf; Freigabe erst NACH der Persistenz
//   §4 Absturzsemantik: auch ein Speicherfehler gibt den Slot frei (finally)
//   §5 Zwei VERSCHIEDENE Vorgaenge laufen parallel (keine globale Serialisierung mehr)
//   §6 Nach Abschluss des Ersten bedient der Bestandskurzschluss den Zweiten OHNE Kosten
//   §7 Update-Pfad: dieselbe Wache, Vertagung zaehlt nicht als Fehlversuch
//   §8 Nicht pruefbare Wache (fail closed): kein Modellaufruf

const assert = require("assert");
const { understandOneCluster } = require("../lib/helmut/understanding");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

const ANALYSE = {
  headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
  display_title: "Bundestag debattiert Haushaltsentwurf", display_summary: "s",
  why_relevant: "w", recommendation: "r", display_category: "Haushalt"
};

function baueCluster(titel, id) {
  return { documents: [{ id, title: titel, published_at: "2026-08-13T08:00:00Z" }] };
}

function baueDeps(protokoll, extra = {}) {
  return {
    canSpend: () => ({ allowed: true }),
    requestUnderstanding: async () => { protokoll.kiAufrufe += 1; return { ...ANALYSE }; },
    save: async (ko) => { protokoll.gespeichert.push(ko.id); protokoll.reihenfolge.push("save"); return { saved: true, id: ko.id }; },
    saveSources: async (koId, docs) => { protokoll.verknuepft.push({ koId, ids: docs.map((d) => d.id) }); },
    markFailed: async () => {}, modelName: () => "test", logSkip: () => {},
    findVorgangCandidates: async () => [],
    listVorgangDocuments: async () => [],
    ...extra
  };
}

function neuesProtokoll() {
  return { kiAufrufe: 0, gespeichert: [], verknuepft: [], reihenfolge: [], wache: [] };
}

async function main() {
  console.log("Helmut — Vertragstest Konkurrenzwache je Vorgang (Abloesung des globalen Schlosses)");

  abschnitt("1 · Ohne Wache: byte-identisches Verhalten");
  {
    const p = neuesProtokoll();
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), baueDeps(p));
    check("1.1 Ohne clusterWache laeuft das Verstehen unveraendert (saved, 1 KI-Aufruf)",
      r.status === "saved" && p.kiAufrufe === 1, `status=${r.status} ki=${p.kiAufrufe}`);
  }

  abschnitt("2 · Belegte Wache: kein Modellaufruf, kein Endzustand");
  {
    const p = neuesProtokoll();
    const deps = baueDeps(p, {
      clusterWache: {
        belege: async (vorgangId) => { p.wache.push(["belege", vorgangId]); return { erlaubt: false, grund: "vorgang-belegt", slot: null }; },
        gebeFrei: async (slot) => { p.wache.push(["frei", slot]); }
      }
    });
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
    check("2.1 Belegter Vorgang -> skipped-cluster-belegt", r.status === "skipped-cluster-belegt", r.status);
    check("2.2 KEIN Modellaufruf (keine Doppel-KI-Kosten)", p.kiAufrufe === 0, String(p.kiAufrufe));
    check("2.3 KEINE Verknuepfung (das Dokument bleibt Nachholkandidat)", p.verknuepft.length === 0, String(p.verknuepft.length));
    check("2.4 Es wird nichts freigegeben, was nie belegt war", !p.wache.some((w) => w[0] === "frei"), JSON.stringify(p.wache));
  }

  abschnitt("3 · Freie Wache: ein Aufruf, Freigabe NACH der Persistenz");
  {
    const p = neuesProtokoll();
    const deps = baueDeps(p, {
      clusterWache: {
        belege: async (vorgangId) => { p.reihenfolge.push("belege"); p.wache.push(["belege", vorgangId]); return { erlaubt: true, slot: "slot-1" }; },
        gebeFrei: async (slot) => { p.reihenfolge.push("frei"); p.wache.push(["frei", slot]); }
      }
    });
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps);
    check("3.1 Freier Vorgang -> saved mit genau einem Modellaufruf", r.status === "saved" && p.kiAufrufe === 1, `${r.status}/${p.kiAufrufe}`);
    check("3.2 Freigabe erfolgt NACH dem Speichern (belege -> save -> frei)",
      JSON.stringify(p.reihenfolge) === JSON.stringify(["belege", "save", "frei"]), JSON.stringify(p.reihenfolge));
    check("3.3 Freigegeben wird der belegte Slot", p.wache.some((w) => w[0] === "frei" && w[1] === "slot-1"), JSON.stringify(p.wache));
  }

  abschnitt("4 · Absturzsemantik: Slot wird auch im Fehlerpfad freigegeben");
  {
    const p = neuesProtokoll();
    const deps = baueDeps(p, {
      save: async () => { throw new Error("supabase-timeout"); },
      clusterWache: {
        belege: async () => ({ erlaubt: true, slot: "slot-crash" }),
        gebeFrei: async (slot) => { p.wache.push(["frei", slot]); }
      }
    });
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps).catch((e) => ({ status: `geworfen:${e.message}` }));
    check("4.1 Der Slot wird trotz Speicherfehler freigegeben (finally)",
      p.wache.some((w) => w[0] === "frei" && w[1] === "slot-crash"), `${r.status} / ${JSON.stringify(p.wache)}`);
  }

  abschnitt("5 · Verschiedene Vorgaenge laufen parallel");
  {
    const p = neuesProtokoll();
    const belegt = new Set();
    const deps = baueDeps(p, {
      clusterWache: {
        belege: async (vorgangId) => {
          if (belegt.has(vorgangId)) return { erlaubt: false, grund: "vorgang-belegt", slot: null };
          belegt.add(vorgangId);
          return { erlaubt: true, slot: `slot-${vorgangId}` };
        },
        gebeFrei: async () => {}
      }
    });
    const [a, b] = await Promise.all([
      understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), deps),
      understandOneCluster(baueCluster("Bundesrat stoppt Vermittlungsausschuss Verfahren", "rd-2"), deps)
    ]);
    check("5.1 Zwei VERSCHIEDENE Vorgaenge werden parallel verstanden (2 Aufrufe, 2 Vorgaenge)",
      a.status === "saved" && b.status === "saved" && a.vorgangId !== b.vorgangId && p.kiAufrufe === 2,
      `${a.status}/${b.status} ki=${p.kiAufrufe}`);
  }

  abschnitt("6 · Derselbe Vorgang: erst exklusiv, dann kostenloser Bestandskurzschluss");
  {
    const p = neuesProtokoll();
    const cluster = baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1");
    const wache = {
      belege: async () => ({ erlaubt: true, slot: "s" }),
      gebeFrei: async () => {}
    };
    const erster = await understandOneCluster(cluster, baueDeps(p, { clusterWache: wache }));
    const bestand = { id: erster.id, vorgang_id: erster.vorgangId, status: "neu", understanding_status: "complete", ko_version: 1, created_at: "2026-08-13T08:05:00Z" };
    const zweiter = await understandOneCluster(cluster, baueDeps(p, {
      clusterWache: wache,
      findVorgangCandidates: async () => [bestand],
      listVorgangDocuments: async () => cluster.documents
    }));
    check("6.1 Der zweite Verarbeiter desselben Vorgangs zahlt NICHTS (duplicate, 1 KI-Aufruf gesamt)",
      erster.status === "saved" && zweiter.status === "duplicate" && p.kiAufrufe === 1,
      `${erster.status}/${zweiter.status} ki=${p.kiAufrufe}`);
  }

  abschnitt("7 · Update-Pfad: dieselbe Wache, Vertagung ohne Fehlversuch");
  {
    const p = neuesProtokoll();
    const cluster = baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1");
    const erster = await understandOneCluster(cluster, baueDeps(p));
    const bestand = { id: erster.id, vorgang_id: erster.vorgangId, status: "neu", understanding_status: "complete", ko_version: 1, created_at: "2026-08-13T08:05:00Z" };
    // Neues Dokument mit neuem Kernanker -> Update-Pfad.
    const clusterNeu = { documents: [...cluster.documents, { id: "rd-3", title: "Bundestag debattiert Haushaltsentwurf Aenderungsantrag Milliardenpaket", published_at: "2026-08-13T09:00:00Z" }] };
    const vormerkungen = {};
    const r = await understandOneCluster(clusterNeu, baueDeps(p, {
      findVorgangCandidates: async () => [bestand],
      listVorgangDocuments: async () => cluster.documents,
      readUpdateRetries: async () => vormerkungen,
      writeUpdateRetries: async () => {},
      clusterWache: {
        belege: async () => ({ erlaubt: false, grund: "vorgang-belegt", slot: null }),
        gebeFrei: async () => {}
      }
    }));
    check("7.1 Eine belegte Wache vertagt die Aktualisierung (skipped-cluster-belegt), kein 2. KI-Aufruf",
      r.status === "skipped-cluster-belegt" && p.kiAufrufe === 1, `${r.status} ki=${p.kiAufrufe}`);
    check("7.2 Die neuen Dokumente sind bereits verknuepft (nicht verlierbar)",
      p.verknuepft.some((v) => v.ids.includes("rd-3")), JSON.stringify(p.verknuepft));
  }

  abschnitt("8 · Nicht pruefbare Wache: fail closed");
  {
    const p = neuesProtokoll();
    const r = await understandOneCluster(baueCluster("Bundestag debattiert Haushaltsentwurf", "rd-1"), baueDeps(p, {
      clusterWache: {
        belege: async () => ({ erlaubt: false, grund: "wache-nicht-verfuegbar:migration-fehlt", slot: null }),
        gebeFrei: async () => {}
      }
    }));
    check("8.1 Eine nicht pruefbare Wache erlaubt NICHTS (kein Modellaufruf, sichtbarer Grund)",
      r.status === "skipped-cluster-belegt" && /migration-fehlt/.test(r.reason) && p.kiAufrufe === 0,
      `${r.status} grund=${r.reason} ki=${p.kiAufrufe}`);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.message);
  process.exit(1);
});
