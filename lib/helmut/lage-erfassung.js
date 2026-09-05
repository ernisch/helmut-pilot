"use strict";

// Helmut — GETEILTE LAGE-ERFASSUNG (Befund 05.09.2026, `/api/cron/lage-check`).
// =============================================================================================
// DER BEFUND (Production, belegt):
// Lauf `cron-lage-check-20260905100015-he8tk`, 10:00:15,104 → 10:04:16,853 UTC (241,7 s).
// `kapazitaet: 1` — EIN Mandat begonnen, und dieses eine lief in seinen eigenen 240-s-Timeout
// (`cem-ince: fehlgeschlagen`). Die vier uebrigen wurden mit `zeitbudget` uebersprungen. Es
// waren also nicht "1 von 5 erfolgreich", sondern **0 von 5 erfolgreich, 1 von 5 begonnen**.
//
// DIE URSACHE, die dieses Modul behebt:
// `runLageCheck` ruft je Mandat `crawlAllSources(selectLageCheckSources(...))` auf — bis zu
// `max(20, HELMUT_LAGE_CHECK_SOURCE_LIMIT)` = heute 90 Quellen. Die Quellen sind aber ganz
// ueberwiegend GETEILT: der Rohkorpus ist global (`saveRawItems` → `getRawItemsSince` liest
// global), und synthetische Profile bekommen ohne `HELMUT_TESTKOHORTE_QUELLEN` ueberhaupt
// keine eigenen Quellen (`scheduler.profilQuellenErlaubt`). Der Abruf kostet damit
// O(Mandate × Quellen), obwohl er fachlich O(Quellen) kostet. Prozessweit dedupliziert wurde
// bisher nur der GOOGLE-Anteil (`sharedFetchLedger`, Incident 2026-07-25) — direkte RSS-,
// HTML- und amtliche Wege wurden je Mandat erneut geholt.
//
// DER VERTRAG DIESES MODULS (rein, ohne IO, ohne Netz, ohne Zeitbezug):
//   Aus EINEM Vereinigungsabruf wird je Mandat GENAU die Sicht rekonstruiert, die dieses
//   Mandat aus seinem EIGENEN Abruf erhalten haette — dieselben Quellen, dieselbe Dedup-,
//   Cap- und Zaehllogik. Es entsteht kein Element, das ein Mandat heute nicht saehe, und es
//   verschwindet keines. Der Unterschied ist ausschliesslich, dass jeder Abrufweg EINMAL
//   statt n-mal belastet wird.
//
// WAS DIESES MODUL AUSDRUECKLICH NICHT TUT:
//   - kein Zeitbudget erhoehen, keine Cron-Zeit und keine Cron-Reihenfolge aendern,
//   - keine Warteschlange, kein neuer Auftragstyp (das brauchte eine Migration —
//     `helmut_jobs_type_chk`, ausdruecklich nicht freigegeben),
//   - keine Quelle abrufen, die nicht mindestens ein aktives Mandat schon heute erhielte,
//   - keinen Riegel schwaechen: Kommunikationssperre und KI-Tagesdeckel liegen beide in der
//     MANDATSphase (`sendLageChangePush`, `foldLageItemsIntoV3` → `reserveLlmCall`) und
//     werden hier nicht beruehrt.

const VERSION = 1;

// Zustaende der Erfassung. Nur eine ABGESCHLOSSENE oder TEILWEISE Erfassung darf als
// Mandatssicht dienen; eine FEHLGESCHLAGENE fuehrt zurueck auf den unveraenderten Einzelabruf,
// damit eine gescheiterte Erfassung keinen kuenstlich leeren Lage-Check erzeugt.
const ERFASSUNG_OFFEN = "offen";
const ERFASSUNG_ABGESCHLOSSEN = "abgeschlossen";
const ERFASSUNG_TEILWEISE = "teilweise";
const ERFASSUNG_FEHLGESCHLAGEN = "fehlgeschlagen";

// Ein Ergebnis gilt als „uebersprungen" (weder Erfolg noch Fehler) unter denselben Kennungen
// wie im Crawler. Bewusst hier gespiegelt statt importiert: das Modul bleibt damit ohne
// Netzabhaengigkeit ladbar, und der Vertragstest prueft die Uebereinstimmung ausdruecklich.
const UEBERSPRUNGEN_STATUS = ["skipped-cooldown", "skipped-shared"];

function istUebersprungen(ergebnis = {}) {
  return UEBERSPRUNGEN_STATUS.includes(String(ergebnis && ergebnis.status || ""));
}

// --- Quellenzuordnung -------------------------------------------------------------------------

