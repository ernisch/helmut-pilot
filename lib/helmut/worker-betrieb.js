"use strict";

// Helmut — WORKERBETRIEB: Start, Grenzen, Zustand (OP-30, finaler Abnahmesprint, Phase 6).
// =============================================================================================
// WAS DAS IST: der kleinste vollständige Workerbetrieb, den es braucht, damit die
// Warteschlange überhaupt abgearbeitet werden kann — begrenzte Parallelität, sauberes
// Herunterfahren, Health- und Readiness-Auskunft.
//
// WAS DAS AUSDRÜCKLICH NICHT IST: kein neuer Dienst, keine externe Infrastruktur, keine
// Konfiguration eines Hosters. Der Betrieb ist portabel: derselbe Code läuft als
// langlaufender Prozess (lokal, Container) UND als begrenzter Durchlauf innerhalb eines
// Zeitfensters (Serverless-Cron). Welche der beiden Formen der Betreiber wählt, ist eine
// Betreiberentscheidung — siehe `docs/betrieb/workerbetrieb.md`.
//
// ZWEI HARTE RIEGEL, beide fail closed:
//   1. Ohne `HELMUT_SCALABLE_PIPELINE` startet hier NICHTS.
//   2. Bei `HELMUT_SOURCE_MODE=off` findet KEIN externer Abruf statt — der Worker läuft
//      dann bewusst nur mit den Aufgabentypen, die ohne Netz auskommen, und sagt das.

const scalable = require("./scalable-pipeline");

// Aufgabentypen, die einen EXTERNEN Abruf auslösen. Bei abgeschaltetem Quellenmodus
// werden genau diese nicht angefasst — nicht „übersprungen", sondern gar nicht erst geholt.
const TYPEN_MIT_ABRUF = Object.freeze(["source_fetch"]);
// `tenant_narrative` (fuenfter Auftragstyp, E1 2026-08-09) loest keinen QUELLEN-Abruf aus —
// sein Modellaufruf laeuft durch die unveraenderten Gates der Bestandsfunktion
// (`lage.buildLageBriefing`) und ist bei ausgeschaltetem Narrativflag ein No-Op im Handler.
const ALLE_TYPEN = Object.freeze([
  "source_fetch", "document_understanding", "mandate_projection", "briefing_materialization",
  "tenant_narrative"
]);

function quellenmodusAus(env = process.env) {
  return String((env && env.HELMUT_SOURCE_MODE) || "").trim().toLowerCase() === "off";
}

// Umgebungsname -> Name der Aufrufer-Ueberschreibung. Eine Tabelle statt vier `if`s, damit
// die beiden Wege nicht auseinanderlaufen koennen.
const SCHLUESSEL = Object.freeze({
  HELMUT_WORKER_PARALLEL: "parallel",
  HELMUT_WORKER_BUDGET_MS: "budgetMs",
  HELMUT_WORKER_LEASE_MS: "leaseMs",
  HELMUT_WORKER_STAPEL: "stapel",
  HELMUT_WORKER_LEERLAUF_MS: "leerlaufWarteMs"
});

// Grenzen aus der Umgebung — und, seit der Verdrahtung (Befund O2), optional aus dem
// AUFRUFER. Der Cron kennt seine Restzeit im Slot; die Umgebung kennt sie nicht. Ein
// ausdruecklich uebergebener Wert hat deshalb Vorrang, wird aber in DIESELBEN harten
// Bereiche geklemmt wie ein Umgebungswert — ein Aufrufer kann keine unbegrenzte Lease,
// keine unbegrenzte Parallelitaet und keinen unbegrenzten Stapel erzwingen.
function grenzenAusEnv(env = process.env, ueberschreibungen = {}) {
  const zahl = (name, standard, min, max) => {
    const vorgabe = ueberschreibungen && ueberschreibungen[SCHLUESSEL[name]];
    const roh = vorgabe != null && vorgabe !== ""
      ? Number(vorgabe)
      : Number(String((env && env[name]) || "").trim());
    if (!Number.isFinite(roh) || roh <= 0) return standard;
    return Math.max(min, Math.min(max, Math.floor(roh)));
  };
  // Wie `zahl`, aber 0 ist ein gueltiger Wert (= Funktion aus) statt "nimm den Standard".
  const zahlAbNull = (name, standard, min, max) => {
    const vorgabe = ueberschreibungen && ueberschreibungen[SCHLUESSEL[name]];
    const roh = vorgabe != null && vorgabe !== ""
      ? Number(vorgabe)
      : Number(String((env && env[name]) || "").trim());
    if (!Number.isFinite(roh) || roh < 0) return standard;
    return Math.max(min, Math.min(max, Math.floor(roh)));
  };
  return {
    // Parallelität ist bewusst klein und hart gedeckelt. Der Engpass ist nicht die
    // Warteschlange (gemessen 2026-08-08: ein Worker 1.064,6 Auftraege/s, acht Worker
    // 4.093,1 — scripts/jobqueue-lasttest.js), sondern die Google-Drosselung — mehr Worker
    // helfen dort nicht, sie schaden.
    parallel: zahl("HELMUT_WORKER_PARALLEL", 2, 1, 8),
    budgetMs: zahl("HELMUT_WORKER_BUDGET_MS", 240000, 5000, 900000),
    leaseMs: zahl("HELMUT_WORKER_LEASE_MS", 120000, 10000, 900000),
    stapel: zahl("HELMUT_WORKER_STAPEL", 10, 1, 200),
    // Leerlaufwarten: Default 0 = aus (unveraendertes Verhalten). Nach oben hart auf 30 s
    // geklemmt — ein Aufrufer kann daraus keinen Dauerlauf machen.
    leerlaufWarteMs: zahlAbNull("HELMUT_WORKER_LEERLAUF_MS", 0, 0, 30000)
  };
}

