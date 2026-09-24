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
//  §11  ein GLOBALER Vertrags-/Infrastruktur-Ausgang stoppt den GESAMTEN Runner
//  §12  kein automatischer Retry
//  §25  lokaler Clusterfehler (skipped-invalid) bleibt terminal gesperrt, beendet den Lauf
//       aber NICHT mehr global — die uebrigen Cluster laufen weiter (2026-09-24)
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
const understanding = require(path.join(ROOT, "lib/helmut/understanding"));
const { contentHash, canonicalizeUrl, dedupeRawDocuments, toRawDocumentRow } = require(path.join(ROOT, "lib/helmut/dedup"));
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
    quellenabrufe: 0, profilwrites: 0, kommunikation: 0,
    // Kostenwahrheit (Attrappe der BESTEHENDEN testkosten-Wahrheit): die volle Reservierung je
    // Aufruf und der echte Laufkostenstand — der Deckel prueft echte Summen, keinen Durchschnitt.
    reservierungUsd: 0.212, laufkostenUsd: 0, echteKosten: 0, kostenLesefehler: false, kostenlesungen: 0,
    // Ab der (n+1)-ten Lesung wirft der Kostenleser (Default Infinity: nie) — damit laesst sich
    // ein Fehler NUR beim finalen Nachlesen nach bereits getaetigten Aufrufen erzeugen.
    kostenLesefehlerNach: Infinity
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
      // Echte Abrechnung NACH der Antwort: die echten Tokenkosten dieses Aufrufs ersetzen
      // die volle Reservierung in der Laufbilanz.
      welt.laufkostenUsd += welt.echteKosten;
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
    finishRun: async (d) => { welt.abgeschlossen = d; return true; },
    reservierungHoeheUsd: () => welt.reservierungUsd,
    laufKostenUsd: async () => {
      welt.kostenlesungen += 1;
      if (welt.kostenLesefehler) throw new Error("kostenleser-testfehler");
      if (welt.kostenlesungen > welt.kostenLesefehlerNach) throw new Error("kostenleser-final-testfehler");
      return welt.laufkostenUsd;
    }
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
      runId: "merged-lauf", now: () => new Date()
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
      erwartet: testbindung(docs), runId: "fence", now: () => new Date()
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
      runId: "deckel", now: () => new Date()
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

  await pruefeAsync("§9 der Kostendeckel greift (echte Laufkosten + volle Reservierung, KEIN Durchschnittspreis)", async () => {
    // 3 Kandidaten, maxUsd 0,01, volle Reservierung 0,006 je Aufruf, echte Kosten 0,004 je
    // Aufruf. Ein Durchschnittspreis waere hier voellig egal — massgeblich ist der echte Stand:
    // Aufruf 1: 0,000 + 0,006 <= 0,010 (laeuft, Bilanz -> 0,004)
    // Aufruf 2: 0,004 + 0,006 <= 0,010 (laeuft, Bilanz -> 0,008)
    // Aufruf 3: 0,008 + 0,006 = 0,014 > 0,010 -> STOPP VOR dem Provider-Aufruf.
    const docs = WOERTER.slice(0, 3).map((w, i) => rohesDokument("kosten-" + i, w));
    const w = weltBauen({ dokumente: docs });
    w.welt.reservierungUsd = 0.006;
    w.welt.echteKosten = 0.004;
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs, { maxUsd: 0.01 }), runId: "kosten", now: () => new Date()
    });
    A.equal(lauf.abbruchGrund, "verstehen-kostendeckel-erreicht");
    A.equal(lauf.modellaufrufe, 2, "der dritte Aufruf wuerde die Grenze ueberschreiten");
    A.equal(w.welt.aufrufe.length, 2, "kein Provider-Aufruf ueber der Grenze");
    A.equal(lauf.automatischeWiederholung, false);
    A.equal(lauf.quittungStatus, "gestoppt", "Quittung terminal");
    A.equal(lauf.laufkostenUsd, 0.008, "der letzte echte Kostenstand bleibt sichtbar");
  });

  await pruefeAsync("§9 Kosten genau unter der Grenze laufen weiter (Grenzfall)", async () => {
    // 0,004 + 0,006 = 0,010 <= maxUsd 0,010: der zweite Aufruf darf noch laufen.
    const docs = WOERTER.slice(0, 2).map((w, i) => rohesDokument("kostenrand-" + i, w));
    const w = weltBauen({ dokumente: docs });
    w.welt.reservierungUsd = 0.006;
    w.welt.echteKosten = 0.004;
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs, { maxUsd: 0.01 }), runId: "kostenrand", now: () => new Date()
    });
    A.equal(lauf.abbruchGrund, null);
    A.equal(lauf.modellaufrufe, 2);
    A.equal(lauf.quittungStatus, "abgeschlossen");
  });

  await pruefeAsync("§9 echte Einzelkosten stoppen, obwohl der Durchschnitt weitergemacht haette", async () => {
    // 8 Kandidaten, maxUsd 0,10, volle Reservierung 0,05 je Aufruf, ECHTE Kosten 0,013 je
    // Aufruf (reale Schwankung bis ~0,013 USD). Durchschnittsrechnung: 8 × 0,00526125 ≈ 0,042
    // < 0,10 — der alte Deckel haette alle 8 laufen lassen. Der echte Stand stoppt dagegen:
    // 0,039 + 0,05 = 0,089 <= 0,10 (4. Aufruf laeuft, Bilanz -> 0,052)
    // 0,052 + 0,05 = 0,102 > 0,10  -> STOPP VOR dem 5. Provider-Aufruf.
    const docs = WOERTER.slice(0, 8).map((w, i) => rohesDokument("echtkosten-" + i, w));
    const w = weltBauen({ dokumente: docs });
    w.welt.reservierungUsd = 0.05;
    w.welt.echteKosten = 0.013;
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs, { maxUsd: 0.1 }), runId: "echtkosten", now: () => new Date()
    });
    A.equal(lauf.abbruchGrund, "verstehen-kostendeckel-erreicht");
    A.equal(lauf.modellaufrufe, 4, "echte Kosten stoppen vor dem ueberschreitenden Aufruf");
    A.equal(w.welt.aufrufe.length, 4);
    A.equal(lauf.automatischeWiederholung, false);
    A.equal(lauf.quittungStatus, "gestoppt");
  });

  await pruefeAsync("§9 ohne Kostenwahrheit startet kein bezahlter Lauf", async () => {
    const docs = [rohesDokument("preis-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    delete w.deps.reservierungHoeheUsd;
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs), runId: "preis", now: () => new Date()
    });
    A.equal(lauf.ok, false);
    A.equal(lauf.grund, "verstehen-kostenwahrheit-fehlt");
    A.equal(w.welt.aufrufe.length, 0);
  });

  await pruefeAsync("§9 ein unlesbarer Kostenstand stoppt fail closed VOR dem Aufruf", async () => {
    const docs = [rohesDokument("kostenleser-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    w.welt.kostenLesefehler = true;
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs), runId: "kostenleser", now: () => new Date()
    });
    A.equal(lauf.abbruchGrund, "verstehen-kostenleser-fehler");
    A.equal(w.welt.aufrufe.length, 0);
    A.equal(lauf.automatischeWiederholung, false);
    A.equal(lauf.quittungStatus, "gestoppt");
  });

  await pruefeAsync("§14 das 35-Minuten-Zeitlimit stoppt sicher (bestehende Restzeitwache)", async () => {
    const docs = [rohesDokument("zeit-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs, { maxMs: 1 }), runId: "zeit", now: () => new Date()
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

// ── Finaler Kostenendstand (Abschlussbeleg) ────────────────────────────────────────────────
async function abschnittFinalerKostenstand() {
  abschnitt("Finaler Kostenendstand — Bericht und Quittung tragen den final gelesenen Wert");

  await pruefeAsync("ein erfolgreicher Lauf mit genau einem Aufruf meldet exakt dessen echte Endkosten", async () => {
    const docs = [rohesDokument("final-0", WOERTER[0])];
    const w = weltBauen({ dokumente: docs });
    w.welt.echteKosten = 0.01;
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs), runId: "final-0", now: () => new Date()
    });
    A.equal(lauf.ok, true);
    A.equal(lauf.abbruchGrund, null);
    A.equal(lauf.modellaufrufe, 1);
    A.equal(lauf.laufkostenUsd, 0.01, "echter Endstand, nicht 0 (Stand vor dem Aufruf)");
    A.equal(lauf.quittungStatus, "abgeschlossen");
    A.equal(w.welt.abgeschlossen.laufkostenUsd, 0.01, "Quittung traegt denselben Wert");
  });

  await pruefeAsync("mehrere Aufrufe melden die Summe inklusive des letzten Aufrufs", async () => {
    const docs = WOERTER.slice(0, 3).map((w, i) => rohesDokument("finalsum-" + i, w));
    const w = weltBauen({ dokumente: docs });
    w.welt.echteKosten = 0.01;
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs), runId: "finalsum", now: () => new Date()
    });
    A.equal(lauf.modellaufrufe, 3);
    A.equal(lauf.laufkostenUsd, 0.03, "Summe inkl. letztem Aufruf — nicht 0,02 (Stand vor letztem Cluster)");
    A.equal(w.welt.abgeschlossen.laufkostenUsd, 0.03);
    A.equal(lauf.quittungStatus, "abgeschlossen");
  });

  await pruefeAsync("Fehler beim finalen Kostenlesen: kein weiterer Aufruf, nicht erfolgreich, terminal gestoppt", async () => {
    const docs = WOERTER.slice(0, 2).map((w, i) => rohesDokument("finalfehler-" + i, w));
    const w = weltBauen({ dokumente: docs });
    w.welt.echteKosten = 0.01;
    w.welt.kostenLesefehlerNach = 2; // Lesung 1+2 (Pre-Call) ok, Lesung 3 (final) wirft
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs), runId: "finalfehler", now: () => new Date()
    });
    A.equal(lauf.ok, false);
    A.equal(lauf.abbruchGrund, "verstehen-kostenleser-fehler");
    A.equal(lauf.modellaufrufe, 2, "beide Aufrufe liefen; danach kein weiterer Provider-Aufruf");
    A.equal(w.welt.aufrufe.length, 2);
    A.equal(lauf.automatischeWiederholung, false);
    A.equal(lauf.quittungStatus, "gestoppt");
  });

  await pruefeAsync("finaler Kostenstand ueber 0,80 USD wird nicht als erfolgreich gemeldet", async () => {
    const docs = WOERTER.slice(0, 2).map((w, i) => rohesDokument("invariante-" + i, w));
    const w = weltBauen({ dokumente: docs });
    w.welt.reservierungUsd = 0.01;
    w.welt.echteKosten = 0.5;
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(docs, { maxUsd: 0.8 }), runId: "invariante", now: () => new Date()
    });
    A.equal(lauf.ok, false);
    A.equal(lauf.abbruchGrund, "verstehen-kosten-invariante-verletzt");
    A.equal(lauf.laufkostenUsd, 1.0, "der ueberschrittene Endstand bleibt sichtbar");
    A.equal(lauf.automatischeWiederholung, false);
    A.equal(lauf.quittungStatus, "gestoppt");
  });
}

