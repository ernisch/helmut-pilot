"use strict";

// Resolver-Härtung gegen Magnet-Vorgänge (Betriebsbefund B4-2).
// REINE LOGIK: kein Netz, keine KI, keine DB.
//
// Was hier abgesichert wird: `sameVorgang()` entscheidet, ob ein neuer Cluster zu
// einem BESTEHENDEN Vorgang gehoert. Die Altfassung liess einen einzigen passenden
// Dokumentvergleich genuegen — dadurch zog ein bereits gemischter Vorgang immer
// mehr Fremdes an (Production: 13 -> 65 Dokumente in einem Lauf).
//
// Der Test hat zwei Seiten, und beide muessen gelten:
//   NEIN sagen, wo es falsch waere (Magnet, Kette, anderes Ereignis, alter Vorgang)
//   JA sagen, wo es richtig ist (Fortschreibung, Aktualisierung, Reaktion)
// Ein Resolver, der alles ablehnt, waere genauso kaputt wie der alte.

const V = require("../lib/helmut/vorgang-identity");
const { bewerteVorgang, MAGNET_MIN_DOKUMENTE, MAGNET_MAX_KOHAERENZ } = require("./vorgangs-magnet-analyse");

let fail = 0;
let n = 0;
function check(name, cond, detail = "") { n += 1; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); if (!cond) fail += 1; }

const d = (id, title, published_at, source_id = "s1") => ({ id, title, summary: "", published_at, source_id });
const bestand = (id, docs, extra = {}) => ({ vorgangId: id, documents: docs, ...extra });
const urteil = (neu, alt) => V.sameVorgang({ documents: neu }, alt);

// --- Der echte Vorgang: Anschlag auf den Berliner CSD ------------------------
const CSD = [
  d("c1", "Berliner Polizei: CSD abgebrochen - Fahrzeug soll Menschen angefahren haben", "2026-07-25T21:44:00Z", "sz"),
  d("c2", "CSD in Berlin: Fahrzeug in Menschenmenge gefahren - eine Tote und Verletzte", "2026-07-25T22:31:00Z", "tagesschau"),
  d("c3", "Angriff bei CSD in Berlin - ein Toter und mehrere Verletzte", "2026-07-26T04:01:00Z", "dlf"),
  d("c4", "Wegner nach CSD-Vorfall: Angriff auf freie und weltoffene Gesellschaft", "2026-07-26T09:12:00Z", "tagesschau")
];

// =========================================================================
// 1 · Berliner CSD — die Fortschreibung MUSS funktionieren
// =========================================================================
const csdNeu = [d("c5", "Angriff auf CSD Berlin: Dobrindt spricht von islamistischem Terroranschlag", "2026-07-26T16:05:00Z", "tagesschau")];
const r1 = urteil(csdNeu, bestand("vg-csd-20260725-x", CSD));
check("1 · eine neue Meldung zum CSD-Anschlag wird dem bestehenden Vorgang zugeordnet", r1.gleich === true, r1.grund);
check("1 · die Begruendung nennt die Kernueberdeckung", r1.grund === "kernueberdeckung", r1.grund);
check("1 · die Spur nennt den Kern des Bestands", (r1.spur.kernBestand || []).length > 0, JSON.stringify(r1.spur.kernBestand));
check("1 · die Spur nennt das Beweisgewicht", r1.spur.ueberdeckung && r1.spur.ueberdeckung.gewicht >= 2, JSON.stringify(r1.spur.ueberdeckung));

// Mehrere Aktualisierungen desselben Ereignisses hintereinander.
let laufend = CSD.slice();
for (const [i, doc] of [
  d("c6", "CSD-Angriff: Tatverdaechtiger bei Polizeieinsatz erschossen", "2026-07-26T20:01:00Z", "dlf"),
  d("c7", "CSD-Anschlag in Berlin: Bundeskanzler Merz beschwoert Zusammenhalt", "2026-07-26T20:04:00Z", "tagesschau"),
  d("c8", "Nach dem Angriff auf den Berliner CSD: Generalbundesanwalt uebernimmt", "2026-07-27T07:30:00Z", "dlf")
].entries()) {
  const r = urteil([doc], bestand("vg-csd-20260725-x", laufend));
  check(`2 · Aktualisierung ${i + 1} bleibt am selben Vorgang`, r.gleich === true, r.grund);
  laufend = [...laufend, doc];
}
check("2 · nach drei Aktualisierungen ist der Vorgang immer noch kohaerent",
  bewerteVorgang("vg-csd", laufend).kohaerenz >= MAGNET_MAX_KOHAERENZ, `kohaerenz=${bewerteVorgang("vg-csd", laufend).kohaerenz}`);

