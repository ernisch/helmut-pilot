"use strict";

// Helmut — GEZIELTER VERTRAGSTEST: der kleinste sichere Weg zu einem NEUEN 169er Versuch
// nach dem terminal unbekannten ersten Lauf (Run 35829992528, Quittung verstehen169-20260922-a).
// Offline, Attrappen — kein Netz, keine Datenbank, KEIN echter Modellaufruf, kein
// Production-Schreibzugriff. Kanonischer Lauf:
//   node scripts/lokal.js -- node scripts/verstehen-169-neuversuch-test.js
// =============================================================================================
// WAS HIER BEWIESEN WIRD (der Problemvorgang des gescheiterten Laufs als Fixture):
//   §1  Quittungskennung: ohne ausdrueckliche Kennung gilt der ALTE Schluessel (alter Auftrag
//       bleibt blockiert); der alte Schluessel selbst und Fremdformate sind fail closed; eine
//       neue Kennung ist eindeutig getrennt.
//   §2  Der alte Auftrag bleibt durch seine Quittung blockiert — ein Lauf mit neuem Schluessel
//       beansprucht eine EIGENE Zeile und laesst die alte unveraendert (kein automatischer Retry).
//   §3  Problemvorgang `vg-abschaffung-20260911-7420f6` (KO pending/failed, zwei verknuepfte
//       Rohdokumente, CAS unbekannt): der Runner klassifiziert ihn als `failed` (KEIN Kandidat),
//       meldet ihn im Lauf ehrlich als `skipped-failed` OHNE Modellaufruf, bricht NICHT ab und
//       verarbeitet die uebrigen Cluster — kein stilles Ueberspringen, kein "erledigt".
//   §4  Keine Doppelverknuepfung: die zwei Bestandsdokumente bleiben genau zwei.
//   §5  Planmodus: 0 Modellaufrufe, 0 Writes, keine Quittung.
//   §6  CAS `unbekannt` bleibt OHNE ausdrueckliche Wiederaufnahme gesperrt: auch mit dem
//       Freigabemarker im Motor blockiert die Reservierung — ohne kanonisches `erneut` gibt es
//       KEINEN zweiten bezahlten Aufruf.
//   §7  Kanonische Wiederaufnahme (CAS `offen` + `erneut-freigegeben` nach `aufloesen(...,'erneut')`):
//       der Vorgang wird verstanden — GENAU EIN neuer Modellaufruf; eine ungueltige synthetische
//       Antwort endet sichtbar mit den PR#522-Diagnosefeldern (reason=validierung-fehlgeschlagen,
//       documents=Clustergroesse, sichere Fehlercodes), kein stilles Verschwinden.
//   §8  Grenzen unveraendert: 169/122/113/0,80 USD/35 min, 4-USD-Tagesriegel bleibt groesser,
//       Aufruftyp `understanding-rueckstand`, Quittungskonstante unveraendert.

const A = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const V = require(path.join(ROOT, "lib/helmut/verstehen-einmalig"));
const vertragModul = require(path.join(ROOT, "lib/helmut/verstehen-vertrag"));
const understanding = require(path.join(ROOT, "lib/helmut/understanding"));
const { contentHash, canonicalizeUrl } = require(path.join(ROOT, "lib/helmut/dedup"));
const { clusterRawDocuments } = require(path.join(ROOT, "lib/helmut/vorgang-identity"));
const rueckstand = require(path.join(ROOT, "lib/helmut/verstehen-rueckstand"));

let bestanden = 0;
const fehlgeschlagen = [];
function pruefe(name, fn) {
  try { fn(); bestanden += 1; console.log("  PASS  " + name); }
  catch (e) { fehlgeschlagen.push(name); console.log("  FAIL  " + name + " — " + (e && e.message)); }
}
function pruefeAsync(name, fn) {
  return fn().then(() => { bestanden += 1; console.log("  PASS  " + name); },
    (e) => { fehlgeschlagen.push(name); console.log("  FAIL  " + name + " — " + (e && e.message)); });
}
function abschnitt(t) { console.log("\n== " + t + " =="); }

