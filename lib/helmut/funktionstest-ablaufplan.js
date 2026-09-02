"use strict";

// Helmut — DER AUSFÜHRBARE, ABER GESPERRTE ABLAUFPLAN DES 500er-FUNKTIONSTESTS.
// =============================================================================
// WAS BISHER FEHLTE. Der Sicherheitsrahmen (§10) beschreibt den Ablauf als
// TABELLE in einem Dokument. Eine Tabelle prüft nichts: sie kann nicht sagen,
// ob Schritt 6 heute beginnen darf, sie kennt den erhobenen Zustand nicht, und
// sie verweigert nichts. Genau das leistet dieses Modul — es ist der Ablaufplan
// als PRÜFBARE FUNKTION.
//
// WAS ES TUT: es beantwortet zu jedem Schritt drei Fragen.
//   1. Was ist der Schritt, mit welchem Befehl, und ist er eine
//      PRODUCTION-ÄNDERUNG?
//   2. Welche Vorbedingungen müssen BELEGT sein, bevor er beginnen darf?
//   3. Welche Freigabe braucht er — Flag, Bestätigungswort, beides?
//
// WAS ES AUSDRÜCKLICH NICHT TUT: es führt NICHTS aus. Kein Netz, keine
// Datenbank, keine Uhr, keine Secrets, kein Modellaufruf, keine Aktivierung.
// Alle Eingaben sind Parameter. Es wirft nie.
//
// ─── DER GRUNDSATZ: JEDE PRODUCTION-AKTION IST IHRE EIGENE FREIGABE ─────────
// Es gibt in diesem Plan KEINE Sammelfreigabe. Wer Schritt 6 freigibt, hat
// Schritt 8 NICHT freigegeben — jede Stufe trägt ihr eigenes Bestätigungswort
// (`testkohorte-betrieb.FREIGABEWORTE`). Der Plan kann deshalb vollständig
// gedruckt, geprüft und geübt werden, ohne dass irgendetwas näher an die
// Ausführung rückt.
//
// ─── DIE ASYMMETRIE, DIE ABSICHT IST ────────────────────────────────────────
// VORWÄRTS wird streng gesperrt: fehlt eine Vorbedingung, darf der Schritt
// nicht beginnen. RÜCKWÄRTS (Deaktivierung, Rückbauprüfung) wird NIE gesperrt.
// Ein Rückbau, der an einer Vorbedingung scheitert, wäre die gefährlichste
// Stelle des ganzen Ablaufs — dann bliebe die Kohorte aktiv stehen.

const kohorte = require("./testkohorte-betrieb");
const funktionstest = require("./funktionstest-500");
const kapazitaet = require("./kapazitaet-500");
const kommunikationsriegel = require("./kommunikationsriegel");
const mandatsklasse = require("./mandatsklasse");
const { GRUPPEN, KOHORTE_GESAMT, REALE_MANDATE } = require("./test-kohorte-500");

const ART_LESEND = "rein-lesend";
const ART_PRODUCTION = "production-aenderung";
const ART_UMGEBUNG = "umgebungsaenderung";

// Vorbedingungs-Kennungen. Sie sind EINGABE (ein erhobener Befund), nie
// Selbstauskunft dieses Moduls — dieselbe Regel wie bei Grundlinie und Bestand
// in `testkohorte-betrieb`.
const V = Object.freeze({
  GRUNDLINIE: "grundlinie-erhoben",
  SICHERUNG: "sicherung-geprueft",
  WERTE: "betreiberwerte-gesetzt",
  RIEGEL: "kommunikationsriegel-scharf",
  FENSTER: "startfenster-frei",
  PROVISIONIERT: "kohorte-vollstaendig-angelegt",
  ISOLATION: "isolation-belegt",
  GRUPPE_A: "gruppe-a-aktiv",
  GRUPPE_B: "gruppe-b-aktiv",
  GRUPPE_C: "gruppe-c-aktiv",
  KONTROLLE_A: "sicherheitskontrolle-nach-a",
  KONTROLLE_B: "sicherheitskontrolle-nach-b",
  KONTROLLE_C: "sicherheitskontrolle-nach-c",
  ZYKLUS: "fachzyklus-ausgefuehrt"
});

const CLI = "node scripts/lokal.js -- node scripts/testkohorte-495.js";
const CLI_KONTROLLE = "node scripts/lokal.js -- node scripts/funktionstest-500-kontrolle.js";

