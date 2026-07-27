"use strict";

// Lebenszyklus, Telemetrie, Nachholpfad und Watchdog der Vorgangsbildung.
// REINE LOGIK: kein Netz, keine KI, keine DB.
//
// Kernaussage, die hier abgesichert wird (Betriebsbefund B4, Phasen 7, 8 und 10):
//   Kein Rohdokument darf einen undefinierten Endzustand haben, jeder
//   Verarbeitungsausgang ist klassifiziert und zaehlbar, und was nicht
//   abgeschlossen ist, muss gezielt und idempotent nachholbar sein.

const fs = require("fs");
const path = require("path");
const L = require("../lib/helmut/vorgangs-lebenszyklus");
const { buildOutcomeTelemetry, ERGEBNISGRUPPEN, understandOneCluster } = require("../lib/helmut/understanding");
const { aggregateVorgangsbildung, istVorgangsbildungsLauf } = require("../lib/helmut/storage");
const { parseArgs: nachholArgs } = require("../scripts/vorgangsbildung-nachholen");

let fail = 0;
let n = 0;
function check(name, cond, detail = "") { n += 1; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); if (!cond) fail += 1; }

const JETZT = Date.parse("2026-07-26T20:00:00Z");
const vorStunden = (h) => new Date(JETZT - h * 3600000).toISOString();

// =========================================================================
// 1 · classifyDocument — jeder Zustand genau einmal
// =========================================================================
const koVerstanden = { id: "ko-a", vorgang_id: "vg-a", status: "neu", understanding_status: "complete", ko_version: 1, created_at: vorStunden(5) };
const koAktualisiert = { id: "ko-b", vorgang_id: "vg-b", status: "neu", understanding_status: "complete", ko_version: 3, created_at: vorStunden(30) };
const koVorgemerkt = { id: "ko-c", vorgang_id: "vg-c", status: "pending", understanding_status: "pending", created_at: vorStunden(3) };
const koGeparkt = { id: "ko-d", vorgang_id: "vg-d", status: "pending", understanding_status: "failed", created_at: vorStunden(10) };
const koTerminal = { id: "ko-e", vorgang_id: "vg-e", status: "pending", understanding_status: "failed-final", created_at: vorStunden(48) };

check("1 · an einem verstandenen Vorgang -> verstanden",
  L.classifyDocument({ id: "d1", created_at: vorStunden(6) }, [koVerstanden], { now: JETZT }).zustand === L.ZUSTAND.VERSTANDEN);
check("1 · an einem terminal aussortierten Vorgang -> ausgeschlossen",
  L.classifyDocument({ id: "d2", created_at: vorStunden(50) }, [koTerminal], { now: JETZT }).zustand === L.ZUSTAND.AUSGESCHLOSSEN);
check("1 · an einem geparkten Vorgang -> fehlgeschlagen",
  L.classifyDocument({ id: "d3", created_at: vorStunden(11) }, [koGeparkt], { now: JETZT }).zustand === L.ZUSTAND.FEHLGESCHLAGEN);
check("1 · an einem vorgemerkten Vorgang -> wiedervorlage",
  L.classifyDocument({ id: "d4", created_at: vorStunden(4) }, [koVorgemerkt], { now: JETZT }).zustand === L.ZUSTAND.WIEDERVORLAGE);
check("1 · unverknuepft innerhalb der Karenzzeit -> offen (kein Befund)",
  L.classifyDocument({ id: "d5", created_at: vorStunden(3) }, [], { now: JETZT }).zustand === L.ZUSTAND.OFFEN);
check("1 · unverknuepft nach der Karenzzeit -> OHNE Endzustand (Befund)",
  L.classifyDocument({ id: "d6", created_at: vorStunden(48) }, [], { now: JETZT }).zustand === L.ZUSTAND.OHNE_ENDZUSTAND);
check("1 · ohne Zeitstempel gilt ein unverknuepftes Dokument als Befund, nicht als offen",
  L.classifyDocument({ id: "d7" }, [], { now: JETZT }).zustand === L.ZUSTAND.OHNE_ENDZUSTAND);
check("1 · genau EIN Zustand ist ungueltig — alle anderen zaehlen als Abschluss",
  L.GUELTIGE_ENDZUSTAENDE.size === Object.keys(L.ZUSTAND).length - 1
    && !L.GUELTIGE_ENDZUSTAENDE.has(L.ZUSTAND.OHNE_ENDZUSTAND));

