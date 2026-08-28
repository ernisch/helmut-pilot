"use strict";

// Helmut — REALISTIKNACHWEIS Z3 FUER 25 / 50 / 100 MANDATE (Skalierungssprint 2026-08-26).
// =============================================================================================
// ABGRENZUNG ZU Z2 — der Unterschied ist der ganze Zweck dieser Datei.
//
//                          | Z2 (`skalierung-stufen-lasttest.js`) | Z3 (dieser Lauf)
//   Fachhandler            | ATTRAPPE (`setTimeout`, Erfolg)      | ECHT (`HANDLER` aus scalable-pipeline)
//   Weg zur Datenbank      | `psql` (Fremdprozess)                | HTTP -> PostgREST -> PostgreSQL
//   Netz                   | keins                                | echtes HTTP je Quelle
//   Parsen                 | keins                                | echter RSS-Parser
//   Verstehen              | keins                                | echter Modellaufruf ueber echtes TLS
//   Projektion/Briefing    | keins                                | echte Produktionsfunktionen
//   Slotform               | 4 Dauer-Worker                       | Cron-Slots wie in Production
//   Kosten/Token           | 0, unmessbar                         | gemessen (Aufrufe, Zeichen, Token)
//
// >>> WAS AUCH DIESER LAUF NICHT BEWEIST — VERBINDLICH <<<
//   Die ANBIETER sind lokal. Es antwortet weder Google noch Azure. Bewiesen sind Fachpfad,
//   Datenbankweg, Mengen, Laufzeiten, Wiederholungen, Zeitueberschreitungen und
//   Drosselungsverhalten — NICHT Erreichbarkeit, Antwortzeit, Drosselgrenze oder Rechnung
//   eines echten Anbieters, und NICHT der Google-Sonderweg (`isGoogleNewsUrl` greift bei
//   einer lokalen Adresse nicht). Dieser Lauf ist deshalb **Z3a — Teilnachweis**; der offene
//   Rest heisst **Z3b** und braucht eine Kosten- und Anbieterfreigabe.
//   Vollstaendige Einordnung: `docs/betrieb/z3-realistiknachweis-2026-08-26.md`.
//
// SICHERHEIT (Stopkriterien, jedes fail closed):
//   * Production-Kennungen in der Umgebung  -> Abbruch
//   * Datenbankhost nicht lokal             -> Abbruch
//   * kein lokaler PostgreSQL/PostgREST     -> EHRLICHER UEBERSPRUNG ("Nachweis offen"), nie gruen
//   * Aufruf nicht ueber `scripts/lokal.js` -> der Netzschutz-Riegel greift ohnehin
//
// AUFRUF (immer ueber scripts/lokal.js, CLAUDE.md §6):
//   HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5434 HELMUT_TEST_PG_USER=helmut \
//   HELMUT_Z3_POSTGREST=/pfad/zu/postgrest \
//     node scripts/lokal.js scripts/skalierung-z3-realistiklauf.js

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync, spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "scripts/fixtures/z3-plattform.js"));

// ── Umgebung ────────────────────────────────────────────────────────────────────────────────
const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5434",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_Z3_PG_DB || "helmut_z3_last"
};
const POSTGREST = process.env.HELMUT_Z3_POSTGREST || "";
// Der Signierschluessel des lokalen PostgREST entsteht JE LAUF neu und steht deshalb nirgends
// im Repository (CLAUDE.md §4.7). Er gilt nur fuer diesen einen Prozess und nur fuer
// 127.0.0.1; er berechtigt zu nichts ausserhalb der lokalen Testdatenbank.
const JWT_SECRET = process.env.HELMUT_Z3_JWT_SECRET
  || require("crypto").randomBytes(32).toString("hex");

// Die Stufen. Die Eichstufe 5 ist bewusst enthalten: sie ist die EINZIGE Stufe, fuer die es
// eine Production-Messgroesse gibt (Kostenmessung: rund 113 Verstehensaufrufe/Tag bei fuenf
// Mandaten, gedeckelt). Ohne sie waeren die Zahlen fuer 25/50/100 an nichts geeicht.
const STUFEN = (process.env.HELMUT_Z3_STUFEN || "5,25,50,100")
  .split(",").map((n) => Number(n.trim())).filter(Boolean);

// Betriebsgroessen — dieselben, die Production faehrt (CURRENT_STATE §4: Worker 4/25/25).
const SLOT_BUDGET_MS = Number(process.env.HELMUT_Z3_SLOT_BUDGET_MS || 290000);   // maxDuration 300 s
const SLOTS_JE_TAG = Number(process.env.HELMUT_Z3_SLOTS || 3);                    // §2a: drei regulaere Abfluesse
const MAX_SLOTS = Number(process.env.HELMUT_Z3_MAX_SLOTS || 12);                  // Abbruchgrenze des Laufs
// EINE STUFE = EIN PROZESS. Bewusst ohne Fortsetzung ueber mehrere Aufrufe.
// Ein frueherer Entwurf konnte eine Stufe in Teilstuecken fahren und nur das letzte
// bewerten. Das war falsch, und zwar auf die gefaehrliche Art: die Warteschlange steht in
// der Datenbank und ueberlebt ein Teilstueck, ABER die Messstellen tun das nicht. Tor,
// Anbieterursprung und KI-Endpunkt sind Dienste IM Laufprozess und starten mit jedem
// Teilstueck bei null; ebenso die Verbindungsabtastung. Der Bericht des letzten
// Teilstuecks haette damit Abrufe, Modellaufrufe, Drosselungen, Konfliktrate,
// Antwortzeiten und Verbindungsspitze fuer die GANZE Stufe behauptet und nur den
// Schlussteil gemessen — genau das falsche Gruen, das dieser Nachweis ausschliessen soll.
// Der Lauf wird deshalb abgesetzt gestartet (`setsid`) statt zerlegt; die Belegdatei §12
// beschreibt den Weg.
// KONTROLLLAUF. Derselbe Lauf, nur ohne Fehlermandat (`HELMUT_Z3_FEHLERMANDAT=aus`). Sein
// Bericht wird hier eingelesen; Z22 entscheidet dann an der GEMESSENEN Differenz statt an
// einer Vermutung. Fehlt er, entscheidet Z22 gar nicht (offener Befund) — er raet nie.
const VERGLEICHSDATEI = process.env.HELMUT_Z3_VERGLEICH || "";
const PARALLEL = Number(process.env.HELMUT_Z3_PARALLEL || 4);
const STAPEL = Number(process.env.HELMUT_Z3_STAPEL || 25);
const KI_DECKEL = String(process.env.HELMUT_Z3_KI_DECKEL || "offen");             // "offen" | Zahl
const KI_HOECHSTZAHL = Number(process.env.HELMUT_Z3_KI_HOECHSTZAHL || 40000);     // harter Kostenriegel

// MITSCHRIFT. Ein Lauf dieser Groesse dauert laenger als jede Sitzungs-Wartezeit; ohne eigene
// Mitschrift geht seine Ausgabe verloren, sobald der startende Prozess endet. Der Lauf
// schreibt deshalb ZUSAETZLICH in eine Datei, die er selbst oeffnet.
const MITSCHRIFT = process.env.HELMUT_Z3_LOG || "";
if (MITSCHRIFT) {
  // BEWUSST `appendFileSync` und KEIN Schreibstrom. Belegter Fehler (26.08.): mit einem
  // Schreibstrom ging der gesamte Schlussteil verloren — `process.exit()` beendet den Prozess,
  // ohne die noch gepufferten Schreibvorgaenge abzuschliessen. Ausgerechnet die Bewertung, das
  // Wichtigste am Lauf, fehlte damit in der Mitschrift.
  for (const kanal of ["log", "error"]) {
    const original = console[kanal].bind(console);
    console[kanal] = (...args) => {
      try {
        fs.appendFileSync(MITSCHRIFT,
          `${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`);
      } catch (_) { /* die Mitschrift darf den Lauf nie stoeren */ }
      original(...args);
    };
  }
}