function schritte() {
  const gruppeA = GRUPPEN[0];
  const gruppeB = GRUPPEN[1];
  const gruppeC = GRUPPEN[2];
  return Object.freeze([
    Object.freeze({
      nr: 1, id: "grundlinie", titel: "Grundlinie rein lesend erheben",
      art: ART_LESEND,
      befehl: `${CLI} sql`,
      vorbedingungen: Object.freeze([]),
      liefert: V.GRUNDLINIE,
      freigabe: null,
      abbruchkontrolle: null,
      zweck: `Der eingefrorene Vertrag, gegen den alles Weitere gemessen wird: `
        + `${REALE_MANDATE} aktive und 4 inaktive reale Mandate, 0 synthetische Zeilen.`
    }),
    Object.freeze({
      nr: 2, id: "sicherung", titel: "Gezielte Sicherung der zwei betroffenen Tabellen + Prüfung",
      art: ART_LESEND,
      befehl: "node scripts/lokal.js -- node scripts/backup-export.js --scope=profil",
      vorbedingungen: Object.freeze([V.GRUNDLINIE]),
      liefert: V.SICHERUNG,
      freigabe: null,
      abbruchkontrolle: null,
      zweck: "Supabase Free-Tarif: keine nativen Backups, kein PITR (OP-01). Dies ist "
        + "die einzige Wiederherstellungsgrundlage. Ein Teil-Export (vollstaendig:false) "
        + "gilt NICHT als Sicherung. Der Export ist personenbezogen — nie committen."
    }),
    Object.freeze({
      nr: 3, id: "betreiberwerte", titel: "Deckel, Reserven, Grenzen und den Kommunikationsriegel setzen",
      art: ART_UMGEBUNG,
      befehl: "Vercel-Env (Betreiberaktion) — die exakten Werte nennt "
        + "`kapazitaet-500.vorbereiteteBetreiberwerte()`",
      vorbedingungen: Object.freeze([V.GRUNDLINIE]),
      liefert: V.WERTE,
      freigabe: Object.freeze({ art: "betreiber-env", worte: null }),
      abbruchkontrolle: null,
      zweck: "Sieben Pflichtwerte plus HELMUT_TESTLAUF_KOMMUNIKATION=gesperrt. Ohne sie "
        + "meldet startbereitschaft() bereit=false — und zwar auch dann, wenn die "
        + "Konfiguration auf dem Papier stimmt (die Reserve wird zur LAUFZEIT gelesen)."
    }),
    Object.freeze({
      nr: 4, id: "riegel", titel: "Kommunikationsriegel scharf prüfen",
      art: ART_LESEND,
      befehl: "node scripts/lokal.js -- node scripts/kommunikationsriegel-test.js",
      vorbedingungen: Object.freeze([V.WERTE]),
      liefert: V.RIEGEL,
      freigabe: null,
      abbruchkontrolle: "A10",
      zweck: `${kommunikationsriegel.SCHALTER}=${kommunikationsriegel.SCHALTER_WERT_GESPERRT} `
        + "sperrt JEDEN Außenkanal — auch die Betreiberkanäle und auch reale Empfänger."
    }),
    Object.freeze({
      nr: 5, id: "startfenster", titel: "Sicheres Startfenster bestimmen und festschreiben",
      art: ART_LESEND,
      befehl: `${CLI} fenster --dauer=<minuten>`,
      vorbedingungen: Object.freeze([]),
      liefert: V.FENSTER,
      freigabe: null,
      abbruchkontrolle: "A12",
      zweck: "Das 05:45/05:48-Fenster bleibt gesperrt, solange der Verträglichkeitsnachweis "
        + "fehlt; der Actions-Watchdog sperrt konservativ 05:30–08:30 UTC. Der Befund geht "
        + "als `startfensterBefund` in die Aktivierung — ohne ihn bleibt sie blockiert."
    }),
    Object.freeze({
      nr: 6, id: "provisionierung", titel: `${KOHORTE_GESAMT} Profile INAKTIV provisionieren`,
      art: ART_PRODUCTION,
      befehl: `${CLI} plan --grundlinie=grundlinie.json --bestand=bestand.json`,
      vorbedingungen: Object.freeze([V.GRUNDLINIE, V.SICHERUNG]),
      liefert: V.PROVISIONIERT,
      freigabe: Object.freeze({
        art: "flag-und-wort",
        flag: kohorte.EXECUTE_FLAG,
        variable: kohorte.CONFIRM_VARIABLE,
        wort: kohorte.FREIGABEWORTE.provisionierung
      }),
      abbruchkontrolle: "A09",
      zweck: "Legt ausschließlich INAKTIV an — inaktive Profile erzeugen keine Last und "
        + "kein Budget. Idempotent: ein abgebrochener Lauf wird exakt ergänzt."
    }),
    Object.freeze({
      nr: 7, id: "isolation", titel: "Isolation der Kohorte belegen (6 Einzelbefunde)",
      art: ART_LESEND,
      befehl: `${CLI} isolation --grundlinie=grundlinie.json --bestand=bestand.json`,
      vorbedingungen: Object.freeze([V.PROVISIONIERT]),
      liefert: V.ISOLATION,
      freigabe: null,
      abbruchkontrolle: "A09",
      zweck: "Belegt die vollständige Trennung von den realen Mandaten. Geprüft werden die "
        + "TATSÄCHLICH gelesenen Adressen, nicht die generierten."
    }),
    ...[
      { g: gruppeA, v: V.GRUPPE_A, k: V.KONTROLLE_A, vor: [V.ISOLATION, V.RIEGEL, V.FENSTER, V.WERTE] },
      { g: gruppeB, v: V.GRUPPE_B, k: V.KONTROLLE_B, vor: [V.KONTROLLE_A] },
      { g: gruppeC, v: V.GRUPPE_C, k: V.KONTROLLE_C, vor: [V.KONTROLLE_B] }
    ].flatMap(({ g, v, k, vor }, i) => [
      Object.freeze({
        nr: 8 + i * 2, id: `aktivierung-${g.kennung}`,
        titel: `Gruppe ${g.kennung.toUpperCase()} aktivieren (${g.groesse} Profile)`,
        art: ART_PRODUCTION,
        befehl: `${CLI} aktivierung --gruppe=${g.kennung} --grundlinie=grundlinie.json `
          + "--bestand=bestand.json --start=<HH:MM> --dauer=<minuten>",
        vorbedingungen: Object.freeze(vor),
        liefert: v,
        freigabe: Object.freeze({
          art: "flag-und-wort",
          flag: kohorte.EXECUTE_FLAG,
          variable: kohorte.CONFIRM_VARIABLE,
          wort: kohorte.FREIGABEWORTE[`aktivierung-${g.kennung}`]
        }),
        abbruchkontrolle: "A01–A15",
        zweck: `${g.zweck}. Der Stufenvertrag ist fail closed: ohne vollständige Vorstufe `
          + "und ohne freien Fensterbefund bleibt der Lauf ein Trockenlauf."
      }),
      Object.freeze({
        nr: 9 + i * 2, id: `kontrolle-${g.kennung}`,
        titel: `Kurze Sicherheitskontrolle nach Gruppe ${g.kennung.toUpperCase()}`,
        art: ART_LESEND,
        befehl: `${CLI_KONTROLLE} sql --seit=<STUFENBEGINN-UTC>  →  ${CLI_KONTROLLE} pruefe --quellen=quellen.json --grenzen=grenzen.json`,
        vorbedingungen: Object.freeze([v]),
        liefert: k,
        freigabe: null,
        abbruchkontrolle: "A01–A15",
        zweck: "Alle fünfzehn Abbruchregeln gegen FRISCH erhobene Messwerte. Eine Regel "
          + "ohne Messwert stoppt den Test — sie gilt nicht als grün. A15 verlangt "
          + "zusätzlich einen Mindestumfang beobachteter Arbeit: eine leere Bilanz ist "
          + "nicht grün, sondern leer."
      })
    ]),
    Object.freeze({
      nr: 14, id: "fachzyklus", titel: "Kontrollierter Fachzyklus mit 500 aktiven Profilen",
      art: ART_PRODUCTION,
      befehl: "bestehender Motor (Cron-Antrieb) — kein eigener Befehl",
      vorbedingungen: Object.freeze([V.KONTROLLE_C]),
      liefert: V.ZYKLUS,
      freigabe: Object.freeze({ art: "betreiber-einzelfreigabe", worte: null }),
      abbruchkontrolle: "A01–A15",
      zweck: "Die einzige Ebene, die weder durch Offline-Tests noch durch diesen Sprint "
        + "ersetzbar ist (Beweisstand §2, Ebene 3)."
    }),
    Object.freeze({
      nr: 15, id: "auswertung", titel: "Gemeinsame Auswertung (Laufbilanz, Drain-Bilanz, Kosten)",
      art: ART_LESEND,
      befehl: "lauf-bilanz.js · Drain-Bilanz im Gesundheitsbericht · Kostenrechnung",
      vorbedingungen: Object.freeze([V.ZYKLUS]),
      liefert: null,
      freigabe: null,
      abbruchkontrolle: "A03, A04, A07, A08",
      zweck: "Die Bilanz muss aufgehen. Geht sie nicht auf, wurde etwas anderes gezählt "
        + "als gearbeitet (A08)."
    }),
    // ── RÜCKWÄRTS: NIE GESPERRT ──────────────────────────────────────────────
    Object.freeze({
      nr: 16, id: "deaktivierung", titel: "Synthetische Profile deaktivieren (erster Rückweg)",
      art: ART_PRODUCTION,
      befehl: `${CLI} deaktivierung --grundlinie=grundlinie.json --bestand=bestand.json`
        + `  →  Ausführung: node scripts/testkohorte-rueckbau.js --scharf`,
      vorbedingungen: Object.freeze([]),   // BEWUSST LEER — siehe Kopfkommentar
      liefert: null,
      freigabe: Object.freeze({
        art: "flag-und-wort",
        flag: kohorte.EXECUTE_FLAG,
        variable: kohorte.CONFIRM_VARIABLE,
        wort: kohorte.FREIGABEWORTE.deaktivierung
      }),
      abbruchkontrolle: null,
      immerErlaubt: true,
      zweck: "Kennt KEINEN Löschpfad (loeschtNichts:true) und wirkt ausschließlich auf die "
        + `${KOHORTE_GESAMT} Kohortenkennungen. Jederzeit erlaubt — ein Rückbau darf nie `
        + "an einer Vorbedingung scheitern. Der Ausführer liest jede Zeile NACH dem "
        + "Schreiben gegen und meldet nur, was die Ablage trägt; ein Fehlschlag an einer "
        + "Kennung beendet den Lauf NICHT (sonst bliebe der Rest aktiv), sondern wird "
        + "einzeln ausgewiesen. Der Lauf ist idempotent und wiederholbar."
    }),
    Object.freeze({
      nr: 17, id: "rueckbau", titel: "Grundlinie bestätigen (4 Einzelbefunde)",
      art: ART_LESEND,
      befehl: `${CLI} rueckbau --grundlinie=grundlinie.json --bestand=bestand.json`,
      vorbedingungen: Object.freeze([]),
      liefert: null,
      freigabe: null,
      abbruchkontrolle: "A09",
      immerErlaubt: true,
      zweck: "Keine aktive synthetische Zeile · Zahl der realen Mandate unverändert · "
        + "Zahl der AKTIVEN realen Mandate unverändert · keine neue Löschmarke an einem "
        + "realen Mandat."
    }),
    // ── NACHARBEIT: eigene Freigabe, nie Teil des Rückwegs ───────────────────
    Object.freeze({
      nr: 18, id: "scheduler-spur", titel: "Scheduler-Spur der Kohorte aufräumen (Nacharbeit)",
      art: ART_PRODUCTION,
      befehl: "node scripts/testkohorte-rueckbau.js --spur --scharf",
      // Erst nach bestätigtem Rückbau — vorher wäre es Aufräumen im Laufenden.
      vorbedingungen: Object.freeze(["rueckbau"]),
      liefert: null,
      freigabe: Object.freeze({
        art: "flag-und-wort",
        flag: kohorte.EXECUTE_FLAG,
        variable: kohorte.CONFIRM_VARIABLE,
        wort: kohorte.FREIGABEWORTE["scheduler-spur"]
      }),
      abbruchkontrolle: null,
      immerErlaubt: false,
      zweck: "Der Fairnesszustand ist EINE helmut_store-Zeile, die je Mandatswechsel "
        + "vollständig gelesen und geschrieben wird. Das Deaktivieren lässt die Spur der "
        + `${KOHORTE_GESAMT} Kennungen dort 90 Tage stehen und verlangsamt danach jeden `
        + "Fairness-Schreibvorgang der fünf realen Mandate. Dieser Schritt entfernt "
        + "AUSSCHLIESSLICH Scheduler-Metadaten, niemals Profil-, Inhalts- oder Kontodaten, "
        + "und trägt ein EIGENES Bestätigungswort: das Wort des Rückwegs schaltet ihn nicht "
        + "scharf, und seines deaktiviert nichts."
    })
  ]);
}

