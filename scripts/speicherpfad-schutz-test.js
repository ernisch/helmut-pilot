"use strict";

// Helmut — REGRESSIONSNACHWEIS zum crawlRuns-Vorfall vom 04.09.2026 (SR §37).
// =============================================================================
// WAS AM 04.09. GESCHAH: Die inaktive Provisionierung der 20 Profile der Stufe A
// hat den geteilten Ring `helmut_store.main.crawlRuns` von 36 auf 20 Eintraege
// gekuerzt. Der Profilpfad hat `crawlRuns` nie angefasst — gekuerzt hat der
// GEMEINSAME Transportweg:
//
//   saveProfile -> writeStore("main") -> compactStore -> crawlRuns.slice(0, N)
//
// `N` kam aus `HELMUT_CRAWL_RUN_RETENTION` DER AUSFUEHRENDEN UMGEBUNG. In der
// Sitzung fehlte die Variable, also griff der Code-Vorgabewert 20 statt der
// Production-Einstellung 36. Die 16 entfernten Zeilen sind nicht rekonstruierbar.
//
// DIESE SUITE IST FAIL CLOSED. Sie prueft VERHALTEN, nicht Quelltext: jeder
// Abschnitt fuehrt den echten Code aus (echte `compactStore`/`saveCrawlRun`/
// `saveProfile`-Aufrufe gegen den lokalen Dateispeicher, echte Kindprozesse fuer
// die CLI-Riegel). Eine Suite, die ohne Voraussetzung still mit Exit 0 endet,
// waere hier wertlos — deshalb zaehlt jeder Abschnitt seine Assertions und der
// Abschluss prueft die Gesamtzahl gegen eine Untergrenze.
//
// Aufruf: node scripts/lokal.js -- node scripts/speicherpfad-schutz-test.js

// Defensiv VOR dem ersten require: dieser Test darf niemals Production erreichen.
process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.HELMUT_V3_STORE;
// Der Vorfallszustand: die Variable FEHLT. Genau so lief der Lauf am 04.09.
delete process.env.HELMUT_CRAWL_RUN_RETENTION;
// `readStore` liefert sonst bis zu 10 s alte Daten aus `storeCacheMap`
// (storage.js:155-165, Modulkonstante). Ein Test, der die Datei direkt neu
// seedet und danach ueber storage liest, wuerde den ALTEN Stand messen und
// waere still falsch. 0 schaltet den Cache aus — vor dem ersten require.
process.env.HELMUT_STORE_CACHE_MS = "0";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const VORFLUG = require("../lib/helmut/speicherpfad-vorflug");
const storage = require("../lib/helmut/storage");

