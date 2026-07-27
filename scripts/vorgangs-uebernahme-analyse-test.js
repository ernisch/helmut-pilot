"use strict";

// Magnet-Analyse: Erkennung der UEBERNAHME (Hotfix B4-3, Phase 4).
// =============================================================================
// REINE LOGIK: kein Netz, keine KI, keine DB. Das Werkzeug selbst bleibt
// read-only; hier wird ausschliesslich seine Bewertungsfunktion geprueft.
//
// WARUM DIESER TEST EXISTIERT:
// Die bestehende Magnet-Analyse hat den Production-Fall vom 2026-07-27 als
// UNAUFFAELLIG bewertet. Ihr Mass ist die Kohaerenz — der Anteil des groessten
// Clusters an allen Dokumenten. `vg-angriffen` bestand nach dem Fehlgriff aus
// 1 Huthi-Dokument und 19 CSD-Dokumenten. Die 19 sind untereinander hochkohaerent,
// also betraegt die Kohaerenz 19/20 = 0,95 — weit ueber der Magnetschwelle 0,6.
// Der Vorgang sah kerngesund aus und lieferte trotzdem eine falsche Lage aus.
//
// Die Analyse misst deshalb zusaetzlich das Verhaeltnis zum URSPRUNG: passt der
// grosse Block ueberhaupt zu dem Dokument, das den Vorgang begruendet hat?
//
// Der Test hat zwei Seiten, und beide muessen gelten:
//   ERKENNEN   den rekonstruierten CSD/Huthi-Fall und verwandte Spaltungen
//   NICHT ERKENNEN  echte grosse Vorgaenge und legitime thematische Entwicklung
// Eine Analyse, die alles als Risiko markiert, waere genauso wertlos wie die blinde.

const V = require("../lib/helmut/vorgang-identity");
const M = require("./vorgangs-magnet-analyse");

let fail = 0;
let n = 0;
function check(name, cond, detail = "") {
  n += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) fail += 1;
}

const d = (id, title, published_at, source_id = "s1") => ({ id, title, summary: "", published_at, source_id });

// --- Der rekonstruierte Production-Zustand von `vg-angriffen` ---------------
// 1 Huthi-Dokument (das aelteste, es hat den Vorgang begruendet)
// + 19 CSD-Dokumente, die beim Nachholen faelschlich dazukamen.
const HUTHI = d("h1", "Trump droht Iran wegen Huthi-Angriffen mit Konsequenzen", "2026-07-24T18:00:00Z", "dlf");
const CSD_SCHLAGZEILEN = [
  "Berliner Polizei: CSD abgebrochen - Fahrzeug soll Menschen angefahren haben",
  "CSD in Berlin: Fahrzeug in Menschenmenge gefahren - eine Tote und Verletzte",
  "Angriff bei CSD in Berlin - ein Toter und mehrere Verletzte",
  "Wegner nach CSD-Vorfall: Angriff auf freie und weltoffene Gesellschaft in Berlin",
  "Angriff auf CSD Berlin: Dobrindt spricht von islamistischem Terroranschlag",
  "CSD-Angriff Berlin: Tatverdaechtiger bei Polizeieinsatz erschossen",
  "CSD-Anschlag in Berlin: Bundeskanzler Merz beschwoert Zusammenhalt",
  "Nach dem Angriff auf den Berliner CSD: Generalbundesanwalt uebernimmt",
  "Berlin: Gedenken am Ort des Angriffs auf den CSD",
  "CSD Berlin: eine Tote und 16 Verletzte bestaetigt"
];
const CSD_BLOCK = Array.from({ length: 19 }, (_, i) => d(
  `c${i}`,
  `${CSD_SCHLAGZEILEN[i % CSD_SCHLAGZEILEN.length]}${i >= CSD_SCHLAGZEILEN.length ? ` - Bericht ${i}` : ""}`,
  `2026-07-2${5 + (i % 2)}T${String(10 + (i % 12)).padStart(2, "0")}:00:00Z`,
  `q${i}`
));

const angriffen = M.bewerteVorgang("vg-angriffen", [HUTHI, ...CSD_BLOCK]);

