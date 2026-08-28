"use strict";

// Reiner Offline Vertragstest. Kein Netz, keine Datenbank, keine Production Kennung.

const crypto = require("crypto");
const V = require("./fixtures/z3b-production-beobachtung");

const JETZT = new Date("2026-08-29T12:00:00.000Z");
const HEUTE_UTC = "2026-08-29";
const TAG_MS = 24 * 60 * 60 * 1000;
const SLOT_IDS = Object.freeze(Array.from({ length: 20 }, (_, index) =>
  `slot-${String(index + 1).padStart(2, "0")}`));

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function wirft(fn, muster) {
  try { fn(); return false; }
  catch (fehler) { return muster.test(String(fehler && fehler.message)); }
}

function hash(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function klon(wert) {
  return JSON.parse(JSON.stringify(wert));
}

function tagText(startUtc, index) {
  const start = Date.parse(`${startUtc}T00:00:00.000Z`);
  return new Date(start + index * TAG_MS).toISOString().slice(0, 10);
}

function baueTag({ datumUtc, stufe, transport, index }) {
  const slotRuns = SLOT_IDS.map((slotId, slotIndex) => ({
    slotId,
    runId: `slotrun-${datumUtc}-${slotIndex + 1}`,
    dauerMs: 100000 + slotIndex * 1000,
    ausloeser: "cron",
    natuerlich: true,
    vollstaendig: true
  }));
  const quittungen = slotRuns.map((slot, slotIndex) => ({
    quittungId: `wakeq-${datumUtc}-${slotIndex + 1}`,
    slotId: slot.slotId,
    ausloeserRunId: slot.runId,
    weckRunId: `wakerun-${datumUtc}-${slotIndex + 1}`,
    transport,
    natuerlich: true,
    vollstaendig: true,
    angenommen: true,
    verarbeitet: true,
    doppelt: false
  }));
  const start = `${datumUtc}T00:00:00.000Z`;
  const ende = new Date(Date.parse(start) + TAG_MS).toISOString();
  return {
    datumUtc,
    vonUtc: start,
    bisUtcExklusiv: ende,
    vollstaendig: true,
    natuerlich: true,
    aktiveMandate: stufe,
    aktiveMandatsmengenSha256: hash(`aktive-mandatsmenge-${stufe}`),
    gitSha: "a".repeat(40),
    deployment: "dpl_StrictProductionProof",
    migrationenSha256: hash("migrationen-vollzug-1"),
    konfigurationSha256: hash(`konfiguration-${stufe}-${transport}`),
    rohwerteSha256: hash(`rohwerte-${datumUtc}-${index}`),
    runIds: [...slotRuns.map((slot) => slot.runId), ...quittungen.map((q) => q.weckRunId)],
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
    slots: slotRuns,
    weckquittungen: quittungen
  };
}

function bericht({ stufe = 100, transport = "sqs", startUtc = "2026-08-22" } = {}) {
  return {
    schema: V.SCHEMA,
    art: V.ART,
    production: true,
    synthetisch: false,
    simulation: false,
    hochrechnung: false,
    erhobenUtc: "2026-08-29T00:05:00.000Z",
    aktiveStufe: stufe,
    erwarteteSlotIds: [...SLOT_IDS],
    ereignistransport: transport,
    tage: Array.from({ length: 7 }, (_, index) => baueTag({
      datumUtc: tagText(startUtc, index), stufe, transport, index
    }))
  };
}

function pruefe(wert) {
  return V.pruefeProduktionsBeobachtung(wert, {
    jetzt: JETZT, heuteUtc: HEUTE_UTC, vertrauenswuerdigeSlotIds: SLOT_IDS
  });
}

function terminal(wert) {
  return V.pruefeTerminales500Tor(wert, {
    jetzt: JETZT, heuteUtc: HEUTE_UTC, vertrauenswuerdigeSlotIds: SLOT_IDS
  });
}

function main() {
  console.log("Helmut — strenger Z3b Production Beobachtungsvertrag\n");

  console.log("== A · gruener interner Siebentagevertrag ==");
  const gruen = pruefe(bericht());
  check("A1 Exakt sieben abgeschlossene UTC Tage bestehen intern",
    gruen.kriterienInternBestanden && gruen.tage === 7
      && gruen.vonDatumUtc === "2026-08-22" && gruen.bisDatumUtc === "2026-08-28");
  check("A2 Der p95 wird aus den einzelnen Slotdauern neu berechnet",
    gruen.tagesErgebnisse.every((tag) => tag.p95Ms === 118000 && tag.maxMs === 119000));
  check("A3 Jeder Tag traegt alle zwanzig Slots und zwanzig Weckquittungen",
    gruen.tagesErgebnisse.every((tag) => tag.slots === 20 && tag.weckquittungen === 20));
  check("A4 Volle SHA256 und alle Run IDs werden im Ergebnis weitergefuehrt",
    gruen.rohwerteSha256.every((wert) => /^[a-f0-9]{64}$/.test(wert))
      && gruen.runIds.length === 7 * 40);
  check("A5 Der Offline Validator behauptet niemals externe Production Herkunft",
    gruen.status === "intern-gruen-externe-herkunft-offen"
      && gruen.externeHerkunftBewiesen === false
      && gruen.productionHerkunftBewiesen === false
      && gruen.productionBewiesen === false);
  check("A6 Die Reservegrenze ist exakt 217500 ms im 290000 ms Budget",
    V.SLOT_P95_GRENZE_MS === 217500 && V.SLOT_STOP_MS === 280000);

  console.log("\n== B · UTC Fenster und explizite Werte ==");
  const sechs = bericht(); sechs.tage.pop();
  check("B1 Sechs Tage werden abgelehnt", wirft(() => pruefe(sechs), /exakt 7/));
  const acht = bericht(); acht.tage.push(klon(acht.tage[6]));
  check("B2 Acht Tage werden abgelehnt", wirft(() => pruefe(acht), /exakt 7/));
  const luecke = bericht(); luecke.tage[3].datumUtc = "2026-08-27";
  check("B3 Eine Kalenderluecke wird abgelehnt", wirft(() => pruefe(luecke), /UTC Position/));
  check("B4 Ein Fenster mit dem laufenden UTC Tag wird abgelehnt",
    wirft(() => pruefe(bericht({ startUtc: "2026-08-23" })), /UTC Position|laufenden UTC Tag/));
  check("B5 Ein altes statt des unmittelbar abgeschlossenen Fensters wird abgelehnt",
    wirft(() => pruefe(bericht({ startUtc: "2026-08-21" })), /UTC Position/));
  const falscheGrenze = bericht(); falscheGrenze.tage[0].bisUtcExklusiv = "2026-08-22T23:59:59.999Z";
  check("B6 Ein Tag ohne exakte halboffene UTC Grenze wird abgelehnt",
    wirft(() => pruefe(falscheGrenze), /exakter vollstaendiger UTC Kalendertag/));
  const boolFehlt = bericht(); delete boolFehlt.tage[0].zaehler.kiDeckelErreicht;
  check("B7 Ein fehlendes Boolean wird abgelehnt", wirft(() => pruefe(boolFehlt), /fehlt.*kiDeckelErreicht/));
  const boolText = bericht(); boolText.tage[0].vollstaendig = "true";
  check("B8 Boolean Texte werden nicht als Boolean akzeptiert", wirft(() => pruefe(boolText), /explizites Boolean/));
  const unvollstaendig = bericht(); unvollstaendig.tage[0].vollstaendig = false;
  check("B9 Ein explizit unvollstaendiger Tag bleibt intern rot",
    !pruefe(unvollstaendig).kriterienInternBestanden);
  const zukunftErhoben = bericht(); zukunftErhoben.erhobenUtc = "2026-08-29T13:00:00.000Z";
  check("B10 Eine Erhebung in der Zukunft wird abgelehnt",
    wirft(() => pruefe(zukunftErhoben), /Zukunft/));

  console.log("\n== C · ganzzahlige Bilanz und rote Tageswerte ==");
  const bruchteil = bericht(); bruchteil.tage[0].zaehler.ankunft = 100.5;
  check("C1 Bruchteile in Zaehlern werden abgelehnt", wirft(() => pruefe(bruchteil), /ganze Zahl/));
  const bilanz = bericht(); bilanz.tage[0].zaehler.ankunft = 101;
  check("C2 Eine nicht aufgehende Tagesbilanz wird abgelehnt",
    wirft(() => pruefe(bilanz), /Anfang plus Ankunft/));
  const fehler = bericht(); fehler.tage[0].zaehler.endgueltigeFehler = 1;
  check("C3 Ein endgueltiger Fehler bleibt rot", /endgueltige Fehler/.test(pruefe(fehler).gruende.join(" ")));
  const alterFehlt = bericht(); alterFehlt.tage[0].aeltesterOffenerStunden = null;
  check("C4 Fehlendes Alter bei offenem Endbestand wird abgelehnt",
    wirft(() => pruefe(alterFehlt), /Alter darf nur/));
  const leer = bericht();
  leer.tage[6].zaehler.abfluss = 105; leer.tage[6].zaehler.offenEnde = 0; leer.tage[6].aeltesterOffenerStunden = null;
  check("C5 Null Alter ist nur beim Endbestand null gueltig", pruefe(leer).strukturGueltig === true);
  const leerMitAlter = klon(leer); leerMitAlter.tage[6].aeltesterOffenerStunden = 0;
  check("C6 Ein Alter trotz Endbestand null wird abgelehnt",
    wirft(() => pruefe(leerMitAlter), /nur null/));
  const zuAlt = bericht(); zuAlt.tage[0].aeltesterOffenerStunden = 24;
  check("C7 Ein mindestens 24 Stunden alter Auftrag bleibt rot",
    /mindestens 24 Stunden/.test(pruefe(zuAlt).gruende.join(" ")));
  const deckel = bericht(); deckel.tage[0].zaehler.kiDeckelErreicht = true;
  check("C8 Ein erreichter KI Deckel bleibt rot", /KI Deckel/.test(pruefe(deckel).gruende.join(" ")));
  const unbekannt = bericht(); unbekannt.tage[0].zaehler.unbekannt = 1;
  check("C9 Ein unbekannter Auftrag bleibt rot", /unbekannte/.test(pruefe(unbekannt).gruende.join(" ")));
  const briefing = bericht(); briefing.tage[0].zaehler.briefingFehlt = 1;
  check("C10 Ein fehlendes Briefing bleibt rot", /fehlende Briefings/.test(pruefe(briefing).gruende.join(" ")));
  const wachsenderRueckstau = bericht();
  wachsenderRueckstau.tage.forEach((tag, index) => {
    tag.zaehler.offenAnfang = index * 10;
    tag.zaehler.ankunft = 100;
    tag.zaehler.abfluss = 90;
    tag.zaehler.offenEnde = (index + 1) * 10;
  });
  check("C11 Ein bilanziell konsistenter, taeglich wachsender Rueckstau bleibt rot",
    /Abfluss ist kleiner als Ankunft/.test(pruefe(wachsenderRueckstau).gruende.join(" ")));
  const tagesbruch = bericht(); tagesbruch.tage[1].zaehler.offenAnfang = 4;
  tagesbruch.tage[1].zaehler.abfluss = 99;
  check("C12 Tagesendbestand muss exakt der Anfang des Folgetags sein",
    wirft(() => pruefe(tagesbruch), /Tagesendbestand.*Folgetags/));
  const zahlenUeberGrenze = bericht();
  for (const feld of ["offenAnfang", "ankunft", "abfluss", "offenEnde"]) {
    zahlenUeberGrenze.tage[0].zaehler[feld] = Number.MAX_SAFE_INTEGER;
  }
  check("C13 Sichere Einzelzahlen duerfen weder die harte Zaehlergrenze noch die Bilanzsumme ueberlaufen",
    wirft(() => pruefe(zahlenUeberGrenze), /sichere ganze Zahl zwischen/)
      && V.ZAEHLER_MAX === 1_000_000_000);

  console.log("\n== D · Herkunftsfelder und Kontinuitaet ==");
  const git = bericht(); git.tage[0].gitSha = "abc";
  check("D1 Ein ungueltiger Git SHA wird abgelehnt", wirft(() => pruefe(git), /Git SHA/));
  const roh = bericht(); roh.tage[0].rohwerteSha256 = "falsch";
  check("D2 Ein gekuerzter Rohwert Hash wird abgelehnt", wirft(() => pruefe(roh), /Rohwerte SHA256/));
  const menge = bericht(); menge.tage[3].aktiveMandatsmengenSha256 = hash("andere-mandate");
  check("D3 Eine wechselnde aktive Mandatsmenge wird abgelehnt",
    wirft(() => pruefe(menge), /aktive Mandatsmenge wechselte/));
  const gitWechsel = bericht(); gitWechsel.tage[3].gitSha = "b".repeat(40);
  check("D4 Ein Git Wechsel im Fenster wird abgelehnt", wirft(() => pruefe(gitWechsel), /Git SHA wechselte/));
  const deployWechsel = bericht(); deployWechsel.tage[3].deployment = "dpl_AndererProductionStand";
  check("D5 Ein Deployment Wechsel im Fenster wird abgelehnt",
    wirft(() => pruefe(deployWechsel), /Deployment wechselte/));
  const migrationWechsel = bericht(); migrationWechsel.tage[3].migrationenSha256 = hash("andere-migrationen");
  check("D6 Ein Migrationswechsel wird abgelehnt",
    wirft(() => pruefe(migrationWechsel), /Migrationsstand wechselte/));
  const configWechsel = bericht(); configWechsel.tage[3].konfigurationSha256 = hash("andere-config");
  check("D7 Ein Konfigurationswechsel wird abgelehnt",
    wirft(() => pruefe(configWechsel), /Konfiguration wechselte/));
  const rohWiederholt = bericht(); rohWiederholt.tage[1].rohwerteSha256 = rohWiederholt.tage[0].rohwerteSha256;
  check("D8 Wiederverwendete Tagesrohwerte werden abgelehnt",
    wirft(() => pruefe(rohWiederholt), /Rohwerte SHA256.*wiederverwendet/));
  const stufenWechsel = bericht(); stufenWechsel.tage[3].aktiveMandate = 99;
  check("D9 Ein Stufenwechsel wird abgelehnt", wirft(() => pruefe(stufenWechsel), /Mandatsstufe/));
  const falscheBehauptung = bericht(); falscheBehauptung.externeHerkunftBewiesen = true;
  check("D10 Eine zusaetzliche externe Herkunftsbehauptung wird nicht ignoriert",
    wirft(() => pruefe(falscheBehauptung), /unbekannte Felder/));

  console.log("\n== E · Slotreserve, Run IDs und Weckquittungen ==");
  const slotFehlt = bericht(); slotFehlt.tage[0].slots.pop();
  check("E1 Ein fehlender Slot wird abgelehnt", wirft(() => pruefe(slotFehlt), /nicht exakt alle/));
  const p95Rot = bericht();
  p95Rot.tage[0].slots[18].dauerMs = 218000; p95Rot.tage[0].slots[19].dauerMs = 219000;
  check("E2 Ein neu berechneter p95 ueber 217500 ms bleibt rot",
    /p95.*25 Prozent/.test(pruefe(p95Rot).gruende.join(" ")));
  const maxRot = bericht(); maxRot.tage[0].slots[19].dauerMs = 281000;
  check("E3 Ein Maximum ueber 280000 ms bleibt rot",
    /Maximum.*280/.test(pruefe(maxRot).gruende.join(" ")));
  const slotNichtNatuerlich = bericht(); slotNichtNatuerlich.tage[0].slots[0].natuerlich = false;
  check("E4 Ein nicht natuerlicher Slot bleibt rot",
    /Slots.*nicht vollstaendig/.test(pruefe(slotNichtNatuerlich).gruende.join(" ")));
  const runListe = bericht(); runListe.tage[0].runIds.pop();
  check("E5 Die Tagesliste muss exakt alle Slot und Weck Run IDs tragen",
    wirft(() => pruefe(runListe), /Run IDs stimmen nicht exakt/));
  const shadow = bericht(); shadow.ereignistransport = "shadow";
  check("E6 Schattenbetrieb ist kein Ereignistransport",
    wirft(() => pruefe(shadow), /kein Ereignistransport/));
  const quittungFehlt = bericht(); quittungFehlt.tage[0].weckquittungen.pop();
  check("E7 Jeder Slot braucht eine Weckquittung",
    wirft(() => pruefe(quittungFehlt), /exakt eine Weckquittung/));
  const transportFalsch = bericht(); transportFalsch.tage[0].weckquittungen[0].transport = "selbstweck";
  check("E8 Die Quittung ist an den Ereignistransport gebunden",
    wirft(() => pruefe(transportFalsch), /falschen Transport/));
  const nichtVerarbeitet = bericht(); nichtVerarbeitet.tage[0].weckquittungen[0].verarbeitet = false;
  check("E9 Eine nicht verarbeitete Weckquittung bleibt rot",
    /Weckquittungen.*nicht vollstaendig/.test(pruefe(nichtVerarbeitet).gruende.join(" ")));
  const quittungDoppelt = bericht();
  quittungDoppelt.tage[0].weckquittungen[1].quittungId = quittungDoppelt.tage[0].weckquittungen[0].quittungId;
  check("E10 Doppelte Quittungs IDs werden abgelehnt",
    wirft(() => pruefe(quittungDoppelt), /Weckquittungs IDs enthalten Dubletten/));
  const bindungFalsch = bericht(); bindungFalsch.tage[0].weckquittungen[0].ausloeserRunId = "anderer-run-123";
  check("E11 Eine Quittung ohne Bindung an den Slot Run wird abgelehnt",
    wirft(() => pruefe(bindungFalsch), /nicht an den Slot Run gebunden/));
  const runWiederholt = bericht();
  runWiederholt.tage[1].slots[0].runId = runWiederholt.tage[0].slots[0].runId;
  runWiederholt.tage[1].weckquittungen[0].ausloeserRunId = runWiederholt.tage[0].slots[0].runId;
  runWiederholt.tage[1].runIds[0] = runWiederholt.tage[0].runIds[0];
  check("E12 Run IDs duerfen nicht ueber Tage wiederverwendet werden",
    wirft(() => pruefe(runWiederholt), /zwischen Beobachtungstagen wiederverwendet/));
  const doppeltQuittierterSlot = bericht();
  doppeltQuittierterSlot.tage[0].weckquittungen[1].slotId = SLOT_IDS[0];
  doppeltQuittierterSlot.tage[0].weckquittungen[1].ausloeserRunId =
    doppeltQuittierterSlot.tage[0].slots[0].runId;
  check("E13 Exakt eine bijektive Weckquittung je Slot ist zwingend",
    wirft(() => pruefe(doppeltQuittierterSlot), /bijektiv/));
  check("E14 Eine nur im Bericht selbst verkleinerte Slotmenge ist nicht vertrauenswuerdig",
    wirft(() => {
      const gekuerzt = bericht();
      gekuerzt.erwarteteSlotIds = [SLOT_IDS[0]];
      gekuerzt.tage.forEach((tag) => {
        tag.slots = [tag.slots[0]];
        tag.weckquittungen = [tag.weckquittungen[0]];
        tag.runIds = [tag.slots[0].runId, tag.weckquittungen[0].weckRunId];
      });
      pruefe(gekuerzt);
    }, /vertrauenswuerdigen Slotplan/));
  const ohneSlotplan = V.pruefeProduktionsBeobachtung(bericht(), { jetzt: JETZT, heuteUtc: HEUTE_UTC });
  check("E15 Ohne separat eingebundenen Slotplan bleibt der Bericht intern rot",
    ohneSlotplan.kriterienInternBestanden === false
      && /Slotplan/.test(ohneSlotplan.gruende.join(" ")));
  const quittungTagUebergreifend = bericht();
  quittungTagUebergreifend.tage[1].weckquittungen[0].quittungId =
    quittungTagUebergreifend.tage[0].weckquittungen[0].quittungId;
  check("E16 Weckquittungs IDs duerfen auch zwischen Tagen nicht wiederverwendet werden",
    wirft(() => pruefe(quittungTagUebergreifend), /Weckquittungs IDs wurden zwischen/));

  console.log("\n== F · explizites terminales 500er Tor ==");
  check("F1 Ein Bericht einer kleineren Stufe kann das 500er Tor nicht betreten",
    wirft(() => terminal(bericht({ stufe: 200 })), /exakt 500/));
  const tor500 = terminal(bericht({ stufe: 500, transport: "sqs" }));
  check("F2 Sieben intern gruene 500er Tage mit grossem Transport bestehen das interne Tor",
    tor500.strukturUndKonsistenzInternBestanden === true && tor500.zielMandate === 500);
  check("F3 Auch ein intern gruenes 500er Tor behauptet keinen Aufnahmebeweis ohne externe Herkunft",
    tor500.status === "intern-gruen-externe-herkunft-offen"
      && tor500.externeHerkunftBewiesen === false
      && tor500.productionBewiesen === false
      && tor500.aufnahmebeweis500Vollstaendig === false);
  const selbstweck500 = terminal(bericht({ stufe: 500, transport: "selbstweck" }));
  check("F4 Selbstweck reicht fuer das terminale 500er Tor nicht",
    !selbstweck500.strukturUndKonsistenzInternBestanden
      && /grossen Ereignistransport/.test(selbstweck500.gruende.join(" ")));
  const rot500Bericht = bericht({ stufe: 500, transport: "sqs" });
  rot500Bericht.tage[0].zaehler.kiDeckelErreicht = true;
  check("F5 Ein roter 500er Tag sperrt auch das terminale Tor",
    terminal(rot500Bericht).strukturUndKonsistenzInternBestanden === false);
  const zuKleinerSlotplan = bericht({ stufe: 500, transport: "sqs" });
  const zweiSlotIds = SLOT_IDS.slice(0, 2);
  zuKleinerSlotplan.erwarteteSlotIds = zweiSlotIds;
  for (const tag of zuKleinerSlotplan.tage) {
    tag.slots = tag.slots.slice(0, 2);
    tag.weckquittungen = tag.weckquittungen.slice(0, 2);
    tag.runIds = [...tag.slots.map((slot) => slot.runId), ...tag.weckquittungen.map((q) => q.weckRunId)];
  }
  check("F6 Ein selbst als vertrauenswuerdig eingereichter Zwei-Slot-Plan reicht nicht fuer das Tor",
    wirft(() => V.pruefeTerminales500Tor(zuKleinerSlotplan, {
      jetzt: JETZT, heuteUtc: HEUTE_UTC, vertrauenswuerdigeSlotIds: zweiSlotIds
    }), /mindestens 20 Slots/));

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exitCode = fail ? 1 : 0;
}

main();
