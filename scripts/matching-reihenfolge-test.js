"use strict";

// ============================================================================
// MATCHING-REIHENFOLGE (Befund 1, 500-Mandate-Korrektursprint 2026-09-01)
// ============================================================================
// BESTAETIGTER BEFUND: `matching_results.created_at` friert beim ERSTEN
// Auftreten eines Paares ein (Migration 20260728_matching_audit.sql, Schritt 2:
// "created_at bleibt bewusst unangetastet"; der Upsert setzt es nie neu).
// Rein lesend in Production belegt (2026-09-01): 140 aktuelle Zeilen aus
// 7 Laeufen, JEDER Lauf traegt gemischte created_at-Werte (bis 18 verschiedene
// je Lauf), 588 Rang-Zeitstempel-Inversionen. Eine Sortierung
// `created_at.desc,rank.asc,...` ist deshalb KEINE aktuelle Relevanzordnung:
// ein im juengsten Lauf WICHTIGERES Ergebnis (kleinerer Rang) mit aelterem
// eingefrorenem created_at faellt hinter unwichtigere, juengere Zeilen.
//
// VERTRAG NACH DER KORREKTUR:
//   - aktuelle Projektion (includeAbgeloest=false):
//       order=rank.asc.nullslast,id.asc
//     Der Rang ist bei JEDER aktuellen Zeile der vom juengsten bestaetigenden
//     Lauf berechnete Wert (der Publish-Upsert setzt `rank = excluded.rank`);
//     `id.asc` macht die Ordnung total (Altzeilen ohne Rang sortieren ans Ende).
//   - Historien-/Auditzugang (includeAbgeloest=true): unveraendert zeitlich
//       order=created_at.desc,rank.asc.nullslast,id.asc
//
// Dieser Test war VOR der Korrektur rot (die aktuelle Projektion sortierte
// created_at-primaer; Rot-Lauf dokumentiert im Beleg
// docs/betrieb/500-mandate-theoretische-bereitschaft-2026-09-01.md) und ist
// danach gruen. Er prueft den ECHTEN PostgREST-Order-Vertrag: der order-String
// wird aus dem tatsaechlich gebauten Endpunkt extrahiert und mit
// Postgres-treuer Semantik auf die Regressions-Fixture angewendet.
// Jeder Lauf gehoert ueber scripts/lokal.js gestartet (CLAUDE.md §6).

