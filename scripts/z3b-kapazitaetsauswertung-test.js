"use strict";

// Rein lokaler Vertragstest fuer die spaetere Z3b Kapazitaetsentscheidung.

const K = require("./fixtures/z3b-kapazitaetsauswertung");
const A = require("./fixtures/z3b-azure-bericht");
const T = require("./fixtures/z3b-tagesbedarf-bericht");
const P = require("./fixtures/z3b-production-beobachtung");
const FAIR = require("../lib/helmut/llm-budget-fair");
const PIPELINE = require("../lib/helmut/scalable-pipeline");

const HEUTE_UTC = "2026-08-28";
const JETZT_UTC = "2026-08-28T12:00:00.000Z";
const TAG_MS = 24 * 60 * 60 * 1000;
const STANDARD_BEDARF = Object.freeze({ understanding: 210, lage: 25, buero: 15 });
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function wirft(fn, muster) {
  try { fn(); return false; } catch (fehler) { return muster.test(String(fehler && fehler.message)); }
}

function klon(wert) {
  return JSON.parse(JSON.stringify(wert));
}

function verteilung(werte) {
  const sortiert = [...werte].sort((a, b) => a - b);
  const q = (p) => sortiert[Math.min(sortiert.length - 1, Math.floor(p * (sortiert.length - 1)))];
  return {
    n: sortiert.length,
    min: sortiert[0],
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: sortiert[sortiert.length - 1],
    mittel: Math.round(sortiert.reduce((summe, wert) => summe + wert, 0) / sortiert.length * 10) / 10
  };
}

function azureMessblock(dauern, inputs, outputs, preis) {
  const input = inputs.reduce((summe, wert) => summe + wert, 0);
  const output = outputs.reduce((summe, wert) => summe + wert, 0);
  const usage = { input, output, total: input + output, cached: 0, reasoning: 0 };
  return {
    aufrufe: dauern.length,
    dauerMs: verteilung(dauern),
    inputTokens: verteilung(inputs),
    outputTokens: verteilung(outputs),
    usage,
    kostenGeschaetztUsd: Math.round(
      ((input / 1e6) * preis.inputUsdJeMio + (output / 1e6) * preis.outputUsdJeMio) * 1e8
    ) / 1e8
  };
}

function azureBericht() {
  const preis = { inputUsdJeMio: 0.25, outputUsdJeMio: 2 };
  const roh = {
    understanding: {
      dauern: [2100, 2100, 2100, 2100, 2100, 2100, 2400],
      inputs: [4800, 4800, 4800, 4800, 4800, 4800, 5000],
      outputs: [360, 360, 360, 360, 360, 360, 400]
    },
    lage: {
      dauern: [1700, 1700, 1700, 1700, 1700, 1700, 1900],
      inputs: [2100, 2100, 2100, 2100, 2100, 2100, 2200],
      outputs: [420, 420, 420, 420, 420, 420, 450]
    },
    buero: {
      dauern: [1200, 1200, 1200, 1200, 1200, 1200, 1400],
      inputs: [900, 900, 900, 900, 900, 900, 1000],
      outputs: [260, 260, 260, 260, 260, 260, 300]
    }
  };
  let nummer = 0;
  const einzelmessungen = Object.entries(roh).flatMap(([klasse, wert]) =>
    wert.dauern.map((dauerMs, index) => {
      nummer += 1;
      const input = wert.inputs[index];
      const output = wert.outputs[index];
      return {
        runId: `azure2101-${String(nummer).padStart(2, "0")}`,
        klasse,
        dauerMs,
        usage: { input, output, total: input + output, cached: 0, reasoning: 0 }
      };
    }));
  return {
    schemaVersion: A.SCHEMA_VERSION,
    art: A.ART,
    ergebnis: A.ERGEBNIS_FORMAL,
    modus: "stichprobe",
    laufKennung: "azure2101",
    erhobenUtc: "2026-08-28T00:00:00.000Z",
    beendetUtc: "2026-08-28T00:01:00.000Z",
    deployment: "gpt5mini-prod",
    modell: "gpt-5-mini",
    deploymentart: "data-zone",
    region: "swedencentral",
    endpointHash: "1".repeat(64),
    aufrufe: 21,
    parallelitaet: 1,
    wiederholungen: 0,
    dauerGesamtMs: 60000,
    synthetischePrompts: true,
    productionDatenBeruehrt: false,
    datenbankBeruehrt: false,
    quellenanbieterAufrufe: 0,
    antwortinhalteGespeichert: false,
    storeParameter: false,
    preis,
    preisquelle: "Azure OpenAI Service Pricing",
    preisdatumUtc: HEUTE_UTC,
    kostenlimitUsd: 0.25,
    konservativeKostenobergrenzeVorherUsd: 0.2,
    einzelmessungen,
    auswertung: A.auswertungAus(einzelmessungen, preis)
  };
}

function tagesbedarfsBericht(zielMandate = 25, bedarf = STANDARD_BEDARF) {
  const tag = (nummer, abschlag) => ({
    tag: nummer,
    vollstaendig: true,
    aufrufe: Object.fromEntries(Object.entries(bedarf).map(([klasse, wert]) => [
      klasse, Math.max(0, wert - abschlag)
    ]))
  });
  return {
    schemaVersion: T.SCHEMA_VERSION,
    art: T.ART,
    ergebnis: T.ERGEBNIS_FORMAL,
    zielMandate,
    lokalerFachweg: true,
    production: false,
    synthetisch: true,
    hochrechnung: false,
    laufKennung: `fachweg${zielMandate}`,
    fachwegBelegHash: "a".repeat(64),
    gitSha: "b".repeat(40),
    fachwegtage: [tag(1, 1), tag(2, 0)]
  };
}

