"use strict";

// Helmut — DER EINMALIGE VERSTEHENSLAUF FÜR GENAU 169 GESPEICHERTE ROHDOKUMENTE.
// =============================================================================================
// WOZU: Der Quellen-Vorlauf ist fachlich abgeschlossen (CURRENT_STATE 22.09.2026: zwei scharfe
// Quellenläufe, zusammen 169 neue Rohdokumente, 32 + 137). Diese Dokumente LIEGEN in
// `raw_documents` und sind noch NICHT verstanden. Dieser Runner ist der kleinste sichere,
// EINMALIGE Weg, sie durch den unveränderten Produktionsmotor zu schicken — genau einmal.
//
// WAS ER NICHT TUT (und nicht tun darf):
//   * kein Quellenabruf (kein Crawler, kein Artikelkontext)
//   * keine Profiländerung, keine Profilaktivierung
//   * kein Briefing, keine Lage, kein Matching, keine Kommunikation
//   * kein fremdes `raw_document` — ausschließlich die gebundenen 169 Kennungen
//   * keine Cron-, Environment-, Migrations- oder Aktivierungsänderung
//   * KEINE zweite Fachlogik: Dedup, Clusterung, Vorgangsauflösung, Aktualisierungsentscheidung,
//     CAS-Reservierung, Fencing, Vorgangswache, Budget-Gate und Restzeitwache sind die
//     BESTEHENDEN Funktionen (siehe „WIEDERVERWENDUNG" unten).
//
// ── WIEDERVERWENDUNG (kein Ersatzalgorithmus) ───────────────────────────────────────────────
//   dedupeRawDocuments / toRawDocumentRow   lib/helmut/dedup.js          (Produktions-Dedup)
//   clusterRawDocuments / deriveVorgangId   lib/helmut/vorgang-identity   (Produktions-Clusterung)
//   candidatePrefixes / sameVorgang         lib/helmut/vorgang-identity   (via resolveVorgang)
//   neueErkenntnisse                        lib/helmut/vorgang-identity   („neue Fakten?")
//   resolveVorgang                          lib/helmut/understanding.js   (Kandidatensuche + Beleg)
//   understandOneCluster                    lib/helmut/understanding.js   (der EINE Motor)
//   CAS + Fencing                           lib/helmut/verstehen-vertrag.js (über defaultDeps)
//   Budget-Gate                             lib/helmut/storage.js (canSpendLlm/reserveLlmCall)
//   Restzeitwache                           lib/helmut/verstehen-restzeit.js
//   Budget-Boden-Vorprüfung                 lib/helmut/verstehen-rueckstand.js (vorabBodenPruefung)
//
// ── DER SCHUTZVERTRAG (fail closed, VOR dem ersten möglichen Modellaufruf) ──────────────────
//   S1 Production Commit exakt gebunden                     (PINNED.commit)
//   S2 exakt 169 gebundene Dokumentkennungen                (PINNED.dokumente)
//   S3 SHA256 der alphabetisch sortierten, mit "\n" verbundenen Kennungen
//      exakt PINNED.idHash
//   S4 Dedup-Ergebnis exakt 169                             (PINNED.dokumente)
//   S5 Clusterzahl exakt 122                                (PINNED.cluster)
//   S6 Cluster-Größenverteilung exakt wie belegt            (PINNED.clusterGroessen)
//   S7 Modellaufruf-Kandidaten höchstens 113                (PINNED.maxModellaufrufe)
//      weniger ist erlaubt — mehr stoppt SOFORT, vor jedem Modellaufruf
//   S8 kein Dokument außerhalb der gebundenen Liste
//   S9 der geladene Produktionssatz ist genau die gebundene Liste (kein Fremddokument, nichts fehlt)
//  S10 die Abbildung durch die Produktionslogik erhält jede Kennung (sonst STOPP)
//
// ── LAUFGRENZEN (zusätzlich, unabhängig voneinander wirksam) ───────────────────────────────
//   * Aufrufdeckel   höchstens 113 Modellaufrufe dieses Laufs — geprüft VOR jedem Cluster
//   * Kostendeckel   0,80 USD für diesen Lauf (Aufrufe × bestätigter Preis; ohne Preis kein Lauf)
//   * Zeitdeckel     35 Minuten absolute Deadline (bestehende Restzeitwache)
//   * Aufruftyp      `understanding-rueckstand` — die BESTEHENDE, nicht priorisierte
//                    Budgetklasse. KEINE neue Klasse, KEINE Budgeterhöhung, KEINE Änderung
//                    des globalen 4-USD-Tagesriegels.
//
// ── UNBEKANNTER MODELLAUSGANG ──────────────────────────────────────────────────────────────
//   Ein Ausgang `ausgang === "unbekannt"` (bezahlter Aufruf ohne belegtes Ergebnis) beendet den
//   GESAMTEN Runner: kein nächster Cluster, kein automatischer Retry desselben Clusters. Die
//   bestehende Kostenreserve des unbekannten Aufrufs bleibt unangetastet.
//
// ── EINMALQUITTUNG ─────────────────────────────────────────────────────────────────────────
//   Die Quittung wird VOR dem ersten möglichen Modellaufruf beansprucht (CAS: „existiert die
//   Zeile schon, war dieser Auftrag schon dran"). Danach wird sie IMMER abgeschlossen — auch bei
//   Abbruch oder unbekanntem Ausgang. Ein zweiter Lauf desselben gebundenen Auftrags findet die
//   Zeile vor und stoppt, ohne einen Modellaufruf zu machen.
//
// DEFAULT REIN LESEND: ohne `execute` wird ausschließlich geplant und geprüft. Kein Modellaufruf,
// kein Storage-Schreibzugriff, keine Quittung.
//
// ── ABBRUCHDIAGNOSE (NUR MELDEND) ──────────────────────────────────────────────────────────
// Bricht der Schutzvertrag ab, gibt `fuehreAus` die bereits berechneten Diagnosewerte mit aus
// (`modellaufrufeKandidaten`, `clusterArten`, `clusterDiagnose`). Das ist AUSSCHLIESSLICH
// Meldung derselben Werte, die `pruefeUndPlane` ohnehin ermittelt hat: `ok`, `schutzvertrag`
// und `ausgeloest` bleiben falsch, es wird kein Cluster verarbeitet, kein Modell aufgerufen
// und keine Quittung beansprucht. Die Grenze selbst ist davon unberührt. Bei Clustern der
// Klasse `neu` traegt die Diagnose zusaetzlich die Resolver-Spuren, reduziert auf
// `vorgangId`, `gleich`, `grund` — kein Titel, kein Kernanker, keine Dokumentkennungsliste.
//
// ── PRÜFMODUS (`erwartet`) ─────────────────────────────────────────────────────────────────
// `pruefeUndPlane` und `fuehreAus` nehmen einen optionalen `erwartet`-Parameter. Er existiert
// AUSSCHLIESSLICH für die Mechanik-Tests: die im Auftrag festgeschriebenen Zahlen (169/122/113)
// sind einmalig und lassen sich mit synthetischen Dokumenten nicht reproduzieren. Ein abweichender
// `erwartet`-Wert wird deshalb nur mit dem ausdrücklichen Marker `pruefmodus: true` akzeptiert —
// ein versehentlicher oder bewusster Aufruf aus Produktion mit abgeschwächten Werten ist damit
// ausgeschlossen. Ohne `erwartet` gilt IMMER `PINNED`.