// Aus `cron-globalphase.planGlobaleQuellen(...).herkunft` (Quellenkennung -> [Mandate]) wird
// die Umkehrung gebildet: Mandat -> Menge seiner Quellenkennungen. Genau diese Menge ist der
// Filter der Mandatssicht — sie kommt aus der UNVERAENDERTEN Produktionsfunktion
// `selectLageCheckSources(getSourcesForProfile(profil))` und wird hier nur umsortiert.
function quellenJeMandat(herkunft = {}) {
  const zuordnung = new Map();
  for (const [quelleId, mandate] of Object.entries(herkunft || {})) {
    for (const mandat of Array.isArray(mandate) ? mandate : []) {
      const id = String(mandat || "").trim();
      if (!id) continue;
      if (!zuordnung.has(id)) zuordnung.set(id, new Set());
      zuordnung.get(id).add(String(quelleId));
    }
  }
  return zuordnung;
}

// --- Mandatssicht -----------------------------------------------------------------------------

// Baut aus den Ergebnissen des Vereinigungsabrufs die Sicht EINES Mandats. Die Feldnamen und
// ihre Bedeutung sind bewusst byte-gleich zu `crawlAllSources` — der Aufrufer (`runLageCheck`)
// kann die Sicht an genau derselben Stelle einsetzen, ohne seine Auswertung zu aendern.
//
// `dedupe` und `cap` werden INJIZIERT (Default: die Funktionen des Crawlers). Damit ist dieses
// Modul ohne Netz testbar UND es kann keine zweite, abweichende Dedup-/Cap-Wahrheit entstehen.
function mandatsSicht({
  ergebnisse = [],
  quellen = [],
  quellenIds = null,
  maxKandidaten = 1000,
  dedupe = null,
  cap = null
} = {}) {
  const erlaubt = quellenIds instanceof Set
    ? quellenIds
    : new Set((Array.isArray(quellenIds) ? quellenIds : []).map((id) => String(id)));
  const eigene = (Array.isArray(ergebnisse) ? ergebnisse : [])
    .filter((ergebnis) => ergebnis && erlaubt.has(String(ergebnis.sourceId)));
  // Die QUELLENOBJEKTE dieses Mandats (nicht die Ergebnisse): der Aufrufer braucht sie fuer
  // die Quellen-Telemetrie (`sourcesById`) und fuer `sourceLimit` — beides erwartet Objekte
  // mit `.id`, nicht Abrufergebnisse mit `.sourceId`.
  const eigeneQuellen = (Array.isArray(quellen) ? quellen : [])
    .filter((quelle) => quelle && erlaubt.has(String(quelle.id)));

  const alleItems = eigene.flatMap((ergebnis) => Array.isArray(ergebnis.items) ? ergebnis.items : []);
  const entdoppelt = typeof dedupe === "function" ? dedupe(alleItems) : alleItems;
  const rawItems = typeof cap === "function" ? cap(entdoppelt, maxKandidaten) : entdoppelt;

  return {
    // Identische Zaehlweise wie crawlAllSources: geprueft = alle Quellen DIESES Mandats,
    // erfolgreich = ok und nicht uebersprungen, fehlgeschlagen = nicht ok und kein
    // Circuit-Breaker-Abbruch.
    checkedSources: eigene.length,
    successfulSources: eigene.filter((e) => e.ok && !istUebersprungen(e)).length,
    failedSources: eigene.filter((e) => !e.ok && e.status !== "circuit-open").length,
    circuitOpenSources: eigene.filter((e) => e.status === "circuit-open").length,
    skippedSources: eigene.filter((e) => istUebersprungen(e)).length,
    sharedSkippedSources: eigene.filter((e) => e.status === "skipped-shared").length,
    retriesTotal: eigene.reduce((summe, e) => summe + (e.retryCount || 0), 0),
    newCandidateItems: rawItems.length,
    rawItems,
    results: eigene,
    quellen: eigeneQuellen,
    // Herkunftsvermerk: diese Sicht stammt aus dem Vereinigungsabruf, nicht aus einem eigenen.
    // Er steht in der Telemetrie, damit ein Auswerter die beiden Faelle nie verwechselt.
    geteilt: true
  };
}

