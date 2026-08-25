#!/usr/bin/env node
"use strict";

// Helmut — DER OUTBOX-RELAY (Korrekturlauf 2026-08-14/3, Luecke 1).
// =============================================================================================
// DER BEFUND, DER DIESEN TEST NOETIG MACHTE: der Ende-zu-Ende-Test pumpte den Versand vorher
// selbst (`await versende()` in einer Testschleife). Er bewies damit den TRANSPORT, aber nicht
// den ANTRIEB — im Betrieb haette niemand den Dispatcher regelmaessig angestossen ausser dem
// Vercel-Cron. Dieser Test prueft den Antrieb selbst.
//
// WAS BEWIESEN WIRD:
//   1. Der Relay traegt NUR Signale — kein Handler, kein Modell, kein Quellenabruf.
//   2. Er laeuft nur im Ereignis-Antrieb (kein zweiter, stiller Antrieb neben dem Cron).
//   3. Er ist gedeckelt: Klassen-Lease gegen Aufruflawinen, harte Schleifenobergrenze,
//      KEINE Rekursion, KEINE Warteschleife.
//   4. Mehrere gleichzeitige Relayinstanzen bekommen DISJUNKTE Absichten (echte PostgreSQL).
//   5. Der unmittelbare Anstoss kann einen bereits belegten Abschluss NIE beschaedigen.
//   6. Der Zeitgeber traegt zusaetzlich das Sicherheitsnetz (Abgleich) — deshalb braucht die
//      automatische Reparatur eines verlorenen Anstosses KEINEN Vercel-Cron.
//
// Abschnitte 4 und 7 brauchen eine lokale PostgreSQL. Fehlt sie, wird ehrlich uebersprungen.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const relay = require(path.join(ROOT, "lib", "helmut", "outbox-relay"));
const jobDispatch = require(path.join(ROOT, "lib", "helmut", "job-dispatch"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const ENV_EREIGNIS = {
  HELMUT_SCALABLE_PIPELINE: "on",
  HELMUT_JOB_DISPATCH_MODE: "queue",
  HELMUT_JOB_TRANSPORT: "sqs",
  // Seit dem geschlossenen Aktivierungsvorlauf (2026-08-24) entscheidet im Queue-Modus die
  // VOLLSTAENDIGE Vorpruefung, bevor die erste Absicht vergeben wird. Ohne Klassengrenzen
  // waere der Ereignisbetrieb NICHT aktivierungsbereit — die Route wiese jedes Signal mit
  // 409 'klassengrenzen-aus' ab. Diese Suite prueft den BEREITEN Ereignisbetrieb, also
  // gehoert der Wert in die Umgebung.
  HELMUT_KLASSEN_GRENZEN: "on",
  AWS_REGION: "eu-central-1",
  HELMUT_SQS_QUEUE_URL: "https://sqs.eu-central-1.amazonaws.com/123456789012/helmut-test"
};

// ── PostgreSQL (nur fuer die Nebenlaeufigkeitsabschnitte) ─────────────────────────────────────
const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "/tmp/helmut-pgverify/sock",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "postgres",
  db: "helmut_relay_test"
};
function psql(sql, { db = PG.db, datei = null } = {}) {
  const args = ["-h", PG.host, "-p", PG.port, "-U", PG.user, "-d", db, "-tAq", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function datenbankVerfuegbar() {
  try { psql("select 1", { db: "postgres" }); return true; } catch (_) { return false; }
}

async function main() {
  console.log("Helmut — Outbox-Relay (Antrieb statt Testpumpe)\n");

  // ── 1 · DER RELAY TRAEGT KEINE FACHARBEIT ────────────────────────────────────────────────
  abschnitt("1 · Der Relay traegt ausschliesslich Signale");
  const quelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", "outbox-relay.js"), "utf8");
  const relayCode = quelle.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
  const lambdaQuelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", "lambda-relay.js"), "utf8");
  const lambdaCode = lambdaQuelle.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");

  for (const [name, code] of [["outbox-relay.js", relayCode], ["lambda-relay.js", lambdaCode]]) {
    check(`1.1 ${name} kennt keinen Fachhandler`,
      !/require\(["']\.\/handlers|fuehreAuftragAus|jobQueueClaim|arbeite\(/.test(code));
    check(`1.2 ${name} ruft kein Modell und keine Quelle ab`,
      !/openai|anthropic|fetchUrl|fetchText|requestOpenAI/i.test(code));
  }
  // Nur der KOERPER von relayLauf: ein Aufruf aus der gedeckelten Schleife heraus ist
  // erlaubt, ein Aufruf aus relayLauf selbst waere unbegrenzte Rekursion.
  const koerperRelayLauf = (relayCode.split("async function relayLauf")[1] || "")
    .split("async function ")[0];
  check("1.3 Der Relay ruft sich NIE selbst auf (keine Rekursion)",
    !/relayLauf\s*\(/.test(koerperRelayLauf) && !/stosseRelayAn\s*\(/.test(koerperRelayLauf));
  check("1.4 Keine Warteschleife im Relay (kein sleep/setTimeout-Warten)",
    !/setTimeout|setInterval|Atomics\.wait/.test(relayCode));

  // ── 2 · NUR IM EREIGNIS-ANTRIEB ──────────────────────────────────────────────────────────
  abschnitt("2 · Der Relay laeuft nur im Ereignis-Antrieb");
  const ohneFlag = await relay.relayLauf({ env: {}, deps: { klassen: null } });
  check("2.1 Ohne Flag laeuft er nicht", ohneFlag.gelaufen === false && (ohneFlag.versendet || 0) === 0,
    JSON.stringify(ohneFlag));
  const cronModus = await relay.relayLauf({
    env: { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_JOB_DISPATCH_MODE: "off" }, deps: { klassen: null } });
  check("2.2 Im Cron-Antrieb laeuft er nicht (es gibt genau EINEN primaeren Antrieb)",
    cronModus.gelaufen === false && String(cronModus.grund).startsWith("antrieb-"), JSON.stringify(cronModus));
  const schatten = await relay.relayLauf({
    env: { ...ENV_EREIGNIS, HELMUT_JOB_DISPATCH_MODE: "shadow" }, deps: { klassen: null } });
  check("2.3 Im Schattenmodus laeuft er nicht", schatten.gelaufen === false, JSON.stringify(schatten));

  // ── 3 · DECKELUNG ────────────────────────────────────────────────────────────────────────
  abschnitt("3 · Deckelung (Lease, Stapelgroesse, Schleifenobergrenze)");
  let belegt = 0;
  const klassenBesetzt = {
    belege: async () => { belegt += 1; return { erlaubt: false, grund: "belegt" }; },
    gebeFrei: async () => ({})
  };
  const rBelegt = await relay.relayLauf({ env: ENV_EREIGNIS, deps: { klassen: klassenBesetzt } });
  check("3.1 Ein bereits laufender Relay verhindert einen zweiten (Klassen-Lease)",
    rBelegt.gelaufen === false && rBelegt.grund === "relay-belegt" && belegt === 1);

  let freigaben = 0;
  const klassenFrei = {
    belege: async () => ({ erlaubt: true, slot: "slot-1" }),
    gebeFrei: async () => { freigaben += 1; return {}; }
  };
  await relay.relayLauf({
    env: ENV_EREIGNIS,
    deps: { klassen: klassenFrei, versendeAbsichten: async () => { throw new Error("versand kaputt"); } }
  }).catch(() => {});
  check("3.2 Die Lease wird AUCH bei einem Fehler freigegeben", freigaben === 1, String(freigaben));

  let laeufe = 0;
  const immerVoll = async ({ limit }) => { laeufe += 1; return { versendet: limit, vergeben: limit }; };
  const schleife = await relay.relaySchleife({
    env: ENV_EREIGNIS, deps: { klassen: null, versendeAbsichten: immerVoll }, limit: 5, maxLaeufe: 4 });
  check("3.3 Die Schleife ist hart gedeckelt (auch bei dauerhaft voller Outbox)",
    laeufe === 4 && schleife.laeufe === 4, `${laeufe}`);
  check("3.4 Sie sendet genau limit × maxLaeufe und nicht mehr", schleife.versendet === 20, String(schleife.versendet));

  laeufe = 0;
  const einmalWenig = async () => { laeufe += 1; return { versendet: 1, vergeben: 1 }; };
  await relay.relaySchleife({
    env: ENV_EREIGNIS, deps: { klassen: null, versendeAbsichten: einmalWenig }, limit: 50, maxLaeufe: 5 });
  check("3.5 Sie hoert auf, sobald nichts mehr anliegt (kein Leerlauf)", laeufe === 1, String(laeufe));

  check("3.6 Die Stapelgroesse ist klein und bewusst gesetzt",
    relay.RELAY_STAPEL === 50 && relay.RELAY_LEASE_MS === 60000);

  // ── 4 · DER UNMITTELBARE ANSTOSS ─────────────────────────────────────────────────────────
  abschnitt("4 · Der unmittelbare Anstoss");
  let ausgeloest = 0;
  const anstoss = await relay.stosseRelayAn({
    env: ENV_EREIGNIS, deps: { loeseAus: async () => { ausgeloest += 1; } } });
  check("4.1 Ein vorhandener Ausloeser wird genau EINMAL benutzt",
    ausgeloest === 1 && anstoss.angestossen === true && anstoss.weg === "ausloeser");

  const kaputt = await relay.stosseRelayAn({
    env: ENV_EREIGNIS, deps: { loeseAus: async () => { throw new Error("lambda gedrosselt"); } } });
  check("4.2 Ein FEHLGESCHLAGENER Anstoss wirft nicht (ein erledigter Auftrag bleibt erledigt)",
    kaputt.angestossen === false && typeof kaputt.grund === "string", JSON.stringify(kaputt));

  let direkte = 0;
  const direkt = await relay.stosseRelayAn({
    env: ENV_EREIGNIS,
    deps: { klassen: null, versendeAbsichten: async () => { direkte += 1; return { versendet: 0, vergeben: 0 }; } } });
  check("4.3 Ohne Ausloeser laeuft der Relay unmittelbar selbst (lokal, Route, Test)",
    direkte === 1 && direkt.weg === "direkt");

  // ── 5 · DER ZEITGEBER TRAEGT DAS SICHERHEITSNETZ ─────────────────────────────────────────
  abschnitt("5 · Der Zeitgeber traegt das Sicherheitsnetz (keine Cron-Abhaengigkeit)");
  let abgleiche = 0;
  const zeit = await relay.zeitgeberLauf({
    env: ENV_EREIGNIS,
    deps: {
      klassen: null,
      abgleichLauf: async () => { abgleiche += 1; return { fehlend: 1, wiedereroeffnet: 2, verzichtet: 3 }; },
      versendeAbsichten: async () => ({ versendet: 0, vergeben: 0 })
    }
  });
  check("5.1 Der Zeitgeberlauf fuehrt den Abgleich aus", abgleiche === 1 && zeit.abgleich.gelaufen === true);
  check("5.2 Er meldet die Zahlen des Abgleichs ehrlich weiter",
    zeit.abgleich.wiedereroeffnet === 2 && zeit.abgleich.verzichtet === 3, JSON.stringify(zeit.abgleich));

  let versandTrotzdem = 0;
  const zeitKaputt = await relay.zeitgeberLauf({
    env: ENV_EREIGNIS,
    deps: {
      klassen: null,
      abgleichLauf: async () => { throw new Error("abgleich kaputt"); },
      versendeAbsichten: async () => { versandTrotzdem += 1; return { versendet: 0, vergeben: 0 }; }
    }
  });
  check("5.3 Ein fehlgeschlagener Abgleich verhindert den Versand NICHT",
    versandTrotzdem === 1 && zeitKaputt.abgleich.gelaufen === false, JSON.stringify(zeitKaputt.abgleich));

  const lambdaRelay = require(path.join(ROOT, "lib", "helmut", "lambda-relay"));
  let welcher = null;
  await lambdaRelay.handler({ ausloeser: "zeitgeber" }, {}, {
    env: ENV_EREIGNIS, log: () => {}, konfiguration: false,
    relay: {
      zeitgeberLauf: async () => { welcher = "zeitgeber"; return { laeufe: 1, versendet: 0 }; },
      relayLauf: async () => { welcher = "einzeln"; return { versendet: 0 }; },
      relaySchleife: async () => { welcher = "schleife"; return { laeufe: 1, versendet: 0 }; }
    }
  });
  check("5.4 Der Zeitgeber-Ausloeser waehlt den Zeitgeberlauf (mit Netz)", welcher === "zeitgeber", String(welcher));
  await lambdaRelay.handler({ ausloeser: "verbraucher" }, {}, {
    env: ENV_EREIGNIS, log: () => {}, konfiguration: false,
    relay: {
      zeitgeberLauf: async () => { welcher = "zeitgeber"; return { laeufe: 1, versendet: 0 }; },
      relayLauf: async () => { welcher = "einzeln"; return { versendet: 0 }; }
    }
  });
  check("5.5 Der Verbraucher-Anstoss macht GENAU EINEN Lauf (keine Aufrufverstaerkung)",
    welcher === "einzeln", String(welcher));

  // OHNE eingespieltes Relay-Modul: der Handler MUSS den echten Relay benutzen. Ohne diese
  // Pruefung koennte man `outbox-relay` durch eine Attrappe ersetzen und alle Tests blieben
  // gruen, weil sie ihre eigene Attrappe mitbringen (genau dieses Loch fand die
  // Mutationsprobe M2).
  let echterVersand = 0;
  const echterWeg = await lambdaRelay.handler({ ausloeser: "zeitgeber" }, {}, {
    env: ENV_EREIGNIS, log: () => {}, konfiguration: false,
    relayDeps: {
      klassen: null, abgleichAktiv: false,
      versendeAbsichten: async () => { echterVersand += 1; return { versendet: 7, vergeben: 7 }; }
    }
  });
  check("5.6 OHNE Attrappe laeuft der ECHTE Relay (kein austauschbares Modul)",
    echterVersand === 1 && (echterWeg.versendet || 0) === 7, JSON.stringify(echterWeg));
  let echterEinzel = 0;
  const echterAnstoss = await lambdaRelay.handler({ ausloeser: "verbraucher" }, {}, {
    env: ENV_EREIGNIS, log: () => {}, konfiguration: false,
    relayDeps: {
      klassen: null,
      versendeAbsichten: async () => { echterEinzel += 1; return { versendet: 3, vergeben: 3 }; }
    }
  });
  check("5.7 Auch der Verbraucher-Anstoss laeuft ohne Attrappe durch den echten Relay",
    echterEinzel === 1 && (echterAnstoss.versendet || 0) === 3, JSON.stringify(echterAnstoss));

  // ── 6 · KONFIGURATIONSRIEGEL AUCH IM RELAY ───────────────────────────────────────────────
  abschnitt("6 · Auch der Relay arbeitet nie ohne Supabase");
  let gelaufen = false;
  const ohneSupabase = await lambdaRelay.handler({ ausloeser: "zeitgeber" }, {}, {
    env: { ...ENV_EREIGNIS },
    log: () => {},
    relay: { zeitgeberLauf: async () => { gelaufen = true; return { laeufe: 1, versendet: 0 }; } }
  });
  check("6.1 Ohne belegte Supabase-Verbindung laeuft der Relay NICHT",
    gelaufen === false && ohneSupabase.grund === "supabase-nicht-verbunden", JSON.stringify(ohneSupabase));

  const ssmKaputt = await lambdaRelay.handler({ ausloeser: "zeitgeber" }, {}, {
    env: { ...ENV_EREIGNIS, HELMUT_SUPABASE_URL_PARAMETER: "/x", HELMUT_SUPABASE_KEY_PARAMETER: "/y" },
    log: () => {},
    konfigurationDeps: { ssm: { getParameter: () => Promise.reject(new Error("AccessDenied")) } },
    relay: { zeitgeberLauf: async () => { gelaufen = true; return { laeufe: 1, versendet: 0 }; } }
  });
  check("6.2 Ein SSM-Fehler stoppt geschlossen (nichts behauptet, nichts versendet)",
    gelaufen === false && ssmKaputt.grund === "konfiguration-nicht-geladen", JSON.stringify(ssmKaputt));

  // ── 7 · DISJUNKTE ABSICHTEN BEI GLEICHZEITIGEN RELAYS (echte PostgreSQL) ─────────────────
  abschnitt("7 · Gleichzeitige Relayinstanzen (echte PostgreSQL)");
  if (!datenbankVerfuegbar()) {
    console.log("  SKIP: keine lokale PostgreSQL erreichbar — Nebenlaeufigkeitsnachweis OFFEN.");
  } else {
    psql(`drop database if exists ${PG.db}`, { db: "postgres" });
    psql(`create database ${PG.db}`, { db: "postgres" });
    psql(`do $$ begin
      if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end $$;`);
    for (const m of [
      "20260808_scalable_job_queue.sql", "20260813090000_jobqueue_outbox.sql",
      "20260813090100_verteilte_grenzen.sql", "20260814090000_queue_verbraucher.sql"
    ]) psql(null, { datei: path.join(ROOT, "supabase", "migrations", m) });

    for (let i = 0; i < 40; i += 1) {
      psql(`select id from public.helmut_enqueue_job_mit_outbox(
        'source_fetch', 'relay-neben-${i}', '2026-08-14', '{}'::jsonb, now(), 100::smallint, 5, null, 1)`);
    }

    // ACHT gleichzeitige Relayinstanzen, jede mit eigenem Transport-Zaehler. `helmut_outbox_naechste`
    // vergibt mit FOR UPDATE SKIP LOCKED — keine Absicht darf zweimal vergeben werden.
    const gesehen = [];
    const relayDeps = (marke) => ({
      klassen: null,
      naechste: async ({ limit, transport: t }) => {
        const zeilen = psql(`select outbox_id, job_id, schema_version from public.helmut_outbox_naechste(${Number(limit) || 50}, '${t}')`);
        const absichten = zeilen ? zeilen.split("\n").filter(Boolean).map((r) => {
          const [outboxId, jobId, schemaVersion] = r.split("|");
          return { outboxId, jobId, schemaVersion: Number(schemaVersion) };
        }) : [];
        for (const a of absichten) gesehen.push({ marke, outboxId: a.outboxId });
        return { verfuegbar: true, absichten };
      },
      bestaetige: async ({ outboxId, ok, fehler }) => {
        psql(`select uebernommen from public.helmut_outbox_bestaetige('${outboxId}'::uuid, ${ok ? "true" : "false"},
          ${fehler ? `'${String(fehler).replace(/'/g, "''")}'` : "null"})`);
        return { verfuegbar: true, uebernommen: true };
      },
      zuruecklegen: async () => ({ verfuegbar: true, uebernommen: true }),
      transport: { name: "sqs", verfuegbar: true, buendelt: false, sende: async () => ({ ok: true, id: "x" }) }
    });

    await Promise.all([...Array(8)].map((_, i) => relay.relayLauf({
      env: ENV_EREIGNIS, deps: relayDeps(`relay-${i}`), limit: 10
    })));

    const ids = gesehen.map((g) => g.outboxId);
    check("7.1 Keine Absicht wurde zweimal vergeben (SKIP LOCKED)",
      new Set(ids).size === ids.length, `${ids.length} vergeben, ${new Set(ids).size} eindeutig`);
    // EHRLICHE EINORDNUNG: `psql` blockiert hier den Prozess, die acht Relays laufen also
    // verschraenkt, nicht echt parallel. Bewiesen wird damit genau das, was zaehlt: JEDE
    // Relayinstanz bekommt nur, was noch offen ist, und keine Absicht wird doppelt vergeben.
    // Den echt parallelen Fall (8 gleichzeitige Verbindungen) belegt
    // `jobqueue-outbox-datenbank-test` §8.
    check("7.2 Mindestens zwei Relayinstanzen haben Absichten bekommen (Arbeit verteilt sich)",
      new Set(gesehen.map((g) => g.marke)).size >= 2 && ids.length === 40,
      `instanzen=${new Set(gesehen.map((g) => g.marke)).size} vergeben=${ids.length}`);
    const doppelt = Number(psql(`select count(*) from public.helmut_job_outbox where attempts > 1`));
    check("7.3 Kein doppelter Versandversuch verbucht", doppelt === 0, String(doppelt));

    // Die Wiedervorlage (neu): sie terminiert GENAU auf die Faelligkeit des Auftrags.
    const jobId = psql(`select id from public.helmut_jobs order by created_at limit 1`);
    // Backoff wie nach einem Fehlversuch (die Verzahnung mit helmut_finish_job selbst ist
    // im Ende-zu-Ende-Test §6 belegt; hier geht es allein um die Wiedervorlage).
    psql(`update public.helmut_jobs set due_at = now() + interval '45 seconds' where id='${jobId}'`);
    const vor = psql(`select o.status from public.helmut_job_outbox o where o.job_id='${jobId}'`);
    const v = psql(`select uebernommen, grund, sofort from public.helmut_outbox_erneut_vorlegen('${jobId}'::uuid)`).split("|");
    const nach = psql(`select o.status, (o.next_attempt_at = j.due_at)
                         from public.helmut_job_outbox o join public.helmut_jobs j on j.id=o.job_id
                        where o.job_id='${jobId}'`).split("|");
    check("7.4 Nach einem Fehlversuch wird die Absicht wieder geoeffnet",
      /^t/.test(v[0]) && nach[0] === "offen", `vorher=${vor} ${v.join("/")} nachher=${nach.join("/")}`);
    check("7.5 Sie ist GENAU zur neuen Auftragsfaelligkeit terminiert (kein 10-Minuten-Umweg)",
      /^t/.test(nach[1]), nach.join("/"));
    check("7.6 Ein Backoff in der Zukunft loest KEINEN sofortigen Anstoss aus (kein Leeraufruf)",
      /^f/.test(v[2]), v.join("/"));
    const terminal = psql(`select id from public.helmut_jobs where status='wartend' limit 1`);
    psql(`update public.helmut_jobs set status='erledigt' where id='${terminal}'`);
    const vTerminal = psql(`select uebernommen, grund from public.helmut_outbox_erneut_vorlegen('${terminal}'::uuid)`).split("|");
    check("7.7 Ein TERMINALER Auftrag wird nie erneut vorgelegt (kein zweiter Fachlauf)",
      /^f/.test(vTerminal[0]) && vTerminal[1] === "status-erledigt", vTerminal.join("/"));
    psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  }

  // ── 8 · DER VERBRAUCHER STOESST GENAU EINMAL AN ──────────────────────────────────────────
  abschnitt("8 · Der Verbraucher stoesst genau einmal an");
  const verbraucherQuelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", "queue-verbraucher.js"), "utf8");
  const verbraucherCode = verbraucherQuelle.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
  const anstoesse = (verbraucherCode.match(/stosseRelayAn/g) || []).length;
  check("8.1 Der Verbraucher ruft den Anstoss an genau zwei Stellen (Abschluss und Wiedervorlage)",
    anstoesse === 2, String(anstoesse));
  const lambdaVerbraucher = fs.readFileSync(path.join(ROOT, "lib", "helmut", "lambda-verbraucher.js"), "utf8");
  check("8.2 Der Lambda-Verbraucher loest den Relay ASYNCHRON aus (InvocationType Event)",
    /InvocationType:\s*["']Event["']/.test(lambdaVerbraucher));
  check("8.3 Er wartet nicht auf den Relay (kein Ergebnis der Relay-Invocation verarbeitet)",
    !/Payload.*relay|await\s+relayErgebnis/i.test(lambdaVerbraucher));

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((fehler) => {
  console.error("FATAL:", fehler);
  process.exit(1);
});
