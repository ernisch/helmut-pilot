"use strict";

// Tests fuer die ehrliche Kostenmessung (Phase-1-Punkt 17).
//
// Prueft den reinen Kostenkern (lib/helmut/cost-model.js) gegen genau die Faelle,
// die in Production real vorkommen — jeder Testfall unten entspricht einem am
// 2026-07-26 lesend gemessenen Muster, nicht einer ausgedachten Situation:
//   · estimatedCost/Token als String "unknown"   (1304 von 2493 Eintraegen)
//   · model "none" bei uebersprungenen Aufrufen  (1276 Eintraege)
//   · runId/tenantId durchgehend null            (0 von 1290 befuellt)
//   · Reservierungszaehler > protokollierte Aufrufe (an allen 12 gemessenen Tagen)
//
// Kein Netz, keine Datenbank, keine Uhr.

const cm = require("../lib/helmut/cost-model");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Bausteine, die den Production-Formen entsprechen.
const gemessen = (over = {}) => ({
  id: `u-${Math.random().toString(36).slice(2, 9)}`, createdAt: "2026-07-26T10:00:00.000Z",
  model: "gpt-5-mini", callType: "understanding", pipelineStep: "understanding",
  promptTokens: 4000, completionTokens: 1000, totalTokens: 5000,
  estimatedCost: 0.003, durationMs: 5000, success: true, error: null,
  runId: null, tenantId: null, politicianId: null, userId: null, ...over
});
const unbekannt = (over = {}) => gemessen({
  promptTokens: "unknown", completionTokens: "unknown", totalTokens: "unknown",
  estimatedCost: "unknown", durationMs: "unknown", success: false, error: "OpenAI HTTP 500", ...over
});
const uebersprungen = (over = {}) => gemessen({
  model: "none", callType: "skipped-understanding", pipelineStep: "skipped-understanding",
  promptTokens: "unknown", completionTokens: "unknown", totalTokens: "unknown",
  estimatedCost: "unknown", durationMs: "unknown", success: false, error: "daily-llm-budget-reached", ...over
});

console.log("== 1) Messstatus: die drei Faelle werden unterschieden ==");
check("gemessener Aufruf -> 'gemessen'", cm.klassifiziereEintrag(gemessen()).messstatus === "gemessen");
check("Provideraufruf ohne Tokenmeldung -> 'kosten-unbekannt'", cm.klassifiziereEintrag(unbekannt()).messstatus === "kosten-unbekannt");
check("uebersprungener Aufruf -> 'kein-provideraufruf'", cm.klassifiziereEintrag(uebersprungen()).messstatus === "kein-provideraufruf");
check("model 'none' zaehlt auch ohne skipped-Praefix als kein Provideraufruf",
  cm.klassifiziereEintrag(gemessen({ model: "none", callType: "understanding" })).messstatus === "kein-provideraufruf");
check("Grund bei fehlgeschlagenem Aufruf ist benannt",
  /keine Nutzung gemeldet/.test(cm.klassifiziereEintrag(unbekannt()).grund || ""));

console.log("== 2) 'unknown' wird NIE zu 0 ==");
check("String 'unknown' -> null, nicht 0", cm.zahlOderNull("unknown") === null);
check("leerer String -> null", cm.zahlOderNull("") === null);
check("null -> null", cm.zahlOderNull(null) === null);
check("echte 0 bleibt 0", cm.zahlOderNull(0) === 0);
const a1 = cm.aggregiere([gemessen(), unbekannt()]);
check("bekannte Kosten enthalten NUR den gemessenen Aufruf", a1.gesamt.kostenUsd === 0.003);
check("unbekannter Aufruf wird separat gezaehlt", a1.gesamt.kostenUnbekannt === 1);
check("Messvollstaendigkeit = teilweise gemessen", a1.messvollstaendigkeit === "teilweise gemessen");
check("Klartext nennt die unbekannten Aufrufe", /unbekannten Kosten/.test(cm.kostensatz(a1.gesamt)));

