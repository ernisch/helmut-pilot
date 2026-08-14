"use strict";

// Helmut — DATENBANKNACHWEIS des ATOMAREN VERSTEHENSVERTRAGS (OP-30 CAS, 2026-08-14).
// =============================================================================================
// Prüft `supabase/migrations/20260814180000_verstehen_cas.sql` an einer ECHTEN PostgreSQL —
// mit ECHTER Nebenläufigkeit (eigenständige `psql`-Prozesse, keine Attrappe, kein Mock).
// Die Anwendungsseite prüft `scripts/verstehen-cas-vertrag-test.js`.
//
//   §1  Migration läuft vorwärts, rückwärts und erneut vorwärts
//   §2  Sicherheit: RLS an+erzwungen, keine Rechte für anon/authenticated, fester search_path
//   §3  20 GLEICHZEITIGE Arbeiter auf denselben Vorgang → genau EINE Berechtigung
//   §4  8 VERSCHIEDENE Vorgänge werden gleichzeitig gehalten (echte Parallelität)
//   §5  Lease-Verlust verhindert die Speicherung durch den alten Besitzer
//   §6  Ein alter Lauf kann ein neueres Ergebnis nicht überschreiben (Trigger)
//   §7  Absturz VOR dem Modellaufruf ist sicher wiederholbar
//   §8  Absturz NACH dem Modellaufruf erzeugt keinen automatischen zweiten Aufruf
//   §9  Dieselbe Eingabe ist idempotent; eine neue Eingabe wird zugelassen
//   §10 Vormerkungen: atomar erhöht (kein verlorener Eintrag), bedingt gelöscht
//   §11 Der unbekannte Ausgang ist auflösbar — automatisch bei belegtem Ergebnis
//   §12 Fehlerhafte Argumente stoppen geschlossen (kein stiller Erfolg)
//   §13 Fremde Schreibpfade auf knowledge_objects bleiben unberührt
//
// Ohne erreichbaren Server: ehrlicher Skip mit Exit 0 — der Nachweis ist dann OFFEN.
// Aufruf lokal: HELMUT_TEST_PG_HOST=127.0.0.1 node scripts/lokal.js -- \
//                 node scripts/verstehen-cas-datenbank-test.js

const { execFileSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260814180000_verstehen_cas.sql");
const ROLLBACK = path.join(ROOT, "supabase", "migrations", "rollback_20260814180000_verstehen_cas.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_CAS || "helmut_test_verstehen_cas"
};

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function psql(sql, { datei = null, erwarteFehler = false, db = PG.db } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    if (!erwarteFehler) throw error;
    return { ok: false, out: String((error.stderr || error.stdout || error.message) || "").trim() };
  }
}

