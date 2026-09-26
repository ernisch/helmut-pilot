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
// ── UNBEKANNTER MODELLAUSGANG — ZWEI KLASSEN (2026-09-24) ───────────────────────────────────
//   `ausgang === "unbekannt"` heisst: ein bezahlter Aufruf lief, sein Ergebnis ist aber nicht
//   belegt. Der betroffene Vorgang wird IMMER terminal gesperrt (CAS/Fencing, keine Verknuepfung,
//   kein automatischer zweiter Aufruf) und die bestehende Kostenreserve des Aufrufs bleibt
//   unangetastet. Unterschieden wird AUSSCHLIESSLICH, ob dieser LOKALE Befund den GESAMTEN Lauf
//   beenden darf:
//     * KLASSE A — LOKALER CLUSTERFEHLER `status === "skipped-invalid"`: die Modellantwort
//       DIESES Clusters ist fachlich ungueltig (z. B. `quellenbeleg-parteien`). Das sagt nichts
//       ueber andere, unabhaengige Vorgaenge. Der Cluster bleibt `unbekannt`/`skipped-invalid`
//       (keine Wiederholung, keine Umdeutung zu Erfolg); der Lauf arbeitet die uebrigen Cluster
//       weiter ab und bilanziert sie. Der Gesamtstatus bleibt trotzdem rot:
//       `bilanz.unbekannt > 0` ⇒ `ok = false`; die Quittung ist `unbekannt`, SOFERN kein globaler
//       Abbruch vorliegt — ein Klasse-B-Abbruch hat beim Quittungsstatus Vorrang (siehe unten).
//     * KLASSE B — GLOBALER VERTRAGS-/INFRASTRUKTURFEHLER (`cluster-error` unerwarteter
//       Motorwurf, `skipped-error`, `skipped-store`, `skipped-veraltet`: Code-/Speicher-/
//       Transport-/Modellfehler, nicht pruefbarer Speicher, verlorenes Schreibrecht): hier steht
//       die Verlaesslichkeit des weiteren Laufs selbst in Frage ⇒ unveraendert SOFORTIGER
//       Gesamtabbruch vor dem naechsten Cluster.
//   Ein Klassen-A-Lauf ist an `abbruchGrund === null` UND `bilanz.unbekannt > 0` erkennbar;
//   `fachlichBestanden`/`ok` bleiben in beiden Faellen falsch.
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
const F30 = require("./verstehen-frische30-vertrag");
const F7 = require("./verstehen-bund7-vertrag");
const F16 = require("./verstehen-frische16-vertrag");
const F18 = require("./verstehen-frische18-vertrag");
const R15 = require("./verstehen-rest15-vertrag");

const D = require("./testkohorte-direkt500");
const { resolveVorgang, duplikatBrauchtAufruf, leseWiederaufnahmeFreigaben } = require("./understanding");
const { clusterRawDocuments, deriveVorgangId, neueErkenntnisse } = require("./vorgang-identity");
const { dedupeRawDocuments, toRawDocumentRow } = require("./dedup");
const { isTerminalUnderstandingStatus } = require("./pending-terminal");
const rueckstand = require("./verstehen-rueckstand");
const restzeit = require("./verstehen-restzeit");

// Die feste Bindung. Diese Werte sind NICHT konfigurierbar: sie sind der Auftrag.
// ACHTUNG — ZWEI VERSCHIEDENE COMMITS, DIE NICHT VERMISCHT WERDEN DUERFEN:
//   * `PINNED.commit` ist der DOKUMENT-SNAPSHOT-COMMIT: der historische Production-Beleg, aus dem
//     die 169 Kennungen, ihr Hash und die 122 Cluster stammen (S1) — er beschreibt den DATENSATZ.
//   * der RUNTIME-COMMIT (siehe `runtimeCommitVon` unten) ist der Git-Commit des Codes, der den
//     Lauf TATSÄCHLICH ausführt. Er ist NICHT dieser Wert.
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

