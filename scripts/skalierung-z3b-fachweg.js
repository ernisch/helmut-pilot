"use strict";

// Neuer Fachweglauf fuer genau eine bisher ungemessene Stufe 200 ODER 500.
// Er wiederholt keine alte Z3a Stufe. Je Ziel laufen zwei vollstaendige lokale
// Fachwege: zuerst ohne Fehlermandat, danach mit genau diesem Kontrollbericht.
// Azure antwortet dabei NICHT erneut. Seine echte 21er Stichprobe liefert nur das
// konservative Laufzeitprofil fuer den lokalen TLS Endpunkt.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const P = require("./fixtures/z3b-fachweg-plan");
const T = require("./fixtures/z3b-tagesbedarf-bericht");
const R = require("./skalierung-z3-realistiklauf");

const ROOT = path.join(__dirname, "..");
const LOKAL = path.join(ROOT, "scripts", "lokal.js");
const FACHWEG = path.join(ROOT, "scripts", "skalierung-z3-realistiklauf.js");
const EXTERNE_STARTVERIFIER_AKTIV = false;
const MAX_ZAEHLER = 1000000000;
const SHA256_RE = /^[0-9a-f]{64}$/;
const GIT_SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ZEICHEN_JE_TOKEN = 3.8;

class Z3bFachwegAbbruch extends Error {
  constructor(nachricht, grund = "sicherheitsabbruch") {
    super(nachricht);
    this.name = "Z3bFachwegAbbruch";
    this.grund = grund;
  }
}

function objekt(wert, name) {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) {
    throw new Z3bFachwegAbbruch(`${name} fehlt oder ist kein Objekt`, "fachweg-rot");
  }
  return wert;
}

function nurSchluessel(wert, erlaubt, name) {
  const o = objekt(wert, name);
  const fremd = Object.keys(o).filter((feld) => !erlaubt.includes(feld));
  const fehlt = erlaubt.filter((feld) => !(feld in o));
  if (fremd.length || fehlt.length) {
    throw new Z3bFachwegAbbruch(
      `${name} hat kein exaktes Schema${fremd.length ? `; unbekannt: ${fremd.join(", ")}` : ""}`
        + `${fehlt.length ? `; fehlt: ${fehlt.join(", ")}` : ""}`,
      "fachweg-rot"
    );
  }
  return o;
}

function sichereGanzzahl(wert, name, { minimum = 0, maximum = MAX_ZAEHLER } = {}) {
  if (typeof wert !== "number" || !Number.isSafeInteger(wert)
      || wert < minimum || wert > maximum) {
    throw new Z3bFachwegAbbruch(`${name} ist keine sichere Ganzzahl`, "fachweg-rot");
  }
  return wert;
}

function vollerSha256(wert, name) {
  if (typeof wert !== "string" || !SHA256_RE.test(wert)) {
    throw new Z3bFachwegAbbruch(`${name} ist kein voller SHA256`, "fachweg-rot");
  }
  return wert;
}

function exakterText(wert, name, muster, maximum = 300) {
  if (typeof wert !== "string" || wert.length > maximum || !muster.test(wert)) {
    throw new Z3bFachwegAbbruch(`${name} ist nicht gueltig`, "fachweg-rot");
  }
  return wert;
}

function liesJson(datei, name) {
  const ziel = path.resolve(String(datei || ""));
  if (!datei || !path.isAbsolute(String(datei)) || !fs.existsSync(ziel) || !fs.statSync(ziel).isFile()) {
    throw new Z3bFachwegAbbruch(`${name} fehlt oder ist keine vorhandene absolute Datei`, "beleg");
  }
  const roh = fs.readFileSync(ziel, "utf8");
  let json;
  try { json = JSON.parse(roh); }
  catch (_) { throw new Z3bFachwegAbbruch(`${name} ist kein gueltiges JSON`, "beleg"); }
  return Object.freeze({ datei: ziel, roh, json, hash: P.dateiFingerabdruck(roh) });
}

function neuesAusgabeverzeichnis(roh) {
  const ziel = path.resolve(String(roh || ""));
  if (!roh || !path.isAbsolute(String(roh)) || ziel === path.parse(ziel).root
      || ziel === path.dirname(ziel) || fs.existsSync(ziel)) {
    throw new Z3bFachwegAbbruch(
      "Z3b Fachweg braucht ein neues, absolutes und noch nicht vorhandenes Ausgabeverzeichnis",
      "ausgabe"
    );
  }
  const eltern = path.dirname(ziel);
  if (!fs.existsSync(eltern) || !fs.statSync(eltern).isDirectory()) {
    throw new Z3bFachwegAbbruch("Elternverzeichnis der Z3b Fachwegausgabe fehlt", "ausgabe");
  }
  return ziel;
}