let pass = 0, fail = 0, befundOffen = 0;
const kriterien = [];
// ZWEI GATTUNGEN, bewusst getrennt — und KEINE davon wird geschoent.
//   check()  = Korrektheit und Sicherheit. Ein FAIL ist ein Fehler des Laufs oder des Motors
//              und haelt die Stufenkette an.
//   befund() = KAPAZITAETSAUSSAGE ueber Production. Ein nicht erfuelltes Kriterium ist hier
//              kein Fehler des Laufs, sondern SEIN ERGEBNIS ("die Tagesmenge passt nicht in
//              drei Slots"). Es haelt die Kette nicht an, weil sonst genau die Messung
//              ausfiele, die dieser Sprint erbringen soll — es geht aber vollstaendig in
//              Bericht und Endurteil ein, und eine Stufe mit offenem Befund gilt NIE als
//              vollstaendig bestanden.
function check(id, name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${id} ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${id} ${name}${detail ? ` — ${detail}` : ""}`); }
  kriterien.push({ id, name, ok, detail, art: "korrektheit" });
  return ok;
}
function befund(id, name, ok, detail = "") {
  if (ok) { console.log(`  BEFUND erfuellt      ${id} ${name}${detail ? ` — ${detail}` : ""}`); }
  else { befundOffen += 1; console.log(`  BEFUND NICHT ERFUELLT ${id} ${name}${detail ? ` — ${detail}` : ""}`); }
  kriterien.push({ id, name, ok, detail, art: "kapazitaet" });
  return ok;
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function zahl(n) { return Number(n).toLocaleString("de-DE"); }

function psql(sql, { db = PG.db, datei = null } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }).trim();
}

function pruefeSicherheit() {
  const verboten = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
    "VERCEL_TOKEN", "AZURE_OPENAI_KEY", "OPENAI_API_KEY"];
  const gefunden = verboten.filter((n) => String(process.env[n] || "").trim() !== "");
  if (gefunden.length) {
    console.error(`\nABBRUCH (Stopkriterium): Produktionskennungen sichtbar: ${gefunden.join(", ")}.`);
    console.error("Dieser Lauf MUSS ueber scripts/lokal.js gestartet werden (CLAUDE.md §6).");
    process.exit(3);
  }
  const lokal = ["127.0.0.1", "localhost", "::1"];
  if (PG.host && !lokal.includes(PG.host) && !PG.host.startsWith("/")) {
    console.error(`\nABBRUCH (Stopkriterium): Datenbankhost ${PG.host} ist nicht lokal.`);
    process.exit(3);
  }
}

function servererreichbar() {
  if (!PG.host || !PG.user) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

// ── Lokales Abbild des Production-Schemas ───────────────────────────────────────────────────
// Es entsteht aus `supabase/schema.sql` PLUS allen Vorwaertsmigrationen — also aus derselben
// Wahrheit, die Production traegt. ZWEI ausdrueckliche Abweichungen, beide unvermeidbar und
// beide ohne Bezug zum Warteschlangenpfad:
//   1. `pgvector` ist in dieser Umgebung nicht installierbar (die eingebettete PostgreSQL
//      bringt kein `pg_config` mit). `vector(256)` wird lokal zu `jsonb`, der ivfflat-Index
//      und die RPC `match_knowledge_objects` entfallen. Der Warteschlangenpfad benutzt sie
//      nicht: `matching.js` rechnet die Merkmalsvektoren in JavaScript.
//   2. Supabase bringt die Rollen `anon`/`authenticated`/`service_role` und ein `auth`-Schema
//      mit; beides wird hier nachgebildet, damit die Migrationen unveraendert laufen.
// Die Reihenfolge der Migrationen ist die Dateinamenfolge mit EINER Ausnahme: die
// Warteschlangentabelle (`20260808_scalable_job_queue`) muss vor den drei anderen
// `20260808`-Dateien liegen, die auf ihr aufbauen.
const VORRANG = ["20260808_scalable_job_queue.sql"];

function baueLokalesSchema(arbeitsverzeichnis) {
  const quelle = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8");
  let s = quelle
    .replace("create extension if not exists vector;", "-- LOKALE ANPASSUNG: pgvector nicht verfuegbar")
    .replace(/create index if not exists knowledge_objects_embedding_idx\s*\n\s*on public\.knowledge_objects using ivfflat[^;]*;/,
      "-- LOKALE ANPASSUNG: ivfflat-Index entfaellt")
    .replace(/create or replace function public\.match_knowledge_objects\([\s\S]*?\n\$\$;/,
      "-- LOKALE ANPASSUNG: match_knowledge_objects entfaellt (pgvector-Operator <=>)")
    .replace(/vector\(256\)/g, "jsonb");
  const datei = path.join(arbeitsverzeichnis, "schema-lokal.sql");
  fs.writeFileSync(datei, s, "utf8");

  const migrationsVerzeichnis = path.join(arbeitsverzeichnis, "migrationen");
  fs.mkdirSync(migrationsVerzeichnis, { recursive: true });
  const alle = fs.readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql") && !/rollback/i.test(f))
    .sort((a, b) => {
      const va = VORRANG.includes(a) ? 0 : 1;
      const vb = VORRANG.includes(b) ? 0 : 1;
      if (va !== vb) return va - vb;
      return a.localeCompare(b);
    });
  const geordnet = [];
  for (const f of alle) {
    const roh = fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8")
      .replace(/match_knowledge_objects\(vector,/g, "match_knowledge_objects(jsonb,")
      .replace(/embedding vector,/g, "embedding jsonb,")
      .replace(/vector\(256\)/g, "jsonb");
    const ziel = path.join(migrationsVerzeichnis, f);
    fs.writeFileSync(ziel, roh, "utf8");
    geordnet.push(ziel);
  }
  return { schemaDatei: datei, migrationen: geordnet };
}

const VORBEREITUNG_SQL = `
create schema if not exists auth;
create or replace function auth.uid() returns text language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '') $fn$;
create or replace function auth.role() returns text language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.role', true), '') $fn$;
create or replace function auth.jwt() returns jsonb language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $fn$;
do $do$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
end $do$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public, auth to anon, authenticated, service_role;
create or replace function public.match_knowledge_objects(
  query_embedding jsonb, match_count integer default 20,
  filter_parties text[] default null, filter_committees text[] default null, filter_regions text[] default null)
returns table (id text, vorgang_id text, similarity double precision)
language sql stable as $fn$ select null::text, null::text, null::double precision where false $fn$;
`;

const NACHBEREITUNG_SQL = `
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema auth to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;
`;

function legeDatenbankAn(arbeitsverzeichnis) {
  // Ein abgebrochener Vorlauf laesst PostgREST-Sitzungen zurueck; PostgreSQL verweigert dann
  // das Loeschen ("is being accessed by other users") und der Lauf stirbt beim Aufbau.
  // Es werden AUSSCHLIESSLICH Sitzungen DIESER Testdatenbank beendet — nie andere. Die Zahl
  // wird ausgegeben: ein Lauf, der Fremdsitzungen vorfindet, soll das sichtbar machen und
  // nicht still aufraeumen.
  const beendet = Number(psql(
    "select count(*) from (select pg_terminate_backend(pid) from pg_stat_activity"
    + ` where datname = '${PG.db}' and pid <> pg_backend_pid()) t`, { db: "postgres" }) || 0);
  if (beendet > 0) console.log(`  Aufraeumen: ${beendet} Sitzung(en) eines abgebrochenen Vorlaufs beendet.`);
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  const vor = path.join(arbeitsverzeichnis, "vorbereitung.sql");
  fs.writeFileSync(vor, VORBEREITUNG_SQL, "utf8");
  psql(null, { datei: vor });
  const { schemaDatei, migrationen } = baueLokalesSchema(arbeitsverzeichnis);
  psql(null, { datei: schemaDatei });
  let angewendet = 0;
  const gescheitert = [];
  for (const m of migrationen) {
    try { psql(null, { datei: m }); angewendet += 1; }
    catch (e) { gescheitert.push({ datei: path.basename(m), fehler: String((e && e.message) || "").slice(-300) }); }
  }
  const nach = path.join(arbeitsverzeichnis, "nachbereitung.sql");
  fs.writeFileSync(nach, NACHBEREITUNG_SQL, "utf8");
  psql(null, { datei: nach });
  return { angewendet, gescheitert, gesamt: migrationen.length };
}

const LEERBARE_TABELLEN = [
  "helmut_jobs", "raw_documents", "knowledge_objects", "ko_document_links", "llm_usage",
  "helmut_store", "gate_shadow_events", "process_runs", "llm_budget_counters",
  "source_crawl_telemetry", "crawl_runs", "pipeline_locks", "decisions", "matching_results",
  "briefings", "interactions", "topic_memory", "profile_embeddings"
];
function leereDatenbank() {
  const vorhanden = LEERBARE_TABELLEN.filter((t) => psql(`select to_regclass('public.${t}') is not null`) === "t");
  psql(`truncate table ${vorhanden.map((t) => `public.${t}`).join(", ")} cascade`);
  return vorhanden.length;
}

// ── PostgREST ───────────────────────────────────────────────────────────────────────────────
function startePostgrest(arbeitsverzeichnis) {
  const conf = path.join(arbeitsverzeichnis, "postgrest.conf");
  const port = 3100 + (process.pid % 800);
  fs.writeFileSync(conf,
    `db-uri = "postgres://authenticator@${PG.host}:${PG.port}/${PG.db}"\n`
    + "db-schemas = \"public\"\ndb-anon-role = \"anon\"\ndb-pool = 30\n"
    + `jwt-secret = "${JWT_SECRET}"\nserver-host = "127.0.0.1"\nserver-port = ${port}\n`
    + "log-level = \"error\"\n", "utf8");
  const log = fs.openSync(path.join(arbeitsverzeichnis, "postgrest.log"), "a");
  const kind = spawn(POSTGREST, [conf], { stdio: ["ignore", log, log], detached: false });
  return { port, kind, stoppe: () => { try { kind.kill("SIGTERM"); } catch (_) { /* egal */ } } };
}

function baueDienstToken() {
  const crypto = require("crypto");
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const kopf = b({ alg: "HS256", typ: "JWT" });
  const rumpf = b({ role: "service_role", iss: "helmut-z3-lokal", exp: Math.floor(Date.now() / 1000) + 86400 });
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${kopf}.${rumpf}`).digest("base64url");
  return `${kopf}.${rumpf}.${sig}`;
}

