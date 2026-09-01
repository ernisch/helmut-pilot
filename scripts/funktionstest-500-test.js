"use strict";

// Offline-Vertragstest des SICHERHEITSRAHMENS für den 500er-Funktionstest.
//
// Schwerpunkte (Auftrag „Tests" 6–9, 11–13):
//   * Kosten- und Aufrufdeckel
//   * Understanding-Reserve (Anteil IM Deckel, nie addiert)
//   * Azure-Minutenlimits (RPM/TPM)
//   * die zwölf Abbruchregeln
//   * unvollständige Konfiguration blockiert
//   * falscher Production-Commit blockiert
//   * Cron-Überschneidung blockiert
//
// Reine Rechenprüfung: kein Netz, keine Datenbank, kein Production-Wert.

const fs = require("fs");
const path = require("path");
const F = require("../lib/helmut/funktionstest-500");
const R = require("../lib/helmut/kommunikationsriegel");
const minimalCron = require("../lib/helmut/minimal-cron");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const COMMIT = "b998e9bc6a0ecca0cd3d43e344f03101c0ede5f0";

// Eine in sich stimmige, aber ausdrücklich NICHT freigegebene Beispielkonfiguration.
// Die Zahlen sind Szenariowerte aus kapazitaet-500.js, kein Production-Deckel.
const BEISPIEL = Object.freeze({
  gesamtdeckel: 2416,
  reserveVerstehen: 702,
  maxAnfragenJeMinute: 60,
  maxTokenJeMinute: 200000,
  kostenbudgetUsd: 12.5,
  vorrangreserveReal: 60,
  maxParallel: 1
});

const ALLE_MESSUNGEN = Object.freeze(Object.fromEntries(
  F.entscheidungstabelle().offeneMessungen.map((name) => [name, true])
));

const VOLLE_GRENZEN = Object.freeze({
  maxFehlerquote: 0.05,
  kostenbudgetUsd: 12.5,
  maxLaufzeitMinuten: 600,
  maxRueckstandWachstum: 200,
  erwarteterCommit: COMMIT
});

// Eine Beobachtungslage, in der alle zwölf Regeln bewertbar und still sind.
const RUHIGE_LAGE = Object.freeze({
  unbekannteModellaufrufe: 0,
  haengendeLeases: 0,
  fehlerquote: 0.01,
  kostenBisherUsd: 3.2,
  laufzeitMinuten: 120,
  drosselungen: 0,
  rueckstandWachstum: 10,
  bilanzVollstaendig: true,
  realeMandateVeraendert: 0,
  kommunikationsversuche: 0,
  productionCommit: COMMIT,
  fensterKonflikte: 0
});

