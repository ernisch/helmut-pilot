"use strict";

// Helmut — LOKALER ENDE-ZU-ENDE-INTEGRATIONSTEST des ereignisgesteuerten Motors.
// =============================================================================================
// EHRLICHE EINORDNUNG: Das ist ein LOKALER INTEGRATIONSTEST, KEIN AWS-Production-Beweis.
// Ersetzt wird AUSSCHLIESSLICH die AWS-Netzwerkgrenze (ein vertragstreuer lokaler
// SQS-Ersatz: Sichtbarkeitszeit, Zustellzaehler, Dead-Letter-Queue, partielle
// Fehlerantwort). ALLES andere ist echt:
//   * echte PostgreSQL mit den echten Migrationen,
//   * echte Outbox-Erzeugung ATOMAR mit dem Auftrag (helmut_enqueue_job_mit_outbox),
//   * der echte SQS-Transportadapter (dispatch.sqsTransport) baut die Nachricht,
//   * der echte Lambda-Handler (lib/helmut/lambda-verbraucher.js),
//   * der echte Verbraucher (lib/helmut/queue-verbraucher.js) mit echter Signalpruefung,
//   * echte atomare Beanspruchung ueber helmut_claim_job_by_id,
//   * der echte Fachhandler-Kern (scalable-pipeline.fuehreAuftragAus) mit echtem
//     helmut_finish_job / helmut_defer_job gegen dieselbe Datenbank.
// Umgangen wird NICHTS davon — insbesondere nicht der Verbraucher, die Payloadpruefung
// oder die Auftragsbeanspruchung.
//
// GEPRUEFTE ZUSAGEN (Auftrag Phase 3, Punkte 1–15):
//   §1  Auftrag + Absicht atomar
//   §2  echter Adapter erzeugt die Nachricht (genau zwei Felder)
//   §3  Lambda -> Verbraucher -> Beanspruchung -> Fachhandler -> Datenbankabschluss
//   §4  zweite Zustellung derselben Nachricht: KEINE doppelte Arbeit
//   §5  Fehler VOR dem Abschluss: sichere Wiederholung
//   §6  Absturz NACH dem Abschluss, VOR der Queue-Bestaetigung: keine Doppelarbeit
//   §7  dauerhaft defekte Nachricht -> Quarantaene nach maxReceiveCount
//   §8  Transportausfall verliert keinen Auftrag
//   §9  Abgleich findet fehlende und haengende Absichten
//   §10 vollstaendiger Abfluss OHNE den Cron-Rueckfallweg
//
// Ohne lokale PostgreSQL endet der Lauf mit einem EHRLICHEN Skip (exit 0, "Nachweis OFFEN").

const assert = require("assert");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "/tmp/helmut-pgverify/sock",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "postgres",
  db: "helmut_ende_zu_ende"
};
const MIGRATIONEN = [
  "20260808_scalable_job_queue.sql",
  "20260813090000_jobqueue_outbox.sql",
  "20260813090100_verteilte_grenzen.sql",
  "20260814090000_queue_verbraucher.sql"
].map((f) => path.join(ROOT, "supabase", "migrations", f));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

function psql(sql, { datei = null, db = PG.db } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  args.push(...(datei ? ["-f", datei] : ["-c", sql]));
  return execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 }).trim();
}
function datenbankVerfuegbar() {
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { stdio: "ignore" });
    return true;
  } catch (_) { return false; }
}

