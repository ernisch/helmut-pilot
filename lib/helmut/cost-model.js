"use strict";

// Ehrliche Kostenrechnung fuer den Betrieb (Phase-1-Punkt 17).
//
// Einfach erklaert: Helmut soll sagen koennen, was ein Lauf und was ein Tag
// kostet — und dabei NIE so tun, als waere ein unbekannter Betrag null. Dieses
// Modul ist der eine Ort, an dem aus dem rohen Nutzungslog (llmUsage) eine
// Kostenaussage wird. Es ist eine REINE Funktion: kein I/O, keine Uhr, kein
// Zufall, keine Datenbank. Dadurch ist jede Regel offline testbar.
//
// WARUM EIN EIGENES MODUL, KEIN ZWEITES ABRECHNUNGSSYSTEM:
// Die Zaehler existieren bereits (llmUsage im Auth-Store, llm_budget_counters in
// Supabase, source_crawl_telemetry, processRuns). Was fehlte, war die ehrliche
// Zusammenfassung: die Altsummen rechneten `typeof cost === "number" ? cost : 0`
// und machten damit aus einem unbekannten Betrag stillschweigend 0,00. Dieses
// Modul trennt statt zu addieren.
//
// DREI MESSSTATUS — die zentrale Unterscheidung:
//   'gemessen'            Provideraufruf fand statt, Tokens UND Preis liegen vor
//                         -> der Betrag ist eine belastbare Rechengroesse.
//   'kosten-unbekannt'    Provideraufruf fand statt, aber Tokens und/oder Preis
//                         fehlen -> Kosten sind UNBEKANNT, nicht null.
//   'kein-provideraufruf' der Aufruf wurde abgewiesen oder uebersprungen; es ging
//                         nie eine Anfrage an den Provider -> nachweislich 0,00.
// Nur der dritte Fall darf als 0 erscheinen. Genau dafuer existiert er.
//
// DREI ZURECHNUNGSKLASSEN:
//   'global'            geteilte Arbeit, die allen Mandanten zugutekommt
//                       (Understanding, KO-Backfills). Sie einem Mandanten
//                       zuzurechnen waere frei erfunden.
//   'direkt'            mandantenbezogener Pfad UND Mandant am Eintrag bekannt.
//   'nicht-zurechenbar' mandantenbezogener Pfad, aber kein Mandant am Eintrag.
// Eine Verteilung globaler Kosten auf Mandanten findet hier NICHT statt. Das
// Modul liefert nur die Bemessungsgrundlagen (siehe verteilungsgrundlage).

// Geteilte, mandantenlose KI-Pfade. Deckungsgleich mit
// storage.isSharedGlobalCallType (TENANT_EXEMPT_CALLTYPES + "understanding-*") —
// dort steuert die Liste den Per-Mandant-Deckel, hier die Kostenzurechnung.
// Bewusst dieselbe fachliche Definition, damit Deckel und Kostenbild nicht
// auseinanderlaufen.
const GLOBALE_CALLTYPES = new Set(["understanding", "koTagsBackfill"]);

// Diagnose-/Infrastrukturpfade: ein ECHTER Provideraufruf mit echten Kosten, der
// aber bewusst KEINE Budgetreservierung zieht (eine Diagnose muss gerade dann
// laufen, wenn das Budget erschoepft ist). Daraus folgen zwei Regeln, die sonst
// still falsche Zahlen erzeugen wuerden:
//   1. Sie duerfen keinen Budget-Kopfraum verbrauchen, den sie nie reserviert
//      haben — sonst verweigert das Vorab-Gate echte Fachaufrufe wegen einer
//      Diagnose (storage.getLlmUsageToday schliesst sie deshalb aus).
//   2. Sie duerfen den Reservierungsabgleich nicht verfaelschen — sie erhoehen
//      die Zahl protokollierter Aufrufe, ohne den Zaehler zu erhoehen, und
//      wuerden den Messbefund K-1 (fehlende Protokolleintraege) verwaessern.
// Kostenwahrheit bleibt unberuehrt: ihre Kosten zaehlen voll in jede Summe.
const NICHT_RESERVIERENDE_CALLTYPES = new Set(["pipeline-probe"]);

function istNichtReservierend(callType) {
  return NICHT_RESERVIERENDE_CALLTYPES.has(String(callType || ""));
}

