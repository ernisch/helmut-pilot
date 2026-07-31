"use strict";

// Helmut — Mutationsprobe OP-25 K2 (globale Buendelung).
// =============================================================================================
// ZWECK: belegen, dass `scripts/globalphase-buendelung-test.js` die Aussagen zu K1-1 wirklich
// absichert. Jede Probe verletzt GENAU EINE Zusage im Produktionscode der Vorgangsbildung und
// erwartet, dass die Suite ROT wird. Bleibt sie gruen, ist die Zusage nicht abgesichert — und
// genau das waere der Befund.
//
// BESONDERHEIT DIESER SUITE: sie sichert nicht nur Garantien ab (Partition, Verknuepfung,
// Reihenfolgeunabhaengigkeit, Kostenobergrenze), sondern auch die drei BEFUNDE K1-1a/b/c. Auch
// die muessen mutationsfest sein: verschwaende ein Befund still, weil jemand an der
// Buendelungslogik dreht, waere die Bewertung dieses Sprints wertlos. Deshalb pruefen die
// Proben M8–M11 ausdruecklich, dass die Suite auch das ANDERSHERUM merkt.
//
// Verfahren: der Produktionscode wird in einem WEGWERF-Verzeichnis kopiert, dort mutiert und die
// Testsuite gegen die Kopie gefahren. Das Repository selbst wird NIE veraendert.
// Kein Netz, keine KI, keine Production-Daten.
//
// Aufruf:  `node scripts/globalphase-buendelung-mutationsprobe.js`
// Ergebnis: „N von N rot" = die Suite haelt. Jede gruene Probe ist ein Loch.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ZU_KOPIEREN = ["lib", "scripts", "server.js", "vercel.json", "helmut-flags.json", "package.json"];

function kopiere(quelle, ziel) {
  fs.mkdirSync(ziel, { recursive: true });
  for (const eintrag of fs.readdirSync(quelle, { withFileTypes: true })) {
    if (eintrag.name === "node_modules" || eintrag.name === ".git") continue;
    const q = path.join(quelle, eintrag.name);
    const z = path.join(ziel, eintrag.name);
    if (eintrag.isDirectory()) kopiere(q, z);
    else if (eintrag.isFile()) fs.copyFileSync(q, z);
  }
}

function baueArbeitskopie() {
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-k2-mutation-"));
  for (const name of ZU_KOPIEREN) {
    const q = path.join(ROOT, name);
    if (!fs.existsSync(q)) continue;
    const z = path.join(basis, name);
    if (fs.statSync(q).isDirectory()) kopiere(q, z);
    else { fs.mkdirSync(path.dirname(z), { recursive: true }); fs.copyFileSync(q, z); }
  }
  return basis;
}

// Eine Ersetzung im Quelltext. Wirft, wenn das Muster nicht (oder mehrdeutig) vorkommt —
// eine wirkungslose Mutation waere ein FALSCH GRUENES Ergebnis.
function ersetze(basis, datei, von, nach, { erwarteteTreffer = 1 } = {}) {
  const p = path.join(basis, datei);
  const src = fs.readFileSync(p, "utf8");
  const treffer = src.split(von).length - 1;
  if (treffer !== erwarteteTreffer) {
    throw new Error(`Mutationsmuster ${treffer}x statt ${erwarteteTreffer}x in ${datei}: ${von.slice(0, 70)}`);
  }
  fs.writeFileSync(p, src.split(von).join(nach), "utf8");
}

function suiteLaeuft(basis) {
  try {
    execFileSync(process.execPath, [path.join(basis, "scripts", "globalphase-buendelung-test.js")], {
      cwd: basis, stdio: "pipe", timeout: 300000,
      env: { ...process.env, HELMUT_CRON_GLOBALPHASE: "" }
    });
    return { gruen: true };
  } catch (error) {
    const ausgabe = String((error.stdout || "") + (error.stderr || ""));
    const zeile = (ausgabe.match(/PASS \d+\s+FAIL \d+.*/) || [])[0] || (error.message || "").slice(0, 160);
    return { gruen: false, zeile };
  }
}

const V = "lib/helmut/vorgang-identity.js";
const UND = "lib/helmut/understanding.js";

