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
const kohorte = require("./testkohorte-betrieb");
// Beide sind reine Rechenmodule: `llm-budget-fair` haelt die Rotationslogik,
// `scalable-pipeline` den Leser des Tagesdeckels. Keins von beiden oeffnet eine
// Verbindung; der Ladegraph dieses Moduls bleibt netz- und datenbankfrei.
const fair = require("./llm-budget-fair");
const pipeline = require("./scalable-pipeline");

// Die Arbeitsklassen, die der Fachzyklus über die Warteschlange erzeugt.
// `tenant_narrative` steht bewusst NICHT hier: es entsteht nur bei gesetztem
// `HELMUT_NARRATIV_QUEUE` (in Production nicht gesetzt, Migration nicht
// angewendet) und wird vom Planer nur mit `narrativAktiv: true` erzeugt.
const PFLICHTKLASSEN = Object.freeze(["mandate_projection", "briefing_materialization"]);

// ── DAS STATUSVOKABULAR DER WARTESCHLANGE ───────────────────────────────────
// Genau vier Werte, festgelegt in `20260808_scalable_job_queue.sql`:
//   check (status in ('wartend', 'laeuft', 'erledigt', 'fehlgeschlagen'))
const STATUS = Object.freeze(["wartend", "laeuft", "erledigt", "fehlgeschlagen"]);

// EIN FALLSTRICK, DER IN DER STATUSSPALTE NICHT SICHTBAR IST: ein Auftrag mit
// `status = 'wartend'` UND `attempts >= max_attempts` ist NICHT beanspruchbar.
// `helmut_claim_jobs` setzt ihn im Schritt (b) VOR der Ausgabe auf
// `fehlgeschlagen`. Er zaehlt deshalb zu den endgueltigen Fehlern, nicht zu den
// wartenden — sonst wuerde ein blockierter Auftrag als „kommt noch" gezaehlt.
//
// Umgekehrt gilt fuer `laeuft` mit ABGELAUFENER Lease: Schritt (a) desselben
// Claims setzt ihn auf `wartend` zurueck. Er ist also weiterhin ausstehende
// Arbeit, kein Verlust — solange seine Versuche nicht erschoepft sind.

// ── DIE SIEBEN MENGEN (Betreiberauftrag 02.09., Punkt 5) ────────────────────
// Sie werden AUSDRUECKLICH getrennt gehalten, weil die vorige Fassung sie
// vermischt hat: sie kannte nur „offen" und hat daraus geschlossen, ein
// vollstaendig ERLEDIGTER Zyklus sei unvollstaendig (gemessen, siehe §32).
const MENGEN = Object.freeze({
  erwartet: "Alle Auftraege, die der ECHTE Planer fuer diese Kohorte, Stufe und dieses "
    + "Frischefenster erzeugen muss.",
  vorhanden: "Alle erwarteten Auftraege, die in der Warteschlange tatsaechlich existieren — "
    + "unabhaengig vom Status.",
  wartend: "Noch nicht abgeschlossene Auftraege, die waehrend des Testfensters beanspruchbar "
    + "werden (Versuche NICHT erschoepft).",
  laufend: "Bereits beanspruchte Auftraege mit gueltiger oder abgelaufener Lease.",
  erledigt: "Erfolgreich abgeschlossene Auftraege des EXAKTEN Frischefensters.",
  endgueltigFehlerhaft: "Auftraege, die den Zyklus blockieren: `fehlgeschlagen`, oder "
    + "`wartend` mit erschoepften Versuchen.",
  fehlend: "Erwartete Auftraege, fuer die KEINE passende Warteschlangenzeile existiert."
});

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
  // ERGAENZT 02.09. (zweiter adversarialer Review): `Number([])` ist 0 und
  // `Number([1e15])` ist 1e15 — ein leeres Array, der typische Rueckgabewert
  // einer FEHLGESCHLAGENEN Erhebung, waere als „1970-01-01" durchgegangen und
  // haette ein Fenster von 31.000 Jahren erzeugt, in dem trivialerweise alles
  // faellig ist. Nur eine echte Zahl oder eine Zahl als Zeichenkette gilt.
  if (typeof wert !== "number" && typeof wert !== "string") return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

// Der Frischefensterschlüssel eines Zeitpunkts — dieselbe Funktion wie im Motor.
function fensterVon(ms, env) {
  const konfig = sourceDemand.fensterKonfig(env);
  return sourceDemand.fensterKennung(ms, konfig.mandatMaxAlterStunden);
}

