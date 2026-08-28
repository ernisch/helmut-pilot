"use strict";

// Offline Vertragstest. Die Azure Antworten sind lokale Funktionsattrappen.

const fs = require("fs");
const path = require("path");
const P = require("./fixtures/z3b-azure-plan");
const B = require("./fixtures/z3b-azure-bericht");
const Z = require("./skalierung-z3b-azure");

const ROOT = path.join(__dirname, "..");
const TEST_KEY = "NUR_LOKALE_AZURE_KEY_ATTRAPPE_123456";
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
  try { fn(); return false; }
  catch (fehler) { return muster.test(String(fehler && fehler.message)); }
}

async function verwirft(fn, muster) {
  try { await fn(); return false; }
  catch (fehler) { return muster.test(String(fehler && fehler.message)); }
}

function umgebung({ modus = "vorprobe", lauf = "azureprobe01", kostenlimit = "0.25" } = {}) {
  const env = {
    HELMUT_SOURCE_MODE: "off",
    AZURE_OPENAI_ENDPOINT: "https://helmut-z3b-test.openai.azure.com",
    AZURE_OPENAI_KEY: TEST_KEY,
    AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
    HELMUT_Z3B_AZURE_MODELL: "gpt-5-mini",
    HELMUT_Z3B_AZURE_DEPLOYMENTART: "global",
    HELMUT_Z3B_AZURE_REGION: "swedencentral",
    HELMUT_Z3B_AZURE_MODUS: modus,
    HELMUT_Z3B_AZURE_LAUF: lauf,
    HELMUT_Z3B_AZURE_PREIS_INPUT_USD_MIO: "0.25",
    HELMUT_Z3B_AZURE_PREIS_OUTPUT_USD_MIO: "2.00",
    HELMUT_Z3B_AZURE_PREISQUELLE: "rein-lokale-preisattrappe-kein-azure-preis",
    HELMUT_Z3B_AZURE_PREISDATUM_UTC: new Date().toISOString().slice(0, 10),
    HELMUT_Z3B_AZURE_KOSTENLIMIT_USD: kostenlimit
  };
  env.HELMUT_Z3B_AZURE_FREIGABE = Z.freigabeKennung({
    modus,
    laufKennung: lauf,
    aufrufe: P.MODI[modus] ? P.MODI[modus].aufrufe : 0
  });
  return env;
}

function antwort(status, daten, roh = null) {
  return {
    status,
    ok: status >= 200 && status <= 299,
    text: async () => roh == null ? JSON.stringify(daten) : String(roh)
  };
}