function pruefeEingangsbelege(env = process.env, {
  jetzt = new Date(),
  heuteUtc = new Date(jetzt).toISOString().slice(0, 10),
  vertrauenswuerdigeSlotIds
} = {}) {
  let ziel;
  try { ziel = P.stufe(env.HELMUT_Z3B_FACHWEG_STUFE); }
  catch (fehler) { throw new Z3bFachwegAbbruch(fehler.message, "stufe"); }
  const lauf = String(env.HELMUT_Z3B_FACHWEG_LAUF || "").trim();
  let freigabe;
  try { freigabe = P.laufFreigabe(ziel, lauf); }
  catch (fehler) { throw new Z3bFachwegAbbruch(fehler.message, "freigabe"); }
  if (String(env.HELMUT_Z3B_FACHWEG_FREIGABE || "") !== freigabe) {
    throw new Z3bFachwegAbbruch("Z3b Fachweg ist nicht stufen und laufbezogen freigegeben", "freigabe");
  }
  const azureDatei = liesJson(env.HELMUT_Z3B_FACHWEG_AZURE_BERICHT, "Azure Stichprobenbericht");
  const vorstufenDatei = liesJson(env.HELMUT_Z3B_FACHWEG_VORSTUFEN_BERICHT, "Vorstufenbericht");
  let azure;
  let vorstufe;
  try {
    azure = P.pruefeAzureBericht(azureDatei.json, { jetzt, heuteUtc });
    vorstufe = P.pruefeVorstufenBericht(vorstufenDatei.json, ziel, {
      jetzt, heuteUtc, vertrauenswuerdigeSlotIds
    });
  } catch (fehler) {
    throw new Z3bFachwegAbbruch(fehler.message, "beleg");
  }
  return Object.freeze({
    ziel, lauf, freigabe, azure, vorstufe,
    azureBeleg: Object.freeze({ hash: azureDatei.hash, datei: azureDatei.datei }),
    vorstufenBeleg: Object.freeze({ hash: vorstufenDatei.hash, datei: vorstufenDatei.datei })
  });
}

function liesKonfiguration(env = process.env, optionen = {}) {
  const formal = pruefeEingangsbelege(env, optionen);
  if (formal.azure.externeHerkunftBewiesen !== true
      || formal.azure.deploymentUndPreisExternBewiesen !== true) {
    throw new Z3bFachwegAbbruch(
      "Azure Bericht ist nur intern formal geprueft; externe Herkunft, Deployment und Preis sind offen",
      "herkunft-offen"
    );
  }
  if (formal.vorstufe.externeHerkunftBewiesen !== true
      || formal.vorstufe.codeUndMigrationsvollzugExternBewiesen !== true) {
    throw new Z3bFachwegAbbruch(
      "Production Beobachtung sowie Code und Migrationsvollzug sind nicht extern verifiziert",
      "herkunft-offen"
    );
  }
  // Dieser Zweig ist erst erreichbar, wenn ein spaeterer, vertrauenswuerdiger externer
  // Verifier die obigen Ergebnisse erzeugen kann. Der heutige Offline-Vertrag kann das nie.
  return Object.freeze({
    ...formal,
    ausgabe: neuesAusgabeverzeichnis(env.HELMUT_Z3B_FACHWEG_VERZEICHNIS)
  });
}

function starteKind(env) {
  return new Promise((resolve, reject) => {
    const kind = spawn(process.execPath, [LOKAL, "--", process.execPath, FACHWEG], {
      cwd: ROOT,
      env,
      stdio: "inherit"
    });
    kind.on("error", reject);
    kind.on("close", (code, signal) => resolve({ code, signal: signal || null }));
  });
}

function sichereSumme(werte, name) {
  let summe = 0;
  for (const wert of werte) {
    sichereGanzzahl(wert, name);
    summe += wert;
    if (!Number.isSafeInteger(summe) || summe > MAX_ZAEHLER) {
      throw new Z3bFachwegAbbruch(`${name} ist keine sichere Summe`, "fachweg-rot");
    }
  }
  return summe;
}

function pruefeKlassenZaehler(wert, name) {
  const z = nurSchluessel(wert, ["understanding", "lage", "buero", "sonstige"], name);
  return Object.freeze(Object.fromEntries(Object.keys(z).map((klasse) => [
    klasse, sichereGanzzahl(z[klasse], `${name}.${klasse}`)
  ])));
}

function erwarteteKriterienIds(ziel, fehlerMandat) {
  return Object.freeze([
    "Z0/aufbau", "Z0/tor", `Z0b/${ziel}`, `Z0c/${ziel}`, `Z0d/${ziel}`,
    `Z1/${ziel}`, `Z2/${ziel}`, `Z3/${ziel}`, `Z4/${ziel}`, `Z4b/${ziel}`,
    `Z4c/${ziel}`, `Z5/${ziel}`, `Z6/${ziel}`, `Z7/${ziel}`, `Z8/${ziel}`,
    `Z9/${ziel}`, `Z10/${ziel}`, `Z11/${ziel}`,
    ...(fehlerMandat ? [`Z12/${ziel}`] : []),
    `Z13/${ziel}`, `Z14/${ziel}`, `Z15/${ziel}`, `Z15b/${ziel}`, `Z16/${ziel}`,
    `Z17/${ziel}`, `Z17b/${ziel}`, `Z18/${ziel}`, `Z18b/${ziel}`, `Z19/${ziel}`,
    `Z20/${ziel}`, `Z20b/${ziel}`, `Z21/${ziel}`,
    ...(fehlerMandat ? [`Z22a/${ziel}`, `Z22/${ziel}`] : []),
    `Z23/${ziel}`
  ]);
}

