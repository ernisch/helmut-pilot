"use strict";

// Helmut — DER AUSFÜHRER DER VOLLSTÄNDIGEN ENTFERNUNG (Stufen A/B/C).
// =============================================================================
// WAS BISHER FEHLTE (Prüfung 02.09. nach dem Merge von #295, am Kopf 9079ac3
// nachgeprüft). Der Rückweg aus #295 (`testkohorte-rueckbau.js`) sagt es selbst:
//
//     „KEIN LÖSCHPFAD IM RÜCKWEG. `fuehreRueckbauAus` deaktiviert — es kennt
//      kein `delete`, kein `teardown`, keine Löschmarke."
//
// Das ist als Rückweg richtig: er muss in jedem Moment sofort laufen dürfen, und
// Löschen ist keine Notbremse. Es lässt aber eine Lücke offen, nach der der
// Auftrag ausdrücklich fragt — die VOLLSTÄNDIGE ENTFERNUNG, besonders der Gruppe
// mit 400 Profilen:
//
//   TATSACHE: Nach einem vollständigen Testlauf trägt Production dauerhaft
//             495 zusätzliche Mandatsprofile und 495 Identitätsprofile — inaktiv,
//             aber vorhanden. Die belegte Grundlinie (9 Mandatsprofile,
//             10 Identitätsprofile, rein lesend bestätigt 02.09.) wäre damit
//             dauerhaft 504 bzw. 505. Jede spätere Zählung, jede Kostenrechnung
//             und jeder Bestandsnachweis müsste diese Zeilen von Hand herausrechnen.
//   TATSACHE: `provisioning.teardownTenant` (über `storage.deleteTenantScopedData`)
//             KANN vollständig entfernen. Es ist aber an keinen kohortengeschützten
//             Ausführer angeschlossen.
//   FOLGE:    Die vollständige Entfernung der 400er-Gruppe wäre heute
//             400 Einzelaufrufe von Hand — ohne Erlaubnisliste, ohne
//             Stufenfreigabe, ohne Nachprüfung, und zwar bei der GEFÄHRLICHSTEN
//             Operation des ganzen Vorhabens. Genau diesen Mangel hat #295 für
//             das Deaktivieren behoben und für das Löschen offen gelassen.
//
// Dieses Modul schließt die Lücke. Es ist strenger verriegelt als jeder andere
// Ausführer dieses Vorhabens, weil es der einzige ist, der Zeilen ENTFERNT:
//
//   1. TROCKENLAUF IST STANDARD. Ohne scharfen Modus wird nichts geschrieben.
//   2. ERLAUBNISLISTE JE STUFE. Es wirkt ausschließlich auf die Kennungen GENAU
//      EINER Stufe (`pruefeStufenZielmenge`). Eine fremde Kennung bricht ab —
//      und ebenso eine Kohortenkennung der FALSCHEN Stufe. Eine Freigabe für
//      Stufe A kann die 400 Profile der Stufe C strukturell nicht treffen.
//   3. EIGENE STUFENFREIGABE. `HELMUT_TESTKOHORTE_EXECUTE` UND
//      `HELMUT_TESTKOHORTE_CONFIRM=TESTKOHORTE_STUFE_<X>_ENTFERNUNG_BESTAETIGT`.
//      Kein anderes Wort schaltet diesen Schritt scharf; insbesondere schaltet
//      ihn KEIN Deaktivierungs- oder Aktivierungswort.
//   4. VORSTUFE: ENTFERNT WIRD NUR, WAS INAKTIV IST. Ein aktives Profil wird
//      NICHT entfernt, sondern übersprungen und gemeldet. Löschen unter Last ist
//      der Weg, auf dem ein laufender Auftrag ins Leere greift. Wer entfernen
//      will, deaktiviert zuerst (`testkohorte-rueckbau.js`).
//   5. NACHPRÜFUNG JE ZEILE. Nach jedem Schreibvorgang wird gelesen. Gemeldet
//      wird nur, was die Ablage trägt (CLAUDE.md §4.10). Ein „vollständig
//      entfernt" ohne bestätigende Lesung gibt es nicht.
//   6. LEERE ZIELMENGE IST KEIN ERFOLG. Der frühere Defekt des Rückwegs
//      (`ok:true` bei leerer Zielmenge) wird hier von Anfang an vermieden.
//
// FEHLERTOLERANZ: ein Fehlschlag an EINER Kennung beendet den Lauf nicht — sonst
// bliebe der Rest der Stufe als Datenmüll stehen. Er wird gezählt, benannt und
// ausgewiesen; das Gesamturteil ist dann `ok: false`.
//
// ─── WARUM HIER KEIN STARTFENSTER GEPRÜFT WIRD ──────────────────────────────
// Der Vorwärtsweg verlangt ein geprüftes Startfenster, weil er Profile ANLEGT
// und AKTIVIERT — Arbeit, die mit einem Bestandscron kollidieren kann. Dieser
// Ausführer kann das nicht: Riegel 4 lässt ausschließlich INAKTIVE Zeilen zu.
// Ein inaktives Profil nimmt an keinem Cron-, Briefing- und Warteschlangenlauf
// teil; es gibt also keine laufende Arbeit, in die eine Entfernung
// hineingreifen könnte.
//
// Umgekehrt wäre ein Fenster hier schädlich: es würde das Aufräumen von
// Datenmüll an eine Uhrzeit binden. Der Rückweg (`testkohorte-rueckbau.js`)
// argumentiert an derselben Stelle genauso und ist bewusst fenster- und
// vorstufenfrei. Wer die Reihenfolge braucht, bekommt sie über die
// Stufenfreigabe, nicht über die Uhr.
//
// ─── WAS DIESES MODUL AUSDRÜCKLICH NICHT TUT ────────────────────────────────
//  * Es rührt KEIN reales Mandat an — strukturell nicht, nicht nur per Absicht.
//  * Es entfernt KEINE Inhalte, die anderen Mandaten gehören:
//    `deleteTenantScopedData` ist strikt auf die Kennung gescoped (bewusst NICHT
//    `deleteProfileData`, dessen breiter Match fremde Rohdaten mitlöschen würde).
//  * Es setzt KEINE Umgebungsvariable, ändert KEINEN Cron, wendet KEINE Migration an.
//  * In der heutigen Production ist es wirkungslos: 0 synthetische Zeilen.

