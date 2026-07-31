"use strict";

// Helmut — Mutationsprobe OP-25 K1.
// =============================================================================================
// ZWECK: belegen, dass `scripts/cron-globalphase-test.js` die Invarianten von K1 wirklich
// absichert. Jede Probe verletzt GENAU EINE Invariante im Produktionscode und erwartet, dass
// die Suite ROT wird. Bleibt sie gruen, ist die Zusage nicht abgesichert — das ist der Befund.
//
// Verfahren: der Produktionscode wird in einem WEGWERF-Verzeichnis kopiert, dort mutiert und
// die Testsuite gegen die Kopie gefahren. Das Repository selbst wird NIE veraendert.
// Kein Netz, keine KI, keine Production-Daten.
//
// Aufruf: `node scripts/cron-globalphase-mutationsprobe.js`
// Ergebnis: „N von N rot" = die Suite haelt. Jede gruene Probe ist ein Loch.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ZU_KOPIEREN = ["lib", "scripts", "server.js", "vercel.json", "helmut-flags.json", "package.json", "docs"];

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
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-k1-mutation-"));
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
    execFileSync(process.execPath, [path.join(basis, "scripts", "cron-globalphase-test.js")], {
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

const PROBEN = [
  {
    name: "M1 · der globale Crawl laeuft wieder JE MANDAT (die Vereinigung wird ignoriert)",
    invariante: "globale Erfassung genau einmal je Lauf",
    mutiere: (b) => ersetze(b, "lib/helmut/scheduler.js",
      "const plan = globalphase.planGlobaleQuellen({ profilQuellen });",
      "const plan = globalphase.planGlobaleQuellen({ profilQuellen: profilQuellen.slice(0, 1) });")
  },
  {
    name: "M2 · eine Personenquelle geht bei der Vereinigung verloren",
    invariante: "jede mandatsindividuelle Personenquelle bleibt erhalten",
    mutiere: (b) => ersetze(b, "lib/helmut/cron-globalphase.js",
      "      if (!id) continue;                       // ohne Kennung nicht planbar (Telemetrie schluesselt darauf)",
      "      if (!id || /-news$/.test(id)) continue;")
  },
  {
    name: "M3 · ein gemeinsamer Weg wird mehrfach geplant (Entdoppelung ausgehebelt)",
    invariante: "jede Quellenkennung genau einmal in der Vereinigung",
    mutiere: (b) => ersetze(b, "lib/helmut/cron-globalphase.js",
      "      if (!indexById.has(id)) {",
      "      if (true) {")
  },
  {
    name: "M4 · Matching laeuft VOR Abschluss der globalen Phase (Riegel entfernt)",
    invariante: "keine Projektion auf unversiegeltem Datenstand",
    mutiere: (b) => ersetze(b, "lib/helmut/cron-globalphase.js",
      "  if (datenstand.versiegelt !== true) {\n    throw new Error(\"mandatsphase-vor-abschluss-der-globalen-phase\");\n  }",
      "  if (false) {\n    throw new Error(\"mandatsphase-vor-abschluss-der-globalen-phase\");\n  }")
  },
  {
    name: "M5 · ein fehlgeschlagener globaler Lauf gilt trotzdem als verwendbar",
    invariante: "kein Mandatserfolg auf gescheiterter Erfassung",
    mutiere: (b) => ersetze(b, "lib/helmut/cron-globalphase.js",
      "    && datenstand.status !== DATENSTAND_FEHLGESCHLAGEN\n  );",
      "  );")
  },
  {
    name: "M6 · ein TEILWEISER Datenstand wird als frisch ausgegeben",
    invariante: "kein veralteter Datenstand gilt als frisch",
    mutiere: (b) => ersetze(b, "lib/helmut/cron-globalphase.js",
      "  return Boolean(datenstand && datenstand.versiegelt === true && datenstand.status === DATENSTAND_ABGESCHLOSSEN);",
      "  return Boolean(datenstand && datenstand.versiegelt === true);")
  },
  {
    name: "M7 · das neue Flag ist versehentlich standardmaessig aktiv",
    invariante: "Feature-Flag DEFAULT AUS",
    mutiere: (b) => ersetze(b, "lib/helmut/cron-globalphase.js",
      "  return raw === \"on\" || raw === \"true\" || raw === \"1\" || raw === \"an\";",
      "  return raw !== \"off\";")
  },
  {
    name: "M8 · das alte Verhalten aendert sich bei deaktiviertem Flag",
    invariante: "ohne Flag exakt der bisherige Aufruf",
    // K2.1 (2026-07-31): die Pfadwahl liegt jetzt in `waehleCronPfad()`. Die Mutation ist
    // dieselbe geblieben — der Alt-Zweig fuehrt statt `runSourceCrawl` die globale Phase aus.
    mutiere: (b) => ersetze(b, "server.js",
      "  if (wahl.pfad === \"alt\") {\n    return runCronForTenants(cronName, (tenantId) => runSourceCrawl(tenantId), { deadlineMs, runId });\n  }",
      "  if (wahl.pfad === \"alt\") {\n    return runCronMitGlobalerPhase(cronName, { deadlineMs, runId, startedMs });\n  }")
  },
  {
    name: "M9 · die Landesmodulsperre wird bei der Vereinigung umgangen",
    invariante: "Berlin/Brandenburg bleiben bei null aktiven Landeswegen",
    mutiere: (b) => ersetze(b, "lib/helmut/scheduler.js",
      "  const sharedSources = sharedRaw.filter((s) => !landesmodulQuelleGesperrt(s, erlaubteLaender)\n    && sourceAllowedForProfile(s, ctx));",
      "  const sharedSources = sharedRaw.filter((s) => sourceAllowedForProfile(s, ctx));")
  },
  {
    name: "M10 · ein Zeitbudget wird still erhoeht",
    invariante: "kein Zeitbudget wird erhoeht",
    mutiere: (b) => ersetze(b, "lib/helmut/scheduler.js",
      "      Number(process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS || 90000),",
      "      Number(process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS || 180000),",
      { erwarteteTreffer: 2 })
  },
  {
    name: "M11 · ein Cron wird still veraendert",
    invariante: "Cron-Zeiten und -Reihenfolge unveraendert",
    mutiere: (b) => ersetze(b, "vercel.json",
      "\"path\": \"/api/cron/crawl\",\n      \"schedule\": \"0 4 * * *\"",
      "\"path\": \"/api/cron/crawl\",\n      \"schedule\": \"0 3 * * *\"")
  },
  {
    name: "M12 · die Mandatsphase schwaecht die Sperre `crawl-<mandat>`",
    invariante: "bestehende Sperren werden nicht geschwaecht",
    mutiere: (b) => ersetze(b, "lib/helmut/scheduler.js",
      "  const locked = await deps.acquireLock(lockName, GLOBALPHASE_LOCK_TTL_MS);\n  if (!locked) {\n    console.warn(`[mandatsprojektion] Job laeuft bereits fuer ${politicianId}, uebersprungen.`);\n    return { skipped: true, reason: \"already running\" };\n  }",
      "  const locked = true;")
  },
  {
    name: "M13 · die globale Phase erledigt zusaetzlich das Matching (Trennung aufgehoben)",
    invariante: "globale Phase fuehrt kein Matching aus",
    mutiere: (b) => ersetze(b, "lib/helmut/scheduler.js",
      "    // 9. VERSIEGELN. Erst ab hier darf projiziert werden.",
      "    for (const p of profileInReihenfolge) await deps.matching({ profile: p, pipelineRunId: laufId, ausloeser: \"global\" }).catch(() => null);\n    // 9. VERSIEGELN. Erst ab hier darf projiziert werden.")
  },
  {
    name: "M14 · ein fehlerhaftes Profil reisst die globale Versorgung mit",
    invariante: "Fehlerisolation je Profil bei der Planbildung",
    mutiere: (b) => ersetze(b, "lib/helmut/scheduler.js",
      "      } catch (error) {\n        console.error(`[globalphase] Quellenplan fuer ein Profil fehlgeschlagen (isoliert): ${error && error.message}`);\n        profilQuellen.push({ politicianId: String(profil.id), fehler: String((error && error.message) || \"unbekannt\") });\n      }",
      "      } catch (error) {\n        throw error;\n      }")
  },
  {
    name: "M15 · die Telemetrie vermischt globale und mandatsbezogene Laufzustaende",
    invariante: "globaler Lauf und Mandatslauf bleiben getrennt",
    mutiere: (b) => ersetze(b, "lib/helmut/scheduler.js",
      "      mode: \"global\",\n      // MANDANTENNEUTRAL",
      "      mode: \"mandat\",\n      // MANDANTENNEUTRAL")
  },
  {
    name: "M16 · das Abrufbudget der globalen Phase wird ignoriert",
    invariante: "das globale Zeitbudget begrenzt auch den Abruf",
    mutiere: (b) => ersetze(b, "lib/helmut/scheduler.js",
      "      if (verbleibendMs() <= 0) { nichtAbgerufen = plan.quellen.length - i; break; }",
      "      if (false) { nichtAbgerufen = plan.quellen.length - i; break; }")
  },
  {
    name: "M17 · die Budgetaufteilung erhoeht das Gesamtbudget statt es zu teilen",
    invariante: "kein Zeitbudget wird erhoeht",
    mutiere: (b) => ersetze(b, "lib/helmut/cron-globalphase.js",
      "  const nachReserve = Math.max(untergrenze, rest - reserveRoh);",
      "  const nachReserve = Math.max(untergrenze, rest + reserveRoh);")
  }
];

(async () => {
  console.log("== Mutationsprobe OP-25 K1 ==");
  console.log("Jede Probe verletzt genau eine Invariante. ERWARTET: die Suite wird ROT.\n");

  // Vorprobe: die UNVERAENDERTE Kopie muss gruen sein — sonst misst die Probe nichts.
  const referenz = baueArbeitskopie();
  const vorprobe = suiteLaeuft(referenz);
  console.log(`  ${vorprobe.gruen ? "OK  " : "FEHLER"} Vorprobe: unveraenderte Kopie ist ${vorprobe.gruen ? "gruen" : "ROT — die Probe misst nichts!"}`);
  fs.rmSync(referenz, { recursive: true, force: true });
  if (!vorprobe.gruen) {
    console.log(`\n  Ausgabe: ${vorprobe.zeile}`);
    process.exit(1);
  }

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
      console.log(`        Invariante NICHT abgesichert: ${probe.invariante}`);
      if (ergebnis.zeile) console.log(`        ${ergebnis.zeile}`);
    } else {
      rot += 1;
      console.log(`  ROT   ${probe.name}`);
      console.log(`        ${ergebnis.zeile}`);
    }
  }

  console.log(`\n== ERGEBNIS ==\n${rot} von ${PROBEN.length} Proben rot, ${gruen} Loch/Loecher.`);
  if (!gruen) console.log("Jede gepruefte Invariante von K1 ist durch die Suite abgesichert.");
  process.exit(gruen ? 1 : 0);
})().catch((e) => { console.error("PROBENFEHLER:", e && e.stack); process.exit(1); });
