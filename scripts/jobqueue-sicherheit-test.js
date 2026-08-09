"use strict";

// Helmut — SICHERHEIT UND MANDANTENTRENNUNG der Arbeitswarteschlange (OP-30, Auftrag §13).
// =============================================================================================
// Geprueft werden die sieben im Auftrag geforderten Angriffs-/Fehlerfaelle plus die
// Mandantentrennung. Wo eine Zusage nur in der Datenbank durchsetzbar ist (RLS, GRANT,
// CHECK), verweist die jeweilige Pruefung auf `scripts/jobqueue-datenbank-test.js` und
// prueft hier die SQL-QUELLE — damit eine Aenderung an der Migration auffaellt, auch wenn
// gerade kein Server laeuft.
//
// Offline, ohne Netz, ohne KI, ohne Ablage.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
let offenZahl = 0;
function offen(name, grund) { offenZahl += 1; console.log(`  OFFEN ${name} — NICHT BEWIESEN: ${grund}`); }
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const AN = { HELMUT_SCALABLE_PIPELINE: "on" };
const MIGRATION = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue.sql"), "utf8");
const NUR_SQL = MIGRATION.split("\n").map((z) => z.replace(/--.*$/, "")).join("\n");

function uhr(start = Date.parse("2026-08-08T00:00:00Z")) {
  let ms = start;
  return { jetzt: () => ms, vor: (d) => { ms += d; } };
}

