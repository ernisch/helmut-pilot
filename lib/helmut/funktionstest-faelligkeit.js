"use strict";

// Helmut — DAS FÄLLIGKEITSTOR DES 500er-FUNKTIONSTESTS.
// =============================================================================
// BETREIBERENTSCHEIDUNG 02.09.: Das Startfenster-Tor prüft ab jetzt die
// FÄLLIGKEIT — genau wie der Warteschlangenmotor. Maßgeblich ist, ob ein Auftrag
// nach `due_at <= jetzt` vom Motor beansprucht werden kann.
//
// ─── WAS DAS ALTE TOR PRÜFTE UND WARUM ES FALSCH WAR ────────────────────────
// `funktionstest-zyklus.arbeitsklassenImFenster` rechnete eine SCHNITTMENGE des
// Testfensters mit dem Streuintervall der Phase:
//     ueberlapp = max(0, min(fensterEnde, phaseBis) − max(fensterStart, phaseVon))
//     imFensterFaellig = ueberlapp > 0
// Das beantwortet die Frage „wird in diesem Fenster ERSTMALS fällig".
//
// Der Motor stellt eine andere Frage (`helmut_claim_jobs`, Migration
// `20260808_scalable_job_queue.sql`):
//     where j.status = 'wartend' and j.due_at <= v_now and j.attempts < j.max_attempts
//     order by j.priority asc, j.due_at asc, j.created_at asc
// Das ist „ist JETZT beanspruchbar". Ein Auftrag, dessen Fälligkeit VOR dem
// Fenster lag und der noch nicht abgearbeitet ist, ist im Fenster beanspruchbar —
// das alte Tor meldete für ihn „nicht fällig".
//
// Die beiden Fragen fallen genau dann auseinander, wenn ein Fenster NACH einer
// Phase liegt. Betroffen ist das Nachtfenster 21:36–03:59 UTC (Türkei
// 00:36–06:59, Berlin 23:36–05:59): dort ist die Briefingphase (18:00–21:36)
// vollständig VORBEI, also überlappungsfrei — und zugleich sind alle ihre
// Aufträge fällig.
//
// ─── DREI DINGE, DIE DIESES MODUL AUSDRÜCKLICH NICHT TUT ────────────────────
//  1. Es baut KEINE zweite Phasenlogik. Die Fälligkeiten kommen aus
//     `source-demand.planeMandatsarbeit` — derselben reinen Planungsfunktion, die
//     auch `scalable-pipeline.planeArbeit` in Production benutzt. Es gibt keine
//     nachgebauten Prozentzahlen und keine fest eingebauten Ersatzwerte.
//  2. Es unterstellt NICHT „100 % fällig". Gerechnet wird datumsgenau,
//     kohortengenau und gegen den tatsächlichen Fensterbeginn und -ende.
//  3. Es meldet KEINEN vollständigen Zyklus aus Planungsdaten allein. Fälligkeit
//     ist eine notwendige, keine hinreichende Bedingung — siehe §„Die Grenze".
//
// ─── DIE GRENZE, DIE DIESES MODUL NICHT ÜBERSCHREITEN KANN ──────────────────
// Der Motor verlangt `status = 'wartend'` UND `due_at <= now`. Die Fälligkeit ist
// aus dem Plan exakt berechenbar. Der STATUS ist es nicht: ob ein Auftrag noch
// offen ist, hängt davon ab, ob ein früherer Lauf ihn bereits abgearbeitet hat.
//
// Konkret und gemessen: nur `/api/cron/crawl` (04:00, 20:00 UTC) und
// `/api/cron/pipeline` (16:00 UTC) treiben die Warteschlange
// (`server.js` → `cronSchwererPfad`). Der Understanding-Cron (05:30, 21:30) tut
// es NICHT. Der 20:00-Lauf findet bei Stufe C bereits 275 von 495
// Briefingaufträgen fällig (55,6 %) und kann sie abarbeiten.
//
// Deshalb verlangt dieses Modul für das Urteil „vollständiger Zyklus" eine
// ÜBERGEBENE, rein lesend erhobene Zahl offener Aufträge. Fehlt sie, ist das
// Urteil `null` — nicht `true` und nicht `false`, sondern NICHT BEWERTBAR
// (`CLAUDE.md` §4.4: eine nicht durchgeführte Messung ist keine gemessene Null).

const sourceDemand = require("./source-demand");
const stufen = require("./testkohorte-stufen");

