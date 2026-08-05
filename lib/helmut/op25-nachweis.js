"use strict";

// Helmut — OP-25 Production-Nachweis: Bewertungskern (E3-Entscheidung 2026-08-04).
// =============================================================================================
// ZWECK: der ausfuehrbare, fail-closed Abnahmevertrag fuer den NEUEN OP-25-Production-
// Nachweis. REINE Funktionen, kein IO, kein Netz, keine KI — das Lesen der Production-Daten
// uebernimmt ausschliesslich das CLI `scripts/op25-production-nachweis.js`; die Tests speisen
// konstruierte Eingaben.
//
// DIE E3-ENTSCHEIDUNG, die dieser Vertrag umsetzt (verbindlich, 2026-08-04):
//   * Kapazitaetsvertrag und Understanding-Rueckstand sind ZWEI verschiedene Dinge.
//   * `datenstand.status` wird NICHT kosmetisch umgedeutet: ein `teilweise` bleibt
//     `teilweise`. Der Nachweis kann trotzdem bestehen — aber NUR, wenn aus
//     strukturierten Laufdaten bewiesen ist, dass die einzige Ursache regulaer
//     zurueckgestellte Verstehensarbeit innerhalb des vorgesehenen Zeitbudgets ist,
//     dass sie vollstaendig gezaehlt und dauerhaft wiederauffindbar ist (pending-
//     Wissensobjekte mit Dokumentverknuepfung) und dass Abruf, Persistenz und
//     Kontextvertrag vollstaendig erfuellt sind.
//   * Ein `teilweise` wegen Quellen, Persistenz, Kontext, Datenbank, Sperre,
//     unbekannter Ursache oder Datenverlust ergibt IMMER `nicht_bestanden`.
//   * Der fachliche Verstehensrueckstand bleibt danach offen (OP-14) — er wird durch
//     ein Bestehen des Kapazitaetsvertrags NICHT als geloest behauptet.
//
// NACHTRAGSKORREKTUR (2026-08-04/5, nach Merge von PR #222): DEPLOYMENTGEBUNDENE
// STARTBASELINE + VERBINDLICHER COMMITNACHWEIS. Der Aktivierungszeitpunkt ist der
// READY-Zeitpunkt des neuen Production-Deployments, das `HELMUT_CRON_GLOBALABRUF=on`
// tatsaechlich enthaelt (eine Vercel-Env wirkt erst in einem NEUEN Deployment). Die
// Startbaseline verlangt und speichert den vollen erwarteten Merge-Commit; beim Schreiben
// wird NICHT gegen alte Prozesslaeufe geprueft (direkt nach READY existiert noch kein Lauf
// des neuen Stands). Die Auswertung prueft die `commit_ref`-Werte ALLER Fensterlaeufe
// exakt gegen den gespeicherten Commit — Details am Commit-Abschnitt unten.
//
// DREI HAERTUNGEN AUS DER REVIEW ZU PR #222 (2026-08-04), jeweils fail closed:
//   (1) KOSTEN werden vollstaendig validiert: `NaN`, negative, nicht endliche Werte und eine
//       nicht belegbare VOLLSTAENDIGKEIT der Kostendaten (fehlende Nutzungsliste, unbepreiste
//       Eintraege, verdraengtes Kostenfenster) fuehren zu `blockiert` — nie zu 0,00 USD.
//   (2) Die Mandatsmenge wird IDENTITAETSGENAU am Fensterstart eingefroren (Startbaseline mit
//       Aktivierungszeitpunkt, exakter Menge und stabilem Hash). Jeder Lauf UND der Endzustand
//       werden dagegen geprueft — ein Austausch bei gleicher Anzahl faellt damit auf, und eine
//       spaetere Rueckkehr zur Ursprungsmenge heilt ein zwischenzeitlich veraendertes Fenster
//       nicht.
//   (3) Die DAUERHAFTE Belegquelle (`process_runs`-Zeilen `globalphase`) geht wirklich in die
//       Bewertung ein: sie unterscheidet einen NIE GELAUFENEN Termin von einem durch die
//       Blob-Retention VERDRAENGTEN Beleg, und sie liefert zusammen mit dem Datenstands-
//       Vermerk die VERSIEGELTE Dauer. Zusaetzlich gilt ein reproduzierbarer
//       Aufbewahrungsvertrag: reicht die Retention fuer das Fenster rechnerisch nicht, ist das
//       Ergebnis `blockiert`.
//
// DIE VIER AUSGAENGE (Exit-Codes des CLI):
//   bestanden             (0) — alle Vertragspunkte belegt.
//   nicht_bestanden       (1) — mindestens eine BEWIESENE Vertragsverletzung.
//   blockiert             (2) — Beleg-/Konfigurationsluecke oder ungueltiges Fenster;
//                               ohne Behebung/Entscheidung nicht bewertbar.
//   noch_nicht_auswertbar (3) — das Fenster existiert nicht, ist kuerzer als 24 h
//                               oder noch nicht vollstaendig vergangen.
//
// VORRANG (dokumentiert, testgesichert):
//   1. Fensterpruefung (Stufe 1) geht allem voraus — ein Fenster unter 24 h wird NIE
//      gruen und NIE rot, es ist `noch_nicht_auswertbar` (Vertragspunkt 20).
//   2. Danach: bewiesene Verletzung (`nicht_bestanden`) schlaegt Beleg-Luecke
//      (`blockiert`) schlaegt „Lauf moeglicherweise noch nicht versiegelt"
//      (`noch_nicht_auswertbar`) schlaegt `bestanden`.

const crypto = require("crypto");

const AUSGANG_BESTANDEN = "bestanden";
const AUSGANG_NICHT_BESTANDEN = "nicht_bestanden";
const AUSGANG_BLOCKIERT = "blockiert";
const AUSGANG_NOCH_NICHT_AUSWERTBAR = "noch_nicht_auswertbar";

const EXIT_CODES = Object.freeze({
  [AUSGANG_BESTANDEN]: 0,
  [AUSGANG_NICHT_BESTANDEN]: 1,
  [AUSGANG_BLOCKIERT]: 2,
  [AUSGANG_NOCH_NICHT_AUSWERTBAR]: 3
});

// Mindestlaenge des Beobachtungsfensters: 24 VOLLSTAENDIG vergangene Stunden.
const MIN_FENSTER_MS = 24 * 60 * 60 * 1000;

// HARTE UNTERGRENZE: der gescheiterte Lauf vom 2026-08-03 16:00 UTC
// (`cron-pipeline-20260803160002-xm71n`, 267-s-Ueberziehung, 0 von 6 Mandaten) und alles
// davor duerfen NIEMALS in einen neuen Erfolgsnachweis einfliessen. Ein Fenster, das vor
// diesem Zeitpunkt beginnt, ist ungueltig — unabhaengig von jedem Parameter.
const FRUEHESTER_FENSTERSTART_MS = Date.parse("2026-08-04T00:00:00Z");

// Die schweren Crons, die den globalen Pfad fahren (server.js `cronSchwererPfad`).
const SCHWERE_CRONS = Object.freeze(["crawl", "pipeline"]);

// Aeusseres Zeitlimit eines schweren Cron-Laufs (withTimeout 280 s < maxDuration 300 s)
// plus Schreibtoleranz fuer Telemetrie nach der Antwort.
const AEUSSERES_LIMIT_MS = 280000;
const NACHLAUF_TOLERANZ_MS = 60000;

// Toleranz zwischen geplanter Cron-Minute und tatsaechlichem Laufstart (Vercel-Jitter).
const SLOT_TOLERANZ_MS = 15 * 60 * 1000;

// K8 (Ursachenanalyse §7.7.6, Befund 4): VERSIEGELUNGSTOLERANZ fuer Messartefakte.
// Die Vormerkschleife stoppt an der Verarbeitungsdeadline; die danach faelligen
// Abschlussschreiben (Telemetrie + Laufdatensatz) tragen eine kleine, nicht exakt
// vorhersagbare Schreiblatenz. Beobachtet wurden +313 ms bei einer 5-s-Reserve —
// ein Randartefakt, kein Kapazitaetsproblem. Der Scheduler reserviert seit K8 eine
// eigene Abschlussreserve (10 s, scheduler.ABSCHLUSS_RESERVE_MS); diese Toleranz
// deckt nur noch die RESTVARIANZ eines einzelnen Abschlussschreibens (Timer-
// Granularitaet + Blob-Write-Jitter, beobachtet ~0,3 s, dreifach gepuffert).
// Sie ist bewusst KLEIN: ein struktureller Budgetueberzug (der gescheiterte Lauf
// vom 2026-08-03 lag 267 000 ms drueber) liegt um Groessenordnungen darueber und
// bleibt eine bewiesene Vertragsverletzung.
const VERSIEGELUNGS_TOLERANZ_MS = 1000;

// Dokumentierte Toleranz zwischen der AKTIVIERUNG und der Erhebung der Startbaseline.
// „Unmittelbar nach der Aktivierung" ist damit eine pruefbare Zahl, kein Vorsatz.
const BASELINE_TOLERANZ_MS = 15 * 60 * 1000;

// Der Prozessname der dauerhaften Laufzeile (scheduler.runGlobaleErfassung).
const GLOBALPHASE_PROZESS = "globalphase";

// Aufgreifschwelle fuer eine AUFFAELLIGE Kontextzahl. KEIN Fehlwert an sich
// (vorgangskontext.md §7.5: Vertraege, keine Zahlengrenze) — aber oberhalb der Schwelle
// braucht der Lauf eine dokumentierte Erklaerung, sonst faellt er durch (fail closed).
function kontextAufgreifschwelle(mandate) {
  return 2 * Math.max(0, Number(mandate) || 0) + 1;
}

// Geschlossenes Fehlerklassen-Vokabular des Bestands (redact.classifyPipelineError).
// `unknown` ist BEWUSST NICHT enthalten: ein nicht klassifizierbarer Fehler ist eine
// unbekannte Fehlerklasse und macht den Lauf nicht bestehbar.
const BEKANNTE_FEHLERKLASSEN = Object.freeze([
  "llm-provider", "rate-limit", "timeout", "db", "schema-invalid",
  "dns", "connection", "tls", "empty-feed", "http-5xx", "http-4xx", "parse"
]);

// Zulaessige runState-Werte eines Laufs mit klassifizierten Abweichungen. Ein stark
// degradierter oder fehlgeschlagener Abruf ist KEINE zulaessige Abweichung.
const ZULAESSIGE_RUN_STATES = Object.freeze([
  "gesund", "teilweise-degradiert", "cooldown-reduziert", "aggregator-gedrosselt"
]);

// ---------------------------------------------------------------------------------------------
// Mandatsmenge: identitaetsgenaue Signatur (Review-Haertung 2).
// ---------------------------------------------------------------------------------------------

// Normalisiert eine Mandatsmenge: getrimmt, dedupliziert, deterministisch sortiert.
// Reihenfolge und Duplikate duerfen die Identitaet einer MENGE nicht veraendern.
function normalisiereMandate(ids) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id == null ? "" : id).trim())
    .filter(Boolean))].sort();
}

// Stabiler Hash EINER Mandatsmenge. Er ist die kompakte, vergleichbare Kennzeichnung des
// eingefrorenen Zustands — zwei Mengen sind genau dann gleich, wenn ihre Signatur gleich ist.
// Der Laengenanteil vorn macht einen Austausch bei GLEICHER Anzahl im Bericht sofort lesbar
// (die Zahl bleibt, der Hash aendert sich).
function mandatsSignatur(ids) {
  const liste = normalisiereMandate(ids);
  const hash = crypto.createHash("sha256").update(liste.join("\n"), "utf8").digest("hex").slice(0, 16);
  return { anzahl: liste.length, mandate: liste, signatur: `m${liste.length}-${hash}` };
}

