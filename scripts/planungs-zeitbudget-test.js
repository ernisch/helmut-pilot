"use strict";

// Helmut — VERTRAG DER PLANUNGSZEITGRENZE (Z3b/N5).
// =============================================================================================
// Offline, ohne Netz, Datenbank oder KI. Der belegte Ausgangsfehler war kein langsamer Test,
// sondern eine falsche Nebenlaeufigkeitsannahme: `Promise.race` beendet die unterlegene
// Planungs-Promise nicht. Der Cron konnte daher `neu: 0` quittieren und antworten, waehrend
// der Planer im Hintergrund weiter idempotente Datenbankschreibvorgaenge startete.
//
// Dieser Test beweist am echten Planer:
//   * die Grenze sitzt vor JEDEM neuen Enqueue,
//   * ein bereits begonnener Enqueue wird beobachtet zu Ende gefuehrt,
//   * danach beginnt kein weiterer Schreibvorgang,
//   * Teilzaehler und ausstehende Menge sind ehrlich,
//   * der Server baut darum kein zweites Promise.race mehr.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

const ENV = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_MAX_LLM_CALLS_PER_DAY: "50" };
const JOBS = Object.freeze([0, 1, 2].map((i) => Object.freeze({
  jobType: "source_fetch",
  idempotencyKey: `planung-${i}`,
  freshnessWindow: "2026-08-28T00Z",
  tenantId: null,
  priority: 100,
  maxAttempts: 3,
  payload: { n: i }
})));

function planDeps({ enqueue, now = Date.now } = {}) {
  return {
    now,
    listFullProfiles: async () => [{ id: "mandat-1" }],
    profilPruefung: { isDisabled: () => false },
    quellenFuerProfil: async () => [],
    sourceDemand: {
      kompiliereQuellenbedarf: async () => ({
        auftraege: JOBS.map((a) => ({ ...a })),
        statistik: { auftraegeGesamt: JOBS.length },
        fehlerhafteProfile: []
      }),
      planeMandatsarbeit: () => ({ auftraege: [], fenster: "2026-08-28T00Z" })
    },
    enqueue
  };
}

