"use strict";

// Helmut — DER STUFENVERTRAG DES 500er-FUNKTIONSTESTS (20 / 75 / 400).
// =============================================================================
// WAS BISHER FEHLTE (Prüfung 02.09. nach dem Merge von #295, am Kopf 9079ac3
// nachgerechnet). Der Auftrag verlangt, dass die drei Stufen GETRENNT behandelt
// werden und JEDE Stufe getrennte, ausdrückliche Freigaben für sechs Vorgänge
// trägt: Provisionierung · Aktivierung · Fachzyklus · Auswertung ·
// Deaktivierung · vollständiger Rückbau.
//
// TATSACHE (`testkohorte-betrieb.FREIGABEWORTE`, dort acht Worte): getrennt nach
// Stufen ist AUSSCHLIESSLICH die Aktivierung (`aktivierung-a/-b/-c`). Alles
// andere gilt pauschal für die ganze Kohorte:
//
//   provisionierung   TESTKOHORTE_495_ANLEGEN_BESTAETIGT          alle 495
//   fachzyklus        TESTKOHORTE_FACHZYKLUS_STARTEN_BESTAETIGT   alle 500 aktiv
//   deaktivierung     TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT     alle 495
//   scheduler-spur    TESTKOHORTE_495_SCHEDULERSPUR_ENTFERNEN_…   alle 495
//
// FOLGE, und das ist der eigentliche Mangel: Nach der Aktivierung von Gruppe A
// (20 Profile) gibt es KEINEN freigegebenen Weg, für genau diese 20 einen
// Fachzyklus zu fahren und ihn auszuwerten. Der Ablaufplan sieht den Fachzyklus
// erst bei 500 aktiven Profilen vor (Schritt 14) und die Auswertung nur
// GEMEINSAM (Schritt 15). Die Stufung ist damit heute eine Stufung der
// AKTIVIERUNG, nicht des TESTS: Sie prüft, ob 20 Profile angelegt werden
// können — nicht, ob 20 Profile fachlich durchlaufen. Die Sicherheitsfrage
// „hält der Verdrängungsschutz unter Last?" wird deshalb erst bei 500 gestellt,
// also genau dann, wenn ein Fehlschlag am teuersten ist.
//
// ─── WAS DIESES MODUL IST ───────────────────────────────────────────────────
// Die eine kanonische Antwort auf „welche Kennungen gehören zu Stufe X, und
// welches Wort gibt Vorgang Y auf Stufe X frei?". Reine Logik: kein Netz, keine
// Datenbank, keine Uhr, keine Secrets. Es wirft nur bei einem Programmierfehler
// des Aufrufers (unbekannte Stufe/Vorgang), nie bei einer Umgebungsfrage.
//
// ─── WAS DIESES MODUL AUSDRÜCKLICH NICHT TUT ────────────────────────────────
//  * Es SETZT keine Umgebungsvariable und schaltet nichts frei. Es beschreibt
//    nur, welche Freigabe fehlt. Ohne gesetzte Werte meldet es fail closed
//    „nicht erteilt" — das ist der Normalzustand.
//  * Es führt NICHTS aus. Ausführer sind `testkohorte-vorwaerts.js`,
//    `testkohorte-rueckbau.js`, `testkohorte-entfernung.js`, `funktionstest-zyklus.js`.
//  * Es ersetzt die acht Bestandsworte NICHT. Die bleiben unverändert gültig;
//    dieses Modul legt die STUFENGENAUEN Worte daneben. Ein bestehender Ablauf
//    verhält sich dadurch nicht anders (Regressionsvertrag in
//    `scripts/testkohorte-stufen-test.js`, Abschnitt „Bestandsverträglichkeit").
//  * Es ist in der HEUTIGEN Production wirkungslos: 0 synthetische Zeilen
//    (rein lesend bestätigt 02.09.), keine der Variablen gesetzt.

const {
  EXECUTE_FLAG,
  CONFIRM_VARIABLE,
  FREIGABEWORTE,
  GRUPPEN_KENNUNGEN,
  KOHORTE_KENNUNGEN,
  istKohortenKennung
} = require("./testkohorte-betrieb");