function istGlobalerCallType(callType) {
  const ct = String(callType || "");
  // Diagnose ist geteilte Infrastruktur, kein Mandantenpfad. Ohne diese Zeile
  // liefe sie als "nicht-zurechenbar" und wuerde eine Mandanten-Messluecke
  // vortaeuschen, die es nicht gibt.
  return GLOBALE_CALLTYPES.has(ct) || ct.startsWith("understanding-") || istNichtReservierend(ct);
}

// Ein "skipped-*"-Eintrag ist ein Protokolleintrag ueber einen NICHT
// stattgefundenen Aufruf (Budget erschoepft, Pfad uebersprungen, Vorpruefung
// negativ). Identische Konvention wie storage.getLlmUsageToday.
function istUebersprungen(entry) {
  return String((entry && entry.callType) || "").startsWith("skipped");
}

// Zahl oder null — "unknown" (der Platzhalter aus buildLlmUsageRecord), null,
// undefined, "" und NaN werden alle zu null. Negative Werte sind fachlich
// unmoeglich (Tokens/Kosten) und gelten ebenfalls als unbekannt: ein negativer
// Betrag darf eine Summe nie kleiner machen.
function zahlOderNull(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "unknown") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

// Rundung auf 6 Nachkommastellen (USD-Mikrobetraege), identisch zu
// storage.estimateLlmCost — damit Summen hier und dort nicht um Rundungsreste
// auseinanderlaufen.
function rund6(n) {
  return Math.round(n * 1e6) / 1e6;
}

// Klassifiziert GENAU EINEN Nutzungseintrag. Erfindet nichts: fehlt eine
// Angabe, wird sie null und der Grund benannt.
function klassifiziereEintrag(rohEintrag = {}) {
  // Ein Default-Parameter greift NUR bei undefined, nicht bei null — ein
  // null-Eintrag im Log wuerde sonst die gesamte Aggregation abstuerzen lassen.
  const entry = rohEintrag && typeof rohEintrag === "object" ? rohEintrag : {};
  const callType = String(entry.callType || "unbekannt");
  const modell = String(entry.model || "unknown");
  const uebersprungen = istUebersprungen(entry);
  // model === "none" ist die Konvention der Skip-Protokolle (understanding.js
  // logSkip, ai.js reserveLlmBudgetOrThrow): es gab keinen Provideraufruf.
  const keinProvideraufruf = uebersprungen || modell === "none";

  const inputTokens = zahlOderNull(entry.promptTokens);
  const outputTokens = zahlOderNull(entry.completionTokens);
  const gesamtTokens = zahlOderNull(entry.totalTokens);
  const kostenUsd = zahlOderNull(entry.estimatedCost);

  let messstatus;
  let grund = null;
  if (keinProvideraufruf) {
    messstatus = "kein-provideraufruf";
    grund = entry.error ? String(entry.error).slice(0, 200) : "uebersprungen";
  } else if (kostenUsd == null) {
    messstatus = "kosten-unbekannt";
    // Der haeufigste reale Fall: der Provider hat den usage-Block nicht
    // geliefert (Fehlerantwort, Timeout, Parse-Fehler). Zweiter Fall: das
    // Modell steht nicht in der Preistabelle.
    if (inputTokens == null && outputTokens == null) {
      grund = entry.success === false
        ? "Provider hat keine Nutzung gemeldet (fehlgeschlagener Aufruf)"
        : "Provider hat keinen usage-Block geliefert";
    } else {
      grund = `kein hinterlegter Preis fuer Modell "${modell}"`;
    }
  } else {
    messstatus = "gemessen";
  }

  const mandant = entry.tenantId || entry.politicianId || entry.userId || null;
  const global = istGlobalerCallType(callType);
  let zurechnung;
  if (global) zurechnung = "global";
  else if (mandant) zurechnung = "direkt";
  else zurechnung = "nicht-zurechenbar";

  return {
    id: entry.id || null,
    zeitpunkt: entry.createdAt || null,
    laufkennung: entry.runId || null,
    // pipelineStep faellt in buildLlmUsageRecord auf callType zurueck; aeltere
    // Eintraege haben das Feld gar nicht -> dann ist der callType der Schritt.
    pipelineSchritt: String(entry.pipelineStep || callType || "unbekannt"),
    callType,
    modell,
    // Ein Modellname ist kein Provider. Solange nur ein Provider im Einsatz ist,
    // waere eine Ableitung geraten — deshalb explizit uebergebbar und sonst null.
    provider: entry.provider || null,
    mandant,
    zurechnung,
    messstatus,
    grund,
    // false = realer Aufruf, der bewusst keine Reservierung zieht (Diagnose).
    budgetwirksam: !istNichtReservierend(callType),
    erfolgreich: entry.success !== false,
    inputTokens,
    outputTokens,
    gesamtTokens: gesamtTokens != null
      ? gesamtTokens
      : (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null),
    kostenUsd,
    dauerMs: zahlOderNull(entry.durationMs)
  };
}