function pruefeFachwegManifest(manifest, erwartung, { gitStandPruefen = true } = {}) {
  const m = nurSchluessel(manifest, [
    "schemaVersion", "modus", "laufKennung", "zielStufe", "fehlerMandatModus",
    "datenbank", "slots", "worker", "pipelineprofil", "quellenprofil", "kiProfil",
    "flags", "ersetzungen", "eingangsbelege", "simulationen", "git",
    "codeFingerabdruecke", "codebefund", "sha256"
  ], "Fachweg Manifest");
  if (!R.pruefeFachwegManifest(m, { gitStandPruefen })) {
    throw new Z3bFachwegAbbruch("Fachweg Manifest ist nicht gegen Code und Git pruefbar", "fachweg-rot");
  }
  const ziel = P.stufe(erwartung.ziel);
  const lauf = exakterText(erwartung.laufKennung, "erwartete Laufkennung", /^[a-z0-9]{6,32}$/);
  const fehlerModus = erwartung.fehlerMandat === true ? "an" : "aus";
  const eingang = objekt(m.eingangsbelege, "Manifest Eingangsbelege");
  if (m.zielStufe !== ziel || m.laufKennung !== lauf || m.fehlerMandatModus !== fehlerModus
      || m.kiProfil.modell !== erwartung.modell
      || eingang.azureMessberichtSha256 !== erwartung.azureBelegSha256
      || eingang.natuerlicherVorstufenberichtSha256 !== erwartung.vorstufenBelegSha256
      || (fehlerModus === "an"
        ? eingang.kontrollberichtSha256 !== erwartung.kontrollBelegSha256
        : eingang.kontrollberichtSha256 !== null)) {
    throw new Z3bFachwegAbbruch("Fachweg Manifest ist nicht an Ziel, Lauf, Modell und Eingangsbelege gebunden", "fachweg-rot");
  }
  return m;
}

