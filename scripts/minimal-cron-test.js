"use strict";

// ============================================================================
// MINIMAL-CRON-ARCHITEKTUR für 500 Mandate (Vorbereitung 2026-09-01)
// ============================================================================
// Vertragssuite des vorbereiteten 48-Slot-Rhythmus `18,48 * * * *`:
//   * der Rhythmus ist wohlgeformt und ergibt GENAU 48 tägliche Slots,
//   * er kollidiert mit KEINEM bestehenden Cron (Mindestabstand belegt),
//   * Production bleibt UNVERÄNDERT (vercel.json trägt den Rhythmus nicht,
//     die 13 Bestandseinträge und SLOT_PLAN sind unangetastet),
//   * kein SQS, Parallelität 1, vorhandener Motor,
//   * budgetlose Slots enden über die Vorab-Bodenprüfung VOR jeder Lesearbeit,
//   * die Aktivierung ist als fail-closed dokumentierter Betreiberweg hinterlegt.
// REINE LOGIK + Quelltext-/Konfigurationsprüfung; kein Netz, kein Cron-Lauf.
// Jeder Lauf gehört über scripts/lokal.js gestartet (CLAUDE.md §6).

const fs = require("fs");
const path = require("path");
const minimalCron = require("../lib/helmut/minimal-cron");
const verstehenRueckstand = require("../lib/helmut/verstehen-rueckstand");
const { verstehenParallelitaet } = require("../lib/helmut/verstehen-vertrag");
const { SLOT_PLAN } = require("../lib/helmut/motor-health");

