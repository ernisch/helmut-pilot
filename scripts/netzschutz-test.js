"use strict";

// Helmut — NACHWEIS DES LOKALEN NETZ- UND PRODUCTIONSCHUTZES (OP-30, Korrektursprint).
// =============================================================================================
// Diese Suite beweist, dass der Vorfall vom 2026-08-08 (versehentlicher lesender
// Production-Zugriff) technisch nicht wiederholbar ist — und zwar nicht fuer das eine Skript,
// sondern fuer jeden lokalen Aufruf.
//
// Sie prueft die zwoelf vom Auftrag geforderten Faelle einzeln und benutzt dafuer ECHTE
// Kindprozesse, weil der Schutz genau dort wirken muss: ein Riegel, der nur im eigenen
// Prozess haelt, ist wertlos, sobald ein Test-Runner spawnt.
//
// KEIN echter Netzzugriff. Nicht-lokale Ziele sind ausschliesslich `.invalid`-Namen
// (RFC 2606, aufloesen per Definition nie) — und der Schutz greift ohnehin vor dem DNS.

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SCHUTZ = path.join(ROOT, "scripts/lokaler-netzschutz.js");

// Das Modul nur LADEN, nicht scharfschalten — sonst beendet es diesen Testprozess selbst.
process.env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN = "ja";
const S = require(SCHUTZ);

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// Eine SAUBERE Umgebung: ohne jede Production-Kennung, Quellenmodus aus.
function sauber(zusatz = {}) {
  const env = { ...process.env };
  for (const n of S.PRODUCTION_KENNUNGEN) delete env[n];
  for (const n of [...S.DB_HOST_VARIABLEN, ...S.DB_URL_VARIABLEN]) delete env[n];
  delete env.HELMUT_LOKALER_SCHUTZ_NUR_LADEN;
  delete env.NODE_OPTIONS;
  env.HELMUT_SOURCE_MODE = "off";
  return { ...env, ...zusatz };
}

// Startet einen echten Kindprozess MIT Preload und meldet, ob der Schutz ihn beendet hat.
function starte(code, env) {
  const r = spawnSync(process.execPath, ["--require", SCHUTZ, "-e", code],
    { encoding: "utf8", env, timeout: 30000 });
  return {
    status: r.status,
    abgebrochen: r.status === 3,
    aus: String(r.stdout || ""),
    fehler: String(r.stderr || "")
  };
}

