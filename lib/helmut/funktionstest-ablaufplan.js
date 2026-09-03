"use strict";

// Helmut — DER AUSFÜHRBARE, ABER GESPERRTE ABLAUFPLAN DES 500er-FUNKTIONSTESTS.
// =============================================================================
// WAS BISHER FEHLTE. Der Sicherheitsrahmen (§10) beschreibt den Ablauf als
// TABELLE in einem Dokument. Eine Tabelle prüft nichts: sie kann nicht sagen,
// ob ein Schritt heute beginnen darf, sie kennt den erhobenen Zustand nicht, und
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
// ─── STUFENWEISE, NICHT GESAMT (Umbau 03.09.) ────────────────────────────────
// Bis zum 03.09. kannte dieser Plan EINEN Provisionierungsschritt, der alle 495
// Profile gemeinsam anlegte, EINEN Isolationsbeleg für die volle Kohorte und
// EINEN Fachzyklus bei 500 aktiven Profilen. Die Bibliothek konnte da längst
// stufengenau provisionieren — der Plan und das Betreiber-CLI sagten es nicht.
// Der Plan behauptete damit einen nächsten Schritt („495 gemeinsam anlegen"),
// den niemand so gehen sollte.
//
// SEITDEM: Jede Stufe (A = 20, B = 75, C = 400) durchläuft GETRENNT und in
// dieser Reihenfolge fünf Vorgänge, jeder mit eigener Vorbedingung und — wo er
// schreibt — eigenem stufengenauen Bestätigungswort:
//
//   provisionierung-X   INAKTIV anlegen           production   Stufenwort
//   isolation-X         Isolation + Inaktivität   rein lesend  —
//   aktivierung-X       scharf schalten           production   Bestandswort aktivierung-X
//   fachzyklus-X        begrenzter Lauf           production   Stufenwort
//   kontrolle-X         A01–A15 + Auswertung      rein lesend  —
//
// Stufe B beginnt erst, wenn Stufe A KONTROLLIERT ist; Stufe C erst nach B.
// Es gibt KEINEN Schritt, der alle 495 gemeinsam anlegt.
//
// ─── DIE BETREIBERWERTE GEHÖREN VOR DIE AKTIVIERUNG, NICHT VOR DIE ANLAGE ────
// Die acht Betreiberwerte (Deckel, Verstehens-Reserve, Vorrangreserve
// HELMUT_TESTLAUF_VORRANG_REAL, RPM, TPM, Kostenbudget, Parallelität,
// Kommunikationsriegel) müssen NICHT vor der rein inaktiven Provisionierung
// gesetzt sein: ein inaktives Profil erzeugt keinen Warteschlangenauftrag, keine
// Verstehensarbeit, keinen Modellaufruf und keine Außenkommunikation
// (verhaltensbelegt: `scripts/testkohorte-provisionierung-inaktiv-test.js`;
// die Anlage schreibt je Kennung Konto und Profil, sonst nichts). Sie müssen aber
// zwingend gesetzt, wirksam und geprüft sein, BEVOR das erste synthetische
// Profil aktiviert wird — deshalb sind sie Vorbedingung von `aktivierung-a`,
// nicht von `provisionierung-a`.
//
// ─── DER GRUNDSATZ: JEDE PRODUCTION-AKTION IST IHRE EIGENE FREIGABE ─────────
// Es gibt in diesem Plan KEINE Sammelfreigabe. Wer die Anlage der Stufe A
// freigibt, hat ihre Aktivierung NICHT freigegeben; wer Stufe A freigibt, hat
// Stufe B NICHT freigegeben. Der Plan kann deshalb vollständig gedruckt, geprüft
// und geübt werden, ohne dass irgendetwas näher an die Ausführung rückt.
//
// ─── DIE ASYMMETRIE, DIE ABSICHT IST ────────────────────────────────────────
// VORWÄRTS wird streng gesperrt: fehlt eine Vorbedingung, darf der Schritt
// nicht beginnen. RÜCKWÄRTS (Deaktivierung, Rückbauprüfung) wird NIE gesperrt.
// Ein Rückbau, der an einer Vorbedingung scheitert, wäre die gefährlichste
// Stelle des ganzen Ablaufs — dann bliebe die Kohorte aktiv stehen.

