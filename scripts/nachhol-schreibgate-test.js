"use strict";

// Nachholskript-Haertung und Production-Schreibgate (Hotfix B4-3, Phasen 5 und 6).
// =============================================================================
// REINE LOGIK: kein Netz, keine DB, kein Schreibzugriff. Geprueft werden die
// beiden Entscheidungen, die den CSD-Nachweislauf am 2026-07-27 unbrauchbar
// gemacht haben — beide sind reine Funktionen und deshalb offline pruefbar.
//
// BEFUND 1 (Phase 5): `--ids` wirkte ERST NACH der Mengenkappung.
//   Der Aufruf holte `nachholKandidaten(..., { limit: max + 1 })` — also 201 von
//   ueber tausend Kandidaten — und filterte ERST DANACH auf die 21 angeforderten
//   Kennungen. Welche 21 uebrig blieben, entschied die Kappung. Ein gezielter
//   Lauf verarbeitete damit stillschweigend eine andere Menge als angefordert,
//   ohne dass die Ausgabe das erkennen liess.
//
// BEFUND 2 (Phase 6): zwei unabhaengige Speicherschalter.
//   Fachtabellen haengen an HELMUT_V3_STORE, Betriebsdaten (LLM-Budget,
//   LLM-Nutzungslog, Lauftelemetrie) an HELMUT_STORAGE_BACKEND. Ohne
//   HELMUT_STORAGE_BACKEND=supabase schreibt ein Production-Lauf Knowledge
//   Objects nach Production, zaehlt seine Kosten aber lokal — der Tagesdeckel
//   startet dann bei 0 statt beim echten Stand.

const { waehleNachholKandidaten, MAX_STANDARD } = require("./vorgangsbildung-nachholen");
const { pruefeSchreibgate, erzwingeSchreibgate, VARIABLEN } = require("../lib/helmut/production-schreibgate");
const lebenszyklus = require("../lib/helmut/vorgangs-lebenszyklus");

let fail = 0;
let n = 0;
function check(name, cond, detail = "") {
  n += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) fail += 1;
}

// =========================================================================
// TEIL 1 · `--ids` wirkt VOR jeder Mengenkappung
// =========================================================================
// Nachbau der Production-Lage: ein grosser Rueckstand, aus dem 21 bestimmte
// Dokumente nachgeholt werden sollen. Die 21 liegen bewusst am ENDE der Liste —
// genau dort, wo eine vorgezogene Kappung sie abschneiden wuerde.
const RUECKSTAND = 1500;
const alleKandidaten = Array.from({ length: RUECKSTAND }, (_, i) => ({
  id: `rd-${String(i).padStart(4, "0")}`,
  zustand: lebenszyklus.ZUSTAND.OHNE_ENDZUSTAND,
  vorgangId: null
}));
const CSD_IDS = alleKandidaten.slice(-21).map((k) => k.id);

const auswahl = waehleNachholKandidaten(alleKandidaten, { ids: CSD_IDS, max: 200 });
check("1 · alle 21 angeforderten Kennungen sind in der Auswahl",
  auswahl.ids.length === 21, `${auswahl.ids.length}`);
check("1 · es sind GENAU die angeforderten Kennungen",
  JSON.stringify(auswahl.ids.slice().sort()) === JSON.stringify(CSD_IDS.slice().sort()));
check("1 · die Auswahl enthaelt kein einziges nicht angefordertes Dokument",
  auswahl.fremd.length === 0, JSON.stringify(auswahl.fremd.slice(0, 5)));
check("1 · die Gesamtzahl des Rueckstands wird ehrlich mitgefuehrt",
  auswahl.gesamt === RUECKSTAND, `${auswahl.gesamt}`);
check("1 · die Mengenkappung schlaegt bei 21 von 200 NICHT zu", auswahl.ueberMax === false);

// Die Gegenprobe zum Altverhalten: waere zuerst gekappt worden, ueberlebte keine
// einzige der angeforderten Kennungen. Das belegt, dass die Reihenfolge — und
// nicht ein Zufall der Testdaten — den Unterschied macht.
const altVerhalten = alleKandidaten.slice(0, 201).filter((k) => CSD_IDS.includes(k.id));
check("1 · GEGENPROBE: mit vorgezogener Kappung waeren 0 von 21 uebrig geblieben",
  altVerhalten.length === 0, `${altVerhalten.length}`);

