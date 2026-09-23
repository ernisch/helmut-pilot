"use strict";

// Helmut — EINZELVORGANG-WEG: GENAU EIN ausdruecklich freigegebener Understanding-Vorgang.
// =============================================================================================
// WOZU: Der regulaere Wiederaufnahmeweg (`runPendingUnderstandingShadow`) verarbeitet eine
// ganze Arbeitsliste — Wiederaufnahmen UND alle pending Wissensobjekte — bis das Zeitbudget
// endet. Fuer die kontrollierte Untersuchung EINES Vorgangs (z. B. eines zweimal mit
// `validierung-fehlgeschlagen` gescheiterten Falls) ist das zu breit. Dieser Weg betrachtet
// ausschliesslich die uebergebene Vorgangskennung.
//
// WAS ER NICHT TUT (und nicht tun darf):
//   * KEINE zweite Understanding-Pipeline und KEIN zweiter Entscheider: der unveraenderte
//     Motor `understandOneCluster` versteht und persistiert.
//   * KEINE eigene CAS-, Budget-, Lock-, Restzeit- oder Validatorlogik — alle Schutzschichten
//     sind die BESTEHENDEN (verstehenVertrag/Fencing, canSpend, acquireLock/Restzeitwache,
//     validateUnderstandingResult) aus `understanding.defaultDeps()`.
//   * KEIN Zugriff auf andere Vorgaenge: weder `listPending` noch eine Clusterbildung ueber
//     fremde Dokumente werden benutzt. Der Weg kennt genau eine Kennung.
//   * KEINE Zaehler- oder Zustandsmanipulation: kein Reset, kein Schreiben auf
//     status/understanding_status/fencing/versuche/ki_aufrufe.
//
// DIE GARANTIEN (strukturell durch die Verdrahtung, nicht durch nachgelagerte Filter):
//   G1 Es wird ausschliesslich die uebergebene `vorgangId` gelesen (Wiederaufnahmeliste, ein
//      Bestand, dessen verknuepfte Dokumente). Andere Vorgaenge sind nicht erreichbar.
//   G2 Ohne ausdrueckliche Wiederaufnahmefreigabe endet der Weg VOR jedem Zustands- oder
//      Modellzugriff. Freigabe = die BESTEHENDE Wahrheit: `zustand=offen` +
//      `letzter_grund=erneut-freigegeben` (gelesen ueber `verstehenWiederaufnahmen`).
//      NICHT geprueft wird „pending oder failed" — das waere keine Freigabe.
//   G3 Hoechstens EIN `requestUnderstanding` je Aufruf; gezaehlt wird der ECHTE Aufruf.
//   G4 Fail closed VOR dem Modellaufruf bei: fehlender/ungueltiger Kennung, inaktivem
//      V3-Store (`deps.enabled()`), inaktiver KI (`deps.aiEnabled()`), nicht lesbarer
//      Wiederaufnahmeliste, fehlender Freigabe, fehlendem CAS-Vertrag, nicht lesbarem Bestand,
//      fehlenden/nicht lesbaren Dokumenten, verweigertem Lock.
//   G5 Dieselben vorgeschalteten Schutzschalter wie der regulaere Weg
//      (`runPendingUnderstandingShadow`): ohne aktiven Store/aktive KI kein Schritt.
//
// AUSGABE (nach aussen): nur begrenzte, sichere Diagnosewerte — Vorgangskennung, Status,
// reason/begruendung als feste Wortmarke, Ausgang, Dokumentzahl, Modellaufrufzahl und bis zu
// fuenf SICHERE Validierungsfehlercodes. Kein Prompt, keine Modellantwort, keine Dokumenttexte,
// keine Secrets, keine vollstaendigen internen Objekte (DSGVO-Datensparsamkeit).

const { understandOneCluster } = require("./understanding");

// DIESELBE feste Wortmarkenliste wie die 169er-Diagnose (PR #522, `verstehen-einmalig.js`).
// Bewusst erneut ausgeschrieben statt aus dem 169er-Modul importiert: jenes zieht die
// Testkohorten-Kette (500 Specs) und waere fuer diesen schmalen Weg unnoetig breit.
// `scripts/understanding-einzelvorgang-test.js` haelt beide Listen deckungsgleich.
const SICHERE_VALIDIERUNGSFEHLER = /^(ki-antwort-nicht-verwertbar|decision_level-antwortkonflikt|quellenbeleg-(ministerien|mentioned_ministries|parteien|mentioned_parties|mentioned_people|mentioned_mps|ausschuesse|mentioned_committees))$/;

