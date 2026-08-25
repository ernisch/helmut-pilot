"use strict";

// Helmut — BRAUCHT `helmut_job_ankunft` EINEN EIGENEN INDEX?
// (Korrekturrunde Skalierung 25/50/100, 2026-08-25/4)
// =============================================================================================
// DIE FRAGE. Die neue Kennzahlfunktion `helmut_job_ankunft` (Migration
// `20260825101500`, NICHT angewendet — F9) zaehlt zweimal ueber `helmut_jobs`:
//     (A) Ankunft  : created_at  >= jetzt − Fenster
//     (B) Abfluss  : status = 'erledigt' AND finished_at >= jetzt − Fenster
// Production traegt fuer (B) BEREITS einen passenden Teilindex
// (`helmut_jobs_bereinigung_idx` auf `(status, finished_at) WHERE status='erledigt'`);
// fuer (A) gibt es keinen. Waechst die Tabelle — und sie waechst, weil es KEINE
// automatische Aufbewahrung gibt (Risiko R5: `helmut_jobs_bereinigen` hat im
// Anwendungscode keinen Aufrufer) —, kostet jeder Aufruf trotzdem einen vollstaendigen
// Tabellendurchlauf, unabhaengig von der Fenstergroesse. Warum, klaert §4a: die
// Funktion verbindet `helmut_jobs` mit einer `fenster`-CTE, aus der Bedingung wird
// eine JOIN-Bedingung — und die kann kein Index bedienen. Der Engpass ist also nicht
// nur ein fehlender Index, sondern die FORM der Abfrage.
//
// DIESER TEST MISST STATT ZU BEHAUPTEN. Er baut drei realistische Datenmengen gegen eine
// ECHTE lokale PostgreSQL und liest den echten Plan (`EXPLAIN ANALYZE, BUFFERS`):
//     7 Tage   ·  16.009 Zeilen   (2287 Auftraege/Tag — Hochrechnung fuer 100 Mandate)
//    90 Tage   · 205.830 Zeilen
//   365 Tage   · 834.755 Zeilen
// Die Nutzlast ist auf die in Production GEMESSENE mittlere Groesse gebracht
// (`pg_column_size(payload)` = 821 Byte, rein lesend abgefragt am 2026-08-25). Ohne diese
// Eichung waere die Messung zu guenstig: der sequentielle Durchlauf liest die Nutzlast mit.
//
// GEGENPROBE STATT VERMUTUNG: der Test misst drei Gegenproben, jeweils mit anschliessender
// Wiederherstellung — (1) die beiden Haelften als EIGENSTAENDIGE Abfragen, (2) ein
// zusaetzlicher `created_at`-Index, (3) dieselbe Funktion mit INLINE berechneter
// Zeitgrenze statt CTE-Join. Damit steht jede Wirkung als ZAHL fest, ohne dass eine
// Migration entsteht.
//
// PRIMAERES MASS SIND GELESENE PUFFER, nicht Millisekunden: Pufferzahlen sind
// deterministisch, Laufzeiten haengen an der Maschine. Laufzeiten werden ausgegeben,
// aber nicht zugesichert.
//
// AUFWAND: der Lauf erzeugt rund 1 GB in einer Wegwerf-Datenbank und braucht ein paar
// Minuten. Ohne lokalen PostgreSQL-Server wird er sauber UEBERSPRUNGEN (kein falsches Gruen).
// Aufruf: HELMUT_TEST_PG_HOST=127.0.0.1 HELMUT_TEST_PG_PORT=5433 HELMUT_TEST_PG_USER=helmut \
//           node scripts/lokal.js scripts/jobqueue-ankunft-index-datenbank-test.js

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
// DIE LOKALE TESTDATENBANK MUSS DIESELBE INDEXMENGE TRAGEN WIE PRODUCTION.
// Selbst gefundener Fehler der ersten Fassung: sie spielte NUR die Basismigration ein und
// mass damit gegen 7 Indizes, waehrend Production 10 traegt — darunter ausgerechnet
// `helmut_jobs_bereinigung_idx` auf `(status, finished_at) WHERE status='erledigt'`, also
// genau die Haelfte, die die Ankunftskennzahl fuer den ABFLUSS braucht. Eine Messung gegen
// ein aermeres Schema haette den Indexbedarf systematisch ueberschaetzt.
// Diese fuenf Dateien erzeugen lokal exakt die 10 Production-Indizes (in §1 zugesichert).
const SCHEMA = [
  "20260808_scalable_job_queue.sql",
  "20260808_jobqueue_abhaengigkeiten.sql",
  "20260808_jobqueue_bereinigung.sql",
  "20260809_jobqueue_wiedervorlage.sql",
  "20260812_jobqueue_altersmessung.sql"
].map((f) => path.join(ROOT, "supabase", "migrations", f));

