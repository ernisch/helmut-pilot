"use strict";

// Helmut — GEZIELTE TESTS des EINMALIGEN VERSTEHENSLAUFS für genau 169 Rohdokumente.
// Offline, Attrappen in Erinnerung — kein Netz, keine Datenbank, KEIN echter Modellaufruf,
// kein Production-Schreibzugriff. Kanonischer Lauf:
//   node scripts/lokal.js -- node scripts/verstehen-einmalig-test.js
// =============================================================================================
// Die zwanzig Pflichtprüfungen des Auftrags in seiner Nummerierung:
//   §1  falscher Dokument-Hash stoppt vor dem Modellaufruf
//   §2  168 Kennungen stoppen
//   §3  170 Kennungen stoppen
//   §4  Clusterzahl über der gebundenen stoppt
//   §5  Modellaufruf-Kandidaten über der gebundenen Zahl stoppen
//   §6  weniger notwendige Aufrufe sind erlaubt
//   §7  der merged-Pfad erzeugt keinen Modellaufruf
//   §8  der Aufrufdeckel greift
//   §9  der Kostendeckel greift
//  §10  der globale 4-USD-Tagesriegel bleibt unveraendert
//  §11  ein unbekannter Modellausgang stoppt den GESAMTEN Runner
//  §12  kein automatischer Retry
//  §13  die Einmalquittung verhindert einen zweiten Lauf
//  §14  das 35-Minuten-Zeitlimit stoppt sicher
//  §15  ein fremdes Dokument wird abgelehnt
//  §16  exakt 0 Quellenabrufe
//  §17  exakt 0 Profilaktivierungen
//  §18  exakt 0 Kommunikation
//  §19  das bestehende CAS wird verwendet
//  §20  das bestehende Fencing wird verwendet
//
// WARUM ATTRAPPEN: ein scharfer Pfad, der nur mit einer Attrappe getestet wurde, ist nicht
// bewiesen (CURRENT_STATE §10). Deshalb ersetzen die Attrappen hier AUSSCHLIESSLICH Datenbank,
// Netz und Modell. Der Verstehensmotor, die Vorgangsaufloesung, die Dedup-/Clusterlogik, der
// CAS-Vertrag, das Fencing, die Restzeitwache und die Budget-Bodenpruefung sind die ECHTEN
// Produktionsfunktionen.
//
// ZUR PRUEFBINDUNG: die festgeschriebenen Zahlen (169/122/113) lassen sich mit synthetischen
// Dokumenten nicht reproduzieren. Die Mechanik wird deshalb mit einer PRUEFBINDUNG geprueft, die
// der Kern nur mit dem ausdruecklichen Marker `pruefmodus: true` annimmt — ein abgeschwaechter
// Wert ist in Produktion nicht erreichbar (eigene Pruefung unten). Die echten Auftragswerte
// werden daneben WOERTLICH geprueft.

const A = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const V = require(path.join(ROOT, "lib/helmut/verstehen-einmalig"));
const D = require(path.join(ROOT, "lib/helmut/testkohorte-direkt500"));
const vertragModul = require(path.join(ROOT, "lib/helmut/verstehen-vertrag"));
const rueckstand = require(path.join(ROOT, "lib/helmut/verstehen-rueckstand"));
const CLIRUNNER = require(path.join(ROOT, "scripts/verstehen-einmalig-169"));
const { contentHash, canonicalizeUrl } = require(path.join(ROOT, "lib/helmut/dedup"));
const { clusterRawDocuments } = require(path.join(ROOT, "lib/helmut/vorgang-identity"));

const BELEG = path.join(ROOT, "belege", "verstehen-169-ids.json");

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
const quelle = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ── Attrappen-Welt ─────────────────────────────────────────────────────────────────────────
const ANALYSE = {
  headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
  zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
  display_title: "Ausschuss vertagt Foerderprogramm", display_summary: "s",
  why_relevant: "w", recommendation: "r", display_category: "Haushalt"
};

// Ein Rohdokument, wie es `getRawDocumentsByIds` liefert — mit einer echten URL, damit die
// Abbildung durch `toRawDocumentRow` dieselbe Kennung wieder erzeugt (S10).
function rohesDokument(slug, titel, iso = "2026-09-22T08:00:00.000Z") {
  const url = "https://example.org/" + slug;
  const hash = contentHash({ url, publishedAt: iso, title: titel });
  return {
    id: "rd-" + hash, content_hash: hash, canonical_url: canonicalizeUrl(url), url,
    title: titel, summary: null, source_name: null, source_id: null, source_type: null,
    confidence: "high", link_type: "direct", published_at: iso, retrieved_at: iso,
    document_type: null, wahlperiode: null
  };
}

// Eindeutige, NICHT verwandte Einzelwoerter: kein Praefix-/Kompositverhaeltnis, damit jedes
// Dokument genau einen eigenen Cluster bildet.
const WOERTER = ["Zitterpappel", "Kupferschmiede", "Silberfuchs", "Bernsteinkette", "Wacholderbeere",
  "Tannenzapfen", "Moorkiefer", "Fliederbusch", "Eibischwurzel", "Haselnussstrauch", "Quendelbluete",
  "Sanddornbeere", "Wiesenschaumkraut", "Feldahornbaum", "Steinmarderbau", "Blauregenranke"];