// =========================================================================
// TEIL 2 · Unbekannte, doppelte und leere Kennungen
// =========================================================================
const mitUnbekannten = waehleNachholKandidaten(alleKandidaten, {
  ids: [...CSD_IDS.slice(0, 3), "rd-gibt-es-nicht", "rd-auch-nicht"], max: 200
});
check("2 · unbekannte Kennungen werden benannt statt verschwiegen",
  mitUnbekannten.unbekannt.length === 2, JSON.stringify(mitUnbekannten.unbekannt));
check("2 · und sie fuehren nicht dazu, dass andere Dokumente einspringen",
  mitUnbekannten.ids.length === 3, JSON.stringify(mitUnbekannten.ids));
check("2 · ausschliesslich unbekannte Kennungen ergeben eine LEERE Auswahl",
  waehleNachholKandidaten(alleKandidaten, { ids: ["x1", "x2"], max: 200 }).ids.length === 0);

// Dubletten werden bereits in parseArgs entfernt; die Auswahl bleibt trotzdem
// robust, falls sie doch durchkommen (Doppelverarbeitung waere doppelte Kosten).
const mitDubletten = waehleNachholKandidaten(alleKandidaten, {
  ids: [CSD_IDS[0], CSD_IDS[0], CSD_IDS[1]], max: 200
});
check("2 · doppelte Kennungen erzeugen keine doppelten Kandidaten",
  mitDubletten.ids.length === 2, JSON.stringify(mitDubletten.ids));

// `--ids` gar nicht gesetzt = kein Filter (das bisherige, richtige Verhalten).
const ohneIds = waehleNachholKandidaten(alleKandidaten, { ids: null, max: 200 });
check("2 · ohne --ids bleibt die vollstaendige Liste erhalten",
  ohneIds.ids.length === RUECKSTAND && ohneIds.fremd.length === 0);
check("2 · und die Mengenkappung meldet den Rueckstand als Befund",
  ohneIds.ueberMax === true);

// =========================================================================
// TEIL 3 · Die Mengenkappung wird bewertet, nicht still angewandt
// =========================================================================
const ueberGrenze = waehleNachholKandidaten(alleKandidaten, { ids: CSD_IDS, max: 5 });
check("3 · bei 21 angeforderten und --max=5 wird NICHTS still gekuerzt",
  ueberGrenze.ids.length === 21, `${ueberGrenze.ids.length}`);
check("3 · stattdessen wird die Ueberschreitung gemeldet (Aufrufer bricht ab)",
  ueberGrenze.ueberMax === true);

// --vorgang schraenkt zusaetzlich ein, ohne die Reihenfolge zu verletzen.
const mitVorgang = alleKandidaten.map((k, i) => ({ ...k, vorgangId: i % 2 ? "vg-a" : "vg-b" }));
const nurVgA = waehleNachholKandidaten(mitVorgang, { vorgang: "vg-a", max: 10000 });
check("3 · --vorgang filtert auf genau diesen Vorgang",
  nurVgA.kandidaten.every((k) => k.vorgangId === "vg-a") && nurVgA.ids.length === RUECKSTAND / 2,
  `${nurVgA.ids.length}`);

// =========================================================================
// TEIL 4 · Argumentpruefung (`parseArgs`)
// =========================================================================
// `--ids=` (leer) sah bisher aus wie "kein Filter" — ein gezielter Lauf waere
// still zu einem Massenlauf geworden. Das ist jetzt ein Abbruch mit Exit 2.
// Geprueft wird ueber einen Kindprozess, weil parseArgs process.exit() ruft.
const { spawnSync } = require("child_process");
const path = require("path");
const SKRIPT = path.join(__dirname, "vorgangsbildung-nachholen.js");
const leer = spawnSync(process.execPath, [SKRIPT, "--ids=", "--vorschau"], { encoding: "utf8" });
check("4 · `--ids=` ohne Wert bricht ab statt still alles zu verarbeiten",
  leer.status === 2, `exit=${leer.status}`);