// ── Zustandsauskunft ────────────────────────────────────────────────────────────────────
// `health` = läuft der Prozess? `readiness` = darf und kann er arbeiten?
// Die Trennung ist wichtig: ein Worker, der läuft, aber wegen fehlender Migration nichts
// tun kann, ist gesund und NICHT bereit. Wer beides vermischt, sieht den Unterschied nie.
function health({ gestartetMs = null, now = () => Date.now() } = {}) {
  return {
    zustand: "laeuft",
    laufzeitS: gestartetMs ? Math.round((now() - gestartetMs) / 1000) : 0,
    zeitpunkt: new Date(now()).toISOString()
  };
}

async function readiness({ env = process.env, deps = {} } = {}) {
  const flagAn = scalable.skalierbarerPfadAktiv(env);
  const grenzen = grenzenAusEnv(env);
  const abrufErlaubt = !quellenmodusAus(env);

  const gruende = [];
  if (!flagAn) gruende.push("flag-aus");
  if (!abrufErlaubt) gruende.push("quellenmodus-aus");

  let warteschlange = { verfuegbar: false, grund: "nicht-geprueft" };
  if (flagAn) {
    try {
      const status = await scalable.betriebsstatus({ env, deps });
      warteschlange = status && status.verfuegbar
        ? { verfuegbar: true, zustand: status.zustand, kennzahlen: status.kennzahlen }
        : { verfuegbar: false, grund: (status && status.grund) || "unbekannt" };
      if (!warteschlange.verfuegbar) gruende.push(`warteschlange:${warteschlange.grund}`);
    } catch (error) {
      warteschlange = { verfuegbar: false, grund: String((error && error.message) || "fehler").slice(0, 120) };
      gruende.push(`warteschlange:${warteschlange.grund}`);
    }
  }

  return {
    bereit: flagAn && warteschlange.verfuegbar === true,
    // EHRLICH: warum NICHT bereit — nie ein blosses false.
    gruende,
    flag: flagAn,
    abrufErlaubt,
    grenzen,
    warteschlange,
    // Welche Aufgabentypen wuerde dieser Worker anfassen?
    typen: abrufErlaubt ? ALLE_TYPEN : ALLE_TYPEN.filter((t) => !TYPEN_MIT_ABRUF.includes(t))
  };
}