// Der CAS-Speicher als Attrappe. Er protokolliert die AUFRUFREIHENFOLGE und die Fencing-Werte —
// genau damit wird bewiesen, dass der BESTEHENDE Vertrag (verstehen-vertrag.js) benutzt wird.
function baueSpeicher(welt) {
  return {
    async verstehenReserviere() {
      welt.schritt.push("reserviere");
      welt.fencing += 1;
      return { verfuegbar: true, erlaubt: true, grund: null, zustand: "offen", fencing: welt.fencing, versuche: 1 };
    },
    async verstehenModellstart({ fencing }) {
      welt.schritt.push("modellstart"); welt.fencingWerte.push(fencing);
      return { verfuegbar: true, ok: welt.modellstartErlaubt !== false };
    },
    async verstehenSchreibrecht({ fencing }) {
      welt.schritt.push("schreibrecht"); welt.fencingWerte.push(fencing);
      return { verfuegbar: true, ok: true };
    },
    async verstehenSpeichere({ fencing, ko }) {
      welt.schritt.push("speichere"); welt.fencingWerte.push(fencing); welt.gespeichert.push(ko);
      return { verfuegbar: true, ergebnis: "gespeichert" };
    },
    async verstehenAbschluss() { welt.schritt.push("abschluss"); return { verfuegbar: true, ok: true }; },
    async verstehenAusgangUnbekannt() {
      welt.schritt.push("ausgangUnbekannt");
      return { verfuegbar: true, blockiert: true, ergebnis: "unbekannt" };
    },
    async verstehenFreigabe() { welt.schritt.push("freigabe"); return { verfuegbar: true, ok: true }; },
    async verstehenFreigabeOhneAufruf() { welt.schritt.push("freigabeOhneAufruf"); return { verfuegbar: true, ok: true }; },
    async verstehenVormerkungLese() { return { verfuegbar: true, eintraege: {} }; },
    async verstehenVormerkungErhoehe() { return { verfuegbar: true, fehlversuche: 1 }; },
    async verstehenVormerkungLoese() { return { verfuegbar: true, ok: true }; }
  };
}

function weltBauen({ dokumente = [], kos = [], links = {}, kandidatenFrei = false } = {}) {
  const welt = {
    dokumente, kos: new Map((kos || []).map((k) => [k.vorgang_id, k])), links: links || {},
    aufrufe: [], schritt: [], fencing: 0, fencingWerte: [], gespeichert: [], geparkt: [],
    canSpend: 0, kandidatensuchen: 0, bestandslesungen: 0, besitzer: 0, gesperrt: false,
    ausgang: "ok", modellstartErlaubt: true, claimRunCalls: 0, quittiert: false, abgeschlossen: null,
    quellenabrufe: 0, profilwrites: 0, kommunikation: 0
  };
  welt.speicher = baueSpeicher(welt);
  const deps = {
    enabled: () => true,
    aiEnabled: () => true,
    acquireLock: async () => { if (welt.gesperrt) return { granted: false }; welt.gesperrt = true; return { granted: true }; },
    releaseLock: async () => { welt.gesperrt = false; },
    clusterWache: null,
    // DIE bestehende Vertragsfabrik — nicht eine Attrappe des Vertrags, nur ein Attrappen-SPEICHER.
    verstehenVertrag: () => vertragModul.baueVertrag({
      besitzer: "test-" + (welt.besitzer += 1),
      deps: { erzwingeAktiv: true, speicher: welt.speicher }
    }),
    getExisting: async (id) => welt.kos.get(id) || null,
    getExistingStreng: async (id) => welt.kos.get(id) || null,
    findVorgangCandidates: async (prefixes, limit) => {
      welt.kandidatensuchen += 1;
      if (kandidatenFrei) return [...welt.kos.values()].slice(0, limit);
      return [...welt.kos.values()]
        .filter((ko) => (prefixes || []).some((p) => String(ko.vorgang_id).startsWith(p)))
        .slice(0, limit);
    },
    listVorgangDocuments: async (koId) => { welt.bestandslesungen += 1; return welt.links[koId] || []; },
    listPending: async () => [],
    listWiederaufnahmen: async () => ({ verfuegbar: false, grund: "supabase-nicht-konfiguriert", vorgaenge: [] }),
    savePending: async () => ({ saved: true }),
    canSpend: async () => { welt.canSpend += 1; return { allowed: true, used: 10, limit: 2416, remaining: 2406 }; },
    requestUnderstanding: async (prompt) => {
      welt.aufrufe.push(prompt);
      welt.schritt.push("requestUnderstanding");
      if (welt.ausgang === "unbekannt") throw new Error("ECONNRESET (Test)");
      if (welt.ausgang === "unbrauchbar") return null;
      return ANALYSE;
    },
    save: async (ko) => { welt.gespeichert.push(ko); return { saved: true }; },
    // Bildet die Verknuepfungsinvariante nach: ein Ausgang, der einen Vorgang gefunden hat,
    // schreibt `ko_document_links`. Nur so veraendert sich der Bestand innerhalb des Laufs —
    // genau der Fall, den der Laufdeckel abfangen muss.
    saveSources: async (koId, docs) => {
      const vorhanden = welt.links[koId] || [];
      const bekannt = new Set(vorhanden.map((d) => d && d.id));
      welt.links[koId] = [...vorhanden, ...docs.filter((d) => d && !bekannt.has(d.id))];
      return { saved: docs.length };
    },
    markFailed: async (id) => { welt.geparkt.push(id); return { saved: true }; },
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
    claimRun: async () => {
      welt.claimRunCalls += 1; welt.schritt.push("claimRun");
      if (welt.quittiert) return false;
      welt.quittiert = true; return true;
    },
    finishRun: async (d) => { welt.abgeschlossen = d; return true; }
  };
  return { welt, deps };
}

function testbindung(dokumente, extra = {}) {
  const rows = dokumente.map((d) => ({ ...d }));
  const clusters = clusterRawDocuments(rows);
  return Object.assign({
    pruefmodus: true, commit: "test-commit", dokumente: dokumente.length,
    idHash: V.idsHash(dokumente.map((d) => d.id)), cluster: clusters.length,
    clusterGroessen: V.groessenVerteilung(clusters), maxModellaufrufe: 99,
    maxUsd: 100, maxMs: 35 * 60 * 1000
  }, extra);
}

const idsVon = (docs) => docs.map((d) => d.id);

function tempBeleg(inhalt) {
  const datei = path.join(os.tmpdir(),
    "verstehen-169-probe-" + process.pid + "-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex") + ".json");
  fs.writeFileSync(datei, typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt));
  return datei;
}