// --- 1 · Die alte Kennzahl war blind — das wird hier belegt, nicht behauptet
check("1 · der rekonstruierte Fall hat 20 Dokumente", angriffen.dokumente === 20, `${angriffen.dokumente}`);
check("1 · seine Kohaerenz liegt HOCH — die alte Magnetregel greift nicht",
  angriffen.kohaerenz >= M.MAGNET_MAX_KOHAERENZ, `kohaerenz=${angriffen.kohaerenz}`);
check("1 · und genau deshalb galt er der alten Analyse als unauffaellig",
  angriffen.magnet === false, `magnet=${angriffen.magnet}`);

// --- 2 · Die neue Analyse erkennt ihn -------------------------------------
check("2 · die Analyse erkennt die UEBERNAHME", angriffen.uebernahme === true, JSON.stringify(angriffen.gruppenBefund));
check("2 · sie erkennt den fremden Block als in sich kohaerent",
  angriffen.fremdblockKohaerent === true && angriffen.gruppenBefund.fremdblockDokumente === 19,
  `fremdblock=${angriffen.gruppenBefund.fremdblockDokumente}`);
check("2 · sie erkennt, dass er NICHT zum urspruenglichen Bestand passt",
  angriffen.passtNichtZumUrsprung === true && angriffen.gruppenBefund.gemeinsameFamilien === 0,
  `gemeinsameFamilien=${angriffen.gruppenBefund.gemeinsameFamilien}`);
check("2 · sie erkennt den winzigen Ursprung, der ueberwachsen wurde",
  angriffen.ursprungUeberwachsen === true && angriffen.gruppenBefund.ursprungDokumente === 1,
  `ursprung=${angriffen.gruppenBefund.ursprungDokumente}`);
check("2 · sie erkennt, dass die Verbindung nur aus generischen Familien besteht",
  angriffen.evidenzUeberwiegendGenerisch === true);
check("2 · der Risikoindikator steht auf HOCH", angriffen.risiko === "hoch", angriffen.risiko);
check("2 · der Vorgang ist als auffaellig gefuehrt", angriffen.auffaellig === true);

// --- 3 · Die Begruendung ist nachvollziehbar, nicht nur eine Fahne ---------
check("3 · es gibt eine ausformulierte Begruendung", angriffen.begruendung.length >= 1, JSON.stringify(angriffen.begruendung));
check("3 · sie nennt beide Blockgroessen", angriffen.begruendung.some((g) => g.includes("19") && g.includes("1 Dokument")),
  JSON.stringify(angriffen.begruendung));
check("3 · der Ursprungskern ist benannt und stammt aus dem Huthi-Dokument",
  angriffen.gruppenBefund.ursprungKern.includes("huthi"), JSON.stringify(angriffen.gruppenBefund.ursprungKern));
check("3 · der Fremdblockkern ist benannt und stammt aus dem CSD-Stapel",
  angriffen.gruppenBefund.fremdblockKern.includes("csd"), JSON.stringify(angriffen.gruppenBefund.fremdblockKern));

// --- 4 · GEGENPROBE: echte, grosse, kohaerente Vorgaenge ------------------
// Derselbe CSD-Stapel OHNE das fremde Ursprungsdokument ist ein voellig normaler
// Grossvorgang und darf keinen Befund erzeugen.
const echterGrossvorgang = M.bewerteVorgang("vg-csd", CSD_BLOCK);
check("4 · ein echter grosser Vorgang wird NICHT als Uebernahme markiert",
  echterGrossvorgang.uebernahme === false, JSON.stringify(echterGrossvorgang.gruppenBefund));
check("4 · und auch nicht als gespalten oder Magnet",
  echterGrossvorgang.gespalten === false && echterGrossvorgang.magnet === false);
check("4 · er gilt insgesamt als unauffaellig", echterGrossvorgang.auffaellig === false);
check("4 · seine Kohaerenz ist hoch", echterGrossvorgang.kohaerenz >= 0.9, `${echterGrossvorgang.kohaerenz}`);

