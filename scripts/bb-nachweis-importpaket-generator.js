"use strict";

// Helmut — LOKALER, FAIL-CLOSED INPUT-GENERATOR FUER DEN BEGRENZTEN BERLIN-/BRANDENBURG-NACHWEIS
// =============================================================================================
// ZWECK
//   Aus der kanonischen Offline-Datei daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json
//   werden AUSSCHLIESSLICH die beiden vom Betreiber fuer den spaeter konkret genehmigten
//   begrenzten Production-Nachweis vorgesehenen Eintraege
//     * landtag-berlin-burkard-dregger
//     * landtag-brandenburg-40618
//   als deterministisches JSON-Importpaket erzeugt. Keine andere Person, kein erfundenes Feld.
//
// SCHUTZ
//   * Es wird NICHTS persistiert, solange kein expliziter Ausgabepfad gesetzt ist.
//   * Die beiden Profile werden NIE aktiviert: aktiv=false und importfreigegeben=false sind Pflicht.
//   * Die zentrale Zulassungs-/Importlogik (lib/helmut/profil-zulassung.js,
//     lib/helmut/profil-import.js) wird genutzt, statt Regeln zu duplizieren.
//   * Es gibt keinen Datenbank-, Netzwerk-, Env- oder Production-Zugriff. Kein Commit/Push/PR.
//
// FAIL-CLOSED (Exit 2, KEIN Output)
//   * eine Ziel-ID fehlt oder ist doppelt,
//   * das Paket enthaelt nicht genau die zwei Zielprofile,
//   * aktiv oder importfreigegeben ist nicht false,
//   * Parlament/Bundesland passen nicht (Berlin / Brandenburg),
//   * amtliche Profilquelle fehlt, ist kein amtliches https-Profil oder ihr sha256 fehlt/ist
//     nicht hexadezimal,
//   * Partei ODER Fraktion zeigen eine AfD-Zugehoerigkeit an.
//
// AUFRUF
//   node scripts/bb-nachweis-importpaket-generator.js --paket <datei> --json
//   node scripts/bb-nachweis-importpaket-generator.js --paket <datei> --out <datei>
//   node scripts/bb-nachweis-importpaket-generator.js --paket <datei>          # fail-closed, Exit 2
//
// STOP-GRENZE: kein Production-Ausfuehrer, kein Rueckweg-SQL, keine Migration.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const IMPORT = require(path.join(__dirname, "..", "lib", "helmut", "profil-import.js"));
const ZULASSUNG = require(path.join(__dirname, "..", "lib", "helmut", "profil-zulassung.js"));

const PAKET_PFAD = path.join(__dirname, "..", "daten", "mandatsprofile-bundestag-berlin-brandenburg-20260929.json");
const PAKET_VERSION = "helmut-bb-importpaket/1";
const KOHORTEN_NAME = "berlin-brandenburg-nachweis-2";

// Die Auswahl steht VOR jeder Nachrichtenauswertung fest (Betreiberauftrag). Keine anderen Profile.
const ZIELKOLLORTE = Object.freeze([
  Object.freeze({
    mandatsId: "landtag-berlin-burkard-dregger",
    parlament: "landtag-berlin",
    bundesland: "Berlin"
  }),
  Object.freeze({
    mandatsId: "landtag-brandenburg-40618",
    parlament: "landtag-brandenburg",
    bundesland: "Brandenburg"
  })
]);

function text(v) { return String(v == null ? "" : v).trim(); }
function norm(v) { return text(v).toLowerCase().replace(/\s+/g, " "); }
function istHex64(v) { return /^[0-9a-f]{64}$/i.test(text(v)); }
function hashDateiSync(pfad) {
  return crypto.createHash("sha256").update(fs.readFileSync(pfad)).digest("hex");
}

// Liefert die Eintraege der kanonischen Offline-Datei. Rein lesend, kein Cache, kein Env.
function ladeQuelle(pfad = PAKET_PFAD) {
  return JSON.parse(fs.readFileSync(pfad, "utf8"));
}