function mengeGleich(a, b) {
  const sa = normalisiereMandate(a);
  const sb = normalisiereMandate(b);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

// ---------------------------------------------------------------------------------------------
// K2 (Ursachenanalyse §7.7.6, Befund 2): EINE Mandatswahrheit.
//
// Der gescheiterte Nachweis kannte ZWEI Wahrheiten: die Laufzeit plante relational
// (`mandate_profiles`, 6 aktive), das Nachweis-CLI las den `main`-Blob (5 aktive). Die
// relationale Mandatsplanung ist die KANONISCHE Systemwahrheit (Produktentscheidung
// 2026-08-05). Diese Pruefung stellt VOR dem Start eines Nachweisfensters fest, ob die
// kanonische Menge von den uebrigen beobachtbaren Sichten widerspruchsfrei getragen wird:
//
//   * `blob`               — die Alt-Sicht (`main`-Blob `profiles`). Sie plant nichts mehr,
//                            aber solange sie existiert und WIDERSPRICHT, sind zwei Wahrheiten
//                            im Umlauf (genau der K2-Befund). Ein Widerspruch blockiert den
//                            Start, bis der Betreiber die Deaktivierung relational nachgeholt
//                            oder die Abweichung geklaert hat.
//   * `laufzeitPlanung`    — die Mandatskennungen, die der JUENGSTE globale Lauf tatsaechlich
//                            geplant hat (`quellenVereinigung.mandateIds`): der empirische
//                            Beleg, was die Laufzeit wirklich tut. Ein frischer Lauf, der der
//                            kanonischen Menge widerspricht, blockiert den Start.
//
// FAIL CLOSED: eine nicht lesbare kanonische Menge ist IMMER ein Blocker — es gibt keinen
// stillen Rueckfall auf den Blob. Eine fehlende Vergleichssicht (kein Blob-Bestand, noch kein
// Lauf) ist dagegen KEIN Widerspruch: verglichen wird nur, was belegt beobachtet wurde.
function pruefeMandatsWahrheit({ kanonisch = null, blob = null, laufzeitPlanung = null, laufzeitLaufId = null } = {}) {
  const befunde = [];
  if (!Array.isArray(kanonisch) || !kanonisch.length) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "mandatswahrheit-nicht-lesbar",
      "Die kanonische (relationale) Mandatsmenge ist nicht lesbar oder leer — der Nachweis"
      + " faellt NICHT auf den Blob zurueck (eine Mandatswahrheit, fail closed)."));
    return { befunde, signatur: null };
  }
  const sig = mandatsSignatur(kanonisch);
  if (Array.isArray(blob) && !mengeGleich(blob, kanonisch)) {
    const blobSig = mandatsSignatur(blob);
    befunde.push(befund(AUSGANG_BLOCKIERT, "mandatswahrheiten-widerspruechlich",
      `Blob-Profilsicht ${blobSig.signatur} (${blobSig.mandate.join(", ") || "leer"}) widerspricht`
      + ` der kanonischen relationalen Menge ${sig.signatur} (${sig.mandate.join(", ")}).`
      + " Zwei Mandatswahrheiten sind im Umlauf — vor dem Start relational nachziehen"
      + " (Betreiberaktion, z. B. Deaktivierung nachholen), sonst beginnt kein Fenster."));
  }
  if (Array.isArray(laufzeitPlanung) && !mengeGleich(laufzeitPlanung, kanonisch)) {
    const laufSig = mandatsSignatur(laufzeitPlanung);
    befunde.push(befund(AUSGANG_BLOCKIERT, "laufzeitplanung-widerspricht-mandatswahrheit",
      `Der juengste globale Lauf${laufzeitLaufId ? ` (${laufzeitLaufId})` : ""} plante`
      + ` ${laufSig.signatur} (${laufSig.mandate.join(", ") || "leer"}), kanonisch ist`
      + ` ${sig.signatur} (${sig.mandate.join(", ")}). CLI- und Laufzeitsignatur muessen vor`
      + " dem Start identisch sein — Widerspruch klaeren oder einen frischen Lauf abwarten."));
  }
  return { befunde, signatur: sig };
}

// ---------------------------------------------------------------------------------------------
// Commit-Beleg (Nachtragskorrektur 2026-08-04/5) — deploymentgebunden und fail closed.
//
// BEFUND, der zu dieser Fassung fuehrte: die fruehere Pruefung (`pruefeCommitBeleg`) verglich
// beim SCHREIBEN der Startbaseline den erwarteten Commit mit dem Commit des JUENGSTEN
// GESPEICHERTEN Prozesslaufs. Das verwechselte zwei Zeitpunkte: unmittelbar nach READY des
// neuen Deployments kann noch KEIN Lauf des neuen Stands existieren — der juengste Lauf
// stammt vom ALTEN Deployment. Ein alter Lauf darf die Baseline weder blockieren noch
// faelschlich bestaetigen. Ausserdem war der erwartete Commit optional, und die spaetere
// Gesamtauswertung prueft die `commit_ref`-Werte der Fensterlaeufe gar nicht.
//
// JETZT gilt:
//   * Die Startbaseline verlangt den VOLLSTAENDIGEN erwarteten Merge-Commit (40 Hexziffern)
//     und speichert ihn verbindlich (`erwarteterDeploymentCommit`). Beim Schreiben wird
//     AUSDRUECKLICH NICHT gegen alte Prozesslaeufe geprueft.
//   * Bestaetigt wird der Stand erst in der AUSWERTUNG: jeder zum Nachweisfenster gehoerende
//     `globalphase`-Prozesslauf muss einen gueltigen `commit_ref` tragen, der exakt zum
//     gespeicherten erwarteten Commit gehoert. Fehlender Beleg => `blockiert`; ein gueltiger,
//     aber abweichender Commit => `nicht_bestanden` (im Fenster lief ein anderer Stand).
//   * Laeufe VOR dem Fenster (Alt-Bestand) werden weder geprueft noch als Bestaetigung
//     verwendet.
// ---------------------------------------------------------------------------------------------

// Untergrenze: 7 Hexziffern (die uebliche Git-Kurzform). Obergrenze: 40 (SHA-1 in voller
// Laenge). Beides inklusiv. Der ERWARTETE Deployment-Commit muss immer die VOLLE Laenge
// haben — nur er macht die spaetere Gleichheitspruefung exakt.
const COMMIT_MIN_LAENGE = 7;
const COMMIT_MAX_LAENGE = 40;
const COMMIT_VOLL_LAENGE = 40;
const COMMIT_MUSTER = /^[0-9a-f]+$/;

// Normalisiert einen rohen Commit-Wert. Rueckgabe: die normalisierte SHA (getrimmt,
// kleingeschrieben) oder `null`, wenn der Wert KEINE gueltige SHA bzw. kein gueltiges
// Praefix ist. Nicht-Zeichenketten, leere Werte, Nicht-Hex, zu kurz und zu lang sind alle
// `null` — es gibt keinen Weg, aus einem ungueltigen Wert einen gueltigen zu machen.
function normalisiereCommit(roh) {
  if (typeof roh !== "string") return null;
  const s = roh.trim().toLowerCase();
  if (s.length < COMMIT_MIN_LAENGE || s.length > COMMIT_MAX_LAENGE) return null;
  return COMMIT_MUSTER.test(s) ? s : null;
}

// Normalisiert einen Commit-Wert, der die VOLLE SHA sein MUSS (40 Hexziffern). Kurzformen,
// Anhaenge und alles Ungueltige sind `null` — eine Kurzform kann die spaetere exakte
// Zugehoerigkeitspruefung der Fensterlaeufe nicht tragen.
function normalisiereVollenCommit(roh) {
  const s = normalisiereCommit(roh);
  return s !== null && s.length === COMMIT_VOLL_LAENGE ? s : null;
}

// Ist `kurz` ein ECHTES Praefix von `lang`? Beide muessen bereits normalisiert sein.
// „Echt" heisst: strikt kuerzer UND zeichengleich am Anfang. Gleich lange, verschiedene
// Werte sind damit nie ein Praefixtreffer.
function istEchtesPraefix(kurz, lang) {
  return kurz.length < lang.length && lang.startsWith(kurz);
}

// Prueft den Commit-Beleg EINES Fensterlaufs gegen den in der Startbaseline gespeicherten
// erwarteten Merge-Commit. Vier Ausgaenge:
//   bestaetigt     — `commit_ref` ist gueltig und exakt der erwartete Commit
//   fehlt          — kein oder kein gueltiger `commit_ref` (=> blockiert)
//   unvollstaendig — gueltiges ECHTES Praefix des erwarteten Commits: widerspricht ihm
//                    nicht, kann die exakte Zugehoerigkeit aber nicht belegen (=> blockiert)
//   abweichend     — gueltiger, anderer Commit (=> nicht_bestanden: im Fenster lief
//                    nachweislich ein anderer Deployment-Stand)
function pruefeFensterlaufCommit(erwartet, beobachtet) {
  const soll = normalisiereVollenCommit(erwartet);
  const ist = normalisiereCommit(beobachtet);
  if (soll === null) return { ergebnis: "fehlt", beobachtet: ist };
  if (ist === null) return { ergebnis: "fehlt", beobachtet: null };
  if (ist === soll) return { ergebnis: "bestaetigt", beobachtet: ist };
  if (istEchtesPraefix(ist, soll)) return { ergebnis: "unvollstaendig", beobachtet: ist };
  return { ergebnis: "abweichend", beobachtet: ist };
}

// ---------------------------------------------------------------------------------------------
// Cron-Kadenz: aus der WIRKSAMEN Konfiguration (vercel.json), nichts erfunden.
// Nur einfache Tagesplaene ("M H * * *") sind auswertbar — alles andere ist eine
// Konfigurationsluecke und fuehrt zu `blockiert`, nie zu geratenen Zeiten.
// ---------------------------------------------------------------------------------------------

function parseTagesplan(schedule) {
  const teile = String(schedule || "").trim().split(/\s+/);
  if (teile.length !== 5) return null;
  const [min, std, tag, monat, wochentag] = teile;
  if (tag !== "*" || monat !== "*" || wochentag !== "*") return null;
  const minute = Number(min);
  const stunde = Number(std);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (!Number.isInteger(stunde) || stunde < 0 || stunde > 23) return null;
  return { minute, stunde };
}

function schwereKadenz(crons) {
  const liste = [];
  for (const eintrag of Array.isArray(crons) ? crons : []) {
    const pfad = String((eintrag && eintrag.path) || "");
    const cronName = SCHWERE_CRONS.find((name) => pfad === `/api/cron/${name}`);
    if (!cronName) continue;
    const plan = parseTagesplan(eintrag && eintrag.schedule);
    liste.push({ cronName, schedule: String((eintrag && eintrag.schedule) || ""), plan });
  }
  return liste;
}

// Alle im Fenster ERWARTETEN schweren Laeufe (UTC-Tagesplaene der wirksamen Konfiguration).
function erwarteteLaeufe({ vonMs, bisMs, crons }) {
  const kadenz = schwereKadenz(crons);
  if (!kadenz.length || kadenz.some((k) => !k.plan)) return null; // nicht ermittelbar
  const slots = [];
  const startTag = new Date(vonMs);
  const ersterTagUtcMs = Date.UTC(startTag.getUTCFullYear(), startTag.getUTCMonth(), startTag.getUTCDate());
  for (let tagMs = ersterTagUtcMs; tagMs <= bisMs; tagMs += 24 * 60 * 60 * 1000) {
    for (const k of kadenz) {
      const geplantMs = tagMs + (k.plan.stunde * 60 + k.plan.minute) * 60 * 1000;
      if (geplantMs >= vonMs && geplantMs < bisMs) {
        slots.push({ cronName: k.cronName, geplantMs });
      }
    }
  }
  slots.sort((a, b) => a.geplantMs - b.geplantMs);
  return slots;
}

// K3/K7 (Ursachenanalyse §7.7.6, Befund 3): der GitHub-Actions-Watchdog
// (`briefing-watchdog.yml`, taeglich 05:30 UTC) kann einen ZUSAETZLICHEN schweren
// Lauf ausloesen — seit K7 nur noch bedingt, aber genau dann, wenn der regulaere
// Erfolg fehlt, laeuft er wirklich. Der Aufbewahrungsvertrag muss ihn deshalb als
// moeglichen Regel-Slot MITRECHNEN. Die Plaene kommen aus der wirksamen Workflow-
// Konfiguration (das CLI parst `briefing-watchdog.yml`); sind sie nicht ermittelbar,
// ist das eine Konfigurationsluecke (`null`), nie eine geratene Zahl.
function erwarteteWatchdogLaeufe({ vonMs, bisMs, watchdogCrons }) {
  if (!Array.isArray(watchdogCrons)) return null;
  const plaene = watchdogCrons.map((eintrag) => parseTagesplan(
    typeof eintrag === "string" ? eintrag : (eintrag && eintrag.schedule)
  ));
  if (!plaene.length || plaene.some((p) => !p)) return null;
  const slots = [];
  const startTag = new Date(vonMs);
  const ersterTagUtcMs = Date.UTC(startTag.getUTCFullYear(), startTag.getUTCMonth(), startTag.getUTCDate());
  for (let tagMs = ersterTagUtcMs; tagMs <= bisMs; tagMs += 24 * 60 * 60 * 1000) {
    for (const plan of plaene) {
      const geplantMs = tagMs + (plan.stunde * 60 + plan.minute) * 60 * 1000;
      if (geplantMs >= vonMs && geplantMs < bisMs) slots.push({ geplantMs });
    }
  }
  slots.sort((a, b) => a.geplantMs - b.geplantMs);
  return slots;
}

// ---------------------------------------------------------------------------------------------
// K3: Aufbewahrungsvertrag — nachvollziehbare Bedarfsrechnung statt eingefrorener Annahme.
//
// Der gescheiterte Nachweis 2026-08-04/05 rechnete `3 Slots x (1 + 5) = 18` gegen Retention 20
// und WARNTE nur. Real brauchte das Fenster `4 Laeufe x (1 + 6) = 28` Datensaetze: der
// Watchdog war ein vierter planmaessiger schwerer Lauf, und die Laufzeit plante SECHS Mandate.
// Jetzt gilt: Bedarf = (Regel-Slots + Watchdog-Slots) x (1 global + n Mandate) + Puffer.
// Der Puffer ist EIN weiterer vollstaendiger schwerer Lauf (1 + n): genau die Groesse, um die
// ein einzelner ausserplanmaessiger oder verzoegerter Lauf (manueller Trigger, GitHub-Verzug
// ueber Mitternacht, Auswertung nicht unmittelbar nach Fensterende) die Ablage zusaetzlich
// belastet. Die Mandatszahl ist IMMER die reale Zahl des bewerteten Fensters — nie eine
// eingefrorene Konstante.
function aufbewahrungsBedarf({ regelSlots = 0, watchdogSlots = 0, mandatszahl = 0 } = {}) {
  const n = Math.max(0, Math.floor(Number(mandatszahl) || 0));
  const regel = Math.max(0, Math.floor(Number(regelSlots) || 0));
  const watchdog = Math.max(0, Math.floor(Number(watchdogSlots) || 0));
  const jeLauf = 1 + n;
  const puffer = jeLauf;
  return {
    mandatszahl: n,
    regelLaeufe: regel,
    watchdogLaeufe: watchdog,
    datensaetzeJeLauf: jeLauf,
    puffer,
    mindest: (regel + watchdog) * jeLauf + puffer
  };
}