// Mehrfachverknuepfung: der staerkste Zustand gewinnt.
check("1 · haengt ein Dokument an Vormerkung UND verstandenem Vorgang, gilt verstanden",
  L.classifyDocument({ id: "d8", created_at: vorStunden(6) }, [koVorgemerkt, koVerstanden], { now: JETZT }).zustand === L.ZUSTAND.VERSTANDEN);

// Ableitbare Zusatzinformation statt erfundener Feinklassifikation.
const spaet = L.classifyDocument({ id: "d9", created_at: vorStunden(2) }, [koVerstanden], { now: JETZT });
check("1 · ein spaeter eingetroffenes Dokument ist als Ergaenzung erkennbar", spaet.spaeterErgaenzt === true);
check("1 · die Vorgangsversion wird durchgereicht (Aktualisierung nachvollziehbar)",
  L.classifyDocument({ id: "d10", created_at: vorStunden(31) }, [koAktualisiert], { now: JETZT }).koVersion === 3);

// =========================================================================
// 2 · assessLifecycle — Gesamtbild, Kennzahlen, aeltestes offenes Dokument
// =========================================================================
const rawDocs = [
  { id: "r1", created_at: vorStunden(6), source_id: "q1" },
  { id: "r2", created_at: vorStunden(6), source_id: "q1" },
  { id: "r3", created_at: vorStunden(50), source_id: "q2" },   // ohne Endzustand
  { id: "r4", created_at: vorStunden(120), source_id: "q2" },  // ohne Endzustand, aeltestes
  { id: "r5", created_at: vorStunden(2), source_id: "q3" },    // offen in Karenz
  { id: "r6", created_at: vorStunden(11), source_id: "q3" },   // fehlgeschlagen
  { id: "r7", created_at: vorStunden(4), source_id: "q4" }     // wiedervorlage
];
const links = [
  { raw_document_id: "r1", knowledge_object_id: "ko-a" },
  { raw_document_id: "r2", knowledge_object_id: "ko-a" },
  { raw_document_id: "r6", knowledge_object_id: "ko-d" },
  { raw_document_id: "r7", knowledge_object_id: "ko-c" }
];
const kos = [koVerstanden, koVorgemerkt, koGeparkt, koTerminal];
const bewertung = L.assessLifecycle({ rawDocs, links, kos, now: JETZT });

check("2 · jedes Dokument wird genau einmal klassifiziert",
  bewertung.gesamt === rawDocs.length
    && Object.values(bewertung.zustaende).reduce((a, b) => a + b, 0) === rawDocs.length,
  JSON.stringify(bewertung.zustaende));
check("2 · zwei Dokumente ohne Endzustand werden erkannt", bewertung.zustaende[L.ZUSTAND.OHNE_ENDZUSTAND] === 2);
check("2 · das aelteste Dokument ohne Endzustand wird namentlich benannt",
  bewertung.aeltestesOhneEndzustand && bewertung.aeltestesOhneEndzustand.id === "r4", JSON.stringify(bewertung.aeltestesOhneEndzustand));
check("2 · Anteile werden ausgewiesen (kein falsches Gruen durch Weglassen)",
  bewertung.anteile[L.ZUSTAND.OHNE_ENDZUSTAND] > 0 && bewertung.anteile[L.ZUSTAND.VERSTANDEN] > 0, JSON.stringify(bewertung.anteile));
check("2 · Verarbeitungsdauer wird aus echten Zeitstempeln gemessen, nicht geschaetzt",
  bewertung.verarbeitungsdauer.gemessen === 4 && bewertung.verarbeitungsdauer.maxMs > 0, JSON.stringify(bewertung.verarbeitungsdauer));
check("2 · ein leeres Fenster erzeugt keine erfundenen Zahlen",
  L.assessLifecycle({ rawDocs: [], links: [], kos: [], now: JETZT }).gesamt === 0);

// =========================================================================
// 3 · Watchdog — meldet, statt still zu bleiben
// =========================================================================
const wd = L.watchdogVorgangsbildung(bewertung);
check("3 · Dokumente ohne Endzustand loesen einen Alarm aus", wd.zustand === "alarm", JSON.stringify(wd.kennzahlen));
check("3 · die Meldung nennt Zahl UND Anteil", wd.meldungen.some((m) => /2 von 7/.test(m) && /%/.test(m)), JSON.stringify(wd.meldungen));
check("3 · Wiedervorlagen und geparkte Faelle werden gesondert gemeldet",
  wd.meldungen.some((m) => /erneute Verarbeitung/.test(m)) && wd.meldungen.some((m) => /geparkt/.test(m)));