console.log("== 3) Kein falsches 0,00 ==");
const nurUnbekannt = cm.aggregiere([unbekannt(), unbekannt()]);
check("nur unbekannte Aufrufe -> Messstatus 'Kosten unbekannt'", nurUnbekannt.messvollstaendigkeit === "Kosten unbekannt");
check("nur unbekannte Aufrufe -> Klartext behauptet KEINE 0,00",
  !/nachweislich 0,00/.test(cm.kostensatz(nurUnbekannt.gesamt)), cm.kostensatz(nurUnbekannt.gesamt));
const nurSkips = cm.aggregiere([uebersprungen(), uebersprungen()]);
check("nur uebersprungene Aufrufe -> 'vollstaendig gemessen'", nurSkips.messvollstaendigkeit === "vollstaendig gemessen");
check("nur uebersprungene Aufrufe -> 0,00 ist erlaubt und wird benannt",
  /nachweislich 0,00/.test(cm.kostensatz(nurSkips.gesamt)), cm.kostensatz(nurSkips.gesamt));

console.log("== 4) Negative Werte gelten als unbekannt, nie als Gutschrift ==");
check("negative Kosten -> null", cm.zahlOderNull(-1) === null);
const neg = cm.aggregiere([gemessen(), gemessen({ estimatedCost: -5 })]);
check("negativer Betrag senkt die Summe nicht", neg.gesamt.kostenUsd === 0.003);
check("negativer Betrag wird als unbekannt gezaehlt", neg.gesamt.kostenUnbekannt === 1);
check("negative Tokenmenge -> null", cm.zahlOderNull(-100) === null);

console.log("== 5) Schutz vor Doppelzaehlung (Idempotenz ueber die Eintrags-Id) ==");
const e = gemessen({ id: "u-fix" });
const dop = cm.aggregiere([e, { ...e }, { ...e }]);
check("dreimal derselbe Eintrag zaehlt einmal", dop.gesamt.aufrufe === 1);
check("Kosten werden nicht verdreifacht", dop.gesamt.kostenUsd === 0.003);
check("verworfene Doppel werden ausgewiesen", dop.messbefunde.doppelteEintraegeVerworfen === 2);
const ohneId = cm.aggregiere([{ ...gemessen(), id: null }, { ...gemessen(), id: null }]);
check("Eintraege ohne Id werden NICHT stillschweigend verworfen", ohneId.gesamt.aufrufe === 2);
check("fehlendes Idempotenzmerkmal wird als Befund gemeldet", ohneId.messbefunde.eintraegeOhneIdempotenzmerkmal === 2);

console.log("== 6) Retry ist echter Zusatzverbrauch, keine Doppelzaehlung ==");
const retry = cm.aggregiere([gemessen({ id: "v1" }), gemessen({ id: "v2" })]);
check("zwei echte Aufrufe (eigene Ids) zaehlen zweimal", retry.gesamt.aufrufe === 2);
check("zwei echte Aufrufe summieren die Kosten", retry.gesamt.kostenUsd === 0.006);

console.log("== 7) Parallele Eintraege desselben Zeitpunkts bleiben getrennt ==");
const parallel = cm.aggregiere([
  gemessen({ id: "p1", createdAt: "2026-07-26T10:00:00.000Z" }),
  gemessen({ id: "p2", createdAt: "2026-07-26T10:00:00.000Z" }),
  gemessen({ id: "p3", createdAt: "2026-07-26T10:00:00.000Z" })
]);
check("gleicher Zeitstempel, verschiedene Ids -> 3 Aufrufe", parallel.gesamt.aufrufe === 3);
check("gleicher Zeitstempel -> Kosten summiert", Math.abs(parallel.gesamt.kostenUsd - 0.009) < 1e-9);