// Die vollstaendige, benennende Blockademeldung (Vertragsanforderung: Istwert, Mindestwert,
// Mandatszahl, beruecksichtigte Laufslots und erforderliche Betreiberaktion in EINER Meldung).
function aufbewahrungsMeldung(bedarf, retention) {
  return `Aufbewahrung zu klein: Ist ${retention}, Mindestbedarf ${bedarf.mindest}`
    + ` = (${bedarf.regelLaeufe} Regel-Slots + ${bedarf.watchdogLaeufe} Watchdog-Slots)`
    + ` x (1 global + ${bedarf.mandatszahl} Mandate) + Puffer ${bedarf.puffer}.`
    + ` Betreiberaktion: HELMUT_CRAWL_RUN_RETENTION auf >= ${bedarf.mindest} setzen`
    + " (Vercel-Env, freigabepflichtig) und neu deployen — vorher startet kein Nachweisfenster.";
}

// ---------------------------------------------------------------------------------------------
// Laufkennungen: `helmutRunId("cron-<name>", t0)` = `cron-<name>-<JJJJMMTTHHMMSS>-<rand>`.
// Der Zeitstempel steckt IN der Kennung — er ist die stabile Startzeit des Laufs.
// ---------------------------------------------------------------------------------------------

function laufStartAusRunId(runId) {
  const m = /^cron-(crawl|pipeline)-(\d{14})-[a-z0-9]+(?:-global)?$/.exec(String(runId || ""));
  if (!m) return null;
  const s = m[2];
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? { cronName: m[1], startMs: ms, global: /-global$/.test(String(runId)) } : null;
}

function istRegulaererLauf(runId, geplantMs, toleranzMs = SLOT_TOLERANZ_MS) {
  const start = laufStartAusRunId(runId);
  if (!start) return false;
  return Math.abs(start.startMs - geplantMs) <= toleranzMs;
}

// ---------------------------------------------------------------------------------------------
// Kostenvertrag (Review-Haertung 1) — fail closed.
// ---------------------------------------------------------------------------------------------

// Eine Kostenzahl ist nur brauchbar, wenn sie eine ENDLICHE, NICHT NEGATIVE Zahl ist.
// `NaN`, `Infinity`, `-1`, `"abc"` und `true` sind es alle nicht. Ohne diese Pruefung
// bestuende der Kostenvertrag bereits dadurch, dass `NaN > rahmen` immer `false` ist —
// ein kaputter Wert waere ein bestandener Vertrag gewesen.
function istBrauchbareKostenzahl(wert) {
  return typeof wert === "number" && Number.isFinite(wert) && wert >= 0;
}

// STRIKTE Zahlenlesung: `null` ist „nicht vorhanden", NICHT `0`. Ohne sie waere jedes
// fehlende Feld eine belegte Null — `Number(null) === 0` und `Number.isFinite(0) === true`.
// Genau diese stille Umdeutung ist die Familie des Kostenbefunds aus der Review; sie darf
// nirgends im Vertrag auftreten (fehlende Dauer, fehlendes Budget, fehlende Zaehlung).
function alsZahl(wert) {
  if (wert == null || wert === "") return null;
  const n = typeof wert === "number" ? wert : Number(wert);
  return Number.isFinite(n) ? n : null;
}

// Prueft den Kostenblock vollstaendig. Rueckgabe: Liste von Befunden (leer = in Ordnung).
// `vollstaendig` ist eine AUSDRUECKLICHE Zusage des Aufrufers, dass die Kostendaten des
// Fensters vollstaendig gelesen wurden; sie fehlt bewusst nicht implizit, denn eine leere
// Nutzungsliste ist von „keine Kosten" nicht zu unterscheiden.
function pruefeKosten(kosten) {
  const befunde = [];
  if (!kosten || typeof kosten !== "object") {
    befunde.push(befund(AUSGANG_BLOCKIERT, "kostenrahmen-nicht-belegbar",
      "LLM-Kosten des Fensters oder dokumentierter Vergleichsrahmen fehlen."));
    return befunde;
  }
  if (!istBrauchbareKostenzahl(kosten.fensterUsd)) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "kostenwert-unbrauchbar",
      `Fensterkosten sind keine endliche, nicht negative Zahl: ${JSON.stringify(kosten.fensterUsd)}`));
  }
  if (!istBrauchbareKostenzahl(kosten.rahmenUsd)) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "kostenrahmen-unbrauchbar",
      `Kostenrahmen ist keine endliche, nicht negative Zahl: ${JSON.stringify(kosten.rahmenUsd)}`));
  }
  // VOLLSTAENDIGKEIT. Eine fehlende oder verdraengte Nutzungsliste sieht wie 0,00 USD aus —
  // genau das darf nie als bestandener Kostenvertrag durchgehen.
  if (kosten.vollstaendig !== true) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "kostendaten-unvollstaendig",
      `Die Vollstaendigkeit der Kostendaten ist nicht belegt${kosten.grund ? `: ${kosten.grund}` : ""}.`));
  }
  // NICHT BEPREISTE Eintraege: ein KI-Aufruf im Fenster ohne brauchbaren Kostenwert macht die
  // Summe zu klein. Er wird gezaehlt und blockiert, statt still unterzugehen.
  const unbepreist = alsZahl(kosten.unbepreisteEintraege);
  if (unbepreist === null || unbepreist < 0) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "kostendaten-unvollstaendig",
      "Die Zahl nicht bepreisbarer Nutzungseintraege ist nicht belegt."));
  } else if (unbepreist > 0) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "kosten-nicht-bepreisbar",
      `${unbepreist} Nutzungseintraege im Fenster tragen keinen brauchbaren Kostenwert —`
      + " die Fenstersumme waere zu klein."));
  }
  if (befunde.length) return befunde;
  if (kosten.fensterUsd > kosten.rahmenUsd) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "llm-kosten-ueber-rahmen",
      `Fenster ${kosten.fensterUsd} USD > Rahmen ${kosten.rahmenUsd} USD.`));
  }
  return befunde;
}

// Aufbewahrungsgrenze der Nutzungseintraege im Auth-Store (storage.js `normalizeAuthStore`,
// fest 5 000). Sitzt die Liste an dieser Grenze, koennen fruehe Kosten verdraengt sein.
const LLM_USAGE_RETENTION = 5000;

// DER ECHTE KOSTENLESER — hier, nicht im CLI, damit er DIREKT testbar ist und der
// dokumentierte strikte Zahlenvertrag genau EINE Umsetzung hat (Review 2 zu PR #222:
// das CLI deutete zuvor `"1.20"`, `true`, `false` und `null` still in Zahlen um).
//
// STRIKT heisst hier:
//   * Ein Kostenwert zaehlt nur, wenn er ROH schon eine `number` ist — endlich und nicht
//     negativ. `"1.20"` ist eine Zeichenkette, `true` ist ein Wahrheitswert, `null` ist
//     nichts. Alle drei sind `unbepreist`, nicht „1,20 USD" bzw. „0 USD".
//   * Ein Eintrag ohne eindeutig lesbares `createdAt` ist ZEITLICH NICHT ZUORDENBAR. Er
//     wurde bisher stillschweigend uebersprungen — dann darf die Vollstaendigkeit aber
//     nicht behauptet werden, denn er koennte im Fenster liegen.
function kostenAusNutzung({ authStore = null, vonMs = 0, bisMs = 0, rahmenUsd = null, retention = LLM_USAGE_RETENTION } = {}) {
  const leer = (grund) => ({
    fensterUsd: null, rahmenUsd, vollstaendig: false,
    unbepreisteEintraege: null, zeitlichNichtZuordenbar: null, grund
  });
  if (!authStore || typeof authStore !== "object") return leer("Auth-Store nicht lesbar");
  if (!Array.isArray(authStore.llmUsage)) return leer("llmUsage fehlt im Auth-Store");

  const alle = authStore.llmUsage;
  let summe = 0;
  let unbepreist = 0;
  let nichtZuordenbar = 0;
  let imFenster = 0;
  let aeltesterMs = Infinity;

  for (const u of alle) {
    // Zeitliche Zuordnung: NUR eine nicht leere Zeichenkette, die zu einem endlichen
    // Zeitpunkt aufloest, ordnet einen Eintrag zu. Alles andere ist eine Beleglueckeb.
    const roherStempel = u && u.createdAt;
    const t = (typeof roherStempel === "string" && roherStempel.trim())
      ? Date.parse(roherStempel)
      : NaN;
    if (!Number.isFinite(t)) { nichtZuordenbar += 1; continue; }
    if (t < aeltesterMs) aeltesterMs = t;
    if (t < vonMs || t >= bisMs) continue;
    imFenster += 1;
    // STRIKT: der ROHE Wert muss bereits eine brauchbare Zahl sein — keine Umdeutung.
    const roh = u.estimatedCost ?? u.costUsd ?? u.cost;
    if (!istBrauchbareKostenzahl(roh)) { unbepreist += 1; continue; }
    summe += roh;
  }

  const fensterUsd = Math.round(summe * 10000) / 10000;
  const basis = { fensterUsd, rahmenUsd, unbepreisteEintraege: unbepreist, zeitlichNichtZuordenbar: nichtZuordenbar, eintraegeImFenster: imFenster };
  if (nichtZuordenbar > 0) {
    return {
      ...basis, vollstaendig: false,
      grund: `${nichtZuordenbar} Nutzungseintraege ohne lesbaren Zeitstempel — ihre Zugehoerigkeit`
        + " zum Fenster ist nicht belegbar, die Summe koennte zu klein sein"
    };
  }
  // VERDRAENGUNG: sitzt die Nutzungsliste an ihrer Grenze und beginnt sie erst NACH dem
  // Fensterstart, sind fruehe Kosten des Fensters ueberschrieben — die Summe waere zu klein.
  const grenze = alsZahl(retention);
  if (grenze !== null && alle.length >= grenze && Number.isFinite(aeltesterMs) && aeltesterMs > vonMs) {
    return {
      ...basis, vollstaendig: false,
      grund: `Nutzungsliste an der Aufbewahrungsgrenze (${alle.length}); aeltester Eintrag`
        + ` ${new Date(aeltesterMs).toISOString()} liegt nach dem Fensterstart — fruehe Kosten verdraengt`
    };
  }
  return { ...basis, vollstaendig: true };
}

// ---------------------------------------------------------------------------------------------
// Startbaseline: strikte, vollstaendige Pruefung (Review 2 zu PR #222).
// Zuvor waren `signatur`, `aktivierungAtMs` und `erhobenAtMs` nur geprueft worden, WENN sie
// vorhanden waren — eine Baseline ohne diese Felder wurde also akzeptiert. Jetzt sind alle
// Pflichtfelder zwingend; jedes fehlende, leere, ungueltige oder widerspruechliche Feld
// ergibt `blockiert`.
// ---------------------------------------------------------------------------------------------