// Vereinigung der Elemente, die die EINZELNEN Mandate gespeichert haetten. Sie ist der
// Speicherauftrag des geteilten Laufs. Bewusst NICHT der global gedeckelte Bestand des
// Vereinigungsabrufs: der Kandidaten-Cap wirkt je Mandat, und ein Element, das Mandat B aus
// seiner Sicht gespeichert haette, darf nicht verschwinden, nur weil Mandat A hoeher
// bewertete Elemente mitbringt. Ergebnis ist damit exakt die Menge, die die n heutigen
// Einzelabrufe zusammen speichern wuerden.
function speicherAuftrag(sichten = []) {
  const gesehen = new Set();
  const items = [];
  for (const sicht of Array.isArray(sichten) ? sichten : []) {
    for (const item of (sicht && sicht.rawItems) || []) {
      const schluessel = String((item && (item.hash || item.id)) || "");
      if (!schluessel || gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      items.push(item);
    }
  }
  return items;
}

// Die je Mandat NEU gespeicherten Elemente. `savedItems` ist das Ergebnis des EINEN
// `saveRawItems`-Aufrufs; hier wird daraus der Anteil dieses Mandats geschnitten. Semantik
// unveraendert gegenueber heute: „in diesem Lauf neu gespeichert, aus MEINEN Quellen".
function neueElementeJeMandat(savedItems = [], quellenIds = null) {
  const erlaubt = quellenIds instanceof Set
    ? quellenIds
    : new Set((Array.isArray(quellenIds) ? quellenIds : []).map((id) => String(id)));
  return (Array.isArray(savedItems) ? savedItems : [])
    .filter((item) => item && item.sourceId != null && erlaubt.has(String(item.sourceId)));
}

// --- Brauchbarkeit ------------------------------------------------------------------------------

// Ein Mandat darf die geteilte Sicht NUR benutzen, wenn die Erfassung versiegelt, nicht
// gescheitert und fuer genau dieses Mandat geplant war. Alles andere faellt fail-safe auf den
// unveraenderten Einzelabruf zurueck — ein leerer Lage-Check aus einer kaputten Erfassung
// waere ein falsches Gruen (CLAUDE.md §4.4).
function sichtBrauchbar(erfassung, politicianId) {
  if (!erfassung || typeof erfassung !== "object") return { brauchbar: false, grund: "keine-erfassung" };
  if (erfassung.status === ERFASSUNG_OFFEN) return { brauchbar: false, grund: "erfassung-nicht-versiegelt" };
  if (erfassung.status === ERFASSUNG_FEHLGESCHLAGEN) return { brauchbar: false, grund: "erfassung-fehlgeschlagen" };
  const id = String(politicianId || "").trim();
  if (!id) return { brauchbar: false, grund: "kennung-fehlt" };
  const sichten = erfassung.sichten || {};
  if (!Object.prototype.hasOwnProperty.call(sichten, id)) {
    return { brauchbar: false, grund: "mandat-nicht-erfasst" };
  }
  return { brauchbar: true, grund: null };
}

// --- Kapazitaetsrechnung ------------------------------------------------------------------------

// Was der Umbau strukturell bringt — als nachrechenbare Formel, nicht als Behauptung.
//
//   vorher   = mandate × (abrufMs + projektionMs)
//   nachher  = abrufMs + mandate × projektionMs
//
// `abrufMs` ist der EINE Vereinigungsabruf (er waechst mit der Zahl der QUELLEN, nicht mit der
// Zahl der Mandate — solange synthetische Profile keine eigenen Quellen haben, ist er in der
// Mandatszahl konstant). `projektionMs` ist die mandatsgebundene Restarbeit.
// `mandateProLauf` ist die Zahl, die in ein Budget passt; `laeufe` die Obergrenze ceil(n/k).
function kapazitaet({ mandate = 0, budgetMs = 0, abrufMs = 0, projektionMs = 0, mindestScheibeMs = 0 } = {}) {
  const n = Math.max(0, Math.floor(Number(mandate) || 0));
  const budget = Math.max(0, Number(budgetMs) || 0);
  const abruf = Math.max(0, Number(abrufMs) || 0);
  const projektion = Math.max(1, Number(projektionMs) || 1);
  const mindest = Math.max(0, Number(mindestScheibeMs) || 0);
  const vorherMs = n * (abruf + projektion);
  const nachherMs = n > 0 ? abruf + n * projektion : 0;
  const restNachAbruf = Math.max(0, budget - abruf);
  // Je Mandat wird mindestens `mindestScheibeMs` als Obergrenze zugeteilt; die tatsaechlich
  // verbrauchte Zeit ist `projektionMs`. Begrenzend ist also der groessere der beiden Werte.
  const jeMandatMs = Math.max(projektion, mindest > 0 ? Math.min(mindest, projektion) : projektion);
  const mandateProLauf = Math.max(0, Math.floor(restNachAbruf / jeMandatMs));
  const laeufe = n === 0 ? 0 : (mandateProLauf > 0 ? Math.ceil(n / mandateProLauf) : Infinity);
  return {
    mandate: n,
    vorherMs,
    nachherMs,
    ersparnisMs: Math.max(0, vorherMs - nachherMs),
    passtInEinenLauf: n > 0 && nachherMs <= budget,
    mandateProLauf,
    laeufe,
    jeMandatMs
  };
}

module.exports = {
  VERSION,
  ERFASSUNG_OFFEN,
  ERFASSUNG_ABGESCHLOSSEN,
  ERFASSUNG_TEILWEISE,
  ERFASSUNG_FEHLGESCHLAGEN,
  UEBERSPRUNGEN_STATUS,
  istUebersprungen,
  quellenJeMandat,
  mandatsSicht,
  speicherAuftrag,
  neueElementeJeMandat,
  sichtBrauchbar,
  kapazitaet
};
