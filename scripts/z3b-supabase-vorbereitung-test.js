"use strict";

// Rein lokaler Vertragstest. Kein Netz, keine Datenbank, kein Secret.

const fs = require("fs");
const path = require("path");
const {
  PRODUCTION_PROJECT_REF,
  TEST_PROJECT_REF,
  TEST_PROJECT_URL,
  STRATEGISCHE_ZIELSTUFEN,
  MESSSTUFEN,
  NEUE_MESSSTUFEN,
  MIGRATIONSGRUPPEN,
  Z3A_REFERENZEN,
  GEMEINSAME_PROBEGRENZEN,
  PROBEPROFILE,
  SYNTHETISCHE_AUFTRAEGE_MAX,
  probeprofilFuerMandate,
  pruefeTestprojekt,
  erzeugeSynthetischeAuftraege
} = require("./fixtures/z3b-supabase-plan");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function wirft(fn, muster) {
  try {
    fn();
    return false;
  } catch (fehler) {
    return muster.test(String(fehler && fehler.message));
  }
}

console.log("Helmut — lokale Vorbereitung des isolierten Supabase Nachweises Z3b");

check("Test und Production haben verschiedene Projektkennungen",
  TEST_PROJECT_REF !== PRODUCTION_PROJECT_REF);
check("Nur die festgelegte Test URL wird angenommen",
  pruefeTestprojekt({ projektRef: TEST_PROJECT_REF, url: TEST_PROJECT_URL }).projektRef === TEST_PROJECT_REF);
check("Production wird mit Kennung abgelehnt",
  wirft(() => pruefeTestprojekt({ projektRef: PRODUCTION_PROJECT_REF, url: TEST_PROJECT_URL }), /Production|Testprojekt/));
check("Production wird mit URL abgelehnt",
  wirft(() => pruefeTestprojekt({
    projektRef: TEST_PROJECT_REF,
    url: `https://${PRODUCTION_PROJECT_REF}.supabase.co`
  }), /Production/));
check("Ein beliebiges anderes Supabase Projekt wird abgelehnt",
  wirft(() => pruefeTestprojekt({
    projektRef: "abcdefghijklmnopqrst",
    url: "https://abcdefghijklmnopqrst.supabase.co"
  }), /Testprojekt/));
check("URL Pfade, Parameter und Zugangsdaten werden abgelehnt",
  [
    `${TEST_PROJECT_URL}/rest/v1`,
    `${TEST_PROJECT_URL}?x=1`,
    `https://name:wort@${TEST_PROJECT_REF}.supabase.co`
  ].every((url) => wirft(() => pruefeTestprojekt({ projektRef: TEST_PROJECT_REF, url }), /Basis URL/)));

const gruppen = Object.keys(MIGRATIONSGRUPPEN);
const eintraege = gruppen.flatMap((gruppe) => MIGRATIONSGRUPPEN[gruppe]);
const vorwaerts = eintraege.map((eintrag) => eintrag.vorwaerts);
const rueckwege = eintraege.map((eintrag) => eintrag.rueckweg);
const alleDateien = [...vorwaerts, ...rueckwege];

check("Basis, Ankunft und Z22 bleiben getrennte Migrationsgruppen",
  gruppen.join(",") === "basis,ankunft,z22");
check("Alle vorgesehenen Vorwaertsdateien und Rueckwege existieren",
  alleDateien.every((datei) => fs.existsSync(path.join(ROOT, "supabase", "migrations", datei))),
  `${alleDateien.length} Dateien`);
check("Die Warteschlange kommt vor ihren Abhaengigkeiten",
  vorwaerts.indexOf("20260808_scalable_job_queue.sql")
    < vorwaerts.indexOf("20260808_jobqueue_abhaengigkeiten.sql"));
check("F9 ist eine eigene Gruppe",
  MIGRATIONSGRUPPEN.ankunft.length === 1
    && MIGRATIONSGRUPPEN.ankunft[0].vorwaerts === "20260825101500_jobqueue_ankunftskennzahl.sql");
check("Z22 ist eine eigene Gruppe und verwendet die lokal korrigierte Datei",
  MIGRATIONSGRUPPEN.z22.length === 1
    && MIGRATIONSGRUPPEN.z22[0].vorwaerts === "20260826190000_jobqueue_vorbedingung_mandatsfilter.sql"
    && /nullif\(btrim\(p_mandat, E' \\t\\n\\r\\f\\v'\), ''\) is null/.test(fs.readFileSync(
      path.join(ROOT, "supabase", "migrations", MIGRATIONSGRUPPEN.z22[0].vorwaerts), "utf8")));
check("OP03, Rollbacks und Seeds sind nie Vorwaertsmigrationen",
  vorwaerts.every((datei) => datei !== "20260720_crawl_runs_relational.sql"
    && !/rollback/i.test(datei) && !/seed/i.test(datei)));
check("Das Vollschema wird nicht als stiller Fachtest eingebaut",
  !vorwaerts.includes("schema.sql"));