const PROBEN = [
  // ── Garantien ──────────────────────────────────────────────────────────────────────────────
  {
    name: "M1 · die Buendelung verliert ein Dokument (Partition verletzt)",
    invariante: "kein Dokument geht verloren (Abschnitt 2)",
    mutiere: (b) => ersetze(b, V,
      "  const cluster = [];\n  for (const indizes of gruppen.values()) {",
      "  const cluster = [];\n  let ueberspringe = true;\n  for (const indizes of gruppen.values()) {\n    if (ueberspringe && indizes.length === 1) { ueberspringe = false; continue; }")
  },
  {
    name: "M2 · ein Dokument landet in ZWEI Clustern (Partition verletzt)",
    invariante: "kein Dokument haengt an zwei Vorgaengen (2.5)",
    mutiere: (b) => ersetze(b, V,
      "    if (gruppe.length) cluster.push(...entkette(gruppe));",
      "    if (gruppe.length) { cluster.push(...entkette(gruppe)); if (gruppe.length > 1) cluster.push([gruppe[0]]); }")
  },
  {
    name: "M3 · die Buendelung wird wieder reihenfolgeabhaengig (erster Treffer gewinnt)",
    invariante: "Reihenfolgeunabhaengigkeit (5.1/5.2/5.3)",
    mutiere: (b) => ersetze(b, V,
      "      if (docsShareEvent(docs[i], docs[j], { aAnchors: anchors[i], bAnchors: anchors[j] }).gleich) union(i, j);",
      "      if (i < j && find(i) === i && find(j) === j && docsShareEvent(docs[i], docs[j], { aAnchors: anchors[i], bAnchors: anchors[j] }).gleich) union(i, j);")
  },
  {
    name: "M4 · die Kantenrelation wird kontextabhaengig (Quelle entscheidet mit)",
    invariante: "die Kante haengt nur an Titel + Kurzfassung (1.1/1.2)",
    mutiere: (b) => ersetze(b, V,
      "function docAnchors(doc = {}) {\n  return anchorTokens(`${titelRumpf(doc)} ${(doc && doc.summary) || \"\"}`);",
      "function docAnchors(doc = {}) {\n  return anchorTokens(`${titelRumpf(doc)} ${(doc && doc.summary) || \"\"} ${(doc && doc.source_id) || \"\"}`);")
  },
  {
    name: "M5 · das Sicherheitsventil gegen Digest-Cluster faellt aus",
    invariante: "kein Cluster ueber MAX_CLUSTER_DOKUMENTE (5.9)",
    mutiere: (b) => ersetze(b, V,
      "const MAX_CLUSTER_DOKUMENTE = 60;",
      "const MAX_CLUSTER_DOKUMENTE = 100000;")
  },
  {
    name: "M6 · ein Cluster wird verstanden, ohne seine Dokumente zu verknuepfen",
    invariante: "Verknuepfungsinvariante (2.4)",
    mutiere: (b) => ersetze(b, UND,
      "  if (saved && saved.saved) await verknuepfe(ko.id, clusterDocs);",
      "  if (false) await verknuepfe(ko.id, clusterDocs);")
  },
  {
    name: "M7 · die Vorgangskennung verliert ihr Praefixformat (Resolver findet nichts mehr)",
    invariante: "Kennungsformat und Praefixanschluss (4.9/4.10)",
    mutiere: (b) => ersetze(b, V,
      "  const teile = [`vg-${slug(roots[0]).slice(0, 24)}`];",
      "  const teile = [`vorgang_${slug(roots[0]).slice(0, 24)}`];")
  },

  // ── Befunde (auch sie muessen mutationsfest verankert sein) ────────────────────────────────
  {
    name: "M8 · Befund K1-1a verschwindet still (jede Kante wird abgelehnt)",
    invariante: "die Zusammenfuehrungsbefunde 6.1/6.2 sind verankert",
    mutiere: (b) => ersetze(b, V,
      "  if (overlap.spezifischeFamilien >= 1 && overlap.gewichtSpezifisch >= noetig) {",
      "  if (false && overlap.spezifischeFamilien >= 1 && overlap.gewichtSpezifisch >= noetig) {")
  },
  {
    name: "M9 · Befund K1-1c verschwindet still (keine Transitivitaet mehr)",
    invariante: "der Kettenbefund 1.3/6.3 ist verankert",
    mutiere: (b) => ersetze(b, V,
      "  const gruppen = new Map();\n  for (let i = 0; i < docs.length; i += 1) {\n    const w = find(i);",
      "  const gruppen = new Map();\n  for (let i = 0; i < docs.length; i += 1) {\n"
      + "    const w = parent[i] === i ? i\n"
      + "      : (docsShareEvent(docs[parent[i]], docs[i], { aAnchors: anchors[parent[i]], bAnchors: anchors[i] }).gleich ? parent[i] : i);")
  },
  {
    name: "M10 · Befund K1-1b verschwindet still (Kernanker-Nachpruefung abgeschaltet)",
    invariante: "der Trennungsbefund 4.2/6.4 ist verankert",
    mutiere: (b) => ersetze(b, V,
      "      const kern = coreAnchors(gruppe.map((i) => anchors[i]));\n      if (kern.length) {",
      "      const kern = coreAnchors(gruppe.map((i) => anchors[i]));\n      if (false) {")
  },
  {
    name: "M11 · der Zwei-Regime-Nachweis wird entwertet (Resolver prueft ohne Praefix)",
    invariante: "das strenge Regime trennt ueber die Praefixsuche (7.3/6.7)",
    mutiere: (b) => ersetze(b, V,
      "function candidatePrefixes(cluster = {}, limit = 3) {\n  return topicRoots(cluster, limit).map(vorgangPrefix);",
      "function candidatePrefixes(cluster = {}, limit = 3) {\n  return [\"vg-\"];")
  },
  {
    name: "M12 · die Kostenzusage faellt (jedes Erstverstehen kostet einen zweiten KI-Aufruf)",
    invariante: "der gemessene KI-Aufwand ist festgeschrieben (4.7/4.7b)",
    mutiere: (b) => ersetze(b, UND,
      "  const saved = await deps.save(ko);\n  // Provenienz persistieren (fail-safe)",
      "  await deps.requestUnderstanding(buildUnderstandingPrompt(cluster));\n"
      + "  const saved = await deps.save(ko);\n  // Provenienz persistieren (fail-safe)")
  },

  // ── Sicherheitsgrenzen ─────────────────────────────────────────────────────────────────────
  {
    name: "M13 · das Flag ist versehentlich standardmaessig aktiv",
    invariante: "Feature-Flag DEFAULT AUS (9.1)",
    mutiere: (b) => ersetze(b, "lib/helmut/cron-globalphase.js",
      "  return raw === \"on\" || raw === \"true\" || raw === \"1\" || raw === \"an\";",
      "  return raw !== \"off\";")
  },
  {
    name: "M14 · eine Schwelle der Vorgangsidentitaet wird still verschoben",
    invariante: "die Buendelungslogik ist unveraendert (9.4)",
    mutiere: (b) => ersetze(b, V,
      "const MIN_BEWEISGEWICHT = 2;",
      "const MIN_BEWEISGEWICHT = 1;")
  },
  {
    name: "M15 · das Formularvokabular wird still scharf geschaltet",
    invariante: "die Messung in Abschnitt 8 ist eine MESSUNG, keine Aenderung (8.2/8.3)",
    mutiere: (b) => ersetze(b, V,
      "  \"ergebnisse\", \"beispiel\", \"ueberblick\", \"hinweis\", \"hinweise\"\n]);",
      "  \"ergebnisse\", \"beispiel\", \"ueberblick\", \"hinweis\", \"hinweise\",\n"
      + "  \"antrag\", \"drucksache\", \"fraktion\", \"beantragt\", \"betrifft\", \"ausschuss\",\n"
      + "  \"sachverstaendigen\", \"tagesordnung\", \"abgeordnete\", \"abgeordneter\", \"besucht\",\n"
      + "  \"besuchte\", \"sprach\", \"kuendigt\", \"veroeffentlicht\", \"oeffentliche\", \"fuehrt\",\n"
      + "  \"durch\", \"wurde\"\n]);")
  }
];