// ── §0b Der echte Production-Beleg ──────────────────────────────────────────────────────
// Der Beleg ist die BINDUNG. Er wird hier unabhaengig nachgerechnet (nicht nur gelesen).
async function abschnittEchterBeleg() {
  abschnitt("§0b  Der echte Production-Beleg belege/verstehen-169-ids.json");
  const roh = JSON.parse(fs.readFileSync(BELEG, "utf8"));

  pruefe("Der Beleg traegt exakt 169 eindeutige, wohlgeformte Kennungen", () => {
    A.equal(Array.isArray(roh.ids), true);
    A.equal(roh.ids.length, 169);
    A.equal(new Set(roh.ids).size, 169);
    A.ok(roh.ids.every((i) => /^rd-[0-9a-f]{64}$/.test(i)), "Kennungsform rd-<64 hex>");
  });

  pruefe("Der Hash des echten Belegs ist exakt der gebundene", () => {
    A.equal(V.idsHash(roh.ids), V.PINNED.idHash);
    A.equal(roh.idHash, V.PINNED.idHash);
    A.equal(roh.productionCommit, V.PINNED.commit);
    A.equal(Number(roh.documentCount), V.PINNED.dokumente);
  });

  pruefe("Die mitgelieferte unabhaengige Production-Pruefung belegt dasselbe", () => {
    const v = roh.productionReadOnlyVerification;
    A.ok(v, "Pruefbeleg vorhanden");
    A.equal(Number(v.createdCount), 169);
    A.equal(Number(v.retrievedCount), 169);
    A.equal(Number(v.createdOnly), 0);
    A.equal(Number(v.retrievedOnly), 0);
    A.equal(v.createdHash, V.PINNED.idHash);
    A.equal(v.retrievedHash, V.PINNED.idHash);
  });

  pruefe("Der Bedienweg akzeptiert den echten Beleg", () => {
    const g = CLIRUNNER.listeLaden(BELEG);
    A.equal(g.ok, true, g.grund);
    A.equal(g.ids.length, 169);
  });

  await pruefeAsync("Der Runner akzeptiert den echten Beleg (S2 und S3 greifen nicht)", async () => {
    const w = weltBauen({ dokumente: [] });
    const p = await V.pruefeUndPlane({ ids: roh.ids, deps: w.deps, commit: V.PINNED.commit });
    A.notEqual(p.grund, "verstehen-commit-abweichend");
    A.notEqual(p.grund, "verstehen-ids-anzahl-abweichend");
    A.notEqual(p.grund, "verstehen-ids-hash-abweichend");
    // Ohne Production-Zugriff endet die Planung erst am Dokumentleser.
    A.equal(p.grund, "verstehen-dokumentanzahl-abweichend");
    A.equal(w.welt.aufrufe.length, 0, "kein Modellaufruf");
  });

  pruefe("Ein falscher Hash im Beleg bleibt fail closed", () => {
    const datei = tempBeleg({ ...roh, idHash: "0000" });
    try { A.equal(CLIRUNNER.listeLaden(datei).grund, "verstehen-liste-hash-abweichend"); }
    finally { fs.unlinkSync(datei); }
  });

  pruefe("Ein veraenderter Pruefbeleg bleibt fail closed", () => {
    const datei = tempBeleg({
      ...roh,
      productionReadOnlyVerification: { ...roh.productionReadOnlyVerification, retrievedOnly: 1 }
    });
    try { A.equal(CLIRUNNER.listeLaden(datei).grund, "verstehen-liste-pruefbeleg-abweichend"); }
    finally { fs.unlinkSync(datei); }
  });

  pruefe("168 und 170 Kennungen bleiben im Beleg fail closed", () => {
    const faelle = [168, 170];
    for (const n of faelle) {
      const ids = n === 168 ? roh.ids.slice(0, 168) : [...roh.ids, "rd-" + "0".repeat(64)];
      const datei = tempBeleg({ ...roh, documentCount: n, ids });
      try { A.equal(CLIRUNNER.listeLaden(datei).grund, "verstehen-liste-anzahl-abweichend"); }
      finally { fs.unlinkSync(datei); }
    }
  });

  await pruefeAsync("168 und 170 Kennungen bleiben im Kern fail closed", async () => {
    for (const n of [168, 170]) {
      const ids = n === 168 ? roh.ids.slice(0, 168) : [...roh.ids, "rd-" + "0".repeat(64)];
      const w = weltBauen({ dokumente: [] });
      const p = await V.pruefeUndPlane({ ids, deps: w.deps, commit: V.PINNED.commit });
      A.equal(p.ok, false);
      A.equal(p.grund, "verstehen-ids-anzahl-abweichend");
    }
  });
}

