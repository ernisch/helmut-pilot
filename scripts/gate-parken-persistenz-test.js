"use strict";

// ============================================================================
// GATE-PARKEN-PERSISTENZ (Blocker 1 + 2, 500-Mandate-Reife 2026-09-01)
// ============================================================================
// Beweist die beiden bestätigten Blocker-Korrekturen vor jedem Gate-Flip:
//
// BLOCKER 1 — Verknüpfungsfehler beim Parken: `gate-geparkt` darf NUR gesetzt
//   werden, wenn alle erforderlichen Dokumentverknüpfungen erfolgreich
//   persistiert wurden. Fehler aus saveSources/verknuepfe dürfen nicht
//   verschluckt werden; bei einem Fehler darf kein falscher Parkerfolg
//   entstehen (positive UND negative Vertragstests).
//
// BLOCKER 2 — Falsches ok:true: markUnderstandingGateGeparkt darf einen
//   HTTP-204/leeren Treffer nicht als Erfolg behandeln. Erfolg nur, wenn
//   GENAU der erwartete Datensatz im erwarteten Vorzustand geändert wurde.
//   Getestet: null, genau eine und unerwartet mehrere betroffene Zeilen.
//
// Teil A läuft mit Fetch-Ersatz gegen den echten storage-Code (Muster
// scripts/dedup-bestandsfenster-test.js, kein Netz). Teil B testet den
// Parkpfad in understanding.js über injizierte Deps (reine Logik).
// Jeder Lauf gehört über scripts/lokal.js gestartet (CLAUDE.md §6).

process.env.HELMUT_V3_STORE = "on";
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-kein-geheimnis";

const fs = require("fs");
const path = require("path");
const storage = require("../lib/helmut/storage");
const { understandOneCluster } = require("../lib/helmut/understanding");
const understandingGate = require("../lib/helmut/quellenarchitektur/understanding-gate");

let pass = 0, fail = 0;
function check(name, cond) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (cond) pass += 1; else fail += 1;
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// ── Fetch-Ersatz: beantwortet NUR das konditionale Park-PATCH; fail closed ──
const ECHTES_FETCH = global.fetch;
let patchAntwort = [];          // Zeilen, die das PATCH "getroffen" hat
let patchFehler = null;         // wenn gesetzt: Transportfehler
let patchAufrufe = [];          // {endpoint, headers, body}

function installiereFetchErsatz() {
  global.fetch = (url, options = {}) => {
    const method = String((options && options.method) || "GET").toUpperCase();
    const endpoint = String(url).replace("http://127.0.0.1:9", "");
    if (method === "PATCH" && /^\/rest\/v1\/knowledge_objects\?vorgang_id=eq\./.test(endpoint)) {
      patchAufrufe.push({ endpoint, headers: (options && options.headers) || {}, body: String((options && options.body) || "") });
      if (patchFehler) return Promise.reject(new Error(patchFehler));
      return Promise.resolve({
        ok: true, status: 200, statusText: "OK",
        text: () => Promise.resolve(JSON.stringify(patchAntwort))
      });
    }
    return Promise.reject(new Error(`Fetch-Ersatz: unbekannter Endpunkt ${method} ${endpoint}`));
  };
}

// ── Teil B: Deps-Fixture für den Parkpfad (Muster understanding-gate-arm-test) ──
function parkDoc(n = 1) {
  return {
    id: `rd-park-${n}`, content_hash: `hash-park-${n}`, source_id: "medien-quelle-1",
    title: "Wetterbericht fuer das sonnige Sommerwochenende an der Kueste",
    summary: "Sonnig und warm, viel Badewetter am Wochenende erwartet.",
    published_at: new Date(Date.now() - 5 * 86400000).toISOString()
  };
}
function baueDeps(overrides = {}) {
  const spuren = { modellAufrufe: 0, belege: [], parkungen: [], pendings: [], verknuepfungen: [] };
  const deps = {
    modelName: () => "gpt-5-mini",
    canSpend: () => ({ allowed: true }),
    requestUnderstanding: () => { spuren.modellAufrufe += 1; return Promise.resolve({}); },
    save: () => ({ saved: false }),
    saveSources: (koId, docs) => { spuren.verknuepfungen.push({ koId, anzahl: (docs || []).length }); return { saved: (docs || []).length }; },
    markFailed: () => {}, logSkip: () => {},
    gateMode: () => "on",
    savePending: (vid) => { spuren.pendings.push(vid); return Promise.resolve({ saved: true, id: `ko-${vid}` }); },
    recordGateParkung: (rows) => { spuren.belege.push(...(rows || [])); return Promise.resolve({ ok: true, written: (rows || []).length }); },
    markGateGeparkt: (vid) => { spuren.parkungen.push(vid); return Promise.resolve({ ok: true, zeilen: 1 }); },
    releaseGateGeparkt: (vids) => Promise.resolve({ ok: true, freigegeben: (vids || []).length }),
    ...overrides
  };
  return { deps, spuren };
}
function geparktesKo(vid) {
  return { id: `ko-${vid}`, vorgang_id: vid, status: "pending", understanding_status: "gate-geparkt" };
}