const crypto = require("crypto");

const D = require("./testkohorte-direkt500");
const { resolveVorgang } = require("./understanding");
const { clusterRawDocuments, deriveVorgangId, neueErkenntnisse } = require("./vorgang-identity");
const { dedupeRawDocuments, toRawDocumentRow } = require("./dedup");
const { isTerminalUnderstandingStatus } = require("./pending-terminal");
const rueckstand = require("./verstehen-rueckstand");
const restzeit = require("./verstehen-restzeit");

// Die feste Bindung. Diese Werte sind NICHT konfigurierbar: sie sind der Auftrag.
const PINNED = Object.freeze({
  commit: "ea84f26ccc380e22961335926e2d4e585cee2308",
  dokumente: 169,
  idHash: "5f3878409cc9dbe742a3c9b465e54fff53b3e7622065f90c04915eb01ac2aed9",
  cluster: 122,
  // Belegte Größenverteilung der 122 Cluster (aus dem Production-Befund):
  // 110×1 + 5×2 + 2×3 + 1×4 + 2×8 + 1×11 + 1×12 = 169.
  clusterGroessen: Object.freeze({ 1: 110, 2: 5, 3: 2, 4: 1, 8: 2, 11: 1, 12: 1 }),
  maxModellaufrufe: 113,
  maxUsd: 0.8,
  maxMs: 35 * 60 * 1000
});

const QUITTUNG = "verstehen169-20260922-a";
// Die bestehende, NICHT priorisierte Budgetklasse der Rückstandsläufe. Sie liegt
// (Tagesdeckel − Verstehens-Reserve) und nimmt der Frischverarbeitung nichts weg.
const CALLTYPE = rueckstand.RUECKSTAND_CALLTYPE;

function pruefeErwartet(erwartet) {
  if (erwartet === undefined || erwartet === null) return PINNED;
  if (erwartet === PINNED) return PINNED;
  // Abschwächen ist nur im ausdrücklichen Prüfmodus möglich — und dort sichtbar.
  D.fordere(erwartet.pruefmodus === true, "verstehen-erwartung-nur-im-pruefmodus");
  return erwartet;
}