// BEREITSCHAFTSPROBE DIREKT GEGEN POSTGREST — bewusst NICHT durch das Datenbanktor.
// Der Aufbau braucht mehrere Versuche, bis PostgREST antwortet; liefen diese Versuche durch
// das Tor, zaehlte sein Fehlerzaehler Aufbau-503er als LAUFZEITFEHLER der Stufe (im Eichlauf
// gemessen: `rpc:helmut_job_metrics=503`, ein Aufbau-Artefakt, das Kriterium Z15 rot machte).
async function warteAufPostgrest(port, torUrl, token) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const antwort = await fetch(`http://127.0.0.1:${port}/rpc/helmut_job_metrics`, {
        method: "POST", headers: { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_seit_minuten: 5 })
      });
      if (antwort.ok) return true;
    } catch (_) { /* noch nicht da */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// Liest den Bericht des Kontrolllaufs (ohne Fehlermandat) fuer DIESELBE Stufe.
// Fehlt die Datei, ist die Stufe darin nicht enthalten oder trug der Kontrolllauf doch ein
// Fehlermandat, gilt der Vergleich als NICHT vorhanden — lieber keine Aussage als eine
// falsche.
function letztesTagesendeVon(st) {
  const enden = (st.rueckstauJeSlot || []).filter((r) => r.slot % SLOTS_JE_TAG === 0);
  if (!enden.length) return null;
  const e = enden[enden.length - 1];
  return e.veraltetOffenGesund == null ? null : Number(e.veraltetOffenGesund);
}

function leseVergleich(mandate) {
  if (!VERGLEICHSDATEI || !fs.existsSync(VERGLEICHSDATEI)) return { gefunden: false };
  try {
    const v = JSON.parse(fs.readFileSync(VERGLEICHSDATEI, "utf8"));
    const st = (v.stufen || []).find((x) => Number(x.mandate) === Number(mandate));
    if (!st) return { gefunden: false, grund: `Stufe ${mandate} fehlt im Vergleichsbericht` };
    if (st.fehlerMandat) return { gefunden: false, grund: "Vergleichsbericht trug ein Fehlermandat" };
    return {
      gefunden: true, datei: VERGLEICHSDATEI,
      zurueckstellungen: Number((st.kopplung && st.kopplung.zurueckstellungen) || 0),
      veraltetOffenGesund: letztesTagesendeVon(st),
      slots: Number(st.slots || 0), wartend: Number(st.wartend || 0)
    };
  } catch (e) {
    return { gefunden: false, grund: String(e && e.message).slice(0, 80) };
  }
}

// ── Kopplungsmessung ────────────────────────────────────────────────────────────────────────
// VERWORFENE ERSTE FASSUNG (26.08., in diesem Sprint korrigiert): sie zaehlte nur Slots, in
// denen ueberhaupt NICHTS erledigt wurde, und meldete das Kriterium sonst als „keine Kopplung
// beobachtet" — also als GRUEN. Das war falsches Gruen: ein Slot, der die geteilten Abrufe
// abarbeitet, aber jede Projektion gesunder Mandate zurueckstellt, hat `erledigt > 0` und
// fiel damit durch das Raster. Die Fassung haette also selbst dann Entwarnung gegeben, wenn
// jede nachgelagerte Arbeit gesunder Mandate blockiert gewesen waere.
//
// Diese Fassung zaehlt zwei Dinge getrennt und behauptet keines von beiden als Entwarnung:
//   1. `zurueckstellungen` — alle Zurueckstellungen mit Grund `vorbedingung-offen`. Eine
//      Zurueckstellung ist fuer sich GENOMMEN NORMAL (die Reihenfolgezusage): sie sagt nur,
//      dass im Fenster noch Abrufe laufen. Sie ist ein Mengengeruest, kein Schuldbeweis.
//   2. `alleinSlots` — Slots, an deren Ende die EINZIGE noch offene vorgelagerte Arbeit dem
//      Fehlermandat gehoert, waehrend nachgelagerte Arbeit GESUNDER Mandate offen ist und im
//      Slot mit `vorbedingung-offen` zurueckgestellt wurde. Nur DAS ist ein Nachweis der
//      Kopplung: es gibt dann keinen anderen Grund mehr, auf den die gesunden Auftraege
//      warten koennten.
// Die Zuordnung selbst (welcher gesunde Auftrag auf welches Fenster wartet) wird hier
// bewusst NICHT nachgerechnet — sie steckt in `scalable-pipeline.enthalteneFenster`, und
// eine zweite, in SQL nachgebaute Fensterlogik waere ein eigener Fehlerherd. Den
// unabhaengigen Gegenbeweis liefert stattdessen der KONTROLLLAUF ohne Fehlermandat
// (`HELMUT_Z3_FEHLERMANDAT=aus`, Vergleich ueber `HELMUT_Z3_VERGLEICH`).
function messwerteKopplung(slotBilanzen, rueckstauJeSlot) {
  let alleinSlots = 0, zurueckstellungen = 0;
  for (const b of slotBilanzen) {
    const d = (b && b.durchlauf) || {};
    const gruende = (d.bilanzen || []).reduce((m, x) => {
      for (const [g, n] of Object.entries((x && x.zurueckstellGruende) || {})) m[g] = (m[g] || 0) + n;
      return m;
    }, {});
    const wegenVorbedingung = Number(gruende["vorbedingung-offen"] || 0);
    zurueckstellungen += wegenVorbedingung;
    const stand = (rueckstauJeSlot || []).find((r) => r.slot === b.slot);
    if (wegenVorbedingung > 0 && stand
      && stand.vorgelagertOffenAndere === 0 && stand.vorgelagertOffenFehler > 0
      && stand.nachgelagertOffenGesund > 0) alleinSlots += 1;
  }
  return { alleinSlots, zurueckstellungen };
}

// ── Die Cron-Zeit eines Slots ───────────────────────────────────────────────────────────────
// Production faehrt die drei allgemeinen Abfluesse um 04:00, 16:00 und 20:00 UTC
// (`skalierung-25-50-100.md` §2a). Slot 1..3 sind diese drei Zeiten EINES Tages, jeder
// weitere Slot ist der naechste Abfluss des FOLGENDEN Tages. Das ist wichtig, weil die
// Aktualitaetsfenster der Bedarfsverdichtung an der Uhrzeit haengen: 04:00 und 16:00 liegen
// in VERSCHIEDENEN 8-Stunden-Fenstern, 16:00 und 20:00 im selben. Ohne diese Vorgabe haenge
// die geplante Menge davon ab, ob der Lauf zufaellig eine Fenstergrenze kreuzt.
const CRON_STUNDEN = [4, 16, 20];
const BASISTAG_MS = Date.parse(process.env.HELMUT_Z3_BASISTAG || "2026-08-26T00:00:00Z");
function cronZeitFuerSlot(nr) {
  const i = (nr - 1) % CRON_STUNDEN.length;
  const tag = Math.floor((nr - 1) / CRON_STUNDEN.length);
  return BASISTAG_MS + tag * 86400000 + CRON_STUNDEN[i] * 3600000;
}

// ── Ein Slotlauf als eigener Prozess ────────────────────────────────────────────────────────
function starteSlot(nr, opt) {
  const args = [path.join(ROOT, "scripts/fixtures/z3-slotlauf.js"),
    `--datenbank=${opt.datenbank}`, `--dienstschluessel=${opt.token}`, `--ki=${opt.ki}`,
    `--ursprung=${opt.ursprung}`, `--mandate=${opt.mandate}`, `--budgetMs=${SLOT_BUDGET_MS}`,
    `--slot=${nr}`, `--jetztMs=${cronZeitFuerSlot(nr)}`,
    `--fehlerMandat=${opt.fehlerMandat}`, `--parallel=${PARALLEL}`,
    `--stapel=${STAPEL}`, `--kiDeckel=${opt.kiDeckel}`, `--kiReserve=${opt.kiReserve}`];
  const kind = spawn(process.execPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_EXTRA_CA_CERTS: opt.caBuendel }
  });
  let out = "", err = "";
  kind.stdout.on("data", (d) => { out += d; });
  kind.stderr.on("data", (d) => { err += d; });
  return new Promise((resolve) => {
    kind.on("close", (code) => {
      let bilanz = null;
      try { bilanz = JSON.parse(String(out).trim().split("\n").pop() || "null"); } catch (_) { bilanz = null; }
      resolve({ code, bilanz, fehlerAusgabe: err.slice(-4000) });
    });
  });
}