// ── DIE DREI STUFEN ─────────────────────────────────────────────────────────
// Die Zahlen sind NICHT hier gesetzt, sondern aus der Kohortendefinition
// abgeleitet. Eine Änderung dort kann diese Tabelle nicht stillschweigend
// falsch machen — der Test rechnet beide gegeneinander.
const STUFEN = Object.freeze(["a", "b", "c"]);

const STUFEN_UMFANG = Object.freeze({
  a: (GRUPPEN_KENNUNGEN.a || []).length,   // 20
  b: (GRUPPEN_KENNUNGEN.b || []).length,   // 75
  c: (GRUPPEN_KENNUNGEN.c || []).length    // 400
});

// Wie viele synthetische Profile sind NACH dieser Stufe aktiv? Die Stufen bauen
// aufeinander auf: A bleibt aktiv, wenn B dazukommt.
const STUFEN_AKTIV_KUMULIERT = Object.freeze({
  a: STUFEN_UMFANG.a,
  b: STUFEN_UMFANG.a + STUFEN_UMFANG.b,
  c: STUFEN_UMFANG.a + STUFEN_UMFANG.b + STUFEN_UMFANG.c
});

// ── DIE SECHS VORGÄNGE JE STUFE ─────────────────────────────────────────────
// `schreibend` unterscheidet die Vorgänge, die Production-Daten ändern, von den
// rein lesenden. Nur schreibende Vorgänge brauchen eine Freigabe; die Auswertung
// ist rein lesend und wird NICHT künstlich freigabepflichtig gemacht — eine
// Freigabe, die nichts schützt, entwertet die anderen.
const VORGAENGE = Object.freeze([
  Object.freeze({
    id: "provisionierung", schreibend: true,
    beschreibung: "Die Profile dieser Stufe INAKTIV anlegen. Ändert mandate_profiles und profiles."
  }),
  Object.freeze({
    id: "aktivierung", schreibend: true,
    beschreibung: "Die Profile dieser Stufe scharf schalten (profileActive=true). Ab hier erzeugen sie Last."
  }),
  Object.freeze({
    id: "fachzyklus", schreibend: true,
    beschreibung: "Einen begrenzten Warteschlangenlauf für den auf dieser Stufe erreichten Bestand fahren. "
      + "Kostet Modellaufrufe und ist der einzige Vorgang, der die 5 realen Mandate verdrängen KANN."
  }),
  Object.freeze({
    id: "auswertung", schreibend: false,
    beschreibung: "Die Stufe rein lesend bewerten (Laufbilanz, Kosten, Abbruchregeln A01–A15). "
      + "Keine Freigabe nötig — dieser Vorgang schreibt nichts."
  }),
  Object.freeze({
    id: "deaktivierung", schreibend: true,
    beschreibung: "Die Profile dieser Stufe wieder abschalten. Der Rückweg; er darf jederzeit laufen."
  }),
  Object.freeze({
    id: "entfernung", schreibend: true,
    beschreibung: "Die Profile dieser Stufe VOLLSTÄNDIG entfernen (Zeilen weg, nicht nur inaktiv). "
      + "Der gefährlichste Vorgang des Vorhabens und deshalb der am strengsten verriegelte."
  })
]);

const VORGANG_IDS = Object.freeze(VORGAENGE.map((v) => v.id));
const SCHREIBENDE_VORGAENGE = Object.freeze(VORGAENGE.filter((v) => v.schreibend).map((v) => v.id));

// ── DIE STUFENGENAUEN FREIGABEWORTE ─────────────────────────────────────────
// Muster: TESTKOHORTE_STUFE_<A|B|C>_<VORGANG>_BESTAETIGT.
// Die Aktivierung übernimmt BEWUSST das Bestandswort aus `FREIGABEWORTE`
// (`aktivierung-a/-b/-c`) — sie war schon gestuft, und ein zweites Wort für
// denselben Vorgang wäre eine zweite Wahrheit (CLAUDE.md §7.7).
function stufenWort(stufe, vorgang) {
  return `TESTKOHORTE_STUFE_${String(stufe).toUpperCase()}_${String(vorgang).toUpperCase()}_BESTAETIGT`;
}

