"use strict";

// Helmut — WIE VIELE ABFLUSSPLAETZE HAT DIE WARTESCHLANGE WIRKLICH?
// (Korrekturrunde Skalierung 25/50/100, 2026-08-25/5)
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
//   * Die drei Narrativ-Zeiteintraege (`lage-briefing`, zwei `lage-briefing-nachlauf`)
//     wuerden ausschliesslich `tenant_narrative` abarbeiten — und nur, wenn BEIDE Flags
//     gesetzt sind (`HELMUT_SCALABLE_PIPELINE` UND `HELMUT_NARRATIV_QUEUE`). Keiner von
//     ihnen ist ein ALLGEMEINER Warteschlangenabfluss, weder heute noch nach F6.
//
// BERICHTIGUNG (Korrekturrunde 5, 2026-08-25). Hier stand: „Beides ist heute nicht der Fall;
// die Slots sind inert." Das war fuer EINEN der drei Eintraege FALSCH und ist der Grund fuer
// den neuen Abschnitt 4:
//   * `/api/cron/lage-briefing` (05:45Z) ist bei AUSGESCHALTETER Narrativwarteschlange
//     NICHT inert — es laeuft der bestehende DIREKTPFAD (Vorwaermschleife ueber alle
//     aktiven Profile). Der Warteschlangenzweig steht davor als frueher `return`; er
//     ERSETZT den Direktpfad nur bei eingeschalteten Flags.
//   * Nur die ZWEI `lage-briefing-nachlauf`-Eintraege (06:10Z, 06:22Z) sind heute inaktiv.
//     Diese Route hat ausdruecklich KEINEN Altpfad und endet mit einem ehrlichen
//     Uebersprung — kein Schreibvorgang, kein Modellaufruf.
//   * An der Abflusszahl aendert das NICHTS: typgebundene Narrativslots sind kein
//     allgemeiner Abfluss. DREI regulaere allgemeine Abflusslaeufe/Tag bleibt korrekt.
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
// KAPAZITAETSSPRINT 2026-08-31: ZWEI Eintraege kommen dazu — die Rueckstandsschleife
// des Verstehens (`/api/cron/understanding-rueckstand`, 11:30 und 17:30 UTC). Beide
// fahren den DIREKTEN Verstehenspfad (runPendingUnderstandingShadow), nicht den
// Warteschlangenabfluss — an der Abflusszahl DREI aendert sich nichts (Abschnitt 3).
check("1.1 Es sind genau 13 Cron-Eintraege konfiguriert", crons.length === 13, String(crons.length));
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
check("3.2 Die uebrigen zehn Eintraege leeren die Warteschlange NICHT",
  crons.length - abflussEintraege.length === 10,
  String(crons.length - abflussEintraege.length));
// Die Eintragszahl darf nie als Abflusszahl gelesen werden — genau das war der Fehler.
check("3.3 Die Zahl der Eintraege (13) ist NICHT die Zahl der Abflusslaeufe (3)",
  crons.length !== abflussEintraege.length && abflussEintraege.length === 3);
