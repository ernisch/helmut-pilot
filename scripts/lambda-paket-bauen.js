"use strict";

// Helmut — REPRODUZIERBARE PAKETIERUNG DER LAMBDA-FUNKTIONEN (Korrekturlauf 2026-08-14/3).
// =============================================================================================
// DAS PROBLEM: Die Infrastrukturdefinition trug einen Platzhalter, der beim ersten Aufruf
// absichtlich scheiterte. Damit war die Funktion nicht ausrollbar — die ganze Kette blieb
// Theorie.
//
// DIESER BAUWEG erzeugt ein vollstaendiges, ladbares Paket:
//   * beide Einstiegspunkte (lambda/index.js = Verbraucher, lambda/relay.js = Relay),
//   * den kompletten Fachkern (lib/helmut/**),
//   * alle Laufzeitabhaengigkeiten aus node_modules (nur die festgelegten AWS-SDKs samt
//     ihrer Transitiven — nichts anderes),
//   * KEINE Secrets, KEINE Dokumente, KEINE Tests, KEINE .env, KEIN .git.
//
// REPRODUZIERBAR: feste Zeitstempel im ZIP, sortierte Dateiliste, feste Kompressionsstufe.
// Zwei Laeufe auf demselben Stand erzeugen byte-gleiche Archive — der SHA-256 ist damit ein
// echter Integritaetsnachweis und kein Zufallswert.
//
// OHNE NEUE ABHAENGIGKEIT: der ZIP-Schreiber benutzt ausschliesslich `zlib` aus der
// Node-Standardbibliothek. Kein externes `zip`-Programm, keine npm-Bibliothek — das Paket
// laesst sich damit ueberall gleich bauen (lokal, CI, Betreiberrechner).
//
// AUFRUF:  node scripts/lambda-paket-bauen.js [--ziel <verzeichnis>] [--kein-zip]
// AUSGABE: <ziel>/helmut-lambda.zip  +  <ziel>/manifest.json  (Dateiliste, Groessen, SHA-256)
//
// Das Archiv wird NICHT ins Repository committet (siehe .gitignore) — Binaerarchive gehoeren
// nicht in die Versionsverwaltung; der Bauweg ist die Quelle der Wahrheit.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

// ── WAS INS PAKET GEHOERT ─────────────────────────────────────────────────────────────────────
const EINSTIEGSPUNKTE = ["lambda/index.js", "lambda/relay.js"];
const FACHKERN_VERZEICHNISSE = ["lib/helmut"];
// Genau die festgelegten Laufzeitabhaengigkeiten (aus package.json dependencies) — ihre
// Transitiven werden aus dem Lockfile-Baum von node_modules mitgenommen.
const ABHAENGIGKEITEN = ["@aws-sdk/client-sqs", "@aws-sdk/client-ssm", "@aws-sdk/client-lambda"];

// ── WAS NIEMALS INS PAKET DARF ────────────────────────────────────────────────────────────────
// Bewusst als MUSTER, nicht als Liste: eine neue Testdatei oder ein neues Dokument darf nicht
// versehentlich mitfliegen.
const VERBOTEN = [
  /(^|\/)\.env/i, /(^|\/)\.git(\/|$)/, /(^|\/)node_modules\/\.bin(\/|$)/,
  /-test\.js$/, /-mutationsprobe\.js$/, /(^|\/)scripts\//, /(^|\/)docs\//,
  /(^|\/)supabase\//, /(^|\/)test(s)?(\/|$)/i, /\.md$/i, /\.map$/, /\.ts$/,
  /(^|\/)fixtures?(\/|$)/i, /\.pem$/i, /\.key$/i, /secret/i
];

function istVerboten(relPfad) {
  return VERBOTEN.some((muster) => muster.test(relPfad));
}