// Der vollständige Plan mit dem Zustand jedes Schrittes. `belegt` ist die Menge
// der bereits erbrachten Vorbedingungen (EINGABE, nicht Selbstauskunft).
function ablaufplan({ belegt = [] } = {}) {
  const erbracht = new Set((Array.isArray(belegt) ? belegt : []).map((b) => String(b)));
  const liste = schritte().map((schritt) => {
    const offen = schritt.vorbedingungen.filter((v) => !erbracht.has(v));
    const darfBeginnen = schritt.immerErlaubt === true || offen.length === 0;
    return Object.freeze({
      ...schritt,
      offeneVorbedingungen: Object.freeze(offen),
      darfBeginnen,
      erledigt: Boolean(schritt.liefert && erbracht.has(schritt.liefert)),
      meldung: darfBeginnen
        ? (schritt.freigabe
          ? `Vorbedingungen erfüllt — der Schritt bleibt GESPERRT bis zur eigenen Freigabe.`
          : "Vorbedingungen erfüllt; rein lesender Schritt.")
        : `GESPERRT: ${offen.length} offene Vorbedingung(en) — ${offen.join(", ")}.`
    });
  });
  const naechster = liste.find((s) => !s.erledigt && s.darfBeginnen && s.immerErlaubt !== true) || null;
  const productionSchritte = liste.filter((s) => s.art === ART_PRODUCTION);
  return Object.freeze({
    schritte: Object.freeze(liste),
    naechsterSchritt: naechster ? naechster.id : null,
    productionSchritte: Object.freeze(productionSchritte.map((s) => s.id)),
    einzelfreigabenGesamt: productionSchritte.length + liste.filter((s) => s.art === ART_UMGEBUNG).length,
    gesperrt: Object.freeze(liste.filter((s) => !s.darfBeginnen).map((s) => s.id)),
    // Der Plan ist ausführbar BESCHRIEBEN, aber nicht ausführbar GESCHALTET.
    ausfuehrbar: false,
    hinweis: "Dieser Plan führt NICHTS aus. Jede Production-Aktion und jede "
      + "Umgebungsänderung bleibt eine eigene, ausdrückliche Betreiberfreigabe "
      + "(CLAUDE.md §5). Der scharfe Lauf ist im CLI bewusst nicht implementiert."
  });
}