const sauber = L.assessLifecycle({
  rawDocs: [{ id: "s1", created_at: vorStunden(6) }, { id: "s2", created_at: vorStunden(2) }],
  links: [{ raw_document_id: "s1", knowledge_object_id: "ko-a" }], kos: [koVerstanden], now: JETZT
});
check("3 · ein sauberer Bestand meldet ok", L.watchdogVorgangsbildung(sauber).zustand === "ok");
check("3 · ein LEERES Fenster meldet 'unbekannt', nicht 'ok' (kein falsches Gruen)",
  L.watchdogVorgangsbildung(L.assessLifecycle({ rawDocs: [], links: [], kos: [], now: JETZT })).zustand === "unbekannt");

// =========================================================================
// 4 · Nachhol-Kandidaten — richtig ausgewaehlt, sicher begrenzt
// =========================================================================
const k = L.nachholKandidaten(bewertung, { limit: 200 });
const kIds = k.kandidaten.map((x) => x.id).sort();
check("4 · Kandidaten sind genau die unfertigen Dokumente",
  JSON.stringify(kIds) === JSON.stringify(["r3", "r4", "r6", "r7"]), JSON.stringify(kIds));
check("4 · VERSTANDENE Dokumente sind niemals Kandidaten (kein Duplizieren)",
  !kIds.includes("r1") && !kIds.includes("r2"));
check("4 · BEWUSST AUSGESCHLOSSENE Dokumente sind niemals Kandidaten",
  !L.NACHHOLBARE_ZUSTAENDE.has(L.ZUSTAND.AUSGESCHLOSSEN));
check("4 · Dokumente in der Karenzzeit werden nicht vorzeitig nachgeholt", !kIds.includes("r5"));
const begrenzt = L.nachholKandidaten(bewertung, { limit: 2 });
check("4 · die Mengenbegrenzung greift und wird EHRLICH als Kappung ausgewiesen",
  begrenzt.kandidaten.length === 2 && begrenzt.gekappt === true && begrenzt.gesamt === 4, JSON.stringify(begrenzt.gesamt));

// Grosse Mengen: die Auswahl muss auch bei Tausenden Dokumenten begrenzt bleiben.
const vieleDocs = Array.from({ length: 5000 }, (_, i) => ({ id: `v${i}`, created_at: vorStunden(100) }));
const vieleBewertung = L.assessLifecycle({ rawDocs: vieleDocs, links: [], kos: [], now: JETZT });
const vieleK = L.nachholKandidaten(vieleBewertung, { limit: 200 });
check("5 · bei 5000 offenen Dokumenten liefert die Auswahl hoechstens das Limit",
  vieleK.kandidaten.length === 200 && vieleK.gesamt === 5000 && vieleK.gekappt === true);
check("5 · der Watchdog meldet die volle Zahl, nicht die gekappte",
  L.watchdogVorgangsbildung(vieleBewertung).kennzahlen.ohneEndzustand === 5000);
check("5 · die namentliche Meldung ist gekappt, die Gesamtzahl bleibt ehrlich",
  vieleBewertung.ohneEndzustandIds.length === L.MAX_GEMELDETE_IDS && vieleBewertung.ohneEndzustandGesamt === 5000);

// =========================================================================
// 5b · Karenzzeit — konfigurierbar, Standard unveraendert
// =========================================================================
// Ein Dokument von vor 10 h: mit Standard-Karenz offen, mit 0 h ein Rueckstand.
const frisch = { id: "k1", created_at: vorStunden(10) };
check("5b · Standard-Karenz (24 h) laesst ein 10 h altes Dokument als offen gelten",
  L.classifyDocument(frisch, [], { now: JETZT }).zustand === L.ZUSTAND.OFFEN);
check("5b · `--karenz=0` macht dasselbe Dokument zum Rueckstand",
  L.classifyDocument(frisch, [], { now: JETZT, karenzStunden: 0 }).zustand === L.ZUSTAND.OHNE_ENDZUSTAND);