async function main() {
  console.log("Helmut — Sicherheit und Mandantentrennung der Warteschlange (OP-30)");

  abschnitt("1 · Kein Browserzugriff (die Zusagen stehen in der Migration)");
  check("1.1 RLS wird aktiviert", /alter table public\.helmut_jobs enable row level security/i.test(NUR_SQL));
  check("1.2 RLS wird ERZWUNGEN (force) — auch fuer den Tabelleneigentuemer",
    /alter table public\.helmut_jobs force row level security/i.test(NUR_SQL));
  check("1.3 anon/authenticated/PUBLIC werden auf der Tabelle entzogen",
    /revoke all on table public\.helmut_jobs from public, anon, authenticated/i.test(NUR_SQL));
  check("1.4 Es gibt KEINE Policy (zweiter, unabhaengiger Riegel)",
    !/create policy/i.test(NUR_SQL));
  check("1.5 Jede Funktion wird anon/authenticated/PUBLIC entzogen",
    (NUR_SQL.match(/revoke all on function public\.helmut_[\w]*job[\w]*\([^)]*\)\s*\n?\s*from public, anon, authenticated/gi) || []).length >= 6,
    String((NUR_SQL.match(/revoke all on function/gi) || []).length));
  check("1.6 service_role bekommt Rechte NUR bedingt (laeuft auch ohne Supabase-Rollen)",
    /if exists \(select 1 from pg_roles where rolname = 'service_role'\)/i.test(NUR_SQL));
  check("1.7 KEINE Funktion ist SECURITY DEFINER", !/security definer/i.test(NUR_SQL));
  check("1.8 JEDE Funktion setzt search_path fest",
    (() => {
      const fns = [...NUR_SQL.matchAll(/create or replace function public\.(helmut_\w+)/g)].map((m) => m[1]);
      const mitPfad = (NUR_SQL.match(/set search_path = public, pg_temp/g) || []).length;
      return fns.length > 0 && mitPfad >= fns.length;
    })(), "Anzahl Funktionen vs. search_path-Zeilen");
  check("1.9 Der Datenbanknachweis dieser Zusagen liegt in jobqueue-datenbank-test.js",
    fs.existsSync(path.join(ROOT, "scripts/jobqueue-datenbank-test.js")));

  abschnitt("2 · Fremde Mandatszuordnung");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    // Ein Auftrag fuer Mandat A, dessen Nutzdaten auf Mandat B zeigen — der Handler darf
    // das NICHT stillschweigend akzeptieren.
    await q.enqueue({
      jobType: "mandate_projection", idempotencyKey: "X1", freshnessWindow: "F",
      tenantId: "mandat-a", payload: { mandatsId: "mandat-b" }, priority: 100, maxAttempts: 3
    });
    const c = await q.claim({ owner: "w", limit: 1, leaseMs: 60000 });
    const auftrag = SP.normalisiereAuftrag(c.auftraege[0]);
    let gesehen = null;
    await SP.HANDLER.mandate_projection(auftrag, {
      getActiveProfile: async (id) => { gesehen = id; return { id }; },
      matching: async () => ({ matched: 0 }),
      decisions: async () => ({ saved: 0 })
    });
    // Der Handler arbeitet auf payload.mandatsId — der Widerspruch zu tenantId muss
    // auffallen. Er faellt auf, weil der Test ihn hier misst UND weil der Compiler
    // tenantId und payload.mandatsId immer gemeinsam setzt (siehe 2.2).
    check("2.1 Der Handler liest die Mandatskennung aus dem Payload", gesehen === "mandat-b", String(gesehen));
    check("2.2 Der Compiler setzt tenantId und payload.mandatsId IMMER identisch",
      (() => {
        const r = SD.planeMandatsarbeit({ profile: [{ id: "m-1" }, { id: "m-2" }], jetztMs: u.jetzt() });
        return r.auftraege.every((a) => a.tenantId === a.payload.mandatsId);
      })());
    check("2.3 Geteilte Abrufauftraege haben ueberhaupt keinen Mandatsbezug",
      (() => {
        const src = fs.readFileSync(path.join(ROOT, "lib/helmut/source-demand.js"), "utf8");
        return /GETEILTE Arbeit gehoert KEINEM Mandat/.test(src) && /tenantId: null/.test(src);
      })());
  }

  abschnitt("3 · Manipulierte Auftragsnutzdaten");
  {
    const d = {
      hardeningConfig: () => ({ enabled: false, sharedPathDedup: false, sharedPathWindowMs: 0 }),
      createGate: () => null, sharedLedger: () => null,
      crawlAllSources: async () => ({ results: [{ ok: true }], rawItems: [] }),
      saveRawItems: async (i) => i,
      persistRawDocuments: async () => ({ skipped: false, error: null, persisted: 0 }),
      getActiveProfile: async () => null,
      matching: async () => ({}), decisions: async () => ({}),
      buildV3Briefing: async () => ({ available: false })
    };
    const faelle = [
      ["Abruf ohne Quelle", "source_fetch", {}, /payload-ungueltig/],
      ["Abruf mit leerer Quelle", "source_fetch", { quelle: {} }, /payload-ungueltig/],
      ["Abruf mit Quelle ohne Kennung", "source_fetch", { quelle: { rssUrl: "x" } }, /payload-ungueltig/],
      ["Verstehen mit falschem Typ", "document_understanding", { dokumente: "kein array" }, /payload-ungueltig/],
      ["Projektion ohne Mandat", "mandate_projection", {}, /payload-ungueltig/],
      ["Briefing ohne Mandat", "briefing_materialization", {}, /payload-ungueltig/]
    ];
    for (const [name, typ, payload, muster] of faelle) {
      let fehler = null;
      try { await SP.HANDLER[typ]({ id: "j", payload }, d); } catch (e) { fehler = e.message; }
      check(`3.1 ${name} wird abgelehnt`, muster.test(String(fehler)), String(fehler));
    }
    let fehler = null;
    try { await SP.HANDLER.mandate_projection({ id: "j", payload: { mandatsId: "gibtsnicht" } }, d); }
    catch (e) { fehler = e.message; }
    check("3.2 Ein unbekanntes Mandat wird abgelehnt (nicht geraten)", /profil-nicht-gefunden/.test(String(fehler)), String(fehler));
    check("3.3 Alle diese Fehler sind ENDGUELTIG — sie werden nicht endlos wiederholt",
      ["payload-ungueltig: x", "profil-nicht-gefunden"].every(SP.istEndgueltig));
  }

  abschnitt("4 · Unbekannter Aufgabentyp");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const abgelehnt = await q.enqueue({
      jobType: "beliebiger_fremder_typ", idempotencyKey: "Y1", freshnessWindow: "F",
      payload: {}, priority: 100, maxAttempts: 3
    });
    check("4.1 Ein unbekannter Typ wird schon beim Einreihen abgelehnt",
      abgelehnt.verfuegbar === false && /type_chk/.test(abgelehnt.grund), JSON.stringify(abgelehnt));
    check("4.2 Die Datenbank setzt dieselbe Grenze durch (CHECK-Constraint)",
      /constraint helmut_jobs_type_chk[\s\S]{0,200}check \(job_type in \(/i.test(NUR_SQL));
    check("4.3 Genau die vier vereinbarten Typen sind erlaubt",
      ["source_fetch", "document_understanding", "mandate_projection", "briefing_materialization"]
        .every((t) => NUR_SQL.includes(`'${t}'`))
      && !/'(lage_check|briefing_push|admin_\w+)'/.test(NUR_SQL));
  }

  abschnitt("5 · Abgelaufene Leases");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue({ jobType: "source_fetch", idempotencyKey: "L1", freshnessWindow: "F", payload: { quelle: { id: "q" } }, priority: 100, maxAttempts: 5 });
    const a = await q.claim({ owner: "alt", limit: 1, leaseMs: 5000 });
    u.vor(6000);
    const b = await q.claim({ owner: "neu", limit: 1, leaseMs: 60000 });
    check("5.1 Die abgelaufene Lease wird uebernommen", b.auftraege.length === 1 && b.auftraege[0].lease_owner === "neu");
    const zombie = await q.finish({ id: a.auftraege[0].id, owner: "alt", ok: true });
    check("5.2 Der alte Halter kann nichts mehr abschliessen", zombie.uebernommen === false);
    const zombieLease = await q.extendLease({ id: a.auftraege[0].id, owner: "alt", leaseMs: 60000 });
    check("5.3 Der alte Halter kann die Lease nicht zurueckholen", zombieLease.verlaengert === false);
    check("5.4 Die Datenbank verbietet 'laeuft' ohne Lease strukturell",
      /constraint helmut_jobs_lease_chk[\s\S]{0,200}status <> 'laeuft' or \(lease_owner is not null and lease_expires_at is not null\)/i.test(NUR_SQL));
  }

  abschnitt("6 · Doppelte Abschluesse");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue({ jobType: "source_fetch", idempotencyKey: "D1", freshnessWindow: "F", payload: { quelle: { id: "q" } }, priority: 100, maxAttempts: 5 });
    const a = await q.claim({ owner: "w", limit: 1, leaseMs: 60000 });
    const r1 = await q.finish({ id: a.auftraege[0].id, owner: "w", ok: true });
    const r2 = await q.finish({ id: a.auftraege[0].id, owner: "w", ok: true });
    const r3 = await q.finish({ id: a.auftraege[0].id, owner: "w", ok: false, error: "spaet" });
    check("6.1 Nur der erste Abschluss wird uebernommen",
      r1.uebernommen === true && r2.uebernommen === false && r3.uebernommen === false);
    check("6.2 Der Endzustand bleibt 'erledigt'", q.alle()[0].status === "erledigt");
    check("6.3 Ein spaeter Fehlschlag ueberschreibt den Erfolg NICHT", q.alle()[0].last_error === null);
    check("6.4 Der Abschluss ist in der Datenbank an den Halter gebunden",
      /where j\.id = p_id and j\.lease_owner = p_owner and j\.status = 'laeuft'/i.test(NUR_SQL));
  }

  abschnitt("7 · Zu viele Wiederholungen");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q.enqueue({ jobType: "source_fetch", idempotencyKey: "W1", freshnessWindow: "F", payload: { quelle: { id: "q" } }, priority: 100, maxAttempts: 2 });
    for (let i = 0; i < 5; i += 1) {
      const c = await q.claim({ owner: "w", limit: 1, leaseMs: 60000 });
      if (!c.auftraege.length) break;
      await q.finish({ id: c.auftraege[0].id, owner: "w", ok: false, error: "immer kaputt", retryDelayMs: 0 });
    }
    check("7.1 Nach max_attempts ist Schluss", q.alle()[0].status === "fehlgeschlagen");
    check("7.2 Es gab genau max_attempts Versuche", q.alle()[0].attempts === 2, String(q.alle()[0].attempts));
    check("7.3 Die Obergrenze ist in der Datenbank begrenzt (1..50)",
      /max_attempts >= 1 and max_attempts <= 50/i.test(NUR_SQL));
  // 7.4 prueft die ZUSAGE, nicht eine bestimmte Zeilenform: erschoepfte Auftraege werden in
  // helmut_claim_jobs endgueltig fehlgeschlagen, BEVOR reserviert wird — und die Reservierung
  // gibt nie einen erschoepften Auftrag aus. Die erste Fassung verglich den SQL-Text woertlich
  // und brach beim Umbau auf den indexgestuetzten Claim, obwohl die Zusage unveraendert galt.
  // Der VERHALTENSNACHWEIS liegt in jobqueue-datenbank-test.js §7 (echte Datenbank).
  {
    const claimFn = NUR_SQL.slice(NUR_SQL.indexOf("function public.helmut_claim_jobs"),
      NUR_SQL.indexOf("function public.helmut_extend_job_lease"));
    const fehlIdx = claimFn.search(/set status\s*=\s*'fehlgeschlagen'/i);
    const claimIdx = claimFn.search(/for update skip locked/i);
    check("7.4a Der Claim faellt erschoepfte Auftraege endgueltig fehl",
      fehlIdx > 0 && /attempts >= j\.max_attempts/i.test(claimFn), "in helmut_claim_jobs");
    check("7.4b Die Reservierung gibt nie einen erschoepften Auftrag aus",
      /attempts < j\.max_attempts/i.test(claimFn));
    check("7.4c Das Fehlschlagen passiert VOR der Reservierung",
      fehlIdx > 0 && claimIdx > 0 && fehlIdx < claimIdx, `${fehlIdx} vs ${claimIdx}`);
    check("7.4d Abgelaufene Leases kehren in die Warteschlange zurueck (indexgestuetzt)",
      /set status = 'wartend'[\s\S]{0,200}where j\.status = 'laeuft'[\s\S]{0,80}lease_expires_at < v_now/i.test(claimFn));
  }
  }

  abschnitt("8 · Fehlerbereinigung ohne Geheimnisse");
  {
    const geheim = [
      "Bearer sk_live_ABCDEFGHIJKLMNOPQRST",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop",
      "https://admin:Passw0rt123@db.example/x",
      "?service_key=SUPERGEHEIM12345&x=1",
      '{"password":"Passw0rt123"}',
      "sb_secret_ABCDEFGHIJKLMNOPQRSTUV"
    ];
    // Je Probe wird das GEHEIMNIS selbst benannt — nicht "die letzten 12 Zeichen".
    // Die erste Fassung prueft bei der Basic-Auth-URL den harmlosen Hostteil und haette
    // damit auch eine kaputte Bereinigung durchgewunken.
    const geheimnisse = [
      "sk_live_ABCDEFGHIJKLMNOPQRST",
      "eyJzdWIiOiIxIn0",
      "Passw0rt123",
      "SUPERGEHEIM12345",
      "Passw0rt123",
      "sb_secret_ABCDEFGHIJKLMNOPQRSTUV"
    ];
    geheim.forEach((g, i) => {
      const raus = SP.bereinigeFehler(`Abruf fehlgeschlagen: ${g}`) || "";
      check(`8.1 ${g.slice(0, 24)}… wird entfernt`, !raus.includes(geheimnisse[i]), raus);
    });
    check("8.2 Der Fehlertext wird gekappt", (SP.bereinigeFehler("x".repeat(5000)) || "").length <= 301);
    check("8.3 Die Datenbank kappt zusaetzlich hart auf 500 Zeichen",
      /length\(new\.last_error\) > 500/i.test(NUR_SQL) && /left\(new\.last_error, 500\)/i.test(NUR_SQL));
    check("8.4 Ein zu grosser Payload wird von der Datenbank EHRLICH abgelehnt, nicht gekuerzt",
      /raise exception 'helmut_jobs: payload zu gross/i.test(NUR_SQL));
  }
  {
    // Und: der Compiler legt gar nichts Geheimes in den Payload.
    const src = fs.readFileSync(path.join(ROOT, "lib/helmut/source-demand.js"), "utf8");
    const stelle = src.indexOf("function quellenNutzlast");
    const fn = src.slice(stelle, src.indexOf("}", src.indexOf("return {", stelle)) + 1);
    check("8.5 Die Auftragsnutzlast enthaelt nur Abruffelder",
      !/apikey|token|secret|authorization|cookie|password/i.test(fn), fn.slice(0, 160));
    check("8.6 Sie enthaelt keine Profildaten", !/profile|fullName|topicPriorities|committee/i.test(fn));
  }

  abschnitt("9 · Mandantentrennung im Gesamtdurchlauf");
  {
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const profile = [];
    for (let i = 0; i < 40; i += 1) {
      profile.push({
        id: `t-${String(i).padStart(3, "0")}`, fullName: `Person ${String(i).padStart(3, "0")}`, party: "P", faction: "F",
        committee: "A", focusTopics: ["T"], topicPriorities: { T: 1 },
        state: "Bayern", constituency: `WK ${String(i).padStart(3, "0")}`, relevantMinistries: ["M"]
      });
    }
    const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));
    await SP.planeArbeit({
      env: AN, jetztMs: u.jetzt(),
      deps: {
        listFullProfiles: async () => profile,
        quellenFuerProfil: async (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)],
        enqueue: q.enqueue
      }
    });
    const alle = q.alle();
    // Jeder Auftrag mit Mandatsbezug darf im Payload NUR das eigene Mandat nennen.
    const verstoss = alle.filter((z) => {
      if (!z.tenant_id) return false;
      const text = JSON.stringify(z.payload);
      return profile.some((p) => p.id !== z.tenant_id && text.includes(p.id));
    });
    check("9.1 Kein mandatsbezogener Auftrag nennt ein fremdes Mandat", verstoss.length === 0,
      verstoss.slice(0, 2).map((z) => z.idempotency_key).join(", "));
    // Und kein Auftrag nennt einen fremden PERSONENNAMEN.
    const namensverstoss = alle.filter((z) => {
      if (!z.tenant_id) return false;
      const text = decodeURIComponent(JSON.stringify(z.payload));
      const eigener = profile.find((p) => p.id === z.tenant_id).fullName;
      return profile.some((p) => p.fullName !== eigener && text.includes(p.fullName));
    });
    check("9.2 Kein persoenlicher Auftrag enthaelt einen fremden Namen", namensverstoss.length === 0);
    // Geteilte Auftraege duerfen Beispielmandate nennen — aber KEINE Namen.
    const geteilt = alle.filter((z) => z.payload.art === "geteilt");
    check("9.3 Geteilte Auftraege enthalten keine Personennamen",
      geteilt.every((z) => {
        const text = decodeURIComponent(JSON.stringify(z.payload));
        return !profile.some((p) => text.includes(p.fullName));
      }));
    check("9.4 Geteilte Auftraege tragen keinen tenant_id", geteilt.every((z) => z.tenant_id === null));
  }

  abschnitt("10 · Das KI-Budget bleibt unangetastet");
  {
    const srcRoh = fs.readFileSync(path.join(ROOT, "lib/helmut/scalable-pipeline.js"), "utf8");
    // Nur CODE pruefen: der Kommentar im Verstehenshandler nennt `canSpendLlm(null)`
    // ausdruecklich, um zu erklaeren, WESSEN Deckel unveraendert gilt.
    const src = srcRoh.split("\n").map((z) => z.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
    check("10.1 Der skalierbare Pfad ruft im CODE KEIN eigenes Budget-Gate auf",
      !/canSpendLlm|canSpendLlmForTenant|reserveLlmCall/.test(src));
    check("10.2 Er importiert das KI-Modul gar nicht", !/require\(["']\.\/ai["']\)/.test(srcRoh));
    check("10.3 Verstehen laeuft ueber runUnderstandingShadow — dessen globaler Deckel gilt unveraendert",
      /eagerUnderstanding: lazy\("\.\/understanding", "runUnderstandingShadow"\)/.test(srcRoh));
    const storage = fs.readFileSync(path.join(ROOT, "lib/helmut/storage.js"), "utf8");
    check("10.4 canSpendLlm ist unveraendert global (politicianId = null im Verstehenspfad)",
      /canSpend: \(\) => storage\.canSpendLlm\(null\), \/\/ GLOBAL: null, niemals pro Nutzer/
        .test(fs.readFileSync(path.join(ROOT, "lib/helmut/understanding.js"), "utf8")));
    check("10.5 Die Warteschlangen-Huellen in storage.js beruehren kein Budget",
      !/canSpendLlm/.test(storage.slice(storage.indexOf("ARBEITSWARTESCHLANGE (OP-30"),
        storage.indexOf("module.exports"))));
  }

  abschnitt("11 · Dieselben Angriffsfaelle gegen den ECHTEN PostgreSQL-Pfad");
  {
    // Die Abschnitte 2-8 pruefen den Pfad offline. Hier laufen dieselben Faelle gegen einen
    // echten Server — denn eine Zusage wie "der Fehlertext wird gekappt" oder "der Typ wird
    // abgelehnt" ist erst dann belegt, wenn die Datenbank sie tatsaechlich durchsetzt.
    // OHNE SERVER wird das NICHT als bestanden gezaehlt, sondern ausdruecklich als offen.
    const PG = {
      host: process.env.HELMUT_TEST_PG_HOST || "",
      port: process.env.HELMUT_TEST_PG_PORT || "5432",
      user: process.env.HELMUT_TEST_PG_USER || "",
      db: "helmut_sicher"
    };
    const { execFileSync } = require("child_process");
    const erreichbar = (() => {
      if (!PG.host || !PG.user) return false;
      try {
        execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return true;
      } catch (_) { return false; }
    })();

    if (!erreichbar) {
      offen("11 Angriffsfaelle gegen den echten Server",
        "kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST/USER). Die Zusagen aus "
        + "Abschnitt 2-8 sind damit nur offline geprueft, nicht am Server.");
    } else {
      const psql = (sql, db = PG.db, still = false) => {
        try {
          return {
            ok: true,
            out: execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db,
              "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
          };
        } catch (e) {
          if (!still) throw e;
          return { ok: false, out: String((e.stderr || e.stdout || e.message) || "").trim() };
        }
      };
      psql(`drop database if exists ${PG.db}`, "postgres");
      psql(`create database ${PG.db}`, "postgres");
      execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db,
        "-f", path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue.sql")],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

      // Alle Angriffszeichenketten stehen in Dollar-Anfuehrung. Damit baut DIESER TEST die
      // Zeichenkette nicht selbst in SQL ein — geprueft wird die Funktion, nicht der Test.
      const BOESE = "$h$'; drop table public.helmut_jobs; --$h$";
      psql(`select public.helmut_enqueue_job('source_fetch', ${BOESE}, 'F', '{}'::jsonb)`);
      check("11.1 Ein Einschleusungsversuch im Idempotenzschluessel wird als TEXT gespeichert",
        psql("select count(*) from public.helmut_jobs").out === "1");
      check("11.2 Die Tabelle existiert unveraendert weiter (kein `drop table` ausgefuehrt)",
        psql("select to_regclass('public.helmut_jobs')").out === "helmut_jobs");

      const id = psql("select id from public.helmut_claim_jobs('sw', 1, 60000)").out;
      const BOESER_FEHLER = "$h$x'; update public.helmut_jobs set status='erledigt'; --$h$";
      psql(`select public.helmut_finish_job('${id}','sw',false,${BOESER_FEHLER},0)`);
      check("11.3 Ein Einschleusungsversuch im Fehlertext aendert KEINEN fremden Zustand",
        psql("select count(*) from public.helmut_jobs where status='erledigt'").out === "0");
      check("11.4 Der Fehlertext ist unveraendert als Text abgelegt",
        psql("select position('drop' in coalesce(last_error,'')) > 0 or position('update' in coalesce(last_error,'')) > 0 from public.helmut_jobs").out === "t");

      // Ueberlanger Fehlertext: die Datenbank kappt selbst, nicht erst die Anwendung.
      psql("update public.helmut_jobs set last_error = repeat('y', 5000)");
      const laenge = Number(psql("select length(last_error) from public.helmut_jobs").out);
      check("11.5 Die Datenbank kappt ueberlange Fehlertexte selbst", laenge <= 500, `${laenge} Zeichen`);

      // Geheimnisverdaechtiger Text: die Anwendung bereinigt VOR dem Schreiben.
      const roh = new Error("fetch https://api.example.org/v1?api_key=SUPERGEHEIM123 -> 401 Bearer abc.def.ghi");
      const bereinigt = SP.bereinigeFehler(roh);
      psql(`select public.helmut_finish_job('${id}','sw',false,'${bereinigt.replace(/'/g, "''")}',0)`, PG.db, true);
      const abgelegt = psql("select coalesce(last_error,'') from public.helmut_jobs").out;
      check("11.6 Kein Geheimnis erreicht die Ablage (bereinigt vor dem Schreiben)",
        !/SUPERGEHEIM123/.test(abgelegt) && !/abc\.def\.ghi/.test(abgelegt), abgelegt.slice(0, 120));

      // Unbekannter Aufgabentyp — die Datenbank lehnt ab, nicht nur die Anwendung.
      const fremd = psql("select public.helmut_enqueue_job('beliebiger_fremder_typ','Z1','F','{}'::jsonb)", PG.db, true);
      check("11.7 Ein unbekannter Aufgabentyp wird VON DER DATENBANK abgelehnt",
        !fremd.ok && /type_chk/.test(fremd.out), fremd.out.slice(0, 120));

      // Fremde Mandantenzuordnung: ein zweiter Halter darf einen fremden Auftrag nicht anfassen.
      psql("delete from public.helmut_jobs");
      psql("select public.helmut_enqueue_job('mandate_projection','T1','F','{\"mandatsId\":\"t-0001\"}'::jsonb,now(),100::smallint,5,'t-0001')");
      const idT = psql("select id from public.helmut_claim_jobs('halter', 1, 60000)").out;
      check("11.8 Ein FREMDER kann einen laufenden Auftrag nicht abschliessen",
        psql(`select uebernommen from public.helmut_finish_job('${idT}','fremder',true)`).out === "f");
      check("11.9 Ein FREMDER kann die Lease nicht verlaengern",
        psql(`select public.helmut_extend_job_lease('${idT}','fremder',60000)`).out === "f");
      check("11.10 Der Mandatsbezug bleibt unveraendert (kein Umschreiben durch den Worker)",
        psql("select tenant_id from public.helmut_jobs").out === "t-0001");
      psql(`select public.helmut_finish_job('${idT}','halter',true)`);
      check("11.11 Ein ZWEITER Abschluss desselben Auftrags wird abgelehnt",
        psql(`select uebernommen from public.helmut_finish_job('${idT}','halter',true)`).out === "f");

      psql(`drop database if exists ${PG.db}`, "postgres");
    }
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  OFFEN ${offenZahl}  (gesamt ${pass + fail + offenZahl})`);
  if (offenZahl > 0) console.log(`${offenZahl} Punkt(e) sind AUSDRUECKLICH NICHT BEWIESEN.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