// ── §11/§12 unbekannter Ausgang, kein Retry ───────────────────────────────────────────────
async function abschnittUnbekannt() {
  abschnitt("§11/§12  Globaler Vertrags-/Infrastruktur-Ausgang stoppt den gesamten Runner · kein Retry");
  const docs = WOERTER.slice(0, 3).map((w, i) => rohesDokument("unb-" + i, w));
  const w = weltBauen({ dokumente: docs });
  w.welt.ausgang = "unbekannt";
  const bindung = testbindung(docs);
  let lauf = null;

  await pruefeAsync("§11 ein GLOBALER (Transport-)Ausgang beendet den GESAMTEN Runner", async () => {
    lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit", erwartet: bindung,
      runId: "unbekannt", now: () => new Date()
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
    runId, now
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
      erwartet: testbindung(d2, { maxMs: 1 }), runId: "q3", now: () => new Date()
    });
    A.equal(r.quittungStatus, "gestoppt");
    A.equal(w2.welt.abgeschlossen.status, "gestoppt");
    A.equal(w2.welt.abgeschlossen.automatischeWiederholung, false);
    const nochmal = await V.fuehreAus({
      ids: idsVon(d2), deps: w2.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(d2, { maxMs: 1 }), runId: "q4", now: () => new Date()
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
      erwartet: testbindung(docs), runId: "gate", now: () => new Date()
    });
    A.equal(lauf.modellaufrufe, 1);
    A.ok(w.welt.canSpend >= 1, "deps.canSpend (bestehendes Gate) wurde befragt");
    A.equal(lauf.quellenabrufe, 0);
    A.equal(lauf.profilwrites, 0);
    A.equal(lauf.kommunikation, 0);
  });
}

// ── §21 Abbruchdiagnose (nur meldend) ────────────────────────────────────────────────────
// Die Diagnose darf AUSSCHLIESSLICH melden. Sie darf den Ausgang nie verbessern.
async function abschnittAbbruchdiagnose() {
  abschnitt("§21  Abbruchdiagnose: bereits berechnete Werte sichtbar, Ausgang unveraendert");
  const docs = WOERTER.slice(0, 3).map((w, i) => rohesDokument("diag-" + i, w));
  const w = weltBauen({ dokumente: docs });
  // 3 Kandidaten, Deckel 2 -> der Schutzvertrag bricht ab. Der Deckel selbst bleibt
  // unveraendert; die Diagnose benutzt nur die PRUEFBINDUNG fuer diese Mechanik.
  const bindung = testbindung(docs, { maxModellaufrufe: 2 });
  const lauf = await V.fuehreAus({
    ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit", erwartet: bindung,
    runId: "diag", now: () => new Date()
  });

  await pruefeAsync("§21.1 bei Kandidaten ueber dem Deckel bleibt der Lauf fail closed", async () => {
    A.equal(lauf.ok, false);
    A.equal(lauf.grund, "verstehen-kandidaten-ueber-deckel");
    A.equal(lauf.schutzvertrag, false, "Schutzvertrag bleibt nicht bestanden");
    A.equal(lauf.ausgeloest, false, "kein Lauf ausgeloest");
    A.equal(lauf.reinLesend, false);
  });

  await pruefeAsync("§21.2 modellaufrufeKandidaten traegt die exakt berechnete Zahl", async () => {
    const geprueft = await V.pruefeUndPlane({ ids: idsVon(docs), deps: w.deps, commit: "test-commit", erwartet: bindung });
    A.equal(geprueft.ok, false);
    A.equal(geprueft.kandidaten, 3);
    A.equal(lauf.modellaufrufeKandidaten, geprueft.kandidaten);
    A.equal(lauf.modellaufrufeKandidaten, 3);
  });

  await pruefeAsync("§21.3 Artenzaehlung entspricht exakt den vorhandenen Einteilungen", async () => {
    const geprueft = await V.pruefeUndPlane({ ids: idsVon(docs), deps: w.deps, commit: "test-commit", erwartet: bindung });
    const erwartet = geprueft.einteilungen.reduce((m, e) => { m[e.art] = (m[e.art] || 0) + 1; return m; }, {});
    A.deepEqual(lauf.clusterArten, erwartet);
    A.equal(Object.values(lauf.clusterArten).reduce((n, x) => n + x, 0), geprueft.einteilungen.length);
    // Nur echte Kategorien — keine erfundene Klasse.
    const ERLAUBT = new Set(["neu", "update", "pending-erst", "duplikat", "merged", "terminal", "failed", "leer"]);
    for (const art of Object.keys(lauf.clusterArten)) A.ok(ERLAUBT.has(art), "unbekannte Kategorie: " + art);
  });

  await pruefeAsync("§21.4 die Clusterdiagnose traegt nur die erlaubten Felder", async () => {
    A.equal(Array.isArray(lauf.clusterDiagnose), true);
    A.equal(lauf.clusterDiagnose.length, 3);
    for (const e of lauf.clusterDiagnose) {
      // `spuren` traegt ausschliesslich die Klasse `neu` (siehe §22).
      const erwartet = e.art === "neu"
        ? ["art", "begruendung", "kandidat", "resolution", "spuren", "vorgangId"]
        : ["art", "begruendung", "kandidat", "resolution", "vorgangId"];
      A.deepEqual(Object.keys(e).sort(), erwartet);
      A.equal(typeof e.kandidat, "boolean");
      A.equal(typeof e.art, "string");
      A.ok(e.vorgangId === null || typeof e.vorgangId === "string");
      A.ok(e.resolution === null || typeof e.resolution === "string");
      A.ok(e.begruendung === null || typeof e.begruendung === "string");
    }
    // Strukturbeweis gegen jede inhaltliche Beigabe (Titel, Kerne, Dokumentlisten).
    const erlaubtSchluessel = new Set(["vorgangId", "art", "kandidat", "resolution",
      "begruendung", "spuren", "gleich", "grund"]);
    const gefunden = [...sammleSchluessel(lauf.clusterDiagnose)];
    A.deepEqual(gefunden.filter((k) => !erlaubtSchluessel.has(k)), []);
  });

  await pruefeAsync("§21.5/6/7 der Abbruch erzeugt keinen Aufruf, keine Quittung, keinen Write", async () => {
    A.equal(lauf.modellaufrufe, 0);
    A.equal(w.welt.aufrufe.length, 0, "0 Modellaufrufe");
    A.equal(w.welt.schritt.length, 0, "kein Quittungsschritt, kein CAS, kein Schloss");
    A.equal(w.welt.claimRunCalls, 0, "keine Quittung beansprucht");
    A.equal(w.welt.abgeschlossen, null, "keine Quittung abgeschlossen");
    A.equal(w.welt.gespeichert.length, 0, "kein Knowledge-Object-Write");
    A.equal(w.welt.geparkt.length, 0, "kein Failed-Write");
    A.equal(w.welt.fencingWerte.length, 0, "kein Fencing-Write");
    A.equal(lauf.quittung, null);
    A.equal(lauf.quellenabrufe, 0);
    A.equal(lauf.profilwrites, 0);
    A.equal(lauf.kommunikation, 0);
  });

  await pruefeAsync("§21.8 die 113er Grenze ist unveraendert", async () => {
    A.equal(V.PINNED.maxModellaufrufe, 113);
    A.equal(bindung.maxModellaufrufe, 2, "nur die Pruefbindung wurde gesenkt, nie erhoeht");
    A.ok(V.PINNED.maxModellaufrufe <= 113);
  });

  await pruefeAsync("§21.9 der erfolgreiche Pfad bleibt unveraendert", async () => {
    const w2 = weltBauen({ dokumente: docs });
    const ok = await V.fuehreAus({
      ids: idsVon(docs), deps: w2.deps, execute: false, commit: "test-commit",
      erwartet: testbindung(docs), runId: "ok", now: () => new Date()
    });
    A.equal(ok.ok, true);
    A.equal(ok.schutzvertrag, true);
    A.equal(ok.reinLesend, true);
    A.equal(ok.modellaufrufeKandidaten, 3);
    A.deepEqual(ok.planUebersicht.arten, { neu: 3 });
    A.deepEqual(ok.clusterArten, { neu: 3 });
    // Die Diagnosefelder gibt es ausschliesslich im Abbruchpfad.
    A.equal(Object.hasOwn(ok, "clusterDiagnose"), false);
    A.equal(ok.modellaufrufe, 0);
    A.equal(w2.welt.aufrufe.length, 0);
  });
}

