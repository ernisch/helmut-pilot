"use strict";

// Helmut — OP-25 Production-Nachweis: Bewertungskern (E3-Entscheidung 2026-08-04).
// =============================================================================================
// ZWECK: der ausfuehrbare, fail-closed Abnahmevertrag fuer den NEUEN OP-25-Production-
// Nachweis mit fuenf aktiven realen Mandaten. REINE Funktionen, kein IO, kein Netz, keine
// KI — das Lesen der Production-Daten uebernimmt ausschliesslich das CLI
// `scripts/op25-production-nachweis.js`; die Tests speisen konstruierte Eingaben.
//
// DIE E3-ENTSCHEIDUNG, die dieser Vertrag umsetzt (verbindlich, 2026-08-04):
//   * Kapazitaetsvertrag und Understanding-Rueckstand sind ZWEI verschiedene Dinge.
//   * `datenstand.status` wird NICHT kosmetisch umgedeutet: ein `teilweise` bleibt
//     `teilweise`. Der Nachweis kann trotzdem bestehen — aber NUR, wenn aus
//     strukturierten Laufdaten bewiesen ist, dass die einzige Ursache regulaer
//     zurueckgestellte Verstehensarbeit innerhalb des vorgesehenen Zeitbudgets ist,
//     dass sie vollstaendig gezaehlt und dauerhaft wiederauffindbar ist (pending-
//     Wissensobjekte mit Dokumentverknuepfung) und dass Abruf, Persistenz und
//     Kontextvertrag vollstaendig erfuellt sind.
//   * Ein `teilweise` wegen Quellen, Persistenz, Kontext, Datenbank, Sperre,
//     unbekannter Ursache oder Datenverlust ergibt IMMER `nicht_bestanden`.
//   * Der fachliche Verstehensrueckstand bleibt danach offen (OP-14) — er wird durch
//     ein Bestehen des Kapazitaetsvertrags NICHT als geloest behauptet.
//
// DIE VIER AUSGAENGE (Exit-Codes des CLI):
//   bestanden             (0) — alle Vertragspunkte belegt.
//   nicht_bestanden       (1) — mindestens eine BEWIESENE Vertragsverletzung.
//   blockiert             (2) — Beleg-/Konfigurationsluecke oder ungueltiges Fenster;
//                               ohne Behebung/Entscheidung nicht bewertbar.
//   noch_nicht_auswertbar (3) — das Fenster existiert nicht, ist kuerzer als 24 h
//                               oder noch nicht vollstaendig vergangen.
//
// VORRANG (dokumentiert, testgesichert):
//   1. Fensterpruefung (Stufe 1) geht allem voraus — ein Fenster unter 24 h wird NIE
//      gruen und NIE rot, es ist `noch_nicht_auswertbar` (Vertragspunkt 20).
//   2. Danach: bewiesene Verletzung (`nicht_bestanden`) schlaegt Beleg-Luecke
//      (`blockiert`) schlaegt „Lauf moeglicherweise noch nicht versiegelt"
//      (`noch_nicht_auswertbar`) schlaegt `bestanden`.

const AUSGANG_BESTANDEN = "bestanden";
const AUSGANG_NICHT_BESTANDEN = "nicht_bestanden";
const AUSGANG_BLOCKIERT = "blockiert";
const AUSGANG_NOCH_NICHT_AUSWERTBAR = "noch_nicht_auswertbar";

const EXIT_CODES = Object.freeze({
  [AUSGANG_BESTANDEN]: 0,
  [AUSGANG_NICHT_BESTANDEN]: 1,
  [AUSGANG_BLOCKIERT]: 2,
  [AUSGANG_NOCH_NICHT_AUSWERTBAR]: 3
});

// Mindestlaenge des Beobachtungsfensters: 24 VOLLSTAENDIG vergangene Stunden.
const MIN_FENSTER_MS = 24 * 60 * 60 * 1000;

// HARTE UNTERGRENZE: der gescheiterte Lauf vom 2026-08-03 16:00 UTC
// (`cron-pipeline-20260803160002-xm71n`, 267-s-Ueberziehung, 0 von 6 Mandaten) und alles
// davor duerfen NIEMALS in einen neuen Erfolgsnachweis einfliessen. Ein Fenster, das vor
// diesem Zeitpunkt beginnt, ist ungueltig — unabhaengig von jedem Parameter.
const FRUEHESTER_FENSTERSTART_MS = Date.parse("2026-08-04T00:00:00Z");

// Die schweren Crons, die den globalen Pfad fahren (server.js `cronSchwererPfad`).
const SCHWERE_CRONS = Object.freeze(["crawl", "pipeline"]);