function main() {
  console.log("Helmut — Nachweis des lokalen Netz- und Productionschutzes (OP-30)");
  console.log("  Echte Kindprozesse · kein echter Netzzugriff · nur .invalid-Ziele\n");

  // ═══ 1-4 · WAS ALS LOKAL GILT ═══════════════════════════════════════════════
  abschnitt("1 · localhost");
  for (const h of ["localhost", "localhost.localdomain", "LOCALHOST"]) {
    check(`1.x ${JSON.stringify(h)} gilt als lokal`, S.istLokalerHost(h) === true);
  }

  abschnitt("2 · IPv4-Loopback");
  for (const h of ["127.0.0.1", "127.0.0.53", "127.1.2.3", "0.0.0.0"]) {
    check(`2.x ${h} gilt als lokal`, S.istLokalerHost(h) === true);
  }
  for (const h of ["127.0.0.256", "128.0.0.1", "10.0.0.1", "192.168.1.5", "169.254.169.254"]) {
    check(`2.y ${h} gilt NICHT als lokal`, S.istLokalerHost(h) === false);
  }

  abschnitt("3 · IPv6-Loopback");
  for (const h of ["::1", "[::1]", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1"]) {
    check(`3.x ${JSON.stringify(h)} gilt als lokal`, S.istLokalerHost(h) === true);
  }
  for (const h of ["::2", "2001:db8::1", "fe80::1"]) {
    check(`3.y ${JSON.stringify(h)} gilt NICHT als lokal`, S.istLokalerHost(h) === false);
  }

  abschnitt("4 · Lokale Testcontainer und Unix-Sockets");
  check("4.1 host.docker.internal gilt als lokal", S.istLokalerHost("host.docker.internal") === true);
  check("4.2 Ein Unix-Socket-Pfad gilt als lokal", S.istLokalerHost("/tmp/pgsock") === true);
  check("4.3 Ein fremder Containername gilt NICHT als lokal", S.istLokalerHost("db.internal.example") === false);

  // ═══ 5 · EXTERNE DATENBANKADRESSEN ══════════════════════════════════════════
  abschnitt("5 · Externe Datenbankadressen brechen ab");
  {
    const r1 = starte('console.log("gelaufen")', sauber({ HELMUT_TEST_PG_HOST: "db.beispiel.invalid" }));
    check("5.1 HELMUT_TEST_PG_HOST extern -> Abbruch", r1.abgebrochen, `exit ${r1.status}`);
    check("5.2 Der Grund wird benannt", /keine eindeutig lokale Adresse/.test(r1.fehler));

    const r2 = starte('console.log("gelaufen")', sauber({ DATABASE_URL: "postgres://u:p@db.beispiel.invalid:5432/x" }));
    check("5.3 DATABASE_URL extern -> Abbruch", r2.abgebrochen, `exit ${r2.status}`);
    check("5.4 Das Passwort erscheint NICHT in der Meldung", !/:p@|passwort|u:p/.test(r2.fehler));

    const r3 = starte('console.log("gelaufen")', sauber({ DATABASE_URL: "postgres://u:p@127.0.0.1:5432/x" }));
    check("5.5 DATABASE_URL lokal -> laeuft", r3.status === 0 && /gelaufen/.test(r3.aus), `exit ${r3.status}`);

    const r4 = starte('console.log("gelaufen")', sauber({ HELMUT_TEST_PG_HOST: "/tmp/pgsock" }));
    check("5.6 Unix-Socket -> laeuft", r4.status === 0, `exit ${r4.status}`);
  }

  // ═══ 6 · PRODUCTION-KENNUNGEN ═══════════════════════════════════════════════
  abschnitt("6 · Bekannte Production-Kennungen brechen ab");
  {
    const faelle = [
      ["SUPABASE_URL", "https://beispielprojekt.supabase.invalid"],
      ["SUPABASE_SERVICE_ROLE_KEY", "attrappe-kein-echter-schluessel"],
      ["OPENAI_API_KEY", "attrappe"],
      ["DATABASE_URL", "postgres://u@db.beispiel.invalid/x"]
    ];
    for (const [name, wert] of faelle) {
      const r = starte('console.log("gelaufen")', sauber({ [name]: wert }));
      check(`6.x ${name} gesetzt -> Abbruch`, r.abgebrochen, `exit ${r.status}`);
      check(`6.y ${name}: der WERT erscheint nicht in der Meldung`,
        !r.fehler.includes(wert), "Geheimnisschutz");
    }
    const r = starte('console.log("gelaufen")', sauber());
    check("6.z Ohne jede Kennung laeuft der Prozess normal", r.status === 0 && /gelaufen/.test(r.aus));
  }

  // ═══ 7 · LEERE UND UNGUELTIGE WERTE ═════════════════════════════════════════
  abschnitt("7 · Leere und ungueltige Werte");
  {
    // Leer = nicht gesetzt: das ist der gewollte lokale Normalfall, kein Abbruch.
    const r1 = starte('console.log("gelaufen")', sauber({ HELMUT_TEST_PG_HOST: "" }));
    check("7.1 Leerer DB-Host gilt als nicht gesetzt (laeuft)", r1.status === 0, `exit ${r1.status}`);

    const r2 = starte('console.log("gelaufen")', sauber({ DATABASE_URL: "kein-gueltiges-url-format" }));
    check("7.2 Ungueltige DB-URL -> Abbruch", r2.abgebrochen, `exit ${r2.status}`);
    check("7.3 Die Diagnose ist verstaendlich", /keine gueltige URL|ungueltige Angabe/.test(r2.fehler));

    // Quellenmodus: alles ausser genau "off" ist ein Abbruch.
    for (const wert of ["", "on", "shadow", "OFF ", "0", "aus", "nein"]) {
      const env = sauber(); env.HELMUT_SOURCE_MODE = wert;
      const r = starte('console.log("gelaufen")', env);
      const sollLaufen = String(wert).trim().toLowerCase() === "off";
      check(`7.x HELMUT_SOURCE_MODE=${JSON.stringify(wert)} -> ${sollLaufen ? "laeuft" : "Abbruch"}`,
        sollLaufen ? r.status === 0 : r.abgebrochen, `exit ${r.status}`);
    }
    const envFehlt = sauber(); delete envFehlt.HELMUT_SOURCE_MODE;
    const r3 = starte('console.log("gelaufen")', envFehlt);
    check("7.y Fehlender HELMUT_SOURCE_MODE -> Abbruch (fail closed)", r3.abgebrochen, `exit ${r3.status}`);
  }

  // ═══ 8 · WIDERSPRUECHLICHE VARIABLEN ════════════════════════════════════════
  abschnitt("8 · Widersprueche zwischen Variablen");
  {
    const r = starte('console.log("gelaufen")',
      sauber({ HELMUT_TEST_PG_HOST: "127.0.0.1", DATABASE_URL: "postgres://u@db.beispiel.invalid/x" }));
    check("8.1 Lokal + extern gleichzeitig -> Abbruch", r.abgebrochen, `exit ${r.status}`);
    check("8.2 Der Widerspruch wird ausdruecklich benannt",
      /widerspruechlich|nicht entscheidbar/.test(r.fehler));
    const beide = starte('console.log("gelaufen")',
      sauber({ HELMUT_TEST_PG_HOST: "127.0.0.1", DATABASE_URL: "postgres://u@localhost/x" }));
    check("8.3 Zwei LOKALE Angaben sind kein Widerspruch", beide.status === 0, `exit ${beide.status}`);
  }

  // ═══ 9 · GEERBTE SHELL-VARIABLEN ════════════════════════════════════════════
  abschnitt("9 · Geerbte Shell-Variablen (die Ursache des Vorfalls)");
  {
    // Genau der Fall vom 2026-08-08: die Zugangsdaten liegen einfach in der Umgebung,
    // niemand hat sie fuer diesen Aufruf gesetzt.
    const geerbt = sauber({ SUPABASE_URL: "https://beispiel.supabase.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "attrappe" });
    const r = starte('globalThis.fetch("https://beispiel.supabase.invalid/rest/v1/x").then(()=>console.log("GELESEN"))', geerbt);
    check("9.1 Geerbte Zugangsdaten -> Abbruch VOR jedem Zugriff", r.abgebrochen, `exit ${r.status}`);
    check("9.2 Es wurde nichts gelesen", !/GELESEN/.test(r.aus));

    // Und der Starter nimmt genau diese Falle weg.
    const r2 = spawnSync(process.execPath,
      [path.join(ROOT, "scripts/lokal.js"), "--", process.execPath, "-e",
        'console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "GESETZT" : "entfernt")'],
      { encoding: "utf8", env: geerbt, timeout: 30000 });
    check("9.3 `scripts/lokal.js` entfernt die geerbten Zugangsdaten",
      /entfernt/.test(String(r2.stdout || "")), String(r2.stdout || "").trim().slice(0, 60));
  }

  // ═══ 10 · UNTERPROZESSE UND TEST-RUNNER ═════════════════════════════════════
  abschnitt("10 · Unterprozesse erben den Schutz");
  {
    const code = `
      const { spawnSync } = require("child_process");
      const r = spawnSync(process.execPath, ["-e",
        'globalThis.fetch("https://beispiel.invalid/x").then(()=>console.log("KIND-DURCHGELASSEN")).catch(e=>console.log("KIND-BLOCKIERT"))'],
        { encoding: "utf8", env: process.env });
      process.stdout.write(String(r.stdout||""));
    `;
    const r = starte(code, sauber());
    check("10.1 Der Kindprozess ist ebenfalls geschuetzt", /KIND-BLOCKIERT/.test(r.aus), r.aus.trim().slice(0, 40));
    check("10.2 NODE_OPTIONS traegt den Preload weiter",
      /KIND-BLOCKIERT/.test(r.aus) && !/KIND-DURCHGELASSEN/.test(r.aus));

    const enkel = starte(`
      const { spawnSync } = require("child_process");
      const inner = 'const {spawnSync}=require("child_process");'
        + 'const r=spawnSync(process.execPath,["-e",\`globalThis.fetch("https://beispiel.invalid/x").then(()=>console.log("ENKEL-DURCH")).catch(()=>console.log("ENKEL-BLOCKIERT"))\`],{encoding:"utf8",env:process.env});'
        + 'process.stdout.write(String(r.stdout||""));';
      const r = spawnSync(process.execPath, ["-e", inner], { encoding: "utf8", env: process.env });
      process.stdout.write(String(r.stdout||""));
    `, sauber());
    check("10.3 Auch die zweite Ebene ist geschuetzt", /ENKEL-BLOCKIERT/.test(enkel.aus), enkel.aus.trim().slice(0, 40));
  }

  // ═══ 11 · LESEN UND SCHREIBEN ═══════════════════════════════════════════════
  abschnitt("11 · Lesezugriffe UND Schreibzugriffe");
  {
    const lesen = starte(
      'globalThis.fetch("https://beispiel.invalid/rest/v1/tab?select=*").then(()=>console.log("GELESEN")).catch(()=>console.log("LESEN-BLOCKIERT"))',
      sauber());
    check("11.1 Lesezugriff blockiert", /LESEN-BLOCKIERT/.test(lesen.aus));
    const schreiben = starte(
      'globalThis.fetch("https://beispiel.invalid/rest/v1/tab",{method:"POST",body:"{}"}).then(()=>console.log("GESCHRIEBEN")).catch(()=>console.log("SCHREIBEN-BLOCKIERT"))',
      sauber());
    check("11.2 Schreibzugriff blockiert", /SCHREIBEN-BLOCKIERT/.test(schreiben.aus));
    const roh = starte(
      'try{require("net").connect({host:"beispiel.invalid",port:5432});console.log("SOCKET-DURCH")}catch(e){console.log("SOCKET-BLOCKIERT")}',
      sauber());
    check("11.3 Roher Socket blockiert (Datenbanktreiber gehen hier vorbei)", /SOCKET-BLOCKIERT/.test(roh.aus));
    const tls = starte(
      'try{require("tls").connect({host:"beispiel.invalid",port:443});console.log("TLS-DURCH")}catch(e){console.log("TLS-BLOCKIERT")}',
      sauber());
    check("11.4 TLS-Verbindung blockiert", /TLS-BLOCKIERT/.test(tls.aus));
    const lokal = starte(
      'try{require("net").connect({host:"127.0.0.1",port:5433}).on("error",()=>{});console.log("LOKAL-ERLAUBT")}catch(e){console.log("LOKAL-BLOCKIERT <- FEHLER")}',
      sauber());
    check("11.5 Lokale Verbindung bleibt ERLAUBT (der Schutz sperrt nicht die Arbeit)",
      /LOKAL-ERLAUBT/.test(lokal.aus), lokal.aus.trim().slice(0, 40));
  }

  // ═══ 12 · MIGRATIONEN, SIMULATIONEN, BROWSER ════════════════════════════════
  abschnitt("12 · Migrationen, Simulationen und Browser-Tests");
  {
    // Stellvertretend fuer die drei Gattungen: ein Lauf, der wie eine Migration/Simulation
    // eine DB-Adresse benutzt, und einer, der wie ein Browsertest eine Seite laedt.
    const migration = starte(
      'console.log("Migration wuerde laufen gegen", process.env.HELMUT_TEST_PG_HOST)',
      sauber({ HELMUT_TEST_PG_HOST: "db.produktion.invalid" }));
    check("12.1 Migration gegen fremde DB -> Abbruch", migration.abgebrochen, `exit ${migration.status}`);

    const simulation = starte(
      'console.log("Simulation laeuft"); ',
      sauber({ HELMUT_TEST_PG_HOST: "127.0.0.1" }));
    check("12.2 Simulation gegen lokale DB laeuft", simulation.status === 0, `exit ${simulation.status}`);

    const browser = starte(
      'globalThis.fetch("https://helmut.beispiel.invalid/").then(()=>console.log("SEITE-GELADEN")).catch(()=>console.log("BROWSER-BLOCKIERT"))',
      sauber());
    check("12.3 Browsertest gegen fremde URL blockiert", /BROWSER-BLOCKIERT/.test(browser.aus));

    const browserLokal = starte(
      'globalThis.fetch("http://127.0.0.1:3000/").then(()=>console.log("LOKAL-OK")).catch(e=>console.log(String(e.message).includes("LOKALER-SCHUTZ")?"LOKAL-BLOCKIERT <- FEHLER":"LOKAL-OK"))',
      sauber());
    check("12.4 Browsertest gegen localhost bleibt erlaubt", /LOKAL-OK/.test(browserLokal.aus),
      browserLokal.aus.trim().slice(0, 40));
  }

  // ═══ 13 · DIE URSACHE IST GESCHLOSSEN ═══════════════════════════════════════
  abschnitt("13 · Die Luecke von 2026-08-08 ist geschlossen");
  {
    const runnerSrc = require("fs").readFileSync(path.join(ROOT, "scripts/run-offline-tests.js"), "utf8");
    check("13.1 Der Runner benutzt den zentralen Schutz",
      /lokaler-netzschutz/.test(runnerSrc), "Verweis im Runner");
    // Der eigentliche Beweis: der Weg des Vorfalls fuehrt jetzt zum Abbruch.
    const vorfall = starte(
      'globalThis.fetch("https://beispiel.supabase.invalid/rest/v1/gate_shadow_events?select=*").then(()=>console.log("VORFALL-WIEDERHOLT"))',
      sauber({ SUPABASE_URL: "https://beispiel.supabase.invalid", SUPABASE_SERVICE_ROLE_KEY: "attrappe" }));
    check("13.2 Der exakte Weg des Vorfalls endet jetzt im Abbruch",
      vorfall.abgebrochen && !/VORFALL-WIEDERHOLT/.test(vorfall.aus), `exit ${vorfall.status}`);
  }

  // ═══ 14 · DIE AUSNAHME SCHWAECHT DEN SCHUTZ NICHT ══════════════════════════
  abschnitt("14 · Simulierte Umgebung: Umgebungspruefung aus, Laufzeitsperre AN");
  {
    // Drei Suiten bauen absichtlich eine Production-aussehende Umgebung auf, um die
    // VERWEIGERUNGSLOGIK der Werkzeuge zu beweisen (restore-drill, backup-export,
    // understanding-recovery). Fuer sie entfaellt die Umgebungspruefung. Die entscheidende
    // Frage lautet dann: haelt die Laufzeitsperre trotzdem? Wenn nicht, waere die Ausnahme
    // ein Loch statt einer Ausnahme.
    const env = sauber({
      HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG: "ja",
      SUPABASE_URL: "https://beispiel.supabase.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "attrappe"
    });
    const code = 'console.log("GESTARTET");'
      + 'globalThis.fetch("https://beispiel.supabase.invalid/rest/v1/x")'
      + '.then(function(){console.log("DURCHGELASSEN")})'
      + '.catch(function(){console.log("BLOCKIERT")});';
    const r = starte(code, env);
    check("14.1 Der Prozess startet (Umgebungspruefung uebersprungen)",
      /GESTARTET/.test(r.aus) && !r.abgebrochen, `exit ${r.status}`);
    check("14.2 Die LAUFZEITSPERRE haelt trotzdem — nichts geht nach draussen",
      /BLOCKIERT/.test(r.aus) && !/DURCHGELASSEN/.test(r.aus), r.aus.trim().slice(0, 40));

    const lokalCode = 'require("net").connect({host:"127.0.0.1",port:5433}).on("error",function(){});'
      + 'console.log("LOKAL-ERLAUBT");';
    check("14.3 Lokale Verbindungen bleiben auch hier erlaubt",
      /LOKAL-ERLAUBT/.test(starte(lokalCode, env).aus));

    // Und die Ausnahme gilt NUR bei genau "ja" — sonst waere sie versehentlich aktivierbar.
    for (const wert of ["", "1", "true", "vielleicht", "nein"]) {
      const e2 = sauber({ HELMUT_SCHUTZ_SIMULIERTE_UMGEBUNG: wert, SUPABASE_URL: "https://x.invalid" });
      const rr = starte('console.log("gelaufen")', e2);
      check(`14.x Ausnahme bei ${JSON.stringify(wert)} ist NICHT aktiv`, rr.abgebrochen, `exit ${rr.status}`);
    }
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("\nKein einziger echter Netzzugriff: alle nicht-lokalen Ziele sind `.invalid`-Namen,");
  console.log("und der Schutz greift ohnehin vor der Namensaufloesung.");
  process.exit(fail === 0 ? 0 : 1);
}

main();