function kapazitaetsGrundlage(zielMandate = 25, bedarf = STANDARD_BEDARF) {
  const belege = {
    azureBericht: azureBericht(),
    tagesbedarfsbericht: tagesbedarfsBericht(zielMandate, bedarf)
  };
  const bericht = K.berechneKiDeckel({ ...belege, heuteUtc: HEUTE_UTC, jetztUtc: JETZT_UTC });
  return { bericht, belege };
}

function kostenrahmen(bericht, aenderung = {}) {
  const hash = K.inhaltFingerabdruck(bericht);
  return {
    schemaVersion: K.KOSTENRAHMEN_VERSION,
    status: K.KOSTENRAHMEN_STATUS_FORMAL,
    zielMandate: bericht.aktiveMandate,
    waehrung: "USD",
    maxUsdProTag: Math.ceil(
      (bericht.kostenSzenarioBeobachteteMaxTokensBeiVollemDeckelUsd + 1) * 100
    ) / 100,
    kostenstoppWirksam: true,
    harteTokenobergrenzeOffenBestaetigt: true,
    kapazitaetsberichtHash: hash,
    kostenstoppBelegHash: "c".repeat(64),
    freigabeKennung: `z3b-kosten:${bericht.aktiveMandate}:${hash}`,
    ...aenderung
  };
}

const SLOT_IDS = Object.freeze(Array.from({ length: 20 }, (_, index) =>
  `slot-${String(index + 1).padStart(2, "0")}`));

function produktionsBeobachtungsbericht(aktiveStufe = 10) {
  const heuteZeit = Date.parse(`${HEUTE_UTC}T00:00:00.000Z`);
  const tage = Array.from({ length: 7 }, (_, tagIndex) => {
    const datumUtc = new Date(heuteZeit - (7 - tagIndex) * TAG_MS).toISOString().slice(0, 10);
    const slots = SLOT_IDS.map((slotId, slotIndex) => ({
      slotId,
      runId: `slotrun-${datumUtc}-${slotIndex + 1}`,
      dauerMs: 100000 + slotIndex * 1000,
      ausloeser: "cron",
      natuerlich: true,
      vollstaendig: true
    }));
    const weckquittungen = slots.map((slot, slotIndex) => ({
      quittungId: `wakeq-${datumUtc}-${slotIndex + 1}`,
      slotId: slot.slotId,
      ausloeserRunId: slot.runId,
      weckRunId: `wakerun-${datumUtc}-${slotIndex + 1}`,
      transport: "sqs",
      natuerlich: true,
      vollstaendig: true,
      angenommen: true,
      verarbeitet: true,
      doppelt: false
    }));
    return {
      datumUtc,
      vonUtc: `${datumUtc}T00:00:00.000Z`,
      bisUtcExklusiv: new Date(Date.parse(`${datumUtc}T00:00:00.000Z`) + TAG_MS).toISOString(),
      vollstaendig: true,
      natuerlich: true,
      aktiveMandate: aktiveStufe,
      aktiveMandatsmengenSha256: "1".repeat(64),
      gitSha: "2".repeat(40),
      deployment: "dpl_StrictProductionProof",
      migrationenSha256: "3".repeat(64),
      konfigurationSha256: "4".repeat(64),
      rohwerteSha256: (tagIndex + 5).toString(16).padStart(64, "0"),
      runIds: [...slots.map((slot) => slot.runId),
        ...weckquittungen.map((quittung) => quittung.weckRunId)],
      zaehler: {
        offenAnfang: 5,
        ankunft: 100,
        abfluss: 100,
        offenEnde: 5,
        endgueltigeFehler: 0,
        unbekannt: 0,
        dubletten: 0,
        haengendeLeases: 0,
        briefingFehlt: 0,
        kiDeckelErreicht: false
      },
      aeltesterOffenerStunden: 2,
      slots,
      weckquittungen
    };
  });
  return {
    schema: P.SCHEMA,
    art: P.ART,
    production: true,
    synthetisch: false,
    simulation: false,
    hochrechnung: false,
    erhobenUtc: "2026-08-28T00:05:00.000Z",
    aktiveStufe,
    erwarteteSlotIds: [...SLOT_IDS],
    ereignistransport: "sqs",
    tage
  };
}

function gruenerTag(index, aktiveMandate = 10) {
  return {
    datumUtc: `2026-08-${String(index + 1).padStart(2, "0")}`,
    vollstaendig: true,
    aktiveMandate,
    ankunft: 300, abfluss: 305, aeltesterOffenerStunden: 2,
    unbekannt: 0, dubletten: 0, haengendeLeases: 0,
    endgueltigeFehler: 0, briefingFehlt: 0, kiDeckelErreicht: false
  };
}

function grueneTage(aktiveMandate = 10, anzahl = 7) {
  return Array.from({ length: anzahl }, (_, index) => gruenerTag(index, aktiveMandate));
}

const VORSTUFE = Object.freeze({ 10: 5, 25: 10, 50: 25, 100: 50, 200: 100, 500: 200 });
function entscheidungsBasis(zielMandate = 25, bedarf = STANDARD_BEDARF) {
  const grundlage = kapazitaetsGrundlage(zielMandate, bedarf);
  return {
    zielMandate,
    vorherigeAktivstufe: VORSTUFE[zielMandate],
    fachwegGemessenBis: zielMandate === 10 ? 25 : zielMandate,
    supabaseGemessenBis: zielMandate === 10 ? 25 : zielMandate,
    supabaseFehler: 0,
    kapazitaetsbericht: grundlage.bericht,
    kapazitaetsbelege: grundlage.belege,
    betreiberKostenrahmen: kostenrahmen(grundlage.bericht),
    kiDeckelKonfiguriert: grundlage.bericht.empfohlenerGesamtdeckel,
    kiGlobalAnteilKonfiguriert: grundlage.bericht.globalAnteil,
    kiUnderstandingReserveKonfiguriert: grundlage.bericht.empfohleneUnderstandingReserve,
    produktionsBeobachtungsbericht: produktionsBeobachtungsbericht(VORSTUFE[zielMandate]),
    vertrauenswuerdigeSlotIds: SLOT_IDS,
    codeUndMigrationen: {
      pr272Merged: true, pr273Merged: true, parserfixDeployed: true,
      planungszeitbudgetDeployed: true, monitoringHardeningDeployed: true,
      f9Applied: true, z22Applied: true
    },
    heuteUtc: HEUTE_UTC,
    jetztUtc: JETZT_UTC
  };
}