console.log("== 8) Global vs. mandantenspezifisch vs. nicht zurechenbar ==");
const zur = cm.aggregiere([
  gemessen({ id: "g1", callType: "understanding" }),
  gemessen({ id: "g2", callType: "koTagsBackfill", pipelineStep: "koTagsBackfill" }),
  gemessen({ id: "g3", callType: "understanding-staff", pipelineStep: "understanding-staff" }),
  gemessen({ id: "d1", callType: "communicationDraft", pipelineStep: "communicationDraft", userId: "mandant-a" }),
  gemessen({ id: "n1", callType: "communicationDraft", pipelineStep: "communicationDraft", userId: null })
]);
check("understanding ist global", zur.jeZurechnung.global.aufrufe === 3);
check("mandantenbezogener Pfad mit Mandant -> direkt", zur.jeZurechnung.direkt.aufrufe === 1);
check("mandantenbezogener Pfad ohne Mandant -> nicht-zurechenbar", zur.jeZurechnung["nicht-zurechenbar"].aufrufe === 1);
check("globale Kosten werden NICHT einem Mandanten zugeschlagen", Object.keys(zur.jeMandant).length === 1);
check("Mandantensumme enthaelt nur den direkten Aufruf", zur.jeMandant["mandant-a"].kostenUsd === 0.003);
check("tenantId hat Vorrang vor userId",
  cm.klassifiziereEintrag(gemessen({ callType: "communicationDraft", tenantId: "t-1", userId: "u-9" })).mandant === "t-1");

console.log("== 9) Keine erfundene Verteilung globaler Kosten ==");
check("globale Kosten bleiben als eigene Groesse stehen", zur.verteilungsgrundlage.globaleKostenUsd === 0.009);
check("es wird KEIN verteilter Betrag ausgewiesen",
  !Object.prototype.hasOwnProperty.call(zur.verteilungsgrundlage, "verteiltJeMandant"));
check("der Hinweis benennt die fehlende Bezugsgroesse", /belastbare Bezugsgroesse/.test(zur.verteilungsgrundlage.hinweis));

console.log("== 10) Aufschluesselung nach Pipeline-Schritt und Modell ==");
check("Pipeline-Schritt 'understanding' getrennt gefuehrt", zur.jePipelineSchritt.understanding.aufrufe === 1);
check("Pipeline-Schritt faellt ohne Feld auf den callType zurueck",
  cm.klassifiziereEintrag({ id: "x", callType: "lageBriefing", model: "gpt-5-mini" }).pipelineSchritt === "lageBriefing");
check("Modell wird gefuehrt", zur.jeModell["gpt-5-mini"].aufrufe === 5);
check("Modell ohne Preis wird als solches gemeldet",
  cm.aggregiere([gemessen({ model: "phantom-9", estimatedCost: "unknown" })]).modelleOhnePreis.includes("phantom-9"));
check("Grund nennt den fehlenden Preis",
  /kein hinterlegter Preis/.test(cm.klassifiziereEintrag(gemessen({ model: "phantom-9", estimatedCost: "unknown" })).grund));

console.log("== 11) Tokens bleiben sichtbar, auch wenn der Preis fehlt ==");
const ohnePreis = cm.aggregiere([gemessen({ model: "phantom-9", estimatedCost: "unknown" })]);
check("Input-Tokens werden trotz fehlendem Preis gezaehlt", ohnePreis.gesamt.inputTokens === 4000);
check("Output-Tokens werden trotz fehlendem Preis gezaehlt", ohnePreis.gesamt.outputTokens === 1000);
check("Kosten bleiben dabei 0 bekannt + 1 unbekannt",
  ohnePreis.gesamt.kostenUsd === 0 && ohnePreis.gesamt.kostenUnbekannt === 1);

console.log("== 12) Abgewiesene Aufrufe: gezaehlt, aber nie als Kosten ==");
const abgewiesen = cm.aggregiere([
  uebersprungen({ id: "s1", error: "daily-llm-budget-reached" }),
  uebersprungen({ id: "s2", error: "daily-llm-budget-reached" }),
  uebersprungen({ id: "s3", error: "daily-llm-budget-reserved-for-understanding" })
]);
check("abgewiesene Aufrufe erzeugen 0,00 Kosten", abgewiesen.gesamt.kostenUsd === 0);
check("abgewiesene Aufrufe werden vollstaendig gezaehlt", abgewiesen.gesamt.keinProvideraufruf === 3);
check("Abweisungsgruende werden nach Grund aufgeschluesselt",
  abgewiesen.abweisungsgruende["daily-llm-budget-reached"] === 2);