function main() {
  console.log("Helmut — Vertragstest des Sicherheitsrahmens für den 500er-Funktionstest\n");

  // ── A · Sieben Pflichtwerte, fail closed ──────────────────────────────────
  console.log("== A · Kapazitäts- und Kostenriegel: sieben Pflichtwerte ==");
  check("A1 Es sind genau sieben Pflichtwerte definiert",
    F.PFLICHTWERTE.length === 7);
  check("A2 Die sieben Werte decken den Auftrag vollständig ab",
    F.PFLICHTWERTE.map((p) => p.schluessel).sort().join(",")
      === "gesamtdeckel,kostenbudgetUsd,maxAnfragenJeMinute,maxParallel,maxTokenJeMinute,reserveVerstehen,vorrangreserveReal");
  check("A3 Jeder Pflichtwert nennt Umgebungsnamen, Einheit und Wirkung bei Fehlen",
    F.PFLICHTWERTE.every((p) => p.env && p.einheit && p.ohneWert));

  const leer = F.pruefeKonfiguration({});
  check("A4 Eine leere Konfiguration ist nicht bereit",
    leer.bereit === false && leer.fehlendeWerte.length === 7);

  for (const feld of F.PFLICHTWERTE) {
    const luecke = { ...BEISPIEL };
    delete luecke[feld.schluessel];
    const befund = F.pruefeKonfiguration(luecke, { messungen: ALLE_MESSUNGEN });
    check(`A5-${feld.schluessel} Ein einziger fehlender Pflichtwert blockiert`,
      befund.bereit === false
        && befund.fehlendeWerte.some((f) => f.schluessel === feld.schluessel));
  }
  check("A6 Null, negative und gebrochene Werte gelten als fehlend",
    [0, -1, 1.5, "60", null].every((wert) =>
      F.pruefeKonfiguration({ ...BEISPIEL, maxAnfragenJeMinute: wert }, { messungen: ALLE_MESSUNGEN })
        .bereit === false));

  // ── B · Deckel, Reserve und Vorrang ───────────────────────────────────────
  console.log("\n== B · Deckel, Understanding-Reserve und Vorrangreserve ==");
  check("B1 Die Fairness-Untergrenze für 500 Mandate ist 2n−1 = 999",
    F.fairnessUntergrenze(500) === 999 && F.fairnessUntergrenze() === 999);
  const zuKlein = F.pruefeKonfiguration({ ...BEISPIEL, gesamtdeckel: 500 }, { messungen: ALLE_MESSUNGEN });
  check("B2 Ein Deckel unter der Fairness-Untergrenze wird abgewiesen",
    zuKlein.bereit === false
      && zuKlein.gebrocheneBindungen.some((n) => /Fairness-Untergrenze/.test(n)));
  const reserveZuGross = F.pruefeKonfiguration(
    { ...BEISPIEL, reserveVerstehen: 2416 }, { messungen: ALLE_MESSUNGEN });
  check("B3 Die Reserve LIEGT IM Deckel und darf ihn nicht erreichen",
    reserveZuGross.bereit === false
      && reserveZuGross.gebrocheneBindungen.some((n) => /nie addiert/.test(n)));
  const reservenZuGross = F.pruefeKonfiguration(
    { ...BEISPIEL, reserveVerstehen: 1500, vorrangreserveReal: 1000 }, { messungen: ALLE_MESSUNGEN });
  check("B4 Beide Reserven zusammen müssen in den Deckel passen",
    reservenZuGross.bereit === false
      && reservenZuGross.gebrocheneBindungen.some((n) => /Reserven zusammen/.test(n)));
  const vorrangZuKlein = F.pruefeKonfiguration(
    { ...BEISPIEL, vorrangreserveReal: 3 }, { messungen: ALLE_MESSUNGEN });
  check("B5 Die Vorrangreserve muss die realen Mandate decken",
    vorrangZuKlein.bereit === false
      && vorrangZuKlein.gebrocheneBindungen.some((n) => /realen Mandate/.test(n)));
  check("B6 Die Reserve wird NIE zum Deckel addiert (Deckel bleibt die Obergrenze)",
    (() => {
      const voll = F.pruefeKonfiguration(BEISPIEL, { messungen: ALLE_MESSUNGEN });
      const zeile = voll.empfehlung.zeilen.find((z) => z.wert === "reserveVerstehen");
      return voll.bereit === true && /Anteil IM Deckel/.test(zeile.empfehlung);
    })());

  // ── C · Azure-Minutenlimits ───────────────────────────────────────────────
  console.log("\n== C · Azure-Minutengrenzen (RPM/TPM) ==");
  check("C1 RPM und TPM sind eigene Pflichtwerte",
    F.PFLICHTWERTE.some((p) => p.schluessel === "maxAnfragenJeMinute")
      && F.PFLICHTWERTE.some((p) => p.schluessel === "maxTokenJeMinute"));
  const parallelZuGross = F.pruefeKonfiguration(
    { ...BEISPIEL, maxParallel: 61 }, { messungen: ALLE_MESSUNGEN });
  check("C2 Die Parallelität darf die RPM-Grenze nicht überschreiten",
    parallelZuGross.bereit === false
      && parallelZuGross.gebrocheneBindungen.some((n) => /Minutengrenze/.test(n)));
  // Grenzfall: ein Deckel GENAU an der RPM-Tageskapazität (1 RPM × 1440 min)
  // ist zulässig — die Bindung prüft „erreichbar", nicht „mit Luft erreichbar".
  const rpmGrenzfall = F.pruefeKonfiguration(
    { ...BEISPIEL, maxAnfragenJeMinute: 1, maxParallel: 1, gesamtdeckel: 1440 },
    { messungen: ALLE_MESSUNGEN });
  check("C3 Ein Deckel genau an der RPM-Tageskapazität ist zulässig",
    rpmGrenzfall.bereit === true, rpmGrenzfall.gebrocheneBindungen.join(", "));
  const rpmWirklichZuKlein = F.pruefeKonfiguration(
    { ...BEISPIEL, maxAnfragenJeMinute: 1, maxParallel: 1, gesamtdeckel: 2000 }, { messungen: ALLE_MESSUNGEN });
  check("C4 Deckel 2000 gegen 1 RPM (max. 1440/Tag) wird abgewiesen",
    rpmWirklichZuKlein.bereit === false
      && rpmWirklichZuKlein.gebrocheneBindungen.some((n) => /erreichbar/.test(n)));

  // ── D · Offene Messungen blockieren die Bereitschaft ──────────────────────
  console.log("\n== D · Offene Messungen blockieren ==");
  const ohneMessungen = F.pruefeKonfiguration(BEISPIEL);
  check("D1 Ohne die offenen Messungen ist auch eine stimmige Konfiguration nicht bereit",
    ohneMessungen.bereit === false && ohneMessungen.offeneMessungen.length === 5
      && ohneMessungen.gebrocheneBindungen.length === 0);
  check("D2 Die fünf offenen Messungen sind namentlich benannt",
    ohneMessungen.offeneMessungen.includes("azure-kontingente-und-rate-limits")
      && ohneMessungen.offeneMessungen.includes("vollstaendiger-fachwegbericht"));
  check("D3 Eine einzige fehlende Messung genügt zum Blockieren",
    F.pruefeKonfiguration(BEISPIEL, {
      messungen: { ...ALLE_MESSUNGEN, "azure-kontingente-und-rate-limits": false }
    }).bereit === false);

  // ── E · Entscheidungstabelle ohne Production-Wert ─────────────────────────
  console.log("\n== E · Entscheidungstabelle: Empfehlung statt Production-Wert ==");
  const tabelle = F.entscheidungstabelle();
  check("E1 Die Tabelle hat für jeden Pflichtwert eine Zeile",
    tabelle.zeilen.length === 7
      && F.PFLICHTWERTE.every((p) => tabelle.zeilen.some((z) => z.wert === p.schluessel)));
  check("E2 Jede Zeile nennt Herkunft und Verhalten bei fehlendem Wert",
    tabelle.zeilen.every((z) => z.herkunft && z.beiFehlendemWert === "fail closed — kein Testbeginn"));
  check("E3 Der Deckel ist als vorläufiger Szenariowert eingeordnet, nicht als Endwert",
    tabelle.einordnung === "vorlaeufiger-szenario-planungswert");
  check("E4 Die Spanne 1.492–2.416 erscheint als SPANNE, nicht als finaler Deckel",
    /1\.?492/.test(tabelle.warnung) && /2\.?416/.test(tabelle.warnung)
      && /kein finaler Production-Deckel/.test(tabelle.warnung));
  const deckelZeile = tabelle.zeilen.find((z) => z.wert === "gesamtdeckel");
  check("E5 Die Deckelzeile gibt eine Spanne aus, keinen Punktwert",
    /\d+–\d+/.test(deckelZeile.empfehlung) && /Szenariospanne/.test(deckelZeile.empfehlung),
    deckelZeile.empfehlung);
  check("E6 RPM, TPM und Kostenbudget sind ehrlich als OFFEN ausgewiesen",
    ["maxAnfragenJeMinute", "maxTokenJeMinute", "kostenbudgetUsd"]
      .every((w) => /^OFFEN/.test(tabelle.zeilen.find((z) => z.wert === w).empfehlung)));
  check("E7 Das Modul setzt selbst keinen Production-Wert",
    (() => {
      const quelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", "funktionstest-500.js"), "utf8");
      return !/process\.env\[[^\]]+\]\s*=/.test(quelle) && !/process\.env\.\w+\s*=/.test(quelle);
    })());

  // ── F · Abbruchgrenzen müssen vor Testbeginn gesetzt sein ────────────────
  console.log("\n== F · Abbruchgrenzen vor Testbeginn ==");
  check("F1 Ohne Grenzen ist der Testbeginn blockiert",
    F.pruefeGrenzen({}).vollstaendig === false && F.pruefeGrenzen({}).fehlend.length === 5);
  for (const name of F.GRENZEN_PFLICHT) {
    const luecke = { ...VOLLE_GRENZEN };
    delete luecke[name];
    check(`F2-${name} Eine einzige fehlende Grenze blockiert`,
      F.pruefeGrenzen(luecke).vollstaendig === false && F.pruefeGrenzen(luecke).fehlend.includes(name));
  }
  check("F3 Vollständige Grenzen geben den Beginn frei",
    F.pruefeGrenzen(VOLLE_GRENZEN).vollstaendig === true);
  check("F4 Eine Fehlerquote außerhalb 0..1 wird abgewiesen",
    F.pruefeGrenzen({ ...VOLLE_GRENZEN, maxFehlerquote: 1.5 }).vollstaendig === false);
  check("F5 Ein Commit, der kein voller SHA ist, wird abgewiesen",
    F.pruefeGrenzen({ ...VOLLE_GRENZEN, erwarteterCommit: "b998e9b" }).vollstaendig === false);

  // ── G · Die zwölf Abbruchregeln ───────────────────────────────────────────
  console.log("\n== G · Die zwölf Abbruchregeln ==");
  check("G1 Es sind genau zwölf Regeln definiert",
    F.ABBRUCHREGELN.length === 12);
  check("G2 Jede Regel nennt Beobachtungsgröße, Quelle und Beschreibung",
    F.ABBRUCHREGELN.every((r) => r.id && r.beobachtung && r.quelle && r.beschreibung));
  check("G3 Die Regel-IDs sind eindeutig",
    new Set(F.ABBRUCHREGELN.map((r) => r.id)).size === 12);

  const ruhig = F.pruefeAbbruch({ beobachtungen: RUHIGE_LAGE, grenzen: VOLLE_GRENZEN });
  check("G4 Eine vollständig ruhige Lage bricht nicht ab",
    ruhig.abbrechen === false && ruhig.nichtBewertbar.length === 0,
    ruhig.meldung);

  const ausloeser = [
    ["A01", { unbekannteModellaufrufe: 1 }],
    ["A02", { haengendeLeases: 1 }],
    ["A03", { fehlerquote: 0.2 }],
    ["A04", { kostenBisherUsd: 99 }],
    ["A05", { laufzeitMinuten: 900 }],
    ["A06", { drosselungen: 1 }],
    ["A07", { rueckstandWachstum: 5000 }],
    ["A08", { bilanzVollstaendig: false }],
    ["A09", { realeMandateVeraendert: 1 }],
    ["A10", { kommunikationsversuche: 1 }],
    ["A11", { productionCommit: "0".repeat(40) }],
    ["A12", { fensterKonflikte: 1 }]
  ];
  for (const [id, stoerung] of ausloeser) {
    const befund = F.pruefeAbbruch({
      beobachtungen: { ...RUHIGE_LAGE, ...stoerung }, grenzen: VOLLE_GRENZEN
    });
    check(`G5-${id} löst aus und bricht ab`,
      befund.abbrechen === true && befund.ausgeloest.includes(id) && befund.ausgeloest.length === 1);
  }

  // ── H · Fehlende Messwerte sind NICHT grün ────────────────────────────────
  console.log("\n== H · Ein fehlender Messwert ist nicht grün, sondern Abbruch ==");
  const ohneBeobachtung = F.pruefeAbbruch({ beobachtungen: {}, grenzen: VOLLE_GRENZEN });
  check("H1 Ohne Beobachtungen sind alle zwölf Regeln nicht bewertbar",
    ohneBeobachtung.nichtBewertbar.length === 12 && ohneBeobachtung.abbrechen === true);
  check("H2 Keine Regel meldet dabei fälschlich 'in Ordnung'",
    ohneBeobachtung.ausgeloest.length === 0
      && ohneBeobachtung.befunde.every((f) => f.bewertbar === false));
  for (const regel of F.ABBRUCHREGELN) {
    const luecke = { ...RUHIGE_LAGE };
    delete luecke[regel.beobachtung];
    const befund = F.pruefeAbbruch({ beobachtungen: luecke, grenzen: VOLLE_GRENZEN });
    check(`H3-${regel.id} Ein einzelner fehlender Messwert bricht ab`,
      befund.abbrechen === true && befund.nichtBewertbar.includes(regel.id));
  }
  check("H4 Eine fehlende Grenze macht ihre Regel unbewertbar",
    (() => {
      const ohneKosten = { ...VOLLE_GRENZEN };
      delete ohneKosten.kostenbudgetUsd;
      const befund = F.pruefeAbbruch({ beobachtungen: RUHIGE_LAGE, grenzen: ohneKosten });
      return befund.abbrechen === true && befund.nichtBewertbar.includes("A04");
    })());
  check("H5 null und undefined gelten nicht als gemessene Null",
    F.pruefeAbbruch({
      beobachtungen: { ...RUHIGE_LAGE, drosselungen: null }, grenzen: VOLLE_GRENZEN
    }).nichtBewertbar.includes("A06"));

  // ── I · Falscher Production-Commit blockiert ──────────────────────────────
  console.log("\n== I · Falscher Production-Commit blockiert ==");
  check("I1 Ein abweichender Commit löst A11 aus",
    F.pruefeAbbruch({
      beobachtungen: { ...RUHIGE_LAGE, productionCommit: "a".repeat(40) }, grenzen: VOLLE_GRENZEN
    }).ausgeloest.includes("A11"));
  check("I2 Der gleiche Commit löst A11 nicht aus",
    !F.pruefeAbbruch({ beobachtungen: RUHIGE_LAGE, grenzen: VOLLE_GRENZEN }).ausgeloest.includes("A11"));
  check("I3 Ein gekürzter Commit im Ist-Wert löst A11 aus",
    F.pruefeAbbruch({
      beobachtungen: { ...RUHIGE_LAGE, productionCommit: COMMIT.slice(0, 7) }, grenzen: VOLLE_GRENZEN
    }).ausgeloest.includes("A11"));

  // ── J · Cron-Überschneidung blockiert ─────────────────────────────────────
  console.log("\n== J · Cron- und Laufzeitüberschneidung blockiert ==");
  check("J1 Production trägt weiterhin genau 13 Crons ohne den Minimal-Cron",
    VERCEL.crons.length === 13
      && !VERCEL.crons.some((c) => c.schedule === minimalCron.MINIMAL_CRON_RHYTHMUS));
  const fensterFrueh = F.pruefeStartfenster({
    startUtc: "2026-09-10T05:40:00Z", dauerMinuten: 20, crons: VERCEL.crons, minimalCronAktiv: true
  });
  check("J2 Ein Fenster über 05:45 und 05:48 wird gesperrt",
    fensterFrueh.startErlaubt === false
      && fensterFrueh.konflikte.some((k) => k.art === "offene-laufzeitueberschneidung-0545-0548"),
    fensterFrueh.konflikte.map((k) => k.art).join(", "));
  check("J3 Der Konflikt nennt beide Routen und die offene Belegfrage",
    (() => {
      const k = fensterFrueh.konflikte.find((x) => x.art === "offene-laufzeitueberschneidung-0545-0548");
      return /lage-briefing/.test(k.path) && /understanding-rueckstand/.test(k.path)
        && /NICHT belegt/.test(k.hinweis);
    })());
  check("J4 Auch ohne Minimal-Cron sperrt das 05:45-Briefing das Fenster",
    F.pruefeStartfenster({
      startUtc: "2026-09-10T05:40:00Z", dauerMinuten: 20, crons: VERCEL.crons, minimalCronAktiv: false
    }).startErlaubt === false);
  check("J5 Ein belegter 05:45/05:48-Nachweis hebt NUR diesen einen Konflikt auf",
    (() => {
      const belegt = F.pruefeStartfenster({
        startUtc: "2026-09-10T05:40:00Z", dauerMinuten: 20, crons: VERCEL.crons,
        minimalCronAktiv: true, ueberschneidung0545Belegt: true
      });
      return belegt.startErlaubt === false
        && !belegt.konflikte.some((k) => k.art === "offene-laufzeitueberschneidung-0545-0548")
        && belegt.konflikte.some((k) => k.art === "bestandscron-im-fenster");
    })());
  check("J6 Ein aktiver Minimal-Cron sperrt jedes Fenster ab 60 Minuten",
    F.pruefeStartfenster({
      startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 60, crons: [], minimalCronAktiv: true
    }).konflikte.some((k) => k.art === "minimal-cron-slot-im-fenster"));
  check("J7 Ein freies Fenster ohne Minimal-Cron ist erlaubt",
    F.pruefeStartfenster({
      startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30, crons: VERCEL.crons, minimalCronAktiv: false
    }).startErlaubt === true);
  check("J8 Ein unvollständiges Startfenster ist nicht bewertbar und blockiert",
    F.pruefeStartfenster({}).startErlaubt === false
      && F.pruefeStartfenster({ startUtc: "2026-09-10T13:00:00Z" }).startErlaubt === false);
  check("J9 Ein nicht parsebarer Cron zählt konservativ als Konflikt",
    F.pruefeStartfenster({
      startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 10,
      crons: [{ path: "/api/x", schedule: "kaputt" }]
    }).konflikte.some((k) => k.art === "cron-nicht-parsebar"));
  check("J10 minimal-cron.laufzeitUeberschneidungen benennt weiterhin genau das 05:45-Paar",
    (() => {
      const treffer = minimalCron.laufzeitUeberschneidungen(VERCEL.crons);
      return Array.isArray(treffer) && treffer.length === 1
        && treffer[0].path === "/api/cron/lage-briefing" && treffer[0].slotMinute === 48;
    })());
  check("J11 Der Minimal-Cron bleibt AUS — dieses Modul aktiviert ihn nicht",
    (() => {
      const quelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", "funktionstest-500.js"), "utf8");
      return !/vercel\.json/.test(quelle.replace(/\/\/.*$/gm, "")) && !/crons\s*\.push/.test(quelle);
    })());

  // ── K · Gesamtbereitschaft ────────────────────────────────────────────────
  console.log("\n== K · Gesamtbereitschaft ==");
  const nichtsGesetzt = F.startbereitschaft({});
  check("K1 Ohne alles ist der Test nicht startbereit",
    nichtsGesetzt.startbereit === false && nichtsGesetzt.offen.length === 5);
  const allesGesetzt = F.startbereitschaft({
    konfiguration: BEISPIEL,
    grenzen: VOLLE_GRENZEN,
    messungen: ALLE_MESSUNGEN,
    startfenster: { startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30, crons: VERCEL.crons, minimalCronAktiv: false },
    isolation: true,
    env: { [R.SCHALTER]: R.SCHALTER_WERT_GESPERRT }
  });
  check("K2 Mit allen Vorbedingungen meldet der Rahmen startbereit",
    allesGesetzt.startbereit === true, allesGesetzt.offen.join(", "));
  check("K3 Ohne scharfen Kommunikationsriegel ist der Test nicht startbereit",
    F.startbereitschaft({
      konfiguration: BEISPIEL, grenzen: VOLLE_GRENZEN, messungen: ALLE_MESSUNGEN,
      startfenster: { startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30, crons: VERCEL.crons },
      isolation: true, env: {}
    }).offen.some((n) => /Kommunikationsriegel/.test(n)));
  check("K4 Ohne Isolationsbefund ist der Test nicht startbereit",
    F.startbereitschaft({
      konfiguration: BEISPIEL, grenzen: VOLLE_GRENZEN, messungen: ALLE_MESSUNGEN,
      startfenster: { startUtc: "2026-09-10T13:00:00Z", dauerMinuten: 30, crons: VERCEL.crons },
      isolation: null, env: { [R.SCHALTER]: R.SCHALTER_WERT_GESPERRT }
    }).offen.some((n) => /Isolation/.test(n)));
  check("K5 Auch bei voller Bereitschaft bleibt der Start eine getrennte Freigabe",
    /getrennte Betreiberfreigabe/.test(allesGesetzt.meldung));

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main();