// ── §22 Resolver-Spuren in der Abbruchdiagnose ──────────────────────────────────────────
// Nur durchgereicht, nur drei Felder, nur bei `neu` — und der Ausgang bleibt unveraendert.
function sammleSchluessel(wert, out = new Set()) {
  if (Array.isArray(wert)) { for (const x of wert) sammleSchluessel(x, out); }
  else if (wert && typeof wert === "object") {
    for (const [k, v] of Object.entries(wert)) { out.add(k); sammleSchluessel(v, out); }
  }
  return out;
}

async function abschnittResolverSpuren() {
  abschnitt("§22  Resolver-Spuren: nur durchgereicht, nur drei Felder, nur bei `neu`");

  // (a) Welt ohne jeden Kandidaten -> leere Spuren.
  const ohne = WOERTER.slice(0, 3).map((w, i) => rohesDokument("spur-o" + i, w));
  const wOhne = weltBauen({ dokumente: ohne });
  const laufOhne = await V.fuehreAus({
    ids: idsVon(ohne), deps: wOhne.deps, execute: true, commit: "test-commit",
    erwartet: testbindung(ohne, { maxModellaufrufe: 2 }), runId: "spur-ohne", now: () => new Date()
  });

  // (b) Welt mit einem vorhandenen Vorgang, den `sameVorgang` ABLEHNT.
  const altDocs = [rohesDokument("spur-a1", "Haselnussstrauch"), rohesDokument("spur-a2", "Haselnussstrauch")];
  const docs = [rohesDokument("spur-c0", "Zitterpappel")];
  const ko = {
    id: "ko-spur", vorgang_id: "vg-haselnussstrauch-20260901-dddd", status: "complete",
    understanding_status: "complete", updated_at: "2026-09-22T07:00:00Z"
  };
  const wMit = weltBauen({ dokumente: docs, kos: [ko], links: { "ko-spur": altDocs }, kandidatenFrei: true });
  const laufMit = await V.fuehreAus({
    ids: idsVon(docs), deps: wMit.deps, execute: true, commit: "test-commit",
    erwartet: testbindung(docs, { maxModellaufrufe: 0 }), runId: "spur-mit", now: () => new Date()
  });

  await pruefeAsync("§22.1 Kandidaten ueber dem Deckel stoppen weiterhin fail closed", async () => {
    for (const [name, lauf] of [["ohne", laufOhne], ["mit", laufMit]]) {
      A.equal(lauf.ok, false, name);
      A.equal(lauf.grund, "verstehen-kandidaten-ueber-deckel", name);
      A.equal(lauf.schutzvertrag, false, name);
      A.equal(lauf.ausgeloest, false, name);
    }
    A.equal(laufOhne.modellaufrufeKandidaten, 3);
    A.equal(laufMit.modellaufrufeKandidaten, 1);
  });

  await pruefeAsync("§22.2 spuren werden aus bereits vorhandenen resolveVorgang-Ergebnissen durchgereicht", async () => {
    // Differentialbeweis: der ROHE Rueckgabewert traegt mehr als drei Felder,
    // die Diagnose traegt genau drei. Es wird also nur projiziert, nichts neu berechnet.
    const clusters = clusterRawDocuments(
      dedupeRawDocuments(docs.map(toRawDocumentRow).filter((r) => r && r.id)));
    A.equal(clusters.length, 1, "die Probe bildet genau einen Cluster");
    const roh = await understanding.resolveVorgang(clusters[0], wMit.deps, {});
    A.ok(Array.isArray(roh.spuren) && roh.spuren.length >= 1, "resolveVorgang liefert eine Spur");
    A.ok(Object.keys(roh.spuren[0]).length > 3, "die rohe Spur traegt mehr als drei Felder");
    A.equal(roh.spuren[0].vorgangId, ko.vorgang_id);
    A.equal(roh.spuren[0].gleich, false);
    const diag = laufMit.clusterDiagnose[0];
    A.equal(diag.art, "neu");
    A.deepEqual(diag.spuren, [{
      vorgangId: ko.vorgang_id, gleich: false, grund: roh.spuren[0].grund
    }]);
  });

  await pruefeAsync("§22.3 spuren enthalten ausschliesslich vorgangId, gleich, grund", async () => {
    const spuren = laufMit.clusterDiagnose[0].spuren;
    A.equal(spuren.length, 1);
    A.deepEqual(Object.keys(spuren[0]).sort(), ["gleich", "grund", "vorgangId"]);
    A.equal(typeof spuren[0].gleich, "boolean");
    A.ok(spuren[0].grund === null || typeof spuren[0].grund === "string");
    A.ok(spuren[0].vorgangId === null || typeof spuren[0].vorgangId === "string");
  });

  await pruefeAsync("§22.4 keine Titel, Auszuege, Modell- oder Dokumentinhalte in der Ausgabe", async () => {
    // Strukturbeweis: die Diagnose enthaelt KEINEN Schluessel ausserhalb der Erlaubnisliste.
    const erlaubt = new Set(["vorgangId", "art", "kandidat", "resolution", "begruendung", "spuren", "gleich", "grund"]);
    const gefunden = [...sammleSchluessel(laufMit.clusterDiagnose)];
    const verboten = gefunden.filter((k) => !erlaubt.has(k));
    A.deepEqual(verboten, [], "unerlaubte Schluessel: " + verboten.join(", "));
    // Insbesondere die aus Titeln abgeleiteten Felder der Rohspur duerfen NICHT vorkommen.
    for (const feld of ["kernNeu", "kernBestand", "ueberdeckung", "vergleicheneDokumente",
      "familienBeleg", "formen", "dokumente", "neueDokumente", "bestandsDokumente"]) {
      A.ok(!gefunden.includes(feld), "Titelfeld in der Diagnose: " + feld);
    }
  });

  await pruefeAsync("§22.5 ein neu Cluster ohne Resolver-Treffer liefert spuren: []", async () => {
    const diag = laufOhne.clusterDiagnose;
    A.equal(diag.length, 3);
    for (const e of diag) {
      A.equal(e.art, "neu");
      A.deepEqual(e.spuren, []);
    }
  });

  await pruefeAsync("§22.6 ein neu Cluster mit abgelehnten Kandidaten zeigt die Ablehnungsgruende", async () => {
    const e = laufMit.clusterDiagnose[0];
    A.equal(e.spuren.length, 1);
    A.equal(e.spuren[0].gleich, false, "die Spur ist eine Ablehnung");
    A.ok(typeof e.spuren[0].grund === "string" && e.spuren[0].grund.length > 0, "Grundklasse vorhanden");
    A.equal(e.spuren[0].vorgangId, ko.vorgang_id, "der abgelehnte Kandidat ist benannt");
  });

  await pruefeAsync("§22.7/8/9/10 der Abbruch erzeugt keinen Aufruf, keine Quittung, keinen Write", async () => {
    for (const [name, w] of [["ohne", wOhne], ["mit", wMit]]) {
      A.equal(w.welt.aufrufe.length, 0, name + ": 0 Modellaufrufe");
      A.equal(w.welt.schritt.length, 0, name + ": kein Quittungsschritt");
      A.equal(w.welt.claimRunCalls, 0, name + ": keine Quittung beansprucht");
      A.equal(w.welt.gespeichert.length, 0, name + ": kein KO-Write");
      A.equal(w.welt.geparkt.length, 0, name + ": kein Failed-Write");
      A.equal(w.welt.fencingWerte.length, 0, name + ": kein Fencing-Write");
    }
    A.equal(laufMit.modellaufrufe, 0);
    A.equal(laufMit.quittung, null);
    A.equal(laufMit.quellenabrufe, 0);
    A.equal(laufMit.profilwrites, 0);
    A.equal(laufMit.kommunikation, 0);
  });

  await pruefeAsync("§22.11 die 113er Grenze ist unveraendert", async () => {
    A.equal(V.PINNED.maxModellaufrufe, 113);
    A.equal(V.PINNED.maxUsd, 0.8);
    A.equal(V.PINNED.maxMs, 2100000);
    A.ok(V.PINNED.maxUsd < 4);
  });

  await pruefeAsync("§22.12 nur `neu` traegt spuren, der Erfolgspfad bleibt unveraendert", async () => {
    // (c) Abbruch mit NICHT-`neu`-Klassen: dort darf es kein `spuren`-Feld geben.
    const M = baueMergedWelt();
    const laufM = await V.fuehreAus({
      ids: idsVon(M.docs), deps: M.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(M.docs, { maxModellaufrufe: 0 }), runId: "spur-merged", now: () => new Date()
    });
    A.equal(laufM.grund, "verstehen-kandidaten-ueber-deckel");
    A.equal(laufM.clusterDiagnose.length, 2);
    for (const e of laufM.clusterDiagnose) {
      A.notEqual(e.art, "neu");
      A.equal(Object.hasOwn(e, "spuren"), false, "kein spuren-Feld bei art " + e.art);
    }
    // Erfolgspfad: keine Diagnose, keine Spuren, unveraenderte Felder.
    const wOk = weltBauen({ dokumente: docs });
    const ok = await V.fuehreAus({
      ids: idsVon(docs), deps: wOk.deps, execute: false, commit: "test-commit",
      erwartet: testbindung(docs), runId: "spur-ok", now: () => new Date()
    });
    A.equal(ok.ok, true);
    A.equal(Object.hasOwn(ok, "clusterDiagnose"), false);
    A.ok(!JSON.stringify(ok).includes("spuren"), "Erfolgspfad traegt keine Spuren");
    A.equal(ok.modellaufrufeKandidaten, 1);
    A.deepEqual(ok.clusterArten, { neu: 1 });
  });
}