const STUFEN_FREIGABEWORTE = Object.freeze(STUFEN.reduce((acc, stufe) => {
  acc[stufe] = Object.freeze(SCHREIBENDE_VORGAENGE.reduce((worte, vorgang) => {
    worte[vorgang] = vorgang === "aktivierung"
      ? FREIGABEWORTE[`aktivierung-${stufe}`]
      : stufenWort(stufe, vorgang);
    return worte;
  }, {}));
  return acc;
}, {}));

// ── ZUGRIFF AUF DIE KENNUNGEN EINER STUFE ───────────────────────────────────
// Wirft bei unbekannter Stufe. Das ist ein Programmierfehler des Aufrufers und
// darf nicht als leere Liste durchgehen — eine leere Zielmenge hat in diesem
// Vorhaben schon einmal einen Erfolg vorgetäuscht (Befund 02.09.).
function kennungenDerStufe(stufe) {
  const s = String(stufe || "").trim().toLowerCase();
  if (!STUFEN.includes(s)) {
    throw new Error(`Unbekannte Stufe: ${String(stufe).slice(0, 20)} — erlaubt sind ${STUFEN.join(", ")}`);
  }
  return Object.freeze([...(GRUPPEN_KENNUNGEN[s] || [])]);
}

// Alle Kennungen, die BIS EINSCHLIESSLICH dieser Stufe aktiv sind. Der
// Fachzyklus und die Auswertung einer Stufe beziehen sich auf diesen Bestand,
// nicht nur auf die zuletzt hinzugekommene Gruppe.
function kennungenBisStufe(stufe) {
  const s = String(stufe || "").trim().toLowerCase();
  const index = STUFEN.indexOf(s);
  if (index < 0) {
    throw new Error(`Unbekannte Stufe: ${String(stufe).slice(0, 20)} — erlaubt sind ${STUFEN.join(", ")}`);
  }
  const alle = [];
  for (const st of STUFEN.slice(0, index + 1)) alle.push(...(GRUPPEN_KENNUNGEN[st] || []));
  return Object.freeze(alle);
}

// ── DIE FREIGABEPRÜFUNG (fail closed) ───────────────────────────────────────
// Identisches Muster wie `testkohorte-betrieb.freigabe`: zwei unabhängige
// Riegel, das Flag UND das exakte Wort. Ein fehlender Wert ist NIE eine
// Freigabe. Ein rein lesender Vorgang braucht keine und meldet das ausdrücklich,
// statt eine zu erfinden.
function stufenFreigabe(stufe, vorgang, env = process.env) {
  const s = String(stufe || "").trim().toLowerCase();
  const v = String(vorgang || "").trim().toLowerCase();
  if (!STUFEN.includes(s)) {
    throw new Error(`Unbekannte Stufe: ${String(stufe).slice(0, 20)}`);
  }
  if (!VORGANG_IDS.includes(v)) {
    throw new Error(`Unbekannter Vorgang: ${String(vorgang).slice(0, 30)}`);
  }
  if (!SCHREIBENDE_VORGAENGE.includes(v)) {
    return Object.freeze({
      stufe: s, vorgang: v, schreibend: false, erteilt: true,
      flagAn: null, wortStimmt: null, erwartetesWort: null,
      meldung: `Vorgang "${v}" auf Stufe ${s.toUpperCase()} ist rein lesend und braucht keine Freigabe.`
    });
  }
  const wort = STUFEN_FREIGABEWORTE[s][v];
  const flag = String((env && env[EXECUTE_FLAG]) || "").trim().toLowerCase();
  const flagAn = ["1", "true", "on", "yes"].includes(flag);
  const bestaetigung = String((env && env[CONFIRM_VARIABLE]) || "");
  const wortStimmt = bestaetigung === wort;
  const erteilt = flagAn && wortStimmt;
  return Object.freeze({
    stufe: s, vorgang: v, schreibend: true,
    erteilt, flagAn, wortStimmt, erwartetesWort: wort,
    meldung: erteilt
      ? `Freigabe für "${v}" auf Stufe ${s.toUpperCase()} liegt vor (${EXECUTE_FLAG} an, ${CONFIRM_VARIABLE}=${wort}).`
      : `KEINE Freigabe für "${v}" auf Stufe ${s.toUpperCase()}: `
        + `${flagAn ? `${EXECUTE_FLAG} ist an` : `${EXECUTE_FLAG} ist AUS`}, `
        + `${wortStimmt ? "Wort stimmt" : `${CONFIRM_VARIABLE} trägt nicht ${wort}`}. `
        + "Es läuft ein Trockenlauf."
  });
}

