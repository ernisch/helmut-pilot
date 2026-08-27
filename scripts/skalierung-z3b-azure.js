"use strict";

// Helmut — streng begrenzte Azure Laufzeit und Tokenmessung fuer Z3b.
// =============================================================================
// Ohne explizite Kosten und Laufkennung kein Netz. Keine Datenbank, keine echten
// Mandatsdaten, keine Quellen, keine Wiederholung und nur ein Aufruf gleichzeitig.

const {
  KLASSEN,
  MODI,
  PARALLELITAET,
  WIEDERHOLUNGEN,
  LAUFZEIT_MAX_MS,
  ANFRAGE_TIMEOUT_MS,
  KOSTENLIMIT_MAX_USD,
  pruefeAzureEndpoint,
  baueMessauftraege,
  bauePayload,
  obereKostenUsd,
  endpointFingerabdruck
} = require("./fixtures/z3b-azure-plan");

const ANTWORT_MAX_BYTES = 8 * 1024 * 1024;
const DEPLOYMENTARTEN = Object.freeze(["global", "data-zone", "regional"]);
const FREMDKENNUNGEN = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SECRET_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "SERPAPI_KEY",
  "AZURE_OPENAI_API_KEY"
]);

class Z3bAzureAbbruch extends Error {
  constructor(nachricht, grund = "sicherheitsabbruch") {
    super(nachricht);
    this.name = "Z3bAzureAbbruch";
    this.grund = grund;
  }
}

function positiveZahl(roh, name) {
  const text = String(roh == null ? "" : roh).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    throw new Z3bAzureAbbruch(`${name} fehlt oder ist keine positive Dezimalzahl`, "konfiguration");
  }
  const wert = Number(text);
  if (!Number.isFinite(wert) || wert <= 0) {
    throw new Z3bAzureAbbruch(`${name} muss groesser als null sein`, "konfiguration");
  }
  return wert;
}

function freigabeKennung({ modus, laufKennung, aufrufe }) {
  return `z3b-azure:${modus}:${aufrufe}:${laufKennung}`;
}

function utcDatum(roh, name, heuteUtc = new Date().toISOString().slice(0, 10)) {
  const text = String(roh == null ? "" : roh).trim();
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : null;
  if (!datum || Number.isNaN(datum.getTime()) || datum.toISOString().slice(0, 10) !== text) {
    throw new Z3bAzureAbbruch(`${name} fehlt oder ist kein gueltiges UTC Datum`, "kosten");
  }
  if (text !== heuteUtc) {
    throw new Z3bAzureAbbruch(`${name} muss am UTC Lauftag erneut bestaetigt werden`, "kosten");
  }
  return text;
}

