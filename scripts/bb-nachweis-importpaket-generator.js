"use strict";

// Helmut — LOKALER, FAIL-CLOSED INPUT-GENERATOR FUER DEN BEGRENZTEN BERLIN-/BRANDENBURG-NACHWEIS
// =============================================================================================
// ZWECK
//   Aus der kanonischen Offline-Datei daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json
//   werden AUSSCHLIESSLICH die beiden vom Betreiber fuer den spaeter konkret genehmigten
//   begrenzten Production-Nachweis vorgesehenen Eintraege
//     * landtag-berlin-burkard-dregger
//     * landtag-brandenburg-40618
//   als deterministisches JSON-Importpaket oder als Provisionierungs-Spec fuer den
//   vorhandenen inaktiven Batch-Pfad erzeugt. Keine andere Person, kein erfundenes Feld.
//
// SCHUTZ
//   * Es wird NICHTS persistiert, solange kein expliziter Ausgabepfad gesetzt ist.
//   * --spec-out schreibt nur in einen expliziten Pfad unterhalb des OS-Temp-Verzeichnisses.
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
//   node scripts/bb-nachweis-importpaket-generator.js --paket <datei> --spec-out <temp-datei>
//   node scripts/bb-nachweis-importpaket-generator.js --paket <datei>          # fail-closed, Exit 2
//
// STOP-GRENZE: kein Production-Ausfuehrer, kein Rueckweg-SQL, keine Migration.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const IMPORT = require(path.join(__dirname, "..", "lib", "helmut", "profil-import.js"));
const ZULASSUNG = require(path.join(__dirname, "..", "lib", "helmut", "profil-zulassung.js"));

const PAKET_PFAD = path.join(__dirname, "..", "daten", "mandatsprofile-bundestag-berlin-brandenburg-20260929.json");
const PAKET_VERSION = "helmut-bb-importpaket/1";
const SPEC_VERSION = "helmut-bb-provisionierungsspec/1";
const KOHORTEN_NAME = "berlin-brandenburg-nachweis-2";
// Kein Zugangsgeheimnis: der inaktive Stapel sperrt beide Konten (active=false);
// eine spaetere Aktivierung ist eine getrennte Freigabe und muss ein Passwort setzen.
const SPEC_PASSWORT = "nicht-zur-anmeldung-vorgesehen";