const kohorte = require("./testkohorte-betrieb");
const stufen = require("./testkohorte-stufen");
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
  FENSTER: "startfenster-frei",
  WERTE: "betreiberwerte-gesetzt",
  WERTE_GEPRUEFT: "betreiberwerte-wirksam-geprueft",
  RIEGEL: "kommunikationsriegel-scharf",
  STUFE_A_ANGELEGT: "stufe-a-inaktiv-angelegt",
  STUFE_B_ANGELEGT: "stufe-b-inaktiv-angelegt",
  STUFE_C_ANGELEGT: "stufe-c-inaktiv-angelegt",
  ISOLATION_A: "isolation-a-belegt",
  ISOLATION_B: "isolation-b-belegt",
  ISOLATION_C: "isolation-c-belegt",
  GRUPPE_A: "gruppe-a-aktiv",
  GRUPPE_B: "gruppe-b-aktiv",
  GRUPPE_C: "gruppe-c-aktiv",
  ZYKLUS_A: "fachzyklus-a-ausgefuehrt",
  ZYKLUS_B: "fachzyklus-b-ausgefuehrt",
  ZYKLUS_C: "fachzyklus-c-ausgefuehrt",
  KONTROLLE_A: "sicherheitskontrolle-nach-a",
  KONTROLLE_B: "sicherheitskontrolle-nach-b",
  KONTROLLE_C: "sicherheitskontrolle-nach-c",
  // Sicherheitsrahmen §34.7 — die Geschichte dieser Kennung, nicht rueckwirkend
  // umgeschrieben: am 03.09. wies die Bundestagsreife-Sperre 18 der 20
  // Stufe-A-Profile ab („Testausschuss N" ist nicht in der WP-21-Sollmenge), und
  // die Kennung war eine offene BETREIBERENTSCHEIDUNG. Noch am selben Tag wurde
  // Variante A umgesetzt: die Bundestagsprofile der Kohorte tragen die amtlichen
  // Ausschussbezeichnungen der 21. Wahlperiode aus der Sollmenge; die Sperre
  // wurde dabei nicht gelockert, sondern verschaerft. Seitdem ist die Kennung
  // BELEGBAR — durch einen rein lesenden Lauf, nicht durch eine Behauptung.
  // Sie bleibt Vorbedingung jeder Anlage: kein Anlegen ohne frischen Reifebeleg.
  KOHORTE_ANLEGBAR: "kohortenspezifikation-reifesperre-belegt",
  // Zwei Vorbedingungen, die bisher kein Schritt lieferte (Reviewbefund 03.09.):
  // sie mussten von Hand behauptet werden. Jetzt liefert sie ein Schritt.
  RUECKBAU: "grundlinie-bestaetigt",
  MIGRATION_LLM_USAGE: "migration-llm-usage-angewendet"
});

// Die Vorbedingungen EINER Stufe, nach Vorgang.
function vorbedingungenDerStufe(stufe) {
  const S = String(stufe).toUpperCase();
  return Object.freeze({
    angelegt: V[`STUFE_${S}_ANGELEGT`],
    isolation: V[`ISOLATION_${S}`],
    aktiv: V[`GRUPPE_${S}`],
    zyklus: V[`ZYKLUS_${S}`],
    kontrolle: V[`KONTROLLE_${S}`]
  });
}

const LOKAL = "node scripts/lokal.js --";
const CLI = `${LOKAL} node scripts/testkohorte-495.js`;
const CLI_VORWAERTS = "node scripts/testkohorte-vorwaerts.js";
const CLI_KONTROLLE = `${LOKAL} node scripts/funktionstest-500-kontrolle.js`;
const CLI_ZYKLUS = "node scripts/funktionstest-500-zyklus.js";
const CLI_ABLAUF = `${LOKAL} node scripts/funktionstest-500-ablauf.js`;

// Die Betreiberwerte, an EINER Stelle benannt (Quelle: kapazitaet-500).
function betreiberwerteNamen() {
  const werte = kapazitaet.vorbereiteteBetreiberwerte().werte.map((w) => w.env);
  return Object.freeze([...werte, kommunikationsriegel.SCHALTER]);
}

function flagUndWort(wort) {
  return Object.freeze({
    art: "flag-und-wort",
    flag: kohorte.EXECUTE_FLAG,
    variable: kohorte.CONFIRM_VARIABLE,
    wort
  });
}