// Amtliche Profilseite + Beleg-Hash MUSS vorhanden sein (Belegpflicht, Zulassung). Fail-closed.
function pruefeAmtlicheQuelle(profil, erwartet) {
  const quellen = Array.isArray(profil.offizielleQuellen) ? profil.offizielleQuellen : [];
  const profilSeiten = quellen.filter((q) => q && q.art === "parlament-profil");
  if (!profilSeiten.length) {
    return `amtliche Profilquelle fehlt (art=parlament-profil) fuer ${erwartet.mandatsId}`;
  }
  const hosts = IMPORT.AMTLICHE_HOSTS[erwartet.parlament] || [];
  for (const q of profilSeiten) {
    const url = text(q.url);
    if (!/^https:\/\//i.test(url)) {
      return `amtliche Profilquelle ist kein https-Beleg fuer ${erwartet.mandatsId}: ${url || "(leer)"}`;
    }
    let h = "";
    try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch (_) { h = ""; }
    if (!hosts.some((e) => h === e || h.endsWith(`.${e}`))) {
      return `amtliche Profilquelle stammt nicht vom Parlament fuer ${erwartet.mandatsId}: ${h || "(leer)"}`;
    }
    if (!istHex64(q.sha256)) {
      return `amtlicher Profilquellen-Hash (sha256) fehlt oder ist ungueltig fuer ${erwartet.mandatsId}`;
    }
  }
  return null;
}

