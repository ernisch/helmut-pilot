"use strict";

// Helmut — WIE VIELE ABFLUSSPLAETZE HAT DIE WARTESCHLANGE WIRKLICH?
// (Korrekturrunde Skalierung 25/50/100, 2026-08-25/4)
// =============================================================================================
// BEHOBENER DOKUMENTATIONSFEHLER. In `betrieb/skalierung-25-50-100.md` stand als Risiko R2:
// „19,5 noetig bei 100, ~11 schwere Slots vorhanden". Die 11 war die Zahl der EINTRAEGE in
// `vercel.json` — nicht die Zahl der Laeufe, die die Warteschlange leeren. Wer aus 11
// Abflussplaetzen plant, plant mit dem Vierfachen dessen, was es gibt.
//
// WAS WIRKLICH GILT (aus dem Code hergeleitet, nicht behauptet):
//   * `vercel.json` enthaelt 11 Cron-EINTRAEGE.
//   * Die Warteschlange wird ausschliesslich ueber `runCronUeberWarteschlange` geleert.
//     Dorthin fuehrt genau ein Weg: `cronSchwererPfad(...)` bei aktivem
//     `HELMUT_SCALABLE_PIPELINE`.
//   * `cronSchwererPfad` wird von genau ZWEI Routen aufgerufen: `/api/cron/crawl` und
//     `/api/cron/pipeline`.
//   * Diese beiden Routen stehen mit DREI Zeiteintraegen im Plan: crawl 04:00 und 20:00,
//     pipeline 16:00 UTC. ⇒ DREI regulaere Abflusslaeufe pro Tag.
//   * Die uebrigen acht Eintraege leeren die allgemeine Warteschlange NICHT.
//   * Die drei Narrativslots (`lage-briefing`, zwei `lage-briefing-nachlauf`) wuerden
//     ausschliesslich `tenant_narrative` abarbeiten — und nur, wenn BEIDE Flags gesetzt
//     sind (`HELMUT_SCALABLE_PIPELINE` UND `HELMUT_NARRATIV_QUEUE`). Beides ist heute
//     nicht der Fall; die Slots sind inert.
//   * Der GitHub-Actions-Watchdog ruft `/api/cron/pipeline` — aber als BEDINGTEN
//     Ersatzlauf: findet die Vorpruefung einen regulaeren Erfolg, laeuft er NICHT, und bei
//     einem Lesefehler laeuft er ausdruecklich AUCH NICHT (fail closed). Er ist damit kein
//     verlaesslich verfuegbarer vierter Kapazitaetsplatz.
//
// Der Test liest Konfiguration und Quelltext — kein Netz, keine Datenbank, kein Lauf.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const watchdogSrc = fs.readFileSync(path.join(ROOT, "scripts/watchdog-pipeline-check.js"), "utf8");
const crons = Array.isArray(vercel.crons) ? vercel.crons : [];

console.log("Helmut — Abflussplaetze der Warteschlange (Kapazitaetsgrundlage 25/50/100)");

// ── 1 · Die Konfiguration ────────────────────────────────────────────────────────────────
abschnitt("1 · Cron-Eintraege in vercel.json");
check("1.1 Es sind genau 11 Cron-Eintraege konfiguriert", crons.length === 11, String(crons.length));
const pfade = crons.map((c) => c.path);
console.log(`  Pfade: ${[...new Set(pfade)].join(", ")}`);