const {
  EXECUTE_FLAG,
  CONFIRM_VARIABLE,
  MODUS_TROCKENLAUF,
  MODUS_SCHARF,
  istKohortenKennung
} = require("./testkohorte-betrieb");

const {
  STUFEN,
  STUFEN_UMFANG,
  kennungenDerStufe,
  stufenFreigabe,
  pruefeStufenZielmenge,
  stufeVonKennung
} = require("./testkohorte-stufen");

// SR §37.5 (3): reine Logik, keine Netz-/DB-/storage.js-Abhaengigkeit.
const VORFLUG = require("./speicherpfad-vorflug");

const VORGANG = "entfernung";

// Die Zielmenge EINES Laufs: entweder die ganze Stufe oder eine ausdrücklich
// übergebene Teilmenge davon (etwa die Kennungen, die eine vorherige Erhebung
// als „noch vorhanden" gemeldet hat). Jede Teilmenge läuft durch die
// Erlaubnisliste GENAU DIESER Stufe.
function zielmenge(stufe, kennungen = null) {
  if (kennungen == null) {
    return pruefeStufenZielmenge(stufe, [...kennungenDerStufe(stufe)], `Entfernung (ganze Stufe ${String(stufe).toUpperCase()})`);
  }
  if (!Array.isArray(kennungen)) {
    const fehler = new Error("Entfernung: Zielmenge ist keine Liste von Kennungen");
    fehler.grund = "zielmenge";
    throw fehler;
  }
  return pruefeStufenZielmenge(stufe, kennungen, `Entfernung (Teilmenge Stufe ${String(stufe).toUpperCase()})`);
}

