"use strict";

// Helmut — Quellenarchitektur · CI-Gate gegen Seed-Drift (P0-1, Architektur-Audit 29).
//
// URSACHE DES BEHOBENEN P0-1-BEFUNDS: die committeten Seed-SQL-Dateien sind laut eigenem
// Dateikopf GENERIERTE Artefakte ("NICHT von Hand editieren"), wurden aber wiederholt nicht
// neu generiert, nachdem der Code (seeds/packages.js, sources.js), aus dem sie entstehen,
// sich geaendert hatte — u. a. dadurch lieferte "die-linke-bund" im committeten Seed 0
// funktionierende Abrufwege, obwohl der Code laengst eine Regel dafuer hatte.
//
// Dieser Test schliesst die Luecke strukturell: er ruft dieselben build()-Funktionen wie die
// beiden Generatoren rein in-memory auf (KEIN Datei-Schreiben) und vergleicht das Ergebnis
// BYTE-GENAU gegen die tatsaechlich committeten Dateien. Jede kuenftige Aenderung an Code, die
// den Seed beeinflusst, OHNE dass `node scripts/generate-*.js` erneut ausgefuehrt + committet
// wurde, macht diesen Test rot -> der Build (run-offline-tests.js, CI) schlaegt fehl.
//
// Reiner Offline-Test (kein Netz, keine KI, kein DB-Zugriff, kein Datei-Schreiben).

const fs = require("fs");
const path = require("path");
const bund = require("./generate-source-architecture-seed");
const landesmodul = require("./generate-landesmodul-seed");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

function readCommitted(relPath) {
  return fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

// --- 1) Bund-Seed (20260713_source_architecture_seed.sql) -------------------
const committedBund = readCommitted("supabase/seeds/20260713_source_architecture_seed.sql");
const generatedBund = bund.build();
check(
  "Bund-Seed: committete Datei == generate() (kein Drift)",
  committedBund === generatedBund
);
if (committedBund !== generatedBund) {
  console.log("  -> Datei ist veraltet. Beheben: node scripts/generate-source-architecture-seed.js && git add supabase/seeds/20260713_source_architecture_seed.sql");
}

// --- 2) Landesmodul-Seed BE/BB (20260717_..._seed.sql + Rollback) -----------
const committedLand = readCommitted("supabase/seeds/20260717_landesmodul_be_bb_seed.sql");
const committedLandRollback = readCommitted("supabase/seeds/20260717_landesmodul_be_bb_seed_rollback.sql");
const { sql: generatedLand, seed: generatedSeed } = landesmodul.build();
const generatedLandRollback = landesmodul.buildRollback(generatedSeed);
check(
  "Landesmodul-Seed (BE/BB): committete Datei == generate() (kein Drift)",
  committedLand === generatedLand
);
check(
  "Landesmodul-Rollback (BE/BB): committete Datei == generate() (kein Drift)",
  committedLandRollback === generatedLandRollback
);
if (committedLand !== generatedLand || committedLandRollback !== generatedLandRollback) {
  console.log("  -> Datei(en) veraltet. Beheben: node scripts/generate-landesmodul-seed.js && git add supabase/seeds/20260717_landesmodul_be_bb_seed*.sql");
}

// --- 2b) Berlin-Aktivierungs-SQL (20260726_berlin_aktivierung*.sql) ---------
// Freigabepflichtiges Production-SQL; muss genauso drift-frei sein wie die Seeds, sonst
// beschreibt das Runbook einen anderen Eingriff als die Datei, die ausgefuehrt wird.
// 14A: aus einer Sammeldatei + 2 Rollbacks sind 9 Dateien geworden (je Ausfuehrungsschritt
// eine). Der Drift-Check laeuft ueber die vollstaendige Menge, damit keine Datei durchfaellt.
const berlin = require("./generate-berlin-aktivierung-sql");
const berlinErzeugt = berlin.dateien();
const berlinSeed = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");
let berlinDrift = false;
for (const [name, erzeugt] of Object.entries(berlinErzeugt)) {
  const ok = readCommitted("supabase/seeds/" + name) === erzeugt;
  if (!ok) berlinDrift = true;
  check(`Berlin-Aktivierung: ${name} == generate() (kein Drift)`, ok);
}
if (berlinDrift) {
  console.log("  -> Datei(en) veraltet. Beheben: node scripts/generate-berlin-aktivierung-sql.js && git add supabase/seeds/20260726_berlin_aktivierung*.sql");
}
check("Berlin-Aktivierung: jeder deklarierte Ausfuehrungsschritt hat eine committete Datei",
  berlinSeed.ausfuehrungsschritte().every((s) => Object.prototype.hasOwnProperty.call(berlinErzeugt, s.datei))
  && Object.keys(berlinErzeugt).length === berlinSeed.ausfuehrungsschritte().length + 1,
  Object.keys(berlinErzeugt).join(","));
check("Berlin-Aktivierungs-Generator ist deterministisch (2. Lauf byte-identisch)",
  JSON.stringify(berlin.dateien()) === JSON.stringify(berlinErzeugt));

// --- 3) Determinismus: zweiter In-Memory-Lauf liefert byte-identisches Ergebnis -----
// (ergaenzt den Drift-Check: nicht nur "stimmt mit der Datei ueberein", sondern
// "der Generator selbst ist stabil" — schuetzt vor nicht-deterministischen Quellen
// wie Objekt-Iterationsreihenfolge ueber Map/Set-Umwege oder versteckten Zeitstempeln.)
check("Bund-Seed-Generator ist deterministisch (2. Lauf byte-identisch)", bund.build() === generatedBund);
const secondLand = landesmodul.build();
check("Landesmodul-Seed-Generator ist deterministisch (2. Lauf byte-identisch)", secondLand.sql === generatedLand);

console.log(`\n== Ergebnis: ${fail === 0 ? "ALLE TESTS GRÜN — Seeds sind der Source of Truth (Code) treu" : fail + " FEHLGESCHLAGEN — committeter Seed driftet vom Code"} ==`);
process.exit(fail > 0 ? 1 : 0);