// ── Fixture des Problemfalls (169er-Befund Run 35829992528, Doku §16) ──────────────────────
// VORGANG: echte Kennung und echte CAS-/KO-Zustaende des Production-Befunds. DOKUMENTE: die
// Fixture bildet die Mechanik mit SYNTHETISCHEN Kennungen nach (die echte neue Kennung
// `rd-f9a5ff81d493…` aus belege/verstehen-169-ids.json entstand aus der echten Anbieter-URL,
// die hier NICHT erfunden wird; das Alt-Dokument liegt nur in Production). Keine historische
// Modellantwort wird nachgestellt — alle Antworten sind bewusst synthetische Attrappen.
const VORGANG = "vg-abschaffung-20260911-7420f6";
const KO_ID = "ko-" + VORGANG;
// Gemeinsamer Kernanker „Abschaffung der Rente mit 63" — genau so bildet die echte
// Produktions-Clusterung aus den beiden Rohdokumenten EINEN Cluster (Doku §16: ein neues
// Dokument wurde dem bestehenden Vorgang zugeordnet). Gleiches Datumsfenster wie die
// bestehende Suite (die Beweisfamilie traegt das Clustergewicht); die Fixture bildet die
// echte Konstellation „Alt-Dokument + neu eingetroffenes Dokument" nach.
const PROBLEM_TITEL = "Abschaffung der Rente mit 63";

function fixtureDokument(slug, titel, iso) {
  const url = "https://example.org/" + slug;
  const hash = contentHash({ url, publishedAt: iso, title: titel });
  return {
    id: "rd-" + hash, content_hash: hash, canonical_url: canonicalizeUrl(url), url,
    title: titel, summary: null, source_name: null, source_id: null, source_type: null,
    confidence: "high", link_type: "direct", published_at: iso, retrieved_at: iso,
    document_type: null, wahlperiode: null
  };
}

const DOK_NEU_ROW = fixtureDokument("problem-neu", PROBLEM_TITEL, "2026-09-22T08:00:00.000Z");
const DOK_ALT_ROW = fixtureDokument("problem-alt", PROBLEM_TITEL, "2026-09-22T08:00:00.000Z");
// Ein UNBETEILIGTER zweiter Cluster (eigenes Kernwort), der NACH dem Problemfall kommen muss.
const DOK_GESUND_ROW = fixtureDokument("gesund-1", "Kupferschmiede", "2026-09-22T08:00:00.000Z");

const ANALYSE = {
  headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
  display_title: "Abschaffung geprueft", display_summary: "s",
  why_relevant: "w", recommendation: "r", display_category: "Sozialpolitik"
};

