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
const F = require("../lib/helmut/funktionstest-500");
const CRONS = require("../vercel.json").crons;

const WERKZEUGE = ["sql", "plan", "isolation", "aktivierung", "deaktivierung", "rueckbau", "freigaben", "fenster"];

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
    `  count(*) filter (where user_id like '${PRAEFIX}-%' and aktiv is true) as "kohortenProfileAktiv",`,
    `  count(*) filter (where user_id like '${PRAEFIX}-%' and geloescht_at is not null) as "kohortenProfileGeloescht"`,
    "from mandate_profiles;",
    "",
    "-- 2 · BESTAND (vor jedem Schritt neu erheben)",
    "-- Die tatsaechlich hinterlegte Adresse wird MITGELESEN: eine nach der Anlage",
    "-- geaenderte Adresse muss die Isolationspruefung brechen koennen.",
    "select",
    "  coalesce(",
    "    (select json_agg(json_build_object(",
    "       'id', m.user_id, 'aktiv', m.aktiv is true, 'email', coalesce(p.email, ''))",
    "     order by m.user_id)",
    "     from mandate_profiles m left join profiles p on p.id = m.user_id",
    `     where m.user_id like '${PRAEFIX}-%'), '[]'::json) as "kohorte",`,
    `  (select count(*) from mandate_profiles where user_id not like '${PRAEFIX}-%') as "fremdeGesamt",`,
    `  (select count(*) from mandate_profiles where user_id not like '${PRAEFIX}-%' and aktiv is true) as "fremdeAktiv",`,
    `  (select count(*) from mandate_profiles where user_id not like '${PRAEFIX}-%' and geloescht_at is not null) as "fremdeGeloescht",`,
    "  -- IDENTITAETSEBENE (ergaenzt 02.09.): ein Kohortenprofil ist mehr als die",
    "  -- Mandatszeile. Ohne diese Zahlen bestaetigt der Rueckbau eine deaktivierte",
    "  -- Mandatszeile, waehrend Identitaet und Konto weiter bestehen.",
    "  (select count(*) from profiles) as \"identitaetenGesamt\",",
    `  (select count(*) from profiles where id like '${PRAEFIX}-%') as "kohortenIdentitaeten",`,
    "  -- KONTOEBENE: Konten liegen NICHT relational, sondern im Auth-Blob",
    "  -- (helmut_store, Zeile 'main-auth', Schluessel data->users). Gezaehlt werden",
    "  -- die Konten der Kohorte, die sich noch anmelden koennten (active != false).",
    "  coalesce((",
    "    select count(*) from helmut_store hs,",
    "         jsonb_array_elements(coalesce(hs.data->'users','[]'::jsonb)) u",
    "    where hs.id = 'main-auth'",
    `      and (u->>'politicianId') like '${PRAEFIX}-%'`,
    "      and coalesce((u->>'active')::boolean, true) is true",
    "  ), 0) as \"kohortenKontenAktiv\",",
    "  to_char(now() at time zone 'utc','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as \"erhobenUtc\";",
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
  if (werkzeug === "fenster") {
    // Rein rechnerisch aus den 13 Bestandscrons in `vercel.json` und deren
    // maxDuration (300 s). Ändert nichts, ruft nichts auf, liest kein Netz.
    const dauer = Number(argument(argv, "dauer") || 60);
    drucke("Sichere Startfenster (UTC)", F.sichereStartfenster({
      crons: CRONS,
      mindestDauerMinuten: Number.isFinite(dauer) && dauer > 0 ? Math.floor(dauer) : 60
    }));
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
    // Das Startfenster wird IMMER mitgeprüft — auch im Trockenlauf. Ohne
    // `--start=HH:MM` und `--dauer=<minuten>` gibt es keinen Fensterbefund, und
    // ein fehlender Befund gilt nie als „frei" (fail closed, siehe
    // testkohorte-betrieb.planeAktivierung).
    const start = argument(argv, "start");
    const dauer = argument(argv, "dauer");
    const startfensterBefund = start && dauer
      ? F.pruefeStartfenster({
        startUtc: `2026-01-01T${start}:00Z`,
        dauerMinuten: Number(dauer),
        crons: CRONS
      })
      : null;
    drucke(`Aktivierungsplan Gruppe ${gruppe.toUpperCase()} (Trockenlauf)`,
      K.planeAktivierung({ grundlinie, bestand, gruppe, env, startfensterBefund }));
    if (!startfensterBefund) {
      console.log("\nHINWEIS: ohne --start=HH:MM (UTC) und --dauer=<minuten> bleibt der Plan "
        + "blockiert. `node scripts/testkohorte-495.js fenster` nennt die sicheren Fenster.");
    }
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
