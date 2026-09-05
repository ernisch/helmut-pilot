"use strict";

// Helmut — DER VORWÄRTSAUSFÜHRER (Provisionierung + gestufte Aktivierung).
// =============================================================================
// WAS BISHER FEHLTE (Reviewbefund 02.09., am Kopf 331859a bestätigt):
// Für den RÜCKWEG existierte ein scharfer Ausführer (`testkohorte-rueckbau.js`).
// Für den VORWÄRTSWEG existierte KEINER. `scripts/testkohorte-495.js` weist jeden
// scharfen Lauf mit Exitcode 2 ab, und `funktionstest-ablaufplan.js` meldet
// `ausfuehrbar: false`. Der Test war damit beschrieben, aber nicht durchführbar:
// es gab keinen Weg, die 495 Profile anzulegen oder eine Gruppe zu aktivieren —
// außer 495 Handaufrufen von `provision-tenant.js`, jeder davon OHNE die
// Erlaubnisliste der Kohorte und damit ohne strukturellen Schutz der fünf realen
// Mandate.
//
// Dieses Modul ist dieser Weg. Es trägt DIESELBEN drei Riegel wie der Rückweg —
// und einen vierten, den der Rückweg ausdrücklich NICHT hat:
//
//   1. ERLAUBNISLISTE. Es wirkt ausschließlich auf die 495 deterministischen
//      Kennungen aus `baueKohorte()`. Eine fremde Kennung wird NICHT gefiltert,
//      sondern bricht den gesamten Vorgang ab, BEVOR irgendetwas geschrieben
//      wurde (`pruefeZielmenge` vor der Schleife, `istKohortenKennung` erneut
//      unmittelbar vor jedem einzelnen Schreibvorgang).
//   2. ZWEI UNABHÄNGIGE FREIGABEN je Schritt: `HELMUT_TESTKOHORTE_EXECUTE` UND
//      `HELMUT_TESTKOHORTE_CONFIRM` mit dem Wort GENAU DIESES Schrittes. Das Wort
//      der Provisionierung aktiviert nichts, das Wort der Gruppe A aktiviert
//      nicht die Gruppe C.
//   3. NACHPRÜFUNG JE ZEILE. Nach jedem Schreibvorgang wird der erreichte Zustand
//      GELESEN. Gemeldet wird nur, was die Ablage trägt (CLAUDE.md §4.10).
//   4. STARTFENSTER (NUR VORWÄRTS). Jeder Vorwärtsschritt verlangt einen
//      geprüften Fensterbefund, der JETZT gilt. Der Rückweg verlangt das
//      ausdrücklich NIE — er muss in jedem Moment sofort laufen dürfen, sonst
//      wäre ein misslungener Lauf im ungünstigsten Augenblick nicht abbaubar.
//
// KEIN LÖSCHPFAD. Dieses Modul legt an und schaltet ein. Es kennt kein `delete`,
// kein `teardown`, keine Löschmarke.
//
// FEHLERTOLERANZ WIE IM RÜCKWEG: ein Fehlschlag an EINER Kennung beendet den Lauf
// nicht — sonst bliebe die Gruppe halb aktiviert und niemand wüsste, welche
// Hälfte. Er wird gezählt, benannt und ausgewiesen; das Gesamturteil ist dann
// `ok: false`.
//
// LEERE ZIELMENGE IST NIE ERFOLG. „Nichts getan" darf nicht aussehen wie
// „vollständig ausgeführt" — derselbe Befund, der im Rückweg behoben wurde.

const {
  EXECUTE_FLAG,
  CONFIRM_VARIABLE,
  FREIGABEWORTE,
  MODUS_TROCKENLAUF,
  MODUS_SCHARF,
  GRUPPEN_KENNUNGEN,
  KOHORTE_KENNUNGEN,
  istKohortenKennung,
  pruefeZielmenge,
  freigabe
} = require("./testkohorte-betrieb");

// SR §37.5 (3): reine Logik, keine Netz-/DB-/storage.js-Abhaengigkeit.
const VORFLUG = require("./speicherpfad-vorflug");

