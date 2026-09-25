"use strict";
const A = require("node:assert/strict");
const lage = require("../lib/helmut/lage");
const render = require("./lib/briefing-ansichten");
const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const now = new Date(), fresh = new Date(now - 3600000).toISOString();
const ko = {
  id: "ko-titel", vorgang_id: "vg-titel", understanding_status: "complete",
  headline: "ERFUNDENER TITEL", display_title: "ERFUNDENER ANZEIGETITEL",
  was_ist_passiert: "ERFUNDENE RECHTSFOLGE", display_summary: "ERFUNDENER ANSPRUCH",
  warum_wichtig: "ERFUNDENE FOLGE", why_relevant: "ERFUNDENE EINORDNUNG",
  wer_ist_betroffen: "ERFUNDENE BETROFFENE", stage: "ERFUNDENER BESCHLUSS",
  handlungsempfehlung: "ERFUNDENE HANDLUNG", recommendation: "ERFUNDENE EMPFEHLUNG",
  relevanz_erklaerung: { satz: "ERFUNDENER MANDATSBEZUG", belege: [] },
  display_category: "ERFUNDENE KATEGORIE", policy_field: ["ERFUNDENES THEMA"],
  parteien: ["ERFUNDENE PARTEI"], mentioned_people: ["ERFUNDENE PERSON"],
  status: "update", updated_at: fresh, created_at: fresh,
  best_source_url: "https://example.org/pflege"
};
const doc = { id: "d-titel", title: "Pflegekosten: Was Angehörigen bleibt – Voraussetzungen und Ausnahmen beachten",
  summary: null, url: ko.best_source_url, source_name: "Testquelle", published_at: fresh };
const hinweis = "Artikelauszug fehlt; nur Quellentitel verfügbar.";
const html = card => render({ currentHelmutState: { status: "empty" }, currentRadarState: {},
  lageBriefing: { available: true, vorgaenge: [card] } }, now.toISOString()).html.lage;
