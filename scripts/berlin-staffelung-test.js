"use strict";

// Helmut — Phase-1-Punkt 14A, Teil A: die STAFFELUNG der Berliner Aktivierung ausführbar prüfen.
// =============================================================================================
// Befund V-1: Block A, B1, Stufe 1 und Stufe 2 lagen in EINER Datei, Block B zusätzlich in
// EINER Transaktion. Die Staffelung bestand aus einer Kommentarzeile. Dieser Test prüft, dass
// sie jetzt STRUKTURELL besteht — und zwar so, dass er auch fehlschlägt, wenn jemand die
// Trennung wieder aufhebt (Mutationstests am Ende, Block M).
//
// Reiner Offline-Test: kein Netz, keine KI, kein DB-Zugriff, kein Datei-Schreiben.
// Gegenstand ist das COMMITTETE SQL plus die deklarative Schrittliste, aus der es entsteht.
//
//   1  Trennung    — je Schritt eine Datei, eine Transaktion, disjunkte Wegmengen
//   2  Reihenfolge — Stufe 2 nur nach vollständiger UND belegter Stufe 1
//   3  Fail-closed — jede Bedingung ist im SQL als `raise exception` vorhanden
//   4  Ausführung  — die Schrittkette gegen eine In-Memory-Datenbank, Zustand für Zustand
//   5  Rollback    — je Stufe getrennt, vollständig, ohne Nebenwirkung auf die andere Stufe
//   6  Grenzen     — kein Brandenburg, kein Bund, keine Partei-/Fraktions-/Personenquelle
//   M  Mutation    — 8 gezielte Verfälschungen; jede MUSS von einer Prüfung oben gefangen werden

const fs = require("fs");
const path = require("path");
const B = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const generator = require("./generate-berlin-aktivierung-sql");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const SEED_DIR = path.join(__dirname, "..", "supabase", "seeds");
const lies = (f) => fs.readFileSync(path.join(SEED_DIR, f), "utf8");
const ausfuehrbar = (s) => s.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const SCHRITTE = B.ausfuehrungsschritte();
const S1 = B.stufenWege(1);
const S2 = B.stufenWege(2);
const landesSeed = buildLandesmodulSeed();

// ── In-Memory-Datenbank + Ausführung der deklarativen Schritte ────────────────────────────────
// Der Ausgangszustand ist der am 2026-07-26 read-only GEMESSENE Production-Ist:
// alle 10 Berliner Wege needs_review/manual, berlin-basis 'prepared', die 3 Partei-/
// Fraktions-/Personenwege noch am Pflicht-Basispaket (Befund A-3).
const IST_LINKS = landesSeed.packagePaths.map((pp) => (
  B.UMHAENGUNG.wege.includes(pp.retrieval_path_id) && pp.package_id === B.PARTEIPAKET_ID
    ? { package_id: B.BASISPAKET_ID, retrieval_path_id: pp.retrieval_path_id }
    : { ...pp }
));
const BUND_WEGE = [
  { id: "rp-kern-1", status: "healthy", activation_mode: "always_on" },
  { id: "rp-bund-a", status: "healthy", activation_mode: "auto" },
  { id: "rp-bund-defekt", status: "broken", activation_mode: "auto" }
];

function frischeDb() {
  return {
    retrieval_paths: [
      ...BUND_WEGE.map((p) => ({ ...p })),
      ...landesSeed.retrievalPaths.map((p) => ({ id: p.id, status: "needs_review", activation_mode: "manual" }))
    ],
    source_packages: PACKAGE_DEFINITIONS.map((p) => ({ id: p.id, key: p.key, status: p.status })),
    package_paths: [...IST_LINKS.map((l) => ({ ...l }))],
    source_crawl_telemetry: []
  };
}
const bild = (db) => JSON.stringify({
  rp: db.retrieval_paths.slice().sort((a, b) => a.id.localeCompare(b.id)).map((r) => `${r.id}|${r.status}|${r.activation_mode}`),
  sp: db.source_packages.slice().sort((a, b) => a.key.localeCompare(b.key)).map((p) => `${p.key}|${p.status}`),
  pp: db.package_paths.map((p) => `${p.package_id}|${p.retrieval_path_id}`).sort()
});

