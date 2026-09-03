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

// ERGAENZT 02.09. (zweiter adversarialer Review): kein Aufruf uebergab `env`,
// waehrend die Gegenproben `planeMandatsarbeit({… env: {}})` benutzten. B4 verglich
// damit `process.env` gegen `{}` — heute gleich, weil die Standardwerte greifen,
// morgen ein stiller Unterschied. Jetzt lesen beide Seiten aus derselben,
// ausdruecklich leeren Umgebung.
const ENV = Object.freeze({});

function befund(stufe, f, extra = {}) {
  return F.faelligkeitsBefund({
    stufe,
    fensterStartMs: f.start,
    fensterEndeMs: f.ende,
    planungsZeitpunktMs: extra.planungsZeitpunktMs ?? f.start,
    env: ENV,
    ...extra
  });
}

// BESTANDSBAUER (02.09., Kreisschluss-Korrektur). `n` Auftraege je Klasse, mit
// frei waehlbarer Verteilung ueber die vier Statuswerte.
function bestand(je) {
  const k = (x) => ({
    wartend: x.wartend ?? 0, laufend: x.laufend ?? 0, erledigt: x.erledigt ?? 0,
    endgueltigFehlerhaft: x.fehlerhaft ?? 0,
    ...(x.imFenster === undefined ? {} : { erledigtImTestfenster: x.imFenster })
  });
  return { gemessen: true, klassen: {
    mandate_projection: k(je.mp || je), briefing_materialization: k(je.bm || je) } };
}

function produkt(b) {
  return b.produktstufe;
}

