"use strict";

// Helmut — MUTATIONSPROBE zum fuenften Auftragstyp `tenant_narrative` (E1, 2026-08-09).
// =============================================================================================
// EIN TEST, DER AUCH BEI KAPUTTER IMPLEMENTIERUNG GRUEN BLEIBT, BEWEIST NICHTS. Diese Probe
// dreht jede tragende Zusage des fuenften Auftragstyps gezielt zurueck und verlangt, dass die
// Vertragssuite (`scripts/tenant-narrativ-test.js`) daraufhin ROT wird.
//
// SICHERHEIT: jede Datei wird VOR der Mutation vollstaendig im Speicher gesichert und in
// `finally` zurueckgeschrieben; danach prueft die Probe die Byte-Identitaet selbst.
//
// AUFRUF:  node scripts/lokal.js scripts/narrativ-mutationsprobe.js
//
// HINWEIS (Befund O22, weiterhin offen): Dateien ohne `-test.js`-Endung sammelt der
// kanonische Runner nicht ein. Das Ergebnis gehoert in den Sprintbeleg.

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SUITE = path.join(ROOT, "scripts/tenant-narrativ-test.js");

const MUTATIONEN = [
  {
    name: "N1 — Flaggrenze entfernt: Narrativflag gilt immer als gesetzt",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `function narrativFlagAktiv(env = process.env) {
  const roh = String((env && env.HELMUT_NARRATIV_QUEUE) || "").trim().toLowerCase();
  return roh === "on" || roh === "true" || roh === "1" || roh === "an";
}`,
    ersetzen: `function narrativFlagAktiv(env = process.env) {
  return true;
}`,
    erwarteRot: ["1.1", "1.3"]
  },
  {
    name: "N2 — Einzelflag genuegt: Pipeline-Kopplung entfernt",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `function narrativUeberWarteschlange(env = process.env) {
  return skalierbarerPfadAktiv(env) && narrativFlagAktiv(env);
}`,
    ersetzen: `function narrativUeberWarteschlange(env = process.env) {
  return narrativFlagAktiv(env);
}`,
    erwarteRot: ["1.4"]
  },
  {
    name: "N3 — Planung ignoriert das Flag (Narrativauftraege entstehen immer)",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: "    narrativAktiv: narrativUeberWarteschlange(env)",
    ersetzen: "    narrativAktiv: true",
    erwarteRot: ["3.1"]
  },
  {
    name: "N4 — Vorbedingungen des Narrativs entfernt (laeuft vor seinen Abrufen)",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `  tenant_narrative: ["source_fetch", "document_understanding"]`,
    ersetzen: `  tenant_narrative: []`,
    erwarteRot: ["4.4", "4.5"]
  },
  {
    name: "N5 — Deaktivierte Mandate werden nicht mehr erneut geprueft",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `  if (istDeaktiviert(profil)) {
    return { ok: true, uebersprungen: true, veroeffentlicht: false, grund: "profil-deaktiviert" };
  }`,
    ersetzen: ``,
    erwarteRot: ["4.3"]
  },
  {
    name: "N6 — Falsches Gruen: auch ohne Narrativ wird veroeffentlicht gemeldet",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `  if (grund === "no-vorgaenge") {`,
    ersetzen: `  if (grund === "no-vorgaenge") {
    await melde(false, true, "narrativ-leer");
    return { ok: true, veroeffentlicht: true, grund: "no-vorgaenge" };
  }
  if (false) {`,
    erwarteRot: ["4.8"]
  },
  {
    name: "N7 — Budgetleckage: Cache-Treffer gibt auch WIEDERVERWENDETE Reservierung frei",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `        ungenutzt: Boolean(ungenutzt) && !reservierung.wiederverwendet,`,
    ersetzen: `        ungenutzt: Boolean(ungenutzt),`,
    erwarteRot: ["5.5"]
  },
  {
    name: "N8 — 48-h-Obergrenze des Budgetwartens im Narrativpfad entfernt",
    datei: "lib/helmut/scalable-pipeline.js",
    suchen: `      const entstanden = Date.parse(auftrag.createdAt || auftrag.created_at || "") || null;
      if (entstanden && jetztMs - entstanden > BUDGET_MAX_WARTE_MS) {
        throw new Error(\`budget-dauerhaft-erschoepft: \${Math.round((jetztMs - entstanden) / 3600000)} h\`
          + \` ohne freies KI-Budget (\${reservierung.grund || "unbekannt"})\`);
      }`,
    ersetzen: ``,
    erwarteRot: ["5.7"]
  },
  {
    name: "N9 — Doppelpfad: der Cron-Warteschlangenzweig faellt in die Direktschleife durch",
    datei: "server.js",
    suchen: "      if (scalablePipeline.narrativUeberWarteschlange()) {",
    ersetzen: "      if (false && scalablePipeline.narrativUeberWarteschlange()) {",
    erwarteRot: ["8.1", "8.2"]
  },
  {
    name: "N10 — Typvorgabe darf die Typmenge ERWEITERN (Quellenmodus-Riegel umgangen)",
    datei: "lib/helmut/worker-betrieb.js",
    suchen: `    const erlaubt = new Set(basisTypen || ALLE_TYPEN);
    typen = typenVorgabe.map(String).filter((t) => erlaubt.has(t));`,
    ersetzen: `    typen = typenVorgabe.map(String);`,
    erwarteRot: ["6.6"]
  },
  {
    name: "N11 — Worker kennt den fuenften Typ nicht mehr",
    datei: "lib/helmut/worker-betrieb.js",
    suchen: `const ALLE_TYPEN = Object.freeze([
  "source_fetch", "document_understanding", "mandate_projection", "briefing_materialization",
  "tenant_narrative"
]);`,
    ersetzen: `const ALLE_TYPEN = Object.freeze([
  "source_fetch", "document_understanding", "mandate_projection", "briefing_materialization"
]);`,
    erwarteRot: ["6.1"]
  },
  {
    name: "N12 — Morgenkorridor verschoben (Narrativ erst am Abend faellig)",
    datei: "lib/helmut/source-demand.js",
    suchen: `  const NARRATIV_PHASE = ["tenant_narrative", 240, 0.24, 1 / 3];`,
    ersetzen: `  const NARRATIV_PHASE = ["tenant_narrative", 240, 0.75, 0.90];`,
    erwarteRot: ["2.8"]
  }
];

