"use strict";

// Reine Auswertung bereits erhobener, aggregierter Messwerte. Kein Netz, keine
// Datenbank, keine Umgebungsvariablen und keine Aktivierungsfunktion.

const crypto = require("crypto");
const { pruefeAzureBericht } = require("./z3b-azure-bericht");
const { pruefeTagesbedarfBericht } = require("./z3b-tagesbedarf-bericht");
const { pruefeProduktionsBeobachtung } = require("./z3b-production-beobachtung");

const KLASSEN = Object.freeze(["understanding", "lage", "buero"]);
const AKTIVIERUNGSSTUFEN = Object.freeze([10, 25, 50, 100, 200, 500]);
const VORSTUFE = Object.freeze({ 10: 5, 25: 10, 50: 25, 100: 50, 200: 100, 500: 200 });
const RESERVE_ANTEIL_STANDARD = 0.25;
const SLOT_BUDGET_MS_STANDARD = 290000;
const SLOT_STOP_MS_STANDARD = 280000;
const BEOBACHTUNGSTAGE_MIN = 7;
const AZURE_STICHPROBEN_JE_KLASSE_MIN = 7;
const TAG_MS = 24 * 60 * 60 * 1000;
const KI_GLOBAL_ANTEIL_STANDARD = 0.5;
const BUDGET_AUFGABENFRIST_STUNDEN = 48;
const KAPAZITAETSBERICHT_VERSION = "z3b-ki-kapazitaet-v2";
const KOSTENRAHMEN_VERSION = "z3b-betreiber-kostenrahmen-v1";
const KOSTENRAHMEN_STATUS_FORMAL = "formal-strukturiert";

function endlicheZahl(wert, name, { nullErlaubt = false, minimum = 0 } = {}) {
  if (nullErlaubt && wert === undefined) return null;
  if (typeof wert !== "number" || !Number.isFinite(wert) || wert < minimum) {
    throw new Error(`${name} ist keine endliche Zahl`);
  }
  return wert;
}

function sichereGanzzahl(wert, name, { minimum = 0 } = {}) {
  const zahl = endlicheZahl(wert, name, { minimum });
  if (!Number.isSafeInteger(zahl)) throw new Error(`${name} ist keine sichere Ganzzahl`);
  return zahl;
}

function sichereSumme(werte, name) {
  const summe = werte.reduce((gesamt, wert) => gesamt + wert, 0);
  if (!Number.isSafeInteger(summe)) throw new Error(`${name} ist keine sichere Ganzzahlsumme`);
  return summe;
}

function sicheresProdukt(links, rechts, name) {
  const produkt = links * rechts;
  if (!Number.isSafeInteger(produkt)) throw new Error(`${name} ist kein sicheres Ganzzahlprodukt`);
  return produkt;
}

function nurSchluessel(wert, erlaubt, name) {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) throw new Error(`${name} fehlt`);
  const fremd = Object.keys(wert).filter((feld) => !erlaubt.includes(feld));
  const fehlt = erlaubt.filter((feld) => !(feld in wert));
  if (fremd.length) throw new Error(`${name} enthaelt unbekannte Felder: ${fremd.join(", ")}`);
  if (fehlt.length) throw new Error(`${name} fehlt: ${fehlt.join(", ")}`);
  return wert;
}

function reserveAnteil(wert) {
  const anteil = endlicheZahl(wert, "Reserveanteil");
  if (anteil !== RESERVE_ANTEIL_STANDARD) {
    throw new Error(`Reserveanteil muss bis zu einer extern belegten Production Konfiguration fest ${RESERVE_ANTEIL_STANDARD} sein`);
  }
  return anteil;
}

function globalAnteil(wert = KI_GLOBAL_ANTEIL_STANDARD) {
  const anteil = endlicheZahl(wert, "KI Globalanteil");
  if (anteil !== KI_GLOBAL_ANTEIL_STANDARD) {
    throw new Error(`KI Globalanteil muss bis zu einer extern belegten Production Konfiguration fest ${KI_GLOBAL_ANTEIL_STANDARD} sein`);
  }
  return anteil;
}

function mandatsPlaetzeJeTag(deckel, anteil) {
  return deckel - Math.floor(deckel * anteil);
}

// Kleinster ganzzahliger Gesamtdeckel, dessen Mandatstopf bei der tatsaechlichen
// Fairnessaufteilung jedes aktive Mandat einmal pro Tag bedienen kann. Beim heutigen
// Standardanteil 0,5 ergibt das exakt 2n-1 (500 Mandate -> 999), nicht 2n.
function erforderlicherDeckelFuerTaeglicheMandate(aktiveMandate, anteil = KI_GLOBAL_ANTEIL_STANDARD) {
  const mandate = sichereGanzzahl(aktiveMandate, "aktive Mandate", { minimum: 1 });
  const global = globalAnteil(anteil);
  let unten = 0;
  let oben = Math.max(1, mandate);
  while (mandatsPlaetzeJeTag(oben, global) < mandate) {
    oben *= 2;
    if (!Number.isSafeInteger(oben)) throw new Error("Fairness Mindestdeckel ist keine sichere Ganzzahl");
  }
  while (unten + 1 < oben) {
    const mitte = Math.floor((unten + oben) / 2);
    if (mandatsPlaetzeJeTag(mitte, global) >= mandate) oben = mitte;
    else unten = mitte;
  }
  return oben;
}