// Die fünf Schritte EINER Stufe. `vorherigeKontrolle` ist die Vorbedingung
// der vorangehenden Stufe (null für A): B darf erst nach kontrollierter A
// beginnen, C erst nach kontrollierter B — auch für die Anlage. Das ist der
// Sinn der Stufung: ein Schaden wird bei 20 sichtbar, nicht erst bei 400.
function stufenSchritte(gruppe, vorherigeKontrolle) {
  const s = gruppe.kennung;
  const S = s.toUpperCase();
  const vb = vorbedingungenDerStufe(s);
  const stufenwort = stufen.STUFEN_FREIGABEWORTE[s];
  const vorstufe = vorherigeKontrolle ? [vorherigeKontrolle] : [];
  // Die Stufen, deren Kontrolle BESTANDEN sein muss (für den Fachzyklus-Befehl).
  const bestandeneStufen = stufen.STUFEN.slice(0, stufen.STUFEN.indexOf(s));
  return [
    Object.freeze({
      id: `provisionierung-${s}`, stufe: s,
      titel: `Stufe ${S}: ${gruppe.groesse} Profile INAKTIV provisionieren`,
      art: ART_PRODUCTION,
      befehl: `${LOKAL} ${CLI_VORWAERTS} provisionierung --stufe=${s}`
        + `  →  Ausführung: ${CLI_VORWAERTS} provisionierung --stufe=${s}`
        + " --start=<HH:MM> --dauer=<min> --scharf",
      // BEWUSST NICHT: V.WERTE, V.WERTE_GEPRUEFT, V.RIEGEL. Die inaktive Anlage
      // erzeugt keine Last und braucht die Betreiberwerte nicht (Kopfkommentar).
      // WOHL ABER: die Betreiberentscheidung zur Reifesperre (§34.7) — ohne sie
      // endet der scharfe Lauf mit 18 von 20 abgewiesenen Profilen.
      vorbedingungen: Object.freeze([V.GRUNDLINIE, V.SICHERUNG, V.FENSTER, V.KOHORTE_ANLEGBAR, ...vorstufe]),
      liefert: vb.angelegt,
      freigabe: flagUndWort(stufenwort.provisionierung),
      abbruchkontrolle: "A09",
      zweck: `Legt ausschließlich die ${gruppe.groesse} Kennungen der Stufe ${S} INAKTIV an — `
        + "inaktive Profile erzeugen keinen Warteschlangenauftrag, keine Verstehensarbeit, keinen "
        + "Modellaufruf und keine Außenkommunikation (verhaltensbelegt). Geschrieben wird je Kennung: "
        + "ein Konto (gesperrt) in den Auth-Blob `main-auth` (unbedingter Vollschreib, Last-Write-Wins) "
        + "und das Profil (Blob und relationale Upserts). Das CLI verlangt `--stufe=` zwingend und fällt "
        + `nie auf alle ${KOHORTE_GESAMT} zurück; das Wort dieser Stufe legt keine andere an. `
        + "Idempotent: ein abgebrochener Lauf wird exakt ergänzt (`--ids=` für eine Teilmenge "
        + "DIESER Stufe). Die acht Betreiberwerte sind hier KEINE Vorbedingung. BLOCKER §34.7: "
        + "ohne Entscheidung zur Kohortenspezifikation weist die Bundestagsreife-Sperre die "
        + "Bundestagsprofile ab (Stufe A: 18 von 20)."
    }),
    Object.freeze({
      id: `isolation-${s}`, stufe: s,
      titel: `Stufe ${S}: Isolation und Inaktivität rein lesend belegen`,
      art: ART_LESEND,
      befehl: `${CLI} sql (rein lesend ausführen, Ergebnis als bestand.json)`
        + `  →  ${CLI} isolation --stufe=${s} --grundlinie=grundlinie.json --bestand=bestand.json`,
      vorbedingungen: Object.freeze([vb.angelegt, ...vorstufe]),
      liefert: vb.isolation,
      freigabe: null,
      abbruchkontrolle: "A09",
      zweck: `Belegt für den Bestand bis einschließlich Stufe ${S}: exakt die erwarteten Kennungen `
        + `gelesen, die ${gruppe.groesse} Zeilen dieser Stufe vollständig und INAKTIV, kein `
        + "Kohortenkonto aktiv, reale Mandate zahlenmäßig unberührt, keine zustellbare Adresse, "
        + "Kommunikationsriegel sperrt jede Zeile. Geprüft werden die TATSÄCHLICH gelesenen "
        + "Adressen, nicht die generierten."
    }),
    Object.freeze({
      id: `aktivierung-${s}`, stufe: s,
      titel: `Stufe ${S}: ${gruppe.groesse} Profile aktivieren`,
      art: ART_PRODUCTION,
      befehl: `${CLI} aktivierung --gruppe=${s} --grundlinie=grundlinie.json `
        + "--bestand=bestand.json --start=<HH:MM> --dauer=<minuten>"
        + `  →  Ausführung: ${CLI_VORWAERTS} aktivierung --gruppe=${s}`
        + " --grundlinie=grundlinie.json --bestand=bestand.json --start=<HH:MM> --dauer=<min> --scharf",
      // AB HIER entsteht Last. Deshalb: Betreiberwerte gesetzt UND wirksam
      // geprüft, Riegel scharf, Fenster frei, Isolation belegt, Vorstufe
      // kontrolliert. Nichts davon ist ohne Beleg erfüllt.
      vorbedingungen: Object.freeze([
        vb.isolation, V.WERTE, V.WERTE_GEPRUEFT, V.RIEGEL, V.FENSTER, ...vorstufe
      ]),
      liefert: vb.aktiv,
      freigabe: flagUndWort(kohorte.FREIGABEWORTE[`aktivierung-${s}`]),
      abbruchkontrolle: "A01–A15",
      zweck: `${gruppe.zweck}. Ab hier erzeugen die Profile Aufträge und Last; der natürliche `
        + "Bestandscron plant sie beim nächsten Slot automatisch. Deshalb müssen die acht "
        + "Betreiberwerte einschließlich HELMUT_TESTLAUF_VORRANG_REAL VOR diesem Schritt gesetzt, "
        + "wirksam und geprüft sein. Der Stufenvertrag ist fail closed: ohne vollständige Vorstufe "
        + "und ohne freien Fensterbefund bleibt der Lauf ein Trockenlauf."
    }),
    Object.freeze({
      id: `fachzyklus-${s}`, stufe: s,
      titel: `Stufe ${S}: kontrollierter Fachzyklus (${stufen.STUFEN_AKTIV_KUMULIERT[s] + REALE_MANDATE} aktive Profile)`,
      art: ART_PRODUCTION,
      befehl: `${LOKAL} ${CLI_ZYKLUS} --stufe=${s} --start=<HH:MM> --dauer=<min> --konfiguration=<json> `
        + "--grenzen=<json> --messungen=<json> --faelligkeitsfenster=<json> --isolation-belegt"
        + (bestandeneStufen.length ? ` --bestandene-stufen='${JSON.stringify(bestandeneStufen)}'` : "")
        + "  →  Ausführung: dieselbe Zeile ohne scripts/lokal.js, mit --scharf",
      // Der Fachzyklus ist der Schritt, der die Vorrangreserve BRAUCHT — deshalb
      // hängt er an den geprüften Werten, am Riegel, am Fenster und an der
      // kontrollierten Vorstufe, nicht allein an der Aktivierung.
      vorbedingungen: Object.freeze([vb.aktiv, V.WERTE_GEPRUEFT, V.RIEGEL, V.FENSTER, ...vorstufe]),
      liefert: vb.zyklus,
      freigabe: flagUndWort(stufenwort.fachzyklus),
      abbruchkontrolle: "A01–A15",
      zweck: "Kostet Modellaufrufe und ist der einzige Vorgang, der die realen Mandate verdrängen "
        + "KANN — deshalb erst nach gesetzter, wirksamer Vorrangreserve. Der Startweg ruft "
        + "ausschließlich die bestehende Route /api/cron/pipeline in begrenzten Scheiben auf; kein "
        + "Cron wird verändert, kein Motor angefasst. Die Startbereitschaft wird gerechnet, nie "
        + "zugesagt (`startbereitschaft`, zwölf Startbedingungen)."
        + (bestandeneStufen.length
          ? ` \`--bestandene-stufen\` nennt die BESTANDENEN Kontrollen (${bestandeneStufen.map((x) => `kontrolle-${x}`).join(", ")}), nicht eine Zusage.`
          : "")
    }),
    Object.freeze({
      id: `kontrolle-${s}`, stufe: s,
      titel: `Stufe ${S}: Sicherheitskontrolle und Auswertung (A01–A15)`,
      art: ART_LESEND,
      befehl: `${CLI_KONTROLLE} sql --seit=<STUFENBEGINN-UTC>`
        + `  →  ${CLI_KONTROLLE} pruefe --stufe=${s} --quellen=quellen.json --grenzen=grenzen.json`,
      vorbedingungen: Object.freeze([vb.zyklus, ...vorstufe]),
      liefert: vb.kontrolle,
      freigabe: null,
      abbruchkontrolle: "A01–A15",
      zweck: "Alle fünfzehn Abbruchregeln gegen FRISCH erhobene Messwerte. Eine Regel ohne "
        + "Messwert stoppt den Test — sie gilt nicht als grün. A15 verlangt einen Mindestumfang "
        + "beobachteter Arbeit: eine leere Bilanz ist nicht grün, sondern leer. Erst eine "
        + `BESTANDENE Kontrolle der Stufe ${S} gibt die nächste Stufe frei.`
    })
  ];
}

