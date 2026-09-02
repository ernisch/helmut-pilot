"use strict";

// Offline-Vertragstest des FÄLLIGKEITSTORES (Betreiberentscheidung 02.09.).
//
// Das Tor prüft ab jetzt die Motorbedingung `due_at <= jetzt` statt einer
// Schnittmenge mit dem Streuintervall. Diese Suite hält den Vertrag technisch
// fest — mit besonderem Gewicht auf den Fällen, in denen beide Fragen
// auseinanderfallen (ein Fenster NACH einer Phase) und auf dem Mitternachtsverhalten.
//
// KEIN NETZ, KEINE DATENBANK, KEINE PRODUCTION. Alle Zahlen entstehen aus der
// echten Planungsfunktion `source-demand.planeMandatsarbeit` mit festen Zeitpunkten.

const fs = require("fs");
const path = require("path");
const F = require("../lib/helmut/funktionstest-faelligkeit");
const S = require("../lib/helmut/testkohorte-stufen");
const SD = require("../lib/helmut/source-demand");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const t = (iso) => Date.parse(iso);

// Die drei zu prüfenden Fenster. Absolute Zeitpunkte, kein Minutenmodell —
// der Frischefensterschlüssel ist datumsabhängig.
const TAG = "2026-09-03";
const FENSTER = Object.freeze({
  A: { name: "11:36–15:59 UTC", start: t(`${TAG}T11:36:00Z`), ende: t(`${TAG}T15:59:00Z`) },
  B: { name: "17:36–19:59 UTC", start: t(`${TAG}T17:36:00Z`), ende: t(`${TAG}T19:59:00Z`) },
  C: { name: "21:36–03:59 UTC", start: t(`${TAG}T21:36:00Z`), ende: t("2026-09-04T03:59:00Z") }
});

function befund(stufe, f, extra = {}) {
  return F.faelligkeitsBefund({
    stufe,
    fensterStartMs: f.start,
    fensterEndeMs: f.ende,
    planungsZeitpunktMs: extra.planungsZeitpunktMs ?? f.start,
    ...extra
  });
}

function produkt(b) {
  return b.produktstufe;
}