// Und die neuen Rueckstandsslots duerfen NIE in den Warteschlangenabfluss zaehlen:
// sie rufen runPendingUnderstandingShadow (Direktpfad), nicht cronSchwererPfad.
check("3.4 understanding-rueckstand ist KEIN Warteschlangenabfluss",
  !abflussPfade.includes("/api/cron/understanding-rueckstand")
  && crons.filter((c) => c.path === "/api/cron/understanding-rueckstand").length === 2
  && !/cronSchwererPfad\("understanding-rueckstand"/.test(serverSrc));

// ── 4 · Die drei Narrativ-Zeiteintraege: typgebunden — aber NICHT alle drei inaktiv ──────
// Diese Zusicherungen trennen, was frueher zu „drei inerten Narrativslots" verschmolzen war.
// Sie sind der Riegel gegen genau diese Verwechslung: wer die drei Eintraege wieder gleich
// behandelt, macht mindestens einen dieser Tests rot.
abschnitt("4 · Narrativ-Zeiteintraege: typgebunden; der regulaere Slot hat einen AKTIVEN Direktpfad");
check("4.1 Der Narrativlauf holt ausschliesslich `tenant_narrative`",
  /narrativSlotLauf[\s\S]{0,1400}?typen:\s*\["tenant_narrative"\]/.test(serverSrc));
check("4.2 Er laeuft nur, wenn BEIDE Flags gesetzt sind (narrativUeberWarteschlange)",
  /narrativUeberWarteschlange\(\)/.test(serverSrc)
  && /HELMUT_SCALABLE_PIPELINE und HELMUT_NARRATIV_QUEUE muessen beide an sein/.test(serverSrc));
check("4.3 Ohne die Flags wird der NACHLAUFSLOT ehrlich uebersprungen (kein stiller 200er)",
  /uebersprungen — OP-30-Flags aus, keine Verarbeitung/.test(serverSrc));

// Die beiden Routenkoerper einzeln herausschneiden — jede Aussage wird an IHRER Route
// geprueft, nicht irgendwo in server.js.
function routenkoerper(pfad) {
  const start = serverSrc.indexOf(`url.pathname === "${pfad}"`);
  if (start < 0) return "";
  // Bis zum naechsten Routenkopf (oder Dateiende) — reicht fuer die Struktur des Handlers.
  const rest = serverSrc.slice(start + 10);
  const naechste = rest.indexOf("url.pathname === \"/api/");
  return naechste < 0 ? rest : rest.slice(0, naechste);
}
const regulaer = routenkoerper("/api/cron/lage-briefing");
const nachlauf = routenkoerper("/api/cron/lage-briefing-nachlauf");
check("4.4 Beide Routenkoerper sind auffindbar (sonst sagt der Rest dieses Abschnitts nichts)",
  regulaer.length > 500 && nachlauf.length > 300,
  `${regulaer.length} / ${nachlauf.length} Zeichen`);

// (A) DER REGULAERE SLOT HAT EINEN ALTPFAD — und der ist heute der laufende.
check("4.5 Im regulaeren Slot steht der Warteschlangenzweig als frueher `return` VOR dem Altpfad",
  /if \(scalablePipeline\.narrativUeberWarteschlange\(\)\)\s*\{\s*\n\s*return narrativSlotLauf\(/
    .test(regulaer));
check("4.6 NACH diesem Zweig folgt im selben Handler die Direktschleife (der Altpfad)",
  (() => {
    const i = regulaer.indexOf("return narrativSlotLauf(");
    if (i < 0) return false;
    const danach = regulaer.slice(i);
    return /listProfiles\(\)/.test(danach) && /buildLageBriefing\(/.test(danach);
  })());
check("4.7 Bei AUSGESCHALTETER Narrativwarteschlange ist der regulaere Slot also AKTIV, nicht inert",
  /listProfiles\(\)/.test(regulaer) && /buildLageBriefing\(/.test(regulaer)
  && !/uebersprungen — OP-30-Flags aus/.test(regulaer.slice(0, regulaer.indexOf("listProfiles()"))));

// (B) DER NACHLAUFSLOT HAT KEINEN ALTPFAD — er ist heute wirklich inaktiv.
check("4.8 Der Nachlaufslot kehrt bei ausgeschalteten Flags VOR jeder Verarbeitung zurueck",
  /if \(!scalablePipeline\.narrativUeberWarteschlange\(\)\)/.test(nachlauf)
  && /uebersprungen — OP-30-Flags aus, keine Verarbeitung/.test(nachlauf));
check("4.9 Der Nachlaufslot hat KEINEN Altpfad (keine Direktschleife im Handler)",
  !/listProfiles\(\)/.test(nachlauf) && !/buildLageBriefing\(/.test(nachlauf));
check("4.10 Der Quelltext haelt die Altpfadlosigkeit ausdruecklich fest",
  /reiner Warteschlangen-Slot: sie hat KEINEN Altpfad/.test(serverSrc));

// (C) KEIN allgemeiner Abfluss — die eigentliche Kapazitaetsaussage.
check("4.11 Keiner der drei Eintraege ruft den allgemeinen Abfluss (runCronUeberWarteschlange)",
  !/runCronUeberWarteschlange\(/.test(regulaer) && !/runCronUeberWarteschlange\(/.test(nachlauf));
check("4.12 Auch mit beiden Flags blieben sie typgebunden — kein anderer Auftragstyp",
  (() => {
    const i = serverSrc.indexOf("async function narrativSlotLauf");
    if (i < 0) return false;
    const koerper = serverSrc.slice(i, i + 4000);
    const typen = [...koerper.matchAll(/typen:\s*\[([^\]]*)\]/g)].map((m) => m[1].trim());
    return typen.length > 0 && typen.every((t) => t === '"tenant_narrative"');
  })());

// (D) DER RIEGEL GEGEN FALSCHES GRUEN: die Doku darf die Verschmelzung nicht wiederholen.
check("4.13 Die Skalierungsdoku behauptet NICHT mehr, alle drei Slots seien inert",
  !/drei\s+Narrativslots[\s\S]{0,400}?(sind|waeren|wären)\s+heute\s+\*\*inert\*\*/i
    .test(fs.readFileSync(path.join(ROOT, "docs/betrieb/skalierung-25-50-100.md"), "utf8")));
check("4.14 Die Skalierungsdoku benennt den aktiven Direktpfad des regulaeren Slots ausdruecklich",
  /Direktpfad/.test(fs.readFileSync(path.join(ROOT, "docs/betrieb/skalierung-25-50-100.md"), "utf8")));

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
console.log("NARRATIV: /api/cron/lage-briefing ist heute NICHT inert — es laeuft sein Direktpfad;");
console.log("inaktiv sind allein die zwei lage-briefing-nachlauf-Eintraege. Keiner der drei ist");
console.log("ein allgemeiner Abfluss (typgebunden auf tenant_narrative) — daher bleibt es bei DREI.");
process.exit(fail > 0 ? 1 : 0);
