"use strict";

// Kleine Operatorprobe. CI: synthetische Negativvertraege, keine Originaldateien.
// Volle lokale Abnahme: --container helmut-pflichtanalyse-20261126
// --original <private02-originalbindung-original.json> --vertrag <privateSELECT.json>.
// Ausschliesslich private Testuhr28Nov; Artikel-/VG-/Ticket-/Operatorpins bleiben echt.
const A = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const O = require("./quellen-restpflicht-20261127"), B = require("../../lib/helmut/betriebskosten-budget");
const R = require("../../lib/helmut/roh-quellenstaende"), F = require("../../lib/helmut/quellen-faelligkeit");
const { hash } = require("../../lib/helmut/briefing-speicher");
const { einzelArtikelAuftrag } = require("../../lib/helmut/scalable-pipeline");
const tag = O.ZIEL.tag, jetzt = Date.parse(tag + "T00:10:00.000Z"), abrufId = "00000000-0000-0000-0000-000000000028";
const opts = { jetztMs: jetzt }, sha = text => require("node:crypto").createHash("sha256").update(text).digest("hex");
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const literal = v => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
let tests = 0;
async function test(name, fn) { await fn(); tests++; console.log("PASS " + name); }
function originaldatei(file) {
  const x = JSON.parse(fs.readFileSync(file, "utf8")), result = x.result || x;
  const body = JSON.parse(result.content[0].text).result;
  return JSON.parse(body.slice(body.indexOf("\n[") + 1, body.lastIndexOf("\n</untrusted")))[0];
}
// Kleiner oeffentlicher RSS-Auszug, keine Personendaten oder privaten Profile.
const PUBLIC_DOC = { id: O.ZIEL.raw, title: "Fragen und Antworten zum EU-Haushalt",
  summary: "Wofür gibt die EU ihr Geld aus und wie nimmt sie es wieder ein? Worum geht es bei der dieswöchigen Sondertagung des Europäischen Rates? Was ist der MFR? Lesen Sie hier Fragen und Antworten im Überblick.",
  url: "https://www.bundesregierung.de/breg-de/aktuelles/fragen-antworten-mfr-2462532",
  canonical_url: "https://bundesregierung.de/breg-de/aktuelles/fragen-antworten-mfr-2462532",
  source_name: "Bundesregierung", source_id: "bundesregierung", source_type: "ministry", link_type: "direct",
  published_at: "2026-11-26T10:01:37+00:00", retrieved_at: "2026-11-27T00:01:20.775+00:00",
  raw: { originalUrl: null, sourcePriority: 95, retrievalPathId: "rp-bundesregierung" } };
