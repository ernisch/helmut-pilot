"use strict";

// Helmut — DATENBANKNACHWEIS des EINZEILENVERTRAGS (Stoerung 2026-08-24, Runbook §31.6).
// =============================================================================================
// WOFUER DIESE SUITE DA IST:
//
//   Ein Handlauf der Bestandssuite `jobdispatch-vertrag-test.js` OHNE `scripts/lokal.js` hat am
//   2026-08-24 je EINE Zeile in `helmut_jobs` und `helmut_job_outbox` der Production erzeugt.
//   Die spaetere Massnahme heisst ehrlich: LOESCHEN genau dieser beiden Zeilen — nicht
//   „aufgeben" (der Status `aufgegeben` gehoert zur Outbox-Versandabsicht, nicht zum Auftrag).
//
//   Das ist eine PRODUCTION-DATENAENDERUNG und freigabepflichtig (CLAUDE.md §5). Sie darf erst
//   ausgefuehrt werden, wenn jeder Riegel NACHWEISLICH haelt. Diese Suite fuehrt exakt das SQL
//   aus, das `lib/helmut/jobqueue-neutralisierung.js` fuer den EINZEILENVERTRAG erzeugt, gegen
//   eine WEGWERFBARE lokale PostgreSQL. PRODUCTION WIRD NICHT BERUEHRT.
//
//   Ohne erreichbaren lokalen Server meldet sie den Nachweis ausdruecklich als OFFEN und endet
//   mit Exit 0 — kein vorgetaeuschtes Gruen (Regel wie `jobqueue-datenbank-test.js`).
//
// DIE DREIZEHN PFLICHTNACHWEISE:
//    1. Standard-Trockenlauf rollt vollstaendig zurueck
//    2. beide Zielzeilen bestehen nach dem Trockenlauf weiter
//    3. fremde Zeilen bleiben nach dem Trockenlauf unveraendert
//    4. scharfer Modus loescht exakt eine Auftragszeile und exakt ihre eine Outbox-Zeile
//    5. fremde Zeilen bleiben auch nach dem scharfen Lauf unveraendert
//    6. veraenderte Kennung stoppt (Auftrag UND Outbox getrennt geprueft)
//    7. veraenderter Status stoppt
//    8. veraenderte Versuchszahl stoppt
//    9. aktive Lease stoppt
//   10. veraenderte Nutzlast stoppt
//   11. zusaetzliche Outbox-Zeile stoppt
//   12. fehlende Kaskade stoppt
//   13. Wiederholung nach erfolgreicher Neutralisierung veraendert nichts
//
// DAZU: Datensparsamkeit (keine Ausgabe traegt Werte aus payload/tenant_id/idempotency_key/
// last_error), Zielbegrenzung (genau eine Loeschanweisung, ausschliesslich ueber die
// Auftragskennung) und die Trennung von den beiden Sammelvertraegen.
//
// KONFIGURATION (alles ueber Env, keine Geheimnisse):
//   HELMUT_TEST_PG_HOST  Socket-Verzeichnis oder Host (ohne Wert -> Suite uebersprungen)
//   HELMUT_TEST_PG_PORT  Default 5433 · HELMUT_TEST_PG_USER Default helmut
//   HELMUT_TEST_PG_DB_EINZEILEN  Default helmut_test_einzeilen
//
// OFFLINE: `psql` verbindet ausschliesslich lokal. Kein Netz, keine KI, keine Kosten.
// Aufruf: node scripts/lokal.js -- node scripts/jobqueue-einzeilen-neutralisierung-datenbank-test.js

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const N = require(path.join(ROOT, "lib/helmut/jobqueue-neutralisierung.js"));

const MIGRATIONEN = [
  "20260808_scalable_job_queue.sql",
  "20260809_jobqueue_wiedervorlage.sql",
  "20260813090000_jobqueue_outbox.sql"
].map((f) => path.join(ROOT, "supabase", "migrations", f));

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_EINZEILEN || "helmut_test_einzeilen"
};

