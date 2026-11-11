"use strict";
// Fuenf synthetische Zeilen, kein12254er Lasttest: die echte Count-/Seitenabfrage
// sowie das Journal laufen durch storage.supabaseRequest ueber Loopback-HTTP.
const A = require("node:assert/strict"), http = require("node:http");
const { once } = require("node:events"), { isDeepStrictEqual } = require("node:util");
const S = require("../lib/helmut/storage"), P = require("../lib/helmut/scalable-pipeline");
const V = require("../lib/helmut/quellen-versorgungsstand"), C = require("../lib/helmut/briefingContract");
const jetzt = Date.parse("2026-11-10T03:00:00Z"), anzahl = 12254;
const profile = { id: "isolierte-pending-rotation", fullName: "Fiktives Fachprofil", party: "SPD",
  parliament: "Bundestag", state: "Niedersachsen", focusTopics: ["Pflege"], profileActive: true };
const pending = Array.from({ length: 5 }, (_, i) => ({ id: `ko-pending-${5795 + i}`, status: "pending",
  understanding_status: i === 0 ? null : "pending", created_at: "2026-11-01T03:00:00Z" }));
let mode = "normal", groups = 0, jobs = [], planned = 0;
const requests = [], rows = new Map(), queueRows = new Map(), rpcBodies = [];
let receipt = "normal", sequence = 0;
const env = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_ARTIKELKONTEXT: "on",
  HELMUT_SUCHWEGAUSZUEGE_HOSTS: "www.dgb.de,www.radio-hannover.de", HELMUT_QUELLEN_ARBEITSFENSTER: "on",
  HELMUT_SUPABASE_STORE_ID: "isolierter-rotationsstore", HELMUT_SUPABASE_TIMEOUT_MS: "1000" };