check("5b · eine laengere Karenz (48 h) entlastet umgekehrt",
  L.classifyDocument({ id: "k2", created_at: vorStunden(30) }, [], { now: JETZT, karenzStunden: 48 }).zustand === L.ZUSTAND.OFFEN);
check("5b · der Modul-Standard bleibt bei 24 h (Rueckwaertskompatibilitaet)", L.KARENZ_STUNDEN === 24);

const bewKarenz0 = L.assessLifecycle({ rawDocs, links, kos, now: JETZT, karenzStunden: 0 });
check("5b · ohne Karenz werden zuvor 'offene' Dokumente zu Nachhol-Kandidaten",
  bewKarenz0.zustaende[L.ZUSTAND.OFFEN] === 0
    && bewKarenz0.zustaende[L.ZUSTAND.OHNE_ENDZUSTAND] === bewertung.zustaende[L.ZUSTAND.OHNE_ENDZUSTAND] + bewertung.zustaende[L.ZUSTAND.OFFEN],
  JSON.stringify(bewKarenz0.zustaende));
check("5b · verstandene Dokumente bleiben auch ohne Karenz unangetastet",
  bewKarenz0.zustaende[L.ZUSTAND.VERSTANDEN] === bewertung.zustaende[L.ZUSTAND.VERSTANDEN]);
check("5b · die verwendete Karenz wird im Ergebnis mitgefuehrt (nicht still angewandt)",
  bewKarenz0.karenzStunden === 0 && bewertung.karenzStunden === 24);

// Argumentauswertung des Werkzeugs
const args = (...a) => nachholArgs(["node", "skript", ...a]);
check("5b · ohne Angabe bleibt die Karenz null -> Modul-Standard gilt", args().karenz === null);
check("5b · `--karenz=0` wird als gueltige 0 erkannt (nicht als 'fehlt')", args("--karenz=0").karenz === 0);
check("5b · `--karenz=72` wird uebernommen", args("--karenz=72").karenz === 72);
check("5b · alle uebrigen Voreinstellungen sind unveraendert",
  args().tage === 7 && args().max === 200 && args().vorschau === false && args().ausfuehren === false);
check("5b · `--ausfuehren` impliziert weiterhin die Kandidatenermittlung", args("--ausfuehren").vorschau === true);

// =========================================================================
// 6 · Lauftelemetrie — jeder Ausgang klassifiziert und zaehlbar
// =========================================================================
const alleStatus = Object.keys(ERGEBNISGRUPPEN);
check("6 · `skipped-exists` ist keine Ergebnisklasse mehr", !alleStatus.includes("skipped-exists"));
check("6 · alle Ergebnisklassen sind einer Gruppe zugeordnet (keine offene Kategorie)",
  alleStatus.every((s) => typeof ERGEBNISGRUPPEN[s] === "string" && ERGEBNISGRUPPEN[s].length > 0));

// STRUKTURTEST gegen genau die Fehlerklasse, die beim Production-Nachweis auffiel:
// eine Ergebnisklasse wird im Code zurueckgegeben, fehlt aber in der Zuordnung —
// und faellt damit still in "unbekannt". Der Test liest die tatsaechlich im
// Quelltext vergebenen Status und vergleicht sie mit der Zuordnungstabelle.
(() => {
  const quelle = fs.readFileSync(path.join(__dirname, "..", "lib/helmut/understanding.js"), "utf8");
  const vergeben = new Set();
  // Nur Zuweisungen an das Feld `status` — sowohl direkt als auch als Ternaer.
  for (const m of quelle.matchAll(/status:\s*"([a-z-]+)"/g)) vergeben.add(m[1]);
  for (const m of quelle.matchAll(/status:\s*[^,\n]*?\?\s*"([a-z-]+)"\s*:\s*"([a-z-]+)"/g)) { vergeben.add(m[1]); vergeben.add(m[2]); }
  // Zustandswerte des Knowledge Objects sind KEINE Ergebnisklassen des Laufs.
  for (const kein of ["complete", "neu", "pending", "failed", "failed-final"]) vergeben.delete(kein);
  const fehlend = [...vergeben].filter((s) => !ERGEBNISGRUPPEN[s]).sort();
  check("6 · JEDE im Code vergebene Ergebnisklasse ist in ERGEBNISGRUPPEN zugeordnet",
    fehlend.length === 0, fehlend.length ? `nicht zugeordnet: ${fehlend.join(", ")}` : `${vergeben.size} geprueft`);
  check("6 · die Zuordnung enthaelt die Ergebnisse des Pending-Pfads",
    ERGEBNISGRUPPEN["skipped-no-cluster"] === "erneut" && ERGEBNISGRUPPEN["skipped-no-vorgang"] === "fehlgeschlagen");
})();

