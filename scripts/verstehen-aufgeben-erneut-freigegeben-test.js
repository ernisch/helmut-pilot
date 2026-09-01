"use strict";

// Helmut — DATENBANKNACHWEIS der engen `aufgeben`-Erweiterung (Vertragslücke §30.2, 2026-08-23).
// =============================================================================================
// Prüft `supabase/migrations/20260823043633_verstehen_aufgeben_erneut_freigegeben.sql` an
// einer ECHTEN PostgreSQL (Muster wie scripts/verstehen-cas-datenbank-test.js — eigenständige
// `psql`-Prozesse, keine Attrappe). Anlass: `helmut_verstehen_ausgang_aufloesen` erlaubte
// `aufgeben` nur aus `unbekannt`; Runbook §30.2 verspricht den Betreiberabschluss aber auch
// für dauerhaft folgenlose `erneut`-Freigaben (Production-Fall df1a6700: `offen`,
// `letzter_grund='erneut-freigegeben'`, kein Wissensobjekt, keine Dokumente).
//
// Abnahmekriterien des Auftrags (2026-08-23), je Abschnitt:
//   §0  Vorbedingungen: die Migration ist ein Nachtrag — ohne CAS-Vertrag bricht sie laut ab
//   §1  `unbekannt` + pruefen/erneut/aufgeben/Auto-Auflösung: byte-gleiches Altverhalten
//   §2  Zielfall: `offen` + `erneut-freigegeben` ohne KO/Dokumente → `aufgegeben` (terminal)
//   §3  Ein beliebiger anderer offener Vorgang kann NICHT aufgegeben werden
//   §4  Aktive Lease / Besitzer / reserviert / modell-laeuft können NICHT aufgegeben werden
//   §5  Wissensobjekt oder verknüpfte Dokumente verhindern den neuen Abschluss
//   §6  versuche, ki_aufrufe, fencing, ergebnis_fencing bleiben unverändert
//   §7  Wiederholtes `aufgeben` ist idempotent (keine zweite Veränderung, auch updated_at)
//   §8  Parallelität: genau EIN Gewinner; aufgeben ⊕ reserviere, nie beides
//   §9  Rechte, search_path, SECURITY INVOKER und Signatur bleiben unverändert sicher
//   §10 Rückweg: Rollback stellt den Altvertrag her, erneutes Vorwärts die Erweiterung
//
// „Alle bisherigen Tests bleiben grün" (Abnahme 10 des Auftrags) beweist nicht diese Datei,
// sondern der kanonische Lauf `node scripts/run-offline-tests.js` plus der unveränderte
// Bestandsnachweis `scripts/verstehen-cas-datenbank-test.js` gegen dieselbe PostgreSQL.
//
// Ohne erreichbaren Server: ehrlicher Skip mit Exit 0 — der Nachweis ist dann OFFEN.
// Aufruf lokal: HELMUT_TEST_PG_HOST=127.0.0.1 node scripts/verstehen-aufgeben-erneut-freigegeben-test.js

const { execFileSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MIGRATION_CAS = path.join(ROOT, "supabase", "migrations", "20260814180000_verstehen_cas.sql");
const MIGRATION_NEU = path.join(ROOT, "supabase", "migrations", "20260823043633_verstehen_aufgeben_erneut_freigegeben.sql");
const ROLLBACK_NEU = path.join(ROOT, "supabase", "migrations", "rollback_20260823043633_verstehen_aufgeben_erneut_freigegeben.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_AUFGEBEN || "helmut_test_verstehen_aufgeben"
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

// ECHTE Nebenläufigkeit: ein eigener Betriebssystemprozess je Arbeiter.
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

// Kernschema wie in Production vorausgesetzt: knowledge_objects, raw_documents und die
// N:M-Verknüpfung ko_document_links (FK-Kaskade wie supabase/schema.sql).
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
  create table if not exists public.raw_documents (
    id text primary key,
    title text
  );
  create table if not exists public.ko_document_links (
    knowledge_object_id text not null references public.knowledge_objects(id) on delete cascade,
    raw_document_id text not null references public.raw_documents(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (knowledge_object_id, raw_document_id)
  );
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

function aufloese(vorgangId, entscheidung) {
  return psql(`select public.helmut_verstehen_ausgang_aufloesen('${vorgangId}','${entscheidung}')`).out;
}

function zeile(vorgangId) {
  const out = psql("select zustand||'|'||coalesce(letzter_grund,'<null>')||'|'||coalesce(besitzer,'<null>')"
    + "||'|'||coalesce(lease_bis::text,'<null>')||'|'||fencing||'|'||versuche||'|'||ki_aufrufe"
    + "||'|'||coalesce(ergebnis_fencing::text,'<null>')||'|'||coalesce(ergebnis_hash,'<null>')"
    + "||'|'||coalesce(eingabe_hash,'<null>')||'|'||updated_at::text"
    + ` from public.helmut_verstehen_reservierungen where vorgang_id='${vorgangId}'`).out;
  const [zustand, grund, besitzer, lease, fencing, versuche, kiAufrufe, ergFencing, ergHash, einHash, updatedAt] = out.split("|");
  return { zustand, grund, besitzer, lease, fencing, versuche, kiAufrufe, ergFencing, ergHash, einHash, updatedAt, roh: out };
}

// Der kanonische Weg in den §30.2-Zielzustand: Reservierung → Modellstart →
// ehrlicher unbekannter Ausgang → Betreiberentscheidung 'erneut'. Danach steht die
// Zeile exakt wie df1a6700: offen, erneut-freigegeben, kein Besitzer, keine Lease.
function freigegebenerVorgang(vorgangId, hash = "h1") {
  const r = reserviere(vorgangId, hash, "w1");
  psql(`select public.helmut_verstehen_modellstart('${vorgangId}','w1',${r.fencing},300000)`);
  psql(`select public.helmut_verstehen_ausgang_unbekannt('${vorgangId}','w1',${r.fencing},'modellfehler:test')`);
  const erneut = aufloese(vorgangId, "erneut");
  if (erneut !== "erneut-freigegeben") throw new Error(`Vorbereitung fehlgeschlagen: ${erneut}`);
  return r.fencing;
}

// Der §30.2-Listenfilter (zustand=offen UND letzter_grund=erneut-freigegeben) fuer EINEN
// Vorgang — andere legitim freigegebene Vorgaenge derselben Testdatenbank stoeren so nicht.
function inWiederaufnahmeListe(vorgangId) {
  return psql("select count(*) from public.helmut_verstehen_reservierungen"
    + " where zustand='offen' and letzter_grund='erneut-freigegeben'"
    + ` and vorgang_id='${vorgangId}'`).out;
}

async function main() {
  console.log("Helmut — Datenbanknachweis enge aufgeben-Erweiterung (Vertragslücke §30.2)");

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
  abschnitt("0 · Vorbedingungen: Nachtrag bricht ohne CAS-Vertrag laut ab");
  frischeDatenbank();
  const ohneBasis = psql(null, { datei: MIGRATION_NEU, erwarteFehler: true });
  check("0.1 Ohne 20260814180000 bricht die Migration mit klarer Meldung ab",
    !ohneBasis.ok && /helmut_verstehen_reservierungen fehlt/.test(ohneBasis.out), ohneBasis.out.slice(0, 200));
  check("0.2 Der Abbruch hinterlaesst KEINE alleinstehende Funktion",
    psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
      + " where n.nspname='public' and p.proname='helmut_verstehen_ausgang_aufloesen'").out === "0");
  psql(null, { datei: MIGRATION_CAS });
  psql(null, { datei: MIGRATION_NEU });
  check("0.3 Auf dem CAS-Vertrag laeuft die Migration fehlerfrei durch",
    psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
      + " where n.nspname='public' and p.proname='helmut_verstehen_ausgang_aufloesen'").out === "1");

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Altvertrag unveraendert: unbekannt + pruefen/erneut/aufgeben/Auto-Aufloesung");
  {
    const f = reserviere("vg-alt-a", "h1", "w1").fencing;
    psql(`select public.helmut_verstehen_modellstart('vg-alt-a','w1',${f},300000)`);
    psql(`select public.helmut_verstehen_ausgang_unbekannt('vg-alt-a','w1',${f},'timeout')`);
    check("1.1 pruefen aus unbekannt bleibt zustandsneutral ('entscheidung-unbekannt')",
      aufloese("vg-alt-a", "pruefen") === "entscheidung-unbekannt" && zeile("vg-alt-a").zustand === "unbekannt");
    check("1.2 aufgeben aus unbekannt funktioniert unveraendert",
      aufloese("vg-alt-a", "aufgeben") === "aufgegeben");
    const a = zeile("vg-alt-a");
    check("1.3 Alt-Marker bleibt 'aufgegeben' (nicht der neue Herkunftsmarker)",
      a.zustand === "aufgegeben" && a.grund === "aufgegeben", a.roh);

    const f2 = reserviere("vg-alt-b", "h1", "w1").fencing;
    psql(`select public.helmut_verstehen_modellstart('vg-alt-b','w1',${f2},300000)`);
    psql(`select public.helmut_verstehen_ausgang_unbekannt('vg-alt-b','w1',${f2},'timeout')`);
    check("1.4 erneut aus unbekannt funktioniert unveraendert",
      aufloese("vg-alt-b", "erneut") === "erneut-freigegeben" && zeile("vg-alt-b").zustand === "offen");

    const f3 = reserviere("vg-alt-c", "h1", "w1").fencing;
    psql(`select public.helmut_verstehen_modellstart('vg-alt-c','w1',${f3},300000)`);
    psql(`select public.helmut_verstehen_ausgang_unbekannt('vg-alt-c','w1',${f3},'timeout')`);
    psql("begin; select set_config('helmut.verstehen_cas','geprueft',true);"
      + ` insert into public.knowledge_objects (id, vorgang_id, verstehen_fencing) values ('ko-alt-c','vg-alt-c',${f3}); commit;`);
    check("1.5 Auto-Aufloesung bei belegtem Ergebnis geht weiterhin JEDER Entscheidung vor",
      aufloese("vg-alt-c", "aufgeben") === "aufgeloest-ergebnis-vorhanden" && zeile("vg-alt-c").zustand === "fertig");
    check("1.6 fertig + erneut bleibt 'nicht-blockiert' (Bestandsverhalten §11.7 der CAS-Suite)",
      aufloese("vg-alt-c", "erneut") === "nicht-blockiert");
    check("1.7 unbekannter Vorgang bleibt 'unbekannter-vorgang'",
      aufloese("vg-gibt-es-nicht", "aufgeben") === "unbekannter-vorgang");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Zielfall §30.2: offen + erneut-freigegeben ohne KO/Dokumente → aufgegeben");
  {
    freigegebenerVorgang("vg-ziel");
    const vorher = zeile("vg-ziel");
    check("2.1 Ausgangslage exakt wie df1a6700 (offen, Marker, kein Besitzer, keine Lease)",
      vorher.zustand === "offen" && vorher.grund === "erneut-freigegeben"
      && vorher.besitzer === "<null>" && vorher.lease === "<null>", vorher.roh);
    check("2.2 Der Vorgang steht in der §30.2-Wiederaufnahmeliste", inWiederaufnahmeListe("vg-ziel") === "1");
    check("2.3 aufgeben schliesst den Zielfall ('aufgegeben')",
      aufloese("vg-ziel", "aufgeben") === "aufgegeben");
    const nachher = zeile("vg-ziel");
    check("2.4 zustand='aufgegeben', Herkunftsmarker 'aufgegeben-nach-freigabe'",
      nachher.zustand === "aufgegeben" && nachher.grund === "aufgegeben-nach-freigabe", nachher.roh);
    check("2.5 Der Vorgang faellt aus der Wiederaufnahmeliste", inWiederaufnahmeListe("vg-ziel") === "0");
    const wieder = reserviere("vg-ziel", "h1", "w9");
    check("2.6 aufgegeben ist terminal: reserviere verweigert mit grund='aufgegeben'",
      wieder.erlaubt === false && wieder.grund === "aufgegeben");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · Ein beliebiger anderer offener Vorgang kann NICHT aufgegeben werden");
  {
    psql("insert into public.helmut_verstehen_reservierungen (vorgang_id) values ('vg-offen-pur')");
    check("3.1 offen ohne jeden Grund (frische Ankerzeile): 'nicht-blockiert'",
      aufloese("vg-offen-pur", "aufgeben") === "nicht-blockiert" && zeile("vg-offen-pur").zustand === "offen");

    const fr = reserviere("vg-offen-freigabe", "h1", "w1");
    psql(`select public.helmut_verstehen_freigabe('vg-offen-freigabe','w1',${fr.fencing},'kein-ergebnis-vor-modellstart')`);
    check("3.2 offen nach regulaerer App-Freigabe: 'nicht-blockiert'",
      aufloese("vg-offen-freigabe", "aufgeben") === "nicht-blockiert"
      && zeile("vg-offen-freigabe").grund === "kein-ergebnis-vor-modellstart");

    const fo = reserviere("vg-offen-budget", "h1", "w1");
    psql(`select public.helmut_verstehen_modellstart('vg-offen-budget','w1',${fo.fencing},300000)`);
    psql(`select public.helmut_verstehen_freigabe_ohne_aufruf('vg-offen-budget','w1',${fo.fencing},'budget')`);
    check("3.3 offen nach belegter Nicht-Absendung ('belegt-ohne-aufruf:budget'): 'nicht-blockiert'",
      aufloese("vg-offen-budget", "aufgeben") === "nicht-blockiert"
      && zeile("vg-offen-budget").grund === "belegt-ohne-aufruf:budget");

    freigegebenerVorgang("vg-offen-marker");
    check("3.4 pruefen/erneut auf dem markierten Vorgang bleiben 'nicht-blockiert' (kein Doppelweg)",
      aufloese("vg-offen-marker", "pruefen") === "nicht-blockiert"
      && aufloese("vg-offen-marker", "erneut") === "nicht-blockiert"
      && zeile("vg-offen-marker").zustand === "offen");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · Aktive Lease, Besitzer, reserviert, modell-laeuft: kein aufgeben");
  {
    reserviere("vg-lease", "h1", "w1");
    check("4.1 reserviert mit lebender Lease: 'nicht-blockiert'",
      aufloese("vg-lease", "aufgeben") === "nicht-blockiert" && zeile("vg-lease").zustand === "reserviert");

    const fm = reserviere("vg-laeuft", "h1", "w1").fencing;
    psql(`select public.helmut_verstehen_modellstart('vg-laeuft','w1',${fm},300000)`);
    check("4.2 modell-laeuft: 'nicht-blockiert' (kein Abbruch eines bezahlten Aufrufs)",
      aufloese("vg-laeuft", "aufgeben") === "nicht-blockiert" && zeile("vg-laeuft").zustand === "modell-laeuft");

    // Vertragswidrig verfaelschte Zeilen (nur per Direkt-SQL herstellbar): der
    // Zweitriegel verweigert, statt sich auf die Unerreichbarkeit zu verlassen.
    freigegebenerVorgang("vg-besitz");
    psql("update public.helmut_verstehen_reservierungen set besitzer='geist' where vorgang_id='vg-besitz'");
    check("4.3 offen + Marker, aber Besitzer gesetzt: 'aufgeben-verweigert-besitz'",
      aufloese("vg-besitz", "aufgeben") === "aufgeben-verweigert-besitz" && zeile("vg-besitz").zustand === "offen");

    freigegebenerVorgang("vg-altlease");
    psql("update public.helmut_verstehen_reservierungen set lease_bis=now()-interval '1 hour' where vorgang_id='vg-altlease'");
    check("4.4 offen + Marker, aber Lease-Feld belegt (selbst abgelaufen): 'aufgeben-verweigert-besitz'",
      aufloese("vg-altlease", "aufgeben") === "aufgeben-verweigert-besitz" && zeile("vg-altlease").zustand === "offen");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Wissensobjekt oder verknuepfte Dokumente verhindern den neuen Abschluss");
  {
    freigegebenerVorgang("vg-mit-ko");
    psql("insert into public.knowledge_objects (id, vorgang_id, status) values ('ko-1','vg-mit-ko','complete')");
    check("5.1 offen + Marker, aber KO vorhanden: 'aufgeben-verweigert-dokumentgrundlage'",
      aufloese("vg-mit-ko", "aufgeben") === "aufgeben-verweigert-dokumentgrundlage");
    const mk = zeile("vg-mit-ko");
    check("5.2 Zeile unveraendert offen + markiert (bleibt dem Wiederaufnahmepfad erhalten)",
      mk.zustand === "offen" && mk.grund === "erneut-freigegeben", mk.roh);

    freigegebenerVorgang("vg-mit-doku");
    psql("insert into public.knowledge_objects (id, vorgang_id, status) values ('ko-2','vg-mit-doku','complete');"
      + " insert into public.raw_documents (id, title) values ('doc-1','Beleg');"
      + " insert into public.ko_document_links (knowledge_object_id, raw_document_id) values ('ko-2','doc-1')");
    check("5.3 offen + Marker, KO MIT Dokumentverknuepfung: 'aufgeben-verweigert-dokumentgrundlage'",
      aufloese("vg-mit-doku", "aufgeben") === "aufgeben-verweigert-dokumentgrundlage"
      && zeile("vg-mit-doku").zustand === "offen");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · Zaehler und Werte bleiben unveraendert (versuche, ki_aufrufe, fencing, ergebnis_*)");
  {
    freigegebenerVorgang("vg-zaehler");
    const vor = zeile("vg-zaehler");
    check("6.1 Ausgangslage: versuche=1, ki_aufrufe=1, fencing=1 (ein bezahlter Fehlversuch)",
      vor.versuche === "1" && vor.kiAufrufe === "1" && vor.fencing === "1", vor.roh);
    aufloese("vg-zaehler", "aufgeben");
    const nach = zeile("vg-zaehler");
    check("6.2 aufgeben veraendert weder Zaehler noch Fencing noch Ergebnisfelder",
      nach.versuche === vor.versuche && nach.kiAufrufe === vor.kiAufrufe
      && nach.fencing === vor.fencing && nach.ergFencing === vor.ergFencing
      && nach.ergHash === vor.ergHash && nach.einHash === vor.einHash,
      `vorher ${vor.roh} nachher ${nach.roh}`);
    check("6.3 Nur zustand und letzter_grund wurden geschrieben",
      nach.zustand === "aufgegeben" && nach.grund === "aufgegeben-nach-freigabe"
      && nach.besitzer === "<null>" && nach.lease === "<null>");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · Wiederholtes aufgeben ist idempotent");
  {
    freigegebenerVorgang("vg-idem");
    check("7.1 Erstes aufgeben: 'aufgegeben'", aufloese("vg-idem", "aufgeben") === "aufgegeben");
    const erste = zeile("vg-idem");
    check("7.2 Zweites aufgeben: 'nicht-blockiert' (keine zweite Zustandsaenderung)",
      aufloese("vg-idem", "aufgeben") === "nicht-blockiert");
    const zweite = zeile("vg-idem");
    check("7.3 Zeile byte-gleich, auch updated_at (kein stiller Zweitschreibvorgang)",
      erste.roh === zweite.roh, `erste ${erste.roh} zweite ${zweite.roh}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("8 · Parallelitaet: genau ein Gewinner, nie ein widerspruechlicher Zustand");
  {
    freigegebenerVorgang("vg-par");
    const N = 12;
    const antworten = await Promise.all(Array.from({ length: N }, () =>
      psqlAsync("select public.helmut_verstehen_ausgang_aufloesen('vg-par','aufgeben')")));
    const gewonnen = antworten.filter((a) => a.out === "aufgegeben").length;
    const abgewiesen = antworten.filter((a) => a.out === "nicht-blockiert").length;
    check(`8.1 ${N} gleichzeitige aufgeben: genau EINES gewinnt`,
      gewonnen === 1 && abgewiesen === N - 1, `gewonnen=${gewonnen} abgewiesen=${abgewiesen}`);
    check("8.2 Endzustand aufgegeben, Zaehler unveraendert 1/1",
      (() => { const z = zeile("vg-par"); return z.zustand === "aufgegeben" && z.versuche === "1" && z.kiAufrufe === "1"; })());

    // Wettrennen aufgeben ↔ reserviere ueber mehrere Runden: der Row-Lock serialisiert;
    // je Runde gewinnt exakt eine Seite, nie beide, nie keine mit Wirkung.
    let widerspruch = 0;
    for (let runde = 0; runde < 6; runde += 1) {
      const vg = `vg-rennen-${runde}`;
      freigegebenerVorgang(vg);
      const [auf, res] = await Promise.all([
        psqlAsync(`select public.helmut_verstehen_ausgang_aufloesen('${vg}','aufgeben')`),
        psqlAsync(`select erlaubt||'|'||grund from public.helmut_verstehen_reserviere('${vg}','h2','w-rennen',300000)`)
      ]);
      const aufGewann = auf.out === "aufgegeben";
      // `erlaubt||'|'||grund` castet den Boolean nach text ('true'/'false'), nicht in
      // psqls Anzeigeform ('t'/'f'). Mit /^t\|/ wurde eine gewonnene Reservierung nie
      // erkannt und als Widerspruch gezaehlt. Beide Formen gelten, damit der Test nicht
      // an der Ausgabeform haengt.
      const resGewann = /^(t|true)\|/.test(res.out);
      const endzustand = zeile(vg).zustand;
      const konsistent = (aufGewann && !resGewann && endzustand === "aufgegeben" && /aufgegeben/.test(res.out))
        || (!aufGewann && resGewann && endzustand === "reserviert" && auf.out === "nicht-blockiert");
      if (!konsistent) {
        widerspruch += 1;
        console.log(`        Runde ${runde}: aufgeben='${auf.out}' reserviere='${res.out}' endzustand='${endzustand}'`);
      }
    }
    check("8.3 6 Wettrennen aufgeben ↔ reserviere: jede Runde exakt EIN Gewinner, Endzustand passt",
      widerspruch === 0, `${widerspruch} widerspruechliche Runden`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("9 · Rechte, search_path, SECURITY INVOKER und Signatur unveraendert");
  {
    const meta = psql("select prosecdef||'|'||coalesce(array_to_string(proconfig,';'),'<leer>')"
      + "||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)"
      + " from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
      + " where n.nspname='public' and p.proname='helmut_verstehen_ausgang_aufloesen'").out;
    check("9.1 SECURITY INVOKER (prosecdef=false)", /^false\|/.test(meta), meta);
    check("9.2 search_path fest auf public, pg_temp", /search_path=public, pg_temp/.test(meta), meta);
    check("9.3 Signatur unveraendert (p_vorgang_id text, p_entscheidung text) → text",
      /p_vorgang_id text, p_entscheidung text\|text$/.test(meta), meta);
    check("9.4 Keine Rechte fuer PUBLIC/anon/authenticated",
      psql("select count(*) from information_schema.routine_privileges"
        + " where routine_schema='public' and routine_name='helmut_verstehen_ausgang_aufloesen'"
        + " and grantee in ('PUBLIC','anon','authenticated')").out === "0");
    check("9.5 service_role behaelt EXECUTE",
      psql("select has_function_privilege('service_role',"
        + "'public.helmut_verstehen_ausgang_aufloesen(text, text)','execute')").out === "t");
    const alsAnon = psql("set role anon; select public.helmut_verstehen_ausgang_aufloesen('x','aufgeben')",
      { erwarteFehler: true });
    check("9.6 anon kann die Funktion nicht ausfuehren (permission denied)",
      !alsAnon.ok && /permission denied|keine Berechtigung/i.test(alsAnon.out), alsAnon.out.slice(0, 120));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("10 · Rueckweg: Rollback stellt den Altvertrag her, erneutes Vorwaerts die Erweiterung");
  {
    freigegebenerVorgang("vg-rollback");
    psql(null, { datei: ROLLBACK_NEU });
    check("10.1 Nach dem Rollback ist aufgeben aus offen wieder unmoeglich ('nicht-blockiert')",
      aufloese("vg-rollback", "aufgeben") === "nicht-blockiert" && zeile("vg-rollback").zustand === "offen");
    const fx = reserviere("vg-rollback-unbekannt", "h1", "w1").fencing;
    psql(`select public.helmut_verstehen_modellstart('vg-rollback-unbekannt','w1',${fx},300000)`);
    psql(`select public.helmut_verstehen_ausgang_unbekannt('vg-rollback-unbekannt','w1',${fx},'timeout')`);
    check("10.2 Der Altvertrag traegt weiter: aufgeben aus unbekannt funktioniert",
      aufloese("vg-rollback-unbekannt", "aufgeben") === "aufgegeben");
    check("10.3 Bereits geschlossene Zeilen bleiben nach dem Rollback unveraendert aufgegeben",
      zeile("vg-idem").zustand === "aufgegeben" && zeile("vg-idem").grund === "aufgegeben-nach-freigabe");
    const rechteNachRollback = psql("select count(*) from information_schema.routine_privileges"
      + " where routine_schema='public' and routine_name='helmut_verstehen_ausgang_aufloesen'"
      + " and grantee in ('PUBLIC','anon','authenticated')").out;
    check("10.4 Auch nach dem Rollback keine Rechte fuer PUBLIC/anon/authenticated",
      rechteNachRollback === "0", `grants=${rechteNachRollback}`);
    psql(null, { datei: MIGRATION_NEU });
    check("10.5 Erneutes Vorwaerts stellt die Erweiterung wieder her (Zielfall schliessbar)",
      aufloese("vg-rollback", "aufgeben") === "aufgegeben");
  }

  console.log("\n== ERGEBNIS ==");
  console.log(`PASS ${pass}  FAIL ${fail}`);
  console.log("Hinweis: 'alle bisherigen Tests bleiben gruen' belegt der kanonische Lauf");
  console.log("node scripts/run-offline-tests.js plus scripts/verstehen-cas-datenbank-test.js.");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Testlauf abgebrochen:", error && error.message);
  process.exit(1);
});
