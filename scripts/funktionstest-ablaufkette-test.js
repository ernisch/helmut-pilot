#!/usr/bin/env node
"use strict";

// Helmut — VERTRAGSTEST DER ECHTEN ABLAUFKETTE (rein offline).
// =============================================================================
// ANLASS (Betreiberbefund 02.09.2026): Der Verdacht auf einen KREISSCHLUSS
// zwischen Planung, Statusmessung und Startfreigabe:
//
//   1. `fuehreZyklusAus` verlangt bestätigte Startbereitschaft, bevor
//      `/api/cron/pipeline` überhaupt gerufen wird.
//   2. `/api/cron/pipeline` führt Planung UND Verarbeitung gemeinsam aus.
//   3. Ohne vorherige Planung existiert kein einziger Kohortenauftrag.
//   4. Die Startbereitschaft verlangte eine gemessene Zahl OFFENER Aufträge.
//   ⇒ Die Pipeline darf erst starten, wenn Aufträge gemessen wurden — aber die
//      Aufträge entstehen erst durch die Pipeline.
//
// Diese Suite bildet die TATSÄCHLICHE Reihenfolge als Zustandsmaschine nach und
// prüft das VERHALTEN. Eine Quelltextsuche genügt hier ausdrücklich nicht: der
// Fehler steckte nicht in einer Zeichenkette, sondern in der Verknüpfung
// zweier für sich korrekter Bedingungen.
//
// Sie berührt kein Netz, keine Datenbank, keine Route und kein Modell.

const path = require("path");
const ROOT = path.join(__dirname, "..");
const F = require(path.join(ROOT, "lib/helmut/funktionstest-faelligkeit"));
const Z = require(path.join(ROOT, "lib/helmut/funktionstest-zyklus"));
const S = require(path.join(ROOT, "lib/helmut/testkohorte-stufen"));