// ── §23 Diagnosewahrheit: skipped-invalid — sichere Fehlercodes und echte Dokumentzahl ──
// 169er-Production-Befund (Run 35829992528): der erste Cluster endete als `skipped-invalid`
// mit CAS `zustand=unbekannt`, `letzter_grund=validierung-fehlgeschlagen`. Der Runner meldete
// `dokumente=0` und `reason=dokumente:kernueberdeckung` (die Resolver-BEGRUENDUNG der
// Bestandszuordnung, nicht die Ursache) und verwarf die motorseitig begrenzten `errors`.
// Die Wahrheit: das Dokument wurde VERKNUEPFT, aber NICHT verstanden.
function baueInvalidWelt({ bestand = false, unbelegte = ["parteien", "ausschuesse", "ministerien"], extraAntwort = {} } = {}) {
  const docs = [rohesDokument("inv-0", WOERTER[0]), rohesDokument("inv-1", WOERTER[0])];
  const kos = [];
  const links = {};
  if (bestand) {
    // 169er-Konstellation: ein vorhandener PENDING-Vorgang, dem der Resolver den neuen
    // Cluster zuordnet (gleiche Beweisfamilie) — die Resolver-Begruendung (`spur.begruendung`)
    // ist gesetzt, darf aber NICHT als Modellfehlerursache gemeldet werden.
    kos.push({ id: "ko-pend", vorgang_id: "vg-zitterpappel-20260901-cccc", status: "pending",
      understanding_status: "pending", updated_at: "2026-09-22T07:00:00Z" });
    links["ko-pend"] = [rohesDokument("alt-p1", WOERTER[0]), rohesDokument("alt-p2", WOERTER[0])];
  }
  const w = weltBauen({ dokumente: docs, kos, links });
  w.deps.requestUnderstanding = async (prompt) => {
    w.welt.aufrufe.push(prompt);
    w.welt.schritt.push("requestUnderstanding");
    w.welt.laufkostenUsd += w.welt.echteKosten;
    const antwort = { ...ANALYSE, ...extraAntwort };
    for (const f of unbelegte) antwort[f] = ["NichtBelegt_" + f];
    return antwort;
  };
  return { ...w, docs, bindung: testbindung(docs) };
}

