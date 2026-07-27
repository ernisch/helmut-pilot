"use strict";

// Magnet-Vorgaenge erkennen und bewerten (Betriebsbefund B4-2).
// =============================================================================
// AUSSCHLIESSLICH LESEND. Kein Write, kein KI-Aufruf, keine Bereinigung. Das
// Werkzeug diagnostiziert und schlaegt hoechstens vor — es raeumt nichts auf.
//
// WAS EIN MAGNET-VORGANG IST (messbar, nicht geraten):
// Ein Vorgang soll GENAU EIN politisches Ereignis abbilden. Ob er das tut, laesst
// sich pruefen, ohne zu raten: man gibt seine verknuepften Rohdokumente erneut in
// die (nachweislich gesunde) Clusterfunktion. Ein echter Vorgang zerfaellt dabei
// NICHT — er bleibt ein Cluster. Ein Magnet zerfaellt in viele.
//
//   THEMENVIELFALT = Anzahl Cluster, in die die Dokumente eines Vorgangs
//                    zerfallen, wenn man sie neu clustert.
//   Echter Vorgang:  1 (selten 2 bei Grenzfaellen)
//   Magnet:          >= MAGNET_MIN_CLUSTER, bei >= MAGNET_MIN_DOKUMENTE Dokumenten
//
// Die zweite, unabhaengige Kennzahl ist der KERN: Anker, die mindestens die
// Haelfte der Dokumente teilen. Ein echtes Ereignis hat einen Kern ("csd",
// "berlin", "angriff"). Ein Magnet hat keinen — seine Dokumente teilen nichts.
// Genau diese Kernlosigkeit macht ihn im neuen Resolver unfaehig, weiter zu wachsen.
//
// Aufruf:
//   HELMUT_V3_STORE=1 node scripts/vorgangs-magnet-analyse.js
//   HELMUT_V3_STORE=1 node scripts/vorgangs-magnet-analyse.js --ab=10 --json
//   HELMUT_V3_STORE=1 node scripts/vorgangs-magnet-analyse.js --vorgang=vg-zeitung-20260428-f362cc

const path = require("path");
const root = path.join(__dirname, "..");
const V = require(path.join(root, "lib/helmut/vorgang-identity.js"));

// MAGNET-DEFINITION, aus der Production-Messung abgeleitet statt geschaetzt
// (36 Vorgaenge mit >= 6 Dokumenten, 2026-07-27 — Zahlen in
// docs/befund-csd-2026-vorgangsverlust.md §12c):
//
//   KOHAERENZ = groesstes Cluster / alle Dokumente. 1,0 = genau ein Ereignis.
//   gesunde Vorgaenge:  0,67 - 1,00   (Kernanker 2 - 8)
//   Magnete:            0,07 - 0,55   (Kernanker 0 - 2, meist 0)
//
// Zwischen 0,55 und 0,67 liegt in der gemessenen Verteilung KEIN Vorgang — die
// Schwelle 0,6 trennt die beiden Gruppen also in einer echten Luecke, nicht an
// einem willkuerlichen Punkt. Zusaetzlich muss ein Vorgang eine Mindestgroesse
// haben: unter 10 Dokumenten ist "zerfaellt in mehrere Cluster" noch kein Magnet,
// sondern ein normaler Grenzfall der Clusterbildung.
const MAGNET_MIN_DOKUMENTE = 10;
const MAGNET_MAX_KOHAERENZ = 0.6;
// Nur noch fuer die Ausgabe: ab wie vielen Clustern ein Vorgang auffaellt.
const MAGNET_MIN_CLUSTER = 3;

function parseArgs(argv) {
  const a = { ab: MAGNET_MIN_DOKUMENTE, json: false, vorgang: null, limit: 60, alle: false };
  for (const arg of argv.slice(2)) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!m) { console.error(`Unbekanntes Argument: ${arg}`); process.exit(2); }
    const [, name, wert] = m;
    if (name === "ab") a.ab = Math.max(2, Number(wert) || MAGNET_MIN_DOKUMENTE);
    else if (name === "limit") a.limit = Math.max(1, Number(wert) || 60);
    else if (name === "json") a.json = true;
    else if (name === "alle") a.alle = true;
    else if (name === "vorgang") a.vorgang = String(wert || "").trim() || null;
    else { console.error(`Unbekanntes Argument: --${name}`); process.exit(2); }
  }
  return a;
}

