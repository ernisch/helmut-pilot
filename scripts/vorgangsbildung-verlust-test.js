"use strict";

// Beweis-/Charakterisierungstest zur Verluststelle aus der CSD-2026-Diagnose
// (docs/befund-csd-2026-vorgangsverlust.md). REINE LOGIK, kein Netz, keine KI, keine DB.
//
// ACHTUNG — dieser Test beschreibt ABSICHTLICH den FEHLERHAFTEN Ist-Zustand.
// Er ist kein Qualitaetsnachweis, sondern eine ausfuehrbare Spezifikation des Defekts:
// jede Behauptung hier ist an Production-Daten vom 2026-07-25/26 belegt. Eine Reparatur
// der Vorgangsbildung MUSS diese Erwartungen umdrehen — genau dann schlaegt dieser Test
// fehl und zeigt, dass der Defekt behoben ist. Er wird dann durch den Soll-Test ersetzt.
//
// Belegte Verluststelle (drei unabhaengige Mechanismen, alle in diesem Test reproduziert):
//   V1  Ankerschwelle >= 8 Zeichen: die Leitvokabeln eines Ereignisses ("CSD", "Berlin",
//       "Angriff", "Merz", "Wegner", "Polizei") koennen keinen Anker bilden. Ein Ereignis
//       zerfaellt in mehrere Vorgaenge statt einen zu bilden.
//   V2  Teilstring-Ankerabgleich (a.includes(b)) auf Allerweltswoertern: fachfremde
//       Dokumente landen im selben Cluster.
//   V3  deriveVorgangId reduziert einen Cluster auf EIN Wort. Existiert zu diesem Wort
//       bereits ein aelteres, thematisch fremdes Knowledge Object, endet der Cluster in
//       understandOneCluster als "skipped-exists": kein KI-Call, kein Dokument-Link,
//       kein Protokolleintrag — das Ereignis verschwindet lautlos.

const { clusterRawDocuments, deriveVorgangId } = require("../lib/helmut/understanding");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }

// Echte Production-Titel aus raw_documents (2026-07-26, Crawl-Lauf 04:00 UTC).
// Oeffentliche Schlagzeilen, keine personenbezogenen Zusatzdaten.
const EREIGNIS_DOKUMENTE = [
  { id: "d1", title: "Christopher Street Day - Angriff bei CSD in Berlin - ein Toter und mehrere Verletzte - Polizei identifiziert Verdächtigen aus islamistischer Szene" },
  { id: "d2", title: "Berlins Regierender Bürgermeister - Wegner nach CSD-Vorfall: Angriff auf freie und weltoffene Gesellschaft - Merz: abscheuliche Tat" },
  { id: "d3", title: "Berliner Polizei: CSD abgebrochen - Fahrzeug soll Menschen angefahren haben - SZ.de" },
  { id: "d4", title: "CSD in Berlin: Fahrzeug in Menschenmenge gefahren - eineTote und Verletzte" },
  { id: "d5", title: "Liveblog zu Angriff auf CSD: ++ Dobrindt: \"Keine weitere Gefährdung\" ++" }
];

// --- V1: ein Ereignis, aber kein gemeinsamer Vorgang -------------------------
const nurEreignis = clusterRawDocuments(EREIGNIS_DOKUMENTE);
check(
  "V1 fuenf Dokumente zu EINEM Ereignis bilden mehr als einen Vorgang (Ist: Zerfall)",
  nurEreignis.length > 1
);
check(
  "V1 kein Vorgang enthaelt alle fuenf Dokumente",
  !nurEreignis.some((c) => c.documents.length === EREIGNIS_DOKUMENTE.length)
);

// Die Leitvokabeln des Ereignisses liegen unter der Ankerschwelle von 8 Zeichen und
// koennen die Dokumente deshalb grundsaetzlich nicht zusammenfuehren.
for (const wort of ["CSD", "Berlin", "Angriff", "Merz", "Wegner", "Polizei", "Attacke"]) {
  check(`V1 Leitvokabel "${wort}" ist zu kurz fuer einen Anker (${wort.length} < 8)`, wort.length < 8);
}