// Politische Reaktion auf das Ereignis.
const reaktion = [d("r1", "CSD-Anschlag: Linksfraktion fordert Schutz queeren Lebens in Berlin", "2026-07-26T16:02:00Z", "linke")];
check("3 · eine politische Reaktion gehoert zum Ereignis", urteil(reaktion, bestand("vg-csd-20260725-x", CSD)).gleich === true);

// =========================================================================
// 4 · Zwei unterschiedliche Anschläge — Trennung
// =========================================================================
const andererAnschlag = [
  d("a1", "Explosion vor dem Landgericht Karlsruhe - Ermittlungen laufen", "2026-07-26T18:00:00Z", "dlf"),
  d("a2", "Landgericht Karlsruhe: Generalbundesanwalt uebernimmt Ermittlungen zur Explosion", "2026-07-26T19:00:00Z", "sz")
];
const r4 = urteil(andererAnschlag, bestand("vg-csd-20260725-x", CSD));
check("4 · ein anderer Anschlag am selben Tag wird NICHT zugeordnet", r4.gleich === false, r4.grund);
check("4 · und die Ablehnung ist begruendet", ["kein-spezifischer-kerntreffer", "kernueberdeckung-zu-schwach"].includes(r4.grund), r4.grund);

// =========================================================================
// 5 · Der Magnet — der eigentliche Befund
// =========================================================================
// Nachbau von `vg-zeitung-20260428-f362cc`: viele Dokumente, kein gemeinsamer Kern.
const MAGNET = [
  d("m1", "Zu akademisch? Analyse zur Armutsgefaehrdung in Anhalt-Bitterfeld", "2026-07-20T07:00:00Z", "q1"),
  d("m2", "Sportpolitik: Bundestag stimmt fuer neues Sportfoerdergesetz", "2026-07-21T07:00:00Z", "q2"),
  d("m3", "Energiewende-Bremserin Reiche? VKU-Chef weist Vorwurf zurueck", "2026-07-22T07:00:00Z", "q3"),
  d("m4", "Pflegereform: Was wird aus den Haushaltshilfen?", "2026-07-23T07:00:00Z", "q4"),
  d("m5", "Bundesverkehrsminister Schnieder verliert voraussichtlich sein Amt", "2026-07-24T07:00:00Z", "q5"),
  d("m6", "EU-Agrarreform bedroht Ostdeutschlands Landwirtschaft", "2026-07-25T07:00:00Z", "q6"),
  d("m7", "Buergergeld: Jobcenter kuerzen bei Pflichtverletzung", "2026-07-25T18:00:00Z", "q7"),
  d("m8", "Genosse Ha Ngoc Tu zum Vorsitzenden des Provinzverbandes gewaehlt", "2026-07-26T07:00:00Z", "q8"),
  d("m9", "KI macht Recycling endlich wirtschaftlich", "2026-07-26T09:00:00Z", "q9"),
  d("m10", "FDP Westerwald fordert vererbbare Kapitalrente", "2026-07-26T11:00:00Z", "q10")
];
const bewertung = bewerteVorgang("vg-magnet", MAGNET);
check("5 · der nachgebaute Magnet wird als Magnet erkannt", bewertung.magnet === true,
  `dok=${bewertung.dokumente} cluster=${bewertung.themenvielfalt} kohaerenz=${bewertung.kohaerenz} kern=${bewertung.kernanker}`);
check("5 · und er hat KEINEN Kern — das ist sein Erkennungsmerkmal", bewertung.kernanker === 0, `kern=${bewertung.kernanker}`);