// ── QUITTUNGSSCHLÜSSEL EINES NEUEN VERSUCHS ──────────────────────────────────────────────
// Der Schlüssel ist Teil der Auftragsbindung. OHNE ausdrücklich übergebenen Schlüssel gilt
// die feste Konstante `QUITTUNG` (der alte, terminal unbekannte Auftrag) — der alte Auftrag
// bleibt damit unverändert blockiert, ein versehentlicher zweiter Lauf endet in
// `verstehen-bereits-verwendet` ohne Modellaufruf. Ein NEUER Versuch ist ausschließlich mit
// einem expliziten, gültigen und vom alten VERSCHIEDENEN Schlüssel möglich: die Kennung
// entscheidet der Betreiber, der Code erfindet keine. Dieselbe Kennung wie der alte Auftrag
// ist kein neuer Vertrag (fail closed) — ebenso eine Kennung außerhalb des engen Musters
// `verstehen169-<JJJJMMTT>-<suffix>` (Suffix: mindestens ein alphanumerisches Zeichen).
const QUITTUNG_MUSTER = /^verstehen169-\d{8}-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// ── RUNTIME-COMMIT (der TATSÄCHLICH ausgeführte Code-Stand) ──────────────────────────────
// Ohne diese Bindung wäre die „Bindung" eine Formsache: nach einem Merge könnte neuer Code
// laufen, während der Bericht weiter den alten Dokument-Snapshot-Commit `ea84f26c…` nennt.
// Der Betreiber übergibt deshalb zusätzlich den Runtime-Commit als VOLLEN Git-SHA. Der Kern
// erfindet NIE einen Lauf-Commit (keine selbstreferenzielle Konstante) — er prüft nur die Form
// und führt den übergebenen Wert in Bericht und Quittung. Dass der Wert dem ECHTEN Checkout
// entspricht (`git rev-parse HEAD`), stellt der Bedienweg her, fail closed VOR jedem Schreib-
// zugriff und jedem Modellaufruf.
const RUNTIME_COMMIT_MUSTER = /^[0-9a-f]{40}$/;
function runtimeCommitVon(wert) {
  const roh = String(wert == null ? "" : wert).trim();
  // LEER heisst: KEIN Runtime-Commit übergeben — der Wert bleibt `null` und wird nirgends
  // erfunden. Der Bedienweg entscheidet, ob das im jeweiligen Modus zulässig ist.
  if (roh === "") return { ok: true, commit: null };
  if (!RUNTIME_COMMIT_MUSTER.test(roh)) return { ok: false, grund: "verstehen-runtime-commit-ungueltig" };
  return { ok: true, commit: roh };
}
function quittungsschluesselVon(wert) {
  const roh = String(wert == null ? "" : wert).trim();
  // LEER ist der ALTE Auftrag: `schluessel` bleibt `null`, damit der Aufrufer den Standard
  // NICHT als ausdrücklich übergebene alte Kennung missversteht. `fuehreAus` ersetzt `null`
  // durch `QUITTUNG`. Die alte Kennung ist ausschließlich als AUSDRÜCKLICHER Wert verboten.
  if (roh === "") return { ok: true, schluessel: null, standard: true };
  if (roh === QUITTUNG) return { ok: false, grund: "verstehen-quittung-identisch" };
  if (!QUITTUNG_MUSTER.test(roh)) return { ok: false, grund: "verstehen-quittung-ungueltig" };
  return { ok: true, schluessel: roh, standard: false };
}

// FIX A (169er Production-Befund 2026-09-23): im `skipped-invalid`-Pfad duerfen nur die
// FESTEN, sicheren Fehlercodes des Motors in den Bericht. Schema-Fehlermeldungen aus
// `validateKnowledgeObject` koennen Rohwerte der Modellantwort enthalten (z.B.
// "zeitdruck: '<wert>' nicht in {...}") und bleiben deshalb aussen — ebenso wie Prompt,
// Antwort und Volltexte (DSGVO-Datensparsamkeit, dieselbe Regel wie in der Lauftelemetrie).
// ERWEITERUNG 2026-09-24 (Run 35987448290, vg-verzoegerung-20230613-95c80f): damit eine rein
// schemabedingte Ablehnung nicht mehr anonym bleibt (`validierungsfehler = []`), liefert der
// Motor zusaetzlich WERTFREIE Codes derselben Herkunft (`schema-*`/`dsgvo-*` — nur feste
// Wortmarken und Feldpfade aus dem eigenen Schema, NIE ein Modellwert). Beide Listen sind
// deckungsgleich zu halten (Test: `understanding-einzelvorgang-test.js`).
const SICHERE_VALIDIERUNGSFEHLER = /^(ki-antwort-nicht-verwertbar|decision_level-antwortkonflikt|quellenbeleg-(ministerien|mentioned_ministries|parteien|mentioned_parties|mentioned_people|mentioned_mps|ausschuesse|mentioned_committees)|(schema|dsgvo)-[a-z-]+(:[a-z0-9_.]+)?)$/;