// Die Vorgangskennung: bestehende Form `vg-<slug>-<datum>-<suffix>`. Bewusst eng — nur
// Buchstaben, Ziffern, Umlaute und Bindestrich, nie PostgREST-Metazeichen.
const VORGANG_ID_MUSTER = /^vg-[a-z0-9äöüß-]{1,120}$/i;
// Feste Wortmarke fuer reason/begruendung: ausschliesslich Kleinbuchstaben, Ziffern,
// Bindestrich. Technische Gruende mit Doppelpunkt/Leerzeichen/Rohtext bleiben draussen.
const SICHERE_WORTMARKE = /^[a-z0-9-]{3,60}$/;
// Motorgruppen-Status, die dieser Weg nach aussen melden darf.
const SICHERE_STATUS = /^(saved|updated|merged|duplicate|cluster-error|skipped-[a-z0-9-]+)$/;

function sichererGrund(wert) {
  const text = String(wert == null ? "" : wert).trim();
  return SICHERE_WORTMARKE.test(text) ? text : null;
}

// Begrenzt die Motorantwort auf die sicheren Diagnosewerte.
function begrenzteAntwort(r, vorgangId, modellaufrufe) {
  const status = r && typeof r.status === "string" && SICHERE_STATUS.test(r.status) ? r.status : "unbekannt";
  const codes = r && r.status === "skipped-invalid" && Array.isArray(r.errors)
    ? r.errors.filter((e) => typeof e === "string" && SICHERE_VALIDIERUNGSFEHLER.test(e)).slice(0, 5)
    : [];
  return {
    ok: true,
    vorgangId,
    status,
    reason: sichererGrund(r && (r.reason || r.begruendung)),
    ausgang: r && r.ausgang === "unbekannt" ? "unbekannt" : null,
    documents: Number.isFinite(Number(r && r.documents)) ? Number(r.documents) : 0,
    wiederaufnahmeFreigabe: true,
    modellaufrufe: Number(modellaufrufe) || 0,
    ...(codes.length ? { validierungsfehler: codes } : {})
  };
}

