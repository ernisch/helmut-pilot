"use strict";

// Helmut — VERTRAGSTEST der WARTESCHLANGENWACHE V2 (OP-30, Sprint 2026-08-17).
// =============================================================================================
// WAS HIER BEWIESEN WIRD (Runbook §19.6 Punkt 1, neuer Vertrag §26):
//
//   `betriebsstatus` unterscheidet NEUN Zustandsklassen, maschinenlesbar in `zustandsklasse`,
//   mit Betreiberaktion je Klasse. Die zwei belegten Fehlbefunde sind behoben:
//     * Motor AUS + inerter Bestand meldete faelschlich `kritisch` (Runbook §19.5) — jetzt
//       ehrlich `inaktiv` mit sichtbarem Bestand, weder gruen noch kritisch.
//     * Nach einer Reaktivierung zaehlte die Wartezeit ab `created_at`, auch wenn der
//       Auftrag nachweislich NICHT ausfuehrbar war (§17.7(d)) — jetzt beginnt die
//       betriebliche Frist am erklaerten Aktivierungszeitpunkt (HELMUT_SCALABLE_PIPELINE_SEIT).
//
//   UND: ein echter Rueckstau wird durch V2 NIEMALS verharmlost — der Schweregrad-Vertrag
//   (18 h Warnung / 24 h kritisch / endgueltige Fehler / dauerhaft Blockierte) gilt bei
//   aktivem Motor unveraendert, quer durch alle Diagnoseklassen (Sweep in §8).
//
// OFFLINE: reine Attrappen-Kennzahlen, kein Netz, keine DB, keine Kosten.

const fs = require("fs");
const path = require("path");
const SP = require(path.join(__dirname, "..", "lib/helmut/scalable-pipeline.js"));

const AN = { HELMUT_SCALABLE_PIPELINE: "on" };
const AUS = {};
const H = 3600;
const JETZT = Date.parse("2026-08-17T12:00:00.000Z");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

function kennzahlen(o = {}) {
  return {
    wartend: 0, laufend: 0, aktive_leases: 0, erledigt_im_zeitraum: 0,
    fehlgeschlagen_gesamt: 0, endgueltig_fehler: 0, wiederholungen: 0,
    mittlere_dauer_s: null, durchsatz_pro_stunde: 0, nach_typ: {}, nach_status: {},
    aeltester_faelliger_s: 0, ueberfaellige_mandate: 0, max_mandatsalter_s: 0,
    aeltester_offener_s: 0, max_mandatswartezeit_s: 0, ueberfaellige_mandate_wartezeit: 0,
    ...o
  };
}
const OHNE_BLOCKIERTE = async () => ({ verfuegbar: true, blockiert: 0, nachTyp: {} });
const OHNE_GRUENDE = async () => ({ verfuegbar: true, anzahl: 0, texte: [] });
async function status(kz, { env = AN, blockierte = OHNE_BLOCKIERTE, gruende = OHNE_GRUENDE,
  jetzt = JETZT, metrics = null } = {}) {
  return SP.betriebsstatus({
    env,
    deps: {
      metrics: metrics || (async () => ({ verfuegbar: true, kennzahlen: kz })),
      blockierte,
      zurueckgestellte: gruende,
      now: () => jetzt
    }
  });
}