// Reine Kapazitaetsrechnung des bestehenden `llm-budget-fair.tagesplan`-Vertrags.
// Sie setzt keinen Deckel und trifft keine Produktentscheidung. `bestanden` bedeutet hier
// bewusst TAeGLICHE Bedienung: eine faire Rotation nach mehreren Tagen verhindert zwar
// dauerhaftes Verhungern, liefert aber kein taegliches Mandatsnarrativ.
function bewerteMandatsrotation({ aktiveMandate, deckel,
  globalAnteil: globalAnteilWert = KI_GLOBAL_ANTEIL_STANDARD,
  aufgabenfristStunden = BUDGET_AUFGABENFRIST_STUNDEN } = {}) {
  const mandate = sichereGanzzahl(aktiveMandate, "aktive Mandate", { minimum: 1 });
  const gesamtdeckel = sichereGanzzahl(deckel, "KI Tagesdeckel", { minimum: 1 });
  const frist = endlicheZahl(aufgabenfristStunden, "Budget Aufgabefrist", { minimum: 1 });
  const global = globalAnteil(globalAnteilWert);
  const mandatsPlaetze = mandatsPlaetzeJeTag(gesamtdeckel, global);
  const rotationsTage = Math.ceil(mandate / mandatsPlaetze);
  const rotationsStunden = rotationsTage * 24;
  const taeglichVollstaendig = mandatsPlaetze >= mandate;
  const erforderlicherTagesdeckel = erforderlicherDeckelFuerTaeglicheMandate(mandate, global);
  return Object.freeze({
    bestanden: taeglichVollstaendig,
    aktiveMandate: mandate,
    deckel: gesamtdeckel,
    globalAnteil: global,
    globalTopf: Math.floor(gesamtdeckel * global),
    mandatsPlaetze,
    rotationsTage,
    rotationsStunden,
    aufgabenfristStunden: frist,
    // Gleichstand hat keine Reserve gegen Slotverzug und gilt deshalb nicht als sicher.
    aufgabenfristSicher: rotationsStunden < frist,
    taeglichVollstaendig,
    erforderlicherTagesdeckel
  });
}

function jeKlasse(objekt, name, pruefung) {
  if (!objekt || typeof objekt !== "object" || Array.isArray(objekt)) throw new Error(`${name} fehlt`);
  const fremd = Object.keys(objekt).filter((klasse) => !KLASSEN.includes(klasse));
  if (fremd.length) throw new Error(`${name} enthaelt unbekannte Arbeitsformen`);
  const ergebnis = {};
  for (const klasse of KLASSEN) {
    if (!(klasse in objekt)) throw new Error(`${name} fehlt fuer ${klasse}`);
    ergebnis[klasse] = pruefung(objekt[klasse], `${name}.${klasse}`);
  }
  return Object.freeze(ergebnis);
}

function rundeUsd(wert) {
  if (typeof wert !== "number" || !Number.isFinite(wert)) throw new Error("Kostenrechnung ist nicht endlich");
  const gerundet = Math.round(wert * 1e8) / 1e8;
  if (!Number.isFinite(gerundet)) throw new Error("Kostenrechnung ist nicht endlich");
  return gerundet;
}

function kanonisch(wert) {
  if (wert === null) return "null";
  if (typeof wert === "number") {
    if (!Number.isFinite(wert)) throw new Error("Nicht endliche Zahl kann nicht kanonisiert werden");
    return JSON.stringify(wert);
  }
  if (typeof wert === "string" || typeof wert === "boolean") return JSON.stringify(wert);
  if (["undefined", "function", "symbol", "bigint"].includes(typeof wert)) {
    throw new Error("Nicht kanonisierbarer Wert");
  }
  if (Array.isArray(wert)) {
    for (let index = 0; index < wert.length; index += 1) {
      if (!(index in wert)) throw new Error("Arrayluecke ist nicht kanonisierbar");
    }
    return `[${wert.map(kanonisch).join(",")}]`;
  }
  if (!wert || Object.getPrototypeOf(wert) !== Object.prototype) {
    throw new Error("Nur einfache JSON Objekte sind kanonisierbar");
  }
  return `{${Object.keys(wert).sort().map((name) =>
    `${JSON.stringify(name)}:${kanonisch(wert[name])}`).join(",")}}`;
}

function inhaltFingerabdruck(wert) {
  return crypto.createHash("sha256").update(kanonisch(wert)).digest("hex");
}