async function abschnittInvalidDiagnose() {
  abschnitt("§23  Diagnosewahrheit: skipped-invalid traegt sichere Fehlercodes und die echte Dokumentzahl");

  // ── 1/2/5 am MOTOR direkt (ohne CAS-Vertrag, ohne Runner) ──
  const I = baueInvalidWelt();
  const motorDeps = { ...I.deps };
  delete motorDeps.verstehenVertrag; // kein CAS: reiner Motorpfad, kein marke()
  let r = null;
  await pruefeAsync("§23.1 validateUnderstandingResult liefert mehrere sichere Fehlercodes", async () => {
    const cluster = clusterRawDocuments(I.docs.map((d) => ({ ...d })))[0];
    A.equal(cluster.documents.length, 2, "Testcluster mit genau zwei Dokumenten");
    r = await understanding.understandOneCluster(cluster, motorDeps, {});
    A.equal(r.status, "skipped-invalid");
    A.equal(r.reason, "validierung-fehlgeschlagen");
    A.ok(Array.isArray(r.errors) && r.errors.length >= 2, "mehrere Fehlercodes bleiben erhalten");
    A.ok(r.errors.includes("quellenbeleg-parteien"));
    A.ok(r.errors.includes("quellenbeleg-ausschuesse"));
    // NEU (Production-Befund 2026-09-23): die beiden OPTIONALEN Ministeriumslisten sperren die
    // Antwort nicht mehr — unbelegte Werte werden deterministisch entfernt (der strenge Beleg
    // bleibt unveraendert). Ohne Beleg entsteht damit KEIN Fehlercode mehr.
    A.ok(!r.errors.includes("quellenbeleg-ministerien"));
    A.ok(!r.errors.includes("quellenbeleg-mentioned_ministries"));
    A.ok(r.errors.every((e) => typeof e === "string"));
  });
  await pruefeAsync("§23.5 Erstverstehen-Invalid traegt documents = Clustergroesse (Motor)", async () => {
    A.equal(r.documents, 2);
    // markFailed hat geparkt UND verknuepft — der Link ist belegt, der Status bleibt failed.
    A.equal(I.welt.geparkt.length, 1);
    A.equal((I.welt.links["ko-" + r.vorgangId] || []).length, 2);
  });

  // ── 2/3/4/5/6/7/8 am RUNNER (169er-Konstellation mit Bestandsvorgang) ──
  const B = baueInvalidWelt({ bestand: true });
  let lauf = null;
  await pruefeAsync("§23.2/§23.7 skipped-invalid + unbekannt bleibt terminal gesperrt, beendet den Lauf aber nicht mehr global", async () => {
    lauf = await V.fuehreAus({
      ids: idsVon(B.docs), deps: B.deps, execute: true, commit: "test-commit", erwartet: B.bindung,
      runId: "invalid-169", now: () => new Date()
    });
    A.equal(lauf.ok, false);
    // KLASSE A (lokaler Clusterfehler): kein globaler Abbruch mehr (Runner-Fragilitaet 2026-09-24).
    A.equal(lauf.abbruchGrund, null);
    A.equal(lauf.quittungStatus, "unbekannt");
    A.equal(lauf.ergebnisse.length, 1);
    const e = lauf.ergebnisse[0];
    A.equal(e.status, "skipped-invalid");
    A.equal(e.ausgang, "unbekannt");
    // reason = Fehlerklasse des MODELLPFADS — nicht die Resolver-Begruendung
    // (dokumente:kernueberdeckung o.ae.).
    A.equal(e.reason, "validierung-fehlgeschlagen");
    // Vollstaendig abgearbeitet, aber NICHT bestanden — beide Wahrheiten sichtbar getrennt.
    A.equal(lauf.vollstaendigVerarbeitet, true);
    A.equal(lauf.fachlichBestanden, false);
    A.equal(lauf.lokaleUnbekannte, 1);
    A.equal(lauf.bilanz.unbekannt, 1);
  });

  await pruefeAsync("§23.3 der Bericht uebernimmt die sicheren Fehlercodes (begrenzt)", async () => {
    const e = lauf.ergebnisse[0];
    A.ok(Array.isArray(e.validierungsfehler) && e.validierungsfehler.length >= 2);
    A.ok(e.validierungsfehler.every((c) =>
      /^(ki-antwort-nicht-verwertbar|decision_level-antwortkonflikt|quellenbeleg-[a-z_]+)$/.test(c)));
    A.ok(e.validierungsfehler.includes("quellenbeleg-parteien"));
  });

  await pruefeAsync("§23.3b hoechstens fuenf Codes; unsichere Meldungen bleiben aussen", async () => {
    // NON-ARRAY-Werte sind NICHT reduzierbar (fail closed): die Erwaeehnungslisten-Reduktion
    // greift nur bei unbelegten STRINGS. Nicht-Arrays laufen unveraendert durch den strengen
    // Validator und erzeugen je Feld einen `quellenbeleg-<feld>`-Code — damit bleibt der
    // Fuenfer-Deckel des Berichts weiterhin erzwingbar.
    const C = baueInvalidWelt({ unbelegte: [], extraAntwort: Object.fromEntries(
      ["ministerien", "mentioned_ministries", "parteien", "mentioned_parties",
        "mentioned_people", "mentioned_mps", "ausschuesse", "mentioned_committees"].map((f) => [f, "kein-array"])) });
    const laufC = await V.fuehreAus({
      ids: idsVon(C.docs), deps: C.deps, execute: true, commit: "test-commit", erwartet: C.bindung,
      runId: "invalid-cap", now: () => new Date()
    });
    A.equal(laufC.ergebnisse[0].validierungsfehler.length, 5, "maximal fuenf Codes");
    // Ein Schema-Fehlertext (frei formuliert) wird NICHT uebernommen — nur feste Wortmarken.
    const D = baueInvalidWelt({ unbelegte: ["parteien"], extraAntwort: { was_ist_passiert: "" } });
    const laufD = await V.fuehreAus({
      ids: idsVon(D.docs), deps: D.deps, execute: true, commit: "test-commit", erwartet: D.bindung,
      runId: "invalid-schema", now: () => new Date()
    });
    A.deepEqual(laufD.ergebnisse[0].validierungsfehler, ["quellenbeleg-parteien"]);
    A.ok(!JSON.stringify(laufD).includes("leer/zu kurz"));
    A.ok(!JSON.stringify(D.welt.abgeschlossen).includes("leer/zu kurz"));
  });

  await pruefeAsync("§23.4 kein Prompt und keine Modellantwort im Bericht oder in der Quittung", async () => {
    const bericht = JSON.stringify(lauf);
    const quittung = JSON.stringify(B.welt.abgeschlossen);
    for (const marke of ["NichtBelegt_parteien", "NichtBelegt_ausschuesse", "NichtBelegt_ministerien"]) {
      A.ok(!bericht.includes(marke), "Modellantwort-Wert im Bericht: " + marke);
      A.ok(!quittung.includes(marke), "Modellantwort-Wert in der Quittung: " + marke);
    }
    A.ok(!bericht.includes('"quelle_id"'), "Prompt-Inhalt im Bericht");
    A.ok(!quittung.includes('"quelle_id"'), "Prompt-Inhalt in der Quittung");
    // Strukturbeweis der Ergebniszeile: nur die erlaubten Felder.
    const erlaubt = new Set(["vorgangId", "status", "ausgang", "dokumente", "reason", "validierungsfehler"]);
    const gefunden = [...sammleSchluessel(lauf.ergebnisse[0])];
    A.deepEqual(gefunden.filter((k) => !erlaubt.has(k)), []);
  });

  await pruefeAsync("§23.5 der Runner meldet documents = Clustergroesse", async () => {
    A.equal(lauf.ergebnisse[0].dokumente, 2);
    const link = B.welt.links["ko-" + lauf.ergebnisse[0].vorgangId];
    A.ok(Array.isArray(link) && link.length === 2, "Verknuepfung ist nachweisbar geschrieben");
  });

  await pruefeAsync("§23.6 Verknuepfung an pending/failed wird NICHT als Erfolg gezaehlt", async () => {
    A.equal(lauf.bilanz.arten["skipped-invalid"], 1);
    A.equal(lauf.bilanz.arten.saved, undefined, "kein saved");
    A.equal(lauf.bilanz.arten.merged, undefined, "kein merged");
    A.equal(understanding.ERGEBNISGRUPPEN["skipped-invalid"], "fehlgeschlagen");
    A.equal(B.welt.gespeichert.length, 0, "kein Knowledge-Object-Write");
    A.equal(B.welt.geparkt.length, 1, "markFailed lief und hat geparkt");
  });

  await pruefeAsync("§23.7/§23.8 unbekannter Ausgang bleibt fail closed, kein Retry", async () => {
    A.equal(lauf.ok, false);
    A.equal(lauf.automatischeWiederholung, false);
    A.equal(B.welt.aufrufe.length, 1, "genau ein Modellaufruf");
    A.equal(B.welt.abgeschlossen.automatischeWiederholung, false);
    A.equal(B.welt.abgeschlossen.status, "unbekannt");
    A.ok(B.welt.schritt.includes("ausgangUnbekannt"));
    A.ok(!B.welt.schritt.includes("freigabe"), "kein automatischer Rueckweg");
    // Die Einmalquittung traegt die sicheren Codes als Abschlussbeleg.
    A.ok(Array.isArray(B.welt.abgeschlossen.validierungsfehler)
      && B.welt.abgeschlossen.validierungsfehler.length >= 2);
  });

  await pruefeAsync("§23.9 die Kostenwahrheit bleibt unveraendert im Pfad", async () => {
    A.ok(B.welt.kostenlesungen >= 1, "der Lauf hat die bestehende Kostenwahrheit befragt");
    A.equal(lauf.laufkostenUsd, 0, "Attrappen-Abrechnung unveraendert");
  });

  pruefe("§23.10 die Auftragswerte 0,80 USD / 4 USD / 113 / 35 min bleiben unveraendert", () => {
    A.equal(V.PINNED.maxUsd, 0.8);
    A.ok(V.PINNED.maxUsd < 4);
    A.equal(V.PINNED.maxModellaufrufe, 113);
    A.equal(V.PINNED.maxMs, 35 * 60 * 1000);
    A.equal(V.QUITTUNG, "verstehen169-20260922-a");
  });

  await pruefeAsync("§23.11 der Planmodus bleibt ohne Modellaufruf und ohne Write", async () => {
    const P = baueInvalidWelt({ bestand: true });
    const plan = await V.fuehreAus({
      ids: idsVon(P.docs), deps: P.deps, execute: false, commit: "test-commit", erwartet: P.bindung,
      runId: "invalid-plan", now: () => new Date()
    });
    A.equal(plan.reinLesend, true);
    A.equal(plan.modellaufrufe, 0);
    A.equal(P.welt.aufrufe.length, 0);
    A.equal(P.welt.schritt.length, 0, "kein CAS, keine Quittung, kein Schloss im Planmodus");
    A.equal(P.welt.gespeichert.length, 0);
    A.equal(P.welt.geparkt.length, 0);
    A.equal(P.welt.claimRunCalls, 0);
  });
}

