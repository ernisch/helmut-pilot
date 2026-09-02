"use strict";

// Helmut — DER STARTWEG DES FACHZYKLUS (500er-Funktionstest).
// =============================================================================
// WAS BISHER FEHLTE (Reviewbefund 02.09., am Kopf 331859a nachgeprüft):
// Schritt 14 des Ablaufplans trug als Befehl „bestehender Motor (Cron-Antrieb) —
// kein eigener Befehl". Das war eine STILLE ANNAHME, und sie ist falsch:
//
//   TATSACHE: Der Pipeline-Cron läuft `0 16 * * *`, also 16:00 UTC (vercel.json).
//   TATSACHE: Das errechnete sichere Startfenster endet 15:59 UTC.
//   FOLGE:    Innerhalb des sicheren Fensters läuft der Motor NIE. Das Fenster
//             ist ja gerade so bestimmt, dass es KEINEN Bestandscron enthält.
//
// Der Fachzyklus war damit weder von Hand startbar noch lief er von selbst — die
// zentrale Ebene des Tests hatte keinen Auslöser.
//
// ─── WARUM DAS OHNE MOTORÄNDERUNG GEHT ──────────────────────────────────────
// In Production ist `HELMUT_SCALABLE_PIPELINE=on`. `cronSchwererPfad` verzweigt
// dann ausnahmslos in `runCronUeberWarteschlange` (server.js) — Planung plus
// Abarbeitung der dauerhaften Warteschlange. Diese Warteschlange trägt BEIDE
// Arbeitsklassen: geteilte Arbeit (Crawl, Verstehen) und mandatsgebundene
// (Projektion, Briefing-Materialisierung). Ein Aufruf der bestehenden Route
// `/api/cron/pipeline` treibt also denselben vollständigen Zyklus an wie der
// Cron — nur zu einem Zeitpunkt, den der Betreiber wählt.
//
// Es wird deshalb KEIN Cron geändert, KEIN Motor angefasst und KEINE neue Route
// gebaut. Dieses Modul ruft ausschließlich eine bestehende, bereits durch
// CRON_SECRET geschützte Route auf — in Scheiben, begrenzt, abbrechbar.
//
// ─── DIE RIEGEL ─────────────────────────────────────────────────────────────
//   1. TROCKENLAUF IST STANDARD. Ohne scharfen Modus wird KEIN Netzaufruf
//      gemacht — der Trockenlauf beschreibt nur, was geschähe.
//   2. EIGENE FREIGABE: `HELMUT_TESTKOHORTE_EXECUTE` UND
//      `HELMUT_TESTKOHORTE_CONFIRM=TESTKOHORTE_FACHZYKLUS_STARTEN_BESTAETIGT`.
//      Kein anderes Wort schaltet diesen Schritt scharf.
//   3. FENSTER: der Lauf beginnt nur in einem geprüften Fenster, das JETZT gilt,
//      und er endet SPÄTESTENS mit dem Fenster — die letzte Scheibe wird gar
//      nicht erst begonnen, wenn sie über das Fensterende hinausliefe.
//   4. ROUTENLISTE: es sind ausschließlich die hier fest eingetragenen Routen
//      aufrufbar. Ein freier Pfad ist nicht vorgesehen.
//   5. ABBRUCH: eine fehlgeschlagene Scheibe beendet den Lauf. Der Zyklus ist
//      wiederholbar (die Warteschlange ist dauerhaft und idempotent), ein
//      blindes Weiterlaufen nach einem Fehler wäre es nicht.
//
// ─── WAS DIESES MODUL AUSDRÜCKLICH NICHT TUT ────────────────────────────────
// Es treibt NICHT die mandatsgebundenen Briefing-Routen an
// (`/api/cron/morning-briefing`, `/api/cron/lage-briefing`). Die wirken auf die
// FÜNF REALEN Mandate und erzeugten Briefings zu einer unüblichen Stunde. Das
// ist eine eigene Entscheidung und gehört nicht in den Zyklusstart.

const { EXECUTE_FLAG, CONFIRM_VARIABLE, FREIGABEWORTE, MODUS_TROCKENLAUF, MODUS_SCHARF, freigabe }
  = require("./testkohorte-betrieb");
const kapazitaet = require("./kapazitaet-500");

const SCHRITT = "fachzyklus";

