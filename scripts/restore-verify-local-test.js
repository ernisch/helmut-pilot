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
    tabellen: {}, pruefsummen: {}, fehler: [], vollstaendig: true
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
  check("5 · Format-Unterschiede ohne Datenaenderung gelten als gleich (Timestamp/Key-Reihenfolge/Vector)",
    rv.vergleicheZeile(a, b).length === 0);
  const c = { ...b, anzahl: 6 };
  const diff = rv.vergleicheZeile(a, c);
  check("5 · abweichender kritischer Datensatz wird erkannt", diff.length === 1 && diff[0].spalte === "anzahl");
  check("5 · Abweichungsbericht traegt NUR Spaltenname + Wert-Digests, nie Feldwerte (PII-Schutz)",
    JSON.stringify(Object.keys(diff[0]).sort()) === JSON.stringify(["erwartetDigest", "spalte", "tatsaechlichDigest"])
    && /^[0-9a-f]{12}$/.test(diff[0].erwartetDigest) && /^[0-9a-f]{12}$/.test(diff[0].tatsaechlichDigest));
  const fehltSpalte = { ...b };
  delete fehltSpalte.conf;
  check("5 · verlorene Spalte (Sprint-19–21-Feld-Muster) wird erkannt",
    rv.vergleicheZeile(a, fehltSpalte).some((x) => x.spalte === "conf"));
  check("5 · null vs Wert ist eine Abweichung", rv.vergleicheZeile({ x: null }, { x: 0 }).length === 1);
  check("5 · Zeitzonen-identische Zeitpunkte gelten als gleich",
    rv.vergleicheZeile({ t: "2026-07-28T10:00:00+02:00" }, { t: "2026-07-28T08:00:00+00:00" }).length === 0);
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
}

// ── 8 · COPY-Escaping transportiert JSON byte-treu ──────────────────────────
{
  check("8 · Backslashes werden fuer COPY verdoppelt",
    rv.escapeCopyZeile('{"a":"x\\ny"}') === '{"a":"x\\\\ny"}');
  check("8 · Zeile ohne Backslash bleibt unveraendert", rv.escapeCopyZeile('{"a":1}') === '{"a":1}');
  check("8 · SQL-Literal verdoppelt Hochkommata", rv.sqlLiteral("O'Brien") === "'O''Brien'");
}

// ── 9 · Deckung: Export, Restore-Reihenfolge und Strukturreferenz stimmen ───
{
  const referenz = JSON.parse(fs.readFileSync(rv.STRUKTUR_REFERENZ_PFAD, "utf8"));
  const exportTabellen = Object.keys(TABLES).sort();
  const refTabellen = referenz.tabellen.slice().sort();
  check("9 · backup-export deckt ALLE Tabellen der Production-Strukturreferenz (Befund 38/40 geschlossen)",
    JSON.stringify(exportTabellen) === JSON.stringify(refTabellen),
    `nur Export: ${exportTabellen.filter((t) => !refTabellen.includes(t)).join(",") || "—"} · nur Referenz: ${refTabellen.filter((t) => !exportTabellen.includes(t)).join(",") || "—"}`);
  check("9 · RESTORE_ORDER deckt alle Export-Tabellen",
    exportTabellen.every((t) => RESTORE_ORDER.includes(t)),
    exportTabellen.filter((t) => !RESTORE_ORDER.includes(t)).join(","));
  check("9 · source_crawl_telemetry + process_runs sind jetzt Teil des Voll-Backups",
    !!TABLES.source_crawl_telemetry && !!TABLES.process_runs);
  check("9 · kritische Tabellen fuer Stichproben existieren im Export",
    rv.KRITISCHE_TABELLEN.every((t) => TABLES[t]));
  check("9 · Tenant-Probe-Tabellen tragen laut Referenz eine tenant_isolation-Policy",
    rv.TENANT_PROBE_TABELLEN.every((t) => referenz.policies.includes(`${t}:tenant_isolation`)));
  check("9 · Strukturreferenz enthaelt keine personenbezogenen Inhalte (nur Objektnamen)",
    !JSON.stringify(referenz).match(/@|http|eyJ/));
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