function datumUtc(wert, name) {
  if (typeof wert !== "string") throw new Error(`${name} ist kein UTC Kalenderdatum`);
  const text = wert;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${name} ist kein UTC Kalenderdatum`);
  const zeit = Date.parse(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(zeit) || new Date(zeit).toISOString().slice(0, 10) !== text) {
    throw new Error(`${name} ist kein gueltiges UTC Kalenderdatum`);
  }
  return Object.freeze({ text, zeit });
}

function berechneKiDeckel({ tagesbedarfsbericht, azureBericht, heuteUtc, jetztUtc,
  reserve = RESERVE_ANTEIL_STANDARD,
  globalAnteil: globalAnteilWert = KI_GLOBAL_ANTEIL_STANDARD } = {}) {
  const reserveWert = reserveAnteil(reserve);
  const global = globalAnteil(globalAnteilWert);
  if (reserveWert !== RESERVE_ANTEIL_STANDARD) {
    throw new Error(`Kapazitaetsreserve muss fest ${RESERVE_ANTEIL_STANDARD} sein`);
  }
  if (global !== KI_GLOBAL_ANTEIL_STANDARD) {
    throw new Error(`KI Globalanteil muss bis zu einem extern belegten Production Wert fest ${KI_GLOBAL_ANTEIL_STANDARD} sein`);
  }
  const bedarfsBeleg = pruefeTagesbedarfBericht(tagesbedarfsbericht);
  const azureOptionen = {};
  if (heuteUtc !== undefined) azureOptionen.heuteUtc = heuteUtc;
  if (jetztUtc !== undefined) azureOptionen.jetzt = jetztUtc;
  const azureBeleg = pruefeAzureBericht(azureBericht, azureOptionen);
  const mandate = bedarfsBeleg.zielMandate;
  const bedarf = bedarfsBeleg.beobachteteKlassenTagesmaxima;
  const azureWerte = azureBeleg.klassen;
  const inputPreis = azureBeleg.preis.inputUsdJeMio;
  const outputPreis = azureBeleg.preis.outputUsdJeMio;

  const gesamtAufrufeAusBeobachtetenKlassenTagesmaxima = sichereSumme(
    KLASSEN.map((klasse) => bedarf[klasse]),
    "Gesamtaufrufe aus Klassen Tagesmaxima"
  );
  if (gesamtAufrufeAusBeobachtetenKlassenTagesmaxima <= 0) {
    throw new Error("Tagesbedarf ist insgesamt null");
  }
  const nutzbarerAnteil = 1 - reserveWert;
  const deckelAusBeobachtetenKlassenTagesmaxima = Math.ceil(
    gesamtAufrufeAusBeobachtetenKlassenTagesmaxima / nutzbarerAnteil
  );
  if (!Number.isSafeInteger(deckelAusBeobachtetenKlassenTagesmaxima)) {
    throw new Error("Deckel aus Klassen Tagesmaxima ist keine sichere Ganzzahl");
  }
  const fairnessMindestdeckel = erforderlicherDeckelFuerTaeglicheMandate(mandate, global);
  const empfohlenerGesamtdeckel = Math.max(
    deckelAusBeobachtetenKlassenTagesmaxima, fairnessMindestdeckel
  );
  const empfohleneUnderstandingReserve = Math.min(
    empfohlenerGesamtdeckel,
    Math.ceil(bedarf.understanding / nutzbarerAnteil)
  );
  const nichtPriorisierteKapazitaet = empfohlenerGesamtdeckel - empfohleneUnderstandingReserve;
  for (const [name, wert] of Object.entries({
    empfohlenerGesamtdeckel, empfohleneUnderstandingReserve, nichtPriorisierteKapazitaet
  })) {
    if (!Number.isSafeInteger(wert)) throw new Error(`${name} ist keine sichere Ganzzahl`);
  }

  const inputTokensSchaetzungAusP95JeAufrufProTag = sichereSumme(KLASSEN.map((klasse) =>
    sicheresProdukt(bedarf[klasse], azureWerte[klasse].inputTokensP95,
      `Input Tokenprodukt ${klasse}`)), "Input Tokenschaetzung");
  const outputTokensSchaetzungAusP95JeAufrufProTag = sichereSumme(KLASSEN.map((klasse) =>
    sicheresProdukt(bedarf[klasse], azureWerte[klasse].outputTokensP95,
      `Output Tokenprodukt ${klasse}`)), "Output Tokenschaetzung");
  const kostenP95SchaetzungProTagUsd =
    (inputTokensSchaetzungAusP95JeAufrufProTag / 1e6) * inputPreis
    + (outputTokensSchaetzungAusP95JeAufrufProTag / 1e6) * outputPreis;
  const teuerstesBeobachtetesMaxTokenSzenarioUsd = Math.max(...KLASSEN.map((klasse) =>
    (azureWerte[klasse].inputTokensMax / 1e6) * inputPreis
      + (azureWerte[klasse].outputTokensMax / 1e6) * outputPreis));

  const azureInhaltsfingerabdruck = inhaltFingerabdruck(azureBericht);
  const tagesbedarfInhaltsfingerabdruck = inhaltFingerabdruck(tagesbedarfsbericht);

  return Object.freeze({
    schemaVersion: KAPAZITAETSBERICHT_VERSION,
    art: "Z3b KI Kapazitaets Formalrechnung aus intern nachgerechneten Angaben",
    ergebnis: "formalrechnung-fachweg-herkunft-deployment-preis-und-kostenstopp-offen",
    beweisart: "Reine Formalrechnung; weder vollstaendiger Fachweg Gesamtbericht noch externe Herkunft, Deployment, Preis oder Kostenstopp sind bewiesen; kein Lastnachweis und keine Freigabe",
    reserveAnteil: reserveWert,
    aktiveMandate: mandate,
    globalAnteil: global,
    gesamtAufrufeAusBeobachtetenKlassenTagesmaxima,
    deckelAusBeobachtetenKlassenTagesmaxima,
    fairnessMindestdeckel,
    empfohlenerGesamtdeckel,
    empfohleneUnderstandingReserve,
    nichtPriorisierteKapazitaet,
    inputTokensSchaetzungAusP95JeAufrufProTag,
    outputTokensSchaetzungAusP95JeAufrufProTag,
    kostenP95SchaetzungProTagUsd: rundeUsd(kostenP95SchaetzungProTagUsd),
    kostenSzenarioBeobachteteMaxTokensBeiVollemDeckelUsd:
      rundeUsd(teuerstesBeobachtetesMaxTokenSzenarioUsd * empfohlenerGesamtdeckel),
    harteKostenobergrenze: Object.freeze({
      status: "offen",
      usd: null,
      grund: "Keine belegte Production Tokenhartgrenze je Aufruf"
    }),
    preis: azureBeleg.preis,
    preisquelle: azureBeleg.preisquelle,
    beobachteteKlassenTagesmaxima: bedarf,
    azure: azureWerte,
    azureBeleg: Object.freeze({
      inhaltsfingerabdruck: azureInhaltsfingerabdruck,
      laufKennung: azureBeleg.laufKennung,
      modell: azureBeleg.modell,
      deployment: azureBeleg.deployment,
      deploymentart: azureBeleg.deploymentart,
      region: azureBeleg.region,
      endpointHash: azureBeleg.endpointHash,
      erhobenUtc: azureBeleg.erhobenUtc,
      beendetUtc: azureBeleg.beendetUtc,
      einzelmessungenSha256: azureBeleg.einzelmessungenSha256,
      preisdatumUtc: azureBeleg.preisdatumUtc
    }),
    tagesbedarfBeleg: Object.freeze({
      inhaltsfingerabdruck: tagesbedarfInhaltsfingerabdruck,
      schemaVersion: bedarfsBeleg.schemaVersion,
      laufKennung: bedarfsBeleg.laufKennung,
      fachwegBelegHash: bedarfsBeleg.fachwegBelegHash,
      gitSha: bedarfsBeleg.gitSha,
      fachwegtage: bedarfsBeleg.fachwegtage.length
    }),
    beleggrenzen: Object.freeze({
      azureBerichtNurFormalValidiert: true,
      tagesbedarfNurFormalValidiert: true,
      azureAggregateAusEinzelmessungenNachgerechnet: true,
      azureDeploymentUndPreisExternBewiesen: false,
      fachwegGesamtberichtInternNachgeprueft: false,
      externeHerkunftBewiesen: false,
      entscheidungsgrundlageVollstaendig: false,
      grund: "Fachweg Gesamtbericht, Azure Herkunft, Deployment, Preis und wirksamer Kostenstopp sind nicht extern gebunden"
    })
  });
}

function bewerteSlot({ p95Ms, maxMs, budgetMs = SLOT_BUDGET_MS_STANDARD,
  stopMs = SLOT_STOP_MS_STANDARD,
  reserve = RESERVE_ANTEIL_STANDARD } = {}) {
  const reserveWert = reserveAnteil(reserve);
  const p95 = endlicheZahl(p95Ms, "Slot p95", { minimum: 1 });
  const maximum = endlicheZahl(maxMs, "Slot Maximum", { minimum: p95 });
  const budget = endlicheZahl(budgetMs, "Slotbudget", { minimum: 1 });
  const stop = endlicheZahl(stopMs, "Slot Stopgrenze", { minimum: 1 });
  if (stop > budget) throw new Error("Slot Stopgrenze darf nicht ueber dem Slotbudget liegen");
  const grenzeMitReserveMs = Math.floor(budget * (1 - reserveWert));
  const gruende = [];
  if (p95 > grenzeMitReserveMs) gruende.push("p95 hat nicht die geforderte Laufzeitreserve");
  if (maximum > stop) gruende.push("Maximum ueberschreitet die betriebliche Stopgrenze");
  return Object.freeze({
    bestanden: gruende.length === 0,
    p95Ms: p95,
    maxMs: maximum,
    budgetMs: budget,
    stopMs: stop,
    reserveAnteil: reserveWert,
    grenzeMitReserveMs,
    gruende: Object.freeze(gruende)
  });
}

function bewerteBeobachtung(tage) {
  if (!Array.isArray(tage) || tage.length < BEOBACHTUNGSTAGE_MIN) {
    throw new Error(`Es werden mindestens ${BEOBACHTUNGSTAGE_MIN} vollstaendige Tage benoetigt`);
  }
  for (let index = 0; index < tage.length; index += 1) {
    if (!(index in tage)) throw new Error(`Beobachtungstage enthalten eine Arrayluecke bei Position ${index + 1}`);
  }
  const fehlerhafteTage = [];
  let ankunft = 0;
  let abfluss = 0;
  let vorherigesDatum = null;
  let ersteAktivstufe = null;
  let einheitlicheAktivstufe = true;
  const daten = [];
  tage.forEach((tag, index) => {
    const datum = datumUtc(tag && tag.datumUtc, `Tag ${index + 1} Datum`);
    if (vorherigesDatum !== null && datum.zeit !== vorherigesDatum + TAG_MS) {
      throw new Error("Beobachtungstage muessen lueckenlos und chronologisch aufeinanderfolgen");
    }
    vorherigesDatum = datum.zeit;
    daten.push(datum.text);
    const aktiveMandate = sichereGanzzahl(tag && tag.aktiveMandate,
      `Tag ${index + 1} aktive Mandate`, { minimum: 1 });
    if (ersteAktivstufe === null) ersteAktivstufe = aktiveMandate;
    if (aktiveMandate !== ersteAktivstufe) einheitlicheAktivstufe = false;
    const a = sichereGanzzahl(tag && tag.ankunft, `Tag ${index + 1} Ankunft`, { minimum: 0 });
    const b = sichereGanzzahl(tag && tag.abfluss, `Tag ${index + 1} Abfluss`, { minimum: 0 });
    const alter = endlicheZahl(tag && tag.aeltesterOffenerStunden,
      `Tag ${index + 1} Alter`, { nullErlaubt: true, minimum: 0 });
    const unbekannt = sichereGanzzahl(tag && tag.unbekannt, `Tag ${index + 1} unbekannt`, { minimum: 0 });
    const dubletten = sichereGanzzahl(tag && tag.dubletten, `Tag ${index + 1} Dubletten`, { minimum: 0 });
    const leases = sichereGanzzahl(tag && tag.haengendeLeases, `Tag ${index + 1} Leases`, { minimum: 0 });
    const fehler = sichereGanzzahl(tag && tag.endgueltigeFehler, `Tag ${index + 1} Fehler`, { minimum: 0 });
    const briefingFehlt = sichereGanzzahl(tag && tag.briefingFehlt, `Tag ${index + 1} Briefing`, { minimum: 0 });
    const gruende = [];
    if (!tag || tag.vollstaendig !== true) gruende.push("Kalendertag ist nicht vollstaendig");
    if (aktiveMandate !== ersteAktivstufe) gruende.push("aktive Mandatsstufe wechselte im Beobachtungsfenster");
    if (b < a) gruende.push("Abfluss kleiner Ankunft");
    if (alter !== null && alter >= 24) gruende.push("offene Arbeit mindestens 24 Stunden alt");
    if (unbekannt) gruende.push("unbekannte Auftraege");
    if (dubletten) gruende.push("Dubletten");
    if (leases) gruende.push("haengende Leases");
    if (fehler) gruende.push("endgueltige Fehler");
    if (briefingFehlt) gruende.push("fehlende Briefings");
    if (tag && tag.kiDeckelErreicht === true) gruende.push("KI Deckel erreicht");
    if (gruende.length) fehlerhafteTage.push(Object.freeze({ tag: index + 1, gruende: Object.freeze(gruende) }));
    ankunft += a;
    abfluss += b;
    if (!Number.isSafeInteger(ankunft) || !Number.isSafeInteger(abfluss)) {
      throw new Error("Beobachtungszaehler sind keine sicheren Ganzzahlsummen");
    }
  });
  return Object.freeze({
    bestanden: fehlerhafteTage.length === 0,
    tage: tage.length,
    vonDatumUtc: daten[0],
    bisDatumUtc: daten[daten.length - 1],
    aktiveMandate: einheitlicheAktivstufe ? ersteAktivstufe : null,
    ankunft,
    abfluss,
    fehlerhafteTage: Object.freeze(fehlerhafteTage)
  });
}

function erforderlicheMessstufe(zielMandate) {
  const ziel = sichereGanzzahl(zielMandate, "Aktivierungsstufe", { minimum: 1 });
  if (!AKTIVIERUNGSSTUFEN.includes(ziel)) throw new Error("Unbekannte Aktivierungsstufe");
  return ziel === 10 ? 25 : ziel;
}

function pruefeKapazitaetsbericht({ bericht, belege, heuteUtc, jetztUtc } = {}) {
  if (!bericht || typeof bericht !== "object" || Array.isArray(bericht)
      || bericht.schemaVersion !== KAPAZITAETSBERICHT_VERSION) {
    throw new Error("KI Kapazitaetsbericht fehlt oder hat die falsche Version");
  }
  nurSchluessel(belege, ["azureBericht", "tagesbedarfsbericht"], "KI Kapazitaetsbelege");
  const nachgerechnet = berechneKiDeckel({
    azureBericht: belege.azureBericht,
    tagesbedarfsbericht: belege.tagesbedarfsbericht,
    heuteUtc,
    jetztUtc
  });
  if (inhaltFingerabdruck(bericht) !== inhaltFingerabdruck(nachgerechnet)) {
    throw new Error("KI Kapazitaetsbericht stimmt nicht mit den intern nachgeprueften Belegen ueberein");
  }
  return nachgerechnet;
}

function pruefeBetreiberKostenrahmen(rahmen, kapazitaet) {
  const r = nurSchluessel(rahmen, [
    "schemaVersion", "status", "zielMandate", "waehrung", "maxUsdProTag",
    "kostenstoppWirksam", "harteTokenobergrenzeOffenBestaetigt",
    "kapazitaetsberichtHash", "kostenstoppBelegHash", "freigabeKennung"
  ], "Betreiber Kostenrahmen");
  if (r.schemaVersion !== KOSTENRAHMEN_VERSION
      || rahmen.status !== KOSTENRAHMEN_STATUS_FORMAL) {
    throw new Error("Betreiber Kostenrahmen fehlt oder ist nicht formal strukturiert");
  }
  const ziel = sichereGanzzahl(rahmen.zielMandate, "Kostenrahmen Zielstufe", { minimum: 1 });
  const maxUsdProTag = endlicheZahl(rahmen.maxUsdProTag, "Kostenrahmen Tagesbetrag", { minimum: 0.00000001 });
  const kapazitaetsberichtHash = inhaltFingerabdruck(kapazitaet);
  if (ziel !== kapazitaet.aktiveMandate
      || rahmen.waehrung !== "USD"
      || rahmen.kostenstoppWirksam !== true
      || rahmen.harteTokenobergrenzeOffenBestaetigt !== true
      || typeof rahmen.kapazitaetsberichtHash !== "string"
      || rahmen.kapazitaetsberichtHash !== kapazitaetsberichtHash
      || typeof rahmen.kostenstoppBelegHash !== "string"
      || !/^[a-f0-9]{64}$/.test(rahmen.kostenstoppBelegHash)
      || typeof rahmen.freigabeKennung !== "string"
      || rahmen.freigabeKennung
        !== `z3b-kosten:${ziel}:${kapazitaetsberichtHash}`) {
    throw new Error("Betreiber Kostenrahmen ist nicht zielbezogen und formal strukturiert");
  }
  if (maxUsdProTag < kapazitaet.kostenSzenarioBeobachteteMaxTokensBeiVollemDeckelUsd) {
    throw new Error("Betreiber Kostenrahmen liegt unter dem beobachteten Max Token Szenario");
  }
  return Object.freeze({
    schemaVersion: KOSTENRAHMEN_VERSION,
    status: "strukturell-geprueft-externe-wirksamkeit-offen",
    zielMandate: ziel,
    waehrung: "USD",
    maxUsdProTag,
    kapazitaetsberichtHash,
    angegebenerKostenstoppBelegHash: rahmen.kostenstoppBelegHash,
    angegebeneFreigabeKennung: rahmen.freigabeKennung,
    kostenstoppKonfigurationFormalAngegeben: true,
    harteTokenobergrenzeOffenFormalBestaetigt: true,
    kostenstoppExternBewiesen: false,
    wirksamkeitExternBewiesen: false,
    beweisgrenze: "Hash, Kennung und Boolean belegen ohne vertrauenswuerdige externe Pruefung keinen wirksamen Kostenstopp"
  });
}

function bewerteEntscheidungsreife({ zielMandate, vorherigeAktivstufe, fachwegGemessenBis,
  supabaseGemessenBis, supabaseFehler = 0, kapazitaetsbericht, kapazitaetsbelege,
  betreiberKostenrahmen, kiDeckelKonfiguriert, kiGlobalAnteilKonfiguriert,
  kiUnderstandingReserveKonfiguriert, produktionsBeobachtungsbericht,
  vertrauenswuerdigeSlotIds, codeUndMigrationen = {}, heuteUtc, jetztUtc } = {}) {
  const ziel = sichereGanzzahl(zielMandate, "Zielmandate", { minimum: 1 });
  const messstufe = erforderlicheMessstufe(ziel);
  const gruende = [];
  if (typeof vorherigeAktivstufe !== "number" || !Number.isSafeInteger(vorherigeAktivstufe)
      || vorherigeAktivstufe !== VORSTUFE[ziel]) gruende.push("vorherige Aktivstufe stimmt nicht");
  const fachwegStand = fachwegGemessenBis;
  if (typeof fachwegStand !== "number" || !Number.isSafeInteger(fachwegStand) || fachwegStand < 0) {
    gruende.push("voller Fachweg hat keinen gueltigen Messstand");
  } else if (fachwegStand < messstufe) {
    gruende.push(`voller Fachweg nicht bis ${messstufe} gemessen`);
  }
  gruende.push("voller Fachweg Messstand hat keinen zielgebundenen extern verifizierten Herkunftsbericht");
  const supabaseStand = supabaseGemessenBis;
  if (typeof supabaseStand !== "number" || !Number.isSafeInteger(supabaseStand) || supabaseStand < 0) {
    gruende.push("Supabase hat keinen gueltigen Messstand");
  } else if (supabaseStand < messstufe) {
    gruende.push(`Supabase nicht bis ${messstufe} gemessen`);
  }
  if (typeof supabaseFehler !== "number" || !Number.isSafeInteger(supabaseFehler)) {
    gruende.push("Supabase Fehlerzahl ist keine sichere Ganzzahl");
  } else if (supabaseFehler !== 0) {
    gruende.push("Supabase Probe hatte Fehler");
  }
  gruende.push("Supabase Messstand hat keinen zielgebundenen extern verifizierten Herkunftsbericht");

  let kapazitaet = null;
  try {
    kapazitaet = pruefeKapazitaetsbericht({
      bericht: kapazitaetsbericht, belege: kapazitaetsbelege, heuteUtc, jetztUtc
    });
    if (kapazitaet.aktiveMandate !== ziel) throw new Error("Kapazitaetsbericht hat die falsche Zielstufe");
  } catch (_) {
    kapazitaet = null;
    gruende.push("KI Kapazitaetsbericht ist nicht intern nachgeprueft");
  }
  if (kapazitaet) {
    gruende.push("Tagesbedarfsbericht ist nur formal validiert; der Fachweg Gesamtbericht wurde nicht mitgeliefert und nachgeprueft");
  }
  let kostenrahmen = null;
  if (kapazitaet) {
    try { kostenrahmen = pruefeBetreiberKostenrahmen(betreiberKostenrahmen, kapazitaet); }
    catch (_) { gruende.push("Betreiber Kostenrahmen ist nicht einmal strukturell nachgeprueft"); }
  } else {
    gruende.push("Betreiber Kostenrahmen kann ohne Kapazitaetsbericht nicht strukturell nachgeprueft werden");
  }
  gruende.push("Betreiber Kostenrahmen ist hoechstens strukturell geprueft; ein vertrauenswuerdiger externer Kostenstoppbeleg fehlt");

  const empfohlen = kapazitaet ? kapazitaet.empfohlenerGesamtdeckel : null;
  const reserveEmpfohlen = kapazitaet ? kapazitaet.empfohleneUnderstandingReserve : null;
  const konfiguriert = endlicheZahl(kiDeckelKonfiguriert, "konfigurierter KI Deckel", { nullErlaubt: true, minimum: 1 });
  const reserveKonfiguriert = endlicheZahl(kiUnderstandingReserveKonfiguriert,
    "konfigurierte Understanding Reserve", { nullErlaubt: true, minimum: 0 });
  if (konfiguriert === null || empfohlen === null || konfiguriert < empfohlen) {
    gruende.push("KI Deckel ist noch nicht ausreichend freigegeben und gesetzt");
  }
  if (konfiguriert !== null && !Number.isSafeInteger(konfiguriert)) {
    gruende.push("konfigurierter KI Deckel ist keine ganze Zahl");
  }
  if (reserveKonfiguriert === null || reserveEmpfohlen === null || reserveKonfiguriert < reserveEmpfohlen) {
    gruende.push("Understanding Reserve ist noch nicht ausreichend freigegeben und gesetzt");
  } else if (!Number.isSafeInteger(reserveKonfiguriert)) {
    gruende.push("konfigurierte Understanding Reserve ist keine ganze Zahl");
  } else if (konfiguriert !== null && reserveKonfiguriert > konfiguriert) {
    gruende.push("Understanding Reserve liegt ueber dem Gesamtdeckel");
  } else if (konfiguriert !== null
    && konfiguriert - reserveKonfiguriert < empfohlen - reserveEmpfohlen) {
    gruende.push("Understanding Reserve laesst zu wenig Kapazitaet fuer Lage und Buero");
  }
  let kiRotation = null;
  let fairnessMindestdeckel = null;
  let globalKonfiguriert = null;
  try {
    if (kiGlobalAnteilKonfiguriert === null || kiGlobalAnteilKonfiguriert === undefined
      || String(kiGlobalAnteilKonfiguriert).trim() === "") {
      throw new Error("KI Globalanteil fehlt");
    }
    globalKonfiguriert = globalAnteil(kiGlobalAnteilKonfiguriert);
    if (kapazitaet && globalKonfiguriert !== kapazitaet.globalAnteil) {
      gruende.push("KI Globalanteil stimmt nicht mit dem Kapazitaetsbericht ueberein");
    }
    fairnessMindestdeckel = erforderlicherDeckelFuerTaeglicheMandate(ziel, globalKonfiguriert);
    if (empfohlen !== null && empfohlen < fairnessMindestdeckel) {
      gruende.push(`empfohlener KI Deckel unterschreitet taegliche Fairness Untergrenze ${fairnessMindestdeckel}`);
    }
    if (globalKonfiguriert !== KI_GLOBAL_ANTEIL_STANDARD) {
      gruende.push("KI Globalanteil ist ohne extern belegte Production Konfiguration nicht exakt 0,5");
    }
    if (konfiguriert !== null && Number.isSafeInteger(konfiguriert)) {
      kiRotation = bewerteMandatsrotation({
        aktiveMandate: ziel, deckel: konfiguriert, globalAnteil: globalKonfiguriert
      });
      if (!kiRotation.taeglichVollstaendig) {
        gruende.push(`KI Deckel bedient bei Fairnessaufteilung nicht alle ${ziel} Mandate taeglich`);
      }
    }
  } catch (_) {
    gruende.push("KI Globalanteil ist nicht gueltig belegt");
  }
  let produktionsBeobachtung = null;
  let slotPruefung = null;
  try {
    produktionsBeobachtung = pruefeProduktionsBeobachtung(
      produktionsBeobachtungsbericht,
      { jetzt: jetztUtc, heuteUtc, vertrauenswuerdigeSlotIds }
    );
    const hoechsterTagesP95Ms = Math.max(...produktionsBeobachtung.tagesErgebnisse
      .map((tag) => tag.p95Ms));
    const hoechstesTagesMaximumMs = Math.max(...produktionsBeobachtung.tagesErgebnisse
      .map((tag) => tag.maxMs));
    slotPruefung = bewerteSlot({
      p95Ms: hoechsterTagesP95Ms,
      maxMs: hoechstesTagesMaximumMs
    });
    if (!slotPruefung.bestanden) {
      gruende.push("Slot Kapazitaet aus dem strengen Production Bericht hat keine 25 Prozent Reserve");
    }
    if (!produktionsBeobachtung.kriterienInternBestanden) {
      gruende.push("siebentaegige Vorstufenbeobachtung ist intern nicht gruen");
    }
    if (produktionsBeobachtung.aktiveStufe !== VORSTUFE[ziel]) {
      gruende.push(`siebentaegige Beobachtung stammt nicht aus Vorstufe ${VORSTUFE[ziel]}`);
    }
  } catch (fehler) {
    gruende.push(`strenger Production Beobachtungsbericht ist nicht intern nachgeprueft: ${String(fehler && fehler.message)}`);
  }
  gruende.push("vertrauenswuerdiges externes Herkunftsattest fuer die Production Beobachtung fehlt");
  for (const [name, ok] of Object.entries({
    "PR 272 ist nicht gemergt": codeUndMigrationen.pr272Merged,
    "PR 273 ist nicht gemergt": codeUndMigrationen.pr273Merged,
    "Parserfix ist nicht deployt": codeUndMigrationen.parserfixDeployed,
    "Planungszeitbudget Haertung ist nicht deployt": codeUndMigrationen.planungszeitbudgetDeployed,
    "Monitoring Haertung ist nicht deployt": codeUndMigrationen.monitoringHardeningDeployed,
    "F9 ist nicht angewendet": codeUndMigrationen.f9Applied,
    "Z22 ist nicht angewendet": codeUndMigrationen.z22Applied
  })) {
    if (ok !== true) gruende.push(name);
  }
  gruende.push("Code und Migrationsvollzug haben keinen zielgebundenen extern verifizierten Herkunftsbericht");
  return Object.freeze({
    // Bis zielgebundene externe Verifier fuer alle Herkunftstore existieren, darf
    // diese Funktion selbst bei formal fehlerfreien Eingaben niemals Gruen liefern.
    status: "nicht-entscheidungsreif",
    zielMandate: ziel,
    vorherigeAktivstufe: VORSTUFE[ziel],
    erforderlicheMessstufe: messstufe,
    fairnessMindestdeckel,
    kiGlobalAnteil: globalKonfiguriert,
    kiRotation,
    kapazitaetsberichtHash: kapazitaet ? inhaltFingerabdruck(kapazitaet) : null,
    kostenrahmen,
    produktionsBeobachtung,
    slotPruefung,
    nachweisgrenzen: Object.freeze({
      fachwegHerkunftExternBewiesen: false,
      supabaseHerkunftExternBewiesen: false,
      codeUndMigrationsvollzugExternBewiesen: false,
      fachwegGesamtberichtInternNachgeprueft: false,
      kostenstoppExternBewiesen: false,
      productionBeobachtungHerkunftExternBewiesen: false
    }),
    aktiviert: false,
    freigegeben: false,
    gruende: Object.freeze(gruende)
  });
}

module.exports = {
  KLASSEN,
  AKTIVIERUNGSSTUFEN,
  VORSTUFE,
  RESERVE_ANTEIL_STANDARD,
  SLOT_BUDGET_MS_STANDARD,
  SLOT_STOP_MS_STANDARD,
  BEOBACHTUNGSTAGE_MIN,
  AZURE_STICHPROBEN_JE_KLASSE_MIN,
  KI_GLOBAL_ANTEIL_STANDARD,
  BUDGET_AUFGABENFRIST_STUNDEN,
  KAPAZITAETSBERICHT_VERSION,
  KOSTENRAHMEN_VERSION,
  KOSTENRAHMEN_STATUS_FORMAL,
  inhaltFingerabdruck,
  erforderlicherDeckelFuerTaeglicheMandate,
  bewerteMandatsrotation,
  berechneKiDeckel,
  bewerteSlot,
  bewerteBeobachtung,
  erforderlicheMessstufe,
  pruefeKapazitaetsbericht,
  pruefeBetreiberKostenrahmen,
  bewerteEntscheidungsreife
};