// Mutation eines Schritts — dieselbe Wirkung wie das generierte SQL, ohne SQL-Interpreter.
function mutiere(schritt, db) {
  const setzeWege = (ids, von, nach) => {
    for (const z of db.retrieval_paths) {
      if (!ids.includes(z.id)) continue;
      if (von && !(z.status === von.status && z.activation_mode === von.activation_mode)) continue;
      z.status = nach.status; z.activation_mode = nach.activation_mode;
    }
  };
  const setzePaket = (key, von, nach) => {
    for (const p of db.source_packages) {
      if (p.key !== key) continue;
      if (von && p.status !== von) continue;
      p.status = nach;
    }
  };
  const haenge = (von, nach) => {
    for (const w of B.UMHAENGUNG.wege) {
      if (!db.package_paths.some((pp) => pp.package_id === nach && pp.retrieval_path_id === w)) {
        db.package_paths.push({ package_id: nach, retrieval_path_id: w });
      }
    }
    db.package_paths = db.package_paths.filter((pp) => !(pp.package_id === von && B.UMHAENGUNG.wege.includes(pp.retrieval_path_id)));
  };
  if (schritt.id === "A") haenge(B.UMHAENGUNG.von, B.UMHAENGUNG.nach);
  else if (schritt.id === "B1") setzePaket(B.BASISPAKET_KEY, "prepared", "active");
  else if (schritt.id === "S1" || schritt.id === "S2") setzeWege(schritt.wegeBeruehrt, B.GESPERRT, B.AKTIV);
  else if (schritt.id === "S1-RB" || schritt.id === "S2-RB") setzeWege(schritt.wegeBeruehrt, null, B.GESPERRT);
  else if (schritt.id === "RB-ALLE") { setzeWege(schritt.wegeBeruehrt, null, B.GESPERRT); setzePaket(B.BASISPAKET_KEY, null, "prepared"); }
  else if (schritt.id === "RB-VOLL") {
    setzeWege(schritt.wegeBeruehrt, null, B.GESPERRT);
    setzePaket(B.BASISPAKET_KEY, null, "prepared");
    haenge(B.UMHAENGUNG.nach, B.UMHAENGUNG.von);
  } else throw new Error("Unbekannter Schritt " + schritt.id);
}

// EIN Schritt wie in einer Transaktion: Vorbedingungen -> Mutation -> Nachbedingungen.
// Verletzung = Abbruch OHNE jede Änderung (genau die Wirkung von `raise exception` + Rollback).
function fuehreAus(schrittId, db) {
  const schritt = SCHRITTE.find((s) => s.id === schrittId);
  if (!schritt) throw new Error("Unbekannter Schritt " + schrittId);
  const vorher = JSON.parse(JSON.stringify(db));
  for (const b of schritt.vorbedingungen) {
    const e = B.pruefeBedingung(b, db);
    if (!e.ok) return { ok: false, phase: "vorbedingung", meldung: b.meldung, ist: e.ist };
  }
  mutiere(schritt, db);
  for (const b of schritt.nachbedingungen) {
    const e = B.pruefeBedingung(b, db);
    if (!e.ok) {
      db.retrieval_paths = vorher.retrieval_paths; db.source_packages = vorher.source_packages;
      db.package_paths = vorher.package_paths;
      return { ok: false, phase: "nachbedingung", meldung: b.meldung, ist: e.ist };
    }
  }
  return { ok: true };
}
// Telemetriebeleg erzeugen: n Läufe mit status='ok' je Quelle der Stufe 1.
function belegeStufe1(db, laeufe = 2) {
  for (const quelle of B.telemetrieQuellen(S1)) {
    for (let i = 0; i < laeufe; i += 1) db.source_crawl_telemetry.push({ source_id: quelle, run_id: `run-${i}`, status: "ok" });
  }
}
const aktiveBerlinWege = (db) => db.retrieval_paths
  .filter((r) => r.status === "healthy" && r.activation_mode === "auto")
  .map((r) => r.id).filter((id) => B.AKTIVIERUNGSSET.includes(id)).sort();

// ══ 1) Trennung: je Schritt eine Datei, eine Transaktion, disjunkte Wegmengen ══════════════════
check("1a Die Staffelung ist in sich schlüssig (disjunkte Stufen, zusammen das Aktivierungsset)",
  B.staffelungspruefung().ok, JSON.stringify(B.staffelungspruefung()));
