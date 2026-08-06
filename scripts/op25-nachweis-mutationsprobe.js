"use strict";

// OP-25 — Mutationsprobe des Nachweisvertrags und der E3-Telemetrie.
// =============================================================================================
// ZWECK: belegen, dass `scripts/op25-nachweis-vertrag-test.js` und
// `scripts/op25-e3-dauerhaftigkeit-test.js` die zentralen Zusicherungen WIRKLICH absichern.
// Jede Probe verletzt GENAU EINE Zusage im Produktions-/Vertragscode und erwartet, dass die
// zugehoerige Suite ROT wird. Bleibt sie gruen, ist die Zusage nicht abgesichert — und genau
// das waere der Befund.
//
// Verfahren (Repo-Konvention, Muster globalphase-buendelung-mutationsprobe): der Code wird in
// ein WEGWERF-Verzeichnis kopiert, dort mutiert und die Suite gegen die Kopie gefahren.
// Das Repository selbst wird NIE veraendert. Kein Netz, keine KI, keine Production-Daten.
//
// Aufruf:  `node scripts/op25-nachweis-mutationsprobe.js`
// Ergebnis: „N von N rot" = die Suiten halten. Jede gruene Probe ist ein Loch.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ZU_KOPIEREN = ["lib", "scripts", "vercel.json", "helmut-flags.json", "package.json"];

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
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-op25-mutation-"));
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
    throw new Error(`Mutation trifft ${treffer}x statt ${erwarteteTreffer}x in ${datei}: ${von.slice(0, 60)}…`);
  }
  fs.writeFileSync(p, src.split(von).join(nach));
}

function laeuftGruen(basis, suite) {
  try {
    execFileSync(process.execPath, [path.join(basis, "scripts", suite)], {
      stdio: "pipe", timeout: 180000, env: { ...process.env, HELMUT_STORAGE_BACKEND: "local" }
    });
    return true;
  } catch (_) {
    return false;
  }
}

const KERN = path.join("lib", "helmut", "op25-nachweis.js");
const CLI_DATEI = path.join("scripts", "op25-production-nachweis.js");
const SCHED = path.join("lib", "helmut", "scheduler.js");
const STORE = path.join("lib", "helmut", "storage.js");
const UNDER = path.join("lib", "helmut", "understanding.js");
const VERTRAG_SUITE = "op25-nachweis-vertrag-test.js";
const E3_SUITE = "op25-e3-dauerhaftigkeit-test.js";
// Korrektursprint K1-K8 (2026-08-05): zwei weitere Suiten als Mutationsziele.
const LAUFPAAR_SUITE = "op25-laufpaar-test.js";
const WATCHDOG_SUITE = "watchdog-pipeline-check-test.js";
const WATCHDOG_SKRIPT = path.join("scripts", "watchdog-pipeline-check.js");