// Schutz vor Doppelzaehlung: derselbe Nutzungseintrag darf nie zweimal in eine
// Summe eingehen. Idempotenzmerkmal ist die Eintrags-Id (buildLlmUsageRecord
// vergibt sie einmalig je Provideraufruf). Ein Retry erzeugt bewusst eine NEUE
// Id — echte Zusatzkosten sollen auch als Zusatzkosten erscheinen.
// Eintraege ohne Id koennen nicht dedupliziert werden und bleiben alle erhalten;
// ihre Zahl wird als eigener Messbefund zurueckgegeben, statt sie zu verstecken.
function entdoppele(entries = []) {
  const gesehen = new Set();
  const behalten = [];
  let doppelt = 0;
  let ohneId = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    const id = e && e.id ? String(e.id) : null;
    if (!id) { ohneId += 1; behalten.push(e); continue; }
    if (gesehen.has(id)) { doppelt += 1; continue; }
    gesehen.add(id);
    behalten.push(e);
  }
  return { eintraege: behalten, doppelt, ohneId };
}

function leereSumme() {
  return { aufrufe: 0, gemessen: 0, kostenUnbekannt: 0, keinProvideraufruf: 0, kostenUsd: 0, inputTokens: 0, outputTokens: 0 };
}

function addiere(ziel, k) {
  ziel.aufrufe += 1;
  if (k.messstatus === "gemessen") {
    ziel.gemessen += 1;
    ziel.kostenUsd += k.kostenUsd;
    if (k.inputTokens != null) ziel.inputTokens += k.inputTokens;
    if (k.outputTokens != null) ziel.outputTokens += k.outputTokens;
  } else if (k.messstatus === "kosten-unbekannt") {
    ziel.kostenUnbekannt += 1;
    // Tokens koennen vorhanden sein, auch wenn der Preis fehlt — dann zaehlen
    // sie mit, damit die Nutzungseinheit vollstaendig bleibt (Auftrag: "Tokens
    // vollstaendig anzeigen, Kosten als nicht verfuegbar markieren").
    if (k.inputTokens != null) ziel.inputTokens += k.inputTokens;
    if (k.outputTokens != null) ziel.outputTokens += k.outputTokens;
  } else {
    ziel.keinProvideraufruf += 1;
  }
  return ziel;
}

function rundeSumme(s) {
  s.kostenUsd = rund6(s.kostenUsd);
  return s;
}

// Messvollstaendigkeit in Worten, wie sie im Betriebsbericht erscheinen darf.
// Bezugsgroesse sind NUR tatsaechliche Provideraufrufe — uebersprungene Aufrufe
// sind vollstaendig gemessen (sie kosteten nachweislich nichts).
function messvollstaendigkeit(summe) {
  const provideraufrufe = summe.gemessen + summe.kostenUnbekannt;
  if (provideraufrufe === 0) return summe.aufrufe > 0 ? "vollstaendig gemessen" : "keine Aufrufe";
  if (summe.kostenUnbekannt === 0) return "vollstaendig gemessen";
  if (summe.gemessen === 0) return "Kosten unbekannt";
  return "teilweise gemessen";
}

// Budgetstatus in Worten. limit === null -> kein Deckel bekannt.
function budgetStatus(verbraucht, limit, warnAnteil = 0.8) {
  if (!Number.isFinite(limit) || limit <= 0) return "Budget unbekannt";
  if (!Number.isFinite(verbraucht)) return "Budgetstand unbekannt";
  if (verbraucht >= limit) return "Budget erreicht";
  if (verbraucht >= Math.floor(limit * warnAnteil)) return "Budget nahezu erreicht";
  return "Budget frei";
}

