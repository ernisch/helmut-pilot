"use strict";

const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chmodSync, existsSync, renameSync, writeFileSync } = require("node:fs");
const { once } = require("node:events");
const http = require("node:http");
const { performance } = require("node:perf_hooks");
const { Worker } = require("node:worker_threads");
const schutz = require("./lokaler-netzschutz");
const { erstelleBericht, formatiereBericht } = require("./quellen-pruefstand-bericht");
const tagesbetrieb = require("../lib/helmut/quellen-tagesbetrieb");

const TAG = 86400000;
const terminkonfig = require("../vercel.json");
const pruefzeiten = ["2026-11-19", "2026-11-20"];
const saubererMorgen = process.argv[2] === "sauberer-morgen";
const monat = process.argv[2] === "monat-mit-altbestand";
const monatsbestand = monat && require("./fixtures/quellen-monatsbestand");
const wiederanlauf = monat || process.argv[2] === "wiederanlauf";
const kapazitaetsprobe = !saubererMorgen && !wiederanlauf;
const szenarioTage = monat ? monatsbestand.tage : wiederanlauf ? ["2026-11-23", "2026-11-24", "2026-11-25"]
  : saubererMorgen ? pruefzeiten.slice(0, 1) : pruefzeiten;
const stoertag = monat ? monatsbestand.stoertage : wiederanlauf ? szenarioTage[1] : null;
const START = Date.parse(`${szenarioTage[0]}T00:00:00Z`);
const konfiguration = {
  node: process.version, mandatsprofile: 1, maxDurationS: terminkonfig.functions["api/index.js"].maxDuration,
  region: terminkonfig.regions, fenster: tagesbetrieb.MAX_FENSTER, fensterSekunden: 300, originalReservierungen: 16,
  googleReservierungenJeMinute: 30, modellTageslimitUsd: 1, modellGesamtlimitUsd: 30,
  arbeitstage: szenarioTage, historischWartendZuBeginn: monat ? 737 : kapazitaetsprobe ? 754 : 0,
  transportMillisekunden: { google: 2000, modell: 2000, sonstige: 1000 },
  externeAbrufe: 0, bezahlteModellaufrufe: 0
};
const abweichungen = [
  "Bereinigter Mengen- und Protokollmix. Die 754 gemessenen wartenden Aufträge dienen als synthetischer Startbestand. In Production war dies ein nachgelagerter Snapshot.",
  "Vercel Cold Starts, Instanzgrenzen, Cron-Zustellung, DNS, TLS, Region und Netzwerkjitter sind nur in Production messbar.",
  "Die verwaltete Datenbank und ihr Pooler werden durch isoliertes PostgreSQL/PostgREST mit ausgewählten Vertragsmigrationen angenähert.",
  "Modellantworten und Tokenverbrauch kommen aus einem lokalen Fixture. Der DIP-Abruf erhält eine an seinen Titel gebundene Modelltestantwort. Semantik, reale Tokenkosten und Modelllatenz bleiben offen.",
  "Nicht belegte Mandats-, Modell-, Abruf- und Dispatch-Overrides werden durch den getesteten Code-Standard oder ausgewiesene Fixture-Flags ersetzt."
];
const pruefungen = [];
const tage = [];
let vergleich;
const note = (name, status, beleg, art = "produktionscode") => pruefungen.push({ name, status, beleg, art });

function uhrStart(pfad) {
  assert(pfad && existsSync(pfad), "Kontrollierte Datenbankuhr fehlt");
  let millis = START;
  const Echtzeit = globalThis.Date;
  const ersatz = new Proxy(Echtzeit, {
    get(target, property, receiver) { return property === "now" ? () => millis : Reflect.get(target, property, receiver); },
    construct(target, args, targetClass) { return Reflect.construct(target, args.length ? args : [millis], targetClass); },
    apply() { return new Echtzeit(millis).toString(); }
  });
  globalThis.Date = ersatz;
  function setze(zeit) {
    const sekunde = Math.floor(millis / 1000);
    millis = zeit;
    if (Math.floor(zeit / 1000) !== sekunde || zeit === START) {
      writeFileSync(pfad + ".tmp", new Echtzeit(zeit).toISOString().slice(0, 19).replace("T", " ") + "\n", { mode: 0o644 });
      chmodSync(pfad + ".tmp", 0o644);
      renameSync(pfad + ".tmp", pfad);
    }
  }
  setze(START);
  return { now: () => millis, setze, stoppe: () => { globalThis.Date = Echtzeit; } };
}

function sekunde(iso) { return Math.floor(Date.parse(iso) / 1000); }

