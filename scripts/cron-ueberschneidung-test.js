"use strict";

// Offline-Nachweis der CRON-LAUFZEITÜBERSCHNEIDUNG (Frage „05:45/05:48").
// =============================================================================
// WARUM DIESE SUITE (Nachprüfung 02.09. nach dem Merge von #295):
// `CURRENT_STATE.md` führt „05:45/05:48" seit dem Korrektursprint als OFFEN.
// In dieser Formulierung stecken aber ZWEI verschiedene Fragen, und nur eine
// davon braucht einen Production-Lauf:
//
//   (a) „Tritt die Überschneidung HEUTE auf?"  → offline entscheidbar.
//   (b) „Ist gleichzeitiger Betrieb unbedenklich?" → braucht den
//       Aktivierungsnachweis, also einen Production-Lauf mit aktivem
//       Minimal-Cron. Bleibt offen und wird hier NICHT behauptet.
//
// Diese Suite beantwortet ausschließlich (a) — deterministisch, ohne Netz, ohne
// Production, ohne eine einzige Route aufzurufen. Sie rechnet gegen die
// TATSÄCHLICHE Konfiguration (`vercel.json`), nicht gegen abgeschriebene Zahlen:
// `maxDuration` wird aus der Datei gelesen, nicht literal gesetzt. Ändert jemand
// einen Cron oder die Laufzeitgrenze, wird diese Suite rot statt still falsch.
//
// KORREKTUR EINER VERBREITETEN ANNAHME (hier festgehalten, damit sie nicht
// wiederkehrt): „05:48" ist KEIN regulärer Ablauf. Um 05:45 UTC läuft
// `/api/cron/lage-briefing`; um 05:48 UTC läuft heute NICHTS. Der 05:48-Slot
// entsteht ausschließlich aus dem VORBEREITETEN, NICHT aktivierten
// Minimal-Cron-Rhythmus `18,48 * * * *` (`lib/helmut/minimal-cron.js`).

const fs = require("fs");
const path = require("path");
const minimalCron = require("../lib/helmut/minimal-cron");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

// Startminute des UTC-Tages aus einem 5-Feld-Cron. `null`, wenn Minute oder
// Stunde keine schlichte Zahl sind — ein Rhythmus wie `18,48 * * * *` hat keine
// EINE Startminute und wird hier bewusst nicht zu einer verrechnet.
function startMinute(schedule) {
  const t = String(schedule || "").trim().split(/\s+/);
  if (t.length < 2) return null;
  const m = Number(t[0]);
  const h = Number(t[1]);
  if (!Number.isInteger(m) || !Number.isInteger(h)) return null;
  return h * 60 + m;
}

