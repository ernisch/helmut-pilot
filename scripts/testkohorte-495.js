"use strict";

// Helmut — BETREIBER-WERKZEUG der 495er-Testkohorte (Plan und Trockenlauf).
// =============================================================================
// Dieses Skript FÜHRT NICHTS AUS. Es druckt Pläne, Befunde und das rein lesende
// SQL, mit dem Grundlinie und Bestand erhoben werden. Es verbindet sich weder
// mit einer Datenbank noch mit dem Netz — die Zahlen kommen als Dateien herein.
//
// Aufruf (immer über scripts/lokal.js):
//
//   node scripts/lokal.js -- node scripts/testkohorte-495.js sql
//   node scripts/lokal.js -- node scripts/testkohorte-495.js plan       --grundlinie=g.json --bestand=b.json
//   node scripts/lokal.js -- node scripts/testkohorte-495.js isolation  --grundlinie=g.json --bestand=b.json
//   node scripts/lokal.js -- node scripts/testkohorte-495.js aktivierung --gruppe=a --grundlinie=g.json --bestand=b.json
//   node scripts/lokal.js -- node scripts/testkohorte-495.js deaktivierung --grundlinie=g.json --bestand=b.json
//   node scripts/lokal.js -- node scripts/testkohorte-495.js rueckbau   --grundlinie=g.json --bestand=b.json
//   node scripts/lokal.js -- node scripts/testkohorte-495.js freigaben
//
// Der scharfe Lauf ist BEWUSST NICHT IMPLEMENTIERT. Er wäre eine
// Production-Datenänderung und damit nach CLAUDE.md §5 freigabepflichtig; das
// Werkzeug bleibt bis zu dieser gesonderten Freigabe rein planend.

const fs = require("fs");
const K = require("../lib/helmut/testkohorte-betrieb");
const { PRAEFIX } = require("../lib/helmut/test-kohorte-500");

const WERKZEUGE = ["sql", "plan", "isolation", "aktivierung", "deaktivierung", "rueckbau", "freigaben"];

// Rein lesendes SQL für Grundlinie und Bestand. Nur Aggregate und die
// Kohortenkennungen — keine Personendaten, keine Vollzeilen, kein SELECT *.
function erhebungsSql() {
  return [
    "-- Helmut · rein lesende Erhebung für die 495er-Testkohorte.",
    "-- NUR SELECT. Keine Zeile wird verändert. Ergebnis als JSON ablegen.",
    "",
    "-- 1 · GRUNDLINIE (vor jeder Provisionierung erheben)",
    "select",
    "  to_char(now() at time zone 'utc','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as \"erhobenUtc\",",
    "  count(*)                                                as \"mandateGesamt\",",
    "  count(*) filter (where aktiv is true)                   as \"mandateAktiv\",",
    "  count(*) filter (where aktiv is not true)               as \"mandateInaktiv\",",
    "  count(*) filter (where geloescht_at is not null)        as \"mandateGeloescht\",",
    "  (select count(*) from profiles)                         as \"identitaetsprofile\",",
    `  count(*) filter (where user_id like '${PRAEFIX}-%')      as "kohortenProfile",`,
    `  count(*) filter (where user_id like '${PRAEFIX}-%' and aktiv is true) as "kohortenProfileAktiv"`,
    "from mandate_profiles;",
    "",
    "-- 2 · BESTAND (vor jedem Schritt neu erheben)",
    "select",
    "  coalesce(",
    "    (select json_agg(json_build_object('id', user_id, 'aktiv', aktiv is true) order by user_id)",
    `     from mandate_profiles where user_id like '${PRAEFIX}-%'), '[]'::json) as "kohorte",`,
    `  (select count(*) from mandate_profiles where user_id not like '${PRAEFIX}-%') as "fremdeGesamt",`,
    `  (select count(*) from mandate_profiles where user_id not like '${PRAEFIX}-%' and aktiv is true) as "fremdeAktiv",`,
    `  (select count(*) from mandate_profiles where user_id not like '${PRAEFIX}-%' and geloescht_at is not null) as "fremdeGeloescht";`,
    ""
  ].join("\n");
}

function liesJson(pfad, name) {
  if (!pfad) {
    throw new Error(`--${name} fehlt: ${name} muss aus einer rein lesenden Vorprüfung kommen (siehe "sql").`);
  }
  let roh;
  try {
    roh = fs.readFileSync(pfad, "utf8");
  } catch (fehler) {
    throw new Error(`--${name} nicht lesbar: ${pfad}`);
  }
  try {
    return JSON.parse(roh);
  } catch (fehler) {
    throw new Error(`--${name} ist kein gültiges JSON: ${pfad}`);
  }
}

function argument(argv, name) {
  const treffer = argv.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : "";
}

function drucke(titel, objekt) {
  console.log(`\n=== ${titel} ===`);
  console.log(JSON.stringify(objekt, null, 2));
}

function main() {
  const argv = process.argv.slice(2);
  const werkzeug = (argv[0] || "").trim();

  if (!WERKZEUGE.includes(werkzeug)) {
    console.error(`Werkzeug fehlt oder ist unbekannt. Erlaubt: ${WERKZEUGE.join(", ")}`);
    process.exit(2);
  }
  if (argv.includes("--scharf")) {
    console.error(
      "Ein scharfer Lauf ist in diesem Werkzeug NICHT implementiert.\n"
      + "Die Provisionierung, Aktivierung und Deaktivierung sind Production-\n"
      + "Datenänderungen und nach CLAUDE.md §5 einzeln freigabepflichtig."
    );
    process.exit(2);
  }

  if (werkzeug === "sql") {
    console.log(erhebungsSql());
    return;
  }
  if (werkzeug === "freigaben") {
    drucke("Freigabe-Mechanik", {
      flag: K.EXECUTE_FLAG,
      bestaetigungsVariable: K.CONFIRM_VARIABLE,
      hinweis: "Beide sind nötig; jeder Schritt hat ein EIGENES Bestätigungswort. "
        + "Ein scharfer Lauf ist in diesem Werkzeug nicht implementiert.",
      worte: K.FREIGABEWORTE
    });
    return;
  }

  const grundlinie = liesJson(argument(argv, "grundlinie"), "grundlinie");
  const bestand = liesJson(argument(argv, "bestand"), "bestand");
  // Die Umgebung wird bewusst LEER übergeben: dieses Werkzeug plant nur, es
  // darf keine vorhandene Freigabe aus der Sitzung aufnehmen.
  const env = {};

  if (werkzeug === "plan") {
    drucke("Provisionierungsplan (Trockenlauf)", K.planeProvisionierung({ grundlinie, bestand, env }));
    return;
  }
  if (werkzeug === "isolation") {
    drucke("Isolationsprüfung", K.pruefeIsolation({ grundlinie, bestand }));
    return;
  }
  if (werkzeug === "aktivierung") {
    const gruppe = argument(argv, "gruppe");
    drucke(`Aktivierungsplan Gruppe ${gruppe.toUpperCase()} (Trockenlauf)`,
      K.planeAktivierung({ grundlinie, bestand, gruppe, env }));
    return;
  }
  if (werkzeug === "deaktivierung") {
    drucke("Deaktivierungsplan (Trockenlauf)", K.planeDeaktivierung({ grundlinie, bestand, env }));
    return;
  }
  drucke("Rückbauprüfung", K.pruefeRueckbau({ grundlinie, bestand }));
}

try {
  main();
} catch (fehler) {
  console.error(`Abbruch: ${(fehler && fehler.message) || fehler}`);
  process.exit(1);
}