async function main() {
  console.log("Helmut — Warteschlangenwache V2: neun Zustandsklassen (OP-30, 2026-08-17)");

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Klasse 1: Motor AUS + inerter Bestand = ehrlich `inaktiv`, nie gruen, nie kritisch");
  {
    // Exakt der Production-Fall seit der Ruecknahme: 524 wartend, Wartezeit laengst > 24 h.
    const s = await status(kennzahlen({ wartend: 524, aeltester_offener_s: 90 * H,
      aeltester_faelliger_s: 90 * H }), { env: AUS });
    check("1.1 zustand ist `inaktiv` — NICHT `kritisch` (der belegte Fehlbefund)",
      s.zustand === "inaktiv", s.zustand);
    check("1.2 …und NICHT `gruen` (niemand arbeitet — das ist kein gesunder aktiver Betrieb)",
      s.zustand !== "gruen");
    check("1.3 zustandsklasse ist `inaktiv-inert`",
      s.zustandsklasse === SP.ZUSTANDSKLASSEN.INAKTIV, s.zustandsklasse);
    check("1.4 Der inerte Bestand steht SICHTBAR in den Befunden",
      (s.befunde || []).includes("inert-bestand:524"), JSON.stringify(s.befunde));
    check("1.5 Die Betreiberaktion nennt die Neutralisierung vor der Reaktivierung",
      /neutralisieren/.test(s.betreiberaktion || ""), s.betreiberaktion);
    check("1.6 flag=off und motor.aktiv=false stehen maschinenlesbar dabei",
      s.flag === "off" && s.motor && s.motor.aktiv === false);
    check("1.7 Der Vertrag ist ausdruecklich versioniert (statusvertrag=2)",
      s.statusvertrag === 2, String(s.statusvertrag));

    const leer = await status(kennzahlen(), { env: AUS });
    check("1.8 Auch ein leerer Bestand ist bei Motor AUS `inaktiv` (nie ein falsches Gruen)",
      leer.zustand === "inaktiv" && (leer.befunde || []).includes("inert-bestand:0"),
      `${leer.zustand} ${JSON.stringify(leer.befunde)}`);
    const rest = await status(kennzahlen({ wartend: 10, laufend: 3, aktive_leases: 1 }), { env: AUS });
    check("1.9 Restarbeit in `laeuft` bleibt bei Motor AUS sichtbar (inert-restarbeit)",
      (rest.befunde || []).includes("inert-restarbeit:3"), JSON.stringify(rest.befunde));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Klassen 2/3: aktiv ohne faellige Arbeit vs. gesunder Abfluss");
  {
    const leer = await status(kennzahlen());
    check("2.1 Aktiv + leer = `aktiv-keine-faellige-arbeit`, gruen",
      leer.zustand === "gruen" && leer.zustandsklasse === SP.ZUSTANDSKLASSEN.KEINE_FAELLIGE_ARBEIT,
      `${leer.zustand} ${leer.zustandsklasse}`);
    const vorgeplant = await status(kennzahlen({ wartend: 40, aeltester_faelliger_s: 0,
      aeltester_offener_s: 0 }));
    check("2.2 Aktiv + nur vorgeplante (noch nicht faellige) Arbeit = ebenfalls Klasse 2",
      vorgeplant.zustandsklasse === SP.ZUSTANDSKLASSEN.KEINE_FAELLIGE_ARBEIT, vorgeplant.zustandsklasse);
    const gesund = await status(kennzahlen({ wartend: 120, laufend: 2, aktive_leases: 2,
      erledigt_im_zeitraum: 180, aeltester_faelliger_s: 900, aeltester_offener_s: 900 }));
    check("2.3 Aktiv + faellige Arbeit + Abfluss + Wartezeit unter 18 h = `aktiv-gesund`, gruen",
      gesund.zustand === "gruen" && gesund.zustandsklasse === SP.ZUSTANDSKLASSEN.GESUND,
      `${gesund.zustand} ${gesund.zustandsklasse}`);
    check("2.4 Betreiberaktion fuer gesunden Betrieb ist `keine`",
      gesund.betreiberaktion === "keine", gesund.betreiberaktion);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · Klassen 4/5/7: Vorwarnung und kritisch werden ZUVERLAESSIG ueberschritten");
  {
    const knapp = await status(kennzahlen({ wartend: 50, aeltester_faelliger_s: 17 * H,
      aeltester_offener_s: 17 * H, erledigt_im_zeitraum: 30 }));
    check("3.1 17 h Wartezeit: noch gruen (unter der 18-h-Vorwarnung)",
      knapp.zustand === "gruen", `${knapp.zustand} ${knapp.zustandsklasse}`);
    const warn = await status(kennzahlen({ wartend: 50, aeltester_faelliger_s: 18 * H,
      aeltester_offener_s: 18 * H, erledigt_im_zeitraum: 30 }));
    check("3.2 GENAU 18 h: Vorwarnung feuert (>=, nicht >) — `aktiv-verzoegert`, warnung",
      warn.zustand === "warnung" && warn.zustandsklasse === SP.ZUSTANDSKLASSEN.VERZOEGERT,
      `${warn.zustand} ${warn.zustandsklasse}`);
    const kurzVorKritisch = await status(kennzahlen({ wartend: 50,
      aeltester_faelliger_s: 24 * H - 1, aeltester_offener_s: 24 * H - 1, erledigt_im_zeitraum: 30 }));
    check("3.3 24 h minus 1 s: noch warnung", kurzVorKritisch.zustand === "warnung");
    const fest = await status(kennzahlen({ wartend: 50, aeltester_faelliger_s: 24 * H,
      aeltester_offener_s: 24 * H, erledigt_im_zeitraum: 0 }));
    check("3.4 GENAU 24 h OHNE jeden Abfluss: `aktiv-festgefahren`, kritisch",
      fest.zustand === "kritisch" && fest.zustandsklasse === SP.ZUSTANDSKLASSEN.FESTGEFAHREN,
      `${fest.zustand} ${fest.zustandsklasse}`);
    check("3.5 Betreiberaktion: sofort stoppen und zuruecknehmen",
      /stoppen/.test(fest.betreiberaktion || ""), fest.betreiberaktion);
    const trotzAbfluss = await status(kennzahlen({ wartend: 300, aeltester_faelliger_s: 25 * H,
      aeltester_offener_s: 25 * H, erledigt_im_zeitraum: 140 }));
    check("3.6 24 h+ TROTZ laufendem Abfluss = `aktiv-ueberfaellig-trotz-abfluss` (der reale "
      + "Kapazitaetsbefund §19.4), kritisch",
    trotzAbfluss.zustand === "kritisch"
      && trotzAbfluss.zustandsklasse === SP.ZUSTANDSKLASSEN.UEBERFAELLIG_TROTZ_ABFLUSS,
    `${trotzAbfluss.zustand} ${trotzAbfluss.zustandsklasse}`);
    check("3.7 …mit der Kapazitaets-Betreiberaktion (Abflussrate), nicht `Verbraucher neustarten`",
      /Abflussrate/.test(trotzAbfluss.betreiberaktion || ""), trotzAbfluss.betreiberaktion);
    const endgueltig = await status(kennzahlen({ wartend: 5, endgueltig_fehler: 3,
      aeltester_faelliger_s: 900, aeltester_offener_s: 900 }));
    check("3.8 Endgueltig gescheiterte Arbeit bleibt kritisch (unveraenderter Schweregrad-Vertrag)",
      endgueltig.zustand === "kritisch"
      && (endgueltig.befunde || []).includes("endgueltige-fehler:3"),
    `${endgueltig.zustand} ${JSON.stringify(endgueltig.befunde)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · Alte, nachweislich NICHT ausfuehrbare Auftraege (§17.7(d)) — die Aktivierungsklemme");
  {
    // Ein Auftrag entstand vor 5 Tagen, aber der Motor war aus — er war nie ausfuehrbar.
    // Der Betreiber aktiviert JETZT und erklaert den Zeitpunkt. Ohne die Klemme waere K0
    // sofort kritisch (genau die dritte Falle aus §17.7(d)).
    const seitJetzt = { ...AN, HELMUT_SCALABLE_PIPELINE_SEIT: new Date(JETZT - 10 * 60000).toISOString() };
    const kz = kennzahlen({ wartend: 524, aeltester_faelliger_s: 5 * 24 * H,
      aeltester_offener_s: 5 * 24 * H, max_mandatswartezeit_s: 4 * 24 * H, max_mandatsalter_s: 5 * 24 * H });
    const s = await status(kz, { env: seitJetzt });
    check("4.1 Ein 5 Tage alter, nie ausfuehrbarer Auftrag ist bei frischer Aktivierung NICHT kritisch",
      s.zustand === "gruen", `${s.zustand} ${JSON.stringify(s.befunde)}`);
    check("4.2 Die Klemmung ist SICHTBAR (kein stilles Umrechnen)",
      (s.befunde || []).some((b) => b.startsWith("wartezeit-ab-aktivierung:")), JSON.stringify(s.befunde));
    check("4.3 Die rohe Messung bleibt in den Kennzahlen stehen (rohesAlterS)",
      s.kennzahlen.rohesAlterS === 5 * 24 * H && s.kennzahlen.gemessenesAlterS <= 601,
      `${s.kennzahlen.rohesAlterS} / ${s.kennzahlen.gemessenesAlterS}`);
    check("4.4 Der Faelligkeitsrueckstand wird weiter GEMELDET (kein Vertuschen, OP-15)",
      (s.befunde || []).some((b) => b.startsWith("faelligkeitsrueckstand:")), JSON.stringify(s.befunde));

    // Sobald der Auftrag ausfuehrbar IST, laeuft die richtige betriebliche Frist ab Aktivierung.
    const nach19h = await status(kz, { env: seitJetzt, jetzt: JETZT + 19 * H * 1000 - 10 * 60000 });
    check("4.5 19 h nach der Aktivierung: Vorwarnung (die Frist laeuft ab Ausfuehrbarkeit)",
      nach19h.zustand === "warnung", `${nach19h.zustand} ${nach19h.zustandsklasse}`);
    const nach25h = await status(kz, { env: seitJetzt, jetzt: JETZT + 25 * H * 1000 - 10 * 60000 });
    check("4.6 25 h nach der Aktivierung: kritisch — die Klemme verharmlost KEINEN echten Rueckstau",
      nach25h.zustand === "kritisch", `${nach25h.zustand} ${nach25h.zustandsklasse}`);

    const ohneSeit = await status(kz, { env: AN });
    check("4.7 OHNE erklaerten Aktivierungszeitpunkt gilt die rohe Wartezeit (Fehlalarm vor falschem Gruen)",
      ohneSeit.zustand === "kritisch", ohneSeit.zustand);
    const kaputt = await status(kz, { env: { ...AN, HELMUT_SCALABLE_PIPELINE_SEIT: "gestern abend" } });
    check("4.8 Ein unlesbarer Zeitpunkt wird benannt und konservativ ignoriert",
      kaputt.zustand === "kritisch"
      && (kaputt.befunde || []).some((b) => b.startsWith("aktivseit-ungueltig:")),
    JSON.stringify(kaputt.befunde));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Klasse 6: haengende Leases werden erkannt");
  {
    const s = await status(kennzahlen({ wartend: 20, laufend: 3, aktive_leases: 1,
      aeltester_faelliger_s: 900, aeltester_offener_s: 900, erledigt_im_zeitraum: 10 }));
    check("5.1 laufend=3 bei nur 1 aktiven Lease: 2 abgelaufene Leases erkannt",
      s.kennzahlen.abgelaufeneLeases === 2, String(s.kennzahlen.abgelaufeneLeases));
    check("5.2 Klasse `aktiv-lease-ohne-fortschritt`, mindestens warnung",
      s.zustandsklasse === SP.ZUSTANDSKLASSEN.LEASE_OHNE_FORTSCHRITT && s.zustand === "warnung",
      `${s.zustand} ${s.zustandsklasse}`);
    check("5.3 Befund benannt", (s.befunde || []).includes("leases-abgelaufen:2"), JSON.stringify(s.befunde));
    const slotende = await status(kennzahlen({ wartend: 20, laufend: 11, aktive_leases: 11,
      aeltester_faelliger_s: 900, aeltester_offener_s: 900, erledigt_im_zeitraum: 10 }));
    check("5.4 AKTIVE Leases sind KEIN Befund (Slotende-Normalfall §19.3: 11 laufend, 11 aktiv)",
      slotende.zustand === "gruen" && slotende.kennzahlen.abgelaufeneLeases === 0,
      `${slotende.zustand} ${slotende.kennzahlen.abgelaufeneLeases}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · Klasse 8: Abhaengigkeit/Anbietergrenze — getrennt vom festgefahrenen Verbraucher");
  {
    const gruendeBudget = async () => ({ verfuegbar: true, anzahl: 40, texte: [
      ...Array(25).fill("zurueckgestellt: verstehen-uebersprungen (understanding-locked)"),
      ...Array(15).fill("zurueckgestellt: budget-nicht-verfuegbar: tagesdeckel")
    ] });
    const kz = kennzahlen({ wartend: 50, aeltester_faelliger_s: 19 * H,
      aeltester_offener_s: 19 * H, erledigt_im_zeitraum: 25 });
    const abh = await status(kz, { gruende: gruendeBudget });
    check("6.1 Verzoegerung mit dominierenden Schloss-/Deckel-Gruenden = Klasse 8, warnung",
      abh.zustand === "warnung" && abh.zustandsklasse === SP.ZUSTANDSKLASSEN.ABHAENGIGKEIT,
      `${abh.zustand} ${abh.zustandsklasse}`);
    check("6.2 Die Betreiberaktion zeigt auf die Abhaengigkeit, NICHT auf den Verbraucher",
      /NICHT den Verbraucher/.test(abh.betreiberaktion || ""), abh.betreiberaktion);
    check("6.3 Die Grundklassen stehen maschinenlesbar dabei (25 Schloss / 15 Deckel)",
      abh.zurueckgestellt && abh.zurueckgestellt.nachGrundklasse.abhaengigkeit === 25
      && abh.zurueckgestellt.nachGrundklasse.anbietergrenze === 15,
      JSON.stringify(abh.zurueckgestellt));
    const ohneGruende = await status(kz);
    check("6.4 Dieselbe Verzoegerung OHNE solche Gruende = Klasse 4 (verzoegert)",
      ohneGruende.zustandsklasse === SP.ZUSTANDSKLASSEN.VERZOEGERT, ohneGruende.zustandsklasse);
    const kritischAbh = await status(kennzahlen({ wartend: 50, aeltester_faelliger_s: 25 * H,
      aeltester_offener_s: 25 * H, erledigt_im_zeitraum: 25 }), { gruende: gruendeBudget });
    check("6.5 Ueber 24 h bleibt es KRITISCH — die Diagnoseklasse verharmlost nichts",
      kritischAbh.zustand === "kritisch"
      && kritischAbh.zustandsklasse === SP.ZUSTANDSKLASSEN.ABHAENGIGKEIT,
      `${kritischAbh.zustand} ${kritischAbh.zustandsklasse}`);
    const blockiert3 = async () => ({ verfuegbar: true, blockiert: 3, nachTyp: { document_understanding: 3 } });
    const dauerhaft = await status(kennzahlen({ wartend: 5, aeltester_faelliger_s: 900,
      aeltester_offener_s: 900 }), { blockierte: blockiert3 });
    check("6.6 Dauerhaft blockierte Arbeit: kritisch + Klasse 8 (sie kommt von selbst nicht zurueck)",
      dauerhaft.zustand === "kritisch"
      && dauerhaft.zustandsklasse === SP.ZUSTANDSKLASSEN.ABHAENGIGKEIT
      && (dauerhaft.befunde || []).includes("dauerhaft-blockiert:3"),
    `${dauerhaft.zustand} ${dauerhaft.zustandsklasse}`);

    check("6.7 Grundklassifikation: `zeitbudget-deckel` ist SLOTENDE, keine Anbietergrenze",
      SP.klassifiziereZurueckstellgrund("zurueckgestellt: zeitbudget-deckel") === "slotende");
    check("6.8 Grundklassifikation: `budget-nicht-verfuegbar` ist Anbietergrenze",
      SP.klassifiziereZurueckstellgrund("budget-nicht-verfuegbar: tagesdeckel") === "anbietergrenze");
    check("6.9 Grundklassifikation: `vorbedingung-offen` ist Abhaengigkeit",
      SP.klassifiziereZurueckstellgrund("vorbedingung-offen: 3 Auftrag(e) im Fenster") === "abhaengigkeit");
    check("6.10 Grundklassifikation: Unbekanntes ist `sonstig`, nie eine stille Zuordnung",
      SP.klassifiziereZurueckstellgrund("HTTP 503") === "sonstig"
      && SP.klassifiziereZurueckstellgrund("") === "sonstig");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · Klasse 9: Unbekanntes und Widerspruechliches blockiert GESCHLOSSEN");
  {
    const unlesbar = await status(null, { metrics: async () => ({ verfuegbar: false, grund: "migration-fehlt" }) });
    check("7.1 Nicht lesbare Warteschlange: zustand `unbekannt`, Klasse 9",
      unlesbar.zustand === "unbekannt" && unlesbar.zustandsklasse === SP.ZUSTANDSKLASSEN.UNBEKANNT,
      `${unlesbar.zustand} ${unlesbar.zustandsklasse}`);
    check("7.2 Betreiberaktion: geschlossen blockieren, keine Entscheidung auf dieser Messung",
      /geschlossen blockieren/.test(unlesbar.betreiberaktion || ""), unlesbar.betreiberaktion);
    const widerspruch = await status(kennzahlen({ wartend: 10, laufend: 1, aktive_leases: 4 }));
    check("7.3 aktive_leases > laufend ist ein WIDERSPRUCH — Klasse 9, kein Raten",
      widerspruch.zustand === "unbekannt"
      && (widerspruch.befunde || []).some((b) => b.startsWith("widerspruch:")),
    `${widerspruch.zustand} ${JSON.stringify(widerspruch.befunde)}`);
    const negativ = await status(kennzahlen({ wartend: -3 }));
    check("7.4 Ein negativer Zaehler ist ein Widerspruch — Klasse 9",
      negativ.zustand === "unbekannt", negativ.zustand);
    const kaputteZahl = await status(kennzahlen({ laufend: "viele" }));
    check("7.5 Ein Zaehler, der keine Zahl ist, ist ein Widerspruch — Klasse 9",
      kaputteZahl.zustand === "unbekannt", kaputteZahl.zustand);
    const kaputtesAlter = await status(kennzahlen({ wartend: 10, aeltester_offener_s: "NaN-Text" }));
    check("7.5b Eine Wartezeit, die keine Zahl ist, ist ein Widerspruch — sie wuerde sonst "
      + "alle Schwellenvergleiche still zu `gruen` machen",
    kaputtesAlter.zustand === "unbekannt", kaputtesAlter.zustand);
    const zukunft = await status(kennzahlen({ wartend: 10, aeltester_faelliger_s: 900,
      aeltester_offener_s: 900 }),
    { env: { ...AN, HELMUT_SCALABLE_PIPELINE_SEIT: new Date(JETZT + 7 * 24 * H * 1000).toISOString() } });
    check("7.6 Ein Aktivierungszeitpunkt in der ZUKUNFT ist ein Widerspruch — Klasse 9 (er "
      + "koennte sonst jede Wartezeit auf 0 klemmen)",
    zukunft.zustand === "unbekannt"
      && (zukunft.befunde || []).includes("widerspruch:aktivseit-in-der-zukunft"),
    `${zukunft.zustand} ${JSON.stringify(zukunft.befunde)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("8 · VERHARMLOSUNGS-RIEGEL: ein echter Rueckstau ist bei aktivem Motor IMMER kritisch");
  {
    // Sweep ueber alle Diagnose-Konstellationen: 25 h Wartezeit, Motor an — egal welche
    // Gruende, Leases oder Abflusswerte dazukommen, der Schweregrad bleibt kritisch.
    const konstellationen = [];
    for (const erledigt of [0, 140]) {
      for (const leases of [[0, 0], [3, 1]]) {
        for (const gruende of [OHNE_GRUENDE,
          async () => ({ verfuegbar: true, anzahl: 50, texte: Array(50).fill("zurueckgestellt: verstehen-uebersprungen (understanding-locked)") }),
          async () => ({ verfuegbar: false, grund: "lesefehler" })]) {
          konstellationen.push({ erledigt, laufend: leases[0], aktive: leases[1], gruende });
        }
      }
    }
    let alleKritisch = true;
    const abweichler = [];
    for (const kfg of konstellationen) {
      const s = await status(kennzahlen({ wartend: 200, laufend: kfg.laufend,
        aktive_leases: kfg.aktive, erledigt_im_zeitraum: kfg.erledigt,
        aeltester_faelliger_s: 25 * H, aeltester_offener_s: 25 * H }), { gruende: kfg.gruende });
      if (s.zustand !== "kritisch") { alleKritisch = false; abweichler.push(`${s.zustand}/${s.zustandsklasse}`); }
    }
    check(`8.1 Alle ${konstellationen.length} Konstellationen mit 25 h Rueckstau melden kritisch`,
      alleKritisch, abweichler.join(", "));

    const messluecke = await status(kennzahlen({ wartend: 10, aeltester_faelliger_s: 900,
      aeltester_offener_s: 900 }), { blockierte: async () => ({ verfuegbar: false, grund: "migration-fehlt" }) });
    check("8.2 Eine Messluecke (Blockierten-Sicht fehlt) ist keine gruene Zusage: hoechstens warnung",
      messluecke.zustand === "warnung"
      && (messluecke.befunde || []).some((b) => b.startsWith("blockierte-unbekannt:")),
    `${messluecke.zustand} ${JSON.stringify(messluecke.befunde)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("9 · Rueckwaertskompatibilitaet: V1-Felder unveraendert, Erweiterung versioniert");
  {
    const s = await status(kennzahlen({ wartend: 7, laufend: 1, aktive_leases: 1,
      erledigt_im_zeitraum: 12, aeltester_faelliger_s: 300, aeltester_offener_s: 300 }));
    const v1Felder = ["verfuegbar", "flag", "zustand", "befunde", "altersvertrag", "blockiert",
      "kennzahlen", "schwellen"];
    check("9.1 Alle V1-Felder sind weiterhin vorhanden",
      v1Felder.every((f) => f in s), v1Felder.filter((f) => !(f in s)).join(","));
    const v1Kennzahlen = ["wartend", "laufend", "aktiveLeases", "aeltesterFaelligerS",
      "erledigtImZeitraum", "fehlgeschlagenGesamt", "endgueltigFehler", "wiederholungen",
      "mittlereDauerS", "durchsatzProStunde", "ueberfaelligeMandate", "maxMandatsalterS",
      "aeltesterOffenerS", "maxMandatswartezeitS", "ueberfaelligeMandateWartezeit",
      "gemessenesAlterS", "nachTyp", "nachStatus", "kapazitaetsreserveFaktor"];
    check("9.2 Alle V1-Kennzahlen sind weiterhin vorhanden",
      v1Kennzahlen.every((f) => f in s.kennzahlen),
      v1Kennzahlen.filter((f) => !(f in s.kennzahlen)).join(","));
    check("9.3 Bei AKTIVEM Motor bleibt der Wertebereich von `zustand` der alte "
      + "(gruen|warnung|kritisch|unbekannt)",
    ["gruen", "warnung", "kritisch", "unbekannt"].includes(s.zustand), s.zustand);
    check("9.4 `inaktiv` kommt AUSSCHLIESSLICH bei Motor aus vor (versionierte Erweiterung)",
      (await status(kennzahlen(), { env: AUS })).zustand === "inaktiv"
      && s.zustand !== "inaktiv");
    check("9.5 Schwellen unveraendert: 18 h Warnung, 24 h kritisch, Bezug Wartezeit",
      s.schwellen.warnungAlterS === 18 * H && s.schwellen.kritischAlterS === 24 * H
      && s.schwellen.bezug === "wartezeit-ab-bearbeitbarkeit",
    JSON.stringify(s.schwellen));
    check("9.6 Ohne die Wartezeit-Migration gilt weiter der alte, strengere Vertrag (benannt)",
      (await status(kennzahlen({ wartend: 3, aeltester_offener_s: null,
        max_mandatswartezeit_s: null, ueberfaellige_mandate_wartezeit: null }))).altersvertrag
        === SP.ALTERSVERTRAG_ALT);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("10 · MUTATIONSPROBEN am Vertrag (adversarial, offline)");
  {
    // M1: Wer die Klemme missbrauchen will, indem er `SEIT` einfach immer wieder auf „jetzt"
    // stellt, unterdrueckt zwar die Wartezeitgrenze — aber der Befund `wartezeit-ab-aktivierung`
    // steht dann DAUERHAFT in jeder Meldung, und Faelligkeitsrueckstand + rohesAlterS bleiben
    // sichtbar. Die Probe belegt: die Klemme ist nie unsichtbar.
    const frisiert = await status(kennzahlen({ wartend: 200, aeltester_faelliger_s: 30 * H,
      aeltester_offener_s: 30 * H, max_mandatsalter_s: 30 * H, max_mandatswartezeit_s: 30 * H }),
    { env: { ...AN, HELMUT_SCALABLE_PIPELINE_SEIT: new Date(JETZT - 1000).toISOString() } });
    check("10.1 Eine dauerklemmende SEIT-Variable bleibt in JEDER Meldung sichtbar",
      (frisiert.befunde || []).some((b) => b.startsWith("wartezeit-ab-aktivierung:"))
      && frisiert.kennzahlen.rohesAlterS === 30 * H,
    JSON.stringify(frisiert.befunde));

    // M2: dieselbe Messung, nur das Flag wechselt — die Klassen muessen kippen (aus dem
    // inerten Zustand darf ohne Flagwechsel nie ein aktiver werden und umgekehrt).
    const kz = kennzahlen({ wartend: 524, aeltester_faelliger_s: 90 * H, aeltester_offener_s: 90 * H });
    const an = await status(kz);
    const aus = await status(kz, { env: AUS });
    check("10.2 Identische Kennzahlen: Motor an => kritisch, Motor aus => inaktiv (nie vermischt)",
      an.zustand === "kritisch" && aus.zustand === "inaktiv",
      `${an.zustand} / ${aus.zustand}`);

    // M3: Grenzwert-Paare je Schwelle — jede Schwelle ist >= (einschliesslich), nie >.
    for (const [wert, erwartet] of [[18 * H - 1, "gruen"], [18 * H, "warnung"],
      [24 * H - 1, "warnung"], [24 * H, "kritisch"]]) {
      const s = await status(kennzahlen({ wartend: 9, aeltester_faelliger_s: wert,
        aeltester_offener_s: wert, erledigt_im_zeitraum: 5 }));
      check(`10.3 Schwellenprobe ${wert}s => ${erwartet}`, s.zustand === erwartet,
        `${s.zustand} ${s.zustandsklasse}`);
    }

    // M4: die Diagnose darf den Schweregrad nie ANHEBEN muessen, um ehrlich zu sein — aber
    // sie darf ihn auch nie senken: Klasse 8 in der kritischen Zone bleibt kritisch (6.5),
    // Klasse 6 in der gruenen Zone bleibt warnung (5.2). Hier: Klasse 8 unter 18 h => gruen
    // bleibt gruen (keine kuenstliche Eskalation durch Diagnose allein).
    const ruhig = await status(kennzahlen({ wartend: 50, aeltester_faelliger_s: 2 * H,
      aeltester_offener_s: 2 * H, erledigt_im_zeitraum: 30 }),
    { gruende: async () => ({ verfuegbar: true, anzahl: 40,
      texte: Array(40).fill("zurueckgestellt: verstehen-uebersprungen (understanding-locked)") }) });
    check("10.4 Dominante Schloss-Gruende OHNE Verzoegerung eskalieren nicht (gruen, Klasse 3)",
      ruhig.zustand === "gruen" && ruhig.zustandsklasse === SP.ZUSTANDSKLASSEN.GESUND,
      `${ruhig.zustand} ${ruhig.zustandsklasse}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("11 · Gedeckelte Grundmenge ist Stichprobe, keine Gesamtverteilung");
  {
    // Reproduktion N6: 2.000 wartende Auftraege, aber der Lesepfad liefert hoechstens
    // 1.000 ungeordnete Gruende. Selbst wenn ALLE gelesenen Zeilen auf eine Abhaengigkeit
    // zeigen, ist damit nicht belegt, dass sie im gesamten Rueckstand dominiert.
    const stichprobe = async () => ({
      verfuegbar: true,
      anzahl: 1000,
      gelesen: 1000,
      limit: 1000,
      vollstaendig: false,
      texte: Array(1000).fill("zurueckgestellt: verstehen-uebersprungen (understanding-locked)")
    });
    const verz = await status(kennzahlen({
      wartend: 2000,
      aeltester_faelliger_s: 19 * H,
      aeltester_offener_s: 19 * H,
      erledigt_im_zeitraum: 25
    }), { gruende: stichprobe });

    check("11.1 Die Stichprobe entscheidet NICHT global auf Klasse 8",
      verz.zustandsklasse === SP.ZUSTANDSKLASSEN.VERZOEGERT,
      verz.zustandsklasse);
    check("11.2 Die 19-h-Warnung bleibt bestehen (keine Verharmlosung)",
      verz.zustand === "warnung", verz.zustand);
    check("11.3 Ein globaler Blockierungsanteil bleibt unbekannt statt falsch 0,5",
      verz.zurueckgestellt && verz.zurueckgestellt.anteilBlockierend === null,
      JSON.stringify(verz.zurueckgestellt));
    check("11.4 Der Anteil INNERHALB der Stichprobe bleibt klar benannt sichtbar",
      verz.zurueckgestellt && verz.zurueckgestellt.anteilBlockierendStichprobe === 1,
      JSON.stringify(verz.zurueckgestellt));
    check("11.5 Messumfang nennt 1.000 von 2.000 und `vollstaendig:false`",
      verz.zurueckgestellt && verz.zurueckgestellt.messumfang
      && verz.zurueckgestellt.messumfang.gelesen === 1000
      && verz.zurueckgestellt.messumfang.limit === 1000
      && verz.zurueckgestellt.messumfang.rueckstand === 2000
      && verz.zurueckgestellt.messumfang.vollstaendig === false,
      JSON.stringify(verz.zurueckgestellt && verz.zurueckgestellt.messumfang));
    check("11.6 Der Befund macht die Stichprobengrenze maschinenlesbar",
      (verz.befunde || []).includes("zurueckstellgruende-stichprobe:1000-von-2000"),
      JSON.stringify(verz.befunde));

    // Echte storage-Huelle: exakt am Limit ist die Vollstaendigkeit ohne Count-Header
    // unentscheidbar und wird deshalb konservativ verneint.
    const storageSource = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/storage.js"), "utf8");
    const start = storageSource.indexOf("async function jobQueueZurueckgestellteGruende");
    const ende = storageSource.indexOf("// --- TRANSAKTIONALE OUTBOX", start);
    const block = storageSource.slice(start, ende);
    check("11.7 Der echte Lesepfad markiert `rows.length === limit` als unvollstaendig",
      /vollstaendig:\s*zeilen\.length < wirksamesLimit/.test(block)
      && /gelesen:\s*zeilen\.length/.test(block)
      && /limit:\s*wirksamesLimit/.test(block));
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error && error.stack || String(error));
  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail + 1}`);
  process.exit(1);
});