function bestand(contract, doc = PUBLIC_DOC) {
  const auftrag = einzelArtikelAuftrag({ id: doc.id, stand: O.ZIEL.stand });
  const quelle = structuredClone(require("../../lib/helmut/sources").v1Sources.find(q => q.id === "bundesregierung"));
  quelle.retrievalPathId = "rp-bundesregierung";
  const due = tag + "T00:00:00.000Z", p = { jobType: "source_fetch", idempotencyKey: "synthetische-pflicht-" + tag,
    tenantId: null, priority: 50, dueAt: due, payload: { art: "geteilt", quelle } };
  const plan = { version: 1, tag, auftraege: [p], tagesplan: null, cursor: 1, zustand: "fertig" };
  plan.manifestHash = hash([tag, plan.auftraege, null]);
  const abruf = { id: abrufId, job_type: "source_fetch", status: "erledigt", tenant_id: null, priority: 50,
    idempotency_key: p.idempotencyKey, first_due_at: due, finished_at: due, lease_owner: null, lease_expires_at: null, payload: p.payload };
  const basis = { version: 1, bindung: F.quellbindung({ id: abrufId, tenantId: null, firstDueAt: due, payload: abruf.payload }),
    bestaetigtAm: due, ergebnis: { art: "teilweise", rohIds: [doc.id], analyse: [{ jobId: O.ZIEL.job, rohId: doc.id, stand: O.ZIEL.stand }] } };
  const calls = {}, tage = ["2026-11-27", "2026-11-12", "2026-11-12", "2026-11-12", "2026-11-17", "2026-11-20", "2026-11-26"];
  tage.forEach((day, i) => { const id = i ? "synthetische-alte-reserve-" + i : O.ZIEL.ticket;
    calls[id] = { id, day, model: "gpt-5-mini-eu", runId: i ? "synthetischer-altlauf-" + i : O.ZIEL.job,
      status: "ungeklaert", callType: "understanding", reserved: 212000, maxOutputTokens: 3000,
      requestHash: String(i + 1).repeat(64), contractHash: contract.contractHash, politicianId: null, createdAt: day + "T00:32:55.072Z" }; });
  const job = { id: O.ZIEL.job, job_type: "document_understanding", tenant_id: null, status: "fehlgeschlagen",
    idempotency_key: auftrag.idempotencyKey, payload: auftrag.payload, attempts: 3, max_attempts: 3, wiedervorlagen: 0,
    last_error: "modellausgang-unbekannt: artikel bleibt durch CAS gesperrt", finished_at: "2026-11-27T02:16:08.175182+00:00",
    lease_owner: null, lease_expires_at: null };
  return { job, rawJobs: [job], abruf, plan: { id: "main-quellenplan-" + tag, data: plan },
    beleg: { id: "main-quellenfaelligkeit-" + abrufId, data: { ...basis, belegHash: hash(basis) } }, aktuell: structuredClone(doc),
    archive: [{ id: `main-rohstand-${doc.id.slice(3)}-${O.ZIEL.stand}`, data: { version: 1, quellenHash: O.ZIEL.stand, dokument: structuredClone(doc) } }],
    cas: [{ vorgang_id: O.ZIEL.vg, zustand: "unbekannt", besitzer: null, lease_bis: null, fencing: 1, versuche: 1, ki_aufrufe: 1,
      ergebnis_hash: null, ergebnis_fencing: null, letzter_grund: "modellfehler:betriebskosten-abschluss-unbestaetigt" }],
    links: [], kos: [], vormerkungen: [], aktiveJobs: [], aktiveSlots: [], aktiveCas: [],
    casOperator: { definitionHash: O.ZIEL.operator, securityDefiner: false, eigentuemer: "postgres",
      acl: "{postgres=X/postgres,service_role=X/postgres}", konfiguration: ["search_path=public, pg_temp"],
      rollen: ["anon", "authenticated", "postgres", "service_role"].map(rolle => ({ rolle, execute: ["postgres", "service_role"].includes(rolle) })) },
    kostenBuch: { version: 1, contractHash: contract.contractHash, contract, calls, bound: 7 * 212000, frozen: null },
    nativeNutzung: { spalten: ["id", "created_at", "vorgang_id", "knowledge_object_id"], zeilen: [] },
    blobJobNutzung: [{ id: "synthetischer-historischer-Falsch0-Marker", runId: O.ZIEL.job, model: "none", keinAufruf: true,
      success: false, callType: "skipped-understanding-error" }], globalUsed: 0, originalUsed: 0, llmReservierungen: [] };
}
const vorschau = s => { const inhalt = JSON.stringify(s); return { version: 1, modus: "vorschau", verbraucht: false,
  tag, gelesenAm: new Date(jetzt).toISOString(), inhalt, digest: sha(inhalt) }; };