// Führt die vollständige Entfernung aus — oder eben nicht.
//
// deps.entferne(id)     → Schreibvorgang je Kennung (Default: provisioning.teardownTenant)
// deps.leseZustand(id)  → { vorhanden, aktiv } (Default: storage.getProfile)
// Beide sind injizierbar, damit dieser Ablauf OFFLINE vollständig prüfbar ist,
// ohne je eine echte Datenbank zu berühren.
async function fuehreEntfernungAus({
  stufe = null,
  kennungen = null,
  modus = MODUS_TROCKENLAUF,
  env = process.env,
  deps = {}
} = {}) {
  const s = String(stufe || "").trim().toLowerCase();
  if (!STUFEN.includes(s)) {
    const fehler = new Error(
      `Entfernung: Stufe fehlt oder ist unbekannt (${String(stufe).slice(0, 20)}) — `
      + `erlaubt sind ${STUFEN.join(", ")}. Ohne Stufe gibt es keine Erlaubnisliste, also keinen Lauf.`
    );
    fehler.grund = "stufe";
    throw fehler;
  }

  const ziel = zielmenge(s, kennungen);
  const erlaubnis = stufenFreigabe(s, VORGANG, env);
  const gewuenscht = String(modus || MODUS_TROCKENLAUF).trim().toLowerCase();
  if (gewuenscht !== MODUS_TROCKENLAUF && gewuenscht !== MODUS_SCHARF) {
    const fehler = new Error(`Entfernung: Modus muss ${MODUS_TROCKENLAUF} oder ${MODUS_SCHARF} sein`);
    fehler.grund = "modus";
    throw fehler;
  }
  const wirksam = gewuenscht === MODUS_SCHARF && erlaubnis.erteilt ? MODUS_SCHARF : MODUS_TROCKENLAUF;

  const ergebnisse = [];
  let entfernt = 0;
  let nichtVorhanden = 0;
  let uebersprungenAktiv = 0;
  let fehlgeschlagen = 0;

  // ── VORFLUG-RIEGEL (SR §37.5 (3), Vorfall 04.09.) ─────────────────────────
  // Hier — und nur hier — steht fest, dass der Lauf WIRKLICH schreibt. Jeder
  // Schreibvorgang geht ueber `storage.saveProfile`/`teardownTenant` auf die
  // GETEILTE Blob-Zeile `main`, und `compactStore` verdichtet sie dabei mit den
  // Werten DER AUSFUEHRENDEN UMGEBUNG. Genau so ist am 04.09. der Ring
  // `crawlRuns` von 36 auf 20 gefallen. Fehlt ein Wert, bricht der Lauf ab,
  // BEVOR die erste Zeile geschrieben ist.
  //
  // AUSNAHME mit Absicht: Wer den Schreibvorgang selbst mitbringt (`deps.entferne`,
  // also jeder Test mit Attrappe), zielt nicht auf die echte Ablage und braucht
  // diese Umgebung nicht. Der echte Betreiberweg kann keine `deps` uebergeben.
  if (wirksam === MODUS_SCHARF && !deps.entferne) {
    VORFLUG.erzwingeSpeicherpfadOderWirf({ env, zweck: `Kohorten-Entfernung Stufe ${s.toUpperCase()} (${ziel.length} Kennungen)` });
  }

  if (wirksam === MODUS_SCHARF) {
    const entferne = deps.entferne
      || ((id) => require("./provisioning").teardownTenant(id));
    const leseZustand = deps.leseZustand
      || (async (id) => {
        const profil = await require("./storage").getProfile(id);
        return { vorhanden: Boolean(profil), aktiv: Boolean(profil && profil.profileActive !== false) };
      });

    for (const id of ziel) {
      // Doppelte Sicherung an der engsten Stelle: unmittelbar VOR dem
      // Schreibvorgang wird die einzelne Kennung noch einmal gegen die Stufe
      // gehalten. Eine Liste, die zwischen Prüfung und Schleife verändert würde,
      // käme hier nicht durch.
      if (stufeVonKennung(id) !== s) {
        const fehler = new Error(
          `Entfernung: ${String(id).slice(0, 40)} gehört nicht zu Stufe ${s.toUpperCase()} — Abbruch.`
        );
        fehler.grund = "fremde-kennung";
        throw fehler;
      }

      // VORSTUFE: nur Inaktives wird entfernt. Ein aktives Profil kann mitten in
      // einem Auftrag stehen; es zu löschen erzeugt genau die verwaisten Aufträge,
      // die A13 als Dublette melden würde.
      let vorZustand = null;
      let vorLesefehler = null;
      try {
        vorZustand = await leseZustand(id);
      } catch (error) {
        vorLesefehler = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }
      if (vorLesefehler || !vorZustand) {
        // FAIL CLOSED: Ist der Zustand nicht lesbar, wird NICHT entfernt.
        fehlgeschlagen += 1;
        ergebnisse.push(Object.freeze({
          id, zustand: "vorzustand-nicht-lesbar", schreibfehler: null,
          lesefehler: vorLesefehler || "kein Zustand gelesen"
        }));
        continue;
      }
      if (vorZustand.vorhanden === false) {
        nichtVorhanden += 1;
        ergebnisse.push(Object.freeze({ id, zustand: "nicht-vorhanden", schreibfehler: null, lesefehler: null }));
        continue;
      }
      if (vorZustand.aktiv === true) {
        uebersprungenAktiv += 1;
        ergebnisse.push(Object.freeze({
          id, zustand: "uebersprungen-noch-aktiv", schreibfehler: null, lesefehler: null
        }));
        continue;
      }

      let schreibfehler = null;
      try {
        const r = await entferne(id);
        if (r && r.ok === false) schreibfehler = String(r.reason || "entfernung-abgelehnt").slice(0, 120);
      } catch (error) {
        schreibfehler = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }

      // NACHPRÜFUNG: gemeldet wird nur, was die Ablage trägt.
      let nachZustand = null;
      let lesefehler = null;
      try {
        nachZustand = await leseZustand(id);
      } catch (error) {
        lesefehler = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }
      // BEHOBEN 02.09. (adversariale Gegenpruefung des eigenen Diffs): hier
      // genuegte `vorhanden === false`, und ein gemeldeter SCHREIBFEHLER wurde
      // dabei verschluckt. `teardownTenant` liefert `ok: false` genau dann, wenn
      // `deleteTenantScopedData` einen TEILfehler hatte — typischerweise die
      // Auth-Loeschung. Das Profil ist dann weg, Restzeilen bleiben aber stehen.
      // Genau dieser Fall wurde als "entfernt" gezaehlt: der Lauf meldete
      // `ok: true` und `0 fehlgeschlagen` ueber einer unvollstaendigen Entfernung.
      // Ein Schreibfehler ist jetzt IMMER ein Fehlschlag — auch wenn die Zeile,
      // auf die wir schauen koennen, verschwunden ist.
      const wirklichWeg = Boolean(nachZustand && nachZustand.vorhanden === false) && !schreibfehler;
      if (wirklichWeg) {
        entfernt += 1;
        ergebnisse.push(Object.freeze({ id, zustand: "entfernt", schreibfehler, lesefehler }));
      } else {
        fehlgeschlagen += 1;
        ergebnisse.push(Object.freeze({
          id,
          zustand: schreibfehler && nachZustand && nachZustand.vorhanden === false
            ? "teilweise-entfernt-schreibfehler"
            : "weiterhin-vorhanden-oder-unbestaetigt",
          schreibfehler,
          lesefehler: lesefehler || (nachZustand ? null : "kein Zustand gelesen")
        }));
      }
    }
  }

  // Eine LEERE Zielmenge ist NIE ein Erfolg (Befund 02.09. am Rückweg).
  // Ebenso wenig ein Lauf, der wegen aktiver Profile nichts tun konnte:
  // „übersprungen" heißt, die Zeilen stehen noch da.
  const ok = wirksam === MODUS_SCHARF
    && fehlgeschlagen === 0
    && uebersprungenAktiv === 0
    && ziel.length > 0;

  return Object.freeze({
    werkzeug: "entfernungs-ausfuehrer",
    stufe: s,
    stufenUmfang: STUFEN_UMFANG[s],
    modus: wirksam,
    modusGewuenscht: gewuenscht,
    freigabe: erlaubnis,
    zielGroesse: ziel.length,
    ziel: Object.freeze([...ziel]),
    entfernt,
    nichtVorhanden,
    uebersprungenAktiv,
    fehlgeschlagen,
    // ENTFERNT STATT BEHAUPTET (SR §36.9 (1), Vorfall 04.09.):
    // Hier standen `realeMandateBeruehrt: 0` und `loeschtNichts: true` als
    // hartkodierte Literale — nichts hat sie gemessen. Schlimmer: im Blobpfad war
    // `realeMandateBeruehrt: 0` sachlich FALSCH. `storage.saveProfile` schreibt
    // ohne HELMUT_PROFILE_DB_EXCLUSIVE die GETEILTE Zeile `helmut_store.main`
    // vollstaendig neu — also genau die Zeile, die auch die realen Profile traegt.
    //
    // Ein ERSATZFELD waere hier kein Fortschritt: jede Kennzahl ueber die
    // Zielmenge ist strukturell invariant, weil `pruefeZielmenge` /
    // `pruefeStufenZielmenge` VORHER wirft, sobald eine fremde Kennung auftaucht.
    // Ein Wert, der sich nie bewegen kann, ist wieder nur eine Behauptung in
    // Zahlenform. Die Zusicherung wird deshalb dort gefuehrt, wo sie wirklich
    // durchgesetzt wird — im Wurf — und genau so getestet.
    // Wohin der Lauf schreibt, weist der Vorflug-Riegel aus
    // (lib/helmut/speicherpfad-vorflug.js), nicht mehr eine Konstante hier.
    ergebnisse: Object.freeze(ergebnisse),
    ok,
    meldung: wirksam === MODUS_TROCKENLAUF
      ? `TROCKENLAUF: ${ziel.length} Kennungen der Stufe ${s.toUpperCase()} wären vollständig zu `
        + `entfernen. ${erlaubnis.meldung} Es wurde nichts geschrieben.`
      : (ok
        ? `Entfernung Stufe ${s.toUpperCase()} ausgeführt: ${entfernt} entfernt, `
          + `${nichtVorhanden} waren nicht vorhanden, 0 fehlgeschlagen — jede Zeile nach dem `
          + "Schreiben gegengelesen."
        : `Entfernung Stufe ${s.toUpperCase()} UNVOLLSTÄNDIG: ${fehlgeschlagen} fehlgeschlagen, `
          + `${uebersprungenAktiv} übersprungen (noch aktiv), ${entfernt} entfernt von `
          + `${ziel.length}. Die betroffenen Kennungen stehen einzeln im Ergebnis. `
          + "Ein übersprungenes Profil wird erst nach dem Deaktivieren entfernbar.")
  });
}