function main() {
  console.log("Helmut — lokaler Vertragstest der Z3b Kapazitaetsauswertung\n");

  console.log("== A · KI Deckel aus gebundenen Belegen ==");
  const grundlage = kapazitaetsGrundlage();
  const deckel = grundlage.bericht;
  check("A1 Der Gesamtbedarf summiert die beobachteten Klassenmaxima aus zwei vollstaendigen Fachwegtagen",
    deckel.gesamtAufrufeAusBeobachtetenKlassenTagesmaxima === 250
      && deckel.tagesbedarfBeleg.fachwegtage === 2);
  check("A2 25 Prozent freie Kapazitaet bedeutet Bedarf geteilt durch 0,75",
    deckel.empfohlenerGesamtdeckel === 334);
  check("A3 Die Understanding Reserve liegt innerhalb des Gesamtdeckels",
    deckel.empfohleneUnderstandingReserve === 280
      && deckel.empfohleneUnderstandingReserve + deckel.nichtPriorisierteKapazitaet
        === deckel.empfohlenerGesamtdeckel);
  check("A4 Token werden als Schaetzung aus p95 je Aufruf und beobachteten Klassenmaxima verrechnet",
    deckel.inputTokensSchaetzungAusP95JeAufrufProTag === 1074000
      && deckel.outputTokensSchaetzungAusP95JeAufrufProTag === 90000);
  check("A5 Die Rechnung behauptet nur formale Validierung und keinen Herkunftsnachweis",
    /Reine Formalrechnung/.test(deckel.beweisart)
      && /externe Herkunft/.test(deckel.beweisart)
      && /kein Lastnachweis/.test(deckel.beweisart));
  check("A6 Beobachtete Max Token sind nur ein Szenario und die harte Obergrenze bleibt offen",
    deckel.kostenSzenarioBeobachteteMaxTokensBeiVollemDeckelUsd
      >= deckel.kostenP95SchaetzungProTagUsd
      && deckel.harteKostenobergrenze.status === "offen"
      && deckel.harteKostenobergrenze.usd === null
      && /Tokenhartgrenze/.test(deckel.harteKostenobergrenze.grund));
  check("A7 Lose Azure Klassen und eine separate Preisattrappe werden nicht mehr angenommen",
    wirft(() => K.berechneKiDeckel({
      aktiveMandate: 25,
      tagesbedarf: STANDARD_BEDARF,
      azure: { understanding: {}, lage: {}, buero: {} },
      preis: { inputUsdJeMio: 1, outputUsdJeMio: 1, quelle: "attrappe" }
    }), /Tagesbedarfsbericht/));
  const ohneKlasse = tagesbedarfsBericht();
  delete ohneKlasse.fachwegtage[1].aufrufe.buero;
  check("A8 Eine fehlende Arbeitsform im Fachwegtag wird abgelehnt",
    wirft(() => K.berechneKiDeckel({
      tagesbedarfsbericht: ohneKlasse, azureBericht: azureBericht(), heuteUtc: HEUTE_UTC
    }), /Arbeitsformen/));
  const fremdeKlasse = tagesbedarfsBericht();
  fremdeKlasse.fachwegtage[0].aufrufe.fremd = 1;
  check("A9 Unbekannte Arbeitsformen im Fachwegtag werden abgelehnt",
    wirft(() => K.berechneKiDeckel({
      tagesbedarfsbericht: fremdeKlasse, azureBericht: azureBericht(), heuteUtc: HEUTE_UTC
    }), /Arbeitsformen/));
  check("A10 Ohne Preisquelle im vollstaendigen Azure Bericht gibt es keine Kostenrechnung",
    wirft(() => K.berechneKiDeckel({
      tagesbedarfsbericht: tagesbedarfsBericht(),
      azureBericht: { ...azureBericht(), preisquelle: "" }, heuteUtc: HEUTE_UTC
    }), /Preisquelle/));
  check("A11 Eine Reserve von 25 Prozent wird nicht als Zuschlag gerechnet",
    deckel.empfohlenerGesamtdeckel
      !== Math.ceil(deckel.gesamtAufrufeAusBeobachtetenKlassenTagesmaxima * 1.25));
  const rotation200 = K.bewerteMandatsrotation({ aktiveMandate: 200, deckel: 100 });
  const rotation500 = K.bewerteMandatsrotation({ aktiveMandate: 500, deckel: 100 });
  check("A12 Deckel 100 ergibt bei 200 und 500 Mandaten exakt 96 und 240 Stunden Vollrotation",
    rotation200.mandatsPlaetze === 50 && rotation200.rotationsStunden === 96
      && rotation500.mandatsPlaetze === 50 && rotation500.rotationsStunden === 240);
  check("A13 Die taegliche Fairness Untergrenze bleibt 399 fuer 200 und 999 fuer 500",
    rotation200.erforderlicherTagesdeckel === 399 && rotation500.erforderlicherTagesdeckel === 999);
  check("A14 Beide Rotationen reissen die 48 Stunden Aufgabenfrist und bestehen nicht",
    rotation200.aufgabenfristSicher === false && rotation500.aufgabenfristSicher === false
      && rotation200.bestanden === false && rotation500.bestanden === false);
  const deckel500 = kapazitaetsGrundlage(500,
    { understanding: 210, lage: 500, buero: 15 }).bericht;
  check("A15 Die 500er Empfehlung nimmt die Fairness Untergrenze statt nur das Tagesmaximum",
    deckel500.deckelAusBeobachtetenKlassenTagesmaxima === 967
      && deckel500.fairnessMindestdeckel === 999
      && deckel500.empfohlenerGesamtdeckel === 999);
  const ohneZiel = tagesbedarfsBericht(); delete ohneZiel.zielMandate;
  check("A16 Ohne Zielstufe im Fachwegbeleg gibt es keine Deckelempfehlung",
    wirft(() => K.berechneKiDeckel({
      tagesbedarfsbericht: ohneZiel, azureBericht: azureBericht(), heuteUtc: HEUTE_UTC
    }), /fehlt.*zielMandate|Zielstufe/));
  check("A17 Fairnessanteil und 48 Stunden Frist sind an die echten Produktionskonstanten gebunden",
    K.KI_GLOBAL_ANTEIL_STANDARD === FAIR.GLOBAL_ANTEIL_STANDARD
      && K.BUDGET_AUFGABENFRIST_STUNDEN * 3600e3 === PIPELINE.BUDGET_MAX_WARTE_MS);
  const echterPlan500 = FAIR.tagesplan({
    mandate: Array.from({ length: 500 }, (_, i) => `m-${i + 1}`),
    deckel: 100, tag: HEUTE_UTC
  });
  check("A18 Der echte Tagesplan bestaetigt die berechneten 50 Mandatsplaetze bei Deckel 100",
    echterPlan500.mandatsTopf === rotation500.mandatsPlaetze
      && echterPlan500.zugeteilt === rotation500.mandatsPlaetze
      && echterPlan500.notwendigOffen === 450);
  check("A19 Das Ergebnis bindet beide Inhalte und die Azure Zielmetadaten",
    /^[a-f0-9]{64}$/.test(deckel.azureBeleg.inhaltsfingerabdruck)
      && /^[a-f0-9]{64}$/.test(deckel.tagesbedarfBeleg.inhaltsfingerabdruck)
      && deckel.azureBeleg.modell === "gpt-5-mini"
      && deckel.azureBeleg.deploymentart === "data-zone"
      && deckel.azureBeleg.region === "swedencentral"
      && deckel.azureBeleg.erhobenUtc === "2026-08-28T00:00:00.000Z"
      && /^[a-f0-9]{64}$/.test(deckel.azureBeleg.einzelmessungenSha256));
  const einTag = tagesbedarfsBericht(); einTag.fachwegtage.pop();
  check("A20 Ein einzelner Fachwegtag reicht nicht",
    wirft(() => K.berechneKiDeckel({
      tagesbedarfsbericht: einTag, azureBericht: azureBericht(), heuteUtc: HEUTE_UTC
    }), /mindestens 2/));
  check("A21 Production, Synthetik und Hochrechnung sind im Bedarfsbeleg fail closed",
    [
      { production: true }, { synthetisch: false }, { hochrechnung: true }, { lokalerFachweg: false }
    ].every((aenderung) => wirft(() => K.berechneKiDeckel({
      tagesbedarfsbericht: { ...tagesbedarfsBericht(), ...aenderung },
      azureBericht: azureBericht(), heuteUtc: HEUTE_UTC
    }), /formale lokale Fachwegzusammenfassung/)));
  const kurzerHash = tagesbedarfsBericht(); kurzerHash.fachwegBelegHash = "abc";
  check("A22 Fachwegbeleg Hash und Git SHA sind zwingend",
    wirft(() => K.berechneKiDeckel({
      tagesbedarfsbericht: kurzerHash, azureBericht: azureBericht(), heuteUtc: HEUTE_UTC
    }), /64 Zeichen/)
      && wirft(() => K.berechneKiDeckel({
        tagesbedarfsbericht: { ...tagesbedarfsBericht(), gitSha: "abc" },
        azureBericht: azureBericht(), heuteUtc: HEUTE_UTC
      }), /Git SHA/));
  check("A23 Alte missverstaendliche Bedarfs und Kostenfeldnamen sind entfernt",
    !("gesamtAufrufeP95" in deckel)
      && !("deckelAusGemessenemBedarf" in deckel)
      && !("kostenP95ProTagUsd" in deckel)
      && !("kostenObergrenzeBeiVollemDeckelUsd" in deckel));
  check("A24 Null, Boolean und Leerstring werden nicht als Zahlen umgedeutet",
    [null, true, false, "", "   "].every((wert) =>
      wirft(() => K.bewerteMandatsrotation({ aktiveMandate: wert, deckel: 100 }), /endliche Zahl/)));
  const ohneBueroMessung = tagesbedarfsBericht(25, { understanding: 210, lage: 25, buero: 0 });
  check("A25 Jede Arbeitsform muss im Fenster mindestens einmal tatsaechlich gemessen sein",
    wirft(() => K.berechneKiDeckel({
      tagesbedarfsbericht: ohneBueroMessung, azureBericht: azureBericht(), heuteUtc: HEUTE_UTC
    }), /Jede Arbeitsform/));
  check("A26 Die reine Rechnung weist den fehlenden nachgeprueften Fachweg Gesamtbericht explizit aus",
    deckel.beleggrenzen.fachwegGesamtberichtInternNachgeprueft === false
      && deckel.beleggrenzen.externeHerkunftBewiesen === false
      && deckel.beleggrenzen.entscheidungsgrundlageVollstaendig === false);
  check("A27 Die Kapazitaetsreserve ist unveraenderlich exakt 0,25",
    wirft(() => K.berechneKiDeckel({ ...grundlage.belege, heuteUtc: HEUTE_UTC,
      jetztUtc: JETZT_UTC, reserve: 0.01 }), /fest 0.25/));
  check("A28 Der Globalanteil ist ohne externen Production Beleg unveraenderlich exakt 0,5",
    wirft(() => K.berechneKiDeckel({ ...grundlage.belege, heuteUtc: HEUTE_UTC,
      jetztUtc: JETZT_UTC, globalAnteil: 0.1 }), /fest 0.5/));
  const zielAlsText = tagesbedarfsBericht(); zielAlsText.zielMandate = "25";
  check("A29 Tagesbedarfszahlen werden nicht aus Texten oder Arrays koerziert",
    wirft(() => K.berechneKiDeckel({ tagesbedarfsbericht: zielAlsText,
      azureBericht: azureBericht(), heuteUtc: HEUTE_UTC, jetztUtc: JETZT_UTC }), /sichere Ganzzahl/));
  const unsichereSumme = tagesbedarfsBericht();
  unsichereSumme.fachwegtage[0].aufrufe.understanding = Number.MAX_SAFE_INTEGER;
  check("A30 Ueberlaufende Tagesbedarfsaggregate werden abgelehnt",
    wirft(() => K.berechneKiDeckel({ tagesbedarfsbericht: unsichereSumme,
      azureBericht: azureBericht(), heuteUtc: HEUTE_UTC, jetztUtc: JETZT_UTC }), /sichere Ganzzahlsumme/));
  check("A31 Der kanonische Hash lehnt Infinity und undefined statt Kollisionsserialisierung ab",
    wirft(() => K.inhaltFingerabdruck({ wert: Infinity }), /Nicht endliche Zahl/)
      && wirft(() => K.inhaltFingerabdruck({ wert: undefined }), /Nicht kanonisierbarer Wert/));
  const azureAggregatGefaelscht = klon(azureBericht());
  azureAggregatGefaelscht.auswertung.gesamt.inputTokens.p95 += 1;
  check("A32 Kapazitaet akzeptiert keine von Azure Einzelmessungen abweichenden Aggregate",
    wirft(() => K.berechneKiDeckel({ tagesbedarfsbericht: tagesbedarfsBericht(),
      azureBericht: azureAggregatGefaelscht, heuteUtc: HEUTE_UTC, jetztUtc: JETZT_UTC }), /Aggregate stimmen nicht/));
  check("A33 Auch mit nachgerechneten Einzelwerten bleiben Azure Deployment und Preis extern offen",
    deckel.beleggrenzen.azureAggregateAusEinzelmessungenNachgerechnet === true
      && deckel.beleggrenzen.azureDeploymentUndPreisExternBewiesen === false
      && /formalrechnung/.test(deckel.ergebnis));
  const sparseFachwegtage = tagesbedarfsBericht();
  sparseFachwegtage.fachwegtage = new Array(2);
  check("A34 Fachwegtage mit Arrayluecken koennen keine NaN Maxima als intern konsistent ausgeben",
    wirft(() => T.pruefeTagesbedarfBericht(sparseFachwegtage), /Arrayluecke/));

  console.log("\n== B · Slot und sieben natuerliche Tage ==");
  const slotGruen = K.bewerteSlot({ p95Ms: 210000, maxMs: 280000 });
  check("B1 Bei 290 Sekunden Budget liegt die 25 Prozent Grenze bei 217,5 Sekunden",
    slotGruen.grenzeMitReserveMs === 217500);
  check("B2 p95 unter Reservegrenze und Maximum an der Stopgrenze ist gruen", slotGruen.bestanden === true);
  check("B3 p95 oberhalb der Reservegrenze ist nicht gruen",
    K.bewerteSlot({ p95Ms: 218000, maxMs: 280000 }).bestanden === false);
  check("B4 Ein Maximum ueber der betrieblichen 280 Sekunden Stopgrenze ist nicht gruen",
    K.bewerteSlot({ p95Ms: 210000, maxMs: 290000 }).bestanden === false);
  check("B5 Sechs Tage sind kein Siebentagenachweis",
    wirft(() => K.bewerteBeobachtung(grueneTage(10, 6)), /mindestens 7/));
  const beobachtung = K.bewerteBeobachtung(grueneTage());
  check("B6 Sieben vollstaendige aufeinanderfolgende Tage derselben Vorstufe bestehen",
    beobachtung.bestanden === true && beobachtung.tage === 7
      && beobachtung.vonDatumUtc === "2026-08-01" && beobachtung.bisDatumUtc === "2026-08-07"
      && beobachtung.aktiveMandate === 10);
  const rueckstau = grueneTage(); rueckstau[3].abfluss = 299;
  check("B7 Schon ein Tag mit Abfluss kleiner Ankunft wird rot",
    K.bewerteBeobachtung(rueckstau).bestanden === false);
  const alt = grueneTage(); alt[2].aeltesterOffenerStunden = 24;
  check("B8 Arbeit ab 24 Stunden wird rot", K.bewerteBeobachtung(alt).bestanden === false);
  const deckelTag = grueneTage(); deckelTag[5].kiDeckelErreicht = true;
  check("B9 Ein erreichter KI Deckel wird rot", K.bewerteBeobachtung(deckelTag).bestanden === false);
  const anomalie = grueneTage(); anomalie[1].dubletten = 1;
  check("B10 Dubletten werden rot", K.bewerteBeobachtung(anomalie).bestanden === false);
  const doppelterTag = grueneTage(); doppelterTag[4].datumUtc = doppelterTag[3].datumUtc;
  check("B11 Ein doppelter statt sieben aufeinanderfolgender Kalendertage wird abgelehnt",
    wirft(() => K.bewerteBeobachtung(doppelterTag), /lueckenlos/));
  const unvollstaendig = grueneTage(); unvollstaendig[2].vollstaendig = false;
  check("B12 Ein unvollstaendiger Kalendertag bleibt rot",
    K.bewerteBeobachtung(unvollstaendig).bestanden === false);
  const stufenwechsel = grueneTage(); stufenwechsel[4].aktiveMandate = 5;
  check("B13 Ein Stufenwechsel im Beobachtungsfenster bleibt rot",
    K.bewerteBeobachtung(stufenwechsel).bestanden === false);
  check("B14 Ein Siebentage Array nur aus Luecken ist kein Beobachtungsnachweis",
    wirft(() => K.bewerteBeobachtung(new Array(7)), /Arrayluecke/));

  console.log("\n== C · Aktivierungstore bis 500 ==");
  check("C1 Es gibt nur die Stufen 10, 25, 50, 100, 200 und 500",
    JSON.stringify(K.AKTIVIERUNGSSTUFEN) === JSON.stringify([10, 25, 50, 100, 200, 500]));
  check("C2 Fuer 10 wird die vorhandene technische 25er Stufe als Huelle verlangt",
    K.erforderlicheMessstufe(10) === 25);
  check("C3 Ab 25 braucht jede Aktivierung ihre eigene Messstufe",
    [25, 50, 100, 200, 500].every((stufe) => K.erforderlicheMessstufe(stufe) === stufe));
  const basis = entscheidungsBasis();
  check("C4 Eine Zwischenstufe darf nicht uebersprungen werden",
    K.bewerteEntscheidungsreife({ ...entscheidungsBasis(50), vorherigeAktivstufe: 10 })
      .gruende.includes("vorherige Aktivstufe stimmt nicht"));
  const reif = K.bewerteEntscheidungsreife(basis);
  check("C5 Auch formal vollstaendige Unterlagen bleiben ohne externe Herkunft nicht entscheidungsreif",
    reif.status === "nicht-entscheidungsreif" && !reif.aktiviert && !reif.freigegeben
      && /^[a-f0-9]{64}$/.test(reif.kapazitaetsberichtHash)
      && reif.kostenrahmen.status === "strukturell-geprueft-externe-wirksamkeit-offen");
  check("C6 Ohne ausreichenden gesetzten KI Deckel bleibt die Stufe gesperrt",
    /KI Deckel/.test(K.bewerteEntscheidungsreife({
      ...basis, kiDeckelKonfiguriert: undefined
    }).gruende.join(" ")));
  check("C7 Ohne F9 bleibt die Stufe gesperrt",
    K.bewerteEntscheidungsreife({ ...basis, codeUndMigrationen: { ...basis.codeUndMigrationen, f9Applied: false } })
      .gruende.includes("F9 ist nicht angewendet"));
  check("C8 Ohne Z22 bleibt die Stufe gesperrt",
    K.bewerteEntscheidungsreife({ ...basis, codeUndMigrationen: { ...basis.codeUndMigrationen, z22Applied: false } })
      .gruende.includes("Z22 ist nicht angewendet"));
  check("C9 Ein Supabase Fehler bleibt rot",
    K.bewerteEntscheidungsreife({ ...basis, supabaseFehler: 1 }).gruende.includes("Supabase Probe hatte Fehler"));
  const basis200 = entscheidungsBasis(200, { understanding: 210, lage: 200, buero: 15 });
  check("C10 Fuer 200 reichen vorhandene 100er Fachwegmessungen ausdruecklich nicht",
    /200/.test(K.bewerteEntscheidungsreife({
      ...basis200, fachwegGemessenBis: 100, supabaseGemessenBis: 100
    }).gruende.join(" ")));
  const basis500 = entscheidungsBasis(500, { understanding: 210, lage: 500, buero: 15 });
  check("C11 Fuer 500 reichen 200er Fachwegmessungen ausdruecklich nicht",
    /500/.test(K.bewerteEntscheidungsreife({
      ...basis500, fachwegGemessenBis: 200, supabaseGemessenBis: 200
    }).gruende.join(" ")));
  check("C12 PR 272 und danach PR 273 bleiben Voraussetzungen",
    K.bewerteEntscheidungsreife({
      ...basis, codeUndMigrationen: { ...basis.codeUndMigrationen, pr272Merged: false, pr273Merged: false }
    }).gruende.filter((grund) => /PR 27/.test(grund)).length === 2);
  check("C13 Sieben gruene Tage auf der falschen Vorstufe reichen nicht",
    /Vorstufe 10/.test(K.bewerteEntscheidungsreife({
      ...basis, produktionsBeobachtungsbericht: produktionsBeobachtungsbericht(5)
    }).gruende.join(" ")));
  check("C14 Ein Gesamtdeckel ohne konfigurierte Understanding Reserve bleibt gesperrt",
    /Understanding Reserve/.test(K.bewerteEntscheidungsreife({
      ...basis, kiUnderstandingReserveKonfiguriert: undefined
    }).gruende.join(" ")));
  check("C15 Eine zu kleine Understanding Reserve bleibt gesperrt",
    /Understanding Reserve/.test(K.bewerteEntscheidungsreife({
      ...basis, kiUnderstandingReserveKonfiguriert: basis.kapazitaetsbericht.empfohleneUnderstandingReserve - 1
    }).gruende.join(" ")));
  check("C16 Eine Reserve ueber dem Gesamtdeckel bleibt gesperrt",
    /ueber dem Gesamtdeckel/.test(K.bewerteEntscheidungsreife({
      ...basis, kiUnderstandingReserveKonfiguriert: basis.kiDeckelKonfiguriert + 1
    }).gruende.join(" ")));
  check("C17 Eine zu grosse Reserve darf Lage und Buero nicht die geplante Kapazitaet nehmen",
    /Lage und Buero/.test(K.bewerteEntscheidungsreife({
      ...basis, kiUnderstandingReserveKonfiguriert: basis.kapazitaetsbericht.empfohleneUnderstandingReserve + 20
    }).gruende.join(" ")));
  const ohneMessstaende = K.bewerteEntscheidungsreife({
    ...basis, fachwegGemessenBis: undefined, supabaseGemessenBis: undefined
  });
  check("C18 Fehlende Fachweg und Supabase Messstaende bleiben fail closed",
    ohneMessstaende.status === "nicht-entscheidungsreif"
      && ohneMessstaende.gruende.includes("voller Fachweg hat keinen gueltigen Messstand")
      && ohneMessstaende.gruende.includes("Supabase hat keinen gueltigen Messstand"));
  const ungueltigeMessstaende = K.bewerteEntscheidungsreife({
    ...basis, fachwegGemessenBis: Infinity, supabaseGemessenBis: "unbekannt"
  });
  check("C19 Unendliche und nichtnumerische Messstaende bleiben fail closed",
    ungueltigeMessstaende.status === "nicht-entscheidungsreif"
      && ungueltigeMessstaende.gruende.filter((grund) => /gueltigen Messstand/.test(grund)).length === 2);
  const manipuliert500 = {
    ...basis500.kapazitaetsbericht,
    empfohlenerGesamtdeckel: 998,
    fairnessMindestdeckel: 998
  };
  const fairnessZuKlein = K.bewerteEntscheidungsreife({
    ...basis500, kapazitaetsbericht: manipuliert500, kiDeckelKonfiguriert: 998
  });
  check("C20 Manuelle 998 fuer 500 werden als manipulierter Bericht fail closed erkannt",
    fairnessZuKlein.status === "nicht-entscheidungsreif"
      && fairnessZuKlein.fairnessMindestdeckel === 999
      && fairnessZuKlein.gruende.includes("KI Kapazitaetsbericht ist nicht intern nachgeprueft"));
  const fairnessAusreichend = K.bewerteEntscheidungsreife(basis500);
  check("C21 Deckel 999 besteht nur das Fairnesstor und laesst das Herkunftstor weiter geschlossen",
    fairnessAusreichend.status === "nicht-entscheidungsreif"
      && fairnessAusreichend.kiRotation.taeglichVollstaendig === true
      && fairnessAusreichend.aktiviert === false && fairnessAusreichend.freigegeben === false);
  check("C22 Ein unbekannter KI Globalanteil bleibt fail closed",
    K.bewerteEntscheidungsreife({ ...basis, kiGlobalAnteilKonfiguriert: undefined })
      .gruende.includes("KI Globalanteil ist nicht gueltig belegt"));
  check("C23 Ohne deployten Parserfix bleibt jede Stufe gesperrt",
    K.bewerteEntscheidungsreife({
      ...basis, codeUndMigrationen: { ...basis.codeUndMigrationen, parserfixDeployed: false }
    }).gruende.includes("Parserfix ist nicht deployt"));
  check("C24 Ohne deployte Planungszeitbudget Haertung bleibt jede Stufe gesperrt",
    K.bewerteEntscheidungsreife({
      ...basis, codeUndMigrationen: { ...basis.codeUndMigrationen, planungszeitbudgetDeployed: false }
    }).gruende.includes("Planungszeitbudget Haertung ist nicht deployt"));
  check("C25 Ohne deployte Monitoring Haertung bleibt jede Stufe gesperrt",
    K.bewerteEntscheidungsreife({
      ...basis, codeUndMigrationen: { ...basis.codeUndMigrationen, monitoringHardeningDeployed: false }
    }).gruende.includes("Monitoring Haertung ist nicht deployt"));
  const loserAltweg = K.bewerteEntscheidungsreife({
    ...basis,
    kapazitaetsbericht: undefined,
    kapazitaetsbelege: undefined,
    betreiberKostenrahmen: undefined,
    azureStichprobenJeKlasse: { understanding: 7, lage: 7, buero: 7 },
    kiDeckelEmpfohlen: 999,
    kiUnderstandingReserveEmpfohlen: 1,
    kiDeckelKonfiguriert: 999,
    kiUnderstandingReserveKonfiguriert: 1
  });
  check("C26 Lose Azure Zaehler und manuelle 999 durch 1 Werte koennen kein Gruen mehr erzeugen",
    loserAltweg.status === "nicht-entscheidungsreif"
      && loserAltweg.gruende.includes("KI Kapazitaetsbericht ist nicht intern nachgeprueft"));
  check("C27 Ohne strukturell geprueften Betreiber Kostenrahmen bleibt die Entscheidung rot",
    K.bewerteEntscheidungsreife({ ...basis, betreiberKostenrahmen: undefined })
      .gruende.includes("Betreiber Kostenrahmen ist nicht einmal strukturell nachgeprueft"));
  check("C28 Ein Kostenrahmen unter dem beobachteten Max Token Szenario bleibt rot",
    K.bewerteEntscheidungsreife({
      ...basis,
      betreiberKostenrahmen: kostenrahmen(basis.kapazitaetsbericht, { maxUsdProTag: 0.00000001 })
    }).gruende.includes("Betreiber Kostenrahmen ist nicht einmal strukturell nachgeprueft"));
  check("C29 Ein Kostenrahmen fuer einen anderen Kapazitaetsbericht bleibt rot",
    K.bewerteEntscheidungsreife({
      ...basis,
      betreiberKostenrahmen: { ...basis.betreiberKostenrahmen, kapazitaetsberichtHash: "d".repeat(64) }
    }).gruende.includes("Betreiber Kostenrahmen ist nicht einmal strukturell nachgeprueft"));
  check("C30 Nullwerte bleiben auch an optionalen Konfigurationsgrenzen echte Fehler",
    wirft(() => K.bewerteEntscheidungsreife({ ...basis, kiDeckelKonfiguriert: null }), /endliche Zahl/));
  check("C31 Schon eine formal gueltig geaenderte Azure Grundlage entwertet den alten Kapazitaetsbericht",
    K.bewerteEntscheidungsreife({
      ...basis,
      kapazitaetsbelege: {
        ...basis.kapazitaetsbelege,
        azureBericht: { ...basis.kapazitaetsbelege.azureBericht, preisquelle: "Andere formale Azure Preisquelle" }
      }
    }).gruende.includes("KI Kapazitaetsbericht ist nicht intern nachgeprueft"));
  const nackteBestanden = K.bewerteEntscheidungsreife({
    ...basis,
    produktionsBeobachtungsbericht: undefined,
    slot: { bestanden: true },
    beobachtung: { bestanden: true, aktiveMandate: VORSTUFE[basis.zielMandate] }
  });
  check("C32 Nackte bestanden Booleans ersetzen niemals den rohen strengen Production Bericht",
    nackteBestanden.status === "nicht-entscheidungsreif"
      && nackteBestanden.slotPruefung === null
      && /Production Beobachtungsbericht.*nicht intern nachgeprueft/.test(nackteBestanden.gruende.join(" ")));
  const zukunftsbericht = klon(basis.produktionsBeobachtungsbericht);
  zukunftsbericht.erhobenUtc = "2026-08-28T13:00:00.000Z";
  check("C33 Ein formal aufgebauter Zukunftsbericht bleibt fail closed",
    /Zukunft/.test(K.bewerteEntscheidungsreife({
      ...basis, produktionsBeobachtungsbericht: zukunftsbericht
    }).gruende.join(" ")));
  check("C34 Der strenge intern gruene Bericht liefert Slotdaten, aber ohne externes Herkunftsattest kein Gruen",
    reif.produktionsBeobachtung.kriterienInternBestanden === true
      && reif.slotPruefung.bestanden === true
      && reif.status === "nicht-entscheidungsreif"
      && reif.gruende.includes("vertrauenswuerdiges externes Herkunftsattest fuer die Production Beobachtung fehlt"));
  check("C35 Ein formal gueltiger Fake Fachweghash bleibt fuer die Entscheidung gesperrt",
    basis.kapazitaetsbelege.tagesbedarfsbericht.fachwegBelegHash === "a".repeat(64)
      && reif.gruende.includes("Tagesbedarfsbericht ist nur formal validiert; der Fachweg Gesamtbericht wurde nicht mitgeliefert und nachgeprueft")
      && reif.nachweisgrenzen.fachwegGesamtberichtInternNachgeprueft === false);
  check("C36 Nackte Messstaende und Code Booleans haben immer offene Herkunft",
    reif.gruende.includes("voller Fachweg Messstand hat keinen zielgebundenen extern verifizierten Herkunftsbericht")
      && reif.gruende.includes("Supabase Messstand hat keinen zielgebundenen extern verifizierten Herkunftsbericht")
      && reif.gruende.includes("Code und Migrationsvollzug haben keinen zielgebundenen extern verifizierten Herkunftsbericht"));
  check("C37 Ein beliebiger formal passender Kostenhash und Boolean belegt keine externe Wirksamkeit",
    reif.kostenrahmen.kostenstoppExternBewiesen === false
      && reif.kostenrahmen.wirksamkeitExternBewiesen === false
      && reif.gruende.includes("Betreiber Kostenrahmen ist hoechstens strukturell geprueft; ein vertrauenswuerdiger externer Kostenstoppbeleg fehlt"));
  check("C38 Ein frei gesetztes Herkunftsboolean kann das unvermeidliche Herkunftstor nicht oeffnen",
    K.bewerteEntscheidungsreife({ ...basis, produktionsHerkunftBewiesen: true })
      .gruende.includes("vertrauenswuerdiges externes Herkunftsattest fuer die Production Beobachtung fehlt"));
  const gekuerzteFreigabe = kostenrahmen(basis.kapazitaetsbericht);
  gekuerzteFreigabe.freigabeKennung = `z3b-kosten:${basis.zielMandate}:${
    K.inhaltFingerabdruck(basis.kapazitaetsbericht).slice(0, 16)}`;
  check("C39 Eine auf 16 Zeichen gekuerzte Kostenfreigabe reicht nicht mehr",
    wirft(() => K.pruefeBetreiberKostenrahmen(gekuerzteFreigabe, basis.kapazitaetsbericht), /zielbezogen/));
  check("C40 Konfigurierte Deckel werden nicht aus Texten koerziert",
    wirft(() => K.bewerteEntscheidungsreife({
      ...basis, kiDeckelKonfiguriert: String(basis.kiDeckelKonfiguriert)
    }), /endliche Zahl/));
  const globalAlsText = K.bewerteEntscheidungsreife({ ...basis, kiGlobalAnteilKonfiguriert: "0.5" });
  check("C41 Ein Globalanteil als Text bleibt fail closed",
    globalAlsText.gruende.includes("KI Globalanteil ist nicht gueltig belegt"));
  const ohneVertrauensSlotplan = K.bewerteEntscheidungsreife({
    ...basis, vertrauenswuerdigeSlotIds: undefined
  });
  check("C42 Der selbst deklarierte Slotplan allein reicht auch im Aktivierungsentscheid nicht",
    ohneVertrauensSlotplan.status === "nicht-entscheidungsreif"
      && ohneVertrauensSlotplan.produktionsBeobachtung.kriterienInternBestanden === false
      && /Vorstufenbeobachtung ist intern nicht gruen/i.test(ohneVertrauensSlotplan.gruende.join(" ")));

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main();