// ── CAS-Attrappe (bildet 20260814180000 nach, angelehnt an verstehen-wiederaufnahme-test) ──
function baueCasSpeicher({ start = {} } = {}) {
  const zeilen = new Map();
  const hole = (id) => {
    if (!zeilen.has(id)) {
      zeilen.set(id, {
        besitzer: null, fencing: 0, leaseBis: null, zustand: "offen",
        eingabeHash: null, ergebnisHash: null, versuche: 0, kiAufrufe: 0, letzterGrund: null,
        ...(start[id] || {})
      });
    }
    return zeilen.get(id);
  };
  for (const id of Object.keys(start)) hole(id);
  return {
    zeilen,
    async verstehenReserviere({ vorgangId, eingabeHash, besitzer, ttlMs }) {
      const r = hole(vorgangId);
      if (r.zustand === "unbekannt") return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: "unbekannt", grund: "ausgang-unbekannt" };
      if (r.zustand === "aufgegeben") return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: "aufgegeben", grund: "aufgegeben" };
      if (r.zustand === "fertig" && r.eingabeHash === eingabeHash) return { verfuegbar: true, erlaubt: false, fencing: r.fencing, zustand: "fertig", grund: "bereits-fertig" };
      r.fencing += 1; r.besitzer = besitzer; r.leaseBis = Date.now() + ttlMs;
      r.zustand = "reserviert"; r.eingabeHash = eingabeHash; r.versuche += 1; r.letzterGrund = null;
      return { verfuegbar: true, erlaubt: true, fencing: r.fencing, zustand: "reserviert", grund: "uebernommen" };
    },
    async verstehenModellstart({ vorgangId, besitzer, fencing, ttlMs }) {
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "reserviert" || !(r.leaseBis > Date.now())) {
        return { verfuegbar: true, ok: false };
      }
      r.zustand = "modell-laeuft"; r.kiAufrufe += 1; r.leaseBis = Date.now() + ttlMs;
      return { verfuegbar: true, ok: true };
    },
    async verstehenSchreibrecht({ vorgangId, besitzer, fencing, ttlMs }) {
      const r = hole(vorgangId);
      if (r.besitzer !== besitzer || r.fencing !== fencing || r.zustand !== "modell-laeuft" || !(r.leaseBis > Date.now())) {
        return { verfuegbar: true, ok: false };
      }
      r.leaseBis = Date.now() + ttlMs;
      return { verfuegbar: true, ok: true };
    },
    async verstehenSpeichere({ vorgangId, besitzer, fencing, ko, ergebnisHash }) {
      const r = hole(vorgangId);
      if (r.zustand !== "modell-laeuft" || r.besitzer !== besitzer || r.fencing !== fencing) {
        return { verfuegbar: true, ergebnis: "fencing-veraltet" };
      }
      r.zustand = "fertig"; r.ergebnisHash = ergebnisHash; r.besitzer = null; r.leaseBis = null; r.letzterGrund = null;
      return { verfuegbar: true, ergebnis: "gespeichert" };
    },
    async verstehenAusgangUnbekannt({ vorgangId, grund }) {
      const r = hole(vorgangId);
      if (r.zustand !== "modell-laeuft") return { verfuegbar: true, blockiert: false, ergebnis: "zustand-" + r.zustand };
      r.zustand = "unbekannt"; r.besitzer = null; r.leaseBis = null; r.letzterGrund = String(grund || "").slice(0, 200);
      return { verfuegbar: true, blockiert: true, ergebnis: "unbekannt" };
    },
    async verstehenAbschluss() { return { verfuegbar: true, ok: true }; },
    async verstehenFreigabe() { return { ok: true }; },
    async verstehenFreigabeOhneAufruf() { return { ok: true }; },
    async verstehenVormerkungLese() { return { verfuegbar: true, eintraege: {} }; },
    async verstehenVormerkungErhoehe() { return { verfuegbar: true, fehlversuche: 1 }; },
    async verstehenVormerkungLoese() { return { verfuegbar: true, ok: true }; }
  };
}

// ── Welt fuer den Runner (angelehnt an verstehen-einmalig-test) ─────────────────────────────
function weltBauen({ dokumente = [], kos = [], links = {} } = {}) {
  const welt = {
    dokumente, kos: new Map((kos || []).map((k) => [k.vorgang_id, k])), links: links || {},
    aufrufe: [], schritt: [], fencing: 0, besitzer: 0, gesperrt: false,
    canSpend: 0, reservierungUsd: 0.212, laufkostenUsd: 0, kostenlesungen: 0,
    quittungen: new Map(), quittungszugriffe: []
  };
  const casSpeicher = baueCasSpeicher({});
  const deps = {
    enabled: () => true,
    aiEnabled: () => true,
    acquireLock: async () => { if (welt.gesperrt) return { granted: false }; welt.gesperrt = true; return { granted: true }; },
    releaseLock: async () => { welt.gesperrt = false; },
    clusterWache: null,
    verstehenVertrag: () => vertragModul.baueVertrag({
      besitzer: "test-" + (welt.besitzer += 1),
      deps: { erzwingeAktiv: true, speicher: casSpeicher }
    }),
    getExisting: async (id) => welt.kos.get(id) || null,
    getExistingStreng: async (id) => welt.kos.get(id) || null,
    findVorgangCandidates: async (prefixes, limit) => [...welt.kos.values()]
      .filter((ko) => (prefixes || []).some((p) => String(ko.vorgang_id).startsWith(p))).slice(0, limit),
    listVorgangDocuments: async (koId) => welt.links[koId] || [],
    listPending: async () => [],
    listWiederaufnahmen: async () => ({ verfuegbar: false, grund: "supabase-nicht-konfiguriert", vorgaenge: [] }),
    savePending: async () => ({ saved: true }),
    canSpend: async () => { welt.canSpend += 1; return { allowed: true, used: 10, limit: 2416, remaining: 2406 }; },
    requestUnderstanding: async (prompt) => {
      welt.aufrufe.push(prompt); welt.schritt.push("requestUnderstanding");
      welt.laufkostenUsd += 0.005;
      return ANALYSE;
    },
    save: async (ko) => { welt.gespeichert = welt.gespeichert || []; welt.gespeichert.push(ko); return { saved: true }; },
    saveSources: async (koId, docs) => {
      const vorhanden = welt.links[koId] || [];
      const bekannt = new Set(vorhanden.map((d) => d && d.id));
      welt.links[koId] = [...vorhanden, ...docs.filter((d) => d && !bekannt.has(d.id))];
      return { saved: docs.length };
    },
    markFailed: async () => ({ saved: true }),
    readUpdateRetries: async () => ({}),
    writeUpdateRetries: async () => ({ saved: true }),
    modelName: () => "gpt-5-mini",
    logSkip: () => {},
    gateMode: () => "off",
    recordGateShadow: () => {}, recordGateShadowRows: async () => ({}),
    recordGateParkung: async () => ({}), markGateGeparkt: async () => ({}),
    releaseGateGeparkt: async () => ({}), listGateGeparkt: async () => [], countGateGeparkt: async () => 0,
    ladeDokumente: async (ids) => welt.dokumente.filter((d) => ids.includes(d.id)),
    leseTageszaehler: async () => ({ ok: true, used: 10, limit: 2416, remaining: 2406 }),
    // Quittungs-Attrappe SCHLUESSELBEWUSST: je Kennung eine eigene Zeile — genau die
    // Semantik der echten Einmalquittung (CAS ueber die Zeilenkennung).
    claimRun: async (data) => {
      welt.quittungszugriffe.push({ art: "claim", schluessel: data.quittungsschluessel });
      if (welt.quittungen.has(data.quittungsschluessel)) return false;
      welt.quittungen.set(data.quittungsschluessel, { status: "laeuft", data });
      return true;
    },
    finishRun: async (data) => {
      welt.quittungszugriffe.push({ art: "finish", schluessel: data.quittungsschluessel });
      welt.quittungen.set(data.quittungsschluessel, { status: data.status, data });
      return true;
    },
    reservierungHoeheUsd: () => welt.reservierungUsd,
    laufKostenUsd: async () => { welt.kostenlesungen += 1; return welt.laufkostenUsd; }
  };
  return { welt, deps, casSpeicher };
}