// ── Kennungs-Hash ──────────────────────────────────────────────────────────────────────────
// „IDs alphabetisch sortieren, mit "\n" verbinden, SHA256" — genau das und nichts sonst.
function idsHash(ids) {
  const sortiert = (Array.isArray(ids) ? ids : []).map((i) => String(i)).sort();
  return crypto.createHash("sha256").update(sortiert.join("\n")).digest("hex");
}

function saubereIds(liste) {
  return [...new Set((Array.isArray(liste) ? liste : [])
    .map((i) => String(i == null ? "" : i).trim())
    .filter(Boolean))];
}

function groessenVerteilung(clusters = []) {
  const h = {};
  for (const c of clusters) {
    const n = ((c && c.documents) || []).length;
    h[n] = (h[n] || 0) + 1;
  }
  return h;
}

function gleicheVerteilung(a = {}, b = {}) {
  const ka = Object.keys(a).map(Number).sort((x, y) => x - y);
  const kb = Object.keys(b).map(Number).sort((x, y) => x - y);
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && Number(a[k]) === Number(b[k]));
}

function grundVon(error) {
  if (error && error.grund) return error.grund;
  return String((error && error.message) || "unbekannt").slice(0, 200);
}

// ── DIE KLASSIFIKATION EINES CLUSTERS (rein lesend, KI-frei) ───────────────────────────────
// Sie spiegelt EXAKT den Entscheidungskopf von `understandOneCluster` und benutzt dafür dessen
// eigene Funktionen (`resolveVorgang`, `neueErkenntnisse`, `isTerminalUnderstandingStatus`).
// Sie wird gegen den echten Motor getestet (scripts/verstehen-einmalig-test.js): jede Aussage
// „Kandidat" erzeugt genau einen Modellaufruf, jede Aussage „kein Kandidat" keinen.
async function klassifiziereCluster(cluster, deps, opts = {}) {
  const clusterDocs = (cluster && cluster.documents) || [];
  if (!clusterDocs.length) return { art: "leer", kandidat: false, begruendung: "kein-dokument" };
  const aufloesung = await resolveVorgang(cluster, deps, opts);
  // W-1: ein Bestandslesefehler darf niemals als `neu` klassifiziert werden — die Planung
  // bricht fail closed ab (der Aufrufer stoppt vor Kandidatenvergleich, Modell und Write).
  if (aufloesung.resolution === "bestand-lesefehler") {
    return {
      art: "lesefehler", kandidat: false, vorgangId: aufloesung.vorgangId || null,
      resolution: "bestand-lesefehler", begruendung: "bestandslesefehler",
      lesefehler: aufloesung.lesefehler || null
    };
  }
  const basis = {
    vorgangId: aufloesung.vorgangId,
    resolution: aufloesung.resolution,
    bestandsDokumente: (aufloesung.bestandsDokumente || []).length
  };
  const existing = aufloesung.existing;
  // Neu: kein Kandidat unter den Themenwurzel-Präfixen beschreibt dieselbe Sache.
  if (!existing) {
    return {
      ...basis, art: "neu", kandidat: true,
      // UNVERAENDERT DURCHGEREICHT: die von `resolveVorgang` bereits berechneten Spuren der
      // geprueften Kandidaten — einschliesslich der ABLEHNUNGEN. `resolveVorgang` selbst ist
      // unveraendert; hier wird ausschliesslich sein vorhandener Rueckgabewert weitergegeben.
      spuren: Array.isArray(aufloesung.spuren) ? aufloesung.spuren : []
    };
  }
  // Terminal aussortiert: „nie wieder" — kein KI-Aufruf.
  if (isTerminalUnderstandingStatus(existing.understanding_status)) {
    return { ...basis, art: "terminal", kandidat: false };
  }
  // Bereits verstandener Vorgang: echtes Duplikat oder Aktualisierung?
  if (existing.status !== "pending") {
    const bekannt = new Set((aufloesung.bestandsDokumente || []).map((d) => d && d.id).filter(Boolean));
    const neueDocs = clusterDocs.filter((d) => d && (!d.id || !bekannt.has(d.id)));
    if (!neueDocs.length) {
      // Der Motor nimmt an dieser Stelle eine offene Update-Vormerkung BEGRENZT wieder auf
      // (P29-3) und ruft dann tatsächlich das Modell. Der Plan zählt das deswegen
      // KONSERVATIV als Kandidaten: kleiner werden darf die spätere Zahl, nie größer.
      return { ...basis, art: "duplikat", kandidat: true, begruendung: "vormerkung-moeglich" };
    }
    const bestandsDocs = aufloesung.bestandsDokumente || [];
    // Bekannte KOSTENVORSICHT bei fehlendem Beleg (Altvorgang ohne Verknüpfung):
    // nur verknüpfen, nicht teuer neu verstehen — KEIN Modellaufruf.
    if (!bestandsDocs.length) {
      return { ...basis, art: "merged", kandidat: false, begruendung: "bestand-ohne-beleg" };
    }
    // `neueErkenntnisse` entscheidet, ob ein complete-Vorgang wirklich einen
    // Aktualisierungs-Aufruf braucht.
    if (!neueErkenntnisse(neueDocs, bestandsDocs).neu) {
      return { ...basis, art: "merged", kandidat: false, begruendung: "keine-neuen-fakten" };
    }
    return { ...basis, art: "update", kandidat: true };
  }
  // Geparkter Vorgang (KI-Fehlschlag): kein AUTOMATISCHER Neuversuch.
  if (existing.understanding_status === "failed") {
    return { ...basis, art: "failed", kandidat: false };
  }
  // Noch nie verstandener (pending) Vorgang: Erstverstehen, ein Modellaufruf.
  return { ...basis, art: "pending-erst", kandidat: true };
}