let pass = 0, fail = 0;
function check(name, cond) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`); if (cond) pass += 1; else fail += 1; }
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const minimalSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "minimal-cron.js"), "utf8");
const rueckstandSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "verstehen-rueckstand.js"), "utf8");

(async () => {
  abschnitt("§1 Der Rhythmus: wohlgeformt, exakt 48 Slots");
  {
    const plan = minimalCron.parseMinutenRhythmus(minimalCron.MINIMAL_CRON_RHYTHMUS);
    check("§1.1 '18,48 * * * *' parst zu Minuten [18,48] und 48 Slots/Tag",
      plan && plan.minuten.join(",") === "18,48" && plan.slotsJeTag === 48);
    check("§1.2 der Parser ist streng: nur die Zwei-Minuten-Jede-Stunde-Form",
      minimalCron.parseMinutenRhythmus("18 * * * *") === null
      && minimalCron.parseMinutenRhythmus("18,48,50 * * * *") === null
      && minimalCron.parseMinutenRhythmus("18,48 5 * * *") === null
      && minimalCron.parseMinutenRhythmus("18,18 * * * *") === null
      && minimalCron.parseMinutenRhythmus("18,61 * * * *") === null
      && minimalCron.parseMinutenRhythmus("") === null);
    const zeiten = minimalCron.slotZeitenUtc();
    check("§1.3 slotZeitenUtc liefert 48 deterministische Slots (je Stunde :18 und :48)",
      zeiten.length === 48
      && zeiten.filter((z) => z.minute === 18).length === 24
      && zeiten.filter((z) => z.minute === 48).length === 24
      && zeiten[0].stunde === 0 && zeiten[0].minute === 18 && zeiten[47].stunde === 23 && zeiten[47].minute === 48);
  }

  abschnitt("§2 Kollisionsfreiheit mit den 13 Bestands-Crons");
  {
    const abstand = minimalCron.minutenAbstandZuBestehenden(vercel.crons);
    check("§2.1 kleinster Minutenabstand zu jedem Bestandsslot ist 3 (05:45-Lage-Briefing → :48), nie 0",
      abstand === 3 && abstand > 0);
    check("§2.2 ein nicht parsebarer Bestandseintrag zählt fail-closed als Kollision (0)",
      minimalCron.minutenAbstandZuBestehenden([{ schedule: "*/5 * * * *" }]) === 0);
    check("§2.3 Slottakt 30 min > Deadline 280 s: kein Lauf kann in den nächsten Slot hineinlaufen",
      minimalCron.SLOT_DEADLINE_MS < 30 * 60000);
  }

  abschnitt("§3 Production unverändert: vercel.json und SLOT_PLAN tragen den Rhythmus NICHT");
  {
    check("§3.1 vercel.json enthält '18,48' nirgends (kein vorzeitiger Cron-Ausbau)",
      !JSON.stringify(vercel).includes("18,48"));
    check("§3.2 weiterhin exakt 13 Cron-Einträge (die gepinnten Bestandsverträge gelten)",
      Array.isArray(vercel.crons) && vercel.crons.length === 13);
    check("§3.3 die beiden heutigen Rückstandsslots 11:30/17:30 UTC stehen unverändert",
      vercel.crons.filter((c) => c.path === minimalCron.MINIMAL_CRON_ROUTE).map((c) => c.schedule).sort().join("|") === "30 11 * * *|30 17 * * *");
    const slotEintrag = SLOT_PLAN.find((s) => s.process === "understanding-rueckstand");
    check("§3.4 SLOT_PLAN führt understanding-rueckstand unverändert mit [11.5, 17.5] und selbstAnker",
      slotEintrag && slotEintrag.stundenUtc.join(",") === "11.5,17.5" && slotEintrag.selbstAnker === true);
    check("§3.5 die ersetzten Bestandsslots sind im Vertrag exakt benannt",
      minimalCron.ERSETZTE_BESTANDSSLOTS.join("|") === "30 11 * * *|30 17 * * *");
  }

  abschnitt("§4 Vorhandener Motor, kein SQS, Parallelität 1");
  {
    check("§4.1 der Vertrag zeigt auf die BESTEHENDE Route (kein neuer Handler)",
      minimalCron.MINIMAL_CRON_ROUTE === "/api/cron/understanding-rueckstand"
      && serverSrc.includes(`url.pathname === "${minimalCron.MINIMAL_CRON_ROUTE}"`));
    check("§4.2 kein SQS: weder minimal-cron.js noch verstehen-rueckstand.js laden aws-sdk/SQS-Code",
      !/require\([^)]*aws/i.test(minimalSrc) && !/require\([^)]*sqs/i.test(minimalSrc)
      && !/require\([^)]*aws/i.test(rueckstandSrc) && !/require\([^)]*sqs/i.test(rueckstandSrc));
    check("§4.3 Parallelität ohne Env-Wert ist 1 (geklemmt, CAS-Riegel unverändert)",
      verstehenParallelitaet({}) === 1 && verstehenParallelitaet({ HELMUT_VERSTEHEN_PARALLELITAET: "" }) === 1);
    check("§4.4 die Zeitgrenzen des Slots sind die unveränderten Bestandswerte (240 s Loop, 280 s Deadline)",
      minimalCron.SLOT_LOOP_BUDGET_MS === 240000 && minimalCron.SLOT_DEADLINE_MS === 280000
      && /HELMUT_UNDERSTAND_BUDGET_MS \|\| 240000/.test(serverSrc)
      && /rueckstandStartMs \+ 280000/.test(serverSrc));
  }

  abschnitt("§5 Kapazität: die Slotzahl ist kein Engpass mehr");
  {
    const kap = minimalCron.tagesKapazitaet({});
    check("§5.1 48 Slots × min(Laufdeckel 20, physisch 19) = 912 mögliche Aufrufe/Tag",
      kap && kap.maxAufrufeJeTag === 912 && kap.begrenztDurch === "slotzeit");
    check("§5.2 ungültige Eingaben ⇒ null (keine erfundene Kapazität)",
      minimalCron.tagesKapazitaet({ slotsJeTag: 0 }) === null
      && minimalCron.tagesKapazitaet({ laufDeckel: NaN }) === null);
    const laufzeit = minimalCron.erwarteteLaufzeitJeSlot();
    check("§5.3 Laufzeitvertrag: voller Slot ≤ Deadline, budgetloser Slot mit Vorab-Boden in Sekunden",
      laufzeit.vollerSlotMs.gemessen <= laufzeit.deadlineMs
      && laufzeit.budgetloserSlotMs.mitVorabBoden < 10000
      && laufzeit.budgetloserSlotMs.ohneVorabBoden > 200000);
  }

  abschnitt("§6 Vorab-Bodenprüfung: budgetlose Slots kosten praktisch nichts (Quelle: atomarer Zähler)");
  {
    // BEFUND 3 (Korrektursprint 2026-09-01): die Vorab-Prüfung liest den
    // MASSGEBLICHEN atomaren Tageszähler (llm_budget_counters via
    // leseTageszaehler), nie mehr das verlustbehaftete llmUsage-Log.
    const zaehler = (antwort) => () => antwort;
    const oben = await verstehenRueckstand.vorabBodenPruefung({ leseTageszaehler: zaehler({ ok: true, used: 10, limit: 100, remaining: 90 }), budgetBoden: 30 });
    check("§6.1 Rest > Boden ⇒ erlaubt (mit belegten Zahlen)", oben.erlaubt === true && oben.remaining === 90 && oben.boden === 30);
    const boden = await verstehenRueckstand.vorabBodenPruefung({ leseTageszaehler: zaehler({ ok: true, used: 83, limit: 100, remaining: 17 }), budgetBoden: 30 });
    check("§6.2 Rest ≤ Boden ⇒ nicht erlaubt (der belegte 17:30-Naturlauffall: Rest 17 ≤ 30)",
      boden.erlaubt === false && boden.grund === "rueckstand-budget-boden-erreicht" && boden.remaining === 17);
    const unbekannt = await verstehenRueckstand.vorabBodenPruefung({ leseTageszaehler: zaehler({ ok: true, used: 5, limit: null, remaining: null }), budgetBoden: 30 });
    check("§6.3 unbestimmbarer Rest ⇒ nicht erlaubt (fail closed; Number(null) wird NIE zu 0)",
      unbekannt.erlaubt === false && unbekannt.grund === "rueckstand-budget-unbekannt" && unbekannt.remaining === null);
    const unlesbar = await verstehenRueckstand.vorabBodenPruefung({ leseTageszaehler: zaehler({ ok: false, fehler: "HTTP 500" }), budgetBoden: 30 });
    check("§6.4a unlesbarer Zähler ⇒ geschlossen blockiert (kein Rückfall auf das Log)",
      unlesbar.erlaubt === false && /^vorab-zaehler-nicht-lesbar:HTTP 500/.test(unlesbar.grund));
    const wirft = await verstehenRueckstand.vorabBodenPruefung({ leseTageszaehler: () => { throw new Error("kaputt"); }, budgetBoden: 30 });
    check("§6.4 werfender Zählerleser ⇒ nicht erlaubt, nie Absturz", wirft.erlaubt === false);
    const ohneLeser = await verstehenRueckstand.vorabBodenPruefung({});
    check("§6.5 fehlender Zählerleser ⇒ nicht erlaubt", ohneLeser.erlaubt === false && ohneLeser.grund === "vorab-kein-zaehlerleser");
    const alteQuelle = await verstehenRueckstand.vorabBodenPruefung({ canSpendGlobal: () => ({ allowed: true, used: 10, limit: 100, remaining: 90 }), budgetBoden: 30 });
    check("§6.5b REGRESSION: die alte Log-Quelle (canSpendGlobal 'frei') wird NICHT mehr akzeptiert — blockiert",
      alteQuelle.erlaubt === false && alteQuelle.grund === "vorab-kein-zaehlerleser");
    // Struktur: die Prüfung sitzt VOR der Wiedervorlage UND vor dem Rohdokument-Laden.
    const vorabPos = serverSrc.indexOf("vorabBodenPruefung({");
    const wiedervorlagePos = serverSrc.indexOf("pruefeGeparkteNeuBewertung({ runId })");
    const ladePos = serverSrc.indexOf("listRecentRawDocuments(500)", serverSrc.indexOf("understanding-rueckstand\") {"));
    check("§6.6 Route: Vorab-Bodenprüfung VOR Gate-Wiedervorlage und VOR dem Ladepfad",
      vorabPos > 0 && wiedervorlagePos > vorabPos && ladePos > vorabPos);
    check("§6.6b Route: die Vorab-Quelle ist storageModul.leseLlmTageszaehler (der atomare Zähler), nicht canSpendLlm",
      /leseTageszaehler: \(\) => storageModul\.leseLlmTageszaehler\(\)/.test(serverSrc)
      && !/vorabBodenPruefung\(\{\s*\n?\s*canSpendGlobal/.test(serverSrc));
    check("§6.7 der übersprungene Lauf quittiert ehrlich (status blocked + Grund + Wächterwerte)",
      /status: "blocked",\s*\n\s*telemetrie: \{\s*\n\s*rueckstand: \{/.test(serverSrc)
      && /vorabBoden: \{ grund: vorabBoden\.grund/.test(serverSrc));
  }

  abschnitt("§7 Aktivierung bleibt Betreiberentscheidung (fail-closed dokumentiert)");
  {
    const schritte = minimalCron.aktivierungsVoraussetzungen();
    const namen = schritte.map((s) => s.schritt);
    check("§7.1 die sechs Pflichtschritte sind vollständig benannt",
      namen.join(",") === "betreiber-freigabe,vercel-json,slot-plan,cron-vertragstests,tagesdeckel,nachweis");
    check("§7.2 der vercel-json-Schritt ersetzt exakt die zwei Bestandsslots (netto +46 Invocations)",
      /30 11 \* \* \* und 30 17 \* \* \*/.test(schritte[1].beschreibung) && /\+46 Invocations/.test(schritte[1].beschreibung));
    check("§7.3 der Deckel-Schritt bindet die Aktivierung an die Kapazitätsrechnung",
      /kapazitaet-500/.test(schritte[4].beschreibung));
    check("§7.4 kein Code-Pfad aktiviert den Rhythmus (kein Flag, keine Env-Weiche im Modul)",
      !/process\.env/.test(minimalSrc));
  }

  console.log(`\nERGEBNIS: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("Testlauf abgebrochen:", (e && e.stack) || e); process.exit(1); });