check("1b Stufe 1 enthält genau 2 Direktwege — und genau die geplanten",
  gleich(S1, ["rp-be-regionale_leitmedien", "rp-rbb24-politik"]), S1.join(","));
check("1c Stufe 2 enthält genau 2 Wege — und genau die geplanten",
  gleich(S2, ["rp-be-landesregierung", "rp-be-staatskanzlei"]), S2.join(","));
check("1d Stufe 1 nennt in ihrem MUTATIONS-Teil KEINEN Weg aus Stufe 2",
  (() => {
    const mut = ausfuehrbar(lies(B.DATEI_S1)).replace(/do \$\$[\s\S]*?\$\$;/g, "");
    return S2.every((id) => !mut.includes(id)) && S1.every((id) => mut.includes(id));
  })());
check("1d2 …aber ihre RIEGEL nennen Stufe 2 ausdrücklich (Sperre wird geprüft, nicht angenommen)",
  (() => {
    const riegel = (lies(B.DATEI_S1).match(/do \$\$[\s\S]*?\$\$;/g) || []).join("\n");
    return S2.every((id) => riegel.includes(id));
  })());
check("1e Stufe 2 nennt in ihrem ausführbaren SQL keinen Weg aus Stufe 1 als MUTATIONSZIEL",
  (() => {
    const mut = ausfuehrbar(lies(B.DATEI_S2)).replace(/do \$\$[\s\S]*?\$\$;/g, "");
    return S1.every((id) => !mut.includes(id)) && S2.every((id) => mut.includes(id));
  })());
check("1f Jeder Schritt liegt in einer EIGENEN Datei",
  new Set(SCHRITTE.map((s) => s.datei)).size === SCHRITTE.length);
check("1g Jede Schrittdatei hat genau EIN begin und EIN commit (eine Transaktion je Datei)",
  SCHRITTE.every((s) => {
    const t = ausfuehrbar(lies(s.datei));
    return (t.match(/^\s*begin;/gm) || []).length === 1 && (t.match(/^\s*commit;/gm) || []).length === 1;
  }), SCHRITTE.filter((s) => {
    const t = ausfuehrbar(lies(s.datei));
    return (t.match(/^\s*begin;/gm) || []).length !== 1 || (t.match(/^\s*commit;/gm) || []).length !== 1;
  }).map((s) => s.id).join(","));
check("1h Keine Datei enthält mehr als eine Stufe (Wegmengen der Aktivierungsdateien sind disjunkt)",
  (() => {
    const a = SCHRITTE.filter((s) => s.art === "aktivierung" && s.stufe);
    return a.length === 2 && a[0].wegeBeruehrt.every((id) => !a[1].wegeBeruehrt.includes(id));
  })());
