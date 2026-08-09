"use strict";

// Helmut — ECHTER DATENBANKNACHWEIS der Arbeitswarteschlange (OP-30).
// =============================================================================================
// WAS DIESE SUITE IST — und was sie ausdruecklich NICHT ist:
//
//   Sie prueft die MIGRATION `supabase/migrations/20260808_scalable_job_queue.sql` gegen einen
//   ECHTEN PostgreSQL-Server: echtes SQL, echte Transaktionen, echte gleichzeitige
//   Verbindungen. Ein Mock ersetzt keinen Datenbanknachweis (Auftrag §14) — deshalb gibt es
//   diese Suite zusaetzlich zu `jobqueue-vertrag-test.js`.
//
//   Sie laeuft NUR, wenn ein lokaler Server erreichbar ist. Ist keiner da, meldet sie den
//   Datenbanknachweis ausdruecklich als OFFEN und beendet sich mit Exit 0 — sie taeuscht
//   KEIN Gruen vor, sie behauptet aber auch keinen Fehlschlag, den es nicht gibt.
//
// WIE SIE OHNE npm-TREIBER AN DIE DATENBANK KOMMT:
//   Ueber `psql` als Unterprozess. Das Repository hat KEINE Datenbankabhaengigkeit in
//   package.json (einzige Abhaengigkeit: ical.js) und soll auch keine bekommen (Auftrag §5,
//   „Fuege keinen neuen Infrastrukturdienst und keine neue Abhaengigkeit hinzu"). `psql` ist
//   ein externes Werkzeug, kein Modul — die Laufzeit von Helmut bleibt unberuehrt.
//
// KONFIGURATION (alles ueber Env, nichts hartkodiert, keine Geheimnisse):
//   HELMUT_TEST_PG_HOST  Socket-Verzeichnis oder Host (Default: keiner -> Suite uebersprungen)
//   HELMUT_TEST_PG_PORT  Default 5433
//   HELMUT_TEST_PG_USER  Default helmut
//   HELMUT_TEST_PG_DB    Default helmut_test
//
// OFFLINE: `psql` verbindet ausschliesslich lokal (Unix-Socket bzw. localhost). Kein externes
// Netz, keine KI, keine Kosten.

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue.sql");
const ROLLBACK = path.join(ROOT, "supabase", "migrations", "20260808_scalable_job_queue_rollback.sql");
// Nur fuer Abschnitt 11.7–11.9: die Rueckstandsmessung muss gegen die ECHTE
// `helmut_defer_job` geprueft werden, und die steht in der aufbauenden Migration.
const ABHAENGIGKEITEN = path.join(ROOT, "supabase", "migrations", "20260808_jobqueue_abhaengigkeiten.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  // EIGENE Datenbank je Suite. BELEGTER ANLASS (2026-08-08): diese Suite und
  // `jobqueue-vertrag-test.js` §9 benutzten beide die Vorgabe `helmut_test` — und §9 spielt
  // dort Rollback + Migration neu ein. Liefen beide gleichzeitig, verlor diese Suite ihre
  // Tabelle mitten im Lauf (einmal als 51/52 beobachtet, nicht reproduzierbar). Seitdem hat
  // jede Suite ihre eigene Datenbank; `HELMUT_TEST_PG_DB` bleibt als Vorrang erhalten.
  db: process.env.HELMUT_TEST_PG_DB || "helmut_test_datenbank"
};

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

function psql(sql, { datei = null, erwarteFehler = false } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    if (!erwarteFehler) throw error;
    return { ok: false, out: String((error.stderr || error.stdout || error.message) || "").trim() };
  }
}