// Kernpruefung der Quelle: exakt die zwei Zielprofile, korrekte Ebene/Land/Quelle, keine AfD, inaktiv.
function pruefeQuelle(quelle) {
  const fehler = [];
  if (!quelle || typeof quelle !== "object" || Array.isArray(quelle)) {
    return { ok: false, fehler: ["Die Quelldatei ist kein Objekt mit `profile`-Liste."] };
  }
  if (!Array.isArray(quelle.profile)) {
    return { ok: false, fehler: ["Die Quelldatei hat keine `profile`-Liste."] };
  }

  // Auswahl-Riegel: Die kanonische Datei fuehrt ihre zulaessige Menge in offlinePaket.profilstatus.
  // Nur diese IDs duerfen im Quellpaket vorkommen; jeder weitere/umbenannte Eintrag ist ein Fehler.
  const profilstatus = Array.isArray(quelle.offlinePaket && quelle.offlinePaket.profilstatus)
    ? quelle.offlinePaket.profilstatus : null;
  const erlaubteIds = new Set();
  if (!profilstatus) {
    fehler.push("offlinePaket.profilstatus fehlt; die zulaessige Profilmenge ist nicht belegt.");
  } else {
    if (profilstatus.length !== quelle.profile.length) {
      fehler.push(`offlinePaket.profilstatus (${profilstatus.length}) und profile (${quelle.profile.length}) sind nicht deckungsgleich.`);
    }
    for (const s of profilstatus) {
      if (!s || !text(s.mandatsId)) {
        fehler.push("offlinePaket.profilstatus enthaelt einen Eintrag ohne mandatsId.");
        continue;
      }
      erlaubteIds.add(text(s.mandatsId));
    }
    for (const p of quelle.profile) {
      const id = p && text(p.mandatsId);
      if (!id) {
        fehler.push("Die Quelldatei enthaelt ein Profil ohne mandatsId.");
        continue;
      }
      if (!erlaubteIds.has(id)) {
        fehler.push(`Profil ausserhalb der belegten Auswahl: ${id}`);
      }
    }
  }

  const gefunden = [];
  for (const erwartet of ZIELKOLLORTE) {
    const treffer = quelle.profile.filter((p) => p && text(p.mandatsId) === erwartet.mandatsId);
    if (treffer.length === 0) {
      fehler.push(`Ziel-ID fehlt in der Quelldatei: ${erwartet.mandatsId}`);
      continue;
    }
    if (treffer.length > 1) {
      fehler.push(`Ziel-ID ist mehrfach in der Quelldatei: ${erwartet.mandatsId} (${treffer.length}x)`);
      continue;
    }
    const p = treffer[0];
    if (text(p.parlament) !== erwartet.parlament) {
      fehler.push(`Parlament passt nicht fuer ${erwartet.mandatsId}: ${text(p.parlament) || "(leer)"} != ${erwartet.parlament}`);
    }
    if (norm(p.bundesland) !== norm(erwartet.bundesland)) {
      fehler.push(`Bundesland passt nicht fuer ${erwartet.mandatsId}: ${text(p.bundesland) || "(leer)"} != ${erwartet.bundesland}`);
    }
    if (ZULASSUNG.istAusgeschlossen(p)) {
      fehler.push(`AfD-Zugehoerigkeit in Partei ODER Fraktion fuer ${erwartet.mandatsId}: ${ZULASSUNG.GRUND}`);
    }
    if (p.aktiv !== false) {
      fehler.push(`aktiv muss exakt false sein fuer ${erwartet.mandatsId}: ${JSON.stringify(p.aktiv)}`);
    }
    if (Object.prototype.hasOwnProperty.call(p, "importfreigegeben") && p.importfreigegeben !== false) {
      fehler.push(`importfreigegeben muss false sein fuer ${erwartet.mandatsId}: ${JSON.stringify(p.importfreigegeben)}`);
    }
    const quellenFehler = pruefeAmtlicheQuelle(p, erwartet);
    if (quellenFehler) fehler.push(quellenFehler);
    gefunden.push(p);
  }

  if (gefunden.length !== ZIELKOLLORTE.length) {
    return { ok: false, fehler };
  }

  // Der zentrale Importvertrag prueft zusaetzlich AfD, Pflichtfelder, Region, Beleg-Host und
  // unbekannte Felder. Er darf das Ergebnis NIE erweitern — ein unbekanntes Feld ist ein Fehler.
  const vertrag = IMPORT.pruefeImport({ version: IMPORT.VERTRAGSVERSION, profile: gefunden });
  if (!vertrag.ok || vertrag.profile !== ZIELKOLLORTE.length
    || vertrag.gueltig !== ZIELKOLLORTE.length) {
    for (const f of vertrag.fehler || []) {
      fehler.push(`Importvertrag [${f.code}]${f.feld ? ` ${f.feld}` : ""}: ${f.text}`);
    }
    for (const e of vertrag.ergebnisse || []) {
      for (const f of e.fehler || []) {
        fehler.push(`Importvertrag #${e.index} [${f.code}]${f.feld ? ` ${f.feld}` : ""}: ${f.text}`);
      }
    }
  }

  return { ok: fehler.length === 0, fehler };
}

// Reine Abbildung auf das Importpaket. Setzt aktiv/importfreigegeben ABSICHTLICH auf false,
// unabhaengig davon, was in der Quelle stand (die Aktivierung ist eine gesonderte Freigabe).
function baueImportpaket(quelle, optionen = {}) {
  const pruef = pruefeQuelle(quelle);
  if (!pruef.ok) {
    return { ok: false, fehler: pruef.fehler };
  }
  // Vertragsprofile: exakt die Felder des zentralen Importvertrags, plus die harte Deaktivierung.
  // `importfreigegeben` ist KEIN Vertragsfeld und bleibt deshalb ausserhalb des Profils.
  const profile = ZIELKOLLORTE.map((erwartet) => {
    const roh = quelle.profile.find((p) => p && text(p.mandatsId) === erwartet.mandatsId);
    return { ...roh, aktiv: false };
  });
  const paket = {
    version: IMPORT.VERTRAGSVERSION,
    profile
  };
  const ausgabe = {
    paket: PAKET_VERSION,
    kohorte: KOHORTEN_NAME,
    importfreigegeben: false,
    quelle: optionen.quelle || null,
    hinweis: "Reines Offline-Importpaket der zwei ausgewaehlten Landtagsprofile Berlin/Brandenburg. "
      + "KEINE Provisionierung, KEINE Aktivierung, KEINE Importfreigabe. Beide Profile bleiben "
      + "aktiv=false und importfreigegeben=false. Ausfuehrung nur nach gesonderter Betreiber-Freigabe.",
    paket
  };
  return { ok: true, paket: ausgabe };
}