const storage = require("../lib/helmut/storage");
const contract = require("../lib/helmut/matching-contract");
const { neuerStore } = require("./e2e-vertrag-geruest");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? "  — " + String(detail).slice(0, 300) : ""}`);
  if (cond) pass += 1; else fail += 1;
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// ── PostgREST-/Postgres-treue Ordnung ────────────────────────────────────────
// Parst `order=<feld>.<asc|desc>[.nullsfirst|.nullslast],...` und vergleicht wie
// Postgres: NULLs standardmaessig bei asc zuletzt, bei desc zuerst; Zahlen
// numerisch, alles andere als Text (ISO-Zeitstempel sortieren damit korrekt).
function parseOrder(orderString) {
  return String(orderString).split(",").map((teil) => {
    const stuecke = teil.split(".");
    const feld = stuecke[0];
    const richtung = stuecke.includes("desc") ? "desc" : "asc";
    let nulls = richtung === "desc" ? "first" : "last"; // Postgres-Default
    if (stuecke.includes("nullsfirst")) nulls = "first";
    if (stuecke.includes("nullslast")) nulls = "last";
    return { feld, richtung, nulls };
  });
}
function vergleicheWiePostgres(orderString) {
  const schluessel = parseOrder(orderString);
  return (a, b) => {
    for (const s of schluessel) {
      const va = a[s.feld] == null ? null : a[s.feld];
      const vb = b[s.feld] == null ? null : b[s.feld];
      if (va == null && vb == null) continue;
      if (va == null) return s.nulls === "first" ? -1 : 1;
      if (vb == null) return s.nulls === "first" ? 1 : -1;
      let cmp;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va) < String(vb) ? -1 : (String(va) > String(vb) ? 1 : 0);
      if (cmp !== 0) return s.richtung === "desc" ? -cmp : cmp;
    }
    return 0;
  };
}

// ── Endpunkt-Fang: der ECHTE Lesepfad baut den Endpunkt, wir lesen ihn ab ────
async function fangeEndpunkt({ includeAbgeloest }) {
  let endpunkt = null;
  await storage.listMatchingResults(
    { userId: "mandat-test", limit: 50, includeAbgeloest },
    { ready: () => true, request: (ep) => { endpunkt = ep; return Promise.resolve([]); } }
  );
  if (!endpunkt) throw new Error("listMatchingResults hat keinen Endpunkt gebaut");
  const m = endpunkt.match(/[?&]order=([^&]+)/);
  return { endpunkt, order: m ? decodeURIComponent(m[1]) : null };
}

// ── REGRESSIONS-FIXTURE (der Production-Befund im Kleinen) ──────────────────
// Zwei AKTUELLE Zeilen DESSELBEN Laufs. Das WICHTIGERE Ergebnis (rank 1) traegt
// den AELTEREN eingefrorenen created_at (das Paar existierte schon vor Tagen);
// das unwichtigere (rank 5) entstand erst im juengsten Lauf und traegt den
// juengeren Zeitstempel. Die id des unwichtigeren sortiert bewusst VOR der id
// des wichtigeren, damit auch `id` als Erstschluessel rot wuerde.
const FIXTURE_LAUF = [
  { id: "mr-b-wichtig", user_id: "mandat-test", run_id: "run-7", rank: 1, aktuell: true, created_at: "2026-08-25T05:48:00.000Z" },
  { id: "mr-a-neu", user_id: "mandat-test", run_id: "run-7", rank: 5, aktuell: true, created_at: "2026-09-01T05:48:00.000Z" },
  { id: "mr-c-mittel", user_id: "mandat-test", run_id: "run-7", rank: 3, aktuell: true, created_at: "2026-08-30T05:48:00.000Z" },
  // Altzeile ohne Rang (Legacy, run_id NULL): muss ans ENDE, nie zwischen die
  // gerankten Zeilen (nullslast).
  { id: "mr-0-legacy", user_id: "mandat-test", run_id: null, rank: null, aktuell: true, created_at: "2026-09-01T06:00:00.000Z" }
];

async function main() {
  abschnitt("§1 PostgREST-Order-Vertrag des echten Lesepfads");
  const aktuell = await fangeEndpunkt({ includeAbgeloest: false });
  check("1.1 aktuelle Projektion: order ist rank-primaer (rank.asc.nullslast,id.asc)",
    aktuell.order === "rank.asc.nullslast,id.asc", `order=${aktuell.order}`);
  check("1.2 aktuelle Projektion: created_at ist NICHT Erstschluessel",
    !String(aktuell.order || "").startsWith("created_at"), `order=${aktuell.order}`);
  check("1.3 aktuelle Projektion: Mandantenfilter + aktuell=is.true bleiben Pflicht",
    aktuell.endpunkt.includes("user_id=eq.mandat-test") && aktuell.endpunkt.includes("aktuell=is.true"));

  const historie = await fangeEndpunkt({ includeAbgeloest: true });
  check("1.4 Historien-/Auditzugang bleibt zeitlich (created_at.desc,rank.asc.nullslast,id.asc)",
    historie.order === "created_at.desc,rank.asc.nullslast,id.asc", `order=${historie.order}`);
  check("1.5 Historienzugang traegt KEINEN aktuell-Filter",
    !historie.endpunkt.includes("aktuell=is.true"));

  abschnitt("§2 Regressionskern: eingefrorenes created_at darf die Relevanz nicht drehen");
  // Der ECHTE order-String aus §1 wird Postgres-treu auf die Fixture angewendet —
  // vor der Korrektur (created_at-primaer) stand mr-a-neu (rank 5) vorn: ROT.
  const sortiert = [...FIXTURE_LAUF].sort(vergleicheWiePostgres(aktuell.order));
  check("2.1 das wichtigste Ergebnis (rank 1, AELTESTER eingefrorener created_at) steht zuerst",
    sortiert[0] && sortiert[0].id === "mr-b-wichtig",
    `reihenfolge=${sortiert.map((r) => r.id).join(",")}`);
  check("2.2 vollstaendige Rangordnung 1,3,5 im selben Lauf",
    sortiert.slice(0, 3).map((r) => r.rank).join(",") === "1,3,5",
    `raenge=${sortiert.map((r) => r.rank).join(",")}`);
  check("2.3 Altzeile ohne Rang sortiert ans Ende (nullslast), trotz juengstem created_at",
    sortiert[3] && sortiert[3].id === "mr-0-legacy");
  // Gegenprobe: die ALTE Ordnung haette die Regression NICHT erkannt — sie
  // stellt das unwichtige juengste Ergebnis nach vorn. Damit ist belegt, dass
  // dieser Test die Fehlerklasse wirklich unterscheidet (rot vor der Korrektur).
  const alteOrdnung = [...FIXTURE_LAUF].sort(vergleicheWiePostgres("created_at.desc,rank.asc.nullslast,id.asc"));
  check("2.4 Gegenprobe: created_at-primaer stellt das falsche Ergebnis nach vorn",
    alteOrdnung[0] && alteOrdnung[0].id !== "mr-b-wichtig",
    `alteOrdnung=${alteOrdnung.map((r) => r.id).join(",")}`);

  abschnitt("§3 Postgres-Treue der E2E-Attrappe: created_at friert beim Upsert ein");
  const st = neuerStore({
    getProfile: () => null,
    requestUnderstanding: () => ({}),
    relevanzGateEnabled: () => false
  });
  const uid = "mandat-test";
  // Erstauftritt VOR Tagen: die Zeile existiert bereits mit altem created_at.
  st.matchingResults.set("mr-b-wichtig", {
    id: "mr-b-wichtig", user_id: uid, knowledge_object_id: "ko-b", run_id: "run-alt",
    rank: 9, aktuell: true, created_at: "2026-08-25T05:48:00.000Z"
  });
  // Juengster Lauf bestaetigt die Zeile (neuer Rang 1) und bringt eine neue dazu.
  st.matchingRuns.set("run-7", { id: "run-7", user_id: uid, status: contract.RUN_STATUS.LAUFEND });
  st.auditDeps.publishRun({
    runId: "run-7", userId: uid, rows: [
      { id: "mr-b-wichtig", user_id: uid, knowledge_object_id: "ko-b", run_id: "run-7", rank: 1 },
      { id: "mr-a-neu", user_id: uid, knowledge_object_id: "ko-a", run_id: "run-7", rank: 5 }
    ]
  });
  const zeileB = st.matchingResults.get("mr-b-wichtig");
  const zeileA = st.matchingResults.get("mr-a-neu");
  check("3.1 publish-Upsert laesst created_at der bestehenden Zeile unangetastet (eingefroren)",
    zeileB && zeileB.created_at === "2026-08-25T05:48:00.000Z", `created_at=${zeileB && zeileB.created_at}`);
  check("3.2 publish-Upsert aktualisiert den Rang der bestehenden Zeile",
    zeileB && zeileB.rank === 1);
  check("3.3 neue Zeile bekommt einen juengeren created_at als die eingefrorene",
    zeileA && String(zeileA.created_at) > String(zeileB.created_at));
  // Non-Audit-Pfad (saveMatchingResults) friert genauso ein.
  st.api.saveMatchingResults([{ id: "mr-b-wichtig", user_id: uid, knowledge_object_id: "ko-b", rank: 2 }]);
  const zeileB2 = st.matchingResults.get("mr-b-wichtig");
  check("3.4 saveMatchingResults-Upsert laesst created_at ebenfalls eingefroren",
    zeileB2 && zeileB2.created_at === "2026-08-25T05:48:00.000Z", `created_at=${zeileB2 && zeileB2.created_at}`);

  abschnitt("§4 Attrappe und echter Lesepfad ordnen identisch (rank-primaer)");
  // Stand nach §3: mr-b-wichtig rank 2 (alter created_at), mr-a-neu rank 5
  // (junger created_at). created_at-primaer stuende mr-a-neu vorn — falsch.
  const attrappe = st.api.listMatchingResults({ userId: uid, limit: 50 });
  check("4.1 Attrappe: wichtigeres Ergebnis mit aelterem eingefrorenem created_at zuerst",
    attrappe[0] && attrappe[0].id === "mr-b-wichtig",
    `reihenfolge=${attrappe.map((r) => r.id).join(",")}`);
  const echt = attrappe.slice().sort(vergleicheWiePostgres(aktuell.order)).map((r) => r.id).join(",");
  check("4.2 Attrappenordnung == Postgres-treue Anwendung des echten order-Strings",
    attrappe.map((r) => r.id).join(",") === echt, `attrappe=${attrappe.map((r) => r.id).join(",")} echt=${echt}`);

  console.log(`\nErgebnis: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FEHLER:", e); process.exit(1); });