// Die Arbeitsklassen, die der Fachzyklus über die Warteschlange erzeugt.
// `tenant_narrative` steht bewusst NICHT hier: es entsteht nur bei gesetztem
// `HELMUT_NARRATIV_QUEUE` (in Production nicht gesetzt, Migration nicht
// angewendet) und wird vom Planer nur mit `narrativAktiv: true` erzeugt.
const PFLICHTKLASSEN = Object.freeze(["mandate_projection", "briefing_materialization"]);

// Die sichtbare Produktstufe. Sie ist die Klasse, an der ein vollständiger
// Zyklus gemessen wird — eine Projektion ohne Briefing ist kein Produkt.
const PRODUKTSTUFE = "briefing_materialization";

// Nur diese Cron-Pfade treiben die Warteschlange an (server.js: cronSchwererPfad).
// Gemessen, nicht angenommen — der Understanding-Cron gehört NICHT dazu.
const WARTESCHLANGEN_CRONS = Object.freeze([
  Object.freeze({ pfad: "/api/cron/crawl", minuteUtc: 4 * 60 }),      // 04:00
  Object.freeze({ pfad: "/api/cron/pipeline", minuteUtc: 16 * 60 }),  // 16:00
  Object.freeze({ pfad: "/api/cron/crawl", minuteUtc: 20 * 60 })      // 20:00
]);