// ── DIE FREIGABE, DIE ZUM STARTEN GEBRAUCHT WIRD ───────────────────────────
//
// BEFUND DES ZWEITEN ADVERSARIALEN REVIEWS (02.09.): Die Startbereitschaft
// verlangte `stufenvertrag(...).offeneFreigaben.length === 0`, also ALLE FÜNF
// schreibenden Vorgänge einer Stufe GLEICHZEITIG. `HELMUT_TESTKOHORTE_CONFIRM`
// ist aber EINE Variable mit EINEM Wort — die Hürde konnte damit strukturell
// NIE grün werden, und die Meldung hätte dem Betreiber vier Worte genannt, die
// er in ein einziges Feld schreiben soll. Fail closed war sie, richtig nicht.
//
// Die fünf Vorgänge laufen zu VERSCHIEDENEN Zeitpunkten: erst anlegen, dann
// aktivieren, dann der Fachzyklus, später deaktivieren, zuletzt entfernen.
// Niemand hält sie je gleichzeitig. Zum STARTEN gebraucht wird genau eine:
// die Freigabe des Fachzyklus dieser Stufe. Dass die Aktivierung vorher
// abgeschlossen war, ist eine eigene Startbedingung (`startbedingungen`), kein
// gleichzeitig zu haltendes Freigabewort.
const START_VORGANG = "fachzyklus";

function startfreigabe(stufe, env = process.env) {
  const f = stufenFreigabe(stufe, START_VORGANG, env);
  return Object.freeze({
    stufe: f.stufe,
    vorgang: START_VORGANG,
    erteilt: f.erteilt,
    erwartetesWort: f.erwartetesWort,
    // Die uebrigen schreibenden Vorgaenge werden hier ausdruecklich NICHT
    // verlangt. Sie stehen als Hinweis dabei, damit der Betreiber die Kette
    // sieht, ohne sie gleichzeitig halten zu muessen.
    spaetereFreigaben: Object.freeze(SCHREIBENDE_VORGAENGE
      .filter((v) => v !== START_VORGANG)
      .map((v) => `${v}: ${STUFEN_FREIGABEWORTE[f.stufe][v]}`)),
    meldung: f.erteilt
      ? `Startfreigabe für den Fachzyklus der Stufe ${f.stufe.toUpperCase()} liegt vor.`
      : `KEINE Startfreigabe für den Fachzyklus der Stufe ${f.stufe.toUpperCase()}: `
        + `${CONFIRM_VARIABLE} muss ${f.erwartetesWort} tragen und ${EXECUTE_FLAG} an sein. `
        + "Die übrigen Freigaben werden zu ihrem jeweiligen Zeitpunkt gesetzt, NICHT gleichzeitig."
  });
}