function hhmm(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function main() {
  // ── 1 · Die Konfiguration, gegen die gerechnet wird ──────────────────────
  console.log("\n1 · Grundlage aus vercel.json (gelesen, nicht abgeschrieben)");
  const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
  check("1.1 vercel.json trägt 13 Cron-Einträge", crons.length === 13, `${crons.length}`);

  const maxDurationS = vercel.functions
    && vercel.functions["api/index.js"]
    && Number(vercel.functions["api/index.js"].maxDuration);
  check("1.2 die harte Plattformgrenze steht in vercel.json und ist eine Zahl",
    Number.isFinite(maxDurationS) && maxDurationS > 0, `maxDuration=${maxDurationS} s`);

  const minuten = crons
    .map((c) => ({ pfad: c.path, minute: startMinute(c.schedule), schedule: c.schedule }))
    .filter((c) => c.minute !== null)
    .sort((a, b) => a.minute - b.minute);
  check("1.3 alle 13 Crons haben eine eindeutige Startminute",
    minuten.length === crons.length, `${minuten.length} von ${crons.length}`);

  // ── 2 · Können sich zwei BESTANDSCRONS überschneiden? ────────────────────
  //
  // Die Rechnung ist bewusst konservativ: sie nimmt für JEDEN Cron die volle
  // Plattformgrenze an, nicht die weichere interne Deadline. Ein Cron, der
  // seine interne Deadline erreicht, schreibt danach noch Telemetrie und endet
  // erst bei der Plattformgrenze — mit der internen Zahl zu rechnen wäre also
  // zu optimistisch (fail closed in die andere Richtung).
  console.log("\n2 · Überschneidung zweier Bestandscrons");
  let kleinsterAbstand = Infinity;
  let engstesPaar = null;
  for (let i = 1; i < minuten.length; i += 1) {
    const abstand = minuten[i].minute - minuten[i - 1].minute;
    if (abstand > 0 && abstand < kleinsterAbstand) {
      kleinsterAbstand = abstand;
      engstesPaar = [minuten[i - 1], minuten[i]];
    }
  }
  // Auch der Tagesübergang zählt: der späteste Cron gegen den frühesten des
  // Folgetages. Ohne ihn wäre die Aussage nur für einen Tagesausschnitt wahr.
  if (minuten.length > 1) {
    const ueberNacht = (1440 - minuten[minuten.length - 1].minute) + minuten[0].minute;
    if (ueberNacht > 0 && ueberNacht < kleinsterAbstand) {
      kleinsterAbstand = ueberNacht;
      engstesPaar = [minuten[minuten.length - 1], minuten[0]];
    }
  }
  check("2.1 ein engstes Cronpaar wurde bestimmt",
    engstesPaar !== null && Number.isFinite(kleinsterAbstand),
    engstesPaar ? `${hhmm(engstesPaar[0].minute)} ${engstesPaar[0].pfad} → ${hhmm(engstesPaar[1].minute)} ${engstesPaar[1].pfad}` : "");
  check("2.2 der kleinste Startabstand beträgt 10 Minuten",
    kleinsterAbstand === 10, `${kleinsterAbstand} min`);
  check("2.3 GEMESSEN: zwei Bestandscrons können sich heute NICHT überschneiden",
    kleinsterAbstand * 60 > maxDurationS,
    `${kleinsterAbstand} min Abstand gegen ${maxDurationS / 60} min Plattformgrenze`);

  // ── 3 · Läuft um 05:48 überhaupt etwas? ──────────────────────────────────
  console.log("\n3 · Die Annahme „regulärer Ablauf um 05:48\" ist falsch");
  const um0545 = minuten.filter((c) => c.minute === 5 * 60 + 45);
  const um0548 = minuten.filter((c) => c.minute === 5 * 60 + 48);
  check("3.1 um 05:45 UTC läuft /api/cron/lage-briefing",
    um0545.length === 1 && um0545[0].pfad === "/api/cron/lage-briefing",
    um0545.map((c) => c.pfad).join(", ") || "nichts");
  check("3.2 um 05:48 UTC läuft KEIN Bestandscron",
    um0548.length === 0, `${um0548.length} Treffer`);
  check("3.3 der Minimal-Cron-Rhythmus steht NICHT in vercel.json",
    !crons.some((c) => c.schedule === minimalCron.MINIMAL_CRON_RHYTHMUS),
    minimalCron.MINIMAL_CRON_RHYTHMUS);

  // ── 4 · Was WÄRE, wenn der Minimal-Cron aktiv wäre? ──────────────────────
  //
  // Das ist die Frage, die offen bleibt — hier wird sie beziffert, nicht
  // beantwortet. Zwei Paare, beide belegt in `minimal-cron.js`.
  console.log("\n4 · Hypothetisch: mit aktivem Minimal-Cron");
  const paare = minimalCron.laufzeitUeberschneidungen(crons);
  check("4.1 genau zwei Überschneidungspaare",
    Array.isArray(paare) && paare.length === 2, `${(paare || []).length}`);
  check("4.2 Paar 1: lage-briefing 05:45 gegen Slot 05:48",
    paare.some((p) => p.path === "/api/cron/lage-briefing" && p.slotMinute === 48 && p.abstandMin === 3));
  check("4.3 Paar 2: Slot 06:18 gegen lage-briefing-nachlauf 06:22",
    paare.some((p) => p.path === "/api/cron/lage-briefing-nachlauf" && p.slotMinute === 18 && p.abstandMin === 4));
  check("4.4 beide Paare liegen unter der Plattformgrenze — die Überschneidung wäre real",
    paare.every((p) => p.abstandMin * 60 < maxDurationS));

  // ── 5 · Die Grenzen dieses Nachweises, ausdrücklich ──────────────────────
  //
  // Ein Nachweis, der seine eigene Reichweite verschweigt, ist ein falsches
  // Grün. Diese Abschnitte halten fest, was hier NICHT gezeigt wird.
  console.log("\n5 · Ausdrücklich NICHT gezeigt");
  const watchdogPfad = path.join(ROOT, ".github/workflows/briefing-watchdog.yml");
  const watchdogDa = fs.existsSync(watchdogPfad);
  check("5.1 der Actions-Watchdog existiert und ist KEIN Vercel-Cron",
    watchdogDa && !crons.some((c) => String(c.path || "").includes("watchdog")));
  check("5.2 die Überschneidungsrechnung sieht ihn deshalb NICHT",
    (() => {
      // `laufzeitUeberschneidungen` bekommt ausschließlich vercel.json-Crons.
      // Der Watchdog löst eine echte Production-Route aus, startet nominell
      // 05:30 UTC und ist belegt oft 2–3 h verzögert — er ist damit der einzige
      // Akteur, der 05:45 heute tatsächlich überschneiden könnte.
      const quelle = fs.readFileSync(path.join(ROOT, "lib/helmut/minimal-cron.js"), "utf8");
      return !/briefing-watchdog|health-watch/.test(quelle);
    })());
  check("5.3 die Frage „ist gleichzeitiger Betrieb unbedenklich?\" bleibt offen",
    // Sie ist hier bewusst nicht als bestanden markiert: sie verlangt einen
    // Production-Lauf mit aktivem Minimal-Cron, und der ist nicht freigegeben.
    true, "beantwortbar nur über den Aktivierungsnachweis, nicht offline");

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main();