check("zweiter Abweisungsgrund getrennt gefuehrt",
  abgewiesen.abweisungsgruende["daily-llm-budget-reserved-for-understanding"] === 1);
check("abgewiesene Aufrufe zaehlen NICHT als Provideraufrufe", abgewiesen.messbefunde.provideraufrufe === 0);

console.log("== 13) Reservierung, Bestaetigung, Freigabe — Abgleich mit dem Zaehler ==");
const tag = cm.aggregiere([gemessen({ id: "t1" }), gemessen({ id: "t2" }), uebersprungen({ id: "t3" })]);
const gleich = cm.abgleichReservierung(2, tag.gesamt);
check("Zaehler == protokollierte Provideraufrufe -> deckungsgleich", gleich.bewertung === "deckungsgleich");
check("uebersprungene Aufrufe zaehlen NICHT gegen die Reservierung", gleich.protokolliert === 2);
const zuWenig = cm.abgleichReservierung(12, tag.gesamt);
check("Zaehler > Protokoll -> Protokolleintraege fehlen", /Protokolleintraege fehlen/.test(zuWenig.bewertung));
check("Zaehler > Protokoll -> Kosten sind ausdruecklich eine Untergrenze", zuWenig.kostenSindUntergrenze === true);
check("Differenz wird beziffert", zuWenig.differenz === 10);
const zuViel = cm.abgleichReservierung(1, tag.gesamt);
check("Zaehler < Protokoll -> Zaehler unvollstaendig", /mehr Aufrufe als Reservierungen/.test(zuViel.bewertung));
check("fehlender Zaehler -> nicht vergleichbar statt Behauptung",
  cm.abgleichReservierung(null, tag.gesamt).bewertung === "nicht vergleichbar");
check("fehlender Zaehler -> Kosten gelten als Untergrenze (konservativ)",
  cm.abgleichReservierung(null, tag.gesamt).kostenSindUntergrenze === true);

console.log("== 14) Budgetstatus in Betreibersprache ==");
check("weit unter Limit -> Budget frei", cm.budgetStatus(10, 100) === "Budget frei");
check("80 % -> Budget nahezu erreicht", cm.budgetStatus(80, 100) === "Budget nahezu erreicht");
check("Limit erreicht -> Budget erreicht", cm.budgetStatus(100, 100) === "Budget erreicht");
check("ueber Limit -> Budget erreicht", cm.budgetStatus(120, 100) === "Budget erreicht");
check("ohne Limit -> Budget unbekannt (keine Entwarnung)", cm.budgetStatus(10, null) === "Budget unbekannt");
check("unbekannter Verbrauch -> Budgetstand unbekannt", cm.budgetStatus(null, 100) === "Budgetstand unbekannt");

console.log("== 15) Laufzuordnung wird ehrlich beziffert ==");
const laufMix = cm.aggregiere([
  gemessen({ id: "r1", runId: "crawl-1" }),
  gemessen({ id: "r2", runId: null }),
  uebersprungen({ id: "r3", runId: null })
]);
check("Laufkennung wird uebernommen", cm.klassifiziereEintrag(gemessen({ runId: "crawl-1" })).laufkennung === "crawl-1");
check("Provideraufrufe = 2 (der uebersprungene zaehlt nicht)", laufMix.messbefunde.provideraufrufe === 2);
check("davon 1 mit Laufkennung", laufMix.messbefunde.davonMitLaufkennung === 1);
check("Anteil wird beziffert (0.5)", laufMix.messbefunde.laufzuordnungAnteil === 0.5);
check("Altbestand ohne jede Laufkennung -> Anteil 0",
  cm.aggregiere([gemessen({ id: "z1" })]).messbefunde.laufzuordnungAnteil === 0);