// --- V2: fachfremde Verschmelzung ueber ein Allerweltswort -------------------
// "Menschen" (8 Zeichen) verbindet den Anschlag mit einem Taifun in China — so in
// Production am 2026-07-26 04:00 UTC entstanden.
const mitFremddokument = clusterRawDocuments([
  { id: "d3", title: "Berliner Polizei: CSD abgebrochen - Fahrzeug soll Menschen angefahren haben - SZ.de" },
  { id: "f1", title: "Provinz Guangdong - 340.000 Menschen in China wegen Taifun \"Noul\" in Sicherheit gebracht" }
]);
check(
  "V2 Anschlag und Taifun landen ueber den Anker \"menschen\" im selben Vorgang",
  mitFremddokument.length === 1 && mitFremddokument[0].documents.length === 2
);
check(
  "V2 die vorgang_id dieses gemischten Clusters ist das Allerweltswort vg-menschen",
  deriveVorgangId(mitFremddokument[0]) === "vg-menschen"
);

// Zweiter belegter Fall: der Anker "dobrindt" (genau 8 Zeichen) zieht den CSD-Liveblog
// in einen Vorgang ueber ein Verfassungsgerichtsurteil zu Abschiebungen (ko-vg-dobrindt,
// Production 2026-07-26 20:04 UTC — Ueberschrift und Inhalt des KO betreffen das Urteil,
// der Anschlag erscheint nur noch als Nebensatz).
const dobrindt = clusterRawDocuments([
  { id: "d5", title: "Liveblog zu Angriff auf CSD: ++ Dobrindt: \"Keine weitere Gefährdung\" ++" },
  { id: "f2", title: "Verfassungsgericht zu Afghanistan und Dobrindt: Willkür bei Entscheidungen über Leben und Tod" }
]);
check(
  "V2 CSD-Liveblog und Verfassungsgerichtsurteil bilden EINEN Vorgang",
  dobrindt.length === 1 && dobrindt[0].documents.length === 2
);
check("V2 dessen vorgang_id ist vg-dobrindt", deriveVorgangId(dobrindt[0]) === "vg-dobrindt");

// --- V3: vorgang_id ist ein einzelnes Wort und damit kollisionsanfaellig -----
// Jede abgeleitete Kennung besteht aus genau einem Wort. Trifft dieses Wort ein bereits
// bestehendes, fachfremdes KO, wird der komplette Cluster in understandOneCluster mit
// "skipped-exists" verworfen (kein KI-Call, kein ko_document_links-Eintrag).
const alleIds = clusterRawDocuments(EREIGNIS_DOKUMENTE).map((c) => deriveVorgangId(c));
check(
  "V3 jede vorgang_id besteht aus genau einem Wort (kein Ereignis-, Orts- oder Zeitbezug)",
  alleIds.every((id) => /^vg-[a-z0-9äöüß]+$/.test(id))
);
check(
  "V3 keine der Kennungen enthaelt das Ereignis selbst (kein 'csd', kein 'berlin')",
  alleIds.every((id) => !id.includes("csd") && !id.includes("berlin"))
);
// Dieselben Dokumente in anderer Eingangsreihenfolge ergeben andere Vorgaenge:
// die Vorgangsbildung ist reihenfolgeabhaengig und damit nicht stabil.
const umgekehrt = clusterRawDocuments(EREIGNIS_DOKUMENTE.slice().reverse()).map((c) => deriveVorgangId(c));
check(
  "V3 die Vorgangsmenge haengt von der Eingangsreihenfolge ab (nicht stabil)",
  JSON.stringify(alleIds.slice().sort()) !== JSON.stringify(umgekehrt.slice().sort())
);

console.log(fail === 0
  ? "\nOK — der dokumentierte Defekt ist unveraendert reproduzierbar (siehe Kopfkommentar)."
  : `\n${fail} Erwartung(en) nicht erfuellt — die Vorgangsbildung hat sich geaendert. Befund und Reparaturplan in docs/befund-csd-2026-vorgangsverlust.md pruefen und diesen Test durch den Soll-Test ersetzen.`);
process.exit(fail === 0 ? 0 : 1);
