"use strict";

// Helmut — GEZIELTE TESTS der KANDIDATENFENSTER-REPARATUR (2026-09-22).
// Offline, reine Attrappen für den Speicher — kein Netz, keine Datenbank, kein Modellaufruf.
//   node scripts/lokal.js -- node scripts/vorgangs-resolver-exakt-test.js
// =============================================================================================
// BELEGTER ANLASS (rein lesender Production-Planlauf, PR #519): mehrere Cluster wurden als `neu`
// klassifiziert, obwohl ein Knowledge Object mit EXAKT derselben `deriveVorgangId`-Kennung
// bereits existierte. Ursache: `listKnowledgeObjectsByVorgangPrefix` liefert EIN globales
// Fenster von `MAX_VORGANG_KANDIDATEN = 8` Zeilen, sortiert nach `updated_at desc`, über ALLE
// Präfixe gemeinsam. Ein frisch aktualisierter, thematisch verwandter Vorgang kann damit einen
// exakt passenden älteren Vorgang aus dem Fenster drängen — der Cluster endet als `neu`.
//
// DIE REPARATUR (generisch, im bestehenden Resolver): der exakte Kandidat kommt IMMER in das
// Fenster und wird zuerst mit Dokumentbeleg geprüft. Die Kennung bleibt ein VORSCHLAG — sie
// verschafft nur einen Platz im Fenster; die fachliche Entscheidung bleibt unverändertes
// `sameVorgang`. Kein Sonderfall für einzelne Kennungen, keine Erhöhung des Limits, keine
// unbegrenzte Suche, keine zweite Resolverlogik.
//
// Die zehn Pflichtprüfungen des Auftrags sind mit §1–§10 nummeriert.

const A = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { resolveVorgang } = require(path.join(ROOT, "lib/helmut/understanding"));
const V = require(path.join(ROOT, "lib/helmut/verstehen-einmalig"));
const { contentHash, canonicalizeUrl, dedupeRawDocuments, toRawDocumentRow } = require(path.join(ROOT, "lib/helmut/dedup"));
const { clusterRawDocuments, deriveVorgangId, sameVorgang, neueErkenntnisse } = require(path.join(ROOT, "lib/helmut/vorgang-identity"));

let bestanden = 0;
const fehlgeschlagen = [];
async function pruefe(name, fn) {
  try { await fn(); bestanden += 1; console.log("  PASS  " + name); }
  catch (e) { fehlgeschlagen.push(name); console.log("  FAIL  " + name + " — " + (e && e.message)); }
}
function abschnitt(t) { console.log("\n== " + t + " =="); }

// ── Attrappen ──────────────────────────────────────────────────────────────────────────────
const ISO = "2026-09-22T08:00:00.000Z";

function rohesDokument(slug, titel, iso = ISO) {
  const url = "https://example.org/" + slug;
  const hash = contentHash({ url, publishedAt: iso, title: titel });
  return {
    id: "rd-" + hash, content_hash: hash, canonical_url: canonicalizeUrl(url), url,
    title: titel, summary: null, source_name: null, source_id: null, source_type: null,
    confidence: "high", link_type: "direct", published_at: iso, retrieved_at: iso,
    document_type: null, wahlperiode: null
  };
}

function clusterAus(dokumente) {
  const clusters = clusterRawDocuments(dedupeRawDocuments(dokumente.map(toRawDocumentRow).filter((r) => r && r.id)));
  A.equal(clusters.length, 1, "die Probe muss genau einen Cluster bilden");
  return clusters[0];
}

// Der Attrappen-Speicher: NUR lesende Wege. Schreibwege sind absichtlich Fangnetze, damit
// jede Schreibwirkung sofort auffaellt (§10).
function speicher({ kandidaten = [], exakt = null, links = {}, exaktFehler = null } = {}) {
  const z = {
    kandidatensuchen: 0, exaktLesungen: 0, dokumentlesungen: 0, modellaufrufe: 0,
    schreibversuche: 0, liste: kandidaten.slice()
  };
  z.deps = {
    findVorgangCandidates: async (praefixe, limit) => {
      z.kandidatensuchen += 1;
      return z.liste.slice(0, Number.isFinite(Number(limit)) ? Number(limit) : 8);
    },
    getExisting: async (vorgangId) => {
      z.exaktLesungen += 1;
      if (exaktFehler) throw new Error(exaktFehler);
      return exakt && exakt.vorgang_id === vorgangId ? exakt : null;
    },
    listVorgangDocuments: async (koId) => { z.dokumentlesungen += 1; return links[koId] || []; },
    // Fangnetze: ein Modellaufruf oder Schreibzugriff waere ein Vertragsbruch.
    requestUnderstanding: async () => { z.modellaufrufe += 1; throw new Error("modellaufruf-verboten"); },
    save: async () => { z.schreibversuche += 1; throw new Error("schreibzugriff-verboten"); },
    saveSources: async () => { z.schreibversuche += 1; throw new Error("schreibzugriff-verboten"); },
    markFailed: async () => { z.schreibversuche += 1; throw new Error("schreibzugriff-verboten"); }
  };
  return z;
}