// Strikte Zeitlesung EINES Baseline-Feldes: entweder eine endliche Zahl (ms) oder eine
// nicht leere ISO-Zeichenkette. `null` wird NIE zu 0 (genau der behobene Befund).
function baselineZeit(roh, isoRoh) {
  const alsMs = alsZahl(roh);
  if (alsMs !== null) return alsMs;
  if (typeof isoRoh === "string" && isoRoh.trim()) {
    const t = Date.parse(isoRoh);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

// Prueft eine rohe Startbaseline vollstaendig. Rueckgabe: { befunde[], frozen|null }.
//
// ZEITFENSTER DER ERHEBUNG (Review 3 zu PR #222): die Baseline belegt den Zustand
// UNMITTELBAR NACH der Aktivierung. Der Bezugspunkt der Toleranz ist deshalb die
// AKTIVIERUNG, nicht der Fensterstart — sonst waere eine Baseline zulaessig, die Stunden
// vor der Aktivierung (also aus der Zeit des alten Bestands) oder lange danach erhoben
// wurde. Verbindlich gilt:
//     aktivierungAtMs <= erhobenAtMs <= aktivierungAtMs + BASELINE_TOLERANZ_MS
// Alles ausserhalb ist fail closed `blockiert`.
function pruefeStartbaseline({ roh = null, aktivierungAtMs = null, jetztMs = null, toleranzMs = BASELINE_TOLERANZ_MS, commitGegenprobe = null } = {}) {
  const fehler = (grund, detail) => ({ befunde: [befund(AUSGANG_BLOCKIERT, grund, detail)], frozen: null, erwarteterCommit: null });
  if (!roh || typeof roh !== "object") {
    return fehler("startbaseline-fehlt",
      "Es gibt keine am Fensterstart erhobene Mandats-Startbaseline. Der Zustand zum"
      + " Aktivierungszeitpunkt ist damit nicht belegt (rein lesend erheben:"
      + " `--startbaseline-schreiben <datei>` unmittelbar nach der Aktivierung).");
  }
  // -- Mandatsliste: Pflicht, nicht leer, nur nicht leere Zeichenketten, ohne Duplikate ----
  if (!Array.isArray(roh.mandate) || !roh.mandate.length) {
    return fehler("startbaseline-mandate-fehlen", "Die Startbaseline traegt keine Mandatsliste.");
  }
  if (!roh.mandate.every((id) => typeof id === "string" && id.trim())) {
    return fehler("startbaseline-mandate-ungueltig",
      "Die Mandatsliste enthaelt Eintraege, die keine nicht leere Zeichenkette sind.");
  }
  const frozen = mandatsSignatur(roh.mandate);
  if (frozen.anzahl !== roh.mandate.length) {
    return fehler("startbaseline-mandate-ungueltig",
      `Die Mandatsliste enthaelt Duplikate (${roh.mandate.length} Eintraege, ${frozen.anzahl} verschiedene).`);
  }
  // -- Anzahl: Pflicht und widerspruchsfrei ------------------------------------------------
  const anzahl = alsZahl(roh.anzahl);
  if (anzahl === null) {
    return fehler("startbaseline-anzahl-fehlt", "Die Startbaseline traegt keine Mandatsanzahl.");
  }
  if (anzahl !== frozen.anzahl) {
    return fehler("startbaseline-anzahl-widerspruch",
      `Die Baseline nennt ${anzahl} Mandate, ihre Liste enthaelt ${frozen.anzahl}.`);
  }
  // -- Signatur: Pflicht und passend --------------------------------------------------------
  if (typeof roh.signatur !== "string" || !roh.signatur.trim()) {
    return fehler("startbaseline-signatur-fehlt",
      "Die Startbaseline traegt keine Signatur — ohne sie ist eine nachtraegliche Aenderung nicht erkennbar.");
  }
  if (roh.signatur !== frozen.signatur) {
    return fehler("startbaseline-signatur-passt-nicht",
      `Die Startbaseline traegt ${roh.signatur}, ihre Mandatsliste ergibt aber ${frozen.signatur}`
      + " — die Baseline wurde nachtraeglich veraendert.");
  }
  // -- Erwarteter Deployment-Commit: Pflicht, VOLLE SHA, keine Vorab-Bestaetigung ----------
  // (Nachtragskorrektur 2026-08-04/5) Die Baseline bindet das Nachweisfenster verbindlich an
  // GENAU den Deployment-Stand, dessen READY-Zeitpunkt die Aktivierung ist. Ohne vollen
  // Merge-Commit ist die spaetere Commitpruefung der Fensterlaeufe unmoeglich — fail closed.
  const commitRoh = roh.erwarteterDeploymentCommit;
  if (commitRoh == null || (typeof commitRoh === "string" && !commitRoh.trim())) {
    return fehler("startbaseline-erwarteter-commit-fehlt",
      "Die Startbaseline traegt keinen erwarteten Deployment-Commit — ohne ihn ist nicht"
      + " pruefbar, ob die Fensterlaeufe auf dem aktivierten Stand liefen (fail closed).");
  }
  const erwarteterCommit = normalisiereVollenCommit(commitRoh);
  if (erwarteterCommit === null) {
    return fehler("startbaseline-erwarteter-commit-ungueltig",
      "Der erwartete Deployment-Commit der Startbaseline ist keine vollstaendige Git-SHA"
      + ` (${COMMIT_VOLL_LAENGE} Hexziffern): ${String(commitRoh).slice(0, 60)}`);
  }
  // Eine Baseline, die den Deployment-Stand schon beim SCHREIBEN als bestaetigt fuehrt,
  // behauptet etwas, das zu diesem Zeitpunkt nicht messbar ist: unmittelbar nach READY
  // existiert noch kein Lauf des neuen Deployments. Bestaetigt wird ausschliesslich in der
  // Auswertung gegen die `commit_ref`-Werte der Fensterlaeufe.
  if (roh.deploymentCommitBestaetigt) {
    return fehler("startbaseline-commit-vorab-bestaetigt",
      "Die Startbaseline behauptet eine Deployment-Bestaetigung zum Schreibzeitpunkt —"
      + " unmittelbar nach READY ist das nicht belegbar (fail closed).");
  }
  // -- Aktivierungszeitpunkt: Pflicht und identisch zum bewerteten -------------------------
  const baselineAktivierungMs = baselineZeit(roh.aktivierungAtMs, roh.aktivierungAt);
  if (baselineAktivierungMs === null) {
    return fehler("startbaseline-aktivierung-fehlt",
      "Die Startbaseline traegt keinen gueltigen Aktivierungszeitpunkt.");
  }
  const bewerteteAktivierung = alsZahl(aktivierungAtMs);
  if (bewerteteAktivierung === null || baselineAktivierungMs !== bewerteteAktivierung) {
    return fehler("startbaseline-fremde-aktivierung",
      `Die Startbaseline gehoert zur Aktivierung ${new Date(baselineAktivierungMs).toISOString()},`
      + ` bewertet wird ${bewerteteAktivierung === null ? "(unbekannt)" : new Date(bewerteteAktivierung).toISOString()}.`);
  }
  // -- Erhebungszeitpunkt: Pflicht und nicht nach dem Fensterstart -------------------------
  const baselineErhobenMs = baselineZeit(roh.erhobenAtMs, roh.erhobenAt);
  if (baselineErhobenMs === null) {
    return fehler("startbaseline-erhebung-fehlt",
      "Die Startbaseline traegt keinen gueltigen Erhebungszeitpunkt — ohne ihn ist nicht belegbar,"
      + " dass sie den Zustand am Fensterstart zeigt.");
  }
  // Eine Baseline VOR der Aktivierung zeigt den Bestand der Zeit DAVOR — sie kann den
  // Zustand zum Aktivierungszeitpunkt nicht belegen.
  if (baselineErhobenMs < baselineAktivierungMs) {
    return fehler("startbaseline-vor-aktivierung",
      `Die Startbaseline wurde ${new Date(baselineErhobenMs).toISOString()} erhoben,`
      + ` also VOR der Aktivierung ${new Date(baselineAktivierungMs).toISOString()} —`
      + " sie zeigt den Bestand vor der Aktivierung.");
  }
  if (baselineErhobenMs > baselineAktivierungMs + toleranzMs) {
    return fehler("startbaseline-zu-spaet-erhoben",
      `Die Startbaseline wurde ${new Date(baselineErhobenMs).toISOString()} erhoben,`
      + ` also mehr als ${Math.round(toleranzMs / 60000)} min nach der Aktivierung`
      + ` ${new Date(baselineAktivierungMs).toISOString()} — dazwischen kann sich der`
      + " Mandatsbestand geaendert haben.");
  }
  // Eine Aktivierung in der ZUKUNFT ist ein Konfigurationsfehler, kein „noch nicht so weit":
  // eine Baseline kann nicht belegen, was noch nicht geschehen ist.
  const jetzt = alsZahl(jetztMs);
  if (jetzt !== null && baselineAktivierungMs > jetzt) {
    return fehler("startbaseline-aktivierung-in-zukunft",
      `Die Aktivierung ${new Date(baselineAktivierungMs).toISOString()} liegt in der Zukunft`
      + ` (jetzt ${new Date(jetzt).toISOString()}) — eine Baseline dazu kann nichts belegen.`);
  }
  // -- Optionale Gegenprobe: nennt der Betreiber bei der AUSWERTUNG einen erwarteten -------
  // Commit, muss er zum in der Baseline gespeicherten gehoeren (Gleichheit oder echtes
  // Praefix) — sonst wird die falsche Belegdatei verwendet. Fail closed.
  if (commitGegenprobe != null && commitGegenprobe !== "") {
    const gegen = normalisiereCommit(commitGegenprobe);
    if (gegen === null || (gegen !== erwarteterCommit && !istEchtesPraefix(gegen, erwarteterCommit))) {
      return fehler("startbaseline-fremder-commit",
        `Der an der Auswertung uebergebene erwartete Commit (${String(commitGegenprobe).slice(0, 60)})`
        + ` gehoert nicht zum in der Baseline gespeicherten ${erwarteterCommit} —`
        + " falsche Belegdatei oder falscher Parameter.");
    }
  }
  return { befunde: [], frozen, erwarteterCommit };
}

// ---------------------------------------------------------------------------------------------
// Befunde: jede Feststellung traegt Schwere + Grund + Detail. Die Schwere entscheidet den
// Gesamtausgang (Vorrang: nicht_bestanden > blockiert > noch_nicht_auswertbar > bestanden).
// ---------------------------------------------------------------------------------------------

function befund(schwere, grund, detail = "") {
  return { schwere, grund, detail: String(detail || "").slice(0, 300) };
}

// Gibt es in diesem Lauf ZAEHLBAR zurueckgestellte Verstehensarbeit? Die Pruefung haengt
// bewusst NICHT allein am Status: der heutige Bestand kann `abgeschlossen` versiegeln,
// obwohl Eager-Arbeit zurueckgestellt wurde (Eager-Rueckstand fliesst nicht in
// `budgetErschoepft` ein). Der Vertrag prueft die Dauerhaftigkeit deshalb immer dann,
// wenn IRGENDEIN Rueckstand belegt ist — unabhaengig vom Statuswort (kein falsches Gruen).
function hatVerstehensRueckstand(detail) {
  if (!detail || typeof detail !== "object") return false;
  const lazy = detail.lazy || {};
  const eager = detail.eager || {};
  if ((Number(lazy.uebersprungeneStapel) || 0) > 0) return true;
  if (lazy.cluster != null && lazy.verarbeitet != null && Number(lazy.verarbeitet) < Number(lazy.cluster)) return true;
  if ((Number(eager.zurueckgestellt) || 0) > 0) return true;
  if ((Number(eager.uebersprungeneStapel) || 0) > 0) return true;
  if ((Number(eager.andereSkips) || 0) > 0) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Bewertung EINES erwarteten schweren Laufs gegen den Kapazitaetsvertrag.
// ---------------------------------------------------------------------------------------------

function bewerteLauf({
  slot,
  globalerLauf,
  prozessLauf = null,            // dauerhafte `process_runs`-Zeile `globalphase` dieses Laufs
  belegVerdraengt = false,       // Blob-Retention hat den Zeitraum ueberschrieben
  mandatsLaeufe = [],
  frozen,                        // eingefrorene Mandatsmenge (Signatur + Liste)
  kontextErklaerung = null,
  bekannteFehlerklassen = BEKANNTE_FEHLERKLASSEN,
  jetztMs
}) {
  const befunde = [];
  const warnungen = [];
  const slotName = `${slot.cronName}@${new Date(slot.geplantMs).toISOString()}`;
  const mandatsMenge = frozen.mandate;

  // -- Existenz und Regularitaet -------------------------------------------------------------
  if (!globalerLauf) {
    const moeglicherweiseOffen = jetztMs < slot.geplantMs + AEUSSERES_LIMIT_MS + NACHLAUF_TOLERANZ_MS;
    if (moeglicherweiseOffen) {
      befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "lauf-moeglicherweise-noch-nicht-versiegelt", slotName));
      return { slot: slotName, einstufung: "noch-laufend-moeglich", befunde, warnungen };
    }
    // HAERTUNG 3: die DAUERHAFTE Zeile unterscheidet zwei voellig verschiedene Faelle.
    // Existiert sie, hat der Lauf STATTGEFUNDEN und nur sein reicher Laufdatensatz ist der
    // Blob-Retention zum Opfer gefallen — das ist eine Beleg-Luecke (`blockiert`), kein
    // bewiesener Vertragsbruch. Fehlt auch sie, hat der Termin nachweislich nichts erzeugt.
    if (prozessLauf) {
      befunde.push(befund(AUSGANG_BLOCKIERT, "laufbeleg-verdraengt",
        `${slotName}: der Lauf ist dauerhaft belegt (${prozessLauf.runId}), sein reicher`
        + " Laufdatensatz wurde aber von der Blob-Retention verdraengt — nicht bewertbar."));
      return { slot: slotName, einstufung: "belegluecke", befunde, warnungen };
    }
    if (belegVerdraengt) {
      befunde.push(befund(AUSGANG_BLOCKIERT, "laufbeleg-verdraengt",
        `${slotName}: liegt vor dem Aufbewahrungshorizont der Laufdatensaetze — weder`
        + " Existenz noch Fehlen des Laufs ist belegbar."));
      return { slot: slotName, einstufung: "belegluecke", befunde, warnungen };
    }
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "fehlender-lauf", slotName));
    return { slot: slotName, einstufung: "fehlt", befunde, warnungen };
  }
  if (globalerLauf.mode !== "global") {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "globaler-pfad-nicht-verwendet", `${slotName}: mode=${globalerLauf.mode}`));
    return { slot: slotName, einstufung: "altpfad", befunde, warnungen };
  }
  if (!istRegulaererLauf(globalerLauf.runId, slot.geplantMs)) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "kein-regulaerer-cron-lauf", `${slotName}: runId=${globalerLauf.runId}`));
    return { slot: slotName, einstufung: "irregulaer", befunde, warnungen };
  }

  const d = globalerLauf.datenstandDetail;
  if (!d || typeof d !== "object") {
    befunde.push(befund(AUSGANG_BLOCKIERT, "laufdatensatz-ohne-ursachenzerlegung",
      `${slotName}: datenstandDetail fehlt — Deployment-Stand ohne E3-Telemetrie oder Belegluecke`));
    return { slot: slotName, einstufung: "belegluecke", befunde, warnungen };
  }

  // -- Globaler Pfad + Kontextvertrag --------------------------------------------------------
  if (d.buendelung !== "kontext") {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "globaler-pfad-nicht-verwendet", `${slotName}: buendelung=${d.buendelung}`));
  }
  const k = d.kontext;
  if (!k || typeof k !== "object") {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "kontexttelemetrie-fehlt", slotName));
  } else {
    const summe = (Number(k.geteilt) || 0) + (Number(k.mandatseigen) || 0) + (Number(k.unbekannt) || 0);
    if (Number(k.kontexte) !== summe) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "kontextgleichung-verletzt",
        `${slotName}: kontexte=${k.kontexte} != geteilt+mandatseigen+unbekannt=${summe}`));
    }
    // PARTITIONSGRENZE: jeder Kontext enthaelt mindestens ein Dokument — mehr Kontexte als
    // Dokumente sind unmoeglich. Der Riegel begrenzt auch die K5-Selbstauskunft: eine
    // "Zusammensetzung" kann keine Zahl jenseits der Dokumentmenge gruen erklaeren.
    if ((Number(k.kontexte) || 0) > (Number(k.dokumente) || 0)) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "kontextgleichung-verletzt",
        `${slotName}: kontexte=${k.kontexte} > dokumente=${k.dokumente} — als Partition unmoeglich`));
    }
    if ((Number(k.unbekannt) || 0) > 0 && !kontextErklaerung) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "unbekannte-kontexte-ohne-erklaerung",
        `${slotName}: unbekannt=${k.unbekannt}, ohneSichtbarkeit=${k.ohneSichtbarkeit}`));
    } else if ((Number(k.unbekannt) || 0) > 0) {
      warnungen.push(`${slotName}: ${k.unbekannt} unbekannte Kontexte — erklaert: ${kontextErklaerung}`);
    }
    // K5 (Ursachenanalyse §7.7.6, Befund 6): die Schwelle `2n+1` ist strukturell blind —
    // dokumentgetriebene Kontexte (Mehrfachherkunft eines Dokuments ueber mehrere Quellen,
    // DIP-je-Dokument-Sichtbarkeit) bilden tagesabhaengig Teilmengen-Signaturen, die kein
    // statisches Modell vorhersagt (beobachtet: 15 bei n=6, statisch waeren 7). Massgeblich
    // ist deshalb die VOM LAUF PERSISTIERTE ZUSAMMENSETZUNG (`kontext.zusammensetzung`):
    //   * Sie muss aufgehen (statisch + dokumentgetrieben + unbekannt = kontexte) und
    //     plausibel sein (statisch <= statischMoeglich) — sonst ist der Lauf widerlegt.
    //   * Geht sie auf, ist die Zahl ERKLAERT — egal ob ueber oder unter `2n+1`.
    //   * FEHLT sie (Alt-Lauf) und liegt die Zahl ueber der Aufgreifschwelle, ist das
    //     DIAGNOSEBEDARF (`blockiert`), kein bewiesener fachlicher Fehler: eine
    //     dokumentgetriebene Zahl darf nicht per blinder Formel als Verletzung gelten.
    const zusammensetzung = k.zusammensetzung && typeof k.zusammensetzung === "object"
      ? k.zusammensetzung : null;
    const schwelle = kontextAufgreifschwelle(mandatsMenge.length);
    if (zusammensetzung) {
      const statisch = alsZahl(zusammensetzung.statisch);
      const dokumentgetrieben = alsZahl(zusammensetzung.dokumentgetrieben);
      const zUnbekannt = alsZahl(zusammensetzung.unbekannt);
      const statischMoeglich = alsZahl(zusammensetzung.statischMoeglich);
      if (statisch === null || dokumentgetrieben === null || zUnbekannt === null || statischMoeglich === null) {
        befunde.push(befund(AUSGANG_BLOCKIERT, "kontextzusammensetzung-unvollstaendig",
          `${slotName}: zusammensetzung=${JSON.stringify(zusammensetzung).slice(0, 120)}`));
      } else if (statisch + dokumentgetrieben + zUnbekannt !== Number(k.kontexte)) {
        befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "kontextzusammensetzung-inkonsistent",
          `${slotName}: statisch=${statisch} + dokumentgetrieben=${dokumentgetrieben}`
          + ` + unbekannt=${zUnbekannt} != kontexte=${k.kontexte}`));
      } else if (statisch > statischMoeglich) {
        befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "kontextzusammensetzung-unplausibel",
          `${slotName}: ${statisch} statische Kontexte, der Quellenplan traegt aber nur`
          + ` ${statischMoeglich} statische Signaturen`));
      } else if ((Number(k.kontexte) || 0) > schwelle) {
        warnungen.push(`${slotName}: kontexte=${k.kontexte} ueber Aufgreifschwelle ${schwelle} —`
          + ` durch die Laufzusammensetzung erklaert (statisch=${statisch},`
          + ` dokumentgetrieben=${dokumentgetrieben}, unbekannt=${zUnbekannt},`
          + ` dipDokumente=${zusammensetzung.dipDokumente ?? "?"}, mehrfachHerkunft=${zusammensetzung.mehrfachHerkunft ?? "?"})`);
      }
    } else if ((Number(k.kontexte) || 0) > schwelle) {
      if (!kontextErklaerung) {
        befunde.push(befund(AUSGANG_BLOCKIERT, "kontextzahl-diagnosebedarf",
          `${slotName}: kontexte=${k.kontexte} > Aufgreifschwelle ${schwelle}, ohne persistierte`
          + " Zusammensetzung und ohne dokumentierte Erklaerung — Diagnosebedarf, kein bewiesener"
          + " fachlicher Fehler (Zusammensetzung nachreichen oder --kontext-erklaerung dokumentieren)."));
      } else {
        warnungen.push(`${slotName}: kontexte=${k.kontexte} ueber Aufgreifschwelle ${schwelle} — erklaert: ${kontextErklaerung}`);
      }
    }
  }

  // -- Fehlerklassen des Laufs ---------------------------------------------------------------
  const fehlerSchritte = Array.isArray(d.fehlerSchritte) ? d.fehlerSchritte : [];
  for (const f of fehlerSchritte) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, `fehler-${(f && f.schritt) || "unbekannt"}`,
      `${slotName}: Fehlerschritt im globalen Lauf${f && f.fatal ? " (fatal)" : ""}`));
  }
  if (Array.isArray(d.fehlerhafteProfile) && d.fehlerhafteProfile.length) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "fehlerhafte-profile",
      `${slotName}: ${d.fehlerhafteProfile.join(", ")}`));
  }

  // -- Quellenabruf --------------------------------------------------------------------------
  if ((Number(d.nichtAbgerufen) || 0) > 0) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "quellenabruf-unvollstaendig",
      `${slotName}: ${d.nichtAbgerufen} Wege nicht abgerufen`));
  }
  const failed = Number(globalerLauf.failedSources) || 0;
  if (failed > 0) {
    const klassifiziert = globalerLauf.errorCodes && typeof globalerLauf.errorCodes === "object"
      && Object.keys(globalerLauf.errorCodes).length > 0;
    if (!klassifiziert) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "quellenfehler-unklassifiziert",
        `${slotName}: ${failed} fehlgeschlagene Quellen ohne Fehlercode`));
    } else {
      warnungen.push(`${slotName}: ${failed} fehlgeschlagene Quellen (klassifiziert: ${Object.keys(globalerLauf.errorCodes).join(", ")})`);
    }
  }
  if (globalerLauf.runState && !ZULAESSIGE_RUN_STATES.includes(String(globalerLauf.runState))) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "abruf-degradiert",
      `${slotName}: runState=${globalerLauf.runState}`));
  }
  // Neue/unbekannte Fehlerklassen (Vertragspunkt 14): jedes beobachtete Codewort muss im
  // bekannten Vokabular liegen. `unknown` ist definitionsgemaess eine unbekannte Klasse.
  for (const code of Object.keys(globalerLauf.errorCodes || {})) {
    if (!bekannteFehlerklassen.includes(code)) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "neue-fehlerklasse", `${slotName}: ${code}`));
    }
  }

  // -- Persistenz ----------------------------------------------------------------------------
  const p = d.persistenz;
  if (!p || p.ergebnis !== "ok") {
    // Ein Lauf ganz ohne Dokumente ("leer") ist kein Persistenzfehler, aber auch kein
    // Kapazitaetsbeleg: ein leerer Datenbestand darf nie als Erfolg zaehlen.
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "persistenz-nicht-belegt",
      `${slotName}: persistenz=${(p && p.ergebnis) || "fehlt"}`));
  } else {
    if ((Number(p.zaehlerVerfehlt) || 0) > 0) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "persistenz-kollision-unaufgeloest",
        `${slotName}: ${p.zaehlerVerfehlt} bedingte Zaehler-Schreibvorgaenge verfehlt (CAS)`));
    }
    if (globalerLauf.newRawDocuments == null) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "persistenz-ergebnis-unbekannt",
        `${slotName}: newRawDocuments=null`));
    }
  }
  if ((Number(globalerLauf.savedItems) || 0) === 0) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "leerer-datenbestand",
      `${slotName}: 0 gespeicherte Rohitems — ein leerer Lauf ist kein Kapazitaetsbeleg`));
  }

  // -- Mandatslaeufe und eingefrorene Mandatsmenge -------------------------------------------
  // K1 (Ursachenanalyse §7.7.6, Befund 1): Produktion bindet Mandatsprojektionen ueber das
  // PERSISTIERTE `globalLaufId` an ihren globalen Lauf. `scheduler.runMandatsProjektion`
  // schreibt `runId: "projektion-<ts>-<rand>"` (eigene Kennung) und `globalLaufId:
  // <laufId des globalen Laufs>`; `server.js` uebergibt KEINE runId. Der fruehere Join
  // `m.runId === laufkennung` suchte eine Konvention, die es in Produktion nie gab —
  // alle sechs Mandatsdatensaetze des 16:00-Laufs galten dadurch als fehlend
  // (Falschbefund `mandatslauf-fehlt`). KEINE unscharfe zeitliche Zuordnung als Ersatz:
  // gebunden wird AUSSCHLIESSLICH ueber die persistierte Kennung.
  const zugehoerige = mandatsLaeufe.filter((m) => m && m.mode === "mandat"
    && typeof m.globalLaufId === "string" && m.globalLaufId === globalerLauf.runId);
  // FAIL CLOSED bei MEHRDEUTIGKEIT: zwei Datensaetze desselben Mandats am selben globalen
  // Lauf sind keine waehlbare Alternative, sondern eine widerspruechliche Beleglage.
  const bindungenJeMandat = new Map();
  for (const m of zugehoerige) {
    const id = String(m.politicianId);
    bindungenJeMandat.set(id, (bindungenJeMandat.get(id) || 0) + 1);
  }
  for (const [mehrdeutigesMandat, anzahl] of bindungenJeMandat) {
    if (anzahl > 1) {
      befunde.push(befund(AUSGANG_BLOCKIERT, "mandatslauf-mehrdeutig",
        `${slotName}: ${anzahl} Mandatsdatensaetze fuer ${mehrdeutigesMandat} mit demselben`
        + " globalLaufId — die Bindung ist nicht eindeutig, es wird keiner ausgewaehlt."));
    }
  }

  // HAERTUNG 2: der Lauf muss GENAU die eingefrorene Menge geplant haben — identitaetsgenau.
  // `quellenVereinigung.mandate` (die blosse ANZAHL) reicht dafuer nicht: ein Austausch
  // (Mandat A raus, Mandat B rein) laesst die Zahl unveraendert.
  const geplanteIds = globalerLauf.quellenVereinigung && globalerLauf.quellenVereinigung.mandateIds;
  if (!Array.isArray(geplanteIds)) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "mandatsidentitaeten-nicht-belegt",
      `${slotName}: der Laufdatensatz traegt keine Mandatskennungen (nur eine Anzahl) —`
      + " ein Austausch bei gleicher Anzahl waere nicht ausschliessbar."));
  } else if (!mengeGleich(geplanteIds, mandatsMenge)) {
    const laufSig = mandatsSignatur(geplanteIds);
    befunde.push(befund(AUSGANG_BLOCKIERT, "fenster-ungueltig-mandatsmenge-veraendert",
      `${slotName}: Lauf plante ${laufSig.signatur} (${laufSig.mandate.join(", ") || "leer"}),`
      + ` eingefroren ist ${frozen.signatur} (${mandatsMenge.join(", ")}).`));
  }

  const spaetesterAbschlussMs = zugehoerige
    .map((m) => Date.parse(m.createdAt || ""))
    .filter(Number.isFinite)
    .reduce((max, v) => Math.max(max, v), 0);
  if (spaetesterAbschlussMs && spaetesterAbschlussMs > slot.geplantMs + AEUSSERES_LIMIT_MS + NACHLAUF_TOLERANZ_MS) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "aeusseres-zeitlimit-ueberzogen",
      `${slotName}: letzter Mandatsdatensatz ${new Date(spaetesterAbschlussMs).toISOString()}`));
  }
  const abgedeckt = new Set(zugehoerige.map((m) => String(m.politicianId)));
  const fehlend = mandatsMenge.filter((id) => !abgedeckt.has(String(id)));
  if (fehlend.length) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "mandatslauf-fehlt",
      `${slotName}: ${fehlend.join(", ")}`));
  }
  const fremde = [...abgedeckt].filter((id) => !mandatsMenge.includes(id));
  if (fremde.length) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "fenster-ungueltig-mandatsmenge-veraendert",
      `${slotName}: unerwartete Mandate im Lauf: ${fremde.join(", ")}`));
  }
  const statusMenge = new Set();
  // VERSIEGELTE Dauer/Grenze: sie kommen aus dem Datenstands-Vermerk (bzw. der dauerhaften
  // Laufzeile), NIE aus `globalerLauf.durationMs` — der wird VOR dem Versiegeln gebildet.
  let versiegelteDauerMs = null;
  let versiegeltesBudgetMs = null;
  for (const m of zugehoerige) {
    const vermerk = m.datenstand;
    if (!vermerk || typeof vermerk !== "object" || !vermerk.status) {
      befunde.push(befund(AUSGANG_BLOCKIERT, "mandatslauf-ohne-datenstandsvermerk",
        `${slotName}: ${m.politicianId}`));
      continue;
    }
    statusMenge.add(String(vermerk.status));
    if (alsZahl(vermerk.dauerMs) !== null) versiegelteDauerMs = alsZahl(vermerk.dauerMs);
    if (alsZahl(vermerk.budgetMs) !== null) versiegeltesBudgetMs = alsZahl(vermerk.budgetMs);
    if (vermerk.laufId && vermerk.laufId !== globalerLauf.runId) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "mandatslauf-fremder-datenstand",
        `${slotName}: ${m.politicianId} projizierte ${vermerk.laufId}`));
    }
    if (vermerk.versiegelt !== true) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "mandatslauf-auf-unversiegeltem-datenstand",
        `${slotName}: ${m.politicianId}`));
    }
    // Vollstaendigkeit der Projektion: ein Mandatslauf, dessen Matching- oder
    // Entscheidungsschritt verschluckt wurde (null), ist UNVOLLSTAENDIG — er existiert
    // als Datensatz, hat aber nicht die ganze Arbeit geleistet.
    if (m.matching == null || m.decisions == null) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "mandatslauf-unvollstaendig",
        `${slotName}: ${m.politicianId} (matching=${m.matching == null ? "fehlt" : "ok"}, decisions=${m.decisions == null ? "fehlt" : "ok"})`));
    }
  }

  // -- Budget der globalen Phase (aus dem VERSIEGELTEN Beleg) + aeusseres Zeitlimit ----------
  if (versiegelteDauerMs == null && prozessLauf && alsZahl(prozessLauf.durationMs) !== null) {
    // Rueckfallebene: die dauerhafte Laufzeile wird NACH dem Versiegeln geschrieben und
    // traegt `datenstand.dauerMs` — dieselbe versiegelte Zahl.
    versiegelteDauerMs = alsZahl(prozessLauf.durationMs);
  }
  if (versiegeltesBudgetMs == null && alsZahl(d.budgetMs) !== null) {
    versiegeltesBudgetMs = alsZahl(d.budgetMs);
  }
  if (versiegelteDauerMs == null || versiegeltesBudgetMs == null) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "versiegelte-laufzeit-nicht-belegt",
      `${slotName}: dauerMs=${versiegelteDauerMs} budgetMs=${versiegeltesBudgetMs} —`
      + " die Budgetgrenze darf nicht am vor dem Versiegeln gebildeten durationMs geprueft werden."));
  } else if (versiegelteDauerMs > versiegeltesBudgetMs + VERSIEGELUNGS_TOLERANZ_MS) {
    // K8: oberhalb der Toleranz ist der Ueberzug STRUKTURELL — bewiesene Verletzung.
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "globalphase-budget-ueberzogen",
      `${slotName}: versiegelt ${versiegelteDauerMs} ms > Budget ${versiegeltesBudgetMs} ms`
      + ` + Versiegelungstoleranz ${VERSIEGELUNGS_TOLERANZ_MS} ms`));
  } else if (versiegelteDauerMs > versiegeltesBudgetMs) {
    // K8 (Befund 4, +313 ms): INNERHALB der Toleranz ist der Ueberhang ein Messartefakt
    // des Abschlussschreibens — benannt, aber kein Vertragsbruch. Die Toleranz faerbt
    // keinen strukturellen Ueberzug gruen: sie ist 1 s, der gescheiterte Lauf lag 267 s hoeher.
    warnungen.push(`${slotName}: versiegelt ${versiegelteDauerMs} ms liegt ${versiegelteDauerMs - versiegeltesBudgetMs} ms`
      + ` ueber dem Budget ${versiegeltesBudgetMs} ms — innerhalb der Versiegelungstoleranz`
      + ` (${VERSIEGELUNGS_TOLERANZ_MS} ms, Messartefakt des Abschlussschreibens), kein Vertragsbruch.`);
  }

  // -- Dauerhafte Laufzeile: Existenz und Widerspruchsfreiheit -------------------------------
  if (prozessLauf) {
    if (prozessLauf.status === "failed") {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "dauerhafter-beleg-fehlgeschlagen",
        `${slotName}: die dauerhafte Laufzeile meldet status=failed`));
    }
    if (alsZahl(prozessLauf.durationMs) !== null && versiegelteDauerMs != null
      && alsZahl(prozessLauf.durationMs) !== versiegelteDauerMs) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "belege-widersprechen-sich",
        `${slotName}: dauerhafte Zeile ${prozessLauf.durationMs} ms vs. Vermerk ${versiegelteDauerMs} ms`));
    }
  } else {
    // NACHTRAGSKORREKTUR (2026-08-04/5): die dauerhafte Zeile traegt den EINZIGEN
    // Commit-Beleg (`commit_ref`) eines Fensterlaufs. Fehlt sie, ist der Deployment-Stand
    // dieses Laufs nicht belegbar — frueher nur eine Warnung, jetzt fail closed.
    befunde.push(befund(AUSGANG_BLOCKIERT, "commit-beleg-fehlt",
      `${slotName}: keine dauerhafte Laufzeile (process_runs/globalphase) — ohne sie fehlt`
      + " der Commit-Beleg, der Deployment-Stand dieses Laufs ist nicht belegt."));
  }

  // -- Versiegelter Status + E3-Regel --------------------------------------------------------
  const statusListe = [...statusMenge];
  const status = statusListe.length === 1 ? statusListe[0] : null;
  if (zugehoerige.length && statusListe.length > 1) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "datenstand-status-uneinheitlich",
      `${slotName}: ${statusListe.join("/")}`));
  }
  if (status === "fehlgeschlagen" || status === "offen") {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, `datenstand-${status}`, slotName));
  } else if (status === "teilweise" || hatVerstehensRueckstand(d)) {
    // DIE E3-KERNREGEL. Ein ehrliches `teilweise` besteht NUR, wenn (a) keine einzige
    // Fehlerursache vorliegt (oben bereits als Befunde erfasst) und (b) der gesamte
    // Verstehensrueckstand dieses Laufs DAUERHAFT ist. Dauerhaft heisst beweisbar:
    //   lazyKomplett  — die Vormerkphase hat JEDEN Stapel erreicht und JEDEN Cluster
    //                   bewertet (alle interessierten Cluster sind pending-KOs), ODER
    //   eagerKomplett — der Verstehensschritt hat JEDEN Stapel erreicht und JEDEN
    //                   zurueckgestellten Cluster vorgemerkt (nichtVorgemerkt = 0).
    // Beides zusammen fehlend => es existieren zurueckgestellte Cluster OHNE pending-
    // Wissensobjekt. Die sind spaeter nicht garantiert wiederauffindbar => fail closed.
    const lazy = d.lazy;
    const eager = d.eager;
    const vormerkung = d.vormerkung && typeof d.vormerkung === "object" ? d.vormerkung : null;
    if (!lazy || !eager
      || lazy.cluster == null || lazy.verarbeitet == null
      || lazy.uebersprungeneStapel == null || lazy.uebersprungeneDokumente == null
      || eager.nichtVorgemerkt == null || eager.uebersprungeneStapel == null
      // Invariante des Produktionscodes: ein uebersprungener Lazy-Stapel hat IMMER
      // Dokumente (leere Stapel werden vor der Zaehlung uebersprungen). Ein Widerspruch
      // ist eine kaputte oder manipulierte Zaehlung — nicht bewertbar.
      || (Number(lazy.uebersprungeneStapel) > 0 && Number(lazy.uebersprungeneDokumente) === 0)) {
      befunde.push(befund(AUSGANG_BLOCKIERT, "rueckstand-nicht-vollstaendig-gezaehlt",
        `${slotName}: lazy/eager-Zaehlung unvollstaendig oder widerspruechlich`));
    } else if (vormerkung) {
      // K4 (E3 eingeloest, Ursachenanalyse §7.7.6 Befund 5): der Lauf traegt die GESAMT-
      // Vormerkbilanz seiner Abschlussphase. Sie deckt den VOLLSTAENDIGEN Rueckstand ab —
      // Eager-zurueckgestellte Cluster (in der Verstehensphase vorgemerkt), den gesamten
      // Lazy-Rest UND die Dokumente uebersprungener Stapel (in der Abschlussphase geclustert
      // und vorgemerkt). Die Bilanz muss AUFGEHEN und widerspruchsfrei zur Lazy-/Stapel-
      // Zaehlung sein; ein Speicherfehler ist NIE eine erfolgreiche Vormerkung.
      const kandidaten = alsZahl(vormerkung.kandidaten);
      const vorgemerkt = alsZahl(vormerkung.vorgemerkt);
      const bereitsVorhanden = alsZahl(vormerkung.bereitsVorhanden);
      const fehlgeschlagen = alsZahl(vormerkung.fehlgeschlagen);
      const nichtVorgemerkt = alsZahl(vormerkung.nichtVorgemerkt);
      const lazyRestCluster = alsZahl(vormerkung.lazyRestCluster);
      const lazyRestKandidaten = alsZahl(vormerkung.lazyRestKandidaten);
      const uebersprungeneDokumenteRoh = alsZahl(vormerkung.uebersprungeneDokumenteRoh);
      const clusterAusUebersprungenen = alsZahl(vormerkung.clusterAusUebersprungenen);
      const werte = [kandidaten, vorgemerkt, bereitsVorhanden, fehlgeschlagen, nichtVorgemerkt,
        lazyRestCluster, lazyRestKandidaten, uebersprungeneDokumenteRoh, clusterAusUebersprungenen];
      const uebersprungenRohSoll = (Number(lazy.uebersprungeneDokumente) || 0) + (Number(eager.uebersprungeneDokumente) || 0);
      if (werte.some((v) => v === null || v < 0)) {
        befunde.push(befund(AUSGANG_BLOCKIERT, "vormerkbilanz-unvollstaendig",
          `${slotName}: ${JSON.stringify(vormerkung).slice(0, 160)}`));
      } else if (kandidaten !== vorgemerkt + bereitsVorhanden + fehlgeschlagen + nichtVorgemerkt) {
        befunde.push(befund(AUSGANG_BLOCKIERT, "vormerkbilanz-inkonsistent",
          `${slotName}: kandidaten=${kandidaten} != vorgemerkt=${vorgemerkt}`
          + ` + bereitsVorhanden=${bereitsVorhanden} + fehlgeschlagen=${fehlgeschlagen}`
          + ` + nichtVorgemerkt=${nichtVorgemerkt} — die Laufbilanz geht nicht auf.`));
      } else if (lazyRestCluster !== Math.max(0, Number(lazy.cluster) - Number(lazy.verarbeitet))) {
        befunde.push(befund(AUSGANG_BLOCKIERT, "vormerkbilanz-widerspricht-lazyzaehlung",
          `${slotName}: Vormerkbilanz nennt lazyRestCluster=${lazyRestCluster},`
          + ` die Lazy-Zaehlung ergibt ${Number(lazy.cluster) - Number(lazy.verarbeitet)}.`));
      } else if ((lazyRestCluster > 0 && lazyRestKandidaten < 1) || kandidaten < lazyRestKandidaten) {
        // Der Lazy-Rest muss in der Kandidatenmenge ABGEDECKT sein. Gefordert wird die
        // GEMESSENE Abdeckung (`lazyRestKandidaten` = Rest-Vorgaenge, die es in die Menge
        // geschafft haben) — nicht die rohe Clusterzahl: zwei Rest-Cluster desselben
        // Vorgangs sind nach der Deduplizierung EIN Kandidat, ein ehrlicher Lauf darf
        // daran nicht scheitern.
        befunde.push(befund(AUSGANG_BLOCKIERT, "vormerkbilanz-inkonsistent",
          `${slotName}: lazyRestCluster=${lazyRestCluster}, davon in der Kandidatenmenge`
          + ` abgedeckt=${lazyRestKandidaten}, kandidaten=${kandidaten} —`
          + " die Abschlussphase deckt den Lazy-Rest nicht ab."));
      } else if (uebersprungeneDokumenteRoh !== uebersprungenRohSoll) {
        // GLEICHES mit GLEICHEM: die ROHE Item-Zaehlung der Abschlussphase muss exakt der
        // Summe der Stapel-Zaehlungen entsprechen. (Die deduplizierte Zeilenzahl darf
        // kleiner sein — Mehrfachherkunft desselben Dokuments ist kein Vertragsbruch.)
        befunde.push(befund(AUSGANG_BLOCKIERT, "vormerkbilanz-widerspricht-stapelzaehlung",
          `${slotName}: Abschlussphase erhielt ${uebersprungeneDokumenteRoh} uebersprungene Dokumente (roh),`
          + ` gezaehlt sind lazy=${lazy.uebersprungeneDokumente} + eager=${eager.uebersprungeneDokumente}`
          + ` = ${uebersprungenRohSoll}.`));
      } else if (uebersprungeneDokumenteRoh > 0 && clusterAusUebersprungenen < 1) {
        // Uebersprungene Dokumente, aus denen KEIN einziger Kandidat entstand: die
        // Abschlussphase hat sie nie geclustert (z. B. Deadline vorab verbraucht) —
        // dieser Rueckstand ist nachweislich NICHT dauerhaft geworden.
        befunde.push(befund(AUSGANG_BLOCKIERT, "vormerkbilanz-widerspricht-stapelzaehlung",
          `${slotName}: ${uebersprungeneDokumenteRoh} uebersprungene Dokumente, aber 0 Cluster`
          + " aus der Abschlussphase — der Stapelrueckstand wurde nie angefasst."));
      } else if ((Number(eager.nichtVorgemerkt) || 0) > 0 || (Number(eager.vormerkFehlgeschlagen) || 0) > 0
        || nichtVorgemerkt > 0 || fehlgeschlagen > 0) {
        // Ein REGULAER beendeter Lauf darf bei verbleibendem Rueckstand nichts unvorgemerkt
        // lassen; ein Speicherfehler zaehlt ausdruecklich NICHT als Vormerkung.
        befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "rueckstand-nicht-dauerhaft",
          `${slotName}: Rueckstand nicht vollstaendig dauerhaft (eager nichtVorgemerkt=${eager.nichtVorgemerkt},`
          + ` eager speicherfehler=${eager.vormerkFehlgeschlagen || 0},`
          + ` abschluss nichtVorgemerkt=${nichtVorgemerkt}, abschluss speicherfehler=${fehlgeschlagen})`));
      } else {
        warnungen.push(`${slotName}: datenstand=${status || "abgeschlossen"} — regulaer zurueckgestellte Verstehensarbeit,`
          + ` vollstaendig gezaehlt und dauerhaft vorgemerkt (kandidaten=${kandidaten},`
          + ` neu=${vorgemerkt}, bereitsVorhanden=${bereitsVorhanden}, lazyRest=${lazyRestCluster}).`
          + " Der fachliche Verstehensrueckstand bleibt offen (OP-14) und gilt NICHT als geloest.");
      }
    } else {
      // Alt-Laeufe OHNE Vormerkbilanz: die bisherige Doppelregel bleibt fail closed. Ein
      // Lazy-Rest ohne Vormerkpfad kann hier weiterhin NICHT bestehen — genau das war der
      // echte systemische Befund (`rueckstand-nicht-dauerhaft`).
      const lazyKomplett = Number(lazy.uebersprungeneStapel) === 0
        && Number(lazy.verarbeitet) === Number(lazy.cluster);
      const eagerKomplett = Number(eager.uebersprungeneStapel) === 0
        && Number(eager.andereSkips || 0) === 0
        && Number(eager.vormerkFehlgeschlagen || 0) === 0
        && Number(eager.nichtVorgemerkt) === 0;
      if (!lazyKomplett && !eagerKomplett) {
        befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "rueckstand-nicht-dauerhaft",
          `${slotName}: zurueckgestellte Cluster ohne pending-Vormerkung`
          + ` (lazy ${lazy.verarbeitet}/${lazy.cluster}, uebersprungeneStapel=${lazy.uebersprungeneStapel};`
          + ` eager nichtVorgemerkt=${eager.nichtVorgemerkt}, uebersprungeneStapel=${eager.uebersprungeneStapel})`));
      } else {
        warnungen.push(`${slotName}: datenstand=${status || "abgeschlossen"} — regulaer zurueckgestellte Verstehensarbeit,`
          + ` vollstaendig gezaehlt und als pending-Wissensobjekte dauerhaft`
          + ` (eager zurueckgestellt=${eager.zurueckgestellt}, vorgemerkt=${eager.vorgemerkt}).`
          + " Der fachliche Verstehensrueckstand bleibt offen (OP-14) und gilt NICHT als geloest.");
      }
    }
  } else if (status !== "abgeschlossen" && zugehoerige.length) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "datenstand-status-nicht-belegt", slotName));
  }

  const einstufung = befunde.some((b) => b.schwere === AUSGANG_NICHT_BESTANDEN)
    ? "vertragsverletzung"
    : (befunde.some((b) => b.schwere === AUSGANG_BLOCKIERT) ? "belegluecke" : "vollstaendig");
  return { slot: slotName, einstufung, status, versiegelteDauerMs, befunde, warnungen };
}