// ── 2 · Wer leert die Warteschlange? ─────────────────────────────────────────────────────
abschnitt("2 · Der einzige Weg in den Warteschlangenabfluss");
check("2.1 Es gibt genau EINE Funktion, die den Cron ueber die Warteschlange fahrt",
  (serverSrc.match(/async function runCronUeberWarteschlange\(/g) || []).length === 1);
// Aufrufstellen von runCronUeberWarteschlange (ohne die Definition selbst).
const aufrufeWarteschlange = (serverSrc.match(/return runCronUeberWarteschlange\(/g) || []).length;
check("2.2 Sie wird von genau EINER Stelle aufgerufen (cronSchwererPfad)",
  aufrufeWarteschlange === 1, String(aufrufeWarteschlange));
check("2.3 Dieser Aufruf haengt am Flag HELMUT_SCALABLE_PIPELINE",
  /skalierbarerPfadAktiv\(\)\)\s*\{\s*\n\s*return runCronUeberWarteschlange\(/.test(serverSrc));

// `cronSchwererPfad("<name>", …)` — die Namen sind die Cron-Pfade ohne Praefix.
const schwerAufrufe = [...serverSrc.matchAll(/cronSchwererPfad\("([a-z-]+)"/g)].map((m) => m[1]);
const schwerNamen = [...new Set(schwerAufrufe)].sort();
check("2.4 cronSchwererPfad wird von genau zwei Routen benutzt: crawl und pipeline",
  schwerNamen.length === 2 && schwerNamen[0] === "crawl" && schwerNamen[1] === "pipeline",
  JSON.stringify(schwerNamen));

// ── 3 · Wie viele REGULAERE Abflusslaeufe ergibt das pro Tag? ────────────────────────────
abschnitt("3 · Regulaere Abflusslaeufe pro Tag");
const abflussPfade = schwerNamen.map((n) => `/api/cron/${n}`);
const abflussEintraege = crons.filter((c) => abflussPfade.includes(c.path));
check("3.1 Genau DREI Cron-Eintraege fuehren in den Warteschlangenabfluss",
  abflussEintraege.length === 3,
  JSON.stringify(abflussEintraege.map((c) => `${c.path} @ ${c.schedule}`)));
console.log(`  Abflusslaeufe: ${abflussEintraege.map((c) => `${c.path} @ ${c.schedule}`).join(" · ")}`);
check("3.2 Die uebrigen acht Eintraege leeren die Warteschlange NICHT",
  crons.length - abflussEintraege.length === 8,
  String(crons.length - abflussEintraege.length));
// Die Zahl 11 darf nie als Abflusszahl gelesen werden — genau das war der Fehler.
check("3.3 Die Zahl der Eintraege (11) ist NICHT die Zahl der Abflusslaeufe (3)",
  crons.length !== abflussEintraege.length && abflussEintraege.length === 3);

// ── 4 · Die Narrativslots sind kein allgemeiner Abfluss ─────────────────────────────────
abschnitt("4 · Narrativslots: typgebunden und heute inert");
check("4.1 Der Narrativlauf holt ausschliesslich `tenant_narrative`",
  /narrativSlotLauf[\s\S]{0,1400}?typen:\s*\["tenant_narrative"\]/.test(serverSrc));
check("4.2 Er laeuft nur, wenn BEIDE Flags gesetzt sind (narrativUeberWarteschlange)",
  /narrativUeberWarteschlange\(\)/.test(serverSrc)
  && /HELMUT_SCALABLE_PIPELINE und HELMUT_NARRATIV_QUEUE muessen beide an sein/.test(serverSrc));
check("4.3 Ohne die Flags wird der Nachlaufslot ehrlich uebersprungen (kein stiller 200er)",
  /uebersprungen — OP-30-Flags aus, keine Verarbeitung/.test(serverSrc));

// ── 5 · Der Watchdog ist ein BEDINGTER Ersatzlauf ───────────────────────────────────────
abschnitt("5 · GitHub-Watchdog: bedingter Ersatzlauf, keine garantierte Kapazitaet");
check("5.1 Er zielt auf /api/cron/pipeline (denselben Abflusspfad)",
  /\/api\/cron\/pipeline/.test(watchdogSrc));
check("5.2 Bei vorhandenem regulaerem Erfolg startet KEIN Ersatzlauf",
  /vorpruefung\.ausgang === "vorhanden"/.test(watchdogSrc)
  && /KEIN Ersatzlauf gestartet/.test(watchdogSrc));
check("5.3 Bei einem Lesefehler laeuft er ausdruecklich AUCH NICHT (fail closed)",
  /vorpruefung\.ausgang === "lesefehler"/.test(watchdogSrc)
  && /bewusst KEIN schwerer/.test(watchdogSrc));
check("5.4 Nur ein manueller Dispatch mit force_run=1 erzwingt ihn",
  /WATCHDOG_FORCE_RUN/.test(watchdogSrc));

// ── 6 · Die Kapazitaetsaussage, die daraus folgt ────────────────────────────────────────
abschnitt("6 · Was daraus fuer die Kapazitaetsplanung folgt");
const REGULAERE_ABFLUESSE = abflussEintraege.length;
check("6.1 Planungsgrundlage sind DREI regulaere Abfluesse, nicht elf",
  REGULAERE_ABFLUESSE === 3, String(REGULAERE_ABFLUESSE));
// Gegenprobe aus einer ZWEITEN, unabhaengigen Stelle im Repository: die zentrale
// Skalierungsrechnung fuehrt denselben Parameter mit derselben Zahl und derselben
// Begruendung („Herkunft: Cron-Definition (drei schwere Laeufe)").
const modellSrc = fs.readFileSync(path.join(ROOT, "scripts/skalierungsmodell.js"), "utf8");
const modellTreffer = modellSrc.match(/schwereLaeufeJeTag:\s*(\d+)/);
check("6.2 Die zentrale Skalierungsrechnung fuehrt unabhaengig dieselbe Zahl",
  Boolean(modellTreffer) && Number(modellTreffer[1]) === REGULAERE_ABFLUESSE,
  modellTreffer ? modellTreffer[1] : "nicht gefunden");
// Die Doku darf die falsche Angabe nicht wieder BEHAUPTEN. Sie darf sie sehr wohl
// ZITIEREN — eine Berichtigung muss den berichtigten Satz nennen duerfen (CLAUDE.md §7.11:
// veraltete Angaben kennzeichnen statt still entfernen). Der Riegel prueft deshalb nicht
// auf Abwesenheit, sondern darauf, dass JEDES Vorkommen ein Zitat ist: ein deutsches
// oeffnendes Anfuehrungszeichen steht in den 60 Zeichen davor.
const doku = fs.readFileSync(path.join(ROOT, "docs/betrieb/skalierung-25-50-100.md"), "utf8");
const behauptungen = [...doku.matchAll(/~?\s*11\s+schwere/g)]
  .filter((m) => !doku.slice(Math.max(0, m.index - 60), m.index).includes("„"));
check("6.3 Die Skalierungsdoku behauptet ~11 schwere Slots nirgends mehr (nur als Zitat)",
  behauptungen.length === 0,
  behauptungen.map((m) => doku.slice(m.index - 40, m.index + 30).replace(/\n/g, " ")).join(" | "));
check("6.4 Die Skalierungsdoku nennt die drei regulaeren Abfluesse ausdruecklich",
  /drei regul(ae|ä)re/i.test(doku) && /Abfluss/i.test(doku));
check("6.5 Sie zaehlt den Watchdog nicht als garantierte Kapazitaet",
  /bedingter Ersatzlauf/i.test(doku));

console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
console.log(`EINORDNUNG: ${REGULAERE_ABFLUESSE} regulaere Abflusslaeufe/Tag`
  + " (crawl 04:00, pipeline 16:00, crawl 20:00 UTC) plus ein BEDINGTER Watchdog-Ersatzlauf.");
console.log("Diese Zahl ist eine KONFIGURATIONSTATSACHE, keine Durchsatzmessung — wie viel");
console.log("ein einzelner Lauf schafft, sagt sie nicht.");
process.exit(fail > 0 ? 1 : 0);
