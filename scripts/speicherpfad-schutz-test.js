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
function cli(skriptUndArgs, zusatzUmgebung = {}, preload = null) {
  const vorher = fs.existsSync(storeFile) ? fs.readFileSync(storeFile, "utf8") : null;
  const umgebung = { ...process.env, NO_NETWORK_TESTS: "1", HELMUT_SOURCE_MODE: "off" };
  for (const name of ["HELMUT_CRAWL_RUN_RETENTION", "HELMUT_PROFILE_DB_MODE",
    "HELMUT_PROFILE_DB_EXCLUSIVE", "HELMUT_V3_STORE", "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_TESTKOHORTE_EXECUTE", "HELMUT_TESTKOHORTE_CONFIRM"]) {
    delete umgebung[name];
  }
  const argumente = skriptUndArgs.map((a, i) => (i === 0 ? path.join(ROOT, a) : a));
  const r = spawnSync(process.execPath,
    preload ? ["--require", preload, ...argumente] : argumente,
    { cwd: ROOT, encoding: "utf8", timeout: 90000, env: { ...umgebung, ...zusatzUmgebung } });
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

    // ── 7b · Zeilenkennungen: nur eine TATSAECHLICHE Abweichung blockiert ─────
    //
    // Betreiberbefund: `verschoben` wurde zuerst allein daraus abgeleitet, OB eine
    // der beiden Variablen gesetzt ist. Damit haette eine ausdrueckliche
    // Bestaetigung der Vorgabe (`HELMUT_SUPABASE_STORE_ID=main`) den voellig
    // unveraenderten Zielzustand blockiert. Verglichen werden jetzt die
    // AUFGELOESTEN Werte gegen main/main-auth.
    console.log("\n== 7b · Zeilenkennungen: Vorgabe erlaubt, Abweichung blockiert ==");
    const ZEILENFAELLE = [
      { name: "beide Variablen fehlen", env: {}, erlaubt: true },
      {
        name: "beide Standardwerte ausdruecklich gesetzt",
        env: { HELMUT_SUPABASE_STORE_ID: "main", HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth" },
        erlaubt: true
      },
      { name: "nur main ausdruecklich gesetzt", env: { HELMUT_SUPABASE_STORE_ID: "main" }, erlaubt: true },
      { name: "abweichende Blob-Kennung", env: { HELMUT_SUPABASE_STORE_ID: "anders" }, erlaubt: false },
      { name: "abweichende Auth-Kennung", env: { HELMUT_SUPABASE_AUTH_STORE_ID: "anders-auth" }, erlaubt: false },
      {
        name: "beide Kennungen abweichend",
        env: { HELMUT_SUPABASE_STORE_ID: "x", HELMUT_SUPABASE_AUTH_STORE_ID: "y" },
        erlaubt: false
      }
    ];
    const ZEILENPRUEFUNG = "Zeilenkennungen stehen auf der Vorgabe (main / main-auth)";
    for (const f of ZEILENFAELLE) {
      const befund = VORFLUG.pruefeSpeicherpfad({ env: { ...PRODUKTIV, ...f.env } });
      const zeilenOk = !befund.offen.includes(ZEILENPRUEFUNG);
      check(`7b.x ${f.name} → ${f.erlaubt ? "erlaubt" : "blockiert"}`,
        zeilenOk === f.erlaubt && befund.sicher === f.erlaubt,
        `sicher=${befund.sicher} offen=${JSON.stringify(befund.offen)}`);
    }
    // Und der aufgeloeste Wert steht im Bericht — auch wenn er nur aus der Vorgabe kommt.
    check("7b.7 Der Bericht nennt die aufgeloeste Zeile und die Kontenzeile",
      /Geteilte Zeile\s+:\s*main · Kontenzeile: main-auth/
        .test(VORFLUG.pruefeSpeicherpfad({ env: PRODUKTIV }).meldung));
    check("7b.8 Eine ausdrueckliche Vorgabe gilt NICHT als verschoben (gerechnet, nicht geraten)",
      VORFLUG.zeilenkennungen({ HELMUT_SUPABASE_STORE_ID: "main" }).verschoben === false
        && VORFLUG.zeilenkennungen({ HELMUT_SUPABASE_STORE_ID: "main" })
          .ausdruecklichGesetzt.blob === true);

    // ── 7c · Die Meldung behauptet keinen bestaetigten Production-Wert ────────
    //
    // Betreiberbefund: der Text nannte "HELMUT_CRAWL_RUN_RETENTION (Production: 36)".
    // 36 ist eine Betreiberangabe, die aus dem Code nicht belegbar ist — eine
    // Programmmeldung darf sie nicht als aktuellen Production-Wert ausgeben.
    const UNSICHER_MELDUNG = VORFLUG.pruefeSpeicherpfad({ env: {} }).meldung;
    check("7c.1 Die Meldung nennt KEINE Zahl als aktuellen Production-Wert",
      !/Production:\s*\d/.test(UNSICHER_MELDUNG) && !/Production\s*36/.test(UNSICHER_MELDUNG),
      UNSICHER_MELDUNG.split("\n").filter((z) => /Production/.test(z)).join(" | "));
    check("7c.2 Sie verlangt stattdessen den geprueft freigegebenen Wert",
      /ausdruecklich geprueften und freigegebenen Wert/.test(UNSICHER_MELDUNG)
        && /HELMUT_CRAWL_RUN_RETENTION/.test(UNSICHER_MELDUNG));

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

    // ── 8c · provision-tenant kann in Production nicht mehr still blob-only ──
    //
    // Betreiberbefund: dieses Werkzeug DRUCKTE den Speicherpfadbericht nur. Damit
    // konnte ein echter Production-Vorgang ohne wirksamen HELMUT_PROFILE_DB_MODE
    // still blob-only schreiben — genau das Ergebnis, das das Abnahmekriterium
    // ausschliesst. Geprueft wird das ECHTE CLI als Kindprozess.
    console.log("\n== 8c · provision-tenant: Riegel vor dem ersten Production-Schreibvorgang ==");
    seedeStore(36);

    // Eine gueltige Spec, ausserhalb des Repos abgelegt, damit sie weder den
    // Speicher-Schnappschuss noch den Netz-Guard beruehrt. Rein synthetisch.
    const specDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "helmut-spec-"));
    const specDatei = path.join(specDir, "spec.json");
    // Die Kennung ist bewusst NICHT aus einer reservierten synthetischen Familie
    // (`test-kohorte-`, `test-mdb-`, `synth-mandat-`, `stapel-`): `validateSpec`
    // weist die naemlich ab, und dieser Abschnitt will den SPEICHERPFAD pruefen,
    // nicht die Kennungsregel. Sie ist ebenso wenig ein reales Mandat.
    fs.writeFileSync(specDatei, JSON.stringify({
      id: "pruefmandat-vorflug-offline",
      email: "pruefmandat-vorflug-offline@pruefmandat.invalid",
      name: "Synthetisches Pruefmandat",
      password: "nur-ein-testwert-kein-secret",
      party: "Testpartei",
      parliamentType: "Bundestag",
      constituency: "Testwahlkreis",
      committees: ["Innenausschuss"]
    }, null, 2));

    // Production-Umgebung mit nicht aufloesbarer `.invalid`-Adresse. Die
    // LAUFZEITSPERRE des Netzschutzes bleibt aktiv; nur seine Umgebungspruefung
    // wird uebersprungen, sonst braeche der Kindprozess mit Exit 3 ab, BEVOR das
    // Werkzeug seine eigene Verweigerung zeigen kann (scripts/lokaler-netzschutz.js:283-296).
    const PROD_BASIS = Object.freeze({
      HELMUT_STORAGE_BACKEND: "supabase",
      SUPABASE_URL: "https://beispiel.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "nur-ein-testwert-kein-secret",
      HELMUT_V3_STORE: "1",
      HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG: "ja"
    });
    const PROD_SICHER = Object.freeze({
      ...PROD_BASIS, HELMUT_CRAWL_RUN_RETENTION: "36", HELMUT_PROFILE_DB_MODE: "1"
    });

    function provTenant(args, env) {
      return cli(["scripts/provision-tenant.js", ...args], env);
    }

    // (1) Production-Vorgang OHNE HELMUT_PROFILE_DB_MODE.
    const ohneModus = provTenant(["--allow-production", "--spec", specDatei],
      { ...PROD_BASIS, HELMUT_CRAWL_RUN_RETENTION: "36" });
    check("8c.1 Production-Vorgang ohne HELMUT_PROFILE_DB_MODE: Exit 2, nichts geschrieben",
      ohneModus.status === 2 && ohneModus.speicherUnveraendert === true,
      `exit=${ohneModus.status} ${ohneModus.fehler.trim().slice(0, 200)}`);
    check("8c.1b Die Meldung nennt das stille Blob-only-Ergebnis",
      /Blob-only/.test(ohneModus.aus + ohneModus.fehler));

    // (2) Gesetzter, aber UNWIRKSAMER Profilmodus (HELMUT_V3_STORE fehlt).
    const unwirksam = provTenant(["--allow-production", "--spec", specDatei],
      { ...PROD_BASIS, HELMUT_V3_STORE: "0", HELMUT_CRAWL_RUN_RETENTION: "36", HELMUT_PROFILE_DB_MODE: "1" });
    check("8c.2 Gesetzter, aber unwirksamer Profilmodus: Exit 2, nichts geschrieben",
      unwirksam.status === 2 && unwirksam.speicherUnveraendert === true,
      `exit=${unwirksam.status}`);

    // (3) Fehlende Aufbewahrungsgrenze.
    const ohneGrenze = provTenant(["--allow-production", "--spec", specDatei],
      { ...PROD_BASIS, HELMUT_PROFILE_DB_MODE: "1" });
    check("8c.3 Fehlende Aufbewahrungsgrenze: Exit 2, nichts geschrieben",
      ohneGrenze.status === 2 && ohneGrenze.speicherUnveraendert === true,
      `exit=${ohneGrenze.status}`);
    check("8c.3b Die Meldung nennt HELMUT_CRAWL_RUN_RETENTION beim Namen",
      /HELMUT_CRAWL_RUN_RETENTION/.test(ohneGrenze.aus + ohneGrenze.fehler));

    // (4) VOLLSTAENDIG SICHERE Umgebung: der Riegel laesst durch.
    //     Der Lauf scheitert danach an der nicht aufloesbaren `.invalid`-Adresse —
    //     das ist erwartet und belegt gerade, dass der Riegel nicht die Ursache war.
    const sicher = provTenant(["--allow-production", "--spec", specDatei], PROD_SICHER);
    check("8c.4 Vollstaendig sichere Umgebung: der Riegel blockiert NICHT (kein Exit 2)",
      sicher.status !== 2
        && !/ABBRUCH \(speicherpfad-unsicher\)/.test(sicher.fehler)
        && !/die Prozessumgebung traegt nicht jeden erforderlichen Wert/.test(sicher.aus + sicher.fehler),
      `exit=${sicher.status} ${sicher.fehler.trim().slice(0, 200)}`);
    check("8c.4b Auch im Erfolgsfall wird das Schreibziel ausgewiesen",
      /Blob-Backend/.test(sicher.aus) && /Relationaler Schreibmodus/.test(sicher.aus)
        && /crawlRuns-Aufbewahrung\s*:\s*36/.test(sicher.aus));
    check("8c.4c Der lokale Speicher bleibt dabei unberuehrt",
      sicher.speicherUnveraendert === true);

    // (5) REINE VALIDIERUNG bleibt moeglich — auch in unsicherer Umgebung.
    const validierung = provTenant(["--allow-production", "--validate", "--spec", specDatei], PROD_BASIS);
    check("8c.5 Reine Validierung laeuft weiter durch (Exit 0), ohne Riegel und ohne Schreibvorgang",
      validierung.status === 0
        && /SPEC GÜLTIG/.test(validierung.aus)
        && validierung.speicherUnveraendert === true,
      `exit=${validierung.status} ${validierung.fehler.trim().slice(0, 160)}`);
    check("8c.5b Die Validierung loest den Riegel gar nicht erst aus",
      !/Speicherziel des Laufs/.test(validierung.aus));

    // (5b) Der Stapel-TROCKENLAUF bleibt ebenfalls moeglich.
    const paketDatei = path.join(specDir, "paket.json");
    fs.writeFileSync(paketDatei, JSON.stringify([JSON.parse(fs.readFileSync(specDatei, "utf8"))], null, 2));
    const trockenPaket = provTenant(["--allow-production", "--paket", paketDatei], PROD_BASIS);
    check("8c.6 Der Stapel-Trockenlauf wird nicht geriegelt (kein Exit 2) und schreibt nichts",
      trockenPaket.status !== 2
        && !/ABBRUCH \(speicherpfad-unsicher\)/.test(trockenPaket.fehler)
        && trockenPaket.speicherUnveraendert === true,
      `exit=${trockenPaket.status} speicherUnveraendert=${trockenPaket.speicherUnveraendert}`);

    // (6) Nachweis fuer JEDEN blockierten Fall: es wurde nichts geschrieben.
    check("8c.7 Jeder blockierte Production-Vorgang hat NICHTS geschrieben",
      [ohneModus, unwirksam, ohneGrenze].every((r) => r.speicherUnveraendert === true
        && r.status === 2));
    check("8c.8 Kein blockierter Lauf hat den Provisionierer ueberhaupt erreicht",
      [ohneModus, unwirksam, ohneGrenze]
        .every((r) => !/=== PROVISIONIERUNG|angelegt|aktualisiert/.test(r.aus)));
    // Der lokale Speicher ist nach der ganzen Gruppe unveraendert 36 Laeufe lang.
    check("8c.9 crawlRuns im lokalen Speicher unveraendert (36)",
      liesStore().crawlRuns.length === 36, `length=${liesStore().crawlRuns.length}`);
    // Es gibt keine Uebergehungsoption: das Werkzeug kennt keinen Schalter dafuer.
    check("8c.10 Es existiert keine Uebergehungsoption im Werkzeug",
      !/--(ignoriere|skip|force|ohne)[-a-z]*speicherpfad/i
        .test(fs.readFileSync(path.join(ROOT, "scripts", "provision-tenant.js"), "utf8")));

    // ── 9 · Kein Kohortenprofil ist nach all dem aktiv ausser dem einen, den
    //        Abschnitt 6 absichtlich aktiviert hat ─────────────────────────────
    // ── 8d · KEINE Argumentkombination umgeht den Riegel ─────────────────────
    //
    // Betreiberbefund (reproduziert): Die Einstufung sagte „`--validate` ⇒ liest
    // nur" und stieg sofort aus; die AUSFUEHRUNG prüfte danach aber in der
    // Reihenfolge --deactivate → --teardown → --paket → erst dann --validate.
    // Damit erreichten
    //   --allow-production --validate --deactivate <id>
    //   --allow-production --validate --teardown <id>
    //   --allow-production --validate --paket <datei> --ausfuehren
    // einen echten Production-Schreibpfad, OHNE dass der Riegel je gelaufen wäre.
    //
    // Geprueft wird VERHALTEN, nicht Quelltext: das echte CLI laeuft als
    // Kindprozess mit einem PRELOAD, der das Provisionierer-Modul abfaengt. Der
    // Preload protokolliert (a) OB das Modul ueberhaupt geladen wurde und (b)
    // JEDEN Aufruf einer schreibenden Funktion. Ein blockierter Fall muss beide
    // Protokolle leer lassen.
    console.log("\n== 8d · Keine Argumentkombination umgeht den Riegel ==");
    const spionDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "helmut-provspion-"));
    const spionLog = path.join(spionDir, "erreicht.log");
    const spionPreload = path.join(spionDir, "provisionierer-spion.js");
    fs.writeFileSync(spionPreload, `"use strict";
const fs = require("fs");
const path = require("path");
const Module = require("module");
const LOG = ${JSON.stringify(spionLog)};
const ZIEL = require.resolve(${JSON.stringify(path.join(ROOT, "lib", "helmut", "provisioning"))});
function melde(was) { fs.appendFileSync(LOG, was + "\\n"); }
const attrappe = {
  deactivateTenant: async (id) => { melde("deactivateTenant:" + id); return { ok: true, log: [] }; },
  teardownTenant: async (id) => { melde("teardownTenant:" + id); return { ok: true, log: [] }; },
  provisionTenant: async () => { melde("provisionTenant"); return { ok: true, log: [] }; },
  provisionBatch: async (specs, d, o) => {
    melde("provisionBatch:ausfuehren=" + Boolean(o && o.ausfuehren));
    return { ok: true, vorbefunde: [], ergebnisse: [], bilanz: { gesamt: 0 }, abgebrochen: false };
  },
  validateSpec: () => [],
  formatProtocol: () => "(Attrappe)",
  PROVISIONING_MARKER: "helmut-provisioning"
};
const echtesLoad = Module._load;
Module._load = function (anfrage, elternteil, istHaupt) {
  let aufgeloest = null;
  try { aufgeloest = Module._resolveFilename(anfrage, elternteil, istHaupt); } catch { /* egal */ }
  if (aufgeloest === ZIEL) { melde("MODUL-GELADEN"); return attrappe; }
  return echtesLoad.apply(this, arguments);
};
`);

    function spionZuruecksetzen() { try { fs.rmSync(spionLog, { force: true }); } catch { /* egal */ } }
    function spionLesen() {
      try { return fs.readFileSync(spionLog, "utf8").split("\n").filter(Boolean); } catch { return []; }
    }
    function provLauf(args, env) {
      spionZuruecksetzen();
      const r = cli(["scripts/provision-tenant.js", ...args], env, spionPreload);
      return { ...r, erreicht: spionLesen() };
    }

    // Positivkontrolle: der Spion sieht wirklich. Ohne sie belegt keine der
    // folgenden Leer-Aussagen etwas.
    const positiv = provLauf(["--allow-production", "--spec", specDatei], PROD_SICHER);
    check("8d.0 POSITIVKONTROLLE: bei sicherer Umgebung wird der Provisionierer geladen UND aufgerufen",
      positiv.erreicht.includes("MODUL-GELADEN") && positiv.erreicht.includes("provisionTenant"),
      JSON.stringify(positiv.erreicht));

    const paketDatei2 = path.join(specDir, "paket2.json");
    fs.writeFileSync(paketDatei2, JSON.stringify([JSON.parse(fs.readFileSync(specDatei, "utf8"))], null, 2));

    // Jeder dieser Aufrufe MUSS mit Exitcode 2 enden, ohne den Provisionierer
    // auch nur zu laden. Die Reihenfolge der Angaben ist bewusst durchmischt.
    const UMGEHUNGSVERSUCHE = [
      { name: "--validate + --deactivate", args: ["--allow-production", "--validate", "--deactivate", "mandat-x"] },
      { name: "--validate + --teardown", args: ["--allow-production", "--validate", "--teardown", "mandat-x"] },
      { name: "--validate + --paket + --ausfuehren", args: ["--allow-production", "--validate", "--paket", paketDatei2, "--ausfuehren"] },
      { name: "Reihenfolge: --deactivate zuerst", args: ["--deactivate", "mandat-x", "--validate", "--allow-production"] },
      { name: "Reihenfolge: --validate zuerst", args: ["--validate", "--allow-production", "--paket", paketDatei2, "--ausfuehren"] },
      { name: "Reihenfolge: --ausfuehren zuerst", args: ["--ausfuehren", "--paket", paketDatei2, "--validate", "--allow-production"] },
      { name: "Reihenfolge: --teardown ganz hinten", args: ["--validate", "--allow-production", "--teardown", "mandat-x"] },
      { name: "zwei Hauptmodi: --deactivate + --teardown", args: ["--allow-production", "--deactivate", "a", "--teardown", "b"] },
      { name: "zwei Hauptmodi: --paket + --deactivate", args: ["--allow-production", "--paket", paketDatei2, "--deactivate", "a"] },
      { name: "drei Hauptmodi gleichzeitig", args: ["--allow-production", "--paket", paketDatei2, "--deactivate", "a", "--teardown", "b"] },
      { name: "--ausfuehren ohne --paket", args: ["--allow-production", "--ausfuehren", "--spec", specDatei] },
      { name: "--deactivate ohne eigenen Wert", args: ["--allow-production", "--deactivate", "--validate"] }
    ];
    for (const v of UMGEHUNGSVERSUCHE) {
      // Bewusst mit VOLLSTAENDIG SICHERER Umgebung: dann kann der Abbruch nur am
      // Widerspruch liegen, nicht an einem fehlenden Umgebungswert. Genau so ist
      // der Nachweis scharf.
      const r = provLauf(v.args, PROD_SICHER);
      check(`8d.x ${v.name}: Exit 2, Provisionierer NICHT geladen, nichts geschrieben`,
        r.status === 2 && r.erreicht.length === 0 && r.speicherUnveraendert === true,
        `exit=${r.status} erreicht=${JSON.stringify(r.erreicht)} ${r.fehler.trim().slice(0, 160)}`);
    }
    check("8d.13 Die Abbruchmeldung benennt den Widerspruch",
      /widersprüchlicher Aufruf/.test(
        provLauf(["--allow-production", "--validate", "--deactivate", "mandat-x"], PROD_SICHER).fehler));

    // Und dieselben Umgehungsversuche greifen auch bei UNSICHERER Umgebung nicht
    // an den Provisionierer heran.
    const unsicherUndWidersprüchlich = provLauf(
      ["--allow-production", "--validate", "--paket", paketDatei2, "--ausfuehren"], PROD_BASIS);
    check("8d.14 Auch bei unsicherer Umgebung: Exit 2, Provisionierer nicht geladen",
      unsicherUndWidersprüchlich.status === 2
        && unsicherUndWidersprüchlich.erreicht.length === 0
        && unsicherUndWidersprüchlich.speicherUnveraendert === true);

    // ── Die legitimen Aufrufe bleiben moeglich und werden richtig eingestuft ──
    const echteValidierung = provLauf(["--allow-production", "--validate", "--spec", specDatei], PROD_BASIS);
    check("8d.15 Echter reiner Validierungslauf: Exit 0, KEIN Schreibaufruf",
      echteValidierung.status === 0
        && !echteValidierung.erreicht.some((z) => /Tenant|provisionBatch/.test(z))
        && echteValidierung.speicherUnveraendert === true,
      `exit=${echteValidierung.status} erreicht=${JSON.stringify(echteValidierung.erreicht)}`);

    const echterTrockenlauf = provLauf(["--allow-production", "--paket", paketDatei2], PROD_BASIS);
    check("8d.16 Echter Paket-Trockenlauf: kein Exit 2, provisionBatch mit ausfuehren=false",
      echterTrockenlauf.status !== 2
        && echterTrockenlauf.erreicht.includes("provisionBatch:ausfuehren=false")
        && echterTrockenlauf.speicherUnveraendert === true,
      `exit=${echterTrockenlauf.status} erreicht=${JSON.stringify(echterTrockenlauf.erreicht)}`);

    // Alle vier schreibenden Modi erreichen bei SICHERER Umgebung ihren Schreiber
    // — der Riegel sperrt nichts Legitimes aus.
    for (const [name, args, erwartet] of [
      ["Einzelspec", ["--allow-production", "--spec", specDatei], "provisionTenant"],
      ["--deactivate", ["--allow-production", "--deactivate", "mandat-x"], "deactivateTenant:mandat-x"],
      ["--teardown", ["--allow-production", "--teardown", "mandat-x"], "teardownTenant:mandat-x"],
      ["--paket --ausfuehren", ["--allow-production", "--paket", paketDatei2, "--ausfuehren"], "provisionBatch:ausfuehren=true"]
    ]) {
      const r = provLauf(args, PROD_SICHER);
      check(`8d.x ${name} bei sicherer Umgebung erreicht seinen Schreiber`,
        r.status !== 2 && r.erreicht.includes(erwartet),
        `exit=${r.status} erreicht=${JSON.stringify(r.erreicht)}`);
    }
    // Und dieselben vier Modi werden bei UNSICHERER Umgebung samt und sonders
    // geriegelt — inklusive derer, die vorher am Riegel vorbeikamen.
    for (const [name, args] of [
      ["Einzelspec", ["--allow-production", "--spec", specDatei]],
      ["--deactivate", ["--allow-production", "--deactivate", "mandat-x"]],
      ["--teardown", ["--allow-production", "--teardown", "mandat-x"]],
      ["--paket --ausfuehren", ["--allow-production", "--paket", paketDatei2, "--ausfuehren"]]
    ]) {
      const r = provLauf(args, PROD_BASIS);
      check(`8d.x ${name} bei unsicherer Umgebung: Exit 2, kein Schreibaufruf`,
        r.status === 2 && !r.erreicht.some((z) => /Tenant|provisionBatch/.test(z))
          && r.speicherUnveraendert === true,
        `exit=${r.status} erreicht=${JSON.stringify(r.erreicht)}`);
    }

    // ── 8e · SYSTEMATISCH: alle Argumentkombinationen auf einmal ─────────────
    //
    // Einzelne Gegenbeispiele belegen nur, was jemand sich ausgedacht hat. Hier
    // wird die INVARIANTE ueber den ganzen Kombinationsraum gefahren:
    //
    //   Bei einer Production-Umgebung, deren Speicherpfad NICHT belegt ist, darf
    //   KEINE Kombination der vorhandenen Argumente einen schreibenden Aufruf
    //   erreichen.
    //
    // Der Stapel-Trockenlauf (`provisionBatch` mit `ausfuehren=false`) zaehlt
    // ausdruecklich NICHT als Schreibaufruf — er schreibt nichts.
    console.log("\n== 8e · Systematischer Kombinationsdurchlauf ==");
    const SWEEP_OPTIONEN = [
      ["--validate"],
      ["--deactivate", "mandat-x"],
      ["--teardown", "mandat-y"],
      ["--paket", paketDatei2],
      ["--ausfuehren"],
      ["--spec", specDatei]
    ];
    const lecks = [];
    let kombinationen = 0;
    for (let maske = 0; maske < (1 << SWEEP_OPTIONEN.length); maske += 1) {
      const args = ["--allow-production"];
      for (let i = 0; i < SWEEP_OPTIONEN.length; i += 1) {
        if (maske & (1 << i)) args.push(...SWEEP_OPTIONEN[i]);
      }
      const r = provLauf(args, PROD_BASIS);
      kombinationen += 1;
      const schreibend = r.erreicht.filter((z) => /^(deactivateTenant|teardownTenant|provisionTenant)/.test(z)
        || z === "provisionBatch:ausfuehren=true");
      if (schreibend.length || r.speicherUnveraendert !== true) {
        lecks.push({ args, exit: r.status, erreicht: r.erreicht });
      }
    }
    check(`8e.1 Der Durchlauf hat wirklich alle ${1 << SWEEP_OPTIONEN.length} Kombinationen gefahren`,
      kombinationen === (1 << SWEEP_OPTIONEN.length), `gefahren=${kombinationen}`);
    check("8e.2 KEINE Kombination erreicht bei unbelegtem Speicherpfad einen Schreibaufruf",
      lecks.length === 0,
      `${lecks.length} Leck(s), erstes: ${JSON.stringify(lecks[0] || null)}`);

    fs.rmSync(spionDir, { recursive: true, force: true });
    fs.rmSync(specDir, { recursive: true, force: true });

    console.log("\n== 9 · Die VOLLE Stufe A bleibt inaktiv, Bestandsprofile unveraendert ==");
    //
    // KORRIGIERT (Betreiberbefund): Dieser Abschnitt legte fuenf Profile an und
    // erklaerte danach "Stufe A" fuer inaktiv. Fuenf von zwanzig sind kein
    // Nachweis fuer Stufe A — und genau zwanzig Schreibvorgaenge waren es, die am
    // 04.09. den Ring gekuerzt haben. Geprueft wird jetzt die VOLLE dokumentierte
    // Kennungsliste.
    //
    // KEINE zweite Liste: die Kennungen kommen aus der verbindlichen
    // Stufendefinition (`lib/helmut/testkohorte-stufen.js`), nicht aus einer
    // hartkodierten Aufzaehlung in dieser Suite.
    const STUFE_A = ST.kennungenDerStufe("a");
    check("9.0a Die Stufendefinition liefert genau 20 Kennungen (nicht leer-wahr)",
      Array.isArray(STUFE_A) && STUFE_A.length === 20 && STUFE_A.length === ST.STUFEN_UMFANG.a,
      `laenge=${Array.isArray(STUFE_A) ? STUFE_A.length : "kein Array"}`);

    seedeStore(36);
    const bestandVorher = JSON.stringify(liesStore().profiles[BESTANDSPROFIL_ID]);
    const ringVorher = liesStore().crawlRuns.length;
    // Genau der Vorgang vom 04.09.: 20 Profil-Schreibvorgaenge auf die geteilte
    // Zeile, ohne Aufbewahrungsvariable in der Umgebung.
    delete process.env.HELMUT_CRAWL_RUN_RETENTION;
    for (const id of STUFE_A) {
      await storage.saveProfile({
        id,
        name: `Synthetisch ${id}`,
        profileActive: false,
        committees: ["Innenausschuss"]
      });
    }
    const endstand = liesStore();
    const kohortenprofile = Object.values(endstand.profiles || {})
      .filter((p) => String(p.id || "").startsWith("test-kohorte-"));

    check("9.1 Es liegen genau 20 Kohortenprofile im Testbestand",
      kohortenprofile.length === 20, `gefunden=${kohortenprofile.length}`);
    check("9.2 Alle 20 gehoeren zur Stufe A (Abgleich gegen die Stufendefinition)",
      kohortenprofile.length === 20
        && kohortenprofile.every((p) => STUFE_A.includes(p.id))
        && STUFE_A.every((id) => Boolean(endstand.profiles[id])),
      `fremd: ${kohortenprofile.filter((p) => !STUFE_A.includes(p.id)).map((p) => p.id).join(", ")}`);
    check("9.3 Alle 20 sind INAKTIV",
      kohortenprofile.length === 20 && kohortenprofile.every((p) => p.profileActive === false),
      `aktiv: ${kohortenprofile.filter((p) => p.profileActive !== false).map((p) => p.id).join(", ")}`);
    check("9.4 Das Bestandsprofil ist nach 20 fremden Schreibvorgaengen byte-identisch",
      JSON.stringify(endstand.profiles[BESTANDSPROFIL_ID]) === bestandVorher
        && endstand.profiles[BESTANDSPROFIL_ID].updatedAt === "2026-08-01T00:00:00.000Z");
    check("9.5 crawlRuns bleibt nach 20 Schreibvorgaengen vollstaendig erhalten (36)",
      ringVorher === 36 && endstand.crawlRuns.length === 36,
      `vorher=${ringVorher} nachher=${endstand.crawlRuns.length} (am 04.09. fiel er hier auf 20)`);
    // Der Seed ist absteigend nach createdAt sortiert: Position 0 ist der juengste
    // Lauf (`lauf-000`), Position 35 der aelteste (`lauf-035`). Genau die Positionen
    // 21-36 hat der Vorfall am 04.09. entfernt.
    check("9.6 Die aeltesten Laufzeilen (Positionen 21-36) leben noch",
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
  // Die Untergrenze liegt dicht unter dem tatsaechlichen Umfang (Stand 04.09.: 115).
  // Sie ist kein Schaetzwert, sondern ein Riegel gegen eine Suite, die durch einen
  // frueh abbrechenden Zweig fast nichts mehr prueft und trotzdem gruen endet.
  const MINDESTZAHL = 110;
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