// Erzeugt denselben deterministischen JSON-Text in jedem Lauf. Reine Funktion, kein Schreibzugriff.
function serialisiere(paket) {
  return `${JSON.stringify(paket, null, 2)}\n`;
}

function leseArgumente(argv) {
  const args = { paket: PAKET_PFAD, out: "", json: false };
  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift();
    if (a === "--paket") { args.paket = rest.shift() || ""; continue; }
    if (a === "--out") { args.out = rest.shift() || ""; continue; }
    if (a === "--json") { args.json = true; continue; }
    if (a === "--help" || a === "-h") { args.help = true; continue; }
    if (!args.paketGesetzt && !a.startsWith("--")) { args.paket = a; args.paketGesetzt = true; continue; }
    return { ok: false, fehler: `Unbekanntes Argument: ${a}` };
  }
  return { ok: true, args };
}

function main(argv = process.argv.slice(2)) {
  const geparst = leseArgumente(argv);
  if (!geparst.ok) {
    console.error(`FEHLER: ${geparst.fehler}`);
    console.error("Aufruf: node scripts/bb-nachweis-importpaket-generator.js --paket <datei> --json|--out <datei>");
    return 2;
  }
  const { paket, out, json, help } = geparst.args;
  if (help) {
    console.log("Aufruf: node scripts/bb-nachweis-importpaket-generator.js --paket <datei> --json|--out <datei>");
    console.log("Ohne --json/--out wird nichts erzeugt (fail-closed).");
    return 0;
  }
  if (!out && !json) {
    console.error("FAIL-CLOSED: Kein Ausgabepfad/--json gesetzt. Es wird nichts geschrieben.");
    console.error("Aufruf: node scripts/bb-nachweis-importpaket-generator.js --paket <datei> --json|--out <datei>");
    return 2;
  }

  // Relativer Pfad im Paketkopf: byte-identische Ausgabe unabhaengig vom Worktree-Absolutpfad.
  const quellePfdRelativ = path.relative(path.join(__dirname, ".."), path.resolve(paket)) || paket;
  let quelle;
  try {
    quelle = ladeQuelle(paket);
  } catch (e) {
    console.error(`FEHLER: Quelldatei nicht lesbar: ${text(paket)} (${text(e && e.message)})`);
    return 2;
  }
  const quelleMeta = { pfad: quellePfdRelativ, sha256: hashDateiSync(paket) };
  const ergebnis = baueImportpaket(quelle, { quelle: quelleMeta });
  if (!ergebnis.ok) {
    console.error("FAIL-CLOSED: Die Quelldatei erfuellt die Nachweis-Auswahl nicht:");
    for (const f of ergebnis.fehler) console.error(`  - ${f}`);
    return 2;
  }
  const inhalt = serialisiere(ergebnis.paket);
  if (json) process.stdout.write(inhalt);
  if (out) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, inhalt, "utf8");
    } catch (e) {
      console.error(`FEHLER: Ausgabe nicht schreibbar: ${text(out)} (${text(e && e.message)})`);
      return 3;
    }
    console.error(`OK: ${ergebnis.paket.paket.profile.length} Profile deterministisch geschrieben: ${out}`);
  }
  return 0;
}

module.exports = {
  PAKET_PFAD,
  PAKET_VERSION,
  KOHORTEN_NAME,
  ZIELKOLLORTE,
  ladeQuelle,
  pruefeAmtlicheQuelle,
  pruefeQuelle,
  baueImportpaket,
  serialisiere,
  leseArgumente,
  hashDateiSync,
  main
};

if (require.main === module) {
  process.exitCode = main();
}
