"use strict";

// Offline-Vertragstest: DER MESSLÄUFER FÜHRT OHNE AUSDRÜCKLICHE FREIGABE
// NULL NETZAUFRUFE AUS — und die Stichprobe ist nie die automatische
// Fortsetzung der Vorprobe.
//
// Der Beweis läuft über einen ZÄHLENDEN fetch-Ersatz: er zählt jeden Aufruf und
// wirft sofort. Käme es je zu einem Netzaufruf, wäre der Zähler > 0 und der Test
// rot. Es wird kein echtes Netz berührt, kein Schlüssel gelesen und kein Modell
// aufgerufen.

const fs = require("fs");
const path = require("path");
const P = require("./fixtures/z3b-azure-plan");
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

// FESTER Bezugstag. Er darf NIE aus dem geprüften Feld selbst stammen — sonst
// prüfte das Preisdatum sich gegen sich selbst und ein veraltetes Datum käme
// durch (im ersten Entwurf dieses Tests genau so passiert und hier korrigiert).
const HEUTE_UTC = new Date().toISOString().slice(0, 10);

// Jeder Aufruf zählt und bricht ab. Der Zähler ist der eigentliche Nachweis.
let netzaufrufe = 0;
function zaehlenderFetch() {
  netzaufrufe += 1;
  throw new Error("VERBOTENER NETZAUFRUF im Freigaberiegel-Test");
}

function vollstaendigeUmgebung({
  modus = "vorprobe",
  lauf = "azureprobe01",
  vorprobeLauf = modus === "stichprobe" ? "azurevorprobe9" : "",
  vorprobeBeleg = modus === "stichprobe" ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : ""
} = {}) {
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
    HELMUT_Z3B_AZURE_PREISDATUM_UTC: HEUTE_UTC,
    HELMUT_Z3B_AZURE_KOSTENLIMIT_USD: "0.25"
  };
  if (vorprobeLauf) env.HELMUT_Z3B_AZURE_VORPROBE_LAUF = vorprobeLauf;
  if (vorprobeBeleg) env.HELMUT_Z3B_AZURE_VORPROBE_BELEG = vorprobeBeleg;
  env.HELMUT_Z3B_AZURE_FREIGABE = Z.freigabeKennung({
    modus,
    laufKennung: lauf,
    aufrufe: P.MODI[modus] ? P.MODI[modus].aufrufe : 0,
    vorprobeLauf,
    vorprobeBeleg
  });
  return env;
}

// Ein Lauf, der bis zum Netz kommen SOLL, wenn die Konfiguration greift.
async function versuche(env) {
  const konfiguration = Z.liesKonfiguration(env, { heuteUtc: HEUTE_UTC });
  return Z.fuehreMesslauf(konfiguration, { fetchImpl: zaehlenderFetch });
}

async function bricht(env, muster) {
  try {
    await versuche(env);
    return false;
  } catch (fehler) {
    return muster.test(String((fehler && fehler.message) || ""));
  }
}