function sammleDateien(verzeichnis, basis = ROOT, treffer = []) {
  const voll = path.join(basis, verzeichnis);
  if (!fs.existsSync(voll)) return treffer;
  for (const eintrag of fs.readdirSync(voll, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = path.posix.join(verzeichnis, eintrag.name);
    if (istVerboten(rel)) continue;
    if (eintrag.isDirectory()) sammleDateien(rel, basis, treffer);
    else if (eintrag.isFile()) treffer.push(rel);
  }
  return treffer;
}

// ── MINIMALER, DETERMINISTISCHER ZIP-SCHREIBER (nur zlib) ─────────────────────────────────────
// Fester Zeitstempel: 1980-01-01 00:00 in DOS-Kodierung. Damit haengt der Archivinhalt
// ausschliesslich an den Dateien, nicht am Bauzeitpunkt.
const DOS_ZEIT = 0;
const DOS_DATUM = (1 << 5) | 1;                     // Jahr 1980, Monat 1, Tag 1

function crc32(buf) {
  let c;
  const tabelle = crc32.tabelle || (crc32.tabelle = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ tabelle[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}

function baueZip(dateien) {
  const lokale = [];
  const zentrale = [];
  let versatz = 0;

  for (const { name, inhalt } of dateien) {
    const namensBytes = Buffer.from(name, "utf8");
    const roh = crc32(inhalt);
    const gepackt = zlib.deflateRawSync(inhalt, { level: 9 });
    // Nur komprimieren, wenn es wirklich kleiner wird (sonst "stored").
    const nutzeDeflate = gepackt.length < inhalt.length;
    const daten = nutzeDeflate ? gepackt : inhalt;
    const methode = nutzeDeflate ? 8 : 0;

    const lokalerKopf = Buffer.alloc(30);
    lokalerKopf.writeUInt32LE(0x04034b50, 0);
    lokalerKopf.writeUInt16LE(20, 4);             // Version
    lokalerKopf.writeUInt16LE(0, 6);              // Flags
    lokalerKopf.writeUInt16LE(methode, 8);
    lokalerKopf.writeUInt16LE(DOS_ZEIT, 10);
    lokalerKopf.writeUInt16LE(DOS_DATUM, 12);
    lokalerKopf.writeUInt32LE(roh, 14);
    lokalerKopf.writeUInt32LE(daten.length, 18);
    lokalerKopf.writeUInt32LE(inhalt.length, 22);
    lokalerKopf.writeUInt16LE(namensBytes.length, 26);
    lokalerKopf.writeUInt16LE(0, 28);
    lokale.push(lokalerKopf, namensBytes, daten);

    const zentralerKopf = Buffer.alloc(46);
    zentralerKopf.writeUInt32LE(0x02014b50, 0);
    zentralerKopf.writeUInt16LE(20, 4);
    zentralerKopf.writeUInt16LE(20, 6);
    zentralerKopf.writeUInt16LE(0, 8);
    zentralerKopf.writeUInt16LE(methode, 10);
    zentralerKopf.writeUInt16LE(DOS_ZEIT, 12);
    zentralerKopf.writeUInt16LE(DOS_DATUM, 14);
    zentralerKopf.writeUInt32LE(roh, 16);
    zentralerKopf.writeUInt32LE(daten.length, 20);
    zentralerKopf.writeUInt32LE(inhalt.length, 24);
    zentralerKopf.writeUInt16LE(namensBytes.length, 28);
    zentralerKopf.writeUInt16LE(0, 30);           // Extra
    zentralerKopf.writeUInt16LE(0, 32);           // Kommentar
    zentralerKopf.writeUInt16LE(0, 34);           // Datentraeger
    zentralerKopf.writeUInt16LE(0, 36);           // interne Attribute
    // `>>> 0`: JS-Bitoperationen rechnen 32-bit VORZEICHENBEHAFTET — ohne die
    // Umwandlung liefe 0o100644 << 16 ins Negative und writeUInt32LE wuerfe.
    zentralerKopf.writeUInt32LE((0o100644 << 16) >>> 0, 38); // externe Attribute (rw-r--r--)
    zentralerKopf.writeUInt32LE(versatz, 42);
    zentrale.push(zentralerKopf, namensBytes);

    versatz += lokalerKopf.length + namensBytes.length + daten.length;
  }

  const zentralerBlock = Buffer.concat(zentrale);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(0, 4);
  ende.writeUInt16LE(0, 6);
  ende.writeUInt16LE(dateien.length, 8);
  ende.writeUInt16LE(dateien.length, 10);
  ende.writeUInt32LE(zentralerBlock.length, 12);
  ende.writeUInt32LE(versatz, 16);
  ende.writeUInt16LE(0, 20);

  return Buffer.concat([...lokale, zentralerBlock, ende]);
}

// ── MINIMALER ZIP-LESER (fuer die Pruefung: das Paket wird wirklich entpackt) ─────────────────
function entpackeZip(archiv, zielVerzeichnis) {
  // Zentrales Verzeichnis vom Ende her finden.
  let endeVersatz = -1;
  for (let i = archiv.length - 22; i >= 0; i -= 1) {
    if (archiv.readUInt32LE(i) === 0x06054b50) { endeVersatz = i; break; }
  }
  if (endeVersatz < 0) throw new Error("kein ZIP-Endeblock gefunden");
  const anzahl = archiv.readUInt16LE(endeVersatz + 10);
  let zeiger = archiv.readUInt32LE(endeVersatz + 16);

  const geschrieben = [];
  for (let i = 0; i < anzahl; i += 1) {
    if (archiv.readUInt32LE(zeiger) !== 0x02014b50) throw new Error("beschaedigtes zentrales Verzeichnis");
    const methode = archiv.readUInt16LE(zeiger + 10);
    const gepacktLaenge = archiv.readUInt32LE(zeiger + 20);
    const namensLaenge = archiv.readUInt16LE(zeiger + 28);
    const extraLaenge = archiv.readUInt16LE(zeiger + 30);
    const kommentarLaenge = archiv.readUInt16LE(zeiger + 32);
    const lokalerVersatz = archiv.readUInt32LE(zeiger + 42);
    const name = archiv.toString("utf8", zeiger + 46, zeiger + 46 + namensLaenge);

    const lokalNamensLaenge = archiv.readUInt16LE(lokalerVersatz + 26);
    const lokalExtraLaenge = archiv.readUInt16LE(lokalerVersatz + 28);
    const datenStart = lokalerVersatz + 30 + lokalNamensLaenge + lokalExtraLaenge;
    const daten = archiv.subarray(datenStart, datenStart + gepacktLaenge);
    const inhalt = methode === 8 ? zlib.inflateRawSync(daten) : Buffer.from(daten);

    // Pfadsicherheit: nie ausserhalb des Zielverzeichnisses schreiben.
    const ziel = path.resolve(zielVerzeichnis, name);
    if (!ziel.startsWith(path.resolve(zielVerzeichnis) + path.sep)) {
      throw new Error(`unsicherer Pfad im Archiv: ${name}`);
    }
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, inhalt);
    geschrieben.push(name);

    zeiger += 46 + namensLaenge + extraLaenge + kommentarLaenge;
  }
  return geschrieben;
}

// ── Der Bau ───────────────────────────────────────────────────────────────────────────────────
function baue({ ziel = path.join(ROOT, "build"), schreibeZip = true } = {}) {
  const namen = [];

  for (const einstieg of EINSTIEGSPUNKTE) {
    if (!fs.existsSync(path.join(ROOT, einstieg))) {
      throw new Error(`Einstiegspunkt fehlt: ${einstieg}`);
    }
    namen.push(einstieg);
  }
  for (const verzeichnis of FACHKERN_VERZEICHNISSE) namen.push(...sammleDateien(verzeichnis));

  // Abhaengigkeiten: das ganze node_modules-Verzeichnis waere zu gross und wuerde
  // Entwicklerwerkzeug mitnehmen. Genommen wird der TRANSITIVE Baum der drei festgelegten
  // SDKs — ermittelt ueber die tatsaechlich installierten Verzeichnisse.
  const nodeModules = path.join(ROOT, "node_modules");
  const gesehen = new Set();
  const offen = [...ABHAENGIGKEITEN];
  while (offen.length) {
    const paket = offen.shift();
    if (gesehen.has(paket)) continue;
    gesehen.add(paket);
    const paketPfad = path.join(nodeModules, paket);
    if (!fs.existsSync(paketPfad)) throw new Error(`Abhaengigkeit nicht installiert: ${paket} (npm ci ausfuehren)`);
    namen.push(...sammleDateien(path.posix.join("node_modules", paket)));
    const pkgJson = path.join(paketPfad, "package.json");
    if (fs.existsSync(pkgJson)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
      for (const abh of Object.keys(pkg.dependencies || {})) offen.push(abh);
    }
  }

  const eindeutig = [...new Set(namen)].sort();
  const dateien = eindeutig.map((name) => ({ name, inhalt: fs.readFileSync(path.join(ROOT, name)) }));

  const manifest = {
    gebautAus: "helmut-pilot",
    einstiegspunkte: EINSTIEGSPUNKTE,
    handlerPfade: { verbraucher: "lambda/index.handler", relay: "lambda/relay.handler" },
    abhaengigkeiten: ABHAENGIGKEITEN,
    dateien: dateien.length,
    gesamtBytes: dateien.reduce((s, d) => s + d.inhalt.length, 0),
    inhalt: dateien.map((d) => ({
      pfad: d.name, bytes: d.inhalt.length,
      sha256: crypto.createHash("sha256").update(d.inhalt).digest("hex").slice(0, 16)
    }))
  };

  fs.mkdirSync(ziel, { recursive: true });
  let zipPfad = null;
  if (schreibeZip) {
    const archiv = baueZip(dateien);
    zipPfad = path.join(ziel, "helmut-lambda.zip");
    fs.writeFileSync(zipPfad, archiv);
    manifest.zipBytes = archiv.length;
    manifest.zipSha256 = crypto.createHash("sha256").update(archiv).digest("hex");
  }
  fs.writeFileSync(path.join(ziel, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, zipPfad, ziel };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const zielIndex = argv.indexOf("--ziel");
  const ziel = zielIndex >= 0 ? argv[zielIndex + 1] : path.join(ROOT, "build");
  const ergebnis = baue({ ziel, schreibeZip: !argv.includes("--kein-zip") });
  const m = ergebnis.manifest;
  console.log("Helmut — Lambda-Paket gebaut");
  console.log(`  Dateien:        ${m.dateien}`);
  console.log(`  Roh:            ${(m.gesamtBytes / 1024 / 1024).toFixed(2)} MiB`);
  if (m.zipBytes) {
    console.log(`  Archiv:         ${(m.zipBytes / 1024 / 1024).toFixed(2)} MiB  (AWS-Grenze 50 MiB direkt / 250 MiB entpackt)`);
    console.log(`  SHA-256:        ${m.zipSha256}`);
  }
  console.log(`  Handler:        ${m.handlerPfade.verbraucher} · ${m.handlerPfade.relay}`);
  console.log(`  Ziel:           ${ergebnis.ziel}`);
}

module.exports = { baue, baueZip, entpackeZip, istVerboten, EINSTIEGSPUNKTE, ABHAENGIGKEITEN, VERBOTEN };