// Deterministische Reihenfolge: unabhängig von der Ankunftsreihenfolge der Dokumente.
function ordneCluster(clusters = []) {
  return clusters.slice().sort((a, b) => {
    const ka = deriveVorgangId(a);
    const kb = deriveVorgangId(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const sa = ((a && a.documents) || []).map((d) => String((d && d.id) || "")).sort().join("|");
    const sb = ((b && b.documents) || []).map((d) => String((d && d.id) || "")).sort().join("|");
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
}

// ── SCHRITT 1: DER SCHUTZVERTRAG (rein lesend) ─────────────────────────────────────────────
// Liefert entweder `{ ok: true, plan }` oder `{ ok: false, grund, …messwerte }`. Wirft nie —
// der Aufrufer muss den Grund berichten können, auch wenn die Bindung nicht hält.
async function pruefeUndPlane({ ids = null, deps = {}, commit = null, opts = {}, erwartet = null } = {}) {
  const E = pruefeErwartet(erwartet);
  // S1 — Production Commit exakt gebunden.
  if (String(commit == null ? "" : commit) !== String(E.commit)) {
    return { ok: false, grund: "verstehen-commit-abweichend", erwartet: E.commit, gelesen: commit == null ? null : String(commit) };
  }
  // S2 — exakt 169 gebundene Kennungen.
  const liste = saubereIds(ids);
  const rohAnzahl = (Array.isArray(ids) ? ids : []).length;
  if (rohAnzahl !== E.dokumente || liste.length !== E.dokumente) {
    return { ok: false, grund: "verstehen-ids-anzahl-abweichend", anzahl: liste.length, erwartet: E.dokumente };
  }
  // S3 — Hash der sortierten Kennungen.
  const hash = idsHash(liste);
  if (hash !== E.idHash) {
    return { ok: false, grund: "verstehen-ids-hash-abweichend", hash, erwartet: E.idHash, anzahl: liste.length };
  }
  // Der Dokumentleser ist Pflicht — ohne ihn gibt es keine belegte Bindung.
  if (typeof deps.ladeDokumente !== "function") {
    return { ok: false, grund: "verstehen-dokumentleser-fehlt" };
  }
  // ARTIKELKONTEXT BLEIBT AUS. Eine Versorgung waere ein Quellenabruf — ausdruecklich verboten.
  if (Object.hasOwn(deps, "artikelkontextVersorgung")) {
    return { ok: false, grund: "verstehen-artikelkontext-verboten" };
  }
  // S9 — genau die gebundene Liste laden, nichts Fremdes, nichts Fehlendes.
  let geladen = null;
  try {
    geladen = await deps.ladeDokumente(liste.slice());
  } catch (error) {
    // W-1-Regel: ein Lesefehler darf NIE wie „keine Dokumente" aussehen.
    return { ok: false, grund: `verstehen-dokumente-nicht-lesbar:${grundVon(error)}` };
  }
  if (!Array.isArray(geladen)) return { ok: false, grund: "verstehen-dokumentleser-unbrauchbar" };
  if (geladen.length !== E.dokumente) {
    return { ok: false, grund: "verstehen-dokumentanzahl-abweichend", anzahl: geladen.length, erwartet: E.dokumente };
  }
  const listeSet = new Set(liste);
  const geladenIds = [];
  for (const d of geladen) {
    const id = d && d.id ? String(d.id) : "";
    if (!id) return { ok: false, grund: "verstehen-dokument-ohne-kennung" };
    geladenIds.push(id);
  }
  const geladenSet = new Set(geladenIds);
  if (geladenSet.size !== geladenIds.length) return { ok: false, grund: "verstehen-dokument-doppelt" };
  // S8 — kein fremdes Dokument.
  const fremd = geladenIds.filter((id) => !listeSet.has(id));
  if (fremd.length) return { ok: false, grund: "verstehen-fremdes-dokument", anzahl: fremd.length, stichprobe: fremd.slice(0, 3) };
  const fehlend = liste.filter((id) => !geladenSet.has(id));
  if (fehlend.length) return { ok: false, grund: "verstehen-dokument-fehlt", anzahl: fehlend.length, stichprobe: fehlend.slice(0, 3) };

  // S4/S5/S6/S10 — die AKTUELLE Produktionslogik auf genau diese Dokumente anwenden.
  // Abbildung exakt wie im Warteschlangen-/Batchpfad (`runUnderstandingShadow`), damit die
  // Clusterung nicht von der Speicherform abhängt.
  let rows = null;
  try {
    rows = dedupeRawDocuments(geladen.map(toRawDocumentRow).filter((r) => r && r.id));
  } catch (error) {
    return { ok: false, grund: `verstehen-abbildung-fehlgeschlagen:${grundVon(error)}` };
  }
  // S10 — die Abbildung darf keine Kennung verlieren oder verändern.
  const abgebildetSet = new Set(rows.map((r) => r.id));
  if (rows.length !== E.dokumente || abgebildetSet.size !== E.dokumente
      || [...abgebildetSet].some((id) => !listeSet.has(id))) {
    return { ok: false, grund: "verstehen-idabbildung-abweichend", anzahl: rows.length, erwartet: E.dokumente };
  }
  // S4 — Dedup-Ergebnis exakt 169.
  if (rows.length !== E.dokumente) {
    return { ok: false, grund: "verstehen-dedup-abweichend", anzahl: rows.length, erwartet: E.dokumente };
  }
  // S5 — Clusterzahl exakt 122.
  const clusters = clusterRawDocuments(rows);
  if (clusters.length !== E.cluster) {
    return { ok: false, grund: "verstehen-cluster-abweichend", anzahl: clusters.length, erwartet: E.cluster };
  }
  const verteilung = groessenVerteilung(clusters);
  const dokumenteInClustern = clusters.reduce((n, c) => n + ((c && c.documents) || []).length, 0);
  // S6 — Größenverteilung und Vollständigkeit (die Clusterung ist eine Partition).
  if (dokumenteInClustern !== E.dokumente) {
    return { ok: false, grund: "verstehen-cluster-nicht-partition", anzahl: dokumenteInClustern, erwartet: E.dokumente };
  }
  if (!gleicheVerteilung(verteilung, E.clusterGroessen)) {
    return { ok: false, grund: "verstehen-clustergroessen-abweichend", verteilung, erwartet: E.clusterGroessen };
  }

  // S7 — die Klassifikation jedes Clusters, rein lesend.
  const geordnet = ordneCluster(clusters);
  const einteilungen = [];
  for (const cluster of geordnet) {
    const k = await klassifiziereCluster(cluster, deps, opts);
    // W-1: ein Bestandslesefehler bricht die Planung fail closed ab — KEIN Kandidatenvergleich,
    // KEIN ok, KEIN Weiterlauf. Der Grund bleibt sichtbar und unterscheidbar.
    if (k.art === "lesefehler") {
      return { ok: false, grund: "verstehen-bestandslesefehler", vorgangId: k.vorgangId || null, lesefehler: k.lesefehler || null };
    }
    einteilungen.push({
      dokumente: (cluster.documents || []).length,
      art: k.art,
      kandidat: k.kandidat === true,
      vorgangId: k.vorgangId || null,
      resolution: k.resolution || null,
      begruendung: k.begruendung || null,
      // NUR bei `neu`: die vorhandenen Resolver-Spuren, auf genau die drei rein technischen
      // Felder reduziert. Bewusst NICHT uebernommen werden die uebrigen Felder der Spur
      // (Kernanker, Wortformen, geprüfte Dokumentkennungen, Ueberdeckung) — sie sind aus
      // Titeln abgeleitet und gehoeren nicht in eine Meldung (DSGVO-Datensparsamkeit).
      ...(k.art === "neu" ? {
        spuren: (Array.isArray(k.spuren) ? k.spuren : []).map((s) => ({
          vorgangId: (s && s.vorgangId) || null,
          gleich: Boolean(s && s.gleich),
          grund: (s && s.grund) || null
        }))
      } : {})
    });
  }
  const kandidaten = einteilungen.filter((e) => e.kandidat).length;
  if (kandidaten > E.maxModellaufrufe) {
    return {
      ok: false, grund: "verstehen-kandidaten-ueber-deckel",
      kandidaten, erwartet: E.maxModellaufrufe,
      verteilung, einteilungen
    };
  }
  const arten = einteilungen.reduce((m, e) => { m[e.art] = (m[e.art] || 0) + 1; return m; }, {});
  return {
    ok: true,
    plan: {
      dokumente: rows.length,
      idHash: hash,
      cluster: clusters.length,
      verteilung,
      kandidaten,
      arten,
      einteilungen,
      geordnet
    }
  };
}

// ── SCHRITT 2: DER LAUF ───────────────────────────────────────────────────────────────────
// `execute === false` (Default) plant ausschließlich und kehrt zurück — kein Modellaufruf,
// kein Schreibzugriff, keine Quittung.
async function fuehreAus({
  ids = null, deps = {}, execute = false, commit = null, env = process.env,
  now = () => new Date(), preisJeAufrufUsd = null, runId = null, fortschritt = null,
  budgetBoden = null, erwartet = null
} = {}) {
  const E = pruefeErwartet(erwartet);
  const start = now();
  const startMs = start.getTime();
  const bindung = {
    version: 1, quittungsschluessel: QUITTUNG,
    commit: E.commit, dokumente: E.dokumente, idHash: E.idHash,
    cluster: E.cluster, maxModellaufrufe: E.maxModellaufrufe,
    maxUsd: E.maxUsd, maxMs: E.maxMs,
    runId: runId == null ? null : String(runId), gestartetAm: start.toISOString()
  };
  const bericht = {
    ...bindung,
    ok: true, reinLesend: !execute, ausgeloest: false, schutzvertrag: false,
    modellaufrufe: 0, quellenabrufe: 0, profilwrites: 0, kommunikation: 0,
    modellaufrufeKandidaten: null, bilanz: null, abbruchGrund: null,
    automatischeWiederholung: false, quittung: null, quittungStatus: null
  };

  // ── Schutzvertrag VOR allem Weiteren ────────────────────────────────────────────────────
  const geprueft = await pruefeUndPlane({ ids, deps, commit, erwartet: E });
  bericht.schutzvertrag = geprueft.ok === true;
  if (!geprueft.ok) {
    // ── REIN MELDENDE ABBRUCHDIAGNOSE ─────────────────────────────────────────────────────
    // `pruefeUndPlane` hat diese Werte für den Kandidatendeckel-Fall bereits berechnet und
    // verworfen wurde bisher nur die Weitergabe. Hier werden sie SICHTBAR gemacht — sonst
    // nichts. Der Ausgang bleibt unverändert: `ok`, `schutzvertrag` und `ausgeloest` bleiben
    // falsch, es wird kein Cluster verarbeitet, kein Modell aufgerufen, keine Quittung
    // beansprucht, keine Grenze verschoben. Ohne diese Diagnose ist ein Überschuss nicht
    // ursächlich zuordenbar.
    const einteilungen = Array.isArray(geprueft.einteilungen) ? geprueft.einteilungen : [];
    const diagnoseBereit = einteilungen.length > 0;
    return {
      ...bericht,
      ok: false,
      grund: geprueft.grund,
      ...(geprueft.verteilung ? { clusterGroessen: geprueft.verteilung } : {}),
      ...(geprueft.kandidaten == null ? {} : { modellaufrufeKandidaten: Number(geprueft.kandidaten) }),
      ...(diagnoseBereit ? {
        // Zählung der TATSÄCHLICH vorhandenen Einteilungen — es wird keine Kategorie
        // erfunden, jede Klasse stammt aus `pruefeUndPlane`.
        clusterArten: einteilungen.reduce((m, e) => { m[e.art] = (m[e.art] || 0) + 1; return m; }, {}),
        // Technische Kennungen des BESTEHENDEN Motors: Vorgangskennung, Klasse, Urteil,
        // Auflösungsweg und Grundklasse. Bewusst KEINE Titel, Auszüge oder Modelltexte
        // (DSGVO-Datensparsamkeit, dieselbe Regel wie in der Lauftelemetrie).
        // Bei `art = neu` zusaetzlich die Resolver-Spuren auf drei Felder reduziert
        // (vorgangId, gleich, grund) — leer, wenn kein Kandidat geprueft wurde.
        clusterDiagnose: einteilungen.map((e) => ({
          vorgangId: e.vorgangId || null,
          art: e.art,
          kandidat: e.kandidat === true,
          resolution: e.resolution || null,
          begruendung: e.begruendung || null,
          ...(e.art === "neu" ? { spuren: Array.isArray(e.spuren) ? e.spuren : [] } : {})
        }))
      } : {})
    };
  }
  const plan = geprueft.plan;
  bericht.modellaufrufeKandidaten = plan.kandidaten;
  bericht.clusterGroessen = plan.verteilung;
  bericht.clusterArten = plan.arten;
  if (!execute) {
    return {
      ...bericht, reinLesend: true,
      planUebersicht: { cluster: plan.cluster, kandidaten: plan.kandidaten, arten: plan.arten }
    };
  }

  // ── VORFLUG: Preis, Schloss, CAS, Quittung ──────────────────────────────────────────────
  if (!Number.isFinite(Number(preisJeAufrufUsd)) || Number(preisJeAufrufUsd) <= 0) {
    // „FEHLT DER PREIS, FEHLT DIE ZAHL" — ohne bestätigten Preis ist der Kostendeckel
    // nicht erzwingbar, und ohne erzwingbaren Kostendeckel startet kein bezahlter Lauf.
    return { ...bericht, ok: false, grund: "verstehen-preis-fehlt" };
  }
  const preis = Number(preisJeAufrufUsd);
  if (typeof deps.acquireLock !== "function" || typeof deps.releaseLock !== "function") {
    return { ...bericht, ok: false, grund: "verstehen-schloss-fehlt" };
  }
  // Der atomare Verstehensvertrag (CAS + Fencing) ist Pflicht: ohne ihn gäbe es keine
  // At-most-once-Zusage und ein bezahlter Aufruf könnte wiederholt werden.
  if (typeof deps.verstehenVertrag !== "function" || !deps.verstehenVertrag()) {
    return { ...bericht, ok: false, grund: "verstehen-cas-erforderlich" };
  }
  if (typeof deps.claimRun !== "function" || typeof deps.finishRun !== "function") {
    return { ...bericht, ok: false, grund: "verstehen-quittungsadapter-fehlt" };
  }
  // Budget-Boden VOR der teuren Arbeit (bestehende Vorprüfung, rein lesend, fail closed).
  if (typeof deps.leseTageszaehler === "function") {
    const boden = await rueckstand.vorabBodenPruefung({
      leseTageszaehler: deps.leseTageszaehler,
      ...(budgetBoden == null ? {} : { budgetBoden })
    });
    if (boden.erlaubt !== true) {
      return { ...bericht, ok: false, grund: `verstehen-${boden.grund}` };
    }
  }

  const deadlineMs = startMs + Number(E.maxMs);
  // ZWEI UNABHAENGIGE RIEGEL MIT DERSELBEN ZAHL (in Produktion beide 113):
  //   * `maxModellaufrufe` gatet den PLAN (S7, `pruefeUndPlane`) — was der Lauf hoechstens
  //     VORHAT, wird vor dem ersten Aufruf geprueft;
  //   * `laufMaxModellaufrufe` gatet den LAUF — er greift auch dann, wenn der Plan die
  //     Aufrufe unterschaetzt haette (der einzige belegte Unterschaetzungsfall ist der
  //     `bestand-ohne-beleg`-Pfad, der erst zur Laufzeit durch Verknuepfungen neue Fakten
  //     bekommen kann).
  // Die Trennung der beiden Felder dient ausschliesslich der Pruefbarkeit des Laufdeckels
  // (siehe `pruefmodus` oben); in Produktion sind sie identisch 113.
  const laufDeckel = Number(E.laufMaxModellaufrufe == null ? E.maxModellaufrufe : E.laufMaxModellaufrufe);
  const ergebnisse = [];
  let aufrufe = 0;
  let abbruch = null;
  let locked = false;
  let claimed = false;
  let quittiert = false;

  const schliesseQuittung = async (status, extra = {}) => {
    if (!claimed || quittiert) return false;
    try {
      quittiert = await deps.finishRun({
        ...bindung,
        status, beendetAm: now().toISOString(),
        modellaufrufe: aufrufe,
        modellaufrufeKandidaten: plan.kandidaten,
        laufMaxModellaufrufe: laufDeckel,
        automatischeWiederholung: false,
        bilanz: bilanzVon(ergebnisse),
        ...(abbruch ? { abbruchGrund: abbruch.grund, abbruchVorgangId: abbruch.vorgangId || null } : {}),
        ...extra
      }) === true;
    } catch (_) { quittiert = false; }
    return quittiert;
  };

  try {
    locked = await deps.acquireLock();
    if (!locked || locked.granted !== true) {
      return { ...bericht, ok: false, grund: "verstehen-bereits-aktiv" };
    }
    // EINMALQUITTUNG — VOR dem ersten möglichen Modellaufruf.
    claimed = await deps.claimRun({ ...bindung, status: "laeuft", maxUsd: E.maxUsd });
    if (claimed !== true) {
      return { ...bericht, ok: false, grund: "verstehen-bereits-verwendet", ausgeloest: false };
    }

    const depsMitZaehler = {
      ...deps,
      // Zählt die TATSÄCHLICH begonnenen Modellaufrufe. Der Deckel wird VOR jedem Cluster
      // geprüft; ein Cluster kostet höchstens einen Aufruf (CAS-At-most-once).
      requestUnderstanding: (prompt) => {
        aufrufe += 1;
        return deps.requestUnderstanding(prompt);
      }
    };
    const retriesCtx = { geladen: false, map: null };

    for (const cluster of plan.geordnet) {
      if (abbruch) break;
      // Aufrufdeckel (113): hart, geprueft VOR dem Cluster.
      if (aufrufe >= laufDeckel) { abbruch = { grund: "verstehen-aufrufdeckel-erreicht" }; break; }
      // Kostendeckel (0,80 USD): hart, geprüft VOR dem Cluster.
      if ((aufrufe + 1) * preis > Number(E.maxUsd)) { abbruch = { grund: "verstehen-kostendeckel-erreicht" }; break; }
      // Zeitdeckel (35 min): die bestehende Restzeitwache, geprüft VOR dem Cluster.
      const zeit = restzeit.restzeitEntscheidung({
        deadlineMs, jetztMs: now().getTime(), env, reserveMs: restzeit.reserveVorModellstartMs(env)
      });
      if (!zeit.erlaubt) { abbruch = { grund: "verstehen-zeitdeckel-erreicht" }; break; }

      let r = null;
      try {
        r = await understandingVomMotor(cluster, depsMitZaehler, { deadlineMs, retriesCtx });
      } catch (error) {
        r = { status: "cluster-error", grund: grundVon(error) };
      }
      ergebnisse.push({
        vorgangId: (r && r.vorgangId) || null, status: (r && r.status) || "unbekannt",
        ausgang: (r && r.ausgang) || null, dokumente: Number((r && r.documents) || 0),
        // Nur Grundklassen und Wortmarken des bestehenden Motors — kein Prompt, keine Antwort.
        reason: (r && (r.reason || r.begruendung)) || null
      });
      if (fortschritt) fortschritt({ fertig: ergebnisse.length, gesamt: plan.geordnet.length, aufrufe });
      // UNBEKANNTER MODELLAUSGANG: der GESAMTE Runner endet hier. Kein nächster Cluster,
      // kein automatischer Retry. Die Kostenreserve bleibt unangetastet.
      if (r && r.ausgang === "unbekannt") {
        abbruch = { grund: "verstehen-ausgang-unbekannt", vorgangId: (r && r.vorgangId) || null };
        break;
      }
    }

    const status = abbruch
      ? (abbruch.grund === "verstehen-ausgang-unbekannt" ? "unbekannt" : "gestoppt")
      : "abgeschlossen";
    await schliesseQuittung(status);
    bericht.ausgeloest = true;
    bericht.modellaufrufe = aufrufe;
    bericht.bilanz = bilanzVon(ergebnisse);
    bericht.abbruchGrund = abbruch ? abbruch.grund : null;
    bericht.quittung = quittiert ? QUITTUNG : null;
    bericht.quittungStatus = quittiert ? status : null;
    bericht.ergebnisse = ergebnisse;
    bericht.ok = !abbruch;
    return bericht;
  } catch (error) {
    // Auch ein Abbruch darf nicht still wiederholbar werden: die Quittung wird terminal
    // geschlossen, wenn sie beansprucht wurde.
    const geschlossen = await schliesseQuittung("gestoppt", { grund: grundVon(error) });
    return {
      ...bericht, ok: false, ausgeloest: locked === true,
      modellaufrufe: aufrufe, bilanz: bilanzVon(ergebnisse), ergebnisse,
      grund: grundVon(error), abbruchGrund: grundVon(error),
      quittung: geschlossen ? QUITTUNG : null,
      quittungStatus: geschlossen ? "gestoppt" : null,
      quittungOffen: claimed && !geschlossen
    };
  } finally {
    if (locked) { try { await deps.releaseLock(); } catch (_) { /* ignore */ } }
  }
}

// Der EINE Motor — als eigene Funktion, damit der Aufruf im Lauf sichtbar und prüfbar ist.
function understandingVomMotor(cluster, deps, opts) {
  // Bewusst zur Laufzeit geladen: keine zweite Fachlogik, sondern genau `understandOneCluster`.
  const { understandOneCluster } = require("./understanding");
  return understandOneCluster(cluster, deps, opts);
}

function bilanzVon(ergebnisse = []) {
  return {
    verarbeitet: ergebnisse.length,
    arten: ergebnisse.reduce((m, r) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {}),
    unbekannt: ergebnisse.filter((r) => r.ausgang === "unbekannt").length
  };
}

module.exports = {
  PINNED,
  QUITTUNG,
  CALLTYPE,
  idsHash,
  groessenVerteilung,
  klassifiziereCluster,
  ordneCluster,
  pruefeUndPlane,
  fuehreAus
};