// Aeusseres Zeitlimit eines schweren Cron-Laufs (withTimeout 280 s < maxDuration 300 s)
// plus Schreibtoleranz fuer Telemetrie nach der Antwort.
const AEUSSERES_LIMIT_MS = 280000;
const NACHLAUF_TOLERANZ_MS = 60000;

// Toleranz zwischen geplanter Cron-Minute und tatsaechlichem Laufstart (Vercel-Jitter).
const SLOT_TOLERANZ_MS = 15 * 60 * 1000;

// Aufgreifschwelle fuer eine AUFFAELLIGE Kontextzahl. KEIN Fehlwert an sich
// (vorgangskontext.md §7.5: Vertraege, keine Zahlengrenze) — aber oberhalb der Schwelle
// braucht der Lauf eine dokumentierte Erklaerung, sonst faellt er durch (fail closed).
function kontextAufgreifschwelle(mandate) {
  return 2 * Math.max(0, Number(mandate) || 0) + 1;
}

// Geschlossenes Fehlerklassen-Vokabular des Bestands (redact.classifyPipelineError).
// `unknown` ist BEWUSST NICHT enthalten: ein nicht klassifizierbarer Fehler ist eine
// unbekannte Fehlerklasse und macht den Lauf nicht bestehbar.
const BEKANNTE_FEHLERKLASSEN = Object.freeze([
  "llm-provider", "rate-limit", "timeout", "db", "schema-invalid",
  "dns", "connection", "tls", "empty-feed", "http-5xx", "http-4xx", "parse"
]);

// Zulaessige runState-Werte eines Laufs mit klassifizierten Abweichungen. Ein stark
// degradierter oder fehlgeschlagener Abruf ist KEINE zulaessige Abweichung.
const ZULAESSIGE_RUN_STATES = Object.freeze([
  "gesund", "teilweise-degradiert", "cooldown-reduziert", "aggregator-gedrosselt"
]);

// ---------------------------------------------------------------------------------------------
// Cron-Kadenz: aus der WIRKSAMEN Konfiguration (vercel.json), nichts erfunden.
// Nur einfache Tagesplaene ("M H * * *") sind auswertbar — alles andere ist eine
// Konfigurationsluecke und fuehrt zu `blockiert`, nie zu geratenen Zeiten.
// ---------------------------------------------------------------------------------------------

function parseTagesplan(schedule) {
  const teile = String(schedule || "").trim().split(/\s+/);
  if (teile.length !== 5) return null;
  const [min, std, tag, monat, wochentag] = teile;
  if (tag !== "*" || monat !== "*" || wochentag !== "*") return null;
  const minute = Number(min);
  const stunde = Number(std);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (!Number.isInteger(stunde) || stunde < 0 || stunde > 23) return null;
  return { minute, stunde };
}

function schwereKadenz(crons) {
  const liste = [];
  for (const eintrag of Array.isArray(crons) ? crons : []) {
    const pfad = String((eintrag && eintrag.path) || "");
    const cronName = SCHWERE_CRONS.find((name) => pfad === `/api/cron/${name}`);
    if (!cronName) continue;
    const plan = parseTagesplan(eintrag && eintrag.schedule);
    liste.push({ cronName, schedule: String((eintrag && eintrag.schedule) || ""), plan });
  }
  return liste;
}

// Alle im Fenster ERWARTETEN schweren Laeufe (UTC-Tagesplaene der wirksamen Konfiguration).
function erwarteteLaeufe({ vonMs, bisMs, crons }) {
  const kadenz = schwereKadenz(crons);
  if (!kadenz.length || kadenz.some((k) => !k.plan)) return null; // nicht ermittelbar
  const slots = [];
  const startTag = new Date(vonMs);
  const ersterTagUtcMs = Date.UTC(startTag.getUTCFullYear(), startTag.getUTCMonth(), startTag.getUTCDate());
  for (let tagMs = ersterTagUtcMs; tagMs <= bisMs; tagMs += 24 * 60 * 60 * 1000) {
    for (const k of kadenz) {
      const geplantMs = tagMs + (k.plan.stunde * 60 + k.plan.minute) * 60 * 1000;
      if (geplantMs >= vonMs && geplantMs < bisMs) {
        slots.push({ cronName: k.cronName, geplantMs });
      }
    }
  }
  slots.sort((a, b) => a.geplantMs - b.geplantMs);
  return slots;
}

// ---------------------------------------------------------------------------------------------
// Laufkennungen: `helmutRunId("cron-<name>", t0)` = `cron-<name>-<JJJJMMTTHHMMSS>-<rand>`.
// Der Zeitstempel steckt IN der Kennung — er ist die stabile Startzeit des Laufs.
// ---------------------------------------------------------------------------------------------

