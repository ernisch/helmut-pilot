"use strict";

// Helmut — BETRIEBSWERKZEUGE DER 495er-TESTKOHORTE (500er-Funktionstest).
// =============================================================================
// Sechs idempotente Werkzeuge für den später GETRENNT freizugebenden
// Production-Funktionstest:
//
//   1. planeProvisionierung   Plan + Trockenlauf der Anlage (immer inaktiv)
//   2. pruefeIsolation        vollständige Isolation der Kohorte belegen
//   3. planeAktivierung       Aktivierung nach Gruppen 20 / 75 / 400
//   4. planeDeaktivierung     Deaktivierung AUSSCHLIESSLICH dieser Kohorte
//   5. pruefeRueckbau         Verifikation des Rückbaus gegen die Grundlinie
//   6. freigabe               doppelter Riegel für jeden scharfen Lauf
//
// Dieses Modul ist REINE LOGIK: keine Datenbank, kein Netz, keine Uhr, keine
// Secrets. Es entscheidet und rechnet; ausgeführt wird nichts. Vorbild ist
// `lib/helmut/jobqueue-neutralisierung.js` (Trockenlauf als Default, eingefrorener
// Vertrag von außen, Riegel vor jeder Wirkung).
//
// ─── DER HARTE SCHUTZ DER FÜNF REALEN MANDATE ────────────────────────────────
//
// Der Schutz ist eine ERLAUBNISLISTE, keine Sperrliste: jedes Werkzeug kann
// ausschließlich auf die 495 Kennungen wirken, die `test-kohorte-500.baueKohorte()`
// deterministisch erzeugt. Eine Kennung, die nicht in dieser Menge liegt, wird
// abgewiesen — nicht gefiltert, nicht übersprungen, sondern der ganze Vorgang
// bricht ab. Damit ist es strukturell unmöglich, ein reales Mandat zu ändern,
// zu deaktivieren oder zu löschen, ohne dass irgendwo ein realer Slug im Code
// stünde (CLAUDE.md §4.2: kein Mandant wird hartkodiert).
//
// Eine Sperrliste realer Kennungen wäre schwächer und verboten zugleich: sie
// müsste die realen Mandate benennen und würde bei jedem neuen Mandat veralten.
//
// ─── GRUNDLINIE IST EINGABE, NICHT SELBSTAUSKUNFT ────────────────────────────
//
// Kein Werkzeug rechnet sich seine Erwartung selbst aus. Die Grundlinie kommt
// aus einer rein lesenden Vorprüfung und wird als eingefrorener Vertrag
// übergeben. Fehlt ein Pflichtwert, entsteht kein Plan (fail closed).

const kommunikationsriegel = require("./kommunikationsriegel");
const {
  baueKohorte,
  kohortenId,
  GRUPPEN,
  KOHORTE_GESAMT,
  REALE_MANDATE,
  PRAEFIX
} = require("./test-kohorte-500");

// ── Freigabe-Mechanik (Vorbild lib/helmut/pending-terminal.js) ───────────────
const EXECUTE_FLAG = "HELMUT_TESTKOHORTE_EXECUTE";
const CONFIRM_VARIABLE = "HELMUT_TESTKOHORTE_CONFIRM";
// Je Schritt ein EIGENES Wort. Die Freigabe der Anlage aktiviert nichts, und die
// Freigabe der Gruppe A aktiviert nicht die Gruppe C.
const FREIGABEWORTE = Object.freeze({
  provisionierung: "TESTKOHORTE_495_ANLEGEN_BESTAETIGT",
  "aktivierung-a": "TESTKOHORTE_GRUPPE_A_20_AKTIVIEREN_BESTAETIGT",
  "aktivierung-b": "TESTKOHORTE_GRUPPE_B_75_AKTIVIEREN_BESTAETIGT",
  "aktivierung-c": "TESTKOHORTE_GRUPPE_C_400_AKTIVIEREN_BESTAETIGT",
  deaktivierung: "TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT",
  // ERGÄNZT 02.09. (adversariale Analyse, bestätigter Befund): Das Deaktivieren
  // lässt die Scheduler-Spur der 495 Kennungen in der EINEN Fairness-Zeile
  // stehen — dort bleibt sie 90 Tage (ENTRY_RETENTION_MS) und verlangsamt
  // danach JEDEN Fairness-Schreibvorgang der fünf realen Mandate. Das Aufräumen
  // ist deshalb ein eigener Schritt mit EIGENER Freigabe: es ist nicht Teil des
  // Rückwegs (der muss immer sofort laufen dürfen), sondern seine Nacharbeit.
  "scheduler-spur": "TESTKOHORTE_495_SCHEDULERSPUR_ENTFERNEN_BESTAETIGT",
  // ERGÄNZT 02.09. (zweiter Reviewbefund, Anforderung 8): Der Ablaufplan nannte
  // für Schritt 14 „bestehender Motor — kein eigener Befehl". Der Pipeline-Cron
  // läuft aber 16:00 UTC, das sichere Fenster endet 15:59 — INNERHALB des
  // Fensters läuft der Motor also nie. Der Fachzyklus braucht deshalb einen
  // eigenen, getrennt freigegebenen Startweg.
  fachzyklus: "TESTKOHORTE_FACHZYKLUS_STARTEN_BESTAETIGT"
});