function pruefeKiRohbeleg(roh, erwartung) {
  const r = nurSchluessel(roh, [
    "schemaVersion", "art", "zielMandate", "lokalerFachweg", "production",
    "synthetisch", "hochrechnung", "laufKennung", "manifestSha256", "gitSha",
    "fachwegtage", "gesamt", "kiEndpunktAufrufe", "messungVollstaendig",
    "klassenabdeckungVollstaendig", "tagesbedarfFormalStrukturiert",
    "kapazitaetsvertragVollstaendig", "entscheidungsgrundlageVollstaendig",
    "blocker", "fachwegBelegHash", "tagesbedarfsbericht"
  ], "Fachweg KI Rohbeleg");
  if (r.schemaVersion !== "z3b-fachweg-ki-rohbeleg-v1"
      || r.art !== "Z3b KI Rohzaehlung aus lokalem Fachweg"
      || r.zielMandate !== erwartung.ziel || r.lokalerFachweg !== true
      || r.production !== false || r.synthetisch !== true || r.hochrechnung !== false
      || r.laufKennung !== erwartung.laufKennung
      || r.manifestSha256 !== erwartung.manifestSha256
      || r.gitSha !== erwartung.gitSha || !GIT_SHA_RE.test(r.gitSha)) {
    throw new Z3bFachwegAbbruch("Fachweg KI Rohbeleg ist nicht an Ziel, Lauf, Manifest und Git gebunden", "fachweg-rot");
  }
  if (!Array.isArray(r.fachwegtage) || r.fachwegtage.length !== 2) {
    throw new Z3bFachwegAbbruch("Fachweg KI Rohbeleg braucht exakt zwei Tage", "fachweg-rot");
  }
  const tage = r.fachwegtage.map((wert, index) => {
    const tag = nurSchluessel(wert, [
      "tag", "slots", "messungVollstaendig", "aufrufe", "sonstige", "kiEndpunktAufrufe"
    ], `Fachweg KI Tag ${index + 1}`);
    const erwarteteSlots = index === 0 ? [1, 3] : [4, 6];
    if (tag.tag !== index + 1 || JSON.stringify(tag.slots) !== JSON.stringify(erwarteteSlots)
        || tag.messungVollstaendig !== true) {
      throw new Z3bFachwegAbbruch("Fachweg KI Tage sind nicht zwei vollstaendige Drei Slot Tage", "fachweg-rot");
    }
    const klassenRoh = nurSchluessel(tag.aufrufe, ["understanding", "lage", "buero"],
      `Fachweg KI Tag ${index + 1} Klassen`);
    const aufrufe = Object.freeze(Object.fromEntries(Object.entries(klassenRoh).map(([klasse, n]) => [
      klasse, sichereGanzzahl(n, `Fachweg KI Tag ${index + 1}.${klasse}`)
    ])));
    const sonstige = sichereGanzzahl(tag.sonstige, `Fachweg KI Tag ${index + 1}.sonstige`);
    const endpunkt = sichereGanzzahl(tag.kiEndpunktAufrufe,
      `Fachweg KI Tag ${index + 1}.kiEndpunktAufrufe`);
    if (sichereSumme([...Object.values(aufrufe), sonstige], "Fachweg KI Tagesaufrufe") !== endpunkt) {
      throw new Z3bFachwegAbbruch("Fachweg KI Tagesklassen stimmen nicht mit dem Endpunkt ueberein", "fachweg-rot");
    }
    return Object.freeze({ aufrufe, sonstige, endpunkt });
  });
  const gesamt = pruefeKlassenZaehler(r.gesamt, "Fachweg KI Gesamt");
  for (const klasse of ["understanding", "lage", "buero"]) {
    if (gesamt[klasse] !== sichereSumme(tage.map((tag) => tag.aufrufe[klasse]),
      `Fachweg KI Summe ${klasse}`)) {
      throw new Z3bFachwegAbbruch(`Fachweg KI Gesamtsumme ${klasse} ist widerspruechlich`, "fachweg-rot");
    }
  }
  if (gesamt.sonstige !== sichereSumme(tage.map((tag) => tag.sonstige), "Fachweg KI Summe sonstige")) {
    throw new Z3bFachwegAbbruch("Fachweg KI Gesamtsumme sonstige ist widerspruechlich", "fachweg-rot");
  }
  const endpunktGesamt = sichereGanzzahl(r.kiEndpunktAufrufe, "Fachweg KI Endpunktaufrufe");
  if (endpunktGesamt !== sichereSumme(tage.map((tag) => tag.endpunkt), "Fachweg KI Endpunktsumme")
      || endpunktGesamt !== sichereSumme(Object.values(gesamt), "Fachweg KI Klassensumme")) {
    throw new Z3bFachwegAbbruch("Fachweg KI Endpunkt und Klassen sind nicht deckungsgleich", "fachweg-rot");
  }
  if (!Array.isArray(r.blocker) || r.blocker.length > 20
      || r.blocker.some((wert, index) => {
        try {
          const blocker = nurSchluessel(wert, ["art", "grund", "detail"], `Fachweg KI Blocker ${index + 1}`);
          return typeof blocker.art !== "string" || typeof blocker.grund !== "string";
        } catch (_) { return true; }
      })) {
    throw new Z3bFachwegAbbruch("Fachweg KI Blockerliste ist nicht streng strukturiert", "fachweg-rot");
  }
  vollerSha256(r.fachwegBelegHash, "Fachweg KI Beleg Hash");
  const { fachwegBelegHash, tagesbedarfsbericht, ...hashBasis } = r;
  const nachgerechnet = crypto.createHash("sha256").update(JSON.stringify(hashBasis)).digest("hex");
  if (nachgerechnet !== fachwegBelegHash) {
    throw new Z3bFachwegAbbruch("Fachweg KI Rohbeleg Hash stimmt nicht mit dem Inhalt ueberein", "fachweg-rot");
  }
  if (gesamt.buero === 0) {
    const bueroBlocker = r.blocker.some((b) => b.art === "klassenabdeckung"
      && b.grund === "buero-im-queue-fachweg-nicht-ausgefuehrt");
    if (!bueroBlocker || r.klassenabdeckungVollstaendig !== false
        || r.tagesbedarfFormalStrukturiert !== false
        || r.kapazitaetsvertragVollstaendig !== false
        || r.entscheidungsgrundlageVollstaendig !== false
        || r.tagesbedarfsbericht !== null) {
      throw new Z3bFachwegAbbruch("Büro Nullbefund ist nicht ehrlich rot ausgewiesen", "fachweg-rot");
    }
    throw new Z3bFachwegAbbruch(
      "Büro wurde im Queue Fachweg nicht ausgefuehrt; kein Tagesbedarfsbericht und kein gruener Fachweg",
      "fachweg-rot"
    );
  }
  if (r.messungVollstaendig !== true || r.klassenabdeckungVollstaendig !== true
      || r.tagesbedarfFormalStrukturiert !== true
      || r.kapazitaetsvertragVollstaendig !== true
      || r.entscheidungsgrundlageVollstaendig !== true || r.blocker.length !== 0
      || r.tagesbedarfsbericht === null) {
    throw new Z3bFachwegAbbruch("Fachweg KI Vertrag ist nicht vollstaendig", "fachweg-rot");
  }
  let tagesbedarf;
  try { tagesbedarf = T.pruefeTagesbedarfBericht(r.tagesbedarfsbericht); }
  catch (fehler) { throw new Z3bFachwegAbbruch(fehler.message, "fachweg-rot"); }
  if (tagesbedarf.zielMandate !== erwartung.ziel
      || tagesbedarf.laufKennung !== erwartung.laufKennung
      || tagesbedarf.fachwegBelegHash !== fachwegBelegHash
      || tagesbedarf.gitSha !== erwartung.gitSha
      || tagesbedarf.fachwegtage.length !== 2) {
    throw new Z3bFachwegAbbruch("Tagesbedarfsbericht ist nicht an den Fachweg Rohbeleg gebunden", "fachweg-rot");
  }
  return Object.freeze({
    tage: Object.freeze(tage),
    gesamt,
    endpunktGesamt,
    fachwegBelegHash,
    tagesbedarf
  });
}