async function main() {
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
    // KORRIGIERT 02.09. nach dem Ausfuehrbarkeitsreview: der Befund uebergibt
    // jetzt den ROTATIONSRANG an den Planer, so wie Production es tut. Ohne ihn
    // fiel der Planer auf den tagesunabhaengigen Streuwert zurueck und meldete
    // fuer Stufe A 16/20 statt 12/20. Die neuen Zahlen sind die des Motors.
    B: { a: 12 / 20, b: 53 / 95, c: 273 / 495 },
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
  const mitStatus = befund("c", FENSTER.C, { bestand: bestand({ wartend: 495, imFenster: 0 }) });
  check("G3 alle geplant und noch wartend: Fachzyklus vollständig",
    mitStatus.vollstaendigerZyklus === true && mitStatus.fachzyklusVollstaendig === true);
  const zuWenig = befund("c", FENSTER.C, {
    bestand: bestand({ mp: { wartend: 495, imFenster: 0 }, bm: { wartend: 220, imFenster: 0 } })
  });
  check("G4 (19l) eine Klasse ist unvollständig: Abbruch statt Erfolg",
    zuWenig.vollstaendigerZyklus === false
      && zuWenig.bestand.find((b) => b.jobType === "briefing_materialization").fehlend === 275);
  check("G5 ein unvollständiger Zähler gilt NICHT als Messung",
    befund("c", FENSTER.C, {
      bestand: { gemessen: true, klassen: { briefing_materialization: { wartend: 495 } } }
    }).bestandGemessen === false);
  check("G6 ein negativer Zähler gilt nicht als Messung",
    befund("c", FENSTER.C, {
      bestand: { gemessen: true, klassen: {
        mandate_projection: { wartend: -1, laufend: 0, erledigt: 0, endgueltigFehlerhaft: 0 },
        briefing_materialization: { wartend: 495, laufend: 0, erledigt: 0, endgueltigFehlerhaft: 0 } } }
    }).bestandGemessen === false);
  check("G7 ohne ausdrückliches `gemessen: true` bleibt es UNGEMESSEN (Auftrag Punkt 15)",
    befund("c", FENSTER.C, {
      bestand: { klassen: bestand({ wartend: 495 }).klassen }
    }).bestandGemessen === false);

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
  const nacht = befund("c", FENSTER.C, { bestand: bestand({ wartend: 495, imFenster: 0 }) });
  const leer = F.startbedingungen({ befund: nacht });
  check("I1 ohne Angaben ist KEINE Startbedingung erfüllt (fail closed)",
    leer.erfuellt === false && leer.offene.length > 0, `${leer.offene.length} offen`);
  // ZWOELFTE STARTBEDINGUNG (02.09.): der Rotationsrang muss VOLLSTAENDIG sein.
  // Ein Befund ohne die uebrigen am Testtag aktiven Mandate rechnet mit einer
  // anderen Rangkarte als Production und darf deshalb nicht starten.
  const nachtMitRotation = befund("c", FENSTER.C, {
    bestand: bestand({ wartend: 495, imFenster: 0 }),
    weitereAktiveMandate: ["real-1", "real-2", "real-3", "real-4", "real-5"]
  });
  check("I1b ein Befund OHNE die übrigen aktiven Mandate scheitert an der Rotationsbedingung",
    F.startbedingungen({
      befund: nacht, aktivierungAbgeschlossenMs: t(`${TAG}T20:00:00Z`),
      restzeitMinuten: 383, konkurrierendeSchwereAusfuehrung: false,
      vorbedingungenErfuellt: true, tagesdeckelWirksam: true,
      vorrangreserveWirksam: true, kommunikationsriegelScharf: true
    }).offene.some((o) => /Rotationsrang/.test(o)));
  const voll = F.startbedingungen({
    befund: nachtMitRotation,
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
  check("I7 ein Befund OHNE gemessenen Bestand fällt an der Statusbedingung durch",
    F.startbedingungen({
      befund: befund("c", FENSTER.C),
      aktivierungAbgeschlossenMs: t(`${TAG}T20:00:00Z`), restzeitMinuten: 383,
      konkurrierendeSchwereAusfuehrung: false, vorbedingungenErfuellt: true,
      tagesdeckelWirksam: true, vorrangreserveWirksam: true, kommunikationsriegelScharf: true
    }).offene.some((n) => /Bestand rein lesend gemessen/.test(n)));
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

  // ── N · Der fehlende Nachweis als ausführbare Abfrage ───────────────────
  //
  // Punkt 17 des Auftrags: wenn die Fälligkeit nicht sicher aus Planungsdaten
  // ableitbar ist, soll kein scheinbares Grün gebaut, sondern genau benannt
  // werden, welcher lesende Nachweis fehlt. Hier steht er als Abfrage.
  console.log("\nN · Der fehlende Nachweis");
  const sql = F.erhebungsSql({ fensterEndeIso: "2026-09-04T03:59:00.000Z" });
  check("N1 die Abfrage ist rein lesend (nur select)",
    /^\s*select/im.test(sql)
      && !/\b(insert|update|delete|drop|alter|truncate|create)\b/i.test(sql));
  check("N2 sie bildet die Claim-Bedingung des Motors nach",
    /status = 'wartend'/.test(sql)
      && /due_at <= /.test(sql)
      && /attempts < j\.max_attempts/.test(sql));
  check("N3 sie ist auf die Kohorte begrenzt",
    /tenant_id like 'test-kohorte-%'/.test(sql));
  check("N4 sie fragt genau die beiden Pflichtklassen ab",
    F.PFLICHTKLASSEN.every((k) => sql.includes(k)));
  check("N5 sie trägt das FENSTERENDE, nicht now()",
    sql.includes("2026-09-04T03:59:00.000Z") && !/\bnow\(\)/.test(sql));
  // Eine eingeschleuste Zeichenkette wird NICHT entschärft in die Abfrage
  // geschrieben, sondern abgelehnt: ein escapter Fremdwert wäre zwar inert,
  // stünde aber trotzdem in einer Abfrage, die ein Mensch dann ausführt.
  check("N6 ein ungültiger Zeitpunkt wird abgelehnt, nicht escapt",
    (() => {
      try { F.erhebungsSql({ fensterEndeIso: "x'; drop table helmut_jobs; --" }); return false; }
      catch (e) { return /kein gueltiger Zeitpunkt/.test(String(e.message)); }
    })());
  check("N7 ein unzulässiges Kennungspräfix wird abgelehnt",
    (() => {
      try { F.erhebungsSql({ kennungsPraefix: "x' or '1'='1" }); return false; }
      catch (e) { return /Kennungspraefix/.test(String(e.message)); }
    })());
  check("N8 die Vorlage ohne Argumente bleibt lesbar",
    /<FENSTERENDE-UTC>/.test(F.erhebungsSql()));

  // ── O · Das Modul hat einen echten Aufrufer ─────────────────────────────
  //
  // Ein Vertrag ohne Ausführer ist in diesem Projekt schon zweimal entstanden
  // (`funktionstest-kontrolle` hatte keinen Aufrufer, der Vorwärtsweg fehlte
  // ganz). Dieser Abschnitt hält fest, dass es diesmal anders ist.
  console.log("\nO · Aufrufer");
  const cli = fs.readFileSync(path.join(ROOT, "scripts/funktionstest-500-faelligkeit.js"), "utf8");
  check("O1 es gibt ein CLI, das das Tor aufruft",
    /require\("\.\.\/lib\/helmut\/funktionstest-faelligkeit"\)/.test(cli)
      && /faelligkeitsBefund\(/.test(cli));
  check("O2 das CLI ist rein lesend — kein Netz, keine Datenbank, keine Route",
    !/fetch\(|https?\.request|supabaseRequest|\/api\/cron\//.test(cli));
  check("O3 ein NICHT bewertbares Urteil ist kein Erfolgs-Exitcode",
    /fachzyklusVollstaendig === true \? 0 : 1/.test(cli));
  const rahmen = fs.readFileSync(path.join(ROOT, "lib/helmut/funktionstest-500.js"), "utf8");
  check("O4 auch das Startbereitschafts-Tor ruft es auf",
    /require\("\.\/funktionstest-faelligkeit"\)/.test(rahmen));
  check("O5 die Hürde heißt nach der Fälligkeit, nicht nach der Schnittmenge",
    /Kohortenabdeckung ist im Startfenster nach FÄLLIGKEIT erreicht/.test(rahmen));

  // ── P · Das Tor als Startentscheidung im Rahmen ─────────────────────────
  console.log("\nP · Einbau in die Startbereitschaft");
  const R500 = require("../lib/helmut/funktionstest-500");
  const ohne = R500.startbereitschaft({});
  const huerde = (b) => b.huerden.find((h) => /Kohortenabdeckung/.test(h.name));
  check("P1 ohne Fälligkeitsfenster ist die Hürde fail closed offen",
    huerde(ohne).ok === false);
  const mit = R500.startbereitschaft({
    stufe: "c",
    faelligkeitsfenster: {
      fensterStartMs: FENSTER.C.start, fensterEndeMs: FENSTER.C.ende,
      planungsZeitpunktMs: FENSTER.C.start
    }
  });
  check("P2 mit Fenster, aber ohne Statusmessung: weiterhin offen",
    huerde(mit).ok === false && /BESTAND ist aber nicht gemessen/.test(huerde(mit).detail));
  const voll2 = R500.startbereitschaft({
    stufe: "c",
    faelligkeitsfenster: {
      fensterStartMs: FENSTER.C.start, fensterEndeMs: FENSTER.C.ende,
      planungsZeitpunktMs: FENSTER.C.start,
      bestand: bestand({ wartend: 495, imFenster: 0 })
    }
  });
  check("P3 mit vollständigem Nachweis ist die Hürde erfüllt", huerde(voll2).ok === true);
  check("P4 der Befund steht im Rückgabeobjekt und ist prüfbar",
    voll2.faelligkeitsBefund && voll2.faelligkeitsBefund.bewertbar === true);
  check("P5 die alte Schnittmengenrechnung bleibt als BESCHREIBUNG erhalten",
    voll2.arbeitsklassenImFenster && typeof voll2.arbeitsklassenImFenster === "object");
  check("P6 eine erfüllte Fälligkeitshürde macht den Test NICHT startbereit",
    voll2.startbereit === false, `${voll2.offen.length} weitere Hürden offen`);

  // ── Q · Regression: die neun Befunde der zwei unabhaengigen Reviews vom
  // 02.09. Jeder Punkt hier ist ein Fehler, der IM EIGENEN NEUEN CODE stand
  // und den erst die Gegenpruefung gefunden hat. ───────────────────────────
  console.log("\nQ · Regression der Review-Befunde vom 02.09.");

  // Q1/Q2 (Befund 1, hoch): Rotationsrang. Production ruft den Planer MIT
  // `rotation: tagesplan.reihenfolge`; ohne sie faellt er auf den
  // tagesunabhaengigen Streuwert zurueck und liefert andere Faelligkeiten.
  const ohneWeitere = befund("a", FENSTER.B);
  const mitWeitere = befund("a", FENSTER.B, {
    weitereAktiveMandate: ["real-1", "real-2", "real-3", "real-4", "real-5"]
  });
  check("Q1 der Befund weist die Herkunft der Rotation aus",
    ohneWeitere.rotationsQuelle === "berechnet-nur-kohorte"
      && mitWeitere.rotationsQuelle === "berechnet-kohorte-und-weitere",
    `${ohneWeitere.rotationsQuelle} / ${mitWeitere.rotationsQuelle}`);
  check("Q2 eine unvollständige Rangkarte wird als solche gemeldet, nicht verschwiegen",
    ohneWeitere.rotationVollstaendig === false && mitWeitere.rotationVollstaendig === true);
  check("Q3 die übrigen aktiven Mandate verschieben die Fälligkeiten messbar",
    produkt(ohneWeitere).bisFensterendeBeanspruchbar
      !== produkt(mitWeitere).bisFensterendeBeanspruchbar,
    `${produkt(ohneWeitere).bisFensterendeBeanspruchbar} gegen `
      + `${produkt(mitWeitere).bisFensterendeBeanspruchbar} von 20`);
  check("Q4 eine ausdrücklich übergebene Rotation gilt als vollständig",
    befund("a", FENSTER.B, { rotation: [...S.kennungenBisStufe("a")] })
      .rotationsQuelle === "uebergeben");

  // Q5-Q7 (Befund 3, hoch): `Number(null) === 0` haette die Schwelle auf 0
  // gesetzt — ein Fenster mit 0 % Abdeckung und 0 offenen Auftraegen waere als
  // vollstaendiger Zyklus gemeldet worden.
  for (const [name, wert] of [["null", null], ["Null", 0], ["leerer Text", ""],
                              ["über 1", 1.5], ["Text", "viel"]]) {
    check(`Q5 mindestAbdeckung ${name} ist NICHT bewertbar (kein pauschales Grün)`,
      befund("c", FENSTER.A, { mindestAbdeckung: wert }).bewertbar === false);
  }
  check("Q6 das schlimmste Szenario: 0 % Abdeckung, 0 offene Aufträge, Schwelle 0",
    befund("c", FENSTER.A, {
      mindestAbdeckung: 0,
      offeneAuftraege: { mandate_projection: 0, briefing_materialization: 0 }
    }).bewertbar === false);
  check("Q7 eine gültige Schwelle wird unverändert übernommen",
    befund("c", FENSTER.C, { mindestAbdeckung: 0.8 }).mindestAbdeckung === 0.8);

  // Q8 (Befund 4, mittel): dieselbe Koerzierungsfalle in der Restzeitschwelle.
  check("Q8 mindestRestzeitMinuten null fällt auf 60 zurück, nicht auf 0",
    F.startbedingungen({
      befund: nacht, restzeitMinuten: 0, mindestRestzeitMinuten: null
    }).bedingungen.find((b) => /Mindestrestzeit/.test(b.name)).erfuellt === false);

  // Q9-Q11 (Befund 5, mittel): `kennungen` ohne Erlaubnisliste. Eine fremde
  // Kennung waere geplant und als Stufenzahl berichtet worden — CLAUDE.md §4.2.
  check("Q9 eine FREMDE Kennung in der Zielmenge ist nicht bewertbar",
    befund("c", FENSTER.C, { kennungen: ["test-kohorte-a-001", "irgendein-echter-mandant"] })
      .bewertbar === false);
  check("Q10 ein Duplikat vergrößert die Kohorte NICHT",
    befund("a", FENSTER.C, {
      kennungen: ["test-kohorte-a-001", "test-kohorte-a-001", "test-kohorte-a-002"]
    }).kohortenGroesse === 2);
  check("Q11 eine Kennung der FALSCHEN Stufe wird abgewiesen",
    befund("a", FENSTER.C, { kennungen: ["test-kohorte-c-001"] }).bewertbar === false);

  // Q12-Q14 (Befund 2, hoch): die Erhebungsabfrage zaehlte fremde Frischefenster
  // und fremde Stufen mit — zurueckgestellte Auftraege FRUEHERER Tage stehen
  // ebenfalls auf `wartend`.
  const sqlGefiltert = F.erhebungsSql({
    fensterEndeIso: "2026-09-04T03:59:00Z", frischefenster: "2026-09-03T00Z", stufe: "a"
  });
  check("Q12 die Abfrage filtert das Frischefenster",
    /freshness_window = '2026-09-03T00Z'/.test(sqlGefiltert));
  check("Q13 die Abfrage filtert die Stufe kumulativ",
    /tenant_id like 'test-kohorte-a-%'/.test(sqlGefiltert)
      && !/test-kohorte-c-%/.test(sqlGefiltert));
  check("Q14 Stufe C filtert alle drei Präfixe",
    ["a", "b", "c"].every((x) =>
      F.erhebungsSql({ stufe: "c" }).includes(`test-kohorte-${x}-%`)));
  check("Q15 ohne Filter warnt die Abfrage sichtbar in sich selbst",
    /ACHTUNG: OHNE Frischefensterfilter/.test(F.erhebungsSql())
      && /ACHTUNG: OHNE Stufenfilter/.test(F.erhebungsSql()));
  check("Q16 ein ungültiger Frischefensterschlüssel wird abgewiesen, nicht escapt",
    (() => { try { F.erhebungsSql({ frischefenster: "2026-09-03'; drop table" }); return false; }
             catch { return true; } })());
  check("Q17 eine unbekannte Stufe wird abgewiesen",
    (() => { try { F.erhebungsSql({ stufe: "z" }); return false; } catch { return true; } })());
  check("Q18 auch die gefilterte Abfrage bleibt rein lesend",
    /^select|\nselect/.test(sqlGefiltert)
      && !/\b(update|insert|delete|drop|alter|truncate)\b/i.test(
        sqlGefiltert.split("\n").filter((z) => !z.startsWith("--")).join("\n")));

  // Q19 (Befund 9, niedrig): `zahl(0)` ist 0 — eine Aktivierung „1970-01-01"
  // haette als gueltig gegolten.
  check("Q19 ein Aktivierungszeitpunkt 0 gilt nicht als Aktivierung",
    F.startbedingungen({ befund: nacht, aktivierungAbgeschlossenMs: 0 })
      .bedingungen.find((b) => /Aktivierung/.test(b.name)).erfuellt === false);

  // Q20 (Befund 10, niedrig): `getUTCDate()` verglich die Kalendertagsnummer.
  check("Q20 ein Fenster über einen ganzen Monat überschreitet Mitternacht",
    befund("a", { start: t(`${TAG}T21:36:00Z`), ende: t("2026-10-03T21:36:00Z") })
      .ueberschreitetMitternacht === true);

  // Q21 (Befund 8, niedrig): doppelte Rundung wies 273/495 als 55,1 % statt
  // 55,2 % aus.
  check("Q21 die Abdeckung wird genau EINMAL gerundet",
    Math.abs(produkt(befund("c", FENSTER.B)).abdeckung - 273 / 495) < 1e-12
      && produkt(befund("c", FENSTER.B)).abdeckungProzent === 55.2,
    `${produkt(befund("c", FENSTER.B)).abdeckungProzent} %`);

  // Q22 (Befund 7, niedrig): `--alle` lieferte Exitcode 0, obwohl es kein
  // Urteil faellen kann — eine Automatisierung haette ein Gruen gelesen.
  check("Q22 der Übersichtslauf beendet sich ausdrücklich ohne Erfolgscode",
    (() => {
      const q = require("fs").readFileSync("scripts/funktionstest-500-faelligkeit.js", "utf8");
      const block = q.slice(q.indexOf("--alle"), q.indexOf("const stufe = argument"));
      return /FÄLLT KEIN URTEIL/.test(block) && /process\.exit\(1\)/.test(block);
    })());

  // Q23 (Befund 6, niedrig): „bildet die Claim-Bedingung exakt nach" war zu
  // stark — drei Teile des Claims fehlen. Sie stehen jetzt benannt dabei.
  check("Q23 die nicht abgebildeten Teile des Claims sind benannt",
    /Claim-Reihenfolge/.test(F.erhebungsSql())
      && /Claim-Limit/.test(F.erhebungsSql())
      && /Lease/.test(F.erhebungsSql()));

  // Q24/Q25: WIE ROBUST ist das Ergebnis gegen die Rangkarte? Das Nachtfenster
  // beginnt exakt am ENDE der Briefingphase (21:36 UTC) — jeder Auftrag ist
  // dort schon faellig, gleich welchen Rang sein Mandat hat. Das Abendfenster
  // liegt MITTEN in der Phase, dort entscheidet der Rang. Genau deshalb traegt
  // die Entscheidung fuer das Nachtfenster, obwohl die Rangkarte unvollstaendig ist.
  const rangVarianten = [null, ["r1", "r2", "r3", "r4", "r5"], ["z9", "z8", "z7"],
                         ["a"], ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"]];
  check("Q24 das NACHTFENSTER trägt 100 % für JEDE Rangkarte (strukturell, nicht zufällig)",
    S.STUFEN.every((st) => rangVarianten.every((w) =>
      produkt(befund(st, FENSTER.C, { weitereAktiveMandate: w })).abdeckungProzent === 100)));
  const abendwerte = rangVarianten.map((w) =>
    produkt(befund("a", FENSTER.B, { weitereAktiveMandate: w })).abdeckungProzent);
  check("Q25 das ABENDFENSTER hängt dagegen stark an der Rangkarte",
    new Set(abendwerte).size > 1
      && Math.max(...abendwerte) - Math.min(...abendwerte) >= 20,
    `Stufe A: ${abendwerte.join(" / ")} %`);

  // ── R · Regression des ZWEITEN adversarialen Reviews (02.09.) ───────────
  console.log("\nR · Regression des zweiten adversarialen Reviews");

  // R1 (Befund 5, mittel): `Number([])` ist 0. Ein leeres Array — der typische
  // Rueckgabewert einer FEHLGESCHLAGENEN Erhebung — waere als „1970" durchgegangen.
  for (const [name, wert] of [["leeres Array", []], ["Array mit Zahl", [1e15]],
                              ["Objekt", {}], ["Funktion", () => 1]]) {
    check(`R1 ${name} als Zeitpunkt ist NICHT bewertbar`,
      befund("a", { start: wert, ende: FENSTER.C.ende }).bewertbar === false);
  }

  // R2 (Befund 3, hoch): eine ERKLAERTE Parallelitaet ueber 1 darf die
  // Kapazitaetshuerde nicht oeffnen, solange sie nicht belegt ist.
  const K = require("../lib/helmut/kapazitaet-500");
  const konfigVoll = {
    maxParallel: 2, tagesdeckel: 2416, reserveVerstehen: 702, vorrangReal: 200,
    maxAnfragenJeMinute: 82, maxTokenJeMinute: 250000, kostenbudgetUsd: 10,
    kommunikation: "gesperrt"
  };
  check("R2 die erklärte Parallelität 2 würde die Rechnung tatsächlich kippen",
    K.zyklusPasstInsFenster({ fensterMinuten: 263, parallel: 1, szenario: "konservativ" }).passt === false
      && K.zyklusPasstInsFenster({ fensterMinuten: 263, parallel: 2, szenario: "konservativ" }).passt === true);
  const T = require("../lib/helmut/funktionstest-500");
  const huerdeVon = (belegt) => T.startbereitschaft({
    stufe: "a", konfiguration: konfigVoll, parallelitaetBelegt: belegt,
    startfenster: { startMinuteUtc: 17 * 60 + 36, endeMinuteUtc: 21 * 60 + 59 }
  }).huerden.find((h) => /vollständiger Zyklus passt/.test(h.name));
  check("R3 unbelegt wird mit 1 gerechnet und der Hinweis steht dabei",
    /erklärte Parallelität 2 ist NICHT belegt/.test(huerdeVon(false).detail));
  check("R4 belegt trägt den Hinweis NICHT",
    !/NICHT belegt/.test(huerdeVon(true).detail));

  // R5 (Befund 2, hoch): die Stufenhuerde konnte strukturell nie gruen werden —
  // fuenf Freigabeworte gleichzeitig aus EINER Variablen mit EINEM Wort.
  const startwortA = S.startfreigabe("a", {}).erwartetesWort;
  const envMitFreigabe = { HELMUT_TESTKOHORTE_EXECUTE: "1", HELMUT_TESTKOHORTE_CONFIRM: startwortA };
  check("R5 die Startfreigabe einer Stufe ist mit EINEM Wort erreichbar",
    S.startfreigabe("a", envMitFreigabe).erteilt === true);
  check("R6 die Stufenhürde wird damit tatsächlich grün",
    T.startbereitschaft({ stufe: "a", bestandeneStufen: [], env: envMitFreigabe })
      .huerden.find((h) => /Stufengenaue Freigaben/.test(h.name)).ok === true);
  check("R7 ohne das Wort bleibt sie rot",
    T.startbereitschaft({ stufe: "a", bestandeneStufen: [], env: {} })
      .huerden.find((h) => /Stufengenaue Freigaben/.test(h.name)).ok === false);
  check("R8 die späteren Freigaben werden benannt, aber NICHT gleichzeitig verlangt",
    S.startfreigabe("a", {}).spaetereFreigaben.length === 4);

  // R9 (Befund 4, hoch): der Stufenpfad verlor die Duplikatsperre des
  // Bestandspfades — `--ids=x,x` haette zweimal provisioniert.
  check("R9 der Stufenpfad weist Duplikate ab, wie der Bestandspfad",
    (() => { try { S.pruefeStufenZielmenge("a", ["test-kohorte-a-001", "test-kohorte-a-001"]);
                   return false; } catch (e) { return e.grund === "doppelte-kennung"; } })());

  // R10 (Befund 6, mittel): `env` wurde an die Geschwisterrechnung nicht
  // durchgereicht — zwei Teile desselben Befunds lasen aus zwei Umgebungen.
  const Z2 = require("../lib/helmut/funktionstest-zyklus");
  const engEnv = { HELMUT_DEMAND_TENANT_MAX_AGE_H: "6" };
  const ausTor = (e) => T.startbereitschaft({
    stufe: "a", startfenster: { startUtc: `${TAG}T21:36:00Z`, dauerMinuten: 383 }, env: e
  }).arbeitsklassenImFenster;
  check("R10 startbereitschaft reicht env an arbeitsklassenImFenster durch",
    ausTor(engEnv).bewertbar === true
      && JSON.stringify(ausTor(engEnv).klassen) === JSON.stringify(Z2.arbeitsklassenImFenster({
        fensterStartMinuteUtc: 21 * 60 + 36, fensterEndeMinuteUtc: 21 * 60 + 36 + 383, env: engEnv
      }).klassen),
    `bewertbar: ${ausTor(engEnv).bewertbar}`);
  check("R10b und die enge Umgebung ändert das Ergebnis wirklich",
    JSON.stringify(ausTor(engEnv).klassen) !== JSON.stringify(ausTor({}).klassen));

  // R11 (Befund 11, niedrig): der reale Mandats-Slug darf in Testfixtures nicht
  // ausgeweitet werden (`CLAUDE.md` §4.2).
  check("R11 der reale Mandats-Slug wurde NICHT in neue Dateien ausgeweitet",
    (() => {
      const fsx = require("fs");
      // Das Muster wird ZUSAMMENGESETZT, damit diese Zusicherung nicht selbst
      // eine Fundstelle ist und sich damit widerlegt.
      const slug = ["m5", "9aee228dbf2c9f13"].join("-");
      return ["scripts/testkohorte-stufen-test.js", "scripts/cron-ueberschneidung-test.js",
              "lib/helmut/funktionstest-faelligkeit.js", "lib/helmut/testkohorte-stufen.js",
              "lib/helmut/testkohorte-entfernung.js", "scripts/funktionstest-500-faelligkeit.js"]
        .every((d) => !fsx.readFileSync(d, "utf8").includes(slug));
    })());

  // ── S · Regression der Kreisschluss-Analyse (02.09.) ────────────────────
  console.log("\nS · Regression der Kreisschluss-Analyse");
  const B = require("../lib/helmut/testkohorte-betrieb");
  const Zk = require("../lib/helmut/funktionstest-zyklus");

  // S1-S3 (BLOCKIEREND): Tor und Ausführer verlangten ZWEI SICH AUSSCHLIESSENDE
  // Worte in DERSELBEN Variablen — die Kette blieb unerreichbar.
  const stufenwort = S.startfreigabe("a", {}).erwartetesWort;
  const pauschalwort = B.freigabe("fachzyklus", {}).erwartetesWort;
  check("S1 die beiden Worte sind tatsächlich verschieden — der Konflikt war echt",
    stufenwort !== pauschalwort, `${stufenwort} gegen ${pauschalwort}`);
  const envStufe = { HELMUT_TESTKOHORTE_EXECUTE: "1", HELMUT_TESTKOHORTE_CONFIRM: stufenwort };
  check("S2 EIN Wort erfüllt jetzt beide Seiten, wenn die Stufe genannt ist",
    S.startfreigabe("a", envStufe).erteilt === true
      && (await Zk.fuehreZyklusAus({
        modus: "trockenlauf", env: envStufe, stufe: "a", startbereit: true,
        startfensterBefund: { bewertbar: true, frei: true,
          startMinuteUtc: 21 * 60 + 36, endeMinuteUtc: 23 * 60 + 59 },
        jetztUtc: `${TAG}T22:00:00Z`,
        deps: { rufeRouteAuf: async () => ({ ok: true }),
          jetztMs: () => t(`${TAG}T22:00:00Z`), warte: async () => {} }
      })).freigabe.erteilt === true);
  check("S3 eine vertippte Stufe fällt NICHT auf das Pauschalwort zurück",
    (await Zk.fuehreZyklusAus({
      modus: "trockenlauf", env: { HELMUT_TESTKOHORTE_EXECUTE: "1",
        HELMUT_TESTKOHORTE_CONFIRM: pauschalwort }, stufe: "z", startbereit: true,
      startfensterBefund: { bewertbar: true, frei: true,
        startMinuteUtc: 21 * 60 + 36, endeMinuteUtc: 23 * 60 + 59 },
      jetztUtc: `${TAG}T22:00:00Z`,
      deps: { rufeRouteAuf: async () => ({ ok: true }),
        jetztMs: () => t(`${TAG}T22:00:00Z`), warte: async () => {} }
    })).freigabe.erteilt === false);
  check("S4 ohne Stufe bleibt das Bestandsverhalten (Pauschalwort) unverändert",
    (await Zk.fuehreZyklusAus({
      modus: "trockenlauf", env: { HELMUT_TESTKOHORTE_EXECUTE: "1",
        HELMUT_TESTKOHORTE_CONFIRM: pauschalwort }, startbereit: true,
      startfensterBefund: { bewertbar: true, frei: true,
        startMinuteUtc: 21 * 60 + 36, endeMinuteUtc: 23 * 60 + 59 },
      jetztUtc: `${TAG}T22:00:00Z`,
      deps: { rufeRouteAuf: async () => ({ ok: true }),
        jetztMs: () => t(`${TAG}T22:00:00Z`), warte: async () => {} }
    })).freigabe.erteilt === true);

  // S5 (mittel): der Handschalter `--startbereit=ja` ersetzte die Messung
  // durch eine Behauptung und löste echte scharfe Routenaufrufe aus.
  const zyklusCli = fs.readFileSync(path.join(ROOT, "scripts/funktionstest-500-zyklus.js"), "utf8");
  // Kommentare herausnehmen: die alte Zeile steht dort ausdrücklich als
  // Beschreibung dessen, was ENTFERNT wurde — sie darf nur nicht mehr LAUFEN.
  const zyklusCode = zyklusCli.split("\n").filter((z) => !/^\s*(\/\/|\*|\/\*)/.test(z)).join("\n");
  check("S5 der Handschalter --startbereit=ja ist entfernt und wird abgewiesen",
    !/startbereit"\) === "ja"/.test(zyklusCode)
      && /gibt es nicht mehr/.test(zyklusCode)
      && /startbereitschaft\(/.test(zyklusCode)
      && /startbereit: bereitschaft\.startbereit === true/.test(zyklusCode));

  // S6 (mittel): das alte Feld wurde stillschweigend ignoriert.
  const altesFeld = F.faelligkeitsBefund({
    stufe: "c", fensterStartMs: FENSTER.C.start, fensterEndeMs: FENSTER.C.ende,
    planungsZeitpunktMs: FENSTER.C.start,
    offeneAuftraege: { mandate_projection: 495, briefing_materialization: 495 }
  });
  check("S6 das abgeschaffte Feld `offeneAuftraege` wird ABGEWIESEN, nicht ignoriert",
    altesFeld.bewertbar === false && /gibt es nicht mehr/.test(altesFeld.grund));

  // S7-S8 (mittel): die Kapazitätshürde war stufenunabhängig.
  const kapHuerde = (st, dauer) => T.startbereitschaft({
    stufe: st, startfenster: { startUtc: `${TAG}T11:36:00Z`, dauerMinuten: dauer }
  }).huerden.find((h) => /vollständiger Zyklus passt/.test(h.name));
  check("S7 die Kapazitätshürde rechnet stufengenau (Kohorte + 5 reale Mandate)",
    /\(25 Mandate\)/.test(kapHuerde("a", 263).name)
      && /\(100 Mandate\)/.test(kapHuerde("b", 263).name)
      && /\(500 Mandate\)/.test(kapHuerde("c", 263).name));
  check("S8 Stufe A passt damit auch in ein Tagesfenster, Stufe C nicht",
    kapHuerde("a", 263).ok === true && kapHuerde("c", 263).ok === false);
  check("S9 ohne Stufe bleibt es fail closed bei der größten Menge",
    /\(500 Mandate\)/.test(T.startbereitschaft({
      startfenster: { startUtc: `${TAG}T11:36:00Z`, dauerMinuten: 263 }
    }).huerden.find((h) => /vollständiger Zyklus passt/.test(h.name)).name));

  // S10 (mittel): die Deaktivierung las das Pauschalwort statt des Stufenworts.
  const R = require("../lib/helmut/testkohorte-rueckbau");
  const deaktWort = S.stufenFreigabe("a", "deaktivierung", {}).erwartetesWort;
  const rueck = await R.fuehreRueckbauAus({
    stufe: "a", kennungen: [...S.kennungenDerStufe("a")], modus: "trockenlauf",
    env: { HELMUT_TESTKOHORTE_EXECUTE: "1", HELMUT_TESTKOHORTE_CONFIRM: deaktWort }
  });
  check("S10 das stufengenaue Deaktivierungswort wirkt jetzt tatsächlich",
    rueck.freigabe.erteilt === true && rueck.freigabe.erwartetesWort === deaktWort);
  check("S11 ohne Stufe bleibt das Pauschalwort maßgeblich",
    (await R.fuehreRueckbauAus({
      kennungen: [...S.kennungenDerStufe("a")], modus: "trockenlauf",
      env: { HELMUT_TESTKOHORTE_EXECUTE: "1", HELMUT_TESTKOHORTE_CONFIRM: deaktWort }
    })).freigabe.erteilt === false);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((f) => { console.error("Abbruch:", (f && f.stack) || f); process.exit(1); });