// Kernfunktion: aggregiert eine Menge Nutzungseintraege zu EINER ehrlichen
// Kostenaussage — verwendbar fuer einen Lauf, einen Tag oder einen beliebigen
// Ausschnitt. Die Aufteilung nach Lauf/Tag trifft der Aufrufer per Filter.
function aggregiere(entries = [], opts = {}) {
  const { eintraege, doppelt, ohneId } = opts.bereitsEntdoppelt
    ? { eintraege: entries, doppelt: 0, ohneId: 0 }
    : entdoppele(entries);

  const klassifiziert = eintraege.map(klassifiziereEintrag);

  const gesamt = leereSumme();
  const jeModell = {};
  const jePipelineSchritt = {};
  const jeZurechnung = { global: leereSumme(), direkt: leereSumme(), "nicht-zurechenbar": leereSumme() };
  const jeMandant = {};
  const abweisungsgruende = {};
  const unbekannteGruende = {};
  const modelleOhnePreis = new Set();

  for (const k of klassifiziert) {
    addiere(gesamt, k);
    addiere((jeModell[k.modell] = jeModell[k.modell] || leereSumme()), k);
    addiere((jePipelineSchritt[k.pipelineSchritt] = jePipelineSchritt[k.pipelineSchritt] || leereSumme()), k);
    addiere(jeZurechnung[k.zurechnung], k);
    if (k.zurechnung === "direkt") {
      addiere((jeMandant[k.mandant] = jeMandant[k.mandant] || leereSumme()), k);
    }
    if (k.messstatus === "kein-provideraufruf") {
      const g = k.grund || "uebersprungen";
      abweisungsgruende[g] = (abweisungsgruende[g] || 0) + 1;
    }
    if (k.messstatus === "kosten-unbekannt") {
      const g = k.grund || "unbekannt";
      unbekannteGruende[g] = (unbekannteGruende[g] || 0) + 1;
      if (k.inputTokens != null || k.outputTokens != null) modelleOhnePreis.add(k.modell);
    }
  }

  rundeSumme(gesamt);
  for (const v of Object.values(jeModell)) rundeSumme(v);
  for (const v of Object.values(jePipelineSchritt)) rundeSumme(v);
  for (const v of Object.values(jeZurechnung)) rundeSumme(v);
  for (const v of Object.values(jeMandant)) rundeSumme(v);

  // Laufzuordnung: wie viele Provideraufrufe tragen ueberhaupt eine Laufkennung?
  const provideraufrufe = klassifiziert.filter((k) => k.messstatus !== "kein-provideraufruf");
  const mitLaufkennung = provideraufrufe.filter((k) => k.laufkennung).length;
  // Aufrufe, die real stattfanden, aber per Konstruktion keine Reservierung
  // ziehen (Diagnose). Sie sind der einzige zulaessige Grund dafuer, dass mehr
  // Aufrufe protokolliert als reserviert wurden.
  const nichtReservierend = provideraufrufe.filter((k) => k.budgetwirksam === false).length;

  return {
    gesamt,
    jeModell,
    jePipelineSchritt,
    jeZurechnung,
    jeMandant,
    abweisungsgruende,
    unbekannteGruende,
    modelleOhnePreis: [...modelleOhnePreis].sort(),
    messvollstaendigkeit: messvollstaendigkeit(gesamt),
    // Ehrliche Selbstauskunft der Messung selbst:
    messbefunde: {
      doppelteEintraegeVerworfen: doppelt,
      eintraegeOhneIdempotenzmerkmal: ohneId,
      provideraufrufe: provideraufrufe.length,
      davonMitLaufkennung: mitLaufkennung,
      laufzuordnungAnteil: provideraufrufe.length ? rund6(mitLaufkennung / provideraufrufe.length) : null,
      nichtReservierendeAufrufe: nichtReservierend
    },
    // Bemessungsgrundlagen fuer eine SPAETERE Verteilung globaler Kosten. Bewusst
    // nur Zaehlgroessen, KEINE Verteilungsformel und kein verteilter Betrag —
    // eine Formel ohne belastbare Grundlage waere eine erfundene Wahrheit.
    verteilungsgrundlage: {
      globaleKostenUsd: jeZurechnung.global.kostenUsd,
      globaleAufrufe: jeZurechnung.global.aufrufe,
      direktZurechenbareKostenUsd: jeZurechnung.direkt.kostenUsd,
      nichtZurechenbareKostenUsd: jeZurechnung["nicht-zurechenbar"].kostenUsd,
      mandantenMitDirektenKosten: Object.keys(jeMandant).sort(),
      hinweis: "Globale Kosten werden NICHT verteilt. Eine Verteilung braucht eine belastbare Bezugsgroesse (z. B. je Mandant tatsaechlich ausgelieferte Vorgaenge); die liegt noch nicht gemessen vor."
    }
  };
}

