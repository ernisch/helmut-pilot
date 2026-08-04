"use strict";

// HOTFIX-Test (2026-07-29) — abgeloeste Matching-Ergebnisse duerfen NICHT in
// aktive Nutzerpfade gelangen.
//
// Hintergrund: `HELMUT_MATCHING_AUDIT` ist in Production aktiv. Der erste Lauf
// erzeugte 290 `matching_results` (271 aktuell, 19 abgeloest). Der Lesepfad
// `storage.listMatchingResults` filterte bisher nicht auf `aktuell = true`.
//
// Geprueft werden genau die neun Pflichtpunkte des Hotfixes:
//   1  Standardlesepfad liefert ausschliesslich aktuell=true
//   2  aktuell=false verdraengt wegen `limit` keine aktuellen Zeilen
//   3  includeAbgeloest: true liefert die Historie nur beim ausdruecklichen Aufruf
//   4  Tenant-Isolation bleibt bestehen
//   5  Sortierung aktueller Ergebnisse bleibt unveraendert
//   6  Lage-Nutzerpfad erhaelt keine abgeloesten Ergebnisse
//   7  Legacy-Zeilen (run_id = NULL, aktuell = true) funktionieren weiter
//   8  keine Schreiboperation auf matching_results
//   9  keine zusaetzlichen KI-Aufrufe
//
// Vollstaendig offline: 0 Netz, 0 Datenbank, 0 KI.

const path = require("path");

const root = path.join(__dirname, "..");
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

process.env.HELMUT_TENANT_JWT_MODE = process.env.HELMUT_TENANT_JWT_MODE || "";
const storage = require(path.join(root, "lib/helmut/storage.js"));
const lage = require(path.join(root, "lib/helmut/lage.js"));

// Alle vom Lesepfad abgesetzten Anfragen werden mitgeschrieben — Endpoint UND
// Optionen. Nur so ist "keine Schreiboperation" beweisbar und nicht nur behauptet.
const gesehene = [];