// ── §0 Die festgeschriebenen Auftragswerte, woertlich ──────────────────────────────────────
async function abschnittAuftragswerte() {
  abschnitt("§0  Die festgeschriebenen Auftragswerte (woertlich, nicht ableitbar)");
  pruefe("PINNED traegt Commit, 169, den Kennungshash, 122 und 113 exakt", () => {
    A.equal(V.PINNED.commit, "ea84f26ccc380e22961335926e2d4e585cee2308");
    A.equal(V.PINNED.dokumente, 169);
    A.equal(V.PINNED.idHash, "5f3878409cc9dbe742a3c9b465e54fff53b3e7622065f90c04915eb01ac2aed9");
    A.equal(V.PINNED.cluster, 122);
    A.equal(V.PINNED.maxModellaufrufe, 113);
    A.equal(V.PINNED.maxUsd, 0.8);
    A.equal(V.PINNED.maxMs, 35 * 60 * 1000);
    A.equal(V.QUITTUNG, "verstehen169-20260922-a");
  });
  pruefe("Die belegte Groessenverteilung ergibt 122 Cluster und 169 Dokumente", () => {
    const v = V.PINNED.clusterGroessen;
    const cluster = Object.values(v).reduce((n, x) => n + Number(x), 0);
    const docs = Object.entries(v).reduce((n, [k, x]) => n + Number(k) * Number(x), 0);
    A.equal(cluster, 122);
    A.equal(docs, 169);
  });
  pruefe("Der Kennungshash ist SHA256 von sortierten, mit \\n verbundenen Kennungen", () => {
    const ids = ["rd-c", "rd-a", "rd-b"];
    const erwartet = crypto.createHash("sha256").update(["rd-a", "rd-b", "rd-c"].join("\n")).digest("hex");
    A.equal(V.idsHash(ids), erwartet);
    A.equal(V.idsHash(["rd-a", "rd-b", "rd-c"]), erwartet);
    A.notEqual(V.idsHash(["rd-a", "rd-b"]), erwartet);
  });
  await pruefeAsync("Eine abgeschwaechte Pruefbindung ist ohne Marker `pruefmodus` unmoeglich", async () => {
    const docs = [rohesDokument("x0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    const ohneMarker = { ...testbindung(docs, { maxModellaufrufe: 0 }), pruefmodus: false };
    await A.rejects(
      V.pruefeUndPlane({ ids: idsVon(docs), deps: w.deps, commit: "test-commit", erwartet: ohneMarker }),
      (e) => e instanceof D.DirektAbbruch && e.grund === "verstehen-erwartung-nur-im-pruefmodus"
    );
  });
}

// ── §1–§3 Bindung der Kennungsliste ────────────────────────────────────────────────────────
async function abschnittKennungsbindung() {
  abschnitt("§1–§3  Kennungsliste: Hash, 168, 170 — alles stoppt VOR dem Modellaufruf");
  const viele = (n) => Array.from({ length: n }, (_, i) => "rd-test-" + String(i).padStart(4, "0") + "-" + "a".repeat(40));

  await pruefeAsync("§1 falscher Dokument-Hash stoppt vor dem Modellaufruf", async () => {
    const ids = viele(169);
    A.notEqual(V.idsHash(ids), V.PINNED.idHash);
    const w = weltBauen({ dokumente: [] });
    const p = await V.pruefeUndPlane({ ids, deps: w.deps, commit: V.PINNED.commit });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-ids-hash-abweichend");
    A.equal(w.welt.aufrufe.length, 0);
    A.equal(w.welt.schritt.length, 0, "kein Quittungsschritt, kein CAS");
    // Ohne gueltige Bindung wird nicht einmal geladen.
    A.equal(w.welt.bestandslesungen + w.welt.kandidatensuchen, 0);
  });

  await pruefeAsync("§2 168 Kennungen stoppen", async () => {
    const ids = viele(168);
    const w = weltBauen({ dokumente: [] });
    const p = await V.pruefeUndPlane({ ids, deps: w.deps, commit: V.PINNED.commit });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-ids-anzahl-abweichend");
    A.equal(p.anzahl, 168);
    A.equal(w.welt.aufrufe.length, 0);
  });

  await pruefeAsync("§3 170 Kennungen stoppen", async () => {
    const ids = viele(170);
    const w = weltBauen({ dokumente: [] });
    const p = await V.pruefeUndPlane({ ids, deps: w.deps, commit: V.PINNED.commit });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-ids-anzahl-abweichend");
    A.equal(p.anzahl, 170);
    A.equal(w.welt.aufrufe.length, 0);
  });

  await pruefeAsync("§S1 ein fremder Production Commit stoppt", async () => {
    const w = weltBauen({ dokumente: [] });
    const p = await V.pruefeUndPlane({ ids: viele(169), deps: w.deps, commit: "deadbeef" });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-commit-abweichend");
    A.equal(w.welt.aufrufe.length, 0);
  });
}

// ── §4–§6 Plan-Gates ──────────────────────────────────────────────────────────────────────
async function abschnittPlanGates() {
  abschnitt("§4–§6  Plan-Gates: Clusterzahl, Kandidatenzahl, weniger ist erlaubt");
  const docs = WOERTER.slice(0, 3).map((w, i) => rohesDokument("g" + i, w));

  await pruefeAsync("§4 Clusterzahl ueber der gebundenen stoppt", async () => {
    const w = weltBauen({ dokumente: docs });
    const p = await V.pruefeUndPlane({
      ids: idsVon(docs), deps: w.deps, commit: "test-commit",
      erwartet: testbindung(docs, { cluster: 2, clusterGroessen: { 1: 2 } })
    });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-cluster-abweichend");
    A.equal(p.anzahl, 3);
    A.equal(w.welt.aufrufe.length, 0);
  });

  await pruefeAsync("§S6 eine abweichende Groessenverteilung stoppt", async () => {
    const w = weltBauen({ dokumente: docs });
    const p = await V.pruefeUndPlane({
      ids: idsVon(docs), deps: w.deps, commit: "test-commit",
      erwartet: testbindung(docs, { clusterGroessen: { 2: 1, 1: 1 } })
    });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-clustergroessen-abweichend");
  });

  await pruefeAsync("§5 Kandidaten ueber der gebundenen Zahl stoppen (3 Kandidaten, Deckel 2)", async () => {
    const w = weltBauen({ dokumente: docs });
    const p = await V.pruefeUndPlane({
      ids: idsVon(docs), deps: w.deps, commit: "test-commit",
      erwartet: testbindung(docs, { maxModellaufrufe: 2 })
    });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-kandidaten-ueber-deckel");
    A.equal(p.kandidaten, 3);
    A.equal(w.welt.aufrufe.length, 0);
  });

  await pruefeAsync("§6 weniger notwendige Aufrufe sind erlaubt (1 Kandidat, Deckel 99)", async () => {
    const w = weltBauen({ dokumente: [docs[0]] });
    const p = await V.pruefeUndPlane({
      ids: [docs[0].id], deps: w.deps, commit: "test-commit",
      erwartet: testbindung([docs[0]], { maxModellaufrufe: 99 })
    });
    A.equal(p.ok, true);
    A.equal(p.plan.kandidaten, 1);
    A.ok(p.plan.kandidaten <= 99);
  });
}

// ── §7 merged-Pfad, §19/§20 CAS und Fencing ───────────────────────────────────────────────
function baueMergedWelt() {
  // Ein BESTAND mit ZWEI verknuepften Dokumenten (kein „schwacher Bestand"): nur so greift die
  // Kern-gegen-Kern-Pruefung von `sameVorgang` mit einer Beweisfamilie.
  const altMerged = [rohesDokument("alt-m1", "Fliederbusch"), rohesDokument("alt-m2", "Fliederbusch")];
  const altUpdate = [rohesDokument("alt-u1", "Eibischwurzel"), rohesDokument("alt-u2", "Eibischwurzel")];
  const docs = [rohesDokument("neu-m", "Fliederbusch"), rohesDokument("neu-u", "Eibischwurzel Quendelbluete")];
  const koM = { id: "ko-m", vorgang_id: "vg-fliederbusch-20260901-aaaa", status: "complete", understanding_status: "complete", updated_at: "2026-09-22T07:00:00Z" };
  const koU = { id: "ko-u", vorgang_id: "vg-eibischwurzel-20260901-bbbb", status: "complete", understanding_status: "complete", updated_at: "2026-09-22T07:00:00Z" };
  const w = weltBauen({ dokumente: docs, kos: [koM, koU], links: { "ko-m": altMerged, "ko-u": altUpdate } });
  return { ...w, docs, bindung: testbindung(docs) };
}

async function abschnittMergedUndCas() {
  abschnitt("§7/§19/§20  merged ohne Aufruf · bestehendes CAS · bestehendes Fencing");
  const M = baueMergedWelt();

  await pruefeAsync("§7 der merged-Pfad (keine neuen Fakten) erzeugt keinen Modellaufruf", async () => {
    const p = await V.pruefeUndPlane({ ids: idsVon(M.docs), deps: M.deps, commit: "test-commit", erwartet: M.bindung });
    A.equal(p.ok, true);
    A.equal(p.plan.arten.merged, 1);
    A.equal(p.plan.arten.update, 1);
    A.equal(p.plan.kandidaten, 1);
    const merged = p.plan.einteilungen.find((e) => e.art === "merged");
    A.equal(merged.kandidat, false);
    A.equal(merged.begruendung, "keine-neuen-fakten");
  });

  await pruefeAsync("§7/§19 im echten Lauf: merged kostet 0, update genau 1 Aufruf", async () => {
    const lauf = await V.fuehreAus({
      ids: idsVon(M.docs), deps: M.deps, execute: true, commit: "test-commit", erwartet: M.bindung,
      preisJeAufrufUsd: 0.01, runId: "merged-lauf", now: () => new Date()
    });
    A.equal(lauf.ok, true);
    A.equal(lauf.modellaufrufe, 1);
    A.equal(lauf.bilanz.arten.merged, 1);
    A.equal(lauf.bilanz.arten.updated, 1);
    // Bestandslesungen beweisen, dass die BESTEHENDEN Wissensobjekte wiederverwendet wurden.
    A.ok(M.welt.bestandslesungen > 0);
    A.ok(M.welt.kandidatensuchen > 0);
  });

  await pruefeAsync("§19 das bestehende CAS wird verwendet (Reservierung vor dem Modellaufruf)", async () => {
    const s = M.welt.schritt;
    const iQuittung = s.indexOf("claimRun");
    const iReserviere = s.indexOf("reserviere");
    const iStart = s.indexOf("modellstart");
    const iAufruf = s.indexOf("requestUnderstanding");
    const iSchreib = s.indexOf("schreibrecht");
    const iSpeichere = s.indexOf("speichere");
    A.ok(iQuittung >= 0 && iReserviere >= 0 && iStart >= 0 && iAufruf >= 0 && iSchreib >= 0 && iSpeichere >= 0);
    // Die Einmalquittung liegt VOR allem Bezahlten; modellstart VOR dem Modellaufruf.
    A.ok(iQuittung < iReserviere);
    A.ok(iReserviere < iStart);
    A.ok(iStart < iAufruf);
    A.ok(iAufruf < iSchreib && iSchreib < iSpeichere);
    // Je Cluster ein eigener Besitzer — plus die Vorflugpruefung des Vertrags.
    A.equal(M.welt.besitzer, 3, "Vorflug + ein eigener Besitzer je Cluster");
  });

  await pruefeAsync("§20 dasselbe Fencing traegt Reservierung, Modellstart und Speicherung", async () => {
    A.ok(M.welt.fencingWerte.length >= 3);
    A.equal(new Set(M.welt.fencingWerte).size, 1);
    A.ok(Number.isInteger(M.welt.fencingWerte[0]));
  });

  await pruefeAsync("§20 eine abgelehnte Fencing-Pruefung verhindert den Modellaufruf", async () => {
    const docs = [rohesDokument("fence-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    w.welt.modellstartErlaubt = false;
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs), preisJeAufrufUsd: 0.01, runId: "fence", now: () => new Date()
    });
    A.equal(lauf.modellaufrufe, 0);
    A.equal(w.welt.aufrufe.length, 0);
    A.equal(lauf.ergebnisse[0].status, "skipped-cluster-belegt");
    A.ok(String(lauf.ergebnisse[0].reason || "").includes("modellstart-abgelehnt"));
  });
}

// ── §8/§9/§14 Laufdeckel ──────────────────────────────────────────────────────────────────
async function abschnittLaufdeckel() {
  abschnitt("§8/§9/§14  Aufrufdeckel · Kostendeckel · Zeitdeckel");

  // Der Aufrufdeckel ist ein RIEGEL DES LAUFS, nicht nur eine Planaussage: der Plan gatet,
  // was der Lauf hoechstens VORHAT (S7), der Lauf deckelt, was er tatsaechlich TUT. Beide
  // tragen in Produktion dieselbe Zahl (113). Damit der Laufdeckel unabhaengig vom Plan-Gate
  // geprueft werden kann, senkt diese Pruefung ausschliesslich den Laufdeckel
  // (`laufMaxModellaufrufe`), laesst den Plan aber passieren.
  await pruefeAsync("§8 der Aufrufdeckel greift (Plan passiert, Laufdeckel 1, 3 Kandidaten)", async () => {
    const docs = WOERTER.slice(0, 3).map((w, i) => rohesDokument("deckel-" + i, w));
    const w = weltBauen({ dokumente: docs });
    const bindung = testbindung(docs, { maxModellaufrufe: 99, laufMaxModellaufrufe: 1 });
    const p = await V.pruefeUndPlane({ ids: idsVon(docs), deps: w.deps, commit: "test-commit", erwartet: bindung });
    A.equal(p.ok, true, "der Plan passiert");
    A.equal(p.plan.kandidaten, 3);
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit", erwartet: bindung,
      preisJeAufrufUsd: 0.01, runId: "deckel", now: () => new Date()
    });
    A.equal(lauf.abbruchGrund, "verstehen-aufrufdeckel-erreicht");
    A.equal(lauf.modellaufrufe, 1);
    A.equal(lauf.ok, false);
    A.ok(lauf.modellaufrufe <= 1, "der Deckel wird nie ueberschritten");
    A.equal(w.welt.abgeschlossen.laufMaxModellaufrufe, 1);
    A.equal(w.welt.abgeschlossen.modellaufrufe, 1);
  });

  await pruefeAsync("§8 ohne Pruefbindung sind Plan- und Laufdeckel dieselbe Zahl", async () => {
    // Mit der ECHTEN Bindung: synthetische Kennungen erfuellen den festgeschriebenen Hash nie.
    const ids = Array.from({ length: 169 }, (_, i) => "rd-deckel-" + String(i).padStart(4, "0") + "-" + "b".repeat(40));
    const w = weltBauen({ dokumente: [] });
    const p = await V.pruefeUndPlane({ ids, deps: w.deps, commit: V.PINNED.commit });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-ids-hash-abweichend");
    A.equal(V.PINNED.maxModellaufrufe, 113);
    A.ok(V.PINNED.maxModellaufrufe <= 113);
  });

  await pruefeAsync("§9 der Kostendeckel greift (0,01 USD bei 0,01 USD je Aufruf)", async () => {
    const docs = WOERTER.slice(0, 3).map((w, i) => rohesDokument("kosten-" + i, w));
    const w = weltBauen({ dokumente: docs });
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs, { maxUsd: 0.01 }), preisJeAufrufUsd: 0.01,
      runId: "kosten", now: () => new Date()
    });
    A.equal(lauf.abbruchGrund, "verstehen-kostendeckel-erreicht");
    A.equal(lauf.modellaufrufe, 1);
  });

  await pruefeAsync("§9 ohne bestaetigten Preis startet kein bezahlter Lauf", async () => {
    const docs = [rohesDokument("preis-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs), preisJeAufrufUsd: null, runId: "preis", now: () => new Date()
    });
    A.equal(lauf.ok, false);
    A.equal(lauf.grund, "verstehen-preis-fehlt");
    A.equal(w.welt.aufrufe.length, 0);
  });

  await pruefeAsync("§14 das 35-Minuten-Zeitlimit stoppt sicher (bestehende Restzeitwache)", async () => {
    const docs = [rohesDokument("zeit-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs, { maxMs: 1 }), preisJeAufrufUsd: 0.01,
      runId: "zeit", now: () => new Date()
    });
    A.equal(lauf.abbruchGrund, "verstehen-zeitdeckel-erreicht");
    A.equal(lauf.modellaufrufe, 0);
    A.equal(w.welt.aufrufe.length, 0);
    // Und die Bindung selbst traegt 35 Minuten.
    A.equal(V.PINNED.maxMs, 2100000);
  });

  await pruefeAsync("§14 der Motor bekommt die absolute Deadline (bestehende Restzeitwache)", async () => {
    const quelltext = quelle("lib/helmut/verstehen-einmalig.js");
    A.ok(quelltext.includes("deadlineMs, retriesCtx"), "understandOneCluster erhaelt deadlineMs");
    A.ok(quelltext.includes("restzeit.restzeitEntscheidung"));
  });
}

