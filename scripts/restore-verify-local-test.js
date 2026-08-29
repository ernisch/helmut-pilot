"use strict";

// Offline-Tests fuer scripts/restore-verify-local.js (OP-01 Rueckweg-Beweis).
// Kein Netz, keine echte PostgreSQL — getestet werden die Schutzregeln
// (Production-Verweigerung, Freigabepflicht, Integritaet) und die reinen
// Vergleichsfunktionen, jeweils inklusive Negativ-/Mutationsproben: jede
// Schutzregel wird einmal verletzt und MUSS dann rot werden.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const rv = require("./restore-verify-local.js");
const { TABLES } = require("./backup-export.js");
const { RESTORE_ORDER } = require("./restore-drill.js");
const {
  NICHT_PRODUKTIV,
  pruefeInventar,
  pruefeProduktionsMigrationsmanifest,
  parseJsonVerlustfrei,
  berechneKanonischePruefsumme
} = require("./backup-table-inventory.js");

let ok = 0;
let fail = 0;
function check(name, bedingung, detail) {
  if (bedingung) { ok++; console.log(`OK    ${name}`); }
  else { fail++; console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// Fixture: minimales, in sich stimmiges Voll-Backup in einem Temp-Verzeichnis.
function baueFixtureBackup(ueberschreibe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rv-fixture-"));
  const tabellen = { profiles: [{ id: "t1", name: "A" }, { id: "t2", name: "B" }], briefings: [{ id: "b1", user_id: "t1" }] };
  const manifest = {
    art: "voll", erstellt: "2026-07-28T00:00:00.000Z", quelle: "quelleref",
    tabellen: {}, pruefsummen: {}, fehler: [], vollstaendig: true,
    konsistenz: {
      art: "transaktionaler-snapshot", transaktional: true,
      schreibstoppBestaetigt: false, quersummenBestaetigt: false,
      vollRueckwegBelegt: true
    }
  };
  for (const [t, zeilen] of Object.entries(tabellen)) {
    const json = JSON.stringify(zeilen);
    fs.writeFileSync(path.join(dir, `${t}.json`), json);
    manifest.tabellen[t] = zeilen.length;
    manifest.pruefsummen[t] = sha256(json);
  }
  Object.assign(manifest, ueberschreibe || {});
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return { dir, manifest };
}

// ── 1 · Zielpruefung: Production ist konstruktionsbedingt unerreichbar ──────
{
  const { manifest } = baueFixtureBackup();
  const env = { SUPABASE_URL: "https://prodref.supabase.co" };
  const basis = { host: "127.0.0.1", dbName: "helmut_drill_x", bestaetigt: true, manifest, env };

  check("1 · lokales Ziel mit Freigabe wird akzeptiert", rv.pruefeZiel(basis).ok);
  check("1 · Unix-Socket-Ziel wird akzeptiert", rv.pruefeZiel({ ...basis, host: "/var/run/postgresql" }).ok);
  check("1 · fehlende Freigabe -> harter Abbruch", !rv.pruefeZiel({ ...basis, bestaetigt: false }).ok);
  check("1 · Remote-Host -> verweigert", !rv.pruefeZiel({ ...basis, host: "db.example.com" }).ok);
  check("1 · Production-Host aus SUPABASE_URL -> verweigert", !rv.pruefeZiel({ ...basis, host: "prodref.supabase.co" }).ok);
  check("1 · jeder supabase-Host -> verweigert (auch Testprojekte sind kein lokales Ziel)",
    !rv.pruefeZiel({ ...basis, host: "anderes.supabase.co" }).ok);
  check("1 · Projektkennung im DB-Namen -> verweigert", !rv.pruefeZiel({ ...basis, dbName: "prodref_kopie" }).ok);
  check("1 · localhost-Schreibweisen bleiben lokal (::1)", rv.pruefeZiel({ ...basis, host: "::1" }).ok);
}

// ── 2 · Manifest-Schranken: Teil-/Defekt-Backups beweisen nichts ────────────
{
  const { manifest } = baueFixtureBackup();
  const basis = { host: "127.0.0.1", dbName: "d", bestaetigt: true, env: {} };
  check("2 · vollstaendig:false -> verweigert (ungueltiges Teilbackup nie als vollstaendig behandeln)",
    !rv.pruefeZiel({ ...basis, manifest: { ...manifest, vollstaendig: false } }).ok);
  check("2 · art:pre-seed -> verweigert (Voll-Beweis braucht Voll-Backup)",
    !rv.pruefeZiel({ ...basis, manifest: { ...manifest, art: "pre-seed" } }).ok);
  check("2 · fehlende quelle -> verweigert (Herkunft unklar)",
    !rv.pruefeZiel({ ...basis, manifest: { ...manifest, quelle: undefined } }).ok);
  check("2 · fehlendes Manifest -> verweigert", !rv.pruefeZiel({ ...basis, manifest: null }).ok);
  check("2 · sequenzieller REST-Export ohne Snapshot/Schreibstoppbeleg -> Voll-Rueckweg verweigert",
    !rv.pruefeZiel({
      ...basis,
      manifest: { ...manifest, konsistenz: { ...manifest.konsistenz, transaktional: false, vollRueckwegBelegt: false } }
    }).ok);
}

// ── 3 · Dateiintegritaet: Manipulation und Fehlen fallen auf ────────────────
{
  const { dir, manifest } = baueFixtureBackup();
  check("3 · unverfaelschtes Backup besteht die Integritaetspruefung",
    rv.pruefeDateiPruefsummen(dir, manifest).length === 0);

  fs.appendFileSync(path.join(dir, "profiles.json"), " ");
  const manipuliert = rv.pruefeDateiPruefsummen(dir, manifest);
  check("3 · manipulierte Datei faellt bei der Pruefsumme durch",
    manipuliert.length === 1 && manipuliert[0].tabelle === "profiles");

  fs.unlinkSync(path.join(dir, "briefings.json"));
  const fehlend = rv.pruefeDateiPruefsummen(dir, manifest);
  check("3 · fehlende Tabelle wird erkannt", fehlend.some((f) => f.tabelle === "briefings" && /fehlt/.test(f.fehler)));

  const ohnePruefsumme = { ...manifest, pruefsummen: {} };
  check("3 · Datei ohne Manifest-Pruefsumme gilt nicht als geprueft",
    rv.pruefeDateiPruefsummen(dir, ohnePruefsumme).length >= 1);
}

// ── 4 · PK-Digest: Mengenvergleich erkennt jede Abweichung ──────────────────
{
  const zeilen = [];
  for (let i = 0; i < 2500; i++) zeilen.push({ id: `ko-${String(i).padStart(5, "0")}`, wert: i });
  const digest = rv.pkDigestAusZeilen(zeilen, ["id"]);
  check("4 · Digest ueber 2500 Zeilen ist deterministisch (Seitengrenzen von 1000 spielen keine Rolle)",
    digest === rv.pkDigestAusZeilen(zeilen.slice().reverse(), ["id"]));
  const ohneEine = zeilen.slice(0, 2499);
  check("4 · abweichende Datensatzanzahl aendert den Digest", digest !== rv.pkDigestAusZeilen(ohneEine, ["id"]));
  const andereId = zeilen.map((z, i) => (i === 1234 ? { ...z, id: "ko-ANDERS" } : z));
  check("4 · eine veraenderte kanonische ID aendert den Digest", digest !== rv.pkDigestAusZeilen(andereId, ["id"]));
  const mehrspaltig = rv.pkDigestAusZeilen([{ a: "x", b: "y" }], ["a", "b"]);
  check("4 · mehrspaltiger PK: Trennzeichen verhindert Kollision ('x','y') vs ('xy','')",
    mehrspaltig !== rv.pkDigestAusZeilen([{ a: "xy", b: "" }], ["a", "b"]));
  check("4 · Byte-Sortierung entspricht COLLATE C (Grossbuchstaben vor Kleinbuchstaben)",
    JSON.stringify(rv.sortiereBytes(["b", "A", "a", "B"])) === JSON.stringify(["A", "B", "a", "b"]));
  const ganzeZeilen = [
    { id: "b", wert: "zweiter" },
    { id: "a", wert: "erster" }
  ];
  const feldDigest = rv.feldDigestAusZeilen(ganzeZeilen, ["id"]);
  check("4 · All-row-Digest ist unabhaengig von der gelieferten Zeilenreihenfolge",
    feldDigest === rv.feldDigestAusZeilen(ganzeZeilen.slice().reverse(), ["id"]));
  check("4 · All-row-Digest wird bei geaendertem Nicht-PK-Feld rot",
    feldDigest !== rv.feldDigestAusZeilen([
      ganzeZeilen[0], { ...ganzeZeilen[1], wert: "manipuliert" }
    ], ["id"]));
  check("4 · All-row-Digest legt numerisch aussehende TEXT-Werte nicht zusammen",
    rv.feldDigestAusZeilen([{ id: "1", wert: "001.2300e2" }], ["id"])
      !== rv.feldDigestAusZeilen([{ id: "1", wert: "123" }], ["id"]));
  const zeitA = [{ id: "1", wert: "2026-07-28T10:00:00+02:00" }];
  const zeitB = [{ id: "1", wert: "2026-07-28T08:00:00Z" }];
  check("4 · All-row-Digest normalisiert Zeitdarstellung nur mit belegtem Timestamp-Typ",
    rv.feldDigestAusZeilen(zeitA, ["id"]) !== rv.feldDigestAusZeilen(zeitB, ["id"])
      && rv.feldDigestAusZeilen(zeitA, ["id"], { wert: "timestamp with time zone" })
        === rv.feldDigestAusZeilen(zeitB, ["id"], { wert: "timestamp with time zone" }));
  const vectorA = [{ id: "1", wert: "[0.10,0.2]" }];
  const vectorB = [{ id: "1", wert: "[0.1,0.20]" }];
  check("4 · All-row-Digest normalisiert Vektordarstellung nur mit belegtem vector-Typ",
    rv.feldDigestAusZeilen(vectorA, ["id"]) !== rv.feldDigestAusZeilen(vectorB, ["id"])
      && rv.feldDigestAusZeilen(vectorA, ["id"], { wert: "vector(2)" })
        === rv.feldDigestAusZeilen(vectorB, ["id"], { wert: "vector(2)" }));
}

// ── 5 · Feldvergleich: normalisiert, aber streng ────────────────────────────
{
  const a = {
    id: "k1", created_at: "2026-07-28T09:03:49.5+00:00", conf: { b: 1, a: 2 },
    embedding: "[0.10,0.2]", anzahl: 5
  };
  const b = {
    id: "k1", created_at: "2026-07-28 09:03:49.500+00", conf: { a: 2, b: 1 },
    embedding: "[0.1,0.2]", anzahl: 5
  };
  const typen = { created_at: "timestamp with time zone", embedding: "vector(256)" };
  check("5 · Format-Unterschiede ohne Datenaenderung gelten als gleich (Timestamp/Key-Reihenfolge/Vector)",
    rv.vergleicheZeile(a, b, typen).length === 0);
  const c = { ...b, anzahl: 6 };
  const diff = rv.vergleicheZeile(a, c, typen);
  check("5 · abweichender kritischer Datensatz wird erkannt", diff.length === 1 && diff[0].spalte === "anzahl");
  check("5 · Abweichungsbericht traegt NUR Spaltenname + Wert-Digests, nie Feldwerte (PII-Schutz)",
    JSON.stringify(Object.keys(diff[0]).sort()) === JSON.stringify(["erwartetDigest", "spalte", "tatsaechlichDigest"])
    && /^[0-9a-f]{12}$/.test(diff[0].erwartetDigest) && /^[0-9a-f]{12}$/.test(diff[0].tatsaechlichDigest));
  const fehltSpalte = { ...b };
  delete fehltSpalte.conf;
  check("5 · verlorene Spalte (Sprint-19–21-Feld-Muster) wird erkannt",
    rv.vergleicheZeile(a, fehltSpalte, typen).some((x) => x.spalte === "conf"));
  check("5 · null vs Wert ist eine Abweichung", rv.vergleicheZeile({ x: null }, { x: 0 }).length === 1);
  check("5 · Zeitzonen-identische Zeitpunkte gelten als gleich",
    rv.vergleicheZeile(
      { t: "2026-07-28T10:00:00+02:00" },
      { t: "2026-07-28T08:00:00+00:00" },
      { t: "timestamp with time zone" }
    ).length === 0);
  check("5 · unterschiedliche Postgres-Mikrosekunden bleiben feldgenau unterscheidbar",
    rv.vergleicheZeile(
      { t: "2026-07-28T08:00:00.000001Z" },
      { t: "2026-07-28T08:00:00.000999Z" },
      { t: "timestamp with time zone" }
    ).length === 1);
  check("5 · bigint-Zahlstrings oberhalb Number.MAX_SAFE_INTEGER kollidieren nicht",
    rv.vergleicheZeile({ x: "9007199254740992" }, { x: "9007199254740993" }).length === 1);
  check("5 · hochpraezise Decimal-Zahlstrings kollidieren nicht",
    rv.vergleicheZeile({ x: "0.123456789012345678901" }, { x: "0.123456789012345678902" }).length === 1);
  check("5 · numerisch aussehende echte Textwerte bleiben texttreu verschieden",
    rv.vergleicheZeile({ x: "001.2300e2" }, { x: "123" }).length === 1);
  check("5 · timestamp-artige echte Textwerte werden ohne belegten Spaltentyp nicht zusammengelegt",
    rv.vergleicheZeile(
      { x: "2026-07-28T10:00:00+02:00" }, { x: "2026-07-28T08:00:00Z" }
    ).length === 1);
  check("5 · vector-artige echte Textwerte werden ohne belegten Spaltentyp nicht zusammengelegt",
    rv.vergleicheZeile({ x: "[0.10,0.2]" }, { x: "[0.1,0.20]" }).length === 1);
  const semantischGleicheZahlen = parseJsonVerlustfrei('[{"x":1.2300e2},{"x":123}]');
  check("5 · rohe JSON-Zahlmarker duerfen semantisch normalisiert werden",
    rv.vergleicheZeile(semantischGleicheZahlen[0], semantischGleicheZahlen[1]).length === 0);
  const verlustfreieZahlen = parseJsonVerlustfrei(
    '[{"id":9007199254740992,"x":0.123456789012345678901},{"id":9007199254740993,"x":0.123456789012345678902}]'
  );
  check("5 · rohe JSON-bigint/numeric-Tokens bleiben auch im Restore-Digest unterscheidbar",
    rv.pkTextZeile(verlustfreieZahlen[0], ["id"]) !== rv.pkTextZeile(verlustfreieZahlen[1], ["id"])
      && rv.vergleicheZeile(verlustfreieZahlen[0], verlustfreieZahlen[1]).length === 2);
}

// ── 6 · Stichproben deterministisch, Mehrfachlauf kollisionsfrei ────────────
{
  const s1 = rv.waehleStichprobenIndizes(1000, 9);
  check("6 · Stichproben sind deterministisch und decken Anfang/Ende ab",
    JSON.stringify(s1) === JSON.stringify(rv.waehleStichprobenIndizes(1000, 9)) && s1[0] === 0 && s1[s1.length - 1] === 999);
  check("6 · kleine Tabellen: alle Zeilen werden geprueft",
    JSON.stringify(rv.waehleStichprobenIndizes(3, 9)) === JSON.stringify([0, 1, 2]));
  check("6 · leere Tabelle: keine Stichproben, kein Fehler", rv.waehleStichprobenIndizes(0, 9).length === 0);
  const k1 = rv.baueLaufKennung("2026-07-28T10:00:00.000Z");
  const k2 = rv.baueLaufKennung("2026-07-28T10:00:00.001Z");
  check("6 · Mehrfachlauf: unterschiedliche Laufkennungen -> eigenes Protokollverzeichnis, nichts wird ueberschrieben", k1 !== k2 && !k1.includes(":"));
}

// ── 7 · Secrets erreichen weder Log noch Protokoll ──────────────────────────
{
  const env = { SUPABASE_SERVICE_ROLE_KEY: "sk-test-1234567890abcdef" };
  check("7 · unkritischer Text passiert die Secret-Schranke", rv.ohneSecrets("42 Tabellen ok", env) === "42 Tabellen ok");
  let geworfen = false;
  try { rv.ohneSecrets("key=sk-test-1234567890abcdef", env); } catch (_) { geworfen = true; }
  check("7 · Ausgabe mit Service-Key-Wert wird hart verweigert", geworfen);
  let geworfen2 = false;
  try { rv.ohneSecrets("PGPASSWORD=drill-geheim-123", { PGPASSWORD: "drill-geheim-123" }); } catch (_) { geworfen2 = true; }
  check("7 · auch lokale Passwoerter gelangen nie in Ausgaben", geworfen2);
  const psqlMeldung = rv.psqlFehlermeldung("select 'PII-SENTINEL-geheim'", false, 1);
  check("7 · psql-Fehlermeldung unterdrueckt SQL/stderr mit moeglichen Zeilenwerten",
    !psqlMeldung.includes("PII-SENTINEL") && /stderr.*unterdrueckt/.test(psqlMeldung));

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "rv-staging-"));
  const staging = path.join(stagingDir, "_stage_profiles.txt");
  fs.writeFileSync(staging, "PII-SENTINEL-geheim");
  const cleanupRot = rv.entferneSensibleDateien([staging], {
    existsSync: fs.existsSync,
    unlinkSync: () => { throw new Error("simulierter unlink-Fehler"); }
  });
  check("7 · nicht loeschbare PII-Stagingdatei wird fail closed gemeldet",
    cleanupRot.length === 1 && fs.existsSync(staging));
  check("7 · erfolgreiche Cleanup-Probe entfernt die Stagingdatei wirklich",
    rv.entferneSensibleDateien([staging]).length === 0 && !fs.existsSync(staging));
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

// ── 8 · COPY-Escaping transportiert JSON byte-treu ──────────────────────────
{
  check("8 · Backslashes werden fuer COPY verdoppelt",
    rv.escapeCopyZeile('{"a":"x\\ny"}') === '{"a":"x\\\\ny"}');
  check("8 · Zeile ohne Backslash bleibt unveraendert", rv.escapeCopyZeile('{"a":1}') === '{"a":1}');
  check("8 · SQL-Literal verdoppelt Hochkommata", rv.sqlLiteral("O'Brien") === "'O''Brien'");
  const katalog = rv.baueSpaltenKatalogAusKatalogzeilen([{
    tabelle: "gate_shadow_events", spalte: "id", typ: "bigint", nullable: false,
    identity: "a", generated: "", defaultAusdruck: "nextval('gate_shadow_events_id_seq'::regclass)",
    primaerschluesselPosition: 1
  }]);
  check("8 · lokaler pg_catalog-Abzug wird in den gehashten Spaltenvertrag ueberfuehrt",
    katalog.gate_shadow_events[0].identity === "a"
      && katalog.gate_shadow_events[0].primaerschluesselPosition === 1
      && /^[0-9a-f]{64}$/.test(katalog.gate_shadow_events[0].defaultDigest));
  check("8 · Katalog-SQL erhebt alle verpflichtenden Struktureigenschaften",
    ["format_type", "attnotnull", "attidentity", "attgenerated", "pg_get_expr", "indisprimary"]
      .every((begriff) => rv.SPALTEN_KATALOG_SQL.includes(begriff)));
  const versionsReferenz = { postgresVersion: "17.6", pgvectorVersion: "0.8.0" };
  check("8 · echter lokaler Versionsbeleg passt exakt zu Production PostgreSQL 17.6 / pgvector 0.8.0",
    rv.pruefeLokaleDatenbankVersion(JSON.stringify({
      postgresVersionNum: "170006", pgvectorVersion: "0.8.0"
    }), versionsReferenz).ok);
  check("8 · bloss behauptetes PostgreSQL 17.5 bleibt gegen den Production-Vertrag rot",
    !rv.pruefeLokaleDatenbankVersion({
      postgresVersionNum: "170005", pgvectorVersion: "0.8.0"
    }, versionsReferenz).ok);
  check("8 · bloss behauptetes pgvector 0.7.4 bleibt gegen den Production-Vertrag rot",
    !rv.pruefeLokaleDatenbankVersion({
      postgresVersionNum: "170006", pgvectorVersion: "0.7.4"
    }, versionsReferenz).ok);
  check("8 · Versionsbeleg mit zusaetzlichem selbst gesetztem Gruen-Feld wird fail closed abgewiesen",
    !rv.pruefeLokaleDatenbankVersion({
      postgresVersionNum: "170006", pgvectorVersion: "0.8.0", gruen: true
    }, versionsReferenz).ok);
  check("8 · Versions-SQL bindet Server und installierte vector-Extension an pg_catalog",
    rv.DATENBANK_VERSION_SQL.includes("server_version_num")
      && rv.DATENBANK_VERSION_SQL.includes("pg_catalog.pg_extension")
      && rv.DATENBANK_VERSION_SQL.includes("extname = 'vector'"));
}

// ── 9 · Deckung: Migrationen, Export und Restore-Reihenfolge stimmen ────────
{
  const referenz = JSON.parse(fs.readFileSync(rv.STRUKTUR_REFERENZ_PFAD, "utf8"));
  const exportTabellen = Object.keys(TABLES).sort();
  const refTabellen = referenz.tabellen.slice().sort();
  const inventar = pruefeInventar(path.join(__dirname, ".."));
  const elfNeue = [
    "knowledge_object_embeddings", "matching_runs", "llm_reservations", "helmut_jobs",
    "helmut_job_outbox", "helmut_klassen_anker", "helmut_klassen_slots",
    "helmut_anbieter_fenster", "helmut_anbieter_schutzschalter",
    "helmut_verstehen_reservierungen", "helmut_verstehen_vormerkungen"
  ];
  check("9 · migrationsbasierter Inventarriegel deckt 51 produktive Tabellen und genau eine Ausnahme",
    inventar.ok && exportTabellen.length === 51
      && Object.keys(NICHT_PRODUKTIV).length === 1 && !!NICHT_PRODUKTIV.crawl_runs,
    inventar.fehler.join(" | "));
  check("9 · aktuell erhobener 51er Production-Katalog ist exakt deckungsgleich mit dem Export",
    JSON.stringify(refTabellen) === JSON.stringify(exportTabellen)
      && referenz.katalogBeleg.publicTabellen === 51
      && referenz.katalogBeleg.rlsNichtAktiv.length === 0);
  check("9 · expliziter Production-Migrationsvertrag = 35 History-Eintraege, 31 Repo-Dateien, exakt crawl_runs/F9 offen (Z22 seit 29.08. angewendet)",
    inventar.production.ok
      && inventar.production.manifest.productionHistory.length === 35
      && inventar.production.angewendet.length === 31
      && JSON.stringify(inventar.production.nichtAngewendet) === JSON.stringify([
        "20260720_crawl_runs_relational.sql",
        "20260825101500_jobqueue_ankunftskennzahl.sql"
      ]));
  check("9 · RESTORE_ORDER deckt alle Export-Tabellen",
    exportTabellen.every((t) => RESTORE_ORDER.includes(t)) && RESTORE_ORDER.length === exportTabellen.length,
    exportTabellen.filter((t) => !RESTORE_ORDER.includes(t)).join(","));
  check("9 · alle elf seit der 40er Referenz produktiv gewordenen Tabellen sind Teil des Voll-Backups",
    elfNeue.every((t) => !!TABLES[t]));
  check("9 · alle elf neuen Betriebstabellen haben feldgenaue Stichproben statt nur Count/PK",
    elfNeue.every((t) => rv.KRITISCHE_TABELLEN.includes(t)));
  check("9 · KO wird vor einer legitim hoeher gefenceten aktiven Reservierung restauriert",
    RESTORE_ORDER.indexOf("knowledge_objects") < RESTORE_ORDER.indexOf("helmut_verstehen_reservierungen"));
  check("9 · lokaler Restore markiert nur knowledge_objects transaktionslokal als geprueften CAS-Weg",
    /set_config\('helmut\.verstehen_cas', 'geprueft', true\)/.test(rv.casRestoreVorbereitung("knowledge_objects"))
      && !/set_config/.test(rv.casRestoreVorbereitung("helmut_jobs")));
  check("9 · kritische Tabellen fuer Stichproben existieren im Export",
    rv.KRITISCHE_TABELLEN.every((t) => TABLES[t]));
  check("9 · Tenant-Probe-Tabellen tragen laut Referenz eine tenant_isolation-Policy",
    rv.TENANT_PROBE_TABELLEN.every((t) => referenz.policies.includes(`${t}:tenant_isolation`)));
  check("9 · Strukturreferenz enthaelt keine personenbezogenen Inhalte (nur Objektnamen)",
    !JSON.stringify(referenz).match(/@|http|eyJ/));
  check("9 · aktueller 51er Katalog ist nicht faelschlich spaltengenau gruen: historischer Drift sperrt exakten Restore-Beweis",
    !rv.pruefeSpaltengenauenProduktionsbeleg(referenz).ok);
  const nurStatusUmgeschrieben = JSON.parse(JSON.stringify(referenz));
  nurStatusUmgeschrieben.schemaDrift._status = "aktuell und vollstaendig bestaetigt";
  check("9 · Gegenbeispiel: blosses Umschreiben des freien Drift-Statustexts entsperrt keinen Restore",
    !rv.pruefeSpaltengenauenProduktionsbeleg(nurStatusUmgeschrieben).ok);

  const mutiereReferenz = (mutation) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rv-migrationsmanifest-"));
    const tempPfad = path.join(tempDir, "referenz.json");
    const kopie = JSON.parse(JSON.stringify(referenz));
    mutation(kopie);
    fs.writeFileSync(tempPfad, JSON.stringify(kopie));
    const ergebnis = pruefeProduktionsMigrationsmanifest(path.join(__dirname, ".."), tempPfad);
    fs.rmSync(tempDir, { recursive: true, force: true });
    return ergebnis;
  };
  const fakeSpaltenTabellen = Object.fromEntries(referenz.tabellen.map((tabelle) => [tabelle, [{
    spalte: "fake", typ: "text", nullable: true, identity: "", generated: "",
    defaultDigest: null, primaerschluesselPosition: null
  }]]));
  const fakeSpaltenKatalog = {
    vertrag: 1,
    quelle: "rein-lesender-production-katalog",
    erhoben: referenz.erhoben,
    tabellen: fakeSpaltenTabellen,
    pruefsumme: berechneKanonischePruefsumme(fakeSpaltenTabellen)
  };
  const fakeSpaltenReferenz = JSON.parse(JSON.stringify(referenz));
  fakeSpaltenReferenz.spaltenKatalog = fakeSpaltenKatalog;
  const fakeSpaltenManifest = mutiereReferenz((r) => { r.spaltenKatalog = fakeSpaltenKatalog; });
  check("9 · selbst gehashter 51er Fake-Spaltenkatalog kann den fehlenden Production-Beleg nicht entsperren",
    !rv.pruefeSpaltengenauenProduktionsbeleg(fakeSpaltenReferenz).ok
      && !fakeSpaltenManifest.ok
      && fakeSpaltenManifest.fehler.some((f) => /kein Production-Spaltenkatalog-Digest ist fest verankert/.test(f)));
  const umgeordnet = mutiereReferenz((r) => {
    [r.migrationsmanifest.repoStrukturMigrationen[0], r.migrationsmanifest.repoStrukturMigrationen[1]] =
      [r.migrationsmanifest.repoStrukturMigrationen[1], r.migrationsmanifest.repoStrukturMigrationen[0]];
  });
  check("9 · Gegenbeispiel: umsortierte angewendete Migrationen werden trotz gleicher Dateihashes rot",
    !umgeordnet.ok && umgeordnet.fehler.some((f) => /reihenfolge/i.test(f)));
  const f9Falsch = mutiereReferenz((r) => {
    const f9 = r.migrationsmanifest.nichtAngewendet.splice(1, 1)[0];
    r.migrationsmanifest.repoStrukturMigrationen.push(f9);
    r.migrationsmanifest.repoStrukturMigrationen.sort();
  });
  check("9 · Gegenbeispiel: F9 darf nicht als Production-angewendet etikettiert werden",
    !f9Falsch.ok && f9Falsch.fehler.some((f) => /2-Dateien|crawl_runs\/F9|31-Dateien/.test(f)));
  const historyManipuliert = mutiereReferenz((r) => { r.migrationsmanifest.productionHistory[0][1] = "manipuliert"; });
  check("9 · Gegenbeispiel: manipulierte Production-History verletzt ihre Pruefsumme",
    !historyManipuliert.ok && historyManipuliert.fehler.some((f) => /historyPruefsumme/.test(f)));
  const sqlHashManipuliert = mutiereReferenz((r) => { r.migrationsmanifest.repoSqlPruefsumme = "0".repeat(64); });
  check("9 · Gegenbeispiel: falscher Hash der 29 SQL-Dateien wird rot",
    !sqlHashManipuliert.ok && sqlHashManipuliert.fehler.some((f) => /repoSqlPruefsumme/.test(f)));
  const policyManipuliert = mutiereReferenz((r) => {
    r.policies[0] = "aaaa:erfundene_policy";
    r.policies.sort();
  });
  check("9 · Gegenbeispiel: 24 formal gueltige, aber manipulierte Policy-Namen bleiben rot",
    !policyManipuliert.ok && policyManipuliert.fehler.some((f) => /Katalog-Pruefsumme/.test(f)));
  const triggerManipuliert = mutiereReferenz((r) => {
    r.trigger[0] = "aaaa:erfundener_trigger";
    r.trigger.sort();
  });
  check("9 · Gegenbeispiel: 20 formal gueltige, aber manipulierte Trigger-Namen bleiben rot",
    !triggerManipuliert.ok && triggerManipuliert.fehler.some((f) => /Katalog-Pruefsumme/.test(f)));
  const funktionManipuliert = mutiereReferenz((r) => {
    r.funktionen[0] = "erfundene_funktion";
    r.funktionen.sort();
  });
  check("9 · Gegenbeispiel: 62 formal gueltige, aber manipulierte Funktionsnamen bleiben rot",
    !funktionManipuliert.ok && funktionManipuliert.fehler.some((f) => /Katalog-Pruefsumme/.test(f)));
  const quelleManipuliert = mutiereReferenz((r) => { r.quelle = "aaaaaaaaaaaaaaaaaaaa"; });
  check("9 · Gegenbeispiel: andere formal gueltige 20-stellige Projekt-Ref bleibt rot",
    !quelleManipuliert.ok && quelleManipuliert.fehler.some((f) => /fest verankerten Supabase-Production-Quelle/.test(f)));
}

// ── 10 · Backups bleiben ausserhalb von Git ─────────────────────────────────
{
  const gitignore = fs.readFileSync(path.join(__dirname, "..", ".gitignore"), "utf8");
  check("10 · .gitignore schliesst backups/ aus", /^backups\/$/m.test(gitignore));
}

// ── 11 · Runbook nennt die Freigabeschritte ─────────────────────────────────
{
  const runbook = fs.readFileSync(path.join(__dirname, "..", "docs", "betrieb", "backup-restore-runbook.md"), "utf8");
  check("11 · Runbook: Production-Restore ist ausdruecklich freigabepflichtig",
    /NUR nach Freigabe/i.test(runbook));
  check("11 · Runbook: nennt den isolierten Restore-Weg (restore-verify-local)",
    runbook.includes("restore-verify-local"));
}

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
