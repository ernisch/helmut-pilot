"use strict";

// Reiner Offline Vertrag fuer die Integritaet des lokalen Z3b Fachwegs.
// Kein Netz, keine Datenbank, kein Prozessstart und keine Production Kennung.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
for (const name of ["HELMUT_Z3B_FACHWEG_LAUF", "HELMUT_Z3_LOG", "HELMUT_Z3_BERICHT"]) {
  delete process.env[name];
}
const R = require("./skalierung-z3-realistiklauf");
const S = require("./fixtures/z3-slotlauf");
const T = require("./fixtures/z3b-tagesbedarf-bericht");

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
function kopie(wert) { return JSON.parse(JSON.stringify(wert)); }
function signiereManifest(manifest) {
  const m = kopie(manifest);
  delete m.sha256;
  m.sha256 = crypto.createHash("sha256").update(JSON.stringify(m)).digest("hex");
  return m;
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const GIT_SHA = "d".repeat(40);
const LAUF = "fachweg01";

function basisEnv({ ziel = 500, fehlerMandat = false } = {}) {
  return {
    HELMUT_Z3B_FACHWEG_LAUF: LAUF,
    HELMUT_Z3_STUFEN: String(ziel),
    HELMUT_Z3_KI_LATENZ_MS: "2100",
    HELMUT_Z3_KI_STREUUNG_MS: "301",
    HELMUT_Z3_KI_HOECHSTZAHL: "10000",
    HELMUT_Z3_KI_DECKEL: "offen",
    HELMUT_Z3_FEHLERMANDAT: fehlerMandat ? "an" : "aus",
    HELMUT_Z3_VERGLEICH: fehlerMandat ? "/tmp/z3b-kontrollbericht.json" : "",
    HELMUT_Z3_BERICHT: "/tmp/z3b-fachwegbericht.json",
    HELMUT_Z3_LOG: "/tmp/z3b-fachweg.log",
    HELMUT_Z3B_FACHWEG_FREIGABE: `z3b-fachweg:${ziel}:${LAUF}`,
    HELMUT_Z3B_FACHWEG_AZURE_BELEG_SHA256: HASH_A,
    HELMUT_Z3B_FACHWEG_VORSTUFEN_BELEG_SHA256: HASH_B,
    HELMUT_Z3B_FACHWEG_KONTROLL_BELEG_SHA256: fehlerMandat ? HASH_C : "",
    HELMUT_Z3B_FACHWEG_KI_MODELL: "gpt-5-mini"
  };
}

function workerBilanz({ reserviert = 0, erledigt = 0 } = {}) {
  return {
    verfuegbar: true,
    budgetSchicht: "mit-tagesplan",
    reserviert,
    erledigt,
    wiederholt: 0,
    zurueckgestellt: 0,
    endgueltigFehlgeschlagen: 0,
    leaseVerloren: 0
  };
}

function kindFixture() {
  const laufkennung = `z3b-${LAUF}-stufe500-slot1-1780000000000`;
  const plan = {
    ok: true, uebersprungen: false, profile: 500,
    geplant: 10, neu: 10, vorhanden: 0, versucht: 10,
    ausstehend: 0, nichtEingereiht: 0, zeitbudgetErschoepft: false,
    tagesplan: { tag: "2026-08-26", reihenfolge: ["m1"] }
  };
  const wieder = {
    verfuegbar: true, uebersprungen: false, trockenlauf: false,
    gefunden: 0, wiedervorgelegt: 0
  };
  const outboxAbgleich = {
    verfuegbar: true, uebersprungen: false, fehlend: 0, wiedereroeffnet: 0, verzichtet: 0
  };
  const weckVersand = {
    uebersprungen: false, modus: "shadow", transport: "schatten",
    transportVerfuegbar: true, vergeben: 0, versendet: 0, fehlgeschlagen: 0
  };
  const durchlauf = {
    gestartet: true, worker: 4,
    grenzen: { parallel: 4, stapel: 25, leaseMs: 300000, leerlaufWarteMs: 0 },
    reserviert: 2, erledigt: 2, wiederholt: 0, zurueckgestellt: 0,
    endgueltigFehlgeschlagen: 0, leaseVerloren: 0,
    bilanzen: [workerBilanz({ reserviert: 2, erledigt: 2 }),
      workerBilanz(), workerBilanz(), workerBilanz()]
  };
  const startQuittung = {
    ok: true, uebersprungen: false, eintrag: { runId: laufkennung, status: "running" }
  };
  const abschlussQuittung = {
    ok: true, uebersprungen: false, eintrag: { runId: laufkennung, status: "success" }
  };
  const kiZaehler = { understanding: 1, lage: 1, buero: 0, sonstige: 0 };
  const pruefung = {
    plan, wieder, outboxAbgleich, weckVersand, durchlauf,
    startQuittung, abschlussQuittung, kiZaehler,
    laufkennung, fachwegLauf: LAUF, zielMandate: 500, quittungsStatus: "success"
  };
  const integritaet = S.pruefeFachwegIntegritaet(pruefung);
  const bilanz = {
    slot: 1, mandate: 500, laufkennung, fachwegLauf: LAUF, fachwegManifestSha256: HASH_A,
    plan, wiedervorlage: wieder,
    outbox: { abgleich: outboxAbgleich, versand: weckVersand },
    kiKlassen: kiZaehler,
    durchlauf,
    quittung: {
      start: true, ende: true, status: "success", startBeleg: startQuittung, endeBeleg: abschlussQuittung
    },
    integritaet
  };
  return { pruefung, bilanz, ergebnis: { code: 0, bilanz } };
}

function pruefeKindMutation(name, aenderung, muster) {
  const f = kindFixture();
  aenderung(f.pruefung);
  const ergebnis = S.pruefeFachwegIntegritaet(f.pruefung);
  check(name, ergebnis.ok === false && ergebnis.fehler.some((x) => muster.test(x)),
    JSON.stringify(ergebnis.fehler));
}

function kiSlots({ buero = false } = {}) {
  const werte = [
    { understanding: 2, lage: 1, buero: 0, sonstige: 0 },
    { understanding: 1, lage: 1, buero: 0, sonstige: 0 },
    { understanding: 1, lage: 0, buero: 0, sonstige: 0 },
    { understanding: 2, lage: 1, buero: 0, sonstige: 0 },
    { understanding: 1, lage: 1, buero: 0, sonstige: 0 },
    { understanding: 1, lage: 0, buero: buero ? 1 : 0, sonstige: 0 }
  ];
  let kumulativ = 0;
  return werte.map((kiKlassen, index) => {
    kumulativ += Object.values(kiKlassen).reduce((summe, wert) => summe + wert, 0);
    return { slot: index + 1, kiKlassen, kiEndpunktKumulativ: kumulativ };
  });
}

function main() {
  console.log("Helmut — Z3b Fachweg Integritaet, offline\n");

  console.log("== A · Einmaldatenbank und Eingangsvertrag ==");
  const db = R.fachwegDatenbankname(basisEnv(), { pid: 17, zufall: "abcdef123456" });
  check("A1 Die erzeugte Kennung ist neuartig, strikt und kurz", /^helmut_z3b_/.test(db) && db.length <= 63, db);
  for (const ungueltig of ["postgres", "helmut_z3_last", "helmut_z3b_", "HELMUT_Z3B_x",
    "helmut-z3b-x", "helmut_z3b_x;drop", "helmut_z3b_x/y", `helmut_z3b_${"x".repeat(60)}`]) {
    check(`A2 Unsichere Datenbankkennung wird abgelehnt: ${ungueltig.slice(0, 28)}`,
      wirft(() => R.validiereFachwegDatenbankname(ungueltig), /Datenbankname/));
  }
  check("A3 Eine eingeschleuste Datenbankoption wird ebenfalls geprueft",
    wirft(() => R.pruefeFachwegUmgebung(basisEnv(), { datenbank: "postgres" }), /Datenbankname/));
  check("A4 Zielstufenlisten und Teiltreffer werden nicht als 200 akzeptiert",
    wirft(() => R.pruefeFachwegUmgebung({ ...basisEnv(), HELMUT_Z3_STUFEN: "foo,200" }), /genau eine Zielstufe/));
  check("A5 Ein geerbter kleinerer Slotvertrag bricht geschlossen ab",
    wirft(() => R.pruefeFachwegUmgebung({ ...basisEnv(), HELMUT_Z3_MAX_SLOTS: "5" }), /MAX_SLOTS/));
  check("A6 Ein veraendertes Quellenprofil bricht geschlossen ab",
    wirft(() => R.pruefeFachwegUmgebung({ ...basisEnv(), HELMUT_Z3_DROSSEL: "0" }), /DROSSEL/));
  check("A7 Ein veraenderter Pipelineknopf bricht geschlossen ab",
    wirft(() => R.pruefeFachwegUmgebung({ ...basisEnv(), HELMUT_BUDGET_WARTE_MS: "1" }), /BUDGET_WARTE/));
  check("A8 Azure und Vorstufenbelege brauchen volle 64 Zeichen Hashes",
    wirft(() => R.pruefeFachwegUmgebung({ ...basisEnv(), HELMUT_Z3B_FACHWEG_AZURE_BELEG_SHA256: "abc" }), /AZURE_BELEG/));
  check("A9 Der Fehlerlauf braucht Vergleichsdatei und gebundenen Kontrollhash",
    wirft(() => R.pruefeFachwegUmgebung({
      ...basisEnv({ fehlerMandat: true }), HELMUT_Z3_VERGLEICH: "", HELMUT_Z3B_FACHWEG_KONTROLL_BELEG_SHA256: ""
    }), /Kontrollbericht|Kontrollbeleg/));
  check("A10 Der Kontrolllauf darf keinen alten Vergleichshash erben",
    wirft(() => R.pruefeFachwegUmgebung({
      ...basisEnv(), HELMUT_Z3B_FACHWEG_KONTROLL_BELEG_SHA256: HASH_C
    }), /keinen geerbten/));
  check("A11 Das Azure Modell ist ein eigener Pflichtbeleg",
    wirft(() => R.pruefeFachwegUmgebung({ ...basisEnv(), HELMUT_Z3B_FACHWEG_KI_MODELL: "" }), /Azure Modell/));

  const quelltext = fs.readFileSync(path.join(ROOT, "scripts/skalierung-z3-realistiklauf.js"), "utf8");
  const dbFunktion = quelltext.slice(quelltext.indexOf("function legeDatenbankAn"),
    quelltext.indexOf("const LEERBARE_TABELLEN"));
  const fachwegDbZweig = dbFunktion.slice(dbFunktion.indexOf("if (IST_FACHWEG)"), dbFunktion.indexOf("} else {"));
  check("A12 Der Fachweg Datenbankzweig loescht nichts und beendet keine Sitzung",
    /create database/.test(fachwegDbZweig) && !/drop database|pg_terminate_backend/.test(fachwegDbZweig));

  console.log("\n== B · Vollstaendiges, unveraenderliches Manifest ==");
  const manifest = R.erstelleFachwegManifest(basisEnv(), {
    datenbank: "helmut_z3b_fachweg01_17_abcdef123456",
    gitStand: { sha: GIT_SHA, sauber: true }
  });
  check("B1 Das frisch erzeugte Manifest validiert mitsamt echten Codehashes",
    R.pruefeFachwegManifest(manifest, { gitStandPruefen: false }) === true);
  check("B2 Alle direkt tragenden Fachwegdateien sind im Manifest gebunden",
    R.FACHWEG_CODEDATEIEN.every((datei, index) => manifest.codeFingerabdruecke[index].datei === datei)
      && R.FACHWEG_CODEDATEIEN.includes("lib/helmut/storage.js")
      && R.FACHWEG_CODEDATEIEN.includes("lib/helmut/job-dispatch.js")
      && R.FACHWEG_CODEDATEIEN.includes("lib/helmut/scheduler.js")
      && R.FACHWEG_CODEDATEIEN.includes("scripts/fixtures/z3b-tagesbedarf-bericht.js"));
  check("B3 Das Manifest ist bis in verschachtelte Werte eingefroren",
    Object.isFrozen(manifest) && Object.isFrozen(manifest.slots)
      && Object.isFrozen(manifest.codeFingerabdruecke[0]));
  const manipuliert = kopie(manifest); manipuliert.slots.budgetMs = 1;
  check("B4 Auch ein neu signiertes Manifest mit veraenderter Grenze bleibt rot",
    R.pruefeFachwegManifest(signiereManifest(manipuliert), { gitStandPruefen: false }) === false);
  const falscherCode = kopie(manifest); falscherCode.codeFingerabdruecke[0].sha256 = "0".repeat(64);
  check("B5 Ein neu signierter falscher Codefingerabdruck bleibt rot",
    R.pruefeFachwegManifest(signiereManifest(falscherCode), { gitStandPruefen: false }) === false);
  check("B6 Simulationen und offener Orchestratorbefund stehen explizit im Manifest",
    manifest.simulationen.absoluteAufgabenfristenImVerdichtetenLaufNichtBewiesen === true
      && manifest.codebefund.produktionsOrchestratorGemeinsam === false
      && manifest.codebefund.budgettagAnSynthetischeCronzeitGebunden === false);
  check("B7 Die wirksamen Kindwerte stimmen mit dem Manifestprofil ueberein",
    R.fachwegKindUmgebung().HELMUT_BUDGET_MAX_WARTE_MS === "172800000"
      && S.FACHWEG_UMGEBUNG.HELMUT_BUDGET_MAX_WARTE_MS === "172800000"
      && S.FACHWEG_UMGEBUNG.HELMUT_LLM_BUDGET_FAIL_CLOSED === "on");

  console.log("\n== C · Sechs Slots ohne Abkuerzung ==");
  for (let slot = 1; slot <= 5; slot += 1) {
    check(`C1 Nach Slot ${slot} wird unabhaengig vom Rueckstau weitergelaufen`,
      R.sollFachwegNachSlotWeiterlaufen({ slot, restOffen: 0, integritaetOk: true }) === true);
  }
  check("C2 Erst Slot 6 beendet den regulaeren Fachweglauf",
    R.sollFachwegNachSlotWeiterlaufen({ slot: 6, restOffen: 99, integritaetOk: true }) === false);
  const folge = Array.from({ length: 6 }, (_, index) => ({ bilanz: { slot: index + 1 } }));
  check("C3 Nur die lueckenlose Folge 1 bis 6 gilt",
    R.pruefeFachwegSlotfolge(folge) === true
      && R.pruefeFachwegSlotfolge(folge.slice(0, 5)) === false
      && R.pruefeFachwegSlotfolge(folge.map((x, i) => i === 4 ? { bilanz: { slot: 4 } } : x)) === false);
  const anGrenze = R.slotVerteilung([200000, 205000, 210000, 215000, 217500, 280000]);
  const ueberGrenze = R.slotVerteilung([200000, 205000, 210000, 218000, 218001, 279000]);
  check("C4 Das Reservetor bindet p95 217500 und Maximum 280000",
    anGrenze.n === 6 && anGrenze.p95 === 217500 && anGrenze.max === 280000
      && ueberGrenze.p95 > R.FACHWEG_GRENZEN.slotP95MaxMs);

  console.log("\n== D · Kindschritte fail closed ==");
  const gueltig = kindFixture();
  check("D1 Der vollstaendige Kindbeleg ist gruen", gueltig.pruefung && gueltig.bilanz.integritaet.ok === true);
  pruefeKindMutation("D2 Fehlender Planungszaehler ist rot", (f) => { delete f.plan.versucht; }, /planung-zaehler/);
  pruefeKindMutation("D3 Teilplanung ist rot", (f) => { f.plan.ausstehend = 1; }, /planung-ausstehend/);
  pruefeKindMutation("D4 Falsche Mandatsmenge ist rot", (f) => { f.plan.profile = 499; }, /mandatsmenge/);
  pruefeKindMutation("D5 Wiedervorlage ohne Zaehler ist rot", (f) => { delete f.wieder.gefunden; }, /wiedervorlage/);
  pruefeKindMutation("D6 Outboxabgleich ohne Zaehler ist rot", (f) => { delete f.outboxAbgleich.fehlend; }, /outbox-abgleich/);
  pruefeKindMutation("D7 Schattenversand ohne Transportbeleg ist rot", (f) => { delete f.weckVersand.transportVerfuegbar; }, /outbox-versand/);
  pruefeKindMutation("D8 Leere Workerbilanz ist rot", (f) => { f.durchlauf.bilanzen[2] = {}; }, /worker/);
  pruefeKindMutation("D9 Workeraggregat und Einzelbilanzen muessen aufgehen",
    (f) => { f.durchlauf.erledigt = 1; }, /summenwiderspruch/);
  pruefeKindMutation("D10 Worker braucht den echten Tagesplan",
    (f) => { f.durchlauf.bilanzen[0].budgetSchicht = "ohne-tagesplan"; }, /worker/);
  pruefeKindMutation("D11 Startquittung braucht dieselbe Laufkennung",
    (f) => { f.startQuittung.eintrag.runId = "fremd"; }, /startquittung/);
  pruefeKindMutation("D12 Endquittung braucht einen belegten Endstatus",
    (f) => { f.abschlussQuittung.eintrag.status = "failed"; }, /endquittung/);
  pruefeKindMutation("D13 KI Klassenzaehler duerfen nicht fehlen",
    (f) => { f.kiZaehler.buero = null; }, /ki-klassen/);
  const minimal = S.pruefeFachwegIntegritaet({
    plan: { ok: true }, wieder: { verfuegbar: true }, outboxAbgleich: { verfuegbar: true },
    weckVersand: { fehlgeschlagen: 0 }, durchlauf: { gestartet: true },
    startQuittung: { ok: true }, abschlussQuittung: { ok: true }
  });
  check("D14 Ein minimaler Scheinbeleg kann nicht gruen werden", minimal.ok === false && minimal.fehler.length >= 6);

  console.log("\n== E · Unabhaengiger Elternriegel ==");
  const optionen = { slot: 1, laufKennung: LAUF, manifestSha256: HASH_A, zielMandate: 500 };
  check("E1 Der Elternriegel rechnet den gueltigen Kindbeleg selbst nach",
    R.pruefeFachwegSlotErgebnis(gueltig.ergebnis, optionen).ok === true);
  const codeRot = kopie(gueltig.ergebnis); codeRot.code = 2;
  check("E2 Ein roter Kindcode bleibt trotz gruener JSON Bilanz rot",
    R.pruefeFachwegSlotErgebnis(codeRot, optionen).ok === false);
  const planRot = kopie(gueltig.ergebnis); delete planRot.bilanz.plan.versucht; planRot.bilanz.integritaet = { ok: true };
  check("E3 Ein gelogenes Kind Integritaetsflag ueberstimmt fehlende Planung nicht",
    R.pruefeFachwegSlotErgebnis(planRot, optionen).ok === false);
  const manifestRot = kopie(gueltig.ergebnis); manifestRot.bilanz.fachwegManifestSha256 = HASH_B;
  check("E4 Jeder Slot ist an dasselbe Manifest gebunden",
    R.pruefeFachwegSlotErgebnis(manifestRot, optionen).ok === false);
  const zielRot = kopie(gueltig.ergebnis); zielRot.bilanz.mandate = 200;
  check("E5 Eine still verkleinerte Mandatsmenge bleibt rot",
    R.pruefeFachwegSlotErgebnis(zielRot, optionen).ok === false);

  console.log("\n== F · Ehrliche KI Klassenabdeckung ==");
  const ohneBueroSlots = kiSlots();
  const ohneBuero = R.baueFachwegKiRohbeleg({
    zielMandate: 500, laufKennung: LAUF, manifestSha256: HASH_A, gitSha: GIT_SHA,
    slotBilanzen: ohneBueroSlots,
    kiAufrufe: ohneBueroSlots[5].kiEndpunktKumulativ
  });
  check("F1 Echte Rohzaehlung bleibt trotz fehlendem Buero intern vollstaendig",
    ohneBuero.messungVollstaendig === true && ohneBuero.gesamt.buero === 0);
  check("F2 Ohne echten Buero Aufruf entsteht kein Tagesbedarfsvertrag",
    ohneBuero.kapazitaetsvertragVollstaendig === false
      && ohneBuero.tagesbedarfsbericht === null
      && ohneBuero.blocker.some((b) => b.grund === "buero-im-queue-fachweg-nicht-ausgefuehrt"));
  check("F3 Der Rohbeleg traegt einen reproduzierbaren 64 Zeichen Hash",
    /^[0-9a-f]{64}$/.test(ohneBuero.fachwegBelegHash));
  const mitBueroSlots = kiSlots({ buero: true });
  const mitBuero = R.baueFachwegKiRohbeleg({
    zielMandate: 500, laufKennung: LAUF, manifestSha256: HASH_A, gitSha: GIT_SHA,
    slotBilanzen: mitBueroSlots,
    kiAufrufe: mitBueroSlots[5].kiEndpunktKumulativ
  });
  let tagesvertragFormal = null;
  try { tagesvertragFormal = T.pruefeTagesbedarfBericht(mitBuero.tagesbedarfsbericht); }
  catch (_) { tagesvertragFormal = null; }
  check("F4 Nur echte Klassenabdeckung erzeugt den hoechstens formal strukturierten Tagesbedarfsvertrag",
    Boolean(tagesvertragFormal)
      && tagesvertragFormal.zielMandate === 500
      && tagesvertragFormal.status === T.ERGEBNIS_FORMAL
      && tagesvertragFormal.entscheidungsgrundlageVollstaendig === false
      && mitBuero.klassenabdeckungVollstaendig === true
      && mitBuero.tagesbedarfFormalStrukturiert === true
      && mitBuero.kapazitaetsvertragVollstaendig === false
      && mitBuero.entscheidungsgrundlageVollstaendig === false
      && mitBuero.blocker.some((b) => b.grund === "fachweg-gesamtbericht-intern-nicht-nachgeprueft"));
  const abgleichRot = kiSlots(); abgleichRot[5].kiEndpunktKumulativ += 1;
  const abgleichBefund = R.baueFachwegKiRohbeleg({
    zielMandate: 500, laufKennung: LAUF, manifestSha256: HASH_A, gitSha: GIT_SHA,
    slotBilanzen: abgleichRot, kiAufrufe: abgleichRot[5].kiEndpunktKumulativ
  });
  check("F5 Klassenzaehlung und TLS Endpunkt muessen exakt aufgehen",
    abgleichBefund.messungVollstaendig === false
      && abgleichBefund.blocker.some((b) => b.grund === "ki-endpunkt-abgleich-widerspruechlich"));
  const zuWenig = R.baueFachwegKiRohbeleg({
    zielMandate: 500, laufKennung: LAUF, manifestSha256: HASH_A, gitSha: GIT_SHA,
    slotBilanzen: ohneBueroSlots.slice(0, 5), kiAufrufe: ohneBueroSlots[4].kiEndpunktKumulativ
  });
  check("F6 Fuenf Slots koennen keinen vollstaendigen Rohbeleg bilden",
    zuWenig.messungVollstaendig === false && zuWenig.tagesbedarfsbericht === null);
  const sonstigeSlots = kiSlots(); sonstigeSlots[0].kiKlassen.sonstige = 1;
  for (let i = 0, summe = 0; i < sonstigeSlots.length; i += 1) {
    summe += Object.values(sonstigeSlots[i].kiKlassen).reduce((s, n) => s + n, 0);
    sonstigeSlots[i].kiEndpunktKumulativ = summe;
  }
  const sonstige = R.baueFachwegKiRohbeleg({
    zielMandate: 500, laufKennung: LAUF, manifestSha256: HASH_A, gitSha: GIT_SHA,
    slotBilanzen: sonstigeSlots, kiAufrufe: sonstigeSlots[5].kiEndpunktKumulativ
  });
  check("F7 Unbekannte Modellaufrufe werden nicht einer Pflichtklasse zugeschlagen",
    sonstige.kapazitaetsvertragVollstaendig === false
      && sonstige.blocker.some((b) => b.grund === "unbekannte-ki-arbeitsform"));

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