// Der entscheidende Test: der Magnet darf NICHTS mehr anziehen.
const r5 = urteil(CSD, bestand("vg-magnet", MAGNET));
check("5 · der Magnet zieht den CSD-Anschlag NICHT mehr an", r5.gleich === false, r5.grund);
check("5 · Ablehnungsgrund ist die Kernlosigkeit des Bestands", r5.grund === "bestand-ohne-kern", r5.grund);
// Auch die Dokumente, die er real angezogen hat, kommen nicht mehr durch.
for (const [i, probe] of [
  [d("p1", "Kabinettsumbildung - Bilger soll neuer Verkehrsminister werden", "2026-07-27T02:38:00Z", "dlf")],
  [d("p2", "Nach Anschlag auf CSD: Forderungen nach Anpassung des Strafrechts", "2026-07-27T02:38:00Z", "dlf")],
  [d("p3", "Pflegende Angehoerige: Nicht alle erhalten Rentenpunkte", "2026-07-27T02:45:00Z", "faz")]
].entries()) {
  check(`5 · Magnet lehnt Probe ${i + 1} ab (real angezogenes Dokument)`,
    urteil(probe, bestand("vg-magnet", MAGNET)).gleich === false);
}
// Gegenprobe: derselbe Cluster findet seinen RICHTIGEN Vorgang weiterhin.
const verkehr = [
  d("v1", "Bundesverkehrsminister Schnieder verliert voraussichtlich sein Amt", "2026-07-26T06:50:00Z", "q5"),
  d("v2", "Merz baut Regierung um: Zukunft von Verkehrsminister Schnieder offen", "2026-07-26T11:27:00Z", "q5")
];
check("5 · GEGENPROBE: der passende Fachvorgang nimmt dasselbe Dokument an",
  urteil([d("p1", "Kabinettsumbildung - Bilger soll neuer Verkehrsminister werden", "2026-07-27T02:38:00Z", "dlf")],
    bestand("vg-verkehrsminister-x", verkehr)).gleich === true);

// =========================================================================
// 6 · Transitive Kette — der Wachstumspfad
// =========================================================================
// A gehoert zu V. B teilt etwas mit A, aber nichts mit dem Kern von V.
// Nach der Aufnahme von A darf B NICHT nachrutschen.
const V0 = [
  d("t1", "Rentenpaket 2026 im Kabinett beschlossen", "2026-07-20T08:00:00Z", "q1"),
  d("t2", "Rentenpaket 2026: Bundesrat kuendigt Vermittlungsausschuss an", "2026-07-20T10:00:00Z", "q2"),
  d("t3", "Rentenpaket 2026 stoesst bei Verbaenden auf Kritik", "2026-07-20T12:00:00Z", "q3")
];
const A = [d("t4", "Rentenpaket und Pflegereform gemeinsam im Kabinett", "2026-07-21T08:00:00Z", "q4")];
const B = [d("t5", "Pflegereform: Laender fordern Nachbesserungen bei der Pflegereform", "2026-07-21T09:00:00Z", "q5")];
check("6 · A (echte Fortschreibung) wird aufgenommen", urteil(A, bestand("vg-rentenpaket-x", V0)).gleich === true);
const nachA = [...V0, ...A];
const r6 = urteil(B, bestand("vg-rentenpaket-x", nachA));
check("6 · B rutscht NICHT ueber A nach (keine transitive Explosion)", r6.gleich === false, r6.grund);
check("6 · der Kern des Vorgangs bleibt das Rentenpaket, nicht die Pflegereform",
  V.coreAnchors(nachA.map((x) => V.docAnchors(x))).some((a) => a.startsWith("rentenpaket")),
  JSON.stringify(V.coreAnchors(nachA.map((x) => V.docAnchors(x)))));

// Kette ueber 10 Runden: der Vorgang darf nicht unbegrenzt wachsen.
let kette = V0.slice();
let aufgenommen = 0;
for (let i = 0; i < 10; i += 1) {
  const fremd = [d(`f${i}`, `Thema ${i}: Ausschuss beraet ueber Vorhaben Nummer ${i} in Berlin`, `2026-07-2${(i % 5) + 1}T14:00:00Z`, `qf${i}`)];
  const r = urteil(fremd, bestand("vg-rentenpaket-x", kette));
  if (r.gleich) { kette = [...kette, ...fremd]; aufgenommen += 1; }
}
check("6 · zehn fachfremde Cluster werden alle abgelehnt", aufgenommen === 0, `aufgenommen=${aufgenommen}`);
check("6 · der Vorgang ist nach zehn Runden unveraendert gross", kette.length === V0.length);