let n = 0;
async function test(name, fn) { await fn(); n++; console.log("PASS " + name); }
(async () => {
  await test("Echte Karte und Detailansicht zeigen ohne Auszug keine erfundene Prosa", () => {
    const before = JSON.stringify({ ko, doc });
    const c = lage.koToVorgangCard(ko, [doc], now), out = html(c);
    A(!out.includes("ERFUNDEN")); A(out.includes(hinweis)); A(out.includes(doc.title));
    A(out.includes(doc.url)); A.equal(c.displayTitle, doc.title); A.equal(c.title, doc.title);
    A.equal(c.status, ""); A.equal(c.relevanz, null); A.deepEqual(c.parteien, []);
    A.equal(JSON.stringify({ ko, doc }), before);
  });
  await test("Leere und institutionelle Metatexte sind keine Artikelauszuege", () => {
    for (const summary of [undefined, "", "  ", "<p> </p>",
      "Das Bundesministerium ist zuständig für die deutsche Entwicklungspolitik."]) {
      const c = lage.koToVorgangCard(ko, [{ ...doc, summary }], now);
      A.equal(c.displaySummary, hinweis); A(!JSON.stringify(c).includes("ERFUNDEN"));
    }
  });
  await test("Cookie-, Zugriffs- und Login-Stoertexte schalten keine freie KO-Prosa frei", () => {
    for (const summary of [
      "Bitte akzeptieren Sie unsere Cookies, um diesen Artikel vollständig zu lesen.",
      "Zugriff verweigert – Sie haben keine Berechtigung für diese Seite.",
      "Access denied. Please enable cookies and JavaScript to continue.",
      "Jetzt anmelden oder Abonnieren Sie, um den vollständigen Artikel zu lesen. Datenschutzeinstellungen beachten."]) {
      const c = lage.koToVorgangCard(ko, [{ ...doc, summary }], now);
      A.equal(c.displaySummary, hinweis); A(!JSON.stringify(c).includes("ERFUNDEN"));
    }
  });
  await test("Kurzer, echter RSS-Kontext bleibt ein gueltiger Artikelauszug", () => {
    const short = "Der Ausschuss berät am Dienstag die Finanzierung.";
    A(short.length < 60); // Bewusst kein excerpt()-Laengenkriterium im Kartenpfad.
    const c = lage.koToVorgangCard(ko, [{ ...doc, summary: short }], now);
    A.equal(c.displaySummary, ko.display_summary); A.equal(c.displayTitle, ko.display_title);
  });
  await test("Auszug ohne oeffnenden Artikel darf fehlende Belege nicht heilen", () => {
    for (const url of ["https://example.org/", "http://example.org/text", "https://name:pass@example.org/text"]) {
      const c = lage.koToVorgangCard(ko, [doc, { ...doc, title: "FREMD", summary: "Fremder Kontext.", url }], now);
      A.equal(c.displaySummary, hinweis); A.equal(c.displayTitle, doc.title);
    }
  });
  await test("Kopierte Ueberschrift mit oder ohne Herausgebersuffix bleibt Titelbeleg", () => {
    for (const summary of [doc.title, "  " + doc.title + "  "]) {
      A.equal(lage.koToVorgangCard(ko, [{ ...doc, summary }], now).displaySummary, hinweis);
    }
    const d = { ...doc, title: doc.title + " - Testquelle", summary: doc.title };
    A.equal(lage.koToVorgangCard(ko, [d], now).displaySummary, hinweis);
  });
  await test("Vorhandener Artikelauszug behaelt den bisherigen Kartenvertrag ohne positive Faktenbehauptung", () => {
    const c = lage.koToVorgangCard(ko, [{ ...doc, summary: "Der Bericht erläutert Voraussetzungen und Ausnahmen." }], now);
    A.equal(c.displayTitle, ko.display_title); A.equal(c.displaySummary, ko.display_summary);
    A.equal(c.whyRelevant, ko.why_relevant); A.equal(c.relevanz, ko.relevanz_erklaerung);
    A.equal(c.quellenGeprueft, undefined); // Ein Auszug ist noch kein positives Sachurteil.
  });
  await test("Originaltitel bleiben vollstaendig, HTML wird durch den echten Renderer escaped", () => {
    const title = "<script>KEIN_SCRIPT</script> " + "Ausführlicher Originaltitel mit Bedingungen ".repeat(4) + "nicht beschlossen";
    const c = lage.koToVorgangCard(ko, [{ ...doc, title }], now), out = html(c);
    A.equal(c.displayTitle, title); A(!out.includes("<script>")); A(out.includes("&lt;script&gt;"));
    A(out.includes("nicht beschlossen"));
  });
  await test("cacheOnly und countOnly im echten Lagepfad begrenzen die Karte ohne Modelle oder Writes", async () => {
    const names = ["v3StoreReady", "listKnowledgeObjects", "listMatchingResults", "listAktuelleLageQuellen",
      "getSourcesForVorgang", "getRenderedBriefingV3", "saveRenderedBriefingV3", "acquirePipelineLock"];
    const old = Object.fromEntries(names.map(k => [k, storage[k]])), gen = ai.generateLageBriefing;
    let verboten = 0; const deny = () => { verboten++; throw Error("Modell/Write verboten"); };
    Object.assign(storage, { v3StoreReady: () => true, listKnowledgeObjects: async () => [ko],
      listMatchingResults: async () => [{ knowledge_object_id: ko.id }],
      listAktuelleLageQuellen: require("./fixtures/lage-quellenmetadaten")([ko], () => [doc]),
      getSourcesForVorgang: async () => [doc], getRenderedBriefingV3: async () => null,
      saveRenderedBriefingV3: deny, acquirePipelineLock: deny });
    ai.generateLageBriefing = deny;
    try {
      for (const opts of [{ cacheOnly: true }, { countOnly: true }]) {
        const r = await lage.buildLageBriefing({ id: "synthetisch-titelbeleg" }, opts);
        A.equal(r.vorgaenge.length, 1); A.equal(r.vorgaenge[0].displaySummary, hinweis);
        A(!html(r.vorgaenge[0]).includes("ERFUNDEN"));
      }
      A.equal(verboten, 0);
    } finally { Object.assign(storage, old); ai.generateLageBriefing = gen; }
  });
  console.log(`${n}/${n} Testgruppen bestanden; keine Modellaufrufe oder Production-Writes.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