(async () => {
  console.log("== Mutationsprobe OP-25 K2 — globale Buendelung ==");
  console.log(`Jede Probe verletzt genau eine Zusage. Erwartet: ${PROBEN.length} von ${PROBEN.length} rot.\n`);
  let rot = 0;
  let gruen = 0;
  for (const probe of PROBEN) {
    const basis = baueArbeitskopie();
    let ergebnis;
    try {
      probe.mutiere(basis);
      ergebnis = suiteLaeuft(basis);
    } catch (error) {
      ergebnis = { gruen: true, zeile: `MUTATION NICHT ANWENDBAR: ${error.message}` };
    }
    fs.rmSync(basis, { recursive: true, force: true });
    if (ergebnis.gruen) {
      gruen += 1;
      console.log(`  LOCH  ${probe.name}`);
      console.log(`        Zusage NICHT abgesichert: ${probe.invariante}`);
      if (ergebnis.zeile) console.log(`        ${ergebnis.zeile}`);
    } else {
      rot += 1;
      console.log(`  ROT   ${probe.name}`);
      console.log(`        ${ergebnis.zeile}`);
    }
  }

  console.log(`\n== ERGEBNIS ==\n${rot} von ${PROBEN.length} Proben rot, ${gruen} Loch/Loecher.`);
  if (!gruen) {
    console.log("Jede gepruefte Zusage UND jeder der drei Teilbefunde K1-1a/b/c ist verankert:");
    console.log("eine spaetere Aenderung der Buendelung kann nicht mehr still passieren.");
  }
  process.exit(gruen ? 1 : 0);
})().catch((e) => { console.error("PROBENFEHLER:", e && e.stack); process.exit(1); });