check("4 · und die Meldung erklaert warum",
  /Massenlauf/.test(String(leer.stderr || "")), String(leer.stderr || "").slice(0, 120));
const leerKomma = spawnSync(process.execPath, [SKRIPT, "--ids=,,, ,", "--vorschau"], { encoding: "utf8" });
check("4 · auch eine Liste aus lauter Trennzeichen bricht ab", leerKomma.status === 2, `exit=${leerKomma.status}`);

// =========================================================================
// TEIL 5 · Das Production-Schreibgate
// =========================================================================
const VOLL = {
  SUPABASE_URL: "https://beispiel.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "platzhalter-kein-echtes-secret",
  HELMUT_V3_STORE: "1",
  HELMUT_STORAGE_BACKEND: "supabase"
};

const ok = pruefeSchreibgate(VOLL);
check("5 · vollstaendige Konfiguration passiert das Gate", ok.ok === true, JSON.stringify(ok.fehlendeVariablen));
check("5 · beide Haelften zeigen auf Production",
  ok.fachtabellenAufSupabase === true && ok.betriebsdatenAufSupabase === true);
check("5 · und es gibt keinen Widerspruch", ok.widerspruch === false);

// DER PRODUCTION-FALL: Fachtabellen auf Supabase, Betriebsdaten lokal.
const derFall = pruefeSchreibgate({ ...VOLL, HELMUT_STORAGE_BACKEND: "" });
check("5 · fehlendes HELMUT_STORAGE_BACKEND bricht den Schreiblauf ab", derFall.ok === false);
check("5 · der Widerspruch wird ausdruecklich erkannt", derFall.widerspruch === true,
  `fach=${derFall.fachtabellenAufSupabase} betrieb=${derFall.betriebsdatenAufSupabase}`);
check("5 · die Meldung nennt die fehlende Variable beim Namen",
  derFall.fehlendeVariablen.includes(VARIABLEN.backend), JSON.stringify(derFall.fehlendeVariablen));
check("5 · und erklaert die Wirkung (Kostendeckel startet bei 0)",
  /Kostendeckel/.test(derFall.meldung), derFall.meldung.slice(0, 160));
check("5 · die Meldung enthaelt KEINEN Secret-Wert",
  !derFall.meldung.includes(VOLL.SUPABASE_SERVICE_ROLE_KEY) && !derFall.meldung.includes(VOLL.SUPABASE_URL));

// Falscher Wert ist so schlimm wie ein fehlender.
const falsch = pruefeSchreibgate({ ...VOLL, HELMUT_STORAGE_BACKEND: "local" });
check("5 · HELMUT_STORAGE_BACKEND=local bricht ebenfalls ab", falsch.ok === false);
check("5 · und der falsche Wert steht in der Meldung",
  /steht auf "local"/.test(falsch.meldung), falsch.meldung.slice(0, 200));

// Jede einzelne fehlende Variable muss fail-closed wirken.
for (const [name, patch] of [
  ["SUPABASE_URL", { SUPABASE_URL: "" }],
  ["SUPABASE_SERVICE_ROLE_KEY", { SUPABASE_SERVICE_ROLE_KEY: "" }],
  ["HELMUT_V3_STORE", { HELMUT_V3_STORE: "" }],
  ["HELMUT_STORAGE_BACKEND", { HELMUT_STORAGE_BACKEND: "" }]
]) {
  const r = pruefeSchreibgate({ ...VOLL, ...patch });
  check(`5 · ohne ${name} wird fail-closed abgebrochen`, r.ok === false, JSON.stringify(r.fehlendeVariablen));
}
check("5 · eine voellig leere Umgebung bricht ab", pruefeSchreibgate({}).ok === false);
check("5 · und benennt alle vier Variablen", pruefeSchreibgate({}).fehlendeVariablen.length === 4,
  JSON.stringify(pruefeSchreibgate({}).fehlendeVariablen));