function laufStartAusRunId(runId) {
  const m = /^cron-(crawl|pipeline)-(\d{14})-[a-z0-9]+(?:-global)?$/.exec(String(runId || ""));
  if (!m) return null;
  const s = m[2];
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? { cronName: m[1], startMs: ms, global: /-global$/.test(String(runId)) } : null;
}

function istRegulaererLauf(runId, geplantMs, toleranzMs = SLOT_TOLERANZ_MS) {
  const start = laufStartAusRunId(runId);
  if (!start) return false;
  return Math.abs(start.startMs - geplantMs) <= toleranzMs;
}

// ---------------------------------------------------------------------------------------------
// Befunde: jede Feststellung traegt Schwere + Grund + Detail. Die Schwere entscheidet den
// Gesamtausgang (Vorrang: nicht_bestanden > blockiert > noch_nicht_auswertbar > bestanden).
// ---------------------------------------------------------------------------------------------

function befund(schwere, grund, detail = "") {
  return { schwere, grund, detail: String(detail || "").slice(0, 300) };
}

function mengeGleich(a, b) {
  const sa = [...new Set((a || []).map(String))].sort();
  const sb = [...new Set((b || []).map(String))].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

// Gibt es in diesem Lauf ZAEHLBAR zurueckgestellte Verstehensarbeit? Die Pruefung haengt
// bewusst NICHT allein am Status: der heutige Bestand kann `abgeschlossen` versiegeln,
// obwohl Eager-Arbeit zurueckgestellt wurde (Eager-Rueckstand fliesst nicht in
// `budgetErschoepft` ein). Der Vertrag prueft die Dauerhaftigkeit deshalb immer dann,
// wenn IRGENDEIN Rueckstand belegt ist — unabhaengig vom Statuswort (kein falsches Gruen).
function hatVerstehensRueckstand(detail) {
  if (!detail || typeof detail !== "object") return false;
  const lazy = detail.lazy || {};
  const eager = detail.eager || {};
  if ((Number(lazy.uebersprungeneStapel) || 0) > 0) return true;
  if (lazy.cluster != null && lazy.verarbeitet != null && Number(lazy.verarbeitet) < Number(lazy.cluster)) return true;
  if ((Number(eager.zurueckgestellt) || 0) > 0) return true;
  if ((Number(eager.uebersprungeneStapel) || 0) > 0) return true;
  if ((Number(eager.andereSkips) || 0) > 0) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Bewertung EINES erwarteten schweren Laufs gegen den Kapazitaetsvertrag.
// ---------------------------------------------------------------------------------------------

function bewerteLauf({
  slot,
  globalerLauf,
  mandatsLaeufe = [],
  mandatsMenge = [],
  kontextErklaerung = null,
  bekannteFehlerklassen = BEKANNTE_FEHLERKLASSEN,
  jetztMs
}) {
  const befunde = [];
  const warnungen = [];
  const slotName = `${slot.cronName}@${new Date(slot.geplantMs).toISOString()}`;

  // -- Existenz und Regularitaet -------------------------------------------------------------
  if (!globalerLauf) {
    const moeglicherweiseOffen = jetztMs < slot.geplantMs + AEUSSERES_LIMIT_MS + NACHLAUF_TOLERANZ_MS;
    if (moeglicherweiseOffen) {
      befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "lauf-moeglicherweise-noch-nicht-versiegelt", slotName));
      return { slot: slotName, einstufung: "noch-laufend-moeglich", befunde, warnungen };
    }
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "fehlender-lauf", slotName));
    return { slot: slotName, einstufung: "fehlt", befunde, warnungen };
  }
  if (globalerLauf.mode !== "global") {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "globaler-pfad-nicht-verwendet", `${slotName}: mode=${globalerLauf.mode}`));
    return { slot: slotName, einstufung: "altpfad", befunde, warnungen };
  }
  if (!istRegulaererLauf(globalerLauf.runId, slot.geplantMs)) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "kein-regulaerer-cron-lauf", `${slotName}: runId=${globalerLauf.runId}`));
    return { slot: slotName, einstufung: "irregulaer", befunde, warnungen };
  }

  const d = globalerLauf.datenstandDetail;
  if (!d || typeof d !== "object") {
    befunde.push(befund(AUSGANG_BLOCKIERT, "laufdatensatz-ohne-ursachenzerlegung",
      `${slotName}: datenstandDetail fehlt — Deployment-Stand ohne E3-Telemetrie oder Belegluecke`));
    return { slot: slotName, einstufung: "belegluecke", befunde, warnungen };
  }

  // -- Globaler Pfad + Kontextvertrag --------------------------------------------------------
  if (d.buendelung !== "kontext") {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "globaler-pfad-nicht-verwendet", `${slotName}: buendelung=${d.buendelung}`));
  }
  const k = d.kontext;
  if (!k || typeof k !== "object") {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "kontexttelemetrie-fehlt", slotName));
  } else {
    const summe = (Number(k.geteilt) || 0) + (Number(k.mandatseigen) || 0) + (Number(k.unbekannt) || 0);
    if (Number(k.kontexte) !== summe) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "kontextgleichung-verletzt",
        `${slotName}: kontexte=${k.kontexte} != geteilt+mandatseigen+unbekannt=${summe}`));
    }
    if ((Number(k.unbekannt) || 0) > 0 && !kontextErklaerung) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "unbekannte-kontexte-ohne-erklaerung",
        `${slotName}: unbekannt=${k.unbekannt}, ohneSichtbarkeit=${k.ohneSichtbarkeit}`));
    } else if ((Number(k.unbekannt) || 0) > 0) {
      warnungen.push(`${slotName}: ${k.unbekannt} unbekannte Kontexte — erklaert: ${kontextErklaerung}`);
    }
    const schwelle = kontextAufgreifschwelle(mandatsMenge.length);
    if ((Number(k.kontexte) || 0) > schwelle) {
      if (!kontextErklaerung) {
        befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "auffaellige-kontextzahl-ohne-erklaerung",
          `${slotName}: kontexte=${k.kontexte} > Aufgreifschwelle ${schwelle} (kein Fehlwert an sich — aber unerklaert)`));
      } else {
        warnungen.push(`${slotName}: kontexte=${k.kontexte} ueber Aufgreifschwelle ${schwelle} — erklaert: ${kontextErklaerung}`);
      }
    }
  }

  // -- Fehlerklassen des Laufs ---------------------------------------------------------------
  const fehlerSchritte = Array.isArray(d.fehlerSchritte) ? d.fehlerSchritte : [];
  for (const f of fehlerSchritte) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, `fehler-${(f && f.schritt) || "unbekannt"}`,
      `${slotName}: Fehlerschritt im globalen Lauf${f && f.fatal ? " (fatal)" : ""}`));
  }
  if (Array.isArray(d.fehlerhafteProfile) && d.fehlerhafteProfile.length) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "fehlerhafte-profile",
      `${slotName}: ${d.fehlerhafteProfile.join(", ")}`));
  }

  // -- Quellenabruf --------------------------------------------------------------------------
  if ((Number(d.nichtAbgerufen) || 0) > 0) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "quellenabruf-unvollstaendig",
      `${slotName}: ${d.nichtAbgerufen} Wege nicht abgerufen`));
  }
  const failed = Number(globalerLauf.failedSources) || 0;
  if (failed > 0) {
    const klassifiziert = globalerLauf.errorCodes && typeof globalerLauf.errorCodes === "object"
      && Object.keys(globalerLauf.errorCodes).length > 0;
    if (!klassifiziert) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "quellenfehler-unklassifiziert",
        `${slotName}: ${failed} fehlgeschlagene Quellen ohne Fehlercode`));
    } else {
      warnungen.push(`${slotName}: ${failed} fehlgeschlagene Quellen (klassifiziert: ${Object.keys(globalerLauf.errorCodes).join(", ")})`);
    }
  }
  if (globalerLauf.runState && !ZULAESSIGE_RUN_STATES.includes(String(globalerLauf.runState))) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "abruf-degradiert",
      `${slotName}: runState=${globalerLauf.runState}`));
  }
  // Neue/unbekannte Fehlerklassen (Vertragspunkt 14): jedes beobachtete Codewort muss im
  // bekannten Vokabular liegen. `unknown` ist definitionsgemaess eine unbekannte Klasse.
  for (const code of Object.keys(globalerLauf.errorCodes || {})) {
    if (!bekannteFehlerklassen.includes(code)) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "neue-fehlerklasse", `${slotName}: ${code}`));
    }
  }

  // -- Persistenz ----------------------------------------------------------------------------
  const p = d.persistenz;
  if (!p || p.ergebnis !== "ok") {
    // Ein Lauf ganz ohne Dokumente ("leer") ist kein Persistenzfehler, aber auch kein
    // Kapazitaetsbeleg: ein leerer Datenbestand darf nie als Erfolg zaehlen.
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "persistenz-nicht-belegt",
      `${slotName}: persistenz=${(p && p.ergebnis) || "fehlt"}`));
  } else {
    if ((Number(p.zaehlerVerfehlt) || 0) > 0) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "persistenz-kollision-unaufgeloest",
        `${slotName}: ${p.zaehlerVerfehlt} bedingte Zaehler-Schreibvorgaenge verfehlt (CAS)`));
    }
    if (globalerLauf.newRawDocuments == null) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "persistenz-ergebnis-unbekannt",
        `${slotName}: newRawDocuments=null`));
    }
  }
  if ((Number(globalerLauf.savedItems) || 0) === 0) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "leerer-datenbestand",
      `${slotName}: 0 gespeicherte Rohitems — ein leerer Lauf ist kein Kapazitaetsbeleg`));
  }

  // -- Budget der globalen Phase + aeusseres Zeitlimit ---------------------------------------
  if (Number.isFinite(Number(d.budgetMs)) && Number.isFinite(Number(globalerLauf.durationMs))
    && Number(globalerLauf.durationMs) > Number(d.budgetMs)) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "globalphase-budget-ueberzogen",
      `${slotName}: ${globalerLauf.durationMs} ms > Budget ${d.budgetMs} ms`));
  }

  // -- Mandatslaeufe -------------------------------------------------------------------------
  const laufkennung = String(globalerLauf.runId || "").replace(/-global$/, "");
  const zugehoerige = mandatsLaeufe.filter((m) => m && m.mode === "mandat" && m.runId === laufkennung);
  const spaetesterAbschlussMs = zugehoerige
    .map((m) => Date.parse(m.createdAt || ""))
    .filter(Number.isFinite)
    .reduce((max, v) => Math.max(max, v), 0);
  if (spaetesterAbschlussMs && spaetesterAbschlussMs > slot.geplantMs + AEUSSERES_LIMIT_MS + NACHLAUF_TOLERANZ_MS) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "aeusseres-zeitlimit-ueberzogen",
      `${slotName}: letzter Mandatsdatensatz ${new Date(spaetesterAbschlussMs).toISOString()}`));
  }
  const abgedeckt = new Set(zugehoerige.map((m) => String(m.politicianId)));
  const fehlend = mandatsMenge.filter((id) => !abgedeckt.has(String(id)));
  if (fehlend.length) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "mandatslauf-fehlt",
      `${slotName}: ${fehlend.join(", ")}`));
  }
  const fremde = [...abgedeckt].filter((id) => !mandatsMenge.map(String).includes(id));
  if (fremde.length) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "fenster-ungueltig-mandatsmenge-veraendert",
      `${slotName}: unerwartete Mandate im Lauf: ${fremde.join(", ")}`));
  }
  let statusMenge = new Set();
  for (const m of zugehoerige) {
    const vermerk = m.datenstand;
    if (!vermerk || typeof vermerk !== "object" || !vermerk.status) {
      befunde.push(befund(AUSGANG_BLOCKIERT, "mandatslauf-ohne-datenstandsvermerk",
        `${slotName}: ${m.politicianId}`));
      continue;
    }
    statusMenge.add(String(vermerk.status));
    if (vermerk.laufId && vermerk.laufId !== globalerLauf.runId) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "mandatslauf-fremder-datenstand",
        `${slotName}: ${m.politicianId} projizierte ${vermerk.laufId}`));
    }
    if (vermerk.versiegelt !== true) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "mandatslauf-auf-unversiegeltem-datenstand",
        `${slotName}: ${m.politicianId}`));
    }
    // Vollstaendigkeit der Projektion: ein Mandatslauf, dessen Matching- oder
    // Entscheidungsschritt verschluckt wurde (null), ist UNVOLLSTAENDIG — er existiert
    // als Datensatz, hat aber nicht die ganze Arbeit geleistet.
    if (m.matching == null || m.decisions == null) {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "mandatslauf-unvollstaendig",
        `${slotName}: ${m.politicianId} (matching=${m.matching == null ? "fehlt" : "ok"}, decisions=${m.decisions == null ? "fehlt" : "ok"})`));
    }
  }

  // -- Versiegelter Status + E3-Regel --------------------------------------------------------
  const statusListe = [...statusMenge];
  const status = statusListe.length === 1 ? statusListe[0] : null;
  if (zugehoerige.length && statusListe.length > 1) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "datenstand-status-uneinheitlich",
      `${slotName}: ${statusListe.join("/")}`));
  }
  if (status === "fehlgeschlagen" || status === "offen") {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, `datenstand-${status}`, slotName));
  } else if (status === "teilweise" || hatVerstehensRueckstand(d)) {
    // DIE E3-KERNREGEL. Ein ehrliches `teilweise` besteht NUR, wenn (a) keine einzige
    // Fehlerursache vorliegt (oben bereits als Befunde erfasst) und (b) der gesamte
    // Verstehensrueckstand dieses Laufs DAUERHAFT ist. Dauerhaft heisst beweisbar:
    //   lazyKomplett  — die Vormerkphase hat JEDEN Stapel erreicht und JEDEN Cluster
    //                   bewertet (alle interessierten Cluster sind pending-KOs), ODER
    //   eagerKomplett — der Verstehensschritt hat JEDEN Stapel erreicht und JEDEN
    //                   zurueckgestellten Cluster vorgemerkt (nichtVorgemerkt = 0).
    // Beides zusammen fehlend => es existieren zurueckgestellte Cluster OHNE pending-
    // Wissensobjekt. Die sind spaeter nicht garantiert wiederauffindbar => fail closed.
    const lazy = d.lazy;
    const eager = d.eager;
    if (!lazy || !eager
      || lazy.cluster == null || lazy.verarbeitet == null
      || lazy.uebersprungeneStapel == null || lazy.uebersprungeneDokumente == null
      || eager.nichtVorgemerkt == null || eager.uebersprungeneStapel == null) {
      befunde.push(befund(AUSGANG_BLOCKIERT, "rueckstand-nicht-vollstaendig-gezaehlt",
        `${slotName}: lazy/eager-Zaehlung unvollstaendig`));
    } else {
      const lazyKomplett = Number(lazy.uebersprungeneStapel) === 0
        && Number(lazy.verarbeitet) === Number(lazy.cluster);
      const eagerKomplett = Number(eager.uebersprungeneStapel) === 0
        && Number(eager.andereSkips || 0) === 0
        && Number(eager.nichtVorgemerkt) === 0;
      if (!lazyKomplett && !eagerKomplett) {
        befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "rueckstand-nicht-dauerhaft",
          `${slotName}: zurueckgestellte Cluster ohne pending-Vormerkung`
          + ` (lazy ${lazy.verarbeitet}/${lazy.cluster}, uebersprungeneStapel=${lazy.uebersprungeneStapel};`
          + ` eager nichtVorgemerkt=${eager.nichtVorgemerkt}, uebersprungeneStapel=${eager.uebersprungeneStapel})`));
      } else {
        warnungen.push(`${slotName}: datenstand=${status || "abgeschlossen"} — regulaer zurueckgestellte Verstehensarbeit,`
          + ` vollstaendig gezaehlt und als pending-Wissensobjekte dauerhaft`
          + ` (eager zurueckgestellt=${eager.zurueckgestellt}, vorgemerkt=${eager.vorgemerkt}).`
          + " Der fachliche Verstehensrueckstand bleibt offen (OP-14) und gilt NICHT als geloest.");
      }
    }
  } else if (status !== "abgeschlossen" && zugehoerige.length) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "datenstand-status-nicht-belegt", slotName));
  }

  const einstufung = befunde.some((b) => b.schwere === AUSGANG_NICHT_BESTANDEN)
    ? "vertragsverletzung"
    : (befunde.some((b) => b.schwere === AUSGANG_BLOCKIERT) ? "belegluecke" : "vollstaendig");
  return { slot: slotName, einstufung, status, befunde, warnungen };
}