// KEINE KOERZIERUNG. `Number(null)` ist 0 und `Number("")` ebenfalls — ein
// fehlender Zeitpunkt hätte damit als „1970-01-01" gegolten und das Tor wäre
// klaglos weitergelaufen. Genau dieser Fehler ist in diesem Projekt schon
// mehrfach aufgetreten (`CLAUDE.md`: „`Number(null)` ist nie mehr eine gemessene
// 0"); die eigene Testsuite hat ihn hier erneut gefunden. Nur eine echte Zahl
// oder eine Zahl als Zeichenkette gilt.
function zahl(wert) {
  if (wert === null || wert === undefined) return null;
  if (typeof wert === "string" && wert.trim() === "") return null;
  if (typeof wert === "boolean") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

// Der Frischefensterschlüssel eines Zeitpunkts — dieselbe Funktion wie im Motor.
function fensterVon(ms, env) {
  const konfig = sourceDemand.fensterKonfig(env);
  return sourceDemand.fensterKennung(ms, konfig.mandatMaxAlterStunden);
}

// ── DER KERN: Fälligkeitsbefund einer Kohorte in einem konkreten Fenster ─────
//
// `planungsZeitpunktMs` ist der Zeitpunkt, zu dem der Plan ENTSTEHT. Er ist nicht
// dasselbe wie der Fensterbeginn und entscheidet über den Frischefensterschlüssel —
// und damit über die Fälligkeiten. Genau daran hängt das Mitternachtsverhalten.
function faelligkeitsBefund({
  stufe = null,
  kennungen = null,
  fensterStartMs = null,
  fensterEndeMs = null,
  planungsZeitpunktMs = null,
  mindestAbdeckung = 1,
  offeneAuftraege = null,   // rein lesend erhoben; null = nicht gemessen
  env = process.env
} = {}) {
  const start = zahl(fensterStartMs);
  const ende = zahl(fensterEndeMs);
  const geplantUm = zahl(planungsZeitpunktMs);

  if (start === null || ende === null || ende <= start) {
    return Object.freeze({
      bewertbar: false,
      grund: "Fensterbeginn und -ende fehlen oder das Fenster ist leer — fail closed."
    });
  }
  if (geplantUm === null) {
    return Object.freeze({
      bewertbar: false,
      grund: "Kein Planungszeitpunkt übergeben. Er entscheidet über den Frischefensterschlüssel "
        + "und damit über jede Fälligkeit — er darf nicht geraten werden."
    });
  }

  // Die Kohorte: entweder ausdrücklich übergeben oder aus der Stufe abgeleitet.
  // Eine leere Kohorte ist NIE ein Erfolg (derselbe Befund wie beim Rückbau).
  let liste;
  if (Array.isArray(kennungen)) {
    liste = kennungen.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean);
  } else if (stufe !== null && stufe !== undefined) {
    const s = String(stufe).trim().toLowerCase();
    if (!stufen.STUFEN.includes(s)) {
      return Object.freeze({ bewertbar: false, grund: `Unbekannte Stufe: ${String(stufe).slice(0, 20)}` });
    }
    liste = [...stufen.kennungenBisStufe(s)];
  } else {
    return Object.freeze({
      bewertbar: false,
      grund: "Weder Stufe noch Kennungsliste übergeben — ohne Kohorte gibt es keinen Befund."
    });
  }
  if (!liste.length) {
    return Object.freeze({ bewertbar: false, grund: "Leere Kohorte — kein Befund (fail closed)." });
  }

  // ── Der Plan. ECHTE Planungslogik, keine Nachbildung. ─────────────────────
  const plan = sourceDemand.planeMandatsarbeit({
    profile: liste.map((id) => ({ id })),
    jetztMs: geplantUm,
    env
  });
  const auftraege = Array.isArray(plan && plan.auftraege) ? plan.auftraege : [];
  if (!auftraege.length) {
    return Object.freeze({ bewertbar: false, grund: "Der Planer lieferte keinen Auftrag — fail closed." });
  }

  // ── Frischefenster: passt der Plan überhaupt zu diesem Testfenster? ───────
  // Wird NACH Mitternacht geplant, trägt der Plan den Schlüssel des FOLGETAGES
  // und seine Fälligkeiten liegen einen Tag später. Gemessen: dann sind 0 von
  // 495 Briefingaufträgen im Nachtfenster beanspruchbar.
  const fensterDesPlans = plan.fenster;
  const fensterDesStarts = fensterVon(start, env);
  const planPasstZumFenster = fensterDesPlans === fensterDesStarts;

  // ── Die sieben Kennzahlen je Arbeitsklasse ────────────────────────────────
  const klassen = PFLICHTKLASSEN.map((typ) => {
    const eigene = auftraege.filter((a) => a.jobType === typ);
    const faellig = eigene.map((a) => ({ id: a.tenantId, due: Date.parse(a.dueAt) }))
      .filter((x) => Number.isFinite(x.due));
    const beiStart = faellig.filter((x) => x.due <= start).length;
    const imFenster = faellig.filter((x) => x.due > start && x.due <= ende).length;
    const beanspruchbar = beiStart + imFenster;
    const nichtBeanspruchbar = eigene.length - beanspruchbar;
    const abdeckung = eigene.length > 0 ? beanspruchbar / eigene.length : 0;
    const dueWerte = faellig.map((x) => x.due);
    return Object.freeze({
      jobType: typ,
      geplant: eigene.length,
      beiStartFaellig: beiStart,
      imFensterZusaetzlichFaellig: imFenster,
      bisFensterendeBeanspruchbar: beanspruchbar,
      nichtBeanspruchbar,
      abdeckung: Math.round(abdeckung * 10000) / 10000,
      vollstaendigeAbdeckung: eigene.length > 0 && beanspruchbar === eigene.length,
      fruehesteFaelligkeitIso: dueWerte.length ? new Date(Math.min(...dueWerte)).toISOString() : null,
      spaetesteFaelligkeitIso: dueWerte.length ? new Date(Math.max(...dueWerte)).toISOString() : null
    });
  });

  const produkt = klassen.find((k) => k.jobType === PRODUKTSTUFE) || null;
  const grenze = Number.isFinite(Number(mindestAbdeckung))
    ? Math.min(1, Math.max(0, Number(mindestAbdeckung)))
    : 1;

  // ── Erreicht die Kohorte die geforderte Abdeckung? ────────────────────────
  // AUSDRÜCKLICH gegen die GEFORDERTE Kohorte, nicht gegen „mindestens einer":
  // eine einzige fällige Briefingmaterialisierung ist kein Beweis für 500 Profile.
  const abdeckungErreicht = klassen.every((k) => k.geplant > 0 && k.abdeckung >= grenze);

  // ── Der Statusteil, den Planungsdaten NICHT hergeben ──────────────────────
  const offen = offeneAuftraege && typeof offeneAuftraege === "object" ? offeneAuftraege : null;
  const offenGemessen = offen !== null && PFLICHTKLASSEN.every((typ) => {
    const v = offen[typ];
    return typeof v === "number" && Number.isFinite(v) && v >= 0;
  });
  const offenReicht = offenGemessen
    ? klassen.every((k) => Math.floor(offen[k.jobType]) >= Math.ceil(k.geplant * grenze))
    : null;

  // ── Das Gesamturteil ──────────────────────────────────────────────────────
  // `null` heißt NICHT BEWERTBAR und ist ausdrücklich kein `false`: der Aufrufer
  // muss den Unterschied sehen, sonst wird aus einer fehlenden Messung stillschweigend
  // ein Befund.
  let vollstaendigerZyklus = null;
  let urteil;
  if (!planPasstZumFenster) {
    vollstaendigerZyklus = false;
    urteil = `Der Plan trägt das Frischefenster ${fensterDesPlans}, das Fenster beginnt aber in `
      + `${fensterDesStarts}. Die Aufträge dieses Plans werden erst im FOLGENDEN Frischefenster `
      + "fällig — im Testfenster ist keiner beanspruchbar.";
  } else if (!abdeckungErreicht) {
    vollstaendigerZyklus = false;
    const schwach = klassen.filter((k) => k.abdeckung < grenze)
      .map((k) => `${k.jobType} ${(k.abdeckung * 100).toFixed(1)} %`);
    urteil = `Die geforderte Kohortenabdeckung von ${(grenze * 100).toFixed(1)} % wird nicht erreicht: `
      + `${schwach.join(", ")}.`;
  } else if (!offenGemessen) {
    vollstaendigerZyklus = null;
    urteil = "Die Fälligkeit reicht für die geforderte Abdeckung — der STATUS ist aber nicht gemessen. "
      + "Der Motor verlangt `status = 'wartend'` UND `due_at <= now`; ob die Aufträge noch offen sind, "
      + "steht nicht im Plan. NICHT BEWERTBAR, bis eine rein lesende Zählung offener Aufträge "
      + "übergeben wird.";
  } else if (!offenReicht) {
    vollstaendigerZyklus = false;
    urteil = "Fällig wären genug Aufträge, aber die gemessene Zahl OFFENER Aufträge reicht nicht — "
      + "ein früherer Lauf hat sie bereits abgearbeitet.";
  } else {
    vollstaendigerZyklus = true;
    urteil = `Vollständiger Zyklus: ${(grenze * 100).toFixed(1)} % der Kohorte sind im Fenster `
      + "beanspruchbar UND als offen gemessen.";
  }

  return Object.freeze({
    bewertbar: true,
    stufe: stufe === null || stufe === undefined ? null : String(stufe).trim().toLowerCase(),
    kohortenGroesse: liste.length,
    fensterStartIso: new Date(start).toISOString(),
    fensterEndeIso: new Date(ende).toISOString(),
    fensterMinuten: Math.round((ende - start) / 60000),
    planungsZeitpunktIso: new Date(geplantUm).toISOString(),
    frischefensterDesPlans: fensterDesPlans,
    frischefensterDesFensterbeginns: fensterDesStarts,
    planPasstZumFenster,
    ueberschreitetMitternacht: new Date(start).getUTCDate() !== new Date(ende).getUTCDate(),
    mindestAbdeckung: grenze,
    klassen: Object.freeze(klassen),
    produktstufe: produkt,
    abdeckungErreicht,
    offeneAuftraegeGemessen: offenGemessen,
    offeneAuftraegeReichen: offenReicht,
    vollstaendigerZyklus,
    urteil
  });
}