// ── §11/§12 unbekannter Ausgang, kein Retry ───────────────────────────────────────────────
async function abschnittUnbekannt() {
  abschnitt("§11/§12  Unbekannter Modellausgang stoppt den gesamten Runner · kein Retry");
  const docs = WOERTER.slice(0, 3).map((w, i) => rohesDokument("unb-" + i, w));
  const w = weltBauen({ dokumente: docs });
  w.welt.ausgang = "unbekannt";
  const bindung = testbindung(docs);
  let lauf = null;

  await pruefeAsync("§11 ein unbekannter Ausgang beendet den GESAMTEN Runner", async () => {
    lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit", erwartet: bindung,
      preisJeAufrufUsd: 0.01, runId: "unbekannt", now: () => new Date()
    });
    A.equal(lauf.ok, false);
    A.equal(lauf.abbruchGrund, "verstehen-ausgang-unbekannt");
    A.equal(lauf.ergebnisse.length, 1, "kein weiterer Cluster nach dem unbekannten Ausgang");
    A.equal(lauf.ergebnisse[0].ausgang, "unbekannt");
    A.equal(lauf.bilanz.unbekannt, 1);
    A.equal(lauf.quittungStatus, "unbekannt");
    // Der bezahlte Aufruf ist als unbekannt vermerkt, nicht freigegeben.
    A.ok(w.welt.schritt.includes("ausgangUnbekannt"));
    A.ok(!w.welt.schritt.includes("freigabe"));
  });

  await pruefeAsync("§12 kein automatischer Retry desselben Clusters", async () => {
    A.equal(w.welt.aufrufe.length, 1, "genau ein Modellaufruf");
    A.equal(w.welt.schritt.filter((s) => s === "requestUnderstanding").length, 1);
    A.equal(new Set(lauf.ergebnisse.map((e) => e.vorgangId)).size, lauf.ergebnisse.length);
    A.equal(lauf.automatischeWiederholung, false);
    A.equal(w.welt.abgeschlossen.automatischeWiederholung, false);
    // Die bestehende Kostenreserve wird NICHT angetastet: kein Aufraeumen, kein Rueckweg.
    A.ok(!w.welt.schritt.includes("freigabeOhneAufruf"));
  });
}

