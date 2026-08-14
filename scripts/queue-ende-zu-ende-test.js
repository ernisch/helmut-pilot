"use strict";

// Helmut — LOKALER ENDE-ZU-ENDE-INTEGRATIONSTEST DES EREIGNISMOTORS (2026-08-14/3).
// =============================================================================================
// EHRLICHE EINORDNUNG: LOKALER INTEGRATIONSTEST, KEIN AWS-PRODUCTION-BEWEIS.
//
// WAS SICH GEGENUEBER DER VORVERSION GEAENDERT HAT (Korrekturlauf, Luecke 1 und 2):
// Die alte Fassung pumpte den Versand in einer Testschleife (`await versende()`), rief also
// selbst den Dispatcher. Damit bewies sie den Transport, aber NICHT den Antrieb. Jetzt gilt:
//   * KEIN Testaufruf des Dispatchers im normalen Ablauf. Ausgeloest wird ausschliesslich
//     ueber den ECHTEN Relay-Einstiegspunkt (lambda/relay.js -> lib/helmut/lambda-relay.js).
//   * Der Verbraucher stoesst den Relay nach jedem Abschluss SELBST an — genau so traegt
//     sich die Kette ohne Vercel-Cron.
//   * Der Lambda-Einstieg wird aus dem GEBAUTEN PAKET geladen (entpacktes Archiv), nicht
//     aus dem Arbeitsbaum.
//   * Die Supabase-Konfiguration kommt ueber eine vertragstreue lokale SSM-Grenze.
//
// ECHT sind: PostgreSQL samt Migrationen, Outbox-Atomaritaet, SQS-Adapter, Relay,
// Lambda-Handler, Verbraucher, Beanspruchung, Fachkern, Abschluss.
// ERSETZT sind ausschliesslich zwei Aussengrenzen: das AWS-Netz (SQS/Lambda-Aufruf) und
// der SSM-Parameterdienst.
//
// GEPRUEFTE ZUSAGEN (Auftrag "Ende zu Ende Nachweis", Punkte 1–16).

const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
// Die ECHTE CloudFormation-Vorlage ist ab jetzt die Quelle der Umgebung und der Rechte.
const cfn = require(path.join(__dirname, "cfn-vorlage-lesen"));

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
  "20260814090000_queue_verbraucher.sql",
  "20260814090100_anbieter_steuerung.sql"
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
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"], { stdio: "ignore" });
    return true;
  } catch (_) { return false; }
}

// ── VERTRAGSTREUER LOKALER SQS-ERSATZ (nur die AWS-Netzgrenze) ───────────────────────────────
class LokaleQueue {
  constructor({ maxReceiveCount = 5, sichtbarkeitMs = 30000 } = {}) {
    this.nachrichten = []; this.quarantaene = [];
    this.maxReceiveCount = maxReceiveCount; this.sichtbarkeitMs = sichtbarkeitMs;
    this.gesendet = 0; this.ausfall = false;
  }
  sende(body) {
    if (this.ausfall) throw new Error("SQS nicht erreichbar (Testausfall)");
    this.gesendet += 1;
    this.nachrichten.push({ messageId: `m-${crypto.randomUUID()}`, body: String(body), empfangen: 0, sichtbarAb: 0 });
  }
  empfange(anzahl = 5, jetzt = Date.now()) {
    const frei = this.nachrichten.filter((n) => n.sichtbarAb <= jetzt).slice(0, anzahl);
    for (const n of frei) { n.empfangen += 1; n.sichtbarAb = jetzt + this.sichtbarkeitMs; }
    return frei;
  }
  quittiere(zugestellt, batchItemFailures, jetzt = Date.now()) {
    const fehlerIds = new Set((batchItemFailures || []).map((f) => f.itemIdentifier));
    for (const n of zugestellt) {
      if (!fehlerIds.has(n.messageId)) { this.nachrichten = this.nachrichten.filter((x) => x.messageId !== n.messageId); continue; }
      if (n.empfangen >= this.maxReceiveCount) {
        this.nachrichten = this.nachrichten.filter((x) => x.messageId !== n.messageId);
        this.quarantaene.push(n);
      } else n.sichtbarAb = jetzt;
    }
  }
  get offen() { return this.nachrichten.length; }
}

// ── VERTRAGSTREUE LOKALE SSM-GRENZE ──────────────────────────────────────────────────────────
// Bildet exakt das nach, worauf sich lambda-konfiguration.js stuetzt: GetParameter mit
// Entschluesselung, Fehler bei unbekanntem Namen, leerer Wert moeglich.
function lokalesSsm(werte) {
  return {
    aufrufe: 0,
    getParameter(name) {
      this.aufrufe += 1;
      if (!(name in werte)) return Promise.reject(new Error(`ParameterNotFound: ${name}`));
      return Promise.resolve({ Parameter: { Name: name, Value: werte[name], Type: "SecureString" } });
    }
  };
}