// --- 5 · GEGENPROBE: legitime thematische Entwicklung ---------------------
// Ein Vorgang, der sich ueber Tage weiterentwickelt: Kabinettsbeschluss ->
// Bundesratskritik -> Vermittlungsausschuss. Verschiedene Akteure, verschiedene
// Stationen — aber durchgehend derselbe SPEZIFISCHE Gegenstand.
const entwicklung = [
  d("r1", "Rentenpaket 2026 im Kabinett beschlossen", "2026-07-20T08:00:00Z", "q1"),
  d("r2", "Rentenpaket 2026: Verbaende kritisieren die Haltelinie", "2026-07-20T12:00:00Z", "q2"),
  d("r3", "Rentenpaket 2026 stoesst im Bundesrat auf Widerstand", "2026-07-21T09:00:00Z", "q3"),
  d("r4", "Bundesrat ruft Vermittlungsausschuss zum Rentenpaket 2026 an", "2026-07-22T10:00:00Z", "q4"),
  d("r5", "Vermittlungsausschuss beraet ueber das Rentenpaket 2026", "2026-07-23T11:00:00Z", "q5"),
  d("r6", "Rentenpaket 2026: Einigung im Vermittlungsausschuss erzielt", "2026-07-24T14:00:00Z", "q6"),
  d("r7", "Rentenpaket 2026 passiert den Bundesrat", "2026-07-25T09:00:00Z", "q7")
];
const legitim = M.bewerteVorgang("vg-rentenpaket", entwicklung);
check("5 · legitime thematische Entwicklung wird NICHT als Uebernahme markiert",
  legitim.uebernahme === false, JSON.stringify(legitim.gruppenBefund));
check("5 · sie wird auch nicht als gespalten markiert", legitim.gespalten === false,
  `gruppen=${legitim.gruppenBefund.gruppen} unvereinbar=${legitim.unvereinbarePaare}`);
check("5 · sie gilt insgesamt als unauffaellig", legitim.auffaellig === false, JSON.stringify(legitim.begruendung));
check("5 · falls sie in Gruppen zerfaellt, teilen die Gruppen ein spezifisches Thema",
  legitim.gruppenBefund.gruppen === 1 || legitim.gruppenBefund.gemeinsameFamilien >= 1,
  `gruppen=${legitim.gruppenBefund.gruppen} gemeinsam=${legitim.gruppenBefund.gemeinsameFamilien}`);

// --- 6 · Kleine Vorgaenge erzeugen keinen Fehlalarm -----------------------
const klein = M.bewerteVorgang("vg-klein", [
  d("k1", "Bundestag beraet das Tariftreuegesetz", "2026-07-20T08:00:00Z", "q1"),
  d("k2", "Vietnamesische Gewerkschaft waehlt neuen Vorsitzenden", "2026-07-20T09:00:00Z", "q2")
]);
check("6 · zwei thematisch verschiedene Dokumente reichen NICHT fuer einen Befund",
  klein.uebernahme === false && klein.gespalten === false && klein.auffaellig === false,
  `gruppen=${klein.gruppenBefund.gruppen}`);
check("6 · ein leerer Vorgang faellt nicht um", M.bewerteVorgang("vg-leer", []).auffaellig === false);
check("6 · ein Ein-Dokument-Vorgang ist unauffaellig",
  M.bewerteVorgang("vg-eins", [HUTHI]).auffaellig === false);