const clusters = [
  { documents: [{ id: "a" }, { id: "b" }] },
  { documents: [{ id: "c" }] },
  { documents: [{ id: "d" }] },
  { documents: [{ id: "e" }] }
];
const results = [
  { status: "saved", documents: 2, vorgangId: "vg-1", resolution: "neu" },
  { status: "merged", documents: 1, vorgangId: "vg-2", resolution: "bestand" },
  { status: "skipped-budget", documents: 1, vorgangId: "vg-3", resolution: "neu" },
  { status: "skipped-error", documents: 1, vorgangId: "vg-4", resolution: "konflikt-neue-kennung", errorCode: "HTTP 500" }
];
const t = buildOutcomeTelemetry({ clusters, results, deferred: 0, vorgemerkt: 0 });
check("6 · jede Ergebnisklasse wird gezaehlt", t.ergebnisse.saved === 1 && t.ergebnisse.merged === 1 && t.ergebnisse["skipped-budget"] === 1);
check("6 · Gruppen fassen die Klassen betriebstauglich zusammen",
  t.gruppen.verarbeitet === 1 && t.gruppen.zusammengefuehrt === 1 && t.gruppen.erneut === 1 && t.gruppen.fehlgeschlagen === 1,
  JSON.stringify(t.gruppen));
check("6 · KEIN Ergebnis faellt in 'unbekannt'", t.gruppen.unbekannt === 0);
check("6 · Dokumente ohne Endzustand werden je Lauf ausgewiesen",
  t.dokumente === 5 && t.dokumenteOhneEndzustand === 1, `${t.dokumente}/${t.dokumenteOhneEndzustand}`);
check("6 · Aufloesungen werden gezaehlt (neu / bestand / technischer Konflikt)",
  t.aufloesungen.neu === 2 && t.aufloesungen.bestand === 1 && t.aufloesungen["konflikt-neue-kennung"] === 1, JSON.stringify(t.aufloesungen));
check("6 · Anteile je Gruppe werden ausgewiesen", t.anteile.verarbeitet === 25, JSON.stringify(t.anteile));
check("6 · Auffaelligkeiten nennen Konflikte und Fehlschlaege namentlich",
  t.auffaelligkeitenGesamt === 1 && t.auffaelligkeiten[0].vorgangId === "vg-4", JSON.stringify(t.auffaelligkeiten));
check("6 · zurueckgestellte Cluster zaehlen als 'erneut einplanen', nicht als erledigt",
  buildOutcomeTelemetry({ clusters, results, deferred: 12 }).gruppen.erneut === 13);
check("6 · eine sehr lange Auffaelligkeitsliste wird gekappt, die Gesamtzahl bleibt ehrlich",
  (() => {
    const viele = Array.from({ length: 100 }, (_, i) => ({ status: "skipped-error", documents: 1, vorgangId: `vg-${i}` }));
    const tt = buildOutcomeTelemetry({ clusterCount: 100, results: viele });
    return tt.auffaelligkeiten.length === 25 && tt.auffaelligkeitenGesamt === 100;
  })());

