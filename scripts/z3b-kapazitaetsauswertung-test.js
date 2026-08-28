"use strict";

// Rein lokaler Vertragstest fuer die spaetere Z3b Kapazitaetsentscheidung.

const K = require("./fixtures/z3b-kapazitaetsauswertung");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function wirft(fn, muster) {
  try { fn(); return false; } catch (fehler) { return muster.test(String(fehler && fehler.message)); }
}

const azure = {
  understanding: { stichproben: 7, inputTokensP95: 4800, outputTokensP95: 360, dauerMsP95: 2100 },
  lage: { stichproben: 7, inputTokensP95: 2100, outputTokensP95: 420, dauerMsP95: 1700 },
  buero: { stichproben: 7, inputTokensP95: 900, outputTokensP95: 260, dauerMsP95: 1200 }
};
const preis = { inputUsdJeMio: 0.25, outputUsdJeMio: 2, quelle: "rein lokale Preisattrappe" };
const tagesbedarf = { understanding: 210, lage: 25, buero: 15 };

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

function main() {
  console.log("Helmut — lokaler Vertragstest der Z3b Kapazitaetsauswertung\n");

  console.log("== A · KI Deckel aus Messwerten ==");
  const deckel = K.berechneKiDeckel({ tagesbedarf, azure, preis });
  check("A1 Der Gesamtbedarf wird aus allen drei Arbeitsformen gebildet", deckel.gesamtAufrufeP95 === 250);
  check("A2 25 Prozent freie Kapazitaet bedeutet Bedarf geteilt durch 0,75", deckel.empfohlenerGesamtdeckel === 334);
  check("A3 Die Understanding Reserve liegt innerhalb des Gesamtdeckels",
    deckel.empfohleneUnderstandingReserve === 280
      && deckel.empfohleneUnderstandingReserve + deckel.nichtPriorisierteKapazitaet === deckel.empfohlenerGesamtdeckel);
  check("A4 Token werden je Arbeitsform und Tagesbedarf verrechnet",
    deckel.inputTokensP95ProTag === 1074000 && deckel.outputTokensP95ProTag === 90000);
  check("A5 Kosten bleiben als Rechnung und nicht als Lastnachweis gekennzeichnet",
    /Rechnung/.test(deckel.beweisart) && /kein Lastnachweis/.test(deckel.beweisart));
  check("A6 Die Kostenobergrenze verwendet den teuersten p95 Aufruf fuer den ganzen Deckel",
    deckel.kostenObergrenzeBeiVollemDeckelUsd >= deckel.kostenP95ProTagUsd);
  check("A7 Weniger als sieben Azure Werte je Klasse werden abgelehnt",
    wirft(() => K.berechneKiDeckel({ tagesbedarf, azure: {
      ...azure, lage: { ...azure.lage, stichproben: 6 }
    }, preis }), /mindestens 7/));
  check("A8 Eine fehlende Arbeitsform wird abgelehnt",
    wirft(() => K.berechneKiDeckel({ tagesbedarf: { understanding: 1, lage: 1 }, azure, preis }), /buero/));
  check("A9 Unbekannte Arbeitsformen werden abgelehnt",
    wirft(() => K.berechneKiDeckel({ tagesbedarf: { ...tagesbedarf, fremd: 1 }, azure, preis }), /unbekannte/));
  check("A10 Ohne belegte Preisquelle gibt es keine Kostenrechnung",
    wirft(() => K.berechneKiDeckel({ tagesbedarf, azure, preis: { ...preis, quelle: "" } }), /Preisquelle/));
  check("A11 Eine Reserve von 25 Prozent wird nicht als Zuschlag gerechnet",
    deckel.empfohlenerGesamtdeckel !== Math.ceil(deckel.gesamtAufrufeP95 * 1.25));

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

  console.log("\n== C · Aktivierungstore bis 500 ==");
  check("C1 Es gibt nur die Stufen 10, 25, 50, 100, 200 und 500",
    JSON.stringify(K.AKTIVIERUNGSSTUFEN) === JSON.stringify([10, 25, 50, 100, 200, 500]));
  check("C2 Fuer 10 wird die vorhandene technische 25er Stufe als Huelle verlangt",
    K.erforderlicheMessstufe(10) === 25);
  check("C3 Ab 25 braucht jede Aktivierung ihre eigene Messstufe",
    [25, 50, 100, 200, 500].every((stufe) => K.erforderlicheMessstufe(stufe) === stufe));
  check("C4 Eine Zwischenstufe darf nicht uebersprungen werden",
    K.bewerteEntscheidungsreife({
      zielMandate: 50, vorherigeAktivstufe: 10, fachwegGemessenBis: 100,
      supabaseGemessenBis: 100, azureStichprobenJeKlasse: { understanding: 7, lage: 7, buero: 7 },
      kiDeckelEmpfohlen: 334, kiDeckelKonfiguriert: 334, slot: slotGruen, beobachtung,
      codeUndMigrationen: { pr272Merged: true, pr273Merged: true, f9Applied: true, z22Applied: true }
    }).gruende.includes("vorherige Aktivstufe stimmt nicht"));
  const basis = {
    zielMandate: 25, vorherigeAktivstufe: 10, fachwegGemessenBis: 100,
    supabaseGemessenBis: 25, supabaseFehler: 0,
    azureStichprobenJeKlasse: { understanding: 7, lage: 7, buero: 7 },
    kiDeckelEmpfohlen: 334, kiDeckelKonfiguriert: 334,
    slot: slotGruen, beobachtung,
    codeUndMigrationen: { pr272Merged: true, pr273Merged: true, f9Applied: true, z22Applied: true }
  };
  const reif = K.bewerteEntscheidungsreife(basis);
  check("C5 Ein gruener Befund ist nur entscheidungsreif, nie automatisch freigegeben",
    reif.status === "entscheidungsreif-nicht-freigegeben" && !reif.aktiviert && !reif.freigegeben);
  check("C6 Ohne ausreichenden gesetzten KI Deckel bleibt die Stufe gesperrt",
    /KI Deckel/.test(K.bewerteEntscheidungsreife({ ...basis, kiDeckelKonfiguriert: null }).gruende.join(" ")));
  check("C7 Ohne F9 bleibt die Stufe gesperrt",
    K.bewerteEntscheidungsreife({ ...basis, codeUndMigrationen: { ...basis.codeUndMigrationen, f9Applied: false } })
      .gruende.includes("F9 ist nicht angewendet"));
  check("C8 Ohne Z22 bleibt die Stufe gesperrt",
    K.bewerteEntscheidungsreife({ ...basis, codeUndMigrationen: { ...basis.codeUndMigrationen, z22Applied: false } })
      .gruende.includes("Z22 ist nicht angewendet"));
  check("C9 Ein Supabase Fehler bleibt rot",
    K.bewerteEntscheidungsreife({ ...basis, supabaseFehler: 1 }).gruende.includes("Supabase Probe hatte Fehler"));
  check("C10 Fuer 200 reichen die vorhandenen 100er Messungen ausdruecklich nicht",
    /200/.test(K.bewerteEntscheidungsreife({
      ...basis, zielMandate: 200, vorherigeAktivstufe: 100,
      fachwegGemessenBis: 100, supabaseGemessenBis: 100
    }).gruende.join(" ")));
  check("C11 Fuer 500 reichen 200er Messungen ausdruecklich nicht",
    /500/.test(K.bewerteEntscheidungsreife({
      ...basis, zielMandate: 500, vorherigeAktivstufe: 200,
      fachwegGemessenBis: 200, supabaseGemessenBis: 200
    }).gruende.join(" ")));
  check("C12 PR 272 und danach PR 273 bleiben Voraussetzungen",
    K.bewerteEntscheidungsreife({ ...basis, codeUndMigrationen: { ...basis.codeUndMigrationen, pr272Merged: false, pr273Merged: false } })
      .gruende.filter((grund) => /PR 27/.test(grund)).length === 2);
  const falscheVorstufe = K.bewerteBeobachtung(grueneTage(5));
  check("C13 Sieben gruene Tage auf der falschen Vorstufe reichen nicht",
    /Vorstufe 10/.test(K.bewerteEntscheidungsreife({ ...basis, beobachtung: falscheVorstufe }).gruende.join(" ")));

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main();