// Bewertung EINES Vorgangs aus seinen verknuepften Rohdokumenten. Reine Logik —
// deshalb ohne DB-Zugriff und einzeln testbar.
function bewerteVorgang(vorgangId, dokumente = [], meta = {}) {
  const docs = (Array.isArray(dokumente) ? dokumente : []).filter(Boolean);
  const cluster = docs.length ? V.clusterRawDocuments(docs) : [];
  const kern = V.coreAnchors(docs.map((d) => V.docAnchors(d)));
  const quellen = new Set(docs.map((d) => d.source_id || d.source_name).filter(Boolean));
  const zeiten = docs.map((d) => Date.parse(d.published_at || d.created_at || "")).filter(Number.isFinite);
  const groesstesCluster = cluster.reduce((m, c) => Math.max(m, c.documents.length), 0);

  const kohaerenz = docs.length ? groesstesCluster / docs.length : 0;
  const magnet = docs.length >= MAGNET_MIN_DOKUMENTE && kohaerenz < MAGNET_MAX_KOHAERENZ;
  // Risiko: wie stark zieht dieser Vorgang weiter an? Ein kernloser, grosser,
  // themenvielfaeltiger Vorgang trifft im alten Resolver fast jeden neuen Cluster.
  let risiko = "keins";
  if (magnet) {
    if (docs.length >= 50 || cluster.length >= 10) risiko = "hoch";
    else if (docs.length >= 20 || cluster.length >= 5) risiko = "mittel";
    else risiko = "niedrig";
  }

  return {
    vorgangId,
    dokumente: docs.length,
    themenvielfalt: cluster.length,
    groesstesCluster,
    // Anteil des groessten Clusters: 1,0 = ein einziges Ereignis.
    kohaerenz: Math.round(kohaerenz * 100) / 100,
    kernanker: kern.length,
    kernBeispiel: kern.slice(0, 5),
    quellen: quellen.size,
    zeitspanneTage: zeiten.length >= 2 ? Math.round((Math.max(...zeiten) - Math.min(...zeiten)) / 86400000 * 10) / 10 : 0,
    magnet,
    risiko,
    ...meta
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const storage = require(path.join(root, "lib/helmut/storage.js"));
  if (!storage.v3StoreReady()) {
    console.error("Benoetigt SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY und HELMUT_V3_STORE=1 (nur lesend).");
    process.exit(3);
  }

  const [links, kos] = await Promise.all([
    storage.listKoDocumentLinks({ limit: 20000 }),
    storage.listKnowledgeObjectStates({ limit: 4000, mitUeberschrift: true })
  ]);

  // Dokumentzahl je Vorgang + Wachstumsfenster aus den Verknuepfungszeitpunkten.
  const jeKo = new Map();
  for (const l of links) {
    if (!l || !l.knowledge_object_id) continue;
    if (!jeKo.has(l.knowledge_object_id)) jeKo.set(l.knowledge_object_id, { n: 0, von: null, bis: null });
    const e = jeKo.get(l.knowledge_object_id);
    e.n += 1;
    const t = l.created_at || null;
    if (t && (!e.von || t < e.von)) e.von = t;
    if (t && (!e.bis || t > e.bis)) e.bis = t;
  }

  const kandidaten = kos
    .map((k) => ({ ko: k, ...(jeKo.get(k.id) || { n: 0, von: null, bis: null }) }))
    .filter((x) => (args.vorgang ? x.ko.vorgang_id === args.vorgang : x.n >= args.ab))
    .sort((a, b) => b.n - a.n)
    .slice(0, args.alle ? 10000 : args.limit);

  const befunde = [];
  for (const k of kandidaten) {
    const docs = await storage.listKoDocuments(k.ko.id, 400);
    befunde.push(bewerteVorgang(k.ko.vorgang_id, docs, {
      koId: k.ko.id,
      angelegt: k.ko.created_at ? String(k.ko.created_at).slice(0, 16) : null,
      ersteVerknuepfung: k.von ? String(k.von).slice(0, 16) : null,
      letzteVerknuepfung: k.bis ? String(k.bis).slice(0, 16) : null,
      // Wuchs der Vorgang NACH seiner Entstehung weiter? Das ist der Magnet-Effekt.
      nachtraeglichGewachsen: Boolean(k.von && k.bis && k.von !== k.bis),
      ueberschrift: (k.ko.display_title || k.ko.headline || "").slice(0, 60)
    }));
  }

  const magnete = befunde.filter((b) => b.magnet);
  const gesund = befunde.filter((b) => !b.magnet);
  const zahl = (liste, feld) => liste.map((b) => b[feld]).filter((x) => Number.isFinite(x));
  const mittel = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);

  const ergebnis = {
    gemessenAm: new Date().toISOString(),
    definition: {
      magnet: `>= ${MAGNET_MIN_DOKUMENTE} Dokumente UND Kohaerenz < ${MAGNET_MAX_KOHAERENZ}`,
      themenvielfalt: "Anzahl Cluster, in die die Dokumente eines Vorgangs zerfallen",
      kohaerenz: "Anteil des groessten Clusters an allen Dokumenten (1,0 = ein Ereignis)"
    },
    geprueft: befunde.length,
    magnete: magnete.length,
    gesund: gesund.length,
    kennzahlen: {
      dokumenteMittelMagnet: mittel(zahl(magnete, "dokumente")),
      dokumenteMittelGesund: mittel(zahl(gesund, "dokumente")),
      groesster: magnete.length ? Math.max(...zahl(magnete, "dokumente")) : 0,
      kleinsterMagnet: magnete.length ? Math.min(...zahl(magnete, "dokumente")) : 0,
      themenvielfaltMittelMagnet: mittel(zahl(magnete, "themenvielfalt")),
      themenvielfaltMittelGesund: mittel(zahl(gesund, "themenvielfalt")),
      kernankerMittelMagnet: mittel(zahl(magnete, "kernanker")),
      kernankerMittelGesund: mittel(zahl(gesund, "kernanker")),
      nachtraeglichGewachsen: magnete.filter((m) => m.nachtraeglichGewachsen).length,
      risiko: magnete.reduce((m, b) => { m[b.risiko] = (m[b.risiko] || 0) + 1; return m; }, {})
    },
    befunde: befunde.sort((a, b) => b.dokumente - a.dokumente)
  };

  if (args.json) { console.log(JSON.stringify(ergebnis, null, 2)); return process.exit(0); }

  console.log(`\nMAGNET-ANALYSE (read-only) — ${ergebnis.geprueft} Vorgaenge mit >= ${args.ab} Dokumenten\n`);
  console.log(`Definition: ${ergebnis.definition.magnet}\n`);
  console.log(`Magnete: ${ergebnis.magnete} · unauffaellig: ${ergebnis.gesund}`);
  const k = ergebnis.kennzahlen;
  console.log(`  Dokumente je Vorgang     Magnet ${k.dokumenteMittelMagnet} · gesund ${k.dokumenteMittelGesund}`);
  console.log(`  Themenvielfalt           Magnet ${k.themenvielfaltMittelMagnet} · gesund ${k.themenvielfaltMittelGesund}`);
  console.log(`  Kernanker                Magnet ${k.kernankerMittelMagnet} · gesund ${k.kernankerMittelGesund}`);
  console.log(`  groesster Magnet: ${k.groesster} Dokumente · kleinster: ${k.kleinsterMagnet}`);
  console.log(`  nachtraeglich gewachsen: ${k.nachtraeglichGewachsen} von ${ergebnis.magnete}`);
  console.log(`  Risiko: ${JSON.stringify(k.risiko)}`);
  console.log("\nVorgang                                  Dok  Cluster  Kohaerenz  Kern  Quellen  Tage  Risiko");
  for (const b of ergebnis.befunde) {
    console.log(
      `${b.vorgangId.slice(0, 40).padEnd(40)} ${String(b.dokumente).padStart(4)} ${String(b.themenvielfalt).padStart(8)} `
      + `${String(b.kohaerenz).padStart(10)} ${String(b.kernanker).padStart(5)} ${String(b.quellen).padStart(8)} `
      + `${String(b.zeitspanneTage).padStart(5)}  ${b.magnet ? b.risiko.toUpperCase() : "-"}`
    );
  }
  console.log("\nKEINE Bereinigung durchgefuehrt — dieses Werkzeug diagnostiziert ausschliesslich.");
  return process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error("Fehler:", e && e.message); process.exit(1); });
}

module.exports = { parseArgs, bewerteVorgang, MAGNET_MIN_DOKUMENTE, MAGNET_MAX_KOHAERENZ, MAGNET_MIN_CLUSTER };