// Vergleicht den atomaren Reservierungszaehler (llm_budget_counters.used) mit der
// Zahl der protokollierten Provideraufrufe desselben Tages.
//
// Warum das noetig ist: reserviert wird VOR dem Modellaufruf (atomar, in der
// Datenbank), protokolliert wird DANACH (fire-and-forget in ein JSON-Dokument
// mit Last-Write-Wins). Beides kann auseinanderlaufen, und die Richtung sagt,
// welcher Fehler vorliegt:
//   zaehler > protokoll  -> Protokolleintraege fehlen. Die bekannten Kosten sind
//                           dann eine UNTERGRENZE, kein Gesamtwert.
//   zaehler < protokoll  -> es liefen mehr Aufrufe als reserviert wurden (Bypass,
//                           Zaehler spaeter eingefuehrt, oder Reset des Zaehlers).
// Eine Reservierung wird bewusst NIE freigegeben (siehe storage.js) — der
// Zaehler misst also Reservierungen, nicht bestaetigte Kosten. Genau deshalb
// darf er nicht als Kostenzahl gelesen werden.
// nichtReservierend: Zahl der Provideraufrufe, die per Konstruktion keine
// Reservierung ziehen (Diagnose). Sie werden abgezogen, sonst meldet der
// Abgleich faelschlich "mehr Aufrufe als Reservierungen".
function abgleichReservierung(zaehlerUsed, summe, nichtReservierend = 0) {
  // Achtung: Number(null) === 0 und Number("") === 0. Ein fehlender Zaehler
  // wuerde damit als "0 Reservierungen" gelesen und faelschlich als
  // deckungsgleich oder als Zaehler-Ueberschuss bewertet. Fehlend heisst
  // fehlend — genau die Unterscheidung, um die es in diesem Modul geht.
  const fehlt = zaehlerUsed === null || zaehlerUsed === undefined
    || (typeof zaehlerUsed === "string" && zaehlerUsed.trim() === "");
  const alsZahl = fehlt ? NaN : Number(zaehlerUsed);
  const zaehler = Number.isFinite(alsZahl) ? alsZahl : null;
  const abzug = Number.isFinite(Number(nichtReservierend)) ? Math.max(0, Number(nichtReservierend)) : 0;
  const protokolliert = summe ? Math.max(0, summe.gemessen + summe.kostenUnbekannt - abzug) : null;
  if (zaehler == null || protokolliert == null) {
    return { zaehler, protokolliert, differenz: null, bewertung: "nicht vergleichbar", kostenSindUntergrenze: true };
  }
  const differenz = zaehler - protokolliert;
  let bewertung;
  if (differenz === 0) bewertung = "deckungsgleich";
  else if (differenz > 0) bewertung = "Protokolleintraege fehlen (Kosten sind eine Untergrenze)";
  else bewertung = "mehr Aufrufe als Reservierungen (Zaehler unvollstaendig)";
  return { zaehler, protokolliert, differenz, bewertung, kostenSindUntergrenze: differenz > 0 };
}

// Kurzer, fuer nicht-technische Betreiber lesbarer Satz zu den bekannten Kosten.
// Gibt NIE "0,00" aus, wenn unbekannte Anteile bestehen.
function kostensatz(summe, waehrung = "USD") {
  const betrag = `${summe.kostenUsd.toFixed(4)} ${waehrung}`;
  if (summe.kostenUnbekannt === 0) {
    return summe.gemessen === 0
      ? "Keine abrechenbaren Aufrufe — nachweislich 0,00 (kein Provideraufruf)"
      : `Bekannte Kosten: ${betrag} (vollstaendig gemessen)`;
  }
  return `Bekannte Kosten: ${betrag} · zusaetzlich ${summe.kostenUnbekannt} Aufruf(e) mit unbekannten Kosten`;
}

module.exports = {
  GLOBALE_CALLTYPES,
  NICHT_RESERVIERENDE_CALLTYPES,
  istNichtReservierend,
  istGlobalerCallType,
  istUebersprungen,
  zahlOderNull,
  klassifiziereEintrag,
  entdoppele,
  aggregiere,
  messvollstaendigkeit,
  budgetStatus,
  abgleichReservierung,
  kostensatz,
  leereSumme
};
