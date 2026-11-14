"use strict";

// Nur neue Eingangsfaelle, vorhandene synthetische Artikelformen und echter
// Quellenhandler. Kein historischer Mengenlauf, Netz, Modell oder Datenbank.
const A = require("node:assert/strict"), crypto = require("node:crypto");
const P = require("../lib/helmut/scalable-pipeline"), D = require("../lib/helmut/dedup"),
  R = require("../lib/helmut/roh-quellenstaende"), T = require("../lib/helmut/artikel-tagesrelevanz"),
  F = require("../lib/helmut/briefing-frische"), B = require("../lib/helmut/bundestag-artikelstand");
const now = Date.parse("2026-11-14T04:00:00Z"), env = { HELMUT_SCALABLE_PIPELINE: "on" };
const args = process.argv.slice(2), nurOffene = args.length === 1 && args[0] === "--nur-offene";
A(args.length === 0 || nurOffene, "Unbekannte Auswahl darf keine Fachgruppen auslassen");
const bereitsBestanden = new Set([
  "Archiv bleibt vollstaendig gespeichert, nur geeigneter ausgewahlter Nachbar erhaelt Tagesauftrag",
  "Wiederabruf promotet historischen Bestand nicht und dupliziert keine aktuelle kostenpflichtige Arbeit",
  "Bestehender Vierzehntagehorizont bleibt unveraendert und nimmt keine Zukunft oder Abruffrische an"
]);
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
// Dieselben erfundenen Ausschussartikel wie in der Artikelkernfixture.
const item = (thema, datum) => ({ title: `Synthetischer Ausschussbericht ${thema}`,
  url: `https://example.invalid/${thema}`, sourceName: "Synthetische amtliche Quelle",
  sourceType: "official", content: "Der synthetische Ausschuss beriet einen Entwurf.",
  publishedAt: datum, retrievedAt: new Date(now).toISOString() });
const aktuell = item("arbeit", "2026-11-13T02:00:00Z"), alt = item("soziales", "2006-06-11T12:00:00Z"),
  ausserhalbAuswahl = item("umwelt", "2026-11-13T03:00:00Z");
