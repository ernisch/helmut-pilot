"use strict";

// Helmut — Mutationsprobe OP-25 K2.1.
// =============================================================================================
// ZWECK: belegen, dass `scripts/vorgangskontext-test.js` die Zusagen von K2.1 wirklich
// absichert. Jede Probe verletzt GENAU EINE Zusage im Produktionscode und erwartet, dass die
// Suite ROT wird. Bleibt sie gruen, ist die Zusage nicht abgesichert — das ist der Befund, und
// er wird benannt statt versteckt.
//
// Verfahren: der Produktionscode wird in ein WEGWERF-Verzeichnis kopiert, dort mutiert und die
// Testsuite gegen die Kopie gefahren. Das Repository selbst wird NIE veraendert. Kein Netz,
// keine KI, keine Production-Daten.
//
// Aufruf: `node scripts/vorgangskontext-mutationsprobe.js`
// Ergebnis: „N von N rot" = die Suite haelt. Jede gruene Probe ist ein Loch.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ZU_KOPIEREN = ["lib", "scripts", "server.js", "vercel.json", "helmut-flags.json", "package.json", "docs", "supabase"];

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
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-k21-mutation-"));
  for (const name of ZU_KOPIEREN) {
    const q = path.join(ROOT, name);
    if (!fs.existsSync(q)) continue;
    const z = path.join(basis, name);
    if (fs.statSync(q).isDirectory()) kopiere(q, z);
    else { fs.mkdirSync(path.dirname(z), { recursive: true }); fs.copyFileSync(q, z); }
  }
  return basis;
}

// Eine Ersetzung im Quelltext. Wirft, wenn das Muster nicht (oder mehrdeutig) vorkommt — eine
// wirkungslose Mutation waere ein FALSCH GRUENES Ergebnis.
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
    execFileSync(process.execPath, [path.join(basis, "scripts", "vorgangskontext-test.js")], {
      cwd: basis, stdio: "pipe", timeout: 300000,
      env: { ...process.env, HELMUT_CRON_GLOBALABRUF: "", HELMUT_CRON_GLOBALPHASE: "" }
    });
    return { gruen: true };
  } catch (error) {
    const ausgabe = String((error.stdout || "") + (error.stderr || ""));
    const zeile = (ausgabe.match(/PASS \d+\s+FAIL \d+.*/) || [])[0] || (error.message || "").slice(0, 160);
    return { gruen: false, zeile };
  }
}

const K = "lib/helmut/vorgangskontext.js";
const S = "lib/helmut/scheduler.js";
const GP = "lib/helmut/cron-globalphase.js";