function laufeSuite() {
  const r = spawnSync(process.execPath, [SUITE], {
    encoding: "utf8", cwd: ROOT, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, HELMUT_SOURCE_MODE: "off" }
  });
  const text = `${r.stdout || ""}${r.stderr || ""}`;
  const rot = [...text.matchAll(/^ {2}FAIL {2}([0-9.a-z]+)/gm)].map((m) => m[1]);
  return { code: r.status, rot, text };
}

function main() {
  console.log("Helmut — Mutationsprobe zum fuenften Auftragstyp tenant_narrative (E1)\n");

  const original = new Map();
  for (const m of MUTATIONEN) {
    const p = path.join(ROOT, m.datei);
    if (!original.has(p)) original.set(p, fs.readFileSync(p, "utf8"));
  }
  const zuruecksetzen = () => {
    for (const [p, inhalt] of original) fs.writeFileSync(p, inhalt, "utf8");
  };
  process.on("SIGINT", () => { zuruecksetzen(); process.exit(130); });

  let ok = 0;
  let schlecht = 0;
  try {
    console.log("== 0 · Ausgangslage: die Suite muss ohne Mutation GRUEN sein ==");
    const basis = laufeSuite();
    if (basis.code !== 0) {
      console.log(`  ABBRUCH — die Suite ist schon unmutiert rot (${basis.rot.join(", ") || "Testlauffehler"}).`);
      process.exitCode = 1;
      return;
    }
    console.log("  PASS  Basislauf gruen\n");

    for (const m of MUTATIONEN) {
      const p = path.join(ROOT, m.datei);
      const inhalt = original.get(p);
      if (!inhalt.includes(m.suchen)) {
        console.log(`  FEHLER  ${m.name}`);
        console.log(`          Der zu mutierende Text steht nicht (mehr) in ${m.datei}.`);
        schlecht += 1;
        continue;
      }
      fs.writeFileSync(p, inhalt.replace(m.suchen, m.ersetzen), "utf8");
      const r = laufeSuite();
      fs.writeFileSync(p, inhalt, "utf8");

      const getroffen = m.erwarteRot.filter((id) => r.rot.some((x) => x === id || x.startsWith(id)));
      const bestanden = r.code !== 0 && getroffen.length > 0;
      if (bestanden) {
        ok += 1;
        console.log(`  ROT     ${m.name}`);
        console.log(`          -> ${r.rot.join(", ")}`);
      } else {
        schlecht += 1;
        console.log(`  GRUEN   ${m.name}   << DER NACHWEIS IST WERTLOS`);
        console.log(`          erwartet rot: ${m.erwarteRot.join(", ")} · tatsaechlich rot: ${r.rot.join(", ") || "nichts"}`);
      }
    }
  } finally {
    zuruecksetzen();
  }

  let unversehrt = true;
  for (const [p, inhalt] of original) {
    if (fs.readFileSync(p, "utf8") !== inhalt) { unversehrt = false; console.log(`  ACHTUNG  ${p} weicht ab!`); }
  }

  console.log(`\n${"═".repeat(78)}`);
  console.log(`ERGEBNIS  ${ok}/${MUTATIONEN.length} Mutationen wurden erkannt (rot)`
    + `${schlecht ? ` · ${schlecht} NICHT erkannt` : ""}`);
  console.log(`Alle Dateien byte-identisch wiederhergestellt: ${unversehrt ? "ja" : "NEIN"}`);
  console.log("═".repeat(78));
  process.exit(schlecht === 0 && unversehrt ? 0 : 1);
}

main();
