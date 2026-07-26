"use strict";

// ============================================================================
// Negativtests fuer scripts/backup-export.js — die Pre-Seed-Sicherung.
// ============================================================================
// Warum dieser Test existiert: backup-export.js ist (bis OP-01 freigegeben ist)
// die EINZIGE Wiederherstellungsgrundlage vor der Quellen-Seed-Einspielung. Seine
// Vollstaendigkeitslogik war bis hierhin vollstaendig ungeprueft — ein still
// gekappter Export haette wie ein vollstaendiges Backup ausgesehen, und genau das
// faellt erst im Ernstfall auf.
//
// METHODE: ein lokaler HTTP-Server ahmt PostgREST nach (Content-Range fuer
// `Prefer: count=exact`, limit/offset-Paginierung). Das Skript wird als ECHTER
// Kindprozess dagegen gefahren — damit sind Exit-Code, Manifest und
// HTTP-Verhalten am realen Programm geprueft, nicht an einer Nachbildung.
//
// KEIN Production-Zugriff: der Server laeuft auf 127.0.0.1, die Zugangsdaten sind
// Attrappen. Es werden KEINE echten Production-Daten verwendet.

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const ROOT = path.join(__dirname, "..");
const SKRIPT = path.join(__dirname, "backup-export.js");
const { SEED_SCOPE_TABLES, PROFIL_SCOPE_TABLES, SCOPES, TABLES } = require("./backup-export.js");

// Eine Zeile je Tabelle bauen, die zur PK-Spalte des Skripts passt.
function zeile(tabelle, i) {
  const pkCols = String(TABLES[tabelle]).split(",").map((c) => c.trim());
  const row = { wert: `w${i}` };
  for (const c of pkCols) row[c] = `${tabelle}-${i}-${c}`;
  return row;
}

// PostgREST-Attrappe. `plan` steuert je Tabelle, wie sich der Server verhaelt.
function starteServer(plan, protokoll) {
  const server = http.createServer((req, res) => {
    protokoll.push({ method: req.method, url: req.url });
    const u = new URL(req.url, "http://127.0.0.1");
    const tabelle = u.pathname.replace(/^\/rest\/v1\//, "");
    const cfg = plan[tabelle] || { zeilen: 0 };

    if (cfg.status && cfg.status >= 400) {
      res.writeHead(cfg.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "kaputt" }));
      return;
    }

    const limit = Number(u.searchParams.get("limit") || "0");
    const offset = Number(u.searchParams.get("offset") || "0");

    // Zaehl-Anfrage: limit=1 ohne offset, mit Prefer: count=exact
    if (String(req.headers.prefer || "").includes("count=exact")) {
      const gemeldet = cfg.meldetAnzahl === undefined ? cfg.zeilen : cfg.meldetAnzahl;
      const headers = { "content-type": "application/json" };
      // `ohneRange` bildet einen Server ab, der keine Zeilenzahl liefert.
      if (!cfg.ohneRange) headers["content-range"] = `0-0/${gemeldet}`;
      res.writeHead(200, headers);
      res.end(JSON.stringify(cfg.zeilen ? [zeile(tabelle, 0)] : []));
      return;
    }

    // `liefertZeilen` erlaubt, weniger auszuliefern als gemeldet (stille Kappung).
    const echt = cfg.liefertZeilen === undefined ? cfg.zeilen : cfg.liefertZeilen;
    const seite = [];
    for (let i = offset; i < Math.min(offset + limit, echt); i += 1) seite.push(zeile(tabelle, i));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(seite));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Fuehrt backup-export.js als echten Kindprozess aus. Gibt Exit-Code + Manifest zurueck.
// BEWUSST asynchron: der PostgREST-Ersatz laeuft in DIESEM Prozess. Ein
// synchrones execFileSync wuerde die Event-Loop blockieren, der Server koennte
// dem Kind nie antworten — der Test liefe in einen Deadlock statt in ein Ergebnis.
async function laufe(port, args = []) {
  const vorher = new Set(fs.existsSync(path.join(ROOT, "backups")) ? fs.readdirSync(path.join(ROOT, "backups")) : []);
  const code = await new Promise((resolve) => {
    const kind = spawn(process.execPath, [SKRIPT, ...args], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        SUPABASE_URL: `http://127.0.0.1:${port}`,
        SUPABASE_SERVICE_ROLE_KEY: "attrappe-kein-echtes-secret"
      }
    });
    kind.stdout.resume();
    kind.stderr.resume();
    kind.on("close", (c) => resolve(typeof c === "number" ? c : 1));
  });
  const dir = path.join(ROOT, "backups");
  const neu = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => !vorher.has(d)) : [];
  const ordner = neu.length ? path.join(dir, neu[neu.length - 1]) : null;
  const manifest = ordner && fs.existsSync(path.join(ordner, "manifest.json"))
    ? JSON.parse(fs.readFileSync(path.join(ordner, "manifest.json"), "utf8"))
    : null;
  return { code, ordner, manifest };
}

