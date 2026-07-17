"use strict";

// Offline-Test des BE/BB-Vollmodells (Landtag-Sprint Phase 5/6). REINE LOGIK, kein Netz/DB.
// Beweist: Vollstaendigkeit der Modelle, Eindeutigkeit/Isolation, Nichtaktivierung des
// generierten Seeds, kollisionsfreie Einbindung in die Klassifikation (Bundestag unveraendert).

const { BERLIN_MODELL, BERLIN_WAHLKREISVERTEILUNG_2026 } = require("../lib/helmut/quellenarchitektur/seeds/landtag-berlin");
const { BRANDENBURG_MODELL, BRANDENBURG_WAHLKREISNAMEN } = require("../lib/helmut/quellenarchitektur/seeds/landtag-brandenburg");
const { POLITICAL_ENTITIES, LANDTAG_ENTITIES } = require("../lib/helmut/quellenarchitektur/seeds/entities");
const gen = require("./generate-landtag-vollmodell-seed");
const C = require("../lib/helmut/quellenarchitektur/classification");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

// --- 1. Vollstaendigkeit der geforderten Modellteile -------------------------------------------
check("1a Berlin: Abgeordnetenhaus + Senat referenziert, 18 Ausschuesse, 4+1 Fraktionen, 11 Senatsverwaltungen (inkl. Senatskanzlei), Behoerden, 78 Wahlkreise, Medien, Relevanzregeln",
  BERLIN_MODELL.parlamentId === "parliament-berlin-agh" && BERLIN_MODELL.regierungId === "government-berlin-senat"
  && BERLIN_MODELL.ausschuesse.length === 18 && BERLIN_MODELL.fraktionen.length === 4
  && BERLIN_MODELL.verwaltungen.length === 11 && BERLIN_MODELL.behoerden.length >= 3
  && BERLIN_MODELL.wahlkreise.length === 78 && BERLIN_MODELL.medien.length >= 5
  && Array.isArray(BERLIN_MODELL.relevanz.regierungsBegriffe));
check("1b Brandenburg: Landtag + Staatskanzlei/Ministerien (10), 14 Ausschuesse, 4 Fraktionen + 1 Gruppe, Behoerden, 44 Wahlkreise, Medien, Relevanzregeln",
  BRANDENBURG_MODELL.parlamentId === "parliament-brandenburg-landtag"
  && BRANDENBURG_MODELL.ministerien.length === 10 && BRANDENBURG_MODELL.ausschuesse.length === 14
  && BRANDENBURG_MODELL.fraktionen.length === 4 && BRANDENBURG_MODELL.gruppen.length === 1
  && BRANDENBURG_MODELL.behoerden.length >= 3 && BRANDENBURG_MODELL.wahlkreise.length === 44
  && BRANDENBURG_MODELL.medien.length >= 5);

// --- 2. Wahlkreise: Summen, Nummern, Namensschema ----------------------------------------------
const beSumme = Object.values(BERLIN_WAHLKREISVERTEILUNG_2026).reduce((a, b) => a + b, 0);
check("2a Berlin: 12 Bezirke, Summe 78 (Einteilung AGH 2026)",
  Object.keys(BERLIN_WAHLKREISVERTEILUNG_2026).length === 12 && beSumme === 78);
check("2b Berlin: Namensschema '<Bezirk> <Nr>'", BERLIN_MODELL.wahlkreise.every((w) => /^[\wäöüÄÖÜß-]+.* \d+$/.test(w.name) && w.kind === "landtagswahlkreis"));
check("2c Brandenburg: Nummern 1..44 lueckenlos",
  BRANDENBURG_WAHLKREISNAMEN.length === 44
  && BRANDENBURG_WAHLKREISNAMEN.every(([n], i) => n === i + 1));
check("2d Brandenburg: teilverifizierte Wahlkreise explizit markiert (28/34/42)",
  BRANDENBURG_WAHLKREISNAMEN.filter(([, , v]) => v === false).map(([n]) => n).join(",") === "28,34,42");

// --- 3. Eindeutigkeit + Isolation ---------------------------------------------------------------
const alleIds = [...gen.alleEntitaeten().map((e) => e.id), ...gen.alleWahlkreise().map((w) => w.id)];
check("3a Ids global eindeutig (Modell)", new Set(alleIds).size === alleIds.length);
check("3b Ids kollidieren nicht mit bestehenden POLITICAL_ENTITIES (Bund-Kern)",
  POLITICAL_ENTITIES.filter((e) => alleIds.includes(e.id)).length === LANDTAG_ENTITIES.length);
check("3c ISOLATION: jede Berlin-Entitaet traegt geo-land-berlin, jede Brandenburg-Entitaet geo-land-brandenburg",
  [...BERLIN_MODELL.ausschuesse, ...BERLIN_MODELL.fraktionen, ...BERLIN_MODELL.verwaltungen, ...BERLIN_MODELL.behoerden].every((e) => e.geography_id === "geo-land-berlin")
  && [...BRANDENBURG_MODELL.ausschuesse, ...BRANDENBURG_MODELL.fraktionen, ...BRANDENBURG_MODELL.gruppen, ...BRANDENBURG_MODELL.ministerien, ...BRANDENBURG_MODELL.behoerden].every((e) => e.geography_id === "geo-land-brandenburg"));