// Die Auswahl steht VOR jeder Nachrichtenauswertung fest (Betreiberauftrag). Keine anderen Profile.
const ZIELKOLLORTE = Object.freeze([
  Object.freeze({
    mandatsId: "landtag-berlin-burkard-dregger",
    parlament: "landtag-berlin",
    bundesland: "Berlin",
    parliamentType: "Landtag"
  }),
  Object.freeze({
    mandatsId: "landtag-brandenburg-40618",
    parlament: "landtag-brandenburg",
    bundesland: "Brandenburg",
    parliamentType: "Landtag"
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

// Zusatzriegel fuer den Provisionierungs-Spec-Pfad. Der Importpaket-Pfad bleibt
// unveraendert; dieser Pfad verlangt zusaetzlich die ausdrueckliche Nicht-Freigabe
// im gesamten Offline-Paket und in den zwei Profilstatus-Eintraegen.
function pruefeProvisionierungsfreigaben(quelle) {
  const fehler = [];
  const q = quelle && typeof quelle === "object" && !Array.isArray(quelle) ? quelle : {};
  const offline = q.offlinePaket && typeof q.offlinePaket === "object" ? q.offlinePaket : {};
  const freigabe = offline.importfreigabe;
  if (!freigabe || typeof freigabe !== "object" || Array.isArray(freigabe)) {
    fehler.push("offlinePaket.importfreigabe fehlt; die Nicht-Importfreigabe ist nicht belegt.");
  } else {
    for (const feld of ["freigegeben", "import", "provisionierung", "aktivierung"]) {
      if (freigabe[feld] !== false) {
        fehler.push(`offlinePaket.importfreigabe.${feld} muss exakt false sein: ${JSON.stringify(freigabe[feld])}`);
      }
    }
  }

  const status = Array.isArray(offline.profilstatus) ? offline.profilstatus : [];
  for (const erwartet of ZIELKOLLORTE) {
    const treffer = status.filter((s) => s && text(s.mandatsId) === erwartet.mandatsId);
    if (treffer.length !== 1) {
      fehler.push(`offlinePaket.profilstatus muss genau einen Eintrag fuer ${erwartet.mandatsId} tragen (${treffer.length}x).`);
      continue;
    }
    const s = treffer[0];
    if (text(s.parlament) !== erwartet.parlament) {
      fehler.push(`offlinePaket.profilstatus.parlament passt nicht fuer ${erwartet.mandatsId}: ${text(s.parlament) || "(leer)"} != ${erwartet.parlament}`);
    }
    if (s.aktiv !== false) {
      fehler.push(`offlinePaket.profilstatus.aktiv muss fuer ${erwartet.mandatsId} exakt false sein: ${JSON.stringify(s.aktiv)}`);
    }
    if (s.importfreigegeben !== false) {
      fehler.push(`offlinePaket.profilstatus.importfreigegeben muss fuer ${erwartet.mandatsId} exakt false sein: ${JSON.stringify(s.importfreigegeben)}`);
    }
  }

  const profile = Array.isArray(q.profile) ? q.profile : [];
  for (const erwartet of ZIELKOLLORTE) {
    const p = profile.find((x) => x && text(x.mandatsId) === erwartet.mandatsId);
    if (!p) continue; // Der fehlende Zielprofil-Fall wird bereits in pruefeQuelle gemeldet.
    if (!text(p.vollname)) fehler.push(`vollname fehlt fuer ${erwartet.mandatsId}`);
    if (!text(p.partei)) fehler.push(`partei fehlt fuer ${erwartet.mandatsId}`);
    if (!text(p.fraktion)) fehler.push(`fraktion fehlt fuer ${erwartet.mandatsId}`);
    const region = text(p.wahlkreis) || text(p.regionHinweis);
    if (!region) fehler.push(`Region/Wahlkreis fehlt fuer ${erwartet.mandatsId}`);
    if (!Array.isArray(p.ausschuesse) || !p.ausschuesse.some((a) => text(a))) {
      fehler.push(`mindestens ein Ausschuss fehlt fuer ${erwartet.mandatsId}`);
    }
    const quellen = Array.isArray(p.offizielleQuellen) ? p.offizielleQuellen : [];
    if (!quellen.length) fehler.push(`amtliche Quellen fehlen fuer ${erwartet.mandatsId}`);
    for (const quelleEintrag of quellen) {
      if (!quelleEintrag || typeof quelleEintrag !== "object" || Array.isArray(quelleEintrag)) {
        fehler.push(`amtliche Quelle ist kein Objekt fuer ${erwartet.mandatsId}`);
        continue;
      }
      if (!text(quelleEintrag.art)) fehler.push(`amtliche Quelle ohne art fuer ${erwartet.mandatsId}`);
      if (!/^https:\/\//i.test(text(quelleEintrag.url))) {
        fehler.push(`amtliche Quelle ist kein https-Beleg fuer ${erwartet.mandatsId}: ${text(quelleEintrag.url) || "(leer)"}`);
      }
      if (!istHex64(quelleEintrag.sha256)) {
        fehler.push(`amtlicher Quellen-Hash (sha256) fehlt oder ist ungueltig fuer ${erwartet.mandatsId}`);
      }
    }
  }
  return fehler;
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

// Reine Abbildung auf den vorhandenen inaktiven Batch-Provisionierungsweg
// (`provisioning.provisionBatch`) — ohne Provisionierung, ohne Schreibvorgang.
// Die zwei Specs tragen nur abgeleitete Werte aus der kanonischen Quelle, bleiben
// ausdruecklich inaktiv/nicht importfreigegeben und behalten die amtlichen Quellen
// mit Hash zum Nachweis. Das Passwort ist ein klar benannter Platzhalter, kein Secret.
function baueProvisionierungsSpecs(quelle, optionen = {}) {
  const pruefQuelle = pruefeQuelle(quelle);
  const freigabeFehler = pruefeProvisionierungsfreigaben(quelle);
  const fehler = [...(pruefQuelle.fehler || []), ...freigabeFehler];
  if (!pruefQuelle.ok || freigabeFehler.length) {
    return { ok: false, fehler };
  }

  const emailDomain = text(optionen.emailDomain) || "bb-nachweis.invalid";
  const mandate = ZIELKOLLORTE.map((erwartet) => {
    const p = quelle.profile.find((x) => x && text(x.mandatsId) === erwartet.mandatsId);
    return {
      id: erwartet.mandatsId,
      email: `${erwartet.mandatsId}@${emailDomain}`,
      name: text(p.vollname),
      password: SPEC_PASSWORT,
      party: text(p.partei),
      faction: text(p.fraktion),
      parliamentType: erwartet.parliamentType,
      state: text(p.bundesland),
      constituency: text(p.wahlkreis) || text(p.regionHinweis),
      committees: Array.isArray(p.ausschuesse) ? p.ausschuesse.map((a) => text(a)).filter(Boolean) : [],
      aktiv: false,
      importfreigegeben: false,
      offizielleQuellen: Array.isArray(p.offizielleQuellen) ? p.offizielleQuellen.map((q) => ({ ...q })) : []
    };
  });

  const spezifikation = {
    version: SPEC_VERSION,
    kohorte: KOHORTEN_NAME,
    importfreigegeben: false,
    aktivierung: false,
    quelle: optionen.quelle || null,
    hinweis: "Provisionierungs-Spec fuer den vorhandenen inaktiven Batch-Pfad. "
      + "KEINE Provisionierung, KEINE Aktivierung, KEINE Importfreigabe, kein Netz-/DB-Zugriff. "
      + "Die Konten werden ausschliesslich inaktiv angelegt; das Passwort ist ein Platzhalter "
      + "und muss vor einer spaeteren Aktivierung neu gesetzt werden.",
    mandate
  };
  return { ok: true, spezifikation };
}

// Erzeugt denselben deterministischen JSON-Text in jedem Lauf. Reine Funktion, kein Schreibzugriff.
function serialisiere(paket) {
  return `${JSON.stringify(paket, null, 2)}\n`;
}

function serialisiereProvisionierungsSpecs(spezifikation) {
  return `${JSON.stringify(spezifikation, null, 2)}\n`;
}

// Der Spec-Pfad darf nur in einen expliziten Pfad unterhalb des OS-Temp-Verzeichnisses
// schreiben. Damit kann der neue Operatorpfad keinen Repo-/Production-Datensatz anlegen.
function istExpliziterTempPfad(pfad) {
  const roh = text(pfad);
  if (!roh || !path.isAbsolute(roh)) return false;
  const ziel = path.resolve(roh);
  let tmp;
  try { tmp = fs.realpathSync(os.tmpdir()); } catch (_) { return false; }

  // Der naechste existierende Bestandteil darf kein Symlink sein; danach wird der
  // reale Pfad gebildet und gegen das reale Temp-Verzeichnis geprueft.
  let basis = ziel;
  while (!fs.existsSync(basis)) {
    const eltern = path.dirname(basis);
    if (eltern === basis) return false;
    basis = eltern;
  }
  let basisStat;
  try { basisStat = fs.lstatSync(basis); } catch (_) { return false; }
  if (basisStat.isSymbolicLink()) return false;

  let realBasis;
  try { realBasis = fs.realpathSync(basis); } catch (_) { return false; }
  const rest = path.relative(basis, ziel);
  const realZiel = rest ? path.join(realBasis, rest) : realBasis;
  const relativ = path.relative(tmp, realZiel);
  if (!relativ || relativ.startsWith("..") || path.isAbsolute(relativ)) return false;
  if (fs.existsSync(ziel)) {
    let stat;
    try { stat = fs.lstatSync(ziel); } catch (_) { return false; }
    if (stat.isSymbolicLink() || !stat.isFile()) return false;
  }
  return true;
}

function leseArgumente(argv) {
  const args = { paket: PAKET_PFAD, out: "", specOut: "", json: false };
  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift();
    if (a === "--paket") { args.paket = rest.shift() || ""; continue; }
    if (a === "--out") { args.out = rest.shift() || ""; continue; }
    if (a === "--spec-out") {
      const wert = rest.shift() || "";
      if (!wert || wert.startsWith("--")) return { ok: false, fehler: "--spec-out braucht einen expliziten Ausgabepfad." };
      args.specOut = wert;
      continue;
    }
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
    console.error("Aufruf: node scripts/bb-nachweis-importpaket-generator.js --paket <datei> --json|--out <datei>|--spec-out <temp-datei>");
    return 2;
  }
  const { paket, out, specOut, json, help } = geparst.args;
  if (help) {
    console.log("Aufruf: node scripts/bb-nachweis-importpaket-generator.js --paket <datei> --json|--out <datei>|--spec-out <temp-datei>");
    console.log("Ohne --json/--out/--spec-out wird nichts erzeugt (fail-closed).");
    return 0;
  }
  if (!out && !json && !specOut) {
    console.error("FAIL-CLOSED: Kein Ausgabepfad/--json gesetzt. Es wird nichts geschrieben.");
    console.error("Aufruf: node scripts/bb-nachweis-importpaket-generator.js --paket <datei> --json|--out <datei>|--spec-out <temp-datei>");
    return 2;
  }
  if (specOut && (out || json)) {
    console.error("FAIL-CLOSED: --spec-out ist nicht mit --out/--json kombinierbar. Es wird nichts geschrieben.");
    return 2;
  }
  if (specOut && !istExpliziterTempPfad(specOut)) {
    console.error("FAIL-CLOSED: --spec-out verlangt einen expliziten Pfad unterhalb des OS-Temp-Verzeichnisses.");
    console.error(`Nicht akzeptiert: ${text(specOut) || "(leer)"}`);
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

  if (specOut) {
    const ergebnisSpec = baueProvisionierungsSpecs(quelle, { quelle: quelleMeta });
    if (!ergebnisSpec.ok) {
      console.error("FAIL-CLOSED: Die Quelldatei erfuellt die Provisionierungs-Spec-Auswahl nicht:");
      for (const f of ergebnisSpec.fehler) console.error(`  - ${f}`);
      return 2;
    }
    const inhaltSpec = serialisiereProvisionierungsSpecs(ergebnisSpec.spezifikation);
    try {
      fs.mkdirSync(path.dirname(path.resolve(specOut)), { recursive: true });
      // Kein stilles Ueberschreiben eines bestehenden Operator-Artefakts. Der
      // nachgelagerte Provisionierungsweg darf nur einen frisch gebundenen
      // Spec verwenden; ein vorhandener Pfad ist deshalb ein Abbruch.
      fs.writeFileSync(specOut, inhaltSpec, { encoding: "utf8", mode: 0o600, flag: "wx" });
      fs.chmodSync(specOut, 0o600);
    } catch (e) {
      console.error(`FEHLER: Ausgabe nicht schreibbar: ${text(specOut)} (${text(e && e.message)})`);
      return 3;
    }
    console.error(`OK: ${ergebnisSpec.spezifikation.mandate.length} inaktive Provisionierungs-Specs deterministisch geschrieben: ${specOut}`);
    return 0;
  }

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
  SPEC_VERSION,
  KOHORTEN_NAME,
  SPEC_PASSWORT,
  ZIELKOLLORTE,
  ladeQuelle,
  pruefeAmtlicheQuelle,
  pruefeQuelle,
  pruefeProvisionierungsfreigaben,
  baueImportpaket,
  baueProvisionierungsSpecs,
  serialisiere,
  serialisiereProvisionierungsSpecs,
  istExpliziterTempPfad,
  leseArgumente,
  hashDateiSync,
  main
};

if (require.main === module) {
  process.exitCode = main();
}