// ECHTE Nebenläufigkeit: ein eigener Betriebssystemprozess je Arbeiter. Nichts an diesem
// Nachweis läuft in einem gemeinsamen JavaScript-Faden — genau das ist der Punkt.
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const kind = spawn("psql",
      ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    kind.stdout.on("data", (d) => { out += d; });
    kind.stderr.on("data", (d) => { err += d; });
    kind.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

function servererreichbar() {
  if (!PG.host) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

// Minimales Kernschema: die Migration setzt public.knowledge_objects voraus (Fencing-Spalte
// und Trigger). Bewusst nur die Spalten, die der Vertrag anfasst.
const KERNSCHEMA = `
  create table if not exists public.knowledge_objects (
    id text primary key,
    vorgang_id text,
    status text,
    understanding_status text,
    ko_version integer default 1,
    updated_at timestamptz default now()
  );
  create index if not exists knowledge_objects_vorgang_idx on public.knowledge_objects (vorgang_id);
`;

function frischeDatenbank() {
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$`);
  psql(KERNSCHEMA);
}

function reserviere(vorgangId, hash, besitzer, ttlMs = 300000) {
  const zeile = psql(`select erlaubt||'|'||fencing||'|'||zustand||'|'||grund`
    + ` from public.helmut_verstehen_reserviere('${vorgangId}','${hash}','${besitzer}',${ttlMs})`).out.split("|");
  return { erlaubt: /^t/.test(zeile[0] || ""), fencing: Number(zeile[1]), zustand: zeile[2], grund: zeile[3] };
}

function leaseAblaufenLassen(vorgangId) {
  psql(`update public.helmut_verstehen_reservierungen set lease_bis = now() - interval '1 second'`
    + ` where vorgang_id = '${vorgangId}'`);
}

async function main() {
  console.log("Helmut — Datenbanknachweis atomarer Verstehensvertrag (OP-30 CAS)");

  if (!servererreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt");
    console.log("  oder Verbindung nicht moeglich).");
    console.log("  >> DER DATENBANKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("\n== ERGEBNIS ==\nPASS 0  FAIL 0  (uebersprungen, Nachweis offen)");
    process.exit(0);
  }
  console.log(`  Server: ${PG.host}:${PG.port}/${PG.db} als ${PG.user}`);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Migration vorwaerts, rueckwaerts und erneut vorwaerts");
  frischeDatenbank();
  psql(null, { datei: MIGRATION });
  const nachVor = psql(`select count(*) from information_schema.tables where table_schema='public'`
    + ` and table_name in ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen')`).out;
  check("1.1 Vorwaerts: beide Tabellen entstehen", nachVor === "2", nachVor);
  const spalteVor = psql(`select count(*) from information_schema.columns`
    + ` where table_name='knowledge_objects' and column_name='verstehen_fencing'`).out;
  const triggerVor = psql("select count(*) from pg_trigger where tgname='helmut_ko_fencing_wache_trg'").out;
  check("1.2 Vorwaerts: Fencing-Spalte und Trigger entstehen", spalteVor === "1" && triggerVor === "1",
    `${spalteVor}/${triggerVor}`);
  psql(null, { datei: ROLLBACK });
  const nachZurueck = psql(`select count(*) from information_schema.tables where table_schema='public'`
    + ` and table_name in ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen')`).out;
  const funktionenZurueck = psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace`
    + ` where n.nspname='public' and p.proname like 'helmut_verstehen%'`).out;
  const spalteZurueck = psql(`select count(*) from information_schema.columns`
    + ` where table_name='knowledge_objects' and column_name='verstehen_fencing'`).out;
  check("1.3 Rueckwaerts: Tabellen, Funktionen, Spalte und Trigger verschwinden restlos",
    nachZurueck === "0" && funktionenZurueck === "0" && spalteZurueck === "0",
    `${nachZurueck}/${funktionenZurueck}/${spalteZurueck}`);
  check("1.4 Rueckwaerts laesst knowledge_objects selbst stehen (kein Datenverlust)",
    psql("select count(*) from information_schema.tables where table_name='knowledge_objects'").out === "1");
  psql(null, { datei: MIGRATION });
  check("1.5 Erneut vorwaerts: idempotent anwendbar",
    psql(`select count(*) from information_schema.tables where table_schema='public'`
      + ` and table_name in ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen')`).out === "2");
  check("1.6 Ohne knowledge_objects bricht die Migration ehrlich ab (Vorbedingung)",
    (() => {
      psql("drop database if exists helmut_test_cas_ohne_kern", { db: "postgres" });
      psql("create database helmut_test_cas_ohne_kern", { db: "postgres" });
      const r = psql(null, { datei: MIGRATION, erwarteFehler: true, db: "helmut_test_cas_ohne_kern" });
      psql("drop database if exists helmut_test_cas_ohne_kern", { db: "postgres" });
      return r.ok === false && /knowledge_objects fehlt/.test(r.out);
    })());

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Sicherheit: RLS, Rechte, search_path");
  const rls = psql(`select count(*) from pg_class where relname in`
    + ` ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen')`
    + ` and relrowsecurity and relforcerowsecurity`).out;
  check("2.1 RLS ist an UND erzwungen (beide Tabellen)", rls === "2", rls);
  const policies = psql(`select count(*) from pg_policies where tablename in`
    + ` ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen')`).out;
  check("2.2 Keine Policy — der Zugriff laeuft ausschliesslich ueber service_role", policies === "0", policies);
  const grants = psql(`select count(*) from information_schema.role_table_grants where table_name in`
    + ` ('helmut_verstehen_reservierungen','helmut_verstehen_vormerkungen')`
    + ` and grantee in ('anon','authenticated','PUBLIC')`).out;
  check("2.3 KEINE Tabellenrechte fuer anon/authenticated/PUBLIC", grants === "0", grants);
  const ohnePfad = psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace`
    + ` where n.nspname='public' and (p.proname like 'helmut_verstehen%' or p.proname='helmut_ko_fencing_wache')`
    + ` and coalesce(array_to_string(p.proconfig,','),'') not like '%search_path=public, pg_temp%'`).out;
  check("2.4 JEDE Funktion traegt einen festen search_path", ohnePfad === "0", ohnePfad);
  const definer = psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace`
    + ` where n.nspname='public' and p.proname like 'helmut_verstehen%' and p.prosecdef`).out;
  check("2.5 Keine Funktion laeuft als SECURITY DEFINER (keine Rechteausweitung)", definer === "0", definer);
  const rechteAnon = psql(`select count(*) from information_schema.routine_privileges`
    + ` where routine_name like 'helmut_verstehen%' and grantee in ('anon','authenticated','PUBLIC')`).out;
  check("2.6 KEINE Ausfuehrungsrechte fuer anon/authenticated/PUBLIC", rechteAnon === "0", rechteAnon);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · 20 GLEICHZEITIGE Arbeiter auf denselben Vorgang");
  {
    const antworten = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      psqlAsync(`select erlaubt||'|'||fencing from public.helmut_verstehen_reserviere('vg-heiss','h-1','w${i}',300000)`)));
    // Boolean in ||-Konkatenation castet zu 'true'/'false' (nicht 't'/'f').
    const erlaubt = antworten.filter((a) => /^true\|/.test(a.out));
    check("3.1 Genau EIN Arbeiter ist berechtigt (19 werden abgewiesen)",
      erlaubt.length === 1, `${erlaubt.length} von 20: ${antworten.map((a) => a.out).join(" ")}`);
    check("3.2 Kein Arbeiter endet mit einem Datenbankfehler (alle 20 antworten geschlossen)",
      antworten.every((a) => a.code === 0), antworten.filter((a) => a.code !== 0).map((a) => a.err).join(" | "));
    check("3.3 Es gibt genau EINE Reservierungszeile mit Fencing 1",
      psql("select fencing||'|'||zustand from public.helmut_verstehen_reservierungen where vorgang_id='vg-heiss'").out === "1|reserviert");
    // Der Modellstart darf ebenfalls nur dem Berechtigten gelingen.
    const starts = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      psqlAsync(`select public.helmut_verstehen_modellstart('vg-heiss','w${i}',1,300000)`)));
    check("3.4 Auch der Modellstart gelingt genau EINMAL — es gibt keine zweite KI-Ausfuehrung",
      starts.filter((a) => a.out === "t").length === 1,
      String(starts.filter((a) => a.out === "t").length));
    check("3.5 Der Zaehler der Modellaufrufe steht auf genau 1",
      psql("select ki_aufrufe from public.helmut_verstehen_reservierungen where vorgang_id='vg-heiss'").out === "1");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · 8 VERSCHIEDENE Vorgaenge gleichzeitig (echte Parallelitaet)");
  {
    const antworten = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      psqlAsync(`select erlaubt from public.helmut_verstehen_reserviere('vg-par-${i}','h-${i}','p${i}',300000)`)));
    check("4.1 Alle acht Vorgaenge werden GLEICHZEITIG berechtigt (kein globales Schloss)",
      antworten.filter((a) => a.out === "t").length === 8,
      String(antworten.filter((a) => a.out === "t").length));
    const gleichzeitig = psql(`select count(*) from public.helmut_verstehen_reservierungen`
      + ` where vorgang_id like 'vg-par-%' and zustand='reserviert' and lease_bis > now()`).out;
    check("4.2 Acht Leases sind zum SELBEN Zeitpunkt aktiv (belegte Ueberlappung)",
      gleichzeitig === "8", gleichzeitig);
    const starts = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      psqlAsync(`select public.helmut_verstehen_modellstart('vg-par-${i}','p${i}',1,300000)`)));
    check("4.3 Acht Modellaufrufe duerfen gleichzeitig laufen",
      starts.filter((a) => a.out === "t").length === 8, String(starts.filter((a) => a.out === "t").length));
    const laufend = psql(`select count(*) from public.helmut_verstehen_reservierungen`
      + ` where vorgang_id like 'vg-par-%' and zustand='modell-laeuft' and lease_bis > now()`).out;
    check("4.4 Acht Vorgaenge stehen gleichzeitig auf 'modell-laeuft'", laufend === "8", laufend);
    // Und 24 gleichzeitige Arbeiter auf 8 Vorgaenge (3 je Vorgang) -> genau 8 Berechtigungen.
    psql("delete from public.helmut_verstehen_reservierungen where vorgang_id like 'vg-mix-%'");
    const gemischt = await Promise.all(Array.from({ length: 24 }, (_, i) =>
      psqlAsync(`select erlaubt from public.helmut_verstehen_reserviere('vg-mix-${i % 8}','h','m${i}',300000)`)));
    check("4.5 24 Arbeiter auf 8 Vorgaenge ergeben genau 8 Berechtigungen (eine je Vorgang)",
      gemischt.filter((a) => a.out === "t").length === 8,
      String(gemischt.filter((a) => a.out === "t").length));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Lease-Verlust verhindert die Speicherung durch den alten Besitzer");
  {
    reserviere("vg-lease", "h1", "alt");
    psql("select public.helmut_verstehen_modellstart('vg-lease','alt',1,300000)");
    leaseAblaufenLassen("vg-lease");
    // Ein neuer Besitzer uebernimmt (Ausgang war unbekannt -> ausdruecklich freigeben).
    psql("select public.helmut_verstehen_reserviere('vg-lease','h1','neu',300000)");
    psql("select public.helmut_verstehen_ausgang_aufloesen('vg-lease','erneut')");
    const neu = reserviere("vg-lease", "h1", "neu");
    check("5.1 Der neue Besitzer bekommt einen HOEHEREN Fencing-Wert",
      neu.erlaubt === true && neu.fencing === 2, `${neu.erlaubt}/${neu.fencing}`);
    const altRecht = psql("select public.helmut_verstehen_schreibrecht('vg-lease','alt',1,120000)").out;
    check("5.2 Der ALTE Besitzer bekommt kein Schreibrecht mehr", altRecht === "f", altRecht);
    const altAbschluss = psql("select public.helmut_verstehen_abschluss('vg-lease','alt',1,'erg-alt')").out;
    check("5.3 Der ALTE Besitzer kann auch nicht abschliessen", altAbschluss === "f", altAbschluss);
    psql("select public.helmut_verstehen_modellstart('vg-lease','neu',2,300000)");
    check("5.4 Der NEUE Besitzer hat volles Schreibrecht",
      psql("select public.helmut_verstehen_schreibrecht('vg-lease','neu',2,120000)").out === "t");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · Ein alter Lauf kann ein neueres Ergebnis nicht ueberschreiben");
  {
    psql("insert into public.knowledge_objects(id,vorgang_id,verstehen_fencing) values ('ko-vg-lease','vg-lease',2)");
    const veraltet = psql("update public.knowledge_objects set verstehen_fencing=1, status='alt'"
      + " where id='ko-vg-lease'", { erwarteFehler: true });
    check("6.1 Die Datenbank WEIST eine veraltete Fassung ab (nicht nur die Anwendung)",
      veraltet.ok === false && /helmut-verstehen-fencing-veraltet/.test(veraltet.out), veraltet.out.slice(0, 120));
    check("6.2 Der Bestand ist unveraendert (das neuere Ergebnis gilt weiter)",
      psql("select coalesce(status,'-')||'|'||verstehen_fencing from public.knowledge_objects where id='ko-vg-lease'").out === "-|2");
    // Und der Riegel gilt auch, wenn der neue Besitzer noch NICHT geschrieben hat:
    // die Reservierung ist die Wahrheit, nicht der zuletzt geschriebene Wert.
    reserviere("vg-frisch", "h1", "a1");
    leaseAblaufenLassen("vg-frisch");                 // a1 verschwindet VOR dem Modellstart
    const uebernahme = reserviere("vg-frisch", "h2", "a2");
    check("6.3a Die Uebernahme erhoeht den Fencing-Wert auf 2",
      uebernahme.erlaubt === true && uebernahme.fencing === 2, `${uebernahme.erlaubt}/${uebernahme.fencing}`);
    const zuFrueh = psql("insert into public.knowledge_objects(id,vorgang_id,verstehen_fencing)"
      + " values ('ko-vg-frisch','vg-frisch',1)", { erwarteFehler: true });
    check("6.3 Ein abgeloester Arbeiter kann gar nicht erst schreiben (Reservierung schlaegt Bestand)",
      zuFrueh.ok === false && /aktuelle Reservierung/.test(zuFrueh.out), zuFrueh.out.slice(0, 120));
    check("6.4 Der aktuelle Besitzer darf schreiben",
      psql("insert into public.knowledge_objects(id,vorgang_id,verstehen_fencing)"
        + " values ('ko-vg-frisch','vg-frisch',2)").ok === true);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · Absturz VOR dem Modellaufruf ist sicher wiederholbar");
  {
    const erst = reserviere("vg-crash-vor", "h1", "tot");
    leaseAblaufenLassen("vg-crash-vor");            // Prozess weg, KEIN Modellstart vermerkt
    const zweit = reserviere("vg-crash-vor", "h1", "lebend");
    check("7.1 Der naechste Arbeiter uebernimmt regulaer (kein Befund, keine Blockade)",
      zweit.erlaubt === true && zweit.zustand === "reserviert", `${zweit.erlaubt}/${zweit.zustand}/${zweit.grund}`);
    check("7.2 Der Fencing-Wert ist gestiegen", zweit.fencing === erst.fencing + 1, `${erst.fencing}->${zweit.fencing}`);
    check("7.3 Der Versuchszaehler ist gestiegen (die Wiederholung ist sichtbar)",
      psql("select versuche from public.helmut_verstehen_reservierungen where vorgang_id='vg-crash-vor'").out === "2");
    check("7.4 Es wurde KEIN Modellaufruf gezaehlt",
      psql("select ki_aufrufe from public.helmut_verstehen_reservierungen where vorgang_id='vg-crash-vor'").out === "0");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("8 · Absturz NACH dem Modellaufruf erzeugt keinen zweiten Aufruf");
  {
    reserviere("vg-crash-nach", "h1", "tot");
    psql("select public.helmut_verstehen_modellstart('vg-crash-nach','tot',1,300000)");
    leaseAblaufenLassen("vg-crash-nach");           // Prozess weg NACH dem Modellstart
    const naechster = reserviere("vg-crash-nach", "h1", "lebend");
    check("8.1 Der naechste Anlauf bekommt KEINE Berechtigung",
      naechster.erlaubt === false, `${naechster.erlaubt}/${naechster.grund}`);
    check("8.2 Der Grund ist der unbekannte Ausgang (sichtbar, nicht stumm)",
      naechster.grund === "ausgang-unbekannt", naechster.grund);
    check("8.3 Der Zustand ist geschlossen blockiert",
      psql("select zustand||'|'||letzter_grund from public.helmut_verstehen_reservierungen where vorgang_id='vg-crash-nach'").out
        === "unbekannt|absturz-nach-modellstart");
    const nochmal = reserviere("vg-crash-nach", "h1", "dritter");
    check("8.4 Auch weitere Anlaeufe bleiben blockiert (kein stilles Wiederholen)",
      nochmal.erlaubt === false && nochmal.grund === "ausgang-unbekannt", `${nochmal.erlaubt}/${nochmal.grund}`);
    check("8.5 Der Zaehler der Modellaufrufe bleibt bei 1 (keine Doppelbuchung)",
      psql("select ki_aufrufe from public.helmut_verstehen_reservierungen where vorgang_id='vg-crash-nach'").out === "1");
    check("8.6 Der Rueckstand ist ueber die Kennzahlen sichtbar (kein falsches Gruen)",
      Number(psql("select coalesce(sum(anzahl),0) from public.helmut_verstehen_kennzahlen() where zustand='unbekannt'").out) >= 1);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("9 · Idempotenz: dieselbe Eingabe, neue Eingabe");
  {
    reserviere("vg-idem", "hash-A", "w1");
    psql("select public.helmut_verstehen_modellstart('vg-idem','w1',1,300000)");
    psql("insert into public.knowledge_objects(id,vorgang_id,verstehen_fencing) values ('ko-vg-idem','vg-idem',1)");
    psql("select public.helmut_verstehen_abschluss('vg-idem','w1',1,'erg-1')");
    const gleich = reserviere("vg-idem", "hash-A", "w2");
    check("9.1 Dieselbe Eingabe wird NICHT erneut berechtigt",
      gleich.erlaubt === false && gleich.grund === "bereits-fertig", `${gleich.erlaubt}/${gleich.grund}`);
    check("9.2 Der Ergebnisbeleg wird mitgegeben",
      psql("select ergebnis_hash from public.helmut_verstehen_reservierungen where vorgang_id='vg-idem'").out === "erg-1");
    const anders = reserviere("vg-idem", "hash-B", "w3");
    check("9.3 Eine NEUE Eingabe wird zugelassen (Fortschreibung bleibt moeglich)",
      anders.erlaubt === true && anders.fencing === 2, `${anders.erlaubt}/${anders.fencing}`);
    // Und 20 gleichzeitige Wiederholungen derselben fertigen Eingabe kosten nichts.
    psql("select public.helmut_verstehen_abschluss('vg-idem','w3',2,'erg-2')");
    psql("update public.helmut_verstehen_reservierungen set eingabe_hash='hash-A' where vorgang_id='vg-idem'");
    const viele = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      psqlAsync(`select erlaubt from public.helmut_verstehen_reserviere('vg-idem','hash-A','x${i}',300000)`)));
    check("9.4 20 gleichzeitige Wiederholungen derselben Eingabe erzeugen 0 Berechtigungen",
      viele.filter((a) => a.out === "t").length === 0, String(viele.filter((a) => a.out === "t").length));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("10 · Vormerkungen: atomar erhoeht, bedingt geloescht");
  {
    const erhoehungen = await Promise.all(Array.from({ length: 20 }, () =>
      psqlAsync("select public.helmut_verstehen_vormerkung_erhoehe('vg-vm',1,1)")));
    check("10.1 20 gleichzeitige Erhoehungen ergeben genau 20 (kein verlorener Eintrag)",
      psql("select fehlversuche from public.helmut_verstehen_vormerkungen where vorgang_id='vg-vm'").out === "20",
      psql("select fehlversuche from public.helmut_verstehen_vormerkungen where vorgang_id='vg-vm'").out);
    check("10.2 Alle 20 Aufrufe endeten geschlossen", erhoehungen.every((a) => a.code === 0));
    psql("select public.helmut_verstehen_vormerkung_erhoehe('vg-vm',0,5)");
    check("10.3 delta=0 zaehlt keinen Fehlversuch (Budgetvertagung), hebt aber die Fencing-Marke",
      psql("select fehlversuche||'|'||letzte_fencing from public.helmut_verstehen_vormerkungen where vorgang_id='vg-vm'").out === "20|5");
    check("10.4 Ein ALTER Erfolgsmelder loescht die Vormerkung NICHT",
      psql("select public.helmut_verstehen_vormerkung_loese('vg-vm',4)").out === "f");
    check("10.5 Der aktuelle Lauf darf loeschen",
      psql("select public.helmut_verstehen_vormerkung_loese('vg-vm',5)").out === "t");
    check("10.6 Danach ist die Zeile weg",
      psql("select count(*) from public.helmut_verstehen_vormerkungen where vorgang_id='vg-vm'").out === "0");
    // Gezieltes Lesen mehrerer Vorgaenge (nie die ganze Karte).
    psql("select public.helmut_verstehen_vormerkung_erhoehe('vg-l1',2,1)");
    psql("select public.helmut_verstehen_vormerkung_erhoehe('vg-l2',3,1)");
    check("10.7 Gezieltes Lesen liefert genau die angefragten Vorgaenge",
      psql("select count(*) from public.helmut_verstehen_vormerkung_lese(array['vg-l1','vg-l2'])").out === "2");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("11 · Unbekannter Ausgang: Aufloesung");
  {
    // (a) Automatisch, wenn das Ergebnis doch belegt vorliegt.
    reserviere("vg-aufl-a", "h1", "tot");
    psql("select public.helmut_verstehen_modellstart('vg-aufl-a','tot',1,300000)");
    psql("insert into public.knowledge_objects(id,vorgang_id,verstehen_fencing) values ('ko-vg-aufl-a','vg-aufl-a',1)");
    leaseAblaufenLassen("vg-aufl-a");
    const auto = reserviere("vg-aufl-a", "h1", "neu");
    check("11.1 Liegt das Ergebnis belegt vor, loest der Vertrag SELBST auf (kein Betreiber, keine KI)",
      auto.erlaubt === false && auto.grund === "bereits-fertig", `${auto.erlaubt}/${auto.grund}`);
    check("11.2 Der Zustand steht danach auf fertig",
      psql("select zustand from public.helmut_verstehen_reservierungen where vorgang_id='vg-aufl-a'").out === "fertig");

    // (b) Ohne Ergebnis nur auf ausdrueckliche Entscheidung.
    reserviere("vg-aufl-b", "h1", "tot");
    psql("select public.helmut_verstehen_modellstart('vg-aufl-b','tot',1,300000)");
    leaseAblaufenLassen("vg-aufl-b");
    reserviere("vg-aufl-b", "h1", "neu");            // -> unbekannt
    check("11.3 Eine unbekannte Entscheidung aendert nichts",
      psql("select public.helmut_verstehen_ausgang_aufloesen('vg-aufl-b','irgendwas')").out === "entscheidung-unbekannt");
    check("11.4 Der Zustand ist unveraendert blockiert",
      psql("select zustand from public.helmut_verstehen_reservierungen where vorgang_id='vg-aufl-b'").out === "unbekannt");
    check("11.5 `aufgeben` beendet den Vorgang dauerhaft",
      psql("select public.helmut_verstehen_ausgang_aufloesen('vg-aufl-b','aufgeben')").out === "aufgegeben");
    const nachAufgabe = reserviere("vg-aufl-b", "h1", "spaeter");
    check("11.6 Ein aufgegebener Vorgang wird nie wieder berechtigt",
      nachAufgabe.erlaubt === false && nachAufgabe.grund === "aufgegeben", `${nachAufgabe.erlaubt}/${nachAufgabe.grund}`);
    check("11.7 `nicht-blockiert` wird gemeldet, wenn gar nichts aufzuloesen ist",
      psql("select public.helmut_verstehen_ausgang_aufloesen('vg-idem','erneut')").out === "nicht-blockiert");
    check("11.8 Ein unbekannter Vorgang wird als solcher gemeldet",
      psql("select public.helmut_verstehen_ausgang_aufloesen('gibt-es-nicht','erneut')").out === "unbekannter-vorgang");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("12 · Fehlerhafte Argumente stoppen geschlossen");
  {
    const ohneVorgang = psql("select * from public.helmut_verstehen_reserviere('', 'h','w',1000)", { erwarteFehler: true });
    check("12.1 Leere Vorgangskennung -> Fehler statt stillem Erfolg",
      ohneVorgang.ok === false && /p_vorgang_id ist Pflicht/.test(ohneVorgang.out));
    const ohneBesitzer = psql("select * from public.helmut_verstehen_reserviere('vg-x','h','',1000)", { erwarteFehler: true });
    check("12.2 Leere Besitzerkennung -> Fehler",
      ohneBesitzer.ok === false && /p_besitzer ist Pflicht/.test(ohneBesitzer.out));
    const ohneHash = psql("select * from public.helmut_verstehen_reserviere('vg-x','','w',1000)", { erwarteFehler: true });
    check("12.3 Leerer Eingabehash -> Fehler (ohne ihn gaebe es keine Idempotenz)",
      ohneHash.ok === false && /p_eingabe_hash ist Pflicht/.test(ohneHash.out));
    const falscherZustand = psql("update public.helmut_verstehen_reservierungen set zustand='irgendwas'"
      + " where vorgang_id='vg-idem'", { erwarteFehler: true });
    check("12.4 Ein unbekannter Zustand ist strukturell ausgeschlossen (check-Bedingung)",
      falscherZustand.ok === false && /helmut_verstehen_zustand_gueltig/.test(falscherZustand.out));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("13 · Fremde Schreibpfade bleiben unberuehrt");
  {
    psql("insert into public.knowledge_objects(id,vorgang_id,status) values ('ko-fremd','vg-fremd','neu')");
    check("13.1 Ein Wissensobjekt OHNE Fencing-Wert entsteht unveraendert",
      psql("select coalesce(verstehen_fencing::text,'null') from public.knowledge_objects where id='ko-fremd'").out === "null");
    check("13.2 Ein Teil-Update ohne Fencing-Spalte (Anreicherung/Matching) laeuft durch",
      psql("update public.knowledge_objects set status='angereichert' where id='ko-fremd'").ok === true);
    check("13.3 Auch bei GESETZTEM Fencing-Wert bleibt ein fremder Teil-Update erlaubt",
      psql("update public.knowledge_objects set status='gematcht' where id='ko-vg-idem'").ok === true);
    check("13.4 Ein gleich hoher Fencing-Wert darf erneut geschrieben werden (Wiederholung desselben Laufs)",
      psql("update public.knowledge_objects set verstehen_fencing=2 where id='ko-vg-lease'").ok === true);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("EINORDNUNG: echte PostgreSQL, echte Nebenlaeufigkeit (eigene Prozesse) — aber eine");
  console.log("WEGWERF-Datenbank. Das ist kein Production-Nachweis; Production bleibt unangetastet.");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.stack);
  process.exit(1);
});