function pruefeFachwegBerichtInhalt(bericht, erwartung, { gitStandPruefen = true } = {}) {
  const b = nurSchluessel(bericht, [
    "stand", "erhoben", "fachwegManifest", "slotBudgetMs", "slotsJeTag", "parallel",
    "stapel", "kiDeckel", "kiHoechstzahl", "zeichenJeToken", "stufen", "kriterien",
    "pass", "fail", "befundOffen"
  ], "Fachweg Kindbericht");
  const ziel = P.stufe(erwartung.ziel);
  const laufKennung = exakterText(erwartung.laufKennung, "erwartete Laufkennung", /^[a-z0-9]{6,32}$/);
  const azureBelegSha256 = vollerSha256(erwartung.azureBelegSha256, "erwarteter Azure Beleg");
  const vorstufenBelegSha256 = vollerSha256(erwartung.vorstufenBelegSha256, "erwarteter Vorstufen Beleg");
  const kontrollBelegSha256 = erwartung.fehlerMandat === true
    ? vollerSha256(erwartung.kontrollBelegSha256, "erwarteter Kontrollbeleg") : null;
  if (b.stand !== "Z3a-teilnachweis-lokale-anbieter"
      || typeof b.erhoben !== "string" || !Number.isFinite(Date.parse(b.erhoben))
      || new Date(b.erhoben).toISOString() !== b.erhoben
      || b.slotBudgetMs !== 290000 || b.slotsJeTag !== 3 || b.parallel !== 4 || b.stapel !== 25
      || b.kiDeckel !== "offen" || b.kiHoechstzahl !== P.KI_AUFRUFLIMIT[ziel]
      || b.zeichenJeToken !== ZEICHEN_JE_TOKEN) {
    throw new Z3bFachwegAbbruch("Fachweg Kindbericht hat nicht den festen 200/500 Laufvertrag", "fachweg-rot");
  }
  const manifest = pruefeFachwegManifest(b.fachwegManifest, {
    ziel, laufKennung, modell: erwartung.modell, azureBelegSha256,
    vorstufenBelegSha256, kontrollBelegSha256,
    fehlerMandat: erwartung.fehlerMandat === true
  }, { gitStandPruefen });
  if (!Array.isArray(b.stufen) || b.stufen.length !== 1) {
    throw new Z3bFachwegAbbruch("Fachweg Kindbericht braucht genau eine Stufe", "fachweg-rot");
  }
  const m = nurSchluessel(b.stufen[0], [
    "mandate", "fehlerMandat", "vergleich", "auftraege", "erledigt", "fehlgeschlagen",
    "fremdeFehler", "fehlerMandatFehler", "kopplung", "konflikte", "echteDatenbankfehler",
    "vorgaengeOhneBeleg", "wartend", "laeuft", "haengendeLeases", "dubletten",
    "wiederholungen", "mehrfachAbschluss", "cas", "budgetKennzahlen", "fachwegKiRohbeleg",
    "rohdokumente", "vorgaenge", "kiProtokoll", "gesamtDauerMs", "langsamsterSlot", "slots",
    "slotBisGesund", "zeitfortschritte", "slotLaufzeit", "slotIntegritaetsfehler",
    "rueckstauJeSlot", "verbindungenSpitze", "verbindungenAktivSpitze", "maxVerbindungen",
    "slotDauern", "fairnessMin", "fairnessMax", "datenbank", "anbieter", "ki", "slotBilanzen"
  ], "Fachweg Stufenmessung");
  if (m.mandate !== ziel || (erwartung.fehlerMandat === true
    ? typeof m.fehlerMandat !== "string" || m.fehlerMandat.length < 6
    : m.fehlerMandat !== null)) {
    throw new Z3bFachwegAbbruch("Fachweg Stufe oder Fehlermandatsmodus ist nicht gebunden", "fachweg-rot");
  }
  if (erwartung.fehlerMandat === true) {
    const vergleich = nurSchluessel(m.vergleich,
      ["datei", "zurueckstellungen", "veraltetOffenGesund"], "Fachweg Kontrollvergleich");
    if (vergleich.datei !== erwartung.vergleichDatei) {
      throw new Z3bFachwegAbbruch("Fehlerlauf verweist nicht auf den gebundenen Kontrollbericht", "fachweg-rot");
    }
    sichereGanzzahl(vergleich.zurueckstellungen, "Kontrollvergleich Zurueckstellungen");
    if (vergleich.veraltetOffenGesund !== null) {
      sichereGanzzahl(vergleich.veraltetOffenGesund, "Kontrollvergleich Altbestand");
    }
  } else if (m.vergleich !== null) {
    throw new Z3bFachwegAbbruch("Kontrolllauf darf keinen Vergleich tragen", "fachweg-rot");
  }
  for (const feld of [
    "auftraege", "erledigt", "fehlgeschlagen", "fremdeFehler", "fehlerMandatFehler",
    "konflikte", "echteDatenbankfehler", "vorgaengeOhneBeleg", "wartend", "laeuft",
    "haengendeLeases", "dubletten", "wiederholungen", "mehrfachAbschluss", "rohdokumente",
    "vorgaenge", "kiProtokoll", "gesamtDauerMs", "langsamsterSlot", "slots",
    "verbindungenSpitze", "verbindungenAktivSpitze", "maxVerbindungen", "fairnessMin", "fairnessMax"
  ]) sichereGanzzahl(m[feld], `Fachweg Stufe ${feld}`);
  if (m.slots !== 6 || !Array.isArray(m.slotIntegritaetsfehler) || m.slotIntegritaetsfehler.length !== 0
      || !Array.isArray(m.slotDauern) || m.slotDauern.length !== 6
      || !Array.isArray(m.slotBilanzen) || m.slotBilanzen.length !== 6) {
    throw new Z3bFachwegAbbruch("Fachweg Stufe enthaelt nicht exakt sechs integre Slots", "fachweg-rot");
  }
  const dauern = m.slotDauern.map((wert, index) => sichereGanzzahl(wert,
    `Fachweg Slotdauer ${index + 1}`, { minimum: 1, maximum: 290000 }));
  const slotLaufzeit = nurSchluessel(m.slotLaufzeit, ["n", "p95", "max"], "Fachweg Slotlaufzeit");
  const sortierteDauern = [...dauern].sort((a, b) => a - b);
  const erwartetesP95 = sortierteDauern[Math.floor(0.95 * (sortierteDauern.length - 1))];
  if (slotLaufzeit.n !== 6 || !Number.isSafeInteger(slotLaufzeit.p95)
      || !Number.isSafeInteger(slotLaufzeit.max) || slotLaufzeit.p95 > 217500
      || slotLaufzeit.max > 280000 || slotLaufzeit.p95 !== erwartetesP95
      || slotLaufzeit.max !== Math.max(...dauern)) {
    throw new Z3bFachwegAbbruch("Fachweg Slotreserve ist nicht streng belegt", "fachweg-rot");
  }
  const slotKiKlassen = [];
  const slotEndpunkte = [];
  m.slotBilanzen.forEach((wert, index) => {
    const slot = nurSchluessel(wert, [
      "slot", "dauerMs", "planDauerMs", "arbeitDauerMs", "kindCode", "geplantNeu",
      "laufkennung", "fachwegLauf", "fachwegManifestSha256", "kiKlassen",
      "kiEndpunktKumulativ", "plan", "wiedervorlage", "outbox", "quittung", "integritaet",
      "erledigt", "zurueckgestellt", "wiederholt", "endgueltig", "zurueckstellGruende"
    ], `Fachweg Slotbilanz ${index + 1}`);
    if (slot.slot !== index + 1 || slot.dauerMs !== dauern[index] || slot.kindCode !== 0
        || slot.fachwegLauf !== laufKennung || slot.fachwegManifestSha256 !== manifest.sha256
        || typeof slot.laufkennung !== "string" || !slot.laufkennung.startsWith(`z3b-${laufKennung}-`)
        || !slot.integritaet || slot.integritaet.ok !== true) {
      throw new Z3bFachwegAbbruch("Fachweg Slotbilanz ist nicht an Lauf und Manifest gebunden", "fachweg-rot");
    }
    for (const feld of ["dauerMs", "planDauerMs", "arbeitDauerMs", "geplantNeu",
      "kiEndpunktKumulativ", "erledigt", "zurueckgestellt", "wiederholt", "endgueltig"]) {
      sichereGanzzahl(slot[feld], `Fachweg Slot ${index + 1}.${feld}`);
    }
    slotKiKlassen.push(pruefeKlassenZaehler(slot.kiKlassen,
      `Fachweg Slot ${index + 1} KI Klassen`));
    if (index > 0 && slot.kiEndpunktKumulativ < slotEndpunkte[index - 1]) {
      throw new Z3bFachwegAbbruch("Fachweg KI Endpunktstand faellt zwischen Slots", "fachweg-rot");
    }
    slotEndpunkte.push(slot.kiEndpunktKumulativ);
  });
  if (!Array.isArray(b.kriterien) || b.kriterien.length < 10 || b.kriterien.length > 128) {
    throw new Z3bFachwegAbbruch("Fachweg Kriterienliste ist nicht vollstaendig", "fachweg-rot");
  }
  const kriterien = b.kriterien.map((wert, index) => {
    const k = nurSchluessel(wert, ["id", "name", "ok", "detail", "art"], `Fachweg Kriterium ${index + 1}`);
    if (typeof k.id !== "string" || typeof k.name !== "string" || typeof k.detail !== "string"
        || typeof k.ok !== "boolean" || !new Set(["korrektheit", "kapazitaet"]).has(k.art)) {
      throw new Z3bFachwegAbbruch("Fachweg Kriterium ist nicht streng typisiert", "fachweg-rot");
    }
    return k;
  });
  if (new Set(kriterien.map((k) => k.id)).size !== kriterien.length) {
    throw new Z3bFachwegAbbruch("Fachweg Kriterien IDs sind nicht eindeutig", "fachweg-rot");
  }
  const erwarteteIds = erwarteteKriterienIds(ziel, erwartung.fehlerMandat === true);
  if (JSON.stringify(kriterien.map((k) => k.id)) !== JSON.stringify(erwarteteIds)
      || kriterien.some((k) => k.ok !== true)) {
    throw new Z3bFachwegAbbruch("Fachweg Kriterienfolge ist nicht exakt oder enthaelt einen roten Befund", "fachweg-rot");
  }
  const pass = kriterien.filter((k) => k.art === "korrektheit" && k.ok).length;
  const fail = kriterien.filter((k) => k.art === "korrektheit" && !k.ok).length;
  const befundOffen = kriterien.filter((k) => k.art === "kapazitaet" && !k.ok).length;
  if (sichereGanzzahl(b.pass, "Fachweg PASS", { maximum: 128 }) !== pass
      || sichereGanzzahl(b.fail, "Fachweg FAIL", { maximum: 128 }) !== fail || fail !== 0
      || sichereGanzzahl(b.befundOffen, "Fachweg offene Befunde", { maximum: 128 }) !== befundOffen
      || befundOffen !== 0) {
    throw new Z3bFachwegAbbruch("Fachweg Kriterien und Summen sind nicht vollstaendig gruen", "fachweg-rot");
  }
  const kiRohbeleg = pruefeKiRohbeleg(m.fachwegKiRohbeleg, {
    ziel, laufKennung, manifestSha256: manifest.sha256, gitSha: manifest.git.sha
  });
  for (let tagIndex = 0; tagIndex < 2; tagIndex += 1) {
    const von = tagIndex * 3;
    const bis = von + 3;
    const rohTag = kiRohbeleg.tage[tagIndex];
    for (const klasse of ["understanding", "lage", "buero"]) {
      const slotSumme = sichereSumme(slotKiKlassen.slice(von, bis).map((z) => z[klasse]),
        `Fachweg Slot KI Summe Tag ${tagIndex + 1}.${klasse}`);
      if (slotSumme !== rohTag.aufrufe[klasse]) {
        throw new Z3bFachwegAbbruch("Fachweg KI Rohbeleg stimmt nicht mit den sechs Slotbilanzen ueberein", "fachweg-rot");
      }
    }
    const sonstige = sichereSumme(slotKiKlassen.slice(von, bis).map((z) => z.sonstige),
      `Fachweg Slot KI Summe Tag ${tagIndex + 1}.sonstige`);
    const vorher = tagIndex === 0 ? 0 : slotEndpunkte[von - 1];
    const endpunkt = slotEndpunkte[bis - 1] - vorher;
    if (!Number.isSafeInteger(endpunkt) || endpunkt < 0
        || sonstige !== rohTag.sonstige || endpunkt !== rohTag.endpunkt) {
      throw new Z3bFachwegAbbruch("Fachweg KI Endpunktstaende stimmen nicht mit dem Rohbeleg ueberein", "fachweg-rot");
    }
  }
  return Object.freeze({ bericht: b, manifest, messung: m, kiRohbeleg });
}