function liesKonfiguration(env = process.env, { heuteUtc = new Date().toISOString().slice(0, 10) } = {}) {
  const fremd = FREMDKENNUNGEN.filter((name) => String(env[name] || "").trim() !== "");
  if (fremd.length) {
    throw new Z3bAzureAbbruch(
      `Z3b Azure Umgebung abgelehnt: fremde Provider oder Datenbankkennungen sind sichtbar (${fremd.join(", ")}; Werte werden nicht ausgegeben)`,
      "umgebung"
    );
  }
  if (String(env.HELMUT_SOURCE_MODE || "").trim().toLowerCase() !== "off") {
    throw new Z3bAzureAbbruch("Z3b Azure Umgebung abgelehnt: HELMUT_SOURCE_MODE muss genau off sein", "umgebung");
  }

  let ziel;
  try { ziel = pruefeAzureEndpoint(env.AZURE_OPENAI_ENDPOINT); }
  catch (fehler) { throw new Z3bAzureAbbruch(fehler.message, "ziel"); }
  const key = String(env.AZURE_OPENAI_KEY || "").trim();
  if (key.length < 16) throw new Z3bAzureAbbruch("Z3b Azure Key fehlt oder ist unplausibel kurz", "zugang");
  const deployment = String(env.AZURE_OPENAI_DEPLOYMENT || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(deployment)) {
    throw new Z3bAzureAbbruch("Z3b Azure Deployment fehlt oder ist ungueltig", "deployment");
  }
  const deploymentart = String(env.HELMUT_Z3B_AZURE_DEPLOYMENTART || "").trim();
  if (!DEPLOYMENTARTEN.includes(deploymentart)) {
    throw new Z3bAzureAbbruch(
      `Z3b Azure Deploymentart muss einer von ${DEPLOYMENTARTEN.join(", ")} sein`,
      "deployment"
    );
  }
  const region = String(env.HELMUT_Z3B_AZURE_REGION || "").trim();
  if (!/^[a-z][a-z0-9]{1,31}$/.test(region)) {
    throw new Z3bAzureAbbruch("Z3b Azure Region fehlt oder ist nicht der normalisierte Azure Regionsname", "deployment");
  }
  const modus = String(env.HELMUT_Z3B_AZURE_MODUS || "").trim();
  if (!MODI[modus]) {
    throw new Z3bAzureAbbruch(`Z3b Azure Modus muss einer von ${Object.keys(MODI).join(", ")} sein`, "konfiguration");
  }
  const laufKennung = String(env.HELMUT_Z3B_AZURE_LAUF || "").trim();
  if (!/^[a-z0-9]{6,32}$/.test(laufKennung)) {
    throw new Z3bAzureAbbruch("Z3b Azure Laufkennung muss 6 bis 32 Kleinbuchstaben oder Ziffern enthalten", "konfiguration");
  }
  const preis = Object.freeze({
    inputUsdJeMio: positiveZahl(env.HELMUT_Z3B_AZURE_PREIS_INPUT_USD_MIO, "HELMUT_Z3B_AZURE_PREIS_INPUT_USD_MIO"),
    outputUsdJeMio: positiveZahl(env.HELMUT_Z3B_AZURE_PREIS_OUTPUT_USD_MIO, "HELMUT_Z3B_AZURE_PREIS_OUTPUT_USD_MIO")
  });
  const preisquelle = String(env.HELMUT_Z3B_AZURE_PREISQUELLE || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._:/-]{4,119}$/.test(preisquelle)) {
    throw new Z3bAzureAbbruch("Z3b Azure Preisquelle fehlt oder ist nicht knapp belegbar", "kosten");
  }
  const preisdatumUtc = utcDatum(
    env.HELMUT_Z3B_AZURE_PREISDATUM_UTC,
    "HELMUT_Z3B_AZURE_PREISDATUM_UTC",
    heuteUtc
  );
  const kostenlimitUsd = positiveZahl(env.HELMUT_Z3B_AZURE_KOSTENLIMIT_USD, "HELMUT_Z3B_AZURE_KOSTENLIMIT_USD");
  if (kostenlimitUsd > KOSTENLIMIT_MAX_USD) {
    throw new Z3bAzureAbbruch(`Z3b Azure Kostenlimit darf ${KOSTENLIMIT_MAX_USD.toFixed(2)} USD nicht ueberschreiten`, "kosten");
  }
  const auftraege = baueMessauftraege(modus);
  const kostenOben = obereKostenUsd(auftraege, preis);
  if (kostenOben.usd > kostenlimitUsd) {
    throw new Z3bAzureAbbruch(
      `Z3b Azure konservative Kostenobergrenze ${kostenOben.usd.toFixed(4)} USD liegt ueber der Freigabe`,
      "kosten"
    );
  }
  const freigabe = freigabeKennung({ modus, laufKennung, aufrufe: auftraege.length });
  if (String(env.HELMUT_Z3B_AZURE_FREIGABE || "") !== freigabe) {
    throw new Z3bAzureAbbruch("Z3b Azure Lauf ist nicht lauf und kostenbezogen freigeschaltet", "freigabe");
  }

  const konfiguration = {
    endpoint: ziel.url,
    endpointHash: endpointFingerabdruck(ziel.host),
    deployment,
    deploymentart,
    region,
    modus,
    laufKennung,
    aufrufe: auftraege.length,
    parallelitaet: PARALLELITAET,
    wiederholungen: WIEDERHOLUNGEN,
    timeoutMs: ANFRAGE_TIMEOUT_MS,
    laufzeitMaxMs: LAUFZEIT_MAX_MS,
    preis,
    preisquelle,
    preisdatumUtc,
    kostenlimitUsd,
    kostenObergrenzeUsd: kostenOben.usd,
    inputTokensObergrenze: kostenOben.inputTokensMax,
    outputTokensObergrenze: kostenOben.outputTokensMax
  };
  Object.defineProperty(konfiguration, "key", { value: key, enumerable: false });
  Object.defineProperty(konfiguration, "messauftraege", { value: auftraege, enumerable: false });
  return Object.freeze(konfiguration);
}

function verteilung(werte) {
  if (!werte.length) return Object.freeze({ n: 0, min: null, p50: null, p95: null, p99: null, max: null, mittel: null });
  const sortiert = [...werte].map(Number).sort((a, b) => a - b);
  const q = (p) => sortiert[Math.min(sortiert.length - 1, Math.floor(p * (sortiert.length - 1)))];
  return Object.freeze({
    n: sortiert.length,
    min: sortiert[0],
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: sortiert[sortiert.length - 1],
    mittel: Math.round(sortiert.reduce((summe, wert) => summe + wert, 0) / sortiert.length * 10) / 10
  });
}