check("3d Kollisionsschutz: KEINE Landtag-Entitaet traegt ein committee-/parliamentary_group-canonical_key",
  LANDTAG_ENTITIES.every((e) => !e.canonical_key || !["committee", "parliamentary_group"].includes(e.entity_type)));

// --- 4. Klassifikation: Landes-Aufloesung additiv, Bundestag unveraendert ----------------------
const rBE = C.resolveEntity("Ausschuss für Inneres, Sicherheit und Ordnung", "committee");
check("4a AGH-Ausschuss per exaktem Namen aufloesbar (entity_id committee-agh-inneres)",
  rBE && rBE.entity_id === "committee-agh-inneres" && rBE.confidence === "high");
const rBB = C.resolveEntity("Ministerium des Innern und für Kommunales", "ministry");
check("4b BB-Ministerium per exaktem Namen aufloesbar", rBB && rBB.entity_id === "ministry-bb-mik");
const rBT = C.resolveEntity("Ausschuss für Inneres und Heimat", "committee");
check("4c Bundestag UNVERAENDERT: BT-Innenausschuss loest weiter auf committee-bt-* auf",
  rBT && /^committee-bt-/.test(rBT.entity_id || ""));
const rKurz = C.resolveEntity("Inneres", "committee");
check("4d Kurzform 'Inneres' loest weiter auf den BT-Ausschuss (canonical_key-Index unveraendert)",
  rKurz && /^committee-bt-/.test(rKurz.entity_id || ""));
// Hinweis: Namen mit bekanntem Fach-Stem (z. B. "…kultur…") loesen wie bisher per
// canonical_key mit confidence 'medium' auf den BT-Ausschuss auf (bestehendes Verhalten,
// bewusst unveraendert — Landes-Entitaeten haben keinen key und koennen das nie umlenken).
check("4e Unbekannter Name OHNE bekannten Fach-Stem bleibt ehrlich null-Id (nichts erfinden)",
  C.resolveEntity("Gremium für Zukunftsfragen Berlin", "committee").entity_id === null);

// --- 5. Seed-Generator: Nichtaktivierung + Pruefmarker ------------------------------------------
const { sql, unverifiziert } = gen.build();
check("5a Seed enthaelt NUR political_entities + electoral_districts (keine Abrufwege/Pakete/Publisher/Status-Flips)",
  !/insert into public\.(retrieval_paths|publishers|source_packages|package_paths)/.test(sql)
  && !/update /i.test(sql)
  && /insert into public\.political_entities/.test(sql)
  && /insert into public\.electoral_districts/.test(sql));
check("5b Seed ist idempotent + nicht-destruktiv (on conflict do nothing, kein delete/drop)",
  /on conflict \(id\) do nothing/.test(sql) && !/delete from|drop /i.test(sql));
check("5c Teilverifizierte Eintraege sind im Seed-Kopf als Pruefpflicht markiert",
  unverifiziert.length >= 3 && sql.includes("VOR DEM ANWENDEN AMTLICH PRUEFEN")
  && sql.includes("wk-ltbb-28") && sql.includes("wk-ltbb-34") && sql.includes("wk-ltbb-42"));
check("5d Seed markiert Freigabepflicht", /FREIGABEPFLICHTIG/.test(sql));

// --- 6. Fixtures passen zum Modell (Ausschuss-/Verwaltungsnamen existieren) --------------------
const fs = require("fs");
const path = require("path");
const beFx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "profiles", "landtag-berlin-testprofil.json"), "utf8"));
const bbFx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "profiles", "landtag-brandenburg-testprofil.json"), "utf8"));
const beNamen = new Set(BERLIN_MODELL.ausschuesse.map((a) => a.name).concat(BERLIN_MODELL.ausschuesse.flatMap((a) => a.aliases || [])));
const bbNamen = new Set(BRANDENBURG_MODELL.ausschuesse.map((a) => a.name).concat(BRANDENBURG_MODELL.ausschuesse.flatMap((a) => a.aliases || [])));
check("6a Berlin-Fixture-Ausschuesse existieren im Modell",
  beFx.committees.every((c) => beNamen.has(c) || [...beNamen].some((n) => n.startsWith(c))));
check("6b Brandenburg-Fixture-Ausschuesse existieren im Modell",
  bbFx.committees.every((c) => bbNamen.has(c) || [...bbNamen].some((n) => n.startsWith(c))));
const beMin = new Set(BERLIN_MODELL.verwaltungen.map((m) => m.name).concat(BERLIN_MODELL.verwaltungen.flatMap((m) => m.aliases || [])));
const bbMin = new Set(BRANDENBURG_MODELL.ministerien.map((m) => m.name).concat(BRANDENBURG_MODELL.ministerien.flatMap((m) => m.aliases || [])));
check("6c Fixture-Ministerien/Senatsverwaltungen existieren in den Modellen",
  beFx.relevantMinistries.every((m) => beMin.has(m)) && bbFx.relevantMinistries.every((m) => bbMin.has(m)));

console.log(`\n== Landtag-Vollmodell-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