const PROBEN = [
  {
    name: "M1 Dauerhaftigkeitsregel: nichtVorgemerkt wird ignoriert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "&& Number(eager.nichtVorgemerkt) === 0;",
      "&& true;")
  },
  {
    name: "M2 24-h-Mindestfenster wird auf 1 h gelockert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "const MIN_FENSTER_MS = 24 * 60 * 60 * 1000;",
      "const MIN_FENSTER_MS = 1 * 60 * 60 * 1000;")
  },
  {
    name: "M3 Harte Untergrenze 2026-08-04 (03.08-Lauf-Schutz) faellt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      'const FRUEHESTER_FENSTERSTART_MS = Date.parse("2026-08-04T00:00:00Z");',
      'const FRUEHESTER_FENSTERSTART_MS = Date.parse("2026-08-01T00:00:00Z");')
  },
  {
    name: "M4 Vorrang kippt: Belegluecke schlaegt bewiesene Verletzung",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (hat(AUSGANG_NICHT_BESTANDEN)) return ergebnis(AUSGANG_NICHT_BESTANDEN, laufErgebnisse, zusatz);\n  if (hat(AUSGANG_BLOCKIERT)) return ergebnis(AUSGANG_BLOCKIERT, laufErgebnisse, zusatz);",
      "  if (hat(AUSGANG_BLOCKIERT)) return ergebnis(AUSGANG_BLOCKIERT, laufErgebnisse, zusatz);\n  if (hat(AUSGANG_NICHT_BESTANDEN)) return ergebnis(AUSGANG_NICHT_BESTANDEN, laufErgebnisse, zusatz);")
  },
  {
    name: "M5 Persistenz 'fehlend' gilt ploetzlich als belegt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      'if (!p || p.ergebnis !== "ok") {',
      "if (false) {")
  },
  {
    name: "M6 Fehlende Mandatslaeufe werden nicht mehr geprueft",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "if (fehlend.length) {",
      "if (false) {")
  },
  {
    name: "M13 Unbekannte Kontexte brauchen keine Erklaerung mehr",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "if ((Number(k.unbekannt) || 0) > 0 && !kontextErklaerung) {",
      "if (false) {")
  },
  {
    name: "M14 Slot-Toleranz waechst auf 6 h — manuelle Laeufe wuerden regulaere ersetzen",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "const SLOT_TOLERANZ_MS = 15 * 60 * 1000;",
      "const SLOT_TOLERANZ_MS = 6 * 60 * 60 * 1000;")
  },
  {
    name: "M7 budgetErschoepft ignoriert uebersprungene Lazy-Stapel",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      "budgetErschoepft: verbleibendMs() <= 0 || lazyRan < lazyCluster || lazyUebersprungeneStapel > 0,",
      "budgetErschoepft: verbleibendMs() <= 0 || lazyRan < lazyCluster,")
  },
  {
    name: "M8 Persistenzfehler wird wieder stilles Gruen",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      'if (savedItems.length && !persistenzOk) {\n      fehler.push({ schritt: "persistenz", grund: "persistenz-fehlgeschlagen-oder-unbekannt" });\n    }',
      "")
  },
  {
    name: "M9 Uebersprungene Eager-Stapel verlieren ihre Dokumentzahl",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      'eagerErgebnisse.push({ skipped: true, reason: "zeitbudget", processed: 0, deferred: 0, dokumente: teil.dokumente.length });',
      'eagerErgebnisse.push({ skipped: true, reason: "zeitbudget", processed: 0, deferred: 0 });')
  },
  {
    name: "M10 Eager-Bilanz verschluckt nichtVorgemerkt wieder",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      "nichtVorgemerkt: eagerErgebnisse.reduce((s, e) => s + (Number(e && e.nichtVorgemerkt) || 0), 0),",
      "nichtVorgemerkt: 0,")
  },
  {
    name: "M11 compactCrawlRunForStore strippt datenstandDetail wieder",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, STORE,
      "datenstandDetail: compactDatenstandDetail(run.datenstandDetail),",
      "datenstandDetail: null,")
  },
  {
    name: "M12 Zurueckgestellte Cluster werden nicht mehr vorgemerkt",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, UNDER,
      "const vermerk = await deps.savePending(vorgangId, {",
      "const vermerk = null && await deps.savePending(vorgangId, {")
  },

  // --- Review-Haertung 1: Kostenvertrag ------------------------------------------------------
  {
    name: "M15 Kostenzahlen werden nicht mehr validiert (NaN/negativ passieren)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  return typeof wert === \"number\" && Number.isFinite(wert) && wert >= 0;",
      "  return true;")
  },
  {
    name: "M16 alsZahl deutet null wieder still in 0 um",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (wert == null || wert === \"\") return null;",
      "  if (wert === \"\") return null;")
  },
  {
    name: "M17 Vollstaendigkeit der Kostendaten wird nicht mehr verlangt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (kosten.vollstaendig !== true) {",
      "  if (false) {")
  },
  {
    name: "M18 Unbepreiste Nutzungseintraege werden ignoriert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  } else if (unbepreist > 0) {",
      "  } else if (false) {")
  },

  // --- Review-Haertung 2: eingefrorene Mandatsmenge ------------------------------------------
  {
    name: "M19 Mandatsmenge wird wieder nur nach ANZAHL verglichen (Austausch unsichtbar)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  } else if (!mengeGleich(geplanteIds, mandatsMenge)) {",
      "  } else if (geplanteIds.length !== mandatsMenge.length) {")
  },
  {
    name: "M20 Fehlende Startbaseline wird durch den AKTUELLEN Bestand ersetzt",
    suite: VERTRAG_SUITE,
    // Genau die Regression, die der Review beschreibt: statt zu blockieren wird die Menge
    // still aus dem AKTUELLEN Bestand gebildet — der Zustand am Fensterstart wäre erfunden.
    // (Der Ersatz traegt absichtlich einen zur Fixture passenden vollen Commit, damit die
    // Probe GENAU die Baseline-Ersetzung testet und nicht an der Commitpflicht scheitert.)
    mutiere: (b) => ersetze(b, KERN,
      "  const baselinePruefung = pruefeStartbaseline({\n    roh: startbaseline, aktivierungAtMs, jetztMs, commitGegenprobe\n  });",
      "  const ersatz = startbaseline || {\n"
      + "    mandate: aktiveMandate || [], anzahl: (aktiveMandate || []).length,\n"
      + "    signatur: mandatsSignatur(aktiveMandate || []).signatur,\n"
      + "    erwarteterDeploymentCommit: \"89427c5b5aac4b362d2040c7b71bde8d52c1085d\",\n"
      + "    aktivierungAtMs, erhobenAtMs: aktivierungAtMs\n"
      + "  };\n"
      + "  const baselinePruefung = pruefeStartbaseline({\n    roh: ersatz, aktivierungAtMs, jetztMs, commitGegenprobe\n  });")
  },
  {
    name: "M21 Endzustand wird nicht mehr gegen die eingefrorene Menge geprueft",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (endzustand.signatur !== frozen.signatur) {",
      "  if (endzustand.anzahl !== frozen.anzahl) {")
  },
  {
    name: "M22 Laeufe ohne Mandatskennungen gelten wieder als geprueft",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (!Array.isArray(geplanteIds)) {",
      "  if (false) {")
  },

  // --- Review-Haertung 3: dauerhafte Quelle, Aufbewahrung, versiegelte Dauer -----------------
  {
    name: "M23 Dauerhafte Laufzeile wird nicht mehr konsultiert (verdraengt = fehlend)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    if (prozessLauf) {\n      befunde.push(befund(AUSGANG_BLOCKIERT, \"laufbeleg-verdraengt\",",
      "    if (false) {\n      befunde.push(befund(AUSGANG_BLOCKIERT, \"laufbeleg-verdraengt\",")
  },
  {
    name: "M24 Aufbewahrungsvertrag faellt weg (Retention kleiner als Bedarf passiert)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  } else if (benoetigteDatensaetze > retention) {",
      "  } else if (false) {")
  },
  {
    name: "M25 Budget wird wieder am VOR dem Versiegeln gebildeten durationMs geprueft",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    if (alsZahl(vermerk.dauerMs) !== null) versiegelteDauerMs = alsZahl(vermerk.dauerMs);",
      "    if (alsZahl(globalerLauf.durationMs) !== null) versiegelteDauerMs = alsZahl(globalerLauf.durationMs);")
  },
  {
    name: "M26 Fehlende versiegelte Laufzeit wird stillschweigend hingenommen",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (versiegelteDauerMs == null || versiegeltesBudgetMs == null) {",
      "  if (false) {")
  },
  {
    name: "M27 Widerspruch zwischen dauerhafter Zeile und Vermerk wird verschluckt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    if (alsZahl(prozessLauf.durationMs) !== null && versiegelteDauerMs != null",
      "    if (false && alsZahl(prozessLauf.durationMs) !== null && versiegelteDauerMs != null")
  },

  // --- Die neuen Belegfelder im Produktionscode ----------------------------------------------
  {
    name: "M28 Laufdatensatz traegt die Mandatskennungen nicht mehr",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      "        mandateIds: [...tenantIds]",
      "        mandateIds: undefined")
  },
  {
    name: "M29 Budget wandert nicht mehr in den versiegelten Datenstand",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      "      budgetMs,\n      quellen: plan.gesamt,",
      "      quellen: plan.gesamt,")
  },
  {
    name: "M30 compactQuellenVereinigung strippt die Mandatskennungen",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, STORE,
      "    mandateIds: Array.isArray(value.mandateIds)\n      ? value.mandateIds.slice(0, 200).map((id) => String(id).slice(0, 80))\n      : null",
      "    mandateIds: null")
  },
  {
    name: "M31 compactDatenstandVermerk strippt die versiegelte Dauer",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, STORE,
      "    dauerMs: num(value.dauerMs),\n    budgetMs: num(value.budgetMs)",
      "    dauerMs: null,\n    budgetMs: null")
  },

  // --- Review 2, Punkt 1: der echte Kostenleser ---------------------------------------------
  {
    name: "M32 Kostenleser deutet rohe Nicht-Zahlen wieder um (\"1.20\", true, null)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    if (!istBrauchbareKostenzahl(roh)) { unbepreist += 1; continue; }\n    summe += roh;",
      "    const z = typeof roh === \"number\" ? roh : Number(roh);\n"
      + "    if (!Number.isFinite(z) || z < 0) { unbepreist += 1; continue; }\n    summe += z;")
  },
  {
    name: "M33 Eintraege ohne lesbaren Zeitstempel werden wieder still uebersprungen",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (nichtZuordenbar > 0) {",
      "  if (false) {")
  },
  {
    name: "M34 Kaputte Zeitstempel gelten wieder als zuordenbar (Date.parse auf alles)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    const t = (typeof roherStempel === \"string\" && roherStempel.trim())\n      ? Date.parse(roherStempel)\n      : NaN;\n    if (!Number.isFinite(t)) { nichtZuordenbar += 1; continue; }",
      "    const t = Date.parse(roherStempel || \"\");\n    if (!Number.isFinite(t)) { continue; }")
  },
  {
    name: "M35 Verdraengte Nutzungsliste gilt wieder als vollstaendig",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (grenze !== null && alle.length >= grenze && Number.isFinite(aeltesterMs) && aeltesterMs > vonMs) {",
      "  if (false) {")
  },

  // --- Review 2, Punkt 2: Startbaseline vollstaendig fail closed ----------------------------
  {
    name: "M36 Fehlende Baseline-Signatur wird wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (typeof roh.signatur !== \"string\" || !roh.signatur.trim()) {",
      "  if (false) {")
  },
  {
    name: "M37 Fehlender Aktivierungszeitpunkt in der Baseline wird wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (baselineAktivierungMs === null) {\n    return fehler(\"startbaseline-aktivierung-fehlt\",",
      "  if (false) {\n    return fehler(\"startbaseline-aktivierung-fehlt\",")
  },
  {
    name: "M38 Fehlender Erhebungszeitpunkt in der Baseline wird wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (baselineErhobenMs === null) {\n    return fehler(\"startbaseline-erhebung-fehlt\",",
      "  if (false) {\n    return fehler(\"startbaseline-erhebung-fehlt\",")
  },
  {
    name: "M39 Fehlende/widerspruechliche Mandatsanzahl wird wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (anzahl !== frozen.anzahl) {",
      "  if (false) {")
  },
  {
    name: "M40 Ungueltige Mandatseintraege (leer/Nicht-Zeichenkette) werden wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (!roh.mandate.every((id) => typeof id === \"string\" && id.trim())) {",
      "  if (false) {")
  },
  {
    name: "M41 baselineZeit deutet null wieder in 0 um",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  const alsMs = alsZahl(roh);\n  if (alsMs !== null) return alsMs;",
      "  const alsMs = Number(roh);\n  if (Number.isFinite(alsMs)) return alsMs;")
  },

  // --- Review 3, Punkt 1: das Erhebungsfenster der Startbaseline ----------------------------
  {
    name: "M42 Baseline VOR der Aktivierung wird wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (baselineErhobenMs < baselineAktivierungMs) {",
      "  if (false) {")
  },
  {
    name: "M43 Zu spaete Erhebung wird wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (baselineErhobenMs > baselineAktivierungMs + toleranzMs) {",
      "  if (false) {")
  },
  {
    name: "M44 Toleranz haengt wieder am Fensterstart statt an der Aktivierung",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "const BASELINE_TOLERANZ_MS = 15 * 60 * 1000;",
      "const BASELINE_TOLERANZ_MS = 24 * 60 * 60 * 1000;")
  },
  {
    name: "M45 Zukuenftige Aktivierung wird in der Baseline-Pruefung wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (jetzt !== null && baselineAktivierungMs > jetzt) {",
      "  if (false) {")
  },
  {
    name: "M46 Zukuenftige Aktivierung wird in der Gesamtbewertung wieder durchgelassen",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (Number(aktivierungAtMs) > jetztMs) {",
      "  if (false) {")
  },

  // --- Review 4: die Commitpruefung ---------------------------------------------------------
  {
    name: "M47 SHA-Formatpruefung entfernt (Nicht-Hex wird wieder akzeptiert)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  return COMMIT_MUSTER.test(s) ? s : null;",
      "  return s;")
  },
  {
    name: "M48 Mindestlaenge entfernt (zu kurze Werte werden wieder akzeptiert)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (s.length < COMMIT_MIN_LAENGE || s.length > COMMIT_MAX_LAENGE) return null;",
      "  if (s.length > COMMIT_MAX_LAENGE) return null;")
  },
  {
    name: "M49 Obergrenze entfernt (SHA mit hexadezimalem Anhang wird wieder akzeptiert)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (s.length < COMMIT_MIN_LAENGE || s.length > COMMIT_MAX_LAENGE) return null;",
      "  if (s.length < COMMIT_MIN_LAENGE) return null;")
  },
  {
    name: "M50 Erwarteter Baseline-Commit wieder ohne Formatpruefung uebernommen (angehaengter Unsinn passiert)",
    suite: VERTRAG_SUITE,
    // Die Familie des alten startsWith-Befunds: der erwartete Wert wird wieder roh
    // uebernommen, ohne dass er selbst eine gueltige volle SHA sein muss.
    mutiere: (b) => ersetze(b, KERN,
      "  const erwarteterCommit = normalisiereVollenCommit(commitRoh);",
      "  const erwarteterCommit = String(commitRoh).trim().toLowerCase();")
  },
  {
    name: "M51 Abweichender Fensterlauf-Commit wird wieder bestaetigt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  return { ergebnis: \"abweichend\", beobachtet: ist };",
      "  return { ergebnis: \"bestaetigt\", beobachtet: ist };")
  },
  {
    name: "M52 Praefixpruefung nicht mehr STRIKT (gleich lange Werte gelten als Praefix)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  return kurz.length < lang.length && lang.startsWith(kurz);",
      "  return lang.startsWith(kurz);")
  },
  {
    name: "M53 Ungueltiger erwarteter Baseline-Commit faellt nicht mehr durch",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (erwarteterCommit === null) {\n    return fehler(\"startbaseline-erwarteter-commit-ungueltig\",",
      "  if (false) {\n    return fehler(\"startbaseline-erwarteter-commit-ungueltig\",")
  },
  {
    name: "M54 Ungueltiger BEOBACHTETER commit_ref wird wieder als Beleg akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (ist === null) return { ergebnis: \"fehlt\", beobachtet: null };",
      "  if (ist === null) return { ergebnis: \"bestaetigt\", beobachtet: null };")
  },

  // --- Nachtragskorrektur 2026-08-04/5: deploymentgebundene Baseline + Commitnachweis --------
  {
    name: "M55 Baseline OHNE erwarteten Commit wird wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (commitRoh == null || (typeof commitRoh === \"string\" && !commitRoh.trim())) {",
      "  if (false) {")
  },
  {
    name: "M56 Kurzform wird wieder als erwarteter Baseline-Commit akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  const erwarteterCommit = normalisiereVollenCommit(commitRoh);",
      "  const erwarteterCommit = normalisiereCommit(commitRoh);")
  },
  {
    name: "M57 Vorab-Bestaetigung (deploymentCommitBestaetigt) wird wieder akzeptiert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (roh.deploymentCommitBestaetigt) {",
      "  if (false) {")
  },
  {
    name: "M58 Fensterlauf ohne gueltigen commit_ref blockiert nicht mehr",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "      befunde.push(befund(AUSGANG_BLOCKIERT, \"commit-beleg-fehlt\",\n        `${p.runId}: die dauerhafte Laufzeile traegt keinen gueltigen commit_ref —`",
      "      false && befunde.push(befund(AUSGANG_BLOCKIERT, \"commit-beleg-fehlt\",\n        `${p.runId}: die dauerhafte Laufzeile traegt keinen gueltigen commit_ref —`")
  },
  {
    name: "M59 Alte Prozesslaeufe VOR dem Fenster werden ploetzlich mitgeprueft",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    if (!zumFenster) {",
      "    if (false) {")
  },
  {
    name: "M60 Fehlende dauerhafte Zeile ist wieder nur eine Warnung",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    befunde.push(befund(AUSGANG_BLOCKIERT, \"commit-beleg-fehlt\",\n      `${slotName}: keine dauerhafte Laufzeile (process_runs/globalphase) — ohne sie fehlt`",
      "    warnungen.push((\n      `${slotName}: keine dauerhafte Laufzeile (process_runs/globalphase) — ohne sie fehlt`")
  },
  {
    name: "M61 Praefix-commit_ref gilt wieder als exakte Bestaetigung",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (istEchtesPraefix(ist, soll)) return { ergebnis: \"unvollstaendig\", beobachtet: ist };",
      "  if (istEchtesPraefix(ist, soll)) return { ergebnis: \"bestaetigt\", beobachtet: ist };")
  },
  {
    name: "M62 Gegenprobe des erwarteten Commits an der Auswertung entfaellt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (commitGegenprobe != null && commitGegenprobe !== \"\") {",
      "  if (false) {")
  },
  {
    name: "M63 Exakte runId-Bindung der dauerhaften Zeile faellt zurueck auf reine Slotzuordnung",
    suite: VERTRAG_SUITE,
    // Exakt die Regression aus der Review zu PR #223: eine ANDERE globalphase-Zeile
    // innerhalb der Slot-Toleranz koennte den fehlenden exakten Beleg wieder ersetzen.
    mutiere: (b) => ersetze(b, KERN,
      "    const prozessLauf = globalerLauf\n      ? dauerhafte.find((p) => p && p.runId === globalerLauf.runId) || null\n      : dauerhafte.find((p) => passt(p.runId)) || null;",
      "    const prozessLauf = dauerhafte.find((p) => passt(p.runId)) || null;")
  },

  // --- Review-Nachprobe (adversariale Gegenpruefung des PR-#223-Stands) ----------------------
  {
    name: "M64 Unplatzierbare globalphase-Zeile ist wieder nur eine Warnung (Fail-open)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "        befunde.push(befund(AUSGANG_BLOCKIERT, \"prozesszeile-nicht-zuordenbar\",",
      "        warnungen.push(befund(AUSGANG_BLOCKIERT, \"prozesszeile-nicht-zuordenbar\",")
  },
  {
    name: "M65 Lesefehler der relationalen process_runs wird wieder ignoriert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (prozessLaeufeLesefehler != null && prozessLaeufeLesefehler !== \"\") {",
      "  if (false) {")
  },
  {
    name: "M66 createdAt-Rueckfallebene des Fenster-Sweeps gestrichen",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    const startMs = startZeile ? startZeile.startMs : Date.parse((p && p.createdAt) || \"\");",
      "    const startMs = startZeile ? startZeile.startMs : NaN;")
  },
  {
    name: "M67 Slot-Zuordnungsklausel des Fenster-Sweeps gestrichen",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "      || (startZeile && slots.some((s) => s.cronName === startZeile.cronName\n        && Math.abs(startZeile.startMs - s.geplantMs) <= SLOT_TOLERANZ_MS));",
      "      || false;")
  },
  {
    name: "M68 CLI: Arg-Gate fuer den vollen erwarteten Commit entfernt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, CLI_DATEI,
      "    if (vertrag.normalisiereVollenCommit(args[\"erwarteter-commit\"]) === null) {",
      "    if (false) {")
  },
  {
    name: "M69 CLI: Arg-Gate fuer den Aktivierungszeitpunkt entfernt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, CLI_DATEI,
      "    if (!Number.isFinite(aktivierungFruehMs)) {",
      "    if (false) {")
  },
  // ------------------------------------------------------------------------------------------
  // Korrektursprint K1-K8 (2026-08-05): jede Korrektur hat mindestens eine Probe, die ihre
  // Ruecknahme zuverlaessig rot macht.
  // ------------------------------------------------------------------------------------------
  {
    name: "M70 K1: Rueckkehr zum alten Join (m.runId === laufkennung) — echtes Laufpaar faellt durch",
    suite: LAUFPAAR_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      '&& typeof m.globalLaufId === "string" && m.globalLaufId === globalerLauf.runId);',
      '&& m.runId === String(globalerLauf.runId || "").replace(/-global$/, ""));')
  },
  {
    name: "M71 K1: Mehrdeutigkeitspruefung der Bindung entfernt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    if (anzahl > 1) {",
      "    if (false) {")
  },
  {
    name: "M72 K1: Sweep fuer ungebundene Mandatszeilen entfernt",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      '    if (typeof m.globalLaufId !== "string" || !m.globalLaufId.trim()) {',
      "    if (false) {")
  },
  {
    name: "M73 K2: Blob-Widerspruch der Mandatswahrheit wird ignoriert",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (Array.isArray(blob) && !mengeGleich(blob, kanonisch)) {",
      "  if (false) {")
  },
  {
    name: "M74 K2: unlesbare kanonische Menge blockiert nicht mehr (stiller Weiterlauf)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "  if (!Array.isArray(kanonisch) || !kanonisch.length) {",
      "  if (false) {")
  },
  {
    name: "M75 K3: Watchdog-Slots fallen aus der Bedarfsformel",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "    mindest: (regel + watchdog) * jeLauf + puffer",
      "    mindest: regel * jeLauf + puffer")
  },
  {
    name: "M76 K3: harte Blockade wird wieder zur Warnung",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      '    befunde.push(befund(AUSGANG_BLOCKIERT, "aufbewahrung-reicht-nicht", aufbewahrungsMeldung(bedarf, retention)));',
      "    warnungen.push(aufbewahrungsMeldung(bedarf, retention));")
  },
  {
    name: "M77 K8: Versiegelungstoleranz still aufgeblaeht (313 ms bis 300 s alles gruen)",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "const VERSIEGELUNGS_TOLERANZ_MS = 1000;",
      "const VERSIEGELUNGS_TOLERANZ_MS = 300000;")
  },
  {
    name: "M78 K8/K4: fachliche Schleife frisst die Vormerkreserve (zu spaete Vormerkung)",
    suite: LAUFPAAR_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      "      Math.max(0, verbleibendMs() - VORMERK_RESERVE_MS - ABSCHLUSS_RESERVE_MS)",
      "      Math.max(0, verbleibendMs() - ABSCHLUSS_RESERVE_MS)")
  },
  {
    name: "M79 K4: Lazy-Rest faellt aus der Abschluss-Vormerkung (fehlender Lazy-Pfad)",
    suite: LAUFPAAR_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      "    for (const cluster of [...lazyRestClusterListe, ...clusterAusUebersprungenen]) {",
      "    for (const cluster of [...clusterAusUebersprungenen]) {")
  },
  {
    name: "M80 K4: Bulk-Pfad stillgelegt — serielle Einzelwrites kehren zurueck",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, UNDER,
      '    if (zurueckgestellt.length && typeof deps.savePendingBulk === "function") {',
      "    if (false) {")
  },
  {
    name: "M81 K4: Speicherfehler des Bulks wird verschluckt (understanding)",
    suite: E3_SUITE,
    mutiere: (b) => ersetze(b, UNDER,
      "          vormerkFehlgeschlagen = Number(bulk.fehlgeschlagen) || 0;",
      "          vormerkFehlgeschlagen = 0;")
  },
  {
    name: "M82 K4: Vertrag ignoriert Speicherfehler der Abschlussphase",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "        || nichtVorgemerkt > 0 || fehlgeschlagen > 0) {",
      "        || nichtVorgemerkt > 0 || false) {")
  },
  {
    name: "M83 K5: Zusammensetzungsgleichung wird nicht mehr geprueft",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      "      } else if (statisch + dokumentgetrieben + zUnbekannt !== Number(k.kontexte)) {",
      "      } else if (false) {")
  },
  {
    name: "M84 K5: Diagnosebedarf wird still herabgestuft",
    suite: VERTRAG_SUITE,
    mutiere: (b) => ersetze(b, KERN,
      'befunde.push(befund(AUSGANG_BLOCKIERT, "kontextzahl-diagnosebedarf",',
      'befunde.push(befund(AUSGANG_NOCH_NICHT_AUSWERTBAR, "kontextzahl-diagnosebedarf",')
  },
  {
    name: "M85 K6: nicht gespeicherter Mandatslauf meldet wieder Erfolg",
    suite: LAUFPAAR_SUITE,
    mutiere: (b) => ersetze(b, SCHED,
      "        failed: true,\n        persistenz: \"fehlgeschlagen\",",
      "        persistenz: \"fehlgeschlagen\",")
  },
  {
    name: "M86 K7: Vorpruefung 'Erfolg vorhanden' entfernt (Watchdog feuert wieder bedingungslos)",
    suite: WATCHDOG_SUITE,
    mutiere: (b) => ersetze(b, WATCHDOG_SKRIPT,
      '    if (vorpruefung.ausgang === "vorhanden") {',
      "    if (false) {")
  },
  {
    name: "M87 K7: Lesefehler startet wieder blind einen schweren Ersatzlauf (fail open)",
    suite: WATCHDOG_SUITE,
    mutiere: (b) => ersetze(b, WATCHDOG_SKRIPT,
      '    if (vorpruefung.ausgang === "lesefehler") {',
      "    if (false) {")
  }
];