function schritte() {
  const [gruppeA, gruppeB, gruppeC] = GRUPPEN;
  const roh = [
    // ── VORBEREITUNG ─────────────────────────────────────────────────────────
    Object.freeze({
      id: "grundlinie", titel: "Grundlinie rein lesend erheben",
      art: ART_LESEND,
      befehl: `${CLI} sql`,
      vorbedingungen: Object.freeze([]),
      liefert: V.GRUNDLINIE,
      freigabe: null,
      abbruchkontrolle: null,
      zweck: `Der eingefrorene Vertrag, gegen den alles Weitere gemessen wird: `
        + `${REALE_MANDATE} aktive und 4 inaktive reale Mandate, 0 synthetische Zeilen. `
        + "Der Plan prüft diese Vorbedingung EINMAL; vor Stufe B und C ist die Grundlinie erneut "
        + "zu erheben — Betreiberpflicht, vom Plan nicht erzwungen (Kennung ist nicht stufengebunden)."
    }),
    Object.freeze({
      id: "sicherung", titel: "Gezielte Sicherung der zwei betroffenen Tabellen + Prüfung",
      art: ART_LESEND,
      // OHNE scripts/lokal.js — bewusst: der Starter entfernt SUPABASE_URL und den
      // Service-Key aus der Kindumgebung, backup-export.js bricht dann mit Exit 2
      // ab, bevor es exportiert (Reviewbefund 03.09.). Die Sicherung ist der eine
      // Lauf, der Production erreichen MUSS; er verlangt seine Kennungen selbst.
      befehl: "node scripts/backup-export.js --scope=profil  →  Prüfung: Exit 0 und manifest.vollstaendig === true",
      vorbedingungen: Object.freeze([V.GRUNDLINIE]),
      liefert: V.SICHERUNG,
      freigabe: null,
      abbruchkontrolle: null,
      zweck: "Supabase Free-Tarif: keine nativen Backups, kein PITR (OP-01). Dies ist "
        + "die einzige Wiederherstellungsgrundlage. Ein Teil-Export (vollstaendig:false) "
        + "gilt NICHT als Sicherung. Der Export ist personenbezogen — nie committen. "
        + "Vor Stufe B und C erneut sichern (Betreiberpflicht, vom Plan nicht erzwungen)."
    }),
    Object.freeze({
      id: "startfenster", titel: "Sicheres Startfenster bestimmen und festschreiben",
      art: ART_LESEND,
      befehl: `${CLI} fenster --dauer=<minuten>`,
      vorbedingungen: Object.freeze([]),
      liefert: V.FENSTER,
      freigabe: null,
      abbruchkontrolle: "A12",
      zweck: "Das 05:45/05:48-Fenster bleibt gesperrt, solange der Verträglichkeitsnachweis "
        + "fehlt; der Actions-Watchdog sperrt konservativ 05:30–08:30 UTC. Der Befund geht "
        + "als `startfensterBefund` in Provisionierung und Aktivierung — ohne ihn bleiben "
        + "beide Trockenlauf. Nach Fälligkeit trägt allein das Nachtfenster 21:36–03:59 UTC "
        + "die volle Kohorte (Sicherheitsrahmen §30)."
    }),
    // ── BETREIBERENTSCHEIDUNG: die Kohorte muss die Reifesperre passieren ────
    Object.freeze({
      id: "kohortenreife", titel: "Reifebeleg der Kohortenspezifikation (Bundestagsreife-Sperre) — rein lesend",
      art: ART_LESEND,
      befehl: `${LOKAL} node scripts/testkohorte-provisionierung-inaktiv-test.js  (A0: 20/20 der Stufe A `
        + `angelegt, 0 abgewiesen)  ·  ${LOKAL} node scripts/test-kohorte-500-test.js  (§11: 495/495 der `
        + "Kohorte bestehen die Prüfung ihrer politischen Ebene)",
      vorbedingungen: Object.freeze([]),
      liefert: V.KOHORTE_ANLEGBAR,
      freigabe: null,
      abbruchkontrolle: null,
      zweck: "Sicherheitsrahmen §34.7 (Variante A, geschlossen 03.09.): die Bundestagsprofile der "
        + "Kohorte tragen die amtlichen Ausschussbezeichnungen der 21. Wahlperiode aus der Sollmenge "
        + "`quellenarchitektur/seeds/bundestag-ausschuesse.js`, die Landtagsprofile weiterhin "
        + "synthetische — ein Bundestagsausschuss auf Landesebene wäre eine falsche politische Ebene. "
        + "Die Reifesperre wurde dabei NICHT gelockert, sondern verschärft (veraltete Bezeichnungen "
        + "früherer Wahlperioden werden jetzt abgewiesen, vorher liefen drei von vier durch). Dieser "
        + "Schritt entscheidet nichts mehr — er BELEGT rein lesend, dass der echte, unveränderte "
        + "Provisionierungspfad die Stufe A vollständig annimmt. Vorbedingung jeder Anlage bleibt er: "
        + "kein Anlegen ohne frischen Beleg."
    }),
    // ── STUFE A: Anlage und Isolation — OHNE Betreiberwerte ──────────────────
    ...stufenSchritte(gruppeA, null).slice(0, 2),
    // ── BETREIBERWERTE: erst jetzt, zwingend vor der ersten Aktivierung ──────
    Object.freeze({
      id: "betreiberwerte", titel: "Deckel, Reserven, Grenzen und den Kommunikationsriegel setzen",
      art: ART_UMGEBUNG,
      befehl: `Vercel-Env (Betreiberaktion) — die exakten Werte nennt \`${CLI_ABLAUF} werte\``,
      vorbedingungen: Object.freeze([V.GRUNDLINIE]),
      liefert: V.WERTE,
      freigabe: Object.freeze({ art: "betreiber-env", worte: null }),
      abbruchkontrolle: null,
      zweck: `Die acht Werte: ${betreiberwerteNamen().join(", ")}. `
        + "Sie sind NICHT Vorbedingung der inaktiven Provisionierung und der Isolationsprüfung "
        + "— aber zwingend gesetzt, wirksam und geprüft, BEVOR das erste synthetische Profil "
        + "aktiviert wird. Deckel VOR Reserve setzen; HELMUT_TENANT_LLM_CAP NICHT einschalten."
    }),
    Object.freeze({
      id: "riegel", titel: "Kommunikationsriegel scharf prüfen",
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
      id: "werte-pruefung", titel: "Wirksamkeit der acht Betreiberwerte prüfen",
      art: ART_LESEND,
      befehl: `${CLI_ABLAUF} werte (Sollwerte)  →  Betreibernachweis der gesetzten Vercel-Env (alle acht)`
        + "  →  /api/admin/overview (rein lesend; zeigt von den acht NUR HELMUT_MAX_LLM_CALLS_PER_DAY gesetzt/Wert)"
        + `  →  ${LOKAL} ${CLI_ZYKLUS} --stufe=a --konfiguration=<json> … (Startbereitschaft: prüft die `
        + "Sollwerte auf Konsistenz — Deckel > Verstehens-Reserve + Vorrangreserve — aus der LOKALEN Umgebung)",
      vorbedingungen: Object.freeze([V.WERTE, V.RIEGEL]),
      liefert: V.WERTE_GEPRUEFT,
      freigabe: null,
      abbruchkontrolle: "A10, A14",
      zweck: "Gesetzt heißt nicht wirksam. Vercel-Env ist aus keiner Sitzung lesbar. Rein lesend in "
        + "Production belegbar ist heute allein HELMUT_MAX_LLM_CALLS_PER_DAY (Whitelist von "
        + "/api/admin/overview). Verstehens-Reserve, Vorrangreserve, RPM/TPM, Kostenbudget, Parallelität "
        + "und Kommunikationsriegel sind nach dem Setzen BETREIBERANGABE: die Startbereitschaftshürden "
        + "(„LAUFENDE Umgebung“, „LAUFZEITWIRKSAM“) lesen das process.env des Prozesses, der sie rechnet — "
        + "lokal also die lokal gesetzten Werte, nicht Vercel. RPM/TPM liest ohnehin KEIN Ausführungspfad "
        + "(§23.4). Ohne diesen Beleg darf kein synthetisches Profil aktiviert werden: mit Vorrangreserve 0 "
        + "ist der Verdrängungsschutz der fünf realen Mandate NICHT wirksam (§25.2). Eine Erweiterung der "
        + "Overview-Whitelist um die drei Zahl-/Moduswerte wäre ein eigener, kleiner Code-PR."
    }),
    // ── STUFE A: Aktivierung, Fachzyklus, Kontrolle ──────────────────────────
    ...stufenSchritte(gruppeA, null).slice(2),
    // ── STUFE B und C: jeweils getrennt, erst nach kontrollierter Vorstufe ───
    ...stufenSchritte(gruppeB, V.KONTROLLE_A),
    ...stufenSchritte(gruppeC, V.KONTROLLE_B),
    // ── GEMEINSAME AUSWERTUNG ────────────────────────────────────────────────
    Object.freeze({
      id: "auswertung", titel: "Gemeinsame Auswertung aller Stufen (Laufbilanz, Drain-Bilanz, Kosten)",
      art: ART_LESEND,
      befehl: "lauf-bilanz.js · Drain-Bilanz im Gesundheitsbericht · Kostenrechnung",
      vorbedingungen: Object.freeze([V.KONTROLLE_C]),
      liefert: null,
      freigabe: null,
      abbruchkontrolle: "A03, A04, A07, A08",
      zweck: "Die Bilanz muss aufgehen. Geht sie nicht auf, wurde etwas anderes gezählt "
        + "als gearbeitet (A08). Die Stufenkontrollen sind damit nicht ersetzt — jede Stufe "
        + "bleibt einzeln bewertet."
    }),
    // ── RÜCKWÄRTS: NIE GESPERRT ──────────────────────────────────────────────
    Object.freeze({
      id: "deaktivierung", titel: "Synthetische Profile deaktivieren (erster Rückweg)",
      art: ART_PRODUCTION,
      befehl: `${CLI} deaktivierung --grundlinie=grundlinie.json --bestand=bestand.json`
        + "  →  Ausführung: node scripts/testkohorte-rueckbau.js --scharf",
      vorbedingungen: Object.freeze([]),   // BEWUSST LEER — siehe Kopfkommentar
      liefert: null,
      freigabe: flagUndWort(kohorte.FREIGABEWORTE.deaktivierung),
      abbruchkontrolle: null,
      immerErlaubt: true,
      zweck: "Kennt KEINEN Löschpfad (loeschtNichts:true) und wirkt ausschließlich auf die "
        + `${KOHORTE_GESAMT} Kohortenkennungen. Jederzeit erlaubt — ein Rückbau darf nie `
        + "an einer Vorbedingung scheitern. Der Ausführer liest jede Zeile NACH dem "
        + "Schreiben gegen und meldet nur, was die Ablage trägt; ein Fehlschlag an einer "
        + "Kennung beendet den Lauf NICHT (sonst bliebe der Rest aktiv), sondern wird "
        + "einzeln ausgewiesen. Der Lauf ist idempotent und wiederholbar. Er ist die "
        + "Notbremse und bleibt deshalb bewusst pauschal."
    }),
    Object.freeze({
      id: "rueckbau", titel: "Grundlinie bestätigen (4 Einzelbefunde)",
      art: ART_LESEND,
      befehl: `${CLI} rueckbau --stufe=<bis-stufe a|b|c> --grundlinie=grundlinie.json --bestand=bestand.json`
        + "  (ohne --stufe= verlangt der Beleg alle 495 gelesenen Zeilen)",
      vorbedingungen: Object.freeze([]),
      liefert: V.RUECKBAU,
      freigabe: null,
      abbruchkontrolle: "A09",
      immerErlaubt: true,
      zweck: "Keine aktive synthetische Zeile · Zahl der realen Mandate unverändert · "
        + "Zahl der AKTIVEN realen Mandate unverändert · keine neue Löschmarke an einem "
        + "realen Mandat. Stufenbewusst: nach Stufe A liegen 20 Zeilen vor, nicht 495 — "
        + "`--stufe=` nennt die zuletzt angelegte Stufe, sonst wäre der Rückweg nie bestätigbar."
    }),
    // ── NACHARBEIT: eigene Freigabe, nie Teil des Rückwegs ───────────────────
    Object.freeze({
      id: "scheduler-spur", titel: "Scheduler-Spur der Kohorte aufräumen (Nacharbeit)",
      art: ART_PRODUCTION,
      befehl: "node scripts/testkohorte-rueckbau.js --spur --scharf",
      // Erst nach bestätigtem Rückbau — vorher wäre es Aufräumen im Laufenden.
      vorbedingungen: Object.freeze([V.RUECKBAU]),
      liefert: null,
      freigabe: flagUndWort(kohorte.FREIGABEWORTE["scheduler-spur"]),
      abbruchkontrolle: null,
      immerErlaubt: false,
      zweck: "Der Fairnesszustand ist EINE helmut_store-Zeile, die je Mandatswechsel "
        + "vollständig gelesen und geschrieben wird. Das Deaktivieren lässt die Spur der "
        + `${KOHORTE_GESAMT} Kennungen dort 90 Tage stehen und verlangsamt danach jeden `
        + "Fairness-Schreibvorgang der fünf realen Mandate. Dieser Schritt entfernt "
        + "AUSSCHLIESSLICH Scheduler-Metadaten, niemals Profil-, Inhalts- oder Kontodaten, "
        + "und trägt ein EIGENES Bestätigungswort: das Wort des Rückwegs schaltet ihn nicht "
        + "scharf, und seines deaktiviert nichts."
    }),
    // ── OPTIONAL, ABER GETRENNT FREIGABEPFLICHTIG: der relationale Lesepfad ──
    // ERGÄNZT 02.09. (zweiter Reviewbefund, Anforderung 11): Die Abbruchregeln
    // A01/A06 sind über den reproduzierbaren Blob-Auswerter
    // (`scripts/funktionstest-500-nachweise.js`) HEUTE messbar — dafür braucht es
    // nichts weiter. Wer stattdessen den relationalen Lesepfad will, braucht ZWEI
    // getrennte Betreiberfreigaben, und die acht Betreiberwerte allein genügen
    // dafür ausdrücklich NICHT.
    Object.freeze({
      id: "migration-llm-usage",
      titel: "OPTIONAL: Migration 20260902121500 auf Production anwenden",
      art: ART_PRODUCTION,
      befehl: "supabase migration up (Betreiberentscheidung, CLAUDE.md §5)",
      vorbedingungen: Object.freeze([]),
      liefert: V.MIGRATION_LLM_USAGE,
      freigabe: Object.freeze({ art: "betreiber-einzelfreigabe", worte: null }),
      abbruchkontrolle: null,
      immerErlaubt: false,
      zweck: "Legt die Spalten für die relationale KI-Nutzungstelemetrie an. Rein additiv, "
        + "mit eigenem Rollback. NICHT nötig für den Testlauf: A01/A06 sind über den "
        + "Blob-Auswerter bereits reproduzierbar messbar. Diese Freigabe ist eine EIGENE "
        + "Entscheidung und in den acht Betreiberwerten NICHT enthalten."
    }),
    Object.freeze({
      id: "flag-llm-usage",
      titel: "OPTIONAL: HELMUT_LLM_USAGE_RELATIONAL einschalten",
      art: ART_UMGEBUNG,
      befehl: "Vercel → Environment Variables → HELMUT_LLM_USAGE_RELATIONAL=1",
      vorbedingungen: Object.freeze([V.MIGRATION_LLM_USAGE]),
      liefert: null,
      freigabe: Object.freeze({ art: "betreiber-einzelfreigabe", worte: null }),
      abbruchkontrolle: null,
      immerErlaubt: false,
      zweck: "Schaltet den Dual-Write ein. Wirkt nur ZUSAMMEN mit der angewendeten Migration "
        + "und `v3StoreReady()`. Zweite, von der Migration GETRENNTE Freigabe — eine "
        + "eingeschaltete Flagge ohne Tabelle wäre ein reiner No-Op mit Fehlerprotokoll."
    })
  ];
  // Die Nummer ist die Reihenfolge im Plan — nicht von Hand vergeben, damit ein
  // eingefügter Schritt keine falsche Nummer hinterlässt.
  return Object.freeze(roh.map((schritt, i) => Object.freeze({ nr: i + 1, ...schritt })));
}