function aufraeumen(ordner) {
  if (ordner && fs.existsSync(ordner)) fs.rmSync(ordner, { recursive: true, force: true });
}

// Plan, in dem alle 8 Seed-Tabellen sauber antworten.
function sauberePlan(zeilenProTabelle = 3) {
  const p = {};
  for (const t of SEED_SCOPE_TABLES) p[t] = { zeilen: zeilenProTabelle };
  return p;
}

(async () => {
  // ---------------------------------------------------------------- 1) OK --
  console.log("== 1) Sauberer Lauf ==");
  {
    const protokoll = [];
    const srv = await starteServer(sauberePlan(3), protokoll);
    const { code, ordner, manifest } = await laufe(srv.address().port, ["--scope=seed"]);
    srv.close();

    check("1 · Exit-Code 0 bei vollstaendigem Export", code === 0, `Exit ${code}`);
    check("1 · manifest.vollstaendig === true", manifest && manifest.vollstaendig === true);
    check("1 · art === 'pre-seed'", manifest && manifest.art === "pre-seed");
    check("1 · genau die 8 Seed-Tabellen exportiert",
      manifest && Object.keys(manifest.tabellen).length === 8
      && SEED_SCOPE_TABLES.every((t) => manifest.tabellen[t] === 3));
    check("1 · Pruefsumme je Tabelle + Gesamtpruefsumme vorhanden",
      manifest && Object.keys(manifest.pruefsummen).length === 8
      && /^[0-9a-f]{64}$/.test(String(manifest.pruefsummeGesamt)));
    check("1 · restoreReihenfolge ist FK-sicher (Eltern vor Kindern)",
      manifest && JSON.stringify(manifest.restoreReihenfolge) === JSON.stringify(SEED_SCOPE_TABLES));

    // NUR-LESEND, am echten HTTP-Verkehr belegt — staerker als eine Textsuche.
    const schreibend = protokoll.filter((r) => r.method !== "GET");
    check(`1 · ausschliesslich GET-Anfragen (${protokoll.length} Anfragen, davon ${schreibend.length} schreibend)`,
      protokoll.length > 0 && schreibend.length === 0,
      schreibend.map((r) => `${r.method} ${r.url}`).join(", "));
    check("1 · kein RPC-/Funktionsaufruf", protokoll.every((r) => !/\/rpc\//.test(r.url)));
    check("1 · Ablage liegt unter ./backups/", ordner && ordner.startsWith(path.join(ROOT, "backups") + path.sep));

    // Der Service-Role-Key darf nirgends im Backup auftauchen.
    let keyGefunden = false;
    if (ordner) {
      for (const f of fs.readdirSync(ordner)) {
        if (fs.readFileSync(path.join(ordner, f), "utf8").includes("attrappe-kein-echtes-secret")) keyGefunden = true;
      }
    }
    check("1 · Zugangsdaten stehen in keiner Backup-Datei", !keyGefunden);
    aufraeumen(ordner);
  }

  // --------------------------------------------- 2) Falsche Zeilenzahl -----
  console.log("\n== 2) Negativtest: Server meldet mehr Zeilen als er liefert (stille Kappung) ==");
  {
    const plan = sauberePlan(3);
    plan.retrieval_paths = { zeilen: 10, meldetAnzahl: 10, liefertZeilen: 4 };
    const srv = await starteServer(plan, []);
    const { code, ordner, manifest } = await laufe(srv.address().port, ["--scope=seed"]);
    srv.close();

    check("2 · Exit-Code 1 — Teil-Backup gilt NICHT als Backup", code === 1, `Exit ${code}`);
    check("2 · manifest.vollstaendig === false", manifest && manifest.vollstaendig === false);
    check("2 · die gekappte Tabelle steht in der Fehlerliste",
      manifest && manifest.fehler.some((f) => f.tabelle === "retrieval_paths" && /unvollstaendig/.test(f.fehler)));
    check("2 · die gekappte Tabelle wird NICHT als exportiert gefuehrt",
      manifest && manifest.tabellen.retrieval_paths === undefined);
    aufraeumen(ordner);
  }

  // ------------------------------------------------- 3) Tabelle fehlt ------
  console.log("\n== 3) Negativtest: eine Tabelle antwortet mit HTTP 500 ==");
  {
    const plan = sauberePlan(3);
    plan.package_paths = { zeilen: 3, status: 500 };
    const srv = await starteServer(plan, []);
    const { code, ordner, manifest } = await laufe(srv.address().port, ["--scope=seed"]);
    srv.close();

    check("3 · Exit-Code 1", code === 1, `Exit ${code}`);
    check("3 · manifest.vollstaendig === false", manifest && manifest.vollstaendig === false);
    check("3 · 7 von 8 Tabellen exportiert, 1 Fehler",
      manifest && Object.keys(manifest.tabellen).length === 7 && manifest.fehler.length === 1);
    aufraeumen(ordner);
  }

  // ------------------------------- 4) Server liefert keine Zeilenzahl ------
  console.log("\n== 4) Negativtest: Server liefert keinen Content-Range ==");
  {
    const plan = sauberePlan(3);
    for (const t of SEED_SCOPE_TABLES) plan[t].ohneRange = true;
    const srv = await starteServer(plan, []);
    const { code, ordner, manifest } = await laufe(srv.address().port, ["--scope=seed"]);
    srv.close();

    // Ohne serverseitige Zeilenzahl ist die Vollstaendigkeit NICHT pruefbar. Frueher
    // lief das still als `vollstaendig: true` durch. Fail-closed ist hier die einzige
    // ehrliche Antwort: was nicht geprueft werden kann, gilt nicht als geprueft.
    check("4 · Exit-Code 1 — ohne Zeilenzahl keine Zusicherung", code === 1, `Exit ${code}`);
    check("4 · manifest.vollstaendig === false", manifest && manifest.vollstaendig === false);
    check("4 · Grund steht in der Fehlerliste",
      manifest && manifest.fehler.some((f) => /nicht bestaetigt/.test(f.fehler)));
    aufraeumen(ordner);
  }

  // ----------------------- 4b) KRITISCH: leerer Export (falscher Schluessel) --
  console.log("\n== 4b) Negativtest: alle Tabellen liefern 0 Zeilen (anon-Key / falsches Projekt) ==");
  {
    // Auf allen 8 Tabellen ist RLS aktiv, aber KEINE Policy definiert. Ein anon-Key
    // bekommt deshalb HTTP 200 mit [] statt eines Fehlers — der wahrscheinlichste
    // Bedienfehler ueberhaupt. Frueher ergab das ein gruenes Manifest ueber leeren
    // Dateien und haette das Go-/Stop-Gate des Runbooks bestanden.
    const plan = {};
    for (const t of SEED_SCOPE_TABLES) plan[t] = { zeilen: 0 };
    const srv = await starteServer(plan, []);
    const { code, ordner, manifest } = await laufe(srv.address().port, ["--scope=seed"]);
    srv.close();

    check("4b · Exit-Code 1 — leeres Backup ist keine Wiederherstellungsgrundlage", code === 1, `Exit ${code}`);
    check("4b · manifest.vollstaendig === false", manifest && manifest.vollstaendig === false);
    check("4b · Verdacht auf falschen Schluessel/Projekt wird benannt",
      manifest && manifest.fehler.some((f) => /service_role|falsches Projekt/.test(f.fehler)));
    aufraeumen(ordner);
  }

  // ------------- 4c) Einzelne Kerntabelle leer, Rest gefuellt --------------
  console.log("\n== 4c) Negativtest: nur retrieval_paths ist leer ==");
  {
    const plan = sauberePlan(3);
    plan.retrieval_paths = { zeilen: 0 };
    const srv = await starteServer(plan, []);
    const { code, ordner, manifest } = await laufe(srv.address().port, ["--scope=seed"]);
    srv.close();

    check("4c · Exit-Code 1 — ohne Abrufwege gibt es nichts zurueckzurollen", code === 1, `Exit ${code}`);
    check("4c · retrieval_paths ist als unbrauchbar markiert",
      manifest && manifest.fehler.some((f) => f.tabelle === "retrieval_paths" && /unbrauchbar/.test(f.fehler)));
    aufraeumen(ordner);
  }

  // -------------------------- 4d) Argumentpruefung ------------------------
  console.log("\n== 4d) Negativtest: falsch geschriebenes Scope-Argument ==");
  {
    const srv = await starteServer(sauberePlan(3), []);
    const port = srv.address().port;
    const a = await laufe(port, ["--scope", "seed"]);   // Leerzeichen statt =
    const b = await laufe(port, ["--scope=Seed"]);      // falsche Schreibweise
    const c = await laufe(port, ["--scope=voll"]);      // ausdruecklich erlaubt
    srv.close();

    // Frueher fiel beides still auf den VOLL-Export zurueck — inklusive
    // raw_documents, briefings, user_notes und interactions. Die Datenminimierung,
    // wegen der es den Seed-Modus gibt, war damit unbemerkt aufgehoben.
    check("4d · '--scope seed' (Leerzeichen) wird mit Exit 2 abgewiesen", a.code === 2, `Exit ${a.code}`);
    check("4d · kein Backup-Ordner bei abgewiesenem Argument", a.ordner === null);
    check("4d · '--scope=Seed' wird mit Exit 2 abgewiesen", b.code === 2, `Exit ${b.code}`);
    check("4d · '--scope=voll' ist erlaubt", c.code === 0 && c.manifest && c.manifest.art === "voll", `Exit ${c.code}`);
    aufraeumen(a.ordner); aufraeumen(b.ordner); aufraeumen(c.ordner);
  }

  // --------------------------------------------------- 5) Paginierung -----
  console.log("\n== 5) Paginierung ueber mehrere Seiten ==");
  {
    const plan = sauberePlan(3);
    plan.retrieval_paths = { zeilen: 2500 }; // > 2 volle Seiten a 1000
    const protokoll = [];
    const srv = await starteServer(plan, protokoll);
    const { code, ordner, manifest } = await laufe(srv.address().port, ["--scope=seed"]);
    srv.close();

    check("5 · alle 2500 Zeilen exportiert", manifest && manifest.tabellen.retrieval_paths === 2500);
    check("5 · Exit-Code 0", code === 0, `Exit ${code}`);
    const seiten = protokoll.filter((r) => /retrieval_paths/.test(r.url) && /offset=/.test(r.url));
    check(`5 · drei Seitenabrufe (${seiten.length})`, seiten.length === 3);
    aufraeumen(ordner);
  }

  // ------------------------------------------------- 6) Voll-Export -------
  console.log("\n== 6) Voll-Export deckt alle Tabellen ab ==");
  {
    const plan = {};
    for (const t of Object.keys(TABLES)) plan[t] = { zeilen: 1 };
    const srv = await starteServer(plan, []);
    const { code, ordner, manifest } = await laufe(srv.address().port, []);
    srv.close();

    check("6 · art === 'voll'", manifest && manifest.art === "voll");
    check("6 · alle Tabellen aus TABLES exportiert",
      manifest && Object.keys(manifest.tabellen).length === Object.keys(TABLES).length);
    check("6 · Exit-Code 0", code === 0, `Exit ${code}`);
    check("6 · kein restoreReihenfolge-Feld im Voll-Modus", manifest && manifest.restoreReihenfolge === undefined);
    aufraeumen(ordner);
  }

  // --------------------------------- 6b) Profil-Umfang (Punkt 14B) --------
  // Der Profil-Umfang sichert genau die zwei Tabellen, die das Anlegen des Berliner
  // Abnahmeprofils beruehrt. Bis 14B gab es dafuer KEINEN passenden Umfang: `seed` deckt
  // sie nicht ab, `voll` zieht zusaetzlich Rohdokumente und Briefings auf die Platte.
  console.log("\n== 6b) Profil-Export (--scope=profil) ==");
  {
    const plan = {};
    for (const t of Object.keys(TABLES)) plan[t] = { zeilen: 3 };
    const srv = await starteServer(plan, []);
    const { code, ordner, manifest } = await laufe(srv.address().port, ["--scope=profil"]);
    srv.close();

    check("6b · art === 'pre-profil'", manifest && manifest.art === "pre-profil");
    check("6b · genau die 2 Profiltabellen exportiert",
      manifest && Object.keys(manifest.tabellen).length === 2
      && manifest.tabellen.profiles === 3 && manifest.tabellen.mandate_profiles === 3);
    check("6b · KEINE Rohdokumente/Briefings/Interaktionen im Export (Datenminimierung)",
      manifest && !("raw_documents" in manifest.tabellen) && !("briefings" in manifest.tabellen)
      && !("interactions" in manifest.tabellen) && !("user_notes" in manifest.tabellen));
    check("6b · restoreReihenfolge nennt Eltern vor Kind (FK profiles <- mandate_profiles)",
      manifest && Array.isArray(manifest.restoreReihenfolge)
      && manifest.restoreReihenfolge[0] === "profiles" && manifest.restoreReihenfolge[1] === "mandate_profiles");
    check("6b · vollstaendig === true und Exit-Code 0", manifest && manifest.vollstaendig === true && code === 0, `Exit ${code}`);
    check("6b · Pruefsumme je Tabelle + Gesamtpruefsumme vorhanden",
      manifest && manifest.pruefsummen && manifest.pruefsummen.profiles && manifest.pruefsummen.mandate_profiles
      && typeof manifest.pruefsummeGesamt === "string" && manifest.pruefsummeGesamt.length === 64);
    aufraeumen(ordner);
  }
  {
    // Ein leerer Mandatsbestand kann den Zustand VOR dem Anlegen nicht belegen.
    const plan = {};
    for (const t of Object.keys(TABLES)) plan[t] = { zeilen: 0 };
    const srv = await starteServer(plan, []);
    const { code, ordner, manifest } = await laufe(srv.address().port, ["--scope=profil"]);
    srv.close();
    check("6b · leerer Profil-Export gilt NICHT als Sicherung (vollstaendig=false, Exit 1)",
      manifest && manifest.vollstaendig === false && code === 1, `Exit ${code}`);
    aufraeumen(ordner);
  }

  // --------------------------------- 7) Jede Seed-Tabelle hat einen PK ----
  console.log("\n== 7) Struktur ==");
  check("7 · jede Tabelle aus SEED_SCOPE_TABLES hat einen Primaerschluessel in TABLES",
    SEED_SCOPE_TABLES.every((t) => typeof TABLES[t] === "string" && TABLES[t].length > 0),
    SEED_SCOPE_TABLES.filter((t) => !TABLES[t]).join(", "));
  check("7 · SEED_SCOPE_TABLES enthaelt genau 8 Tabellen ohne Dubletten",
    SEED_SCOPE_TABLES.length === 8 && new Set(SEED_SCOPE_TABLES).size === 8);
  check("7 · jede Tabelle aus PROFIL_SCOPE_TABLES hat einen Primaerschluessel in TABLES",
    PROFIL_SCOPE_TABLES.every((t) => typeof TABLES[t] === "string" && TABLES[t].length > 0),
    PROFIL_SCOPE_TABLES.filter((t) => !TABLES[t]).join(", "));
  check("7 · PROFIL_SCOPE_TABLES und SEED_SCOPE_TABLES ueberschneiden sich nicht",
    PROFIL_SCOPE_TABLES.every((t) => !SEED_SCOPE_TABLES.includes(t)));
  check("7 · Alle Umfaenge sind benannt und der Standard ist 'voll'",
    Object.keys(SCOPES).sort().join(",") === "profil,seed,voll" && SCOPES.voll === null);

  console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
  process.exit(fail === 0 ? 0 : 1);
})();