const { baueKohorte, mitLaufzeitPasswort, GRUPPEN } = require("./test-kohorte-500");

const SCHRITT_PROVISIONIERUNG = "provisionierung";

// ── Fenstervertrag (nur vorwärts) ───────────────────────────────────────────
// Identisch zu `testkohorte-betrieb.planeAktivierung`: ein Befund ohne geprüfte
// Cronliste gilt als UNGEPRÜFT, und er muss JETZT gelten. Ein am Vortag korrekt
// erhobener Befund erlaubt keinen Start am nächsten Morgen um 05:47.
function minuteAusUtcLokal(zeitpunkt) {
  if (zeitpunkt === null || zeitpunkt === undefined || zeitpunkt === "") return null;
  const d = zeitpunkt instanceof Date ? zeitpunkt : new Date(String(zeitpunkt));
  if (!Number.isFinite(d.getTime())) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function fensterBefund(startfensterBefund, jetztUtc) {
  const gepruefteCrons = startfensterBefund && Number.isFinite(startfensterBefund.gepruefteCrons)
    ? startfensterBefund.gepruefteCrons
    : 0;
  if (!startfensterBefund) return { frei: false, grund: "startfenster-nicht-geprueft", gepruefteCrons };
  if (gepruefteCrons <= 0) return { frei: false, grund: "startfenster-ohne-cronliste", gepruefteCrons };
  if (startfensterBefund.startErlaubt !== true) return { frei: false, grund: "startfenster-konflikt", gepruefteCrons };
  const jetzt = minuteAusUtcLokal(jetztUtc);
  if (jetzt === null) return { frei: false, grund: "startzeit-fehlt", gepruefteCrons };
  const von = Number(startfensterBefund.startMinuteUtc);
  const bis = Number(startfensterBefund.endeMinuteUtc);
  if (!Number.isFinite(von) || !Number.isFinite(bis)) {
    return { frei: false, grund: "startfenster-ohne-grenzen", gepruefteCrons };
  }
  const drin = (jetzt >= von && jetzt < bis) || (jetzt + 1440 >= von && jetzt + 1440 < bis);
  return drin
    ? { frei: true, grund: "fenster-gilt-jetzt", gepruefteCrons, jetztMinuteUtc: jetzt }
    : { frei: false, grund: "startzeit-ausserhalb-des-fensters", gepruefteCrons, jetztMinuteUtc: jetzt };
}

function pruefeModus(modus, was) {
  const gewuenscht = String(modus || MODUS_TROCKENLAUF).trim().toLowerCase();
  if (gewuenscht !== MODUS_TROCKENLAUF && gewuenscht !== MODUS_SCHARF) {
    const fehler = new Error(`${was}: Modus muss ${MODUS_TROCKENLAUF} oder ${MODUS_SCHARF} sein`);
    fehler.grund = "modus";
    throw fehler;
  }
  return gewuenscht;
}

// Die engste Sicherung: unmittelbar VOR dem Schreibvorgang noch einmal gegen die
// Erlaubnisliste. Eine Liste, die zwischen Prüfung und Schleife verändert würde,
// käme hier nicht durch.
function sichereKennung(id, was) {
  if (!istKohortenKennung(id)) {
    const fehler = new Error(`${was}: ${String(id).slice(0, 40)} gehört nicht zur Kohorte — Abbruch`);
    fehler.grund = "fremde-kennung";
    throw fehler;
  }
}

// ── 1 · Provisionierung der 495 Profile, INAKTIV ────────────────────────────
//
// deps.legeAn(spec)     → Schreibvorgang je Spezifikation
// deps.leseZustand(id)  → { vorhanden, aktiv } NACH dem Schreibvorgang
async function fuehreProvisionierungAus({
  kennungen = null,
  // ERGÄNZT 02.09. (Nachprüfung nach dem Merge von #295): Die Provisionierung
  // konnte zwar schon eine TEILMENGE anlegen, aber sie tat es unter dem einen
  // Pauschalwort für alle 495. Wer nur die 20 Profile der Stufe A anlegen wollte,
  // musste dafür die Freigabe für alle 495 erteilen — die Stufung war damit an
  // dieser Stelle keine.
  //
  // Wird `stufe` übergeben, gilt STATTDESSEN die stufengenaue Freigabe
  // (`TESTKOHORTE_STUFE_<X>_PROVISIONIERUNG_BESTAETIGT`) und die Erlaubnisliste
  // GENAU DIESER Stufe. Ohne `stufe` ist das Verhalten unverändert — jeder
  // bestehende Aufruf verhält sich exakt wie zuvor (Regressionsvertrag in
  // `scripts/testkohorte-vorwaerts-test.js`).
  stufe = null,
  modus = MODUS_TROCKENLAUF,
  env = process.env,
  startfensterBefund = null,
  jetztUtc = null,
  deps = {}
} = {}) {
  const stufen = require("./testkohorte-stufen");
  const s = stufe === null || stufe === undefined ? null : String(stufe).trim().toLowerCase();
  if (s !== null && !stufen.STUFEN.includes(s)) {
    const fehler = new Error(
      `Provisionierung: unbekannte Stufe ${String(stufe).slice(0, 20)} — erlaubt sind ${stufen.STUFEN.join(", ")}`
    );
    fehler.grund = "stufe";
    throw fehler;
  }
  const ziel = s !== null
    ? stufen.pruefeStufenZielmenge(
      s,
      kennungen == null ? [...stufen.kennungenDerStufe(s)] : kennungen,
      `Provisionierung (Stufe ${s.toUpperCase()})`
    )
    : (kennungen == null
      ? pruefeZielmenge([...KOHORTE_KENNUNGEN], "Provisionierung (vollständige Kohorte)")
      : pruefeZielmenge(kennungen, "Provisionierung (Teilmenge)"));
  const erlaubnis = s !== null
    ? stufen.stufenFreigabe(s, "provisionierung", env)
    : freigabe(SCHRITT_PROVISIONIERUNG, env);
  const gewuenscht = pruefeModus(modus, "Provisionierung");
  const fenster = fensterBefund(startfensterBefund, jetztUtc);
  const wirksam = gewuenscht === MODUS_SCHARF && erlaubnis.erteilt && fenster.frei
    ? MODUS_SCHARF
    : MODUS_TROCKENLAUF;

  // Die Spezifikationen sind deterministisch und tragen `synthetischErlaubt`.
  const alle = baueKohorte();
  const nachId = new Map(alle.map((s) => [s.id, s]));

  const ergebnisse = [];
  let angelegt = 0;
  let bereitsVorhanden = 0;
  let fehlgeschlagen = 0;

  // ── VORFLUG-RIEGEL (SR §37.5 (3), Vorfall 04.09.) ─────────────────────────
  // Hier — und nur hier — steht fest, dass der Lauf WIRKLICH schreibt. Jeder
  // Schreibvorgang geht ueber `storage.saveProfile`/`teardownTenant` auf die
  // GETEILTE Blob-Zeile `main`, und `compactStore` verdichtet sie dabei mit den
  // Werten DER AUSFUEHRENDEN UMGEBUNG. Genau so ist am 04.09. der Ring
  // `crawlRuns` von 36 auf 20 gefallen. Fehlt ein Wert, bricht der Lauf ab,
  // BEVOR die erste Zeile geschrieben ist.
  //
  // AUSNAHME mit Absicht: Wer den Schreibvorgang selbst mitbringt (`deps.legeAn`,
  // also jeder Test mit Attrappe), zielt nicht auf die echte Ablage und braucht
  // diese Umgebung nicht. Der echte Betreiberweg kann keine `deps` uebergeben.
  if (wirksam === MODUS_SCHARF && !deps.legeAn) {
    VORFLUG.erzwingeSpeicherpfadOderWirf({ env, zweck: `Kohorten-Provisionierung Stufe ${s.toUpperCase()} (${ziel.length} Profile, INAKTIV)` });
  }

  if (wirksam === MODUS_SCHARF) {
    // `provisionTenant` VERLANGT den Aktivierungszustand ausdrücklich und wirft
    // sonst (provisioning.js: „Ein stiller Vorgabewert auf AKTIV würde die
    // getrennte Aktivierungsfreigabe umgehen"). Genau deshalb steht hier
    // `neuAktiv: false` und keine Abkürzung: die Kohorte wird INAKTIV angelegt,
    // und die Aktivierung ist ein eigener, eigens freigegebener Schritt.
    const legeAn = deps.legeAn
      || ((spec) => require("./provisioning").provisionTenant(spec, {}, { neuAktiv: false, kontoBeiFehlerBehalten: true }));
    const leseZustand = deps.leseZustand
      || (async (id) => {
        const profil = await require("./storage").getProfile(id);
        return { vorhanden: Boolean(profil), aktiv: Boolean(profil && profil.profileActive === true) };
      });
    const zufall = deps.zufall || null;

    for (const id of ziel) {
      sichereKennung(id, "Provisionierung");
      const basis = nachId.get(id);
      if (!basis) {
        fehlgeschlagen += 1;
        ergebnisse.push(Object.freeze({ id, zustand: "keine-spezifikation", schreibfehler: "spezifikation-fehlt", lesefehler: null }));
        continue;
      }
      // Das Passwort entsteht ERST hier zur Laufzeit und steht nie im Repo.
      const spec = zufall ? mitLaufzeitPasswort(basis, { zufall }) : mitLaufzeitPasswort(basis);
      let schreibfehler = null;
      let teilbestand = null;
      let wiederholung = false;
      try {
        const r = await legeAn(spec);
        if (r && r.ok === false) schreibfehler = String(r.reason || "anlage-abgelehnt").slice(0, 120);
        wiederholung = Boolean(r && r.ok === true && r.created === false && r.updated === true);
        if (r && r.teilbestandMoeglich === true) {
          teilbestand = Object.freeze({ kontoId: r.kontoId || null, rueckweg: r.rueckweg || null });
        }
      } catch (error) {
        schreibfehler = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }
      let zustand = null;
      let lesefehler = null;
      try {
        zustand = await leseZustand(id);
      } catch (error) {
        lesefehler = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }
      // ANGELEGT heißt: vorhanden UND INAKTIV. Ein versehentlich aktiv angelegtes
      // Profil ist ein FEHLSCHLAG, kein Erfolg — die Stufung wäre sonst umgangen.
      const vorhanden = Boolean(zustand && zustand.vorhanden === true);
      const inaktiv = Boolean(zustand && zustand.aktiv === false);
      // Ein lesbares Profil kann aus einem nur teilweise gelungenen Dual Write
      // stammen. Es macht einen gemeldeten Schreibfehler niemals zum Erfolg.
      if (vorhanden && inaktiv && !schreibfehler && !lesefehler) {
        if (wiederholung) bereitsVorhanden += 1; else angelegt += 1;
        ergebnisse.push(Object.freeze({ id, zustand: "angelegt-inaktiv", schreibfehler, lesefehler }));
      } else {
        fehlgeschlagen += 1;
        ergebnisse.push(Object.freeze({
          id,
          zustand: vorhanden && inaktiv ? "teilbestand-inaktiv" : (vorhanden ? "angelegt-aber-AKTIV" : "nicht-bestaetigt"),
          schreibfehler,
          teilbestand,
          lesefehler: lesefehler || (zustand ? null : "kein Zustand gelesen")
        }));
      }
    }
  }

  const ok = wirksam === MODUS_SCHARF && fehlgeschlagen === 0 && ziel.length > 0;
  return Object.freeze({
    werkzeug: "provisionierung",
    schritt: SCHRITT_PROVISIONIERUNG,
    stufe: s,
    modusGewuenscht: gewuenscht,
    modus: wirksam,
    freigabe: erlaubnis,
    startfenster: Object.freeze(fenster),
    zielGroesse: ziel.length,
    angelegt,
    bereitsVorhanden,
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
    legtInaktivAn: true,
    aktiviertNichts: true,
    ergebnisse: Object.freeze(ergebnisse),
    ok,
    meldung: wirksam === MODUS_TROCKENLAUF
      ? `Trockenlauf: ${ziel.length} Profile würden INAKTIV angelegt. `
        + `${erlaubnis.meldung} Fenster: ${fenster.grund}. Es wurde nichts geschrieben.`
      : (ok
        ? `Provisionierung ausgeführt: ${angelegt} angelegt, ${bereitsVorhanden} bereits vorhanden, `
          + "0 fehlgeschlagen — jede Zeile nach dem Schreiben als INAKTIV gegengelesen."
        : `Provisionierung UNVOLLSTÄNDIG: ${fehlgeschlagen} von ${ziel.length} Kennungen sind nicht `
          + "bestätigt inaktiv angelegt. Der Lauf wurde NICHT abgebrochen; die betroffenen "
          + "Kennungen stehen einzeln im Ergebnis.")
  });
}

// ── 2 · Aktivierung EINER Gruppe (A=20, B=75, C=400) ────────────────────────
//
// deps.aktiviere(id)    → Schreibvorgang je Kennung
// deps.leseZustand(id)  → { vorhanden, aktiv } NACH dem Schreibvorgang
async function fuehreAktivierungAus({
  gruppe,
  modus = MODUS_TROCKENLAUF,
  env = process.env,
  startfensterBefund = null,
  jetztUtc = null,
  vorstufenVollstaendig = null,
  deps = {}
} = {}) {
  const kennung = String(gruppe || "").trim().toLowerCase();
  const definition = GRUPPEN.find((g) => g.kennung === kennung);
  if (!definition) {
    const fehler = new Error(`Aktivierung: Gruppe muss eine von ${GRUPPEN.map((g) => g.kennung).join(", ")} sein`);
    fehler.grund = "gruppe";
    throw fehler;
  }
  const schritt = `aktivierung-${kennung}`;
  const ziel = pruefeZielmenge(GRUPPEN_KENNUNGEN[kennung], `Aktivierung Gruppe ${kennung.toUpperCase()}`);
  const erlaubnis = freigabe(schritt, env);
  const gewuenscht = pruefeModus(modus, "Aktivierung");
  const fenster = fensterBefund(startfensterBefund, jetztUtc);
  // STUFENVERTRAG: die vorherigen Gruppen müssen vollständig aktiv sein. Das ist
  // EINGABE (aus `planeAktivierung`), nicht Selbstauskunft — `null` heißt
  // „nicht geprüft" und ist NICHT „erfüllt" (fail closed).
  const stufenOk = vorstufenVollstaendig === true;
  const wirksam = gewuenscht === MODUS_SCHARF && erlaubnis.erteilt && fenster.frei && stufenOk
    ? MODUS_SCHARF
    : MODUS_TROCKENLAUF;

  const ergebnisse = [];
  let aktiviert = 0;
  let bereitsAktiv = 0;
  let fehlgeschlagen = 0;

  // ── VORFLUG-RIEGEL (SR §37.5 (3), Vorfall 04.09.) ─────────────────────────
  // Hier — und nur hier — steht fest, dass der Lauf WIRKLICH schreibt. Jeder
  // Schreibvorgang geht ueber `storage.saveProfile`/`teardownTenant` auf die
  // GETEILTE Blob-Zeile `main`, und `compactStore` verdichtet sie dabei mit den
  // Werten DER AUSFUEHRENDEN UMGEBUNG. Genau so ist am 04.09. der Ring
  // `crawlRuns` von 36 auf 20 gefallen. Fehlt ein Wert, bricht der Lauf ab,
  // BEVOR die erste Zeile geschrieben ist.
  //
  // AUSNAHME mit Absicht: Wer den Schreibvorgang selbst mitbringt (`deps.aktiviere`,
  // also jeder Test mit Attrappe), zielt nicht auf die echte Ablage und braucht
  // diese Umgebung nicht. Der echte Betreiberweg kann keine `deps` uebergeben.
  if (wirksam === MODUS_SCHARF && !deps.aktiviere) {
    VORFLUG.erzwingeSpeicherpfadOderWirf({ env, zweck: `Kohorten-Aktivierung Gruppe ${kennung.toUpperCase()} (${ziel.length} Profile)` });
  }

  if (wirksam === MODUS_SCHARF) {
    const aktiviere = deps.aktiviere
      || ((id) => require("./provisioning").activateTenant(id));
    const leseZustand = deps.leseZustand
      || (async (id) => {
        const profil = await require("./storage").getProfile(id);
        return { vorhanden: Boolean(profil), aktiv: Boolean(profil && profil.profileActive === true) };
      });

    for (const id of ziel) {
      sichereKennung(id, "Aktivierung");
      let schreibfehler = null;
      let warBereitsAktiv = false;
      try {
        const r = await aktiviere(id);
        if (r && r.ok === false) schreibfehler = String(r.reason || "aktivierung-abgelehnt").slice(0, 120);
        if (r && r.bereitsAktiv === true) warBereitsAktiv = true;
      } catch (error) {
        schreibfehler = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }
      let zustand = null;
      let lesefehler = null;
      try {
        zustand = await leseZustand(id);
      } catch (error) {
        lesefehler = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }
      const jetztAktiv = Boolean(zustand && zustand.aktiv === true);
      if (jetztAktiv) {
        if (warBereitsAktiv || schreibfehler) bereitsAktiv += 1; else aktiviert += 1;
        ergebnisse.push(Object.freeze({ id, zustand: "aktiv", schreibfehler, lesefehler }));
      } else {
        fehlgeschlagen += 1;
        ergebnisse.push(Object.freeze({
          id,
          zustand: "weiterhin-inaktiv-oder-unbestaetigt",
          schreibfehler,
          lesefehler: lesefehler || (zustand ? null : "kein Zustand gelesen")
        }));
      }
    }
  }

  const ok = wirksam === MODUS_SCHARF && fehlgeschlagen === 0 && ziel.length > 0;
  const blockade = [
    ...(erlaubnis.erteilt ? [] : ["freigabe-fehlt"]),
    ...(fenster.frei ? [] : [fenster.grund]),
    ...(stufenOk ? [] : ["vorstufe-nicht-bestaetigt"])
  ];
  return Object.freeze({
    werkzeug: "aktivierung",
    schritt,
    gruppe: kennung,
    stufe: definition.zweck,
    modusGewuenscht: gewuenscht,
    modus: wirksam,
    freigabe: erlaubnis,
    startfenster: Object.freeze(fenster),
    vorstufenVollstaendig: stufenOk,
    blockadeGruende: Object.freeze(blockade),
    zielGroesse: ziel.length,
    aktiviert,
    bereitsAktiv,
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
    beruehrtKeineKonten: true,
    ergebnisse: Object.freeze(ergebnisse),
    ok,
    meldung: wirksam === MODUS_TROCKENLAUF
      ? `Trockenlauf: ${ziel.length} Profile der Gruppe ${kennung.toUpperCase()} würden aktiviert. `
        + `${blockade.length ? `Offen: ${blockade.join(", ")}.` : erlaubnis.meldung} Es wurde nichts geschrieben.`
      : (ok
        ? `Gruppe ${kennung.toUpperCase()} aktiviert: ${aktiviert} neu, ${bereitsAktiv} bereits aktiv, `
          + "0 fehlgeschlagen — jede Zeile nach dem Schreiben gegengelesen."
        : `Aktivierung UNVOLLSTÄNDIG: ${fehlgeschlagen} von ${ziel.length} Kennungen sind nicht `
          + "bestätigt aktiv. Der Lauf wurde NICHT abgebrochen; die betroffenen Kennungen stehen "
          + "einzeln im Ergebnis. Der Rückweg ist jederzeit ohne Fenster ausführbar.")
  });
}

module.exports = {
  SCHRITT_PROVISIONIERUNG,
  EXECUTE_FLAG,
  CONFIRM_VARIABLE,
  FREIGABEWORT_PROVISIONIERUNG: FREIGABEWORTE[SCHRITT_PROVISIONIERUNG],
  FREIGABEWORTE,
  MODUS_TROCKENLAUF,
  MODUS_SCHARF,
  GRUPPEN,
  fensterBefund,
  fuehreProvisionierungAus,
  fuehreAktivierungAus
};
