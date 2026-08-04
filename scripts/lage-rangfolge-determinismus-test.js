"use strict";

// Regressionstest zum Befund F-E2E (2026-08-04): "nichtdeterministische
// Rangfolge-Tests".
//
// BEWIESENE URSACHE: die sichtbare Rangfolge der Lage kam aus der REIHENFOLGE DER
// ABLAGE (`matching_results` nach `created_at.desc`) statt aus dem BERECHNETEN
// RANG der Zeilen.
//   * Produktivpfad: alle Zeilen eines Laufs teilen sich EIN `now()` (ein
//     Insert-Statement) -> lauter gleiche Werte, deren Reihenfolge PostgreSQL
//     nicht zusichert; ausserdem friert `created_at` beim ERSTEN Auftreten einer
//     Zeile ein (helmut_publish_matching_run, Schritt 2) -> die Liste sortierte
//     faktisch nach "zuerst gesehen", und `limit` schnitt die juengsten statt der
//     relevantesten Zeilen ab.
//   * E2E-Geruest: `created_at` wurde ZEILENWEISE mit `new Date()` gesetzt.
//     Ueberschritt der Publish-Lauf unter Last eine Millisekundengrenze, bekamen
//     die spaeteren (schlechter platzierten) Zeilen einen SPAETEREN Zeitstempel
//     und standen nach `created_at.desc` VORNE -> pilot I10 / brandenburg J8 /
//     berlin J8 schlugen fehl, derselbe Commit war im Re-Run gruen.
//
// Diese Suite laeuft ohne Netz, ohne DB, ohne KI. Jeder Fall hier ist so gebaut,
// dass er gegen den ALTEN Stand rot ist.

const path = require("path");
const root = path.join(__dirname, "..");
const lage = require(path.join(root, "lib/helmut/lage.js"));
const matching = require(path.join(root, "lib/helmut/matching.js"));
const storage = require(path.join(root, "lib/helmut/storage.js"));

// Der Lage-Pfad darf nicht in den flag-gesicherten Scoring-Zweig laufen.
process.env.HELMUT_SCORING_MODE = "off";

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// --- Fixtures ---------------------------------------------------------------
// Vier verstandene Vorgaenge. Die Kennungen sind bewusst so gewaehlt, dass die
// Reihenfolge NICHT alphabetisch mit der Rangfolge zusammenfaellt.
const KOS = [
  { id: "ko-zuerst-relevant", vorgang_id: "vg-1" },
  { id: "ko-mittel", vorgang_id: "vg-2" },
  { id: "ko-schwach", vorgang_id: "vg-3" },
  { id: "ko-abgeschlagen", vorgang_id: "vg-4" }
].map((k, i) => ({
  ...k, status: "update", understanding_status: "complete",
  headline: `Vorgang ${i + 1}`, was_ist_passiert: "Beschlossen.", warum_wichtig: "Wichtig.",
  updated_at: "2026-08-01T06:00:00Z"
}));

const RANGFOLGE = KOS.map((k) => k.id); // erwartete, fachlich richtige Reihenfolge

// Gespeicherte Matching-Zeilen: rank 1..4 in genau dieser fachlichen Reihenfolge.
function zeilen({ createdAt = () => "2026-08-01T05:00:00.000Z", rank = (i) => i + 1 } = {}) {
  return KOS.map((k, i) => ({
    id: `mr-${k.id}`, user_id: "mdb-a", knowledge_object_id: k.id, vorgang_id: k.vorgang_id,
    similarity: 0.9 - i * 0.1, rank: rank(i), aktuell: true,
    matched_features: [], signale: {}, created_at: createdAt(i)
  }));
}

function fakeStorage(rows) {
  return {
    listKnowledgeObjects: async () => KOS.map((k) => ({ ...k })),
    // Bildet den Lesepfad nach: die Ablage liefert die Zeilen in EINER
    // bestimmten Reihenfolge — die Ausgabe darf davon nicht abhaengen.
    listMatchingResults: async () => rows.map((r) => ({ ...r }))
  };
}