function usageAus(json) {
  const usage = json && json.usage;
  const input = Number(usage && usage.input_tokens);
  const output = Number(usage && usage.output_tokens);
  const total = Number(usage && usage.total_tokens);
  const cached = Number(usage && usage.input_tokens_details && usage.input_tokens_details.cached_tokens);
  const reasoning = Number(usage && usage.output_tokens_details && usage.output_tokens_details.reasoning_tokens);
  if (![input, output, total, cached, reasoning].every((wert) => Number.isFinite(wert) && wert >= 0)
      || total !== input + output) {
    throw new Z3bAzureAbbruch("Z3b Azure Antwort hat keinen vollstaendigen, widerspruchsfreien usage Block", "antwortform");
  }
  return Object.freeze({ input, output, total, cached, reasoning });
}

function outputZeichen(json) {
  if (typeof (json && json.output_text) === "string") return json.output_text.length;
  let anzahl = 0;
  for (const item of (json && Array.isArray(json.output) ? json.output : [])) {
    for (const content of (item && Array.isArray(item.content) ? item.content : [])) {
      if (content && content.type === "output_text" && typeof content.text === "string") anzahl += content.text.length;
    }
  }
  return anzahl;
}

async function eineAnfrage(konfiguration, auftrag, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Z3bAzureAbbruch("Z3b Azure braucht Node fetch", "laufzeit");
  const controller = new AbortController();
  const beginn = Date.now();
  const timer = setTimeout(() => controller.abort(), konfiguration.timeoutMs);
  let antwort;
  try {
    antwort = await fetchImpl(`${konfiguration.endpoint}/openai/v1/responses`, {
      method: "POST",
      headers: {
        "api-key": konfiguration.key,
        "Content-Type": "application/json",
        "User-Agent": "helmut-z3b-azure-server/1.0"
      },
      body: JSON.stringify(bauePayload(auftrag, konfiguration.deployment)),
      signal: controller.signal
    });
  } catch (fehler) {
    clearTimeout(timer);
    const timeout = Boolean(fehler && fehler.name === "AbortError");
    throw new Z3bAzureAbbruch(
      timeout ? "Z3b Azure Anfrage hat die Zeitgrenze ueberschritten" : "Z3b Azure Netzfehler ohne Detailausgabe",
      timeout ? "timeout" : "netzfehler"
    );
  }
  clearTimeout(timer);
  const dauerMs = Math.max(0, Date.now() - beginn);
  const status = Number(antwort && antwort.status) || 0;
  let text = "";
  try { text = await antwort.text(); }
  catch (_) { throw new Z3bAzureAbbruch("Z3b Azure Antwort war nicht lesbar", "antwortform"); }
  if (Buffer.byteLength(text, "utf8") > ANTWORT_MAX_BYTES) {
    throw new Z3bAzureAbbruch("Z3b Azure Antwort war groesser als 8 MiB", "antwortform");
  }
  if (!antwort.ok) {
    // Kein Rumpf, keine Request ID, kein automatischer Neuversuch.
    throw new Z3bAzureAbbruch(`Z3b Azure antwortete mit HTTP ${status}`, status === 429 ? "drosselung" : "anbieterfehler");
  }
  let json;
  try { json = JSON.parse(text); }
  catch (_) { throw new Z3bAzureAbbruch("Z3b Azure Antwort war kein gueltiges JSON", "antwortform"); }
  if (json.status !== "completed") {
    throw new Z3bAzureAbbruch(`Z3b Azure Antwortstatus war ${String(json.status || "fehlend")}`, "antwortform");
  }
  const usage = usageAus(json);
  return Object.freeze({
    klasse: auftrag.klasse,
    dauerMs,
    status,
    promptBytes: auftrag.promptBytes,
    outputZeichen: outputZeichen(json),
    usage
  });
}

function kostenUsd(usage, preis) {
  // Cached Input wird konservativ zum vollen Inputpreis gerechnet. Dadurch ist
  // dies eine Oberrechnung und keine Behauptung ueber die spaetere Rechnung.
  return (usage.input / 1e6) * preis.inputUsdJeMio + (usage.output / 1e6) * preis.outputUsdJeMio;
}