function welt({ roh = [aktuell, alt], geladen = [aktuell, alt, ausserhalbAuswahl], art = "geteilt", modern = true } = {}) {
  const w = { archiv: new Map(), versionen: new Map(), jobs: [], calls: [], forbidden: [] };
  const fail = name => () => { w.forbidden.push(name); throw Error("Verboten: " + name); };
  w.source = { id: "synthetische-quelle", freshnessWindow: "2026-11-14T00Z",
    payload: { art, quelle: { id: "synthetisch" } } };
  w.deps = { env: modern ? env : {}, now: () => now, hardeningConfig: () => ({ enabled: false }),
    crawlAllSources: async () => ({ rawItems: roh, results: [{ ok: true, items: geladen }] }),
    persistRohdokumente: async items => {
      const rows = items.map(D.toRawDocumentRow), neu = rows.filter(r => !w.archiv.has(r.id));
      for (const row of rows) {
        if (!w.archiv.has(row.id)) w.archiv.set(row.id, structuredClone(row));
        w.versionen.set(R.standHash(row), structuredClone(row));
      }
      return { ok: true, neuIds: neu.map(r => r.id), bestaetigteIds: rows.map(r => r.id),
        quellenstaende: Object.fromEntries(rows.map(r => [r.id, R.standHash(r)])),
        quellenversionen: rows.map(r => ({ id: r.id, stand: R.standHash(r) })), fundstellenBestaetigt: true };
    }, enqueue: async job => {
      w.calls.push(structuredClone(job));
      const existing = w.jobs.find(j => j.idempotencyKey === job.idempotencyKey);
      if (existing) { existing.last_seen_window = job.freshnessWindow; return { verfuegbar: true, id: existing.id, neu: false }; }
      const saved = { ...structuredClone(job), last_seen_window: job.freshnessWindow, id: "job-" + w.jobs.length }; w.jobs.push(saved);
      return { verfuegbar: true, id: saved.id, neu: true };
    }, ladeRohdokumente: fail("Korpus"), ladeRohdokumentStaende: async (ids, staende) => {
      A.equal(ids.length, 1); const row = w.versionen.get(staende[ids[0]]);
      return row ? [structuredClone(row)] : [];
    },
    eagerUnderstanding: fail("Modell"), budget: { reserviere: fail("Modellreservierung") } };
  w.run = () => P.HANDLER.source_fetch(w.source, w.deps, { auftragsDeadlineMs: now + 120000 });
  return w;
}
let count = 0;
async function test(name, fn) {
  if (nurOffene && bereitsBestanden.has(name)) return;
  await fn(); count++; console.log("PASS " + name);
}
(async () => {
  if (nurOffene) console.log("WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT: erste drei Fachgruppen aus CI43537245306 am43282d1b; hier nur sechs offene Gruppen.");
  await test("Archiv bleibt vollstaendig gespeichert, nur geeigneter ausgewahlter Nachbar erhaelt Tagesauftrag", async () => {
    const w = welt(), r = await w.run(), row = D.toRawDocumentRow(aktuell);
    A.equal(w.archiv.size, 3); A.equal(r.rohitems, 3); A.equal(r.bestaetigtOhneTagesauftrag, 2);
    A.equal(r.verstehensAuftraege, 1); A.equal(w.jobs.length, 1);
    A.deepEqual(w.jobs[0].payload, { dokumentIds: [row.id], quellenstaende: { [row.id]: R.standHash(row) } });
    A.equal(w.jobs[0].freshnessWindow, "2026-11-14T00Z"); A.equal(w.jobs[0].tenantId, null);
    A.deepEqual(w.forbidden, []);
  });
  await test("Wiederabruf promotet historischen Bestand nicht und dupliziert keine aktuelle kostenpflichtige Arbeit", async () => {
    const roh = [alt], geladen = [alt], w = welt({ roh, geladen, art: "person-archiv" });
    w.source.freshnessWindow = "2026-11-13T00Z"; await w.run();
    const old = w.jobs[0], before = structuredClone(old);
    roh.push(aktuell); geladen.push(aktuell); w.source.payload.art = "geteilt"; w.source.freshnessWindow = "2026-11-14T00Z";
    await w.run(); const archiv = JSON.stringify([...w.archiv]); await w.run();
    A.deepEqual(old, before); A.equal(w.jobs.length, 2); A.equal(w.calls.length, 3);
    A(w.calls.slice(1).every(j => !j.payload.dokumentIds.includes(old.payload.dokumentIds[0])));
    A.equal(JSON.stringify([...w.archiv]), archiv); A.deepEqual(w.forbidden, []);
  });
  await test("Bestehender Vierzehntagehorizont bleibt unveraendert und nimmt keine Zukunft oder Abruffrische an", async () => {
    const beginn = now - F.relevanzTage(env) * 86400000;
    const check = (publishedAt, extra = {}, config = env) => T.pruefe({ ...aktuell, publishedAt, ...extra }, { jetztMs: now, env: config }).geeignet;
    A.equal(check(new Date(beginn).toISOString()), true); A.equal(check(new Date(beginn - 1).toISOString()), false);
    A.equal(check(new Date(now + 1).toISOString()), false); A.equal(check(undefined), false);
    A.equal(check("2026-02-30T00:00:00Z"), false); A.equal(check("2026-11-13T02:00:00"), false);
    A.equal(check(aktuell.publishedAt, { published_at: "2026-11-12T02:00:00Z" }), false);
    A.equal(check("2026-11-12T02:00:00Z", {}, { ...env, HELMUT_BRIEFING_RELEVANZ_TAGE: "1" }), false);
    A.equal(check("2006-06-11T12:00:00Z"), false);
  });
  await test("Gebundener Artikelstand behaelt ganzen Berliner Tag und faellt bei Widerspruch nie auf Zeitstempel zurueck", async () => {
    const url = D.canonicalizeUrl("https://www.bundestag.de/dokumente/textarchiv/2026/kw39-synthetische-beispielreform-1234567");
    const stand = tag => {
      const s = { version: B.VERSION, herkunft: B.HERKUNFT, url, titel: aktuell.title,
        publikationstag: tag, absatzHash: sha("synthetischer Leitabsatz") };
      s.standHash = B.standHashFuer(s);
      return { id: "rd-" + s.standHash, url, title: s.titel, published_at: null,
        raw: { helmutBundestagArtikelstand: s } };
    };
    A.equal(T.pruefe(stand("2026-11-13"), { jetztMs: now, env }).geeignet, true);
    A.equal(T.pruefe(stand("2026-10-01"), { jetztMs: now, env }).geeignet, false);
    A.equal(T.pruefe(stand("2026-11-14"), { jetztMs: now, env }).geeignet, false);
    const bad = stand("2026-10-01"); bad.publishedAt = aktuell.publishedAt;
    A.equal(T.pruefe(bad, { jetztMs: now, env }).geeignet, false);
    A.equal(T.pruefe({ publishedAt: "2026-11-13" }, { jetztMs: now, env }).geeignet, true);
    A.equal(T.pruefe({ publishedAt: "2026-11-14" }, { jetztMs: now, env }).geeignet, false);
  });
  await test("Explizite Archivquelle und Legacyverarbeitung behalten ihre bisherige Einreihung", async () => {
    for (const args of [{ art: "person-archiv" }, { modern: false }]) {
      const w = welt(args), r = await w.run();
      A.equal(r.bestaetigtOhneTagesauftrag, undefined);
      A(w.calls.some(j => j.payload.dokumentIds.includes(D.toRawDocumentRow(alt).id)));
      A(w.calls.some(j => j.payload.dokumentIds.includes(D.toRawDocumentRow(ausserhalbAuswahl).id)));
    }
  });
  await test("Nur bestaetigte Kandidatenversionen werden eingereiht, unklarer Enqueueausgang bleibt Fehler", async () => {
    const w = welt(), persist = w.deps.persistRohdokumente;
    w.deps.persistRohdokumente = async items => { const p = await persist(items); p.bestaetigteIds = [D.toRawDocumentRow(alt).id]; return p; };
    A.equal((await w.run()).verstehensAuftraege, 0); A.equal(w.calls.length, 0);
    const bad = welt(); bad.deps.enqueue = async () => ({ verfuegbar: false });
    await A.rejects(bad.run(), /verstehen-nicht-eingereiht/);
    const hash = welt(), persistHash = hash.deps.persistRohdokumente;
    hash.deps.persistRohdokumente = async items => { const p = await persistHash(items);
      p.quellenversionen.find(v => v.id === D.toRawDocumentRow(aktuell).id).stand = "ungueltig"; return p; };
    await A.rejects(hash.run(), /verstehen-nicht-eingereiht/);
    const partial = welt({ roh: [aktuell, ausserhalbAuswahl] }), read = partial.deps.ladeRohdokumentStaende;
    partial.deps.ladeRohdokumentStaende = async (ids, hashes) => {
      if (ids[0] === D.toRawDocumentRow(aktuell).id) throw Error("Lesung unbekannt");
      return read(ids, hashes);
    };
    await A.rejects(partial.run(), /verstehen-nicht-eingereiht/);
    A.equal(partial.calls.length, 1); A.deepEqual(partial.calls[0].payload.dokumentIds, [D.toRawDocumentRow(ausserhalbAuswahl).id]);
    const ohneStand = welt();
    ohneStand.deps.ladeRohdokumentStaende = async () => { throw Error("quellenstand-metadatenabweichung"); };
    await A.rejects(ohneStand.run(), /tageskandidat-version-fehlt/); A.deepEqual(ohneStand.calls, []);
  });
  await test("Reine Archivfunde oder leere Auswahl erzeugen keinen versteckten Tagesauftrag", async () => {
    for (const roh of [[alt], []]) {
      const w = welt({ roh, geladen: [alt] }), r = await w.run();
      A.equal(w.archiv.size, 1); A.equal(r.verstehensAuftraege, 0); A.deepEqual(w.calls, []); A.deepEqual(w.forbidden, []);
    }
  });
  await test("Gleiche URL bindet nur den passenden frischen Quellenstand und bewahrt langen RSS-Inhalt", async () => {
    const historisch = { ...alt, url: aktuell.url }, fremd = { ...aktuell, title: "Abweichende synthetische Metadaten" };
    const w = welt({ roh: [aktuell], geladen: [historisch, aktuell, fremd] }), native = w.deps.ladeRohdokumentStaende;
    w.deps.ladeRohdokumentStaende = async (ids, hashes) => {
      const rows = await native(ids, hashes);
      // Native ladeRohdokumentStaende prueft den kanonischen aktuellen Stand.
      if (!require("../lib/helmut/quellenstand-bindung").gleicherStand(D.toRawDocumentRow(aktuell), rows[0]))
        throw Error("quellenstand-metadatenabweichung");
      return rows;
    };
    await w.run();
    A.equal(D.toRawDocumentRow(historisch).id, D.toRawDocumentRow(aktuell).id);
    A.equal(w.calls.length, 1);
    A.equal(w.calls[0].payload.quellenstaende[D.toRawDocumentRow(aktuell).id], R.standHash(D.toRawDocumentRow(aktuell)));
    const text = "Der synthetische Ausschuss beriet den Entwurf und hoerte dazu mehrere sachkundige Fachleute an. ".repeat(8);
    const lang = { ...aktuell, content: text }, long = welt({ roh: [lang], geladen: [lang] });
    const persist = long.deps.persistRohdokumente;
    long.deps.persistRohdokumente = async items => {
      const p = await persist(items), row = { ...D.toRawDocumentRow(lang), summary: text.trim() }, hash = R.standHash(row);
      long.versionen.set(hash, row); p.quellenstaende[row.id] = hash; p.quellenversionen = [{ id: row.id, stand: hash }]; return p;
    };
    A.equal((await long.run()).verstehensAuftraege, 1);
    const bad = { ...D.toRawDocumentRow(lang), summary: "Ein anderer vollstaendiger Originaltext ueber eine fremde Beratung mit widersprechendem Sachverhalt." };
    A.equal(T.versionPasst({ item: lang, row: D.toRawDocumentRow(lang) }, bad, { jetztMs: now, env }), false);
    const aliasItem = { ...aktuell, url: "https://www.dgb.de/bericht", sourceName: "DGB", content: "",
      title: "Synthetischer Bericht - DGB - Deutscher Gewerkschaftsbund" };
    const aliasRow = D.toRawDocumentRow(aliasItem), aliasStand = { ...aliasRow,
      source_name: "Deutscher Gewerkschaftsbund | DGB", title: "Synthetischer Bericht - Deutscher Gewerkschaftsbund | DGB" };
    A.equal(T.versionPasst({ item: aliasItem, row: aliasRow }, aliasStand, { jetztMs: now, env }), true);
  });
  await test("Gezielte Versionslesungen bleiben sequentiell und starten nach Ablauf keine Einreihung", async () => {
    const w = welt({ roh: [aktuell, ausserhalbAuswahl] }), read = w.deps.ladeRohdokumentStaende;
    let clock = now, active = 0, max = 0, reads = 0;
    w.deps.now = () => clock;
    w.deps.ladeRohdokumentStaende = async (...args) => {
      active++; max = Math.max(max, active); reads++;
      const rows = await read(...args); active--; clock = now + 120000; return rows;
    };
    const r = await w.run(); A.equal(r.zurueckgestellt, true); A.equal(r.zeitbudgetErschoepft, true);
    A.equal(reads, 1); A.equal(max, 1); A.deepEqual(w.calls, []);
  });
  A.equal(count, nurOffene ? 6 : 9);
  console.log(`${count}/${count} ${nurOffene ? "noch offene" : "neue"} Artikel-Tagesrelevanzgruppen bestanden; keine Modelle Datenbank oder alten Tests.`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
