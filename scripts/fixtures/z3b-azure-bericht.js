"use strict";

// Rein lokaler, fail-closed Vertrag fuer den bereinigten Azure Messbericht.
// Er beweist nur Struktur und die Neuberechnung der Aggregate aus den im Bericht
// enthaltenen Einzelwerten. Herkunft, Deployment und Preise bleiben extern offen.

const crypto = require("crypto");

const SCHEMA_VERSION = "z3b-azure-bericht/v2";
const ART = "Z3b Azure Laufzeit und Token Teilnachweis";
const ERGEBNIS_FORMAL = "struktur-und-aggregate-intern-geprueft-externe-herkunft-offen";
const KLASSEN = Object.freeze(["understanding", "lage", "buero"]);
const AZURE_MODUS = "stichprobe";
const AZURE_AUFRUFE = 21;
const AZURE_JE_KLASSE = 7;
const AZURE_MAX_ALTER_TAGE = 7;
const AZURE_MAX_LAUFZEIT_MS = 5 * 60 * 1000;
const AZURE_MAX_KOSTENLIMIT_USD = 1;
const AZURE_MODELL = "gpt-5-mini";
const TAG_MS = 24 * 60 * 60 * 1000;
const SHA256_RE = /^[a-f0-9]{64}$/;

function objekt(wert, name) {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) {
    throw new Error(`${name} fehlt oder ist kein Objekt`);
  }
  return wert;
}

function nurSchluessel(wert, erlaubt, name) {
  const o = objekt(wert, name);
  const vorhanden = Object.keys(o);
  const fremd = vorhanden.filter((feld) => !erlaubt.includes(feld));
  const fehlt = erlaubt.filter((feld) => !(feld in o));
  if (fremd.length) throw new Error(`${name} enthaelt unbekannte Felder: ${fremd.join(", ")}`);
  if (fehlt.length) throw new Error(`${name} fehlt: ${fehlt.join(", ")}`);
  return o;
}

function endlicheZahl(wert, name, { minimum = 0 } = {}) {
  if (typeof wert !== "number" || !Number.isFinite(wert) || wert < minimum) {
    throw new Error(`${name} ist keine endliche Zahl`);
  }
  return wert;
}

function sichereGanzzahl(wert, name, { minimum = 0 } = {}) {
  if (typeof wert !== "number" || !Number.isSafeInteger(wert) || wert < minimum) {
    throw new Error(`${name} ist keine sichere Ganzzahl`);
  }
  return wert;
}

function sichereSumme(werte, name) {
  const summe = werte.reduce((gesamt, wert) => gesamt + wert, 0);
  if (!Number.isSafeInteger(summe)) throw new Error(`${name} ist keine sichere Ganzzahlsumme`);
  return summe;
}

function utcTag(wert, name) {
  if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) {
    throw new Error(`${name} ist kein UTC Datum`);
  }
  const zeit = Date.parse(`${wert}T00:00:00.000Z`);
  if (!Number.isFinite(zeit) || new Date(zeit).toISOString().slice(0, 10) !== wert) {
    throw new Error(`${name} ist kein gueltiges UTC Datum`);
  }
  return Object.freeze({ text: wert, zeit });
}

function utcZeitpunkt(wert, name) {
  if (typeof wert !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(wert)) {
    throw new Error(`${name} ist kein gueltiger UTC Zeitpunkt`);
  }
  const zeit = Date.parse(wert);
  if (!Number.isFinite(zeit) || new Date(zeit).toISOString() !== wert) {
    throw new Error(`${name} ist kein gueltiger UTC Zeitpunkt`);
  }
  return Object.freeze({ text: wert, zeit, tag: wert.slice(0, 10) });
}

function usageBlock(wert, name) {
  const u = nurSchluessel(wert, ["input", "output", "total", "cached", "reasoning"], name);
  const usage = Object.freeze({
    input: sichereGanzzahl(u.input, `${name}.input`, { minimum: 1 }),
    output: sichereGanzzahl(u.output, `${name}.output`, { minimum: 1 }),
    total: sichereGanzzahl(u.total, `${name}.total`, { minimum: 2 }),
    cached: sichereGanzzahl(u.cached, `${name}.cached`),
    reasoning: sichereGanzzahl(u.reasoning, `${name}.reasoning`)
  });
  if (usage.total !== usage.input + usage.output
      || usage.cached > usage.input || usage.reasoning > usage.output) {
    throw new Error(`${name} ist nicht widerspruchsfrei`);
  }
  return usage;
}