// ── DIE REIHENFOLGE (fail closed) ───────────────────────────────────────────
// Stufe C darf nicht vor B, B nicht vor A. Der Sinn der Stufung ist, dass ein
// Schaden bei 20 Profilen sichtbar wird und nicht erst bei 400. `bestanden` ist
// die Liste der Stufen, deren Auswertung als BESTANDEN vorliegt — sie kommt aus
// einer Messung (`funktionstest-kontrolle`), nicht aus einer Zusage.
function pruefeStufenReihenfolge(stufe, bestandeneStufen = []) {
  const s = String(stufe || "").trim().toLowerCase();
  const index = STUFEN.indexOf(s);
  if (index < 0) throw new Error(`Unbekannte Stufe: ${String(stufe).slice(0, 20)}`);
  const bestanden = new Set(
    (Array.isArray(bestandeneStufen) ? bestandeneStufen : [])
      .map((x) => String(x || "").trim().toLowerCase())
      .filter((x) => STUFEN.includes(x))
  );
  const noetig = STUFEN.slice(0, index);
  const fehlend = noetig.filter((v) => !bestanden.has(v));
  return Object.freeze({
    stufe: s,
    zulaessig: fehlend.length === 0,
    vorstufenNoetig: Object.freeze([...noetig]),
    vorstufenFehlend: Object.freeze([...fehlend]),
    meldung: fehlend.length === 0
      ? (noetig.length === 0
        ? `Stufe ${s.toUpperCase()} ist die erste Stufe — keine Vorstufe nötig.`
        : `Stufe ${s.toUpperCase()} zulässig: ${noetig.map((x) => x.toUpperCase()).join(", ")} bestanden.`)
      : `Stufe ${s.toUpperCase()} NICHT zulässig — es fehlt der bestandene Nachweis für `
        + `${fehlend.map((x) => x.toUpperCase()).join(", ")}. Eine Stufe zu überspringen hebt den `
        + "Sinn der Stufung auf: der Schaden würde erst bei der größeren Gruppe sichtbar."
  });
}

// ── DER VOLLSTÄNDIGE VERTRAG EINER STUFE (für Bericht und Ablaufplan) ───────
function stufenvertrag(stufe, env = process.env) {
  const s = String(stufe || "").trim().toLowerCase();
  if (!STUFEN.includes(s)) throw new Error(`Unbekannte Stufe: ${String(stufe).slice(0, 20)}`);
  const vorgaenge = VORGAENGE.map((v) => {
    const f = stufenFreigabe(s, v.id, env);
    return Object.freeze({
      vorgang: v.id,
      schreibend: v.schreibend,
      beschreibung: v.beschreibung,
      erwartetesWort: f.erwartetesWort,
      erteilt: f.erteilt
    });
  });
  return Object.freeze({
    stufe: s,
    umfang: STUFEN_UMFANG[s],
    aktivNachStufe: STUFEN_AKTIV_KUMULIERT[s],
    gesamtAktivMitRealen: STUFEN_AKTIV_KUMULIERT[s] + 5,
    kennungen: kennungenDerStufe(s),
    kennungenKumuliert: kennungenBisStufe(s),
    vorgaenge: Object.freeze(vorgaenge),
    offeneFreigaben: Object.freeze(vorgaenge.filter((v) => v.schreibend && !v.erteilt).map((v) => v.erwartetesWort))
  });
}

// Alle drei Stufen auf einmal — die Übersicht, die der Betreiber braucht, um zu
// sehen, wie viele Einzelfreigaben tatsächlich offen sind.
function alleStufenvertraege(env = process.env) {
  const vertraege = STUFEN.map((s) => stufenvertrag(s, env));
  const offen = vertraege.reduce((n, v) => n + v.offeneFreigaben.length, 0);
  const schreibendeGesamt = STUFEN.length * SCHREIBENDE_VORGAENGE.length;
  return Object.freeze({
    stufen: Object.freeze(vertraege),
    schreibendeVorgaengeGesamt: schreibendeGesamt,
    offeneFreigabenGesamt: offen,
    alleErteilt: offen === 0,
    meldung: offen === 0
      ? `Alle ${schreibendeGesamt} stufengenauen Freigaben liegen vor.`
      : `${offen} von ${schreibendeGesamt} stufengenauen Freigaben fehlen — jeder betroffene `
        + "Vorgang fällt auf den Trockenlauf zurück."
  });
}

// ── WELCHER STUFE GEHÖRT EINE KENNUNG? ──────────────────────────────────────
// `null` heißt: gehört zu KEINER Stufe. Für eine reale Mandatskennung ist das
// die richtige Antwort — und sie ist der Grund, warum diese Funktion nie raten
// darf. Sie ist die Grundlage der Erlaubnisliste des Entfernungsausführers.
function stufeVonKennung(kennung) {
  const id = String(kennung || "").trim().toLowerCase();
  if (!id || !istKohortenKennung(id)) return null;
  for (const s of STUFEN) {
    if ((GRUPPEN_KENNUNGEN[s] || []).includes(id)) return s;
  }
  return null;
}