function pruefeErwartet(erwartet) {
  if (erwartet === undefined || erwartet === null) return PINNED;
  if (erwartet === PINNED) return PINNED;
  // Nur das eingefrorene neue Auftragobjekt, keine frei konfigurierbaren Produktionsgrenzen.
  if (erwartet === F30.FRISCHE30) return F30.FRISCHE30;
  if (erwartet === F7.BUND7) return F7.BUND7;
  if (erwartet === F16.FRISCHE16) return F16.FRISCHE16;
  if (erwartet === F18.FRISCHE18) return F18.FRISCHE18;
  if (erwartet === R15.REST15) return R15.REST15;
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
  // Die ausdruecklichen Betreiberfreigaben (`erneut`) dieses Laufs — EINE Lesung fuer Plan und
  // Lauf (siehe `leseWiederaufnahmeFreigaben`). Ohne Set gilt: keine Freigabe.
  const freigaben = opts && opts.freigaben instanceof Set ? opts.freigaben : new Set();
  if (!clusterDocs.length) return { art: "leer", kandidat: false, begruendung: "kein-dokument" };
  const aufloesung = await resolveVorgang(cluster, deps, opts);
  // W-1: ein Bestandslesefehler darf niemals als `neu` klassifiziert werden — die Planung
  // bricht fail closed ab (der Aufrufer stoppt vor Kandidatenvergleich, Modell und Write).
  if (aufloesung.resolution === "bestand-lesefehler") {
    return {
      art: "lesefehler", kandidat: false, vorgangId: aufloesung.vorgangId || null,
      resolution: "bestand-lesefehler", begruendung: aufloesung.begruendung || "bestandslesefehler",
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
      // DIESELBE Entscheidung wie der Motor (`duplikatBrauchtAufruf`) — KEINE eigene Regel:
      // ein vollstaendiges Duplikat ist NUR dann Kandidat, wenn der Motor tatsaechlich einen
      // Aufruf machen wuerde (offene Update-Vormerkung oder ausdrueckliche Betreiberfreigabe).
      // Den Vertrag holt der Plan NUR hier und nur einmal — er dient ausschliesslich dem Lesen
      // der Vormerkung (Reservierung/Fencing bleiben unberuehrt, es entsteht kein Write).
      const vertrag = typeof deps.verstehenVertrag === "function" ? deps.verstehenVertrag() : null;
      const entscheidung = await duplikatBrauchtAufruf(deps, opts.retriesCtx, aufloesung.vorgangId,
        vertrag, freigaben.has(String(aufloesung.vorgangId)));
      if (entscheidung.lesbar !== true && vertrag) {
        // C) Die Vormerkung ist NICHT sicher lesbar: fail closed. Der Plan bricht ab (Aufrufer
        // behandelt `art === "lesefehler"`), statt die Kandidatenzahl still zu verkleinern.
        return {
          ...basis, art: "lesefehler", kandidat: false,
          lesefehler: entscheidung.grund || "vormerkung-nicht-lesbar",
          begruendung: "vormerkung-nicht-lesbar"
        };
      }
      return {
        ...basis, art: "duplikat", kandidat: entscheidung.aufruf === true,
        begruendung: entscheidung.grund || null
      };
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
  // Geparkter Vorgang (KI-Fehlschlag): kein AUTOMATISCHER Neuversuch — aber eine AUSDRUECKLICHE
  // Betreiberfreigabe (`erneut`) hebt das Gate fuer GENAU diesen Vorgang auf. Dieselbe Bedingung
  // prueft der Motor ueber `opts.wiederaufnahmeFreigabe`.
  if (existing.understanding_status === "failed") {
    const frei = freigaben.has(String(aufloesung.vorgangId));
    return { ...basis, art: "failed", kandidat: frei, begruendung: frei ? "betreiberfreigabe" : "failed-ohne-freigabe" };
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
  // Historische Auftraege bleiben ohne Artikelkontext. Der neue amtliche
  // Auftrag akzeptiert nur die gehashte, bereits gespeicherte Versorgung;
  // auch er erlaubt hier keinen neuen Quellenabruf.
  if (E === R15.REST15 ? !R15.istVersorgung(deps.artikelkontextVersorgung)
    : E === F18.FRISCHE18 ? !F18.istVersorgung(deps.artikelkontextVersorgung)
    : E === F16.FRISCHE16 ? !F16.istVersorgung(deps.artikelkontextVersorgung)
    : E === F7.BUND7 ? !F7.istVersorgung(deps.artikelkontextVersorgung)
    : Object.hasOwn(deps, "artikelkontextVersorgung")) {
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

  if (E === F30.FRISCHE30 && !F30.pruefeInhalt(geladen)) {
    return { ok: false, grund: "verstehen-frische30-inhalt-oder-alter-abweichend" };
  }
  if (E === R15.REST15 && !R15.pruefeInhalt(geladen)) {
    return { ok: false, grund: "verstehen-rest15-inhalt-oder-alter-abweichend" };
  }
  if (E === F16.FRISCHE16 && !F16.pruefeInhalt(geladen)) {
    return { ok: false, grund: "verstehen-frische16-inhalt-oder-alter-abweichend" };
  }
  if (E === F18.FRISCHE18 && !F18.pruefeInhalt(geladen)) {
    return { ok: false, grund: "verstehen-frische18-inhalt-oder-alter-abweichend" };
  }
  if (E === F7.BUND7 && !F7.pruefeInhalt(geladen)) {
    return { ok: false, grund: "verstehen-bund7-inhalt-oder-alter-abweichend" };
  }

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
    if (E === R15.REST15 && k.vorgangId === R15.VORGANG) {
      return { ok: false, grund: "verstehen-rest15-gesperrter-vorgang" };
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
  now = () => new Date(), runId = null, fortschritt = null,
  budgetBoden = null, erwartet = null, quittungsschluessel = null,
  runtimeCommit = null
} = {}) {
  const E = pruefeErwartet(erwartet);
  // Der RUNTIME-COMMIT (der tatsächlich ausgeführte Code-Stand) wird streng auf Form geprüft,
  // BEVOR irgendeine andere Wirkung eintritt. Ein unbrauchbarer Wert ist ein fail-closed-Abbruch;
  // ein fehlender bleibt `null` (der Bedienweg verlangt ihn im scharfen Lauf).
  const laufCommit = runtimeCommitVon(runtimeCommit);
  if (!laufCommit.ok) {
    return {
      ok: false, reinLesend: !execute, ausgeloest: false, schutzvertrag: false,
      modellaufrufe: 0, quellenabrufe: 0, profilwrites: 0, kommunikation: 0,
      modellaufrufeKandidaten: null, bilanz: null, snapshotCommit: E.commit, runtimeCommit: null,
      grund: laufCommit.grund, automatischeWiederholung: false,
      quittungsschluessel: QUITTUNG, quittung: null, quittungStatus: null
    };
  }
  // Die Kennung des NEUEN Versuchs wird ausdrücklich übergeben und streng geprüft — vor
  // jeder anderen Wirkung. Ohne sie gilt der alte Schlüssel (alter Auftrag, blockiert).
  const quittung = E === R15.REST15
    ? { ok: quittungsschluessel === R15.QUITTUNG, schluessel: R15.QUITTUNG, grund: "verstehen-rest15-quittung-abweichend" }
    : E === F18.FRISCHE18
    ? { ok: quittungsschluessel === F18.QUITTUNG, schluessel: F18.QUITTUNG, grund: "verstehen-frische18-quittung-abweichend" }
    : E === F16.FRISCHE16
    ? { ok: quittungsschluessel === F16.QUITTUNG, schluessel: F16.QUITTUNG, grund: "verstehen-frische16-quittung-abweichend" }
    : E === F30.FRISCHE30
    ? { ok: quittungsschluessel === F30.QUITTUNG, schluessel: F30.QUITTUNG, grund: "verstehen-frische30-quittung-abweichend" }
    : E === F7.BUND7
      ? { ok: quittungsschluessel === F7.QUITTUNG, schluessel: F7.QUITTUNG, grund: "verstehen-bund7-quittung-abweichend" }
    : quittungsschluesselVon(quittungsschluessel);
  if (!quittung.ok) {
    return {
      ok: false, reinLesend: !execute, ausgeloest: false, schutzvertrag: false,
      modellaufrufe: 0, quellenabrufe: 0, profilwrites: 0, kommunikation: 0,
      modellaufrufeKandidaten: null, bilanz: null,
      grund: quittung.grund, automatischeWiederholung: false,
      quittungsschluessel: QUITTUNG, quittung: null, quittungStatus: null
    };
  }
  // LEER (Standard) ist der ALTE Auftrag: `quittung.schluessel` ist dann null und wird hier
  // auf die feste Konstante gesetzt — OHNE die Identitätsprüfung zu berühren. Nur ein
  // AUSDRÜCKLICH übergebener alter Schlüssel war oben `verstehen-quittung-identisch`.
  const schluessel = quittung.schluessel || QUITTUNG;
  const start = now();
  const startMs = start.getTime();
  const bindung = {
    version: 1, quittungsschluessel: schluessel,
    // `commit` = Dokument-Snapshot-Commit (S1, der DATENSATZ); `runtimeCommit` = der Git-Commit
    // des TATSÄCHLICH ausgeführten Codes. Zwei getrennte Dinge — nie ineinander lesen.
    commit: E.commit, runtimeCommit: laufCommit.commit, dokumente: E.dokumente, idHash: E.idHash,
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

  // ── VORFLUG: DER CAS-VERTRAG (EINMAL bestimmt) ─────────────────────────────────────────
  // Er ist zweimal noetig — fuer die Betreiberfreigaben unten und fuer die Pflichtpruefung vor
  // dem bezahlten Pfad (unten, unveraendert an derselben Stelle). Die Erzeugung selbst hat keine
  // Wirkung (kein Write, keine Reservierung), sie liefert nur das Objekt des BESTEHENDEN Vertrags.
  const casVertrag = typeof deps.verstehenVertrag === "function" ? deps.verstehenVertrag() : null;

  // ── BETREIBERFREIGABEN (`erneut`) — EINE Lesung fuer Plan UND Lauf ──────────────────────
  // Fail closed: ist die Liste wegen eines ECHTEN Lesefehlers nicht verfuegbar, startet der Lauf
  // NICHT. Sonst koennte die Kandidatenzahl still sinken oder eine ausdrueckliche Freigabe
  // unbemerkt verloren gehen („nicht konfiguriert" ist dagegen ein Umgebungszustand, kein Fehler).
  const freigabenAntwort = await leseWiederaufnahmeFreigaben(deps, Boolean(casVertrag));
  if (freigabenAntwort.ok !== true) {
    return {
      ...bericht, ok: false, grund: "verstehen-wiederaufnahmen-nicht-lesbar",
      lesefehler: freigabenAntwort.grund || null
    };
  }
  // Der neue Quellenauftrag ist keine Wiederaufnahmefreigabe fuer alte Fehler.
  const freigaben = E === F30.FRISCHE30 || E === F7.BUND7 || E === F16.FRISCHE16 || E === F18.FRISCHE18 || E === R15.REST15 ? new Set() : freigabenAntwort.freigaben;

  // ── Schutzvertrag VOR allem Weiteren ────────────────────────────────────────────────────
  const geprueft = await pruefeUndPlane({ ids, deps, commit, opts: { freigaben }, erwartet: E });
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

  // ── VORFLUG: Schloss, CAS, Quittung, Kostenwahrheit ──────────────────────────────────────
  // Ohne die BESTEHENDE atomare Kostenwahrheit (volle Reservierung je Aufruf plus echter
  // Laufkostenstand aus der Abrechnung) ist der 0,80-USD-Laufdeckel nicht erzwingbar — dann
  // startet kein bezahlter Lauf. Ein DURCHSCHNITTSPREIS je Aufruf ist ausdruecklich KEINE
  // harte Kostenobergrenze und wird hier nicht als solche verwendet („fehlt die
  // Kostenwahrheit, fehlt die Zahl“).
  if (typeof deps.reservierungHoeheUsd !== "function" || typeof deps.laufKostenUsd !== "function") {
    return { ...bericht, ok: false, grund: "verstehen-kostenwahrheit-fehlt" };
  }
  const reservierungUsd = Number(deps.reservierungHoeheUsd());
  if (!Number.isFinite(reservierungUsd) || reservierungUsd <= 0) {
    return { ...bericht, ok: false, grund: "verstehen-kostenwahrheit-fehlt" };
  }
  if (typeof deps.acquireLock !== "function" || typeof deps.releaseLock !== "function") {
    return { ...bericht, ok: false, grund: "verstehen-schloss-fehlt" };
  }
  // Der atomare Verstehensvertrag (CAS + Fencing) ist Pflicht: ohne ihn gäbe es keine
  // At-most-once-Zusage und ein bezahlter Aufruf könnte wiederholt werden. Geprueft wird der
  // OBEN EINMAL bestimmte Vertrag (gleiche Aussage, keine zweite Erzeugung).
  if (!casVertrag) {
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
  // Zaehlt AUSSCHLIESSLICH lokale Clusterfehler (Klasse A, `skipped-invalid`), die den Lauf
  // NICHT beenden — sichtbar getrennt von einem globalen Abbruch (Klasse B).
  let lokaleUnbekannte = 0;
  let locked = false;
  let claimed = false;
  let quittiert = false;
  let gebundenUsd = null;
  let finalGebundenUsd = null;

  const schliesseQuittung = async (status, extra = {}) => {
    if (!claimed || quittiert) return false;
    try {
      quittiert = await deps.finishRun({
        ...bindung,
        status, beendetAm: now().toISOString(),
        modellaufrufe: aufrufe,
        modellaufrufeKandidaten: plan.kandidaten,
        laufMaxModellaufrufe: laufDeckel,
        // Der ENDSTAND der diesem Lauf zurechenbaren Kosten — derselbe Wert wie im
        // Abschlussbericht, final erneut gelesen (nicht der Stand vor dem letzten Cluster).
        laufkostenUsd: finalGebundenUsd,
        automatischeWiederholung: false,
        bilanz: bilanzVon(ergebnisse),
        // FIX A: derselbe bereits begrenzte Wert wie im Bericht — damit bleibt die
        // Einmalquittung auch bei einem Stopp mit `verstehen-ausgang-unbekannt` der
        // Abschlussbeleg, der die sicheren Codes nachvollziehbar macht (keine zweite
        // Diagnoseablage, keine neue Tabelle).
        validierungsfehler: [...new Set(ergebnisse.flatMap((e) =>
          (e && Array.isArray(e.validierungsfehler) ? e.validierungsfehler : [])))].slice(0, 5),
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

    for (let i = 0; i < plan.geordnet.length; i += 1) {
      // `plan.einteilungen[i]` gehoert zu `plan.geordnet[i]` (1:1 in `pruefeUndPlane` aufgebaut)
      // und traegt die Vorgangskennung — daraus kommt die exakte Betreiberfreigabe dieses Clusters.
      const cluster = plan.geordnet[i];
      const einteilung = (plan.einteilungen || [])[i] || null;
      if (abbruch) break;
      // Aufrufdeckel (113): hart, geprueft VOR dem Cluster.
      if (aufrufe >= laufDeckel) { abbruch = { grund: "verstehen-aufrufdeckel-erreicht" }; break; }
      // Kostendeckel (0,80 USD): HART, geprueft VOR dem Cluster. Nicht Durchschnittspreis mal
      // Aufrufzahl, sondern der ECHTE Stand der bestehenden Kostenablage dieses Laufs
      // (abgerechnete echte Tokenkosten + offene Reservierungen) plus die VOLLE Reservierung
      // des naechsten Aufrufs. Ein unlesbarer Kostenstand stoppt fail closed.
      try { gebundenUsd = Number(await deps.laufKostenUsd(runId)); }
      catch (_) { abbruch = { grund: "verstehen-kostenleser-fehler" }; break; }
      if (!Number.isFinite(gebundenUsd) || gebundenUsd < 0) {
        abbruch = { grund: "verstehen-kostenleser-fehler" }; break;
      }
      if (gebundenUsd + reservierungUsd > Number(E.maxUsd)) {
        abbruch = { grund: "verstehen-kostendeckel-erreicht", gebundenUsd }; break;
      }
      // Zeitdeckel (35 min): die bestehende Restzeitwache, geprüft VOR dem Cluster.
      const zeit = restzeit.restzeitEntscheidung({
        deadlineMs, jetztMs: now().getTime(), env, reserveMs: restzeit.reserveVorModellstartMs(env)
      });
      if (!zeit.erlaubt) { abbruch = { grund: "verstehen-zeitdeckel-erreicht" }; break; }

      const freigabeVorgang = einteilung && einteilung.vorgangId ? String(einteilung.vorgangId) : null;
      let r = null;
      let motorWurf = false;
      try {
        r = await understandingVomMotor(cluster, depsMitZaehler, {
          deadlineMs, retriesCtx,
          // EXAKT fuer diesen Vorgang: nur wenn seine Kennung ausdruecklich freigegeben ist.
          // Keine automatische Wiederaufnahme anderer failed/duplikat-Cluster.
          wiederaufnahmeFreigabe: Boolean(freigabeVorgang && freigaben.has(freigabeVorgang))
        });
      } catch (error) {
        // Ein unerwarteter Wurf des Motors ist KEIN lokaler Fachfehler: die Ursache ist nicht
        // sicher klassifizierbar (Code-, Speicher-, Infrastruktur- oder Vertragsfehler). Er wird
        // wie KLASSE B behandelt — der Cluster wird sichtbar als `cluster-error` bilanziert (mit
        // der BEKANNTEN Clustergroesse), dann bricht der Lauf global fail closed ab. Die rohe
        // Fehlermeldung wird bewusst NICHT persistiert (sie kann Hostnamen enthalten).
        motorWurf = true;
        r = { status: "cluster-error", grund: grundVon(error), documents: (cluster.documents || []).length };
      }
      ergebnisse.push({
        vorgangId: (r && r.vorgangId) || null, status: (r && r.status) || "unbekannt",
        ausgang: (r && r.ausgang) || null, dokumente: Number((r && r.documents) || 0),
        // Nur Grundklassen und Wortmarken des bestehenden Motors — kein Prompt, keine Antwort.
        reason: (r && (r.reason || r.begruendung)) || null,
        // FIX A: beim `skipped-invalid`-Pfad die bereits motorseitig begrenzten SICHEREN
        // Fehlercodes sichtbar machen — hoechstens fuenf, ausschliesslich feste Wortmarken.
        // Ein Link an einen failed/pending-Vorgang bleibt damit als das sichtbar, was er
        // ist: verknuepft, aber NICHT erfolgreich verstanden (`status` bleibt
        // `skipped-invalid`, die Motor-Gruppe `fehlgeschlagen`).
        ...(r && r.status === "skipped-invalid" && Array.isArray(r.errors)
          ? { validierungsfehler: r.errors.filter((e) => typeof e === "string"
            && SICHERE_VALIDIERUNGSFEHLER.test(e)).slice(0, 5) }
          : {})
      });
      if (fortschritt) fortschritt({ fertig: ergebnisse.length, gesamt: plan.geordnet.length, aufrufe });
      if ((E === F7.BUND7 || E === F16.FRISCHE16 || E === F18.FRISCHE18) && !["saved", "updated", "merged", "duplicate"].includes(r?.status)) {
        abbruch = { grund: E === F18.FRISCHE18 ? "verstehen-frische18-einzelergebnis-nicht-bestaetigt"
          : E === F16.FRISCHE16 ? "verstehen-frische16-einzelergebnis-nicht-bestaetigt" : "verstehen-bund7-einzelergebnis-nicht-bestaetigt", vorgangId: r?.vorgangId || null };
        break;
      }
      // KLASSE B — unerwarteter Motorwurf: NIE weiterlaufen, NIE als bestanden melden. Der
      // betroffene Cluster bleibt als `cluster-error` bilanziert; sein Ausgang ist NICHT sicher
      // klassifizierbar, deshalb globaler Abbruch mit eindeutigem Grund.
      if (motorWurf) {
        abbruch = { grund: "verstehen-cluster-error", vorgangId: (r && r.vorgangId) || null };
        break;
      }
      // UNBEKANNTER MODELLAUSGANG — Fehlerklassifikation (siehe Kopf):
      //   KLASSE A (`skipped-invalid`): LOKALER Clusterfehler. Der Vorgang ist bereits terminal
      //   gesperrt (`marke()` setzt `ausgang`; das CAS stellt ihn im finally auf `unbekannt`) —
      //   KEIN Retry, KEINE Verknuepfung, KEINE Umdeutung zu Erfolg. Der Lauf faehrt mit den
      //   uebrigen unabhaengigen Clustern fort; der Gesamtstatus bleibt ueber `bilanz.unbekannt`
      //   rot (Quittung `unbekannt`, `ok = false`).
      //   KLASSE B (jeder andere unbekannte Ausgang): Vertrags-/Infrastrukturfehler ⇒
      //   unveraendert sofortiger Gesamtabbruch vor dem naechsten Cluster.
      if (r && r.ausgang === "unbekannt") {
        if (r.status === "skipped-invalid") {
          lokaleUnbekannte += 1;
        } else {
          abbruch = { grund: "verstehen-ausgang-unbekannt", vorgangId: (r && r.vorgangId) || null };
          break;
        }
      }
    }

    // ── Finaler Kostenstand: NACH dem letzten Aufruf erneut rein lesend laden ──────────────
    // Bericht und Quittung muessen den ECHTEN Endstand tragen — nicht den Stand VOR dem
    // letzten Cluster. Wurde mindestens ein Aufruf getaetigt, ist der Endstand Pflicht:
    // ein unlesbarer Stand oder ein wider Erwarten ueberschrittener 0,80-USD-Rahmen sind
    // ehrliche Abbruchgruende, kein falsches Gruen. Ein bestehender „unbekannt"-Abbruch
    // wird nicht ueberschrieben — er bleibt der fachlich schwerere Befund.
    finalGebundenUsd = gebundenUsd;
    if (aufrufe > 0) {
      try {
        const gelesen = Number(await deps.laufKostenUsd(runId));
        if (!Number.isFinite(gelesen) || gelesen < 0) throw new Error("unbrauchbar");
        finalGebundenUsd = gelesen;
        if (!abbruch && gelesen > Number(E.maxUsd)) {
          abbruch = { grund: "verstehen-kosten-invariante-verletzt", gebundenUsd: gelesen };
        }
      } catch (_) {
        if (!abbruch) abbruch = { grund: "verstehen-kostenleser-fehler" };
      }
    }

    // ZWEI GETRENNTE WAHRHEITEN: „vollstaendig abgearbeitet" (kein globaler Abbruch) ist NICHT
    // „fachlich bestanden". `ok`/`fachlichBestanden` bleiben bei jedem unknown UND bei jedem
    // Abbruch falsch.
    // QUITTUNGSSTATUS — VORRANG des GLOBALEN Abbruchs: ein Klasse-B-Abbruch bestimmt den Status
    // IMMER, auch wenn zuvor ein lokaler `skipped-invalid` (unknown) auftrat. Sonst verschwaende
    // z. B. ein spaeterer `verstehen-cluster-error` hinter dem lokalen `unbekannt`.
    //   * Abbruch `verstehen-ausgang-unbekannt` ⇒ `unbekannt` (dokumentierte Semantik: ein
    //     unbekannter Modellausgang beendet den Lauf),
    //   * jeder andere Abbruch ⇒ `gestoppt` (z. B. `verstehen-cluster-error`, Deckel),
    //   * kein Abbruch, aber lokales unknown ⇒ `unbekannt` (vollstaendig abgearbeitet, fachlich rot),
    //   * sonst ⇒ `abgeschlossen`.
    const bilanz = bilanzVon(ergebnisse);
    const hatUnbekannt = bilanz.unbekannt > 0;
    const fachlichBestanden = !abbruch && !hatUnbekannt;
    const status = abbruch
      ? (abbruch.grund === "verstehen-ausgang-unbekannt" ? "unbekannt" : "gestoppt")
      : (hatUnbekannt ? "unbekannt" : "abgeschlossen");
    await schliesseQuittung(status, { fachlichBestanden });
    bericht.ausgeloest = true;
    bericht.modellaufrufe = aufrufe;
    bericht.laufkostenUsd = finalGebundenUsd;
    bericht.bilanz = bilanz;
    bericht.abbruchGrund = abbruch ? abbruch.grund : null;
    bericht.quittung = quittiert ? schluessel : null;
    bericht.quittungStatus = quittiert ? status : null;
    bericht.ergebnisse = ergebnisse;
    // Der lokale (nicht abbrechende) Fehleranteil bleibt als eigener Wert sichtbar.
    bericht.lokaleUnbekannte = lokaleUnbekannte;
    bericht.vollstaendigVerarbeitet = !abbruch;
    bericht.fachlichBestanden = fachlichBestanden;
    bericht.ok = fachlichBestanden;
    return bericht;
  } catch (error) {
    // Auch ein Abbruch darf nicht still wiederholbar werden: die Quittung wird terminal
    // geschlossen, wenn sie beansprucht wurde.
    const geschlossen = await schliesseQuittung("gestoppt", { grund: grundVon(error), fachlichBestanden: false });
    return {
      ...bericht, ok: false, ausgeloest: locked === true,
      modellaufrufe: aufrufe, bilanz: bilanzVon(ergebnisse), ergebnisse,
      grund: grundVon(error), abbruchGrund: grundVon(error),
      lokaleUnbekannte, vollstaendigVerarbeitet: false, fachlichBestanden: false,
      quittung: geschlossen ? schluessel : null,
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
  RUNTIME_COMMIT_MUSTER,
  runtimeCommitVon,
  quittungsschluesselVon,
  idsHash,
  groessenVerteilung,
  klassifiziereCluster,
  ordneCluster,
  pruefeUndPlane,
  fuehreAus
};
