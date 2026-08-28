"use strict";

// Reine Auswertung bereits erhobener, aggregierter Messwerte. Kein Netz, keine
// Datenbank, keine Umgebungsvariablen und keine Aktivierungsfunktion.

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

function endlicheZahl(wert, name, { nullErlaubt = false, minimum = 0 } = {}) {
  if (nullErlaubt && (wert === null || wert === undefined)) return null;
  const zahl = Number(wert);
  if (!Number.isFinite(zahl) || zahl < minimum) throw new Error(`${name} ist keine gueltige Zahl`);
  return zahl;
}

function reserveAnteil(wert) {
  const anteil = endlicheZahl(wert, "Reserveanteil");
  if (anteil <= 0 || anteil >= 0.5) throw new Error("Reserveanteil muss groesser 0 und kleiner 0,5 sein");
  return anteil;
}

function globalAnteil(wert = KI_GLOBAL_ANTEIL_STANDARD) {
  const anteil = endlicheZahl(wert, "KI Globalanteil");
  if (anteil <= 0 || anteil >= 1) {
    throw new Error("KI Globalanteil muss groesser 0 und kleiner 1 sein");
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
  const mandate = endlicheZahl(aktiveMandate, "aktive Mandate", { minimum: 1 });
  if (!Number.isInteger(mandate)) throw new Error("aktive Mandate ist keine ganze Zahl");
  const global = globalAnteil(anteil);
  let unten = 0;
  let oben = Math.max(1, mandate);
  while (mandatsPlaetzeJeTag(oben, global) < mandate) oben *= 2;
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
  const mandate = endlicheZahl(aktiveMandate, "aktive Mandate", { minimum: 1 });
  const gesamtdeckel = endlicheZahl(deckel, "KI Tagesdeckel", { minimum: 1 });
  const frist = endlicheZahl(aufgabenfristStunden, "Budget Aufgabefrist", { minimum: 1 });
  if (!Number.isInteger(mandate) || !Number.isInteger(gesamtdeckel)) {
    throw new Error("aktive Mandate und KI Tagesdeckel muessen ganze Zahlen sein");
  }
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
  return Math.round(Number(wert) * 1e8) / 1e8;
}

function datumUtc(wert, name) {
  const text = String(wert || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${name} ist kein UTC Kalenderdatum`);
  const zeit = Date.parse(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(zeit) || new Date(zeit).toISOString().slice(0, 10) !== text) {
    throw new Error(`${name} ist kein gueltiges UTC Kalenderdatum`);
  }
  return Object.freeze({ text, zeit });
}

function berechneKiDeckel({ aktiveMandate, tagesbedarf, azure, preis,
  reserve = RESERVE_ANTEIL_STANDARD,
  globalAnteil: globalAnteilWert = KI_GLOBAL_ANTEIL_STANDARD } = {}) {
  const reserveWert = reserveAnteil(reserve);
  const mandate = endlicheZahl(aktiveMandate, "aktive Mandate", { minimum: 1 });
  if (!Number.isInteger(mandate)) throw new Error("aktive Mandate ist keine ganze Zahl");
  const global = globalAnteil(globalAnteilWert);
  const bedarf = jeKlasse(tagesbedarf, "Tagesbedarf", (wert, name) =>
    endlicheZahl(wert, name, { minimum: 0 }));
  const azureWerte = jeKlasse(azure, "Azure Messwert", (wert, name) => {
    if (!wert || typeof wert !== "object") throw new Error(`${name} fehlt`);
    const stichproben = endlicheZahl(wert.stichproben, `${name}.stichproben`, { minimum: 0 });
    if (!Number.isInteger(stichproben) || stichproben < AZURE_STICHPROBEN_JE_KLASSE_MIN) {
      throw new Error(`${name} braucht mindestens ${AZURE_STICHPROBEN_JE_KLASSE_MIN} echte Stichproben`);
    }
    return Object.freeze({
      stichproben,
      inputTokensP95: endlicheZahl(wert.inputTokensP95, `${name}.inputTokensP95`, { minimum: 1 }),
      outputTokensP95: endlicheZahl(wert.outputTokensP95, `${name}.outputTokensP95`, { minimum: 1 }),
      dauerMsP95: endlicheZahl(wert.dauerMsP95, `${name}.dauerMsP95`, { minimum: 1 })
    });
  });
  if (!preis || typeof preis !== "object") throw new Error("Preisbasis fehlt");
  const inputPreis = endlicheZahl(preis.inputUsdJeMio, "Eingabepreis", { minimum: 0.00000001 });
  const outputPreis = endlicheZahl(preis.outputUsdJeMio, "Ausgabepreis", { minimum: 0.00000001 });
  const preisquelle = String(preis.quelle || "").trim();
  if (preisquelle.length < 5) throw new Error("Preisquelle fehlt");

  const gesamtAufrufeP95 = KLASSEN.reduce((summe, klasse) => summe + bedarf[klasse], 0);
  if (gesamtAufrufeP95 <= 0) throw new Error("Tagesbedarf ist insgesamt null");
  const nutzbarerAnteil = 1 - reserveWert;
  const deckelAusGemessenemBedarf = Math.ceil(gesamtAufrufeP95 / nutzbarerAnteil);
  const fairnessMindestdeckel = erforderlicherDeckelFuerTaeglicheMandate(mandate, global);
  const empfohlenerGesamtdeckel = Math.max(deckelAusGemessenemBedarf, fairnessMindestdeckel);
  const empfohleneUnderstandingReserve = Math.min(
    empfohlenerGesamtdeckel,
    Math.ceil(bedarf.understanding / nutzbarerAnteil)
  );
  const nichtPriorisierteKapazitaet = empfohlenerGesamtdeckel - empfohleneUnderstandingReserve;

  const inputTokensP95ProTag = KLASSEN.reduce((summe, klasse) =>
    summe + bedarf[klasse] * azureWerte[klasse].inputTokensP95, 0);
  const outputTokensP95ProTag = KLASSEN.reduce((summe, klasse) =>
    summe + bedarf[klasse] * azureWerte[klasse].outputTokensP95, 0);
  const kostenP95ProTagUsd = (inputTokensP95ProTag / 1e6) * inputPreis
    + (outputTokensP95ProTag / 1e6) * outputPreis;
  const teuersterP95AufrufUsd = Math.max(...KLASSEN.map((klasse) =>
    (azureWerte[klasse].inputTokensP95 / 1e6) * inputPreis
      + (azureWerte[klasse].outputTokensP95 / 1e6) * outputPreis));

  return Object.freeze({
    beweisart: "Rechnung aus aggregierten echten Messwerten, kein Lastnachweis",
    reserveAnteil: reserveWert,
    aktiveMandate: mandate,
    globalAnteil: global,
    gesamtAufrufeP95,
    deckelAusGemessenemBedarf,
    fairnessMindestdeckel,
    empfohlenerGesamtdeckel,
    empfohleneUnderstandingReserve,
    nichtPriorisierteKapazitaet,
    inputTokensP95ProTag,
    outputTokensP95ProTag,
    kostenP95ProTagUsd: rundeUsd(kostenP95ProTagUsd),
    kostenObergrenzeBeiVollemDeckelUsd: rundeUsd(teuersterP95AufrufUsd * empfohlenerGesamtdeckel),
    preisquelle,
    tagesbedarf: bedarf,
    azure: azureWerte
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
    const aktiveMandate = endlicheZahl(tag && tag.aktiveMandate,
      `Tag ${index + 1} aktive Mandate`, { minimum: 1 });
    if (!Number.isInteger(aktiveMandate)) throw new Error(`Tag ${index + 1} aktive Mandate ist keine ganze Zahl`);
    if (ersteAktivstufe === null) ersteAktivstufe = aktiveMandate;
    if (aktiveMandate !== ersteAktivstufe) einheitlicheAktivstufe = false;
    const a = endlicheZahl(tag && tag.ankunft, `Tag ${index + 1} Ankunft`, { minimum: 0 });
    const b = endlicheZahl(tag && tag.abfluss, `Tag ${index + 1} Abfluss`, { minimum: 0 });
    const alter = endlicheZahl(tag && tag.aeltesterOffenerStunden,
      `Tag ${index + 1} Alter`, { nullErlaubt: true, minimum: 0 });
    const unbekannt = endlicheZahl(tag && tag.unbekannt, `Tag ${index + 1} unbekannt`, { minimum: 0 });
    const dubletten = endlicheZahl(tag && tag.dubletten, `Tag ${index + 1} Dubletten`, { minimum: 0 });
    const leases = endlicheZahl(tag && tag.haengendeLeases, `Tag ${index + 1} Leases`, { minimum: 0 });
    const fehler = endlicheZahl(tag && tag.endgueltigeFehler, `Tag ${index + 1} Fehler`, { minimum: 0 });
    const briefingFehlt = endlicheZahl(tag && tag.briefingFehlt, `Tag ${index + 1} Briefing`, { minimum: 0 });
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
  const ziel = Number(zielMandate);
  if (!AKTIVIERUNGSSTUFEN.includes(ziel)) throw new Error("Unbekannte Aktivierungsstufe");
  return ziel === 10 ? 25 : ziel;
}

function bewerteEntscheidungsreife({ zielMandate, vorherigeAktivstufe, fachwegGemessenBis,
  supabaseGemessenBis, supabaseFehler = 0, azureStichprobenJeKlasse, kiDeckelEmpfohlen,
  kiDeckelKonfiguriert, kiGlobalAnteilKonfiguriert, kiUnderstandingReserveEmpfohlen,
  kiUnderstandingReserveKonfiguriert, slot, beobachtung, codeUndMigrationen = {} } = {}) {
  const ziel = Number(zielMandate);
  const messstufe = erforderlicheMessstufe(ziel);
  const gruende = [];
  if (Number(vorherigeAktivstufe) !== VORSTUFE[ziel]) gruende.push("vorherige Aktivstufe stimmt nicht");
  const fachwegStand = Number(fachwegGemessenBis);
  if (!Number.isInteger(fachwegStand) || fachwegStand < 0) {
    gruende.push("voller Fachweg hat keinen gueltigen Messstand");
  } else if (fachwegStand < messstufe) {
    gruende.push(`voller Fachweg nicht bis ${messstufe} gemessen`);
  }
  const supabaseStand = Number(supabaseGemessenBis);
  if (!Number.isInteger(supabaseStand) || supabaseStand < 0) {
    gruende.push("Supabase hat keinen gueltigen Messstand");
  } else if (supabaseStand < messstufe) {
    gruende.push(`Supabase nicht bis ${messstufe} gemessen`);
  }
  if (Number(supabaseFehler) !== 0) gruende.push("Supabase Probe hatte Fehler");
  let azureVollstaendig = false;
  try {
    const werte = jeKlasse(azureStichprobenJeKlasse, "Azure Stichproben", (wert, name) =>
      endlicheZahl(wert, name, { minimum: 0 }));
    azureVollstaendig = KLASSEN.every((klasse) => werte[klasse] >= AZURE_STICHPROBEN_JE_KLASSE_MIN);
  } catch (_) { azureVollstaendig = false; }
  if (!azureVollstaendig) gruende.push("Azure Stichprobe ist nicht vollstaendig");
  const empfohlen = endlicheZahl(kiDeckelEmpfohlen, "empfohlener KI Deckel", { minimum: 1 });
  const reserveEmpfohlen = endlicheZahl(kiUnderstandingReserveEmpfohlen,
    "empfohlene Understanding Reserve", { minimum: 0 });
  const konfiguriert = endlicheZahl(kiDeckelKonfiguriert, "konfigurierter KI Deckel", { nullErlaubt: true, minimum: 1 });
  const reserveKonfiguriert = endlicheZahl(kiUnderstandingReserveKonfiguriert,
    "konfigurierte Understanding Reserve", { nullErlaubt: true, minimum: 0 });
  if (![empfohlen, reserveEmpfohlen].every(Number.isInteger)) {
    throw new Error("Empfohlener KI Deckel und Understanding Reserve muessen ganze Zahlen sein");
  }
  if (reserveEmpfohlen > empfohlen) {
    throw new Error("Empfohlene Understanding Reserve darf nicht ueber dem Gesamtdeckel liegen");
  }
  if (konfiguriert === null || konfiguriert < empfohlen) gruende.push("KI Deckel ist noch nicht ausreichend freigegeben und gesetzt");
  if (konfiguriert !== null && !Number.isInteger(konfiguriert)) {
    gruende.push("konfigurierter KI Deckel ist keine ganze Zahl");
  }
  if (reserveKonfiguriert === null || reserveKonfiguriert < reserveEmpfohlen) {
    gruende.push("Understanding Reserve ist noch nicht ausreichend freigegeben und gesetzt");
  } else if (!Number.isInteger(reserveKonfiguriert)) {
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
    fairnessMindestdeckel = erforderlicherDeckelFuerTaeglicheMandate(ziel, globalKonfiguriert);
    if (empfohlen < fairnessMindestdeckel) {
      gruende.push(`empfohlener KI Deckel unterschreitet taegliche Fairness Untergrenze ${fairnessMindestdeckel}`);
    }
    if (konfiguriert !== null && Number.isInteger(konfiguriert)) {
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
  if (!slot || slot.bestanden !== true) gruende.push("Slot Kapazitaet hat keine 25 Prozent Reserve");
  if (!beobachtung || beobachtung.bestanden !== true) {
    gruende.push("siebentaegige Vorstufenbeobachtung ist nicht gruen");
  } else if (Number(beobachtung.aktiveMandate) !== VORSTUFE[ziel]) {
    gruende.push(`siebentaegige Beobachtung stammt nicht aus Vorstufe ${VORSTUFE[ziel]}`);
  }
  for (const [name, ok] of Object.entries({
    "PR 272 ist nicht gemergt": codeUndMigrationen.pr272Merged,
    "PR 273 ist nicht gemergt": codeUndMigrationen.pr273Merged,
    "F9 ist nicht angewendet": codeUndMigrationen.f9Applied,
    "Z22 ist nicht angewendet": codeUndMigrationen.z22Applied
  })) {
    if (ok !== true) gruende.push(name);
  }
  return Object.freeze({
    status: gruende.length ? "nicht-entscheidungsreif" : "entscheidungsreif-nicht-freigegeben",
    zielMandate: ziel,
    vorherigeAktivstufe: VORSTUFE[ziel],
    erforderlicheMessstufe: messstufe,
    fairnessMindestdeckel,
    kiGlobalAnteil: globalKonfiguriert,
    kiRotation,
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
  erforderlicherDeckelFuerTaeglicheMandate,
  bewerteMandatsrotation,
  berechneKiDeckel,
  bewerteSlot,
  bewerteBeobachtung,
  erforderlicheMessstufe,
  bewerteEntscheidungsreife
};