// =========================================================================
// 7 · Tageskennzahlen — je Lauf UND je Tag
// =========================================================================
const laeufe = [
  { process: "understanding-eager", createdAt: "2026-07-26T20:05:00Z", cluster: 10, dokumente: 30, dokumenteOhneEndzustand: 2, deferred: 3, vorgemerkt: 3, grossereignisse: 1, gruppen: { verarbeitet: 4, zusammengefuehrt: 2, duplikate: 1, erneut: 3 }, ergebnisse: { saved: 4, merged: 2, duplicate: 1 }, aufloesungen: { neu: 4, bestand: 3 } },
  { process: "understanding-cron", createdAt: "2026-07-26T05:35:00Z", cluster: 5, dokumente: 12, dokumenteOhneEndzustand: 0, deferred: 0, vorgemerkt: 0, grossereignisse: 0, gruppen: { verarbeitet: 5 }, ergebnisse: { saved: 5 }, aufloesungen: { neu: 5 } },
  { process: "understanding-eager", createdAt: "2026-07-25T20:05:00Z", cluster: 8, dokumente: 20, dokumenteOhneEndzustand: 1, deferred: 1, vorgemerkt: 1, grossereignisse: 0, gruppen: { verarbeitet: 7, erneut: 1 }, ergebnisse: { saved: 7 }, aufloesungen: { neu: 7 } },
  { process: "crawl", createdAt: "2026-07-26T04:00:00Z", cluster: 999 }
];
const agg = aggregateVorgangsbildung(laeufe, { tage: 3650 });
check("7 · fremde Prozesse fliessen nicht in die Kennzahlen ein", agg.gesamt.cluster === 23, `cluster=${agg.gesamt.cluster}`);

// Der beim Production-Nachweis gefundene Fehler: die Aggregation filterte auf
// `understanding-lagecheck`, geschrieben wird aber `understanding-lage`;
// `understanding-nachhol` fehlte ganz. Beide Lauftypen fielen still heraus.
(() => {
  const geschrieben = ["understanding-eager", "understanding-lage", "understanding-cron", "understanding-nachhol"];
  for (const p of geschrieben) {
    check(`7 · Lauftyp "${p}" zaehlt in die Kennzahlen`, istVorgangsbildungsLauf({ process: p }) === true);
  }
  for (const p of ["crawl", "briefing-lage", "briefing-morning", "understanding", null, undefined]) {
    check(`7 · fremder Lauftyp "${p}" zaehlt NICHT`, istVorgangsbildungsLauf({ process: p }) === false);
  }
  // Gegenprobe an echten Daten statt an der Hilfsfunktion allein.
  const mitLage = aggregateVorgangsbildung([
    { process: "understanding-lage", createdAt: "2026-07-26T10:00:00Z", cluster: 5, gruppen: { verarbeitet: 5 } },
    { process: "understanding-nachhol", createdAt: "2026-07-26T11:00:00Z", cluster: 3, gruppen: { verarbeitet: 3 } }
  ], { tage: 3650 });
  check("7 · Lage- UND Nachhol-Laeufe erscheinen in der Tagesauswertung",
    mitLage.gesamt.laeufe === 2 && mitLage.gesamt.cluster === 8 && mitLage.gesamt.gruppen.verarbeitet === 8,
    JSON.stringify(mitLage.gesamt.gruppen));
  // Strukturell: jeder im Code geschriebene Prozessname muss erfasst werden.
  const src = ["lib/helmut/scheduler.js", "server.js", "scripts/vorgangsbildung-nachholen.js"]
    .map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n");
  const namen = new Set([...src.matchAll(/process:\s*"(understanding-[a-z]+)"/g)].map((m) => m[1]));
  const nichtErfasst = [...namen].filter((p) => !istVorgangsbildungsLauf({ process: p }));
  check("7 · JEDER im Code geschriebene understanding-Lauftyp wird erfasst",
    nichtErfasst.length === 0, nichtErfasst.length ? nichtErfasst.join(", ") : `${namen.size} geprueft: ${[...namen].join(", ")}`);
})();
check("7 · die Kennzahlen liegen je TAG vor", agg.jeTag.length === 2 && agg.jeTag[0].tag === "2026-07-26", JSON.stringify(agg.jeTag.map((x) => x.tag)));
check("7 · je Tag werden Laeufe, Cluster und Gruppen summiert",
  agg.jeTag[0].laeufe === 2 && agg.jeTag[0].cluster === 15 && agg.jeTag[0].gruppen.verarbeitet === 9, JSON.stringify(agg.jeTag[0].gruppen));
check("7 · Dokumente ohne Endzustand werden ueber alle Laeufe summiert", agg.gesamt.dokumenteOhneEndzustand === 3);
check("7 · Grossereignisse und Vormerkungen sind je Tag nachvollziehbar",
  agg.jeTag[0].grossereignisse === 1 && agg.jeTag[0].vorgemerkt === 3);
check("7 · Anteile je Gruppe werden berechnet", agg.gesamt.anteile.verarbeitet > 0, JSON.stringify(agg.gesamt.anteile));