function main() {
  // ── A · Der Vertrag: sieben Kennzahlen je Arbeitsklasse ──────────────────
  console.log("\nA · Vertrag des Tores");
  const bA = befund("c", FENSTER.C);
  check("A1 bewertbar", bA.bewertbar === true);
  check("A2 beide Pflichtklassen werden ausgewiesen",
    bA.klassen.length === 2
      && bA.klassen.map((k) => k.jobType).sort().join(",")
        === "briefing_materialization,mandate_projection");
  for (const feld of ["geplant", "beiStartFaellig", "imFensterZusaetzlichFaellig",
    "bisFensterendeBeanspruchbar", "nichtBeanspruchbar", "abdeckung", "vollstaendigeAbdeckung"]) {
    check(`A3-${feld} ist je Klasse vorhanden`,
      bA.klassen.every((k) => Object.prototype.hasOwnProperty.call(k, feld)));
  }
  check("A4 beiStart + imFenster = beanspruchbar",
    bA.klassen.every((k) => k.beiStartFaellig + k.imFensterZusaetzlichFaellig
      === k.bisFensterendeBeanspruchbar));
  check("A5 beanspruchbar + nichtBeanspruchbar = geplant",
    bA.klassen.every((k) => k.bisFensterendeBeanspruchbar + k.nichtBeanspruchbar === k.geplant));

  // ── B · Dieselbe Quelle wie der Motor, keine zweite Phasenlogik ──────────
  console.log("\nB · Eine Quelle für die Fälligkeit");
  const quelle = fs.readFileSync(path.join(ROOT, "lib/helmut/funktionstest-faelligkeit.js"), "utf8");
  check("B1 das Tor ruft die echte Planungsfunktion",
    /sourceDemand\.planeMandatsarbeit\(/.test(quelle));
  check("B2 es enthält KEINE eigene Phasenliste und keine fest eingebauten Anteile",
    !/0\.75|0\.90|MANDATSPHASEN\s*=/.test(quelle));
  check("B3 es rechnet die Fälligkeit nicht selbst, sondern liest dueAt",
    /Date\.parse\(a\.dueAt\)/.test(quelle));
  // Gegenprobe: dieselben Aufträge, direkt vom Planer geholt.
  const direkt = SD.planeMandatsarbeit({
    profile: S.kennungenBisStufe("c").map((id) => ({ id })),
    jetztMs: FENSTER.C.start, env: {}
  });
  const direktBriefing = direkt.auftraege
    .filter((a) => a.jobType === "briefing_materialization" && Date.parse(a.dueAt) <= FENSTER.C.ende).length;
  check("B4 das Tor stimmt mit dem direkten Planerergebnis überein",
    produkt(bA).bisFensterendeBeanspruchbar === direktBriefing,
    `${produkt(bA).bisFensterendeBeanspruchbar} gegen ${direktBriefing}`);

  // ── C · Die drei Fenster, je Stufe getrennt ─────────────────────────────
  //
  // AUSDRÜCKLICH getrennt: das Ergebnis einer kleineren Stufe wird NICHT für
  // eine größere übernommen. Jede Stufe wird eigens gerechnet.
  console.log("\nC · Drei Fenster × drei Stufen (getrennt gerechnet)");
  const erwartet = {
    // Fenster: [Stufe A, Stufe B, Stufe C] Abdeckung der Produktstufe
    A: { a: 0, b: 0, c: 0 },
    B: { a: 16 / 20, b: 55 / 95, c: 273 / 495 },
    C: { a: 1, b: 1, c: 1 }
  };
  for (const [fk, f] of Object.entries(FENSTER)) {
    for (const st of S.STUFEN) {
      const b = befund(st, f);
      const p = produkt(b);
      const soll = erwartet[fk][st];
      check(`C-${fk}-${st.toUpperCase()} Produktstufe ${p.bisFensterendeBeanspruchbar}/${p.geplant}`,
        Math.abs(p.abdeckung - soll) < 0.001,
        `${(p.abdeckung * 100).toFixed(1)} % (erwartet ${(soll * 100).toFixed(1)} %)`);
    }
  }
  check("C1 Fenster A trägt in KEINER Stufe eine Briefingmaterialisierung",
    S.STUFEN.every((st) => produkt(befund(st, FENSTER.A)).bisFensterendeBeanspruchbar === 0));
  check("C2 Fenster B trägt in KEINER Stufe die volle Kohorte",
    S.STUFEN.every((st) => produkt(befund(st, FENSTER.B)).vollstaendigeAbdeckung === false));
  check("C3 Fenster C trägt in JEDER Stufe die volle Kohorte (nach Fälligkeit)",
    S.STUFEN.every((st) => produkt(befund(st, FENSTER.C)).vollstaendigeAbdeckung === true));
  check("C4 die Stufen unterscheiden sich in der geplanten Menge",
    befund("a", FENSTER.C).kohortenGroesse === 20
      && befund("b", FENSTER.C).kohortenGroesse === 95
      && befund("c", FENSTER.C).kohortenGroesse === 495);

  // ── D · Die alte Frage gegen die neue ───────────────────────────────────
  //
  // „erstmals fällig" gegen „beanspruchbar" — genau hier fällt beides auseinander.
  console.log("\nD · Schnittmenge gegen Fälligkeit");
  const Z = require("../lib/helmut/funktionstest-zyklus");
  const alt = Z.arbeitsklassenImFenster({
    fensterStartMinuteUtc: 21 * 60 + 36, fensterEndeMinuteUtc: 23 * 60 + 59, env: {}
  });
  check("D1 die ALTE Schnittmengenrechnung meldet für das Nachtfenster NICHT erreichbar",
    alt.sichtbareProduktstufeErreichbar === false);
  check("D2 das NEUE Fälligkeitstor meldet volle Abdeckung",
    produkt(befund("c", FENSTER.C)).vollstaendigeAbdeckung === true);
  check("D3 beide Aussagen betreffen dieselbe Klasse — der Unterschied ist die Frage",
    alt.klassen.some((k) => k.jobType === "briefing_materialization"));

  // ── E · Mitternacht ─────────────────────────────────────────────────────
  console.log("\nE · Mitternacht");
  const vorMitternacht = befund("c", FENSTER.C, { planungsZeitpunktMs: t(`${TAG}T20:00:00Z`) });
  const zumStart = befund("c", FENSTER.C, { planungsZeitpunktMs: FENSTER.C.start });
  const nachMitternacht = befund("c", FENSTER.C, { planungsZeitpunktMs: t("2026-09-04T00:30:00Z") });
  const spaeterNachts = befund("c", FENSTER.C, { planungsZeitpunktMs: t("2026-09-04T02:00:00Z") });

  check("E1 (9a) Planung 20:00 vor Fensterbeginn: volle Abdeckung",
    produkt(vorMitternacht).abdeckung === 1);
  check("E2 (9b) Planung exakt zum Fensterbeginn: volle Abdeckung",
    produkt(zumStart).abdeckung === 1);
  check("E3 (9c) Planung erst 00:30 nach Mitternacht: KEINE Abdeckung",
    produkt(nachMitternacht).abdeckung === 0
      && nachMitternacht.planPasstZumFenster === false,
    `${(produkt(nachMitternacht).abdeckung * 100).toFixed(1)} %`);
  check("E4 (9e) Planung 02:00: die Aufträge gehören zum FOLGENDEN Frischefenster",
    spaeterNachts.frischefensterDesPlans === "2026-09-04T00Z"
      && spaeterNachts.frischefensterDesFensterbeginns === "2026-09-03T00Z");
  check("E5 (9c) und der Zyklus ist dann ausdrücklich FALSCH, nicht nur unbewertet",
    nachMitternacht.vollstaendigerZyklus === false);
  check("E6 das Tor erkennt, dass das Fenster Mitternacht überschreitet",
    befund("c", FENSTER.C).ueberschreitetMitternacht === true
      && befund("c", FENSTER.A).ueberschreitetMitternacht === false);

  // (9f) Idempotenzschlüssel über Mitternacht
  const schluessel = (jetzt) => SD.planeMandatsarbeit({
    profile: [{ id: "test-kohorte-a-001" }], jetztMs: jetzt, env: {}
  }).auftraege.find((a) => a.jobType === "briefing_materialization").idempotencyKey;
  check("E7 (9f) der Idempotenzschlüssel wechselt über Mitternacht",
    schluessel(t(`${TAG}T23:59:00Z`)) !== schluessel(t("2026-09-04T00:01:00Z")),
    `${schluessel(t(`${TAG}T23:59:00Z`))} → ${schluessel(t("2026-09-04T00:01:00Z"))}`);
  check("E8 (9g) ein vor Mitternacht geplanter Auftrag bleibt danach fällig",
    // Die Claim-Bedingung kennt kein Frischefenster: dueAt liegt vor Mitternacht,
    // also ist der Auftrag auch um 03:00 des Folgetages beanspruchbar.
    (() => {
      const b = F.faelligkeitsBefund({
        stufe: "c",
        fensterStartMs: t("2026-09-04T02:00:00Z"),
        fensterEndeMs: t("2026-09-04T03:59:00Z"),
        planungsZeitpunktMs: t(`${TAG}T20:00:00Z`)
      });
      // Der Plan gehört zum Vortag; das Tor meldet das ausdrücklich.
      return b.planPasstZumFenster === false
        && b.klassen.every((k) => k.beiStartFaellig === k.geplant);
    })(),
    "dueAt des Vortags liegt vor dem Fensterbeginn — beanspruchbar, aber anderes Frischefenster");

  // ── F · Fail closed ─────────────────────────────────────────────────────
  console.log("\nF · Fail closed");
  check("F1 ohne Fenstergrenzen nicht bewertbar",
    F.faelligkeitsBefund({ stufe: "c", planungsZeitpunktMs: 1 }).bewertbar === false);
  check("F2 ohne Planungszeitpunkt nicht bewertbar",
    F.faelligkeitsBefund({
      stufe: "c", fensterStartMs: FENSTER.C.start, fensterEndeMs: FENSTER.C.ende
    }).bewertbar === false);
  check("F3 ohne Kohorte nicht bewertbar",
    F.faelligkeitsBefund({
      fensterStartMs: FENSTER.C.start, fensterEndeMs: FENSTER.C.ende,
      planungsZeitpunktMs: FENSTER.C.start
    }).bewertbar === false);
  check("F4 (19e) leere Kohorte ist NIE ein Erfolg",
    F.faelligkeitsBefund({
      kennungen: [], fensterStartMs: FENSTER.C.start, fensterEndeMs: FENSTER.C.ende,
      planungsZeitpunktMs: FENSTER.C.start
    }).bewertbar === false);
  check("F5 unbekannte Stufe bricht ab",
    F.faelligkeitsBefund({
      stufe: "z", fensterStartMs: FENSTER.C.start, fensterEndeMs: FENSTER.C.ende,
      planungsZeitpunktMs: FENSTER.C.start
    }).bewertbar === false);
  check("F6 ein leeres Fenster (Ende <= Start) bricht ab",
    F.faelligkeitsBefund({
      stufe: "c", fensterStartMs: FENSTER.C.ende, fensterEndeMs: FENSTER.C.start,
      planungsZeitpunktMs: FENSTER.C.start
    }).bewertbar === false);

  // ── G · Der Status, den Planungsdaten nicht hergeben ─────────────────────
  console.log("\nG · Fälligkeit ist notwendig, nicht hinreichend");
  const ohneStatus = befund("c", FENSTER.C);
  check("G1 ohne gemessene offene Aufträge ist der Zyklus NICHT BEWERTBAR (null)",
    ohneStatus.vollstaendigerZyklus === null && ohneStatus.abdeckungErreicht === true);
  check("G2 null ist ausdrücklich kein false und kein true",
    ohneStatus.vollstaendigerZyklus !== false && ohneStatus.vollstaendigerZyklus !== true);
  const mitStatus = befund("c", FENSTER.C, {
    offeneAuftraege: { mandate_projection: 495, briefing_materialization: 495 }
  });
  check("G3 mit ausreichender gemessener Zahl offener Aufträge: vollständiger Zyklus",
    mitStatus.vollstaendigerZyklus === true);
  const zuWenigOffen = befund("c", FENSTER.C, {
    offeneAuftraege: { mandate_projection: 495, briefing_materialization: 220 }
  });
  check("G4 (19l) zu wenige offene Aufträge: Abbruch statt Erfolg",
    zuWenigOffen.vollstaendigerZyklus === false && zuWenigOffen.offeneAuftraegeReichen === false);
  check("G5 ein unvollständiger Zähler gilt NICHT als Messung",
    befund("c", FENSTER.C, { offeneAuftraege: { briefing_materialization: 495 } })
      .offeneAuftraegeGemessen === false);
  check("G6 ein negativer Zähler gilt nicht als Messung",
    befund("c", FENSTER.C, {
      offeneAuftraege: { mandate_projection: -1, briefing_materialization: 495 }
    }).offeneAuftraegeGemessen === false);

  // ── H · Teil- und Sonderfälle der Kohorte ───────────────────────────────
  console.log("\nH · Kohortenfälle");
  const alle = S.kennungenBisStufe("a");
  check("H1 (19c) vollständige Kohorte im Nachtfenster: 100 %",
    F.faelligkeitsBefund({
      kennungen: [...alle], fensterStartMs: FENSTER.C.start, fensterEndeMs: FENSTER.C.ende,
      planungsZeitpunktMs: FENSTER.C.start
    }).produktstufe.abdeckung === 1);
  check("H2 (19f) ein FEHLENDES Profil senkt die geplante Menge sichtbar",
    (() => {
      const b = F.faelligkeitsBefund({
        kennungen: alle.slice(0, alle.length - 1),
        fensterStartMs: FENSTER.C.start, fensterEndeMs: FENSTER.C.ende,
        planungsZeitpunktMs: FENSTER.C.start
      });
      return b.kohortenGroesse === alle.length - 1 && b.produktstufe.geplant === alle.length - 1;
    })());
  check("H3 (19d) teilweise fällige Kohorte wird als Teilabdeckung gemeldet",
    (() => {
      const p = produkt(befund("c", FENSTER.B));
      return p.abdeckung > 0 && p.abdeckung < 1 && p.vollstaendigeAbdeckung === false;
    })());
  check("H4 (19d) eine Teilabdeckung erfüllt die Vollforderung NICHT",
    befund("c", FENSTER.B).abdeckungErreicht === false);
  check("H5 (Punkt 7) eine EINZIGE fällige Briefingmaterialisierung genügt nicht",
    (() => {
      // Ein Fenster, das nur den frühesten Briefingauftrag trägt.
      const p = SD.planeMandatsarbeit({
        profile: S.kennungenBisStufe("c").map((id) => ({ id })), jetztMs: FENSTER.C.start, env: {}
      });
      const br = p.auftraege.filter((a) => a.jobType === "briefing_materialization")
        .map((a) => Date.parse(a.dueAt)).sort((x, y) => x - y);
      const b = F.faelligkeitsBefund({
        stufe: "c", fensterStartMs: br[0] - 1000, fensterEndeMs: br[0] + 1000,
        planungsZeitpunktMs: FENSTER.C.start
      });
      return b.produktstufe.bisFensterendeBeanspruchbar >= 1
        && b.abdeckungErreicht === false && b.vollstaendigerZyklus === false;
    })());
  check("H6 eine abgesenkte Mindestabdeckung wirkt, wird aber ausgewiesen",
    (() => {
      const b = befund("c", FENSTER.B, { mindestAbdeckung: 0.5 });
      return b.mindestAbdeckung === 0.5 && b.abdeckungErreicht === true;
    })());

  // ── I · Startbedingungen des Nachtfensters ──────────────────────────────
  console.log("\nI · Harte Startbedingungen");
  const nacht = befund("c", FENSTER.C, {
    offeneAuftraege: { mandate_projection: 495, briefing_materialization: 495 }
  });
  const leer = F.startbedingungen({ befund: nacht });
  check("I1 ohne Angaben ist KEINE Startbedingung erfüllt (fail closed)",
    leer.erfuellt === false && leer.offene.length > 0, `${leer.offene.length} offen`);
  const voll = F.startbedingungen({
    befund: nacht,
    aktivierungAbgeschlossenMs: t(`${TAG}T20:00:00Z`),
    restzeitMinuten: 383,
    konkurrierendeSchwereAusfuehrung: false,
    vorbedingungenErfuellt: true,
    tagesdeckelWirksam: true,
    vorrangreserveWirksam: true,
    kommunikationsriegelScharf: true
  });
  check("I2 mit allen Nachweisen sind alle Startbedingungen erfüllt",
    voll.erfuellt === true, voll.grund);
  check("I3 (16a) eine Aktivierung NACH dem Frischefensterwechsel fällt durch",
    F.startbedingungen({
      befund: nacht, aktivierungAbgeschlossenMs: t("2026-09-04T00:30:00Z"),
      restzeitMinuten: 383, konkurrierendeSchwereAusfuehrung: false,
      vorbedingungenErfuellt: true, tagesdeckelWirksam: true,
      vorrangreserveWirksam: true, kommunikationsriegelScharf: true
    }).erfuellt === false);
  check("I4 (16e) zu wenig Restzeit fällt durch",
    F.startbedingungen({
      befund: nacht, aktivierungAbgeschlossenMs: t(`${TAG}T20:00:00Z`),
      restzeitMinuten: 30, konkurrierendeSchwereAusfuehrung: false,
      vorbedingungenErfuellt: true, tagesdeckelWirksam: true,
      vorrangreserveWirksam: true, kommunikationsriegelScharf: true
    }).erfuellt === false);
  check("I5 (16f/19j) eine konkurrierende schwere Ausführung fällt durch",
    F.startbedingungen({
      befund: nacht, aktivierungAbgeschlossenMs: t(`${TAG}T20:00:00Z`),
      restzeitMinuten: 383, konkurrierendeSchwereAusfuehrung: true,
      vorbedingungenErfuellt: true, tagesdeckelWirksam: true,
      vorrangreserveWirksam: true, kommunikationsriegelScharf: true
    }).erfuellt === false);
  check("I6 (19j) unerfüllte Vorbedingungen fallen durch",
    F.startbedingungen({
      befund: nacht, aktivierungAbgeschlossenMs: t(`${TAG}T20:00:00Z`),
      restzeitMinuten: 383, konkurrierendeSchwereAusfuehrung: false,
      vorbedingungenErfuellt: false, tagesdeckelWirksam: true,
      vorrangreserveWirksam: true, kommunikationsriegelScharf: true
    }).erfuellt === false);
  check("I7 ein Befund OHNE gemessene offene Aufträge fällt an der Statusbedingung durch",
    F.startbedingungen({
      befund: befund("c", FENSTER.C),
      aktivierungAbgeschlossenMs: t(`${TAG}T20:00:00Z`), restzeitMinuten: 383,
      konkurrierendeSchwereAusfuehrung: false, vorbedingungenErfuellt: true,
      tagesdeckelWirksam: true, vorrangreserveWirksam: true, kommunikationsriegelScharf: true
    }).offene.some((n) => /OFFENE Aufträge/.test(n)));
  check("I8 ohne bewertbaren Befund gibt es gar keine Startbedingung",
    F.startbedingungen({ befund: null }).erfuellt === false);

  // ── J · Nur crawl und pipeline treiben die Warteschlange ────────────────
  console.log("\nJ · Warteschlangentreibende Crons (gemessen, nicht angenommen)");
  const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const treiber = (server.match(/cronSchwererPfad\("(\w+)"/g) || [])
    .map((m) => m.replace(/cronSchwererPfad\("|"/g, ""));
  check("J1 genau zwei Cron-Namen treiben die Warteschlange",
    treiber.length === 2 && treiber.includes("crawl") && treiber.includes("pipeline"),
    treiber.join(", "));
  check("J2 der Understanding-Cron gehört NICHT dazu", !treiber.includes("understanding"));
  check("J3 das Tor führt genau diese drei Slots",
    F.WARTESCHLANGEN_CRONS.length === 3
      && F.WARTESCHLANGEN_CRONS.every((c) => /crawl|pipeline/.test(c.pfad)));
  check("J4 (9j) das Nachtfenster endet VOR dem 04:00-Crawl",
    FENSTER.C.ende < t("2026-09-04T04:00:00Z"),
    `Ende ${new Date(FENSTER.C.ende).toISOString()} gegen 04:00`);
  check("J5 (9h) der 20:00-Crawl liegt VOR dem Nachtfenster und kann vorwegnehmen",
    t(`${TAG}T20:00:00Z`) < FENSTER.C.start);

  // ── K · Die Lasttrennung ────────────────────────────────────────────────
  console.log("\nK · Warteschlangenarbeit gegen Nutzerlast gegen Reserve");
  const kap = require("../lib/helmut/kapazitaet-500");
  const trenn = kap.lastTrennung({ mandate: 500, szenario: "konservativ" });
  check("K1 die Trennung ist bewertbar", trenn.bewertbar === true);
  check("K2 die drei Größen summieren sich zum Tagesbedarf",
    trenn.warteschlangenarbeitProTag + trenn.nutzergetriebenUndEigeneCronsProTag
      + trenn.andereVerbraucherProTag === trenn.gesamtBedarfProTag,
    `${trenn.warteschlangenarbeitProTag}+${trenn.nutzergetriebenUndEigeneCronsProTag}+${trenn.andereVerbraucherProTag}=${trenn.gesamtBedarfProTag}`);
  check("K3 die KI-freien Warteschlangenklassen sind benannt",
    trenn.kiFreieWarteschlangenklassen.includes("mandate_projection")
      && trenn.kiFreieWarteschlangenklassen.includes("briefing_materialization"));
  check("K4 genau eine Warteschlangenklasse trägt Modellaufrufe",
    trenn.kiTragendeWarteschlangenklasse === "document_understanding");
  // Punkt 13 des Auftrags: 812 darf keine Abkürzung und keine neue Fenstergröße
  // sein. Geprüft wird der WERT, nicht die Erwähnung — der Rücknahmekommentar in
  // `kapazitaet-500.js` nennt die Zahl absichtlich, und das ist richtig so.
  check("K5 (Punkt 13) 812 ist kein geführter Wert des Modells",
    trenn.warteschlangenarbeitProTag !== 812
      && Object.values(trenn).every((v) => v !== 812),
    `Warteschlangenarbeit = ${trenn.warteschlangenarbeitProTag}, nicht 812`);
  check("K6 die Trennung ist ausdrücklich als beschreibend gekennzeichnet",
    /BESCHREIBEND/.test(trenn.hinweis));

  // ── L · Parallelität 1 (19k) ────────────────────────────────────────────
  console.log("\nL · Parallelität 1");
  const zykl = kap.zyklusPasstInsFenster({
    fensterMinuten: 383, parallel: 1, szenario: "konservativ", mandate: 500,
    bedarfAufrufe: trenn.warteschlangenarbeitProTag
  });
  check("L1 die Warteschlangenarbeit passt bei Parallelität 1 in das Nachtfenster",
    zykl.passt === true && zykl.parallel === 1,
    `${zykl.benoetigteAufrufe} nötig, ${zykl.moeglicheAufrufe} möglich, ${zykl.benoetigteMinuten} min`);
  // Auch der VOLLE Tagesbedarf (1.812, also einschließlich der nutzergetriebenen
  // Last) passt im Nachtfenster bei Parallelität 1 — anders als in den beiden
  // Tagesfenstern. Das ist der eigentliche Unterschied des Nachtfensters.
  check("L2 auch der volle Tagesbedarf passt im NACHTfenster bei Parallelität 1",
    kap.zyklusPasstInsFenster({
      fensterMinuten: 383, parallel: 1, szenario: "konservativ", mandate: 500
    }).passt === true);
  check("L2a in den beiden Tagesfenstern passt der volle Tagesbedarf NICHT",
    kap.zyklusPasstInsFenster({ fensterMinuten: 263, parallel: 1, szenario: "konservativ", mandate: 500 }).passt === false
      && kap.zyklusPasstInsFenster({ fensterMinuten: 143, parallel: 1, szenario: "konservativ", mandate: 500 }).passt === false);
  check("L3 die Gesamtlast bleibt unter dem vorbereiteten Tagesdeckel",
    trenn.gesamtBedarfProTag <= 2416, `${trenn.gesamtBedarfProTag} gegen 2416`);

  // ── M · Mandantenneutralität ────────────────────────────────────────────
  console.log("\nM · Mandantenneutralität (CLAUDE.md §4.2)");
  check("M1 das Tor enthält keinen realen Mandats-Slug", !/m5-[0-9a-f]{8}/.test(quelle));

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main();