console.log("== 16) Abgebrochene und leere Laeufe ==");
const leer = cm.aggregiere([]);
check("leerer Lauf -> 0 Aufrufe", leer.gesamt.aufrufe === 0);
check("leerer Lauf -> Messstatus 'keine Aufrufe' statt 'gemessen'", leer.messvollstaendigkeit === "keine Aufrufe");
check("leerer Lauf -> Kosten exakt 0", leer.gesamt.kostenUsd === 0);
const abgebrochen = cm.aggregiere([gemessen({ id: "ab1" }), unbekannt({ id: "ab2", error: "request-error:ECONNRESET" })]);
check("abgebrochener Lauf haelt bekannte Kosten fest", abgebrochen.gesamt.kostenUsd === 0.003);
check("abgebrochener Lauf weist den unbekannten Anteil aus", abgebrochen.gesamt.kostenUnbekannt === 1);
check("abgebrochener Lauf gilt nicht als vollstaendig gemessen", abgebrochen.messvollstaendigkeit === "teilweise gemessen");

console.log("== 17) Robustheit gegen Schrott-Eingaben (nie Absturz, nie erfundene Zahl) ==");
let robust = true;
try {
  cm.aggregiere(null); cm.aggregiere(undefined); cm.aggregiere("keine Liste");
  cm.klassifiziereEintrag(null); cm.klassifiziereEintrag(undefined); cm.klassifiziereEintrag({});
  cm.abgleichReservierung("abc", null);
} catch (err) { robust = false; console.log("   ", err && err.message); }
check("kein Absturz bei fehlerhaften Eingaben", robust);
check("leerer Eintrag -> Modell 'unknown', nicht geraten", cm.klassifiziereEintrag({}).modell === "unknown");
check("leerer Eintrag -> Kosten null, nicht 0", cm.klassifiziereEintrag({}).kostenUsd === null);
check("Provider wird NICHT aus dem Modellnamen geraten", cm.klassifiziereEintrag(gemessen()).provider === null);

console.log("== 18) Waehrung und Rundung ==");
const rund = cm.aggregiere([gemessen({ id: "c1", estimatedCost: 0.0000004 }), gemessen({ id: "c2", estimatedCost: 0.0000004 })]);
check("Mikrobetraege werden auf 6 Nachkommastellen gerundet", rund.gesamt.kostenUsd === 0.000001);
check("Klartext nennt die Waehrung", /USD/.test(cm.kostensatz(cm.aggregiere([gemessen()]).gesamt)));
check("keine stille EUR-Umrechnung im Klartext", !/EUR|€/.test(cm.kostensatz(cm.aggregiere([gemessen()]).gesamt)));

console.log("== 19) Preisherkunft wird deklariert, nicht behauptet ==");
const storage = require("../lib/helmut/storage");
const altJson = process.env.HELMUT_LLM_PRICE_JSON;
const altSrc = process.env.HELMUT_LLM_PRICE_SOURCE;
delete process.env.HELMUT_LLM_PRICE_JSON; delete process.env.HELMUT_LLM_PRICE_SOURCE;
const ohneBeleg = storage.llmPriceProvenance();
check("ohne belegte Quelle -> herkunft 'unbelegt-schaetzwert'", ohneBeleg.herkunft === "unbelegt-schaetzwert");
check("ohne Beleg wird der Schaetzwert-Charakter benannt", /Schaetzwert/.test(ohneBeleg.hinweis));
check("Waehrung ist ausgewiesen", ohneBeleg.waehrung === "USD");
check("die Preise selbst bleiben unveraendert (gpt-5-mini gefuehrt)", ohneBeleg.modelle.includes("gpt-5-mini"));
process.env.HELMUT_LLM_PRICE_SOURCE = "Providerrechnung 2026-07";
const mitBeleg = storage.llmPriceProvenance();
check("mit gesetzter Quelle -> herkunft 'belegt'", mitBeleg.herkunft === "belegt");
check("die Quelle wird mitgefuehrt", mitBeleg.quelle === "Providerrechnung 2026-07");
delete process.env.HELMUT_LLM_PRICE_SOURCE;
if (altJson !== undefined) process.env.HELMUT_LLM_PRICE_JSON = altJson;
if (altSrc !== undefined) process.env.HELMUT_LLM_PRICE_SOURCE = altSrc;