// ── HARTE STARTBEDINGUNGEN DES NACHTFENSTERS ────────────────────────────────
//
// Trägt ein Fenster nur unter zusätzlichen Voraussetzungen, müssen diese als
// Bedingungen im Code stehen und nicht in der Prosa. Jede Bedingung ist fail
// closed: was nicht ausdrücklich als erfüllt übergeben wird, gilt als offen.
function startbedingungen({
  befund = null,
  aktivierungAbgeschlossenMs = null,
  restzeitMinuten = null,
  mindestRestzeitMinuten = 60,
  konkurrierendeSchwereAusfuehrung = null,
  vorbedingungenErfuellt = null,
  tagesdeckelWirksam = null,
  vorrangreserveWirksam = null,
  kommunikationsriegelScharf = null,
  env = process.env
} = {}) {
  if (!befund || befund.bewertbar !== true) {
    return Object.freeze({
      erfuellt: false,
      bedingungen: Object.freeze([]),
      grund: "Kein bewertbarer Fälligkeitsbefund — ohne ihn ist keine Startbedingung prüfbar."
    });
  }

  const start = Date.parse(befund.fensterStartIso);
  const aktivierung = zahl(aktivierungAbgeschlossenMs);
  // Der Frischefensterwechsel liegt am Ende des Frischefensters des Fensterbeginns.
  const konfig = sourceDemand.fensterKonfig(env);
  const breiteMs = konfig.mandatMaxAlterStunden * 3600 * 1000;
  const fensterStartDesTages = Date.parse(
    String(befund.frischefensterDesFensterbeginns).replace(/Z$/, ":00:00.000Z")
  );
  const naechsterFensterwechselMs = fensterStartDesTages + breiteMs;

  const bedingungen = [
    {
      name: "Der Plan gehört zum Frischefenster des Fensterbeginns",
      erfuellt: befund.planPasstZumFenster === true,
      detail: `Plan ${befund.frischefensterDesPlans} gegen Fensterbeginn `
        + `${befund.frischefensterDesFensterbeginns}`
    },
    {
      name: "Aktivierung und Planung liegen VOR dem Frischefensterwechsel",
      erfuellt: aktivierung !== null && aktivierung < naechsterFensterwechselMs && aktivierung <= start,
      detail: aktivierung === null
        ? "Kein Aktivierungszeitpunkt übergeben — nicht bewertbar, fail closed."
        : `Aktivierung ${new Date(aktivierung).toISOString()} gegen Fensterwechsel `
          + `${new Date(naechsterFensterwechselMs).toISOString()} und Fensterbeginn `
          + `${befund.fensterStartIso}`
    },
    {
      name: "Vollständige Kohortenliste geplant",
      erfuellt: befund.klassen.every((k) => k.geplant === befund.kohortenGroesse),
      detail: befund.klassen.map((k) => `${k.jobType}=${k.geplant}`).join(", ")
        + ` gegen Kohorte ${befund.kohortenGroesse}`
    },
    {
      name: "Geforderte Kohortenabdeckung nach Fälligkeit erreicht",
      erfuellt: befund.abdeckungErreicht === true,
      detail: befund.klassen.map((k) => `${k.jobType} ${(k.abdeckung * 100).toFixed(1)} %`).join(", ")
    },
    {
      name: "Genügend OFFENE Aufträge gemessen (nicht nur fällige)",
      erfuellt: befund.offeneAuftraegeReichen === true,
      detail: befund.offeneAuftraegeGemessen
        ? `gemessen, reichen: ${befund.offeneAuftraegeReichen}`
        : "NICHT gemessen — der Motor verlangt status='wartend'; eine ungemessene Zahl ist keine Null."
    },
    {
      name: "Mindestrestzeit im Fenster",
      erfuellt: zahl(restzeitMinuten) !== null && zahl(restzeitMinuten) >= Number(mindestRestzeitMinuten),
      detail: zahl(restzeitMinuten) === null
        ? "Keine Restzeit übergeben — fail closed."
        : `${restzeitMinuten} min gegen geforderte ${mindestRestzeitMinuten} min`
    },
    {
      name: "Keine konkurrierende schwere Ausführung im Fenster",
      erfuellt: konkurrierendeSchwereAusfuehrung === false,
      detail: konkurrierendeSchwereAusfuehrung === null
        ? "Nicht geprüft — fail closed. Warteschlangentreibend sind nur "
          + WARTESCHLANGEN_CRONS.map((c) => `${String(Math.floor(c.minuteUtc / 60)).padStart(2, "0")}:`
            + `${String(c.minuteUtc % 60).padStart(2, "0")} ${c.pfad}`).join(" · ")
        : `konkurrierend: ${konkurrierendeSchwereAusfuehrung}`
    },
    {
      name: "Vorbedingungen der Auftragsklassen erfüllt",
      erfuellt: vorbedingungenErfuellt === true,
      detail: vorbedingungenErfuellt === null
        ? "Nicht geprüft — fail closed. briefing_materialization wartet auf source_fetch, "
          + "document_understanding und mandate_projection desselben Fensters."
        : `erfüllt: ${vorbedingungenErfuellt}`
    },
    {
      name: "Tagesdeckel wirksam",
      erfuellt: tagesdeckelWirksam === true,
      detail: tagesdeckelWirksam === null ? "Nicht geprüft — fail closed." : `${tagesdeckelWirksam}`
    },
    {
      name: "Vorrangreserve der fünf realen Mandate wirksam",
      erfuellt: vorrangreserveWirksam === true,
      detail: vorrangreserveWirksam === null ? "Nicht geprüft — fail closed." : `${vorrangreserveWirksam}`
    },
    {
      name: "Kommunikationsriegel scharf",
      erfuellt: kommunikationsriegelScharf === true,
      detail: kommunikationsriegelScharf === null ? "Nicht geprüft — fail closed." : `${kommunikationsriegelScharf}`
    }
  ].map((b) => Object.freeze({ ...b }));

  const offen = bedingungen.filter((b) => !b.erfuellt);
  return Object.freeze({
    erfuellt: offen.length === 0,
    bedingungen: Object.freeze(bedingungen),
    offene: Object.freeze(offen.map((b) => b.name)),
    grund: offen.length === 0
      ? "Alle harten Startbedingungen erfüllt."
      : `${offen.length} von ${bedingungen.length} Startbedingungen nicht erfüllt.`
  });
}