// =========================================================================
// 7 · Historischer Magnet und alter Vorgang
// =========================================================================
const altVorgang = [
  d("h1", "Tariftreuegesetz im Bundesrat beraten", "2026-05-01T08:00:00Z", "q1"),
  d("h2", "Tariftreuegesetz: Laender fordern Nachbesserungen", "2026-05-02T08:00:00Z", "q2")
];
const heute = [d("h3", "Tariftreuegesetz erneut im Bundesrat", "2026-07-26T08:00:00Z", "q3")];
const r7 = urteil(heute, bestand("vg-tariftreuegesetz-x", altVorgang));
check("7 · ein seit Wochen ruhender Vorgang wird nicht mehr fortgeschrieben", r7.gleich === false, r7.grund);
check("7 · Ablehnungsgrund ist das Fortschreibungsfenster", r7.grund === "vorgang-zu-alt", r7.grund);
check("7 · die Spur nennt den gemessenen Abstand", Number(r7.spur.abstandTage) > V.VORGANG_FORTSCHREIBUNG_TAGE, `${r7.spur.abstandTage} Tage`);

// Historischer Rueckblick auf dasselbe Thema.
const rueckblick = [d("h4", "Zehn Jahre Tariftreuegesetz: Was die Einfuehrung 2015 gebracht hat", "2026-05-03T08:00:00Z", "q4")];
check("7 · ein historischer Rueckblick wird nicht zum laufenden Vorgang gezaehlt",
  urteil(rueckblick, bestand("vg-tariftreuegesetz-x", altVorgang)).gleich === false);

// =========================================================================
// 8 · Groessenriegel
// =========================================================================
const riesig = Array.from({ length: V.VORGANG_MAX_DOKUMENTE }, (_, i) =>
  d(`g${i}`, `Rentenpaket 2026: Bericht Nummer ${i} zum Rentenpaket`, "2026-07-26T08:00:00Z", `qg${i}`));
const r8 = urteil([d("g99", "Rentenpaket 2026: Bundesrat beschliesst das Rentenpaket", "2026-07-26T12:00:00Z", "qx")],
  bestand("vg-rentenpaket-voll", riesig));
check("8 · ein voller Vorgang nimmt nichts mehr auf (zweiter, unabhaengiger Riegel)",
  r8.gleich === false && r8.grund === "vorgang-voll", `${r8.grund} bei ${riesig.length} Dokumenten`);
check("8 · knapp darunter nimmt derselbe Vorgang noch an",
  urteil([d("g98", "Rentenpaket 2026: Bundesrat beschliesst das Rentenpaket", "2026-07-26T12:00:00Z", "qx")],
    bestand("vg-rentenpaket-fast", riesig.slice(0, V.VORGANG_MAX_DOKUMENTE - 1))).gleich === true);

// =========================================================================
// 9 · Idempotenz und Mehrfachverarbeitung
// =========================================================================
const einmal = urteil(csdNeu, bestand("vg-csd-20260725-x", CSD));
const zweimal = urteil(csdNeu, bestand("vg-csd-20260725-x", CSD));
check("9 · dieselbe Entscheidung zweimal ergibt dasselbe Urteil", einmal.gleich === zweimal.gleich && einmal.grund === zweimal.grund);
check("9 · und dieselbe Spur (vollstaendig reproduzierbar)",
  JSON.stringify(einmal.spur) === JSON.stringify(zweimal.spur));
check("9 · das bereits enthaltene Dokument wird weiterhin zugeordnet (kein Flattern)",
  urteil([CSD[0]], bestand("vg-csd-20260725-x", CSD)).gleich === true);
check("9 · die Reihenfolge der Bestandsdokumente aendert das Urteil nicht",
  urteil(csdNeu, bestand("vg-csd-20260725-x", CSD.slice().reverse())).gleich === einmal.gleich);

