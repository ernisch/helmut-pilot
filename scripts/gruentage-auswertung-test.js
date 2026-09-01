"use strict";

// Offline-Test der Gruentage-Auswertung (scripts/gruentage-auswertung.js).
// KEIN Netz, KEINE Datenbank: geprueft werden ausschliesslich die reinen
// Bewertungsfunktionen mit synthetischen Quittungen. UTC-stabil: alle Zeiten
// sind feste ISO-Zeitpunkte, nie "jetzt".

const g = require("./gruentage-auswertung.js");

let passed = 0; let failed = 0;
function check(name, bedingung) {
  if (bedingung) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}`); }
}

const TAG = "2026-09-01"; // der bewertete volle UTC-Tag

// Baut eine synthetische, den Tag deckende Quittung (erhoben am Folgetag 00:30 UTC).
function quittung(aenderungen = {}) {
  const basis = {
    schema: g.SCHEMA,
    erhobenUtc: "2026-09-02T00:30:00.000Z",
    tagUtc: "2026-09-02",
    rueckblickTage: 3,
    lesungVollstaendig: true,
    mandate: { aktiv: 5, gesamt: 9 },
    momentaufnahme: {
      wartend: 10, laeuft: 0, haengendeLeases: 0, dubletten: 0,
      cas: { fertig: 700, unbekannt: 0, aufgegeben: 1, offen: 0, reserviert: 0, "modell-laeuft": 0 },
      casAktiveLeases: 0
    },
    rohdaten: {
      jobs: [
        // 3 angekommen, 3 am selben Tag erledigt — Abfluss deckt die Ankunft
        { status: "erledigt", created_at: `${TAG}T04:00:10Z`, due_at: `${TAG}T04:00:10Z`, finished_at: `${TAG}T04:03:00Z` },
        { status: "erledigt", created_at: `${TAG}T04:00:20Z`, due_at: `${TAG}T04:00:20Z`, finished_at: `${TAG}T16:02:00Z` },
        { status: "erledigt", created_at: `${TAG}T16:00:30Z`, due_at: `${TAG}T16:00:30Z`, finished_at: `${TAG}T20:03:00Z` }
      ],
      laeufe: [
        { process: "warteschlange-crawl", status: "success", started_at: `${TAG}T04:01:00Z`, duration_ms: 150000, processed_count: 12, target_count: 12, reason: null },
        { process: "warteschlange-pipeline", status: "success", started_at: `${TAG}T16:01:00Z`, duration_ms: 180000, processed_count: 9, target_count: 9, reason: null },
        { process: "understanding-cron", status: "success", started_at: `${TAG}T05:30:00Z`, duration_ms: 200000, processed_count: 7, target_count: 7, reason: null },
        { process: "briefing-morning", status: "success", started_at: `${TAG}T05:00:00Z`, duration_ms: 14000, processed_count: 5, target_count: 5, reason: null },
        { process: "briefing-lage", status: "success", started_at: `${TAG}T05:45:00Z`, duration_ms: 30000, processed_count: 5, target_count: 5, reason: null }
      ],
      budget: [{ day: TAG, scope: "global", used: 70 }]
    }
  };
  // flache und tiefe Uebersteuerung fuer Testfaelle
  const q = JSON.parse(JSON.stringify(basis));
  for (const [pfad, wert] of Object.entries(aenderungen)) {
    const teile = pfad.split(".");
    let ziel = q;
    for (let i = 0; i < teile.length - 1; i += 1) ziel = ziel[teile[i]];
    ziel[teile[teile.length - 1]] = wert;
  }
  return q;
}

// --- 1) p95 nach naechstem Rang ------------------------------------------------------
check("1a p95 einer Einzelmessung ist der Wert selbst", g.p95NaechsterRang([42]) === 42);
check("1b p95 von 20 Werten ist der 19. sortierte Wert",
  g.p95NaechsterRang(Array.from({ length: 20 }, (_, i) => (i + 1) * 10)) === 190);
check("1c p95 leerer Eingabe ist null (nie 0, kein falsches Gruen)", g.p95NaechsterRang([]) === null);

// --- 2) Ein vollstaendig gruener Tag -------------------------------------------------
const gruen = g.bewerteTag(TAG, [quittung()]);
check("2a synthetischer Mustertag ist gruen", gruen.gruen === true && gruen.belegbar === true);
check("2b alle zehn Kriterien sind einzeln erfuellt",
  Object.values(gruen.kriterien).length === 10 && Object.values(gruen.kriterien).every((w) => w === true));
check("2c Ankunft und Abfluss werden korrekt gezaehlt", gruen.werte.ankunft === 3 && gruen.werte.abfluss === 3);

// Eine zusaetzliche, erst am Folgetag faellige und noch offene Ankunft senkt den Abfluss
// unter die Ankunft — K1 muss dann ROT sein (kein Sonderfall fuer zukuenftige Arbeit,
// die Zusage lautet Abfluss >= Ankunft je vollem UTC-Tag):
const mitOffenerAnkunft = g.bewerteTag(TAG, [quittung({ "rohdaten.jobs": [
  { status: "erledigt", created_at: `${TAG}T04:00:10Z`, due_at: `${TAG}T04:00:10Z`, finished_at: `${TAG}T04:03:00Z` },
  { status: "erledigt", created_at: `${TAG}T04:00:20Z`, due_at: `${TAG}T04:00:20Z`, finished_at: `${TAG}T16:02:00Z` },
  { status: "erledigt", created_at: `${TAG}T16:00:30Z`, due_at: `${TAG}T16:00:30Z`, finished_at: `${TAG}T20:03:00Z` },
  { status: "wartend", created_at: `${TAG}T20:00:00Z`, due_at: "2026-09-02T04:00:00Z", finished_at: null }
] })]);
check("2d Abfluss<Ankunft macht K1 rot, auch wenn die offene Arbeit erst morgen faellig ist",
  mitOffenerAnkunft.kriterien.abflussDecktAnkunft === false && mitOffenerAnkunft.gruen === false);
check("2e die zukuenftig faellige offene Arbeit verletzt K2 dabei NICHT",
  mitOffenerAnkunft.kriterien.keineOffeneArbeitAelter24h === true);

// --- 3) Fail closed: fehlende oder untaugliche Quittungen ----------------------------
const ohne = g.bewerteTag(TAG, []);
check("3a ohne Quittung ist der Tag nicht belegbar und NICHT gruen", ohne.gruen === false && ohne.belegbar === false);
const zuFrueh = g.bewerteTag(TAG, [quittung({ erhobenUtc: `${TAG}T23:00:00.000Z`, tagUtc: TAG })]);
check("3b eine VOR Tagesende erhobene Quittung deckt den Tag nicht", zuFrueh.belegbar === false);
const zuKurz = g.bewerteTag(TAG, [quittung({ rueckblickTage: 0, tagUtc: "2026-09-05", erhobenUtc: "2026-09-05T01:00:00.000Z" })]);
check("3c eine Quittung mit zu kurzem Rueckblick deckt den Tag nicht", zuKurz.belegbar === false);
const unvollstaendig = g.bewerteTag(TAG, [quittung({ lesungVollstaendig: false })]);
check("3d unvollstaendige Lesung macht den Tag NICHT gruen", unvollstaendig.gruen === false && unvollstaendig.belegbar === true);

// --- 4) Jedes Kriterium einzeln verletzt --------------------------------------------
const f1 = g.bewerteTag(TAG, [quittung({ "rohdaten.jobs": [
  { status: "wartend", created_at: `${TAG}T04:00:00Z`, due_at: `${TAG}T04:00:00Z`, finished_at: null }
] })]);
check("4a Ankunft ohne Abfluss verletzt K1", f1.kriterien.abflussDecktAnkunft === false);

const f2 = g.bewerteTag(TAG, [quittung({ "rohdaten.jobs": [
  { status: "erledigt", created_at: `${TAG}T04:00:10Z`, due_at: `${TAG}T04:00:10Z`, finished_at: `${TAG}T04:03:00Z` },
  // faellig am Vortag 02:00, am Tagesende immer noch offen -> aelter als 24 h
  { status: "wartend", created_at: "2026-08-31T02:00:00Z", due_at: "2026-08-31T02:00:00Z", finished_at: null }
] })]);
check("4b offene Arbeit aelter 24 h verletzt K2", f2.kriterien.keineOffeneArbeitAelter24h === false);

const f3 = g.bewerteTag(TAG, [quittung({ "momentaufnahme.cas": { fertig: 700, unbekannt: 1, aufgegeben: 1, offen: 0, reserviert: 0, "modell-laeuft": 0 } })]);
check("4c ein unbekannter Vorgang verletzt K3", f3.kriterien.keineUnbekanntenVorgaenge === false);

const f4 = g.bewerteTag(TAG, [quittung({ "momentaufnahme.dubletten": 1 })]);
check("4d eine Dublette verletzt K4", f4.kriterien.keineDubletten === false);

const f5 = g.bewerteTag(TAG, [quittung({ "momentaufnahme.haengendeLeases": 1 })]);
check("4e eine haengende Lease verletzt K5", f5.kriterien.keineHaengendenLeases === false);

const f6 = g.bewerteTag(TAG, [quittung({ "rohdaten.jobs": [
  { status: "erledigt", created_at: `${TAG}T04:00:10Z`, due_at: `${TAG}T04:00:10Z`, finished_at: `${TAG}T04:03:00Z` },
  { status: "fehlgeschlagen", created_at: `${TAG}T04:00:20Z`, due_at: `${TAG}T04:00:20Z`, finished_at: `${TAG}T05:00:00Z` }
] })]);
check("4f ein endgueltiger Fehler verletzt K6", f6.kriterien.keineEndgueltigenFehler === false);

const f7 = g.bewerteTag(TAG, [quittung({ "rohdaten.laeufe": [
  { process: "warteschlange-crawl", status: "success", started_at: `${TAG}T04:01:00Z`, duration_ms: 150000 },
  { process: "briefing-morning", status: "success", started_at: `${TAG}T05:00:00Z`, duration_ms: 14000, processed_count: 4, target_count: 5 },
  { process: "briefing-lage", status: "success", started_at: `${TAG}T05:45:00Z`, duration_ms: 30000, processed_count: 5, target_count: 5 }
] })]);
check("4g Briefing 4 von 5 verletzt K7", f7.kriterien.keinFehlendesBriefing === false);

const f7b = g.bewerteTag(TAG, [quittung({ "rohdaten.laeufe": [
  { process: "briefing-morning", status: "success", started_at: `${TAG}T05:00:00Z`, duration_ms: 14000, processed_count: 5, target_count: 5 }
] })]);
check("4h fehlende Lage-Briefing-Quittung verletzt K7", f7b.kriterien.keinFehlendesBriefing === false);

const f8 = g.bewerteTag(TAG, [quittung({ "rohdaten.budget": [{ day: TAG, scope: "global", used: 100 }] })]);
check("4i Verbrauch = Deckel verletzt K8", f8.kriterien.kiDeckelNichtErreicht === false);

const f9 = g.bewerteTag(TAG, [quittung({ "rohdaten.laeufe": [
  { process: "warteschlange-crawl", status: "success", started_at: `${TAG}T04:01:00Z`, duration_ms: 230083 },
  { process: "briefing-morning", status: "success", started_at: `${TAG}T05:00:00Z`, duration_ms: 14000, processed_count: 5, target_count: 5 },
  { process: "briefing-lage", status: "success", started_at: `${TAG}T05:45:00Z`, duration_ms: 30000, processed_count: 5, target_count: 5 }
] })]);
check("4j Slotdauer 230 s verletzt K9 (p95 > 217,5 s)", f9.kriterien.slotP95InGrenze === false);
check("4k 230 s liegt unter der 280-s-Stopgrenze (K10 getrennt von K9)", f9.kriterien.keinEinzelwertUeberStop === true);

const f10 = g.bewerteTag(TAG, [quittung({ "rohdaten.laeufe": [
  { process: "warteschlange-pipeline", status: "success", started_at: `${TAG}T16:01:00Z`, duration_ms: 281000 },
  { process: "briefing-morning", status: "success", started_at: `${TAG}T05:00:00Z`, duration_ms: 14000, processed_count: 5, target_count: 5 },
  { process: "briefing-lage", status: "success", started_at: `${TAG}T05:45:00Z`, duration_ms: 30000, processed_count: 5, target_count: 5 }
] })]);
check("4l Einzelwert 281 s verletzt K10", f10.kriterien.keinEinzelwertUeberStop === false);

const f11 = g.bewerteTag(TAG, [quittung({ "rohdaten.laeufe": [] })]);
check("4m ohne jede Slot-Quittung bleiben K9/K10 rot (kein leeres Gruen)",
  f11.kriterien.slotP95InGrenze === false && f11.kriterien.keinEinzelwertUeberStop === false);
check("4n ohne Briefing-Quittungen ist auch K7 rot", f11.kriterien.keinFehlendesBriefing === false);
check("4o Briefing-Prozesse zaehlen zu den Verarbeitungsslots", g.SLOT_PROZESSE.includes("briefing-morning"));

// --- 5) Momentaufnahme-Frische -------------------------------------------------------
const alt = g.bewerteTag(TAG, [quittung({ erhobenUtc: "2026-09-04T12:00:00.000Z", tagUtc: "2026-09-04" })]);
check("5a eine erst zwei Tage spaeter erhobene Quittung traegt K3–K5 nicht mehr",
  alt.belegbar === true && alt.kriterien.keineUnbekanntenVorgaenge === false
  && alt.kriterien.keineDubletten === false && alt.kriterien.keineHaengendenLeases === false);

// --- 6) Fensterbewertung -------------------------------------------------------------
const q1 = quittung();
const qRot = quittung({ "rohdaten.budget": [{ day: TAG, scope: "global", used: 100 }] });
const fenster1 = g.bewerteFenster([TAG], [qRot]);
check("6a Fenster mit einem roten Tag ist nicht gruen", fenster1.fensterGruen === false);
const fenster2 = g.bewerteFenster([TAG, "2026-09-02"], [q1]);
check("6b nicht belegbare Tage machen das Fenster nicht gruen", fenster2.fensterGruen === false
  && fenster2.tage[1].belegbar === false);

// echter gruener Tag + Fenster daraus
const qGruen = quittung({ "rohdaten.jobs": [
  { status: "erledigt", created_at: `${TAG}T04:00:10Z`, due_at: `${TAG}T04:00:10Z`, finished_at: `${TAG}T04:03:00Z` }
] });
const fenster3 = g.bewerteFenster([TAG], [qGruen]);
check("6c Fenster aus genau einem gruenen Tag ist gruen", fenster3.fensterGruen === true && fenster3.grueneTage === 1);

// --- 7) UTC-Stabilitaet ----------------------------------------------------------------
check("7a utcTag schneidet ISO-Zeitpunkte deterministisch", g.utcTag("2026-09-01T23:59:59.999Z") === "2026-09-01");
check("7b ungueltige Tage werden abgewiesen", g.tagGueltig("2026-02-30") === false && g.tagGueltig("2026-09-01") === true);
let warf = false;
try { g.bewerteTag("01.09.2026", [q1]); } catch { warf = true; }
check("7c bewerteTag wirft bei ungueltigem Tagformat", warf);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Gruentage-Assertions`);
process.exit(failed > 0 ? 1 : 0);