const filter = "(understanding_status.is.null,understanding_status.not.in.(failed,failed-final,gate-geparkt))";
async function test(name, fn) { await fn(); groups++; console.log("PASS " + name); }
(async () => {
  A.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv");
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", x => body += x); req.on("end", () => {
      const u = new URL(req.url, "http://127.0.0.1"), q = u.searchParams;
      requests.push({ path: u.pathname, query: q, method: req.method });
      const send = (status, data) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
      try {
        if (u.pathname === "/rest/v1/knowledge_objects") {
          if (q.get("status") === "eq.pending") { A.equal(q.get("or"), filter); }
          if (q.get("select") === "count") return send(200, [{ count: anzahl }]);
          if (mode === "failure") return send(400, { message: "synthetischer Leseausfall" });
          if (mode === "object") return send(200, { data: pending });
          if (mode === "duplicate") return send(200, [pending[0], pending[0]]);
          if (mode === "nullrow") return send(200, [null]);
          if (mode === "excess") return send(200, [...pending, { id: "ko-extra" }]);
          if (mode === "excluded") return send(200, ["failed", "failed-final", "gate-geparkt"].map((understanding_status, i) =>
            ({ id: `ko-ausgeschlossen-${i}`, status: "pending", understanding_status })));
          return send(200, pending.slice());
        }
        if (u.pathname === "/rest/v1/helmut_store") {
          if (req.method === "POST") { const row = JSON.parse(body); if (rows.has(row.id)) return send(409, {});
            rows.set(row.id, row); return send(201, [{ id: row.id }]); }
          A.equal(req.method, "GET");
          const eq = q.getAll("id").find(v => v.startsWith("eq."));
          return send(200, eq ? (rows.has(eq.slice(3)) ? [rows.get(eq.slice(3))] : [])
            : [...rows.values()].filter(r => r.data.zustand === "offen"));
        }
        if (u.pathname === "/rest/v1/rpc/helmut_quellenplan_cursor_cas") {
          A.equal(req.method, "POST"); const p = JSON.parse(body), row = rows.get(p.p_id), old = JSON.parse(p.p_expected);
          const match = row && isDeepStrictEqual(row.data, old);
          if (match) { A.equal(p.p_next_cursor, old.cursor + 1); row.data = { ...old, cursor: p.p_next_cursor,
            zustand: p.p_next_cursor === old.auftraege.length ? "fertig" : "offen" }; }
          return send(200, [{ id: p.p_id, uebernommen: Boolean(match) }]);
        }
        if (["/rest/v1/rpc/helmut_enqueue_job", "/rest/v1/rpc/helmut_enqueue_job_mit_outbox"].includes(u.pathname)) {
          // Spiegel der installierten RPC-Signatur/NOT-NULL-Spalte, kein SQL-Nachweis.
          A.equal(req.method, "POST"); const p = JSON.parse(body); rpcBodies.push({ path: u.pathname, params: p });
          if (!Object.hasOwn(p, "p_freshness_window")) return send(404, { code: "PGRST202", message: "Pflichtparameter fehlt" });
          if (p.p_freshness_window === null) return send(400, { code: "23502", message: "freshness_window NOT NULL" });
          A.equal(typeof p.p_freshness_window, "string");
          let row = queueRows.get(p.p_idempotency_key); const neu = !row;
          if (!row) { row = { id: "00000000-0000-4000-8000-" + (++sequence).toString(16).padStart(12, "0"),
            params: structuredClone(p), status: "wartend" }; queueRows.set(p.p_idempotency_key, row); }
          const ack = { id: row.id, neu, ...(u.pathname.endsWith("_mit_outbox") ? { versandabsicht: neu ? "neu" : "unveraendert" } : {}) };
          if (receipt === "empty") return send(200, []);
          if (receipt === "null-id") return send(200, [{ ...ack, id: null }]);
          if (receipt === "invalid-id") return send(200, [{ ...ack, id: "kein-job" }]);
          if (receipt === "invalid-neu") return send(200, [{ ...ack, neu: "false" }]);
          if (receipt === "multiple") return send(200, [ack, ack]);
          return send(200, [ack]);
        }
        if (u.pathname === "/rest/v1/rpc/helmut_jobs_offen") {
          const p = JSON.parse(body), relevant = [...queueRows.values()].filter(r =>
            (!p.p_fenster || p.p_fenster.includes(r.params.p_freshness_window))
            && (!p.p_typen || p.p_typen.includes(r.params.p_job_type))
            && (!p.p_mandat || !r.params.p_tenant_id || p.p_mandat === r.params.p_tenant_id));
          return send(200, [{ offen: relevant.filter(r => ["wartend", "laeuft"].includes(r.status)).length,
            fehlgeschlagen: relevant.filter(r => r.status === "fehlgeschlagen").length }]);
        }
        return send(404, { message: "unbekannter Testweg" });
      } catch (e) { console.error(e); send(500, { message: e.message }); }
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  Object.assign(process.env, { SUPABASE_URL: "http://127.0.0.1:" + server.address().port,
    SUPABASE_SERVICE_ROLE_KEY: "isolierter-rotationsschluessel", HELMUT_V3_STORE: "1" });
  try {
    await test("Tagesrotation12254/10Nov2026 liest5795 ueber echten Storageadapter mit fuenf stabil geordneten Zeilen", async () => {
      A.equal(await S.zaehlePendingVerarbeitbar(), anzahl);
      const offset = (Math.floor(jetzt / 86400000) % Math.ceil(anzahl / 5)) * 5; A.equal(offset, 5795);
      A.deepEqual(await S.listPendingKnowledgeObjects({ limit: 5, offset, reihenfolge: "aelteste", _signalError: true }), pending);
      const q = requests.at(-1).query;
      A.equal(q.get("offset"), "5795"); A.equal(q.get("limit"), "5"); A.equal(q.get("order"), "created_at.asc,id.asc");
      A.equal(q.get("status"), "eq.pending"); A.equal(q.get("or"), filter);
      A(!q.get("select").includes("embedding"));
    });
    await test("Publikationsgrenze5000 bleibt getrennt; grosse Pendingoffsets werden nicht auf5000 gekappt", async () => {
      const old = requests.length;
      A.deepEqual(await S.listKnowledgeObjects({ offset: 5795, _signalError: true }), { __storeError: true });
      A.equal(requests.length, old, "keine Publikationsabfrage ueber5000");
      A.equal((await S.listKnowledgeObjects({ limit: 5, offset: 5000, _signalError: true })).length, 5);
      A.equal(requests.at(-1).query.get("offset"), "5000", "erlaubte Publikationsgrenze bleibt erreichbar");
      await S.listPendingKnowledgeObjects({ limit: 5, offset: 12250, reihenfolge: "aelteste", _signalError: true });
      A.equal(requests.at(-1).query.get("offset"), "12250");
    });
    await test("Unsichere Offsets und ungebundene Seiten werden vor HTTP abgewiesen", async () => {
      const old = requests.length;
      for (const offset of [-1, 1.5, "5795", Infinity, Number.MAX_SAFE_INTEGER + 1])
        await A.rejects(S.listPendingKnowledgeObjects({ limit: 5, offset, _signalError: true }), /pending-bestand-nicht-lesbar/);
      await A.rejects(S.listPendingKnowledgeObjects({ limit: 1001, _signalError: true }), /pending-bestand-nicht-lesbar/);
      A.equal(requests.length, old);
    });
    await test("Failed/Terminal/Gate bleiben ausgeschlossen; HTTP- und Formatfehler bleiben ausdrueckliche Fehler", async () => {
      mode = "excluded"; A.deepEqual(await S.listPendingKnowledgeObjects({ limit: 5, offset: 5795, _signalError: true }), []);
      for (mode of ["failure", "object", "duplicate", "nullrow", "excess"])
        await A.rejects(S.listPendingKnowledgeObjects({ limit: 5, offset: 5795, _signalError: true }), /pending-bestand-nicht-lesbar/);
      mode = "normal";
    });
    const dep = { listFullProfiles: async () => [profile], now: () => jetzt, request: S.supabaseRequest,
      listKoDocuments: async id => [{ id: "rd-" + Number(id.slice(id.lastIndexOf("-") + 1)).toString(16).padStart(64, "0") }],
      enqueue: async job => { jobs.push(job); return { verfuegbar: true, neu: true }; },
      sourceDemand: {
        kompiliereQuellenbedarf: async () => { planned++; return { auftraege: [{ jobType: "source_fetch", idempotencyKey: "quelle-folgt-pending", freshnessWindow: "2026-11-10T00Z", payload: {} }], statistik: {}, fehlerhafteProfile: [] }; },
        planeMandatsarbeit: () => ({ auftraege: [], fenster: "2026-11-10T00Z" }) } };
    const supply = extra => V.lese({ mandat: profile.id, jetztMs: jetzt, env, deps: { request: S.supabaseRequest, ...extra } });
    await test("Lesefehler erzeugt kein Manifest oder scheinbar behobene Briefingsperre", async () => {
      mode = "failure";
      const r = await P.setzePlanungFort({ jetztMs: jetzt, env, deps: dep, darfNeuPlanen: true });
      A.equal(r.ok, false); A.equal(r.grund, "pending-bestand-nicht-lesbar"); A.equal(jobs.length, 0); A.equal(rows.size, 0);
      A.equal((await supply()).zustand, "unbekannt"); mode = "normal";
    });
    await test("Echter Pendingadapter reicht die heutige Rotation bis Manifest, Quellenplanung und bestaetigtem Enqueue weiter", async () => {
      const before = planned;
      const r = await P.setzePlanungFort({ jetztMs: jetzt, env, deps: dep, darfNeuPlanen: true });
      A.equal(r.ok, true); A.equal(planned, before + 1); A.equal(r.planungsrest.zustand, "fertig");
      A(jobs.some(j => j.jobType === "source_fetch"));
      const understanding = jobs.find(j => j.jobType === "document_understanding"); A(understanding); A.equal(understanding.payload.dokumentIds.length, 5);
      A.equal(requests.filter(x => x.path.endsWith("knowledge_objects") && x.query.get("select") !== "count").at(-1).query.get("offset"), "5795");
      const calls = requests.length, oldJobs = jobs.length;
      const replay = await P.setzePlanungFort({ jetztMs: jetzt + 900000, env, deps: dep, darfNeuPlanen: true });
      A.equal(replay.ok, true); A.equal(jobs.length, oldJobs); A.equal(planned, before + 1);
      A(requests.slice(calls).every(x => !x.path.endsWith("knowledge_objects")), "Folgefenster plant nicht erneut");
    });
    await test("Fertiges Enqueue ist kein Lektuerebeweis: technische Briefingsperre bleibt bis bestaetigter Verarbeitung", async () => {
      const offen = await supply({ offeneVorbedingungen: async () => ({ verfuegbar: true, offen: 1, fehlgeschlagen: 0 }) });
      A.equal(offen.zustand, "offen");
      const base = { profile, decisions: [], kosById: {}, sourcesByVorgang: {}, now: new Date(jetzt) };
      for (const zustand of ["unbekannt", "offen"]) {
        const b = C.toBriefingContractV3({ ...base, versorgung: { version: 1, zustand } });
        A.equal(b.currentHelmutState.emptyState.kind, "gap");
      }
      const ready = await supply({ offeneVorbedingungen: async () => ({ verfuegbar: true, offen: 0, fehlgeschlagen: 0 }) });
      A.equal(ready.zustand, "kein-bekannter-rueckstand");
    });
    await test("Echter Planer und beide Standard-RPC-Adapter bestaetigen Pending vor Quellen ohne neue Idempotenz", async () => {
      for (const dispatch of ["off", "shadow"]) {
        rows.clear(); queueRows.clear(); rpcBodies.length = 0; receipt = "normal";
        const actual = { ...dep, enqueue: undefined }, wirksam = { ...env, HELMUT_JOB_DISPATCH_MODE: dispatch };
        const r = await P.setzePlanungFort({ jetztMs: jetzt, env: wirksam, deps: actual, darfNeuPlanen: true });
        A.equal(r.ok, true, JSON.stringify(r)); A.equal(r.planungsrest.cursor, 2);
        A.equal(rpcBodies.length, 2); A.equal(queueRows.size, 2);
        A.equal(rpcBodies[0].params.p_job_type, "document_understanding");
        A.equal(rpcBodies[0].params.p_freshness_window, "2026-11-10T00Z");
        A.equal(rpcBodies[0].params.p_tenant_id, null); A.equal(rpcBodies[0].params.p_payload.dokumentIds.length, 5);
        A(rpcBodies.every(b => b.path.endsWith(dispatch === "shadow" ? "helmut_enqueue_job_mit_outbox" : "helmut_enqueue_job")));
        const key = rpcBodies[0].params.p_idempotency_key;
        A(/^document_understanding\|[a-f0-9]+$/.test(key), "Schluessel bleibt inhaltsgebunden statt tagesgebunden");
        const replay = await P.setzePlanungFort({ jetztMs: jetzt + 900000, env: wirksam, deps: actual, darfNeuPlanen: true });
        A.equal(replay.ok, true); A.equal(rpcBodies.length, 2); A.equal(queueRows.size, 2);
        for (const row of queueRows.values()) row.status = row.params.p_job_type === "document_understanding" ? "fehlgeschlagen" : "erledigt";
        A.equal((await supply()).zustand, "offen", "Heutiger Terminalfehler darf nicht als fehlender Rueckstand verschwinden");
      }
    });
    await test("Unveraenderlicher Altplan heilt am Folgetag nur die RPC-Kopie; verlorene Quittung bestaetigt keinen Cursor", async () => {
      for (const dispatch of ["off", "shadow"]) {
        rows.clear(); queueRows.clear(); rpcBodies.length = 0;
        const journal = require("../lib/helmut/quellen-planungsrest").erzeugePlanungsrest({ request: S.supabaseRequest, storeId: env.HELMUT_SUPABASE_STORE_ID });
        const tag = "2026-11-09", key = "document_understanding|" + "a".repeat(64);
        const old = await journal.sichereManifest(tag, { auftraege: [{ jobType: "document_understanding", idempotencyKey: key,
          payload: { dokumentIds: ["rd-" + "b".repeat(64)] }, tenantId: null, maxAttempts: 3, priority: 80 }] });
        const before = structuredClone(old);
        const actual = { ...dep, enqueue: undefined, quellenFuerProfil: () => { throw Error("Keine Neuplanung"); } };
        const wirksam = { ...env, HELMUT_JOB_DISPATCH_MODE: dispatch };
        receipt = "empty";
        const unknown = await P.setzePlanungFort({ jetztMs: jetzt - 86400000, env: wirksam, deps: actual });
        A.equal(unknown.ok, false); A.equal((await journal.lesen(tag)).cursor, 0);
        A.equal(queueRows.size, 1, "Nur RPC-Antwort verloren; der Auftrag ist in der isolierten Ablage vorhanden");
        receipt = "normal";
        const recovered = await P.setzePlanungFort({ jetztMs: jetzt, env: wirksam, deps: actual });
        A.equal(recovered.grund, "planung-fehlt", "Der alte Plan ist fertig, fuer den Folgetag wurde kein neuer erfunden");
        const after = await journal.lesen(tag);
        A.equal(after.cursor, 1); A.equal(after.zustand, "fertig");
        A.deepEqual(after.auftraege, before.auftraege); A.equal(after.manifestHash, before.manifestHash);
        A(!Object.hasOwn(after.auftraege[0], "freshnessWindow"), "Historisches Manifest bleibt unveraendert");
        A.equal(rpcBodies.length, 2); A.equal(queueRows.size, 1);
        A(rpcBodies.every(b => b.params.p_freshness_window === tag + "T00Z" && b.params.p_idempotency_key === key));
      }
    });
    await test("Leere oder widerspruechliche RPC-Quittungen bleiben in beiden Adaptern unbestaetigt", async () => {
      const job = { jobType: "source_fetch", idempotencyKey: "quittungsgrenze", freshnessWindow: "2026-11-10T00Z", payload: {} };
      for (const fn of [S.jobQueueEnqueue, S.jobQueueEnqueueMitOutbox]) {
        for (receipt of ["empty", "null-id", "invalid-id", "invalid-neu", "multiple"]) {
          const r = await fn(job); A.equal(r.verfuegbar, false, receipt + ": " + JSON.stringify(r));
        }
        receipt = "normal"; const r = await fn(job); A.equal(r.verfuegbar, true); A.equal(r.neu, false); A(r.id);
      }
    });
    console.log(`${groups}/${groups} Pending-Rotationsgruppen PASS; fuenf Zeilen, Loopback-HTTP, keine Originale/Modelle/Production.`);
  } finally { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