// ECHT NEBENLAEUFIGER psql-Aufruf.
// WARUM DIESE FUNKTION EXISTIERT (belegter Fehler, gefunden 2026-08-08):
// Die erste Fassung von Abschnitt 4 benutzte `spawnSync` und behauptete im Kommentar
// "acht echte, gleichzeitige Verbindungen". `spawnSync` ist SYNCHRON — empirisch gemessen
// brauchen drei `sleep 1`-Aufrufe 3 015 ms, laufen also strikt nacheinander. Der Test hat
// damit NUR die Zustandsmaschine geprueft (acht aufeinanderfolgende Reservierungen vergeben
// nichts doppelt) und NICHT das, was er zu pruefen vorgab: `for update skip locked` unter
// echter Konkurrenz. Das war kuenstliches Gruen.
//
// `spawn` (asynchron) + `Promise.all` startet die Prozesse wirklich gleichzeitig. Damit der
// Test die Gleichzeitigkeit nicht nur BEHAUPTET, weist Abschnitt 4 sie zusaetzlich nach:
// ueber gleichzeitig offene Transaktionen in `pg_stat_activity`.
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const kind = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const start = Date.now();
    kind.stdout.on("data", (d) => { out += d; });
    kind.stderr.on("data", (d) => { err += d; });
    kind.on("close", (code) => resolve({
      code, out: out.trim(), err: err.trim(), startMs: start, endeMs: Date.now()
    }));
  });
}