const PROBEN = [
  {
    name: "M1 · der Abruf laeuft wieder JE MANDAT (die Vereinigung wird beschnitten)",
    invariante: "jeder Abrufweg genau einmal, kein Weg geht verloren",
    mutiere: (b) => ersetze(b, GP,
      "      if (!id) continue;                       // ohne Kennung nicht planbar (Telemetrie schluesselt darauf)",
      "      if (!id || /-news$/.test(id)) continue;")
  },
  {
    name: "M2 · FREMDE Quellen beeinflussen das Clustering (alle Dokumente in EINEN Kontext)",
    invariante: "das lose Regime wirkt nie ueber die Sichtbarkeitsgrenze",
    mutiere: (b) => ersetze(b, K,
      "      schluessel = sichtbarkeitsSignatur(sicht.mandate);",
      "      schluessel = \"alle\";")
  },
  {
    name: "M3 · die KONTEXTGRENZE wird nicht mehr geprueft (die Probe meldet immer `ok`)",
    invariante: "eine verletzte Kontextgrenze faellt auf",
    mutiere: (b) => ersetze(b, K,
      "  return { ok: verletzungen.length === 0, verletzungen };\n}\n\n// Alle Kontextgrenzen auf einmal",
      "  return { ok: true, verletzungen: [] };\n}\n\n// Alle Kontextgrenzen auf einmal")
  },
  {
    name: "M4 · der DATENSTANDSRIEGEL wird entfernt (Projektion vor Abschluss der globalen Phase)",
    invariante: "kein Matching auf unversiegeltem Datenstand",
    mutiere: (b) => ersetze(b, GP,
      "  if (datenstand.versiegelt !== true) {\n    throw new Error(\"mandatsphase-vor-abschluss-der-globalen-phase\");\n  }",
      "  if (false) {\n    throw new Error(\"mandatsphase-vor-abschluss-der-globalen-phase\");\n  }")
  },
  {
    name: "M5 · der ALTPFAD wird bei ausgeschaltetem Flag veraendert",
    invariante: "ohne Flag exakt der bisherige Aufruf",
    mutiere: (b) => ersetze(b, "server.js",
      "  if (wahl.pfad === \"alt\") {\n    return runCronForTenants(cronName, (tenantId) => runSourceCrawl(tenantId), { deadlineMs, runId });\n  }",
      "  if (wahl.pfad === \"alt\") {\n    return runCronMitGlobalerPhase(cronName, { deadlineMs, runId, startedMs, buendelung: \"kontext\" });\n  }")
  },
  {
    name: "M6 · das Flag ist versehentlich DEFAULT AN",
    invariante: "Feature-Flag DEFAULT AUS, fail closed",
    mutiere: (b) => ersetze(b, K,
      "  const raw = String((env && env.HELMUT_CRON_GLOBALABRUF) || \"\").trim().toLowerCase();\n  return raw === \"on\" || raw === \"true\" || raw === \"1\" || raw === \"an\";",
      "  const raw = String((env && env.HELMUT_CRON_GLOBALABRUF) || \"\").trim().toLowerCase();\n  return raw !== \"off\";")
  },
  {
    name: "M7 · das Verstehensbudget wird je Kontext NEU vergeben statt geteilt (Budgeterhoehung)",
    invariante: "das Zeitbudget wird geteilt, nie erhoeht",
    mutiere: (b) => ersetze(b, K,
      "  for (let i = 1; i <= n; i += 1) scheiben.push(Math.round((gesamt * i) / n));",
      "  for (let i = 1; i <= n; i += 1) scheiben.push(gesamt * i);")
  },
  {
    name: "M8 · ein Zeitbudget wird im Quelltext still erhoeht",
    invariante: "kein Zeitbudget wird erhoeht",
    mutiere: (b) => ersetze(b, S,
      "      Number(process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS || 90000),",
      "      Number(process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS || 180000),",
      { erwarteteTreffer: 2 })
  },
  {
    name: "M9 · ein Cron wird still veraendert",
    invariante: "Cron-Zeiten und -Reihenfolge unveraendert",
    mutiere: (b) => ersetze(b, "vercel.json",
      "\"path\": \"/api/cron/crawl\",\n      \"schedule\": \"0 4 * * *\"",
      "\"path\": \"/api/cron/crawl\",\n      \"schedule\": \"0 3 * * *\"")
  },
  {
    name: "M10 · ein DOKUMENT GEHT VERLOREN (Dokumente ohne bekannte Sichtbarkeit fallen heraus)",
    invariante: "die Kontexteinteilung ist eine Partition",
    mutiere: (b) => ersetze(b, K,
      "      ohneSichtbarkeit.push(dokumentKennung(dokument, i));",
      "      ohneSichtbarkeit.push(dokumentKennung(dokument, i));\n      continue;")
  },
  {
    name: "M11 · WISSENSOBJEKTE werden unkontrolliert dupliziert (jedes Dokument bekommt einen eigenen Kontext)",
    invariante: "keine unkontrollierte KO-Vervielfachung",
    mutiere: (b) => ersetze(b, K,
      "      schluessel = sichtbarkeitsSignatur(sicht.mandate);",
      "      schluessel = `${sichtbarkeitsSignatur(sicht.mandate)}::${dokumentKennung(dokument, i)}`;")
  },
  {
    name: "M12 · die Zuordnung laeuft gegen den FALSCHEN Kontext (je-Dokument-Herkunft wird ignoriert)",
    invariante: "amtliche Vorgaenge werden nicht ueber die Quellenkennung geraten",
    mutiere: (b) => ersetze(b, K,
      "  // Je Dokument gefuehrte Herkunft hat Vorrang: sie ist die genauere Angabe.\n  for (const key of dokumentSchluessel(dokument)) {",
      "  // Je Dokument gefuehrte Herkunft hat Vorrang: sie ist die genauere Angabe.\n  for (const key of []) {")
  },
  {
    name: "M13 · die Einteilung wird REIHENFOLGEABHAENGIG (die Signatur wird nicht mehr sortiert)",
    invariante: "gleiche Eingabe, gleiche Einteilung — unabhaengig von der Reihenfolge",
    mutiere: (b) => ersetze(b, K,
      "    .filter(Boolean))].sort();\n  return menge.length ? menge.join(SIGNATUR_TRENNER) : null;",
      "    .filter(Boolean))];\n  return menge.length ? menge.join(SIGNATUR_TRENNER) : null;")
  },
  {
    name: "M14 · ein TEILZUSTAND gilt als vollstaendig",
    invariante: "kein falsches Gruen: teilweise ist nicht frisch",
    mutiere: (b) => ersetze(b, GP,
      "  return Boolean(datenstand && datenstand.versiegelt === true && datenstand.status === DATENSTAND_ABGESCHLOSSEN);",
      "  return Boolean(datenstand && datenstand.versiegelt === true);")
  },
  {
    name: "M15 · die PARTITIONSPRUEFUNG meldet immer `ok`",
    invariante: "ein verlorenes oder doppeltes Dokument faellt auf",
    mutiere: (b) => ersetze(b, K,
      "  return {\n    ok: fehlend.length === 0 && mehrfach.length === 0,\n    eingang: eingang.size,",
      "  return {\n    ok: true,\n    eingang: eingang.size,")
  },
  {
    name: "M16 · bei WIDERSPRUECHLICHEN Flaggen gewinnt der neue Pfad statt des Altpfads",
    invariante: "fail closed bei mehrdeutiger Konfiguration",
    mutiere: (b) => ersetze(b, GP,
      "  if (k1 && k21) {\n    return { pfad: \"alt\", grund: \"widersprechende-flaggen\", widerspruch: true };\n  }",
      "  if (k1 && k21) {\n    return { pfad: \"kontext\", grund: \"widersprechende-flaggen\", widerspruch: true };\n  }")
  },
  {
    name: "M17 · der KONTEXTVERTRAG ist kein Riegel mehr (eine Verletzung laeuft still weiter)",
    invariante: "eine Vertragsverletzung versiegelt FEHLGESCHLAGEN",
    mutiere: (b) => ersetze(b, S,
      "          fatal: true\n        });\n        return { datenstand: globalphase.datenstandVersiegeln(datenstand, { nowMs: now(), fehler }), ergebnis: null };",
      "          fatal: false\n        });")
  },
  {
    name: "M18 · das Flag wird ueber `helmut-flags.json` aktivierbar",
    invariante: "die Aktivierung bleibt eine Vercel-Env-Entscheidung des Betreibers",
    mutiere: (b) => ersetze(b, "lib/helmut/flags.js",
      "const FILE_FLAG_ALLOWLIST = Object.freeze([",
      "const FILE_FLAG_ALLOWLIST = Object.freeze([\n  \"HELMUT_CRON_GLOBALABRUF\",")
  }
];