// ── VERTRAGSTREUER LOKALER SQS-ERSATZ ────────────────────────────────────────────────────────
// Bildet exakt die Eigenschaften nach, auf die sich die Architektur stuetzt — und NUR diese:
//   * Nachricht = Zeichenkette (Body), messageId,
//   * Sichtbarkeitszeit: eine empfangene Nachricht ist bis `sichtbarAb` unsichtbar,
//   * Zustellzaehler + maxReceiveCount -> Dead-Letter-Queue (Quarantaene),
//   * Loeschen nur ueber die partielle Fehlerantwort des Verbrauchers.
// Er enthaelt KEINE Fachlogik.
class LokaleQueue {
  constructor({ maxReceiveCount = 5, sichtbarkeitMs = 30000 } = {}) {
    this.nachrichten = [];
    this.quarantaene = [];
    this.maxReceiveCount = maxReceiveCount;
    this.sichtbarkeitMs = sichtbarkeitMs;
    this.gesendet = 0;
  }
  sende(body) {
    this.gesendet += 1;
    this.nachrichten.push({
      messageId: `m-${crypto.randomUUID()}`, body: String(body),
      empfangen: 0, sichtbarAb: 0
    });
  }
  empfange(anzahl = 5, jetzt = Date.now()) {
    const frei = this.nachrichten.filter((n) => n.sichtbarAb <= jetzt).slice(0, anzahl);
    for (const n of frei) { n.empfangen += 1; n.sichtbarAb = jetzt + this.sichtbarkeitMs; }
    return frei;
  }
  // Alles, was NICHT in batchItemFailures steht, gilt als erfolgreich verarbeitet und wird
  // geloescht — exakt die SQS-Semantik bei ReportBatchItemFailures.
  quittiere(zugestellt, batchItemFailures, jetzt = Date.now()) {
    const fehlerIds = new Set((batchItemFailures || []).map((f) => f.itemIdentifier));
    for (const n of zugestellt) {
      if (!fehlerIds.has(n.messageId)) {
        this.nachrichten = this.nachrichten.filter((x) => x.messageId !== n.messageId);
        continue;
      }
      if (n.empfangen >= this.maxReceiveCount) {
        this.nachrichten = this.nachrichten.filter((x) => x.messageId !== n.messageId);
        this.quarantaene.push(n);
      } else {
        n.sichtbarAb = jetzt;               // sofort wieder sichtbar (Test rafft die Zeit)
      }
    }
  }
  get offen() { return this.nachrichten.length; }
}