// =========================================================================
// 8 · Idempotenz des Nachholens
// =========================================================================
(async () => {
  const gespeichert = [];
  const verknuepft = [];
  let kiAufrufe = 0;
  const analyse = {
    headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
    parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
    zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
    display_title: "Bundesrat beschliesst Reform der Grundsicherung",
    display_summary: "s", why_relevant: "w", recommendation: "r", display_category: "Soziales"
  };
  const cluster = { documents: [{ id: "rd-1", title: "Bundesrat beschliesst Reform der Grundsicherung", published_at: "2026-07-26T08:00:00Z" }] };
  const deps = {
    canSpend: () => ({ allowed: true }),
    requestUnderstanding: async () => { kiAufrufe += 1; return { ...analyse }; },
    save: async (ko) => { gespeichert.push(ko); return { saved: true, id: ko.id }; },
    saveSources: async (koId, docs) => { verknuepft.push({ koId, ids: docs.map((x) => x.id) }); },
    markFailed: async () => {}, modelName: () => "test", logSkip: () => {},
    findVorgangCandidates: async () => [],
    listVorgangDocuments: async () => []
  };

  const ersterLauf = await understandOneCluster(cluster, deps);
  check("8 · erstes Nachholen erzeugt einen Vorgang", ersterLauf.status === "saved" && kiAufrufe === 1);

  // Zweiter Lauf: der Vorgang existiert jetzt und traegt SEINE Dokumente.
  const bestand = { id: ersterLauf.id, vorgang_id: ersterLauf.vorgangId, status: "neu", understanding_status: "complete", ko_version: 1, created_at: "2026-07-26T08:05:00Z" };
  const zweiterLauf = await understandOneCluster(cluster, {
    ...deps,
    findVorgangCandidates: async () => [bestand],
    listVorgangDocuments: async () => cluster.documents
  });
  check("8 · zweites Nachholen desselben Dokuments ist idempotent (duplicate, 0 KI-Aufrufe)",
    zweiterLauf.status === "duplicate" && kiAufrufe === 1, `status=${zweiterLauf.status} aufrufe=${kiAufrufe}`);
  check("8 · und erzeugt keinen zweiten Vorgang", gespeichert.length === 1);
  check("8 · beide Laeufe liefern dieselbe Vorgangskennung", zweiterLauf.vorgangId === ersterLauf.vorgangId);

  // Fehlgeschlagene Dokumente bekommen eine Verknuepfung — sonst waeren sie von
  // nie verarbeiteten Dokumenten nicht unterscheidbar.
  verknuepft.length = 0;
  const fehler = await understandOneCluster(cluster, {
    ...deps, requestUnderstanding: async () => { throw new Error("HTTP 500"); }
  });
  check("8 · ein KI-Fehler parkt den Vorgang UND verknuepft die Dokumente",
    fehler.status === "skipped-error" && verknuepft.length === 1 && verknuepft[0].ids[0] === "rd-1", JSON.stringify(verknuepft));

  // Budget-Stopp darf NICHT verknuepfen: das Dokument ist vertagt, nicht verarbeitet.
  verknuepft.length = 0;
  const budget = await understandOneCluster(cluster, { ...deps, canSpend: () => ({ allowed: false, reason: "daily-llm-budget-reached" }) });
  check("8 · ein Budget-Stopp verknuepft NICHT (das Dokument bleibt Nachholkandidat)",
    budget.status === "skipped-budget" && verknuepft.length === 0, `status=${budget.status} links=${verknuepft.length}`);

  // =======================================================================
  // 9 · Mandantentrennung
  // =======================================================================
  const gespeicherteFelder = new Set(gespeichert.flatMap((ko) => Object.keys(ko)));
  check("9 · ein Vorgang traegt KEINE Mandantenkennung (global genau einmal verstanden)",
    !gespeicherteFelder.has("user_id") && !gespeicherteFelder.has("tenant_id") && !gespeicherteFelder.has("politicianId"),
    JSON.stringify([...gespeicherteFelder].filter((f) => /user|tenant|politician/i.test(f))));
  check("9 · der Lebenszyklus wertet ebenfalls mandantenneutral aus (kein Mandantenfeld)",
    !JSON.stringify(bewertung.je[0]).match(/user_id|tenant_id|politicianId/));

  console.log(`\n${n - fail}/${n} Assertions erfolgreich.`);
  if (fail) console.log(`\nFEHLGESCHLAGEN: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
