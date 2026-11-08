"use strict";

// Der echte regulaere Pending-Einstieg bis zum abgefangenen Modelladapter.
// Vorhandene Originalfixtures, Fake-REST und Modellattrappe; kein echter Abruf.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const L = require("../lib/helmut/artikelkontext-lauf"), U = require("../lib/helmut/understanding");
const B = require("../lib/helmut/artikelkontext-beschaffung"), A = require("../lib/helmut/artikelkontext");
const G = require("../lib/helmut/artikelkontext-gewinnung"), S = require("../lib/helmut/artikelkontext-belegspeicher");
const D = require("../lib/helmut/dedup"), C = require("../lib/helmut/crawler");
const Gate = require("../lib/helmut/quellenarchitektur/understanding-gate");
const zeit = "2026-11-08T08:00:00.000Z", jetzt = Date.parse(zeit);
const fixture = name => fs.readFileSync(path.join(__dirname, "fixtures/inhaltsversorgung-20261108", name), "utf8");
const dgbUrl = "https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/dritte-tarifrunde-im-gebaeudereiniger-handwerk-endet-ohne-ergebnis/";
const radioUrl = "https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen";
const feed = C.parseRssItems(fs.readFileSync(path.join(__dirname, "fixtures/quelleninhalt-20261107/dgb-google.xml"), "utf8"))[0];
const dgb = { ...D.toRawDocumentRow(C.normalizeRawItem({ ...feed, url: dgbUrl, originalUrl: feed.url },
  { id: "dgb", name: "DGB", type: "association", url: "https://news.google.com/rss/search?q=site:dgb.de" })), source_name: "DGB" };
const radio = D.toRawDocumentRow({ title: "Sozialverband warnt vor Altersarmut in Niedersachsen - Radio Hannover",
  sourceName: "Radio Hannover", sourceType: "media", linkType: "direct", url: radioUrl, publishedAt: "2026-11-06T11:11:24Z" });
const quellen = prompt => prompt.split("\n").filter(line => line.startsWith('{"quelle_id":')).map(JSON.parse);
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const cachekey = (doc, einstieg) => hash(JSON.stringify([einstieg ? "artikelkontext-einstieg-v2" : "artikelkontext-abruf-v1", doc.id, A.quellenstandHash(doc)]));

function umgebung(doc) {
  const p = { rows: new Map(), rest: [], original: 0, prompts: [], hashes: [], budget: 0, starts: 0, gespeichert: 0, freigaben: 0, links: [] };
  const speicher = S.erzeugeBelegspeicher({ storeId: "pending-bestand", request: async (endpoint, opts = {}) => {
    p.rest.push({ endpoint, method: opts.method || "GET" });
    assert.equal(opts.method, undefined, "Pending darf keinen Artikelbeleg reservieren oder schreiben");
    const id = new URL(endpoint, "https://local.invalid").searchParams.get("id").slice(3);
    return p.rows.has(id) ? [{ id, data: structuredClone(p.rows.get(id)) }] : [];
  } });
  const original = B.beschaffeArtikelkontext;
  const beschaffe = (d, opts, deps) => original(d, opts, { ...deps, speicher,
    fetchUrl: async () => { p.original++; throw Error("Originalabruf im Pending verboten"); } });
  const seed = (d = doc, einstieg = true, html = fixture(d.url === dgbUrl ? "dgb-artikel.html" : "radio-hannover.html")) => {
    const result = (einstieg ? G.gewinneArtikelEinstieg : G.gewinneArtikelkontext)(d, { body: html, finalUrl: d.url, gelesenAm: zeit });
    assert.equal(result.ok, true, result.reason);
    const key = cachekey(d, einstieg);
    const row = { version: 1, schluessel: key, versuchId: "11111111-2222-4333-8444-555555555555",
      reserviertAm: zeit, zustand: "belegt", abgeschlossenAm: zeit, beleg: result.beleg };
    p.rows.set("pending-bestand-artikelkontext-" + key, row);
    return result.beleg;
  };
  const vertrag = {
    reserviere: async args => { p.hashes.push(args.eingabeHash); return { erlaubt: true, fencing: 1 }; },
    modellstart: async () => { p.starts++; return { erlaubt: true }; }, schreibrecht: async () => ({ erlaubt: true }),
    speichere: async () => { p.gespeichert++; return { gespeichert: true, pruefbar: true }; },
    freigabe: async () => { p.freigaben++; }, freigabeOhneAufruf: async () => ({ ok: true }),
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {}
  };
  const deps = { enabled: () => true, aiEnabled: () => true,
    acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
    listPending: async () => [{ id: "ko-pending-bestand", vorgang_id: "vg-pending-bestand", status: "pending" }],
    listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [] }),
    listVorgangDocuments: async () => [doc], getExisting: async () => null, findVorgangCandidates: async () => [],
    verstehenVertrag: () => vertrag, gateMode: () => "on", priorityEnabled: () => false,
    canSpend: async () => { p.budget++; return { allowed: true }; },
    requestUnderstanding: async prompt => {
      p.prompts.push(prompt);
      return { headline: "Isolierter Pending-Test", was_ist_passiert: "Deklarierte Modellattrappe", warum_wichtig: "Test", wer_ist_betroffen: "Test",
        parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "mittel", handlungsempfehlung: "Test", confidence_score: 70,
        display_title: "Isolierter Pending-Test", display_summary: "Deklarierte Modellattrappe", why_relevant: "", recommendation: "", display_category: "" };
    },
    save: async () => { throw Error("Unbedingtes Schreiben verboten"); }, saveSources: async (id, docs) => { p.links.push({ id, docs }); },
    markFailed: async () => {}, modelName: () => "isolierte-pending-attrappe", logSkip: () => {},
    deadlineMs: jetzt + 300000, budgetMs: 240000 };
  const run = async (aenderungen = {}) => {
    B.beschaffeArtikelkontext = beschaffe;
    try { return await L.runPendingUnderstandingShadow([], { ...deps, ...aenderungen }); }
    finally { B.beschaffeArtikelkontext = original; }
  };
  return { p, seed, vertrag, deps, run };
}
const tests = [];
const test = (name, run) => tests.push([name, run]);
const ohneModell = p => {
  assert.equal(p.prompts.length, 0); assert.equal(p.budget, 0); assert.equal(p.starts, 0); assert.equal(p.hashes.length, 0);
  assert.equal(p.original, 0); assert(p.rest.every(r => r.method === "GET"));
};