(async () => {
  installiereFetchErsatz();

  // ═══════════════ TEIL A · BLOCKER 2: markUnderstandingGateGeparkt ═══════════════
  abschnitt("§1 Blocker 2: 0 Zeilen getroffen ist KEIN Erfolg");
  {
    patchAntwort = []; patchFehler = null; patchAufrufe = [];
    const r = await storage.markUnderstandingGateGeparkt("vg-b2-null");
    check("§1.1 leere Treffer-Rückgabe -> ok:false", r.ok === false);
    check("§1.2 Grund benennt den veränderten Vorzustand", /kein-treffer/.test(r.reason || ""));
    check("§1.3 die Anfrage verlangt die belegende Rückgabe (return=representation)",
      patchAufrufe.length === 1 && /return=representation/.test(String((patchAufrufe[0].headers || {}).Prefer || "")));
    check("§1.4 die Anfrage bleibt ein KONDITIONALES PATCH auf den Vorzustand",
      /understanding_status=in\.\(pending,gate-geparkt\)/.test(patchAufrufe[0].endpoint));
  }

  abschnitt("§2 Blocker 2: genau EINE erwartete Zeile ist der einzige Erfolg");
  {
    patchAntwort = [{ vorgang_id: "vg-b2-eins", understanding_status: "gate-geparkt" }];
    patchFehler = null; patchAufrufe = [];
    const r = await storage.markUnderstandingGateGeparkt("vg-b2-eins");
    check("§2.1 genau eine erwartete Zeile -> ok:true, zeilen:1", r.ok === true && r.zeilen === 1);
    const falsch = await (async () => {
      patchAntwort = [{ vorgang_id: "vg-ANDERER", understanding_status: "gate-geparkt" }];
      return storage.markUnderstandingGateGeparkt("vg-b2-eins");
    })();
    check("§2.2 eine Zeile mit FREMDER Vorgangskennung -> ok:false (unerwartete-zeile)",
      falsch.ok === false && /unerwartete-zeile/.test(falsch.reason || ""));
    const falscherZustand = await (async () => {
      patchAntwort = [{ vorgang_id: "vg-b2-eins", understanding_status: "pending" }];
      return storage.markUnderstandingGateGeparkt("vg-b2-eins");
    })();
    check("§2.3 eine Zeile OHNE Zielzustand -> ok:false", falscherZustand.ok === false);
  }

  abschnitt("§3 Blocker 2: unerwartet mehrere Zeilen sind KEIN Erfolg");
  {
    patchAntwort = [
      { vorgang_id: "vg-b2-mehr", understanding_status: "gate-geparkt" },
      { vorgang_id: "vg-b2-mehr", understanding_status: "gate-geparkt" }
    ];
    patchFehler = null; patchAufrufe = [];
    const r = await storage.markUnderstandingGateGeparkt("vg-b2-mehr");
    check("§3.1 zwei getroffene Zeilen -> ok:false", r.ok === false);
    check("§3.2 Grund benennt den Mehrfachtreffer mit Anzahl", r.reason === "mehrfachtreffer:2");
  }

  abschnitt("§4 Blocker 2: Transportfehler und Randfälle bleiben ehrlich");
  {
    patchAntwort = []; patchFehler = "verbindung-kaputt"; patchAufrufe = [];
    const r = await storage.markUnderstandingGateGeparkt("vg-b2-fehler");
    check("§4.1 Transportfehler -> ok:false mit Fehlertext", r.ok === false && /verbindung-kaputt/.test(r.reason || ""));
    patchFehler = null;
    const ohne = await storage.markUnderstandingGateGeparkt("");
    check("§4.2 fehlende Vorgangskennung -> ok:false (skipped)", ohne.ok === false && ohne.skipped === true);
  }

  // ═══════════════ TEIL B · BLOCKER 1: Verknüpfung ist Parkvoraussetzung ═══════════════
  abschnitt("§5 Blocker 1 positiv: belegte Verknüpfung -> Parkung in korrekter Reihenfolge");
  {
    const { deps, spuren } = baueDeps();
    const reihenfolge = [];
    deps.recordGateParkung = (rows) => { reihenfolge.push("beleg"); spuren.belege.push(...(rows || [])); return Promise.resolve({ ok: true, written: (rows || []).length }); };
    deps.saveSources = (koId, docs) => { reihenfolge.push("verknuepfung"); spuren.verknuepfungen.push({ koId, anzahl: (docs || []).length }); return { saved: (docs || []).length }; };
    deps.markGateGeparkt = (vid) => { reihenfolge.push("zustand"); spuren.parkungen.push(vid); return Promise.resolve({ ok: true, zeilen: 1 }); };
    const r = await understandOneCluster({ documents: [parkDoc(1), parkDoc(2)] }, deps, { vorgangId: "vg-b1-pos", existing: null });
    check("§5.1 Parkung meldet skipped-gate-geparkt mit Gate-Version",
      r.status === "skipped-gate-geparkt" && r.gateVersion === understandingGate.GATE_VERSION);
    check("§5.2 Reihenfolge: erst Beleg, dann Verknüpfung, dann Zustand",
      reihenfolge.join(",") === "beleg,verknuepfung,zustand");
    check("§5.3 Verknüpfung trägt alle Cluster-Dokumente am richtigen KO",
      spuren.verknuepfungen.length === 1 && spuren.verknuepfungen[0].koId === "ko-vg-b1-pos" && spuren.verknuepfungen[0].anzahl === 2);
    check("§5.4 kein Modellaufruf bei erfolgreicher Parkung", spuren.modellAufrufe === 0);
  }

  abschnitt("§6 Blocker 1 negativ: Verknüpfungsfehler verhindert die Parkung");
  {
    // saveSources meldet skipped (echtes saveKoDocumentLinks-Fehlerformat)
    const f1 = baueDeps({ saveSources: () => ({ skipped: true, reason: "v3-store-error", saved: 0 }) });
    const r1 = await understandOneCluster({ documents: [parkDoc()] }, f1.deps, { vorgangId: "vg-b1-n1", existing: null });
    check("§6.1 saveSources skipped -> KEINE Parkung, normale Verarbeitung, Zustand NIE gesetzt",
      r1.status !== "skipped-gate-geparkt" && f1.spuren.parkungen.length === 0 && f1.spuren.modellAufrufe === 1);
    // saveSources wirft
    const f2 = baueDeps({ saveSources: () => { throw new Error("verknuepfung-kaputt"); } });
    const r2 = await understandOneCluster({ documents: [parkDoc()] }, f2.deps, { vorgangId: "vg-b1-n2", existing: null });
    check("§6.2 saveSources WIRFT -> Fehler nicht verschluckt als Parkerfolg (normale Verarbeitung)",
      r2.status !== "skipped-gate-geparkt" && f2.spuren.parkungen.length === 0 && f2.spuren.modellAufrufe === 1);
    // saveSources meldet zu wenige persistierte Zeilen
    const f3 = baueDeps({ saveSources: () => ({ saved: 1 }) });
    const r3 = await understandOneCluster({ documents: [parkDoc(1), parkDoc(2)] }, f3.deps, { vorgangId: "vg-b1-n3", existing: null });
    check("§6.3 unvollständige Persistenz (1 von 2) -> KEINE Parkung",
      r3.status !== "skipped-gate-geparkt" && f3.spuren.parkungen.length === 0 && f3.spuren.modellAufrufe === 1);
    // saveSources meldet gar nichts (undefined — der alte verschluckende Vertrag)
    const f4 = baueDeps({ saveSources: () => undefined });
    const r4 = await understandOneCluster({ documents: [parkDoc()] }, f4.deps, { vorgangId: "vg-b1-n4", existing: null });
    check("§6.4 Verknüpfung ohne Rückmeldung ist KEIN Beleg -> keine Parkung",
      r4.status !== "skipped-gate-geparkt" && f4.spuren.parkungen.length === 0 && f4.spuren.modellAufrufe === 1);
    // Dokument ohne Kennung ist nicht verknüpfbar
    const f5 = baueDeps();
    const ohneId = { ...parkDoc(9) }; delete ohneId.id;
    const r5 = await understandOneCluster({ documents: [parkDoc(1), ohneId] }, f5.deps, { vorgangId: "vg-b1-n5", existing: null });
    check("§6.5 Dokument ohne Kennung -> keine Parkung (kein unbelegbarer Parkbestand)",
      r5.status !== "skipped-gate-geparkt" && f5.spuren.parkungen.length === 0 && f5.spuren.modellAufrufe === 1);
  }

  abschnitt("§7 Blocker 1: Zustand wird NIE vor der belegten Verknüpfung gesetzt");
  {
    const { deps, spuren } = baueDeps({ saveSources: () => ({ skipped: true, reason: "db-weg", saved: 0 }) });
    await understandOneCluster({ documents: [parkDoc()] }, deps, { vorgangId: "vg-b1-ordnung", existing: null });
    check("§7.1 bei Verknüpfungsfehler bleibt markGateGeparkt unberührt", spuren.parkungen.length === 0);
    check("§7.2 der Beleg vor der Verknüpfung ist erlaubt (fail closed kostet höchstens einen Aufruf, nie eine beleglose Parkung)",
      spuren.belege.length >= 1);
  }

  abschnitt("§8 Blocker 1: idempotenter bereits-geparkt-Pfad bleibt ehrlich");
  {
    const okFall = baueDeps();
    const r1 = await understandOneCluster({ documents: [parkDoc()] }, okFall.deps, { vorgangId: "vg-b1-idem", existing: geparktesKo("vg-b1-idem") });
    check("§8.1 belegte Verknüpfung -> bereits-geparkt wird bestätigt (keine neuen Beleg-/Zustandswrites)",
      r1.status === "skipped-gate-geparkt" && r1.reason === "bereits-geparkt"
      && okFall.spuren.belege.length === 0 && okFall.spuren.parkungen.length === 0 && okFall.spuren.modellAufrufe === 0);
    const kaputt = baueDeps({ saveSources: () => ({ skipped: true, reason: "db-weg", saved: 0 }) });
    const r2 = await understandOneCluster({ documents: [parkDoc()] }, kaputt.deps, { vorgangId: "vg-b1-idem2", existing: geparktesKo("vg-b1-idem2") });
    check("§8.2 Verknüpfung nicht belegbar -> NICHT als geparkt gemeldet, normale Verarbeitung",
      r2.status !== "skipped-gate-geparkt" && kaputt.spuren.modellAufrufe === 1);
    check("§8.3 auch dann keine neuen Beleg-/Zustandswrites durch den Idempotenz-Pfad",
      kaputt.spuren.belege.length === 0 && kaputt.spuren.parkungen.length === 0);
  }

  abschnitt("§9 Struktur: der Parkpfad nutzt den fail-geschlossenen Verknüpfungsvertrag");
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "understanding.js"), "utf8");
    check("§9.1 verknuepfeFailClosed existiert und prüft saved gegen die Dokumentanzahl",
      /async function verknuepfeFailClosed/.test(src) && /Number\(res\.saved\) !== liste\.length/.test(src));
    check("§9.2 parkeDurchGate nutzt verknuepfeFailClosed (nicht das fail-safe verknuepfe)",
      /const linkVerknuepfung = await verknuepfeFailClosed\(deps, koId, clusterDocs\)/.test(src));
    check("§9.3 der bereits-geparkt-Pfad nutzt denselben fail-geschlossenen Vertrag",
      /const idempotentLink = await verknuepfeFailClosed\(deps, existing\.id, clusterDocs\)/.test(src));
    const storageSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
    check("§9.4 markUnderstandingGateGeparkt verlangt die belegende Rückgabe",
      /markUnderstandingGateGeparkt[\s\S]{0,1600}return=representation/.test(storageSrc));
    check("§9.5 markUnderstandingGateGeparkt kennt 0-, 1- und Mehrfachtreffer getrennt",
      /kein-treffer-vorzustand-veraendert/.test(storageSrc) && /mehrfachtreffer:\$\{rows\.length\}/.test(storageSrc));
  }

  global.fetch = ECHTES_FETCH;
  console.log(`\nERGEBNIS: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { global.fetch = ECHTES_FETCH; console.error("Testlauf abgebrochen:", (e && e.stack) || e); process.exit(1); });