check("Das strategische Ziel endet bei 500 und behaelt alle Aktivierungsstufen",
  STRATEGISCHE_ZIELSTUFEN.join(",") === "10,25,50,100,200,500");
check("Die Messstufen enthalten 200 und 500, aber keinen unkontrollierten Sprung darueber",
  MESSSTUFEN.join(",") === "5,25,50,100,200,500"
    && NEUE_MESSSTUFEN.join(",") === "200,500"
    && Math.max(...MESSSTUFEN) === 500);
check("Der Probeplan bleibt hart auf 32 gleichzeitige Anfragen begrenzt",
  GEMEINSAME_PROBEGRENZEN.parallelitaet.join(",") === "4,8,16,32"
    && Math.max(...GEMEINSAME_PROBEGRENZEN.parallelitaet) === 32);
check("Jede Groessenklasse hat einen eigenen absoluten Riegel",
  PROBEPROFILE.bis100.anfragenGesamtMax === 1000
    && PROBEPROFILE.bis100.synthetischeAuftraegeMax === 250
    && PROBEPROFILE.stufe200.anfragenGesamtMax === 500
    && PROBEPROFILE.stufe200.synthetischeAuftraegeMax === 200
    && PROBEPROFILE.stufe500.anfragenGesamtMax === 1250
    && PROBEPROFILE.stufe500.synthetischeAuftraegeMax === 500
    && SYNTHETISCHE_AUFTRAEGE_MAX === 500);
check("Jede Messstufe gehoert genau zu einem Probeprofil",
  MESSSTUFEN.every((mandate) => probeprofilFuerMandate(mandate)
    && Object.values(PROBEPROFILE).filter((profil) => profil.mandate.includes(mandate)).length === 1));
check("Es gibt keine automatischen Wiederholungen",
  GEMEINSAME_PROBEGRENZEN.wiederholungenMax === 0);
check("Die Referenzen sind nur die bereits belegten Z3a Stufen",
  Z3A_REFERENZEN.map((wert) => wert.mandate).join(",") === "5,25,50,100");
check("Fuer 200 und 500 werden keine erfundenen Z3a Referenzwerte hinterlegt",
  NEUE_MESSSTUFEN.every((mandate) => !Z3A_REFERENZEN.some((wert) => wert.mandate === mandate)));

for (const mandate of MESSSTUFEN) {
  const anzahl = mandate <= 100 ? 250 : mandate;
  const auftraege = erzeugeSynthetischeAuftraege({ mandate, anzahl, laufKennung: "z3bprobe01" });
  check(`${mandate} Mandate: exakt ${anzahl} rein synthetische Auftraege`,
    auftraege.length === anzahl
      && auftraege.every((auftrag) => auftrag.p_tenant_id.startsWith("z3b-synth-mandat-")
        && auftrag.p_idempotency_key.startsWith("z3b:z3bprobe01:")
        && auftrag.p_payload.z3b === true
        && auftrag.p_payload.synthetisch === true));
  check(`${mandate} Mandate: keine doppelte Auftragskennung`,
    new Set(auftraege.map((auftrag) => auftrag.p_idempotency_key)).size === auftraege.length);
  check(`${mandate} Mandate: genau die vorgesehene Zahl kuenstlicher Mandate`,
    new Set(auftraege.map((auftrag) => auftrag.p_tenant_id)).size === mandate);
}

check("Ungueltige Laufkennung wird abgelehnt",
  wirft(() => erzeugeSynthetischeAuftraege({ mandate: 5, anzahl: 5, laufKennung: "ECHT Name" }), /Laufkennung/));
check("Eine nicht geplante Mandatsstufe wird abgelehnt",
  wirft(() => erzeugeSynthetischeAuftraege({ mandate: 300, anzahl: 300, laufKennung: "z3bprobe01" }), /Messstufe/));
check("Weniger Auftraege als Mandate werden abgelehnt",
  wirft(() => erzeugeSynthetischeAuftraege({ mandate: 500, anzahl: 499, laufKennung: "z3bprobe01" }), /Auftragszahl/));
check("Das 200er Paket kann seinen eigenen Riegel nicht ueberschreiten",
  wirft(() => erzeugeSynthetischeAuftraege({ mandate: 200, anzahl: 201, laufKennung: "z3bprobe01" }), /Auftragszahl/));
check("Mehr als 500 Auftraege werden lokal bereits abgelehnt",
  wirft(() => erzeugeSynthetischeAuftraege({ mandate: 500, anzahl: 501, laufKennung: "z3bprobe01" }), /Auftragszahl/));

const planQuelltext = fs.readFileSync(path.join(__dirname, "fixtures", "z3b-supabase-plan.js"), "utf8");
check("Der lokale Plan enthaelt keinen Supabase oder JWT Geheimwert",
  !/sb_secret_|sbp_[a-zA-Z0-9]|eyJ[a-zA-Z0-9_-]{20,}/.test(planQuelltext));

console.log(`\nPASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