// Alles, was der Betreiber vor Schritt 3 wissen muss — an einer Stelle.
function vorbereitung() {
  return Object.freeze({
    betreiberwerte: kapazitaet.vorbereiteteBetreiberwerte(),
    kommunikationsriegel: Object.freeze({
      env: kommunikationsriegel.SCHALTER,
      wert: kommunikationsriegel.SCHALTER_WERT_GESPERRT,
      wirkung: "sperrt JEDEN der sieben Außenkanäle — auch Betreiberkanäle und reale Empfänger"
    }),
    vorrangreserve: Object.freeze({
      env: mandatsklasse.VORRANG_REAL_ENV,
      mindestens: mandatsklasse.VORRANG_REAL_MESSBEDARF_P95,
      empfehlung: mandatsklasse.VORRANG_REAL_EMPFEHLUNG,
      // KORRIGIERT 02.09. (adversariales Diff-Review, bestätigter Befund): Hier
      // stand "reale Mandate und geteilte Arbeit sehen unverändert dasselbe
      // Maximum". Das war FALSCH — und es ist der Satz, den der Betreiber über
      // `funktionstest-500-ablauf.js werte` genau in dem Moment liest, in dem er
      // über den Wert entscheidet. Ein falscher Satz über einen
      // Schutzmechanismus an der Entscheidungsstelle ist ein falsches Grün
      // (CLAUDE.md §4.4).
      wirkung: "zieht die Reserve vom wirksamen Tagesmaximum ab — für SYNTHETISCHE und "
        + "nicht zuordenbare mandatsgebundene Aufrufe UND für GETEILTE Arbeit (Verstehen, "
        + "Backfills). AUSGENOMMEN ist allein die mandatsgebundene Arbeit REALER Mandate: "
        + "sie sieht unverändert dasselbe Maximum. Dem geteilten/priorisierten Pfad bleibt "
        + "immer mindestens die Verstehens-Reserve — ein Vorrangwert ≥ Deckel bremst ihn, "
        + "schaltet ihn aber nicht ab.",
      warnung: "Der Wert muss KLEINER sein als `HELMUT_MAX_LLM_CALLS_PER_DAY` minus "
        + "`HELMUT_LLM_RESERVE_UNDERSTANDING`. Der heutige Production-Deckel (100) trägt "
        + "die Empfehlung 200 NICHT — der Deckel wird VOR der Vorrangreserve angehoben."
    }),
    abbruchgrenzen: Object.freeze({
      pflicht: funktionstest.GRENZEN_PFLICHT,
      hinweis: "Jede einzelne fehlende Grenze blockiert den Testbeginn."
    })
  });
}

module.exports = {
  ART_LESEND,
  ART_PRODUCTION,
  ART_UMGEBUNG,
  VORBEDINGUNGEN: V,
  schritte,
  ablaufplan,
  vorbereitung
};
