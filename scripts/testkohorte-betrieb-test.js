"use strict";

// Offline-Vertragstest der BETRIEBSWERKZEUGE DER 495er-TESTKOHORTE.
//
// Schwerpunkte (Auftrag „Tests" 1–5, 10, 11):
//   * Schutz der fünf realen Mandate (Erlaubnisliste, nicht Sperrliste)
//   * exakte Kohortenmengen 20 / 75 / 400
//   * Idempotenz jedes Werkzeugs
//   * Trockenlauf als Default, scharf nur mit doppeltem Riegel
//   * Rückbau und seine Verifikation
//   * unvollständige Konfiguration blockiert
//
// Es wird nichts provisioniert, nichts aktiviert und nichts geschrieben — das
// Modul unter Test kennt weder Datenbank noch Netz.

const K = require("../lib/helmut/testkohorte-betrieb");
const { GRUPPEN, KOHORTE_GESAMT, REALE_MANDATE, baueKohorte } = require("../lib/helmut/test-kohorte-500");

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

function wirft(fn, grund) {
  try { fn(); return false; }
  catch (fehler) { return fehler && fehler.grund === grund; }
}

// Grundlinie wie am 01.09.2026 rein lesend erhoben (9 Mandate, 5 aktiv,
// 4 inaktiv, 0 Löschmarken, 10 Identitätsprofile, 0 Kohortenprofile).
const GRUNDLINIE = Object.freeze({
  erhobenUtc: "2026-09-01T12:00:00.000Z",
  mandateGesamt: 9,
  mandateAktiv: 5,
  mandateInaktiv: 4,
  mandateGeloescht: 0,
  identitaetsprofile: 10,
  kohortenProfile: 0,
  kohortenProfileAktiv: 0,
  kohortenProfileGeloescht: 0
});

// ERGAENZT 02.09.: der Bestand traegt jetzt einen eigenen Erhebungszeitpunkt und
// die Identitaets-/Kontoebene der Kohorte. Ohne sie bestaetigte der Rueckbau eine
// deaktivierte Mandatszeile, waehrend Identitaet und Konto weiter bestanden.
const BESTAND_BASIS = Object.freeze({
  erhobenUtc: "2026-09-01T13:00:00.000Z",
  identitaetenGesamt: 10,
  kohortenIdentitaeten: 0,
  kohortenKontenAktiv: 0,
  fremdeGesamt: 9,
  fremdeAktiv: 5,
  fremdeGeloescht: 0
});

const LEERER_BESTAND = Object.freeze({ ...BESTAND_BASIS, kohorte: [] });

// Der Bestand fuehrt die TATSAECHLICH gelesene Adresse je Zeile — nicht die
// generierte. Eine nach der Anlage geaenderte Adresse muss auffallen koennen.
function bestandMit(aktiveIds = [], { adressen = {} } = {}) {
  const aktiv = new Set(aktiveIds);
  return {
    ...BESTAND_BASIS,
    kohorte: K.KOHORTE_KENNUNGEN.map((id) => ({
      id,
      aktiv: aktiv.has(id),
      email: adressen[id] || `${id}@test-kohorte.invalid`
    })),
    // Angelegte Kohortenprofile tragen Identitaetszeilen; nach dem Rueckbau sind
    // ihre Konten inaktiv.
    identitaetenGesamt: 10 + K.KOHORTE_KENNUNGEN.length,
    kohortenIdentitaeten: K.KOHORTE_KENNUNGEN.length
  };
}

// ERGAENZT 02.09.: eine Aktivierung braucht seit diesem Sprint einen BESTANDENEN
// Startfensterbefund. Ein fehlender Befund gilt nie als „frei" (fail closed) —
// genau darin bestand die Luecke: die Fensterpruefung existierte, aber niemand
// fragte sie, bevor Profile aktiviert wurden.
const FENSTER_FREI = Object.freeze({ startErlaubt: true, konflikte: [], startMinuteUtc: 696, endeMinuteUtc: 959 });
const FENSTER_KONFLIKT = Object.freeze({ startErlaubt: false, konflikte: [{ art: "bestandscron-im-fenster" }] });

const SCHARF_ENV = (schritt) => ({
  [K.EXECUTE_FLAG]: "1",
  [K.CONFIRM_VARIABLE]: K.FREIGABEWORTE[schritt]
});

