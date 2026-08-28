"use strict";

// Unabhaengige Offline Negativproben fuer den aeusseren Z3b Fachwegriegel.
// Kein Netz, keine Datenbank und kein Kindprozessstart.

const P = require("./fixtures/z3b-fachweg-plan");
const L = require("./skalierung-z3b-fachweg");
const R = require("./skalierung-z3-realistiklauf");

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

function wirft(fn, muster) {
  try { fn(); return false; }
  catch (fehler) { return muster.test(String(fehler && fehler.message)); }
}

function klon(wert) {
  return JSON.parse(JSON.stringify(wert));
}

const AZURE = Object.freeze({
  modell: "gpt-5-mini",
  lokalesKiProfil: Object.freeze({ latenzMs: 2100, streuungMs: 301 })
});
const AZURE_HASH = "a".repeat(64);
const VORSTUFEN_HASH = "b".repeat(64);
const KONTROLL_HASH = "c".repeat(64);
const GIT_SHA = "d".repeat(40);

function kind({ ziel = 200, lauf = "fachweg01", fehlerMandat = false } = {}) {
  return P.kindUmgebung({
    env: {
      PATH: process.env.PATH || "/usr/bin:/bin",
      HELMUT_TEST_PG_HOST: "127.0.0.1",
      HELMUT_TEST_PG_PORT: "5434",
      HELMUT_TEST_PG_USER: "helmut",
      HELMUT_Z3_POSTGREST: "/opt/local/postgrest",
      SUPABASE_JWT_SECRET: "darf-nicht-geerbt-werden",
      CALLMEBOT_APIKEY: "darf-nicht-geerbt-werden",
      HELMUT_GOOGLE_NEWS_MAX_ITEMS: "1",
      HELMUT_PROFILE_NEWS_MAX_ITEMS: "1",
      CRAWLER_CONCURRENCY: "99",
      HELMUT_CRAWL_GESAMTBUDGET_MS: "1",
      HELMUT_LLM_PRICE_JSON: "{\"input\":0,\"output\":0}"
    },
    zielStufe: ziel,
    laufKennung: lauf,
    azure: AZURE,
    azureBelegSha256: AZURE_HASH,
    vorstufenBelegSha256: VORSTUFEN_HASH,
    berichtDatei: `/tmp/${lauf}-${ziel}-${fehlerMandat ? "fehler" : "kontrolle"}.json`,
    logDatei: `/tmp/${lauf}-${ziel}-${fehlerMandat ? "fehler" : "kontrolle"}.log`,
    ...(fehlerMandat ? {
      vergleichDatei: `/tmp/${lauf}-${ziel}-kontrolle.json`,
      kontrollBelegSha256: KONTROLL_HASH,
      fehlerMandat: true
    } : {})
  });
}

function slotBilanzen({ buero = 0, unsafe = false } = {}) {
  const gross = unsafe ? Number.MAX_VALUE : 0;
  let kumulativ = 0;
  return Array.from({ length: 6 }, (_, index) => {
    const kiKlassen = {
      understanding: index === 0 && unsafe ? gross : 1,
      lage: 1,
      buero: index === 0 ? buero : 0,
      sonstige: 0
    };
    const inkrement = kiKlassen.understanding + kiKlassen.lage + kiKlassen.buero;
    kumulativ += inkrement;
    return { slot: index + 1, kiKlassen, kiEndpunktKumulativ: kumulativ };
  });
}

function rohbeleg({ buero = 0, unsafe = false } = {}) {
  const slots = slotBilanzen({ buero, unsafe });
  const kiAufrufe = slots[slots.length - 1].kiEndpunktKumulativ;
  return R.baueFachwegKiRohbeleg({
    zielMandate: 200,
    laufKennung: "fachweg01",
    manifestSha256: "e".repeat(64),
    gitSha: GIT_SHA,
    slotBilanzen: slots,
    kiAufrufe
  });
}

function erwartungRoh() {
  return {
    ziel: 200,
    laufKennung: "fachweg01",
    manifestSha256: "e".repeat(64),
    gitSha: GIT_SHA
  };
}

function berichtMitManifest(manifest) {
  return {
    stand: "Z3a-teilnachweis-lokale-anbieter",
    erhoben: "2026-08-28T12:00:00.000Z",
    fachwegManifest: manifest,
    slotBudgetMs: 290000,
    slotsJeTag: 3,
    parallel: 4,
    stapel: 25,
    kiDeckel: "offen",
    kiHoechstzahl: 5000,
    zeichenJeToken: 3.8,
    stufen: [],
    kriterien: [],
    pass: 0,
    fail: 0,
    befundOffen: 0
  };
}