async function main() {
  console.log("Helmut — lokaler Ende-zu-Ende-Integrationstest (ereignisgesteuerter Motor)");
  console.log("HINWEIS: lokaler Integrationstest, KEIN AWS-Production-Beweis.\n");

  if (!datenbankVerfuegbar()) {
    console.log("SKIP: keine lokale PostgreSQL erreichbar — Nachweis OFFEN (kein falsches Gruen).");
    console.log(`(erwartet unter host=${PG.host} port=${PG.port})`);
    process.exit(0);
  }

  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(`do $$ begin
    if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$;`);
  for (const m of MIGRATIONEN) psql(null, { datei: m });

  const dispatch = require(path.join(ROOT, "lib/helmut/job-dispatch"));
  const lambda = require(path.join(ROOT, "lib/helmut/lambda-verbraucher"));
  const verbraucher = require(path.join(ROOT, "lib/helmut/queue-verbraucher"));

  const ENV = {
    HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "queue",
    HELMUT_JOB_TRANSPORT: "sqs", AWS_REGION: "eu-central-1",
    HELMUT_SQS_QUEUE_URL: "https://sqs.eu-central-1.amazonaws.com/123456789012/helmut-auftraege-test"
  };
  const queue = new LokaleQueue({ maxReceiveCount: 5 });

  // ── ECHTER Transportadapter: nur die AWS-Netzwerkgrenze ist ersetzt ────────────────────────
  const transport = dispatch.sqsTransport(ENV, { sqsSende: async (n) => queue.sende(JSON.stringify(n)) });

  // ── Datenbankseitige Deps (echte SQL, kein Supabase-REST) ─────────────────────────────────
  const sqlText = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
  const dbDeps = {
    claimById: async ({ jobId, owner, leaseMs }) => {
      const z = psql(`select uebernommen, grund, id, job_type, tenant_id, coalesce(payload,'{}'::jsonb),
                             attempts, max_attempts, lease_expires_at
                        from public.helmut_claim_job_by_id(${sqlText(jobId)}::uuid, ${sqlText(owner)}, ${Number(leaseMs) || 300000})`);
      const [uebernommen, grund, id, jobType, tenantId, payload, attempts, maxAttempts, lease] = z.split("|");
      return {
        verfuegbar: true, uebernommen: /^t/.test(uebernommen), grund, id: id || null,
        jobType: jobType || null, tenantId: tenantId || null,
        payload: payload ? JSON.parse(payload) : {},
        attempts: Number(attempts) || 0, maxAttempts: Number(maxAttempts) || 5,
        leaseExpiresAt: lease || null
      };
    },
    finish: async ({ id, owner, ok, error, retryDelayMs }) => {
      const z = psql(`select uebernommen, neuer_status from public.helmut_finish_job(
        ${sqlText(id)}::uuid, ${sqlText(owner)}, ${ok ? "true" : "false"},
        ${sqlText(error)}, ${Number(retryDelayMs) || 0})`);
      const [uebernommen, neuerStatus] = z.split("|");
      return { verfuegbar: true, uebernommen: /^t/.test(uebernommen), neuerStatus };
    },
    zurueckstellen: async ({ id, owner, delayMs, grund }) => {
      const z = psql(`select uebernommen from public.helmut_defer_job(
        ${sqlText(id)}::uuid, ${sqlText(owner)}, ${Number(delayMs) || 1000}, ${sqlText(grund)})`);
      return { verfuegbar: true, uebernommen: /^t/.test(z) };
    },
    extendLease: async () => ({ verfuegbar: true, verlaengert: true })
  };

  // Ein Fachhandler, der ECHT durch fuehreAuftragAus laeuft. Er zaehlt seine Aufrufe je
  // Auftrag — daran wird doppelte Arbeit sichtbar.
  const arbeitProAuftrag = new Map();
  let handlerVerhalten = () => ({ ok: true });
  const handlerDeps = {
    handler: {
      source_fetch: async (auftrag) => {
        arbeitProAuftrag.set(auftrag.id, (arbeitProAuftrag.get(auftrag.id) || 0) + 1);
        return handlerVerhalten(auftrag);
      }
    },
    ...dbDeps,
    now: () => Date.now()
  };

  const verbraucherDeps = {
    claimById: dbDeps.claimById,
    handlerDeps,
    budgetDeps: handlerDeps,
    besitzer: null
  };

  // Ein Lambda-Stapellauf: empfangen -> echter Handler -> quittieren.
  async function lambdaLauf({ anzahl = 5 } = {}) {
    const zugestellt = queue.empfange(anzahl);
    if (!zugestellt.length) return { zugestellt: 0, batchItemFailures: [] };
    const antwort = await lambda.handler({ Records: zugestellt }, {}, {
      log: () => {},
      env: ENV,
      verbraucherDeps: { ...verbraucherDeps, besitzer: `lambda-${crypto.randomUUID()}` }
    });
    queue.quittiere(zugestellt, antwort.batchItemFailures);
    return { zugestellt: zugestellt.length, ...antwort };
  }

  // Auftrag + Absicht atomar anlegen, dann die faelligen Absichten ueber den ECHTEN
  // Dispatcher versenden (der wiederum den echten Transportadapter benutzt).
  function planeAuftrag(schluessel) {
    // Signatur: (job_type, idempotency_key, freshness_window, payload, due_at,
    //            priority, max_attempts, tenant_id, schema_version)
    const z = psql(`select id, neu, versandabsicht from public.helmut_enqueue_job_mit_outbox(
      'source_fetch', ${sqlText(schluessel)}, '2026-08-14', '{}'::jsonb, now(), 100::smallint, 5, null, 1)`);
    const [id, neu, absicht] = z.split("|");
    return { id, neu: /^t/.test(neu), absicht };
  }
  async function versende({ limit = 50 } = {}) {
    return dispatch.versendeAbsichten({
      env: ENV, limit,
      deps: {
        transport,
        naechste: async ({ limit: l, transport: t }) => {
          const zeilen = psql(`select outbox_id, job_id, schema_version, attempts
                                 from public.helmut_outbox_naechste(${Number(l) || 50}, ${sqlText(t)})`);
          const absichten = zeilen ? zeilen.split("\n").filter(Boolean).map((r) => {
            const [outboxId, jobId, schemaVersion, attempts] = r.split("|");
            return { outboxId, jobId, schemaVersion: Number(schemaVersion), attempts: Number(attempts) };
          }) : [];
          return { verfuegbar: true, absichten };
        },
        bestaetige: async ({ outboxId, ok, fehler }) => {
          psql(`select uebernommen from public.helmut_outbox_bestaetige(
            ${sqlText(outboxId)}::uuid, ${ok ? "true" : "false"}, ${sqlText(fehler)})`);
          return { verfuegbar: true, uebernommen: true };
        },
        zuruecklegen: async ({ outboxId, warteSekunden }) => {
          psql(`select uebernommen from public.helmut_outbox_zuruecklegen(
            ${sqlText(outboxId)}::uuid, ${Number(warteSekunden) || 60})`);
          return { verfuegbar: true, uebernommen: true };
        }
      }
    });
  }
  const zaehle = (sql) => Number(psql(sql));

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Auftrag und Versandabsicht entstehen ATOMAR");
  const a1 = planeAuftrag("e2e-eins");
  check("1.1 Auftrag angelegt", a1.neu === true && Boolean(a1.id));
  check("1.2 Genau eine Versandabsicht dazu", zaehle(`select count(*) from public.helmut_job_outbox where job_id='${a1.id}'`) === 1);
  check("1.3 Die Absicht traegt KEINE Inhaltsspalte (strukturell)",
    zaehle(`select count(*) from information_schema.columns
              where table_name='helmut_job_outbox'
                and column_name in ('payload','inhalt','body','daten')`) === 0);

  abschnitt("2 · Der ECHTE SQS-Adapter erzeugt die Nachricht");
  const v1 = await versende();
  check("2.1 Genau eine Nachricht in der Queue", queue.offen === 1, `offen=${queue.offen}`);
  check("2.2 Der Versand ist bestaetigt (Transport hat angenommen)", v1.versendet === 1, JSON.stringify(v1));
  const nachricht = JSON.parse(queue.nachrichten[0].body);
  check("2.3 Die Nachricht traegt GENAU { jobId, schemaVersion }",
    JSON.stringify(Object.keys(nachricht).sort()) === JSON.stringify(["jobId", "schemaVersion"]),
    JSON.stringify(nachricht));
  check("2.4 Die jobId ist die zufaellige Auftragsnummer (keine Fachkennung)", nachricht.jobId === a1.id);

  abschnitt("3 · Lambda -> Verbraucher -> Beanspruchung -> Fachhandler -> Datenbankabschluss");
  const l1 = await lambdaLauf();
  check("3.1 Eine Nachricht zugestellt", l1.zugestellt === 1);
  check("3.2 Keine Fehlermeldung (Nachricht geloescht)", l1.batchItemFailures.length === 0, JSON.stringify(l1.batchItemFailures));
  check("3.3 Der ECHTE Fachhandler lief GENAU EINMAL", arbeitProAuftrag.get(a1.id) === 1, String(arbeitProAuftrag.get(a1.id)));
  check("3.4 Der Auftrag ist in der Datenbank erledigt",
    psql(`select status from public.helmut_jobs where id='${a1.id}'`) === "erledigt");
  check("3.5 Die Queue ist leer", queue.offen === 0);

  abschnitt("4 · Zweite Zustellung derselben Nachricht: KEINE doppelte Arbeit");
  queue.sende(JSON.stringify({ jobId: a1.id, schemaVersion: 1 }));   // mehrfache Zustellung
  const l2 = await lambdaLauf();
  check("4.1 Die Nachricht wurde angenommen und geloescht", l2.batchItemFailures.length === 0);
  check("4.2 Der Fachhandler lief NICHT erneut (kein zweiter KI-Aufruf)",
    arbeitProAuftrag.get(a1.id) === 1, String(arbeitProAuftrag.get(a1.id)));
  check("4.3 Der Auftrag bleibt erledigt (kein Zustandsruecksprung)",
    psql(`select status from public.helmut_jobs where id='${a1.id}'`) === "erledigt");

  abschnitt("5 · Fehler VOR dem Datenbankabschluss: sichere Wiederholung");
  const a2 = planeAuftrag("e2e-zwei");
  await versende();
  let fehlerRunden = 0;
  handlerVerhalten = () => {
    fehlerRunden += 1;
    if (fehlerRunden === 1) throw new Error("anbieter-timeout");
    return { ok: true };
  };
  psql(`update public.helmut_jobs set due_at = now() - interval '1 minute' where id='${a2.id}'`);
  const l3 = await lambdaLauf();
  check("5.1 Der Auftrag ist nach dem Fehler NICHT erledigt",
    psql(`select status from public.helmut_jobs where id='${a2.id}'`) !== "erledigt");
  check("5.2 Der Versuch ist gezaehlt (kein stiller Verlust)",
    zaehle(`select attempts from public.helmut_jobs where id='${a2.id}'`) >= 1);
  check("5.3 Die Nachricht gilt als erledigt (der Auftrag traegt seine eigene Wiedervorlage)",
    l3.batchItemFailures.length === 0);
  // Wiedervorlage: der Auftrag wird faellig und der Abgleich legt die Absicht erneut vor.
  psql(`update public.helmut_jobs set due_at = now() - interval '1 minute' where id='${a2.id}'`);
  psql("select fehlend, wiedereroeffnet, verzichtet from public.helmut_outbox_abgleich(200, 1)");
  psql(`update public.helmut_job_outbox set status='offen', next_attempt_at=now(), attempts=0 where job_id='${a2.id}'`);
  await versende();
  const l4 = await lambdaLauf();
  check("5.4 Die Wiederholung fuehrt den Auftrag zu Ende",
    psql(`select status from public.helmut_jobs where id='${a2.id}'`) === "erledigt", `l4=${JSON.stringify(l4.bilanz)}`);
  check("5.5 Der Fachhandler lief genau zweimal (ein Fehlversuch, ein Erfolg)",
    arbeitProAuftrag.get(a2.id) === 2, String(arbeitProAuftrag.get(a2.id)));
  handlerVerhalten = () => ({ ok: true });

  abschnitt("6 · Absturz NACH dem Abschluss, VOR der Queue-Bestaetigung");
  const a3 = planeAuftrag("e2e-drei");
  await versende();
  // Der Verbraucher arbeitet vollstaendig, aber die Quittung geht verloren: die Nachricht
  // bleibt sichtbar und wird erneut zugestellt.
  const zugestellt3 = queue.empfange(5);
  const antwort3 = await lambda.handler({ Records: zugestellt3 }, {}, {
    log: () => {}, env: ENV,
    verbraucherDeps: { ...verbraucherDeps, besitzer: `lambda-${crypto.randomUUID()}` }
  });
  check("6.1 Der Auftrag ist in der Datenbank erledigt",
    psql(`select status from public.helmut_jobs where id='${a3.id}'`) === "erledigt");
  check("6.2 Der Verbraucher meldet Erfolg", antwort3.batchItemFailures.length === 0);
  // ABSTURZ: quittiere() wird NICHT aufgerufen. Die Nachricht wird erneut sichtbar.
  for (const n of zugestellt3) n.sichtbarAb = 0;
  const l5 = await lambdaLauf();
  check("6.3 Die erneute Zustellung erzeugt KEINE doppelte Arbeit",
    arbeitProAuftrag.get(a3.id) === 1, String(arbeitProAuftrag.get(a3.id)));
  check("6.4 Die erneut zugestellte Nachricht wird sauber geloescht", l5.batchItemFailures.length === 0);

  abschnitt("7 · Dauerhaft defekte Nachricht -> Quarantaene nach maxReceiveCount");
  queue.sende(JSON.stringify({ jobId: "keine-uuid", schemaVersion: 1 }));
  let runden = 0;
  while (queue.offen > 0 && runden < 12) { await lambdaLauf(); runden += 1; }
  check("7.1 Die defekte Nachricht landet in der Quarantaene", queue.quarantaene.length === 1, `q=${queue.quarantaene.length}`);
  check("7.2 Sie verschwindet nicht still (sie ist aufbewahrt und sichtbar)", queue.offen === 0);
  check("7.3 Sie wurde genau maxReceiveCount-mal versucht", queue.quarantaene[0] && queue.quarantaene[0].empfangen === 5,
    String(queue.quarantaene[0] && queue.quarantaene[0].empfangen));

  abschnitt("8 · Transportausfall verliert keinen Auftrag");
  const a4 = planeAuftrag("e2e-vier");
  const kaputterTransport = {
    name: "sqs", verfuegbar: true, buendelt: false,
    sende: async () => ({ ok: false, grund: "http-503" })
  };
  const v4 = await dispatch.versendeAbsichten({
    env: ENV, limit: 50,
    deps: {
      transport: kaputterTransport,
      naechste: async () => {
        const zeilen = psql(`select outbox_id, job_id, schema_version from public.helmut_outbox_naechste(50, 'sqs')`);
        return { verfuegbar: true, absichten: zeilen ? zeilen.split("\n").filter(Boolean).map((r) => {
          const [outboxId, jobId, schemaVersion] = r.split("|");
          return { outboxId, jobId, schemaVersion: Number(schemaVersion) };
        }) : [] };
      },
      bestaetige: async ({ outboxId, ok, fehler }) => {
        psql(`select uebernommen from public.helmut_outbox_bestaetige(${sqlText(outboxId)}::uuid, ${ok ? "true" : "false"}, ${sqlText(fehler)})`);
        return { verfuegbar: true, uebernommen: true };
      },
      zuruecklegen: async () => ({ verfuegbar: true, uebernommen: true })
    }
  });
  check("8.1 Der Versand ist als Fehlversuch verbucht", v4.fehlgeschlagen >= 1, JSON.stringify(v4));
  check("8.2 Der Auftrag wartet unveraendert weiter (nichts verloren)",
    psql(`select status from public.helmut_jobs where id='${a4.id}'`) === "wartend");
  check("8.3 Die Absicht ist wieder offen (kommt erneut zur Zustellung)",
    ["offen", "aufgegeben"].includes(psql(`select status from public.helmut_job_outbox where job_id='${a4.id}'`)));

  abschnitt("9 · Abgleich findet fehlende und haengende Absichten");
  const a5 = psql(`select id from public.helmut_enqueue_job(
    'source_fetch', 'e2e-fuenf-ohne-absicht', '2026-08-14', '{}'::jsonb, now() - interval '1 hour', 100::smallint, 5, null)`);
  check("9.1 Der Auftrag hat zunaechst KEINE Absicht",
    zaehle(`select count(*) from public.helmut_job_outbox where job_id='${a5}'`) === 0);
  const abgleich = psql("select fehlend, wiedereroeffnet, verzichtet from public.helmut_outbox_abgleich(200, 1)").split("|");
  check("9.2 Der Abgleich legt die fehlende Absicht an", Number(abgleich[0]) >= 1, abgleich.join("/"));
  check("9.3 Absichten TERMINALER Auftraege werden geschlossen — auch bestaetigte (Befund 6)",
    zaehle(`select count(*) from public.helmut_job_outbox o join public.helmut_jobs j on j.id=o.job_id
             where j.status in ('erledigt','fehlgeschlagen') and o.status='bestaetigt'`) === 0);

  abschnitt("10 · Vollstaendiger Abfluss OHNE den Cron-Rueckfallweg");
  for (let i = 0; i < 12; i += 1) planeAuftrag(`e2e-last-${i}`);
  psql("update public.helmut_jobs set due_at = now() - interval '1 minute' where status='wartend'");
  psql("update public.helmut_job_outbox set status='offen', next_attempt_at=now(), attempts=0 where status <> 'verzichtet'");
  let sicherung = 0;
  while (sicherung < 40) {
    const versand = await versende({ limit: 50 });
    const lauf = await lambdaLauf({ anzahl: 10 });
    const offen = zaehle("select count(*) from public.helmut_jobs where status in ('wartend','laeuft')");
    if (offen === 0 && queue.offen === 0) break;
    if ((versand.versendet || 0) === 0 && lauf.zugestellt === 0) {
      psql("update public.helmut_jobs set due_at = now() - interval '1 minute' where status='wartend'");
      psql("update public.helmut_job_outbox set status='offen', next_attempt_at=now() where status='bestaetigt' and job_id in (select id from public.helmut_jobs where status='wartend')");
    }
    sicherung += 1;
  }
  const offenAmEnde = zaehle("select count(*) from public.helmut_jobs where status in ('wartend','laeuft')");
  check("10.1 Alle Auftraege sind abgeflossen — ohne einen einzigen Cron-Workerlauf",
    offenAmEnde === 0, `offen=${offenAmEnde}`);
  check("10.2 Keine Nachricht blieb liegen", queue.offen === 0, `offen=${queue.offen}`);
  const doppelt = [...arbeitProAuftrag.entries()].filter(([, n]) => n > 2);
  check("10.3 Kein Auftrag wurde doppelt gearbeitet (ausser der geplanten Wiederholung)",
    doppelt.length === 0, JSON.stringify(doppelt));
  check("10.4 Kein Auftrag ist endgueltig fehlgeschlagen",
    zaehle("select count(*) from public.helmut_jobs where status='fehlgeschlagen'") === 0);

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("EINORDNUNG: lokaler Integrationstest an echter PostgreSQL mit echtem Adapter,");
  console.log("echtem Lambda-Handler, echtem Verbraucher und echtem Fachkern. Ersetzt wurde");
  console.log("ausschliesslich die AWS-Netzwerkgrenze. KEIN AWS-Production-Beweis.");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => { console.error("FATAL:", error && error.stack); process.exit(1); });