// ── Eine Stufe ──────────────────────────────────────────────────────────────────────────────
async function fuehreStufeAus(mandate, umgebung) {
  abschnitt(`STUFE ${mandate} MANDATE — realistischer Lauf (Z3a)`);
  const P_ = `${mandate}`;
  leereDatenbank();

  const ursprung = await P.starteAnbieterUrsprung({
    latenzMs: Number(process.env.HELMUT_Z3_URSPRUNG_LATENZ_MS || 60),
    latenzStreuungMs: Number(process.env.HELMUT_Z3_URSPRUNG_STREUUNG_MS || 140),
    drosselAnteil: Number(process.env.HELMUT_Z3_DROSSEL || 0.03),
    ausfallAnteil: Number(process.env.HELMUT_Z3_AUSFALL || 0.02),
    eintraegeJeAntwort: Number(process.env.HELMUT_Z3_EINTRAEGE || 12),
    geteilteThemen: Number(process.env.HELMUT_Z3_THEMEN || 120),
    ueberschneidungAnteil: Number(process.env.HELMUT_Z3_UEBERSCHNEIDUNG || 0.9),
    dokumenteJeVorgang: Number(process.env.HELMUT_Z3_VARIANTEN || 4),
    frischeAnteil: Number(process.env.HELMUT_Z3_FRISCHE || 0.25)
  });
  const ki = await P.starteKiEndpunkt({
    latenzMs: Number(process.env.HELMUT_Z3_KI_LATENZ_MS || 900),
    latenzStreuungMs: Number(process.env.HELMUT_Z3_KI_STREUUNG_MS || 900),
    fehlerAnteil: Number(process.env.HELMUT_Z3_KI_FEHLER || 0.01),
    hoechstzahlAufrufe: KI_HOECHSTZAHL
  });
  // CA-Buendel: bestehendes Sitzungsbuendel PLUS die ephemere lokale Stelle.
  const bestand = process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(process.env.NODE_EXTRA_CA_CERTS)
    ? fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8") : "";
  const caBuendel = path.join(umgebung.arbeitsverzeichnis, `ca-${mandate}.pem`);
  fs.writeFileSync(caBuendel, `${bestand}\n${fs.readFileSync(ki.caPfad, "utf8")}`, "utf8");

  // Das Fehlermandat ist deterministisch das erste Profil (wie im synthetischen Lauf).
  const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
  // Das Fehlermandat kann ABGESCHALTET werden. Nur so laesst sich die KAPAZITAET (wie viele
  // Slots braucht die reine Tagesmenge?) von der KOPPLUNG (wie viele Slots kostet ein einziges
  // krankes Mandat?) trennen — zwei Aussagen, die sonst in einer Zahl verschwimmen.
  const ohneFehlermandat = String(process.env.HELMUT_Z3_FEHLERMANDAT || "").trim().toLowerCase() === "aus";
  const fehlerMandat = ohneFehlermandat ? "" : erzeugeMandate(mandate)[0].id;
  console.log(`  Fehlermandat (erwartete Fehler): ${fehlerMandat || "ABGESCHALTET (reine Kapazitaetsmessung)"}`);
  console.log(`  Anbieterursprung ${ursprung.url} · KI-Endpunkt ${ki.url} · Datenbanktor ${umgebung.torUrl}`);
  console.log(`  KI-Deckel: ${KI_DECKEL === "offen" ? "offen (Bedarfsmessung)" : KI_DECKEL}`);

  const slots = [];
  const zeitfortschritte = [];
  const t0 = Date.now();
  let restOffen = null;
  // Nur zur Ansicht im Bericht: der erste Slot, an dessen Ende gar nichts Gesundes mehr
  // offen war. KEIN Kriterium — siehe Z20/Z21: ein leerer Endzustand ist nicht das Ziel.
  let slotBisGesund = null;
  const rueckstauJeSlot = [];
  // VERBINDUNGEN WAEHREND DES LAUFS ABTASTEN. Ein Wert nach Laufende waere wertlos — die
  // Slotprozesse und der PostgREST-Pool haben ihre Verbindungen dann schon geschlossen.
  // Gemessen wird gegen dieselbe Datenbank, aus einer eigenen kurzlebigen Sitzung.
  let verbindungenSpitze = 0;
  let verbindungenAktivSpitze = 0;
  const abtaster = setInterval(() => {
    try {
      const zeile = psql("select count(*)||' '||count(*) filter (where state='active')"
        + " from pg_stat_activity where datname = current_database()");
      const [gesamt, aktiv] = String(zeile).trim().split(/\s+/).map(Number);
      if (gesamt > verbindungenSpitze) verbindungenSpitze = gesamt;
      if (aktiv > verbindungenAktivSpitze) verbindungenAktivSpitze = aktiv;
    } catch (_) { /* das Abtasten darf den Lauf nie stoeren */ }
  }, 1000);
  for (let nr = 1; nr <= MAX_SLOTS; nr += 1) {
    ursprung.setzeSlot(nr);
    const ergebnis = await starteSlot(nr, {
      datenbank: umgebung.torUrl, token: umgebung.token, ki: ki.url, ursprung: ursprung.url,
      mandate, fehlerMandat, caBuendel,
      kiDeckel: KI_DECKEL === "offen" ? "1000000" : KI_DECKEL,
      kiReserve: process.env.HELMUT_Z3_KI_RESERVE || "0"
    });
    slots.push(ergebnis);
    if (!ergebnis.bilanz || ergebnis.bilanz.fehler) {
      console.log(`  Slot ${nr}: ABBRUCH — ${ergebnis.bilanz && ergebnis.bilanz.fehler}`);
      console.log(`  stderr: ${ergebnis.fehlerAusgabe.slice(-600)}`);
      break;
    }
    const d = ergebnis.bilanz.durchlauf || {};
    restOffen = Number(psql("select count(*) from public.helmut_jobs where status in ('wartend','laeuft')"));
    const gesundOffen = Number(psql(
      "select count(*) from public.helmut_jobs where status in ('wartend','laeuft')"
      + ` and coalesce(tenant_id,'') <> '${fehlerMandat}'`));
    if (gesundOffen === 0 && slotBisGesund === null) slotBisGesund = nr;
    // ZUSTAND AM SLOTENDE, getrennt nach vorgelagerter und nachgelagerter Arbeit. Nur so
    // laesst sich die Kopplung BEWEISEN statt vermuten: bleibt am Slotende ausschliesslich
    // vorgelagerte Arbeit DES FEHLERMANDATS offen, waehrend nachgelagerte Arbeit gesunder
    // Mandate offen ist, gibt es keinen anderen Kandidaten mehr, auf den diese Auftraege
    // warten koennten. `tenant_id is null` = GETEILTER Abruf; er gehoert keinem Mandat und
    // zaehlt deshalb zu „andere", nie zum Fehlermandat.
    const VOR = "('source_fetch','document_understanding')";
    const NACH = "('mandate_projection','briefing_materialization','tenant_narrative')";
    const offenTyp = (typen, wo) => Number(psql(
      `select count(*) from public.helmut_jobs where status in ('wartend','laeuft')`
      + ` and job_type in ${typen}${wo}`));
    const vorgelagertOffenFehler = fehlerMandat
      ? offenTyp(VOR, ` and tenant_id = '${fehlerMandat}'`) : 0;
    const vorgelagertOffenAndere = offenTyp(VOR,
      fehlerMandat ? ` and coalesce(tenant_id,'') <> '${fehlerMandat}'` : "");
    const nachgelagertOffenGesund = offenTyp(NACH,
      fehlerMandat ? ` and coalesce(tenant_id,'') <> '${fehlerMandat}'` : "");
    // VERALTETE ARBEIT — die eigentliche Kapazitaetsfrage. „Rueckstau" heisst NICHT „am
    // Slotende steht nichts mehr offen": der letzte Slot eines Tages stellt regelmaessig
    // Projektionen und Briefings zurueck, die der erste Slot des naechsten Tages aufnimmt —
    // genau wie in Production. Ein Kriterium „alles leer" waere deshalb NIE erfuellbar
    // gewesen und haette Nichterfuellbarkeit als Kapazitaetsbefund ausgegeben (gefunden am
    // 26.08. im Kontrolllauf OHNE Fehlermandat: auch dort blieben Auftraege offen).
    // Gemessen wird stattdessen, was WIRKLICH liegen bleibt: offene Arbeit, deren
    // Aktualitaetsfenster aus einem FRUEHEREN Tag stammt als der laufende Slot.
    const slotTag = new Date(cronZeitFuerSlot(nr)).toISOString().slice(0, 10);
    const veraltet = (wo) => Number(psql(
      "select count(*) from public.helmut_jobs where status in ('wartend','laeuft')"
      + ` and left(coalesce(freshness_window,''), 10) < '${slotTag}'${wo}`));
    const veraltetOffen = veraltet("");
    const veraltetOffenGesund = fehlerMandat
      ? veraltet(` and coalesce(tenant_id,'') <> '${fehlerMandat}'`) : veraltetOffen;
    rueckstauJeSlot.push({
      slot: nr, tag: slotTag, offen: restOffen, gesundOffen,
      vorgelagertOffenFehler, vorgelagertOffenAndere, nachgelagertOffenGesund,
      veraltetOffen, veraltetOffenGesund
    });
    console.log(`  Slot ${nr} (${new Date(cronZeitFuerSlot(nr)).toISOString().slice(0, 16)}Z):`
      + ` ${ergebnis.bilanz.dauerMs} ms · geplant ${ergebnis.bilanz.plan.neu}`
      + ` · erledigt ${d.erledigt || 0} · zurueckgestellt ${d.zurueckgestellt || 0}`
      + ` · wiederholt ${d.wiederholt || 0} · endgueltig ${d.endgueltigFehlgeschlagen || 0}`
      + ` · offen danach ${restOffen} (davon gesunde Mandate ${gesundOffen})`);
    // Abbruch nur, wenn NICHTS mehr offen ist UND mindestens eine volle Tagesrunde lief.
    // Sonst laufen die Slots bis zur Obergrenze — der Rueckstautrend ueber zwei Tagesrunden
    // ist die eigentliche Aussage.
    if (restOffen === 0 && nr % SLOTS_JE_TAG === 0) break;

    // ── ZEITFORTSCHRITT ZUM NAECHSTEN CRON-SLOT ────────────────────────────────────────────
    // Production faehrt die drei allgemeinen Abfluesse um 04:00, 16:00 und 20:00 UTC — der
    // kleinste Abstand ist VIER STUNDEN. Jede Wartezeit des Motors ist kuerzer: Vorbedingung
    // 120 s, Budgetwarten 1 h, Wiederholungs-Backoff hoechstens 30 min
    // (`scalable-pipeline.js` VORBEDINGUNG_WARTE_MS / BUDGET_WARTE_MS / backoffMs). Beim
    // naechsten regulaeren Slot ist also JEDE dieser Fristen abgelaufen.
    // Dieser Lauf faehrt die Slots in Sekunden hintereinander; ohne Zeitfortschritt waere
    // nichts faellig und ab Slot 2 passierte NICHTS (im Eichlauf gemessen: Slot 2 bis 8 je
    // 0 Auftraege, 14 Zeilen blieben fuer immer wartend). Es wird deshalb ausschliesslich
    // die FAELLIGKEIT vorgezogen — kein Status, kein Versuchszaehler, kein `created_at`.
    // EHRLICHE GRENZE: weil `created_at` unveraendert bleibt, laufen die ABSOLUTEN
    // Aufgabefristen (Vorbedingung 6 h, Budget 48 h) in diesem verdichteten Lauf NICHT ab.
    // Der Lauf ist an dieser Stelle also nachsichtiger als Production, nicht strenger.
    const vorgezogen = Number(psql(
      "with v as (update public.helmut_jobs set due_at = now()"
      + " where status = 'wartend' and due_at > now() returning 1) select count(*) from v"));
    zeitfortschritte.push({ nachSlot: nr, vorgezogen });
  }
  clearInterval(abtaster);
  const gesamtDauerMs = Date.now() - t0;
  const maxVerbindungen = Number(psql("select setting::int from pg_settings where name='max_connections'"));

  // ── Auswertung gegen die Ablage, nicht gegen die Quittung ───────────────────────────────
  const z = (sql) => Number(psql(sql));
  const auftraege = z("select count(*) from public.helmut_jobs");
  const erledigt = z("select count(*) from public.helmut_jobs where status='erledigt'");
  const fehlgeschlagen = z("select count(*) from public.helmut_jobs where status='fehlgeschlagen'");
  const wartend = z("select count(*) from public.helmut_jobs where status='wartend'");
  const laeuft = z("select count(*) from public.helmut_jobs where status='laeuft'");
  const haengendeLeases = z("select count(*) from public.helmut_jobs where lease_owner is not null and lease_expires_at < now()");
  const dubletten = z("select count(*) from (select idempotency_key from public.helmut_jobs group by idempotency_key having count(*)>1) d");
  const unbekannt = z("select count(*) from public.helmut_jobs where last_error='unbekannter-aufgabentyp'");
  const fremdeFehler = z(`select count(*) from public.helmut_jobs where status='fehlgeschlagen' and coalesce(tenant_id,'') <> '${fehlerMandat}'`);
  const fehlerMandatFehler = z(`select count(*) from public.helmut_jobs where status='fehlgeschlagen' and tenant_id='${fehlerMandat}'`);
  const mandatsWiderspruch = z("select count(*) from public.helmut_jobs where tenant_id is not null and payload ? 'mandatsId' and payload->>'mandatsId' <> tenant_id");
  const verwaisteOutbox = psql("select to_regclass('public.helmut_job_outbox') is not null") === "t"
    ? z("select count(*) from public.helmut_job_outbox o left join public.helmut_jobs j on j.id=o.job_id where j.id is null")
    : 0;
  const mehrfachAbschluss = z("select count(*) from public.helmut_jobs where status='erledigt' and finished_at is null");
  const wiederholungen = z("select coalesce(sum(greatest(0, attempts-1)),0) from public.helmut_jobs");
  const rohdokumente = z("select count(*) from public.raw_documents");
  const vorgaenge = z("select count(*) from public.knowledge_objects");
  const kiProtokoll = z("select coalesce(jsonb_array_length(data->'llmUsage'),0) from public.helmut_store where id='main-auth'");

  const jeMandat = psql("select coalesce(tenant_id,'(global)')||' '||count(*) filter (where status='erledigt') from public.helmut_jobs group by tenant_id")
    .split("\n").filter(Boolean)
    .map((zl) => { const i = zl.lastIndexOf(" "); return { mandat: zl.slice(0, i), erledigt: Number(zl.slice(i + 1)) }; });
  const alleMandate = erzeugeMandate(mandate).map((p) => p.id);
  const gesunde = alleMandate.filter((m) => m !== fehlerMandat);
  const werteGesund = gesunde.map((m) => { const e = jeMandat.find((r) => r.mandat === m); return e ? e.erledigt : 0; });
  const minG = werteGesund.length ? Math.min(...werteGesund) : 0;
  const maxG = werteGesund.length ? Math.max(...werteGesund) : 0;

  const torBericht = umgebung.tor.bericht();
  const ursprungBericht = ursprung.bericht();
  const kiBericht = ki.bericht();
  const slotBilanzen = slots.map((s) => s.bilanz).filter(Boolean);
  const geplantGesamt = slotBilanzen.reduce((s, b) => s + ((b.plan && b.plan.neu) || 0), 0);
  const erledigtQuittung = slotBilanzen.reduce((s, b) => s + ((b.durchlauf && b.durchlauf.erledigt) || 0), 0);
  const leaseVerloren = slotBilanzen.reduce((s, b) => s + ((b.durchlauf && b.durchlauf.leaseVerloren) || 0), 0);
  const slotDauern = slotBilanzen.map((b) => b.dauerMs);
  const langsamsterSlot = slotDauern.length ? Math.max(...slotDauern) : 0;

  console.log(`\n  Auftraege ${zahl(auftraege)} · erledigt ${zahl(erledigt)} · endgueltige Fehler ${fehlgeschlagen}`
    + ` (Fehlermandat ${fehlerMandatFehler}, fremd ${fremdeFehler}) · offen ${wartend + laeuft}`);
  console.log(`  Rohdokumente ${zahl(rohdokumente)} · Vorgaenge ${zahl(vorgaenge)}`
    + ` · KI-Aufrufe ${zahl(kiBericht.aufrufe)} · KI-Protokollzeilen ${zahl(kiProtokoll)}`);
  console.log(`  Datenbank: ${zahl(torBericht.anfragen)} HTTP-Anfragen · p50 ${torBericht.dauerMs.p50} ms`
    + ` · p95 ${torBericht.dauerMs.p95} ms · max ${torBericht.dauerMs.max} ms · Fehler ${torBericht.fehler}`);
  console.log(`  Anbieter: ${zahl(ursprungBericht.anfragen)} Abrufe · ${zahl(ursprungBericht.gedrosselt)} gedrosselt`
    + ` · ${zahl(ursprungBericht.ausgefallen)} Ausfaelle · p95 ${ursprungBericht.dauerMs.p95} ms`);

  // ── Kriterien ───────────────────────────────────────────────────────────────────────────
  check(`Z1/${P_}`, "Der geplante Arbeitsumfang ist vollstaendig in der Ablage",
    auftraege > 0 && auftraege >= geplantGesamt, `${zahl(auftraege)} Zeilen · ${zahl(geplantGesamt)} gemeldet`);
  check(`Z2/${P_}`, "Quittung und Ablage sind deckungsgleich",
    erledigtQuittung === erledigt, `Quittung ${zahl(erledigtQuittung)} · Ablage ${zahl(erledigt)}`);
  check(`Z3/${P_}`, "Keine UNERWARTETEN endgueltigen Fehler",
    fremdeFehler === 0, `${fremdeFehler} fremd · ${fehlgeschlagen} gesamt`);
  check(`Z4/${P_}`, "Keine unbekannten Vorgaenge", unbekannt === 0, `${unbekannt}`);
  check(`Z5/${P_}`, "Keine haengenden Leases, nichts steht auf 'laeuft'",
    haengendeLeases === 0 && laeuft === 0, `${haengendeLeases} abgelaufen · ${laeuft} laeuft`);
  check(`Z6/${P_}`, "Keine verlorene Lease", leaseVerloren === 0, `${leaseVerloren}`);
  check(`Z7/${P_}`, "Keine Auftragsdubletten (Idempotenzschluessel eindeutig)", dubletten === 0, `${dubletten}`);
  check(`Z8/${P_}`, "Kein Auftrag doppelt abgeschlossen", mehrfachAbschluss === 0, `${mehrfachAbschluss}`);
  check(`Z9/${P_}`, "Keine mandatsfremde Zuordnung (tenant_id = payload.mandatsId)",
    mandatsWiderspruch === 0, `${mandatsWiderspruch}`);
  check(`Z10/${P_}`, "Keine verwaisten Outbox-Eintraege", verwaisteOutbox === 0, `${verwaisteOutbox}`);
  check(`Z11/${P_}`, "Kein gesundes Mandat verhungert",
    werteGesund.length > 0 && minG > 0, `min ${minG} · max ${maxG} Abschluesse je gesundem Mandat`);
  if (fehlerMandat) {
    check(`Z12/${P_}`, "Das Fehlermandat ist wirklich gescheitert (die Probe war wirksam)",
      fehlerMandatFehler > 0, `${fehlerMandatFehler} endgueltige Fehler im Fehlermandat`);
  } else {
    console.log(`  Z12/${P_} nicht anwendbar: das Fehlermandat ist fuer diesen Lauf abgeschaltet.`);
  }
  check(`Z13/${P_}`, "Echte Fachhandler: es sind Rohdokumente und Vorgaenge entstanden",
    rohdokumente > 0 && vorgaenge > 0, `${zahl(rohdokumente)} Rohdokumente · ${zahl(vorgaenge)} Vorgaenge`);
  check(`Z14/${P_}`, "Echter Netzpfad: der Anbieterursprung wurde tatsaechlich abgerufen",
    ursprungBericht.anfragen > 0, `${zahl(ursprungBericht.anfragen)} Abrufe`);
  // KONFLIKTE SIND KEIN TRANSPORTFEHLER — aber sie werden ausgewiesen, nicht weggerechnet.
  // Unter Parallelitaet antwortet PostgREST auf eine Kante nach `ko_document_links`, deren
  // Wissensobjekt im NEBENLAEUFIGEN, noch nicht sichtbar festgeschriebenen Einfuegen eines
  // anderen Workers steckt, mit `409` (`23503`, Fremdschluessel). Das ist die Datenbank, die
  // ihre Zusage haelt — nicht ein kaputter Weg. Nachgestellt und bestaetigt (26.08.): ein
  // doppelter Schluessel IM SELBEN Stapel ergibt `500`/`21000`, ein bereits vorhandener
  // Schluessel `201`, ein fehlendes Fremdschluesselziel `409`/`23503`.
  const konflikte = Number(torBericht.nachStatus["409"] || 0);
  const echteFehler = torBericht.fehler - konflikte;
  check(`Z15/${P_}`, "Echter Datenbankpfad: keine Transport- oder Serverfehler ueber HTTP/PostgREST",
    torBericht.anfragen > 0 && echteFehler === 0,
    `${zahl(torBericht.anfragen)} Anfragen · ${echteFehler} echte Fehler · ${konflikte} Konflikte (409)`
    + (torBericht.fehlerbeispiele && torBericht.fehlerbeispiele.length
      ? ` · Beispiele: ${torBericht.fehlerbeispiele.slice(0, 4).map((f) => `${f.weg}=${f.status}`).join(", ")}`
      : ""));

  // ENDZUSTAND GEGEN DIE ABLAGE (CLAUDE.md §4.10): ein aufgefangener Konflikt darf keine
  // Verknuepfung verlieren. Ein Vorgang ohne Belegkante waere „nicht wiederauffindbar" (B4).
  const vorgaengeOhneBeleg = z(
    "select count(*) from public.knowledge_objects k where not exists"
    + " (select 1 from public.ko_document_links l where l.knowledge_object_id = k.id)");
  check(`Z15b/${P_}`, "Kein Vorgang bleibt ohne Belegkante (aufgefangene Konflikte kosten keine Verknuepfung)",
    vorgaengeOhneBeleg === 0, `${vorgaengeOhneBeleg} Vorgaenge ohne ko_document_links`);
  check(`Z16/${P_}`, "Echter KI-Pfad: es wurden Modellaufrufe ueber TLS gefuehrt und protokolliert",
    kiBericht.aufrufe > 0 && kiProtokoll > 0, `${zahl(kiBericht.aufrufe)} Aufrufe · ${zahl(kiProtokoll)} Protokollzeilen`);
  check(`Z17/${P_}`, "Kein Slot ueberschreitet das 300-Sekunden-Zeitbudget",
    langsamsterSlot <= SLOT_BUDGET_MS, `langsamster Slot ${langsamsterSlot} ms von ${SLOT_BUDGET_MS} ms`);
  check(`Z18/${P_}`, "Wiederholungen sind begrenzt (kein Auftrag ueber seiner Versuchsgrenze)",
    z("select count(*) from public.helmut_jobs where attempts > max_attempts") === 0,
    `${zahl(wiederholungen)} Wiederholungen gesamt`);
  check(`Z18b/${P_}`, "Die Spitze der Datenbankverbindungen bleibt mit Reserve unter der Grenze",
    verbindungenSpitze > 0 && verbindungenSpitze <= maxVerbindungen * 0.5,
    `Spitze ${verbindungenSpitze} (davon aktiv ${verbindungenAktivSpitze}) von ${maxVerbindungen}`
    + " — lokaler Messwert, KEINE Aussage ueber den Supabase-Pooler");
  check(`Z19/${P_}`, "Der Kostenriegel des KI-Endpunkts wurde nie erreicht",
    kiBericht.abgewiesenWegenObergrenze === 0,
    `${zahl(kiBericht.aufrufe)} von hoechstens ${zahl(KI_HOECHSTZAHL)} Aufrufen`);
  // ── Z20 / Z20b / Z21 · Kapazitaet ───────────────────────────────────────────────────────
  // RUECKSTAU IST EINE KAPAZITAETSAUSSAGE, KEINE KORREKTHEITSAUSSAGE. Weil jeder Slot mit
  // seiner eigenen Cron-Zeit plant, kommt in JEDEM Slot neue Arbeit an — genau wie in
  // Production. Ein leerer Endzustand ist deshalb kein Ziel und waere auch gar nicht
  // erreichbar: der letzte Slot eines Tages stellt regelmaessig Arbeit zurueck, die der
  // erste Slot des naechsten Tages aufnimmt. Gemessen wird stattdessen dreierlei:
  //   Z20  — bleibt am Tagesende Arbeit eines FRUEHEREN Tages liegen? (alle Mandate)
  //   Z20b — waechst der Rueckstau von Tag 1 zu Tag 2?
  //   Z21  — dasselbe wie Z20, aber nur fuer GESUNDE Mandate: die Aussage aus §2a.
  const tagesenden = rueckstauJeSlot.filter((r) => r.slot % SLOTS_JE_TAG === 0);
  const letztesTagesende = tagesenden.length ? tagesenden[tagesenden.length - 1] : null;
  console.log(`  Offen am Ende des Laufs: ${wartend + laeuft} (davon aus frueheren Tagesfenstern`
    + ` ${letztesTagesende ? letztesTagesende.veraltetOffen : "?"})`);
  if (letztesTagesende) {
    befund(`Z20/${P_}`, "Am Ende eines Tages liegt keine Arbeit eines FRUEHEREN Tages mehr",
      letztesTagesende.veraltetOffen === 0,
      `nach Slot ${letztesTagesende.slot} (${letztesTagesende.tag}): `
      + `${letztesTagesende.veraltetOffen} Auftraege aus frueheren Tagesfenstern offen`
      + ` · ${letztesTagesende.offen} Auftraege insgesamt offen (davon Arbeit des laufenden`
      + " Tages, die der naechste Slot aufnimmt — das ist der Normalfall)");
  } else {
    console.log(`  Z20/${P_} nicht anwendbar: es wurde keine volle Tagesrunde gefahren.`);
  }
  const tag1 = rueckstauJeSlot.find((r) => r.slot === SLOTS_JE_TAG);
  const tag2 = rueckstauJeSlot.find((r) => r.slot === SLOTS_JE_TAG * 2);
  if (tag1 && tag2) {
    // TOLERANZ, ausdruecklich benannt: einzelne Auftraege wandern zwischen zwei Slots in die
    // Warteschlange und wieder heraus. Ein Unterschied von bis zu zwei Auftraegen bzw. 10 %
    // ist das Rauschen einer Slotgrenze und keine Aussage ueber Tragfaehigkeit. Die
    // Rohzahlen stehen daneben, damit niemand die Toleranz nachschlagen muss.
    const grenze = Math.max(tag1.offen + 2, Math.ceil(tag1.offen * 1.1));
    befund(`Z20b/${P_}`, "Der Rueckstau waechst nicht von Tag zu Tag (Toleranz: +2 Auftraege bzw. +10 %)",
      tag2.offen <= grenze,
      `nach Tag 1 (Slot ${tag1.slot}) ${tag1.offen} offen · nach Tag 2 (Slot ${tag2.slot}) ${tag2.offen} offen`
      + ` · Grenze ${grenze}`);
  } else {
    console.log(`  Z20b/${P_} nicht anwendbar: es wurden keine zwei vollen Tagesrunden gefahren.`);
  }

  // DER EIGENTLICHE KAPAZITAETSBEFUND (§2a): Production hat DREI regulaere allgemeine
  // Abfluesse am Tag. Passt die Tagesmenge einer Stufe nicht hinein, bleibt am Tagesende
  // Arbeit des VORTAGS liegen — und zwar bei Mandaten, an denen nichts kaputt ist.
  const abflussSlots = slotBilanzen.length;
  if (letztesTagesende) {
    befund(`Z21/${P_}`, "Die Tagesarbeit der GESUNDEN Mandate fliesst in den drei regulaeren Tagesslots ab (§2a)",
      letztesTagesende.veraltetOffenGesund === 0,
      `nach Slot ${letztesTagesende.slot}: ${letztesTagesende.veraltetOffenGesund} Auftraege`
      + " gesunder Mandate aus frueheren Tagesfenstern offen"
      + ` · ${abflussSlots} Slots gefahren · langsamster Slot ${langsamsterSlot} ms`);
  } else {
    console.log(`  Z21/${P_} nicht anwendbar: es wurde keine volle Tagesrunde gefahren.`);
  }

  // ── Z22 · Wird ein gesundes Mandat durch das kranke aufgehalten? ────────────────────────
  // STRUKTUR (belegte Tatsache, aus dem Code gelesen, nicht aus diesem Lauf): die
  // Vorbedingungspruefung `helmut_jobs_offen` (Migration 20260808_jobqueue_abhaengigkeiten)
  // filtert ueber AKTUALITAETSFENSTER und TYP — sie hat KEINEN Mandatsfilter. Solange also
  // irgendein `source_fetch` im Fenster offen ist, wird JEDE Projektion und JEDES Briefing
  // zurueckgestellt, auch die voellig gesunder Mandate.
  // WIRKUNG (das, was dieser Lauf messen kann und was er NICHT messen kann): eine
  // Zurueckstellung mit Grund `vorbedingung-offen` ist fuer sich genommen die Reihenfolge-
  // zusage bei der Arbeit und KEIN Befund. Ein Nachweis der Kopplung ist erst ein Slot, an
  // dessen Ende die einzige offene vorgelagerte Arbeit dem Fehlermandat gehoert, waehrend
  // nachgelagerte Arbeit gesunder Mandate offen bleibt.
  const VERGLEICH = leseVergleich(mandate);
  const gekoppelteSlots = messwerteKopplung(slotBilanzen, rueckstauJeSlot);
  const kopplungText = `${gekoppelteSlots.alleinSlots} Slot(e), in denen NUR noch das `
    + `Fehlermandat vorgelagert offen war und gesunde Mandate nachgelagert warteten · `
    + `${gekoppelteSlots.zurueckstellungen} Zurueckstellungen mit Grund \`vorbedingung-offen\` `
    + "(fuer sich genommen normal: Reihenfolgezusage) · Struktur: helmut_jobs_offen hat "
    + "keinen Mandatsfilter (aus dem Code belegt, nicht aus diesem Lauf)";
  if (!fehlerMandat) {
    console.log(`  Z22/${P_} nicht anwendbar: ohne Fehlermandat gibt es nichts zu koppeln`
      + ` — ${gekoppelteSlots.zurueckstellungen} Zurueckstellungen \`vorbedingung-offen\`.`);
  } else if (VERGLEICH.gefunden) {
    // DER EIGENTLICHE NACHWEIS: derselbe Lauf ohne Fehlermandat. Was sich zwischen beiden
    // Laeufen unterscheidet, kann NUR am Fehlermandat liegen — Mandatszahl, Quellen, Slots,
    // Zeitpunkte und Ursprungsinhalt sind identisch.
    const veraltetHier = letztesTagesende ? letztesTagesende.veraltetOffenGesund : null;
    const mehrVeraltet = veraltetHier == null || VERGLEICH.veraltetOffenGesund == null
      ? null : veraltetHier - VERGLEICH.veraltetOffenGesund;
    const mehrZurueck = gekoppelteSlots.zurueckstellungen - VERGLEICH.zurueckstellungen;
    const vz = (n) => `${n >= 0 ? "+" : ""}${n}`;
    befund(`Z22/${P_}`, "Kein gesundes Mandat wird durch das fehlerhafte Mandat aufgehalten"
      + " (gemessen gegen den Kontrolllauf ohne Fehlermandat)",
      gekoppelteSlots.alleinSlots === 0 && (mehrVeraltet == null || mehrVeraltet <= 0),
      `${kopplungText} · Vergleich mit/ohne Fehlermandat: liegengebliebene Arbeit gesunder`
      + ` Mandate ${veraltetHier == null ? "?" : veraltetHier} gegen`
      + ` ${VERGLEICH.veraltetOffenGesund == null ? "?" : VERGLEICH.veraltetOffenGesund}`
      + `${mehrVeraltet == null ? "" : ` (${vz(mehrVeraltet)})`}`
      + ` · Zurueckstellungen ${gekoppelteSlots.zurueckstellungen} gegen`
      + ` ${VERGLEICH.zurueckstellungen} (${vz(mehrZurueck)})`);
  } else {
    // OHNE KONTROLLLAUF WIRD HIER NICHTS ENTSCHIEDEN. Weder gruen noch rot: der Lauf hat die
    // Zahlen, aber nicht den Gegenbeweis. Als offener Befund gefuehrt, damit die Stufe nicht
    // als vollstaendig bestanden gilt, solange die Frage offen ist.
    befundOffen += 1;
    console.log(`  BEFUND OFFEN          Z22/${P_} Kopplung an das fehlerhafte Mandat —`
      + " in einem EINZELLAUF nicht entscheidbar; es fehlt der Kontrolllauf"
      + " (HELMUT_Z3_FEHLERMANDAT=aus, danach HELMUT_Z3_VERGLEICH)");
    console.log(`      ${kopplungText}`);
    kriterien.push({
      id: `Z22/${P_}`, name: "Kopplung an das fehlerhafte Mandat", ok: false,
      detail: `nicht entscheidbar ohne Kontrolllauf · ${kopplungText}`, art: "kapazitaet"
    });
  }

  befund(`Z23/${P_}`, "Die Nebenlaeufigkeit erzeugt keine nennenswerte Konfliktrate an der Datenbank",
    torBericht.anfragen > 0 && konflikte / torBericht.anfragen < 0.01,
    `${konflikte} von ${zahl(torBericht.anfragen)} Anfragen `
    + `(${((konflikte / Math.max(1, torBericht.anfragen)) * 100).toFixed(2)} %) `
    + "— Fremdschluesselkonflikte auf ko_document_links unter Parallelitaet "
    + `${PARALLEL}; vom Wiederholungsweg aufgefangen`);

  const messwerte = {
    mandate, fehlerMandat: fehlerMandat || null,
    vergleich: VERGLEICH.gefunden ? { datei: VERGLEICH.datei,
      zurueckstellungen: VERGLEICH.zurueckstellungen,
      veraltetOffenGesund: VERGLEICH.veraltetOffenGesund } : null,
    auftraege, erledigt, fehlgeschlagen, fremdeFehler, fehlerMandatFehler,
    kopplung: gekoppelteSlots, konflikte, echteDatenbankfehler: echteFehler, vorgaengeOhneBeleg,
    wartend, laeuft, haengendeLeases, dubletten, wiederholungen, mehrfachAbschluss,
    rohdokumente, vorgaenge, kiProtokoll,
    gesamtDauerMs, langsamsterSlot, slots: abflussSlots, slotBisGesund, zeitfortschritte,
    rueckstauJeSlot,
    verbindungenSpitze, verbindungenAktivSpitze, maxVerbindungen,
    slotDauern, fairnessMin: minG, fairnessMax: maxG,
    datenbank: torBericht, anbieter: ursprungBericht, ki: kiBericht,
    slotBilanzen: slotBilanzen.map((b) => ({
      slot: b.slot, dauerMs: b.dauerMs, planDauerMs: b.planDauerMs, arbeitDauerMs: b.arbeitDauerMs,
      geplantNeu: b.plan && b.plan.neu,
      erledigt: b.durchlauf && b.durchlauf.erledigt,
      zurueckgestellt: b.durchlauf && b.durchlauf.zurueckgestellt,
      wiederholt: b.durchlauf && b.durchlauf.wiederholt,
      endgueltig: b.durchlauf && b.durchlauf.endgueltigFehlgeschlagen,
      zurueckstellGruende: b.durchlauf && b.durchlauf.bilanzen
        ? b.durchlauf.bilanzen.reduce((m, x) => {
          for (const [g, n] of Object.entries((x && x.zurueckstellGruende) || {})) m[g] = (m[g] || 0) + n;
          return m;
        }, {})
        : {}
    }))
  };

  await ursprung.stoppe();
  await ki.stoppe();
  return messwerte;
}