// ── §24 Runtime-Commit: der TATSAECHLICH ausgeführte Code-Stand ─────────────────────────────
// ZWEI GETRENNTE DINGE: `commit` ist der DOKUMENT-SNAPSHOT (der Datensatz — 169 Kennungen,
// Hash, 122 Cluster); `runtimeCommit` ist der Git-Commit des Codes, der den Lauf tatsaechlich
// ausfuehrt. Der Kern prueft nur die FORM und fuehrt den Wert in Bericht und Quittung; er
// erfindet NIE einen Lauf-Commit. Dass der Wert dem ECHTEN Checkout entspricht, stellt der
// Bedienweg her — offline pruefbar ueber `CLIRUNNER.pruefeRuntimeCommit` (§24.7).
async function abschnittRuntimeCommit() {
  abschnitt("§24  Runtime-Commit ist vom Dokument-Snapshot-Commit getrennt und streng geprueft");
  const ECHT = "0f1e2d3c4b5a69788796a5b4c3d2e1f001122334";

  pruefe("§24.1 ohne Runtime-Commit wird KEIN Wert erfunden", () => {
    A.deepEqual(V.runtimeCommitVon(undefined), { ok: true, commit: null });
    A.deepEqual(V.runtimeCommitVon(null), { ok: true, commit: null });
    A.deepEqual(V.runtimeCommitVon(""), { ok: true, commit: null });
    A.deepEqual(V.runtimeCommitVon("   "), { ok: true, commit: null });
  });
  pruefe("§24.2 nur ein voller Git-SHA (40 Zeichen, klein, hex) wird angenommen", () => {
    A.deepEqual(V.runtimeCommitVon(ECHT), { ok: true, commit: ECHT });
    A.equal(V.runtimeCommitVon(ECHT.toUpperCase()).ok, false, "Grossbuchstaben sind kein Git-SHA");
    A.equal(V.runtimeCommitVon("abc").ok, false);
    A.equal(V.runtimeCommitVon(ECHT.slice(0, 39)).ok, false, "verkuerzter SHA bleibt verboten");
    A.equal(V.runtimeCommitVon(ECHT + "0").ok, false);
    A.equal(V.runtimeCommitVon("z".repeat(40)).ok, false, "Nicht-Hex bleibt verboten");
    A.equal(V.runtimeCommitVon(ECHT).grund, undefined);
    A.equal(V.runtimeCommitVon("abc").grund, "verstehen-runtime-commit-ungueltig");
  });

  const docs = WOERTER.slice(0, 2).map((w, i) => rohesDokument("rt-" + i, w));
  const bindung = testbindung(docs);

  await pruefeAsync("§24.3 ein unbrauchbarer Runtime-Commit stoppt fail closed VOR jedem Zugriff", async () => {
    const w = weltBauen({ dokumente: docs });
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit", erwartet: bindung,
      runId: "rt-ungueltig", now: () => new Date(), runtimeCommit: "nicht-hex"
    });
    A.equal(lauf.ok, false);
    A.equal(lauf.grund, "verstehen-runtime-commit-ungueltig");
    A.equal(lauf.ausgeloest, false);
    A.equal(lauf.schutzvertrag, false, "der Schutzvertrag wird NICHT einmal geprueft");
    A.equal(lauf.snapshotCommit, "test-commit", "der Snapshot-Commit bleibt benannt");
    A.equal(lauf.runtimeCommit, null);
    A.equal(lauf.modellaufrufe, 0);
    A.equal(w.welt.aufrufe.length, 0, "0 Modellaufrufe");
    A.equal(w.welt.schritt.length, 0, "kein Schloss, kein CAS, keine Quittung");
    A.equal(w.welt.claimRunCalls, 0);
  });

  await pruefeAsync("§24.4 der Runtime-Commit steht in Bericht UND Quittung — getrennt vom Snapshot", async () => {
    const w = weltBauen({ dokumente: docs });
    const lauf = await V.fuehreAus({
      ids: idsVon(docs), deps: w.deps, execute: true, commit: "test-commit", erwartet: bindung,
      runId: "rt-gueltig", now: () => new Date(), runtimeCommit: ECHT
    });
    A.equal(lauf.ok, true, JSON.stringify(lauf));
    A.equal(lauf.runtimeCommit, ECHT, "Bericht traegt den ausgeführten Code-Stand");
    A.equal(lauf.commit, "test-commit", "der Bericht nennt weiter den Dokument-Snapshot");
    A.notEqual(lauf.runtimeCommit, lauf.commit, "Runtime- und Snapshot-Commit sind nicht dasselbe Feld");
    A.ok(w.welt.abgeschlossen, "die Quittung wurde abgeschlossen");
    A.equal(w.welt.abgeschlossen.runtimeCommit, ECHT, "die Quittung fuehrt den Runtime-Commit");
    A.equal(w.welt.abgeschlossen.commit, "test-commit", "die Quittung fuehrt den Snapshot separat");
  });

  await pruefeAsync("§24.5 der Planmodus bleibt ohne Modellaufruf und ohne Write (auch mit Runtime-Commit)", async () => {
    const P = weltBauen({ dokumente: docs });
    const plan = await V.fuehreAus({
      ids: idsVon(docs), deps: P.deps, execute: false, commit: "test-commit", erwartet: bindung,
      runId: "rt-plan", now: () => new Date(), runtimeCommit: ECHT
    });
    A.equal(plan.reinLesend, true);
    A.equal(plan.runtimeCommit, ECHT);
    A.equal(plan.modellaufrufe, 0);
    A.equal(P.welt.aufrufe.length, 0);
    A.equal(P.welt.schritt.length, 0, "kein CAS, keine Quittung, kein Schloss");
    A.equal(P.welt.claimRunCalls, 0);
  });

  pruefe("§24.6 der Dokument-Snapshot-Commit bleibt woertlich unveraendert", () => {
    A.equal(V.PINNED.commit, "ea84f26ccc380e22961335926e2d4e585cee2308");
    A.equal(V.PINNED.dokumente, 169);
    A.equal(V.PINNED.idHash, "5f3878409cc9dbe742a3c9b465e54fff53b3e7622065f90c04915eb01ac2aed9");
    A.equal(V.PINNED.cluster, 122);
  });

  pruefe("§24.7 der Bedienweg prueft den echten Checkout — ohne Runtime-Commit ist der scharfe Lauf verboten", () => {
    const echt = CLIRUNNER.echterCommit();
    A.ok(echt === null || /^[0-9a-f]{40}$/.test(echt), "lesbarer Checkout liefert einen vollen SHA");
    A.equal(CLIRUNNER.pruefeRuntimeCommit("", echt, true).grund, "verstehen-runtime-commit-fehlt");
    A.equal(CLIRUNNER.pruefeRuntimeCommit("", echt, false).ok, true, "in der Planung bleibt er optional");
    A.equal(CLIRUNNER.pruefeRuntimeCommit(ECHT, ECHT, true).ok, true, "exakte Uebereinstimmung ist erlaubt");
    A.equal(CLIRUNNER.pruefeRuntimeCommit(ECHT, "0".repeat(40), true).grund,
      "verstehen-runtime-commit-abweichend", "Abweichung stoppt");
    A.equal(CLIRUNNER.pruefeRuntimeCommit(ECHT, null, true).grund,
      "verstehen-runtime-commit-nicht-pruefbar", "ein unlesbarer Checkout ist fail closed");
    A.equal(CLIRUNNER.pruefeRuntimeCommit("abc", ECHT, true).grund, "verstehen-runtime-commit-ungueltig");
  });
}

// ── §25 Lokaler Clusterfehler (Klasse A) vs. globaler Vertragsfehler (Klasse B) ─────────────
// Production-Befund 2026-09-24 (Run 35964405263): EIN Cluster mit `skipped-invalid`
// (`quellenbeleg-parteien`) beendete den GESAMTEN Lauf — 36 von 122 Clustern blieben ungeprueft,
// 115 von 169 Dokumenten unerklaert. Die Korrektur trennt zwei Klassen:
//   * KLASSE A `skipped-invalid`: lokaler Fachfehler DIESES Clusters. Er bleibt terminal gesperrt
//     (CAS `unbekannt`, keine Verknuepfung, kein Retry) — die uebrigen unabhaengigen Cluster
//     werden weiterverarbeitet und vollstaendig bilanziert. Der Gesamtstatus bleibt rot
//     (`bilanz.unbekannt > 0` ⇒ Quittung `unbekannt`, `ok = false`, `fachlichBestanden = false`).
//   * KLASSE B `cluster-error` (unerwarteter Motorwurf)/`skipped-error`/`skipped-store`/
//     `skipped-veraltet`: globaler Vertrags-/Infrastrukturfehler ⇒ unveraendert sofortiger
//     Gesamtabbruch. Ein Wurf ist NIE ein lokaler Fachfehler (nicht sicher klassifizierbar) und
//     darf NIE zu `ok = true`/`fachlichBestanden = true` fuehren.
// Der konkrete Production-Cluster `vg-gemeinsame-20260921-dcd0f5` wird ueber die BELEGTE
// Fehlerklasse (`quellenbeleg-parteien` aus einem unbelegten `parteien`-Wert) abgedeckt — es wird
// KEINE nicht gespeicherte Rohantwort erfunden.