// Versteht GENAU den einen freigegebenen Vorgang. `deps` sind die BESTEHENDEN
// Understanding-Abhaengigkeiten (`understanding.defaultDeps()`); injizierbar fuer Tests.
async function verstehenEinzelvorgang({ vorgangId, deps = {}, deadlineMs = null, freigabeLimit = 200 } = {}) {
  const absage = (grund, extra = {}) => ({ ok: false, grund, modellaufrufe: 0, ...extra });

  const id = String(vorgangId == null ? "" : vorgangId).trim();
  if (!id || !VORGANG_ID_MUSTER.test(id)) return absage("vorgang-id-fehlt-oder-ungueltig");

  // G5 — dieselben VORSCHALTETEN Schutzschalter wie der regulaere Weg
  // (`runPendingUnderstandingShadow`: `deps.enabled()` / `deps.aiEnabled()`). Ohne aktiven
  // V3-Store bzw. ohne KI wird NICHTS verarbeitet: fail closed VOR Freigabe, CAS, Lock und
  // Modellpfad, ohne Freigabe zu verbrauchen und ohne Zustandsänderung. Es wird ausschliesslich
  // ueber die bestehenden deps geprueft — keine eigene Flag-/Environment-Auswertung.
  let storeAktiv = false;
  try { storeAktiv = typeof deps.enabled === "function" && Boolean(deps.enabled()); }
  catch (_) { return absage("v3-store-nicht-pruefbar"); }
  if (!storeAktiv) return absage("v3-store-disabled");
  let kiAktiv = false;
  try { kiAktiv = typeof deps.aiEnabled === "function" && Boolean(deps.aiEnabled()); }
  catch (_) { return absage("ai-nicht-pruefbar"); }
  if (!kiAktiv) return absage("ai-disabled");

  // G2 — die bestehende Wahrheit der Wiederaufnahme. Fail closed: eine nicht lesbare Liste ist
  // NICHT „keine Freigabe", sondern ein eigener Abbruchgrund.
  if (typeof deps.listWiederaufnahmen !== "function") return absage("wiederaufnahmepfad-nicht-verdrahtet");
  let freigaben = null;
  try { freigaben = await deps.listWiederaufnahmen(freigabeLimit); }
  catch (_) { return absage("wiederaufnahmeliste-nicht-lesbar"); }
  if (!freigaben || freigaben.verfuegbar !== true) return absage("wiederaufnahmeliste-nicht-lesbar");
  if (!(Array.isArray(freigaben.vorgaenge) ? freigaben.vorgaenge : []).includes(id)) {
    return absage("keine-wiederaufnahmefreigabe");
  }

  // CAS ist Pflicht: ohne den Vertrag gaebe es keine At-most-once-Zusage und der Motor liefe
  // ohne Reservierung/Fencing. Fail closed statt stiller Abschwaechung.
  if (typeof deps.verstehenVertrag !== "function" || !deps.verstehenVertrag()) {
    return absage("verstehen-cas-erforderlich");
  }

  // Bestand (fail closed). Die STRENGE Lesevariante: ein Lesefehler darf nicht als „kein
  // Bestand" gelten — sonst laege ein Erstverstehen auf einer moeglicherweise belegten Kennung.
  const leseBestand = typeof deps.getExistingStreng === "function" ? deps.getExistingStreng : deps.getExisting;
  if (typeof leseBestand !== "function") return absage("bestandsleser-nicht-verdrahtet");
  let ko = null;
  try { ko = await leseBestand(id); }
  catch (_) { return absage("bestand-nicht-lesbar"); }
  if (!ko || !ko.id) return absage("kein-wissensobjekt");

  // Dokumente (fail closed). Ein Transportfehler des Lesers ist ein Abbruch, eine leere
  // Dokumentliste ein eigener ehrlicher Grund — beides ohne Modellaufruf.
  if (typeof deps.listVorgangDocuments !== "function") return absage("dokumentleser-nicht-verdrahtet");
  let docs = null;
  try { docs = await deps.listVorgangDocuments(ko.id); }
  catch (_) { return absage("dokumente-nicht-lesbar"); }
  if (!Array.isArray(docs) || docs.length === 0) return absage("keine-dokumente");

  // Lock (fail closed): derselbe globale Understanding-Lock wie jeder regulaere Lauf.
  if (typeof deps.acquireLock !== "function" || typeof deps.releaseLock !== "function") {
    return absage("understanding-lock-nicht-verdrahtet");
  }
  let lock = null;
  try { lock = await deps.acquireLock(); }
  catch (_) { return absage("understanding-lock-fehler"); }
  if (!lock || lock.granted !== true) return absage("understanding-bereits-aktiv");

  // G3 — genau EIN gezaehlter Modellaufruf. Budget, Restzeit, CAS-Reservierung, Validatoren
  // und Persistenz entscheidet unveraendert der Motor.
  let aufrufe = 0;
  const depsMitZaehler = {
    ...deps,
    requestUnderstanding: (prompt) => { aufrufe += 1; return deps.requestUnderstanding(prompt); }
  };
  try {
    const cluster = { documents: docs, anchors: [] };
    const r = await understandOneCluster(cluster, depsMitZaehler, {
      vorgangId: id, existing: ko, wiederaufnahmeFreigabe: true,
      ...(deadlineMs == null ? {} : { deadlineMs })
    });
    return begrenzteAntwort(r, id, aufrufe);
  } catch (_) {
    // Ein geworfener Motorlauf ist ehrlich ein Fehler — kein Erfolg, aber die gezaehlte
    // Aufrufzahl bleibt sichtbar (sie kann 1 sein, wenn der Aufruf begonnen hatte).
    return { ok: false, grund: "motor-fehler", vorgangId: id, modellaufrufe: aufrufe };
  } finally {
    try { await deps.releaseLock(); } catch (_) { /* ignore */ }
  }
}

module.exports = {
  verstehenEinzelvorgang,
  VORGANG_ID_MUSTER,
  SICHERE_WORTMARKE,
  SICHERE_STATUS,
  SICHERE_VALIDIERUNGSFEHLER
};