// ── Der Betrieb ─────────────────────────────────────────────────────────────────────────
// EIN Durchlauf mit begrenzter Parallelität. Das ist die portable Einheit: lokal ruft eine
// Schleife sie wiederholt auf, im Serverless-Cron ruft der Cron sie einmal je Fenster auf.
async function durchlauf({
  env = process.env, deps = {}, kennung = null,
  // VERDRAHTUNG (Befund O2): der Cron kennt seine Restzeit, die Umgebung nicht. Diese vier
  // Werte durchlaufen dieselbe Klemmung wie die Umgebungswerte.
  grenzen = null,
  // OP-30/O1: der Tagesplan des Schedulers, damit die Budgetschicht echte Bereichsdeckel
  // bekommt statt `scopeMax: null`.
  tagesplan = null,
  // FUENFTER AUFTRAGSTYP (E1): ein Aufrufer darf die Typmenge EINSCHRAENKEN — der Cron
  // `lage-briefing` arbeitet in seinem Slot ausschliesslich `tenant_narrative` ab. Die
  // Vorgabe kann die Menge nur VERKLEINERN, nie erweitern: unbekannte Typen und (bei
  // abgeschaltetem Quellenmodus) Abruftypen bleiben ausgeschlossen.
  typen: typenVorgabe = null
} = {}) {
  if (!scalable.skalierbarerPfadAktiv(env)) {
    return { gestartet: false, grund: "flag-aus", worker: 0, erledigt: 0 };
  }
  const g = grenzenAusEnv(env, grenzen || {});
  const basisTypen = quellenmodusAus(env) ? ALLE_TYPEN.filter((t) => !TYPEN_MIT_ABRUF.includes(t)) : null;
  let typen = basisTypen;
  if (Array.isArray(typenVorgabe) && typenVorgabe.length) {
    const erlaubt = new Set(basisTypen || ALLE_TYPEN);
    typen = typenVorgabe.map(String).filter((t) => erlaubt.has(t));
    if (!typen.length) {
      // EHRLICH: eine Vorgabe, die nur auf Unerlaubtes zeigt, startet nichts — und sagt warum.
      return { gestartet: false, grund: "keine-erlaubten-typen", worker: 0, erledigt: 0 };
    }
  }

  const laeufe = [];
  for (let i = 0; i < g.parallel; i += 1) {
    laeufe.push(scalable.arbeite({
      env, deps, tagesplan,
      owner: `${kennung || "worker"}-${i}`,
      budgetMs: g.budgetMs, leaseMs: g.leaseMs, stapel: g.stapel,
      leerlaufWarteMs: g.leerlaufWarteMs,
      types: typen
    }));
  }
  const bilanzen = await Promise.all(laeufe);
  const summe = (feld) => bilanzen.reduce((s, b) => s + (Number(b && b[feld]) || 0), 0);
  return {
    gestartet: true,
    worker: g.parallel,
    grenzen: g,
    quellenmodusAus: quellenmodusAus(env),
    typen: typen || "alle",
    reserviert: summe("reserviert"),
    erledigt: summe("erledigt"),
    wiederholt: summe("wiederholt"),
    zurueckgestellt: summe("zurueckgestellt"),
    endgueltigFehlgeschlagen: summe("endgueltigFehlgeschlagen"),
    leaseVerloren: summe("leaseVerloren"),
    leerlaufWarten: summe("leerlaufWarten"),
    bilanzen
  };
}

// Langlaufender Betrieb mit SAUBEREM Herunterfahren. `stopSignal()` wird zwischen zwei
// Durchläufen geprüft — ein laufender Durchlauf wird nie mittendrin abgebrochen, weil genau
// das Aufträge in der Schwebe liesse (die Lease müsste dann erst ablaufen).
async function betreibe({
  env = process.env, deps = {}, kennung = null,
  stopSignal = () => false, maxDurchlaeufe = Infinity,
  pauseMs = 0, now = () => Date.now(), grenzen = null, tagesplan = null
} = {}) {
  const start = now();
  const bilanz = { durchlaeufe: 0, erledigt: 0, zurueckgestellt: 0, gestoppt: false, grund: null };
  if (!scalable.skalierbarerPfadAktiv(env)) {
    return { ...bilanz, gestartet: false, grund: "flag-aus" };
  }
  while (bilanz.durchlaeufe < maxDurchlaeufe) {
    if (stopSignal()) { bilanz.gestoppt = true; bilanz.grund = "stopsignal"; break; }
    const d = await durchlauf({ env, deps, kennung, grenzen, tagesplan });
    bilanz.durchlaeufe += 1;
    bilanz.erledigt += d.erledigt || 0;
    bilanz.zurueckgestellt += d.zurueckgestellt || 0;
    // Nichts mehr zu tun -> sauberes Ende statt Leerlauf.
    if ((d.reserviert || 0) === 0) { bilanz.grund = "warteschlange-leer"; break; }
    if (pauseMs > 0 && !stopSignal()) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return { ...bilanz, gestartet: true, laufzeitMs: now() - start };
}

module.exports = {
  ALLE_TYPEN, TYPEN_MIT_ABRUF, SCHLUESSEL,
  quellenmodusAus, grenzenAusEnv,
  health, readiness, durchlauf, betreibe
};