// Minute des UTC-Tages (0…1439) aus einem ISO-Zeitpunkt. Bewusst hier lokal und
// nicht aus `funktionstest-500` importiert: dieses Modul hängt absichtlich nicht
// am Rahmenmodul (das ergäbe einen Ringschluss). Wirft nie; `null` heißt
// „nicht bewertbar" und führt nachgelagert zu fail closed.
function minuteAusUtcLokal(zeitpunkt) {
  if (zeitpunkt === null || zeitpunkt === undefined || zeitpunkt === "") return null;
  const d = zeitpunkt instanceof Date ? zeitpunkt : new Date(String(zeitpunkt));
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const MODUS_TROCKENLAUF = "trockenlauf";
const MODUS_SCHARF = "scharf";

// ── Die Erlaubnisliste: genau die 495 deterministischen Kennungen ────────────
const KOHORTE_SPEZIFIKATIONEN = Object.freeze(baueKohorte());
const KOHORTE_KENNUNGEN = Object.freeze(KOHORTE_SPEZIFIKATIONEN.map((s) => s.id));
const KOHORTE_MENGE = new Set(KOHORTE_KENNUNGEN);

const GRUPPEN_KENNUNGEN = Object.freeze(Object.fromEntries(GRUPPEN.map((gruppe) => {
  let start = 0;
  for (const vorher of GRUPPEN) {
    if (vorher.kennung === gruppe.kennung) break;
    start += vorher.groesse;
  }
  return [gruppe.kennung, Object.freeze(
    Array.from({ length: gruppe.groesse }, (_, i) => kohortenId(start + i))
  )];
})));

class KohortenAbbruch extends Error {
  constructor(nachricht, grund = "kohorten-abbruch") {
    super(nachricht);
    this.name = "KohortenAbbruch";
    this.grund = grund;
  }
}

function istKohortenKennung(kennung) {
  return KOHORTE_MENGE.has(typeof kennung === "string" ? kennung.trim() : "");
}

// DER SCHUTZRIEGEL. Wirft, sobald eine Kennung nicht zur Kohorte gehört.
// Er filtert NICHT still — eine fremde Kennung ist ein Abbruchgrund.
function pruefeZielmenge(kennungen, stelle = "Zielmenge") {
  if (!Array.isArray(kennungen)) {
    throw new KohortenAbbruch(`${stelle}: keine Liste von Kennungen`, "zielmenge");
  }
  // KORREKTUR 02.09. (adversarialer Review): die Zugehoerigkeitspruefung trimmt
  // (istKohortenKennung), die Duplikatpruefung verglich vorher die ROHEN Werte.
  // `["test-kohorte-a-001", " test-kohorte-a-001"]` kam damit durch — zwei
  // Eintraege fuer dieselbe Zeile. Also zuerst normalisieren, dann pruefen.
  const normalisiert = kennungen.map((k) => (typeof k === "string" ? k.trim() : k));
  const fremde = normalisiert.filter((kennung) => !istKohortenKennung(kennung));
  if (fremde.length) {
    throw new KohortenAbbruch(
      `${stelle}: ${fremde.length} Kennung(en) gehören nicht zur 495er-Testkohorte — `
      + `der Vorgang wird abgebrochen, nicht gefiltert. Erste: ${String(fremde[0]).slice(0, 40)}`,
      "fremde-kennung"
    );
  }
  const doppelte = normalisiert.length - new Set(normalisiert).size;
  if (doppelte) {
    throw new KohortenAbbruch(`${stelle}: ${doppelte} doppelte Kennung(en)`, "doppelte-kennung");
  }
  return Object.freeze([...normalisiert]);
}

// ── Grundlinie: eingefrorener Vertrag aus rein lesender Vorprüfung ───────────
const GRUNDLINIE_PFLICHTFELDER = Object.freeze([
  "erhobenUtc",
  "mandateGesamt",
  "mandateAktiv",
  "mandateInaktiv",
  "mandateGeloescht",
  "identitaetsprofile",
  "kohortenProfile",
  "kohortenProfileAktiv",
  "kohortenProfileGeloescht"
]);

function ganzzahl(wert, name) {
  if (typeof wert !== "number" || !Number.isSafeInteger(wert) || wert < 0) {
    throw new KohortenAbbruch(`Grundlinie: ${name} ist keine sichere Ganzzahl >= 0`, "grundlinie");
  }
  return wert;
}

function pruefeGrundlinie(grundlinie) {
  if (!grundlinie || typeof grundlinie !== "object" || Array.isArray(grundlinie)) {
    throw new KohortenAbbruch("Grundlinie fehlt — ohne rein lesende Vorprüfung kein Plan", "grundlinie");
  }
  const fehlt = GRUNDLINIE_PFLICHTFELDER.filter((feld) => !(feld in grundlinie));
  if (fehlt.length) {
    throw new KohortenAbbruch(`Grundlinie unvollständig: ${fehlt.join(", ")}`, "grundlinie");
  }
  if (typeof grundlinie.erhobenUtc !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(grundlinie.erhobenUtc)) {
    throw new KohortenAbbruch("Grundlinie: erhobenUtc ist kein UTC-Zeitpunkt", "grundlinie");
  }
  const werte = Object.freeze({
    erhobenUtc: grundlinie.erhobenUtc,
    mandateGesamt: ganzzahl(grundlinie.mandateGesamt, "mandateGesamt"),
    mandateAktiv: ganzzahl(grundlinie.mandateAktiv, "mandateAktiv"),
    mandateInaktiv: ganzzahl(grundlinie.mandateInaktiv, "mandateInaktiv"),
    mandateGeloescht: ganzzahl(grundlinie.mandateGeloescht, "mandateGeloescht"),
    identitaetsprofile: ganzzahl(grundlinie.identitaetsprofile, "identitaetsprofile"),
    kohortenProfile: ganzzahl(grundlinie.kohortenProfile, "kohortenProfile"),
    kohortenProfileAktiv: ganzzahl(grundlinie.kohortenProfileAktiv, "kohortenProfileAktiv"),
    kohortenProfileGeloescht: ganzzahl(grundlinie.kohortenProfileGeloescht, "kohortenProfileGeloescht")
  });
  if (werte.mandateAktiv + werte.mandateInaktiv !== werte.mandateGesamt) {
    throw new KohortenAbbruch(
      "Grundlinie widersprüchlich: aktiv + inaktiv ergibt nicht die Gesamtzahl",
      "grundlinie"
    );
  }
  if (werte.kohortenProfileGeloescht > werte.kohortenProfile) {
    throw new KohortenAbbruch(
      "Grundlinie widersprüchlich: mehr gelöschte als vorhandene Kohortenprofile",
      "grundlinie"
    );
  }
  if (werte.kohortenProfileAktiv > werte.kohortenProfile) {
    throw new KohortenAbbruch(
      "Grundlinie widersprüchlich: mehr aktive als vorhandene Kohortenprofile",
      "grundlinie"
    );
  }
  if (werte.kohortenProfile > KOHORTE_GESAMT) {
    throw new KohortenAbbruch(
      `Grundlinie: mehr als ${KOHORTE_GESAMT} Kohortenprofile gemeldet`,
      "grundlinie"
    );
  }
  // Die realen Mandate sind die Gesamtzahl OHNE die Kohorte. Diese Zahl ist die
  // Invariante, die jedes Werkzeug unverändert lassen muss.
  const realeMandate = werte.mandateGesamt - werte.kohortenProfile;
  const realeMandateAktiv = werte.mandateAktiv - werte.kohortenProfileAktiv;
  // Die Löschmarken der Grundlinie zählen ALLE Zeilen. Für den Rückbauvergleich
  // zählt nur der reale Anteil — sonst würde eine Löschmarke auf einer
  // Kohortenzeile eine neue Löschmarke an einem REALEN Mandat verdecken
  // (adversarialer Review 01.09.).
  const realeMandateGeloescht = werte.mandateGeloescht - werte.kohortenProfileGeloescht;
  if (realeMandate < 0 || realeMandateAktiv < 0 || realeMandateGeloescht < 0) {
    throw new KohortenAbbruch("Grundlinie: negative Zahl realer Mandate", "grundlinie");
  }
  return Object.freeze({ ...werte, realeMandate, realeMandateAktiv, realeMandateGeloescht });
}

// ── Bestand: was gerade wirklich in der Datenbank steht (rein lesend erhoben) ─
// `bestand.kohorte` ist eine Liste { id, aktiv } NUR der Kohortenzeilen;
// `bestand.fremdeAktiv` / `fremdeGesamt` beschreiben alles andere in Summe.
function pruefeBestand(bestand) {
  if (!bestand || typeof bestand !== "object" || Array.isArray(bestand)) {
    throw new KohortenAbbruch("Bestand fehlt — ohne rein lesende Erhebung kein Befund", "bestand");
  }
  // ERGAENZT 02.09.: der Bestand traegt jetzt selbst einen Erhebungszeitpunkt.
  // Ohne ihn liess sich ein Bestand von VOR der Provisionierung gegen eine
  // Grundlinie von danach halten — der Rueckbau haette dann eine Lage bestaetigt,
  // die es nie gab. Der Zeitpunkt wird in pruefeRueckbau gegen die Grundlinie
  // gestellt.
  if (typeof bestand.erhobenUtc !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(bestand.erhobenUtc)) {
    throw new KohortenAbbruch("Bestand: erhobenUtc fehlt oder ist kein UTC-Zeitpunkt", "bestand");
  }
  // IDENTITAETS- UND KONTOEBENE (ergaenzt 02.09.): Ein Kohortenprofil besteht aus
  // mehr als der Mandatszeile — die Provisionierung legt auch eine Identitaets-
  // zeile (`profiles`) und ein Konto an. Ein Rueckbau, der nur die Mandatszeile
  // deaktiviert, laesst beides aktiv stehen; kein einziger Befund haette das
  // bisher bemerkt.
  for (const feld of ["identitaetenGesamt", "kohortenIdentitaeten", "kohortenKontenAktiv", "fremdeGesamt", "fremdeAktiv", "fremdeGeloescht"]) {
    // KEINE KOERZIERUNG: Number(null) und Number("") sind 0 — ein nicht
    // gelesener Wert hätte sich als gemessene Null ausgegeben
    // (adversarialer Review 01.09.; vgl. CLAUDE.md §4.4).
    if (!(feld in bestand) || typeof bestand[feld] !== "number") {
      throw new KohortenAbbruch(
        `Bestand: ${feld} fehlt oder ist keine gelesene Zahl — ein nicht gelesener Wert ist keine Null`,
        "bestand"
      );
    }
  }
  if (!Array.isArray(bestand.kohorte)) {
    throw new KohortenAbbruch("Bestand: kohorte ist keine Liste", "bestand");
  }
  const zeilen = bestand.kohorte.map((zeile, index) => {
    if (!zeile || typeof zeile !== "object") {
      throw new KohortenAbbruch(`Bestand: Zeile ${index + 1} ist kein Objekt`, "bestand");
    }
    if (typeof zeile.aktiv !== "boolean") {
      throw new KohortenAbbruch(`Bestand: Zeile ${index + 1} hat kein eindeutiges aktiv-Merkmal`, "bestand");
    }
    // Die TATSÄCHLICH hinterlegte Adresse, nicht die generierte: sie kann nach
    // der Anlage geändert worden sein, und genau darauf kommt es bei der
    // Isolationsprüfung an (adversarialer Review 01.09.).
    if (typeof zeile.email !== "string" || !zeile.email.trim()) {
      throw new KohortenAbbruch(
        `Bestand: Zeile ${index + 1} führt keine gelesene E-Mail-Adresse`,
        "bestand"
      );
    }
    return Object.freeze({ id: String(zeile.id || "").trim(), aktiv: zeile.aktiv, email: zeile.email.trim() });
  });
  // Auch der gelesene Bestand muss den Schutzriegel passieren: taucht dort eine
  // fremde Kennung auf, ist die Erhebung falsch abgegrenzt — Abbruch statt Filter.
  pruefeZielmenge(zeilen.map((z) => z.id), "Bestand der Kohorte");
  return Object.freeze({
    erhobenUtc: bestand.erhobenUtc,
    kohorte: Object.freeze(zeilen),
    identitaetenGesamt: ganzzahl(bestand.identitaetenGesamt, "identitaetenGesamt"),
    kohortenIdentitaeten: ganzzahl(bestand.kohortenIdentitaeten, "kohortenIdentitaeten"),
    kohortenKontenAktiv: ganzzahl(bestand.kohortenKontenAktiv, "kohortenKontenAktiv"),
    fremdeGesamt: ganzzahl(bestand.fremdeGesamt, "fremdeGesamt"),
    fremdeAktiv: ganzzahl(bestand.fremdeAktiv, "fremdeAktiv"),
    fremdeGeloescht: ganzzahl(bestand.fremdeGeloescht, "fremdeGeloescht")
  });
}

// ── Freigabe: Flag UND exaktes Wort, beide nötig ────────────────────────────
function freigabe(schritt, env = process.env) {
  const wort = FREIGABEWORTE[schritt];
  if (!wort) throw new KohortenAbbruch(`Unbekannter Schritt: ${String(schritt).slice(0, 40)}`, "schritt");
  const flag = String((env && env[EXECUTE_FLAG]) || "").trim().toLowerCase();
  const flagAn = ["1", "true", "on", "yes"].includes(flag);
  const bestaetigung = String((env && env[CONFIRM_VARIABLE]) || "");
  const wortStimmt = bestaetigung === wort;
  return Object.freeze({
    schritt,
    erteilt: flagAn && wortStimmt,
    flagAn,
    wortStimmt,
    erwartetesWort: wort,
    meldung: flagAn && wortStimmt
      ? `Freigabe für ${schritt} liegt vor (Flag und Bestätigungswort).`
      : `Freigabe für ${schritt} fehlt: ${!flagAn ? `${EXECUTE_FLAG} ist aus` : ""}`
        + `${!flagAn && !wortStimmt ? " und " : ""}`
        + `${!wortStimmt ? `${CONFIRM_VARIABLE} trägt nicht das erwartete Wort` : ""}.`
  });
}

// Ein scharfer Modus ohne Freigabe fällt IMMER auf den Trockenlauf zurück.
function wirksamerModus(gewuenscht, schritt, env = process.env) {
  const roh = String(gewuenscht || MODUS_TROCKENLAUF).trim().toLowerCase();
  if (roh !== MODUS_TROCKENLAUF && roh !== MODUS_SCHARF) {
    throw new KohortenAbbruch(`Modus muss ${MODUS_TROCKENLAUF} oder ${MODUS_SCHARF} sein`, "modus");
  }
  const erlaubnis = freigabe(schritt, env);
  return Object.freeze({
    gewuenscht: roh,
    wirksam: roh === MODUS_SCHARF && erlaubnis.erteilt ? MODUS_SCHARF : MODUS_TROCKENLAUF,
    freigabe: erlaubnis
  });
}

// ── 1 · Provisionierung: Plan und Trockenlauf ───────────────────────────────
// IDEMPOTENT: angelegt wird nur, was im Bestand fehlt. Ein zweiter Lauf plant
// null Anlagen. Aktiviert wird nie etwas — der Anlage-Stapel legt ausschließlich
// inaktiv an, und dieser Plan verlangt nichts anderes.
function planeProvisionierung({ grundlinie, bestand, modus = MODUS_TROCKENLAUF, env = process.env } = {}) {
  const basis = pruefeGrundlinie(grundlinie);
  const ist = pruefeBestand(bestand);
  const vorhanden = new Set(ist.kohorte.map((z) => z.id));
  const anzulegen = KOHORTE_KENNUNGEN.filter((id) => !vorhanden.has(id));
  pruefeZielmenge(anzulegen, "Anlageplan");
  const m = wirksamerModus(modus, "provisionierung", env);
  return Object.freeze({
    werkzeug: "provisionierung",
    modus: m.wirksam,
    modusGewuenscht: m.gewuenscht,
    freigabe: m.freigabe,
    grundlinie: basis,
    zielGesamt: KOHORTE_GESAMT,
    bereitsVorhanden: ist.kohorte.length,
    anzulegen: Object.freeze(anzulegen),
    anzahlAnzulegen: anzulegen.length,
    bereitsErreicht: anzulegen.length === 0,
    legtAktivAn: false,
    realeMandateBeruehrt: 0,
    hinweis: anzulegen.length === 0
      ? "Kohorte ist bereits vollständig angelegt — der Lauf ist ein reiner No-Op."
      : `${anzulegen.length} synthetische Profile werden INAKTIV angelegt; kein reales Mandat wird berührt.`
  });
}

// ── 2 · Isolationsprüfung ───────────────────────────────────────────────────
// Belegt, dass die Kohorte vollständig von den realen Mandaten getrennt ist.
// Jede Bedingung ist einzeln ausgewiesen — ein „grün" ohne Einzelbefunde gibt es nicht.
// STUFENBEWUSST (ergänzt 03.09.): Ohne `stufe` verlangt der Beleg wie bisher die
// VOLLSTÄNDIGE Kohorte (495). Mit `stufe` gilt er für den Bestand BIS
// EINSCHLIESSLICH dieser Stufe (A = 20, A+B = 95, A+B+C = 495) und verlangt
// zusätzlich, dass GENAU DIESE Stufe vollständig und INAKTIV angelegt ist und
// kein Kohortenkonto aktiv ist. Ohne diese Fassung war der Isolationsbeleg für
// die 20 Profile der Stufe A strukturell unerreichbar — er hätte 495 gelesene
// Zeilen verlangt, die es nach einer stufenweisen Provisionierung nicht gibt.
function pruefeIsolation({ grundlinie, bestand, stufe = null } = {}) {
  const basis = pruefeGrundlinie(grundlinie);
  const ist = pruefeBestand(bestand);
  const kennungen = ist.kohorte.map((z) => z.id);
  // Die TATSÄCHLICH gelesenen Adressen — nicht die generierten. Eine nach der
  // Anlage geänderte Adresse muss die Isolation brechen können
  // (adversarialer Review 01.09.).
  const mails = ist.kohorte.map((z) => z.email);

  let stufenBefund = null;
  if (stufe !== null && stufe !== undefined && String(stufe).trim() !== "") {
    // Spät geladen: `testkohorte-stufen` baut auf diesem Modul auf.
    const stufen = require("./testkohorte-stufen");
    const s = String(stufe).trim().toLowerCase();
    if (!stufen.STUFEN.includes(s)) {
      throw new KohortenAbbruch(
        `Isolation: unbekannte Stufe ${String(stufe).slice(0, 20)} — erlaubt sind ${stufen.STUFEN.join(", ")}`,
        "stufe"
      );
    }
    const erwartet = stufen.kennungenBisStufe(s);
    const erwartetMenge = new Set(erwartet);
    const dieserStufe = new Set(stufen.kennungenDerStufe(s));
    const zeilenDieserStufe = ist.kohorte.filter((z) => dieserStufe.has(z.id));
    stufenBefund = Object.freeze({
      stufe: s,
      erwartetBisStufe: erwartet.length,
      gelesenBisStufe: kennungen.filter((id) => erwartetMenge.has(id)).length,
      umfangStufe: dieserStufe.size,
      gelesenDieserStufe: zeilenDieserStufe.length,
      aktivDieserStufe: zeilenDieserStufe.filter((z) => z.aktiv === true).length,
      kohortenKontenAktiv: ist.kohortenKontenAktiv
    });
  }

  const pruefungen = [
    stufenBefund
      ? {
        name: `Kohorte bis Stufe ${stufenBefund.stufe.toUpperCase()} vollständig gelesen`,
        // Exakt die Kennungen bis einschließlich dieser Stufe — nicht mehr (eine
        // spätere Stufe wäre vorzeitig angelegt), nicht weniger, keine doppelt.
        ok: kennungen.length === stufenBefund.erwartetBisStufe
          && stufenBefund.gelesenBisStufe === stufenBefund.erwartetBisStufe
          && new Set(kennungen).size === kennungen.length,
        detail: `${kennungen.length} gelesene Kohortenzeilen, erwartet ${stufenBefund.erwartetBisStufe} `
          + `(bis einschließlich Stufe ${stufenBefund.stufe.toUpperCase()})`
      }
      : {
        name: "Vollständige Kohorte gelesen",
        // Eine leere oder unvollständige Leseliste ist KEIN Beleg für Isolation:
        // sie entsteht auch, wenn gegen das falsche Projekt oder vor der Anlage
        // gemessen wurde (adversarialer Review 01.09.). Der Isolationsbeleg gilt
        // nur für die VOLLSTÄNDIG angelegte Kohorte.
        ok: kennungen.length === KOHORTE_GESAMT,
        detail: `${kennungen.length} gelesene Kohortenzeilen, erwartet ${KOHORTE_GESAMT}`
      },
    ...(stufenBefund
      ? [
        {
          name: `Stufe ${stufenBefund.stufe.toUpperCase()} vollständig und INAKTIV angelegt`,
          // Die frisch angelegte Stufe erzeugt erst ab ihrer Aktivierung Last.
          // Eine bereits aktive Zeile in dieser Stufe wäre eine umgangene
          // Aktivierungsfreigabe — kein Isolationsbeleg.
          ok: stufenBefund.gelesenDieserStufe === stufenBefund.umfangStufe
            && stufenBefund.aktivDieserStufe === 0,
          detail: `${stufenBefund.gelesenDieserStufe} von ${stufenBefund.umfangStufe} Zeilen gelesen, `
            + `${stufenBefund.aktivDieserStufe} davon aktiv (erwartet 0)`
        },
        {
          name: "Kein Kohortenkonto aktiv",
          // Die Aktivierung rührt Konten nie an; Kohortenkonten bleiben in jeder
          // Stufe gesperrt (kein Login, keine Einladungs-/Reset-Mail).
          ok: ist.kohortenKontenAktiv === 0,
          detail: `${ist.kohortenKontenAktiv} aktive Kohortenkonten gelesen (erwartet 0)`
        }
      ]
      : []),
    {
      name: "Kennungsfamilie getrennt",
      ok: kennungen.length > 0 && kennungen.every((id) => id.startsWith(`${PRAEFIX}-`)),
      detail: `alle ${kennungen.length} Kennungen tragen das Präfix ${PRAEFIX}-`
    },
    {
      name: "Keine fremde Kennung in der Zielmenge",
      ok: kennungen.length > 0 && kennungen.every(istKohortenKennung),
      detail: "jede Bestandszeile liegt in der 495er-Erlaubnisliste"
    },
    {
      name: "Reale Mandate zahlenmäßig unberührt",
      ok: ist.fremdeGesamt === basis.realeMandate,
      detail: `erwartet ${basis.realeMandate}, gelesen ${ist.fremdeGesamt}`
    },
    {
      name: "Keine zustellbare Adresse in der Kohorte",
      ok: mails.length > 0 && mails.every((mail) => /@[^@]*\.invalid$/.test(String(mail))),
      detail: `${mails.length} gelesene Adressen, alle auf die reservierte TLD .invalid`
    },
    {
      name: "Keine Adresskollision",
      ok: mails.length > 0 && new Set(mails).size === mails.length,
      detail: "alle gelesenen Kohortenadressen sind eindeutig"
    },
    {
      name: "Kommunikationsriegel sperrt jede gelesene Zeile",
      // Geprüft wird die Form, in der der Produktionsmailweg tatsächlich
      // aufruft: Kennung UND gelesene Adresse. Eine Zeile, die nur wegen der
      // Adresse gesperrt wäre, genügt hier nicht — die Kennung muss tragen.
      ok: ist.kohorte.length > 0 && ist.kohorte.every((zeile) => {
        const befund = kommunikationsriegel.pruefe({
          kanal: "mail", kennung: zeile.id, empfaenger: zeile.email
        });
        return !befund.erlaubt && befund.signale.includes("kennungsfamilie");
      }),
      detail: "jede Zeile wird über die KENNUNGSFAMILIE gesperrt, nicht nur über die Adresse"
    }
  ].map((p) => Object.freeze({ ...p }));

  const offen = pruefungen.filter((p) => !p.ok);
  return Object.freeze({
    werkzeug: "isolationspruefung",
    stufe: stufenBefund ? stufenBefund.stufe : null,
    stufenBefund,
    isoliert: offen.length === 0,
    pruefungen: Object.freeze(pruefungen),
    offen: Object.freeze(offen.map((p) => p.name)),
    realeMandate: basis.realeMandate,
    kohortenZeilen: kennungen.length
  });
}

// ── 3 · Aktivierung nach Gruppen ────────────────────────────────────────────
// IDEMPOTENT: aktiviert wird nur, was in der Gruppe noch inaktiv ist.
// Die Stufen bauen aufeinander auf: Gruppe B verlangt eine vollständige
// Gruppe A, Gruppe C eine vollständige Gruppe A und B (fail closed).
function planeAktivierung({
  grundlinie,
  bestand,
  gruppe,
  modus = MODUS_TROCKENLAUF,
  env = process.env,
  // ERGÄNZT 02.09. — DIE FEHLENDE BINDUNG ZWISCHEN FENSTERPRÜFUNG UND START.
  // `funktionstest-500.pruefeStartfenster()` beantwortete die Frage, ob ein
  // Zeitfenster sicher ist — aber NIEMAND fragte sie, bevor Profile aktiviert
  // wurden (dieses Modul kannte das Startfenster nicht einmal). Ein Testlauf
  // konnte damit mitten in das ungeklärte 05:45/05:48-Fenster fallen.
  // Jetzt gilt: ein SCHARFER Aktivierungslauf braucht einen bestandenen
  // Fensterbefund. Fehlt er oder ist er negativ, fällt der Lauf auf den
  // Trockenlauf zurück (fail closed) — die Freigabe allein genügt nicht.
  //
  // BEWUSST NUR HIER: Provisionierung legt INAKTIV an (keine Last), und
  // Deaktivierung/Rückbau dürfen NIE an einem Zeitfenster scheitern — sonst
  // wäre ein misslungener Lauf im ungünstigsten Moment nicht mehr abbaubar.
  startfensterBefund = null,
  // ─── BEFUND 02.09. (adversariale Analyse, bestätigt) ──────────────────────
  // Der Fensterbefund war ZEITLOS. `startErlaubt: true` galt unbefristet: ein am
  // Vortag korrekt für 11:36–15:59 erhobener Befund ließ einen scharfen Lauf am
  // nächsten Morgen um 05:47 anstandslos durch — also genau in die 05:45/05:48-
  // Laufzeit, deren Verträglichkeit ausdrücklich NICHT bewiesen ist.
  // `jetztUtc` ist deshalb Pflicht, sobald ein Befund vorliegt: der Befund muss
  // JETZT gelten, nicht irgendwann.
  jetztUtc = null
} = {}) {
  const basis = pruefeGrundlinie(grundlinie);
  const ist = pruefeBestand(bestand);
  const kennung = String(gruppe || "").trim().toLowerCase();
  const definition = GRUPPEN.find((g) => g.kennung === kennung);
  if (!definition) {
    throw new KohortenAbbruch(
      `Gruppe muss eine von ${GRUPPEN.map((g) => g.kennung).join(", ")} sein`,
      "gruppe"
    );
  }
  const zielKennungen = GRUPPEN_KENNUNGEN[kennung];
  pruefeZielmenge(zielKennungen, `Aktivierungsplan Gruppe ${kennung.toUpperCase()}`);

  const zustand = new Map(ist.kohorte.map((z) => [z.id, z.aktiv]));
  const fehlend = zielKennungen.filter((id) => !zustand.has(id));
  const zuAktivieren = zielKennungen.filter((id) => zustand.get(id) === false);

  // Stufenvertrag: alle vorherigen Gruppen müssen vollständig aktiv sein.
  const vorstufen = [];
  for (const g of GRUPPEN) {
    if (g.kennung === kennung) break;
    const ids = GRUPPEN_KENNUNGEN[g.kennung];
    const aktiv = ids.filter((id) => zustand.get(id) === true).length;
    vorstufen.push(Object.freeze({ gruppe: g.kennung, erwartet: ids.length, aktiv, vollstaendig: aktiv === ids.length }));
  }
  const vorstufenOffen = vorstufen.filter((v) => !v.vollstaendig);

  const m = wirksamerModus(modus, `aktivierung-${kennung}`, env);
  // Der Fensterbefund ist EINGABE, nicht Selbstauskunft — genau wie Grundlinie
  // und Bestand. Er stammt aus `funktionstest-500.pruefeStartfenster()` bzw.
  // `startbereitschaft()`. `null` heißt „nicht geprüft" und ist NICHT „frei".
  // Ein Befund ohne `gepruefteCrons > 0` ist NICHT GEPRÜFT: er könnte gegen eine
  // leere Cronliste entstanden sein und meldete dann fälschlich „frei".
  const gepruefteCrons = startfensterBefund && Number.isFinite(startfensterBefund.gepruefteCrons)
    ? startfensterBefund.gepruefteCrons
    : 0;
  const befundGeprueft = Boolean(
    startfensterBefund && startfensterBefund.startErlaubt === true && gepruefteCrons > 0
  );
  // Gilt der Befund JETZT? Das Fenster darf über Mitternacht reichen, deshalb
  // wird die aktuelle Minute zusätzlich um einen Tag verschoben geprüft.
  const jetztMinute = minuteAusUtcLokal(jetztUtc);
  const startMin = startfensterBefund && Number.isFinite(startfensterBefund.startMinuteUtc)
    ? startfensterBefund.startMinuteUtc
    : null;
  const endeMin = startfensterBefund && Number.isFinite(startfensterBefund.endeMinuteUtc)
    ? startfensterBefund.endeMinuteUtc
    : null;
  const fensterGilltJetzt = Boolean(
    jetztMinute !== null && startMin !== null && endeMin !== null
      && ((jetztMinute >= startMin && jetztMinute < endeMin)
        || (jetztMinute + 1440 >= startMin && jetztMinute + 1440 < endeMin))
  );
  const fensterFrei = Boolean(befundGeprueft && fensterGilltJetzt);
  const fensterKonflikte = startfensterBefund && Array.isArray(startfensterBefund.konflikte)
    ? startfensterBefund.konflikte.length
    : null;
  const blockiert = fehlend.length > 0 || vorstufenOffen.length > 0 || !fensterFrei;
  return Object.freeze({
    werkzeug: "aktivierung",
    gruppe: kennung,
    stufe: definition.zweck,
    modus: blockiert ? MODUS_TROCKENLAUF : m.wirksam,
    startfensterGeprueft: befundGeprueft,
    startfensterFrei: fensterFrei,
    startfensterKonflikte: fensterKonflikte,
    startfensterGepruefteCrons: gepruefteCrons,
    startfensterGiltJetzt: fensterGilltJetzt,
    jetztMinuteUtc: jetztMinute,
    modusGewuenscht: m.gewuenscht,
    freigabe: m.freigabe,
    grundlinie: basis,
    zielGroesse: zielKennungen.length,
    zuAktivieren: Object.freeze(zuAktivieren),
    anzahlZuAktivieren: zuAktivieren.length,
    nichtAngelegt: Object.freeze(fehlend),
    vorstufen: Object.freeze(vorstufen),
    vorstufenOffen: Object.freeze(vorstufenOffen.map((v) => v.gruppe)),
    blockiert,
    bereitsErreicht: !blockiert && zuAktivieren.length === 0,
    realeMandateBeruehrt: 0,
    blockadeGruende: Object.freeze([
      ...(fehlend.length ? ["gruppe-nicht-vollstaendig-angelegt"] : []),
      ...(vorstufenOffen.length ? ["vorstufe-unvollstaendig"] : []),
      ...(fensterFrei
        ? []
        : [!startfensterBefund
          ? "startfenster-nicht-geprueft"
          : (gepruefteCrons <= 0
            ? "startfenster-ohne-cronliste"
            : (startfensterBefund.startErlaubt !== true
              ? "startfenster-konflikt"
              : (jetztMinute === null
                ? "startzeit-fehlt"
                : "startzeit-ausserhalb-des-fensters")))])
    ]),
    hinweis: blockiert
      ? (fensterFrei
        ? "Blockiert: nicht alle Profile der Gruppe sind angelegt oder eine Vorstufe ist unvollständig."
        : (!startfensterBefund
          ? "Blockiert: kein Startfensterbefund übergeben — eine ungeprüfte Startzeit gilt nie als frei (fail closed)."
          : (gepruefteCrons <= 0
            ? "Blockiert: der Fensterbefund wurde gegen keine einzige Croneintragung gerechnet — er gilt als ungeprüft (fail closed)."
            : (startfensterBefund.startErlaubt !== true
              ? "Blockiert: das geplante Startfenster kollidiert mit einem Bestandslauf (fail closed)."
              : (jetztMinute === null
                ? "Blockiert: ohne `jetztUtc` lässt sich nicht prüfen, ob der Befund JETZT noch gilt (fail closed)."
                : "Blockiert: die aktuelle Zeit liegt AUSSERHALB des geprüften Fensters — ein Befund von gestern erlaubt keinen Start heute früh (fail closed).")))))
      : `${zuAktivieren.length} synthetische Profile der Gruppe ${kennung.toUpperCase()} werden aktiviert.`
  });
}

// ── 4 · Deaktivierung AUSSCHLIESSLICH der Kohorte ───────────────────────────
// Der erste Rückweg ist NIE das Löschen. Dieses Werkzeug kennt keinen Löschpfad.
function planeDeaktivierung({ grundlinie, bestand, modus = MODUS_TROCKENLAUF, env = process.env } = {}) {
  const basis = pruefeGrundlinie(grundlinie);
  const ist = pruefeBestand(bestand);
  const zuDeaktivieren = ist.kohorte.filter((z) => z.aktiv === true).map((z) => z.id);
  pruefeZielmenge(zuDeaktivieren, "Deaktivierungsplan");
  const m = wirksamerModus(modus, "deaktivierung", env);
  return Object.freeze({
    werkzeug: "deaktivierung",
    modus: m.wirksam,
    modusGewuenscht: m.gewuenscht,
    freigabe: m.freigabe,
    grundlinie: basis,
    zuDeaktivieren: Object.freeze(zuDeaktivieren),
    anzahlZuDeaktivieren: zuDeaktivieren.length,
    bereitsErreicht: zuDeaktivieren.length === 0,
    loeschtNichts: true,
    realeMandateBeruehrt: 0,
    hinweis: zuDeaktivieren.length === 0
      ? "Keine aktive Kohortenzeile — der Rückbau ist bereits erreicht."
      : `${zuDeaktivieren.length} synthetische Profile werden deaktiviert; gelöscht wird nichts.`
  });
}

// ── 5 · Verifikation des Rückbaus ───────────────────────────────────────────
// Prüft gegen die Grundlinie, dass die reale Lage exakt wiederhergestellt ist.
// STUFENBEWUSST (ergänzt 03.09., Reviewbefund): Ohne `stufe` verlangt der Beleg
// wie bisher die VOLLSTÄNDIGE Kohorte (495). Bei einem stufenweisen Bestand
// (nur Stufe A angelegt = 20 Zeilen) wäre der Rückweg damit nie bestätigbar
// gewesen — „20 von 495 gelesen" hätte dauerhaft `zurueckgebaut: false`
// gemeldet, obwohl alles deaktiviert war: ein falsches Rot ausgerechnet am
// Rückweg. Mit `stufe` gilt die Vollständigkeit für den Bestand BIS
// EINSCHLIESSLICH dieser Stufe (exakt diese Kennungen, keine doppelt).
function pruefeRueckbau({ grundlinie, bestand, stufe = null } = {}) {
  const basis = pruefeGrundlinie(grundlinie);
  const ist = pruefeBestand(bestand);
  const aktiveKohorte = ist.kohorte.filter((z) => z.aktiv === true).length;

  let erwartet = null;
  if (stufe !== null && stufe !== undefined && String(stufe).trim() !== "") {
    const stufen = require("./testkohorte-stufen");
    const s = String(stufe).trim().toLowerCase();
    if (!stufen.STUFEN.includes(s)) {
      throw new KohortenAbbruch(
        `Rückbau: unbekannte Stufe ${String(stufe).slice(0, 20)} — erlaubt sind ${stufen.STUFEN.join(", ")}`,
        "stufe"
      );
    }
    erwartet = { stufe: s, kennungen: stufen.kennungenBisStufe(s) };
  }
  const gelesen = ist.kohorte.map((z) => z.id);

  const pruefungen = [
    // ERGAENZT 02.09. (adversarialer Review, bestaetigter Befund): OHNE diese
    // Pruefung bestaetigte der Rueckbau einen LEEREN Bestand als Erfolg —
    // `bestand.kohorte = []` ergab „0 aktive Kohortenzeilen" und damit
    // `zurueckgebaut: true`, obwohl in Wahrheit gar nichts gelesen worden war.
    // Genau das ist der gefaehrlichste Fehlbefund, den dieses Modul haben kann:
    // ein grüner Rückbau über einer noch aktiven Kohorte. `pruefeIsolation`
    // führte die Vollständigkeitsprüfung längst — hier fehlte sie.
    erwartet
      ? {
        name: `Kohorte bis Stufe ${erwartet.stufe.toUpperCase()} vollständig gelesen`,
        ok: gelesen.length === erwartet.kennungen.length
          && new Set(gelesen).size === gelesen.length
          && gelesen.every((id) => erwartet.kennungen.includes(id)),
        detail: `${gelesen.length} von ${erwartet.kennungen.length} Kohortenzeilen gelesen `
          + `(bis einschließlich Stufe ${erwartet.stufe.toUpperCase()})`
      }
      : {
        name: "Vollständige Kohorte gelesen",
        ok: ist.kohorte.length === KOHORTE_GESAMT,
        detail: `${ist.kohorte.length} von ${KOHORTE_GESAMT} Kohortenzeilen gelesen`
      },
    // Der Bestand muss NACH der Grundlinie erhoben sein — sonst bestätigt der
    // Rückbau eine Lage, die vor der Provisionierung galt.
    {
      name: "Bestand ist NACH der Grundlinie erhoben",
      ok: Date.parse(ist.erhobenUtc) >= Date.parse(basis.erhobenUtc),
      detail: `Grundlinie ${basis.erhobenUtc}, Bestand ${ist.erhobenUtc}`
    },
    {
      name: "Keine aktive synthetische Zeile",
      ok: aktiveKohorte === 0,
      detail: `${aktiveKohorte} aktive Kohortenzeilen`
    },
    // Identitäts- und Kontoebene: eine deaktivierte Mandatszeile ist noch kein
    // zurückgebautes Profil, solange das zugehörige Konto weiter anmelden kann.
    {
      name: "Kein aktives Kohortenkonto",
      ok: ist.kohortenKontenAktiv === 0,
      detail: `${ist.kohortenKontenAktiv} aktive Kohortenkonten`
    },
    {
      // Der REALE Anteil der Identitätsprofile: alles ohne die Kohorte.
      //
      // KORRIGIERT 02.09. (adversariales Diff-Review, bestätigter Befund): Hier
      // stand "Die Grundlinie wurde bei 0 Kohortenzeilen erhoben, ihr Wert IST
      // also der reale Anteil". Das war eine ANNAHME, die `pruefeGrundlinie`
      // ausdrücklich NICHT erzwingt — `kohortenProfile` darf dort > 0 sein (etwa
      // bei einer Grundlinie aus einem zweiten Anlauf nach Abbruch).
      //
      // ENTSCHEIDEND: die Grundlinien-SQL erhebt `identitaetsprofile` als
      // `(select count(*) from profiles)` — also die GESAMTZAHL inklusive
      // Kohorte, NICHT den realen Anteil (scripts/testkohorte-495.js). Verglichen
      // wurde damit der reale Anteil von JETZT gegen die Gesamtzahl von DAMALS:
      // bei einer Grundlinie mit Kohorte war der Befund still falsch.
      //
      // Verglichen wird jetzt REALER ANTEIL gegen REALEN ANTEIL. Die Kohorte legt
      // je Mandat genau ein Identitätsprofil an, `kohortenProfile` ist ihr
      // Gegenstück auf der Grundlinienseite. Bei kohortenfreier Grundlinie
      // (`kohortenProfile = 0`) ist die Rechnung identisch zur bisherigen.
      name: "Zahl der realen Identitätsprofile unverändert",
      ok: (ist.identitaetenGesamt - ist.kohortenIdentitaeten)
        === (basis.identitaetsprofile - basis.kohortenProfile),
      detail: `Grundlinie ${basis.identitaetsprofile} gesamt − ${basis.kohortenProfile} Kohorte `
        + `= ${basis.identitaetsprofile - basis.kohortenProfile} real; jetzt ${ist.identitaetenGesamt} `
        + `gesamt − ${ist.kohortenIdentitaeten} Kohorte = ${ist.identitaetenGesamt - ist.kohortenIdentitaeten}`
    },
    {
      name: "Zahl der realen Mandate unverändert",
      ok: ist.fremdeGesamt === basis.realeMandate,
      detail: `Grundlinie ${basis.realeMandate}, jetzt ${ist.fremdeGesamt}`
    },
    {
      name: "Zahl der aktiven realen Mandate unverändert",
      // Die Grundlinie zählt ALLE aktiven Zeilen; der reale Anteil ist die
      // Gesamtzahl ohne den aktiven Kohortenanteil zum Zeitpunkt der Erhebung.
      ok: ist.fremdeAktiv === basis.realeMandateAktiv,
      detail: `Grundlinie ${basis.realeMandateAktiv} real aktiv, jetzt ${ist.fremdeAktiv} real aktiv`
    },
    {
      name: "Keine neue Löschmarke an realen Mandaten",
      // Verglichen wird REAL gegen REAL: die Grundlinie zählt alle Löschmarken,
      // der Bestand nur die der Nicht-Kohortenzeilen. Ohne diese Trennung
      // verdeckte eine Löschmarke auf einer Kohortenzeile eine neue Löschmarke
      // an einem realen Mandat (adversarialer Review 01.09.).
      ok: ist.fremdeGeloescht === basis.realeMandateGeloescht,
      detail: `Grundlinie ${basis.realeMandateGeloescht} reale Löschmarken, jetzt ${ist.fremdeGeloescht}`
    }
  ].map((p) => Object.freeze({ ...p }));

  const offen = pruefungen.filter((p) => !p.ok);
  return Object.freeze({
    werkzeug: "rueckbaupruefung",
    stufe: erwartet ? erwartet.stufe : null,
    zurueckgebaut: offen.length === 0,
    pruefungen: Object.freeze(pruefungen),
    offen: Object.freeze(offen.map((p) => p.name)),
    aktiveKohortenzeilen: aktiveKohorte,
    hinweis: offen.length === 0
      ? "Grundlinie bestätigt: reale Mandate unverändert, keine aktive synthetische Zeile."
      : "Rückbau NICHT bestätigt — die offenen Punkte müssen einzeln geklärt werden."
  });
}

module.exports = {
  EXECUTE_FLAG,
  CONFIRM_VARIABLE,
  FREIGABEWORTE,
  MODUS_TROCKENLAUF,
  MODUS_SCHARF,
  KOHORTE_GESAMT,
  REALE_MANDATE,
  KOHORTE_KENNUNGEN,
  GRUPPEN_KENNUNGEN,
  KohortenAbbruch,
  istKohortenKennung,
  pruefeZielmenge,
  pruefeGrundlinie,
  pruefeBestand,
  freigabe,
  wirksamerModus,
  planeProvisionierung,
  pruefeIsolation,
  planeAktivierung,
  planeDeaktivierung,
  pruefeRueckbau
};