// Prüft eine Zielmenge gegen GENAU EINE Stufe. Eine Kennung, die zur Kohorte,
// aber zu einer ANDEREN Stufe gehört, ist hier genauso ein Abbruch wie eine
// fremde Kennung — sonst könnte eine Freigabe für Stufe A die 400 Profile der
// Stufe C treffen. Das ist der Fehler, den dieser Vertrag verhindern soll.
function pruefeStufenZielmenge(stufe, kennungen, zweck = "Stufenvorgang") {
  const s = String(stufe || "").trim().toLowerCase();
  if (!STUFEN.includes(s)) throw new Error(`Unbekannte Stufe: ${String(stufe).slice(0, 20)}`);
  if (!Array.isArray(kennungen)) {
    const fehler = new Error(`${zweck}: Zielmenge ist keine Liste von Kennungen`);
    fehler.grund = "zielmenge";
    throw fehler;
  }
  const erlaubt = new Set(GRUPPEN_KENNUNGEN[s] || []);
  const fremde = [];
  const falscheStufe = [];
  for (const k of kennungen) {
    const id = String(k || "").trim().toLowerCase();
    if (erlaubt.has(id)) continue;
    if (istKohortenKennung(id)) falscheStufe.push(id); else fremde.push(id);
  }
  if (fremde.length) {
    const fehler = new Error(
      `${zweck}: ${fremde.length} Kennung(en) gehören NICHT zur Testkohorte `
      + `(erste: ${String(fremde[0]).slice(0, 40)}) — Abbruch vor jedem Schreibvorgang.`
    );
    fehler.grund = "fremde-kennung";
    throw fehler;
  }
  if (falscheStufe.length) {
    const fehler = new Error(
      `${zweck}: ${falscheStufe.length} Kennung(en) gehören zur Kohorte, aber NICHT zu Stufe `
      + `${s.toUpperCase()} (erste: ${String(falscheStufe[0]).slice(0, 40)}) — Abbruch. `
      + "Eine Stufenfreigabe darf nie eine andere Stufe treffen."
    );
    fehler.grund = "falsche-stufe";
    throw fehler;
  }
  // DUPLIKATSPERRE (ergaenzt 02.09., zweiter adversarialer Review). Der
  // Bestandspfad `testkohorte-betrieb.pruefeZielmenge` bricht bei Duplikaten ab;
  // dieser Stufenpfad tat es nicht — und er ist bei gesetzter Stufe der EINZIGE,
  // den Vorwaertsweg und Entfernung benutzen. Ein `--ids=x,x` haette
  // `provisionTenant` zweimal fuer dieselbe Kennung laufen lassen, `zielGroesse`
  // und `angelegt` um 1 zu hoch gemeldet, und bei der Entfernung waere der zweite
  // Durchgang als `nichtVorhanden` gezaehlt worden — mit `ok: true`.
  const normalisiert = kennungen.map((k) => String(k || "").trim().toLowerCase());
  const doppelte = normalisiert.length - new Set(normalisiert).size;
  if (doppelte) {
    const fehler = new Error(
      `${zweck}: ${doppelte} doppelte Kennung(en) in der Zielmenge — Abbruch. `
      + "Ein Duplikat vergroessert die Zielmenge rechnerisch, obwohl die Warteschlange "
      + "je Mandat nur EINE Zeile fuehrt."
    );
    fehler.grund = "doppelte-kennung";
    throw fehler;
  }
  return Object.freeze(normalisiert);
}

module.exports = {
  STUFEN,
  STUFEN_UMFANG,
  STUFEN_AKTIV_KUMULIERT,
  VORGAENGE,
  VORGANG_IDS,
  SCHREIBENDE_VORGAENGE,
  STUFEN_FREIGABEWORTE,
  KOHORTE_KENNUNGEN,
  kennungenDerStufe,
  kennungenBisStufe,
  startfreigabe,
  START_VORGANG,
  stufenFreigabe,
  pruefeStufenReihenfolge,
  stufenvertrag,
  alleStufenvertraege,
  stufeVonKennung,
  pruefeStufenZielmenge
};