// Minimaler PostgREST-Nachbau fuer genau die hier genutzten Operatoren:
// filtern -> sortieren -> limitieren, in DIESER Reihenfolge. Das ist der Punkt
// des Hotfixes: der Aktualitaetsfilter greift VOR dem Limit.
// `null`/fehlender Rang sortiert nach hinten (PostgREST: nullslast).
function rangWert(r) {
  const roh = r ? r.rank : null;
  if (roh == null || roh === "") return Number.POSITIVE_INFINITY;
  const n = Number(roh);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function fakePostgrest(bestand) {
  return (endpoint, options) => {
    gesehene.push({ endpoint, options: options || null });
    const [, query = ""] = String(endpoint).split("?");
    const params = new URLSearchParams(query);
    let rows = bestand.slice();
    const uid = params.get("user_id");
    if (uid && uid.startsWith("eq.")) rows = rows.filter((r) => r.user_id === uid.slice(3));
    if (params.get("aktuell") === "is.true") rows = rows.filter((r) => r.aktuell === true);
    if (params.get("order") === "created_at.desc") {
      rows = rows.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    // Seit dem F-E2E-Fix (2026-08-04) sortiert der Lesepfad nach dem BERECHNETEN
    // Rang; Zeilen ohne Rang stehen hinten, Tiebreak ist die Objektkennung.
    if (params.get("order") === "rank.asc.nullslast,knowledge_object_id.asc") {
      rows = rows.slice().sort((a, b) => (rangWert(a) - rangWert(b))
        || (String(a.knowledge_object_id) < String(b.knowledge_object_id) ? -1
          : (String(a.knowledge_object_id) > String(b.knowledge_object_id) ? 1 : 0)));
    }
    const limit = Number(params.get("limit"));
    if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);
    return Promise.resolve(rows);
  };
}

function zeile(over = {}) {
  return {
    id: over.id || `mr-${Math.random().toString(36).slice(2, 8)}`,
    user_id: "mdb-a",
    knowledge_object_id: over.knowledge_object_id || "ko-x",
    aktuell: true,
    abgeloest_am: null,
    run_id: "run-1",
    created_at: "2026-07-29T10:00:00.000Z",
    ...over
  };
}

// Produktionsnaher Bestand: 19 abgeloeste Zeilen sind JUENGER als die aktuellen —
// genau der Fall, der im Nutzerlimit oben stehen wuerde. Zusaetzlich eine
// Legacy-Zeile mit run_id = NULL, wie sie in Production existiert.
const bestandA = [];
for (let i = 0; i < 19; i += 1) {
  bestandA.push(zeile({
    id: `mr-alt-${i}`,
    knowledge_object_id: `ko-alt-${i}`,
    // Abgeloeste Zeilen tragen den Rang IHRES Laufs — sie stehen in der
    // rangbasierten Sortierung also ganz vorne, wenn der Aktualitaetsfilter fehlt.
    rank: i + 1,
    aktuell: false,
    abgeloest_am: "2026-07-29T10:05:00.000Z",
    created_at: `2026-07-29T11:${String(i).padStart(2, "0")}:00.000Z`
  }));
}
// Die Raenge laufen BEWUSST gegen die Schreibzeit (juengste Zeile = schlechtester
// Rang). Nur so ist belegbar, dass der Lesepfad nach Rang und nicht nach Alter
// sortiert (Befund F-E2E, 2026-08-04).
for (let i = 0; i < 8; i += 1) {
  bestandA.push(zeile({
    id: `mr-neu-${i}`,
    knowledge_object_id: `ko-neu-${i}`,
    rank: 8 - i,
    created_at: `2026-07-29T10:${String(20 - i).padStart(2, "0")}:00.000Z`
  }));
}
const legacyZeile = zeile({
  id: "mr-legacy",
  knowledge_object_id: "ko-legacy",
  run_id: null,
  created_at: "2026-07-29T09:00:00.000Z"
});
bestandA.push(legacyZeile);
// Fremdmandant — darf nie im Ergebnis von mdb-a auftauchen.
bestandA.push(zeile({
  id: "mr-fremd", user_id: "mdb-b", knowledge_object_id: "ko-fremd",
  created_at: "2026-07-29T11:59:00.000Z"
}));

const deps = { ready: () => true, request: fakePostgrest(bestandA) };

(async () => {
  console.log("== A · Standardlesepfad ==");

  const standard = await storage.listMatchingResults({ userId: "mdb-a", limit: 12 }, deps);

  // 1 · Standardlesepfad liefert ausschliesslich aktuell=true
  check("A1 Endpoint traegt den Aktualitaetsfilter (aktuell=is.true)",
    gesehene[0].endpoint.includes("aktuell=is.true"));
  check("A2 Ergebnis enthaelt KEINE abgeloeste Zeile",
    standard.length > 0 && standard.every((r) => r.aktuell === true));
  check("A3 keine der 19 abgeloesten Kennungen im Ergebnis",
    !standard.some((r) => String(r.knowledge_object_id).startsWith("ko-alt-")));

  // 2 · Limit-Verdraengung: die abgeloesten Zeilen sind juenger und wuerden ohne
  // Filter das gesamte Limit von 12 belegen. Mit Filter kommen die 9 aktuellen
  // Zeilen vollstaendig durch.
  check("A4 Limit wird ausschliesslich mit aktuellen Zeilen gefuellt (9 von 9)",
    standard.length === 9);
  const ohneFilter = await storage.listMatchingResults(
    { userId: "mdb-a", limit: 12, includeAbgeloest: true }, deps);
  check("A5 Gegenprobe: ohne Filter verdraengen abgeloeste Zeilen aktuelle aus dem Limit",
    ohneFilter.length === 12
    && ohneFilter.filter((r) => r.aktuell === false).length > 0
    && ohneFilter.filter((r) => r.aktuell === true).length < 9);
  check("A6 Filter greift VOR dem Limit (Filter und Limit im selben Endpoint)",
    gesehene[0].endpoint.includes("aktuell=is.true") && gesehene[0].endpoint.includes("limit=12"));

  // 3 · Historienzugang nur auf ausdruecklichen Aufruf
  check("A7 includeAbgeloest=true setzt den Aktualitaetsfilter NICHT",
    !gesehene[1].endpoint.includes("aktuell=is.true"));
  check("A8 Historienzugang liefert abgeloeste Zeilen (Nachvollziehbarkeit erhalten)",
    ohneFilter.some((r) => r.aktuell === false));
  check("A9 Historienzugang bleibt mandantengefiltert",
    gesehene[1].endpoint.includes("user_id=eq.mdb-a")
    && ohneFilter.every((r) => r.user_id === "mdb-a"));

  // 5 · Sortierung: seit dem F-E2E-Fix (2026-08-04) entscheidet der BERECHNETE
  //     Rang, nicht der Schreibzeitpunkt. Vorher stand hier `created_at.desc` —
  //     das war unbestimmt (alle Zeilen eines Laufs teilen ein `now()`) und
  //     fachlich falsch (`created_at` friert beim ersten Auftreten ein).
  check("A10 Sortierung nach berechnetem Rang mit eindeutigem Tiebreak (kein created_at)",
    gesehene[0].endpoint.includes("order=rank.asc.nullslast,knowledge_object_id.asc")
    && !gesehene[0].endpoint.includes("created_at"));
  const nachRangAufsteigend = standard
    .every((r, i) => i === 0 || rangWert(standard[i - 1]) <= rangWert(r));
  check("A11 aktuelle Ergebnisse stehen in aufsteigender Rangfolge (Zeilen ohne Rang hinten)",
    nachRangAufsteigend);
  check("A12 der schlechteste Rang steht hinten, obwohl seine Zeile die JUENGSTE ist",
    standard[0].knowledge_object_id === "ko-neu-7"
    && standard[7].knowledge_object_id === "ko-neu-0"
    && standard[8].knowledge_object_id === "ko-legacy");

  // 7 · Legacy-Zeilen
  check("A13 Legacy-Zeile (run_id=NULL, aktuell=true) bleibt sichtbar",
    standard.some((r) => r.knowledge_object_id === "ko-legacy" && r.run_id === null));

  // 4 · Tenant-Isolation
  console.log("\n== B · Mandantentrennung ==");
  check("B1 Fremdmandant taucht nicht im Ergebnis auf",
    !standard.some((r) => r.user_id !== "mdb-a"));
  const fremd = await storage.listMatchingResults({ userId: "mdb-b", limit: 12 }, deps);
  check("B2 Mandant B sieht ausschliesslich eigene Zeilen",
    fremd.length === 1 && fremd[0].user_id === "mdb-b");
  check("B3 Mandantenfilter bleibt im Endpoint verpflichtend",
    gesehene.every((g) => /user_id=eq\./.test(g.endpoint)));
  let tenantFehler = null;
  try { await storage.listMatchingResults({}, deps); } catch (e) { tenantFehler = e; }
  check("B4 ohne Mandant -> harter Fehler (kein stiller Alle-Mandanten-Zugriff)",
    !!tenantFehler);
  let tenantFehler2 = null;
  try {
    await storage.listMatchingResults({ userId: null, includeAbgeloest: true }, deps);
  } catch (e) { tenantFehler2 = e; }
  check("B5 auch der Historienzugang erzwingt einen Mandanten",
    !!tenantFehler2);

  // 8 · keine Schreiboperation auf matching_results
  console.log("\n== C · Keine Schreiboperation, kein KI-Aufruf ==");
  const schreibend = gesehene.filter((g) => {
    const m = String((g.options && g.options.method) || "GET").toUpperCase();
    return m !== "GET" && m !== "HEAD";
  });
  check("C1 kein einziger nicht-lesender Aufruf auf matching_results",
    schreibend.length === 0);
  check("C2 kein Aufruf traegt einen Body",
    gesehene.every((g) => !g.options || g.options.body === undefined));
  check("C3 kein Aufruf zielt auf eine RPC-/Publikationsroute",
    gesehene.every((g) => !/\/rest\/v1\/rpc\//.test(g.endpoint)));
  check("C4 Bestand ist nach allen Lesezugriffen unveraendert",
    bestandA.filter((r) => r.aktuell === false).length === 19
    && bestandA.filter((r) => r.aktuell === true).length === 10
    && legacyZeile.run_id === null && legacyZeile.aktuell === true);

  // 6 · Lage-Nutzerpfad
  console.log("\n== D · Lage-Nutzerpfad ==");

  const kos = ["ko-neu-0", "ko-alt-0", "ko-legacy"].map((id) => ({
    id,
    vorgang_id: id,
    status: "ready",
    understanding_status: "complete",
    was_ist_passiert: `Sachstand ${id}`,
    warum_wichtig: `Einordnung ${id}`
  }));

  let lageAufruf = null;
  const lageStorage = {
    listKnowledgeObjects: async () => kos,
    listMatchingResults: async (args) => {
      lageAufruf = args || {};
      // Der Nutzerpfad darf die Historie nicht anfordern.
      if (lageAufruf.includeAbgeloest) {
        throw new Error("Nutzerpfad hat abgeloeste Zeilen angefordert");
      }
      // Verhalten des korrigierten Lesepfads: nur aktuelle Zeilen.
      return bestandA
        .filter((r) => r.user_id === "mdb-a" && r.aktuell === true)
        .filter((r) => kos.some((k) => k.id === r.knowledge_object_id))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
  };

  const rangliste = await lage.loadRankedVorgaenge(lageStorage, null, {}, "mdb-a");
  check("D1 Lage fordert die Historie nicht an (includeAbgeloest ungesetzt)",
    lageAufruf !== null && !lageAufruf.includeAbgeloest);
  check("D2 Lage uebergibt den Mandanten",
    lageAufruf.userId === "mdb-a");
  check("D3 abgeloester Vorgang erscheint NICHT in der Lage",
    !rangliste.some((k) => k.id === "ko-alt-0"));
  check("D4 aktueller Vorgang erscheint in der Lage",
    rangliste.some((k) => k.id === "ko-neu-0"));
  check("D5 Legacy-Vorgang (run_id=NULL) erscheint weiterhin in der Lage",
    rangliste.some((k) => k.id === "ko-legacy"));
  check("D6 Lage enthaelt ausschliesslich aktuelle Vorgaenge",
    rangliste.length === 2);

  // 9 · keine zusaetzlichen KI-Aufrufe: der gesamte Pfad laeuft ohne das
  // KI-Modul. Wird es geladen, wird jeder Einstieg zur Falle.
  const ai = require(path.join(root, "lib/helmut/ai.js"));
  const kiAufrufe = [];
  const kiOriginal = {};
  for (const name of Object.keys(ai)) {
    if (typeof ai[name] !== "function") continue;
    kiOriginal[name] = ai[name];
    ai[name] = (...a) => { kiAufrufe.push(name); return kiOriginal[name](...a); };
  }
  await storage.listMatchingResults({ userId: "mdb-a", limit: 12 }, deps);
  await lage.loadRankedVorgaenge(lageStorage, null, {}, "mdb-a");
  for (const name of Object.keys(kiOriginal)) ai[name] = kiOriginal[name];
  check("C5 kein KI-Aufruf im gesamten korrigierten Lesepfad",
    kiAufrufe.length === 0);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