async function main() {
  console.log("Helmut — Planungszeitbudget: kein unbeobachtetes Weiterschreiben");

  abschnitt("1 · Vollstaendige Planung bleibt unveraendert");
  {
    const geschrieben = [];
    const plan = await SP.planeArbeit({
      env: ENV,
      deps: planDeps({
        enqueue: async (auftrag) => {
          geschrieben.push(auftrag.idempotencyKey);
          return { verfuegbar: true, neu: true };
        }
      })
    });
    check("1.1 Ohne Deadline werden alle Auftraege eingereiht", geschrieben.length === 3,
      `${geschrieben.length}/3`);
    check("1.2 Die bisherigen Zaehler bleiben exakt", plan.geplant === 3 && plan.neu === 3 && plan.vorhanden === 0,
      JSON.stringify({ geplant: plan.geplant, neu: plan.neu, vorhanden: plan.vorhanden }));
    check("1.3 Der neue Vollstaendigkeitsstand ist gruen", plan.ok === true && plan.versucht === 3
      && plan.ausstehend === 0 && plan.zeitbudgetErschoepft === false);
  }

  abschnitt("2 · Bereits verbrauchtes Budget startet keinen Schreibvorgang");
  {
    let geschrieben = 0;
    const plan = await SP.planeArbeit({
      env: ENV,
      planungsDeadlineMs: 100,
      deps: planDeps({
        now: () => 100,
        enqueue: async () => { geschrieben += 1; return { verfuegbar: true, neu: true }; }
      })
    });
    check("2.1 Bei erreichter Deadline startet kein Enqueue", geschrieben === 0, String(geschrieben));
    check("2.2 Gesamtplan und nicht versuchte Menge bleiben unterscheidbar",
      plan.geplant === 3 && plan.versucht === 0 && plan.ausstehend === 3,
      JSON.stringify({ geplant: plan.geplant, versucht: plan.versucht, ausstehend: plan.ausstehend }));
    check("2.3 Null Neuauftraege ist hier belegt, nicht geraten", plan.neu === 0 && plan.vorhanden === 0);
    check("2.4 Der Teillauf ist fail closed benannt",
      plan.ok === false && plan.zeitbudgetErschoepft === true && plan.grund === "planung-zeitbudget");
  }

  abschnitt("3 · Eine laufende Mutation wird beobachtet abgeschlossen, danach ist Schluss");
  {
    let jetzt = 0;
    let begonnen = 0;
    let geschrieben = 0;
    let loeseErsten;
    const ersterDarfEnden = new Promise((resolve) => { loeseErsten = resolve; });
    const planPromise = SP.planeArbeit({
      env: ENV,
      planungsDeadlineMs: 50,
      deps: planDeps({
        now: () => jetzt,
        enqueue: async () => {
          begonnen += 1;
          if (begonnen === 1) await ersterDarfEnden;
          geschrieben += 1;
          return { verfuegbar: true, neu: true };
        }
      })
    });

    // Die beiden vorbereitenden awaits des Planers ablaufen lassen, bis der erste Enqueue
    // tatsaechlich wartet. Kein Wandzeit-Raten: die Schleife gibt nach wenigen Microtasks auf.
    for (let i = 0; i < 20 && begonnen === 0; i += 1) await Promise.resolve();
    check("3.1 Genau der erste Schreibvorgang wurde begonnen", begonnen === 1, String(begonnen));
    jetzt = 60;
    loeseErsten();
    const plan = await planPromise;

    check("3.2 Der bereits begonnene Schreibvorgang ist vor Rueckgabe abgeschlossen",
      geschrieben === 1 && plan.neu === 1, JSON.stringify({ geschrieben, neu: plan.neu }));
    check("3.3 Nach Deadline beginnt kein zweiter Schreibvorgang", begonnen === 1, String(begonnen));
    check("3.4 Der Teilstand ist exakt: eins versucht, zwei ausstehend",
      plan.versucht === 1 && plan.ausstehend === 2 && plan.geplant === 3,
      JSON.stringify({ geplant: plan.geplant, versucht: plan.versucht, ausstehend: plan.ausstehend }));
    check("3.5 Der Ausgang ist rot und eindeutig klassifiziert",
      plan.ok === false && plan.zeitbudgetErschoepft === true && plan.grund === "planung-zeitbudget");

    // Gegen den alten Fehlerpfad: nachdem der Aufrufer das Ergebnis besitzt, darf auch in
    // spaeteren Microtasks nichts mehr mutieren.
    await new Promise((resolve) => setImmediate(resolve));
    check("3.6 Nach Rueckgabe gibt es keinen unbeaufsichtigten Hintergrundschreiber",
      begonnen === 1 && geschrieben === 1, `${begonnen}/${geschrieben}`);
  }

  abschnitt("4 · Der echte Cron benutzt den sicheren Vertrag");
  {
    const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    const block = server.slice(
      server.indexOf("const planBudgetMs = Math.min(60000"),
      server.indexOf("// WIEDERVORLAGE VOR DER ARBEIT", server.indexOf("const planBudgetMs = Math.min(60000"))
    );
    check("4.1 Der Cron reicht eine absolute Planungsdeadline ein",
      /planeArbeit\(\{[\s\S]*planungsDeadlineMs:\s*Date\.now\(\) \+ planBudgetMs/.test(block));
    check("4.2 Um die Planung liegt kein Promise.race/withTimeout mehr",
      !/withTimeout\s*\([\s\S]*planeArbeit/.test(block));
    check("4.3 Ein unerwarteter Planungsfehler erfindet keine Nullzaehler",
      /zaehlerVollstaendig:\s*false/.test(block) && !/planung-fehler[\s\S]{0,240}geplant:\s*0/.test(block)
      && !/planung-fehler[\s\S]{0,240}neu:\s*0/.test(block));
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