// Die Alternativnamen des Service-Keys werden anerkannt (sonst lehnte das Gate
// eine Konfiguration ab, die storage.js anschliessend akzeptiert).
for (const alt of ["SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"]) {
  const r = pruefeSchreibgate({ ...VOLL, SUPABASE_SERVICE_ROLE_KEY: "", [alt]: "platzhalter" });
  check(`5 · ${alt} wird als Zugangsdatum anerkannt (gleich wie storage.js)`, r.ok === true, JSON.stringify(r.fehlendeVariablen));
}

// Der umgekehrte Widerspruch: Betriebsdaten auf Production, Fachtabellen inert.
const umgekehrt = pruefeSchreibgate({ ...VOLL, HELMUT_V3_STORE: "" });
check("5 · auch der umgekehrte Widerspruch wird erkannt",
  umgekehrt.widerspruch === true && umgekehrt.ok === false);

// Flag-Schreibweisen wie in storage.js.
for (const wert of ["1", "true", "on", "yes"]) {
  check(`5 · HELMUT_V3_STORE="${wert}" gilt als aktiv (wie in storage.js)`,
    pruefeSchreibgate({ ...VOLL, HELMUT_V3_STORE: wert }).ok === true);
}
check("5 · HELMUT_V3_STORE=\"0\" gilt NICHT als aktiv",
  pruefeSchreibgate({ ...VOLL, HELMUT_V3_STORE: "0" }).ok === false);
check("5 · HELMUT_STORAGE_BACKEND=\"SUPABASE\" (Grossschreibung) wird anerkannt",
  pruefeSchreibgate({ ...VOLL, HELMUT_STORAGE_BACKEND: "SUPABASE" }).ok === true);

// erzwingeSchreibgate beendet den Prozess fail-closed — hier mit Attrappen.
let beendetMit = null;
const zeilen = [];
erzwingeSchreibgate({ ...VOLL, HELMUT_STORAGE_BACKEND: "" }, {
  zweck: "Testlauf", exitCode: 6, log: (m) => zeilen.push(m), exit: (c) => { beendetMit = c; }
});
check("5 · erzwingeSchreibgate bricht mit einem eindeutigen Exit-Code ab", beendetMit === 6, `${beendetMit}`);
check("5 · und gibt die Begruendung aus", zeilen.length === 1 && /ABBRUCH/.test(zeilen[0]));
beendetMit = null;
erzwingeSchreibgate(VOLL, { zweck: "Testlauf", exit: (c) => { beendetMit = c; }, log: () => {} });
check("5 · bei vollstaendiger Konfiguration wird NICHT abgebrochen", beendetMit === null);

// Read-only bleibt read-only: das Gate ist eine reine Funktion und veraendert
// weder die Umgebung noch irgendetwas anderes.
const vorher = JSON.stringify(VOLL);
pruefeSchreibgate(VOLL);
check("5 · das Gate veraendert die uebergebene Umgebung nicht", JSON.stringify(VOLL) === vorher);

// =========================================================================
// TEIL 6 · Verdrahtung: das Gate sitzt VOR dem ersten Schreib-/KI-Zugriff
// =========================================================================
const fs = require("fs");
const quelle = fs.readFileSync(SKRIPT, "utf8");
const posGate = quelle.indexOf("erzwingeSchreibgate");
const posLauf = quelle.indexOf("runUnderstandingShadow(nachzuholen");
const posBestaetigung = quelle.indexOf("HELMUT_NACHHOLEN_BESTAETIGT");
const posVorschauEnde = quelle.indexOf("VORSCHAU — es wurde NICHTS geschrieben");
check("6 · das Schreibgate ist im Nachholskript verdrahtet", posGate > 0);
check("6 · es steht VOR dem eigentlichen Verarbeitungslauf", posGate < posLauf && posLauf > 0);
check("6 · und NACH der Vorschau — Vorschauen bleiben ohne Gate lauffaehig",
  posGate > posVorschauEnde && posVorschauEnde > 0);
check("6 · die Bestaetigungspflicht bleibt zusaetzlich bestehen", posBestaetigung > 0 && posBestaetigung < posGate);
check("6 · die Mengenobergrenze ist unveraendert vorhanden", MAX_STANDARD === 200, `${MAX_STANDARD}`);

console.log(`\n${n - fail}/${n} Assertions erfolgreich.`);
if (fail) console.log(`\nFEHLGESCHLAGEN: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