function verteilungAus(werte) {
  const sortiert = [...werte].sort((a, b) => a - b);
  const q = (p) => sortiert[Math.min(sortiert.length - 1, Math.floor(p * (sortiert.length - 1)))];
  const summe = sichereSumme(sortiert, "Azure Verteilungssumme");
  const mittel = Math.round((summe / sortiert.length) * 10) / 10;
  if (!Number.isFinite(mittel)) throw new Error("Azure Verteilungsmittel ist nicht endlich");
  return Object.freeze({
    n: sortiert.length,
    min: sortiert[0],
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: sortiert[sortiert.length - 1],
    mittel
  });
}

function rundeUsd(wert) {
  if (typeof wert !== "number" || !Number.isFinite(wert)) throw new Error("Azure Kosten sind nicht endlich");
  const gerundet = Math.round(wert * 1e8) / 1e8;
  if (!Number.isFinite(gerundet)) throw new Error("Azure Kosten sind nicht endlich");
  return gerundet;
}

function kostenUsd(usage, preis) {
  const kosten = (usage.input / 1e6) * preis.inputUsdJeMio
    + (usage.output / 1e6) * preis.outputUsdJeMio;
  if (!Number.isFinite(kosten)) throw new Error("Azure Kosten sind nicht endlich");
  return kosten;
}

function messblockAus(einzelmessungen, preis) {
  const summe = (feld) => sichereSumme(einzelmessungen.map((m) => m.usage[feld]), `Azure Usage ${feld}`);
  const usage = Object.freeze({
    input: summe("input"), output: summe("output"), total: summe("total"),
    cached: summe("cached"), reasoning: summe("reasoning")
  });
  return Object.freeze({
    aufrufe: einzelmessungen.length,
    dauerMs: verteilungAus(einzelmessungen.map((m) => m.dauerMs)),
    inputTokens: verteilungAus(einzelmessungen.map((m) => m.usage.input)),
    outputTokens: verteilungAus(einzelmessungen.map((m) => m.usage.output)),
    usage,
    kostenGeschaetztUsd: rundeUsd(kostenUsd(usage, preis))
  });
}

function auswertungAus(einzelmessungen, preis) {
  const jeKlasse = {};
  for (const klasse of KLASSEN) {
    jeKlasse[klasse] = messblockAus(einzelmessungen.filter((m) => m.klasse === klasse), preis);
  }
  return Object.freeze({ gesamt: messblockAus(einzelmessungen, preis), jeKlasse: Object.freeze(jeKlasse) });
}

function pruefeVerteilung(wert, name, n) {
  const v = nurSchluessel(wert, ["n", "min", "p50", "p95", "p99", "max", "mittel"], name);
  if (sichereGanzzahl(v.n, `${name}.n`, { minimum: 1 }) !== n) throw new Error(`${name}.n ist falsch`);
  for (const feld of ["min", "p50", "p95", "p99", "max"]) sichereGanzzahl(v[feld], `${name}.${feld}`);
  endlicheZahl(v.mittel, `${name}.mittel`);
}

function pruefeMessblockForm(wert, name, n) {
  const b = nurSchluessel(wert,
    ["aufrufe", "dauerMs", "inputTokens", "outputTokens", "usage", "kostenGeschaetztUsd"], name);
  if (sichereGanzzahl(b.aufrufe, `${name}.aufrufe`, { minimum: 1 }) !== n) throw new Error(`${name}.aufrufe ist falsch`);
  pruefeVerteilung(b.dauerMs, `${name}.dauerMs`, n);
  pruefeVerteilung(b.inputTokens, `${name}.inputTokens`, n);
  pruefeVerteilung(b.outputTokens, `${name}.outputTokens`, n);
  usageBlock(b.usage, `${name}.usage`);
  endlicheZahl(b.kostenGeschaetztUsd, `${name}.kostenGeschaetztUsd`);
}

function kanonisch(wert) {
  if (wert === null) return "null";
  if (typeof wert === "number") {
    if (!Number.isFinite(wert)) throw new Error("Nicht endliche Zahl kann nicht kanonisiert werden");
    return JSON.stringify(wert);
  }
  if (typeof wert === "string" || typeof wert === "boolean") return JSON.stringify(wert);
  if (typeof wert === "undefined" || typeof wert === "function" || typeof wert === "symbol"
      || typeof wert === "bigint") throw new Error("Nicht kanonisierbarer Wert");
  if (Array.isArray(wert)) {
    for (let i = 0; i < wert.length; i += 1) if (!(i in wert)) throw new Error("Arrayluecke ist nicht kanonisierbar");
    return `[${wert.map(kanonisch).join(",")}]`;
  }
  objekt(wert, "kanonischer Wert");
  return `{${Object.keys(wert).sort().map((feld) => `${JSON.stringify(feld)}:${kanonisch(wert[feld])}`).join(",")}}`;
}