// --- 7 · Gespaltene Vorgaenge (zweiter, unabhaengiger Indikator) ----------
// Zwei etwa gleich grosse, in sich kohaerente, aber unvereinbare Bloecke. Die
// Uebernahme-Regel greift hier NICHT (kein winziger Ursprung) — der Vorgang ist
// trotzdem falsch, und genau dafuer gibt es den zweiten Indikator.
const gespaltenDocs = [
  d("g1", "Rentenpaket 2026 im Kabinett beschlossen", "2026-07-20T08:00:00Z", "q1"),
  d("g2", "Rentenpaket 2026: Bundesrat kuendigt Vermittlungsausschuss an", "2026-07-20T09:00:00Z", "q2"),
  d("g3", "Rentenpaket 2026 stoesst bei Verbaenden auf Widerstand", "2026-07-20T10:00:00Z", "q3"),
  d("g4", "Emissionshandel: EU-Kommission legt Reformvorschlag vor", "2026-07-20T11:00:00Z", "q4"),
  d("g5", "Emissionshandel-Reform: Industrieverbaende warnen vor Belastungen", "2026-07-20T12:00:00Z", "q5"),
  d("g6", "Emissionshandel: Bundesregierung prueft den Reformvorschlag", "2026-07-20T13:00:00Z", "q6")
];
const gespalten = M.bewerteVorgang("vg-gespalten", gespaltenDocs);
check("7 · zwei gleich grosse unvereinbare Bloecke werden als GESPALTEN erkannt",
  gespalten.gespalten === true, `gruppen=${gespalten.gruppenBefund.gruppen} unvereinbar=${gespalten.unvereinbarePaare}`);
check("7 · dabei greift die Uebernahme-Regel bewusst NICHT (kein winziger Ursprung)",
  gespalten.uebernahme === false);
check("7 · das Risiko wird trotzdem gemeldet", gespalten.risiko !== "keins", gespalten.risiko);
check("7 · mit nachvollziehbarer Begruendung", gespalten.begruendung.length >= 1, JSON.stringify(gespalten.begruendung));

// --- 8 · Determinismus ----------------------------------------------------
const w1 = M.bewerteVorgang("vg-angriffen", [HUTHI, ...CSD_BLOCK]);
const w2 = M.bewerteVorgang("vg-angriffen", [...CSD_BLOCK, HUTHI]);
check("8 · die Bewertung ist unabhaengig von der Eingangsreihenfolge",
  w1.uebernahme === w2.uebernahme && w1.kohaerenz === w2.kohaerenz
  && w1.gruppenBefund.ursprungDokumente === w2.gruppenBefund.ursprungDokumente,
  `${JSON.stringify(w1.gruppenBefund)} vs ${JSON.stringify(w2.gruppenBefund)}`);
check("8 · und zweimal identisch", JSON.stringify(w1.begruendung) === JSON.stringify(w2.begruendung));

// --- 9 · Der Resolver verhindert diesen Zustand kuenftig ------------------
// Die Analyse findet den ALTBESTAND. Dass er nicht neu entsteht, ist Aufgabe des
// Resolvers — hier als Verbindung beider Schutzmassnahmen mitgeprueft.
const wuerdeErneutPassieren = V.sameVorgang({ documents: CSD_BLOCK }, { vorgangId: "vg-angriffen", documents: [HUTHI] });
check("9 · derselbe Fehlgriff waere heute vom Resolver blockiert",
  wuerdeErneutPassieren.gleich === false, wuerdeErneutPassieren.grund);

// --- 10 · Der Scanbereich reicht bis zur kleinsten moeglichen Uebernahme ---
check("10 · die Scan-Untergrenze liegt unter der Magnetschwelle",
  M.ANALYSE_MIN_DOKUMENTE < M.MAGNET_MIN_DOKUMENTE,
  `${M.ANALYSE_MIN_DOKUMENTE} < ${M.MAGNET_MIN_DOKUMENTE}`);
check("10 · und deckt die kleinste ausgepraegte Uebernahme ab (1 + 5 Dokumente)",
  M.ANALYSE_MIN_DOKUMENTE <= 1 + M.UEBERNAHME_MIN_FREMDBLOCK,
  `${M.ANALYSE_MIN_DOKUMENTE} <= ${1 + M.UEBERNAHME_MIN_FREMDBLOCK}`);
const kleinsteUebernahme = M.bewerteVorgang("vg-klein-uebernahme", [
  HUTHI,
  ...CSD_BLOCK.slice(0, M.UEBERNAHME_MIN_FREMDBLOCK)
]);
check("10 · die kleinste ausgepraegte Uebernahme wird erkannt",
  kleinsteUebernahme.uebernahme === true, JSON.stringify(kleinsteUebernahme.gruppenBefund));

console.log(`\n${n - fail}/${n} Assertions erfolgreich.`);
if (fail) console.log(`\nFEHLGESCHLAGEN: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