// ── DER FEHLENDE NACHWEIS, ALS AUSFÜHRBARE ABFRAGE ──────────────────────────
//
// `faelligkeitsBefund` meldet `vollstaendigerZyklus: null`, solange die Zahl
// OFFENER Aufträge nicht übergeben ist. Es genügt nicht, diesen Nachweis nur zu
// benennen — hier steht die Abfrage, die ihn liefert.
//
// RE IN LESEND: ausschließlich `select`. Keine Zeile wird verändert, kein
// Auftrag beansprucht. Die Abfrage bildet die Claim-Bedingung des Motors exakt
// nach (`helmut_claim_jobs`): `status = 'wartend'`, `due_at <= <Fensterende>`,
// `attempts < max_attempts`. Der Zeitpunkt ist das FENSTERENDE, nicht `now()` —
// gefragt ist, was bis zum Ende des Testfensters beanspruchbar wäre.
function erhebungsSql({
  fensterEndeIso = "<FENSTERENDE-UTC>",
  kennungsPraefix = "test-kohorte-"
} = {}) {
  // NICHT NUR ESCAPEN, SONDERN VALIDIEREN. Ein escapter Fremdwert ist zwar
  // inert, steht aber trotzdem in der Abfrage, die ein Mensch dann ausfuehrt.
  // Beide Eingaben sind eng begrenzt, also werden sie geprueft statt entschaerft.
  // Der Platzhalter bleibt erlaubt, damit `--sql` ohne Argumente eine lesbare
  // Vorlage liefert.
  const rohEnde = String(fensterEndeIso);
  const istPlatzhalter = /^<[A-ZÄÖÜ-]+>$/.test(rohEnde);
  if (!istPlatzhalter && !Number.isFinite(Date.parse(rohEnde))) {
    throw new Error(`erhebungsSql: kein gueltiger Zeitpunkt: ${rohEnde.slice(0, 40)}`);
  }
  const ende = istPlatzhalter ? rohEnde : new Date(Date.parse(rohEnde)).toISOString();
  const praefix = String(kennungsPraefix);
  if (!/^[a-z0-9-]+$/.test(praefix)) {
    throw new Error(`erhebungsSql: unzulaessiges Kennungspraefix: ${praefix.slice(0, 40)}`);
  }
  return [
    "-- Helmut · rein lesende Erhebung der OFFENEN Auftraege der Testkohorte.",
    "-- NUR SELECT. Keine Zeile wird veraendert, kein Auftrag beansprucht.",
    "--",
    "-- Sie bildet die Claim-Bedingung des Motors exakt nach",
    "-- (helmut_claim_jobs, Migration 20260808_scalable_job_queue.sql):",
    "--   status = 'wartend' AND due_at <= <Zeitpunkt> AND attempts < max_attempts",
    "-- Der Zeitpunkt ist das FENSTERENDE: gefragt ist, was bis dahin beanspruchbar waere.",
    "--",
    "-- Das Ergebnis gehoert als `offeneAuftraege` in `faelligkeitsBefund`.",
    "-- Eine NICHT ausgefuehrte Abfrage ist keine gemessene Null.",
    "select",
    "  job_type as \"jobType\",",
    "  count(*) as \"offen\"",
    "from public.helmut_jobs",
    "where status = 'wartend'",
    `  and due_at <= '${ende}'::timestamptz`,
    "  and attempts < max_attempts",
    `  and tenant_id like '${praefix}%'`,
    "  and job_type in ('mandate_projection', 'briefing_materialization')",
    "group by job_type",
    "order by job_type;"
  ].join("\n");
}

module.exports = {
  PFLICHTKLASSEN,
  PRODUKTSTUFE,
  WARTESCHLANGEN_CRONS,
  faelligkeitsBefund,
  startbedingungen,
  erhebungsSql
};