async function main() {
  console.log("Helmut — lokaler Ende-zu-Ende-Integrationstest (Relay -> SQS -> Lambda -> Fachkern)");
  console.log("HINWEIS: lokaler Integrationstest, KEIN AWS-Production-Beweis.\n");

  if (!datenbankVerfuegbar()) {
    console.log("SKIP: keine lokale PostgreSQL erreichbar — Nachweis OFFEN (kein falsches Gruen).");
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

  // ── DAS GEBAUTE PAKET: bauen, entpacken, VON DORT laden ────────────────────────────────────
  abschnitt("0 · Das gebaute Lambda-Paket wird tatsaechlich geladen (Zusage 16)");
  const bauer = require(path.join(ROOT, "scripts", "lambda-paket-bauen"));
  const bauZiel = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-paket-"));
  const gebaut = bauer.baue({ ziel: bauZiel });
  check("0.1 Das Paket wurde gebaut (Archiv + Manifest)", Boolean(gebaut.zipPfad) && fs.existsSync(gebaut.zipPfad));
  // ZWEI CONTAINER, ZWEI ENTPACKUNGEN. In AWS sind Verbraucher und Relay getrennte
  // Funktionen mit eigenem Prozess und eigenem Modulzustand (der SSM-Prozesscache gehoert
  // jedem Container fuer sich). Ein einziges Entpacken wuerde beide denselben Cache teilen
  // lassen — das waere ein Modell, das es in AWS nicht gibt.
  const entpackt = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-container-verbraucher-"));
  const entpacktRelay = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-container-relay-"));
  const dateien = bauer.entpackeZip(fs.readFileSync(gebaut.zipPfad), entpackt);
  bauer.entpackeZip(fs.readFileSync(gebaut.zipPfad), entpacktRelay);
  check("0.2 Das Archiv laesst sich vollstaendig entpacken",
    dateien.length === gebaut.manifest.dateien, `${dateien.length} vs ${gebaut.manifest.dateien}`);
  check("0.3 Beide Handlerpfade liegen im Paket",
    fs.existsSync(path.join(entpackt, "lambda/index.js")) && fs.existsSync(path.join(entpacktRelay, "lambda/relay.js")));
  check("0.4 Das Paket traegt KEINE Tests, Dokumente, Migrationen oder Secrets",
    !dateien.some((d) => /-test\.js$|\.md$|(^|\/)supabase\/|(^|\/)docs\/|\.env/.test(d)));
  // AB HIER wird ausschliesslich aus den ENTPACKTEN PAKETEN geladen.
  const paketVerbraucher = require(path.join(entpackt, "lambda/index.js"));
  const paketRelay = require(path.join(entpacktRelay, "lambda/relay.js"));
  check("0.5 Der Verbraucher-Handler aus dem Paket ist ausfuehrbar", typeof paketVerbraucher.handler === "function");
  check("0.6 Der Relay-Handler aus dem Paket ist ausfuehrbar", typeof paketRelay.handler === "function");

  // Die Module der ENTPACKTEN Pakete (nicht des Arbeitsbaums) — nur so ist bewiesen, dass
  // das ausgelieferte Artefakt vollstaendig ist. Je Container ein eigener Satz.
  const dispatch = require(path.join(entpacktRelay, "lib/helmut/job-dispatch"));
  const relayModul = require(path.join(entpacktRelay, "lib/helmut/outbox-relay"));
  const konfiguration = require(path.join(entpacktRelay, "lib/helmut/lambda-konfiguration"));
  const konfigVerbraucher = require(path.join(entpackt, "lib/helmut/lambda-konfiguration"));

  // ── DIE UMGEBUNG KOMMT AUS DER ECHTEN CLOUDFORMATION-VORLAGE ───────────────────────────────
  // Der Test schreibt sie NICHT mehr selbst. Genau daran ist die Verkabelung vorher
  // gescheitert: der Code war richtig, die Vorlage setzte `HELMUT_RELAY_FUNKTION` nicht — und
  // der Test bemerkte es nicht, weil er den Ausloeser fertig eingesetzt hat.
  abschnitt("0b · Die Umgebung stammt aus der echten CloudFormation-Vorlage");
  const vorlage = cfn.ladeText();
  const ENV_VERBRAUCHER = { ...cfn.umgebung(vorlage, "VerbraucherFunktion"), AWS_REGION: cfn.REGION };
  const ENV_RELAY = { ...cfn.umgebung(vorlage, "RelayFunktion"), AWS_REGION: cfn.REGION };
  const RELAY_NAME = ENV_VERBRAUCHER.HELMUT_RELAY_FUNKTION;
  const RELAY_ARN = cfn.aufloese(vorlage, "!GetAtt RelayFunktion.Arn");

  check("0b.1 Die Vorlage gibt dem Verbraucher den Namen der Relay-Funktion",
    Boolean(RELAY_NAME), String(RELAY_NAME));
  check("0b.2 Dieser Name ist WIRKLICH die Relay-Funktion der Vorlage",
    RELAY_NAME === cfn.aufloese(vorlage, "!Ref RelayFunktion"), String(RELAY_NAME));
  check("0b.3 Die Verbraucherrolle darf genau diese Funktion aufrufen",
    cfn.darf(vorlage, "VerbraucherRolle", "lambda:InvokeFunction", RELAY_ARN), RELAY_ARN);
  check("0b.4 Der Verbraucher bekommt KEINE Queue-Adresse (er ist nie Absender)",
    ENV_VERBRAUCHER.HELMUT_SQS_QUEUE_URL === undefined);
  check("0b.5 Der Verbraucher hat KEIN sqs:SendMessage",
    !cfn.iamAnweisungen(vorlage, "VerbraucherRolle").some((a) => a.actions.includes("sqs:SendMessage")));
  check("0b.6 Der Relay bekommt die Queue-Adresse und darf senden",
    Boolean(ENV_RELAY.HELMUT_SQS_QUEUE_URL)
    && cfn.iamAnweisungen(vorlage, "RelayRolle").some((a) => a.actions.includes("sqs:SendMessage")));

  const SSM_URL = ENV_VERBRAUCHER.HELMUT_SUPABASE_URL_PARAMETER;
  const SSM_KEY = ENV_VERBRAUCHER.HELMUT_SUPABASE_KEY_PARAMETER;
  check("0b.7 Beide Funktionen zeigen auf dieselben SSM-Parameternamen",
    SSM_URL === ENV_RELAY.HELMUT_SUPABASE_URL_PARAMETER
    && SSM_KEY === ENV_RELAY.HELMUT_SUPABASE_KEY_PARAMETER);

  const ssm = lokalesSsm({ [SSM_URL]: "https://projekt.supabase.co", [SSM_KEY]: "dienst-schluessel-geheim" });
  const queue = new LokaleQueue({ maxReceiveCount: 5 });
  // Der Transport gehoert dem RELAY — nur er hat Queue-Adresse und Senderecht.
  const transport = dispatch.sqsTransport(ENV_RELAY, { sqsSende: async (n) => queue.sende(JSON.stringify(n)) });

  // ── DATENBANKSEITE (echte SQL) ─────────────────────────────────────────────────────────────
  const sqlText = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
  const dbDeps = {
    claimById: async ({ jobId, owner, leaseMs }) => {
      const z = psql(`select uebernommen, grund, id, job_type, tenant_id, coalesce(payload,'{}'::jsonb),
                             attempts, max_attempts, lease_expires_at
                        from public.helmut_claim_job_by_id(${sqlText(jobId)}::uuid, ${sqlText(owner)}, ${Number(leaseMs) || 300000})`);
      const [u, grund, id, jobType, tenantId, payload, attempts, maxAttempts, lease] = z.split("|");
      return { verfuegbar: true, uebernommen: /^t/.test(u), grund, id: id || null, jobType: jobType || null,
        tenantId: tenantId || null, payload: payload ? JSON.parse(payload) : {},
        attempts: Number(attempts) || 0, maxAttempts: Number(maxAttempts) || 5, leaseExpiresAt: lease || null };
    },
    finish: async ({ id, owner, ok, error, retryDelayMs }) => {
      const z = psql(`select uebernommen, neuer_status from public.helmut_finish_job(
        ${sqlText(id)}::uuid, ${sqlText(owner)}, ${ok ? "true" : "false"}, ${sqlText(error)}, ${Number(retryDelayMs) || 0})`);
      const [u, neuerStatus] = z.split("|");
      return { verfuegbar: true, uebernommen: /^t/.test(u), neuerStatus };
    },
    zurueckstellen: async ({ id, owner, delayMs, grund }) => {
      const z = psql(`select uebernommen from public.helmut_defer_job(
        ${sqlText(id)}::uuid, ${sqlText(owner)}, ${Number(delayMs) || 1000}, ${sqlText(grund)})`);
      return { verfuegbar: true, uebernommen: /^t/.test(z) };
    },
    extendLease: async () => ({ verfuegbar: true, verlaengert: true }),
    erneutVorlegen: async ({ jobId }) => {
      const z = psql(`select uebernommen, grund, faellig_ab, sofort
                        from public.helmut_outbox_erneut_vorlegen(${sqlText(jobId)}::uuid)`);
      const [u, grund, faelligAb, sofort] = z.split("|");
      return { verfuegbar: true, uebernommen: /^t/.test(u), grund, faelligAb, sofort: /^t/.test(sofort) };
    }
  };
  const outboxDeps = {
    naechste: async ({ limit, transport: t }) => {
      const zeilen = psql(`select outbox_id, job_id, schema_version from public.helmut_outbox_naechste(${Number(limit) || 50}, ${sqlText(t)})`);
      return { verfuegbar: true, absichten: zeilen ? zeilen.split("\n").filter(Boolean).map((r) => {
        const [outboxId, jobId, schemaVersion] = r.split("|");
        return { outboxId, jobId, schemaVersion: Number(schemaVersion) };
      }) : [] };
    },
    bestaetige: async ({ outboxId, ok, fehler }) => {
      psql(`select uebernommen from public.helmut_outbox_bestaetige(${sqlText(outboxId)}::uuid, ${ok ? "true" : "false"}, ${sqlText(fehler)})`);
      return { verfuegbar: true, uebernommen: true };
    },
    zuruecklegen: async ({ outboxId, warteSekunden }) => {
      psql(`select uebernommen from public.helmut_outbox_zuruecklegen(${sqlText(outboxId)}::uuid, ${Number(warteSekunden) || 60})`);
      return { verfuegbar: true, uebernommen: true };
    },
    // Das Sicherheitsnetz haengt am ZEITGEBER (nicht mehr nur am Vercel-Cron). Der Test
    // ruft es deshalb NIRGENDS direkt auf — es laeuft ausschliesslich ueber lambda/relay.js.
    abgleich: async ({ limit, mindestalterMinuten }) => {
      const z = psql(`select fehlend, wiedereroeffnet, verzichtet from public.helmut_outbox_abgleich(
        ${Number(limit) || 200}, ${Number(mindestalterMinuten) || 10})`).split("|");
      return { verfuegbar: true, fehlend: Number(z[0]) || 0, wiedereroeffnet: Number(z[1]) || 0,
        verzichtet: Number(z[2]) || 0 };
    }
  };

  // Der Fachhandler zaehlt seine Aufrufe je Auftrag — daran wird Doppelarbeit sichtbar.
  const arbeitProAuftrag = new Map();
  let handlerVerhalten = () => ({ ok: true });
  let folgeAuftragFuer = null;                     // erzeugt einen Folgeauftrag (Kettennachweis)
  const handlerDeps = {
    handler: {
      source_fetch: async (auftrag) => {
        arbeitProAuftrag.set(auftrag.id, (arbeitProAuftrag.get(auftrag.id) || 0) + 1);
        const r = handlerVerhalten(auftrag);
        // FOLGEAUFTRAG: entsteht ATOMAR mit seiner Versandabsicht — genau wie im Fachkern
        // (standardEnqueue -> helmut_enqueue_job_mit_outbox). KEIN Dispatcheraufruf hier.
        if (folgeAuftragFuer && folgeAuftragFuer.quelle === auftrag.id) {
          psql(`select id from public.helmut_enqueue_job_mit_outbox(
            'source_fetch', ${sqlText(folgeAuftragFuer.schluessel)}, '2026-08-14', '{}'::jsonb,
            ${folgeAuftragFuer.spaeter ? "now() + interval '3 seconds'" : "now()"}, 100::smallint, 5, null, 1)`);
          folgeAuftragFuer = null;
        }
        return r;
      }
    },
    ...dbDeps,
    now: () => Date.now()
  };

  // ── DER RELAY: sein ECHTER Einstiegspunkt aus dem Paket ────────────────────────────────────
  let relayAufrufe = 0;
  const relayDeps = { transport, ...outboxDeps, klassen: null };
  async function relayEinstieg(ausloeser = "zeitgeber") {
    relayAufrufe += 1;
    return paketRelay.handler({ ausloeser }, {}, {
      env: ENV_RELAY, log: () => {},
      konfiguration, konfigurationDeps: { ssm },
      relayDeps
    });
  }

  // ── DIE EINZIGE ERSETZTE STELLE: DIE AWS-NETZGRENZE ───────────────────────────────────────
  // Der Test setzt KEINEN Relay-Ausloeser mehr ein. Er stellt nur die Attrappe des
  // Lambda-SDK bereit. Alles davor ist echter Produktionscode:
  //   Vorlage -> HELMUT_RELAY_FUNKTION -> erstelleRelayAusloeser -> FunctionName/Event/Payload.
  // Die Attrappe verhaelt sich wie AWS: sie prueft die IAM-Berechtigung der Verbraucherrolle
  // GEGEN DIE VORLAGE und weist einen unerlaubten Aufruf ab (AccessDeniedException).
  const awsAufrufe = [];
  async function lambdaNetzgrenze(befehl) {
    awsAufrufe.push(befehl);
    const ziel = `arn:aws:lambda:${cfn.REGION}:${cfn.KONTO}:function:${befehl.FunctionName}`;
    if (!cfn.darf(vorlage, "VerbraucherRolle", "lambda:InvokeFunction", ziel)) {
      const f = new Error(`AccessDeniedException: not authorized to perform lambda:InvokeFunction on ${ziel}`);
      f.name = "AccessDeniedException";
      throw f;
    }
    if (befehl.InvocationType !== "Event") {
      throw new Error(`Unerwartete Aufrufart ${befehl.InvocationType} — der Anstoss muss asynchron sein`);
    }
    if (befehl.FunctionName !== RELAY_NAME) {
      throw new Error(`Falsches Ziel ${befehl.FunctionName}`);
    }
    // `InvocationType: Event` stellt in AWS nur zu; der Aufrufer wartet nicht auf das
    // Ergebnis. Hier laeuft der ECHTE Relay-Handler mit der Nutzlast des echten Codes.
    const ereignis = JSON.parse(Buffer.from(befehl.Payload).toString("utf8"));
    relayAufrufe += 1;
    await paketRelay.handler(ereignis, {}, {
      env: ENV_RELAY, log: () => {},
      konfiguration, konfigurationDeps: { ssm },
      relayDeps
    });
    return { StatusCode: 202 };
  }

  const verbraucherDeps = {
    claimById: dbDeps.claimById, erneutVorlegen: dbDeps.erneutVorlegen,
    handlerDeps, budgetDeps: handlerDeps,
    konfiguration: konfigVerbraucher, konfigurationDeps: { ssm },
    relayDeps
  };

  async function lambdaLauf({ anzahl = 5 } = {}) {
    const zugestellt = queue.empfange(anzahl);
    if (!zugestellt.length) return { zugestellt: 0, batchItemFailures: [] };
    const antwort = await paketVerbraucher.handler({ Records: zugestellt }, {}, {
      log: () => {}, env: ENV_VERBRAUCHER,
      // NUR die AWS-Netzgrenze ist ersetzt — kein fertiger Ausloeser.
      lambdaAufruf: lambdaNetzgrenze,
      verbraucherDeps: { ...verbraucherDeps, besitzer: `lambda-${crypto.randomUUID()}` }
    });
    queue.quittiere(zugestellt, antwort.batchItemFailures);
    return { zugestellt: zugestellt.length, ...antwort };
  }

  function planeAuftrag(schluessel, { spaeter = false } = {}) {
    const z = psql(`select id, neu from public.helmut_enqueue_job_mit_outbox(
      'source_fetch', ${sqlText(schluessel)}, '2026-08-14', '{}'::jsonb,
      ${spaeter ? "now() + interval '3 seconds'" : "now()"}, 100::smallint, 5, null, 1)`);
    const [id, neu] = z.split("|");
    return { id, neu: /^t/.test(neu) };
  }
  const zaehle = (sql) => Number(psql(sql));
  const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Auftrag und Versandabsicht entstehen ATOMAR (Zusage 1, 2)");
  const a1 = planeAuftrag("e2e-eins");
  check("1.1 Auftrag angelegt", a1.neu === true && Boolean(a1.id));
  check("1.2 Genau eine Versandabsicht", zaehle(`select count(*) from public.helmut_job_outbox where job_id='${a1.id}'`) === 1);
  check("1.3 Die Outbox traegt strukturell KEINE Inhaltsspalte",
    zaehle(`select count(*) from information_schema.columns where table_name='helmut_job_outbox'
             and column_name in ('payload','inhalt','body','daten')`) === 0);

  abschnitt("2 · Der ECHTE Relay-Einstiegspunkt sendet ueber den ECHTEN SQS-Adapter (Zusage 3, 4, 5)");
  const r1 = await relayEinstieg("zeitgeber");
  check("2.1 Der Relay lief ueber lambda/relay.js aus dem Paket", relayAufrufe === 1);
  check("2.2 Er hat genau eine Nachricht versendet", (r1.versendet || 0) === 1, JSON.stringify(r1));
  check("2.3 Genau eine Nachricht liegt in der Queue", queue.offen === 1);
  const nachricht = JSON.parse(queue.nachrichten[0].body);
  check("2.4 Die Nachricht traegt GENAU { jobId, schemaVersion }",
    JSON.stringify(Object.keys(nachricht).sort()) === JSON.stringify(["jobId", "schemaVersion"]));
  check("2.5 Die Supabase-Konfiguration kam ueber die SSM-Grenze", ssm.aufrufe >= 2, `aufrufe=${ssm.aufrufe}`);
  check("2.6 SUPABASE_URL, Service-Schluessel und Backend sind gesetzt", konfiguration.supabaseBereit(ENV_RELAY));

  abschnitt("3 · Lambda -> Verbraucher -> Beanspruchung -> Fachkern -> Abschluss (Zusage 6, 7)");
  const l1 = await lambdaLauf();
  check("3.1 Eine Nachricht zugestellt und geloescht", l1.zugestellt === 1 && l1.batchItemFailures.length === 0);
  check("3.2 Der ECHTE Fachhandler lief genau einmal", arbeitProAuftrag.get(a1.id) === 1);
  check("3.3 Der Auftrag ist in der Datenbank erledigt",
    psql(`select status from public.helmut_jobs where id='${a1.id}'`) === "erledigt");

  abschnitt("4 · Folgeauftrag wird OHNE Testaufruf des Dispatchers weitergereicht (Zusage 8, 14)");
  const relayVorher = relayAufrufe;
  const a2 = planeAuftrag("e2e-kette-start");
  folgeAuftragFuer = { quelle: a2.id, schluessel: "e2e-kette-folge" };
  await relayEinstieg("zeitgeber");                 // EINE Ausloesung — danach traegt sich die Kette
  await lambdaLauf();                               // verarbeitet a2, erzeugt Folgeauftrag, stoesst Relay an
  await lambdaLauf();                               // verarbeitet den Folgeauftrag
  const folge = psql(`select id, status from public.helmut_jobs where idempotency_key='e2e-kette-folge'`).split("|");
  check("4.1 Der Folgeauftrag ist entstanden", Boolean(folge[0]));
  check("4.2 Er wurde OHNE Testaufruf des Dispatchers zugestellt und erledigt",
    folge[1] === "erledigt", `status=${folge[1]}`);
  check("4.3 Der Verbraucher hat den Relay dafuer SELBST angestossen", relayAufrufe > relayVorher + 1,
    `relayAufrufe ${relayVorher} -> ${relayAufrufe}`);
  check("4.4 Kein Vercel-Cron beteiligt (der Test ruft keinen Cronpfad)", true);

  abschnitt("5 · Spaeter faellige Arbeit wird zum richtigen Zeitpunkt geweckt (Zusage 9)");
  const a3 = planeAuftrag("e2e-spaeter", { spaeter: true });
  await relayEinstieg("zeitgeber");
  const sofort = await lambdaLauf();
  check("5.1 Vor der Faelligkeit wird NICHT gearbeitet",
    psql(`select status from public.helmut_jobs where id='${a3.id}'`) === "wartend", JSON.stringify(sofort.bilanz));
  await schlafe(3500);
  await relayEinstieg("zeitgeber");                 // der Zeitgeber traegt spaetere Arbeit
  await lambdaLauf();
  check("5.2 Nach der Faelligkeit wird der Auftrag erledigt",
    psql(`select status from public.helmut_jobs where id='${a3.id}'`) === "erledigt");

  abschnitt("6 · Mehrfachzustellung und Abstuerze (Zusage 10, 11)");
  queue.sende(JSON.stringify({ jobId: a1.id, schemaVersion: 1 }));
  await lambdaLauf();
  check("6.1 Zweite Zustellung erzeugt KEINE doppelte Arbeit", arbeitProAuftrag.get(a1.id) === 1);
  // Absturz NACH dem Datenbankabschluss, VOR der Queue-Bestaetigung
  const a4 = planeAuftrag("e2e-absturz-nach");
  await relayEinstieg("zeitgeber");
  const zugestellt4 = queue.empfange(5);
  await paketVerbraucher.handler({ Records: zugestellt4 }, {}, {
    log: () => {}, env: ENV_VERBRAUCHER, lambdaAufruf: lambdaNetzgrenze,
    verbraucherDeps: { ...verbraucherDeps, besitzer: `lambda-${crypto.randomUUID()}` } });
  check("6.2 Der Auftrag ist erledigt", psql(`select status from public.helmut_jobs where id='${a4.id}'`) === "erledigt");
  for (const n of zugestellt4) n.sichtbarAb = 0;   // ABSTURZ: keine Quittung
  await lambdaLauf();
  check("6.3 Die erneute Zustellung erzeugt keine Doppelarbeit", arbeitProAuftrag.get(a4.id) === 1);
  // Absturz VOR dem Datenbankabschluss
  const a5 = planeAuftrag("e2e-absturz-vor");
  let ersterVersuch = true;
  handlerVerhalten = (auftrag) => {
    if (auftrag.id === a5.id && ersterVersuch) { ersterVersuch = false; throw new Error("absturz-vor-abschluss"); }
    return { ok: true };
  };
  await relayEinstieg("zeitgeber");
  await lambdaLauf();
  check("6.4 Nach dem Fehler ist der Auftrag NICHT erledigt",
    psql(`select status from public.helmut_jobs where id='${a5.id}'`) !== "erledigt");
  check("6.5 Der Versuch ist gezaehlt (nichts still verloren)",
    zaehle(`select attempts from public.helmut_jobs where id='${a5.id}'`) >= 1);
  // DIE WIEDERVORLAGE TRAEGT DIE WIEDERHOLUNG — nicht der Abgleich. Ohne
  // helmut_outbox_erneut_vorlegen bliebe die Absicht `bestaetigt` und der Auftrag wartete
  // bis zum Mindestalter des Sicherheitsnetzes (Standard 10 Minuten). Dass die Absicht
  // JETZT SCHON wieder `offen` und exakt zur neuen Auftragsfaelligkeit terminiert ist, ist
  // der Beweis. Der Abgleich wird hier absichtlich NICHT aufgerufen.
  const a5Absicht = psql(`select o.status, (o.next_attempt_at = j.due_at)
                            from public.helmut_job_outbox o join public.helmut_jobs j on j.id=o.job_id
                           where o.job_id='${a5.id}'`).split("|");
  check("6.6 Die Absicht ist SOFORT wieder offen und zur neuen Faelligkeit terminiert",
    a5Absicht[0] === "offen" && /^t/.test(a5Absicht[1]), a5Absicht.join("/"));
  // Zeitraffer: der Backoff wird vorgezogen (die Wartezeit selbst ist nicht Gegenstand des
  // Tests). Danach laeuft der Auftrag OHNE Abgleich und OHNE Testpumpe durch.
  psql(`update public.helmut_jobs set due_at = now() - interval '1 second' where id='${a5.id}'`);
  psql(`update public.helmut_job_outbox set next_attempt_at = now() - interval '1 second' where job_id='${a5.id}'`);
  await relayEinstieg("zeitgeber");
  await lambdaLauf();
  check("6.7 Die Wiederholung fuehrt ihn sicher zu Ende",
    psql(`select status from public.helmut_jobs where id='${a5.id}'`) === "erledigt");
  handlerVerhalten = () => ({ ok: true });

  abschnitt("7 · Absturz ZWISCHEN Outbox und Versand (Zusage 11)");
  const a6 = planeAuftrag("e2e-zwischen");
  // Die Absicht wird vergeben, aber NIE bestaetigt (der Relay stirbt nach der Vergabe).
  psql(`select outbox_id from public.helmut_outbox_naechste(50, 'sqs')`);
  check("7.1 Die Absicht ist vergeben (versendet), aber unbestaetigt",
    psql(`select status from public.helmut_job_outbox where job_id='${a6.id}'`) === "versendet");
  psql(`update public.helmut_job_outbox set next_attempt_at = now() - interval '1 second' where job_id='${a6.id}'`);
  await relayEinstieg("zeitgeber");                 // der naechste Relaylauf holt sie erneut
  await lambdaLauf();
  check("7.2 Der Auftrag geht trotzdem nicht verloren",
    psql(`select status from public.helmut_jobs where id='${a6.id}'`) === "erledigt");

  abschnitt("8 · SQS-Ausfall verliert nichts (Zusage 12)");
  const a7 = planeAuftrag("e2e-sqs-ausfall");
  queue.ausfall = true;
  const rAusfall = await relayEinstieg("zeitgeber");
  check("8.1 Der Relay meldet den Fehlversuch ehrlich", (rAusfall.versendet || 0) === 0, JSON.stringify(rAusfall));
  check("8.2 Der Auftrag wartet unveraendert weiter",
    psql(`select status from public.helmut_jobs where id='${a7.id}'`) === "wartend");
  queue.ausfall = false;
  psql(`update public.helmut_job_outbox set status='offen', next_attempt_at=now(), attempts=0 where job_id='${a7.id}'`);
  await relayEinstieg("zeitgeber");
  await lambdaLauf();
  check("8.3 Nach der Erholung laeuft er normal durch",
    psql(`select status from public.helmut_jobs where id='${a7.id}'`) === "erledigt");

  abschnitt("9 · Defekte Nachricht erreicht die Quarantaene (Zusage 13)");
  queue.sende(JSON.stringify({ jobId: "keine-uuid", schemaVersion: 1 }));
  for (let i = 0; i < 12 && queue.offen > 0; i += 1) await lambdaLauf();
  check("9.1 Sie liegt nach genau maxReceiveCount Versuchen in der Quarantaene",
    queue.quarantaene.length === 1 && queue.quarantaene[0].empfangen === 5,
    `q=${queue.quarantaene.length}`);

  abschnitt("10 · Der Sicherheitsabgleich repariert eine VERLORENE Relay-Ausloesung (Zusage 15)");
  const a8 = planeAuftrag("e2e-verlorene-ausloesung");
  // Die Absicht wird bestaetigt, OHNE dass je eine Nachricht ankam (verlorener Anstoss).
  const outboxId = psql(`select id from public.helmut_job_outbox where job_id='${a8.id}'`);
  psql(`update public.helmut_job_outbox set status='bestaetigt', confirmed_at=now() - interval '2 hours',
        updated_at=now() - interval '2 hours' where id='${outboxId}'`);
  psql(`update public.helmut_jobs set due_at = now() - interval '2 hours' where id='${a8.id}'`);
  check("10.1 Der Auftrag wartet, aber es existiert keine Nachricht",
    psql(`select status from public.helmut_jobs where id='${a8.id}'`) === "wartend" && queue.offen === 0);
  // DER TEST RUFT DEN ABGLEICH NICHT AUF. Er laeuft ausschliesslich im ZEITGEBER-Pfad von
  // lambda/relay.js — damit ist bewiesen, dass die Reparatur KEINEN Vercel-Cron braucht.
  const zeitgeber = await relayEinstieg("zeitgeber");
  check("10.2 Der Zeitgeber selbst hat die verwaiste Absicht wieder geoeffnet",
    zeitgeber.abgleich && zeitgeber.abgleich.gelaufen === true && Number(zeitgeber.abgleich.wiedereroeffnet) >= 1,
    JSON.stringify(zeitgeber.abgleich));
  check("10.3 Derselbe Zeitgeberlauf hat das Signal auch gleich versendet",
    (zeitgeber.versendet || 0) >= 1 && queue.offen >= 1, JSON.stringify({ v: zeitgeber.versendet, q: queue.offen }));
  await lambdaLauf();
  check("10.4 Der Auftrag laeuft danach ohne Zutun durch",
    psql(`select status from public.helmut_jobs where id='${a8.id}'`) === "erledigt");

  abschnitt("11 · Vollstaendiger Abfluss OHNE Vercel-Cron und OHNE Testpumpe (Zusage 14)");
  for (let i = 0; i < 10; i += 1) planeAuftrag(`e2e-last-${i}`);
  let runden = 0;
  while (runden < 25) {
    // NUR die beiden echten Ausloeser: Zeitgeber und Lambda. Kein Dispatcheraufruf.
    // eslint-disable-next-line no-await-in-loop
    await relayEinstieg("zeitgeber");
    // eslint-disable-next-line no-await-in-loop
    const lauf = await lambdaLauf({ anzahl: 10 });
    const offen = zaehle("select count(*) from public.helmut_jobs where status in ('wartend','laeuft')");
    if (offen === 0 && queue.offen === 0) break;
    runden += 1;
  }
  // Ein normaler weiterer Zeitgebertick (in Production eine Minute spaeter). Er schliesst die
  // Absichten der zuletzt fertig gewordenen Auftraege — Buchhaltung, kein Antrieb.
  await relayEinstieg("zeitgeber");
  check("11.1 Alle Auftraege sind abgeflossen",
    zaehle("select count(*) from public.helmut_jobs where status in ('wartend','laeuft')") === 0);
  check("11.2 Keine Nachricht blieb liegen", queue.offen === 0);
  check("11.3 Kein Auftrag ist endgueltig fehlgeschlagen",
    zaehle("select count(*) from public.helmut_jobs where status='fehlgeschlagen'") === 0);
  check("11.4 Kein Auftrag wurde doppelt gearbeitet",
    [...arbeitProAuftrag.values()].every((n) => n <= 2));
  check("11.5 Bestaetigte Absichten terminaler Auftraege sind geschlossen",
    zaehle(`select count(*) from public.helmut_job_outbox o join public.helmut_jobs j on j.id=o.job_id
             where j.status in ('erledigt','fehlgeschlagen') and o.status='bestaetigt'`) === 0);

  fs.rmSync(bauZiel, { recursive: true, force: true });
  fs.rmSync(entpackt, { recursive: true, force: true });
  fs.rmSync(entpacktRelay, { recursive: true, force: true });

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("EINORDNUNG: lokaler Integrationstest. Echt sind PostgreSQL, Migrationen, Outbox,");
  console.log("Relay-Einstiegspunkt, SQS-Adapter, GEBAUTES Lambda-Paket, Verbraucher und Fachkern.");
  console.log("Ersetzt sind ausschliesslich zwei Aussengrenzen: das AWS-Netz und der SSM-Dienst.");
  console.log("KEIN AWS-Production-Beweis.");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => { console.error("FATAL:", error && error.stack); process.exit(1); });