let passed = 0;
let failed = 0;
function check(name, bedingung, detail = "") {
  if (bedingung) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

// 36 Laufzeilen wie der Production-Bestand VOR dem 04.09.
function laeufe(anzahl) {
  return Array.from({ length: anzahl }, (unused, i) => ({
    runId: `lauf-${String(i).padStart(3, "0")}`,
    mode: "mandat",
    politicianId: `synthetisch-${i}`,
    checkedSources: 10,
    successfulSources: 9,
    failedSources: 1,
    durationMs: 1000 + i,
    // Absteigend: Index 0 ist der juengste Lauf.
    createdAt: new Date(Date.UTC(2026, 7, 1 + Math.floor((36 - i) / 2), (36 - i) % 24)).toISOString()
  }));
}

const dataDir = path.join(ROOT, ".helmut-data");
const storeFile = path.join(dataDir, "store.json");
const sicherung = fs.existsSync(storeFile) ? fs.readFileSync(storeFile, "utf8") : null;

// Der Vorfallszustand im lokalen Dateispeicher: 36 Laufzeilen und ein
// Bestandsprofil, das ein reales Mandat vertritt.
const BESTANDSPROFIL_ID = "bestandsmandat-offline";
function seedeStore(anzahlLaeufe = 36) {
  fs.mkdirSync(dataDir, { recursive: true });
  const bestand = {
    id: BESTANDSPROFIL_ID,
    name: "Bestandsmandat (offline)",
    profileActive: true,
    committees: ["Innenausschuss"],
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
  fs.writeFileSync(storeFile, JSON.stringify({
    crawlRuns: laeufe(anzahlLaeufe),
    profiles: { [BESTANDSPROFIL_ID]: bestand },
    mandateProfiles: { [BESTANDSPROFIL_ID]: { ...bestand, user_id: BESTANDSPROFIL_ID } }
  }, null, 2));
}

function liesStore() {
  return JSON.parse(fs.readFileSync(storeFile, "utf8"));
}

// Ein echter Kindprozess je Umgebungsvariante — nur so ist belegbar, dass ein
// Riegel WIRKLICH vor dem ersten Schreibvorgang greift.
function cli(skriptUndArgs, zusatzUmgebung = {}) {
  const vorher = fs.existsSync(storeFile) ? fs.readFileSync(storeFile, "utf8") : null;
  const umgebung = { ...process.env, NO_NETWORK_TESTS: "1", HELMUT_SOURCE_MODE: "off" };
  for (const name of ["HELMUT_CRAWL_RUN_RETENTION", "HELMUT_PROFILE_DB_MODE",
    "HELMUT_PROFILE_DB_EXCLUSIVE", "HELMUT_V3_STORE", "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_TESTKOHORTE_EXECUTE", "HELMUT_TESTKOHORTE_CONFIRM"]) {
    delete umgebung[name];
  }
  const r = spawnSync(process.execPath, skriptUndArgs.map((a, i) => (i === 0 ? path.join(ROOT, a) : a)), {
    cwd: ROOT, encoding: "utf8", timeout: 90000, env: { ...umgebung, ...zusatzUmgebung }
  });
  const nachher = fs.existsSync(storeFile) ? fs.readFileSync(storeFile, "utf8") : null;
  return {
    status: r.status,
    aus: String(r.stdout || ""),
    fehler: String(r.stderr || ""),
    speicherUnveraendert: vorher === nachher
  };
}

(async () => {
  try {
    // ── 1 · Der Vorfall selbst: 36 Laufzeilen ueberleben einen Profil-Schreibvorgang ──
    console.log("\n== 1 · Ein fachlich unbeteiligter Schreibvorgang kuerzt nichts ==");
    seedeStore(36);
    check("1.1 Ausgangslage: 36 Laufzeilen im Speicher", liesStore().crawlRuns.length === 36);

    // Genau der Aufruf, der am 04.09. 20-mal lief — ohne Aufbewahrungsvariable.
    await storage.saveProfile({
      id: "test-kohorte-a-001",
      name: "Synthetisches Testprofil",
      profileActive: false,
      committees: ["Innenausschuss"]
    });
    const nachProfil = liesStore();
    check("1.2 REGRESSION: saveProfile OHNE HELMUT_CRAWL_RUN_RETENTION laesst alle 36 Laufzeilen stehen",
      nachProfil.crawlRuns.length === 36,
      `crawlRuns.length=${nachProfil.crawlRuns.length} (vor dem Fix waeren es 20)`);
    check("1.3 Die aeltesten Laufzeilen (Position 21-36) sind noch da",
      nachProfil.crawlRuns.length === 36 && Boolean(nachProfil.crawlRuns[35]));

    // ── 10 · Bestandsprofile bleiben unveraendert ────────────────────────────
    check("1.4 Das Bestandsprofil ist unveraendert (Kennung, Aktivzustand, Zeitstempel)",
      Boolean(nachProfil.profiles[BESTANDSPROFIL_ID])
        && nachProfil.profiles[BESTANDSPROFIL_ID].profileActive === true
        && nachProfil.profiles[BESTANDSPROFIL_ID].updatedAt === "2026-08-01T00:00:00.000Z");
    // ── 9 · Das synthetische Profil bleibt INAKTIV ───────────────────────────
    check("1.5 Das synthetisch angelegte Stufe-A-Profil ist INAKTIV",
      nachProfil.profiles["test-kohorte-a-001"].profileActive === false);

    // ── 2 · compactStore verkleinert die Liste in KEINER Konfiguration ──────
    //
    // Der gemeinsame Transportweg jeder `main`-Schreibung darf eine Liste, die er
    // fachlich nicht anfasst, ueberhaupt nicht verkleinern. Die Aufbewahrung
    // durchzusetzen ist Sache des Ringeigentuemers `saveCrawlRun` (Abschnitt 5).
    console.log("\n== 2 · compactStore verkleinert crawlRuns in KEINER Konfiguration ==");
    const grosseListe = laeufe(36);
    for (const [wert, name] of [
      [null, "ohne Variable (der Vorfallszustand)"],
      ["36", "mit der Production-Einstellung 36"],
      ["25", "mit einem kleineren Wert 25"],
      ["20", "mit genau dem Vorfallswert 20"],
      ["5", "mit einem Wert unter dem Lesefenster"]
    ]) {
      if (wert === null) delete process.env.HELMUT_CRAWL_RUN_RETENTION;
      else process.env.HELMUT_CRAWL_RUN_RETENTION = wert;
      check(`2.x compactStore laesst alle 36 Zeilen stehen — ${name}`,
        storage.compactStore({ crawlRuns: grosseListe }).crawlRuns.length === 36,
        `length=${storage.compactStore({ crawlRuns: grosseListe }).crawlRuns.length}`);
    }
    // Die Aufbewahrung wird trotzdem PRO AUFRUF ausgewertet — sonst koennte ein
    // Vorflug-Riegel gar nicht melden, was wirksam ist.
    process.env.HELMUT_CRAWL_RUN_RETENTION = "36";
    check("2.6 Der Befund wird pro Aufruf neu aus der Umgebung gelesen (36 belegt)",
      VORFLUG.crawlRunAufbewahrung().wirksam === 36 && VORFLUG.crawlRunAufbewahrung().gueltig === true);
    process.env.HELMUT_CRAWL_RUN_RETENTION = "20";
    check("2.7 …und aendert sich, wenn die Umgebung sich aendert (20 belegt)",
      VORFLUG.crawlRunAufbewahrung().wirksam === 20);
    delete process.env.HELMUT_CRAWL_RUN_RETENTION;
    check("2.8 …und faellt auf 'nicht belegt' zurueck, wenn die Variable verschwindet",
      VORFLUG.crawlRunAufbewahrung().gueltig === false
        && VORFLUG.crawlRunAufbewahrung().grund === "nicht-gesetzt");

    // ── 3 · Ungueltige Werte werden abgelehnt, nicht ersatzweise angewendet ──
    console.log("\n== 3 · Ungueltige und zu kleine Grenzen werden abgelehnt ==");
    for (const wert of ["abc", "0", "-5", "12,5", "20.5", " "]) {
      process.env.HELMUT_CRAWL_RUN_RETENTION = wert;
      const befund = VORFLUG.crawlRunAufbewahrung();
      check(`3.x "${wert}" wird als ungueltig abgewiesen und kuerzt nicht`,
        befund.gueltig === false && befund.wirksam === null
          && storage.compactStore({ crawlRuns: grosseListe }).crawlRuns.length === 36,
        `grund=${befund.grund} wirksam=${befund.wirksam}`);
    }

    console.log("\n== 4 · Eine Grenze UNTER dem Lesefenster wird abgelehnt ==");
    for (const wert of ["1", "5", "19"]) {
      process.env.HELMUT_CRAWL_RUN_RETENTION = wert;
      const befund = VORFLUG.crawlRunAufbewahrung();
      check(`4.x ${wert} < Lesefenster ${VORFLUG.CRAWL_RUN_LESEFENSTER} wird nicht angewendet`,
        befund.gueltig === false && befund.grund === "unter-lesefenster"
          && storage.compactStore({ crawlRuns: grosseListe }).crawlRuns.length === 36);
    }
    check("4.4 Das Lesefenster entspricht dem groessten tatsaechlichen Verbraucherfenster (20)",
      VORFLUG.CRAWL_RUN_LESEFENSTER === 20);
    // Gegenprobe am ECHTEN Verbraucherpfad, nicht am slice: alle fuenf
    // Produktiv-Aufrufer lesen `listCrawlRuns(20)`. Ein zu kleiner Ring liefert
    // dort weniger Zeilen — und ein FEHLENDER Eintrag schaltet den
    // Google-Cooldown still ab, er verkuerzt ihn nicht (SR §37.2). Geprueft wird
    // deshalb der gefaehrliche Fall: eine Aufbewahrung UNTER dem Lesefenster darf
    // den Verbraucherpfad nicht aushungern.
    seedeStore(36);
    process.env.HELMUT_CRAWL_RUN_RETENTION = "5";
    await storage.saveProfile({
      id: "test-kohorte-a-003", name: "Synthetisch 3", profileActive: false, committees: ["Innenausschuss"]
    });
    check("4.5 Auch mit Aufbewahrung 5 findet listCrawlRuns(20) noch die vollen 20 Zeilen",
      (await storage.listCrawlRuns(20)).length === 20 && liesStore().crawlRuns.length === 36,
      `ring=${liesStore().crawlRuns.length}`);
    // Und der Wert, mit dem der Vorfall passierte, kuerzt ebenfalls nicht mehr.
    process.env.HELMUT_CRAWL_RUN_RETENTION = "20";
    await storage.saveProfile({
      id: "test-kohorte-a-004", name: "Synthetisch 4", profileActive: false, committees: ["Innenausschuss"]
    });
    check("4.6 REGRESSION: auch der Vorfallswert 20 kuerzt einen 36er-Ring nicht mehr",
      liesStore().crawlRuns.length === 36,
      `ring=${liesStore().crawlRuns.length} (vor dem Fix waeren es 20)`);
    delete process.env.HELMUT_CRAWL_RUN_RETENTION;

    // ── 5 · saveCrawlRun schrumpft den Ring nie unter den Bestand ────────────
    console.log("\n== 5 · Der einzige Schreiber des Rings kuerzt ihn nicht ==");
    delete process.env.HELMUT_CRAWL_RUN_RETENTION;
    seedeStore(36);
    await storage.saveCrawlRun({ runId: "neu-1", mode: "mandat", checkedSources: 1 });
    const nachLauf = liesStore();
    check("5.1 saveCrawlRun ohne Variable haelt den Ring auf 36 (neuer Lauf vorn, aeltester faellt)",
      nachLauf.crawlRuns.length === 36 && nachLauf.crawlRuns[0].runId === "neu-1",
      `length=${nachLauf.crawlRuns.length}`);
    process.env.HELMUT_CRAWL_RUN_RETENTION = "36";
    await storage.saveCrawlRun({ runId: "neu-2", mode: "mandat", checkedSources: 1 });
    check("5.2 Mit belegter Grenze 36 bleibt der Ring bei 36",
      liesStore().crawlRuns.length === 36);
    delete process.env.HELMUT_CRAWL_RUN_RETENTION;

    // ── 6 · activateTenant kann den Ring nicht unbeabsichtigt kuerzen ────────
    console.log("\n== 6 · Der AKTIVIERUNGSpfad kuerzt den Ring nicht ==");
    seedeStore(36);
    const provisioning = require("../lib/helmut/provisioning");
    // `activateTenant` verweigert jeden Mandanten OHNE Provisionierungsmarker
    // (Bestandsschutz, fail closed). Der echte Kohortenpfad legt ihn ueber
    // `provisionTenant` an; hier wird er gesetzt, damit dieser Test wirklich den
    // AKTIVIERUNGSpfad durchlaeuft statt am Bestandsschutz haengenzubleiben.
    await storage.saveProfile({
      id: "test-kohorte-a-002",
      name: "Synthetisch 2",
      profileActive: false,
      committees: ["Innenausschuss"],
      provisionedBy: provisioning.PROVISIONING_MARKER
    });
    const vorAktivierung = liesStore().crawlRuns.length;
    const aktiviert = await provisioning.activateTenant("test-kohorte-a-002");
    const nachAktivierung = liesStore();
    check("6.1 activateTenant hat wirklich geschrieben (sonst belegt der Test nichts)",
      aktiviert && aktiviert.ok === true && nachAktivierung.profiles["test-kohorte-a-002"].profileActive === true,
      JSON.stringify(aktiviert && aktiviert.activated));
    check("6.2 REGRESSION: activateTenant laesst alle 36 Laufzeilen stehen",
      vorAktivierung === 36 && nachAktivierung.crawlRuns.length === 36,
      `vorher=${vorAktivierung} nachher=${nachAktivierung.crawlRuns.length}`);
    check("6.3 Das Bestandsprofil bleibt durch die Aktivierung unveraendert",
      nachAktivierung.profiles[BESTANDSPROFIL_ID].updatedAt === "2026-08-01T00:00:00.000Z");

    // ── 7 · Der Vorflug-Riegel als reine Logik ───────────────────────────────
    console.log("\n== 7 · Der Vorflug-Riegel beurteilt jede Konstellation ==");
    const PRODUKTIV = Object.freeze({
      HELMUT_CRAWL_RUN_RETENTION: "36",
      HELMUT_PROFILE_DB_MODE: "1",
      HELMUT_V3_STORE: "1",
      HELMUT_STORAGE_BACKEND: "supabase",
      SUPABASE_URL: "https://beispiel.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "nur-ein-testwert-kein-secret"
    });
    check("7.1 Eine vollstaendige Umgebung gilt als sicher",
      VORFLUG.pruefeSpeicherpfad({ env: PRODUKTIV }).sicher === true,
      JSON.stringify(VORFLUG.pruefeSpeicherpfad({ env: PRODUKTIV }).offen));
    const ohneAufbewahrung = { ...PRODUKTIV };
    delete ohneAufbewahrung.HELMUT_CRAWL_RUN_RETENTION;
    check("7.2 Fehlende Aufbewahrung macht die Umgebung unsicher",
      VORFLUG.pruefeSpeicherpfad({ env: ohneAufbewahrung }).sicher === false);
    check("7.3 Eine Aufbewahrung unter dem Lesefenster macht sie unsicher",
      VORFLUG.pruefeSpeicherpfad({
        env: { ...PRODUKTIV, HELMUT_CRAWL_RUN_RETENTION: "10" }
      }).sicher === false);
    const ohneProfilModus = { ...PRODUKTIV };
    delete ohneProfilModus.HELMUT_PROFILE_DB_MODE;
    check("7.4 Fehlender relationaler Schreibmodus macht sie unsicher (kein stilles Blob-only)",
      VORFLUG.pruefeSpeicherpfad({ env: ohneProfilModus }).sicher === false);
    check("7.5 Ein GESETZTER, aber unwirksamer Profilmodus wird ebenfalls abgewiesen",
      VORFLUG.pruefeSpeicherpfad({
        env: { ...PRODUKTIV, HELMUT_V3_STORE: "0" }
      }).sicher === false);
    // Blob und relationale Ablage duerfen nicht auseinanderlaufen: relational auf
    // Supabase, Blob/Konten in lokale Dateien — genau der Befund vom 2026-07-27.
    const auseinander = { ...PRODUKTIV, HELMUT_STORAGE_BACKEND: "local" };
    const befundAuseinander = VORFLUG.pruefeSpeicherpfad({ env: auseinander });
    check("7.6 Blob und relationale Speicherung koennen nicht still auseinanderlaufen",
      befundAuseinander.sicher === false
        && befundAuseinander.offen.includes("Blob und Fachtabellen zeigen auf dasselbe Backend"),
      JSON.stringify(befundAuseinander.offen));
    check("7.7 Der Bericht weist Schreibziel, beide Schreibmodi und die wirksame Grenze aus",
      /Blob-Backend/.test(befundAuseinander.meldung)
        && /Relationaler Schreibmodus/.test(befundAuseinander.meldung)
        && /Blob-Schreibmodus/.test(befundAuseinander.meldung)
        && /crawlRuns-Aufbewahrung/.test(befundAuseinander.meldung));
    check("7.8 Ein reines Blob-Werkzeug darf ohne relationalen Schreibpfad laufen",
      VORFLUG.pruefeSpeicherpfad({
        env: ohneProfilModus, verlangeProfilSchreibpfad: false
      }).sicher === true);

    // ── 8 · Der Riegel greift GENAU DANN, wenn wirklich geschrieben wuerde ──
    //
    // Der Riegel sitzt im AUSFUEHRER, nicht im CLI-Banner: erst dort steht fest,
    // dass Freigabe UND Startfenster UND Vorstufe zusammen einen scharfen Lauf
    // ergeben. Ein Lauf, der ohnehin auf den Trockenlauf zurueckfaellt, schreibt
    // nichts und soll weiter seinen eigenen, genaueren Grund melden.
    console.log("\n== 8 · Der Riegel greift genau dann, wenn geschrieben wuerde ==");
    seedeStore(36);
    const V = require("../lib/helmut/testkohorte-vorwaerts");
    const RB = require("../lib/helmut/testkohorte-rueckbau");
    const EN = require("../lib/helmut/testkohorte-entfernung");
    const ST = require("../lib/helmut/testkohorte-stufen");
    // EXECUTE_FLAG/CONFIRM_VARIABLE liegen in testkohorte-betrieb, nicht in -stufen.
    const KB = require("../lib/helmut/testkohorte-betrieb");

    // Ein Fensterbefund, der zu JEDER Uhrzeit gilt — der Test darf nicht davon
    // abhaengen, wann er laeuft.
    const FENSTER_IMMER = Object.freeze({
      startErlaubt: true, gepruefteCrons: 13, startMinuteUtc: 0, endeMinuteUtc: 1440
    });
    const jetzt = new Date().toISOString();
    function freigabeFuer(stufe, vorgang) {
      return {
        [KB.EXECUTE_FLAG]: "1",
        [KB.CONFIRM_VARIABLE]: ST.STUFEN_FREIGABEWORTE[stufe][vorgang]
      };
    }

    async function wirftUnsicher(name, aufruf) {
      const vorher = fs.readFileSync(storeFile, "utf8");
      let fehler = null;
      try { await aufruf(); } catch (e) { fehler = e; }
      const nachher = fs.readFileSync(storeFile, "utf8");
      check(`8.x ${name}: bricht mit "speicherpfad-unsicher" ab, ohne zu schreiben`,
        Boolean(fehler) && fehler.grund === "speicherpfad-unsicher" && vorher === nachher,
        fehler ? `grund=${fehler.grund}` : "kein Fehler geworfen");
      check(`8.x ${name}: die Meldung nennt die fehlende Aufbewahrung und das Schreibziel`,
        Boolean(fehler) && /HELMUT_CRAWL_RUN_RETENTION/.test(fehler.message)
          && /Blob-Backend/.test(fehler.message) && /Relationaler Schreibmodus/.test(fehler.message));
    }

    // Die Prozessumgebung ist hier bewusst unsicher (keine Aufbewahrung, kein
    // Profilmodus) — genau der Zustand der Sitzung vom 04.09.
    delete process.env.HELMUT_CRAWL_RUN_RETENTION;
    delete process.env.HELMUT_PROFILE_DB_MODE;

    await wirftUnsicher("Provisionierung Stufe A", () => V.fuehreProvisionierungAus({
      stufe: "a", modus: "scharf", env: freigabeFuer("a", "provisionierung"),
      startfensterBefund: FENSTER_IMMER, jetztUtc: jetzt
    }));
    await wirftUnsicher("Aktivierung Gruppe A", () => V.fuehreAktivierungAus({
      gruppe: "a", modus: "scharf", env: freigabeFuer("a", "aktivierung"),
      startfensterBefund: FENSTER_IMMER, jetztUtc: jetzt, vorstufenVollstaendig: true
    }));
    await wirftUnsicher("Entfernung Stufe A", () => EN.fuehreEntfernungAus({
      stufe: "a", modus: "scharf", env: freigabeFuer("a", "entfernung")
    }));

    // Der RUECKWEG traegt BEWUSST keinen Riegel: er ist die Notbremse und darf nie
    // an einer Vorbedingung scheitern (funktionstest-ablaufplan.js fuehrt ihn als
    // `immerErlaubt: true`). Das ist eine Entscheidung, keine Luecke — und sie wird
    // hier festgehalten, damit ein spaeterer Sprint sie nicht versehentlich kippt.
    // Der Schaden kann dort ohnehin nicht mehr entstehen (Abschnitt 1-4).
    {
      const vorher = fs.readFileSync(storeFile, "utf8");
      const r = await RB.fuehreRueckbauAus({
        modus: "scharf",
        env: { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT },
        deps: {
          deaktiviere: async () => ({ ok: true }),
          leseZustand: async () => ({ vorhanden: true, aktiv: false })
        }
      });
      check("8.5a Der Rueckweg bleibt die Notbremse: er laeuft auch in unsicherer Umgebung",
        r.modus === "scharf", `modus=${r.modus}`);
      check("8.5b Er hat dabei den geteilten Blob nicht angefasst",
        fs.readFileSync(storeFile, "utf8") === vorher);
    }
    // Dieselbe Entscheidung fuer die Nacharbeit — und dort zusaetzlich begruendet:
    // sie schreibt `helmut_store.main` gar nicht, sondern ausschliesslich die
    // eigene Fairness-Zeile, bereits mit Compare-and-Set (storage.js:399ff).
    {
      const r = await RB.entferneSchedulerSpur({
        modus: "scharf",
        env: { [RB.EXECUTE_FLAG]: "1", [RB.CONFIRM_VARIABLE]: RB.FREIGABEWORT_SPUR },
        deps: { entferneSpur: async () => ({ ok: true, entfernt: true }) }
      });
      check("8.5c Die Nacharbeit laeuft ebenfalls ohne Riegel (sie fasst main nie an)",
        r.modus === "scharf", `modus=${r.modus}`);
    }

    // Gegenprobe: OHNE Freigabe faellt derselbe Aufruf wie bisher auf den
    // Trockenlauf zurueck und meldet seinen eigenen Grund — der Riegel schneidet
    // diese Meldung NICHT ab.
    const ohneFreigabe = await V.fuehreProvisionierungAus({
      stufe: "a", modus: "scharf", env: {}, startfensterBefund: FENSTER_IMMER, jetztUtc: jetzt
    });
    check("8.6 Ohne Freigabe bleibt es der bisherige Trockenlauf (der Riegel greift nicht vor)",
      ohneFreigabe.modus === "trockenlauf" && ohneFreigabe.angelegt === 0,
      `modus=${ohneFreigabe.modus}`);

    // Gegenprobe: mit SICHERER Umgebung wirft der Riegel nicht.
    check("8.7 Mit vollstaendiger Umgebung wirft der Riegel nicht",
      (() => {
        try {
          VORFLUG.erzwingeSpeicherpfadOderWirf({ env: PRODUKTIV, zweck: "Gegenprobe" });
          return true;
        } catch { return false; }
      })());

    // Gegenprobe: eine eingespeiste Attrappe (`deps`) zielt nicht auf die echte
    // Ablage und wird bewusst nicht geriegelt — sonst waere jeder bestehende
    // Vertragstest blockiert.
    const mitAttrappe = await V.fuehreProvisionierungAus({
      stufe: "a", modus: "scharf", env: freigabeFuer("a", "provisionierung"),
      startfensterBefund: FENSTER_IMMER, jetztUtc: jetzt,
      deps: {
        legeAn: async () => ({ ok: true }),
        leseZustand: async () => ({ vorhanden: true, aktiv: false })
      }
    });
    check("8.8 Eine eingespeiste Attrappe laeuft weiter (der Riegel schuetzt den ECHTEN Schreibweg)",
      mitAttrappe.modus === "scharf" && mitAttrappe.angelegt === 20,
      `modus=${mitAttrappe.modus} angelegt=${mitAttrappe.angelegt}`);

    // ── CLI-Ebene: Exitcode 2 und ausgewiesenes Schreibziel ─────────────────
    console.log("\n== 8b · Die CLIs weisen das Schreibziel aus und enden mit Exit 2 ==");
    seedeStore(36);
    const scharfOhneFreigabe = cli(
      ["scripts/testkohorte-vorwaerts.js", "provisionierung", "--stufe=a", "--scharf"]);
    check("8b.1 Ein scharf gewuenschter Lauf ohne Freigabe endet regulaer (Exit 0) und schreibt nichts",
      scharfOhneFreigabe.status === 0 && scharfOhneFreigabe.speicherUnveraendert === true,
      `exit=${scharfOhneFreigabe.status}`);
    check("8b.2 Er weist trotzdem Schreibziel, beide Schreibmodi und die wirksame Grenze aus",
      /Blob-Backend/.test(scharfOhneFreigabe.aus)
        && /Blob-Schreibmodus/.test(scharfOhneFreigabe.aus)
        && /Relationaler Schreibmodus/.test(scharfOhneFreigabe.aus)
        && /crawlRuns-Aufbewahrung/.test(scharfOhneFreigabe.aus));
    check("8b.3 Er nennt Stufe, vorgesehene Profilanzahl und Aktivierungsstatus",
      /Stufe\s+:\s*A/.test(scharfOhneFreigabe.aus)
        && /Vorgesehene Profilanzahl:\s*20/.test(scharfOhneFreigabe.aus)
        && /legt INAKTIV an/.test(scharfOhneFreigabe.aus),
      scharfOhneFreigabe.aus.slice(0, 400));

    // Mit vollstaendiger Freigabe, aber unsicherer Umgebung: Exitcode 2.
    //
    // Bewusst ueber die ENTFERNUNG gefuehrt: sie ist der einzige geriegelte
    // Ausfuehrer OHNE Startfenstertor und geht allein mit Flag und Wort
    // deterministisch scharf. Ueber den Vorwaertsweg haenge der Nachweis an der
    // Tageszeit, zu der der Test laeuft — ein Test, der um 03:00 UTC anders
    // ausgeht als um 12:00, belegt nichts. Der Rueckweg scheidet aus: er traegt
    // bewusst keinen Riegel (Abschnitt 8.5a).
    const scharfMitFreigabe = cli(
      ["scripts/testkohorte-entfernung.js", "--stufe=a", "--scharf"],
      {
        [KB.EXECUTE_FLAG]: "1",
        [KB.CONFIRM_VARIABLE]: ST.STUFEN_FREIGABEWORTE.a.entfernung
      });
    check("8b.4 Mit Freigabe, aber unsicherer Umgebung endet das CLI mit Exitcode 2 und schreibt nichts",
      scharfMitFreigabe.status === 2 && scharfMitFreigabe.speicherUnveraendert === true,
      `exit=${scharfMitFreigabe.status} ${scharfMitFreigabe.fehler.trim().slice(0, 200)}`);
    check("8b.5 Die Abbruchmeldung nennt den Grund speicherpfad-unsicher",
      /speicherpfad-unsicher/.test(scharfMitFreigabe.fehler));
    check("8b.6 Der Trockenlauf bleibt unberuehrt (Exit 0)",
      cli(["scripts/testkohorte-vorwaerts.js", "provisionierung", "--stufe=a"]).status === 0);

    // ── 9 · Kein Kohortenprofil ist nach all dem aktiv ausser dem einen, den
    //        Abschnitt 6 absichtlich aktiviert hat ─────────────────────────────
    console.log("\n== 9 · Stufe A bleibt inaktiv, Bestandsprofile unveraendert ==");
    // ACHTUNG LEER-WAHRHEIT: eine Aussage ueber "alle Kohortenprofile" ist wertlos,
    // wenn gar keins da ist. Deshalb wird der Endstand hier ERST ERZEUGT — mit
    // genau den Schreibvorgaengen, die auch der Vorfallslauf ausgeloest hat — und
    // die Anzahl vorher geprueft.
    seedeStore(36);
    const bestandVorher = JSON.stringify(liesStore().profiles[BESTANDSPROFIL_ID]);
    for (let i = 1; i <= 5; i += 1) {
      await storage.saveProfile({
        id: `test-kohorte-a-${String(i).padStart(3, "0")}`,
        name: `Synthetisch ${i}`,
        profileActive: false,
        committees: ["Innenausschuss"]
      });
    }
    const endstand = liesStore();
    const kohortenprofile = Object.values(endstand.profiles || {})
      .filter((p) => String(p.id || "").startsWith("test-kohorte-"));
    check("9.0 Die Aussage ist nicht leer-wahr: es liegen wirklich Kohortenprofile vor",
      kohortenprofile.length === 5, `gefunden=${kohortenprofile.length}`);
    check("9.1 Kein synthetisches Kohortenprofil ist im Endstand aktiv",
      kohortenprofile.length === 5 && kohortenprofile.every((p) => p.profileActive !== true),
      `aktiv: ${kohortenprofile.filter((p) => p.profileActive === true).map((p) => p.id).join(", ")}`);
    check("9.2 Das Bestandsprofil ist nach fuenf fremden Schreibvorgaengen byte-identisch",
      JSON.stringify(endstand.profiles[BESTANDSPROFIL_ID]) === bestandVorher
        && endstand.profiles[BESTANDSPROFIL_ID].updatedAt === "2026-08-01T00:00:00.000Z");
    check("9.3 Der Ring steht nach fuenf fremden Schreibvorgaengen weiterhin auf 36",
      endstand.crawlRuns.length === 36, `length=${endstand.crawlRuns.length}`);
    // Der Seed ist absteigend nach createdAt sortiert: Position 0 ist der juengste
    // Lauf (`lauf-000`), Position 35 der aelteste (`lauf-035`). Genau die Positionen
    // 21-36 hat der Vorfall am 04.09. entfernt.
    check("9.4 Die aelteste Laufzeile (Position 36) lebt noch — genau sie fiel am 04.09. weg",
      endstand.crawlRuns.length === 36
        && endstand.crawlRuns[35].runId === "lauf-035"
        && endstand.crawlRuns[20].runId === "lauf-020",
      `pos35=${endstand.crawlRuns[35] && endstand.crawlRuns[35].runId}`);
  } finally {
    if (sicherung != null) fs.writeFileSync(storeFile, sicherung);
    else if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
  }

  // FAIL CLOSED: eine Suite, die aus Versehen fast nichts prueft, darf nicht
  // gruen sein. Die Untergrenze wird bewusst mitgefuehrt.
  // Die Untergrenze liegt dicht unter dem tatsaechlichen Umfang (Stand 04.09.: 65).
  // Sie ist kein Schaetzwert, sondern ein Riegel gegen eine Suite, die durch einen
  // frueh abbrechenden Zweig fast nichts mehr prueft und trotzdem gruen endet.
  const MINDESTZAHL = 60;
  console.log(`\n${passed}/${passed + failed} Speicherpfad-Schutz-Assertions erfolgreich.`);
  if (passed + failed < MINDESTZAHL) {
    console.error(`FEHLGESCHLAGEN: nur ${passed + failed} Assertions gelaufen, erwartet mindestens ${MINDESTZAHL}.`);
    process.exit(1);
  }
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((fehler) => {
  console.error("Speicherpfad-Schutz-Test abgebrochen:", (fehler && fehler.stack) || fehler);
  process.exit(1);
});