// ── WIE ENTSTEHEN DIE KOHORTENAUFTRAEGE? (Betreiberauftrag 02.09., Punkt 10) ─
//
// Der Fachzyklus braucht Auftraege, bevor eine Statusmessung ueberhaupt etwas
// messen kann. Vier Wege wurden am Code geprueft:
const PLANUNGSWEGE = Object.freeze([
  Object.freeze({
    weg: "a",
    name: "Vorhandene reine Planungsfunktion mit idempotentem Einreihen",
    funktion: "scalable-pipeline.planeArbeit",
    plantNur: true,        // beansprucht NICHTS — im ganzen Block kein Claim-Aufruf
    exportiert: true,
    schreibend: true,      // `helmut_enqueue_job` ist ein Schreibvorgang
    nurKohorte: false,     // sie plant ALLE aktiven Profile, nicht nur die Kohorte
    freigabepflichtig: true,
    bewertung: "Technisch geeignet und nebenwirkungsarm (kein Modellaufruf, kein "
      + "externer Abruf). Sie laesst sich aber NICHT auf die Kohorte einschraenken — "
      + "sie plant jedes aktive Profil. Ein eigener Aufruf waere ein zusaetzlicher "
      + "Production-Schreibvorgang OHNE zusaetzlichen Nutzen gegenueber Weg (d)."
  }),
  Object.freeze({
    weg: "b",
    name: "Klar getrennte Planungsphase vor der Verarbeitung",
    funktion: null,
    vorhanden: false,
    bewertung: "Es gibt heute keine Route und kein CLI, das NUR plant. Der Weg "
      + "verlangt neuen schreibenden Code — nach Punkt 11 nur zulaessig, wenn kein "
      + "vorhandener sicherer Weg existiert. Weg (d) existiert."
  }),
  Object.freeze({
    weg: "c",
    name: "Ein freigegebener Pipeline-Abschnitt mit Kontrollstopp",
    funktion: "funktionstest-zyklus.fuehreZyklusAus (maxScheiben: 1)",
    vorhanden: true,
    bewertung: "Moeglich, aber die eine Scheibe PLANT UND VERARBEITET zugleich — "
      + "genau die Vermischung, die den Kreisschluss erzeugt hat. Sie kostet ausserdem "
      + "Modellaufrufe (document_understanding) und verlangt die Startfreigabe, die "
      + "ohne vorherige Planung gar nicht erteilt werden kann."
  }),
  Object.freeze({
    weg: "d",
    name: "Der natuerliche Lauf um 20:00 UTC",
    funktion: "/api/cron/crawl → cronSchwererPfad → runCronUeberWarteschlange → planeArbeit",
    vorhanden: true,
    schreibend: true,      // aber als BESTANDSBETRIEB, nicht als neue Aktion
    neuerCode: false,
    bewertung: "GEWAEHLT. Er plant die Kohorte automatisch, sobald die Stufe aktiv "
      + "ist — die Aktivierung ist ohnehin freigabepflichtig. Er braucht KEINEN neuen "
      + "schreibenden Code, KEINE zusaetzliche Freigabe ueber die Aktivierung hinaus "
      + "und keine Abweichung vom Bestandsbetrieb. Dass er zugleich zu verarbeiten "
      + "beginnt, ist seit der Trennung der sieben Mengen KEIN Problem mehr: erledigte "
      + "Auftraege zaehlen fuer den Fachzyklus."
  })
]);

