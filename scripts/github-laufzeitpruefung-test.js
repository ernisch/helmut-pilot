"use strict";
const assert = require("assert/strict");
const http = require("http");
const { pruefe, STATUS_URL } = require("./github-laufzeitpruefung");

async function main() {
  let pass = 0;
  const check = (v, m) => { assert.ok(v, m); pass++; };
  const sha = "a".repeat(40);
  const geheim = "NIE_AUSGEBEN_abcdef";
  const env = { HELMUT_PRODUCTION_COMMIT: sha, GITHUB_SHA: sha, HELMUT_CRON_SECRET: geheim };
  const payload = { ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: sha,
    storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: false,
    retentionGueltig: true, retention: 36, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200,
    kommunikationGesperrt: true, kohortenQuellenGesperrt: true, secret: geheim };
  let calls = 0;
  const fetchFn = async (url, opts) => {
    calls++;
    check(url === STATUS_URL && opts.method === "GET" && !opts.body, "nur fester GET");
    check(opts.redirect === "error", "keine Redirects");
    return { status: 200, json: async () => payload };
  };
  let r = await pruefe({ env, fetchFn });
  check(r.ok && r.tagesdeckel === 2416 && r.understandingReserve === 702
    && r.vorrangreserveReal === 200, "Laufzeitwerte erhalten");
  check(!JSON.stringify(r).includes(geheim) && !r.scharferPfadFreigegeben, "keine fremden Felder oder Freigabe");
  check(calls === 1, "genau ein Request");
  const quellenkontext = { version: 1, scoring: "off", relevanzordnung: false,
    koScan: 500, lageMax: 12, relevanzTage: 14, sourceSafetyStandard: true, atomicLock: true, secret: geheim };
  r = await pruefe({ env, fetchFn: async () => ({ status: 200, json: async () => ({ ...payload, quellenkontext }) }) });
  check(r.quellenkontext?.relevanzTage === 14 && !JSON.stringify(r).includes(geheim), "Quellenlesepfad ohne fremde Felder bestaetigt");
  for (const patch of [{ atomicLock: "true" }, { relevanzTage: -1 }, { lageMax: 12.5 }]) {
    r = await pruefe({ env, fetchFn: async () => ({ status: 200, json: async () => ({ ...payload, quellenkontext: { ...quellenkontext, ...patch } }) }) });
    check(!r.quellenkontext, "ungueltiger Quellenlesepfad nicht bestaetigt");
  }
  for (const changed of [{ GITHUB_SHA: "b".repeat(40) }, { HELMUT_PRODUCTION_COMMIT: "" }, { HELMUT_CRON_SECRET: "" }]) {
    calls = 0;
    r = await pruefe({ env: { ...env, ...changed }, fetchFn });
    check(!r.ok && calls === 0, "fehlende Voraussetzung vor Netz abgefangen");
  }
  for (const changed of [{ commit: "b".repeat(40) }, { production: false }, { reinLesend: false }, { tagesdeckel: geheim }, { kommunikationGesperrt: "true" }, { vorrangreserveReal: undefined }, { vorrangreserveReal: "200" }]) {
    r = await pruefe({ env, fetchFn: async () => ({ status: 200, json: async () => ({ ...payload, ...changed }) }) });
    check(!r.ok && !JSON.stringify(r).includes(geheim), "falsche Antwort ohne Rohdaten abgewiesen");
  }
  for (const status of [401, 503]) {
    r = await pruefe({ env, fetchFn: async () => ({ status, json: async () => { throw Error(geheim); } }) });
    check(!r.ok && r.httpStatus === status && !JSON.stringify(r).includes(geheim), "HTTP Status ohne Antworttext");
  }
  for (const status of [geheim, { text: geheim }, undefined, NaN, 999]) {
    r = await pruefe({ env, fetchFn: async () => ({ status }) });
    check(!r.ok && r.httpStatus === null && !JSON.stringify(r).includes(geheim), "ungueltiger HTTP Status ohne Rohdaten");
  }
  r = await pruefe({ env, fetchFn: async () => { throw Error(geheim); } });
  check(!r.ok && !JSON.stringify(r).includes(geheim), "Netzfehler ohne Secret");

  process.env.HELMUT_AUTH_MODE = "accounts";
  process.env.CRON_SECRET = geheim;
  process.env.VERCEL_GIT_COMMIT_SHA = sha;
  process.env.VERCEL_ENV = "production";
  process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "2416";
  process.env.HELMUT_LLM_RESERVE_UNDERSTANDING = "702";
  process.env.HELMUT_CRAWL_RUN_RETENTION = "36";
  process.env.HELMUT_TESTLAUF_KOMMUNIKATION = "gesperrt";
  delete process.env.HELMUT_TESTLAUF_VORRANG_REAL;
  const accounts = require("../lib/helmut/accounts");
  const storage = require("../lib/helmut/storage");
  let writes = 0;
  const verboten = async () => { writes++; throw Error("Schreibpfad erreicht"); };
  accounts.ensureAdminSeed = verboten;
  accounts.recordSystemError = verboten;
  storage.getLatestCrawlRun = verboten;
  const handler = require("../server");
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const request = (method, token, path = "/api/cron/testnachweis-status", headers = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port,
      path, method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }, (res) => {
      let text = ""; res.on("data", (c) => { text += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    }); req.on("error", reject); req.end();
  });
  try {
    r = await request("GET", geheim);
    check(r.status === 200 && r.body.reinLesend === true && r.body.commit === sha, "echter Handler erreicht Status");
    const runtime = await pruefe({ env, fetchFn: async () => ({ status: r.status, json: async () => r.body }) });
    check(runtime.textnachlaufVersion === 2 && runtime.textnachlaufArbeitsauswahlVersion === 1 && runtime.testKosten?.aktiv === true
      && runtime.testKosten.limitUsd === 4 && runtime.testKosten.version === 2 && runtime.testKosten.maxManualCalls === null
      && runtime.testKosten.maxWindowMs === null && runtime.testKosten.unbekanntBleibtReserviert === true,
    "echter Handler und CLI Leser bestaetigen denselben Dollar Schutzvertrag");
    check(runtime.quellenkontext?.version === 1 && runtime.quellenkontext.relevanzTage === 14
      && runtime.quellenkontext.atomicLock === storage.atomicLockEnabled(), "echter Quellenlesepfad bis zum CLI Leser");
    check(r.body.tagesdeckel === 2416 && r.body.understandingReserve === 702, "echte Budgetfunktionen");
    check(r.body.vorrangreserveReal === 0, "fehlende Production Reserve ehrlich als null Aufrufe");
    process.env.HELMUT_TESTLAUF_VORRANG_REAL = "200";
    check((await request("GET", geheim)).body.vorrangreserveReal === 200, "Reserve aus der echten Laufzeit gelesen");
    delete process.env.HELMUT_TESTLAUF_VORRANG_REAL;
    check(r.body.retention === 36 && r.body.kommunikationGesperrt === true, "echte Schutzfunktionen");
    check(r.body.kohortenQuellenGesperrt === true, "Kohortenquellen standardmaessig gesperrt");
    process.env.HELMUT_TESTKOHORTE_QUELLEN = "aktiv";
    check((await request("GET", geheim)).body.kohortenQuellenGesperrt === false, "echter Quellenriegel wird abgefragt");
    delete process.env.HELMUT_TESTKOHORTE_QUELLEN;
    check(!JSON.stringify(r).includes(geheim), "HTTP Antwort ohne Secret");
    check((await request("GET", "falsch")).status === 403, "falsche Autorisierung geschlossen");
    check((await request("GET", null)).status === 403, "fehlende Autorisierung geschlossen");
    check((await request("POST", geheim)).status === 405, "kein POST Pfad");
    delete process.env.CRON_SECRET;
    check((await request("GET", geheim)).status === 503, "fehlende Serverkonfiguration geschlossen");
    process.env.CRON_SECRET = geheim;
    const original = storage.llmDailyCallLimit;
    storage.llmDailyCallLimit = () => { throw Error(geheim); };
    r = await request("GET", geheim);
    check(r.status === 500 && !JSON.stringify(r).includes(geheim), "Fehler ohne Rohtext oder Auditwrite");
    storage.llmDailyCallLimit = original;
    const nachlauf = "/api/cron/lage-briefing?nachlauf=fehlende-500";
    check((await request("POST", null, nachlauf)).status === 403, "Textnachlauf ohne Cron Autorisierung gesperrt");
    check((await request("GET", geheim, nachlauf)).status === 400, "Textnachlauf nie per GET oder Prefetch");
    check((await request("POST", geheim, nachlauf + "&force=1")).status === 400, "Textnachlauf akzeptiert keinen Force Parameter");
    const ohneFreigabe = await request("POST", geheim, nachlauf);
    check(ohneFreigabe.body.ok === false && ohneFreigabe.body.grund === "nachlauf-freigabe-fehlt", "Autorisierung allein ist keine Textlauf Freigabe");
    const ohneProduction = await request("POST", geheim, nachlauf, {
      "x-helmut-production-commit": sha, "x-helmut-lauf": "nachlauf500-123456789",
      "x-helmut-bestaetigung": require("../lib/helmut/testkohorte-textnachlauf").CONFIRM
    });
    check(ohneProduction.body.ok === false && ohneProduction.body.grund === "nachlauf-konfiguration-abweichend",
      "Echter Server prueft Laufzeit vor jedem Speicher oder Modellpfad");
    const textlauf = require("../lib/helmut/testkohorte-textnachlauf"), originalTextlauf = textlauf.ausfuehren;
    let arbeitsbeginn, auswahlVersion, testfensterId, fensterVersion;
    textlauf.ausfuehren = async args => { arbeitsbeginn = args.arbeitsbeginn;
      const config = await args.config(); auswahlVersion = config.textnachlaufArbeitsauswahlVersion;
      fensterVersion = config.textnachlaufTestfensterVersion; testfensterId = args.testfensterId;
      return { ok: true }; };
    try {
      const scoped = await request("POST", geheim, nachlauf, { "x-helmut-arbeitsbeginn": "27" });
      check(scoped.status === 200 && arbeitsbeginn === "27" && auswahlVersion === 1,
        "Echter HTTP Handler transportiert die Arbeitsauswahl und meldet dieselbe Faehigkeit");
      const uuid = "00000000-0000-4000-8000-000000000459";
      const gebunden = await request("POST", geheim, nachlauf, { "x-helmut-testfenster": uuid });
      check(gebunden.status === 200 && testfensterId === uuid && fensterVersion === 1,
        "Echter Handler transportiert die Testfensterbindung und meldet die deployte Faehigkeit");
    } finally { textlauf.ausfuehren = originalTextlauf; }
    const B = require("../lib/helmut/briefing-speicher");
    const profile = { id: "test-kohorte-a-001", committees: ["Bildung"], deputyCommittees: ["Haushaltsausschuss"] };
    const getProfileVorher = storage.getProfile, getBriefingVorher = storage.getRenderedBriefingV3;
    const briefing = { available: true, items: [{ title: "Beratung ueber Schulbau" }], currentHelmutState: {}, currentRadarState: {} };
    const lage = { paragraphs: [{ text: "Die Quelle berichtet ueber Schulbau.", vorgang_ids: ["vg-schule"], quellen_ids: ["q-schule"] }],
      quellen: [{ vorgang_id: "vg-schule", quellenbelege: [{ quelle_id: "q-schule", quelle: "Testquelle", titel: "Schulbau", url: "https://example.org/schule" }] }],
      qualitaet: { version: require("../lib/helmut/lage-textqualitaet").VERSION } };
    const payload = { version: B.VERSION, mandat: profile.id, tag: "2026-09-09", profilHash: B.profilHash(profile, 1),
      briefing, lage, inhaltHash: B.hash({ briefing, lage }), pruefung: B.pruefeInhalt(briefing, lage) };
    const row = { id: `bf-${profile.id}-mandatsbriefing-2026-09-09`, user_id: profile.id, slot: B.SLOT, payload };
    let reads = 0;
    storage.getProfile = async id => { reads++; return { ...profile, id }; };
    storage.getRenderedBriefingV3 = async () => { reads++; return structuredClone(row); };
    try {
      const path = `/api/cron/briefing-nachweis?mandat=${profile.id}&tag=2026-09-09`;
      check((await request("GET", null, path)).status === 403 && reads === 0, "Briefingbeleg ohne Autorisierung liest keine Mandatsdaten");
      r = await request("GET", geheim, path);
      check(r.status === 500 && !JSON.stringify(r.body).includes("Schulbau"),
        "aktueller Nachweis akzeptiert keinen historischen Hash mit verlorener Stellvertretung");
      payload.profilHashVersion = 2;
      r = await request("GET", geheim, path);
      check(r.status === 500 && !JSON.stringify(r.body).includes("Schulbau"), "neue Versionsbehauptung mit altem Hash wird aktuell abgewiesen");
      payload.profilHash = B.profilHash(profile);
      r = await request("GET", geheim, path);
      check(r.status === 200 && r.body.gespeicherterNachweis.profilbindung.version === 2
        && r.body.gespeicherterNachweis.profilbindung.stellvertretungenImProfilhash === true,
        "neuer gespeicherter Kontext bleibt mit seiner eigenen Bindung abrufbar");
      check(r.body.gespeicherterNachweis.auswahl === "aktuell"
        && r.body.gespeicherterNachweis.pruefung.bestanden === false,
        "aktuelle Auswahl behauptet keine Fachabnahme");
      check(r.body.lageBriefing.paragraphs[0].sources[0].url === "https://example.org/schule",
        "gespeicherter Text bleibt mit konkreter Quelle abrufbar");
      profile.deputyCommittees = ["Verkehrsausschuss"];
      r = await request("GET", geheim, path);
      check(r.status === 500 && !JSON.stringify(r.body).includes("Schulbau"), "abweichende Stellvertretung wird beim aktuellen Beleg abgewiesen");
      profile.deputyCommittees = ["Haushaltsausschuss"];
      r = await request("GET", geheim, path.replace(profile.id, "test-kohorte-a-002"));
      check(r.status === 500 && !JSON.stringify(r.body).includes("Schulbau"), "fremde Speicherantwort wird nicht ausgeliefert");
      check((await request("POST", geheim, path)).status === 400, "Nachweisroute ist ausschliesslich lesend");
      const P = require("../lib/helmut/briefing-pruefaufnahme"), oldCapture = P.erfasse;
      let captured = null;
      P.erfasse = async args => { captured = args; return { reinLesend: true, art: "production-briefing-eingabe" }; };
      try {
        const inputPath = path + "&modus=eingabe";
        check((await request("GET", null, inputPath)).status === 403 && captured === null,
          "Frische Aufnahme ohne Cron Autorisierung erreicht keinen Leser");
        const read = await request("GET", geheim, inputPath, { "x-helmut-production-commit": sha });
        check(read.status === 200 && captured.expectedCommit === sha && captured.commit === sha
          && captured.production === true && typeof captured.build === "function"
          && captured.storage === storage && captured.userId === profile.id,
          "Echter HTTP Handler bindet frische Aufnahme an Commit, Mandat und echten Builder");
        check((await request("POST", geheim, inputPath)).status === 400
          && (await request("GET", geheim, path + "&modus=force")).status === 400,
          "Aufnahme akzeptiert weder POST noch einen erzwungenen Modus");
      } finally { P.erfasse = oldCapture; }
      const P500 = require("../lib/helmut/briefing-pruefaufnahme-500"), old500 = P500.erfasse;
      let called500 = null;
      P500.erfasse = async args => { called500 = args; return { reinLesend: true, fachlicheFreigabe: false }; };
      try {
        const inputPath = path + "&modus=eingabe-500";
        check((await request("GET", null, inputPath)).status === 403 && called500 === null,
          "Aktive Aufnahme verlangt Cron Autorisierung vor jedem Lesen");
        check((await request("POST", geheim, inputPath)).status === 400
          && (await request("GET", geheim, inputPath + "&pruefeZielbestand=force")).status === 400
          && called500 === null, "Aktive Aufnahme erlaubt weder Writer noch Zielueberschreibung");
        const read500 = await request("GET", geheim, inputPath, { "x-helmut-production-commit": sha });
        check(read500.status === 200 && called500.expectedCommit === sha
          && called500.storage === storage && typeof called500.config === "function"
          && typeof called500.build === "function" && called500.pruefeZielbestand === undefined,
          "Aktive HTTP Aufnahme bindet echten Builder, Konfiguration und festen Zielpruefer");
      } finally { P500.erfasse = old500; }

    } finally { storage.getProfile = getProfileVorher; storage.getRenderedBriefingV3 = getBriefingVorher; }
    const fixture = require("./fixtures/profilhash-integration");
    const f = fixture.fixture({ ...fixture.profile, id: "test-kohorte-a-001" });
    await f.write();
    storage.getProfile = async () => f.args.profile;
    storage.getRenderedBriefingV3 = f.storage.getRenderedBriefingV3;
    try {
      const r = await request("GET", geheim,
        `/api/cron/briefing-nachweis?mandat=${f.args.profile.id}&tag=${fixture.day}`);
      check(r.status === 200 && r.body.gespeicherterNachweis.id === f.key
        && r.body.gespeicherterNachweis.auswahl === "aktuell",
        "echter HTTP Handler liefert den getrennten aktuellen Nachfolger");
      f.rows.get(f.key).payload.profilkontextUebergang.vorgaengerHash = "a".repeat(64);
      const bad = await request("GET", geheim,
        `/api/cron/briefing-nachweis?mandat=${f.args.profile.id}&tag=${fixture.day}`);
      check(bad.status === 500 && !JSON.stringify(bad.body).includes("Haushaltsentwurf"),
        "beschaedigter Nachfolger faellt auch im echten HTTP Handler nicht auf Altstand zurueck");
    } finally { storage.getProfile = getProfileVorher; storage.getRenderedBriefingV3 = getBriefingVorher; }
    const A = require("../lib/helmut/briefing-aussagenbindung");
    const oldCheck = A.leseFuerNachlauf, oldMaterial = B.materialisiere;
    let accepted = true, transported;
    A.leseFuerNachlauf = async () => ({ bereit: accepted, briefing: f.args.briefing,
      eingabeHash: f.args.aussagenEingabeHash, lageEingabe: f.fachbasis });
    B.materialisiere = async args => { transported = args; return { ok: true }; };
    textlauf.ausfuehren = async args => {
      if (!accepted) {
        try { await args.deps.materialisiereBriefing(f.args.profile, f.args.profile.id); }
        catch { return { ok: false }; }
        throw new Error("Fehlende Fachfreigabe nicht gesperrt");
      }
      return args.deps.materialisiereBriefing(f.args.profile, f.args.profile.id);
    };
    try {
      const result = await request("POST", geheim, nachlauf);
      check(result.status === 200 && transported?.profilkontextUebergang === f.fachbasis,
        "echter Serveranschluss uebergibt aktuelle Fachbasis an die Materialisierung");
      accepted = false; transported = null;
      const refused = await request("POST", geheim, nachlauf);
      check(refused.body.ok === false && transported === null,
        "fehlende Fachfreigabe erreicht am Serveranschluss keinen Writer");
    } finally { A.leseFuerNachlauf = oldCheck; B.materialisiere = oldMaterial; textlauf.ausfuehren = originalTextlauf; }
    check(writes === 0, "Adminseed, Blobleser und Fehlerpersistierung nie erreicht");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(`github-laufzeitpruefung: ${pass} PASS / 0 FAIL`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