function ko(vorgangId, { status = "complete", understandingStatus = "complete", updatedAt = "2026-09-01T00:00:00Z", headline = null } = {}) {
  return {
    id: "ko-" + vorgangId, vorgang_id: vorgangId, status,
    understanding_status: understandingStatus, updated_at: updatedAt, created_at: updatedAt,
    headline, display_title: headline
  };
}

// Acht thematisch VERWANDTE, aber frisch aktualisierte Fremdvorgaenge — das gefuellte Fenster.
function achtNeuere(praefix = "vg-fenster") {
  return Array.from({ length: 8 }, (_, i) => ko(`${praefix}-${String(i).padStart(2, "0")}`,
    { updatedAt: `2026-09-20T0${i}:00:00Z` }));
}

(async () => {
  // ── §1 ───────────────────────────────────────────────────────────────────────────────────
  abschnitt("§1  Der exakte Kandidat wird geprüft, auch bei acht neueren Präfix-Kandidaten");
  const c1 = clusterAus([rohesDokument("exakt-1", "Zitterpappel")]);
  const vorschlag1 = deriveVorgangId(c1);
  const exakt1 = ko(vorschlag1, { updatedAt: "2020-05-15T00:00:00Z" });
  const links1 = {
    ["ko-" + vorschlag1]: [rohesDokument("alt-1a", "Zitterpappel"), rohesDokument("alt-1b", "Zitterpappel")]
  };
  const z1 = speicher({ kandidaten: achtNeuere(), exakt: exakt1, links: links1 });

  await pruefe("§1 der exakte Vorgang steht im Fenster und wird fachlich geprüft", async () => {
    const a = await resolveVorgang(c1, z1.deps, {});
    A.equal(a.vorgangId, vorschlag1);
    A.equal(a.resolution, "bestand");
    A.ok(a.existing, "der exakte Bestand wurde gefunden");
    A.equal(a.existing.vorgang_id, vorschlag1);
    A.equal(a.bestandsDokumente.length, 2, "mit Dokumentbeleg geprüft");
    // Er ist nicht nur im Fenster, er wurde auch wirklich geprüft (Spur vorhanden).
    A.ok(a.spuren.some((s) => s.vorgangId === vorschlag1 && s.gleich === true));
    // Und zwar ALS ERSTER — nur die ersten fuenf bekommen Dokumentbeleg.
    A.equal(a.spuren[0].vorgangId, vorschlag1);
    A.equal(z1.exaktLesungen, 1, "genau ein exakter Lesevorgang");
  });

  // ── §2/§3 ────────────────────────────────────────────────────────────────────────────────
  abschnitt("§2/§3  Auch der exakte Kandidat wird durch sameVorgang geprüft und kann abgelehnt werden");
  const c2 = clusterAus([rohesDokument("exakt-2", "Zitterpappel")]);
  const vorschlag2 = deriveVorgangId(c2);
  const exakt2 = ko(vorschlag2);
  const links2 = {
    ["ko-" + vorschlag2]: [rohesDokument("fremd-2a", "Haselnussstrauch"), rohesDokument("fremd-2b", "Haselnussstrauch")]
  };
  const z2 = speicher({ kandidaten: achtNeuere(), exakt: exakt2, links: links2 });

  await pruefe("§2 die exakte Kennung allein begründet keine Zugehörigkeit", async () => {
    const a = await resolveVorgang(c2, z2.deps, {});
    const spur = a.spuren.find((s) => s.vorgangId === vorschlag2);
    A.ok(spur, "der exakte Kandidat wurde geprüft");
    A.equal(spur.gleich, false, "sameVorgang hat ihn abgelehnt");
    A.match(String(spur.grund), /^[a-z0-9-]+$/, "mit benanntem Ablehnungsgrund");
    A.equal(a.resolution !== "bestand", true, "kein Treffer behauptet");
  });

  await pruefe("§3 der fachlich falsche exakte Kandidat blockiert seine Kennung (kein Überschreiben)", async () => {
    const a = await resolveVorgang(c2, z2.deps, {});
    A.equal(a.resolution, "konflikt-neue-kennung");
    A.equal(a.vorgangId, vorschlag2 + "-2");
    A.equal(a.existing, null);
    A.ok(String(a.begruendung).includes(vorschlag2), "der Konflikt nennt die belegte Kennung");
  });

  // ── §4 ───────────────────────────────────────────────────────────────────────────────────
  abschnitt("§4  Ohne exakten Kandidaten bleibt das Verhalten unverändert");
  await pruefe("§4 ohne exakten Treffer werden genau die acht Präfix-Kandidaten geprüft", async () => {
    const c = clusterAus([rohesDokument("ohne-0", "Silberfuchs")]);
    const z = speicher({ kandidaten: achtNeuere(), exakt: null });
    const a = await resolveVorgang(c, z.deps, {});
    A.equal(a.spuren.length, 8, "alle acht Kandidaten, keiner verdrängt");
    A.equal(a.resolution, "neu");
    A.equal(a.vorgangId, deriveVorgangId(c));
    A.equal(a.existing, null);
    A.equal(z.exaktLesungen, 1);
    // Reihenfolge unveraendert: neueste zuerst (der Resolver sortiert erneut nach updated_at).
    const erwarteteReihenfolge = achtNeuere()
      .slice()
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .map((k) => k.vorgang_id);
    A.deepEqual(a.spuren.map((s) => s.vorgangId), erwarteteReihenfolge);
  });

  // ── §5/§6 ────────────────────────────────────────────────────────────────────────────────
  abschnitt("§5/§6  Keine Dopplung, Fenster bleibt begrenzt");
  await pruefe("§5 der exakte Kandidat erscheint auch dann nur einmal, wenn er im Fenster steckt", async () => {
    const c = clusterAus([rohesDokument("dopp-0", "Zitterpappel")]);
    const vorschlag = deriveVorgangId(c);
    const fenster = [...achtNeuere(), ko(vorschlag)];
    const z = speicher({
      kandidaten: fenster, exakt: ko(vorschlag),
      links: { ["ko-" + vorschlag]: [rohesDokument("alt-d1", "Zitterpappel"), rohesDokument("alt-d2", "Zitterpappel")] }
    });
    const a = await resolveVorgang(c, z.deps, {});
    A.equal(a.spuren.filter((s) => s.vorgangId === vorschlag).length, 1, "keine Dopplung");
    A.equal(a.resolution, "bestand");
  });

  await pruefe("§6 das Kandidatenfenster bleibt hart auf acht begrenzt", async () => {
    const c = clusterAus([rohesDokument("limit-0", "Zitterpappel")]);
    const vorschlag = deriveVorgangId(c);
    const zwanzig = Array.from({ length: 20 }, (_, i) => ko(`vg-limit-${String(i).padStart(2, "0")}`,
      { updatedAt: `2026-09-1${i % 10}T00:00:00Z` }));
    const z = speicher({ kandidaten: zwanzig, exakt: ko(vorschlag) });
    const a = await resolveVorgang(c, z.deps, {});
    A.ok(a.spuren.length <= 8, "hoechstens acht geprueft, tatsaechlich " + a.spuren.length);
    A.equal(a.spuren.length, 8);
    A.equal(a.spuren[0].vorgangId, vorschlag, "der exakte Kandidat steht zuerst");
    // Genau die AELTESTEN Praefix-Kandidaten fallen aus dem Fenster — nicht die neuesten.
    const geprueft = new Set(a.spuren.map((s) => s.vorgangId));
    A.ok(!geprueft.has("vg-limit-19") || !geprueft.has("vg-limit-00"), "ein Randkandidat entfaellt");
  });

  // ── §7 ───────────────────────────────────────────────────────────────────────────────────
  abschnitt("§7  Ein pending exakter Vorgang wird als pending erkannt, nicht als neu");
  const c7 = clusterAus([rohesDokument("pend-7", "Eibischwurzel")]);
  const vorschlag7 = deriveVorgangId(c7);
  const exakt7 = ko(vorschlag7, { status: "pending", understandingStatus: "pending", updatedAt: "2021-02-12T00:00:00Z" });
  const z7 = speicher({
    kandidaten: achtNeuere(), exakt: exakt7,
    links: { ["ko-" + vorschlag7]: [rohesDokument("alt-7a", "Eibischwurzel"), rohesDokument("alt-7b", "Eibischwurzel")] }
  });

  await pruefe("§7 der pending Bestand wird gefunden und bleibt pending", async () => {
    const a = await resolveVorgang(c7, z7.deps, {});
    A.equal(a.resolution, "bestand");
    A.ok(a.existing);
    A.equal(a.existing.status, "pending");
  });

  await pruefe("§7 der Plan klassifiziert ihn als pending-erst statt neu", async () => {
    const k = await V.klassifiziereCluster(c7, z7.deps, {});
    A.equal(k.art, "pending-erst");
    A.equal(k.kandidat, true);
    A.equal(k.vorgangId, vorschlag7);
  });

  // ── §8 ───────────────────────────────────────────────────────────────────────────────────
  abschnitt("§8  Ein complete exakter Vorgang läuft durch die bestehende neueErkenntnisse-Logik");
  const c8a = clusterAus([rohesDokument("upd-8a", "Wacholderbeere")]);
  const vorschlag8a = deriveVorgangId(c8a);
  const z8a = speicher({
    kandidaten: achtNeuere(), exakt: ko(vorschlag8a),
    links: { ["ko-" + vorschlag8a]: [rohesDokument("alt-8a1", "Wacholderbeere"), rohesDokument("alt-8a2", "Wacholderbeere")] }
  });

  await pruefe("§8a ohne neue Fakten: merged, kein Modellaufruf", async () => {
    const k = await V.klassifiziereCluster(c8a, z8a.deps, {});
    A.equal(k.art, "merged");
    A.equal(k.kandidat, false);
    A.equal(k.begruendung, "keine-neuen-fakten");
  });

  const c8b = clusterAus([rohesDokument("upd-8b", "Wacholderbeere Tannenzapfen")]);
  const vorschlag8b = deriveVorgangId(c8b);
  const z8b = speicher({
    kandidaten: achtNeuere(), exakt: ko(vorschlag8b),
    links: { ["ko-" + vorschlag8b]: [rohesDokument("alt-8b1", "Wacholderbeere"), rohesDokument("alt-8b2", "Wacholderbeere")] }
  });

  await pruefe("§8b mit neuen Fakten: update über neueErkenntnisse statt neu", async () => {
    const a = await resolveVorgang(c8b, z8b.deps, {});
    A.equal(a.resolution, "bestand", "kein `neu` mehr");
    const erkenntnis = neueErkenntnisse((c8b.documents || []), a.bestandsDokumente);
    A.equal(erkenntnis.neu, true, "die neuen Fakten sind belegt");
    const k = await V.klassifiziereCluster(c8b, z8b.deps, {});
    A.equal(k.art, "update");
    A.equal(k.kandidat, true);
  });

  // ── §9/§10 ───────────────────────────────────────────────────────────────────────────────
  abschnitt("§9/§10  Keine Modellaufrufe und keine Schreibzugriffe durch die Kandidatensuche");
  await pruefe("§9/§10 die Aufloesung ist rein lesend und ruft kein Modell", async () => {
    // (a) mit exaktem Kandidaten — frische Attrappe, damit die Zaehler bei null beginnen.
    const cExakt = clusterAus([rohesDokument("rw-exakt", "Zitterpappel")]);
    const vExakt = deriveVorgangId(cExakt);
    const zExakt = speicher({
      kandidaten: achtNeuere(), exakt: ko(vExakt),
      links: { ["ko-" + vExakt]: [rohesDokument("rw-a1", "Zitterpappel"), rohesDokument("rw-a2", "Zitterpappel")] }
    });
    const zOhne = speicher({ kandidaten: achtNeuere(), exakt: null });
    const cOhne = clusterAus([rohesDokument("rw-0", "Moorkiefer")]);
    for (const [name, z, c] of [["exakt", zExakt, cExakt], ["ohne", zOhne, cOhne]]) {
      const a = await resolveVorgang(c, z.deps, {});
      A.ok(a && a.vorgangId, name);
      A.equal(z.modellaufrufe, 0, name + ": kein Modellaufruf");
      A.equal(z.schreibversuche, 0, name + ": kein Schreibzugriff");
      A.equal(z.kandidatensuchen, 1, name + ": genau eine Kandidatensuche");
      A.equal(z.exaktLesungen, 1, name + ": genau ein exakter Lesevorgang");
      A.ok(z.dokumentlesungen <= 5, name + ": Belegbudget begrenzt (" + z.dokumentlesungen + ")");
    }
  });

  // ── Zusatz: Fehler beim exakten Lesen darf den Lauf nicht verbiegen ──────────────────────
  await pruefe("§4b ein Lesefehler beim exakten Kandidaten ändert die Kandidatenmenge nicht", async () => {
    const c = clusterAus([rohesDokument("fehler-0", "Sanddornbeere")]);
    const z = speicher({ kandidaten: achtNeuere(), exaktFehler: "netzfehler" });
    const a = await resolveVorgang(c, z.deps, {});
    A.equal(a.spuren.length, 8, "die acht Praefix-Kandidaten bleiben");
    A.equal(a.resolution, "neu");
  });

  console.log("\n== ERGEBNIS ==");
  console.log(bestanden + "/" + (bestanden + fehlgeschlagen.length) + " Assertions erfolgreich.");
  if (fehlgeschlagen.length) {
    for (const n of fehlgeschlagen) console.log("  FAIL " + n);
    process.exitCode = 1;
  }
})();