// ── DER RESTBESTANDSBEFUND ──────────────────────────────────────────────────
// Die Frage, die nach der Entfernung wirklich zählt: ist WIRKLICH nichts mehr da?
// Diese Funktion urteilt NICHT aus dem Ergebnis des Ausführers (das wäre die
// Behauptung des Schreibers über sich selbst), sondern aus einer NACHTRÄGLICHEN,
// unabhängigen Erhebung. `erhebung` ist rein lesend beizubringen — je Familie
// die gezählte Zeilenzahl. Ein FEHLENDER Zähler ist kein „0", sondern ein
// Abbruchgrund (CLAUDE.md §4.4): genau dieser Fehler — eine leere Tabelle als
// Beweis zu nehmen — ist in diesem Projekt bereits zweimal aufgetreten.
const RESTBESTAND_FAMILIEN = Object.freeze([
  "mandatsprofile",
  "identitaetsprofile",
  "storeZeilen",
  "warteschlangenAuftraege",
  "schedulerSpuren"
]);

function restbestandsBefund({ erhebung = null, stufe = null } = {}) {
  const s = stufe === null || stufe === undefined ? null : String(stufe).trim().toLowerCase();
  if (s !== null && !STUFEN.includes(s)) {
    return Object.freeze({
      auswertbar: false,
      grund: `Unbekannte Stufe: ${String(stufe).slice(0, 20)}`
    });
  }
  if (!erhebung || typeof erhebung !== "object") {
    return Object.freeze({
      auswertbar: false,
      grund: "Keine Erhebung übergeben — ohne gezählte Zeilen gibt es keinen Restbestandsbefund. "
        + "Eine nicht durchgeführte Zählung ist keine gemessene Null."
    });
  }
  const fehlend = [];
  const werte = {};
  for (const familie of RESTBESTAND_FAMILIEN) {
    const roh = erhebung[familie];
    if (typeof roh !== "number" || !Number.isFinite(roh) || roh < 0) {
      fehlend.push(familie);
      continue;
    }
    werte[familie] = Math.floor(roh);
  }
  if (fehlend.length) {
    return Object.freeze({
      auswertbar: false,
      stufe: s,
      fehlendeZaehler: Object.freeze(fehlend),
      grund: `Für ${fehlend.length} Familie(n) liegt keine brauchbare Zahl vor `
        + `(${fehlend.join(", ")}). FAIL CLOSED: ohne jede einzelne Zahl wird kein `
        + "Urteil „vollständig entfernt“ gemeldet."
    });
  }
  const rest = RESTBESTAND_FAMILIEN.filter((f) => werte[f] > 0);
  const summe = RESTBESTAND_FAMILIEN.reduce((n, f) => n + werte[f], 0);
  return Object.freeze({
    auswertbar: true,
    stufe: s,
    werte: Object.freeze({ ...werte }),
    restSumme: summe,
    familienMitRest: Object.freeze(rest),
    vollstaendigEntfernt: summe === 0,
    meldung: summe === 0
      ? `Restbestand GEMESSEN 0 über alle ${RESTBESTAND_FAMILIEN.length} Familien`
        + `${s ? ` (Stufe ${s.toUpperCase()})` : ""} — vollständig entfernt.`
      : `Restbestand ${summe} Zeile(n) in ${rest.length} Familie(n): `
        + rest.map((f) => `${f}=${werte[f]}`).join(", ")
        + ". NICHT vollständig entfernt."
  });
}

module.exports = {
  VORGANG,
  RESTBESTAND_FAMILIEN,
  EXECUTE_FLAG,
  CONFIRM_VARIABLE,
  MODUS_TROCKENLAUF,
  MODUS_SCHARF,
  zielmenge,
  fuehreEntfernungAus,
  restbestandsBefund
};
