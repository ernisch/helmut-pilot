"use strict";
// Deklarierte lokale Queue-/Speicherantworten; keine Modelle, Originalabrufe oder Productionwrites.
const A = require("node:assert/strict");
const V = require("../lib/helmut/quellen-versorgungsstand");
const B = require("../lib/helmut/briefing-speicher");
const C = require("../lib/helmut/briefingContract");
const M = require("../lib/helmut/morgenversorgung");
const now = new Date("2026-11-09T05:15:00Z"), tag = "2026-11-09";
const env = { HELMUT_QUELLEN_ARBEITSFENSTER: "on" };
const profile = { id: "test-versorgung", focusTopics: ["Pflege"] };
const signal = zustand => ({ version: 1, zustand });
const base = () => ({ planungsrest: { lesen: async () => ({ zustand: "fertig" }),
  offene: async () => ({ plaene: [], weitereVorhanden: false }) },
  offeneVorbedingungen: async () => ({ verfuegbar: true, offen: 0, fehlgeschlagen: 0 }) });
const lese = deps => V.lese({ mandat: profile.id, jetztMs: now.getTime(), env, deps });
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
(async () => {
  await test("Default aus verursacht keine Statuslesung", async () => {
    A.equal(await V.lese({ env: {}, deps: new Proxy({}, { get: () => { throw Error("IO"); } }) }), null);
  });
  await test("Fehlendes Manifest, Datenlesefehler und unklare Zaehler bleiben unbekannt", async () => {
    for (const mutate of [d => { d.planungsrest.lesen = async () => null; },
      d => { d.planungsrest.lesen = async () => { throw Error("timeout"); }; },
      d => { d.offeneVorbedingungen = async () => ({ verfuegbar: true, offen: 0 }); },
      d => { d.offeneVorbedingungen = async () => ({ verfuegbar: false, offen: 0, fehlgeschlagen: 0 }); }]) {
      const d = base(); mutate(d); A.deepEqual(await lese(d), signal("unbekannt"));
    }
  });
  await test("Planrest, Budgetpause und Terminalfehler geben offene Versorgung", async () => {
    for (const mutate of [d => { d.planungsrest.lesen = async () => ({ zustand: "offen" }); },
      d => { d.planungsrest.offene = async () => ({ plaene: [{ tag: "2026-11-08" }], weitereVorhanden: false }); },
      d => { d.offeneVorbedingungen = async () => ({ verfuegbar: true, offen: 1, fehlgeschlagen: 0 }); },
      d => { d.offeneVorbedingungen = async () => ({ verfuegbar: true, offen: 0, fehlgeschlagen: 1 }); }]) {
      const d = base(); mutate(d); A.deepEqual(await lese(d), signal("offen"));
    }
  });
  await test("Nur Tagesfenster und eigenes Mandat werden an bestehenden RPC gebunden", async () => {
    const d = base(), calls = [];
    d.offeneVorbedingungen = async x => { calls.push(x); return { verfuegbar: true, offen: 0, fehlgeschlagen: 0 }; };
    A.deepEqual(await lese(d), signal("kein-bekannter-rueckstand"));
    A.equal(calls.length, 2); A(calls.every(x => x.mandat === profile.id));
    A(calls[0].fenster.every(f => f.startsWith(tag)));
    A.deepEqual(calls[0].typen, ["source_fetch", "document_understanding", "mandate_projection"]);
    A.deepEqual(calls[1], { fenster: null, typen: ["document_understanding"], mandat: profile.id });
  });
  await test("Gestriger Budgetrest verhindert Quiet trotz beider fertig eingeplanter Tage", async () => {
    const queue = require("./fixtures/jobqueue-speicher-treiber").erzeugeSpeicherWarteschlange({ now: () => now.getTime() });
    const old = await queue.enqueue({ jobType: "document_understanding", idempotencyKey: "gleiche-artikelversion",
      freshnessWindow: "2026-11-08T00Z", tenantId: null });
    const failed = await queue.enqueue({ jobType: "document_understanding", idempotencyKey: "historischer-endfehler",
      freshnessWindow: "2026-11-07T00Z", tenantId: null });
    queue.hole(failed.id).status = "fehlgeschlagen";
    await queue.enqueue({ jobType: "document_understanding", idempotencyKey: "privater-fremdauftrag",
      freshnessWindow: "2026-11-08T00Z", tenantId: "fremdes-mandat" });
    const wieder = await queue.enqueue({ jobType: "document_understanding", idempotencyKey: "gleiche-artikelversion",
      freshnessWindow: tag + "T00Z", tenantId: null });
    A.equal(wieder.id, old.id); A.equal(wieder.neu, false);
    A.equal(queue.hole(old.id).freshness_window, "2026-11-08T00Z");
    const d = base(); d.offeneVorbedingungen = queue.offeneVorbedingungen;
    const stand = await lese(d); A.deepEqual(stand, signal("offen"));
    A.equal(C.toBriefingContractV3({ profile, now, versorgung: stand }).currentHelmutState.emptyState.kind, "gap");
    queue.hole(old.id).status = "laeuft"; A.deepEqual(await lese(d), signal("offen"));
    queue.hole(old.id).status = "erledigt";
    A.deepEqual(await lese(d), signal("kein-bekannter-rueckstand"), "Historische Endfehler und fremde Privatjobs sind kein ewiger Rueckstand");
    d.offeneVorbedingungen = async ({ fenster }) => fenster ? { verfuegbar: true, offen: 0, fehlgeschlagen: 0 } : { verfuegbar: false };
    A.deepEqual(await lese(d), signal("unbekannt"));
  });
  await test("Morgenprüfung bindet fällige Abrufe und die konkret quittierten Pflichtanalysen", async () => {
    const F = require("../lib/helmut/quellen-faelligkeit");
    const { hash } = require("../lib/helmut/briefing-speicher");
    const morgen = new Date("2026-11-21T06:20:00Z");
    const schnitt = require("../lib/helmut/quellen-tagesbetrieb").zeiten(morgen.getTime()).redaktionsschluss;
    const iso = zeit => new Date(zeit).toISOString();
    const erstelle = (name, ms, tenantId = null, art = "geteilt") => ({ jobType: "source_fetch",
      idempotencyKey: name, tenantId, dueAt: iso(schnitt + ms), payload: { art, quelle: { id: name } } });
    const faellig = erstelle("heute", 0);
    faellig.priority = 35;
    const unbelangte = [erstelle("spaeter", 1), erstelle("fremd", -1, "anderes-mandat"),
      erstelle("archiv", -1, profile.id, "person-archiv")];
    const plan = { zustand: "offen", auftraege: [faellig, ...unbelangte] };
    const row = { id: "00000000-0000-0000-0000-000000000001", idempotency_key: faellig.idempotencyKey,
      tenant_id: null, first_due_at: faellig.dueAt, due_at: iso(schnitt + 3600000), status: "erledigt",
      finished_at: iso(schnitt + 1000), payload: faellig.payload };
    const quittieren = (bestaetigtAm = iso(schnitt), ergebnis = { art: "keine-funde", rohIds: [], analyse: [] }) => {
      const data = { version: 1, bindung: F.quellbindung({ id: row.id, tenantId: row.tenant_id,
        firstDueAt: row.first_due_at, payload: row.payload }), bestaetigtAm, ergebnis };
      return [{ id: `main-quellenfaelligkeit-${row.id}`, data: { ...data, belegHash: hash(data) } }];
    };
    const rohId = "rd-" + "a".repeat(64), stand = "b".repeat(64);
    const auftrag = require("../lib/helmut/scalable-pipeline").einzelArtikelAuftrag({ id: rohId, stand });
    const analyse = { id: "00000000-0000-0000-0000-000000000002", job_type: "document_understanding",
      tenant_id: null, status: "erledigt", finished_at: iso(schnitt - 86400000),
      idempotency_key: auftrag.idempotencyKey, payload: auftrag.payload };
    const pflichtbeleg = { art: "rohfassungen", rohIds: [rohId], analyse: [{ rohId, stand, jobId: analyse.id }] };
    let queue = [row], belege = quittieren(), analysen = [];
    const deps = { planungsrest: { lesen: async () => plan, offene: async () => A.fail("Altplanung") },
      leseAbdeckung: async () => A.fail("Tagesgesamtstand"),
      request: async path => {
        const url = new URL(path, "http://localhost");
        if (url.searchParams.get("job_type") === "eq.document_understanding") {
          A.equal(url.searchParams.get("id"), `in.("${analyse.id}")`);
          A.equal(url.searchParams.get("tenant_id"), "is.null");
          return analysen;
        }
        if (url.pathname.endsWith("/helmut_jobs")) {
          A.equal(url.searchParams.get("idempotency_key"), 'in.("heute")');
          return queue;
        }
        A.equal(url.searchParams.get("id"), `in.("main-quellenfaelligkeit-${row.id}")`);
        return belege;
      },
      offeneVorbedingungen: async ({ fenster, typen, mandat }) => {
        A(fenster.length > 0);
        // Ein heute wiederbeobachteter fremder oder historischer Analysejob
        // darf auch als Endfehler nie in die Prüfung dieser Projektion fallen.
        A.deepEqual(typen, ["mandate_projection"]);
        A.equal(mandat, profile.id);
        return { verfuegbar: true, offen: 0, fehlgeschlagen: 0 };
      }
    };
    const pruefe = async (zustand, quellenBis = schnitt, bestaetigt, beendet = false) => A.deepEqual(await V.lese({ mandat: profile.id,
      jetztMs: morgen.getTime(), env: { ...env, HELMUT_SCALABLE_PIPELINE: "on" }, deps, quellenBis }),
    { ...signal(zustand), ...(zustand === "unbekannt" && bestaetigt === undefined ? {}
      : { abrufabdeckung: { geplant: 1, bestaetigt: bestaetigt ?? 0 } }), ...(beendet ? { verarbeitungBeendet: true } : {}) });
    await pruefe("kein-bekannter-rueckstand", schnitt, 1);
    queue = []; await pruefe("offen");
    for (const status of ["wartend", "laeuft", "fehlgeschlagen"]) {
      queue = [{ ...row, status }]; await pruefe("offen");
    }
    queue = [{ ...row, tenant_id: "anderes-mandat" }]; await pruefe("unbekannt");
    queue = [row]; belege = []; await pruefe("offen");
    belege = quittieren(iso(schnitt + 1)); await pruefe("offen");
    belege = quittieren(iso(schnitt), { art: "teilweise", rohIds: [], analyse: [] }); await pruefe("offen");
    belege = quittieren(); belege[0].data.belegHash = "falsch"; await pruefe("unbekannt");
    belege = quittieren(); await pruefe("unbekannt", schnitt + 1);

    belege = quittieren(iso(schnitt), pflichtbeleg);
    await pruefe("unbekannt", schnitt, 1); // Kein Ersatz durch irgendeine alte Analyse.
    analysen = [{ ...analyse, tenant_id: "anderes-mandat" }]; await pruefe("unbekannt", schnitt, 1);
    analysen = [{ ...analyse, idempotency_key: auftrag.idempotencyKey + "|eingangsfehler" }];
    await pruefe("unbekannt", schnitt, 1);
    analysen = [{ ...analyse, payload: { ...analyse.payload, quellenstaende: { [rohId]: "c".repeat(64) } } }];
    await pruefe("unbekannt", schnitt, 1);
    analysen = [{ ...analyse, finished_at: iso(morgen.getTime() + 1) }]; await pruefe("unbekannt", schnitt, 1);
    for (const fortschritt of [{ quellenRestDokumentIds: [rohId] }, { quellenAbschnitte: { [rohId]: 1 } }]) {
      analysen = [{ ...analyse, payload: { ...analyse.payload, ...fortschritt } }];
      await pruefe("unbekannt", schnitt, 1);
    }
    for (const status of ["wartend", "laeuft", "fehlgeschlagen"]) {
      analysen = [{ ...analyse, status }]; await pruefe("offen", schnitt, 1, status === "fehlgeschlagen");
    }
    analysen = [analyse]; await pruefe("kein-bekannter-rueckstand", schnitt, 1);
    analysen = [{ ...analyse, finished_at: iso(schnitt + 60000),
      payload: { ...analyse.payload, quellenRestDokumentIds: [], quellenAbschnitte: {} } }];
    await pruefe("kein-bekannter-rueckstand", schnitt, 1);
    faellig.priority = 80;
    analysen = [{ ...analyse, status: "wartend" }]; await pruefe("kein-bekannter-rueckstand", schnitt, 1);

    deps.offeneVorbedingungen = async () => ({ verfuegbar: true, offen: 1, fehlgeschlagen: 0 });
    await pruefe("offen", schnitt, 1);

    const neuerStand = Array.from({ length: 162 }, (_, i) => erstelle("quelle-" + i, 0));
    plan.auftraege = [...neuerStand, ...unbelangte];
    queue = neuerStand.map((job, i) => ({ ...row, id: "00000000-0000-0000-0000-" + String(i).padStart(12, "0"),
      idempotency_key: job.idempotencyKey, payload: job.payload, status: i < 152 ? "erledigt" : "fehlgeschlagen" }));
    belege = queue.slice(0, 152).map(r => {
      const data = { version: 1, bindung: F.quellbindung({ id: r.id, tenantId: r.tenant_id,
        firstDueAt: r.first_due_at, payload: r.payload }), bestaetigtAm: iso(schnitt),
        ergebnis: { art: "keine-funde", rohIds: [], analyse: [] } };
      return { id: "main-quellenfaelligkeit-" + r.id, data: { ...data, belegHash: hash(data) } };
    });
    deps.request = async path => {
      const url = new URL(path, "http://localhost");
      const jobs = url.pathname.endsWith("/helmut_jobs");
      const batch = url.searchParams.get(jobs ? "idempotency_key" : "id");
      return (jobs ? queue : belege).filter(r => batch.includes(JSON.stringify(jobs ? r.idempotency_key : r.id)));
    };
    const v = await V.lese({ mandat: profile.id, jetztMs: morgen.getTime(),
      env: { ...env, HELMUT_SCALABLE_PIPELINE: "on" }, deps, quellenBis: schnitt });
    A.deepEqual(v, { ...signal("offen"), abrufabdeckung: { geplant: 162, bestaetigt: 152 } });
  });
  const rows = new Map(); let updates = 0;
  const storage = { assertTenant: require("../lib/helmut/storage").assertTenant,
    getRenderedBriefingV3: async (id, slot, day) => structuredClone(rows.get(`bf-${id}-${slot}-${day}`) || null),
    insertRenderedBriefingV3: async entry => { rows.set(entry.id, structuredClone(entry)); return { saved: true }; },
    ergaenzeUnvollstaendigesBriefing: async (before, entry) => {
      A.equal(before.payload.pruefung.strukturellVollstaendig, false);
      A.deepEqual(rows.get(before.id), before); A.deepEqual(entry.payload.vorherigerStand, before);
      return require("../lib/helmut/storage").ergaenzeUnvollstaendigesBriefing(before, entry, {
        bereit: true, request: async (url, opts) => {
          A.equal(opts.method, "PATCH"); A(url.includes(`user_id=eq.${encodeURIComponent(profile.id)}`));
          A(url.includes(`payload->>inhaltHash=eq.${before.payload.inhaltHash}`));
          A(url.includes(`generated_at=eq.${encodeURIComponent(before.generated_at)}`));
          const patch = JSON.parse(opts.body); A.deepEqual(patch.payload, entry.payload);
          rows.set(entry.id, structuredClone(entry)); updates++; return [structuredClone(entry)];
        }
      });
    } };
  const ko = { id: "ko-test", vorgang_id: "vg-test", understanding_status: "complete", status: "neu",
    headline: "Pflegebericht veröffentlicht", was_ist_passiert: "Der Bericht beschreibt die Pflegeversorgung.",
    created_at: "2026-11-06T06:00:00Z", updated_at: "2026-11-06T06:00:00Z" };
  const doc = { id: "rd-test", title: ko.headline, url: "https://example.org/isoliert/pflegebericht",
    source_name: "Deklariertes Testmedium", published_at: "2026-11-06T03:57:13Z",
    summary: "Der Bericht beschreibt die regionale Pflegeversorgung und den bestehenden Beratungsbedarf der beteiligten Einrichtungen. Er nennt keinen bevorstehenden Verfahrensschritt." };
  const make = versorgung => C.toBriefingContractV3({ profile, decisions: [{ knowledge_object_id: ko.id,
    vorgang_id: ko.vorgang_id, decision: "Ignorieren", priority_type: "normal", score: 10, matched_features: [] }],
    kosById: { [ko.id]: ko }, sourcesByVorgang: { [ko.vorgang_id]: [doc] }, now, versorgung });
  // server.js bindet diese Funktionen beim ersten require; vor der neuen
  // Decoratorregression injizieren, damit auch der bestehende Leerpfad echt liest.
  const S = require("../lib/helmut/storage"); let koLesungen = 0, koAntwort = [];
  S.v3StoreReady = () => true;
  S.listKnowledgeObjects = async () => { koLesungen++; return koAntwort; };
  const frischeKontext = { jetzt: now, lauf: { vertragVersion: 1, berlinTag: tag,
    status: "erfolg", erzeugtAm: now.toISOString() }, datenstand: now.toISOString(),
    fenster: { start: "2026-11-08T05:15:00Z" } };
  for (const zustand of ["offen", "unbekannt"]) {
    await test(`Frische globale Daten machen Versorgung ${zustand} nicht zur Ruhelage`, async () => {
      const b = make(signal(zustand)), before = JSON.stringify(b);
      const result = require("../server").__prepareBriefingResponse(b, { frischeKontext });
      const state = result.currentHelmutState;
      A.equal(state.emptyState.kind, "gap");
      A.equal(state.frischeVertrag.aktuell, true, "Datenfrische wird nicht umgedeutet");
      A.equal(state.frischeVertrag.ruhelage, false);
      A(!/Quellen wurden geprüft/.test(result.freshness.reason));
      const html = require("./lib/briefing-ansichten")(result, now.toISOString()).html.briefing;
      A(!html.includes("Heute liegt keine neue Meldung vor."));
      A(!html.includes("hstand-state-card--quiet"));
      A.equal(JSON.stringify(b), before);
    });
  }
  await test("Bestaetigte Versorgung mit frischen Daten behaelt echte Ruhelage", async () => {
    const result = require("../server").__prepareBriefingResponse(make(signal("kein-bekannter-rueckstand")), { frischeKontext });
    A.equal(result.currentHelmutState.frischeVertrag.aktuell, true);
    A.equal(result.currentHelmutState.frischeVertrag.ruhelage, true);
    A.equal(result.currentHelmutState.emptyState.kind, "quiet");
  });
  await test("Echtes Quiet wird per bestehendem Partial-CAS durch gespeichertes Gap ersetzt", async () => {
    const quiet = make(null); A.equal(quiet.currentHelmutState.emptyState.kind, "quiet");
    await B.materialisiere({ profile, userId: profile.id, briefing: quiet, storage, now });
    const gap = make(signal("offen"));
    const argumente = { profile, userId: profile.id, briefing: gap, storage, now, tag };
    await A.rejects(M.speicherePaket(argumente), /briefing-ergaenzung-nicht-zulaessig/);
    A.equal(updates, 0);
    const result = await M.speicherePaket({ ...argumente, now: new Date(now.getTime() + 1000) });
    A.equal(updates, 1); A.equal(result.beleg.vollstaendig, false);
    A.equal(result.briefing.currentHelmutState.emptyState.kind, "gap");
    A.deepEqual(result.briefing.currentHelmutState.versorgung, signal("offen"));
    const view = require("./lib/briefing-ansichten")(result.briefing, now.toISOString());
    A(!view.html.briefing.includes("hstand-state-card--quiet"));
  });
  await test("Historisch vollstaendiges Quiet bekommt kein breiteres Schreibrecht", async () => {
    const id = `bf-${profile.id}-mandatsbriefing-${tag}`, row = structuredClone(rows.get(id));
    row.payload.briefing = make(null);
    row.payload.quellenStand = require("../lib/helmut/tagespaket-auslieferung").quellenStand(row.payload, row.payload.quellenStand.sicherheitsHash);
    row.payload.inhaltHash = B.inhaltHash(row.payload);
    row.payload.pruefung.strukturellVollstaendig = true; rows.set(id, row);
    const before = structuredClone(row);
    await A.rejects(B.materialisiere({ profile, userId: profile.id, briefing: make(signal("unbekannt")), storage, now }),
      /briefing-versorgung-stand-unbestaetigt/);
    A.deepEqual(rows.get(id), before); A.equal(updates, 1);
  });
  await test("Historisches positives Komplettpaket bleibt erhalten ohne heutige Vollbestaetigung", async () => {
    const id = `bf-${profile.id}-mandatsbriefing-${tag}`, row = structuredClone(rows.get(id));
    const quelle = { ...doc, title: "Beratung der Pflegeversorgung", published_at: "2026-11-09T03:00:00Z",
      summary: "Die öffentliche Beratung zur Pflegeversorgung findet am 2026-11-10 mit den beteiligten Verbänden im Parlament statt." };
    const fachKo = { ...ko, headline: quelle.title, was_ist_passiert: quelle.summary };
    const positive = C.toBriefingContractV3({ profile, decisions: [{ knowledge_object_id: ko.id,
      vorgang_id: ko.vorgang_id, decision: "Reagieren", priority_type: "risk", score: 90, matched_features: [] }],
      kosById: { [ko.id]: fachKo }, sourcesByVorgang: { [ko.vorgang_id]: [quelle] }, now });
    A(positive.currentHelmutState.primaryItem); row.payload.briefing = positive;
    row.payload.quellenStand = require("../lib/helmut/tagespaket-auslieferung").quellenStand(row.payload, row.payload.quellenStand.sicherheitsHash);
    row.payload.inhaltHash = B.inhaltHash(row.payload); rows.set(id, row);
    const before = structuredClone(row);
    const result = await M.speicherePaket({ profile, userId: profile.id,
      briefing: { ...positive, currentHelmutState: { ...positive.currentHelmutState, versorgung: signal("offen") } }, storage, now, tag });
    A.deepEqual(rows.get(id), before); A.deepEqual(result.briefing, positive);
    A.equal(result.beleg.vollstaendig, false); A.equal(updates, 1);
    const input = { ...positive, currentHelmutState: { ...positive.currentHelmutState, versorgung: signal("offen") } };
    const inputBefore = JSON.stringify(input);
    const response = require("../server").__prepareBriefingResponse(input, { frischeKontext });
    A.equal(response.currentHelmutState.status, positive.currentHelmutState.status);
    A.equal(response.currentHelmutState.frischeVertrag.aktuell, true);
    A.equal(response.currentHelmutState.frischeVertrag.ruhelage, false);
    A.deepEqual(response.currentHelmutState.primaryItem, positive.currentHelmutState.primaryItem);
    A.equal(JSON.stringify(input), inputBefore);
  });
  await test("Echter Server-Leerpfad liest heutigen Versorgungsstand und zeigt keine Ruhe", async () => {
    const original = V.lese; let args;
    V.lese = async x => { args = x; return signal("unbekannt"); };
    try {
      const result = await require("../server").__buildV3Briefing(profile, profile.id, { now });
      A.equal(args.mandat, profile.id); A.equal(args.jetztMs, now.getTime());
      A.equal(koLesungen, 1, "Kein versehentlicher Store-disabled- statt Datenleerpfad");
      A.equal(result.currentHelmutState.emptyState.kind, "gap");
      A.deepEqual(result.currentHelmutState.versorgung, signal("unbekannt"));
    } finally { V.lese = original; }
  });
  await test("Getrennt fehlschlagende KO-Lesung wird trotz frischem Kontext nicht zur Ruhelage", async () => {
    const original = V.lese; koAntwort = { __storeError: true };
    V.lese = async () => signal("kein-bekannter-rueckstand");
    try {
      const b = await require("../server").__buildV3Briefing(profile, profile.id, { now });
      A.equal(b.reason, "store-error");
      const result = require("../server").__prepareBriefingResponse(b, { frischeKontext });
      A.equal(result.currentHelmutState.frischeVertrag.aktuell, true);
      A.equal(result.currentHelmutState.frischeVertrag.ruhelage, false);
      A(!/Quellen wurden geprüft/.test(result.freshness.reason));
      const html = require("./lib/briefing-ansichten")(result, now.toISOString()).html.briefing;
      A(html.includes("hstand-state-card--error"));
      A(!html.includes("Heute liegt keine neue Meldung vor."));
    } finally { V.lese = original; koAntwort = []; }
  });
  await test("Neues positives Teilpaket wird nach Restabschluss mit neuen Fakten per Partial-CAS ergaenzt", async () => {
    const Q = require("../lib/helmut/lage-textqualitaet"), L = require("../lib/helmut/lage-quellenbeleg");
    const render = require("./lib/briefing-ansichten");
    function paket(fassung, zustand) {
      const documents = [0, 1].map(i => ({ ...doc, id: `rd-positive-${i}`,
        title: `${fassung}: Pflegeberatung zum Vorhaben ${i}`,
        url: `https://example.org/isoliert/positive-pflege-${i}`, published_at: "2026-11-09T03:00:00Z",
        summary: `Die öffentliche Beratung zur Pflegeversorgung im Vorhaben ${i} findet am 2026-11-10 mit den beteiligten Verbänden im Parlament statt.` }));
      const kos = documents.map((d, i) => ({ ...ko, id: `ko-positive-${i}`, vorgang_id: `vg-positive-${i}`,
        headline: d.title, was_ist_passiert: d.summary }));
      const sources = Object.fromEntries(kos.map((k, i) => [k.vorgang_id, [documents[i]]]));
      const briefing = C.toBriefingContractV3({ profile, decisions: kos.map(k => ({ knowledge_object_id: k.id,
        vorgang_id: k.vorgang_id, decision: "Reagieren", priority_type: "risk", score: 90, matched_features: [] })),
        kosById: Object.fromEntries(kos.map(k => [k.id, k])), sourcesByVorgang: sources, now, versorgung: signal(zustand) });
      const entries = kos.map((k, i) => ({ vorgang_id: k.vorgang_id, quellenbelege: [{
        quelle_id: `q-positive-${i}`, quelle: "Synthetisches Testmedium", veroeffentlichtAm: documents[i].published_at,
        titel: documents[i].title, auszug: documents[i].summary, url: documents[i].url }] }));
      const bezug = Q.mandatsbezugAuswahl(profile).find(b => b.wert === "Pflege");
      const paragraphs = entries.map(e => ({ text: e.quellenbelege[0].titel + ".", vorgang_ids: [e.vorgang_id],
        quelle_id: e.quellenbelege[0].quelle_id, mandatsbezug: bezug }));
      const checked = Q.pruefe(paragraphs, entries, { pruefungen: paragraphs.map((p, i) => ({ absatz: i,
        quelle_id: p.quelle_id, belegfeld: "titel", vollstaendig_belegt: true, themenrein: true, profilbezug: true,
        textart: "konkreter_sachverhalt", pruefbegruendung: "Deklariertes synthetisches Urteil fuer die isolierte Vertragspruefung.",
        mandatsbegruendung: "Das synthetische Profil nennt Pflege als Fachthema." })),
        vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
          pruefbegruendung: "Die synthetischen Quellen benennen zwei unterschiedliche Pflegevorhaben." }] }, profile);
      A.equal(checked.ok, true, JSON.stringify(checked));
      const lage = { koSetHash: "a".repeat(32), quellenVersion: L.VERSION, quellenHash: L.hashEingabe(entries),
        quellen: entries, paragraphs: checked.paragraphs, qualitaet: checked.qualitaet };
      A.equal(L.gespeicherterTextGueltig(lage), true);
      return { briefing, lage, lageAnsicht: JSON.parse(JSON.stringify(B.lageAusgabe(lage))) };
    }
    for (const zustand of ["offen", "unbekannt"]) {
      rows.clear(); const vorherUpdates = updates;
      const erstes = paket("Erster Stand", zustand), lageId = `bf-${profile.id}-lage-${tag}`;
      rows.set(lageId, { id: lageId, user_id: profile.id, slot: "lage", payload: erstes.lage });
      const first = await B.materialisiere({ profile, userId: profile.id, briefing: erstes.briefing,
        lageAnsicht: erstes.lageAnsicht, storage, now });
      A.equal(first.vollstaendig, false); A.equal(erstes.briefing.available, true);
      const before = await B.lese({ userId: profile.id, day: tag, profile, storage });
      A.deepEqual(before.payload.pruefung.fehler, ["quellenversorgung-unvollstaendig"]);
      A.equal(render(before.payload.briefing, now.toISOString()).fachinhalt.briefing, true, JSON.stringify(before.payload.briefing.currentHelmutState));
      const neu = paket("Aktualisierte Pflegereform", "kein-bekannter-rueckstand");
      rows.set(lageId, { id: lageId, user_id: profile.id, slot: "lage", payload: neu.lage });
      const result = await M.speicherePaket({ profile, userId: profile.id, briefing: neu.briefing, lageAnsicht: neu.lageAnsicht, storage,
        now: new Date(now.getTime() + 60000), tag });
      const after = await B.lese({ userId: profile.id, day: tag, profile, storage });
      A.equal(updates, vorherUpdates + 1); A.deepEqual(after.payload.vorherigerStand, before);
      A.equal(after.payload.pruefung.strukturellVollstaendig, true); A.equal(result.beleg.vollstaendig, true);
      A.equal(after.payload.pruefung.bestanden, false); A.equal(after.payload.pruefung.vollstaendigeFaktenpruefung, false);
      A.deepEqual(after.payload.briefing.currentHelmutState.versorgung, signal("kein-bekannter-rueckstand"));
      A(render(after.payload.briefing, now.toISOString()).html.briefing.includes("Aktualisierte Pflegereform"));
    }
  });
  console.log(`PASS ${pass}/${pass} Versorgung, bestehender CAS und Anzeige; keine Fremdzaehler im Ergebnis`);
})().catch(e => { console.error(e); process.exitCode = 1; });