function pruefeFachwegBericht(datei, erwartung, optionen = {}) {
  const name = erwartung.fehlerMandat ? "Fehlerlaufbericht" : "Kontrolllaufbericht";
  const beleg = liesJson(datei, name);
  const geprueft = pruefeFachwegBerichtInhalt(beleg.json, erwartung, optionen);
  return Object.freeze({ ...geprueft, hash: beleg.hash });
}

async function fuehreAus(konfiguration, env = process.env) {
  if (EXTERNE_STARTVERIFIER_AKTIV !== true) {
    throw new Z3bFachwegAbbruch(
      "Z3b Fachweg Prozessstart ist konstruktiv gesperrt, bis vertrauenswuerdige externe Azure, Production, Code und Migrationsverifier vorliegen",
      "herkunft-offen"
    );
  }
  const k = konfiguration;
  fs.mkdirSync(k.ausgabe, { recursive: false, mode: 0o700 });
  const kontrollBericht = path.join(k.ausgabe, "kontrolllauf.json");
  const kontrollLog = path.join(k.ausgabe, "kontrolllauf.log");
  const fehlerBericht = path.join(k.ausgabe, "fehlerlauf.json");
  const fehlerLog = path.join(k.ausgabe, "fehlerlauf.log");

  const kontrollEnv = P.kindUmgebung({
    env, zielStufe: k.ziel, laufKennung: k.lauf, azure: k.azure,
    azureBelegSha256: k.azureBeleg.hash,
    vorstufenBelegSha256: k.vorstufenBeleg.hash,
    berichtDatei: kontrollBericht, logDatei: kontrollLog, fehlerMandat: false
  });
  const kontrollProzess = await starteKind(kontrollEnv);
  if (kontrollProzess.code !== 0) {
    throw new Z3bFachwegAbbruch("Z3b Fachweg Kontrolllauf ist fehlgeschlagen", "fachweg-rot");
  }
  const kontroll = pruefeFachwegBericht(kontrollBericht, {
    ziel: k.ziel,
    laufKennung: k.lauf,
    modell: k.azure.modell,
    azureBelegSha256: k.azureBeleg.hash,
    vorstufenBelegSha256: k.vorstufenBeleg.hash,
    fehlerMandat: false
  });

  const fehlerEnv = P.kindUmgebung({
    env, zielStufe: k.ziel, laufKennung: k.lauf, azure: k.azure,
    azureBelegSha256: k.azureBeleg.hash,
    vorstufenBelegSha256: k.vorstufenBeleg.hash,
    berichtDatei: fehlerBericht, logDatei: fehlerLog,
    vergleichDatei: kontrollBericht, kontrollBelegSha256: kontroll.hash,
    fehlerMandat: true
  });
  const fehlerProzess = await starteKind(fehlerEnv);
  if (fehlerProzess.code !== 0) {
    throw new Z3bFachwegAbbruch("Z3b Fachweg Fehlerlauf ist fehlgeschlagen", "fachweg-rot");
  }
  const fehler = pruefeFachwegBericht(fehlerBericht, {
    ziel: k.ziel,
    laufKennung: k.lauf,
    modell: k.azure.modell,
    azureBelegSha256: k.azureBeleg.hash,
    vorstufenBelegSha256: k.vorstufenBeleg.hash,
    kontrollBelegSha256: kontroll.hash,
    vergleichDatei: kontrollBericht,
    fehlerMandat: true
  });

  const bericht = {
    art: "Z3b Fachwegmessung 200 oder 500",
    ergebnis: "vollstaendig-gruen",
    erhobenUtc: new Date().toISOString(),
    zielMandate: k.ziel,
    laufKennung: k.lauf,
    fachwege: 2,
    kontrolllaufOhneFehlermandat: true,
    fehlerlaufMitKontrollvergleich: true,
    echteFachhandler: true,
    datenbankweg: "lokales HTTP zu PostgREST zu PostgreSQL",
    quellenanbieter: "lokal-synthetisch",
    kiAnbieterImFachweg: "lokaler TLS Endpunkt mit konservativem Azure Laufzeitprofil",
    azureWaehrenDesFachwegsAufgerufen: false,
    productionDatenBeruehrt: false,
    productionBewiesen: false,
    hochrechnung: false,
    einordnung: "Vollstaendiger lokaler Fachwegnachweis der neuen Stufe, kein Production oder Anbieterlastnachweis",
    azureStichprobe: {
      belegHash: k.azureBeleg.hash,
      modell: k.azure.modell,
      deploymentart: k.azure.deploymentart,
      region: k.azure.region,
      endpointHash: k.azure.endpointHash,
      preisdatumUtc: k.azure.preisdatumUtc,
      preis: k.azure.preis,
      preisquelle: k.azure.preisquelle,
      lokalesKiProfil: k.azure.lokalesKiProfil,
      klassen: k.azure.klassen
    },
    natuerlichesVorstufentor: {
      belegHash: k.vorstufenBeleg.hash,
      vorstufe: k.vorstufe.vorstufe,
      vonDatumUtc: k.vorstufe.beobachtung.vonDatumUtc,
      bisDatumUtc: k.vorstufe.beobachtung.bisDatumUtc,
      tage: k.vorstufe.beobachtung.tage,
      ereignistransport: k.vorstufe.beobachtung.ereignistransport,
      slotplanSeparatEingebunden: k.vorstufe.beobachtung.slotplanSeparatEingebunden,
      gitSha: k.vorstufe.beobachtung.gitSha,
      deployment: k.vorstufe.beobachtung.deployment,
      migrationenSha256: k.vorstufe.beobachtung.migrationenSha256,
      externeHerkunftBewiesen: k.vorstufe.externeHerkunftBewiesen,
      codeUndMigrationsvollzugExternBewiesen: k.vorstufe.codeUndMigrationsvollzugExternBewiesen
    },
    kontrolllauf: { belegHash: kontroll.hash, manifestHash: kontroll.manifest.sha256,
      kiRohbelegHash: kontroll.kiRohbeleg.fachwegBelegHash, messung: kontroll.messung },
    fehlerlauf: { belegHash: fehler.hash, manifestHash: fehler.manifest.sha256,
      kiRohbelegHash: fehler.kiRohbeleg.fachwegBelegHash, messung: fehler.messung }
  };
  const gesamtDatei = path.join(k.ausgabe, "fachweg-gesamtbericht.json");
  fs.writeFileSync(gesamtDatei, `${JSON.stringify(bericht, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return Object.freeze({ bericht: Object.freeze(bericht), gesamtDatei });
}

function sichererFehler(fehler) {
  if (fehler instanceof Z3bFachwegAbbruch) {
    return Object.freeze({ grund: fehler.grund, nachricht: fehler.message });
  }
  return Object.freeze({
    grund: "interner-fehler",
    nachricht: "Z3b Fachweg wurde wegen eines internen Fehlers ohne Detailausgabe abgebrochen"
  });
}

async function main() {
  try {
    const konfiguration = liesKonfiguration();
    const ergebnis = await fuehreAus(konfiguration);
    process.stdout.write(`${JSON.stringify({
      art: ergebnis.bericht.art,
      ergebnis: ergebnis.bericht.ergebnis,
      zielMandate: ergebnis.bericht.zielMandate,
      gesamtbericht: ergebnis.gesamtDatei
    }, null, 2)}\n`);
  } catch (fehler) {
    process.stderr.write(`${JSON.stringify({
      art: "Z3b Fachwegmessung 200 oder 500",
      ergebnis: "abgebrochen",
      productionDatenBeruehrt: false,
      fehler: sichererFehler(fehler)
    }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  EXTERNE_STARTVERIFIER_AKTIV,
  Z3bFachwegAbbruch,
  liesJson,
  neuesAusgabeverzeichnis,
  pruefeEingangsbelege,
  liesKonfiguration,
  pruefeKiRohbeleg,
  pruefeFachwegBerichtInhalt,
  pruefeFachwegBericht,
  fuehreAus,
  sichererFehler
};