async function main() {
  console.log("Helmut — lokaler Vertragstest der Z3b Azure Messung\n");

  console.log("== A · Rein synthetischer Messplan ==");
  const vor = P.baueMessauftraege("vorprobe");
  const stich = P.baueMessauftraege("stichprobe");
  check("A1 Die Vorprobe hat exakt einen Aufruf je Klasse",
    vor.length === 3 && P.KLASSEN.every((klasse) => vor.filter((a) => a.klasse === klasse).length === 1));
  check("A2 Die Stichprobe hat exakt sieben weitere Aufrufe je Klasse",
    stich.length === 21 && P.KLASSEN.every((klasse) => stich.filter((a) => a.klasse === klasse).length === 7));
  check("A3 Beide getrennten Freigabepakete bleiben zusammen bei hoechstens 24 Aufrufen",
    vor.length + stich.length === P.AUFRUFE_UEBER_BEIDE_MODI_MAX
      && P.AUFRUFE_UEBER_BEIDE_MODI_MAX === 24);
  check("A4 Parallelitaet eins und keine Wiederholung sind fest verdrahtet",
    P.PARALLELITAET === 1 && P.WIEDERHOLUNGEN === 0);
  check("A5 Jeder Prompt ist als synthetisch erkennbar und unter 40 KB",
    [...vor, ...stich].every((a) => /synthetisch/i.test(a.prompt)
      && !/Bundestag\.de|http|@[a-z0-9]/i.test(a.prompt)
      && a.promptBytes <= P.PROMPT_MAX_BYTES));
  check("A6 Verstehen verwendet den echten Helmut Promptvertrag und das echte Schema",
    vor.find((a) => a.klasse === "understanding").schemaName === "knowledge_object"
      && /Pflichtfelder/.test(vor.find((a) => a.klasse === "understanding").prompt));
  check("A7 Die Payload ist zustandslos, ohne Tools und mit minimalem Reasoning",
    [...vor, ...stich].every((a) => {
      const payload = P.bauePayload(a, "gpt-5-mini");
      return payload.store === false
        && payload.model === "gpt-5-mini"
        && payload.reasoning.effort === "minimal"
        && payload.text.format.type === "json_schema"
        && !("tools" in payload)
        && !("previous_response_id" in payload);
    }));

  console.log("\n== B · Ziel, Kosten und Freigaberiegel ==");
  const basis = Z.liesKonfiguration(umgebung());
  check("B1 Exakter Azure OpenAI Ressourcenhost wird angenommen",
    basis.endpoint === "https://helmut-z3b-test.openai.azure.com"
      && basis.endpointHash.length === 64
      && basis.modell === "gpt-5-mini"
      && basis.deploymentart === "global"
      && basis.region === "swedencentral"
      && /^\d{4}-\d{2}-\d{2}$/.test(basis.preisdatumUtc));
  check("B2 Key und Prompts sind im Konfigurations JSON nicht aufzaehlbar",
    !Object.keys(basis).includes("key")
      && !Object.keys(basis).includes("messauftraege")
      && !JSON.stringify(basis).includes(TEST_KEY)
      && !JSON.stringify(basis).includes("Synthetischer politischer"));
  check("B3 URL Pfade, Parameter und Zugangsdaten in der URL werden abgelehnt",
    [
      "https://helmut-z3b-test.openai.azure.com/openai/v1",
      "https://helmut-z3b-test.openai.azure.com?x=1",
      "https://name:wort@helmut-z3b-test.openai.azure.com"
    ].every((url) => wirft(() => P.pruefeAzureEndpoint(url), /Basis URL/)));
  check("B4 Andere Azure und beliebige Hosts werden abgelehnt",
    [
      "https://helmut.cognitiveservices.azure.com",
      "https://api.openai.com",
      "https://beispiel.invalid"
    ].every((url) => wirft(() => P.pruefeAzureEndpoint(url), /Ressourcenhost/)));

  const ohneKey = umgebung(); delete ohneKey.AZURE_OPENAI_KEY;
  check("B5 Ohne Azure Key wird vor fetch abgebrochen", wirft(() => Z.liesKonfiguration(ohneKey), /Key fehlt/));
  const ohneDeployment = umgebung(); delete ohneDeployment.AZURE_OPENAI_DEPLOYMENT;
  check("B6 Ohne ausdrueckliches Deployment wird abgebrochen",
    wirft(() => Z.liesKonfiguration(ohneDeployment), /Deployment/));
  const ohneModell = umgebung(); delete ohneModell.HELMUT_Z3B_AZURE_MODELL;
  check("B6a Ohne separat im Portal belegten Modelltyp wird abgebrochen",
    wirft(() => Z.liesKonfiguration(ohneModell), /Modell.*gpt-5-mini/));
  const falschesModell = umgebung(); falschesModell.HELMUT_Z3B_AZURE_MODELL = "gpt-5";
  check("B6b Ein anderer Modelltyp wird abgebrochen",
    wirft(() => Z.liesKonfiguration(falschesModell), /Modell.*gpt-5-mini/));
  const ohneDeploymentart = umgebung(); delete ohneDeploymentart.HELMUT_Z3B_AZURE_DEPLOYMENTART;
  check("B7 Ohne ausdrueckliche Deploymentart wird abgebrochen",
    wirft(() => Z.liesKonfiguration(ohneDeploymentart), /Deploymentart/));
  const falscheDeploymentart = umgebung(); falscheDeploymentart.HELMUT_Z3B_AZURE_DEPLOYMENTART = "vermutlich-global";
  check("B8 Nur Global, Data Zone oder Regional werden angenommen",
    wirft(() => Z.liesKonfiguration(falscheDeploymentart), /Deploymentart/));
  const ohneRegion = umgebung(); delete ohneRegion.HELMUT_Z3B_AZURE_REGION;
  check("B9 Ohne normalisierten Azure Regionsnamen wird abgebrochen",
    wirft(() => Z.liesKonfiguration(ohneRegion), /Region/));
  const altesPreisdatum = umgebung(); altesPreisdatum.HELMUT_Z3B_AZURE_PREISDATUM_UTC = "2000-01-01";
  check("B10 Ein Preisbeleg von einem anderen UTC Lauftag wird abgelehnt",
    wirft(() => Z.liesKonfiguration(altesPreisdatum), /UTC Lauftag/));
  const quelleAn = umgebung(); quelleAn.HELMUT_SOURCE_MODE = "live";
  check("B11 Quellenmodus muss hart aus sein", wirft(() => Z.liesKonfiguration(quelleAn), /SOURCE_MODE.*off/));
  const mitDb = umgebung(); mitDb.SUPABASE_URL = "https://datenbank.invalid";
  check("B12 Sichtbare Datenbankkennungen sperren den Lauf",
    wirft(() => Z.liesKonfiguration(mitDb), /fremde Provider oder Datenbankkennungen/));
  const mitOpenAI = umgebung(); mitOpenAI.OPENAI_API_KEY = "anderer-anbieter";
  check("B13 Sichtbare andere Providerkennungen sperren den Lauf",
    wirft(() => Z.liesKonfiguration(mitOpenAI), /fremde Provider oder Datenbankkennungen/));
  const mitAlias = umgebung(); mitAlias.AZURE_OPENAI_API_KEY = "zweiter-key";
  check("B14 Zwei Azure Key Namen gleichzeitig werden abgelehnt",
    wirft(() => Z.liesKonfiguration(mitAlias), /fremde Provider oder Datenbankkennungen/));
  const ohnePreis = umgebung(); delete ohnePreis.HELMUT_Z3B_AZURE_PREIS_OUTPUT_USD_MIO;
  check("B15 Ohne am Lauftag bestaetigte Preise wird abgebrochen",
    wirft(() => Z.liesKonfiguration(ohnePreis), /PREIS_OUTPUT/));
  const ohneQuelle = umgebung(); delete ohneQuelle.HELMUT_Z3B_AZURE_PREISQUELLE;
  check("B16 Ohne Preisquelle wird abgebrochen", wirft(() => Z.liesKonfiguration(ohneQuelle), /Preisquelle/));
  check("B17 Ein Kostenlimit ueber 1 USD ist technisch unmoeglich",
    wirft(() => Z.liesKonfiguration(umgebung({ kostenlimit: "1.01" })), /nicht ueberschreiten/));
  check("B18 Ein zu kleines Kostenlimit sperrt bereits den Plan",
    wirft(() => Z.liesKonfiguration(umgebung({ kostenlimit: "0.001" })), /Kostenobergrenze/));
  const ohneFreigabe = umgebung(); delete ohneFreigabe.HELMUT_Z3B_AZURE_FREIGABE;
  check("B19 Ohne laufbezogene Kostenfreigabe wird abgebrochen",
    wirft(() => Z.liesKonfiguration(ohneFreigabe), /nicht lauf und kostenbezogen/));
  const falsch = umgebung(); falsch.HELMUT_Z3B_AZURE_FREIGABE = "z3b-azure:stichprobe:21:falsch";
  check("B20 Die Freigabe eines anderen Laufs gilt nicht",
    wirft(() => Z.liesKonfiguration(falsch), /nicht lauf und kostenbezogen/));
  const stichConfig = Z.liesKonfiguration(umgebung({ modus: "stichprobe" }));
  check("B21 Die 21er Stichprobe bleibt selbst konservativ unter 0.25 USD",
    stichConfig.aufrufe === 21 && stichConfig.kostenObergrenzeUsd < 0.25,
    `${stichConfig.kostenObergrenzeUsd.toFixed(4)} USD`);

  console.log("\n== C · Transport und Antwortform ==");
  const aufrufe = [];
  let gleichzeitig = 0;
  let gleichzeitigMax = 0;
  const fakeFetch = async (url, optionen) => {
    gleichzeitig += 1;
    gleichzeitigMax = Math.max(gleichzeitigMax, gleichzeitig);
    const payload = JSON.parse(optionen.body);
    aufrufe.push({ url, optionen, payload });
    const input = payload.input.length > 10000 ? 4600 : (payload.input.length > 3000 ? 1800 : 650);
    const output = payload.input.length > 10000 ? 340 : (payload.input.length > 3000 ? 220 : 140);
    gleichzeitig -= 1;
    return antwort(200, {
      id: `antwort-id-darf-nicht-in-bericht-${aufrufe.length}`,
      status: "completed",
      output_text: `GEHEIMER MODELLTEXT DARF NICHT IN BERICHT ${aufrufe.length}`,
      usage: {
        input_tokens: input,
        output_tokens: output,
        total_tokens: input + output,
        input_tokens_details: { cached_tokens: Math.floor(input / 5) },
        output_tokens_details: { reasoning_tokens: Math.floor(output / 4) }
      }
    });
  };
  const erwarteteErhebungUtc = `${basis.preisdatumUtc}T12:00:00.000Z`;
  let uhr = Date.parse(erwarteteErhebungUtc) - 100;
  const bericht = await Z.fuehreMesslauf(basis, {
    fetchImpl: fakeFetch,
    jetztMs: () => { uhr += 100; return uhr; }
  });
  const berichtText = JSON.stringify(bericht);
  check("C1 Die Vorprobe fuehrt exakt drei Aufrufe ohne Wiederholung aus",
    aufrufe.length === 3 && bericht.aufrufe === 3 && bericht.wiederholungen === 0);
  check("C2 Alle Aufrufe gehen nur an den einen Responses Pfad",
    aufrufe.every((a) => a.url === "https://helmut-z3b-test.openai.azure.com/openai/v1/responses"
      && a.optionen.method === "POST"));
  check("C3 Der Key steht nur im api-key Kopf und nie im Rumpf",
    aufrufe.every((a) => a.optionen.headers["api-key"] === TEST_KEY
      && !("Authorization" in a.optionen.headers)
      && !a.optionen.body.includes(TEST_KEY)));
  check("C4 Providerseitige Speicherung ist bei jeder Anfrage ausgeschaltet",
    aufrufe.every((a) => a.payload.store === false));
  check("C5 Es gibt technisch immer nur einen gleichzeitigen Aufruf",
    gleichzeitigMax === 1 && bericht.parallelitaet === 1);
  check("C6 Echte usage Felder werden einschliesslich Cache und Reasoning aggregiert",
    bericht.auswertung.gesamt.usage.input > 0
      && bericht.auswertung.gesamt.usage.output > 0
      && bericht.auswertung.gesamt.usage.cached > 0
      && bericht.auswertung.gesamt.usage.reasoning > 0);
  check("C7 Laufzeit und Token werden je Klasse mit p50, p95 und p99 ausgewiesen",
    P.KLASSEN.every((klasse) => {
      const wert = bericht.auswertung.jeKlasse[klasse];
      return wert.aufrufe === 1 && wert.dauerMs.p50 != null && wert.dauerMs.p95 != null
        && wert.dauerMs.p99 != null && wert.inputTokens.p50 != null;
    }));
  const monoton = (v, n) => v.n === n
    && v.min <= v.p50 && v.p50 <= v.p95 && v.p95 <= v.p99 && v.p99 <= v.max
    && v.mittel >= v.min && v.mittel <= v.max;
  check("C7a Alle erzeugten Laufzeit und Tokenverteilungen sind vollstaendig und monoton",
    P.KLASSEN.every((klasse) => {
      const wert = bericht.auswertung.jeKlasse[klasse];
      return monoton(wert.dauerMs, 1) && monoton(wert.inputTokens, 1)
        && monoton(wert.outputTokens, 1);
    })
      && monoton(bericht.auswertung.gesamt.dauerMs, 3)
      && monoton(bericht.auswertung.gesamt.inputTokens, 3)
      && monoton(bericht.auswertung.gesamt.outputTokens, 3));
  check("C8 Der Bericht enthaelt weder Key, Antwort ID, Modelltext noch Prompt",
    !berichtText.includes(TEST_KEY)
      && !berichtText.includes("antwort-id")
      && !berichtText.includes("GEHEIMER MODELLTEXT")
      && !berichtText.includes("Synthetischer politischer"));
  check("C9 Der Bericht nennt nur den Endpoint Fingerabdruck",
    bericht.endpointHash.length === 64 && !berichtText.includes("helmut-z3b-test.openai.azure.com"));
  check("C9a Der Bericht traegt den separat belegten Modelltyp",
    bericht.modell === "gpt-5-mini");
  check("C9b Der Bericht traegt einen echten UTC Erhebungszeitpunkt vom Preisdatum",
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(bericht.erhobenUtc)
      && bericht.erhobenUtc === erwarteteErhebungUtc
      && bericht.erhobenUtc.slice(0, 10) === bericht.preisdatumUtc);
  check("C9c Der Bericht bindet Laufbeginn und Laufende an eine endliche Gesamtdauer",
    Date.parse(bericht.beendetUtc) - Date.parse(bericht.erhobenUtc) === bericht.dauerGesamtMs
      && bericht.dauerGesamtMs >= 0);
  check("C10 Keine Datenbank, Production Daten oder Quellenanbieter wurden beruehrt",
    bericht.productionDatenBeruehrt === false
      && bericht.datenbankBeruehrt === false
      && bericht.quellenanbieterAufrufe === 0);
  check("C11 Die Kostenrechnung bleibt unter dem freigegebenen Riegel",
    bericht.auswertung.gesamt.kostenGeschaetztUsd > 0
      && bericht.auswertung.gesamt.kostenGeschaetztUsd < bericht.kostenlimitUsd);

  let fehlerAufrufe = 0;
  let fehlerText = "";
  try {
    await Z.eineAnfrage(basis, basis.messauftraege[0], async () => {
      fehlerAufrufe += 1;
      throw new Error(`Transport nennt versehentlich ${TEST_KEY}`);
    });
  } catch (fehler) { fehlerText = fehler.message; }
  check("C12 Netzfehler wird nicht wiederholt", fehlerAufrufe === 1);
  check("C13 Ein im Transportfehler wiederholter Key wird nicht ausgegeben",
    !fehlerText.includes(TEST_KEY) && /ohne Detailausgabe/.test(fehlerText));

  let drosselAufrufe = 0;
  let drosselText = "";
  try {
    await Z.fuehreMesslauf(basis, { fetchImpl: async () => {
      drosselAufrufe += 1;
      return antwort(429, null, `Drosselrumpf ${TEST_KEY}`);
    } });
  } catch (fehler) { drosselText = fehler.message; }
  check("C14 Schon die erste 429 beendet den Lauf ohne Wiederholung",
    drosselAufrufe === 1 && /HTTP 429/.test(drosselText) && !drosselText.includes(TEST_KEY));

  let usageAufrufe = 0;
  check("C15 Fehlender usage Block beendet den Lauf nach genau einem Aufruf",
    await verwirft(() => Z.fuehreMesslauf(basis, { fetchImpl: async () => {
      usageAufrufe += 1;
      return antwort(200, { status: "completed", output_text: "inhalt" });
    } }), /usage Block/) && usageAufrufe === 1);
  check("C16 Widerspruechliche Tokenzahlen werden abgelehnt",
    wirft(() => Z.usageAus({ usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 99,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 }
    } }), /widerspruchsfreien/));
  check("C17 Ein unvollstaendiger Modellstatus wird ehrlich abgebrochen",
    await verwirft(() => Z.eineAnfrage(basis, basis.messauftraege[0], async () => antwort(200, {
      status: "incomplete",
      usage: {
        input_tokens: 10, output_tokens: 5, total_tokens: 15,
        input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 }
      }
    })), /Antwortstatus.*incomplete/));

  const quelltext = [
    fs.readFileSync(path.join(ROOT, "scripts", "fixtures", "z3b-azure-plan.js"), "utf8"),
    fs.readFileSync(path.join(ROOT, "scripts", "fixtures", "z3b-azure-bericht.js"), "utf8"),
    fs.readFileSync(path.join(ROOT, "scripts", "skalierung-z3b-azure.js"), "utf8")
  ].join("\n");
  check("C18 Im Werkzeug ist kein echter Azure Key gespeichert",
    !/AZURE[_-]KEY[_-][A-Za-z0-9]{16,}/.test(quelltext));

  console.log("\n== D · Einzelwertbindung und exaktes Berichtsschema ==");
  let stichUhr = Date.parse(`${stichConfig.preisdatumUtc}T12:00:00.000Z`) - 100;
  const stichBericht = await Z.fuehreMesslauf(stichConfig, {
    fetchImpl: fakeFetch,
    jetztMs: () => { stichUhr += 100; return stichUhr; }
  });
  const stichEnde = new Date(stichBericht.beendetUtc);
  const geprueft = B.pruefeAzureBericht(stichBericht, {
    jetzt: stichEnde,
    heuteUtc: stichBericht.beendetUtc.slice(0, 10)
  });
  check("D1 Exakt 21 bereinigte Einzelmessungen mit eindeutigen Run IDs werden nachgerechnet",
    stichBericht.einzelmessungen.length === 21
      && new Set(stichBericht.einzelmessungen.map((m) => m.runId)).size === 21
      && geprueft.aggregateAusEinzelmessungenNachgerechnet === true);
  check("D2 Der Validator behauptet keine externe Herkunft, Deployment oder Preisbindung",
    geprueft.externeHerkunftBewiesen === false
      && geprueft.deploymentUndPreisExternBewiesen === false
      && geprueft.entscheidungsgrundlageVollstaendig === false);
  const aggregatGefaelscht = JSON.parse(JSON.stringify(stichBericht));
  aggregatGefaelscht.auswertung.gesamt.dauerMs.p95 += 1;
  check("D3 Frei erfundene Aggregate werden gegen die Einzelmessungen abgelehnt",
    wirft(() => B.pruefeAzureBericht(aggregatGefaelscht, {
      jetzt: stichEnde, heuteUtc: stichBericht.beendetUtc.slice(0, 10)
    }), /Aggregate stimmen nicht/));
  const runDoppelt = JSON.parse(JSON.stringify(stichBericht));
  runDoppelt.einzelmessungen[1].runId = runDoppelt.einzelmessungen[0].runId;
  check("D4 Doppelte Einzelmessungs Run IDs werden abgelehnt",
    wirft(() => B.pruefeAzureBericht(runDoppelt, {
      jetzt: stichEnde, heuteUtc: stichBericht.beendetUtc.slice(0, 10)
    }), /keine eindeutigen Run IDs/));
  const koerziert = JSON.parse(JSON.stringify(stichBericht)); koerziert.parallelitaet = "1";
  check("D5 Zahlenkoerzierung ist im Bericht ausgeschlossen",
    wirft(() => B.pruefeAzureBericht(koerziert, {
      jetzt: stichEnde, heuteUtc: stichBericht.beendetUtc.slice(0, 10)
    }), /sichere Ganzzahl/));
  const fremdesFeld = JSON.parse(JSON.stringify(stichBericht)); fremdesFeld.bestanden = true;
  check("D6 Unbekannte Statusfelder werden fail closed abgelehnt",
    wirft(() => B.pruefeAzureBericht(fremdesFeld, {
      jetzt: stichEnde, heuteUtc: stichBericht.beendetUtc.slice(0, 10)
    }), /unbekannte Felder/));
  check("D7 Ein in die Zukunft verschobenes Laufende wird an echtes jetzt gebunden",
    wirft(() => B.pruefeAzureBericht(stichBericht, {
      jetzt: new Date(Date.parse(stichBericht.beendetUtc) - 1),
      heuteUtc: stichBericht.beendetUtc.slice(0, 10)
    }), /Zukunft/));
  check("D8 Provider Usage Zahlen werden nicht aus Texten koerziert",
    wirft(() => Z.usageAus({ usage: {
      input_tokens: "10", output_tokens: 5, total_tokens: 15,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 }
    } }), /widerspruchsfreien/));
  const zeitlichUnmoeglich = JSON.parse(JSON.stringify(stichBericht));
  zeitlichUnmoeglich.einzelmessungen.forEach((messung) => {
    messung.dauerMs = zeitlichUnmoeglich.dauerGesamtMs;
  });
  zeitlichUnmoeglich.auswertung = B.auswertungAus(
    zeitlichUnmoeglich.einzelmessungen,
    zeitlichUnmoeglich.preis
  );
  check("D9 Neu berechnete Einzelaggregate koennen keine zeitlich unmoegliche Sequenz gruenden",
    wirft(() => B.pruefeAzureBericht(zeitlichUnmoeglich, {
      jetzt: stichEnde, heuteUtc: stichBericht.beendetUtc.slice(0, 10)
    }), /Summe der Einzelmessungsdauern uebersteigt/));
  const zuHohesKostenlimit = JSON.parse(JSON.stringify(stichBericht));
  zuHohesKostenlimit.kostenlimitUsd = 999;
  zuHohesKostenlimit.konservativeKostenobergrenzeVorherUsd = 998;
  check("D10 Der Bericht kann den technischen Kostenriegel von hoechstens 1 USD nicht erweitern",
    wirft(() => B.pruefeAzureBericht(zuHohesKostenlimit, {
      jetzt: stichEnde, heuteUtc: stichBericht.beendetUtc.slice(0, 10)
    }), /darf 1 USD nicht ueberschreiten/));
  const vorabgrenzeZuKlein = JSON.parse(JSON.stringify(stichBericht));
  vorabgrenzeZuKlein.konservativeKostenobergrenzeVorherUsd = 0.00000001;
  check("D11 Die behauptete konservative Vorabgrenze muss die nachgerechneten Istkosten decken",
    wirft(() => B.pruefeAzureBericht(vorabgrenzeZuKlein, {
      jetzt: stichEnde, heuteUtc: stichBericht.beendetUtc.slice(0, 10)
    }), /ueber der vor dem Lauf angegebenen konservativen Kostenobergrenze/));
  const rundungsAngriff = JSON.parse(JSON.stringify(stichBericht));
  rundungsAngriff.preis = { inputUsdJeMio: 0.00034, outputUsdJeMio: 0.00034 };
  rundungsAngriff.einzelmessungen.forEach((messung) => {
    messung.usage = { input: 1, output: 1, total: 2, cached: 0, reasoning: 0 };
  });
  rundungsAngriff.auswertung = B.auswertungAus(
    rundungsAngriff.einzelmessungen,
    rundungsAngriff.preis
  );
  rundungsAngriff.kostenlimitUsd = 0.00000001;
  rundungsAngriff.konservativeKostenobergrenzeVorherUsd = 0.00000001;
  check("D12 Kosten oberhalb des Limits koennen nicht auf das Limit abgerundet werden",
    wirft(() => B.pruefeAzureBericht(rundungsAngriff, {
      jetzt: stichEnde, heuteUtc: stichBericht.beendetUtc.slice(0, 10)
    }), /ungerundete.*Kosten.*ueber/));

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch(() => {
  console.error("Testabbruch ohne Detailausgabe");
  process.exit(1);
});