async function main() {
  console.log("Helmut — Z3b Fachweg Aussenriegel, offline\n");

  console.log("== A · minimale, feste Kindumgebung ==");
  const kontrolle = kind();
  check("A1 Der aeussere Kindvertrag besteht die innere Pflichtpruefung",
    R.pruefeFachwegUmgebung(kontrolle, { datenbank: "helmut_z3b_fachweg01" }).ziel === 200);
  check("A2 Volle Azure und Vorstufenhashes sowie das Modell erreichen den inneren Vertrag",
    kontrolle.HELMUT_Z3B_FACHWEG_AZURE_BELEG_SHA256 === AZURE_HASH
      && kontrolle.HELMUT_Z3B_FACHWEG_VORSTUFEN_BELEG_SHA256 === VORSTUFEN_HASH
      && kontrolle.HELMUT_Z3B_FACHWEG_KI_MODELL === "gpt-5-mini");
  check("A3 Secrets, Anbieterparameter und Lastregler werden nicht geerbt",
    ["SUPABASE_JWT_SECRET", "CALLMEBOT_APIKEY", "HELMUT_GOOGLE_NEWS_MAX_ITEMS",
      "HELMUT_PROFILE_NEWS_MAX_ITEMS", "CRAWLER_CONCURRENCY",
      "HELMUT_CRAWL_GESAMTBUDGET_MS", "HELMUT_LLM_PRICE_JSON"]
      .every((name) => !(name in kontrolle)));
  const fehler = kind({ fehlerMandat: true });
  check("A4 Der Fehlerlauf bindet den vollen Kontrollhash und besteht den inneren Eingangsvertrag",
    fehler.HELMUT_Z3B_FACHWEG_KONTROLL_BELEG_SHA256 === KONTROLL_HASH
      && R.pruefeFachwegUmgebung(fehler, { datenbank: "helmut_z3b_fachweg02" }).fehlerMandatModus === "an");
  check("A5 Ein Fehlerlauf ohne vollen Kontrollhash wird abgelehnt",
    wirft(() => P.kindUmgebung({
      env: {}, zielStufe: 200, laufKennung: "fachweg01", azure: AZURE,
      azureBelegSha256: AZURE_HASH, vorstufenBelegSha256: VORSTUFEN_HASH,
      berichtDatei: "/tmp/a.json", logDatei: "/tmp/a.log",
      vergleichDatei: "/tmp/k.json", fehlerMandat: true
    }), /Kontrollbeleg.*64 Zeichen/));
  check("A6 Verkuerzte Eingangsbelege werden abgelehnt",
    wirft(() => P.kindUmgebung({
      env: {}, zielStufe: 200, laufKennung: "fachweg01", azure: AZURE,
      azureBelegSha256: "a".repeat(16), vorstufenBelegSha256: VORSTUFEN_HASH,
      berichtDatei: "/tmp/a.json", logDatei: "/tmp/a.log"
    }), /Azure Beleg.*64 Zeichen/));

  console.log("\n== B · strenger Kindbericht ==");
  check("B1 Ein gruener Minimalbericht ohne Manifest, Slots, Kriterien und Rohbeleg bleibt rot",
    wirft(() => L.pruefeFachwegBerichtInhalt({
      stand: "Z3a-teilnachweis-lokale-anbieter", fail: 0, befundOffen: 0,
      stufen: [{ mandate: 200, fehlerMandat: null }]
    }, {
      ziel: 200, laufKennung: "fachweg01", modell: "gpt-5-mini",
      azureBelegSha256: AZURE_HASH, vorstufenBelegSha256: VORSTUFEN_HASH,
      fehlerMandat: false
    }), /exaktes Schema/));
  const manifest = R.erstelleFachwegManifest(kontrolle, {
    datenbank: "helmut_z3b_fachweg01",
    gitStand: { sha: GIT_SHA, sauber: true }
  });
  check("B2 Der lokale Manifestbeleg bindet sauberen Git Stand, Code, Ziel und sechs Slots",
    R.pruefeFachwegManifest(manifest, { gitStandPruefen: false })
      && manifest.zielStufe === 200 && manifest.slots.gesamt === 6
      && manifest.codeFingerabdruecke.every((eintrag) => /^[0-9a-f]{64}$/.test(eintrag.sha256)));
  check("B3 Ein Bericht mit Manifest einer anderen Laufkennung wird abgelehnt",
    wirft(() => L.pruefeFachwegBerichtInhalt(berichtMitManifest(manifest), {
      ziel: 200, laufKennung: "anderer1", modell: "gpt-5-mini",
      azureBelegSha256: AZURE_HASH, vorstufenBelegSha256: VORSTUFEN_HASH,
      fehlerMandat: false
    }, { gitStandPruefen: false }), /Ziel, Lauf, Modell und Eingangsbelege/));
  check("B4 Ein Bericht mit einem anderen Eingangshash wird abgelehnt",
    wirft(() => L.pruefeFachwegBerichtInhalt(berichtMitManifest(manifest), {
      ziel: 200, laufKennung: "fachweg01", modell: "gpt-5-mini",
      azureBelegSha256: "f".repeat(64), vorstufenBelegSha256: VORSTUFEN_HASH,
      fehlerMandat: false
    }, { gitStandPruefen: false }), /Ziel, Lauf, Modell und Eingangsbelege/));

  console.log("\n== C · KI Rohbeleg und Büro Nullbefund ==");
  const ohneBuero = rohbeleg();
  check("C1 Der innere Rohbeleg weist Büro null ehrlich aus und erzeugt keinen Tagesbericht",
    ohneBuero.gesamt.buero === 0 && ohneBuero.klassenabdeckungVollstaendig === false
      && ohneBuero.kapazitaetsvertragVollstaendig === false
      && ohneBuero.tagesbedarfsbericht === null
      && ohneBuero.blocker.some((b) => b.grund === "buero-im-queue-fachweg-nicht-ausgefuehrt"));
  check("C2 Der aeussere Validator macht aus dem ehrlichen Büro Nullbefund niemals Gruen",
    wirft(() => L.pruefeKiRohbeleg(ohneBuero, erwartungRoh()), /Büro.*kein Tagesbedarfsbericht/));
  const mitFalschemTagesbericht = klon(ohneBuero);
  mitFalschemTagesbericht.tagesbedarfsbericht = { erfunden: true };
  check("C3 Ein an Büro null angehaengter Schein Tagesbericht bleibt rot",
    wirft(() => L.pruefeKiRohbeleg(mitFalschemTagesbericht, erwartungRoh()), /Büro Nullbefund.*nicht ehrlich/));
  const manipuliert = klon(ohneBuero);
  manipuliert.fachwegBelegHash = "0".repeat(64);
  check("C4 Ein manipulierter voller Rohbeleg Hash wird nachgerechnet und abgelehnt",
    wirft(() => L.pruefeKiRohbeleg(manipuliert, erwartungRoh()), /Hash stimmt nicht/));
  const unsafe = rohbeleg({ buero: 1, unsafe: true });
  check("C5 Number MAX_VALUE kann kein KI Zaehler oder Tagesbedarfswert sein",
    wirft(() => L.pruefeKiRohbeleg(unsafe, erwartungRoh()), /sichere Ganzzahl/));
  const unbekannt = klon(ohneBuero);
  unbekannt.nachtraeglich = true;
  check("C6 Unbekannte Rohbelegfelder werden fail closed abgelehnt",
    wirft(() => L.pruefeKiRohbeleg(unbekannt, erwartungRoh()), /exaktes Schema/));

  console.log("\n== D · konstruktive Startsperre ==");
  let gesperrt = false;
  try { await L.fuehreAus({ ausgabe: "/tmp/z3b-darf-nicht-starten" }); }
  catch (fehlerStart) { gesperrt = /konstruktiv gesperrt/.test(String(fehlerStart && fehlerStart.message)); }
  check("D1 Kein selbst gebautes Konfigurationsobjekt kann den Prozessstart freigeben",
    gesperrt && L.EXTERNE_STARTVERIFIER_AKTIV === false);
  check("D2 Die Startsperre ist als Herkunftsproblem klassifiziert",
    L.sichererFehler(new L.Z3bFachwegAbbruch("gesperrt", "herkunft-offen")).grund === "herkunft-offen");

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((fehler) => {
  console.error(fehler && fehler.stack || fehler);
  process.exitCode = 1;
});