const V = N.EINZEILEN_VERTRAG_TESTZEILE;
const ZIEL_AUFTRAG = V.auftrag.id;
const ZIEL_OUTBOX = V.outbox.id;

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// Jede psql-Ausgabe wird gesammelt: keine einzige darf einen Wert aus einer sensiblen Spalte
// tragen (Kanarien-Beweis wie in der Sammelsuite).
const ALLE_AUSGABEN = [];
function psqlRoh(args, { erlaubeFehler = false } = {}) {
  try {
    const out = execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    ALLE_AUSGABEN.push(out);
    return { ok: true, out, err: "" };
  } catch (error) {
    if (!erlaubeFehler) throw error;
    const out = String(error.stdout || "").trim();
    const err = String(error.stderr || "").trim();
    ALLE_AUSGABEN.push(out, err);
    return { ok: false, out, err };
  }
}
function basisArgs(db = PG.db) {
  return ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-v", "ON_ERROR_STOP=1", "-tAq"];
}
function sql(text, opts = {}) { return psqlRoh([...basisArgs(), "-c", text], opts); }
function datei(pfad, opts = {}) { return psqlRoh([...basisArgs(), "-f", pfad], opts); }
let skriptNr = 0;
function skript(text, { erlaubeFehler = false } = {}) {
  skriptNr += 1;
  const tmp = path.join(os.tmpdir(), `helmut-einzeilen-${process.pid}-${skriptNr}.sql`);
  fs.writeFileSync(tmp, text, "utf8");
  try {
    return psqlRoh([...basisArgs(), "-f", tmp], { erlaubeFehler });
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) { /* egal */ }
  }
}
function servererreichbar() {
  if (!PG.host) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", "select 1"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

// ── Der Bestand: die zwei exakten Zielzeilen PLUS fremde Zeilen, die unberuehrt bleiben ──────
// Die fremden Zeilen sind bewusst „aehnlich": derselbe Auftragstyp, derselbe Status, dieselbe
// Prioritaet. Nur die Kennung unterscheidet sie — genau daran muss sich der Vertrag halten.
const A = V.auftrag;
const O = V.outbox;
const FREMD_AUFTRAG_1 = "11111111-1111-4111-8111-111111111111";
const FREMD_AUFTRAG_2 = "22222222-2222-4222-8222-222222222222";
const FREMD_OUTBOX_1 = "33333333-3333-4333-8333-333333333333";
const FREMD_OUTBOX_2 = "44444444-4444-4444-8444-444444444444";

const BESTAND_SQL = `
-- Erst die Absichten, dann die Auftraege: der Bestandsaufbau muss auch dann funktionieren,
-- wenn ein Negativtest die Kaskade voruebergehend entfernt hat.
delete from public.helmut_job_outbox;
delete from public.helmut_jobs;
-- (1) DIE ZIELZEILE — der belegte ENDZUSTAND aus der Production-Lesepruefung vom 2026-08-25,
-- 07:48:39 Uhr tuerkischer Zeit (06:48:39 Berlin, 04:48:39 UTC): terminal gescheitert, nachdem
-- der regulaere Betrieb sie um 07:01 Uhr tuerkischer Zeit (06:01 Berlin, 04:01 UTC) aufgenommen
-- hatte. Der Fehlertext ist eine EINGABE des Bestandsaufbaus und wird nie ausgegeben (§15).
insert into public.helmut_jobs
  (id, job_type, idempotency_key, freshness_window, payload, status, attempts, max_attempts,
   priority, tenant_id, last_error, lease_owner, lease_expires_at, first_claimed_at,
   finished_at, wiedervorlagen, due_at, first_due_at, created_at)
values ('${A.id}'::uuid, '${A.jobType}', '${A.idempotenzschluessel}', '${A.aktualitaetsfenster}',
        '{}'::jsonb, '${A.status}', ${A.versuche}, ${A.maxVersuche}, ${A.prioritaet},
        null, '${A.fehlertext}', null, null,
        timestamptz '${A.ersteBeanspruchung}', timestamptz '${A.abschluss}', ${A.wiedervorlagen},
        timestamptz '${A.faelligAb}', timestamptz '${A.ersteFaelligkeit}',
        timestamptz '${A.erstelltAm}');
-- Der Trigger helmut_job_outbox_kappen_trg setzt updated_at bei JEDEM Schreibvorgang auf
-- now(). Der Vertragswert wird deshalb NACH dem Einfuegen gesetzt — mit ausgeschaltetem
-- Trigger, sonst waere der Aenderungsmelder nicht herstellbar.
insert into public.helmut_job_outbox
  (id, job_id, schema_version, status, transport, attempts, max_attempts, last_error,
   next_attempt_at, sent_at, confirmed_at, created_at)
values ('${O.id}'::uuid, '${A.id}'::uuid, ${O.schemaVersion}, '${O.status}', '${O.transport}',
        ${O.versuche}, ${O.maxVersuche}, null,
        timestamptz '${O.naechsterVersuchAb}', timestamptz '${O.versendetAm}',
        timestamptz '${O.bestaetigtAm}', timestamptz '${O.erstelltAm}');
alter table public.helmut_job_outbox disable trigger helmut_job_outbox_kappen_trg;
update public.helmut_job_outbox set updated_at = timestamptz '${O.aktualisiertAm}'
 where id = '${O.id}'::uuid;
alter table public.helmut_job_outbox enable trigger helmut_job_outbox_kappen_trg;
-- (2) FREMDE, ECHTE ARBEIT — sie muss jeden Lauf unveraendert ueberstehen.
insert into public.helmut_jobs
  (id, job_type, idempotency_key, freshness_window, payload, status, attempts, max_attempts,
   priority, tenant_id, due_at, first_due_at, created_at)
values ('${FREMD_AUFTRAG_1}'::uuid, 'source_fetch', 'geteilt-echt-1', '2026-08-24T20Z',
        jsonb_build_object('quelle', jsonb_build_object('id', 'echte-quelle-1')), 'wartend', 0, 5, 100,
        null, timestamptz '2026-08-24 20:00:00+00', timestamptz '2026-08-24 20:00:00+00',
        timestamptz '2026-08-24 19:00:00+00'),
       ('${FREMD_AUFTRAG_2}'::uuid, 'document_understanding', 'verstehen-echt-1', '2026-08-24T20Z',
        jsonb_build_object('dokumentIds', jsonb_build_array('rd-echt-1')), 'wartend', 1, 5, 80,
        'mandat-echt', timestamptz '2026-08-24 20:10:00+00', timestamptz '2026-08-24 20:10:00+00',
        timestamptz '2026-08-24 19:10:00+00');
insert into public.helmut_job_outbox
  (id, job_id, schema_version, status, attempts, max_attempts, next_attempt_at, created_at)
values ('${FREMD_OUTBOX_1}'::uuid, '${FREMD_AUFTRAG_1}'::uuid, 1, 'offen', 0, 10,
        timestamptz '2026-08-24 20:00:01+00', timestamptz '2026-08-24 20:00:01+00'),
       ('${FREMD_OUTBOX_2}'::uuid, '${FREMD_AUFTRAG_2}'::uuid, 1, 'bestaetigt', 1, 10,
        timestamptz '2026-08-24 20:10:01+00', timestamptz '2026-08-24 20:10:01+00');`;

// Zustandsabfrage: Zaehler, Existenz der Zielzeilen und eine Signatur ueber die FREMDEN Zeilen.
// Die Signatur benutzt ausschliesslich technische Spalten — nie payload/tenant_id/…
const ZUSTAND_SQL = `select
  (select count(*) from public.helmut_jobs)                                        as jobs,
  (select count(*) from public.helmut_job_outbox)                                  as outbox,
  (select count(*) from public.helmut_jobs where id = '${ZIEL_AUFTRAG}'::uuid)      as ziel_job,
  (select count(*) from public.helmut_job_outbox where id = '${ZIEL_OUTBOX}'::uuid) as ziel_outbox,
  (select coalesce(md5(string_agg(id||'|'||status||'|'||job_type||'|'||attempts, ',' order by id)), 'leer')
     from public.helmut_jobs where id <> '${ZIEL_AUFTRAG}'::uuid)                   as fremd_jobs_sig,
  (select coalesce(md5(string_agg(id||'|'||status||'|'||attempts, ',' order by id)), 'leer')
     from public.helmut_job_outbox where id <> '${ZIEL_OUTBOX}'::uuid)              as fremd_outbox_sig;`;

function zustand() {
  const [jobs, outbox, zielJob, zielOutbox, fremdJobs, fremdOutbox] = sql(ZUSTAND_SQL).out.split("|");
  return {
    jobs: Number(jobs), outbox: Number(outbox),
    zielJob: Number(zielJob), zielOutbox: Number(zielOutbox),
    fremdJobs, fremdOutbox
  };
}
function bestandHerstellen() { skript(BESTAND_SQL); return zustand(); }

// Ein negativer Fall: Bestand herstellen, gezielt EINE Abweichung setzen, Trockenlauf UND
// scharfen Lauf fahren — beide muessen abbrechen, und danach muss ALLES unveraendert sein.
function stopptBei(name, abweichungSql, erwarteterAbbruch) {
  const vorher = bestandHerstellen();
  if (abweichungSql) skript(abweichungSql);
  const nachAbweichung = zustand();
  const trocken = skript(N.einzeilenNeutralisierungSql(V), { erlaubeFehler: true });
  const scharf = skript(N.einzeilenNeutralisierungSql(V, { modus: "scharf" }), { erlaubeFehler: true });
  const nachher = zustand();
  const meldung = `${trocken.err}\n${scharf.err}`;
  const beideAbgebrochen = trocken.ok === false && scharf.ok === false;
  const richtigerGrund = erwarteterAbbruch.test(meldung);
  const nichtsVeraendert = nachher.jobs === nachAbweichung.jobs
    && nachher.outbox === nachAbweichung.outbox
    && nachher.zielJob === nachAbweichung.zielJob
    && nachher.zielOutbox === nachAbweichung.zielOutbox
    && nachher.fremdJobs === nachAbweichung.fremdJobs
    && nachher.fremdOutbox === nachAbweichung.fremdOutbox;
  check(name, beideAbgebrochen && richtigerGrund && nichtsVeraendert,
    `abgebrochen=${beideAbgebrochen} grund=${richtigerGrund} unveraendert=${nichtsVeraendert}`
    + ` | ${meldung.replace(/\s+/g, " ").slice(0, 180)}`);
  return { vorher, nachher };
}

function main() {
  console.log("Helmut — Datenbanknachweis EINZEILENVERTRAG (Testzeile, ENDZUSTAND 2026-08-25)");
  console.log("HINWEIS: lokale Wegwerf-Datenbank. Production wird NICHT beruehrt.\n");

  if (!servererreichbar()) {
    console.log("== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt");
    console.log("  oder Verbindung nicht moeglich).");
    console.log("  >> DER DATENBANKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("\n== ERGEBNIS ==\nPASS 0  FAIL 0  (uebersprungen, Nachweis offen)");
    process.exit(0);
  }

  psqlRoh([...basisArgs("postgres"), "-c", `drop database if exists ${PG.db}`]);
  psqlRoh([...basisArgs("postgres"), "-c", `create database ${PG.db}`]);
  sql(`do $$ begin
    if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$;`);
  for (const m of MIGRATIONEN) datei(m);

  // ── 0 · Vertrag und erzeugtes SQL ──────────────────────────────────────────────────────────
  abschnitt("0 · Der Einzeilenvertrag steht getrennt neben den Sammelvertraegen");
  const trockenSql = N.einzeilenNeutralisierungSql(V);
  const scharfSql = N.einzeilenNeutralisierungSql(V, { modus: "scharf" });
  check("0.1 Trockenlauf ist der Standardmodus (ohne Argument)",
    trockenSql === N.einzeilenNeutralisierungSql(V, { modus: "trockenlauf" }));
  check("0.2 Der Trockenlauf endet bauartbedingt im Abbruch (TROCKENLAUF-OK) und committet nie",
    /TROCKENLAUF-OK/.test(trockenSql) && !/\ncommit;/.test(trockenSql) && /\nrollback;/.test(trockenSql));
  check("0.3 Der scharfe Modus muss ausdruecklich benannt werden und committet dann",
    /\ncommit;/.test(scharfSql) && !/TROCKENLAUF-OK/.test(scharfSql));
  check("0.4 GENAU EINE Loeschanweisung, ausschliesslich ueber die Auftragskennung",
    (scharfSql.match(/delete\s+from/gi) || []).length === 1
    && new RegExp(`delete from public\\.helmut_jobs where id = '${ZIEL_AUFTRAG}'::uuid;`).test(scharfSql));
  check("0.5 KEINE Zeitgrenze als Zielmenge (Unterschied zu den beiden Sammelvertraegen)",
    !/(created_at|due_at|first_due_at|next_attempt_at|first_claimed_at|finished_at|sent_at|confirmed_at)\s*(<|>|<=|>=)/.test(scharfSql));
  check("0.6 SERIALIZABLE und Sperre ausschliesslich der beiden Zielzeilen",
    /begin isolation level serializable;/.test(scharfSql)
    && (scharfSql.match(/for update/g) || []).length === 2
    && new RegExp(`from public\\.helmut_jobs where id = '${ZIEL_AUFTRAG}'::uuid for update`).test(scharfSql)
    && new RegExp(`from public\\.helmut_job_outbox where id = '${ZIEL_OUTBOX}'::uuid for update`).test(scharfSql));
  check("0.7 Die Sammelvertraege sind unveraendert erreichbar (keine Rueckwirkung)",
    typeof N.neutralisierungSql === "function" && typeof N.neutralisierungGemischtSql === "function"
    && /created_at < timestamptz/.test(N.neutralisierungSql()));
  check("0.8 Ein verformter Vertrag erzeugt KEIN SQL (fail closed)", (() => {
    for (const kaputt of [
      { ...V, auftrag: { ...V.auftrag, id: "keine-uuid" } },
      { ...V, auftrag: { ...V.auftrag, status: "laeuft" } },
      { ...V, auftrag: { ...V.auftrag, versuche: 1 } },
      { ...V, auftrag: { ...V.auftrag, fehlertext: "" } },
      { ...V, outbox: { ...V.outbox, transport: "" } },
      { ...V, outbox: { ...V.outbox, aktualisiertAm: "kein-zeitstempel" } },
      { ...V, outbox: { ...V.outbox, status: "versendet" } },
      { ...V, outbox: { ...V.outbox, status: "aufgegeben" } },
      { ...V, fremdschluessel: { ...V.fremdschluessel, loeschregel: "a" } }
    ]) {
      try { N.einzeilenNeutralisierungSql(kaputt); return false; } catch (_) { /* erwartet */ }
    }
    return true;
  })());
  check("0.9 Jeder FRUEHERE Zustand (wartend / offen / bestaetigt) wird ausdruecklich abgelehnt", (() => {
    const veraltet = [
      { ...V, auftrag: { ...V.auftrag, status: "wartend", versuche: 0 } },
      { ...V, outbox: { ...V.outbox, status: "offen" } },
      // `bestaetigt` war der Zustand VOR dem kanonischen Abgleich vom 2026-08-25,
      // 08:56:14 Uhr tuerkischer Zeit (07:56:14 Berlin, 05:56:14 UTC).
      { ...V, outbox: { ...V.outbox, status: "bestaetigt" } }
    ];
    for (const alt of veraltet) {
      try { N.einzeilenNeutralisierungSql(alt); return false; }
      catch (e) { if (!/veraltet/i.test(String(e.message))) return false; }
    }
    return true;
  })());
  check("0.10 Der Vertrag beschreibt den KANONISCHEN Endzustand (terminal + abgeglichen)",
    V.auftrag.status === "fehlgeschlagen" && V.auftrag.versuche === V.auftrag.maxVersuche
    && V.outbox.status === "verzichtet" && typeof V.outbox.transport === "string"
    && V.outbox.transport.length > 0 && typeof V.outbox.aktualisiertAm === "string");
  check("0.11 Der Aenderungsmelder updated_at ist Vertragsbestandteil und steht im SQL",
    /updated_at = timestamptz '/.test(scharfSql) && /updated_at = timestamptz '/.test(trockenSql)
    && /updated_at = timestamptz '/.test(N.einzeilenVorpruefungSql(V)));

  // ── 1–3 · Trockenlauf ─────────────────────────────────────────────────────────────────────
  abschnitt("1–3 · Standard-Trockenlauf: alle Riegel bestehen, nichts aendert sich");
  const vorTrocken = bestandHerstellen();
  check("1.0 Ausgangsbestand: 3 Auftraege / 3 Outbox-Zeilen, beide Zielzeilen vorhanden",
    vorTrocken.jobs === 3 && vorTrocken.outbox === 3
    && vorTrocken.zielJob === 1 && vorTrocken.zielOutbox === 1, JSON.stringify(vorTrocken));
  const vorpruefung = sql(N.einzeilenVorpruefungSql(V)).out.split("|").map(Number);
  check("1.1 Vorpruefung (rein lesend) bestaetigt den Vertrag: 1/1/1/1/1/1/1",
    vorpruefung.join(",") === "1,1,1,1,1,1,1", vorpruefung.join(","));
  const trocken = skript(trockenSql, { erlaubeFehler: true });
  check("1.2 Der Trockenlauf endet mit TROCKENLAUF-OK (alle Riegel bestanden, Rollback)",
    trocken.ok === false && /TROCKENLAUF-OK/.test(trocken.err),
    trocken.err.replace(/\s+/g, " ").slice(0, 160));
  const nachTrocken = zustand();
  check("2.1 Beide Zielzeilen bestehen nach dem Trockenlauf weiter",
    nachTrocken.zielJob === 1 && nachTrocken.zielOutbox === 1);
  check("2.2 Der Trockenlauf hat NICHTS geloescht (3 Auftraege, 3 Outbox-Zeilen)",
    nachTrocken.jobs === 3 && nachTrocken.outbox === 3, JSON.stringify(nachTrocken));
  check("3.1 Fremde Zeilen sind nach dem Trockenlauf byte-gleich",
    nachTrocken.fremdJobs === vorTrocken.fremdJobs && nachTrocken.fremdOutbox === vorTrocken.fremdOutbox);

  // ── 4–5 · Scharfer Lauf ───────────────────────────────────────────────────────────────────
  abschnitt("4–5 · Scharfer Modus: exakt eine Auftragszeile und exakt ihre eine Outbox-Zeile");
  const vorScharf = zustand();
  const scharf = skript(scharfSql, { erlaubeFehler: true });
  const nachScharf = zustand();
  check("4.1 Der scharfe Lauf laeuft durch (kein Abbruch)", scharf.ok === true,
    `${scharf.err}`.replace(/\s+/g, " ").slice(0, 160));
  check("4.2 Genau EINE Auftragszeile entfernt — die Zielzeile",
    nachScharf.jobs === vorScharf.jobs - 1 && nachScharf.zielJob === 0, JSON.stringify(nachScharf));
  check("4.3 Genau EINE Outbox-Zeile entfernt — ueber die geprüfte Kaskade",
    nachScharf.outbox === vorScharf.outbox - 1 && nachScharf.zielOutbox === 0);
  check("4.4 Die Quittung nennt Verfahren, Modus und beide Kennungen",
    scharf.out.includes(V.verfahren)
    && scharf.out.includes(ZIEL_AUFTRAG) && scharf.out.includes(ZIEL_OUTBOX)
    && /"ergebnis": ?"neutralisiert"/.test(scharf.out.replace(/\s+/g, " ")),
    scharf.out.replace(/\s+/g, " ").slice(0, 200));
  check("5.1 Fremde Zeilen sind nach dem scharfen Lauf byte-gleich",
    nachScharf.fremdJobs === vorScharf.fremdJobs && nachScharf.fremdOutbox === vorScharf.fremdOutbox);
  check("5.2 Die fremde echte Arbeit steht noch vollstaendig (2 Auftraege, 2 Outbox-Zeilen)",
    nachScharf.jobs === 2 && nachScharf.outbox === 2, JSON.stringify(nachScharf));

  // ── 13 · Wiederholung ─────────────────────────────────────────────────────────────────────
  abschnitt("13 · Wiederholung nach erfolgreicher Neutralisierung");
  const wiederholung = skript(scharfSql, { erlaubeFehler: true });
  const nachWiederholung = zustand();
  check("13.1 Ein zweiter scharfer Lauf bricht mit BEREITS-NEUTRALISIERT ab",
    wiederholung.ok === false && /ABBRUCH-BEREITS-NEUTRALISIERT/.test(wiederholung.err),
    wiederholung.err.replace(/\s+/g, " ").slice(0, 160));
  check("13.2 Er veraendert nichts (fremde Zeilen unberuehrt, Bestand gleich)",
    nachWiederholung.jobs === nachScharf.jobs && nachWiederholung.outbox === nachScharf.outbox
    && nachWiederholung.fremdJobs === nachScharf.fremdJobs
    && nachWiederholung.fremdOutbox === nachScharf.fremdOutbox);
  const trockenNach = skript(trockenSql, { erlaubeFehler: true });
  check("13.3 Auch ein Trockenlauf danach bricht sauber ab und aendert nichts",
    trockenNach.ok === false && /ABBRUCH-BEREITS-NEUTRALISIERT/.test(trockenNach.err)
    && JSON.stringify(zustand()) === JSON.stringify(nachWiederholung));

  // ── 6–12 · Jede Abweichung stoppt ─────────────────────────────────────────────────────────
  abschnitt("6–12 · Jede Abweichung stoppt — Trockenlauf UND scharfer Lauf, ohne Aenderung");
  stopptBei("6.1 Veraenderte Auftragskennung (Zielkennung existiert nicht mehr) stoppt",
    `delete from public.helmut_jobs where id = '${ZIEL_AUFTRAG}'::uuid;
     insert into public.helmut_jobs (id, job_type, idempotency_key, freshness_window, payload,
        status, attempts, max_attempts, priority, due_at, first_due_at, created_at)
     values ('55555555-5555-4555-8555-555555555555'::uuid, '${A.jobType}',
        '${A.idempotenzschluessel}', '${A.aktualitaetsfenster}', '{}'::jsonb, '${A.status}',
        ${A.versuche}, ${A.maxVersuche}, ${A.prioritaet},
        timestamptz '${A.faelligAb}', timestamptz '${A.ersteFaelligkeit}', timestamptz '${A.erstelltAm}');`,
    /ABBRUCH-BEREITS-NEUTRALISIERT|ABBRUCH E1/);
  stopptBei("6.2 Veraenderte Outbox-Kennung stoppt (E3)",
    `update public.helmut_job_outbox set id = '66666666-6666-4666-8666-666666666666'::uuid
       where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E3/);
  // DER WICHTIGSTE NEGATIVFALL DIESER FASSUNG: der FRUEHERE Zustand. Stuende die Zeile wieder
  // (oder immer noch) auf `wartend`/`offen`, waere der Vertrag nicht mehr der belegte — der
  // Ablauf muss geschlossen stoppen, statt sich still anzupassen.
  stopptBei("7.0 Der FRUEHERE Zustand (Auftrag `wartend`, Outbox `offen`) wird abgelehnt",
    `update public.helmut_jobs set status = 'wartend', attempts = 0, last_error = null,
        first_claimed_at = null, finished_at = null
      where id = '${ZIEL_AUFTRAG}'::uuid;
     update public.helmut_job_outbox set status = 'offen', attempts = 0, transport = null,
        sent_at = null, confirmed_at = null
      where id = '${ZIEL_OUTBOX}'::uuid;`,
    // Welcher Riegel ZUERST greift, bestimmt die Feldreihenfolge: der Fehlerzustand (E2.7) wird
    // vor Status (E7.1) geprueft. Entscheidend ist, dass der Ablauf an einem Merkmal des
    // ENDZUSTANDS scheitert, geschlossen stoppt und nichts veraendert.
    /ABBRUCH (E2\.7|E7\.1|E7\.2|E7\.7|E7\.8|E4\.[2357])/);
  stopptBei("7.0b Allein der fruehere Status `wartend` stoppt bereits (E7.1)",
    `update public.helmut_jobs set status = 'wartend' where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E7\.1/);
  stopptBei("7.0c Allein der fruehere Outbox-Status `offen` stoppt bereits (E4.2)",
    `update public.helmut_job_outbox set status = 'offen' where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E4\.2/);
  // `bestaetigt` war der Zustand VOR dem kanonischen Abgleich (2026-08-25, 08:56:14 Uhr
  // tuerkischer Zeit / 07:56:14 Berlin / 05:56:14 UTC). Er darf den Vertrag nicht mehr tragen.
  stopptBei("7.0d Der Zustand VOR dem Abgleich (`bestaetigt`) stoppt (E4.2)",
    `update public.helmut_job_outbox set status = 'bestaetigt' where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E4\.2/);
  stopptBei("7.1 Veraenderter Status stoppt (E7.1 — spaetere Statusaenderung)",
    `update public.helmut_jobs set status = 'erledigt'
       where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E7\.1/);
  stopptBei("7.2 Veraenderte erste Beanspruchung stoppt (E7.7)",
    `update public.helmut_jobs set first_claimed_at = timestamptz '2026-08-25 05:00:00+00'
       where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E7\.7/);
  stopptBei("7.3 Veraenderter Abschlusszeitpunkt stoppt (E7.8)",
    `update public.helmut_jobs set finished_at = timestamptz '2026-08-25 05:00:00+00'
       where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E7\.8/);
  stopptBei("8.1 Veraenderte Versuchszahl stoppt (E7.2 — weiterer Versuch)",
    `update public.helmut_jobs set attempts = 4 where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E7\.2/);
  stopptBei("8.2 Veraenderte Wiedervorlagen stoppen (E7.4)",
    `update public.helmut_jobs set wiedervorlagen = 1 where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E7\.4/);
  stopptBei("9.1 Erneute aktive Lease stoppt (E7.1/E7.5 — neue Beanspruchung durch einen Worker)",
    `update public.helmut_jobs set status = 'laeuft', lease_owner = 'worker-x',
        lease_expires_at = now() + interval '5 minutes', attempts = 1, finished_at = null
      where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E7\./);
  stopptBei("10.1 Veraenderte Nutzlast stoppt (E2.6 — keine leere Nutzlast mehr)",
    `update public.helmut_jobs set payload = jsonb_build_object('quelle', jsonb_build_object('id','echt'))
       where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E2\.6/);
  stopptBei("10.2 Veraenderter Idempotenzschluessel stoppt (E2.2)",
    `update public.helmut_jobs set idempotency_key = 'echt-k' where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E2\.2/);
  stopptBei("10.3 Gesetzte Mandatszuordnung stoppt (E2.5)",
    `update public.helmut_jobs set tenant_id = 'mandat-echt' where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E2\.5/);
  stopptBei("10.4 Veraenderter Erstellzeitpunkt stoppt (E2.10)",
    `update public.helmut_jobs set created_at = timestamptz '2026-08-25 00:00:00+00'
       where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E2\.10/);
  stopptBei("10.5 Veraenderter Fehlerzustand stoppt (E2.7 — anderer Fehlertext)",
    `update public.helmut_jobs set last_error = 'ein voellig anderer fehler'
       where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E2\.7/);
  stopptBei("10.6 Geleerter Fehlerzustand stoppt ebenfalls (E2.7)",
    `update public.helmut_jobs set last_error = null where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E2\.7/);
  stopptBei("10.7 Veraenderte Faelligkeit stoppt (E2.8)",
    `update public.helmut_jobs set due_at = timestamptz '2026-08-25 06:00:00+00'
       where id = '${ZIEL_AUFTRAG}'::uuid;`,
    /ABBRUCH E2\.8/);
  // Die erlaubten Outbox-Status sind `offen|versendet|bestaetigt|aufgegeben|verzichtet`
  // (helmut_job_outbox_status_chk) — `aufgegeben` gehoert also zur VERSANDABSICHT, nicht zum
  // Auftrag. Genau deshalb heisst die Massnahme hier LOESCHEN und nicht „aufgeben".
  stopptBei("11.2 Veraenderter Outbox-Status stoppt (E4.2)",
    `update public.helmut_job_outbox set status = 'versendet' where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E4\.2/);
  stopptBei("11.3 Outbox auf `aufgegeben` gesetzt stoppt ebenfalls (E4.2) — der Auftrag bliebe ja liegen",
    `update public.helmut_job_outbox set status = 'aufgegeben' where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E4\.2/);
  // DER AENDERUNGSMELDER: der Trigger setzt updated_at bei jedem Update. Eine spaetere
  // Beruehrung der Zeile — aus welcher Quelle auch immer — muss den Ablauf stoppen.
  stopptBei("11.8 Veraenderter Aenderungszeitpunkt stoppt (E4.12 — Aenderungsmelder)",
    `alter table public.helmut_job_outbox disable trigger helmut_job_outbox_kappen_trg;
     update public.helmut_job_outbox set updated_at = timestamptz '2026-08-25 06:30:00+00'
      where id = '${ZIEL_OUTBOX}'::uuid;
     alter table public.helmut_job_outbox enable trigger helmut_job_outbox_kappen_trg;`,
    /ABBRUCH E4\.12/);
  stopptBei("11.9 Ein beliebiger spaeterer Schreibvorgang stoppt ueber den Melder (E4.12)",
    `update public.helmut_job_outbox set last_error = null where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E4\.12/);
  stopptBei("11.4 Veraenderte Outbox-Versuchszahl stoppt (E4.3)",
    `update public.helmut_job_outbox set attempts = 2 where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E4\.3/);
  stopptBei("11.5 Veraenderter Transport stoppt (E4.5)",
    `update public.helmut_job_outbox set transport = 'selbstweck' where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E4\.5/);
  stopptBei("11.6 Veraenderter Sendezeitpunkt stoppt (E4.6)",
    `update public.helmut_job_outbox set sent_at = timestamptz '2026-08-25 05:00:00+00'
       where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E4\.6/);
  stopptBei("11.7 Veraenderter Bestaetigungszeitpunkt stoppt (E4.7)",
    `update public.helmut_job_outbox set confirmed_at = null where id = '${ZIEL_OUTBOX}'::uuid;`,
    /ABBRUCH E4\.7/);

  abschnitt("11 · Zusaetzliche Outbox-Zeile");
  bestandHerstellen();
  const zweite = sql(`insert into public.helmut_job_outbox (id, job_id, schema_version, status,
      attempts, max_attempts, next_attempt_at, created_at)
    values ('77777777-7777-4777-8777-777777777777'::uuid, '${ZIEL_AUFTRAG}'::uuid, 1, 'offen', 0, 10, now(), now());`,
  { erlaubeFehler: true });
  check("11.1a Die Datenbank selbst verhindert eine zweite Absicht je Auftrag (unique)",
    zweite.ok === false && /helmut_job_outbox_job_uidx|duplicate key/i.test(zweite.err),
    zweite.err.replace(/\s+/g, " ").slice(0, 120));
  // Der Riegel muss auch dann greifen, wenn die Eindeutigkeit einmal fehlen sollte.
  sql("drop index if exists helmut_job_outbox_job_uidx;");
  stopptBei("11.1b Ohne Eindeutigkeit: eine zweite Outbox-Zeile stoppt den Vertrag (E3b)",
    `insert into public.helmut_job_outbox (id, job_id, schema_version, status, attempts,
        max_attempts, next_attempt_at, created_at)
     values ('77777777-7777-4777-8777-777777777777'::uuid, '${ZIEL_AUFTRAG}'::uuid, 1, 'offen', 0, 10,
        timestamptz '2026-08-24 20:32:13.047778+00', timestamptz '2026-08-24 20:32:13.047778+00');`,
    /ABBRUCH E3b/);
  // Erst den Bestand zuruecksetzen (die zweite Zeile liegt noch da — der Vertrag hat sie ja
  // bewusst NICHT angefasst), dann die Eindeutigkeit wiederherstellen.
  bestandHerstellen();
  sql("create unique index if not exists helmut_job_outbox_job_uidx on public.helmut_job_outbox (job_id);");

  abschnitt("12 · Fehlende Kaskade");
  sql(`alter table public.helmut_job_outbox drop constraint helmut_job_outbox_job_id_fkey;
       alter table public.helmut_job_outbox add constraint helmut_job_outbox_job_id_fkey
         foreign key (job_id) references public.helmut_jobs(id) on delete no action;`);
  stopptBei("12.1 Fehlende ON-DELETE-CASCADE-Regel stoppt (E6)", null, /ABBRUCH E6/);
  sql(`alter table public.helmut_job_outbox drop constraint helmut_job_outbox_job_id_fkey;
       alter table public.helmut_job_outbox add constraint helmut_job_outbox_job_id_fkey
         foreign key (job_id) references public.helmut_jobs(id) on delete cascade;`);
  sql(`alter table public.helmut_jobs add column if not exists zusatz_ref uuid;
       create table if not exists public.helmut_test_abhaengig (
         id uuid primary key default gen_random_uuid(),
         job_id uuid not null references public.helmut_jobs(id) on delete cascade);`);
  stopptBei("12.2 Eine ZWEITE eingehende Fremdschluesselbeziehung stoppt (E5)", null, /ABBRUCH E5/);
  sql("drop table if exists public.helmut_test_abhaengig; alter table public.helmut_jobs drop column if exists zusatz_ref;");

  // Nach der Wiederherstellung muss der Vertrag wieder durchlaufen — sonst haette ein
  // Negativtest den Nachweis dauerhaft beschaedigt.
  abschnitt("14 · Gegenprobe nach allen Negativfaellen");
  bestandHerstellen();
  const gegenprobe = skript(trockenSql, { erlaubeFehler: true });
  check("14.1 Der Trockenlauf besteht nach Wiederherstellung wieder alle Riegel",
    gegenprobe.ok === false && /TROCKENLAUF-OK/.test(gegenprobe.err),
    gegenprobe.err.replace(/\s+/g, " ").slice(0, 160));

  // ── 15 · Datensparsamkeit ─────────────────────────────────────────────────────────────────
  abschnitt("15 · Datensparsamkeit: kein Wert einer sensiblen Spalte verlaesst die Datenbank");
  const gesamtausgabe = ALLE_AUSGABEN.join("\n");
  check("15.1 Keine Ausgabe traegt den Idempotenzschluessel oder eine Nutzlast der ECHTEN Zeilen",
    !gesamtausgabe.includes("geteilt-echt-1") && !gesamtausgabe.includes("verstehen-echt-1")
    && !gesamtausgabe.includes("echte-quelle-1") && !gesamtausgabe.includes("rd-echt-1")
    && !gesamtausgabe.includes("mandat-echt"));
  // NEU IN DIESER FASSUNG: der Fehlertext des Zielauftrags ist ein sensibler Wert. Er wird im
  // Bestandsaufbau EINGEGEBEN und in der Datenbank VERGLICHEN — er darf in keiner Ausgabe
  // stehen: nicht in einer Quittung, nicht in einer Abbruchmeldung, nicht in einer Testzeile.
  check("15.1b Keine Ausgabe traegt den technischen Fehlertext des Zielauftrags",
    !gesamtausgabe.includes(V.auftrag.fehlertext));
  check("15.2 Das erzeugte SQL liest die vier sensiblen Spalten ausschliesslich als Vergleich",
    (() => {
      // Auf dem CODE zaehlen, nicht auf Zeichenketten-Literalen: der Fehlertext selbst enthaelt
      // das Wort einer sensiblen Spalte, ist aber ein Wert und keine Spaltenreferenz.
      const ohneLiterale = scharfSql.replace(/'(?:[^']|'')*'/g, "''");
      const muster = /\b(payload|tenant_id|idempotency_key|last_error)\b/gi;
      const vergleich = /\b(payload|tenant_id|idempotency_key|last_error)\b\s*(?:=|<>|is\s+(?:not\s+)?null)/gi;
      return (ohneLiterale.match(muster) || []).length === (ohneLiterale.match(vergleich) || []).length;
    })());
  check("15.2b Der Fehlertext steht im SQL AUSSCHLIESSLICH als rechte Seite seines Spaltenvergleichs",
    (scharfSql.split(V.auftrag.fehlertext).length - 1) === 1
    && new RegExp(`last_error = '${V.auftrag.fehlertext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`).test(scharfSql));
  check("15.2c Die Quittung enthaelt keinen Wert einer sensiblen Spalte",
    (() => {
      const quittung = scharfSql.slice(scharfSql.indexOf("jsonb_build_object"));
      return !quittung.includes(V.auftrag.fehlertext)
        && !new RegExp(`'${V.auftrag.idempotenzschluessel}'`).test(quittung);
    })());
  check("15.2d Der Riegel weist einen sensiblen Wert ausserhalb seines Vergleichs ab", (() => {
    const boese = `select 1 where 'x' = '${V.auftrag.fehlertext}';`;
    try { N.pruefeEinzeilenSql(boese, { last_error: V.auftrag.fehlertext }); return false; }
    catch (_) { return true; }
  })());
  check("15.3 Der Riegel weist Vollzeilenkonstrukte und ungebundene Loeschungen ab", (() => {
    const proben = [
      "select to_jsonb(j) from public.helmut_jobs j;",
      "select payload from public.helmut_jobs;",
      "delete from public.helmut_jobs where status = 'wartend';",
      "select 1 from public.helmut_jobs where created_at < now();",
      "select 1 from public.helmut_jobs where finished_at >= now();"
    ];
    for (const p of proben) {
      try { N.pruefeEinzeilenSql(p); return false; } catch (_) { /* erwartet */ }
    }
    return true;
  })());

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("Einordnung: lokaler Datenbanknachweis des Einzeilenvertrags. Production unberuehrt.");
  process.exit(fail > 0 ? 1 : 0);
}

main();