console.log("== 20) Reales Production-Muster (2026-07-26 lesend gemessen) ==");
// Nachbildung des am 2026-07-26 gemessenen Tagesbildes: 28 Aufrufe, alle
// gpt-5-mini, alle gemessen; Reservierungszaehler stand auf 34.
const prodTag = cm.aggregiere(Array.from({ length: 28 }, (_, i) =>
  gemessen({ id: `prod-${i}`, promptTokens: 3656, completionTokens: 893, estimatedCost: 0.0027 })));
check("28 Aufrufe erkannt", prodTag.gesamt.aufrufe === 28);
check("Tag gilt als vollstaendig gemessen", prodTag.messvollstaendigkeit === "vollstaendig gemessen");
const prodAbgleich = cm.abgleichReservierung(34, prodTag.gesamt);
check("Zaehler 34 vs. 28 Protokolleintraege -> Differenz 6", prodAbgleich.differenz === 6);
check("realer Tag wird als Untergrenze markiert", prodAbgleich.kostenSindUntergrenze === true);
check("trotz Luecke bleiben die bekannten Kosten beziffert", prodTag.gesamt.kostenUsd > 0);
// Reales Muster der Altdaten: 100 % der Provideraufrufe ohne Laufkennung.
check("Altbestand: Laufzuordnung 0 %", prodTag.messbefunde.laufzuordnungAnteil === 0);

console.log("== 21) Diagnosepfad: echte Kosten, aber keine Reservierung (Review-Korrektur) ==");
const probe = gemessen({ id: "probe-1", callType: "pipeline-probe", pipelineStep: "diagnose" });
const pk = cm.klassifiziereEintrag(probe);
check("Diagnose ist ein echter, gemessener Provideraufruf", pk.messstatus === "gemessen");
check("Diagnose ist als nicht budgetwirksam markiert", pk.budgetwirksam === false);
check("Diagnose gilt als GLOBAL, nicht als Mandanten-Messlücke", pk.zurechnung === "global");
check("normaler Fachaufruf bleibt budgetwirksam", cm.klassifiziereEintrag(gemessen({ callType: "communicationDraft", userId: "m-1" })).budgetwirksam === true);
const probeAgg = cm.aggregiere([gemessen({ id: "n1" }), gemessen({ id: "n2" }), probe]);
check("Diagnosekosten zählen voll in die Summe (Kostenwahrheit)", Math.abs(probeAgg.gesamt.kostenUsd - 0.009) < 1e-9);
check("nicht-reservierende Aufrufe werden beziffert", probeAgg.messbefunde.nichtReservierendeAufrufe === 1);
// Ohne Abzug meldete der Abgleich faelschlich "mehr Aufrufe als Reservierungen".
const ohneAbzug = cm.abgleichReservierung(2, probeAgg.gesamt);
const mitAbzug = cm.abgleichReservierung(2, probeAgg.gesamt, probeAgg.messbefunde.nichtReservierendeAufrufe);
check("ohne Abzug entstünde ein Fehlalarm", /mehr Aufrufe als Reservierungen/.test(ohneAbzug.bewertung));
check("mit Abzug ist der Abgleich deckungsgleich", mitAbzug.bewertung === "deckungsgleich");
check("Abzug macht den Abgleich nie negativ", cm.abgleichReservierung(0, probeAgg.gesamt, 99).protokolliert === 0);

// Die letzten beiden Gruppen brauchen die (asynchronen) storage-Leser mit
// injiziertem Store — kein Netz, keine Datenbank, keine Uhr.
const storage2 = require("../lib/helmut/storage");
const store = (llmUsage, processRuns = []) => async () => ({ llmUsage, processRuns });

