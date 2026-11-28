"use strict";

// Neue Interaktionsgrenzen: nativer Archivleser mit lokalem Transport, echter
// Source-/Diagnosehandler und vorhandener kleiner Queue-Treiber. Kein Kopieren
// der Readerlogik, SQL-/Lastnachweis, Netz, Modell oder Wiederholen alter Gruppen.
const A = require("node:assert/strict"), S = require("../lib/helmut/storage"),
  P = require("../lib/helmut/scalable-pipeline"), D = require("../lib/helmut/dedup"),
  R = require("../lib/helmut/roh-quellenstaende"), V = require("../lib/helmut/quellen-versorgungsstand");
const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");
const gebunden = require("../lib/helmut/ko-quellenfassung").bindeArchiv;
const now = Date.parse("2026-11-14T05:00:00Z"), heute = "2026-11-14T00Z";
const env = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on" };
const key = row => row.id + ":" + R.standHash(row);
const item = n => ({ title: `Synthetischer Ausschussbericht ${n}`,
  url: `https://example.invalid/bericht/${n}`, sourceName: "Synthetische amtliche Quelle", sourceType: "official",
  publishedAt: "2026-11-13T10:00:00Z", retrievedAt: new Date(now).toISOString(),
  content: "Der synthetische Ausschuss beriet einen Entwurf und hoerte mehrere sachkundige Fachleute zur Umsetzung der vorgeschlagenen Regeln an." });