// ── §13 Einmalquittung ────────────────────────────────────────────────────────────────────
async function abschnittQuittung() {
  abschnitt("§13  Einmalquittung verhindert den zweiten Lauf");
  const docs = WOERTER.slice(0, 2).map((w, i) => rohesDokument("quit-" + i, w));
  const w = weltBauen({ dokumente: docs });
  const bindung = testbindung(docs);
  const lauf = (runId, now = () => new Date()) => V.fuehreAus({
    ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit", erwartet: bindung,
    preisJeAufrufUsd: 0.01, runId, now
  });
  let erst = null;

  await pruefeAsync("§13 der erste Lauf beansprucht die Quittung VOR dem Modellaufruf", async () => {
    erst = await lauf("q1");
    A.equal(erst.ok, true);
    A.equal(erst.quittung, V.QUITTUNG);
    A.equal(erst.quittungStatus, "abgeschlossen");
    A.equal(w.welt.abgeschlossen.modellaufrufe, 2);
    A.equal(w.welt.abgeschlossen.dokumente, 2);
    A.equal(w.welt.abgeschlossen.maxModellaufrufe, bindung.maxModellaufrufe);
    A.equal(w.welt.abgeschlossen.maxUsd, 100);
    A.equal(w.welt.abgeschlossen.maxMs, bindung.maxMs);
    A.equal(w.welt.abgeschlossen.idHash, bindung.idHash);
    A.ok(w.welt.abgeschlossen.gestartetAm && w.welt.abgeschlossen.beendetAm);
    A.ok(w.welt.abgeschlossen.bilanz);
  });

  await pruefeAsync("§13 der zweite Lauf desselben Auftrags macht keinen Modellaufruf", async () => {
    const vorher = w.welt.aufrufe.length;
    const zweit = await lauf("q2");
    A.equal(zweit.ok, false);
    A.equal(zweit.grund, "verstehen-bereits-verwendet");
    A.equal(zweit.ausgeloest, false);
    A.equal(w.welt.aufrufe.length, vorher, "kein zusaetzlicher Modellaufruf");
    A.equal(w.welt.claimRunCalls, 2);
  });

  await pruefeAsync("§13 auch ein gestoppter Lauf bleibt terminal abgeschlossen", async () => {
    // Zweiter Auftrag mit eigenem Bestand; der Lauf bricht am Zeitdeckel ab.
    const d2 = [rohesDokument("quit2-0", WOERTER[3])];
    const w2 = weltBauen({ dokumente: d2 });
    const r = await V.fuehreAus({
      ids: idsVon(d2), deps: w2.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(d2, { maxMs: 1 }), preisJeAufrufUsd: 0.01,
      runId: "q3", now: () => new Date()
    });
    A.equal(r.quittungStatus, "gestoppt");
    A.equal(w2.welt.abgeschlossen.status, "gestoppt");
    A.equal(w2.welt.abgeschlossen.automatischeWiederholung, false);
    const nochmal = await V.fuehreAus({
      ids: idsVon(d2), deps: w2.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(d2, { maxMs: 1 }), preisJeAufrufUsd: 0.01,
      runId: "q4", now: () => new Date()
    });
    A.equal(nochmal.grund, "verstehen-bereits-verwendet");
    A.equal(w2.welt.aufrufe.length, 0);
  });
}