// DIE ENTSCHEIDUNG, ausdruecklich: eine NEUE schreibende Planungsfunktion wird
// NICHT gebaut. Punkt 11 des Auftrags erlaubt sie nur, wenn kein vorhandener
// sicherer Weg existiert — Weg (d) existiert, ist Bestandsbetrieb und kommt ohne
// jede zusaetzliche Freigabe aus. Der Kreisschluss war kein fehlender
// Planungsweg, sondern eine falsche Statusbedingung.
const GEWAEHLTER_PLANUNGSWEG = "d";

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
  mindestAbdeckung = undefined,
  // DER BESTAND. Er ersetzt das frueher einzige Feld `offeneAuftraege`, das nur
  // eine Zahl kannte („wartend") und daraus ein Urteil ueber den GANZEN Zyklus
  // ableitete. Erwartete Form:
  //   { gemessen: true, klassen: { <jobType>: { wartend, laufend, erledigt,
  //       endgueltigFehlerhaft, erledigtImTestfenster } } }
  // `gemessen: true` ist PFLICHT (Auftrag Punkt 15): ein leeres Abfrageergebnis
  // gilt nur dann als gemessene Null, wenn die Ausfuehrung ausdruecklich
  // bestaetigt wurde. Ein fehlender, abgebrochener oder fehlerhafter Messlauf
  // bleibt „nicht gemessen".
  bestand = null,
  // ROTATIONSRANG (Befund des Ausfuehrbarkeitsreviews, 02.09.). Production ruft
  // `planeMandatsarbeit` MIT `rotation: tagesplan.reihenfolge` auf; ohne diese
  // Angabe faellt der Planer auf den tagesunabhaengigen Streuwert zurueck und
  // liefert ANDERE Faelligkeiten (gemessen Stufe A, Fenster 17:36-19:59:
  // 80,0 % ohne gegen 60,0 % mit Rotation). Wer `rotation` uebergibt, bestimmt
  // sie selbst; sonst wird sie mit derselben reinen Funktion berechnet, die
  // Production benutzt (`llm-budget-fair.tagesplan`).
  rotation = null,
  // Die Mandate AUSSERHALB der Kohorte, die am Testtag ebenfalls aktiv sind
  // (in Production heute die fuenf realen). Sie stehen mit in der Rangkarte und
  // verschieben die Raenge. Fehlen sie, ist die Rotation unvollstaendig — das
  // wird ausgewiesen, nicht verschwiegen.
  weitereAktiveMandate = null,
  env = process.env
} = {}) {
  // ABWEISUNG STATT STILLSCHWEIGEN (Kreisschluss-Analyse, Befund): das Feld
  // `offeneAuftraege` wurde durch `bestand` ersetzt. Ein Aufrufer mit dem alten
  // Feld haette dauerhaft „NICHT BEWERTBAR" bekommen — fail closed zwar, aber
  // der Betreiber haette den Fehler in der Datenbank gesucht statt in der
  // Signatur. Ein unbekanntes Messfeld ist ein Abbruchgrund, kein Nullwert.
  if (arguments.length && arguments[0] && typeof arguments[0] === "object"
      && Object.prototype.hasOwnProperty.call(arguments[0], "offeneAuftraege")) {
    return Object.freeze({
      bewertbar: false,
      grund: "Das Feld `offeneAuftraege` gibt es nicht mehr. Es kannte nur EINE Zahl "
        + "(nur „offen“) und hat daraus ein Urteil über den ganzen Zyklus abgeleitet — ein "
        + "vollständig erledigter Zyklus galt damit als gescheitert. Übergib stattdessen "
        + "`bestand` mit den sieben Mengen; `erhebungsSql()` liefert sie."
    });
  }

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
    // ERLAUBNISLISTE UND ENTDOPPELUNG (Befund des Ausfuehrbarkeitsreviews).
    // Vorher wurde jede Zeichenkette uebernommen: eine fremde Kennung (etwa ein
    // realer Pilotmandant) waere geplant und als Stufenzahl berichtet worden —
    // im Widerspruch zu `CLAUDE.md` §4.2 —, und ein Duplikat haette die Kohorte
    // rechnerisch vergroessert, obwohl der Idempotenzschluessel in der
    // Warteschlange nur EINE Zeile je Mandat erzeugt.
    const roh = kennungen.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean);
    const eindeutig = [...new Set(roh)];
    const fremde = eindeutig.filter((k) => !kohorte.istKohortenKennung(k));
    if (fremde.length) {
      return Object.freeze({
        bewertbar: false,
        grund: `Fremde Kennungen in der Zielmenge (${fremde.length}), zuerst `
          + `„${fremde[0].slice(0, 40)}“ — fail closed. Der Befund plant ausschliesslich `
          + "die Testkohorte; ein realer Mandant gehoert hier nie hinein."
      });
    }
    if (stufe !== null && stufe !== undefined) {
      const s = String(stufe).trim().toLowerCase();
      if (!stufen.STUFEN.includes(s)) {
        return Object.freeze({ bewertbar: false, grund: `Unbekannte Stufe: ${String(stufe).slice(0, 20)}` });
      }
      const erlaubt = new Set(stufen.kennungenBisStufe(s));
      const falscheStufe = eindeutig.filter((k) => !erlaubt.has(k));
      if (falscheStufe.length) {
        return Object.freeze({
          bewertbar: false,
          grund: `${falscheStufe.length} Kennung(en) gehoeren nicht zu Stufe ${s.toUpperCase()} `
            + `oder darunter, zuerst „${falscheStufe[0]}“ — fail closed.`
        });
      }
    }
    liste = eindeutig;
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

  // ── Die Rotation. DIESELBEN EINGABEN WIE PRODUCTION, nicht nur dieselbe
  // Funktion. `scalable-pipeline.planeArbeit` baut den Tagesplan aus ALLEN
  // aktiven Mandaten und uebergibt dessen Reihenfolge; genau das wird hier
  // nachvollzogen. `llm-budget-fair.tagesplan` ist rein rechnend.
  const weitere = Array.isArray(weitereAktiveMandate)
    ? weitereAktiveMandate.map((m) => String(m || "").trim()).filter(Boolean)
    : [];
  let rotationsListe = null;
  let rotationsQuelle;
  const uebergebeneRotation = Array.isArray(rotation)
    ? rotation.map((m) => String(m || "").trim()).filter(Boolean) : null;
  // EINE LEERE LISTE IST KEINE ROTATION (Abschlussreview, bestaetigter Befund).
  // `rotation: []` haette als „uebergeben" und damit als VOLLSTAENDIG gegolten —
  // der Planer faellt bei leerer Rangkarte aber auf den tagesunabhaengigen
  // Streuwert zurueck, also genau auf den Zustand, den `rotationVollstaendig`
  // ausschliessen soll. Sie wird deshalb behandelt, als waere nichts uebergeben.
  if (uebergebeneRotation && uebergebeneRotation.length > 0) {
    rotationsListe = uebergebeneRotation;
    rotationsQuelle = "uebergeben";
  } else {
    const alleMandate = [...liste, ...weitere];
    rotationsListe = fair.tagesplan({
      mandate: alleMandate,
      deckel: pipeline.globalerTagesdeckel(env),
      tag: fair.tagesSchluessel(geplantUm),
      env
    }).reihenfolge;
    rotationsQuelle = weitere.length ? "berechnet-kohorte-und-weitere" : "berechnet-nur-kohorte";
  }
  // Ehrlich ausgewiesen: ohne die uebrigen aktiven Mandate ist die Rangkarte
  // NICHT die von Production. Das ist eine benannte Grenze, keine Fussnote.
  const rotationVollstaendig = rotationsQuelle === "uebergeben" || weitere.length > 0;

  // ── Der Plan. ECHTE Planungslogik, keine Nachbildung. ─────────────────────
  const plan = sourceDemand.planeMandatsarbeit({
    profile: liste.map((id) => ({ id })),
    jetztMs: geplantUm,
    rotation: rotationsListe,
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
      // KEINE VORRUNDUNG. Sie hat zusammen mit der Anzeigerundung 273/495 als
      // 55,1 % statt 55,2 % ausgewiesen (Befund des Ausfuehrbarkeitsreviews).
      abdeckung,
      abdeckungProzent: Math.round(abdeckung * 1000) / 10,
      vollstaendigeAbdeckung: eigene.length > 0 && beanspruchbar === eigene.length,
      fruehesteFaelligkeitIso: dueWerte.length ? new Date(Math.min(...dueWerte)).toISOString() : null,
      spaetesteFaelligkeitIso: dueWerte.length ? new Date(Math.max(...dueWerte)).toISOString() : null
    });
  });

  const produkt = klassen.find((k) => k.jobType === PRODUKTSTUFE) || null;
  // DIE SCHWELLE DARF NICHT KOERZIERT WERDEN. `Number(null)` und `Number("")`
  // sind 0 und endlich — eine Schwelle von 0 haette JEDES Fenster gruen gemeldet,
  // auch eines mit 0 % Abdeckung und 0 offenen Auftraegen. Genau die Falle, die
  // dieses Modul an anderer Stelle ausdruecklich verbietet.
  // UNTERGRENZE (Abschlussreview): ohne sie war die Schwelle ein vom Aufrufer
  // frei absenkbarer Hebel — `mindestAbdeckung: 0.01` haette eine Kohorte von
  // 495 mit fuenf Auftraegen „vollstaendig" gemeldet. Der Test soll eine
  // KOHORTE beweisen, nicht ein Beispiel.
  const MINDEST_SCHWELLE = 0.5;
  const rohGrenze = mindestAbdeckung === undefined ? 1 : zahl(mindestAbdeckung);
  if (rohGrenze !== null && rohGrenze > 0 && rohGrenze < MINDEST_SCHWELLE) {
    return Object.freeze({
      bewertbar: false,
      grund: `\`mindestAbdeckung\` von ${rohGrenze} liegt unter der Untergrenze `
        + `${MINDEST_SCHWELLE}. Eine so niedrige Schwelle wäre kein Kohortenbeweis, `
        + "sondern ein Stichprobenbeweis — fail closed."
    });
  }
  if (rohGrenze === null || !(rohGrenze > 0) || rohGrenze > 1) {
    return Object.freeze({
      bewertbar: false,
      grund: "`mindestAbdeckung` muss eine Zahl groesser 0 und hoechstens 1 sein "
        + `(uebergeben: ${JSON.stringify(mindestAbdeckung)}) — fail closed. `
        + "Eine Schwelle von 0 waere ein pauschales Gruen."
    });
  }
  const grenze = rohGrenze;

  // ── Erreicht die Kohorte die geforderte Abdeckung? ────────────────────────
  // AUSDRÜCKLICH gegen die GEFORDERTE Kohorte, nicht gegen „mindestens einer":
  // eine einzige fällige Briefingmaterialisierung ist kein Beweis für 500 Profile.
  const abdeckungErreicht = klassen.every((k) => k.geplant > 0 && k.abdeckung >= grenze);

  // ── DER BESTAND: die sieben Mengen, streng getrennt ───────────────────────
  //
  // WAS HIER VORHER STAND UND WARUM ES FALSCH WAR (Betreiberbefund 02.09.,
  // durch einen Verhaltenstest bestaetigt, §32): die alte Fassung kannte genau
  // EINE Zahl je Klasse — „offen" — und verlangte
  //     offen >= geplant
  // fuer jede Pflichtklasse. Daraus folgte zwingend:
  //   · Ein VOLLSTAENDIG UND ERFOLGREICH abgearbeiteter Zyklus (0 offen) galt als
  //     gescheitert — gemessen: `vollstaendigerZyklus: false`.
  //   · „Es wurde nie etwas geplant" (0 offen) und „alles ist fertig" (0 offen)
  //     waren fuer das Tor NICHT UNTERSCHEIDBAR.
  //   · Der einzige gruene Zustand war „alles geplant, nichts verarbeitet" — ein
  //     Zustand, der nur im Sekundenfenster zwischen Planung und erstem Claim
  //     INNERHALB desselben Cron-Slots existiert.
  // Zusammen mit der Startbedingung von `fuehreZyklusAus` ergab das einen
  // Kreisschluss: das Tor verlangte gemessene Auftraege, die Auftraege entstehen
  // aber erst durch den Lauf, den das Tor freigeben soll.
  const roh = bestand && typeof bestand === "object" ? bestand : null;
  // DIE MESSUNG MUSS SAGEN, WORUEBER SIE SPRICHT (Abschlussreview, bestaetigter
  // Befund). Ohne diese Angaben konnte der Aufrufer Zahlen des VORTAGES oder
  // einer ANDEREN Stufe uebergeben, und das Modul haette sie fuer bare Muenze
  // genommen. Die Abfrage aus `erhebungsSql` filtert zwar korrekt — aber das
  // Modul konnte nicht pruefen, ob sie es getan hat. Jetzt muss die Messung ihr
  // Frischefenster und ihre Stufe MITBRINGEN, und beide muessen zum Befund passen.
  const messfenster = roh && roh.frischefenster !== undefined && roh.frischefenster !== null
    ? String(roh.frischefenster).trim() : null;
  const messstufe = roh && roh.stufe !== undefined && roh.stufe !== null
    ? String(roh.stufe).trim().toLowerCase() : null;
  const bestandStufe = stufe === null || stufe === undefined
    ? null : String(stufe).trim().toLowerCase();
  const herkunftPasst = roh === null ? false
    : (messfenster === fensterDesPlans
       && (bestandStufe === null || messstufe === bestandStufe));
  // FAIL CLOSED UND AUSDRUECKLICH: nur eine bestaetigte Ausfuehrung zaehlt.
  const bestandGemessen = roh !== null && roh.gemessen === true && herkunftPasst
    && roh.klassen && typeof roh.klassen === "object"
    && PFLICHTKLASSEN.every((typ) => {
      const k = roh.klassen[typ];
      if (!k || typeof k !== "object") return false;
      return ["wartend", "laufend", "erledigt", "endgueltigFehlerhaft"]
        .every((f) => { const n = zahl(k[f]); return n !== null && n >= 0; });
    });

  const bestandJeKlasse = klassen.map((k) => {
    const m = bestandGemessen ? roh.klassen[k.jobType] : null;
    const erwartet = k.geplant;
    if (!m) {
      return Object.freeze({ jobType: k.jobType, erwartet, gemessen: false });
    }
    const wartend = Math.floor(zahl(m.wartend));
    const laufend = Math.floor(zahl(m.laufend));
    const erledigt = Math.floor(zahl(m.erledigt));
    const endgueltigFehlerhaft = Math.floor(zahl(m.endgueltigFehlerhaft));
    // Nur fuer den LASTBEWEIS: was im Testfenster selbst fertig wurde. Fehlt die
    // Angabe, ist der Lastbeweis nicht bewertbar — er wird NICHT geraten.
    const rohImFenster = zahl(m.erledigtImTestfenster);
    // WIDERSPRUECHLICHE MESSUNG IST KEINE MESSUNG (Abschlussreview): mehr im
    // Fenster erledigt als insgesamt erledigt kann die Abfrage nicht liefern.
    // Ein solcher Wert stammt aus einer falsch zusammengesetzten Eingabe und
    // haette den Lastbeweis geschenkt. Er gilt deshalb als NICHT gemessen.
    const erledigtImTestfenster = rohImFenster === null || rohImFenster < 0
      || Math.floor(rohImFenster) > erledigt ? null : Math.floor(rohImFenster);
    const vorhanden = wartend + laufend + erledigt + endgueltigFehlerhaft;
    const fehlend = Math.max(0, erwartet - vorhanden);
    // AUSSTEHEND = die Arbeit, die das Fenster noch tragen muss. Genau diese Zahl
    // geht in die Restlast (Auftrag Punkt 8) — nicht die ganze geplante Menge.
    const ausstehend = wartend + laufend;
    return Object.freeze({
      jobType: k.jobType,
      gemessen: true,
      erwartet,
      vorhanden,
      wartend,
      laufend,
      erledigt,
      endgueltigFehlerhaft,
      erledigtImTestfenster,
      fehlend,
      ausstehend,
      // UEBERZAEHLIG ist ein eigener Befund, kein stiller Ueberschuss: mehr Zeilen
      // als erwartet heisst, dass der Filter zu weit war (fremde Stufe, fremdes
      // Frischefenster) — das darf nie als „vollstaendig" durchgehen.
      ueberzaehlig: Math.max(0, vorhanden - erwartet),
      // FACHLICH VOLLSTAENDIG je Klasse: nichts fehlt, nichts ist endgueltig
      // blockiert, nichts ist ueberzaehlig — und jeder erwartete Auftrag ist
      // entweder schon erledigt oder noch sicher abschliessbar. „Sicher
      // abschliessbar" heisst: er ist im Fenster ueberhaupt beanspruchbar.
      // Ein bereits ERLEDIGTER Auftrag zaehlt hier ausdruecklich MIT
      // (Auftrag Punkt 6) — er ist fertig, nicht verloren.
      // AUSSTEHENDE ARBEIT MUSS IM FENSTER AUCH BEANSPRUCHBAR SEIN
      // (Abschlussreview, bestaetigter Befund): `Math.min(ausstehend, …)` liess
      // eine Klasse durchgehen, deren Rest im Fenster gar nicht mehr gezogen
      // werden kann — solange nur genug ERLEDIGT war. Beide Bedingungen gelten
      // jetzt getrennt: nichts fehlt/blockiert, UND jeder noch ausstehende
      // Auftrag ist im Fenster beanspruchbar.
      ausstehendImFensterBeanspruchbar: ausstehend === 0
        || k.bisFensterendeBeanspruchbar >= ausstehend,
      fachlichVollstaendig: fehlend === 0 && endgueltigFehlerhaft === 0
        && Math.max(0, vorhanden - erwartet) === 0
        && erledigt + ausstehend >= erwartet
        && (ausstehend === 0 || k.bisFensterendeBeanspruchbar >= ausstehend)
    });
  });

  // ── URTEIL 1 · FACHZYKLUS ─────────────────────────────────────────────────
  // Alle erwarteten Profile und Pflichtklassen wurden im richtigen Frischefenster
  // geplant und erfolgreich abgeschlossen ODER sind noch sicher abschliessbar.
  const fachzyklusVollstaendig = !bestandGemessen ? null
    : (planPasstZumFenster && abdeckungErreicht
       && bestandJeKlasse.every((b) => b.fachlichVollstaendig));

  // ── URTEIL 2 · LASTBEWEIS ─────────────────────────────────────────────────
  // Die geforderte Menge wurde TATSAECHLICH im Testfenster verarbeitet. Ein vor
  // dem Fenster erledigter Auftrag zaehlt fuer den Fachzyklus, beweist aber
  // nichts ueber die Belastbarkeit des Fensters (Auftrag Punkt 9).
  const lastGemessen = bestandGemessen
    && bestandJeKlasse.every((b) => b.erledigtImTestfenster !== null);
  const lastbeweisVollstaendig = !lastGemessen ? null
    : bestandJeKlasse.every((b) =>
        b.erledigtImTestfenster >= Math.ceil(b.erwartet * grenze));

  // ── Restlast: die tatsaechlich noch ausstehende Arbeit ────────────────────
  const restlast = bestandGemessen
    ? Object.freeze({
        bewertbar: true,
        ausstehendGesamt: bestandJeKlasse.reduce((n, b) => n + b.ausstehend, 0),
        jeKlasse: Object.freeze(bestandJeKlasse.map((b) =>
          Object.freeze({ jobType: b.jobType, ausstehend: b.ausstehend })))
      })
    : Object.freeze({
        bewertbar: false,
        grund: "Ohne gemessenen Bestand ist die Restlast unbekannt. Die GEPLANTE Menge "
          + "einzusetzen waere falsch, sobald ein Teil bereits erledigt ist."
      });

  // ── Das Gesamturteil ──────────────────────────────────────────────────────
  // `null` heißt NICHT BEWERTBAR und ist ausdrücklich kein `false`.
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
      .map((k) => `${k.jobType} ${k.abdeckungProzent.toFixed(1)} %`);
    urteil = `Die geforderte Kohortenabdeckung von ${(grenze * 100).toFixed(1)} % wird nicht erreicht: `
      + `${schwach.join(", ")}.`;
  } else if (!bestandGemessen) {
    vollstaendigerZyklus = null;
    urteil = "Die Fälligkeit reicht für die geforderte Abdeckung — der BESTAND ist aber nicht "
      + "gemessen. Fälligkeit steht im Plan, der Status nicht. NICHT BEWERTBAR, bis eine rein "
      + "lesende Erhebung der sieben Mengen übergeben wird (`erhebungsSql`). Ein leeres "
      + "Abfrageergebnis zählt nur mit ausdrücklichem `gemessen: true` als Null.";
  } else if (!fachzyklusVollstaendig) {
    vollstaendigerZyklus = false;
    const schwach = bestandJeKlasse.filter((b) => !b.fachlichVollstaendig).map((b) =>
      `${b.jobType}: erwartet ${b.erwartet}, vorhanden ${b.vorhanden}, fehlend ${b.fehlend}, `
      + `endgültig fehlerhaft ${b.endgueltigFehlerhaft}, überzählig ${b.ueberzaehlig}`);
    urteil = `Der Fachzyklus ist nicht vollständig: ${schwach.join(" · ")}.`;
  } else {
    vollstaendigerZyklus = true;
    const fertig = bestandJeKlasse.reduce((n, b) => n + b.erledigt, 0);
    const offen = bestandJeKlasse.reduce((n, b) => n + b.ausstehend, 0);
    urteil = `Fachzyklus vollständig: nichts fehlt, nichts ist endgültig blockiert; `
      + `${fertig} Aufträge erledigt, ${offen} noch ausstehend und im Fenster beanspruchbar. `
      + `Lastbeweis: ${lastbeweisVollstaendig === null ? "NICHT BEWERTBAR (erledigtImTestfenster "
        + "fehlt)" : lastbeweisVollstaendig ? "erbracht" : "NICHT erbracht"}.`;
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
    // Tagesgrenzen statt Kalendertagsnummer: `getUTCDate()` haette ein Fenster
    // ueber genau einen Monat als „ueberschreitet Mitternacht: false" gemeldet.
    ueberschreitetMitternacht: Math.floor(start / 86400000) !== Math.floor(ende / 86400000),
    rotationsQuelle,
    rotationVollstaendig,
    rotationsGroesse: rotationsListe.length,
    mindestAbdeckung: grenze,
    klassen: Object.freeze(klassen),
    produktstufe: produkt,
    abdeckungErreicht,
    // ── Die sieben Mengen und die ZWEI getrennten Urteile ──────────────────
    bestandGemessen,
    bestand: Object.freeze(bestandJeKlasse),
    restlast,
    fachzyklusVollstaendig,
    lastbeweisVollstaendig,
    // `vollstaendigerZyklus` bleibt als Name erhalten, meint jetzt aber
    // ausdruecklich den FACHZYKLUS — der Lastbeweis steht daneben und wird nie
    // mit ihm vermischt.
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
  const rohSchwelle = zahl(mindestRestzeitMinuten);
  const schwelleRest = rohSchwelle !== null && rohSchwelle >= 0 ? rohSchwelle : 60;
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
      // `> 0` ist Absicht: eine 0 stammt praktisch immer aus einer Koerzierung,
      // und „1970-01-01" ist kein Aktivierungszeitpunkt.
      erfuellt: aktivierung !== null && aktivierung > 0
        && aktivierung < naechsterFensterwechselMs && aktivierung <= start,
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
      // OHNE die uebrigen am Testtag aktiven Mandate ist die Rangkarte nicht die
      // von Production, und die Prozentwerte sind es dann auch nicht. Sie
      // weichen in der SICHEREN Richtung ab (gemessen Stufe A, Fenster
      // 17:36-19:59: 80,0 % ohne gegen 60,0 % mit Rotation), aber „sicher falsch"
      // ist keine belegte Zahl.
      name: "Rotationsrang vollständig (alle am Testtag aktiven Mandate)",
      erfuellt: befund.rotationVollstaendig === true,
      detail: `${befund.rotationsQuelle} über ${befund.rotationsGroesse} Mandate`
        + (befund.rotationVollstaendig ? "" : " — die übrigen aktiven Mandate fehlen, "
          + "die Fälligkeiten sind deshalb nicht die von Production")
    },
    {
      name: "Geforderte Kohortenabdeckung nach Fälligkeit erreicht",
      erfuellt: befund.abdeckungErreicht === true,
      detail: befund.klassen.map((k) => `${k.jobType} ${(k.abdeckung * 100).toFixed(1)} %`).join(", ")
    },
    {
      // KORRIGIERT 02.09. (Betreiberbefund, Kreisschluss): hier stand
      // „Genügend OFFENE Aufträge" — das verlangte, dass die volle geplante Menge
      // noch UNBEARBEITET dasteht, und hätte einen erfolgreich abgearbeiteten
      // Zyklus blockiert. Geprüft wird jetzt der BESTAND: nichts fehlt, nichts
      // ist endgültig blockiert, alles ist erledigt oder noch abschließbar.
      name: "Bestand rein lesend gemessen (sieben Mengen, nicht nur „offen“)",
      erfuellt: befund.bestandGemessen === true,
      detail: befund.bestandGemessen
        ? befund.bestand.map((b) => `${b.jobType}: erwartet ${b.erwartet}, vorhanden `
            + `${b.vorhanden} (wartend ${b.wartend}, laufend ${b.laufend}, erledigt `
            + `${b.erledigt}, endgültig fehlerhaft ${b.endgueltigFehlerhaft}), fehlend `
            + `${b.fehlend}`).join(" · ")
        : "NICHT gemessen — ein leeres Abfrageergebnis gilt nur mit ausdrücklichem "
          + "`gemessen: true` als Null. Ein abgebrochener Messlauf bleibt ungemessen."
    },
    {
      name: "Fachzyklus vollständig (nichts fehlt, nichts endgültig blockiert)",
      erfuellt: befund.fachzyklusVollstaendig === true,
      detail: befund.fachzyklusVollstaendig === null
        ? "Nicht bewertbar ohne gemessenen Bestand — fail closed."
        : befund.bestand.map((b) => `${b.jobType}: ${b.fachlichVollstaendig ? "vollständig"
            : `unvollständig (fehlend ${b.fehlend}, blockiert ${b.endgueltigFehlerhaft}, `
              + `überzählig ${b.ueberzaehlig})`}`).join(" · ")
    },
    {
      name: "Mindestrestzeit im Fenster",
      // Auch die SCHWELLE darf nicht koerziert werden: `Number(null)` ist 0,
      // damit haette ein Fenster mit null Restminuten die Bedingung bestanden.
      erfuellt: zahl(restzeitMinuten) !== null && zahl(restzeitMinuten) >= schwelleRest,
      detail: zahl(restzeitMinuten) === null
        ? "Keine Restzeit übergeben — fail closed."
        : `${restzeitMinuten} min gegen geforderte ${schwelleRest} min`
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
// REIN LESEND: ausschließlich `select`. Keine Zeile wird verändert, kein Auftrag
// beansprucht. Die Abfrage übernimmt die drei WHERE-Bedingungen des Claims
// (`helmut_claim_jobs`): `status = 'wartend'`, `due_at <= <Fensterende>`,
// `attempts < max_attempts`. Der Zeitpunkt ist das FENSTERENDE, nicht `now()` —
// gefragt ist, was bis zum Ende des Testfensters beanspruchbar wäre.
//
// DREI DINGE BILDET SIE AUSDRÜCKLICH NICHT AB (Befund des Ausführbarkeitsreviews):
//   1. den vorgelagerten Lease-Rücklauf (`status='laeuft'` mit abgelaufener Lease
//      wird vom Motor zuerst auf `wartend` zurückgesetzt) — die Zahl ist deshalb
//      eine UNTERGRENZE, also die sichere Richtung;
//   2. `order by priority, due_at, created_at` — Reihenfolge ist nicht Menge;
//   3. `limit p_limit` — Beanspruchbarkeit ist nicht Durchsatz. Dafür gibt es die
//      eigene Kapazitätshürde.
//
// ZWEI FILTER SIND PFLICHT, sonst zählt die Abfrage falsch: das FRISCHEFENSTER
// (sonst zählen zurückgestellte Aufträge FRÜHERER Tage mit — `helmut_defer_job`
// setzt sie wieder auf `wartend`, Aufbewahrung 14 Tage) und die STUFE (sonst
// zählt eine Stufe-A-Erhebung alle 495 provisionierten Kennungen mit). Ohne
// beide Angaben schreibt die Abfrage einen sichtbaren Warnhinweis in sich selbst.
function erhebungsSql({
  fensterEndeIso = "<FENSTERENDE-UTC>",
  fensterStartIso = null,
  kennungsPraefix = "test-kohorte-",
  frischefenster = null,
  stufe = null
} = {}) {
  // NICHT NUR ESCAPEN, SONDERN VALIDIEREN. Ein escapter Fremdwert ist zwar
  // inert, steht aber trotzdem in der Abfrage, die ein Mensch dann ausfuehrt.
  const zeitpunkt = (roh, name) => {
    const text = String(roh);
    if (/^<[A-ZÄÖÜ-]+>$/.test(text)) return text;          // lesbare Vorlage
    if (!Number.isFinite(Date.parse(text))) {
      throw new Error(`erhebungsSql: kein gueltiger ${name}: ${text.slice(0, 40)}`);
    }
    return new Date(Date.parse(text)).toISOString();
  };
  const ende = zeitpunkt(fensterEndeIso, "Zeitpunkt");
  const beginn = fensterStartIso === null || fensterStartIso === undefined
    ? null : zeitpunkt(fensterStartIso, "Fensterbeginn");

  const praefix = String(kennungsPraefix);
  if (!/^[a-z0-9-]+$/.test(praefix)) {
    throw new Error(`erhebungsSql: unzulaessiges Kennungspraefix: ${praefix.slice(0, 40)}`);
  }

  let fensterZeile = null;
  if (frischefenster !== null && frischefenster !== undefined && String(frischefenster).trim() !== "") {
    const rohF = String(frischefenster).trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}Z$/.test(rohF)) {
      throw new Error(`erhebungsSql: kein gueltiger Frischefensterschluessel: ${rohF.slice(0, 40)}`);
    }
    fensterZeile = `    and j.freshness_window = '${rohF}'`;
  }

  let stufenZeile = null;
  if (stufe !== null && stufe !== undefined && String(stufe).trim() !== "") {
    const st = String(stufe).trim().toLowerCase();
    if (!stufen.STUFEN.includes(st)) {
      throw new Error(`erhebungsSql: unbekannte Stufe: ${st.slice(0, 20)}`);
    }
    const bis = stufen.STUFEN.slice(0, stufen.STUFEN.indexOf(st) + 1);
    stufenZeile = "    and (" + bis.map((x) => `j.tenant_id like '${praefix}${x}-%'`).join(" or ") + ")";
  }

  const warnung = [];
  if (!fensterZeile) {
    warnung.push("-- ACHTUNG: OHNE Frischefensterfilter. Zurueckgestellte Auftraege FRUEHERER");
    warnung.push("-- Tage stehen ebenfalls auf 'wartend' und wuerden mitgezaehlt.");
  }
  if (!stufenZeile) {
    warnung.push("-- ACHTUNG: OHNE Stufenfilter. Alle provisionierten Kohortenkennungen zaehlen mit,");
    warnung.push("-- auch die einer noch nicht gestarteten Stufe.");
  }
  if (!beginn) {
    warnung.push("-- HINWEIS: ohne `fensterStartIso` bleibt `erledigt_im_testfenster` leer. Der");
    warnung.push("-- LASTBEWEIS ist dann nicht bewertbar (der Fachzyklus schon).");
  }

  const imFenster = beginn
    ? `count(*) filter (where j.status = 'erledigt' and j.finished_at >= '${beginn}'::timestamptz
`
      + `                        and j.finished_at <= '${ende}'::timestamptz)`
    : "null::bigint";

  return [
    "-- Helmut · rein lesende Erhebung der SIEBEN Mengen der Testkohorte.",
    "-- NUR SELECT. Keine Zeile wird veraendert, kein Auftrag beansprucht.",
    "--",
    "-- Sie liefert je Pflichtklasse IMMER eine Zeile — auch wenn alle Werte 0 sind",
    "-- (die Klassen stehen links in einer VALUES-Liste, die Warteschlange wird per",
    "-- LEFT JOIN angehaengt). Eine fehlende Gruppenzeile kann es damit nicht mehr",
    "-- geben, und eine 0 ist eine GEMESSENE 0 statt eines fehlenden Ergebnisses.",
    "--",
    "-- STATUSVOKABULAR (Migration 20260808_scalable_job_queue.sql):",
    "--   wartend · laeuft · erledigt · fehlgeschlagen",
    "-- ZWEI FALLSTRICKE, die die Statusspalte NICHT zeigt und die hier aufgeloest sind:",
    "--   (1) 'wartend' MIT erschoepften Versuchen ist NICHT beanspruchbar — der naechste",
    "--       Claim setzt ihn auf 'fehlgeschlagen'. Er zaehlt hier als endgueltiger Fehler.",
    "--   (2) 'laeuft' mit ABGELAUFENER Lease kommt beim naechsten Claim zurueck auf",
    "--       'wartend'. Er bleibt ausstehende Arbeit und wird als solche gezaehlt.",
    "--",
    "-- NICHT abgebildet: die Claim-Reihenfolge und das Claim-Limit. Beanspruchbarkeit",
    "-- ist nicht Durchsatz — dafuer gibt es die eigene Kapazitaetshuerde.",
    ...warnung,
    "with klassen(job_type) as (",
    "  values ('mandate_projection'), ('briefing_materialization')",
    ")",
    "select",
    "  k.job_type                                              as \"jobType\",",
    "  count(j.id)                                             as \"vorhanden\",",
    "  count(*) filter (where j.status = 'wartend'",
    "                     and j.attempts < j.max_attempts)     as \"wartend\",",
    "  count(*) filter (where j.status = 'laeuft')             as \"laufend\",",
    "  count(*) filter (where j.status = 'erledigt')           as \"erledigt\",",
    "  count(*) filter (where j.status = 'fehlgeschlagen'",
    "                      or (j.status = 'wartend'",
    "                          and j.attempts >= j.max_attempts)) as \"endgueltigFehlerhaft\",",
    "  count(*) filter (where j.status = 'wartend'",
    "                     and j.attempts < j.max_attempts",
    `                     and j.due_at <= '${ende}'::timestamptz) as "wartendUndImFensterFaellig",`,
    `  ${imFenster} as "erledigtImTestfenster"`,
    "from klassen k",
    "left join public.helmut_jobs j",
    "  on j.job_type = k.job_type",
    `    and j.tenant_id like '${praefix}%'`,
    ...(stufenZeile ? [stufenZeile] : []),
    ...(fensterZeile ? [fensterZeile] : []),
    "group by k.job_type",
    "order by k.job_type;",
    "",
    "-- Das Ergebnis gehoert als `bestand` in `faelligkeitsBefund`:",
    "--   { gemessen: true,",
    `--     frischefenster: ${fensterZeile ? String(frischefenster).trim() : "<FRISCHEFENSTER>"},`,
    `--     stufe: ${stufenZeile ? String(stufe).trim().toLowerCase() : "<STUFE>"},`,
    "--     klassen: { <jobType>: { wartend, laufend, erledigt,",
    "--       endgueltigFehlerhaft, erledigtImTestfenster } } }",
    "-- `frischefenster` und `stufe` sind PFLICHT: sonst kann das Modul nicht pruefen,",
    "-- ob die Zahlen ueberhaupt zu dem Fenster und der Stufe gehoeren, ueber die es",
    "-- urteilt — Zahlen des VORTAGES saehen sonst aus wie Zahlen von heute.",
    "-- `gemessen: true` NUR setzen, wenn die Abfrage nachweislich durchgelaufen ist.",
    "-- Ein abgebrochener oder fehlerhafter Messlauf bleibt NICHT GEMESSEN."
  ].join("\n");
}

module.exports = {
  PFLICHTKLASSEN,
  STATUS,
  MENGEN,
  PLANUNGSWEGE,
  GEWAEHLTER_PLANUNGSWEG,
  PRODUKTSTUFE,
  WARTESCHLANGEN_CRONS,
  faelligkeitsBefund,
  startbedingungen,
  erhebungsSql
};