function setzeVertrag(fixture) {
  const route = { provider: "azure", responsesUrl: fixture.AZURE + "/openai/v1/responses", model: "gpt-5-mini" };
  Object.assign(process.env, {
    HELMUT_SOURCE_MODE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on", HELMUT_SCALABLE_PIPELINE: "on",
    HELMUT_CRAWL_EXECUTOR: "hetzner", HELMUT_EXEC_LOCATION: "hetzner-de", HELMUT_SOURCE_TELEMETRY: "on",
    HELMUT_QUELLEN_FENSTER_TAG: "8", HELMUT_QUELLEN_SEKUNDEN_TAG: "2400", HELMUT_ORIGINALABRUFE_TAG: "16",
    HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_GOOGLE_MINUTE: "30",
    HELMUT_KLASSEN_GRENZEN: "on", HELMUT_JOB_DISPATCH_MODE: "off", HELMUT_TESTKOHORTE_QUELLEN: "aktiv",
    ...(monat ? { HELMUT_MAX_LLM_CALLS_PER_DAY: "100" } : {}),
    HELMUT_V3_STORE: "1", HELMUT_BRIEFING_FRISCHE: "on", HELMUT_VERSTEHEN_CAS: "on",
    ...(!kapazitaetsprobe ? { HELMUT_V3_MATCHING: "on" } : {}),
    HELMUT_BETRIEBSKOSTENVERTRAG_JSON: JSON.stringify({
      version: 1, profileId: fixture.mandat.id, startsAt: "2026-11-01T00:00:00.000Z",
      dailyLimitUsd: 1, totalLimitUsd: 30, route
    }),
    AZURE_OPENAI_ENDPOINT: fixture.AZURE, AZURE_OPENAI_KEY: randomUUID(), AZURE_OPENAI_DEPLOYMENT: route.model,
    DIP_API_KEY: randomUUID(), CRON_SECRET: randomUUID()
  });
  konfiguration.flags = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    key.startsWith("HELMUT_") && /(ARBEITSFENSTER|SCALABLE_PIPELINE|CRAWL_EXECUTOR|EXEC_LOCATION|SOURCE_TELEMETRY|QUELLEN_FENSTER_TAG|QUELLEN_SEKUNDEN_TAG|ORIGINALABRUFE_TAG|ANBIETER_STEUERUNG|ANBIETER_GOOGLE_MINUTE|KLASSEN_GRENZEN|JOB_DISPATCH_MODE|SOURCE_MODE|V3_STORE|V3_MATCHING|BRIEFING_FRISCHE|VERSTEHEN_CAS|TESTKOHORTE_QUELLEN)$/.test(key)));
}

function google(job) {
  const { abrufwege, anbieterVonWegen } = require("../lib/helmut/source-demand");
  return anbieterVonWegen(abrufwege(job.payload.quelle)) === "google-news";
}

async function seedRueckstand(storage, profil) {
  const demand = require("../lib/helmut/source-demand");
  const { fristen } = require("../lib/helmut/quellen-faelligkeit");
  const { getSourcesForProfile } = require("../lib/helmut/scheduler");
  const cache = {};
  const rueckstand = [];
  for (let offset = 5; offset >= 1; offset--) {
    const { auftraege, fehlerhafteProfile } = await demand.kompiliereQuellenbedarf({
      profile: [profil], jetztMs: START - offset * TAG,
      quellenFuerProfil: p => getSourcesForProfile(p, { planCache: cache })
    });
    assert.deepEqual(fehlerhafteProfile, []);
    for (const job of auftraege.filter(j => j.payload.art === "geteilt" && google(j))) {
      rueckstand.push({ ...job, payload: { ...job.payload, faelligkeit: fristen(job, job.dueAt) } });
    }
  }
  if (rueckstand.length < 754) {
    const { auftraege } = await demand.kompiliereQuellenbedarf({
      profile: [profil], jetztMs: START - 6 * TAG,
      quellenFuerProfil: p => getSourcesForProfile(p, { planCache: cache })
    });
    const extra = auftraege.filter(j => j.payload.art === "geteilt" && google(j));
    rueckstand.unshift(...extra.map(job => ({ ...job, payload: { ...job.payload, faelligkeit: fristen(job, job.dueAt) } })));
  }
  assert(rueckstand.length >= 754, "Synthetische Katalogwege fehlen für den Rückstand");
  const auftraege = rueckstand.slice(-754);
  for (let i = 0; i < auftraege.length; i += 12) {
    const results = await Promise.all(auftraege.slice(i, i + 12).map(job => storage.jobQueueEnqueue(job)));
    assert(results.every(r => r.verfuegbar && r.neu), "Rückstandseinreihung unbestätigt");
  }
  assert(cache.plan?.aktiv.length > 0, "Relationaler Quellenplan fehlt");
}