// Welche Schritte haben einen echten Ausführer? Ein Schritt ohne Werkzeug ist
// ein Schritt, den niemand gehen kann — das wird ausgewiesen, nicht verschwiegen.
function ausfuehrer() {
  const je = {};
  for (const g of GRUPPEN) {
    const s = g.kennung;
    je[`provisionierung-${s}`] = `scripts/testkohorte-vorwaerts.js provisionierung --stufe=${s}`;
    je[`aktivierung-${s}`] = `scripts/testkohorte-vorwaerts.js aktivierung --gruppe=${s}`;
    je[`fachzyklus-${s}`] = `scripts/funktionstest-500-zyklus.js --stufe=${s}`;
  }
  je.deaktivierung = "scripts/testkohorte-rueckbau.js";
  je["scheduler-spur"] = "scripts/testkohorte-rueckbau.js --spur";
  je["migration-llm-usage"] = null;
  je["flag-llm-usage"] = null;
  return Object.freeze(je);
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
  const werkzeuge = ausfuehrer();
  const provisionierungsSchritte = liste.filter((s) => s.id.startsWith("provisionierung-")).map((s) => s.id);
  const aktivierungsSchritte = liste.filter((s) => s.id.startsWith("aktivierung-")).map((s) => s.id);
  return Object.freeze({
    schritte: Object.freeze(liste),
    naechsterSchritt: naechster ? naechster.id : null,
    productionSchritte: Object.freeze(productionSchritte.map((s) => s.id)),
    einzelfreigabenGesamt: productionSchritte.length + liste.filter((s) => s.art === ART_UMGEBUNG).length,
    gesperrt: Object.freeze(liste.filter((s) => !s.darfBeginnen).map((s) => s.id)),
    // ── DIE STUFUNG, MASCHINENLESBAR ────────────────────────────────────────
    stufenweise: true,
    stufen: Object.freeze(GRUPPEN.map((g) => Object.freeze({
      stufe: g.kennung,
      umfang: g.groesse,
      schritte: Object.freeze(liste.filter((s) => s.stufe === g.kennung).map((s) => s.id)),
      provisionierungswort: stufen.STUFEN_FREIGABEWORTE[g.kennung].provisionierung,
      aktivierungswort: kohorte.FREIGABEWORTE[`aktivierung-${g.kennung}`],
      fachzykluswort: stufen.STUFEN_FREIGABEWORTE[g.kennung].fachzyklus
    }))),
    provisionierungsSchritte: Object.freeze(provisionierungsSchritte),
    // Jede Vorbedingung des Plans wird von genau einem Schritt geliefert — oder
    // ist eine ausdrückliche Betreiberentscheidung. Eine Kennung, die niemand
    // liefert, könnte nur von Hand behauptet werden.
    nichtGelieferteVorbedingungen: Object.freeze([...new Set(liste.flatMap((s) => s.vorbedingungen))]
      .filter((v) => !liste.some((s) => s.liefert === v))),
    // Der Eintrag heißt weiter `blocker` und bleibt stehen, obwohl der Blocker
    // geschlossen ist: `offen: false` mit dem Beleg ist ehrlicher als ein
    // spurlos entfernter Punkt. `belegt` sagt, ob der Beleg im AKTUELLEN Zustand
    // vorliegt — der Schritt ist rein lesend, aber er muss gelaufen sein.
    blocker: Object.freeze({
      kohortenreife: Object.freeze({
        vorbedingung: V.KOHORTE_ANLEGBAR,
        offen: false,
        beleg: "Sicherheitsrahmen §34.7, Variante A (geschlossen 03.09.2026): Bundestagsprofile der "
          + "Kohorte tragen amtliche WP-21-Ausschüsse, Landtagsprofile synthetische. Die Reifesperre "
          + "lässt 20/20 der Stufe A und 495/495 der Kohorte zu — testgesichert durch "
          + "scripts/test-kohorte-500-test.js §11 und scripts/testkohorte-provisionierung-inaktiv-test.js A0.",
        belegt: erbracht.has(V.KOHORTE_ANLEGBAR)
      })
    }),
    keinSammelschritt: `Kein Schritt dieses Plans legt alle ${KOHORTE_GESAMT} Profile gemeinsam an. `
      + "Jede Stufe wird einzeln provisioniert, rein lesend geprüft, aktiviert, gefahren und kontrolliert.",
    // ── DIE BETREIBERWERTE: wann sie gebraucht werden, und wann nicht ───────
    betreiberwerte: Object.freeze({
      werte: betreiberwerteNamen(),
      vorbedingungVon: Object.freeze(aktivierungsSchritte),
      keineVorbedingungVon: Object.freeze([
        ...provisionierungsSchritte,
        ...liste.filter((s) => s.id.startsWith("isolation-")).map((s) => s.id)
      ]),
      hinweis: "Die acht Betreiberwerte und HELMUT_TESTLAUF_VORRANG_REAL müssen NICHT vor der rein "
        + "inaktiven Provisionierung gesetzt sein. Sie müssen aber zwingend gesetzt, wirksam und "
        + "geprüft sein, bevor auch nur das erste synthetische Profil aktiviert wird."
    }),
    // Der PLAN selbst führt nichts aus — er beschreibt. Das bleibt richtig und
    // ist keine Lücke. Für jeden Production-Schritt außer den beiden optionalen
    // existiert ein WERKZEUG, das ihn tatsächlich ausführen kann.
    ausfuehrbar: false,
    ausfuehrer: werkzeuge,
    ohneAusfuehrer: Object.freeze(Object.keys(werkzeuge).filter((k) => werkzeuge[k] === null)),
    hinweis: "Dieser Plan führt NICHTS aus. Jede Production-Aktion und jede "
      + "Umgebungsänderung bleibt eine eigene, ausdrückliche Betreiberfreigabe "
      + "(CLAUDE.md §5). Der scharfe Lauf ist im CLI bewusst nicht implementiert."
  });
}

// Alles, was der Betreiber vor der ersten Aktivierung wissen muss — an einer Stelle.
function vorbereitung() {
  return Object.freeze({
    betreiberwerte: kapazitaet.vorbereiteteBetreiberwerte(),
    zeitpunkt: Object.freeze({
      noetigVor: "aktivierung-a",
      nichtNoetigVor: "provisionierung-a",
      begruendung: "Ein inaktives Profil erzeugt keinen Warteschlangenauftrag, keine Verstehensarbeit, "
        + "keinen Modellaufruf und keine Außenkommunikation (verhaltensbelegt; die Anlage selbst "
        + "schreibt je Kennung Konto und Profil). Last entsteht erst mit der Aktivierung — und davor "
        + "müssen Deckel, Reserven, Vorrangreserve und Kommunikationsriegel wirksam sein."
    }),
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
  vorbedingungenDerStufe,
  schritte,
  ablaufplan,
  vorbereitung
};
