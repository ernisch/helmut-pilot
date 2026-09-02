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
  deaktivierung: "TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT"
});

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
  const fremde = kennungen.filter((kennung) => !istKohortenKennung(kennung));
  if (fremde.length) {
    throw new KohortenAbbruch(
      `${stelle}: ${fremde.length} Kennung(en) gehören nicht zur 495er-Testkohorte — `
      + `der Vorgang wird abgebrochen, nicht gefiltert. Erste: ${String(fremde[0]).slice(0, 40)}`,
      "fremde-kennung"
    );
  }
  const doppelte = kennungen.length - new Set(kennungen).size;
  if (doppelte) {
    throw new KohortenAbbruch(`${stelle}: ${doppelte} doppelte Kennung(en)`, "doppelte-kennung");
  }
  return Object.freeze([...kennungen]);
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
  for (const feld of ["fremdeGesamt", "fremdeAktiv", "fremdeGeloescht"]) {
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
    kohorte: Object.freeze(zeilen),
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
function pruefeIsolation({ grundlinie, bestand } = {}) {
  const basis = pruefeGrundlinie(grundlinie);
  const ist = pruefeBestand(bestand);
  const kennungen = ist.kohorte.map((z) => z.id);
  // Die TATSÄCHLICH gelesenen Adressen — nicht die generierten. Eine nach der
  // Anlage geänderte Adresse muss die Isolation brechen können
  // (adversarialer Review 01.09.).
  const mails = ist.kohorte.map((z) => z.email);

  const pruefungen = [
    {
      name: "Vollständige Kohorte gelesen",
      // Eine leere oder unvollständige Leseliste ist KEIN Beleg für Isolation:
      // sie entsteht auch, wenn gegen das falsche Projekt oder vor der Anlage
      // gemessen wurde (adversarialer Review 01.09.). Der Isolationsbeleg gilt
      // nur für die VOLLSTÄNDIG angelegte Kohorte.
      ok: kennungen.length === KOHORTE_GESAMT,
      detail: `${kennungen.length} gelesene Kohortenzeilen, erwartet ${KOHORTE_GESAMT}`
    },
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
function planeAktivierung({ grundlinie, bestand, gruppe, modus = MODUS_TROCKENLAUF, env = process.env } = {}) {
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
  const blockiert = fehlend.length > 0 || vorstufenOffen.length > 0;
  return Object.freeze({
    werkzeug: "aktivierung",
    gruppe: kennung,
    stufe: definition.zweck,
    modus: blockiert ? MODUS_TROCKENLAUF : m.wirksam,
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
    hinweis: blockiert
      ? "Blockiert: nicht alle Profile der Gruppe sind angelegt oder eine Vorstufe ist unvollständig."
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
function pruefeRueckbau({ grundlinie, bestand } = {}) {
  const basis = pruefeGrundlinie(grundlinie);
  const ist = pruefeBestand(bestand);
  const aktiveKohorte = ist.kohorte.filter((z) => z.aktiv === true).length;

  const pruefungen = [
    {
      name: "Keine aktive synthetische Zeile",
      ok: aktiveKohorte === 0,
      detail: `${aktiveKohorte} aktive Kohortenzeilen`
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