test("DGB association: gespeicherter Einstieg erreicht echten Pending-Modelladapter quellengebunden", async () => {
  const before = structuredClone(dgb), s = umgebung(dgb), beleg = s.seed();
  const result = await s.run();
  assert.equal(result.counts.saved, 1, JSON.stringify(result)); assert.equal(s.p.rest.length, 2);
  assert.equal(s.p.original, 0); assert.equal(s.p.prompts.length, 1); assert.equal(s.p.gespeichert, 1);
  assert.equal(quellen(s.p.prompts[0])[0].artikelkontext.text, beleg.text);
  assert.equal(beleg.text.length, 1256); assert(beleg.text.endsWith("Die Friedenspflicht endet am 31. Dezember dieses Jahres."));
  assert.deepEqual(dgb, before); assert.equal(dgb.summary, null);
});
test("Radio-Bestand ist vor dem Titelgate verfuegbar und bleibt ueber spaetere Pending-Einstiege stabil", async () => {
  const s = umgebung(radio), beleg = s.seed();
  const original = Gate.assessCluster; let gateAufrufe = 0;
  Gate.assessCluster = (docs, opts) => {
    gateAufrufe++; assert(docs[0].summary.includes(beleg.text), "Bestandstext muss vor dem Titelgate vorliegen");
    return original(docs, opts);
  };
  try {
    assert.equal((await s.run()).counts.saved, 1);
    assert.equal((await s.run()).counts.saved, 1);
  } finally { Gate.assessCluster = original; }
  assert.equal(gateAufrufe, 2);
  assert.equal(s.p.original, 0); assert.equal(s.p.rest.length, 4);
  assert.equal(s.p.prompts[0], s.p.prompts[1]); assert.equal(s.p.hashes[0], s.p.hashes[1]);
  assert.equal(quellen(s.p.prompts[0])[0].artikelkontext.text, beleg.text);
  assert.equal(beleg.text.length, 727); assert(beleg.text.includes("Ab 2027 könnten die Leistungen deutlich gekürzt werden."));
});
test("Alter v1-Beleg bleibt lesbar ohne Wechsel der Eingabe oder neuen Abruf", async () => {
  const doc = D.toRawDocumentRow({ title: "Bahnkonferenz beschliesst neue Strecken", url: "https://example.org/konferenz",
    sourceName: "Synthetisches Testmedium", sourceType: "media", linkType: "direct", publishedAt: "2026-11-06T11:11:24Z" });
  const text = "Die Bahnkonferenz beschliesst neue Strecken und fordert die Bundesregierung auf, weitere Mittel im Haushalt bereitzustellen.";
  const data = { "@type": "NewsArticle", headline: doc.title, mainEntityOfPage: doc.url, articleBody: text };
  const html = `<html><head><link rel="canonical" href="${doc.url}"><meta property="og:title" content="${doc.title}">`
    + `<script type="application/ld+json">${JSON.stringify(data)}</script></head><body><article><p>${text}</p></article></body></html>`;
  const s = umgebung(doc), beleg = s.seed(doc, false, html);
  assert.equal((await s.run()).counts.saved, 1); assert.equal(s.p.rest.length, 1); assert.equal(s.p.original, 0);
  assert.equal(beleg.gewinnung.verfahren, "artikel-absatz-titel-v1");
  assert.equal(quellen(s.p.prompts[0])[0].artikelkontext.text, text);
});
test("Fehlender Originalbestand bleibt ehrliche Luecke vor Gate, CAS und Modell", async () => {
  const s = umgebung(dgb), result = await s.run();
  assert.equal(result.counts["skipped-artikelkontext"], 1); assert.equal(result.results[0].reason, "nur-bestand");
  assert.equal(s.p.rest.length, 2); assert.equal(s.p.rows.size, 0); ohneModell(s.p);
});
test("Zwei nackte Promptquellen mit nur einem vorhandenen Beleg bleiben ohne Modell und Verknuepfung offen", async () => {
  const s = umgebung(dgb); s.seed();
  const docs = [dgb, radio], before = structuredClone(docs);
  assert.equal(quellen(U.buildUnderstandingPrompt({ documents: docs })).length, 2);
  const result = await s.run({ listVorgangDocuments: async () => docs });
  assert.equal(result.counts["skipped-artikelkontext"], 1);
  assert.equal(result.results[0].reason, "mehrere-artikelkontexte");
  assert.equal(s.p.rest.length, 0); assert.equal(s.p.links.length, 0); assert.equal(s.p.gespeichert, 0);
  ohneModell(s.p); assert.deepEqual(docs, before);
});
test("Ein gueltiger Beleg und eine vollstaendige RSS-Quelle duerfen gemeinsam verstanden werden", async () => {
  const s = umgebung(dgb), beleg = s.seed();
  const rss = { ...radio, summary: "Die Bundesregierung hat am Mittwoch einen Gesetzentwurf beschlossen. "
    + "Der Bundestag soll ueber die Finanzierung beraten und dazu die Gewerkschaften anhoeren. "
    + "Die Laender sollen zusaetzliche Mittel fuer die Umsetzung erhalten und die zustaendigen Ministerien legen dem Ausschuss im Dezember ihren gemeinsamen Bericht vor." };
  const docs = [dgb, rss], before = structuredClone(docs);
  const result = await s.run({ listVorgangDocuments: async () => docs });
  assert.equal(result.counts.saved, 1, JSON.stringify(result));
  assert.equal(s.p.original, 0); assert.equal(s.p.rest.length, 2); assert.equal(s.p.prompts.length, 1);
  const byId = new Map(quellen(s.p.prompts[0]).map(q => [q.quelle_id, q]));
  assert.equal(byId.size, 2); assert.equal(byId.get(dgb.id).artikelkontext.text, beleg.text);
  assert.equal(byId.get(rss.id).artikelkontext, undefined); assert(byId.get(rss.id).auszug);
  assert.equal(s.p.links.length, 1); assert.equal(s.p.links[0].docs.length, 2); assert.deepEqual(docs, before);
});
test("Abweichender Quellenstand und manipulierter Beleg erlauben keinen Titel-Fallback", async () => {
  for (const mode of ["quelle", "beleg"]) {
    const s = umgebung(dgb); s.seed();
    if (mode === "quelle") s.deps.listVorgangDocuments = async () => [{ ...dgb, source_name: "Fremde Quelle" }];
    else [...s.p.rows.values()][0].beleg.text += " Deklarierte Manipulation.";
    const result = await s.run();
    assert.equal(result.counts["skipped-artikelkontext"], 1, mode); ohneModell(s.p);
  }
});
test("Nichtdirektes Ziel ohne Inhalt wird ohne neuen Abruf und Modell zurueckgestellt", async () => {
  const s = umgebung({ ...radio, link_type: "redirect" }), result = await s.run();
  assert.equal(result.results[0].reason, "artikelziel-nicht-bestaetigt"); assert.equal(s.p.rest.length, 0); ohneModell(s.p);
});
test("Vorhandener vollstaendiger RSS-Inhalt braucht keinen separaten Artikelcache", async () => {
  const summary = "Die Bundesregierung hat am Mittwoch einen Gesetzentwurf beschlossen. "
    + "Der Bundestag soll ueber die Finanzierung beraten und dazu die Gewerkschaften anhoeren. "
    + "Die Laender sollen zusaetzliche Mittel fuer die Umsetzung erhalten und die zustaendigen Ministerien legen dem Ausschuss im Dezember ihren gemeinsamen Bericht vor.";
  assert(summary.length > 240);
  const s = umgebung({ ...dgb, summary }), result = await s.run();
  assert.equal(result.counts.saved, 1, JSON.stringify(result)); assert.equal(s.p.rest.length, 0); assert.equal(s.p.original, 0);
  assert.equal(quellen(s.p.prompts[0])[0].artikelkontext, undefined);
});
test("CAS und absolute Restzeit begrenzen auch den lesenden Pending-Anschluss", async () => {
  const s = umgebung(dgb); s.seed();
  const noCas = await s.run({ verstehenVertrag: () => null });
  assert.equal(noCas.results[0].reason, "cas-erforderlich"); assert.equal(s.p.rest.length, 0); ohneModell(s.p);
  const kurz = await s.run({ deadlineMs: jetzt + 60000, budgetMs: 240000 });
  assert.equal(kurz.results[0].reason, "restzeit-vor-beleglesung"); assert.equal(s.p.rest.length, 0); ohneModell(s.p);
});
test("Modellbudget und CAS-Ausgang bleiben trotz bestaetigtem Bestand verbindlich", async () => {
  for (const mode of ["budget", "ausgang"]) {
    const s = umgebung(dgb); s.seed();
    if (mode === "ausgang") s.vertrag.reserviere = async () => ({ erlaubt: false, grund: "ausgang-unbekannt" });
    const result = await s.run(mode === "budget" ? { canSpend: async () => ({ allowed: false }) } : {});
    assert.equal(result.results[0].status, mode === "budget" ? "skipped-budget" : "skipped-ausgang-unbekannt");
    assert.equal(s.p.prompts.length, 0); assert.equal(s.p.starts, 0); assert.equal(s.p.original, 0);
  }
});
test("Defaultflag bleibt aus und ein gelieferter globaler Bestandsanschluss bleibt erhalten", async () => {
  const callback = Object.assign(async () => ({ angefordert: false }), { nurBestand: true });
  const deps = { artikelkontextVersorgung: callback, deadlineMs: jetzt + 300000, budgetMs: 70000 };
  assert.equal(L.mitArtikelkontext(deps, {}, {}, { nurBestand: true }).artikelkontextVersorgung, callback);
  const plain = {};
  assert.equal(L.mitArtikelkontext(plain, {}, {}, { nurBestand: true }), plain);
  const original = U.runPendingUnderstandingShadow, flag = process.env.HELMUT_ARTIKELKONTEXT;
  delete process.env.HELMUT_ARTIKELKONTEXT;
  try {
    U.runPendingUnderstandingShadow = async (docs, options) => {
      assert.equal(options, plain); return "inaktiv";
    };
    assert.equal(await L.runPendingUnderstandingShadow([], plain), "inaktiv");
  } finally { U.runPendingUnderstandingShadow = original; process.env.HELMUT_ARTIKELKONTEXT = flag; }
});

(async () => {
  const vorher = { artikel: process.env.HELMUT_ARTIKELKONTEXT, anbieter: process.env.HELMUT_ANBIETER_STEUERUNG }, originalNow = Date.now;
  process.env.HELMUT_ARTIKELKONTEXT = "on"; process.env.HELMUT_ANBIETER_STEUERUNG = "on";
  Date.now = () => jetzt;
  try {
    for (const [name, run] of tests) { await run(); console.log("PASS " + name); }
    console.log(`${tests.length}/${tests.length} Pending-Bestandsgruppen bestanden; 0 echte API-Aufrufe.`);
  } finally {
    Date.now = originalNow;
    for (const [key, value] of [["HELMUT_ARTIKELKONTEXT", vorher.artikel], ["HELMUT_ANBIETER_STEUERUNG", vorher.anbieter]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
