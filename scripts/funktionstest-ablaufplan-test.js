"use strict";

// Offline-Vertragstest des ABLAUFPLANS, der STUFENKONTROLLE, des RÜCKBAU-
// AUSFÜHRERS und der sicheren Startfenster.
//
// Vier Bereiche, die zusammen die Frage beantworten „ist der 500er-Funktionstest
// technisch vorbereitet — und bleibt er dabei gesperrt?":
//
//   A · ABLAUFPLAN          vorwärts gesperrt, rückwärts nie
//   B · SICHERE FENSTER     welches Zeitfenster ist überhaupt frei
//   C · STUFENKONTROLLE     die fünfzehn Regeln bekommen endlich Messwerte
//   D · RÜCKBAU-AUSFÜHRER   der Rückweg existiert, ist verriegelt und idempotent
//
// Kein Netz, keine Datenbank, kein Modellaufruf, keine Aktivierung.

const fs = require("fs");
const path = require("path");
const A = require("../lib/helmut/funktionstest-ablaufplan");
const F = require("../lib/helmut/funktionstest-500");
const K = require("../lib/helmut/funktionstest-kontrolle");
const RB = require("../lib/helmut/testkohorte-rueckbau");
const kapazitaet = require("../lib/helmut/kapazitaet-500");
const M = require("../lib/helmut/mandatsklasse");

const ROOT = path.join(__dirname, "..");
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const VOLLE_GRENZEN = Object.freeze({
  maxFehlerquote: 0.05,
  kostenbudgetUsd: 10,
  maxLaufzeitMinuten: 240,
  maxRueckstandWachstum: 200,
  erwarteterCommit: "881739da0f8f06184a1bdf7dd86895d896cf0336",
  mindestVerarbeiteteVorgaenge: 50
});

const VOLLE_QUELLEN = Object.freeze({
  warteschlange: { haengendeLeases: 0, dubletten: 0 },
  kosten: { aufrufeHeute: 800, preisJeAufrufUsd: 0.002941 },
  // ANGEPASST 02.09. (adversariales Diff-Review, bestätigter Befund): Die
  // Beobachtungen entstehen nur noch, wenn der Aufrufer die Quelle ausdrücklich
  // als tragfähig erklärt. `public.llm_usage` ist in Phase 2 garantiert LEER —
  // eine gemessene 0 gegen eine leere Tabelle war falsches Grün.
  modellaufrufe: { auswertbar: true, quelle: "blob:test", unbekannteModellaufrufe: 0, drosselungen: 0 },
  realeMandate: { gesamt: 9, aktiv: 5, geloescht: 0 },
  grundlinie: { realeMandate: 9, realeMandateAktiv: 5, realeMandateGeloescht: 0 },
  laufbilanz: { verarbeitet: 240, fehlgeschlagen: 2, vollstaendig: true },
  drain: { rueckstandWachstum: 10 },
  // Der Riegel führt keinen persistenten Zähler; die Zahl muss ausgezählt und
  // ausdrücklich als solche übergeben werden, sonst bleibt A10 unbewertbar.
  // `vollstaendig: true` ist Pflicht — eine halbe Erhebung darf A10 nicht grün
  // setzen (dritter Reviewbefund).
  riegel: { auswertbar: true, vollstaendig: true, quelle: "blob:test", kommunikationsversuche: 0 },
  deployment: { githubCommitSha: "881739da0f8f06184a1bdf7dd86895d896cf0336" },
  // Ein Fensterbefund ohne `gepruefteCrons` gilt als ungeprüft und erzeugt
  // keine Zahl — ein unbewertbares Fenster war zuvor eine gemessene 0.
  startfenster: { startErlaubt: true, konflikte: [], gepruefteCrons: 13 },
  tagesplan: {
    klassen: { real: 5, synthetisch: 495, gemischt: true, realeVollstaendigBedient: true },
    // Alle fünf realen Mandate müssen in der Zuteilung stehen — fehlende gelten
    // seit dem Diff-Review als verdrängt (totale Verdrängung war zuvor „0").
    zuteilung: {
      "mandat-a": { notwendig: 1 }, "mandat-b": { notwendig: 1 }, "mandat-c": { notwendig: 1 },
      "mandat-d": { notwendig: 1 }, "mandat-e": { notwendig: 1 },
      "test-kohorte-a-001": { notwendig: 0 }
    }
  },
  laufzeitMinuten: 120
});