function pruefeAzureBericht(bericht, {
  jetzt = new Date(),
  heuteUtc = new Date(jetzt).toISOString().slice(0, 10)
} = {}) {
  const b = nurSchluessel(bericht, [
    "schemaVersion", "art", "ergebnis", "modus", "laufKennung", "erhobenUtc",
    "beendetUtc", "deployment", "modell", "deploymentart", "region", "endpointHash",
    "aufrufe", "parallelitaet", "wiederholungen", "dauerGesamtMs", "synthetischePrompts",
    "productionDatenBeruehrt", "datenbankBeruehrt", "quellenanbieterAufrufe",
    "antwortinhalteGespeichert", "storeParameter", "preis", "preisquelle",
    "preisdatumUtc", "kostenlimitUsd", "konservativeKostenobergrenzeVorherUsd",
    "einzelmessungen", "auswertung"
  ], "Azure Bericht");
  if (b.schemaVersion !== SCHEMA_VERSION || b.art !== ART
      || b.ergebnis !== ERGEBNIS_FORMAL || b.modus !== AZURE_MODUS) {
    throw new Error("Azure Bericht hat nicht den exakten versionierten Stichprobenvertrag");
  }
  if (typeof b.laufKennung !== "string" || !/^[a-z0-9]{6,32}$/.test(b.laufKennung)) {
    throw new Error("Azure Laufkennung ist nicht belegt");
  }
  if (sichereGanzzahl(b.aufrufe, "Azure Aufrufe") !== AZURE_AUFRUFE
      || sichereGanzzahl(b.parallelitaet, "Azure Parallelitaet") !== 1
      || sichereGanzzahl(b.wiederholungen, "Azure Wiederholungen") !== 0) {
    throw new Error("Azure Stichprobe hat nicht den freigegebenen 21er Vertrag");
  }
  if (b.synthetischePrompts !== true || b.productionDatenBeruehrt !== false
      || b.datenbankBeruehrt !== false || b.antwortinhalteGespeichert !== false
      || b.storeParameter !== false
      || sichereGanzzahl(b.quellenanbieterAufrufe, "Azure Quellenanbieteraufrufe") !== 0) {
    throw new Error("Azure Stichprobe hat keinen sicheren Datenvertrag");
  }
  if (b.modell !== AZURE_MODELL) throw new Error(`Azure Modelltyp ${AZURE_MODELL} ist nicht belegt`);
  if (typeof b.deploymentart !== "string" || !/^(global|data-zone|regional)$/.test(b.deploymentart)
      || typeof b.region !== "string" || !/^[a-z][a-z0-9]{1,31}$/.test(b.region)
      || typeof b.deployment !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(b.deployment)
      || typeof b.endpointHash !== "string" || !SHA256_RE.test(b.endpointHash)) {
    throw new Error("Azure Deployment, Region oder voller Zielfingerabdruck ist nicht belegt");
  }

  const jetztZeit = jetzt instanceof Date ? jetzt.getTime() : Date.parse(jetzt);
  if (!Number.isFinite(jetztZeit)) throw new Error("Azure jetzt ist kein gueltiger Zeitpunkt");
  const heute = utcTag(heuteUtc, "heutiges UTC Datum");
  if (new Date(jetztZeit).toISOString().slice(0, 10) !== heute.text) {
    throw new Error("Azure heuteUtc stimmt nicht mit jetzt ueberein");
  }
  const beginn = utcZeitpunkt(b.erhobenUtc, "Azure Laufbeginn");
  const ende = utcZeitpunkt(b.beendetUtc, "Azure Laufende");
  if (beginn.zeit > ende.zeit || ende.zeit > jetztZeit) throw new Error("Azure Laufzeit liegt in der Zukunft oder ist umgekehrt");
  const dauer = sichereGanzzahl(b.dauerGesamtMs, "Azure Gesamtdauer");
  if (dauer !== ende.zeit - beginn.zeit || dauer > AZURE_MAX_LAUFZEIT_MS) {
    throw new Error("Azure Laufbeginn, Laufende und Gesamtdauer widersprechen sich");
  }
  const beginnTag = utcTag(beginn.tag, "Azure Laufbeginn Tag");
  const alterTage = Math.floor((heute.zeit - beginnTag.zeit) / TAG_MS);
  if (alterTage < 0 || alterTage > AZURE_MAX_ALTER_TAGE) {
    throw new Error(`Azure Stichprobe ist aelter als ${AZURE_MAX_ALTER_TAGE} UTC Tage`);
  }
  const preisTag = utcTag(b.preisdatumUtc, "Azure Preisdatum");
  if (preisTag.text !== beginn.tag) throw new Error("Azure Preisdatum stammt nicht vom UTC Lauftag");

  const preisRoh = nurSchluessel(b.preis, ["inputUsdJeMio", "outputUsdJeMio"], "Azure Preis");
  const preis = Object.freeze({
    inputUsdJeMio: endlicheZahl(preisRoh.inputUsdJeMio, "Azure Eingabepreis", { minimum: 0.00000001 }),
    outputUsdJeMio: endlicheZahl(preisRoh.outputUsdJeMio, "Azure Ausgabepreis", { minimum: 0.00000001 })
  });
  if (typeof b.preisquelle !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 ._:/-]{4,119}$/.test(b.preisquelle)) {
    throw new Error("Azure Preisquelle ist nicht formal belegt");
  }
  const kostenlimitUsd = endlicheZahl(b.kostenlimitUsd, "Azure Kostenlimit", { minimum: 0.00000001 });
  if (kostenlimitUsd > AZURE_MAX_KOSTENLIMIT_USD) {
    throw new Error(`Azure Kostenlimit darf ${AZURE_MAX_KOSTENLIMIT_USD} USD nicht ueberschreiten`);
  }
  const konservativeKostenobergrenzeVorherUsd = endlicheZahl(
    b.konservativeKostenobergrenzeVorherUsd,
    "Azure vorherige Kostenobergrenze",
    { minimum: 0.00000001 }
  );
  if (konservativeKostenobergrenzeVorherUsd > kostenlimitUsd) {
    throw new Error("Azure konservative Kostenobergrenze liegt ueber dem freigegebenen Kostenlimit");
  }

  if (!Array.isArray(b.einzelmessungen) || b.einzelmessungen.length !== AZURE_AUFRUFE) {
    throw new Error("Azure Bericht braucht exakt 21 bereinigte Einzelmessungen");
  }
  const einzelmessungen = b.einzelmessungen.map((wert, index) => {
    const m = nurSchluessel(wert, ["runId", "klasse", "dauerMs", "usage"], `Azure Einzelmessung ${index + 1}`);
    if (typeof m.runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/.test(m.runId)) {
      throw new Error(`Azure Einzelmessung ${index + 1} Run ID ist nicht belegt`);
    }
    if (!KLASSEN.includes(m.klasse)) throw new Error(`Azure Einzelmessung ${index + 1} Klasse ist unbekannt`);
    return Object.freeze({
      runId: m.runId,
      klasse: m.klasse,
      dauerMs: sichereGanzzahl(m.dauerMs, `Azure Einzelmessung ${index + 1} Dauer`),
      usage: usageBlock(m.usage, `Azure Einzelmessung ${index + 1} Usage`)
    });
  });
  if (new Set(einzelmessungen.map((m) => m.runId)).size !== AZURE_AUFRUFE) {
    throw new Error("Azure Einzelmessungen haben keine eindeutigen Run IDs");
  }
  for (const klasse of KLASSEN) {
    if (einzelmessungen.filter((m) => m.klasse === klasse).length !== AZURE_JE_KLASSE) {
      throw new Error(`Azure Einzelmessungen brauchen exakt ${AZURE_JE_KLASSE} Werte fuer ${klasse}`);
    }
  }
  // Die Messung ist vertraglich streng sequenziell (Parallelitaet 1). Deshalb
  // kann die Summe der 21 einzeln gemessenen Requestdauern nie groesser als
  // die reale Wandzeit des gesamten Laufs sein. Ohne diese Bindung koennten
  // formal neu berechnete Aggregate aus zeitlich unmoeglichen Fantasiewerten
  // trotzdem intern gruen erscheinen.
  const summeEinzeldauernMs = sichereSumme(
    einzelmessungen.map((messung) => messung.dauerMs),
    "Azure Summe der Einzelmessungsdauern"
  );
  if (summeEinzeldauernMs > dauer) {
    throw new Error("Azure Summe der Einzelmessungsdauern uebersteigt bei Parallelitaet 1 die Gesamtdauer");
  }

  const auswertung = nurSchluessel(b.auswertung, ["gesamt", "jeKlasse"], "Azure Auswertung");
  const jeKlasse = nurSchluessel(auswertung.jeKlasse, KLASSEN, "Azure Klassenwerte");
  pruefeMessblockForm(auswertung.gesamt, "Azure Gesamtwerte", AZURE_AUFRUFE);
  for (const klasse of KLASSEN) pruefeMessblockForm(jeKlasse[klasse], `Azure Klasse ${klasse}`, AZURE_JE_KLASSE);
  const nachgerechnet = auswertungAus(einzelmessungen, preis);
  if (kanonisch(auswertung) !== kanonisch(nachgerechnet)) {
    throw new Error("Azure Aggregate stimmen nicht exakt mit den 21 Einzelmessungen ueberein");
  }
  // Die auf acht Nachkommastellen gerundete Berichtsausgabe darf niemals die
  // Sicherheitsentscheidung treffen. Sonst koennte ein knapp oberhalb des
  // Limits liegender Rohwert auf das Limit abgerundet und formal akzeptiert
  // werden.
  const ungerundeteKostenUsd = kostenUsd(nachgerechnet.gesamt.usage, preis);
  if (ungerundeteKostenUsd > kostenlimitUsd) {
    throw new Error("Azure ungerundete nachgerechnete Kosten liegen ueber dem freigegebenen Kostenlimit");
  }
  if (ungerundeteKostenUsd > konservativeKostenobergrenzeVorherUsd) {
    throw new Error("Azure ungerundete nachgerechnete Kosten liegen ueber der vor dem Lauf angegebenen konservativen Kostenobergrenze");
  }

  const klassen = Object.freeze(Object.fromEntries(KLASSEN.map((klasse) => {
    const wert = nachgerechnet.jeKlasse[klasse];
    return [klasse, Object.freeze({
      stichproben: AZURE_JE_KLASSE,
      dauerMsP95: wert.dauerMs.p95, dauerMsMax: wert.dauerMs.max,
      inputTokensP95: wert.inputTokens.p95, inputTokensMax: wert.inputTokens.max,
      outputTokensP95: wert.outputTokens.p95, outputTokensMax: wert.outputTokens.max
    })];
  })));
  const langsamstesP95Ms = Math.max(...KLASSEN.map((klasse) => klassen[klasse].dauerMsP95));
  const langsamstesMaximumMs = Math.max(...KLASSEN.map((klasse) => klassen[klasse].dauerMsMax));
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    status: ERGEBNIS_FORMAL,
    strukturInternKonsistent: true,
    aggregateAusEinzelmessungenNachgerechnet: true,
    externeHerkunftBewiesen: false,
    deploymentUndPreisExternBewiesen: false,
    entscheidungsgrundlageVollstaendig: false,
    beweisgrenze: "Der Offline Validator kann Einzelwerte, Deployment, Region und Preisquelle nicht gegen Azure belegen.",
    laufKennung: b.laufKennung,
    erhobenUtc: beginn.text,
    beendetUtc: ende.text,
    deployment: b.deployment,
    modell: b.modell,
    deploymentart: b.deploymentart,
    region: b.region,
    endpointHash: b.endpointHash,
    preisdatumUtc: preisTag.text,
    preis,
    preisquelle: b.preisquelle,
    alterTage,
    einzelmessungenSha256: crypto.createHash("sha256").update(kanonisch(einzelmessungen)).digest("hex"),
    gesamt: nachgerechnet.gesamt,
    klassen,
    lokalesKiProfil: Object.freeze({
      latenzMs: langsamstesP95Ms,
      streuungMs: Math.max(1, langsamstesMaximumMs - langsamstesP95Ms + 1)
    })
  });
}

module.exports = {
  SCHEMA_VERSION,
  ART,
  ERGEBNIS_FORMAL,
  KLASSEN,
  AZURE_MODUS,
  AZURE_AUFRUFE,
  AZURE_JE_KLASSE,
  AZURE_MAX_ALTER_TAGE,
  AZURE_MAX_KOSTENLIMIT_USD,
  AZURE_MODELL,
  verteilungAus,
  auswertungAus,
  pruefeAzureBericht
};