function main() {
  console.log("Helmut — Vertragstest der Betriebswerkzeuge der 495er-Testkohorte\n");

  // ── A · Exakte Mengen ─────────────────────────────────────────────────────
  console.log("== A · Exakte Kohortenmengen ==");
  check("A1 Die Kohorte hat exakt 495 Kennungen",
    K.KOHORTE_KENNUNGEN.length === KOHORTE_GESAMT && KOHORTE_GESAMT === 495);
  check("A2 5 reale + 495 synthetische ergeben 500",
    REALE_MANDATE + KOHORTE_GESAMT === 500);
  check("A3 Die Gruppen sind exakt 20 / 75 / 400",
    K.GRUPPEN_KENNUNGEN.a.length === 20
      && K.GRUPPEN_KENNUNGEN.b.length === 75
      && K.GRUPPEN_KENNUNGEN.c.length === 400);
  check("A4 Die Gruppen sind überschneidungsfrei und decken die Kohorte vollständig",
    new Set([...K.GRUPPEN_KENNUNGEN.a, ...K.GRUPPEN_KENNUNGEN.b, ...K.GRUPPEN_KENNUNGEN.c]).size === 495);
  check("A5 Jede Kennung liegt in genau einer Gruppe",
    K.KOHORTE_KENNUNGEN.every((id) =>
      [K.GRUPPEN_KENNUNGEN.a, K.GRUPPEN_KENNUNGEN.b, K.GRUPPEN_KENNUNGEN.c]
        .filter((liste) => liste.includes(id)).length === 1));
  check("A6 Die Gruppengrößen stimmen mit dem Generator überein",
    GRUPPEN.map((g) => g.groesse).join(",") === "20,75,400");
  check("A7 Der Generator ist byte-identisch wiederholbar",
    JSON.stringify(baueKohorte()) === JSON.stringify(baueKohorte()));

  // ── B · Schutz der fünf realen Mandate ────────────────────────────────────
  console.log("\n== B · Harter Schutz der realen Mandate ==");
  check("B1 Eine fremde Kennung bricht den Vorgang ab (kein stilles Filtern)",
    wirft(() => K.pruefeZielmenge(["test-kohorte-a-001", "ein-reales-mandat"]), "fremde-kennung"));
  check("B2 Auch eine einzelne fremde Kennung genügt zum Abbruch",
    wirft(() => K.pruefeZielmenge(["ein-reales-mandat"]), "fremde-kennung"));
  check("B3 Ein bloßes Präfix reicht nicht — die Kennung muss in der Menge liegen",
    !K.istKohortenKennung("test-kohorte-a-999")
      && !K.istKohortenKennung("test-kohorte-d-001")
      && wirft(() => K.pruefeZielmenge(["test-kohorte-a-999"]), "fremde-kennung"));
  check("B4 Andere synthetische Familien gehören NICHT zur Zielmenge",
    !K.istKohortenKennung("test-mdb-1") && !K.istKohortenKennung("synth-mandat-001")
      && !K.istKohortenKennung("stapel-a"));
  check("B5 Doppelte Kennungen brechen ab",
    wirft(() => K.pruefeZielmenge(["test-kohorte-a-001", "test-kohorte-a-001"]), "doppelte-kennung"));
  check("B6 Ein Bestand mit fremder Zeile wird abgewiesen",
    wirft(() => K.pruefeBestand({ ...BESTAND_BASIS, kohorte: [{ id: "ein-reales-mandat", aktiv: true, email: "a@b.invalid" }] }), "fremde-kennung"));
  check("B7 Im Modul steht keine einzige reale Mandatskennung",
    (() => {
      const quelle = require("fs").readFileSync(require("path").join(__dirname, "..", "lib", "helmut", "testkohorte-betrieb.js"), "utf8");
      // Der Schutz ist eine Erlaubnisliste; eine Sperrliste realer Slugs gäbe es
      // hier nicht geben dürfen (CLAUDE.md §4.2).
      return !/PROTECTED_IDS|REALE_KENNUNGEN\s*=\s*\[/.test(quelle)
        && /Erlaubnisliste/.test(quelle);
    })());
  check("B8 Jeder Plan meldet ausdrücklich null berührte reale Mandate",
    K.planeProvisionierung({ grundlinie: GRUNDLINIE, bestand: LEERER_BESTAND }).realeMandateBeruehrt === 0
      && K.planeDeaktivierung({ grundlinie: GRUNDLINIE, bestand: bestandMit(K.GRUPPEN_KENNUNGEN.a) }).realeMandateBeruehrt === 0
      && K.planeAktivierung({ grundlinie: GRUNDLINIE, bestand: bestandMit(), gruppe: "a" }).realeMandateBeruehrt === 0);
  check("B9 Es gibt keinen Löschpfad in der Deaktivierung",
    K.planeDeaktivierung({ grundlinie: GRUNDLINIE, bestand: bestandMit(K.GRUPPEN_KENNUNGEN.a) }).loeschtNichts === true
      && typeof K.teardownTenant === "undefined");

  // ── C · Unvollständige Konfiguration blockiert ────────────────────────────
  console.log("\n== C · Unvollständige Grundlinie oder Bestand blockiert ==");
  check("C1 Ohne Grundlinie entsteht kein Plan",
    wirft(() => K.planeProvisionierung({ bestand: LEERER_BESTAND }), "grundlinie"));
  for (const feld of ["mandateGesamt", "mandateAktiv", "mandateInaktiv", "mandateGeloescht",
    "identitaetsprofile", "kohortenProfile", "kohortenProfileAktiv",
    "kohortenProfileGeloescht", "erhobenUtc"]) {
    const luecke = { ...GRUNDLINIE };
    delete luecke[feld];
    check(`C2-${feld} Fehlender Pflichtwert blockiert`,
      wirft(() => K.planeProvisionierung({ grundlinie: luecke, bestand: LEERER_BESTAND }), "grundlinie"));
  }
  check("C3 Eine widersprüchliche Grundlinie blockiert",
    wirft(() => K.planeProvisionierung({ grundlinie: { ...GRUNDLINIE, mandateAktiv: 7 }, bestand: LEERER_BESTAND }), "grundlinie"));
  check("C4 Mehr aktive als vorhandene Kohortenprofile blockieren",
    wirft(() => K.planeProvisionierung({ grundlinie: { ...GRUNDLINIE, kohortenProfileAktiv: 1 }, bestand: LEERER_BESTAND }), "grundlinie"));
  check("C5 Ein Zeitstempel ohne UTC-Form blockiert",
    wirft(() => K.planeProvisionierung({ grundlinie: { ...GRUNDLINIE, erhobenUtc: "2026-09-01" }, bestand: LEERER_BESTAND }), "grundlinie"));
  check("C6 Ohne Bestand entsteht kein Plan",
    wirft(() => K.planeProvisionierung({ grundlinie: GRUNDLINIE }), "bestand"));
  check("C7 Eine Bestandszeile ohne eindeutiges aktiv-Merkmal blockiert",
    wirft(() => K.pruefeBestand({ ...BESTAND_BASIS, kohorte: [{ id: "test-kohorte-a-001", email: "a@b.invalid" }] }), "bestand"));
  check("C8 Ein Bestand ohne gelesene Löschmarken blockiert",
    wirft(() => K.pruefeBestand({ ...BESTAND_BASIS, kohorte: [], fremdeGeloescht: undefined }), "bestand"));

  // ── D · Trockenlauf ist Default, scharf braucht den doppelten Riegel ──────
  console.log("\n== D · Trockenlauf als Default, doppelter Riegel für scharf ==");
  const ohneModus = K.planeProvisionierung({ grundlinie: GRUNDLINIE, bestand: LEERER_BESTAND });
  check("D1 Ohne Modusangabe läuft alles trocken",
    ohneModus.modus === K.MODUS_TROCKENLAUF);
  const scharfOhneFreigabe = K.planeProvisionierung({
    grundlinie: GRUNDLINIE, bestand: LEERER_BESTAND, modus: K.MODUS_SCHARF, env: {}
  });
  check("D2 Scharf ohne Freigabe fällt auf den Trockenlauf zurück",
    scharfOhneFreigabe.modusGewuenscht === K.MODUS_SCHARF
      && scharfOhneFreigabe.modus === K.MODUS_TROCKENLAUF
      && scharfOhneFreigabe.freigabe.erteilt === false);
  check("D3 Nur das Flag genügt nicht",
    K.freigabe("provisionierung", { [K.EXECUTE_FLAG]: "1" }).erteilt === false);
  check("D4 Nur das Bestätigungswort genügt nicht",
    K.freigabe("provisionierung", { [K.CONFIRM_VARIABLE]: K.FREIGABEWORTE.provisionierung }).erteilt === false);
  check("D5 Flag und Wort zusammen erteilen die Freigabe",
    K.freigabe("provisionierung", SCHARF_ENV("provisionierung")).erteilt === true);
  check("D6 Ein fast richtiges Wort genügt nicht",
    K.freigabe("provisionierung", {
      [K.EXECUTE_FLAG]: "1",
      [K.CONFIRM_VARIABLE]: `${K.FREIGABEWORTE.provisionierung} `
    }).erteilt === false);
  check("D7 Jeder Schritt hat ein EIGENES Bestätigungswort",
    new Set(Object.values(K.FREIGABEWORTE)).size === Object.keys(K.FREIGABEWORTE).length
      && Object.keys(K.FREIGABEWORTE).length === 5);
  check("D8 Die Freigabe der Anlage aktiviert nichts",
    K.freigabe("aktivierung-a", SCHARF_ENV("provisionierung")).erteilt === false);
  check("D9 Die Freigabe der Gruppe A aktiviert nicht die Gruppe C",
    K.freigabe("aktivierung-c", SCHARF_ENV("aktivierung-a")).erteilt === false);
  check("D10 Die Freigabe der Anlage deaktiviert nichts",
    K.freigabe("deaktivierung", SCHARF_ENV("provisionierung")).erteilt === false);
  check("D11 Ein unbekannter Modus bricht ab",
    wirft(() => K.wirksamerModus("halbscharf", "provisionierung", {}), "modus"));

  // ── E · Provisionierung: idempotent und immer inaktiv ─────────────────────
  console.log("\n== E · Provisionierung ==");
  const ersterLauf = K.planeProvisionierung({ grundlinie: GRUNDLINIE, bestand: LEERER_BESTAND });
  check("E1 Der erste Lauf plant genau 495 Anlagen",
    ersterLauf.anzahlAnzulegen === 495 && ersterLauf.bereitsErreicht === false);
  check("E2 Die Anlage ist ausdrücklich inaktiv",
    ersterLauf.legtAktivAn === false);
  const zweiterLauf = K.planeProvisionierung({ grundlinie: GRUNDLINIE, bestand: bestandMit() });
  check("E3 IDEMPOTENZ: der zweite Lauf plant null Anlagen",
    zweiterLauf.anzahlAnzulegen === 0 && zweiterLauf.bereitsErreicht === true);
  const halb = {
    ...BESTAND_BASIS,
    kohorte: K.KOHORTE_KENNUNGEN.slice(0, 200).map((id) => ({ id, aktiv: false, email: `${id}@test-kohorte.invalid` })),
    identitaetenGesamt: 10 + 200,
    kohortenIdentitaeten: 200
  };
  check("E4 Ein abgebrochener Lauf wird genau ergänzt",
    K.planeProvisionierung({ grundlinie: GRUNDLINIE, bestand: halb }).anzahlAnzulegen === 295);
  check("E5 Der Plan enthält ausschließlich Kohortenkennungen",
    ersterLauf.anzulegen.every(K.istKohortenKennung));

  // ── F · Isolationsprüfung ─────────────────────────────────────────────────
  console.log("\n== F · Isolationsprüfung ==");
  const isolation = K.pruefeIsolation({ grundlinie: GRUNDLINIE, bestand: bestandMit() });
  check("F1 Die vollständige Kohorte ist isoliert",
    isolation.isoliert === true && isolation.offen.length === 0);
  check("F2 Es werden sieben Einzelbefunde ausgewiesen (kein pauschales Grün)",
    isolation.pruefungen.length === 7 && isolation.pruefungen.every((p) => typeof p.detail === "string"));
  const verschoben = K.pruefeIsolation({
    grundlinie: GRUNDLINIE,
    bestand: { ...bestandMit(), fremdeGesamt: 8 }
  });
  check("F3 Eine veränderte Zahl realer Mandate bricht die Isolation",
    verschoben.isoliert === false
      && verschoben.offen.includes("Reale Mandate zahlenmäßig unberührt"));
  check("F4 Jede Kohortenkennung wird über die KENNUNGSFAMILIE gesperrt",
    isolation.pruefungen.find((p) => p.name.startsWith("Kommunikationsriegel")).ok === true);

  // ── Regressionen aus dem adversarialen Review 01.09. ──────────────────────
  check("F5 Eine leer gelesene Kohorte gilt NICHT als isoliert",
    K.pruefeIsolation({ grundlinie: GRUNDLINIE, bestand: LEERER_BESTAND }).isoliert === false);
  check("F6 Eine unvollständig gelesene Kohorte gilt NICHT als isoliert",
    K.pruefeIsolation({ grundlinie: GRUNDLINIE, bestand: halb }).offen
      .includes("Vollständige Kohorte gelesen"));
  const echteAdresse = bestandMit([], { adressen: { "test-kohorte-a-001": "buero@bundestag.de" } });
  const mitEchter = K.pruefeIsolation({ grundlinie: GRUNDLINIE, bestand: echteAdresse });
  check("F7 Eine nachträglich eingetragene ECHTE Adresse bricht die Isolation",
    mitEchter.isoliert === false
      && mitEchter.offen.includes("Keine zustellbare Adresse in der Kohorte"),
    mitEchter.offen.join(", "));
  check("F8 Die Riegelprüfung nutzt die GELESENE Adresse, nicht die generierte",
    K.pruefeIsolation({ grundlinie: GRUNDLINIE, bestand: echteAdresse })
      .pruefungen.find((p) => p.name.startsWith("Kommunikationsriegel")).ok === true,
    "über die Kennungsfamilie bleibt auch die echte Adresse gesperrt");

  // ── G · Aktivierung nach Gruppen ──────────────────────────────────────────
  console.log("\n== G · Aktivierung nach Gruppen 20 / 75 / 400 ==");
  const aktivA = K.planeAktivierung({
    grundlinie: GRUNDLINIE, bestand: bestandMit(), gruppe: "a", startfensterBefund: FENSTER_FREI
  });
  check("G1 Gruppe A plant exakt 20 Aktivierungen",
    aktivA.anzahlZuAktivieren === 20 && aktivA.blockiert === false, aktivA.blockadeGruende.join(", "));
  // ── Neue Bindung 02.09.: ohne freien Fensterbefund keine Aktivierung ───────
  check("G1a OHNE Fensterbefund bleibt die Aktivierung blockiert (fail closed)",
    (() => {
      const ohne = K.planeAktivierung({ grundlinie: GRUNDLINIE, bestand: bestandMit(), gruppe: "a" });
      return ohne.blockiert === true
        && ohne.startfensterGeprueft === false
        && ohne.blockadeGruende.includes("startfenster-nicht-geprueft");
    })());
  check("G1b Mit KONFLIKTBEHAFTETEM Fensterbefund bleibt die Aktivierung blockiert",
    (() => {
      const konflikt = K.planeAktivierung({
        grundlinie: GRUNDLINIE, bestand: bestandMit(), gruppe: "a", startfensterBefund: FENSTER_KONFLIKT
      });
      return konflikt.blockiert === true && konflikt.blockadeGruende.includes("startfenster-konflikt");
    })());
  check("G1c Der RÜCKWEG wird NIE durch ein Startfenster blockiert",
    K.planeDeaktivierung({ grundlinie: GRUNDLINIE, bestand: bestandMit(K.GRUPPEN_KENNUNGEN.a) })
      .anzahlZuDeaktivieren === 20);
  const nachA = bestandMit(K.GRUPPEN_KENNUNGEN.a);
  check("G2 IDEMPOTENZ: Gruppe A erneut geplant ergibt null",
    K.planeAktivierung({ grundlinie: GRUNDLINIE, bestand: nachA, gruppe: "a", startfensterBefund: FENSTER_FREI }).bereitsErreicht === true);
  const bOhneA = K.planeAktivierung({ grundlinie: GRUNDLINIE, bestand: bestandMit(), gruppe: "b" });
  check("G3 Gruppe B ohne vollständige Gruppe A ist blockiert",
    bOhneA.blockiert === true && bOhneA.vorstufenOffen.includes("a"));
  const bNachA = K.planeAktivierung({ grundlinie: GRUNDLINIE, bestand: nachA, gruppe: "b", startfensterBefund: FENSTER_FREI });
  check("G4 Gruppe B nach vollständiger Gruppe A plant exakt 75",
    bNachA.blockiert === false && bNachA.anzahlZuAktivieren === 75);
  const nachAB = bestandMit([...K.GRUPPEN_KENNUNGEN.a, ...K.GRUPPEN_KENNUNGEN.b]);
  const cNachAB = K.planeAktivierung({ grundlinie: GRUNDLINIE, bestand: nachAB, gruppe: "c", startfensterBefund: FENSTER_FREI });
  check("G5 Gruppe C nach A und B plant exakt 400",
    cNachAB.blockiert === false && cNachAB.anzahlZuAktivieren === 400);
  const cOhneB = K.planeAktivierung({ grundlinie: GRUNDLINIE, bestand: nachA, gruppe: "c" });
  check("G6 Gruppe C ohne Gruppe B ist blockiert",
    cOhneB.blockiert === true && cOhneB.vorstufenOffen.includes("b"));
  check("G7 Eine unbekannte Gruppe bricht ab",
    wirft(() => K.planeAktivierung({ grundlinie: GRUNDLINIE, bestand: bestandMit(), gruppe: "d" }), "gruppe"));
  const nichtAngelegt = K.planeAktivierung({ grundlinie: GRUNDLINIE, bestand: LEERER_BESTAND, gruppe: "a" });
  check("G8 Eine nicht angelegte Gruppe kann nicht aktiviert werden",
    nichtAngelegt.blockiert === true && nichtAngelegt.nichtAngelegt.length === 20);
  check("G9 Eine blockierte Aktivierung bleibt trocken, auch mit Freigabe",
    K.planeAktivierung({
      grundlinie: GRUNDLINIE, bestand: LEERER_BESTAND, gruppe: "a",
      modus: K.MODUS_SCHARF, env: SCHARF_ENV("aktivierung-a")
    }).modus === K.MODUS_TROCKENLAUF);
  check("G10 Der Aktivierungsplan enthält nur Kennungen der eigenen Gruppe",
    aktivA.zuAktivieren.every((id) => K.GRUPPEN_KENNUNGEN.a.includes(id)));
  check("G11 Die Summe der drei Stufen ergibt genau 495",
    aktivA.anzahlZuAktivieren + bNachA.anzahlZuAktivieren + cNachAB.anzahlZuAktivieren === 495);

  // ── H · Deaktivierung und Rückbau ─────────────────────────────────────────
  console.log("\n== H · Deaktivierung und Rückbau ==");
  const alleAktiv = bestandMit(K.KOHORTE_KENNUNGEN);
  const abbau = K.planeDeaktivierung({ grundlinie: GRUNDLINIE, bestand: alleAktiv });
  check("H1 Die Deaktivierung erfasst genau die 495 aktiven Kohortenzeilen",
    abbau.anzahlZuDeaktivieren === 495 && abbau.zuDeaktivieren.every(K.istKohortenKennung));
  check("H2 IDEMPOTENZ: erneut geplant ergibt null",
    K.planeDeaktivierung({ grundlinie: GRUNDLINIE, bestand: bestandMit() }).bereitsErreicht === true);
  check("H3 Eine Teilaktivierung wird genau erfasst",
    K.planeDeaktivierung({ grundlinie: GRUNDLINIE, bestand: nachA }).anzahlZuDeaktivieren === 20);
  const rueckbau = K.pruefeRueckbau({ grundlinie: GRUNDLINIE, bestand: bestandMit() });
  check("H4 Der Rückbau ist gegen die Grundlinie bestätigt",
    rueckbau.zurueckgebaut === true && rueckbau.aktiveKohortenzeilen === 0);
  check("H5 Eine verbliebene aktive Zeile verhindert die Bestätigung",
    K.pruefeRueckbau({ grundlinie: GRUNDLINIE, bestand: nachA }).zurueckgebaut === false);
  check("H6 Eine veränderte Zahl aktiver realer Mandate verhindert die Bestätigung",
    K.pruefeRueckbau({
      grundlinie: GRUNDLINIE, bestand: { ...bestandMit(), fremdeAktiv: 4 }
    }).zurueckgebaut === false);
  check("H7 Eine neue Löschmarke an realen Mandaten verhindert die Bestätigung",
    K.pruefeRueckbau({
      grundlinie: GRUNDLINIE, bestand: { ...bestandMit(), fremdeGeloescht: 1 }
    }).zurueckgebaut === false);
  // ERWEITERT 02.09.: aus vier Einzelbefunden sind sechs geworden. Zwei davon
  // schliessen den gefaehrlichsten Fehlbefund des Moduls: ein LEERER Bestand
  // ergab „0 aktive Kohortenzeilen" und damit einen gruenen Rueckbau ueber einer
  // moeglicherweise noch aktiven Kohorte. Dazu die Identitaets-/Kontoebene.
  check("H8 Der Rückbau weist acht Einzelbefunde aus",
    rueckbau.pruefungen.length === 8, rueckbau.pruefungen.map((p) => p.name).join(" | "));
  check("H8b Der leere Bestand gilt NICHT mehr als erfolgreicher Rückbau",
    K.pruefeRueckbau({ grundlinie: GRUNDLINIE, bestand: LEERER_BESTAND }).zurueckgebaut === false);
  check("H8c Ein VOR der Grundlinie erhobener Bestand wird abgewiesen",
    K.pruefeRueckbau({
      grundlinie: GRUNDLINIE,
      bestand: { ...bestandMit(), erhobenUtc: "2026-08-31T10:00:00.000Z" }
    }).offen.includes("Bestand ist NACH der Grundlinie erhoben"));
  check("H8d Ein noch aktives Kohortenkonto bricht den Rückbau",
    K.pruefeRueckbau({
      grundlinie: GRUNDLINIE,
      bestand: { ...bestandMit(), kohortenKontenAktiv: 1 }
    }).offen.includes("Kein aktives Kohortenkonto"));
  // Regression: Löschmarken werden REAL gegen REAL verglichen. Eine Löschmarke
  // auf einer Kohortenzeile darf keine neue an einem realen Mandat verdecken.
  const nachAbbruch = {
    ...GRUNDLINIE, mandateGesamt: 504, mandateInaktiv: 499, mandateGeloescht: 1,
    kohortenProfile: 495, kohortenProfileGeloescht: 1
  };
  check("H10 Löschmarke auf einer Kohortenzeile verdeckt keine an einem realen Mandat",
    K.pruefeRueckbau({
      grundlinie: nachAbbruch,
      bestand: { ...bestandMit(), fremdeGeloescht: 1 }
    }).offen.includes("Keine neue Löschmarke an realen Mandaten"));
  check("H11 Derselbe Stand ohne neue reale Löschmarke ist bestätigt",
    K.pruefeRueckbau({ grundlinie: nachAbbruch, bestand: bestandMit() }).zurueckgebaut === true);
  // Regression: ein nicht gelesener Wert ist keine gemessene Null.
  check("H12 fremdeGeloescht = null blockiert, statt still zu 0 zu werden",
    wirft(() => K.pruefeRueckbau({
      grundlinie: GRUNDLINIE,
      bestand: { ...BESTAND_BASIS, kohorte: [], fremdeGeloescht: null }
    }), "bestand"));
  check("H13 Auch fremdeGesamt und fremdeAktiv dulden keine Koerzierung",
    ["fremdeGesamt", "fremdeAktiv", "identitaetenGesamt", "kohortenIdentitaeten", "kohortenKontenAktiv"]
      .every((feld) => wirft(() => K.pruefeBestand({
        ...BESTAND_BASIS, kohorte: [], [feld]: "9"
      }), "bestand")));
  check("H9 Der erste Rückweg ist Deaktivierung, nicht Löschen",
    /gelöscht wird nichts/.test(abbau.hinweis));

  // ── I · Reinheit des Moduls ───────────────────────────────────────────────
  console.log("\n== I · Das Modul berührt weder Datenbank noch Netz ==");
  const quelle = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "helmut", "testkohorte-betrieb.js"), "utf8");
  check("I1 Kein fetch, kein http, kein storage-Require",
    !/\bfetch\s*\(/.test(quelle) && !/require\((["'])(https?|node:https?)\1\)/.test(quelle)
      && !/require\((["'])\.\/storage\1\)/.test(quelle));
  check("I2 Kein Provisionierungs- oder Kontozugriff",
    !/require\((["'])\.\/(provisioning|accounts)\1\)/.test(quelle));
  check("I3 Keine Uhr im Modul (die Grundlinie bringt ihren Zeitstempel mit)",
    !/Date\.now\(\)/.test(quelle) && !/new Date\(\)/.test(quelle));

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main();