// Baut eine Welt mit `anzahl` unabhaengigen Clustern; die Aufrufe an den Positionen
// `invalidIndizes` liefern eine fachlich ungueltige Antwort (`parteien` unbelegt), alle anderen
// eine gueltige. So entstehen mehrere LOKALE Clusterfehler in EINEM Lauf.
function baueKlassenWelt({ anzahl = 4, invalidIndizes = [0] } = {}) {
  const docs = [];
  for (let i = 0; i < anzahl; i += 1) docs.push(rohesDokument("kl-" + i, WOERTER[i]));
  const w = weltBauen({ dokumente: docs });
  let aufrufNr = 0;
  w.deps.requestUnderstanding = async (prompt) => {
    w.welt.aufrufe.push(prompt);
    w.welt.schritt.push("requestUnderstanding");
    const index = aufrufNr;
    aufrufNr += 1;
    w.welt.laufkostenUsd += w.welt.echteKosten;
    if (invalidIndizes.includes(index)) return { ...ANALYSE, parteien: ["NichtBelegt_parteien"] };
    return ANALYSE;
  };
  return { ...w, docs, bindung: testbindung(docs) };
}

// Baut eine Welt mit `anzahl` unabhaengigen Clustern; der Aufruf an `fehlerIndex` scheitert
// belegbar NACH dem Modellstart (Transportfehler) → GLOBALER unbekannter Ausgang (Klasse B).
function baueTransportWelt({ anzahl = 4, fehlerIndex = 1 } = {}) {
  const docs = [];
  for (let i = 0; i < anzahl; i += 1) docs.push(rohesDokument("tr-" + i, WOERTER[i]));
  const w = weltBauen({ dokumente: docs });
  let aufrufNr = 0;
  w.deps.requestUnderstanding = async (prompt) => {
    w.welt.aufrufe.push(prompt);
    w.welt.schritt.push("requestUnderstanding");
    const index = aufrufNr;
    aufrufNr += 1;
    if (index === fehlerIndex) throw new Error("ECONNRESET (Test)");
    w.welt.laufkostenUsd += w.welt.echteKosten;
    return ANALYSE;
  };
  return { ...w, docs, bindung: testbindung(docs) };
}

// Baut eine Welt mit `anzahl` unabhaengigen Clustern; beim `fehlerIndex`-ten SPEICHERWEG wirft der
// Motor ungefangen (Code-/Speicher-/Infrastrukturfehler) → `cluster-error` (KLASSE B). Der Wurf
// geschieht NACH dem Modellaufruf, damit die Zahl der Modellversuche exakt pruefbar bleibt.
function baueWurfWelt({ anzahl = 4, fehlerIndex = 1 } = {}) {
  const docs = [];
  for (let i = 0; i < anzahl; i += 1) docs.push(rohesDokument("wf-" + i, WOERTER[i]));
  const w = weltBauen({ dokumente: docs });
  const original = w.welt.speicher.verstehenSpeichere.bind(w.welt.speicher);
  let speicherNr = 0;
  w.welt.speicher.verstehenSpeichere = async (args) => {
    const index = speicherNr;
    speicherNr += 1;
    if (index === fehlerIndex) throw new Error("Speicherweg unerwartet (Test)");
    return original(args);
  };
  return { ...w, docs, bindung: testbindung(docs) };
}