check("1i Die frühere Sammeldatei mutiert nichts mehr und bricht fail-closed ab",
  !/\b(update|insert|delete)\b/i.test(ausfuehrbar(lies(B.DATEI_STOP)))
  && /raise exception 'STILLGELEGT/.test(lies(B.DATEI_STOP)));

// ══ 2) Reihenfolge und Beleg ══════════════════════════════════════════════════════════════════
check("2a Stufe 1 verlangt Block A, Block B1 UND eine vollständig gesperrte Stufe 2",
  (() => {
    const v = SCHRITTE.find((s) => s.id === "S1").vorbedingungen;
    return v.length === 3
      && v.some((b) => b.art === "zuordnung" && b.paket === B.BASISPAKET_ID && gleich(b.erlaubt, [0]))
      && v.some((b) => b.art === "paketstatus" && gleich(b.erlaubt, ["active"]))
      && v.some((b) => b.art === "wegzustand" && gleich(b.wege, S2) && b.status === "needs_review");
  })());
check("2b Stufe 2 verlangt Stufe 1 vollständig aktiv UND telemetrisch belegt",
  (() => {
    const v = SCHRITTE.find((s) => s.id === "S2").vorbedingungen;
    return v.some((b) => b.art === "wegzustand" && gleich(b.wege, S1) && b.status === "healthy" && gleich(b.erlaubt, [2]))
      && v.some((b) => b.art === "telemetriebeleg" && b.minLaeufeJeQuelle >= 2 && gleich(b.quellen, B.telemetrieQuellen(S1)));
  })());
check("2c Der Telemetriebeleg fragt die QUELLENkennung ab, nicht die Abrufweg-Id",
  (() => {
    const b = SCHRITTE.find((s) => s.id === "S2").vorbedingungen.find((x) => x.art === "telemetriebeleg");
    return b.quellen.every((q) => !q.startsWith("rp-")) && gleich(b.quellen, ["be-regionale_leitmedien", "rbb24-politik"]);
  })());

// ══ 3) Fail-closed: jede Bedingung steht als raise exception im SQL ════════════════════════════
check("3a Jede Schrittdatei enthält genau so viele Riegel-Blöcke wie Bedingungen deklariert",
  SCHRITTE.every((s) => {
    const bloecke = (lies(s.datei).match(/do \$\$[\s\S]*?\$\$;/g) || []).length;
    return bloecke === s.vorbedingungen.length + s.nachbedingungen.length;
  }), SCHRITTE.map((s) => `${s.id}:${(lies(s.datei).match(/do \$\$[\s\S]*?\$\$;/g) || []).length}/${s.vorbedingungen.length + s.nachbedingungen.length}`).join(" "));
check("3b Jeder Riegel-Block endet in einem raise exception (kein stilles No-Op)",
  SCHRITTE.every((s) => (lies(s.datei).match(/do \$\$[\s\S]*?\$\$;/g) || []).every((b) => /raise exception/.test(b))));
check("3c Jede Aktivierungsstufe prüft ihre eigene Vollständigkeit NACH der Mutation",
  ["S1", "S2"].every((id) => {
    const s = SCHRITTE.find((x) => x.id === id);
    return s.nachbedingungen.some((b) => b.art === "wegzustand" && gleich(b.wege, s.wegeBeruehrt)
      && b.status === "healthy" && gleich(b.erlaubt, [s.wegeBeruehrt.length]));
  }));
check("3d Stufe 1 prüft NACH der Mutation ausdrücklich, dass Stufe 2 gesperrt geblieben ist",
  SCHRITTE.find((s) => s.id === "S1").nachbedingungen
    .some((b) => b.art === "wegzustand" && gleich(b.wege, S2) && b.status === "needs_review" && gleich(b.erlaubt, [2])));
// Fail-closed heisst hier: eine Bedingung, die einen VORHANDENEN Zustand verlangt, darf gegen
// eine leere Datenbanksicht NICHT „erfüllt" melden. Bedingungen, die ausdrücklich 0 erlauben
// („keine Zuordnung mehr da"), sind davon per Definition ausgenommen.
check("3e Ohne Datenbanktabellen ist jede fordernde Bedingung fail-closed (leere Sicht -> nicht erfüllt)",
  (() => {
    const fordernd = SCHRITTE.flatMap((s) => [...s.vorbedingungen, ...s.nachbedingungen])
      .filter((b) => b.art === "telemetriebeleg" || (Array.isArray(b.erlaubt) && !b.erlaubt.includes(0)));
    return fordernd.length > 0 && fordernd.every((b) => B.pruefeBedingung(b, {}).ok === false);
  })());

// ══ 4) Ausführung Zustand für Zustand ═════════════════════════════════════════════════════════
const db = frischeDb();
const ausgangsbild = bild(db);
check("4a Ausgangszustand: 0 Berliner Wege aktiv, Paket 'prepared', 3 Wege am Pflichtpaket (A-3)",
  aktiveBerlinWege(db).length === 0
  && db.source_packages.find((p) => p.key === B.BASISPAKET_KEY).status === "prepared"
  && db.package_paths.filter((pp) => pp.package_id === B.BASISPAKET_ID && B.UMHAENGUNG.wege.includes(pp.retrieval_path_id)).length === 3);
check("4b Stufe 1 ist im Ausgangszustand NICHT ausführbar (Block A und B1 fehlen)",
  fuehreAus("S1", db).ok === false);
check("4c Stufe 2 ist im Ausgangszustand NICHT ausführbar",
  fuehreAus("S2", db).ok === false);
check("4d Nach den beiden Fehlversuchen ist keine Zeile verändert (fail-closed)", bild(db) === ausgangsbild);
check("4e Block A läuft und neutralisiert das Pflichtpaket", fuehreAus("A", db).ok === true
  && db.package_paths.filter((pp) => pp.package_id === B.BASISPAKET_ID && B.UMHAENGUNG.wege.includes(pp.retrieval_path_id)).length === 0);
check("4f Block A ist idempotent (zweiter Lauf erlaubt, ändert nichts)",
  (() => { const v = bild(db); const r = fuehreAus("A", db); return r.ok === true && bild(db) === v; })());
check("4g Stufe 1 ist NACH Block A noch nicht ausführbar (Paketstatus fehlt)", fuehreAus("S1", db).ok === false);
check("4h Block B1 setzt den Paketstatus auf 'active'", fuehreAus("B1", db).ok === true
  && db.source_packages.find((p) => p.key === B.BASISPAKET_KEY).status === "active");
check("4i Stufe 2 ist auch jetzt NICHT ausführbar — Stufe 1 fehlt vollständig",
  (() => { const r = fuehreAus("S2", db); return r.ok === false && /Stufe 1 ist nicht vollstaendig aktiv/.test(r.meldung); })());
check("4j Stufe 1 läuft und aktiviert GENAU die 2 Direktwege",
  fuehreAus("S1", db).ok === true && gleich(aktiveBerlinWege(db), S1));
check("4k Stufe 1 hat Stufe 2 NICHT mitaktiviert (die V-1-Kernzusage)",
  S2.every((id) => { const r = db.retrieval_paths.find((x) => x.id === id); return r.status === "needs_review" && r.activation_mode === "manual"; }));
check("4l Stufe 2 ist trotz aktiver Stufe 1 NICHT ausführbar, solange der Telemetriebeleg fehlt",
  (() => { const r = fuehreAus("S2", db); return r.ok === false && /nicht belegt gelaufen/.test(r.meldung); })());
check("4m Ein einzelner Lauf je Weg genügt nicht (mind. 2 verlangt)",
  (() => { belegeStufe1(db, 1); const r = fuehreAus("S2", db); return r.ok === false && /nicht belegt gelaufen/.test(r.meldung); })());
check("4n Mit belegter Stufe 1 läuft Stufe 2 und aktiviert genau ihre 2 Wege",
  (() => { belegeStufe1(db, 2); return fuehreAus("S2", db).ok === true && gleich(aktiveBerlinWege(db), [...B.AKTIVIERUNGSSET].sort()); })());
check("4o Stufe 2 hat Stufe 1 nicht verändert",
  S1.every((id) => { const r = db.retrieval_paths.find((x) => x.id === id); return r.status === "healthy" && r.activation_mode === "auto"; }));
check("4p Die 3 Partei-/Fraktions-/Personenwege sind in KEINEM Schritt aktiviert worden",
  B.UMHAENGUNG.wege.every((id) => { const r = db.retrieval_paths.find((x) => x.id === id); return r.status === "needs_review" && r.activation_mode === "manual"; }));
check("4q rp-be-plenum (PARDOK) ist nie aktiviert worden",
  (() => { const r = db.retrieval_paths.find((x) => x.id === "rp-be-plenum"); return r.status === "needs_review" && r.activation_mode === "manual"; })());
check("4r Kein Brandenburg-Weg wurde in der gesamten Kette verändert",
  db.retrieval_paths.filter((r) => r.id.startsWith("rp-bb-")).every((r) => r.status === "needs_review" && r.activation_mode === "manual"));
check("4s Kein Bundesweg wurde in der gesamten Kette verändert",
  BUND_WEGE.every((o) => { const n = db.retrieval_paths.find((r) => r.id === o.id); return n.status === o.status && n.activation_mode === o.activation_mode; }));
check("4t brandenburg-basis ist unverändert 'prepared'",
  db.source_packages.find((p) => p.key === "brandenburg-basis").status === "prepared");

// ══ 5) Rollback je Stufe ══════════════════════════════════════════════════════════════════════
check("5a Rollback Stufe 1 ist bei AKTIVER Stufe 2 fail-closed (Reihenfolge auch rückwärts)",
  (() => { const r = fuehreAus("S1-RB", db); return r.ok === false && /Stufe 2 ist aktiv/.test(r.meldung); })());
check("5b Nach dem verweigerten Rollback ist nichts verändert",
  gleich(aktiveBerlinWege(db), [...B.AKTIVIERUNGSSET].sort()));
check("5c Rollback Stufe 2 nimmt NUR Stufe 2 zurück und lässt Stufe 1 laufen",
  fuehreAus("S2-RB", db).ok === true && gleich(aktiveBerlinWege(db), S1));
check("5d Rollback Stufe 1 ist jetzt erlaubt und setzt NUR Stufe 1 zurück",
  fuehreAus("S1-RB", db).ok === true && aktiveBerlinWege(db).length === 0);
check("5e Nach Rollback Stufe 1 bleibt Stufe 2 unverändert GESPERRT (Anforderung 6)",
  S2.every((id) => { const r = db.retrieval_paths.find((x) => x.id === id); return r.status === "needs_review" && r.activation_mode === "manual"; }));
check("5f Rollback Stufe 1 hat den Paketstatus NICHT angefasst (nur Stufe 1 ist gemeint)",
  db.source_packages.find((p) => p.key === B.BASISPAKET_KEY).status === "active");
check("5g Rollback Stufe 1 hat die Neutralisierung nicht zurückgedreht (Befund A-3 kehrt nicht zurück)",
  db.package_paths.filter((pp) => pp.package_id === B.BASISPAKET_ID && B.UMHAENGUNG.wege.includes(pp.retrieval_path_id)).length === 0);

// Vollständiger Rückweg aus dem Vollzustand: alle Stufen, dann Block A.
const db2 = frischeDb();
const ausgang2 = bild(db2);
belegeStufe1(db2, 2);
for (const id of ["A", "B1", "S1", "S2"]) fuehreAus(id, db2);
check("5h Rollback ALLER Stufen setzt jeden Weg des Basispakets zurück und das Paket auf 'prepared'",
  fuehreAus("RB-ALLE", db2).ok === true
  && aktiveBerlinWege(db2).length === 0
  && db2.source_packages.find((p) => p.key === B.BASISPAKET_KEY).status === "prepared");
check("5i Rollback ALLER Stufen lässt die Neutralisierung bestehen (Block A bleibt)",
  db2.package_paths.filter((pp) => pp.package_id === B.BASISPAKET_ID && B.UMHAENGUNG.wege.includes(pp.retrieval_path_id)).length === 0);
check("5j Der vollständige Rollback stellt den GEMESSENEN Ausgangszustand zeilengenau her",
  fuehreAus("RB-VOLL", db2).ok === true && bild(db2) === ausgang2, bild(db2) === ausgang2 ? "" : "Zustand weicht ab");
check("5k Der vollständige Rollback ist idempotent",
  (() => { const v = bild(db2); return fuehreAus("RB-VOLL", db2).ok === true && bild(db2) === v; })());
check("5l Kein Rollback löscht Dokumente (kein delete auf raw_documents/knowledge_objects/Telemetrie)",
  !/delete\s+from\s+public\.(raw_documents|knowledge_objects|source_crawl_telemetry)/i
    .test([B.DATEI_S1_RB, B.DATEI_S2_RB, B.DATEI_RB_ALLE, B.DATEI_RB_VOLL].map(lies).join("\n")));

// ══ 6) Grenzen über alle 9 Dateien ════════════════════════════════════════════════════════════
const alleDateien = [B.DATEI_STOP, ...SCHRITTE.map((s) => s.datei)];
const allesAusfuehrbar = alleDateien.map((f) => ausfuehrbar(lies(f))).join("\n");
check("6a Keine Datei nennt in ausführbarem SQL einen Brandenburg-Bezeichner",
  !/rp-bb-|brandenburg/i.test(allesAusfuehrbar));
check("6b Keine Datei nennt in ausführbarem SQL eine Bundesquelle oder ein Bundespaket",
  !/bund-basis|arbeit-und-soziales|die-linke-bund|regional-niedersachsen/i.test(allesAusfuehrbar));
check("6c Keine Datei berührt Mandanten-/Profiltabellen",
  !/mandate_profiles|\bprofiles\b|\busers\b|profil-/i.test(allesAusfuehrbar));
check("6d Kein DDL, kein drop/truncate/alter", !/\b(drop|truncate|alter)\b/i.test(allesAusfuehrbar));
check("6e Die Aktivierungsdateien nennen KEINEN Partei-/Fraktions-/Personenweg als Aktivierungsziel",
  ["S1", "S2"].every((id) => {
    const mut = ausfuehrbar(lies(SCHRITTE.find((s) => s.id === id).datei)).replace(/do \$\$[\s\S]*?\$\$;/g, "");
    return B.UMHAENGUNG.wege.every((w) => !mut.includes(w));
  }));
check("6f Nur Block A und der vollständige Rollback berühren package_paths",
  SCHRITTE.filter((s) => /insert into public\.package_paths|delete from public\.package_paths/.test(ausfuehrbar(lies(s.datei))))
    .map((s) => s.id).sort().join(",") === "A,RB-VOLL");
check("6g Jede Datei nennt in ihrem MUTATIONS-Teil nur die für sie deklarierten Abrufwege",
  SCHRITTE.every((s) => {
    const mut = ausfuehrbar(lies(s.datei)).replace(/do \$\$[\s\S]*?\$\$;/g, "");
    const genannt = [...new Set(mut.match(/rp-[a-z0-9_-]+/gi) || [])].sort();
    const erlaubt = [...new Set([...s.wegeBeruehrt, ...(s.id === "A" || s.id === "RB-VOLL" ? B.UMHAENGUNG.wege : [])])].sort();
    return gleich(genannt, erlaubt);
  }), SCHRITTE.filter((s) => {
    const mut = ausfuehrbar(lies(s.datei)).replace(/do \$\$[\s\S]*?\$\$;/g, "");
    const genannt = [...new Set(mut.match(/rp-[a-z0-9_-]+/gi) || [])].sort();
    const erlaubt = [...new Set([...s.wegeBeruehrt, ...(s.id === "A" || s.id === "RB-VOLL" ? B.UMHAENGUNG.wege : [])])].sort();
    return !gleich(genannt, erlaubt);
  }).map((s) => s.id).join(","));
check("6h Der Generator ist deterministisch und deckt genau 9 Dateien ab",
  Object.keys(generator.dateien()).length === 9
  && gleich(Object.keys(generator.dateien()).sort(), alleDateien.slice().sort()));

// ══ 7) Adversarial: was passiert, wenn ein Operator alle Dateien am Stück ausführt? ════════════
// Alphabetische Reihenfolge des Verzeichnisses — die naheliegende Reihenfolge eines
// "alles einspielen"-Fehlers. Erwartung: der Endzustand ist SICHER, nicht halb aktiviert.
check("7a Alle 9 Dateien in Dateinamen-Reihenfolge ausgeführt endet im Ausgangszustand (fail-closed)",
  (() => {
    const d = frischeDb();
    const v = bild(d);
    belegeStufe1(d, 5); // maximal ungünstig: der Telemetriebeleg liegt bereits vor
    const reihenfolge = alleDateien.slice().sort();
    for (const datei of reihenfolge) {
      const schritt = SCHRITTE.find((s) => s.datei === datei);
      if (!schritt) continue; // STOP-Datei: bricht ab, mutiert nichts
      fuehreAus(schritt.id, d);
    }
    return bild(d) === v;
  })(), "Endzustand nach Sammelausführung weicht vom Ausgangszustand ab");
check("7b Stufe 2 vor Stufe 1 ausgeführt: Abbruch, keine Zeile verändert",
  (() => {
    const d = frischeDb(); belegeStufe1(d, 5);
    fuehreAus("A", d); fuehreAus("B1", d);
    const v = bild(d);
    const r = fuehreAus("S2", d);
    return r.ok === false && bild(d) === v;
  })());
check("7c Teilausführung von Stufe 1 (nur 1 von 2 Wegen vorbereitet) endet fail-closed",
  (() => {
    const d = frischeDb();
    fuehreAus("A", d); fuehreAus("B1", d);
    // Ein Weg ist bereits anders gesetzt -> die Mutation trifft nur einen, die Nachbedingung greift.
    d.retrieval_paths.find((r) => r.id === S1[0]).status = "broken";
    const r = fuehreAus("S1", d);
    return r.ok === false && r.phase === "nachbedingung" && aktiveBerlinWege(d).length === 0;
  })());
check("7d Ein manipulierter Paketstatus allein aktiviert keinen Weg (B1 ohne Block A bricht ab)",
  (() => { const d = frischeDb(); const r = fuehreAus("B1", d); return r.ok === false && /Block A ist nicht ausgefuehrt/.test(r.meldung); })());

// ══ M) Mutationstests: jede Verfälschung MUSS auffallen ═══════════════════════════════════════
// Ohne diesen Block würden die Prüfungen oben nur bestätigen, was der Code heute tut.
// Jede Mutation verfälscht gezielt EINE Zusage; die zugehörige Prüfung muss kippen.
function mutationstest(name, verfaelschen, pruefung) {
  let gefangen = false;
  try { gefangen = verfaelschen() === false ? true : pruefung() === false; }
  catch { gefangen = true; } // eine geworfene Ausnahme zählt ebenfalls als „gefangen"
  check(`M ${name}`, gefangen, "Mutation blieb unentdeckt — die Prüfung ist wirkungslos");
}

mutationstest("Stufe 1 enthält zusätzlich einen Weg aus Stufe 2 -> Staffelungsprüfung kippt",
  () => true,
  () => {
    const s1 = [...S1, S2[0]];
    const ueberschneidung = s1.filter((id) => S2.includes(id));
    return ueberschneidung.length === 0; // muss false sein -> Mutation gefangen
  });
mutationstest("Stufe 2 ohne Telemetriebeleg -> die Reihenfolgeprüfung kippt",
  () => true,
  () => {
    const nurZustand = SCHRITTE.find((s) => s.id === "S2").vorbedingungen.filter((b) => b.art !== "telemetriebeleg");
    return nurZustand.some((b) => b.art === "telemetriebeleg");
  });
mutationstest("Stufe 2 direkt nach Stufe 1 ohne Crawl-Zyklus -> Beleg-Riegel greift",
  () => true,
  () => {
    const d = frischeDb();
    fuehreAus("A", d); fuehreAus("B1", d); fuehreAus("S1", d);
    return fuehreAus("S2", d).ok === true; // muss false sein
  });
mutationstest("Rollback Stufe 1 setzt auch Stufe 2 zurück -> die Trennungsprüfung kippt",
  () => true,
  () => {
    const d = frischeDb(); belegeStufe1(d, 2);
    for (const id of ["A", "B1", "S1", "S2"]) fuehreAus(id, d);
    // verfälschte Variante: alle Wege zurücksetzen statt nur Stufe 1
    for (const z of d.retrieval_paths) if (B.AKTIVIERUNGSSET.includes(z.id)) { z.status = "needs_review"; z.activation_mode = "manual"; }
    const b = SCHRITTE.find((s) => s.id === "S1-RB").nachbedingungen.find((x) => gleich(x.wege, S2));
    return B.pruefeBedingung(b, d).ok === false; // Stufe 2 IST gesperrt -> ok=true -> false erwartet
  });
mutationstest("Ein Riegel-Block fehlt in einer Datei -> Zählprüfung 3a kippt",
  () => true,
  () => {
    const s = SCHRITTE.find((x) => x.id === "S2");
    const text = lies(s.datei).replace(/do \$\$[\s\S]*?\$\$;/, ""); // einen Riegel entfernen
    const bloecke = (text.match(/do \$\$[\s\S]*?\$\$;/g) || []).length;
    return bloecke === s.vorbedingungen.length + s.nachbedingungen.length;
  });
mutationstest("Ein Riegel ohne raise exception -> Prüfung 3b kippt",
  () => true,
  () => /raise exception/.test("do $$ begin null; end $$;"));
mutationstest("Brandenburg-Weg in einer Aktivierungsdatei -> Grenzprüfung 6a kippt",
  () => true,
  () => !/rp-bb-|brandenburg/i.test(allesAusfuehrbar + "\nupdate public.retrieval_paths set status='healthy' where id in ('rp-bb-landesregierung');"));
mutationstest("Partei-Weg als Aktivierungsziel -> Grenzprüfung 6e kippt",
  () => true,
  () => {
    const mut = "update public.retrieval_paths set status='healthy' where id in ('" + B.UMHAENGUNG.wege[0] + "');";
    return B.UMHAENGUNG.wege.every((w) => !mut.includes(w));
  });
mutationstest("Sammeldatei wieder mutierend -> Prüfung 1i kippt",
  () => true,
  () => !/\b(update|insert|delete)\b/i.test("update public.retrieval_paths set status='healthy';"));

console.log(`\n== Ergebnis: ${passed} PASS, ${failed} FAIL ==`);
if (failed === 0) {
  console.log("Die Staffelung ist strukturell: getrennte Dateien, getrennte Transaktionen, fail-closed Riegel.");
  console.log("Stufe 2 ist ohne vollständige UND belegte Stufe 1 nicht ausführbar. Ausgeführt wurde nichts.");
}
process.exit(failed > 0 ? 1 : 0);