// Die EINZIGEN aufrufbaren Routen. `/api/cron/pipeline` ist der vollständige
// Warteschlangenlauf (Planung + Abarbeitung). `/api/cron/pipeline-status` ist
// rein lesend und darf deshalb auch im Trockenlauf gedacht werden.
const ROUTEN = Object.freeze({
  zyklus: "/api/cron/pipeline",
  status: "/api/cron/pipeline-status"
});

// Harte Grenze einer Route (server.js: withTimeout 280000 < maxDuration 300).
const SCHEIBE_MS = kapazitaet.SCHEIBE_MS;

function minuteAusUtcLokal(zeitpunkt) {
  if (zeitpunkt === null || zeitpunkt === undefined || zeitpunkt === "") return null;
  const d = zeitpunkt instanceof Date ? zeitpunkt : new Date(String(zeitpunkt));
  if (!Number.isFinite(d.getTime())) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// Derselbe Fenstervertrag wie im Vorwärtsausführer: geprüft UND jetzt gültig.
function fensterBefund(startfensterBefund, jetztUtc) {
  const gepruefteCrons = startfensterBefund && Number.isFinite(startfensterBefund.gepruefteCrons)
    ? startfensterBefund.gepruefteCrons : 0;
  if (!startfensterBefund) return { frei: false, grund: "startfenster-nicht-geprueft", gepruefteCrons };
  if (gepruefteCrons <= 0) return { frei: false, grund: "startfenster-ohne-cronliste", gepruefteCrons };
  if (startfensterBefund.startErlaubt !== true) return { frei: false, grund: "startfenster-konflikt", gepruefteCrons };
  const jetzt = minuteAusUtcLokal(jetztUtc);
  if (jetzt === null) return { frei: false, grund: "startzeit-fehlt", gepruefteCrons };
  const von = Number(startfensterBefund.startMinuteUtc);
  const bis = Number(startfensterBefund.endeMinuteUtc);
  if (!Number.isFinite(von) || !Number.isFinite(bis)) {
    return { frei: false, grund: "startfenster-ohne-grenzen", gepruefteCrons };
  }
  const jetztVerschoben = jetzt >= von ? jetzt : jetzt + 1440;
  const drin = jetztVerschoben >= von && jetztVerschoben < bis;
  return drin
    ? { frei: true, grund: "fenster-gilt-jetzt", gepruefteCrons, jetztMinuteUtc: jetzt, restMinuten: bis - jetztVerschoben }
    : { frei: false, grund: "startzeit-ausserhalb-des-fensters", gepruefteCrons, jetztMinuteUtc: jetzt };
}

// ═══════════════════════════════════════════════════════════════════════════
// WELCHE ARBEIT IST IM FENSTER ÜBERHAUPT FÄLLIG? (ergänzt 02.09.)
// ═══════════════════════════════════════════════════════════════════════════
//
// DER BEFUND, der diesen Block nötig macht: Ein Auftrag wird erst bearbeitet,
// wenn er FÄLLIG ist (`helmut_claim_jobs` nimmt ausschließlich fällige Aufträge).
// Die mandatsgebundene Arbeit hat feste Phasenfenster im 24-Stunden-Frischefenster
// (`source-demand.MANDATSPHASEN`, die einzige Quelle dieser Zahlen):
//
//   mandate_projection         50 %–75 %  ⇒ 12:00–18:00 UTC
//   briefing_materialization   75 %–90 %  ⇒ 18:00–21:36 UTC
//
// Das empfohlene sichere Fenster ist 11:36–15:59 UTC. Daraus folgt zwingend:
//
//   * Von der Projektion sind rund zwei Drittel im Fenster fällig.
//   * Von der BRIEFINGMATERIALISIERUNG ist NICHTS im Fenster fällig — sie beginnt
//     zwei Stunden nach dem Fensterende. Die sichtbare Produktstufe je Mandat
//     entsteht im sicheren Fenster also GAR NICHT.
//
// Das ist kein Kapazitäts- und kein Budgetproblem, sondern ein struktureller
// Zeitkonflikt, und es ist mit KEINEM Aufruf bestehender Routen zu umgehen. Es
// aufzulösen bräuchte eine Änderung an Phasenfenstern (Code),
// `HELMUT_DEMAND_TENANT_MAX_AGE_H` (Umgebung) oder der Cronliste — alle drei sind
// nach CLAUDE.md §5 getrennt freigabepflichtig und in diesem Auftrag verboten.
//
// Diese Funktion rechnet das aus, statt es zu behaupten.
function arbeitsklassenImFenster({
  fensterStartMinuteUtc = null,
  fensterEndeMinuteUtc = null,
  fensterBreiteStunden = 24,
  phasen = null
} = {}) {
  const von = Number(fensterStartMinuteUtc);
  const bis = Number(fensterEndeMinuteUtc);
  const breite = Number(fensterBreiteStunden);
  if (!Number.isFinite(von) || !Number.isFinite(bis) || bis <= von
      || !Number.isFinite(breite) || breite <= 0) {
    return Object.freeze({ bewertbar: false, grund: "Fenstergrenzen oder Frischefensterbreite fehlen" });
  }
  const liste = Array.isArray(phasen) ? phasen : require("./source-demand").MANDATSPHASEN;
  const breiteMin = breite * 60;
  const klassen = liste.map(([typ, , ab, bisAnteil]) => {
    const phaseVon = ab * breiteMin;
    const phaseBis = bisAnteil * breiteMin;
    const ueberlappVon = Math.max(von, phaseVon);
    const ueberlappBis = Math.min(bis, phaseBis);
    const ueberlapp = Math.max(0, ueberlappBis - ueberlappVon);
    const phasenBreite = Math.max(1, phaseBis - phaseVon);
    return Object.freeze({
      jobType: typ,
      faelligVonMinuteUtc: Math.round(phaseVon),
      faelligBisMinuteUtc: Math.round(phaseBis),
      ueberlappMinuten: Math.round(ueberlapp),
      anteilImFenster: Math.round((ueberlapp / phasenBreite) * 1000) / 1000,
      imFensterFaellig: ueberlapp > 0
    });
  });
  const ohne = klassen.filter((k) => !k.imFensterFaellig).map((k) => k.jobType);
  return Object.freeze({
    bewertbar: true,
    fensterStartMinuteUtc: von,
    fensterEndeMinuteUtc: bis,
    fensterBreiteStunden: breite,
    klassen: Object.freeze(klassen),
    nichtImFensterFaellig: Object.freeze(ohne),
    // DIE Frage: entsteht im Fenster die sichtbare Produktstufe je Mandat?
    sichtbareProduktstufeErreichbar: klassen
      .some((k) => k.jobType === "briefing_materialization" && k.imFensterFaellig),
    meldung: ohne.length === 0
      ? "Jede mandatsgebundene Arbeitsklasse ist im Fenster mindestens teilweise fällig."
      : `NICHT im Fenster fällig: ${ohne.join(", ")}. Diese Arbeit entsteht im gewählten `
        + "Fenster überhaupt nicht — unabhängig von Budget, Parallelität und Aufrufzahl."
  });
}

// ── WELCHES SICHERE FENSTER TRÄGT EINEN VOLLSTÄNDIGEN ZYKLUS? ───────────────
//
// Die beiden Tore — „ist die sichtbare Produktstufe fällig?" und „passt der
// Bedarf in die Zeit?" — greifen an verschiedenen Fenstern verschieden. Diese
// Funktion bewertet ALLE freien Fenster gegen BEIDE Tore, statt eines
// herauszugreifen. Sie rechnet nur; sie wählt nichts aus.
//
// BELEGTES ERGEBNIS für die 13 Bestandscrons (Stand 02.09.):
//   * Bei Parallelität 1 besteht KEIN einziges Fenster beide Tore.
//   * Bei Parallelität 2 besteht genau eines beide: 17:36–19:59 UTC.
//   * Das empfohlene Tagesfenster 11:36–15:59 erreicht die Produktstufe NIE —
//     dort ist die Briefingmaterialisierung noch nicht fällig.
// Daraus folgt der einzige heute belegbare Ablauf: ZWEI Fenster nacheinander,
// erst 11:36–15:59 für Abruf/Verstehen/Projektion, dann 17:36–19:59 für die
// Briefings. Beide Voraussetzungen — Parallelität 2 und die Teilabdeckung —
// sind getrennte Betreiberentscheidungen und in diesem Sprint NICHT getroffen.
function bewerteFensterFuerZyklus({
  fenster = null,
  parallel = 1,
  szenario = "konservativ",
  maxAnfragenJeMinute = null
} = {}) {
  const liste = Array.isArray(fenster) ? fenster : [];
  if (!liste.length) {
    return Object.freeze({ bewertbar: false, grund: "keine Fensterliste übergeben", fenster: Object.freeze([]) });
  }
  const minute = (text) => {
    const treffer = /^(\d{1,2}):(\d{2})$/.exec(String(text || "").trim());
    return treffer ? Number(treffer[1]) * 60 + Number(treffer[2]) : null;
  };
  const bewertet = liste.map((f) => {
    const von = minute(f && f.startUtc);
    const dauer = Number(f && f.dauerMinuten);
    if (von === null || !Number.isFinite(dauer) || dauer <= 0) {
      return Object.freeze({ startUtc: (f && f.startUtc) || null, bewertbar: false });
    }
    const klassen = arbeitsklassenImFenster({
      fensterStartMinuteUtc: von, fensterEndeMinuteUtc: von + dauer
    });
    const zyklus = kapazitaet.zyklusPasstInsFenster({
      fensterMinuten: dauer, parallel, szenario, maxAnfragenJeMinute
    });
    return Object.freeze({
      bewertbar: true,
      startUtc: f.startUtc,
      endeUtc: f.endeUtc,
      dauerMinuten: dauer,
      ueberMitternacht: Boolean(f.ueberMitternacht),
      produktstufeFaellig: klassen.bewertbar === true && klassen.sichtbareProduktstufeErreichbar === true,
      anteilBriefing: klassen.bewertbar
        ? (klassen.klassen.find((k) => k.jobType === "briefing_materialization") || {}).anteilImFenster
        : null,
      anteilProjektion: klassen.bewertbar
        ? (klassen.klassen.find((k) => k.jobType === "mandate_projection") || {}).anteilImFenster
        : null,
      zyklusPasst: zyklus.bewertbar === true && zyklus.passt === true,
      benoetigteAufrufe: zyklus.bewertbar ? zyklus.benoetigteAufrufe : null,
      moeglicheAufrufe: zyklus.bewertbar ? zyklus.moeglicheAufrufe : null,
      // BEIDE Tore, nicht eines.
      traegtVollstaendigenZyklus: Boolean(
        klassen.bewertbar === true && klassen.sichtbareProduktstufeErreichbar === true
        && zyklus.bewertbar === true && zyklus.passt === true
      )
    });
  });
  const tragende = bewertet.filter((b) => b.bewertbar && b.traegtVollstaendigenZyklus);
  return Object.freeze({
    bewertbar: true,
    parallel: Math.max(1, Math.floor(Number(parallel) || 1)),
    szenario,
    fenster: Object.freeze(bewertet),
    tragendeFenster: Object.freeze(tragende.map((b) => b.startUtc)),
    gibtEinTragendesFenster: tragende.length > 0,
    meldung: tragende.length > 0
      ? `${tragende.length} Fenster trägt/tragen bei Parallelität ${parallel} einen vollständigen `
        + `Zyklus: ${tragende.map((b) => `${b.startUtc}-${b.endeUtc}`).join(", ")}.`
      : `KEIN einziges freies Fenster trägt bei Parallelität ${parallel} einen vollständigen Zyklus. `
        + "Entweder ist die sichtbare Produktstufe darin nicht fällig, oder der Bedarf passt "
        + "nicht in die Zeit — oft beides."
  });
}

// DER PLAN EINES LAUFS — rein rechnerisch, ohne jeden Aufruf.
// Er sagt, wie viele Scheiben in die verbleibende Fensterzeit passen und was ein
// Lauf höchstens leisten kann. Auch der scharfe Lauf geht durch genau diesen Plan.
function planeZyklus({ restMinuten = null, parallel = 1, maxScheiben = null } = {}) {
  const rest = Number(restMinuten);
  if (!Number.isFinite(rest) || rest <= 0) {
    return Object.freeze({ bewertbar: false, grund: "verbleibende Fensterzeit unbekannt", scheiben: 0 });
  }
  const restMs = rest * 60000;
  const passend = Math.floor(restMs / SCHEIBE_MS);
  const grenze = Number.isFinite(Number(maxScheiben)) && Number(maxScheiben) > 0
    ? Math.min(passend, Math.floor(Number(maxScheiben)))
    : passend;
  const p = Math.max(1, Math.floor(Number(parallel) || 1));
  return Object.freeze({
    bewertbar: true,
    restMinuten: rest,
    scheibeMs: SCHEIBE_MS,
    scheibenMoeglich: passend,
    scheiben: grenze,
    parallel: p,
    aufrufeJeScheibe: Math.floor(p * SCHEIBE_MS / kapazitaet.LAUFZEIT_JE_AUFRUF_MS),
    aufrufeGesamtHoechstens: grenze * Math.floor(p * SCHEIBE_MS / kapazitaet.LAUFZEIT_JE_AUFRUF_MS)
  });
}

// DER AUSFÜHRER.
//
// deps.rufeRouteAuf({ pfad, basisUrl, secret })  → { ok, status, körper }
// deps.jetztMs()                                 → Uhr (injizierbar)
// deps.warte(ms)                                 → Pause zwischen Scheiben
//
// Alle drei sind injizierbar, damit dieser Ablauf OFFLINE vollständig prüfbar
// ist, ohne je ein Netz zu berühren.
async function fuehreZyklusAus({
  modus = MODUS_TROCKENLAUF,
  env = process.env,
  startfensterBefund = null,
  jetztUtc = null,
  parallel = 1,
  maxScheiben = null,
  startbereit = null,
  deps = {}
} = {}) {
  const erlaubnis = freigabe(SCHRITT, env);
  const gewuenscht = String(modus || MODUS_TROCKENLAUF).trim().toLowerCase();
  if (gewuenscht !== MODUS_TROCKENLAUF && gewuenscht !== MODUS_SCHARF) {
    const fehler = new Error(`Fachzyklus: Modus muss ${MODUS_TROCKENLAUF} oder ${MODUS_SCHARF} sein`);
    fehler.grund = "modus";
    throw fehler;
  }
  const fenster = fensterBefund(startfensterBefund, jetztUtc);
  const plan = planeZyklus({ restMinuten: fenster.restMinuten, parallel, maxScheiben });

  // Die Startbereitschaft ist EINGABE (aus `funktionstest-500.startbereitschaft`),
  // nicht Selbstauskunft. `null` heißt „nicht geprüft" und ist NICHT „bereit".
  const bereit = startbereit === true;

  const blockade = [
    ...(erlaubnis.erteilt ? [] : ["freigabe-fehlt"]),
    ...(fenster.frei ? [] : [fenster.grund]),
    ...(bereit ? [] : ["startbereitschaft-nicht-bestaetigt"]),
    ...(plan.bewertbar && plan.scheiben > 0 ? [] : ["keine-scheibe-passt-mehr-ins-fenster"])
  ];
  const wirksam = gewuenscht === MODUS_SCHARF && blockade.length === 0 ? MODUS_SCHARF : MODUS_TROCKENLAUF;

  const scheiben = [];
  let erfolgreich = 0;
  let fehlgeschlagen = 0;
  let abgebrochen = null;

  if (wirksam === MODUS_SCHARF) {
    // Die Zugangsdaten kommen AUSSCHLIESSLICH aus der Umgebung (CLAUDE.md §9).
    // Dieses Modul liest keine Datei und kennt keinen Vorgabewert.
    const secret = String(env.CRON_SECRET || "").trim();
    const basisUrl = String(env.HELMUT_PUBLIC_URL || "").trim().replace(/\/+$/, "");
    if (!secret || !basisUrl) {
      return Object.freeze({
        werkzeug: "fachzyklus", schritt: SCHRITT, modus: MODUS_TROCKENLAUF, modusGewuenscht: gewuenscht,
        freigabe: erlaubnis, startfenster: Object.freeze(fenster), plan,
        blockadeGruende: Object.freeze([...blockade, "zugangsdaten-fehlen"]),
        scheiben: Object.freeze([]), erfolgreich: 0, fehlgeschlagen: 0, ok: false,
        meldung: "Abbruch vor jedem Aufruf: CRON_SECRET und/oder HELMUT_PUBLIC_URL fehlen in der "
          + "Umgebung. Beide werden ausschließlich aus process.env gelesen (CLAUDE.md §9)."
      });
    }
    const rufeRouteAuf = deps.rufeRouteAuf || standardAufruf;
    const jetztMs = deps.jetztMs || (() => Date.now());
    const warte = deps.warte || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const beginn = jetztMs();
    const spaetestensMs = beginn + (fenster.restMinuten * 60000);

    for (let i = 0; i < plan.scheiben; i += 1) {
      // Eine Scheibe wird NICHT begonnen, wenn sie über das Fensterende
      // hinausliefe. Lieber eine Scheibe weniger als eine über der Grenze.
      if (jetztMs() + SCHEIBE_MS > spaetestensMs) {
        abgebrochen = "fensterende-erreicht";
        break;
      }
      let antwort = null;
      let fehler = null;
      try {
        antwort = await rufeRouteAuf({ pfad: ROUTEN.zyklus, basisUrl, secret });
      } catch (error) {
        fehler = String((error && error.message) || error || "unbekannt").slice(0, 160);
      }
      const gut = Boolean(antwort && antwort.ok === true);
      if (gut) erfolgreich += 1; else fehlgeschlagen += 1;
      scheiben.push(Object.freeze({
        nummer: i + 1,
        ok: gut,
        status: antwort && antwort.status !== undefined ? antwort.status : null,
        fehler,
        // Der Körper wird NICHT vollständig übernommen — er kann Kennungen tragen.
        kennzahlen: antwort && antwort.koerper && typeof antwort.koerper === "object"
          ? Object.freeze({
            tenants: antwort.koerper.tenants ?? null,
            bounded: antwort.koerper.bounded ?? null,
            reason: antwort.koerper.reason ?? null
          })
          : null
      }));
      if (!gut) { abgebrochen = "scheibe-fehlgeschlagen"; break; }
      if (i + 1 < plan.scheiben) await warte(1000);
    }
  }

  const ok = wirksam === MODUS_SCHARF && fehlgeschlagen === 0 && erfolgreich > 0;
  return Object.freeze({
    werkzeug: "fachzyklus",
    schritt: SCHRITT,
    modusGewuenscht: gewuenscht,
    modus: wirksam,
    freigabe: erlaubnis,
    startfenster: Object.freeze(fenster),
    plan,
    route: ROUTEN.zyklus,
    treibtMandatsgebundeneBriefingRoutenAn: false,
    blockadeGruende: Object.freeze(blockade),
    scheiben: Object.freeze(scheiben),
    erfolgreich,
    fehlgeschlagen,
    abgebrochen,
    ok,
    meldung: wirksam === MODUS_TROCKENLAUF
      ? `Trockenlauf: es wäre ${plan.bewertbar ? plan.scheiben : 0}-mal ${ROUTEN.zyklus} aufgerufen worden. `
        + `${blockade.length ? `Offen: ${blockade.join(", ")}.` : erlaubnis.meldung} Kein Netzaufruf.`
      : (ok
        ? `Fachzyklus gelaufen: ${erfolgreich} Scheiben erfolgreich, 0 fehlgeschlagen`
          + `${abgebrochen ? ` (beendet: ${abgebrochen})` : ""}.`
        : `Fachzyklus ABGEBROCHEN nach ${erfolgreich} erfolgreichen Scheiben: ${abgebrochen || "unbekannt"}. `
          + "Die Warteschlange ist dauerhaft und idempotent — ein Wiederholungslauf setzt fort.")
  });
}

// Der echte Aufruf. Bewusst am Ende und klein: alles darüber ist prüfbar, ohne
// diese Funktion je zu betreten.
async function standardAufruf({ pfad, basisUrl, secret }) {
  const antwort = await fetch(`${basisUrl}${pfad}`, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` }
  });
  let koerper = null;
  try { koerper = await antwort.json(); } catch { koerper = null; }
  return { ok: antwort.ok, status: antwort.status, koerper };
}

module.exports = {
  SCHRITT,
  ROUTEN,
  SCHEIBE_MS,
  EXECUTE_FLAG,
  CONFIRM_VARIABLE,
  FREIGABEWORT: FREIGABEWORTE[SCHRITT],
  MODUS_TROCKENLAUF,
  MODUS_SCHARF,
  fensterBefund,
  arbeitsklassenImFenster,
  bewerteFensterFuerZyklus,
  planeZyklus,
  fuehreZyklusAus
};