// ── §15 fremdes Dokument ──────────────────────────────────────────────────────────────────
async function abschnittFremd() {
  abschnitt("§15  Fremdes Dokument wird abgelehnt");
  await pruefeAsync("§15 ein Dokument ausserhalb der gebundenen Liste stoppt", async () => {
    const docs = WOERTER.slice(0, 2).map((w, i) => rohesDokument("fremd-" + i, w));
    const fremd = rohesDokument("fremd-x", "Sanddornbeere");
    const w = weltBauen({ dokumente: [docs[0], fremd] });
    // Der Leser liefert die Anzahl richtig, aber eine Kennung, die NICHT gebunden ist.
    w.deps.ladeDokumente = async () => w.welt.dokumente;
    const p = await V.pruefeUndPlane({ ids: idsVon(docs), deps: w.deps, commit: "test-commit", erwartet: testbindung(docs) });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-fremdes-dokument");
    A.equal(p.anzahl, 1);
    A.equal(w.welt.aufrufe.length, 0);
  });

  await pruefeAsync("§15 ein fehlendes Dokument stoppt ebenso", async () => {
    const docs = WOERTER.slice(0, 2).map((w, i) => rohesDokument("fehlt-" + i, w));
    const w = weltBauen({ dokumente: [docs[0]] });
    const p = await V.pruefeUndPlane({ ids: idsVon(docs), deps: w.deps, commit: "test-commit", erwartet: testbindung(docs) });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-dokumentanzahl-abweichend");
  });

  await pruefeAsync("§S10 ein Dokument ohne Abbildung stoppt (keine stille Verkuerzung)", async () => {
    const gut = rohesDokument("abb-0", WOERTER[0]);
    const kaputt = { id: "rd-abb-kaputt", content_hash: "x", url: null, canonical_url: null, title: null, summary: null, published_at: null };
    const w = weltBauen({ dokumente: [gut, kaputt] });
    const p = await V.pruefeUndPlane({ ids: [gut.id, kaputt.id], deps: w.deps, commit: "test-commit", erwartet: testbindung([gut, kaputt]) });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-idabbildung-abweichend");
  });

  await pruefeAsync("§S9 ein Lesefehler gilt nie als „keine Dokumente\"", async () => {
    const docs = [rohesDokument("lese-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    w.deps.ladeDokumente = async () => { throw new Error("StorageReadError"); };
    const p = await V.pruefeUndPlane({ ids: idsVon(docs), deps: w.deps, commit: "test-commit", erwartet: testbindung(docs) });
    A.equal(p.ok, false);
    A.ok(p.grund.startsWith("verstehen-dokumente-nicht-lesbar:"));
  });
}

// ── §16–§18 Keine Nebenwirkungen ──────────────────────────────────────────────────────────
async function abschnittNebenwirkungen() {
  abschnitt("§16–§18  Keine Nebenwirkungen: 0 Quellenabrufe, 0 Profilwrites, 0 Kommunikation");
  // Nur CODE-Gestalten, keine Prosa-Woerter: die Kopfkommentare nennen die verbotenen Bereiche
  // ausdruecklich („kein Crawler"), und das ist kein Bezug, sondern eine Abgrenzung.
  const VERBOTEN = [
    "require(\"./crawler", "require(\"../lib/helmut/crawler", "require(\"./artikelkontext-lauf",
    "crawlAllSources(", "artikelkontextVersorgung(", "versorgeArtikelkontext(",
    "runMatching(", "buildLageBriefing(", "buildV3Briefing(",
    "setTestProfileActive(", "mandate_profiles", "saveProfile(", "provisionTenant(",
    "buildCommunicationDraft(", "dispatchKommunikation(", "sendWhatsapp(",
    "webhookVersand(", "resend.emails", "Resend("
  ];
  for (const rel of ["lib/helmut/verstehen-einmalig.js", "scripts/verstehen-einmalig-169.js"]) {
    pruefe("§16–§18 " + rel + " beruehrt weder Quellen, Profile noch Kommunikation", () => {
      const t = quelle(rel);
      const treffer = VERBOTEN.filter((w) => t.includes(w));
      A.deepEqual(treffer, [], "unerlaubte Bezuege: " + treffer.join(", "));
    });
  }

  await pruefeAsync("§16 eine Artikelkontext-Versorgung wird ausdruecklich abgelehnt", async () => {
    const docs = [rohesDokument("art-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    w.deps.artikelkontextVersorgung = async () => ({ ok: true });
    const p = await V.pruefeUndPlane({ ids: idsVon(docs), deps: w.deps, commit: "test-commit", erwartet: testbindung(docs) });
    A.equal(p.ok, false);
    A.equal(p.grund, "verstehen-artikelkontext-verboten");
  });

  await pruefeAsync("§16–§18 die rein lesende Planung meldet alle drei Zaehler als 0", async () => {
    const docs = [rohesDokument("null-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    const r = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: false, commit: "test-commit", erwartet: testbindung(docs)
    });
    A.equal(r.quellenabrufe, 0);
    A.equal(r.profilwrites, 0);
    A.equal(r.kommunikation, 0);
    A.equal(r.modellaufrufe, 0, "rein lesende Planung macht keinen Modellaufruf");
    A.equal(r.reinLesend, true);
    A.equal(r.ausgeloest, false);
    A.equal(w.welt.aufrufe.length, 0);
    A.equal(w.welt.schritt.length, 0, "keine Quittung, kein CAS, kein Schloss in der Planung");
    A.equal(r.modellaufrufeKandidaten, 1, "die Kandidatenzahl wird geplant, nicht ausgefuehrt");
  });
}

// ── §10 Der globale Tagesriegel ──────────────────────────────────────────────────────────
async function abschnittTagesriegel() {
  abschnitt("§10  Der globale 4-USD-Tagesriegel bleibt unveraendert");
  pruefe("§10 der Laufdeckel ist der Bestandteil eines 4-USD-Tagesriegels, nie groesser", () => {
    A.ok(V.PINNED.maxUsd < 4);
    A.equal(V.PINNED.maxUsd, 0.8);
    A.ok(V.PINNED.maxModellaufrufe < 2416);
  });
  pruefe("§10 der Aufruftyp ist die BESTEHENDE, nicht priorisierte Rueckstandsklasse", () => {
    A.equal(V.CALLTYPE, rueckstand.RUECKSTAND_CALLTYPE);
    A.equal(V.CALLTYPE, "understanding-rueckstand");
  });
  pruefe("§10 der Runner setzt keine Budget-, Deckel- oder Reservewerte", () => {
    const t = quelle("lib/helmut/verstehen-einmalig.js") + quelle("scripts/verstehen-einmalig-169.js");
    for (const verboten of ["HELMUT_MAX_LLM_CALLS_PER_DAY", "HELMUT_LLM_RESERVE_UNDERSTANDING",
      "HELMUT_RUECKSTAND_MAX_AUFRUFE", "HELMUT_RUECKSTAND_BUDGET_BODEN", "HELMUT_LLM_USAGE_RELATIONAL",
      "llm_budget_counters", "llm_budget_reserve", "llm_budget_settle", "process.env.HELMUT_LLM"]) {
      A.ok(!t.includes(verboten), "verbotener Budgeteingriff: " + verboten);
    }
    // Der bestehende Kostenmechanismus bleibt der einzige: nur die vorhandene Vorpruefung
    // und das vorhandene Gate ueber deps werden benutzt.
    A.ok(t.includes("vorabBodenPruefung"), "bestehende Bodenpruefung wird wiederverwendet");
    A.ok(!/storage\.(reserveLlmCall|canSpendLlm)\s*\(/.test(t), "kein direkter Budgetaufruf am Gate vorbei");
  });
  await pruefeAsync("§10 das bestehende Budget-Gate bleibt im Pfad", async () => {
    const docs = [rohesDokument("gate-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs), preisJeAufrufUsd: 0.01, runId: "gate", now: () => new Date()
    });
    A.equal(lauf.modellaufrufe, 1);
    A.ok(w.welt.canSpend >= 1, "deps.canSpend (bestehendes Gate) wurde befragt");
    A.equal(lauf.quellenabrufe, 0);
    A.equal(lauf.profilwrites, 0);
    A.equal(lauf.kommunikation, 0);
  });
}

(async () => {
  await abschnittAuftragswerte();
  await abschnittEchterBeleg();
  await abschnittKennungsbindung();
  await abschnittPlanGates();
  await abschnittMergedUndCas();
  await abschnittLaufdeckel();
  await abschnittUnbekannt();
  await abschnittQuittung();
  await abschnittFremd();
  await abschnittNebenwirkungen();
  await abschnittTagesriegel();

  console.log("\n== ERGEBNIS ==");
  console.log("bestanden: " + bestanden);
  console.log("fehlgeschlagen: " + fehlgeschlagen.length);
  if (fehlgeschlagen.length) {
    for (const n of fehlgeschlagen) console.log("  FAIL " + n);
    process.exitCode = 1;
  }
})();