function testbindung(dokumente) {
  const rows = dokumente.map((d) => ({ ...d }));
  const clusters = clusterRawDocuments(rows);
  return {
    pruefmodus: true, commit: "test-commit", dokumente: dokumente.length,
    idHash: V.idsHash(dokumente.map((d) => d.id)), cluster: clusters.length,
    clusterGroessen: V.groessenVerteilung(clusters), maxModellaufrufe: 99,
    maxUsd: 100, maxMs: 35 * 60 * 1000
  };
}

const NEUER_SCHLUESSEL = "verstehen169-20260923-test";

async function main() {
  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§1  Die Kennung eines neuen Versuchs wird ausdruecklich uebergeben und streng geprueft");
  {
    pruefe("ohne Kennung ist der ALTE Auftrag — Standard liefert KEINEN konkreten Schluessel",
      () => { const q = V.quittungsschluesselVon(""); A.equal(q.ok, true); A.equal(q.schluessel, null); A.equal(q.standard, true); });
    pruefe("die ALTE Kennung ist fail closed — kein neuer Vertrag mit derselben Quittung",
      () => { const q = V.quittungsschluesselVon("verstehen169-20260922-a"); A.equal(q.ok, false); A.equal(q.grund, "verstehen-quittung-identisch"); });
    pruefe("Fremdformat ist fail closed",
      () => { const q = V.quittungsschluesselVon("fremd-123"); A.equal(q.ok, false); A.equal(q.grund, "verstehen-quittung-ungueltig"); });
    pruefe("eine EINSTELLIGE neue Kennung wird angenommen (wie die alte Form verstehen169-20260922-a)",
      () => { const q = V.quittungsschluesselVon("verstehen169-20260923-b"); A.equal(q.ok, true); A.equal(q.schluessel, "verstehen169-20260923-b"); A.equal(q.standard, false); A.notEqual(q.schluessel, V.QUITTUNG); });
    pruefe("eine mehrstellige gueltige neue Kennung wird angenommen und ist eindeutig getrennt",
      () => { const q = V.quittungsschluesselVon(NEUER_SCHLUESSEL); A.equal(q.ok, true); A.equal(q.schluessel, NEUER_SCHLUESSEL); A.equal(q.standard, false); A.notEqual(q.schluessel, V.QUITTUNG); });
  }
  await pruefeAsync("der Runner stoppt fail closed VOR jedem Zugriff bei identischer Kennung", async () => {
    const docs = [DOK_GESUND_ROW];
    const w = weltBauen({ dokumente: docs });
    const lauf = await V.fuehreAus({
      ids: docs.map((d) => d.id), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs), runId: "identisch-1", now: () => new Date(),
      quittungsschluessel: V.QUITTUNG
    });
    A.equal(lauf.ok, false);
    A.equal(lauf.grund, "verstehen-quittung-identisch");
    A.equal(lauf.modellaufrufe, 0);
    A.equal(w.welt.quittungszugriffe.length, 0, "keine Quittungsberuehrung");
    A.equal(w.welt.schritt.length, 0, "kein Verarbeitungsschritt");
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§2  Alte Quittung blockiert den alten Auftrag weiterhin — der neue Auftrag ist getrennt");
  await pruefeAsync("leer (Standard) laeuft ueber den ALTEN Auftrag und stoppt beim zweiten Mal verstehen-bereits-verwendet, 0 Aufrufe", async () => {
    const docs = [DOK_GESUND_ROW];
    const w = weltBauen({ dokumente: docs });
    const bindung = testbindung(docs);
    // Der Bedienweg reicht bei leerem HELMUT_VERSTEHEN_169_QUITTUNG `quittung.schluessel`
    // (= null nach quittungsschluesselVon) durch — genau diesen Wert simuliert dieser Aufruf.
    const erst = await V.fuehreAus({
      ids: docs.map((d) => d.id), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: bindung, runId: "alt-1", now: () => new Date(), quittungsschluessel: null
    });
    A.equal(erst.ok, true, JSON.stringify(erst));
    A.equal(erst.quittung, V.QUITTUNG, "leer nutzt die ALTE Quittung");
    A.notEqual(erst.grund, "verstehen-quittung-identisch", "kein verstehen-quittung-identisch bei leer");
    const zweit = await V.fuehreAus({
      ids: docs.map((d) => d.id), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: bindung, runId: "alt-2", now: () => new Date(), quittungsschluessel: null
    });
    A.equal(zweit.ok, false);
    A.equal(zweit.grund, "verstehen-bereits-verwendet");
    A.equal(zweit.modellaufrufe, 0);
    A.equal(zweit.automatischeWiederholung, false);
  });
  await pruefeAsync("ein Lauf mit NEUER Kennung beansprucht eine eigene Zeile und laeuft", async () => {
    const docs = [DOK_GESUND_ROW];
    const w = weltBauen({ dokumente: docs });
    const bindung = testbindung(docs);
    const neu = await V.fuehreAus({
      ids: docs.map((d) => d.id), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: bindung, runId: "neu-1", now: () => new Date(),
      quittungsschluessel: NEUER_SCHLUESSEL
    });
    A.equal(neu.ok, true, JSON.stringify(neu));
    A.equal(neu.quittung, NEUER_SCHLUESSEL);
    A.equal(neu.modellaufrufe, 1);
    A.equal(w.welt.quittungen.has(V.QUITTUNG), false, "die alte Zeile bleibt unberuehrt");
    A.equal(w.welt.quittungen.has(NEUER_SCHLUESSEL), true);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§3/§4  Problemvorgang: ehrlich skipped-failed, kein Abbruch, keine Doppelverknuepfung");
  const docs = [DOK_ALT_ROW, DOK_NEU_ROW, DOK_GESUND_ROW];
  const kos = [{ id: KO_ID, vorgang_id: VORGANG, status: "pending", understanding_status: "failed",
    updated_at: "2026-09-22T07:00:00Z" }];
  const links = { [KO_ID]: [DOK_ALT_ROW, DOK_NEU_ROW] };
  const bindung = testbindung(docs);

  await pruefeAsync("Planmodus: 0 Modellaufrufe, 0 Writes, failed sichtbar, 1 Kandidat", async () => {
    const w = weltBauen({ dokumente: docs, kos, links });
    const plan = await V.pruefeUndPlane({ ids: docs.map((d) => d.id), deps: w.deps, commit: "test-commit", erwartet: bindung });
    A.equal(plan.ok, true, JSON.stringify(plan));
    const einteilung = plan.plan.einteilungen.find((e) => e.vorgangId === VORGANG);
    A.equal(einteilung.art, "failed");
    A.equal(einteilung.kandidat, false);
    A.equal(plan.plan.arten.failed, 1);
    A.equal(plan.plan.kandidaten, 1, "nur der gesunde Cluster ist Kandidat");
    A.equal(w.welt.schritt.length, 0);
    A.equal(w.welt.aufrufe.length, 0);
    A.equal(w.welt.quittungszugriffe.length, 0);
  });

  let lauf = null;
  await pruefeAsync("scharfer Lauf: Problemvorgang skipped-failed OHNE Aufruf, Lauf bricht NICHT ab", async () => {
    const w = weltBauen({ dokumente: docs, kos, links });
    lauf = await V.fuehreAus({
      ids: docs.map((d) => d.id), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: bindung, runId: "problem-1", now: () => new Date(),
      quittungsschluessel: NEUER_SCHLUESSEL
    });
    A.equal(lauf.ok, true, JSON.stringify(lauf));
    A.equal(lauf.abbruchGrund, null);
    A.equal(lauf.quittung, NEUER_SCHLUESSEL);
    A.equal(lauf.quittungStatus, "abgeschlossen");
    const reihenfolge = lauf.ergebnisse.map((e) => e.vorgangId);
    A.equal(reihenfolge[0], VORGANG, "Problemvorgang deterministisch zuerst (wie im Production-Lauf)");
    const problem = lauf.ergebnisse[0];
    A.equal(problem.status, "skipped-failed");
    A.equal(problem.dokumente, 2, "Dokumentzahl = Clustergroesse");
    A.equal(problem.ausgang, null, "kein unbekannter Ausgang — kein Modellaufruf");
    const gesund = lauf.ergebnisse[1];
    A.equal(gesund.status, "saved", "der naechste Cluster wird normal verstanden");
    A.equal(lauf.modellaufrufe, 1, "genau EIN Aufruf fuer den gesunden Cluster");
    A.equal(lauf.bilanz.arten["skipped-failed"], 1, "sichtbar in der Bilanz — kein stilles Ueberspringen");
    A.equal(w.welt.links[KO_ID].length, 2, "keine Doppelverknuepfung: genau die zwei Bestandsdokumente");
    // Der gesunde Cluster hat eigene Links bekommen; der Problemfall blieb unveraendert.
    A.equal(w.welt.links[KO_ID].map((d) => d.id).sort().join(","), [DOK_ALT_ROW.id, DOK_NEU_ROW.id].sort().join(","));
  });
  await pruefeAsync("kein automatischer Retry: derselbe Lauf noch einmal mit derselben neuen Kennung ist verbraucht", async () => {
    const w = weltBauen({ dokumente: docs, kos, links });
    const nochmal = await V.fuehreAus({
      ids: docs.map((d) => d.id), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: bindung, runId: "problem-1", now: () => new Date(),
      quittungsschluessel: NEUER_SCHLUESSEL
    });
    A.equal(nochmal.ok, true, JSON.stringify(nochmal));
    A.equal(nochmal.quittung, NEUER_SCHLUESSEL);
    A.equal(w.welt.aufrufe.length, 1, "derselbe Auftrag lief genau einmal");
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§6/§7  CAS unbekannt bleibt gesperrt — kanonische Wiederaufnahme funktioniert offline");
  const clusterFixture = () => clusterRawDocuments([{ ...DOK_ALT_ROW }, { ...DOK_NEU_ROW }])[0];

  await pruefeAsync("Motor ohne Freigabe: failed-Vorgang bleibt skipped-failed, 0 Aufrufe, kein CAS-Zugriff", async () => {
    const p = { kiAufrufe: 0, reservierungen: 0 };
    const speicher = baueCasSpeicher({
      start: { [VORGANG]: { zustand: "unbekannt", versuche: 1, kiAufrufe: 1, fencing: 1, letzterGrund: "validierung-fehlgeschlagen" } }
    });
    const deps = {
      getExisting: async (id) => (id === VORGANG ? { ...kos[0] } : null),
      getExistingStreng: async (id) => (id === VORGANG ? { ...kos[0] } : null),
      findVorgangCandidates: async () => [{ ...kos[0] }],
      listVorgangDocuments: async () => links[KO_ID] || [],
      saveSources: async () => {},
      markFailed: async () => {},
      modelName: () => "gpt-5-mini",
      logSkip: () => {},
      gateMode: () => "off",
      canSpend: async () => ({ allowed: true }),
      requestUnderstanding: async () => { p.kiAufrufe += 1; return ANALYSE; },
      verstehenVertrag: () => vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } })
    };
    const r = await understanding.understandOneCluster(clusterFixture(), deps, {});
    A.equal(r.status, "skipped-failed");
    A.equal(p.kiAufrufe, 0);
    A.equal(speicher.zeilen.get(VORGANG).zustand, "unbekannt", "CAS-Zeile unangetastet");
    A.equal(speicher.zeilen.get(VORGANG).versuche, 1);
  });

  await pruefeAsync("auch MIT Freigabemarker blockiert CAS unbekannt: ohne kanonisches erneut KEIN zweiter Aufruf", async () => {
    const p = { kiAufrufe: 0 };
    const speicher = baueCasSpeicher({
      start: { [VORGANG]: { zustand: "unbekannt", versuche: 1, kiAufrufe: 1, fencing: 1, letzterGrund: "validierung-fehlgeschlagen" } }
    });
    const deps = {
      getExisting: async (id) => (id === VORGANG ? { ...kos[0] } : null),
      getExistingStreng: async (id) => (id === VORGANG ? { ...kos[0] } : null),
      findVorgangCandidates: async () => [{ ...kos[0] }],
      listVorgangDocuments: async () => links[KO_ID] || [],
      saveSources: async () => {},
      markFailed: async () => {},
      modelName: () => "gpt-5-mini",
      logSkip: () => {},
      gateMode: () => "off",
      canSpend: async () => ({ allowed: true }),
      requestUnderstanding: async () => { p.kiAufrufe += 1; return ANALYSE; },
      verstehenVertrag: () => vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } })
    };
    const r = await understanding.understandOneCluster(clusterFixture(), deps, { wiederaufnahmeFreigabe: true });
    A.equal(r.status, "skipped-ausgang-unbekannt", JSON.stringify(r));
    A.equal(p.kiAufrufe, 0, "die Reservierung wurde abgelehnt — kein zweiter bezahlter Aufruf");
    A.equal(speicher.zeilen.get(VORGANG).zustand, "unbekannt");
  });

  await pruefeAsync("kanonisches erneut (offen + erneut-freigegeben) + Wiederaufnahme: GENAU EIN neuer Aufruf, Diagnosewahrheit erhalten", async () => {
    const p = { kiAufrufe: 0 };
    // Der Zustand NACH `helmut_verstehen_ausgang_aufloesen('…','erneut')`: zustand=offen,
    // letzter_grund=erneut-freigegeben, Besitzer/Lease NULL, Zaehler unveraendert 1/1.
    const speicher = baueCasSpeicher({
      start: { [VORGANG]: { zustand: "offen", versuche: 1, kiAufrufe: 1, fencing: 1, letzterGrund: "erneut-freigegeben" } }
    });
    const deps = {
      getExisting: async (id) => (id === VORGANG ? { ...kos[0] } : null),
      getExistingStreng: async (id) => (id === VORGANG ? { ...kos[0] } : null),
      findVorgangCandidates: async () => [{ ...kos[0] }],
      listVorgangDocuments: async () => links[KO_ID] || [],
      saveSources: async () => {},
      markFailed: async () => {},
      modelName: () => "gpt-5-mini",
      logSkip: () => {},
      gateMode: () => "off",
      canSpend: async () => ({ allowed: true }),
      // BEWUSST SYNTHETISCHE ungueltige Antwort (keine historische Modellantwort wird
      // nachgestellt): beweist, dass die neuen Diagnosefelder den Fehler sichtbar machen.
      requestUnderstanding: async () => {
        p.kiAufrufe += 1;
        return { ...ANALYSE, ausschuesse: ["NichtBelegt_ausschuesse"] };
      },
      verstehenVertrag: () => vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } })
    };
    const r = await understanding.understandOneCluster(clusterFixture(), deps, { wiederaufnahmeFreigabe: true });
    A.equal(p.kiAufrufe, 1, "genau EIN neuer Modellaufruf");
    A.equal(r.status, "skipped-invalid", JSON.stringify(r));
    A.equal(r.reason, "validierung-fehlgeschlagen", "PR#522: Fehlerklasse des Modellpfads");
    A.equal(r.documents, 2, "PR#522: echte Clustergroesse");
    A.ok(Array.isArray(r.errors) && r.errors.includes("quellenbeleg-ausschuesse"), "PR#522: sichere Codes sichtbar");
    A.equal(r.ausgang, "unbekannt", "nach Modellstart ohne belegtes Ergebnis: ehrlich unbekannt");
    const zeile = speicher.zeilen.get(VORGANG);
    A.equal(zeile.zustand, "unbekannt");
    A.equal(zeile.letzterGrund, "validierung-fehlgeschlagen", "CAS traegt die Fehlerklasse (wie Production)");
    A.equal(zeile.kiAufrufe, 2, "Zaehler laeuft weiter (1 alter + 1 neuer Aufruf) — kein Reset");
  });

  await pruefeAsync("mit GUELTIGER synthetischer Antwort wird die Wiederaufnahme gespeichert — CAS fertig", async () => {
    const p = { kiAufrufe: 0 };
    const speicher = baueCasSpeicher({
      start: { [VORGANG]: { zustand: "offen", versuche: 1, kiAufrufe: 1, fencing: 1, letzterGrund: "erneut-freigegeben" } }
    });
    const deps = {
      getExisting: async (id) => (id === VORGANG ? { ...kos[0] } : null),
      getExistingStreng: async (id) => (id === VORGANG ? { ...kos[0] } : null),
      findVorgangCandidates: async () => [{ ...kos[0] }],
      listVorgangDocuments: async () => links[KO_ID] || [],
      saveSources: async () => {},
      save: async () => ({ saved: true }),
      markFailed: async () => {},
      modelName: () => "gpt-5-mini",
      logSkip: () => {},
      gateMode: () => "off",
      canSpend: async () => ({ allowed: true }),
      requestUnderstanding: async () => { p.kiAufrufe += 1; return { ...ANALYSE }; },
      verstehenVertrag: () => vertragModul.baueVertrag({ deps: { erzwingeAktiv: true, speicher } })
    };
    const r = await understanding.understandOneCluster(clusterFixture(), deps, { wiederaufnahmeFreigabe: true });
    A.equal(p.kiAufrufe, 1);
    A.equal(r.status, "saved", JSON.stringify(r));
    A.equal(speicher.zeilen.get(VORGANG).zustand, "fertig");
  });

  await pruefeAsync("der kanonische Listenweg liest AUSSCHLIESSLICH offen + erneut-freigegeben", async () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
    A.ok(/zustand=eq\.offen&letzter_grund=eq\.erneut-freigegeben/.test(src),
      "storage filtert serverseitig eng (kein pauschales Wiederaufarbeiten)");
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("§8  Grenzen unveraendert");
  {
    pruefe("169/122/113/0,80 USD/35 min woertlich unveraendert", () => {
      A.equal(V.PINNED.commit, "ea84f26ccc380e22961335926e2d4e585cee2308");
      A.equal(V.PINNED.dokumente, 169);
      A.equal(V.PINNED.idHash, "5f3878409cc9dbe742a3c9b465e54fff53b3e7622065f90c04915eb01ac2aed9");
      A.equal(V.PINNED.cluster, 122);
      A.equal(V.PINNED.maxModellaufrufe, 113);
      A.equal(V.PINNED.maxUsd, 0.8);
      A.equal(V.PINNED.maxMs, 35 * 60 * 1000);
    });
    pruefe("4-USD-Tagesriegel bleibt groesser als der Laufdeckel; Aufruftyp unveraendert", () => {
      A.ok(V.PINNED.maxUsd < 4);
      A.equal(V.CALLTYPE, "understanding-rueckstand");
      A.equal(V.CALLTYPE, rueckstand.RUECKSTAND_CALLTYPE);
    });
    pruefe("die ALTE Quittungskonstante ist unveraendert", () => {
      A.equal(V.QUITTUNG, "verstehen169-20260922-a");
    });
  }

  console.log(`\nverstehen-169-neuversuch-test: ${bestanden} von ${bestanden + fehlgeschlagen.length} Pruefungen gruen.`);
  if (fehlgeschlagen.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