// ---------------------------------------------------------------------------------------------
// Gesamtbewertung des Beobachtungsfensters.
// ---------------------------------------------------------------------------------------------

function bewerteNachweisfenster(eingaben = {}) {
  const {
    jetztMs = 0,
    fenster = null,
    aktivierungAtMs = null,
    startbaseline = null,          // { aktivierungAtMs, mandate[], signatur } — am Fensterstart erhoben
    crons = null,
    laeufe = null,
    prozessLaeufe = null,          // dauerhafte `process_runs`-Zeilen (Prozess `globalphase`)
    laufRetention = null,          // wie viele Laufdatensaetze die Ablage vorhaelt
    aktiveMandate = null,          // AKTUELLER Bestand (Endzustand des Fensters)
    erwarteteMandatszahl = null,
    kosten = null,
    kontextErklaerungen = {},
    bekannteFehlerklassen = BEKANNTE_FEHLERKLASSEN,
    fairnessLaeufe = null,
    commitGegenprobe = null,        // optional: erwarteter Commit als Gegenprobe zur Baseline
    prozessLaeufeLesefehler = null, // Lesefehler der KANONISCHEN Belegquelle (process_runs)
    watchdogCrons = null,           // K3: Tagesplaene des GitHub-Actions-Watchdogs (Workflow-Datei)
    mandatsWahrheit = null          // K2: { kanonisch, blob, laufzeitPlanung, laufzeitLaufId }
  } = eingaben;

  const befunde = [];
  const warnungen = [];
  const ausgeschlossen = [];

  const ergebnis = (ausgang, laufErgebnisse = [], extra = {}) => ({
    ausgang,
    exitCode: EXIT_CODES[ausgang],
    befunde,
    warnungen,
    ausgeschlossen,
    laeufe: laufErgebnisse,
    ...extra
  });

  // ---- Stufe 1: Fensterpruefung (geht allem voraus) ----------------------------------------
  if (aktivierungAtMs == null || !Number.isFinite(Number(aktivierungAtMs))) {
    befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "aktivierungszeitpunkt-unbekannt",
      "Der globale Abruf ist nicht (nachweislich) aktiviert — das neue Fenster beginnt erst nach"
      + " READY-Deployment und Betreiber-Aktivierung."));
    return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR);
  }
  // Eine Aktivierung in der ZUKUNFT ist ein Konfigurationsfehler und wird deshalb VOR den
  // Fensterpruefungen abgefangen — sonst meldete das Werkzeug ein harmloses
  // „noch nicht vergangen", obwohl der uebergebene Zeitpunkt gar nicht stimmen kann.
  if (Number(aktivierungAtMs) > jetztMs) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "aktivierung-in-zukunft",
      `Der uebergebene Aktivierungszeitpunkt ${new Date(Number(aktivierungAtMs)).toISOString()}`
      + ` liegt in der Zukunft (jetzt ${new Date(jetztMs).toISOString()}).`));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  if (!fenster || !Number.isFinite(Number(fenster.vonMs)) || !Number.isFinite(Number(fenster.bisMs))) {
    befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "kein-beobachtungsfenster",
      "Es wurde kein explizites Beobachtungsfenster (Start und Ende) uebergeben."));
    return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR);
  }
  if (fenster.vonMs < FRUEHESTER_FENSTERSTART_MS) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "fenster-vor-neustart",
      `Fensterstart ${new Date(fenster.vonMs).toISOString()} liegt vor dem verbindlichen Neustart`
      + " (2026-08-04). Der gescheiterte Lauf vom 2026-08-03 darf nie einfliessen."));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  if (fenster.vonMs < aktivierungAtMs) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "fenster-vor-aktivierung",
      `Fensterstart liegt vor der Aktivierung (${new Date(aktivierungAtMs).toISOString()}).`));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  if (fenster.bisMs - fenster.vonMs < MIN_FENSTER_MS) {
    befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "fenster-unter-24h",
      `Fensterlaenge ${Math.round((fenster.bisMs - fenster.vonMs) / 3600000)} h < 24 h — ein solches Fenster wird NIE gruen.`));
    return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR);
  }
  if (fenster.bisMs > jetztMs) {
    befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "fenster-noch-nicht-vergangen",
      `Fensterende ${new Date(fenster.bisMs).toISOString()} liegt in der Zukunft — verlangt sind 24 VOLLSTAENDIG vergangene Stunden.`));
    return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR);
  }

  // ---- Stufe 2: Eingabelesbarkeit (Belegluecken) -------------------------------------------
  if (!Array.isArray(laeufe)) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "laufdaten-nicht-lesbar",
      "Die Laufdatensaetze konnten nicht gelesen werden — ein leerer oder fehlerhaft gelesener"
      + " Datenbestand wird niemals als Erfolg behandelt."));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  const slots = erwarteteLaeufe({ vonMs: fenster.vonMs, bisMs: fenster.bisMs, crons });
  if (!slots || !slots.length) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "cron-kadenz-nicht-ermittelbar",
      "Die regulaere Kadenz der schweren Crons ist aus der wirksamen Konfiguration nicht ableitbar."));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  // Ein Lesefehler der KANONISCHEN dauerhaften Belegquelle (relationale `process_runs`) ist
  // eine Beleg-Luecke: der Commitnachweis stuetzte sich dann allein auf den Blob-Spiegel,
  // ohne dass die Vollstaendigkeit der Fensterlaeufe belegt waere. KEIN frueher Abbruch —
  // eine gleichzeitig BEWIESENE Verletzung behaelt ihren Vorrang (nicht_bestanden).
  if (prozessLaeufeLesefehler != null && prozessLaeufeLesefehler !== "") {
    befunde.push(befund(AUSGANG_BLOCKIERT, "prozesszeilen-quelle-nicht-lesbar",
      `Die relationale Belegquelle process_runs war nicht lesbar (${String(prozessLaeufeLesefehler).slice(0, 160)})`
      + " — der Commitnachweis waere sonst allein auf den Blob-Spiegel gestuetzt."));
  }
  // K2: EINE Mandatswahrheit. Uebergibt der Aufrufer die beobachtbaren Sichten, wird ihre
  // Widerspruchsfreiheit geprueft — ein Widerspruch (Blob vs. relational, Laufzeitplanung
  // vs. relational) blockiert. Der Blob kann die Mandatsmenge damit nie mehr VERKLEINERN:
  // die kanonische Menge bleibt massgeblich, sein Widerspruch wird nur benannt.
  if (mandatsWahrheit && typeof mandatsWahrheit === "object") {
    befunde.push(...pruefeMandatsWahrheit(mandatsWahrheit).befunde);
  }

  // ---- Stufe 2b: die eingefrorene Mandatsmenge (HAERTUNG 2) --------------------------------
  // Die Menge wird AM FENSTERSTART erhoben und fuer das Fenster eingefroren. Ohne diese
  // Startbaseline ist der Zustand am Aktivierungszeitpunkt nicht belegt — dann wird nicht
  // ersatzweise der AKTUELLE Bestand genommen (der waere Monate spaeter beliebig anders),
  // sondern ehrlich blockiert.
  const baselinePruefung = pruefeStartbaseline({
    roh: startbaseline, aktivierungAtMs, jetztMs, commitGegenprobe
  });
  if (baselinePruefung.befunde.length) {
    befunde.push(...baselinePruefung.befunde);
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  const frozen = baselinePruefung.frozen;
  const erwarteterCommit = baselinePruefung.erwarteterCommit;
  if (erwarteteMandatszahl != null && frozen.anzahl !== Number(erwarteteMandatszahl)) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "mandatszahl-weicht-von-erwartung-ab",
      `eingefroren=${frozen.anzahl}, erwartet=${erwarteteMandatszahl} — Betreiberentscheidung noetig.`));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  // ENDZUSTAND: der aktuelle Bestand muss die eingefrorene Menge noch tragen. Ist er nicht
  // lesbar, ist die Unveraendertheit nicht belegt — beides blockiert, nichts wird geraten.
  if (!Array.isArray(aktiveMandate) || !aktiveMandate.length) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "aktive-mandatsmenge-nicht-ermittelbar",
      "Die aktive Mandatsmenge am Fensterende ist nicht eindeutig ermittelbar."));
    return ergebnis(AUSGANG_BLOCKIERT, [], { mandatsmenge: frozen });
  }
  const endzustand = mandatsSignatur(aktiveMandate);
  if (endzustand.signatur !== frozen.signatur) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "fenster-ungueltig-mandatsmenge-veraendert",
      `Endzustand ${endzustand.signatur} (${endzustand.mandate.join(", ")}) weicht von der`
      + ` eingefrorenen Menge ${frozen.signatur} (${frozen.mandate.join(", ")}) ab.`));
  }

  // ---- Stufe 2c: Aufbewahrungsvertrag (HAERTUNG 3, K3-Fassung) -----------------------------
  // Reproduzierbar, HART blockierend und ohne eingefrorene Annahmen: der Bedarf rechnet mit
  // den Regel-Slots des Fensters, den moeglichen Watchdog-Laeufen (GitHub-Actions-Workflow,
  // im gescheiterten Fenster ein realer vierter schwerer Lauf) und der REALEN Mandatszahl
  // der Startbaseline, plus Puffer von einem weiteren vollstaendigen Lauf.
  const watchdogSlots = erwarteteWatchdogLaeufe({ vonMs: fenster.vonMs, bisMs: fenster.bisMs, watchdogCrons });
  if (watchdogSlots === null) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "watchdog-kadenz-nicht-ermittelbar",
      "Die Kadenz des Briefing-Watchdogs (briefing-watchdog.yml) ist nicht ermittelbar —"
      + " ohne sie ist der Aufbewahrungsbedarf des Fensters nicht belegbar (der Watchdog"
      + " war 2026-08-05 ein realer vierter schwerer Lauf)."));
  }
  const bedarf = aufbewahrungsBedarf({
    regelSlots: slots.length,
    watchdogSlots: watchdogSlots === null ? 0 : watchdogSlots.length,
    mandatszahl: frozen.anzahl
  });
  const benoetigteDatensaetze = bedarf.mindest;
  const retention = alsZahl(laufRetention);
  if (retention === null) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "aufbewahrung-nicht-belegt",
      "Die wirksame Aufbewahrung (HELMUT_CRAWL_RUN_RETENTION) ist nicht belegt —"
      + " der Aufbewahrungsvertrag ist ohne sie nicht pruefbar (fail closed)."));
  } else if (benoetigteDatensaetze > retention) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "aufbewahrung-reicht-nicht", aufbewahrungsMeldung(bedarf, retention)));
  } else if (retention < benoetigteDatensaetze + bedarf.datensaetzeJeLauf) {
    warnungen.push(`Aufbewahrung knapp: Mindestbedarf ${benoetigteDatensaetze} von ${retention} Datensaetzen`
      + " — schon EIN weiterer schwerer Lauf ueber den Puffer hinaus verdraengt fruehe Belege. Zeitnah auswerten.");
  }
  // Tatsaechlicher Aufbewahrungshorizont: sitzt die Ablage an ihrer Grenze, ist alles VOR dem
  // aeltesten sichtbaren Datensatz weder belegt noch widerlegt.
  const laufZeiten = laeufe
    .map((r) => Date.parse((r && r.createdAt) || ""))
    .filter(Number.isFinite);
  const anGrenze = retention != null && laeufe.length >= retention;
  const speicherHorizontMs = anGrenze && laufZeiten.length ? Math.min(...laufZeiten) : null;

  // ---- Laufzuordnung -----------------------------------------------------------------------
  const imFenster = (r) => {
    const start = laufStartAusRunId(r && r.runId);
    const ms = start ? start.startMs : Date.parse((r && r.createdAt) || "");
    return Number.isFinite(ms) && ms >= fenster.vonMs && ms < fenster.bisMs;
  };
  const globale = laeufe.filter((r) => r && r.mode === "global");
  const mandats = laeufe.filter((r) => r && r.mode === "mandat");
  const dauerhafte = (Array.isArray(prozessLaeufe) ? prozessLaeufe : [])
    .filter((p) => p && p.process === GLOBALPHASE_PROZESS);

  // K1, fail closed: eine Mandatszeile im Fenster OHNE persistiertes `globalLaufId` kann an
  // keinen globalen Lauf gebunden werden — sie darf weder still als Beleg zaehlen noch still
  // fehlen. Eine unscharfe zeitliche Zuordnung als Ersatz ist ausdruecklich verboten.
  for (const m of mandats) {
    if (!imFenster(m)) continue;
    if (typeof m.globalLaufId !== "string" || !m.globalLaufId.trim()) {
      befunde.push(befund(AUSGANG_BLOCKIERT, "mandatslauf-ohne-bindung",
        `${m.runId || "(ohne-kennung)"} (${m.politicianId || "?"}): mode=mandat im Fenster ohne`
        + " persistiertes globalLaufId — keinem globalen Lauf zuordenbar (fail closed)."));
    }
  }

  // Alte, manuelle, unvollstaendige oder ausserhalb liegende Laeufe: AUSSCHLIESSEN und mit
  // Grund zaehlen — nie als Beleg verwenden.
  for (const r of globale) {
    if (!imFenster(r)) {
      ausgeschlossen.push({ runId: r.runId || "(ohne-kennung)", grund: "ausserhalb-des-fensters" });
      continue;
    }
    const start = laufStartAusRunId(r.runId);
    const passtZuSlot = start && slots.some((s) => s.cronName === start.cronName
      && Math.abs(start.startMs - s.geplantMs) <= SLOT_TOLERANZ_MS);
    if (!passtZuSlot) {
      ausgeschlossen.push({ runId: r.runId || "(ohne-kennung)", grund: "kein-regulaerer-cron-termin (manuell/ausserplanmaessig)" });
      warnungen.push(`Ausserplanmaessiger globaler Lauf im Fenster: ${r.runId || "(ohne-kennung)"} — nicht als Beleg verwendet.`);
    }
  }

  // ---- Stufe 3: jeder erwartete Lauf gegen den Kapazitaetsvertrag --------------------------
  const laufErgebnisse = [];
  for (const slot of slots) {
    const passt = (kennung) => {
      const start = laufStartAusRunId(kennung);
      return start && start.cronName === slot.cronName
        && Math.abs(start.startMs - slot.geplantMs) <= SLOT_TOLERANZ_MS;
    };
    const globalerLauf = globale.find((r) => {
      const start = laufStartAusRunId(r.runId);
      return start && start.global && passt(r.runId);
    }) || null;
    // EXAKTE runId-BINDUNG (Review zu PR #223): scheduler.js schreibt Blob-Lauf und
    // globalphase-Zeile mit DERSELBEN laufId. Ist der globale Lauf vorhanden, darf deshalb
    // AUSSCHLIESSLICH die Zeile mit exakt identischer runId seinen Status, seine Dauer und
    // seinen Commit belegen — eine ANDERE Zeile desselben Termins (blosse Slot-Naehe) darf
    // den fehlenden Beleg niemals ersetzen. Nur wenn der Blob-Lauf fehlt (Retention), ist
    // seine Kennung unbekannt; dann bleibt die Slot-Zuordnung fuer die ehrliche
    // Verdraengt-Klassifikation zulaessig.
    const prozessLauf = globalerLauf
      ? dauerhafte.find((p) => p && p.runId === globalerLauf.runId) || null
      : dauerhafte.find((p) => passt(p.runId)) || null;
    const laufErgebnis = bewerteLauf({
      slot,
      globalerLauf,
      prozessLauf,
      belegVerdraengt: speicherHorizontMs != null && slot.geplantMs < speicherHorizontMs,
      mandatsLaeufe: mandats,
      frozen,
      kontextErklaerung: (globalerLauf && kontextErklaerungen && (kontextErklaerungen[globalerLauf.runId] || kontextErklaerungen["*"])) || null,
      bekannteFehlerklassen,
      jetztMs
    });
    laufErgebnisse.push(laufErgebnis);
    befunde.push(...laufErgebnis.befunde);
    warnungen.push(...laufErgebnis.warnungen);
  }

  // ---- Stufe 3b: Commit-Beleg des Nachweisfensters (Nachtragskorrektur 2026-08-04/5) ------
  // JEDER zum Nachweisfenster gehoerende dauerhafte `globalphase`-Lauf muss einen gueltigen
  // `commit_ref` tragen, der EXAKT zum in der Startbaseline gespeicherten erwarteten
  // Merge-Commit gehoert. Zum Fenster gehoert eine Zeile, wenn ihr Laufstart im Fenster
  // liegt ODER sie einem erwarteten Termin zugeordnet ist (Slot-Toleranz). Laeufe VOR dem
  // Fenster (Alt-Bestand des vorherigen Deployments) werden weder geprueft noch als
  // Bestaetigung verwendet — sie duerfen die Baseline nicht blockieren.
  for (const p of dauerhafte) {
    const startZeile = laufStartAusRunId(p.runId);
    const startMs = startZeile ? startZeile.startMs : Date.parse((p && p.createdAt) || "");
    const zumFenster = (Number.isFinite(startMs) && startMs >= fenster.vonMs && startMs < fenster.bisMs)
      || (startZeile && slots.some((s) => s.cronName === startZeile.cronName
        && Math.abs(startZeile.startMs - s.geplantMs) <= SLOT_TOLERANZ_MS));
    if (!zumFenster) {
      // FAIL CLOSED (Review-Nachprobe): eine zeitlich NICHT platzierbare Zeile (weder
      // Laufkennung noch createdAt lesbar) kann weder dem Fenster zugeordnet noch als
      // Alt-Bestand ausgeschlossen werden. Sie darf die Commitpruefung nicht still
      // umgehen — frueher nur eine Warnung, das war ein Fail-open fuer Zeilen mit
      // fremdem oder fehlendem commit_ref.
      if (!Number.isFinite(startMs)) {
        befunde.push(befund(AUSGANG_BLOCKIERT, "prozesszeile-nicht-zuordenbar",
          `${p.runId || "(ohne-kennung)"}: dauerhafte globalphase-Zeile ohne lesbaren Zeitpunkt`
          + " (weder Laufkennung noch createdAt) — Fensterzugehoerigkeit nicht bestimmbar,"
          + " der Commitnachweis ist damit nicht vollstaendig belegbar."));
      }
      continue;
    }
    const commitPruefung = pruefeFensterlaufCommit(erwarteterCommit, p.commit);
    if (commitPruefung.ergebnis === "bestaetigt") continue;
    if (commitPruefung.ergebnis === "abweichend") {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "fremder-deployment-commit",
        `${p.runId}: commit_ref ${commitPruefung.beobachtet} gehoert nicht zum erwarteten`
        + ` Deployment-Commit ${erwarteterCommit} — im Fenster lief ein anderer Stand.`));
    } else if (commitPruefung.ergebnis === "unvollstaendig") {
      befunde.push(befund(AUSGANG_BLOCKIERT, "commit-beleg-unvollstaendig",
        `${p.runId}: commit_ref ${commitPruefung.beobachtet} ist nur ein Praefix — die exakte`
        + ` Zugehoerigkeit zum erwarteten Commit ${erwarteterCommit} ist nicht belegt.`));
    } else {
      befunde.push(befund(AUSGANG_BLOCKIERT, "commit-beleg-fehlt",
        `${p.runId}: die dauerhafte Laufzeile traegt keinen gueltigen commit_ref —`
        + " der Deployment-Stand dieses Fensterlaufs ist nicht belegt."));
    }
  }

  // Fairness-Laufdatensaetze (soweit vorhanden — je Cron nur der letzte): ein als
  // `abgebrochen` vermerkter Lauf im Fenster ist ein Vertragsbruch, eine Sperrverweigerung
  // zaehlt nie als Erfolg (der fehlende Mandatsdatensatz faellt oben bereits auf).
  for (const [cronName, lauf] of Object.entries(fairnessLaeufe || {})) {
    if (!lauf || !lauf.laufId) continue;
    const start = laufStartAusRunId(lauf.laufId);
    if (!start || start.startMs < fenster.vonMs || start.startMs >= fenster.bisMs) continue;
    if (lauf.status === "abgebrochen") {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "lauf-abgebrochen",
        `${cronName}: ${lauf.laufId} traegt einen Abbruch-/Timeout-Vermerk.`));
    }
  }

  // ---- Kosten (HAERTUNG 1) -----------------------------------------------------------------
  befunde.push(...pruefeKosten(kosten));

  // ---- Vorrang -----------------------------------------------------------------------------
  const hat = (schwere) => befunde.some((b) => b.schwere === schwere);
  const zusatz = { mandatsmenge: frozen, benoetigteDatensaetze, erwarteterCommit };
  if (hat(AUSGANG_NICHT_BESTANDEN)) return ergebnis(AUSGANG_NICHT_BESTANDEN, laufErgebnisse, zusatz);
  if (hat(AUSGANG_BLOCKIERT)) return ergebnis(AUSGANG_BLOCKIERT, laufErgebnisse, zusatz);
  if (hat(AUSGANG_NOCH_NICHT_AUSWERTBAR)) return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR, laufErgebnisse, zusatz);
  return ergebnis(AUSGANG_BESTANDEN, laufErgebnisse, zusatz);
}