async function main() {
  console.log("Helmut — Vertragstest von Ablaufplan, Stufenkontrolle und Rückbau\n");

  // ── A · Ablaufplan ────────────────────────────────────────────────────────
  console.log("A · Ablaufplan: vorwärts gesperrt, rückwärts nie");
  const leer = A.ablaufplan({ belegt: [] });
  check("A1 Der Plan führt nichts aus",
    leer.ausfuehrbar === false && /führt NICHTS aus/.test(leer.hinweis));
  check("A2 Jede Production-Aktion und jede Umgebungsänderung ist eine EIGENE Freigabe",
    leer.einzelfreigabenGesamt >= 7
      && leer.schritte.filter((s) => s.art === A.ART_PRODUCTION).every((s) => s.freigabe !== null));
  check("A3 Ohne Vorbedingungen darf nur die Grundlinienerhebung beginnen",
    leer.naechsterSchritt === "grundlinie");
  // VERSCHÄRFT 02.09. (zweiter Reviewbefund): Die Provisionierung braucht jetzt
  // zusätzlich das geprüfte STARTFENSTER — sie ist eine Production-Datenänderung,
  // und der Ausführer verlangt es zur Laufzeit ohnehin. Der Plan sagte das vorher
  // nicht, obwohl es galt.
  // UMGEBAUT 03.09.: Der Plan kennt keinen Sammelschritt „provisionierung" mehr.
  // Jede Stufe wird EINZELN angelegt (provisionierung-a/-b/-c). Die Sperre gilt
  // je Stufe — und die Betreiberwerte sind ausdrücklich KEINE Vorbedingung der
  // inaktiven Anlage (dafür A19–A31 unten).
  const VB = A.VORBEDINGUNGEN;
  check("A4 Die Anlage der Stufe A ist gesperrt, bis Grundlinie, Sicherung UND Fenster vorliegen",
    leer.gesperrt.includes("provisionierung-a")
      && A.ablaufplan({ belegt: [VB.GRUNDLINIE] }).gesperrt.includes("provisionierung-a")
      && A.ablaufplan({ belegt: [VB.GRUNDLINIE, VB.SICHERUNG] }).gesperrt.includes("provisionierung-a")
      && !A.ablaufplan({
        belegt: [VB.GRUNDLINIE, VB.SICHERUNG, VB.FENSTER]
      }).gesperrt.includes("provisionierung-a"));
  check("A4a Die Anlage der Stufen B und C bleibt dabei gesperrt (erst nach kontrollierter Vorstufe)",
    (() => {
      const p = A.ablaufplan({ belegt: [VB.GRUNDLINIE, VB.SICHERUNG, VB.FENSTER] });
      return p.gesperrt.includes("provisionierung-b") && p.gesperrt.includes("provisionierung-c");
    })());
  check("A5 Der Stufenvertrag steht auch im Plan: B braucht die Kontrolle nach A — für Anlage UND Aktivierung",
    (() => {
      const nurAktivA = A.ablaufplan({ belegt: [VB.GRUNDLINIE, VB.SICHERUNG, VB.FENSTER, VB.GRUPPE_A] });
      const nachKontrolleA = A.ablaufplan({ belegt: [VB.GRUNDLINIE, VB.SICHERUNG, VB.FENSTER, VB.KONTROLLE_A] });
      return nurAktivA.gesperrt.includes("provisionierung-b")
        && nurAktivA.gesperrt.includes("aktivierung-b")
        && !nachKontrolleA.gesperrt.includes("provisionierung-b")
        // Die Aktivierung der Stufe B braucht zusätzlich Isolation B, Werte, Prüfung, Riegel.
        && nachKontrolleA.gesperrt.includes("aktivierung-b")
        && !A.ablaufplan({
          belegt: [VB.GRUNDLINIE, VB.SICHERUNG, VB.FENSTER, VB.KONTROLLE_A,
            VB.ISOLATION_B, VB.WERTE, VB.WERTE_GEPRUEFT, VB.RIEGEL]
        }).gesperrt.includes("aktivierung-b");
    })());
  check("A6 Der RÜCKWEG ist in JEDEM Zustand erlaubt",
    ["deaktivierung", "rueckbau"].every((id) => {
      const s = leer.schritte.find((x) => x.id === id);
      return s && s.darfBeginnen === true && s.immerErlaubt === true;
    }), "ein Rückbau darf nie an einer Vorbedingung scheitern");
  check("A7 Die Deaktivierung braucht dennoch ihre eigene Freigabe",
    (() => {
      const s = leer.schritte.find((x) => x.id === "deaktivierung");
      return s.freigabe && s.freigabe.wort === "TESTKOHORTE_495_DEAKTIVIEREN_BESTAETIGT";
    })());
  // ERGÄNZT 02.09.: die Nacharbeit an der Scheduler-Spur ist Schritt 18 und
  // hängt hinter dem bestätigten Rückbau — aber sie ist NICHT Teil des
  // Rückwegs (der bleibt in jedem Zustand sofort erlaubt).
  check("A7a Die Nacharbeit an der Scheduler-Spur ist ein eigener, gesperrter Schritt",
    (() => {
      const spur = A.ablaufplan({ belegt: [] }).schritte.find((x) => x.id === "scheduler-spur");
      const rueckbau = A.ablaufplan({ belegt: [] }).schritte.find((x) => x.id === "rueckbau");
      return Boolean(spur) && Boolean(rueckbau)
        && spur.nr > rueckbau.nr
        && spur.immerErlaubt === false
        && spur.darfBeginnen === false
        && spur.vorbedingungen.includes("rueckbau")
        && spur.freigabe && spur.freigabe.wort === "TESTKOHORTE_495_SCHEDULERSPUR_ENTFERNEN_BESTAETIGT";
    })());
  check("A7b Der Rückweg bleibt davon unberührt sofort erlaubt",
    (() => {
      const weg = A.ablaufplan({ belegt: [] }).schritte.find((x) => x.id === "deaktivierung");
      return Boolean(weg) && weg.immerErlaubt === true;
    })());
  check("A8 Jede Stufe trägt ein EIGENES Bestätigungswort",
    (() => {
      const worte = leer.schritte
        .filter((s) => s.freigabe && s.freigabe.wort)
        .map((s) => s.freigabe.wort);
      return worte.length >= 5 && new Set(worte).size === worte.length;
    })());
  check("A9 Kein realer Mandats-Slug im Ablaufplan",
    !/m5-[0-9a-f]{8}/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/funktionstest-ablaufplan.js"), "utf8")));

  // ── A19–A31 · STUFENWEISE PROVISIONIERUNG (Umbau 03.09.) ─────────────────
  // BEFUND: Der Plan beschrieb „495 Profile INAKTIV provisionieren" als EINEN
  // Schritt, obwohl die Bibliothek stufengenau anlegen konnte und das CLI die
  // Stufe gar nicht durchreichte. Der maschinenlesbare Plan darf nicht länger
  // behaupten, der nächste Provisionierungsschritt lege alle 495 gemeinsam an.
  console.log("\nA19–A31 · Der Plan ist stufenweise, nicht gesamt");
  const S = require("../lib/helmut/testkohorte-stufen");
  const schrittNr = (plan, id) => { const s = plan.schritte.find((x) => x.id === id); return s ? s.nr : null; };
  check("A19 Es gibt KEINEN Sammelschritt, der alle 495 gemeinsam anlegt",
    !leer.schritte.some((s) => s.id === "provisionierung")
      && leer.stufenweise === true
      && JSON.stringify(leer.provisionierungsSchritte) === JSON.stringify(["provisionierung-a", "provisionierung-b", "provisionierung-c"])
      && !leer.schritte.some((s) => s.art === A.ART_PRODUCTION && /\b495 Profile\b/.test(s.titel))
      && /Kein Schritt dieses Plans legt alle 495/.test(leer.keinSammelschritt));
  check("A20 Jede Anlage zielt auf ihre Stufe: 20 / 75 / 400 mit dem stufengenauen Wort",
    ["a", "b", "c"].every((st) => {
      const s = leer.schritte.find((x) => x.id === `provisionierung-${st}`);
      return s && s.stufe === st
        && new RegExp(`\\b${S.STUFEN_UMFANG[st]} Profile\\b`).test(s.titel)
        && s.freigabe.wort === S.STUFEN_FREIGABEWORTE[st].provisionierung
        && s.freigabe.wort !== "TESTKOHORTE_495_ANLEGEN_BESTAETIGT"
        && s.befehl.includes(`--stufe=${st}`);
    }));
  check("A21 Die inaktive Anlage braucht die Betreiberwerte NICHT (keine Vorbedingung)",
    (() => {
      const p = A.ablaufplan({ belegt: [VB.GRUNDLINIE, VB.SICHERUNG, VB.FENSTER] });
      const anlage = p.schritte.find((x) => x.id === "provisionierung-a");
      return anlage.darfBeginnen === true
        && !anlage.vorbedingungen.includes(VB.WERTE)
        && !anlage.vorbedingungen.includes(VB.WERTE_GEPRUEFT)
        && !anlage.vorbedingungen.includes(VB.RIEGEL)
        && p.betreiberwerte.keineVorbedingungVon.includes("provisionierung-a")
        && p.betreiberwerte.keineVorbedingungVon.includes("isolation-a");
    })());
  check("A22 Die Aktivierung der Stufe A verlangt gesetzte UND wirksam geprüfte Betreiberwerte",
    (() => {
      const basis = [VB.ISOLATION_A, VB.RIEGEL, VB.FENSTER];
      const ohneWerte = A.ablaufplan({ belegt: basis });
      const nurGesetzt = A.ablaufplan({ belegt: [...basis, VB.WERTE] });
      const gesetztUndGeprueft = A.ablaufplan({ belegt: [...basis, VB.WERTE, VB.WERTE_GEPRUEFT] });
      return ohneWerte.gesperrt.includes("aktivierung-a")
        && nurGesetzt.gesperrt.includes("aktivierung-a")
        && !gesetztUndGeprueft.gesperrt.includes("aktivierung-a")
        && JSON.stringify(leer.betreiberwerte.vorbedingungVon) === JSON.stringify(["aktivierung-a", "aktivierung-b", "aktivierung-c"]);
    })());
  check("A23 Die Isolationsprüfung der Stufe A ist rein lesend, stufenbewusst und braucht die angelegte Stufe",
    (() => {
      const s = leer.schritte.find((x) => x.id === "isolation-a");
      return s && s.art === A.ART_LESEND && s.freigabe === null
        && s.befehl.includes("isolation --stufe=a")
        && JSON.stringify(s.vorbedingungen) === JSON.stringify([VB.STUFE_A_ANGELEGT])
        && s.liefert === VB.ISOLATION_A
        && /INAKTIV/.test(s.zweck);
    })());
  check("A24 Die Reihenfolge: Anlage A → Isolation A → Werte → Prüfung → Aktivierung A → Zyklus A → Kontrolle A → Anlage B … → Anlage C",
    (() => {
      const folge = ["provisionierung-a", "isolation-a", "betreiberwerte", "riegel", "werte-pruefung",
        "aktivierung-a", "fachzyklus-a", "kontrolle-a", "provisionierung-b", "isolation-b", "aktivierung-b",
        "fachzyklus-b", "kontrolle-b", "provisionierung-c", "isolation-c", "aktivierung-c", "fachzyklus-c",
        "kontrolle-c", "auswertung"];
      const nrs = folge.map((id) => schrittNr(leer, id));
      return nrs.every((n) => Number.isInteger(n)) && nrs.every((n, i) => i === 0 || n > nrs[i - 1]);
    })());
  check("A25 Der Fachzyklus ist je Stufe getrennt und trägt das stufengenaue Wort — kein pauschaler Fachzyklus mehr",
    !leer.schritte.some((s) => s.id === "fachzyklus")
      && ["a", "b", "c"].every((st) => {
        const s = leer.schritte.find((x) => x.id === `fachzyklus-${st}`);
        return s && s.art === A.ART_PRODUCTION
          && s.freigabe.wort === S.STUFEN_FREIGABEWORTE[st].fachzyklus
          && s.befehl.includes(`--stufe=${st}`)
          && JSON.stringify(s.vorbedingungen) === JSON.stringify([VB[`GRUPPE_${st.toUpperCase()}`]]);
      }));
  check("A26 Der nächste Schritt wandert stufenweise durch den Plan",
    A.ablaufplan({ belegt: [VB.GRUNDLINIE] }).naechsterSchritt === "sicherung"
      && A.ablaufplan({ belegt: [VB.GRUNDLINIE, VB.SICHERUNG] }).naechsterSchritt === "startfenster"
      && A.ablaufplan({ belegt: [VB.GRUNDLINIE, VB.SICHERUNG, VB.FENSTER] }).naechsterSchritt === "provisionierung-a"
      && A.ablaufplan({ belegt: [VB.GRUNDLINIE, VB.SICHERUNG, VB.FENSTER, VB.STUFE_A_ANGELEGT] }).naechsterSchritt === "isolation-a"
      && A.ablaufplan({ belegt: [VB.GRUNDLINIE, VB.SICHERUNG, VB.FENSTER, VB.STUFE_A_ANGELEGT, VB.ISOLATION_A] }).naechsterSchritt === "betreiberwerte");
  check("A27 Jeder Provisionierungsschritt hat einen stufengenauen Ausführer; ein Sammelausführer existiert nicht",
    ["a", "b", "c"].every((st) => String(leer.ausfuehrer[`provisionierung-${st}`]).includes(`--stufe=${st}`))
      && !("provisionierung" in leer.ausfuehrer)
      && !("fachzyklus" in leer.ausfuehrer));
  check("A28 Der Plan sagt ausdrücklich, WANN die Betreiberwerte gebraucht werden",
    /NICHT vor der rein inaktiven Provisionierung/.test(leer.betreiberwerte.hinweis)
      && /bevor auch nur das erste synthetische Profil aktiviert wird/.test(leer.betreiberwerte.hinweis)
      && A.vorbereitung().zeitpunkt.noetigVor === "aktivierung-a"
      && A.vorbereitung().zeitpunkt.nichtNoetigVor === "provisionierung-a");
  check("A29 Die acht Betreiberwerte umfassen Deckel, Verstehens-Reserve, Vorrangreserve und Kommunikationsriegel",
    leer.betreiberwerte.werte.length === 8
      && ["HELMUT_MAX_LLM_CALLS_PER_DAY", "HELMUT_LLM_RESERVE_UNDERSTANDING",
        "HELMUT_TESTLAUF_VORRANG_REAL", "HELMUT_TESTLAUF_KOMMUNIKATION"]
        .every((n) => leer.betreiberwerte.werte.includes(n)));
  check("A30 Der Aktivierungsbefehl nennt kein handgetipptes --vorstufen-vollstaendig mehr (Plan = CLI)",
    leer.schritte.filter((s) => s.id.startsWith("aktivierung-"))
      .every((s) => !/vorstufen-vollstaendig/.test(s.befehl) && /--grundlinie=/.test(s.befehl) && /--bestand=/.test(s.befehl)));
  check("A31 Die Wirksamkeitsprüfung der Werte ist ein eigener, rein lesender Schritt vor der Aktivierung",
    (() => {
      const s = leer.schritte.find((x) => x.id === "werte-pruefung");
      return s && s.art === A.ART_LESEND && s.liefert === VB.WERTE_GEPRUEFT
        && s.vorbedingungen.includes(VB.WERTE) && s.vorbedingungen.includes(VB.RIEGEL)
        && /LAUFZEITWIRKSAM/.test(s.befehl) && /Vorrangreserve 0/.test(s.zweck)
        && schrittNr(leer, "werte-pruefung") < schrittNr(leer, "aktivierung-a");
    })());

  // Die vorbereiteten Werte — dokumentiert, nicht gesetzt.
  const vorbereitung = A.vorbereitung();
  check("A10 Die Betreiberwerte sind ausdrücklich NICHT gesetzt",
    vorbereitung.betreiberwerte.gesetzt === false);
  check("A11 Deckel 2.416 und Verstehens-Reserve 702 stehen als Vorschlag mit Herkunft",
    (() => {
      const w = vorbereitung.betreiberwerte.werte;
      const deckel = w.find((x) => x.env === "HELMUT_MAX_LLM_CALLS_PER_DAY");
      const reserve = w.find((x) => x.env === "HELMUT_LLM_RESERVE_UNDERSTANDING");
      return deckel.wert === 2416 && reserve.wert === 702
        && reserve.wert < deckel.wert && /IM Deckel/.test(reserve.herkunft);
    })());
  check("A12 Die Vorrangreserve ist 200 und deckt den gemessenen Bedarf 170",
    (() => {
      const v = vorbereitung.betreiberwerte.werte.find((x) => x.env === M.VORRANG_REAL_ENV);
      return v.wert === M.VORRANG_REAL_EMPFEHLUNG && v.wert >= M.VORRANG_REAL_MESSBEDARF_P95;
    })());
  // KORRIGIERT 02.09. (adversarialer Review, bestätigter Befund): die
  // Deploymentgrenze 250 RPM ist NICHT der zu setzende Testwert. Bei gemessenen
  // 3.018 Token je Aufruf ergäben 250 Anfragen/Minute 754.500 Token/Minute — das
  // Dreifache der TPM-Grenze. Bindend ist die kleinere der beiden Grenzen.
  check("A13 Die Minutengrenze ist der WIRKSAME Wert, nicht die Deploymentgrenze",
    (() => {
      const w = vorbereitung.betreiberwerte.werte;
      const rpm = w.find((x) => x.env === "HELMUT_TESTLAUF_MAX_RPM");
      const tpm = w.find((x) => x.env === "HELMUT_TESTLAUF_MAX_TPM");
      const wirksam = kapazitaet.wirksameRpm();
      return rpm.wert === wirksam.wirksam && rpm.wert === 82 && rpm.wert < 250
        && tpm.wert === 250000
        && wirksam.bindend === "tpm"
        && /Gesamtkontingent/i.test(rpm.offen) && /Gesamtkontingent/i.test(tpm.offen);
    })(), "250 RPM × 3.018 Token = 754.500 TPM — das Dreifache der TPM-Grenze");
  check("A13a Die Erreichbarkeit des Deckels bei Parallelität 1 ist ausgewiesen",
    vorbereitung.betreiberwerte.erreichbarkeit
      && vorbereitung.betreiberwerte.erreichbarkeit.mindestLaufzeitMinutenBeiParallel1 === 367,
    "367 Minuten reine Laufzeit — MEHR als das längste sichere Tagesfenster (263 min); "
    + "ein voll ausgeschöpfter Deckel endet an A05, nicht am Deckel");

  // Kostenabbruchgrenze
  const kosten = kapazitaet.kostenabbruchgrenze();
  check("A14 Die Kostenrechnung stimmt mit den gemessenen Werten überein",
    kosten.erwartungUsdProTag === 7.11 && kosten.obereSchrankeUsdProTag === 8.11
      && kosten.monatErwartungUsd === 213 && kosten.monatObereSchrankeUsd === 243,
    `${kosten.erwartungUsdProTag} USD/Tag, ${kosten.monatErwartungUsd} USD/Monat`);
  check("A15 Die harte Abbruchgrenze liegt ÜBER der oberen Schranke",
    kosten.empfehlungUsd > kosten.obereSchrankeUsdProTag && kosten.empfehlungUsd === 10);
  check("A16 Die Preisbasis wird ehrlich als Listenpreis benannt (F7 offen)",
    /Listenpreis/.test(kosten.preisbasis) && /kein nachgewiesener Kontopreis/i.test(kosten.preisbasis));
  check("A17 Die belegten Messungen sind hinterlegt — das Azure-Gesamtkontingent NICHT",
    kapazitaet.BELEGTE_MESSUNGEN["p95-tagesbedarf-verstehen"].belegt === true
      && kapazitaet.BELEGTE_MESSUNGEN["p95-tagesbedarf-verstehen"].wert === 82
      && kapazitaet.BELEGTE_MESSUNGEN["azure-kontingente-und-rate-limits"].belegt === false);
  check("A18 zielDeckel() führt die offenen Messungen UNVERÄNDERT weiter",
    kapazitaet.zielDeckel().offeneMessungen.length === 5,
    "der Betreiber trägt sie weiterhin ausdrücklich bei — nichts wird still als erledigt gewertet");

  // ── B · Sichere Startfenster ──────────────────────────────────────────────
  console.log("\nB · Sichere Startfenster (das 05:45/05:48-Risiko)");
  const fenster = F.sichereStartfenster({ crons: VERCEL.crons, mindestDauerMinuten: 60 });
  check("B1 Es gibt überhaupt sichere Fenster",
    fenster.fenster.length > 0 && fenster.empfehlung !== null);
  check("B2 KEIN Kandidat berührt den Morgenblock 05:30–08:30 UTC",
    fenster.fenster.every((f) => {
      const [h, m] = f.startUtc.split(":").map(Number);
      const start = h * 60 + m;
      const ende = start + f.dauerMinuten;
      return !(start < 8 * 60 + 30 && ende > 5 * 60 + 30);
    }), "Lage-Briefing 05:45 + Actions-Watchdog (2–3 h Verzug)");
  check("B3 Jeder Kandidat besteht die VERBINDLICHE Prüfung",
    fenster.fenster.every((f) => f.bestaetigt === true && f.konflikte.length === 0));
  check("B4 Die betriebliche Empfehlung liegt in der Arbeitszeit",
    fenster.empfehlungTagsueber !== null && fenster.empfehlungTagsueber.tagsueber === true
      && fenster.empfehlungTagsueber.startUtc === "11:36"
      && fenster.empfehlungTagsueber.dauerMinuten === 263,
    `${fenster.empfehlungTagsueber.startUtc}–${fenster.empfehlungTagsueber.endeUtc} UTC `
    + `(${fenster.empfehlungTagsueber.dauerMinuten} min)`);
  check("B5 Der Block über Mitternacht wird als EIN Block geführt",
    fenster.fenster.some((f) => f.ueberMitternacht === true && f.dauerMinuten > 300),
    "sonst meldete die Ausgabe zwei kürzere Blöcke, die es so nicht gibt");
  check("B6 Eine FEHLENDE Cronliste gilt nie als freier Tag (fail closed)",
    F.pruefeStartfenster({ startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30 })
      .konflikte.some((k) => k.art === "cronliste-fehlt"));
  check("B7 Die verbindliche Prüfung kennt die Watchdogspanne",
    F.pruefeStartfenster({
      startUtc: "2026-09-10T07:00:00Z", dauerMinuten: 30, crons: VERCEL.crons, watchdogBeruecksichtigen: true
    }).konflikte.some((k) => k.art === "actions-watchdog-vorsichtsspanne"));
  check("B8 startbereitschaft schaltet sie standardmäßig EIN",
    F.startbereitschaft({
      startfenster: { startUtc: "2026-09-10T07:00:00Z", dauerMinuten: 30, crons: VERCEL.crons }
    }).startfenster.konflikte.some((k) => k.art === "actions-watchdog-vorsichtsspanne"));
  check("B9 Der 05:45/05:48-Nachweis wird STRIKT als true verlangt",
    ["ja", 1, {}, "offen"].every((wert) => F.pruefeStartfenster({
      startUtc: "2026-09-10T05:46:00Z", dauerMinuten: 10, crons: VERCEL.crons,
      ueberschneidung0545Belegt: wert
    }).konflikte.some((k) => k.art === "offene-laufzeitueberschneidung-0545-0548")),
    "jeder truthy Wert hätte die einzige unbedingte Sperre aufgehoben");
  check("B10 Die Laufzeitgrenze muss in das geprüfte Fenster passen",
    F.startbereitschaft({
      grenzen: { ...VOLLE_GRENZEN, maxLaufzeitMinuten: 240 },
      startfenster: { startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30, crons: VERCEL.crons }
    }).offen.some((n) => /Laufzeitgrenze/.test(n)));
  check("B11 Die Watchdogzeit stimmt mit dem Actions-Workflow überein",
    (() => {
      const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/briefing-watchdog.yml"), "utf8");
      const treffer = yml.match(/cron:\s*["']?(\d+)\s+(\d+)\s+\*\s+\*\s+\*/);
      if (!treffer) return false;
      return Number(treffer[2]) * 60 + Number(treffer[1]) === F.WATCHDOG_START_MINUTE_UTC;
    })(), "sonst wäre die Sperrzeit eine Behauptung");

  // ── C · Stufenkontrolle ───────────────────────────────────────────────────
  console.log("\nC · Stufenkontrolle: die Regeln bekommen Messwerte");
  const ohneMesswerte = K.kontrolliere({ stufe: "a", grenzen: VOLLE_GRENZEN });
  check("C1 Ohne Messwerte ist KEINE Stufe bestanden",
    ohneMesswerte.bestanden === false && ohneMesswerte.fehlendeMesswerte.length === 15);
  check("C2 Jeder fehlende Messwert nennt seine Herkunft",
    ohneMesswerte.herkunftFehlender.every((h) => h.quelle && h.quelle !== "unbekannt"));
  const bestanden = K.kontrolliere({ stufe: "a", quellen: VOLLE_QUELLEN, grenzen: VOLLE_GRENZEN });
  check("C3 Mit vollständigen Messwerten ist die Stufe bestanden",
    bestanden.bestanden === true, bestanden.meldung);
  check("C4 Die Kosten entstehen aus Aufrufen × bestätigtem Preis",
    bestanden.beobachtungen.kostenBisherUsd === Math.round(800 * 0.002941 * 1000000) / 1000000);
  check("C5 OHNE bestätigten Preis gibt es KEINE Kostenzahl (nicht 0)",
    (() => {
      const b = K.baueBeobachtungen({ kosten: { aufrufeHeute: 800 } });
      return !Object.prototype.hasOwnProperty.call(b, "kostenBisherUsd");
    })(), "eine Kostenkontrolle ohne Preisbasis wäre eine Rechnung ohne Rechnung");
  check("C6 Eine LEERE Bilanz ist nicht grün (A15)",
    (() => {
      const leerB = K.kontrolliere({
        stufe: "a",
        quellen: { ...VOLLE_QUELLEN, laufbilanz: { verarbeitet: 0, fehlgeschlagen: 0, vollstaendig: true } },
        grenzen: VOLLE_GRENZEN
      });
      return leerB.bestanden === false && leerB.ausgeloest.includes("A15");
    })());
  check("C7 Eine Dublette bricht die Stufe (A13)",
    K.kontrolliere({
      stufe: "a",
      quellen: { ...VOLLE_QUELLEN, warteschlange: { haengendeLeases: 0, dubletten: 1 } },
      grenzen: VOLLE_GRENZEN
    }).ausgeloest.includes("A13"));
  check("C8 Ein verdrängtes reales Mandat bricht die Stufe (A14)",
    K.kontrolliere({
      stufe: "a",
      quellen: {
        ...VOLLE_QUELLEN,
        tagesplan: {
          klassen: { real: 2, synthetisch: 495, gemischt: true, realeVollstaendigBedient: false },
          zuteilung: { "mandat-a": { notwendig: 1 }, "mandat-b": { notwendig: 0 } }
        }
      },
      grenzen: VOLLE_GRENZEN
    }).ausgeloest.includes("A14"));
  check("C9 Eine Veränderung an einem realen Mandat bricht die Stufe (A09)",
    K.kontrolliere({
      stufe: "a",
      quellen: { ...VOLLE_QUELLEN, realeMandate: { gesamt: 9, aktiv: 4, geloescht: 0 } },
      grenzen: VOLLE_GRENZEN
    }).ausgeloest.includes("A09"));
  check("C10 Das Erhebungs-SQL ist rein lesend",
    (() => {
      const sql = K.erhebungsSql({ seitIso: "2026-09-10T11:36:00Z" });
      return !/\b(insert|update|delete|drop|alter|truncate)\b/i.test(sql)
        && (sql.match(/^select/gim) || []).length >= 4;
    })());
  check("C11 Das SQL nutzt die kanonischen Spalten der Warteschlange",
    /lease_expires_at/.test(K.erhebungsSql()) && /status = 'laeuft'/.test(K.erhebungsSql()));

  // ── D · Rückbau-Ausführer ─────────────────────────────────────────────────
  console.log("\nD · Rückbau: der Rückweg existiert, ist verriegelt und idempotent");
  const trocken = await RB.fuehreRueckbauAus({ env: {} });
  check("D1 Ohne Freigabe ist es ein Trockenlauf, der nichts schreibt",
    trocken.modus === RB.MODUS_TROCKENLAUF && trocken.zielGroesse === 495
      && trocken.deaktiviert === 0);
  check("D2 Auch ein ausdrücklich scharf gewünschter Lauf fällt ohne Freigabe zurück",
    (await RB.fuehreRueckbauAus({ modus: RB.MODUS_SCHARF, env: {} })).modus === RB.MODUS_TROCKENLAUF);
  check("D3 Es gibt keinen Löschpfad",
    (() => {
      // Kommentare gehören nicht zum Code — geprüft wird der ausführbare Teil.
      const code = fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-rueckbau.js"), "utf8")
        .replace(/\/\/.*$/gm, "");
      return trocken.loeschtNichts === true
        && !/\bdelete\b/i.test(code)
        && !/teardown/i.test(code)
        && !/geloescht_at/i.test(code);
    })());

  // ── D-Spur · Nacharbeit: die Scheduler-Spur (adversariale Analyse 02.09.) ──
  // BEFUND: Der Rückweg deaktiviert, aber die Spur der 495 Kennungen bleibt in
  // der EINEN Fairness-Zeile stehen — dort 90 Tage lang, und sie verlangsamt
  // danach JEDEN Fairness-Schreibvorgang der fünf realen Mandate.
  {
    const trockenSpur = await RB.entferneSchedulerSpur({ env: {} });
    check("DS1 Ohne Freigabe räumt die Nacharbeit nichts auf",
      trockenSpur.modus === RB.MODUS_TROCKENLAUF
        && trockenSpur.entfernt === 0
        && trockenSpur.zielGroesse === 495);
    check("DS2 Die Nacharbeit rührt ausdrücklich keine Profildaten an",
      trockenSpur.beruehrtProfildaten === false && trockenSpur.realeMandateBeruehrt === 0);
    check("DS3 Das Wort des Rückwegs schaltet die Nacharbeit NICHT scharf",
      (await RB.entferneSchedulerSpur({
        modus: RB.MODUS_SCHARF,
        env: { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT }
      })).modus === RB.MODUS_TROCKENLAUF);
    const spurEnv = { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT_SPUR };
    const beruehrt = [];
    const scharfSpur = await RB.entferneSchedulerSpur({
      kennungen: ["test-kohorte-a-001", "test-kohorte-a-002"],
      modus: RB.MODUS_SCHARF,
      env: spurEnv,
      deps: { entferneSpur: async (id) => { beruehrt.push(id); return { ok: true }; } }
    });
    check("DS4 Mit eigenem Wort läuft sie scharf und meldet nur Bestätigtes",
      scharfSpur.modus === RB.MODUS_SCHARF
        && scharfSpur.entfernt === 2 && scharfSpur.fehlgeschlagen === 0
        && scharfSpur.ok === true && beruehrt.length === 2);
    const halb = await RB.entferneSchedulerSpur({
      kennungen: ["test-kohorte-a-001", "test-kohorte-a-002"],
      modus: RB.MODUS_SCHARF, env: spurEnv,
      deps: { entferneSpur: async (id) => (id.endsWith("001") ? { ok: true } : { ok: false, grund: "rpc-fehlt" }) }
    });
    check("DS5 Ein Fehlschlag beendet den Lauf nicht, macht ihn aber nicht grün",
      halb.entfernt === 1 && halb.fehlgeschlagen === 1 && halb.ok === false
        && halb.ergebnisse.some((e) => e.fehler === "rpc-fehlt"));
    let abgebrochen = false;
    try {
      await RB.entferneSchedulerSpur({
        kennungen: ["test-kohorte-a-001", "fremdes-reales-mandat"],
        modus: RB.MODUS_SCHARF, env: spurEnv,
        deps: { entferneSpur: async () => ({ ok: true }) }
      });
    } catch (fehler) { abgebrochen = fehler && fehler.grund === "fremde-kennung"; }
    check("DS6 Eine FREMDE Kennung bricht auch die Nacharbeit ab (kein stilles Filtern)", abgebrochen);
  }

  // BEFUND 02.09. (adversariales Diff-Review): eine LEERE Zielmenge meldete
  // `ok: true` — "nichts getan" sah aus wie "vollstaendig zurueckgebaut".
  {
    const env = { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT };
    const leer = await RB.fuehreRueckbauAus({
      kennungen: [], modus: RB.MODUS_SCHARF, env,
      deps: { deaktiviere: async () => ({ ok: true }), leseZustand: async () => ({ vorhanden: true, aktiv: false }) }
    });
    check("D12 Eine LEERE Zielmenge gilt NICHT als erfolgreicher Rueckbau",
      leer.ok === false && leer.zielGroesse === 0);
    const leerSpur = await RB.entferneSchedulerSpur({
      kennungen: [], modus: RB.MODUS_SCHARF,
      env: { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT_SPUR },
      deps: { entferneSpur: async () => ({ ok: true }) }
    });
    check("D13 Dasselbe gilt fuer die Nacharbeit an der Scheduler-Spur",
      leerSpur.ok === false && leerSpur.zielGroesse === 0);
  }

  const scharfEnv = { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT };
  const geschrieben = [];
  const erfolg = await RB.fuehreRueckbauAus({
    kennungen: ["test-kohorte-a-001", "test-kohorte-a-002"],
    modus: RB.MODUS_SCHARF,
    env: scharfEnv,
    deps: {
      deaktiviere: async (id) => { geschrieben.push(id); return { ok: true }; },
      leseZustand: async () => ({ vorhanden: true, aktiv: false })
    }
  });
  check("D4 Mit beiden Freigaben läuft er scharf und deaktiviert genau die Zielmenge",
    erfolg.modus === RB.MODUS_SCHARF && erfolg.deaktiviert === 2 && erfolg.ok === true
      && geschrieben.join(",") === "test-kohorte-a-001,test-kohorte-a-002");

  const halb = await RB.fuehreRueckbauAus({
    kennungen: ["test-kohorte-a-001", "test-kohorte-a-002"],
    modus: RB.MODUS_SCHARF,
    env: scharfEnv,
    deps: {
      deaktiviere: async (id) => { if (id.endsWith("002")) throw new Error("netzfehler"); return { ok: true }; },
      leseZustand: async (id) => ({ vorhanden: true, aktiv: id.endsWith("002") })
    }
  });
  check("D5 Ein Fehlschlag an EINER Kennung beendet den Lauf NICHT",
    halb.deaktiviert === 1 && halb.fehlgeschlagen === 1 && halb.ok === false,
    "sonst bliebe der Rest der Kohorte aktiv stehen");
  check("D6 Der Fehlschlag wird einzeln benannt, nicht verschluckt",
    halb.ergebnisse.some((e) => e.id === "test-kohorte-a-002" && e.schreibfehler));
  check("D7 Gemeldet wird nur, was die Ablage trägt (Nachprüfung je Zeile)",
    (() => {
      const quelle = fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-rueckbau.js"), "utf8");
      return /leseZustand/.test(quelle) && /NACHPRÜFUNG/.test(quelle);
    })());
  check("D8 IDEMPOTENZ: ein zweiter Lauf über bereits inaktive Zeilen meldet Erfolg",
    (await RB.fuehreRueckbauAus({
      kennungen: ["test-kohorte-a-001"],
      modus: RB.MODUS_SCHARF,
      env: scharfEnv,
      deps: {
        deaktiviere: async () => ({ ok: true }),
        leseZustand: async () => ({ vorhanden: true, aktiv: false })
      }
    })).ok === true);
  check("D9 Eine FREMDE Kennung bricht den Vorgang ab (kein stilles Filtern)",
    (() => {
      try {
        RB.zielmenge(["test-kohorte-a-001", "ein-reales-mandat"]);
        return false;
      } catch (fehler) { return fehler && fehler.grund === "fremde-kennung"; }
    })());
  check("D10 Auch eine erfundene Kennung derselben Familie wird abgewiesen",
    (() => {
      try { RB.zielmenge(["test-kohorte-a-999"]); return false; }
      catch (fehler) { return fehler && fehler.grund === "fremde-kennung"; }
    })(), "ein bloßes Präfix genügt nicht — es zählt die Erlaubnisliste");
  check("D11 Kein realer Mandats-Slug im Ausführer",
    !/m5-[0-9a-f]{8}/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/testkohorte-rueckbau.js"), "utf8")));

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error(`Unerwarteter Fehler: ${(fehler && fehler.stack) || fehler}`);
  process.exit(1);
});