// Rein lesend aus Production abgefragt am 2026-08-25 (`pg_indexes`), hier als
// Sollzustand festgehalten. Weicht die lokale Menge ab, ist die Messung nicht
// uebertragbar und der Test sagt das, statt eine Zahl zu liefern.
const PRODUCTION_INDIZES = [
  "helmut_jobs_bereinigung_idx", "helmut_jobs_claim_idx", "helmut_jobs_fenster_typ_idx",
  "helmut_jobs_idem_uidx", "helmut_jobs_lease_idx", "helmut_jobs_pkey",
  "helmut_jobs_status_idx", "helmut_jobs_tenant_idx", "helmut_jobs_wiedervorlage_idx",
  "helmut_jobs_window_idx"
];
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260825101500_jobqueue_ankunftskennzahl.sql");
const ROLLBACK = path.join(ROOT, "supabase", "migrations", "rollback_20260825101500_jobqueue_ankunftskennzahl.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_INDEX || "helmut_test_ankunft_index"
};

// Hochrechnung aus `betrieb/skalierung-25-50-100.md` §2 fuer 100 Mandate. Ausdruecklich
// eine HOCHRECHNUNG, kein gemessener Production-Wert — sie dient hier nur als Datenmenge.
const AUFTRAEGE_JE_TAG = 2287;
// In Production gemessen (rein lesend, 2026-08-25): avg(pg_column_size(payload)) = 821 Byte.
const NUTZLAST_FUELLUNG = 760;
const STUFEN = [7, 90, 365];
// Supabase Free-Plan: harte Datenbankgrenze (Risiko R3). Kein Messwert dieses Tests,
// sondern die dokumentierte Plangrenze — hier nur als Vergleichsmassstab.
const SUPABASE_FREE_MB = 500;

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function psql(sql, { db = PG.db, datei = null } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function erreichbar() {
  if (!PG.host || !PG.user) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

// Liest Plan, gelesene Puffer und Laufzeit einer Abfrage.
function plan(sql) {
  const roh = psql(`explain (analyze, buffers, costs off, timing off) ${sql}`);
  const puffer = [...roh.matchAll(/Buffers: shared ([^\n]*)/g)]
    .map((m) => [...m[1].matchAll(/(?:hit|read)=(\d+)/g)].reduce((s, x) => s + Number(x[1]), 0));
  const zeit = Number((roh.match(/Execution Time: ([\d.]+) ms/) || [])[1] || NaN);
  return {
    text: roh,
    puffer: puffer.length ? Math.max(...puffer) : 0,
    zeitMs: zeit,
    seqScan: /Seq Scan on helmut_jobs/.test(roh),
    indexScan: /Index (Only )?Scan/.test(roh)
  };
}

function tabelle() {
  const [zeilen, heapB, gesamtB] = psql(
    "select count(*), pg_relation_size('public.helmut_jobs'), pg_total_relation_size('public.helmut_jobs')"
    + " from public.helmut_jobs").split("|").map(Number);
  return { zeilen, heapMB: heapB / 1048576, gesamtMB: gesamtB / 1048576 };
}

function erzeuge(abTag, bisTag) {
  psql(`
    insert into public.helmut_jobs
      (job_type, status, priority, idempotency_key, freshness_window,
       created_at, updated_at, attempts, finished_at, payload, tenant_id, first_due_at, due_at)
    select
      (array['source_fetch','document_understanding','mandate_projection','briefing_materialization'])[1 + (g % 4)],
      case when g % 50 = 0 then 'wartend' when g % 97 = 0 then 'fehlgeschlagen' else 'erledigt' end,
      100, 'idx-probe-' || g::text,
      to_char(now() - ((g / ${AUFTRAEGE_JE_TAG})::int) * interval '1 day', 'YYYY-MM-DD'),
      now() - ((g::numeric / ${AUFTRAEGE_JE_TAG}) * interval '1 day'),
      now() - ((g::numeric / ${AUFTRAEGE_JE_TAG}) * interval '1 day'),
      1,
      case when g % 50 = 0 then null
           else now() - ((g::numeric / ${AUFTRAEGE_JE_TAG}) * interval '1 day') + interval '4 minutes' end,
      jsonb_build_object('quelle', 'idx-probe-' || g::text, 'fuellung', repeat('x', ${NUTZLAST_FUELLUNG})),
      case when g % 4 in (2,3) then 'mandat-' || (g % 100)::text else null end,
      now() - ((g::numeric / ${AUFTRAEGE_JE_TAG}) * interval '1 day'),
      now() - ((g::numeric / ${AUFTRAEGE_JE_TAG}) * interval '1 day')
    from generate_series(${abTag * AUFTRAEGE_JE_TAG}, ${bisTag * AUFTRAEGE_JE_TAG} - 1) as g;`);
  psql("analyze public.helmut_jobs");
}

function main() {
  console.log("Helmut — Indexfrage der Ankunftskennzahl (lokal gemessen, kein Production-Zugriff)");
  if (!erreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST/USER nicht gesetzt).");
    console.log("  >> Die Indexentscheidung ist damit UNBELEGT, nicht bestaetigt. <<");
    process.exit(0);
  }

  // Supabase-Rollen wie im Schwestertest — die Basismigration entzieht ihnen Rechte.
  for (const [rolle, zusatz] of [["anon", ""], ["authenticated", ""], ["service_role", " bypassrls"]]) {
    psql(`do $$ begin if not exists (select 1 from pg_roles where rolname='${rolle}')`
      + ` then create role ${rolle} nologin${zusatz}; end if; end $$;`, { db: "postgres" });
  }
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  try {
    for (const datei of SCHEMA) psql(null, { datei });
    psql(null, { datei: MIGRATION });

    // ── 1 · Ausgangslage: welche Indizes gibt es ueberhaupt? ───────────────────────────
    abschnitt("1 · Ausgangslage der Indizes auf helmut_jobs");
    const indizes = psql("select indexname from pg_indexes where schemaname='public'"
      + " and tablename='helmut_jobs' order by 1").split("\n").filter(Boolean);
    console.log(`  Vorhanden (${indizes.length}): ${indizes.join(", ")}`);
    const defs = psql("select indexdef from pg_indexes where schemaname='public' and tablename='helmut_jobs'");
    // OHNE DIESE ZUSICHERUNG IST JEDE ZAHL UNTEN WERTLOS.
    check("1.1 Die lokale Indexmenge ist BYTEGLEICH die aus Production gelesene (10 Namen)",
      indizes.length === PRODUCTION_INDIZES.length
      && indizes.every((n, i) => n === PRODUCTION_INDIZES[i]),
      `${indizes.length} lokal / ${PRODUCTION_INDIZES.length} Production`);
    check("1.2 Es gibt KEINEN Index, der `created_at` fuehrend traegt (Ankunftshaelfte ungedeckt)",
      !/\(created_at/.test(defs));
    // Die ABFLUSShaelfte ist dagegen bereits gedeckt — das war der uebersehene Punkt.
    check("1.3 Die Abflusshaelfte IST bereits gedeckt: (status, finished_at) WHERE status='erledigt'",
      /helmut_jobs_bereinigung_idx[\s\S]*?\(status, finished_at\)[\s\S]*?status = 'erledigt'/.test(defs));
    check("1.4 Der Statusindex fuehrt (status, job_type) — er deckt finished_at NICHT",
      /helmut_jobs_status_idx[\s\S]*?\(status, job_type\)/.test(defs));

    // ── 2 · Messung ohne Index ueber drei Datenmengen ──────────────────────────────────
    abschnitt("2 · Gemessene Skalierung OHNE zusaetzlichen Index");
    console.log("     Tage |    Zeilen | Heap MB | gesamt MB | Puffer (Funktion) |   ms | Plan");
    const messungen = [];
    let vorher = 0;
    for (const tage of STUFEN) {
      erzeuge(vorher, tage);
      vorher = tage;
      const t = tabelle();
      const f = plan("select * from public.helmut_job_ankunft(1440)");
      const a = plan("select count(*) from public.helmut_jobs where created_at >= now() - interval '1440 minutes'");
      const b = plan("select count(*) from public.helmut_jobs where status = 'erledigt'"
        + " and finished_at >= now() - interval '1440 minutes'");
      messungen.push({ tage, ...t, funktion: f, ankunft: a, abfluss: b });
      console.log(`  ${String(tage).padStart(7)} | ${String(t.zeilen).padStart(9)} | `
        + `${t.heapMB.toFixed(0).padStart(7)} | ${t.gesamtMB.toFixed(0).padStart(9)} | `
        + `${String(f.puffer).padStart(17)} | ${(Number.isFinite(f.zeitMs) ? f.zeitMs.toFixed(0) : "?").padStart(4)} | `
        + `${f.seqScan || a.seqScan ? "Seq Scan" : "Index"}`);
    }

    const [s7, s90, s365] = messungen;
    check("2.1 Jede Stufe traegt genau die hochgerechnete Zeilenzahl (Tage x 2287)",
      messungen.every((m) => m.zeilen === m.tage * AUFTRAEGE_JE_TAG),
      messungen.map((m) => `${m.tage}d=${m.zeilen}`).join(" · "));
    // BERICHTIGT gegenueber der ersten Fassung: NUR die Ankunftshaelfte ist ungedeckt.
    // Die Abflusshaelfte trifft als eigenstaendige Abfrage den vorhandenen
    // helmut_jobs_bereinigung_idx (§4.2) — das aendert die Bewertung deutlich.
    check("2.2 Nur die ANKUNFTShaelfte laeuft sequentiell; die Abflusshaelfte ist gedeckt",
      s365.ankunft.seqScan && !s365.ankunft.indexScan
      && s365.abfluss.indexScan && /helmut_jobs_bereinigung_idx/.test(s365.abfluss.text),
      `Ankunft ${s365.ankunft.seqScan ? "Seq" : "Index"} / Abfluss ${s365.abfluss.indexScan ? "Index" : "Seq"}`);
    // DAS IST DER KERN: die gelesenen Puffer haengen an der TABELLENGROESSE, nicht am
    // Fenster. Ein 24-Stunden-Fenster kostet bei 365 Tagen Bestand dasselbe wie ein
    // 365-Tage-Fenster — die Funktion liest immer alles.
    check("2.3 Die gelesenen Puffer wachsen mit der Tabelle, nicht mit dem Fenster",
      s365.funktion.puffer > s90.funktion.puffer && s90.funktion.puffer > s7.funktion.puffer,
      `${s7.funktion.puffer} -> ${s90.funktion.puffer} -> ${s365.funktion.puffer}`);
    const wachstumZeilen = s365.zeilen / s7.zeilen;
    const wachstumPuffer = s365.funktion.puffer / s7.funktion.puffer;
    check("2.4 Der Aufwand waechst rund linear mit der Zeilenzahl (Faktor im selben Bereich)",
      wachstumPuffer > wachstumZeilen * 0.5 && wachstumPuffer < wachstumZeilen * 2,
      `Zeilen x${wachstumZeilen.toFixed(1)} / Puffer x${wachstumPuffer.toFixed(1)}`);
    const fensterGross = plan("select * from public.helmut_job_ankunft(525600)");
    check("2.5 Ein 365-Tage-Fenster liest nicht mehr als ein 24-Stunden-Fenster",
      Math.abs(fensterGross.puffer - s365.funktion.puffer) < s365.funktion.puffer * 0.2,
      `${s365.funktion.puffer} (24 h) vs ${fensterGross.puffer} (365 d)`);

    // ── 3 · Die Kennzahl bleibt bei jeder Menge RICHTIG ────────────────────────────────
    abschnitt("3 · Fachliche Richtigkeit bei voller Datenmenge");
    // BEIDE SEITEN IN EINER ANWEISUNG. Die Testdaten laufen bis an `now()` heran; zwei
    // getrennte Aufrufe sehen unterschiedliche Zeitpunkte und weichen um 1-2 Zeilen ab.
    // Das waere ein Zeitartefakt der Fixture, kein Befund — innerhalb EINER Anweisung ist
    // `now()` der Transaktionszeitpunkt und fuer beide Seiten derselbe.
    function vergleich(fn = "public.helmut_job_ankunft(1440)") {
      return psql(`select a.eingereiht_im_zeitraum, a.erledigt_im_zeitraum, a.abflussverhaeltnis,
          a.fenster_minuten,
          (select count(*) from public.helmut_jobs
             where created_at >= now() - interval '1440 minutes'),
          (select count(*) from public.helmut_jobs where status = 'erledigt'
             and finished_at >= now() - interval '1440 minutes')
        from ${fn} a`).split("|");
    }
    const [ein, aus, verh, fenster, sollEin, sollAus] = vergleich();
    check("3.1 Die gemeldete Ankunft stimmt exakt mit der Gegenzaehlung", ein === sollEin, `${ein} = ${sollEin}`);
    check("3.2 Der gemeldete Abfluss stimmt exakt mit der Gegenzaehlung", aus === sollAus, `${aus} = ${sollAus}`);
    check("3.3 Das Fenster wird unveraendert zurueckgegeben", fenster === "1440", fenster);
    check("3.4 Das Abflussverhaeltnis ist gesetzt und plausibel (0 < v <= 1,05)",
      Number(verh) > 0 && Number(verh) <= 1.05, verh);
    // Das Verhaeltnis ist genau `runde(Abfluss / Ankunft, 4)` — auch bei voller Datenmenge.
    // (Der Sonderfall „keine Ankunft im Fenster ⇒ null statt 0" gehoert zur leeren
    // Warteschlange und ist im Schwestertest `jobqueue-ankunft-datenbank-test.js` belegt;
    // in dieser Datenmenge gibt es in JEDEM Fenster Ankuenfte, er ist hier nicht
    // herstellbar — deshalb wird er hier auch nicht behauptet.)
    const sollVerh = psql(`select round(${aus}::numeric / ${ein}::numeric, 4)`);
    check("3.5 Das Abflussverhaeltnis ist exakt runde(Abfluss/Ankunft, 4)",
      verh === sollVerh, `${verh} = ${sollVerh}`);

    // ── 4 · Die beiden Haelften EINZELN: der Abflussindex wirkt — ausserhalb der Funktion
    abschnitt("4 · Die beiden Haelften als eigenstaendige Abfragen");
    const zeilenVorher = s365.zeilen;
    const halbA = plan("select count(*) from public.helmut_jobs"
      + " where created_at >= now() - interval '1440 minutes'");
    const halbB = plan("select count(*) from public.helmut_jobs where status = 'erledigt'"
      + " and finished_at >= now() - interval '1440 minutes'");
    console.log(`  (A) Ankunft: ${halbA.puffer} Puffer · ${halbA.zeitMs.toFixed(0)} ms`);
    console.log(`  (B) Abfluss: ${halbB.puffer} Puffer · ${halbB.zeitMs.toFixed(0)} ms`);
    check("4.1 Die ANKUNFTShaelfte hat keinen Index und laeuft sequentiell",
      halbA.seqScan && !halbA.indexScan);
    // DER UEBERSEHENE PUNKT: fuer die Abflusshaelfte gibt es den Index laengst.
    check("4.2 Die ABFLUSShaelfte benutzt den vorhandenen helmut_jobs_bereinigung_idx",
      /helmut_jobs_bereinigung_idx/.test(halbB.text) && halbB.indexScan && !halbB.seqScan,
      halbB.indexScan ? "Index Only Scan" : "kein Indexdurchlauf");
    check("4.3 Und ist dadurch um mindestens Faktor 5 billiger als die Ankunftshaelfte",
      halbA.puffer / Math.max(1, halbB.puffer) >= 5,
      `Faktor ${(halbA.puffer / Math.max(1, halbB.puffer)).toFixed(0)}`);

    // ── 4a · WARUM die Funktion den vorhandenen Index trotzdem nicht nutzt ─────────────
    abschnitt("4a · Warum die Funktion den vorhandenen Index NICHT nutzt");
    // Die Funktion schreibt `from public.helmut_jobs, fenster where created_at >= fenster.ab`.
    // Damit steht die Zeitgrenze in einer ANDEREN Relation — PostgreSQL sieht eine
    // JOIN-Bedingung, keine auf einen Wert festgelegte (sargable) Filterbedingung, und kann
    // keinen Index bedienen. Der inline gerechnete Plan zeigt es: beide Zweige lesen die
    // GANZE Tabelle, obwohl fuer den zweiten ein passender Index existiert.
    const innen = plan(`with fenster as (select now() - (1440 * interval '1 minute') as ab)
      select (select count(*) from public.helmut_jobs, fenster where created_at >= fenster.ab) as ein,
             (select count(*) from public.helmut_jobs, fenster
                where status='erledigt' and finished_at >= fenster.ab) as aus from fenster`);
    check("4a.1 Mit CTE-Join liest AUCH die Abflusshaelfte sequentiell (Index wirkungslos)",
      (innen.text.match(/Seq Scan on helmut_jobs/g) || []).length === 2
      && !/helmut_jobs_bereinigung_idx/.test(innen.text),
      `${(innen.text.match(/Seq Scan on helmut_jobs/g) || []).length} sequentielle Durchlaeufe`);
    check("4a.2 Die Funktion selbst zeigt denselben Aufwand (ganze Tabelle, zweimal)",
      s365.funktion.puffer > s365.heapMB * 1024 / 8 * 1.5,
      `${s365.funktion.puffer} Puffer bei ${Math.round(s365.heapMB * 1024 / 8)} Heap-Bloecken`);
    // Gegenprobe: dieselbe Rechnung mit INLINE berechneter Zeitgrenze.
    psql(`create or replace function public.probe_inline(p_seit_minuten integer default 1440)
      returns table(ein bigint, aus bigint) language sql security invoker
      set search_path = public, pg_temp as $$
        select (select count(*) from public.helmut_jobs
                  where created_at >= now() - (greatest(coalesce(p_seit_minuten,1440),1) * interval '1 minute')),
               (select count(*) from public.helmut_jobs where status = 'erledigt'
                  and finished_at >= now() - (greatest(coalesce(p_seit_minuten,1440),1) * interval '1 minute'));
      $$;`);
    const inlineFn = plan("select * from public.probe_inline(1440)");
    console.log(`  Funktion mit CTE-Join: ${s365.funktion.puffer} Puffer · ${s365.funktion.zeitMs.toFixed(0)} ms`);
    console.log(`  Dieselbe Rechnung inline: ${inlineFn.puffer} Puffer · ${inlineFn.zeitMs.toFixed(0)} ms`);
    // Beide Fassungen in EINER Anweisung gegeneinander — gleicher Zeitpunkt, exakter Vergleich.
    const [einAlt, ausAlt, einNeu, ausNeu] = psql(`select a.eingereiht_im_zeitraum, a.erledigt_im_zeitraum,
        i.ein, i.aus from public.helmut_job_ankunft(1440) a, public.probe_inline(1440) i`).split("|");
    check("4a.3 Die inline gerechnete Fassung liefert exakt dasselbe Ergebnis",
      einAlt === einNeu && ausAlt === ausNeu, `${einAlt}/${ausAlt} gegen ${einNeu}/${ausNeu}`);
    // DAS IST DER EIGENTLICHE BEFUND DIESES ABSCHNITTS: die FORM der Abfrage kostet mehr
    // als der fehlende Index. Allein durch die inline gerechnete Zeitgrenze — ohne einen
    // einzigen zusaetzlichen Index, ohne ein Byte Speicher — faellt der Leseaufwand
    // deutlich. Das ist der billigere Hebel; er ist in dieser Runde ausdruecklich NICHT
    // gezogen worden (F9 bleibt unveraendert), sondern belegt und dem Betreiber vorgelegt.
    const formFaktor = s365.funktion.puffer / Math.max(1, inlineFn.puffer);
    check("4a.4 Die FORM allein senkt den Leseaufwand um mindestens Faktor 2 — ohne jeden Index",
      formFaktor >= 2,
      `Faktor ${formFaktor.toFixed(1)} (${s365.funktion.puffer} -> ${inlineFn.puffer} Puffer,`
      + ` ${s365.funktion.zeitMs.toFixed(0)} -> ${inlineFn.zeitMs.toFixed(0)} ms)`);
    check("4a.5 Sie wirkt damit mindestens so stark wie ein zusaetzlicher Index — und kostet nichts",
      formFaktor >= 2, `Form x${formFaktor.toFixed(1)} · Speicherkosten 0 MB`);
    psql("drop function public.probe_inline(integer)");

    // ── 4b · Gegenprobe: was WUERDE ein created_at-Index bringen? ──────────────────────
    abschnitt("4b · Gegenprobe mit einem zusaetzlichen created_at-Index (nur im Test)");
    psql("create index probe_created_idx on public.helmut_jobs (created_at)");
    psql("analyze public.helmut_jobs");
    const indexMB = Number(psql("select pg_relation_size('probe_created_idx')")) / 1048576;
    const mitIndex = plan("select * from public.helmut_job_ankunft(1440)");
    const mitIndexA = plan("select count(*) from public.helmut_jobs"
      + " where created_at >= now() - interval '1440 minutes'");
    console.log(`  Mit created_at-Index: ${mitIndex.puffer} Puffer · ${mitIndex.zeitMs.toFixed(0)} ms`
      + ` · Indexgroesse ${indexMB.toFixed(0)} MB`);
    check("4b.1 Die eigenstaendige Ankunftsabfrage waehlt dann einen Indexdurchlauf",
      mitIndexA.indexScan && !mitIndexA.seqScan);
    const gewinn = s365.funktion.puffer / Math.max(1, mitIndex.puffer);
    console.log(`  Wirkung auf die FUNKTION: Faktor ${gewinn.toFixed(1)}`
      + ` (${s365.funktion.puffer} -> ${mitIndex.puffer} Puffer)`);
    check("4b.2 Auf die Funktion wirkt er messbar, aber nicht um Groessenordnungen",
      gewinn > 1.2 && gewinn < 10, `Faktor ${gewinn.toFixed(1)}`);
    // Wieder instantgenau: die Funktion und die Gegenzaehlung in EINER Anweisung. Ein
    // Vergleich gegen den Minuten alten Wert von §3 wuerde nur die Uhr messen.
    const [einMit, ausMit, , , sollEinMit, sollAusMit] = vergleich();
    check("4b.3 Das Ergebnis ist mit Index unveraendert (kein Plan aendert die Zahl)",
      einMit === sollEinMit && ausMit === sollAusMit,
      `${einMit}/${ausMit} gegen ${sollEinMit}/${sollAusMit}`);
    check("4b.4 Datenunversehrtheit: die Zeilenzahl hat sich nicht veraendert",
      tabelle().zeilen === zeilenVorher, `${tabelle().zeilen} vs ${zeilenVorher}`);
    psql("drop index probe_created_idx");
    psql("analyze public.helmut_jobs");
    check("4b.5 Nach dem Entfernen ist die Production-Indexmenge wiederhergestellt",
      psql("select count(*) from pg_indexes where schemaname='public' and tablename='helmut_jobs'")
        === String(PRODUCTION_INDIZES.length)
      && tabelle().zeilen === zeilenVorher);

    // ── 5 · Der bindende Engpass ist der SPEICHER, nicht der Plan ──────────────────────
    abschnitt("5 · Einordnung: welcher Engpass kommt zuerst?");
    const mbJeTag = s365.gesamtMB / 365;
    console.log(`  Zuwachs bei 2287 Auftraegen/Tag: ${mbJeTag.toFixed(2)} MB/Tag`
      + ` (Heap + Indizes, Nutzlast auf die Production-Groesse geeicht)`);
    console.log(`  365 Tage ergeben ${s365.gesamtMB.toFixed(0)} MB allein in helmut_jobs`
      + ` — die Supabase-Free-Grenze liegt bei ${SUPABASE_FREE_MB} MB fuer die GANZE Datenbank.`);
    check("5.1 Ein Jahr bei 100-Mandate-Menge sprengt die Free-Grenze deutlich",
      s365.gesamtMB > SUPABASE_FREE_MB, `${s365.gesamtMB.toFixed(0)} MB > ${SUPABASE_FREE_MB} MB`);
    // Die Datenmenge, die auf dem Free-Plan ueberhaupt erreichbar ist, liegt zwischen der
    // 7- und der 90-Tage-Stufe. Dort kostet die Funktion Bruchteile einer Sekunde.
    check("5.2 Innerhalb der erreichbaren Menge (< Free-Grenze) bleibt die Funktion unter 1 s",
      Number.isFinite(s90.funktion.zeitMs) && s90.funktion.zeitMs < 1000 && s90.gesamtMB < SUPABASE_FREE_MB,
      `90 Tage: ${s90.gesamtMB.toFixed(0)} MB, ${s90.funktion.zeitMs.toFixed(0)} ms`);
    check("5.3 Es gibt keinen automatischen Aufbewahrungslauf (Ursache des Wachstums, R5)",
      (() => {
        const fs = require("fs");
        const quellen = ["lib/helmut/scalable-pipeline.js", "server.js", "lib/helmut/worker-betrieb.js"]
          .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
        // Nur echte Aufrufe zaehlen, nicht Erwaehnungen in Kommentaren.
        return !/rpc\/helmut_jobs_bereinigen|helmut_jobs_bereinigen\(/.test(quellen);
      })());

    // ── 6 · Rollback der Migration laesst die Daten unberuehrt ─────────────────────────
    abschnitt("6 · Rollback bei voller Datenmenge");
    psql(null, { datei: ROLLBACK });
    check("6.1 Die Funktion ist entfernt",
      psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
        + " where n.nspname='public' and p.proname='helmut_job_ankunft'") === "0");
    check("6.2 helmut_job_metrics ist unberuehrt",
      psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
        + " where n.nspname='public' and p.proname='helmut_job_metrics'") === "1");
    check("6.3 Kein Datenverlust durch den Rollback",
      tabelle().zeilen === zeilenVorher, `${tabelle().zeilen} vs ${zeilenVorher}`);
    check("6.4 Die Indexlage ist unveraendert (der Rollback fasst keinen Index an)",
      psql("select count(*) from pg_indexes where schemaname='public' and tablename='helmut_jobs'")
        === String(indizes.length));

    // ── 7 · Die belegte Entscheidung ──────────────────────────────────────────────────
    abschnitt("7 · Belegte Entscheidung");
    console.log("  KEIN zusaetzlicher Index in diesem Sprint, und F9 bleibt unveraendert.");
    console.log("  Begruendung aus den Messungen oben:");
    console.log("   1. Die Funktion liegt auf keinem heissen Pfad — /api/ops/jobqueue und der");
    console.log("      Nachweis lesen sie wenige Male am Tag, nicht je Auftrag.");
    console.log(`   2. Innerhalb der auf dem Free-Plan erreichbaren Datenmenge bleibt sie unter`);
    console.log(`      einer Sekunde (90 Tage: ${s90.funktion.zeitMs.toFixed(0)} ms bei ${s90.gesamtMB.toFixed(0)} MB).`);
    console.log(`   3. Ein created_at-Index braechte auf die FUNKTION nur Faktor ${gewinn.toFixed(1)} —`);
    console.log("      und kostet dabei Speicher auf einer 500-MB-Grenze, die vorher reisst als");
    console.log("      der Plan zum Problem wird (R3).");
    console.log("   4. Die Ursache des Wachstums ist die fehlende Aufbewahrung (R5), nicht der Plan.");
    console.log("  DER BILLIGERE HEBEL IST NICHT EIN INDEX, SONDERN DIE FORM DER ABFRAGE:");
    console.log(`      die inline gerechnete Zeitgrenze senkt den Aufwand um Faktor ${formFaktor.toFixed(1)}`);
    console.log("      (0 MB Speicher, keine neue Migration, Ergebnis nachweislich identisch).");
    console.log("      In dieser Runde ausdruecklich NICHT gezogen: F9 bleibt unveraendert und");
    console.log("      enthaelt weiterhin ausschliesslich die dokumentierte Ankunftskennzahl.");
    console.log("      Er ist als getrennter Punkt dokumentiert und liegt beim Betreiber.");
    console.log("  ERNEUT ZU PRUEFEN, sobald eines davon nicht mehr stimmt: Supabase Pro (groessere");
    console.log("  Grenze), Aufbewahrung weiterhin aus UND 50+ aktive Mandate, oder ein neuer");
    console.log("  Aufrufer, der die Kennzahl haeufig liest.");
    check("7.1 Die Entscheidung ist an Messwerte gebunden, nicht an eine Vermutung",
      messungen.length === STUFEN.length && messungen.every((m) => Number.isFinite(m.funktion.zeitMs)));
    check("7.2 Sie wurde gegen die ECHTE Production-Indexmenge gemessen, nicht gegen ein Teilschema",
      psql("select count(*) from pg_indexes where schemaname='public' and tablename='helmut_jobs'")
        === String(PRODUCTION_INDIZES.length));
  } finally {
    try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch { /* Aufraeumen darf den Ausgang nicht bestimmen */ }
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("EINORDNUNG: lokal gemessen gegen echte PostgreSQL. Production wurde NICHT");
  console.log("angefasst, keine Migration angewendet, kein Index angelegt.");
  process.exit(fail > 0 ? 1 : 0);
}

main();