let rot = 0;
let gruen = 0;
let unwirksam = 0;
console.log("OP-25 Mutationsprobe — jede Probe MUSS die Suite rot machen");
console.log("=".repeat(78));
for (const probe of PROBEN) {
  const basis = baueArbeitskopie();
  try {
    try {
      probe.mutiere(basis);
    } catch (fehler) {
      // Eine Mutation, deren Muster nicht (mehr) trifft, ist KEIN Beleg — sie waere ein
      // falsch gruenes Ergebnis. Sie wird als eigener Fehlerfall gezaehlt statt den Lauf
      // abzubrechen, damit alle uebrigen Proben trotzdem messbar bleiben.
      unwirksam += 1;
      console.log(`UNWIRKSAM      ${probe.name} — ${(fehler && fehler.message) || fehler}`);
      continue;
    }
    const bestehtNoch = laeuftGruen(basis, probe.suite);
    if (bestehtNoch) {
      gruen += 1;
      console.log(`GRUEN (LOCH!)  ${probe.name}`);
    } else {
      rot += 1;
      console.log(`rot            ${probe.name}`);
    }
  } finally {
    fs.rmSync(basis, { recursive: true, force: true });
  }
}

console.log("=".repeat(78));
console.log(`${rot} von ${PROBEN.length} Proben rot · ${gruen} Loecher · ${unwirksam} unwirksam`);
process.exit(gruen || unwirksam ? 1 : 0);