let pass = 0;
let fail = 0;
function check(name, bedingung, zusatz = "") {
  if (bedingung) { pass += 1; console.log(`  PASS  ${name}${zusatz ? ` — ${zusatz}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${zusatz ? ` — ${zusatz}` : ""}`); }
}

const t = (x) => Date.parse(x);
const TAG = "2026-09-03";
const FENSTER = Object.freeze({
  start: t(`${TAG}T21:36:00Z`),
  ende: t("2026-09-04T03:59:00Z")
});
const REALE = Object.freeze(["real-1", "real-2", "real-3", "real-4", "real-5"]);

// ── DIE WARTESCHLANGE ALS ZUSTANDSMASCHINE ──────────────────────────────────
//
// Sie bildet genau die vier Statuswerte der Migration nach und genau die
// Übergänge, die `helmut_claim_jobs` und `helmut_finish_job` vollziehen.
// Absichtlich klein: sie soll die REGELN nachbilden, nicht die Datenbank.
class Warteschlange {
  constructor() { this.zeilen = []; }

  // `helmut_enqueue_job`: on conflict (idempotency_key) do nothing.
  einreihen(auftraege) {
    let neu = 0;
    let vorhanden = 0;
    for (const a of auftraege) {
      if (this.zeilen.some((z) => z.idempotencyKey === a.idempotencyKey)) { vorhanden += 1; continue; }
      this.zeilen.push({
        idempotencyKey: a.idempotencyKey, jobType: a.jobType, tenantId: a.tenantId,
        freshnessWindow: a.freshnessWindow, dueAt: Date.parse(a.dueAt),
        status: "wartend", attempts: 0, maxAttempts: a.maxAttempts || 5,
        leaseExpiresAt: null, finishedAt: null
      });
      neu += 1;
    }
    return { neu, vorhanden };
  }

  // `helmut_claim_jobs`, Schritte (a), (b), (c).
  beanspruchen({ jetztMs, limit }) {
    for (const z of this.zeilen) {                                   // (a) Lease-Rücklauf
      if (z.status === "laeuft" && z.leaseExpiresAt !== null && z.leaseExpiresAt < jetztMs) {
        z.status = "wartend"; z.leaseExpiresAt = null;
      }
    }
    for (const z of this.zeilen) {                                   // (b) Versuche erschöpft
      if (z.status === "wartend" && z.attempts >= z.maxAttempts) {
        z.status = "fehlgeschlagen"; z.finishedAt = jetztMs;
      }
    }
    const kandidaten = this.zeilen                                   // (c) reservieren
      .filter((z) => z.status === "wartend" && z.dueAt <= jetztMs && z.attempts < z.maxAttempts)
      .sort((a, b) => a.dueAt - b.dueAt)
      .slice(0, limit);
    for (const z of kandidaten) {
      z.status = "laeuft"; z.attempts += 1; z.leaseExpiresAt = jetztMs + 300000;
    }
    return kandidaten;
  }

  abschliessen(zeile, jetztMs, erfolg = true) {
    zeile.status = erfolg ? "erledigt" : "wartend";
    zeile.leaseExpiresAt = null;
    if (erfolg) zeile.finishedAt = jetztMs;
  }

  // Genau die Mengen, die `erhebungsSql` liefert — inklusive der beiden
  // Fallstricke, die die Statusspalte NICHT zeigt.
  erhebung({ stufe, frischefenster, fensterStartMs, fensterEndeMs }) {
    const erlaubt = new Set(S.kennungenBisStufe(stufe));
    const klassen = {};
    for (const typ of F.PFLICHTKLASSEN) {
      const eigene = this.zeilen.filter((z) => z.jobType === typ
        && erlaubt.has(z.tenantId)
        && z.freshnessWindow === frischefenster);
      klassen[typ] = {
        wartend: eigene.filter((z) => z.status === "wartend" && z.attempts < z.maxAttempts).length,
        laufend: eigene.filter((z) => z.status === "laeuft").length,
        erledigt: eigene.filter((z) => z.status === "erledigt").length,
        endgueltigFehlerhaft: eigene.filter((z) => z.status === "fehlgeschlagen"
          || (z.status === "wartend" && z.attempts >= z.maxAttempts)).length,
        erledigtImTestfenster: eigene.filter((z) => z.status === "erledigt"
          && z.finishedAt !== null
          && z.finishedAt >= fensterStartMs && z.finishedAt <= fensterEndeMs).length
      };
    }
    return { gemessen: true, klassen };
  }
}

function befundMit(bestand, stufe = "a") {
  return F.faelligkeitsBefund({
    stufe, fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende,
    planungsZeitpunktMs: FENSTER.start, weitereAktiveMandate: REALE, bestand
  });
}

async function main() {
  console.log("=== VERTRAGSTEST DER ECHTEN ABLAUFKETTE (offline) ===");

  // ── A · Ausgangszustand: keine Kohortenaufträge ─────────────────────────
  // Genau der Production-Stand vom 02.09.: 0 Aufträge mit dem Präfix
  // `test-kohorte-`, in allen vier Statuswerten.
  console.log("\nA · Ausgangszustand ohne Kohortenaufträge (Production-Nullbasis 02.09.)");
  const q = new Warteschlange();
  const stufe = "a";
  const frischefenster = "2026-09-03T00Z";
  const leer = q.erhebung({ stufe, frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende });
  check("A1 die Erhebung liefert für BEIDE Pflichtklassen eine Zeile, auch bei null",
    Object.keys(leer.klassen).length === 2
      && F.PFLICHTKLASSEN.every((typ) => leer.klassen[typ] && leer.klassen[typ].wartend === 0));
  const a = befundMit(leer);
  check("A2 die Nullbasis ist eine GEMESSENE Null, nicht „nicht gemessen“",
    a.bestandGemessen === true);
  check("A3 sie beweist NICHT den Fachzyklus — nichts ist geplant",
    a.fachzyklusVollstaendig === false
      && a.bestand.every((b) => b.fehlend === b.erwartet));
  check("A4 und sie ist damit vom Zustand „alles fertig“ UNTERSCHEIDBAR",
    a.bestand.every((b) => b.erledigt === 0 && b.vorhanden === 0));

  // ── B · Startprüfung VOR jeder Planung ──────────────────────────────────
  console.log("\nB · Startprüfung vor der Planung — hier saß der Kreisschluss");
  const aufrufe = [];
  const deps = {
    rufeRouteAuf: async ({ pfad }) => { aufrufe.push(pfad); return { ok: true }; },
    jetztMs: () => FENSTER.start + 60000,
    warte: async () => {}
  };
  const env = {
    HELMUT_TESTKOHORTE_EXECUTE: "1",
    HELMUT_TESTKOHORTE_CONFIRM: S.startfreigabe(stufe, {}).erwartetesWort,
    CRON_SECRET: "offline-nur-injiziert", HELMUT_PUBLIC_URL: "https://offline.invalid"
  };
  const gesperrt = await Z.fuehreZyklusAus({
    modus: "scharf", env, startbereit: false, deps,
    startfensterBefund: { bewertbar: true, frei: true,
      startMinuteUtc: 21 * 60 + 36, endeMinuteUtc: 23 * 60 + 59 },
    jetztUtc: `${TAG}T22:00:00Z`
  });
  check("B1 ohne bestätigte Startbereitschaft wird die Pipeline NICHT gerufen",
    aufrufe.length === 0
      && gesperrt.blockadeGruende.includes("startbereitschaft-nicht-bestaetigt"));
  check("B2 die aufgerufene Route ist /api/cron/pipeline — Planung UND Verarbeitung",
    Z.ROUTEN.zyklus === "/api/cron/pipeline");
  // DER KERN DES BEFUNDS: die alte Statusbedingung hätte in Zustand A niemals
  // erfüllt werden können, weil dort gar keine Aufträge existieren.
  check("B3 in der Nullbasis ist der Fachzyklus nicht erfüllt — die Kette braucht "
    + "also einen Planungsschritt VOR der Startprüfung",
    a.fachzyklusVollstaendig === false);

  // ── C · Planung (rein rechnend) und D · Einreihung ──────────────────────
  console.log("\nC/D · Planung und idempotente Einreihung");
  const SD = require(path.join(ROOT, "lib/helmut/source-demand"));
  const kennungen = [...S.kennungenBisStufe(stufe)];
  const plan = SD.planeMandatsarbeit({
    profile: kennungen.map((id) => ({ id })), jetztMs: FENSTER.start, env: {}
  });
  const kohortenAuftraege = plan.auftraege.filter((x) => F.PFLICHTKLASSEN.includes(x.jobType));
  const ersteEinreihung = q.einreihen(kohortenAuftraege);
  check("C1 der ECHTE Planer erzeugt beide Pflichtklassen für jede Kennung",
    F.PFLICHTKLASSEN.every((typ) =>
      kohortenAuftraege.filter((x) => x.jobType === typ).length === kennungen.length),
    `${kohortenAuftraege.length} Aufträge für ${kennungen.length} Kennungen`);
  check("D1 die erste Einreihung legt alle Zeilen an",
    ersteEinreihung.neu === kohortenAuftraege.length && ersteEinreihung.vorhanden === 0);
  const zweiteEinreihung = q.einreihen(kohortenAuftraege);
  check("D2 eine ZWEITE Planung legt keine einzige Zeile nach (idempotent, Punkt 17d)",
    zweiteEinreihung.neu === 0 && zweiteEinreihung.vorhanden === kohortenAuftraege.length);
  const nachPlanung = befundMit(q.erhebung({ stufe, frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende }));
  check("D3 JETZT ist der Fachzyklus erfüllbar — der Kreisschluss ist aufgelöst",
    nachPlanung.fachzyklusVollstaendig === true);
  check("D4 der Lastbeweis ist dabei ausdrücklich NOCH NICHT erbracht",
    nachPlanung.lastbeweisVollstaendig === false);

  // ── E · Erste (teilweise) Verarbeitung ──────────────────────────────────
  console.log("\nE/F · Teilweise Verarbeitung und erneute Messung");
  const imFenster = FENSTER.start + 600000;
  const erste = q.beanspruchen({ jetztMs: imFenster, limit: 12 });
  for (const z of erste) q.abschliessen(z, imFenster, true);
  const teil = q.erhebung({ stufe, frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende });
  const bTeil = befundMit(teil);
  check("E1 nach der ersten Scheibe sind Aufträge erledigt und der Rest wartet",
    teil.klassen.mandate_projection.erledigt > 0
      && teil.klassen.mandate_projection.wartend > 0);
  check("F1 der Fachzyklus bleibt vollständig — Erledigtes zählt MIT (Punkt 6)",
    bTeil.fachzyklusVollstaendig === true);
  check("F2 die Restlast ist die TATSÄCHLICH ausstehende Arbeit, nicht die geplante Menge",
    bTeil.restlast.ausstehendGesamt === (2 * kennungen.length) - erste.length,
    `${bTeil.restlast.ausstehendGesamt} statt ${2 * kennungen.length}`);
  check("F3 der Lastbeweis ist weiterhin NICHT erbracht",
    bTeil.lastbeweisVollstaendig === false);

  // ── G · Fortsetzung bis zum vollständigen Abschluss ─────────────────────
  console.log("\nG/H · Fortsetzung und vollständiger Abschluss");
  let runden = 0;
  while (runden < 20) {
    const naechste = q.beanspruchen({ jetztMs: imFenster + runden * 60000, limit: 12 });
    if (!naechste.length) break;
    for (const z of naechste) q.abschliessen(z, imFenster + runden * 60000, true);
    runden += 1;
  }
  const fertig = q.erhebung({ stufe, frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende });
  const bFertig = befundMit(fertig);
  check("G1 am Ende ist jeder Auftrag erledigt",
    F.PFLICHTKLASSEN.every((typ) => fertig.klassen[typ].erledigt === kennungen.length
      && fertig.klassen[typ].wartend === 0 && fertig.klassen[typ].laufend === 0));
  check("H1 ein VOLLSTÄNDIG erledigter Zyklus gilt als vollständig — die alte "
    + "Fassung meldete hier `false`",
    bFertig.fachzyklusVollstaendig === true);
  check("H2 und JETZT ist auch der Lastbeweis erbracht",
    bFertig.lastbeweisVollstaendig === true);
  check("H3 die Restlast ist null",
    bFertig.restlast.ausstehendGesamt === 0);

  // ── I · Die Gegenprobe: Erledigtes VOR dem Fenster ──────────────────────
  // Auftrag Punkt 9: ein vor dem Nachtfenster erledigter Auftrag zählt für den
  // Fachzyklus, beweist aber NICHT die Belastbarkeit des Nachtfensters.
  console.log("\nI · Fachzyklus und Lastbeweis fallen auseinander");
  const frueh = new Warteschlange();
  frueh.einreihen(kohortenAuftraege);
  const vorFenster = FENSTER.start - 3600000;
  let sicherung = 0;
  while (sicherung < 40) {
    const n = frueh.beanspruchen({ jetztMs: vorFenster, limit: 20 });
    if (!n.length) break;
    for (const z of n) frueh.abschliessen(z, vorFenster, true);
    sicherung += 1;
  }
  const bFrueh = befundMit(frueh.erhebung({ stufe, frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende }));
  check("I1 alles vor dem Fenster erledigt: Fachzyklus JA",
    bFrueh.fachzyklusVollstaendig === true);
  check("I2 derselbe Zustand: Lastbeweis NEIN — das Fenster hat nichts getragen",
    bFrueh.lastbeweisVollstaendig === false);

  // ── J · Endgültige Fehler blockieren, fremde Zeilen retten nicht ────────
  console.log("\nJ · Endgültige Fehler und Doppelzählung");
  const kaputt = new Warteschlange();
  kaputt.einreihen(kohortenAuftraege);
  for (const z of kaputt.zeilen.filter((x) => x.jobType === "briefing_materialization").slice(0, 3)) {
    z.attempts = z.maxAttempts;                       // Versuche erschöpft
  }
  const bKaputt = befundMit(kaputt.erhebung({ stufe, frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende }));
  check("J1 `wartend` mit erschöpften Versuchen zählt als ENDGÜLTIGER Fehler, nicht als wartend",
    bKaputt.bestand.find((b) => b.jobType === "briefing_materialization")
      .endgueltigFehlerhaft === 3);
  check("J2 endgültige Fehler blockieren den Fachzyklus",
    bKaputt.fachzyklusVollstaendig === false);

  // Punkt 7: eine fehlende Pflichtklasse darf nicht durch fremde oder ältere
  // Aufträge grün werden.
  const fremd = new Warteschlange();
  fremd.einreihen(kohortenAuftraege.filter((x) => x.jobType === "mandate_projection"));
  // Ältere Aufträge desselben Typs, aber aus einem ANDEREN Frischefenster:
  for (const x of kohortenAuftraege.filter((x2) => x2.jobType === "briefing_materialization")) {
    fremd.einreihen([{ ...x, idempotencyKey: `${x.idempotencyKey}|alt`,
      freshnessWindow: "2026-09-02T00Z" }]);
  }
  const bFremd = befundMit(fremd.erhebung({ stufe, frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende }));
  check("J3 (Punkt 7/17a) Aufträge eines FRÜHEREN Frischefensters machen eine fehlende "
    + "Klasse nicht grün",
    bFremd.fachzyklusVollstaendig === false
      && bFremd.bestand.find((b) => b.jobType === "briefing_materialization").fehlend
        === kennungen.length);

  // Punkt 17b: eine andere Stufe darf nicht mitzählen.
  const stufeC = new Warteschlange();
  const planC = SD.planeMandatsarbeit({
    profile: [...S.kennungenBisStufe("c")].map((id) => ({ id })),
    jetztMs: FENSTER.start, env: {}
  });
  stufeC.einreihen(planC.auftraege.filter((x) => F.PFLICHTKLASSEN.includes(x.jobType)));
  const bStufeA = befundMit(stufeC.erhebung({ stufe: "a", frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende }), "a");
  check("J4 (Punkt 17b) eine Stufe-A-Erhebung zählt die Stufen B und C NICHT mit",
    bStufeA.bestand.every((b) => b.vorhanden === kennungen.length && b.ueberzaehlig === 0),
    `vorhanden ${bStufeA.bestand[0].vorhanden} statt 495`);

  // ── K · Lease-Rücklauf und Wiederholung ─────────────────────────────────
  console.log("\nK · Lease-Rücklauf, Zurückstellung, Wiederholung (Punkt 16)");
  const lease = new Warteschlange();
  lease.einreihen(kohortenAuftraege);
  const beansprucht = lease.beanspruchen({ jetztMs: imFenster, limit: 5 });
  const bLaufend = befundMit(lease.erhebung({ stufe, frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende }));
  check("K1 beanspruchte Aufträge erscheinen als `laufend`, nicht als verloren",
    bLaufend.bestand.reduce((n, b) => n + b.laufend, 0) === beansprucht.length);
  check("K2 sie zählen weiter zur ausstehenden Arbeit",
    bLaufend.restlast.ausstehendGesamt === 2 * kennungen.length);
  // Lease läuft ab, ohne dass jemand abgeschlossen hat.
  const spaeter = imFenster + 400000;
  lease.beanspruchen({ jetztMs: spaeter, limit: 0 });   // löst nur (a) und (b) aus
  const bZurueck = befundMit(lease.erhebung({ stufe, frischefenster,
    fensterStartMs: FENSTER.start, fensterEndeMs: FENSTER.ende }));
  check("K3 eine abgelaufene Lease bringt den Auftrag zurück nach `wartend`",
    bZurueck.bestand.reduce((n, b) => n + b.laufend, 0) === 0
      && bZurueck.restlast.ausstehendGesamt === 2 * kennungen.length);
  check("K4 der Fachzyklus bleibt dabei erfüllbar — nichts ging verloren",
    bZurueck.fachzyklusVollstaendig === true);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main();