function welt({ konflikte = 1, gute = 1, zeitlich = 0 } = {}) {
  const w = { items: [], kanonisch: new Map(), archiv: new Map(), forbidden: [], calls: [] };
  const fail = name => () => { w.forbidden.push(name); throw Error("Verboten: " + name); };
  for (let i = 0; i < konflikte + gute + zeitlich; i++) {
    const input = item(i), row = D.toRawDocumentRow(input);
    const canonical = i < konflikte ? { ...row, title: "Aelterer synthetischer Bericht " + i,
      source_name: "Synthetische alte Quelle", published_at: "2026-09-12T10:00:00Z", summary: null }
      : i < konflikte + zeitlich ? { ...row, published_at: "2026-09-12T10:00:00Z", summary: null }
      : row;
    w.items.push(input); w.kanonisch.set(row.id, structuredClone(canonical));
    w.archiv.set(key(canonical), structuredClone(canonical)); w.archiv.set(key(row), structuredClone(row));
  }
  w.q = erzeugeSpeicherWarteschlange({ now: () => now });
  w.readerDeps = { ladeAktuell: async ids => ids.map(id => w.kanonisch.get(id)).filter(Boolean).map(row => structuredClone(row)),
    request: async (endpoint, options) => {
      A.equal(options, undefined, "Nativer Archivleser darf nur lesen");
      const url = new URL(endpoint, "https://local.invalid");
      A.equal(url.pathname, "/rest/v1/helmut_store"); A.equal(url.searchParams.get("select"), "id,data");
      const id = url.searchParams.get("id").slice(3), match = /-rohstand-([a-f0-9]{64})-([a-f0-9]{64})$/.exec(id);
      A(match, "Nur exakte Artikelversionen lesen");
      const row = w.archiv.get("rd-" + match[1] + ":" + match[2]);
      return row ? [{ id, data: { version: 1, quellenHash: match[2], dokument: structuredClone(row) } }] : [];
    } };
  w.native = (ids, hashes) => S.ladeRohdokumentStaende(ids, hashes, w.readerDeps);
  w.source = { id: "synthetischer-quellenauftrag", freshnessWindow: heute,
    payload: { art: "geteilt", quelle: { id: "synthetische-quelle" } } };
  w.deps = { env, now: () => now, hardeningConfig: () => ({ enabled: false }),
    crawlAllSources: async () => ({ rawItems: structuredClone(w.items), results: [{ ok: true, items: structuredClone(w.items) }] }),
    persistRohdokumente: async inputs => {
      const rows = inputs.map(D.toRawDocumentRow), ids = [...new Set(rows.map(r => r.id))];
      // Bereits bestaetigter lokaler Speicherzustand. Die echte Readerpruefung
      // bekommt separat alte Canonical-Metadaten und exakte Archivversionen.
      for (const row of rows) w.archiv.set(key(row), structuredClone(row));
      const versionen = [...w.archiv.values()].filter(r => ids.includes(r.id)).map(r => ({ id: r.id, stand: R.standHash(r) }));
      return { ok: true, neuIds: [], bestaetigteIds: ids, quellenversionen: versionen,
        quellenstaende: Object.fromEntries(rows.map(r => [r.id, R.standHash(r)])), fundstellenBestaetigt: true };
    }, ladeRohdokumentStaende: w.native, ladeRohdokumente: fail("Korpus"),
    eagerUnderstanding: fail("Modell"), budget: { reserviere: fail("Modellreservierung") },
    klassen: { belege: async () => ({ erlaubt: true, slot: "synthetisch" }), gebeFrei: async () => {} },
    enqueue: async job => { w.calls.push(structuredClone(job)); return w.q.enqueue(job); } };
  w.run = () => P.HANDLER.source_fetch(w.source, w.deps, { auftragsDeadlineMs: now + 120000 });
  w.diagnosen = () => w.q.alle().filter(j => j.payload.artikelFehler === "quellenstand-versionskonflikt");
  return w;
}
async function abschliessen(w) {
  const raw = (await w.q.claim({ owner: "synthetisch", limit: 1, types: ["document_understanding"] })).auftraege[0];
  return P.fuehreAuftragAus({ auftrag: raw, besitzer: "synthetisch", deps: { ...w.deps, handler: P.HANDLER,
    ladeRohdokumentStaende: () => A.fail("Diagnose darf keine Artikelarbeit starten"), finish: w.q.finish, extendLease: w.q.extendLease } });
}
let count = 0;
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
async function test(name, fn) { if (only && !name.includes(only)) return; await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Belegte hib-Suchwege und typografische Titel bleiben eng an das amtliche Original gebunden", async () => {
    for (const [quelle, pfad, typografisch] of [["process-hib-arbeit-soziales", "rp-process-hib-arbeit-soziales", false],
      ["process-hib-arbeit-soziales", "rp-process-hib-arbeit-soziales", true], ["general-hib", "rp-general-hib", true]]) {
      const w = welt({ gute: 0 }), eingang = { ...w.items[0],
        title: 'Synthetischer Bericht zur "Vorsorge"',
        url: "https://www.bundestag.de/presse/hib/kurzmeldungen-1234",
        sourceId: "bundestag", sourceName: "Bundestag", sourceType: "bundestag", linkType: "direct",
        retrievalPathId: "rp-bundestag", publishedAt: "2026-11-13T10:06:00Z" };
      const amtlich = D.toRawDocumentRow(eingang), stand = R.standHash(amtlich);
      const fund = { ...amtlich, summary: null, source_id: quelle, source_name: "Deutscher Bundestag",
        title: (typografisch ? amtlich.title.replace('"Vorsorge"', "„Vorsorge“") : amtlich.title) + " - Deutscher Bundestag",
        published_at: "2026-11-13T10:16:10Z", quellenabrufpfad: pfad };
      delete fund.raw; // Tatsaechliche native Pfadprojektion, kein Rohobjekt.
      w.items = [eingang]; w.kanonisch.clear(); w.archiv.clear();
      w.kanonisch.set(amtlich.id, structuredClone(fund)); w.archiv.set(key(amtlich), structuredClone(amtlich));
      A.deepEqual(await w.native([amtlich.id], { [amtlich.id]: stand }), [gebunden(amtlich)]);
      const r = await w.run();
      A.equal(r.teilfehler, undefined); A.equal(r.abrufErgebnis.analyse.length, 1);
      A.equal(w.q.alle().length, 1); A.equal(w.q.alle()[0].payload.artikelFehler, undefined);
      A.deepEqual(w.kanonisch.get(amtlich.id), fund);
      for (const diff of [{ source_id: "fremde-quelle" }, { quellenabrufpfad: "rp-fremd" },
        { source_id: quelle === "general-hib" ? "process-hib-arbeit-soziales" : "general-hib" },
        { title: "Synthetischer Bericht zur anderen Vorsorge - Deutscher Bundestag" },
        { title: 'Synthetischer Bericht zur "vorsorge" - Deutscher Bundestag' },
        { title: 'Synthetischer Bericht zur „Vorsorge" - Deutscher Bundestag' },
        { source_name: "Anderer Herausgeber" }, { link_type: "indirect" },
        { url: "https://example.invalid/1234" }, { published_at: "2026-11-13T10:22:00Z" }]) {
        w.kanonisch.set(amtlich.id, { ...fund, ...diff });
        await A.rejects(w.native([amtlich.id], { [amtlich.id]: stand }), /quellenstand-metadatenabweichung/);
      }
      A.deepEqual(w.forbidden, []);
    }
  });
  await test("Belegte Verlagsaliaspaare gleichen nur den eigenen Titelsuffix auf derselben Hostautoritaet ab", async () => {
    for (const [host, katalog, alias, suffix, aliasSuffix, quelle, typ] of [
      ["www.wiwo.de", "WirtschaftsWoche", "WiWo", " - WirtschaftsWoche", " - WiWo", "news-wirtschaftswoche", "media"],
      ["www.golem.de", "Golem.de", "Golem", " - Golem.de", " - Golem", "committee-digitales", "committee"],
      ["www.deutschlandfunk.de", "Deutschlandfunk Politik", "Deutschlandfunk", "", " - Deutschlandfunk", "deutschlandfunk-politik", "media"],
      ["www.rnd.de", "RND", "RND.de", " - RND.de", " - RND.de", "news-rnd", "media"],
      ["osthessen-news.de", "OSTHESSEN|NEWS", "Osthessen|News", " - OSTHESSEN|NEWS", " - Osthessen|News", "signal-armutsbericht", "association"]
    ]) for (const richtung of [false, true]) {
      const w = welt({ gute: 0 }), rumpf = "Synthetischer Bericht zum beschlossenen Entwurf";
      const eingang = { ...w.items[0], url: "https://" + host + "/synthetischer-bericht", linkType: "direct",
        title: rumpf + (richtung ? aliasSuffix : suffix), sourceName: richtung ? alias : katalog,
        sourceId: richtung ? "synthetische-suche" : quelle, sourceType: richtung ? "media" : typ };
      const row = D.toRawDocumentRow(eingang), stand = R.standHash(row);
      const kanonisch = { ...row, title: rumpf + (richtung ? suffix : aliasSuffix),
        source_name: richtung ? katalog : alias, source_id: richtung ? quelle : "synthetische-suche",
        source_type: richtung ? typ : "media" };
      w.items = [eingang]; w.kanonisch.clear(); w.archiv.clear();
      w.kanonisch.set(row.id, structuredClone(kanonisch)); w.archiv.set(key(row), structuredClone(row));
      A.deepEqual(await w.native([row.id], { [row.id]: stand }), [gebunden(row)]);
      const r = await w.run(); A.equal(r.teilfehler, undefined); A.equal(r.abrufErgebnis.analyse.length, 1);
      A.deepEqual(w.kanonisch.get(row.id), kanonisch);
      for (const diff of [{ title: "Anderer inhaltlicher Bericht" + (richtung ? suffix : aliasSuffix) },
        { source_name: "Fremder Verlag" }, { link_type: "indirect" },
        { url: "https://example.invalid/synthetischer-bericht" }, { canonical_url: "https://example.invalid/" }]) {
        w.kanonisch.set(row.id, { ...kanonisch, ...diff });
        let error; try { await w.native([row.id], { [row.id]: stand }); } catch (e) { error = e; }
        A.equal(error?.message, "quellenstand-metadatenabweichung");
        A.equal(S.leseRohdokumentKonfliktBeleg(error)?.inhaltlichAbweichend, true);
      }
      // Eine andere Publikationszeit bleibt ein Versionskonflikt. Regel A darf
      // lediglich die gebundene Archivfassung weiterreichen, keinen Text mischen.
      w.kanonisch.set(row.id, { ...kanonisch, published_at: "2026-11-13T12:15:00Z" });
      let zeitfehler; try { await w.native([row.id], { [row.id]: stand }); } catch (e) { zeitfehler = e; }
      A.equal(zeitfehler?.message, "quellenstand-metadatenabweichung");
      A.equal(S.leseRohdokumentKonfliktBeleg(zeitfehler)?.inhaltlichAbweichend, false);
      const bindung = require("../lib/helmut/quellenstand-bindung"), metadaten = bindung.gleicheBelegteVerlagsMetadaten;
      A.equal(bindung.gleicherStand(row, kanonisch), false, "Leseralias erweitert keine kanonische Textfortschreibung");
      for (const adresse of ["http://" + host + "/synthetischer-bericht",
        "https://" + host + ".example.invalid/synthetischer-bericht",
        "https://name@" + host + "/synthetischer-bericht", "https://" + host + ":8443/synthetischer-bericht"])
        A.equal(metadaten({ ...row, url: adresse }, { ...kanonisch, url: adresse }), false);
      A.equal(metadaten({ ...row, canonical_url: "https://example.invalid/" },
        { ...kanonisch, canonical_url: "https://example.invalid/" }), false);
      const fremdeId = "rd-" + "f".repeat(64);
      A.equal(metadaten(row, { ...kanonisch, id: fremdeId }), false);
      w.kanonisch.set(row.id, { ...kanonisch, id: fremdeId });
      await A.rejects(w.native([row.id], { [row.id]: stand }), /quellenstand-metadatenabweichung/);
      if (["www.rnd.de", "osthessen-news.de"].includes(host)) {
        // Die tatsaechlichen28Nov-Metadatenpaare haben keinen gespeicherten Text.
        // Ein lesbarer Alias erfindet weder Auszug noch Originalinhalt.
        const ohneText = { ...row, summary: null }, kanonischOhneText = { ...kanonisch, summary: null };
        const textloserStand = R.standHash(ohneText);
        w.kanonisch.set(row.id, kanonischOhneText); w.archiv.set(key(ohneText), ohneText);
        const [gelesen] = await w.native([row.id], { [row.id]: textloserStand });
        A.equal(gelesen.summary, null);
        A.equal(require("../lib/helmut/quellen-auszug").hatOriginalinhalt(gelesen), false);
        A.deepEqual(w.kanonisch.get(row.id), kanonischOhneText);
      }
      A.deepEqual(w.forbidden, []);
    }
  });
  await test("Native hib-Projektion erhaelt den belegten Archivstand ohne neue Metadaten-Ausnahme", async () => {
    const w = welt({ gute: 0 });
    const amtlichesItem = { ...w.items[0], url: "https://www.bundestag.de/presse/hib/kurzmeldungen-1234",
      sourceId: "bundestag", sourceName: "Bundestag", sourceType: "bundestag", linkType: "direct",
      retrievalPathId: "rp-bundestag", publishedAt: "2026-11-13T10:06:00Z" };
    const amtlich = D.toRawDocumentRow(amtlichesItem);
    const eingang = { ...amtlichesItem, content: null, summary: null,
      sourceId: "general-hib", sourceName: "Deutscher Bundestag", retrievalPathId: "rp-general-hib",
      title: `${amtlich.title} - Deutscher Bundestag`, publishedAt: "2026-11-13T10:10:34Z" };
    const fund = D.toRawDocumentRow(eingang), stand = R.standHash(fund);
    // Genau die Form des nativen getRawDocumentsByIds-Lesers: Pfadprojektion
    // statt raw, kein erfundener zweiter Quellenbeleg.
    const projection = { ...amtlich, quellenabrufpfad: amtlich.raw.retrievalPathId };
    delete projection.raw;
    w.items = [eingang]; w.kanonisch.clear(); w.archiv.clear();
    w.kanonisch.set(amtlich.id, structuredClone(projection));
    w.archiv.set(key(fund), structuredClone(fund));
    let konflikt;
    try { await w.native([fund.id], { [fund.id]: stand }); } catch (error) { konflikt = error; }
    A.equal(konflikt?.message, "quellenstand-metadatenabweichung");
    const beleg = S.leseRohdokumentKonfliktBeleg(konflikt);
    A.equal(beleg?.inhaltlichAbweichend, false, "Vorhandener hib-Vertrag gilt auch fuer die native Pfadprojektion");
    A.deepEqual(beleg.dokument, gebunden(fund)); A.equal(beleg.stand, stand);
    const r = await w.run();
    A.equal(r.abrufErgebnis.art, "rohfassungen"); A.equal(r.teilfehler, undefined);
    A.deepEqual(r.abrufErgebnis.analyse.map(a => [a.rohId, a.stand]), [[fund.id, stand]]);
    A.equal(w.q.alle().length, 1); A.equal(w.q.alle()[0].payload.artikelFehler, undefined);
    A.deepEqual(w.kanonisch.get(amtlich.id), projection); A.deepEqual(w.forbidden, []);

    const job = w.q.alle()[0]; let gelesen;
    const result = await P.HANDLER.document_understanding(job, {
      ...w.deps, env: { ...env, HELMUT_VERSTEHEN_CAS: "on" },
      klassen: { belege: async () => ({ erlaubt: false }) },
      ladeRohdokumentStaende: async (...args) => { gelesen = args; return w.native(...args); }
    }, { auftragsDeadlineMs: now + 120000 });
    A.equal(result.grund, "klassengrenze-belegt: verstehen");
    A.deepEqual(gelesen, [[fund.id], { [fund.id]: stand }]);
    for (const diff of [{ title: "Ein anderer Bericht" }, { source_name: "Anderer Herausgeber" },
      { quellenabrufpfad: "rp-fremd" }, { published_at: "2026-11-13T10:11:00Z" }]) {
      w.kanonisch.set(amtlich.id, { ...projection, ...diff });
      let error;
      try { await w.native([fund.id], { [fund.id]: stand }); } catch (e) { error = e; }
      A.equal(S.leseRohdokumentKonfliktBeleg(error)?.inhaltlichAbweichend, true);
      await A.rejects(P.HANDLER.document_understanding(job, {
        ...w.deps, env: { ...env, HELMUT_VERSTEHEN_CAS: "on" }
      }, { auftragsDeadlineMs: now + 120000 }), /quellenstand-metadatenabweichung/);
    }
    w.kanonisch.set(amtlich.id, projection);
    w.archiv.get(key(fund)).summary = "Nicht gebundener anderer Text";
    await A.rejects(w.native([fund.id], { [fund.id]: stand }), /quellenstand-bindung/);
    A.deepEqual(w.forbidden, []);
  });
  await test("Nativer Reader lehnt weiter ab und bindet nur echten vorhandenen Versionskonflikt privat", async () => {
    const w = welt({ gute: 0 }), row = D.toRawDocumentRow(w.items[0]);
    let error;
    try { await w.native([row.id], { [row.id]: R.standHash(row) }); } catch (e) { error = e; }
    A.equal(error?.message, "quellenstand-metadatenabweichung");
    const beleg = S.leseRohdokumentKonfliktBeleg(error);
    A.equal(beleg.id, row.id); A.equal(beleg.stand, R.standHash(row)); A.deepEqual(beleg.dokument, gebunden(row));
    A.equal(Object.getOwnPropertyDescriptor(error, "quellenstandKonflikt").enumerable, false);
    A.equal(error.quellenstandKonflikt, true);
    A(!JSON.stringify(error).includes(row.summary)); A(!String(error.stack).includes(row.summary));
    const fake = Error(error.message);
    Object.defineProperty(fake, "quellenstandKonflikt", { value: error.quellenstandKonflikt, enumerable: false });
    A.equal(S.leseRohdokumentKonfliktBeleg(fake), null);
    A.equal(S.leseRohdokumentKonfliktBeleg(JSON.parse(JSON.stringify(error))), null);
    beleg.id = "Fremde Kennung"; beleg.stand = "0".repeat(64); beleg.dokument.summary = "Manipulierter Text";
    A.equal(S.leseRohdokumentKonfliktBeleg(error).id, row.id);
    A.equal(S.leseRohdokumentKonfliktBeleg(error).stand, R.standHash(row));
    A.deepEqual(S.leseRohdokumentKonfliktBeleg(error).dokument, gebunden(row));
  });
  await test("Regel A: reiner Zeitstempel-Drift wird ueber die archivierte Fassung verstanden", async () => {
    const w = welt({ konflikte: 0, zeitlich: 4 }), before = JSON.stringify([...w.kanonisch]), r = await w.run();
    A.equal(r.ok, true); A.equal(r.abrufErgebnis.art, "rohfassungen");
    A.equal(r.teilfehler, undefined); A.equal(r.grund, undefined); A.equal(r.vollstaendig, undefined);
    A.equal(w.diagnosen().length, 0); A.equal(w.q.alle().filter(j => !j.payload.artikelFehler).length, 5);
    A.equal(JSON.stringify([...w.kanonisch]), before); A.deepEqual(w.forbidden, []);
  });
  await test("Archiv mit neuem belegtem Auszug braucht seine eigene Lektüre auch ohne Originalabruf", async () => {
    const w = welt({ konflikte: 0, gute: 0, zeitlich: 1 });
    const row = D.toRawDocumentRow(w.items[0]);
    const alt = w.kanonisch.get(row.id);
    alt.summary = "Ein anderer, älterer Auszug nennt ausschließlich den ursprünglichen Entwurf.";
    const job = { ...P.einzelArtikelAuftrag({ id: row.id, stand: R.standHash(row) }), id: "synthetischer-archivauftrag" };
    let ergebnis = { status: "duplicate" };
    const deps = { ...w.deps, env: { ...env, HELMUT_VERSTEHEN_CAS: "on" }, budget: null, eagerUnderstanding: async (docs, options) => {
      A.deepEqual(docs, [gebunden(row)]); A.deepEqual(options.quellenRestDokumentIds, [row.id]);
      A.equal(options.artikelkontextVersorgung, undefined);
      return { processed: 1, counts: { [ergebnis.status]: 1 }, results: [ergebnis] };
    } };
    const ausfuehren = () => P.HANDLER.document_understanding(job, deps, { auftragsDeadlineMs: now + 120000 });
    A.equal((await ausfuehren()).zurueckgestellt, true, "Ein alter Link beweist keinen neuen Textstand");
    ergebnis = { status: "duplicate", begruendung: "eingabe-bereits-verstanden",
      promptBereitsGespeichert: true, promptDokumentIds: [row.id] };
    const r = await ausfuehren();
    A.equal(r.ok, true); A.deepEqual(r.fortschrittPayload.quellenRestDokumentIds, []);
    A.equal(w.kanonisch.get(row.id).summary, alt.summary);
    A.deepEqual(w.forbidden, []);
  });
  await test("Regel A-Verfeinerung: Titel-/Herausgeber-Abweichung bleibt ehrlich terminal unversorgt", async () => {
    const w = welt({ konflikte: 4, gute: 0 }), before = JSON.stringify([...w.kanonisch]), r = await w.run();
    A.equal(r.ok, true); A.equal(r.abrufErgebnis.art, "teilweise");
    A.equal(r.teilfehler, 4); A.equal(r.vollstaendig, false); A.equal(r.grund, "artikel-eingangsfehler");
    A.equal(w.diagnosen().length, 0);
    const diagnosen = w.q.alle().filter(j => j.payload.artikelFehler === "quellenstand-nicht-bestaetigt");
    A.equal(diagnosen.length, 4);
    A(diagnosen.every(j => j.max_attempts === 1));
    A.equal(w.q.alle().filter(j => !j.payload.artikelFehler).length, 0);
    A.equal(JSON.stringify([...w.kanonisch]), before); A.deepEqual(w.forbidden, []);
  });
  await test("Bekannte Verlagsnamen binden auf der exakten Originaladresse dieselbe Artikelfassung", async () => {
    for (const [host, quelle, name, alias, aliasImAbruf] of [
      ["www.n-tv.de", "news-ntv", "ntv", "n-tv.de", false],
      ["www.zeit.de", "news-zeit", "ZEIT Online", "DIE ZEIT", true]
    ]) {
      const w = welt({ gute: 0 });
      const eingang = { ...w.items[0], url: "https://" + host + "/synthetischer-bericht",
        sourceId: aliasImAbruf ? "thematische-suche" : quelle, sourceType: "media",
        sourceName: aliasImAbruf ? alias : name, linkType: "direct" };
      const row = D.toRawDocumentRow(eingang), stand = R.standHash(row);
      const kanonisch = { ...row, source_id: aliasImAbruf ? quelle : "thematische-suche",
        source_name: aliasImAbruf ? name : alias };
      w.items = [eingang]; w.kanonisch.set(row.id, kanonisch);
      const r = await w.run();
      A.equal(r.abrufErgebnis.art, "rohfassungen");
      A.equal(r.abrufErgebnis.analyse[0].stand, stand);
      A.deepEqual(await w.native([row.id], { [row.id]: stand }), [gebunden(row)]);
      A.deepEqual(w.kanonisch.get(row.id), kanonisch);

      for (const abweichung of [{ source_name: "Fremder Verlag" }, { title: "Anderer Bericht" },
        { url: "https://example.invalid/synthetischer-bericht" }, { canonical_url: "https://example.invalid/" },
        { link_type: "indirect" }, { published_at: "2026-11-12T10:00:00Z" }]) {
        w.kanonisch.set(row.id, { ...kanonisch, ...abweichung });
        await A.rejects(w.native([row.id], { [row.id]: stand }), /quellenstand-metadatenabweichung/);
      }
      const { gleicherStandMitVerlagsalias } = require("../lib/helmut/quellenstand-bindung");
      const website = { url: "https://example.invalid/bericht", canonical_url: "https://example.invalid/bericht" };
      A.equal(gleicherStandMitVerlagsalias({ ...row, ...website }, { ...kanonisch, ...website }), false);
      A.equal(gleicherStandMitVerlagsalias({ ...row, source_id: "suche-a" },
        { ...kanonisch, source_id: "suche-b" }), false);
    }
  });
  await test("Amtlicher hib Feedstand wird trotz zuerst gespeicherter Suchfundstelle verarbeitet", async () => {
    const w = welt({ gute: 0 });
    const eingang = { ...w.items[0], url: "https://www.bundestag.de/presse/hib/kurzmeldungen-1234",
      sourceId: "bundestag", sourceName: "Bundestag", sourceType: "bundestag", linkType: "direct",
      retrievalPathId: "rp-bundestag", publishedAt: "2026-11-13T10:06:00Z" };
    const amtlich = D.toRawDocumentRow(eingang);
    const fundstelle = { ...amtlich, source_id: "general-hib", source_name: "Deutscher Bundestag",
      quellenabrufpfad: "rp-general-hib", title: `${amtlich.title} - Deutscher Bundestag`,
      published_at: "2026-11-13T10:12:25Z", summary: null };
    A.equal(require("../lib/helmut/quellenstand-bindung").gleicherStand(amtlich, fundstelle), false);
    w.items = [eingang]; w.kanonisch.clear(); w.archiv.clear();
    w.kanonisch.set(amtlich.id, structuredClone(fundstelle));
    const r = await w.run();
    A.equal(r.abrufErgebnis.art, "rohfassungen");
    A.equal(w.diagnosen().length, 0); A.equal(r.abrufErgebnis.analyse.length, 1);
    const analyse = r.abrufErgebnis.analyse[0];
    A.equal(analyse.stand, R.standHash(amtlich));
    A.deepEqual(await w.native([amtlich.id], { [amtlich.id]: analyse.stand }), [gebunden(amtlich)]);
    A.deepEqual(w.kanonisch.get(amtlich.id), fundstelle);

    for (const abweichung of [{ quellenabrufpfad: null }, { source_id: "fremde-quelle" }, { link_type: "indirect" },
      { published_at: "2026-11-13T10:05:59Z" }, { published_at: "2026-11-13T10:22:00Z" },
      { published_at: "kein-datum" }, { url: "https://example.invalid/1234" }, { title: "Anderer Titel" }]) {
      w.kanonisch.set(amtlich.id, { ...fundstelle, ...abweichung });
      await A.rejects(w.native([amtlich.id], { [amtlich.id]: analyse.stand }), /quellenstand-metadatenabweichung/);
    }
  });
  await test("Regel A: archivierte Fassung wird als normaler Verstehensauftrag eingereiht statt als Diagnose", async () => {
    const w = welt({ konflikte: 0, zeitlich: 1, gute: 0 }); const r = await w.run();
    A.equal(r.ok, true); A.equal(r.verstehenNeu, 1);
    A.equal(w.diagnosen().length, 0); A.equal(w.q.alle().length, 1);
    A.equal(w.q.alle()[0].payload.artikelFehler, undefined);
    A.equal(w.q.alle()[0].payload.dokumentIds[0], D.toRawDocumentRow(w.items[0]).id);
    A.deepEqual(w.forbidden, []);
  });
  await test("Der Verstehensworker übernimmt nur eine exakt belegte Archivfassung bei Metadaten-Drift", async () => {
    const w = welt({ konflikte: 0, zeitlich: 1, gute: 0 });
    await w.run();
    const job = w.q.alle()[0], row = D.toRawDocumentRow(w.items[0]);
    let klassenpruefungen = 0;
    const verstehen = (deps = {}) => P.HANDLER.document_understanding(job, {
      ...w.deps, env: { ...env, HELMUT_VERSTEHEN_CAS: "on" },
      klassen: { belege: async klasse => {
        A.equal(klasse, "verstehen");
        klassenpruefungen++;
        return { erlaubt: false };
      } },
      ...deps
    }, { auftragsDeadlineMs: now + 120000 });
    A.equal((await verstehen()).grund, "klassengrenze-belegt: verstehen");

    const canonical = w.kanonisch.get(row.id);
    w.kanonisch.set(row.id, { ...canonical, title: "Anderer Artikel" });
    await A.rejects(verstehen(), /quellenstand-metadatenabweichung/);
    w.kanonisch.set(row.id, canonical);

    w.archiv.delete(key(row));
    await A.rejects(verstehen(), /quellenstand-nicht-verfuegbar/);
    A.equal(klassenpruefungen, 1);
    A.deepEqual(w.forbidden, []);
  });
  await test("Fehlende Canonical Lesung Archivbindung oder gefaelschter Konflikt bleiben UNKNOWN", async () => {
    for (const art of ["missing", "read", "archive", "hash", "duplicate", "columns", "title-null", "title-empty", "date", "fake", "fake-persist"]) {
      const w = welt(), row = D.toRawDocumentRow(w.items[0]), native = w.native, lesen = w.readerDeps.ladeAktuell;
      if (art === "missing") w.kanonisch.delete(row.id);
      if (art === "read") w.readerDeps.ladeAktuell = ids => ids.includes(row.id) ? Promise.reject(Error("Unbekannte Lesung")) : lesen(ids);
      if (art === "archive" || art === "hash") {
        const request = w.readerDeps.request;
        w.readerDeps.request = async (...args) => {
          const rows = await request(...args);
          if (rows[0]?.data?.dokument?.id === row.id) {
            if (art === "archive") return [];
            rows[0].data.dokument.summary = "Anderer nicht bestaetigter Originaltext.";
          }
          return rows;
        };
      }
      if (art === "duplicate") w.readerDeps.ladeAktuell = async ids => {
        const rows = await lesen(ids); return ids.includes(row.id) ? [...rows, structuredClone(rows[0])] : rows;
      };
      if (art === "columns") delete w.kanonisch.get(row.id).title;
      if (art === "title-null") w.kanonisch.get(row.id).title = null;
      if (art === "title-empty") w.kanonisch.get(row.id).title = " ";
      if (art === "date") w.kanonisch.get(row.id).published_at = "kaputt";
      if (art === "fake") w.deps.ladeRohdokumentStaende = (ids, hashes) => {
        if (!ids.includes(row.id)) return native(ids, hashes);
        const error = Error("quellenstand-metadatenabweichung");
        Object.defineProperty(error, "quellenstandKonflikt", { value: { id: row.id, stand: R.standHash(row), dokument: row } });
        throw error;
      };
      // Der fruehere "text"-Fall (anderer persistierter Volltext fuer dieselbe ID) ist
      // unter der Verfeinerung keine UNKNOWN-Sperre mehr: eine inhaltliche Abweichung
      // wird ehrlich terminal quellenstand-nicht-bestaetigt (siehe eigener Test oben).
      if (art === "fake-persist") {
        const persist = w.deps.persistRohdokumente;
        w.deps.persistRohdokumente = async inputs => {
          const p = await persist(inputs);
          p.bestaetigteIds = p.bestaetigteIds.filter(id => id !== row.id);
          p.quellenversionen = p.quellenversionen.filter(v => v.id !== row.id);
          delete p.quellenstaende[row.id];
          p.artikelFehler = [{ id: row.id, stand: R.standHash(row), grund: "quellenstand-versionskonflikt" }];
          return p;
        };
      }
      await A.rejects(w.run(), /verstehen-nicht-eingereiht/);
      A.equal(w.diagnosen().length, 0); A.equal(w.q.alle().filter(j => !j.payload.artikelFehler).length, 1);
      A.deepEqual(w.forbidden, []);
    }
  });
  await test("Bestaetigter Konflikt verdeckt keinen zusaetzlichen unbekannten Speicherzustand", async () => {
    const w = welt({ konflikte: 0, zeitlich: 2 }), fehlend = D.toRawDocumentRow(w.items[1]); w.kanonisch.delete(fehlend.id);
    await A.rejects(w.run(), /verstehen-nicht-eingereiht/);
    A.equal(w.diagnosen().length, 0);
    A.equal(w.q.alle().filter(j => !j.payload.artikelFehler).length, 2);
  });
  await test("Brauchbare Version derselben ID wird verstanden, inkompatible Nebenvariante bleibt terminal", async () => {
    const w = welt({ konflikte: 0, gute: 1 }), row = D.toRawDocumentRow(w.items[0]);
    w.items.push({ ...w.items[0], title: "Aeltere synthetische Nebenvariante", publishedAt: "2026-11-12T10:00:00Z" });
    const r = await w.run();
    A.equal(r.teilfehler, 1); A.equal(w.diagnosen().length, 0);
    const gute = w.q.alle().filter(j => !j.payload.artikelFehler);
    A.equal(gute.length, 1);
    A.equal(gute[0].payload.quellenstaende[row.id], R.standHash(row));
    A.equal(w.q.alle().filter(j => j.payload.artikelFehler === "quellenstand-nicht-bestaetigt").length, 1);
  });
  // Regel A (24.11.2026) hat den Diagnose-Auftrag `quellenstand-versionskonflikt`
  // ersetzt: die archivierte Fassung wird verstanden statt als Eingangsfehler
  // verworfen. Die früheren Diagnose-Pfade (ACK-Robustheit, getrennte Konfliktstände,
  // Wiederbeobachtungsfenster der Diagnose) entfallen damit.
    if (!only) A.equal(count, 14);
  console.log(`${count}/${count} neue Artikel-Versionskonfliktgruppen bestanden; keine Modelle Datenbank oder alten Tests.`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