async function main() {
  console.log("Helmut — Freigaberiegel und Null-Netzaufruf des Z3b-Messläufers\n");

  // ── E · Ohne vollständige Freigabe entsteht KEIN Netzaufruf ────────────────
  console.log("== E · Null Netzaufrufe ohne ausdrückliche Freigabe ==");

  const unvollstaendig = [
    ["gar keine Umgebung", {}],
    ["nur der Endpunkt", { AZURE_OPENAI_ENDPOINT: "https://helmut-z3b-test.openai.azure.com" }],
    ["Quellenmodus nicht aus", { ...vollstaendigeUmgebung(), HELMUT_SOURCE_MODE: "on" }],
    ["ohne Schlüssel", { ...vollstaendigeUmgebung(), AZURE_OPENAI_KEY: "" }],
    ["ohne Deployment", { ...vollstaendigeUmgebung(), AZURE_OPENAI_DEPLOYMENT: "" }],
    ["ohne belegten Modelltyp", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_MODELL: "" }],
    ["fremder Modelltyp", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_MODELL: "gpt-4o" }],
    ["ohne Deploymentart", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_DEPLOYMENTART: "" }],
    ["erfundene Deploymentart", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_DEPLOYMENTART: "europa" }],
    ["ohne Region", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_REGION: "" }],
    ["ohne Modus", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_MODUS: "" }],
    ["erfundener Modus", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_MODUS: "dauerlast" }],
    ["ohne Laufkennung", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_LAUF: "" }],
    ["ohne Eingabepreis", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_PREIS_INPUT_USD_MIO: "" }],
    ["ohne Ausgabepreis", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_PREIS_OUTPUT_USD_MIO: "" }],
    ["ohne Preisquelle", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_PREISQUELLE: "" }],
    ["Preisdatum von gestern", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_PREISDATUM_UTC: "2020-01-01" }],
    ["ohne Kostenlimit", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_KOSTENLIMIT_USD: "" }],
    ["Kostenlimit über 1 USD", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_KOSTENLIMIT_USD: "5" }],
    ["ohne Freigabekennung", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_FREIGABE: "" }],
    ["falsche Freigabekennung", { ...vollstaendigeUmgebung(), HELMUT_Z3B_AZURE_FREIGABE: "z3b-azure:vorprobe:3:fremd0" }],
    ["sichtbare Datenbankkennung", { ...vollstaendigeUmgebung(), SUPABASE_SERVICE_ROLE_KEY: "irgendwas" }],
    ["sichtbare Fremdproviderkennung", { ...vollstaendigeUmgebung(), OPENAI_API_KEY: "irgendwas" }],
    ["fremder Zielhost", { ...vollstaendigeUmgebung(), AZURE_OPENAI_ENDPOINT: "https://beliebig.example.com" }],
    ["Ziel mit Pfad", { ...vollstaendigeUmgebung(), AZURE_OPENAI_ENDPOINT: "https://helmut-z3b-test.openai.azure.com/openai" }]
  ];

  const vorher = netzaufrufe;
  let abgebrochen = 0;
  for (const [name, env] of unvollstaendig) {
    let hatGeworfen = false;
    try {
      await versuche(env);
    } catch (_) {
      hatGeworfen = true;
    }
    if (hatGeworfen) abgebrochen += 1;
    else console.log(`  (Hinweis: "${name}" hat NICHT abgebrochen)`);
  }
  check(`E1 Alle ${unvollstaendig.length} unvollständigen Konfigurationen brechen ab`,
    abgebrochen === unvollstaendig.length, `${abgebrochen}/${unvollstaendig.length}`);
  check("E2 Dabei entstand KEIN einziger Netzaufruf",
    netzaufrufe === vorher, `Zähler ${netzaufrufe}, erwartet ${vorher}`);
  check("E3 Der Zähler steht insgesamt auf null", netzaufrufe === 0, `Zähler ${netzaufrufe}`);

  // ── F · Keine automatische Fortsetzung Vorprobe → Stichprobe ───────────────
  console.log("\n== F · Keine automatische Fortsetzung vom ersten zum zweiten Paket ==");

  check("F1 Die Stichprobe ohne benannte Vorprobe wird abgewiesen",
    await bricht({ ...vollstaendigeUmgebung({ modus: "stichprobe", vorprobeLauf: "" }) },
      /Laufkennung der getrennt freigegebenen gruenen Vorprobe/));

  const selbstbezug = vollstaendigeUmgebung({ modus: "stichprobe", lauf: "azureprobe01", vorprobeLauf: "azureprobe01" });
  check("F2 Die Stichprobe darf sich nicht selbst als Vorprobe führen",
    await bricht(selbstbezug, /nicht die eigene Laufkennung/));

  const vorprobeMitBeleg = vollstaendigeUmgebung({ modus: "vorprobe" });
  vorprobeMitBeleg.HELMUT_Z3B_AZURE_VORPROBE_LAUF = "azurevorprobe9";
  check("F3 Die Vorprobe kennt keinen eigenen Vorprobebeleg",
    await bricht(vorprobeMitBeleg, /Vorprobe kennt keinen eigenen Vorprobebeleg/));

  // Eine Vorprobe-Freigabe lässt sich nicht als Stichproben-Freigabe verwenden.
  const wiederverwendet = vollstaendigeUmgebung({ modus: "stichprobe", lauf: "azureprobe02" });
  wiederverwendet.HELMUT_Z3B_AZURE_FREIGABE = Z.freigabeKennung({
    modus: "vorprobe", laufKennung: "azureprobe02", aufrufe: 3
  });
  check("F4 Eine Vorprobe-Freigabe gilt nicht für die Stichprobe",
    await bricht(wiederverwendet, /nicht lauf und kostenbezogen freigeschaltet/));

  // Die Freigabekennung der Stichprobe enthält die fremde Vorprobenkennung —
  // sie kann vor der Vorprobe gar nicht gebildet werden.
  const kennung = Z.freigabeKennung({
    modus: "stichprobe", laufKennung: "azureprobe02", aufrufe: 21,
    vorprobeLauf: "azurevorprobe9", vorprobeBeleg: "a".repeat(64)
  });
  check("F5 Die Stichproben-Freigabe trägt Kennung UND Fingerabdruck der Vorprobe",
    kennung === `z3b-azure:stichprobe:21:azureprobe02:nach-vorprobe:azurevorprobe9:${"a".repeat(64)}`,
    kennung.slice(0, 70));
  check("F6 Die Vorproben-Freigabe trägt keinen Kettenanhang",
    Z.freigabeKennung({ modus: "vorprobe", laufKennung: "azureprobe01", aufrufe: 3 })
      === "z3b-azure:vorprobe:3:azureprobe01");

  check("F7 Die Stichprobe ohne Vorprobe-Fingerabdruck wird abgewiesen",
    await bricht(vollstaendigeUmgebung({ modus: "stichprobe", vorprobeBeleg: "" }),
      /Einzelmessungs-Fingerabdruck der gruenen Vorprobe/));
  check("F8 Ein Fingerabdruck falscher Form wird abgewiesen",
    await bricht(vollstaendigeUmgebung({ modus: "stichprobe", vorprobeBeleg: "kurz" }),
      /Einzelmessungs-Fingerabdruck/));
  const vorprobeMitFingerabdruck = vollstaendigeUmgebung({ modus: "vorprobe" });
  vorprobeMitFingerabdruck.HELMUT_Z3B_AZURE_VORPROBE_BELEG = "b".repeat(64);
  check("F9 Die Vorprobe kennt keinen eigenen Fingerabdruck",
    await bricht(vorprobeMitFingerabdruck, /kennt keinen eigenen Vorprobebeleg/));
  check("F10 Der Fingerabdruck stammt aus dem Bericht der Vorprobe, nicht aus der Umgebung",
    /einzelmessungenSha256/.test(fs.readFileSync(path.join(ROOT, "scripts", "skalierung-z3b-azure.js"), "utf8")));

  check("F11 Auch die Kettenprüfungen erzeugten keinen Netzaufruf", netzaufrufe === 0, `Zähler ${netzaufrufe}`);

  // ── G · Prozessweite Paketsperre im Einstieg ──────────────────────────────
  console.log("\n== G · Ein Prozess führt höchstens ein Freigabepaket aus ==");
  const quelle = fs.readFileSync(path.join(ROOT, "scripts", "skalierung-z3b-azure.js"), "utf8");
  check("G1 Der Einstieg trägt eine prozessweite Paketsperre",
    /prozessPaketGelaufen\s*=\s*false/.test(quelle) && /if \(prozessPaketGelaufen\)/.test(quelle));
  check("G2 Es gibt keinen Rücksetzer der Paketsperre",
    !/prozessPaketGelaufen\s*=\s*false/.test(quelle.split("async function main()")[1] || ""));
  check("G3 Der Einstieg ruft den Messlauf genau einmal auf",
    (quelle.match(/await fuehreMesslauf\(/g) || []).length === 1);
  check("G4 Es gibt keine Schleife über die Modi im Einstieg",
    !/for\s*\(.*MODI/.test(quelle) && !/Object\.keys\(MODI\)\.for/.test(quelle));

  // ── H · Der Läufer kennt keinen Datenbank- oder Importpfad ─────────────────
  console.log("\n== H · Kein Datenbank-, Import- oder Production-Pfad ==");
  check("H1 Kein storage-, supabase- oder provisioning-Require",
    !/require\((["'])[^"']*(storage|supabase|provisioning|accounts)[^"']*\1\)/.test(quelle));
  check("H2 Der einzige Netzpfad ist der Responses-Endpunkt",
    (quelle.match(/fetchImpl\(/g) || []).length === 1
      && /\/openai\/v1\/responses/.test(quelle));
  check("H3 store:false ist in der Payload fest verdrahtet",
    P.bauePayload(P.baueMessauftraege("vorprobe")[0], "attrappe").store === false);
  check("H4 Parallelität eins und null Wiederholungen sind Konstanten",
    P.PARALLELITAET === 1 && P.WIEDERHOLUNGEN === 0);
  check("H5 Beide Pakete zusammen bleiben bei höchstens 24 Aufrufen",
    P.MODI.vorprobe.aufrufe + P.MODI.stichprobe.aufrufe === P.AUFRUFE_UEBER_BEIDE_MODI_MAX
      && P.AUFRUFE_UEBER_BEIDE_MODI_MAX === 24);

  check("H6 Am Ende des gesamten Tests steht der Netzzähler auf null",
    netzaufrufe === 0, `Zähler ${netzaufrufe}`);

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error("Testabbruch:", (fehler && fehler.message) || fehler);
  process.exit(1);
});