function aggregiere(ergebnisse, preis) {
  const summe = (liste, feld) => liste.reduce((gesamt, wert) => gesamt + Number(wert.usage[feld] || 0), 0);
  const baue = (liste) => {
    const usage = Object.freeze({
      input: summe(liste, "input"),
      output: summe(liste, "output"),
      total: summe(liste, "total"),
      cached: summe(liste, "cached"),
      reasoning: summe(liste, "reasoning")
    });
    return Object.freeze({
      aufrufe: liste.length,
      dauerMs: verteilung(liste.map((wert) => wert.dauerMs)),
      inputTokens: verteilung(liste.map((wert) => wert.usage.input)),
      outputTokens: verteilung(liste.map((wert) => wert.usage.output)),
      reasoningTokens: verteilung(liste.map((wert) => wert.usage.reasoning)),
      cachedTokens: verteilung(liste.map((wert) => wert.usage.cached)),
      bytesJeInputToken: verteilung(liste.map((wert) => Math.round((wert.promptBytes / Math.max(1, wert.usage.input)) * 1000) / 1000)),
      outputZeichen: verteilung(liste.map((wert) => wert.outputZeichen)),
      usage,
      kostenGeschaetztUsd: Math.round(kostenUsd(usage, preis) * 1e8) / 1e8
    });
  };
  const jeKlasse = {};
  for (const klasse of KLASSEN) {
    jeKlasse[klasse] = baue(ergebnisse.filter((wert) => wert.klasse === klasse));
  }
  return Object.freeze({ gesamt: baue(ergebnisse), jeKlasse: Object.freeze(jeKlasse) });
}

async function fuehreMesslauf(konfiguration, { fetchImpl = globalThis.fetch, jetztMs = () => Date.now() } = {}) {
  const beginnMs = jetztMs();
  const ergebnisse = [];
  let kostenBisher = 0;
  for (const auftrag of konfiguration.messauftraege) {
    if (jetztMs() - beginnMs >= konfiguration.laufzeitMaxMs) {
      throw new Z3bAzureAbbruch("Z3b Azure Gesamtlaufzeit von fuenf Minuten erreicht", "laufzeit");
    }
    const ergebnis = await eineAnfrage(konfiguration, auftrag, fetchImpl);
    ergebnisse.push(ergebnis);
    kostenBisher += kostenUsd(ergebnis.usage, konfiguration.preis);
    if (kostenBisher > konfiguration.kostenlimitUsd) {
      throw new Z3bAzureAbbruch("Z3b Azure gemessene Kostenoberrechnung hat das freigegebene Limit erreicht", "kosten");
    }
  }
  const endeMs = jetztMs();
  const auswertung = aggregiere(ergebnisse, konfiguration.preis);
  return Object.freeze({
    art: "Z3b Azure Laufzeit und Token Teilnachweis",
    ergebnis: "vollstaendig",
    modus: konfiguration.modus,
    laufKennung: konfiguration.laufKennung,
    deployment: konfiguration.deployment,
    deploymentart: konfiguration.deploymentart,
    region: konfiguration.region,
    endpointHash: konfiguration.endpointHash,
    aufrufe: ergebnisse.length,
    parallelitaet: konfiguration.parallelitaet,
    wiederholungen: konfiguration.wiederholungen,
    dauerGesamtMs: Math.max(0, endeMs - beginnMs),
    synthetischePrompts: true,
    productionDatenBeruehrt: false,
    datenbankBeruehrt: false,
    quellenanbieterAufrufe: 0,
    antwortinhalteGespeichert: false,
    storeParameter: false,
    preis: konfiguration.preis,
    preisquelle: konfiguration.preisquelle,
    preisdatumUtc: konfiguration.preisdatumUtc,
    kostenlimitUsd: konfiguration.kostenlimitUsd,
    konservativeKostenobergrenzeVorherUsd: Math.round(konfiguration.kostenObergrenzeUsd * 1e8) / 1e8,
    auswertung
  });
}

function sichererFehler(fehler) {
  if (fehler instanceof Z3bAzureAbbruch) return Object.freeze({ grund: fehler.grund, nachricht: fehler.message });
  return Object.freeze({ grund: "interner-fehler", nachricht: "Z3b Azure wurde wegen eines internen Fehlers ohne Detailausgabe abgebrochen" });
}

async function main() {
  try {
    const konfiguration = liesKonfiguration(process.env);
    const bericht = await fuehreMesslauf(konfiguration);
    process.stdout.write(`${JSON.stringify(bericht, null, 2)}\n`);
  } catch (fehler) {
    process.stderr.write(`${JSON.stringify({
      art: "Z3b Azure Laufzeit und Token Teilnachweis",
      ergebnis: "abgebrochen",
      wiederholungen: 0,
      productionDatenBeruehrt: false,
      fehler: sichererFehler(fehler)
    }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  DEPLOYMENTARTEN,
  FREMDKENNUNGEN,
  Z3bAzureAbbruch,
  positiveZahl,
  utcDatum,
  freigabeKennung,
  liesKonfiguration,
  verteilung,
  usageAus,
  outputZeichen,
  eineAnfrage,
  kostenUsd,
  aggregiere,
  fuehreMesslauf,
  sichererFehler
};