async function startApp() {
  const server = http.createServer(require("../api/index"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const basis = `http://127.0.0.1:${server.address().port}`;
  return {
    async cron(path, autorisiert = true) {
      const response = await fetch(basis + path, {
        headers: autorisiert ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
        signal: AbortSignal.timeout(60000)
      });
      return { status: response.status, data: await response.json() };
    },
    async stoppe() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

function termine(pfad) {
  return terminkonfig.crons.filter(cron => pfad.test(cron.path)).flatMap(({ path, schedule }) => {
    const [minuten, stunden, ...rest] = schedule.split(" ");
    assert.deepEqual(rest, ["*", "*", "*"], "Cron-Ausdruck des Prüfstands weicht ab");
    const ms = minuten === "*/15" ? [0, 15, 30, 45] : minuten.split(",").map(Number);
    const hs = stunden === "*" ? Array.from({ length: 24 }, (_, i) => i) : stunden.split(",").map(Number);
    return hs.flatMap(h => ms.map(m => ({ path, zeit: [h, m].map(n => String(n).padStart(2, "0")).join(":") })));
  }).sort((a, b) => a.zeit.localeCompare(b.zeit));
}

function workerTermine(tag) {
  const tagStart = Date.parse(tag + "T00:00:00Z");
  return Array.from({ length: tagesbetrieb.MAX_FENSTER }, (_, index) => {
    const termin = tagStart + index * (TAG / tagesbetrieb.MAX_FENSTER);
    return tagesbetrieb.quellenslot(termin);
  }).filter(Boolean).map(({ slot }) => ({ zeit: slot, path: "worker.js", worker: true }));
}

async function messung(db, tag, start, laeufe, uhr, transport, mandat, katalog, laufzeitMs) {
  const storage = db.storage;
  const journal = require("../lib/helmut/quellen-planungsrest").erzeugePlanungsrest({
    request: storage.supabaseRequest, storeId: process.env.HELMUT_SUPABASE_STORE_ID || "main"
  });
  const manifest = await journal.lesen(tag);
  const abgleich = await require("../lib/helmut/quellenarchitektur/faelligkeitsabgleich")
    .lese({ catalog: katalog, profiles: [mandat], jetztMs: uhr.now() });
  const plan = (manifest?.auftraege || []).filter(j => j.jobType === "source_fetch");
  const mitBefund = new Map(abgleich.faelligkeiten.map(j => [j.kennung, j]));
  const schluessel = value => require("../lib/helmut/briefing-speicher").hash(value);
  const quellen = plan.map(j => {
    const b = mitBefund.get(schluessel(j.idempotencyKey));
    return { quelle: j.payload.quelle.id, anbieter: google(j) ? "google" : j.payload.quelle.crawlMethod,
      neu: j.payload.art !== "person-archiv" || j.freshnessWindow.startsWith(tag),
      ...(b || { abruf: "fehlt", produkt: "ausstehend", grund: "queue_eintrag_fehlt" }) };
  });
  const gruppen = await queue(db, tag);
  const konten = await db.psql(`select coalesce(sum(verbraucht) filter (where schluessel='google|news|quellenabruf' and fensterart='minute'),0),
    coalesce(sum(verbraucht) filter (where schluessel='quellenarbeit|originalabrufe' and fensterart='tag'),0),
    coalesce(sum(verbraucht) filter (where schluessel='quellenarbeit|fenster' and fensterart='tag'),0)
    from public.helmut_anbieter_fenster where fenster_start >= '${tag}'::date and fenster_start < '${tag}'::date + 1`);
  const [googleReservierungen, originalReservierungen, fenster] = konten.trim().split("|").map(Number);
  assert([googleReservierungen, originalReservierungen, fenster].every(Number.isSafeInteger));
  const heute = quellen.filter(q => q.neu);
  const morgen = heute.filter(q => q.morgenbriefingFrist);
  const originalAbrufe = [...transport.proOriginal].filter(([adresse]) => adresse.startsWith(tag + "|"));
  const ausgaben = await storage.listRenderedBriefingsV3ForTenants([mandat.id], ["lage", "mandatsbriefing", "morgenlage"], tag);
  const folgearbeit = JSON.parse(db.psql(`select coalesce(jsonb_agg(to_jsonb(bilanz)), '[]'::jsonb) from (
    select job_type, status, split_part(last_error, ':', 1) as grund, count(*) as anzahl
    from public.helmut_jobs where job_type <> 'source_fetch' and coalesce(last_seen_window, freshness_window) like '${tag}%'
    group by job_type, status, grund order by job_type, status, grund) bilanz`));
  const dipAnalyse = JSON.parse(db.psql(`select coalesce(jsonb_agg(jsonb_build_object(
      'status', a.status, 'prioritaet', a.priority, 'grund', a.last_error, 'fertigAm', a.finished_at)), '[]'::jsonb)
    from public.helmut_jobs s
    join public.helmut_store b on b.id = 'main-quellenfaelligkeit-' || s.id
    cross join lateral jsonb_array_elements(b.data#>'{ergebnis,analyse}') beleg
    left join public.helmut_jobs a on a.id::text = beleg->>'jobId'
    where s.job_type = 'source_fetch' and s.payload->'quelle'->>'id' = 'dip' and s.first_due_at::date = '${tag}'::date`));
  return {
    tag, bedarf: wiederanlauf ? heute.length : tag === pruefzeiten[0] ? 162 : 161,
    eingeplant: heute.length - heute.filter(q => q.abruf === "fehlt").length,
    technischErledigt: gruppen.erledigt, fristgerecht: heute.filter(q => !q.grund && !q.verspaetet && q.belegHash).length,
    blockiert: heute.filter(q => q.abruf === "gesperrt" || /(?:http[- ](?:429|503)|verbindungsabbruch)/i.test(q.blocker || "")).length,
    vertagt: heute.filter(q => q.abruf === "voruebergehend_blockiert").length,
    googleBedarf: wiederanlauf ? heute.filter(q => q.anbieter === "google").length : tag === pruefzeiten[0] ? 145 : 144,
    googleErledigt: gruppen.googleErledigt, googleReservierungen,
    googleAbschluesseGesamt: gruppen.googleAbschluesseGesamt,
    originalReservierungen, fenster, laufzeitMs: Math.round(laufzeitMs),
    verschiedeneOriginaladressen: originalAbrufe.length,
    wiederholteOriginalabrufe: originalAbrufe.reduce((sum, [, n]) => sum + n - 1, 0),
    simulierteArbeitszeitMs: laeufe.reduce((sum, r) => sum + r.simulierteMs, 0),
    rueckstandBeginn: start.offen, rueckstandEnde: gruppen.offen, historischErledigt: gruppen.historischErledigt,
    lageFrist: morgen.length === 6 && morgen.every(q => !q.verspaetet && !q.grund && q.produkt === "mandatspaket_belegt"),
    briefingFrist: morgen.length === 6 && morgen.every(q => q.grund !== "morgenpaket_verspaetet" && q.produkt === "mandatspaket_belegt"),
    ausgaben: ausgaben.map(({ slot, generated_at }) => ({ slot, generated_at })),
    planluecken: abgleich.planluecken, luecken: abgleich.luecken,
    alteFaelligkeiten: abgleich.faelligkeiten.filter(q => !q.aktuell),
    httpAnfragen: Object.fromEntries([...transport.zaehler].filter(([k]) => k.startsWith(tag + "|"))
      .map(([k, n]) => [k.split("|")[1], n])),
    laeufe, folgearbeit, dipAnalyse, quellen
  };
}

async function queue(db, tag) {
  const auszug = await db.psql(`with quellen as (
    select status, first_due_at::date = '${tag}'::date as heute,
      finished_at::date = '${tag}'::date and status = 'erledigt' as abgeschlossen,
      (payload->'quelle'->>'url' like 'https://news.google.com/%'
        or payload->'quelle'->>'rssUrl' like 'https://news.google.com/%') as google
    from public.helmut_jobs where job_type='source_fetch')
    select count(*) filter (where status <> 'erledigt'),
      count(*) filter (where heute and abgeschlossen), count(*) filter (where heute and abgeschlossen and google),
      count(*) filter (where not heute and abgeschlossen), count(*) filter (where abgeschlossen and google)
    from quellen`);
  const [offen, erledigt, googleErledigt, historischErledigt, googleAbschluesseGesamt] = auszug.trim().split("|").map(Number);
  assert([offen, erledigt, googleErledigt, historischErledigt, googleAbschluesseGesamt].every(Number.isSafeInteger));
  return { offen, erledigt, googleErledigt, historischErledigt, googleAbschluesseGesamt };
}

async function pruefeSpeichergrenze() {
  // Ausschließlich ein kleiner isolierter V8-Worker erreicht die Testgrenze.
  // Der Prüfprozess und der SQL-Server behalten ihre normalen Ressourcen.
  const worker = new Worker(
    'const bloecke = []; for (let i = 0; i < 64; i++) bloecke.push(Array(131072).fill(i));',
    { eval: true, env: {}, resourceLimits: { maxOldGenerationSizeMb: 16 } }
  );
  try {
    const error = await new Promise((resolve, reject) => {
      worker.once("error", resolve);
      worker.once("exit", () => reject(Error("Speichergrenze wurde im Prüfling nicht erreicht")));
    });
    assert.equal(error.code, "ERR_WORKER_OUT_OF_MEMORY");
  } finally {
    await worker.terminate();
  }
}

async function main(schreibeZwischenstand) {
  assert(process.env.HELMUT_LOKALER_SCHUTZ === "aktiv" && !schutz.simulierteUmgebung() && !schutz.pruefe().length,
    "Prüfstand braucht den aktiven lokalen Netzschutz");
  assert(![".env.local", ".env", "env.local", "env.local.html"].some(pfad => existsSync(pfad)),
    "Prüfstand braucht einen Checkout ohne lokale Zugangsdaten");
  assert.equal(konfiguration.maxDurationS, 300, "Maximale Funktionsdauer weicht vom geprüften Quellenfenster ab");
  const ausgaben = termine(/^\/api\/cron\/(lage-briefing|morning-briefing)(\?|$)/);
  assert.equal(ausgaben.length, 8);
  konfiguration.quellenfenster = workerTermine(szenarioTage[0]).length;
  const uhr = uhrStart(process.env.HELMUT_QUELLEN_DB_UHR);
  let db, transport, app;
  try {
    const { starteQuellenDatenbank } = require("./quellen-pruefstand-datenbank");
    if (kapazitaetsprobe) {
      await pruefeSpeichergrenze();
      note("Isolierte V8-Heapgrenze", "geprueft",
        "Ein Test-Worker meldet bei 16 MiB ERR_WORKER_OUT_OF_MEMORY. Vercel-Speicherprofil und Plattformabbruch bleiben offen.", "simulation");
      db = await starteQuellenDatenbank({ begrenzterPool: true });
      konfiguration.poolStoerprobe = await db.pruefeEngpass();
      note("Langsame Datenbank und erschöpfte Poolverbindung", "geprueft",
        "Eine isolierte Poolverbindung, Reservierung bei Timeout abgewiesen, nach Freigabe einzeln bestätigt", "simulation");
      await db.stoppe();
    }
    db = await starteQuellenDatenbank();
    konfiguration.datenbank = db.konfiguration;
    const fixture = require("./fixtures/quellen-pruefstand");
    transport = await fixture.transport(uhr, { saubererMorgen: !kapazitaetsprobe, stoertag, monat });
    setzeVertrag(fixture);
    const url = "https://nachrichten.fixture.invalid/feeds/9.xml";
    const transportVorher = transport.zaehler.get(szenarioTage[0] + "|sonstige") || 0;
    const probe = await require("../lib/helmut/crawler").crawlAllSources([
      { id: "mess-feed", url, rssUrl: url, crawlMethod: "rss", active: true }
    ]);
    const httpAnfragen = transport.zaehler.get(szenarioTage[0] + "|sonstige") - transportVorher;
    assert.equal(probe.results[0]?.status, "empty");
    assert.equal(probe.rawItems.length, 0);
    assert.equal(httpAnfragen, 1);
    transport.zaehler.delete(szenarioTage[0] + "|sonstige");
    const arbeitsschluessel = "identische-leere-rss-antwort-fixture-v1";
    vergleich = { vorher: { arbeitsschluessel, bedarf: 1, httpAnfragen: 2 },
      nachher: { arbeitsschluessel, bedarf: 1, httpAnfragen } };
    note("Identische leere RSS-Antwort", "geprueft", "7b1f55b0 → Arbeitsstand: 2 → 1 Abrufe, 1 → 0 falsche Fundstücke");
    const eingabe = fixture.katalog(monat);
    konfiguration.fixtureHash = createHash("sha256").update(JSON.stringify({
      katalog: eingabe, mandat: fixture.mandat, ...(saubererMorgen ? { saubererMorgen } : {}), ...(stoertag ? { stoertag } : {})
    })).digest("hex");
    const { catalog: katalog } = await db.seed({ profile: fixture.mandat, catalog: eingabe });
    assert.deepEqual((await db.storage.listFullProfiles()).map(p => p.id), [fixture.mandat.id]);
    const profil = await db.storage.getProfile(fixture.mandat.id);
    if (kapazitaetsprobe) await seedRueckstand(db.storage, profil);
    if (monat) {
      konfiguration.synthetischerStartbestand = await monatsbestand.startbestand(db, profil, fixture);
      konfiguration.modellaufrufeProUtcTag = 100;
      abweichungen[0] = "Synthetischer Bestand aus den Mengenklassen vom 26.11., auf den Vergleichszeitraum des Vortagstests abgebildet. Die stündlichen Zustellungen, Artikeltexte, Datensätze und einzelnen Quellzuordnungen sind simuliert.";
    }
    // queue().offen enthält auch den historischen terminalen Quellenabruf.
    assert.equal((await queue(db, szenarioTage[0])).offen, konfiguration.historischWartendZuBeginn + (monat ? 1 : 0));
    if (monat) konfiguration.geparkteRequeues = await monatsbestand.parken(db);
    note("Relationaler Katalog und ein gespeichertes Mandat", "geprueft",
      `${konfiguration.historischWartendZuBeginn} synthetische Altaufträge`);
    const vorflug = await require("../lib/helmut/worker-betrieb").readiness();
    assert(vorflug.bereit, "Produktionsvorflug: " + JSON.stringify(vorflug.gruende));
    const { quellenlauf } = require("../worker");
    app = await startApp();
    assert.equal((await app.cron(ausgaben[0].path, false)).status, 403);

    for (const tag of szenarioTage) {
      const beginn = performance.now(), start = await queue(db, tag), laeufe = [];
      const frist = tagesbetrieb.zeiten(Date.parse(`${tag}T00:00:00Z`)).frist;
      const slots = workerTermine(tag);
      assert.equal(slots.length, 93, "Produktive Quellenfenster je Testtag");
      const ablauf = [...slots, ...ausgaben].sort((a, b) => a.zeit.localeCompare(b.zeit));
      let morgenstand = null;
      for (const slot of ablauf) {
        if (tag === pruefzeiten[1] && slot.zeit === "00:15" && slot.worker) continue;
        const verzoegerung = tag === pruefzeiten[1] && slot.zeit === "05:30" && slot.worker ? 240 : 0;
        const soll = sekunde(`${tag}T${slot.zeit}:00Z`) + verzoegerung;
        uhr.setze(soll * 1000);
        assert.equal(Number(await db.psql("select extract(epoch from now())::bigint")), soll, "Anwendungs- und SQL-Uhr weichen ab");
        if (soll * 1000 === frist && morgenstand === null) {
          const r = await app.cron(`/api/cron/briefing-nachweis?mandat=${encodeURIComponent(profil.id)}`);
          assert.equal(r.status, 200, "Gespeicherte Kundenausgabe nicht rücklesbar");
          const stand = r.data;
          const kopf = stand.currentHelmutState;
          const prioritaeten = [kopf?.primaryItem, ...(kopf?.items || [])].filter(Boolean);
          morgenstand = { abrufbar: stand.available === true, vollstaendig: stand.paketStatus?.vollstaendig === true,
            lageAbsaetze: stand.lageBriefing?.paragraphs?.length || 0,
            prioritaeten: new Set(prioritaeten.map(p => p.id)).size,
            mitDipBeleg: prioritaeten.some(p => Boolean(p.dipDokumentbeleg)),
            ...(!kapazitaetsprobe ? { versorgung: kopf?.versorgung, paketFehler: stand.paketStatus?.fehler } : {}),
            ...(wiederanlauf ? { dipDokumente: [...new Set(prioritaeten.flatMap(p =>
              p.dipDokumentbeleg?.url ? [p.dipDokumentbeleg.url] : []))] } : {}) };
          assert(morgenstand.prioritaeten <= 3, "Mehr als drei Tagesprioritäten");
          note(`Produktleser um 07:30 Uhr Berlin am ${tag}`, "geprueft",
            `Abrufbar: ${morgenstand.abrufbar}. Vollständig: ${morgenstand.vollstaendig}. Lageabsätze: ${morgenstand.lageAbsaetze}. Tagesprioritäten: ${morgenstand.prioritaeten}. DIP-Beleg: ${morgenstand.mitDipBeleg}.`);
          schreibeZwischenstand();
          if (!kapazitaetsprobe && !monat && tag === szenarioTage.at(-1)) break;
        }
        const parallel = tag === szenarioTage[0] && slot === slots[0];
        let resultate;
        if (slot.worker) {
          resultate = await Promise.all(Array.from({ length: parallel ? 2 : 1 }, () => quellenlauf()));
        } else {
          const antwort = await app.cron(slot.path);
          assert.equal(antwort.status, 200, `Cron-Transportfehler ${slot.path}`);
          resultate = [antwort.data];
        }
        const mitFenster = resultate.filter(r => r.arbeitsfenster);
        if (parallel) assert.equal(mitFenster.length, 1, "Keine eindeutige Arbeitsfensterreservierung bei Parallelstart");
        const r = mitFenster[0] || resultate[0];
        if (slot.worker && mitFenster.length) {
          assert(r.lauf?.laufId && r.lauftelemetrie?.ende === true, "Worker-Lauf ohne bestätigten Abschluss");
        }
        const istLage = slot.path.startsWith("/api/cron/lage-briefing?");
        const istMorgen = slot.path.startsWith("/api/cron/morning-briefing?");
        laeufe.push({ slot: slot.zeit, startVerzoegerungS: verzoegerung, pfad: slot.path, ok: r.ok ?? null,
          grund: r.grund || r.reason || r.lauftelemetrie?.fehlerklasse || null, arbeitsfenster: Boolean(r.arbeitsfenster),
          simulierteMs: uhr.now() - soll * 1000,
          ...(istLage ? { lage: { gespeichert: r.prewarmed ?? 0, vollstaendig: r.vollstaendig === true,
            ergebnisse: (r.results || []).map(({ available, reason, diagnose }) => ({ available, reason, diagnose })) } } : {}),
          ...(istMorgen ? { morgenversorgung: r.versorgung ?? null,
            morgenergebnisse: (r.results || []).map(({ reason, paketBeleg }) => ({ reason, paketBeleg })) } : {}) });
      }
      if (monat || kapazitaetsprobe || tag !== szenarioTage.at(-1)) uhr.setze(Date.parse(`${tag}T23:59:00Z`));
      const tagesbericht = await messung(db, tag, start, laeufe, uhr, transport, profil, katalog, performance.now() - beginn);
      tagesbericht.morgenstand = morgenstand;
      tagesbericht.briefingFrist &&= morgenstand?.abrufbar === true;
      if (monat) {
        tagesbericht.betriebsbuch = monatsbestand.tagesbeleg(db,tag);
        const ids = db.psql(`select count(distinct a->>'jobId') from public.helmut_store s
          cross join lateral jsonb_array_elements(s.data->'ergebnis'->'analyse') a
          join helmut_monat.startbestand b on b.id::text = a->>'jobId' and b.amtlich
          where left(s.data->>'bestaetigtAm',10)='${tag}';`);
        tagesbericht.wiederbeobachteteTerminalfassungen = Number(ids);
        const sollStoerung = stoertag.includes(tag);
        tagesbericht.teilfassungErwartet = sollStoerung || tag === szenarioTage[0];
        const abdeckung = morgenstand?.versorgung?.abrufabdeckung;
        const tagechecks = {
          produktLesbar: morgenstand?.abrufbar === true,
          abdeckungBelegt: abdeckung?.geplant > 0 && abdeckung.bestaetigt <= abdeckung.geplant,
          vollstaendigWieErwartet: morgenstand?.vollstaendig === !tagesbericht.teilfassungErwartet,
          teilfassungBenannt: !tagesbericht.teilfassungErwartet || morgenstand?.paketFehler?.includes("quellenversorgung-unvollstaendig"),
          dipTagesbeleg: morgenstand?.dipDokumente?.includes(fixture.dipProbe(tag,true).original),
          originalquote: tagesbericht.originalReservierungen <= 16,
          slotgrenze: tagesbericht.fenster <= konfiguration.fenster && laeufe.filter(l => l.arbeitsfenster).length <= slots.length,
          buchGeklaert: tagesbericht.betriebsbuch.ungeklaert === 0,
          simulierteWegeBekannt: transport.unbekannt.length === 0,
          startfassungen: tagesbericht.wiederbeobachteteTerminalfassungen === (tag === szenarioTage[0] ? 3 : 0),
          abdeckungWieErwartet: abdeckung?.geplant > 0 && abdeckung.geplant-abdeckung.bestaetigt === (sollStoerung ? 1 : 0),
          wiederaufnahme: !sollStoerung || tagesbericht.quellen.some(q=>q.quelle==="bt-termine-plenum" && q.belegHash && q.verspaetet)
        };
        for (const [name,ok] of Object.entries(tagechecks)) note(tag + " " + name, ok ? "geprueft" : "fehlgeschlagen");
        tage.push(tagesbericht);
        schreibeZwischenstand();
        console.log(JSON.stringify({tag,erledigteTage:tage.length,morgenstand: morgenstand?.vollstaendig,
          abdeckung, laufzeitMs:tagesbericht.laufzeitMs,fehlend:Object.entries(tagechecks).filter(([,ok])=>!ok).map(([k])=>k)}));
        continue;
      }
      tage.push(tagesbericht);
      schreibeZwischenstand();
      if (!kapazitaetsprobe) {
        assert.deepEqual(transport.unbekannt, [], "Unbekannte Fixture-Ziele");
        assert(tagesbericht.originalReservierungen <= konfiguration.originalReservierungen, "Originalquote überschritten");
        const abdeckung = morgenstand?.versorgung?.abrufabdeckung;
        if (wiederanlauf) assert(morgenstand?.dipDokumente.includes(fixture.dipProbe(tag, true).original),
          "Kein tagesaktueller DIP-Beleg: " + JSON.stringify(morgenstand));
        if (tag === stoertag) {
          assert(transport.anzahlStoerungen() > 0, "503 am Bundestag wurde nicht ausgelöst");
          assert(abdeckung?.geplant > 0 && abdeckung.bestaetigt === abdeckung.geplant - 1,
            "Genau der gestörte Morgenabruf muss offen sein: " + JSON.stringify(abdeckung));
          assert(morgenstand.abrufbar && !morgenstand.vollstaendig && morgenstand.lageAbsaetze > 0
            && morgenstand.paketFehler?.includes("quellenversorgung-unvollstaendig"),
          "Die Störung muss in einer abrufbaren Teilfassung sichtbar sein: " + JSON.stringify(morgenstand));
          const plenum = tagesbericht.quellen.find(quelle => quelle.quelle === "bt-termine-plenum");
          assert(plenum?.belegHash && plenum.verspaetet && ["terminstand", "bestaetigt_unveraendert"].includes(plenum.abruf),
            "Der ursprüngliche Plenarauftrag muss nach der Störung noch am selben Tag bestätigt werden: " + JSON.stringify(plenum));
          note(`Teilfassung nach Bundestag-503 am ${tag}`, "geprueft",
            `${abdeckung.bestaetigt} von ${abdeckung.geplant} fälligen Quellen bestätigt, Plenarauftrag später am selben Tag nachgeholt`);
          continue;
        }
        assert(abdeckung?.geplant > 0 && abdeckung.bestaetigt === abdeckung.geplant,
          "Morgenabrufe unvollständig: " + JSON.stringify(abdeckung));
        assert(laeufe.some(lauf => lauf.lage?.vollstaendig), "Kein vollständiger Lage-Lauf vor 07:30 Uhr");
        assert(morgenstand?.abrufbar && morgenstand.vollstaendig && morgenstand.lageAbsaetze > 0 && morgenstand.mitDipBeleg,
          "Gesunder Morgen ohne vollständiges Briefing und DIP-Beleg: " + JSON.stringify(morgenstand));
        note(`Vollständiger Morgen vor 07:30 Uhr mit DIP-Beleg am ${tag}`, "geprueft",
          `${abdeckung.bestaetigt} von ${abdeckung.geplant} fälligen Quellen bestätigt`);
        continue;
      }
      assert.equal(tagesbericht.eingeplant, tagesbericht.bedarf, `Tagesplan oder Queue unvollständig für ${tag}`);
      assert.equal(tagesbericht.planluecken, 0, `Quellenplanabweichung für ${tag}`);
    }
    if (!kapazitaetsprobe) {
      if (monat) {
        assert.deepEqual(tage.map(t => t.tag), szenarioTage);
        const archiv = JSON.parse(db.psql("select json_build_object('fenster',count(distinct freshness_window),'erledigt',count(*) filter(where status='erledigt')) from public.helmut_jobs where job_type='source_fetch' and payload->>'art'='person-archiv';"));
        konfiguration.archiv = archiv;
        note("Archivwechsel über den gesamten Monat", archiv.fenster >= 4 && archiv.erledigt >= 4 ? "geprueft" : "fehlgeschlagen", JSON.stringify(archiv));
        if(pruefungen.some(p=>p.status==="fehlgeschlagen")) process.exitCode=1;
      }
      note("Morgenabnahme abgeschlossen", "geprueft");
      return;
    }
    const archivreste = await db.psql("select count(*) from public.helmut_jobs where job_type='source_fetch' and payload->>'art'='person-archiv'");
    assert.equal(Number(archivreste), 1, "Archivauftrag wurde erneut statt fortgesetzt");
    const { fensterKennung, fensterKonfig } = require("../lib/helmut/source-demand");
    const archivStunden = fensterKonfig().archivStundenFenster;
    assert.notEqual(fensterKennung(START - TAG, archivStunden), fensterKennung(START, archivStunden));
    note("Archivwechsel und keine erneute Anlage im selben Archivfenster", "geprueft");
    const berlin = require("../lib/helmut/briefing-frische");
    assert.equal(berlin.berlinTagKey("2026-10-24T22:03:00Z"), "2026-10-25");
    assert.equal(berlin.berlinTagKey("2026-10-25T22:03:00Z"), "2026-10-25");
    assert.equal(berlin.berlinTagKey("2026-03-28T22:03:00Z"), "2026-03-28");
    assert.equal(berlin.berlinTagKey("2026-03-29T22:03:00Z"), "2026-03-30");
    note("Sommer- und Winterzeit", "geprueft", "Tagesgrenzen des produktiven Berliner Kalenders");
    const crawler = require("../lib/helmut/crawler");
    await assert.rejects(crawler.fetchUrl(url, 0, { binary: true, maxBytes: 16 }), /Response too large/);
    await assert.rejects(crawler.fetchUrl(url, 0, { now: uhr.now, deadlineMs: uhr.now() }), /quellenabruf-zeitbudget/);
    note("Abrufzeitbudget und Speichergrenze für HTTP-Antworten", "geprueft",
      "Echter Abrufparser an kleinem Fixture mit abgesenkter Byte-Grenze und abgelaufener Frist", "simulation");
    assert.deepEqual(transport.unbekannt, [], "Unbekannte Fixture-Ziele");
    konfiguration.datenbankEndzustand = db.stand();
    konfiguration.spitzenRssBytes = process.resourceUsage().maxRSS * 1024;
    note("Hetzner-Worker, Ausgabe-Crons, atomare Doppelstart-Sperre und PostgreSQL-Zeitwechsel", "geprueft", "Zwei UTC-Tage");
    note("Atomarer Anbieter-/Originalverbrauch und technische Abschlüsse", "geprueft", "Aus PostgreSQL am Ende jedes Morgens");
    note("Ausgaben und einzelne Quellenbelege abgeglichen", "geprueft", "Echter Fälligkeitsabgleich liest gespeicherte Belege, Jobstatus und Ausgabe");
    if (!tage.some(t => t.googleErledigt < t.googleBedarf && t.googleReservierungen > 0)
      || !tage.some(t => t.originalReservierungen === 16 && t.quellen.some(q => /originalquote/.test(q.blocker || ""))))
      note("Reproduktion der bekannten Anbieter- und Originalmängel", "offen", "Beide beobachteten Engpässe sind im Lauf noch zu bestätigen.");
    else note("Reproduktion der bekannten Anbieter- und Originalmängel", "geprueft");
  } finally {
    if (db) {
      const { dauerMs: _uhrwert, ...restMessung } = db.restBericht();
      konfiguration.datenbankTageslauf = restMessung;
    }
    await app?.stoppe();
    await transport?.stoppe();
    await db?.stoppe();
    uhr.stoppe();
  }
}

if (require.main === module) {
  const lauf = process.env.GITHUB_RUN_ID || randomUUID();
  let commit = null;
  try {
    if (monat && process.env.HELMUT_MONATS_MANIFEST) {
      // Der netzlose Container erhält ein überprüftes Archiv des korrigierten Checkouts.
      // Die Bereitstellung hat die Dateiliste außerhalb des Containers aus Git gewonnen.
      const manifest = require("node:fs").readFileSync(process.env.HELMUT_MONATS_MANIFEST,"utf8");
      const beleg=JSON.parse(manifest);
      assert(/^[a-f0-9]{40}$/.test(beleg.commit) && Array.isArray(beleg.dateien) && beleg.dateien.length > 100);
      for (const [pfad, soll] of beleg.dateien) {
        assert(!pfad.startsWith("/") && !pfad.split("/").includes(".."));
        assert.equal(createHash("sha256").update(require("node:fs").readFileSync(pfad)).digest("hex"),soll,pfad);
      }
      commit = beleg.commit;
      process.env.HELMUT_COMMIT_SHA = commit;
      konfiguration.dateimanifestSha256 = createHash("sha256").update(manifest).digest("hex");
      konfiguration.arbeitsbaumSauber = beleg.sauber;
    } else {
      commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      konfiguration.arbeitsbaumSauber = !execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
    }
    if (process.env.GITHUB_SHA) assert.equal(commit, process.env.GITHUB_SHA, "Checkout stimmt nicht mit Github-SHA überein");
    if (!konfiguration.arbeitsbaumSauber) abweichungen.push("Lokaler Arbeitsbaum weicht vom Bericht-Commit ab.");
  } catch (error) {
    note("Commitbindung", "fehlgeschlagen", error.message);
    process.exitCode = 1;
  }
  function schreibeBericht() {
    const daten = { commit, lauf, versuch: process.env.GITHUB_RUN_ATTEMPT || null,
      konfiguration, tage, pruefungen, abweichungen, vergleich };
    const bericht = !kapazitaetsprobe
      ? { ...daten, szenario: monat ? "monat-mit-altbestand" : wiederanlauf ? "wiederanlauf" : "sauberer-morgen", ergebnis: process.exitCode ? "fehlgeschlagen"
        : pruefungen.some(p => p.name === "Morgenabnahme abgeschlossen") ? "bestanden" : "offen" }
      : erstelleBericht({ ...daten, szenario: "produktionsnah-20261119" });
    const pfad = process.env.HELMUT_QUELLEN_PRUEFBERICHT;
    if (pfad) {
      writeFileSync(pfad + ".json", JSON.stringify(bericht, null, 2) + "\n");
      writeFileSync(pfad + ".md", formatiere(bericht));
    }
    return bericht;
  }
  const formatiere = bericht => kapazitaetsprobe ? formatiereBericht(bericht) : [
    wiederanlauf ? "## HELMUT Wiederanlauf nach Quellenstörung" : "## HELMUT Morgen ohne simulierte Störungen", "",
    `Commit ${bericht.commit} · Lauf ${bericht.lauf}/${bericht.versuch} · Ergebnis **${bericht.ergebnis}**`, "",
    ...bericht.pruefungen.map(p => `- ${p.name} · ${p.status}${p.beleg ? " · " + p.beleg : ""}`), ""
  ].join("\n");
  const ausfuehrung = process.exitCode ? Promise.resolve() : main(schreibeBericht);
  ausfuehrung.catch(error => {
    note("Laufzeitvertrag", "fehlgeschlagen", error.message);
    console.error(error.stack);
    process.exitCode = 1;
  }).finally(() => {
    console.log(formatiere(schreibeBericht()));
  });
}