// ── Hauptlauf ───────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Helmut — REALISTIKNACHWEIS Z3a (25 / 50 / 100 Mandate)");
  console.log(`  Stufen: ${STUFEN.join(", ")} · Slotbudget ${SLOT_BUDGET_MS} ms`
    + ` · Worker ${PARALLEL}/${STAPEL} · regulaere Tagesslots ${SLOTS_JE_TAG}`);
  console.log("  ECHTE Fachhandler, ECHTER Datenbankweg (HTTP/PostgREST), ECHTES Netz, ECHTE Modellaufrufe.");
  console.log("  LOKALE Anbieter — kein Google, kein Azure. Ergebnis ist Z3a (Teilnachweis), nie Z3 vollstaendig.\n");

  pruefeSicherheit();

  if (!servererreichbar() || !POSTGREST || !fs.existsSync(POSTGREST)) {
    console.log("== UEBERSPRUNGEN ==");
    if (!servererreichbar()) console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST/USER).");
    if (!POSTGREST || !fs.existsSync(POSTGREST)) console.log("  Kein lokales PostgREST (HELMUT_Z3_POSTGREST).");
    console.log("  >> DER REALISTIKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    process.exit(0);
  }

  const arbeitsverzeichnis = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-z3-"));
  console.log(`  Arbeitsverzeichnis: ${arbeitsverzeichnis}`);

  abschnitt("AUFBAU DER LOKALEN PLATTFORM");
  const migration = legeDatenbankAn(arbeitsverzeichnis);
  console.log(`  Schema + Migrationen: ${migration.angewendet} von ${migration.gesamt} angewendet`);
  if (migration.gescheitert.length) {
    for (const g of migration.gescheitert) console.log(`    NICHT angewendet: ${g.datei}`);
  }
  check("Z0/aufbau", "Alle Vorwaertsmigrationen sind lokal angewendet",
    migration.gescheitert.length === 0, `${migration.angewendet}/${migration.gesamt}`);
  const tabellen = Number(psql("select count(*) from information_schema.tables where table_schema='public'"));
  const funktionen = Number(psql("select count(*) from information_schema.routines where routine_schema='public'"));
  console.log(`  Lokales Abbild: ${tabellen} Tabellen · ${funktionen} Funktionen`);

  const rest = startePostgrest(arbeitsverzeichnis);
  const token = baueDienstToken();
  const tor = await P.starteDatenbankTor({ postgrestPort: rest.port });
  const bereit = await warteAufPostgrest(rest.port, tor.url, token);
  check("Z0/tor", "Das Datenbanktor antwortet ueber HTTP/PostgREST", bereit,
    bereit ? `${tor.url}/rest/v1` : "keine Antwort");
  if (!bereit) {
    console.log("  >> AUFBAU GESCHEITERT — der Nachweis ist offen. <<");
    rest.stoppe(); await tor.stoppe();
    process.exit(1);
  }

  const umgebung = { arbeitsverzeichnis, torUrl: tor.url, tor, token };
  const alle = [];
  for (const stufe of STUFEN) {
    const vorherFail = fail;
    const m = await fuehreStufeAus(stufe, umgebung);
    alle.push(m);
    if (fail > vorherFail) {
      console.log(`\n>> STUFE ${stufe} NICHT VOLLSTAENDIG BESTANDEN — die naechste Stufe wird`);
      console.log("   nach der Stufenregel NICHT ausgefuehrt.");
      break;
    }
  }

  abschnitt("MESSWERTE JE STUFE");
  console.log("  Mandate | Auftraege | Slots | langsamster | erledigt | Fehler | Dok.  | Vorg. | KI    | DB-Anfr.");
  for (const m of alle) {
    console.log(
      "  " + String(m.mandate).padStart(7)
      + " | " + String(zahl(m.auftraege)).padStart(9)
      + " | " + String(m.slots).padStart(5)
      + " | " + String(`${m.langsamsterSlot} ms`).padStart(11)
      + " | " + String(zahl(m.erledigt)).padStart(8)
      + " | " + String(m.fehlgeschlagen).padStart(6)
      + " | " + String(zahl(m.rohdokumente)).padStart(5)
      + " | " + String(zahl(m.vorgaenge)).padStart(5)
      + " | " + String(zahl(m.ki.aufrufe)).padStart(5)
      + " | " + String(zahl(m.datenbank.anfragen)).padStart(8));
  }

  abschnitt("KI-MENGE UND BERECHNETE KOSTEN");
  console.log("  Preisbasis: `LLM_PRICE_DEFAULTS` in lib/helmut/storage.js — gpt-5-mini 0,25 USD/1 Mio.");
  console.log("  Eingabe- und 2,00 USD/1 Mio. Ausgabetoken. HERKUNFT: unbelegter Schaetzwert im Code");
  console.log("  (`llmPriceProvenance()` meldet `unbelegt-schaetzwert`). Es ist ein OpenAI-Listenpreis,");
  console.log("  angewandt auf ein Azure-Deployment — er ist damit KEIN belegter Azure-Preis.");
  console.log("  Token sind GESCHAETZT aus der gemessenen Zeichenzahl (Teiler "
    + `${P.ZEICHEN_JE_TOKEN}), nicht vom Anbieter gezaehlt.\n`);
  console.log("  Mandate | KI-Aufrufe | Eingabetoken | Ausgabetoken | berechnete Kosten");
  for (const m of alle) {
    const kosten = (m.ki.eingabeTokenGeschaetzt / 1e6) * 0.25 + (m.ki.ausgabeTokenGeschaetzt / 1e6) * 2.0;
    console.log(
      "  " + String(m.mandate).padStart(7)
      + " | " + String(zahl(m.ki.aufrufe)).padStart(10)
      + " | " + String(zahl(m.ki.eingabeTokenGeschaetzt)).padStart(12)
      + " | " + String(zahl(m.ki.ausgabeTokenGeschaetzt)).padStart(12)
      + " | " + `${kosten.toFixed(4)} USD`.padStart(17));
  }

  const bericht = {
    stand: "Z3a-teilnachweis-lokale-anbieter",
    erhoben: new Date().toISOString(),
    slotBudgetMs: SLOT_BUDGET_MS, slotsJeTag: SLOTS_JE_TAG, parallel: PARALLEL, stapel: STAPEL,
    kiDeckel: KI_DECKEL, kiHoechstzahl: KI_HOECHSTZAHL,
    zeichenJeToken: P.ZEICHEN_JE_TOKEN,
    stufen: alle, kriterien, pass, fail, befundOffen
  };
  const berichtDatei = process.env.HELMUT_Z3_BERICHT
    || path.join(os.tmpdir(), "helmut-z3-realistikbericht.json");
  fs.writeFileSync(berichtDatei, JSON.stringify(bericht, null, 2), "utf8");
  console.log(`\n  Maschinenlesbarer Bericht: ${berichtDatei}`);

  console.log("\n  >> EINORDNUNG (verbindlich): echte Fachhandler, echter Datenbankweg ueber");
  console.log("     HTTP/PostgREST, echtes Netz, echte Modellaufrufe — aber LOKALE Anbieter.");
  console.log("     Das ist Z3a (Teilnachweis). Es ist KEIN vollstaendiges Z3 und KEINE Freigabe (Z4).");

  rest.stoppe();
  await tor.stoppe();

  console.log(`\n== ERGEBNIS ==`);
  console.log(`PASS ${pass}  FAIL ${fail}  BEFUNDE NICHT ERFUELLT ${befundOffen}`);
  if (befundOffen > 0) {
    console.log("  Ein offener BEFUND ist kein Fehler des Laufs, sondern sein Ergebnis —");
    console.log("  die betroffene Stufe gilt damit NICHT als vollstaendig bestanden.");
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("LAUFFEHLER:", (error && error.stack) || error);
  process.exit(1);
});