async function rangfolge(rows) {
  const ranked = await lage.loadRankedVorgaenge(fakeStorage(rows), null, { id: "mdb-a" }, "mdb-a");
  return ranked.map((k) => k.id);
}

(async () => {
  // ── A · Die Ausgabe haengt NICHT an der Reihenfolge/Alter der Ablage ───────
  abschnitt("A · Rangfolge kommt aus dem berechneten Rang, nicht aus der Ablage");

  const alleGleich = zeilen(); // Produktivfall: ein Statement, ein now()
  check("A1 identische created_at (Produktivfall): Rangfolge = rank 1..4",
    JSON.stringify(await rangfolge(alleGleich)) === JSON.stringify(RANGFOLGE),
    JSON.stringify(await rangfolge(alleGleich)));

  // Der beobachtete Fehlerfall, exakt nachgestellt: zeilenweise fortschreitende
  // Zeitstempel, ausgeliefert in der ALTEN Sortierung (created_at.desc) — damit
  // stand der SCHLECHTESTE Rang vorne und pilot I10 / brandenburg J8 fielen um.
  const tickend = zeilen({ createdAt: (i) => new Date(Date.UTC(2026, 7, 1, 5, 0, 0, i)).toISOString() })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  check("A2 alte Lieferung nach created_at.desc (Fehlerfall unter Last): Rangfolge trotzdem rank 1..4",
    JSON.stringify(await rangfolge(tickend)) === JSON.stringify(RANGFOLGE),
    JSON.stringify(await rangfolge(tickend)));

  // Die Ablage liefert die Zeilen in umgekehrter Reihenfolge (PostgREST-Freiheit
  // bei gleichwertigen Sortierschluesseln, Heap-Reihenfolge nach Upsert).
  check("A3 umgekehrt gelieferte Zeilen: Rangfolge unveraendert",
    JSON.stringify(await rangfolge(alleGleich.slice().reverse())) === JSON.stringify(RANGFOLGE));

  // "created_at friert beim ersten Auftreten ein": ein NEUER, schwacher Vorgang
  // traegt den juengsten Zeitstempel — er darf den relevanten nicht verdraengen.
  const gemischt = zeilen({
    createdAt: (i) => (i === 3 ? "2026-08-04T12:00:00.000Z" : "2026-07-01T05:00:00.000Z")
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  check("A4 juengste Zeile mit schlechtestem Rang steht hinten (kein 'zuerst gesehen'-Ranking)",
    (await rangfolge(gemischt))[0] === "ko-zuerst-relevant"
      && (await rangfolge(gemischt))[3] === "ko-abgeschlagen",
    JSON.stringify(await rangfolge(gemischt)));

  // Alle 24 Lieferreihenfolgen derselben vier Zeilen ergeben dieselbe Ausgabe.
  const permutationen = [];
  (function permutiere(rest, acc) {
    if (!rest.length) { permutationen.push(acc); return; }
    rest.forEach((r, i) => permutiere(rest.filter((_, j) => j !== i), acc.concat([r])));
  })(alleGleich, []);
  const ergebnisse = new Set();
  for (const p of permutationen) ergebnisse.add(JSON.stringify(await rangfolge(p)));
  check("A5 alle 24 Lieferreihenfolgen ergeben GENAU eine Rangfolge",
    permutationen.length === 24 && ergebnisse.size === 1
      && [...ergebnisse][0] === JSON.stringify(RANGFOLGE),
    `${ergebnisse.size} verschiedene: ${[...ergebnisse].join(" | ")}`);

  // ── B · Tiebreak und Altbestand ohne Rang ─────────────────────────────────
  abschnitt("B · Tiebreak (byte-stabil) und Zeilen ohne Rang");

  const gleicherRang = zeilen({ rank: () => 1 });
  check("B1 gleicher Rang: byte-stabiler Tiebreak nach knowledge_object_id",
    JSON.stringify(await rangfolge(gleicherRang))
      === JSON.stringify(KOS.map((k) => k.id).slice().sort()),
    JSON.stringify(await rangfolge(gleicherRang)));

  const ohneRang = zeilen({ rank: (i) => (i === 0 ? null : i + 1) });
  check("B2 Zeile ohne Rang (Altbestand) steht HINTEN, nie vor einem belegten Rang",
    (await rangfolge(ohneRang)).indexOf("ko-zuerst-relevant") === 3,
    JSON.stringify(await rangfolge(ohneRang)));

  const kaputterRang = zeilen({ rank: (i) => (i === 1 ? "keine-zahl" : i + 1) });
  check("B3 unlesbarer Rang wird wie 'kein Rang' behandelt (hinten), nicht wie 0",
    (await rangfolge(kaputterRang)).indexOf("ko-mittel") === 3,
    JSON.stringify(await rangfolge(kaputterRang)));

  // ── C · Der Lesevertrag der Ablage sortiert selbst nach Rang ──────────────
  abschnitt("C · storage.listMatchingResults: Sortier- und Abschneidevertrag");

  const gesehen = [];
  const deps = { ready: () => true, request: (endpoint) => { gesehen.push(endpoint); return Promise.resolve([]); } };
  await storage.listMatchingResults({ userId: "mdb-a", limit: 12 }, deps);
  check("C1 Sortierung nach berechnetem Rang (nullslast)",
    gesehen[0].includes("order=rank.asc.nullslast"), gesehen[0]);
  check("C2 eindeutiger Tiebreak in der Abfrage (knowledge_object_id.asc)",
    /order=rank\.asc\.nullslast,knowledge_object_id\.asc/.test(gesehen[0]), gesehen[0]);
  check("C3 NICHT mehr nach Schreibzeitpunkt sortiert (created_at)",
    !gesehen[0].includes("order=created_at"), gesehen[0]);
  check("C4 Mandantenfilter und Aktualitaetsfilter bleiben unangetastet",
    gesehen[0].includes("user_id=eq.mdb-a") && gesehen[0].includes("aktuell=is.true"), gesehen[0]);

  // ── D · Tiebreak des reinen Matchings ist locale-unabhaengig ──────────────
  abschnitt("D · matchProfileToKnowledgeObjects: byte-stabiler Tiebreak");

  // Zwei Objekte mit IDENTISCHEM Inhalt (=> identische Aehnlichkeit, identische
  // Merkmale). Nur die Kennung unterscheidet sie. "Bx" < "ax" byteweise, aber
  // localeCompare ordnet in der Standard-Locale genau andersherum.
  const zwilling = (id) => ({
    id, vorgang_id: id, status: "update", understanding_status: "complete",
    headline: "Tariftreuegesetz", was_ist_passiert: "Kabinett hat beschlossen.",
    warum_wichtig: "Arbeit und Soziales.", themen: ["Arbeit"]
  });
  const profil = { id: "mdb-a", committees: ["Arbeit und Soziales"], topics: ["Arbeit"], party: "SPD" };
  const treffer = matching.matchProfileToKnowledgeObjects(profil, [zwilling("ko-ax"), zwilling("ko-Bx")], { limit: 10 });
  check("D1 bei Punktgleichstand entscheidet die BYTE-Reihenfolge der Kennung",
    treffer.length === 2 && treffer[0].knowledge_object_id === "ko-Bx",
    JSON.stringify(treffer.map((t) => [t.knowledge_object_id, t.similarity])));
  check("D2 Beleg, dass dieser Fall localeCompare tatsaechlich widerspricht",
    "ko-Bx".localeCompare("ko-ax") > 0 && "ko-Bx" < "ko-ax");
  const umgedreht = matching.matchProfileToKnowledgeObjects(profil, [zwilling("ko-Bx"), zwilling("ko-ax")], { limit: 10 });
  check("D3 Eingabereihenfolge aendert das Ergebnis nicht",
    JSON.stringify(treffer.map((t) => t.knowledge_object_id))
      === JSON.stringify(umgedreht.map((t) => t.knowledge_object_id)));

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  if (failed > 0) process.exit(1);
})().catch((e) => { console.error("Test-Fehler:", e); process.exit(1); });