module.exports = {
  AUSGANG_BESTANDEN,
  AUSGANG_NICHT_BESTANDEN,
  AUSGANG_BLOCKIERT,
  AUSGANG_NOCH_NICHT_AUSWERTBAR,
  EXIT_CODES,
  MIN_FENSTER_MS,
  FRUEHESTER_FENSTERSTART_MS,
  SCHWERE_CRONS,
  AEUSSERES_LIMIT_MS,
  SLOT_TOLERANZ_MS,
  VERSIEGELUNGS_TOLERANZ_MS,
  BASELINE_TOLERANZ_MS,
  GLOBALPHASE_PROZESS,
  LLM_USAGE_RETENTION,
  COMMIT_MIN_LAENGE,
  COMMIT_MAX_LAENGE,
  COMMIT_VOLL_LAENGE,
  normalisiereCommit,
  normalisiereVollenCommit,
  istEchtesPraefix,
  pruefeFensterlaufCommit,
  kostenAusNutzung,
  pruefeStartbaseline,
  BEKANNTE_FEHLERKLASSEN,
  ZULAESSIGE_RUN_STATES,
  kontextAufgreifschwelle,
  normalisiereMandate,
  mandatsSignatur,
  alsZahl,
  istBrauchbareKostenzahl,
  pruefeKosten,
  parseTagesplan,
  schwereKadenz,
  erwarteteLaeufe,
  erwarteteWatchdogLaeufe,
  aufbewahrungsBedarf,
  aufbewahrungsMeldung,
  pruefeMandatsWahrheit,
  laufStartAusRunId,
  istRegulaererLauf,
  bewerteLauf,
  bewerteNachweisfenster
};