// ---------------------------------------------------------------------------------------------
// Gesamtbewertung des Beobachtungsfensters.
// ---------------------------------------------------------------------------------------------

function bewerteNachweisfenster(eingaben = {}) {
  const {
    jetztMs = 0,
    fenster = null,
    aktivierungAtMs = null,
    crons = null,
    laeufe = null,
    aktiveMandate = null,
    erwarteteMandatszahl = null,
    kosten = null,
    kontextErklaerungen = {},
    bekannteFehlerklassen = BEKANNTE_FEHLERKLASSEN,
    fairnessLaeufe = null
  } = eingaben;

  const befunde = [];
  const warnungen = [];
  const ausgeschlossen = [];

  const ergebnis = (ausgang, laufErgebnisse = []) => ({
    ausgang,
    exitCode: EXIT_CODES[ausgang],
    befunde,
    warnungen,
    ausgeschlossen,
    laeufe: laufErgebnisse
  });

  // ---- Stufe 1: Fensterpruefung (geht allem voraus) ----------------------------------------
  if (aktivierungAtMs == null || !Number.isFinite(Number(aktivierungAtMs))) {
    befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "aktivierungszeitpunkt-unbekannt",
      "Der globale Abruf ist nicht (nachweislich) aktiviert — das neue Fenster beginnt erst nach"
      + " READY-Deployment und Betreiber-Aktivierung."));
    return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR);
  }
  if (!fenster || !Number.isFinite(Number(fenster.vonMs)) || !Number.isFinite(Number(fenster.bisMs))) {
    befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "kein-beobachtungsfenster",
      "Es wurde kein explizites Beobachtungsfenster (Start und Ende) uebergeben."));
    return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR);
  }
  if (fenster.vonMs < FRUEHESTER_FENSTERSTART_MS) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "fenster-vor-neustart",
      `Fensterstart ${new Date(fenster.vonMs).toISOString()} liegt vor dem verbindlichen Neustart`
      + " (2026-08-04). Der gescheiterte Lauf vom 2026-08-03 darf nie einfliessen."));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  if (fenster.vonMs < aktivierungAtMs) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "fenster-vor-aktivierung",
      `Fensterstart liegt vor der Aktivierung (${new Date(aktivierungAtMs).toISOString()}).`));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  if (fenster.bisMs - fenster.vonMs < MIN_FENSTER_MS) {
    befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "fenster-unter-24h",
      `Fensterlaenge ${Math.round((fenster.bisMs - fenster.vonMs) / 3600000)} h < 24 h — ein solches Fenster wird NIE gruen.`));
    return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR);
  }
  if (fenster.bisMs > jetztMs) {
    befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "fenster-noch-nicht-vergangen",
      `Fensterende ${new Date(fenster.bisMs).toISOString()} liegt in der Zukunft — verlangt sind 24 VOLLSTAENDIG vergangene Stunden.`));
    return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR);
  }

  // ---- Stufe 2: Eingabelesbarkeit (Belegluecken) -------------------------------------------
  if (!Array.isArray(laeufe)) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "laufdaten-nicht-lesbar",
      "Die Laufdatensaetze konnten nicht gelesen werden — ein leerer oder fehlerhaft gelesener"
      + " Datenbestand wird niemals als Erfolg behandelt."));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  const slots = erwarteteLaeufe({ vonMs: fenster.vonMs, bisMs: fenster.bisMs, crons });
  if (!slots || !slots.length) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "cron-kadenz-nicht-ermittelbar",
      "Die regulaere Kadenz der schweren Crons ist aus der wirksamen Konfiguration nicht ableitbar."));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  if (!Array.isArray(aktiveMandate) || !aktiveMandate.length) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "aktive-mandatsmenge-nicht-ermittelbar",
      "Die aktive Mandatsmenge ist nicht eindeutig ermittelbar."));
    return ergebnis(AUSGANG_BLOCKIERT);
  }
  if (erwarteteMandatszahl != null && aktiveMandate.length !== Number(erwarteteMandatszahl)) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "mandatszahl-weicht-von-erwartung-ab",
      `aktiv=${aktiveMandate.length}, erwartet=${erwarteteMandatszahl} — Betreiberentscheidung noetig.`));
    return ergebnis(AUSGANG_BLOCKIERT);
  }

  // ---- Laufzuordnung -----------------------------------------------------------------------
  const imFenster = (r) => {
    const start = laufStartAusRunId(r && r.runId);
    const ms = start ? start.startMs : Date.parse((r && r.createdAt) || "");
    return Number.isFinite(ms) && ms >= fenster.vonMs && ms < fenster.bisMs;
  };
  const globale = laeufe.filter((r) => r && r.mode === "global");
  const mandats = laeufe.filter((r) => r && r.mode === "mandat");

  // Alte, manuelle, unvollstaendige oder ausserhalb liegende Laeufe: AUSSCHLIESSEN und mit
  // Grund zaehlen — nie als Beleg verwenden.
  for (const r of globale) {
    if (!imFenster(r)) {
      ausgeschlossen.push({ runId: r.runId || "(ohne-kennung)", grund: "ausserhalb-des-fensters" });
      continue;
    }
    const start = laufStartAusRunId(r.runId);
    const passtZuSlot = start && slots.some((s) => s.cronName === start.cronName
      && Math.abs(start.startMs - s.geplantMs) <= SLOT_TOLERANZ_MS);
    if (!passtZuSlot) {
      ausgeschlossen.push({ runId: r.runId || "(ohne-kennung)", grund: "kein-regulaerer-cron-termin (manuell/ausserplanmaessig)" });
      warnungen.push(`Ausserplanmaessiger globaler Lauf im Fenster: ${r.runId || "(ohne-kennung)"} — nicht als Beleg verwendet.`);
    }
  }

  // Eingefrorene Mandatsmenge: die dynamisch ermittelte aktive Menge. Jeder Lauf im Fenster
  // muss exakt diese Menge tragen; jede Abweichung macht das Fenster ungueltig.
  const mandatsMenge = aktiveMandate.map(String);
  for (const r of globale.filter(imFenster)) {
    const qv = r.quellenVereinigung;
    if (qv && qv.mandate != null && Number(qv.mandate) !== mandatsMenge.length) {
      befunde.push(befund(AUSGANG_BLOCKIERT, "fenster-ungueltig-mandatsmenge-veraendert",
        `${r.runId}: Lauf sah ${qv.mandate} Mandate, Fenster ist auf ${mandatsMenge.length} eingefroren.`));
    }
  }

  // ---- Stufe 3: jeder erwartete Lauf gegen den Kapazitaetsvertrag --------------------------
  const laufErgebnisse = [];
  for (const slot of slots) {
    const globalerLauf = globale.find((r) => {
      const start = laufStartAusRunId(r.runId);
      return start && start.global && start.cronName === slot.cronName
        && Math.abs(start.startMs - slot.geplantMs) <= SLOT_TOLERANZ_MS;
    }) || null;
    const laufErgebnis = bewerteLauf({
      slot,
      globalerLauf,
      mandatsLaeufe: mandats,
      mandatsMenge,
      kontextErklaerung: (globalerLauf && kontextErklaerungen && (kontextErklaerungen[globalerLauf.runId] || kontextErklaerungen["*"])) || null,
      bekannteFehlerklassen,
      jetztMs
    });
    laufErgebnisse.push(laufErgebnis);
    befunde.push(...laufErgebnis.befunde);
    warnungen.push(...laufErgebnis.warnungen);
  }

  // Fairness-Laufdatensaetze (soweit vorhanden — je Cron nur der letzte): ein als
  // `abgebrochen` vermerkter Lauf im Fenster ist ein Vertragsbruch, eine Sperrverweigerung
  // zaehlt nie als Erfolg (der fehlende Mandatsdatensatz faellt oben bereits auf).
  for (const [cronName, lauf] of Object.entries(fairnessLaeufe || {})) {
    if (!lauf || !lauf.laufId) continue;
    const start = laufStartAusRunId(lauf.laufId);
    if (!start || start.startMs < fenster.vonMs || start.startMs >= fenster.bisMs) continue;
    if (lauf.status === "abgebrochen") {
      befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "lauf-abgebrochen",
        `${cronName}: ${lauf.laufId} traegt einen Abbruch-/Timeout-Vermerk.`));
    }
  }

  // ---- Kosten ------------------------------------------------------------------------------
  if (!kosten || kosten.fensterUsd == null || kosten.rahmenUsd == null) {
    befunde.push(befund(AUSGANG_BLOCKIERT, "kostenrahmen-nicht-belegbar",
      "LLM-Kosten des Fensters oder dokumentierter Vergleichsrahmen fehlen."));
  } else if (Number(kosten.fensterUsd) > Number(kosten.rahmenUsd)) {
    befunde.push(befund(AUSGANG_NICHT_BESTANDEN, "llm-kosten-ueber-rahmen",
      `Fenster ${kosten.fensterUsd} USD > Rahmen ${kosten.rahmenUsd} USD.`));
  }

  // ---- Vorrang -----------------------------------------------------------------------------
  const hat = (schwere) => befunde.some((b) => b.schwere === schwere);
  if (hat(AUSGANG_NICHT_BESTANDEN)) return ergebnis(AUSGANG_NICHT_BESTANDEN, laufErgebnisse);
  if (hat(AUSGANG_BLOCKIERT)) return ergebnis(AUSGANG_BLOCKIERT, laufErgebnisse);
  if (hat(AUSGANG_NOCH_NICHT_AUSWERTBAR)) return ergebnis(AUSGANG_NOCH_NICHT_AUSWERTBAR, laufErgebnisse);
  return ergebnis(AUSGANG_BESTANDEN, laufErgebnisse);
}

module.exports = {
  AUSGANG_BESTANDEN,
  AUSGANG_NICHT_BESTANDEN,
  AUSGANG_BLOCKIERT,
  AUSGANG_NOCH_NICHT_AUSWERTBAR,
  EXIT_CODES,
  MIN_FENSTER_MS,
  FRUEHESTER_FENSTERSTART_MS,
  SCHWERE_CRONS,
  AEUSSERES_LIMIT_MS,
  SLOT_TOLERANZ_MS,
  BEKANNTE_FEHLERKLASSEN,
  ZULAESSIGE_RUN_STATES,
  kontextAufgreifschwelle,
  parseTagesplan,
  schwereKadenz,
  erwarteteLaeufe,
  laufStartAusRunId,
  istRegulaererLauf,
  bewerteLauf,
  bewerteNachweisfenster
};