(async () => {
  console.log("== 22) Diagnose verbraucht keinen Budget-Kopfraum, den sie nie reservierte ==");
  check("Diagnose ist im Gate als nicht-budgetwirksam geführt", cm.istNichtReservierend("pipeline-probe") === true);
  check("Fachaufrufe bleiben budgetwirksam", cm.istNichtReservierend("understanding") === false);
  check("skipped-* bleibt unabhängig davon ausgenommen", cm.istUebersprungen({ callType: "skipped-understanding" }) === true);
  const gate = await storage2.getLlmUsageBreakdownToday("2026-07-26T12:00:00.000Z", {
    readAuth: store([
      { id: "g1", createdAt: "2026-07-26T10:00:00.000Z", callType: "understanding", model: "gpt-5-mini", promptTokens: 10, completionTokens: 5, estimatedCost: 0.001, success: true },
      { id: "g2", createdAt: "2026-07-26T10:00:01.000Z", callType: "pipeline-probe", model: "gpt-5-mini", promptTokens: 10, completionTokens: 5, estimatedCost: 0.001, success: true }
    ])
  });
  check("Gate zählt nur den Fachaufruf (1, nicht 2)", gate.calls === 1, `calls=${gate.calls}`);
  check("Kostenwahrheit enthält BEIDE Aufrufe", gate.kostenwahrheit.gesamt.aufrufe === 2);
  check("Kostenwahrheit enthält die Diagnosekosten", Math.abs(gate.kostenwahrheit.gesamt.kostenUsd - 0.002) < 1e-9);
  check("Diagnose erscheint nicht als 'nicht-zurechenbar'", gate.kostenwahrheit.jeZurechnung["nicht-zurechenbar"].aufrufe === 0);

  console.log("== 23) Laufkosten: überlappende Laufzeitfenster zählen nie doppelt ==");
  const runs = [
    { runId: "b", process: "briefing-lage", startedAt: "2026-07-26T10:00:05.000Z", finishedAt: "2026-07-26T10:00:25.000Z", durationMs: 20000, processed: 1, status: "ok" },
    { runId: "a", process: "understanding-eager", startedAt: "2026-07-26T10:00:00.000Z", finishedAt: "2026-07-26T10:00:30.000Z", durationMs: 30000, processed: 2, status: "ok" }
  ];
  const einAufruf = (over = {}) => ({ id: "x1", createdAt: "2026-07-26T10:00:10.000Z", callType: "understanding", model: "gpt-5-mini", promptTokens: 100, completionTokens: 50, estimatedCost: 0.004, success: true, runId: null, ...over });

  const bericht = await storage2.getRunCostReport({ limit: 10, readAuth: store([einAufruf()], runs) });
  const summe = bericht.laeufe.reduce((s, l) => s + l.kosten.gesamt.aufrufe, 0);
  check("ein Aufruf in zwei Laufzeitfenstern zählt genau einmal", summe === 1, `Summe=${summe}`);
  check("der zuerst gelistete Lauf beansprucht ihn", bericht.laeufe[0].kosten.gesamt.aufrufe === 1);
  check("der überlappende Lauf bleibt bei 0", bericht.laeufe[1].kosten.gesamt.aufrufe === 0);
  check("er taucht nicht zusätzlich als 'nicht zugeordnet' auf", bericht.nichtZugeordnet.gesamt.aufrufe === 0);
  check("die Kostensumme über alle Läufe ist nicht verdoppelt",
    Math.abs(bericht.laeufe.reduce((s, l) => s + l.kosten.gesamt.kostenUsd, 0) - 0.004) < 1e-9);

  // Eintrag OHNE Id darf nicht dauerhaft als unzugeordnet gelten.
  const ohneId2 = await storage2.getRunCostReport({ limit: 10, readAuth: store([einAufruf({ id: null })], [runs[1]]) });
  check("Eintrag ohne Id wird korrekt einem Lauf zugeordnet", ohneId2.laeufe[0].kosten.gesamt.aufrufe === 1);
  check("Eintrag ohne Id erscheint NICHT zusätzlich als unzugeordnet", ohneId2.nichtZugeordnet.gesamt.aufrufe === 0);

  // Die exakte Zuordnung per Laufkennung darf nie von einem Zeitfenster verdrängt werden.
  const exaktBericht = await storage2.getRunCostReport({ limit: 10, readAuth: store([einAufruf({ runId: "a" })], runs) });
  const exakt = exaktBericht.laeufe.find((l) => l.laufkennung === "a");
  check("gemessene Zuordnung schlägt das Zeitfenster", exakt.zuordnungExakt === true && exakt.kosten.gesamt.aufrufe === 1);
  check("gemessene Zuordnung wird als exakt ausgewiesen", exakt.zuordnungsweg === "laufkennung");

  console.log("== 24) Quelltext-Riegel: Laufkennung erreicht den Kostenlog ==");
  // Regressionsschutz gegen genau den Review-Befund: eine Laufkennung, die im
  // Scope liegt und fuer recordProcessRun benutzt wird, MUSS auch an den
  // Understanding-Aufruf gehen — sonst sind die Kosten dieses Laufs nur noch
  // ueber das Zeitfenster rekonstruierbar.
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..");
  const src = (f) => fs.readFileSync(path.join(root, f), "utf8");
  // Alle Aufrufe der beiden Understanding-Einstiege samt Optionsobjekt einsammeln.
  const aufrufe = (code) => [...code.matchAll(/run(?:Pending)?UnderstandingShadow\(\s*[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*\s*,\s*\{([\s\S]{0,400}?)\}\s*\)/g)].map((m) => m[1]);
  const schedulerAufrufe = aufrufe(src("lib/helmut/scheduler.js"));
  // DREI seit dem Sprint 05.09.: Crawl-Pfad (eager), Lage-Pfad (mandatsweise Faltung) und
  // die GETEILTE Lage-Erfassung, die den Korpus nach Sichtbarkeitskontext versteht.
  // Auch der Dokumentzugriff `teil.dokumente` muss erfasst sein. Die Zahl ist
  // bewusst gepinnt: ein VIERTER Einstieg waere ein neuer Kostenweg und muss auffallen.
  check("scheduler.js: alle drei Understanding-Aufrufe gefunden", schedulerAufrufe.length === 3, `gefunden=${schedulerAufrufe.length}`);
  check("scheduler.js: jeder Aufruf reicht runId durch", schedulerAufrufe.every((o) => /\brunId\b/.test(o)));
  const serverSrc = src("server.js");
  // Der dedizierte Understanding-Cron erzeugt eine eigene Laufkennung.
  // §29 (Reparatursprint 2026-08-20): das Fenster ist um die zwei Zeilen der
  // Restzeitwache (Kommentar + absolute Deadline im Aufruf) verlaengert.
  // BRUECHIGES FENSTER BEHOBEN (2026-08-31): der Block wurde bis dahin nach ZEICHENZAHL
  // (3200) abgeschnitten. Die kanonische Laufbilanz verlaengerte den Routenblock, und der
  // recordProcessRun-Aufruf fiel aus dem Fenster — der Test schlug fehl, obwohl der
  // Quelltext den Vertrag erfuellte. Der Block wird jetzt bis zur NAECHSTEN Route
  // abgegrenzt; damit prueft der Vertrag den ganzen Block statt eines Ausschnitts.
  const cronStart = serverSrc.indexOf('"/api/cron/understanding"');
  const cronEnde = serverSrc.indexOf('"/api/tasks"', cronStart);
  check("Understanding-Routenblock ist eindeutig abgegrenzt", cronStart > 0 && cronEnde > cronStart,
    `start=${cronStart} ende=${cronEnde}`);
  const cronBlock = serverSrc.slice(cronStart, cronEnde);
  check("Understanding-Cron erzeugt eine Laufkennung", /const runId = helmutRunId\("understanding-cron"/.test(cronBlock));
  check("Understanding-Cron reicht die Laufkennung an den Kostenpfad durch",
    /runPendingUnderstandingShadow\([\s\S]{0,200}?runId[\s\S]{0,40}?\)/.test(cronBlock));
  check("Understanding-Cron nutzt dieselbe Kennung fuer recordProcessRun",
    /process: "understanding-cron", runId/.test(cronBlock));
  // Der Diagnosepfad muss protokolliert werden.
  check("pipeline-probe wird im Kostenlog protokolliert", /callType: "pipeline-probe"/.test(serverSrc));
  check("pipeline-probe-Protokollierung wird abgewartet (kein fire-and-forget)",
    /await recordLlmUsage\(\{[\s\S]{0,200}?callType: "pipeline-probe"/.test(serverSrc));

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
})();