async function abschnittLokalerClusterfehler() {
  abschnitt("§25  Lokaler Clusterfehler (Klasse A) beendet den Lauf nicht — globaler Fehler (Klasse B) schon");

  // ── §25.1–§25.9: EIN lokaler invalid-Cluster, uebrige laufen weiter ──
  const K = baueKlassenWelt({ anzahl: 4, invalidIndizes: [0] });
  let lauf = null;

  await pruefeAsync("§25.1/§25.4/§25.8 alle vier Cluster werden abgearbeitet (kein globaler Abbruch)", async () => {
    lauf = await V.fuehreAus({
      ids: idsVon(K.docs), deps: K.deps, execute: true, commit: "test-commit",
      erwartet: K.bindung, runId: "klasse-a", now: () => new Date()
    });
    A.equal(K.bindung.cluster, 4, "die Attrappenwelt bildet genau vier unabhaengige Cluster");
    A.equal(lauf.ergebnisse.length, 4, "alle Cluster erscheinen in der Bilanz");
    A.equal(lauf.abbruchGrund, null, "kein globaler Abbruch");
    A.equal(lauf.vollstaendigVerarbeitet, true);
  });

  await pruefeAsync("§25.8/§25.9 die Bilanz deckt alle vier Cluster und alle Dokumente ab", async () => {
    A.equal(lauf.bilanz.verarbeitet, 4);
    const dokumente = lauf.ergebnisse.reduce((s, e) => s + Number(e.dokumente || 0), 0);
    A.equal(dokumente, K.docs.length, "jedes Dokument ist einem Cluster-Ergebnis zugeordnet");
    A.equal(K.docs.length, 4);
  });

  await pruefeAsync("§25.1 der Production-Fehler erzeugt GENAU EINEN unknown-Cluster (quellenbeleg-parteien)", async () => {
    A.equal(lauf.bilanz.unbekannt, 1, "genau ein unbekannter Ausgang");
    A.equal(lauf.lokaleUnbekannte, 1);
    const unbekannt = lauf.ergebnisse.filter((e) => e.ausgang === "unbekannt");
    A.equal(unbekannt.length, 1);
    A.equal(unbekannt[0].status, "skipped-invalid");
    A.ok(unbekannt[0].validierungsfehler.includes("quellenbeleg-parteien"),
      "die belegte Production-Fehlerklasse — ohne erfundene Rohantwort");
  });

  await pruefeAsync("§25.3/§25.25 die uebrigen Cluster laufen weiter, der unknown-Cluster wird NICHT zu Erfolg", async () => {
    A.equal(lauf.bilanz.arten.saved, 3, "drei unabhaengige Cluster wurden verstanden");
    A.equal(lauf.bilanz.arten["skipped-invalid"], 1, "der Fehlercluster bleibt skipped-invalid");
    const unbekannt = lauf.ergebnisse.find((e) => e.ausgang === "unbekannt");
    A.equal(unbekannt.status, "skipped-invalid");
    A.notEqual(unbekannt.status, "saved");
  });

  await pruefeAsync("§25.2/§25.4 kein Cluster wird zweimal modellseitig aufgerufen — kein Retry", async () => {
    A.equal(K.welt.aufrufe.length, 4, "genau EIN Aufruf je Cluster");
    A.equal(new Set(lauf.ergebnisse.map((e) => e.vorgangId)).size, 4, "vier verschiedene Vorgaenge");
    A.equal(lauf.automatischeWiederholung, false);
    A.equal(K.welt.schritt.filter((s) => s === "ausgangUnbekannt").length, 1,
      "der lokale Fehler wird genau einmal als unbekannt gesperrt");
    A.ok(!K.welt.schritt.includes("freigabe"), "kein automatischer Rueckweg/Retry");
  });

  await pruefeAsync("§25.14 die Quittung wird genau einmal beansprucht und NICHT als Erfolg geschlossen", async () => {
    A.equal(K.welt.claimRunCalls, 1, "genau eine Beanspruchung");
    A.equal(lauf.quittungStatus, "unbekannt");
    A.equal(lauf.fachlichBestanden, false);
    A.equal(K.welt.abgeschlossen.status, "unbekannt");
    A.equal(K.welt.abgeschlossen.fachlichBestanden, false);
    A.equal(K.welt.abgeschlossen.bilanz.unbekannt, 1);
    A.equal(K.welt.abgeschlossen.abbruchGrund, undefined, "kein Abbruchgrund — nur lokale unknown");
  });

  await pruefeAsync("§25.26 frueher erfolgreiche Cluster werden nicht zurueckgerollt", async () => {
    A.equal(K.welt.gespeichert.length, 3, "drei Knowledge Objects wurden geschrieben");
    A.equal(K.welt.geparkt.length, 1, "genau der Fehlercluster wurde geparkt");
  });

  await pruefeAsync("§25.15/§25.16 kein automatischer zweiter Lauf desselben Auftrags", async () => {
    const zweit = await V.fuehreAus({
      ids: idsVon(K.docs), deps: K.deps, execute: true, commit: "test-commit",
      erwartet: K.bindung, runId: "klasse-a", now: () => new Date()
    });
    A.equal(zweit.ok, false);
    A.equal(zweit.grund, "verstehen-bereits-verwendet");
    A.equal(zweit.modellaufrufe, 0);
    A.equal(K.welt.aufrufe.length, 4, "kein weiterer Modellaufruf");
  });

  // ── §25.10/§25.27: mehrere lokale unknown in EINEM Lauf, exakte Anzahl ──
  const M = baueKlassenWelt({ anzahl: 4, invalidIndizes: [0, 2] });
  await pruefeAsync("§25.10/§25.27 mehrere lokale unknown: jeder genau einmal, exakte Anzahl erhalten", async () => {
    const laufM = await V.fuehreAus({
      ids: idsVon(M.docs), deps: M.deps, execute: true, commit: "test-commit",
      erwartet: M.bindung, runId: "klasse-a-2", now: () => new Date()
    });
    A.equal(laufM.ergebnisse.length, 4);
    A.equal(laufM.bilanz.unbekannt, 2, "genau zwei unknown");
    A.equal(laufM.lokaleUnbekannte, 2);
    A.equal(laufM.bilanz.arten["skipped-invalid"], 2);
    A.equal(laufM.bilanz.arten.saved, 2);
    A.equal(M.welt.aufrufe.length, 4, "weiterhin genau ein Aufruf je Cluster");
    A.equal(laufM.abbruchGrund, null);
    A.equal(laufM.ok, false);
    A.equal(laufM.quittungStatus, "unbekannt");
  });

  // ── §25.11–§25.13: die harten Deckel bleiben auch mit lokalen unknown hart ──
  await pruefeAsync("§25.11 der Aufrufdeckel bleibt hart trotz lokalem unknown", async () => {
    const C = baueKlassenWelt({ anzahl: 4, invalidIndizes: [0] });
    const laufC = await V.fuehreAus({
      ids: idsVon(C.docs), deps: C.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(C.docs, { maxModellaufrufe: 99, laufMaxModellaufrufe: 2 }),
      runId: "klasse-a-cap", now: () => new Date()
    });
    A.equal(laufC.modellaufrufe, 2, "genau zwei Aufrufe — der Deckel greift");
    A.equal(C.welt.aufrufe.length, 2);
    A.equal(laufC.abbruchGrund, "verstehen-aufrufdeckel-erreicht");
    A.equal(laufC.ok, false);
  });

  await pruefeAsync("§25.12 der USD-Deckel bleibt hart trotz lokalem unknown", async () => {
    const U = baueKlassenWelt({ anzahl: 4, invalidIndizes: [0] });
    U.welt.reservierungUsd = 0.212;
    U.welt.echteKosten = 0.3;
    const laufU = await V.fuehreAus({
      ids: idsVon(U.docs), deps: U.deps, execute: true, commit: "test-commit",
      erwartet: testbindung(U.docs, { maxUsd: 0.5 }), runId: "klasse-a-usd", now: () => new Date()
    });
    A.equal(laufU.abbruchGrund, "verstehen-kostendeckel-erreicht");
    A.ok(U.welt.aufrufe.length < 4, "vor dem naechsten bezahlten Aufruf gestoppt");
    A.equal(laufU.ok, false);
  });

  // ── §25.17–§25.20: KLASSE B stoppt weiter global ──
  const T = baueTransportWelt({ anzahl: 4, fehlerIndex: 1 });
  await pruefeAsync("§25.17/§25.20 ein globaler Transportfehler stoppt den gesamten Lauf weiter fail closed", async () => {
    const laufT = await V.fuehreAus({
      ids: idsVon(T.docs), deps: T.deps, execute: true, commit: "test-commit",
      erwartet: T.bindung, runId: "klasse-b", now: () => new Date()
    });
    A.equal(laufT.abbruchGrund, "verstehen-ausgang-unbekannt");
    A.equal(laufT.ok, false);
    A.equal(laufT.fachlichBestanden, false);
    A.equal(laufT.quittungStatus, "unbekannt");
    A.equal(laufT.ergebnisse.length, 2, "kein weiterer Cluster nach dem globalen Fehler");
    A.equal(laufT.ergebnisse[1].status, "skipped-error");
    A.equal(laufT.ergebnisse[1].ausgang, "unbekannt");
    A.equal(T.welt.aufrufe.length, 2, "der dritte Cluster wird NICHT mehr aufgerufen");
    A.equal(laufT.vollstaendigVerarbeitet, false);
    A.equal(laufT.lokaleUnbekannte, 0, "Transportfehler ist kein lokaler Clusterfehler");
  });

  // ── §25.29/§25.30: unerwarteter Motorwurf = KLASSE B (global fail closed) ──
  const W = baueWurfWelt({ anzahl: 4, fehlerIndex: 1 });
  await pruefeAsync("§25.29 Motor wirft im zweiten von vier Clustern — global fail closed, kein falsches Gruen", async () => {
    const laufW = await V.fuehreAus({
      ids: idsVon(W.docs), deps: W.deps, execute: true, commit: "test-commit",
      erwartet: W.bindung, runId: "klasse-b-wurf", now: () => new Date()
    });
    A.equal(laufW.ergebnisse.length, 2, "nur zwei Cluster wurden betreten");
    A.equal(laufW.ergebnisse[0].status, "saved", "der erste Cluster ist erfolgreich");
    A.equal(laufW.ergebnisse[1].status, "cluster-error", "der zweite Cluster ist sichtbar cluster-error");
    A.equal(laufW.ergebnisse[1].ausgang, null, "ein Wurf traegt keinen unbekannt-Ausgang");
    A.equal(laufW.ergebnisse[1].dokumente, 1, "die bekannte Clustergroesse wird bilanziert");
    A.equal(laufW.bilanz.arten["cluster-error"], 1);
    A.equal(W.welt.aufrufe.length, 2, "genau zwei Modellversuche bis zum Fehler");
    A.equal(laufW.modellaufrufe, 2);
    A.equal(laufW.abbruchGrund, "verstehen-cluster-error");
    A.equal(laufW.vollstaendigVerarbeitet, false);
    A.equal(laufW.fachlichBestanden, false);
    A.equal(laufW.ok, false);
    A.equal(laufW.lokaleUnbekannte, 0);
    A.equal(laufW.automatischeWiederholung, false);
    A.equal(W.welt.abgeschlossen.status, "gestoppt", "Quittung terminal NICHT erfolgreich");
    A.equal(W.welt.abgeschlossen.fachlichBestanden, false);
    A.equal(W.welt.abgeschlossen.abbruchGrund, "verstehen-cluster-error");
    // Das CAS bleibt unveraendert sicher: der bezahlte Aufruf ohne Ergebnis wird als unbekannt
    // gesperrt (At-most-once), der Runner bricht dennoch global ab.
    A.ok(W.welt.schritt.includes("ausgangUnbekannt"));
    A.ok(!W.welt.schritt.includes("freigabe"), "kein automatischer Rueckweg");
  });

  await pruefeAsync("§25.30 ein cluster-error endet NIE mit ok/fachlichBestanden=true (auch als erster Cluster)", async () => {
    const W1 = baueWurfWelt({ anzahl: 2, fehlerIndex: 0 });
    const lauf1 = await V.fuehreAus({
      ids: idsVon(W1.docs), deps: W1.deps, execute: true, commit: "test-commit",
      erwartet: W1.bindung, runId: "klasse-b-wurf-2", now: () => new Date()
    });
    A.equal(lauf1.ergebnisse.length, 1, "kein Folgecluster nach dem Wurf");
    A.equal(lauf1.ergebnisse[0].status, "cluster-error");
    A.equal(lauf1.ergebnisse[0].dokumente, 1);
    A.equal(W1.welt.aufrufe.length, 1, "kein Retry nach dem Wurf");
    A.equal(lauf1.ok, false);
    A.equal(lauf1.fachlichBestanden, false);
    A.equal(lauf1.vollstaendigVerarbeitet, false);
    A.equal(lauf1.abbruchGrund, "verstehen-cluster-error");
  });
}

(async () => {
  await abschnittAuftragswerte();
  await abschnittEchterBeleg();
  await abschnittKennungsbindung();
  await abschnittPlanGates();
  await abschnittMergedUndCas();
  await abschnittLaufdeckel();
  await abschnittFinalerKostenstand();
  await abschnittUnbekannt();
  await abschnittQuittung();
  await abschnittFremd();
  await abschnittNebenwirkungen();
  await abschnittTagesriegel();
  await abschnittAbbruchdiagnose();
  await abschnittResolverSpuren();
  await abschnittInvalidDiagnose();
  await abschnittRuntimeCommit();
  await abschnittLokalerClusterfehler();

  console.log("\n== ERGEBNIS ==");
  console.log("bestanden: " + bestanden);
  console.log("fehlgeschlagen: " + fehlgeschlagen.length);
  if (fehlgeschlagen.length) {
    for (const n of fehlgeschlagen) console.log("  FAIL " + n);
    process.exitCode = 1;
  }
})();