(async () => {
  console.log("== Mutationsprobe OP-25 K2.1 (kontextgebundene Vorgangsbildung) ==\n");
  const vorprobe = baueArbeitskopie();
  const basisLauf = suiteLaeuft(vorprobe);
  console.log(`  ${basisLauf.gruen ? "OK  " : "FEHLER"} Vorprobe: unveraenderte Kopie ist ${basisLauf.gruen ? "gruen" : "ROT"}`);
  fs.rmSync(vorprobe, { recursive: true, force: true });
  if (!basisLauf.gruen) {
    console.error("ABBRUCH: die unveraenderte Kopie ist bereits rot — die Probe waere wertlos.");
    console.error(basisLauf.zeile);
    process.exit(1);
  }

  let rot = 0;
  const loecher = [];
  for (const probe of PROBEN) {
    const basis = baueArbeitskopie();
    let ergebnis;
    try {
      probe.mutiere(basis);
      ergebnis = suiteLaeuft(basis);
    } catch (error) {
      ergebnis = { gruen: true, zeile: `Mutation nicht anwendbar: ${error.message}` };
    }
    fs.rmSync(basis, { recursive: true, force: true });
    if (ergebnis.gruen) {
      loecher.push(probe);
      console.log(`  LOCH  ${probe.name}`);
      console.log(`        Zusage NICHT abgesichert: ${probe.invariante}`);
      if (ergebnis.zeile) console.log(`        ${ergebnis.zeile}`);
    } else {
      rot += 1;
      console.log(`  ROT   ${probe.name}`);
      console.log(`        ${ergebnis.zeile}`);
    }
  }

  console.log(`\n== ERGEBNIS ==\n${rot} von ${PROBEN.length} Proben rot, ${loecher.length} Loch/Loecher.`);
  if (!loecher.length) {
    console.log("Jede gepruefte Zusage von K2.1 ist durch die Suite abgesichert: eine spaetere");
    console.log("Aufweichung der Kontextgrenze kann nicht mehr still passieren.");
  }
  process.exit(loecher.length ? 1 : 0);
})().catch((error) => {
  console.error("PROBE-FEHLER:", error && error.stack);
  process.exit(1);
});