(async () => {
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv"); A.equal(R.standHash(PUBLIC_DOC), O.ZIEL.stand);
  const synthetisch = B.vertrag({ [B.ENV]: JSON.stringify({ version: 1, profileId: "synthetisch-operator",
    startsAt: "2026-11-05T23:00:10.000Z", dailyLimitUsd: 1, totalLimitUsd: 30,
    route: { provider: "azure", responsesUrl: "https://offline.openai.azure.com/openai/v1/responses", model: "gpt-5-mini-eu" } }) });
  await test("heute27Nov, fremder Tag und alter Vorwert bleiben geschlossen", async () => {
    const v = vorschau(bestand(synthetisch));
    await A.rejects(O.pruefe(v, { jetztMs: Date.parse("2026-11-27T13:00:00Z") }), /nur28Nov/);
    await A.rejects(O.pruefe(v, { jetztMs: jetzt + 86400000 }), /nur28Nov/);
    await A.rejects(O.pruefe({ ...v, gelesenAm: tag + "T00:00:00Z" }, opts), /Fuenfminuten/);
  });
  await test("formal gueltiger anderer Finanzvertrag bleibt am unveraenderten Produktpin gesperrt", async () => {
    await A.rejects(O.pruefe(vorschau(bestand(synthetisch)), opts), /unveraenderter1\/30USD-Vertrag/);
  });
  await test("CAS-Vorflug verweigert fremde, aktive und unvollstaendige Eigentuemer ohne Freigabe", async () => {
    O.pruefeCasRuhe([], jetzt);
    for (const c of [null, {}, [{ vorgang_id: "synthetisch", zustand: "modell-laeuft",
      besitzer: "synthetisch", lease_bis: "2026-09-10T00:00:00Z" }],
      [{ vorgang_id: "synthetisch", zustand: "reserviert", besitzer: "synthetisch", lease_bis: tag + "T23:00:00Z" }]])
      A.throws(() => O.pruefeCasRuhe(c, jetzt), /CAS-Eigentuemer/);
  });
  if (!process.argv.includes("--container")) { console.log(`${tests} negative Fachgruppen PASS; private positive SQL-Abnahme nicht ausgefuehrt.`); return; }
  A.equal(arg("--container"), "helmut-pflichtanalyse-20261126");
  A(process.argv.includes("--original") && process.argv.includes("--vertrag"), "Private Originalbindungen sind Pflicht");
  const original = originaldatei(arg("--original")), contract = originaldatei(arg("--vertrag")).contract;
  const doc = original.archiv.find(a => a.data.quellenHash === O.ZIEL.stand).data.dokument;
  A.equal(R.standHash(doc), O.ZIEL.stand); A.equal(contract.contractHash, O.ZIEL.kostenvertrag);
  A.equal(sha(original.cas_funktion), O.ZIEL.operator);
  let s = bestand(contract, doc); await O.pruefe(vorschau(s), opts);
  const inspect = JSON.parse(execFileSync("docker", ["inspect", arg("--container")], { encoding: "utf8" }))[0];
  A.equal(inspect.HostConfig.NetworkMode, "none"); A.match(inspect.Config.Image, /^postgres:17\.6-/);
  A(inspect.HostConfig.Tmpfs?.["/var/lib/postgresql/data"]);
  const db = "helmut_restpflicht_" + process.pid, container = arg("--container");
  const psql = (input, database = db) => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-At", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }).trim();
  psql(`create database ${db};`, "postgres");
  try {
    psql(fs.readFileSync(path.join(__dirname, "../../supabase/migrations/20260808_scalable_job_queue.sql"), "utf8"));
    psql(`alter table helmut_jobs add column quellen_prioritaet_tag date;alter table helmut_jobs add column wiedervorlagen int default 0;
      create table helmut_store(id text primary key,data jsonb);create table raw_documents(${Object.keys(doc).map(k => '"' + k + '" ' + (k === "raw" ? "jsonb" : typeof doc[k] === "number" ? "int" : "text")).join(",")});
      create table knowledge_objects(id text primary key,vorgang_id text,verstehen_fencing bigint);
      create table ko_document_links(knowledge_object_id text,raw_document_id text);
      create table helmut_verstehen_reservierungen(vorgang_id text primary key,zustand text,besitzer text,lease_bis timestamptz,fencing bigint,ergebnis_fencing bigint,ergebnis_hash text,ki_aufrufe int,versuche int,letzter_grund text,updated_at timestamptz,created_at timestamptz,eingabe_hash text);
      create table helmut_verstehen_vormerkungen(vorgang_id text primary key);
      create table llm_usage(id text primary key,created_at timestamptz,vorgang_id text,knowledge_object_id text);
      create table document_findings(raw_document_id text,source_id text,retrieval_path_id text,original_url text);
      create table helmut_klassen_slots(id uuid primary key,belegt_bis timestamptz);
      create table llm_budget_counters(day text,scope text,used int);
      create table llm_reservations(result_key text,day text,status text,expires_at timestamptz);
      create table helmut_anbieter_fenster(schluessel text,fensterart text,fenster_start timestamptz,verbraucht bigint);`);
    psql(original.cas_funktion + ";\nrevoke all on function public.helmut_verstehen_ausgang_aufloesen(text,text) from public,anon,authenticated;grant execute on function public.helmut_verstehen_ausgang_aufloesen(text,text) to service_role;");
    A.equal(psql("select encode(sha256(convert_to(pg_get_functiondef('public.helmut_verstehen_ausgang_aufloesen(text,text)'::regprocedure),'UTF8')),'hex')"), O.ZIEL.operator);
    const setup = () => {
      psql("truncate helmut_jobs,helmut_store,raw_documents,knowledge_objects,ko_document_links,helmut_verstehen_reservierungen,helmut_verstehen_vormerkungen,llm_usage,document_findings,helmut_klassen_slots,llm_budget_counters,llm_reservations,helmut_anbieter_fenster cascade;");
      psql(`insert into raw_documents select * from jsonb_populate_record(null::raw_documents,${literal(s.aktuell)});
        insert into helmut_store values('main-auth',${literal({ betriebskostenBudget: s.kostenBuch, llmUsage: s.blobJobNutzung })}),
        (${literal(s.plan.id)}#>>'{}',${literal(s.plan.data)}),(${literal(s.beleg.id)}#>>'{}',${literal(s.beleg.data)}),
        (${literal(s.archive[0].id)}#>>'{}',${literal(s.archive[0].data)});
        insert into helmut_verstehen_reservierungen select * from jsonb_populate_record(null::helmut_verstehen_reservierungen,${literal({ ...s.cas[0], updated_at: "2026-11-27T00:33:50Z" })});
        insert into helmut_jobs(id,job_type,idempotency_key,freshness_window,first_due_at,due_at,status,payload,attempts,max_attempts,last_error,finished_at,wiedervorlagen,quellen_prioritaet_tag,priority)
        values('${O.ZIEL.job}','document_understanding',${literal(s.job.idempotency_key)}#>>'{}','alt','2026-11-27','2026-11-27','fehlgeschlagen',${literal(s.job.payload)},3,3,${literal(s.job.last_error)}#>>'{}','2026-11-27T02:16:08.175182Z',0,'2026-11-27',50),
        ('${abrufId}','source_fetch',${literal(s.abruf.idempotency_key)}#>>'{}','2026-11-28','2026-11-28','2026-11-28','erledigt',${literal(s.abruf.payload)},1,3,null,'2026-11-28',0,null,50);`);
    };
    const sql = fs.readFileSync(path.join(__dirname, "quellen-restpflicht-20261127.sql"), "utf8");
    const uhr = "v_jetzt timestamptz := pg_catalog.clock_timestamp()";
    A.equal(sql.split(uhr).length, 2, "Genau ein kontrollierter Uhrpunkt, keine Produktpins geaendert");
    const ausfuehren = (modus, bindung, zeit = new Date(jetzt).toISOString(), go = "") => {
      const input = Object.entries({ modus, abruf_id: abrufId, bindung: JSON.stringify(bindung || {}), go })
        .map(([k, v]) => `\\set ${k} '${v.replaceAll("'", "\\'")}'`).join("\n") + "\n"
        + (zeit === null ? sql : sql.replace(uhr, `v_jetzt timestamptz := '${zeit}'::timestamptz`));
      return JSON.parse(psql(input).split("\n").at(-1));
    };
    const prepared = async () => O.pruefe(ausfuehren("vorschau"), opts);
    if (process.argv.includes("--nur-cas-leases")) {
      A(process.argv.includes("--cas-original"), "Sieben private Originalzeilen sind Pflicht");
      const alte = JSON.parse(fs.readFileSync(arg("--cas-original"), "utf8")).cas;
      // Originalbestand, kein Austausch des Produktpins oder des Funktionshashes.
      O.pruefeCasRuhe(alte, jetzt);
      await test("sieben echte abgelaufene CAS bleiben bei Aktivierung und Rueckweg bytegleich", async () => {
        setup(); psql(`insert into helmut_verstehen_reservierungen select * from jsonb_populate_recordset(null::helmut_verstehen_reservierungen,${literal(alte)});`);
        const b = await prepared(); A.deepEqual(b.vor.aktiveCas, alte);
        const r = ausfuehren("freigeben", b, undefined, "EU-EINZELNEUVERSUCH-20261128");
        A.deepEqual(r.vor.aktiveCas, alte); A.deepEqual(r.nach.aktiveCas, alte);
        A.deepEqual(r.vor.kostenBuch, r.nach.kostenBuch);
        const zurueck = ausfuehren("rueckweg", r); A.deepEqual(zurueck.nach.aktiveCas, alte);
        A.deepEqual(zurueck.nach.kostenBuch, b.vor.kostenBuch);
      });
      await test("neue/veraenderte aktive oder abgelaufene CAS stoppen auch mit frischem SQL-Vorwert atomar", async () => {
        for (const change of ["update helmut_verstehen_reservierungen set lease_bis='2026-11-28T23:00:00Z' where vorgang_id='vg-altersrente-20261121-53831c'",
          "update helmut_verstehen_reservierungen set lease_bis=null where vorgang_id='vg-altersrente-20261121-53831c'",
          "update helmut_verstehen_reservierungen set fencing=fencing+1 where vorgang_id='vg-altersrente-20261121-53831c'",
          "insert into helmut_verstehen_reservierungen(vorgang_id,zustand,besitzer,lease_bis) values('synthetisch-fremd','modell-laeuft','synthetisch','2026-11-20T00:00:00Z')"]) {
          setup(); psql(`insert into helmut_verstehen_reservierungen select * from jsonb_populate_recordset(null::helmut_verstehen_reservierungen,${literal(alte)});`);
          psql(change); const v = ausfuehren("vorschau"), vor = JSON.parse(v.inhalt);
          await A.rejects(O.pruefe(v, opts), /CAS-Eigentuemer/);
          A.throws(() => ausfuehren("freigeben", { version: 1, tag, modus: "vorbereitet", aktiviert: false,
            entscheidung: "erneut", abrufId, geprueftAm: new Date(jetzt).toISOString(), vor, digest: v.digest },
            undefined, "EU-EINZELNEUVERSUCH-20261128"));
          A.equal(psql("select max_attempts from helmut_jobs where job_type='document_understanding'"),"3");
          A.equal(psql("select count(*) from helmut_store where id like 'main-operator-restpflicht-%'"),"0");
        }
      });
      console.log(`${tests} gezielte CAS-Nachtragsgruppen PASS; alte sechs Gruppen nicht erneut ausgefuehrt.`);
      return;
    }
    setup(); let b = await prepared(), receipt;
    await test("native SQL sperrt27Nov, falsches GO, Tages-/Quellen-/Finanzdrift und aktive Lease", async () => {
      A.throws(() => ausfuehren("freigeben", b, "2026-11-27T13:00:00Z", "EU-EINZELNEUVERSUCH-20261128"));
      if (psql("select current_date::text") === "2026-11-27") {
        await A.rejects(O.pruefe(vorschau(s)), /nur28Nov/);
        A.throws(() => ausfuehren("freigeben", b, null, "EU-EINZELNEUVERSUCH-20261128"));
        console.log("PASS unveraenderter Operator mit echter27Nov-Uhr verweigert Aktivierung");
      }
      A.throws(() => ausfuehren("freigeben", b));
      const changes = ["update raw_documents set title='Fremder Titel'", "update helmut_jobs set max_attempts=5 where job_type='document_understanding'",
        "update helmut_jobs set lease_owner='fremd' where job_type='document_understanding'",
        "insert into helmut_klassen_slots values('00000000-0000-0000-0000-000000000001','2026-11-28T01:00:00Z')",
        "update helmut_store set data=jsonb_set(data,'{betriebskostenBudget,bound}','0') where id='main-auth'",
        "update helmut_store set data=data #- '{betriebskostenBudget,calls,synthetische-alte-reserve-1,status}' where id='main-auth'",
        `update helmut_store set data=jsonb_set(data,'{betriebskostenBudget}',${literal(bestand(synthetisch).kostenBuch)}) where id='main-auth'`,
        "insert into llm_budget_counters values('2026-11-28','global',100)",
        "insert into helmut_anbieter_fenster values('quellenarbeit|originalabrufe','tag','2026-11-28',16)",
        "insert into knowledge_objects values('fremdes-ko','vg-dieswöchigen-20261126-03af76',1)",
        "update helmut_store set data=jsonb_set(data,'{ergebnis,analyse,0,stand}','\"fremd\"') where id like 'main-quellenfaelligkeit-%'"];
      for (const change of changes) { setup(); b = await prepared(); psql(change);
        A.throws(() => ausfuehren("freigeben", b, undefined, "EU-EINZELNEUVERSUCH-20261128"));
        const frisch = ausfuehren("vorschau"); await A.rejects(O.pruefe(frisch, opts));
        // Auch ein handgebauter Verifikatorausgang darf die unabhaengigen
        // SQL-Wachen nicht umgehen: nun ist der Vorwert wieder frisch gebunden.
        A.throws(() => ausfuehren("freigeben", { ...b, digest: frisch.digest, vor: JSON.parse(frisch.inhalt) },
          undefined, "EU-EINZELNEUVERSUCH-20261128")); }
      setup(); b = await prepared();
    });
    await test("native Einzelaktivierung erhaelt alle7Reserven, Buch, Original, Payload und Zaehler", async () => {
      receipt = ausfuehren("freigeben", b, undefined, "EU-EINZELNEUVERSUCH-20261128");
      A.equal(receipt.nach.job.status, "wartend"); A.equal(receipt.nach.job.max_attempts, 4); A.equal(receipt.nach.job.attempts, 3);
      A.equal(receipt.nach.cas[0].zustand, "offen"); A.equal(receipt.nach.cas[0].ki_aufrufe, 1); A.equal(receipt.nach.cas[0].fencing, 1);
      A.deepEqual(receipt.vor.kostenBuch, receipt.nach.kostenBuch); A.equal(Object.keys(receipt.nach.kostenBuch.calls).length, 7);
      A.equal(receipt.vor.authDigest, receipt.nach.authDigest); A.deepEqual(receipt.vor.job.payload, receipt.nach.job.payload);
      A.throws(() => ausfuehren("freigeben", b, undefined, "EU-EINZELNEUVERSUCH-20261128"));
    });
    await test("Rueckweg vor Claim erhaelt UNKNOWN; dauerhafte Einmalquittung verhindert erneute Freigabe", async () => {
      const falsch = structuredClone(receipt); falsch.vorDigest = "f".repeat(64);
      A.throws(() => ausfuehren("rueckweg", falsch));
      const r = ausfuehren("rueckweg", receipt); A.equal(r.nach.job.max_attempts, 3); A.equal(r.nach.cas[0].zustand, "unbekannt");
      A.deepEqual(r.nach.kostenBuch, receipt.vor.kostenBuch);
      await A.rejects(O.pruefe(ausfuehren("vorschau"), opts), /Einmalbindung/);
      A.throws(() => ausfuehren("rueckweg", receipt));
    });
    setup(); b = await prepared(); receipt = ausfuehren("freigeben", b, undefined, "EU-EINZELNEUVERSUCH-20261128");
    await test("echter Queueclaim verbraucht nur Versuch4 und sperrt Rueckweg", async () => {
      const claim = JSON.parse(psql("select to_jsonb(j) from helmut_claim_jobs('isolierter-pruefer',1,60000,array['document_understanding']) j"));
      A.equal(claim.id, O.ZIEL.job); A.equal(claim.attempts, 4); A.equal(claim.status, "laeuft");
      A.throws(() => ausfuehren("rueckweg", receipt));
    });
  } finally { psql(`drop database ${db} with (force);`, "postgres"); }
  console.log(`${tests} gezielte Gruppen PASS; native lokale SQL-Abnahme, keine Provider oder Productionaenderungen.`);
})().catch(e => { console.error(e.stack || e); if (e.stderr) console.error(String(e.stderr)); process.exitCode = 1; });