// =========================================================================
// 10 · Adversarial — Aehnlichkeit, die keine ist
// =========================================================================
const adversarial = [
  ["gleiche Stadt, anderes Ereignis",
    [d("x1", "Berlin: Abgeordnetenhaus beraet den Doppelhaushalt", "2026-07-26T10:00:00Z", "q1")], false],
  ["gleicher Akteur, anderes Ereignis",
    [d("x2", "Wegner eroeffnet neues Rechenzentrum in Berlin-Adlershof", "2026-07-26T10:00:00Z", "q1")], false],
  ["gleiches Wort 'Angriff', voellig anderer Zusammenhang",
    [d("x3", "Hackerangriff auf kommunale Verwaltung in Brandenburg", "2026-07-26T10:00:00Z", "q1")], false],
  ["dieselbe Sache, andere Formulierung, aber gemeinsame Sachanker",
    [d("x4", "Anschlag beim CSD in Berlin: Ermittler pruefen islamistisches Motiv", "2026-07-26T10:00:00Z", "q1")], true],
  // EHRLICHE GRENZE, hier bewusst als Erwartung festgeschrieben: die
  // Ankerlogik kennt keine Synonyme. "Christopher Street Day" und "CSD" sind
  // fuer sie zwei verschiedene Woerter; teilt eine Meldung mit dem Vorgangskern
  // sonst nur den Ortsnamen, wird sie NICHT zugeordnet. Folge ist kein Verlust,
  // sondern ein eigener Vorgang — sichtbar und nachholbar. Die Alternative waere
  // "Berlin genuegt", und genau das erzeugt Magnete.
  ["Synonym ohne weiteren Sachanker — bewusste Grenze",
    [d("x5", "Toedliche Fahrt in die Menge beim Berliner Christopher Street Day", "2026-07-26T10:00:00Z", "q1")], false]
];
for (const [name, docs, erwartet] of adversarial) {
  const r = urteil(docs, bestand("vg-csd-20260725-x", CSD));
  check(`10 · ${name} -> ${erwartet ? "zugeordnet" : "getrennt"}`, r.gleich === erwartet, `${r.grund}`);
}

// =========================================================================
// 11 · Rueckfallebene Ueberschrift (Alt-Vorgaenge ohne Verknuepfungen)
// =========================================================================
const ohneDocs = { vorgangId: "vg-alt", documents: [], headline: "Angriff auf den Berliner CSD" };
check("11 · ohne verknuepfte Dokumente traegt die Ueberschrift als schwaecherer Beleg",
  urteil(csdNeu, ohneDocs).gleich === true && urteil(csdNeu, ohneDocs).beleg === "ueberschrift");
check("11 · ohne jeden Beleg wird NICHT zusammengefuehrt",
  urteil(csdNeu, { vorgangId: "vg-alt", documents: [], headline: "" }).gleich === false);
check("11 · und eine fachfremde Ueberschrift traegt nicht",
  urteil(csdNeu, { vorgangId: "vg-alt", documents: [], headline: "Digitalisierung der Kfz-Zulassung" }).gleich === false);

// =========================================================================
// 12 · Die Spur ist vollstaendig
// =========================================================================
const spur = urteil(csdNeu, bestand("vg-csd-20260725-x", CSD)).spur;
for (const feld of ["vorgangId", "neueDokumente", "bestandsDokumente", "verglicheneDokumente", "kernNeu", "kernBestand", "ueberdeckung", "erfuellt", "fehlend"]) {
  check(`12 · die Entscheidungsspur nennt "${feld}"`, spur[feld] !== undefined);
}
check("12 · sie listet die verglichenen Dokumente namentlich",
  spur.verglicheneDokumente.neu.length > 0 && spur.verglicheneDokumente.bestand.length > 0);
check("12 · bei einer Ablehnung steht der fehlende Punkt drin",
  (urteil(andererAnschlag, bestand("vg-csd-20260725-x", CSD)).spur.fehlend || []).length > 0);
check("12 · bei einer Zusage stehen die erfuellten Punkte drin",
  spur.erfuellt.includes("bestand-hat-kern") && spur.erfuellt.includes("kernueberdeckung"));

console.log(`\n${n - fail}/${n} Assertions erfolgreich.`);
if (fail) console.log(`\nFEHLGESCHLAGEN: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