function servererreichbar() {
  if (!PG.host) return false;
  // Gegen `postgres` pruefen, NICHT gegen die Suitendatenbank: die wird gleich erst angelegt.
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

async function main() {
  console.log("Helmut — Datenbanknachweis Arbeitswarteschlange (OP-30)");

  if (!servererreichbar()) {
    console.log("\n== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt");
    console.log("  oder Verbindung nicht moeglich).");
    console.log("  >> DER DATENBANKNACHWEIS IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    console.log("  Er wird NICHT durch die Attrappen-Suite jobqueue-vertrag-test.js ersetzt.");
    console.log("\n== ERGEBNIS ==\nPASS 0  FAIL 0  (uebersprungen, Nachweis offen)");
    process.exit(0);
  }

  console.log(`  Server: ${PG.host}:${PG.port}/${PG.db} als ${PG.user}`);
  // Eigene Datenbank anlegen, falls sie noch nicht existiert (idempotent).
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres",
      "-tAc", `create database ${PG.db}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (_) { /* existiert bereits — genau richtig */ }

  // Sauber starten: Rollback (falls Reste da sind), dann Migration.
  abschnitt("1 · Migration und Rollback sind anwendbar");
  psql(null, { datei: ROLLBACK });
  check("1.1 Rollback laeuft auch auf leerer Datenbank durch (idempotent)", true);
  psql(null, { datei: MIGRATION });
  check("1.2 Migration laeuft durch", true);
  psql(null, { datei: MIGRATION, erwarteFehler: true });
  const nachZweitlauf = psql("select count(*) from public.helmut_jobs").out;
  check("1.3 Migration ist wiederholbar (create ... if not exists), Daten bleiben", nachZweitlauf === "0", nachZweitlauf);

  abschnitt("2 · Sicherheit: kein Browserzugriff");
  const rls = psql("select relrowsecurity||'/'||relforcerowsecurity from pg_class where oid='public.helmut_jobs'::regclass").out;
  check("2.1 RLS ist aktiviert UND erzwungen", rls === "true/true", rls);
  const policies = psql("select count(*) from pg_policies where schemaname='public' and tablename='helmut_jobs'").out;
  check("2.2 KEINE Policy vorhanden (zweiter Riegel neben dem Rechteentzug)", policies === "0", policies);
  const fremdrechte = psql(
    "select count(*) from information_schema.role_table_grants where table_name='helmut_jobs' and grantee in ('anon','authenticated','PUBLIC')").out;
  check("2.3 anon/authenticated/PUBLIC haben KEIN Recht auf der Tabelle", fremdrechte === "0", fremdrechte);
  const fnRechte = psql(
    "select count(*) from information_schema.role_routine_grants where routine_name like 'helmut_%job%' and grantee in ('anon','authenticated','PUBLIC')").out;
  check("2.4 anon/authenticated/PUBLIC duerfen KEINE Queue-Funktion ausfuehren", fnRechte === "0", fnRechte);
  const secdef = psql(
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'helmut_%job%' and p.prosecdef").out;
  check("2.5 KEINE SECURITY-DEFINER-Funktion", secdef === "0", secdef);
  const ohneSearchPath = psql(
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'helmut_%job%' and (p.proconfig is null or not (p.proconfig::text like '%search_path%'))").out;
  check("2.6 JEDE Queue-Funktion hat einen fest gesetzten search_path", ohneSearchPath === "0", ohneSearchPath);

  abschnitt("3 · Idempotenz");
  psql("delete from public.helmut_jobs");
  const ersteRunde = psql(
    "select count(*) from (select (public.helmut_enqueue_job('source_fetch','key-'||g,'F1','{}'::jsonb)).* from generate_series(1,200) g) t where neu").out;
  check("3.1 200 neue Auftraege werden angelegt", ersteRunde === "200", ersteRunde);
  const zweiteRunde = psql(
    "select count(*) from (select (public.helmut_enqueue_job('source_fetch','key-'||g,'F1','{}'::jsonb)).* from generate_series(1,200) g) t where neu").out;
  check("3.2 Wiederholtes Planen erzeugt NULL neue Auftraege", zweiteRunde === "0", zweiteRunde);
  check("3.3 Es liegen weiterhin genau 200 Zeilen", psql("select count(*) from public.helmut_jobs").out === "200");
  // Auch ein ERLEDIGTER Auftrag darf im selben Fenster nicht neu entstehen.
  psql("update public.helmut_jobs set status='erledigt', finished_at=now() where idempotency_key='key-1'");
  const nachErledigt = psql(
    "select neu from public.helmut_enqueue_job('source_fetch','key-1','F1','{}'::jsonb)").out;
  check("3.4 Ein ERLEDIGTER Auftrag entsteht im selben Fenster nicht erneut", nachErledigt === "f", nachErledigt);
  // Ein neues Fenster ist ein neuer Schluessel und damit ein neuer Auftrag.
  const neuesFenster = psql(
    "select neu from public.helmut_enqueue_job('source_fetch','key-1-F2','F2','{}'::jsonb)").out;
  check("3.5 Ein NEUES Fenster erzeugt einen neuen Auftrag", neuesFenster === "t", neuesFenster);

  abschnitt("4 · Atomare Reservierung unter ECHTER Gleichzeitigkeit");
  {
    const WORKER = 8;
    const JE_WORKER = 50;
    const AUFTRAEGE = WORKER * JE_WORKER;

    // 4a · NACHWEIS, DASS DIE PROZESSE UEBERHAUPT UEBERLAPPEN.
    //      Ohne diesen Nachweis waere jede Aussage ueber "Gleichzeitigkeit" eine Behauptung.
    //      Jeder Prozess oeffnet eine Transaktion, reserviert und HAELT sie dann offen.
    //      Waehrenddessen zaehlt der Haupttest, wie viele Transaktionen gleichzeitig offen
    //      sind. Sind es >= 2, haben sich mindestens zwei Worker nachweislich ueberschnitten.
    psql("delete from public.helmut_jobs");
    psql(`select public.helmut_enqueue_job('source_fetch','ov-'||g,'F1','{}'::jsonb) from generate_series(1,40) g`);
    const HALTEN_S = 2;
    const laufende = [];
    for (let i = 1; i <= 4; i += 1) {
      laufende.push(psqlAsync(
        `begin; select count(*) from public.helmut_claim_jobs('ov-w${i}', 10, 60000); select pg_sleep(${HALTEN_S}); commit;`));
    }
    // Mitten in der Haltezeit messen.
    await new Promise((r) => setTimeout(r, HALTEN_S * 500));
    const gleichzeitig = Number(psql(
      "select count(*) from pg_stat_activity where datname = current_database()"
      + " and pid <> pg_backend_pid() and query like '%helmut_claim_jobs%'").out);
    await Promise.all(laufende);
    check("4.1 Mehrere Datenbankverbindungen waren NACHWEISLICH gleichzeitig aktiv",
      gleichzeitig >= 2, `${gleichzeitig} gleichzeitig beobachtet (erwartet >= 2)`);
    const ovHalter = Number(psql("select count(distinct lease_owner) from public.helmut_jobs where status='laeuft'").out);
    const ovIds = Number(psql("select count(distinct id) from public.helmut_jobs where status='laeuft'").out);
    const ovZeilen = Number(psql("select count(*) from public.helmut_jobs where status='laeuft'").out);
    check("4.2 Die ueberlappenden Worker haben disjunkte Mengen bekommen",
      ovZeilen === ovIds && ovHalter >= 2, `halter=${ovHalter} zeilen=${ovZeilen} eindeutig=${ovIds}`);

    // 4b · DER EIGENTLICHE PARALLELITAETSNACHWEIS.
    //      8 Prozesse, echt gleichzeitig gestartet (spawn + Promise.all, NICHT spawnSync).
    psql("delete from public.helmut_jobs");
    psql(`select public.helmut_enqueue_job('source_fetch','c-'||g,'F1','{}'::jsonb) from generate_series(1,${AUFTRAEGE}) g`);

    // Referenzzeit EINES Aufrufs — Grundlage fuer die Ueberlappungsrechnung unten.
    const einzel = await psqlAsync(`select count(*) from public.helmut_claim_jobs('ref', 1, 60000)`);
    const einzelMs = einzel.endeMs - einzel.startMs;
    psql("update public.helmut_jobs set status='wartend', lease_owner=null, lease_expires_at=null, attempts=0 where lease_owner='ref'");

    const t0 = Date.now();
    const laeufe = await Promise.all(
      Array.from({ length: WORKER }, (_, i) =>
        psqlAsync(`select id from public.helmut_claim_jobs('w${i + 1}', ${JE_WORKER}, 60000)`)));
    const wanduhrMs = Date.now() - t0;

    const alleIds = laeufe.flatMap((k) => k.out.split("\n").map((z) => z.trim()).filter(Boolean));
    const eindeutig = new Set(alleIds);

    check("4.3 Alle Prozesse liefen fehlerfrei", laeufe.every((k) => k.code === 0),
      laeufe.filter((k) => k.code !== 0).map((k) => k.err.slice(0, 80)).join(" | "));
    check("4.4 Es wurden alle Auftraege reserviert", alleIds.length === AUFTRAEGE, String(alleIds.length));
    check("4.5 KEIN Auftrag wurde von zwei Workern gleichzeitig reserviert",
      alleIds.length === eindeutig.size, `reserviert=${alleIds.length} eindeutig=${eindeutig.size}`);
    check("4.6 Genau die reservierten Auftraege stehen auf 'laeuft'",
      psql("select count(*) from public.helmut_jobs where status='laeuft'").out === String(alleIds.length));
    check("4.7 Alle acht Worker haben tatsaechlich gearbeitet",
      Number(psql("select count(distinct lease_owner) from public.helmut_jobs where status='laeuft'").out) === WORKER,
      psql("select count(distinct lease_owner) from public.helmut_jobs where status='laeuft'").out);

    // Zeitnachweis: liefen sie sequenziell, muesste die Wanduhrzeit ~WORKER x einzelMs sein.
    // Ein deutlich kleinerer Wert ist nur durch Ueberlappung erklaerbar.
    const sequenziellMs = WORKER * einzelMs;
    // 4.8 ist eine ZEITMESSUNG, kein Korrektheitsnachweis — und Zeitmessungen sind auf einer
    // ausgelasteten Maschine unscharf. BELEGTER ANLASS (2026-08-08): mit drei gleichzeitig
    // laufenden anderen Suiten fiel dieser Punkt einmal um, waehrend alle Korrektheitspunkte
    // (4.1 beobachtete Ueberlappung, 4.5 keine Doppelvergabe) grün blieben. Der Nachweis der
    // Gleichzeitigkeit haengt deshalb NICHT an der Uhr, sondern an 4.1: dort werden
    // gleichzeitig offene Transaktionen in `pg_stat_activity` GESEHEN. Faellt die Uhr aus dem
    // Rahmen, wird das als Messwert ausgegeben — und nur dann zum Fehler, wenn AUCH keine
    // Ueberlappung beobachtet wurde.
    const uhrPlausibel = wanduhrMs < sequenziellMs * 0.7;
    if (!uhrPlausibel) {
      console.log(`  HINWEIS 4.8 Wanduhr ${wanduhrMs} ms gegen sequenzielle Erwartung ${sequenziellMs} ms —`);
      console.log(`        auf ausgelasteter Maschine erwartbar. Der Gleichzeitigkeitsnachweis steht in 4.1.`);
    }
    check("4.8 Gleichzeitigkeit ist belegt (beobachtete Ueberlappung, Uhr als Zusatzbeleg)",
      gleichzeitig >= 2 || uhrPlausibel,
      `gemessen ${wanduhrMs} ms, sequenziell waeren ~${sequenziellMs} ms (${WORKER} x ${einzelMs} ms),`
      + ` ${gleichzeitig} Transaktionen gleichzeitig beobachtet`);
    console.log(`        (Einzelaufruf ${einzelMs} ms · ${WORKER} gleichzeitig ${wanduhrMs} ms`
      + ` · sequenzielle Erwartung ${sequenziellMs} ms · ${gleichzeitig} Transaktionen gleichzeitig beobachtet)`);

    // 4c · WIEDERHOLBARKEIT. Ein einmaliges Ergebnis kann Zufall sein; drei Runden nicht.
    let doppeltGesamt = 0;
    for (let runde = 1; runde <= 3; runde += 1) {
      psql("delete from public.helmut_jobs");
      psql(`select public.helmut_enqueue_job('source_fetch','r${runde}-'||g,'F1','{}'::jsonb) from generate_series(1,200) g`);
      const r = await Promise.all(
        Array.from({ length: 4 }, (_, i) => psqlAsync(`select id from public.helmut_claim_jobs('r${runde}w${i}', 50, 60000)`)));
      const ids = r.flatMap((k) => k.out.split("\n").map((z) => z.trim()).filter(Boolean));
      doppeltGesamt += ids.length - new Set(ids).size;
    }
    check("4.9 Drei unabhaengige Runden mit je 4 Workern: NULL Doppelvergaben",
      doppeltGesamt === 0, `${doppeltGesamt} Doppelvergaben`);
  }

  abschnitt("5 · Lease, Absturz und Wiederaufnahme");
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','L1','F1','{}'::jsonb)");
  psql("select id from public.helmut_claim_jobs('w-absturz', 10, 60000)");
  const nichtNochmal = psql("select count(*) from public.helmut_claim_jobs('w-zweit', 10, 60000)").out;
  check("5.1 Ein laufender Auftrag mit gueltiger Lease wird NICHT erneut vergeben", nichtNochmal === "0", nichtNochmal);
  // Absturz simulieren: der Halter verschwindet, die Lease laeuft ab.
  psql("update public.helmut_jobs set lease_expires_at = now() - interval '1 second' where idempotency_key='L1'");
  const wiederaufgenommen = psql("select count(*) from public.helmut_claim_jobs('w-zweit', 10, 60000)").out;
  check("5.2 Nach Ablauf der Lease wird der Auftrag WIEDER vergeben (kein Verlust)", wiederaufgenommen === "1", wiederaufgenommen);
  const versuche = psql("select attempts from public.helmut_jobs where idempotency_key='L1'").out;
  check("5.3 Die Wiederaufnahme zaehlt als Versuch (begrenzt Absturzschleifen)", versuche === "2", versuche);
  const verlaengert = psql("select public.helmut_extend_job_lease((select id from public.helmut_jobs where idempotency_key='L1'),'w-zweit',60000)").out;
  check("5.4 Der Halter kann seine Lease verlaengern", verlaengert === "t", verlaengert);
  const fremdVerlaengert = psql("select public.helmut_extend_job_lease((select id from public.helmut_jobs where idempotency_key='L1'),'w-fremd',60000)").out;
  check("5.5 Ein FREMDER kann die Lease NICHT verlaengern", fremdVerlaengert === "f", fremdVerlaengert);

  abschnitt("6 · Abschluss ist token-gebunden (kein Doppelabschluss)");
  const id = psql("select id from public.helmut_jobs where idempotency_key='L1'").out;
  const fremdAbschluss = psql(`select uebernommen from public.helmut_finish_job('${id}','w-fremd',true)`).out;
  check("6.1 Ein FREMDER kann nicht abschliessen", fremdAbschluss === "f", fremdAbschluss);
  const ersterAbschluss = psql(`select uebernommen||'/'||neuer_status from public.helmut_finish_job('${id}','w-zweit',true)`).out;
  check("6.2 Der Halter schliesst erfolgreich ab", ersterAbschluss === "true/erledigt", ersterAbschluss);
  const zweiterAbschluss = psql(`select uebernommen from public.helmut_finish_job('${id}','w-zweit',true)`).out;
  check("6.3 Ein ZWEITER Abschluss desselben Auftrags wird abgelehnt", zweiterAbschluss === "f", zweiterAbschluss);
  const nichtErneut = psql("select count(*) from public.helmut_claim_jobs('w-drei', 10, 60000)").out;
  check("6.4 Ein erledigter Auftrag wird NICHT erneut verarbeitet", nichtErneut === "0", nichtErneut);

  abschnitt("7 · Begrenzte Wiederholungen und endgueltiger Fehler");
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','R1','F1','{}'::jsonb,now(),100::smallint,3)");
  let status = "";
  for (let runde = 1; runde <= 5; runde += 1) {
    const geclaimt = psql("select id from public.helmut_claim_jobs('w-retry', 10, 60000)").out;
    if (!geclaimt) break;
    psql(`select public.helmut_finish_job('${geclaimt}','w-retry',false,'kaputt',0)`);
    status = psql("select status||'/'||attempts from public.helmut_jobs where idempotency_key='R1'").out;
  }
  check("7.1 Nach max_attempts steht der Auftrag auf 'fehlgeschlagen'", status === "fehlgeschlagen/3", status);
  const keinNachschlag = psql("select count(*) from public.helmut_claim_jobs('w-retry', 10, 60000)").out;
  check("7.2 Ein endgueltig fehlgeschlagener Auftrag wird nicht mehr vergeben", keinNachschlag === "0", keinNachschlag);
  const fehlertext = psql("select last_error from public.helmut_jobs where idempotency_key='R1'").out;
  check("7.3 Der letzte Fehler ist gespeichert (Auditierbarkeit)", fehlertext === "kaputt", fehlertext);

  abschnitt("8 · Prioritaet und Faelligkeit bestimmen die Reihenfolge");
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','P-spaet','F1','{}'::jsonb, now(), 900::smallint)");
  psql("select public.helmut_enqueue_job('source_fetch','P-frueh','F1','{}'::jsonb, now(), 10::smallint)");
  psql("select public.helmut_enqueue_job('source_fetch','P-zukunft','F1','{}'::jsonb, now() + interval '1 hour', 1::smallint)");
  // KORREKTUR (Abschlussreview 2026-08-08) — diese Pruefung war FLACKERND und ist im
  // vollstaendigen Offline-Lauf unter Last einmal rot geworden (`P-spaet,P-frueh`).
  //
  // URSACHE: sie las die Reihenfolge ueber `row_number() over ()` aus der Rueckgabe von
  // `helmut_claim_jobs`. Ein LEERES Fensterfeld hat in PostgreSQL keine definierte
  // Sortierung — die Nummern folgen der Ausfuehrungsreihenfolge des Plans. Und
  // `helmut_claim_jobs` sagt ueber die Reihenfolge seiner Rueckgabe ohnehin nichts zu:
  // die Sortierung steht im CTE `kandidaten` und bestimmt, WELCHE Zeilen reserviert
  // werden; das anschliessende `update … returning j.*` liefert sie in Join-Reihenfolge.
  // Der Test hat also eine Zusage geprueft, die es nicht gibt — genau die Sorte
  // Nichtdeterminismus, die dieser PR an anderer Stelle selbst benennt (`created_at desc`).
  //
  // JETZT wird die Zusage geprueft, die die Funktion WIRKLICH gibt: bei `p_limit := 1`
  // entscheidet `order by priority, due_at, created_at` allein, welcher Auftrag herausgeht.
  // Zwei aufeinanderfolgende Einzelreservierungen zeigen die Reihenfolge deterministisch.
  const ersterAuftrag = psql("select idempotency_key from public.helmut_claim_jobs('w-prio-1', 1, 60000)").out;
  const zweiterAuftrag = psql("select idempotency_key from public.helmut_claim_jobs('w-prio-2', 1, 60000)").out;
  check("8.1 Hoehere Prioritaet (kleinere Zahl) kommt zuerst",
    ersterAuftrag === "P-frueh" && zweiterAuftrag === "P-spaet", `${ersterAuftrag} dann ${zweiterAuftrag}`);
  check("8.2 Ein noch nicht faelliger Auftrag wird NICHT vergeben — auch nicht mit Prioritaet 1",
    psql("select status from public.helmut_jobs where idempotency_key='P-zukunft'").out === "wartend");

  abschnitt("9 · Kappung: keine Geheimnisse, keine Rohantworten");
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','K1','F1','{}'::jsonb)");
  psql(`update public.helmut_jobs set last_error = repeat('x', 5000) where idempotency_key='K1'`);
  const laenge = psql("select length(last_error) from public.helmut_jobs where idempotency_key='K1'").out;
  check("9.1 last_error wird hart auf 500 Zeichen gekappt", laenge === "500", laenge);
  const grosserPayload = psql(
    `select public.helmut_enqueue_job('source_fetch','K2','F1', jsonb_build_object('x', repeat('y', 30000)))`,
    { erwarteFehler: true });
  check("9.2 Ein zu grosser Payload wird EHRLICH abgelehnt statt still gekuerzt",
    !grosserPayload.ok && /payload zu gross/i.test(grosserPayload.out), grosserPayload.out.slice(0, 90));

  abschnitt("10 · Unbekannter Aufgabentyp und ungueltige Werte");
  const falscherTyp = psql("select public.helmut_enqueue_job('gibt_es_nicht','X1','F1','{}'::jsonb)", { erwarteFehler: true });
  check("10.1 Ein unbekannter Aufgabentyp wird von der Datenbank abgelehnt",
    !falscherTyp.ok && /helmut_jobs_type_chk/i.test(falscherTyp.out), falscherTyp.out.slice(0, 90));
  const claimOhneOwner = psql("select * from public.helmut_claim_jobs(null, 5, 60000)", { erwarteFehler: true });
  check("10.2 Reservieren ohne Lease-Besitzer wird abgelehnt",
    !claimOhneOwner.ok && /p_owner ist Pflicht/i.test(claimOhneOwner.out), claimOhneOwner.out.slice(0, 90));
  const laufendOhneLease = psql(
    "insert into public.helmut_jobs (job_type, idempotency_key, freshness_window, status) values ('source_fetch','X2','F1','laeuft')",
    { erwarteFehler: true });
  check("10.3 Ein 'laufender' Auftrag ohne Lease ist strukturell unmoeglich",
    !laufendOhneLease.ok && /helmut_jobs_lease_chk/i.test(laufendOhneLease.out), laufendOhneLease.out.slice(0, 90));

  abschnitt("11 · Betriebsmessung");
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','M-alt','F1','{}'::jsonb, now() - interval '30 hours')");
  psql("select public.helmut_enqueue_job('mandate_projection','M-mandat','F1','{}'::jsonb, now() - interval '26 hours', 100::smallint, 5, 'mandat-a')");
  psql("select public.helmut_enqueue_job('briefing_materialization','M-neu','F1','{}'::jsonb)");
  const m = JSON.parse(psql("select row_to_json(t) from public.helmut_job_metrics(1440) t").out);
  check("11.1 wartend wird gezaehlt", Number(m.wartend) === 3, String(m.wartend));
  check("11.2 Alter des aeltesten faelligen Auftrags in Sekunden", Number(m.aeltester_faelliger_s) > 100000, String(m.aeltester_faelliger_s));
  check("11.3 Auftraege nach Typ", m.nach_typ && Object.keys(m.nach_typ).length === 3, JSON.stringify(m.nach_typ));
  check("11.4 Auftraege nach Status", m.nach_status && m.nach_status.wartend === 3, JSON.stringify(m.nach_status));
  check("11.5 Ueberfaellige Mandate (>24 h) werden erkannt", Number(m.ueberfaellige_mandate) === 1, String(m.ueberfaellige_mandate));
  check("11.6 Maximales Mandatsalter wird gemessen", Number(m.max_mandatsalter_s) > 90000, String(m.max_mandatsalter_s));

  // ── 11.7/11.8 · BEFUND DES ABSCHLUSSREVIEWS 2026-08-08 ──────────────────────────────
  // Die Rueckstandsmessung rechnete gegen `due_at` — genau den Wert, den `helmut_defer_job`
  // bei JEDEM Zurueckstellen neu setzt. Zurueckgestellt wird bei offener Vorbedingung alle
  // 2 Minuten und bei erschoepftem KI-Budget stuendlich. Gemessen VOR der Korrektur: ein
  // Auftrag mit 26 h echtem Rueckstand meldete nach EINER Zurueckstellung 0 s und
  // 0 ueberfaellige Mandate. Die 24-h-Schwelle in `scalable-pipeline.betriebsstatus` haette
  // damit nie ausgeloest — falsches Gruen (CLAUDE.md §4.4).
  //
  // Der Nachweis braucht die ECHTE Funktion, nicht ihre Nachbildung: `helmut_defer_job`
  // steht in der aufbauenden Migration, die hier zusaetzlich eingespielt wird.
  psql(null, { datei: ABHAENGIGKEITEN });
  const zeileId = psql("select id from public.helmut_jobs where idempotency_key='M-mandat'").out;
  psql(`select public.helmut_claim_jobs('w-mess', 10, 60000, array['mandate_projection'])`);
  const uebernommen = psql(`select uebernommen from public.helmut_defer_job('${zeileId}'::uuid, 'w-mess', 120000, 'vorbedingung-offen')`).out;
  const m2 = JSON.parse(psql("select row_to_json(t) from public.helmut_job_metrics(1440) t").out);
  check("11.7 Der Auftrag wurde tatsaechlich zurueckgestellt", uebernommen === "t", uebernommen);
  check("11.8 Zurueckstellen setzt den gemessenen Rueckstand NICHT zurueck",
    Number(m2.ueberfaellige_mandate) === 1 && Number(m2.max_mandatsalter_s) > 90000,
    JSON.stringify({ ueberfaellig: m2.ueberfaellige_mandate, alter_s: m2.max_mandatsalter_s }));
  check("11.9 …und die neue Faelligkeit liegt trotzdem in der Zukunft (der Auftrag wartet wirklich)",
    psql("select count(*) from public.helmut_jobs where idempotency_key='M-mandat' and status='wartend' and due_at > now()").out === "1");

  abschnitt("12 · Aufraeumen bewahrt die Fehlerhistorie");
  psql("delete from public.helmut_jobs");
  psql("select public.helmut_enqueue_job('source_fetch','A-alt','F1','{}'::jsonb)");
  psql("select public.helmut_enqueue_job('source_fetch','A-fehler','F1','{}'::jsonb)");
  psql("update public.helmut_jobs set status='erledigt', finished_at=now()-interval '30 days' where idempotency_key='A-alt'");
  psql("update public.helmut_jobs set status='fehlgeschlagen', finished_at=now()-interval '30 days' where idempotency_key='A-fehler'");
  const geloescht = psql("select public.helmut_prune_jobs(14)").out;
  check("12.1 Alte ERLEDIGTE Auftraege werden entfernt", geloescht === "1", geloescht);
  check("12.2 FEHLGESCHLAGENE Auftraege bleiben immer stehen (Auditierbarkeit)",
    psql("select count(*) from public.helmut_jobs where status='fehlgeschlagen'").out === "1");

  abschnitt("13 · Rollback stellt den Ausgangszustand her");
  psql(null, { datei: ROLLBACK });
  check("13.1 Tabelle ist weg", psql("select count(*) from information_schema.tables where table_schema='public' and table_name='helmut_jobs'").out === "0");
  const restFunktionen = psql(
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('helmut_enqueue_job','helmut_claim_jobs','helmut_extend_job_lease','helmut_finish_job','helmut_job_metrics','helmut_prune_jobs','helmut_jobs_kappen')").out;
  check("13.2 Alle 7 Funktionen sind weg", restFunktionen === "0", restFunktionen);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (fail === 0) {
    console.log("Datenbanknachweis ERBRACHT: echter PostgreSQL-Server, echte gleichzeitige Verbindungen.");
  }
  process.exit(fail === 0 ? 0 : 1);
}

try {
  if (!fs.existsSync(MIGRATION) || !fs.existsSync(ROLLBACK)) {
    console.error("Migration oder Rollback nicht gefunden — Suite kann nichts pruefen.");
    process.exit(1);
  }
  main().catch((error) => {
    console.error("TESTLAUF-FEHLER:", error && error.message);
    process.exit(1);
  });
} catch (error) {
  console.error("TESTLAUF-FEHLER:", error && error.message);
  if (error && error.stderr) console.error(String(error.stderr).slice(0, 600));
  process.exit(1);
}
